import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cleanupMakers,cleanupOperations,isolatedRequest,validateCleanupBatch} from '../../services/testnet/maker-cleanup.mjs';
import {AdminTransactions} from '../../services/testnet/transactions.mjs';
import {FileJournal} from '../../packages/sdk/journal.mjs';
import {durableWrite,privateRead} from '../../services/demo/storage.mjs';
const s={slot:0,config:{series_id:'expired',mint_cutoff_ns:'5',maturity_ns:'10'},request:null,final_price:null};
const makers=[{role:'maker',id:'maker'}],accounts={maker:{closing:false,positions:[{p:'30',n:'20'}]}};
test('isolated cleanup only merges matured matched maker claims; never redeems or archives',()=>{
 assert.deepEqual(cleanupOperations([s],makers,accounts,'core','root','9'),[]);
 const ops=cleanupOperations([s],makers,accounts,'core','root','10');assert.equal(ops.length,1);assert.equal(ops[0].args.amount,'20');assert.equal(ops[0].label,'cleanup:merge:expired:maker');
 for(const row of [{...s,request:{}},{...s,final_price:'123',outstanding_p:'0',outstanding_n:'0'}])assert.deepEqual(cleanupOperations([row],makers,accounts,'core','root','10'),[]);
 assert(isolatedRequest({intent:{signer_id:'root',receiver_id:'resolver',actions:[{type:'FunctionCall',method:'request'}]}},'root','resolver'));
 for(const method of ['import_settlement','merge','register_series'])assert(!isolatedRequest({intent:{signer_id:'root',receiver_id:'resolver',actions:[{type:'FunctionCall',method}]}},'root','resolver'));
 assert.throws(()=>validateCleanupBatch({version:1,binding:'wrong',operations:[],id:'x'},'right',makers,'core'),/CLEANUP_BATCH_BINDING/);
});
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'hv-cleanup-'));
 const plan={kind:'hedgeveil-expiry-testnet',network:'sandbox',root_id:'root',genesis_hash:'g',accounts:[...makers,{role:'core',id:'core'},{role:'oracle',id:'resolver'}],source:{account_id:'source'},artifacts:{core:{code_hash:'c'},expiry_oracle:{code_hash:'r'}}};
 await durableWrite(join(directory,'deployment.json'),{client:{contract_id:'core'},source:plan.source,vault_enabled:false});
 await durableWrite(join(directory,'signers.json'),{keys:{maker:'local-test-placeholder'}});
 await mkdir(join(directory,'makers'));await durableWrite(join(directory,'makers/maker.json'),{pending_cancellation:null});
 const provider={sendJsonRpc:async(method,args)=>{
  if(method==='block')return {header:{hash:'h',timestamp_nanosec:'20'}};
  if(method==='query')return {code_hash:args.account_id==='core'?'c':'r',amount:'1000000000000000000000000',storage_usage:0};
  if(method==='EXPERIMENTAL_protocol_config')return {runtime_config:{storage_amount_per_byte:'1'}};
  throw Error('unexpected RPC');
 },callFunction:async({method})=>method==='list_series'?[s]:accounts.maker};
 const admin=new AdminTransactions({provider,journal:join(directory,'admin-journal'),identity:{test:true},verify:async()=>{}});
 let sends=0,crash=false;
 admin.recover=async i=> (await admin.journal.get(i.operation_id)).result??{state:'SUBMISSION_UNKNOWN'};
 admin.send=async i=>{sends++;await admin.journal.claim(i.operation_id);if(crash)throw Error('test interruption');await admin.journal.observe(i.operation_id,{state:'SUCCEEDED',operation_id:i.operation_id});};
 return {directory,plan,admin,get sends(){return sends},set crash(v){crash=v},close:()=>rm(directory,{recursive:true,force:true})};
}
test('root unknown request stays quarantined while a real journaled maker batch completes',async()=>{
 const f=await fixture();try{
  const i=await f.admin.prepare('unknown','root','resolver',[{type:'FunctionCall',method:'request'}]);await f.admin.journal.claim(i.operation_id);
  const result=await cleanupMakers(f,{admin:f.admin});assert.equal(result.merges,1);assert.equal(f.sends,1);
  const root=await f.admin.journal.get(i.operation_id);assert(root.attempted);assert.equal(root.result,null);
  // Even a stale snapshot must not broadcast a completed operation a second time.
  await cleanupMakers(f,{admin:f.admin});assert.equal(f.sends,1);
 }finally{await f.close();}
});
test('interrupted maker merge preserves pending batch and blocks until receipt recovery',async()=>{
 const f=await fixture();try{
  f.crash=true;await assert.rejects(cleanupMakers(f,{admin:f.admin}),/test interruption/);assert.equal(f.sends,1);
  const batch=await privateRead(join(f.directory,'cleanup-pending.json'));
  await assert.rejects(cleanupMakers(f,{admin:f.admin}),/CLEANUP_UNRESOLVED/);assert.equal(f.sends,1);
  const o=batch.operations[0],i=await f.admin.prepare(o.label,o.signer,o.receiver,[{type:'FunctionCall',method:o.method,args:o.args,deposit:o.deposit,gas:'250000000000000'}]);
  await f.admin.journal.observe(i.operation_id,{state:'SUCCEEDED',operation_id:i.operation_id});
  await cleanupMakers(f,{admin:f.admin});assert.equal(f.sends,1);
  await assert.rejects(privateRead(join(f.directory,'cleanup-pending.json')),/ENOENT/);
 }finally{await f.close();}
});
test('unknown root non-request, maker cancellation, pending renewal and active owner all fail closed',async()=>{
 for(const kind of ['root','cancellation','renewal','lock']){
  const f=await fixture();try{
   if(kind==='root'){const i=await f.admin.prepare('unknown','root','core',[{type:'FunctionCall',method:'create_series'}]);await f.admin.journal.claim(i.operation_id);}
   if(kind==='cancellation'){const j=new FileJournal(join(f.directory,'maker-journals/maker'));await j.create({operation_id:'1'.repeat(64)},{});await j.claim('1'.repeat(64));}
   if(kind==='renewal')await durableWrite(join(f.directory,'renewal-pending.json'),{});
   if(kind==='lock')await mkdir(join(f.directory,'admin-journal/.expiry-coordinator-running'),{recursive:true});
   await assert.rejects(cleanupMakers(f,{admin:f.admin}),/CLEANUP_|EXPIRY_BUSY/);assert.equal(f.sends,0);
  }finally{await f.close();}
 }
});
