import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, FileJournal, buildIntent, parseNear, formatNear } from '../../packages/sdk/index.mjs';
import { base58, binding, Rpc } from '../../packages/sdk/rpc.mjs';
import { assess } from '../../packages/sdk/receipts.mjs';
const h = n => base58(Buffer.alloc(32, n));
const config = { rpc_url: 'http://127.0.0.1:1234/', network: 'sandbox', chain_id: 'local', genesis_hash: h(1), code_hash: h(2), contract_id: 'core.sandbox' };
const input = { signer_id: 'alice.sandbox', contract_id: config.contract_id, method: 'merge', args: { series_id: 'alpha', amount: '1' }, operation_id: 'a'.repeat(64) };
const event = intent => ({ kind: 'event', schema_version: '0.2.0', domain: intent.domain, actor: intent.signer_id, event: 'MERGE', operation_id: 'b'.repeat(64), deltas: [] });
function fixture(intent = buildIntent(input)) {
    const row = (id, executor, status, ids = [], logs = []) => ({ id, outcome: { executor_id: executor, status, receipt_ids: ids, logs } });
    return { final_execution_status: 'FINAL', status: { SuccessValue: '' }, transaction: { hash: h(3), signer_id: intent.signer_id, receiver_id: intent.domain.contract_id,
            actions: [{ FunctionCall: { method_name: intent.method, args: Buffer.from(JSON.stringify(intent.args)).toString('base64'), deposit: intent.attached_deposit, gas: Number(intent.gas) } }] },
        transaction_outcome: row(h(3), intent.signer_id, { SuccessReceiptId: h(4) }, [h(4)]), receipts_outcome: [row(h(4), config.contract_id, { SuccessValue: '' }, [], ['EVENT_JSON:' + JSON.stringify({ standard: 'hedgeveil', version: '0.2.0', event: 'ledger', data: [event(intent)] })])] };
}
function transport(raw, overrides = {}) {
    return { fetchImpl: async (_url, { body }) => {
            const { method, params } = JSON.parse(body);
            let result;
            if (method === 'status')
                result = { chain_id: config.chain_id, genesis_hash: config.genesis_hash };
            else if (method === 'tx')
                result = raw;
            else if (params.request_type === 'view_account')
                result = { code_hash: config.code_hash };
            else if (params.method_name === 'deployment_identity')
                result = { result: [...Buffer.from(JSON.stringify({ protocol_version: '1', network: 'sandbox', contract_id: config.contract_id }))] };
            else
                result = { result: [...Buffer.from('null')] };
            if (Object.hasOwn(overrides, method))
                result = overrides[method];
            return { ok: true, json: async () => ({ result }) };
        } };
}
async function setup(t) {
    const dir = await mkdtemp(join(tmpdir(), 'hedgeveil-sdk-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const client = new Client({ config, journal: dir, transport: transport(fixture()) });
    return { dir, client };
}
test('amount conversion is exact at one yocto and u128 maximum', () => {
    for (const v of ['0', '1', '1000000000000000000000001', String((1n << 128n) - 1n)])
        assert.equal(parseNear(formatNear(v)), v);
    for (const v of [1, 1.1, '1e3', '01', '-1', '1.0000000000000000000000001', String(1n << 128n)])
        assert.throws(() => parseNear(v));
    assert.throws(() => buildIntent({ ...input, args: { series_id: 'alpha', amount: 1 } }));
});
test('unsupported methods, extra fields, wrong deposit, quote domain and duplicate limits rejected', () => {
    assert.throws(() => buildIntent({ ...input, method: 'deposit_collateral', args: {} }), /FUNDING_AMOUNT_REQUIRED/);
    for (const patch of [{ method: 'fault_withdrawal' }, { method: 'mark_unknown' }, { attached_deposit: '2' }, { args: { series_id: 'alpha', amount: '1', extra: 'x' } }])
        assert.throws(() => buildIntent({ ...input, ...patch }));
    const leg = { asset: { kind: 'P', series_id: 'alpha' }, amount: '1' };
    assert.throws(() => buildIntent({ ...input, method: 'vault_mint_basket', args: { vault_id: 'v1', shares: '1', max_inputs: [leg, leg] } }));
    assert.throws(() => buildIntent({ ...input, method: 'fill_quote', args: { quote: { domain: { network: 'testnet' } } } }));
});
test('public chain and non-loopback RPC config rejected', () => {
    for (const patch of [{ network: 'testnet' }, { rpc_url: 'https://rpc.testnet.near.org/' }, { chain_id: 'mainnet' }, { rpc_url: 'http://user:secret@127.0.0.1:1234/' }])
        assert.throws(() => new Rpc({ ...config, ...patch }));
});
test('journal creates idempotently; simultaneous submission claims have one winner', async (t) => {
    const { dir } = await setup(t), j = new FileJournal(dir), i = buildIntent(input);
    await j.create(i, binding(config));
    await j.create(i, binding(config));
    await assert.rejects(j.create({ ...i, args: { series_id: 'alpha', amount: '2' } }, binding(config)), /OPERATION_ID_CONFLICT/);
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => j.claim(i.operation_id)));
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
    await assert.rejects(new FileJournal(dir).claim(i.operation_id), /ALREADY_ATTEMPTED/);
});
test('corrupt journal fails closed without signing', async (t) => {
    const { dir, client } = await setup(t);
    await client.prepare(input);
    await writeFile(join(dir, input.operation_id, 'intent.json'), '{');
    let signed = false;
    await assert.rejects(client.submit(input.operation_id, () => { signed = true; }), /JOURNAL_CORRUPT/);
    assert.equal(signed, false);
});
test('lost response with no hash stays ambiguous after restart; supplied matching hash recovers', async (t) => {
    const { dir, client } = await setup(t);
    await client.prepare(input);
    let sends = 0;
    const result = await client.submit(input.operation_id, () => { sends++; throw Error('private key must not escape'); });
    assert.equal(result.state, 'SUBMISSION_UNKNOWN');
    assert(!JSON.stringify(result).includes('private key'));
    const restarted = new Client({ config, journal: dir, transport: transport(fixture()) });
    await assert.rejects(restarted.submit(input.operation_id, () => { sends++; }), /ALREADY_ATTEMPTED/);
    assert.equal((await restarted.recover(input.operation_id, h(3))).state, 'SUCCEEDED');
    assert.equal(sends, 1);
});
test('recorded hash survives thrown signer response; cancellation consumes attempt', async (t) => {
    const { client } = await setup(t);
    await client.prepare(input);
    const r = await client.submit(input.operation_id, async (_req, onHash) => { await onHash(h(3)); throw Error('lost'); });
    assert.equal(r.state, 'SUCCEEDED');
    const second = await client.prepare({ ...input, operation_id: 'c'.repeat(64) });
    assert.equal((await client.submit(second.operation_id, async () => ({ cancelled_before_submission: true }))).state, 'CANCELLED');
    await assert.rejects(client.submit(second.operation_id, async () => ({ hash: h(3) })), /ALREADY_ATTEMPTED/);
});
test('wrong code or chain prevents signing, without consuming attempt', async (t) => {
    const { client } = await setup(t);
    await client.prepare(input);
    let sends = 0;
    client.rpc.fetch = transport(fixture(), { status: { chain_id: 'wrong', genesis_hash: config.genesis_hash } }).fetchImpl;
    await assert.rejects(client.submit(input.operation_id, () => { sends++; }), /DEPLOYMENT_MISMATCH/);
    assert.equal(sends, 0);
    assert.equal((await client.record(input.operation_id)).attempted, false);
});
test('a hash or top-level success never confirms missing, non-final or mismatched receipts', async () => {
    const i = buildIntent(input), rpc = {};
    for (const mutate of [r => r.final_execution_status = 'EXECUTED', r => r.receipts_outcome = [], r => r.transaction_outcome.id = h(9), r => r.receipts_outcome[0].outcome.logs = []]) {
        const r = fixture(i);
        mutate(r);
        assert.equal((await assess(rpc, r, i, h(3))).state, 'PENDING');
    }
    for (const mutate of [r => r.transaction.signer_id = 'other.sandbox', r => r.transaction.receiver_id = 'other.sandbox', r => r.transaction.actions[0].FunctionCall.deposit = '2', r => r.transaction.actions.push(r.transaction.actions[0])]) {
        const r = fixture(i);
        mutate(r);
        await assert.rejects(assess(rpc, r, i, h(3)), /TRANSACTION_MISMATCH/);
    }
    const bad = fixture(i);
    bad.receipts_outcome[0].outcome.status = { Failure: { error: 'revert' } };
    assert.equal((await assess(rpc, bad, i, h(3))).state, 'FAILED_CONFIRMED');
});
test('wrong manually recovered hash cannot poison journal', async (t) => {
    const { client } = await setup(t);
    await client.prepare(input);
    await client.submit(input.operation_id, async () => undefined);
    await assert.rejects(client.recover(input.operation_id, h(5)), /TRANSACTION_MISMATCH/);
    assert.equal((await client.record(input.operation_id)).hash, null);
    assert.equal((await client.recover(input.operation_id, h(3))).state, 'SUCCEEDED');
});
test('terminal evidence persists through later transport loss and conflicting evidence fails closed', async (t) => {
    const { client } = await setup(t);
    await client.prepare(input);
    await client.submit(input.operation_id, async () => ({ hash: h(3) }));
    const original = client.rpc.request.bind(client.rpc);
    client.rpc.request = async (m, p) => { if (m === 'tx')
        throw Error('offline'); return original(m, p); };
    assert.equal((await client.recover(input.operation_id)).state, 'SUCCEEDED');
    await client.journal.observe(input.operation_id, { state: 'FAILED_CONFIRMED', hash: h(3) });
    await assert.rejects(client.record(input.operation_id), /JOURNAL_EVIDENCE_CONFLICT/);
});
test('withdrawal receipt classification binds tickets and never infers restoration from timeout or missing callback', async () => {
    const { withdrawalResult } = await import('../../packages/sdk/receipts.mjs');
    const i = buildIntent({ ...input, method: 'request_withdrawal', args: { amount: '100', receiver: 'sink.sandbox' } });
    const delta = { account_id: i.signer_id, bucket: 'WITHDRAWAL', ledger_id: 'w-0', asset: { kind: 'COLLATERAL' }, direction: 'CREDIT', amount: '100' };
    const request = { deltas: [delta] }, base = { hash: h(3), warnings: [] };
    const ticket = { id: '0', owner: i.signer_id, receiver: i.args.receiver, amount: '100', kind: 'COLLATERAL', state: 'PENDING', balance_restored: false };
    const terminal = state => ({ actor: i.domain.contract_id, event: state, receipt_id: h(5), deltas: [{ ...delta, direction: 'DEBIT' }] });
    const classify = (t, es = []) => withdrawalResult({ view: async () => t }, i, request, es, structuredClone(base));
    assert.equal((await classify(ticket)).state, 'WITHDRAWAL_UNKNOWN');
    assert.equal((await classify({ ...ticket, state: 'UNKNOWN' })).state, 'WITHDRAWAL_UNKNOWN');
    assert.equal((await classify(null)).state, 'WITHDRAWAL_UNKNOWN');
    assert.equal((await classify({ ...ticket, state: 'SUCCEEDED' }, [terminal('WITHDRAWAL_SUCCEEDED')])).state, 'WITHDRAWAL_SUCCEEDED');
    assert.equal((await classify({ ...ticket, state: 'FAILED_CONFIRMED', balance_restored: true }, [terminal('WITHDRAWAL_FAILED_CONFIRMED')])).state, 'WITHDRAWAL_FAILED_CONFIRMED');
    assert.equal((await classify(null, [terminal('WITHDRAWAL_SUCCEEDED')])).state, 'WITHDRAWAL_SUCCEEDED');
    assert.equal((await classify(ticket, [terminal('WITHDRAWAL_SUCCEEDED')])).reason, 'TICKET_RECEIPT_CONFLICT');
    assert.equal((await classify({ ...ticket, receiver: 'attacker.sandbox' }, [terminal('WITHDRAWAL_SUCCEEDED')])).reason, 'TICKET_MISMATCH');
    assert.equal((await classify(ticket, [{ ...terminal('WITHDRAWAL_SUCCEEDED'), actor: 'attacker.sandbox' }])).state, 'WITHDRAWAL_UNKNOWN');
    const unavailable = await withdrawalResult({ view: async () => { throw Error('offline'); } }, i, request, [], structuredClone(base));
    assert.equal(unavailable.state, 'WITHDRAWAL_UNKNOWN');
    assert(unavailable.warnings.includes('TICKET_VIEW_UNAVAILABLE'));
});
test('failed refund child does not erase a committed atomic action; foreign event cannot confirm it', async () => {
    const i = buildIntent(input), raw = fixture(i);
    raw.receipts_outcome[0].outcome.receipt_ids = [h(5)];
    raw.receipts_outcome.push({ id: h(5), outcome: { executor_id: i.signer_id, receipt_ids: [], logs: [], status: { Failure: { reason: 'refund failed' } } } });
    const result = await assess({}, raw, i, h(3));
    assert.equal(result.state, 'SUCCEEDED');
    assert.deepEqual(result.warnings, ['FAILED_CHILD_RECEIPT']);
    raw.receipts_outcome[0].outcome.logs = [raw.receipts_outcome[0].outcome.logs[0].replace('core.sandbox', 'attacker.sandbox')];
    assert.equal((await assess({}, raw, i, h(3))).state, 'PENDING');
});
