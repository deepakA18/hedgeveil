// Transport fixtures here establish boundary behavior, not public testnet execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {actionCreators} from '@near-wallet-selector/core';
import {Client,buildIntent,toWireIntent,walletSelectorSigner,walletReturn} from '../../packages/sdk/index.mjs';
import {Rpc,base58} from '../../packages/sdk/rpc.mjs';
const h = n => base58(Buffer.alloc(32,n));
const config = {network:'testnet',chain_id:'testnet',rpc_url:'https://rpc.testnet.near.org/',contract_id:'core.testnet',genesis_hash:h(1),code_hash:h(2)};
const input = {signer_id:'alice.testnet',method:'deposit_collateral',args:{},attached_deposit:'1000000000000000000000001'};
function fixture(i) {
    const row=(id,executor,status,receipt_ids=[],logs=[])=>({id,outcome:{executor_id:executor,status,receipt_ids,logs}});
    return {final_execution_status:'FINAL',transaction:{hash:h(3),signer_id:i.signer_id,receiver_id:i.domain.contract_id,actions:[{FunctionCall:{method_name:i.method,args:Buffer.from(JSON.stringify(i.args)).toString('base64'),gas:i.gas,deposit:i.attached_deposit}}]},
        transaction_outcome:row(h(3),i.signer_id,{SuccessReceiptId:h(4)},[h(4)]),receipts_outcome:[row(h(4),i.domain.contract_id,{SuccessValue:''},[],['EVENT_JSON:'+JSON.stringify({standard:'hedgeveil',version:'0.2.0',event:'ledger',data:[{kind:'event',schema_version:'0.2.0',domain:i.domain,actor:i.signer_id,event:'DEPOSIT',operation_id:'b'.repeat(64),deltas:[]}]})])]};
}
async function setup(t) {
    const dir=await mkdtemp(join(tmpdir(),'hv-wallet-'));t.after(()=>rm(dir,{recursive:true,force:true}));
    const state={offline:false,chain:'testnet',genesis:config.genesis_hash,code:config.code_hash,domain:'testnet',raw:null};
    const transport={fetchImpl:async(_url,{body})=>{
        const {method,params}=JSON.parse(body);let result;
        if(method==='status')result={chain_id:state.chain,genesis_hash:state.genesis};
        else if(method==='query'&&params.request_type==='view_account')result={code_hash:state.code};
        else if(method==='query')result={result:[...Buffer.from(JSON.stringify({protocol_version:'1',network:state.domain,contract_id:config.contract_id}))]};
        else if(method==='tx'){if(state.offline)throw Error('unavailable');result=state.raw;}
        else throw Error('unexpected test RPC');
        return {ok:true,json:async()=>({result})};
    }};
    const client=new Client({config,journal:dir,transport}),intent=await client.prepare(input);state.raw=fixture(intent);
    return {dir,client,intent,state,transport};
}
function selector(r,send=async()=>({transaction:{hash:h(3),signer_id:r.signerId,receiver_id:r.receiverId}})) {
    const state={selectedWalletId:'test-wallet',accounts:[{accountId:r.signerId,active:true}]};
    const wallet={id:'test-wallet',getAccounts:async()=>[{accountId:r.signerId}],signAndSendTransaction:send};
    return {options:{network:{networkId:r.network}},store:{getState:()=>state},wallet:async()=>wallet,state,instance:wallet};
}
test('testnet is explicit HTTPS with pinned chain; production and profile mixing rejected',()=>{
    assert.equal(new Rpc(config).config.network,'testnet');
    assert.throws(()=>{new Rpc(config).config.code_hash=h(9);},TypeError);
    for(const patch of [{network:'mainnet'},{chain_id:'mainnet'},{chain_id:'sandbox'},{rpc_url:'http://rpc.testnet.near.org/'},{rpc_url:'https://user:password@rpc.testnet.near.org/'},{rpc_url:'https://rpc.testnet.near.org/?key=secret'}])assert.throws(()=>new Rpc({...config,...patch}));
});
test('testnet intents preserve wire domain and reject unapproved vault and foreign quote domains',()=>{
    const i=buildIntent({...input,network:'testnet',contract_id:config.contract_id});
    assert.equal(toWireIntent(i).domain.network,'testnet');assert.equal(i.operation_id.length,64);
    for(const method of ['vault_mint_basket','vault_redeem_in_kind'])assert.throws(()=>buildIntent({...input,network:'testnet',contract_id:config.contract_id,method}),/TESTNET_VAULT_DISABLED/);
    assert.throws(()=>buildIntent({...input,network:'mainnet',contract_id:config.contract_id}),/NETWORK_DISABLED/);
    const quote=JSON.parse(readFileSync(new URL('../../fixtures/rfq/encoding-v1.json',import.meta.url))).vectors[0].quote;
    quote.domain.contract_id=config.contract_id;
    const order={...input,network:'testnet',contract_id:config.contract_id,method:'fill_quote',args:{quote},attached_deposit:'1'};
    assert.throws(()=>buildIntent(order),/QUOTE_DOMAIN_OR_PROFILE/);
    quote.domain.network='testnet';assert.equal(buildIntent(order).domain.network,'testnet');
});
test('concurrent handoffs have one durable winner and remain uncertain after restart',async t=>{
    const {client,intent,dir,transport}=await setup(t);
    const results=await Promise.allSettled(Array.from({length:6},()=>client.handoff(intent.operation_id)));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const r=results.find(x=>x.status==='fulfilled').value;assert.equal(r.network,'testnet');assert.equal(r.actions[0].deposit,input.attached_deposit);
    const restarted=new Client({config,journal:dir,transport});
    assert.equal((await restarted.recover(intent.operation_id)).state,'SUBMISSION_UNKNOWN');
    await assert.rejects(restarted.handoff(intent.operation_id),/ALREADY_ATTEMPTED/);
});
test('chain, genesis, code and domain changes block wallet handoff before consuming attempt',async t=>{
    const {client,intent,state}=await setup(t);
    for(const [key,bad] of [['chain','mainnet'],['genesis',h(8)],['code',h(9)],['domain','sandbox']]){
        const old=state[key];state[key]=bad;await assert.rejects(client.handoff(intent.operation_id),/DEPLOYMENT_MISMATCH/);state[key]=old;
        assert.equal((await client.record(intent.operation_id)).attempted,false);
    }
});
test('edited intent cannot diverge from pinned journal network or receiver',async t=>{
    const {client,intent,dir}=await setup(t),record=await client.record(intent.operation_id);
    for(const patch of [{network:'sandbox'},{contract_id:'other.testnet'}]){
        const changed=structuredClone(record);Object.assign(changed.intent.domain,patch);
        await writeFile(join(dir,intent.operation_id,'intent.json'),JSON.stringify(changed));
        await assert.rejects(client.handoff(intent.operation_id),/JOURNAL_DEPLOYMENT_MISMATCH/);
    }
});
test('official v10 action factory preserves exact integers and one explicit signer/receiver',async t=>{
    const {client,intent}=await setup(t),r=await client.handoff(intent.operation_id);let calls=0;
    const s=selector(r,async p=>{calls++;assert.equal(p.signerId,r.signerId);assert.equal(p.receiverId,r.receiverId);assert.equal(p.actions.length,1);
        const a=p.actions[0].functionCall;assert.equal(a.deposit,BigInt(input.attached_deposit));assert.equal(a.gas,250000000000000n);assert.equal(a.methodName,'deposit_collateral');assert.equal(new TextDecoder().decode(a.args),'{}');
        return {transaction:{hash:h(3),signer_id:r.signerId,receiver_id:r.receiverId}};});
    assert.deepEqual(await walletSelectorSigner({selector:s,actionCreators})(r),{hash:h(3)});assert.equal(calls,1);
});
test('wrong network/account, selection races and extra actions never reach wallet signing',async t=>{
    const {client,intent}=await setup(t),r=await client.handoff(intent.operation_id);let calls=0;
    for(const mutate of [s=>s.options.network.networkId='mainnet',s=>s.state.accounts[0].active=false,s=>s.state.accounts[0].accountId='other.testnet',s=>s.instance.getAccounts=async()=>[],s=>s.instance.getAccounts=async()=>{s.state.selectedWalletId='other';return [{accountId:r.signerId}];}]){
        const s=selector(r,()=>{calls++;});mutate(s);await assert.rejects(walletSelectorSigner({selector:s,actionCreators})(r));
    }
    for(const mutate of [x=>x.actions.push(x.actions[0]),x=>x.actions[0].gas='1',x=>x.actions[0].type='Transfer',x=>x.actions[0].deposit=1]){
        const changed=structuredClone(r);mutate(changed);await assert.rejects(walletSelectorSigner({selector:selector(r,()=>{calls++;}),actionCreators})(changed));
    }assert.equal(calls,0);
});
test('wallet exceptions are sanitized and undefined redirect responses never imply cancellation',async t=>{
    const {client,intent}=await setup(t),r=await client.handoff(intent.operation_id);
    await assert.rejects(walletSelectorSigner({selector:selector(r,()=>{throw Error('sensitive wallet exception');}),actionCreators})(r),e=>e.message==='WALLET_RESPONSE_UNAVAILABLE');
    assert.equal(await walletSelectorSigner({selector:selector(r,async()=>undefined),actionCreators})(r),undefined);
    assert.equal((await client.recover(intent.operation_id)).state,'SUBMISSION_UNKNOWN');
});
test('wallet hashes survive offline restart but cannot poison a validated transaction binding',async t=>{
    const {client,intent,state,dir,transport}=await setup(t);await client.handoff(intent.operation_id);state.offline=true;
    await client.rememberHash(intent.operation_id,h(9));await client.recover(intent.operation_id);
    const restarted=new Client({config,journal:dir,transport});assert.equal((await restarted.record(intent.operation_id)).candidate_hash,h(9));assert.equal((await restarted.record(intent.operation_id)).hash,null);
    state.offline=false;await assert.rejects(restarted.recover(intent.operation_id),/TRANSACTION_MISMATCH/);
    assert.equal((await restarted.record(intent.operation_id)).hash,null);
    assert.equal((await restarted.recover(intent.operation_id,h(3))).state,'SUCCEEDED');
    await assert.rejects(restarted.rememberHash(intent.operation_id,h(9)),/HASH_CONFLICT/);
});
test('no hash may be recorded before handoff; missing receipt links cannot become success',async t=>{
    const {client,intent,state}=await setup(t);await assert.rejects(client.rememberHash(intent.operation_id,h(3)),/NOT_ATTEMPTED/);
    await client.handoff(intent.operation_id);await client.rememberHash(intent.operation_id,h(3));state.raw.receipts_outcome=[];
    assert.equal((await client.recover(intent.operation_id)).state,'PENDING');
});
test('one receipt cannot confirm two identical operations, including concurrent and legacy journals',async t=>{
    const {client,intent,dir}=await setup(t),second=await client.prepare(input);
    await client.handoff(intent.operation_id);await client.handoff(second.operation_id);
    const results=await Promise.allSettled([client.recover(intent.operation_id,h(3)),client.recover(second.operation_id,h(3))]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.match(results.find(x=>x.status==='rejected').reason.message,/HASH_ALREADY_BOUND/);
    await rm(join(dir,'.hash-bindings'),{recursive:true}); // Version-1 journal without an owner index.
    const third=await client.prepare(input);await client.handoff(third.operation_id);
    await assert.rejects(client.recover(third.operation_id,h(3)),/HASH_ALREADY_BOUND/);
    assert.equal((await client.record(third.operation_id)).hash,null);
});
test('redirect hashes are operation-bound single hints; errors, duplicates and batches stay unresolved',()=>{
    const id='a'.repeat(64),url=`https://app.example/return?hv_operation=${id}&transactionHashes=${h(3)}`;
    assert.deepEqual(walletReturn(url,id),{operation_id:id,hash:h(3)});
    for(const bad of [url+'&transactionHashes='+h(3),url+'&hv_operation='+id,url+'&errorCode=rejected',url+'&errorMessage=secret',url+','+h(4),url.replace(id,'b'.repeat(64))])assert.throws(()=>walletReturn(bad,id));
});
