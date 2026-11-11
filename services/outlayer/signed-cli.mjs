import {parseArgs} from 'node:util';
import {readFile} from 'node:fs/promises';
import {strictJson,verifySigned,requireCurrent} from './signed.mjs';
import {archiveSigned,replayArchive,currentFromArchive} from './archive.mjs';

// Offline only. No implicit .env loading, signer, RPC, paid request or fallback.
const {values:v,positionals:[command]}=parseArgs({allowPositionals:true,options:{input:{type:'string'},archive:{type:'string'},'public-key':{type:'string'}}});
try{
    if(!['verify','ingest','replay','current'].includes(command)||!v['public-key'])throw Error('SIGNED_COMMAND');
    const options={pinned_key:v['public-key']};let results;
    if(['replay','current'].includes(command)){
        results=await replayArchive(v.archive,options);
        if(command==='current')results=[currentFromArchive(results,{now_sec:String(Math.floor(Date.now()/1000))})];
    }else{
        const input=strictJson(await readFile(v.input,'utf8'));
        results=[command==='ingest'?await archiveSigned(v.archive,input,options):verifySigned(input,options)];
    }
    console.log(JSON.stringify({mode:command,settlement_eligible:false,observations:results.map(({artifact,...o})=>{
        let current=false;try{requireCurrent(o,{now_sec:String(Math.floor(Date.now()/1000))});current=true;}catch{}
        return {...o,current};
    })},null,2));
}catch(e){console.error(/^SIGNED_[A-Z_]+$/.test(e.code??'')?e.code:'SIGNED_INTAKE_FAILED');process.exitCode=1;}
