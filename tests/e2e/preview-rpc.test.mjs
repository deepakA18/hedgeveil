import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../../apps/web/server.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {ClientError} from '../../packages/sdk/intent.mjs';
import {errorText} from '../../apps/web/public/model.mjs';

test('RPC failure before wallet handoff is distinguished from unresolved submission',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'hv-preview-rpc-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const app=createApp({config:{network:'testnet',chain_id:'testnet',genesis_hash:base58(Buffer.alloc(32,1)),contract_id:'core.testnet',code_hash:base58(Buffer.alloc(32,2)),rpc_url:'https://rpc.testnet.near.org/'},journal:dir,wallet:{assets:new Map()},store:{read:async()=>({health:{risk_allowed:true}})}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const origin=`http://127.0.0.1:${app.server.address().port}`;
 const post=async(path,body)=>(await fetch(origin+'/api/'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})).json();
 let calls=0;
 app.client.rpc.verify=async()=>{if(++calls>1)throw new ClientError('RPC_UNAVAILABLE');};
 const input={signer_id:'user.testnet',method:'deposit_collateral',args:{},attached_deposit:'100000000000000000000000',operation_id:'a'.repeat(64)};
 assert.deepEqual(await post('prepare',input),{error:'PREVIEW_RPC_UNAVAILABLE'});
 assert.equal((await app.client.record(input.operation_id)).attempted,false);
 assert.match(errorText.PREVIEW_RPC_UNAVAILABLE,/did not send/);
 // The same transport failure during recovery must never invite a resend.
 await app.client.journal.claim(input.operation_id);
 assert.deepEqual(await post('recover',{id:input.operation_id}),{error:'RPC_UNAVAILABLE'});
 assert.equal((await app.client.record(input.operation_id)).attempted,true);
 assert.match(errorText.RPC_UNAVAILABLE,/do not repeat/);
});

test('first-deposit preview separates storage and rechecks registration before handoff',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'hv-first-preview-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const app=createApp({config:{network:'testnet',chain_id:'testnet',genesis_hash:base58(Buffer.alloc(32,1)),contract_id:'core.testnet',code_hash:base58(Buffer.alloc(32,2)),rpc_url:'https://rpc.testnet.near.org/'},journal:dir,wallet:{assets:new Map()},store:{read:async()=>({health:{risk_allowed:true}})}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const origin=`http://127.0.0.1:${app.server.address().port}`;
 const post=async(path,body)=>(await fetch(origin+'/api/'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})).json();
 let account=null;const hash=base58(Buffer.alloc(32,3)),minimum='40960000000000000000000';
 app.client.rpc.verify=async()=>{};
 app.client.rpc.request=async(method,params)=>{
  if(method==='block')return {header:{hash,timestamp_nanosec:'1'}};
  if(method==='gas_price')return {gas_price:'100000000'};
  if(params.request_type==='view_account')return {amount:'10000000000000000000000000',storage_usage:182};
  const views={get_account:account,list_series:[],get_vault:null,storage_quote:{account_minimum:minimum,storage_byte_cost:'10000000000000000000'},list_tickets:[],vault_risk:{},get_pauses:{deposits:false}};
  assert(Object.hasOwn(views,params.method_name));return {block_hash:hash,result:[...Buffer.from(JSON.stringify(views[params.method_name]))]};
 };
 const i={signer_id:'user.testnet',method:'deposit_collateral',args:{},attached_deposit:'140960000000000000000000',storage_deposit:minimum};
 const preview=await post('prepare',i);assert.deepEqual(preview.blockers,[]);assert.equal(preview.outputs[0].amount,'100000000000000000000000');
 account={free:'0',storage_paid:minimum,positions:[],closing:false};
 assert.deepEqual(await post('handoff',{id:preview.intent.operation_id}),{error:'ACCOUNT_ALREADY_REGISTERED'});
 assert.equal((await app.client.record(preview.intent.operation_id)).attempted,false);
 account=null;const bad=await post('prepare',{...i,storage_deposit:'1'});assert(bad.blockers.includes('INSUFFICIENT_STORAGE'));
});

test('ten simultaneous display sessions share common pinned reads; previews always reverify',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'hv-live-read-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const app=createApp({config:{network:'testnet',chain_id:'testnet',genesis_hash:base58(Buffer.alloc(32,1)),contract_id:'core.testnet',code_hash:base58(Buffer.alloc(32,2)),rpc_url:'https://rpc.testnet.near.org/'},journal:dir,wallet:{assets:new Map()},store:{read:async()=>({health:{risk_allowed:true}})}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const origin=`http://127.0.0.1:${app.server.address().port}`,hash=base58(Buffer.alloc(32,3)),counts=new Map();let verifies=0;
 app.client.rpc.verify=async()=>{verifies++;};
 app.client.rpc.request=async(method,params)=>{
  const key=params?.method_name??method;counts.set(key,(counts.get(key)??0)+1);
  if(method==='block')return {header:{hash,timestamp_nanosec:'1'}};
  assert.equal(params.block_id,hash);
  if(method==='gas_price')return {gas_price:'100000000'};
  if(params.request_type==='view_account')return {amount:'10000000000000000000000000',storage_usage:182};
  const views={get_account:{free:'0',retained_tickets:0,closing:false},list_series:[],get_vault:null,storage_quote:{account_minimum:'40960000000000000000000',storage_byte_cost:'10000000000000000000'},vault_risk:{},get_pauses:{deposits:false}};
  assert(Object.hasOwn(views,params.method_name));return {block_hash:hash,result:[...Buffer.from(JSON.stringify(views[params.method_name]))]};
 };
 const rows=await Promise.all(Array.from({length:10},(_,i)=>fetch(origin+`/api/live?account=user${i}.testnet`).then(r=>r.json())));
 assert(rows.every(r=>r.block_hash===hash));assert.equal(verifies,1);assert.equal(counts.get('block'),1);assert.equal(counts.get('get_account'),10);assert.equal(counts.get('list_tickets'),undefined);assert.equal(counts.get('get_vault'),1);
 await fetch(origin+'/api/prepare',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({signer_id:'user0.testnet',method:'deposit_collateral',args:{},attached_deposit:'100000000000000000000000'})});
 assert(verifies>1);assert.equal(counts.get('block'),2);
});
