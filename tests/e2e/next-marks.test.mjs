import test from 'node:test';
import assert from 'node:assert/strict';
import {markRows,createMarksReader} from '../../apps/frontend/lib/marks-server.ts';
import {Q,USD} from '../../apps/frontend/lib/market-display.ts';
import {ladderDates,planLadder} from '../../services/markets/ladder.mjs';
const now=Date.parse('2026-11-13T01:00:00Z'),ns=String(BigInt(now)*1000000n);
const snapshot={source:'COINBASE_EXCHANGE_NEAR_USD_V1',price_scale:String(USD),timestamp_ns:ns,spot:String(3n*USD),sigma:0.5,snapshot_hash:'a'.repeat(64)};
const series=(id,profile='native-sampled-v1')=>({config:{series_id:id,oracle_version:profile,price_scale:String(USD),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:String(3n*USD),maturity_ns:String(BigInt(ns)+86400n*1000000000n)},final_price:null});
test('public marks distinguish real model estimates, settled payouts, pending and unsupported profiles',()=>{
 const rows=markRows([series('a'),{...series('b'),final_price:String(4n*USD)},series('c','native-trade-twap-v1'),{...series('d'),config:{...series('d').config,maturity_ns:ns}},series('e','unknown')],snapshot,ns);
 assert.equal(rows[0].kind,'MODEL');assert.equal(BigInt(rows[0].p)+BigInt(rows[0].n),Q);
 assert.equal(rows[1].kind,'SETTLED');assert.equal(BigInt(rows[1].p),3n*Q/4n);
 assert.equal(rows[2].reason,'MODEL_TWAP_NOT_READY');assert.equal(rows[3].reason,'AWAITING_SETTLEMENT');assert.equal(rows[4].reason,'UNSUPPORTED_PROFILE');
 assert.equal(markRows([series('a')],null,ns)[0].p,null);
 assert.equal(markRows([{...series('b'),final_price:String(4n*USD)}],null,ns)[0].n,String(Q/4n));
 assert.equal(markRows([series('a')],{...snapshot,timestamp_ns:String(BigInt(ns)-61n*1000000000n)},ns)[0].kind,'UNAVAILABLE');
});
test('marks reader is read-only, cached, scoped to deployed contract, and missing feed never becomes zero',async()=>{
 let calls=0,t=now;const requests=[];
 const reader=createMarksReader({clock:()=>t,market:{snapshot:async()=>{calls++;throw Error('offline');}},transport:async(url,opts)=>{requests.push({url,method:opts.method??'GET'});return Response.json(url.endsWith('/session')?{configured:true,contract_id:'core'}:{items:[{contract:'core',body:{series:[series('a')]}}],health:{height:12}});}});
 const [a,b]=await Promise.all([reader(),reader()]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(a.items[0].p,null);assert.deepEqual(requests.map(x=>x.method),['GET','GET']);
 await reader();assert.equal(calls,1);t+=16000;await reader();assert.equal(calls,2);
});
test('ladder uses distinct next daily/Friday dates, fixed seeds and detects current capacity/profile blockers',()=>{
 const dates=ladderDates(ns);assert.equal(new Date(Number(BigInt(dates[0])/1000000n)).toISOString(),'2026-11-13T08:00:00.000Z');assert.equal(new Date(Number(BigInt(dates[1])/1000000n)).toISOString(),'2026-11-20T08:00:00.000Z');
 const plan=planLadder({snapshot,nowNs:ns,maxSeries:8});assert.equal(plan.targets.length,10);assert.equal(new Set(plan.targets.map(x=>x.series_id)).size,10);assert.deepEqual(plan.blocked,['CONTRACT_SERIES_CAPACITY','EXPIRY_PROFILE_NOT_ACCEPTED']);assert.deepEqual(plan.actions,[]);
 assert.deepEqual(plan.targets.slice(0,5).map(x=>x.strike),['2700000000000','2850000000000','3000000000000','3150000000000','3300000000000']);
 const retry=planLadder({snapshot:{...snapshot,spot:String(4n*USD)},nowNs:ns,maxSeries:8,cohorts:plan.cohorts});assert.deepEqual(retry.targets,plan.targets);
 const existing=plan.targets.map(x=>({config:x}));assert.equal(planLadder({snapshot,nowNs:ns,maxSeries:10,cohorts:plan.cohorts,existing,profileReady:true}).missing,0);
 assert.throws(()=>planLadder({snapshot:{...snapshot,timestamp_ns:'0'},nowNs:ns,maxSeries:8}),/FRESH_SOURCE/);
 const after=ladderDates(String(BigInt(Date.parse('2026-11-13T07:30:00Z'))*1000000n));assert.equal(new Date(Number(BigInt(after[0])/1000000n)).toISOString(),'2026-11-14T08:00:00.000Z');
});
