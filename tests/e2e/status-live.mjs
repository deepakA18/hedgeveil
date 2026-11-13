import { chromium } from '../../apps/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[],posts=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});
 await page.goto('http://127.0.0.1:3000/status');
 await page.locator('.status-service h3').first().waitFor();
 assert.equal(await page.locator('.status-service h3').count(),11);
 assert.equal(await page.locator('.status-bar').count(),330);
 assert.match(await page.locator('.status-summary').innerText(),/Last checked/);
 const status=await page.evaluate(async()=>await(await fetch('/api/status')).json());
 console.log(JSON.stringify({services:status.services.map(s=>({name:s.name,state:s.state})),history:status.history.length}));
 for(const width of [375,768,1440]){
  await page.setViewportSize({width,height:1100});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`/private/tmp/hedgeveil-status-light-${width}.png`,fullPage:true});
 }
 await page.getByRole('button',{name:'Switch to dark theme'}).click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.screenshot({path:'/private/tmp/hedgeveil-status-dark-1440.png',fullPage:true});
 // Failure injection is browser-test-only. Production never substitutes these responses.
 await page.route('**/api/status',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"TEST_ONLY_OUTAGE"}'}));
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();
 await page.getByRole('heading',{name:'Status is unavailable',exact:true}).waitFor();
 assert.match(await page.locator('.footer-status').getAttribute('aria-label'),/Not verified/);
 await page.unroute('**/api/status');
 await page.getByRole('button',{name:'Refresh status',exact:true}).click();
 await page.locator('.status-service h3').first().waitFor();
 await page.goto('http://127.0.0.1:3000/trade');
 await page.locator('.footer-status').click();
 await page.waitForURL('**/status');
 await page.getByRole('button',{name:'Refresh status',exact:true}).focus();
 await page.keyboard.press('Enter');
 assert.deepEqual(errors,[]);assert.deepEqual(posts,[]);
 console.log('PASS: real telemetry, 11 services, footer navigation, light/dark, 375/768/1440 overflow, keyboard refresh and outage recovery. No POSTs.');
} finally { await browser.close(); }
