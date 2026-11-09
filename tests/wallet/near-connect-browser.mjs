// Real connector/iframe in Chromium. Signing uses a named fixture and real local
// Sandbox receipts; this is not Meteor/Intear or public-testnet acceptance.
import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {parseArgs} from 'node:util';
import {build} from '../../apps/web/node_modules/esbuild/lib/main.js';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
import {startWallet} from '../../apps/web/wallet.mjs';
import {startDemo} from '../../apps/web/demo.mjs';
import {createApp} from '../../apps/web/server.mjs';
import {canonical} from '../../packages/sdk/intent.mjs';
const report={scope:'NEAR Connect 0.12.0 in Chromium with controlled iframe fixture; actual local Sandbox receipts. No external-wallet/public-testnet acceptance or independent review.',passed:false,checks:[],operations:[],sources:{}};
const {values:options}=parseArgs({options:{report:{type:'string',default:'research/reports/g7-near-connect-browser.json'}}});
const check=(name,a,b)=>{assert.deepEqual(a,b,name);report.checks.push(name);console.log('PASS',name);};
const manifest={version:'test-fixture',wallets:[{id:'fixture',name:'Controlled fixture',type:'sandbox',version:'1',icon:'',executor:'/fixture.js',features:{testnet:true,signInWithoutAddKey:true,signAndSendTransaction:true},permissions:{}}]};
let app,browser,demo,server,request,sends=0,lastHash,fixtureDir;
try{
    app=await startWallet({port:0});browser=await chromium.launch();
    const productionPage=await browser.newPage();await productionPage.goto(app.url);
    await productionPage.getByRole('heading',{name:'Connect your testnet wallet.'}).waitFor();
    for(const width of [375,768,1280]){
        await productionPage.setViewportSize({width,height:900});await productionPage.locator('#connect').click();
        await productionPage.getByRole('button',{name:'Meteor Wallet',exact:true}).waitFor();
        await productionPage.getByRole('button',{name:'Intear Wallet',exact:true}).waitFor();
        assert(await productionPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await mkdir('target',{recursive:true});await productionPage.screenshot({path:`target/near-connect-wallets-${width}.png`,fullPage:true});
        await productionPage.keyboard.press('Escape');
    }
    check('production picker contains only the two pinned wallets at three widths',await productionPage.locator('#wallet-choices button').count(),2);
    await productionPage.close();const page=await browser.newPage();
    const violations=[];await page.exposeFunction('recordViolation',v=>violations.push(v));
    await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.recordViolation(e.violatedDirective)));
    const fixture=`window.selector.ready({signIn:async()=>[{accountId:'alice.testnet'},{accountId:'bob.testnet'}],getAccounts:async()=>[{accountId:'alice.testnet'},{accountId:'bob.testnet'}],signOut:async()=>{throw Error('lost sign-out response')},signAndSendTransaction:async()=>{throw Error('fixture connection only')}});`;
    await page.route('**/api/session',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({response,json:{...data,manifest}});});
    await page.route('**/fixture.js*',route=>route.fulfill({contentType:'text/javascript',body:fixture}));
    await page.goto(app.url);await page.getByRole('heading',{name:'Connect your testnet wallet.'}).waitFor();
    check('wallet desk visibly labels testnet and disables unconfigured transactions',[(await page.locator('.badge').innerText()).includes('TESTNET'),await page.locator('#fund').count()],[true,0]);
    for(const width of [375,768,1280]){await page.setViewportSize({width,height:900});await page.locator('#connect').click();await page.getByRole('heading',{name:'Connect a testnet wallet'}).waitFor();check(`wallet dialog fits ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await mkdir('target',{recursive:true});await page.screenshot({path:`target/near-connect-${width}.png`,fullPage:true});await page.keyboard.press('Escape');assert(await page.locator('#connect').evaluate(e=>e===document.activeElement));}
    await page.locator('#connect').click();await page.getByRole('button',{name:'Controlled fixture'}).click();await page.waitForFunction(()=>document.querySelector('#account').options.length===3);
    check('multiple accounts require an explicit choice',await page.locator('#account').inputValue(),'');
    await page.locator('#account').selectOption('bob.testnet');await page.getByRole('heading',{name:'Your wallet is connected.'}).waitFor();
    check('selected account is shown without enabling unconfigured funding',[(await page.locator('main').innerText()).includes('bob.testnet'),await page.locator('#fund').count()],[true,0]);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#account').options.length===3);
    check('reload restores connected wallet but requires multi-account selection again',await page.locator('#account').inputValue(),'');
    await page.locator('#disconnect').click();await page.getByRole('heading',{name:'Connect your testnet wallet.'}).waitFor();
    check('disconnect clears account selection',await page.locator('#account').inputValue(),'');
    await page.reload();await page.getByRole('heading',{name:'Connect your testnet wallet.'}).waitFor();
    check('failed vendor sign-out cannot restore the local connection on reload',await page.evaluate(()=>localStorage.getItem('hedgeveil:testnet:connect:selected-wallet')),null);
    check('actual connector iframe runs under wallet-mode CSP',violations,[]);
    check('unconfigured gateway rejects prepare',(await fetch(app.url+'/api/prepare',{method:'POST',headers:{origin:app.url,'content-type':'application/json'},body:'{}'}).then(r=>r.json())).error,'DEPLOYMENT_NOT_CONFIGURED');
    check('cross-origin wallet API writes are rejected',(await fetch(app.url+'/api/handoff',{method:'POST',headers:{origin:'https://evil.invalid','content-type':'application/json'},body:'{}'})).status,403);
    await app.stop();app=null;

    // HTTP gateway fault fixture. No transaction is broadcast or called successful here.
    fixtureDir=await mkdtemp(join(tmpdir(),'hv-connect-gateway-'));
    const config={network:'testnet',chain_id:'testnet',rpc_url:'https://rpc.testnet.near.org/',contract_id:'core.testnet',genesis_hash:'1'.repeat(32),code_hash:'1'.repeat(32)};
    const gateway=createApp({config,journal:fixtureDir,wallet:{assets:new Map(),manifest},store:{read:async()=>({health:{risk_allowed:false}})}});
    gateway.client.rpc.verify=async()=>{};
    gateway.client.rpc.request=async(method,p)=>{
        if(method==='block')return {header:{hash:'fixture-block',timestamp_nanosec:'1'}};
        if(method==='gas_price')return {gas_price:'1'};
        if(method==='tx')throw Error('fixture RPC outage');
        if(p.request_type==='view_account')return {amount:'1000000000000000000000000000',storage_usage:0};
        const values={get_account:{free:'0',storage_paid:'1',closing:false},list_series:[],get_vault:null,storage_quote:{storage_byte_cost:'1',account_minimum:'1'},list_tickets:[{id:'0',state:'SUCCEEDED'}],vault_risk:null,get_pauses:{}};
        return {block_hash:'fixture-block',result:[...Buffer.from(JSON.stringify(values[p.method_name]))]};
    };
    await new Promise(r=>gateway.server.listen(0,'127.0.0.1',r));
    const gatewayUrl=`http://127.0.0.1:${gateway.server.address().port}`;
    app={stop:()=>new Promise(r=>gateway.server.close(r))};
    const post=async(path,data)=>fetch(gatewayUrl+'/api/'+path,{method:'POST',headers:{origin:gatewayUrl,'content-type':'application/json'},body:JSON.stringify(data)}).then(r=>r.json());
    const blocked=await post('prepare',{signer_id:'alice.testnet',method:'deposit_collateral',args:{},attached_deposit:'1'});
    check('gateway fixture preserves unhealthy-indexer funding gate',blocked.blockers.includes('INDEXER_UNHEALTHY'),true);
    check('blocked handoff never consumes attempt',(await post('handoff',{id:blocked.intent.operation_id})).error,'INDEXER_UNHEALTHY');
    assert.equal((await gateway.client.record(blocked.intent.operation_id)).attempted,false);
    const exit=await post('prepare',{signer_id:'alice.testnet',method:'close_ticket',args:{ticket_id:'0'}}),id=exit.intent.operation_id;
    check('gateway fixture leaves verified exit preview available',exit.blockers,[]);
    const handoffs=await Promise.all([post('handoff',{id}),post('handoff',{id})]);
    check('concurrent HTTP handoffs have one durable winner',handoffs.filter(r=>r.operationId===id).length,1);
    check('browser-wallet profile never invokes server submit',(await post('submit',{id})).error,'BROWSER_WALLET_REQUIRED');
    await post('remember-hash',{id,hash:'1'.repeat(32)});
    check('hint survives gateway recovery outage without claiming success',(await post('recover',{id})).state,'SUBMISSION_UNKNOWN');
    check('attempted wallet action cannot be cancelled or reauthorized',(await post('cancel',{id})).error,'ALREADY_ATTEMPTED');
    await app.stop();app=null;

    const bundle=await build({stdin:{contents:`export {NearConnector} from './apps/web/node_modules/@hot-labs/near-connect/build/index.js';export {nearConnectSigner} from './packages/sdk/near-connect.mjs';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
    server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/bundle.mjs'?'text/javascript':'text/html');res.end(req.url==='/bundle.mjs'?bundle.outputFiles[0].contents:'<!doctype html><title>Controlled Sandbox connector fixture</title>');});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
    demo=await startDemo({poll:false});const client=demo.app.client,user=demo.accounts[0].id;
    const runtimePage=await browser.newPage();await runtimePage.exposeFunction('fixtureSend',async p=>{
        const a=p.actions[0].params;
        const actual={signerId:p.signerId,receiverId:p.receiverId,network:p.network,operationId:request.operationId,actions:[{type:'FunctionCall',methodName:a.methodName,args:a.args,gas:a.gas,deposit:a.deposit}]};
        assert.equal(canonical(actual),canonical(request));sends++;const out=await demo.realSigner(request,async()=>{});lastHash=out.hash;
        return {transaction:{hash:out.hash,signer_id:p.signerId,receiver_id:p.receiverId}};
    });
    await runtimePage.route('**/fixture.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.selector.ready({signIn:async()=>[{accountId:${JSON.stringify(user)}}],getAccounts:async()=>[{accountId:${JSON.stringify(user)}}],signOut:async()=>{},signAndSendTransaction:async p=>{const r=await window.fixtureSend(p);if(p.actions[0].params.deposit==='1000000000000000000000001')throw Error('response lost after real broadcast');return r;}});`}));
    await runtimePage.goto(origin);
    await runtimePage.evaluate(async({manifest,user})=>{const m=await import('/bundle.mjs');window.connector=new m.NearConnector({network:'sandbox',autoConnect:false,manifest});await connector.connect({walletId:'fixture'});window.sign=m.nearConnectSigner({connector,selected:()=>({wallet:'fixture',account:user}),allowedWallets:['fixture'],returnUrl:location.origin+'/'});},{manifest,user});
    for(const [method,deposit] of [['storage_deposit','40960000000000000000000'],['deposit_collateral','1000000000000000000000001']]){
        const i=await client.prepare({signer_id:user,method,args:{},attached_deposit:deposit});request=await client.handoff(i.operation_id);
        const result=await runtimePage.evaluate(async r=>{try{return await window.sign(r);}catch(e){return {error:e.code};}},request);
        if(result.hash)await client.rememberHash(i.operation_id,result.hash);
        const r=await client.recover(i.operation_id);
        if(method==='storage_deposit')check('real connector iframe sends storage registration and SDK confirms receipts',r.state,'SUCCEEDED');
        else{
            check('lost response after real deposit stays unknown',r.state,'SUBMISSION_UNKNOWN');
            await assert.rejects(client.handoff(i.operation_id),/ALREADY_ATTEMPTED/);
            const recovered=await client.recover(i.operation_id,lastHash);check('matching hash recovers actual deposit without another wallet send',recovered.state,'SUCCEEDED');
        }
        report.operations.push({intent:i,result:await client.recover(i.operation_id)});
    }
    check('one send per retained operation despite lost wallet response',sends,2);
    check('exact one-yocto precision survives connector serialization',(await client.balances(user)).account.free,'1000000000000000000000001');
    report.passed=true;report.transactions=demo.transactions.length;
}finally{
    await browser?.close();await app?.stop();if(server)await new Promise(r=>server.close(r));await demo?.stop();if(fixtureDir)await rm(fixtureDir,{recursive:true,force:true});
    for(const f of ['packages/sdk/near-connect.mjs','apps/web/public/wallet.mjs','apps/web/public/app.mjs','apps/web/server.mjs','apps/web/wallets/lock.json','apps/web/package-lock.json','tests/wallet/near-connect-browser.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
    await writeFile(options.report,JSON.stringify(report,null,2)+'\n');
}
