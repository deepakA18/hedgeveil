import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNear,formatNear,Q} from '../../packages/sdk/amounts.mjs';
import {basket,shortfalls,payoff,stateText} from '../../apps/web/public/model.mjs';
const cash={kind:'COLLATERAL'},p={kind:'P',series_id:'alpha'};
test('browser exact amounts retain sub-yocto limits and large values',()=>{
 const text='90071992547409.000000000000000000000001';
 assert.equal(formatNear(parseNear(text)),text);
 for(const invalid of ['1e6',' 1','1.0000000000000000000000001','-1','01','1,000'])assert.throws(()=>parseNear(invalid));
});
test('basket preview preserves ceil entry, floor exit and last-holder allocation',()=>{
 const v={supply:'3',initial_shares:'3',holdings:[{asset:p,amount:'10'},{asset:cash,amount:'2'}]};
 assert.deepEqual(basket(v,'1').map(x=>x.amount),['4','1']);
 assert.deepEqual(basket(v,'1',true).map(x=>x.amount),['3','0']);
 assert.deepEqual(basket(v,'3',true).map(x=>x.amount),['10','2']);
 assert.throws(()=>basket(v,'4',true));assert.throws(()=>basket({...v,closed:true},'1'));
});
test('shortfalls combine quote collateral and fees without hiding deficits',()=>{
 const state={accounts:{alice:{free:'5'}},series:[]};
 assert.deepEqual(shortfalls(state,'alice',[{asset:cash,amount:'4'},{asset:cash,amount:'3'}]),[{asset:cash,amount:'7',shortfall:'2'}]);
});
test('display chart uses complementary fixed-point coefficients and bounded payout',()=>{
 for(const m of ['1','2','3','999999999999']){const v=payoff('2',m);assert.equal(BigInt(v.p)+BigInt(v.n),Q);}
 assert.equal(payoff('2','3','1').p,'0');
 assert.match(stateText.WITHDRAWAL_UNKNOWN,/never authorizes resend or refund/);
 assert.match(stateText.SUBMISSION_UNKNOWN,/do not repeat/);
});
