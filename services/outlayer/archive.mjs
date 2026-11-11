import {mkdir,readFile,readdir,open,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fail} from '../../packages/sdk/intent.mjs';
import {verifyArtifact,verifySigned,strictJson,requireCurrent} from './signed.mjs';

// Immutable, content-addressed evidence, not a promise of historical completeness.
// A file is made visible only after fsync; hard-link creation never replaces it.
export async function archiveSigned(directory,envelope,options){
    const observation=verifySigned(envelope,options),data=JSON.stringify(observation.artifact)+'\n';
    await mkdir(directory,{recursive:true});
    const file=join(directory,observation.payload_hash+'.json'),temp=join(directory,'.'+randomUUID()+'.tmp');
    const handle=await open(temp,'wx',0o600);let duplicate=false;
    try{
        await handle.writeFile(data);await handle.sync();await handle.close();
        try{await link(temp,file);}catch(e){if(e.code!=='EEXIST')throw e;
            if(await readFile(file,'utf8')!==data)fail('SIGNED_ARCHIVE_CONFLICT');duplicate=true;}
        const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}
    }finally{await handle.close();await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
    return {...observation,duplicate};
}
export async function replayArchive(directory,options){
    const names=await readdir(directory),observations=[];
    if(names.length>10000)fail('SIGNED_ARCHIVE_LIMIT');
    for(const name of names.sort()){
        if(/^\.[0-9a-f-]+\.tmp$/.test(name))continue; // Unpublished interrupted write.
        if(!/^[0-9a-f]{64}\.json$/.test(name))fail('SIGNED_ARCHIVE_FILENAME');
        const o=verifyArtifact(strictJson(await readFile(join(directory,name),'utf8')),options);
        if(name!==o.payload_hash+'.json')fail('SIGNED_ARCHIVE_HASH');observations.push(o);
    }
    return observations.sort((a,b)=>BigInt(a.publish_time)<BigInt(b.publish_time)?-1:BigInt(a.publish_time)>BigInt(b.publish_time)?1:a.payload_hash.localeCompare(b.payload_hash));
}
export function currentFromArchive(observations,options){
    if(!observations.length)fail('SIGNED_NO_OBSERVATIONS');
    const latest=observations.reduce((a,b)=>BigInt(a.publish_time)>BigInt(b.publish_time)?a:b);
    if(observations.some(o=>o.asset_id!==latest.asset_id||o.public_key!==latest.public_key))fail('SIGNED_ARCHIVE_DOMAIN');
    if(observations.some(o=>o.publish_time===latest.publish_time&&o.price!==latest.price))fail('SIGNED_AMBIGUOUS_TIMESTAMP');
    return requireCurrent(latest,options);
}
