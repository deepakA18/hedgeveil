// Actual HTTPS feed checks against retained, verified public receipt evidence.
// No signing or transaction submission. Private database settings stay in memory.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import assert from 'node:assert/strict';
import {Store} from '../services/indexer/store.mjs';
import {NeardataFeed,feedBlock,NeardataDiscovery} from '../services/indexer/neardata-discovery.mjs';
import {canonical} from '../packages/sdk/intent.mjs';
const {values:v}=parseArgs({options:{mode:{type:'string',default:'parity'},seconds:{type:'string',default:'120'}}});
assert(['parity','shadow'].includes(v.mode));
const root='.local/testnet/native-transfer',d=JSON.parse(await readFile(root+'/deployment.json'));
const {password}=JSON.parse(await readFile(root+'/postgres.json')),port=Number((await readFile(root+'/postgres/postmaster.pid','utf8')).split('\n')[3]);
const store=new Store({...d.indexer,discovery_source:'neardata-testnet',postgres:{host:'127.0.0.1',port,user:'postgres',password,database:'postgres'}}),feed=new NeardataFeed();
try{
 if(v.mode==='parity'){
  const archive=JSON.parse(await readFile('research/reports/native-public-eta-owner-after-restart.json'));
  const watched=new Set(d.indexer.contracts.map(c=>c.account_id)),expected=new Map();
  for(const tx of archive.transactions)for(const o of tx.receipts_outcome){
   if(watched.has(o.outcome.executor_id))expected.set(o.id,{o,tx:tx.transaction});
  }
  const blocks=await store.transaction(async db=>(await db.query('SELECT hash,height FROM blocks WHERE hash=ANY($1) ORDER BY height',[[...new Set([...expected.values()].map(x=>x.o.block_hash))]])).rows,{readOnly:true});
  assert.equal(blocks.length,new Set([...expected.values()].map(x=>x.o.block_hash)).size);
  let checked=0,hints=0;const evidence=[],seen=new Set();
  const cache=root+'/neardata-parity';await mkdir(cache,{recursive:true,mode:0o700});
  // Sequential calls respect the same free request budget as the runtime.
  for(const {hash,height} of blocks){
   let raw;try{raw=JSON.parse(await readFile(cache+'/'+height+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!raw){
    for(let attempt=0;attempt<4;attempt++){
     try{raw=await feed.get('block/'+height);break;}catch(e){if(!['FEED_COOLDOWN','FEED_RATE_LIMITED'].includes(e.code))throw e;console.log(JSON.stringify({waiting_for_rate_limit_ms:Math.max(1000,feed.cooldown-Date.now()),checked_blocks:evidence.length}));await new Promise(r=>setTimeout(r,Math.max(1000,feed.cooldown-Date.now())));}
    }
    assert(raw,'Feed remained unavailable');
   }
   const b=feedBlock(raw,Number(height),d.indexer.contracts);assert.equal(b.hash,hash);
   await writeFile(cache+'/'+height+'.json',JSON.stringify(raw),{mode:0o600});
   const candidates=new Map(b.hints.map(x=>[x.hash,x.signer_id]));hints+=b.hints.length;
   for(const row of raw.shards.flatMap(s=>s.receipt_execution_outcomes)){
    const exp=expected.get(row.execution_outcome.id);if(!exp)continue;
    const o=row.execution_outcome;assert.equal(o.block_hash,exp.o.block_hash);assert.equal(canonical(o.outcome.logs),canonical(exp.o.outcome.logs));assert.equal(canonical(o.outcome.status),canonical(exp.o.outcome.status));assert.equal(row.tx_hash,exp.tx.hash);
    if(row.receipt.predecessor_id!=='system'&&row.receipt.receipt?.Action)assert.equal(candidates.get(exp.tx.hash),exp.tx.signer_id);
    seen.add(o.id);checked++;
   }
   evidence.push({height,hash});
   if(evidence.length%10===0)console.log(JSON.stringify({checked_blocks:evidence.length,total_blocks:blocks.length}));
  }
  assert.equal(seen.size,expected.size);
  const report={observed_at:new Date().toISOString(),scope:'Real FASTNEAR full blocks compared to retained 73-transaction acceptance archive; targeted block coverage, not continuous backfill',blocks:evidence,watched_receipts:checked,discovered_hints:hints,passed:true,cutover_accepted:false};
  await writeFile('research/reports/inf02-neardata-parity.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({blocks:blocks.length,watched_receipts:checked,hints,passed:true}));
 }else{
  const seconds=Number(v.seconds);assert(Number.isInteger(seconds)&&seconds>=1&&seconds<=600);
  const {meta}=await store.state();const anchor=await store.block(meta.cursor_hash);assert(anchor);
  await store.init(anchor);await store.initFeed();
  const before=await store.feedState(),scanner=new NeardataDiscovery(store,d.indexer.contracts,{feed}),started=Date.now();
  scanner.start();
  for(let i=0;i<seconds;i++){await new Promise(r=>setTimeout(r,1000));if(i%20===19)console.log(JSON.stringify({progress:await store.feedState()}));}
  await scanner.stop();const after=await store.feedState();
  const report={observed_at:new Date().toISOString(),scope:'Actual hosted-feed shadow scan with durable PostgreSQL cursor; does not itself enable application cutover',before,after,elapsed_ms:Date.now()-started,health:(await store.read('health')).health,cutover_accepted:false};
  await writeFile('research/reports/inf02-neardata-shadow.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }
}catch(e){console.error(JSON.stringify({error:e.code??e.name,message:e.name==='AssertionError'?e.message:undefined}));process.exitCode=1;}
finally{await store.close();}
