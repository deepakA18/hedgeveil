import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,generateKeyPairSync,randomUUID} from 'node:crypto';
import {KeyPair} from './near.mjs';
import {loadWorkspace,workspacePath,providerFor,verifyChain,requireNewAccount,Q,assertDeploymentEnabled} from './workspace.mjs';
import {privateRead,privateDirectory,durableWrite} from '../demo/storage.mjs';
import {adminFor,functionCall,retained} from './deploy.mjs';
import {implicitAccount,expiryFunding} from './funding.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {canonical,fail} from '../../packages/sdk/intent.mjs';
import {adminTerminal as terminal} from './admin-outcomes.mjs';
import {retainedSeries} from '../../packages/sdk/series.mjs';
import {CoinbaseMarket} from '../market-data/coinbase.mjs';
import {planLadder,LADDER_POLICY} from '../markets/ladder.mjs';
import {EXPIRY_VERSION} from '../outlayer/expiry-coordinator.mjs';
import {TWAP_MODEL,marketHead} from '../maker/valuation.mjs';
const KIND='hedgeveil-expiry-testnet',SOURCE={account_id:'outlayer.testnet',code_hash:'AsbxRWTQ2mQAazgz1bbAC72oZ1H8UKL33JKwZmG2pjn2'};
const FILES={core:'target/core-artifacts/clearinghouse.wasm',expiry_oracle:'target/expiry-oracle-artifacts/expiry_settlement.wasm'};
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function prepareExpiryWorkspace({name='expiry',previous='native-transfer'}={}){
 const old=await loadWorkspace(previous),plan=old.plan;
 if(plan.network!=='testnet'||plan.owner!=='0xdeepak18.testnet')fail('EXPIRY_SERVICE_SOURCE');
 const provider=providerFor(plan);await verifyChain(provider,plan);
 const rootKey=KeyPair.fromRandom('ed25519'),public_key=rootKey.getPublicKey().toString();
 const root={role:'administrator',id:implicitAccount(public_key),public_key,initial_balance:String(2n*Q)};
 await requireNewAccount(provider,root.id);
 const source=await provider.sendJsonRpc('query',{request_type:'view_account',account_id:SOURCE.account_id,finality:'final'});if(source.code_hash!==SOURCE.code_hash)fail('SOURCE_CODE_CHANGED');
 const artifacts={};for(const [kind,path]of Object.entries(FILES)){const b=await readFile(path);artifacts[kind]={path,sha256:sha(b),code_hash:base58(createHash('sha256').update(b).digest()),bytes:b.length};}
 const directory=workspacePath(name);await privateDirectory(directory,{create:true});await mkdir(join(directory,'makers'),{mode:0o700});
 const keys={[root.id]:rootKey.toString()},accounts=[root];
 for(const [role,amount]of [['core',21n*Q],['oracle',6n*Q],['maker',3n*Q/2n],['maker',3n*Q/2n]]){
  const key=KeyPair.fromRandom('ed25519'),public_key=key.getPublicKey().toString(),id=implicitAccount(public_key);await requireNewAccount(provider,id);keys[id]=key.toString();const a={role,id,public_key,initial_balance:String(amount)};
  if(role==='maker'){const r=generateKeyPairSync('ed25519');a.rfq_public_key=r.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');await durableWrite(join(directory,'makers',id+'.json'),{version:1,private_key:r.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),epoch:null,issued:[],had_quotes:false,retired:false});}accounts.push(a);
 }
 const next={version:1,kind:KIND,network:'testnet',owner:plan.owner,root_id:root.id,rpc_url:plan.rpc_url,genesis_hash:plan.genesis_hash,oracle_version:EXPIRY_VERSION,valuation_model:TWAP_MODEL,listing_policy:LADDER_POLICY,vault_enabled:false,source:SOURCE,artifacts,accounts,funding:{mode:'implicit-transfer-v2',receiver_id:root.id,public_key:root.public_key},funding_amount:String(32n*Q),owner_minimum:String(33n*Q),maker_initial_equity:String(11n*Q/10n),inventory_per_market:String(Q/10n),previous_workspace:previous,oracle_label:'30-minute NEAR/USD trade TWAP',created_at:new Date().toISOString()};
 expiryFunding(next);
 await durableWrite(join(directory,'signers.json'),{version:1,keys});await durableWrite(join(directory,'postgres.json'),{version:1,password:randomUUID()});await durableWrite(join(directory,'plan.json'),next);
 await writeFile(`deploy/testnet/${name}-plan.json`,JSON.stringify(next,null,2)+'\n',{flag:'wx'});return {directory,plan:next};
}

// Receipt-idempotent setup and cohort provisioning. New material is retained
// before any registration. Existing contracts/claims are never upgraded.
export async function deployExpiry(workspace,options={}){
 const {directory,plan}=workspace,admin=options.admin??adminFor(directory,plan),lock=join(directory,'admin-journal','.expiry-coordinator-running');let owned=false;
 await mkdir(join(directory,'admin-journal'),{recursive:true,mode:0o700});
 try{
  try{await mkdir(lock,{mode:0o700});owned=true;}catch(e){if(e.code==='EEXIST')fail('EXPIRY_BUSY_OR_INTERRUPTED');throw e;}
  await durableWrite(join(lock,'owner.json'),{pid:process.pid,started_at:new Date().toISOString()});
  for(const id of (await readdir(admin.journal.directory)).filter(x=>/^[a-f0-9]{64}$/.test(x))){const r=await admin.journal.get(id);if(r.attempted&&!terminal(r.result?.state)&&!terminal((await admin.recover(r.intent)).state))fail('EXPIRY_SIGNER_UNRESOLVED');}
  return await provisionExpiry(workspace,{...options,admin});
 }finally{if(owned)await rm(lock,{recursive:true});}
}
async function provisionExpiry({directory,plan},{admin,market=new CoinbaseMarket({archive:join(directory,'listing-observations')}),publish}={}){
 assertDeploymentEnabled(plan);const funding=expiryFunding(plan),rpc=admin.provider;await admin.verify();
 if(plan.network==='sandbox'){const u=new URL(plan.rpc_url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password||u.search||u.hash)fail('LOCAL_SANDBOX_ONLY');}
 if(plan.network==='testnet'&&(plan.source.account_id!==SOURCE.account_id||plan.source.code_hash!==SOURCE.code_hash))fail('EXPIRY_SOURCE');
 const fund=await admin.prepare(funding.label,plan.owner,funding.receiver_id,funding.actions);if((await admin.recover(fund)).state!=='SUCCEEDED')fail('BOOTSTRAP_NOT_CONFIRMED');
 const {keys}=await privateRead(join(directory,'signers.json'));
 const send=async(label,signer,receiver,actions)=>admin.send(await admin.prepare(label,signer,receiver,actions),keys[signer]);
 const source=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:plan.source.account_id,finality:'final'});if(source.code_hash!==plan.source.code_hash)fail('SOURCE_CODE_CHANGED');
 for(const [kind,path]of Object.entries(FILES)){const b=await readFile(path),a=plan.artifacts[kind];if(a.path!==path||sha(b)!==a.sha256||base58(createHash('sha256').update(b).digest())!==a.code_hash)fail('ARTIFACT_HASH_MISMATCH');}
 const anchor=await retained(join(directory,'anchor.json'),()=>rpc.sendJsonRpc('block',{finality:'final'}));
 for(const a of plan.accounts.filter(a=>a.role!=='administrator'))await send('fund-'+a.id,plan.root_id,a.id,[{type:'Transfer',deposit:a.initial_balance}]);
 const core=plan.accounts.find(a=>a.role==='core').id,oracle=plan.accounts.find(a=>a.role==='oracle').id,makers=plan.accounts.filter(a=>a.role==='maker');
 const costs=await retained(join(directory,'storage-costs.json'),async()=>({byte_cost:(await rpc.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte}));
 const contracts=[];
 for(const [kind,id,args]of [['expiry_oracle',oracle,{network:plan.network,registrar:plan.root_id,guardian:plan.root_id,source:plan.source.account_id}],['core',core,{network:plan.network,guardian:plan.root_id,oracle,oracle_version:EXPIRY_VERSION,storage_byte_cost:costs.byte_cost}]]){
  const a=plan.artifacts[kind],bytes=await readFile(a.path);await send('deploy-'+kind,id,id,[{type:'DeployContract',code:bytes.toString('base64')},functionCall('new',args)]);
  const native=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:id,finality:'final'});if(native.code_hash!==a.code_hash)fail('DEPLOYMENT_MISMATCH');contracts.push({kind,account_id:id,code_hash:a.code_hash});
 }
 const view=(id,method,args={})=>rpc.callFunction({contractId:id,method,args,blockQuery:{finality:'final'}}),sq=await view(core,'storage_quote');
 if(sq.layout_version!==2||sq.max_series!==32)fail('EXPIRY_CORE_LAYOUT');
 for(const id of [plan.root_id,...makers.map(a=>a.id)])await send('register-'+id,id,core,[functionCall('storage_deposit',{},sq.account_minimum)]);
 for(const a of makers){await send('collateral-'+a.id,a.id,core,[functionCall('deposit_collateral',{},plan.maker_initial_equity)]);await send('rfq-key-'+a.id,a.id,core,[functionCall('register_signing_key',{key_id:'demo-key',public_key:a.rfq_public_key},String(BigInt(sq.account_minimum)+1n))]);}
 const snapshot=await market.snapshot(String(BigInt(Date.now())*1000000n));
 const block=await marketHead(rpc,snapshot),pinned=(method,args={})=>rpc.callFunction({contractId:core,method,args,blockQuery:{blockId:block.header.hash}}),existing=await retainedSeries(pinned);
 const file=join(directory,'listing-cohorts.json'),material=await retained(file,async()=>({version:1,cohorts:{},terms:{}}));
 const proposal=planLadder({snapshot,nowNs:block.header.timestamp_nanosec,existing,cohorts:material.cohorts,maxSeries:sq.max_series,profileReady:true});
 if(proposal.blocked.length)fail(proposal.blocked[0]);
 const policy=await view(oracle,'policy_hash'),sourceHash=await view(oracle,'source_hash');
 const resolverState=await view(oracle,'get_snapshot');if(Object.keys(resolverState.cases).length+proposal.targets.filter(t=>!resolverState.cases[t.series_id]).length>32)fail('RESOLVER_CAPACITY');
 for(const t of proposal.targets){
  const config={series_id:t.series_id,version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:policy,payoff_kind:'CAPPED_USD_COMPLEMENT',strike:t.strike,price_scale:'1000000000000',maturity_ns:t.maturity_ns,mint_cutoff_ns:t.mint_cutoff_ns,observation_window:{start_ns:t.mint_cutoff_ns,end_ns:t.maturity_ns},oracle_account_id:oracle,oracle_version:EXPIRY_VERSION,oracle_config_hash:sourceHash,finalization_policy_hash:policy,max_supply:String(100n*Q)};
  for(const found of [material.terms[t.series_id],existing.find(s=>s.config.series_id===t.series_id)?.config,resolverState.cases[t.series_id]?.config])if(found&&canonical(found)!==canonical(config))fail('EXISTING_TERMS_CONFLICT');
  material.terms[t.series_id]=config;
 }
 material.cohorts=proposal.cohorts;await durableWrite(file,material);
 for(const t of proposal.targets){const config=material.terms[t.series_id];
  await send('resolver-series-'+t.series_id,plan.root_id,oracle,[functionCall('register_series',{config},String(Q/10n))]);
  await send('core-series-'+t.series_id,plan.root_id,core,[functionCall('create_series',{config},String(BigInt(sq.series_storage)+BigInt(sq.creation_fee)))]);
  for(const a of makers)await send('inventory-'+t.series_id+'-'+a.id,a.id,core,[functionCall('split',{series_id:t.series_id,amount:plan.inventory_per_market},'1')]);
 }
 const series=(await retainedSeries((method,args={})=>view(core,method,args))).map(s=>s.config);
 const status=await rpc.sendJsonRpc('status',{}),client={network:plan.network,chain_id:status.chain_id,genesis_hash:plan.genesis_hash,rpc_url:plan.rpc_url,contract_id:core,code_hash:plan.artifacts.core.code_hash};
 const d={version:1,network:plan.network,client,indexer:{network:plan.network,chain_id:status.chain_id,genesis_hash:plan.genesis_hash,anchor_hash:anchor.header.hash,rpc_urls:plan.network==='testnet'?[...new Set([plan.rpc_url,'https://testnet-rpc.intea.rs/'])]:[plan.rpc_url],...(plan.network==='testnet'?{discovery_source:'neardata-testnet',discovery_required:false,discovery_interval_ms:3500}:{}),contracts,schema:'hv_expiry_layout2',transaction_filter:'canonical-journal',max_blocks:10000,stale_after_ms:60000,poll_ms:2000,request_interval_ms:1000,read_concurrency:4},source:plan.source,series,accounts:plan.accounts,oracle_label:plan.oracle_label,vault_enabled:false,artifacts:plan.artifacts};
 await durableWrite(join(directory,'deployment.json'),d);if(publish)await publish(d);return d;
}
