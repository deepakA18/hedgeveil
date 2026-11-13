import test from 'node:test';
import assert from 'node:assert/strict';
import {coreSurplus,walletSurplus,RECOVERY_BUFFER as B} from '../../services/testnet/recovery-policy.mjs';
test('recovery preserves liabilities, operating allocation, native storage and a gas buffer',()=>{
 const s={pending_in_flight:'0',unknown_in_flight:'0',storage_bytes:'10',storage_byte_cost:'5',retained_categories:String(20n*B)};
 assert.equal(coreSurplus(s,String(30n*B)),9n*B);
 assert.equal(coreSurplus(s,String(20n*B)),0n);
 for(const k of ['pending_in_flight','unknown_in_flight'])assert.throws(()=>coreSurplus({...s,[k]:'1'},String(30n*B)),/UNRESOLVED/);
 assert.equal(coreSurplus({...s,storage_bytes:String(40n*B),storage_byte_cost:'1'},String(42n*B)),B);
 assert.equal(walletSurplus(String(2n*B+50n),10,5),B);
});
