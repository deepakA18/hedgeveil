import {canonical,fail} from '../../packages/sdk/intent.mjs';
import {configuration} from './rpc.mjs';

// A healthy indexer for another deployment must never enable this desk's risk.
export function walletIndexerConfiguration(client,input){
    const c=configuration(input);
    if(!client||c.network!==client.network||c.chain_id!==client.chain_id||c.genesis_hash!==client.genesis_hash)fail('INDEXER_DEPLOYMENT_MISMATCH');
    const cores=c.contracts.filter(x=>x.kind==='core');
    if(cores.length!==1||cores[0].account_id!==client.contract_id||cores[0].code_hash!==client.code_hash)fail('INDEXER_DEPLOYMENT_MISMATCH');
    if(c.contracts.filter(x=>['oracle','external_oracle'].includes(x.kind)).length!==1)fail('INDEXER_ORACLE_REQUIRED');
    return c;
}

export function boundStore(store,expected){
    return {async read(resource,options){
        const result=await store.read(resource,options);
        if(canonical(result.binding)!==canonical(expected))fail('INDEXER_DEPLOYMENT_MISMATCH');
        return result;
    }};
}
