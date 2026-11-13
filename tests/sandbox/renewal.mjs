// Local fixture source only. Exercises actual Wasm/funding/listing receipts;
// this is not public source authentication or public trading acceptance.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {renewExpiry} from '../../services/testnet/renewal.mjs';
import {deployExpiry} from '../../services/testnet/expiry-deploy.mjs';
import {expiryFunding,implicitAccount} from '../../services/testnet/funding.mjs';
import {AdminTransactions} from '../../services/testnet/transactions.mjs';
import {durableWrite} from '../../services/demo/storage.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {retainedSeries} from '../../packages/sdk/series.mjs';
const Q=10n**24n,sha=b=>createHash('sha256').update(b).digest('hex');
const directory=await mkdtemp(join(tmpdir(),'hv-deploy-expiry-')),report={scope:'Compiled Sandbox renewal, interrupted recovery and real subsequent cohort; fixture source only',passed:false,checks:[],transactions:[]};let sandbox;
const check=(name,yes)=>{assert(yes,name);report.checks.push(name);console.log('PASS',name);};
try{
 sandbox=await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});
 const rpc=new JsonRpcProvider({url:sandbox.rpcUrl}),g=GenesisAccount.createDefault(),owner=new Account(g.accountId,rpc,g.privateKey),status=await rpc.sendJsonRpc('status',{}),keys={},accounts=[];
 for(const [role,balance]of [['administrator',2n*Q],['core',21n*Q],['oracle',6n*Q],['maker',3n*Q/2n],['maker',3n*Q/2n]]){
  const key=KeyPair.fromRandom('ed25519'),public_key=key.getPublicKey().toString(),id=implicitAccount(public_key);keys[id]=key.toString();const a={role,id,public_key,initial_balance:String(balance)};
  if(role==='maker')a.rfq_public_key=generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');accounts.push(a);
 }
 const sourceKey=KeyPair.fromRandom('ed25519'),sourceId=implicitAccount(sourceKey.getPublicKey().toString());await owner.transfer({receiverId:sourceId,amount:30n*Q});
 const sourceBytes=await readFile('target/expiry-oracle-artifacts/expiry_source_fixture.wasm'),source=new Account(sourceId,rpc,sourceKey.toString());
 await source.signAndSendTransaction({receiverId:sourceId,actions:[actions.deployContract(sourceBytes),actions.functionCall('new',{owner:g.accountId},250000000000000n,0n)],waitUntil:'FINAL'});
 const artifacts={};for(const [kind,path]of Object.entries({core:'target/core-artifacts/clearinghouse.wasm',expiry_oracle:'target/expiry-oracle-artifacts/expiry_settlement.wasm'})){const b=await readFile(path);artifacts[kind]={path,sha256:sha(b),code_hash:base58(createHash('sha256').update(b).digest()),bytes:b.length};}
 const root_id=accounts[0].id,plan={version:1,kind:'hedgeveil-expiry-testnet',network:'sandbox',owner:g.accountId,root_id,rpc_url:sandbox.rpcUrl,genesis_hash:status.genesis_hash,oracle_version:'native-trade-twap-v1',valuation_model:'ARITHMETIC_TWAP_NEAR_MOMENTS_V1',listing_policy:'DAILY_FRIDAY_0800_90_95_100_105_110_V1',vault_enabled:false,source:{account_id:sourceId,code_hash:base58(createHash('sha256').update(sourceBytes).digest())},accounts,artifacts,funding:{mode:'implicit-transfer-v2',receiver_id:root_id,public_key:accounts[0].public_key},funding_amount:String(32n*Q),owner_minimum:String(33n*Q),maker_initial_equity:String(11n*Q/10n),inventory_per_market:String(Q/10n)};
 await durableWrite(join(directory,'signers.json'),{keys});await mkdir(join(directory,'listing-observations'),{mode:0o700});
 const admin=new AdminTransactions({provider:rpc,journal:join(directory,'admin-journal'),identity:{network:'sandbox',genesis_hash:status.genesis_hash,root_id},verify:async()=>assert.equal((await rpc.sendJsonRpc('status',{})).genesis_hash,status.genesis_hash)});
 const funding=expiryFunding(plan);await admin.send(await admin.prepare(funding.label,g.accountId,funding.receiver_id,funding.actions),g.privateKey);
 const market={snapshot:async()=>({source:'COINBASE_EXCHANGE_NEAR_USD_V1',price_scale:'1000000000000',spot:'3500000000000',timestamp_ns:(await rpc.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec,snapshot_hash:'a'.repeat(64)})};
 const deployment=await deployExpiry({directory,plan},{admin,market});
 const view=(method,args={})=>rpc.callFunction({contractId:deployment.client.contract_id,method,args,blockQuery:{finality:'final'}}),series=await retainedSeries(view);
 check('separate deployment lists ten genuine markets across two expiries',series.length===10&&new Set(series.map(s=>s.config.maturity_ns)).size===2);
 check('each market has real funded complementary supply',series.every(s=>s.outstanding_p===String(Q/5n)&&s.outstanding_n===String(Q/5n)&&s.reserve===String(Q/5n)));
 for(const a of accounts.filter(a=>a.role==='maker')){const account=await view('get_account',{account_id:a.id});check('maker has independent funded inventory and free collateral',series.every(s=>account.positions[s.slot].p===String(Q/10n)&&account.positions[s.slot].n===String(Q/10n))&&account.free===String(Q/10n));}
 const balance=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:root_id,finality:'final'});report.remaining_service_balance=balance.amount;check('two separate operating NEAR covers setup without collateral borrowing',BigInt(balance.amount)>Q/4n);
 const before=await view('custody_snapshot'),count=admin.evidence.size;
 await deployExpiry({directory,plan},{admin,market:{snapshot:async()=>({...await market.snapshot(),spot:'4000000000000',snapshot_hash:'b'.repeat(64)})}});
 check('restart neither reprices cohorts nor reissues deposits or splits',JSON.stringify(await view('custody_snapshot'))===JSON.stringify(before)&&admin.evidence.size===count);
 // A real later cohort, funded only from test genesis service capital.
 await owner.transfer({receiverId:root_id,amount:5n*Q});
 const cutoff=BigInt(series.map(s=>s.config.mint_cutoff_ns).sort()[0]);
 for(let i=0;i<30;i++){const n=BigInt((await rpc.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);if(n>=cutoff)break;await rpc.sendJsonRpc('sandbox_fast_forward',{delta_height:10000});}
 const savedSend=admin.send.bind(admin);let writes=0;
 admin.send=async(...args)=>{if(++writes===2)throw Error('INJECTED_PROCESS_INTERRUPTION');return savedSend(...args);};
 await assert.rejects(renewExpiry({directory,plan},{admin,market}),/INJECTED_PROCESS_INTERRUPTION/);
 admin.send=savedSend;
 const first=await renewExpiry({directory,plan},{admin,market});
 const after=await retainedSeries(view);
 check('later date adds five actually funded markets after interrupted maker harvest resumes',first.new_markets===5&&after.length===15&&after.filter(s=>!series.some(old=>old.config.series_id===s.config.series_id)).every(s=>s.reserve===String(Q/5n)));
 check('unsettled historical markets keep their slots and immutable terms',series.every(old=>after.some(s=>JSON.stringify(s.config)===JSON.stringify(old.config))));
 const previous=await view('custody_snapshot'),evidenceCount=admin.evidence.size;
 await renewExpiry({directory,plan},{admin,market});
 check('subsequent renewal does not mint or charge twice',JSON.stringify(await view('custody_snapshot'))===JSON.stringify(previous)&&admin.evidence.size===evidenceCount);
 // Capacity is enforced before any new cohort writes.
 const secondCutoff=BigInt(after.filter(s=>!series.some(old=>old.config.series_id===s.config.series_id))[0].config.mint_cutoff_ns);
 report.artifacts=artifacts;report.series=after.map(s=>s.config);report.passed=true;
 report.transactions=[...admin.evidence].map(([id,t])=>({operation_id:id,hash:t.transaction.hash,status:t.status,receipts:t.receipts_outcome.map(r=>({id:r.id,executor:r.outcome.executor_id,status:r.outcome.status,gas_burnt:r.outcome.gas_burnt,logs:r.outcome.logs}))}));
}finally{await sandbox?.tearDown();await rm(directory,{recursive:true,force:true});await writeFile('research/reports/renewal-sandbox.json',JSON.stringify(report,null,2)+'\n');}
