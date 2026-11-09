// Local companion only. No private key loading, public listener or server signer.
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {createApp} from './server.mjs';
import {walletAssets} from './build-wallet.mjs';
export async function startWallet({config=null,port=8790,journal=resolve('.local/wallet-journal')}={}){
    const wallet=await walletAssets();
    await mkdir(journal,{recursive:true,mode:0o700});
    // INF-01's indexer is Sandbox-only. Do not manufacture healthy testnet snapshots.
    const store={read:async()=>({items:[],health:{risk_allowed:false,state:'TESTNET_INDEXER_PENDING',height:null}})};
    const app=createApp({config,journal,wallet,store,quoteProvider:async()=>({items:[]})});
    await new Promise((r,j)=>{app.server.once('error',j);app.server.listen(port,'127.0.0.1',r);});
    return {...app,url:`http://127.0.0.1:${app.server.address().port}`,stop:()=>new Promise(r=>app.server.close(r))};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
    const {values:v}=parseArgs({options:{config:{type:'string'},journal:{type:'string'},port:{type:'string',default:'8790'}}});
    const port=Number(v.port);if(!Number.isInteger(port)||port<0||port>65535)throw Error('INVALID_PORT');
    try{
        const app=await startWallet({config:v.config?JSON.parse(await readFile(v.config,'utf8')):null,port,...(v.journal?{journal:resolve(v.journal)}:{})});
        console.log(`Testnet wallet desk: ${app.url}\nProduction disabled. New risk disabled pending reconciled testnet indexer.${v.config?'':' Deployment not configured; connection only.'}`);
        for(const s of ['SIGINT','SIGTERM'])process.once(s,async()=>{await app.stop();process.exit(0);});
    }catch{console.error('WALLET_START_FAILED: verify pinned assets, SDK deployment configuration and local port.');process.exitCode=1;}
}
