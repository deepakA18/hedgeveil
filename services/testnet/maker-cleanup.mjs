// Signer-isolated exit maintenance; never retries the quarantined root request.
import {join} from 'node:path';
import {mkdir,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {privateRead,durableWrite} from '../demo/storage.mjs';
import {adminFor,functionCall} from './deploy.mjs';
import {assertDeploymentEnabled} from './workspace.mjs';
import {FileJournal,terminal} from '../../packages/sdk/journal.mjs';
import {canonical,fail} from '../../packages/sdk/intent.mjs';
import {retainedSeries} from '../../packages/sdk/series.mjs';
import {harvestOperations,renewalBudget} from './renewal.mjs';
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const records=async journal=>{
 let names;try{names=await readdir(journal.directory);}catch(e){if(e.code==='ENOENT')return [];throw e;}
 return Promise.all(names.filter(n=>/^[a-f0-9]{64}$/.test(n)).map(n=>journal.get(n)));
};
export function isolatedRequest(r,root,resolver){
 const i=r.intent,a=i.actions;
 return i.signer_id===root&&i.receiver_id===resolver&&a.length===1&&a[0].type==='FunctionCall'&&a[0].method==='request';
}
export function cleanupOperations(series,makers,accounts,core,root,now){
 return harvestOperations(series.filter(s=>BigInt(s.config.maturity_ns)<=BigInt(now)),makers,accounts,core,root,now)
  .filter(o=>o.method==='merge').map(o=>({...o,label:o.label.replace('renewal:','cleanup:')}));
}
export function validateCleanupBatch(batch,binding,makers,core){
 if(batch.version!==1||batch.binding!==binding||batch.id!==digest(batch.operations)||!Array.isArray(batch.operations))fail('CLEANUP_BATCH_BINDING');
 for(const o of batch.operations){
  if(!makers.some(m=>m.id===o.signer)||o.receiver!==core||o.method!=='merge'||o.deposit!=='1'||!/^cleanup:merge:/.test(o.label)||Object.keys(o.args).sort().join(',')!=='amount,series_id'||!/^\d+$/.test(o.args.amount)||BigInt(o.args.amount)<=0n)fail('CLEANUP_ACTION');
 }
}
export async function cleanupMakers({directory,plan},{admin}={}){
 assertDeploymentEnabled(plan);
 if(plan.kind!=='hedgeveil-expiry-testnet'||!['sandbox','testnet'].includes(plan.network))fail('CLEANUP_PROFILE');
 admin??=adminFor(directory,plan);
 const lock=join(directory,'admin-journal','.expiry-coordinator-running');let owned=false;
 try{
  await mkdir(join(directory,'admin-journal'),{recursive:true,mode:0o700});
  try{await mkdir(lock,{mode:0o700});owned=true;}catch(e){if(e.code==='EEXIST')fail('EXPIRY_BUSY_OR_INTERRUPTED');throw e;}
  await durableWrite(join(lock,'owner.json'),{pid:process.pid,started_at:new Date().toISOString(),mode:'maker-cleanup'});
  await admin.verify();
  const d=await privateRead(join(directory,'deployment.json'));
  const core=plan.accounts.find(a=>a.role==='core').id,resolver=plan.accounts.find(a=>a.role==='oracle').id,makers=plan.accounts.filter(a=>a.role==='maker');
  if(d.client.contract_id!==core||canonical(d.source)!==canonical(plan.source)||d.vault_enabled!==false)fail('CLEANUP_BINDING');
  const rpc=admin.provider,head=await rpc.sendJsonRpc('block',{finality:'final'}),hash=head.header.hash;
  for(const c of [{account_id:core,code_hash:plan.artifacts.core.code_hash},{account_id:resolver,code_hash:plan.artifacts.expiry_oracle.code_hash}]){
   const n=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:c.account_id,block_id:hash});if(n.code_hash!==c.code_hash)fail('CLEANUP_CODE');
  }
  // Other unknown root actions may change inventory/terms: only a resolver request
  // is isolated. Maker writes remain quarantined even when held in another journal.
  for(const r of await records(admin.journal))if(r.attempted&&!terminal(r.result?.state)){
   if(isolatedRequest(r,plan.root_id,resolver))continue;
   if(!terminal((await admin.recover(r.intent)).state))fail('CLEANUP_UNRESOLVED');
  }
  for(const m of makers){
   const j=new FileJournal(join(directory,'maker-journals',m.id));
   if((await records(j)).some(r=>r.attempted&&!terminal(r.result?.state)))fail('CLEANUP_MAKER_UNRESOLVED');
   const state=await privateRead(join(directory,'makers',m.id+'.json'));
   if(state.pending_cancellation)fail('CLEANUP_MAKER_UNRESOLVED');
  }
  // A retained renewal batch owns its original inventory plan; do not compete.
  try{await privateRead(join(directory,'renewal-pending.json'));fail('CLEANUP_RENEWAL_PENDING');}catch(e){if(e.code!=='ENOENT')throw e;}
  const binding=digest({core,resolver,genesis_hash:plan.genesis_hash}),pendingFile=join(directory,'cleanup-pending.json');let batch;
  try{batch=await privateRead(pendingFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  const view=(method,args={})=>rpc.callFunction({contractId:core,method,args,blockQuery:{blockId:hash}});
  if(!batch){
   const series=await retainedSeries(view),accounts={};for(const m of makers)accounts[m.id]=await view('get_account',{account_id:m.id});
   const operations=cleanupOperations(series,makers,accounts,core,plan.root_id,head.header.timestamp_nanosec);
   batch={version:1,binding,id:digest(operations),operations,observed_block:hash,created_at:new Date().toISOString()};
  }
  validateCleanupBatch(batch,binding,makers,core);
  if(batch.operations.length){
   const balances={};for(const m of makers)balances[m.id]=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:m.id,finality:'final'});
   const byteCost=(await rpc.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
   renewalBudget({operations:batch.operations,balances,byteCost,root:plan.root_id,unresolved:0});
   await durableWrite(pendingFile,batch);
   const {keys}=await privateRead(join(directory,'signers.json'));
   for(const o of batch.operations){
    if(!keys[o.signer])fail('CLEANUP_SIGNER');
    const i=await admin.prepare(o.label,o.signer,o.receiver,[functionCall(o.method,o.args,o.deposit)]);
    const r=await admin.journal.get(i.operation_id);
    if(r.result?.state!=='SUCCEEDED')await admin.send(i,keys[o.signer]);
   }
   await mkdir(join(directory,'cleanup-batches'),{recursive:true,mode:0o700});
   await durableWrite(join(directory,'cleanup-batches',batch.id+'.json'),{...batch,completed_at:new Date().toISOString()});await rm(pendingFile);
  }
  const result={version:1,state:'COMPLETE',checked_at:new Date().toISOString(),merges:batch.operations.length,batch_id:batch.id};
  await durableWrite(join(directory,'cleanup-status.json'),result);return result;
 }catch(e){await durableWrite(join(directory,'cleanup-status.json'),{version:1,state:'BLOCKED',checked_at:new Date().toISOString(),code:/^[A-Z_]{1,80}$/.test(e.code??e.message??'')?(e.code??e.message):'CLEANUP_UNAVAILABLE'});throw e;}
 finally{if(owned)await rm(lock,{recursive:true});}
}
