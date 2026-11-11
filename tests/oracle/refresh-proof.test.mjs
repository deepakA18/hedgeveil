import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {verifyRefreshProof} from '../../services/outlayer/refresh-proof.mjs';
const proof=JSON.parse(await readFile(new URL('../../research/reports/outlayer-wallet-refresh-verification.json',import.meta.url))),pins=JSON.parse(await readFile(new URL('../../deploy/testnet/outlayer-observation-pins.json',import.meta.url))).testnet;
test('actual wallet refresh binds exact request, complete receipt tree and callback-block source report',()=>{
 const p=verifyRefreshProof(proof,pins);assert.equal(p.price,'3618966660000');assert.equal(p.refresh_verified,true);assert.equal(p.public_lifecycle_complete,false);
});
test('wrong signer, deposit, chain, code, callback block, missing receipt and stale ingestion all reject',()=>{
 for(const mutate of [p=>p.receipt.transaction.signer_id='wrong.testnet',p=>p.receipt.transaction.actions[0].FunctionCall.deposit='1',p=>p.status.chain_id='mainnet',p=>p.source.code_hash='wrong',p=>p.asset.block_hash='wrong',p=>p.receipt.receipts_outcome.pop(),p=>{const a=JSON.parse(Buffer.from(p.asset.result));a.reports[0].timestamp='1';p.asset.result=[...Buffer.from(JSON.stringify(a))];}]){const p=structuredClone(proof);mutate(p);assert.throws(()=>verifyRefreshProof(p,pins));}
});
