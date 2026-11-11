import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePrice,assessPrices,ReadOnlyOracleRpc,decodeView,inspectOracle} from '../../services/outlayer/reader.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {assertDeploymentEnabled} from '../../services/testnet/workspace.mjs';
import {startBootstrap} from '../../services/testnet/bootstrap.mjs';
import {deploy,settle} from '../../services/testnet/deploy.mjs';
const NOW='1794226041490643280',RECENT=String(BigInt(NOW)-30_000_000_000n),OLD=String(BigInt(NOW)-61_000_000_000n);
const price={multiplier:'371543333',decimals:8};
const data=()=>({timestamp:NOW,recency_duration_sec:300,prices:[{asset_id:'wrap.near',price:{...price}}]});
const asset=stamp=>({reports:[{oracle_id:'price-oracle.testnet',timestamp:stamp,price:{...price}}]});
const assess=(d,a)=>assessPrices(d,a,{now_ns:NOW});
const hash=n=>base58(Buffer.alloc(32,n));
test('normalization preserves exact decimal units and integers above JS safe range',()=>{
    assert.equal(normalizePrice(price),'3715433330000');
    assert.equal(normalizePrice({multiplier:'9007199254740993',decimals:12}),'9007199254740993');
    assert.equal(normalizePrice({multiplier:'123000',decimals:15}),'123');
});
test('unsafe encodings, nonpositive prices, overflow and precision loss are rejected',()=>{
    for(const multiplier of [9007199254740993,'-1','0','01','1e8','1.0',String(1n<<128n)])assert.throws(()=>normalizePrice({multiplier,decimals:8}));
    for(const decimals of [-1,39,1.5,'8'])assert.throws(()=>normalizePrice({multiplier:'1',decimals}));
    assert.throws(()=>normalizePrice({multiplier:'1',decimals:13}),/PRECISION_LOSS/);
    assert.throws(()=>normalizePrice({multiplier:String((1n<<128n)-1n),decimals:0}),/OVERFLOW/);
});
test('query-time freshness never masks stale report timestamps',()=>{
    const r=assess(data(),asset(OLD));assert.equal(r.state,'STALE_REPORTS');assert.equal(r.price,null);assert.equal(r.settlement_eligible,false);
});
test('upstream recency is not substituted for the consumer age bound',()=>{
    const d=data();d.recency_duration_sec=9999999;assert.equal(assess(d,asset(OLD)).state,'STALE_REPORTS');
});
test('null and missing data stay unavailable without substituting a synthetic price',()=>{
    const d=data();d.prices[0].price=null;assert.equal(assess(d,asset(RECENT)).state,'PRICE_UNAVAILABLE');
    assert.equal(assess(undefined,undefined).state,'REJECTED');assert.equal(assess(data(),null).reason,'REPORT_TIMESTAMPS_MISSING');
});
test('wrong, duplicate and missing requested assets are rejected',()=>{
    for(const prices of [[],[{asset_id:'aurora',price}],[...data().prices,...data().prices]])assert.equal(assess({...data(),prices},asset(RECENT)).reason,'ORACLE_ASSET_MISMATCH');
});
test('future timestamps and lossy numeric nanoseconds are rejected',()=>{
    assert.equal(assess({...data(),timestamp:String(BigInt(NOW)+1n)},asset(RECENT)).reason,'FUTURE_RESPONSE_TIMESTAMP');
    assert.equal(assess(data(),asset(String(BigInt(NOW)+1n))).reason,'FUTURE_REPORT_TIMESTAMP');
    assert.equal(assess(data(),asset(Number(RECENT))).reason,'INVALID_ORACLE_INTEGER');
});
test('ambiguous aggregation and duplicate oracle reports fail closed',()=>{
    const a=asset(RECENT);a.reports.push({...a.reports[0]});assert.equal(assess(data(),a).reason,'DUPLICATE_ORACLE_REPORT');
    a.reports[1].oracle_id='other.testnet';a.reports[1].price={multiplier:'1',decimals:8};assert.equal(assess(data(),a).reason,'AGGREGATION_UNVERIFIED');
});
test('recent reports may support diagnostics but NEVER authorize expiry settlement',()=>{
    const r=assess(data(),asset(RECENT));assert.equal(r.state,'RECENT_REPORT_ONLY');assert.equal(r.price,'3715433330000');
    assert.equal(r.report_age_ns,'30000000000');assert.equal(r.settlement_eligible,false);assert.equal(r.settlement_blocker,'HISTORICAL_OBSERVATION_PROOF_REQUIRED');
});
test('RPC client has no transaction, paid-call or arbitrary method capability',async()=>{
    let sent=0;const rpc=new ReadOnlyOracleRpc('https://rpc.testnet.near.org/',{fetchImpl:async()=>{sent++;throw Error('unexpected');}});
    for(const method of ['send_tx','broadcast_tx_commit','EXPERIMENTAL_tx_status'])await assert.rejects(rpc.request(method),/READ_ONLY/);
    for(const method_name of ['request_price_data','oracle_call','get_resolution'])await assert.rejects(rpc.request('query',{request_type:'call_function',method_name}),/READ_ONLY/);
    assert.equal(sent,0);
    for(const url of ['http://rpc.testnet.near.org/','https://u:p@rpc.testnet.near.org/','https://rpc.testnet.near.org/?key=x'])assert.throws(()=>new ReadOnlyOracleRpc(url));
});
test('view decoding requires pinned block and complete valid bytes; RPC errors remain errors',()=>{
    const r={http_status:200,raw:{result:{block_hash:hash(1),result:[...Buffer.from(JSON.stringify(data()))]}}};
    assert.deepEqual(decodeView(r,hash(1)),data());assert.throws(()=>decodeView(r,hash(2)),/BLOCK_MISMATCH/);
    for(const x of [{http_status:429,raw:{error:{}}},{http_status:200,raw:{result:{error:'unknown method'}}},{http_status:200,raw:{result:{block_hash:hash(1),result:[256]}}}])assert.throws(()=>decodeView(x,hash(1)));
});
test('wrong chain, genesis and code hash stop discovery before price reads',async()=>{
    const cfg={network:'testnet',contract_id:'price-oracle.testnet',rpc_url:'https://rpc.testnet.near.org/',expected_genesis_hash:hash(1),expected_code_hash:hash(2)};
    for(const mode of ['chain','genesis','code']){
        let prices=0;
        const rpc={request:async(method,params)=>{
            let result;if(method==='status')result={chain_id:mode==='chain'?'mainnet':'testnet',genesis_hash:mode==='genesis'?hash(3):hash(1)};
            else if(method==='block')result={header:{hash:hash(4),height:1,timestamp_nanosec:NOW}};
            else if(params.request_type==='view_account')result={block_hash:hash(4),code_hash:hash(3)};
            else {prices++;throw Error('should not query prices');}return {http_status:200,raw:{result}};
        }};
        const r=await inspectOracle(cfg,{rpc});assert.match(r.error,/MISMATCH/);assert.equal(prices,0);
    }
});
test('superseded deployment plan blocks bootstrap and deploy before keys or RPC writes',async()=>{
    const plan={deployment_hold:'OUTLAYER_FEASIBILITY_AND_BUDGET_REVIEW'};
    assert.throws(()=>assertDeploymentEnabled(plan),/DEPLOYMENT_ON_HOLD/);
    await assert.rejects(startBootstrap({directory:'/nonexistent',plan}),/DEPLOYMENT_ON_HOLD/);
    await assert.rejects(deploy({directory:'/nonexistent',plan},{admin:{}}),/DEPLOYMENT_ON_HOLD/);
    await assert.rejects(settle({directory:'/nonexistent',plan},{admin:{}}),/DEPLOYMENT_ON_HOLD/);
});
