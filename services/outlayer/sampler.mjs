// Bounded native-sampled-v1 operations. No wallet discovery or key loading.
// Caller supplies an explicitly provisioned service signer and durable admin journal.
import {canonical,account,fail,uint} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';
import {assertDeploymentEnabled} from '../testnet/workspace.mjs';
import {normalizePrice} from './reader.mjs';
import {refreshReportProof} from './refresh-fast.mjs';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
const S=1_000_000_000n,DEPOSIT='20000000000000000000000';
export const ACCEPTED_POLICY='native-sampled-v1/testnet/2026-11-10';
export function samplingProfile(input){
 const c=structuredClone(input);assertDeploymentEnabled(c);
 if(!['sandbox','testnet'].includes(c.network)||c.policy_acceptance!==ACCEPTED_POLICY)fail('SAMPLER_POLICY');
 if(typeof c.chain_id!=='string'||!c.chain_id||(c.network==='testnet'?c.chain_id!=='testnet':['mainnet','testnet'].includes(c.chain_id)))fail('SAMPLER_NETWORK');
 hash32(c.genesis_hash);account(c.signer_id);
 for(const x of [c.source,c.resolver,c.core]){account(x.account_id);hash32(x.code_hash);}
 if(new Set([c.source.account_id,c.resolver.account_id,c.core.account_id]).size!==3)fail('SAMPLER_CONTRACTS');
 if(c.network==='testnet'&&(c.source.account_id!=='price-oracle.testnet'||c.genesis_hash!=='FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b'))fail('SAMPLER_SOURCE');
 if(c.terms?.oracle_version!=='native-sampled-v1'||c.terms.oracle_account_id!==c.resolver.account_id)fail('SAMPLER_TERMS');
 return c;
}
export function sampleState(c,now_ns,paused=false){
 const now=uint(now_ns,64),start=uint(c.config.observation_window.start_ns,64),end=uint(c.config.maturity_ns,64),width=(end-start)/3n;
 if(end<=start||(end-start)%3n||width<30n*S||width>3600n*S||c.samples.length!==3)fail('SAMPLER_WINDOW');
 if(c.price!==null)return {state:'FINALIZED'};
 if(paused)return {state:'PAUSED'};
 if(now<start)return {state:'WAIT_WINDOW'};
 const missing=c.samples.findIndex(s=>s===null);
 if(missing>=0&&now>=start+BigInt(missing+1)*width)return {state:'DELAYED_MISSING_SAMPLE',slot:missing};
 if(now>=end)return {state:now<end+60n*S?'WAIT_REVIEW':'FINALIZE'};
 const slot=Number((now-start)/width),slotStart=start+BigInt(slot)*width,slotEnd=slotStart+width;
 if(c.samples[slot]!==null)return {state:'WAIT_NEXT_SLOT',slot};
 if(now-slotStart<3n*S||slotEnd-now<=15n*S)return {state:'WAIT_SLOT_MARGIN',slot};
 if(c.pending)return {state:'WAIT_CALLBACK',slot};
 return {state:'COLLECT',slot,start:String(slotStart),end:String(slotEnd)};
}
export function freshReport(asset,c,step,now_ns){
 try{
  if(!Array.isArray(asset?.reports)||asset.reports.length>16)return false;
  const ids=new Set();for(const r of asset.reports){account(r.oracle_id);if(ids.has(r.oracle_id))return false;ids.add(r.oracle_id);}
  const r=asset.reports.find(r=>r.oracle_id===c.source.reporter);if(!r)return false;
  const stamp=uint(r.timestamp,64),now=uint(now_ns,64),price=BigInt(normalizePrice(r.price));
  return stamp>=BigInt(step.start)&&stamp<BigInt(step.end)&&stamp<=now&&now-stamp<=15n*S&&price>=BigInt(c.source.min_price)&&price<=BigInt(c.source.max_price);
 }catch{return false;}
}
// Read the stored report timestamp, never the response wrapper timestamp.
export function sourceCacheWait(asset,policy,reporter,nowNs){
 if(policy?.recency_duration_sec!==300)fail('SAMPLER_SOURCE_CACHE_POLICY');
 if(!Array.isArray(asset?.reports)||asset.reports.length>16)fail('SAMPLER_SOURCE_REPORT');
 const reports=asset.reports.filter(r=>r.oracle_id===reporter);
 if(reports.length>1)fail('SAMPLER_SOURCE_REPORT');
 if(!reports.length)return 0n;
 const stamp=uint(reports[0].timestamp,64),now=uint(nowNs,64);
 if(stamp>now)fail('SAMPLER_SOURCE_REPORT');
 const eligible=stamp+301n*S;
 return eligible>now?eligible-now:0n;
}
export class SampleCoordinator{
 constructor({profile,admin,signerKey}){this.profile=samplingProfile(profile);this.admin=admin;this.key=signerKey;this.running=false;}
 async tick(){
  if(this.running)fail('SAMPLER_BUSY');this.running=true;
  const lock=join(this.admin.journal.directory,'.native-sampler-running');let owned=false;
  try{
   await mkdir(this.admin.journal.directory,{recursive:true,mode:0o700});
   try{await mkdir(lock,{mode:0o700});owned=true;}catch(e){if(e.code==='EEXIST')fail('SAMPLER_BUSY_OR_INTERRUPTED');throw e;}
   await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}),{flag:'wx',mode:0o600});
   return await this.step();
  }finally{if(owned)await rm(lock,{recursive:true});this.running=false;}
 }
 async step(){
  const p=this.profile,a=this.admin,rpc=a.provider;
  
  const operations=[];
  const add=async(name,receiver,method,args,deposit='0',gas='100000000000000')=>{
   const intent=await a.prepare(`native:${p.terms.series_id}:${name}`,p.signer_id,receiver,[{type:'FunctionCall',method,args,deposit,gas}]);
   const record=await a.journal.get(intent.operation_id);operations.push({name,intent,record});
  };
  for(let i=0;i<3;i++){
   await add(`refresh:${i}`,p.source.account_id,'request_price_data',{asset_ids:['wrap.near']},DEPOSIT,'200000000000000');
   await add(`sample:${i}`,p.resolver.account_id,'sample',{series_id:p.terms.series_id});
  }
  await add('finalize',p.resolver.account_id,'finalize',{series_id:p.terms.series_id});
  await add('import',p.core.account_id,'request_resolution',{series_id:p.terms.series_id});
  // Resolve every prior attempt before authorizing a later operation, even if a
  // slot has expired. Unknown public execution never permits a new paid refresh.
  for(const op of operations){
   if(!op.record.attempted)continue;
   const result=op.record.result?.state==='SUCCEEDED'?op.record.result:await a.recover(op.intent);
   if(result.state!=='SUCCEEDED')return {state:'HALTED_TRANSACTION',operation:op.name,result};
   op.record.result=result;
  }
  // Independent identity/head reads share one round trip; all state reads below
  // remain pinned to the same actual finalized block.
  const [status,block]=await Promise.all([rpc.sendJsonRpc('status',{}),rpc.sendJsonRpc('block',{finality:'final'}),a.verify()]);
  if(status.chain_id!==p.chain_id||status.genesis_hash!==p.genesis_hash)fail('SAMPLER_CHAIN');
  const hash=block.header.hash,now=block.header.timestamp_nanosec;
  const query=async params=>{const r=await rpc.sendJsonRpc('query',{...params,block_id:hash});if(r.block_hash!==hash||r.error)fail('SAMPLER_VIEW');return r;};
  
  const view=async(id,method,args={})=>{
   const r=await query({request_type:'call_function',account_id:id,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
   if(!Array.isArray(r.result)||r.result.length>100000)fail('SAMPLER_VIEW');return JSON.parse(Buffer.from(r.result).toString());
  };
  const [snapshot,asset,cachePolicy]=await Promise.all([
   view(p.resolver.account_id,'get_snapshot'),
   view(p.source.account_id,'get_asset',{asset_id:'wrap.near'}),
   p.network==='testnet'?view(p.source.account_id,'get_price_data',{asset_ids:['wrap.near']}):null,
   ...[p.source,p.resolver,p.core].map(async x=>{const r=await query({request_type:'view_account',account_id:x.account_id});if(r.code_hash!==x.code_hash)fail('SAMPLER_CODE');})
  ]),c=snapshot.cases?.[p.terms.series_id];
  if(snapshot.network!==p.network||snapshot.contract_id!==p.resolver.account_id||snapshot.version!=='native-sampled-v1'||!c||canonical(c.config)!==canonical(p.terms)||c.source.account!==p.source.account_id||c.source.asset!=='wrap.near')fail('SAMPLER_BINDING');
  const state=sampleState(c,now,snapshot.paused);
  const send=async(name,sampleAsset=asset,verifiedHead=null)=>{
   const op=operations.find(x=>x.name===name);
   if(op.record.attempted)return {state:'WAIT_OBSERVED_STATE',operation:name};
   if(name.startsWith('refresh:')||name.startsWith('sample:')){
    const latest=verifiedHead??await rpc.sendJsonRpc('block',{finality:'final'}),next=sampleState(c,latest.header.timestamp_nanosec,snapshot.paused);
    if(next.state!=='COLLECT'||next.slot!==state.slot)return {state:'WAIT_RECHECK_WINDOW'};
    // Recheck the source's actual ingestion timestamp against the latest head.
    // An old checkpoint alone is not stale data; a report older than the
    // unchanged 15-second preflight allowance must never be submitted.
    if(name.startsWith('sample:')&&!freshReport(sampleAsset,c,next,latest.header.timestamp_nanosec))return {state:'WAIT_RECHECK_SOURCE'};
   }
   // AdminTransactions binds a locally derived hash before its sole broadcast.
   const result=await a.send(op.intent,this.key);
   const confirmed={state:'TRANSACTION_CONFIRMED',operation:name,result};
   if(name.startsWith('refresh:')&&p.network==='testnet'&&a.evidence?.has(op.intent.operation_id)){
    // Avoid another full polling round after the refresh. The existing source
    // proof verifies the callback code, timestamp, asset state and receipt tree.
    let checked;try{checked=await refreshReportProof(a.evidence.get(op.intent.operation_id),p,rpc,status);}catch{return {...confirmed,followup:'REFRESH_PROOF_UNAVAILABLE'};}
    const next=sampleState(c,checked.head.header.timestamp_nanosec,snapshot.paused);
    if(next.state==='COLLECT'&&next.slot===state.slot&&freshReport(checked.asset,c,next,checked.head.header.timestamp_nanosec)){
     return {...confirmed,followup:await send(`sample:${next.slot}`,checked.asset,checked.head)};
    }
    return {...confirmed,followup:'REFRESH_NOT_FRESH_FOR_SAMPLE'};
   }
   return confirmed;
  };
  if(state.state==='FINALIZED'){
   const core=await view(p.core.account_id,'get_series',{series_id:p.terms.series_id});
   if(canonical(core.config)!==canonical(p.terms))fail('SAMPLER_BINDING');
   if(core.final_price!==null){if(core.final_price!==c.price)fail('SAMPLER_IMPORT_MISMATCH');return {state:'COMPLETE',price:c.price,block_hash:hash};}
   return send('import');
  }
  if(state.state==='FINALIZE')return send('finalize');
  if(state.state!=='COLLECT'){
   let wake;
   if(state.state==='WAIT_WINDOW')wake=BigInt(c.config.observation_window.start_ns)+3n*S;
   if(state.state==='WAIT_NEXT_SLOT')wake=BigInt(c.config.observation_window.start_ns)+BigInt(state.slot+1)*(BigInt(c.config.maturity_ns)-BigInt(c.config.observation_window.start_ns))/3n+3n*S;
   if(state.state==='WAIT_REVIEW')wake=BigInt(c.config.maturity_ns)+60n*S;
   return {...state,block_hash:hash,...(wake?{next_poll_ms:Math.min(30000,Math.max(1000,Number((wake-BigInt(now))/1000000n)))}:{})};
  }
  const cacheWait=p.network==='testnet'?sourceCacheWait(asset,cachePolicy,c.source.reporter,now):0n;
  if(freshReport(asset,c,state,now))return send(`sample:${state.slot}`);
  const refresh=operations.find(x=>x.name===`refresh:${state.slot}`);
  if(refresh.record.attempted)return {state:'WAIT_FRESH_SOURCE',slot:state.slot,block_hash:hash};
  if(cacheWait>0n)return {state:'WAIT_SOURCE_CACHE',slot:state.slot,block_hash:hash,cache_remaining_ns:String(cacheWait),next_poll_ms:Math.min(30000,Math.max(1000,Number(cacheWait/1000000n)))};
  return send(`refresh:${state.slot}`);
 }
}
