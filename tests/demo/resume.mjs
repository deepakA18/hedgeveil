import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {fork,execFileSync} from 'node:child_process';
import {readFile,writeFile,readdir,stat,chmod,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {Client} from '../../packages/sdk/client.mjs';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const {values:options}=parseArgs({options:{report:{type:'string',default:'research/reports/g7-demo-resume.json'}}});
const name='resume-'+randomUUID().slice(0,8),report={scope:'DEM-01 retained local Sandbox lifecycle; generated test credentials are excluded from evidence; no testnet or public wallet acceptance',checks:[],operations:[],versions:{node:process.version,sandbox:'2.14.0'},base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};
const check=(name,a,b)=>{assert.deepEqual(a,b,name);report.checks.push(name);console.log('PASS',name);};
let current,browser;
async function launch(mode,n=name){
 const child=fork(path.join(ROOT,'scripts/demo.mjs'),[mode,n],{execArgv:[],stdio:['ignore','pipe','pipe','ipc'],env:{PATH:process.env.PATH,HOME:process.env.HOME}});let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const exited=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})));
 const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(child.connected)child.send({type:'stop'});reject(Error('DEMO_START_TIMEOUT'));},120000);child.on('message',m=>{if(['ready','error'].includes(m.type)){clearTimeout(timer);resolve(m);}});child.once('exit',()=>{clearTimeout(timer);reject(Error('DEMO_EXITED_BEFORE_READY'));});});
 if(ready.type==='error'){await exited;return {error:ready.code,output};}
 return {child,...ready,output:()=>output,loseSupervisor:async()=>{child.kill('SIGKILL');await exited;},stop:async(signal=false)=>{if(signal)child.kill('SIGINT');else child.send({type:'stop'});const result=await exited;assert.equal(result.code,0,output);}};
}
const post=async(p,data)=>{const r=await fetch(current.url+'/api/'+p,{method:'POST',headers:{origin:current.url,'content-type':'application/json'},body:JSON.stringify(data)});return r.json();};
const get=p=>fetch(current.url+'/api/'+p).then(r=>r.json());
async function op(method,args={},attached_deposit='1') {const p=await post('prepare',{signer_id:current.accounts[0].id,method,args,attached_deposit});assert(!p.error,JSON.stringify(p));assert.deepEqual(p.blockers,[]);const result=await post('submit',{id:p.intent.operation_id});assert.equal(result.state,'SUCCEEDED',JSON.stringify(result));report.operations.push({intent:p.intent,result});return p.intent;}
const snapshot=async()=>{const s=await get('state');return s.items.find(x=>x.contract===current.config.contract_id).body;};
async function recordSources(dir,prefix){const out={};for(const e of await readdir(dir,{withFileTypes:true})){if(['node_modules','target'].includes(e.name))continue;const key=path.posix.join(prefix,e.name),f=path.join(dir,e.name);if(e.isDirectory())Object.assign(out,await recordSources(f,key));else out[key]=createHash('sha256').update(await readFile(f)).digest('hex');}return out;}
try {
 current=await launch('create');assert(!current.error,current.error);const config=current.config,directory=current.directory,visitor=current.accounts[0].id;
 check('existing named deployment is never overwritten',(await launch('create')).error,'WORKSPACE_EXISTS');
 check('second owner cannot start the same deployment',(await launch('resume')).error,'DEMO_ALREADY_RUNNING');
 check('generated signer file is private',(await stat(path.join(directory,'signers.json'))).mode&0o777,0o600);
 const live=await get('live?account='+visitor);await op('storage_deposit',{},live.storage.account_minimum);const deposit=await op('deposit_collateral',{},'3000000000000000000000000');await op('split',{series_id:'alpha',amount:'1000'});
 const quoteRequest={taker:visitor,mode:'BUY',asset:{kind:'P',series_id:'alpha'},amount:'10000000000000000000000'};
 const oldOffers=(await post('quotes',quoteRequest)).items;assert.equal(oldOffers.filter(x=>x.quote).length,2);
 const client=new Client({config,journal:path.join(directory,'journal')});
 // Durable attempt without a known hash is a deliberate interruption; no success is invented.
 const unknown=await client.prepare({signer_id:visitor,method:'deposit_collateral',args:{},attached_deposit:'7'});await client.journal.claim(unknown.operation_id);
 const before=await snapshot(),beforeOps=(await get('operations')).items;
 report.before={config,custody:before.custody,account:before.accounts[visitor],markets:before.markets,checkpoint:before.block_hash};
 browser=await chromium.launch();const page=await browser.newPage();await page.goto(current.url+'/#transactions');await page.getByRole('heading',{name:'Follow the funds.'}).waitFor();
 await current.stop(true);current=null;
 current=await launch('resume');assert(!current.error,current.error);
 const after=await snapshot();check('restart preserves exact deployment identity',current.config,config);
 check('restart preserves balances, storage, claims, vault ownership and custody sequence',[after.accounts,after.vault,after.custody.operation_sequence],[before.accounts,before.vault,before.custody.operation_sequence]);
 check('restart does not create any setup, funding or market registration events',after.markets,before.markets);
 check('restart retains the entire journal',(await get('operations')).items,beforeOps);
 check('confirmed deposit recovers without another send',(await post('recover',{id:deposit.operation_id})).state,'SUCCEEDED');
 check('attempt with no hash remains uncertain',(await post('recover',{id:unknown.operation_id})).state,'SUBMISSION_UNKNOWN');
 check('retained attempted ID cannot be submitted again',(await post('submit',{id:deposit.operation_id})).error,'ALREADY_ATTEMPTED');
 const blocked=await post('prepare',{signer_id:visitor,method:'deposit_collateral',args:{},attached_deposit:'1'});check('uncertain deposit also blocks new-ID funding after restart',blocked.blockers.includes('UNRESOLVED_OPERATION'),true);
 await page.reload();await page.getByRole('heading',{name:'Follow the funds.'}).waitFor();check('same browser origin reload shows retained uncertain state',(await page.locator('#main').innerText()).includes('SUBMISSION_UNKNOWN'),true);
 check('persistent key custody is disclosed in browser',(await page.locator('footer').innerText()).includes('retained in the private demo workspace'),true);
 const newOffers=(await post('quotes',quoteRequest)).items;
 check('unfilled off-chain quote nonces survive restart without reuse',newOffers.map((x,i)=>BigInt(x.quote.nonce)>BigInt(oldOffers[i].quote.nonce)),[true,true]);
 check('maker RFQ public keys stay registered',after.markets,before.markets);
 await op('merge',{series_id:'alpha',amount:'1000'});
 check('a resumed signer can still execute a real authorized exit',(await snapshot()).accounts[visitor].positions[0],{p:'0',n:'0'});
 // New quote-state files are required; resume never silently generates replacement maker keys.
 await current.stop();current=null;
 const occupied=createServer();await new Promise(r=>occupied.listen(Number(new URL(config.rpc_url).port),'127.0.0.1',r));try{check('occupied service port blocks resume rather than attaching to another node',(await launch('resume')).error,'DEMO_PORT_IN_USE');}finally{await new Promise(r=>occupied.close(r));}
 await chmod(path.join(directory,'signers.json'),0o644);check('unsafe retained credential permissions block resume',(await launch('resume')).error,'PRIVATE_FILE_PERMISSIONS');await chmod(path.join(directory,'signers.json'),0o600);
 const signerFile=path.join(directory,'signers.json'),originalSigners=await readFile(signerFile),wrongSigners=JSON.parse(originalSigners);wrongSigners.keys[0][1]=wrongSigners.keys[1][1];await writeFile(signerFile,JSON.stringify(wrongSigners));check('valid but unauthorized retained signer key blocks resume',(await launch('resume')).error,'SIGNER_KEY_MISMATCH');await writeFile(signerFile,originalSigners);
 const manifestFile=path.join(directory,'deployment.json'),original=await readFile(manifestFile);await writeFile(manifestFile,'{}');check('modified deployment manifest fails before signing',(await launch('resume')).error,'MANIFEST_MISMATCH');await writeFile(manifestFile,original);
 const incomplete='incomplete-'+randomUUID().slice(0,8);await mkdir(path.join(ROOT,'target/demos',incomplete),{mode:0o700});check('partial initialization cannot be resumed or automatically reseeded',(await launch('resume',incomplete)).error,'WORKSPACE_INCOMPLETE_OR_MISSING');
 current=await launch('resume');assert(!current.error,current.error);check('recovery after rejected resumes still uses original genesis',current.config.genesis_hash,config.genesis_hash);
 await current.loseSupervisor();current=null;let released=false;for(let i=0;i<200;i++){try{await stat(path.join(directory,'running'));}catch(e){if(e.code==='ENOENT'){released=true;break;}throw e;}await new Promise(r=>setTimeout(r,50));}check('supervisor loss triggers orderly child cleanup via IPC disconnect',released,true);current=await launch('resume');assert(!current.error,current.error);
 const final=await snapshot();report.after={custody:final.custody,account:final.accounts[visitor],markets:final.markets,checkpoint:final.block_hash};
 report.receipts=[];for(const o of report.operations)report.receipts.push(await client.rpc.request('tx',{tx_hash:o.result.hash,sender_account_id:visitor,wait_until:'FINAL'}));
 report.costs=report.receipts.map(tx=>({hash:tx.transaction.hash,method:tx.transaction.actions[0].FunctionCall.method_name,attached_yocto:tx.transaction.actions[0].FunctionCall.deposit,gas_burnt:String([tx.transaction_outcome,...tx.receipts_outcome].reduce((n,r)=>n+BigInt(r.outcome.gas_burnt),0n)),tokens_burnt:String([tx.transaction_outcome,...tx.receipts_outcome].reduce((n,r)=>n+BigInt(r.outcome.tokens_burnt),0n))}));
 report.sources={...await recordSources(path.join(ROOT,'services/demo'),'services/demo'),...await recordSources(path.join(ROOT,'tests/demo'),'tests/demo')};
 for(const f of ['apps/web/demo.mjs','apps/web/server.mjs','services/maker/worker.mjs','scripts/demo.mjs','tests/sandbox/package-lock.json','services/indexer/package-lock.json'])report.sources[f]=createHash('sha256').update(await readFile(path.join(ROOT,f))).digest('hex');
 check('public output contains no private key material',/PRIVATE KEY|ed25519:[1-9A-HJ-NP-Za-km-z]{70,}/.test(current.output()),false);
 report.passed=true;await writeFile(path.resolve(ROOT,options.report),JSON.stringify(report,null,2)+'\n');console.log('Evidence',options.report);
}finally{if(browser)await browser.close();if(current&&!current.error)await current.stop();}
