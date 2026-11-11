import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {configuration,binding,ReadRpc} from '../../services/indexer/rpc.mjs';
import {operationId,extractEvents,replayCore} from '../../services/indexer/model.mjs';
import {walletIndexerConfiguration,boundStore} from '../../services/indexer/profile.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {watchedRoot} from '../../services/indexer/indexer.mjs';
const h=n=>base58(Buffer.alloc(32,n));
const config={network:'testnet',chain_id:'testnet',genesis_hash:h(1),anchor_hash:h(2),rpc_urls:['https://rpc.testnet.near.org/'],contracts:[{account_id:'core.testnet',kind:'core',code_hash:h(3)},{account_id:'oracle.testnet',kind:'oracle',code_hash:h(4)}],postgres:{host:'127.0.0.1',port:5432,user:'fixture',password:'fixture',database:'fixture'}};
const client={network:'testnet',chain_id:'testnet',genesis_hash:h(1),contract_id:'core.testnet',code_hash:h(3),rpc_url:config.rpc_urls[0]};
test('watched-root discovery is explicit and bound; complete receipt and snapshot checks remain required',()=>{
    assert(watchedRoot({receiver_id:'core.testnet'},config.contracts));
    assert(watchedRoot({receiver_id:'relay.testnet',actions:[{Delegate:{delegate_action:{receiver_id:'oracle.testnet'}}}]},config.contracts));
    assert(!watchedRoot({receiver_id:'unrelated.testnet'},config.contracts));
    assert(!watchedRoot({receiver_id:'relay.testnet',actions:[{FunctionCall:{method_name:'core.testnet'}}]},config.contracts));
    assert.notDeepEqual(binding(configuration(config)),binding(configuration({...config,transaction_filter:'watched-roots'})));
    assert.throws(()=>configuration({...config,transaction_filter:'unchecked'}),/TRANSACTION_FILTER/);
});
test('testnet indexer is explicit HTTPS and rejects mixed/public-production profiles',()=>{
    assert.equal(configuration(config).network,'testnet');
    for(const patch of [{network:'mainnet'},{chain_id:'sandbox'},{rpc_urls:['http://rpc.testnet.near.org/']},{rpc_urls:['https://user:password@rpc.testnet.near.org/']},{rpc_urls:['https://rpc.testnet.near.org/?api_key=fixture']}])assert.throws(()=>configuration({...config,...patch}));
});
test('testnet event operation IDs and replay cannot cross network domains',async()=>{
    const previous=JSON.parse(await readFile(new URL('../../research/reports/g7-client.json',import.meta.url)));
    const e=structuredClone(previous.events.find(x=>x.event.event==='INITIALIZED').event);
    e.domain.network='testnet';e.domain.contract_id='core.testnet';e.operation_id=operationId('core.testnet','1','testnet');
    const row={id:h(5),outcome:{executor_id:'core.testnet',status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify({standard:'hedgeveil',version:'0.2.0',event:'ledger',data:[e]})]}};
    const events=extractEvents(row,config.contracts,'testnet');assert.equal(replayCore('core.testnet',events,'testnet').sequence,'1');
    assert.notEqual(e.operation_id,operationId('core.testnet','1','sandbox'));
    assert.throws(()=>extractEvents(row,config.contracts,'sandbox'),/EVENT_SCHEMA/);
    assert.throws(()=>replayCore('core.testnet',events,'sandbox'),/EVENT_SEQUENCE_GAP/);
});
test('wrong chain or genesis is rejected before a testnet read',async()=>{
    for(const status of [{chain_id:'mainnet',genesis_hash:h(1)},{chain_id:'testnet',genesis_hash:h(2)}]){
        let reads=0;const rpc=new ReadRpc(configuration(config),{fetchImpl:async(_u,{body})=>{if(JSON.parse(body).method!=='status')reads++;return {ok:true,json:async()=>({result:status})};}});
        await assert.rejects(rpc.request('block',{finality:'final'}),/RPC_UNAVAILABLE_OR_MISMATCH/);assert.equal(reads,0);
    }
});
test('concurrent reads share only an in-flight identity check; later reads verify again',async()=>{
 let checks=0,reads=0,chain='testnet';
 const rpc=new ReadRpc(configuration(config),{fetchImpl:async(_url,{body})=>{
  const q=JSON.parse(body);if(q.method==='status'){checks++;await new Promise(r=>setTimeout(r,5));return {ok:true,json:async()=>({result:{chain_id:chain,genesis_hash:h(1)}})};}
  reads++;return {ok:true,json:async()=>({result:{id:q.params.block_id}})};
 }});
 await Promise.all([rpc.request('block',{block_id:h(5)}),rpc.request('block',{block_id:h(6)})]);assert.equal(checks,1);assert.equal(reads,2);
 chain='mainnet';await assert.rejects(rpc.request('block',{block_id:h(7)}),/RPC_UNAVAILABLE_OR_MISMATCH/);assert.equal(checks,2);assert.equal(reads,2);
});
test('immutable cache resumes reads after outage but never caches a live head or mismatched block',async()=>{
 const values=new Map(),cache={get:async k=>values.get(k),put:async(k,v)=>values.set(k,v)};let reads=0;
 const rpc=new ReadRpc(configuration(config),{fetchImpl:async(_url,{body})=>{
  const q=JSON.parse(body);reads++;return {ok:true,json:async()=>({result:q.method==='status'?{chain_id:'testnet',genesis_hash:h(1)}:{header:{hash:h(5),height:10}}})};
 }});rpc.cache=cache;
 await rpc.request('block',{block_id:h(5)});assert.equal(reads,2);assert.equal(values.size,1);
 const restarted=new ReadRpc(configuration(config),{fetchImpl:async()=>{throw Error('offline');}});restarted.cache=cache;
 assert.equal((await restarted.request('block',{block_id:h(5)})).header.hash,h(5));
 await assert.rejects(restarted.request('block',{finality:'final'}),/RPC_UNAVAILABLE_OR_MISMATCH/);
 await rpc.request('block',{block_id:h(6)});await rpc.request('block',{finality:'final'});assert.equal(values.size,1);
});
test('read batches pin every provider before reads and reject identity changes before commit',async()=>{
 let checks=0,reads=0,chain='testnet';
 const rpc=new ReadRpc(configuration(config),{fetchImpl:async(_url,{body})=>{
  const q=JSON.parse(body);if(q.method==='status'){checks++;return {ok:true,json:async()=>({result:{chain_id:chain,genesis_hash:h(1)}})};}
  reads++;return {ok:true,json:async()=>({result:{}})};
 }});
 await rpc.batch(async()=>{await rpc.request('block',{block_id:h(5)});await rpc.request('chunk',{chunk_id:h(6)});});assert.equal(checks,2);assert.equal(reads,2);
 await assert.rejects(rpc.batch(async()=>{await rpc.request('block',{block_id:h(5)});chain='mainnet';}),/RPC_IDENTITY/);
 assert.equal(checks,4);assert.equal(reads,3);await assert.rejects(rpc.request('block',{block_id:h(6)}),/RPC_UNAVAILABLE_OR_MISMATCH/);assert.equal(reads,3);
});
test('a healthy indexer cannot enable a wallet desk bound to another deployment',async()=>{
    const c=walletIndexerConfiguration(client,config);assert.equal(c.network,'testnet');
    for(const patch of [{network:'sandbox'},{genesis_hash:h(2)},{contract_id:'other.testnet'},{code_hash:h(4)}])assert.throws(()=>walletIndexerConfiguration({...client,...patch},config),/INDEXER_DEPLOYMENT_MISMATCH/);
    assert.throws(()=>walletIndexerConfiguration(client,{...config,contracts:config.contracts.slice(0,1)}),/INDEXER_ORACLE_REQUIRED/);
    const response={binding:binding(c),health:{risk_allowed:true}};
    const store=boundStore({read:async()=>response},binding(c));assert.equal((await store.read('health')).health.risk_allowed,true);
    response.binding.genesis_hash=h(2);await assert.rejects(store.read('health'),/INDEXER_DEPLOYMENT_MISMATCH/);
});

