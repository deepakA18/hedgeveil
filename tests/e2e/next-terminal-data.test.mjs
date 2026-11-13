import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,USD,freshSpot,scenarioPayout} from '../../apps/frontend/lib/market-display.ts';
import {nearBreakEven,fixedPayout,lifecycle,oracleCase,scenarioRows,intrinsicDelta,percent,exactUsd,coefficientText,missedSampleSlots,redeemedToDate} from '../../apps/frontend/lib/terminal-data.ts';
const now=1794500000000;
const series={config:{series_id:'a',strike:String(2n*USD),maturity_ns:String(BigInt(now-1000)*1000000n),oracle_account_id:'oracle.testnet',oracle_config_hash:'bound'},final_price:null,p_coefficient:'0',n_coefficient:'0'};
test('expiry never implies locked payout; oracle finality alone does not imply core finality',()=>{
 assert.equal(fixedPayout(series,Q,'P'),null);
 assert.equal(lifecycle(series,now,{state:'FINALIZED'}),'MATURED_PENDING');
 assert.equal(lifecycle(series,now,{state:'RESOLUTION_DELAYED'}),'RESOLUTION_DELAYED');
 const finalized={...series,final_price:String(4n*USD),p_coefficient:String(Q/2n),n_coefficient:String(Q/2n)};
 assert.equal(fixedPayout(finalized,Q,'P'),Q/2n);
 assert.equal(lifecycle(finalized,now),'FINALIZED');
});
test('settlement evidence must match resolver identity and immutable config',()=>{
 const e={config:{...series.config},samples:[]};
 const state={items:[{contract:'oracle.testnet',kind:'external_oracle',body:{cases:[e]}}]};
 assert.equal(oracleCase(state,series),e);
 assert.equal(oracleCase(state,{...series,config:{...series.config,oracle_config_hash:'other'}}),undefined);
 assert.equal(oracleCase({...state,items:[{...state.items[0],contract:'foreign.testnet'}]},series),undefined);
});
test('NEAR breakeven has a different basis from USD entry-cost breakeven and handles degenerate costs',()=>{
 assert.equal(nearBreakEven(Q,Q/5n,2n*USD,'N'),2500000000000n);
 assert.equal(nearBreakEven(Q,Q/2n,2n*USD,'P'),4n*USD);
 assert.equal(nearBreakEven(Q,Q,2n*USD,'N'),null);
 assert.equal(nearBreakEven(Q,Q,2n*USD,'P'),null);
 assert.equal(nearBreakEven(Q,0n,2n*USD,'P'),null);
});
test('five scenario levels retain exact integer payouts and distinguish NEAR and USD P&L',()=>{
 const rows=scenarioRows(Q,2n*USD,4n*USD,'P',Q/2n);
 assert.equal(rows.length,5);
 for(const r of rows)assert.equal(r.payout,scenarioPayout(Q,2n*USD,r.x,'P'));
 assert.equal(rows[0].pnlNear,Q/2n);assert.equal(rows[0].pnlUsd,0n);
 assert.equal(percent(90n,100n),'90.00%');assert.equal(percent(-1n,3n,true),'-33.33%');
});
test('spot-derived USD expires at 30 seconds; intrinsic exposure is not smooth model delta',()=>{
 const s={price:String(4n*USD),observedAt:new Date(now).toISOString(),fetchedAt:new Date(now).toISOString()};
 assert.equal(freshSpot(s,now+30000),true);assert.equal(freshSpot(s,now+30001),false);
 assert.equal(intrinsicDelta(Q,2n*USD,4n*USD,'P'),0n);
 assert.equal(intrinsicDelta(Q,2n*USD,4n*USD,'N'),Q);
 assert.equal(intrinsicDelta(Q,2n*USD,2n*USD,'N'),null);
});

test('stored settlement values preserve precision; missed slots follow the immutable window',()=>{
 assert.equal(exactUsd('3716050000000'),'$3.71605');
 assert.equal(coefficientText('990917775595053887864802'),'0.9909');
 assert.equal(coefficientText('9082224404946112135198'),'0.0091');
 const s={...series,config:{...series.config,oracle_version:'native-sampled-v1',observation_window:{start_ns:'1000000000000',end_ns:'1540000000000'}}};
 assert.deepEqual(missedSampleSlots(s,{samples:[{},null,null]},1540000),[2,3]);
 assert.deepEqual(missedSampleSlots(s,{samples:[null,null,null]},1179999),[]);
 assert.deepEqual(missedSampleSlots(s,{samples:[null,null,null]},1180000),[1]);
 assert.deepEqual(missedSampleSlots(s,undefined,1540000),[]);
});

test('redeemed totals distinguish per-leg redemption from paired merge burns',()=>{
 const supply={total_split:String(4n*Q),total_merged:String(Q/200n),outstanding_p:String(3895n*Q/1000n),outstanding_n:String(3945n*Q/1000n)};
 assert.deepEqual(redeemedToDate(supply),{minted:4n*Q,merged:Q/200n,p:Q/10n,n:Q/20n});
 assert.equal(redeemedToDate({...supply,total_merged:undefined}),null);
 assert.equal(redeemedToDate({...supply,outstanding_n:String(5n*Q)}),null);
});
