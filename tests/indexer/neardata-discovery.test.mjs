import test from 'node:test';
import assert from 'node:assert/strict';
import {feedBlock,NeardataFeed,NeardataDiscovery} from '../../services/indexer/neardata-discovery.mjs';
import {Store} from '../../services/indexer/store.mjs';
import {configuration} from '../../services/indexer/rpc.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {startPostgres} from './postgres.mjs';
const h=n=>base58(Buffer.alloc(32,n)),contracts=[{account_id:'core.testnet',kind:'core',code_hash:h(9)}];
function full(height=2){return {block:{header:{height,hash:h(height),prev_hash:h(height-1),timestamp_nanosec:'1'},chunks:[{shard_id:0,chunk_hash:h(10)}]},shards:[{shard_id:0,chunk:{header:{chunk_hash:h(10)},transactions:[{transaction:{hash:h(11),signer_id:'user.testnet',receiver_id:'unrelated.testnet',actions:[]}}]},receipt_execution_outcomes:[{tx_hash:h(11),receipt:{receipt_id:h(12),receiver_id:'core.testnet',predecessor_id:'router.testnet',receipt:{Action:{signer_id:'user.testnet'}}},execution_outcome:{id:h(12),block_hash:h(height),outcome:{executor_id:'core.testnet',status:{Failure:{}}}}}]}]};}
test('full feed discovers routed and failed calls without journal hints; excludes system refund signer',()=>{
 const value=full();assert.deepEqual(feedBlock(value,2,contracts).hints,[{hash:h(11),signer_id:'user.testnet'}]);
 value.shards[0].receipt_execution_outcomes[0].receipt.predecessor_id='system';assert.deepEqual(feedBlock(value,2,contracts).hints,[]);
 value.shards[0].chunk.transactions[0].transaction.receiver_id='core.testnet';assert.equal(feedBlock(value,2,contracts).hints.length,1);
});
test('malformed or incomplete full blocks cannot be treated as no activity',()=>{
 for(const edit of [v=>v.shards=[],v=>v.shards.push(v.shards[0]),v=>v.shards[0].receipt_execution_outcomes[0].execution_outcome.block_hash=h(20),v=>v.shards[0].receipt_execution_outcomes[0].tx_hash='bad',v=>v.block.header.height=3]){
  const v=full();edit(v);assert.throws(()=>feedBlock(v,2,contracts));
 }
 assert.equal(feedBlock(null,2,contracts),null);
});
test('free transport rate budget and cooldown apply to all request paths',async()=>{
 let time=0,calls=0;const feed=new NeardataFeed({now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({})};}});
 await feed.get('last_block/final');await feed.get('block/2');assert.equal(time,400);
 feed.fetch=async()=>({status:429,headers:{get:()=> '90'}});
 await assert.rejects(feed.get('block/3'),/FEED_RATE_LIMITED/);await assert.rejects(feed.get('block/4'),/FEED_COOLDOWN/);assert.equal(calls,2);
 const zero=new NeardataFeed({now:()=>0,fetchImpl:async()=>({status:429,headers:{get:()=> '0'}})});
 await assert.rejects(zero.get('last_block/final'),/FEED_RATE_LIMITED/);assert.equal(zero.cooldown,60000);
});
test('prefetch failure commits only preceding heights and can resume',async()=>{
 let height=1,broken=true;const committed=[];
 const store={feedState:async()=>({height}),advanceFeed:async h=>{height=h;committed.push(h);},feedObserved:async()=>{}};
 const feed={get:async path=>{if(path==='last_block/final')return full(4);if(path==='block/3'&&broken)throw Error('unavailable');return full(Number(path.split('/')[1]));}};
 const scanner=new NeardataDiscovery(store,contracts,{feed});
 await assert.rejects(scanner.step(),/unavailable/);assert.deepEqual(committed,[2]);broken=false;await scanner.step();assert.deepEqual(committed,[2,3,4]);
});
test('a conflicting same-height final head cannot refresh feed health',async()=>{
 const store={feedState:async()=>({height:'2',block_height:'2',block_hash:h(30)})};
 await assert.rejects(new NeardataDiscovery(store,contracts,{feed:{get:async()=>full(2)}}).step(),/FEED_HEAD_MISMATCH/);
});
test('Postgres persists cursor/hints atomically; gap, conflicts, restart and feed outage gate risk',async t=>{
 const pg=await startPostgres();let store;
 t.after(async()=>{await store?.close();await pg.runtime.stop();});
 const cfg=configuration({network:'testnet',chain_id:'testnet',genesis_hash:h(8),anchor_hash:h(1),rpc_urls:['https://test.rpc.fastnear.com/'],contracts,postgres:pg.config,transaction_filter:'canonical-journal',discovery_source:'neardata-testnet'});
 assert.throws(()=>configuration({...cfg,transaction_filter:'all'}),/DISCOVERY_SOURCE_CONFIGURATION/);
 store=new Store(cfg);await store.init({header:{height:1,hash:h(1)}});await store.initFeed();
 await store.transaction(db=>db.query("UPDATE meta SET checked_at=now(),health=$1 WHERE id=1",[{state:'RECONCILED',risk_allowed:true}]));
 assert.equal((await store.read('health')).health.risk_allowed,false);
 await store.advanceFeed(2,feedBlock(full(),2,contracts),2);
 assert.equal((await store.read('health')).health.risk_allowed,true);
 await assert.rejects(store.advanceFeed(4,feedBlock(full(4),4,contracts),4),/FEED_CURSOR_CHANGED/);
 const conflict=feedBlock(full(3),3,contracts);conflict.hints[0].signer_id='other.testnet';
 await assert.rejects(store.advanceFeed(3,conflict,3),/FEED_SIGNER_CONFLICT/);
 assert.equal((await store.feedState()).height,'2');assert.equal((await store.feedCandidates())[0].signer_id,'user.testnet');
 await store.close();store=new Store(cfg);await store.initFeed();assert.equal((await store.feedState()).baseline_height,'1');assert.equal((await store.feedState()).height,'2');
 await store.advanceFeed(3,null,4);
 await assert.rejects(store.advanceFeed(4,feedBlock(full(4),4,contracts),4),/FEED_PARENT_MISMATCH/);
 await store.feedFailure('FEED_RATE_LIMITED',Date.now()+90000);assert.equal((await store.read('health')).health.risk_allowed,false);
 const retryAt=(await store.feedState()).retry_at_ms;await store.close();store=new Store(cfg);assert.equal((await store.feedState()).retry_at_ms,retryAt);
 const additive=new Store({...cfg,discovery_required:false});
 try{const health=(await additive.read('health')).health;assert.equal(health.risk_allowed,true);assert.equal(health.discovery.required,false);await store.markFailure('CUSTODY_MISMATCH');assert.equal((await additive.read('health')).health.risk_allowed,false);}finally{await additive.close();}
 let called=false;const blockedFeed=new NeardataFeed({fetchImpl:async()=>{called=true;throw Error('should not fetch');}});
 await assert.rejects(new NeardataDiscovery(store,contracts,{feed:blockedFeed}).step(),/FEED_COOLDOWN/);assert.equal(called,false);
});
