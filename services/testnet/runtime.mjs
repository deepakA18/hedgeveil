import {fork} from 'node:child_process';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import EmbeddedPostgres from '../indexer/node_modules/embedded-postgres/dist/index.js';
import {privateRead,durableWrite} from '../demo/storage.mjs';
import {freePort} from '../../tests/indexer/postgres.mjs';
import {startWallet} from '../../apps/web/wallet.mjs';
import {providerFor,verifyChain,assertDeploymentEnabled,Q} from './workspace.mjs';
import {startNativeSampling} from './sampling.mjs';
import {startExpirySettlement,EXPIRY_KIND} from './expiry.mjs';
import {journalCandidates} from '../indexer/discovery.mjs';
import {coordinatedDatabaseStop} from './shutdown.mjs';

// One owner per retained nonce/database workspace. A crash leaves the lock for
// explicit operator inspection; starting again never silently resets state.
export async function serve({directory,plan,port=8790}){
    assertDeploymentEnabled(plan);
    const lock=join(directory,'running');await mkdir(lock,{mode:0o700});
    let pg,app,sampler,stopping,databaseStop;const workers=[];
    const stop=()=>stopping??=(async()=>{
        await sampler?.stop();
        await app?.stop();
        await Promise.all(workers.map(w=>new Promise(r=>{if(w.exitCode!==null||w.signalCode!==null)return r();w.once('exit',r);w.kill();})));
        if(pg?.process&&pg.process.exitCode===null&&pg.process.signalCode===null)await (databaseStop?.stopDatabase??(()=>pg.stop()))();
        await rm(lock,{recursive:true});
        databaseStop?.release();
    })();
    try{
        await durableWrite(join(lock,'owner.json'),{pid:process.pid});
        const deployment=await privateRead(join(directory,'deployment.json'));
        const {keys}=await privateRead(join(directory,'signers.json'));
        const {password}=await privateRead(join(directory,'postgres.json'));
        const provider=providerFor(plan);await verifyChain(provider,plan);
        const databaseDir=join(directory,'postgres'),pgPort=await freePort();
        pg=new EmbeddedPostgres({databaseDir,port:pgPort,user:'postgres',password,persistent:true,createPostgresUser:false,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-k',''],initdbFlags:['--locale=C','--encoding=UTF8'],onLog:()=>{},onError:()=>{}});
        databaseStop=coordinatedDatabaseStop(pg,stop);
        let version;try{version=await readFile(join(databaseDir,'PG_VERSION'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
        if(version){if(version.trim()!=='18')throw Error('POSTGRES_VERSION_MISMATCH');}else await pg.initialise();
        await pg.start();
        const makers=[];let maintaining=false;
        for(const [n,a] of plan.accounts.filter(a=>a.role==='maker').entries()){
            const child=fork(new URL('../maker/worker.mjs',import.meta.url),[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH}});workers.push(child);
            let next=0;const pending=new Map();
            const rejectAll=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('MAKER_UNAVAILABLE'));}pending.clear();};
            child.on('exit',rejectAll);child.on('error',rejectAll);
            child.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error==='MAKER_RPC_UNAVAILABLE'?'MAKER_RPC_UNAVAILABLE':'MAKER_UNAVAILABLE')):p.resolve(m.result);});
            const ask=(method,body)=>new Promise((resolve,reject)=>{
                if(!child.connected)return reject(Error('MAKER_UNAVAILABLE'));
                if(pending.size>=16)return reject(Error('MAKER_BUSY'));
                const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('MAKER_TIMEOUT'));},30000);
                pending.set(id,{resolve,reject,timer});child.send({id,method,deadline_ms:Date.now()+28000,...body},e=>{if(e){clearTimeout(timer);pending.delete(id);reject(Error('MAKER_UNAVAILABLE'));}});
            });
            const init=await ask('init',{config:{...deployment.client,rpc_fallbacks:deployment.indexer.rpc_urls.filter(url=>url!==deployment.client.rpc_url),contract:deployment.client.contract_id,maker:a.id,account_key:keys[a.id],key_id:'demo-key',fee_receiver:a.id,initial_equity:plan.maker_initial_equity??String(4n*Q),half_spread_bps:20+n*20,pricing_source:'coinbase',market_archive:join(directory,'market-observations',a.id),state_file:join(directory,'makers',a.id+'.json'),operation_journal:join(directory,'maker-journals',a.id),resume:true}});
            if(init.public_key!==a.rfq_public_key)throw Error('MAKER_KEY_MISMATCH');makers.push({ask,child,last:null});
        }
        const quoteProvider=async request=>{
            // Each maker fetches and validates external inputs itself. Requests
            // cannot inject prices or rewrite a market observation's timestamp.
            if(maintaining)return {items:[{quote:null,reason:'MAKER_MAINTENANCE'}]};
            return {items:await Promise.all(makers.map(async m=>{try{const result=await m.ask('quote',{request});m.last={checked_at:new Date().toISOString(),offered:!!result.quote,reason:result.reason};return result;}catch(e){const reason=['MAKER_RPC_UNAVAILABLE','MAKER_TIMEOUT','MAKER_BUSY'].includes(e.message)?e.message:'MAKER_UNAVAILABLE';m.last={checked_at:new Date().toISOString(),offered:false,reason};return {quote:null,reason};}}))};
        };
        if(plan.kind==='hedgeveil-native-testnet')sampler=startNativeSampling({directory,plan});
        if(plan.kind===EXPIRY_KIND)sampler=startExpirySettlement({directory,plan},{maintenance:async fn=>{
            maintaining=true;
            try{await Promise.all(makers.map(m=>m.ask('pause',{})));return await fn();}
            finally{await Promise.all(makers.map(m=>m.ask('resume',{}))).finally(()=>{maintaining=false;});}
        }});
        const diagnostics=async()=>({maintaining,makers:makers.map(m=>({connected:m.child.connected&&m.child.exitCode===null,...m.last})),keeper:await privateRead(join(directory,'expiry-status.json')).catch(()=>null),renewal:await privateRead(join(directory,'renewal-status.json')).catch(()=>null)});
        app=await startWallet({diagnostics,port,config:deployment.client,retainedAnchor:await privateRead(join(directory,'anchor.json')),indexerConfig:{...deployment.indexer,postgres:{host:'127.0.0.1',port:pgPort,user:'postgres',password,database:'postgres'}},accounts:plan.accounts.filter(a=>a.role==='maker'),journal:join(directory,'wallet-journal'),quoteProvider,backgroundSync:true,discover:journalCandidates([join(directory,'admin-journal'),join(directory,'wallet-journal'),...plan.accounts.filter(a=>a.role==='maker').map(a=>join(directory,'maker-journals',a.id))])});
        return {url:app.url,stop};
    }catch(e){await stop();throw e;}
}
