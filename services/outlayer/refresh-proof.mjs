import {completeOutcomes} from '../indexer/model.mjs';
import {matchActions} from '../testnet/transactions.mjs';
import {normalizePrice} from './reader.mjs';
import {fail,uint} from '../../packages/sdk/intent.mjs';
export function verifyRefreshProof(proof,pins,owner='0xdeepak18.testnet'){
 const r=proof.receipt;
 if(proof.status.chain_id!=='testnet'||proof.status.genesis_hash!==pins.expected_genesis_hash)fail('REFRESH_CHAIN');
 if(r.transaction.signer_id!==owner||r.transaction.receiver_id!=='price-oracle.testnet')fail('REFRESH_DOMAIN');
 const rows=completeOutcomes(r,r.transaction);if(rows.some(r=>r.outcome.status.Failure))fail('REFRESH_FAILED');
 matchActions(r.transaction.actions,[{type:'FunctionCall',method:'request_price_data',args:{asset_ids:['wrap.near']},gas:'200000000000000',deposit:'20000000000000000000000'}]);
 if(!r.status.SuccessValue)fail('REFRESH_EMPTY');
 const callbacks=rows.filter(x=>x.outcome.executor_id==='price-oracle.testnet'&&x.outcome.status.SuccessValue===r.status.SuccessValue);
 if(callbacks.length!==1)fail('REFRESH_CALLBACK');
 const hash=callbacks[0].block_hash;
 if(proof.block.header.hash!==hash||proof.source.block_hash!==hash||proof.asset.block_hash!==hash||proof.source.code_hash!==pins.expected_code_hash)fail('REFRESH_PIN');
 const data=JSON.parse(Buffer.from(r.status.SuccessValue,'base64').toString()),asset=JSON.parse(Buffer.from(proof.asset.result).toString());
 const stamp=proof.block.header.timestamp_nanosec;
 if(data.timestamp!==stamp||data.prices?.length!==1||data.prices[0].asset_id!=='wrap.near')fail('REFRESH_VALUE');
 if(asset.reports?.length!==1||asset.reports[0].oracle_id!=='price-oracle.testnet'||asset.reports[0].timestamp!==stamp)fail('REFRESH_REPORT');
 uint(stamp,64,true);const price=normalizePrice(data.prices[0].price);
 if(price!==normalizePrice(asset.reports[0].price))fail('REFRESH_PRICE');
 return {network:'testnet',genesis_hash:pins.expected_genesis_hash,source_account:'price-oracle.testnet',source_code_hash:pins.expected_code_hash,reporter:'price-oracle.testnet',transaction_hash:r.transaction.hash,callback_receipt_id:callbacks[0].id,block_hash:hash,timestamp_ns:stamp,price,price_scale:'1000000000000',refresh_verified:true,public_lifecycle_complete:false};
}
