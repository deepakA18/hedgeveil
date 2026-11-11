// Actual compiled contracts and durable coordinator receipts; source is explicitly
// a local fault fixture. This is not public Outlayer acceptance.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {SampleCoordinator,ACCEPTED_POLICY} from '../../services/outlayer/sampler.mjs';
import {AdminTransactions} from '../../services/testnet/transactions.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
const Q=10n**24n,S=10n**9n,GAS=280n*10n**12n;
const report={scope:'Compiled-Wasm Sandbox sampler orchestration with synthetic source fixture; no public source acceptance',checks:[],transactions:[],sources:{},passed:false};
let sandbox;
const check=(name,b)=>{assert(b,name);report.checks.push(name);console.log('PASS',name);};
try{
 sandbox=await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});
 const rpc=new JsonRpcProvider({url:sandbox.rpcUrl},{retries:1}),g=GenesisAccount.createDefault(),root=new Account(g.accountId,rpc,g.privateKey),status=await rpc.sendJsonRpc('status',{}),directory=await mkdtemp('target/sampler-');
 const send=async(a,id,method,args={},deposit=0n)=>{const tx=await a.signAndSendTransaction({receiverId:id,actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});assert(![tx.transaction_outcome,...tx.receipts_outcome].some(r=>r.outcome.status.Failure),JSON.stringify(tx.status));return tx;};
 const deploy=async(name,path,args)=>{
  const k=KeyPair.fromRandom('ed25519'),id=name+'.'+g.accountId;await root.createAccount({newAccountId:id,publicKey:k.getPublicKey(),nearToTransfer:30n*Q});const a=new Account(id,rpc,k.toString()),code=await readFile(path);report.sources[path]=createHash('sha256').update(code).digest('hex');
  const tx=await a.signAndSendTransaction({receiverId:id,actions:[actions.deployContract(code),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});assert(![tx.transaction_outcome,...tx.receipts_outcome].some(r=>r.outcome.status.Failure));return {account_id:id,code_hash:base58(createHash('sha256').update(code).digest())};
 };
 const source=await deploy('source','target/external-oracle-artifacts/external_source_fixture.wasm',{owner:g.accountId}),resolver=await deploy('resolver','target/external-oracle-artifacts/external_settlement.wasm',{network:'sandbox',registrar:g.accountId,guardian:g.accountId});
 const bytes=(await rpc.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
 const core=await deploy('core','target/core-artifacts/clearinghouse.wasm',{network:'sandbox',guardian:g.accountId,oracle:resolver.account_id,oracle_version:'native-sampled-v1',storage_byte_cost:bytes});
 const view=(id,method,args={})=>rpc.callFunction({contractId:id,method,args,blockQuery:{finality:'final'}}),now=async()=>BigInt((await rpc.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
 const advance=async target=>{for(let i=0;i<100;i++){const n=await now();if(n>=target)return;await rpc.sendJsonRpc('sandbox_fast_forward',{delta_height:Math.min(100,Number((target-n)/S)+1)});}throw Error('CLOCK_LIMIT');};
 const spec={account:source.account_id,reporter:source.account_id,asset:'wrap.near',min_price:'10000000000',max_price:'1000000000000000'},start=await now()+60n*S,end=start+540n*S;
 const terms={series_id:'sampled',version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:'1'.repeat(64),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'2000000000000',price_scale:'1000000000000',maturity_ns:String(end),mint_cutoff_ns:String(start),observation_window:{start_ns:String(start),end_ns:String(end)},oracle_account_id:resolver.account_id,oracle_version:'native-sampled-v1',oracle_config_hash:await view(resolver.account_id,'source_hash',{source:spec}),finalization_policy_hash:await view(resolver.account_id,'policy_hash'),max_supply:String(100n*Q)};
 await send(root,resolver.account_id,'register_series',{config:terms,source:spec},Q/10n);
 const quote=await view(core.account_id,'storage_quote');await send(root,core.account_id,'storage_deposit',{},BigInt(quote.account_minimum));await send(root,core.account_id,'create_series',{config:terms},BigInt(quote.series_storage)+BigInt(quote.creation_fee));await send(root,core.account_id,'deposit_collateral',{},2n*Q);await send(root,core.account_id,'split',{series_id:'sampled',amount:String(2n*Q)},1n);
 const profile={network:'sandbox',chain_id:status.chain_id,genesis_hash:status.genesis_hash,policy_acceptance:ACCEPTED_POLICY,signer_id:g.accountId,source,resolver,core,terms};
 const admin=new AdminTransactions({provider:rpc,journal:directory+'/journal',identity:{kind:'native-sampler',genesis_hash:status.genesis_hash},verify:async()=>{assert.equal((await rpc.sendJsonRpc('status',{})).genesis_hash,status.genesis_hash);}});
 // Recreate the coordinator before EVERY tick, exercising process-independent journals.
 const tick=()=>new SampleCoordinator({profile,admin,signerKey:g.privateKey}).tick();
 check('collector waits before its immutable window',(await tick()).state==='WAIT_WINDOW');
 for(let slot=0;slot<3;slot++){
  await advance(start+BigInt(slot)*180n*S+5n*S);await send(root,source.account_id,'set',{mode:'normal',price:String(300000000+slot*100000000),stamp:'1'});
  const refresh=await tick();assert.equal(refresh.operation,`refresh:${slot}`);assert.equal(refresh.result.state,'SUCCEEDED');report.transactions.push(refresh);
  const sampled=await tick();assert.equal(sampled.operation,`sample:${slot}`);assert.equal(sampled.result.state,'SUCCEEDED');report.transactions.push(sampled);
  const retained=await tick();check(`slot ${slot}: real refresh and sample receipts survive restart without resending`,retained.state==='WAIT_NEXT_SLOT'&&await view(source.account_id,'get_refresh_count')===slot+1);
 }
 await advance(end+61n*S);const final=await tick();assert.equal(final.operation,'finalize');report.transactions.push(final);const imported=await tick();assert.equal(imported.operation,'import');report.transactions.push(imported);
 const done=await tick();check('collector finalizes exact average and imports it into the core',done.state==='COMPLETE'&&done.price==='4000000000000');check('completed collector stays complete across another restart',(await tick()).state==='COMPLETE');
 for(const leg of ['P','N'])await send(root,core.account_id,'redeem',{series_id:'sampled',leg,amount:String(2n*Q)},1n);await send(root,core.account_id,'request_withdrawal',{amount:String(2n*Q),receiver:g.accountId},1n);
 report.tickets=await view(core.account_id,'list_tickets',{account_id:g.accountId,from_index:0,limit:16});check('automatically sampled settlement supports real redemption and native withdrawal',report.tickets[0].state==='SUCCEEDED');
 report.profile=profile;report.case=await view(resolver.account_id,'get_case',{series_id:'sampled'});report.refresh_count=await view(source.account_id,'get_refresh_count');report.passed=true;
}finally{
 await sandbox?.tearDown();for(const f of ['services/outlayer/sampler.mjs','services/testnet/transactions.mjs','contracts/test-fixtures/external-source/src/lib.rs','tests/sandbox/sampler.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile('research/reports/orc03-sampler-concurrent-sandbox.json',JSON.stringify(report,null,2)+'\n');
}
