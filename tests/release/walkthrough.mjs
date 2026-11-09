// REL-01 local lifecycle and a real CLI exit while the HTTP frontend is down.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fork,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {startDemo} from '../../apps/web/demo.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),Q=10n**24n;
const output=process.argv[2]??'target/release-public/walkthrough.json';
const report={scope:'REL-01 local synthetic Sandbox walkthrough; generated local signer, two funded maker processes, real oracle/indexer and frontend-offline CLI recovery. No public wallet, testnet, approved rolling strategy or review sign-off.',checks:[],operations:[],quotes:[],maker_retirements:[],base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim()};
const check=(name,a,b)=>{assert.deepEqual(a,b,name);report.checks.push(name);console.log('PASS',name);};
let demo;
try {
    demo=await startDemo({poll:false});
    const user=demo.accounts[0].id,client=demo.app.client,allowed=new Set();
    const post=async(route,body)=>{const response=await fetch(demo.url+'/api/'+route,{method:'POST',headers:{origin:demo.url,'content-type':'application/json'},body:JSON.stringify(body)});const result=await response.json();assert(!result.error,JSON.stringify(result));return result;};
    async function operation(method,args={},deposit='1',expected='SUCCEEDED',signer=demo.realSigner){
        const p=await post('prepare',{signer_id:user,method,args,attached_deposit:deposit});assert.deepEqual(p.blockers,[]);
        const result=await client.submit(p.intent.operation_id,signer);assert.equal(result.state,expected,JSON.stringify(result));
        report.operations.push({intent:p.intent,result});await demo.sync();return {intent:p.intent,result};
    }
    check('fresh local visitor has no clearinghouse registration',(await client.balances(user)).account,null);
    const storage=await client.rpc.view('storage_quote');await operation('storage_deposit',{},storage.account_minimum);
    await operation('deposit_collateral',{},String(6n*Q));await operation('split',{series_id:'alpha',amount:String(2n*Q)});
    const funded=await client.balances(user);
    check('visitor storage remains separate from free collateral',[funded.account.free,funded.account.storage_paid],[String(4n*Q),storage.account_minimum]);
    check('split creates backed complementary positions',funded.account.positions[0],{p:String(2n*Q),n:String(2n*Q)});
    const request={taker:user,mode:'SELL',asset:{kind:'N',series_id:'alpha'},amount:String(Q/10n)};
    const offers=(await post('quotes',request)).items;report.quotes=offers;
    check('two independently running funded makers quote N sale',offers.filter(x=>x.quote).length,2);
    const quote=offers.map(x=>x.quote).sort((a,b)=>BigInt(a.maker_gives[0].amount)>BigInt(b.maker_gives[0].amount)?-1:1)[0];
    await operation('fill_quote',{quote});
    check('N sale transfers the exact claim amount',(await client.balances(user)).account.positions[0].n,String(19n*Q/10n));
    const basket=[{asset:{kind:'P',series_id:'alpha'},amount:String(Q/2n)},{asset:{kind:'COLLATERAL'},amount:String(Q/2n)}];
    await operation('vault_mint_basket',{vault_id:'basket',shares:String(Q/2n),max_inputs:basket});
    check('proportional basket mint credits actual shares',(await client.balances(user)).vault.holders[user],String(Q/2n));
    for(const maker of demo.makers){const r=await maker.ask('withdraw');assert(r.cancellation);const tx=r.cancellation;report.maker_retirements.push(await client.rpc.request('tx',{tx_hash:tx.transaction.hash,sender_account_id:maker.id,wait_until:'FINAL'}));}
    await demo.sync();const unavailable=await post('quotes',request);
    check('retired makers return no invented liquidity',unavailable.items.map(x=>x.quote),[null,null]);
    await operation('vault_redeem_in_kind',{vault_id:'basket',shares:String(Q/2n),min_outputs:basket});
    check('in-kind exit remains available without makers',(await client.balances(user)).vault.holders[user]??'0','0');
    await demo.dispute();check('committed synthetic settlement reaches disputed state',(await demo.indexer.store.read('snapshots',{limit:200})).items.some(s=>s.body?.cases?.some(c=>c.state==='DISPUTED')),true);
    await demo.finalize();
    const settled=await client.balances(user);assert(settled.series[0].final_price);report.final_price=settled.series[0].final_price;
    for(const leg of ['P','N'])await operation('redeem',{series_id:'alpha',leg,amount:settled.account.positions[0][leg.toLowerCase()]});
    check('both settled claim legs burn against existing backing',(await client.balances(user)).account.positions[0],{p:'0',n:'0'});
    const beforeFailure=(await client.balances(user)).account.free;
    await operation('request_withdrawal',{amount:'100',receiver:'missing.sandbox'},'1','WITHDRAWAL_FAILED_CONFIRMED');
    check('actual failed native payout restores only original free collateral',(await client.balances(user)).account.free,beforeFailure);
    let lostHash;
    const interrupted=await operation('deposit_collateral',{},'17','SUBMISSION_UNKNOWN',async request=>{const sent=await demo.realSigner(request,async()=>{});lostHash=sent.hash;throw Error('injected response loss after actual send');});
    const sends=demo.transactions.length;
    await new Promise(resolve=>demo.app.server.close(resolve));
    await assert.rejects(fetch(demo.url+'/api/state'));
    check('HTTP frontend is actually offline',demo.app.server.listening,false);
    async function cli(command,args=[],allowFailure=false){
        return new Promise((resolve,reject)=>{
            const child=fork(path.join(ROOT,'scripts/recover.mjs'),[command,'--config',path.join(demo.work,'client.json'),'--journal',path.join(demo.work,'journal'),...args],{execArgv:[],cwd:ROOT,stdio:['ignore','pipe','pipe','ipc'],env:{PATH:process.env.PATH}});
            let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
            child.on('message',async request=>{try{assert(allowed.has(request.operationId));assert.equal(request.signerId,user);const result=await demo.realSigner(request,async()=>{});if(child.connected)child.send({...result,operationId:request.operationId});}catch{if(child.connected)child.send({error:'SIGNER_FAILED',operationId:request.operationId});}});
            child.on('error',reject);child.on('close',code=>{try{if(code&&!allowFailure)throw Error('CLI_FAILED');resolve({code,value:JSON.parse(code?err:out)});}catch(e){reject(e);}});
        });
    }
    const recovered=(await cli('recover',['--id',interrupted.intent.operation_id,'--hash',lostHash])).value;
    check('CLI resolves the actual lost response while frontend is down',recovered.state,'SUCCEEDED');
    check('receipt recovery never resends the deposit',demo.transactions.length,sends);
    const amount=(await cli('balances',['--account',user])).value.account.free;
    const intent=(await cli('prepare',['--account',user,'--method','request_withdrawal','--args',JSON.stringify({amount,receiver:user})])).value;allowed.add(intent.operation_id);
    const result=(await cli('submit',['--id',intent.operation_id,'--signer',path.join(ROOT,'packages/sdk/ipc-signer.mjs')])).value;
    check('CLI exits redeemed collateral with frontend offline',result.state,'WITHDRAWAL_SUCCEEDED');
    report.operations.push({intent,result,via:'fresh CLI processes with frontend offline'});
    const count=demo.transactions.length;
    const repeated=await cli('submit',['--id',intent.operation_id,'--signer',path.join(ROOT,'packages/sdk/ipc-signer.mjs')],true);
    check('duplicate CLI submit is rejected without another send',[repeated.value.error,demo.transactions.length],['ALREADY_ATTEMPTED',count]);
    check('visitor free collateral is zero after confirmed exit',(await cli('balances',['--account',user])).value.account.free,'0');
    await demo.sync();const snapshots=(await demo.indexer.store.read('snapshots',{limit:200})).items;
    check('indexer reconciles core and oracle after CLI recovery',snapshots.length,2);
    report.snapshots=snapshots;report.config=demo.config;report.artifacts=demo.manifest;
    report.transactions=[...demo.transactions,...report.maker_retirements.map(raw=>({label:'maker-retirement',raw}))];
    report.costs=report.transactions.map(({label,raw})=>({label,hash:raw.transaction.hash,gas_burnt:String([raw.transaction_outcome,...raw.receipts_outcome].reduce((n,r)=>n+BigInt(r.outcome.gas_burnt),0n)),tokens_burnt:String([raw.transaction_outcome,...raw.receipts_outcome].reduce((n,r)=>n+BigInt(r.outcome.tokens_burnt),0n))}));
    report.sources={};for(const file of ['tests/release/walkthrough.mjs','apps/web/demo.mjs','apps/web/server.mjs','scripts/recover.mjs','packages/sdk/client.mjs','packages/sdk/ipc-signer.mjs','services/indexer/indexer.mjs','services/maker/worker.mjs'])report.sources[file]=createHash('sha256').update(await readFile(path.join(ROOT,file))).digest('hex');
    report.passed=true;await mkdir(path.dirname(path.resolve(ROOT,output)),{recursive:true});await writeFile(path.resolve(ROOT,output),JSON.stringify(report,null,2)+'\n');console.log(`REL-01 local walkthrough: ${report.checks.length} checks; ${report.transactions.length} recorded transactions`);
}finally{if(demo)await demo.stop();}
