import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {join,resolve} from 'node:path';
import {build} from '../../apps/web/node_modules/esbuild/lib/main.js';
import {walletAssets} from '../../apps/web/build-wallet.mjs';
import {AdminTransactions} from './transactions.mjs';
import {providerFor,verifyChain,requireNewAccount,assertDeploymentEnabled,Q} from './workspace.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';
import {transferFunding,expiryFunding} from './funding.mjs';
import {ACCEPTED_POLICY} from '../outlayer/sampler.mjs';

export function fundingBudget(plan,oracleProbe=false){
    if(oracleProbe)return {amount:Q/50n,minimum:Q/10n};
    if(plan.kind==='hedgeveil-expiry-testnet'){expiryFunding(plan);return {amount:32n*Q,minimum:33n*Q};}
    if(plan.kind==='hedgeveil-native-testnet'){
        if(plan.funding_amount!==String(48n*Q)||plan.owner_minimum!==String(49n*Q)||plan.policy_acceptance!==ACCEPTED_POLICY||plan.oracle_version!=='native-sampled-v1'||plan.accounts.length!==5)throw Error('NATIVE_FUNDING_PROFILE');
        if(plan.funding)transferFunding(plan);
        return {amount:48n*Q,minimum:49n*Q};
    }
    return {amount:80n*Q,minimum:81n*Q};
}

