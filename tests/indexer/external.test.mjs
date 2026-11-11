import test from 'node:test';
import assert from 'node:assert/strict';
import {extractEvents,replayExternal,reconcileExternal,digest} from '../../services/indexer/model.mjs';
import {walletIndexerConfiguration} from '../../services/indexer/profile.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
// Explicit event fixtures; compiled-Wasm/PostgreSQL acceptance is in external-settlement.mjs.
const contract='resolver.testnet',watched=[{kind:'external_oracle',account_id:contract}];
const state={network:'testnet',contract_id:contract,version:'native-sampled-v1',sequence:'1',registrar:'registrar.testnet',guardian:'guardian.testnet',request_sequence:'0',paused:false,cases:{}};
const event={standard:'hedgeveil_external_oracle',version:'1.0.0',event:'INITIALIZED',data:[{network:'testnet',contract_id:contract,sequence:'1',state_hash:digest(state)}]};
const row=e=>({id:'fixture',outcome:{executor_id:contract,status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify(e)]}});
const events=()=>extractEvents(row(event),watched,'testnet');
test('native resolver events require exact schema, domain and successful executor',()=>{
 assert.equal(events().length,1);
 for(const patch of [{network:'sandbox'},{contract_id:'wrong.testnet'},{sequence:1},{state_hash:'wrong'}]){
  const e=structuredClone(event);Object.assign(e.data[0],patch);assert.throws(()=>extractEvents(row(e),watched,'testnet'));
 }
 const failed=row(event);failed.outcome.status={Failure:{fixture:true}};assert.deepEqual(extractEvents(failed,watched,'testnet'),[]);
 const foreign=row(event);foreign.outcome.executor_id='wrong.testnet';assert.deepEqual(extractEvents(foreign,watched,'testnet'),[]);
});
test('resolver state commitment reconciles and rejects gaps duplicates mutations or low operating balance',()=>{
 const snapshot={contract,identity:{network:'testnet',contract_id:contract,sequence:'1'},state,native:{amount:String(5n*10n**24n)}};
 assert.equal(reconcileExternal(replayExternal(events()),snapshot).matched,true);
 assert.throws(()=>replayExternal([...events(),...events()]),/SEQUENCE_GAP/);
 assert.throws(()=>reconcileExternal(replayExternal([]),snapshot),/SEQUENCE_GAP/);
 const mutated=structuredClone(snapshot);mutated.state.paused=true;assert.throws(()=>reconcileExternal(replayExternal(events()),mutated),/STATE_MISMATCH/);
 assert.throws(()=>reconcileExternal(replayExternal(events()),{...snapshot,native:{amount:'0'}}),/OPERATING_RESERVE/);
});
test('wallet binding accepts one pinned native resolver and rejects mixed resolver profiles',()=>{
 const h=n=>base58(Buffer.alloc(32,n)),client={network:'testnet',chain_id:'testnet',genesis_hash:h(1),contract_id:'core.testnet',code_hash:h(2)};
 const config={...client,anchor_hash:h(3),rpc_urls:['https://rpc.testnet.near.org/'],contracts:[{kind:'core',account_id:client.contract_id,code_hash:client.code_hash},{...watched[0],code_hash:h(4)}],postgres:{host:'127.0.0.1',port:5432,user:'fixture',password:'fixture',database:'fixture'}};
 assert.equal(walletIndexerConfiguration(client,config).contracts[1].kind,'external_oracle');
 config.contracts.push({kind:'oracle',account_id:'old.testnet',code_hash:h(5)});assert.throws(()=>walletIndexerConfiguration(client,config),/ORACLE_REQUIRED/);
});
