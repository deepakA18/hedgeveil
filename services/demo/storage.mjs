import {open,rename,mkdir,lstat,readFile,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

export function problem(code){const e=new Error(code);e.code=code;throw e;}
export async function privateRead(file) {
    const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
        const stat=await fd.stat();
        if(!stat.isFile()||(stat.mode&0o077)||stat.uid!==process.getuid()||stat.size>4*1024*1024)problem('PRIVATE_FILE_PERMISSIONS');
        try{return JSON.parse(await fd.readFile('utf8'));}catch{problem('PRIVATE_FILE_INVALID');}
    }finally{await fd.close();}
}
export async function durableWrite(file,value) {
    const dir=dirname(file),tmp=join(dir,`.pending-${randomUUID()}`);
    const fd=await open(tmp,'wx',0o600);
    try{await fd.writeFile(JSON.stringify(value)+'\n');await fd.sync();}finally{await fd.close();}
    try{await rename(tmp,file);const parent=await open(dir,'r');try{await parent.sync();}finally{await parent.close();}}
    finally{await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function privateDirectory(directory,{create=false}={}) {
    if(create)await mkdir(directory,{mode:0o700});
    const stat=await lstat(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)||stat.uid!==process.getuid())problem('PRIVATE_DIRECTORY_PERMISSIONS');
}
export function alive(pid) {
    if(!Number.isSafeInteger(pid)||pid<2)problem('INVALID_PROCESS_RECORD');
    try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;return true;}
}
export async function publicJson(file) {return JSON.parse(await readFile(file,'utf8'));}
