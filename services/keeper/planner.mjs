// Public chain snapshots only. The contract rechecks funding and every guard.
import {Q,uint,verifyQuote} from '../../packages/rfq/codec.mjs';
export function chooseRoll({policy,reference,now_ns,core,holdings,candidates}) {
 const now=uint(now_ns,64);
 if(!reference||now<uint(reference.observed_ns,64)||now-uint(reference.observed_ns,64)>uint(policy.max_reference_age_ns,64))return {quote:null,reason:'STALE_REFERENCE'};
 const old=holdings.find(l=>l.asset.kind==='P'&&l.asset.series_id===policy.old_series_id);
 if(!old||uint(old.amount)===0n)return {quote:null,reason:'NO_OLD_POSITION'};
 const valid=[];
 for(const {quote:q,registry,available_new_p} of candidates){try{
  const key=registry.keys[q.signing_key_id],nonce=uint(q.nonce,64);
  if(!key||key.revoked||!verifyQuote(q,key.public_key)||q.cancellation_epoch!==registry.epoch||nonce>=256n||((registry.consumed[Number(nonce/8n)]|registry.cancelled[Number(nonce/8n)])&(1<<Number(nonce%8n))))continue;
  if(q.domain.network!=='sandbox'||q.domain.contract_id!==core||q.taker!==core||q.maker===core||q.expiry_ns<=now||uint(q.expiry_ns,64)>uint(reference.observed_ns,64)+uint(policy.quote_horizon_ns,64))continue;
  if(q.kind!=='quote'||q.fill_rule!=='ALL_OR_NOTHING'||q.rounding!=='EXACT_AMOUNTS'||q.maker_gives.length!==1||![1,2].includes(q.taker_gives.length))continue;
  const give=q.maker_gives[0],take=q.taker_gives[0];
  if(give.asset.kind!=='P'||give.asset.series_id!==policy.new_series_id||take.asset.kind!=='P'||take.asset.series_id!==policy.old_series_id||take.amount!==old.amount||uint(give.amount)>uint(available_new_p))continue;
  const cash=q.taker_gives[1]?uint(q.taker_gives[1].amount):0n;
  if(q.taker_gives[1]?.asset.kind&&q.taker_gives[1].asset.kind!=='COLLATERAL')continue;
  const fee=uint(q.fee.amount),output=uint(give.amount)*uint(reference.new_price)/Q,input=(uint(old.amount)*uint(reference.old_price)+Q-1n)/Q+cash+fee,loss=input>output?input-output:0n;
  if(q.fee.asset!=='NATIVE_NEAR'||q.fee.receiver!==policy.fee_receiver||fee>uint(policy.max_fee)||fee>uint(policy.total_fee_budget)||cash>uint(policy.max_cash_input)||uint(give.amount)<uint(policy.min_receive)||input>uint(policy.max_notional)||output>uint(policy.max_notional)||loss>input*BigInt(policy.max_loss_bps)/10000n||loss>uint(policy.total_loss_budget))continue;
  valid.push({quote:q,score:output-cash-fee});
 }catch{/* Malformed/unverifiable candidates cannot become proposals. */}}
 valid.sort((a,b)=>a.score===b.score?a.quote.maker.localeCompare(b.quote.maker):a.score>b.score?-1:1);
 return valid.length?{quote:valid[0].quote,reason:null,eligible_count:valid.length}:{quote:null,reason:'NO_ACCEPTABLE_QUOTE',eligible_count:0};
}
