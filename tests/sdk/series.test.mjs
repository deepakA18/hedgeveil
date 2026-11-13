import test from 'node:test';
import assert from 'node:assert/strict';
import {retainedSeries} from '../../packages/sdk/series.mjs';

const rows = n => Array.from({length:n}, (_,slot) => ({config:{series_id:`market${slot}`},slot}));
test('reads legacy, ten-market, second-cohort and full retained ledgers without truncation', async () => {
    for (const n of [0,8,10,16,20,32]) {
        const input=rows(n), offsets=[];
        const result=await retainedSeries(async (method,{from_index,limit}) => {
            assert.equal(method,'list_series'); offsets.push(from_index);
            return input.slice(from_index,from_index+limit);
        });
        assert.deepEqual(result,input);
        assert.equal(offsets.length,Math.floor(n/16)+1);
    }
});
test('rejects repeated pages, reused physical slots, malformed and oversized responses', async () => {
    for (const page of [null,rows(17),[{config:{series_id:'a'},slot:32}],
        [{config:{series_id:'a'},slot:0},{config:{series_id:'b'},slot:0}]])
        await assert.rejects(retainedSeries(async()=>page),/SERIES_PAGE/);
    await assert.rejects(retainedSeries(async()=>rows(16)),/SERIES_PAGE_CONFLICT/);
    await assert.rejects(retainedSeries(async(_, {from_index})=>rows(33).slice(from_index,from_index+16)),/SERIES_PAGE_INVALID/);
});
