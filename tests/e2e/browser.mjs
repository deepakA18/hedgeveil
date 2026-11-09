import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
import {startDemo} from '../../apps/web/demo.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const {values:options}=parseArgs({options:{report:{type:'string',default:'research/reports/g7-app.json'}}});
const report={scope:'APP-02 local browser + ephemeral Sandbox signer; real compiled contract and PostgreSQL receipt evidence. No public wallet, testnet deployment or independent review.',checks:[],operations:[],versions:{node:process.version,playwright:'1.62.1',sandbox:'2.14.0'},base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);report.checks.push(name);console.log('PASS',name);};
const sha=b=>createHash('sha256').update(b).digest('hex');
let demo,browser,page;
async function hashes(dir,prefix){const out={};for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.')||['node_modules','target'].includes(e.name))continue;const key=path.posix.join(prefix,e.name),full=path.join(dir,e.name);if(e.isDirectory())Object.assign(out,await hashes(full,key));else out[key]=sha(await readFile(full));}return out;}
try {
 demo=await startDemo();browser=await chromium.launch();report.versions.browser=browser.version();
 const context=await browser.newContext({viewport:{width:1280,height:900}});page=await context.newPage();page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const get=p=>fetch(demo.url+'/api/'+p).then(r=>r.json());
 const post=async(p,data,origin=demo.url)=>{const r=await fetch(demo.url+'/api/'+p,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 async function ready(){await page.waitForFunction(()=>!document.querySelector('#refresh').disabled&&document.querySelector('#account').value);}
 async function nav(name){await page.locator(`nav a[href="#${name}"]`).click();await page.waitForFunction(n=>document.querySelector(`nav a[href="#${n}"]`).getAttribute('aria-current')==='page',name);await ready();}
 async function refresh(){await page.locator('#refresh').click();await ready();}
 async function selectAccount(id){await page.locator('#account').selectOption(id);await ready();}
 async function prepare(form){const response=page.waitForResponse(r=>r.url().endsWith('/api/prepare'));await page.locator(`#${form} button[type=submit]`).click();const p=await(await response).json();assert(!p.error,JSON.stringify(p));await page.locator('#review').waitFor({state:'visible'});return p;}
 async function approve(p,expected='SUCCEEDED'){const response=page.waitForResponse(r=>r.url().endsWith('/api/submit'));await page.locator('#confirm').click();const result=await(await response).json();assert.equal(result.state,expected,JSON.stringify(result));await page.locator('#review').waitFor({state:'hidden'});await ready();report.operations.push({intent:p.intent,result});return result;}
 async function cancel(){await page.locator('#cancel').click();await page.locator('#review').waitFor({state:'hidden'});await ready();}
 await page.goto(demo.url);await ready();await page.getByRole('heading',{name:'Know what you hold.'}).waitFor();
 check('new account sees unregistered storage, synthetic prices and local key custody',[(await page.locator('body').innerText()).includes('Unregistered'),(await page.locator('body').innerText()).includes('SYNTHETIC PRICES'),(await page.locator('footer').innerText()).includes('full-access keys')],[true,true,true]);
 await page.screenshot({path:path.join(ROOT,'target/app02-desktop.png'),fullPage:true});
 check('cross-origin signing request is rejected',(await post('submit',{id:'0'.repeat(64)},'https://example.invalid')).status,403);
 check('private filesystem paths are never served',(await fetch(demo.url+'/.env')).status,404);
 await nav('portfolio');await page.locator('#fund-action').selectOption('deposit_collateral');await page.locator('#fund-amount').fill('1');
 let p=await prepare('fund');check('unregistered deposit preview blocks before signing',p.blockers.includes('INSUFFICIENT_STORAGE'),true);assert(await page.locator('#confirm').isDisabled());await cancel();
 await nav('portfolio');await page.locator('#fund-amount').fill('0.04096');p=await prepare('fund');assert.deepEqual(p.blockers,[]);await approve(p);
 await nav('portfolio');await page.locator('#fund-action').selectOption('deposit_collateral');await page.locator('#fund-amount').fill('5.000000000000000000000001');p=await prepare('fund');await approve(p);
 check('funded ledger and reserved storage remain exact and separate',[(await demo.app.client.balances(demo.accounts[0].id)).account.free,(await demo.app.client.balances(demo.accounts[0].id)).account.storage_paid],['5000000000000000000000001','40960000000000000000000']);
 await nav('trade');await page.locator('#claim-amount').fill('2');p=await prepare('claims');await approve(p);
 await nav('trade');await page.locator('#claim-action').selectOption('merge');await page.locator('#claim-amount').fill('0.1');p=await prepare('claims');await approve(p);
 await nav('trade');await page.locator('#quote-amount').fill('0.1');const quotesResponse=page.waitForResponse(r=>r.url().endsWith('/api/quotes'));await page.locator('#quote button').click();const offers=await(await quotesResponse).json();check('two actual maker workers return independently signed funded quotes',offers.items.filter(x=>x.quote).length,2);
 const qr=page.waitForResponse(r=>r.url().endsWith('/api/prepare'));await page.getByRole('button',{name:'Review fill 1',exact:true}).click();p=await(await qr).json();await approve(p);
 check('actual quote fill consumes its on-chain nonce',(await demo.app.client.rpc.view('get_market',{maker:offers.items[0].quote.maker})).consumed[0]&1,1);
 await nav('save');await page.locator('#mint-shares').fill('0.5');p=await prepare('mint');check('browser basket preview shows exact inputs and share quantity',[p.required.map(l=>l.amount),p.share_quantity],[['500000000000000000000000','500000000000000000000000'],'500000000000000000000000']);await approve(p);
 await nav('portfolio');p=await prepare('exit');await approve(p);
 check('in-kind browser exit returns actual assets and burns visitor shares',(await demo.app.client.balances(demo.accounts[0].id)).vault.holders[demo.accounts[0].id]??'0','0');
 // Cancellation must not call any signer, even after reload and a second submit request.
 await nav('portfolio');await page.locator('#fund-action').selectOption('deposit_collateral');await page.locator('#fund-amount').fill('0.2');p=await prepare('fund');const count=demo.transactions.length;await cancel();await page.reload();await ready();
 check('cancelled signing consumes the journal ID without a transaction',[(await post('submit',{id:p.intent.operation_id})).body.error,demo.transactions.length],['ALREADY_ATTEMPTED',count]);
 // Browser transport loses the HTTP response AFTER a real finalized transaction.
 await nav('portfolio');await page.locator('#fund-action').selectOption('deposit_collateral');await page.locator('#fund-amount').fill('0.3');p=await prepare('fund');const before=(await demo.app.client.balances(demo.accounts[0].id)).account.free;
 await page.route('**/api/submit',async route=>{await route.fetch();await route.abort('failed');},{times:1});await page.locator('#confirm').click();await page.getByRole('button',{name:'Close and check receipts'}).waitFor();await page.reload();await ready();await nav('transactions');
 const retained=await demo.app.client.record(p.intent.operation_id);check('interrupted deposit recovers on reload with exactly one ledger credit',[retained.result.state,String(BigInt((await demo.app.client.balances(demo.accounts[0].id)).account.free)-BigInt(before))],['SUCCEEDED','300000000000000000000000']);
 check('browser stored attempt before send',await page.evaluate(id=>Object.entries(localStorage).some(([k,v])=>k.startsWith('hedgeveil:')&&JSON.parse(v)[id]==='attempting'),p.intent.operation_id),true);
 check('second submission of interrupted deposit is rejected',(await post('submit',{id:p.intent.operation_id})).body.error,'ALREADY_ATTEMPTED');report.operations.push({intent:p.intent,result:retained.result,interruption:'HTTP response dropped after finalized send; page reloaded'});
 // A lost signer response without a retained hash remains uncertain until exact-hash recovery.
 let lostHash;demo.setSigner(async(request)=>{const result=await demo.realSigner(request,async()=>{});lostHash=result.hash;throw Error('injected signer response loss');});
 await nav('portfolio');await page.locator('#fund-action').selectOption('deposit_collateral');await page.locator('#fund-amount').fill('0.000001');p=await prepare('fund');await approve(p,'SUBMISSION_UNKNOWN');demo.setSigner(null);
 check('lost signer response is displayed as uncertain',(await page.locator('#main').innerText()).includes('Submission uncertain'),true);
 const held=await post('prepare',{signer_id:demo.accounts[0].id,method:'deposit_collateral',args:{},attached_deposit:'1'});check('uncertain deposit prevents a new-ID duplicate',held.body.blockers.includes('UNRESOLVED_OPERATION'),true);
 await page.locator('#recover-id').selectOption(p.intent.operation_id);await page.locator('#recover-hash').fill(lostHash);await page.locator('#manual-recover button').click();await ready();
 await page.waitForFunction(()=>!document.querySelector('#manual-recover')?.hasAttribute('aria-busy'));
 check('manual exact-hash recovery confirms the original send',(await demo.app.client.record(p.intent.operation_id)).result.state,'SUCCEEDED');
 await nav('portfolio');await page.locator('#withdraw-amount').fill('0.01');p=await prepare('withdraw');await approve(p,'WITHDRAWAL_SUCCEEDED');
 await nav('portfolio');await page.locator('#withdraw-amount').fill('0.01');await page.locator('#withdraw-receiver').fill('missing.sandbox');p=await prepare('withdraw');await approve(p,'WITHDRAWAL_FAILED_CONFIRMED');
 check('browser displays confirmed failed payout restoration',(await page.locator('#main').innerText()).includes('callback confirmed restoration'),true);
 const closes=page.locator('[data-close]');if(await closes.count()){const response=page.waitForResponse(r=>r.url().endsWith('/api/prepare'));await closes.first().click();p=await(await response).json();await approve(p);}
 // Indexer failure blocks deposits, while freshly verified merge/exit actions remain usable.
 await demo.indexer.store.markFailure('INJECTED_BROWSER_CHECK');
 const input={signer_id:demo.accounts[0].id,method:'deposit_collateral',args:{},attached_deposit:'1'};
 const blocked=await post('prepare',input);check('unhealthy indexer blocks new risk',blocked.body.blockers.includes('INDEXER_UNHEALTHY'),true);
 const merge=await post('prepare',{signer_id:demo.accounts[0].id,method:'merge',args:{series_id:'alpha',amount:'1'}});check('unhealthy indexer leaves direct verified merges available',merge.body.blockers.includes('INDEXER_UNHEALTHY'),false);await demo.sync();
 await selectAccount(demo.accounts[3].id);await nav('portfolio');p=await prepare('fund');check('insufficient wallet gas or attached funding is visible before sending',p.blockers.includes('INSUFFICIENT_GAS'),true);await cancel();await selectAccount(demo.accounts[0].id);
 // Server independently rejects expired and cancelled quotes, regardless of browser display.
 const stale=structuredClone(offers.items[1].quote);stale.expiry_ns='1';p=(await post('prepare',{signer_id:demo.accounts[0].id,method:'fill_quote',args:{quote:stale}})).body;check('expired quote cannot reach signer',p.blockers.includes('QUOTE_STALE'),true);
 const retired=await demo.makers[1].ask('withdraw');assert(retired.cancellation&&!retired.cancellation.receipts_outcome.some(r=>r.outcome.status.Failure));await demo.sync();p=(await post('prepare',{signer_id:demo.accounts[0].id,method:'fill_quote',args:{quote:offers.items[1].quote}})).body;check('on-chain maker epoch cancellation disables old quotes',p.blockers.includes('QUOTE_CANCELLED'),true);
 await nav('trade');await page.locator('#quote button').click();await page.getByText(/MAKER_WITHDRAWN/).waitFor();check('maker retirement produces visible no-quote state',true,true);
 await demo.dispute();await refresh();await nav('transactions');await page.getByText(/Oracle .*DISPUTED/).waitFor();check('real synthetic oracle dispute and evidence are visible',true,true);
 await nav('trade');await page.locator('#claim-action').selectOption('redeem');await page.locator('#claim-amount').fill('0.01');p=await prepare('claims');check('unresolved settlement prevents redemption',p.blockers.includes('SETTLEMENT_UNRESOLVED'),true);await cancel();
 await demo.finalize();await refresh();await nav('trade');await page.locator('#claim-action').selectOption('redeem');await page.locator('#claim-amount').fill('0.01');p=await prepare('claims');await approve(p);
 check('browser redemption is backed by actual final price',(await demo.app.client.balances(demo.accounts[0].id)).series[0].final_price!==null,true);
 await nav('transactions');await page.locator('#resource').selectOption('receipts');await page.locator('#evidence button').click();await page.locator('#evidence-body pre').waitFor();check('evidence viewer returns real indexed receipt IDs',(await page.locator('#evidence-body').innerText()).includes('block_hash'),true);
 await nav('makers');check('maker registry and subsidy disclosure rendered',(await page.locator('#main').innerText()).includes('Sandbox genesis'),true);
 await selectAccount(demo.accounts[1].id);await nav('makers');await page.locator('#cancel-nonce').fill('7');p=await prepare('cancel-quote');await approve(p);await nav('makers');p=await prepare('epoch');await approve(p);await nav('makers');p=await prepare('revoke');await approve(p);check('maker UI confirms nonce cancellation, epoch advance and key revocation',(await demo.app.client.rpc.view('get_market',{maker:demo.accounts[1].id})).keys['demo-key'].revoked,true);await selectAccount(demo.accounts[0].id);
 for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});await nav('portfolio');check(`layout does not overflow at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(ROOT,`target/app02-${width}.png`),fullPage:true});}
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.screenshot({path:path.join(ROOT,'target/app02-dark.png'),fullPage:true});
 await page.keyboard.press('Tab');check('keyboard focus reaches an interactive element',await page.evaluate(()=>['A','BUTTON','INPUT','SELECT','SUMMARY'].includes(document.activeElement.tagName)),true);
 const blockedContext=await browser.newContext();await blockedContext.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error('blocked');};});const blockedPage=await blockedContext.newPage();await blockedPage.goto(demo.url+'/#portfolio');await blockedPage.getByText(/Browser storage is unavailable/).waitFor();await blockedContext.close();check('unavailable browser storage visibly disables preparation',true,true);
 check('no uncaught browser exceptions',errors,[]);
 report.operations_retained=await demo.app.operations();report.transactions=demo.transactions;report.artifacts=demo.manifest;
 report.final_snapshots=(await demo.indexer.store.read('snapshots',{limit:200})).items;
 report.sources={...await hashes(path.join(ROOT,'apps/web'),'apps/web'),...await hashes(path.join(ROOT,'packages/sdk'),'packages/sdk'),...await hashes(path.join(ROOT,'tests/e2e'),'tests/e2e')};
 report.passed=true;await writeFile(path.resolve(ROOT,options.report),JSON.stringify(report,null,2)+'\n');console.log('Evidence',options.report);
}catch(e){if(page){await mkdir(path.join(ROOT,'target'),{recursive:true});await page.screenshot({path:path.join(ROOT,'target/app02-failure.png'),fullPage:true}).catch(()=>{});console.error((await page.locator('body').innerText().catch(()=>'' )).slice(-5000));}throw e;}
finally{if(browser)await browser.close();if(demo)await demo.stop();}
