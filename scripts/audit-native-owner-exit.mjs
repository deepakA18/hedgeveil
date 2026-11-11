// Read-only confirmation of the two owner-wallet exits; never loads signing keys.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {loadWorkspace,Q} from '../services/testnet/workspace.mjs';
import {privateRead} from '../services/demo/storage.mjs';
import {Client} from '../packages/sdk/client.mjs';
import {assess,matchTransaction} from '../packages/sdk/receipts.mjs';
import {completeOutcomes} from '../services/indexer/model.mjs';

const {directory,plan}=await loadWorkspace('native-transfer');
assert.equal(plan.network,'testnet');
const d=await privateRead(directory+'/deployment.json');
const client=new Client({config:d.client,journal:directory+'/wallet-journal'});
await client.rpc.verify();
const ids=['ce75637ffa74e1fa45d3d61b1d20acd46da86a2924a779a4016f6a81193724bc','180732a7b14484b1c2ae94a97772097fc49326d51da87b3b7c66064bf2108ea8'];
const operations=[];
for(const id of ids){
 const record=await client.record(id);assert.equal(record.intent.signer_id,'0xdeepak18.testnet');assert(record.attempted&&record.hash);
 const receipt=await client.rpc.request('tx',{tx_hash:record.hash,sender_account_id:record.intent.signer_id,wait_until:'FINAL'});
 matchTransaction(receipt,record.intent,record.hash);completeOutcomes(receipt,receipt.transaction);
 const result=await assess(client.rpc,receipt,record.intent,record.hash);
 assert.equal(result.state,record.intent.method==='redeem'?'SUCCEEDED':'WITHDRAWAL_SUCCEEDED');
 operations.push({intent:record.intent,result,receipt});
}
const head=await client.rpc.request('block',{finality:'final'});
const view=async(method,args)=>{
 const query=await client.rpc.request('query',{request_type:'call_function',account_id:d.client.contract_id,block_id:head.header.hash,method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')});
 assert.equal(query.block_hash,head.header.hash);return JSON.parse(Buffer.from(query.result).toString());
};
const [series,account,tickets]=await Promise.all([view('get_series',{series_id:'eta'}),view('get_account',{account_id:'0xdeepak18.testnet'}),view('list_tickets',{account_id:'0xdeepak18.testnet',from_index:0,limit:16})]);
assert.notEqual(series.final_price,null);
assert.deepEqual(operations[0].intent.args,{amount:String(Q/20n),leg:'P',series_id:'eta'});
assert.deepEqual(operations[1].intent.args,{amount:String(Q/50n),receiver:'0xdeepak18.testnet'});
const ticket=tickets.find(t=>t.id===operations[1].result.ticket_id);assert(ticket);
assert.equal(ticket.owner,'0xdeepak18.testnet');assert.equal(ticket.receiver,ticket.owner);
assert.equal(ticket.amount,String(Q/50n));assert.equal(ticket.state,'SUCCEEDED');assert.equal(ticket.balance_restored,false);
const events=operations[0].receipt.receipts_outcome.filter(r=>r.outcome.executor_id===d.client.contract_id).flatMap(r=>r.outcome.logs.filter(l=>l.startsWith('EVENT_JSON:')).flatMap(l=>{const e=JSON.parse(l.slice(11));return e.standard==='hedgeveil'?e.data:[];}));
const deltas=events.flatMap(e=>e.deltas).filter(x=>x.account_id==='0xdeepak18.testnet'&&x.bucket==='FREE');
const expected=Q/20n*BigInt(series.p_coefficient)/Q;
assert.equal(deltas.filter(x=>x.asset.kind==='COLLATERAL'&&x.direction==='CREDIT').reduce((n,x)=>n+BigInt(x.amount),0n),expected);
assert.equal(deltas.filter(x=>x.asset.kind==='P'&&x.asset.series_id==='eta'&&x.direction==='DEBIT').reduce((n,x)=>n+BigInt(x.amount),0n),Q/20n);
const report={scope:'Actual owner-wallet signed P redemption and native withdrawal; read-only receipt and ticket verification, not independent review',observed_at:new Date().toISOString(),operations,head,series,account,ticket,expected_redemption_payout:String(expected),passed:true};
await writeFile('research/reports/native-public-owner-eta-exit.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,redemption:operations[0].result.hash,withdrawal:operations[1].result.hash,payout:String(expected),ticket}));
