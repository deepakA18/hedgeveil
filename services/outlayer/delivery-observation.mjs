// Read-only receipt telemetry. Never authorizes a retry or accepts a price.
import {join} from 'node:path';
import {readdir,mkdir} from 'node:fs/promises';
import {completeOutcomes} from '../indexer/model.mjs';
import {privateRead,durableWrite} from '../demo/storage.mjs';
export async function deliveryObservation(raw,intent,provider){
 const action=intent.actions?.[0];
 if(intent.actions?.length!==1||action?.method!=='request'||!intent.label?.startsWith('expiry:')||typeof action.args?.series_id!=='string')return null;
 if(raw.transaction?.signer_id!==intent.signer_id||raw.transaction.receiver_id!==intent.receiver_id)throw Error('DELIVERY_BINDING');
 const call=raw.transaction.actions?.[0]?.FunctionCall;
 if(raw.transaction.actions?.length!==1||call?.method_name!=='request'||JSON.parse(Buffer.from(call.args,'base64').toString()).series_id!==action.args.series_id)throw Error('DELIVERY_BINDING');
 const rows=completeOutcomes(raw,raw.transaction),source=rows.filter(r=>r.outcome.executor_id==='outlayer.testnet');
 const events=source.flatMap(r=>r.outcome.logs.filter(l=>l.startsWith('EVENT_JSON:')).map(l=>JSON.parse(l.slice(11)))).filter(e=>e.standard==='near-outlayer');
 const requested=events.filter(e=>e.event==='execution_requested');
 if(requested.length!==1||requested[0].data?.length!==1)return null;
 const request=requested[0].data[0];
 if(!request)return null;
 // Outlayer emits nanoseconds as an unquoted JSON integer, beyond JS's safe
 // integer range. Preserve its decimal representation before parsing.
 const data=JSON.parse(request.request_data.replace(/("timestamp"\s*:\s*)(\d+)(?=\s*[,}])/g,'$1"$2"'));
 if(data.predecessor_id!==intent.receiver_id||data.sender_id!==intent.signer_id)return null;
 const callbacks=rows.filter(r=>r.outcome.executor_id===intent.receiver_id&&r.outcome.logs.some(l=>l.includes('EVIDENCE_ACCEPTED')||l.includes('EVIDENCE_REJECTED')));
 if(callbacks.length!==1)return null;
 const callback=callbacks[0],block=await provider.sendJsonRpc('block',{block_id:callback.block_hash});
 if(block.header.hash!==callback.block_hash)throw Error('DELIVERY_BLOCK_MISMATCH');
 const accepted=callback.outcome.logs.some(l=>l.includes('EVIDENCE_ACCEPTED'));
 const text=source.flatMap(r=>r.outcome.logs).join('\n');
 const outcome=accepted?'ACCEPTED':text.includes('STALE_TRADE')?'STALE_TRADE':text.includes('Execution promise failed: Failed.')?'YIELD_TIMEOUT':'EVIDENCE_REJECTED';
 if(typeof data.timestamp!=='string'||!/^\d+$/.test(data.timestamp))throw Error('DELIVERY_TIMESTAMP');
 const start=BigInt(data.timestamp),end=BigInt(block.header.timestamp_nanosec);
 if(end<start)throw Error('DELIVERY_TIME_ORDER');
 return {version:1,series_id:action.args.series_id,hash:raw.transaction.hash,request_id:data.request_id,source:'outlayer.testnet',requested_ns:String(start),callback_ns:String(end),delivery_ns:String(end-start),pickup_ns:null,pickup_lag_ns:null,outcome,callback_block:callback.block_hash,observed_at:new Date().toISOString()};
}
export async function recordDeliveryObservation(journal,raw,intent,provider){
 if(!intent.label?.startsWith('expiry:')||intent.actions?.[0]?.method!=='request')return;
 const path=join(journal.directory,'delivery-observations',intent.operation_id+'.json');
 if(await privateRead(path).catch(()=>null))return;
 const item=await deliveryObservation(raw,intent,provider);
 if(item){await mkdir(join(journal.directory,'delivery-observations'),{recursive:true,mode:0o700});await durableWrite(path,item);}
}
export async function readDeliveryObservations(journalDirectory){
 const directory=join(journalDirectory,'delivery-observations');
 const names=await readdir(directory).catch(()=>[]);
 return Promise.all(names.filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>privateRead(join(directory,n))));
}
// Explicit public projection: never return private journals, keys, or raw RPC errors.
export function settlementDiagnostics(runtime){
 const observed=runtime?.keeper?.checked_at??null;
 const attempts=(runtime?.deliveries??[]).filter(x=>x?.version===1).map(x=>({series_id:x.series_id,hash:x.hash,request_id:x.request_id,requested_ns:x.requested_ns,callback_ns:x.callback_ns,delivery_ns:x.delivery_ns,pickup_lag_ns:null,outcome:x.outcome}));
 const items=(runtime?.keeper?.items??[]).map(i=>({series_id:i.series_id,state:i.state,observed_at:i.observed_at??observed,attempt:i.attempt??null,max_attempts:i.max_attempts??null,next_attempt_ns:i.next_attempt_ns??null}));
 return {observed_at:observed,items,attempts};
}
