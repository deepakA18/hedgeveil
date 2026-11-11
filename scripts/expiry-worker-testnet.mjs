// Isolated testnet worker probe. No clearinghouse, maker or owner-wallet writes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWorkspace,providerFor,verifyChain,Q} from '../services/testnet/workspace.mjs';
import {privateRead} from '../services/demo/storage.mjs';
import {AdminTransactions} from '../services/testnet/transactions.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const [mode,expiry]=process.argv.slice(2);
if(!['inspect','publish','execute'].includes(mode))throw Error('MODE');
const {directory,plan}=await loadWorkspace('native-transfer');
if(plan.network!=='testnet')throw Error('TESTNET_ONLY');
const rpc=providerFor({...plan,rpc_url:'https://rpc.testnet.fastnear.com/'});
await verifyChain(rpc,plan);
const signer=plan.accounts.find(a=>a.role==='administrator').id;
const wasm=await readFile('services/expiry-worker/target/wasm32-wasip2/release/hedgeveil-expiry-worker.wasm');
const hash=sha(wasm),receiver='outlayer.testnet';
const url=`https://test.fastfs.io/${signer}/${receiver}/${hash}.wasm`;
const block=await rpc.sendJsonRpc('block',{finality:'final'});
const view=async(method,args={})=>{try{return await rpc.callFunction({contractId:receiver,method,args,blockQuery:{blockId:block.header.hash}});}catch{return {unavailable:true};}};
const contract=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:receiver,block_id:block.header.hash});
const balance=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:signer,block_id:block.header.hash});
if(mode==='inspect'){
 console.log(JSON.stringify({signer,balance:balance.amount,wasm_bytes:wasm.length,wasm_sha256:hash,url,contract,stats:await view('get_stats'),config:await view('get_config')}));
 process.exit(0);
}
const expectedCode='AsbxRWTQ2mQAazgz1bbAC72oZ1H8UKL33JKwZmG2pjn2';
if(contract.code_hash!==expectedCode)throw Error('OUTLAYER_CODE_CHANGED');
if(BigInt(balance.amount)<Q/10n||wasm.length>900000)throw Error('BOUNDED_BUDGET');
const admin=new AdminTransactions({provider:rpc,journal:directory+'/expiry-worker-journal',identity:{kind:'expiry-worker-probe-v1',network:'testnet',genesis_hash:plan.genesis_hash,signer},verify:async()=>{
 await verifyChain(rpc,plan);
 const state=await rpc.sendJsonRpc('query',{request_type:'view_account',account_id:receiver,finality:'final'});
 if(state.code_hash!==expectedCode)throw Error('OUTLAYER_CODE_CHANGED');
}});
const {keys}=await privateRead(directory+'/signers.json');
if(mode==='publish'){
 const bytes=b=>{const n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};
 const raw=Buffer.concat([Buffer.from([0]),bytes(Buffer.from(hash+'.wasm')),Buffer.from([1]),bytes(Buffer.from('application/wasm')),bytes(wasm)]);
 const intent=await admin.prepare('publish-'+hash,signer,receiver,[{type:'FunctionCall',method:'__fastdata_fastfs',args_base64:raw.toString('base64'),deposit:'0',gas:'1000000000'}]);
 try{await admin.send(intent,keys[signer]);}catch(e){if(e.message!=='ADMIN_OPERATION_UNRESOLVED')throw e;}
 const record=await admin.journal.get(intent.operation_id);
 if(!['SUCCEEDED','FAILED_CONFIRMED'].includes(record.result?.state))throw Error('PUBLISH_RECEIPT_UNKNOWN_NO_RESEND');
 // FastFS indexes transaction bytes even when the deliberately tiny-gas call fails.
 // Treat this solely as recorded data, never successful contract execution.
 const report={kind:'FASTFS_TRANSACTION_DATA',hash,url,transaction_hash:record.hash,execution_state:record.result.state,receipt:admin.evidence.get(intent.operation_id)};
 await writeFile(`research/reports/expiry-worker-publish-${hash}.json`,JSON.stringify(report)+'\n');
 console.log(JSON.stringify({data_recorded:true,execution_state:report.execution_state,transaction_hash:record.hash,url}));
}else{
 if(!/^[1-9][0-9]{0,10}$/.test(expiry??''))throw Error('EXPIRY_REQUIRED');
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
 if(response.status!==200||sha(Buffer.from(await response.arrayBuffer()))!==hash)throw Error('PUBLISHED_WASM_UNVERIFIED');
 // Inspect deployed interface first. Both spellings bind the same explicit source;
 // unused JSON fields are ignored by NEAR argument deserialization.
 const source={WasmUrl:{url,hash,build_target:'wasm32-wasip2'}};
 const args={source,execution_source:source,resource_limits:{max_instructions:10000000000,max_memory_mb:128,max_execution_seconds:60},input_data:JSON.stringify({expiry_seconds:expiry}),secrets_ref:null,response_format:'Json',payer_account_id:signer,params:null,callback_receiver_id:null};
 const intent=await admin.prepare('execute-'+hash+'-'+expiry,signer,receiver,[{type:'FunctionCall',method:'request_execution',args,deposit:String(Q/50n),gas:'250000000000000'}]);
 try{await admin.send(intent,keys[signer]);}catch(e){if(e.message!=='ADMIN_OPERATION_UNRESOLVED')throw e;}
 const record=await admin.journal.get(intent.operation_id);
 const receipt=admin.evidence.get(intent.operation_id);
 const report={kind:'OUTLAYER_HISTORICAL_EXECUTION_PROBE',hash,url,request:args,transaction_hash:record.hash,state:record.result?.state??'UNKNOWN',receipt,settlement_eligible:false};
 await writeFile(`research/reports/expiry-worker-execution-${hash}-${expiry}.json`,JSON.stringify(report)+'\n');
 console.log(JSON.stringify({state:report.state,transaction_hash:record.hash,settlement_eligible:false}));
}
