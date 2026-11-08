import assert from 'node:assert/strict';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { execFileSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Sandbox, GenesisAccount } from 'near-sandbox';
import { Account, JsonRpcProvider, KeyPair, actions } from 'near-api-js';
import { Client, toWireIntent } from '../../packages/sdk/index.mjs';
import { base58, Rpc } from '../../packages/sdk/rpc.mjs';
import { withdrawalResult } from '../../packages/sdk/receipts.mjs';
import { baseQuote, signQuote } from '../../packages/rfq/codec.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url)), Q = 10n ** 24n, GAS = 250n * 10n ** 12n;
const artifacts = JSON.parse(await readFile(path.join(ROOT, 'target/core-artifacts/manifest.json'))), wasm = {};
for (const [file, meta] of Object.entries(artifacts)) {
    wasm[file] = await readFile(path.join(ROOT, 'target/core-artifacts', file));
    assert.equal(createHash('sha256').update(wasm[file]).digest('hex'), meta.sha256);
}
const exports = WebAssembly.Module.exports(await WebAssembly.compile(wasm['clearinghouse.wasm'])).map(x => x.name);
assert(!exports.some(x => x.startsWith('fault_')));
const evidence = { scope: 'APP-01 local SDK and durable recovery CLI; real Sandbox receipts, synthetic oracle fixture, in-memory test signers; no browser wallet, public testnet or production recovery', versions: { rust: '1.96.0', near_sdk: '5.30.1', near_api_js: '7.4.0', near_sandbox_js: '0.3.5', node: process.version, sandbox: '2.14.0' }, artifacts, recoveries: [], operations: [], checks: [], transactions: [], events: [] };
async function hashes(dir, prefix) { const out = {}; for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['target', 'node_modules', '__pycache__'].includes(e.name))
        continue;
    const key = path.posix.join(prefix, e.name), full = path.join(dir, e.name);
    if (e.isDirectory())
        Object.assign(out, await hashes(full, key));
    else if (/\.(rs|toml|lock|mjs|json|py)$/.test(e.name))
        out[key] = createHash('sha256').update(await readFile(full)).digest('hex');
} return out; }
evidence.sources = { ...await hashes(path.join(ROOT, 'contracts'), 'contracts'), ...await hashes(path.join(ROOT, 'crates/protocol-types'), 'crates/protocol-types'), ...await hashes(path.join(ROOT, 'crates/payoff-math'), 'crates/payoff-math') };
for (const file of ['tests/sandbox/g7.mjs', 'scripts/recover.mjs', 'tests/sdk/client.test.mjs', 'tests/sdk/types.mts', 'tests/sandbox/package.json', 'tests/sandbox/package-lock.json', 'scripts/build-core.py', 'packages/shared-schemas/public-ledger.schema.json'])
    evidence.sources[file] = createHash('sha256').update(await readFile(path.join(ROOT, file))).digest('hex');
evidence.base_commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const reportFile = process.argv[2] === '--report' ? process.argv[3] : 'research/reports/g7-client.json';
if (!reportFile)
    throw Error('missing --report path');
