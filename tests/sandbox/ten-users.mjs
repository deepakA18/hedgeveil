// Actual compiled-Wasm receipts with ten concurrent users. Local prices only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {extractEvents,replayCore,reconcileCore} from '../../services/indexer/model.mjs';
import {verifyQuote} from '../../packages/rfq/codec.mjs';
const Q=10n**24n,GAS=250n*10n**12n;
const dir=await mkdtemp(join(tmpdir(),'hv-ten-')),report={scope:'Ten concurrent local users, real compiled Wasm/receipts; synthetic pricing is test-only',passed:false,checks:[],timings:[],transactions:[]};
let sandbox,core;const workers=[],events=[],keys=new Map();
const failed=t=>[t.transaction_outcome,...t.receipts_outcome].some(r=>r.outcome.status.Failure);
const check=(name,v)=>{assert(v,name);report.checks.push(name);console.log('PASS',name);};
try{
 sandbox=await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});
 const rpc=new JsonRpcProvider({url:sandbox.rpcUrl}),g=GenesisAccount.createDefault(),root=new Account(g.accountId,rpc,g.privateKey);
 const record=(label,t)=>{report.transactions.push({label,hash:t.transaction.hash,status:t.status,receipts:t.receipts_outcome.map(r=>({id:r.id,executor:r.outcome.executor_id,status:r.outcome.status,gas_burnt:r.outcome.gas_burnt}))});if(core)for(const r of t.receipts_outcome)events.push(...extractEvents(r,[{account_id:core.accountId,kind:'core'}]));};
 const create=async name=>{const k=KeyPair.fromRandom('ed25519'),id=name+'.'+root.accountId;await root.createAccount({newAccountId:id,publicKey:k.getPublicKey(),nearToTransfer:40n*Q});keys.set(id,k.toString());return new Account(id,rpc,k.toString());};
 const send=async(a,to,list,label)=>{const t=await a.signAndSendTransaction({receiverId:to.accountId,actions:list,waitUntil:'FINAL',throwOnFailure:false});record(label,t);assert(!failed(t),label+JSON.stringify(t.status));return t;};
 const call=(a,to,m,args={},deposit=0n)=>send(a,to,[actions.functionCall(m,args,GAS,deposit)],m);
 const deploy=async(a,path,args)=>{const b=await readFile(path);report[path]=createHash('sha256').update(b).digest('hex');await send(a,a,[actions.deployContract(b),actions.functionCall('new',args,GAS,0n)],'deploy');};
 const oracle=await create('oracle');await deploy(oracle,'target/core-artifacts/oracle-fixture.wasm',{owner:root.accountId});core=await create('core');
 const bc=(await rpc.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
 await deploy(core,'target/core-artifacts/clearinghouse.wasm',{network:'sandbox',guardian:root.accountId,oracle:oracle.accountId,oracle_version:'fixture-v1',storage_byte_cost:bc});
 const view=(m,args={})=>rpc.callFunction({contractId:core.accountId,method:m,args,blockQuery:{finality:'final'}});
 const sq=await view('storage_quote'),makers=[await create('maker-a'),await create('maker-b')],users=[];for(let n=0;n<10;n++)users.push(await create('user'+n));
 for(const a of [root,...makers])await call(a,core,'storage_deposit',{},BigInt(sq.account_minimum));
 const timed=async(name,fn)=>{const start=performance.now();await fn();report.timings.push({name,ms:Math.round(performance.now()-start)});};
 await timed('ten concurrent first deposits',()=>Promise.all(users.map(a=>send(a,core,[actions.functionCall('storage_deposit',{},50n*10n**12n,BigInt(sq.account_minimum)),actions.functionCall('deposit_collateral',{},200n*10n**12n,Q)],'first deposit'))));
 check('ten users plus two makers and admin occupy 13 slots',(await view('list_accounts',{from_index:0,limit:16})).length===13);
 const now=BigInt((await rpc.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec),end=now+7200n*10n**9n;
 const config={series_id:'load',version:'1',collateral_kind:'NATIVE_NEAR',index_definition_hash:'1'.repeat(64),payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'2000000000000',price_scale:'1000000000000',maturity_ns:String(end),mint_cutoff_ns:String(end-1800n*10n**9n),observation_window:{start_ns:String(end-1800n*10n**9n),end_ns:String(end)},oracle_account_id:oracle.accountId,oracle_version:'fixture-v1',oracle_config_hash:'2'.repeat(64),finalization_policy_hash:'3'.repeat(64),max_supply:String(100n*Q)};
 await call(root,core,'create_series',{config},BigInt(sq.series_storage)+BigInt(sq.creation_fee));
 async function startMaker(a){
  const c=fork(new URL('../../services/maker/worker.mjs',import.meta.url),[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc']});workers.push(c);let seq=0;const pending=new Map();
  c.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);});
  const ask=(method,body={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('MAKER_TIMEOUT')),30000);pending.set(id,{resolve,reject,timer});c.send({id,method,...body});});
  const cfg={network:'sandbox',rpc_url:sandbox.rpcUrl,contract:core.accountId,maker:a.accountId,account_key:keys.get(a.accountId),state_file:join(dir,a.accountId+'.json'),operation_journal:join(dir,a.accountId+'-journal'),key_id:'load-key',half_spread_bps:20,initial_equity:String(2n*Q),fee_receiver:a.accountId};
  const init=await ask('init',{config:cfg});return {c,ask,cfg,public_key:init.public_key};
 }
 const ms=[];for(const a of makers){await call(a,core,'deposit_collateral',{},2n*Q);await call(a,core,'split',{series_id:'load',amount:String(Q)},1n);const m=await startMaker(a);ms.push(m);await call(a,core,'register_signing_key',{key_id:'load-key',public_key:m.public_key},BigInt(sq.account_minimum)+1n);}
 const quote=async(user,leg,mode='BUY',amount=Q/100n)=>{
  const timestamp_ns=(await rpc.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec;
  const request={taker:user.accountId,asset:{kind:leg,series_id:'load'},mode,amount:String(amount),reference:{label:'SYNTHETIC MARKET REFERENCE',timestamp_ns,marks:{'P:load':String(Q/2n),'N:load':String(Q/2n)}}};
  const result=await ms[leg==='P'?0:1].ask('quote',{request});assert(result.quote,result.reason);assert(verifyQuote(result.quote,ms[leg==='P'?0:1].public_key));return result.quote;
 };
 await timed('ten users buy both legs from real maker processes',()=>Promise.all(users.map(async u=>{for(const leg of ['P','N'])await call(u,core,'fill_quote',{quote:await quote(u,leg)},1n);} )));
 check('every user receives both exact bought balances',(await Promise.all(users.map(u=>view('get_account',{account_id:u.accountId})))).every(a=>a.positions[0].p===String(Q/100n)&&a.positions[0].n===String(Q/100n)));
 await timed('ten concurrent sells and matched-pair merges',()=>Promise.all(users.map(async u=>{await call(u,core,'fill_quote',{quote:await quote(u,'P','SELL',Q/200n)},1n);await call(u,core,'merge',{series_id:'load',amount:String(Q/200n)},1n);} )));
 await Promise.all(users.map((u,i)=>call(u,core,'transfer',{asset:{kind:'N',series_id:'load'},receiver:users[(i+1)%10].accountId,amount:String(Q/1000n)},1n)));
 for(let i=0;i<10;i++){const n=BigInt((await rpc.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);if(n>=end)break;await rpc.sendJsonRpc('sandbox_fast_forward',{delta_height:10000});}
 await call(root,oracle,'set_report',{series_id:'load',report:{config,state:'FINALIZED',price:'3000000000000'}});await call(root,core,'request_resolution',{series_id:'load'});
 await timed('ten concurrent redemptions and completed withdrawals',()=>Promise.all(users.map(async u=>{await call(u,core,'redeem',{series_id:'load',leg:'N',amount:String(Q/200n)},1n);const a=await view('get_account',{account_id:u.accountId});await call(u,core,'request_withdrawal',{amount:a.free,receiver:u.accountId},1n);} )));
 const block=await rpc.sendJsonRpc('block',{finality:'final'}),pinned=(m,args={})=>rpc.callFunction({contractId:core.accountId,method:m,args,blockQuery:{blockId:block.header.hash}}),ids=await pinned('list_accounts',{from_index:0,limit:16}),accounts=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await pinned('get_account',{account_id:id})]))),tickets=(await Promise.all(ids.map(account_id=>pinned('list_tickets',{account_id,from_index:0,limit:16})))).flat();
 const snapshot={kind:'core',contract:core.accountId,accounts,series:await pinned('list_series',{from_index:0,limit:16}),tickets,custody:await pinned('custody_snapshot'),native:await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:core.accountId,block_id:block.header.hash}),vault:null,roll:null};
 reconcileCore(replayCore(core.accountId,events),snapshot);
 check('all ten withdrawals have successful transfer/callback tickets',tickets.length===10&&tickets.every(t=>t.state==='SUCCEEDED'));
 check('all ten user ledgers are empty and full event replay reconciles',users.every(u=>accounts[u.accountId].free==='0'&&accounts[u.accountId].positions[0].p==='0'&&accounts[u.accountId].positions[0].n==='0'));
 report.final_custody=snapshot.custody;report.passed=true;
}finally{for(const c of workers)c.kill();await sandbox?.stop();await rm(dir,{recursive:true,force:true});await writeFile('research/reports/ten-users-sandbox.json',JSON.stringify(report,null,2)+'\n');}
