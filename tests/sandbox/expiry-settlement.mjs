// Compiled-Wasm lifecycle and adversarial tests. Explicit Sandbox source fixture,
// not public oracle evidence; the separate Outlayer report contains the real run.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
const Q=10n**24n,S=10n**9n,GAS=290n*10n**12n;
const report={scope:'ORC-04 compiled-Wasm Sandbox lifecycle; synthetic fault fixture only',checks:[],transactions:[],sources:{},passed:false};
const check=(name,value)=>{assert(value,name);report.checks.push(name);console.log('PASS',name);};
const failed=tx=>[tx.transaction_outcome,...tx.receipts_outcome].some(r=>r.outcome.status.Failure);
let sandbox;const tmp=await mkdtemp(join(tmpdir(),'hv-expiry-'));
try{
 sandbox=await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});
 const provider=new JsonRpcProvider({url:sandbox.rpcUrl}),g=GenesisAccount.createDefault(),root=new Account(g.accountId,provider,g.privateKey);
 const record=(label,tx)=>report.transactions.push({label,hash:tx.transaction.hash,status:tx.status,receipts:tx.receipts_outcome.map(r=>({id:r.id,executor:r.outcome.executor_id,gas_burnt:r.outcome.gas_burnt,status:r.outcome.status,logs:r.outcome.logs}))});
 const create=async name=>{const k=KeyPair.fromRandom('ed25519'),id=name+'.'+root.accountId;const tx=await root.createAccount({newAccountId:id,publicKey:k.getPublicKey(),nearToTransfer:30n*Q});record('create '+name,tx);assert(!failed(tx));return new Account(id,provider,k.toString());};
 const call=async(a,c,method,args={},deposit=0n,success=true)=>{const tx=await a.signAndSendTransaction({receiverId:c.accountId,actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});record(method,tx);assert.equal(!failed(tx),success,JSON.stringify(tx.status));return tx;};
 const deploy=async(name,file,args)=>{const a=await create(name),code=await readFile(file);report.sources[file]=createHash('sha256').update(code).digest('hex');const tx=await a.signAndSendTransaction({receiverId:a.accountId,actions:[actions.deployContract(code),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});record('deploy '+name,tx);assert(!failed(tx));return a;};
 const view=(a,method,args={})=>provider.callFunction({contractId:a.accountId,method,args,blockQuery:{finality:'final'}});
 const now=async()=>BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
 const advance=async target=>{for(let i=0;i<100;i++){const n=await now();if(n>=target)return;await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:Math.min(100,Number((target-n)/S)+1)});}throw Error('CLOCK_LIMIT');};
 const buyer=await create('buyer'),source=await deploy('source','target/expiry-oracle-artifacts/expiry_source_fixture.wasm',{owner:root.accountId});
 const resolver=await deploy('resolver','target/expiry-oracle-artifacts/expiry_settlement.wasm',{network:'sandbox',registrar:root.accountId,guardian:root.accountId,source:source.accountId});
 const byteCost=(await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
 const core=await deploy('core','target/core-artifacts/clearinghouse.wasm',{network:'sandbox',guardian:root.accountId,oracle:resolver.accountId,oracle_version:'native-trade-twap-v1',storage_byte_cost:byteCost});
 const start=(await now()/S+90n)*S,end=start+1800n*S,policy=await view(resolver,'policy_hash');
 const config={series_id:'expiry',version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:policy,payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'2000000000000',price_scale:'1000000000000',maturity_ns:String(end),mint_cutoff_ns:String(start),observation_window:{start_ns:String(start),end_ns:String(end)},oracle_account_id:resolver.accountId,oracle_version:'native-trade-twap-v1',oracle_config_hash:await view(resolver,'source_hash'),finalization_policy_hash:policy,max_supply:String(100n*Q)};
 report.series=config;
 await call(buyer,resolver,'register_series',{config},Q/10n,false);
 await call(root,resolver,'register_series',{config:{...config,index_definition_hash:'f'.repeat(64)}},Q/10n,false);
 await call(root,resolver,'register_series',{config:{...config,observation_window:{...config.observation_window,start_ns:String(start+S)}}},Q/10n,false);
 await call(root,resolver,'register_series',{config},Q/10n);
 await call(root,resolver,'register_series',{config},Q/10n,false);
 await call(root,resolver,'register_series',{config:{...config,series_id:'missing'}},Q/10n);
 check('registration rejects unauthorized, duplicate, wrong index and wrong window',true);
 const sq=await view(core,'storage_quote');for(const a of [root,buyer])await call(a,core,'storage_deposit',{},BigInt(sq.account_minimum));
 await call(root,core,'create_series',{config},BigInt(sq.series_storage)+BigInt(sq.creation_fee));
 await call(buyer,core,'deposit_collateral',{},2n*Q);await call(buyer,core,'split',{series_id:'expiry',amount:String(2n*Q)},1n);
 await call(buyer,resolver,'request',{series_id:'expiry'},Q/50n,false);
 await call(buyer,resolver,'on_result',{series_id:'expiry',request_id:'1'},0n,false);
 await call(buyer,resolver,'set_pause',{paused:true},0n,false);
 check('pre-expiry execution, forged callback and unprivileged pause fail',true);
 // Maximum admitted 3,000 trades: 599 predecessors and 750ms observations.
 const rows=Array.from({length:3000},(_,j)=>{const i=j-599;return {trade_id:j+1,time:new Date(Number(start/1000000n+BigInt(i)*750n)).toISOString(),price:i<1200?'2.00000000':'4.00000000'};}).reverse();
 const evidence={request:{expiry_seconds:String(end/S)},pages:[{after:null,next_after:String(rows[999].trade_id),body:JSON.stringify(rows.slice(0,1000))},{after:String(rows[999].trade_id),next_after:String(rows[1999].trade_id),body:JSON.stringify(rows.slice(1000,2000))},{after:String(rows[1999].trade_id),next_after:'1',body:JSON.stringify(rows.slice(2000))}]};
 const calculate=e=>JSON.parse(execFileSync('cargo',['+1.97.1','run','--manifest-path','services/expiry-worker/Cargo.toml','--locked','--offline','--quiet'],{input:JSON.stringify(e),maxBuffer:4e6}).toString());
 const calculation=calculate(evidence),valid={calculation,evidence};assert.equal(calculation.price,'3000000000000');
 await writeFile(join(tmp,'evidence.json'),JSON.stringify(evidence));
 const reference=JSON.parse(execFileSync('python3',['services/expiry-worker/reference.py',join(tmp,'evidence.json')]).toString());assert.equal(reference.price,calculation.price);
 await advance(end+S);
 const badCases=[['null',null],['wrong price',{...valid,calculation:{...calculation,price:'3000000000001'}}],['wrong digest',{...valid,calculation:{...calculation,evidence_sha256:'f'.repeat(64)}}],['wrong expiry',{...valid,evidence:{...evidence,request:{expiry_seconds:String(end/S-1n)}}}],['missing page',{...valid,evidence:{...evidence,pages:evidence.pages.slice(0,1)}}]];
 badCases.push(['oversized result',{padding:'x'.repeat(500001)}]);
 const three={...evidence,pages:[{after:null,next_after:String(rows[499].trade_id),body:JSON.stringify(rows.slice(0,500))},{after:String(rows[499].trade_id),next_after:String(rows[999].trade_id),body:JSON.stringify(rows.slice(500,1000))},evidence.pages[1],evidence.pages[2]]};
 badCases.push(['excess pages',{calculation:calculate(three),evidence:three}]);
 for(const[label,output]of badCases){await call(root,source,'set',{output:JSON.stringify(output),failure:false});await call(buyer,resolver,'request',{series_id:'expiry'},Q/50n);const c=await view(resolver,'get_case',{series_id:'expiry'});check(label+' cannot settle and known rejection permits explicit paid retry',c.accepted===null&&c.pending===null&&c.last_result==='REJECTED');}
 await call(root,source,'set',{output:'null',failure:true});await call(buyer,resolver,'request',{series_id:'expiry'},Q/50n,false);check('failed source callback clears only its request',(await view(resolver,'get_case',{series_id:'expiry'})).pending===null);
 await call(buyer,resolver,'request',{series_id:'expiry'},Q/50n-1n,false);
 await call(root,source,'set',{output:JSON.stringify(valid),failure:false});await call(buyer,resolver,'request',{series_id:'expiry'},Q/50n);
 const c=await view(resolver,'get_case',{series_id:'expiry'});check('full raw evidence recomputed inside compiled Wasm',c.accepted?.price===calculation.price&&c.accepted.evidence_sha256===calculation.evidence_sha256);
 await call(buyer,resolver,'request',{series_id:'expiry'},Q/50n,false);
 await call(root,resolver,'set_pause',{paused:true});await call(buyer,resolver,'finalize',{series_id:'expiry'},0n,false);await call(root,resolver,'set_pause',{paused:false});
 await call(buyer,resolver,'finalize',{series_id:'expiry'});await call(buyer,resolver,'finalize',{series_id:'expiry'});check('guarded finalization is immutable and idempotent',(await view(resolver,'get_resolution',{series_id:'expiry'})).price===calculation.price);
 await call(buyer,resolver,'finalize',{series_id:'missing'});check('absent evidence stays delayed',(await view(resolver,'get_resolution',{series_id:'missing'})).state==='RESOLUTION_DELAYED');
 await call(buyer,core,'request_resolution',{series_id:'expiry'});check('existing clearinghouse imports only the matching new profile',(await view(core,'get_series',{series_id:'expiry'})).final_price===calculation.price);
 for(const leg of ['P','N'])await call(buyer,core,'redeem',{series_id:'expiry',leg,amount:String(2n*Q)},1n);
 check('complementary P/N redemptions preserve two NEAR backing',(await view(core,'get_account',{account_id:buyer.accountId})).free===String(2n*Q));
 await call(buyer,core,'request_withdrawal',{amount:String(2n*Q),receiver:buyer.accountId},1n);
 report.tickets=await view(core,'list_tickets',{account_id:buyer.accountId,from_index:0,limit:16});check('withdrawal has a real successful Sandbox receipt',report.tickets[0].state==='SUCCEEDED');
 report.final_case=await view(resolver,'get_case',{series_id:'expiry'});report.reference=reference;report.passed=true;
}finally{
 await sandbox?.tearDown();await rm(tmp,{recursive:true,force:true});
 for(const f of ['contracts/expiry-settlement/src/lib.rs','contracts/test-fixtures/expiry-source/src/lib.rs','contracts/Cargo.lock','services/expiry-worker/src/lib.rs','tests/sandbox/expiry-settlement.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile('research/reports/orc04-expiry-resolver-sandbox.json',JSON.stringify(report,null,2)+'\n');
}
