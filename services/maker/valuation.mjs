import {Q,uint,fail} from '../../packages/sdk/intent.mjs';
export const MODEL='EUROPEAN_ZERO_CARRY_REALIZED_VOL_V1';
export function pricingSeries(series,account,request){
    const requested=new Set([request.asset?.series_id,...(request.mode==='ROLL'?[request.old_asset?.series_id]:[])]);
    return series.filter(s=>requested.has(s.config.series_id)||uint(account.positions[s.slot].p)>0n||uint(account.positions[s.slot].n)>0n);
}
export function requestedSeriesAvailable(series,request,now_ns){
    if(!['BUY','SELL','ROLL'].includes(request.mode))return false;
    return (request.mode==='ROLL'?[request.old_asset,request.asset]:[request.asset]).every(asset=>{
        if(!asset||!['P','N'].includes(asset.kind))return false;
        const s=series.find(x=>x.config.series_id===asset.series_id);
        return !!s&&s.final_price===null&&uint(now_ns,64)<uint(s.config.maturity_ns,64);
    });
}
const SCALE=10n**12n,YEAR_NS=365*24*3600*1e9;
// Abramowitz–Stegun normal CDF; quantization is much finer than model accuracy.
function cdf(x){const z=Math.abs(x),t=1/(1+.2316419*z),p=1-Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x>=0?p:1-p;}
export function valuePair({spot,strike,remaining_ns,sigma}){
    const s=Number(uint(spot))/1e12,k=Number(uint(strike))/1e12,t=Number(uint(remaining_ns,64))/YEAR_NS;
    if(!Number.isFinite(s)||!Number.isFinite(k)||s<=0||k<=0||s>1e6||k>1e6||t>10||!Number.isFinite(sigma)||sigma<0||sigma>5)fail('MODEL_INPUT');
    let ratio;if(t===0||sigma===0)ratio=Math.max(s-k,0)/s;
    else{const v=sigma*Math.sqrt(t),d1=(Math.log(s/k)+v*v/2)/v;ratio=cdf(d1)-(k/s)*cdf(d1-v);}
    ratio=Math.min(1,Math.max(0,ratio));if(!Number.isFinite(ratio))fail('MODEL_NONFINITE');
    const n=BigInt(Math.floor(ratio*1e12))*SCALE;return {P:String(Q-n),N:String(n)};
}
export function marketReference(snapshot,series,now_ns){
    const now=uint(now_ns,64),stamp=uint(snapshot.timestamp_ns,64);
    if(snapshot.source!=='COINBASE_EXCHANGE_NEAR_USD_V1'||snapshot.price_scale!=='1000000000000'||stamp>now||now-stamp>60n*10n**9n)fail('MODEL_SOURCE');
    const marks={};for(const {config,final_price}of series){
        if(final_price!==null&&final_price!==undefined){const s=uint(final_price),k=uint(config.strike);if(!s)fail('MODEL_FINAL_PRICE');const p=s<=k?Q:Q*k/s;marks['P:'+config.series_id]=String(p);marks['N:'+config.series_id]=String(Q-p);continue;}
        const maturity=uint(config.maturity_ns,64);if(maturity<=now)fail('MODEL_UNRESOLVED_MATURITY');
        // The terminal European benchmark is not an arithmetic-TWAP model.
        // New-profile trading stays closed until aligned pricing is accepted.
        if(config.oracle_version==='native-trade-twap-v1')fail('MODEL_TWAP_NOT_READY');
        if(config.price_scale!=='1000000000000'||config.payoff_kind!=='CAPPED_USD_COMPLEMENT')fail('MODEL_SERIES');
        const pair=valuePair({spot:snapshot.spot,strike:config.strike,remaining_ns:String(maturity-now),sigma:snapshot.sigma});
        marks['P:'+config.series_id]=pair.P;marks['N:'+config.series_id]=pair.N;
    }
    return {label:'EXTERNAL MARKET REFERENCE',timestamp_ns:snapshot.timestamp_ns,marks,model:MODEL,source:snapshot.source,snapshot_hash:snapshot.snapshot_hash,sigma:snapshot.sigma,history_end_ns:snapshot.history_end_ns};
}

// Retain the exact observed ticker while finalized chain time catches up.
export async function marketHead(provider,snapshot,{sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
    const stamp=uint(snapshot.timestamp_ns,64);
    for(let n=0;n<10;n++){
        const block=await provider.sendJsonRpc('block',{finality:'final'});
        const now=uint(block.header.timestamp_nanosec,64);
        if(now>=stamp){if(now-stamp>60n*10n**9n)fail('MODEL_SOURCE');return block;}
        if(n<9)await sleep(500);
    }
    fail('MARKET_CHAIN_TIME_BEHIND');
}
