import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('SIGTERM drains work before the database exit hook, including work beyond its original five-second timeout',{timeout:20000},async()=>{
 const script=`
 import {startPostgres} from './tests/indexer/postgres.mjs';
 import {coordinatedDatabaseStop} from './services/testnet/shutdown.mjs';
 import pg from './services/indexer/node_modules/pg/lib/index.js';
 import {rm} from 'node:fs/promises';
 const db=await startPostgres(),pool=new pg.Pool(db.config);
 let draining=false;
 const coordination=coordinatedDatabaseStop(db.runtime,async stopDatabase=>{
  if(draining)throw Error('DOUBLE_DRAIN');draining=true;
  await new Promise(r=>setTimeout(r,6000));
  await pool.query('SELECT 1');console.log('DRAIN_DATABASE_AVAILABLE');
  await pool.end();await stopDatabase();await rm(db.directory,{recursive:true});
  console.log('DRAIN_COMPLETE');coordination.release();
 });
 console.log('READY');
 `;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:['ignore','pipe','pipe']});
 let output='',errors='';child.stderr.on('data',b=>{errors+=b;});
 child.stdout.on('data',b=>{output+=b;if(output.includes('READY')&&!child.killed)child.kill('SIGTERM');});
 const [code]=await once(child,'exit');
 assert.equal(code,143,errors);assert.match(output,/DRAIN_DATABASE_AVAILABLE\nDRAIN_COMPLETE/);
 assert.equal(output.match(/DRAIN_COMPLETE/g)?.length,1);
});