export async function startBootstrap({directory,plan,port=8791,oracleProbe=false}){
    assertDeploymentEnabled(plan);
    const expiry=plan.kind==='hedgeveil-expiry-testnet',native=plan.kind==='hedgeveil-native-testnet'||expiry,budget=fundingBudget(plan,oracleProbe);
    if(!oracleProbe&&!native)throw Error('WALLET_ADD_KEY_UNSUPPORTED');
    const provider=providerFor(plan),verify=async()=>{
        await verifyChain(provider,plan);
        if(oracleProbe){
            if(plan.kind!=='hedgeveil-oracle-probe'||plan.root_id!=='price-oracle.testnet'||plan.funding_amount!=='20000000000000000000000')throw Error('PROBE_PROFILE');
            const account=await provider.sendJsonRpc('query',{request_type:'view_account',account_id:plan.root_id,finality:'final'});
            if(account.code_hash!==plan.oracle_code_hash)throw Error('PROBE_CODE_CHANGED');
        }
        if(native){
            const source=await provider.sendJsonRpc('query',{request_type:'view_account',account_id:plan.source.account_id,finality:'final'});
            if(source.code_hash!==plan.source.code_hash)throw Error('SOURCE_CODE_CHANGED');
        }
    };
    if(oracleProbe||native)await verify();
    const transactions=new AdminTransactions({provider,journal:join(directory,'admin-journal'),identity:{kind:oracleProbe?'hedgeveil-oracle-probe-v1':'hedgeveil-testnet-setup-v1',network:'testnet',genesis_hash:plan.genesis_hash,root_id:plan.root_id},verify});
    const funding=native?(expiry?expiryFunding(plan):transferFunding(plan)):null;
    const intent=await transactions.prepare(oracleProbe?'outlayer-price-probe-1':funding.label,plan.owner,oracleProbe?plan.root_id:funding.receiver_id,oracleProbe?[{type:'FunctionCall',method:'request_price_data',args:{asset_ids:['wrap.near']},gas:'200000000000000',deposit:plan.funding_amount}]:funding.actions);
    const wallet=await walletAssets();const bundle=await build({entryPoints:[resolve('services/testnet/setup-browser.mjs')],bundle:true,write:false,platform:'browser',format:'esm',target:'es2022'});
    let queue=Promise.resolve();const serial=fn=>{const p=queue.then(fn);queue=p.catch(()=>{});return p;};
    const server=createServer(async(req,res)=>{
        const origin=`http://127.0.0.1:${server.address().port}`,nonce=randomBytes(24).toString('base64');
        res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
        res.setHeader('content-security-policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://wallet.intear.tech https://mc.meteorwallet.app https://wallet.meteorwallet.app https://test.rpc.fastnear.com https://rpc.testnet.near.org; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
        const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
        try{
            const url=new URL(req.url,origin),nav=req.method==='GET'&&url.pathname==='/'&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document';
            if(url.origin!==origin||req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'&&!nav)return send(403,{error:'LOCAL_ORIGIN_ONLY'});
            if(req.method==='GET'){
                if(wallet.assets.has(url.pathname)){res.writeHead(200,{'content-type':'text/javascript'});res.end(wallet.assets.get(url.pathname));return;}
                if(url.pathname==='/setup.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(bundle.outputFiles[0].contents);return;}
                if(url.pathname==='/api/plan')return send(200,{plan,intent,manifest:wallet.manifest,record:await transactions.journal.get(intent.operation_id)});
                if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="wallet-nonce" content="${nonce}"><title>Hedgeveil testnet setup</title><style>body{font:16px/1.6 system-ui;margin:2rem auto;padding:0 1rem;max-width:850px;color:#222;background:#fafafa}button,input{font:inherit;min-height:44px;margin:.3rem;padding:.5rem}pre{overflow:auto;background:#eee;padding:1rem}button:focus-visible,input:focus-visible{outline:3px solid #555}#status{white-space:pre-wrap}#summary{overflow-wrap:anywhere}fieldset{margin:1rem 0}button:disabled{opacity:.5}</style><script type="module" src="/setup.mjs"></script></head><body>${oracleProbe?'<h1>Test the external price request</h1><p>TESTNET ONLY · No protocol deployment</p><p>Request actual NEAR/USD data from price-oracle.testnet with a <strong>0.02 test NEAR</strong> deposit plus network gas (200 Tgas maximum). This creates no account or access key. Successful execution alone does not approve this source for settlement.</p>':expiry?'<h1>Fund the new options deployment</h1><p>Testnet assets only. Vault and production disabled.</p><p>Transfer <strong>32 test NEAR</strong> to the new locally controlled service account. This funds separate contracts with 32 retained markets: 21 NEAR for the core, 6 for the TWAP resolver, and 1.5 for each of two project-operated makers. The remaining 2 NEAR pays registrations and gas. Settlement uses authenticated trade history over the 30 minutes before expiry. Missing or oversized history delays settlement. Each maker initially funds 0.1 unit per market; fills depend on available inventory. Your old positions remain in the old contracts. This transfer adds no access key to your wallet.</p>':native?'<h1>Fund the native options testnet setup</h1><p>TESTNET ONLY · External sampled prices · Vault and production disabled</p><p>Transfer <strong>48 test NEAR</strong> to a separate deployment account controlled by a key generated and stored on this computer. Your wallet signs a single transfer; it grants no access key. Cancel the earlier blocked wallet prompt before signing here. This replaces the blocked subaccount setup: service accounts will not be under your wallet name. The deployment account funds four separate service accounts: core 30, resolver 8 and two project-operated makers 4.5 each. It retains 1 for administration, storage and gas. Each account has a 64-character address and a locally stored key. The collector may spend up to 0.06 test NEAR plus gas for three price refreshes. Settlement averages three external on-chain reports; missing samples delay it, and the guardian can pause.</p>':'<h1>Prepare the testnet options demo</h1><p>TESTNET ONLY · Synthetic oracle · Vault and production disabled</p><p>This creates a dedicated demo account, funds it with <strong>80 test NEAR</strong>, and adds a full-access key held by this local setup service <strong>only to the new account</strong>. It does not add a key to your existing wallet. The new account will fund the listed contract and service accounts.</p>'}<div id="summary"></div><fieldset><legend>Connect the funding wallet</legend><div id="wallets"></div><p id="account">Not connected</p></fieldset><button id="fund" disabled>${oracleProbe?'Approve 0.02 test NEAR price request':expiry?'Approve 32 test NEAR transfer in wallet':native?'Approve 48 test NEAR transfer in wallet':'Approve 80 test NEAR setup in wallet'}</button><p id="status" role="status">Loading retained setup request…</p><form id="recover"><label for="hash">Transaction hash from this setup attempt</label><input id="hash" autocomplete="off"><button>Check matching receipts</button></form><details><summary>Review exact actions, account budget and public keys</summary><pre id="details"></pre></details></body></html>`);return;}
                return send(404,{error:'NOT_FOUND'});
            }
            if(req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']!=='application/json')return send(403,{error:'LOCAL_ORIGIN_ONLY'});
            let text='';for await(const c of req){text+=c;if(Buffer.byteLength(text)>4096)throw Error();}const body=JSON.parse(text);
            if(url.pathname==='/api/handoff')return send(200,await serial(async()=>{
                await verify();const balance=await provider.sendJsonRpc('query',{request_type:'view_account',account_id:plan.owner,finality:'final'});
                if(BigInt(balance.amount)<budget.minimum)throw Error(oracleProbe?'PROBE_BALANCE_LOW':expiry?'OWNER_NEEDS_33_TEST_NEAR':native?'OWNER_NEEDS_49_TEST_NEAR':'OWNER_NEEDS_81_TEST_NEAR');
                if(!oracleProbe)await requireNewAccount(provider,funding.receiver_id);
                await transactions.journal.claim(intent.operation_id);return intent;
            }));
            if(url.pathname==='/api/recover')return send(200,await serial(async()=>{
                if(body.hash){hash32(body.hash);const r=await transactions.journal.get(intent.operation_id);if(!r.attempted)throw Error('NOT_ATTEMPTED');await transactions.journal.observe(intent.operation_id,{state:'SUBMISSION_UNKNOWN',operation_id:intent.operation_id,candidate_hash:body.hash});}
                return transactions.recover(intent,body.hash);
            }));
            return send(404,{error:'NOT_FOUND'});
        }catch(e){const allowed=new Set(['EXPIRY_FUNDING_PROFILE','OWNER_NEEDS_33_TEST_NEAR','TRANSFER_FUNDING_PROFILE','WALLET_ADD_KEY_UNSUPPORTED','OWNER_NEEDS_49_TEST_NEAR','SOURCE_CODE_CHANGED','NATIVE_FUNDING_PROFILE','OWNER_NEEDS_81_TEST_NEAR','DEMO_ACCOUNT_ALREADY_EXISTS','ALREADY_ATTEMPTED','NOT_ATTEMPTED','ADMIN_TRANSACTION_MISMATCH','RPC_IDENTITY','HASH_CONFLICT','INVALID_HASH','PROBE_PROFILE','PROBE_CODE_CHANGED','PROBE_BALANCE_LOW']);send(400,{error:allowed.has(e.code??e.message)?e.code??e.message:'SETUP_UNAVAILABLE'});}
    });
    await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r);});
    return {url:`http://127.0.0.1:${server.address().port}`,intent,transactions,stop:()=>new Promise(r=>server.close(r))};
}
