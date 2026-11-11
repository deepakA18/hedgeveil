import test from 'node:test';import assert from 'node:assert/strict';
import {externalQuoteBlocker} from '../../apps/web/quote-gate.mjs';
const c={config:{series_id:'beta',observation_window:{start_ns:'100'},maturity_ns:'190'},samples:[null,null,null],price:null};
const state=()=>({health:{risk_allowed:true},items:[{kind:'external_oracle',body:{state:{paused:false},cases:[structuredClone(c)]}}]});
test('a missed slot blocks new offers before maturity; complete earlier samples permit later slots',()=>{
 assert.equal(externalQuoteBlocker(state(),['beta'],'129'),null);assert.equal(externalQuoteBlocker(state(),['beta'],'130'),'ORACLE_SAMPLE_MISSED');
 const s=state();s.items[0].body.cases[0].samples[0]={price:'3'};assert.equal(externalQuoteBlocker(s,['beta'],'159'),null);assert.equal(externalQuoteBlocker(s,['beta'],'160'),'ORACLE_SAMPLE_MISSED');
});
test('unhealthy, paused, absent and malformed source state fails closed',()=>{
 for(const mutate of [s=>s.health.risk_allowed=false,s=>s.items=[],s=>s.items[0].body.state.paused=true,s=>s.items[0].body.cases[0].samples=[],s=>s.items[0].body.cases=[]]){const s=state();mutate(s);assert(externalQuoteBlocker(s,['beta'],'110'));}
 assert.equal(externalQuoteBlocker(state(),['unknown'],'110'),'ORACLE_UNAVAILABLE');
});
test('fully sampled matured and finalized series are not tradable',()=>{
 const s=state();s.items[0].body.cases[0].samples=[{},{},{}];assert.equal(externalQuoteBlocker(s,['beta'],'190'),'SERIES_UNAVAILABLE');s.items[0].body.cases[0].price='3';assert.equal(externalQuoteBlocker(s,['beta'],'180'),'SERIES_UNAVAILABLE');
});

test('HTTP quote gate rejects missed slots before invoking any maker signing path',async t=>{
 const {createApp}=await import('../../apps/web/server.mjs'),{base58}=await import('../../packages/sdk/rpc.mjs');
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'hv-quote-gate-'));t.after(()=>rm(dir,{recursive:true,force:true}));let calls=0;
 const app=createApp({config:{network:'testnet',chain_id:'testnet',genesis_hash:base58(Buffer.alloc(32,1)),contract_id:'core.testnet',code_hash:base58(Buffer.alloc(32,2)),rpc_url:'https://rpc.testnet.near.org/'},journal:dir,accounts:[{id:'user.testnet'}],oracleProfile:'native-sampled-v1',store:{read:async()=>state()},quoteProvider:async()=>{calls++;throw Error('must never invoke maker');}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));const origin=`http://127.0.0.1:${app.server.address().port}`;
 const r=await fetch(origin+'/api/quotes',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({taker:'user.testnet',mode:'BUY',asset:{kind:'P',series_id:'beta'},amount:'1'})});
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{items:[{quote:null,reason:'ORACLE_SAMPLE_MISSED'}]});assert.equal(calls,0);
});
