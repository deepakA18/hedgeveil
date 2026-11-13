// Failure fixtures only; compiled successful execution is covered in Sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ExpiryCoordinator,expiryProfile,EXPIRY_WORKER} from '../../services/outlayer/expiry-coordinator.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
const old=JSON.parse(await readFile(new URL('../../research/reports/orc04-expiry-resolver-sandbox.json',import.meta.url))).final_case;
const h=n=>base58(Buffer.alloc(32,n));
async function fixture(run){
 const directory=await mkdtemp(join(tmpdir(),'expiry-guards-'));
 const c={...structuredClone(old),price:null,accepted:null,pending:null,last_result:'NOT_REQUESTED'};
 const profile={network:'sandbox',chain_id:'local',genesis_hash:h(1),signer_id:'operator.sandbox',source:{account_id:'source.sandbox',code_hash:h(2)},resolver:{account_id:c.config.oracle_account_id,code_hash:h(3)},core:{account_id:'core.sandbox',code_hash:h(4)},terms:c.config};
 const f={profile,c,directory,now:c.config.maturity_ns,paused:false,attempted:false,recovery:'SUBMISSION_UNKNOWN',badCode:false,badBlock:false,sent:0,reads:0};
 const state=()=>({network:'sandbox',contract_id:profile.resolver.account_id,version:'native-trade-twap-v1',source:profile.source.account_id,worker_sha256:EXPIRY_WORKER,paused:f.paused,cases:{[c.config.series_id]:c}});
 const provider={sendJsonRpc:async(method,args)=>{
  f.reads++;
  if(method==='status')return {chain_id:'local',genesis_hash:h(1)};
  if(method==='block')return {header:{hash:h(5),timestamp_nanosec:f.now}};
  assert.equal(args.block_id,h(5));const block_hash=f.badBlock?h(6):h(5);
  if(args.request_type==='view_account')return {block_hash,code_hash:f.badCode?h(7):[profile.core,profile.source,profile.resolver].find(x=>x.account_id===args.account_id).code_hash};
  const values={get_snapshot:state(),get_case:c,get_series:{config:profile.terms,final_price:null},source_hash:c.config.oracle_config_hash,policy_hash:c.config.finalization_policy_hash};
  return {block_hash,result:[...Buffer.from(JSON.stringify(values[args.method_name]))]};
 }};
 const admin={provider,journal:{directory,get:async()=>({attempted:f.attempted})},verify:async()=>{},prepare:async(label,signer,receiver,actions)=>({label,operation_id:label,signer_id:signer,receiver_id:receiver,actions}),recover:async()=>({state:f.recovery}),send:async()=>{f.sent++;throw Error('UNEXPECTED_SEND');}};
 f.tick=()=>new ExpiryCoordinator({profile,admin,signerKey:'unused-fixture'}).tick();
 try{await run(f);assert.equal(f.sent,0);}finally{await rm(directory,{recursive:true,force:true});}
}
test('expiry keeper cannot spend before maturity, during pause, pending callback or rejected evidence',async()=>{
 for(const [change,expected]of [
  [f=>f.now=String(BigInt(f.now)-1n),'WAIT_EXPIRY'],
  [f=>f.paused=true,'PAUSED'],
  [f=>f.c.pending='4','WAIT_CALLBACK'],
  [f=>f.c.last_result='REJECTED','EVIDENCE_REJECTED_REVIEW_REQUIRED']
 ])await fixture(async f=>{change(f);assert.equal((await f.tick()).state,expected);assert.equal((await f.tick()).state,expected);});
});
test('UNKNOWN and failed journal attempts block later operations without a resend',async()=>{
 for(const state of ['SUBMISSION_UNKNOWN','FAILED_CONFIRMED'])await fixture(async f=>{f.attempted=true;f.recovery=state;const r=await f.tick();assert.equal(r.state,'HALTED_TRANSACTION');assert.equal(r.operation,'request');assert.equal(f.reads,0);});
});
test('deployment pins, same-block views and interrupted ownership fail closed',async()=>{
 await fixture(async f=>{f.badCode=true;await assert.rejects(f.tick(),/EXPIRY_CODE/);});
 await fixture(async f=>{f.badBlock=true;await assert.rejects(f.tick(),/EXPIRY_VIEW/);});
 await fixture(async f=>{f.c.config={...f.c.config,strike:'1'};await assert.rejects(f.tick(),/EXPIRY_BINDING/);});
 await fixture(async f=>{f.c.price='1';f.c.accepted={price:'2'};await assert.rejects(f.tick(),/EXPIRY_FINAL_PRICE/);});
 await fixture(async f=>{await mkdir(join(f.directory,'.expiry-coordinator-running'));await assert.rejects(f.tick(),/EXPIRY_BUSY_OR_INTERRUPTED/);});
 await fixture(async f=>{const p=f.profile;assert.throws(()=>expiryProfile({...p,network:'mainnet'}),/EXPIRY_PROFILE/);assert.throws(()=>expiryProfile({...p,deployment_hold:'review'}),/EXPIRY_PROFILE/);assert.throws(()=>expiryProfile({...p,terms:{...p.terms,oracle_version:'native-sampled-v1'}}),/EXPIRY_TERMS/);});
});
test('an unresolved operation in another series blocks this signer before any new work',async()=>{
 await fixture(async f=>{
  await mkdir(join(f.directory,'a'.repeat(64)));
  // A retained attempt belonging to the same nonce owner, not the current case.
  const admin={journal:{directory:f.directory,get:async()=>({intent:{signer_id:f.profile.signer_id},attempted:true,result:{state:'SUBMISSION_UNKNOWN'}})},recover:async()=>({state:'SUBMISSION_UNKNOWN'})};
  assert.equal((await new ExpiryCoordinator({profile:f.profile,admin,signerKey:'unused-fixture'}).tick()).state,'HALTED_SIGNER');
 });
});
