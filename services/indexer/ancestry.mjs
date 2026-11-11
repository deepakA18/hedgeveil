import {fail} from '../../packages/sdk/intent.mjs';

// Height reads are only prefetch hints. The accepted path still follows every
// parent hash back to the retained cursor; missing/skipped heights cannot skip
// a receipt-bearing block. The caller bounds concurrent reads.
export async function collectAncestry({head,cursor_hash,cursor_height,max_blocks,block,progress=()=>{},concurrency=4}){
    if(!Number.isInteger(concurrency)||concurrency<1||concurrency>16)fail('CONFIGURATION_BOUNDS');
    const blocks=[],cache=new Map();let current=head;
    while(current.header.hash!==cursor_hash){
        if(blocks.length>=max_blocks)fail('BACKFILL_LIMIT');
        if(BigInt(current.header.height)<=BigInt(cursor_height))fail('ANCESTRY_MISMATCH');
        blocks.push(current);
        progress(blocks.length);
        const parent=current.header.prev_hash;
        if(parent===cursor_hash)break;
        if(!cache.has(parent)){
            const heights=[];
            for(let h=current.header.height-1;h>Number(cursor_height)&&heights.length<Math.min(32,max_blocks-blocks.length);h--)heights.push(h);
            let next=0;
            await Promise.all(Array.from({length:Math.min(concurrency,heights.length)},async()=>{
                while(next<heights.length){
                    const height=heights[next++];let value;
                    try{value=await block(height);}catch{continue;}
                    if(value.header.height!==height)fail('ANCESTRY_MISMATCH');
                    cache.set(value.header.hash,value);
                }
            }));
        }
        let previous=cache.get(parent);
        if(!previous){
            // Retry the immediate height hint before a hash-only RPC fallback.
            // A skipped height or a different hash is never accepted as parent.
            try{const hint=await block(current.header.height-1);if(hint.header.hash===parent)previous=hint;}catch{}
        }
        previous??=await block(parent);
        if(previous.header.hash!==parent||previous.header.height>=current.header.height)fail('ANCESTRY_MISMATCH');
        cache.delete(parent);current=previous;
    }
    return blocks.reverse();
}
