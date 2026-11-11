// Read-only preview of the running local review page. Never connects or signs.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
const report={scope:'Read-only actual local funding page in Chromium; no wallet signature or public funding acceptance',checks:[],sources:{},passed:false};
const check=(name,v)=>{assert(v,name);report.checks.push(name);console.log('PASS',name);};
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8793');await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Connect the funding wallet'));
 const d=await page.evaluate(()=>fetch('/api/plan').then(r=>r.json()));
 check('exact wallet intent is one 48-test-NEAR transfer to the public-plan receiver',d.intent.receiver_id===d.plan.funding.receiver_id&&JSON.stringify(d.intent.actions)===JSON.stringify([{type:'Transfer',deposit:'48000000000000000000000000'}]));
 check('page discloses changed account layout, local key control and cancellation of old prompt',(await page.locator('body').innerText()).includes('service accounts will not be under your wallet name')&&(await page.locator('body').innerText()).includes('Cancel the earlier blocked wallet prompt'));
 check('funding stays disabled until wallet connection',await page.locator('#fund').isDisabled());
 for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});check(`long destination fits ${width}px viewport`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.screenshot({path:'target/transfer-funding-review.png',fullPage:true});
 const after=await page.evaluate(()=>fetch('/api/plan').then(r=>r.json()));
 check('preview did not claim or broadcast the funding request',!d.record.attempted&&!after.record.attempted&&!after.record.hash);
 check('browser initialized without script errors',errors.length===0);
 report.operation_id=d.intent.operation_id;report.receiver_id=d.intent.receiver_id;report.passed=true;
}finally{
 await browser.close();
 for(const f of ['services/testnet/bootstrap.mjs','services/testnet/setup-browser.mjs','services/testnet/funding.mjs','tests/demo/funding-preview.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile('research/reports/orc03-transfer-funding-preview.json',JSON.stringify(report,null,2)+'\n');
}
