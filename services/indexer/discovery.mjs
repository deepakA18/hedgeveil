import {readdir} from 'node:fs/promises';
import {FileJournal} from '../../packages/sdk/journal.mjs';
import {account,fail} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';
import {completeOutcomes,extractEvents} from './model.mjs';

// Journals are discovery hints only. No retained result or receipt is trusted.
export function journalCandidates(directories){
    return async()=>{
        const found=new Map();
        for(const directory of directories){
            let names;try{names=await readdir(directory);}catch(e){if(e.code==='ENOENT')continue;throw e;}
            const journal=new FileJournal(directory);
            for(const id of names.filter(n=>/^[a-f0-9]{64}$/.test(n))){
                const r=await journal.get(id),hash=r.hash??r.candidate_hash;
                if(!hash)continue;
                hash32(hash);account(r.intent.signer_id);
                if(found.has(hash)&&found.get(hash).signer_id!==r.intent.signer_id)fail('DISCOVERY_CONFLICT');
                found.set(hash,{hash,signer_id:r.intent.signer_id});
            }
        }
        if(found.size>10000)fail('DISCOVERY_LIMIT');
        return [...found.values()];
    };
}

export async function collectJournalTransactions({candidates,known,rpc,blocks,head,anchor,storedBlock,contracts,network,canonical=false,unresolved=[],progress=()=>{}}){
    const path=new Map(blocks.map(b=>[b.header.hash,b]));
    path.set(anchor.header.hash,anchor);
    const transactions=[];let completed=0;
    const anchored=async hash=>path.get(hash)??await storedBlock(hash);
    for(const hint of candidates){
        hash32(hint.hash);account(hint.signer_id);
        if(known.has(hint.hash)){progress(++completed);continue;}
        let raw;try{raw=await rpc.request('tx',{tx_hash:hint.hash,sender_account_id:hint.signer_id,wait_until:'NONE'});}catch(e){
            // Absence is not failure or success. Keep the hint pending; exact
            // same-block event/state reconciliation still gates every commit.
            if(e.code!=='RPC_TRANSACTION_UNKNOWN')throw e;
            unresolved.push({...hint,state:'SUBMISSION_UNKNOWN'});progress(++completed);continue;
        }
        if(raw.transaction?.hash!==hint.hash||raw.transaction.signer_id!==hint.signer_id)fail('TRANSACTION_MISMATCH');
        const outcomes=completeOutcomes(raw,raw.transaction);
        const events=outcomes.flatMap(r=>extractEvents(r,contracts,network));
        const hashes=[...new Set(outcomes.map(r=>r.block_hash))],bound=new Map();let future=false,preAnchor=false;
        for(const hash of hashes){
            let b=await anchored(hash);
            if(!b){
                b=await rpc.request('block',{block_id:hash});
                if(b.header.hash!==hash)fail('ANCESTRY_MISMATCH');
                if(b.header.height>head.header.height){future=true;continue;}
                if(b.header.height<=anchor.header.height&&!events.length){preAnchor=true;continue;}
                if(!canonical||b.header.height<=anchor.header.height)fail('RECEIPT_OUTSIDE_ANCESTRY');
                const atHeight=await rpc.request('block',{block_id:b.header.height},{canonical:true});
                if(atHeight.header.hash!==hash||atHeight.header.height!==b.header.height)fail('CANONICAL_BLOCK_MISMATCH');
                path.set(hash,b);blocks.push(b);
            }
            bound.set(hash,b);
        }
        if(future||preAnchor){progress(++completed);continue;}
        const inclusion_hash=raw.transaction_outcome.block_hash,b=bound.get(inclusion_hash);
        if(!b)fail('TRANSACTION_INCLUSION');
        let included=false;
        for(const ch of b.chunks.filter(c=>c.height_included===b.header.height)){
            const chunk=await rpc.request('chunk',{chunk_id:ch.chunk_hash});
            if(chunk.header.chunk_hash!==ch.chunk_hash||chunk.header.height_created>b.header.height||(ch.tx_root&&chunk.header.tx_root!==ch.tx_root))fail('CHUNK_MISMATCH');
            const tx=chunk.transactions.find(t=>t.hash===hint.hash);
            if(tx){completeOutcomes(raw,tx);included=true;break;}
        }
        if(!included)fail('TRANSACTION_INCLUSION');
        transactions.push({inclusion_hash,raw,outcomes,events});progress(++completed);
    }
    return transactions;
}
