// Creates a dedicated faucet-funded testnet account. Never reads a mainnet key.
import { connect, keyStores, KeyPair } from 'near-api-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const fetchWithDefaultSignal = globalThis.fetch;
globalThis.fetch = (url, options={}) => fetchWithDefaultSignal(url, {...options, signal:options.signal ?? AbortSignal.timeout(45000)});

const root = resolve(import.meta.dirname, '../..');
const artifacts = resolve(root, '.local/zk-spike');
const wasm = await readFile(resolve(root, 'target/wasm32-unknown-unknown/release/verifier_spike.wasm'));
const init = JSON.parse(await readFile(resolve(artifacts, 'init.json')));
const valid = JSON.parse(await readFile(resolve(artifacts, 'verify.json')));
const reuse = process.argv.includes('--reuse');
const views = process.argv.includes('--views');
const previous = reuse ? JSON.parse(await readFile(resolve(artifacts,'testnet-report.json'))) : null;
const accountId = previous?.account_id ?? `hv-zk-${randomBytes(8).toString('hex')}.testnet`;
if (!/^hv-zk-[0-9a-f]{16}\.testnet$/.test(accountId)) throw new Error('Not a dedicated spike testnet account');
if (reuse && previous.init_sha256 !== createHash('sha256').update(JSON.stringify(init)).digest('hex')) throw new Error('Regenerated setup requires a fresh account');
const key = reuse ? KeyPair.fromString(JSON.parse(await readFile(resolve(root,`.local/testnet-keys/${accountId}.json`))).private_key) : KeyPair.fromRandom('ed25519');
await mkdir(resolve(root, '.local/testnet-keys'), {recursive:true, mode:0o700});
if (!reuse) await writeFile(resolve(root, `.local/testnet-keys/${accountId}.json`),
  JSON.stringify({account_id:accountId, private_key:key.toString()}, null, 2), {mode:0o600, flag:'wx'});
const store = new keyStores.InMemoryKeyStore();
await store.setKey('testnet', accountId, key);
const near = await connect({networkId:'testnet', nodeUrl:'https://rpc.testnet.fastnear.com', keyStore:store});
const report = {network:'testnet', account_id:accountId, wasm_sha256:createHash('sha256').update(wasm).digest('hex'),
  init_sha256:createHash('sha256').update(JSON.stringify(init)).digest('hex'), checks:[], status:'incomplete'};
async function save() {await writeFile(resolve(artifacts,'testnet-report.json'),JSON.stringify(report,null,2));}
try {
  if ((await near.connection.provider.status()).chain_id!=='testnet') throw new Error('Unexpected network');
  const config = await near.connection.provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'});
  report.protocol_version = config.protocol_version;
  report.runtime_wasm_config = config.runtime_config?.wasm_config;
  // Same faucet protocol used by near-cli-rs; fresh public key only.
  if (!reuse) {
  const faucet = await fetch('https://helper.testnet.near.org/account', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({newAccountId:accountId,newAccountPublicKey:key.getPublicKey().toString()}),
    signal:AbortSignal.timeout(45000), redirect:'error'
  });
  if (!faucet.ok) throw new Error(`Faucet HTTP ${faucet.status}`);
  }
  await near.connection.provider.query({request_type:'view_account',account_id:accountId,finality:'final'});
  const account = await near.account(accountId);
  const deployment = await account.deployContract(wasm);
  report.deploy_transaction = deployment.transaction.hash;
  if (!reuse) {
    const initialized = await account.functionCall({contractId:accountId,methodName:'new',args:init,gas:300000000000000n});
    report.init_transaction = initialized.transaction.hash;
  } else {
    report.init_transaction = previous.init_transaction;
  }
  const cases = [['valid',valid,true],
    ['changed_nullifier',JSON.parse(await readFile(resolve(artifacts,'invalid-input.json'))),false],
    ['noncanonical_proof',JSON.parse(await readFile(resolve(artifacts,'malformed-proof.json'))),false]];
  for (let index=0; index<valid.public_inputs.length; index++) {
    const mutated = structuredClone(valid);
    mutated.public_inputs[index] = 'ff'.repeat(32);
    cases.push([`noncanonical_input_${index}`,mutated,false]);
  }
  const short = structuredClone(valid); short.proof=short.proof.slice(2); cases.push(['short_proof',short,false]);
  const infinity=structuredClone(valid); infinity.proof='00'.repeat(64)+infinity.proof.slice(128); cases.push(['infinity_A',infinity,false]);
  const extra=structuredClone(valid); extra.public_inputs.push('00'.repeat(32)); cases.push(['extra_public_input',extra,false]);
  for (const [name,args,expected] of cases) {
    if (views && name!=='valid') {
      const result=await near.connection.provider.query({request_type:'call_function',account_id:accountId,
        method_name:'verify',args_base64:Buffer.from(JSON.stringify(args)).toString('base64'),finality:'final'});
      const returned=JSON.parse(Buffer.from(result.result).toString());
      report.checks.push({name,expected,returned,mode:'view',block_hash:result.block_hash,block_height:result.block_height});
      await save();
      if (returned!==expected) throw new Error(`Unexpected result: ${name}`);
      console.log(`${name}: PASS (view)`);
      continue;
    }
    const result=await account.functionCall({contractId:accountId,methodName:'verify',args,gas:300000000000000n});
    if (typeof result.status !== 'object' || !('SuccessValue' in result.status)) throw new Error(`Receipt failed: ${name}`);
    const returned=JSON.parse(Buffer.from(result.status.SuccessValue,'base64').toString());
    const gas=result.receipts_outcome.reduce((sum,r)=>sum+BigInt(r.outcome.gas_burnt),0n);
    report.checks.push({name,expected,returned,transaction:result.transaction.hash,receipt_gas:gas.toString()});
    await save();
    if (returned!==expected) throw new Error(`Unexpected result: ${name}`);
    if (name==='valid' && gas>250000000000000n) throw new Error('Verifier exceeds 250 Tgas budget');
    console.log(`${name}: ${returned===expected?'PASS':'FAIL'} (${gas} gas)`);
  }
  report.status='deployed_verifier_checks_passed';
  report.source_sha256=createHash('sha256').update(await readFile(resolve(root,'contracts/verifier-spike/src/lib.rs'))).digest('hex');
  await save();
  console.log(`Testnet verifier: ${accountId}`);
} catch (error) {
  // Do not serialize SDK objects, which can contain signing credentials.
  report.failure=error instanceof Error ? error.name : 'UnknownError';
  report.failure_message=error instanceof Error ? error.message.replaceAll(key.toString(),'[REDACTED]').slice(0,1000) : 'unknown';
  await save();
  console.error('Testnet spike did not complete. Account and completed transaction evidence are in .local/zk-spike/testnet-report.json.');
  process.exitCode=1;
}
