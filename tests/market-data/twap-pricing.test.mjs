import test from 'node:test';
import assert from 'node:assert/strict';
import {valueTwapPair,valuePair,marketReference,TWAP_MODEL,pricingEnd,requestedSeriesAvailable} from '../../services/maker/valuation.mjs';
import {quoteExpiry} from '../../services/maker/expiry.mjs';
const Q=10n**24n,window_ns='1800000000000',ns=seconds=>String(BigInt(seconds)*1000000000n);
const base={spot:'4000000000000',strike:'4000000000000',until_window_ns:ns(86400),window_ns,sigma:1};
test('TWAP model preserves native complement, monotonic strike and deterministic bounds',()=>{
 for(const sigma of [0,1e-10,.3,1,5])for(const delay of [0,1,86400,604800]){
  let previous=Q;
  for(const k of [1,2,3,4,5,8,100]){
   const pair=valueTwapPair({...base,strike:String(BigInt(k)*10n**12n),sigma,until_window_ns:ns(delay)});
   assert.equal(BigInt(pair.P)+BigInt(pair.N),Q);assert(BigInt(pair.N)<=previous);previous=BigInt(pair.N);
  }
 }
 assert.deepEqual(valueTwapPair({...base,strike:'2000000000000',sigma:0}),{P:String(Q/2n),N:String(Q/2n)});
 for(const change of [{spot:'0'},{sigma:NaN},{sigma:6},{window_ns:ns(1799)},{until_window_ns:'-1'}])assert.throws(()=>valueTwapPair({...base,...change}));
 const averaged=Number(valueTwapPair({...base,until_window_ns:'0'}).N)/1e24;
 const terminal=Number(valuePair({...base,remaining_ns:window_ns}).N)/1e24;
 assert(averaged<terminal*.7&&averaged>terminal*.5,'averaging window must reduce near-expiry ATM uncertainty');
});
test('partial history is never invented; quote TTL ends before averaging begins',()=>{
 const now=ns(1000),start=ns(2000),end=ns(3800),config={series_id:'live',oracle_version:'native-trade-twap-v1',price_scale:'1000000000000',payoff_kind:'CAPPED_USD_COMPLEMENT',strike:base.strike,maturity_ns:end,observation_window:{start_ns:start,end_ns:end}};
 const snapshot={source:'COINBASE_EXCHANGE_NEAR_USD_V1',price_scale:'1000000000000',timestamp_ns:now,spot:base.spot,sigma:1};
 const series=[{config,final_price:null}];assert.equal(marketReference(snapshot,series,now).model,TWAP_MODEL);
 assert.throws(()=>marketReference({...snapshot,timestamp_ns:start},series,start),/PARTIAL_HISTORY_REQUIRED/);
 assert.equal(requestedSeriesAvailable(series,{mode:'BUY',asset:{kind:'N',series_id:'live'}},start),false);
 assert.equal(quoteExpiry(BigInt(start)-2n,[pricingEnd(config)],'testnet'),BigInt(start)-1n);
 assert.throws(()=>quoteExpiry(BigInt(start)-1n,[pricingEnd(config)],'testnet'),/SERIES_UNAVAILABLE/);
});

// Independent path expectation in NEAR measure. Simulated prices are test-only.
// Antithetic GBM paths and trapezoid refinement test inverse-average payoff and
// numeraire, rather than repeating the implementation's fitted moment formula.
test('native TWAP marks agree with independently simulated average-payoff expectations',()=>{
 let seed=183791;const u=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
 const normal=()=>Math.sqrt(-2*Math.log(u()))*Math.cos(2*Math.PI*u());
 const YEAR=365*86400,paths=32768,steps=64;
 for(const [delay,sigma,strike]of [[0,1,4],[86400,1,4],[604800,3,4],[86400,2,3.6],[86400,2,4.4]]){
  let sum=0,sum2=0;
  const a=delay/YEAR,w=1800/YEAR,v=sigma*sigma,dt=w/steps,drift=v*dt/2,vol=sigma*Math.sqrt(dt);
  for(let i=0;i<paths;i++){
   const z=normal();let s1=4*Math.exp(v*a/2+sigma*Math.sqrt(a)*z),s2=4*Math.exp(v*a/2-sigma*Math.sqrt(a)*z),area1=s1/2,area2=s2/2;
   for(let j=1;j<=steps;j++){const n=normal();s1*=Math.exp(drift+vol*n);s2*=Math.exp(drift-vol*n);const weight=j===steps?.5:1;area1+=weight*s1;area2+=weight*s2;}
   const y=(Math.max(0,1-strike/(area1/steps))+Math.max(0,1-strike/(area2/steps)))/2;sum+=y;sum2+=y*y;
  }
  const mean=sum/paths,se=Math.sqrt(Math.max(0,sum2/paths-mean*mean)/paths),mark=Number(valueTwapPair({...base,strike:String(BigInt(Math.round(strike*1e12))),until_window_ns:ns(delay),sigma}).N)/1e24;
  assert(Math.abs(mark-mean)<5*se+0.00003,JSON.stringify({delay,sigma,strike,mark,mean,se}));
 }
});
