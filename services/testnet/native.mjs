import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {KeyPair} from './near.mjs';
import {privateDirectory,privateRead,durableWrite} from '../demo/storage.mjs';
import {workspaceRoot,workspacePath,providerFor,verifyChain,requireNewAccount,assertDeploymentEnabled,Q} from './workspace.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {account,fail} from '../../packages/sdk/intent.mjs';
import {adminFor,retained,functionCall} from './deploy.mjs';
import {verifyRefreshProof} from '../outlayer/refresh-proof.mjs';
import {ACCEPTED_POLICY} from '../outlayer/sampler.mjs';
import {implicitAccount,transferFunding} from './funding.mjs';
import {CoinbaseMarket} from '../market-data/coinbase.mjs';
const FILES={core:'target/core-artifacts/clearinghouse.wasm',external_oracle:'target/external-oracle-artifacts/external_settlement.wasm'};
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function prepareNativeWorkspace({name='native',owner='0xdeepak18.testnet',rpc_url='https://test.rpc.fastnear.com/'}={}){
 account(owner);if(!owner.endsWith('.testnet'))fail('TESTNET_OWNER_REQUIRED');
 const fundingKey=KeyPair.fromRandom('ed25519'),fundingId=implicitAccount(fundingKey.getPublicKey().toString());
 const root=fundingId;account(root);const directory=workspacePath(name),p=providerFor({rpc_url});
 const pins=JSON.parse(await readFile('deploy/testnet/outlayer-observation-pins.json')).testnet;
 const proofBytes=await readFile('research/reports/outlayer-wallet-refresh-verification.json'),proof=verifyRefreshProof(JSON.parse(proofBytes),pins,owner);
 await verifyChain(p,{genesis_hash:proof.genesis_hash});await requireNewAccount(p,root);
 const actual=await p.sendJsonRpc('query',{request_type:'view_account',account_id:proof.source_account,finality:'final'});if(actual.code_hash!==proof.source_code_hash)fail('SOURCE_CODE_CHANGED');
 const artifacts={};for(const [kind,file]of Object.entries(FILES)){const b=await readFile(file);artifacts[kind]={path:file,sha256:sha(b),code_hash:base58(createHash('sha256').update(b).digest()),bytes:b.length};}
 await mkdir(workspaceRoot,{recursive:true,mode:0o700});await privateDirectory(workspaceRoot);await privateDirectory(directory,{create:true});await mkdir(join(directory,'makers'),{mode:0o700});
 const keys={},accounts=[];for(const [role,near]of [['administrator',48n],['core',30n],['oracle',8n],['maker',45n],['maker',45n]]){
  const k=role==='administrator'?fundingKey:KeyPair.fromRandom('ed25519'),id=implicitAccount(k.getPublicKey().toString());if(id!==root)await requireNewAccount(p,id);keys[id]=k.toString();const a={role,id,public_key:k.getPublicKey().toString(),initial_balance:String(role==='maker'?near*Q/10n:near*Q)};
  if(role==='maker'){const r=generateKeyPairSync('ed25519');a.rfq_public_key=r.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');await durableWrite(join(directory,'makers',id+'.json'),{version:1,private_key:r.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),epoch:null,issued:[],had_quotes:false,retired:false});}accounts.push(a);
 }
 const plan={version:1,kind:'hedgeveil-native-testnet',network:'testnet',owner,root_id:root,rpc_url,genesis_hash:proof.genesis_hash,oracle_version:'native-sampled-v1',policy_acceptance:ACCEPTED_POLICY,source:{account_id:proof.source_account,reporter:proof.reporter,code_hash:proof.source_code_hash},source_verification:{...proof,evidence_sha256:sha(proofBytes)},accounts,artifacts,funding:{mode:'implicit-transfer-v1',receiver_id:fundingId,public_key:fundingKey.getPublicKey().toString()},funding_amount:String(48n*Q),owner_minimum:String(49n*Q),vault_enabled:false,oracle_label:'EXTERNAL ORACLE · THREE ON-CHAIN SAMPLES',created_at:new Date().toISOString()};
 plan.indexer_rpc_urls=rpc_url==='https://test.rpc.fastnear.com/'?[rpc_url,'https://testnet-rpc.intea.rs/']:[rpc_url];
 plan.indexer_request_interval_ms=500;plan.indexer_read_concurrency=4;
 plan.indexer_transaction_filter='canonical-journal';plan.indexer_schema='hv_testnet_native_canonical';
 transferFunding(plan);
 await durableWrite(join(directory,'signers.json'),{version:1,keys});await durableWrite(join(directory,'postgres.json'),{version:1,password:randomUUID()});await durableWrite(join(directory,'plan.json'),plan);await writeFile(`deploy/testnet/${name}-plan.json`,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});return {directory,plan};
}
export async function deployNative(workspace,{admin,publish,market=new CoinbaseMarket(),seriesId,leadSeconds=600,slotSeconds=360}={}){
 const {directory,plan}=workspace;assertDeploymentEnabled(plan);
 if(seriesId===undefined){try{seriesId=(await privateRead(join(directory,'deployment.json'))).series.series_id;}catch(e){if(e.code!=='ENOENT')throw e;seriesId='alpha';}}
 if(!['alpha','beta','gamma','delta','epsilon','zeta','eta'].includes(seriesId))fail('DEMO_SERIES_LIMIT');
 if(!Number.isSafeInteger(leadSeconds)||leadSeconds<180||leadSeconds>3600)fail('SERIES_LEAD_TIME');
 if(!Number.isSafeInteger(slotSeconds)||slotSeconds<360||slotSeconds>3600)fail('SERIES_SLOT_TIME');
 if(plan.kind!=='hedgeveil-native-testnet'||plan.oracle_version!=='native-sampled-v1'||plan.policy_acceptance!==ACCEPTED_POLICY||!['testnet','sandbox'].includes(plan.network))fail('NATIVE_DEPLOYMENT_REQUIRED');
 if(plan.network==='testnet'){
  const b=await readFile('research/reports/outlayer-wallet-refresh-verification.json'),pins=JSON.parse(await readFile('deploy/testnet/outlayer-observation-pins.json')).testnet,proof=verifyRefreshProof(JSON.parse(b),pins,plan.owner);
  if(sha(b)!==plan.source_verification?.evidence_sha256||proof.source_code_hash!==plan.source.code_hash||proof.source_account!==plan.source.account_id||proof.reporter!==plan.source.reporter||proof.genesis_hash!==plan.genesis_hash)fail('SOURCE_PROOF_MISMATCH');
 }
 admin??=adminFor(directory,plan);const rpc=admin.provider;await admin.verify();
 const status=await rpc.sendJsonRpc('status',{});if(status.genesis_hash!==plan.genesis_hash||(plan.network==='testnet'&&status.chain_id!=='testnet'))fail('RPC_IDENTITY');
 for(const [kind,path]of Object.entries(FILES)){const a=plan.artifacts[kind];if(a?.path!==path)fail('ARTIFACT_PATH');const b=await readFile(path);if(sha(b)!==a.sha256||base58(createHash('sha256').update(b).digest())!==a.code_hash)fail('ARTIFACT_HASH_MISMATCH');}
 const source=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:plan.source.account_id,finality:'final'});if(source.code_hash!==plan.source.code_hash)fail('SOURCE_CODE_CHANGED');
 const root=plan.accounts.find(a=>a.role==='administrator'),core=plan.accounts.find(a=>a.role==='core').id,oracle=plan.accounts.find(a=>a.role==='oracle').id,makers=plan.accounts.filter(a=>a.role==='maker');
 const funding=plan.funding?transferFunding(plan):{label:'fund-demo-root',receiver_id:root.id,actions:[{type:'CreateAccount'},{type:'Transfer',deposit:plan.funding_amount},{type:'AddKey',public_key:root.public_key}]};
 const fund=await admin.prepare(funding.label,plan.owner,funding.receiver_id,funding.actions);if((await admin.recover(fund)).state!=='SUCCEEDED')fail('BOOTSTRAP_NOT_CONFIRMED');
 const {keys}=await privateRead(join(directory,'signers.json'));
 const send=async(label,signer,receiver,actions)=>admin.send(await admin.prepare(label,signer,receiver,actions),keys[signer]);
 const anchor=await retained(join(directory,'anchor.json'),()=>rpc.sendJsonRpc('block',{finality:'final'}));
 for(const a of plan.accounts.filter(a=>a.id!==root.id))await send('create-'+a.id,root.id,a.id,plan.funding?[{type:'Transfer',deposit:a.initial_balance}]:[{type:'CreateAccount'},{type:'Transfer',deposit:a.initial_balance},{type:'AddKey',public_key:a.public_key}]);
 const costs=await retained(join(directory,'storage-costs.json'),async()=>({byte_cost:(await rpc.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte})),contracts=[];
 for(const [kind,id,args]of [['external_oracle',oracle,{network:plan.network,registrar:root.id,guardian:root.id}],['core',core,{network:plan.network,guardian:root.id,oracle,oracle_version:'native-sampled-v1',storage_byte_cost:costs.byte_cost}]]){
  const artifact=plan.artifacts[kind];if(artifact.path!==FILES[kind])fail('ARTIFACT_PATH');const b=await readFile(artifact.path);if(sha(b)!==artifact.sha256)fail('ARTIFACT_HASH_MISMATCH');
  await send('deploy-'+kind,id,id,[{type:'DeployContract',code:b.toString('base64')},functionCall('new',args)]);
  const actual=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:id,finality:'final'});if(actual.code_hash!==artifact.code_hash)fail('DEPLOYMENT_MISMATCH');contracts.push({kind,account_id:id,code_hash:actual.code_hash});
 }
 const view=(id,method,args={})=>rpc.callFunction({contractId:id,method,args,blockQuery:{finality:'final'}}),sq=await view(core,'storage_quote');
 for(const id of [root.id,...makers.map(a=>a.id)])await send('register-'+id,id,core,[functionCall('storage_deposit',{},sq.account_minimum)]);
 for(const a of makers)await send('collateral-'+a.id,a.id,core,[functionCall('deposit_collateral',{},String(4n*Q))]);
 const operating=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:root.id,finality:'final'});
 if(BigInt(operating.amount)<Q/2n)fail('SERVICE_OPERATING_BUDGET_LOW');
 const material=await retained(join(directory,seriesId==='alpha'?'native-series.json':`native-series-${seriesId}.json`),async()=>{
  const observation=await market.snapshot(String(BigInt(Date.now())*1000000n)),start=BigInt((await rpc.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec)+BigInt(leadSeconds)*1_000_000_000n,end=start+3n*BigInt(slotSeconds)*1_000_000_000n;
  const source={account:plan.source.account_id,reporter:plan.source.reporter,asset:'wrap.near',min_price:'10000000000',max_price:'1000000000000000'};
  const config={series_id:seriesId,version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:sha('Hedgeveil native-sampled-v1 NEAR/USD ingestion-time average'),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:observation.spot,price_scale:'1000000000000',maturity_ns:String(end),mint_cutoff_ns:String(start),observation_window:{start_ns:String(start),end_ns:String(end)},oracle_account_id:oracle,oracle_version:'native-sampled-v1',oracle_config_hash:await view(oracle,'source_hash',{source}),finalization_policy_hash:await view(oracle,'policy_hash'),max_supply:String(100n*Q)};
  return {config,source,pricing_observation:observation};
 });
 await send('oracle-series-'+seriesId,root.id,oracle,[functionCall('register_series',{config:material.config,source:material.source},String(Q/10n))]);
 await send('core-series-'+seriesId,root.id,core,[functionCall('create_series',{config:material.config},String(BigInt(sq.series_storage)+BigInt(sq.creation_fee)))]);
 for(const a of makers){await send('inventory-'+seriesId+'-'+a.id,a.id,core,[functionCall('split',{series_id:seriesId,amount:String(2n*Q)},'1')]);await send('rfq-key-'+a.id,a.id,core,[functionCall('register_signing_key',{key_id:'demo-key',public_key:a.rfq_public_key},String(4096n*BigInt(costs.byte_cost)+1n))]);}
 const client={network:plan.network,chain_id:status.chain_id,genesis_hash:plan.genesis_hash,rpc_url:plan.rpc_url,contract_id:core,code_hash:contracts.find(c=>c.kind==='core').code_hash};
 const d={version:1,network:plan.network,client,indexer:{network:plan.network,chain_id:status.chain_id,genesis_hash:plan.genesis_hash,anchor_hash:anchor.header.hash,rpc_urls:plan.indexer_rpc_urls??[plan.rpc_url],...(plan.indexer_header_source?{header_source:plan.indexer_header_source}:{}),...(plan.indexer_discovery_source?{discovery_source:plan.indexer_discovery_source,discovery_required:plan.indexer_discovery_required!==false}:{}),request_interval_ms:plan.indexer_request_interval_ms??(plan.network==='testnet'?250:0),read_concurrency:plan.indexer_read_concurrency??4,contracts,schema:plan.indexer_schema??'hv_testnet_native_roots',transaction_filter:plan.indexer_transaction_filter??'watched-roots',max_blocks:10000,stale_after_ms:60000,poll_ms:2000},source:plan.source,series:material.config,pricing_observation:material.pricing_observation,accounts:plan.accounts,oracle_label:plan.oracle_label,vault_enabled:false,artifacts:plan.artifacts};
 await durableWrite(join(directory,'deployment.json'),d);if(publish)await publish(d);else if(plan.network==='testnet')await writeFile(`deploy/testnet/${root.id}-deployment.json`,JSON.stringify(d,null,2)+'\n');return d;
}
