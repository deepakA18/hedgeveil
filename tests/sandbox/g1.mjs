import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Sandbox, GenesisAccount } from 'near-sandbox';
import { Account, JsonRpcProvider, KeyPair, actions } from 'near-api-js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const YOCTO = 10n ** 24n;
const GAS = 200n * 10n ** 12n;
const NODE_VERSION = '2.14.0';
const observations = JSON.parse(execFileSync('python3', [path.join(ROOT, 'scripts/replay-g1-observation.py')], {encoding:'utf8'}));
assert.deepEqual(observations, JSON.parse(execFileSync('python3', [path.join(ROOT, 'scripts/replay-g1-observation.py')], {encoding:'utf8'})));
const manifest = JSON.parse(await readFile(path.join(ROOT,'target/g1-artifacts/manifest.json')));
const wasm = {};
for (const [name, info] of Object.entries(manifest)) {
  wasm[name] = await readFile(path.join(ROOT,'target/g1-artifacts',name));
  assert.equal(createHash('sha256').update(wasm[name]).digest('hex'), info.sha256);
}
// Prove normal artifact has no test-only callback injection exports.
const exports = WebAssembly.Module.exports(await WebAssembly.compile(wasm['core.wasm'])).map(x=>x.name);
assert(!exports.some(x=>x.startsWith('fault_')));
const evidence = {scope:'G1 isolated Sandbox experiments; not production or full token conformance',
  versions:{rust:'1.96.0',near_sdk:'5.30.1',near_contract_standards:'5.30.1',near_api_js:'7.4.0',near_sandbox_js:'0.3.5',sandbox:NODE_VERSION,node:process.version},
  artifacts:manifest, observation:observations, checks:[], transactions:[]};
async function sourceHashes(dir, prefix='') {
  const result = {};
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(['target','node_modules','__pycache__'].includes(entry.name)) continue;
    const key = path.posix.join(prefix,entry.name), full = path.join(dir,entry.name);
    if(entry.isDirectory()) Object.assign(result,await sourceHashes(full,key));
    else if(/\.(rs|toml|lock|mjs|json|py)$/.test(entry.name)) result[key]=createHash('sha256').update(await readFile(full)).digest('hex');
  }
  return result;
}
evidence.sources = {...await sourceHashes(path.join(ROOT,'research/g1'),'research/g1'),
  ...await sourceHashes(path.join(ROOT,'tests/sandbox'),'tests/sandbox'),
  ...await sourceHashes(path.join(ROOT,'fixtures/synthetic-prices'),'fixtures/synthetic-prices')};
