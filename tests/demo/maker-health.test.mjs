import test from 'node:test';
import assert from 'node:assert/strict';
import {workerHealth,startMakerHealth} from '../../services/maker/health.mjs';
test('worker health never reports paused, retired or unresolved cancellation as ready',()=>{
 assert.deepEqual(workerHealth({initialized:true}),{ready:true,reason:null});
 for(const change of [{initialized:false},{paused:true},{retired:true},{pendingCancellation:{}}])assert.equal(workerHealth({initialized:true,...change}).ready,false);
});
test('probes use only health IPC, retain failures and drain before shutdown',async()=>{
 let calls=0,release;
 const makers=[{ask:async method=>{assert.equal(method,'health');calls++;return new Promise(r=>release=r)}},{ask:async()=>{throw Error('private failure')}}];
 const service=startMakerHealth(makers,{interval:5,now:()=> '2026-11-13T18:00:00Z'});
 let stopped=false;const stopping=service.stop().then(()=>stopped=true);
 await Promise.resolve();assert.equal(stopped,false);
 release({ready:true,reason:null});await stopping;
 assert.equal(calls,1);assert.equal(makers[0].health.ready,true);assert.equal(makers[1].health.reason,'MAKER_HEALTH_UNAVAILABLE');
 assert(!JSON.stringify(makers).includes('private failure'));
});
