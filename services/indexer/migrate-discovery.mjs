import {canonical,fail} from '../../packages/sdk/intent.mjs';
import {completeOutcomes,replayCore,replayExternal,reconcileCore,reconcileExternal} from './model.mjs';

// Explicit local operator migration. Preserve the source, verify its actual
// checkpoint again, and keep destination risk disabled until fresh RPC sync.
export async function migrateDiscovery(store,sourceSchema){
    if(!/^hv_[a-z0-9_]{1,40}$/.test(sourceSchema)||sourceSchema===store.config.schema||store.config.transaction_filter!=='canonical-journal')fail('MIGRATION_PROFILE');
    return store.transaction(async db=>{
        const {rows:[destination]}=await db.query('SELECT * FROM meta WHERE id=1 FOR UPDATE');
        if(destination.generation!=='0')fail('MIGRATION_DESTINATION_NOT_EMPTY');
        const {rows:[source]}=await db.query(`SELECT * FROM "${sourceSchema}".meta WHERE id=1`);
        const left=structuredClone(source?.binding),right=structuredClone(destination.binding);
        if(!left)fail('MIGRATION_SOURCE');delete left.transaction_filter;delete right.transaction_filter;
        if(canonical(left)!==canonical(right))fail('MIGRATION_BINDING');
        const {rows:blocks}=await db.query(`SELECT hash,height FROM "${sourceSchema}".blocks`),blockMap=new Map(blocks.map(b=>[b.hash,BigInt(b.height)]));
        const {rows:transactions}=await db.query(`SELECT body FROM "${sourceSchema}".transactions`);
        for(const {body} of transactions)for(const o of completeOutcomes(body,body.transaction)){
            if(!blockMap.has(o.block_hash)||blockMap.get(o.block_hash)>BigInt(source.cursor_height))fail('MIGRATION_INCOMPLETE_HISTORY');
        }
        const {rows:events}=await db.query(`SELECT * FROM "${sourceSchema}".events`);
        if(events.some(e=>e.sequence===null))fail('MIGRATION_INCOMPLETE_HISTORY');
        const {rows:snapshots}=await db.query(`SELECT * FROM "${sourceSchema}".snapshots`);
        if(snapshots.length!==store.config.contracts.length)fail('MIGRATION_SNAPSHOT');
        for(const s of snapshots){
            const pin=store.config.contracts.find(c=>c.account_id===s.contract&&c.kind===s.kind);
            if(!pin||s.block_hash!==source.cursor_hash||s.body.native.code_hash!==pin.code_hash)fail('MIGRATION_SNAPSHOT');
            const es=events.filter(e=>e.contract===s.contract);
            if(s.kind==='core')reconcileCore(replayCore(s.contract,es,store.config.network),s.body);
            else if(s.kind==='external_oracle')reconcileExternal(replayExternal(es),s.body);
            else fail('MIGRATION_PROFILE');
        }
        for(const table of ['blocks','transactions','outcomes','receipt_links','events','balances','snapshots','alerts','rpc_cache']){
            const count=(await db.query(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n;
            if(count!=='0')fail('MIGRATION_DESTINATION_NOT_EMPTY');
            await db.query(`INSERT INTO ${table} SELECT * FROM "${sourceSchema}".${table}`);
        }
        await db.query('UPDATE meta SET cursor_hash=$1,cursor_height=$2,generation=$3,checked_at=NULL,health=$4 WHERE id=1',
            [source.cursor_hash,source.cursor_height,source.generation,{state:'MIGRATED_AWAITING_RECONCILIATION',risk_allowed:false}]);
        return {source_schema:sourceSchema,destination_schema:store.config.schema,checkpoint:source.cursor_hash,transactions:transactions.length,events:events.length,risk_allowed:false};
    });
}
