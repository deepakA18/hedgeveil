import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDeliveryRetry,validateRetryPolicy} from '../../services/outlayer/delivery-retry.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
const h=n=>base58(Buffer.alloc(32,n)),worker='a'.repeat(64),ns=1000000000n;
function fixture(){
 const profile={network:'testnet',signer_id:'root.testnet',resolver:{account_id:'resolver.testnet'},source:{account_id:'outlayer.testnet'},terms:{series_id:'probe',maturity_ns:String(100n*ns)}};
 const action={type:'FunctionCall',method:'request',args:{series_id:'probe'},gas:'290000000000000',deposit:'20000000000000000000000'};
 const original={intent:{signer_id:profile.signer_id,receiver_id:profile.resolver.account_id,actions:[action]},record:{hash:h(1),attempted:true,result:{state:'FAILED_CONFIRMED'}}};
 const review={request_hash:h(1),result_submission_hash:h(2),result_signer:'worker.outlayer.testnet'};
 const policy={version:1,series_id:'probe',original_request_hash:h(1),max_attempts:3,backoff_seconds:30,authorized_at_ns:String(220n*ns),deadline_ns:String(600n*ns),reviewed_failures:[review]};
 const call=a=>({FunctionCall:{method_name:a.method,args:Buffer.from(JSON.stringify(a.args)).toString('base64'),gas:a.gas,deposit:a.deposit}});
 function tx(hash,signer,receiver,action,logs,status={SuccessValue:''}){
  const r=h(hash===h(1)?3:4),root={id:hash,block_hash:h(5),outcome:{executor_id:signer,receipt_ids:[r],logs:[],status:{SuccessReceiptId:r}}};
  return {final_execution_status:'FINAL',transaction:{hash,signer_id:signer,receiver_id:receiver,actions:[action]},transaction_outcome:root,receipts_outcome:[{id:r,block_hash:h(5),outcome:{executor_id:receiver,receipt_ids:[],logs,status}}]};
 }
 const request={request_id:7,predecessor_id:profile.resolver.account_id,code_source:{WasmUrl:{hash:worker}},input_data:JSON.stringify({expiry_seconds:'100'})};
 const raw=tx(h(1),profile.signer_id,profile.resolver.account_id,call(action),['EVIDENCE_REJECTED']);
 raw.receipts_outcome[0].outcome.receipt_ids=[h(6)];
 raw.receipts_outcome.push({id:h(6),block_hash:h(5),outcome:{executor_id:profile.source.account_id,receipt_ids:[],status:{SuccessValue:''},logs:['EVENT_JSON:'+JSON.stringify({standard:'near-outlayer',event:'execution_requested',data:[{request_data:JSON.stringify(request)}]}),'Execution promise failed: Failed. Refunded 19000000000000000000000 yoctoNEAR']}});
 const args={request_id:7,success:true,error:null,output:{Json:{evidence:{request:{expiry_seconds:'100'}},calculation:{price:'2'}}}};
 const sub=tx(h(2),review.result_signer,profile.source.account_id,call({method:'submit_execution_output_and_resolve',args,gas:'1',deposit:'0'}),[],{Failure:{error:'Execution request not found'}});
 const records=new Map();let recoveries=0;
 const admin={provider:{sendJsonRpc:async(method,p)=>method==='block'?{header:{hash:h(5),timestamp_nanosec:String(200n*ns)}}:p.tx_hash===h(1)?raw:sub},prepare:async(label,signer,receiver,actions)=>({operation_id:label,label,signer_id:signer,receiver_id:receiver,actions}),journal:{get:async id=>records.get(id)??{attempted:false}},recover:async i=>{recoveries++;return records.get(i.operation_id).result;}};
 const f={profile,original,review,policy,admin,worker,raw,sub,records,args,run:now=>nextDeliveryRetry({admin,profile,original,policy,now:now??240n*ns,worker}),recoveries:()=>recoveries};return f;
}
test('reviewed complete timeout permits a distinct retry after chain-time backoff',async()=>{
 const f=fixture();assert.equal((await f.run(229n*ns)).state,'WAIT_DELIVERY_RETRY_BACKOFF');const r=await f.run();assert.equal(r.state,'DELIVERY_RETRY_READY');assert.equal(r.intent.label,'expiry:probe:delivery-retry:2');assert.equal(r.attempt,2);
});
test('no policy, expired authorization and unreviewed hash do not authorize spending',async()=>{
 const f=fixture();assert.equal((await nextDeliveryRetry({...f,now:240n*ns,policy:null})).state,'EVIDENCE_REJECTED_REVIEW_REQUIRED');assert.equal((await f.run(601n*ns)).state,'DELIVERY_RETRY_WINDOW_CLOSED');f.policy.reviewed_failures=[];assert.equal((await f.run()).state,'DELIVERY_RETRY_REVIEW_REQUIRED');
});
test('restart sees attempted retry and blocks UNKNOWN instead of preparing another send',async()=>{
 const f=fixture();f.records.set('expiry:probe:delivery-retry:2',{attempted:true,hash:h(8),result:{state:'SUBMISSION_UNKNOWN'}});assert.equal((await f.run()).state,'HALTED_TRANSACTION');assert.equal(f.recoveries(),1);
});
test('terminal retry requires its own review; stable labels enforce total attempt cap',async()=>{
 const f=fixture();f.records.set('expiry:probe:delivery-retry:2',{attempted:true,hash:h(8),result:{state:'FAILED_CONFIRMED'}});assert.equal((await f.run()).state,'DELIVERY_RETRY_REVIEW_REQUIRED');f.records.set('expiry:probe:delivery-retry:3',{attempted:true,hash:h(9),result:{state:'SUCCEEDED'}});assert.equal((await f.run()).state,'DELIVERY_RETRY_CAP_REACHED');assert.equal((await f.run()).state,'DELIVERY_RETRY_CAP_REACHED');
});
test('non-FINAL, incomplete tree, wrong worker/expiry/request and deterministic errors fail closed',async()=>{
 for(const mutate of [
 f=>f.raw.final_execution_status='EXECUTED',
 f=>f.raw.receipts_outcome.pop(),
 f=>f.sub.transaction.signer_id='attacker.testnet',
 f=>f.sub.receipts_outcome[0].outcome.status={Failure:{error:'different failure'}},
 f=>{f.args.success=false;f.args.error='STALE_TRADE';f.sub.transaction.actions[0].FunctionCall.args=Buffer.from(JSON.stringify(f.args)).toString('base64');},
 f=>{f.args.request_id=8;f.sub.transaction.actions[0].FunctionCall.args=Buffer.from(JSON.stringify(f.args)).toString('base64');},
 f=>{f.args.output.Json.evidence.request.expiry_seconds='101';f.sub.transaction.actions[0].FunctionCall.args=Buffer.from(JSON.stringify(f.args)).toString('base64');}
 ]){const f=fixture();mutate(f);await assert.rejects(f.run());}
});
test('policy cannot raise hard cap, shorten backoff, change series or target mainnet',()=>{
 for(const patch of [{max_attempts:4},{max_attempts:0},{backoff_seconds:0},{deadline_ns:String(2000n*ns)},{series_id:'other'}]){const f=fixture();assert.throws(()=>validateRetryPolicy({...f.policy,...patch},f.profile));}const f=fixture();assert.throws(()=>validateRetryPolicy(f.policy,{...f.profile,network:'mainnet'}));
});

test('backoff reports its exact next eligibility time, never beyond authorization',async()=>{
 const f=fixture(),r=await f.run(225n*ns);
 assert.equal(r.attempt,1);assert.equal(r.max_attempts,3);assert.equal(r.next_attempt_ns,String(230n*ns));
 f.policy.deadline_ns=String(226n*ns);
 const closed=await f.run(225n*ns);assert.equal(closed.state,'DELIVERY_RETRY_WINDOW_CLOSED');assert.equal(closed.next_attempt_ns,undefined);
});
