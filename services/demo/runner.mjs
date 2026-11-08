// Runs behind a supervisor so terminal signals first drain HTTP/SDK work via IPC.
let demo,stopRequested=false,stopping=false;
const notify=m=>{if(process.connected)process.send(m,()=>{});};
const disconnect=()=>{if(process.connected)process.disconnect();};
async function stop(){stopRequested=true;if(!demo||stopping)return;stopping=true;try{await demo.stop();notify({type:'stopped'});}catch{notify({type:'error',code:'DEMO_STOP_FAILED'});process.exitCode=1;}finally{disconnect();}}
process.on('message',m=>{if(m?.type==='stop')void stop();});
process.on('disconnect',()=>{void stop();});
try {
    const {openWorkspace}=await import('./workspace.mjs');
    const {startDemo}=await import('../../apps/web/demo.mjs');
    const workspace=await openWorkspace(process.argv[3],process.argv[2]);
    demo=await startDemo({workspace});
    if(stopRequested)await stop();else notify({type:'ready',url:demo.url,directory:demo.work,config:demo.config,accounts:demo.accounts});
}catch(e){
    // Errors from runtimes/signers can contain local paths or key material. Only stable codes leave this process.
    const allowed=['SIGNER_KEY_MISMATCH','DEMO_PORT_IN_USE','DEMO_ALREADY_RUNNING','ORPHAN_SERVICE_RUNNING','MANIFEST_MISMATCH','RUNTIME_MISMATCH','SANDBOX_BINARY_MISMATCH','PRIVATE_FILE_PERMISSIONS','PRIVATE_DIRECTORY_PERMISSIONS','SIGNER_STATE_MISSING','MAKER_KEY_MISMATCH','ARTIFACT_HASH_MISMATCH','DEPLOYMENT_MISMATCH','INVALID_DEMO_NAME'];
    const code=allowed.includes(e?.message)?e.message:e?.code==='EEXIST'?'WORKSPACE_EXISTS':e?.code==='ENOENT'?'WORKSPACE_INCOMPLETE_OR_MISSING':'DEMO_START_FAILED';
    notify({type:'error',code});process.exitCode=1;disconnect();
}
