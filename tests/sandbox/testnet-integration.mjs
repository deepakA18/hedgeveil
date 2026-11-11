// Actual compiled contract receipts on local Sandbox, initialized with the testnet
// application domain. The explicit status transport fixture is not public-testnet evidence.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {Sandbox,GenesisAccount} from 'near-sandbox';
import {Account,JsonRpcProvider,KeyPair} from 'near-api-js';
import {AdminTransactions} from '../../services/testnet/transactions.mjs';
import {Indexer} from '../../services/indexer/indexer.mjs';
import {startPostgres} from '../indexer/postgres.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';
import {deploy,settle} from '../../services/testnet/deploy.mjs';
import {durableWrite} from '../../services/demo/storage.mjs';
const Q=10n**24n,GAS='250000000000000';
const report={scope:'Compiled testnet-domain contracts and durable admin transactions on local Sandbox; explicit network-status transport fixture; no public-testnet acceptance',passed:false,checks:[],transactions:[],sources:{}};
const check=(name,a,b)=>{assert.deepEqual(a,b,name);report.checks.push(name);console.log('PASS',name);};
let sandbox,pg,indexer;
try{
    await mkdir('target',{recursive:true});const dir=await mkdtemp('target/testnet-integration-');
    sandbox=await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});pg=await startPostgres();
    const provider=new JsonRpcProvider({url:sandbox.rpcUrl},{retries:1}),g=GenesisAccount.createDefault(),status=await provider.sendJsonRpc('status',{});
    const admin=new AdminTransactions({provider,journal:dir+'/journal',identity:{network:'sandbox',genesis_hash:status.genesis_hash},verify:async()=>{assert.equal((await provider.sendJsonRpc('status',{})).genesis_hash,status.genesis_hash);}});
    const keys={[g.accountId]:g.privateKey},ids={core:'core.'+g.accountId,oracle:'oracle.'+g.accountId,user:'user.'+g.accountId};
    async function send(label,signer,receiver,actions){const i=await admin.prepare(label,signer,receiver,actions);const out=await admin.send(i,keys[signer]);assert.equal(out.state,'SUCCEEDED');report.transactions.push({intent:i,result:out});return i;}
    for(const id of Object.values(ids)){const k=KeyPair.fromRandom('ed25519');keys[id]=k.toString();await send('create-'+id,g.accountId,id,[{type:'CreateAccount'},{type:'Transfer',deposit:String(40n*Q)},{type:'AddKey',public_key:k.getPublicKey().toString()}]);}
    check('durable create-account action matching accepts actual finalized receipts',report.transactions.length,3);
    const anchor=await provider.sendJsonRpc('block',{finality:'final'}),contracts=[];
    const call=(method,args,deposit='0')=>({type:'FunctionCall',method,args,deposit,gas:GAS});
    for(const [kind,file,args] of [['oracle','settlement-oracle.wasm',{network:'testnet',registrar:g.accountId,treasury:g.accountId,storage_byte_cost:'10000000000000000000'}],['core','clearinghouse.wasm',{network:'testnet',guardian:g.accountId,oracle:ids.oracle,oracle_version:'demo-v1',storage_byte_cost:'10000000000000000000'}]]){
        const code=await readFile('target/oracle-artifacts/'+file);await send('deploy-'+kind,ids[kind],ids[kind],[{type:'DeployContract',code:code.toString('base64')},call('new',args)]);
        contracts.push({kind,account_id:ids[kind],code_hash:base58(createHash('sha256').update(code).digest())});
    }
    await send('storage',ids.user,ids.core,[call('storage_deposit',{},'40960000000000000000000')]);
    const deposit=await send('deposit',ids.user,ids.core,[call('deposit_collateral',{},String(Q+1n))]);
    const count=report.transactions.length;
    check('restarting an admin step recovers without another send',(await admin.send(deposit,keys[ids.user])).state,'SUCCEEDED');
    const before=await provider.callFunction({contractId:ids.core,method:'get_account',args:{account_id:ids.user},blockQuery:{finality:'final'}});
    check('one exact deposit credit survives admin replay',before.free,String(Q+1n));
    const config={network:'testnet',chain_id:'testnet',genesis_hash:status.genesis_hash,anchor_hash:anchor.header.hash,rpc_urls:['https://sandbox-transport.invalid/'],contracts,postgres:pg.config,schema:'hv_testnet',stale_after_ms:300000};
    indexer=new Indexer(config,{fetchImpl:async(_url,options)=>{
        const r=await fetch(sandbox.rpcUrl,options),data=await r.json();
        if(JSON.parse(options.body).method==='status'&&data.result)data.result.chain_id='testnet';
        return {ok:r.ok,json:async()=>data};
    }});
    await indexer.init();const result=await indexer.sync();check('testnet-domain core and oracle reconcile with actual receipts',result.health.risk_allowed,true);
    check('indexed API exposes the actual configured network',(await indexer.store.read('health')).network,'testnet');
    check('testnet-domain replay preserves exact user collateral',(await indexer.store.read('balances')).items.find(x=>x.owner===ids.user&&x.bucket==='FREE').amount,String(Q+1n));
    check('setup replay did not add an operation to the retained send list',report.transactions.length,count);
    // Exercise the same deploy/settle orchestration with actual local receipts.
    // The injected transport and suppressed public deployment record are explicit.
    const root='demo.'+g.accountId,accounts=[];
    for(const [role,id,balance] of [['administrator',root,80n*Q],['core','core.'+root,30n*Q],['oracle','oracle.'+root,30n*Q],['maker','maker-a.'+root,6n*Q],['maker','maker-b.'+root,6n*Q],['arbitrator','judge.'+root,Q/2n],...Array.from({length:6},(_,i)=>['publisher',`publisher-${i}.${root}`,Q/2n])]){
        const k=KeyPair.fromRandom('ed25519');keys[id]=k.toString();const a={role,id,public_key:k.getPublicKey().toString(),initial_balance:String(balance)};
        if(role==='maker')a.rfq_public_key=generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');accounts.push(a);
    }
    const artifacts={};for(const file of ['clearinghouse.wasm','settlement-oracle.wasm']){const code=await readFile('target/oracle-artifacts/'+file);artifacts[file]={sha256:createHash('sha256').update(code).digest('hex'),code_hash:base58(createHash('sha256').update(code).digest())};}
    const plan={owner:g.accountId,root_id:root,accounts,artifacts,funding_amount:String(80n*Q),genesis_hash:status.genesis_hash,rpc_url:sandbox.rpcUrl,oracle_label:'DEMO ORACLE — SYNTHETIC PRICES'};
    await durableWrite(dir+'/signers.json',{keys});
    await send('fund-demo-root',g.accountId,root,[{type:'CreateAccount'},{type:'Transfer',deposit:plan.funding_amount},{type:'AddKey',public_key:accounts[0].public_key}]);
    const deployed=await deploy({directory:dir,plan},{admin,publish:async()=>{}});
    check('full setup deploys both contracts and funded inventories with vault disabled',deployed.vault_enabled,false);
    const core=accounts.find(a=>a.role==='core').id,maker=accounts.find(a=>a.role==='maker').id;
    const inventory=await provider.callFunction({contractId:core,method:'get_account',args:{account_id:maker},blockQuery:{finality:'final'}});
    check('maker funding separates two NEAR free collateral from two backed pairs',[inventory.free,inventory.positions[0].p,inventory.positions[0].n],[String(2n*Q),String(2n*Q),String(2n*Q)]);
    const maturity=BigInt(deployed.material.bundle.registration.config.maturity_ns);
    for(let n=0;n<200;n++){
        const now=BigInt((await provider.sendJsonRpc('block',{finality:'final'})).header.timestamp_nanosec);if(now>=maturity)break;
        if(n===199)throw Error('CLOCK_ADVANCEMENT_LIMIT');
        await provider.sendJsonRpc('sandbox_fast_forward',{delta_height:Math.min(1000,Number((maturity-now)/1_000_000_000n)+1)});
    }
    check('actual publisher proposal dispute arbitration and core import complete',(await settle({directory:dir,plan},{admin})).state,'RECEIPTS_CONFIRMED');
    const settled=await provider.callFunction({contractId:core,method:'list_series',args:{from_index:0,limit:16},blockQuery:{finality:'final'}});
    check('resolved price equals committed fallback observation',settled[0].final_price,deployed.material.observations.FALLBACK.price);
    report.transactions=await Promise.all((await readdir(dir+'/journal')).filter(id=>/^[a-f0-9]{64}$/.test(id)).map(async id=>{const r=await admin.journal.get(id);return {intent:r.intent,result:r.result};}));
    report.passed=true;
}finally{
    await indexer?.close();await pg?.runtime.stop();await sandbox?.stop();
    // Deploy code is identified by hash in public evidence; raw artifacts already live in target.
    for(const tx of report.transactions)for(const a of tx.intent.actions)if(a.type==='DeployContract'){a.code_sha256=createHash('sha256').update(Buffer.from(a.code,'base64')).digest('hex');delete a.code;}
    for(const f of ['services/testnet/transactions.mjs','services/testnet/deploy.mjs','services/indexer/rpc.mjs','services/indexer/model.mjs','services/indexer/indexer.mjs','services/indexer/store.mjs','tests/sandbox/testnet-integration.mjs'])report.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
    await writeFile('research/reports/g7-testnet-integration-sandbox.json',JSON.stringify(report,null,2)+'\n');
}
