import test from 'node:test';
import assert from 'node:assert/strict';
import {expiredUnfilledQuote} from '../../packages/sdk/quote-recovery.mjs';
import {Client} from '../../packages/sdk/client.mjs';
const hash='11111111111111111111111111111111';
function fixture() {
  const record={attempted:true,hash:null,candidate_hash:null,binding:{code_hash:'pinned'},intent:{operation_id:'a'.repeat(64),method:'fill_quote',domain:{contract_id:'core.testnet'},args:{quote:{maker:'maker.testnet',expiry_ns:'100',cancellation_epoch:'0',nonce:'23'}}}};
  const block={header:{hash,timestamp_nanosec:'100'}};
  const code={block_hash:hash,code_hash:'pinned'};
  const market={epoch:'0',consumed:Array(32).fill(0)};
  const rpc={async request(method,args){if(method==='block'){assert.deepEqual(args,{finality:'final'});return block;}assert.equal(args.block_id,hash);assert.equal(args.account_id,'core.testnet');return code;},async view(method,args,at){assert.equal(method,'get_market');assert.equal(args.maker,'maker.testnet');assert.equal(at,hash);return market;}};
  return {record,block,code,market,rpc};
}
test('expiry plus same-epoch unused nonce proves no fill, retaining block evidence',async()=>{
  const f=fixture(),out=await expiredUnfilledQuote(f.rpc,f.record);
  assert.equal(out.result.state,'QUOTE_EXPIRED_UNFILLED');assert.equal(out.evidence.block_hash,hash);assert.equal(out.evidence.nonce,'23');
});
test('time alone, changed epoch, consumed nonce, changed code and malformed evidence never resolve',async()=>{
  for(const edit of [f=>f.block.header.timestamp_nanosec='99',f=>f.market.epoch='1',f=>f.market.consumed[2]=128,f=>f.code.code_hash='changed',f=>f.code.block_hash='other',f=>f.market.consumed=[],f=>f.market.consumed[2]=-1,f=>f.record.hash=hash,f=>f.record.candidate_hash=hash,f=>f.record.attempted=false,f=>f.record.intent.method='request_withdrawal']){
    const f=fixture();edit(f);assert.equal(await expiredUnfilledQuote(f.rpc,f.record),null);
  }
});
test('client retains UNKNOWN on RPC failure; proven no-fill is recorded without claiming or sending',async()=>{
  const f=fixture();let evidence;
  const client={rpc:{...f.rpc,verify:async()=>{}},record:async()=>f.record,journal:{observe:async(id,result,proof)=>{evidence=proof;return result;}}};
  assert.equal((await Client.prototype.recover.call(client,'a'.repeat(64))).state,'QUOTE_EXPIRED_UNFILLED');assert.equal(evidence.block_hash,hash);
  client.rpc.request=async()=>{throw Error('offline');};
  assert.equal((await Client.prototype.recover.call(client,'a'.repeat(64))).state,'SUBMISSION_UNKNOWN');
});
