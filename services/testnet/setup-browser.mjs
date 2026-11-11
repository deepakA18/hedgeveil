import {walletFundingActions,transferFunding} from './funding.mjs';
import {NearConnector} from '../../apps/web/node_modules/@hot-labs/near-connect/build/index.js';
const $=s=>document.querySelector(s);
async function api(path,body){const r=await fetch('/api/'+path,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}
const data=await api('plan'),{plan,intent,manifest}=data;
if(plan.kind==='hedgeveil-native-testnet')transferFunding(plan);
const probe=plan.kind==='hedgeveil-oracle-probe',native=plan.kind==='hedgeveil-native-testnet';
$('#summary').textContent=probe?`Wallet: ${plan.owner}. Receiver: ${plan.root_id}. One request; deposit 0.02 test NEAR plus gas. No keys or accounts are created.`:native?`Funding wallet: ${plan.owner}. Transfer destination: ${intent.receiver_id}. This is a separate, locally controlled account. Budget: core 30; resolver 8; two makers 4.5 each; administrator 1. Total 48 test NEAR; keep at least 1 in your wallet. Source: price-oracle.testnet. Vault disabled.`:`Funding wallet: ${plan.owner}. New account: ${plan.root_id}. Budget: core 30; oracle 30; two makers 6 each; remaining 8 for admin, publishers, storage and gas. All amounts are test NEAR.`;
$('#details').textContent=JSON.stringify({intent,plan},null,2);
let selected=null,attempted=data.record.attempted;
const connector=new NearConnector({network:'testnet',autoConnect:false,manifest,footerBranding:null,cspNonce:$('meta[name="wallet-nonce"]').content});
const valid=w=>manifest.wallets.includes(w.manifest)&&w.manifest.type==='sandbox';
const state=()=>{$('#fund').disabled=attempted||!selected;$('#status').textContent=data.record.result?.state??(attempted?'Setup attempt retained. Check matching receipts; do not resend.':'Connect the funding wallet, review the exact request, then approve in your wallet.');};
for(const m of manifest.wallets){const b=document.createElement('button');b.textContent=m.name;b.onclick=async()=>{b.disabled=true;try{
    const w=await connector.wallet(m.id);if(!valid(w))throw Error();await connector.connect({walletId:m.id});
    if(!(await w.getAccounts({network:'testnet'})).some(a=>a.accountId===plan.owner))throw Error();selected=w;$('#account').textContent=plan.owner+' · '+m.name;state();
}catch{selected=null;$('#fund').disabled=true;$('#status').textContent=`Connect the testnet wallet containing ${plan.owner}. Connection was cancelled or unavailable.`;}finally{b.disabled=false;}};$('#wallets').append(b);}
$('#fund').onclick=async()=>{
    $('#fund').disabled=true;
    try{
        if(!selected||connector.network!=='testnet'||!valid(selected)||(await connector.wallet())!==selected||!(await selected.getAccounts({network:'testnet'})).some(a=>a.accountId===plan.owner))throw Error();
        const request=await api('handoff',{});attempted=true;
        if(JSON.stringify(request)!==JSON.stringify(intent))throw Error();
        const result=await selected.signAndSendTransaction({network:'testnet',signerId:plan.owner,receiverId:intent.receiver_id,callbackUrl:location.origin+'/?bootstrap='+intent.operation_id,
            actions:walletFundingActions(intent)});
        const hash=result?.transaction?.hash;
        const out=await api('recover',hash?{hash}:{});$('#status').textContent=out.state==='SUCCEEDED'?(probe?'Price request receipts confirmed. Returned data still needs validation; this is not settlement approval.':'Setup funding confirmed by finalized receipts. The deployment service can now continue.'):out.state+' — check receipts; no automatic resend.';
    }catch(e){attempted=true;$('#status').textContent=e.message==='OWNER_NEEDS_49_TEST_NEAR'?'Keep at least 49 test NEAR in the owner wallet before funding this 48-NEAR setup, then reload.':e.message==='OWNER_NEEDS_81_TEST_NEAR'?'Fund the owner wallet with at least 81 test NEAR, then reload.':'Setup response unavailable. Reload and check the retained attempt or recover its exact hash. No resend is authorized.';}
};
$('#recover').onsubmit=async e=>{e.preventDefault();try{$('#status').textContent=(await api('recover',{hash:$('#hash').value.trim()})).state;}catch{$('#status').textContent='Receipt verification unavailable or hash does not match this exact setup request.';}};
state();
const u=new URL(location.href);if(u.searchParams.has('bootstrap')){
    history.replaceState(null,'',location.pathname);
    if(u.searchParams.get('bootstrap')===intent.operation_id&&u.searchParams.getAll('transactionHashes').length===1&&!u.searchParams.has('errorCode')){
        try{$('#status').textContent=(await api('recover',{hash:u.searchParams.get('transactionHashes')})).state;}catch{$('#status').textContent='Returned hash is unverified. Check the retained setup operation.';}
    }
}
