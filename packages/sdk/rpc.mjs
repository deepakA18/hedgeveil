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
    constructor(config, {fetchImpl = globalThis.fetch, timeout_ms = 15000, fallback_urls = [], now = Date.now} = {}) {
        this.config = configuration(config);
        this.fetch = fetchImpl;
        this.timeout = timeout_ms;
        if(!Array.isArray(fallback_urls)||fallback_urls.length>3)fail('INVALID_RPC_URL');
        this.urls=[...new Set([config.rpc_url,...fallback_urls.map(rpc_url=>configuration({...config,rpc_url}).rpc_url)])];
        this.now=now;this.cooldowns=new Map();this.identityChecks=new Map();
    }
    async raw(url,method,params) {
        try {
            if((this.cooldowns.get(url)??0)>this.now())fail('RPC_UNAVAILABLE');
            const response = await this.fetch(url, {
                method:'POST', headers:{'content-type':'application/json'},
                body:JSON.stringify({jsonrpc:'2.0', id:'hedgeveil', method, params}),
                signal:AbortSignal.timeout(this.timeout)
            });
            if(response.status===429){
                const retry=response.headers?.get('retry-after'),delay=retry&&/^\d+(\.\d+)?$/.test(retry)?Number(retry)*1000:Date.parse(retry??'')-this.now();
                this.cooldowns.set(url,this.now()+(Number.isFinite(delay)?Math.max(60000,delay):60000));
                await response.body?.cancel();fail('RPC_UNAVAILABLE');
            }
            if (!response.ok) fail('RPC_UNAVAILABLE');
            const data = await response.json();
            if(data.error?.code===-429||data.error?.code===429)this.cooldowns.set(url,this.now()+60000);
            if (data.error || !Object.hasOwn(data, 'result')) fail('RPC_UNAVAILABLE');
            return data.result;
        } catch { fail('RPC_UNAVAILABLE'); }
    }
    async request(method, params = {}) {
        // Failover is strictly read-only. Wallet submission and UNKNOWN handling
        // never acquire retry permission from a transport error.
        const urls=['status','block','chunk','query','gas_price','tx'].includes(method)?this.urls:[this.config.rpc_url];
        for(const [i,url]of urls.entries()){
            try{
                if(i>0){
                    if(!this.identityChecks.has(url))this.identityChecks.set(url,this.raw(url,'status',{}).finally(()=>this.identityChecks.delete(url)));
                    const s=await this.identityChecks.get(url);
                    if(s.chain_id!==this.config.chain_id||s.genesis_hash!==this.config.genesis_hash)fail('DEPLOYMENT_MISMATCH');
                    if(method==='status')return s;
                }
                return await this.raw(url,method,params);
            }catch{ /* Another configured read provider may be available. */ }
        }
        fail('RPC_UNAVAILABLE');
    }
    async view(method, args = {}, blockHash) {
        const raw = await this.request('query', {
            request_type:'call_function', ...(blockHash ? {block_id:blockHash} : {finality:'final'}), account_id:this.config.contract_id,
            method_name:method, args_base64:Buffer.from(JSON.stringify(args)).toString('base64')
        });
        if (blockHash && raw.block_hash !== blockHash) fail('VIEW_BLOCK_MISMATCH');
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
