import test from 'node:test';
import assert from 'node:assert/strict';
import {bridge,localOrigin} from '../../apps/frontend/lib/desk-bridge.ts';
const origin='http://127.0.0.1:3000';
function request(path='state',{method='GET',headers={},body}={}){return new Request(origin+'/api/desk/'+path,{method,headers:{host:'127.0.0.1:3000','sec-fetch-site':'same-origin',...headers},...(body?{body}:{})});}
const blocked=()=>{throw Error('Unexpected upstream access');};
test('bridge refuses cross-origin, same-site, null-origin and DNS-rebinding requests',async()=>{
 for(const headers of [{origin:'https://foreign.invalid'},{origin:'null'},{host:'evil.invalid:3000'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'},{'sec-fetch-mode':'navigate'}]){
  assert.equal((await bridge(request('state',{headers}),'state',blocked)).status,403);
 }
});
test('bridge only exposes named APIs, never server signing or arbitrary URLs',async()=>{
 for(const path of ['submit','http://evil.invalid','../.env','evidence/keys','wallet.mjs','state/../../prepare'])assert.equal((await bridge(request(path),'state'===path?'state':path,blocked)).status,404);
 assert.throws(()=>localOrigin('https://127.0.0.1:8794'));assert.throws(()=>localOrigin('http://localhost:8794'));assert.throws(()=>localOrigin('http://127.0.0.1:8794/private'));assert.throws(()=>localOrigin('http://user:pass@127.0.0.1:8794'));
});
test('POST requires JSON and exact Origin; oversized requests never reach backend',async()=>{
 for(const headers of [{},{origin},{origin,'content-type':'text/plain'},{'content-type':'application/json'}])assert.equal((await bridge(request('quotes',{method:'POST',headers,body:'{}'}),'quotes',blocked)).status,403);
 assert.equal((await bridge(request('quotes',{method:'POST',headers:{origin,'content-type':'application/json'},body:'x'.repeat(65537)}),'quotes',blocked)).status,413);
 assert.equal((await bridge(request('quotes',{method:'POST',headers:{origin,'content-type':'application/json'},body:'broken'}),'quotes',blocked)).status,400);
});
test('bridge retains request bytes and backend errors with no retries',async()=>{
 let calls=0;const body='{"method":"deposit_collateral","attached_deposit":"100000000000000000000000"}';
 const response=await bridge(request('prepare',{method:'POST',headers:{origin,'content-type':'application/json'},body}),'prepare',async(url,init)=>{calls++;assert.equal(url,'http://127.0.0.1:8794/api/prepare');assert.equal(init.body,body);assert.equal(init.headers.origin,'http://127.0.0.1:8794');assert.equal(init.redirect,'error');return Response.json({error:'INDEXER_UNHEALTHY'},{status:400});});
 assert.equal(calls,1);assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:'INDEXER_UNHEALTHY'});assert.equal(response.headers.get('cache-control'),'no-store');
 calls=0;const failure=await bridge(request('handoff',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),'handoff',async()=>{calls++;throw Error('transport with private details');});assert.equal(calls,1);assert.deepEqual(await failure.json(),{error:'SERVICE_UNAVAILABLE'});
});
test('read queries only accept the supported account and evidence offset',async()=>{
 assert.equal((await bridge(request('state?target=http://evil.invalid'),'state',blocked)).status,400);
 await bridge(request('live?account=0xdeepak18.testnet'),'live',async(url)=>{assert.equal(url,'http://127.0.0.1:8794/api/live?account=0xdeepak18.testnet');return Response.json({});});
});
