import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {Indexer} from '../../services/indexer/indexer.mjs';
import {extractEvents,replayExternal,reconcileExternal} from '../../services/indexer/model.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {startPostgres} from '../indexer/postgres.mjs';
const Q=10n**24n,GAS=280n*10n**12n,S=10n**9n;
const report={scope:'Candidate native sampled resolver compiled-Wasm Sandbox tests with explicit synthetic source fault fixture; no external-source/testnet acceptance',checks:[],transactions:[],sources:{},passed:false};
let sandbox,pg,indexer;const oracleEvents=[];const check=(name,condition)=>{assert(condition,name);report.checks.push(name);console.log('PASS',name);};
const failed=tx=>[tx.transaction_outcome,...tx.receipts_outcome].some(r=>r.outcome.status.Failure);
try{
 sandbox=await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});pg=await startPostgres();const provider=new JsonRpcProvider({url:sandbox.rpcUrl}),g=GenesisAccount.createDefault(),root=new Account(g.accountId,provider,g.privateKey);
 const status=await provider.sendJsonRpc('status',{}),anchor=await provider.sendJsonRpc('block',{finality:'final'});
 const watched=[{kind:'external_oracle',account_id:'resolver.'+g.accountId}];
 const record=(label,tx)=>{oracleEvents.push(...tx.receipts_outcome.flatMap(r=>extractEvents(r,watched)));report.transactions.push({label,hash:tx.transaction.hash,status:tx.status,gas_burnt:String([tx.transaction_outcome,...tx.receipts_outcome].reduce((a,r)=>a+BigInt(r.outcome.gas_burnt),0n)),receipts:tx.receipts_outcome.map(r=>({id:r.id,executor:r.outcome.executor_id,status:r.outcome.status,logs:r.outcome.logs}))});};
 const create=async name=>{const k=KeyPair.fromRandom('ed25519'),id=name+'.'+root.accountId,tx=await root.createAccount({newAccountId:id,publicKey:k.getPublicKey(),nearToTransfer:30n*Q});record('create '+name,tx);assert(!failed(tx));return new Account(id,provider,k.toString());};
 const call=async(a,c,method,args={},deposit=0n,success=true)=>{const tx=await a.signAndSendTransaction({receiverId:c.accountId,actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});record(method,tx);assert.equal(!failed(tx),success,JSON.stringify(tx.status));return tx;};
 const deploy=async(name,file,args)=>{const a=await create(name),code=await readFile(file);report.sources[file]=createHash('sha256').update(code).digest('hex');const tx=await a.signAndSendTransaction({receiverId:a.accountId,actions:[actions.deployContract(code),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});record('deploy '+name,tx);assert(!failed(tx));return a;};
 const view=(a,method,args={})=>provider.callFunction({contractId:a.accountId,method,args,blockQuery:{finality:'final'}});
 const now=async()=>BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
 const advance=async t=>{for(let i=0;i<100;i++){const n=await now();if(n>=t)return;await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:Math.min(100,Number((t-n)/S)+1)});}throw Error('clock limit');};
 const buyer=await create('buyer'),source=await deploy('source','target/external-oracle-artifacts/external_source_fixture.wasm',{owner:root.accountId});
 const resolver=await deploy('resolver','target/external-oracle-artifacts/external_settlement.wasm',{network:'sandbox',registrar:root.accountId,guardian:root.accountId});
 const bytes=(await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
 const core=await deploy('core','target/core-artifacts/clearinghouse.wasm',{network:'sandbox',guardian:root.accountId,oracle:resolver.accountId,oracle_version:'native-sampled-v1',storage_byte_cost:bytes});
 const spec={account:source.accountId,reporter:source.accountId,asset:'wrap.near',min_price:'10000000000',max_price:'1000000000000000'};
 const sourceHash=await view(resolver,'source_hash',{source:spec}),policyHash=await view(resolver,'policy_hash');
 const start=await now()+60n*S,end=start+360n*S;
 const config={series_id:'external',version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:'1'.repeat(64),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'2000000000000',price_scale:'1000000000000',maturity_ns:String(end),mint_cutoff_ns:String(start),observation_window:{start_ns:String(start),end_ns:String(end)},oracle_account_id:resolver.accountId,oracle_version:'native-sampled-v1',oracle_config_hash:sourceHash,finalization_policy_hash:policyHash,max_supply:String(100n*Q)};
 report.series=config;report.source_spec=spec;
 await call(buyer,resolver,'register_series',{config,source:spec},Q/10n,false);
 await call(root,resolver,'register_series',{config:{...config,oracle_config_hash:'f'.repeat(64)},source:spec},Q/10n,false);
 await call(root,resolver,'register_series',{config,source:spec},Q/10n-1n,false);
 await call(root,resolver,'register_series',{config,source:spec},Q/10n);
 await call(root,resolver,'register_series',{config,source:spec},Q/10n,false);
 await call(root,resolver,'register_series',{config:{...config,series_id:'missing'},source:spec},Q/10n);
 check('registrar, immutable source/policy, exact fee and duplicate registration enforced',true);
 const sq=await view(core,'storage_quote');for(const a of [root,buyer])await call(a,core,'storage_deposit',{},BigInt(sq.account_minimum));await call(buyer,core,'deposit_collateral',{},2n*Q);
 await call(root,core,'create_series',{config},BigInt(sq.series_storage)+BigInt(sq.creation_fee));await call(buyer,core,'split',{series_id:'external',amount:String(2n*Q)},1n);
 await call(buyer,resolver,'sample',{series_id:'external'},0n,false);
 await call(buyer,resolver,'on_sample',{series_id:'external',request_id:'1'},0n,false);
 await call(buyer,resolver,'set_pause',{paused:true},0n,false);
 await call(buyer,core,'request_resolution',{series_id:'external'},0n,false);
 check('pre-window requests, forged callback and unprivileged pause rejected; pending import stays unfinalized',(await view(core,'get_series',{series_id:'external'})).final_price===null);
 await advance(start+10n*S);
 for(const mode of ['null','malformed','duplicate','failure']){
  await call(root,source,'set',{mode,price:'300000000',stamp:null});await call(buyer,resolver,'sample',{series_id:'external'},0n,mode!=='failure');
  const c=await view(resolver,'get_case',{series_id:'external'});check(`${mode} source cannot create a sample and clears retry state`,c.samples[0]===null&&c.pending===null);
 }
 for(const [label,price,stamp]of [['stale','300000000',String(start-1n)],['future','300000000',String(end)],['zero','0',null],['bounds','1000000000000',null]]){
  await call(root,source,'set',{mode:'normal',price,stamp});await call(buyer,resolver,'sample',{series_id:'external'});check(`${label} input rejected`,(await view(resolver,'get_case',{series_id:'external'})).samples[0]===null);
 }
 for(let slot=0;slot<3;slot++){
  if(slot)await advance(start+BigInt(slot)*120n*S+10n*S);
  await call(root,source,'set',{mode:'normal',price:String(300000000+slot*100000000),stamp:null});await call(buyer,resolver,'sample',{series_id:'external'});
  const sample=(await view(resolver,'get_case',{series_id:'external'})).samples[slot];assert(sample);assert.equal(sample.price,String(BigInt(3+slot)*10n**12n));
  await call(buyer,resolver,'sample',{series_id:'external'},0n,false);check(`slot ${slot} accepts one exact-unit authenticated callback and is immutable`,true);
 }
 await advance(end);await call(buyer,resolver,'finalize',{series_id:'external'},0n,false);
 await call(buyer,core,'request_resolution',{series_id:'external'});check('review delay enforced and unfinalized callback cannot import a price',(await view(core,'get_series',{series_id:'external'})).final_price===null);
 await advance(end+61n*S);await call(root,resolver,'set_pause',{paused:true});await call(buyer,resolver,'finalize',{series_id:'external'},0n,false);await call(root,resolver,'set_pause',{paused:false});
 await call(buyer,resolver,'finalize',{series_id:'external'});await call(buyer,resolver,'finalize',{series_id:'external'});
 const resolution=await view(resolver,'get_resolution',{series_id:'external'});check('permissionless finalization is exact mean and idempotent',resolution.state==='FINALIZED'&&resolution.price==='4000000000000');
 await call(buyer,resolver,'finalize',{series_id:'missing'});check('missing observations remain delayed with no invented backfill',(await view(resolver,'get_resolution',{series_id:'missing'})).state==='RESOLUTION_DELAYED');
 await call(buyer,core,'request_resolution',{series_id:'external'});check('actual core private callback imports matching external resolver version',(await view(core,'get_series',{series_id:'external'})).final_price==='4000000000000');
 for(const leg of ['P','N'])await call(buyer,core,'redeem',{series_id:'external',leg,amount:String(2n*Q)},1n);
 check('both complementary redemptions return exactly the backed collateral',(await view(core,'get_account',{account_id:buyer.accountId})).free===String(2n*Q));
 await call(buyer,core,'request_withdrawal',{amount:String(2n*Q),receiver:buyer.accountId},1n);
 report.tickets=await view(core,'list_tickets',{account_id:buyer.accountId,from_index:0,limit:16});check('withdrawal completes with actual native receipts',report.tickets[0].state==='SUCCEEDED');
 const contracts=await Promise.all([['core',core.accountId,'target/core-artifacts/clearinghouse.wasm'],['external_oracle',resolver.accountId,'target/external-oracle-artifacts/external_settlement.wasm']].map(async([kind,account_id,file])=>({kind,account_id,code_hash:base58(createHash('sha256').update(await readFile(file)).digest())})));
 const indexConfig={network:'sandbox',chain_id:status.chain_id,genesis_hash:status.genesis_hash,anchor_hash:anchor.header.hash,rpc_urls:[sandbox.rpcUrl],contracts,postgres:pg.config,schema:'hv_external',stale_after_ms:300000};
 indexer=new Indexer(indexConfig);await indexer.init();const indexed=await indexer.sync();
 check('PostgreSQL indexer replays actual core and resolver receipts against same-block snapshots',indexed.health.risk_allowed&&indexed.reconciliations.length===2&&indexed.reconciliations.every(r=>r.matched));
 check('missing samples are visible as unresolved/incomplete oracle alerts',indexed.alerts.some(a=>a.code==='ORACLE_OBSERVATIONS_INCOMPLETE'&&a.entity==='missing'));
 const snapshots=await indexer.store.read('snapshots'),snapshot=snapshots.items.find(s=>s.kind==='external_oracle').body,replayed=replayExternal(oracleEvents);
 assert.equal(reconcileExternal(replayed,snapshot).matched,true);
 check('indexed state commits to and discloses both authority accounts',snapshot.state.registrar===root.accountId&&snapshot.state.guardian===root.accountId&&BigInt(snapshot.state.request_sequence)>0n);
 const corrupt=structuredClone(snapshot);corrupt.state.cases.external.price='4000000000001';assert.throws(()=>reconcileExternal(replayed,corrupt),/STATE_MISMATCH/);
 assert.throws(()=>replayExternal(oracleEvents.slice(1)),/SEQUENCE_GAP/);
 const wrongDomain=structuredClone(snapshot);wrongDomain.state.network='testnet';assert.throws(()=>reconcileExternal(replayed,wrongDomain),/DOMAIN/);
 check('state tampering, missing events and wrong oracle domain fail reconciliation',true);
 await indexer.close();indexer=new Indexer(indexConfig);await indexer.init();const resumed=await indexer.sync();
 check('indexer restart preserves resolver sequence without duplicate events',resumed.event_count===indexed.event_count&&resumed.health.risk_allowed);
 report.indexer={initial:indexed,restarted:resumed,snapshot};
 report.resolution=resolution;report.case=await view(resolver,'get_case',{series_id:'external'});report.custody=await view(core,'custody_snapshot');report.passed=true;
}finally{
 await indexer?.close();await pg?.runtime.stop();await sandbox?.tearDown();for(const f of ['contracts/external-settlement/src/lib.rs','contracts/test-fixtures/external-source/src/lib.rs','contracts/Cargo.lock','tests/sandbox/external-settlement.mjs','services/indexer/model.mjs','services/indexer/rpc.mjs','services/indexer/store.mjs','services/indexer/indexer.mjs','packages/shared-schemas/external-oracle.schema.json'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile('research/reports/orc03-native-resolver-sandbox.json',JSON.stringify(report,null,2)+'\n');
}
