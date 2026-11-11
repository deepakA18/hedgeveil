// Replay of retained real public evidence, not a simulated public execution.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {refreshReportProof} from '../../services/outlayer/refresh-fast.mjs';
const proof=JSON.parse(await readFile(new URL('../../research/reports/outlayer-wallet-refresh-verification.json',import.meta.url)));
const profile={network:'testnet',genesis_hash:proof.status.genesis_hash,signer_id:proof.receipt.transaction.signer_id,source:{account_id:'price-oracle.testnet',code_hash:proof.source.code_hash}};
function replay(value){const calls=[];let release;const gate=new Promise(r=>{release=r;});return {calls,sendJsonRpc:async(method,args)=>{calls.push({method,args});if(calls.length===4)release();await gate;if(method==='block')return value.block;if(args.request_type==='view_account')return value.source;return value.asset;}};}
test('refresh fast path authenticates actual callback-block state with four concurrent reads',async()=>{
 const rpc=replay(proof),r=await refreshReportProof(proof.receipt,profile,rpc,proof.status);
 assert.equal(r.verified.transaction_hash,proof.receipt.transaction.hash);assert.equal(r.verified.timestamp_ns,proof.block.header.timestamp_nanosec);
 assert.equal(r.asset.reports[0].timestamp,r.verified.timestamp_ns);assert.equal(rpc.calls.length,4);
 for(const call of rpc.calls.filter(c=>c.method==='query'))assert.equal(call.args.block_id,proof.block.header.hash);
});
test('changed callback source code, report timestamp, asset or incomplete receipt fails closed',async()=>{
 for(const change of [p=>p.source.code_hash='1'.repeat(32),p=>{const asset=JSON.parse(Buffer.from(p.asset.result).toString());asset.reports[0].timestamp='1';p.asset.result=[...Buffer.from(JSON.stringify(asset))];},p=>{const asset=JSON.parse(Buffer.from(p.asset.result).toString());asset.reports=[];p.asset.result=[...Buffer.from(JSON.stringify(asset))];}]){const p=structuredClone(proof);change(p);await assert.rejects(refreshReportProof(p.receipt,profile,replay(p),p.status));}
 const raw=structuredClone(proof.receipt);raw.receipts_outcome.pop();await assert.rejects(refreshReportProof(raw,profile,replay(proof),proof.status));
});

async function coordinatorFixture(t,{cached=false}={}){
 const {SampleCoordinator,ACCEPTED_POLICY}=await import('../../services/outlayer/sampler.mjs'),{FileJournal}=await import('../../packages/sdk/journal.mjs'),{base58}=await import('../../packages/sdk/rpc.mjs');
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const dir=await mkdtemp(join(tmpdir(),'hv-fast-sample-'));t.after(()=>rm(dir,{recursive:true,force:true}));const S=1000000000n,stamp=BigInt(proof.block.header.timestamp_nanosec),h=base58(Buffer.alloc(32,9));
 const terms={series_id:'unit',oracle_account_id:'resolver.testnet',oracle_version:'native-sampled-v1',observation_window:{start_ns:String(stamp-20n*S),end_ns:String(stamp+520n*S)},maturity_ns:String(stamp+520n*S)};
 const c={config:terms,source:{account:'price-oracle.testnet',reporter:'price-oracle.testnet',asset:'wrap.near',min_price:'1',max_price:'100000000000000'},samples:[null,null,null],pending:null,price:null};
 const p={...profile,chain_id:'testnet',policy_acceptance:ACCEPTED_POLICY,terms,resolver:{account_id:'resolver.testnet',code_hash:base58(Buffer.alloc(32,2))},core:{account_id:'core.testnet',code_hash:base58(Buffer.alloc(32,3))}};
 let refreshed=false;const sent=[],journal=new FileJournal(dir);
 const admin={journal,evidence:new Map(),verify:async()=>{},provider:{sendJsonRpc:async(method,args)=>{
  if(method==='status')return proof.status;
  if(method==='block')return args.block_id?proof.block:{header:{hash:h,timestamp_nanosec:String(stamp+(refreshed?1n:-1n)*S)}};
  if(method==='query'){
   if(args.block_id===proof.block.header.hash)return args.request_type==='view_account'?proof.source:proof.asset;
   if(args.request_type==='view_account')return {block_hash:h,code_hash:[p.source,p.resolver,p.core].find(x=>x.account_id===args.account_id).code_hash};
   const value=args.method_name==='get_price_data'?{recency_duration_sec:300}:args.method_name==='get_snapshot'?{network:'testnet',contract_id:p.resolver.account_id,version:'native-sampled-v1',paused:false,cases:{unit:c}}:{reports:cached?[{oracle_id:'price-oracle.testnet',timestamp:String(stamp-120n*S),price:{multiplier:'300000000',decimals:8}}]:[]};
   return {block_hash:h,result:[...Buffer.from(JSON.stringify(value))]};
  }throw Error('unexpected local test method');}},
  prepare:async(label,signer_id,receiver_id,actions)=>{const intent={label,signer_id,receiver_id,actions,operation_id:createHash('sha256').update(label).digest('hex')};await journal.create(intent,{local_unit_test:true});return intent;},
  recover:async intent=>(await journal.get(intent.operation_id)).result,
  send:async intent=>{await journal.claim(intent.operation_id);const method=intent.actions[0].method;sent.push(method);if(method==='request_price_data'){refreshed=true;admin.evidence.set(intent.operation_id,proof.receipt);}else if(method==='sample')c.samples[0]={price:'1'};return journal.observe(intent.operation_id,{state:'SUCCEEDED',operation_id:intent.operation_id});}};
 return {tick:()=>new SampleCoordinator({profile:p,admin}).tick(),sent};
}
test('coordinator submits the on-chain sample immediately after authenticated refresh; restart cannot duplicate it',async t=>{
 const {tick,sent}=await coordinatorFixture(t);const result=await tick();assert.equal(result.operation,'refresh:0');assert.equal(result.followup.operation,'sample:0');assert.deepEqual(sent,['request_price_data','sample']);
 assert.equal((await tick()).state,'WAIT_NEXT_SLOT');assert.equal(sent.length,2);
});

test('a cached public source report defers the refresh allowance instead of spending it on a cached response',async t=>{
 const {tick,sent}=await coordinatorFixture(t,{cached:true});
 for(let i=0;i<2;i++){const result=await tick();assert.equal(result.state,'WAIT_SOURCE_CACHE');assert.equal(result.next_poll_ms,30000);}
 assert.deepEqual(sent,[]);
});
