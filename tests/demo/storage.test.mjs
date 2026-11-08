import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat,chmod,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {privateRead,durableWrite,privateDirectory,alive} from '../../services/demo/storage.mjs';
test('retained state writes atomically with private permissions and refuses unsafe files',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hedgeveil-state-'));try{
 await privateDirectory(dir);const file=path.join(dir,'state.json');await durableWrite(file,{v:1});assert.deepEqual(await privateRead(file),{v:1});assert.equal((await stat(file)).mode&0o777,0o600);
 await durableWrite(file,{v:2});assert.deepEqual(await privateRead(file),{v:2});
 await chmod(file,0o644);await assert.rejects(privateRead(file),/PRIVATE_FILE_PERMISSIONS/);await chmod(file,0o600);
 await symlink(file,path.join(dir,'link.json'));await assert.rejects(privateRead(path.join(dir,'link.json')));
 await chmod(dir,0o755);await assert.rejects(privateDirectory(dir),/PRIVATE_DIRECTORY_PERMISSIONS/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('process guards reject malformed ownership records and detect the current process',()=>{assert.equal(alive(process.pid),true);for(const pid of [0,1,-1,'2',null])assert.throws(()=>alive(pid));});
