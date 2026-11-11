import {Q,uint,fail} from './amounts.mjs';
export const assetId=a=>a.kind==='COLLATERAL'?'COLLATERAL':`${a.kind}:${a.series_id}`;
export function owned(state,account,asset) {
    const a=state.accounts[account];
    if(!a)return 0n;
    if(asset.kind==='COLLATERAL')return uint(a.free);
    const s=state.series.find(s=>s.config.series_id===asset.series_id);
    return s?uint(a.positions[s.slot][asset.kind.toLowerCase()]):0n;
}
export function basket(v,quantity,exit=false) {
    const n=uint(quantity,128,true);
    if(!v||v.closed)fail('VAULT_CLOSED');
    const supply=uint(v.supply);
    if(exit&&(supply===0n||n>supply))fail('INSUFFICIENT_SHARES');
    const base=supply===0n?v.seed:v.holdings,den=supply===0n?uint(v.initial_shares,128,true):supply;
    return base.map(l=>({asset:l.asset,amount:String((n*uint(l.amount)+(exit?0n:den-1n))/den)}));
}
export function shortfalls(state,account,legs) {
    const totals=new Map();for(const l of legs){const id=assetId(l.asset);totals.set(id,{asset:l.asset,amount:(totals.get(id)?.amount??0n)+uint(l.amount)});}
    return [...totals.values()].map(l=>({...l,amount:String(l.amount),shortfall:String(l.amount>owned(state,account,l.asset)?l.amount-owned(state,account,l.asset):0n)}));
}
export function payoff(strike,price,quantity=String(Q)) {
    const k=uint(strike,128,true),m=uint(price,128,true),n=uint(quantity);
    const p=m<=k?Q:k*Q/m;
    return {p:String(n*p/Q),n:String(n*(Q-p)/Q)};
}
export const stateText={
 PREPARED:'Ready for review. Nothing has been sent.',
 CANCELLED:'Signing cancelled. This operation cannot be submitted again.',
 SUBMISSION_UNKNOWN:'Submission uncertain. Check receipts; do not repeat this action.',
 PENDING:'Receipt pending. A transaction hash is not confirmation.',
 SUCCEEDED:'Confirmed by finalized receipts and the matching ledger event.',
 FAILED_CONFIRMED:'The contract action failed. Review receipts before creating a different action.',
 WITHDRAWAL_SUCCEEDED:'Native payout and its callback are confirmed.',
 WITHDRAWAL_FAILED_CONFIRMED:'Native payout failed; the callback confirmed restoration to free collateral.',
 WITHDRAWAL_UNKNOWN:'Payout unresolved. Funds stay quarantined. A timeout never authorizes resend or refund.'
};
export const errorText={
 MERGE_AFTER_FINALIZATION:'This series is finalized. Redeem each claim using its final payout instead of merging.',
 MAKER_UNAVAILABLE:'The maker could not return an offer. No trade was submitted. Try again when the maker service is available.',
 MAKER_RPC_UNAVAILABLE:'The maker cannot verify current chain state. No trade was submitted. Wait briefly, then request a fresh quote.',
 MAKER_TIMEOUT:'The maker took too long to respond. No trade was submitted. Wait briefly before requesting again.',
 ORACLE_SAMPLE_MISSED:'This series missed a required oracle sample. New trades are disabled. Wait for a new series; existing funds and claims remain in your ledger.',
 ORACLE_UNAVAILABLE:'Verified oracle state is unavailable or paused. New trades are disabled until it is available.',
 SERIES_UNAVAILABLE:'This series is expired, finalized or unavailable for trading. Select an active series when one is available.',
 MARKET_DATA_UNAVAILABLE:'Fresh market data is unavailable. The maker has not issued a new quote. Try again later.',

 UNRESOLVED_OPERATION:'An earlier action of this type is unresolved. Recover it before creating another deposit or withdrawal.',
 INDEXER_UNHEALTHY:'Indexer stale or unreconciled. Refresh before adding risk. Receipt recovery and exits remain available.',
 INSUFFICIENT_STORAGE:'Register storage before using the ledger. Storage is separate from collateral.',
 INSUFFICIENT_GAS:'The local wallet lacks the attached deposit plus the gas allowance.',
 INSUFFICIENT_ASSETS:'Your ledger holdings do not cover this action. See the required assets and shortfalls.',
 QUOTE_STALE:'Quote expired. Request a new quote and review its amounts.',
 QUOTE_CANCELLED:'The maker cancelled or consumed this quote, or revoked its signing key.',
 QUOTE_UNFUNDED:'The maker no longer has enough funded inventory. Request a new quote.',
 SETTLEMENT_UNRESOLVED:'Settlement is unresolved. Claims remain in your ledger until finalization or an available exit.',
 ALREADY_ATTEMPTED:'This operation already has a signing attempt. Check receipts; never resubmit it.',
 BROWSER_STORAGE_UNAVAILABLE:'Browser storage is unavailable. Signing is disabled; use the recovery CLI.',
 RPC_UNAVAILABLE:'RPC unavailable. Recover this operation later; do not repeat a money-moving action.',
 INVALID_NEAR_AMOUNT:'Enter a non-negative decimal with at most 24 decimal places; no exponent or commas.',
 INVALID_INTEGER:'Enter a canonical whole atomic amount.',
 MISSING_OPERATION:'No retained operation was found. Use the server journal and recovery CLI; do not recreate a lost deposit.'
};
