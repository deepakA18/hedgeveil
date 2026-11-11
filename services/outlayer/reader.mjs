// Read-only feasibility integration. No signer, paid API key or settlement output.
import {fail} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';
export const ASSET='wrap.near';
export const PRICE_SCALE='1000000000000';
export const PRICE_ID='c415de8d2efa7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750';
export const SOURCE_COMMIT='888ae663803209e5689892d671657331852428f8';
const MAX=(1n<<128n)-1n,MAX64=(1n<<64n)-1n;
const uint=(v,max=MAX)=>{if(typeof v!=='string'||! /^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>max)fail('INVALID_ORACLE_INTEGER');return BigInt(v);};

export function normalizePrice(price){
    if(!price||!Number.isInteger(price.decimals)||price.decimals<0||price.decimals>38)fail('INVALID_ORACLE_PRICE');
    let n=uint(price.multiplier);if(!n)fail('NONPOSITIVE_ORACLE_PRICE');
    if(price.decimals<=12)n*=10n**BigInt(12-price.decimals);
    else{const divisor=10n**BigInt(price.decimals-12);if(n%divisor)fail('ORACLE_PRECISION_LOSS');n/=divisor;}
    if(!n||n>MAX)fail('ORACLE_PRICE_OVERFLOW');return String(n);
}

// Report timestamps are on-chain ingestion times, not independently verified
// venue observation times. Even a fresh report is NEVER settlement-eligible.
export function assessPrices(data,asset,{now_ns,max_age_ns='60000000000',asset_id=ASSET}={}){
    const result={asset_id,price_scale:PRICE_SCALE,settlement_eligible:false,settlement_blocker:'HISTORICAL_OBSERVATION_PROOF_REQUIRED'};
    try{
        const now=uint(now_ns,MAX64),maxAge=uint(max_age_ns,MAX64);if(!maxAge)fail('INVALID_MAX_AGE');
        const responseTime=uint(data?.timestamp,MAX64);if(responseTime>now)fail('FUTURE_RESPONSE_TIMESTAMP');
        if(!Array.isArray(data.prices)||data.prices.length!==1||data.prices[0].asset_id!==asset_id)fail('ORACLE_ASSET_MISMATCH');
        // recency_duration_sec and responseTime are NOT proof of sample freshness.
        if(data.prices[0].price===null)return {...result,state:'PRICE_UNAVAILABLE',price:null};
        const price=normalizePrice(data.prices[0].price);
        if(!Array.isArray(asset?.reports)||!asset.reports.length)fail('REPORT_TIMESTAMPS_MISSING');
        const ids=new Set(),eligible=[];
        for(const r of asset.reports){
            if(typeof r.oracle_id!=='string'||ids.has(r.oracle_id))fail('DUPLICATE_ORACLE_REPORT');ids.add(r.oracle_id);
            const stamp=uint(r.timestamp,MAX64);if(stamp>now)fail('FUTURE_REPORT_TIMESTAMP');
            const p=normalizePrice(r.price);if(now-stamp<=maxAge)eligible.push({stamp,price:p});
        }
        if(!eligible.length)return {...result,state:'STALE_REPORTS',price:null};
        // Require every report inside the consumer's age bound to agree with the
        // returned price. This intentionally rejects ambiguous aggregation rather
        // than guessing which reports/median the deployed version used.
        if(eligible.some(r=>r.price!==price))fail('AGGREGATION_UNVERIFIED');
        const oldest=eligible.reduce((a,b)=>a<b.stamp?a:b.stamp,eligible[0].stamp);
        return {...result,state:'RECENT_REPORT_ONLY',price,oldest_report_ns:String(oldest),report_age_ns:String(now-oldest)};
    }catch(e){return {...result,state:'REJECTED',reason:e.code??'MALFORMED_ORACLE_RESPONSE',price:null};}
}

