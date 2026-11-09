import type {Signer} from './index.mjs';
export interface ConnectManifest {id:string; type:string}
export interface ConnectBoundary {
    network:string;
    manifest:{wallets:ConnectManifest[]};
    wallet():Promise<{
        manifest:ConnectManifest;
        getAccounts(params:{network:'mainnet'|'testnet'}):Promise<Array<{accountId:string}>>;
        signAndSendTransaction(params:{network:'mainnet'|'testnet';signerId:string;receiverId:string;callbackUrl?:string;actions:Array<{type:'FunctionCall';params:{methodName:string;args:object;gas:string;deposit:string}}> }):Promise<unknown>;
    }>;
}
export function nearConnectSigner(options:{connector:ConnectBoundary; selected():{wallet?:string;account:string}; allowedWallets:string[];returnUrl?:string}):Signer;
