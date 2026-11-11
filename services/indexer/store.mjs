import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {canonical, fail} from '../../packages/sdk/intent.mjs';
import {binding,configuration} from './rpc.mjs';
import {digest,replayCore,replayOracle,replayExternal,reconcileCore,reconcileOracle,reconcileExternal,alerts} from './model.mjs';

export class Store {
    constructor(config) {
        this.config=configuration(config);
        this.pool=new pg.Pool({...config.postgres,max:4,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,application_name:'hedgeveil-local-indexer'});
        this.pool.on('error',()=>{}); // Worker/HTTP requests expose bounded errors, not credentials.
    }
    async transaction(fn,{readOnly=false}={}) {
        const c=await this.pool.connect();
        try {
            await c.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
            await c.query(`SET LOCAL search_path TO "${this.config.schema}"`);
            if(!readOnly)await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[this.config.schema]);
            const result=await fn(c);await c.query('COMMIT');return result;
        }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}
        finally{c.release();}
    }
    async init(anchor) {
        // Only this explicitly named local schema is created; no existing tables are dropped.
        const c=await this.pool.connect();
        try{await c.query(`CREATE SCHEMA IF NOT EXISTS "${this.config.schema}"`);}finally{c.release();}
        const sql=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
        await this.transaction(async db=>{
            await db.query(sql);
            await db.query('INSERT INTO meta(id,version,binding,cursor_hash,cursor_height,health) VALUES(1,1,$1,$2,$3,$4) ON CONFLICT DO NOTHING',
                [binding(this.config),anchor.header.hash,String(anchor.header.height),{state:'UNINITIALIZED',risk_allowed:false}]);
            const {rows:[m]}=await db.query('SELECT * FROM meta WHERE id=1');
            if(m.version!==1||canonical(m.binding)!==canonical(binding(this.config)))fail('DATABASE_BINDING_MISMATCH');
        });
    }
    async state() {
        return this.transaction(async db=>{
            const {rows:[meta]}=await db.query('SELECT * FROM meta WHERE id=1');
            const {rows:makers}=await db.query("SELECT DISTINCT contract,payload->>'actor' AS maker FROM events WHERE name='SIGNING_KEY_REGISTERED'");
            const {rows:transactions}=await db.query('SELECT hash FROM transactions');
            return {meta,makers,transactions};
        },{readOnly:true});
    }
    async block(hash){return this.transaction(async db=>(await db.query('SELECT body FROM blocks WHERE hash=$1',[hash])).rows[0]?.body,{readOnly:true});}
    async initFeed(){
        await this.transaction(db=>db.query(`INSERT INTO feed_cursor(id,baseline_height,baseline_hash,height,block_height,block_hash,observed_height,state)
            SELECT 1,cursor_height,cursor_hash,cursor_height,cursor_height,cursor_hash,cursor_height,'STARTING' FROM meta WHERE id=1 ON CONFLICT DO NOTHING`));
    }
    async feedState(){return this.transaction(async db=>(await db.query('SELECT * FROM feed_cursor WHERE id=1')).rows[0],{readOnly:true});}
    async feedCandidates(){return this.transaction(async db=>{
        const {rows}=await db.query('SELECT f.hash,f.signer_id FROM feed_candidates f LEFT JOIN transactions t ON t.hash=f.hash WHERE t.hash IS NULL ORDER BY f.discovered_height,f.hash LIMIT 10001');
        if(rows.length>10000)fail('DISCOVERY_LIMIT');return rows;
    },{readOnly:true});}
    async advanceFeed(height,block,observed){
        await this.transaction(async db=>{
            const {rows:[c]}=await db.query('SELECT * FROM feed_cursor WHERE id=1 FOR UPDATE');
            if(BigInt(height)!==BigInt(c.height)+1n)fail('FEED_CURSOR_CHANGED');
            if(block&&(block.height!==height||block.prev_hash!==c.block_hash))fail('FEED_PARENT_MISMATCH');
            for(const hint of block?.hints??[]){
                await db.query('INSERT INTO feed_candidates VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[hint.hash,hint.signer_id,String(height)]);
                const {rows:[old]}=await db.query('SELECT signer_id FROM feed_candidates WHERE hash=$1',[hint.hash]);
                if(old.signer_id!==hint.signer_id)fail('FEED_SIGNER_CONFLICT');
            }
            await db.query("UPDATE feed_cursor SET height=$1,block_height=$2,block_hash=$3,observed_height=$4,state='SCANNING',checked_at=now() WHERE id=1",[String(height),block?String(height):c.block_height,block?.hash??c.block_hash,String(observed)]);
        });
    }
    async feedObserved(height){await this.transaction(db=>db.query("UPDATE feed_cursor SET observed_height=$1,state='SCANNING',checked_at=now() WHERE id=1",[String(height)]));}
    async feedFailure(code,retryAt=0){await this.transaction(db=>db.query('UPDATE feed_cursor SET state=$1,retry_at_ms=GREATEST(retry_at_ms,$2) WHERE id=1',[code,String(retryAt)]));}
    async markFailure(code,progress) {
        await this.transaction(db=>db.query('UPDATE meta SET health=$1 WHERE id=1',[{state:code,risk_allowed:false,failed_at:new Date().toISOString(),...(progress?{failure_progress:progress}:{})}]));
    }
    async cached(key){return this.transaction(async db=>(await db.query('SELECT body FROM rpc_cache WHERE key=$1',[key])).rows[0]?.body,{readOnly:true});}
    async cache(key,body){
        await this.transaction(async db=>{
            await db.query('INSERT INTO rpc_cache(key,body) VALUES($1,$2) ON CONFLICT DO NOTHING',[key,body]);
            await db.query('DELETE FROM rpc_cache WHERE key IN (SELECT key FROM rpc_cache ORDER BY created_at DESC OFFSET 50000)');
        });
    }
    async apply(batch,{beforeCommit}={}) {
        return this.transaction(async db=>{
            const {rows:[meta]}=await db.query('SELECT * FROM meta WHERE id=1 FOR UPDATE');
            if(meta.cursor_hash!==batch.expected_cursor)fail('CURSOR_CHANGED');
            // Each accepted header must extend the old cursor; no height-based gap skipping.
            let parent=meta.cursor_hash,height=BigInt(meta.cursor_height);
            const sparse=this.config.transaction_filter==='canonical-journal';
            if(sparse&&BigInt(batch.head.header.height)<height)fail('RPC_BEHIND_CURSOR');
            for(const b of batch.blocks) {
                if(!sparse&&(b.header.prev_hash!==parent||BigInt(b.header.height)<=height))fail('BLOCK_GAP');
                if(sparse&&BigInt(b.header.height)>BigInt(batch.head.header.height))fail('BLOCK_GAP');
                parent=b.header.hash;height=BigInt(b.header.height);
                await db.query('INSERT INTO blocks(hash,height,prev_hash,timestamp_ns,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[parent,String(height),b.header.prev_hash,b.header.timestamp_nanosec,b]);
                const {rows:[old]}=await db.query('SELECT body FROM blocks WHERE hash=$1',[parent]);
                if(digest(old.body)!==digest(b))fail('BLOCK_CONFLICT');
            }
            if(parent!==batch.head.header.hash)fail('BLOCK_GAP');
            for(const tx of batch.transactions) {
                const t=tx.raw.transaction;
                await db.query('INSERT INTO transactions(hash,signer,receiver,inclusion_hash,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[t.hash,t.signer_id,t.receiver_id,tx.inclusion_hash,tx.raw]);
                const {rows:[old]}=await db.query('SELECT body,inclusion_hash FROM transactions WHERE hash=$1',[t.hash]);
                if(old.inclusion_hash!==tx.inclusion_hash||digest(old.body)!==digest(tx.raw))fail('TRANSACTION_CONFLICT');
                for(const row of tx.outcomes) {
                    await db.query('INSERT INTO outcomes(id,tx_hash,block_hash,executor,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[row.id,t.hash,row.block_hash,row.outcome.executor_id,row]);
                    const {rows:[o]}=await db.query('SELECT tx_hash,body FROM outcomes WHERE id=$1',[row.id]);
                    if(o.tx_hash!==t.hash||digest(o.body)!==digest(row))fail('RECEIPT_CONFLICT');
                }
                for(const row of tx.outcomes)for(const child of row.outcome.receipt_ids)await db.query('INSERT INTO receipt_links(parent,child) VALUES($1,$2) ON CONFLICT DO NOTHING',[row.id,child]);
                for(const e of tx.events) {
                    await db.query('INSERT INTO events(receipt_id,log_index,item_index,contract,kind,name,payload) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[e.receipt_id,e.log_index,e.item_index,e.contract,e.kind,e.name,e.payload]);
                    const {rows:[oldEvent]}=await db.query('SELECT contract,kind,name,payload FROM events WHERE receipt_id=$1 AND log_index=$2 AND item_index=$3',[e.receipt_id,e.log_index,e.item_index]);
                    if(canonical(oldEvent)!==canonical({contract:e.contract,kind:e.kind,name:e.name,payload:e.payload}))fail('EVENT_CONFLICT');
                }
            }
            const {rows:events}=await db.query('SELECT e.* FROM events e JOIN outcomes o ON o.id=e.receipt_id JOIN blocks b ON b.hash=o.block_hash WHERE b.height<=$1',[String(height)]);
            if(events.length>this.config.max_events)fail('EVENT_LIMIT');
            await db.query('DELETE FROM balances');
            const results=[];
            for(const s of batch.snapshots) {
                const es=events.filter(e=>e.contract===s.contract);
                const replay=s.kind==='core'?replayCore(s.contract,es,this.config.network):s.kind==='external_oracle'?replayExternal(es):replayOracle(es);
                const result=s.kind==='core'?reconcileCore(replay,s):s.kind==='external_oracle'?reconcileExternal(replay,s):reconcileOracle(replay,s);
                results.push(result);
                if(s.block_hash!==parent)fail('VIEW_BLOCK_MISMATCH');
                if(s.kind==='core')for(const [key,amount] of replay.balances) {
                    const [owner,bucket,id,asset]=JSON.parse(key);
                    await db.query('INSERT INTO balances VALUES($1,$2,$3,$4,$5,$6)',[s.contract,owner,bucket,id,asset,String(amount)]);
                }
                for(const e of es)await db.query('UPDATE events SET sequence=$1 WHERE receipt_id=$2 AND log_index=$3 AND item_index=$4',[e.sequence,e.receipt_id,e.log_index,e.item_index]);
                await db.query('INSERT INTO snapshots VALUES($1,$2,$3,$4,$5) ON CONFLICT(contract) DO UPDATE SET block_hash=excluded.block_hash,body=excluded.body,reconciliation=excluded.reconciliation',[s.contract,s.kind,parent,s,result]);
            }
            if(canonical(batch.snapshots.map(s=>[s.contract,s.kind]).sort())!==canonical(this.config.contracts.map(c=>[c.account_id,c.kind]).sort()))fail('MISSING_SNAPSHOT');
            const notices=alerts(batch.snapshots,batch.head.header.timestamp_nanosec);
            const {rows:[failed]}=await db.query("SELECT count(*)::text AS n FROM outcomes o JOIN blocks b ON b.hash=o.block_hash WHERE o.executor=ANY($1) AND o.body->'outcome'->'status' ? 'Failure'",[this.config.contracts.map(c=>c.account_id)]);
            if(BigInt(failed.n)>0n)notices.push({code:'FAILED_CONTRACT_RECEIPTS',contract:'all',entity:failed.n,severity:'warning'});
            const lag=BigInt(batch.observed_height??height)-height;
            if(lag<0n)fail('RPC_BEHIND_CURSOR');
            const lagging=lag>BigInt(this.config.max_lag_blocks);
            if(lagging)notices.push({code:'INDEXER_LAG',contract:'all',entity:String(lag),severity:'critical'});
            await db.query('DELETE FROM alerts');
            for(const a of notices)await db.query('INSERT INTO alerts VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[a.code,a.contract,a.entity,a.severity]);
            const health={state:lagging?'LAGGING':'RECONCILED',risk_allowed:!lagging,reconciled:true,lag_blocks:String(lag),block_hash:parent,height:String(height),rpc_failures:batch.rpc_failures,rpc_failovers:batch.rpc_failovers,unresolved_transactions:batch.unresolved_transactions??[]};
            await db.query('UPDATE meta SET cursor_hash=$1,cursor_height=$2,generation=generation+1,checked_at=$4,health=$3 WHERE id=1',[parent,String(height),health,batch.started_at??new Date().toISOString()]);
            if(beforeCommit)await beforeCommit(db);
            return {health,reconciliations:results,event_count:events.length,alerts:notices};
        });
    }
    async read(resource,{limit=100,offset=0}={}) {
        if(!Number.isSafeInteger(limit)||limit<1||limit>200||!Number.isSafeInteger(offset)||offset<0||offset>1000000)fail('PAGE_BOUNDS');
        return this.transaction(async db=>{
            const {rows:[m]}=await db.query('SELECT * FROM meta WHERE id=1');
            const age=m.checked_at?Math.max(0,Date.now()-m.checked_at.getTime()):null;
            const stale=age===null||age>this.config.stale_after_ms;
            const health={...m.health,risk_allowed:!stale&&m.health.risk_allowed===true,stale,age_ms:age,cursor_hash:m.cursor_hash,height:m.cursor_height,generation:m.generation};
            if(this.config.discovery_source){
                const {rows:[f]}=await db.query('SELECT * FROM feed_cursor WHERE id=1');
                const lag=f?Math.max(0,Number(m.cursor_height)-Number(f.block_height),Number(f.observed_height)-Number(f.block_height)):null;
                const fresh=f?.checked_at&&Date.now()-f.checked_at.getTime()<=this.config.stale_after_ms;
                health.discovery={source:this.config.discovery_source,required:this.config.discovery_required!==false,baseline_height:f?.baseline_height??null,height:f?.block_height??null,scanned_height:f?.height??null,observed_height:f?.observed_height??null,lag_blocks:lag,state:f?.state??'STARTING',fresh:Boolean(fresh),retry_at_ms:f?.retry_at_ms??null};
                if(this.config.discovery_required!==false&&(!fresh||f.state!=='SCANNING'||lag>this.config.max_lag_blocks)){health.risk_allowed=false;health.state='DISCOVERY_UNAVAILABLE_OR_LAGGING';}
            }
            const common={network:this.config.network,chain_id:this.config.chain_id,binding:binding(this.config),checkpoint:m.cursor_hash,health};
            if(resource==='health')return common;
            const queries={
                balances:'SELECT contract,owner,bucket,ledger_id,asset,amount::text FROM balances ORDER BY contract,owner,bucket,ledger_id,asset LIMIT $1 OFFSET $2',
                events:'SELECT e.*,o.tx_hash,o.block_hash FROM events e JOIN outcomes o ON o.id=e.receipt_id WHERE e.sequence IS NOT NULL ORDER BY e.contract,e.sequence LIMIT $1 OFFSET $2',
                transactions:'SELECT hash,signer,receiver,inclusion_hash FROM transactions ORDER BY inclusion_hash,hash LIMIT $1 OFFSET $2',
                receipts:'SELECT o.* FROM outcomes o JOIN blocks b ON b.hash=o.block_hash ORDER BY b.height,o.id LIMIT $1 OFFSET $2',
                snapshots:'SELECT * FROM snapshots ORDER BY contract LIMIT $1 OFFSET $2',
                alerts:'SELECT * FROM alerts ORDER BY severity,code,contract,entity LIMIT $1 OFFSET $2'
            };
            if(!Object.hasOwn(queries,resource))fail('UNKNOWN_RESOURCE');
            const {rows}=await db.query(queries[resource],[limit,offset]);return {...common,items:rows,limit,offset};
        },{readOnly:true});
    }
    async close(){await this.pool.end();}
}
