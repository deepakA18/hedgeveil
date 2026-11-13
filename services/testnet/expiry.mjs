import {join} from 'node:path';
import {assertDeploymentEnabled} from './workspace.mjs';
import {adminFor} from './deploy.mjs';
import {privateRead,durableWrite} from '../demo/storage.mjs';
import {ExpiryCoordinator,EXPIRY_VERSION,expiryProfile} from '../outlayer/expiry-coordinator.mjs';
import {fail,canonical} from '../../packages/sdk/intent.mjs';
import {renewExpiry} from './renewal.mjs';

export const EXPIRY_KIND='hedgeveil-expiry-testnet';
export function deploymentProfiles(plan,d){
 assertDeploymentEnabled(plan);
 if(plan.kind!==EXPIRY_KIND||plan.oracle_version!==EXPIRY_VERSION||plan.network!=='testnet'||d.client?.network!=='testnet'||d.client.genesis_hash!==plan.genesis_hash||!Array.isArray(d.series)||!d.series.length||d.series.length>32)fail('EXPIRY_DEPLOYMENT_REQUIRED');
 const contracts=d.indexer?.contracts??[],cores=contracts.filter(c=>c.kind==='core'),resolvers=contracts.filter(c=>c.kind==='expiry_oracle');
 if(cores.length!==1||resolvers.length!==1||contracts.length!==2||cores[0].account_id!==d.client.contract_id||cores[0].code_hash!==d.client.code_hash||new Set(d.series.map(c=>c.series_id)).size!==d.series.length)fail('EXPIRY_DEPLOYMENT_REQUIRED');
 if(cores[0].account_id!==plan.accounts?.find(a=>a.role==='core')?.id||resolvers[0].account_id!==plan.accounts?.find(a=>a.role==='oracle')?.id||cores[0].code_hash!==plan.artifacts?.core?.code_hash||resolvers[0].code_hash!==plan.artifacts?.expiry_oracle?.code_hash||canonical(d.source)!==canonical(plan.source)||d.vault_enabled!==false)fail('EXPIRY_DEPLOYMENT_BINDING');
 return d.series.map(terms=>expiryProfile({network:'testnet',chain_id:'testnet',genesis_hash:plan.genesis_hash,signer_id:plan.root_id,source:d.source,core:cores[0],resolver:resolvers[0],terms}));
}

// Known failed evidence stays local to its series. An unknown transaction blocks
// this signer globally until read-only receipt recovery resolves its nonce.
export async function settleExpiry(workspace,{admin,run,now=Date.now}={}){
 const {directory,plan}=workspace;
 const profiles=deploymentProfiles(plan,await privateRead(join(directory,'deployment.json')));
 const {keys}=await privateRead(join(directory,'signers.json'));
 if(!keys[plan.root_id])fail('SERVICE_SIGNER_MISSING');
 admin??=adminFor(directory,{...plan,rpc_url:plan.collector_rpc_url??plan.rpc_url});
 run??=profile=>new ExpiryCoordinator({profile,admin,signerKey:keys[plan.root_id]}).tick();
 const items=[];
 for(const profile of profiles){
  // Wall time is only a wake-up hint. A fast clock still cannot submit early:
  // the coordinator checks finalized chain time before every paid request.
  // Future cohorts need no repeated source/core views while waiting overnight.
  if(BigInt(Math.floor(now()))*1000000n<BigInt(profile.terms.maturity_ns)){
   items.push({series_id:profile.terms.series_id,state:'WAIT_EXPIRY'});continue;
  }
  let result;
  try{result=await run(profile);}catch(e){result={state:'KEEPER_ERROR',code:/^[A-Z_]{1,80}$/.test(e.code??'')?e.code:'EXPIRY_UNAVAILABLE'};}
  items.push({series_id:profile.terms.series_id,...result});
  // An interrupted owner lock is global: do not attempt subsequent writes.
  if(result.code==='EXPIRY_BUSY_OR_INTERRUPTED'||result.state==='HALTED_SIGNER')break;
 }
 const status={version:1,checked_at:new Date().toISOString(),items};
 await durableWrite(join(directory,'expiry-status.json'),status);return status;
}

export function startExpirySettlement(workspace,{maintenance=async fn=>fn(),renew=renewExpiry,settle=settleExpiry,interval=5000,renewInterval=60000}={}){
 let stopped=false,timer,running,nextRenew=0,lastCompleted='';
 const poll=()=>{running=(async()=>{
  try{
   const status=await settle(workspace);
   const completed=status.items.filter(i=>i.state==='COMPLETE').map(i=>i.series_id).sort().join(',');
   const halted=status.items.some(i=>i.state==='HALTED_SIGNER'||i.code==='EXPIRY_BUSY_OR_INTERRUPTED');
   if(halted){
    // Renewal cannot write with unresolved signer/ownership evidence. Do not
    // interrupt unrelated live quotes merely to rediscover the same blocker.
    await durableWrite(join(workspace.directory,'renewal-status.json'),{version:1,state:'BLOCKED',checked_at:new Date().toISOString(),code:'RENEWAL_UNRESOLVED'});
   }else if(Date.now()>=nextRenew||completed!==lastCompleted){
    // A single scheduler serializes keeper and renewal ownership. Maker queues
    // are drained before inventory writes to avoid service-key nonce races.
    nextRenew=Date.now()+renewInterval;lastCompleted=completed;
    await maintenance(()=>renew(workspace));
   }
  }catch(e){await durableWrite(join(workspace.directory,'maintenance-error.json'),{version:1,checked_at:new Date().toISOString(),code:/^[A-Z_]{1,80}$/.test(e.code??e.message??'')?(e.code??e.message):'MAINTENANCE_UNAVAILABLE'});}
  if(!stopped)timer=setTimeout(poll,interval);
 })().catch(()=>{stopped=true;});};poll();
 return {stop:async()=>{stopped=true;clearTimeout(timer);await running;}};
}
