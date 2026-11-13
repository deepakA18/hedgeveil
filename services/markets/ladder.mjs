// Read-only listing policy. No signing, account creation, minting or RPC writes.
// Activation needs a new compatible contract/runtime and ORC-04 acceptance.
import {createHash} from 'node:crypto';
const SECOND=1000000000n,DAY=86400n*SECOND,HOUR=3600n*SECOND;
export const LADDER_POLICY='DAILY_FRIDAY_0800_90_95_100_105_110_V1';
export const LEVELS=[9000n,9500n,10000n,10500n,11000n];
export function ladderDates(nowNs){
 const now=BigInt(nowNs),earliest=now+HOUR; // full 30-minute window plus setup lead
 let daily=now/DAY*DAY+8n*HOUR;
 if(daily<=earliest)daily+=DAY;
 let weekly=daily;
 while(new Date(Number(weekly/1000000n)).getUTCDay()!==5)weekly+=DAY;
 if(weekly===daily)weekly+=7n*DAY;
 return [String(daily),String(weekly)];
}
export function planLadder({snapshot,nowNs,existing=[],cohorts={},maxSeries,profileReady=false}){
 const now=BigInt(nowNs),stamp=BigInt(snapshot.timestamp_ns);
 if(snapshot.source!=='COINBASE_EXCHANGE_NEAR_USD_V1'||snapshot.price_scale!=='1000000000000'||! /^[a-f0-9]{64}$/.test(snapshot.snapshot_hash)||stamp>now||now-stamp>60n*SECOND)throw Error('LADDER_FRESH_SOURCE_REQUIRED');
 const spot=BigInt(snapshot.spot);if(spot<=0n)throw Error('LADDER_SPOT');
 if(!Number.isSafeInteger(maxSeries)||maxSeries<existing.length)throw Error('LADDER_CAPACITY');
 const targets=[],seeds={...cohorts},blocked=[];
 for(const expiry of ladderDates(nowNs)){
  // Retain the first seed for each expiry. Spot changes never reprices an issued cohort.
  const seed=seeds[expiry]??{spot:String(spot),snapshot_hash:snapshot.snapshot_hash};
  if(!/^[a-f0-9]{64}$/.test(seed.snapshot_hash)||BigInt(seed.spot)<=0n)throw Error('LADDER_SEED');
  seeds[expiry]=seed;
  for(let i=0;i<LEVELS.length;i++){
   const strike=String(BigInt(seed.spot)*LEVELS[i]/10000n);
   const seriesId='l'+createHash('sha256').update(LADDER_POLICY+':'+expiry+':'+i).digest('hex').slice(0,24);
   const present=existing.find(s=>s.config.series_id===seriesId);
   if(present&&(present.config.strike!==strike||present.config.maturity_ns!==expiry||present.config.oracle_version!=='native-trade-twap-v1'))blocked.push('EXISTING_TERMS_CONFLICT');
   targets.push({series_id:seriesId,strike,maturity_ns:expiry,mint_cutoff_ns:String(BigInt(expiry)-1800n*SECOND),oracle_version:'native-trade-twap-v1',level_bps:String(LEVELS[i]),existing:!!present,seed_snapshot_hash:seed.snapshot_hash});
  }
 }
 const missing=targets.filter(x=>!x.existing).length;
 if(existing.length+missing>maxSeries)blocked.push('CONTRACT_SERIES_CAPACITY');
 if(!profileReady)blocked.push('EXPIRY_PROFILE_NOT_ACCEPTED');
 return {policy:LADDER_POLICY,mode:'PLAN_ONLY',targets,cohorts:seeds,missing,capacity:maxSeries,blocked:[...new Set(blocked)],actions:[]};
}
