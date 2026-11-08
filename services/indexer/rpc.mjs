import {account, fields, fail} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';

export function configuration(input) {
    const c=structuredClone(input);
    if(c.network!=='sandbox'||typeof c.chain_id!=='string'||!c.chain_id||['mainnet','testnet'].includes(c.chain_id))fail('LOCAL_SANDBOX_ONLY');
    hash32(c.genesis_hash);hash32(c.anchor_hash);
    if(!Array.isArray(c.rpc_urls)||c.rpc_urls.length<1||c.rpc_urls.length>4)fail('RPC_CONFIGURATION');
    for(const value of c.rpc_urls) {
        const u=new URL(value);
        if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('LOCAL_SANDBOX_ONLY');
    }
    if(!Array.isArray(c.contracts)||c.contracts.length<1||c.contracts.length>8)fail('CONTRACT_CONFIGURATION');
    const ids=new Set();
    for(const x of c.contracts) {
        account(x.account_id);hash32(x.code_hash);
        if(!['core','oracle'].includes(x.kind)||ids.has(x.account_id))fail('CONTRACT_CONFIGURATION');ids.add(x.account_id);
    }
    fields(c.postgres,['host','port','user','password','database']);
    if(c.postgres?.host!=='127.0.0.1'||!Number.isInteger(c.postgres.port)||c.postgres.port<1||c.postgres.port>65535||typeof c.postgres.database!=='string'||typeof c.postgres.user!=='string'||typeof c.postgres.password!=='string')fail('LOCAL_POSTGRES_ONLY');
    c.schema??='hv_indexer';if(!/^hv_[a-z0-9_]{1,40}$/.test(c.schema))fail('SCHEMA_NAME');
    for(const [k,def,min,max] of [['max_blocks',2000,1,10000],['max_events',20000,1,100000],['max_lag_blocks',64,0,10000],['timeout_ms',15000,100,60000],['stale_after_ms',30000,100,300000],['poll_ms',1000,100,60000],['api_port',8787,0,65535]]) {
        c[k]??=def;if(!Number.isSafeInteger(c[k])||c[k]<min||c[k]>max)fail('CONFIGURATION_BOUNDS');
    }
    return c;
}
export function binding(c) {
    return {version:1,network:c.network,chain_id:c.chain_id,genesis_hash:c.genesis_hash,anchor_hash:c.anchor_hash,contracts:[...c.contracts].sort((a,b)=>a.account_id.localeCompare(b.account_id))};
}
export class ReadRpc {
    constructor(config,{fetchImpl=globalThis.fetch}={}) {this.config=config;this.fetch=fetchImpl;this.failures=0;this.failovers=0;}
    async raw(url,method,params) {
        try {
            const r=await this.fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'indexer',method,params}),signal:AbortSignal.timeout(this.config.timeout_ms)});
            const data=await r.json();if(!r.ok||data.error||!Object.hasOwn(data,'result'))fail('RPC_UNAVAILABLE');return data.result;
        }catch{fail('RPC_UNAVAILABLE');}
    }
    async request(method,params={}) {
        if(!['status','block','chunk','tx','query'].includes(method))fail('READ_ONLY_RPC');
        for(const [i,url] of this.config.rpc_urls.entries()) {
            try {
                const status=await this.raw(url,'status',{});
                if(status.chain_id!==this.config.chain_id||status.genesis_hash!==this.config.genesis_hash)fail('RPC_IDENTITY');
                const value=method==='status'?status:await this.raw(url,method,params);
                if(i>0)this.failovers++;return value;
            }catch{this.failures++;}
        }
        fail('RPC_UNAVAILABLE_OR_MISMATCH');
    }
    async view(contract,method,args,block_hash) {
        const r=await this.request('query',{request_type:'call_function',block_id:block_hash,account_id:contract,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
        if(r.block_hash!==block_hash)fail('VIEW_BLOCK_MISMATCH');
        try{return JSON.parse(Buffer.from(r.result).toString());}catch{fail('INVALID_VIEW');}
    }
    async snapshot(contract,block,makers=[]) {
        const id=contract.account_id,hash=block.header.hash;
        const native=await this.request('query',{request_type:'view_account',block_id:hash,account_id:id});
        if(native.block_hash!==hash||native.code_hash!==contract.code_hash)fail('DEPLOYMENT_MISMATCH');
        const view=(m,a={})=>this.view(id,m,a,hash);
        const identity=await view(contract.kind==='core'?'deployment_identity':'indexer_status');
        if(identity.network!=='sandbox'||identity.contract_id!==id)fail('DEPLOYMENT_MISMATCH');
        if(contract.kind==='core'&&identity.protocol_version!=='1')fail('DEPLOYMENT_MISMATCH');
        const base={contract:id,kind:contract.kind,block_hash:hash,identity,native};
        if(contract.kind==='core') {
            const [ids,series,vault,roll,custody,pauses]=await Promise.all([view('list_accounts',{from_index:0,limit:16}),view('list_series',{from_index:0,limit:16}),view('get_vault'),view('get_vault_roll'),view('custody_snapshot'),view('get_pauses')]);
            const accounts=Object.fromEntries(await Promise.all(ids.map(async account_id=>[account_id,await view('get_account',{account_id})])));
            const tickets=(await Promise.all(ids.map(account_id=>view('list_tickets',{account_id,from_index:0,limit:16})))).flat();
            const markets=Object.fromEntries(await Promise.all(makers.map(async maker=>[maker,await view('get_market',{maker})])));
            return {...base,accounts,series,vault,roll,custody,pauses,tickets,markets};
        }
        const [ids,series,tickets,custody]=await Promise.all([view('list_accounts'),view('list_series'),view('list_tickets'),view('custody')]);
        const accounts=Object.fromEntries(await Promise.all(ids.map(async account_id=>[account_id,await view('get_account',{account_id})])));
        const cases=await Promise.all(series.map(series_id=>view('get_case',{series_id})));
        const observations=Object.fromEntries(await Promise.all(series.map(async series_id=>[series_id,{PRIMARY:await view('get_observation',{series_id,route:'PRIMARY'}),FALLBACK:await view('get_observation',{series_id,route:'FALLBACK'})}])));
        return {...base,accounts,cases,tickets,custody,observations};
    }
}
