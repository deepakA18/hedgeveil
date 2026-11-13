import {parseArgs} from 'node:util';
import {loadWorkspace,prepareWorkspace,providerFor,verifyChain,Q} from './workspace.mjs';
import {startBootstrap} from './bootstrap.mjs';
import {deploy,settle,adminFor} from './deploy.mjs';
import {serve} from './runtime.mjs';
import {sampleNative} from './sampling.mjs';
import {settleExpiry,EXPIRY_KIND} from './expiry.mjs';
import {prepareExpiryWorkspace,deployExpiry} from './expiry-deploy.mjs';
import {prepareNativeWorkspace,deployNative} from './native.mjs';
const {values:v,positionals:[command]}=parseArgs({allowPositionals:true,options:{name:{type:'string',default:'open'},owner:{type:'string',default:'0xdeepak18.testnet'},port:{type:'string'},'rpc-url':{type:'string'},operation:{type:'string'},series:{type:'string'},hash:{type:'string'}}});
try{
    if(command==='prepare-expiry'){
        const {plan}=await prepareExpiryWorkspace({name:v.name==='open'?'expiry':v.name});console.log(JSON.stringify({review_plan:`deploy/testnet/${v.name==='open'?'expiry':v.name}-plan.json`,root_id:plan.root_id,funding_test_near:'32',state:'PREPARED_AWAITING_WALLET_FUNDING'}));
    }else if(command==='prepare-native'){
        const {plan}=await prepareNativeWorkspace({name:v.name==='open'?'native':v.name,owner:v.owner,...(v['rpc-url']?{rpc_url:v['rpc-url']}:{})});
        console.log(JSON.stringify({root_id:plan.root_id,funding_mode:plan.funding.mode,funding_receiver:plan.funding.receiver_id,funding_test_near:'48',owner_minimum_test_near:'49',state:'PREPARED_AWAITING_WALLET_FUNDING'}));
    }else if(command==='prepare'){
        const {plan}=await prepareWorkspace({name:v.name,owner:v.owner,...(v['rpc-url']?{rpc_url:v['rpc-url']}:{})});
        console.log(JSON.stringify({review_plan:`deploy/testnet/${v.name}-plan.json`,root_id:plan.root_id,deployment_hold:plan.deployment_hold,funding_test_near:null,owner_minimum_test_near:null,state:'PREPARED_ON_HOLD_NOT_DEPLOYED'}));
    }else{
        const workspace=await loadWorkspace(v.name),{plan,directory}=workspace;
        if(command==='status'){
            const p=providerFor(plan);await verifyChain(p,plan);const a=await p.sendJsonRpc('query',{request_type:'view_account',account_id:plan.owner,finality:'final'});
            const required=BigInt(plan.owner_minimum??81n*Q);console.log(JSON.stringify({owner:plan.owner,balance_atomic:a.amount,deployment_hold:plan.deployment_hold??null,required_atomic:plan.deployment_hold?null:String(required),shortfall_atomic:plan.deployment_hold?null:String(BigInt(a.amount)>=required?0n:required-BigInt(a.amount)),block_hash:a.block_hash}));
        }else if(command==='create-series'){if(!v.series)throw Error('SERIES_REQUIRED');const d=await deployNative(workspace,{seriesId:v.series});console.log(JSON.stringify({state:'SERIES_RECEIPTS_CONFIRMED',series:d.series.series_id,mint_cutoff_ns:d.series.mint_cutoff_ns,maturity_ns:d.series.maturity_ns}));}
        else if(command==='deploy'){const d=await (plan.kind===EXPIRY_KIND?deployExpiry:deploy)(workspace);console.log(JSON.stringify({state:'DEPLOYED_RECEIPTS_CONFIRMED',core:d.client.contract_id,vault_enabled:false}));}
        else if(command==='settle')console.log(JSON.stringify(await (plan.kind===EXPIRY_KIND?settleExpiry:settle)(workspace)));
        else if(command==='sample')console.log(JSON.stringify(await sampleNative(workspace)));
        else if(command==='recover'){const a=adminFor(directory,plan),r=await a.journal.get(v.operation);console.log(JSON.stringify(await a.recover(r.intent,v.hash)));}
        else if(['bootstrap','serve'].includes(command)){
            const port=Number(v.port??(command==='bootstrap'?8791:8790));if(!Number.isInteger(port)||port<0||port>65535)throw Error('INVALID_PORT');
            const service=await (command==='bootstrap'?startBootstrap:serve)({...workspace,port});
            console.log(`${command==='bootstrap'?'Testnet funding review':'Testnet wallet desk'}: ${service.url}`);
            for(const s of ['SIGINT','SIGTERM'])process.once(s,async()=>{await service.stop();process.exit(0);});
        }else throw Error('COMMAND_REQUIRED');
    }
}catch(e){
    console.error(JSON.stringify({state:'TESTNET_SETUP_FAILED',code:/^[A-Z_]{1,80}$/.test(e.code??'')?e.code:'UNCLASSIFIED',error_class:/^[A-Za-z0-9_]{1,80}$/.test(e.name??'')?e.name:'Error'}));
    console.error(e.code==='DEPLOYMENT_ON_HOLD'?'DEPLOYMENT_ON_HOLD: oracle integration and funding budget are under review. Do not fund the old setup plan.':'TESTNET_SETUP_FAILED: check the retained workspace, funding, receipt state, RPC availability and port. No automatic resend or reset. Commands: prepare-expiry, prepare-native, prepare, status, bootstrap, deploy, create-series, serve, settle, sample, recover.');process.exitCode=1;
}
