import EmbeddedPostgres from '../../services/indexer/node_modules/embedded-postgres/dist/index.js';
import {createServer} from 'node:net';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export async function freePort() {
    const server=createServer();await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    const port=server.address().port;await new Promise(r=>server.close(r));return port;
}
export async function startPostgres() {
    const root=fileURLToPath(new URL('../../target/',import.meta.url));await mkdir(root,{recursive:true});
    const directory=await mkdtemp(root+'inf01-pg-'),port=await freePort(),password=randomUUID();
    const runtime=new EmbeddedPostgres({databaseDir:directory+'/data',port,user:'postgres',password,
        persistent:true,createPostgresUser:false,autoRehydrateSymlinks:true,
        // Clients use loopback TCP. A checkout path can exceed Unix socket limits.
        postgresFlags:['-h','127.0.0.1','-k',''],initdbFlags:['--locale=C','--encoding=UTF8'],onLog:()=>{},onError:()=>{}});
    try {await runtime.initialise();await runtime.start();}
    catch{
        // stop() waits for a close event; do not wait again after an early exit.
        if(runtime.process&&runtime.process.exitCode===null&&runtime.process.signalCode===null)await runtime.stop().catch(()=>{});
        throw Error('POSTGRES_START_FAILED');
    }
    return {runtime,directory,config:{host:'127.0.0.1',port,user:'postgres',password,database:'postgres'}};
}
