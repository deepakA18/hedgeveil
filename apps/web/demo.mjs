// Disposable deployment by default; explicit DEM-01 workspaces retain only generated Sandbox state. No environment files are loaded.
import {createRequire} from 'node:module';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fork,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Indexer} from '../../services/indexer/indexer.mjs';
import {startPostgres} from '../../tests/indexer/postgres.mjs';
import {base58,Rpc} from '../../packages/sdk/rpc.mjs';
import {createApp} from './server.mjs';
const require=createRequire(new URL('../../tests/sandbox/package.json',import.meta.url));
const {Sandbox,GenesisAccount}=await import(require.resolve('near-sandbox'));
const {Account,JsonRpcProvider,KeyPair,actions}=await import(require.resolve('near-api-js'));
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),Q=10n**24n,GAS=250n*10n**12n;
const failed=tx=>[tx.transaction_outcome,...tx.receipts_outcome].some(r=>r.outcome.status.Failure);
export async function startDemo({port=0,poll=true,workspace=null}={}) {
    let pg,sandbox,indexer,app,timer,syncing=false,stopping=false;const workers=[],transactions=[];
    let stopPromise;
    const stop=()=>stopPromise??=(async()=>{
        stopping=true;clearInterval(timer);
        if(app)await new Promise(r=>app.server.close(r));
        await Promise.all(workers.map(w=>new Promise(r=>{if(w.exitCode!==null||w.signalCode!==null)return r();w.once('exit',r);w.kill();})));
        while(syncing)await new Promise(r=>setTimeout(r,25));
        if(indexer)await indexer.close();
        if(workspace)await workspace.cleanup();
        else{if(sandbox)await sandbox.stop();if(pg)await pg.runtime.stop();}
    })();
    try {
        await mkdir(path.join(ROOT,'target'),{recursive:true});const work=workspace?.directory??await mkdtemp(path.join(ROOT,'target/app02-')),saved=workspace?.saved;
        pg=workspace?await workspace.startPostgres():await startPostgres();sandbox=workspace?await workspace.startSandbox():await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});
        const provider=new JsonRpcProvider({url:sandbox.rpcUrl}),g=GenesisAccount.createDefault(),root=new Account(g.accountId,provider,g.privateKey);
        const keys=new Map(saved?.keys??[]);
        async function create(name,balance=100n*Q){const id=`${name}.${root.accountId}`;if(saved){if(!keys.has(id))throw Error('SIGNER_STATE_MISSING');try{const public_key=KeyPair.fromString(keys.get(id)).getPublicKey().toString();const access=await provider.sendJsonRpc('query',{request_type:'view_access_key',account_id:id,public_key,finality:'final'});if(access.permission!=='FullAccess')throw Error();}catch{throw Error('SIGNER_KEY_MISMATCH');}return new Account(id,provider,keys.get(id));}const key=KeyPair.fromRandom('ed25519');const tx=await root.createAccount({newAccountId:id,publicKey:key.getPublicKey(),nearToTransfer:balance});if(failed(tx))throw Error('ACCOUNT_CREATION_FAILED');keys.set(id,key.toString());return new Account(id,provider,key.toString());}
        const user=await create('visitor'),makerA=await create('maker-a'),makerB=await create('maker-b'),judge=await create('judge'),poor=await create('gas-limited',Q/10000n);
        const publishers=[];for(let i=0;i<6;i++)publishers.push(await create(`publisher-${i}`));
        const core=await create('core'),oracle=await create('oracle');
        const status=await provider.sendJsonRpc('status',{}),anchor=await provider.sendJsonRpc('block',saved?{block_id:saved.indexConfig.anchor_hash}:{finality:'final'});
        const manifest=JSON.parse(await readFile(path.join(ROOT,'target/oracle-artifacts/manifest.json'))),wasm={};
        for(const name of ['clearinghouse.wasm','settlement-oracle.wasm']){wasm[name]=await readFile(path.join(ROOT,'target/oracle-artifacts',name));if(createHash('sha256').update(wasm[name]).digest('hex')!==manifest[name].sha256)throw Error('ARTIFACT_HASH_MISMATCH');}
        if(saved){
            if(status.chain_id!==saved.config.chain_id||status.genesis_hash!==saved.config.genesis_hash)throw Error('DEPLOYMENT_MISMATCH');
            for(const name of ['clearinghouse.wasm','settlement-oracle.wasm'])if(manifest[name].sha256!==saved.artifacts[name].sha256)throw Error('ARTIFACT_HASH_MISMATCH');
            await new Rpc(saved.config).verify();
            for(const contract of saved.indexConfig.contracts){const code=await provider.sendJsonRpc('query',{request_type:'view_account',finality:'final',account_id:contract.account_id});if(code.code_hash!==contract.code_hash)throw Error('DEPLOYMENT_MISMATCH');}
        }
        async function retain(label,tx){transactions.push({label,raw:await provider.sendJsonRpc('tx',{tx_hash:tx.transaction.hash,sender_account_id:tx.transaction.signer_id,wait_until:'FINAL'})});return tx;}
        async function call(who,c,method,args={},deposit=0n,strict=true){const tx=await who.signAndSendTransaction({receiverId:c.accountId,actions:[actions.functionCall(method,args,GAS,deposit)],waitUntil:'FINAL',throwOnFailure:false});await retain(method,tx);if(strict&&failed(tx))throw Error('DEMO_ACTION_FAILED:'+method+':'+JSON.stringify(tx.status));return tx;}
        async function deploy(c,file,args){const tx=await c.signAndSendTransaction({receiverId:c.accountId,actions:[actions.deployContract(wasm[file]),actions.functionCall('new',args,GAS,0n)],waitUntil:'FINAL',throwOnFailure:false});await retain('deploy:'+c.accountId,tx);if(failed(tx))throw Error('DEPLOYMENT_FAILED');}
        const byteCost=BigInt((await provider.sendJsonRpc('EXPERIMENTAL_protocol_config',{finality:'final'})).runtime_config.storage_amount_per_byte),storage=4096n*byteCost;
        if(!saved){
        await deploy(oracle,'settlement-oracle.wasm',{network:'sandbox',registrar:root.accountId,treasury:root.accountId,storage_byte_cost:String(byteCost)});
        await deploy(core,'clearinghouse.wasm',{network:'sandbox',guardian:makerA.accountId,oracle:oracle.accountId,oracle_version:'demo-v1',storage_byte_cost:String(byteCost)});
        for(const a of [makerA,makerB]){await call(a,core,'storage_deposit',{},storage);await call(a,core,'deposit_collateral',{},80n*Q);}
        for(const a of [root,user,makerA])await call(a,oracle,'register_account',{},storage);
        }
        const now=async()=>BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);
        let material=saved?.material;
        if(!saved){
        const request=path.join(work,'synthetic-request.json');await writeFile(request,JSON.stringify({series_id:'alpha',oracle:oracle.accountId,start_ns:String(await now()+3600_000_000_000n),publishers:publishers.map(a=>a.accountId),arbitrator:judge.accountId}));
        material=JSON.parse(execFileSync('python3',['services/observation-collector/collector.py','materialize','--request',request,'--archive',path.join(work,'observations')],{cwd:ROOT,encoding:'utf8'}));
        await call(root,oracle,'register_series',material.bundle.registration,32768n*byteCost);
        await call(makerA,core,'create_series',{config:material.bundle.registration.config},storage+Q/1000n);
        for(const a of [makerA,makerB])await call(a,core,'split',{series_id:'alpha',amount:String(20n*Q)},1n);
        const seed=[{asset:{kind:'P',series_id:'alpha'},amount:String(Q)},{asset:{kind:'COLLATERAL'},amount:String(Q)}];
        await call(makerA,core,'create_vault',{vault_id:'basket',seed,initial_shares:String(Q)},storage+1n);
        await call(makerA,core,'vault_mint_basket',{vault_id:'basket',shares:String(Q),max_inputs:seed},1n);
        }
        if(workspace)await mkdir(path.join(work,'makers'),{mode:0o700,recursive:true});
        const makers=[];
        for(const [a,spread] of [[makerA,20],[makerB,40]]){
            const child=fork(path.join(ROOT,'services/maker/worker.mjs'),[],{execArgv:[],stdio:['ignore','ignore','ignore','ipc'],env:{PATH:process.env.PATH}});workers.push(child);
            const pending=new Map();child.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('MAKER_UNAVAILABLE')):p.resolve(m.result);});
            child.on('exit',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('MAKER_UNAVAILABLE'));}pending.clear();});
            const ask=(method,args={})=>new Promise((resolve,reject)=>{const id=randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error('MAKER_TIMEOUT'));},15000);pending.set(id,{resolve,reject,timer});if(child.connected)child.send({id,method,...args});else{clearTimeout(timer);pending.delete(id);reject(Error('MAKER_UNAVAILABLE'));}});
            const init=await ask('init',{config:{rpc_url:sandbox.rpcUrl,contract:core.accountId,maker:a.accountId,account_key:keys.get(a.accountId),key_id:'demo-key',fee_receiver:a.accountId,initial_equity:String(80n*Q),half_spread_bps:spread,...(workspace?{state_file:path.join(work,'makers',a.accountId+'.json'),resume:!!saved}:{})}});
            if(!saved)await call(a,core,'register_signing_key',{key_id:'demo-key',public_key:init.public_key},storage+1n);
            else {const market=await provider.callFunction({contractId:core.accountId,method:'get_market',args:{maker:a.accountId},blockQuery:{finality:'final'}});if(market?.keys['demo-key']?.public_key!==init.public_key)throw Error('MAKER_KEY_MISMATCH');}
            makers.push({id:a.accountId,ask});
        }
        const contracts=[{account_id:core.accountId,kind:'core',code_hash:base58(createHash('sha256').update(wasm['clearinghouse.wasm']).digest())},{account_id:oracle.accountId,kind:'oracle',code_hash:base58(createHash('sha256').update(wasm['settlement-oracle.wasm']).digest())}];
        const indexConfig={network:'sandbox',chain_id:status.chain_id,genesis_hash:status.genesis_hash,anchor_hash:anchor.header.hash,rpc_urls:[sandbox.rpcUrl],contracts,postgres:pg.config,schema:'hv_app',stale_after_ms:30000,max_blocks:10000};
        indexer=new Indexer(indexConfig);await indexer.init();await indexer.sync();
        let syncingPromise=Promise.resolve();
        async function sync(){if(stopping)return;if(syncing)return syncingPromise;syncing=true;syncingPromise=indexer.sync().finally(()=>{syncing=false;});return syncingPromise;}
        const config={rpc_url:sandbox.rpcUrl,network:'sandbox',chain_id:status.chain_id,genesis_hash:status.genesis_hash,contract_id:core.accountId,code_hash:contracts[0].code_hash};
        // Public binding contains no keys. Explicit workspaces retain generated keys separately.
        await writeFile(path.join(work,'client.json'),JSON.stringify(config,null,2));
        const accounts=[{id:user.accountId,role:'visitor'},{id:makerA.accountId,role:'maker'},{id:makerB.accountId,role:'maker'},{id:poor.accountId,role:'gas-limited visitor'}];
        const actors=new Map([user,makerA,makerB,poor].map(a=>[a.accountId,a]));
        let signerOverride=null;
        const realSigner=async(request,onHash)=>{const a=request.actions[0];const tx=await call(actors.get(request.signerId),core,a.methodName,a.args,BigInt(a.deposit),false);await onHash(tx.transaction.hash);return {hash:tx.transaction.hash};};
        const quoteProvider=async request=>({items:await Promise.all(makers.map(async m=>{try{return await m.ask('quote',{request:{...request,reference:{label:'SYNTHETIC MARKET REFERENCE',timestamp_ns:String(await now()),marks:{'P:alpha':String(Q/2n),'N:alpha':String(Q/2n)}}}});}catch{return {quote:null,reason:'MAKER_UNAVAILABLE'};}}))});
        app=createApp({persistent:!!workspace,config,journal:path.join(work,'journal'),accounts,store:indexer.store,quoteProvider,afterSubmit:async()=>{await syncingPromise.catch(()=>{});await sync();},signer:(r,h)=>(signerOverride??realSigner)(r,h)});
        await new Promise((r,j)=>{app.server.once('error',j);app.server.listen(workspace?.port??port,'127.0.0.1',r);});
        if(workspace)await workspace.save({keys,config,accounts,material,manifest,indexConfig});
        if(poll)timer=setInterval(()=>sync().catch(()=>{}),2000);
        const url=`http://127.0.0.1:${app.server.address().port}`;
        // Test/admin helper is deliberately not exposed as an HTTP endpoint.
        async function dispute(){const end=BigInt(material.bundle.registration.config.maturity_ns);for(let i=0;await now()<end&&i<200;i++)await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:1000});for(let i=0;i<6;i++)await call(publishers[i],oracle,'publish',{evidence:material.bundle.evidence[i]},1n);await call(user,oracle,'propose',{series_id:'alpha',route:'PRIMARY',price:'3000000000000',evidence_hash:material.observations.PRIMARY.evidence_hash},Q/10n);await call(makerA,oracle,'challenge',{series_id:'alpha',...material.observations.FALLBACK},Q/10n);await sync();}
        async function finalize(){await call(judge,oracle,'adjudicate',{series_id:'alpha',route:'FALLBACK'},1n);await call(user,core,'request_resolution',{series_id:'alpha'});await sync();}
        return {url,stop,sync,app,indexer,transactions,config,work,accounts,material,manifest,dispute,finalize,makers,realSigner,setSigner:fn=>{signerOverride=fn;}};
    }catch(e){await stop();throw e;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
    try{const demo=await startDemo();console.log(`Hedgeveil Sandbox UI: ${demo.url}\nPublic client binding and durable journal: ${demo.work}\nSynthetic prices; ephemeral local keys; subsidized balances. Production disabled.\nKeep this process running for receipt recovery. Ctrl-C stops the local deployment.`);let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await demo.stop();};process.on('SIGINT',stop);process.on('SIGTERM',stop);}catch{console.error('Local demo failed. Check installed dependencies and compiled artifact manifests; no existing deployment was modified.');process.exitCode=1;}
}
