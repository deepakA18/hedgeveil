import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {parseArgs} from 'node:util';
import {baseQuote,signQuote} from '../../packages/rfq/codec.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {retainedSeries} from '../../packages/sdk/series.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)), Q=10n**24n,GAS=250n*10n**12n;
const {values:options}=parseArgs({options:{report:{type:'string',default:'research/reports/g3-sandbox.json'},seed:{type:'string',default:'20903'},steps:{type:'string',default:'40'},trades:{type:'boolean',default:false}}});
assert(/^[0-9]+$/.test(options.seed)&&BigInt(options.seed)>0n&&BigInt(options.seed)<=0xffffffffn,'nonzero u32 seed');
assert(/^[0-9]+$/.test(options.steps)&&Number(options.steps)>=40&&Number(options.steps)<=200,'40..200 steps');
const steps=Number(options.steps),initialSeed=Number(options.seed);
const artifacts=JSON.parse(await readFile(path.join(ROOT,'target/core-artifacts/manifest.json'))),wasm={};
for(const [file,meta] of Object.entries(artifacts)){wasm[file]=await readFile(path.join(ROOT,'target/core-artifacts',file));assert.equal(createHash('sha256').update(wasm[file]).digest('hex'),meta.sha256);}
const exports=WebAssembly.Module.exports(await WebAssembly.compile(wasm['clearinghouse.wasm'])).map(x=>x.name);
assert(!exports.some(x=>x.startsWith('fault_')));
const evidence={scope:'G3 bounded internal ledger, local Sandbox only; oracle/account/fault fixtures are not product deployments',versions:{rust:'1.96.0',near_sdk:'5.30.1',near_api_js:'7.4.0',near_sandbox_js:'0.3.5',node:process.version,sandbox:'2.14.0'},artifacts,seed:String(initialSeed),steps,trades:options.trades,model_actions:[],quote_attempts:[],key_registrations:[],checks:[],transactions:[],events:[]};
async function hashes(dir,prefix){const out={};for(const e of await readdir(dir,{withFileTypes:true})){if(['target','node_modules','__pycache__'].includes(e.name))continue;const key=path.posix.join(prefix,e.name),full=path.join(dir,e.name);if(e.isDirectory())Object.assign(out,await hashes(full,key));else if(/\.(rs|toml|lock|mjs|json|py)$/.test(e.name))out[key]=createHash('sha256').update(await readFile(full)).digest('hex');}return out;}
evidence.sources={...await hashes(path.join(ROOT,'contracts'),'contracts'),...await hashes(path.join(ROOT,'crates/protocol-types'),'crates/protocol-types'),...await hashes(path.join(ROOT,'crates/payoff-math'),'crates/payoff-math')};
for(const file of ['tests/sandbox/g3.mjs','tests/sandbox/package.json','tests/sandbox/package-lock.json','scripts/build-core.py','packages/rfq/codec.mjs','packages/shared-schemas/public-ledger.schema.json'])evidence.sources[file]=createHash('sha256').update(await readFile(path.join(ROOT,file))).digest('hex');
evidence.base_commit=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const reportFile=options.report;
if(!reportFile)throw Error('missing --report path');
let sandbox,provider,byteCost;
const eventBalances=new Map(),seenOps=new Set();
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);evidence.checks.push(name);console.log('PASS',name);};
const outcomes=tx=>[tx.transaction_outcome,...tx.receipts_outcome];
const failed=tx=>outcomes(tx).some(x=>x.outcome.status.Failure);
const assetId=a=>a.kind==='COLLATERAL'?'COLLATERAL':`${a.kind}:${a.series_id}`;
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
 if(method==='fill_quote')evidence.quote_attempts.push({quote:args.quote,hash:tx.transaction.hash,succeeded:!failed(tx)});
 if(expect==='success')assert(!failed(tx),`${method}: ${JSON.stringify(tx.status)}`);else if(expect==='failure')assert(failed(tx),`expected failure: ${method}`);return tx;
}
const view=(c,method,args={})=>provider.callFunction({contractId:c.accountId,method,args,blockQuery:{finality:'final'}});
async function create(root,name,balance=50n*Q){const key=KeyPair.fromRandom('ed25519'),id=`${name}.${root.accountId}`;const tx=await root.createAccount({newAccountId:id,publicKey:key.getPublicKey(),nearToTransfer:balance});assert(!failed(tx));return new Account(id,provider,key.toString());}
async function deploy(root,name,file,args){const c=await create(root,name);const tx=await c.signAndSendTransaction({receiverId:c.accountId,actions:[actions.deployContract(wasm[file]),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});record(`deploy:${name}`,tx);assert(!failed(tx),JSON.stringify(tx.status));return c;}
async function now(){return BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);}
async function advancePast(t){for(let i=0;i<150;i++){if(await now()>=t)return;await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:1000});}throw Error('clock deadline not reached');}
function config(id,end,oracle){return {series_id:id,version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:'1'.repeat(64),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'2000000000000',price_scale:'1000000000000',maturity_ns:String(end),mint_cutoff_ns:String(end-60_000_000_000n),observation_window:{start_ns:String(end-300_000_000_000n),end_ns:String(end)},oracle_account_id:oracle.accountId,oracle_version:'fixture-v1',oracle_config_hash:'2'.repeat(64),finalization_policy_hash:'3'.repeat(64),max_supply:String(100n*Q)};}
async function replayMatches(c){
 const snapshot=await view(c,'custody_snapshot'),ids=await view(c,'list_accounts',{from_index:0,limit:16}),series=await retainedSeries((method,args)=>view(c,method,args));
 const expected=new Map();const put=(owner,bucket,id,asset,amount)=>{if(BigInt(amount)>0n)expected.set(JSON.stringify([c.accountId,owner,bucket,id,asset]),BigInt(amount));};
 for(const id of ids){const a=await view(c,'get_account',{account_id:id});put(id,'FREE','account','COLLATERAL',a.free);put(id,'STORAGE','account','COLLATERAL',a.storage_paid);for(const s of series){const p=a.positions[s.slot];put(id,'FREE',s.config.series_id,`P:${s.config.series_id}`,p.p);put(id,'FREE',s.config.series_id,`N:${s.config.series_id}`,p.n);}for(const t of await view(c,'list_tickets',{account_id:id,from_index:0,limit:16})){if(['PENDING','UNKNOWN'].includes(t.state))put(id,'WITHDRAWAL',`w-${t.id}`,'COLLATERAL',t.amount);}}
 for(const s of series){put(c.accountId,'SERIES_RESERVE',s.config.series_id,'COLLATERAL',s.reserve);put(c.accountId,'SUPPLY',s.config.series_id,`P:${s.config.series_id}`,s.outstanding_p);put(c.accountId,'SUPPLY',s.config.series_id,`N:${s.config.series_id}`,s.outstanding_n);}
 put(c.accountId,'STORAGE','series','COLLATERAL',snapshot.series_storage_fund);put(c.accountId,'STORAGE','market','COLLATERAL',snapshot.market_storage_fund);put(c.accountId,'FEE','protocol','COLLATERAL',snapshot.fees);put(c.accountId,'OPERATING','bootstrap','COLLATERAL',snapshot.operating_allocation);
 const actual=new Map([...eventBalances].filter(([k,n])=>JSON.parse(k)[0]===c.accountId&&n>0n));assert.deepEqual(actual,expected,'canonical event replay equals state');return snapshot;
}
try{
 sandbox=await Sandbox.start({version:'2.14.0'});assert.equal(new URL(sandbox.rpcUrl).hostname,'127.0.0.1');provider=new JsonRpcProvider({url:sandbox.rpcUrl});
 const genesis=GenesisAccount.createDefault(),root=new Account(genesis.accountId,provider,genesis.privateKey),alice=await create(root,'alice',2000n*Q),bob=await create(root,'bob'),sink=await create(root,'sink');
 byteCost=BigInt((await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte);
 const oracle=await deploy(root,'oracle','oracle-fixture.wasm',{owner:root.accountId});
 const init={network:'sandbox',guardian:alice.accountId,oracle:oracle.accountId,oracle_version:'fixture-v1',storage_byte_cost:String(byteCost)};
 const core=await deploy(root,'core','clearinghouse.wasm',init),fault=await deploy(root,'fault','clearinghouse-fault.wasm',init);
 check('normal artifact excludes fault methods',exports.some(x=>x.startsWith('fault_')),false);
 const quote=await view(core,'storage_quote'),minimum=BigInt(quote.account_minimum),seriesPayment=BigInt(quote.series_storage)+BigInt(quote.creation_fee);
 await call(alice,core,'storage_deposit',{},minimum-1n,'failure');await call(alice,core,'deposit_collateral',{},Q,'failure');
 for(const a of [alice,bob])await call(a,core,'storage_deposit',{},minimum+Q/10n);
 check('storage payments are not collateral',(await view(core,'get_account',{account_id:alice.accountId})).free,'0');
 await call(alice,core,'release_storage_excess',{amount:String(Q/10n)},1n);await call(bob,core,'release_storage_excess',{amount:String(Q/10n)},1n);
 await call(alice,core,'release_storage_excess',{amount:'1'},1n,'failure');
 await call(alice,core,'deposit_collateral',{},10n*Q);await call(bob,core,'deposit_collateral',{},2n*Q);
 await call(alice,core,'deposit_collateral',{},1001n*Q,'failure');
 const end=(await now())+1_800_000_000_000n,alpha=config('alpha',end,oracle),beta=config('beta',end,oracle),dust=config('dust',end,oracle);
 for(const cfg of [alpha,beta,dust])await call(alice,core,'create_series',{config:cfg},seriesPayment);
 await call(alice,core,'create_series',{config:alpha},seriesPayment,'failure');
 await call(alice,core,'create_series',{config:{...config('bad',end,oracle),price_scale:'100'}},seriesPayment,'failure');
 await call(alice,core,'create_series',{config:{...config('bad',end,oracle),oracle_account_id:sink.accountId}},seriesPayment,'failure');
 await call(alice,core,'create_series',{config:config('underfunded',end,oracle)},0n,'failure');
 await call(alice,core,'create_series',{config:{...config('expired',end,oracle),mint_cutoff_ns:'1'}},seriesPayment,'failure');
 for(const amount of ['01','-1','1e3','340282366920938463463374607431768211456'])await call(alice,core,'split',{series_id:'alpha',amount},1n,'failure');
 await call(alice,core,'split',{series_id:'alpha',amount:String(101n*Q)},1n,'failure');
 const model={a:{free:10n*Q+Q/10n,p:0n,n:0n},b:{free:2n*Q+Q/10n,p:0n,n:0n},reserve:0n,split:0n,merged:0n,paid:0n};
 const actors={a:alice,b:bob},keys={},nonces={a:0,b:0};let seed=initialSeed;const rand=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;seed>>>=0;return seed%n;};
 if(options.trades)for(const id of ['a','b']){keys[id]=generateKeyPairSync('ed25519');const args={key_id:'stateful',public_key:keys[id].publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex')};await call(actors[id],core,'register_signing_key',args,minimum+1n);evidence.key_registrations.push({maker:actors[id].accountId,...args});}
 async function compare(){const s=await view(core,'get_series',{series_id:'alpha'});for(const id of ['a','b']){const a=await view(core,'get_account',{account_id:actors[id].accountId});assert.equal(a.free,String(model[id].free));assert.equal(a.positions[s.slot].p,String(model[id].p));assert.equal(a.positions[s.slot].n,String(model[id].n));}assert.equal(s.reserve,String(model.reserve));assert.equal(s.outstanding_p,String(model.a.p+model.b.p));assert.equal(s.outstanding_n,String(model.a.n+model.b.n));assert.equal(s.total_paid,String(model.paid));assert.equal(s.total_split,String(model.split));assert.equal(s.total_merged,String(model.merged));}
 for(let i=0;i<steps;i++){
  const id=rand(2)?'a':'b',other=id==='a'?'b':'a',a=model[id],b=model[other],amount=BigInt(1+rand(1000));const op=rand(options.trades?6:4);
  evidence.model_actions.push({phase:'pre-final',step:i,actor:id,op,amount:String(amount)});
  if(op===0||i<4){await call(actors[id],core,'split',{series_id:'alpha',amount:String(amount)},1n);a.free-=amount;a.p+=amount;a.n+=amount;model.reserve+=amount;model.split+=amount;}
  else if(op===1){const q=[a.p,a.n,amount].reduce((x,y)=>x<y?x:y);if(q>0n){await call(actors[id],core,'merge',{series_id:'alpha',amount:String(q)},1n);a.p-=q;a.n-=q;a.free+=q;model.reserve-=q;model.merged+=q;}}
  else if(op<4){const leg=op===2?'p':'n',q=a[leg]<amount?a[leg]:amount;if(q>0n){await call(actors[id],core,'transfer',{asset:{kind:leg.toUpperCase(),series_id:'alpha'},amount:String(q),receiver:actors[other].accountId},1n);a[leg]-=q;b[leg]+=q;}}
  else {
   const leg=op===4?'p':'n',q=a[leg]<amount?a[leg]:amount;
   if(q>0n){const cash=1n+q/2n,quote=baseQuote({contract:core.accountId,maker:actors[id].accountId,taker:actors[other].accountId,keyId:'stateful',nonce:nonces[id]++,epoch:0,expiry:await now()+240_000_000_000n,feeReceiver:alice.accountId});quote.maker_gives=[{asset:{kind:leg.toUpperCase(),series_id:'alpha'},amount:String(q)}];quote.taker_gives=[{asset:{kind:'COLLATERAL'},amount:String(cash)}];quote.fee.amount='1';const signed=signQuote(quote,keys[id].privateKey);
    // Invalid late leg must revert all balances AND nonce, before the valid fill.
    const invalid=signQuote({...quote,maker_gives:[...quote.maker_gives,{asset:{kind:leg==='p'?'N':'P',series_id:'alpha'},amount:String(a[leg==='p'?'n':'p']+1n)}]},keys[id].privateKey);
    const marketBefore=await view(core,'get_market',{maker:actors[id].accountId});await call(actors[other],core,'fill_quote',{quote:invalid},1n,'failure');await compare();assert.deepEqual(await view(core,'get_market',{maker:actors[id].accountId}),marketBefore);
    await call(actors[other],core,'fill_quote',{quote:signed},1n);a[leg]-=q;b[leg]+=q;a.free+=cash;b.free-=cash+1n;model.a.free++;
    await call(actors[other],core,'fill_quote',{quote:signed},1n,'failure');
   }
  }
  await compare();
 }
 check(`${steps} seeded pre-final model steps match independent BigInt ledger`,true,true);
 if(options.trades)check('seed exercises signed trades and failed-fill/replay rollback',evidence.quote_attempts.some(x=>x.succeeded),true);
 await call(alice,core,'split',{series_id:'alpha',amount:'20000'},1n);model.a.free-=20000n;model.a.p+=20000n;model.a.n+=20000n;model.reserve+=20000n;model.split+=20000n;await compare();
 await call(bob,core,'transfer',{asset:{kind:'P',series_id:'alpha'},amount:String(model.b.p+1n),receiver:alice.accountId,owner:alice.accountId},1n,'failure');
 await call(alice,core,'transfer',{asset:{kind:'COLLATERAL'},amount:'1',receiver:sink.accountId},1n,'failure');
 await call(alice,core,'split',{series_id:'alpha',amount:'1'},0n,'failure');
 await call(bob,core,'set_pauses',{pauses:{deposits:true,series:true,splits:true}},1n,'failure');
 await call(alice,core,'set_pauses',{pauses:{deposits:true,series:true,splits:true}},1n);
 await call(alice,core,'deposit_collateral',{},1n,'failure');await call(alice,core,'split',{series_id:'alpha',amount:'1'},1n,'failure');
 await call(alice,core,'transfer',{asset:{kind:'COLLATERAL'},amount:'1',receiver:bob.accountId},1n);model.a.free--;model.b.free++;
 await compare();await call(alice,core,'set_pauses',{pauses:{deposits:false,series:false,splits:false}},1n);
 // Separate zero-payout and one-atomic-unit dust cases.
 await call(alice,core,'split',{series_id:'beta',amount:'100'},1n);await call(alice,core,'split',{series_id:'dust',amount:'1'},1n);model.a.free-=101n;
 await call(alice,core,'request_resolution',{series_id:'alpha'},0n,'failure');
 await advancePast(end);
 await call(alice,core,'split',{series_id:'alpha',amount:'1'},1n,'failure');
 // A newly split pair from pre-maturity inventory remains mergeable while pending.
 let owner=['a','b'].find(id=>model[id].p>0n&&model[id].n>0n);
 if(owner){await call(actors[owner],core,'merge',{series_id:'alpha',amount:'1'},1n);model[owner].p--;model[owner].n--;model[owner].free++;model.reserve--;model.merged++;}
 await compare();
 const report={config:alpha,state:'FINALIZED',price:'3000000000000'};
 for(const bad of [{...report,state:'PROPOSED'},{...report,price:'0'},{...report,config:{...alpha,oracle_config_hash:'f'.repeat(64)}}]){await call(root,oracle,'set_report',{series_id:'alpha',report:bad});await call(alice,core,'request_resolution',{series_id:'alpha'});assert.equal((await view(core,'get_series',{series_id:'alpha'})).final_price,null);}
 for(const mode of ['malformed','failure']){await call(root,oracle,'set_mode',{mode});await call(alice,core,'request_resolution',{series_id:'alpha'},0n,'mixed');assert.equal((await view(core,'get_series',{series_id:'alpha'})).final_price,null);}
 await call(root,oracle,'set_mode',{mode:'normal'});await call(bob,core,'on_resolution',{series_id:'alpha',request_id:'0',version:1},0n,'failure');
 await call(root,oracle,'set_report',{series_id:'alpha',report});await call(alice,core,'request_resolution',{series_id:'alpha'});
 const p=2n*Q/3n,n=Q-p;check('coefficients match independent integer division',[(await view(core,'get_series',{series_id:'alpha'})).p_coefficient,(await view(core,'get_series',{series_id:'alpha'})).n_coefficient],[String(p),String(n)]);
 await call(root,oracle,'set_report',{series_id:'alpha',report:{...report,price:'4000000000000'}});await call(alice,core,'request_resolution',{series_id:'alpha'});
 check('final price cannot be overwritten',(await view(core,'get_series',{series_id:'alpha'})).final_price,report.price);
 await call(alice,core,'merge',{series_id:'alpha',amount:'1'},1n,'failure');await call(alice,core,'release_dust',{series_id:'alpha'},1n,'failure');
 for(let i=0;i<steps;i++){
  const candidates=['a','b'].flatMap(id=>['p','n'].filter(leg=>model[id][leg]>0n).map(leg=>[id,leg]));
  assert(candidates.length>0,'seeded redemption inventory');const [id,leg]=candidates[rand(candidates.length)];const requested=BigInt(1+rand(37)),amount=model[id][leg]<requested?model[id][leg]:requested;
  evidence.model_actions.push({phase:'redemption',step:i,actor:id,leg,amount:String(amount)});
  if(options.trades&&rand(3)===0){const other=id==='a'?'b':'a';await call(actors[id],core,'transfer',{asset:{kind:leg.toUpperCase(),series_id:'alpha'},amount:String(amount),receiver:actors[other].accountId},1n);model[id][leg]-=amount;model[other][leg]+=amount;await compare();}
  else {await call(actors[id],core,'redeem',{series_id:'alpha',leg:leg.toUpperCase(),amount:String(amount)},1n);const paid=amount*(leg==='p'?p:n)/Q;model[id][leg]-=amount;model[id].free+=paid;model.reserve-=paid;model.paid+=paid;await compare();}
 }
 check(`${steps} fragmented redemption/transfer steps match independent ledger`,true,true);
 for(const id of ['a','b'])for(const leg of ['p','n']){const amount=model[id][leg];if(amount>0n){await call(actors[id],core,'redeem',{series_id:'alpha',leg:leg.toUpperCase(),amount:String(amount)},1n);const paid=amount*(leg==='p'?p:n)/Q;model[id][leg]=0n;model[id].free+=paid;model.reserve-=paid;model.paid+=paid;}}
 await compare();check('seeded fragmented redemptions never exceed backing',model.paid<=model.split-model.merged,true);
 await call(alice,core,'redeem',{series_id:'alpha',leg:'P',amount:'1'},1n,'failure');
 await call(alice,core,'release_dust',{series_id:'alpha'},1n);model.reserve=0n;check('closed series has zero reserve',[(await view(core,'get_series',{series_id:'alpha'})).reserve,await view(core,'series_state',{series_id:'alpha'})],['0','CLOSED']);
 for(const [cfg,price] of [[beta,'1000000000000'],[dust,'3000000000000']]){
  await call(root,oracle,'set_report',{series_id:cfg.series_id,report:{config:cfg,state:'FINALIZED',price}});await call(alice,core,'request_resolution',{series_id:cfg.series_id});
  await call(alice,core,'release_dust',{series_id:cfg.series_id},1n,'failure');const amount=cfg.series_id==='beta'?'100':'1';
  for(const leg of ['P','N'])await call(alice,core,'redeem',{series_id:cfg.series_id,leg,amount},1n);
  const expectedDust=cfg.series_id==='dust'?'1':'0';check(`${cfg.series_id} residual before sweep`,(await view(core,'get_series',{series_id:cfg.series_id})).reserve,expectedDust);
  await call(alice,core,'release_dust',{series_id:cfg.series_id},1n);
 }
 check('zero-payout N claims burn',(await view(core,'get_series',{series_id:'beta'})).outstanding_n,'0');
 const beforeDonation=await view(core,'get_account',{account_id:alice.accountId});await root.transfer({receiverId:core.accountId,amount:Q});check('donation creates no user credit',await view(core,'get_account',{account_id:alice.accountId}),beforeDonation);
 let next=(await view(core,'custody_snapshot')).next_ticket_id,recipientBefore=await sink.getBalance();
 await call(alice,core,'request_withdrawal',{amount:'100',receiver:sink.accountId},1n);check('native withdrawal exact recipient credit',(await sink.getBalance())-recipientBefore,100n);
 await call(alice,core,'close_ticket',{ticket_id:next},1n);
 const free=(await view(core,'get_account',{account_id:alice.accountId})).free;next=(await view(core,'custody_snapshot')).next_ticket_id;
 await call(alice,core,'request_withdrawal',{amount:'100',receiver:'missing.sandbox'},1n,'mixed');check('failed withdrawal restores original free balance',(await view(core,'get_account',{account_id:alice.accountId})).free,free);
 await call(bob,core,'close_ticket',{ticket_id:next},1n,'failure');await call(alice,core,'close_ticket',{ticket_id:next},1n);
 await call(alice,core,'unregister',{},1n,'failure');
 // Fully exit Bob, clear retained receipt record, then refund registration storage.
 const bobFree=(await view(core,'get_account',{account_id:bob.accountId})).free;next=(await view(core,'custody_snapshot')).next_ticket_id;
 await call(bob,core,'request_withdrawal',{amount:bobFree,receiver:sink.accountId},1n);await call(bob,core,'close_ticket',{ticket_id:next},1n);await call(bob,core,'unregister',{},1n);
 check('empty-account storage refund removes account',await view(core,'get_account',{account_id:bob.accountId}),null);
 // Delete a fixture sender before its queued unregister request; actual native refund fails.
 const doomed=await deploy(root,'doomed','account-fixture.wasm',{owner:root.accountId,core:core.accountId});await call(root,doomed,'register',{amount:String(minimum)});
 await call(root,doomed,'close_and_delete',{},0n,'mixed');const restored=await view(core,'get_account',{account_id:doomed.accountId});
 const refundTickets=await view(core,'list_tickets',{account_id:doomed.accountId,from_index:0,limit:16});
 assert.equal(refundTickets.length,1,'unregister must execute and retain its failed refund receipt');assert.equal(refundTickets[0].state,'FAILED_CONFIRMED');
 check('failed storage refund restores storage, not collateral',[restored.storage_paid,restored.free,restored.closing],[String(minimum),'0',false]);
 // Recreate the same local account to close its failure ticket and safely unregister.
 const recreated=await create(root,'doomed');const restoredTickets=await view(core,'list_tickets',{account_id:recreated.accountId,from_index:0,limit:16});assert.equal(restoredTickets[0].state,'FAILED_CONFIRMED');
 await call(recreated,core,'close_ticket',{ticket_id:restoredTickets[0].id},1n);await call(recreated,core,'unregister',{},1n);
 // Actual successful native payment followed by failed callbacks in the separate fault artifact.
 await call(alice,fault,'storage_deposit',{},minimum);await call(alice,fault,'deposit_collateral',{},Q);
 for(const mode of [1,2]){const old=await sink.getBalance();await call(alice,fault,'fault_withdrawal',{amount:'100',receiver:sink.accountId,fault:mode},1n,'failure');check(`payout survives callback fault ${mode}`,(await sink.getBalance())-old,100n);}
 await advancePast((await now())+5_000_000_000n);
 for(const id of ['0','1'])await call(bob,fault,'mark_unknown',{ticket_id:id});
 await call(alice,fault,'close_ticket',{ticket_id:'0'},1n,'failure');await call(alice,fault,'retry_withdrawal',{ticket_id:'0'},1n,'failure');
 await call(alice,fault,'fault_replay',{ticket_id:'0',malformed:true});check('unknown remains quarantined',(await view(fault,'custody_snapshot')).unknown_in_flight,'200');
 await call(bob,fault,'on_withdrawal_result',{ticket_id:'0',version:1,fault:0},0n,'failure');
 await call(alice,fault,'request_withdrawal',{amount:'100',receiver:'missing.sandbox'},1n,'mixed');const refunded=(await view(fault,'get_account',{account_id:alice.accountId})).free;
 await call(alice,fault,'fault_replay',{ticket_id:'2',malformed:false});check('duplicate result cannot refund twice',(await view(fault,'get_account',{account_id:alice.accountId})).free,refunded);
 // Exercise all configured storage limits, not just a small ledger.
 const extra=quote.max_series-3;
 const future=(await now())+7_200_000_000_000n;for(let i=0;i<extra;i++)await call(alice,core,'create_series',{config:config(`extra-${i}`,future,oracle)},seriesPayment);
 await call(alice,core,'create_series',{config:config('extra-over',future,oracle)},seriesPayment,'failure');
 const registered=[alice];for(let i=0;i<15;i++){const a=await create(root,`capacity-${i}`);await call(a,core,'storage_deposit',{},minimum);registered.push(a);}
 await call(bob,core,'storage_deposit',{},minimum,'failure');
 for(const a of registered){await call(a,core,'deposit_collateral',{},BigInt(extra+4));for(let j=0;j<extra;j++)await call(a,core,'split',{series_id:`extra-${j}`,amount:'1'},1n);for(let j=0;j<4;j++)await call(a,core,'request_withdrawal',{amount:'1',receiver:sink.accountId},1n);}
 const capped=(await view(core,'get_account',{account_id:alice.accountId})).free;await call(alice,core,'request_withdrawal',{amount:'1',receiver:sink.accountId},1n,'failure');check('full ticket cap rolls back debit',(await view(core,'get_account',{account_id:alice.accountId})).free,capped);
 check('all 64 tickets terminate at full storage capacity',(await Promise.all(registered.map(a=>view(core,'list_tickets',{account_id:a.accountId,from_index:0,limit:16})))).flat().filter(t=>t.state==='SUCCEEDED').length,64);
 const finishedTicket=(await view(core,'list_tickets',{account_id:alice.accountId,from_index:0,limit:16}))[0];
 await call(alice,core,'close_ticket',{ticket_id:finishedTicket.id},1n);
 await call(alice,core,'deposit_collateral',{},1n);
 const fullFree=(await view(core,'get_account',{account_id:alice.accountId})).free;
 await call(alice,core,'request_withdrawal',{amount:'1',receiver:'full-capacity-missing.sandbox'},1n,'mixed');
 check('failed native transfer restores credit at full account/series capacity',(await view(core,'get_account',{account_id:alice.accountId})).free,fullFree);
 await advancePast(future+1n);
 await call(root,oracle,'set_report',{series_id:'extra-0',report:{config:config('extra-0',future,oracle),state:'FINALIZED',price:'3000000000000'}});
 await call(alice,core,'request_resolution',{series_id:'extra-0'});
 check('resolution callback completes at full account/series capacity',(await view(core,'get_series',{series_id:'extra-0'})).final_price,'3000000000000');
 check('account pagination bounded',(await view(core,'list_accounts',{from_index:0,limit:16})).length,16);
 evidence.custody={normal:await replayMatches(core),fault:await replayMatches(fault)};
 check('event replay reconciles every balance, reserve, supply and ticket',true,true);
 check('retained custody categories covered',evidence.custody.normal.retained_categories_covered,true);
 evidence.limits={accounts:16,series:quote.max_series,terminal_tickets:64,storage_bytes:evidence.custody.normal.storage_bytes,max_transaction_gas:evidence.transactions.reduce((n,t)=>BigInt(t.gas_burnt)>n?BigInt(t.gas_burnt):n,0n).toString(),max_receipt_gas:evidence.transactions.flatMap(t=>t.receipts).reduce((n,r)=>BigInt(r.gas_burnt)>n?BigInt(r.gas_burnt):n,0n).toString()};
 evidence.runtime=await provider.viewNodeStatus();check('pinned node version',evidence.runtime.version.version,'2.14.0');
 // Validate actual emitted event records with the same public shared schema.
 await writeFile(path.join(ROOT,'target/g3-events.json'),JSON.stringify(evidence.events.map(x=>x.event)));
 execFileSync(process.env.HEDGEVEIL_SCHEMA_PYTHON??'uv',[...(process.env.HEDGEVEIL_SCHEMA_PYTHON?[]:['run','--offline','--with','jsonschema==4.23.0','python']),'-c',"import sys,json;sys.path.insert(0,'packages/shared-schemas');from validate import validate;[validate(e) for e in json.load(open('target/g3-events.json'))]"],{cwd:ROOT,env:{...process.env,UV_CACHE_DIR:'/private/tmp/hedgeveil-uv-cache'},stdio:'pipe'});
 check('all emitted events validate against shared schema',true,true);evidence.passed=true;
 await writeFile(path.join(ROOT,reportFile),JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
 console.log(`G3: ${evidence.checks.length} named checks, ${evidence.transactions.length} transactions, ${evidence.events.length} events.`);
}catch(error){evidence.passed=false;evidence.error=String(error);await writeFile(path.join(ROOT,'target/g3-failed.json'),JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');throw error;}
finally{if(sandbox)await sandbox.tearDown();}
