import {createHash,createPublicKey,verify} from 'node:crypto';
import {fail,fields} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';
import {normalizePrice,ASSET,PRICE_SCALE} from './reader.mjs';

// Published provider key: interoperability only. Attestation/authority approval
// remains separate; never adopt a key supplied by the response itself.
export const DOCUMENTED_FEED_KEY='ed25519:FU6EnB4UaAiDCAxvQPkRUu5QQExgzvKQAX891wMEX3rU';
export const digest=s=>createHash('sha256').update(s).digest('hex');
const MAX_BYTES=16384;

// Small bounded JSON parser. JSON.parse alone silently accepts duplicate fields
// and rounds large numeric timestamps; neither is acceptable for signed data.
export function strictJson(text){
    if(typeof text!=='string'||Buffer.byteLength(text)>MAX_BYTES||!text.isWellFormed())fail('SIGNED_JSON_SIZE_OR_ENCODING');
    let i=0;
    const ws=()=>{while(/[\x20\t\r\n]/.test(text[i]??'x'))i++;};
    const str=()=>{
        const start=i++;let escaped=false;
        while(i<text.length){const c=text[i++];if(c==='"'&&!escaped){
            let s;try{s=JSON.parse(text.slice(start,i));}catch{fail('SIGNED_JSON');}
            if(!s.isWellFormed())fail('SIGNED_JSON');return s;
        }if(c==='\\'&&!escaped)escaped=true;else escaped=false;}
        fail('SIGNED_JSON');
    };
    const val=depth=>{
        if(depth>8)fail('SIGNED_JSON_DEPTH');ws();const c=text[i];
        if(c==='"')return str();
        if(c==='{'||c==='['){
            i++;const object=c==='{',end=object?'}':']',out=object?Object.create(null):[];ws();
            if(text[i]===end){i++;return out;}
            for(let n=0;n<128;n++){
                ws();let k;if(object){if(text[i]!=='"')fail('SIGNED_JSON');k=str();if(Object.hasOwn(out,k))fail('SIGNED_DUPLICATE_KEY');ws();if(text[i++]!==':')fail('SIGNED_JSON');}
                const v=val(depth+1);if(object)out[k]=v;else out.push(v);ws();
                if(text[i]===end){i++;return out;}if(text[i++]!==',')fail('SIGNED_JSON');
            }fail('SIGNED_JSON_SIZE_OR_ENCODING');
        }
        for(const [word,v]of [['true',true],['false',false],['null',null]])if(text.startsWith(word,i)){i+=word.length;return v;}
        const m=/^-?(?:0|[1-9][0-9]*)/.exec(text.slice(i));if(!m)fail('SIGNED_JSON');i+=m[0].length;
        const n=Number(m[0]);if(!Number.isSafeInteger(n)||Object.is(n,-0))fail('SIGNED_UNSAFE_NUMBER');return n;
    };
    const parsed=val(0);ws();if(i!==text.length)fail('SIGNED_JSON');return parsed;
}

function publicKey(pin){
    if(typeof pin!=='string'||!pin.startsWith('ed25519:'))fail('SIGNED_KEY');
    const raw=pin.slice(8);hash32(raw);let n=0n;
    for(const c of raw)n=n*58n+BigInt('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'.indexOf(c));
    const key=Buffer.from(n.toString(16).padStart(64,'0'),'hex');
    return createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),key]),format:'der',type:'spki'});
}
function seconds(v){
    if(typeof v!=='string'||! /^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>18446744073n)fail('SIGNED_TIME');
    return BigInt(v);
}

export function verifySigned(envelope,{pinned_key,asset_id=ASSET}={}){
    if(!envelope||envelope.success!==true||envelope.error!==null||envelope.sig_format!=='json')fail('SIGNED_ENVELOPE');
    if(envelope.public_key!==pinned_key)fail('SIGNED_KEY_MISMATCH');
    const key=publicKey(pinned_key),{payload,signature}=envelope;
    if(typeof payload!=='string'||!payload.isWellFormed()||Buffer.byteLength(payload)>MAX_BYTES)fail('SIGNED_PAYLOAD');
    if(typeof signature!=='string'||signature.length!==88)fail('SIGNED_SIGNATURE_ENCODING');
    const sig=Buffer.from(signature,'base64');if(sig.length!==64||sig.toString('base64')!==signature)fail('SIGNED_SIGNATURE_ENCODING');
    if(!verify(null,Buffer.from(payload,'utf8'),key,sig))fail('SIGNED_INVALID_SIGNATURE');
    const entries=strictJson(payload);
    if(!entries||Array.isArray(entries)||typeof entries!=='object'||!Object.hasOwn(entries,asset_id)||Object.keys(entries).length>32)fail('SIGNED_ASSET');
    for(const [asset,p]of Object.entries(entries)){
        if(!/^[a-z0-9][a-z0-9._-]{1,127}$/.test(asset))fail('SIGNED_ASSET');
        fields(p,['price','expo','publish_time']);
        if(typeof p.price!=='string'||! /^[1-9][0-9]*$/.test(p.price)||p.price.length>19||BigInt(p.price)>9223372036854775807n)fail('SIGNED_PRICE');
        if(!Number.isInteger(p.expo)||p.expo>0||p.expo< -18)fail('SIGNED_EXPONENT');
        if(!Number.isSafeInteger(p.publish_time)||p.publish_time<=0)fail('SIGNED_TIME');seconds(String(p.publish_time));
    }
    const p=entries[asset_id];
    return {version:1,asset_id,price:normalizePrice({multiplier:p.price,decimals:-p.expo}),price_scale:PRICE_SCALE,
        publish_time:String(p.publish_time),payload_hash:digest(payload),public_key:pinned_key,
        signature_verified:true,source_policy_authenticated:false,settlement_eligible:false,
        artifact:{version:1,public_key:pinned_key,sig_format:'json',payload,signature}};
}
export function verifyArtifact(artifact,options){
    fields(artifact,['version','public_key','sig_format','payload','signature']);if(artifact.version!==1)fail('SIGNED_ARCHIVE_VERSION');
    return verifySigned({...artifact,success:true,error:null},options);
}
export function requireCurrent(observation,{now_sec,max_age_sec='60'}={}){
    const now=seconds(now_sec),age=seconds(max_age_sec),stamp=seconds(observation.publish_time);
    if(age===0n||age>3600n)fail('SIGNED_AGE_BOUND');
    if(stamp>now)fail('SIGNED_FUTURE');if(now-stamp>age)fail('SIGNED_STALE');
    return {...observation,age_sec:String(now-stamp)};
}
