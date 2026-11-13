import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceStatus} from '../../apps/web/status.mjs';
import {createStatusReader} from '../../apps/frontend/lib/status-server.ts';
import {overallStatus} from '../../apps/frontend/lib/status.ts';
const now=Date.parse('2026-11-13T15:00:00Z'),at=new Date(now).toISOString();
const snapshot={health:{reconciled:true,risk_allowed:true,stale:false,age_ms:1000,height:'20',rpc_failovers:2,discovery:{fresh:true,lag_blocks:1000,required:false}}};
const runtime={makers:[{connected:true,checked_at:at,offered:true},{connected:true,checked_at:at,offered:false,reason:'MAKER_RPC_UNAVAILABLE'}],keeper:{checked_at:at,items:[{state:'WAIT_EXPIRY'}]},renewal:{checked_at:at,state:'RECONCILED'}};
test('service projection distinguishes RPC failures, audit lag and stale observations without secrets',()=>{
 const result=serviceStatus({snapshot,runtime:{...runtime,private_key:'DO_NOT_PUBLISH'},now});
 const row=id=>result.services.find(s=>s.id===id);
 assert.equal(row('indexer').state,'operational');assert.equal(row('discovery').state,'degraded');
 assert.equal(row('maker-1').state,'operational');assert.match(row('maker-2').detail,/RPC/);
 assert(!JSON.stringify(result).includes('DO_NOT_PUBLISH'));
 const stale=serviceStatus({snapshot:{health:{...snapshot.health,age_ms:60001}},runtime,now:now+200000});
 assert.equal(stale.services.find(s=>s.id==='indexer').state,'degraded');
 for(const id of ['rpc','contracts','settlement','renewal','maker-1'])assert.equal(stale.services.find(s=>s.id===id).state,'unknown');
});
test('status reader coalesces sessions, preserves measured history and never substitutes old success after outage',async()=>{
 let time=now,calls=0,fail=false;
 const read=createStatusReader(()=> 'http://127.0.0.1:8796',async(url,init)=>{
  calls++;assert.equal(url,'http://127.0.0.1:8796/api/status');assert.equal(init.method,undefined);
  if(fail)throw Error('private token, do not leak');
  return Response.json(serviceStatus({snapshot,runtime,now:time}));
 },async()=>({observedAt:new Date(time).toISOString()}),()=>time);
 const results=await Promise.all(Array.from({length:10},()=>read()));
 assert.equal(calls,1);assert(results.every(r=>r.history.length===1));
 time+=16000;fail=true;const result=await read();
 assert.equal(result.services.find(s=>s.id==='api').state,'unavailable');
 assert.equal(result.services.find(s=>s.id==='maker-1').state,'unknown');
 assert.equal(result.history.length,2);assert(!JSON.stringify(result).includes('private token'));
 assert.equal(overallStatus(result.services),'unavailable');
 for(let i=0;i<35;i++){time+=16000;await read();}
 assert.equal((await read()).history.length,30);
});
test('stale backend responses and spot observations cannot produce healthy status',async()=>{
 const read=createStatusReader(()=> 'http://127.0.0.1:8796',async()=>Response.json(serviceStatus({snapshot,runtime,now:now-60000})),async()=>({observedAt:new Date(now-60000).toISOString()}),()=>now);
 const r=await read();assert.equal(r.services.find(s=>s.id==='api').state,'unavailable');assert.equal(r.services.find(s=>s.id==='prices').state,'degraded');
 assert.equal(overallStatus([]),'unknown');
 assert.equal(overallStatus([{state:'unknown'}]),'unknown');
});
