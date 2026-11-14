import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deploymentProfiles,settleExpiry} from '../../services/testnet/expiry.mjs';
import {durableWrite} from '../../services/demo/storage.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
const h=n=>base58(Buffer.alloc(32,n)),terms=JSON.parse(await readFile(new URL('../../research/reports/orc04-expiry-resolver-sandbox.json',import.meta.url))).final_case.config;
const source={account_id:'outlayer.testnet',code_hash:h(1)},core={kind:'core',account_id:'core.testnet',code_hash:h(2)},resolver={kind:'expiry_oracle',account_id:'resolver.testnet',code_hash:h(3)},genesis_hash='FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b';
const plan={kind:'hedgeveil-expiry-testnet',network:'testnet',oracle_version:'native-trade-twap-v1',genesis_hash,root_id:'operator.testnet',source,accounts:[{role:'core',id:core.account_id},{role:'oracle',id:resolver.account_id}],artifacts:{core,expiry_oracle:resolver}};
const deployment={client:{network:'testnet',genesis_hash,contract_id:core.account_id,code_hash:core.code_hash},indexer:{contracts:[core,resolver]},source,vault_enabled:false,series:['one','two'].map(series_id=>({...terms,series_id,oracle_account_id:resolver.account_id}))};
test('expiry runtime binds deployment accounts, code, source, network and unique terms to its plan',()=>{
 assert.equal(deploymentProfiles(plan,deployment).length,2);
 for(const change of [d=>d.source.code_hash=h(4),d=>d.indexer.contracts[1].code_hash=h(4),d=>d.client.genesis_hash=h(4),d=>d.series.push(d.series[0]),d=>d.series[0].oracle_version='native-sampled-v1',d=>d.vault_enabled=true]){const d=structuredClone(deployment);change(d);assert.throws(()=>deploymentProfiles(plan,d));}
 assert.throws(()=>deploymentProfiles({...plan,deployment_hold:'review'},deployment),/DEPLOYMENT_ON_HOLD/);
});
test('runtime keeps known per-series failure local but halts globally for unresolved signer or ownership',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'hv-expiry-runtime-'));
 try{
  await durableWrite(join(directory,'deployment.json'),deployment);await durableWrite(join(directory,'signers.json'),{keys:{'operator.testnet':'test-only-placeholder'}});
  for(const [result,count]of [[{state:'EVIDENCE_REJECTED_REVIEW_REQUIRED'},2],[{state:'HALTED_SIGNER'},1],[{state:'KEEPER_ERROR',code:'EXPIRY_BUSY_OR_INTERRUPTED'},1]]){
   let calls=0;const status=await settleExpiry({directory,plan},{admin:{},now:()=>Number(BigInt(deployment.series[0].maturity_ns)/1000000n)+1,run:async()=>{calls++;return result;}});assert.equal(calls,count);assert.equal(status.items.length,count);
  }
  const waiting=await settleExpiry({directory,plan},{admin:{},now:()=>0,run:async()=>{throw Error('FUTURE_PROFILE_MUST_NOT_POLL');}});assert(waiting.items.every(x=>x.state==='WAIT_EXPIRY'));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('halted settlement permits isolated cleanup but never renewal; recovery restores renewal',async()=>{
 const {startExpirySettlement}=await import('../../services/testnet/expiry.mjs');
 const directory=await mkdtemp(join(tmpdir(),'hv-scheduler-'));
 let polls=0,maintenanceCalls=0,cleanups=0,renewals=0,release,pausedSeen;
 const blockedWritten=new Promise(r=>pausedSeen=r);
 const finished=new Promise(r=>release=r);
 const service=startExpirySettlement({directory},{interval:5,renewInterval:60000,
  settle:async()=>{
   polls++;
   if(polls===1)return {items:[{state:'HALTED_SIGNER'}]};
   const status=JSON.parse(await readFile(join(directory,'renewal-status.json'),'utf8'));
   assert.equal(status.state,'BLOCKED');assert.equal(maintenanceCalls,1);assert.equal(cleanups,1);assert.equal(renewals,0);pausedSeen();
   return {items:[{state:'COMPLETE',series_id:'recovered'}]};
  },
  maintenance:async fn=>{maintenanceCalls++;return fn()},
  cleanup:async()=>{cleanups++;},
  renew:async()=>{renewals++;release()},
 });
 try{await Promise.race([finished,new Promise((_,reject)=>setTimeout(()=>reject(Error('scheduler timeout')),2000).unref())]);await blockedWritten;await service.stop();assert.equal(maintenanceCalls,2);assert.equal(renewals,1);}
 finally{await service.stop();await rm(directory,{recursive:true,force:true});}
});

test('newly due series run first; rejected evidence is rechecked after a bounded interval, never cached as success',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'hv-expiry-priority-'));
 try{
  const d=structuredClone(deployment);d.series[1].maturity_ns=String(BigInt(d.series[0].maturity_ns)+1000000000n);d.series[1].observation_window={start_ns:String(BigInt(d.series[1].maturity_ns)-1800000000000n),end_ns:d.series[1].maturity_ns};
  await durableWrite(join(directory,'deployment.json'),d);await durableWrite(join(directory,'signers.json'),{keys:{'operator.testnet':'fixture-only'}});
  let time=Number(BigInt(d.series[1].maturity_ns)/1000000n)+1;const observations=new Map(),calls=[];
  const options={admin:{},observations,now:()=>time,run:async p=>{calls.push(p.terms.series_id);return {state:'EVIDENCE_REJECTED_REVIEW_REQUIRED'};}};
  await settleExpiry({directory,plan},options);assert.deepEqual(calls,['two','one']);
  calls.length=0;time+=59000;const cached=await settleExpiry({directory,plan},options);assert.equal(calls.length,0);assert(cached.items.every(i=>i.state==='EVIDENCE_REJECTED_REVIEW_REQUIRED'&&i.observed_at));
  time+=1000;await settleExpiry({directory,plan},options);assert.deepEqual(calls,['two','one']);
  calls.length=0;options.run=async p=>{calls.push(p.terms.series_id);return {state:'HALTED_SIGNER'};};time+=60000;
  await settleExpiry({directory,plan},options);await settleExpiry({directory,plan},options);assert.deepEqual(calls,['two','two']);
 }finally{await rm(directory,{recursive:true,force:true});}
});