const VIEW_METHODS=new Set(['get_price_data','get_asset','get_price','get_owner_id','get_oracles','get_subsidize_outlayer_calls','can_subsidize_outlayer_calls','get_council_members','get_council_threshold']);
export class ReadOnlyOracleRpc {
    constructor(url,{fetchImpl=globalThis.fetch,timeout_ms=15000}={}){
        const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('ORACLE_HTTPS_REQUIRED');
        this.url=u.href;this.fetch=fetchImpl;this.timeout=timeout_ms;
    }
    async request(method,params={}){
        if(!['status','block','query'].includes(method))fail('READ_ONLY_ORACLE_RPC');
        if(method==='query'&&!(params.request_type==='view_account'||params.request_type==='call_function'&&VIEW_METHODS.has(params.method_name)))fail('READ_ONLY_ORACLE_RPC');
        const response=await this.fetch(this.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'hedgeveil-outlayer-readonly',method,params}),signal:AbortSignal.timeout(this.timeout)});
        const raw=await response.json();return {http_status:response.status,raw};
    }
}
function rpcValue(response){if(response.http_status!==200||response.raw.error||!Object.hasOwn(response.raw,'result'))fail('ORACLE_RPC_ERROR');return response.raw.result;}
export function decodeView(response,block_hash){
    const r=rpcValue(response);if(r.error)fail('ORACLE_VIEW_ERROR');
    if(r.block_hash!==block_hash)fail('ORACLE_VIEW_BLOCK_MISMATCH');
    if(!Array.isArray(r.result)||r.result.some(b=>!Number.isInteger(b)||b<0||b>255))fail('INVALID_ORACLE_VIEW_BYTES');
    try{return JSON.parse(Buffer.from(r.result).toString('utf8'));}catch{fail('INVALID_ORACLE_JSON');}
}
export async function inspectOracle({network,rpc_url,contract_id,expected_genesis_hash,expected_code_hash},{rpc=new ReadOnlyOracleRpc(rpc_url)}={}){
    if(!['testnet','mainnet'].includes(network))fail('ORACLE_NETWORK');
    if(contract_id!==(network==='testnet'?'price-oracle.testnet':'price-oracle.near'))fail('ORACLE_CONTRACT');
    const report={network,rpc_url,contract_id,observed_at:new Date().toISOString(),scope:'READ_ONLY; no transactions; no settlement authorization',responses:{},views:{}};
    try{
        report.responses.status=await rpc.request('status');const status=rpcValue(report.responses.status);
        if(status.chain_id!==network||expected_genesis_hash&&status.genesis_hash!==expected_genesis_hash)fail('ORACLE_CHAIN_MISMATCH');hash32(status.genesis_hash);
        const b=rpcValue(await rpc.request('block',{finality:'final'}));hash32(b.header.hash);uint(b.header.timestamp_nanosec,MAX64);
        report.block={hash:b.header.hash,height:b.header.height,timestamp_ns:b.header.timestamp_nanosec};
        report.responses.account=await rpc.request('query',{request_type:'view_account',account_id:contract_id,block_id:b.header.hash});
        const a=rpcValue(report.responses.account);if(a.block_hash!==b.header.hash)fail('ORACLE_VIEW_BLOCK_MISMATCH');hash32(a.code_hash);
        if(expected_code_hash&&a.code_hash!==expected_code_hash)fail('ORACLE_CODE_MISMATCH');
        report.identity={genesis_hash:status.genesis_hash,code_hash:a.code_hash,pin_status:expected_genesis_hash&&expected_code_hash?'MATCHED':'DISCOVERY_ONLY'};
        const methods=[['get_price_data',{asset_ids:[ASSET]}],['get_asset',{asset_id:ASSET}],['get_price',{price_identifier:PRICE_ID}],['get_owner_id',{}],['get_oracles',{from_index:0,limit:20}],['get_subsidize_outlayer_calls',{}],['get_council_members',{}],['get_council_threshold',{}]];
        for(const [method,args]of methods){
            try{
                const response=await rpc.request('query',{request_type:'call_function',account_id:contract_id,block_id:b.header.hash,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
                report.responses[method]=response;report.views[method]={value:decodeView(response,b.header.hash)};
            }catch(e){report.views[method]={error:e.code??'ORACLE_TRANSPORT_ERROR'};}
        }
        report.assessment=assessPrices(report.views.get_price_data?.value,report.views.get_asset?.value,{now_ns:b.header.timestamp_nanosec});
    }catch(e){report.error=e.code??'ORACLE_TRANSPORT_ERROR';}
    return report;
}
