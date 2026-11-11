import {ClientError,fail} from '../../packages/sdk/intent.mjs';
import {configuration,ReadRpc} from './rpc.mjs';
import {Store} from './store.mjs';
import {completeOutcomes,extractEvents} from './model.mjs';
import {collectAncestry} from './ancestry.mjs';
import {collectJournalTransactions} from './discovery.mjs';
import {NeardataDiscovery} from './neardata-discovery.mjs';

export function watchedRoot(tx,contracts){
    const ids=new Set(contracts.map(c=>c.account_id));
    return ids.has(tx.receiver_id)||tx.actions?.some(a=>ids.has(a?.Delegate?.delegate_action?.receiver_id))===true;
}

// Timestamp_ns is exact. The redundant unsafe JSON numeric timestamp is deliberately omitted.
export function header(block) {
    const h=block.header;
    if(!h?.hash||!h.prev_hash||!Number.isSafeInteger(h.height)||!/^\d+$/.test(h.timestamp_nanosec))fail('BLOCK_INVALID');
    return {header:{hash:h.hash,prev_hash:h.prev_hash,height:h.height,timestamp_nanosec:h.timestamp_nanosec},chunks:block.chunks.map(c=>({chunk_hash:c.chunk_hash,height_included:c.height_included,...(c.tx_root?{tx_root:c.tx_root}:{})}))};
}
async function boundedMap(items,work,limit=4){
    const out=new Array(items.length);let next=0,error;
    await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
        while(!error&&next<items.length){const i=next++;try{out[i]=await work(items[i]);}catch(e){error=e;}}
    }));
    if(error)throw error;return out;
}
export class Indexer {
    constructor(input,options={}) {this.config=configuration(input);this.discover=options.discover;if(['journal-roots','canonical-journal'].includes(this.config.transaction_filter)&&typeof this.discover!=='function'&&!this.config.discovery_source)fail('DISCOVERY_REQUIRED');this.rpc=new ReadRpc(this.config,options);this.store=new Store(this.config);this.progress={phase:'idle'};if(this.config.discovery_source)this.feed=new NeardataDiscovery(this.store,this.config.contracts,options.neardataOptions);}
    async init() {
        const anchor=header(await this.rpc.request('block',{block_id:this.config.anchor_hash}));
        if(anchor.header.hash!==this.config.anchor_hash)fail('ANCHOR_MISMATCH');
        await this.store.init(anchor);this.anchor=anchor;
        // Immutable responses are cached only inside this chain/deployment-bound
        // schema. Projection still validates ancestry, full receipts and state.
        this.rpc.cache={get:key=>this.store.cached(key),put:(key,value)=>this.store.cache(key,value)};
        if(this.feed){await this.store.initFeed();this.feed.start();}
    }
    async collect() {return this.rpc.batch(()=>this.collectBatch());}
    async collectBatch() {
        if(this.config.transaction_filter==='canonical-journal')return this.collectCanonical();
        const started_at=new Date().toISOString();
        const {meta,makers,transactions:known}=await this.store.state();
        // Hold a finalized catch-up target through read failures. Moving to a
        // newer head on every retry can starve the oldest missing history.
        const head=this.targetHead??=header(await this.rpc.request('block',{finality:'final'}));
        if(BigInt(head.header.height)<BigInt(meta.cursor_height))fail('RPC_BEHIND_CURSOR');
        this.progress={phase:'headers',completed:0,total:head.header.height-Number(meta.cursor_height),started_at};
        const blocks=await collectAncestry({head,cursor_hash:meta.cursor_hash,cursor_height:meta.cursor_height,max_blocks:this.config.max_blocks,
            block:async block_id=>header(await this.rpc.request('block',{block_id})),progress:completed=>{this.progress.completed=completed;},concurrency:this.config.read_concurrency});
        let transactions;
        if(this.config.transaction_filter==='journal-roots'){
            const candidates=await this.discover();
            this.progress={phase:'receipts',completed:0,total:candidates.length,started_at};
            transactions=await collectJournalTransactions({candidates,known:new Set(known.map(t=>t.hash)),rpc:this.rpc,blocks,head,anchor:this.anchor,storedBlock:hash=>this.store.block(hash),contracts:this.config.contracts,network:this.config.network,progress:n=>{this.progress.completed=n;}});
        }else{
        const seen=new Set();
        // Empty transaction roots need no chunk-body lookup. Descendant receipts
        // are still fetched through every included transaction's complete FINAL tree.
        const chunks=blocks.flatMap(b=>b.chunks.filter(ch=>ch.height_included===b.header.height&&ch.tx_root!=='11111111111111111111111111111111').map(ch=>({b,ch})));
        this.progress={phase:'chunks',completed:0,total:chunks.length,started_at};
        const included=(await boundedMap(chunks,async({b,ch})=>{
            const chunk=await this.rpc.request('chunk',{chunk_id:ch.chunk_hash});
            if(chunk.header.chunk_hash!==ch.chunk_hash||chunk.header.height_created>b.header.height)fail('CHUNK_MISMATCH');
            if(ch.tx_root&&chunk.header.tx_root!==ch.tx_root)fail('CHUNK_MISMATCH');
            this.progress.completed++;
            return chunk.transactions.filter(tx=>this.config.transaction_filter!=='watched-roots'||watchedRoot(tx,this.config.contracts)).map(tx=>({tx,inclusion_hash:b.header.hash}));
        },this.config.read_concurrency)).flat();
        this.progress={phase:'receipts',completed:0,total:included.length,started_at};
        transactions=await boundedMap(included,async({tx,inclusion_hash})=>{
                if(seen.has(tx.hash))fail('TRANSACTION_DUPLICATE');seen.add(tx.hash);
                const raw=await this.rpc.request('tx',{tx_hash:tx.hash,sender_account_id:tx.signer_id,wait_until:'FINAL'});
                const outcomes=completeOutcomes(raw,tx);
                this.progress.completed++;
                return {inclusion_hash,raw,outcomes,events:outcomes.flatMap(r=>extractEvents(r,this.config.contracts,this.config.network))};
        });
        }
        const newMakers=transactions.flatMap(t=>t.events).filter(e=>e.name==='SIGNING_KEY_REGISTERED').map(e=>({contract:e.contract,maker:e.payload.actor}));
        const snapshots=[];
        this.progress={phase:'snapshots',completed:0,total:this.config.contracts.length,started_at};
        for(const contract of this.config.contracts) {
            const ids=[...new Set([...makers,...newMakers].filter(m=>m.contract===contract.account_id).map(m=>m.maker))];
            snapshots.push(await this.rpc.snapshot(contract,head,ids));
            this.progress.completed++;
        }
        const observed_head=header(await this.rpc.request('block',{finality:'final'}));
        return {started_at,observed_height:observed_head.header.height,expected_cursor:meta.cursor_hash,head,blocks,transactions,snapshots,rpc_failures:this.rpc.failures,rpc_failovers:this.rpc.failovers};
    }
    async collectCanonical(){
        const {meta,makers,transactions:known}=await this.store.state();
        const initialHead=header(await this.rpc.request('block',{finality:'final'}));
        if(BigInt(initialHead.header.height)<BigInt(meta.cursor_height))fail('RPC_BEHIND_CURSOR');
        const journalHints=this.discover?await this.discover():[],feedHints=this.feed?await this.store.feedCandidates():[];
        const hints=[...journalHints,...feedHints],byHash=new Map();
        for(const hint of hints){if(byHash.has(hint.hash)&&byHash.get(hint.hash).signer_id!==hint.signer_id)fail('DISCOVERY_CONFLICT');byHash.set(hint.hash,hint);}
        const candidates=[...byHash.values()],blocks=[],unresolved=[];
        this.progress={phase:'receipts',completed:0,total:candidates.length,started_at:new Date().toISOString()};
        const transactions=await collectJournalTransactions({candidates,known:new Set(known.map(t=>t.hash)),rpc:this.rpc,blocks,head:initialHead,anchor:this.anchor,storedBlock:hash=>this.store.block(hash),contracts:this.config.contracts,network:this.config.network,canonical:true,unresolved,progress:n=>{this.progress.completed=n;}});
        // Receipt discovery may take time. Fresh same-block snapshots, not that
        // earlier discovery start, define the checkpoint's age and lag.
        const started_at=new Date().toISOString(),head=header(await this.rpc.request('block',{finality:'final'}));
        if(head.header.height<initialHead.header.height)fail('RPC_BEHIND_CURSOR');
        const newMakers=transactions.flatMap(t=>t.events).filter(e=>e.name==='SIGNING_KEY_REGISTERED').map(e=>({contract:e.contract,maker:e.payload.actor}));
        this.progress={phase:'snapshots',completed:0,total:this.config.contracts.length,started_at};
        const snapshots=await boundedMap(this.config.contracts,async contract=>{
            const ids=[...new Set([...makers,...newMakers].filter(m=>m.contract===contract.account_id).map(m=>m.maker))];
            const snapshot=await this.rpc.snapshot(contract,head,ids);this.progress.completed++;return snapshot;
        },this.config.read_concurrency);
        const observed=header(await this.rpc.request('block',{finality:'final'}));
        const canonicalBlocks=[...new Map([...blocks.map(header),head].map(b=>[b.header.hash,b])).values()].sort((a,b)=>a.header.height-b.header.height);
        return {started_at,observed_height:observed.header.height,expected_cursor:meta.cursor_hash,head,blocks:canonicalBlocks,transactions,snapshots,unresolved_transactions:unresolved,rpc_failures:this.rpc.failures,rpc_failovers:this.rpc.failovers};
    }
    async sync(options) {
        try{const result=await this.store.apply(await this.collect(),options);this.targetHead=null;this.progress={phase:'idle',finished_at:new Date().toISOString()};if(this.feed)result.health=(await this.store.read('health')).health;return result;}
        catch(e) {
            const code=e instanceof ClientError?e.code:'INDEXER_FAILURE';
            const progress={...this.progress,...(this.rpc.lastFailure?{rpc:this.rpc.lastFailure}:{})};this.progress={...this.progress,phase:'failed',code};
            if(code==='CURSOR_CHANGED')this.targetHead=null;
            if(code!=='CURSOR_CHANGED')await this.store.markFailure(code,progress).catch(()=>{});
            throw e;
        }
    }
    async close(){await this.feed?.stop();await this.store.close();}
}
