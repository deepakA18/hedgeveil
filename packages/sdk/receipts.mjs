import { canonical, fail, METHODS, intentActions } from './intent.mjs';
const success = s => s && (Object.hasOwn(s, 'SuccessValue') || Object.hasOwn(s, 'SuccessReceiptId'));
export function matchTransaction(raw, intent, hash) {
    const tx = raw?.transaction;
    try {
        const expected = intentActions(intent);
        if (tx.hash !== hash || tx.signer_id !== intent.signer_id || tx.receiver_id !== intent.domain.contract_id || tx.actions.length !== expected.length) fail('TRANSACTION_MISMATCH');
        for (let i=0; i<expected.length; i++) {
            const a=tx.actions[i].FunctionCall,e=expected[i];
            if (Object.keys(tx.actions[i]).length !== 1 || a.method_name !== e.methodName ||
                String(a.deposit) !== e.deposit || String(a.gas) !== e.gas ||
                canonical(JSON.parse(Buffer.from(a.args, 'base64').toString())) !== canonical(e.args)) fail('TRANSACTION_MISMATCH');
        }
    }
    catch {
        fail('TRANSACTION_MISMATCH');
    }
}
// FINAL alone is insufficient: retain the complete linked receipt tree, including refunds.
function tree(raw) {
    const root = raw.transaction_outcome;
    if (!root?.outcome || root.id !== raw.transaction.hash || root.outcome.executor_id !== raw.transaction.signer_id || !Array.isArray(raw.receipts_outcome))
        return null;
    const receipts = new Map(raw.receipts_outcome.map(r => [r.id, r]));
    if (receipts.size !== raw.receipts_outcome.length || receipts.has(root.id))
        return null;
    const seen = new Set([root.id]), pending = [root];
    for (let i = 0; i < pending.length; i++) {
        const r = pending[i], o = r.outcome;
        if (!o || !Array.isArray(o.receipt_ids) || (!success(o.status) && !o.status?.Failure))
            return null;
        if (o.status?.SuccessReceiptId && !o.receipt_ids.includes(o.status.SuccessReceiptId))
            return null;
        for (const id of o.receipt_ids) {
            if (seen.has(id) || !receipts.has(id))
                return null;
            seen.add(id);
            pending.push(receipts.get(id));
        }
    }
    return seen.size === receipts.size + 1 ? pending : null;
}
function events(rows, intent) {
    const out = [];
    for (const r of rows) {
        if (!success(r.outcome.status) || r.outcome.executor_id !== intent.domain.contract_id)
            continue;
        for (const log of r.outcome.logs ?? []) {
            if (!log.startsWith('EVENT_JSON:'))
                continue;
            try {
                const envelope = JSON.parse(log.slice(11));
                if (envelope.standard !== 'hedgeveil' || envelope.version !== '0.2.0' || envelope.event !== 'ledger')
                    continue;
                for (const e of envelope.data) {
                    if (e.kind === 'event' && e.schema_version === '0.2.0' && canonical(e.domain) === canonical(intent.domain)) {
                        out.push({ ...e, receipt_id: r.id });
                    }
                }
            }
            catch { /* An unrecognized log cannot establish a transition. */ }
        }
    }
    return out;
}
// Exported for the fault-artifact harness. The production intent builder never allows fault methods.
export async function withdrawalResult(rpc, intent, request, allEvents, base) {
    const deltas = request.deltas.filter(d => d.bucket === 'WITHDRAWAL' && d.direction === 'CREDIT' &&
        d.account_id === intent.signer_id && d.asset.kind === 'COLLATERAL' && d.amount === intent.args.amount);
    if (deltas.length !== 1 || !/^w-(0|[1-9][0-9]*)$/.test(deltas[0].ledger_id)) {
        return { ...base, state: 'WITHDRAWAL_UNKNOWN', reason: 'MISSING_TICKET_BINDING' };
    }
    const ticket_id = deltas[0].ledger_id.slice(2);
    const result = { ...base, ticket_id };
    let ticket;
    try {
        ticket = await rpc.view('get_ticket', { ticket_id });
    }
    catch {
        result.warnings.push('TICKET_VIEW_UNAVAILABLE');
    }
    if (ticket && (ticket.id !== ticket_id || ticket.owner !== intent.signer_id ||
        ticket.receiver !== intent.args.receiver || ticket.amount !== intent.args.amount || ticket.kind !== 'COLLATERAL')) {
        return { ...result, state: 'WITHDRAWAL_UNKNOWN', reason: 'TICKET_MISMATCH' };
    }
    result.ticket_state = ticket?.state ?? null;
    const terminal = allEvents.filter(e => e.actor === intent.domain.contract_id &&
        ['WITHDRAWAL_SUCCEEDED', 'WITHDRAWAL_FAILED_CONFIRMED'].includes(e.event) &&
        e.deltas.some(d => d.bucket === 'WITHDRAWAL' && d.direction === 'DEBIT' &&
            d.ledger_id === `w-${ticket_id}` && d.account_id === intent.signer_id &&
            d.asset.kind === 'COLLATERAL' && d.amount === intent.args.amount));
    if (terminal.length !== 1)
        return { ...result, state: 'WITHDRAWAL_UNKNOWN', reason: 'CALLBACK_UNCONFIRMED' };
    const state = terminal[0].event;
    if (ticket && (ticket.state !== state.slice(11) ||
        ticket.balance_restored !== (state === 'WITHDRAWAL_FAILED_CONFIRMED'))) {
        return { ...result, state: 'WITHDRAWAL_UNKNOWN', reason: 'TICKET_RECEIPT_CONFLICT' };
    }
    return { ...result, state, callback_receipt_id: terminal[0].receipt_id };
}
export async function assess(rpc, raw, intent, hash) {
    matchTransaction(raw, intent, hash);
    const base = { hash, operation_id: intent.operation_id, warnings: [] };
    if (raw.final_execution_status !== 'FINAL')
        return { ...base, state: 'PENDING', reason: 'NOT_FINAL' };
    const rows = tree(raw);
    if (!rows)
        return { ...base, state: 'PENDING', reason: 'INCOMPLETE_RECEIPTS' };
    const root = raw.transaction_outcome;
    if (root.outcome.status.Failure)
        return { ...base, state: 'FAILED_CONFIRMED', reason: 'TRANSACTION_REJECTED' };
    const main = rows.find(r => r.id === root.outcome.status.SuccessReceiptId);
    if (!main || main.outcome.executor_id !== intent.domain.contract_id)
        return { ...base, state: 'PENDING', reason: 'MISSING_ACTION_RECEIPT' };
    if (main.outcome.status.Failure)
        return { ...base, state: 'FAILED_CONFIRMED', reason: 'ACTION_REVERTED', receipt_id: main.id };
    if (rows.some(r => r.outcome.status.Failure))
        base.warnings.push('FAILED_CHILD_RECEIPT');
    const allEvents = events(rows, intent);
    const expected = allEvents.filter(e => e.receipt_id === main.id && e.actor === intent.signer_id && e.event === METHODS[intent.method]);
    if (expected.length !== 1)
        return { ...base, state: 'PENDING', reason: 'MISSING_ACTION_EVENT' };
    if (intent.storage_deposit !== undefined) {
        const own=allEvents.filter(e=>e.receipt_id===main.id && e.actor===intent.signer_id);
        const credit=(e,bucket,amount)=>e.deltas.some(d=>d.bucket===bucket && d.direction==='CREDIT' && d.account_id===intent.signer_id && d.asset.kind==='COLLATERAL' && d.amount===amount);
        if (own.length!==2 || own[0].event!=='STORAGE_DEPOSIT' || own[1].event!=='DEPOSIT' ||
            !credit(own[0],'STORAGE',intent.storage_deposit) || !credit(own[1],'FREE',String(BigInt(intent.attached_deposit)-BigInt(intent.storage_deposit))))
            return {...base,state:'PENDING',reason:'MISSING_FUNDING_EVENTS'};
    }
    base.receipt_id = main.id;
    base.ledger_operation_id = expected[0].operation_id;
    return intent.method === 'request_withdrawal'
        ? withdrawalResult(rpc, intent, expected[0], allEvents, base)
        : { ...base, state: 'SUCCEEDED' };
}
