import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {AdminTransactions} from './transactions.mjs';
import {providerFor,verifyChain,assertDeploymentEnabled,Q} from './workspace.mjs';
import {privateRead,durableWrite} from '../demo/storage.mjs';
import {fail} from '../../packages/sdk/intent.mjs';
const GAS='250000000000000';
export const functionCall=(method,args={},deposit='0')=>({type:'FunctionCall',method,args,gas:GAS,deposit});
export function adminFor(directory,plan){const provider=providerFor(plan);return new AdminTransactions({provider,journal:join(directory,'admin-journal'),identity:{kind:'hedgeveil-testnet-setup-v1',network:'testnet',genesis_hash:plan.genesis_hash,root_id:plan.root_id},verify:()=>verifyChain(provider,plan)});}
export async function retained(file,create){try{return await privateRead(file);}catch(e){if(e.code!=='ENOENT')throw e;const value=await create();await durableWrite(file,value);return value;}}
export async function deploy({directory,plan},{admin=adminFor(directory,plan),publish=async d=>writeFile('deploy/testnet/'+plan.root_id+'-deployment.json',JSON.stringify(d,null,2)+'\n')}={}){
    assertDeploymentEnabled(plan);
    if(plan.kind==='hedgeveil-native-testnet')return (await import('./native.mjs')).deployNative({directory,plan},{admin,publish});
    const provider=admin.provider,root=plan.accounts.find(a=>a.role==='administrator');
    const funding=await admin.prepare('fund-demo-root',plan.owner,plan.root_id,[{type:'CreateAccount'},{type:'Transfer',deposit:plan.funding_amount},{type:'AddKey',public_key:root.public_key}]);
    if((await admin.recover(funding)).state!=='SUCCEEDED')fail('BOOTSTRAP_NOT_CONFIRMED');
    const {keys}=await privateRead(join(directory,'signers.json'));
    const send=async(label,signer,receiver,actions)=>admin.send(await admin.prepare(label,signer,receiver,actions),keys[signer]);
    const anchor=await retained(join(directory,'anchor.json'),()=>provider.sendJsonRpc('block',{finality:'final'}));
    for(const a of plan.accounts.filter(a=>a.id!==root.id))await send('create-'+a.id,root.id,a.id,[{type:'CreateAccount'},{type:'Transfer',deposit:a.initial_balance},{type:'AddKey',public_key:a.public_key}]);
    const core=plan.accounts.find(a=>a.role==='core').id,oracle=plan.accounts.find(a=>a.role==='oracle').id;
    const costs=await retained(join(directory,'storage-costs.json'),async()=>({byte_cost:(await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte}));
    const byteCost=BigInt(costs.byte_cost),storage=String(4096n*byteCost);
    const contracts=[];
    for(const [kind,id,file,args] of [
        ['oracle',oracle,'settlement-oracle.wasm',{network:'testnet',registrar:root.id,treasury:root.id,storage_byte_cost:costs.byte_cost}],
        ['core',core,'clearinghouse.wasm',{network:'testnet',guardian:root.id,oracle,oracle_version:'demo-v1',storage_byte_cost:costs.byte_cost}]
    ]){
        const data=await readFile('target/oracle-artifacts/'+file);if(createHash('sha256').update(data).digest('hex')!==plan.artifacts[file].sha256)fail('ARTIFACT_HASH_MISMATCH');
        await send('deploy-'+kind,id,id,[{type:'DeployContract',code:data.toString('base64')},functionCall('new',args)]);
        const actual=await provider.sendJsonRpc('query',{request_type:'view_account',account_id:id,finality:'final'});
        if(actual.code_hash!==plan.artifacts[file].code_hash)fail('DEPLOYMENT_MISMATCH');
        contracts.push({kind,account_id:id,code_hash:actual.code_hash});
    }
    const makers=plan.accounts.filter(a=>a.role==='maker');
    await send('register-'+root.id,root.id,core,[functionCall('storage_deposit',{},storage)]);
    for(const a of makers){await send('register-'+a.id,a.id,core,[functionCall('storage_deposit',{},storage)]);await send('collateral-'+a.id,a.id,core,[functionCall('deposit_collateral',{},String(4n*Q))]);}
    for(const id of [root.id,makers[0].id])await send('oracle-register-'+id,id,oracle,[functionCall('register_account',{},storage)]);
    const material=await retained(join(directory,'material.json'),async()=>{
        const now=BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
        const request={series_id:'alpha',oracle,start_ns:String(now+3600_000_000_000n),publishers:plan.accounts.filter(a=>a.role==='publisher').map(a=>a.id),arbitrator:plan.accounts.find(a=>a.role==='arbitrator').id};
        const file=join(directory,'synthetic-request.json');await durableWrite(file,request);
        return JSON.parse(execFileSync('python3',['services/observation-collector/collector.py','materialize','--request',file,'--archive',join(directory,'observations')],{encoding:'utf8'}));
    });
    await send('oracle-series-alpha',root.id,oracle,[functionCall('register_series',material.bundle.registration,String(32768n*byteCost))]);
    await send('core-series-alpha',root.id,core,[functionCall('create_series',{config:material.bundle.registration.config},String(4096n*byteCost+Q/1000n))]);
    for(const a of makers){
        await send('inventory-alpha-'+a.id,a.id,core,[functionCall('split',{series_id:'alpha',amount:String(2n*Q)},'1')]);
        await send('rfq-key-'+a.id,a.id,core,[functionCall('register_signing_key',{key_id:'demo-key',public_key:a.rfq_public_key},String(4096n*byteCost+1n))]);
    }
    const client={network:'testnet',chain_id:'testnet',genesis_hash:plan.genesis_hash,rpc_url:plan.rpc_url,contract_id:core,code_hash:contracts.find(x=>x.kind==='core').code_hash};
    const deployment={version:1,network:'testnet',client,indexer:{network:'testnet',chain_id:'testnet',genesis_hash:plan.genesis_hash,anchor_hash:anchor.header.hash,rpc_urls:[plan.rpc_url],contracts,schema:'hv_testnet_open',max_blocks:10000,stale_after_ms:60000,poll_ms:2000},accounts:plan.accounts,oracle_label:plan.oracle_label,vault_enabled:false,material,artifacts:plan.artifacts};
    await durableWrite(join(directory,'deployment.json'),deployment);
    await publish(deployment);
    return deployment;
}
export async function settle({directory,plan},{admin=adminFor(directory,plan)}={}){
    assertDeploymentEnabled(plan);
    if(plan.kind==='hedgeveil-native-testnet')return (await import('./sampling.mjs')).sampleNative({directory,plan},{admin});
    const deployment=await privateRead(join(directory,'deployment.json')),{keys}=await privateRead(join(directory,'signers.json'));
    const {material}=deployment,series=material.bundle.registration.config.series_id,oracle=plan.accounts.find(a=>a.role==='oracle').id;
    const now=BigInt((await admin.provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
    if(now<BigInt(material.bundle.registration.config.maturity_ns))fail('MATURITY_NOT_REACHED');
    const choice=await retained(join(directory,'settlement-choice.json'),async()=>{
        const policy=material.bundle.registration.policy;
        const primary=BigInt(material.bundle.registration.config.maturity_ns)+BigInt(policy.primary_ns);
        const fallback=primary+BigInt(policy.fallback_ns);
        // Leave time for publication and wallet-independent service receipts.
        // Terms and the retained route never change on resume.
        if(now>=fallback-120_000_000_000n)fail('SETTLEMENT_WINDOW_TOO_SHORT');
        if(now<primary&&now>=primary-120_000_000_000n)fail('WAIT_FOR_FALLBACK_WINDOW');
        return {route:now<primary?'PRIMARY':'FALLBACK'};
    });
    const call=async(label,id,receiver,method,args,deposit='0')=>admin.send(await admin.prepare(label,id,receiver,[functionCall(method,args,deposit)]),keys[id]);
    for(let n=0;n<6;n++)await call('publish-alpha-'+n,plan.accounts.filter(a=>a.role==='publisher')[n].id,oracle,'publish',{evidence:material.bundle.evidence[n]},'1');
    await call('propose-alpha',plan.root_id,oracle,'propose',{series_id:series,route:choice.route,...material.observations[choice.route]},material.bundle.registration.policy.proposal_bond);
    await call('challenge-alpha',plan.accounts.find(a=>a.role==='maker').id,oracle,'challenge',{series_id:series,...material.observations[choice.route==='PRIMARY'?'FALLBACK':'PRIMARY']},material.bundle.registration.policy.challenge_bond);
    await call('adjudicate-alpha',plan.accounts.find(a=>a.role==='arbitrator').id,oracle,'adjudicate',{series_id:series,route:'FALLBACK'},'1');
    await call('resolve-alpha',plan.root_id,deployment.client.contract_id,'request_resolution',{series_id:series});
    return {series_id:series,state:'RECEIPTS_CONFIRMED',label:plan.oracle_label};
}
