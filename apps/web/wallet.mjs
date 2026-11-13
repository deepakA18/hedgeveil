// Local companion only. No private key loading, public listener or server signer.
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createApp} from './server.mjs';
import {walletAssets} from './build-wallet.mjs';
import {Indexer} from '../../services/indexer/indexer.mjs';
import {binding} from '../../services/indexer/rpc.mjs';
import {walletIndexerConfiguration,boundStore} from '../../services/indexer/profile.mjs';
export async function startWallet({config=null,indexerConfig=null,retainedAnchor,port=8790,journal=resolve('.local/wallet-journal'),accounts=[],quoteProvider=async()=>({items:[]}),diagnostics,backgroundSync=false,discover}={}){
    const wallet=await walletAssets();
    await mkdir(journal,{recursive:true,mode:0o700});
    let indexer,timer,syncing=null,stopped=false,app;
    let store={read:async()=>({items:[],health:{risk_allowed:false,state:'TESTNET_INDEXER_NOT_CONFIGURED',height:null}})};
    const sync=()=>syncing??=(indexer.sync().finally(()=>{syncing=null;}));
    try{
        if(indexerConfig){
            const cfg=walletIndexerConfiguration(config,indexerConfig);
            indexer=new Indexer(cfg,{discover,retainedAnchor});await indexer.init();
            // Reconciliation failure remains visible and blocks risk; recovery views stay accessible.
            if(backgroundSync)void sync().catch(()=>{});else await sync().catch(()=>{});
            const bound=boundStore(indexer.store,binding(cfg));
            store={read:async(...args)=>({...await bound.read(...args),sync:{...indexer.progress,...(indexer.feed?{discovery_transport:{...indexer.feed.feed.stats}}:{}),...(indexer.rpc.headers?{hosted_headers:{...indexer.rpc.headers.stats}}:{})}})};
            timer=setInterval(()=>{if(!stopped)sync().catch(()=>{});},cfg.poll_ms);
        }
        const oracleProfile=indexerConfig?.contracts.some(c=>c.kind==='expiry_oracle')?'native-trade-twap-v1':indexerConfig?.contracts.some(c=>c.kind==='external_oracle')?'native-sampled-v1':config?'demo-v1':'unconfigured';
        app=createApp({config,journal,wallet,store,quoteProvider,diagnostics,accounts,oracleProfile,rpcFallbacks:indexer?.config.rpc_urls.filter(url=>url!==config.rpc_url)??[]});
        await new Promise((r,j)=>{app.server.once('error',j);app.server.listen(port,'127.0.0.1',r);});
        return {...app,indexer,url:`http://127.0.0.1:${app.server.address().port}`,stop:async()=>{
            stopped=true;clearInterval(timer);await new Promise(r=>app.server.close(r));
            await syncing?.catch(()=>{});await indexer?.close();
        }};
    }catch(e){stopped=true;clearInterval(timer);await syncing?.catch(()=>{});await indexer?.close();throw e;}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
    const {values:v}=parseArgs({options:{config:{type:'string'},'indexer-config':{type:'string'},journal:{type:'string'},port:{type:'string',default:'8790'}}});
    const port=Number(v.port);if(!Number.isInteger(port)||port<0||port>65535)throw Error('INVALID_PORT');
    try{
        const app=await startWallet({config:v.config?JSON.parse(await readFile(v.config,'utf8')):null,indexerConfig:v['indexer-config']?JSON.parse(await readFile(v['indexer-config'],'utf8')):null,port,...(v.journal?{journal:resolve(v.journal)}:{})});
        console.log(`Testnet wallet desk: ${app.url}\nProduction disabled. New risk requires matched, fresh indexer reconciliation.${v.config?'':' Deployment not configured; connection only.'}`);
        for(const s of ['SIGINT','SIGTERM'])process.once(s,async()=>{await app.stop();process.exit(0);});
    }catch{console.error('WALLET_START_FAILED: verify pinned assets, SDK deployment configuration and local port.');process.exitCode=1;}
}
