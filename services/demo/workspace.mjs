import {mkdir,lstat,cp,rm,readFile,open} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
import EmbeddedPostgres from '../indexer/node_modules/embedded-postgres/dist/index.js';
import {freePort} from '../../tests/indexer/postgres.mjs';
import {privateRead,privateDirectory,durableWrite,problem,alive} from './storage.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../tests/sandbox/package.json',import.meta.url));
const {Sandbox}=await import(require.resolve('near-sandbox'));
const BINARY=path.join(ROOT,'tests/sandbox/node_modules/near-sandbox/bin/near-sandbox-2.14.0/near-sandbox');
const hash=b=>createHash('sha256').update(b).digest('hex');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function portAvailable(port){if(!Number.isInteger(port)||port<1||port>65535)problem('RUNTIME_PORT');const server=createServer();await new Promise((r,j)=>{server.once('error',()=>j(Error('DEMO_PORT_IN_USE')));server.listen(port,'127.0.0.1',r);});await new Promise(r=>server.close(r));}

export function workspacePath(name) {
    if(typeof name!=='string'||! /^[a-z][a-z0-9-]{0,31}$/.test(name))problem('INVALID_DEMO_NAME');
    return path.join(ROOT,'target/demos',name);
}
export async function inspectWorkspace(name) {
    const directory=workspacePath(name);await privateDirectory(directory);
    const ready=await privateRead(path.join(directory,'ready.json'));
    if(ready.version!==1||ready.kind!=='hedgeveil-sandbox-demo')problem('WORKSPACE_VERSION');
    const manifest=await privateRead(path.join(directory,'deployment.json'));
    if(hash(Buffer.from(JSON.stringify(manifest)))!==ready.manifest_hash)problem('MANIFEST_MISMATCH');
    if(manifest.config?.network!=='sandbox')problem('SANDBOX_ONLY');
    return {directory,manifest};
}
export async function openWorkspace(name,mode) {
    if(!['create','resume'].includes(mode))problem('DEMO_MODE');
    const directory=workspacePath(name),parent=path.dirname(directory);
    await mkdir(parent,{recursive:true});
    for(const dir of [path.dirname(parent),parent])if((await lstat(dir)).isSymbolicLink())problem('SYMLINK_DIRECTORY');
    if(mode==='create')await privateDirectory(directory,{create:true});else await privateDirectory(directory);
    const lock=path.join(directory,'running'),owner={pid:process.pid,token:randomUUID()};
    try{await mkdir(lock,{mode:0o700});}catch(e){
        if(e.code!=='EEXIST')throw e;
        const old=await privateRead(path.join(lock,'owner.json'));
        if(alive(old.pid))problem('DEMO_ALREADY_RUNNING');
        // Only stale metadata is removed. No process is signalled and no data is reset.
        await rm(lock,{recursive:true});await mkdir(lock,{mode:0o700});
    }
    await durableWrite(path.join(lock,'owner.json'),owner);
    let saved=null,secrets=null,runtime=null,native=null,pg=null,processes=[],released=false;
    async function release(){if(released)return;const current=await privateRead(path.join(lock,'owner.json'));if(current.token!==owner.token)problem('LOCK_CHANGED');await rm(lock,{recursive:true});released=true;}
    try {
        if(mode==='resume') {
            ({manifest:saved}=await inspectWorkspace(name));
            secrets=await privateRead(path.join(directory,'signers.json'));
            runtime=await privateRead(path.join(directory,'runtime.json'));
            if(runtime.version!==1||runtime.binary_hash!==hash(await readFile(BINARY)))problem('SANDBOX_BINARY_MISMATCH');
            if(saved.runtime_hash!==hash(Buffer.from(JSON.stringify(runtime))))problem('RUNTIME_MISMATCH');
            const retained=await privateRead(path.join(directory,'processes.json'));
            if(retained.some(alive))problem('ORPHAN_SERVICE_RUNNING');
            if(secrets.version!==1||!Array.isArray(secrets.keys)||typeof secrets.password!=='string')problem('SIGNER_STATE_INVALID');
        }else{
            runtime={version:1,rpc_port:await freePort(),network_port:await freePort(),pg_port:await freePort(),ui_port:await freePort()};
            if(new Set([runtime.rpc_port,runtime.network_port,runtime.pg_port,runtime.ui_port]).size!==4)problem('PORT_ALLOCATION_COLLISION');
            secrets={version:1,password:randomUUID(),keys:[]};
            await durableWrite(path.join(directory,'signers.json'),secrets);
            await durableWrite(path.join(directory,'processes.json'),[]);
        }
        for(const port of [runtime.rpc_port,runtime.network_port,runtime.pg_port,runtime.ui_port])await portAvailable(port);
        const rpc_url=`http://127.0.0.1:${runtime.rpc_port}/`;
        async function track(pid){processes.push(pid);await durableWrite(path.join(directory,'processes.json'),processes);}
        async function startSandbox() {
            const home=path.join(directory,'chain');
            if(mode==='create') {
                const seed=await Sandbox.start({version:'2.14.0',config:{additionalGenesis:{epoch_length:1000000}}});
                await seed.stop();await cp(seed.homeDir,home,{recursive:true,errorOnExist:true,force:false});await rm(seed.homeDir,{recursive:true});
                runtime.binary_hash=hash(await readFile(BINARY));await durableWrite(path.join(directory,'runtime.json'),runtime);
            }else{if(!(await lstat(path.join(home,'data'))).isDirectory())problem('CHAIN_DATA_MISSING');}
            const log=await open(path.join(directory,'node.log'),'a',0o600);
            const child=spawn(BINARY,['--home',home,'run','--rpc-addr',`127.0.0.1:${runtime.rpc_port}`,'--network-addr',`127.0.0.1:${runtime.network_port}`],{stdio:['ignore',log.fd,log.fd]});await log.close();
            let exited=false,spawnError=false;const done=new Promise(r=>{child.once('exit',()=>{exited=true;r();});child.once('error',()=>{spawnError=true;exited=true;r();});});
            native={rpcUrl:rpc_url,stop:async()=>{if(!exited){child.kill('SIGINT');await done;}}};
            if(child.pid)await track(child.pid);
            for(let i=0;i<100;i++){
                if(exited||spawnError)problem('SANDBOX_START_FAILED');
                try{const response=await fetch(rpc_url+'status',{signal:AbortSignal.timeout(500)});if(response.ok){await response.body?.cancel();await wait(100);if(exited)problem('SANDBOX_START_FAILED');return native;}}catch{}
                await wait(100);
            }
            problem('SANDBOX_START_TIMEOUT');
        }
        async function startPostgres() {
            const config={host:'127.0.0.1',port:runtime.pg_port,user:'postgres',password:secrets.password,database:'postgres'};
            const db=path.join(directory,'postgres');
            const service=new EmbeddedPostgres({databaseDir:db,port:runtime.pg_port,user:config.user,password:config.password,persistent:true,createPostgresUser:false,autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-k',''],initdbFlags:['--locale=C','--encoding=UTF8'],onLog:()=>{},onError:()=>{}});
            if(mode==='create')await service.initialise();else if((await readFile(path.join(db,'PG_VERSION'),'utf8')).trim()!=='18')problem('POSTGRES_VERSION_MISMATCH');
            await service.start();pg={runtime:service,config};await track(Number((await readFile(path.join(db,'postmaster.pid'),'utf8')).split('\n')[0]));return pg;
        }
        async function save({keys,config,accounts,material,manifest,indexConfig}) {
            if(mode!=='create')return;
            secrets.keys=[...keys];await durableWrite(path.join(directory,'signers.json'),secrets);
            const {postgres,...publicIndex}=indexConfig;
            const deployment={version:1,config,accounts,material,artifacts:manifest,indexConfig:publicIndex,runtime_hash:hash(Buffer.from(JSON.stringify(runtime)))};
            await durableWrite(path.join(directory,'deployment.json'),deployment);
            await durableWrite(path.join(directory,'ready.json'),{version:1,kind:'hedgeveil-sandbox-demo',manifest_hash:hash(Buffer.from(JSON.stringify(deployment)))});
        }
        async function cleanup(){
            let failure;
            for(const fn of [()=>native?.stop(),()=>pg?.runtime.stop()])try{await fn();}catch(e){failure??=e;}
            if(!failure){await durableWrite(path.join(directory,'processes.json'),[]);await release();}else throw failure;
        }
        return {directory,saved: saved?{...saved,keys:secrets.keys}:null,port:runtime.ui_port,startSandbox,startPostgres,save,cleanup};
    }catch(e){await release();throw e;}
}
