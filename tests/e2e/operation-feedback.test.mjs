import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptFeedback} from '../../apps/frontend/lib/operation-feedback.ts';

test('only finalized receipt success is presented as success', () => {
  for (const state of ['SUCCEEDED','WITHDRAWAL_SUCCEEDED']) assert.equal(receiptFeedback({state}).type,'success');
  for (const state of [undefined,'UNKNOWN','PREPARED','ATTEMPTED','SUBMISSION_UNKNOWN','CANCELLED']) {
    const result=receiptFeedback({state});
    assert.equal(result.type,'warning');
    assert.match(result.description,/do not resend/);
    assert.equal(result.timeout,0);
  }
  assert.equal(receiptFeedback({state:'PENDING'}).type,'loading');
});
test('failure requires a confirmed failure result, including withdrawal callbacks', () => {
  for (const state of ['FAILED_CONFIRMED','WITHDRAWAL_FAILED_CONFIRMED']) assert.equal(receiptFeedback({state}).type,'error');
  assert.notEqual(receiptFeedback({state:'UNKNOWN',reason:'RPC_UNAVAILABLE',hash:'candidate'}).type,'error');
});
test('expired unused quote is no fill, not a success or a transaction failure',()=>{
  const out=receiptFeedback({state:'QUOTE_EXPIRED_UNFILLED'});
  assert.equal(out.type,'info');assert.match(out.description,/fresh offer/);
});
