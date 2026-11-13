// Funded, restartable maintenance. Operates only service-owned maker positions.
import {join} from 'node:path';
import {mkdir,rm,readdir} from 'node:fs/promises';
import {privateRead,durableWrite} from '../demo/storage.mjs';
import {adminFor,functionCall} from './deploy.mjs';
import {Q,assertDeploymentEnabled} from './workspace.mjs';
import {canonical,fail} from '../../packages/sdk/intent.mjs';
import {terminal} from '../../packages/sdk/journal.mjs';
import {retainedSeries} from '../../packages/sdk/series.mjs';
import {planLadder} from '../markets/ladder.mjs';
import {CoinbaseMarket} from '../market-data/coinbase.mjs';
import {marketHead} from '../maker/valuation.mjs';
import {createHash} from 'node:crypto';
const BUFFER=Q/10n,SPONSOR=Q/50n;
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
export function renewalBudget({operations,balances,byteCost,root,unresolved}){
 const costs=new Map();for(const o of operations)costs.set(o.signer,(costs.get(o.signer)??0n)+BigInt(o.deposit));
 for(const [id,cost]of costs){
  const n=balances[id];if(!n)fail('RENEWAL_BALANCE_REQUIRED');
  // Includes a conservative 0.001 NEAR gas bound for every action in this batch.
  const gas=BigInt(operations.filter(o=>o.signer===id).length)*Q/1000n;
  const floor=BigInt(n.storage_usage)*BigInt(byteCost)+BUFFER+(id===root?BigInt(unresolved)*SPONSOR:0n);
  if(BigInt(n.amount)<floor+cost+gas)fail('RENEWAL_SERVICE_BUDGET');
 }
}
export function harvestOperations(series,makers,accounts,core,root,nowNs){
 const ops=[];
 for(const s of series){
  if(BigInt(nowNs)<BigInt(s.config.mint_cutoff_ns)||s.request!==null)continue;
  const id=s.config.series_id;
  for(const m of makers){
   const a=accounts[m.id];if(!a||a.closing)fail('RENEWAL_MAKER_ACCOUNT');
   const p=a.positions[s.slot],pn=BigInt(p.p),nn=BigInt(p.n);
   if(s.final_price===null){const amount=pn<nn?pn:nn;if(amount)ops.push({label:`renewal:merge:${id}:${m.id}`,signer:m.id,receiver:core,method:'merge',args:{series_id:id,amount:String(amount)},deposit:'1'});}
   else for(const leg of ['P','N'])if(BigInt(p[leg.toLowerCase()]))ops.push({label:`renewal:redeem:${id}:${m.id}:${leg}`,signer:m.id,receiver:core,method:'redeem',args:{series_id:id,leg,amount:p[leg.toLowerCase()]},deposit:'1'});
  }
  if(s.final_price!==null&&s.outstanding_p==='0'&&s.outstanding_n==='0'){
   if(!s.closed)ops.push({label:`renewal:dust:${id}`,signer:root,receiver:core,method:'release_dust',args:{series_id:id},deposit:'1'});
   ops.push({label:`renewal:archive:${id}`,signer:root,receiver:core,method:'archive_series',args:{series_id:id},deposit:'1'});
  }
 }
 return ops;
}
export async function renewExpiry(workspace,{admin,market,publish}={}){
 const {directory,plan}=workspace;assertDeploymentEnabled(plan);
 if(plan.kind!=='hedgeveil-expiry-testnet'||!['sandbox','testnet'].includes(plan.network))fail('RENEWAL_PROFILE');
 admin??=adminFor(directory,plan);market??=new CoinbaseMarket({archive:join(directory,'listing-observations')});
 const lock=join(directory,'admin-journal','.expiry-coordinator-running');let owned=false;
 try{
  await mkdir(join(directory,'admin-journal'),{recursive:true,mode:0o700});
  try{await mkdir(lock,{mode:0o700});owned=true;}catch(e){if(e.code==='EEXIST')fail('EXPIRY_BUSY_OR_INTERRUPTED');throw e;}
  await durableWrite(join(lock,'owner.json'),{pid:process.pid,started_at:new Date().toISOString()});await admin.verify();
  const d=await privateRead(join(directory,'deployment.json')),{keys}=await privateRead(join(directory,'signers.json'));
  const core=plan.accounts.find(a=>a.role==='core').id,resolver=plan.accounts.find(a=>a.role==='oracle').id,makers=plan.accounts.filter(a=>a.role==='maker');
  if(d.client.contract_id!==core||d.source.account_id!==plan.source.account_id||canonical(d.source)!==canonical(plan.source)||d.vault_enabled!==false)fail('RENEWAL_BINDING');
  const rpc=admin.provider;
  for(const c of [{account_id:core,code_hash:plan.artifacts.core.code_hash},{account_id:resolver,code_hash:plan.artifacts.expiry_oracle.code_hash},plan.source]){
   const n=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:c.account_id,finality:'final'});if(n.code_hash!==c.code_hash)fail('RENEWAL_CODE');
  }
  for(const id of (await readdir(admin.journal.directory)).filter(x=>/^[a-f0-9]{64}$/.test(x))){const r=await admin.journal.get(id);if(r.attempted&&!terminal(r.result?.state)&&!terminal((await admin.recover(r.intent)).state))fail('RENEWAL_UNRESOLVED');}
  const view=(id,method,args={},hash)=>rpc.callFunction({contractId:id,method,args,blockQuery:hash?{blockId:hash}:{finality:'final'}});
  const pendingFile=join(directory,'renewal-pending.json');let pending;try{pending=await privateRead(pendingFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  const execute=async batch=>{
   if(batch.binding!==digest({core,resolver,genesis_hash:plan.genesis_hash})||batch.id!==digest(batch.operations))fail('RENEWAL_JOURNAL_BINDING');
   for(const o of batch.operations){
    if(![plan.root_id,...makers.map(m=>m.id)].includes(o.signer)||![core,resolver].includes(o.receiver)||!keys[o.signer])fail('RENEWAL_SIGNER');
    const i=await admin.prepare(o.label,o.signer,o.receiver,[functionCall(o.method,o.args,o.deposit)]);
    const r=await admin.journal.get(i.operation_id);
    if(r.result?.state==='SUCCEEDED')continue; // complete receipts already retained
    await admin.send(i,keys[o.signer]);
   }
   await mkdir(join(directory,'renewal-batches'),{recursive:true,mode:0o700});
   await durableWrite(join(directory,'renewal-batches',batch.id+'.json'),{...batch,completed_at:new Date().toISOString()});
   await rm(pendingFile);pending=null;
  };
  if(pending)await execute(pending);
  const batch=async(operations,unresolved)=>{
   if(!operations.length)return;
   const balances={};for(const id of new Set(operations.map(o=>o.signer)))balances[id]=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:id,finality:'final'});
   const cost=(await rpc.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
   renewalBudget({operations,balances,byteCost:cost,root:plan.root_id,unresolved});
   pending={version:1,binding:digest({core,resolver,genesis_hash:plan.genesis_hash}),id:digest(operations),operations,created_at:new Date().toISOString()};
   await durableWrite(pendingFile,pending);await execute(pending);
  };
  let head=await rpc.sendJsonRpc('block',{finality:'final'});
  let series=await retainedSeries((m,a)=>view(core,m,a,head.header.hash));
  const cases=await view(resolver,'get_snapshot',{},head.header.hash),accounts={};
  for(const m of makers)accounts[m.id]=await view(core,'get_account',{account_id:m.id},head.header.hash);
  const unresolved=Object.values(cases.cases).filter(c=>c.price===null).length;
  await batch(harvestOperations(series,makers,accounts,core,plan.root_id,head.header.timestamp_nanosec),unresolved);
  // Update registry after harvesting even if subsequent planning is blocked.
  const refresh=async()=>{
   const h=await rpc.sendJsonRpc('block',{finality:'final'});
   const rows=await retainedSeries((m,a)=>view(core,m,a,h.header.hash));d.series=rows.map(s=>s.config);
   await durableWrite(join(directory,'deployment.json'),d);if(publish)await publish(d);return rows;
  };
  series=await refresh();
  const state=await view(resolver,'get_snapshot');
  const retired=Object.values(state.cases).filter(c=>c.price!==null&&!series.some(s=>s.config.series_id===c.config.series_id));
  await batch(retired.map(c=>({label:'renewal:archive-resolver:'+c.config.series_id,signer:plan.root_id,receiver:resolver,method:'archive_case',args:{series_id:c.config.series_id},deposit:'1'})),unresolved);
  const snapshot=await market.snapshot(String(BigInt(Date.now())*1000000n));head=await marketHead(rpc,snapshot);
  series=await retainedSeries((m,a)=>view(core,m,a,head.header.hash));
  const sq=await view(core,'storage_quote',{},head.header.hash),material=await privateRead(join(directory,'listing-cohorts.json'));
  if(sq.layout_version!==2||sq.max_series!==32)fail('RENEWAL_LAYOUT');
  const proposal=planLadder({snapshot,nowNs:head.header.timestamp_nanosec,existing:series,cohorts:material.cohorts,maxSeries:sq.max_series,profileReady:true});
  if(proposal.blocked.length)fail(proposal.blocked[0]);
  const rs=await view(resolver,'get_snapshot'),policy=await view(resolver,'policy_hash'),sourceHash=await view(resolver,'source_hash');
  if(Object.keys(rs.cases).length+proposal.targets.filter(t=>!rs.cases[t.series_id]).length>32)fail('RESOLVER_CAPACITY');
  const operations=[];
  for(const t of proposal.targets){
   const config={series_id:t.series_id,version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:policy,payoff_kind:'CAPPED_USD_COMPLEMENT',strike:t.strike,price_scale:'1000000000000',maturity_ns:t.maturity_ns,mint_cutoff_ns:t.mint_cutoff_ns,observation_window:{start_ns:t.mint_cutoff_ns,end_ns:t.maturity_ns},oracle_account_id:resolver,oracle_version:'native-trade-twap-v1',oracle_config_hash:sourceHash,finalization_policy_hash:policy,max_supply:String(100n*Q)};
   for(const found of [material.terms[t.series_id],series.find(s=>s.config.series_id===t.series_id)?.config,rs.cases[t.series_id]?.config])if(found&&canonical(found)!==canonical(config))fail('EXISTING_TERMS_CONFLICT');
   material.terms[t.series_id]=config;
   if(t.existing)continue;
   if(!rs.cases[t.series_id])operations.push({label:'resolver-series-'+t.series_id,signer:plan.root_id,receiver:resolver,method:'register_series',args:{config},deposit:String(Q/10n)});
   operations.push({label:'core-series-'+t.series_id,signer:plan.root_id,receiver:core,method:'create_series',args:{config},deposit:String(BigInt(sq.series_storage)+BigInt(sq.creation_fee))});
   for(const m of makers)operations.push({label:'inventory-'+t.series_id+'-'+m.id,signer:m.id,receiver:core,method:'split',args:{series_id:t.series_id,amount:plan.inventory_per_market},deposit:'1'});
  }
  for(const m of makers){const a=await view(core,'get_account',{account_id:m.id});if(!a||a.closing||BigInt(a.free)<BigInt(proposal.missing)*BigInt(plan.inventory_per_market))fail('RENEWAL_MAKER_COLLATERAL');}
  material.cohorts=proposal.cohorts;await durableWrite(join(directory,'listing-cohorts.json'),material);
  await batch(operations,Object.values(rs.cases).filter(c=>c.price===null).length+proposal.targets.filter(t=>!rs.cases[t.series_id]).length);
  await refresh();
  const result={version:1,state:'RECONCILED',checked_at:new Date().toISOString(),targets:proposal.targets.map(t=>t.series_id),new_markets:proposal.missing,retained:series.length+proposal.missing,account_capacity:sq.max_accounts};
  await durableWrite(join(directory,'renewal-status.json'),result);return result;
 }catch(e){await durableWrite(join(directory,'renewal-status.json'),{version:1,state:'BLOCKED',checked_at:new Date().toISOString(),code:/^[A-Z_]{1,80}$/.test(e.code??e.message??'')?(e.code??e.message):'RENEWAL_UNAVAILABLE'});throw e;}
 finally{if(owned)await rm(lock,{recursive:true});}
}
