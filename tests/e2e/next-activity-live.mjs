import { chromium } from "../../apps/web/node_modules/playwright/index.mjs";
import { build } from "../../apps/web/node_modules/esbuild/lib/main.js";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
// Read-only acceptance check: requires the local frontend and retained operation journal.
// The populated table is reviewed in an isolated harness; no wallet is impersonated.
const root = fileURLToPath(new URL("../..", import.meta.url)).replace(
  /\/$/,
  "",
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("PAGE ERROR", e.message);
});
await page.goto("http://127.0.0.1:3000");
await page.locator(".home-tweet").scrollIntoViewIfNeeded();
await page
  .locator(".home-tweet article")
  .filter({ hasText: /Building index-tracking assets/ })
  .first()
  .waitFor({ timeout: 20000 });
assert.match(
  await page.locator(".home-tweet").innerText(),
  /Building index-tracking assets/,
);
await page
  .locator(".home-tweet")
  .screenshot({ path: "/tmp/hedgeveil-tweet-light.png" });
const records = await page.evaluate(
  async () => (await (await fetch("/api/desk/operations")).json()).items,
);
assert.ok(records.length > 0);
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ActivityTable}from'${root}/apps/frontend/components/desk/ActivityTable.tsx';import{Modal}from'${root}/apps/frontend/components/desk/Modal.tsx';function App(){const[id,setId]=useState('');return <main className="desk-main" style={{padding:12}}><div className="desk-heading"><h1>Activity</h1></div><ActivityTable records={window.records} loading={false} busy={false} onDetails={setId} onRefresh={()=>{}}/>{id&&<Modal title="Operation details" onClose={()=>setId('')}><p>{id}</p></Modal>}</main>}createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await build({
  stdin: {
    contents: entry,
    loader: "tsx",
    resolveDir: root + "/apps/frontend",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  nodePaths: [root + "/apps/frontend/node_modules"],
});
await page.goto("http://127.0.0.1:3000/activity");
const sheets = await page
  .locator("link[rel=stylesheet]")
  .evaluateAll((els) => els.map((el) => el.href));
const css = (
  await Promise.all(
    sheets
      .filter((u) => u.startsWith("http://127.0.0.1"))
      .map(async (u) => (await page.request.get(u)).text()),
  )
).join("\n");
await page.route("**/activity-review", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><style>${css}</style></head><body class="desk-body"><div id="root"></div><script>window.records=${JSON.stringify(records).replaceAll("<", "\\u003c")}</script><script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body></html>`,
  }),
);
await page.goto("http://127.0.0.1:3000/activity-review");
await page.getByRole("table").waitFor();
assert.equal(
  await page.locator("tbody tr").count(),
  records.filter((r) => r.attempted).length,
);
await page.screenshot({ path: "/tmp/hedgeveil-activity-light.png" });
await page.getByRole("button", { name: /Drafts/ }).click();
assert.equal(
  await page.locator("tbody tr").count(),
  records.filter((r) => !r.attempted).length,
);
assert.match(await page.locator("tbody").innerText(), /Not sent/);
await page
  .getByRole("button", { name: /Details for/ })
  .first()
  .click();
await page.getByRole("dialog").waitFor();
await page.keyboard.press("Escape");
assert.equal(await page.getByRole("dialog").count(), 0);
assert.match(
  await page.evaluate(() => document.activeElement.getAttribute("aria-label")),
  /Details for/,
);
await page.getByRole("button", { name: /Transactions/ }).click();
await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/hedgeveil-activity-dark.png" });
for (const width of [375, 768]) {
  await page.setViewportSize({ width, height: 900 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `/tmp/hedgeveil-activity-${width}.png` });
}
await page.goto("http://127.0.0.1:3000/activity");
await page.getByRole("heading", { name: "Activity", exact: true }).waitFor();
assert.ok(
  (await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .count()) > 0,
);
await page.setViewportSize({ width: 375, height: 900 });
await page.goto("http://127.0.0.1:3000");
await page
  .locator(".home-tweet article")
  .filter({ hasText: /Building index-tracking assets/ })
  .first()
  .waitFor({ timeout: 20000 });
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
await page.waitForTimeout(600);
await page
  .locator(".home-tweet")
  .screenshot({ path: "/tmp/hedgeveil-tweet-dark-mobile.png" });
await page.route("**/api/tweet/*", (route) =>
  route.fulfill({ contentType: "application/json", body: '{"data":null}' }),
);
await page.reload();
await page
  .getByText("The post preview is unavailable right now.")
  .waitFor({ timeout: 15000 });
assert.equal(
  (await page.request.get("http://127.0.0.1:3000/api/tweet/123")).status(),
  404,
);
assert.deepEqual(errors, []);
console.log(
  JSON.stringify({
    records: records.length,
    submitted: records.filter((r) => r.attempted).length,
    drafts: records.filter((r) => !r.attempted).length,
    widths: [375, 768, 1440],
    checks:
      "table filters, modal Escape/focus, overflow, real tweet, fallback, unknown ID, no page errors",
  }),
);
await browser.close();
