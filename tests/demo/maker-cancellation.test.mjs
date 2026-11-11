// Negative local transport test only; this never creates public execution evidence.
import test from 'node:test';import assert from 'node:assert/strict';
import {fork} from 'node:child_process';import {createServer} from 'node:http';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {AdminTransactions} from '../../services/testnet/transactions.mjs';
import {durableWrite} from '../../services/demo/storage.mjs';
import {KeyPair} from '../../services/testnet/near.mjs';import {base58} from '../../packages/sdk/rpc.mjs';
import {journalCandidates} from '../../services/indexer/discovery.mjs';
function worker(){
 const child=fork(new URL('../../services/maker/worker.mjs',import.meta.url),[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc']});
 return {ask:(method,config)=>new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>reject(Error('timeout')),10000);const receive=m=>{if(m.id!==id)return;clearTimeout(timer);child.off('message',receive);resolve(m);};child.on('message',receive);child.send({id,method,config,request:{}});}),stop:()=>new Promise(r=>{child.once('exit',r);child.kill();})};
}
test('unknown maker cancellation survives restart, blocks quotes, and exposes its original hash without rebroadcast',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hv-maker-cancel-')),methods=[];
 const server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const r=JSON.parse(body);methods.push(r.method);res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:r.id,error:{code:-32000,message:'local test: receipt unavailable'}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let w;
 try{
  const journal=join(dir,'operations'),state=join(dir,'state.json'),identity={kind:'hedgeveil-maker-cancellation-v1',network:'sandbox',genesis_hash:null,contract_id:'core.sandbox',maker:'maker.sandbox'};
  const admin=new AdminTransactions({provider:{},journal,identity,verify:async()=>{}});
  const pending=await admin.prepare('maker-epoch-1','maker.sandbox','core.sandbox',[{type:'FunctionCall',method:'advance_quote_epoch',args:{epoch:'1'},gas:'80000000000000',deposit:'1'}]);
  await admin.journal.claim(pending.operation_id);const hash=base58(Buffer.alloc(32,9));await admin.journal.bind(pending.operation_id,hash);
  const key=generateKeyPairSync('ed25519').privateKey.export({format:'der',type:'pkcs8'}).toString('base64');
  await durableWrite(state,{version:1,private_key:key,epoch:'0',issued:[0],had_quotes:true,retired:false,pending_cancellation:pending});
  const config={network:'sandbox',rpc_url:`http://127.0.0.1:${server.address().port}/`,contract:'core.sandbox',maker:'maker.sandbox',account_key:KeyPair.fromRandom('ed25519').toString(),state_file:state,operation_journal:journal,resume:true};
  for(let i=0;i<2;i++){
   w=worker();assert((await w.ask('init',config)).result);assert.equal((await w.ask('quote')).error,'MAKER_REQUEST_FAILED');await w.stop();w=null;
   const retained=JSON.parse(await readFile(state));assert.deepEqual(retained.pending_cancellation,pending);assert.deepEqual(retained.issued,[0]);assert.equal(retained.had_quotes,true);
  }
  assert.deepEqual(methods,['tx','tx']);assert.deepEqual(await journalCandidates([journal])(),[{hash,signer_id:'maker.sandbox'}]);
  assert.equal((await admin.journal.get(pending.operation_id)).result.state,'SUBMISSION_UNKNOWN');
 }finally{if(w)await w.stop();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
