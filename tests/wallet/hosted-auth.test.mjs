// Deterministic local security tests. No chain submissions or live credentials.
import test from 'node:test';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HostedAuth,nep413Digest,hostedSettings,gatewayAllowed,RequestBudget,SESSION_COOKIE,CHALLENGE_COOKIE} from '../../apps/web/hosted-auth.mjs';
import {base58,binding} from '../../packages/sdk/rpc.mjs';
import {buildIntent} from '../../packages/sdk/intent.mjs';
import {createApp} from '../../apps/web/server.mjs';
const h=n=>base58(Buffer.alloc(32,n));
const config={network:'testnet',chain_id:'testnet',rpc_url:'https://rpc.testnet.near.org/',contract_id:'core.testnet',genesis_hash:h(1),code_hash:h(2)};
const settings={frontend:'https://hedgeveil.example',backend:'https://api.example',secret:'a'.repeat(64)};
const keys=generateKeyPairSync('ed25519');
const pub='ed25519:'+base58(keys.publicKey.export({format:'der',type:'spki'}).subarray(-32));
const signed=(c,accountId='alice.testnet')=>({accountId,publicKey:pub,signature:sign(null,nep413Digest(c),keys.privateKey).toString('base64')});
const env={HEDGEVEIL_HOSTED_MODE:'1',HEDGEVEIL_FRONTEND_ORIGIN:settings.frontend,HEDGEVEIL_BACKEND_ORIGIN:settings.backend,HEDGEVEIL_BRIDGE_SECRET:settings.secret};
test('hosted configuration cannot accidentally enable public HTTP or sandbox signing',()=>{
 assert.equal(hostedSettings({}),null);assert.deepEqual(hostedSettings(env),settings);
 for(const patch of [{HEDGEVEIL_HOSTED_MODE:'0'},{HEDGEVEIL_BRIDGE_SECRET:'short'},{HEDGEVEIL_FRONTEND_ORIGIN:'http://hedgeveil.example'},{HEDGEVEIL_BACKEND_ORIGIN:'https://api.example/private'},{HEDGEVEIL_BACKEND_ORIGIN:'https://user:pass@api.example'},{HEDGEVEIL_BACKEND_ORIGIN:settings.frontend}])assert.throws(()=>hostedSettings({...env,...patch}));
 assert.throws(()=>createApp({hosted:settings,config,journal:'unused'}),/HOSTED_WALLET_REQUIRED/);
});
test('NEP-413 digest uses Borsh domain tag, byte nonce, UTF-8 lengths and absent callback',()=>{
 const p={message:'hi',nonce:[...Buffer.alloc(32)],recipient:'myapp.com'};
 const bytes=Buffer.concat([Buffer.from('9d010080020000006869','hex'),Buffer.alloc(32),Buffer.from('090000006d796170702e636f6d00','hex')]);
 assert.deepEqual(nep413Digest(p),createHash('sha256').update(bytes).digest());
});
test('signature, account, nonce, domain, expiry, full-access membership and replay are enforced',async()=>{
 let now=1000,allowed=true,calls=0;
 const auth=new HostedAuth({frontend:settings.frontend,config,now:()=>now,verifyKey:async(id,k)=>{calls++;assert.equal(id,'alice.testnet');assert.equal(k,pub);return allowed;}});
 for(const mutate of [p=>({...p,nonce:[...Buffer.alloc(32)]}),p=>({...p,recipient:'evil.example'}),p=>({...p,message:p.message+'x'})]){
  const c=auth.challenge('alice.testnet');await assert.rejects(auth.login(c.token,signed(mutate(c.payload))),/AUTH_INVALID/);
 }
 let c=auth.challenge('alice.testnet');await assert.rejects(auth.login(c.token,signed(c.payload,'bob.testnet')),/AUTH_INVALID/);assert.equal(calls,0);
 c=auth.challenge('alice.testnet');allowed=false;await assert.rejects(auth.login(c.token,signed(c.payload)),/AUTH_INVALID/);allowed=true;
 c=auth.challenge('alice.testnet');now+=120001;await assert.rejects(auth.login(c.token,signed(c.payload)),/AUTH_INVALID/);
 c=auth.challenge('alice.testnet');const attempts=await Promise.allSettled([auth.login(c.token,signed(c.payload)),auth.login(c.token,signed(c.payload))]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);const token=attempts.find(x=>x.status==='fulfilled').value;
 assert.equal(auth.owner(token),'alice.testnet');assert.equal(auth.owner('forged'),null);
 now+=900001;assert.equal(auth.owner(token),null);
 c=auth.challenge('alice.testnet');const t=await auth.login(c.token,signed(c.payload));auth.logout(t);assert.equal(auth.owner(t),null);
});
test('gateway rejects forged transport identity and missing service authentication',()=>{
 const headers={host:'api.example',origin:settings.frontend,authorization:'Bearer '+settings.secret,'x-forwarded-proto':'https'};
 assert(gatewayAllowed({headers},settings));
 for(const patch of [{authorization:''},{authorization:'Bearer '+ 'b'.repeat(64)},{origin:'https://evil.example'},{host:'evil.example'},{'x-forwarded-proto':'http'},{'x-forwarded-proto':'https,http'}])assert(!gatewayAllowed({headers:{...headers,...patch}},settings));
});
test('request budget bounds work, rates, memory and restores capacity after failures',()=>{
 let now=0;const b=new RequestBudget(()=>now);const releases=Array.from({length:8},()=>b.enter(true));assert.throws(()=>b.enter(true),/RATE_LIMITED/);
 releases.forEach(r=>{r();r();});assert.equal(b.active,0);assert.equal(b.writes,0);
 for(let i=0;i<12;i++)b.take('quotes:alice',12);assert.throws(()=>b.take('quotes:alice',12),/RATE_LIMITED/);
 b.take('quotes:bob',12);now=60001;b.take('quotes:alice',12);
});
async function server(t){
 const journal=await mkdtemp(join(tmpdir(),'hv-auth-'));t.after(()=>rm(journal,{recursive:true,force:true}));
 const app=createApp({hosted:settings,config,journal,wallet:{assets:new Map(),manifest:{wallets:[]}},store:{read:async()=>({items:[],health:{risk_allowed:true}})}});
 app.client.rpc.verify=async()=>{};
 app.client.rpc.request=async(method,p)=>{if(method==='block')return{header:{hash:h(4)}};assert.equal(p.request_type,'view_access_key');assert.equal(p.block_id,h(4));return{block_hash:h(4),permission:'FullAccess'};};
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.server.close(r)));
 const origin='http://127.0.0.1:'+app.server.address().port;
 const call=(path,body,cookie='',extra={})=>new Promise((resolve,reject)=>{
  const req=httpRequest(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{host:'api.example',origin:settings.frontend,authorization:'Bearer '+settings.secret,'x-forwarded-proto':'https','content-type':'application/json',cookie,...extra}},res=>{
   let text='';res.on('data',c=>text+=c);res.on('end',()=>{const headers=new Headers();for(const [k,v] of Object.entries(res.headers))for(const item of Array.isArray(v)?v:[v])if(item!==undefined)headers.append(k,item);resolve(new Response(text,{status:res.statusCode,headers}));});
  });req.on('error',reject);req.end(body===undefined?undefined:JSON.stringify(body));
 });
 const login=async(id)=>{const c=await call('auth/challenge',{account:id});assert.equal(c.status,200);const challenge=c.headers.getSetCookie()[0].split(';')[0];const r=await call('auth/verify',signed(await c.json(),id),challenge);assert.equal(r.status,200);const cs=r.headers.getSetCookie();assert(cs.every(s=>s.includes('HttpOnly; Secure; SameSite=Strict')));return cs.find(s=>s.startsWith(SESSION_COOKIE+'=')).split(';')[0];};
 return {app,call,login};
}
test('HTTP: each user can only list/cancel/recover/handoff/remember their own operations',async t=>{
 const {app,call,login}=await server(t);const alice=await login('alice.testnet'),bob=await login('bob.testnet');
 const intent=buildIntent({network:'testnet',contract_id:config.contract_id,signer_id:'alice.testnet',operation_id:'1'.repeat(64),method:'deposit_collateral',args:{},attached_deposit:'1'});
 await app.client.journal.create(intent,binding(config));
 assert.equal((await call('operations')).status,401);
 assert.equal((await (await call('operations',undefined,bob)).json()).items.length,0);
 assert.equal((await (await call('operations',undefined,alice)).json()).items[0].intent.operation_id,intent.operation_id);
 for(const path of ['cancel','handoff','recover','remember-hash'])for(const id of [intent.operation_id,'2'.repeat(64)]){
  const r=await call(path,{id,hash:h(6)},bob);assert.equal(r.status,404,path);assert.deepEqual(await r.json(),{error:'NOT_FOUND'});
 }
 assert.equal((await call('prepare',{...intent,signer_id:'alice.testnet'},bob)).status,403);
 assert.equal((await call('quotes',{taker:'alice.testnet'},bob)).status,403);
 assert.equal((await call('live?account=alice.testnet',undefined,bob)).status,403);
 assert.equal((await app.client.record(intent.operation_id)).attempted,false);
 assert.equal((await call('cancel',{id:intent.operation_id},alice)).status,200);
 assert.equal((await app.client.record(intent.operation_id)).result.state,'CANCELLED');
 assert.equal((await call('auth/logout',{},alice)).status,200);
 assert.equal((await call('operations',undefined,alice)).status,401);
});
test('HTTP: challenge is browser-cookie bound and unauthenticated gateway never reaches RPC',async t=>{
 const {call}=await server(t);
 assert.equal((await call('session',undefined,'',{authorization:''})).status,403);
 const c=await call('auth/challenge',{account:'alice.testnet'}),p=await c.json();
 assert.equal((await call('auth/verify',signed(p))).status,401);
 // The missing cookie did not consume the real challenge; a matching cookie is required.
 const r=await call('auth/verify',signed(p),c.headers.getSetCookie()[0].split(';')[0]);assert.equal(r.status,200);
 assert.equal((await call('auth/verify',signed(p),c.headers.getSetCookie()[0].split(';')[0])).status,401);
});
test('HTTP: ten separate users retain isolated sessions concurrently',async t=>{
 const {call,login}=await server(t);
 // Eight in-flight writes is the bounded ceiling; stagger login, then concurrent reads.
 const cookies=[];for(let i=0;i<10;i++)cookies.push(await login(`user${i}.testnet`));
 const r=await Promise.all(cookies.map(c=>call('auth/session',undefined,c).then(r=>r.json())));
 assert.deepEqual(r.map(r=>r.account),Array.from({length:10},(_,i)=>`user${i}.testnet`));
});
test('HTTP: unknown attempts remain quarantined through owner recovery and hash hints',async t=>{
 const {app,call,login}=await server(t),alice=await login('alice.testnet');
 const intent=buildIntent({network:'testnet',contract_id:config.contract_id,signer_id:'alice.testnet',operation_id:'3'.repeat(64),method:'deposit_collateral',args:{},attached_deposit:'1'});
 await app.client.journal.create(intent,binding(config));await app.client.journal.claim(intent.operation_id);
 const recovered=await call('recover',{id:intent.operation_id},alice);assert.equal(recovered.status,200);assert.equal((await recovered.json()).state,'SUBMISSION_UNKNOWN');
 for(const path of ['handoff','cancel']){const r=await call(path,{id:intent.operation_id},alice);assert.equal((await r.json()).error,'ALREADY_ATTEMPTED');}
 const remembered=await call('remember-hash',{id:intent.operation_id,hash:h(7)},alice);assert.equal(remembered.status,200);
 const record=await app.client.record(intent.operation_id);assert.equal(record.hash,null);assert.equal(record.candidate_hash,h(7));assert.equal(record.result.state,'SUBMISSION_UNKNOWN');
});
test('HTTP: non-full-access keys and unbound block responses cannot authenticate',async t=>{
 const {app,call}=await server(t);
 for(const response of [{permission:{FunctionCall:{}},block_hash:h(4)},{permission:'FullAccess',block_hash:h(8)}]){
  app.client.rpc.request=async method=>method==='block'?{header:{hash:h(4)}}:response;
  const c=await call('auth/challenge',{account:'alice.testnet'}),p=await c.json();
  assert.equal((await call('auth/verify',signed(p),c.headers.getSetCookie()[0].split(';')[0])).status,401);
 }
});
test('HTTP: challenge rate and JSON body bounds apply before expensive work',async t=>{
 const {call}=await server(t);
 for(let i=0;i<4;i++)assert.equal((await call('auth/challenge',{account:'alice.testnet'})).status,200);
 const r=await call('auth/challenge',{account:'alice.testnet'});assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');
 assert.equal((await call('auth/challenge',{account:'bob.testnet',padding:'x'.repeat(65536)})).status,413);
 assert.equal((await call('auth/challenge',{account:'bob.testnet'},'',{'content-type':'text/plain'})).status,403);
});
