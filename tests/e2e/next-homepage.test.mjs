import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
import {payoff} from '../../apps/web/public/model.mjs';
import {payoffPath} from '../../apps/frontend/lib/payoff-illustration.ts';
import {getDeskUrl} from '../../apps/frontend/lib/config.ts';

const base = process.env.FRONTEND_TEST_URL ?? 'http://127.0.0.1:3000';

test('illustration matches exact shared payoff math across the plotted range', () => {
  const Q = 10n ** 24n;
  for (const side of ['upside', 'capped']) {
    const points = payoffPath(side).split(' ');
    assert.equal(points.length, 381);
    for (let i = 0; i < points.length; i++) {
      const [, y] = points[i].slice(1).split(',').map(Number);
      const result = payoff(String(Q), String(BigInt(i + 20) * Q / 100n));
      const value = Number(result[side === 'capped' ? 'p' : 'n']) / Number(Q);
      assert.ok(Math.abs(y - (220 - value * 172)) <= 0.0051, `${side} at point ${i}`);
    }
  }
});

test('frontend destination rejects credentials and unsafe URL schemes', () => {
  const original = process.env.HEDGEVEIL_DESK_URL;
  try {
    for (const url of ['javascript:alert(1)', 'http://example.com/app', 'https://name:secret@example.com/app', 'https://example.com/app?token=secret']) {
      process.env.HEDGEVEIL_DESK_URL = url;
      assert.throws(getDeskUrl);
    }
    delete process.env.HEDGEVEIL_DESK_URL;
    assert.equal(getDeskUrl(), 'http://127.0.0.1:8794/app#trade');
  } finally {
    if (original === undefined) delete process.env.HEDGEVEIL_DESK_URL;
    else process.env.HEDGEVEIL_DESK_URL = original;
  }
});

test('Next homepage renders, hydrates and retains keyboard interactions across sizes', async t => {
  const browser = await chromium.launch({headless:true});
  t.after(() => browser.close());
  for (const width of [375, 768, 1440]) await t.test(`${width}px`, async () => {
    const page = await browser.newPage({viewport:{width,height:1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if(msg.type()==='error') errors.push(msg.text()); });
    const response = await page.goto(base, {waitUntil:'networkidle'});
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('h1').innerText(), 'Options on NEAR.\nYour exposure. Your choice.');
    assert.equal(await page.locator('script[src*="/_next/"]').count() > 0, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.hero').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(247, 248, 242)');
    const capped = page.getByRole('button', {name:'Capped value',exact:true});
    await capped.focus(); await page.keyboard.press('Enter');
    assert.equal(await capped.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#capped-curve').getAttribute('visibility'), 'visible');
    assert.match(await page.locator('#plot-title').textContent(), /Capped-value/);
    await page.getByRole('button', {name:'Upside',exact:true}).click();
    assert.equal(await page.locator('#upside-curve').getAttribute('visibility'), 'visible');
    for (const [index, expected] of [[1, 'Follow NEAR’s value, up to a limit.'], [2, 'Choose when to request an exit.'], [0, 'If NEAR finishes above your chosen price.']]) {
      const button=page.locator(`[data-step="${index}"]`);
      await button.focus();await page.keyboard.press('Space');
      assert.equal(await page.locator('#step-title').innerText(), expected);
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
    }
    assert.equal(await page.locator('details').count(), 7);
    await page.locator('summary').first().focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('details').first().getAttribute('open'), '');
    assert.equal(await page.locator('a[href="http://127.0.0.1:8794/app#trade"]').count(), 4);
    if(width===1440) await page.screenshot({path:'/tmp/hedgeveil-next-desktop.png',fullPage:true});
    if(width===375) await page.screenshot({path:'/tmp/hedgeveil-next-mobile.png',fullPage:true});
    assert.deepEqual(errors, []);
    await page.close();
  });
});

test('home alias redirects and unknown pages return an actual 404', async () => {
  const home = await fetch(base + '/home', {redirect:'manual'});
  assert.equal(home.status, 307);
  assert.equal(home.headers.get('location'), '/');
  const missing = await fetch(base + '/does-not-exist');
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Page not found/);
});

test('content and FAQs remain usable without JavaScript', async t => {
  const browser = await chromium.launch({headless:true});
  t.after(() => browser.close());
  const page=await browser.newPage({javaScriptEnabled:false});
  await page.goto(base);
  assert.equal(await page.locator('h1').count(),1);
  await page.locator('summary').first().click();
  assert.equal(await page.locator('details').first().getAttribute('open'),'');
  assert.equal(await page.locator('.hero-actions .button').first().getAttribute('href'),'http://127.0.0.1:8794/app#trade');
});
