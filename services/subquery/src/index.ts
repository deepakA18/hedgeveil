/// <reference types="@subql/types-near/dist/global" />
import type {NearBlock} from '@subql/types-near';
import {binding} from './binding';
import {canonical,complete,ensure,events,succeeded} from './evidence';

async function immutable(entity: string,id: string,value: any): Promise<void> {
  const previous=await store.get(entity,id);
  // Entities contain native BigInts; compare without converting them to floats.
  const stable=(v:any)=>canonical(JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x)));
  if(previous) {ensure(stable(previous)===stable(value),'IMMUTABLE_EVIDENCE_CHANGED');return;}
  await store.set(entity,id,value);
}

export async function handleBlock(block: NearBlock): Promise<void> {
  const height=block.header.height,hash=block.header.hash;
  const prior:any=await store.get('IndexedHead','testnet');
  if(prior?.hash===hash&&BigInt(prior.height)===BigInt(height))return;
  if(prior) ensure(block.header.prev_hash===prior.hash&&BigInt(height)>BigInt(prior.height),'ANCESTRY_GAP');
  else ensure(height===binding.anchorHeight&&hash===binding.anchorHash,'DEPLOYMENT_ANCHOR');
  const status:any=await api.sendJsonRpc('status',{});
  ensure(status.chain_id===binding.network&&status.genesis_hash===binding.genesisHash,'RPC_NETWORK');
  const final:any=await api.sendJsonRpc('block',{finality:'final'});
  ensure(Number.isSafeInteger(final.header.height)&&height<=final.header.height,'BLOCK_NOT_FINAL');
  const headers=new Map<string,any>();
  async function header(blockHash:string):Promise<any> {
    if(!headers.has(blockHash)) {
      const b:any=await api.sendJsonRpc('block',{block_id:blockHash});
      ensure(b.header.hash===blockHash&&Number.isSafeInteger(b.header.height)&&b.header.height<=final.header.height,'OUTCOME_BLOCK');
      headers.set(blockHash,b.header);
    }
    return headers.get(blockHash);
  }
  // No receiver filter: a call through another contract can emit watched events.
  // A final outcome may execute after the root block. Preserve its true height;
  // consumers must query <= indexedHead and independently reconcile at that block.
  for(const transaction of block.transactions) {
    const txHash=transaction.result.id;
    const raw:any=await api.sendJsonRpc('tx',{tx_hash:txHash,sender_account_id:transaction.signer_id,wait_until:'FINAL'});
    const rows=complete(raw,txHash,transaction.signer_id);
    if(!rows.some(r=>binding.contracts.some(c=>c.account===r.outcome.executor_id))) continue;
    const root=await header(raw.transaction_outcome.block_hash);
    await immutable('TransactionEvidence',txHash,{id:txHash,signer:raw.transaction.signer_id,receiver:raw.transaction.receiver_id,rootBlockHash:root.hash,rootBlockHeight:BigInt(root.height),finalStatusJson:canonical(raw.status),receiptCount:raw.receipts_outcome.length,bodyJson:canonical(raw)});
    for(const row of rows) {
      const h=await header(row.block_hash);
      await immutable('ReceiptEvidence',row.id,{id:row.id,transactionId:txHash,executor:row.outcome.executor_id,blockHash:h.hash,blockHeight:BigInt(h.height),successful:succeeded(row.outcome.status),bodyJson:canonical(row)});
      for(const e of events(row)) await immutable('ProtocolEvent',e.id,{...e,blockHeight:BigInt(h.height)});
    }
  }
  const stamp=block.header.timestamp_nanosec;
  ensure(typeof stamp==='string'&&/^[0-9]+$/.test(stamp),'EXACT_TIMESTAMP_REQUIRED');
  const checkpoint={id:'testnet',network:'testnet',height:BigInt(height),hash,timestampNs:stamp,binding:canonical(binding)};
  await store.set('IndexedHead','testnet',checkpoint);
}
