import {Q, fail, uint} from './amounts.mjs';
export {Q, ClientError, fail, uint, parseNear, formatNear} from './amounts.mjs';
export function canonical(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isSafeInteger(value))) return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    }
    fail('NON_JSON_VALUE');
}
export function fields(value, names) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...names].sort().join('|')) fail('INVALID_FIELDS');
}
export function account(id) {
    if (typeof id !== 'string' || id.length < 2 || id.length > 64 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id)) fail('INVALID_ACCOUNT');
    return id;
}
function identifier(id) {
    if (typeof id !== 'string' || id.length > 32 || !/^[a-z](?:[a-z0-9_-]*[a-z0-9])?$/.test(id)) fail('INVALID_ID');
}
function asset(value) {
    fields(value, value?.kind === 'COLLATERAL' ? ['kind'] : ['kind', 'series_id']);
    if (value.kind === 'COLLATERAL') return;
    if (!['P', 'N'].includes(value.kind)) fail('UNSUPPORTED_ASSET');
    identifier(value.series_id);
}
function legs(values, max = 9, zero = false) {
    if (!Array.isArray(values) || values.length < 1 || values.length > max) fail('INVALID_LEGS');
    const seen = new Set(), series = new Set();
    for (const leg of values) {
        fields(leg, ['asset', 'amount']);
        asset(leg.asset);
        uint(leg.amount, 128, !zero);
        const id = canonical(leg.asset);
        if (seen.has(id)) fail('DUPLICATE_ASSET');
        seen.add(id);
        if (leg.asset.series_id) series.add(leg.asset.series_id);
    }
    return series;
}
function quote(q, domain) {
    fields(q, ['kind', 'schema_version', 'domain', 'maker', 'taker', 'maker_gives', 'taker_gives', 'fee', 'fill_rule', 'rounding', 'nonce', 'cancellation_epoch', 'expiry_ns', 'signing_key_id', 'signature_scheme', 'signature']);
    if (q.kind !== 'quote' || q.schema_version !== '0.2.0' || canonical(q.domain) !== canonical(domain) ||
        q.fill_rule !== 'ALL_OR_NOTHING' || q.rounding !== 'EXACT_AMOUNTS' || q.signature_scheme !== 'ed25519') fail('QUOTE_DOMAIN_OR_PROFILE');
    account(q.maker);
    if (q.taker !== null) account(q.taker);
    legs(q.maker_gives, 4);
    legs(q.taker_gives, 4);
    legs([...q.maker_gives, ...q.taker_gives], 8);
    fields(q.fee, ['asset', 'amount', 'receiver']);
    if (q.fee.asset !== 'NATIVE_NEAR' || uint(q.fee.amount) > Q / 100n) fail('QUOTE_FEE');
    account(q.fee.receiver);
    if (uint(q.nonce, 64) > 255n) fail('QUOTE_NONCE');
    uint(q.cancellation_epoch, 64);
    uint(q.expiry_ns, 64, true);
    identifier(q.signing_key_id);
    if (!/^[0-9a-f]{128}$/.test(q.signature)) fail('INVALID_SIGNATURE_ENCODING');
}
export const METHODS = Object.freeze({ cancel_quote: 'QUOTE_CANCELLED', advance_quote_epoch: 'QUOTE_EPOCH_ADVANCED', revoke_signing_key: 'SIGNING_KEY_REVOKED', storage_deposit: 'STORAGE_DEPOSIT', deposit_collateral: 'DEPOSIT', split: 'SPLIT', merge: 'MERGE', transfer: 'TRANSFER', redeem: 'REDEEMED', fill_quote: 'QUOTE_FILLED', vault_mint_basket: 'VAULT_MINTED', vault_redeem_in_kind: 'VAULT_EXITED', request_withdrawal: 'WITHDRAWAL_REQUESTED', close_ticket: 'TICKET_CLOSED' });
const operationId = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export function buildIntent({ signer_id, contract_id, network = 'sandbox', method, args, attached_deposit, storage_deposit, operation_id = operationId() }) {
    account(signer_id);
    account(contract_id);
    if (!['sandbox', 'testnet'].includes(network)) fail('NETWORK_DISABLED');
    if (!Object.hasOwn(METHODS, method))
        fail('UNSUPPORTED_METHOD');
    if (network === 'testnet' && method.startsWith('vault_')) fail('TESTNET_VAULT_DISABLED');
    if (!/^[0-9a-f]{64}$/.test(operation_id))
        fail('INVALID_OPERATION_ID');
    if (attached_deposit === undefined) {
        if (['storage_deposit', 'deposit_collateral'].includes(method))
            fail('FUNDING_AMOUNT_REQUIRED');
        attached_deposit = '1';
    }
    if (storage_deposit !== undefined) {
        if (method !== 'deposit_collateral') fail('STORAGE_BATCH_METHOD');
        if (uint(storage_deposit, 128, true) >= uint(attached_deposit, 128, true)) fail('STORAGE_BATCH_AMOUNT');
    }
    const domain = { protocol_version: '1', network, contract_id };
    switch (method) {
        case 'storage_deposit':
        case 'deposit_collateral':
            fields(args, []);
            uint(attached_deposit, 128, true);
            break;
        case 'split':
        case 'merge':
            fields(args, ['series_id', 'amount']);
            identifier(args.series_id);
            uint(args.amount, 128, true);
            break;
        case 'transfer':
            fields(args, ['asset', 'amount', 'receiver']);
            asset(args.asset);
            uint(args.amount, 128, true);
            account(args.receiver);
            if (args.receiver === signer_id)
                fail('SELF_TRANSFER');
            break;
        case 'redeem':
            fields(args, ['series_id', 'leg', 'amount']);
            identifier(args.series_id);
            if (!['P', 'N'].includes(args.leg))
                fail('INVALID_LEG');
            uint(args.amount, 128, true);
            break;
        case 'fill_quote':
            fields(args, ['quote']);
            quote(args.quote, domain);
            if (args.quote.taker !== null && args.quote.taker !== signer_id)
                fail('WRONG_TAKER');
            break;
        case 'vault_mint_basket':
        case 'vault_redeem_in_kind': {
            const k = method === 'vault_mint_basket' ? 'max_inputs' : 'min_outputs';
            fields(args, ['vault_id', 'shares', k]);
            identifier(args.vault_id);
            uint(args.shares, 128, true);
            if (legs(args[k], 9, k === 'min_outputs').size > 4)
                fail('SERIES_CAP');
            break;
        }
        case 'request_withdrawal':
            fields(args, ['amount', 'receiver']);
            uint(args.amount, 128, true);
            account(args.receiver);
            break;
        case 'cancel_quote':
            fields(args, ['nonce']);
            if (uint(args.nonce, 64) > 255n) fail('QUOTE_NONCE');
            break;
        case 'advance_quote_epoch':
            fields(args, ['epoch']);
            uint(args.epoch, 64, true);
            break;
        case 'revoke_signing_key':
            fields(args, ['key_id']);
            identifier(args.key_id);
            break;
        case 'close_ticket':
            fields(args, ['ticket_id']);
            uint(args.ticket_id, 64);
            break;
    }
    if (!['storage_deposit', 'deposit_collateral'].includes(method) && attached_deposit !== '1')
        fail('ONE_YOCTO_REQUIRED');
    return JSON.parse(canonical({ kind: 'transaction', schema_version: '0.2.0', operation_id, domain, signer_id, method, args, attached_deposit, ...(storage_deposit === undefined ? {} : {storage_deposit}), gas: '250000000000000' }));
}
// The journal envelope additionally retains signer/gas; the public wire intent does not.
export function toWireIntent(intent) {
    const checked = buildIntent({ ...intent, network: intent.domain.network, contract_id: intent.domain.contract_id });
    if (canonical(checked) !== canonical(intent))
        fail('INVALID_INTENT');
    const { signer_id, gas, ...wire } = checked;
    return wire;
}

// Only the first-deposit pair is supported; this is not arbitrary batching.
export function intentActions(intent) {
    if (intent.storage_deposit !== undefined) return [
        {type:'FunctionCall',methodName:'storage_deposit',args:{},deposit:intent.storage_deposit,gas:'50000000000000'},
        {type:'FunctionCall',methodName:'deposit_collateral',args:{},deposit:String(uint(intent.attached_deposit)-uint(intent.storage_deposit)),gas:'200000000000000'}
    ];
    return [{type:'FunctionCall',methodName:intent.method,args:structuredClone(intent.args),deposit:intent.attached_deposit,gas:intent.gas}];
}
