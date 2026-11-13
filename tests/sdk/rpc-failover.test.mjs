import test from 'node:test';
import assert from 'node:assert/strict';
import {Rpc,base58} from '../../packages/sdk/rpc.mjs';
const h=n=>base58(Buffer.alloc(32,n));
const config={rpc_url:'https://primary.example/',network:'testnet',chain_id:'testnet',genesis_hash:h(1),contract_id:'core.testnet',code_hash:h(2)},fallback='https://fallback.example/';
const response=result=>({ok:true,status:200,json:async()=>({result})});
test('wallet reads fail over only after checking fallback chain identity, preserving exact query block',async()=>{
 const calls=[];
 const rpc=new Rpc(config,{fallback_urls:[fallback],fetchImpl:async(url,{body})=>{
  const q=JSON.parse(body);calls.push([url,q]);if(url===config.rpc_url)throw Error('outage');
  return response(q.method==='status'?{chain_id:'testnet',genesis_hash:h(1)}:{block_hash:q.params.block_id,result:[...Buffer.from('{"free":"1"}')]});
 }});
 assert.deepEqual(await rpc.view('get_account',{account_id:'user.testnet'},h(3)),{free:'1'});
 assert.deepEqual(calls.map(([url,q])=>[url,q.method]),[[config.rpc_url,'query'],[fallback,'status'],[fallback,'query']]);
 assert.equal(calls[2][1].params.block_id,h(3));
});
test('wrong fallback chain/genesis and mismatched view block fail closed',async()=>{
 for(const variant of ['chain','genesis','block']){
  let queries=0;const rpc=new Rpc(config,{fallback_urls:[fallback],fetchImpl:async(url,{body})=>{
   if(url===config.rpc_url)throw Error('outage');const q=JSON.parse(body);
   if(q.method==='status')return response({chain_id:variant==='chain'?'mainnet':'testnet',genesis_hash:variant==='genesis'?h(4):h(1)});
   queries++;return response({block_hash:h(4),result:[123,125]});
  }});
  await assert.rejects(rpc.view('get_account',{},h(3)),variant==='block'?/VIEW_BLOCK_MISMATCH/:/RPC_UNAVAILABLE/);
  assert.equal(queries,variant==='block'?1:0);
 }
});
test('rate-limited primary honors cooldown and mutation requests are never sent to a fallback',async()=>{
 let now=0,primary=0,fallbackCalls=0;
 const rpc=new Rpc(config,{fallback_urls:[fallback],now:()=>now,fetchImpl:async(url,{body})=>{
  if(url===config.rpc_url){primary++;return {ok:false,status:429,headers:{get:()=> '120'}};}
  fallbackCalls++;return response(JSON.parse(body).method==='status'?{chain_id:'testnet',genesis_hash:h(1)}:{gas_price:'1'});
 }});
 await rpc.request('gas_price',{block_id:h(3)});await rpc.request('gas_price',{block_id:h(3)});assert.equal(primary,1);
 const before=fallbackCalls;await assert.rejects(rpc.request('broadcast_tx_commit',{signed_tx_base64:'test-only'}),/RPC_UNAVAILABLE/);assert.equal(fallbackCalls,before);
 now=120000;await rpc.request('gas_price',{});assert.equal(primary,2);
 assert.throws(()=>new Rpc(config,{fallback_urls:['https://user:secret@fallback.example/']}),/INVALID_RPC_URL/);
});