test('rate limits honor Retry-After, fail over, and retry only after cooldown',async()=>{
 for(const retry of ['120','Thu, 01 Jan 1970 00:02:00 GMT',null]){
  let time=0,primary=0;const fallback='https://fallback.testnet.example/';
  const rpc=new ReadRpc(configuration({...config,rpc_urls:[...config.rpc_urls,fallback],request_interval_ms:0}),{now:()=>time,fetchImpl:async(url,{body})=>{
   if(url===config.rpc_urls[0]){primary++;return {status:429,ok:false,headers:{get:()=>retry},json:async()=>{throw Error('HTML rate limit response');}};}
   return {ok:true,json:async()=>({result:JSON.parse(body).method==='status'?{chain_id:'testnet',genesis_hash:h(1)}:{header:{hash:h(5)}}})};
  }});
  await rpc.batch(()=>rpc.request('block',{finality:'final'}));assert.equal(primary,1);
  await rpc.request('block',{finality:'final'});assert.equal(primary,1);
  time=retry===null?60000:120000;await rpc.request('block',{finality:'final'});assert.equal(primary,2);
 }
});
test('all limited providers fail closed and concurrent reads share the request budget',async()=>{
 let calls=0,time=0;const starts=[];
 const rpc=new ReadRpc(configuration({...config,request_interval_ms:250}),{now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{
  starts.push(time);calls++;return {status:429,ok:false,headers:{get:()=>null}};
 }});
 await assert.rejects(rpc.request('block',{finality:'final'}),/RPC_UNAVAILABLE_OR_MISMATCH/);
 await assert.rejects(rpc.request('block',{finality:'final'}),/RPC_UNAVAILABLE_OR_MISMATCH/);assert.equal(calls,1);
 const paced=new ReadRpc(configuration({...config,request_interval_ms:250}),{now:()=>time,sleep:async ms=>{time+=ms;},fetchImpl:async()=>{starts.push(time);return {ok:true,json:async()=>({result:{}})};}});
 starts.length=0;await Promise.all([paced.raw(config.rpc_urls[0],'block',{}),paced.raw(config.rpc_urls[0],'chunk',{})]);
 assert.deepEqual(starts,[0,250]);
 assert.throws(()=>configuration({...config,request_interval_ms:-1}),/CONFIGURATION_BOUNDS/);
});

