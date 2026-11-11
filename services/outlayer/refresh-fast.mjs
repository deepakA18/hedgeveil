import {verifyRefreshProof} from './refresh-proof.mjs';
import {completeOutcomes} from '../indexer/model.mjs';
import {fail} from '../../packages/sdk/intent.mjs';

// Reuse the freshly verified FINAL refresh tree, then authenticate its source
// state at the callback block. This never replaces the resolver's on-chain read.
export async function refreshReportProof(receipt,profile,rpc,status){
 if(profile.network!=='testnet'||profile.source.account_id!=='price-oracle.testnet')fail('REFRESH_DOMAIN');
 const rows=completeOutcomes(receipt,receipt.transaction);
 const callbacks=rows.filter(x=>x.outcome.executor_id===profile.source.account_id&&x.outcome.status.SuccessValue&&x.outcome.status.SuccessValue===receipt.status.SuccessValue);
 if(callbacks.length!==1)fail('REFRESH_CALLBACK');
 const hash=callbacks[0].block_hash;
 const [block,source,asset,head]=await Promise.all([
  rpc.sendJsonRpc('block',{block_id:hash}),
  rpc.sendJsonRpc('query',{request_type:'view_account',account_id:profile.source.account_id,block_id:hash}),
  rpc.sendJsonRpc('query',{request_type:'call_function',account_id:profile.source.account_id,block_id:hash,method_name:'get_asset',args_base64:Buffer.from(JSON.stringify({asset_id:'wrap.near'})).toString('base64')}),
  rpc.sendJsonRpc('block',{finality:'final'})
 ]);
 const proof={receipt,status,block,source,asset};
 const verified=verifyRefreshProof(proof,{expected_genesis_hash:profile.genesis_hash,expected_code_hash:profile.source.code_hash},profile.signer_id);
 return {proof,verified,asset:JSON.parse(Buffer.from(asset.result).toString()),head};
}
