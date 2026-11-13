// Account keys arrive through IPC, remain in memory, never logged.
import {workerHealth} from './health.mjs';
import {ReadCache} from './read-cache.mjs';
import {CoinbaseMarket} from '../market-data/coinbase.mjs';
import {marketReference,pricingSeries,requestedSeriesAvailable,marketHead,pricingEnd} from './valuation.mjs';
import {generateKeyPairSync,createPrivateKey,createPublicKey} from 'node:crypto';
import {dirname} from 'node:path';
import {privateRead,privateDirectory,durableWrite} from '../demo/storage.mjs';
import {createRequire} from 'node:module';
import {Q,uint,baseQuote,signQuote} from '../../packages/rfq/codec.mjs';
import {Rpc} from '../../packages/sdk/rpc.mjs';
import {retainedSeries} from '../../packages/sdk/series.mjs';
import {AdminTransactions} from '../testnet/transactions.mjs';
import {quoteExpiry} from './expiry.mjs';
const require=createRequire(new URL('../../tests/sandbox/package.json',import.meta.url));
const {Account,JsonRpcProvider,actions}=await import(require.resolve('near-api-js'));
let keys=generateKeyPairSync('ed25519');
let publicHex=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
let cancellationAdmin,serviceKey,pendingCancellation=null;
const reads=new ReadCache();let paused=false;
let marketFeed,cfg,provider,account,domainRpc,epoch,issued=new Set(),hadQuotes=false,retired=false;
async function persist(){if(cfg?.state_file)await durableWrite(cfg.state_file,{version:1,private_key:keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),epoch:epoch??null,issued:[...issued],had_quotes:hadQuotes,retired,pending_cancellation:pendingCancellation});}
async function restore(){if(!cfg.state_file)return;await privateDirectory(dirname(cfg.state_file));let state;try{state=await privateRead(cfg.state_file);}catch(e){if(e.code!=='ENOENT'||cfg.resume)throw Error('MAKER_STATE_UNAVAILABLE');}
 if(state){if(state.version!==1||!Array.isArray(state.issued)||state.issued.some(n=>!Number.isInteger(n)||n<0||n>255)||new Set(state.issued).size!==state.issued.length||typeof state.retired!=='boolean'||typeof state.had_quotes!=='boolean')throw Error('MAKER_STATE_INVALID');if(state.epoch!==null)uint(state.epoch,64);const privateKey=createPrivateKey({format:'der',type:'pkcs8',key:Buffer.from(state.private_key,'base64')});if(privateKey.asymmetricKeyType!=='ed25519')throw Error('MAKER_KEY_TYPE');keys={privateKey,publicKey:createPublicKey(privateKey)};publicHex=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');epoch=state.epoch;issued=new Set(state.issued);hadQuotes=state.had_quotes;retired=state.retired;pendingCancellation=state.pending_cancellation??null;}await persist();}
const view=(method,args={})=>domainRpc?domainRpc.view(method,args):provider.callFunction({contractId:cfg.contract,method,args,blockQuery:{finality:'final'}});
const amount=(a,s,asset)=>asset.kind==='COLLATERAL'?BigInt(a.free):BigInt(a.positions[s.find(x=>x.config.series_id===asset.series_id).slot][asset.kind.toLowerCase()]);
const id=a=>a.kind==='COLLATERAL'?'COLLATERAL':`${a.kind}:${a.series_id}`;
const ceil=(n,d)=>(n+d-1n)/d;
async function recoverCancellation(){
 if(!pendingCancellation)return null;
 if(!cancellationAdmin)throw Error('CANCELLATION_JOURNAL_REQUIRED');
 const result=await cancellationAdmin.send(pendingCancellation,serviceKey);
 reads.clear();epoch=pendingCancellation.actions[0].args.epoch;hadQuotes=false;issued.clear();pendingCancellation=null;await persist();return result;
}
async function withdraw(reason){
 reads.clear();
 await domainRpc?.verify();let cancellation=await recoverCancellation();
 if(hadQuotes){
  const m=await view('get_market',{maker:cfg.maker}),next=String(BigInt(m.epoch)+1n);
  if(cancellationAdmin){
   pendingCancellation=await cancellationAdmin.prepare('maker-epoch-'+next,cfg.maker,cfg.contract,[{type:'FunctionCall',method:'advance_quote_epoch',args:{epoch:next},gas:'80000000000000',deposit:'1'}]);
   await persist();cancellation=await recoverCancellation();
  }else{
   cancellation=await account.signAndSendTransaction({receiverId:cfg.contract,actions:[actions.functionCall('advance_quote_epoch',{epoch:next},80n*10n**12n,1n)],waitUntil:'FINAL',throwOnFailure:false});
   if(![cancellation.transaction_outcome,...cancellation.receipts_outcome].some(x=>x.outcome.status.Failure)){hadQuotes=false;issued.clear();epoch=next;}
  }
 }
 await persist();return {quote:null,reason,cancellation};
}
async function quote(request){
 if(paused)return {quote:null,reason:'MAKER_MAINTENANCE'};
 // Sandbox references are supplied per request and may postdate a cached head.
 if(!marketFeed)reads.clear();
 await recoverCancellation();
 if(retired)return {quote:null,reason:'MAKER_WITHDRAWN'};
 let data;
 try{
  data=await reads.get(async()=>{
   await domainRpc?.verify();
   const snapshot=marketFeed?await marketFeed.snapshot(String(BigInt(Date.now())*1000000n)):null;
   const block=snapshot?await marketHead(domainRpc?{sendJsonRpc:(method,args)=>domainRpc.request(method,args)}:provider,snapshot):await provider.sendJsonRpc('block',{finality:'final'});
   const snapshotView=(method,args={})=>domainRpc?domainRpc.view(method,args,block.header.hash):provider.callFunction({contractId:cfg.contract,method,args,blockQuery:{blockId:block.header.hash}});
   const [a,series,m]=await Promise.all([snapshotView('get_account',{account_id:cfg.maker}),retainedSeries(snapshotView),snapshotView('get_market',{maker:cfg.maker})]);
   return {a,series,m,block,snapshot};
  });
 }catch(e){reads.clear();if(marketFeed&&/^MARKET_/.test(e.code??''))return withdraw('MARKET_DATA_UNAVAILABLE');throw e;}
 const {a,series,m,block,snapshot}=data;
 let now=BigInt(block.header.timestamp_nanosec),ref=request.reference;
 if(!a||a.closing||!m||!m.keys[cfg.key_id]||m.keys[cfg.key_id].revoked||m.keys[cfg.key_id].public_key!==publicHex)return withdraw('REGISTRY_UNAVAILABLE');
 if(!requestedSeriesAvailable(series,request,String(now)))return {quote:null,reason:'SERIES_UNAVAILABLE'};
 if(marketFeed){
  try{ref=marketReference(snapshot,pricingSeries(series,a,request),String(now));}
  catch(e){return {...await withdraw('MARKET_DATA_UNAVAILABLE'),diagnostics:{market_error:/^[A-Z_]{1,80}$/.test(e.code??'')?e.code:'MARKET_TRANSPORT'}};}
 }else if(!ref||ref.label!=='SYNTHETIC MARKET REFERENCE'||!ref.marks||typeof ref.marks!=='object')return withdraw('MISSING_REFERENCE');
 let stamp;try{stamp=uint(ref.timestamp_ns,64);for(const value of Object.values(ref.marks))if(uint(value)>Q)throw Error('mark bound');}catch{return withdraw('INVALID_REFERENCE');}if(stamp>now||now-stamp>(marketFeed?60n:30n)*1000000000n||(marketFeed&&BigInt(Date.now())*1000000n-stamp>60n*1000000000n))return withdraw('STALE_REFERENCE');
 if(!a||a.closing||!m||!m.keys[cfg.key_id]||m.keys[cfg.key_id].revoked||m.keys[cfg.key_id].public_key!==publicHex)return withdraw('REGISTRY_UNAVAILABLE');
 let equity=BigInt(a.free);for(const s of series){for(const leg of ['P','N']){const n=BigInt(a.positions[s.slot][leg.toLowerCase()]);if(n){const mark=ref.marks[`${leg}:${s.config.series_id}`];if(mark===undefined)return withdraw('MISSING_MARK');equity+=n*uint(mark)/Q;}}}
 if(equity*10000n<uint(cfg.initial_equity)*8000n)return withdraw('LOSS_LIMIT');
 const sides=request.mode==='ROLL'?[request.old_asset,request.asset]:[request.asset];
 if(!requestedSeriesAvailable(series,request,String(now)))return {quote:null,reason:'SERIES_UNAVAILABLE'};
 for(const asset of sides){if(ref.marks[id(asset)]===undefined||uint(ref.marks[id(asset)])===0n||uint(ref.marks[id(asset)])>Q)return {quote:null,reason:'INVALID_MARK'};}
 if(epoch!==m.epoch){epoch=m.epoch;issued.clear();}
 let nonce;for(let n=0;n<256;n++)if(!issued.has(n)&&!((m.consumed[n>>3]|m.cancelled[n>>3])&(1<<(n%8)))){nonce=n;break;}
 if(nonce===undefined)return withdraw('NONCE_CAP');
 const expiry=quoteExpiry(now,sides.map(asset=>pricingEnd(series.find(x=>x.config.series_id===asset.series_id).config)),cfg.network??'sandbox');
 const q=baseQuote({contract:cfg.contract,maker:cfg.maker,taker:request.taker,keyId:cfg.key_id,nonce,epoch,expiry,feeReceiver:cfg.fee_receiver,network:cfg.network??'sandbox'});
 const target=20n*Q,spread=asset=>BigInt(cfg.half_spread_bps)+(amount(a,series,asset)>target?amount(a,series,asset)-target:target-amount(a,series,asset))*50n/target;
 const ask=asset=>ceil(uint(ref.marks[id(asset)])*(10000n+spread(asset)),10000n);
 const bid=asset=>uint(ref.marks[id(asset)])*(10000n-spread(asset))/10000n;
 const quantity=uint(request.amount);if(quantity===0n)return {quote:null,reason:'ZERO_AMOUNT'};
 let notional;
 if(request.mode==='ROLL'){
  const extra=request.collateral_adjustment?uint(request.collateral_adjustment):0n;
  notional=quantity*bid(request.old_asset)/Q+extra;const output=notional*Q/ask(request.asset);
  q.maker_gives=[{asset:request.asset,amount:String(output)}];q.taker_gives=[{asset:request.old_asset,amount:String(quantity)}];if(extra)q.taker_gives.push({asset:{kind:'COLLATERAL'},amount:String(extra)});
 }else if(request.mode==='BUY'){
  notional=ceil(quantity*ask(request.asset),Q);q.maker_gives=[{asset:request.asset,amount:String(quantity)}];q.taker_gives=[{asset:{kind:'COLLATERAL'},amount:String(notional)}];
 }else if(request.mode==='SELL'){
  notional=quantity*bid(request.asset)/Q;q.maker_gives=[{asset:{kind:'COLLATERAL'},amount:String(notional)}];q.taker_gives=[{asset:request.asset,amount:String(quantity)}];
 }else throw Error('unsupported request mode');
 if(notional>10n*Q)return {quote:null,reason:'NOTIONAL_LIMIT'};
 q.fee.amount=String(ceil(notional*5n,10000n));
 if(q.fee.amount>Q/100n||q.maker_gives.some(l=>BigInt(l.amount)===0n))return {quote:null,reason:'DUST_OR_FEE_LIMIT'};
 for(const leg of q.maker_gives)if(amount(a,series,leg.asset)<BigInt(leg.amount))return {quote:null,reason:'INVENTORY_LIMIT'};
 for(const leg of q.taker_gives)if(leg.asset.kind!=='COLLATERAL'&&amount(a,series,leg.asset)+BigInt(leg.amount)>40n*Q)return {quote:null,reason:'POSITION_LIMIT'};
 const signed=signQuote(q,keys.privateKey);issued.add(nonce);hadQuotes=true;await persist();return {quote:signed,reason:null,diagnostics:{equity_atomic:String(equity),notional_atomic:String(notional),reference_timestamp_ns:ref.timestamp_ns,...(marketFeed?{source:ref.source,model:ref.model,snapshot_hash:ref.snapshot_hash,sigma:ref.sigma,history_end_ns:ref.history_end_ns}: {})}};
}
let queue=Promise.resolve();
process.on('message',message=>{queue=queue.then(async()=>{try{let result;if(message.method==='quote'&&message.deadline_ms!==undefined&&Date.now()>message.deadline_ms)throw Error('MAKER_REQUEST_EXPIRED');if(message.method==='init'){if(cfg)throw Error('ALREADY_INITIALIZED');cfg=message.config;const network=cfg.network??'sandbox',url=new URL(cfg.rpc_url);if(network==='testnet'&&cfg.pricing_source!=='coinbase')throw Error('REAL_MARKET_DATA_REQUIRED');if(cfg.pricing_source&&cfg.pricing_source!=='coinbase')throw Error('UNKNOWN_PRICING_SOURCE');if(cfg.pricing_source==='coinbase'){if(!cfg.market_archive)throw Error('MARKET_ARCHIVE_REQUIRED');marketFeed=new CoinbaseMarket({archive:cfg.market_archive});}if(!['sandbox','testnet'].includes(network))throw Error('NETWORK_DISABLED');if(network==='sandbox'&&(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash))throw Error('LOCAL_SANDBOX_ONLY');if(network==='testnet'){if(!cfg.state_file)throw Error('DURABLE_MAKER_STATE_REQUIRED');domainRpc=new Rpc({network,chain_id:cfg.chain_id,genesis_hash:cfg.genesis_hash,code_hash:cfg.code_hash,contract_id:cfg.contract,rpc_url:cfg.rpc_url},{fallback_urls:cfg.rpc_fallbacks??[],timeout_ms:6000});await domainRpc.verify();}provider=new JsonRpcProvider({url:cfg.rpc_url},{retries:1});account=new Account(cfg.maker,provider,cfg.account_key);if(network==='testnet'&&!cfg.operation_journal)throw Error('CANCELLATION_JOURNAL_REQUIRED');if(cfg.operation_journal){if(!cfg.state_file)throw Error('DURABLE_MAKER_STATE_REQUIRED');serviceKey=cfg.account_key;cancellationAdmin=new AdminTransactions({provider,journal:cfg.operation_journal,identity:{kind:'hedgeveil-maker-cancellation-v1',network,genesis_hash:cfg.genesis_hash??null,contract_id:cfg.contract,maker:cfg.maker},verify:async()=>{await domainRpc?.verify();}});}delete cfg.account_key;await restore();result={public_key:publicHex,pid:process.pid};}else if(message.method==='pause'){paused=true;reads.clear();result={paused:true};}else if(message.method==='resume'){reads.clear();paused=false;result={paused:false};}else if(message.method==='health')result=workerHealth({initialized:!!cfg,paused,retired,pendingCancellation});else if(message.method==='quote')result=await quote(message.request);else if(message.method==='withdraw'){retired=true;await persist();result=await withdraw('MAKER_WITHDRAWN');}else throw Error('unknown maker command');process.send({id:message.id,result});}catch(error){process.send({id:message.id,error:cfg?.state_file?(error.code==='RPC_UNAVAILABLE'?'MAKER_RPC_UNAVAILABLE':'MAKER_REQUEST_FAILED'):error.message});}});});
process.on('disconnect',()=>process.exit(0));
