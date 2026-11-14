import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deliveryObservation,recordDeliveryObservation,readDeliveryObservations,settlementDiagnostics} from '../../services/outlayer/delivery-observation.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
const h=n=>base58(Buffer.alloc(32,n));
function fixture(outcome='ACCEPTED'){
 const intent={operation_id:'a'.repeat(64),label:'expiry:demo:request',signer_id:'root.testnet',receiver_id:'resolver.testnet',actions:[{method:'request',args:{series_id:'demo'}}]};
 const data='{"request_id":7,"predecessor_id":"resolver.testnet","sender_id":"root.testnet","timestamp":1794652451457587339}';
 const row=(n,executor,receipts,logs)=>({id:h(n),block_hash:h(4),outcome:{executor_id:executor,receipt_ids:receipts,logs,status:{SuccessValue:''}}});
 const raw={final_execution_status:'FINAL',transaction:{hash:h(1),signer_id:intent.signer_id,receiver_id:intent.receiver_id,actions:[{FunctionCall:{method_name:'request',args:Buffer.from(JSON.stringify({series_id:'demo'})).toString('base64')}}]},transaction_outcome:row(1,intent.signer_id,[h(2)],[]),receipts_outcome:[row(2,'outlayer.testnet',[h(3)],['EVENT_JSON:'+JSON.stringify({standard:'near-outlayer',event:'execution_requested',data:[{request_data:data}]}),outcome==='YIELD_TIMEOUT'?'Execution promise failed: Failed.':outcome==='STALE_TRADE'?'Execution failed: STALE_TRADE':'']),row(3,intent.receiver_id,[],[outcome==='ACCEPTED'?'EVIDENCE_ACCEPTED':'EVIDENCE_REJECTED'])]};
 const provider={sendJsonRpc:async()=>({header:{hash:h(4),timestamp_nanosec:'1794652478108268615'}})};
 return {raw,intent,provider};
}
test('exact receipt timings retain nanoseconds beyond JS safe integers; pickup remains unknown',async()=>{
 const f=fixture(),r=await deliveryObservation(f.raw,f.intent,f.provider);
 assert.equal(r.delivery_ns,'26650681276');assert.equal(r.requested_ns,'1794652451457587339');assert.equal(r.pickup_lag_ns,null);
 for(const outcome of ['YIELD_TIMEOUT','STALE_TRADE','EVIDENCE_REJECTED']){const f=fixture(outcome);assert.equal((await deliveryObservation(f.raw,f.intent,f.provider)).outcome,outcome);}
});
test('incomplete/nonfinal trees and wrong transaction binding cannot produce latency evidence',async()=>{
 for(const mutate of [f=>f.raw.final_execution_status='EXECUTED',f=>f.raw.receipts_outcome.pop(),f=>f.raw.transaction.signer_id='foreign.testnet',f=>f.provider.sendJsonRpc=async()=>({header:{hash:h(5),timestamp_nanosec:'1794652478108268615'}})]){const f=fixture();mutate(f);await assert.rejects(deliveryObservation(f.raw,f.intent,f.provider));}
});
test('observations persist independently of journals, deduplicate and project only public fields',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'hv-delivery-'));try{
  const f=fixture();await recordDeliveryObservation({directory},f.raw,f.intent,f.provider);
  await recordDeliveryObservation({directory},f.raw,f.intent,{sendJsonRpc:async()=>{throw Error('should be cached')}});
  const deliveries=await readDeliveryObservations(directory);assert.equal(deliveries.length,1);
  const p=settlementDiagnostics({deliveries,secret:'never expose',keeper:{checked_at:'now',items:[{series_id:'demo',state:'WAIT_CALLBACK',private_key:'never expose',attempt:1,max_attempts:2}]}});
  assert.equal(p.items[0].attempt,1);assert.equal(p.attempts[0].delivery_ns,'26650681276');assert(!JSON.stringify(p).includes('never expose'));
 }finally{await rm(directory,{recursive:true,force:true});}
});
