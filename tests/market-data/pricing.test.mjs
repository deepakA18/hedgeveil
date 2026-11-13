import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {CoinbaseMarket,validateSnapshot,decimal12} from '../../services/market-data/coinbase.mjs';
import {valuePair,marketReference} from '../../services/maker/valuation.mjs';
const evidence=JSON.parse(await readFile(new URL('../../research/reports/mkt03-market-observation-2026-11-09.json',import.meta.url)));
const snap=()=>structuredClone(evidence.snapshot),now=String(BigInt(Date.parse(evidence.ticker_request.received_at))*1000000n),Q=10n**24n;
const validate=s=>validateSnapshot(s,now);
test('actual archived external ticker/history reproduces the recorded observation',()=>{
 assert.deepEqual(validate(snap()),evidence.observation);assert.equal(evidence.observation.return_count,168);assert.equal(evidence.observation.settlement_eligible,false);
});
test('exact decimal input has no exponent, unsafe number, zero or rounding path',()=>{
 assert.equal(decimal12('3.57015'),3570150000000n);
 for(const v of ['0','-1','01','1e2','1.1234567890123',3.5,'1000001'])assert.throws(()=>decimal12(v));
});
test('source identity, old/future timestamps, crossed and excessive spreads reject quotes',()=>{
 const s=snap();s.source='caller';assert.throws(()=>validate(s),/SOURCE/);
 for(const changes of [{time:'2000-01-01T00:00:00Z'},{time:'2099-01-01T00:00:00Z'},{time:'2026-02-30T12:00:00Z'},{bid:'4',ask:'3'},{bid:'3',ask:'4'}]){
  const x=snap();x.ticker=JSON.stringify({...JSON.parse(x.ticker),...changes});assert.throws(()=>validate(x));
 }
});
test('incomplete or duplicated closed history cannot be interpolated into volatility',()=>{
 const s=snap(),rows=JSON.parse(s.candles),end=Number(BigInt(evidence.observation.history_end_ns)/1000000000n);
 const required=rows.find(r=>r[0]===end-3600);
 s.candles=JSON.stringify(rows.filter(r=>r[0]!==required[0]));assert.throws(()=>validate(s),/HISTORY_GAP/);
 s.candles=JSON.stringify([...rows,required]);assert.throws(()=>validate(s),/DUPLICATE_CANDLE/);
});
test('open candle changes cannot affect volatility; invalid closed OHLC values fail',()=>{
 const s=snap(),rows=JSON.parse(s.candles),end=Number(BigInt(evidence.observation.history_end_ns)/1000000000n);
 const clean=rows.filter(r=>r[0]<end);s.candles=JSON.stringify([...clean,[end,1,999,1,999,100]]);
 assert.equal(validate(s).sigma,evidence.observation.sigma);
 clean[0][4]=1000000;s.candles=JSON.stringify(clean);assert.throws(()=>validate(s),/CANDLE_VALUES/);
});
test('European model matches independent Python erfc formula across strike, maturity and volatility',()=>{
 const rows=[];for(const strike of [1,2,3.5,4,8])for(const days of [.01,1,30])for(const sigma of [0,.3,1,3])rows.push({spot:'3570150000000',strike:String(BigInt(Math.round(strike*1e12))),remaining_ns:String(BigInt(Math.round(days*86400*1e9))),sigma});
 const expected=JSON.parse(execFileSync('python3',['-c',`import sys,json,math
out=[]
for x in json.load(sys.stdin):
 s=int(x['spot'])/1e12;k=int(x['strike'])/1e12;t=int(x['remaining_ns'])/(365*86400*1e9);v=x['sigma']*math.sqrt(t)
 if v==0:c=max(s-k,0)/s
 else:
  d=(math.log(s/k)+v*v/2)/v
  c=.5*math.erfc(-d/math.sqrt(2))-k/s*.5*math.erfc(-(d-v)/math.sqrt(2))
 out.append(c)
print(json.dumps(out))`],{input:JSON.stringify(rows),encoding:'utf8'}));
 rows.forEach((r,i)=>{const p=valuePair(r);assert.equal(BigInt(p.P)+BigInt(p.N),Q);assert.ok(Math.abs(Number(BigInt(p.N))/1e24-expected[i])<1e-6);});
});
test('model terminal/zero-volatility limits and bounds never alter pair conservation',()=>{
 const input={spot:'4000000000000',strike:'2000000000000',remaining_ns:'0',sigma:1};assert.deepEqual(valuePair(input),{P:String(Q/2n),N:String(Q/2n)});
 assert.equal(valuePair({...input,remaining_ns:'86400000000000',sigma:0}).N,String(Q/2n));
 for(const changes of [{spot:'0'},{strike:'0'},{sigma:NaN},{sigma:6},{remaining_ns:'-1'}])assert.throws(()=>valuePair({...input,...changes}));
});
test('series-specific marks vary with strike/time; unresolved mature holdings block quoting',()=>{
 const o=validate(snap()),config={series_id:'one',price_scale:'1000000000000',payoff_kind:'CAPPED_USD_COMPLEMENT',strike:'3500000000000',maturity_ns:String(BigInt(now)+86400000000000n)};
 const r=marketReference(o,[{config,final_price:null}],now);assert.equal(BigInt(r.marks['P:one'])+BigInt(r.marks['N:one']),Q);assert.notEqual(r.marks['P:one'],String(Q/2n));
 assert.throws(()=>marketReference(o,[{config:{...config,maturity_ns:now},final_price:null}],now),/UNRESOLVED/);
 const final=marketReference(o,[{config,final_price:'7000000000000'}],now);assert.equal(final.marks['P:one'],String(Q/2n));
 assert.throws(()=>marketReference(o,[{config:{...config,oracle_version:'native-trade-twap-v1'},final_price:null}],now),/MODEL_TWAP_INPUT/);
 const settledTwap=marketReference(o,[{config:{...config,oracle_version:'native-trade-twap-v1'},final_price:'7000000000000'}],now);assert.equal(settledTwap.marks['P:one'],String(Q/2n));
});
test('HTTP errors do not retry or fall back; only fixed public endpoints are accessible',async()=>{
 let count=0;const feed=new CoinbaseMarket({fetchImpl:async()=>{count++;return new Response('rate limit',{status:429});}});
 await assert.rejects(feed.snapshot(now),/MARKET_HTTP/);assert.equal(count,1);
 await assert.rejects(feed.get('https://attacker.test/'),/ENDPOINT/);assert.equal(count,1);
});
test('collector archives real-response bytes and reuses only the same closed-history hour',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hv-market-'));let candles=0,tickers=0;
 const feed=new CoinbaseMarket({archive:dir,clock:()=>now,fetchImpl:async url=>{if(url.endsWith('ticker')){tickers++;return new Response(snap().ticker);}candles++;return new Response(snap().candles);}});
 try{assert.deepEqual(await feed.snapshot(now),evidence.observation);await feed.snapshot(now);assert.equal(candles,1);assert.equal(tickers,2);assert.equal((await readdir(dir)).length,1);}
 finally{await rm(dir,{recursive:true,force:true});}
});
test('collection crossing an hour boundary cannot turn a partial candle into a closed observation',async()=>{
 const hour=3600n*10n**9n,after=String((BigInt(now)/hour+1n)*hour);
 const feed=new CoinbaseMarket({clock:()=>after,fetchImpl:async url=>new Response(url.endsWith('ticker')?snap().ticker:snap().candles)});
 await assert.rejects(feed.snapshot(now),/MARKET_HOUR_CHANGED/);assert.equal(feed.history,null);
});

