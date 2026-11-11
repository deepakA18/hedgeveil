// One bounded service-fund move; never reads or spends core collateral.
import {loadWorkspace,verifyChain,Q} from '../services/testnet/workspace.mjs';
import {adminFor} from '../services/testnet/deploy.mjs';
import {privateRead} from '../services/demo/storage.mjs';
import {writeFile} from 'node:fs/promises';
const {directory,plan}=await loadWorkspace('native-transfer'),admin=adminFor(directory,plan),p=admin.provider;
await verifyChain(p,plan);
const oracle=plan.accounts.find(a=>a.role==='oracle').id;
const i=await admin.prepare('rebalance-oracle-operating-budget-v1',oracle,plan.root_id,[{type:'Transfer',deposit:String(2n*Q)}]);
const old=await admin.journal.get(i.operation_id);
if(!old.attempted){
 const b=await p.sendJsonRpc('block',{finality:'final'}),a=await p.sendJsonRpc('query',{request_type:'view_account',account_id:oracle,block_id:b.header.hash});
 if(a.code_hash!==plan.artifacts.external_oracle.code_hash||BigInt(a.amount)<8n*Q||a.storage_usage>300000)throw Error('OPERATING_RESERVE_PREFLIGHT');
 // Leaves >=6 NEAR for this resolver, whose actual storage is <300 kB,
 // separate from the core and every user or maker collateral balance.
 const {keys}=await privateRead(directory+'/signers.json');await admin.send(i,keys[oracle]);
}else if((await admin.recover(i)).state!=='SUCCEEDED')throw Error('UNRESOLVED_NO_RESEND');
const receipt=admin.evidence.get(i.operation_id);
if(!receipt)throw Error('RECEIPT_REQUIRED');
const report={observed_at:new Date().toISOString(),scope:'Actual testnet service operating funds only; no core or collateral transfer',intent:i,result:await admin.journal.get(i.operation_id),receipt};
await writeFile('research/reports/native-operating-rebalance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({state:'SUCCEEDED',hash:receipt.transaction.hash,amount_test_near:2}));
