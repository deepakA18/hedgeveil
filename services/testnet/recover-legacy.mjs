// Explicitly scoped to the retired native-transfer deployment. No account deletion or code changes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadWorkspace,Q,verifyChain} from './workspace.mjs';
import {adminFor,functionCall,retained} from './deploy.mjs';
import {privateRead} from '../demo/storage.mjs';
import {coreSurplus,walletSurplus} from './recovery-policy.mjs';
const nativeFetch=globalThis.fetch;
globalThis.fetch=(url,options={})=>nativeFetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
const apply=process.argv.includes('--apply');
const {directory,plan}=await loadWorkspace('native-transfer');
const active=JSON.parse(await readFile('deploy/testnet/expiry-deployment.json'));
assert.equal(plan.network,'testnet');assert.equal(plan.owner,'0xdeepak18.testnet');
assert(!plan.accounts.some(a=>active.accounts.some(b=>a.id===b.id)),'active account overlap');
const admin=adminFor(directory,{...plan,rpc_url:'https://test.rpc.fastnear.com/'}),p=admin.provider;
const originalRpc=p.sendJsonRpc.bind(p);let lastRead=0;
p.sendJsonRpc=async(method,args)=>{
 const read=['query','status','block','gas_price','tx','EXPERIMENTAL_protocol_config'].includes(method);
 for(let attempt=0;;attempt++){
  const delay=Math.max(0,750-(Date.now()-lastRead));if(delay)await new Promise(r=>setTimeout(r,delay));lastRead=Date.now();
  try{return await originalRpc(method,args);}catch(e){if(!read||attempt>=3)throw e;await new Promise(r=>setTimeout(r,2000*(attempt+1)));}
 }
};
await verifyChain(p,plan);
const core=plan.accounts.find(a=>a.role==='core').id,oracle=plan.accounts.find(a=>a.role==='oracle').id;
const deployed=await privateRead(join(directory,'deployment.json'));
const view=(method,args={})=>p.callFunction({contractId:core,method,args,blockQuery:{finality:'final'}});
const native=id=>p.sendJsonRpc('query',{request_type:'view_account',account_id:id,finality:'final'});
for(const c of deployed.indexer.contracts)assert.equal((await native(c.account_id)).code_hash,c.code_hash);
const series=await view('list_series',{from_index:0,limit:16});assert(series.length<16);
const now=BigInt((await p.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
assert(series.every(s=>BigInt(s.config.maturity_ns)<now),'open legacy market');
const ids=await view('list_accounts',{from_index:0,limit:16});
assert(ids.length<16&&ids.every(id=>id===plan.owner||plan.accounts.some(a=>a.id===id)),'external ledger owner');
assert.equal(await view('get_vault'),null);
const before=await view('custody_snapshot');coreSurplus(before,(await native(core)).amount);
const makers=plan.accounts.filter(a=>a.role==='maker');
const settlements=[];
for(const m of makers){const a=await view('get_account',{account_id:m.id});if(!a)continue;
 for(const s of series)for(const leg of ['P','N']){const amount=a.positions[s.slot][leg.toLowerCase()];if(BigInt(amount)>0n){assert(s.final_price!==null,'unfinalized maker claim');settlements.push({maker:m.id,series:s.config.series_id,leg,amount});}}
}
const path='research/reports/legacy-fund-recovery.json';
let report;try{report=JSON.parse(await readFile(path));}catch{report={network:'testnet',beneficiary:plan.owner,core,started_at:new Date().toISOString(),before,transactions:[]};}
const save=()=>writeFile(path,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode:apply?'apply':'audit',beneficiary:plan.owner,redeem_claims:settlements.length,core_surplus:coreSurplus(before,(await native(core)).amount).toString(),oracle_keep_near:'5',service_keep_near:'0.1 plus storage',user_free:(await view('get_account',{account_id:plan.owner})).free}));
if(apply){
 const {keys}=await privateRead(join(directory,'signers.json'));
 async function send(label,who,receiver,actions){
  assert(plan.accounts.some(a=>a.id===who));
  const i=await admin.prepare('legacy-recovery-20261113-'+label,who,receiver,actions);
  const r=await admin.send(i,keys[who]);assert.equal(r.state,'SUCCEEDED');
  if(!report.transactions.some(t=>t.hash===r.hash)){report.transactions.push({label,signer:who,receiver,actions,hash:r.hash,state:r.state});await save();}
  console.log(label,r.state,r.hash);
 }
 const call=(label,id,method,args={})=>send(label,id,core,[functionCall(method,args,'1')]);
 // Retirement blocks new deposits, listings and splits while keeping exits available.
 await call('retire',plan.root_id,'set_pauses',{pauses:{deposits:true,series:true,splits:true}});
 for(const s of settlements)await call(`redeem-${s.maker}-${s.series}-${s.leg}`,s.maker,'redeem',{series_id:s.series,leg:s.leg,amount:s.amount});
 for(const a of plan.accounts.filter(a=>['maker','administrator'].includes(a.role))){
  let ledger=await view('get_account',{account_id:a.id});if(!ledger)continue;
  let tickets=await view('list_tickets',{account_id:a.id,from_index:0,limit:16});
  assert(tickets.every(t=>['SUCCEEDED','FAILED_CONFIRMED'].includes(t.state)),'unresolved withdrawal');
  for(const t of tickets)await call(`close-${a.id}-${t.id}`,a.id,'close_ticket',{ticket_id:t.id});
  if(BigInt(ledger.free)>0n){
   await call(`withdraw-${a.id}`,a.id,'request_withdrawal',{amount:ledger.free,receiver:plan.owner});
   tickets=await view('list_tickets',{account_id:a.id,from_index:0,limit:16});
   assert.equal(tickets.length,1);assert.equal(tickets[0].state,'SUCCEEDED');assert.equal(tickets[0].amount,ledger.free);assert.equal(tickets[0].receiver,plan.owner);
   await call(`close-${a.id}-${tickets[0].id}`,a.id,'close_ticket',{ticket_id:tickets[0].id});
  }
  ledger=await view('get_account',{account_id:a.id});assert.equal(ledger.free,'0');assert(ledger.positions.every(x=>x.p==='0'&&x.n==='0'));
  await call(`unregister-${a.id}`,a.id,'unregister');assert.equal(await view('get_account',{account_id:a.id}),null);
 }
 const byteCost=(await p.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
 // Freeze exact transfer intents once, so resuming never computes a second sweep.
 const sweeps=await retained(join(directory,'legacy-recovery-sweeps.json'),async()=>{
  const out=[];
  for(const a of plan.accounts){const n=await native(a.id);let amount;
   if(a.id===core)amount=coreSurplus(await view('custody_snapshot'),n.amount);
   else if(a.id===oracle){assert(BigInt(n.storage_usage)*BigInt(byteCost)+2n*Q<5n*Q);amount=BigInt(n.amount)-5n*Q;}
   else {assert.equal(n.code_hash,'11111111111111111111111111111111');amount=walletSurplus(n.amount,n.storage_usage,byteCost);}
   if(amount>0n)out.push({id:a.id,amount:String(amount)});
  }return out;
 });
 for(const s of sweeps)await send(`sweep-${s.id}`,s.id,plan.owner,[{type:'Transfer',deposit:s.amount}]);
 report.after=await view('custody_snapshot');assert(report.after.retained_categories_covered);assert.equal(report.after.pending_in_flight,'0');assert.equal(report.after.unknown_in_flight,'0');
 report.owner_remaining=await view('get_account',{account_id:plan.owner});
 report.returned_to_owner=report.transactions.reduce((v,t)=>v+t.actions.reduce((sum,a)=>sum+(a.type==='Transfer'&&t.receiver===plan.owner?BigInt(a.deposit):a.method==='request_withdrawal'&&a.args.receiver===plan.owner?BigInt(a.args.amount):0n),0n),0n).toString();
 report.completed_at=new Date().toISOString();await save();console.log('returned_to_owner',report.returned_to_owner);
}
