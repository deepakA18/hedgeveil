const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,mkdtempSync,rmSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve}=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const temp=mkdtempSync(join(tmpdir(),'hv-subquery-'));
execFileSync('./node_modules/.bin/tsc',['--outDir',temp]);
const {complete,events,canonical}=require(join(temp,'evidence.js'));
const {binding}=require(join(temp,'binding.js'));
const {handleBlock}=require(join(temp,'index.js'));
const root=resolve('../..');
const file=join(root,'research/reports/native-public-eta-owner-after-restart.json');
const actual=JSON.parse(readFileSync(file));
after(()=>rmSync(temp,{recursive:true,force:true}));

test('all 73 actual finalized transaction trees yield the same 66 archived protocol events',()=>{
 assert(actual.passed);assert.equal(actual.transactions.length,73);
 const extracted=actual.transactions.flatMap(tx=>complete(tx,tx.transaction.hash,tx.transaction.signer_id).flatMap(events));
 assert.equal(extracted.length,66);
 const expected=new Map(actual.events.map(e=>[`${e.receipt_id}:${e.log_index}:${e.item_index}`,e]));
 for(const e of extracted){const prior=expected.get(e.id);assert(prior);assert.equal(e.contract,prior.contract);assert.equal(e.name,prior.name);assert.equal(e.bodyJson,canonical(prior.payload));}
 const sources={};for(const p of ['src/index.ts','src/evidence.ts','src/binding.ts','project.yaml','schema.graphql','package-lock.json','test/evidence.test.cjs'])sources[p]=createHash('sha256').update(readFileSync(p)).digest('hex');
 writeFileSync(join(root,'research/reports/inf02-subquery-replay.json'),JSON.stringify({scope:'SubQuery mapping replay of actual archived testnet outcomes, not a hosted runner/parity test',passed:true,transactions:73,events:66,evidence_file:'research/reports/native-public-eta-owner-after-restart.json',evidence_sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),sources,hosted_deployment_verified:false,cutover_allowed:false},null,2)+'\n');
});

test('missing, duplicate, foreign and unfinished outcomes cannot become evidence',()=>{
 const tx=actual.transactions.find(t=>t.receipts_outcome.length>2);
 for(const mutate of [r=>r.receipts_outcome.pop(),r=>r.receipts_outcome.push(r.receipts_outcome[0]),r=>r.final_execution_status='EXECUTED',r=>r.transaction.signer_id='attacker.testnet',r=>r.receipts_outcome[0].outcome.receipt_ids.push('missing')]){
  const bad=structuredClone(tx);mutate(bad);assert.throws(()=>complete(bad,tx.transaction.hash,tx.transaction.signer_id));
 }
});

test('failed receipts cannot emit successful protocol events; incorrect domains and numeric amounts fail',()=>{
 const receipt=actual.transactions.flatMap(t=>t.receipts_outcome).find(r=>events(r).some(e=>e.kind==='core'));
 const bad=structuredClone(receipt);bad.outcome.status={Failure:{reason:'injected test fault'}};assert.deepEqual(events(bad),[]);
 for(const mutate of [e=>e.data[0].domain.network='mainnet',e=>e.data[0].deltas[0].amount=1]){
  const r=structuredClone(receipt),idx=r.outcome.logs.findIndex(l=>l.startsWith('EVENT_JSON:'));
  const envelope=JSON.parse(r.outcome.logs[idx].slice(11));mutate(envelope);r.outcome.logs[idx]='EVENT_JSON:'+JSON.stringify(envelope);assert.throws(()=>events(r));
 }
});

test('mapping preserves execution heights, exact quantities and idempotency using actual receipts',async()=>{
 // Store/API are an explicit test harness, never a claimed hosted deployment.
 const data=new Map();global.store={get:async(e,id)=>data.get(e+':'+id),set:async(e,id,v)=>data.set(e+':'+id,structuredClone(v))};
 const header={height:binding.anchorHeight,hash:binding.anchorHash,prev_hash:'previous',timestamp_nanosec:'1794281505751436691'};
 const tx=actual.transactions.find(t=>t.receipts_outcome.some(r=>events(r).some(e=>e.kind==='core')));
 global.api={sendJsonRpc:async(method,args)=>{
  if(method==='status')return {chain_id:'testnet',genesis_hash:binding.genesisHash};
  if(method==='tx')return structuredClone(tx);
  if(method==='block')return args.finality?{header:{height:binding.anchorHeight+100}}:{header:{hash:args.block_id,height:binding.anchorHeight+10}};
  throw Error('unexpected method');
 }};
 const block={header,transactions:[{result:{id:tx.transaction.hash},signer_id:tx.transaction.signer_id}]};
 await handleBlock(block);const count=data.size;assert(count>2);await handleBlock(block);assert.equal(data.size,count);
 const ev=[...data.entries()].find(([key])=>key.startsWith('ProtocolEvent:'))[1];assert.equal(ev.blockHeight,BigInt(binding.anchorHeight+10));
 const head=data.get('IndexedHead:testnet');assert.equal(head.height,BigInt(binding.anchorHeight));assert.equal(head.timestampNs,header.timestamp_nanosec);
 await assert.rejects(handleBlock({header:{...header,height:header.height+1,hash:'new',prev_hash:'wrong'},transactions:[]}),/ANCESTRY_GAP/);
 assert.equal(data.get('IndexedHead:testnet').hash,header.hash);
});

test('unfinalized transaction failure never advances the committed head',async()=>{
 const data=new Map();global.store={get:async(e,id)=>data.get(e+':'+id),set:async(e,id,v)=>data.set(e+':'+id,v)};
 const tx=actual.transactions[0];global.api={sendJsonRpc:async(m)=>m==='status'?{chain_id:'testnet',genesis_hash:binding.genesisHash}:m==='block'?{header:{height:binding.anchorHeight+100}}:{...tx,final_execution_status:'EXECUTED'}};
 await assert.rejects(handleBlock({header:{height:binding.anchorHeight,hash:binding.anchorHash,timestamp_nanosec:'1'},transactions:[{result:{id:tx.transaction.hash},signer_id:tx.transaction.signer_id}]}),/NOT_FINAL/);
 assert.equal(data.size,0);
});
