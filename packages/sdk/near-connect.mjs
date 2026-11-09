// NEAR Connect transport. The caller must durably claim the operation before signing.
import {walletSelectorSigner} from './wallet.mjs';
import {fail} from './intent.mjs';

export function nearConnectSigner({connector, selected, allowedWallets, returnUrl}) {
    const permitted=new Set(allowedWallets);
    // Reuse the exact-intent validation and untrusted outcome handling of the SDK boundary.
    const state=()=>{
        const s=selected();
        if(!s?.wallet||!permitted.has(s.wallet)||!s.account)fail('WALLET_ACCOUNT');
        return {selectedWalletId:s.wallet,accounts:[{accountId:s.account,active:true}]};
    };
    const selector={
        get options(){return {network:{networkId:connector.network}};},
        store:{getState:state},
        async wallet(id){
            const wallet=await connector.wallet();
            // Identity as well as ID matters: injected replacements cannot stand in for pinned executors.
            if(wallet.manifest.id!==id||!connector.manifest.wallets.includes(wallet.manifest)||wallet.manifest.type!=='sandbox')fail('WALLET_CHANGED');
            return {id,getAccounts:()=>wallet.getAccounts({network:connector.network}),
                signAndSendTransaction:params=>wallet.signAndSendTransaction({...params,network:connector.network})};
        }
    };
    return walletSelectorSigner({selector,returnUrl,actionCreators:{
        functionCall:(methodName,bytes,gas,deposit)=>({type:'FunctionCall',params:{methodName,
            args:JSON.parse(new TextDecoder().decode(bytes)),gas:String(gas),deposit:String(deposit)}})
    }});
}