let sandbox, provider, byteCost;
const eventBalances = new Map(), seenOps = new Set();
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); evidence.checks.push(name); console.log('PASS', name); };
const outcomes = tx => [tx.transaction_outcome, ...tx.receipts_outcome];
const failed = tx => outcomes(tx).some(x => x.outcome.status.Failure);
const assetId = a => a.kind === 'COLLATERAL' ? 'COLLATERAL' : a.kind === 'VAULT_SHARE' ? `VAULT_SHARE:${a.vault_id}` : `${a.kind}:${a.series_id}`;
function record(label, tx) {
    evidence.transactions.push({ label, hash: tx.transaction.hash, status: tx.status, gas_burnt: outcomes(tx).reduce((s, r) => s + BigInt(r.outcome.gas_burnt), 0n).toString(), receipts: tx.receipts_outcome.map(r => ({ id: r.id, executor: r.outcome.executor_id, status: r.outcome.status, gas_burnt: String(r.outcome.gas_burnt) })) });
    for (const r of tx.receipts_outcome) {
        if (r.outcome.status.Failure)
            continue;
        for (const log of r.outcome.logs) {
            if (!log.startsWith('EVENT_JSON:'))
                continue;
            const envelope = JSON.parse(log.slice(11));
            if (envelope.standard !== 'hedgeveil')
                continue;
            for (const e of envelope.data) {
                assert.equal(e.domain.contract_id, r.outcome.executor_id);
                assert(!seenOps.has(e.operation_id), 'duplicate operation');
                seenOps.add(e.operation_id);
                evidence.events.push({ receipt_id: r.id, event: e });
                for (const d of e.deltas) {
                    const key = JSON.stringify([e.domain.contract_id, d.account_id, d.bucket, d.ledger_id, assetId(d.asset)]);
                    const n = (eventBalances.get(key) ?? 0n) + (d.direction === 'CREDIT' ? 1n : -1n) * BigInt(d.amount);
                    assert(n >= 0n, 'event replay underflow');
                    eventBalances.set(key, n);
                }
            }
        }
    }
}
async function call(who, c, method, args = {}, deposit = 0n, expect = 'success') {
    const tx = await who.signAndSendTransaction({ receiverId: c.accountId, actions: [actions.functionCall(method, args, GAS, deposit)], waitUntil: 'FINAL', throwOnFailure: false });
    record(`${c.accountId}.${method}`, tx);
    if (expect === 'success')
        assert(!failed(tx), `${method}: ${JSON.stringify(tx.status)}`);
    else if (expect === 'failure')
        assert(failed(tx), `expected failure: ${method}`);
    return tx;
}
const view = (c, method, args = {}) => provider.callFunction({ contractId: c.accountId, method, args, blockQuery: { finality: 'final' } });
async function create(root, name, balance = 50n * Q) { const key = KeyPair.fromRandom('ed25519'), id = `${name}.${root.accountId}`; const tx = await root.createAccount({ newAccountId: id, publicKey: key.getPublicKey(), nearToTransfer: balance }); assert(!failed(tx)); return new Account(id, provider, key.toString()); }
async function deploy(root, name, file, args) { const c = await create(root, name); const tx = await c.signAndSendTransaction({ receiverId: c.accountId, actions: [actions.deployContract(wasm[file]), actions.functionCall('new', args, GAS, 0n)], waitUntil: 'FINAL', throwOnFailure: false }); record(`deploy:${name}`, tx); assert(!failed(tx), JSON.stringify(tx.status)); return c; }
async function now() { return BigInt((await provider.sendJsonRpc('block', { finality: 'final' })).header.timestamp_nanosec); }
async function advancePast(t) { for (let i = 0; i < 150; i++) {
    if (await now() >= t)
        return;
    await provider.sendJsonRpc('sandbox_fast_forward', { delta_height: 1000 });
} throw Error('clock deadline not reached'); }
function config(id, end, oracle) { return { series_id: id, version: '1', collateral_kind: 'NATIVE_NEAR', index_definition_hash: '1'.repeat(64), payoff_kind: 'CAPPED_USD_COMPLEMENT', strike: '2000000000000', price_scale: '1000000000000', maturity_ns: String(end), mint_cutoff_ns: String(end - 60000000000n), observation_window: { start_ns: String(end - 300000000000n), end_ns: String(end) }, oracle_account_id: oracle.accountId, oracle_version: 'fixture-v1', oracle_config_hash: '2'.repeat(64), finalization_policy_hash: '3'.repeat(64), max_supply: String(100n * Q) }; }
Object.assign(evidence.sources, await hashes(path.join(ROOT, 'packages/sdk'), 'packages/sdk'), await hashes(path.join(ROOT, 'packages/rfq'), 'packages/rfq'));
for (const file of ['packages/sdk/index.d.mts', 'docs/CLIENT.md'])
    evidence.sources[file] = createHash('sha256').update(await readFile(path.join(ROOT, file))).digest('hex');
const work = path.join(ROOT, 'target', `g7-${randomUUID()}`);
await mkdir(work, { recursive: true });
const journal = path.join(work, 'journal'), configPath = path.join(work, 'config.json');
let client, clientConfig, alice, core;
function tracked(c) { const original = c.rpc.request.bind(c.rpc); c.rpc.request = async (m, p) => { const raw = await original(m, p); if (m === 'tx' && !evidence.recoveries.some(r => r.transaction.hash === raw.transaction.hash))
    evidence.recoveries.push(raw); return raw; }; return c; }
