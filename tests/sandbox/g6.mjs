import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)), Q=10n**24n,GAS=250n*10n**12n;
const artifacts=JSON.parse(await readFile(path.join(ROOT,'target/core-artifacts/manifest.json'))),wasm={};
for(const [file,meta] of Object.entries(artifacts)){wasm[file]=await readFile(path.join(ROOT,'target/core-artifacts',file));assert.equal(createHash('sha256').update(wasm[file]).digest('hex'),meta.sha256);}
const exports=WebAssembly.Module.exports(await WebAssembly.compile(wasm['clearinghouse.wasm'])).map(x=>x.name);
assert(!exports.some(x=>x.startsWith('fault_')));
const evidence={scope:'G6 VLT-01 Sandbox basket mechanics only; no selected tracking policy or keeper',versions:{rust:'1.96.0',near_sdk:'5.30.1',near_api_js:'7.4.0',near_sandbox_js:'0.3.5',node:process.version,sandbox:'2.14.0'},artifacts,seed:'0x61b1',checks:[],transactions:[],events:[]};
async function hashes(dir,prefix){const out={};for(const e of await readdir(dir,{withFileTypes:true})){if(['target','node_modules','__pycache__'].includes(e.name))continue;const key=path.posix.join(prefix,e.name),full=path.join(dir,e.name);if(e.isDirectory())Object.assign(out,await hashes(full,key));else if(/\.(rs|toml|lock|mjs|json|py)$/.test(e.name))out[key]=createHash('sha256').update(await readFile(full)).digest('hex');}return out;}
evidence.sources={...await hashes(path.join(ROOT,'contracts'),'contracts'),...await hashes(path.join(ROOT,'crates/protocol-types'),'crates/protocol-types'),...await hashes(path.join(ROOT,'crates/payoff-math'),'crates/payoff-math')};
for(const file of ['tests/sandbox/g6.mjs','tests/sandbox/package.json','tests/sandbox/package-lock.json','scripts/build-core.py','packages/shared-schemas/public-ledger.schema.json'])evidence.sources[file]=createHash('sha256').update(await readFile(path.join(ROOT,file))).digest('hex');
evidence.base_commit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const reportFile=process.argv[2]==='--report'?process.argv[3]:'research/reports/g6-vault.json';
if(!reportFile)throw Error('missing --report path');
let sandbox,provider,byteCost;
const eventBalances=new Map(),seenOps=new Set();
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);evidence.checks.push(name);console.log('PASS',name);};
const outcomes=tx=>[tx.transaction_outcome,...tx.receipts_outcome];
const failed=tx=>outcomes(tx).some(x=>x.outcome.status.Failure);
const assetId=a=>a.kind==='COLLATERAL'?'COLLATERAL':a.kind==='VAULT_SHARE'?`VAULT_SHARE:${a.vault_id}`:`${a.kind}:${a.series_id}`;
function record(label,tx){
  evidence.transactions.push({label,hash:tx.transaction.hash,status:tx.status,gas_burnt:outcomes(tx).reduce((s,r)=>s+BigInt(r.outcome.gas_burnt),0n).toString(),receipts:tx.receipts_outcome.map(r=>({id:r.id,executor:r.outcome.executor_id,status:r.outcome.status,gas_burnt:String(r.outcome.gas_burnt)}))});
  for(const r of tx.receipts_outcome){if(r.outcome.status.Failure)continue;for(const log of r.outcome.logs){if(!log.startsWith('EVENT_JSON:'))continue;const envelope=JSON.parse(log.slice(11));if(envelope.standard!=='hedgeveil')continue;
    for(const e of envelope.data){assert.equal(e.domain.contract_id,r.outcome.executor_id);assert(!seenOps.has(e.operation_id),'duplicate operation');seenOps.add(e.operation_id);evidence.events.push({receipt_id:r.id,event:e});
      for(const d of e.deltas){const key=JSON.stringify([e.domain.contract_id,d.account_id,d.bucket,d.ledger_id,assetId(d.asset)]);const n=(eventBalances.get(key)??0n)+(d.direction==='CREDIT'?1n:-1n)*BigInt(d.amount);assert(n>=0n,'event replay underflow');eventBalances.set(key,n);}
    }
  }}
}
async function call(who,c,method,args={},deposit=0n,expect='success'){
 const tx=await who.signAndSendTransaction({receiverId:c.accountId,actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});record(`${c.accountId}.${method}`,tx);
 if(expect==='success')assert(!failed(tx),`${method}: ${JSON.stringify(tx.status)}`);else if(expect==='failure')assert(failed(tx),`expected failure: ${method}`);return tx;
}
const view=(c,method,args={})=>provider.callFunction({contractId:c.accountId,method,args,blockQuery:{finality:'final'}});
async function create(root,name,balance=50n*Q){const key=KeyPair.fromRandom('ed25519'),id=`${name}.${root.accountId}`;const tx=await root.createAccount({newAccountId:id,publicKey:key.getPublicKey(),nearToTransfer:balance});assert(!failed(tx));return new Account(id,provider,key.toString());}
async function deploy(root,name,file,args){const c=await create(root,name);const tx=await c.signAndSendTransaction({receiverId:c.accountId,actions:[actions.deployContract(wasm[file]),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});record(`deploy:${name}`,tx);assert(!failed(tx),JSON.stringify(tx.status));return c;}
async function now(){return BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);}
async function advancePast(t){for(let i=0;i<150;i++){if(await now()>=t)return;await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:1000});}throw Error('clock deadline not reached');}
function config(id,end,oracle){return {series_id:id,version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:'1'.repeat(64),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'2000000000000',price_scale:'1000000000000',maturity_ns:String(end),mint_cutoff_ns:String(end-60_000_000_000n),observation_window:{start_ns:String(end-300_000_000_000n),end_ns:String(end)},oracle_account_id:oracle.accountId,oracle_version:'fixture-v1',oracle_config_hash:'2'.repeat(64),finalization_policy_hash:'3'.repeat(64),max_supply:String(100n*Q)};}
async function replayMatches(c){
 const snapshot=await view(c,'custody_snapshot'),ids=await view(c,'list_accounts',{from_index:0,limit:16}),series=await view(c,'list_series',{from_index:0,limit:16});
 const expected=new Map();const put=(owner,bucket,id,asset,amount)=>{if(BigInt(amount)>0n)expected.set(JSON.stringify([c.accountId,owner,bucket,id,asset]),BigInt(amount));};
 for(const id of ids){const a=await view(c,'get_account',{account_id:id});put(id,'FREE','account','COLLATERAL',a.free);put(id,'STORAGE','account','COLLATERAL',a.storage_paid);for(const s of series){const p=a.positions[s.slot];put(id,'FREE',s.config.series_id,`P:${s.config.series_id}`,p.p);put(id,'FREE',s.config.series_id,`N:${s.config.series_id}`,p.n);}for(const t of await view(c,'list_tickets',{account_id:id,from_index:0,limit:16})){if(['PENDING','UNKNOWN'].includes(t.state))put(id,'WITHDRAWAL',`w-${t.id}`,'COLLATERAL',t.amount);}}
 for(const s of series){put(c.accountId,'SERIES_RESERVE',s.config.series_id,'COLLATERAL',s.reserve);put(c.accountId,'SUPPLY',s.config.series_id,`P:${s.config.series_id}`,s.outstanding_p);put(c.accountId,'SUPPLY',s.config.series_id,`N:${s.config.series_id}`,s.outstanding_n);}
 put(c.accountId,'STORAGE','series','COLLATERAL',snapshot.series_storage_fund);put(c.accountId,'FEE','protocol','COLLATERAL',snapshot.fees);put(c.accountId,'OPERATING','bootstrap','COLLATERAL',snapshot.operating_allocation);
 const v=await view(c,'get_vault');if(v){put(c.accountId,'STORAGE','vault','COLLATERAL',snapshot.vault_storage_fund);for(const l of v.holdings)put(c.accountId,'VAULT',v.vault_id,assetId(l.asset),l.amount);for(const [owner,n] of Object.entries(v.holders))put(owner,'FREE',v.vault_id,`VAULT_SHARE:${v.vault_id}`,n);put(c.accountId,'SUPPLY',v.vault_id,`VAULT_SHARE:${v.vault_id}`,v.supply);}
 const actual=new Map([...eventBalances].filter(([k,n])=>JSON.parse(k)[0]===c.accountId&&n>0n));assert.deepEqual(actual,expected,'canonical event replay equals state');return snapshot;
}
let core,alice,bob,empty;
const leg=(kind,amount,series_id)=>({asset:kind==='COLLATERAL'?{kind}:{kind,series_id},amount:String(amount)});
let seed,held,supply=0n,owners=new Map();
const args=(shares,limits)=>({vault_id:'basket',shares:String(shares),...(limits?{max_inputs:limits}:{min_outputs:seed.map(l=>({...l,amount:'0'}))})});
async function snapshot(){return {vault:await view(core,'get_vault'),accounts:await Promise.all([alice,bob,empty].map(a=>view(core,'get_account',{account_id:a.accountId}))),series:await view(core,'list_series',{from_index:0,limit:16}),fees:(await view(core,'custody_snapshot')).fees};}
async function reject(who,method,params,deposit=1n){const before=await snapshot();await call(who,core,method,params,deposit,'failure');assert.deepEqual(await snapshot(),before,'failure rollback');}
async function compare(){const v=await view(core,'get_vault');assert.equal(v.supply,String(supply));assert.deepEqual(v.holdings.map(l=>BigInt(l.amount)),held);assert.deepEqual(v.holders,Object.fromEntries([...owners].filter(([,n])=>n>0n).map(([k,n])=>[k,String(n)])));await replayMatches(core);}
async function mint(who,n){const inputs=supply===0n?seed.map(l=>BigInt(l.amount)):held.map(h=>(h*n+supply-1n)/supply);const limits=seed.map((l,i)=>({...l,amount:String(inputs[i])}));await call(who,core,'vault_mint_basket',args(n,limits.reverse()),1n);held=held.map((h,i)=>h+inputs[i]);supply+=n;owners.set(who.accountId,(owners.get(who.accountId)||0n)+n);await compare();}
async function exit(who,n){const outputs=held.map(h=>n===supply?h:h*n/supply);await call(who,core,'vault_redeem_in_kind',args(n),1n);held=held.map((h,i)=>h-outputs[i]);supply-=n;owners.set(who.accountId,owners.get(who.accountId)-n);await compare();}
try{
 sandbox=await Sandbox.start({version:'2.14.0'});assert.equal(new URL(sandbox.rpcUrl).hostname,'127.0.0.1');provider=new JsonRpcProvider({url:sandbox.rpcUrl});const g=GenesisAccount.createDefault(),root=new Account(g.accountId,provider,g.privateKey);
 alice=await create(root,'alice');bob=await create(root,'bob');empty=await create(root,'empty');
 byteCost=BigInt((await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte);
 const oracle=await deploy(root,'oracle','oracle-fixture.wasm',{owner:root.accountId});core=await deploy(root,'core','clearinghouse.wasm',{network:'sandbox',guardian:alice.accountId,oracle:oracle.accountId,oracle_version:'fixture-v1',storage_byte_cost:String(byteCost)});
 const storage=BigInt((await view(core,'storage_quote')).account_minimum),pay=storage+Q/1000n;
 for(const a of [alice,bob,empty])await call(a,core,'storage_deposit',{},storage);
 for(const a of [alice,bob])await call(a,core,'deposit_collateral',{},Q);
 const end=await now()+600_000_000_000n,configs=[];
 for(let i=0;i<5;i++){const c=config(`s${i}`,end,oracle);configs.push(c);await call(alice,core,'create_series',{config:c},pay);for(const a of [alice,bob])await call(a,core,'split',{series_id:c.series_id,amount:'10000'},1n);}
 seed=[leg('COLLATERAL',7),...Array.from({length:4},(_,i)=>[leg('P',[11,17,23,31][i],`s${i}`),leg('N',[13,19,29,37][i],`s${i}`)]).flat()];held=seed.map(()=>0n);
 const createArgs={vault_id:'basket',seed,initial_shares:'100'};
 await reject(bob,'create_vault',createArgs,storage+1n);
 await reject(alice,'create_vault',{...createArgs,seed:[seed[0]]},storage+1n);
 await reject(alice,'create_vault',{...createArgs,seed:[seed[1],seed[1]]},storage+1n);
 await reject(alice,'create_vault',{...createArgs,seed:Array.from({length:5},(_,i)=>leg('P',1,`s${i}`))},storage+1n);
 await reject(alice,'create_vault',createArgs,1n);
 await call(alice,core,'create_vault',createArgs,storage+1n);await compare();
 check('creation enforces authority, seed bounds and separate storage',(await view(core,'custody_snapshot')).vault_storage_fund,String(storage));
 await reject(alice,'create_vault',createArgs,storage+1n);
 await reject(alice,'vault_mint_basket',args(99n,seed));
 await reject(empty,'vault_mint_basket',args(100n,seed));
 await reject(alice,'vault_mint_basket',args(100n,seed.slice(1)));
 await reject(alice,'vault_mint_basket',args(100n,[seed[0],...seed.slice(0,8)]));
 await reject(alice,'vault_mint_basket',args(100n,seed.map((l,i)=>i===8?{...l,amount:'1'}:l)));
 await mint(alice,100n);check('exact bootstrap and maximum nine-asset basket reconcile',true,true);
 await reject(bob,'vault_mint_basket',args(1n,seed));
 await reject(bob,'vault_mint_basket',args(100n*Q,seed));
 await reject(alice,'vault_redeem_in_kind',args(1n));
 await reject(bob,'vault_redeem_in_kind',args(1n));
 await reject(alice,'vault_redeem_in_kind',{...args(10n),min_outputs:seed});
 await mint(bob,50n);check('ceil inputs and floor outputs agree with independent integer model',true,true);
 const beforeDonation=await view(core,'get_vault');await root.transfer({receiverId:core.accountId,amount:Q});await call(bob,core,'deposit_collateral',{},Q);check('native donations and ledger deposits do not change managed basket',await view(core,'get_vault'),beforeDonation);
 await reject(bob,'transfer_vault_shares',{vault_id:'basket',shares:'1',receiver:'missing.sandbox'});
 await reject(bob,'transfer_vault_shares',{vault_id:'basket',shares:'1',receiver:bob.accountId});
 await call(alice,core,'transfer_vault_shares',{vault_id:'basket',shares:'1',receiver:empty.accountId},1n);owners.set(alice.accountId,99n);owners.set(empty.accountId,1n);await compare();
 await reject(empty,'unregister',{});await call(empty,core,'transfer_vault_shares',{vault_id:'basket',shares:'1',receiver:alice.accountId},1n);owners.set(alice.accountId,100n);owners.set(empty.accountId,0n);await compare();
 check('share ownership blocks unregister and cannot transfer to unregistered receiver',true,true);
 // Fill all registered holder slots using maximum-length account IDs.
 const extra=[empty];for(let i=0;i<13;i++){const prefix=`holder-${i}-`;const a=await create(root,prefix+'x'.repeat(56-prefix.length));await call(a,core,'storage_deposit',{},storage);extra.push(a);}
 for(const a of extra){await call(alice,core,'transfer_vault_shares',{vault_id:'basket',shares:'1',receiver:a.accountId},1n);owners.set(alice.accountId,owners.get(alice.accountId)-1n);owners.set(a.accountId,1n);}
 await compare();check('16 holders including maximum-length accounts fit prepaid storage',Object.keys((await view(core,'get_vault')).holders).length,16);
 for(const a of extra){await call(a,core,'transfer_vault_shares',{vault_id:'basket',shares:'1',receiver:alice.accountId},1n);owners.set(alice.accountId,owners.get(alice.accountId)+1n);owners.set(a.accountId,0n);}
 await compare();
 // Deterministic varied mint/exit sequence, checked independently after each receipt.
 let rng=0x61b1;for(let i=0;i<24;i++){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const a=i%2?alice:bob,n=BigInt(10+rng%10);if(i%3===0||(owners.get(a.accountId)||0n)<=n+10n)await mint(a,n);else await exit(a,n);}
 check('24 varied proportional operations conserve holdings and share supply',true,true);
 await reject(bob,'set_vault_mint_pause',{paused:true});await call(alice,core,'set_vault_mint_pause',{paused:true},1n);await reject(bob,'vault_mint_basket',args(10n,seed));
 await call(alice,core,'set_market_pause',{paused:true},1n);await call(alice,core,'set_pauses',{pauses:{deposits:true,series:true,splits:true}},1n);
 await exit(bob,10n);check('paused mints, markets and deposits preserve in-kind exit',true,true);
 await call(alice,core,'set_vault_mint_pause',{paused:false},1n);await advancePast(end+1n);
 await reject(bob,'vault_mint_basket',args(10n,seed));await exit(alice,10n);
 check('matured unresolved claims disable inflows but remain withdrawable in kind',true,true);
 const cfg=configs[0];await call(root,oracle,'set_report',{series_id:cfg.series_id,report:{config:cfg,state:'FINALIZED',price:'1000000000000'}});await call(alice,core,'request_resolution',{series_id:cfg.series_id});
 await reject(alice,'vault_mint_basket',args(10n,seed));
 await exit(bob,owners.get(bob.accountId));const last=held.map(String);await exit(alice,owners.get(alice.accountId));
 check('last holder receives all remaining dust and closes vault',[supply,held,(await view(core,'get_vault')).closed],[0n,seed.map(()=>0n),true]);evidence.last_holder_outputs=last;
 await reject(alice,'vault_mint_basket',args(100n,seed));await reject(alice,'create_vault',createArgs,storage+1n);
 await call(alice,core,'redeem',{series_id:'s0',leg:'N',amount:'1'},1n);await call(alice,core,'redeem',{series_id:'s0',leg:'P',amount:'1'},1n);
 check('finalized claims returned by exit remain redeemable including zero-payout leg',true,true);
 evidence.custody=await replayMatches(core);check('all ledger events reconcile custody and shares',evidence.custody.retained_categories_covered,true);
 const risk=await view(core,'vault_risk');check('no selected policy, fake NAV or keeper authority',[risk.reason,risk.nav,risk.keeper_enabled],['POLICY_UNSELECTED',null,false]);evidence.risk=risk;
 const testnet=await deploy(root,'testnet-domain','clearinghouse.wasm',{network:'testnet',guardian:alice.accountId,oracle:oracle.accountId,oracle_version:'fixture-v1',storage_byte_cost:String(byteCost)});await call(alice,testnet,'create_vault',createArgs,storage+1n,'failure');check('experimental basket creation rejects testnet domain',await view(testnet,'get_vault'),null);
 await writeFile(path.join(ROOT,'target/g6-events.json'),JSON.stringify(evidence.events.map(x=>x.event)));
 execFileSync('uv',['run','--offline','--with','jsonschema==4.23.0','python','-c',"import sys,json;sys.path.insert(0,'packages/shared-schemas');from validate import validate;[validate(e) for e in json.load(open('target/g6-events.json'))]"],{cwd:ROOT,env:{...process.env,UV_CACHE_DIR:'/private/tmp/hedgeveil-uv-cache'},stdio:'pipe'});
 check('actual receipt events validate generated schema',true,true);evidence.runtime=await provider.viewNodeStatus();assert.equal(evidence.runtime.version.version,'2.14.0');evidence.passed=true;
 await writeFile(path.join(ROOT,reportFile),JSON.stringify(evidence,null,2)+'\n');console.log(`G6: ${evidence.checks.length} checks, ${evidence.transactions.length} transactions, ${evidence.events.length} events`);
}catch(error){evidence.passed=false;evidence.error=String(error);await writeFile(path.join(ROOT,'target/g6-failed.json'),JSON.stringify(evidence,null,2)+'\n');throw error;}finally{if(sandbox)await sandbox.tearDown();}
