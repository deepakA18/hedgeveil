import test from 'node:test';
import assert from 'node:assert/strict';
import {bestReviewOffer,requestReviewOffers} from '../../apps/frontend/lib/trade-review.ts';
const request={mode:'BUY',asset:{kind:'P',series_id:'one'},amount:'100',taker:'owner.testnet'};
const offer=(gross,fee='1',mode='BUY')=>({quote:{taker:request.taker,maker:'maker.testnet',expiry_ns:'100000000000',maker_gives:mode==='BUY'?[{asset:{...request.asset},amount:'100'}]:[{asset:{kind:'COLLATERAL'},amount:gross}],taker_gives:mode==='BUY'?[{asset:{kind:'COLLATERAL'},amount:gross}]:[{asset:{...request.asset},amount:'100'}],fee:{amount:fee}}});
test('review chooses cheapest exact buy and highest net sell, including fees',()=>{
 assert.equal(bestReviewOffer([offer('90','9'),offer('95','1')],request,1000),1);
 assert.equal(bestReviewOffer([offer('100','9','SELL'),offer('99','1','SELL')],{...request,mode:'SELL'},1000),1);
});
test('wrong account, size, series, leg, malformed and expiring offers never reach review',()=>{
 for(const change of [q=>q.taker='other.testnet',q=>q.maker_gives[0].amount='101',q=>q.maker_gives[0].asset={kind:'P',series_id:'other'},q=>q.maker_gives[0].asset.kind='N',q=>q.fee.amount='invalid',q=>q.expiry_ns='6000000000']){
  const item=offer('90');change(item.quote);assert.equal(bestReviewOffer([item],request,1000),-1);
 }
 assert.equal(bestReviewOffer([offer('90')],request,0),-1);
});
test('one bounded busy retry fetches offers only; sustained busy returns a reason',async()=>{
 let calls=0,waits=0;const busy={items:[{quote:null,reason:'MAKER_MAINTENANCE'}]};
 const result=await requestReviewOffers(request,async()=>{calls++;return busy},()=>true,async()=>{waits++});
 assert.equal(calls,2);assert.equal(waits,1);assert.equal(result,busy);
 calls=0;const available={items:[offer('90')]};assert.equal(await requestReviewOffers(request,async()=>++calls===1?busy:available,()=>true,async()=>{}),available);
});
test('selection/account changes discard a late response and prevent a queued retry',async()=>{
 let current=true,calls=0;
 const result=await requestReviewOffers(request,async()=>{calls++;return {items:[{quote:null,reason:'MAKER_BUSY'}]}},()=>current,async()=>{current=false});
 assert.equal(result,null);assert.equal(calls,1);
 assert.equal(await requestReviewOffers(request,async()=>({items:[offer('90')]}),()=>false),null);
});
test('inventory, data errors and partial successes do not retry; transport failures propagate',async()=>{
 for(const items of [[{quote:null,reason:'INVENTORY_LIMIT'}],[{quote:null,reason:'MARKET_DATA_UNAVAILABLE'}],[offer('90'),{quote:null,reason:'MAKER_BUSY'}]]){
  let calls=0;await requestReviewOffers(request,async()=>{calls++;return {items}},()=>true,async()=>{throw Error('unexpected retry')});assert.equal(calls,1);
 }
 await assert.rejects(requestReviewOffers(request,async()=>{throw Error('RPC_DOWN')},()=>true),/RPC_DOWN/);
});
