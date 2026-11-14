// Explicitly reviewed testnet delivery probes. Never accepts a settlement price.
import {fail,uint} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';
import {completeOutcomes} from '../indexer/model.mjs';
import {matchActions} from '../testnet/transactions.mjs';
const SECOND=1000000000n;
export function validateRetryPolicy(p,profile){
 if(!p)return null;
 if(profile.network!=='testnet'||p.version!==1||p.series_id!==profile.terms.series_id||!Number.isInteger(p.max_attempts)||p.max_attempts<2||p.max_attempts>3||!Number.isInteger(p.backoff_seconds)||p.backoff_seconds<30||p.backoff_seconds>600||!Array.isArray(p.reviewed_failures)||p.reviewed_failures.length>2)fail('DELIVERY_RETRY_POLICY');
 hash32(p.original_request_hash);const created=uint(p.authorized_at_ns,64),deadline=uint(p.deadline_ns,64);
 if(deadline<=created||deadline-created>900n*SECOND)fail('DELIVERY_RETRY_POLICY');
 const hashes=new Set();for(const r of p.reviewed_failures){hash32(r.request_hash);hash32(r.result_submission_hash);if(hashes.has(r.request_hash)||r.result_signer!=='worker.outlayer.testnet')fail('DELIVERY_RETRY_POLICY');hashes.add(r.request_hash);}
 return structuredClone(p);
}
export async function reviewedDeliveryFailure({admin,profile,previous,review,worker}){
 const hash=previous.record.hash;if(!hash||hash!==review.request_hash)fail('DELIVERY_RETRY_BINDING');
 const raw=await admin.provider.sendJsonRpc('tx',{tx_hash:hash,sender_account_id:profile.signer_id,wait_until:'FINAL'});
 if(raw.transaction?.hash!==hash||raw.transaction.signer_id!==profile.signer_id||raw.transaction.receiver_id!==profile.resolver.account_id)fail('DELIVERY_RETRY_BINDING');
 matchActions(raw.transaction.actions,previous.intent.actions);const rows=completeOutcomes(raw,raw.transaction);
 const source=rows.filter(r=>r.outcome.executor_id===profile.source.account_id);
 const events=source.flatMap(r=>r.outcome.logs.filter(l=>l.startsWith('EVENT_JSON:')).map(l=>JSON.parse(l.slice(11)))).filter(e=>e.standard==='near-outlayer'&&e.event==='execution_requested');
 if(events.length!==1||events[0].data?.length!==1)fail('DELIVERY_RETRY_BINDING');
 const request=JSON.parse(events[0].data[0].request_data);
 if(request.predecessor_id!==profile.resolver.account_id||request.code_source?.WasmUrl?.hash!==worker||JSON.parse(request.input_data).expiry_seconds!==String(BigInt(profile.terms.maturity_ns)/SECOND))fail('DELIVERY_RETRY_BINDING');
 const timeout=source.filter(r=>r.outcome.logs.some(l=>l.startsWith('Execution promise failed: Failed.')));
 const rejected=rows.filter(r=>r.outcome.executor_id===profile.resolver.account_id&&r.outcome.logs.some(l=>l.includes('EVIDENCE_REJECTED')));
 if(timeout.length!==1||rejected.length!==1)fail('DELIVERY_RETRY_NOT_TIMEOUT');
 const submission=await admin.provider.sendJsonRpc('tx',{tx_hash:review.result_submission_hash,sender_account_id:review.result_signer,wait_until:'FINAL'});
 if(submission.transaction?.hash!==review.result_submission_hash||submission.transaction.signer_id!==review.result_signer||submission.transaction.receiver_id!==profile.source.account_id)fail('DELIVERY_RETRY_BINDING');
 const results=completeOutcomes(submission,submission.transaction),actions=submission.transaction.actions;
 if(actions.length!==1||actions[0]?.FunctionCall?.method_name!=='submit_execution_output_and_resolve')fail('DELIVERY_RETRY_INVALID_COMPUTATION');
 const args=JSON.parse(Buffer.from(actions[0].FunctionCall.args,'base64').toString());
 if(args.request_id!==request.request_id||args.success!==true||args.error!==null||args.output?.Json?.evidence?.request?.expiry_seconds!==String(BigInt(profile.terms.maturity_ns)/SECOND)||!args.output?.Json?.calculation)fail('DELIVERY_RETRY_INVALID_COMPUTATION');
 if(!results.some(r=>r.outcome.executor_id===profile.source.account_id&&JSON.stringify(r.outcome.status.Failure??null).includes('Execution request not found')))fail('DELIVERY_RETRY_NOT_TIMEOUT');
 const b=await admin.provider.sendJsonRpc('block',{block_id:rejected[0].block_hash});
 if(b.header.hash!==rejected[0].block_hash)fail('DELIVERY_RETRY_BINDING');
 return {rejected_ns:uint(b.header.timestamp_nanosec,64),request_id:request.request_id,request_hash:hash,result_submission_hash:review.result_submission_hash};
}
export async function nextDeliveryRetry({admin,profile,original,policy,now,worker}){
 const p=validateRetryPolicy(policy,profile);
 if(!p)return {state:'EVIDENCE_REJECTED_REVIEW_REQUIRED'};
 if(now<uint(p.authorized_at_ns,64)||now>uint(p.deadline_ns,64))return {state:'DELIVERY_RETRY_WINDOW_CLOSED'};
 if(original.record.hash!==p.original_request_hash)fail('DELIVERY_RETRY_BINDING');
 let previous=original;
 for(let attempt=2;attempt<=p.max_attempts;attempt++){
  const intent=await admin.prepare(`expiry:${profile.terms.series_id}:delivery-retry:${attempt}`,profile.signer_id,profile.resolver.account_id,original.intent.actions);
  const record=await admin.journal.get(intent.operation_id);
  if(record.attempted){
   // Recover even retained terminal records: a timeout transaction may contain
   // a failed child receipt while its resolver callback succeeds and rejects.
   const result=await admin.recover(intent);
   if(!['SUCCEEDED','FAILED_CONFIRMED'].includes(result.state))return {state:'HALTED_TRANSACTION',operation:'delivery-retry',result};
   previous={intent,record:await admin.journal.get(intent.operation_id)};continue;
  }
  const review=p.reviewed_failures.find(r=>r.request_hash===previous.record.hash);
  if(!review)return {state:'DELIVERY_RETRY_REVIEW_REQUIRED',attempt:attempt-1,max_attempts:p.max_attempts};
  const proof=await reviewedDeliveryFailure({admin,profile,previous,review,worker});
  const next=proof.rejected_ns+BigInt(p.backoff_seconds)*SECOND;
  if(next>uint(p.deadline_ns,64))return {state:'DELIVERY_RETRY_WINDOW_CLOSED',attempt:attempt-1,max_attempts:p.max_attempts};
  if(now<next)return {state:'WAIT_DELIVERY_RETRY_BACKOFF',attempt:attempt-1,max_attempts:p.max_attempts,next_attempt_ns:String(next)};
  return {state:'DELIVERY_RETRY_READY',intent,proof,attempt};
 }
 return {state:'DELIVERY_RETRY_CAP_REACHED',attempt:p.max_attempts,max_attempts:p.max_attempts};
}
