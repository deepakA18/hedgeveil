// Quote-specific evidence, never a generic timeout-based cancellation.
import {hash32} from './rpc.mjs';
export async function expiredUnfilledQuote(rpc, record) {
    if (!record.attempted || record.hash || record.candidate_hash || record.intent.method !== 'fill_quote') return null;
    const q = record.intent.args.quote;
    const block = await rpc.request('block', {finality:'final'});
    const hash = hash32(block.header.hash), at = block.header.timestamp_nanosec;
    if (typeof at !== 'string' || !/^(0|[1-9][0-9]*)$/.test(at) || BigInt(at) < BigInt(q.expiry_ns)) return null;
    const [code, market] = await Promise.all([
        rpc.request('query', {request_type:'view_account', account_id:record.intent.domain.contract_id, block_id:hash}),
        rpc.view('get_market', {maker:q.maker}, hash)
    ]);
    if (code.block_hash !== hash || code.code_hash !== record.binding.code_hash ||
        market?.epoch !== q.cancellation_epoch || !Array.isArray(market.consumed) || market.consumed.length !== 32 ||
        !market.consumed.every(x => Number.isInteger(x) && x >= 0 && x <= 255)) return null;
    const nonce = Number(q.nonce);
    if (!Number.isInteger(nonce) || nonce < 0 || nonce > 255 || (market.consumed[nonce >> 3] & (1 << (nonce % 8)))) return null;
    return {result:{operation_id:record.intent.operation_id, state:'QUOTE_EXPIRED_UNFILLED', reason:'FINALIZED_UNUSED_NONCE_AFTER_EXPIRY'},
        evidence:{block_hash:hash, timestamp_ns:at, code_hash:code.code_hash, maker:q.maker,
            epoch:market.epoch, nonce:q.nonce, consumed:market.consumed, expiry_ns:q.expiry_ns}};
}
