import {createHash,createPublicKey,randomBytes,timingSafeEqual,verify} from 'node:crypto';
import {account,fail} from '../../packages/sdk/intent.mjs';

export const SESSION_COOKIE='__Host-hv-session', CHALLENGE_COOKIE='__Host-hv-challenge';
export function httpsOrigin(value){
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.port||u.hostname==='localhost'||u.hostname==='127.0.0.1')throw Error('HTTPS_ORIGIN_REQUIRED');
    return u.origin;
}
export function hostedSettings(env=process.env){
    if(!env.HEDGEVEIL_HOSTED_MODE)return null;
    if(env.HEDGEVEIL_HOSTED_MODE!=='1')throw Error('INVALID_HOSTED_MODE');
    const frontend=httpsOrigin(env.HEDGEVEIL_FRONTEND_ORIGIN),backend=httpsOrigin(env.HEDGEVEIL_BACKEND_ORIGIN),secret=env.HEDGEVEIL_BRIDGE_SECRET;
    if(frontend===backend||!secret||!/^[a-f0-9]{64}$/.test(secret))throw Error('INVALID_BRIDGE_SETTINGS');
    return {frontend,backend,secret};
}
const digest=s=>createHash('sha256').update(s).digest('hex');
export function gatewayAllowed(req,settings){
    const expected=Buffer.from('Bearer '+settings.secret),given=Buffer.from(String(req.headers.authorization??''));
    return given.length===expected.length&&timingSafeEqual(given,expected)&&req.headers.host===new URL(settings.backend).host&&req.headers.origin===settings.frontend&&req.headers['x-forwarded-proto']==='https';
}
export function cookieValue(raw,name){
    const values=String(raw??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
    if(values.length!==1)return '';
    const value=values[0].slice(name.length+1);return /^[a-f0-9]{64}$/.test(value)?value:'';
}
export function cookie(name,value,seconds){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;}
function base58Decode(value){
    const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    if(typeof value!=='string'||value.length>44)fail('AUTH_INVALID');
    let n=0n;for(const c of value){const i=alphabet.indexOf(c);if(i<0)fail('AUTH_INVALID');n=n*58n+BigInt(i);}
    const hex=n.toString(16),tail=n?Buffer.from(hex.padStart(Math.ceil(hex.length/2)*2,'0'),'hex'):Buffer.alloc(0);
    const bytes=Buffer.concat([Buffer.alloc(value.match(/^1*/)[0].length),tail]);
    if(bytes.length!==32)fail('AUTH_INVALID');return bytes;
}
const string=s=>{const b=Buffer.from(s),n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};
export function nep413Digest({message,nonce,recipient}){
    const tag=Buffer.alloc(4);tag.writeUInt32LE(2147484061);
    // This application never requests a redirect callback. Borsh Option::None = 0.
    return createHash('sha256').update(Buffer.concat([tag,string(message),Buffer.from(nonce),string(recipient),Buffer.from([0])])).digest();
}
// Memory is deliberately bounded. Restart invalidates logins, never durable operations.
export class HostedAuth {
    constructor({frontend,config,verifyKey,now=Date.now}){this.frontend=frontend;this.config=config;this.verifyKey=verifyKey;this.now=now;this.challenges=new Map();this.sessions=new Map();}
    prune(){for(const map of [this.challenges,this.sessions])for(const [k,v] of map)if(v.expires<=this.now())map.delete(k);}
    challenge(id){
        account(id);this.prune();if(this.challenges.size>=128)fail('RATE_LIMITED');
        const token=randomBytes(32).toString('hex'),nonce=randomBytes(32),expires=this.now()+120000;
        const payload={message:`Sign in to Hedgeveil as ${id}.\nNetwork: ${this.config.network}\nContract: ${this.config.contract_id}\nGenesis: ${this.config.genesis_hash}\nOrigin: ${this.frontend}\nExpires: ${new Date(expires).toISOString()}\nThis message does not authorize a transaction.`,recipient:new URL(this.frontend).host,nonce:[...nonce]};
        this.challenges.set(digest(token),{id,expires,payload});return {token,payload};
    }
    async login(token,signed){
        this.prune();const key=digest(token),c=this.challenges.get(key);this.challenges.delete(key);
        if(!c||signed?.accountId!==c.id||typeof signed.publicKey!=='string'||!signed.publicKey.startsWith('ed25519:')||typeof signed.signature!=='string')fail('AUTH_INVALID');
        const raw=base58Decode(signed.publicKey.slice(8)),signature=Buffer.from(signed.signature,'base64');
        if(signature.length!==64||signature.toString('base64')!==signed.signature)fail('AUTH_INVALID');
        const publicKey=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),format:'der',type:'spki'});
        if(!verify(null,nep413Digest(c.payload),publicKey,signature))fail('AUTH_INVALID');
        // Full-access membership at a verified final block, never trust the supplied account name.
        if(!await this.verifyKey(c.id,signed.publicKey))fail('AUTH_INVALID');
        if(c.expires<=this.now())fail('AUTH_INVALID');
        this.prune();if(this.sessions.size>=256)fail('RATE_LIMITED');
        const session=randomBytes(32).toString('hex');this.sessions.set(digest(session),{id:c.id,expires:this.now()+900000});return session;
    }
    owner(token){this.prune();return this.sessions.get(digest(token))?.id??null;}
    logout(token){this.sessions.delete(digest(token));}
}
// Limits are process-wide on the single persistent gateway, not per Vercel instance.
export class RequestBudget {
    constructor(now=Date.now){this.now=now;this.buckets=new Map();this.active=0;this.writes=0;}
    take(key,max){
        const now=this.now();for(const [k,v] of this.buckets)if(v.until<=now)this.buckets.delete(k);
        let b=this.buckets.get(key);if(!b){if(this.buckets.size>=2048)fail('RATE_LIMITED');b={n:0,until:now+60000};this.buckets.set(key,b);}
        if(++b.n>max)fail('RATE_LIMITED');
    }
    enter(write){this.take('all',1200);if(this.active>=32||write&&this.writes>=8)fail('RATE_LIMITED');this.active++;if(write)this.writes++;let released=false;return()=>{if(released)return;released=true;this.active--;if(write)this.writes--;};}
}
