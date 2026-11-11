import test from 'node:test';import assert from 'node:assert/strict';
import {NeardataHeaders} from '../../services/indexer/neardata.mjs';
import {configuration,ReadRpc} from '../../services/indexer/rpc.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
const h=n=>base58(Buffer.alloc(32,n));
const cfg={network:'testnet',chain_id:'testnet',genesis_hash:h(1),anchor_hash:h(2),rpc_urls:['https://test.rpc.fastnear.com/'],contracts:[{account_id:'core.testnet',kind:'core',code_hash:h(3)}],postgres:{host:'127.0.0.1',port:5432,user:'fixture',password:'fixture',database:'fixture'},header_source:'neardata-testnet',request_interval_ms:0};
test('hosted header hints reject absent/wrong heights and malformed data',async()=>{
 for(const b of [null,{}, {header:{height:4},chunks:[]}]){const n=new NeardataHeaders({fetchImpl:async()=>({ok:true,json:async()=>b})});await assert.rejects(n.block(5),/HEADER_INVALID/);}
 assert.throws(()=>configuration({...cfg,header_source:'mainnet'}),/HEADER_SOURCE_CONFIGURATION/);
});
test('header cooldown honors 429 without treating it as an empty block',async()=>{
 let calls=0;const n=new NeardataHeaders({now:()=>0,fetchImpl:async()=>{calls++;return {status:429,headers:{get:()=> '90'}};}});
 await assert.rejects(n.block(5),/HEADER_RATE_LIMITED/);await assert.rejects(n.block(6),/HEADER_COOLDOWN/);assert.equal(calls,1);assert.equal(n.cooldown,90000);
});
test('hosted hints cannot replace final head identity and unavailable hints use pinned RPC',async()=>{
 const calls=[];const r=new ReadRpc(configuration(cfg),{fetchImpl:async(url,opts)=>{
  calls.push(url);if(url.includes('neardata'))return {ok:true,json:async()=>null};
  const q=JSON.parse(opts.body);return {ok:true,json:async()=>({result:q.method==='status'?{chain_id:'testnet',genesis_hash:h(1)}:{header:{height:5,hash:h(4)}}})};
 }});
 await r.request('block',{block_id:5});assert.equal(calls.filter(u=>u.includes('neardata')).length,1);
 await r.request('block',{finality:'final'});assert.equal(calls.filter(u=>u.includes('neardata')).length,1);
});
