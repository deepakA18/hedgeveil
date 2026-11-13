import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractEvents,replayExternal,reconcileExpiry,digest,alerts} from '../../services/indexer/model.mjs';
import {walletIndexerConfiguration} from '../../services/indexer/profile.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {externalQuoteBlocker} from '../../apps/web/quote-gate.mjs';
const evidence=JSON.parse(await readFile(new URL('../../research/reports/orc04-expiry-resolver-sandbox.json',import.meta.url)));
const c=evidence.final_case,contract=c.config.oracle_account_id,watched=[{kind:'expiry_oracle',account_id:contract}];
// State/event fixtures below exercise the projection, not external provenance.
const state={network:'sandbox',contract_id:contract,version:'native-trade-twap-v1',sequence:'1',registrar:'root.sandbox',guardian:'root.sandbox',source:'source.sandbox',worker_sha256:'86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43',request_sequence:'1',paused:false,cases:{[c.config.series_id]:c}};
const envelope=s=>({standard:'hedgeveil_expiry_oracle',version:'1.0.0',event:'FINALIZED',data:[{network:s.network,contract_id:s.contract_id,sequence:s.sequence,state_hash:digest(s)}]});
const row=e=>({id:'fixture',outcome:{executor_id:contract,status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify(e)]}});
const events=s=>extractEvents(row(envelope(s)),watched);
const snapshot=s=>({kind:'expiry_oracle',contract,identity:{network:s.network,contract_id:contract,sequence:s.sequence},state:s,native:{amount:String(5n*10n**24n)}});
test('TWAP resolver has isolated event schema, state commitment and case invariants',()=>{
 assert.equal(events(state)[0].kind,'expiry_oracle');
 assert.equal(reconcileExpiry(replayExternal(events(state)),snapshot(state)).matched,true);
 const wrong={...envelope(state),standard:'hedgeveil_external_oracle'};
 assert.equal(extractEvents(row(wrong),watched).length,0);
 assert.throws(()=>replayExternal([...events(state),...events(state)]),/SEQUENCE_GAP/);
 const changed=structuredClone(state);changed.paused=true;
 assert.throws(()=>reconcileExpiry(replayExternal(events(state)),snapshot(changed)),/STATE_MISMATCH/);
 for(const mutate of [s=>s.cases[c.config.series_id].price='1',s=>s.cases[c.config.series_id].config.oracle_account_id='wrong.sandbox',s=>s.cases[c.config.series_id].config.observation_window.start_ns='0']){
  const s=structuredClone(state);mutate(s);assert.throws(()=>reconcileExpiry(replayExternal(events(s)),snapshot(s)),/ORACLE_CASE/);
 }
 assert.throws(()=>reconcileExpiry(replayExternal(events(state)),{...snapshot(state),native:{amount:'0'}}),/OPERATING_RESERVE/);
});
test('actual compiled expiry event envelopes are extracted; failed receipts are excluded',()=>{
 const extracted=evidence.transactions.flatMap(t=>t.receipts.flatMap(r=>extractEvents({id:r.id,outcome:{executor_id:r.executor,status:r.status,logs:r.logs??[]}},watched)));
 assert(extracted.length>10);assert.equal(replayExternal(extracted).sequence,String(extracted.length));
});
test('wallet binds exactly one resolver profile and preserves TWAP gates',()=>{
 const h=n=>base58(Buffer.alloc(32,n)),client={network:'sandbox',chain_id:'local',genesis_hash:h(1),contract_id:'core.sandbox',code_hash:h(2)};
 const config={...client,anchor_hash:h(3),rpc_urls:['http://127.0.0.1:1234/'],contracts:[{kind:'core',account_id:client.contract_id,code_hash:client.code_hash},{...watched[0],code_hash:h(4)}],postgres:{host:'127.0.0.1',port:5432,user:'fixture',password:'fixture',database:'fixture'}};
 assert.equal(walletIndexerConfiguration(client,config).contracts[1].kind,'expiry_oracle');
 assert.throws(()=>walletIndexerConfiguration(client,{...config,contracts:[...config.contracts,{kind:'external_oracle',account_id:'other.sandbox',code_hash:h(5)}]}),/ORACLE_REQUIRED/);
 const open={...structuredClone(c),pending:null,accepted:null,price:null,last_result:'NOT_REQUESTED'};
 const snap={health:{risk_allowed:true},items:[{kind:'expiry_oracle',body:{state:{...state,cases:{[c.config.series_id]:open}},cases:[open]}}]};
 assert.equal(externalQuoteBlocker(snap,[c.config.series_id],String(BigInt(c.config.observation_window.start_ns)-1n)),null);
 assert.equal(externalQuoteBlocker(snap,[c.config.series_id],c.config.observation_window.start_ns),'SERIES_UNAVAILABLE');
 assert.equal(externalQuoteBlocker(snap,[c.config.series_id],c.config.maturity_ns),'SERIES_UNAVAILABLE');
 snap.items[0].body.state.paused=true;assert.equal(externalQuoteBlocker(snap,[c.config.series_id],'1'),'ORACLE_UNAVAILABLE');
 const notices=alerts([{...snapshot(state),tickets:[],cases:[{...open,state:'RESOLUTION_DELAYED'}]}],c.config.maturity_ns);
 assert(notices.some(x=>x.code==='ORACLE_HISTORY_REQUIRED'));
});

test('layout-2 historical cases remain bound to the retained core terms',()=>{
 const s={...structuredClone(state),layout_version:2,archived_count:'1',archive_commitment:'a'.repeat(64),cases:{}};
 const snap={...snapshot(s),historical_cases:[structuredClone(c)],core_terms:{[c.config.series_id]:structuredClone(c.config)}};
 const replay=replayExternal(events(s));
 assert.equal(reconcileExpiry(replay,snap).matched,true);
 for(const mutate of [
  x=>x.historical_cases.push(structuredClone(c)),
  x=>x.historical_cases[0].price=null,
  x=>x.historical_cases[0].price='1',
  x=>x.historical_cases[0].pending='1',
  x=>x.core_terms[c.config.series_id].strike='1',
  x=>x.historical_cases=[],
  x=>x.core_terms={}
 ]){const bad=structuredClone(snap);mutate(bad);assert.throws(()=>reconcileExpiry(replay,bad),/EXPIRY_ORACLE_(ARCHIVE|CORE_TERMS|CASE)/);}
 const malformed={...s};delete malformed.archived_count;
 assert.throws(()=>reconcileExpiry(replayExternal(events(malformed)),snapshot(malformed)),/STATE_SCHEMA/);
});
