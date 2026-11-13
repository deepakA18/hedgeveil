import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:3000';
// Uses the retained real backend. No balances, quotes, receipts or wallet accounts are fabricated.
test('workspace routes render real market data and fit mobile/tablet/desktop', async t => {
  const browser = await chromium.launch({headless:true});
  t.after(() => browser.close());
  for(const width of [375,768,1440]) await t.test(`${width}px`, async () => {
    const page = await workspacePage(browser,{viewport:{width,height:1000}});
    const errors=[];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {if(m.type()==='error') errors.push(m.text());});
    for(const route of ['trade','portfolio','funds','activity','liquidity','vault']) {
      const response=await page.goto(`${base}/${route}`,{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      assert.equal(await page.locator('h1').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} overflow at ${width}`);
      assert.equal(await page.locator('.desk-alert').count(),0,`${route}: ${await page.locator('.desk-alert').allTextContents()}`);
      assert.match(response.headers()['content-security-policy'],/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
      assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(247, 248, 242)');
      if(['portfolio','funds','activity'].includes(route)) assert.equal(await page.locator('.desk-header').getByRole('button',{name:'Connect wallet',exact:true}).count(),1);
      if(width===1440&&['trade','markets','liquidity'].includes(route)) await page.screenshot({path:`/tmp/hedgeveil-${route}-desktop.png`,fullPage:true});
      if(width===375&&route==='trade') await page.screenshot({path:'/tmp/hedgeveil-trade-mobile.png',fullPage:true});
    }
    assert.deepEqual(errors,[]);
    await page.close();
  });
});

test('trade deep links, synchronized payoff, wallet picker and client navigation',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await workspacePage(browser,);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base+'/trade?series=alpha&claim=P&side=SELL',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.series-row[aria-pressed=true]').getAttribute('data-series'),'alpha');
  assert.equal(await page.getByRole('button',{name:/Capped value/}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('heading',{name:'Exit position',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:/Capped value/}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:/NEAR upside/}).click();
  await page.waitForURL('**claim=N**');
  await page.locator('.scenario-chart svg[aria-label^="Upside payout"]').waitFor();
  assert.match(await page.locator('.scenario-chart svg').getAttribute('aria-label'),/Upside payout in USD/);
  await page.getByRole('button',{name:'NEAR',exact:true}).click();
  assert.match(await page.locator('.scenario-chart svg').getAttribute('aria-label'),/payout in NEAR/);
  const chart=page.locator('.scenario-chart svg');
  await chart.focus();await page.keyboard.press('End');
  assert.equal(await chart.getAttribute('aria-valuenow'),'10000');
  const bounds=await chart.boundingBox();
  await page.mouse.move(bounds.x+bounds.width*0.5,bounds.y+bounds.height*0.5);
  assert.ok(Number(await chart.getAttribute('aria-valuenow'))>4500&&Number(await chart.getAttribute('aria-valuenow'))<5500);
  assert.equal(await page.locator('.scenario-chart input[type=range]').count(),0);
  await page.getByRole('button',{name:/Capped value/}).click();
  await page.waitForURL('**claim=P**');
  assert.equal(await page.getByRole('button',{name:/Capped value/}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'Market closed',exact:true}).isDisabled(),true);
  const connect=page.locator('.desk-header').getByRole('button',{name:'Connect wallet',exact:true}).first();await connect.click();
  const dialog=page.getByRole('dialog',{name:'Connect your wallet'});await dialog.waitFor();
  const session=await page.evaluate(async()=>await (await fetch('/api/desk/session')).json());
  for(const wallet of session.manifest.wallets) assert.equal(await dialog.getByRole('button',{name:wallet.name,exact:true}).count(),1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);
  assert.equal(await connect.evaluate(el=>el===document.activeElement),true);
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('link',{name:/Portfolio/}).click();
  await page.waitForURL('**/portfolio');
  assert.equal(await page.locator('nav a[aria-current="page"]').innerText(),'Portfolio');
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('link',{name:/Trade/}).click();
  await page.waitForURL('**/trade');await page.waitForLoadState('networkidle');
  assert.deepEqual(errors,[]);
});

test('offline service fails visibly without substitute holdings or tradable offers',async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await workspacePage(browser,);
  // Failure injection only: no successful API response or wallet outcome is mocked.
  await page.route('**/api/desk/**',route=>route.abort('connectionrefused'));
  await page.goto(base+'/trade');
  await page.locator('.desk-alert[role=alert]').waitFor();
  assert.match(await page.locator('.desk-alert[role=alert]').innerText(),/wallet service is unavailable/);
  assert.equal(await page.locator('.desk-header').getByRole('button',{name:'Connect wallet',exact:true}).isDisabled(),true);
  assert.equal(await page.locator('tbody tr').count(),0);
  assert.equal(await page.locator('.series-row').count(),0);
});

test('deployed bridge and verified wallet executor boundaries',async()=>{
  const session=await fetch(base+'/api/desk/session');assert.equal(session.status,200);
  assert.match(session.headers.get('cache-control'),/no-store/);
  for(const path of ['/api/desk/submit','/api/desk/anything','/wallet-executors/anything.js']) {
    assert.equal((await fetch(base+path)).status,404);
  }
  assert.equal((await fetch(base+'/api/desk/state',{headers:{origin:'https://foreign.example'}})).status,403);
  assert.equal((await fetch(base+'/api/desk/prepare',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
  const lock=JSON.parse(await readFile(new URL('../../apps/web/wallets/lock.json',import.meta.url)));
  for(const item of lock.wallets) {
    const file=item.manifest.executor.split('/').at(-1);
    assert.ok(file,'lock file entry');
    const response=await fetch(base+'/wallet-executors/'+file);
    assert.equal(response.status,200);
    assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),item.sha256);
  }
  const first=await fetch(base+'/markets'),second=await fetch(base+'/markets');
  assert.notEqual(first.headers.get('content-security-policy'),second.headers.get('content-security-policy'));
  assert.match(first.headers.get('content-security-policy'), /connect-src [^;]*wss:\/\/mc\.meteorwallet\.app/);
  assert.match(first.headers.get('content-security-policy'), /font-src 'self' data:/);
  assert.match(first.headers.get('content-security-policy'), /frame-src 'self' https:\/\/wallet\.intear\.tech;/);
});


test('mobile menu, keyboard focus and exact balances remain usable', async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:375,height:900},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce'});
  const page=await context.newPage();await page.addInitScript(()=>localStorage.setItem("hedgeveil.trade-tour.v2","seen"));
  await page.goto(base+'/trade',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Open trade ticket',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'Trade NEAR',exact:true}).getByLabel('Quantity',{exact:true}).inputValue(),'1');
  const request=page.getByRole('button',{name:'Market closed',exact:true});
  assert.equal(await request.isDisabled(),true);
  const hint=await request.getAttribute('aria-describedby');
  assert.match(await page.locator('[id="'+hint+'"]').innerText(),/closed/);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog',{name:'Trade NEAR',exact:true}).waitFor({state:'hidden'});
  const menu=page.getByRole('button',{name:'Menu',exact:true});
  await menu.click();
  let dialog=page.getByRole('dialog',{name:'Navigate Hedgeveil'});
  assert.equal(await dialog.getByRole('link').count(),6);
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).overflow),'hidden');
  await page.keyboard.press('Escape');
  assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
  assert.notEqual(await page.locator('body').evaluate(el=>getComputedStyle(el).overflow),'hidden');
  await menu.click();
  await page.getByRole('dialog').getByRole('link',{name:'How pricing works',exact:true}).click();
  await page.waitForURL('**/liquidity');await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('dialog').count(),0);
  const amount=page.locator('.amount-trigger').first();
  await amount.waitFor();await amount.click();
  const exact=(await page.locator('.amount-exact code').first().innerText()).replace(/ NEAR$/,'');
  assert.match(exact,/^[0-9]+([.][0-9]+)?$/);
  await page.getByRole('button',{name:'Copy exact amount',exact:true}).click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),exact);
  assert.match(await page.locator('.amount-exact [role=status]').innerText(),/Exact amount copied/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
});

test('real spot is labelled indicative, stale/offline price never becomes zero, and scenarios remain explicitly illustrative',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await workspacePage(browser,{viewport:{width:390,height:1000}});
 await page.goto(base+'/trade?series=alpha',{waitUntil:'networkidle'});
 const response=await page.request.get(base+'/api/spot');
 assert.equal(response.status(),200,'live source must be available for this integration acceptance');
 const spot=await response.json();assert.equal(spot.source,'Coinbase Exchange');assert.equal(spot.product,'NEAR-USD');assert.ok(BigInt(spot.price)>0n);
 assert.ok(Date.now()-Date.parse(spot.observedAt)<=30000);
 assert.doesNotMatch(await page.locator('.spot-price').innerText(),/Indicative|Coinbase|old/);
 await page.getByRole('button',{name:'About NEAR price',exact:true}).click();
 assert.match(await page.locator('.info-description').innerText(),/Indicative price from Coinbase/);
 await page.keyboard.press('Escape');
 assert.match(await page.locator('.scenario-chart').innerText(),/Payout only/);
 assert.equal(await page.locator('.desk-header').getByRole('button',{name:'Connect wallet',exact:true}).count(),1);
 await page.getByRole('button',{name:/Capped value/}).click();await page.waitForURL('**claim=P**');
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.getByRole('button',{name:/Capped value/}).getAttribute('aria-pressed'),'true');
 await page.locator('.scenario-chart svg').focus();await page.keyboard.press('Home');
 assert.match(await page.locator('.scenario-chart figcaption').innerText(),/1 NEAR ≈ \$0.00/);
 await page.route('**/api/spot',r=>r.abort('connectionrefused'));
 await page.reload({waitUntil:'networkidle'});
 assert.match(await page.locator('.spot-price').innerText(),/Price unavailable/);
 assert.equal(await page.locator('.degraded-strip, .terminal-title').count(),0);
 await page.locator('.mobile-ticket-launch button').click();
 await page.getByRole('button',{name:'About Trading status',exact:true}).click();
 assert.match(await page.locator('.info-description').innerText(),/Spot stale or unavailable/);
 await page.keyboard.press('Escape');await page.locator('.info-popup').waitFor({state:'hidden'});
 await page.keyboard.press('Escape');
 assert.doesNotMatch(await page.locator('.scenario-chart svg').textContent(),/Spot \$/);
 assert.equal((await page.request.get(base+'/api/spot',{headers:{origin:'https://foreign.invalid'}})).status(),403);
});


test('terminal keeps real series history visible, exposes sampled evidence and uses Cult mobile drawer',async t=>{
 const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 const page=await workspacePage(browser,{viewport:{width:390,height:1000},reducedMotion:'reduce'});const mutations=[],errors=[];
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/desk/'))mutations.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/trade?series=eta&qty=2',{waitUntil:'networkidle'});
 await page.locator('.series-row').first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Help me choose',exact:true}).count(),0);
 assert.equal(await page.locator('.trade-controls select').count(),0);
 assert.match(await page.locator('.series-rail').innerText(),/Showing history/);
 assert.equal(await page.getByRole('tab',{name:'Samples',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('.settlement-disclosure, .terminal-center > .desk-details').count(),0);
 assert.equal(Math.round((await page.locator('.settled-outcome svg').boundingBox()).height),180);
 assert.ok((await page.locator('.settled-outcome').boundingBox()).height<310);
 for(const name of ['Samples','Backing','Terms']) {
  await page.getByRole('tab',{name,exact:true}).click();
  assert.equal(await page.getByRole('tabpanel',{name,exact:true}).evaluate(e=>e.scrollHeight>e.clientHeight),false);
 }
 await page.getByRole('tab',{name:'Samples',exact:true}).focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'Backing',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('tab',{name:'Samples',exact:true}).click();
 assert.equal(await page.locator('.sample-filled').count(),3);
 await page.getByRole('tab',{name:'Backing',exact:true}).click();
 assert.match(await page.locator('.series-backing').innerText(),/NEAR backing remaining/);
 assert.match(await page.locator('.series-backing').innerText(),/3\.89545[0-9]/);
 assert.match(await page.locator('.backing-table').innerText(),/Redeemed\s+0.1\s+0.05/);
 await page.getByRole('tab',{name:'Terms',exact:true}).click();
 assert.match(await page.locator('.settlement-terms').innerText(),/P 0.9909 \/ N 0.0091 NEAR/);
 await page.getByRole('tab',{name:'Samples',exact:true}).click();
 const settledChart=page.locator('.scenario-chart svg');
 assert.equal(await settledChart.getAttribute('role'),'slider');
 assert.match(await settledChart.textContent(),/Final \$3.71605/);
 assert.doesNotMatch(await settledChart.textContent(),/Spot/);
 assert.equal(await settledChart.locator('.scenario-final').count(),2);
 await page.getByRole('button',{name:'About Payout chart',exact:true}).click();
 assert.match(await page.locator('.info-description').innerText(),/set price \$3.6823/);
 await page.keyboard.press('Escape');
 assert.match(await settledChart.textContent(),/Payout in USD for 2 units/);
 assert.equal(await settledChart.locator('.scenario-y-tick').count(),2);
 const curve=await settledChart.locator('.scenario-curve').getAttribute('d');
 for(const point of curve.matchAll(/[ML]([0-9.]+),([0-9.]+)/g)) assert.ok(Number(point[2])>=35&&Number(point[2])<=160);
 const fixed=await page.locator('.scenario-chart figcaption').innerText();
 await settledChart.hover({position:{x:80,y:80}});
 assert.match(await page.locator('.scenario-tooltip').innerText(),/Hypothetical.*settlement unchanged/s);
 assert.match(await page.locator('.scenario-tooltip').innerText(),/If NEAR finishes at.*NEAR ≈/s);
 await settledChart.focus();await page.keyboard.press('End');
 assert.match(await page.locator('.scenario-tooltip').innerText(),/\$11.15/);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('.scenario-tooltip').count(),0);
 assert.equal(await page.locator('.scenario-chart figcaption').innerText(),fixed);
 assert.equal(await page.locator('.scenario-table').count(),0);
 assert.match(await page.locator('.series-row[data-series=eta]').innerText(),/of final price/);
 assert.match(await page.locator('.series-row[data-series=delta]').innerText(),/Missing samples 2, 3/);
 assert.doesNotMatch(await page.locator('.sample-slots').innerText(),/ago/);
 assert.match(await page.locator('.series-row[data-series=alpha]').innerText(),/Window elapsed without reports/);
 assert.equal(await page.getByRole('group',{name:'Trade side'}).getByRole('button',{name:'Buy',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('group',{name:'Trade side'}).getByRole('button',{name:'Sell',exact:true}).isDisabled(),true);
 assert.match(await settledChart.locator('.scenario-key-tick').allTextContents().then(x=>x.join(' ')),/K \$3.6823.*Final \$3.71605/);
 assert.equal(await page.locator('.scenario-chart svg').count(),1);
 const launch=page.getByRole('button',{name:'Open trade ticket',exact:true});await launch.click();
 const drawer=page.getByRole('dialog',{name:'Trade NEAR',exact:true});await drawer.waitFor();
 assert.equal(await drawer.getByLabel('Quantity',{exact:true}).inputValue(),'2');
 assert.equal(await drawer.getByRole('button',{name:'Market closed',exact:true}).isDisabled(),true);
 assert.match(await drawer.locator('.execution-gate[data-reason=NO_OPEN_SERIES]').innerText(),/closed/);
 assert.deepEqual(await drawer.locator('.quote-unavailable dd').allTextContents(),['—','—','—','—']);
 await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});
 assert.equal(await launch.evaluate(el=>el===document.activeElement),true);
 await page.getByLabel('More detail',{exact:true}).check();
 assert.ok(await page.locator('.series-expert').count()>0);
 assert.match(await page.locator('.scenario-chart svg').getAttribute('aria-label'),/payout in NEAR/);
 await page.getByRole('tab',{name:'Activity',exact:true}).click();
 assert.match(await page.getByRole('tabpanel',{name:'Activity',exact:true}).innerText(),/Connect your wallet/);
 await page.getByRole('tab',{name:'Positions',exact:true}).focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'Orders',exact:true}).getAttribute('aria-selected'),'true');
 await page.locator('.series-row[data-series=alpha]').click();
 assert.match(await page.locator('.settlement-panel').innerText(),/[Nn]o guaranteed completion time/);
 assert.doesNotMatch(await page.locator('.series-row[data-series=alpha]').innerText(),/Final price pending/);
 await page.getByRole('button',{name:'Merge matching pairs',exact:true}).click();
 const exitDrawer=page.getByRole('dialog',{name:'Trade NEAR',exact:true});
 const merge=exitDrawer.getByRole('button',{name:'Connect wallet to merge',exact:true});
 assert.equal(await merge.isDisabled(),false);
 assert.equal(await exitDrawer.locator('.primary-exit').count(),1);
 await merge.click();
 await page.getByRole('dialog',{name:'Connect your wallet',exact:true}).waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Capped value',exact:true}).click();await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.getByRole('button',{name:'Capped value',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.getByRole('button',{name:'Review trade',exact:true}).count(),0);
 assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
});

test('wallet picker fits three widths with local logos, keyboard focus and no transaction requests', async t => {
  const browser = await chromium.launch({headless:true});
  t.after(() => browser.close());
  for (const width of [375,768,1440]) {
    const page=await workspacePage(browser,{viewport:{width,height:900},reducedMotion:'reduce'});
    const mutations=[],errors=[];
    page.on('request', r=>{if(r.method()==='POST')mutations.push(r.url());});
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto(base+'/portfolio',{waitUntil:'networkidle'});
    const trigger=page.locator('.desk-header').getByRole('button',{name:'Connect wallet',exact:true});
    await trigger.click();
    const dialog=page.getByRole('dialog',{name:'Connect your wallet',exact:true});
    await dialog.waitFor();
    assert.equal(await dialog.locator('.wallet-logo').count(),2);
    for(const logo of await dialog.locator('.wallet-logo').all()) {
      assert.ok(await logo.evaluate(el=>el.complete&&el.naturalWidth>0));
      assert.match(await logo.getAttribute('src'),/^\/wallets\//);
    }
    assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false);
    const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.getByRole('button',{name:'Meteor Wallet',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.getByRole('button',{name:'Intear Wallet',exact:true}).evaluate(el=>el===document.activeElement),true);
    await page.screenshot({path:`/tmp/hedgeveil-wallet-${width}.png`});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').count(),0);
    assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
    assert.deepEqual(mutations,[]);assert.deepEqual(errors,[]);
    await page.close();
  }
});

async function workspacePage(browser, options) { const page=await browser.newPage(options); await page.addInitScript(()=>localStorage.setItem("hedgeveil.trade-tour.v2","seen")); return page; }

test('workspace panels resize by dragging edges and preserve trade state',async t=>{
 const browser=await chromium.launch();t.after(()=>browser.close());
 for(const width of [390,1440,2400]){
  const page=await workspacePage(browser,{viewport:{width,height:1000},reducedMotion:'reduce'});const posts=[],errors=[];
  page.on('request',r=>{if(r.method()==='POST')posts.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/trade?series=eta&qty=2&claim=P',{waitUntil:'networkidle'});
  const header=await page.locator('.desk-header').boundingBox(),grid=await page.locator('.terminal-grid').boundingBox();
  assert.equal(Math.round(header.x),0);assert.equal(Math.round(header.width),width);assert.equal(grid.x,0);assert.equal(grid.width,width);assert.ok(Math.abs(grid.y-header.y-header.height)<1);
  assert.equal(await page.locator('.panel-controls,.dock-collapse').count(),0);
  const meetsFooter=async()=>{const dock=await page.locator('.trading-dock').boundingBox(),footer=await page.locator('.site-footer').boundingBox();assert.ok(Math.abs(dock.y+dock.height-footer.y)<2,'account panel meets footer');if(width>=1024)assert.ok(Math.abs(footer.y+footer.height-1000)<2,'fills viewport');};
  await meetsFooter();
  if(width>=1024){
   const drag=async(name,dx,dy)=>{const handle=page.getByRole('separator',{name,exact:true});await handle.scrollIntoViewIfNeeded();const b=await handle.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:8});await page.mouse.up();};
   const beforeLeft=(await page.locator('.series-rail').boundingBox()).width;
   await drag('Resize markets panel',80,0);
   assert.ok(Math.abs((await page.locator('.series-rail').boundingBox()).width-beforeLeft-80)<2);
   const beforeRight=(await page.locator('.terminal-ticket').boundingBox()).width;
   await drag('Resize trade ticket',-70,0);
   assert.ok(Math.abs((await page.locator('.terminal-ticket').boundingBox()).width-beforeRight-70)<2);
   const beforeHeight=(await page.locator('.terminal-grid').boundingBox()).height;
   const beforeDock=(await page.locator('.trading-dock').boundingBox()).height;
   await drag('Resize trading and account panels',0,-90);
   assert.ok(Math.abs((await page.locator('.terminal-grid').boundingBox()).height-beforeHeight+90)<2);
   assert.ok((await page.locator('.trading-dock').boundingBox()).height>beforeDock+80);
   await meetsFooter();
   const left=page.getByRole('separator',{name:'Resize markets panel',exact:true});await left.focus();await page.keyboard.press('Home');
   assert.equal(Number(await left.getAttribute('aria-valuenow')),200);
   await page.keyboard.press('ArrowRight');assert.equal(Number(await left.getAttribute('aria-valuenow')),210);
   await left.dblclick();assert.equal(Number(await left.getAttribute('aria-valuenow')),300);
   await page.setViewportSize({width:1024,height:800});
   await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
   assert.ok((await page.locator('.terminal-center').boundingBox()).width>=319);
   await page.setViewportSize({width,height:1000});
  }else assert.equal(await page.getByRole('separator').count(),0);
  assert.equal(await page.getByRole('button',{name:'Capped value',exact:true}).getAttribute('aria-pressed'),'true');
  if(width>=1024)assert.equal(await page.getByLabel('Quantity',{exact:true}).inputValue(),'2');
  else {await page.locator('.mobile-ticket-launch button').click();assert.equal(await page.getByLabel('Quantity',{exact:true}).inputValue(),'2');await page.keyboard.press('Escape');}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`/tmp/hv-drag-panels-${width}.png`});
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);await page.close();
 }
});
