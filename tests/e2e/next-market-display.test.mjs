import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,USD,scenarioPayout,usdValue,decimalPrice,freshSpot,quoteEconomics,withdrawalBlocked,statusLabel,isOpen,explorerUrl} from '../../apps/frontend/lib/market-display.ts';
import {createSpotReader} from '../../apps/frontend/lib/spot-server.ts';
import {payoff} from '../../apps/web/public/model.mjs';

test('scenario payout matches the existing exact reference, including rounding and zero',()=>{
 for(const amount of [1n,50000000000000000000000n,Q,7n*Q+19n])for(let i=1;i<=300;i++){
  const strike=2n*USD,price=BigInt(i)*USD/37n;
  const expected=payoff(String(strike),String(price),String(amount));
  assert.equal(scenarioPayout(amount,strike,price,'P').toString(),expected.p);
  assert.equal(scenarioPayout(amount,strike,price,'N').toString(),expected.n);
 }
 assert.equal(scenarioPayout(Q,2n*USD,0n,'P'),Q);
 assert.equal(scenarioPayout(Q,2n*USD,0n,'N'),0n);
 assert.equal(usdValue(scenarioPayout(Q,2n*USD,4n*USD,'P'),4n*USD),2n*USD);
 assert.throws(()=>scenarioPayout(Q,0n,USD,'N'));
});
test('quotes aggregate fee into buy cost and subtract fee from sell proceeds; unsupported baskets are not summarized',()=>{
 const cash=n=>({asset:{kind:'COLLATERAL'},amount:String(n)}),claim={asset:{kind:'N',series_id:'series'},amount:String(Q)};
 const q={maker_gives:[claim],taker_gives:[cash(Q/10n)],fee:{amount:'7'}};
 assert.equal(quoteEconomics(q,'series','N','BUY').total,Q/10n+7n);
 assert.equal(quoteEconomics({...q,maker_gives:q.taker_gives,taker_gives:q.maker_gives},'series','N','SELL').total,Q/10n-7n);
 assert.equal(quoteEconomics(q,'other','N','BUY'),null);
 assert.equal(quoteEconomics({...q,maker_gives:[claim,claim]},'series','N','BUY'),null);
});
test('unresolved withdrawals stay blocked, including missing hash/results and callback uncertainty',()=>{
 const row={attempted:true,intent:{method:'request_withdrawal'}};
 for(const state of [undefined,'PENDING','SUBMISSION_UNKNOWN','WITHDRAWAL_UNKNOWN','unexpected'])assert.equal(withdrawalBlocked([{...row,result:state?{state}:undefined}],[]),true);
 for(const state of ['WITHDRAWAL_SUCCEEDED','WITHDRAWAL_FAILED_CONFIRMED','FAILED_CONFIRMED'])assert.equal(withdrawalBlocked([{...row,result:{state}}],[]),false);
 assert.equal(withdrawalBlocked([],[{state:'UNKNOWN'}]),true);
 assert.equal(statusLabel('UNKNOWN'),'Needs verification');
 assert.equal(statusLabel('CANCELLED'),'Cancelled');
 assert.equal(explorerUrl('https://evil.invalid'),null);
});
test('spot validation rejects malformed, stale and future data without inventing values',()=>{
 assert.equal(decimalPrice('3.3976'),3397600000000n);
 for(const value of ['0','-1','NaN','Infinity','1e2','01','0.1234567890123','1000001',3])assert.throws(()=>decimalPrice(value));
 const now=Date.parse('2026-11-12T12:00:00Z');const s={price:'1',observedAt:new Date(now).toISOString(),fetchedAt:new Date(now).toISOString()};
 assert.equal(freshSpot(s,now),true);
 assert.equal(freshSpot(s,now+120001),false);
 assert.equal(freshSpot({...s,observedAt:new Date(now+6000).toISOString()},now),false);
 assert.equal(isOpen({final_price:null,config:{maturity_ns:String(BigInt(now)*1000000n)}},now),false);
 assert.equal(isOpen({final_price:null,config:{maturity_ns:String(BigInt(now+1)*1000000n)}},0),false);
});
test('spot reader uses fixed public endpoint, coalesces requests and never serves old data on failure',async()=>{
 let now=Date.parse('2026-11-12T12:00:00Z'),calls=0,fail=false;
 const read=createSpotReader(async(url,options)=>{calls++;assert.equal(url,'https://api.exchange.coinbase.com/products/NEAR-USD/ticker');assert.equal(options.redirect,'error');if(fail)throw Error('offline');return Response.json({price:'3.4',time:new Date(now).toISOString()});},()=>now);
 const [a,b]=await Promise.all([read(),read()]);assert.deepEqual(a,b);assert.equal(calls,1);await read();assert.equal(calls,1);
 now+=16000;fail=true;await assert.rejects(read());await assert.rejects(read());assert.equal(calls,2);
 now+=6000;fail=false;assert.equal((await read()).price,'3400000000000');
 const stale=createSpotReader(async()=>Response.json({price:'3',time:new Date(now-120001).toISOString()}),()=>now);
 await assert.rejects(stale(),/SPOT_STALE/);
});

test('buy breakeven includes fees, identifies unreachable capped payouts and is currency-specific',async()=>{
 const {buyMetrics}=await import('../../apps/frontend/lib/market-display.ts');
 const up=buyMetrics(Q,Q/10n,Q/100n,2n*USD,4n*USD,'N');
 assert.equal(up.costUsd,440000000000n);
 assert.equal(up.breakEven,2440000000000n);
 const capped=buyMetrics(Q,6n*Q/10n,0n,2n*USD,4n*USD,'P');
 assert.equal(capped.breakEven,null);
 const atCap=buyMetrics(Q,Q/2n,0n,2n*USD,4n*USD,'P');
 assert.equal(atCap.breakEven,2n*USD);
 assert.equal(up.premium,-4n*Q/10n);
});
test('Max deposit reserves storage and twice the current SDK gas budget; missing data disables it',async()=>{
 const {maximumDeposit}=await import('../../apps/frontend/lib/market-display.ts');
 const live={native:{amount:String(Q),storage_usage:1000},storage:{storage_byte_cost:'10000000000000000000'},gas_price:'100000000'};
 assert.equal(maximumDeposit(live),Q-1000n*10000000000000000000n-250000000000000n*100000000n*2n);
 assert.equal(maximumDeposit({...live,native:{...live.native,amount:'1'}}),0n);
 assert.equal(maximumDeposit({...live,gas_price:undefined}),null);
 assert.equal(maximumDeposit(null),null);
});
