import {account,fail} from '../../packages/sdk/intent.mjs';
import {hash32} from '../../packages/sdk/rpc.mjs';

const Q=10n**24n,alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function implicitAccount(publicKey){
    if(typeof publicKey!=='string'||!publicKey.startsWith('ed25519:'))fail('FUNDING_KEY');
    const encoded=hash32(publicKey.slice(8));let n=0n;
    for(const c of encoded)n=n*58n+BigInt(alphabet.indexOf(c));
    return n.toString(16).padStart(64,'0');
}
export function transferFunding(plan){
    const f=plan.funding;
    if(f?.mode!=='implicit-transfer-v1'||f.receiver_id!==implicitAccount(f.public_key)||
       plan.root_id!==f.receiver_id||plan.funding_amount!==String(48n*Q)||
       plan.owner_minimum!==String(49n*Q))fail('TRANSFER_FUNDING_PROFILE');
    const budgets={administrator:[48n*Q],core:[30n*Q],oracle:[8n*Q],maker:[45n*Q/10n,45n*Q/10n]},ids=new Set();
    if(plan.accounts.length!==5)fail('TRANSFER_FUNDING_PROFILE');
    for(const a of plan.accounts){
        account(a.id);const balance=budgets[a.role]?.pop();
        if(balance===undefined||a.initial_balance!==String(balance)||a.id!==implicitAccount(a.public_key)||ids.has(a.id))fail('TRANSFER_FUNDING_PROFILE');
        if(a.role==='administrator'&&(a.id!==plan.root_id||a.public_key!==f.public_key))fail('TRANSFER_FUNDING_PROFILE');
        ids.add(a.id);
    }
    return {label:'fund-deployment-transfer',receiver_id:f.receiver_id,actions:[{type:'Transfer',deposit:plan.funding_amount}]};
}
// The browser and server use the same reviewed shape; no AddKey action is sent
// to the owner's wallet in the transfer funding profile.
export function walletFundingActions(intent){
    if(intent.label==='fund-deployment-transfer'&&intent.actions.length===1&&intent.actions[0].type==='Transfer')return [{type:'Transfer',params:{deposit:intent.actions[0].deposit}}];
    if(intent.label==='outlayer-price-probe-1'&&intent.actions.length===1&&intent.actions[0].type==='FunctionCall'){
        const a=intent.actions[0];return [{type:'FunctionCall',params:{methodName:a.method,args:a.args,gas:a.gas,deposit:a.deposit}}];
    }
    fail('WALLET_ADD_KEY_UNSUPPORTED');
}
