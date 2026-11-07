import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),Q=10n**24n,GAS=280n*10n**12n;
const artifacts=JSON.parse(await readFile(path.join(ROOT,'target/oracle-artifacts/manifest.json'))),wasm={};
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [name,meta] of Object.entries(artifacts)){wasm[name]=await readFile(path.join(ROOT,'target/oracle-artifacts',name));assert.equal(sha(wasm[name]),meta.sha256);}
const exports=WebAssembly.Module.exports(await WebAssembly.compile(wasm['settlement-oracle.wasm'])).map(x=>x.name);
assert(!exports.some(x=>x.startsWith('fault_')));
const evidence={scope:'G4 synthetic demo oracle and collector, ephemeral local Sandbox only',versions:{rust:'1.96.0',near_sdk:'5.30.1',sandbox:'2.14.0',node:process.version},artifacts,checks:[],transactions:[],events:[],bundles:{}};
async function hashes(dir,prefix){const out={};for(const e of await readdir(dir,{withFileTypes:true})){if(['target','node_modules','__pycache__'].includes(e.name))continue;const f=path.join(dir,e.name),key=path.posix.join(prefix,e.name);if(e.isDirectory())Object.assign(out,await hashes(f,key));else if(/\.(rs|toml|lock|mjs|json|py)$/.test(e.name))out[key]=sha(await readFile(f));}return out;}
evidence.sources={...await hashes(path.join(ROOT,'contracts'),'contracts'),...await hashes(path.join(ROOT,'crates/protocol-types'),'crates/protocol-types'),...await hashes(path.join(ROOT,'services/observation-collector'),'services/observation-collector')};
for(const f of ['scripts/build-oracle.py','tests/sandbox/g4.mjs','tests/sandbox/package.json','tests/sandbox/package-lock.json','fixtures/synthetic-prices/g4-demo.json','packages/shared-schemas/oracle.schema.json','packages/shared-schemas/build_oracle_schema.py','tests/oracle/test_collector.py'])evidence.sources[f]=sha(await readFile(path.join(ROOT,f)));
evidence.base_commit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
let sandbox,provider,root,oracle,core,alice,bob,judge,sink,publishers,byteCost;
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);evidence.checks.push(name);console.log('PASS',name);};
const outcomes=t=>[t.transaction_outcome,...t.receipts_outcome],failed=t=>outcomes(t).some(r=>r.outcome.status.Failure);
const sequences=new Map();
function record(label,tx){evidence.transactions.push({label,hash:tx.transaction.hash,status:tx.status,gas_burnt:outcomes(tx).reduce((s,r)=>s+BigInt(r.outcome.gas_burnt),0n).toString(),receipts:tx.receipts_outcome.map(r=>({id:r.id,executor:r.outcome.executor_id,status:r.outcome.status,gas_burnt:String(r.outcome.gas_burnt)}))});
 for(const r of tx.receipts_outcome){if(r.outcome.status.Failure)continue;for(const log of r.outcome.logs){if(!log.startsWith('EVENT_JSON:'))continue;const event=JSON.parse(log.slice(11));if(event.standard!=='hedgeveil_oracle')continue;const d=event.data[0],previous=sequences.get(r.outcome.executor_id)||0n;assert.equal(BigInt(d.sequence),previous+1n);sequences.set(r.outcome.executor_id,BigInt(d.sequence));assert.equal(BigInt(d.received),BigInt(d.paid)+BigInt(d.locked)+BigInt(d.credits)+BigInt(d.in_flight));evidence.events.push({receipt_id:r.id,contract:r.outcome.executor_id,event});}}
}
async function call(who,c,method,args={},deposit=0n,expect='success'){
 const tx=await who.signAndSendTransaction({receiverId:c.accountId,actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});record(`${c.accountId}.${method}`,tx);
 if(expect==='success')assert(!failed(tx),`${method}: ${JSON.stringify(tx.status)} ${JSON.stringify(tx.receipts_outcome.filter(r=>r.outcome.status.Failure))}`);else if(expect==='failure')assert(failed(tx),`expected failure ${method}`);return tx;
}
const view=(c,method,args={})=>provider.callFunction({contractId:c.accountId,method,args,blockQuery:{finality:'final'}});
async function create(name,balance=50n*Q){const key=KeyPair.fromRandom('ed25519'),id=`${name}.${root.accountId}`;const tx=await root.createAccount({newAccountId:id,publicKey:key.getPublicKey(),nearToTransfer:balance});assert(!failed(tx));return new Account(id,provider,key.toString());}
async function deploy(name,file,args){const c=await create(name);const tx=await c.signAndSendTransaction({receiverId:c.accountId,actions:[actions.deployContract(wasm[file]),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});record(`deploy:${name}`,tx);assert(!failed(tx),JSON.stringify(tx.status));return c;}
const now=async()=>BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
async function advance(t){for(let i=0;i<2000;i++){const n=await now();if(n>=t)return;await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:Math.min(100,Number((t-n)/1_000_000_000n)+1)});}throw Error('time advancement exhausted');}
async function materialize(id,c,start){const request={series_id:id,oracle:c.accountId,start_ns:String(start),publishers:publishers.map(p=>p.accountId),arbitrator:judge.accountId};const file=path.join(ROOT,'target/g4-request.json');await writeFile(file,JSON.stringify(request));const result=JSON.parse(execFileSync('python3',['services/observation-collector/collector.py','materialize','--request',file,'--archive',path.join(ROOT,'target/g4-observations')],{cwd:ROOT,encoding:'utf8'}));const replay=JSON.parse(execFileSync('python3',['services/observation-collector/collector.py','replay',result.manifest],{cwd:ROOT,encoding:'utf8'}));assert.deepEqual(replay.bundle,result.bundle);assert.deepEqual(replay.observations,result.observations);evidence.bundles[`${c.accountId}/${id}`]=result.bundle;return result;}
async function publish(result,c,group){for(let i=group==='PRIMARY'?0:3;i<(group==='PRIMARY'?3:6);i++)await call(publishers[i],c,'publish',{evidence:result.bundle.evidence[i]},1n);const id=result.bundle.registration.config.series_id;check(`${c.accountId}/${id} ${group} matches restarted collector`,await view(c,'get_observation',{series_id:id,route:group}),result.observations[group]);}
async function propose(result,c,who=alice,route='PRIMARY',wrong=false){const series_id=result.bundle.registration.config.series_id,o=result.observations[route];await call(who,c,'propose',{series_id,route,price:wrong?'3000000000000':o.price,evidence_hash:o.evidence_hash},Q/10n);}
async function reconcile(c){const s=await view(c,'custody'),cases=await view(c,'list_series'),accounts=await view(c,'list_accounts'),tickets=await view(c,'list_tickets');let locked=0n,credits=0n,pending=0n,unknown=0n;for(const id of cases){const x=await view(c,'get_case',{series_id:id});if(!x.bonds_released)locked+=BigInt(x.proposal?.claim.bond||0)+BigInt(x.challenge?.bond||0);}for(const id of accounts)credits+=BigInt((await view(c,'get_account',{account_id:id})).credit);for(const t of tickets){if(t.state==='PENDING')pending+=BigInt(t.amount);if(t.state==='UNKNOWN')unknown+=BigInt(t.amount);}assert.deepEqual([String(locked),String(credits),String(pending),String(unknown)],[s.locked,s.credits,s.pending,s.unknown]);assert.equal(BigInt(s.received),BigInt(s.paid)+locked+credits+pending+unknown);assert(s.retained_covered);return s;}
try{
 await mkdir(path.join(ROOT,'target'),{recursive:true});sandbox=await Sandbox.start({version:'2.14.0'});assert.equal(new URL(sandbox.rpcUrl).hostname,'127.0.0.1');provider=new JsonRpcProvider({url:sandbox.rpcUrl});const genesis=GenesisAccount.createDefault();root=new Account(genesis.accountId,provider,genesis.privateKey);
 alice=await create('alice');bob=await create('bob');judge=await create('judge');sink=await create('sink');publishers=[];for(let i=0;i<6;i++)publishers.push(await create(`publisher-${i}`));
 byteCost=BigInt((await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte);
 const init={network:'sandbox',registrar:root.accountId,treasury:root.accountId,storage_byte_cost:String(byteCost)};
 oracle=await deploy('oracle','settlement-oracle.wasm',init);
 core=await deploy('core','clearinghouse.wasm',{network:'sandbox',guardian:alice.accountId,oracle:oracle.accountId,oracle_version:'demo-v1',storage_byte_cost:String(byteCost)});
 check('normal oracle artifact excludes fault methods',exports.some(x=>x.startsWith('fault_')),false);
 const accountCost=4096n*byteCost,seriesCost=32768n*byteCost;
 await call(alice,oracle,'register_account',{},accountCost-1n,'failure');for(const a of [root,alice,bob])await call(a,oracle,'register_account',{},accountCost);
 await call(alice,oracle,'register_account',{},accountCost,'failure');check('storage cannot be withdrawn as bond credit',(await view(oracle,'get_account',{account_id:alice.accountId})).credit,'0');
 const cq=await view(core,'storage_quote');await call(alice,core,'storage_deposit',{},BigInt(cq.account_minimum));await call(alice,core,'deposit_collateral',{},5n*Q);
 const start=await now()+600_000_000_000n,items={};
 for(const id of ['alpha','beta','gamma','delta','epsilon','zeta','eta','theta']){
  const item=await materialize(id,oracle,start);items[id]=item;
  if(id==='alpha'){
   await call(bob,oracle,'register_series',item.bundle.registration,seriesCost,'failure');
   const bad=structuredClone(item.bundle.registration);bad.config.oracle_config_hash='f'.repeat(64);await call(root,oracle,'register_series',bad,seriesCost,'failure');
  }
  await call(root,oracle,'register_series',item.bundle.registration,seriesCost);
  await call(alice,core,'create_series',{config:item.bundle.registration.config},BigInt(cq.series_storage)+BigInt(cq.creation_fee));
 }
 check('eight immutable series registered',(await view(oracle,'list_series')).length,8);
 await call(root,oracle,'register_series',items.alpha.bundle.registration,seriesCost,'failure');
 check('pre-maturity resolution is OPEN',(await view(oracle,'get_resolution',{series_id:'alpha'})).state,'OPEN');
 for(const id of ['alpha','beta','epsilon','zeta'])await call(alice,core,'split',{series_id:id,amount:String(Q)},1n);
 await call(publishers[0],oracle,'publish',{evidence:items.alpha.bundle.evidence[0]},1n,'failure');
 await advance(BigInt(items.alpha.bundle.registration.config.maturity_ns));
 const e=items.alpha.bundle.evidence[0];await call(bob,oracle,'publish',{evidence:e},1n,'failure');
 for(const mutate of [x=>x.quote='NEAR',x=>x.samples[0].price='0',x=>x.samples[0].timestamp_ns='1',x=>x.samples.pop(),x=>x.samples[0].price='5000000000000',x=>x.dataset_hash='f'.repeat(64),x=>x.samples[1].timestamp_ns=x.samples[0].timestamp_ns]){const bad=structuredClone(e);mutate(bad);await call(publishers[0],oracle,'publish',{evidence:bad},1n,'failure');}
 await publish(items.alpha,oracle,'PRIMARY');await call(publishers[0],oracle,'publish',{evidence:e},1n,'failure');
 check('source forgery, equivocation, units, stale samples and incomplete coverage reject',Object.keys((await view(oracle,'get_case',{series_id:'alpha'})).evidence).length,3);
 await propose(items.alpha,oracle);await call(bob,oracle,'finalize',{series_id:'alpha'},0n,'failure');
 await call(alice,core,'request_resolution',{series_id:'alpha'});check('proposed oracle price cannot settle core',(await view(core,'get_series',{series_id:'alpha'})).final_price,null);
 await publish(items.beta,oracle,'PRIMARY');await publish(items.beta,oracle,'FALLBACK');await propose(items.beta,oracle,alice,'PRIMARY',true);
 await call(bob,oracle,'challenge',{series_id:'beta',...items.beta.observations.FALLBACK},Q/10n-1n,'failure');await call(bob,oracle,'challenge',{series_id:'beta',...items.beta.observations.FALLBACK},Q/10n);
 await call(alice,oracle,'adjudicate',{series_id:'beta',route:'FALLBACK'},1n,'failure');await call(alice,oracle,'finalize',{series_id:'beta'},0n,'failure');
 await call(judge,oracle,'adjudicate',{series_id:'beta',route:'FALLBACK'},1n);
 check('winning challenger receives both bonds',(await view(oracle,'get_account',{account_id:bob.accountId})).credit,String(Q/5n));
 await publish(items.theta,oracle,'PRIMARY');await propose(items.theta,oracle);await call(bob,oracle,'challenge',{series_id:'theta',price:'3000000000000',evidence_hash:'f'.repeat(64)},Q/10n);await call(judge,oracle,'adjudicate',{series_id:'theta',route:'PRIMARY'},1n);
 check('failed challenge rewards proposer',(await view(oracle,'get_account',{account_id:alice.accountId})).credit,String(Q/5n));
 await publish(items.delta,oracle,'PRIMARY');await propose(items.delta,oracle,alice,'PRIMARY',true);
 await publish(items.zeta,oracle,'PRIMARY');await propose(items.zeta,oracle);await call(bob,oracle,'challenge',{series_id:'zeta',price:'3000000000000',evidence_hash:'f'.repeat(64)},Q/10n);
 await call(alice,core,'request_resolution',{series_id:'zeta'});check('disputed oracle leaves core pending',(await view(core,'get_series',{series_id:'zeta'})).final_price,null);
 await publish(items.gamma,oracle,'FALLBACK');await call(alice,oracle,'propose',{series_id:'gamma',route:'FALLBACK',...items.gamma.observations.FALLBACK},Q/10n,'failure');
 await advance(BigInt((await view(oracle,'get_case',{series_id:'alpha'})).proposal.challenge_end));
 await call(bob,oracle,'finalize',{series_id:'alpha'});await call(bob,oracle,'finalize',{series_id:'alpha'});
 check('undisputed finality uses committed historical median',(await view(oracle,'get_resolution',{series_id:'alpha'})).price,'4000000000000');
 await call(judge,oracle,'adjudicate',{series_id:'alpha',route:'FALLBACK'},1n,'failure');
 await call(bob,oracle,'challenge',{series_id:'alpha',price:'3000000000000',evidence_hash:'f'.repeat(64)},Q/10n,'failure');
 await call(alice,core,'request_resolution',{series_id:'alpha'});await call(alice,core,'request_resolution',{series_id:'beta'});
 check('actual core callback imports oracle results',[(await view(core,'get_series',{series_id:'alpha'})).final_price,(await view(core,'get_series',{series_id:'beta'})).final_price],['4000000000000','2400000000000']);
 const free=BigInt((await view(core,'get_account',{account_id:alice.accountId})).free);await call(alice,core,'redeem',{series_id:'alpha',leg:'P',amount:String(Q)},1n);await call(alice,core,'redeem',{series_id:'alpha',leg:'N',amount:String(Q)},1n);
 check('P/N redeem exact backed pair after real import',BigInt((await view(core,'get_account',{account_id:alice.accountId})).free)-free,Q);
 await call(alice,oracle,'finalize',{series_id:'delta'},0n,'failure');
 await call(alice,core,'merge',{series_id:'epsilon',amount:String(Q)},1n);check('pair merge remains available without oracle',(await view(core,'get_series',{series_id:'epsilon'})).reserve,'0');
 const maturity=BigInt(items.alpha.bundle.registration.config.maturity_ns);
 await advance(maturity+600_000_000_000n);await propose(items.gamma,oracle,alice,'FALLBACK');
 await advance(BigInt((await view(oracle,'get_case',{series_id:'gamma'})).proposal.challenge_end));await call(bob,oracle,'finalize',{series_id:'gamma'});
 check('fallback settles same historical window',(await view(oracle,'get_resolution',{series_id:'gamma'})).price,'2400000000000');
 await advance(maturity+1_200_000_000_000n);await call(judge,oracle,'adjudicate',{series_id:'delta',route:'PRIMARY'},1n);
 check('invalid unchallenged proposal cannot bypass evidence; bond slashed',(await view(oracle,'get_account',{account_id:root.accountId})).credit,String(Q/10n));
 await publish(items.eta,oracle,'FALLBACK');await call(judge,oracle,'adjudicate',{series_id:'eta',route:'FALLBACK'},1n);
 check('precommitted arbitration can resolve missed proposal stages',(await view(oracle,'get_resolution',{series_id:'eta'})).price,'2400000000000');
 await call(judge,oracle,'adjudicate',{series_id:'epsilon',route:'PRIMARY'},1n,'failure');await call(bob,oracle,'mark_delayed',{series_id:'epsilon'},0n,'failure');
 const ac=BigInt((await view(oracle,'get_account',{account_id:alice.accountId})).credit),bc=BigInt((await view(oracle,'get_account',{account_id:bob.accountId})).credit);
 await advance(maturity+1_800_000_000_000n);for(const id of ['epsilon','zeta'])await call(bob,oracle,'mark_delayed',{series_id:id});await call(bob,oracle,'mark_delayed',{series_id:'zeta'});
 check('arbitration outage refunds bonds once to original credits',[BigInt((await view(oracle,'get_account',{account_id:alice.accountId})).credit)-ac,BigInt((await view(oracle,'get_account',{account_id:bob.accountId})).credit)-bc],[Q/10n,Q/10n]);
 await call(judge,oracle,'adjudicate',{series_id:'zeta',route:'PRIMARY'},1n,'failure');await call(alice,core,'request_resolution',{series_id:'zeta'});check('delayed settlement creates no price',(await view(core,'get_series',{series_id:'zeta'})).final_price,null);
 // Native credit payouts, real failure, owner authorization and bounded retained tickets.
 let tid=(await view(oracle,'custody')).next_ticket,old=await sink.getBalance();await call(bob,oracle,'withdraw_credit',{amount:'100',receiver:sink.accountId},1n);check('bond credit reaches actual recipient',(await sink.getBalance())-old,100n);
 await call(alice,oracle,'close_ticket',{ticket_id:tid},1n,'failure');await call(bob,oracle,'close_ticket',{ticket_id:tid},1n);
 const credit=(await view(oracle,'get_account',{account_id:bob.accountId})).credit;tid=(await view(oracle,'custody')).next_ticket;await call(bob,oracle,'withdraw_credit',{amount:'100',receiver:'missing.sandbox'},1n,'mixed');check('failed bond withdrawal restores only original credit',(await view(oracle,'get_account',{account_id:bob.accountId})).credit,credit);await call(bob,oracle,'close_ticket',{ticket_id:tid},1n);
 await call(alice,oracle,'on_credit_result',{ticket_id:'0',version:1,fault:0},0n,'failure');
 for(let i=0;i<32;i++)await call(root,oracle,'withdraw_credit',{amount:'1',receiver:sink.accountId},1n);
 const capCredit=(await view(oracle,'get_account',{account_id:root.accountId})).credit;await call(root,oracle,'withdraw_credit',{amount:'1',receiver:sink.accountId},1n,'failure');check('ticket-cap failure rolls back credit debit',(await view(oracle,'get_account',{account_id:root.accountId})).credit,capCredit);
 for(let i=0;i<13;i++){const a=await create(`capacity-${i}`);await call(a,oracle,'register_account',{},accountCost);}await call(sink,oracle,'register_account',{},accountCost,'failure');check('bond account cap reached',(await view(oracle,'list_accounts')).length,16);
 // Separate fault artifact: real payout succeeds even when callback fails.
 const fault=await deploy('fault-oracle','settlement-oracle-fault.wasm',init);await call(root,fault,'register_account',{},accountCost);const fi=await materialize('fault-case',fault,await now()+60_000_000_000n);await call(root,fault,'register_series',fi.bundle.registration,seriesCost);await advance(BigInt(fi.bundle.registration.config.maturity_ns));await publish(fi,fault,'PRIMARY');await propose(fi,fault,root);await advance(BigInt((await view(fault,'get_case',{series_id:'fault-case'})).proposal.challenge_end));await call(root,fault,'finalize',{series_id:'fault-case'});
 for(const mode of [1,2]){old=await sink.getBalance();await call(root,fault,'fault_withdraw',{amount:'100',receiver:sink.accountId,fault:mode},1n,'failure');check(`bond payout survives callback fault ${mode}`,(await sink.getBalance())-old,100n);}
 await advance(await now()+5_000_000_000n);for(const id of ['0','1'])await call(bob,fault,'mark_unknown',{ticket_id:id});await call(root,fault,'close_ticket',{ticket_id:'0'},1n,'failure');await call(root,fault,'retry_withdrawal',{ticket_id:'0'},1n,'failure');await call(root,fault,'fault_replay',{ticket_id:'0',malformed:true});check('unknown bond payouts remain quarantined',(await view(fault,'custody')).unknown,'200');
 await call(root,fault,'withdraw_credit',{amount:'100',receiver:'missing.sandbox'},1n,'mixed');const restored=(await view(fault,'get_account',{account_id:root.accountId})).credit;await call(root,fault,'fault_replay',{ticket_id:'2',malformed:false});check('duplicate callback cannot restore twice',(await view(fault,'get_account',{account_id:root.accountId})).credit,restored);
 evidence.custody={normal:await reconcile(oracle),fault:await reconcile(fault)};check('all bond categories reconcile to funded receipts',true,true);
 await writeFile(path.join(ROOT,'target/g4-events.json'),JSON.stringify(evidence.events.map(x=>x.event)));
 execFileSync('uv',['run','--offline','--with','jsonschema==4.23.0','python','-c',"import json,jsonschema;s=json.load(open('packages/shared-schemas/oracle.schema.json'));[jsonschema.validate(e,s) for e in json.load(open('target/g4-events.json'))]"],{cwd:ROOT,env:{...process.env,UV_CACHE_DIR:'/private/tmp/hedgeveil-uv-cache'},stdio:'pipe'});check('all receipt events match generated oracle schema',true,true);
 evidence.runtime=await provider.viewNodeStatus();check('pinned Sandbox version',evidence.runtime.version.version,'2.14.0');evidence.passed=true;
 await writeFile(path.join(ROOT,'research/reports/g4-sandbox.json'),JSON.stringify(evidence,null,2)+'\n');console.log(`G4: ${evidence.checks.length} checks, ${evidence.transactions.length} transactions, ${evidence.events.length} events.`);
}catch(error){evidence.passed=false;evidence.error=String(error);await writeFile(path.join(ROOT,'target/g4-failed.json'),JSON.stringify(evidence,null,2)+'\n');throw error;}finally{if(sandbox)await sandbox.tearDown();}
