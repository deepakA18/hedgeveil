import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStatus,preflight,statusOrigin} from '../../scripts/deployment-preflight.mjs';

const now=Date.parse('2026-11-14T00:00:00Z');
const ids=['frontend','prices','api','indexer','rpc','contracts','maker-1','maker-2','settlement','renewal','discovery'];
const snapshot=()=>({checked_at:new Date(now).toISOString(),services:ids.map(id=>({id,state:'operational',observed_at:new Date(now).toISOString()}))});
test('missing, stale, future and duplicate observations never pass',()=>{
  assert(assessStatus(null,now).every(s=>s.state==='unknown'));
  for(const offset of [-60000,1]){
    const s=snapshot();s.checked_at=new Date(now+offset).toISOString();
    assert(assessStatus(s,now).every(s=>s.state==='unknown'));
  }
  const s=snapshot();s.services.push(s.services[0]);s.services[1].observed_at=null;
  assert.equal(assessStatus(s,now)[0].state,'unknown');
  assert.equal(assessStatus(s,now)[1].state,'unknown');
});
test('healthy runtime cannot waive release gates or echo server secrets',async()=>{
  const s=snapshot();s.services[0].detail='SECRET_MARKER';s.secret='SECRET_MARKER';
  const r=await preflight({now,origin:'http://127.0.0.1:3000',transport:async()=>Response.json(s)});
  assert(r.services.every(s=>s.state==='operational'));
  assert.equal(r.public_ready,false);assert.equal(r.production_enabled,false);
  assert(r.blockers.some(g=>g.id==='PUBLIC_ACCESS_BOUNDARY'));
  assert(!JSON.stringify(r).includes('SECRET_MARKER'));
});
test('prices expire independently and additive audit cannot stand in for settlement',()=>{
  const s=snapshot();s.services.find(s=>s.id==='prices').observed_at=new Date(now-30000).toISOString();
  s.services.find(s=>s.id==='settlement').state='degraded';
  const rows=assessStatus(s,now);
  assert.equal(rows.find(s=>s.id==='prices').state,'unknown');
  assert.equal(rows.find(s=>s.id==='settlement').state,'degraded');
  assert.equal(rows.find(s=>s.id==='discovery').required,false);
});
test('failed and oversized reads stay unknown without exposing errors',async()=>{
  for(const transport of [async()=>{throw Error('SECRET_MARKER');},async()=>new Response('x'.repeat(131073))]){
    const r=await preflight({now,origin:'http://127.0.0.1:3000',transport});
    assert.equal(r.runtime_ready,false);assert(r.services.every(s=>s.state==='unknown'));
    assert(!JSON.stringify(r).includes('SECRET_MARKER'));
  }
});
test('only credential-free loopback origins can be probed',()=>{
  assert.equal(statusOrigin('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
  for(const url of ['https://example.com','http://user:pass@127.0.0.1:3000','http://127.0.0.1:3000/?key=secret','http://127.0.0.1:3000/path'])assert.throws(()=>statusOrigin(url));
});
