// Public HTTP evidence only. Never signs, sends a transaction or loads secrets.
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const BASE='https://api.exchange.coinbase.com/products/NEAR-USD/trades?limit=1000';
const fail=message=>{throw new Error(message);};
export async function collect(expiry,{fetchImpl=fetch,now=()=>Date.now()}={}){
 if(!/^[1-9][0-9]{0,10}$/.test(expiry))fail('EXPIRY_FORMAT');
 const end=Number(expiry)*1000,start=end-1800000;
 if(end>now()||start<0)fail('EXPIRY_NOT_REACHED');
 const pages=[];let cursor=null,total=0,previous=null;
 for(let i=0;i<64;i++){
  const response=await fetchImpl(BASE+(cursor===null?'':'&after='+cursor),{redirect:'error',signal:AbortSignal.timeout(10000),headers:{accept:'application/json','user-agent':'Hedgeveil-expiry/1.0'}});
  if(response.status!==200)fail('HTTP_FAILURE');
  const next=response.headers.get('cb-after');if(!/^[1-9][0-9]*$/.test(next??''))fail('CURSOR_MISSING');
  const chunks=[];let length=0;
  for await(const b of response.body){length+=b.length;if(length>1000000)fail('BODY_LIMIT');chunks.push(b);}
  total+=length;if(total>2000000)fail('EVIDENCE_LIMIT');
  const body=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  const rows=JSON.parse(body);if(!Array.isArray(rows)||!rows.length||rows.length>1000)fail('PAGE_SIZE');
  for(const row of rows){
   if(!Number.isSafeInteger(row.trade_id)||row.trade_id<=0||!Number.isFinite(Date.parse(row.time)))fail('TRADE_FORMAT');
   if(previous!==null&&row.trade_id!==previous-1)fail('TRADE_ID_GAP');
   if(Date.parse(row.time)>now())fail('FUTURE_TRADE');previous=row.trade_id;
  }
  if(next!==String(rows.at(-1).trade_id))fail('CURSOR_VALUE');
  pages.push({after:cursor,next_after:next,body});
  if(Date.parse(rows.at(-1).time)<=start)return {request:{expiry_seconds:expiry},pages};
  cursor=next;
 }
 fail('PAGE_LIMIT');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [expiry,output]=process.argv.slice(2);if(!expiry||!output||process.argv.length!==4)throw new Error('Usage: node scripts/collect-expiry-trades.mjs EXPIRY_SECONDS OUTPUT.json');
 const evidence=await collect(expiry);
 await writeFile(output,JSON.stringify(evidence)+'\n',{flag:'wx'});
 console.log(JSON.stringify({file:output,pages:evidence.pages.length,authenticated_by_outlayer:false,settlement_eligible:false}));
}
