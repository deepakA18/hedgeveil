import {ClientError,fail} from '../../packages/sdk/intent.mjs';
import {configuration,ReadRpc} from './rpc.mjs';
import {Store} from './store.mjs';
import {completeOutcomes,extractEvents} from './model.mjs';

// Timestamp_ns is exact. The redundant unsafe JSON numeric timestamp is deliberately omitted.
export function header(block) {
    const h=block.header;
    if(!h?.hash||!h.prev_hash||!Number.isSafeInteger(h.height)||!/^\d+$/.test(h.timestamp_nanosec))fail('BLOCK_INVALID');
    return {header:{hash:h.hash,prev_hash:h.prev_hash,height:h.height,timestamp_nanosec:h.timestamp_nanosec},chunks:block.chunks.map(c=>({chunk_hash:c.chunk_hash,height_included:c.height_included}))};
}
export class Indexer {
    constructor(input,options={}) {this.config=configuration(input);this.rpc=new ReadRpc(this.config,options);this.store=new Store(this.config);}
    async init() {
        const anchor=header(await this.rpc.request('block',{block_id:this.config.anchor_hash}));
        if(anchor.header.hash!==this.config.anchor_hash)fail('ANCHOR_MISMATCH');
        await this.store.init(anchor);
    }
    async collect() {
        const started_at=new Date().toISOString();
        const {meta,makers}=await this.store.state();
        const head=header(await this.rpc.request('block',{finality:'final'}));
        if(BigInt(head.header.height)<BigInt(meta.cursor_height))fail('RPC_BEHIND_CURSOR');
        const blocks=[];let current=head;
        while(current.header.hash!==meta.cursor_hash) {
            if(blocks.length>=this.config.max_blocks)fail('BACKFILL_LIMIT');
            if(BigInt(current.header.height)<=BigInt(meta.cursor_height))fail('ANCESTRY_MISMATCH');
            blocks.push(current);
            const parent=current.header.prev_hash;
            current=header(await this.rpc.request('block',{block_id:parent}));
            if(current.header.hash!==parent)fail('ANCESTRY_MISMATCH');
        }
        blocks.reverse();
        const transactions=[],seen=new Set();
        for(const b of blocks)for(const ch of b.chunks) {
            if(ch.height_included!==b.header.height)continue; // Reused chunk; not a new inclusion.
            const chunk=await this.rpc.request('chunk',{chunk_id:ch.chunk_hash});
            if(chunk.header.chunk_hash!==ch.chunk_hash||chunk.header.height_created>b.header.height)fail('CHUNK_MISMATCH');
            for(const tx of chunk.transactions) {
                if(seen.has(tx.hash))fail('TRANSACTION_DUPLICATE');seen.add(tx.hash);
                const raw=await this.rpc.request('tx',{tx_hash:tx.hash,sender_account_id:tx.signer_id,wait_until:'FINAL'});
                const outcomes=completeOutcomes(raw,tx);
                transactions.push({inclusion_hash:b.header.hash,raw,outcomes,events:outcomes.flatMap(r=>extractEvents(r,this.config.contracts))});
            }
        }
        const newMakers=transactions.flatMap(t=>t.events).filter(e=>e.name==='SIGNING_KEY_REGISTERED').map(e=>({contract:e.contract,maker:e.payload.actor}));
        const snapshots=[];
        for(const contract of this.config.contracts) {
            const ids=[...new Set([...makers,...newMakers].filter(m=>m.contract===contract.account_id).map(m=>m.maker))];
            snapshots.push(await this.rpc.snapshot(contract,head,ids));
        }
        const observed_head=header(await this.rpc.request('block',{finality:'final'}));
        return {started_at,observed_height:observed_head.header.height,expected_cursor:meta.cursor_hash,head,blocks,transactions,snapshots,rpc_failures:this.rpc.failures,rpc_failovers:this.rpc.failovers};
    }
    async sync(options) {
        try{return await this.store.apply(await this.collect(),options);}
        catch(e) {
            const code=e instanceof ClientError?e.code:'INDEXER_FAILURE';
            if(code!=='CURSOR_CHANGED')await this.store.markFailure(code).catch(()=>{});
            throw e;
        }
    }
    async close(){await this.store.close();}
}