test('a transient failed identity probe can recover within a long read batch',async()=>{
 let primaryChecks=0,primaryReads=0;const fallback='https://fallback.testnet.example/';
 const rpc=new ReadRpc(configuration({...config,rpc_urls:[...config.rpc_urls,fallback],request_interval_ms:0}),{fetchImpl:async(url,{body})=>{
  const q=JSON.parse(body);if(url===config.rpc_urls[0]){if(q.method==='status'){if(++primaryChecks===1)throw Error('temporary outage');}else primaryReads++;}
  return {ok:true,json:async()=>({result:q.method==='status'?{chain_id:'testnet',genesis_hash:h(1)}:{}})};
 }});
 await rpc.batch(async()=>{await rpc.request('block',{finality:'final'});await rpc.request('block',{block_id:h(7)});});assert.equal(primaryReads,1);assert.equal(primaryChecks,3);
});

test('catch-up retries retain a finalized target instead of chasing a moving head',async()=>{
 const {Indexer}=await import('../../services/indexer/indexer.mjs');const i=Object.create(Indexer.prototype);let headReads=0;
 i.config=configuration(config);i.store={state:async()=>({meta:{cursor_hash:h(2),cursor_height:'1'},makers:[],transactions:[]})};
 i.rpc={request:async(_method,params)=>{if(params.finality){headReads++;return {header:{hash:h(5),prev_hash:h(4),height:3,timestamp_nanosec:'3'},chunks:[]};}throw Error('temporary history outage');}};
 await assert.rejects(i.collectBatch(),/temporary history outage/);await assert.rejects(i.collectBatch(),/temporary history outage/);assert.equal(headReads,1);
});

