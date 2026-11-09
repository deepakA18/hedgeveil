import {fail, account, fields, canonical} from './intent.mjs';

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
    let n = BigInt('0x' + Buffer.from(bytes).toString('hex')), text = '';
    while (n) { text = alphabet[Number(n % 58n)] + text; n /= 58n; }
    let zeros = 0;
    for (const b of bytes) { if (b) break; zeros++; }
    return '1'.repeat(zeros) + text;
}
export function hash32(value) {
    if (typeof value !== 'string' || value.length > 44 || value.length < 32) fail('INVALID_HASH');
    let n = 0n;
    for (const c of value) {
        const i = alphabet.indexOf(c);
        if (i < 0) fail('INVALID_HASH');
        n = n * 58n + BigInt(i);
    }
    const zeros = value.match(/^1*/)[0].length;
    const bytes = n === 0n ? 0 : Math.ceil(n.toString(16).length / 2);
    if (zeros + bytes !== 32) fail('INVALID_HASH');
    return value;
}
export function configuration(config) {
    fields(config, ['rpc_url', 'network', 'chain_id', 'genesis_hash', 'contract_id', 'code_hash']);
    const url = new URL(config.rpc_url);
    if (!['sandbox', 'testnet'].includes(config.network)) fail('NETWORK_DISABLED');
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('INVALID_RPC_URL');
    if (config.network === 'sandbox' && (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')) fail('LOCAL_SANDBOX_ONLY');
    if (config.network === 'testnet' && url.protocol !== 'https:') fail('TESTNET_HTTPS_REQUIRED');
    account(config.contract_id);
    hash32(config.genesis_hash);
    hash32(config.code_hash);
    if (typeof config.chain_id !== 'string' || !config.chain_id ||
        (config.network === 'testnet' ? config.chain_id !== 'testnet' : ['mainnet','testnet'].includes(config.chain_id))) fail('INVALID_CHAIN');
    return Object.freeze(structuredClone(config));
}
export function binding(config) {
    const {rpc_url, ...identity} = config;
    return identity;
}
export class Rpc {
    constructor(config, {fetchImpl = globalThis.fetch, timeout_ms = 15000} = {}) {
        this.config = configuration(config);
        this.fetch = fetchImpl;
        this.timeout = timeout_ms;
    }
    async request(method, params = {}) {
        try {
            const response = await this.fetch(this.config.rpc_url, {
                method:'POST', headers:{'content-type':'application/json'},
                body:JSON.stringify({jsonrpc:'2.0', id:'hedgeveil', method, params}),
                signal:AbortSignal.timeout(this.timeout)
            });
            if (!response.ok) fail('RPC_UNAVAILABLE');
            const data = await response.json();
            if (data.error || !Object.hasOwn(data, 'result')) fail('RPC_UNAVAILABLE');
            return data.result;
        } catch { fail('RPC_UNAVAILABLE'); }
    }
    async view(method, args = {}) {
        const raw = await this.request('query', {
            request_type:'call_function', finality:'final', account_id:this.config.contract_id,
            method_name:method, args_base64:Buffer.from(JSON.stringify(args)).toString('base64')
        });
        try { return JSON.parse(Buffer.from(raw.result).toString()); }
        catch { fail('INVALID_RPC_VIEW'); }
    }
    async verify() {
        const c = this.config;
        const [status, code, identity] = await Promise.all([
            this.request('status'),
            this.request('query', {request_type:'view_account', finality:'final', account_id:c.contract_id}),
            this.view('deployment_identity')
        ]);
        if (status.chain_id !== c.chain_id || status.genesis_hash !== c.genesis_hash || code.code_hash !== c.code_hash ||
            canonical(identity) !== canonical({protocol_version:'1', network:c.network, contract_id:c.contract_id})) fail('DEPLOYMENT_MISMATCH');
    }
}
