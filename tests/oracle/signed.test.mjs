import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {base58} from '../../packages/sdk/rpc.mjs';
import {DOCUMENTED_FEED_KEY,strictJson,verifySigned,requireCurrent} from '../../services/outlayer/signed.mjs';
import {archiveSigned,replayArchive,currentFromArchive} from '../../services/outlayer/archive.mjs';
import {serve} from '../../services/testnet/runtime.mjs';

const example=JSON.parse(await readFile(new URL('./fixtures/outlayer-published-example.json',import.meta.url),'utf8'));
const keys=generateKeyPairSync('ed25519');
const pin='ed25519:'+base58(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
const options={pinned_key:pin};
const entry={price:'250000000',expo:-8,publish_time:1794220000};
const signed=(payload=JSON.stringify({'wrap.near':entry}))=>({success:true,error:null,sig_format:'json',public_key:pin,payload,signature:sign(null,Buffer.from(payload),keys.privateKey).toString('base64')});
async function temporary(run){const dir=await mkdtemp(join(tmpdir(),'hv-signed-'));try{await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}

test('published documentation example fails verification and cannot masquerade as real evidence',()=>{
    assert.throws(()=>verifySigned(example,{pinned_key:DOCUMENTED_FEED_KEY}),/SIGNED_INVALID_SIGNATURE/);
});
test('signature covers exact bytes; tampering, whitespace changes, wrong key and encoding fail',()=>{
    const e=signed();
    for(const payload of [e.payload+' ',e.payload.replace('250000000','350000000')])assert.throws(()=>verifySigned({...e,payload},options),/INVALID_SIGNATURE/);
    assert.throws(()=>verifySigned(e,{pinned_key:DOCUMENTED_FEED_KEY}),/KEY_MISMATCH/);
    assert.throws(()=>verifySigned({...e,signature:e.signature.slice(1)},options),/SIGNATURE_ENCODING/);
    assert.throws(()=>verifySigned({...e,sig_format:'borsh'},options),/ENVELOPE/);
    assert.throws(()=>verifySigned({...e,success:false},options),/ENVELOPE/);
});
test('unsigned source metadata is excluded from verified artifacts and policy remains unauthenticated',()=>{
    const e=signed(),a=verifySigned(e,options),b=verifySigned({...e,sources:{'wrap.near':[{source:'invented',price:'1'}]},min_sources_num:999},options);
    assert.deepEqual(a,b);assert.equal(a.source_policy_authenticated,false);assert.equal(a.settlement_eligible,false);
});
test('duplicate and escaped duplicate JSON fields are rejected even under a valid signature',()=>{
    for(const payload of ['{"wrap.near":{},"wrap.near":{}}','{"wrap.near":{},"wrap\\u002enear":{}}',
        '{"wrap.near":{"price":"1","price":"2","expo":-8,"publish_time":1794220000}}'])
        assert.throws(()=>verifySigned(signed(payload),options),/DUPLICATE_KEY/);
});
test('strict JSON rejects unsafe integers, fractions, negative zero, trailing data and bad encoding',()=>{
    for(const raw of ['9007199254740993','1.5','1e3','-0','01','{} x','{"x":1,}','"\\ud800"','[1,]'])assert.throws(()=>strictJson(raw));
    assert.equal(strictJson('{"x":"a\\\"b","a":[null,true,false]}').x,'a"b');
    assert.throws(()=>strictJson('['.repeat(10)+'0'+']'.repeat(10)),/DEPTH/);
    assert.throws(()=>strictJson(' '.repeat(17000)),/SIZE/);
});
test('asset, shape, price sign/range, exponent and publish timestamp validation fails closed',()=>{
    assert.throws(()=>verifySigned(signed('{"eth.bridge.near":{}}'),options),/ASSET/);
    for(const p of [{...entry,price:'0'},{...entry,price:'-1'},{...entry,price:250000000},{...entry,price:'9223372036854775808'},
        {...entry,expo:1},{...entry,expo:-19},{...entry,publish_time:0},{...entry,publish_time:'1794220000'},{...entry,extra:true}])
        assert.throws(()=>verifySigned(signed(JSON.stringify({'wrap.near':p})),options));
    assert.throws(()=>verifySigned(signed('{"wrap.near":{"price":"1","expo":-8,"publish_time":9007199254740993}}'),options),/UNSAFE_NUMBER/);
});
test('exact normalization preserves large integers and rejects rounding',()=>{
    const o=verifySigned(signed(JSON.stringify({'wrap.near':{...entry,price:'9007199254740993',expo:-12}})),options);
    assert.equal(o.price,'9007199254740993');
    assert.throws(()=>verifySigned(signed(JSON.stringify({'wrap.near':{...entry,price:'1',expo:-13}})),options),/PRECISION_LOSS/);
});
test('current freshness boundaries reject future/stale and invalid age bounds',()=>{
    const o=verifySigned(signed(),options);
    assert.equal(requireCurrent(o,{now_sec:'1794220060'}).age_sec,'60');
    assert.throws(()=>requireCurrent(o,{now_sec:'1794220061'}),/STALE/);
    assert.throws(()=>requireCurrent(o,{now_sec:'1794219999'}),/FUTURE/);
    for(const max_age_sec of ['0','3601'])assert.throws(()=>requireCurrent(o,{now_sec:'1794220000',max_age_sec}),/AGE_BOUND/);
});
test('immutable archive deduplicates concurrent writes and replays signed bytes after restart',()=>temporary(async dir=>{
    const writes=await Promise.all([archiveSigned(dir,signed(),options),archiveSigned(dir,signed(),options)]);
    assert.equal(writes.filter(x=>x.duplicate).length,1);
    const items=await replayArchive(dir,options);assert.equal(items.length,1);assert.equal(items[0].price,'2500000000000');
    assert.equal(currentFromArchive(items,{now_sec:'1794220010'}).age_sec,'10');
    const older=signed(JSON.stringify({'wrap.near':{...entry,publish_time:1794219999}}));await archiveSigned(dir,older,options);
    assert.equal(currentFromArchive(await replayArchive(dir,options),{now_sec:'1794220010'}).publish_time,'1794220000');
}));
test('same timestamp different prices are retained and current selection rejects ambiguity',()=>temporary(async dir=>{
    await archiveSigned(dir,signed(),options);
    await archiveSigned(dir,signed(JSON.stringify({'wrap.near':{...entry,price:'260000000'}})),options);
    const items=await replayArchive(dir,options);assert.equal(items.length,2);
    assert.throws(()=>currentFromArchive(items,{now_sec:'1794220010'}),/AMBIGUOUS/);
}));
test('archive tampering, wrong names and conflicting existing artifacts stop replay/overwrite',()=>temporary(async dir=>{
    const o=await archiveSigned(dir,signed(),options),file=join(dir,o.payload_hash+'.json');
    const a=JSON.parse(await readFile(file,'utf8'));a.payload=a.payload.replace('250000000','250000001');await writeFile(file,JSON.stringify(a));
    await assert.rejects(replayArchive(dir,options),/INVALID_SIGNATURE/);
    await assert.rejects(archiveSigned(dir,signed(),options),/ARCHIVE_CONFLICT/);
    await writeFile(file,JSON.stringify(o.artifact));await rename(file,join(dir,'0'.repeat(64)+'.json'));
    await assert.rejects(replayArchive(dir,options),/ARCHIVE_HASH/);
}));
test('historical archive stays stale for current use; empty archives cannot manufacture prices',()=>temporary(async dir=>{
    assert.throws(()=>currentFromArchive([],{now_sec:'1794220010'}),/NO_OBSERVATIONS/);
    await archiveSigned(dir,signed(JSON.stringify({'wrap.near':{...entry,publish_time:1785149621}})),options);
    const items=await replayArchive(dir,options);
    assert.throws(()=>currentFromArchive(items,{now_sec:'1794220000'}),/STALE/);
}));
test('held public maker runtime refuses startup before opening workspace or loading keys',async()=>{
    await assert.rejects(serve({directory:'/does-not-exist',plan:{deployment_hold:'REAL_DATA_REQUIRED'}}),/DEPLOYMENT_ON_HOLD/);
});
test('offline CLI verifies and replays historical test evidence without declaring it current',()=>temporary(async dir=>{
    const input=join(dir,'response.json'),archive=join(dir,'archive');await writeFile(input,JSON.stringify(signed()));
    const run=command=>spawnSync(process.execPath,['services/outlayer/signed-cli.mjs',command,'--input',input,'--archive',archive,'--public-key',pin],{encoding:'utf8'});
    for(const command of ['verify','ingest','replay']){
        const r=run(command);assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);
        assert.equal(out.settlement_eligible,false);assert.equal(out.observations.length,1);assert.equal(out.observations[0].current,false);
    }
    const r=run('current');assert.equal(r.status,1);assert.equal(r.stderr.trim(),'SIGNED_STALE');
}));
