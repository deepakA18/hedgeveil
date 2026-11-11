// Conservative application gate over reconciled external-resolver evidence.
// This refuses new risk; it cannot alter contract settlement or authorize exits.
export function externalQuoteBlocker(snapshot,seriesIds,nowNs){
 if(!snapshot?.health?.risk_allowed)return 'INDEXER_UNHEALTHY';
 const oracle=snapshot.items?.find(x=>x.kind==='external_oracle')?.body;
 if(!oracle||typeof oracle.state?.paused!=='boolean'||oracle.state.paused)return 'ORACLE_UNAVAILABLE';
 for(const id of new Set(seriesIds)){
  const c=oracle.cases?.find(x=>x.config.series_id===id);
  if(!c||!Array.isArray(c.samples)||c.samples.length!==3)return 'ORACLE_UNAVAILABLE';
  const start=BigInt(c.config.observation_window.start_ns),end=BigInt(c.config.maturity_ns),now=BigInt(nowNs);
  if(end<=start||(end-start)%3n!==0n)return 'ORACLE_UNAVAILABLE';
  if(c.price===null&&c.samples.some((sample,i)=>sample===null&&now>=start+BigInt(i+1)*(end-start)/3n))return 'ORACLE_SAMPLE_MISSED';
  if(c.price!==null||now>=end)return 'SERIES_UNAVAILABLE';
 }
 return null;
}
