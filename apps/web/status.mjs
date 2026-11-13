// Public diagnostics are an allowlisted projection, never raw runtime/journal data.
export function serviceStatus({snapshot, runtime, now=Date.now(), configured=true}) {
 const rows=[];
 const add=(id,name,state,detail,at=null)=>rows.push({id,name,state,detail,observed_at:at});
 const age=at=>{const n=Date.parse(at);return Number.isFinite(n)&&n<=now?now-n:Infinity;};
 const h=snapshot?.health;
 const fresh=!!h&&Number.isFinite(h.age_ms)&&h.age_ms>=0&&h.age_ms<60000&&!h.stale;
 const checked=fresh?new Date(now-h.age_ms).toISOString():null;
 const number=n=>/^\d+$/.test(String(n))?String(n):'unknown';
 add('api','Application API','operational','Status endpoint is responding.',new Date(now).toISOString());
 add('indexer','Receipt reconciliation',!h?'unknown':h.risk_allowed&&h.reconciled&&fresh?'operational':'degraded',
  !h?'No reconciliation observation available.':`Block ${number(h.height)}. ${fresh?Math.floor(h.age_ms/1000)+'s since the last snapshot.':'Snapshot is stale or unavailable.'} ${h.risk_allowed&&h.reconciled&&fresh?'Trading data checks passed.':'New risk stays blocked until checks pass.'}`,checked);
 add('rpc','NEAR RPC reads',fresh&&h.reconciled?'operational':'unknown',
  fresh&&h.reconciled?`Latest reconciliation reads succeeded. ${number(h.rpc_failovers??0)} fallback reads since indexer startup.`:'No recent successful reconciliation to verify RPC reads. Individual providers are not independently probed.',checked);
 add('contracts','Core and resolver',fresh&&h.reconciled?'operational':configured?'unknown':'degraded',
  fresh&&h.reconciled?'Deployed contracts passed the latest pinned-code and same-block reconciliation checks.':configured?'Waiting for fresh contract reconciliation.':'Deployment is not configured.',checked);
 const feed=h?.discovery;
 add('discovery','FASTNEAR background audit',!feed?'unknown':feed.fresh&&feed.state==='SCANNING'&&Number(feed.lag_blocks)<=64?'operational':'degraded',
  !feed?'No discovery observation available.':`${number(feed.lag_blocks)} blocks behind. ${['FEED_RATE_LIMITED','FEED_COOLDOWN'].includes(feed.state)?'Provider rate limit; automatic backoff is active. ':''}${feed.required===false?'Background coverage is incomplete; trading uses receipt reconciliation.':'Required discovery feed.'}`,feed?.checked_at??null);
 for(let i=0;i<2;i++){
  const m=runtime?.makers?.[i];
  const recent=m&&age(m.checked_at)<90000;
  const heartbeat=m?.health&&age(m.health.checked_at)<75000;
  const failed=m?.offered===false;
  const state=!m?'unknown':!m.connected?'unavailable':runtime.maintaining?'degraded':heartbeat&&!m.health.ready?'degraded':failed?'degraded':recent&&m.offered||heartbeat&&m.health.ready?'operational':'unknown';
  const detail=!m?'Maker telemetry unavailable.':!m.connected?'Maker process is disconnected.':runtime.maintaining?'Inventory maintenance is in progress.':heartbeat&&!m.health.ready?healthReason(m.health.reason):failed?makerReason(m.reason):recent&&m.offered?'A recent request returned a signed offer. Quantity and inventory are checked on each request.':heartbeat&&m.health.ready?'Worker health check passed. Idle; pricing and funded size are checked when you review a trade.':'No recent worker response or offer result. Health is unverified.';
  add(`maker-${i+1}`,`Maker ${i+1}`,state,detail,heartbeat?m.health.checked_at:recent?m.checked_at:null);
 }
 const keeper=runtime?.keeper, renewed=runtime?.renewal;
 const bad=new Set(['KEEPER_ERROR','HALTED_SIGNER','HALTED_TRANSACTION','PAUSED','EVIDENCE_REJECTED_REVIEW_REQUIRED']);
 const items=keeper?.items??[], blocked=items.filter(x=>bad.has(x.state));
 const pending=items.filter(x=>!['WAIT_EXPIRY','COMPLETE'].includes(x.state)&&!bad.has(x.state));
 add('settlement','Outlayer settlement',age(keeper?.checked_at)>=120000?'unknown':blocked.length?'degraded':pending.length?'degraded':'operational',
  age(keeper?.checked_at)>=120000?'No recent keeper check. Settlement readiness is unverified.':blocked.some(x=>x.state==='HALTED_SIGNER')?'A settlement transaction has no verified final receipt. Signer quarantined; the request is not resent. This does not establish an Outlayer outage.':blocked.length?`${blocked.length} series need operator review; payouts are not assumed complete.`:pending.length?`${pending.length} series awaiting evidence, callbacks or finalization.`:`Keeper checked ${items.length} series. ${items.filter(x=>x.state==='COMPLETE').length} complete; the others await expiry. External source availability is verified when requested.`,keeper?.checked_at??null);
 add('renewal','Market renewal',age(renewed?.checked_at)>=180000?'unknown':renewed.state==='RECONCILED'?'operational':'degraded',
  age(renewed?.checked_at)>=180000?'No recent renewal check.':renewed.state==='RECONCILED'?'The scheduled market ladder passed its latest reconciliation.':renewed.code==='RENEWAL_UNRESOLVED'?'Blocked by an unresolved service transaction. Receipt recovery is required before new markets can be created.':'Renewal is blocked. Operator review of funding, capacity or retained receipts is required.',renewed?.checked_at??null);
 return {checked_at:new Date(now).toISOString(),services:rows};
}
function healthReason(reason){
 if(reason==='MAKER_WITHDRAWN')return 'Maker is retired and is not issuing offers.';
 if(reason==='CANCELLATION_UNRESOLVED')return 'A quote cancellation needs receipt recovery before new offers can be issued.';
 if(reason==='MAKER_MAINTENANCE')return 'Worker is paused for inventory maintenance.';
 return 'Worker health check failed or timed out. Offer availability is unverified.';
}
function makerReason(reason){
 if(['MAKER_RPC_UNAVAILABLE','MAKER_TIMEOUT'].includes(reason))return 'RPC reads failed or timed out on the last offer request.';
 if(['MAKER_BUSY','MAKER_MAINTENANCE'].includes(reason))return 'Maker is busy. Request a fresh offer after it clears.';
 if(['INVENTORY_LIMIT','RISK_LIMIT'].includes(reason))return 'No funded offer within the maker’s inventory or risk limit on the last request.';
 if(['STALE_REFERENCE','MARKET_DATA_UNAVAILABLE','INVALID_MARKET_DATA'].includes(reason))return 'Fresh market inputs were unavailable on the last offer request.';
 return 'The last request did not return an offer. Availability is checked per market and quantity.';
}