test('HTTP 200 JSON-RPC -429 responses also enter cooldown instead of hammering the provider',async()=>{
 let time=0,calls=0;
 const rpc=new ReadRpc(configuration({...config,request_interval_ms:0}),{now:()=>time,fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({error:{code:-429,message:'Rate limits exceeded'}})};}});
 await assert.rejects(rpc.request('block',{finality:'final'}));await assert.rejects(rpc.request('block',{finality:'final'}));assert.equal(calls,1);
 time=60000;await assert.rejects(rpc.request('block',{finality:'final'}));assert.equal(calls,2);
});

test('only matching explicit unknown responses from every identity-verified provider are deferred',async()=>{
 for(const mode of ['unknown','mixed','wrong-hash','wrong-chain']){
  const urls=['https://one.example/','https://two.example/'];let calls=0;
  const rpc=new ReadRpc(configuration({...config,rpc_urls:urls,request_interval_ms:0}),{fetchImpl:async(url,{body})=>{
   const q=JSON.parse(body);calls++;
   if(q.method==='status')return {ok:true,json:async()=>({result:{chain_id:mode==='wrong-chain'?'mainnet':'testnet',genesis_hash:h(1)}})};
   if(mode==='mixed'&&url===urls[1])throw Error('offline');
   return {ok:true,json:async()=>({error:{cause:{name:'UNKNOWN_TRANSACTION',info:{requested_transaction_hash:mode==='wrong-hash'?h(9):h(5)}}}})};
  }});
  await assert.rejects(rpc.request('tx',{tx_hash:h(5),sender_account_id:'alice.testnet',wait_until:'FINAL'}),mode==='unknown'?/RPC_TRANSACTION_UNKNOWN/:/RPC_UNAVAILABLE_OR_MISMATCH/);
  assert(calls>=2);
 }
});

test('same-block core account, ticket and market reads run concurrently without relaxing code pins',async()=>{
 const rpc=new ReadRpc(configuration(config)),block={header:{hash:h(5)}};let identityStarted=false,nativeStarted=false;
 rpc.request=async()=>{nativeStarted=true;await Promise.resolve();assert(identityStarted);return {block_hash:h(5),code_hash:h(3)};};
 let resolveRows;const rowsReady=new Promise(r=>resolveRows=r),seen=new Set();
 rpc.view=async(_id,method,args,hash)=>{
  assert.equal(hash,h(5));
  if(method==='deployment_identity'){identityStarted=true;assert(nativeStarted);return {network:'testnet',contract_id:'core.testnet',protocol_version:'1'};}
  if(method==='list_accounts')return ['alice.testnet'];
  if(['get_account','list_tickets','get_market'].includes(method)){
   seen.add(method);if(seen.size===3)resolveRows();await rowsReady;
   return method==='list_tickets'?[]:{checked:true};
  }
  return [];
 };
 let timer;try{const snapshot=await Promise.race([rpc.snapshot(config.contracts[0],block,['maker.testnet']),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('SERIAL_SNAPSHOT_READS')),1000))]);assert(snapshot.accounts['alice.testnet'].checked);assert(snapshot.markets['maker.testnet'].checked);}finally{clearTimeout(timer);}
 rpc.request=async()=>({block_hash:h(5),code_hash:h(9)});await assert.rejects(rpc.snapshot(config.contracts[0],block),/DEPLOYMENT_MISMATCH/);
});
