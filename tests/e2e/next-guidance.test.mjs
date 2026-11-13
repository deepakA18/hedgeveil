import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
const base=process.env.FRONTEND_TEST_URL??'http://127.0.0.1:3000';

test('first-visit tour follows each section and remembers completion without submitting actions',async t=>{
 const browser=await chromium.launch();t.after(()=>browser.close());
 for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:{width:mobile?390:1440,height:1000},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
 const mutations=[],errors=[],positions=[];
 page.on('request',r=>{if(r.method()==='POST')mutations.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/trade?series=eta',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.tour-launch').count(),0);
 const tour=page.locator('.trade-tour[role=dialog]');await tour.waitFor();
 for(let i=1;i<=6;i++){
  await page.waitForFunction(n=>document.querySelector('.tour-progress')?.textContent===`Step ${n} of 6`,i);
  assert.equal(await page.locator('[data-tour-active=true]').count(),1);
  await page.waitForFunction(()=>document.activeElement?.tagName==='H3');
  const box=await tour.boundingBox();positions.push([Math.round(box.x),Math.round(box.y)]);
  assert.ok(box.x>=0&&box.x+box.width<=(mobile?390:1440),JSON.stringify(box));
  assert.ok(box.y>=0&&box.y+box.height<=1000,JSON.stringify(box));
  if(i===2)assert.match(await tour.locator('.tour-copy').innerText(),/no open markets/);
  await page.screenshot({path:`/tmp/hv-tour-${mobile?'mobile':'desktop'}-${i}.png`});
  if(i===3){await tour.getByRole('button',{name:'Back',exact:true}).click();assert.match(await tour.locator('.tour-progress').innerText(),/Step 2/);await tour.getByRole('button',{name:'Next',exact:true}).click();}
  await tour.getByRole('button',{name:i===6?'Done':'Next',exact:true}).click();
 }
 await tour.waitFor({state:'hidden'});
 assert.ok(new Set(positions.map(JSON.stringify)).size>=3,'Tour must move with its targets');
 assert.equal(await page.locator('[data-tour-active=true]').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('hedgeveil.trade-tour.v2')),'seen');
 await page.reload({waitUntil:'networkidle'});await page.waitForTimeout(1000);assert.equal(await tour.count(),0);
 assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);await page.close();
 }
});

test('first-visit tour can be skipped or escaped and stays dismissed',async t=>{
 const browser=await chromium.launch();t.after(()=>browser.close());
 for(const escape of [false,true]){
  const page=await browser.newPage();await page.goto(base+'/trade?series=eta',{waitUntil:'networkidle'});
  const tour=page.locator('.trade-tour[role=dialog]');await tour.waitFor();
  if(escape)await page.keyboard.press('Escape');else await tour.getByRole('button',{name:'Skip tour',exact:true}).click();
  await tour.waitFor({state:'hidden'});await page.reload({waitUntil:'networkidle'});await page.waitForTimeout(1000);
  assert.equal(await tour.count(),0);await page.close();
 }
});

test('information works by hover, keyboard and mobile tap without hiding gates',async t=>{
 const browser=await chromium.launch();t.after(()=>browser.close());
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:{width:mobile?390:1440,height:1000},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('hedgeveil.trade-tour.v2','seen'));
  await page.goto(base+'/trade?series=eta',{waitUntil:'networkidle'});
  const help=page.getByRole('button',{name:'About Set price',exact:true});
  if(mobile)await help.tap();else await help.hover();
  await page.locator('.info-popup').waitFor();assert.match(await page.locator('.info-description').innerText(),/fixed when this market/);
  const bounds=await page.locator('.info-popup').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=(mobile?390:1440));
  await page.keyboard.press('Escape');await page.locator('.info-popup').waitFor({state:'hidden'});
  await help.focus();await page.keyboard.press('Enter');await page.locator('.info-popup').waitFor();
  await page.getByRole('button',{name:'Close Set price explanation',exact:true}).click();
  await page.locator('.info-popup').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='About Set price');
  assert.equal(await help.evaluate(e=>e===document.activeElement),true);
  if(mobile){await page.getByRole('button',{name:'Open trade ticket',exact:true}).click();}
  assert.equal(await page.getByRole('button',{name:'Market closed',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'About Quantity',exact:true}).click();await page.locator('.info-popup').waitFor();assert.match(await page.locator('.info-description').innerText(),/not both sides/);
  await page.keyboard.press('Escape');if(mobile)await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.close();
 }
});
