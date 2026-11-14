import test from 'node:test';
import assert from 'node:assert/strict';
import {positionBasis,pnlPercent} from '../../apps/frontend/lib/position-pnl.ts';
import {bestReviewOffer} from '../../apps/frontend/lib/trade-review.ts';
import {quoteEconomics} from '../../apps/frontend/lib/market-display.ts';
const account='alice.testnet', domain={contract_id:'core.testnet',network:'testnet'};
const leg=(kind,amount)=>({asset:kind==='COLLATERAL'?{kind}:{kind,series_id:'one'},amount:String(amount)});
function fill(id,side,qty,gross,fee=1){return {hash:id,attempted:true,result:{state:'SUCCEEDED'},intent:{operation_id:id,signer_id:account,domain,method:'fill_quote',args:{quote:{taker:account,maker:'maker.testnet',expiry_ns:'100000000000',maker_gives:side==='BUY'?[leg('N',qty)]:[leg('COLLATERAL',gross)],taker_gives:side==='BUY'?[leg('COLLATERAL',gross)]:[leg('N',qty)],fee:{amount:String(fee)}}}}};}
const basis=(records,held)=>positionBasis(records,account,domain.contract_id,domain.network,'one','N',BigInt(held));
test('confirmed acquisition includes buy fees; fresh net sell value includes exit fee',()=>{
 const buy=fill('a','BUY',100,19,1), sell=fill('b','SELL',100,31,1).intent.args.quote;
 assert.equal(basis([buy],100).cost,20n);
 const request={mode:'SELL',asset:{kind:'N',series_id:'one'},amount:'100',taker:account};
 assert.equal(bestReviewOffer([{quote:sell}],request,1000),0);
 const pnl=quoteEconomics(sell,'one','N','SELL').total-basis([buy],100).cost;
 assert.equal(pnl,10n);assert.equal(pnlPercent(pnl,20n),'+50.00%');
 assert.equal(bestReviewOffer([{quote:sell}],request,100001),-1);
});
test('partial disposal keeps proportional entry cost, rounding up conservatively',()=>{
 const buy=fill('a','BUY',100,20,1),sell=fill('b','SELL',25,7);
 assert.equal(basis([sell,buy],75).cost,16n);
 assert.equal(basis([buy,buy,sell],75).cost,16n);
 assert.equal(pnlPercent(-8n,16n),'−50.00%');assert.equal(pnlPercent(2n,0n),null);
});
test('multiple buys aggregate only without ambiguous disposition ordering',()=>{
 const buys=[fill('a','BUY',100,19),fill('b','BUY',100,29)];
 assert.equal(basis(buys,200).cost,50n);
 assert.equal(basis([...buys,fill('c','SELL',25,7)],175).cost,null);
});
test('missing history, wrong deployment/account, unknown execution and pair allocation fail closed',()=>{
 const buy=fill('a','BUY',100,19);
 assert.equal(basis([],100).cost,null);assert.equal(basis([buy],101).cost,null);
 for(const change of [r=>r.intent.domain={...domain,contract_id:'old.testnet'},r=>r.intent.signer_id='bob.testnet',r=>r.result.state='UNKNOWN',r=>delete r.hash,r=>r.intent.args.quote.fee.amount='bad']){
  const r=structuredClone(buy);change(r);assert.equal(basis([r],100).cost,null);
 }
 const split={...structuredClone(buy),hash:'split',intent:{...buy.intent,method:'split',args:{series_id:'one',amount:'100'}}};
 assert.equal(basis([split],100).reason,'Pair cost not allocated');
 const pending=fill('b','SELL',10,2);pending.result.state='UNKNOWN';
 assert.equal(basis([buy,pending],100).reason,'Receipt pending');
 pending.result.state='FAILED_CONFIRMED';assert.equal(basis([buy,pending],100).cost,20n);
});
test('unsubmitted previews do not change basis; matching merge reduces a single purchase',()=>{
 const buy=fill('a','BUY',100,19),preview=fill('b','SELL',10,2);
 preview.attempted=false;delete preview.hash;preview.result={state:'PREPARED'};
 assert.equal(basis([buy,preview],100).cost,20n);
 const merge={...structuredClone(buy),hash:'merge',intent:{...buy.intent,method:'merge',args:{series_id:'one',amount:'50'}}};
 assert.equal(basis([buy,merge],50).cost,10n);
});
