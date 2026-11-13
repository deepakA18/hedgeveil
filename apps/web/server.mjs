import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {Client} from '../../packages/sdk/client.mjs';
import {retainedSeries} from '../../packages/sdk/series.mjs';
import {ClientError,fail,uint,canonical,account as validAccount} from '../../packages/sdk/intent.mjs';
import {verifyQuote} from '../../packages/rfq/codec.mjs';
import {owned,basket,shortfalls} from './public/model.mjs';
import {externalQuoteBlocker} from './quote-gate.mjs';
import {ReadCache} from '../../services/maker/read-cache.mjs';
import {serviceStatus} from './status.mjs';

const exits=new Set(['merge','redeem','vault_redeem_in_kind','request_withdrawal','close_ticket','cancel_quote','advance_quote_epoch','revoke_signing_key']);
const cash={kind:'COLLATERAL'};
const leg=(asset,amount)=>({asset,amount});
const positive=n=>BigInt(n)>0n;

// A local Sandbox signing gateway, not a wallet or an internet-facing service.
export function createApp({config,journal,accounts=[],signer,store,quoteProvider,persistent=false,wallet=null,oracleProfile='demo-v1',rpcFallbacks=[],diagnostics=async()=>null,afterSubmit=async()=>{}}) {
    if(wallet&&config&&config.network!=='testnet')fail('WALLET_TESTNET_ONLY');
    if(wallet&&signer)fail('WALLET_LOCAL_SIGNER_FORBIDDEN');
    const client=config?new Client({config,journal,transport:{fallback_urls:rpcFallbacks}}):null;
    const oracleLabel=oracleProfile==='native-trade-twap-v1'?'EXTERNAL ORACLE / 30-MINUTE NEAR/USD TWAP':oracleProfile==='native-sampled-v1'?'EXTERNAL ORACLE · THREE ON-CHAIN SAMPLES':oracleProfile==='unconfigured'?'WALLET CONNECTION · DEPLOYMENT NOT CONFIGURED':'DEMO ORACLE — SYNTHETIC PRICES';
    const allowed=new Set(accounts.map(a=>a.id));
    let queue=Promise.resolve();
    const serialize=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
    const checkAccount=id=>{if(wallet)validAccount(id);else if(!allowed.has(id))fail('UNKNOWN_DEMO_ACCOUNT');};
    async function record(id) {const r=await client.record(id);checkAccount(r.intent.signer_id);return r;}
    async function indexed(resource,options) {return store.read(resource,options);}
    const displayReads=new ReadCache({ttlMs:2000});
    async function liveContext() {
        await client.rpc.verify();
        const block=await client.rpc.request('block',{finality:'final'}),hash=block.header.hash;
        const query=(request_type,account_id,extra={})=>client.rpc.request('query',{request_type,account_id,block_id:hash,...extra});
        const view=async(method,args={})=>{
            const r=await query('call_function',config.contract_id,{method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
            if(r.block_hash!==hash)fail('VIEW_BLOCK_MISMATCH');return JSON.parse(Buffer.from(r.result).toString());
        };
        const [series,vault,storage,risk,pauses,gas]=await Promise.all([
            retainedSeries(view),view('get_vault'),view('storage_quote'),
            view('vault_risk'),view('get_pauses'),client.rpc.request('gas_price',{block_id:hash})
        ]);
        return {series,vault,storage,risk,pauses,view,query,users:new Map(),block_hash:hash,now_ns:block.header.timestamp_nanosec,gas_price:gas.gas_price};
    }
    async function live(id,displayOnly=false) {
        checkAccount(id);
        // Only GET display polling shares a short-lived finalized context.
        // Preview and handoff always verify again and obtain a new chain head.
        const c=displayOnly?await displayReads.get(liveContext):await liveContext();
        if(!c.users.has(id))c.users.set(id,(async()=>{
            const [a,native]=await Promise.all([c.view('get_account',{account_id:id}),c.query('view_account',id)]);
            const tickets=a?.retained_tickets===0?[]:await c.view('list_tickets',{account_id:id,from_index:0,limit:16});
            return {accounts:{[id]:a},native,tickets};
        })().catch(e=>{c.users.delete(id);throw e;}));
        const {query,users,...shared}=c;
        return {...shared,...await c.users.get(id)};
    }
    async function preview(intent) {
        const a=intent.args,id=intent.signer_id,s=await live(id),account=s.accounts[id],method=intent.method;
        const inputs=[],outputs=[],blockers=[];
        const reject=code=>{if(!blockers.includes(code))blockers.push(code);};
        if(!exits.has(method)){try{if(!(await indexed('health')).health.risk_allowed)reject('INDEXER_UNHEALTHY');}catch{reject('INDEXER_UNHEALTHY');}}
        const series=s.series.find(x=>x.config.series_id===a.series_id),quantity=a.amount;
        if(method!=='storage_deposit'&&intent.storage_deposit===undefined&&(!account||account.closing))reject('INSUFFICIENT_STORAGE');
        if(method==='storage_deposit'&&!account&&uint(intent.attached_deposit)<uint(s.storage.account_minimum))reject('INSUFFICIENT_STORAGE');
        if(intent.storage_deposit!==undefined){if(account)reject('ACCOUNT_ALREADY_REGISTERED');if(intent.storage_deposit!==s.storage.account_minimum)reject('INSUFFICIENT_STORAGE');}
        if(method==='deposit_collateral'){outputs.push(leg(cash,String(uint(intent.attached_deposit)-uint(intent.storage_deposit??'0'))));if(s.pauses.deposits)reject('DEPOSITS_PAUSED');}
        if(['split','merge','redeem'].includes(method)) {
            if(!series)reject('UNKNOWN_SERIES');
            else {
                const p={kind:'P',series_id:a.series_id},n={kind:'N',series_id:a.series_id};
                if(method==='split'){inputs.push(leg(cash,quantity));outputs.push(leg(p,quantity),leg(n,quantity));if(series.final_price!==null||BigInt(s.now_ns)>=BigInt(series.config.mint_cutoff_ns))reject('MINT_CUTOFF');}
                if(method==='merge'){inputs.push(leg(p,quantity),leg(n,quantity));outputs.push(leg(cash,quantity));if(series.final_price!==null)reject('MERGE_AFTER_FINALIZATION');}
                if(method==='redeem'){inputs.push(leg(a.leg==='P'?p:n,quantity));if(series.final_price===null)reject('SETTLEMENT_UNRESOLVED');else outputs.push(leg(cash,String(uint(quantity)*uint(series[a.leg==='P'?'p_coefficient':'n_coefficient'])/(10n**24n))));}
            }
        }
        if(method==='transfer'){inputs.push(leg(a.asset,a.amount));if(!await s.view('get_account',{account_id:a.receiver}))reject('RECEIVER_UNREGISTERED');}
        if(method==='request_withdrawal'){inputs.push(leg(cash,a.amount));if(s.tickets.length>=4)reject('TICKET_CAP');}
        if(['cancel_quote','advance_quote_epoch','revoke_signing_key'].includes(method)) {
            const market=await s.view('get_market',{maker:id});
            if(!market)reject('MAKER_UNREGISTERED');
            else if(method==='advance_quote_epoch'&&BigInt(a.epoch)<=BigInt(market.epoch))reject('EPOCH_MUST_INCREASE');
            else if(method==='revoke_signing_key'&&(!market.keys[a.key_id]||market.keys[a.key_id].revoked))reject('KEY_UNAVAILABLE');
            else if(method==='cancel_quote'){const n=Number(a.nonce);if((market.consumed[n>>3]|market.cancelled[n>>3])&(1<<(n%8)))reject('QUOTE_CANCELLED');}
        }
        if(method==='close_ticket'){
            const ticket=s.tickets.find(t=>t.id===a.ticket_id);
            if(!ticket||!['SUCCEEDED','FAILED_CONFIRMED'].includes(ticket.state))reject('TICKET_NOT_TERMINAL');
        }
        if(method.startsWith('vault_')) {
            try {
                const exit=method==='vault_redeem_in_kind',legs=basket(s.vault,a.shares,exit);
                if(s.vault.vault_id!==a.vault_id)reject('VAULT_MISMATCH');
                if(exit){outputs.push(...legs);if(uint(a.shares)>BigInt(s.vault.holders[id]??'0'))reject('INSUFFICIENT_SHARES');}
                else {inputs.push(...legs);if(s.vault.mint_paused||s.risk.reason!=='POLICY_UNSELECTED'&&s.risk.state==='ROLL_DEFERRED')reject('ROLL_DEFERRED');if(s.vault.supply==='0'&&a.shares!==s.vault.initial_shares)reject('EXACT_BOOTSTRAP_REQUIRED');}
                const limits=a[exit?'min_outputs':'max_inputs'];
                if(limits.length!==legs.length||legs.some(l=>{const m=limits.find(m=>canonical(m.asset)===canonical(l.asset));return !m||(exit?uint(m.amount)>uint(l.amount):uint(m.amount)<uint(l.amount));}))reject('BASKET_LIMIT_CHANGED');
                if(!exit&&legs.some(l=>l.asset.kind!=='COLLATERAL'&&s.series.some(x=>x.config.series_id===l.asset.series_id&&(x.final_price!==null||BigInt(s.now_ns)>=BigInt(x.config.maturity_ns)))))reject('MINT_CUTOFF');
            }catch(e){reject(e instanceof ClientError?e.code:'VAULT_UNAVAILABLE');}
        }
        if(method==='fill_quote') {
            const q=a.quote,market=await s.view('get_market',{maker:q.maker});
            if(['native-sampled-v1','native-trade-twap-v1'].includes(oracleProfile)){const blocked=externalQuoteBlocker(await indexed('snapshots'),[...q.maker_gives,...q.taker_gives].filter(l=>l.asset.kind!=='COLLATERAL').map(l=>l.asset.series_id),s.now_ns);if(blocked)reject(blocked);}
            inputs.push(...q.taker_gives,leg(cash,q.fee.amount));outputs.push(...q.maker_gives);
            if(BigInt(q.expiry_ns)<=BigInt(s.now_ns))reject('QUOTE_STALE');
            const nonce=Number(q.nonce),key=market?.keys[q.signing_key_id];
            if(!key||key.revoked||market.epoch!==q.cancellation_epoch||((market.consumed[nonce>>3]|market.cancelled[nonce>>3])&(1<<(nonce%8))))reject('QUOTE_CANCELLED');
            else if(!verifyQuote(q,key.public_key))reject('QUOTE_SIGNATURE');
            const maker=await s.view('get_account',{account_id:q.maker});
            if(!maker||q.maker_gives.some(l=>owned({...s,accounts:{[q.maker]:maker}},q.maker,l.asset)<uint(l.amount)))reject('QUOTE_UNFUNDED');
            if([...q.maker_gives,...q.taker_gives].some(l=>l.asset.kind!=='COLLATERAL'&&!s.series.some(x=>x.config.series_id===l.asset.series_id&&x.final_price===null&&BigInt(s.now_ns)<BigInt(x.config.maturity_ns))))reject('MINT_CUTOFF');
        }
        if(['deposit_collateral','request_withdrawal'].includes(method)) {
            const uncertain=(await operations()).some(r=>r.intent.operation_id!==intent.operation_id&&r.intent.signer_id===id&&r.intent.method===method&&r.attempted&&(!r.result||['SUBMISSION_UNKNOWN','PENDING','WITHDRAWAL_UNKNOWN'].includes(r.result.state)));
            if(uncertain)reject('UNRESOLVED_OPERATION');
        }
        const required=shortfalls(s,id,inputs);
        if(required.some(l=>positive(l.shortfall)))reject('INSUFFICIENT_ASSETS');
        // Conservative allowance at twice current gas price; execution price can still change.
        const gasAllowance=uint(intent.gas,64)*uint(s.gas_price)*2n;
        const reserved=BigInt(s.native.storage_usage)*uint(s.storage.storage_byte_cost);
        if(uint(s.native.amount)<uint(intent.attached_deposit)+gasAllowance+reserved)reject('INSUFFICIENT_GAS');
        return {intent,block_hash:s.block_hash,now_ns:s.now_ns,required,outputs,blockers,gas_allowance:String(gasAllowance),
            custody:method==='request_withdrawal'?'Free collateral → withdrawal ticket → receiver only after confirmed receipts':'Internal ledger; storage and gas are paid separately',
            share_quantity:a.shares??null};
    }
    async function operations() {
        let ids;try{ids=(await readdir(journal)).filter(x=>/^[a-f0-9]{64}$/.test(x));}catch(e){if(e.code==='ENOENT')return [];throw e;}
        if(ids.length>1000)fail('JOURNAL_CAP_USE_CLI');
        return Promise.all(ids.sort().map(record));
    }
    const server=createServer(async(req,res)=>{
        const origin=`http://127.0.0.1:${server.address().port}`;
        const nonce=randomBytes(24).toString('base64');
        res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
        res.setHeader('referrer-policy','no-referrer');
        res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        // NEAR Connect uses nonce-bearing srcdoc scripts and inline modal styles.
        // Remote executable code is served only from the integrity-verified asset map.
        if(wallet)res.setHeader('content-security-policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://wallet.intear.tech https://mc.meteorwallet.app https://wallet.meteorwallet.app https://test.rpc.fastnear.com https://rpc.testnet.near.org https://archival-rpc.testnet.near.org; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
        const send=(code,value)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(value));};
        try {
            const url=new URL(req.url,origin),p=url.pathname;
            // Opening a link (including a wallet return) can be cross-site. Only
            // the top-level GET document is public; APIs, assets, frames and all
            // writes retain the strict local-origin checks.
            const documentNavigation=req.method==='GET'&&['/','/home','/home/','/app','/app/'].includes(p)&&
                req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document';
            if(req.headers.host!==new URL(origin).host||url.origin!==origin||
                req.headers.origin&&req.headers.origin!==origin||
                req.headers['sec-fetch-site']==='cross-site'&&!documentNavigation)return send(403,{error:'LOCAL_ORIGIN_ONLY'});
            if(req.method==='GET') {
                if(wallet?.assets.has(p)){res.writeHead(200,{'content-type':'text/javascript'});res.end(wallet.assets.get(p));return;}
                const walletReturn=wallet&&['hv_operation','transactionHashes','errorCode','account_id'].some(key=>url.searchParams.has(key));
                const homepage=p==='/home'||p==='/home/'||p==='/'&&wallet&&!walletReturn;
                const desk=p==='/app'||p==='/app/'||p==='/'&&!homepage;
                const assets={'/':[homepage?'./public/home/index.html':'./public/index.html','text/html'],'/app':['./public/index.html','text/html'],'/app/':['./public/index.html','text/html'],'/home':['./public/home/index.html','text/html'],'/home/':['./public/home/index.html','text/html'],'/home/style.css':['./public/home/style.css','text/css'],'/home/home.mjs':['./public/home/home.mjs','text/javascript'],'/home/sculpture.png':['./public/home/sculpture.png','image/png'],'/app.mjs':['./public/app.mjs','text/javascript'],'/model.mjs':['./public/model.mjs','text/javascript'],'/style.css':['./public/style.css','text/css'],'/amounts.mjs':['../../packages/sdk/amounts.mjs','text/javascript']};
                if(Object.hasOwn(assets,p)){const [file,type]=assets[p];res.writeHead(200,{'content-type':type});let data=await readFile(new URL(file,import.meta.url));if(homepage)data=data.toString().replaceAll('__APP_URL__','/app#trade');if(desk&&wallet)data=data.toString().replace('DEMO ORACLE — SYNTHETIC PRICES',oracleLabel).replace('</head>',`<meta name="wallet-nonce" content="${nonce}"></head>`);res.end(data);return;}
                if(p==='/api/session'&&wallet)return send(200,{...config,network:'testnet',rpc_url:undefined,wallet:true,configured:!!config,manifest:wallet.manifest,accounts:accounts.filter(a=>a.role==='maker').map(a=>({id:a.id,role:a.role})),signer:'Browser wallet signs. This loopback-only service retains the journal and verifies finalized receipts; connection is not server authentication.',oracle_profile:oracleProfile,oracle_label:oracleLabel,subsidy:oracleProfile==='native-trade-twap-v1'?'Test assets only. Settlement uses authenticated historical Coinbase NEAR/USD trades over the 30 minutes before expiry. Missing or oversized history delays settlement. Makers are project-operated. Production and vault actions remain disabled.':oracleProfile==='native-sampled-v1'?'Testnet assets only. External on-chain report samples; source timestamps describe ingestion time. The provider request permits cached inputs up to 300 seconds. Makers are project-operated. Missing samples delay settlement. Production and vault actions remain disabled.':oracleProfile==='unconfigured'?'Testnet wallet connection only. No deployment or price source configured.':'Testnet assets only. Local synthetic oracle profile. Production and testnet vault actions remain disabled.'});
                if(p==='/api/session')return send(200,{network:'sandbox',...config,rpc_url:undefined,accounts,signer:persistent?'Local Sandbox signer; generated full-access and RFQ keys retained in the private demo workspace. No browser wallet.':'Ephemeral local Sandbox signer; full-access keys held in this Node process. No browser wallet.',subsidy:'All wallet balances, maker capital, storage and gas are subsidized by local Sandbox genesis. No real market returns.'});
                if(p==='/api/status'){
                    const [snapshot,runtime]=await Promise.all([indexed('health').catch(()=>null),diagnostics().catch(()=>null)]);
                    return send(200,serviceStatus({snapshot,runtime,configured:!!config}));
                }
                if(!client)fail('DEPLOYMENT_NOT_CONFIGURED');
                if(p==='/api/operations')return send(200,{items:await operations()});
                if(p==='/api/state')return send(200,await indexed('snapshots',{limit:200}));
                if(p==='/api/live'){const s=await live(url.searchParams.get('account'),true);return send(200,{...s,view:undefined});}
                if(p.startsWith('/api/evidence/')){
                    const resource=p.slice(14);if(!['events','receipts','alerts','transactions'].includes(resource))fail('NOT_FOUND');
                    return send(200,await indexed(resource,{limit:50,offset:Number(url.searchParams.get('offset')??0)}));
                }
                return send(404,{error:'NOT_FOUND'});
            }
            if(req.method!=='POST')return send(405,{error:'METHOD_NOT_ALLOWED'});
            if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return send(403,{error:'LOCAL_ORIGIN_ONLY'});
            let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65536)fail('BODY_LIMIT');}
            let body;try{body=JSON.parse(text);}catch{fail('INVALID_JSON');}
            if(!client)fail('DEPLOYMENT_NOT_CONFIGURED');
            if(wallet&&p==='/api/submit')fail('BROWSER_WALLET_REQUIRED');
            if(wallet&&p==='/api/remember-hash'){await record(body.id);await client.rememberHash(body.id,body.hash);return send(200,{retained:true});}
            if(p==='/api/prepare') {
                checkAccount(body.signer_id);
                // SDK builds and persists an immutable, domain-bound exact integer intent.
                try {
                    const intent=await client.prepare(body);return send(200,await preview(intent));
                } catch(e) {
                    // Preparation never claims a wallet handoff or submits a transaction.
                    // Keep ambiguous post-handoff errors on the recovery path instead.
                    if(e instanceof ClientError&&e.code==='RPC_UNAVAILABLE')fail('PREVIEW_RPC_UNAVAILABLE');
                    throw e;
                }
            }
            if(p==='/api/recover'){await record(body.id);return send(200,await client.recover(body.id,body.hash));}
            if(p==='/api/submit'||p==='/api/cancel'||wallet&&p==='/api/handoff') {
                const result=await serialize(async()=>{
                    const r=await record(body.id);
                    if(r.attempted)fail('ALREADY_ATTEMPTED');
                    if(p==='/api/cancel'){await client.journal.claim(body.id);return client.journal.observe(body.id,{operation_id:body.id,state:'CANCELLED'});}
                    const check=await preview(r.intent);if(check.blockers.length)fail(check.blockers[0]);
                    if(p==='/api/handoff')return client.handoff(body.id);
                    const out=await client.submit(body.id,signer);
                    await afterSubmit().catch(()=>{});return out;
                });return send(200,result);
            }
            if(p==='/api/quotes') {
                checkAccount(body.taker);if(!(await indexed('health')).health.risk_allowed)fail('INDEXER_UNHEALTHY');
                if(!['BUY','SELL'].includes(body.mode)||!['P','N'].includes(body.asset?.kind))fail('QUOTE_REQUEST');uint(body.amount,128,true);
                return send(200,await (async()=>{
                    if(['native-sampled-v1','native-trade-twap-v1'].includes(oracleProfile)){const blocked=externalQuoteBlocker(await indexed('snapshots'),[body.asset.series_id],String(BigInt(Date.now())*1000000n));if(blocked)return {items:[{quote:null,reason:blocked}]};}
                    return quoteProvider(body);
                })());
            }
            return send(404,{error:'NOT_FOUND'});
        }catch(e){send(400,{error:e instanceof ClientError?e.code:'SERVICE_UNAVAILABLE'});}
    });
    server.requestTimeout=15000;server.headersTimeout=10000;
    return {server,client,preview,operations};
}
