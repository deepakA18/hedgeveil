import {Q,uint,fail} from '../../packages/sdk/intent.mjs';
export const MODEL='EUROPEAN_ZERO_CARRY_REALIZED_VOL_V1';
export const TWAP_MODEL='ARITHMETIC_TWAP_NEAR_MOMENTS_V1';
export function pricingSeries(series,account,request){
    const requested=new Set([request.asset?.series_id,...(request.mode==='ROLL'?[request.old_asset?.series_id]:[])]);
    return series.filter(s=>requested.has(s.config.series_id)||uint(account.positions[s.slot].p)>0n||uint(account.positions[s.slot].n)>0n);
}
export function requestedSeriesAvailable(series,request,now_ns){
    if(!['BUY','SELL','ROLL'].includes(request.mode))return false;
    return (request.mode==='ROLL'?[request.old_asset,request.asset]:[request.asset]).every(asset=>{
        if(!asset||!['P','N'].includes(asset.kind))return false;
        const s=series.find(x=>x.config.series_id===asset.series_id);
        return !!s&&s.final_price===null&&uint(now_ns,64)<uint(pricingEnd(s.config),64);
    });
}
const SCALE=10n**12n,YEAR_NS=365*24*3600*1e9;
export const pricingEnd=config=>config.oracle_version==='native-trade-twap-v1'?config.observation_window.start_ns:config.maturity_ns;
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
// Native-numeraire moments of the *average*, not terminal-price Black–Scholes.
// A maker estimate only: exact settlement remains integer last-trade integration.
export function valueTwapPair({spot,strike,until_window_ns,window_ns,sigma}){
    const s=Number(uint(spot))/1e12,k=Number(uint(strike))/1e12,a=Number(uint(until_window_ns,64))/YEAR_NS,w=Number(uint(window_ns,64))/YEAR_NS;
    if(window_ns!=='1800000000000'||!Number.isFinite(s)||!Number.isFinite(k)||s<=0||k<=0||s>1e6||k>1e6||a+w>10||!Number.isFinite(sigma)||sigma<0||sigma>5)fail('MODEL_TWAP_INPUT');
    let ratio=Math.max(1-k/s,0);
    if(sigma>0){
        const v=sigma*sigma,z=v*w;
        // Series expansion avoids subtracting two almost identical expm1 values.
        let second=0,term=1,factorial=2,power3=3;
        for(let n=2;n<=12;n++){second+=(power3-1)*term/factorial;term*=z;factorial*=n+1;power3*=3;}
        const logFirst=z<1e-5?z/2+z*z/24:Math.log(Math.expm1(z)/z);
        const variance=v*a+(z<1e-5?z/3+z*z/9:Math.log(second)-2*logFirst),mean=Math.log(s)+v*a+logFirst-variance/2;
        if(variance<=0||!Number.isFinite(variance))fail('MODEL_TWAP_INPUT');
        const sd=Math.sqrt(variance),d=(mean-Math.log(k))/sd;
        ratio=cdf(d)-Math.exp(Math.log(k)-mean+variance/2)*cdf(d-sd);
    }
    if(!Number.isFinite(ratio))fail('MODEL_NONFINITE');
    const n=BigInt(Math.floor(Math.min(1,Math.max(0,ratio))*1e12))*SCALE;
    return {P:String(Q-n),N:String(n)};
}
export function marketReference(snapshot,series,now_ns){
    const now=uint(now_ns,64),stamp=uint(snapshot.timestamp_ns,64);
    if(snapshot.source!=='COINBASE_EXCHANGE_NEAR_USD_V1'||snapshot.price_scale!=='1000000000000'||stamp>now||now-stamp>60n*10n**9n)fail('MODEL_SOURCE');
    const marks={},models=new Set();for(const {config,final_price}of series){
        if(final_price!==null&&final_price!==undefined){const s=uint(final_price),k=uint(config.strike);if(!s)fail('MODEL_FINAL_PRICE');const p=s<=k?Q:Q*k/s;marks['P:'+config.series_id]=String(p);marks['N:'+config.series_id]=String(Q-p);continue;}
        const maturity=uint(config.maturity_ns,64);if(maturity<=now)fail('MODEL_UNRESOLVED_MATURITY');
        if(config.price_scale!=='1000000000000'||config.payoff_kind!=='CAPPED_USD_COMPLEMENT')fail('MODEL_SERIES');
        const twap=config.oracle_version==='native-trade-twap-v1';
        if(twap&&(config.observation_window?.end_ns!==config.maturity_ns||uint(config.observation_window.start_ns,64)>=maturity))fail('MODEL_TWAP_INPUT');
        if(twap&&now>=uint(config.observation_window.start_ns,64))fail('MODEL_PARTIAL_HISTORY_REQUIRED');
        const pair=twap?valueTwapPair({spot:snapshot.spot,strike:config.strike,until_window_ns:String(uint(config.observation_window.start_ns,64)-now),window_ns:String(maturity-uint(config.observation_window.start_ns,64)),sigma:snapshot.sigma}):valuePair({spot:snapshot.spot,strike:config.strike,remaining_ns:String(maturity-now),sigma:snapshot.sigma});
        models.add(twap?TWAP_MODEL:MODEL);
        marks['P:'+config.series_id]=pair.P;marks['N:'+config.series_id]=pair.N;
    }
    return {label:'EXTERNAL MARKET REFERENCE',timestamp_ns:snapshot.timestamp_ns,marks,model:models.size===1?[...models][0]:models.size?'MIXED_PROFILE_MODELS':'FINALIZED_COEFFICIENTS',source:snapshot.source,snapshot_hash:snapshot.snapshot_hash,sigma:snapshot.sigma,history_end_ns:snapshot.history_end_ns};
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
