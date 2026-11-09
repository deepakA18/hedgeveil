// Browser-portable Wallet Selector v10 boundary. No key loading or success inference.
import {buildIntent, fields, fail} from './intent.mjs';
import {hash32} from './rpc.mjs';

export function walletSelectorSigner({selector, actionCreators, returnUrl}) {
    return async function sign(request) {
        try {
            // Copy before awaiting a wallet so callers cannot change an open prompt's intent.
            const r = structuredClone(request);
            fields(r, ['signerId','receiverId','network','operationId','actions']);
            if (!Array.isArray(r.actions) || r.actions.length !== 1) fail('WALLET_ACTIONS');
            const a = r.actions[0];
            fields(a, ['type','methodName','args','deposit','gas']);
            if (a.type !== 'FunctionCall') fail('WALLET_ACTIONS');
            const intent = buildIntent({network:r.network, contract_id:r.receiverId, signer_id:r.signerId,
                operation_id:r.operationId, method:a.methodName, args:a.args, attached_deposit:a.deposit});
            if (a.gas !== intent.gas) fail('WALLET_GAS');
            const state = () => {
                if (selector.options.network.networkId !== r.network) fail('WALLET_NETWORK');
                const s = selector.store.getState();
                if (!s.selectedWalletId || s.accounts.filter(x => x.active).length !== 1 ||
                    !s.accounts.some(x => x.active && x.accountId === r.signerId)) fail('WALLET_ACCOUNT');
                return s.selectedWalletId;
            };
            const walletId = state(), wallet = await selector.wallet(walletId);
            const accounts = await wallet.getAccounts();
            if (wallet.id !== walletId || !accounts.some(x => x.accountId === r.signerId) || state() !== walletId) fail('WALLET_CHANGED');
            const params = {signerId:r.signerId, receiverId:r.receiverId,
                // The official factory accepts bytes; encode with web APIs instead of
                // its object overload, which requires a global Node Buffer polyfill.
                actions:[actionCreators.functionCall(a.methodName, new TextEncoder().encode(JSON.stringify(a.args)), BigInt(a.gas), BigInt(a.deposit))]};
            if (returnUrl !== undefined) {
                const url = new URL(returnUrl), here = globalThis.location;
                if (!here || url.origin !== here.origin || url.username || url.password ||
                    !(url.protocol === 'https:' || url.protocol === 'http:' && url.hostname === '127.0.0.1')) fail('WALLET_RETURN_ORIGIN');
                url.search = ''; url.searchParams.set('hv_operation', r.operationId);
                params.callbackUrl = url.href;
            }
            const result = await wallet.signAndSendTransaction(params);
            // Redirecting wallets may return nothing. Neither that nor an exception proves cancellation.
            if (result === undefined) return;
            if (result?.transaction?.signer_id !== r.signerId || result?.transaction?.receiver_id !== r.receiverId) fail('WALLET_RESPONSE');
            return {hash:hash32(result.transaction.hash)};
        } catch (error) {
            // Wallet extensions may include secrets in exceptions; expose only our stable codes.
            const codes = new Set(['WALLET_ACTIONS','WALLET_GAS','WALLET_NETWORK','WALLET_ACCOUNT','WALLET_CHANGED','WALLET_RETURN_ORIGIN','WALLET_RESPONSE',
                'NETWORK_DISABLED','TESTNET_VAULT_DISABLED','INVALID_FIELDS','UNSUPPORTED_METHOD','QUOTE_DOMAIN_OR_PROFILE']);
            fail(codes.has(error?.code) ? error.code : 'WALLET_RESPONSE_UNAVAILABLE');
        }
    };
}

export function walletReturn(url, operationId) {
    if (!/^[a-f0-9]{64}$/.test(operationId)) fail('INVALID_OPERATION_ID');
    const params = new URL(url).searchParams;
    if (params.getAll('hv_operation').length !== 1 || params.get('hv_operation') !== operationId ||
        params.has('errorCode') || params.has('errorMessage') || params.getAll('transactionHashes').length !== 1) fail('WALLET_RETURN_UNRESOLVED');
    // Only one exact transaction was authorized. A redirect is a recovery hint, never success.
    return {operation_id:operationId, hash:hash32(params.get('transactionHashes'))};
}
