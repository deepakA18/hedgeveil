import {createHash} from 'node:crypto';
import {Account,PublicKey,actions} from './near.mjs';
import {FileJournal,terminal} from '../../packages/sdk/journal.mjs';
import {canonical,fail} from '../../packages/sdk/intent.mjs';
import {base58,hash32} from '../../packages/sdk/rpc.mjs';
import {completeOutcomes} from '../indexer/model.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function callArgs(a){
    if(a.args_base64===undefined)return a.args;
    if(a.args!==undefined||typeof a.args_base64!=='string'||!a.args_base64.length||Buffer.from(a.args_base64,'base64').toString('base64')!==a.args_base64)fail('ADMIN_RAW_ARGS');
    return Buffer.from(a.args_base64,'base64');
}
export function nativeActions(list){return list.map(a=>{
    switch(a.type){
        case 'CreateAccount':return actions.createAccount();
        case 'Transfer':return actions.transfer(BigInt(a.deposit));
        case 'AddKey':return actions.addFullAccessKey(PublicKey.fromString(a.public_key));
        case 'DeployContract':return actions.deployContract(Buffer.from(a.code,'base64'));
        case 'FunctionCall':return actions.functionCall(a.method,callArgs(a),BigInt(a.gas),BigInt(a.deposit));
        default:fail('ADMIN_ACTION_UNSUPPORTED');
    }
});}
export function matchActions(actual,expected){
    if(!Array.isArray(actual)||actual.length!==expected.length)fail('ADMIN_TRANSACTION_MISMATCH');
    for(let i=0;i<expected.length;i++){
        const a=actual[i],e=expected[i];
        if(e.type==='CreateAccount'){if(a!=='CreateAccount'&&canonical(a)!==canonical({CreateAccount:{}}))fail('ADMIN_TRANSACTION_MISMATCH');continue;}
        if(!a||Object.keys(a).length!==1||!Object.hasOwn(a,e.type))fail('ADMIN_TRANSACTION_MISMATCH');
        const p=a[e.type];
        if(e.type==='Transfer'&&String(p.deposit)!==e.deposit)fail('ADMIN_TRANSACTION_MISMATCH');
        if(e.type==='AddKey'&&(p.public_key!==e.public_key||p.access_key.permission!=='FullAccess'))fail('ADMIN_TRANSACTION_MISMATCH');
        // NEAR ActionView replaces Wasm bytes with their SHA-256 digest (base64).
        if(e.type==='DeployContract'&&p.code!==createHash('sha256').update(Buffer.from(e.code,'base64')).digest('base64'))fail('ADMIN_TRANSACTION_MISMATCH');
        if(e.type==='FunctionCall'){
            const expectedArgs=callArgs(e);
            const sameArgs=e.args_base64===undefined?canonical(JSON.parse(Buffer.from(p.args,'base64').toString()))===canonical(expectedArgs):p.args===e.args_base64;
            if(p.method_name!==e.method||String(p.deposit)!==e.deposit||String(p.gas)!==e.gas||!sameArgs)fail('ADMIN_TRANSACTION_MISMATCH');
        }
    }
}
export class AdminTransactions {
    constructor({provider,journal,identity,verify}){this.provider=provider;this.journal=new FileJournal(journal);this.identity=structuredClone(identity);this.verify=verify;this.evidence=new Map();}
    async prepare(label,signer,receiver,actions){
        const i={label,signer_id:signer,receiver_id:receiver,actions:structuredClone(actions)};
        i.operation_id=sha(canonical({identity:this.identity,...i}));
        await this.journal.create(i,this.identity);return i;
    }
    async recover(i,hint){
        await this.verify();const r=await this.journal.get(i.operation_id);
        if(canonical(r.intent)!==canonical(i)||canonical(r.binding)!==canonical(this.identity))fail('ADMIN_JOURNAL_MISMATCH');
        if(!r.attempted)fail('NOT_ATTEMPTED');
        const hash=hint??r.hash??r.candidate_hash;if(!hash)return {state:'SUBMISSION_UNKNOWN',operation_id:i.operation_id};hash32(hash);
        if(r.hash&&r.hash!==hash)fail('HASH_CONFLICT');
        let raw;try{raw=await this.provider.sendJsonRpc('tx',{tx_hash:hash,sender_account_id:i.signer_id,wait_until:'FINAL'});}catch{return r.result&&terminal(r.result.state)?r.result:await this.journal.observe(i.operation_id,{state:'SUBMISSION_UNKNOWN',operation_id:i.operation_id,candidate_hash:hash});}
        if(raw.transaction?.hash!==hash||raw.transaction.signer_id!==i.signer_id||raw.transaction.receiver_id!==i.receiver_id)fail('ADMIN_TRANSACTION_MISMATCH');
        matchActions(raw.transaction.actions,i.actions);const rows=completeOutcomes(raw,raw.transaction);
        this.evidence.set(i.operation_id,raw);
        await this.journal.bind(i.operation_id,hash);
        return this.journal.observe(i.operation_id,{operation_id:i.operation_id,hash,state:rows.some(r=>r.outcome.status.Failure)?'FAILED_CONFIRMED':'SUCCEEDED'},raw);
    }
    async send(i,key){
        const r=await this.journal.get(i.operation_id);
        if(canonical(r.intent)!==canonical(i)||canonical(r.binding)!==canonical(this.identity))fail('ADMIN_JOURNAL_MISMATCH');
        if(r.attempted){const result=await this.recover(i);if(result.state!=='SUCCEEDED')fail('ADMIN_OPERATION_UNRESOLVED');return result;}
        await this.verify();
        const account=new Account(i.signer_id,this.provider,key),signer=account.getSigner();
        const tx=await account.createTransaction({receiverId:i.receiver_id,actions:nativeActions(i.actions),publicKey:await signer.getPublicKey()});
        const {txHash,signedTransaction}=await signer.signTransaction(tx),hash=base58(txHash);
        await this.journal.claim(i.operation_id);
        // This locally derived hash is retained before the sole broadcast call.
        await this.journal.bind(i.operation_id,hash);
        try{await this.provider.sendTransactionUntil(signedTransaction,'FINAL');}catch(e){
            // Retain only the error class, never provider messages or signing inputs.
            await this.journal.observe(i.operation_id,{state:'SUBMISSION_UNKNOWN',operation_id:i.operation_id,candidate_hash:hash,broadcast_error:/^[A-Za-z0-9_]{1,80}$/.test(e.name)?e.name:'RPC_ERROR'});
        }
        const result=await this.recover(i);
        if(result.state!=='SUCCEEDED')fail('ADMIN_OPERATION_UNRESOLVED');return result;
    }
}
