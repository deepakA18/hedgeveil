// Archive actual callback-block source evidence; never requests or publishes prices.
import assert from 'node:assert/strict';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {loadWorkspace,providerFor,verifyChain} from '../services/testnet/workspace.mjs';
import {FileJournal} from '../packages/sdk/journal.mjs';
import {refreshReportProof} from '../services/outlayer/refresh-fast.mjs';
import {verifyRefreshProof} from '../services/outlayer/refresh-proof.mjs';
const {directory,plan}=await loadWorkspace('native-transfer'),p=providerFor(plan),status=await verifyChain(p,plan),oracle=plan.accounts.find(a=>a.role==='oracle').id;
const b=await p.sendJsonRpc('block',{finality:'final'}),r=await p.sendJsonRpc('query',{request_type:'call_function',account_id:oracle,block_id:b.header.hash,method_name:'get_snapshot',args_base64:'e30='});
assert.equal(r.block_hash,b.header.hash);const c=JSON.parse(Buffer.from(r.result).toString()).cases.eta;assert(c);
const j=new FileJournal(directory+'/admin-journal');
for(const id of await readdir(j.directory)){
 if(!/^[a-f0-9]{64}$/.test(id))continue;const op=await j.get(id),m=/^native:eta:refresh:([0-2])$/.exec(op.intent.label);if(!m||op.result?.state!=='SUCCEEDED'||!c.samples[Number(m[1])])continue;
 const slot=Number(m[1]),file=`research/reports/native-public-eta-source-slot-${slot}.json`,pins={expected_genesis_hash:plan.genesis_hash,expected_code_hash:plan.source.code_hash};
 try{const retained=JSON.parse(await readFile(file));verifyRefreshProof(retained.proof,pins,plan.root_id);console.log(JSON.stringify({slot,state:'RETAINED_VERIFIED'}));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
 let receipt;for(const f of await readdir(j.path(id))){if(f.startsWith('observation-')){const o=JSON.parse(await readFile(j.path(id)+'/'+f));if(o.evidence?.transaction)receipt=o.evidence;}}
 assert(receipt);const checked=await refreshReportProof(receipt,{network:'testnet',genesis_hash:plan.genesis_hash,source:plan.source,signer_id:plan.root_id},p,status);
 assert.equal(checked.verified.timestamp_ns,c.samples[slot].report_ns);assert.equal(checked.verified.price,c.samples[slot].price);
 await writeFile(file,JSON.stringify({observed_at:new Date().toISOString(),scope:'Actual public source callback evidence and matching accepted resolver sample',slot,proof:checked.proof,verified:checked.verified,sample:c.samples[slot],resolver:{block:b,query:r}},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({slot,state:'ARCHIVED_VERIFIED',report_ns:c.samples[slot].report_ns,price:c.samples[slot].price}));
}
