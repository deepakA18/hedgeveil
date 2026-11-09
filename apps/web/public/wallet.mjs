import {NearConnector} from '@hot-labs/near-connect';
import {nearConnectSigner} from '../../../packages/sdk/near-connect.mjs';
import {walletReturn} from '../../../packages/sdk/wallet.mjs';
import {account as validateAccount} from '../../../packages/sdk/intent.mjs';

export async function connectUI({session,changed,reportError,api}) {
    const $=s=>document.querySelector(s),manifest=session.manifest;
    const connector=new NearConnector({network:'testnet',autoConnect:false,manifest,
        cspNonce:$('meta[name="wallet-nonce"]').content,footerBranding:null,
        features:{testnet:true,signInWithoutAddKey:true,signAndSendTransaction:true},
        // Never reuse another dapp/profile's preferred wallet selection.
        storage:{get:async k=>localStorage.getItem('hedgeveil:testnet:connect:'+k),
            set:async(k,v)=>localStorage.setItem('hedgeveil:testnet:connect:'+k,v),
            remove:async k=>localStorage.removeItem('hedgeveil:testnet:connect:'+k)}});
    const allowed=manifest.wallets.map(w=>w.id);let wallet=null,selectedAccount='',revision=0,busy=false;
    const selected=()=>({wallet:wallet?.manifest.id,account:selectedAccount});
    const approved=w=>w&&allowed.includes(w.manifest.id)&&manifest.wallets.includes(w.manifest)&&w.manifest.type==='sandbox';
    function clear(){revision++;wallet=null;selectedAccount='';$('#account').replaceChildren(new Option('Connect a testnet wallet',''));$('#account').disabled=true;$('#disconnect').hidden=true;changed();}
    async function accept(w,accounts){
        if(!approved(w))throw Error('WALLET_NOT_ALLOWED');
        const ids=[...new Set(accounts.map(a=>validateAccount(a.accountId)))];
        if(!ids.length)throw Error('WALLET_ACCOUNT');
        revision++;wallet=w;selectedAccount=ids.includes(selectedAccount)?selectedAccount:ids.length===1?ids[0]:'';
        $('#account').replaceChildren(...(ids.length>1?[new Option('Choose an account','')]:[]),...ids.map(id=>new Option(id,id)));
        $('#account').value=selectedAccount;$('#account').disabled=busy;$('#disconnect').hidden=false;
        $('#wallet-status').textContent=`${w.manifest.name} · testnet${selectedAccount?'':' · Choose an account to continue'}`;changed();
    }
    connector.on('wallet:signIn',({wallet:w,accounts})=>{accept(w,accounts).catch(()=>{clear();reportError(Error('WALLET_CONNECTION_FAILED'));});});
    connector.on('wallet:signOut',clear);
    $('#account').addEventListener('change',()=>{selectedAccount=$('#account').value;revision++;changed();});
    const picker=document.createElement('dialog');picker.setAttribute('aria-labelledby','wallet-picker-title');
    picker.innerHTML='<div class="dialog-inner"><h2 id="wallet-picker-title">Connect a testnet wallet</h2><p>Choose your wallet. Connecting does not authorize a transfer or add a function-call key.</p><div class="actions" id="wallet-choices"></div><p>Testnet assets only. Production disabled.</p><button id="wallet-picker-close">Cancel</button></div>';
    document.body.append(picker);
    picker.querySelector('#wallet-picker-close').onclick=()=>picker.close();
    picker.addEventListener('close',()=>$('#connect').focus());
    for(const m of manifest.wallets){const b=document.createElement('button');b.textContent=m.name;b.onclick=async()=>{
        picker.close();setBusy(true);$('#wallet-status').textContent=`Connecting to ${m.name}…`;
        try{const w=await connector.wallet(m.id);if(!approved(w))throw Error();await connector.connect({walletId:m.id});}
        catch{clear();reportError(Error('WALLET_CONNECTION_FAILED'));$('#wallet-status').textContent='Connection was cancelled or unavailable. You can try connecting again.';}
        finally{setBusy(false);}
    };picker.querySelector('#wallet-choices').append(b);}
    $('#connect').onclick=()=>picker.showModal();
    $('#disconnect').onclick=async()=>{
        setBusy(true);let problem;const previous=wallet;
        // Forget before awaiting the vendor: reload/close may interrupt signOut itself.
        try{localStorage.removeItem('hedgeveil:testnet:connect:selected-wallet');}catch{problem=Error('BROWSER_STORAGE_UNAVAILABLE');}
        clear();$('#wallet-status').textContent='Disconnecting from wallet…';
        try{if(previous)await connector.disconnect(previous);}catch{problem=Error('WALLET_DISCONNECT_FAILED');}
        finally{
            clear();setBusy(false);$('#wallet-status').textContent='Disconnected from this desk. Retained operations remain available after reconnecting.';
            if(problem)reportError(problem);
        }
    };
    function setBusy(value){busy=value;$('#connect').disabled=value;$('#disconnect').disabled=value;$('#account').disabled=value||!wallet;}
    const sign=nearConnectSigner({connector,selected,allowedWallets:allowed,returnUrl:location.origin+'/'});
    clear();
    try{const connected=await connector.getConnectedWallet();await accept(connected.wallet,connected.accounts);}catch{/* No stored connection. Explicit Connect remains available. */}
    return {
        selected,
        async submit(id,signer){
            if(busy||!selectedAccount||selectedAccount!==signer)throw Error('WALLET_ACCOUNT');
            setBusy(true);const before=revision;
            try{
                const request=await api('handoff',{id});
                if(before!==revision||request.signerId!==selectedAccount)throw Error('WALLET_CHANGED');
                const response=await sign(request);
                if(response?.hash)await api('remember-hash',{id,hash:response.hash});
                return await api('recover',{id});
            }finally{setBusy(false);}
        },
        async recoverReturn(){
            const u=new URL(location.href);if(!u.searchParams.has('hv_operation'))return;
            const id=u.searchParams.get('hv_operation');
            // Clear the URL even on an invalid return. It never authorizes a replacement send.
            history.replaceState(null,'',location.pathname+location.hash);
            try{const hint=walletReturn(u,id);await api('remember-hash',{id,hash:hint.hash});await api('recover',{id});}
            catch{reportError(Error('WALLET_RETURN_UNRESOLVED'));}
        }
    };
}
