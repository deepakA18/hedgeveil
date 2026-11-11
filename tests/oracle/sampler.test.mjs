import test from 'node:test';
import assert from 'node:assert/strict';
import {samplingProfile,sampleState,freshReport,SampleCoordinator,ACCEPTED_POLICY} from '../../services/outlayer/sampler.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {FileJournal} from '../../packages/sdk/journal.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sampleNative} from '../../services/testnet/sampling.mjs';
const S=10n**9n,h=n=>base58(Buffer.alloc(32,n));
const c={config:{series_id:'s',oracle_account_id:'resolver.sandbox',oracle_version:'native-sampled-v1',observation_window:{start_ns:String(100n*S),end_ns:String(280n*S)},maturity_ns:String(280n*S)},source:{account:'source.sandbox',reporter:'reporter.sandbox',asset:'wrap.near',min_price:'1',max_price:'100000000000000'},samples:[null,null,null],pending:null,price:null};
const profile={network:'sandbox',chain_id:'local',genesis_hash:h(1),policy_acceptance:ACCEPTED_POLICY,signer_id:'operator.sandbox',source:{account_id:'source.sandbox',code_hash:h(2)},resolver:{account_id:'resolver.sandbox',code_hash:h(3)},core:{account_id:'core.sandbox',code_hash:h(4)},terms:c.config};
const sample={price:'3000000000000'};
test('sampling waits for slots, callbacks and review, never backfills a missed slot',()=>{
 assert.equal(sampleState(c,String(99n*S)).state,'WAIT_WINDOW');
 assert.equal(sampleState(c,String(105n*S)).state,'COLLECT');
 assert.equal(sampleState(c,String(159n*S)).state,'WAIT_SLOT_MARGIN');
 assert.equal(sampleState(c,String(165n*S)).state,'DELAYED_MISSING_SAMPLE');
 assert.equal(sampleState({...c,pending:{}},String(110n*S)).state,'WAIT_CALLBACK');
 assert.equal(sampleState(c,String(110n*S),true).state,'PAUSED');
 const full={...c,samples:[sample,sample,sample]};
 assert.equal(sampleState(full,String(300n*S)).state,'WAIT_REVIEW');
 assert.equal(sampleState(full,String(340n*S)).state,'FINALIZE');
 assert.equal(sampleState({...full,price:'3000000000000'},String(340n*S),true).state,'FINALIZED');
});
test('selected external report must fit slot, consumer age, exact units and bounds',()=>{
 const step=sampleState(c,String(110n*S)),report={oracle_id:'reporter.sandbox',timestamp:String(108n*S),price:{multiplier:'300000000',decimals:8}};
 const fresh=r=>freshReport({reports:r},c,step,String(110n*S));assert(fresh([report]));
 for(const patch of [{oracle_id:'wrong.sandbox'},{timestamp:String(99n*S)},{timestamp:String(111n*S)},{price:{multiplier:'0',decimals:8}},{price:{multiplier:'1',decimals:13}}])assert(!fresh([{...report,...patch}]));
 assert(!fresh([report,report]));assert(!freshReport({reports:[report]},c,step,String(130n*S)));
});
test('held or wrong-source profiles stop before signer or network access',()=>{
 assert.throws(()=>new SampleCoordinator({profile:{...profile,deployment_hold:'SOURCE_REQUIRED'}}),/DEPLOYMENT_ON_HOLD/);
 assert.throws(()=>samplingProfile({...profile,policy_acceptance:'unaccepted'}),/SAMPLER_POLICY/);
 assert.throws(()=>samplingProfile({...profile,network:'testnet',chain_id:'testnet'}),/SAMPLER_SOURCE/);
 assert.throws(()=>samplingProfile({...profile,network:'mainnet'}),/SAMPLER_POLICY/);
});
test('testnet sampler cannot load keys from held or legacy deployments',async()=>{
 await assert.rejects(sampleNative({directory:'/nonexistent',plan:{deployment_hold:'SOURCE_REQUIRED'}}),/DEPLOYMENT_ON_HOLD/);
 await assert.rejects(sampleNative({directory:'/nonexistent',plan:{oracle_version:'demo-v1'}}),/NATIVE_DEPLOYMENT_REQUIRED/);
});
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'hv-sampler-'));t.after(()=>rm(dir,{recursive:true,force:true}));const journal=new FileJournal(dir);
 let now=110n*S,sends=0,raw={reports:[]},badCode=false,unresolved=false;const local=structuredClone(c);
 const admin={journal,verify:async()=>{},provider:{sendJsonRpc:async(method,args)=>{
  if(method==='status')return {chain_id:'local',genesis_hash:profile.genesis_hash};
  if(method==='block')return {header:{hash:h(5),timestamp_nanosec:String(now)}};
  if(method==='query'){
   if(args.request_type==='view_account')return {block_hash:h(5),code_hash:badCode?h(9):[profile.source,profile.resolver,profile.core].find(x=>x.account_id===args.account_id).code_hash};
   const data=args.method_name==='get_snapshot'?{network:'sandbox',contract_id:'resolver.sandbox',version:'native-sampled-v1',paused:false,cases:{s:local}}:raw;
   return {block_hash:h(5),result:[...Buffer.from(JSON.stringify(data))]};
  }throw Error('unexpected method');}},
  prepare:async(label,signer_id,receiver_id,actions)=>{const i={label,signer_id,receiver_id,actions,operation_id:createHash('sha256').update(label).digest('hex')};await journal.create(i,{fixture:true});return i;},
  recover:async i=>unresolved?{state:'SUBMISSION_UNKNOWN'}:(await journal.get(i.operation_id)).result,
  send:async i=>{sends++;await journal.claim(i.operation_id);return journal.observe(i.operation_id,{state:'SUCCEEDED',operation_id:i.operation_id});}};
 return {admin,local,get sends(){return sends;},set now(n){now=n;},set raw(r){raw=r;},set badCode(v){badCode=v;},set unresolved(v){unresolved=v;}};
}
test('each slot has one bounded refresh and a restart cannot repeat its deposit',async t=>{
 const f=await fixture(t),tick=()=>new SampleCoordinator({profile,admin:f.admin}).tick();
 assert.equal((await tick()).operation,'refresh:0');assert.equal((await tick()).state,'WAIT_FRESH_SOURCE');assert.equal(f.sends,1);
 f.raw={reports:[{oracle_id:'reporter.sandbox',timestamp:String(109n*S),price:{multiplier:'300000000',decimals:8}}]};
 assert.equal((await tick()).operation,'sample:0');assert.equal((await tick()).state,'WAIT_OBSERVED_STATE');assert.equal(f.sends,2);
 f.now=170n*S;assert.equal((await tick()).state,'DELAYED_MISSING_SAMPLE');assert.equal(f.sends,2);
});
test('unknown prior attempt prevents later-slot spending; changed code prevents any send',async t=>{
 const f=await fixture(t),tick=()=>new SampleCoordinator({profile,admin:f.admin}).tick();f.badCode=true;await assert.rejects(tick(),/SAMPLER_CODE/);assert.equal(f.sends,0);f.badCode=false;
 const i=await f.admin.prepare('native:s:refresh:0',profile.signer_id,profile.source.account_id,[{type:'FunctionCall',method:'request_price_data',args:{asset_ids:['wrap.near']},deposit:'20000000000000000000000',gas:'200000000000000'}]);
 await f.admin.journal.claim(i.operation_id);f.unresolved=true;f.now=170n*S;f.local.samples[0]=sample;
 assert.equal((await tick()).state,'HALTED_TRANSACTION');assert.equal(f.sends,0);
});
test('separate collectors cannot race the same retained journal',async t=>{
 const f=await fixture(t);let ready,release;const locked=new Promise(r=>{ready=r;}),gate=new Promise(r=>{release=r;});
 f.admin.verify=async()=>{ready();await gate;};
 const first=new SampleCoordinator({profile,admin:f.admin}).tick();await locked;
 await assert.rejects(new SampleCoordinator({profile,admin:f.admin}).tick(),/SAMPLER_BUSY_OR_INTERRUPTED/);
 release();assert.equal((await first).operation,'refresh:0');assert.equal(f.sends,1);
 assert.equal((await new SampleCoordinator({profile,admin:f.admin}).tick()).state,'WAIT_FRESH_SOURCE');
});

