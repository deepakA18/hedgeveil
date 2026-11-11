import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AdminTransactions,matchActions} from '../../services/testnet/transactions.mjs';
import {requireNewAccount,providerFor} from '../../services/testnet/workspace.mjs';
import {base58} from '../../packages/sdk/rpc.mjs';

test('deployment ActionView commits to exact Wasm digest, not full code or another artifact',()=>{
    const code=Buffer.from('example-wasm'),expected=[{type:'DeployContract',code:code.toString('base64')}];
    matchActions([{DeployContract:{code:createHash('sha256').update(code).digest('base64')}}],expected);
    for(const bad of [code.toString('base64'),Buffer.alloc(32).toString('base64'),''])assert.throws(()=>matchActions([{DeployContract:{code:bad}}],expected),/ADMIN_TRANSACTION_MISMATCH/);
});
test('setup matching rejects altered transfer, key permissions, method and attached deposit',()=>{
    const expected=[{type:'Transfer',deposit:'80'},{type:'AddKey',public_key:'ed25519:public'},{type:'FunctionCall',method:'new',args:{network:'testnet'},gas:'250',deposit:'0'}];
    const actual=[{Transfer:{deposit:'80'}},{AddKey:{public_key:'ed25519:public',access_key:{permission:'FullAccess'}}},{FunctionCall:{method_name:'new',args:Buffer.from(JSON.stringify({network:'testnet'})).toString('base64'),gas:250,deposit:'0'}}];
    matchActions(actual,expected);
    for(const mutate of [a=>a[0].Transfer.deposit='81',a=>a[1].AddKey.access_key.permission={},a=>a[2].FunctionCall.method_name='other',a=>a[2].FunctionCall.deposit='1']){const a=structuredClone(actual);mutate(a);assert.throws(()=>matchActions(a,expected),/ADMIN_TRANSACTION_MISMATCH/);}
});
test('retained attempted setup cannot resend with missing hash, RPC outage or changed intent',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'hv-admin-'));let calls=0;
    try{
        const provider={sendJsonRpc:async()=>{calls++;throw Error('offline');},sendTransactionUntil:async()=>assert.fail('must never broadcast')};
        const admin=new AdminTransactions({provider,journal:directory,identity:{network:'testnet'},verify:async()=>{}});
        const i=await admin.prepare('create','owner.testnet','demo.owner.testnet',[{type:'CreateAccount'}]);
        await admin.journal.claim(i.operation_id);
        await assert.rejects(admin.send(i,'unused-secret'),/ADMIN_OPERATION_UNRESOLVED/);assert.equal(calls,0);
        const hash=base58(Buffer.alloc(32,2));await admin.journal.bind(i.operation_id,hash);
        await assert.rejects(admin.send(i,'unused-secret'),/ADMIN_OPERATION_UNRESOLVED/);assert.equal(calls,1);
        await assert.rejects(admin.send({...i,receiver_id:'different.testnet'},'unused-secret'),/ADMIN_JOURNAL_MISMATCH/);
        assert.equal((await admin.journal.get(i.operation_id)).result.state,'SUBMISSION_UNKNOWN');
    }finally{await rm(directory,{recursive:true});}
});
test('new account preflight accepts only explicit absence; outages and existing accounts block',async()=>{
    await requireNewAccount({sendJsonRpc:async()=>{const e=Error();e.name='AccountDoesNotExistError';throw e;}},'demo.testnet');
    await assert.rejects(requireNewAccount({sendJsonRpc:async()=>({amount:'0'})},'demo.testnet'),/DEMO_ACCOUNT_ALREADY_EXISTS/);
    await assert.rejects(requireNewAccount({sendJsonRpc:async()=>{throw Error('offline');}},'demo.testnet'),/offline/);
});
test('administrative provider does not repeat send_tx after an HTTP server error',async()=>{
    const original=globalThis.fetch;let sends=0;
    globalThis.fetch=async(_url,options)=>{assert.equal(JSON.parse(options.body).method,'send_tx');sends++;return {status:500};};
    try{await assert.rejects(providerFor({rpc_url:'https://rpc.testnet.near.org/'}).sendJsonRpc('send_tx',{signed_tx_base64:'fixture-only'}));assert.equal(sends,1);}
    finally{globalThis.fetch=original;}
});
