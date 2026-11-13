import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:3000';
const theme = page => page.locator('html').getAttribute('data-theme');
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('theme toggle persists across routes and reloads, fits all sizes and preserves trade state', async t => {
  const browser = await chromium.launch({headless:true});
  t.after(() => browser.close());
  for (const width of [375,768,1440]) await t.test(`${width}px`, async () => {
    const context = await browser.newContext({viewport:{width,height:1000}});
    await context.addInitScript(() => localStorage.setItem('hedgeveil.trade-tour.v2','seen'));
    const page = await context.newPage();
    const errors = [], posts = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => { if(r.method() === 'POST') posts.push(r.url()); });
    await page.goto(base, {waitUntil:'networkidle'});
    assert.equal(await theme(page), 'light');
    const toggle = page.getByRole('button',{name:'Switch to dark theme'});
    const bounds = await toggle.boundingBox();
    assert.ok(bounds.width >= 40 && bounds.height >= 40);
    await toggle.focus(); await page.keyboard.press('Enter');
    assert.equal(await theme(page), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('hedgeveil.theme')), 'dark');
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(17, 24, 19)');
    assert.ok(await noOverflow(page));
    await page.screenshot({path:`/tmp/hv-theme-home-dark-${width}.png`,fullPage:true});
    const response = await page.goto(base+'/trade?series=eta&claim=N&qty=2', {waitUntil:'networkidle'});
    assert.equal(await theme(page), 'dark');
    // The early theme script must work under the workspace's strict CSP.
    assert.ok(response.headers()['content-security-policy'].includes("'strict-dynamic'"));
    assert.ok(await page.locator('head script').evaluateAll(nodes => nodes.some(el => el.textContent.includes('hedgeveil.theme') && el.nonce)));
    const before = new URL(page.url()).search;
    await page.getByRole('button',{name:'Switch to light theme'}).click();
    assert.equal(await theme(page), 'light');
    assert.equal(new URL(page.url()).search, before);
    await page.getByRole('button',{name:'Switch to dark theme'}).click();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Switch to light theme'}).waitFor();
    await page.locator('.series-row[aria-pressed=true]').waitFor();
    assert.equal(await theme(page), 'dark');
    assert.equal(new URL(page.url()).search, before);
    assert.ok(await noOverflow(page));
    await page.screenshot({path:`/tmp/hv-theme-trade-dark-${width}.png`,fullPage:true});
    await page.locator('.desk-header').getByRole('button',{name:'Connect wallet',exact:true}).click();
    await page.getByRole('dialog',{name:'Connect your wallet'}).waitFor();
    await page.screenshot({path:`/tmp/hv-theme-wallet-dark-${width}.png`});
    await page.keyboard.press('Escape');
    for (const route of ['portfolio','funds','activity','liquidity']) {
      await page.goto(base+'/'+route,{waitUntil:'networkidle'});
      assert.equal(await theme(page),'dark');
      assert.ok(await noOverflow(page),route);
    }
    await page.getByRole('button',{name:'Switch to light theme'}).click();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Switch to dark theme'}).waitFor();
    assert.equal(await theme(page),'light');
    assert.deepEqual(errors,[]);
    assert.deepEqual(posts,[]);
    await context.close();
  });
});

test('theme works without local storage and synchronizes another open tab', async t => {
  const browser = await chromium.launch({headless:true});t.after(() => browser.close());
  const context = await browser.newContext();
  const first = await context.newPage(), second = await context.newPage();
  await first.goto(base);await second.goto(base);
  await first.getByRole('button',{name:'Switch to dark theme'}).click();
  await second.getByRole('button',{name:'Switch to light theme'}).waitFor();
  assert.equal(await theme(second),'dark');
  const blocked = await browser.newContext();
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {get() { throw new DOMException('Blocked','SecurityError'); }});
  });
  const page = await blocked.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.getByRole('button',{name:'Switch to dark theme'}).click();
  assert.equal(await theme(page),'dark');
  assert.deepEqual(errors,[]);
});
