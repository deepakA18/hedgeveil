import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair,actions} from 'near-api-js';
import {Client} from '../../packages/sdk/index.mjs';
const Q=10n**24n,GAS=250n*10n**12n;
const dir=await mkdtemp(join(tmpdir(),'hv-first-deposit-'));
const bytes=await readFile('target/core-artifacts/clearinghouse.wasm');
const report={scope:'Local compiled-Wasm first deposit; no public transaction claims',wasm_sha256:createHash('sha256').update(bytes).digest('hex'),checks:[],transactions:[]};
let sandbox;
try {
 sandbox=await Sandbox.start({version:'2.14.0'});
 const provider=new JsonRpcProvider({url:sandbox.rpcUrl}),g=GenesisAccount.createDefault(),root=new Account(g.accountId,provider,g.privateKey);
 async function create(name){const k=KeyPair.fromRandom('ed25519'),id=`${name}.${root.accountId}`;await root.createAccount({newAccountId:id,publicKey:k.getPublicKey(),nearToTransfer:50n*Q});return new Account(id,provider,k.toString());}
 const core=await create('core'),alice=await create('alice'),bob=await create('bob');
 const cost=(await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
 await core.signAndSendTransaction({receiverId:core.accountId,actions:[actions.deployContract(bytes),actions.functionCall('new',{network:'sandbox',guardian:root.accountId,oracle:root.accountId,oracle_version:'fixture-v1',storage_byte_cost:cost},GAS,0n)],waitUntil:'FINAL'});
 const view=(method,args={})=>provider.callFunction({contractId:core.accountId,method,args,blockQuery:{finality:'final'}});
 const status=await provider.sendJsonRpc('status',{}),acc=await provider.sendJsonRpc('query',{request_type:'view_account',account_id:core.accountId,finality:'final'});
 const client=new Client({config:{network:'sandbox',chain_id:status.chain_id,genesis_hash:status.genesis_hash,rpc_url:sandbox.rpcUrl,contract_id:core.accountId,code_hash:acc.code_hash},journal:dir});
 const storage=(await view('storage_quote')).account_minimum;
 async function fund(who,label){
  const i=await client.prepare({signer_id:who.accountId,method:'deposit_collateral',args:{},attached_deposit:String(Q/10n+BigInt(storage)),storage_deposit:storage});
  let tx;
  const result=await client.submit(i.operation_id,async r=>{
   assert.equal(r.actions.length,2);
   tx=await who.signAndSendTransaction({receiverId:r.receiverId,actions:r.actions.map(a=>actions.functionCall(a.methodName,a.args,BigInt(a.gas),BigInt(a.deposit))),waitUntil:'FINAL',throwOnFailure:false});
   return {hash:tx.transaction.hash};
  });
  report.transactions.push({label,hash:tx.transaction.hash,state:result.state,receipts:tx.receipts_outcome.map(r=>({id:r.id,status:r.outcome.status,logs:r.outcome.logs}))});
  await assert.rejects(client.handoff(i.operation_id),/ALREADY_ATTEMPTED/);
  return result;
 }
 assert.equal((await fund(alice,'one approval, two actions')).state,'SUCCEEDED');
 const a=await view('get_account',{account_id:alice.accountId});assert.equal(a.free,String(Q/10n));assert.equal(a.storage_paid,storage);
 report.checks.push('Two exact funding events verified from one finalized action receipt; storage and collateral stay separate; one durable handoff');
 // Force the second action to fail. The first action must not leave a registered account.
 await root.signAndSendTransaction({receiverId:core.accountId,actions:[actions.functionCall('set_pauses',{pauses:{deposits:true,series:false,splits:false}},GAS,1n)],waitUntil:'FINAL'});
 assert.equal((await fund(bob,'second action failure rolls back setup')).state,'FAILED_CONFIRMED');
 assert.equal(await view('get_account',{account_id:bob.accountId}),null);
 report.checks.push('Second-action failure rolls back registration; SDK confirms failure only from finalized receipts');
 await writeFile('research/reports/first-deposit-sandbox.json',JSON.stringify(report,null,2)+'\n');console.log(report.checks);
} finally {await sandbox?.stop();await rm(dir,{recursive:true,force:true});}
