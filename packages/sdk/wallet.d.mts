import type {Signer} from './index.mjs';
export interface SelectorBoundary<Action> {
    options: {network: {networkId: string}};
    store: {getState(): {selectedWalletId: string | null; accounts: Array<{accountId: string; active: boolean}>}};
    wallet(id?: string): Promise<{
        id: string;
        getAccounts(): Promise<Array<{accountId: string}>>;
        signAndSendTransaction(params: {signerId: string; receiverId: string; actions: Action[]; callbackUrl?: string}): Promise<unknown>;
    }>;
}
export function walletSelectorSigner<Action>(options: {
    selector: SelectorBoundary<Action>;
    actionCreators: {functionCall(method: string, args: object, gas: bigint, deposit: bigint): Action};
    returnUrl?: string;
}): Signer;
/** An untrusted hint to remember/recover against the retained operation; never transaction success. */
export function walletReturn(url: string, operationId: string): {operation_id: string; hash: string};
