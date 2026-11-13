import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../sandbox/package.json',import.meta.url));
const {KeyPair}=await import(require.resolve('near-api-js'));
function worker(){const child=fork(fileURLToPath(new URL('../../services/maker/worker.mjs',import.meta.url)),[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH}});const ask=(method,config)=>new Promise((resolve,reject)=>{const id=randomUUID();const timer=setTimeout(()=>{child.kill();reject(Error('timeout'));},10000);const receive=m=>{if(m.id!==id)return;clearTimeout(timer);child.off('message',receive);resolve(m);};child.on('message',receive);child.send({id,method,config,request:{}});});return {ask,stop:()=>new Promise(r=>{child.once('exit',r);child.kill();})};}
test('maker key and retirement survive a process restart; missing/corrupt state never regenerates',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hedgeveil-maker-')),file=path.join(dir,'maker.json');let w;
 const config={rpc_url:'http://127.0.0.1:1/',contract:'core.sandbox',maker:'maker.sandbox',account_key:KeyPair.fromRandom('ed25519').toString(),state_file:file,key_id:'test-key'};
 try{
 w=worker();const first=await w.ask('init',config);assert(first.result?.public_key);assert.deepEqual((await w.ask('health')).result,{ready:true,reason:null});await w.ask('pause');assert.equal((await w.ask('health')).result.reason,'MAKER_MAINTENANCE');await w.ask('resume');const retired=await w.ask('withdraw');assert.equal(retired.result.reason,'MAKER_WITHDRAWN');assert.equal((await w.ask('health')).result.reason,'MAKER_WITHDRAWN');await w.stop();w=null;
 w=worker();const resumed=await w.ask('init',{...config,resume:true});assert.equal(resumed.result.public_key,first.result.public_key);assert.equal((await w.ask('quote')).result.reason,'MAKER_WITHDRAWN');await w.stop();w=null;
 await writeFile(file,'broken json');w=worker();assert.equal((await w.ask('init',{...config,resume:true})).error,'MAKER_REQUEST_FAILED');await w.stop();w=null;
 await rm(file);w=worker();assert.equal((await w.ask('init',{...config,resume:true})).error,'MAKER_REQUEST_FAILED');
 }finally{if(w)await w.stop();await rm(dir,{recursive:true,force:true});}
});
