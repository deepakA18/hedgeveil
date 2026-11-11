import test from 'node:test';import assert from 'node:assert/strict';
import {collectAncestry} from '../../services/indexer/ancestry.mjs';
const fixture=heights=>heights.map((height,i)=>({header:{height,hash:'hash-'+height,prev_hash:i?'hash-'+heights[i-1]:'genesis'},chunks:[]}));
test('bounded prefetch returns the complete parent-linked path across skipped heights',async()=>{
 const chain=fixture([1,2,4,5,8,9,10]),calls=[];let active=0,peak=0;
 const block=async id=>{calls.push(id);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;const b=chain.find(b=>typeof id==='number'?b.header.height===id:b.header.hash===id);if(!b)throw Error('SKIPPED_HEIGHT');return b;};
 const result=await collectAncestry({head:chain.at(-1),cursor_hash:chain[0].header.hash,cursor_height:'1',max_blocks:10,block});
 assert.deepEqual(result,chain.slice(1));assert(peak<=4&&peak>1);assert(calls.includes(3));
});
test('failed height hints fall back to exact parent hashes without omitting blocks',async()=>{
 const chain=fixture([1,2,3,4]),block=async id=>{if(typeof id==='number')throw Error('UNAVAILABLE');return chain.find(b=>b.header.hash===id);};
 assert.deepEqual(await collectAncestry({head:chain[3],cursor_hash:'hash-1',cursor_height:'1',max_blocks:3,block}),chain.slice(1));
 await assert.rejects(collectAncestry({head:chain[3],cursor_hash:'hash-1',cursor_height:'1',max_blocks:2,block}),/BACKFILL_LIMIT/);
});
test('wrong ancestry, wrong heights and unavailable parent reads fail closed',async()=>{
 const chain=fixture([1,2,3,4]),base={head:chain[3],cursor_hash:'hash-1',cursor_height:'1',max_blocks:5};
 await assert.rejects(collectAncestry({...base,block:async()=>chain[0]}),/ANCESTRY_MISMATCH/);
 await assert.rejects(collectAncestry({...base,block:async()=>{throw Error('UNAVAILABLE');}}),/UNAVAILABLE/);
 await assert.rejects(collectAncestry({...base,cursor_hash:'wrong-cursor',block:async id=>chain.find(b=>typeof id==='number'?b.header.height===id:b.header.hash===id)}),/ANCESTRY_MISMATCH/);
 assert.deepEqual(await collectAncestry({...base,head:chain[0],block:async()=>assert.fail()}),[]);
});

test('a temporarily absent height hint is retried and still must match the parent hash',async()=>{
 const chain=fixture([1,2,3]);let attempts=0;
 const result=await collectAncestry({head:chain[2],cursor_hash:'hash-1',cursor_height:'1',max_blocks:5,block:async id=>{if(id===2){if(++attempts===1)throw Error('temporary');return chain[1];}throw Error('hash RPC unavailable');}});
 assert.deepEqual(result,chain.slice(1));assert.equal(attempts,2);
});
