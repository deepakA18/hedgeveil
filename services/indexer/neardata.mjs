import {fail} from '../../packages/sdk/intent.mjs';

// Hosted headers are prefetch hints. The indexer must still connect every
// parent hash between its RPC-pinned final head and deployment anchor/cursor.
export class NeardataHeaders {
    constructor({fetchImpl=globalThis.fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){this.fetch=fetchImpl;this.now=now;this.sleep=sleep;this.next=0;this.cooldown=0;this.stats={requests:0,accepted:0,limited:0,unavailable:0};}
    async block(height){
        if(!Number.isSafeInteger(height)||height<0)fail('HEADER_HEIGHT');
        if(this.cooldown>this.now())fail('HEADER_COOLDOWN');
        const start=Math.max(this.now(),this.next);this.next=start+400;
        if(start>this.now())await this.sleep(start-this.now());
        if(this.cooldown>this.now())fail('HEADER_COOLDOWN');
        this.stats.requests++;
        const r=await this.fetch(`https://testnet.neardata.xyz/v0/block/${height}/headers`,{signal:AbortSignal.timeout(15000)});
        if(r.status===429){
            const retry=r.headers?.get('retry-after'),delay=retry&&/^\d+(\.\d+)?$/.test(retry)?Number(retry)*1000:Date.parse(retry??'')-this.now();
            this.stats.limited++;this.cooldown=this.now()+(Number.isFinite(delay)?Math.max(1000,delay):60000);await r.body?.cancel();fail('HEADER_RATE_LIMITED');
        }
        if(!r.ok){this.stats.unavailable++;fail('HEADER_UNAVAILABLE');}
        const b=await r.json();
        if(!b||b.header?.height!==height||typeof b.header.hash!=='string'||typeof b.header.prev_hash!=='string'||!Array.isArray(b.chunks)){this.stats.unavailable++;fail('HEADER_INVALID');}
        this.stats.accepted++;
        return b;
    }
}
