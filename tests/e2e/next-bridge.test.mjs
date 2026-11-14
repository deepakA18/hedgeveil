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
test('hosted HTTPS bridge replaces forged headers and forwards only protected session cookies',async t=>{
 const names=['HEDGEVEIL_HOSTED_MODE','HEDGEVEIL_FRONTEND_ORIGIN','HEDGEVEIL_BACKEND_ORIGIN','HEDGEVEIL_BRIDGE_SECRET'];
 const previous=Object.fromEntries(names.map(n=>[n,process.env[n]]));t.after(()=>{for(const n of names)if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n];});
 Object.assign(process.env,{HEDGEVEIL_HOSTED_MODE:'1',HEDGEVEIL_FRONTEND_ORIGIN:'https://hedgeveil.example',HEDGEVEIL_BACKEND_ORIGIN:'https://backend.example',HEDGEVEIL_BRIDGE_SECRET:'f'.repeat(64)});
 const request=new Request('https://hedgeveil.example/api/desk/auth/verify',{method:'POST',headers:{host:'hedgeveil.example',origin:'https://hedgeveil.example','content-type':'application/json',authorization:'attacker','x-forwarded-host':'evil.example',cookie:`other=private; __Host-hv-challenge=${'a'.repeat(64)}; __Host-hv-session=${'b'.repeat(64)}`},body:'{}'});
 let calls=0;
 const r=await bridge(request,'auth/verify',async(url,init)=>{
  calls++;assert.equal(url,'https://backend.example/api/auth/verify');assert.equal(init.headers.authorization,'Bearer '+'f'.repeat(64));assert.equal(init.headers.origin,'https://hedgeveil.example');assert.equal(init.headers['x-forwarded-proto'],'https');assert.equal(init.headers['x-forwarded-host'],undefined);assert(!init.headers.cookie.includes('other'));
  const headers=new Headers();headers.append('set-cookie',`__Host-hv-session=${'c'.repeat(64)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=900`);headers.append('set-cookie','unrelated=hidden');return Response.json({account:'alice.testnet'},{headers});
 });
 assert.equal(calls,1);assert.equal(r.status,200);assert.equal(r.headers.getSetCookie().length,1);assert(r.headers.getSetCookie()[0].includes('HttpOnly; Secure; SameSite=Strict'));
 const evil=new Request('https://hedgeveil.example/api/desk/state',{headers:{host:'preview.vercel.app','x-forwarded-host':'hedgeveil.example'}});
 assert.equal((await bridge(evil,'state',blocked)).status,403);
 process.env.HEDGEVEIL_BACKEND_ORIGIN='http://backend.example';await assert.rejects(bridge(evil,'state',blocked),/HTTPS_ORIGIN_REQUIRED/);
});
