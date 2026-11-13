// Compiled layout-2 execution; oracle fixture is local-only, never live evidence.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {retainedSeries} from '../../packages/sdk/series.mjs';
import {extractEvents,replayCore,reconcileCore} from '../../services/indexer/model.mjs';
const Q=10n**24n,S=10n**9n,GAS=250n*10n**12n;
const report={scope:'MKT-05 layout-2 capacity/retirement, compiled local Sandbox; no public acceptance',passed:false,checks:[],transactions:[],sources:{}};
const check=(name,value)=>{assert(value,name);report.checks.push(name);console.log('PASS',name);};
const failed=t=>[t.transaction_outcome,...t.receipts_outcome].some(r=>r.outcome.status.Failure);
let sandbox,core;const events=[];
try {
 sandbox=await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});
 const provider=new JsonRpcProvider({url:sandbox.rpcUrl}),g=GenesisAccount.createDefault(),root=new Account(g.accountId,provider,g.privateKey);
 const record=(label,t)=>{
  report.transactions.push({label,hash:t.transaction.hash,status:t.status,receipts:t.receipts_outcome.map(r=>({id:r.id,executor:r.outcome.executor_id,gas_burnt:r.outcome.gas_burnt,status:r.outcome.status,logs:r.outcome.logs}))});
  if(core)for(const r of t.receipts_outcome)events.push(...extractEvents(r,[{account_id:core.accountId,kind:'core'}]));
 };
 const create=async name=>{const k=KeyPair.fromRandom('ed25519'),a=new Account(name+'.'+root.accountId,provider,k.toString());const t=await root.createAccount({newAccountId:a.accountId,publicKey:k.getPublicKey(),nearToTransfer:60n*Q});assert(!failed(t));return a;};
 const call=async(a,c,method,args={},deposit=0n,success=true)=>{const t=await a.signAndSendTransaction({receiverId:c.accountId,actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});record(method,t);assert.equal(!failed(t),success,`${method}: ${JSON.stringify(t.status)}`);return t;};
 const deploy=async(c,file,args)=>{const code=await readFile(file);report.sources[file]=createHash('sha256').update(code).digest('hex');const t=await c.signAndSendTransaction({receiverId:c.accountId,actions:[actions.deployContract(code),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});record('deploy',t);assert(!failed(t),JSON.stringify(t.status));};
 const view=(c,method,args={})=>provider.callFunction({contractId:c.accountId,method,args,blockQuery:{finality:'final'}});
 const now=async()=>BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
 const oracle=await create('oracle');await deploy(oracle,'target/core-artifacts/oracle-fixture.wasm',{owner:root.accountId});
 core=await create('core');const byteCost=(await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
 await deploy(core,'target/core-artifacts/clearinghouse.wasm',{network:'sandbox',guardian:root.accountId,oracle:oracle.accountId,oracle_version:'fixture-v1',storage_byte_cost:byteCost});
 const sq=await view(core,'storage_quote'),minimum=BigInt(sq.account_minimum),payment=BigInt(sq.series_storage)+BigInt(sq.creation_fee);
 check('separate layout declares 32 retained slots with paid account storage',sq.layout_version===2&&sq.max_series===32);
 const owners=[root];for(let i=1;i<16;i++)owners.push(await create('holder'+i));
 for(const owner of owners)await call(owner,core,'storage_deposit',{},minimum);
 await call(root,core,'deposit_collateral',{},40n*Q);
 const end=await now()+7200n*S;
 const config=(id,maturity=end)=>({series_id:id,version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:'1'.repeat(64),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'2000000000000',price_scale:'1000000000000',maturity_ns:String(maturity),mint_cutoff_ns:String(maturity-1800n*S),observation_window:{start_ns:String(maturity-1800n*S),end_ns:String(maturity)},oracle_account_id:oracle.accountId,oracle_version:'fixture-v1',oracle_config_hash:'2'.repeat(64),finalization_policy_hash:'3'.repeat(64),max_supply:String(100n*Q)});
 for(let i=0;i<32;i++){
  await call(root,core,'create_series',{config:config('m'+String(i).padStart(2,'0'))},payment);
  await call(root,core,'split',{series_id:'m'+String(i).padStart(2,'0'),amount:String(Q)},1n);
 }
 // Exercise every account's position array and retained-indexer reconciliation.
 for(let i=1;i<16;i++)for(const leg of ['P','N'])await call(root,core,'transfer',{asset:{kind:leg,series_id:'m31'},receiver:owners[i].accountId,amount:String(Q/100n)},1n);
 const snapshot=async()=>{
  const block=await provider.sendJsonRpc('block',{finality:'final'});
  const pinned=(method,args={})=>provider.callFunction({contractId:core.accountId,method,args,blockQuery:{blockId:block.header.hash}});
  const series=await retainedSeries(pinned),accounts=Object.fromEntries(await Promise.all(owners.map(async a=>[a.accountId,await pinned('get_account',{account_id:a.accountId})])));
  const custody=await pinned('custody_snapshot');
  const native=await provider.sendJsonRpc('query',{request_type:'view_account',account_id:core.accountId,block_id:block.header.hash});
  const tickets=(await Promise.all(owners.map(a=>pinned('list_tickets',{account_id:a.accountId,from_index:0,limit:16})))).flat();
  const s={kind:'core',contract:core.accountId,series,accounts,custody,native,tickets,vault:null,roll:null};
  reconcileCore(replayCore(core.accountId,events),s);return s;
 };
 check('32 funded series and 16 accounts reconcile against actual receipt events',(await snapshot()).series.length===32);
 await call(root,core,'create_series',{config:config('overflow')},payment,false);
 await call(root,core,'archive_series',{series_id:'m00'},1n,false);
 await call(root,core,'archive_series',{series_id:'m00'},0n,false);
 check('capacity and unsafe retirement reject without mutating holdings',(await snapshot()).series.length===32);
 for(let i=0;i<100&&await now()<end;i++)await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:1000});
 assert(await now()>=end);
 await call(root,core,'archive_series',{series_id:'m20'},1n,false);
 // A missing report never authorizes slot reuse, even after expiry.
 await call(root,core,'request_resolution',{series_id:'m20'});
 await call(root,core,'archive_series',{series_id:'m20'},1n,false);
 const originals=[];
 for(let i=0;i<10;i++){
  const id='m'+String(i).padStart(2,'0');
  await call(root,oracle,'set_report',{series_id:id,report:{config:config(id),state:'FINALIZED',price:'3000000000000'}});
  await call(root,core,'request_resolution',{series_id:id});
  await call(root,core,'redeem',{series_id:id,leg:'P',amount:String(Q)},1n);
  await call(root,core,'archive_series',{series_id:id},1n,false);
  await call(root,core,'redeem',{series_id:id,leg:'N',amount:String(Q)},1n);
  await call(root,core,'release_dust',{series_id:id},1n);
  originals.push(await view(core,'get_series',{series_id:id}));
  await call(owners[1],core,'archive_series',{series_id:id},1n);
 }
 check('ten fully redeemed records survive permissionless retirement',JSON.stringify(await view(core,'list_archived_series',{from_index:0,limit:16}))===JSON.stringify(originals));
 check('archive pagination does not scan or return retained slots',(await view(core,'list_archived_series',{from_index:7,limit:2})).map(s=>s.config.series_id).join(',')==='m07,m08');
 await call(root,core,'archive_series',{series_id:'m00'},1n,false);
 const nextEnd=await now()+7200n*S;
 await call(root,core,'create_series',{config:config('m00',nextEnd)},payment,false);
 for(let i=0;i<10;i++){
  const id='next'+i;await call(root,core,'create_series',{config:config(id,nextEnd)},payment);
  const s=await view(core,'get_series',{series_id:id});check(`replacement ${id} reuses only the exited slot`,s.slot===i);
  await call(root,core,'split',{series_id:id,amount:String(Q/100n)},1n);
  await call(root,core,'merge',{series_id:id,amount:String(Q/100n)},1n);
 }
 for(const original of originals)assert.deepEqual(await view(core,'get_series',{series_id:original.config.series_id}),original);
 const state=await snapshot();
 check('replacement cohort, retained old claims and archive storage all reconcile',state.series.length===32&&state.custody.series_storage_fund===String(42n*BigInt(sq.series_storage)));
 check('old archived claims cannot read replacement slot balances',await view(core,'series_state',{series_id:'m00'})==='CLOSED');
 await call(root,core,'redeem',{series_id:'m00',leg:'P',amount:'1'},1n,false);
 await call(root,core,'request_withdrawal',{amount:String(Q),receiver:owners[1].accountId},1n);
 check('withdrawal still completes after archive and slot reuse',(await view(core,'list_tickets',{account_id:root.accountId,from_index:0,limit:16}))[0].state==='SUCCEEDED');
 await snapshot();
 report.passed=true;
} finally {
 await sandbox?.tearDown();
 for(const f of ['contracts/clearinghouse/src/lib.rs','contracts/clearinghouse/src/types.rs','contracts/clearinghouse/src/series.rs','contracts/clearinghouse/src/events.rs','contracts/clearinghouse/src/accounting.rs','packages/sdk/series.mjs','packages/shared-schemas/public-ledger.schema.json','tests/sandbox/market-capacity.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile('research/reports/mkt05-capacity-sandbox.json',JSON.stringify(report,null,2)+'\n');
}