test('sample recheck measures actual report age, not just checkpoint age, and keeps the 15-second cap',async t=>{
 for(const [latest,expected] of [[116n*S,'TRANSACTION_CONFIRMED'],[125n*S,'WAIT_RECHECK_SOURCE']]){
  const f=await fixture(t);f.raw={reports:[{oracle_id:'reporter.sandbox',timestamp:String(109n*S),price:{multiplier:'300000000',decimals:8}}]};
  const original=f.admin.provider.sendJsonRpc;let blocks=0;
  f.admin.provider.sendJsonRpc=async(method,args)=>{if(method==='block'&&++blocks===2)f.now=latest;return original(method,args);};
  const result=await new SampleCoordinator({profile,admin:f.admin}).tick();assert.equal(result.state,expected);assert.equal(f.sends,expected==='TRANSACTION_CONFIRMED'?1:0);
 }
});
test('all contract pins and external/resolver views are fetched concurrently at one finalized hash',async t=>{
 const f=await fixture(t),original=f.admin.provider.sendJsonRpc;let arrivals=0,release;const gate=new Promise(r=>{release=r;});
 f.admin.provider.sendJsonRpc=async(method,args)=>{if(method==='query'){assert.equal(args.block_id,h(5));if(++arrivals===5)release();await gate;}return original(method,args);};
 const result=await new SampleCoordinator({profile,admin:f.admin}).tick();assert.equal(result.operation,'refresh:0');assert.equal(arrivals,5);
});

