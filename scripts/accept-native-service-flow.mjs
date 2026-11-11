// Actual project-maker acceptance only. Never signs for the connected owner.
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadWorkspace,Q} from '../services/testnet/workspace.mjs';
import {adminFor,retained} from '../services/testnet/deploy.mjs';
import {privateRead} from '../services/demo/storage.mjs';
import {verifyQuote} from '../packages/rfq/codec.mjs';
const {values}=parseArgs({options:{phase:{type:'string',default:'trade'}}});
assert(['trade','redeem'].includes(values.phase));
const {directory,plan}=await loadWorkspace('native-transfer'),d=await privateRead(directory+'/deployment.json');
assert.equal(d.series.series_id,'eta');assert.equal(plan.network,'testnet');
const [taker,maker]=plan.accounts.filter(a=>a.role==='maker'),core=d.client.contract_id,admin=adminFor(directory,plan),rpc=admin.provider;
await admin.verify();assert.equal((await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:core,finality:'final'})).code_hash,d.client.code_hash);
const {keys}=await privateRead(directory+'/signers.json'),base=directory+'/acceptance-eta';await mkdir(base,{recursive:true,mode:0o700});
const view=(method,args={})=>rpc.callFunction({contractId:core,method,args,blockQuery:{finality:'final'}});
const steps=[],checks=[];
const report=async()=>writeFile(`research/reports/native-public-eta-service-${values.phase}.json`,JSON.stringify({observed_at:new Date().toISOString(),scope:'Actual testnet lifecycle between project-operated accounts; not independent liquidity or owner-wallet acceptance',taker:taker.id,maker:maker.id,series:d.series,steps,checks,account:await view('get_account',{account_id:taker.id})},null,2)+'\n');
const events=receipt=>receipt.receipts_outcome.filter(r=>r.outcome.executor_id===core).flatMap(r=>r.outcome.logs.filter(l=>l.startsWith('EVENT_JSON:')).flatMap(l=>{const e=JSON.parse(l.slice(11));return e.standard==='hedgeveil'?e.data:[];}));
const send=async(label,method,args)=>{
 const i=await admin.prepare('service-acceptance-eta-'+label,taker.id,core,[{type:'FunctionCall',method,args,deposit:'1',gas:'100000000000000'}]);
 const result=await admin.send(i,keys[taker.id]),receipt=admin.evidence.get(i.operation_id);assert(receipt);steps.push({intent:i,result,receipt});
 await report();
 console.log(JSON.stringify({step:label,state:result.state,hash:result.hash}));
 return steps.at(-1);
};
if(values.phase==='trade'){
 for(const [mode,kind,amount]of [['BUY','P',Q/20n],['BUY','N',Q/20n],['SELL','P',Q/100n]]){
  const label=mode+'-'+kind,record=await retained(base+'/'+label+'.json',async()=>{
   const origin='http://127.0.0.1:8794';let healthy=false;for(let n=0;n<10;n++){const state=await (await fetch(origin+'/api/state')).json();if(state.health?.risk_allowed){healthy=true;break;}if(n<9)await new Promise(r=>setTimeout(r,5000));}assert(healthy,'INDEXER_UNHEALTHY');const request={mode,asset:{kind,series_id:'eta'},amount:String(amount),taker:taker.id};
   const response=await fetch(origin+'/api/quotes',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(request)});const body=await response.json();assert(response.ok,body.error);
   const selected=body.items.find(x=>x.quote?.maker===maker.id);assert(selected,JSON.stringify(body.items.map(x=>({reason:x.reason,diagnostics:x.diagnostics}))));
   assert(verifyQuote(selected.quote,maker.rfq_public_key));assert.equal(selected.quote.taker,taker.id);assert.equal(selected.quote.domain.contract_id,core);assert.equal(selected.quote.domain.network,'testnet');
   assert(BigInt(selected.quote.fee.amount)<=Q/1000n);
   if(mode==='BUY')assert(BigInt(selected.quote.taker_gives[0].amount)<=6n*Q/100n);
   return {request,selected};
  });
  await send(label,'fill_quote',{quote:record.selected.quote});
 }
 await send('merge','merge',{series_id:'eta',amount:String(Q/200n)});
}else{
 const s=await view('get_series',{series_id:'eta'});assert(s.final_price!==null,'ACTUAL_FINAL_PRICE_REQUIRED');
 for(const leg of ['P','N']){
  const step=await send('redeem-'+leg,'redeem',{series_id:'eta',leg,amount:String(Q/20n)});
  const deltas=events(step.receipt).flatMap(e=>e.deltas),expected=Q/20n*BigInt(s[leg==='P'?'p_coefficient':'n_coefficient'])/Q;
  const sum=(kind,direction)=>deltas.filter(x=>x.account_id===taker.id&&x.bucket==='FREE'&&x.asset.kind===kind&&x.direction===direction&&(kind==='COLLATERAL'||x.asset.series_id==='eta')).reduce((n,x)=>n+BigInt(x.amount),0n);
  assert.equal(sum(leg,'DEBIT'),Q/20n);assert.equal(sum('COLLATERAL','CREDIT'),expected);
  checks.push({kind:'EXACT_REDEMPTION',leg,amount:String(Q/20n),payout:String(expected),final_price:s.final_price,hash:step.result.hash});await report();
 }
 const withdrawal=await send('withdraw','request_withdrawal',{amount:String(Q/50n),receiver:taker.id});
 const tickets=await view('list_tickets',{account_id:taker.id,from_index:0,limit:16});
 const request=withdrawal.receipt.receipts_outcome.find(r=>r.outcome.executor_id===core&&r.outcome.logs.some(l=>l.includes('WITHDRAWAL_REQUESTED')));assert(request);
 const block=await rpc.sendJsonRpc('block',{block_id:request.block_hash});assert.equal(block.header.hash,request.block_hash);
 const matched=tickets.filter(t=>t.owner===taker.id&&t.receiver===taker.id&&t.amount===String(Q/50n)&&t.created_ns===block.header.timestamp_nanosec);
 assert.equal(matched.length,1);assert.equal(matched[0].state,'SUCCEEDED');assert.equal(matched[0].kind,'COLLATERAL');assert.equal(matched[0].balance_restored,false);
 assert.equal(events(withdrawal.receipt).filter(e=>e.event==='WITHDRAWAL_SUCCEEDED').length,1);
 assert.equal(JSON.parse(Buffer.from(withdrawal.receipt.status.SuccessValue,'base64').toString()),'SUCCEEDED');
 checks.push({kind:'TERMINAL_WITHDRAWAL',ticket:matched[0],request_block:block.header,hash:withdrawal.result.hash});await report();
 console.log(JSON.stringify({checks}));
}
