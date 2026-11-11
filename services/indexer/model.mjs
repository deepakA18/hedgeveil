import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import {canonical, uint, fail} from '../../packages/sdk/intent.mjs';

const ajv = new Ajv({strict:false, allErrors:true});
const ledgerSchema = ajv.compile(JSON.parse(readFileSync(new URL('../../packages/shared-schemas/public-ledger.schema.json', import.meta.url))));
const oracleSchema = ajv.compile(JSON.parse(readFileSync(new URL('../../packages/shared-schemas/oracle.schema.json', import.meta.url))));
const externalSchema = ajv.compile(JSON.parse(readFileSync(new URL('../../packages/shared-schemas/external-oracle.schema.json', import.meta.url))));
export const sha = value => createHash('sha256').update(value).digest('hex');
export const digest = value => sha(canonical(value));
export const success = status => status && Object.keys(status).length === 1 &&
    (Object.hasOwn(status,'SuccessValue') || Object.hasOwn(status,'SuccessReceiptId'));
export const assetId = a => a.kind === 'COLLATERAL' ? 'COLLATERAL' : a.kind === 'VAULT_SHARE' ? `VAULT_SHARE:${a.vault_id}` : `${a.kind}:${a.series_id}`;
export const balanceKey = (owner,bucket,id,asset) => JSON.stringify([owner,bucket,id,asset]);
export function operationId(contract, sequence, network='sandbox') {
    const string = s => {const b=Buffer.from(s), n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};
    const seq=Buffer.alloc(8);seq.writeBigUInt64LE(BigInt(sequence));
    return sha(Buffer.concat([string(network),string(contract),seq]));
}
export function completeOutcomes(raw, transaction) {
    if (raw?.final_execution_status !== 'FINAL') fail('TRANSACTION_NOT_FINAL');
    if (raw.transaction?.hash !== transaction.hash || raw.transaction.signer_id !== transaction.signer_id ||
        raw.transaction.receiver_id !== transaction.receiver_id || raw.transaction_outcome?.id !== transaction.hash) fail('TRANSACTION_MISMATCH');
    const rows=[raw.transaction_outcome,...raw.receipts_outcome], byId=new Map(rows.map(r=>[r.id,r]));
    if (rows.length !== byId.size || rows[0].outcome.executor_id !== transaction.signer_id) fail('RECEIPT_TREE');
    const seen=new Set([transaction.hash]), pending=[rows[0]];
    for(let i=0;i<pending.length;i++) {
        const row=pending[i], o=row.outcome;
        if (!row.block_hash || !o || !Array.isArray(o.receipt_ids) || (!success(o.status) && !(Object.keys(o.status).length===1 && o.status.Failure))) fail('RECEIPT_TREE');
        if(o.status.SuccessReceiptId && !o.receipt_ids.includes(o.status.SuccessReceiptId)) fail('RECEIPT_TREE');
        for(const id of o.receipt_ids) {
            if(seen.has(id)||!byId.has(id))fail('RECEIPT_TREE');
            seen.add(id);pending.push(byId.get(id));
        }
    }
    if(seen.size!==rows.length)fail('RECEIPT_TREE');
    return rows;
}
export function extractEvents(row, watched, network='sandbox') {
    if(!success(row.outcome.status))return [];
    const contract=watched.find(c=>c.account_id===row.outcome.executor_id);
    if(!contract)return [];
    const out=[];
    for(const [log_index,log] of row.outcome.logs.entries()) {
        if(!log.startsWith('EVENT_JSON:'))continue;
        let envelope;try{envelope=JSON.parse(log.slice(11));}catch{fail('EVENT_JSON_INVALID');}
        const standard=contract.kind==='core'?'hedgeveil':contract.kind==='external_oracle'?'hedgeveil_external_oracle':'hedgeveil_oracle';
        if(envelope.standard!==standard)continue;
        if(contract.kind==='external_oracle'){
            if(!externalSchema(envelope))fail('EXTERNAL_ORACLE_EVENT_SCHEMA');
            const event=envelope.data[0];
            if(event.network!==network||event.contract_id!==contract.account_id)fail('EXTERNAL_ORACLE_DOMAIN');
            uint(event.sequence,64,true);
            out.push({receipt_id:row.id,log_index,item_index:0,contract:contract.account_id,kind:'external_oracle',name:envelope.event,payload:event});
            continue;
        }
        if(contract.kind==='core') {
            if(envelope.version!=='0.2.0'||envelope.event!=='ledger'||!Array.isArray(envelope.data)||!envelope.data.length)fail('EVENT_SCHEMA');
            for(const [item_index,event] of envelope.data.entries()) {
                if(!ledgerSchema(event)||event.kind!=='event'||event.domain.network!==network||event.domain.contract_id!==contract.account_id)fail('EVENT_SCHEMA');
                for(const delta of event.deltas)uint(delta.amount,128,true);
                uint(event.fee_amount);
                out.push({receipt_id:row.id,log_index,item_index,contract:contract.account_id,kind:'core',name:event.event,payload:event});
            }
        } else {
            if(!oracleSchema(envelope))fail('ORACLE_EVENT_SCHEMA');
            for(const [item_index,event] of envelope.data.entries()) {
                uint(event.sequence,64,true);
                for(const k of ['received','paid','locked','credits','in_flight'])uint(event[k]);
                out.push({receipt_id:row.id,log_index,item_index,contract:contract.account_id,kind:'oracle',name:envelope.event,payload:event});
            }
        }
    }
    return out;
}
export function replayCore(contract, events, network='sandbox') {
    const byId=new Map(events.map(e=>[e.payload.operation_id,e]));
    if(byId.size!==events.length)fail('OPERATION_DUPLICATE');
    const balances=new Map();
    for(let i=1;i<=events.length;i++) {
        const e=byId.get(operationId(contract,String(i),network));
        if(!e)fail('EVENT_SEQUENCE_GAP');
        if(e.payload.domain.network!==network||e.payload.domain.contract_id!==contract)fail('EVENT_SCHEMA');
        e.sequence=String(i);
        for(const d of e.payload.deltas) {
            const key=balanceKey(d.account_id,d.bucket,d.ledger_id,assetId(d.asset));
            const next=(balances.get(key)||0n)+(d.direction==='CREDIT'?1n:-1n)*uint(d.amount);
            if(next<0n||next>=(1n<<128n))fail('LEDGER_BOUNDS');
            if(next===0n)balances.delete(key);else balances.set(key,next);
        }
    }
    return {balances,sequence:String(events.length)};
}
export function replayOracle(events) {
    const sorted=[...events].sort((a,b)=>BigInt(a.payload.sequence)<BigInt(b.payload.sequence)?-1:1);
    for(const [i,e] of sorted.entries()) {
        if(e.payload.sequence!==String(i+1))fail('EVENT_SEQUENCE_GAP');
        e.sequence=e.payload.sequence;
        const x=e.payload;
        if(BigInt(x.received)!==BigInt(x.paid)+BigInt(x.locked)+BigInt(x.credits)+BigInt(x.in_flight))fail('ORACLE_CONSERVATION');
    }
    return {sequence:String(events.length),aggregate:sorted.at(-1)?.payload??null};
}
export function replayExternal(events){
    const sorted=[...events].sort((a,b)=>BigInt(a.payload.sequence)<BigInt(b.payload.sequence)?-1:1);
    for(const [i,e]of sorted.entries()){if(e.payload.sequence!==String(i+1))fail('EVENT_SEQUENCE_GAP');e.sequence=e.payload.sequence;}
    return {sequence:String(sorted.length),aggregate:sorted.at(-1)?.payload??null};
}
export function reconcileExternal(replay,snapshot){
    const state=snapshot.state,a=replay.aggregate;
    if(!externalSchema(state))fail('EXTERNAL_ORACLE_STATE_SCHEMA');
    if(!a||replay.sequence!==snapshot.identity.sequence||replay.sequence!==state.sequence)fail('EVENT_SEQUENCE_GAP');
    if(state.contract_id!==snapshot.contract||state.network!==snapshot.identity.network||state.version!=='native-sampled-v1'||a.contract_id!==snapshot.contract||a.network!==state.network)fail('EXTERNAL_ORACLE_DOMAIN');
    if(a.state_hash!==digest(state))fail('EXTERNAL_ORACLE_STATE_MISMATCH');
    if(Object.keys(state.cases).length>16||Object.entries(state.cases).some(([id,c])=>id!==c.config.series_id||!externalSchema(c)))fail('EXTERNAL_ORACLE_CASE');
    if(BigInt(snapshot.native.amount)<10n**24n)fail('EXTERNAL_ORACLE_OPERATING_RESERVE');
    return {contract:snapshot.contract,kind:'external_oracle',sequence:replay.sequence,matched:true,state_hash:a.state_hash};
}
export function coreBalances(snapshot) {
    const out=new Map(),core=snapshot.contract;
    const put=(owner,bucket,id,asset,amount)=>{if(BigInt(amount)>0n)out.set(balanceKey(owner,bucket,id,asset),BigInt(amount));};
    for(const [id,a] of Object.entries(snapshot.accounts)) {
        put(id,'FREE','account','COLLATERAL',a.free);put(id,'STORAGE','account','COLLATERAL',a.storage_paid);
        for(const s of snapshot.series)for(const leg of ['P','N'])put(id,'FREE',s.config.series_id,`${leg}:${s.config.series_id}`,a.positions[s.slot][leg.toLowerCase()]);
    }
    for(const s of snapshot.series) {
        put(core,'SERIES_RESERVE',s.config.series_id,'COLLATERAL',s.reserve);
        put(core,'SUPPLY',s.config.series_id,`P:${s.config.series_id}`,s.outstanding_p);
        put(core,'SUPPLY',s.config.series_id,`N:${s.config.series_id}`,s.outstanding_n);
    }
    const v=snapshot.vault;
    if(v) {
        for(const l of v.holdings)put(core,'VAULT',v.vault_id,assetId(l.asset),l.amount);
        for(const [id,n] of Object.entries(v.holders))put(id,'FREE',v.vault_id,`VAULT_SHARE:${v.vault_id}`,n);
        put(core,'SUPPLY',v.vault_id,`VAULT_SHARE:${v.vault_id}`,v.supply);
    }
    const c=snapshot.custody;
    for(const [id,key] of [['series','series_storage_fund'],['market','market_storage_fund'],['vault','vault_storage_fund'],['roll','roll_storage_fund']])put(core,'STORAGE',id,'COLLATERAL',c[key]);
    put(core,'FEE','protocol','COLLATERAL',c.fees);put(core,'OPERATING','bootstrap','COLLATERAL',c.operating_allocation);
    for(const t of snapshot.tickets)if(['PENDING','UNKNOWN'].includes(t.state))put(t.owner,'WITHDRAWAL',`w-${t.id}`,'COLLATERAL',t.amount);
    return out;
}
const sorted = map => [...map].map(([k,n])=>[k,String(n)]).sort(([a],[b])=>a.localeCompare(b));
export function reconcileCore(replay, snapshot) {
    if(replay.sequence!==snapshot.custody.operation_sequence)fail('EVENT_SEQUENCE_GAP');
    if(canonical(sorted(replay.balances))!==canonical(sorted(coreBalances(snapshot))))fail('CUSTODY_MISMATCH');
    const c=snapshot.custody, flight=snapshot.tickets.filter(t=>t.kind==='COLLATERAL'&&['PENDING','UNKNOWN'].includes(t.state)).reduce((n,t)=>n+BigInt(t.amount),0n);
    if(BigInt(c.tracked_user_collateral)!==BigInt(c.free_collateral)+BigInt(c.vault_collateral)+BigInt(c.series_reserves)+flight||!c.retained_categories_covered||BigInt(snapshot.native.amount)!==BigInt(c.native_balance))fail('CUSTODY_MISMATCH');
    return {contract:snapshot.contract,kind:'core',sequence:replay.sequence,balance_count:replay.balances.size,matched:true};
}
export function reconcileOracle(replay, snapshot) {
    if(replay.sequence!==snapshot.identity.sequence||!replay.aggregate)fail('EVENT_SEQUENCE_GAP');
    const a=replay.aggregate,c=snapshot.custody;
    for(const k of ['received','paid','locked','credits'])if(a[k]!==c[k])fail('ORACLE_CUSTODY_MISMATCH');
    const credits=Object.values(snapshot.accounts).reduce((n,x)=>n+BigInt(x.credit),0n);
    const locked=snapshot.cases.reduce((n,x)=>n+(x.bonds_released?0n:BigInt(x.proposal?.claim.bond||0)+BigInt(x.challenge?.bond||0)),0n);
    const flight=snapshot.tickets.filter(t=>['PENDING','UNKNOWN'].includes(t.state)).reduce((n,t)=>n+BigInt(t.amount),0n);
    if(credits!==BigInt(c.credits)||locked!==BigInt(c.locked)||flight!==BigInt(a.in_flight)||flight!==BigInt(c.pending)+BigInt(c.unknown)||!c.retained_covered||BigInt(snapshot.native.amount)!==BigInt(c.native_balance))fail('ORACLE_CUSTODY_MISMATCH');
    return {contract:snapshot.contract,kind:'oracle',sequence:replay.sequence,matched:true};
}
export function alerts(snapshots, nowNs) {
    const out=[],add=(code,contract,entity,severity='warning')=>out.push({code,contract,entity,severity});
    for(const s of snapshots) {
        for(const t of s.tickets) {
            if(t.state==='UNKNOWN')add('UNKNOWN_WITHDRAWAL',s.contract,t.id);
            if(t.state==='PENDING'&&BigInt(nowNs)>BigInt(t.created_ns)+5_000_000_000n)add('OVERDUE_WITHDRAWAL',s.contract,t.id);
            if(t.state==='FAILED_CONFIRMED')add('FAILED_WITHDRAWAL',s.contract,t.id,'info');
        }
        if(s.kind==='core') {
            for(const x of s.series)if(!x.closed&&!x.final_price&&BigInt(nowNs)>=BigInt(x.config.maturity_ns))add('UNRESOLVED_SETTLEMENT',s.contract,x.config.series_id);
            const roll=s.roll;
            if(roll?.deferred_reason)add('ROLL_DEFERRED',s.contract,'vault');
            if(roll?.reference && BigInt(nowNs)>BigInt(roll.reference.observed_ns)+BigInt(roll.policy.max_reference_age_ns))add('STALE_KEEPER_REFERENCE',s.contract,'vault');
            if(s.vault&&!s.vault.closed)add('EXECUTABLE_QUOTES_UNOBSERVED',s.contract,'vault');
            if(roll&&!roll.executed&&BigInt(nowNs)>BigInt(roll.policy.deadline_ns))add('KEEPER_DEADLINE_MISSED',s.contract,'vault');
        } else {
            for(const x of s.cases) {
                const id=x.config.series_id;
                if(['DISPUTED','DELAYED','RESOLUTION_DELAYED'].includes(x.state))add(`ORACLE_${x.state}`,s.contract,id);
                if(x.state!=='FINALIZED'&&BigInt(nowNs)>=BigInt(x.config.maturity_ns))add('ORACLE_NOT_FINAL',s.contract,id);
                if(x.state!=='FINALIZED'&&BigInt(nowNs)>=BigInt(x.config.maturity_ns)&&s.observations?.[id]?.PRIMARY===null)add('ORACLE_OBSERVATIONS_INCOMPLETE',s.contract,id);
                if(s.kind==='external_oracle'&&x.price===null&&x.samples.some(sample=>sample===null)&&BigInt(nowNs)>=BigInt(x.config.maturity_ns))add('ORACLE_OBSERVATIONS_INCOMPLETE',s.contract,id);
                if(x.proposal&&!x.bonds_released&&BigInt(nowNs)<BigInt(x.proposal.challenge_end)&&BigInt(nowNs)+60_000_000_000n>=BigInt(x.proposal.challenge_end))add('ORACLE_DEADLINE_APPROACHING',s.contract,id);
                if(x.proposal&&!x.bonds_released&&BigInt(nowNs)>=BigInt(x.proposal.challenge_end))add('ORACLE_DEADLINE',s.contract,id);
            }
        }
    }
    return out;
}
