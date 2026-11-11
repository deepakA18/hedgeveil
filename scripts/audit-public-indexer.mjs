// Read-only export of a single reconciled PostgreSQL snapshot. No signing keys.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {loadWorkspace} from '../services/testnet/workspace.mjs';
import {privateRead} from '../services/demo/storage.mjs';
import {Store} from '../services/indexer/store.mjs';
import {canonical} from '../packages/sdk/intent.mjs';
import {binding} from '../services/indexer/rpc.mjs';
import {completeOutcomes,replayCore,replayExternal,reconcileCore,reconcileExternal} from '../services/indexer/model.mjs';
const {values:v}=parseArgs({options:{name:{type:'string',default:'native-transfer'},output:{type:'string',default:'research/reports/native-public-indexer-reconciliation.json'}}});
const {directory}=await loadWorkspace(v.name),d=await privateRead(directory+'/deployment.json');
const {password}=await privateRead(directory+'/postgres.json'),port=Number((await readFile(directory+'/postgres/postmaster.pid','utf8')).split('\n')[3]);
const store=new Store({...d.indexer,postgres:{host:'127.0.0.1',port,user:'postgres',password,database:'postgres'}});
try{
 const report=await store.transaction(async db=>{
  const {rows:[meta]}=await db.query('SELECT * FROM meta WHERE id=1');
  assert.equal(canonical(meta.binding),canonical(binding(store.config)));assert.equal(meta.health.risk_allowed,true);assert(Date.now()-meta.checked_at.getTime()<=store.config.stale_after_ms);
  const discovery=d.indexer.discovery_source?(await db.query('SELECT * FROM feed_cursor WHERE id=1')).rows[0]:null;
  if(discovery&&d.indexer.discovery_required!==false){assert.equal(discovery.state,'SCANNING');assert(Date.now()-discovery.checked_at.getTime()<=store.config.stale_after_ms);assert(Math.max(Number(meta.cursor_height),Number(discovery.observed_height))-Number(discovery.block_height)<=store.config.max_lag_blocks);}
  if(d.indexer.discovery_source)assert(discovery,'Missing discovery cursor');
  const {rows:transactions}=await db.query('SELECT body FROM transactions ORDER BY hash');
  for(const {body} of transactions)completeOutcomes(body,body.transaction);
  const {rows:events}=await db.query('SELECT * FROM events WHERE sequence IS NOT NULL ORDER BY contract,sequence');
  const {rows:snapshots}=await db.query('SELECT * FROM snapshots ORDER BY contract');
  const reconciliations=snapshots.map(s=>{assert.equal(s.block_hash,meta.cursor_hash);const es=events.filter(e=>e.contract===s.contract);return s.kind==='core'?reconcileCore(replayCore(s.contract,es,'testnet'),s.body):reconcileExternal(replayExternal(es),s.body);});
  const {rows:[counts]}=await db.query('SELECT (SELECT count(*)::text FROM blocks) AS blocks,(SELECT count(*)::text FROM transactions) AS transactions,(SELECT count(*)::text FROM outcomes) AS outcomes,(SELECT count(*)::text FROM events WHERE sequence IS NOT NULL) AS events');
  return {scope:'Actual public testnet indexer checkpoint, complete stored FINAL receipt trees and independently replayed same-checkpoint balances/state; operator check, independent review pending',observed_at:new Date().toISOString(),binding:meta.binding,health:meta.health,discovery:discovery?{...discovery,required:d.indexer.discovery_required!==false}:null,checked_at:meta.checked_at,checkpoint:meta.cursor_hash,generation:meta.generation,counts,reconciliations,snapshots,events,transactions:transactions.map(x=>x.body),sources:{},passed:true};
 },{readOnly:true});
 for(const f of ['services/indexer/indexer.mjs','services/indexer/discovery.mjs','services/indexer/ancestry.mjs','services/indexer/neardata.mjs','services/indexer/neardata-discovery.mjs','services/indexer/rpc.mjs','services/indexer/store.mjs','services/indexer/model.mjs','scripts/audit-public-indexer.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile(v.output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({file:v.output,counts:report.counts,health:report.health,reconciliations:report.reconciliations}));
}finally{await store.close();}
