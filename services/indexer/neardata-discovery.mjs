import {account,fail} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';

// Only discovery hints cross this boundary. RPC and monetary verification remain
// in collectJournalTransactions / Store.apply. Never infer success from logs.
export function feedBlock(value,height,contracts){
    if(value===null)return null;
    const b=value?.block,h=b?.header;
    if(!h||h.height!==height||!Number.isSafeInteger(height)||!/^\d+$/.test(h.timestamp_nanosec)||!Array.isArray(b.chunks)||!Array.isArray(value.shards))fail('FEED_BLOCK_INVALID');
    hash32(h.hash);hash32(h.prev_hash);
    const watched=new Set(contracts.map(c=>c.account_id)),found=new Map(),shards=new Set();
    const add=(hash,signer_id)=>{hash32(hash);account(signer_id);if(found.has(hash)&&found.get(hash)!==signer_id)fail('FEED_SIGNER_CONFLICT');found.set(hash,signer_id);};
    for(const s of value.shards){
        if(!Number.isSafeInteger(s.shard_id)||shards.has(s.shard_id)||!Array.isArray(s.receipt_execution_outcomes))fail('FEED_SHARD_INVALID');
        shards.add(s.shard_id);
        const ch=b.chunks.find(c=>c.shard_id===s.shard_id);
        if(!ch)fail('FEED_SHARD_INVALID');
        if(s.chunk){
            if(s.chunk.header?.chunk_hash!==ch.chunk_hash||!Array.isArray(s.chunk.transactions))fail('FEED_CHUNK_INVALID');
            for(const item of s.chunk.transactions){
                const tx=item.transaction;
                if(!tx)fail('FEED_TRANSACTION_INVALID');
                if(watched.has(tx.receiver_id)||tx.actions?.some(a=>watched.has(a?.Delegate?.delegate_action?.receiver_id)))add(tx.hash,tx.signer_id);
            }
        }
        for(const item of s.receipt_execution_outcomes){
            const r=item.receipt,o=item.execution_outcome;
            if(!o?.outcome||!r||o.block_hash!==h.hash||o.id!==r.receipt_id||o.outcome.executor_id!==r.receiver_id)fail('FEED_RECEIPT_INVALID');
            if(watched.has(r.receiver_id)&&r.predecessor_id!=='system'&&r.receipt?.Action)add(item.tx_hash,r.receipt.Action.signer_id);
        }
    }
    if(shards.size!==b.chunks.length)fail('FEED_SHARD_MISSING');
    return {height,hash:h.hash,prev_hash:h.prev_hash,hints:[...found].map(([hash,signer_id])=>({hash,signer_id}))};
}

export class NeardataFeed {
    constructor({fetchImpl=globalThis.fetch,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),intervalMs=2500}={}){
        if(!Number.isSafeInteger(intervalMs)||intervalMs<400||intervalMs>60000)fail('FEED_INTERVAL');
        this.fetch=fetchImpl;this.now=now;this.sleep=sleep;this.intervalMs=intervalMs;this.next=0;this.cooldown=0;
        this.stats={requests:0,rate_limited:0,started_at_ms:this.now()};
    }
    async get(path){
        if(this.cooldown>this.now())fail('FEED_COOLDOWN');
        const start=Math.max(this.now(),this.next);this.next=start+this.intervalMs;
        if(start>this.now())await this.sleep(start-this.now());
        if(this.cooldown>this.now())fail('FEED_COOLDOWN');
        this.stats.requests++;
        const r=await this.fetch('https://testnet.neardata.xyz/v0/'+path,{signal:AbortSignal.timeout(15000)});
        if(r.status===429){
            const retry=r.headers?.get('retry-after'),delay=retry&&/^\d+(\.\d+)?$/.test(retry)?Number(retry)*1000:Date.parse(retry??'')-this.now();
            // Some free gateways return Retry-After: 0. Do not hot-loop on it.
            this.cooldown=this.now()+(Number.isFinite(delay)?Math.max(60000,delay):60000);
            this.stats.rate_limited++;this.stats.last_limit={path,at_ms:this.now(),retry_at_ms:this.cooldown};
            await r.body?.cancel();fail('FEED_RATE_LIMITED');
        }
        if(!r.ok){await r.body?.cancel();fail('FEED_UNAVAILABLE');}
        return r.json();
    }
}

export class NeardataDiscovery {
    constructor(store,contracts,{feed=new NeardataFeed()}={}){this.store=store;this.contracts=contracts;this.feed=feed;this.stopped=false;}
    async step(){
        const cursor=await this.store.feedState();
        this.feed.cooldown=Math.max(this.feed.cooldown??0,Number(cursor.retry_at_ms??0));
        const latest=await this.feed.get('last_block/final'),target=latest?.block?.header?.height;
        if(!Number.isSafeInteger(target)||target<Number(cursor.height))fail('FEED_HEAD_INVALID');
        feedBlock(latest,target,this.contracts);
        if(target===Number(cursor.block_height)&&latest.block.header.hash!==cursor.block_hash)fail('FEED_HEAD_MISMATCH');
        // Bounded prefetch; commits stay ordered and restart-safe. A failed page
        // is never converted to null or allowed to move the persisted cursor.
        const end=Math.min(target,Number(cursor.height)+24),results=[];
        let next=Number(cursor.height)+1;
        await Promise.all(Array.from({length:4},async()=>{
            while(!this.stopped&&next<=end){const height=next++;try{results.push({height,value:height===target?latest:await this.feed.get('block/'+height)});}catch(error){results.push({height,error});}}
        }));
        for(const row of results.sort((a,b)=>a.height-b.height)){
            if(row.error)throw row.error;
            await this.store.advanceFeed(row.height,feedBlock(row.value,row.height,this.contracts),target);
        }
        await this.store.feedObserved(target);
    }
    start(){
        if(this.running)return;
        this.running=(async()=>{while(!this.stopped){
            try{await this.step();}catch(e){await this.store.feedFailure(typeof e.code==='string'?e.code:'FEED_UNAVAILABLE',this.feed.cooldown??0).catch(()=>{});}
            if(!this.stopped)await new Promise(r=>{this.wake=r;this.timer=setTimeout(r,1000);});
        }})();
    }
    async stop(){this.stopped=true;clearTimeout(this.timer);this.wake?.();await this.running;}
}