test('zero-held expired series cannot stop pricing unrelated live inventory',async()=>{
 const {pricingSeries}=await import('../../services/maker/valuation.mjs');
 const series=[{slot:0,config:{series_id:'old'}},{slot:1,config:{series_id:'live'}}];
 const account={positions:[{p:'0',n:'0'},{p:'2',n:'2'}]};
 assert.deepEqual(pricingSeries(series,account,{mode:'BUY',asset:{series_id:'live'}}),[series[1]]);
 account.positions[0].n='1';assert.deepEqual(pricingSeries(series,account,{mode:'BUY',asset:{series_id:'live'}}),series);
 account.positions[0].n='0';assert.deepEqual(pricingSeries(series,account,{mode:'ROLL',asset:{series_id:'live'},old_asset:{series_id:'old'}}),series);
});
test('expired and foreign RFQ targets are rejected without invalidating unrelated live markets',async()=>{
 const {requestedSeriesAvailable}=await import('../../services/maker/valuation.mjs');
 const series=[{config:{series_id:'old',maturity_ns:'100'},final_price:null},{config:{series_id:'live',maturity_ns:'200'},final_price:null}];
 const request={mode:'BUY',asset:{kind:'P',series_id:'live'}};
 assert(requestedSeriesAvailable(series,request,'150'));
 assert(!requestedSeriesAvailable(series,{...request,asset:{kind:'P',series_id:'old'}},'150'));
 assert(!requestedSeriesAvailable(series,{...request,asset:{kind:'P',series_id:'unknown'}},'150'));
 assert(!requestedSeriesAvailable(series,request,'200'));
 assert(!requestedSeriesAvailable(series,{...request,mode:'ROLL',old_asset:{kind:'N',series_id:'old'}},'150'));
 assert(requestedSeriesAvailable(series,request,'150'));
});

test('ticks received during collection are validated at completion, never future completion time',async()=>{
 const start=BigInt(now),after=String(start+2_000_000_000n),during=new Date(Number(start/1_000_000n)+1000).toISOString();
 const ticker=JSON.stringify({...JSON.parse(snap().ticker),time:during});
 const feed=new CoinbaseMarket({clock:()=>after,fetchImpl:async url=>new Response(url.endsWith('ticker')?ticker:snap().candles)});
 assert.equal((await feed.snapshot(now)).timestamp_ns,String(BigInt(Date.parse(during))*1_000_000n));
 feed.clock=()=>now;await assert.rejects(feed.snapshot(now),/MARKET_STALE_OR_FUTURE/);
});
test('maker waits for finalized time without replacing the observation or widening age limits',async()=>{
 const {marketHead}=await import('../../services/maker/valuation.mjs');let reads=0,waits=0;
 const provider={sendJsonRpc:async(method,p)=>{assert.equal(method,'block');assert.equal(p.finality,'final');return {header:{timestamp_nanosec:String(++reads<3?99:100)}};}};
 assert.equal((await marketHead(provider,{timestamp_ns:'100'},{sleep:async ms=>{assert.equal(ms,500);waits++;}})).header.timestamp_nanosec,'100');assert.equal(waits,2);
 reads=0;await assert.rejects(marketHead({sendJsonRpc:async()=>{reads++;return {header:{timestamp_nanosec:'99'}};}},{timestamp_ns:'100'},{sleep:async()=>{}}),/MARKET_CHAIN_TIME_BEHIND/);assert.equal(reads,10);
 await assert.rejects(marketHead({sendJsonRpc:async()=>({header:{timestamp_nanosec:'60000000101'}})},{timestamp_ns:'100'}),/MODEL_SOURCE/);
});