for(const file of ['scripts/build-g1.py','scripts/replay-g1-observation.py']) evidence.sources[file]=createHash('sha256').update(await readFile(path.join(ROOT,file))).digest('hex');
evidence.base_commit = execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
let sandbox;
let provider;
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); evidence.checks.push(name); console.log(`PASS ${name}`); };
const outcomes = tx => [tx.transaction_outcome,...tx.receipts_outcome];
const failed = tx => outcomes(tx).some(x => typeof x.outcome.status === 'object' && 'Failure' in x.outcome.status);
function record(label, tx) {
  evidence.transactions.push({label, hash:tx.transaction.hash, status:tx.status,
    gas_burnt:outcomes(tx).reduce((n,x)=>n+BigInt(x.outcome.gas_burnt),0n).toString(),
    receipts:tx.receipts_outcome.map(x=>({id:x.id,executor:x.outcome.executor_id,gas_burnt:String(x.outcome.gas_burnt),status:x.outcome.status}))});
}
async function call(who, contract, method, args={}, deposit=0n, expectation='success') {
  const tx = await who.signAndSendTransaction({receiverId:contract.accountId,
    actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});
  record(`${contract.accountId}.${method}`,tx);
  if(expectation === 'success') assert(!failed(tx), JSON.stringify(tx.status));
  else if(expectation === 'failure') assert(failed(tx),`expected receipt failure in ${method}`);
  return tx;
}
const view = (contract,method,args={}) => provider.callFunction({contractId:contract.accountId,method,args,blockQuery:{finality:'final'}});
async function create(parent,name,balance=20n*YOCTO) {
  const key = KeyPair.fromRandom('ed25519');
  const id = `${name}.${parent.accountId}`;
  const tx = await parent.createAccount({newAccountId:id,publicKey:key.getPublicKey(),nearToTransfer:balance});
  assert(!failed(tx));
  return new Account(id,provider,key.toString());
}
async function deploy(parent,name,artifact,args) {
  const account = await create(parent,name);
  const tx = await account.signAndSendTransaction({receiverId:account.accountId,actions:[actions.deployContract(wasm[artifact]),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});
  record(`deploy:${name}`,tx); assert(!failed(tx), JSON.stringify(tx.status)); return account;
}
async function advance(blocks) { await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:blocks}); }
async function advancePast(deadline) {
  // Advance according to observed chain time, not an assumed seconds-per-block.
  for(let i=0;i<500;i++) {
    const block = await provider.sendJsonRpc('block',{finality:'final'});
    if(BigInt(block.header.timestamp_nanosec) >= BigInt(deadline)) return;
    await advance(10);
  }
  throw new Error('Sandbox did not reach the declared deadline');
}
try {
  sandbox = await Sandbox.start({version:NODE_VERSION});
  assert(['127.0.0.1','localhost'].includes(new URL(sandbox.rpcUrl).hostname));
  provider = new JsonRpcProvider({url:sandbox.rpcUrl});
  const genesis = GenesisAccount.createDefault();
  const root = new Account(genesis.accountId,provider,genesis.privateKey);
  const alice = await create(root,'alice',100n*YOCTO);
  const bob = await create(root,'bob');
  const sink = await create(root,'sink');
  const oracleArgs = {terms:observations.terms,proposer:alice.accountId,adjudicator:bob.accountId,
    challenge_ns:'30000000000',arbitration_ns:'60000000000',bond:(YOCTO/100n).toString()};
  const oracle = await deploy(root,'oracle','oracle.wasm',oracleArgs);
  const coreArgs = {owner:alice.accountId,oracle:oracle.accountId,terms:observations.terms};
  const core = await deploy(root,'core','core.wasm',coreArgs);
  const fault = await deploy(root,'fault','core-fault.wasm',coreArgs);
  check('normal core excludes all fault APIs',exports.some(x=>x.startsWith('fault_')),false);
  for(const c of [core,fault]) {
    await call(alice,c,'register',{account_id:alice.accountId});
    await call(alice,c,'register',{account_id:bob.accountId});
    await call(alice,c,'deposit_collateral',{},10n*YOCTO);
  }
  await call(bob,core,'register',{account_id:sink.accountId},0n,'failure');
  await call(sink,core,'deposit_collateral',{},YOCTO, 'failure');
  await call(alice,core,'deposit_collateral',{},0n,'failure');
  check('deposit isolation',await view(core,'balance_of',{account_id:alice.accountId}),(10n*YOCTO).toString());
  const before = await sink.getBalance();
  await call(alice,core,'request_withdrawal',{amount:YOCTO.toString(),receiver:sink.accountId},1n);
  check('native recipient received exact payout',(await sink.getBalance())-before,YOCTO);
  check('successful ticket', (await view(core,'ticket',{id:0})).state,'SUCCEEDED');
  await call(alice,core,'request_withdrawal',{amount:YOCTO.toString(),receiver:'missing.sandbox'},1n,'mixed');
  const failure = await view(core,'ticket',{id:1});
  check('confirmed failure restores original owner once',[failure.state,failure.balance_restored,await view(core,'balance_of',{account_id:alice.accountId})],['FAILED_CONFIRMED',true,(9n*YOCTO).toString()]);
  await call(bob,core,'on_payout',{id:0,version:1,fault:0},0n,'failure');
  await call(bob,core,'request_withdrawal',{amount:'1',receiver:bob.accountId},1n,'failure');
  check('unauthorized callback/debit leaves balances',[await view(core,'balance_of',{account_id:alice.accountId}),await view(core,'balance_of',{account_id:bob.accountId})],[(9n*YOCTO).toString(),'0']);

  for(const mode of [1,2]) {
    const prior = await sink.getBalance();
    await call(alice,fault,'fault_withdrawal',{amount:YOCTO.toString(),receiver:sink.accountId,fault:mode},1n,'failure');
    check(`external success survives callback fault ${mode}`,(await sink.getBalance())-prior,YOCTO);
    check(`failed callback leaves pending ${mode}`,(await view(fault,'ticket',{id:mode-1})).state,'PENDING');
  }
  await advance(20);
  for(const id of [0,1]) await call(bob,fault,'mark_unknown',{id});
  check('unknown tickets remain unavailable',await view(fault,'balance_of',{account_id:alice.accountId}),(8n*YOCTO).toString());
  check('unknown liabilities retained',(await view(fault,'totals')).quarantined,(2n*YOCTO).toString());
  await call(alice,fault,'mark_unknown',{id:0},0n,'failure');
  await call(alice,fault,'retry_withdrawal',{id:0},0n,'failure');
  await call(alice,fault,'fault_replay',{id:0,malformed:true});
  check('malformed payout result cannot restore or succeed',(await view(fault,'ticket',{id:0})).state,'UNKNOWN');
  await call(alice,fault,'request_withdrawal',{amount:'100',receiver:sink.accountId},1n);
  await call(alice,fault,'fault_replay',{id:2,malformed:false});
  check('duplicate success does not pay twice',(await view(fault,'ticket',{id:2})).state,'SUCCEEDED');
  await call(alice,fault,'request_withdrawal',{amount:'100',receiver:'missing.sandbox'},1n,'mixed');
  const restored = await view(fault,'balance_of',{account_id:alice.accountId});
  await call(alice,fault,'fault_replay',{id:3,malformed:false});
  check('terminal failure cannot be overwritten or restored twice',[(await view(fault,'ticket',{id:3})).state,await view(fault,'balance_of',{account_id:alice.accountId})],['FAILED_CONFIRMED',restored]);

  await call(bob,core,'on_resolution',{},0n,'failure');
  await call(alice,core,'request_resolution');
  check('nonfinal report cannot settle',await view(core,'final_price'),null);
  const bond = YOCTO/100n;
  await call(bob,oracle,'propose',{price:observations.price,source_hash:observations.terms.source_hash},bond,'failure');
  await call(alice,oracle,'propose',{price:'0',source_hash:observations.terms.source_hash},bond,'failure');
  await call(alice,oracle,'propose',{price:observations.price,source_hash:'0'.repeat(64)},bond,'failure');
  await call(alice,oracle,'propose',{price:observations.price,source_hash:observations.terms.source_hash},bond);
  await call(alice,oracle,'finalize',{},0n,'failure');
  await advancePast(await view(oracle,'deadline'));
  await call(alice,oracle,'finalize');
  await call(alice,core,'request_resolution');
  check('bound finalized synthetic observation imported',await view(core,'final_price'),observations.price);
  await call(bob,oracle,'adjudicate',{price:'1'},0n,'failure');
  await call(alice,core,'request_resolution');
  check('finalization immutable and imports idempotent',await view(core,'final_price'),observations.price);
  for(const field of ['request_id','series_id','config_hash','source_hash','oracle_version','end_ns','proposer','challenge_ns']) {
    const terms = {...observations.terms,[field]:field.endsWith('hash')?'f'.repeat(64):field==='end_ns'?'1700000300000000001':field==='challenge_ns'?'30000000001':'mismatch'};
    const wrong = await deploy(root,`wrong-${field.replaceAll('_','-')}`,'core.wasm',{...coreArgs,terms});
    await call(alice,wrong,'request_resolution');
    check(`reject mismatched oracle ${field}`,await view(wrong,'final_price'),null);
  }
  for(const mode of ['dispute','delay']) {
    const o = await deploy(root,mode,'oracle.wasm',oracleArgs);
    await call(alice,o,'propose',{price:observations.price,source_hash:observations.terms.source_hash},bond);
    await call(bob,o,'challenge',{evidence_hash:'a'.repeat(64)},bond);
    check(`${mode} records two separate bonds`,await view(o,'bonds_locked'),(2n*bond).toString());
    await call(alice,o,'finalize',{},0n,'failure');
    await call(alice,o,'adjudicate',{price:'3000000000000'},0n,'failure');
    await call(bob,o,'adjudicate',{price:'3000000000000'},0n,'failure');
    await advancePast(BigInt(await view(o,'deadline'))+(mode==='delay'?60_000_000_000n:0n));
    if(mode==='dispute') {
      await call(bob,o,'adjudicate',{price:'3000000000000'});
      check('disclosed adjudicator finalizes challenged observation',(await view(o,'report')).price,'3000000000000');
    } else {
      await call(bob,o,'mark_delayed');
      check('missed arbitration delays rather than invents price',[(await view(o,'report')).state,(await view(o,'report')).price],['RESOLUTION_DELAYED',null]);
    }
  }

  const token = await deploy(root,'tokens','tokens.wasm',{owner:alice.accountId});
  const receiver = await deploy(root,'receiver','receiver.wasm',{token:token.accountId,sink:sink.accountId});
  for(const [label,oracleId] of [['malformed',receiver.accountId],['failed','absent.sandbox']]) {
    const rejected = await deploy(root,`oracle-${label}`,'core.wasm',{...coreArgs,oracle:oracleId});
    await call(alice,rejected,'request_resolution',{},0n,'mixed');
    check(`${label} oracle response cannot settle`,await view(rejected,'final_price'),null);
  }
  for(const a of [alice,bob,sink,receiver]) {
    await call(a,token,'storage_deposit',{},YOCTO/10n);
    await call(alice,token,'fixture_register_mt',{account_id:a.accountId});
  }
  await call(alice,token,'fixture_seed',{account_id:alice.accountId,amount:'1000'});
  const ftBalance = a => view(token,'ft_balance_of',{account_id:a.accountId});
  const mtBalance = (a,id='P') => view(token,'mt_balance_of',{account_id:a.accountId,token_id:id});
  check('FT/P/N namespaces begin distinct',[await ftBalance(alice),await mtBalance(alice),await mtBalance(alice,'N')],['1000','1000','1000']);
  await call(alice,token,'mt_transfer',{receiver_id:bob.accountId,token_id:'P',amount:'10'},1n);
  check('MT transfer leaves FT and other MT unchanged',[await ftBalance(alice),await mtBalance(alice),await mtBalance(alice,'N')],['1000','990','1000']);
  await call(bob,token,'mt_transfer',{receiver_id:alice.accountId,token_id:'P',amount:'10'},1n);
  await call(alice,token,'mt_batch_transfer',{receiver_id:bob.accountId,token_ids:['P','P'],amounts:['1','1']},1n,'failure');
  await call(alice,token,'mt_batch_transfer',{receiver_id:bob.accountId,token_ids:['P','N'],amounts:['1','1001']},1n,'failure');
  check('batch failure rolls back preceding leg',await mtBalance(alice),'1000');
  await call(alice,token,'storage_unregister',{force:true},1n,'failure');
  await call(alice,token,'storage_unregister',{force:false},1n,'failure');
  await call(bob,token,'storage_withdraw',{amount:'1'},1n,'failure');
  await call(bob,token,'storage_unregister',{force:false},1n);
  check('zero FT storage unregister',await view(token,'storage_balance_of',{account_id:bob.accountId}),null);
  await call(alice,token,'ft_transfer',{receiver_id:bob.accountId,amount:'1'},1n,'failure');
  for(const kind of ['ft','mt']) {
    const balance = kind==='ft'?ftBalance:mtBalance;
    const supply = () => view(token,kind==='ft'?'ft_total_supply':'mt_supply',kind==='ft'?{}:{token_id:'P'});
    for(const mode of ['panic','malformed','over','partial','burn','spend']) {
      const start = BigInt(await balance(alice)), total = BigInt(await supply());
      const tx = await call(alice,token,`${kind}_transfer_call`,{receiver_id:receiver.accountId,amount:'100',...(kind==='mt'?{token_id:'P'}:{}),msg:mode},1n,'mixed');
      assert(!('Failure' in tx.status),'resolver must finish even after receiver failure');
      const loss = mode==='partial'?50n:['burn','spend'].includes(mode)?40n:0n;
      check(`${kind} ${mode} refund bounded by remaining balance`,BigInt(await balance(alice)),start-loss);
      check(`${kind} ${mode} supply conservation`,BigInt(await supply()),total-(mode==='burn'?40n:0n));
      const remaining = await balance(receiver);
      if(BigInt(remaining)>0n) await call(receiver,token,`${kind}_transfer`,{receiver_id:alice.accountId,amount:remaining,...(kind==='mt'?{token_id:'P'}:{})},1n);
    }
    await call(alice,token,`${kind}_transfer`,{receiver_id:sink.accountId,amount:'1',...(kind==='mt'?{token_id:'P'}:{})},0n,'failure');
  }
  await call(bob,token,'mt_resolve_transfer',{sender_id:alice.accountId,receiver_id:receiver.accountId,token_id:'P',amount:'100'},0n,'failure');
  await call(bob,token,'ft_resolve_transfer',{sender_id:alice.accountId,receiver_id:receiver.accountId,amount:'100'},0n,'failure');
  // Exercise the full bounded ticket vector, including callback work at capacity.
  for(let id=2;id<32;id++) await call(alice,core,'request_withdrawal',{amount:'1',receiver:sink.accountId},1n);
  check('callback succeeds at 32-ticket capacity',(await view(core,'ticket',{id:31})).state,'SUCCEEDED');
  const cappedFree = await view(core,'balance_of',{account_id:alice.accountId});
  await call(alice,core,'request_withdrawal',{amount:'1',receiver:sink.accountId},1n,'failure');
  check('ticket cap rejects without debiting',await view(core,'balance_of',{account_id:alice.accountId}),cappedFree);
  for(let i=0;i<6;i++) await call(alice,core,'register',{account_id:`registered-${i}.sandbox`});
  await call(alice,core,'register',{account_id:'overflow.sandbox'},0n,'failure');
  check('exact free balance after successful payouts and one restoration',cappedFree,(9n*YOCTO-30n).toString());
  check('independent observation process replay',observations,JSON.parse(execFileSync('python3',[path.join(ROOT,'scripts/replay-g1-observation.py')],{encoding:'utf8'})));
  evidence.custody = {normal:await view(core,'totals'),fault:await view(fault,'totals')};
  evidence.native_accounts = {};
  for(const c of [core,fault,oracle,token]) evidence.native_accounts[c.accountId] = await provider.viewAccount({accountId:c.accountId,blockQuery:{finality:'final'}});
  evidence.runtime = await provider.viewNodeStatus();
  check('actual node matches pinned version',evidence.runtime.version.version,NODE_VERSION);
  evidence.protocol_storage_amount_per_byte = (await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte;
  check('normal core custody covers free balances and storage',
    BigInt(evidence.native_accounts[core.accountId].amount) >= BigInt(cappedFree)+BigInt(evidence.native_accounts[core.accountId].storage_usage)*BigInt(evidence.protocol_storage_amount_per_byte),true);
  evidence.passed = true;
  await mkdir(path.join(ROOT,'research/reports'),{recursive:true});
  await writeFile(path.join(ROOT,'research/reports/g1-sandbox.json'),JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
  console.log(`G1: ${evidence.checks.length} checks; ${evidence.transactions.length} recorded transactions.`);
} catch(error) {
  evidence.passed = false;
  evidence.error = String(error);
  await writeFile(path.join(ROOT,'target/g1-failed.json'),JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
  throw error;
} finally {
  if(sandbox) await sandbox.tearDown();
}
