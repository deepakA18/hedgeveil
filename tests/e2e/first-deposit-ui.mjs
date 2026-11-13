// Isolated component fixture. This checks form composition, not a live wallet or payment.
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
import {build} from '../../apps/web/node_modules/esbuild/lib/main.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3000/funds');
 const urls=await page.locator('link[rel=stylesheet]').evaluateAll(els=>els.map(e=>e.href));
 const css=(await Promise.all(urls.map(async u=>(await page.request.get(u)).text()))).join('\n');
 const fixture={account:'fixture.testnet',ready:true,busy:false,records:[],live:{accounts:{'fixture.testnet':null},storage:{account_minimum:'40960000000000000000000',storage_byte_cost:'10000000000000000000'},native:{amount:'1000000000000000000000000',storage_usage:182},gas_price:'100000000',tickets:[]}};
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{Funds}from'${root}/apps/frontend/components/desk/Funds.tsx';createRoot(document.getElementById('root')).render(<Funds/>);`,loader:'tsx',resolveDir:root+'/apps/frontend'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},nodePaths:[root+'/apps/frontend/node_modules'],plugins:[{name:'isolated-context',setup(b){b.onLoad({filter:/\/desk\/DeskProvider.tsx$/},()=>({contents:'export const useDesk=()=>window.desk;',loader:'js'}));}}]});
 await page.route('**/funding-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>${css}</style></head><body class="desk-body"><main class="desk-main"><div id="root"></div></main><script>window.desk=${JSON.stringify(fixture)};window.desk.review=async p=>{window.prepared=p};</script><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`}));
 await page.goto('http://127.0.0.1:3000/funding-fixture');
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Add funds',exact:true})});
 await panel.getByLabel('Amount in NEAR').fill('0.1');await panel.getByRole('button',{name:'Review deposit',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.prepared),{method:'deposit_collateral',args:{},attached_deposit:'140960000000000000000000',storage_deposit:'40960000000000000000000'});
 assert.match(await panel.innerText(),/One wallet approval/);assert.equal(await page.getByText('Step 1 of 2').count(),0);
 await panel.getByRole('button',{name:'Max after gas reserve'}).click();
 assert.equal(await panel.getByLabel('Amount in NEAR').inputValue(),'0.90722');
 await page.screenshot({path:'/tmp/hedgeveil-first-deposit.png',fullPage:true});
 for(const width of [375,768]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('PASS: first deposit includes exact separate storage, one review, max respects storage/gas, mobile has no overflow');
}finally{await browser.close();}
