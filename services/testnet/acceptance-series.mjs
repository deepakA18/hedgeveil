// Explicit operator acceptance series. Never changes an existing market's terms.
import {join} from 'node:path';
import {mkdir,rm} from 'node:fs/promises';
import {loadWorkspace,Q} from './workspace.mjs';
import {adminFor,functionCall,retained} from './deploy.mjs';
import {privateRead,durableWrite} from '../demo/storage.mjs';
import {deploymentProfiles} from './expiry.mjs';
import {CoinbaseMarket} from '../market-data/coinbase.mjs';
import {marketHead} from '../maker/valuation.mjs';
import {adminTerminal as terminal} from './admin-outcomes.mjs';
import {readdir} from 'node:fs/promises';
const w=await loadWorkspace('expiry'),{directory,plan}=w,a=adminFor(directory,plan);
const lock=join(directory,'admin-journal','.expiry-coordinator-running');let owned=false;
try{
 await mkdir(lock);owned=true;await durableWrite(join(lock,'owner.json'),{pid:process.pid});
 const d=await privateRead(join(directory,'deployment.json'));deploymentProfiles(plan,d);
 for(const id of (await readdir(a.journal.directory)).filter(x=>/^[a-f0-9]{64}$/.test(x))){const r=await a.journal.get(id);if(r.attempted&&!terminal(r.result?.state)&&!terminal((await a.recover(r.intent)).state))throw Error('SIGNER_UNRESOLVED');}
 const {keys}=await privateRead(join(directory,'signers.json'));
 const core=d.client.contract_id,oracle=d.indexer.contracts.find(c=>c.kind==='expiry_oracle').account_id;
 const view=(id,method,args={})=>a.provider.callFunction({contractId:id,method,args,blockQuery:{finality:'final'}});
 await a.verify();for(const c of d.indexer.contracts.concat([d.source])){const n=await a.provider.sendJsonRpc('query',{request_type:'view_account',account_id:c.account_id,finality:'final'});if(n.code_hash!==c.code_hash)throw Error('CODE_MISMATCH');}
 const material=await retained(join(directory,'acceptance-series.json'),async()=>{
  const snapshot=await new CoinbaseMarket({archive:join(directory,'listing-observations')}).snapshot(String(BigInt(Date.now())*1000000n));
  const block=await marketHead(a.provider,snapshot),start=(BigInt(block.header.timestamp_nanosec)/1000000000n+600n)*1000000000n,end=start+1800000000000n;
  const policy=await view(oracle,'policy_hash');
  return {snapshot,config:{...d.series[0],series_id:'acceptance-20261113',strike:snapshot.spot,maturity_ns:String(end),mint_cutoff_ns:String(start),observation_window:{start_ns:String(start),end_ns:String(end)},index_definition_hash:policy,finalization_policy_hash:policy,oracle_config_hash:await view(oracle,'source_hash')}};
 });
 const sq=await view(core,'storage_quote');
 const send=async(label,id,to,method,args,deposit)=>a.send(await a.prepare(label,id,to,[functionCall(method,args,deposit)]),keys[id]);
 await send('acceptance-register-resolver',plan.root_id,oracle,'register_series',{config:material.config},String(Q/10n));
 await send('acceptance-register-core',plan.root_id,core,'create_series',{config:material.config},String(BigInt(sq.series_storage)+BigInt(sq.creation_fee)));
 // Publish before inventory: keeper can recover settlement even if a later step fails.
 if(!d.series.some(s=>s.series_id===material.config.series_id)){d.series.push(material.config);await durableWrite(join(directory,'deployment.json'),d);}
 await send('acceptance-root-collateral',plan.root_id,core,'deposit_collateral',{},String(Q/20n));
 // Operator-owned pair supplies a genuine held position for the settlement test.
 await send('acceptance-root-pair',plan.root_id,core,'split',{series_id:material.config.series_id,amount:String(Q/100n)},'1');
 await durableWrite('research/reports/backend-live-acceptance-series.json',{scope:'Real testnet acceptance series; settlement pending',config:material.config,snapshot:material.snapshot,operations:[...a.evidence].map(([operation_id,t])=>({operation_id,hash:t.transaction.hash,status:t.status}))});
 console.log(JSON.stringify({series:material.config.series_id,expiry:new Date(Number(BigInt(material.config.maturity_ns)/1000000n)).toISOString(),state:'REAL_REGISTERED_AND_FUNDED'}));
}finally{if(owned)await rm(lock,{recursive:true});}
