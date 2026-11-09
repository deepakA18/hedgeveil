import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=new URL('./',import.meta.url);
export const walletLock=JSON.parse(await readFile(new URL('wallets/lock.json',root)));
export async function walletAssets({download=false}={}) {
    const assets=new Map();
    for(const w of walletLock.wallets){
        const path=new URL('.local'+w.manifest.executor,root);let data;
        try{data=await readFile(path);}catch(e){
            if(e.code!=='ENOENT'||!download)throw Error('WALLET_ASSETS_MISSING: run npm run build:wallet');
            const r=await fetch(w.source,{signal:AbortSignal.timeout(30000)});
            if(!r.ok)throw Error('WALLET_DOWNLOAD_FAILED');data=Buffer.from(await r.arrayBuffer());
        }
        if(createHash('sha256').update(data).digest('hex')!==w.sha256)throw Error('WALLET_INTEGRITY_MISMATCH');
        if(download){await mkdir(new URL('.local/wallet-executors/',root),{recursive:true});await writeFile(path,data);}
        assets.set(w.manifest.executor,data);
    }
    const bundle=await build({entryPoints:[fileURLToPath(new URL('public/wallet.mjs',root))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
    assets.set('/wallet.mjs',bundle.outputFiles[0].contents);
    return {assets,manifest:{version:'hedgeveil-pinned-1',wallets:walletLock.wallets.map(w=>w.manifest)}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){await walletAssets({download:true});console.log('Pinned wallet executors verified; browser bundle builds.');}
