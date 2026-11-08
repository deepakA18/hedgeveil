import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../../services/indexer/store.mjs';
import {configuration} from '../../services/indexer/rpc.mjs';
import {operationId,digest} from '../../services/indexer/model.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {createApi} from '../../services/indexer/api.mjs';
import {startPostgres} from './postgres.mjs';
const h=n=>base58(Buffer.alloc(32,n)),contract='core.sandbox';
// Transport/model fixtures below are not blockchain execution evidence.
function batch() {
    const head={header:{hash:h(3),prev_hash:h(2),height:2,timestamp_nanosec:'100'},chunks:[]};
    const payload={kind:'event',schema_version:'0.2.0',domain:{protocol_version:'1',network:'sandbox',contract_id:contract},operation_id:operationId(contract,'1'),actor:contract,event:'INITIALIZED',deltas:[{account_id:contract,bucket:'OPERATING',ledger_id:'bootstrap',asset:{kind:'COLLATERAL'},direction:'CREDIT',amount:'1000'}],fee_amount:'0',state_references:['a'.repeat(64)]};
    const event={receipt_id:h(5),log_index:0,item_index:0,contract,kind:'core',name:'INITIALIZED',payload};
    const row={id:h(5),block_hash:h(3),outcome:{executor_id:contract,receipt_ids:[],status:{SuccessValue:''},logs:[]}};
    const custody={operation_sequence:'1',operating_allocation:'1000',fees:'0',series_storage_fund:'0',market_storage_fund:'0',vault_storage_fund:'0',roll_storage_fund:'0',tracked_user_collateral:'0',free_collateral:'0',vault_collateral:'0',series_reserves:'0',native_balance:'1000',retained_categories_covered:true};
    const snapshot={kind:'core',contract,block_hash:h(3),accounts:{},series:[],vault:null,roll:null,tickets:[],custody,native:{amount:'1000'}};
    const tx={inclusion_hash:h(3),raw:{transaction:{hash:h(4),signer_id:contract,receiver_id:contract}},outcomes:[row],events:[event]};
    return {expected_cursor:h(2),head,blocks:[head],transactions:[tx,structuredClone(tx)],snapshots:[snapshot],rpc_failures:0,rpc_failovers:0};
}
test('real PostgreSQL commits atomically, deduplicates, survives restart and serves stale-safe read API',async t=>{
    const pg=await startPostgres();let store,api;
    t.after(async()=>{if(api)await new Promise(r=>api.close(r));if(store)await store.close();await pg.runtime.stop();});
    const config=configuration({network:'sandbox',chain_id:'unit',genesis_hash:h(1),anchor_hash:h(2),rpc_urls:['http://127.0.0.1:1234/'],contracts:[{account_id:contract,kind:'core',code_hash:h(9)}],postgres:pg.config,stale_after_ms:10000});
    const anchor={header:{hash:h(2),height:1}};store=new Store(config);await store.init(anchor);
    await assert.rejects(store.apply(batch(),{beforeCommit:()=>{throw Error('simulated process failure before commit');}}));
    assert.equal((await store.state()).meta.cursor_hash,h(2));assert.equal((await store.read('events')).items.length,0);
    await store.apply(batch());assert.equal((await store.read('events')).items.length,1);assert.equal((await store.read('balances')).items[0].amount,'1000');
    const original=digest((await store.read('balances')).items);
    await store.close();store=new Store(config);await store.init(anchor);assert.equal(digest((await store.read('balances')).items),original);
    const next=batch();next.expected_cursor=h(3);next.blocks=[];next.transactions=[];
    const race=await Promise.allSettled([store.apply({...next,blocks:[{header:{hash:h(6),prev_hash:h(3),height:3,timestamp_nanosec:'101'},chunks:[]}],head:{header:{hash:h(6),prev_hash:h(3),height:3,timestamp_nanosec:'101'},chunks:[]},snapshots:next.snapshots.map(s=>({...s,block_hash:h(6)}))}),store.apply({...next,blocks:[{header:{hash:h(6),prev_hash:h(3),height:3,timestamp_nanosec:'101'},chunks:[]}],head:{header:{hash:h(6),prev_hash:h(3),height:3,timestamp_nanosec:'101'},chunks:[]},snapshots:next.snapshots.map(s=>({...s,block_hash:h(6)}))})]);
    assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
    const conflict=batch();conflict.expected_cursor=h(6);conflict.blocks=[];conflict.head={header:{hash:h(6),prev_hash:h(3),height:3,timestamp_nanosec:'101'},chunks:[]};conflict.transactions[0].events[0].payload.fee_amount='1';
    await assert.rejects(store.apply(conflict),/EVENT_CONFLICT/);
    const gap={...conflict,transactions:[],snapshots:next.snapshots.map(s=>({...s,block_hash:h(6),custody:{...s.custody,operation_sequence:'2'}}))};
    await assert.rejects(store.apply(gap),/EVENT_SEQUENCE_GAP/);assert.equal(digest((await store.read('balances')).items),original);
    api=createApi(store);await new Promise(r=>api.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${api.address().port}`;
    assert.equal((await fetch(url+'/health')).status,200);assert.equal((await fetch(url+'/v1/balances',{method:'POST'})).status,405);
    await store.markFailure('CUSTODY_MISMATCH');assert.equal((await fetch(url+'/health')).status,503);assert.equal((await (await fetch(url+'/v1/balances')).json()).health.risk_allowed,false);
    assert.match(await (await fetch(url+'/metrics')).text(),/hedgeveil_indexer_healthy 0/);
    const good={...gap,snapshots:next.snapshots.map(s=>({...s,block_hash:h(6)})),observed_height:100};
    await store.apply(good);assert.equal((await store.read('health')).health.state,'LAGGING');assert.equal((await fetch(url+'/health')).status,503);
    await store.apply({...good,observed_height:3,started_at:'2000-01-01T00:00:00.000Z'});
    assert.equal((await store.read('health')).health.stale,true);assert.equal((await store.read('health')).health.risk_allowed,false);
    const wrong=new Store({...config,genesis_hash:h(8)});try{await assert.rejects(wrong.init(anchor),/DATABASE_BINDING_MISMATCH/);}finally{await wrong.close();}
    console.log('PostgreSQL rollback/restart/dedup/concurrency/API/lag/staleness/binding checks passed');
});
