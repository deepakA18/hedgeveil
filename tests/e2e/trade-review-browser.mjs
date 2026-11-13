import assert from 'node:assert/strict';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
import {build} from '../../apps/web/node_modules/esbuild/lib/main.js';
// Isolated component test with explicit fixture data; never contacts a wallet or
// substitutes market data in the actual app. Production styles are read only.
const root=process.cwd(),browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3000/trade');
 const sheets=await page.locator('link[rel=stylesheet]').evaluateAll(es=>es.map(e=>e.href));
 const css=(await Promise.all(sheets.map(async u=>(await page.request.get(u)).text()))).join('\n');
 const stubNames=['ServiceStatus','TradeTour','ScenarioChart','QuoteSummary','SeriesList','SettlementPanel','ScenarioTable','SeriesPositionContext','BalanceGrid','TradingDock'];
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{Trade}from'${root}/apps/frontend/components/desk/Trade.tsx';const now=Date.now();window.reviews=[];window.clockNow=now;window.d={account:'test-owner.testnet',series:[{config:{series_id:'fixture',strike:'3000000000000',maturity_ns:String(BigInt(now+3600000)*1000000n)},final_price:null}],live:{accounts:{'test-owner.testnet':{free:'1000000000000000000000000'}}},ready:true,state:{health:{risk_allowed:true},items:[]},checkedAtMono:performance.now(),clock:{serverMs:now,receivedAt:performance.now()},review:async input=>{window.reviews.push(input);document.getElementById('review-result').textContent='Exact trade review ready';},setError:console.error};createRoot(document.getElementById('root')).render(<Trade/>);`;
 const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:root+'/apps/frontend'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},nodePaths:[root+'/apps/frontend/node_modules'],plugins:[{name:'isolated-desk',setup(b){
 b.onResolve({filter:/DeskProvider$/},()=>({path:'desk',namespace:'test'}));
 b.onResolve({filter:/next\/navigation$/},()=>({path:'navigation',namespace:'test'}));
 b.onResolve({filter:/WorkspaceResize$/},()=>({path:'resize',namespace:'test'}));
 b.onResolve({filter:new RegExp('/('+stubNames.join('|')+')$')},a=>({path:a.path.split('/').pop(),namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},a=>({loader:'js',contents:a.path==='desk'?`export const useDesk=()=>window.d;export const LegList=()=>null;`:a.path==='navigation'?`const params=new URLSearchParams('series=fixture&claim=P&qty=0.01');export const useSearchParams=()=>params;`:a.path==='resize'?`export const useWorkspaceResize=()=>({style:{},gridRef:null});`:`export const ${a.path}=()=>null;`}));
 }}]});
 await page.route('**/trade-review-harness',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>${css}</style></head><body class="desk-body"><div id="root"></div><p id="review-result"></p><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`}));
 let calls=0,respond;let scenario='success';
 await page.route('**/api/desk/quotes',async route=>{
  calls++;const request=route.request().postDataJSON();
  if(scenario==='late')await new Promise(r=>respond=r);
  if(scenario==='busy'||(scenario==='retry'&&calls===1))return route.fulfill({json:{items:[{quote:null,reason:'MAKER_MAINTENANCE'}]}});
  const now=await page.evaluate(()=>window.clockNow);const q=gross=>({quote:{maker:'test-maker',taker:request.taker,expiry_ns:String(BigInt(now+60000)*1000000n),fee:{amount:'100'},maker_gives:[{asset:request.asset,amount:request.amount}],taker_gives:[{asset:{kind:'COLLATERAL'},amount:gross}]}});
  await route.fulfill({json:{items:[q('9000'),q('8000')]}});
 });
 async function reset(){await page.goto('http://127.0.0.1:3000/trade-review-harness');await page.getByRole('button',{name:'Review trade',exact:true}).waitFor();calls=0;}
 await reset();assert.equal(await page.getByRole('button',{name:/Request offers|Refresh offers/}).count(),0);
 await page.getByRole('button',{name:'Review trade',exact:true}).click();await page.getByText('Exact trade review ready').waitFor();
 assert.equal(calls,1);assert.equal(await page.evaluate(()=>window.reviews.length),1);assert.equal(await page.evaluate(()=>window.reviews[0].args.quote.taker_gives[0].amount),'8000');
 await page.screenshot({path:'/tmp/hedgeveil-combined-review-light.png'});
 scenario='retry';await reset();await page.getByRole('button',{name:'Review trade',exact:true}).click();await page.getByText('Exact trade review ready').waitFor();assert.equal(calls,2);
 scenario='busy';await reset();await page.getByRole('button',{name:'Review trade',exact:true}).click();await page.getByText('Offers are briefly paused while maker inventory is updated. Try again shortly.').waitFor();assert.equal(calls,2);assert.equal(await page.evaluate(()=>window.reviews.length),0);
 scenario='late';await reset();await page.getByRole('button',{name:'Review trade',exact:true}).click();await page.waitForFunction(()=>document.querySelector('form').getAttribute('aria-busy')==='true');assert.equal(await page.locator('form button[type=submit]').isDisabled(),true);
 await page.getByRole('button',{name:'NEAR upside',exact:true}).click();while(!respond)await new Promise(r=>setTimeout(r,10));respond();await page.waitForFunction(()=>document.querySelector('form').getAttribute('aria-busy')==='false');assert.equal(await page.evaluate(()=>window.reviews.length),0);
 for(const width of [1440,768,375]){
  await page.setViewportSize({width,height:1000});
  if(width<1024){await page.getByRole('button',{name:'Open trade ticket',exact:true}).click();await page.getByRole('dialog').waitFor();}
  for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`/tmp/hedgeveil-review-${width}-${theme}.png`});}
  if(width<1024)await page.keyboard.press('Escape');
 }
 assert.deepEqual(errors,[]);console.log('PASS: real Trade component in isolated fixture harness: one-click review, best price, bounded retry, no review on failure/late selection, loading lock, mobile and both themes. No wallet or chain action.');
}finally{await browser.close();}