async function signer(request, onHash) { assert.equal(request.signerId, alice.accountId); assert.equal(request.receiverId, core.accountId); assert.equal(request.network, 'sandbox'); assert.equal(request.actions.length, 1); const a = request.actions[0]; const tx = await call(alice, core, a.methodName, a.args, BigInt(a.deposit), 'mixed'); await onHash(tx.transaction.hash); return { hash: tx.transaction.hash }; }
async function operation(method, args = {}, deposit = '1', adapter = signer, expected = 'SUCCEEDED') {
    const intent = await client.prepare({ signer_id: alice.accountId, method, args, attached_deposit: deposit });
    const result = await client.submit(intent.operation_id, adapter);
    assert.equal(result.state, expected, JSON.stringify(result));
    evidence.operations.push({ intent, result });
    return { intent, result };
}
async function cli(command, args = [], allowFailure = false) {
    return new Promise((resolve, reject) => {
        const child = fork(path.join(ROOT, 'scripts/recover.mjs'), [command, '--config', configPath, '--journal', journal, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { PATH: process.env.PATH, HOME: work } });
        let out = '', err = '';
        child.stdout.on('data', x => out += x);
        child.stderr.on('data', x => err += x);
        child.on('message', async (request) => { try {
            const result = await signer(request, async () => { });
            child.send({ ...result, operationId: request.operationId });
        }
        catch {
            if (child.connected)
                child.send({ operationId: request.operationId, error: 'SIGNER_FAILED' });
        } });
        child.on('error', reject);
        child.on('close', code => { try {
            if (code && !allowFailure)
                throw Error(`CLI failed ${err}`);
            resolve({ code, value: JSON.parse(code ? err : out) });
        }
        catch (e) {
            reject(e);
        } });
    });
}
async function cliOperation(method, args) { const p = (await cli('prepare', ['--account', alice.accountId, '--method', method, '--args', JSON.stringify(args)])).value; const s = (await cli('submit', ['--id', p.operation_id, '--signer', path.join(ROOT, 'packages/sdk/ipc-signer.mjs')])).value; assert.equal(s.state, 'SUCCEEDED'); const r = (await cli('recover', ['--id', p.operation_id])).value; assert.equal(r.state, 'SUCCEEDED'); evidence.operations.push({ intent: p, result: r, via: 'CLI fresh prepare/submit/recover processes' }); evidence.recoveries.push(await client.rpc.request('tx', { tx_hash: r.hash, sender_account_id: alice.accountId, wait_until: 'FINAL' })); return r; }
try {
    sandbox = await Sandbox.start({ version: '2.14.0' });
    provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
    const g = GenesisAccount.createDefault(), root = new Account(g.accountId, provider, g.privateKey);
    alice = await create(root, 'alice');
    const bob = await create(root, 'bob'), sink = await create(root, 'sink');
    byteCost = BigInt((await provider.sendJsonRpc('EXPERIMENTAL_protocol_config', { finality: 'final' })).runtime_config.storage_amount_per_byte);
    const oracle = await deploy(root, 'oracle', 'oracle-fixture.wasm', { owner: root.accountId });
    const init = { network: 'sandbox', guardian: alice.accountId, oracle: oracle.accountId, oracle_version: 'fixture-v1', storage_byte_cost: String(byteCost) };
    core = await deploy(root, 'core', 'clearinghouse.wasm', init);
    const fault = await deploy(root, 'fault', 'clearinghouse-fault.wasm', init);
    const status = await provider.sendJsonRpc('status', {});
    evidence.runtime = status;
    clientConfig = { rpc_url: sandbox.rpcUrl, network: 'sandbox', chain_id: status.chain_id, genesis_hash: status.genesis_hash, contract_id: core.accountId, code_hash: base58(createHash('sha256').update(wasm['clearinghouse.wasm']).digest()) };
    evidence.configuration = clientConfig;
    await writeFile(configPath, JSON.stringify(clientConfig));
    client = tracked(new Client({ config: clientConfig, journal }));
    await client.rpc.verify();
    check('SDK pins actual chain, genesis, core code and stored domain', await client.rpc.view('deployment_identity'), { protocol_version: '1', network: 'sandbox', contract_id: core.accountId });
    const storage = BigInt((await view(core, 'storage_quote')).account_minimum);
    await operation('storage_deposit', {}, String(storage));
    await operation('deposit_collateral', {}, String(Q));
    await call(bob, core, 'storage_deposit', {}, storage);
    await call(bob, core, 'deposit_collateral', {}, Q);
    check('SDK keeps storage separate from collateral', (await client.balances(alice.accountId)).account.free, String(Q));
    const end = await now() + 600000000000n, cfg = config('alpha', end, oracle);
    await call(alice, core, 'create_series', { config: cfg }, storage + Q / 1000n);
    await operation('split', { series_id: 'alpha', amount: '1000' });
    await operation('transfer', { asset: { kind: 'P', series_id: 'alpha' }, amount: '10', receiver: bob.accountId });
    await cliOperation('merge', { series_id: 'alpha', amount: '10' });
    check('CLI merge uses actual signer and recovers in a fresh process', (await view(core, 'get_series', { series_id: 'alpha' })).reserve, '990');
    const pair = generateKeyPairSync('ed25519'), publicHex = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
    await call(bob, core, 'register_signing_key', { key_id: 'client-key', public_key: publicHex }, storage + 1n);
    const q = signQuote({ ...baseQuote({ contract: core.accountId, maker: bob.accountId, taker: alice.accountId, keyId: 'client-key', nonce: 0, epoch: 0, expiry: await now() + 300000000000n, feeReceiver: bob.accountId }), maker_gives: [{ asset: { kind: 'P', series_id: 'alpha' }, amount: '1' }], taker_gives: [{ asset: { kind: 'COLLATERAL' }, amount: '1' }] }, pair.privateKey);
    await operation('fill_quote', { quote: q });
    check('SDK serializes a real signed funded RFQ', (await view(core, 'get_market', { maker: bob.accountId })).consumed[0], 1);
    const seed = [{ asset: { kind: 'P', series_id: 'alpha' }, amount: '100' }, { asset: { kind: 'COLLATERAL' }, amount: '100' }];
    await call(alice, core, 'create_vault', { vault_id: 'basket', seed, initial_shares: '100' }, storage + 1n);
    await operation('vault_mint_basket', { vault_id: 'basket', shares: '100', max_inputs: seed });
    await cliOperation('vault_redeem_in_kind', { vault_id: 'basket', shares: '100', min_outputs: seed });
    check('CLI exits all actual basket assets and closes last-holder vault', (await view(core, 'get_vault')).closed, true);
    const before = (await view(core, 'get_account', { account_id: alice.accountId })).free;
    let lostHash, sends = 0;
    const lost = await operation('deposit_collateral', {}, '17', async (req) => { sends++; const r = await signer(req, async () => { }); lostHash = r.hash; throw Error('lost response'); }, 'SUBMISSION_UNKNOWN');
    const restarted = tracked(new Client({ config: clientConfig, journal }));
    await assert.rejects(restarted.submit(lost.intent.operation_id, () => { sends++; }), /ALREADY_ATTEMPTED/);
    const recovered = await restarted.recover(lost.intent.operation_id, lostHash);
    assert.equal(recovered.state, 'SUCCEEDED');
    evidence.operations.find(x => x.intent?.operation_id === lost.intent.operation_id).recovered_result = recovered;
    check('lost deposit response recovers without a second send', [sends, (await view(core, 'get_account', { account_id: alice.accountId })).free], [1, String(BigInt(before) + 17n)]);
    await operation('merge', { series_id: 'alpha', amount: '1' }, '1', async (req, onHash) => { await signer(req, onHash); throw Error('response lost after hash'); });
    check('durable hash recovers despite later signer exception', true, true);
    const cancelled = await operation('merge', { series_id: 'alpha', amount: '1' }, '1', async () => ({ cancelled_before_submission: true }), 'CANCELLED');
    const count = evidence.transactions.length;
    await assert.rejects(restarted.submit(cancelled.intent.operation_id, signer), /ALREADY_ATTEMPTED/);
    check('cancelled prompt consumes only local attempt', evidence.transactions.length, count);
    let signed = false;
    const wrong = tracked(new Client({ config: { ...clientConfig, code_hash: base58(Buffer.alloc(32, 9)) }, journal }));
    await assert.rejects(wrong.prepare({ signer_id: alice.accountId, method: 'merge', args: { series_id: 'alpha', amount: '1' } }), /DEPLOYMENT_MISMATCH/);
    const pin = await client.prepare({ signer_id: alice.accountId, method: 'merge', args: { series_id: 'alpha', amount: '1' } });
    const bad = new Client({ config: { ...clientConfig, genesis_hash: base58(Buffer.alloc(32, 8)) }, journal });
    await assert.rejects(bad.submit(pin.operation_id, () => { signed = true; }), /JOURNAL_DEPLOYMENT_MISMATCH/);
    check('wrong deployment refuses signing', signed, false);
    const failure = await operation('merge', { series_id: 'alpha', amount: String(100n * Q) }, '1', signer, 'FAILED_CONFIRMED');
    const repeat = await cli('submit', ['--id', failure.intent.operation_id, '--signer', path.join(ROOT, 'packages/sdk/ipc-signer.mjs')], true);
    check('CLI rejects repeating a confirmed failed operation', repeat.value.error, 'ALREADY_ATTEMPTED');
    const nativeBefore = await sink.getBalance();
    const paid = await operation('request_withdrawal', { amount: '100', receiver: sink.accountId }, '1', signer, 'WITHDRAWAL_SUCCEEDED');
    check('SDK payout confirmation agrees with actual native balance', (await sink.getBalance()) - nativeBefore, 100n);
    await operation('close_ticket', { ticket_id: paid.result.ticket_id });
    assert.equal((await restarted.recover(paid.intent.operation_id)).state, 'WITHDRAWAL_SUCCEEDED');
    check('closed ticket still recoverable from linked finalized callback', true, true);
    const free = (await view(core, 'get_account', { account_id: alice.accountId })).free;
    const failedPayout = await operation('request_withdrawal', { amount: '100', receiver: 'missing.sandbox' }, '1', signer, 'WITHDRAWAL_FAILED_CONFIRMED');
    check('failed transfer is confirmed restoration, not payout success', [(await view(core, 'get_account', { account_id: alice.accountId })).free, failedPayout.result.warnings.includes('FAILED_CHILD_RECEIPT')], [free, true]);
    await call(alice, fault, 'storage_deposit', {}, storage);
    await call(alice, fault, 'deposit_collateral', {}, Q);
    const faultConfig = { ...clientConfig, contract_id: fault.accountId, code_hash: base58(createHash('sha256').update(wasm['clearinghouse-fault.wasm']).digest()) }, faultRpc = new Rpc(faultConfig);
    await faultRpc.verify();
    for (const mode of [1, 2]) {
        const old = await sink.getBalance();
        const tx = await call(alice, fault, 'fault_withdrawal', { amount: '100', receiver: sink.accountId, fault: mode }, 1n, 'failure');
        const raw = await faultRpc.request('tx', { tx_hash: tx.transaction.hash, sender_account_id: alice.accountId, wait_until: 'FINAL' });
        evidence.recoveries.push(raw);
        const es = evidence.events.filter(e => raw.receipts_outcome.some(r => r.id === e.receipt_id)).map(e => ({ ...e.event, receipt_id: e.receipt_id }));
        const request = es.find(e => e.event === 'WITHDRAWAL_REQUESTED');
        assert(request);
        const result = await withdrawalResult(faultRpc, { signer_id: alice.accountId, domain: { protocol_version: '1', network: 'sandbox', contract_id: fault.accountId }, args: { amount: '100', receiver: sink.accountId } }, request, es, { hash: tx.transaction.hash, warnings: [] });
        evidence.operations.push({ via: 'shared withdrawal classifier on separate fault artifact; no SDK fault write surface', result });
        check(`successful native payout with callback fault ${mode} remains unresolved`, [(await sink.getBalance()) - old, result.state, result.ticket_state], [100n, 'WITHDRAWAL_UNKNOWN', 'PENDING']);
    }
    await advancePast(await now() + 5000000000n);
    for (const ticket_id of ['0', '1'])
        await call(bob, fault, 'mark_unknown', { ticket_id });
    check('fault payouts remain quarantined without client refund/resend', (await view(fault, 'custody_snapshot')).unknown_in_flight, '200');
    await advancePast(end);
    await call(root, oracle, 'set_report', { series_id: 'alpha', report: { config: cfg, state: 'FINALIZED', price: '3000000000000' } });
    await call(alice, core, 'request_resolution', { series_id: 'alpha' });
    await cliOperation('redeem', { series_id: 'alpha', leg: 'P', amount: '3' });
    check('CLI redemption follows actual synthetic finalization', await view(core, 'series_state', { series_id: 'alpha' }), 'FINALIZED');
    const balances = (await cli('balances', ['--account', alice.accountId])).value;
    check('fresh CLI reports actual ownership and retained tickets', balances.account, await view(core, 'get_account', { account_id: alice.accountId }));
    evidence.custody = { normal: await view(core, 'custody_snapshot'), fault: await view(fault, 'custody_snapshot') };
    evidence.recoveries = [...new Map(evidence.recoveries.map(r => [r.transaction.hash, r])).values()];
    await writeFile(path.join(ROOT, 'target/g7-events.json'), JSON.stringify([...evidence.events.map(x => x.event), ...evidence.operations.filter(x => x.intent).map(x => toWireIntent(x.intent))]));
    execFileSync('uv', ['run', '--offline', '--with', 'jsonschema==4.23.0', 'python', '-c', "import sys,json;sys.path.insert(0,'packages/shared-schemas');from validate import validate;[validate(e) for e in json.load(open('target/g7-events.json'))]"], { cwd: ROOT, env: { ...process.env, UV_CACHE_DIR: '/private/tmp/hedgeveil-uv-cache' }, stdio: 'pipe' });
    check('actual emitted records and SDK intents validate against shared schema', true, true);
    evidence.passed = true;
    await writeFile(path.join(ROOT, reportFile), JSON.stringify(evidence, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n');
    console.log('Evidence', reportFile);
}
finally {
    if (sandbox)
        await sandbox.stop();
}
