import assert from 'node:assert/strict';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
import {build} from '../../apps/web/node_modules/esbuild/lib/main.js';
import {fileURLToPath} from 'node:url';
// Read-only UI checks. Toast state transitions below run in an isolated test harness,
// never in the trading app; no wallet signing or transaction submission occurs.
const root=fileURLToPath(new URL('../..',import.meta.url)).replace(/\/$/,'');
const base='http://127.0.0.1:3000';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('hedgeveil.trade-tour.v2','seen'));
 await page.goto(base+'/trade',{waitUntil:'networkidle'});
 await page.locator('.scenario-chart svg').waitFor();
 assert.equal(await page.locator('.terminal-center .trade-controls').count(),0);
 assert.equal(await page.locator('.terminal-ticket .trade-controls [aria-label="Choose exposure"]').count(),1);
 assert.equal(await page.locator('.terminal-ticket .trade-controls [aria-label="Trade side"]').count(),1);
 const quantity=page.getByRole('textbox',{name:'Quantity',exact:true});
 const height=(await page.locator('.scenario-chart svg').boundingBox()).height;
 await quantity.fill('0');
 await page.getByText('Enter a quantity to preview payout',{exact:true}).waitFor();
 assert.equal((await page.locator('.scenario-chart svg').boundingBox()).height,height);
 assert.equal(await page.locator('.scenario-curve').count(),0);
 await page.screenshot({path:'/tmp/hedgeveil-empty-chart.png'});
 assert.ok(await page.locator('.terminal-ticket form button[type=submit]').isDisabled());
 await quantity.fill('0.05');
 await page.locator('.scenario-curve').waitFor();
 for(const width of [1440,768,375]) {
  await page.setViewportSize({width,height:1000});
  for(const theme of ['light','dark']) {
   await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark')},theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} ${theme} overflow`);
   if(width===1440) {
    const h=await page.locator('.series-rail .region-heading').boundingBox();
    const d=await page.locator('.series-rail .expert-toggle').boundingBox();
    assert.ok(d.y>=h.y && d.y+d.height<=h.y+h.height);
   }
   await page.screenshot({path:`/tmp/hedgeveil-controls-${width}-${theme}.png`});
  }
 }
 await page.getByRole('button',{name:'Open trade ticket',exact:true}).click();
 await page.locator('[role=dialog] .trade-controls').waitFor();
 assert.equal(await page.locator('[role=dialog] .trade-controls [aria-label="Choose exposure"]').count(),1);
 await page.screenshot({path:'/tmp/hedgeveil-mobile-ticket.png'});
 await page.goto(base+'/activity',{waitUntil:'networkidle'});
 assert.equal(await page.getByText('Follow confirmed receipts, pending transfers and actions that need another check.',{exact:true}).count(),0);
 assert.equal(await page.locator('.desk-notice').count(),0);
 assert.equal(await page.locator('h1').innerText(),'Activity');
 const sheets=await page.locator('link[rel=stylesheet]').evaluateAll(els=>els.map(el=>el.href));
 const css=(await Promise.all(sheets.map(async u=>(await page.request.get(u)).text()))).join('\n');
 const hash='HU858PeWXoYWc59yuWybr1YahsUS9LQVNB2pXRsnuq1y';
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{Feedback,transactionToast}from'${root}/apps/frontend/components/desk/Feedback.tsx';window.notify=transactionToast;createRoot(document.getElementById('root')).render(<Feedback error="" notice="" processing="Checking receipts…"/>);`;
 const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root+'/apps/frontend'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},nodePaths:[root+'/apps/frontend/node_modules']});
 await page.route('**/feedback-review',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto(base+'/feedback-review');
 await page.locator('.desk-processing').waitFor();
 await page.evaluate(hash=>window.notify('test-operation',{state:'PENDING',hash}),hash);
 await page.getByText('Waiting for confirmation',{exact:true}).waitFor();
 assert.equal(await page.locator('.desk-toast .desk-spinner').count(),1);
 await page.evaluate(hash=>window.notify('test-operation',{state:'WITHDRAWAL_SUCCEEDED',hash}),hash);
 await page.getByText('Transaction confirmed',{exact:true}).waitFor();
 assert.equal(await page.locator('.desk-toast').count(),1);
 assert.equal(await page.locator('.desk-toast a').getAttribute('href'),`https://testnet.nearblocks.io/txns/${hash}`);
 await page.evaluate(hash=>window.notify('test-operation',{state:'WITHDRAWAL_SUCCEEDED',hash}),hash);
 assert.equal(await page.locator('.desk-toast').count(),1);
 await page.evaluate(hash=>window.notify('test-unknown',{state:'SUBMISSION_UNKNOWN',hash}),hash);
 await page.getByText('Transaction needs verification',{exact:true}).waitFor();
 assert.match(await page.locator('[data-kind="warning"]').innerText(),/do not resend/);
 await page.evaluate(()=>window.notify('test-failed',{state:'FAILED_CONFIRMED'}));
 await page.getByText('Transaction failed',{exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/feedback-review');
 await page.screenshot({path:'/tmp/hedgeveil-feedback-light.png'});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await page.screenshot({path:'/tmp/hedgeveil-feedback-dark.png'});
 await page.locator('.desk-toast-close').first().click();
 await page.waitForFunction(()=>document.querySelectorAll('.desk-toast').length===2);
 assert.deepEqual(errors,[]);
 console.log('PASS: controls, zero quantity, Activity, six responsive/theme views and receipt toast transitions. No transactions submitted.');
} finally {await browser.close()}
