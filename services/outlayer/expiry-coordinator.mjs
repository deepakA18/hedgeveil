// One paid historical request per series/journal. No timer-based resend, refund,
// fixture fallback or signing-key discovery. A provisioned operator supplies keys.
import {canonical,account,fail,uint} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';
import {mkdir,writeFile,rm,readdir} from 'node:fs/promises';
import {terminal} from '../../packages/sdk/journal.mjs';
import {join} from 'node:path';
export const EXPIRY_VERSION='native-trade-twap-v1';
export const EXPIRY_WORKER='86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43';
export function expiryProfile(input){
 const p=structuredClone(input);
 if(p.deployment_hold||!['sandbox','testnet'].includes(p.network)||p.chain_id==null||p.network==='testnet'&&p.chain_id!=='testnet')fail('EXPIRY_PROFILE');
 if(p.network==='sandbox'&&['mainnet','testnet'].includes(p.chain_id))fail('EXPIRY_PROFILE');
 hash32(p.genesis_hash);account(p.signer_id);
 for(const c of [p.core,p.resolver,p.source]){account(c.account_id);hash32(c.code_hash);}
 if(new Set([p.core.account_id,p.resolver.account_id,p.source.account_id]).size!==3)fail('EXPIRY_PROFILE');
 if(p.network==='testnet'&&(p.source.account_id!=='outlayer.testnet'||p.genesis_hash!=='FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b'))fail('EXPIRY_SOURCE');
 const c=p.terms;
 if(c?.oracle_version!==EXPIRY_VERSION||c.oracle_account_id!==p.resolver.account_id||c.price_scale!=='1000000000000'||c.payoff_kind!=='CAPPED_USD_COMPLEMENT')fail('EXPIRY_TERMS');
 const end=uint(c.maturity_ns,64),start=uint(c.observation_window.start_ns,64);
 if(end-start!==1800000000000n||c.observation_window.end_ns!==c.maturity_ns||uint(c.mint_cutoff_ns,64)>start)fail('EXPIRY_TERMS');
 return p;
}
export class ExpiryCoordinator{
 constructor({profile,admin,signerKey}){this.profile=expiryProfile(profile);this.admin=admin;this.key=signerKey;this.running=false;}
 async tick(){
  if(this.running)fail('EXPIRY_BUSY');this.running=true;
  const lock=join(this.admin.journal.directory,'.expiry-coordinator-running');let owned=false;
  try{
   await mkdir(this.admin.journal.directory,{recursive:true,mode:0o700});
   try{await mkdir(lock,{mode:0o700});owned=true;}catch(e){if(e.code==='EEXIST')fail('EXPIRY_BUSY_OR_INTERRUPTED');throw e;}
   await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}),{flag:'wx',mode:0o600});
   for(const id of (await readdir(this.admin.journal.directory)).filter(x=>/^[a-f0-9]{64}$/.test(x))){
    const r=await this.admin.journal.get(id);
    if(r.intent.signer_id===this.profile.signer_id&&r.attempted&&!terminal(r.result?.state)){
     const result=await this.admin.recover(r.intent);
     if(!terminal(result.state))return {state:'HALTED_SIGNER',result};
    }
   }
   return await this.step();
  }finally{if(owned)await rm(lock,{recursive:true});this.running=false;}
 }
 async step(){
  const p=this.profile,a=this.admin,rpc=a.provider,id=p.terms.series_id,ops={};
  for(const [name,receiver,method,gas,deposit] of [
   ['request',p.resolver.account_id,'request','290000000000000','20000000000000000000000'],
   ['finalize',p.resolver.account_id,'finalize','250000000000000','0'],
   ['import',p.core.account_id,'request_resolution','250000000000000','0']
  ]){
   const intent=await a.prepare(`expiry:${id}:${name}`,p.signer_id,receiver,[{type:'FunctionCall',method,args:{series_id:id},gas,deposit}]);
   const record=await a.journal.get(intent.operation_id);ops[name]={intent,record};
   if(record.attempted){const result=await a.recover(intent);if(result.state!=='SUCCEEDED')return {state:'HALTED_TRANSACTION',operation:name,result};}
  }
  const [status,block]=await Promise.all([rpc.sendJsonRpc('status',{}),rpc.sendJsonRpc('block',{finality:'final'}),a.verify()]);
  if(status.chain_id!==p.chain_id||status.genesis_hash!==p.genesis_hash)fail('EXPIRY_CHAIN');
  const hash=block.header.hash,now=uint(block.header.timestamp_nanosec,64);
  const query=async params=>{const r=await rpc.sendJsonRpc('query',{...params,block_id:hash});if(r.block_hash!==hash||r.error)fail('EXPIRY_VIEW');return r;};
  const view=async(id,method,args={})=>{const r=await query({request_type:'call_function',account_id:id,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});if(!Array.isArray(r.result)||r.result.length>150000)fail('EXPIRY_VIEW');return JSON.parse(Buffer.from(r.result).toString());};
  const [state,c,core,sourceHash,policyHash]=await Promise.all([
   view(p.resolver.account_id,'get_snapshot'),view(p.resolver.account_id,'get_case',{series_id:id}),view(p.core.account_id,'get_series',{series_id:id}),view(p.resolver.account_id,'source_hash'),view(p.resolver.account_id,'policy_hash'),
   ...[p.source,p.resolver,p.core].map(async x=>{const r=await query({request_type:'view_account',account_id:x.account_id});if(r.code_hash!==x.code_hash)fail('EXPIRY_CODE');})
  ]);
  if(state.network!==p.network||state.contract_id!==p.resolver.account_id||state.source!==p.source.account_id||state.version!==EXPIRY_VERSION||state.worker_sha256!==EXPIRY_WORKER||canonical(c.config)!==canonical(p.terms)||canonical(core.config)!==canonical(p.terms)||sourceHash!==p.terms.oracle_config_hash||policyHash!==p.terms.finalization_policy_hash||policyHash!==p.terms.index_definition_hash)fail('EXPIRY_BINDING');
  const send=async name=>{
   if(ops[name].record.attempted)return {state:'WAIT_OBSERVED_STATE',operation:name,block_hash:hash};
   return {state:'TRANSACTION_CONFIRMED',operation:name,result:await a.send(ops[name].intent,this.key),block_hash:hash};
  };
  if(c.price!==null){
   if(c.price!==c.accepted?.price||c.pending!==null)fail('EXPIRY_FINAL_PRICE');
   if(core.final_price!==null){if(core.final_price!==c.price)fail('EXPIRY_IMPORT_MISMATCH');return {state:'COMPLETE',price:c.price,evidence_sha256:c.accepted.evidence_sha256,response_sha256:c.accepted.response_sha256,block_hash:hash};}
   return send('import');
  }
  if(core.final_price!==null)fail('EXPIRY_IMPORT_MISMATCH');
  if(state.paused)return {state:'PAUSED',block_hash:hash};
  if(now<uint(p.terms.maturity_ns,64))return {state:'WAIT_EXPIRY',block_hash:hash};
  if(c.pending!==null)return {state:'WAIT_CALLBACK',request_id:c.pending,block_hash:hash};
  if(c.accepted!==null)return send('finalize');
  if(c.last_result==='REJECTED'||ops.request.record.attempted)return {state:'EVIDENCE_REJECTED_REVIEW_REQUIRED',block_hash:hash};
  if(c.last_result!=='NOT_REQUESTED')fail('EXPIRY_CASE');
  return send('request');
 }
}
