// Read-only evidence validation. This is not monetary reconciliation or a
// transaction signer. JSON amount strings are retained exactly in the archive.
import {binding} from './binding';
export function canonical(value: any): string {
  if(value === null || typeof value !== 'object') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export function ensure(condition: unknown, code: string): asserts condition {
  if(!condition) throw new Error(code);
}
export function succeeded(status: any): boolean {
  return !!status && Object.keys(status).length === 1 &&
    (typeof status.SuccessValue === 'string' || typeof status.SuccessReceiptId === 'string');
}
export function complete(raw: any, hash: string, signer: string): any[] {
  ensure(raw?.final_execution_status === 'FINAL','NOT_FINAL');
  ensure(raw.transaction?.hash === hash && raw.transaction?.signer_id === signer && raw.transaction_outcome?.id === hash,'TRANSACTION_BINDING');
  ensure(Array.isArray(raw.receipts_outcome),'RECEIPT_LIST');
  const rows=[raw.transaction_outcome,...raw.receipts_outcome], byId=new Map(rows.map(r=>[r.id,r]));
  ensure(byId.size===rows.length && rows[0].outcome.executor_id===signer,'RECEIPT_TREE');
  const seen=new Set([hash]), pending=[rows[0]];
  for(let n=0;n<pending.length;n++) {
    const row=pending[n],o=row.outcome;
    ensure(typeof row.block_hash==='string' && o && Array.isArray(o.logs) && Array.isArray(o.receipt_ids),'RECEIPT_SHAPE');
    ensure(succeeded(o.status)||(o.status&&Object.keys(o.status).length===1&&o.status.Failure),'RECEIPT_STATUS');
    if(o.status.SuccessReceiptId) ensure(o.receipt_ids.includes(o.status.SuccessReceiptId),'RETURN_RECEIPT');
    for(const id of o.receipt_ids) {ensure(!seen.has(id)&&byId.has(id),'RECEIPT_TREE');seen.add(id);pending.push(byId.get(id));}
  }
  ensure(seen.size===rows.length,'RECEIPT_TREE');
  return rows;
}
export function events(row: any): any[] {
  const contract=binding.contracts.find(c=>c.account===row.outcome.executor_id);
  if(!contract || !succeeded(row.outcome.status)) return [];
  const expected=contract.kind==='core'?'hedgeveil':'hedgeveil_external_oracle',out=[];
  for(const [logIndex,log] of row.outcome.logs.entries()) {
    if(!log.startsWith('EVENT_JSON:')) continue;
    const envelope=JSON.parse(log.slice(11));
    if(envelope.standard!==expected) continue;
    ensure(envelope.version===(contract.kind==='core'?'0.2.0':'1.0.0')&&Array.isArray(envelope.data)&&envelope.data.length>0,'EVENT_VERSION');
    for(const [itemIndex,payload] of envelope.data.entries()) {
      const domain=contract.kind==='core'?payload.domain:payload;
      ensure(domain?.network==='testnet'&&domain?.contract_id===contract.account,'EVENT_DOMAIN');
      if(contract.kind==='core') {
        ensure(envelope.event==='ledger'&&payload.schema_version==='0.2.0'&&/^[a-f0-9]{64}$/.test(payload.operation_id),'LEDGER_EVENT');
        ensure(Array.isArray(payload.deltas),'LEDGER_DELTAS');
        for(const d of payload.deltas) ensure(typeof d.amount==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(d.amount),'AMOUNT_ENCODING');
      } else {
        ensure(typeof payload.sequence==='string'&&/^[1-9][0-9]{0,19}$/.test(payload.sequence)&&/^[a-f0-9]{64}$/.test(payload.state_hash),'ORACLE_EVENT');
      }
      out.push({id:`${row.id}:${logIndex}:${itemIndex}`,receiptId:row.id,contract:contract.account,kind:contract.kind,name:contract.kind==='core'?payload.event:envelope.event,sequence:payload.sequence??null,operationId:payload.operation_id??null,logIndex,itemIndex,bodyJson:canonical(payload)});
    }
  }
  return out;
}
