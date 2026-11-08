// Local demo maker. Account keys arrive through IPC, remain in memory, never logged.
import {generateKeyPairSync,createPrivateKey,createPublicKey} from 'node:crypto';
import {dirname} from 'node:path';
import {privateRead,privateDirectory,durableWrite} from '../demo/storage.mjs';
import {createRequire} from 'node:module';
import {Q,uint,baseQuote,signQuote} from '../../packages/rfq/codec.mjs';
const require=createRequire(new URL('../../tests/sandbox/package.json',import.meta.url));
const {Account,JsonRpcProvider,actions}=await import(require.resolve('near-api-js'));
let keys=generateKeyPairSync('ed25519');
let publicHex=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');
let cfg,provider,account,epoch,issued=new Set(),hadQuotes=false,retired=false;
async function persist(){if(cfg?.state_file)await durableWrite(cfg.state_file,{version:1,private_key:keys.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),epoch:epoch??null,issued:[...issued],had_quotes:hadQuotes,retired});}
async function restore(){if(!cfg.state_file)return;await privateDirectory(dirname(cfg.state_file));let state;try{state=await privateRead(cfg.state_file);}catch(e){if(e.code!=='ENOENT'||cfg.resume)throw Error('MAKER_STATE_UNAVAILABLE');}
 if(state){if(state.version!==1||!Array.isArray(state.issued)||state.issued.some(n=>!Number.isInteger(n)||n<0||n>255)||new Set(state.issued).size!==state.issued.length||typeof state.retired!=='boolean'||typeof state.had_quotes!=='boolean')throw Error('MAKER_STATE_INVALID');if(state.epoch!==null)uint(state.epoch,64);const privateKey=createPrivateKey({format:'der',type:'pkcs8',key:Buffer.from(state.private_key,'base64')});if(privateKey.asymmetricKeyType!=='ed25519')throw Error('MAKER_KEY_TYPE');keys={privateKey,publicKey:createPublicKey(privateKey)};publicHex=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');epoch=state.epoch;issued=new Set(state.issued);hadQuotes=state.had_quotes;retired=state.retired;}await persist();}
const view=(method,args={})=>provider.callFunction({contractId:cfg.contract,method,args,blockQuery:{finality:'final'}});
const amount=(a,s,asset)=>asset.kind==='COLLATERAL'?BigInt(a.free):BigInt(a.positions[s.find(x=>x.config.series_id===asset.series_id).slot][asset.kind.toLowerCase()]);
const id=a=>a.kind==='COLLATERAL'?'COLLATERAL':`${a.kind}:${a.series_id}`;
const ceil=(n,d)=>(n+d-1n)/d;
async function withdraw(reason){let cancellation=null;if(hadQuotes){const m=await view('get_market',{maker:cfg.maker});cancellation=await account.signAndSendTransaction({receiverId:cfg.contract,actions:[actions.functionCall('advance_quote_epoch',{epoch:String(BigInt(m.epoch)+1n)},80n*10n**12n,1n)],waitUntil:'FINAL',throwOnFailure:false});if(![cancellation.transaction_outcome,...cancellation.receipts_outcome].some(x=>x.outcome.status.Failure)){hadQuotes=false;issued.clear();epoch=String(BigInt(m.epoch)+1n);}}
 await persist();return {quote:null,reason,cancellation};}
async function quote(request){
 if(retired)return {quote:null,reason:'MAKER_WITHDRAWN'};
 const block=await provider.sendJsonRpc('block',{finality:'final'}),now=BigInt(block.header.timestamp_nanosec),ref=request.reference;
 if(!ref||ref.label!=='SYNTHETIC MARKET REFERENCE'||!ref.marks||typeof ref.marks!=='object')return withdraw('MISSING_REFERENCE');
 let stamp;try{stamp=uint(ref.timestamp_ns,64);for(const value of Object.values(ref.marks))if(uint(value)>Q)throw Error('mark bound');}catch{return withdraw('INVALID_REFERENCE');}if(stamp>now||now-stamp>30_000_000_000n)return withdraw('STALE_REFERENCE');
 const [a,series,m]=await Promise.all([view('get_account',{account_id:cfg.maker}),view('list_series',{from_index:0,limit:16}),view('get_market',{maker:cfg.maker})]);
 if(!a||a.closing||!m||!m.keys[cfg.key_id]||m.keys[cfg.key_id].revoked||m.keys[cfg.key_id].public_key!==publicHex)return withdraw('REGISTRY_UNAVAILABLE');
 let equity=BigInt(a.free);for(const s of series){for(const leg of ['P','N']){const n=BigInt(a.positions[s.slot][leg.toLowerCase()]);if(n){const mark=ref.marks[`${leg}:${s.config.series_id}`];if(mark===undefined)return withdraw('MISSING_MARK');equity+=n*uint(mark)/Q;}}}
 if(equity*10000n<uint(cfg.initial_equity)*8000n)return withdraw('LOSS_LIMIT');
 const sides=request.mode==='ROLL'?[request.old_asset,request.asset]:[request.asset];
 for(const asset of sides){const s=series.find(x=>x.config.series_id===asset.series_id);if(!s||s.final_price!==null||now>=BigInt(s.config.maturity_ns))return withdraw('SERIES_UNAVAILABLE');if(ref.marks[id(asset)]===undefined||uint(ref.marks[id(asset)])===0n||uint(ref.marks[id(asset)])>Q)return withdraw('INVALID_MARK');}
 if(epoch!==m.epoch){epoch=m.epoch;issued.clear();}
 let nonce;for(let n=0;n<256;n++)if(!issued.has(n)&&!((m.consumed[n>>3]|m.cancelled[n>>3])&(1<<(n%8)))){nonce=n;break;}
 if(nonce===undefined)return withdraw('NONCE_CAP');
 let expiry=now+15_000_000_000n;for(const asset of sides){const end=BigInt(series.find(x=>x.config.series_id===asset.series_id).config.maturity_ns)-1n;if(end<expiry)expiry=end;}
 const q=baseQuote({contract:cfg.contract,maker:cfg.maker,taker:request.taker,keyId:cfg.key_id,nonce,epoch,expiry,feeReceiver:cfg.fee_receiver});
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
 const signed=signQuote(q,keys.privateKey);issued.add(nonce);hadQuotes=true;await persist();return {quote:signed,reason:null,diagnostics:{equity_atomic:String(equity),notional_atomic:String(notional),reference_timestamp_ns:ref.timestamp_ns}};
}
let queue=Promise.resolve();
process.on('message',message=>{queue=queue.then(async()=>{try{let result;if(message.method==='init'){if(cfg)throw Error('ALREADY_INITIALIZED');cfg=message.config;if(new URL(cfg.rpc_url).hostname!=='127.0.0.1')throw Error('local Sandbox only');provider=new JsonRpcProvider({url:cfg.rpc_url});account=new Account(cfg.maker,provider,cfg.account_key);delete cfg.account_key;await restore();result={public_key:publicHex,pid:process.pid};}else if(message.method==='quote')result=await quote(message.request);else if(message.method==='withdraw'){retired=true;await persist();result=await withdraw('MAKER_WITHDRAWN');}else throw Error('unknown maker command');process.send({id:message.id,result});}catch(error){process.send({id:message.id,error:cfg?.state_file?'MAKER_REQUEST_FAILED':error.message});}});});
process.on('disconnect',()=>process.exit(0));
