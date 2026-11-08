import {createServer} from 'node:http';

export function createApi(store) {
    return createServer(async(req,res)=>{
        res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
        const send=(code,value)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(value)+'\n');};
        if(req.method!=='GET'){send(405,{error:'READ_ONLY'});return;}
        try {
            const url=new URL(req.url,'http://127.0.0.1');
            if(url.pathname==='/metrics') {
                const {health}=await store.read('health');
                res.writeHead(200,{'content-type':'text/plain; version=0.0.4'});
                res.end(`hedgeveil_indexer_healthy ${health.risk_allowed?1:0}\nhedgeveil_indexer_height ${health.height}\nhedgeveil_indexer_lag_blocks ${health.lag_blocks??-1}\nhedgeveil_indexer_age_ms ${health.age_ms??-1}\nhedgeveil_indexer_rpc_failures ${health.rpc_failures??0}\nhedgeveil_indexer_rpc_failovers ${health.rpc_failovers??0}\n`);return;
            }
            const resources={'/health':'health','/v1/balances':'balances','/v1/events':'events','/v1/transactions':'transactions','/v1/receipts':'receipts','/v1/snapshots':'snapshots','/v1/alerts':'alerts'};
            if(!Object.hasOwn(resources,url.pathname)){send(404,{error:'NOT_FOUND'});return;}
            const parse=(key,def)=>{const v=url.searchParams.get(key);return v===null?def:/^(0|[1-9][0-9]*)$/.test(v)?Number(v):NaN;};
            const data=await store.read(resources[url.pathname],{limit:parse('limit',100),offset:parse('offset',0)});
            send(url.pathname==='/health'&&!data.health.risk_allowed?503:200,data);
        }catch{send(503,{error:'INDEXER_UNAVAILABLE',risk_allowed:false});}
    });
}
