import test from 'node:test';
import assert from 'node:assert/strict';
import {renewalBudget,harvestOperations} from '../../services/testnet/renewal.mjs';
import {ReadCache} from '../../services/maker/read-cache.mjs';
const Q=10n**24n;
test('renewal protects native storage, gas buffer, unresolved sponsorship and all-user collateral',()=>{
 const input={operations:[{signer:'root',deposit:String(Q/10n)}],balances:{root:{amount:String(Q),storage_usage:100}},byteCost:'10000000000000000000',root:'root',unresolved:20};
 assert.doesNotThrow(()=>renewalBudget(input));
 assert.throws(()=>renewalBudget({...input,balances:{root:{...input.balances.root,amount:String(Q/2n)}}}),/RENEWAL_SERVICE_BUDGET/);
 assert.throws(()=>renewalBudget({...input,balances:{}}),/RENEWAL_BALANCE_REQUIRED/);
});
test('harvest never reads a user position and leaves unmatched delayed exposure intact',()=>{
 const s={slot:0,config:{series_id:'s',mint_cutoff_ns:'10'},request:null,final_price:null,outstanding_p:'100',outstanding_n:'100',reserve:'100'};
 const accounts={maker:{closing:false,positions:[{p:'30',n:'20'}]},user:{positions:[{p:'70',n:'80'}]}};
 assert.deepEqual(harvestOperations([s],[{id:'maker'}],accounts,'core','root','9'),[]);
 const ops=harvestOperations([s],[{id:'maker'}],accounts,'core','root','10');assert.equal(ops.length,1);assert.equal(ops[0].method,'merge');assert.equal(ops[0].args.amount,'20');assert.equal(ops[0].signer,'maker');
 assert.equal(harvestOperations([{...s,request:{id:'1'}}],[{id:'maker'}],accounts,'core','root','10').length,0);
 const final=harvestOperations([{...s,final_price:'123'}],[{id:'maker'}],accounts,'core','root','10');assert.deepEqual(final.map(o=>o.method),['redeem','redeem']);
 const empty=harvestOperations([{...s,final_price:'123',outstanding_p:'0',outstanding_n:'0'}],[],{},'core','root','10');assert.deepEqual(empty.map(o=>o.method),['release_dust','archive_series']);
});
test('read cache coalesces ten concurrent loads, expires, and never falls back after errors or reset',async()=>{
 let now=0,calls=0;const c=new ReadCache({ttlMs:2000,clock:()=>now});
 const values=await Promise.all(Array.from({length:10},()=>c.get(async()=>{calls++;return {block:'a'};})));assert.equal(calls,1);assert(values.every(v=>v.block==='a'));
 now=1999;await c.get(()=>{throw Error('unexpected')});
 now=2000;await assert.rejects(c.get(()=>{throw Error('RPC_DOWN')}),/RPC_DOWN/);
 assert.deepEqual(await c.get(async()=>({block:'b'})),{block:'b'});c.clear();assert.deepEqual(await c.get(async()=>({block:'c'})),{block:'c'});
 let resolve;const pending=c.get(async()=>({block:'cached'}));await pending;c.clear();
 const old=c.get(()=>new Promise(r=>resolve=r));await Promise.resolve();c.clear();const fresh=await c.get(async()=>({block:'new'}));resolve({block:'old'});await old;assert.equal((await c.get(()=>{})).block,fresh.block);
});

test('slow successful reads can serve the next queued request within the bounded cache lifetime',async()=>{
 let now=0,calls=0;const c=new ReadCache({ttlMs:2000,clock:()=>now});
 const load=async()=>{calls++;now+=10000;return {block:'pinned'};};
 await c.get(load);now+=1000;await c.get(load);assert.equal(calls,1);
 now+=1000;await c.get(load);assert.equal(calls,2);
});
