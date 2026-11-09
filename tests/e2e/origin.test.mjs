import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {startWallet} from '../../apps/web/wallet.mjs';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';

// Node fetch overwrites Sec-Fetch-Mode with "cors". Use raw HTTP for the header matrix.
function http(url,{method='GET',headers={},body}={}){
    return new Promise((resolve,reject)=>{
        const req=request(url,{method,headers},res=>{
            let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);
            res.on('end',()=>resolve({status:res.statusCode,text:async()=>text,json:async()=>JSON.parse(text)}));
            res.on('error',reject);
        });req.on('error',reject);req.end(body);
    });
}

test('cross-site links load the wallet document; API and write guards stay strict',async t=>{
    const app=await startWallet({port:0});
    t.after(()=>app.stop());
    const navigation={'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'};
    const cases=[
        ['direct address-bar load','/',{},200],
        ['external top-level link','/',navigation,200],
        ['wallet redirect with recovery hints','/?hv_operation='+'a'.repeat(64)+'&transactionHashes='+'1'.repeat(32),navigation,200],
        ['external fetch of root','/',{'sec-fetch-site':'cross-site','sec-fetch-mode':'cors','sec-fetch-dest':'empty'},403],
        ['external iframe','/',{...navigation,'sec-fetch-dest':'iframe'},403],
        ['external script load','/app.mjs',navigation,403],
        ['external navigation to session API','/api/session',navigation,403],
        ['external navigation to journal','/api/operations',navigation,403],
        ['foreign Origin still blocked','/',{...navigation,origin:'https://outside.invalid'},403],
        ['null Origin still blocked','/',{...navigation,origin:'null'},403],
        ['foreign Host still blocked','/',{...navigation,host:'outside.invalid'},403],
        ['same-origin session request','/api/session',{origin:app.url,'sec-fetch-site':'same-origin'},200],
    ];
    for(const [name,path,headers,status] of cases)await t.test(name,async()=>{
        const r=await http(app.url+path,{headers});assert.equal(r.status,status);
        if(status===403)assert.deepEqual(await r.json(),{error:'LOCAL_ORIGIN_ONLY'});
        else if(path.startsWith('/?')||path==='/')assert.match(await r.text(),/<title>Hedgeveil/);
    });
    for(const path of ['prepare','handoff','submit','recover','remember-hash','cancel','quotes']){
        for(const [name,headers,status] of [
            ['foreign origin',{...navigation,origin:'https://outside.invalid'},403],
            ['missing origin',navigation,403],
            ['cross-site metadata with local origin',{...navigation,origin:app.url},403],
            ['same origin',{origin:app.url,'sec-fetch-site':'same-origin'},400]
        ])await t.test(`${path}: ${name}`,async()=>{
            const r=await http(app.url+'/api/'+path,{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'});
            assert.equal(r.status,status);assert.equal((await r.json()).error,status===403?'LOCAL_ORIGIN_ONLY':'DEPLOYMENT_NOT_CONFIGURED');
        });
    }
});

test('Chromium can follow an external link and load the wallet application',async t=>{
    const app=await startWallet({port:0});t.after(()=>app.stop());
    let metadata;
    app.server.prependListener('request',req=>{if(req.url==='/')metadata={site:req.headers['sec-fetch-site'],mode:req.headers['sec-fetch-mode'],dest:req.headers['sec-fetch-dest']};});
    const outside=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<a href="${app.url}/">Open wallet desk</a>`);});
    await new Promise(r=>outside.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>outside.close(r)));
    const browser=await chromium.launch();t.after(()=>browser.close());
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    // localhost -> 127.0.0.1 is cross-site; different ports on the same host are only same-site.
    await page.goto(`http://localhost:${outside.address().port}/`);
    const response=page.waitForResponse(r=>r.url()===app.url+'/');
    await page.getByRole('link',{name:'Open wallet desk'}).click();
    assert.deepEqual(metadata,{site:'cross-site',mode:'navigate',dest:'document'});
    assert.equal((await response).status(),200,'external document navigation must not get LOCAL_ORIGIN_ONLY');
    await page.getByRole('heading',{name:'Connect your testnet wallet.'}).waitFor();
    await page.locator('#connect').click();
    await page.getByRole('button',{name:'Meteor Wallet',exact:true}).waitFor();
    await page.getByRole('button',{name:'Intear Wallet',exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await page.reload();await page.getByRole('heading',{name:'Connect your testnet wallet.'}).waitFor();
    assert.deepEqual(errors,[]);
});
