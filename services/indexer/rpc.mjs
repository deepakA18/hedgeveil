import {account, fields, fail} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';
import {NeardataHeaders} from './neardata.mjs';

export function configuration(input) {
    const c=structuredClone(input);
    if(!['sandbox','testnet'].includes(c.network))fail('NETWORK_DISABLED');
    if(typeof c.chain_id!=='string'||!c.chain_id||
        (c.network==='testnet'?c.chain_id!=='testnet':['mainnet','testnet'].includes(c.chain_id)))fail('CHAIN_CONFIGURATION');
    hash32(c.genesis_hash);hash32(c.anchor_hash);
    if(!Array.isArray(c.rpc_urls)||c.rpc_urls.length<1||c.rpc_urls.length>4)fail('RPC_CONFIGURATION');
    for(const value of c.rpc_urls) {
        const u=new URL(value);
        if(u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('RPC_CONFIGURATION');
        if(c.network==='sandbox'&&(u.protocol!=='http:'||u.hostname!=='127.0.0.1'))fail('LOCAL_SANDBOX_ONLY');
        if(c.network==='testnet'&&u.protocol!=='https:')fail('TESTNET_HTTPS_REQUIRED');
    }
    if(!Array.isArray(c.contracts)||c.contracts.length<1||c.contracts.length>8)fail('CONTRACT_CONFIGURATION');
    c.transaction_filter??='all';
    if(c.discovery_source!==undefined&&(c.discovery_source!=='neardata-testnet'||c.network!=='testnet'||c.transaction_filter!=='canonical-journal'||c.header_source))fail('DISCOVERY_SOURCE_CONFIGURATION');
    if(c.discovery_required!==undefined&&(typeof c.discovery_required!=='boolean'||!c.discovery_source))fail('DISCOVERY_SOURCE_CONFIGURATION');
    if(c.header_source!==undefined&&(c.header_source!=='neardata-testnet'||c.network!=='testnet'))fail('HEADER_SOURCE_CONFIGURATION');
    if(!['all','watched-roots','journal-roots','canonical-journal'].includes(c.transaction_filter))fail('TRANSACTION_FILTER');
    const ids=new Set();
    for(const x of c.contracts) {
        account(x.account_id);hash32(x.code_hash);
        if(!['core','oracle','external_oracle'].includes(x.kind)||ids.has(x.account_id))fail('CONTRACT_CONFIGURATION');ids.add(x.account_id);
    }
    fields(c.postgres,['host','port','user','password','database']);
    if(c.postgres?.host!=='127.0.0.1'||!Number.isInteger(c.postgres.port)||c.postgres.port<1||c.postgres.port>65535||typeof c.postgres.database!=='string'||typeof c.postgres.user!=='string'||typeof c.postgres.password!=='string')fail('LOCAL_POSTGRES_ONLY');
    c.schema??='hv_indexer';if(!/^hv_[a-z0-9_]{1,40}$/.test(c.schema))fail('SCHEMA_NAME');
    for(const [k,def,min,max] of [['request_interval_ms',c.network==='testnet'?250:0,0,60000],['read_concurrency',4,1,16],['max_blocks',2000,1,10000],['max_events',20000,1,100000],['max_lag_blocks',64,0,10000],['timeout_ms',15000,100,60000],['stale_after_ms',30000,100,300000],['poll_ms',1000,100,60000],['api_port',8787,0,65535]]) {
        c[k]??=def;if(!Number.isSafeInteger(c[k])||c[k]<min||c[k]>max)fail('CONFIGURATION_BOUNDS');
    }
    return c;
}
export function binding(c) {
    return {version:1,network:c.network,chain_id:c.chain_id,genesis_hash:c.genesis_hash,anchor_hash:c.anchor_hash,...(c.transaction_filter&&c.transaction_filter!=='all'?{transaction_filter:c.transaction_filter}:{}),contracts:[...c.contracts].sort((a,b)=>a.account_id.localeCompare(b.account_id))};
}
export class ReadRpc {
    constructor(config,{fetchImpl=globalThis.fetch,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {this.config=config;this.fetch=fetchImpl;this.now=now;this.sleep=sleep;this.nextStart=0;this.cooldowns=new Map();this.failures=0;this.failovers=0;this.pendingStatus=new Map();if(config.header_source)this.headers=new NeardataHeaders({fetchImpl,now,sleep});}
    status(url){
        if(!this.pendingStatus.has(url))this.pendingStatus.set(url,this.raw(url,'status',{}).finally(()=>this.pendingStatus.delete(url)));
        return this.pendingStatus.get(url);
    }
    async batch(work){
        if(this.batchStatus)fail('RPC_BATCH_ACTIVE');
        this.batchStatus=new Map();this.batchUsed=new Set();
        try{
            const result=await work();
            // No projection may commit until every provider used in this read
            // batch is rechecked. Writes never use this read-only batching API.
            for(const url of this.batchUsed){
                const s=await this.raw(url,'status',{});
                if(s.chain_id!==this.config.chain_id||s.genesis_hash!==this.config.genesis_hash)fail('RPC_IDENTITY');
            }
            return result;
        }finally{this.batchStatus=null;this.batchUsed=null;}
    }
    async raw(url,method,params) {
        try {
            if((this.cooldowns.get(url)??0)>this.now())fail('RPC_COOLDOWN');
            const start=Math.max(this.now(),this.nextStart);
            this.nextStart=start+(this.config.request_interval_ms??0);
            if(start>this.now())await this.sleep(start-this.now());
            // A concurrent request may have received 429 while this one waited.
            if((this.cooldowns.get(url)??0)>this.now())fail('RPC_COOLDOWN');
            const r=await this.fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'indexer',method,params}),signal:AbortSignal.timeout(this.config.timeout_ms)});
            if(r.status===429){
                const retry=r.headers?.get('retry-after');
                const delay=retry&&/^\d+(\.\d+)?$/.test(retry)?Number(retry)*1000:Date.parse(retry??'')-this.now();
                const until=this.now()+(Number.isFinite(delay)?Math.max(1000,delay):60000);
                this.cooldowns.set(url,Math.max(this.cooldowns.get(url)??0,until));
                await r.body?.cancel();fail('RPC_RATE_LIMITED');
            }
            const data=await r.json();if(data.error?.code===-429||data.error?.code===429){this.cooldowns.set(url,Math.max(this.cooldowns.get(url)??0,this.now()+60000));fail('RPC_RATE_LIMITED');}if(r.ok&&method==='tx'&&data.error?.cause?.name==='UNKNOWN_TRANSACTION'&&data.error.cause.info?.requested_transaction_hash===params.tx_hash)fail('RPC_TRANSACTION_UNKNOWN');if(!r.ok||data.error||!Object.hasOwn(data,'result'))fail('RPC_UNAVAILABLE');return data.result;
        }catch(e){if(e.code==='RPC_TRANSACTION_UNKNOWN')throw e;fail('RPC_UNAVAILABLE');}
    }
    async request(method,params={}, {canonical=false}={}) {
        if(!['status','block','chunk','tx','query'].includes(method))fail('READ_ONLY_RPC');
        const immutable=method==='block'&&params.block_id!==undefined||method==='chunk'||method==='tx';
        const key=JSON.stringify([canonical?'canonical-'+method:method,params]);
        if(immutable&&this.cache){const hit=await this.cache.get(key);if(hit!==undefined)return hit;}
        if(!canonical&&this.headers&&method==='block'&&Number.isSafeInteger(params.block_id)){
            try{
                const value=await this.headers.block(params.block_id);
                if(this.cache)await this.cache.put(key,value);
                return value;
            }catch{ /* Unavailable height hints fall back to identity-pinned RPC. */ }
        }
        let unknown=0;
        for(const [i,url] of this.config.rpc_urls.entries()) {
            try {
                if(this.batchStatus&&!this.batchStatus.has(url)){
                    const batch=this.batchStatus;
                    const pending=this.status(url).catch(e=>{if(batch.get(url)===pending)batch.delete(url);throw e;});
                    batch.set(url,pending);
                }
                const status=await (this.batchStatus?.get(url)??this.status(url));
                if(status.chain_id!==this.config.chain_id||status.genesis_hash!==this.config.genesis_hash)fail('RPC_IDENTITY');
                const value=method==='status'?status:await this.raw(url,method,params);
                if(immutable&&this.cache){
                    const matched=method==='block'?(typeof params.block_id==='number'?value.header?.height===params.block_id:value.header?.hash===params.block_id):method==='chunk'?value.header?.chunk_hash===params.chunk_id:value.transaction?.hash===params.tx_hash&&value.final_execution_status==='FINAL';
                    if(matched)await this.cache.put(key,value);
                }
                this.batchUsed?.add(url);if(i>0)this.failovers++;return value;
            }catch(e){if(e.code==='RPC_TRANSACTION_UNKNOWN'){unknown++;this.batchUsed?.add(url);}this.failures++;this.lastFailure={method,url,...(params.block_id!==undefined?{block_id:params.block_id}:{}),...(params.chunk_id?{chunk_id:params.chunk_id}:{}),...(params.tx_hash?{tx_hash:params.tx_hash}:{})};}
        }
        if(unknown===this.config.rpc_urls.length)fail('RPC_TRANSACTION_UNKNOWN');
        fail('RPC_UNAVAILABLE_OR_MISMATCH');
    }
    async view(contract,method,args,block_hash) {
        const r=await this.request('query',{request_type:'call_function',block_id:block_hash,account_id:contract,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
        if(r.block_hash!==block_hash)fail('VIEW_BLOCK_MISMATCH');
        try{return JSON.parse(Buffer.from(r.result).toString());}catch{fail('INVALID_VIEW');}
    }
    async snapshot(contract,block,makers=[]) {
        const id=contract.account_id,hash=block.header.hash;
        const view=(m,a={})=>this.view(id,m,a,hash);
        const [native,identity]=await Promise.all([
            this.request('query',{request_type:'view_account',block_id:hash,account_id:id}),
            view(contract.kind==='core'?'deployment_identity':'indexer_status')
        ]);
        if(native.block_hash!==hash||native.code_hash!==contract.code_hash)fail('DEPLOYMENT_MISMATCH');
        if(identity.network!==this.config.network||identity.contract_id!==id)fail('DEPLOYMENT_MISMATCH');
        if(contract.kind==='core'&&identity.protocol_version!=='1')fail('DEPLOYMENT_MISMATCH');
        const base={contract:id,kind:contract.kind,block_hash:hash,identity,native};
        if(contract.kind==='core') {
            const [ids,series,vault,roll,custody,pauses]=await Promise.all([view('list_accounts',{from_index:0,limit:16}),view('list_series',{from_index:0,limit:16}),view('get_vault'),view('get_vault_roll'),view('custody_snapshot'),view('get_pauses')]);
            const [accountRows,ticketRows,marketRows]=await Promise.all([
                Promise.all(ids.map(async account_id=>[account_id,await view('get_account',{account_id})])),
                Promise.all(ids.map(account_id=>view('list_tickets',{account_id,from_index:0,limit:16}))),
                Promise.all(makers.map(async maker=>[maker,await view('get_market',{maker})]))
            ]);
            const accounts=Object.fromEntries(accountRows),tickets=ticketRows.flat(),markets=Object.fromEntries(marketRows);
            return {...base,accounts,series,vault,roll,custody,pauses,tickets,markets};
        }
        if(contract.kind==='external_oracle'){
            const state=await view('get_snapshot');
            const cases=Object.values(state.cases).map(c=>({...c,state:c.price!==null?'FINALIZED':BigInt(block.header.timestamp_nanosec)>=BigInt(c.config.maturity_ns)?'RESOLUTION_DELAYED':'OPEN'}));
            return {...base,state,cases,tickets:[],accounts:{}};
        }
        const [ids,series,tickets,custody]=await Promise.all([view('list_accounts'),view('list_series'),view('list_tickets'),view('custody')]);
        const accounts=Object.fromEntries(await Promise.all(ids.map(async account_id=>[account_id,await view('get_account',{account_id})])));
        const cases=await Promise.all(series.map(series_id=>view('get_case',{series_id})));
        const observations=Object.fromEntries(await Promise.all(series.map(async series_id=>[series_id,{PRIMARY:await view('get_observation',{series_id,route:'PRIMARY'}),FALLBACK:await view('get_observation',{series_id,route:'FALLBACK'})}])));
        return {...base,accounts,cases,tickets,custody,observations};
    }
}