test('idle polling waits for known window boundaries with a 30-second ceiling',async t=>{
 const f=await fixture(t);f.now=90n*S;
 const tick=()=>new SampleCoordinator({profile,admin:f.admin}).tick();
 const before=await tick();assert.equal(before.state,'WAIT_WINDOW');assert.equal(before.next_poll_ms,13000);assert.equal(f.sends,0);
 f.now=110n*S;f.local.samples[0]={price:'3'};const next=await tick();assert.equal(next.state,'WAIT_NEXT_SLOT');assert.equal(next.next_poll_ms,30000);assert.equal(f.sends,0);
});

test('source cache waiting uses stored report time and never the changing response wrapper',async()=>{
 const {sourceCacheWait}=await import('../../services/outlayer/sampler.mjs');
 const asset={reports:[{oracle_id:'source.testnet',timestamp:String(100n*S)}]},policy={recency_duration_sec:300,timestamp:String(399n*S)};
 assert.equal(sourceCacheWait(asset,policy,'source.testnet',String(280n*S)),121n*S);
 assert.equal(sourceCacheWait(asset,{...policy,timestamp:String(10000n*S)},'source.testnet',String(400n*S)),S);
 assert.equal(sourceCacheWait(asset,policy,'source.testnet',String(401n*S)),0n);
 assert.equal(sourceCacheWait({reports:[]},policy,'source.testnet',String(401n*S)),0n);
 assert.throws(()=>sourceCacheWait(asset,{recency_duration_sec:600},'source.testnet',String(401n*S)),/SAMPLER_SOURCE_CACHE_POLICY/);
 assert.throws(()=>sourceCacheWait({reports:[...asset.reports,...asset.reports]},policy,'source.testnet',String(401n*S)),/SAMPLER_SOURCE_REPORT/);
 assert.throws(()=>sourceCacheWait(asset,policy,'source.testnet',String(99n*S)),/SAMPLER_SOURCE_REPORT/);
});
