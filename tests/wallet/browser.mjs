// Real Chromium + Sandbox receipts; a test wallet transport, not a vendor wallet/public testnet.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {build} from 'esbuild';
import {chromium} from '../../apps/web/node_modules/playwright/index.mjs';
import {startDemo} from '../../apps/web/demo.mjs';
import {canonical} from '../../packages/sdk/intent.mjs';
import {Client} from '../../packages/sdk/client.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),Q=10n**24n;
const {values:options}=parseArgs({options:{report:{type:'string',default:'research/reports/g7-wallet-boundary.json'}}});
const report={scope:'APP-01 signing boundary: official Wallet Selector 10.1.4 action factory in Chromium; test wallet transport signs actual local Sandbox transactions. No external wallet installation, public testnet receipts, hosted signing service or independent review.',passed:false,checks:[],operations:[],sources:{},versions:{node:process.version,wallet_selector:'10.1.4',sandbox:'2.14.0',esbuild:'0.28.2'},base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};
const check=(label,actual,expected)=>{assert.deepEqual(actual,expected,label);report.checks.push(label);console.log('PASS',label);};
let demo,browser,server;let currentRequest,lostHash,sends=0;
try {
    const bundle=await build({entryPoints:[path.join(ROOT,'tests/wallet/browser-entry.mjs')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
    server=createServer((req,res)=>{res.setHeader('cache-control','no-store');res.setHeader('content-type',req.url==='/bundle.mjs'?'text/javascript':'text/html');res.end(req.url==='/bundle.mjs'?bundle.outputFiles[0].contents:'<!doctype html><title>Wallet boundary conformance fixture</title>');});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
    demo=await startDemo({poll:false});const client=demo.app.client,user=demo.accounts[0].id;
    browser=await chromium.launch();const page=await browser.newPage();
    await page.exposeFunction('fixtureSend',async request=>{
        assert.equal(canonical(request),canonical(currentRequest));sends++;
        const result=await demo.realSigner(request,async()=>{});lostHash=result.hash;return result.hash;
    });
    await page.goto(origin);
    const portable=await page.evaluate(async()=>{const m=await import('/bundle.mjs');const i=m.buildIntent({network:'testnet',signer_id:'alice.testnet',contract_id:'core.testnet',method:'deposit_collateral',args:{},attached_deposit:'1'});return {network:i.domain.network,id:i.operation_id.length,buffer:typeof globalThis.Buffer};});
    check('browser builds exact testnet intents without a Node Buffer global',portable,{network:'testnet',id:64,buffer:'undefined'});
    async function walletSend(request,drop=false,badReturn=false){
        currentRequest=request;
        return page.evaluate(async({r,drop,badReturn})=>{
            const {walletSelectorSigner,actionCreators}=await import('/bundle.mjs');
            const wallet={id:'fixture',getAccounts:async()=>[{accountId:r.signerId}],signAndSendTransaction:async p=>{
                const a=p.actions[0].functionCall;
                const request={signerId:p.signerId,receiverId:p.receiverId,network:r.network,operationId:r.operationId,actions:[{type:'FunctionCall',methodName:a.methodName,args:JSON.parse(new TextDecoder().decode(a.args)),gas:a.gas.toString(),deposit:a.deposit.toString()}]};
                if(new URL(p.callbackUrl).searchParams.get('hv_operation')!==r.operationId)throw Error('callback binding');
                const hash=await globalThis.fixtureSend(request);
                return drop?undefined:{transaction:{hash,signer_id:r.signerId,receiver_id:r.receiverId}};
            }};
            const selector={options:{network:{networkId:r.network}},store:{getState:()=>({selectedWalletId:'fixture',accounts:[{accountId:r.signerId,active:true}]})},wallet:async()=>wallet};
            return walletSelectorSigner({selector,actionCreators,returnUrl:badReturn?'https://foreign.example/':location.href})(r);
        },{r:request,drop,badReturn});
    }
    async function operation(method,args={},attached_deposit='1',expected='SUCCEEDED'){
        const intent=await client.prepare({signer_id:user,method,args,attached_deposit}),request=await client.handoff(intent.operation_id);
        const result=await walletSend(request);await client.rememberHash(intent.operation_id,result.hash);
        const receipt=await client.recover(intent.operation_id);assert.equal(receipt.state,expected);report.operations.push({intent,result:receipt});return {intent,request,receipt};
    }
    const storage=await client.rpc.view('storage_quote');await operation('storage_deposit',{},storage.account_minimum);
    check('browser wallet handoff registers storage with a confirmed receipt',(await client.balances(user)).account.storage_paid,storage.account_minimum);
    const deposit=await operation('deposit_collateral',{},String(3n*Q+1n));
    check('official browser action preserves large deposit plus one yocto',(await client.balances(user)).account.free,String(3n*Q+1n));
    await assert.rejects(client.handoff(deposit.intent.operation_id),/ALREADY_ATTEMPTED/);check('completed handoff cannot request a second wallet send',sends,2);
    await operation('split',{series_id:'alpha',amount:String(Q+1n)});await operation('merge',{series_id:'alpha',amount:String(Q+1n)});
    check('browser split and merge preserve exact complementary accounting',(await client.balances(user)).account.free,String(3n*Q+1n));
    const pending=await client.prepare({signer_id:user,method:'deposit_collateral',args:{},attached_deposit:'17'}),request=await client.handoff(pending.operation_id),before=sends;
    await assert.rejects(walletSend(request,false,true),/WALLET_RETURN_ORIGIN/);check('foreign redirect origin rejected before signing',sends,before);
    check('injected lost wallet response supplies no success',await walletSend(request,true),undefined);
    await page.reload();const restarted=new Client({config:demo.config,journal:path.join(demo.work,'journal')});
    check('reload and fresh client leave sent-but-unreported transaction unresolved',(await restarted.recover(pending.operation_id)).state,'SUBMISSION_UNKNOWN');
    await assert.rejects(restarted.handoff(pending.operation_id),/ALREADY_ATTEMPTED/);check('reload never sends the attempted operation again',sends,before+1);
    const hint=await page.evaluate(async({id,hash})=>{const {walletReturn}=await import('/bundle.mjs');return walletReturn(`${location.origin}/?hv_operation=${id}&transactionHashes=${hash}`,id);},{id:pending.operation_id,hash:lostHash});
    const cli=(command,extra=[])=>JSON.parse(execFileSync('node',['scripts/recover.mjs',command,'--config',path.join(demo.work,'client.json'),'--journal',path.join(demo.work,'journal'),'--id',pending.operation_id,...extra],{cwd:ROOT,encoding:'utf8'}));
    cli('remember-hash',['--hash',hint.hash]);const recovered=cli('recover');check('fresh CLI recovers redirected hash against actual final receipts',recovered.state,'SUCCEEDED');
    report.operations.push({intent:pending,result:recovered});check('read-only redirect recovery adds no broadcast',sends,before+1);
    const balance=(await client.balances(user)).account.free;
    await operation('request_withdrawal',{amount:'100',receiver:'missing.sandbox'},'1','WITHDRAWAL_FAILED_CONFIRMED');
    check('failed browser withdrawal restores the original amount once',(await client.balances(user)).account.free,balance);
    await operation('request_withdrawal',{amount:balance,receiver:user},'1','WITHDRAWAL_SUCCEEDED');
    check('browser withdrawal confirms payout and drains only free collateral',(await client.balances(user)).account.free,'0');
    await demo.sync();check('indexer reconciles after all wallet handoffs',(await demo.indexer.store.read('snapshots',{limit:200})).items.length,2);
    report.transactions=demo.transactions;report.config=demo.config;report.artifacts=demo.manifest;report.passed=true;
    for(const name of ['packages/sdk/client.mjs','packages/sdk/intent.mjs','packages/sdk/rpc.mjs','packages/sdk/journal.mjs','packages/sdk/receipts.mjs','packages/sdk/wallet.mjs','packages/sdk/amounts.mjs','scripts/recover.mjs','tests/wallet/browser.mjs','tests/wallet/browser-entry.mjs','tests/wallet/package.json','tests/wallet/package-lock.json','tests/wallet/boundary.test.mjs'])report.sources[name]=createHash('sha256').update(await readFile(path.join(ROOT,name))).digest('hex');
    const out=path.resolve(ROOT,options.report);await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(`Wallet boundary: ${report.checks.length} checks, ${report.transactions.length} recorded transactions`);
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(demo)await demo.stop();}
