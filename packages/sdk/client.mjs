import { buildIntent, canonical, fail, account, intentActions } from './intent.mjs';
import { Rpc, binding, hash32 } from './rpc.mjs';
import { FileJournal } from './journal.mjs';
import { assess, matchTransaction } from './receipts.mjs';
import { retainedSeries } from './series.mjs';
import { expiredUnfilledQuote } from './quote-recovery.mjs';
export class Client {
    constructor({ config, journal, transport }) {
        this.rpc = new Rpc(config, transport);
        this.journal = new FileJournal(journal);
    }
    async prepare(input) {
        const intent = buildIntent({ ...input, network: this.rpc.config.network, contract_id: this.rpc.config.contract_id });
        await this.rpc.verify();
        await this.journal.create(intent, binding(this.rpc.config));
        return intent;
    }
    async record(id) {
        const record = await this.journal.get(id);
        const i = record.intent;
        const rebuilt = buildIntent({ ...i, network: i.domain.network, contract_id: i.domain.contract_id });
        if (canonical(rebuilt) !== canonical(i) || canonical(record.binding) !== canonical(binding(this.rpc.config)) ||
            i.domain.network !== this.rpc.config.network || i.domain.contract_id !== this.rpc.config.contract_id)
            fail('JOURNAL_DEPLOYMENT_MISMATCH');
        if (record.candidate_hash) hash32(record.candidate_hash);
        return record;
    }
    async balances(account_id) {
        account(account_id);
        await this.rpc.verify();
        const block = await this.rpc.request('block', {finality:'final'});
        const blockHash = hash32(block.header.hash);
        const view = (method, args = {}) => this.rpc.view(method, args, blockHash);
        const [accountState, tickets, vault, series] = await Promise.all([
            view('get_account', { account_id }),
            view('list_tickets', { account_id, from_index: 0, limit: 16 }),
            view('get_vault'),
            retainedSeries(view)
        ]);
        return { network: this.rpc.config.network, contract_id: this.rpc.config.contract_id, account_id,
            account: accountState, tickets, vault, series,
            block_hash: blockHash,
            consistency: 'Views pinned to one finalized block; not proof of a prior send.' };
    }
    async handoff(id) {
        const { intent } = await this.record(id);
        await this.rpc.verify();
        // Durable point of no retry, before returning any request to a wallet.
        await this.journal.claim(id);
        return Object.freeze({ signerId: intent.signer_id, receiverId: intent.domain.contract_id,
            network: intent.domain.network, operationId: id, actions: intentActions(intent) });
    }
    async submit(id, signer) {
        const request = await this.handoff(id);
        const onHash = async (hash) => this.rememberHash(id, hash);
        try {
            const response = await signer(request, onHash);
            if (response?.hash)
                await onHash(response.hash);
            else if (response?.cancelled_before_submission === true && !(await this.journal.get(id)).hash && !(await this.journal.get(id)).candidate_hash) {
                return this.journal.observe(id, { operation_id: id, state: 'CANCELLED' });
            }
        }
        catch {
            // Wallet exceptions can contain secrets or occur after broadcast. Never echo or retry them.
            await this.journal.observe(id, { operation_id: id, state: 'SUBMISSION_UNKNOWN', reason: 'SIGNER_RESPONSE_LOST' });
        }
        return this.recover(id);
    }
    async rememberHash(id, hash) {
        const record = await this.record(id);
        if (!record.attempted) fail('NOT_ATTEMPTED');
        hash32(hash);
        if (record.hash && record.hash !== hash) fail('HASH_CONFLICT');
        // A wallet/redirect value is an untrusted hint, not an immutable binding.
        await this.journal.observe(id, { operation_id: id, state: 'SUBMISSION_UNKNOWN',
            candidate_hash: hash, reason: 'SIGNER_HASH_UNVERIFIED' });
    }
    async recover(id, suppliedHash) {
        const record = await this.record(id);
        await this.rpc.verify();
        const hash = suppliedHash ?? record.hash ?? record.candidate_hash;
        if (!hash) {
            if (record.result?.state === 'QUOTE_EXPIRED_UNFILLED') return record.result;
            try {
                const resolved = await expiredUnfilledQuote(this.rpc, record);
                if (resolved) return this.journal.observe(id, resolved.result, resolved.evidence);
            } catch { /* Missing evidence never resolves an unknown attempt. */ }
            return record.result ?? { operation_id: id, state: record.attempted ? 'SUBMISSION_UNKNOWN' : 'PREPARED' };
        }
        hash32(hash);
        if (!record.attempted)
            fail('NOT_ATTEMPTED');
        if (record.hash && record.hash !== hash)
            fail('HASH_CONFLICT');
        let raw;
        try {
            raw = await this.rpc.request('tx', { tx_hash: hash, sender_account_id: record.intent.signer_id, wait_until: 'FINAL' });
        }
        catch {
            if (record.result && ['SUCCEEDED', 'FAILED_CONFIRMED', 'WITHDRAWAL_SUCCEEDED', 'WITHDRAWAL_FAILED_CONFIRMED'].includes(record.result.state))
                return record.result;
            return this.journal.observe(id, { operation_id: id, hash: record.hash, state: 'SUBMISSION_UNKNOWN', reason: 'RPC_UNAVAILABLE' });
        }
        // A manually recovered hash must match the intent before it becomes permanently bound.
        matchTransaction(raw, record.intent, hash);
        await this.journal.bind(id, hash);
        const result = await assess(this.rpc, raw, record.intent, hash);
        await this.journal.observe(id, result, raw);
        return (await this.journal.get(id)).result;
    }
}
