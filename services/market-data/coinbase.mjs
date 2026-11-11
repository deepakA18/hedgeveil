import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fail} from '../../packages/sdk/intent.mjs';
export const SOURCE='COINBASE_EXCHANGE_NEAR_USD_V1';
const BASE='https://api.exchange.coinbase.com/products/NEAR-USD/';
const HOUR=3600n*10n**9n,Q12=10n**12n;
export const sha=s=>createHash('sha256').update(s).digest('hex');
export function decimal12(s){
    if(typeof s!=='string'||s.length>40||! /^(0|[1-9][0-9]*)(\.[0-9]{1,12})?$/.test(s))fail('MARKET_DECIMAL');
    const [a,b='']=s.split('.'),n=BigInt(a)*Q12+BigInt(b.padEnd(12,'0'));if(n<=0n||n>1000000n*Q12)fail('MARKET_PRICE_RANGE');return n;
}
function timeNs(s){
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.[0-9]{1,9})?Z$/.test(s))fail('MARKET_TIMESTAMP');
    const [sec,sub]=s.slice(0,-1).split('.'),ms=Date.parse(sec+'Z');
    if(!Number.isSafeInteger(ms)||new Date(ms).toISOString().slice(0,19)!==sec)fail('MARKET_TIMESTAMP');
    return BigInt(ms)*1000000n+BigInt((sub??'').padEnd(9,'0'));
}
export function validateSnapshot(snapshot,now_ns){
    if(typeof now_ns!=='string'||! /^(0|[1-9][0-9]*)$/.test(now_ns))fail('MARKET_CLOCK');
    const now=BigInt(now_ns);if(snapshot?.source!==SOURCE||snapshot.product!=='NEAR-USD')fail('MARKET_SOURCE');
    let ticker,candles;try{ticker=JSON.parse(snapshot.ticker);candles=JSON.parse(snapshot.candles);}catch{fail('MARKET_JSON');}
    const stamp=timeNs(ticker.time);if(stamp>now||now-stamp>60n*10n**9n)fail('MARKET_STALE_OR_FUTURE');
    const bid=decimal12(ticker.bid),ask=decimal12(ticker.ask);decimal12(ticker.price);
    if(bid>ask||(ask-bid)*10000n>(ask+bid)/2n*100n)fail('MARKET_BOOK_SPREAD');
    if(!Array.isArray(candles)||candles.length>512)fail('MARKET_CANDLES');
    const end=now/HOUR*HOUR,rows=new Map();
    for(const row of candles){
        if(!Array.isArray(row)||row.length!==6||!Number.isSafeInteger(row[0])||row[0]<0||row[0]%3600)fail('MARKET_CANDLE_SHAPE');
        const stamp=BigInt(row[0])*10n**9n;if(stamp>=end)continue; // Never use an open/future bucket.
        if(rows.has(row[0]))fail('MARKET_DUPLICATE_CANDLE');
        const [low,high,open,close,volume]=row.slice(1);
        if(![low,high,open,close,volume].every(Number.isFinite)||low<=0||high>1e6||low>high||open<low||open>high||close<low||close>high||volume<0)fail('MARKET_CANDLE_VALUES');
        rows.set(row[0],close);
    }
    const closes=[];for(let i=169n;i>=1n;i--){const t=Number((end-i*HOUR)/10n**9n);if(!rows.has(t))fail('MARKET_HISTORY_GAP');closes.push(rows.get(t));}
    const returns=closes.slice(1).map((p,i)=>Math.log(p/closes[i])),mean=returns.reduce((a,b)=>a+b,0)/returns.length;
    const sigma=Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1)*365*24);
    if(!Number.isFinite(sigma)||sigma>5)fail('MARKET_VOLATILITY_RANGE');
    const raw=JSON.stringify({source:SOURCE,product:'NEAR-USD',ticker:snapshot.ticker,candles:snapshot.candles});
    return {source:SOURCE,product:'NEAR-USD',spot:String((bid+ask)/2n),price_scale:String(Q12),sigma,
        timestamp_ns:String(stamp),history_end_ns:String(end),return_count:168,snapshot_hash:sha(raw),settlement_eligible:false};
}
export class CoinbaseMarket {
    constructor({fetchImpl=globalThis.fetch,archive=null,clock=()=>String(BigInt(Date.now())*1000000n)}={}){this.fetch=fetchImpl;this.archive=archive;this.clock=clock;this.history=null;this.pending=null;}
    async get(resource){
        if(!['ticker','candles?granularity=3600'].includes(resource))fail('MARKET_ENDPOINT');
        const r=await this.fetch(BASE+resource,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
        if(r.status!==200)fail('MARKET_HTTP');
        let text='';for await(const chunk of r.body){text+=Buffer.from(chunk).toString('utf8');if(Buffer.byteLength(text)>100000)fail('MARKET_RESPONSE_SIZE');}return text;
    }
    async snapshot(now_ns){
        if(this.pending)return this.pending;
        this.pending=this.collect(now_ns).finally(()=>{this.pending=null;});return this.pending;
    }
    async collect(now_ns){
        const hour=String(BigInt(now_ns)/HOUR),history=this.history?.hour===hour?this.history.body:await this.get('candles?granularity=3600');
        const ticker=await this.get('ticker'),snapshot={source:SOURCE,product:'NEAR-USD',ticker,candles:history};
        // Validate at consumption time: a tick arriving during this HTTP request
        // is not future data. Delayed responses still cannot revive old data.
        const after=this.clock();if(String(BigInt(after)/HOUR)!==hour)fail('MARKET_HOUR_CHANGED');
        if(BigInt(after)<BigInt(now_ns))fail('MARKET_CLOCK');
        const result=validateSnapshot(snapshot,after);
        this.history={hour,body:history};
        if(this.archive){
            await mkdir(this.archive,{recursive:true});const data=JSON.stringify(snapshot)+'\n',file=join(this.archive,result.snapshot_hash+'.json');
            try{await writeFile(file,data,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;if(await readFile(file,'utf8')!==data)fail('MARKET_ARCHIVE_CONFLICT');}
        }
        return result;
    }
}
