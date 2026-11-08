#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {setTimeout as sleep} from 'node:timers/promises';
import {ClientError,fail} from '../../packages/sdk/intent.mjs';
import {Indexer} from './indexer.mjs';
import {createApi} from './api.mjs';
let indexer,server,stopped=false;
process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
try {
    const {values,positionals}=parseArgs({allowPositionals:true,options:{config:{type:'string'}}});
    if(!values.config||positionals.length!==1||!['sync','serve'].includes(positionals[0]))fail('USAGE');
    const config=JSON.parse(await readFile(values.config,'utf8'));
    indexer=new Indexer(config);await indexer.init();
    if(positionals[0]==='sync')process.stdout.write(JSON.stringify(await indexer.sync())+'\n');
    else {
        server=createApi(indexer.store);
        await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(indexer.config.api_port,'127.0.0.1',resolve);});
        process.stdout.write(JSON.stringify({network:'sandbox',api:`http://127.0.0.1:${server.address().port}`,read_only:true})+'\n');
        while(!stopped) {
            try{await indexer.sync();}
            catch(e){process.stderr.write(JSON.stringify({error:e instanceof ClientError?e.code:'INDEXER_FAILURE',risk_allowed:false})+'\n');}
            if(!stopped)await sleep(indexer.config.poll_ms);
        }
    }
}catch(e){process.stderr.write(JSON.stringify({error:e instanceof ClientError?e.code:'INDEXER_FAILURE'})+'\n');process.exitCode=1;}
finally{if(server)await new Promise(r=>server.close(r));if(indexer)await indexer.close();}
