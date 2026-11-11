import test from 'node:test';
import assert from 'node:assert/strict';
import {collectJournalTransactions} from '../../services/indexer/discovery.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
const h=n=>base58(Buffer.alloc(32,n));
function fixture(){
 const tx={hash:h(1),signer_id:'alice.testnet',receiver_id:'other.testnet'},root={id:h(1),block_hash:h(2),outcome:{executor_id:tx.signer_id,receipt_ids:[h(3)],status:{SuccessReceiptId:h(3)},logs:[]}},child={id:h(3),block_hash:h(2),outcome:{executor_id:tx.receiver_id,receipt_ids:[],status:{SuccessValue:''},logs:[]}};
 const raw={final_execution_status:'FINAL',transaction:tx,transaction_outcome:root,receipts_outcome:[child]},block={header:{hash:h(2),height:11},chunks:[{chunk_hash:h(4),height_included:11,tx_root:h(5)}]},chunk={header:{chunk_hash:h(4),height_created:11,tx_root:h(5)},transactions:[tx]};
 const options={candidates:[{hash:tx.hash,signer_id:tx.signer_id}],known:new Set(),head:block,blocks:[block],anchor:{header:{hash:h(6),height:10}},storedBlock:async()=>undefined,contracts:[],network:'testnet',rpc:{request:async method=>method==='tx'?raw:method==='chunk'?chunk:block}};
 return {raw,block,chunk,options};
}
test('journal hints require FINAL complete trees and real chunk inclusion',async()=>{
 const {options,raw,chunk}=fixture();assert.equal((await collectJournalTransactions(options)).length,1);
 chunk.transactions=[];await assert.rejects(collectJournalTransactions(options),/TRANSACTION_INCLUSION/);
 raw.receipts_outcome=[];await assert.rejects(collectJournalTransactions(options),/RECEIPT_TREE/);
 raw.final_execution_status='EXECUTED';await assert.rejects(collectJournalTransactions(options),/TRANSACTION_NOT_FINAL/);
});
test('unanchored receipts fail and future receipts wait without projection',async()=>{
 const {options,raw}=fixture();raw.receipts_outcome[0].block_hash=h(8);
 options.rpc.request=async method=>method==='tx'?raw:{header:{hash:h(8),height:11}};
 await assert.rejects(collectJournalTransactions(options),/RECEIPT_OUTSIDE_ANCESTRY/);
 options.rpc.request=async method=>method==='tx'?raw:{header:{hash:h(8),height:12}};
 assert.deepEqual(await collectJournalTransactions(options),[]);
});
test('known transactions are retained without fetching or trusting journal outcomes',async()=>{
 const {options}=fixture();options.known.add(h(1));options.rpc.request=()=>{throw Error('must not fetch');};assert.deepEqual(await collectJournalTransactions(options),[]);
});

test('canonical checkpoint mode verifies receipt hashes against canonical heights',async()=>{
 const {options,raw,block,chunk}=fixture();options.blocks=[];options.canonical=true;
 options.rpc.request=async(method,params)=>method==='tx'?raw:method==='chunk'?chunk:block;
 assert.equal((await collectJournalTransactions(options)).length,1);
 options.blocks=[];options.rpc.request=async(method,params)=>method==='tx'?raw:typeof params.block_id==='number'?{...block,header:{...block.header,hash:h(9)}}:block;
 await assert.rejects(collectJournalTransactions(options),/CANONICAL_BLOCK_MISMATCH/);
});

test('explicit unknown hints remain unresolved and are retried without projecting success',async()=>{
 const {options,raw,chunk}=fixture(),unresolved=[];let reads=0;
 options.unresolved=unresolved;
 options.rpc.request=async()=>{reads++;throw Object.assign(Error('RPC_TRANSACTION_UNKNOWN'),{code:'RPC_TRANSACTION_UNKNOWN'});};
 assert.deepEqual(await collectJournalTransactions(options),[]);
 assert.deepEqual(unresolved,[{...options.candidates[0],state:'SUBMISSION_UNKNOWN'}]);
 options.rpc.request=async method=>{reads++;return method==='tx'?raw:chunk;};
 assert.equal((await collectJournalTransactions({...options,unresolved:[]})).length,1);assert(reads>1);
 options.rpc.request=async()=>{throw Error('RPC_UNAVAILABLE_OR_MISMATCH');};
 await assert.rejects(collectJournalTransactions(options),/RPC_UNAVAILABLE_OR_MISMATCH/);
});
