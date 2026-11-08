import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {extractEvents,replayCore,operationId,completeOutcomes,alerts} from '../../services/indexer/model.mjs';
import {configuration,ReadRpc} from '../../services/indexer/rpc.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
const historical=JSON.parse(await readFile(new URL('../../research/reports/g7-client.json',import.meta.url)));
const core=historical.configuration.contract_id,watched=[{account_id:core,kind:'core'}];
const h=n=>base58(Buffer.alloc(32,n));
const cfg={network:'sandbox',chain_id:'local',genesis_hash:h(1),anchor_hash:h(2),rpc_urls:['http://127.0.0.1:1234/'],contracts:[{account_id:core,kind:'core',code_hash:h(3)}],postgres:{host:'127.0.0.1',port:5432,user:'test',password:'fixture-only',database:'test'}};
test('existing receipt events reproduce the core operation order and exact conserved balances',()=>{
    const es=historical.events.filter(x=>x.event.domain.contract_id===core).map(x=>({payload:x.event}));
    assert.equal(es[0].payload.operation_id,operationId(core,'1'));
    const result=replayCore(core,[...es].reverse());
    assert.equal(result.sequence,historical.custody.normal.operation_sequence);
    const sum=bucket=>[...result.balances].filter(([k])=>JSON.parse(k)[1]===bucket&&JSON.parse(k)[3]==='COLLATERAL').reduce((n,[,v])=>n+v,0n);
    assert.equal(String(sum('FREE')),historical.custody.normal.free_collateral);
    assert.equal(String(sum('SERIES_RESERVE')),historical.custody.normal.series_reserves);
    assert.throws(()=>replayCore(core,es.slice(1)),/EVENT_SEQUENCE_GAP/);
    assert.throws(()=>replayCore(core,[...es,es[0]]),/OPERATION_DUPLICATE/);
});
test('complete FINAL receipt trees required; failed or foreign logs never project',()=>{
    const raw=historical.recoveries.find(r=>r.receipts_outcome.some(o=>o.outcome.logs.some(l=>l.includes('DEPOSIT'))));
    const rows=completeOutcomes(raw,raw.transaction);assert(rows.length>1);
    const row=rows.find(r=>extractEvents(r,watched).length);assert(row);
    const bad=structuredClone(row);bad.outcome.status={Failure:{reason:'fixture'}};
    assert.deepEqual(extractEvents(bad,watched),[]);
    bad.outcome.status={SuccessValue:''};bad.outcome.executor_id='foreign.sandbox';assert.deepEqual(extractEvents(bad,watched),[]);
    assert.throws(()=>completeOutcomes({...raw,final_execution_status:'EXECUTED'},raw.transaction),/TRANSACTION_NOT_FINAL/);
    assert.throws(()=>completeOutcomes({...raw,receipts_outcome:[]},raw.transaction),/RECEIPT_TREE/);
});
test('wrong domain and malformed successful core events fail closed',()=>{
    const raw=historical.recoveries.find(r=>r.receipts_outcome.some(o=>extractEvents(o,watched).length));
    const row=structuredClone(raw.receipts_outcome.find(o=>extractEvents(o,watched).length));
    row.outcome.logs=row.outcome.logs.map(l=>l.replace('"network":"sandbox"','"network":"testnet"'));
    assert.throws(()=>extractEvents(row,watched),/EVENT_SCHEMA/);
});
test('failover verifies chain identity before each read and never allows a signing RPC',async()=>{
    let queries=0;
    const rpc=new ReadRpc(configuration({...cfg,rpc_urls:['http://127.0.0.1:1234/','http://127.0.0.1:1235/']}),{fetchImpl:async(url,{body})=>{
        const {method}=JSON.parse(body);if(method==='block')queries++;
        return {ok:true,json:async()=>({result:method==='status'?{chain_id:url.includes('1234')?'wrong':'local',genesis_hash:cfg.genesis_hash}:{header:{hash:h(4)}}})};
    }});
    await rpc.request('block',{finality:'final'});assert.equal(queries,1);assert.equal(rpc.failovers,1);
    await assert.rejects(rpc.request('send_tx',{}),/READ_ONLY_RPC/);
    assert.throws(()=>configuration({...cfg,network:'testnet'}),/LOCAL_SANDBOX_ONLY/);
    assert.throws(()=>configuration({...cfg,schema:'hv_x;drop table meta'}),/SCHEMA_NAME/);
});
test('quarantine, delayed oracle and unobserved executable quotes are visible alerts',()=>{
    const found=alerts([{kind:'core',contract:core,tickets:[{id:'0',state:'UNKNOWN',created_ns:'1'},{id:'1',state:'PENDING',created_ns:'1'}],series:[],vault:{},roll:null},
        {kind:'oracle',contract:'oracle.sandbox',tickets:[],cases:[{state:'DELAYED',config:{series_id:'alpha',maturity_ns:'1'}}]}],'10000000000');
    for(const code of ['UNKNOWN_WITHDRAWAL','OVERDUE_WITHDRAWAL','ORACLE_DELAYED','ORACLE_NOT_FINAL','EXECUTABLE_QUOTES_UNOBSERVED'])assert(found.some(x=>x.code===code));
});
