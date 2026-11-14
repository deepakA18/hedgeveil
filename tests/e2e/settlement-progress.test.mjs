import test from 'node:test';
import assert from 'node:assert/strict';
import {settlementProgress} from '../../apps/frontend/lib/settlement-progress.ts';
const now=1794650000000,series={config:{series_id:'a'},final_price:null};
function state(s='WAIT_DELIVERY_RETRY_BACKOFF',age=0){return {settlement:{items:[{series_id:'a',state:s,observed_at:new Date(now-age).toISOString(),attempt:2,max_attempts:3,next_attempt_ns:String(BigInt(now+30000)*1000000n)}],attempts:[]}};}
test('countdown appears only for a fresh, scheduled backoff; never a completion ETA',()=>{
 assert(settlementProgress(state(),series,now).nextNs);
 assert.equal(settlementProgress(state(undefined,90001),series,now).nextNs,null);
 for(const s of ['DELIVERY_RETRY_CAP_REACHED','DELIVERY_RETRY_REVIEW_REQUIRED','HALTED_TRANSACTION','WAIT_CALLBACK'])assert.equal(settlementProgress(state(s),series,now).nextNs,null);
 assert.equal(settlementProgress(state(),{...series,final_price:'123'},now).nextNs,null);
 const expired=state();expired.settlement.items[0].next_attempt_ns=String(BigInt(now-1)*1000000n);assert.equal(settlementProgress(expired,series,now).nextNs,null);
});
test('cap/review states disclose indefinite delay; stale metadata cannot declare finality',()=>{
 assert.equal(settlementProgress(state('DELIVERY_RETRY_CAP_REACHED'),series,now).label,'Retry limit reached');
 assert.equal(settlementProgress(state('DELIVERY_RETRY_CAP_REACHED'),series,now).stopped,true);
 assert.equal(settlementProgress(state('COMPLETE'),series,now).label,'Awaiting settlement');
 assert.equal(settlementProgress(null,series,now).attempt,null);
 assert.equal(settlementProgress(state('COMPLETE',90001),series,now).label,'Settlement status updating');
});
