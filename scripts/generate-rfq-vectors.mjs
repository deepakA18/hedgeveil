import {readFile,writeFile} from 'node:fs/promises';
import {signingBytes,digest,baseQuote,Q} from '../packages/rfq/codec.mjs';
const quote=baseQuote({contract:'core.sandbox',maker:'maker.sandbox',taker:null,keyId:'rfq-1',nonce:255,epoch:0,expiry:'18446744073709551615',feeReceiver:'fees.sandbox'});
quote.maker_gives=[{asset:{kind:'P',series_id:'old'},amount:String(Q)},{asset:{kind:'N',series_id:'new'},amount:'340282366920938463463374607431768211455'}];
quote.taker_gives=[{asset:{kind:'COLLATERAL'},amount:'1'}];quote.signature='0'.repeat(128);
const pair={...quote,kind:'pair_quote',taker:'taker.sandbox',series_id:'old',pair_amount:String(Q),maker_leg:'N',maker_collateral:String(Q/4n)};delete pair.maker_gives;delete pair.taker_gives;
const result={scope:'Unsigned encoding vectors; zero signatures are placeholders, not authorization',vectors:[quote,pair].map(quote=>({quote,signing_bytes:signingBytes(quote).toString('hex'),sha256:digest(quote)}))};
const content=JSON.stringify(result,null,2)+'\n',file=new URL('../fixtures/rfq/encoding-v1.json',import.meta.url);
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==content)throw Error('RFQ vectors stale');console.log('RFQ binary vectors reproduce');}else await writeFile(file,content);
