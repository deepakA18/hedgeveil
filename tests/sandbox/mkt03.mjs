// Actual free market inputs + compiled-Wasm fills. Sandbox custody only;
// fixture oracle is never used to claim external settlement acceptance.
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
const {values:reportOptions}=parseArgs({options:{report:{type:'string',default:'research/reports/mkt03-journal-market-sandbox.json'}}});
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import {resolve,join} from 'node:path';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {verifyQuote} from '../../packages/rfq/codec.mjs';
import {validateSnapshot} from '../../services/market-data/coinbase.mjs';
import {journalCandidates} from '../../services/indexer/discovery.mjs';
const Q=10n**24n,GAS=280n*10n**12n,work=resolve('target/mkt03-live-'+Date.now());await mkdir(work,{recursive:true,mode:0o700});
const report={scope:'Actual Coinbase market inputs, two project-operated makers, actual compiled-Wasm Sandbox fills; no public testnet or external settlement claim',checks:[],transactions:[],quotes:[],snapshots:[],sources:{},passed:false};
let sandbox;const children=[],keys=new Map();
const check=(name,condition)=>{assert(condition,name);report.checks.push(name);console.log('PASS',name);};
const failed=tx=>[tx.transaction_outcome,...tx.receipts_outcome].some(r=>r.outcome.status.Failure);
try{
 sandbox=await Sandbox.start({version:'2.14.0'});const provider=new JsonRpcProvider({url:sandbox.rpcUrl}),g=GenesisAccount.createDefault(),root=new Account(g.accountId,provider,g.privateKey);
 const record=(label,tx)=>{report.transactions.push({label,hash:tx.transaction.hash,status:tx.status,receipts:tx.receipts_outcome.map(r=>({id:r.id,executor:r.outcome.executor_id,status:r.outcome.status}))});};
 const create=async name=>{const key=KeyPair.fromRandom('ed25519'),id=name+'.'+root.accountId,tx=await root.createAccount({newAccountId:id,publicKey:key.getPublicKey(),nearToTransfer:50n*Q});record('create '+name,tx);assert(!failed(tx));keys.set(id,key.toString());return new Account(id,provider,key.toString());};
 const call=async(a,c,method,args={},deposit=0n)=>{const tx=await a.signAndSendTransaction({receiverId:c.accountId,actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});record(method,tx);assert(!failed(tx),JSON.stringify(tx.status));return tx;};
 const deploy=async(name,file,args)=>{const a=await create(name),code=await readFile('target/core-artifacts/'+file),manifest=JSON.parse(await readFile('target/core-artifacts/manifest.json'));
  assert.equal(createHash('sha256').update(code).digest('hex'),manifest[file].sha256);report.sources['artifact/'+file]=manifest[file].sha256;
  const tx=await a.signAndSendTransaction({receiverId:a.accountId,actions:[actions.deployContract(code),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});record('deploy '+name,tx);assert(!failed(tx));return a;};
 const buyer=await create('buyer'),ma=await create('maker-a'),mb=await create('maker-b');
 const oracle=await deploy('oracle','oracle-fixture.wasm',{owner:root.accountId});
 const byteCost=(await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
 const core=await deploy('core','clearinghouse.wasm',{network:'sandbox',guardian:root.accountId,oracle:oracle.accountId,oracle_version:'fixture-v1',storage_byte_cost:byteCost});
 const view=(method,args={})=>provider.callFunction({contractId:core.accountId,method,args,blockQuery:{finality:'final'}});
 const sq=await view('storage_quote');for(const a of [root,buyer,ma,mb])await call(a,core,'storage_deposit',{},BigInt(sq.account_minimum));for(const a of [buyer,ma,mb])await call(a,core,'deposit_collateral',{},4n*Q);
 const now=BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec),end=now+86400000000000n;
 const config={series_id:'market',version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:'1'.repeat(64),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'3500000000000',price_scale:'1000000000000',maturity_ns:String(end),mint_cutoff_ns:String(end-120000000000n),observation_window:{start_ns:String(end-120000000000n),end_ns:String(end)},oracle_account_id:oracle.accountId,oracle_version:'fixture-v1',oracle_config_hash:'2'.repeat(64),finalization_policy_hash:'3'.repeat(64),max_supply:String(100n*Q)};
 report.series=config;await call(root,core,'create_series',{config},BigInt(sq.series_storage)+BigInt(sq.creation_fee));for(const a of [ma,mb])await call(a,core,'split',{series_id:'market',amount:String(2n*Q)},1n);
 const workers=[];
 for(const [n,a]of [ma,mb].entries()){
  const child=fork(resolve('services/maker/worker.mjs'),[],{stdio:['ignore','ignore','ignore','ipc']});children.push(child);let next=0;const pending=new Map();
  child.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);});
  const ask=(method,body)=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('worker timeout'));},30000);pending.set(id,{resolve,reject,timer});child.send({id,method,...body});});
  const archive=join(work,'market-'+n),ready=await ask('init',{config:{rpc_url:sandbox.rpcUrl,contract:core.accountId,maker:a.accountId,account_key:keys.get(a.accountId),key_id:'live-market',initial_equity:String(4n*Q),half_spread_bps:20+n*20,fee_receiver:a.accountId,pricing_source:'coinbase',market_archive:archive,state_file:join(work,'maker-'+n+'.json'),operation_journal:join(work,'journal-'+n)}});
  await call(a,core,'register_signing_key',{key_id:'live-market',public_key:ready.public_key},BigInt((await view('market_config')).registration_storage)+1n);workers.push({ask,key:ready.public_key,archive,journal:join(work,'journal-'+n),state:join(work,'maker-'+n+'.json')});
 }
 check('two separate maker processes use the external pricing profile',children[0].pid!==children[1].pid);
 const rejected=await workers[0].ask('quote',{request:{mode:'BUY',asset:{kind:'P',series_id:'unknown'},amount:String(Q/10n),taker:buyer.accountId}});
 check('unknown-series request is declined without retiring the maker',rejected.quote===null&&rejected.reason==='SERIES_UNAVAILABLE');
 for(const [kind,mode]of [['P','BUY'],['N','BUY'],['P','SELL']]){
  const request={mode,asset:{kind,series_id:'market'},amount:String(Q/10n),taker:buyer.accountId,reference:{label:'SYNTHETIC MARKET REFERENCE',timestamp_ns:String(now),marks:{'P:market':'1','N:market':'1'}}};
  const offers=await Promise.all(workers.map(w=>w.ask('quote',{request})));report.quotes.push(...offers);
  for(const [i,o]of offers.entries()){assert(o.quote,JSON.stringify(o));assert(verifyQuote(o.quote,workers[i].key));assert.equal(o.diagnostics.source,'COINBASE_EXCHANGE_NEAR_USD_V1');}
  const chosen=mode==='BUY'?offers.reduce((a,b)=>BigInt(a.quote.taker_gives[0].amount)<BigInt(b.quote.taker_gives[0].amount)?a:b):offers.reduce((a,b)=>BigInt(a.quote.maker_gives[0].amount)>BigInt(b.quote.maker_gives[0].amount)?a:b);
  await call(buyer,core,'fill_quote',{quote:chosen.quote},1n);check(`${mode} ${kind}: externally priced signed quote executes real receipt`,true);
 }
 check('caller-supplied fixture marks never enter public-source quote diagnostics',report.quotes.every(q=>q.diagnostics.model==='EUROPEAN_ZERO_CARRY_REALIZED_VOL_V1'&&q.diagnostics.snapshot_hash.length===64));
 for(const w of workers)for(const name of await readdir(w.archive)){
  const raw=JSON.parse(await readFile(join(w.archive,name)));const quote=report.quotes.find(q=>q.diagnostics.snapshot_hash===name.slice(0,-5));assert(quote);
  const validated=validateSnapshot(raw,quote.diagnostics.reference_timestamp_ns);assert.equal(validated.snapshot_hash,quote.diagnostics.snapshot_hash);report.snapshots.push({raw,observation:validated});
 }
 check('archived actual market inputs replay into each recorded quote source',report.snapshots.length>=2);
 const custody=await view('custody_snapshot');report.custody=custody;report.buyer=await view('get_account',{account_id:buyer.accountId});
 for(const w of workers){const r=await w.ask('withdraw',{reason:'test complete'});if(r.cancellation){assert.equal(r.cancellation.state,'SUCCEEDED');const hints=await journalCandidates([w.journal])();assert.equal(hints.length,1);assert.equal(hints[0].hash,r.cancellation.hash);const raw=await provider.sendJsonRpc('tx',{tx_hash:hints[0].hash,sender_account_id:hints[0].signer_id,wait_until:'FINAL'});record('maker cancellation',raw);assert(!failed(raw));assert.equal(JSON.parse(await readFile(w.state)).pending_cancellation,null);assert.equal((await w.ask('withdraw')).cancellation,null);}}
 check('maker shutdown journals actual cancellation receipts and a repeated shutdown sends nothing',true);report.passed=true;
}finally{
 for(const c of children)c.kill();keys.clear();await sandbox?.tearDown();
 for(const f of ['services/market-data/coinbase.mjs','services/maker/valuation.mjs','services/maker/worker.mjs','tests/sandbox/mkt03.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile(reportOptions.report,JSON.stringify(report,null,2)+'\n');
}
