// Conservative application gate over reconciled external-resolver evidence.
// This refuses new risk; it cannot alter contract settlement or authorize exits.
export function externalQuoteBlocker(snapshot,seriesIds,nowNs){
 if(!snapshot?.health?.risk_allowed)return 'INDEXER_UNHEALTHY';
 const oracleRows=snapshot.items?.filter(x=>['external_oracle','expiry_oracle'].includes(x.kind))??[];
 if(oracleRows.length!==1)return 'ORACLE_UNAVAILABLE';
 const oracle=oracleRows[0].body;
 if(!oracle||typeof oracle.state?.paused!=='boolean'||oracle.state.paused)return 'ORACLE_UNAVAILABLE';
 for(const id of new Set(seriesIds)){
  const c=oracle.cases?.find(x=>x.config.series_id===id);
  if(!c)return 'ORACLE_UNAVAILABLE';
  const start=BigInt(c.config.observation_window.start_ns),end=BigInt(c.config.maturity_ns),now=BigInt(nowNs);
  if(oracleRows[0].kind==='expiry_oracle'){
   if(oracle.state.version!=='native-trade-twap-v1'||c.config.oracle_version!=='native-trade-twap-v1'||end-start!==1800000000000n)return 'ORACLE_UNAVAILABLE';
   if(c.price!==null||c.accepted!==null||c.pending!==null||now>=start)return 'SERIES_UNAVAILABLE';
   continue;
  }
  if(!Array.isArray(c.samples)||c.samples.length!==3)return 'ORACLE_UNAVAILABLE';
  if(end<=start||(end-start)%3n!==0n)return 'ORACLE_UNAVAILABLE';
  if(c.price===null&&c.samples.some((sample,i)=>sample===null&&now>=start+BigInt(i+1)*(end-start)/3n))return 'ORACLE_SAMPLE_MISSED';
  if(c.price!==null||now>=end)return 'SERIES_UNAVAILABLE';
 }
 return null;
}
