import {join} from 'node:path';
import {assertDeploymentEnabled} from './workspace.mjs';
import {adminFor} from './deploy.mjs';
import {privateRead,durableWrite} from '../demo/storage.mjs';
import {SampleCoordinator,ACCEPTED_POLICY} from '../outlayer/sampler.mjs';
import {fail} from '../../packages/sdk/intent.mjs';

// A fresh deployment record must carry its source pin and immutable series.
// Historical synthetic deployments cannot be repurposed by this command.
export async function sampleNative(workspace,{admin}={}){
 const {directory,plan}=workspace;assertDeploymentEnabled(plan);
 if(plan.oracle_version!=='native-sampled-v1'||plan.policy_acceptance!==ACCEPTED_POLICY)fail('NATIVE_DEPLOYMENT_REQUIRED');
 const d=await privateRead(join(directory,'deployment.json'));
 if(d.client?.network!=='testnet'||d.client.genesis_hash!==plan.genesis_hash||!d.source||!d.series)fail('NATIVE_DEPLOYMENT_REQUIRED');
 const core=d.indexer.contracts.find(x=>x.kind==='core'),resolver=d.indexer.contracts.find(x=>x.kind==='external_oracle');
 if(!core||!resolver||core.account_id!==d.client.contract_id||core.code_hash!==d.client.code_hash||resolver.account_id!==d.series.oracle_account_id)fail('NATIVE_DEPLOYMENT_REQUIRED');
 const profile={network:'testnet',chain_id:'testnet',genesis_hash:plan.genesis_hash,policy_acceptance:plan.policy_acceptance,signer_id:plan.root_id,source:d.source,core,resolver,terms:d.series};
 const {keys}=await privateRead(join(directory,'signers.json'));
 if(!keys[plan.root_id])fail('SERVICE_SIGNER_MISSING');
 return {...await new SampleCoordinator({profile,admin:admin??adminFor(directory,{...plan,rpc_url:plan.collector_rpc_url??plan.rpc_url}),signerKey:keys[plan.root_id]}).tick(),series_id:d.series.series_id};
}

export function startNativeSampling(workspace){
 let stopped=false,timer,running;
 const run=()=>{running=(async()=>{
  let result;try{result=await sampleNative(workspace);}catch(e){result={state:'SAMPLER_ERROR',code:/^[A-Z_]{1,80}$/.test(e.code??'')?e.code:'SAMPLER_UNAVAILABLE',error_class:/^[A-Za-z0-9_]{1,80}$/.test(e.name??'')?e.name:'Error'};}
  await durableWrite(join(workspace.directory,'sampler-status.json'),{...result,checked_at:new Date().toISOString()});
  const terminal=result.state==='COMPLETE'||result.state==='DELAYED_MISSING_SAMPLE'||result.result?.state==='FAILED_CONFIRMED';
  if(!stopped&&!terminal)timer=setTimeout(run,result.next_poll_ms??(result.state==='TRANSACTION_CONFIRMED'?0:result.state==='WAIT_FRESH_SOURCE'?1000:5000));
 })().catch(()=>{stopped=true;});};run();
 return {stop:async()=>{stopped=true;clearTimeout(timer);await running;}};
}
