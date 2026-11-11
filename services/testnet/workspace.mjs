import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {KeyPair,JsonRpcProvider} from './near.mjs';
import {privateDirectory,privateRead,durableWrite} from '../demo/storage.mjs';
import {account,fail} from '../../packages/sdk/intent.mjs';
import {base58,hash32} from '../../packages/sdk/rpc.mjs';
export const Q=10n**24n;
export function assertDeploymentEnabled(plan){if(plan.deployment_hold)fail('DEPLOYMENT_ON_HOLD');}
export const workspaceRoot=resolve('.local/testnet');
export function workspacePath(name='open'){if(!/^[a-z][a-z0-9-]{0,31}$/.test(name))fail('WORKSPACE_NAME');return join(workspaceRoot,name);}
export async function loadWorkspace(name){const directory=workspacePath(name);await privateDirectory(directory);const plan=await privateRead(join(directory,'plan.json'));if(plan.version!==1||plan.network!=='testnet')fail('WORKSPACE_PROFILE');return {directory,plan};}
export function providerFor(plan){
    const u=new URL(plan.rpc_url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')fail('TESTNET_HTTPS_REQUIRED');
    // The provider's default retries also repeat send_tx after HTTP errors.
    // Administrative writes get exactly one transport attempt; recovery is read-only.
    return new JsonRpcProvider({url:plan.rpc_url},{retries:1});
}
export async function verifyChain(provider,plan){const s=await provider.sendJsonRpc('status',{});if(s.chain_id!=='testnet'||s.genesis_hash!==plan.genesis_hash)fail('RPC_IDENTITY');return s;}
export async function requireNewAccount(provider,id){
    try{await provider.sendJsonRpc('query',{request_type:'view_account',account_id:id,finality:'final'});}
    catch(e){if(e.name==='AccountDoesNotExistError')return;throw e;}
    fail('DEMO_ACCOUNT_ALREADY_EXISTS');
}
export async function prepareWorkspace({name='open',owner='0xdeepak18.testnet',rpc_url='https://archival-rpc.testnet.near.org/'}={}){
    account(owner);if(!owner.endsWith('.testnet'))fail('TESTNET_OWNER_REQUIRED');
    const root=`hv-${name}.${owner}`;account(root);
    const provider=providerFor({rpc_url});const status=await provider.sendJsonRpc('status',{});
    if(status.chain_id!=='testnet')fail('RPC_IDENTITY');hash32(status.genesis_hash);
    await requireNewAccount(provider,root);
    const artifacts={};
    const manifest=JSON.parse(await readFile('target/oracle-artifacts/manifest.json'));
    for(const file of ['clearinghouse.wasm','settlement-oracle.wasm']){
        const data=await readFile('target/oracle-artifacts/'+file),sha256=createHash('sha256').update(data).digest('hex');
        if(manifest[file].sha256!==sha256)fail('ARTIFACT_HASH_MISMATCH');
        artifacts[file]={sha256,code_hash:base58(createHash('sha256').update(data).digest()),bytes:data.length};
    }
    await mkdir(workspaceRoot,{recursive:true,mode:0o700});await privateDirectory(workspaceRoot);
    const directory=workspacePath(name);await privateDirectory(directory,{create:true});
    const keys={},accounts=[];
    const add=(role,id,balance)=>{const k=KeyPair.fromRandom('ed25519');keys[id]=k.toString();accounts.push({role,id,public_key:k.getPublicKey().toString(),initial_balance:String(balance)});};
    add('administrator',root,80n*Q);add('core',`core.${root}`,30n*Q);add('oracle',`oracle.${root}`,30n*Q);
    add('maker',`maker-a.${root}`,6n*Q);add('maker',`maker-b.${root}`,6n*Q);
    add('arbitrator',`judge.${root}`,Q/2n);
    for(let i=0;i<6;i++)add('publisher',`publisher-${i}.${root}`,Q/2n);
    await mkdir(join(directory,'makers'),{mode:0o700});
    for(const a of accounts.filter(a=>a.role==='maker')){
        const k=generateKeyPairSync('ed25519');a.rfq_public_key=k.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
        await durableWrite(join(directory,'makers',a.id+'.json'),{version:1,private_key:k.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),epoch:null,issued:[],had_quotes:false,retired:false});
    }
    const plan={version:1,kind:'hedgeveil-options-testnet',network:'testnet',deployment_hold:'OUTLAYER_FEASIBILITY_AND_BUDGET_REVIEW',owner,root_id:root,rpc_url,genesis_hash:status.genesis_hash,accounts,artifacts,
        funding_amount:String(80n*Q),vault_enabled:false,oracle_label:'DEMO ORACLE — SYNTHETIC PRICES',created_at:new Date().toISOString()};
    await durableWrite(join(directory,'signers.json'),{version:1,keys});
    await durableWrite(join(directory,'postgres.json'),{version:1,password:randomUUID()});
    await durableWrite(join(directory,'plan.json'),plan);
    await mkdir('deploy/testnet',{recursive:true});
    // Public review artifact: never contains key material or database credentials.
    await writeFile(`deploy/testnet/${name}-plan.json`,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
    return {directory,plan};
}
