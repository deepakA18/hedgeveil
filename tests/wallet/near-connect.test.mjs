import test from 'node:test';
import assert from 'node:assert/strict';
import {nearConnectSigner} from '../../packages/sdk/near-connect.mjs';
import {buildIntent} from '../../packages/sdk/intent.mjs';
import {createApp} from '../../apps/web/server.mjs';
const i=buildIntent({network:'testnet',contract_id:'core.testnet',signer_id:'alice.testnet',method:'deposit_collateral',args:{},attached_deposit:'1000000000000000000000001'});
const request={signerId:i.signer_id,receiverId:i.domain.contract_id,network:'testnet',operationId:i.operation_id,actions:[{type:'FunctionCall',methodName:i.method,args:i.args,deposit:i.attached_deposit,gas:i.gas}]};
function setup(){
    const manifest={id:'fixture',type:'sandbox'};let calls=[];
    const w={manifest,getAccounts:async()=>[{accountId:'alice.testnet'},{accountId:'bob.testnet'}],signAndSendTransaction:async p=>{calls.push(p);return {transaction:{signer_id:p.signerId,receiver_id:p.receiverId,hash:'1'.repeat(32)}};}};
    const connector={network:'testnet',manifest:{wallets:[manifest]},wallet:async()=>w};
    const state={wallet:'fixture',account:'alice.testnet'};
    return {connector,state,w,calls,sign:nearConnectSigner({connector,selected:()=>state,allowedWallets:['fixture']})};
}
test('NEAR Connect preserves selected signer, testnet, exact deposit and one action',async()=>{
    const f=setup();assert.deepEqual(await f.sign(request),{hash:'1'.repeat(32)});
    assert.deepEqual(f.calls,[{signerId:'alice.testnet',receiverId:'core.testnet',network:'testnet',actions:[{type:'FunctionCall',params:{methodName:i.method,args:{},gas:i.gas,deposit:i.attached_deposit}}]}]);
});
test('network, account, injected replacement and unsupported wallet fail before any send',async()=>{
    for(const change of [f=>f.connector.network='mainnet',f=>f.state.account='bob.testnet',f=>f.state.wallet='unreviewed',f=>f.w.manifest={...f.w.manifest},f=>f.w.getAccounts=async()=>{f.state.account='bob.testnet';return [{accountId:'alice.testnet'}];}]){
        const f=setup();change(f);await assert.rejects(f.sign(request));assert.equal(f.calls.length,0);
    }
});
test('missing response, ambiguous rejection and malformed outcomes never claim cancellation/success',async()=>{
    const f=setup();f.w.signAndSendTransaction=async()=>undefined;assert.equal(await f.sign(request),undefined);
    f.w.signAndSendTransaction=async()=>{throw Error('private-wallet-detail');};await assert.rejects(f.sign(request),e=>e.code==='WALLET_RESPONSE_UNAVAILABLE'&&!e.message.includes('private-wallet-detail'));
    f.w.signAndSendTransaction=async()=>({transaction:{hash:'1'.repeat(32),signer_id:'bob.testnet',receiver_id:'core.testnet'}});await assert.rejects(f.sign(request),/WALLET_RESPONSE/);
});
test('local wallet gateway refuses Sandbox configs and server-side signers',()=>{
    assert.throws(()=>createApp({wallet:{},config:{network:'sandbox'}}),/WALLET_TESTNET_ONLY/);
    assert.throws(()=>createApp({wallet:{},signer:()=>{}}),/WALLET_LOCAL_SIGNER_FORBIDDEN/);
});
