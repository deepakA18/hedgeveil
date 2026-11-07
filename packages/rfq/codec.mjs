// Explicit signing wire format; never serialize money through JS Number.
import {createHash,sign,verify,createPublicKey} from 'node:crypto';
export const Q=10n**24n;
export function uint(value,bits=128){if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>=1n<<BigInt(bits))throw Error('canonical unsigned integer required');return BigInt(value);}
const integer=(value,bytes)=>{let n=uint(value,bytes*8),out=Buffer.alloc(bytes);for(let i=0;i<bytes;i++){out[i]=Number(n&255n);n>>=8n;}return out;};
const length=n=>integer(String(n),4);
const string=s=>{if(typeof s!=='string')throw Error('string required');const b=Buffer.from(s,'utf8');return Buffer.concat([length(b.length),b]);};
const optional=s=>s===null?Buffer.from([0]):Buffer.concat([Buffer.from([1]),string(s)]);
const asset=a=>a.kind==='COLLATERAL'?Buffer.from([0]):['P','N'].includes(a.kind)?Buffer.concat([Buffer.from([a.kind==='P'?1:2]),string(a.series_id)]):(()=>{throw Error('unsupported asset');})();
const legs=xs=>Buffer.concat([length(xs.length),...xs.flatMap(l=>[asset(l.asset),integer(l.amount,16)])]);
export function signingBytes(q){
 const pair=q.kind==='pair_quote';if(!pair&&q.kind!=='quote')throw Error('unknown quote kind');
 const pieces=[Buffer.from(pair?'HEDGEVEIL:PAIR:1\0':'HEDGEVEIL:RFQ:1\0'),string(q.kind),string(q.schema_version),string(q.domain.protocol_version),string(q.domain.network),string(q.domain.contract_id),string(q.maker),optional(q.taker)];
 if(pair)pieces.push(string(q.series_id),integer(q.pair_amount,16),string(q.maker_leg),integer(q.maker_collateral,16));else pieces.push(legs(q.maker_gives),legs(q.taker_gives));
 pieces.push(string(q.fee.asset),integer(q.fee.amount,16),string(q.fee.receiver),string(q.fill_rule),string(q.rounding),integer(q.nonce,8),integer(q.cancellation_epoch,8),integer(q.expiry_ns,8),string(q.signing_key_id),string(q.signature_scheme));return Buffer.concat(pieces);
}
export const digest=q=>createHash('sha256').update(signingBytes(q)).digest('hex');
export const signQuote=(q,key)=>({...q,signature:sign(null,signingBytes(q),key).toString('hex')});
export function verifyQuote(q,publicHex){if(!/^[0-9a-f]{64}$/.test(publicHex)||!/^[0-9a-f]{128}$/.test(q.signature))return false;const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(publicHex,'hex')])});return verify(null,signingBytes(q),key,Buffer.from(q.signature,'hex'));}
export function baseQuote({contract,maker,taker=null,keyId,nonce,epoch,expiry,feeReceiver}){return {kind:'quote',schema_version:'0.2.0',domain:{protocol_version:'1',network:'sandbox',contract_id:contract},maker,taker,maker_gives:[],taker_gives:[],fee:{asset:'NATIVE_NEAR',amount:'0',receiver:feeReceiver},fill_rule:'ALL_OR_NOTHING',rounding:'EXACT_AMOUNTS',nonce:String(nonce),cancellation_epoch:String(epoch),expiry_ns:String(expiry),signing_key_id:keyId,signature_scheme:'ed25519'};}
