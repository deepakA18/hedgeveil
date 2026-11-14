// Read-only chain recovery and additive telemetry; never signs or resends.
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {loadWorkspace} from '../services/testnet/workspace.mjs';
import {adminFor} from '../services/testnet/deploy.mjs';
import {privateRead} from '../services/demo/storage.mjs';
import {matchActions} from '../services/testnet/transactions.mjs';
import {recordDeliveryObservation,readDeliveryObservations} from '../services/outlayer/delivery-observation.mjs';
const w=await loadWorkspace('expiry'),a=adminFor(w.directory,{...w.plan,rpc_url:w.plan.collector_rpc_url??w.plan.rpc_url});
await a.verify();
const unavailable=[];
for(const id of (await readdir(a.journal.directory)).filter(x=>/^[a-f0-9]{64}$/.test(x))){
 const r=await a.journal.get(id),i=r.intent;
 if(!r.attempted||r.result?.state==='EXPIRED_NOT_INCLUDED'||!i.label?.startsWith('expiry:')||i.actions?.length!==1||i.actions[0].method!=='request')continue;
 try{
  // Prefer retained FINAL evidence; use RPC only where the archive lacks it.
  const names=(await readdir(a.journal.path(id))).filter(x=>x.startsWith('observation-'));
  let raw;
  for(const name of names){const o=await privateRead(join(a.journal.path(id),name));if(o.evidence?.final_execution_status==='FINAL')raw=o.evidence;}
  raw??=await a.provider.sendJsonRpc('tx',{tx_hash:r.hash??r.candidate_hash,sender_account_id:i.signer_id,wait_until:'FINAL'});
  if(raw.transaction?.hash!==(r.hash??r.candidate_hash))throw Error('DELIVERY_BINDING');
  matchActions(raw.transaction.actions,i.actions);
  await recordDeliveryObservation(a.journal,raw,i,a.provider);
 }catch{unavailable.push({series_id:i.actions[0].args.series_id,hash:r.hash??r.candidate_hash});}
}
console.log(JSON.stringify({observed_at:new Date().toISOString(),transactions_submitted:0,items:await readDeliveryObservations(a.journal.directory),unavailable}));
