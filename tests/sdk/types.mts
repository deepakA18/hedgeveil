import { buildIntent, Client, parseNear, type Configuration, type Signer } from '../../packages/sdk/index.mjs';
const config: Configuration = { rpc_url: 'http://127.0.0.1:1234/', network: 'sandbox', chain_id: 'local', genesis_hash: 'hash', code_hash: 'hash', contract_id: 'core.sandbox' };
const client = new Client({ config, journal: 'target/typecheck' });
const intent = buildIntent({ signer_id: 'alice.sandbox', contract_id: config.contract_id, method: 'merge', args: { series_id: 'alpha', amount: parseNear('0.1') } });
const signer: Signer = async (request, onHash) => { const gas: string = request.actions[0].gas; await onHash(gas); return { hash: gas }; };
void client.submit(intent.operation_id, signer);
// @ts-expect-error Money cannot enter the transaction as a JavaScript number.
void client.prepare({ signer_id: 'alice.sandbox', method: 'split', args: { series_id: 'alpha', amount: 1 } });
// @ts-expect-error Method arguments must match the selected method.
void client.prepare({ signer_id: 'alice.sandbox', method: 'redeem', args: { ticket_id: '1' } });
// @ts-expect-error Faults and administrative calls are not client methods.
void client.prepare({ signer_id: 'alice.sandbox', method: 'fault_withdrawal', args: {} });
// @ts-expect-error Production stays disabled.
const invalid: Configuration = { ...config, network: 'mainnet' };
const testnet: Configuration = {...config, network:'testnet', chain_id:'testnet', rpc_url:'https://rpc.testnet.near.org/'};
void new Client({config:testnet, journal:'target/typecheck-testnet'}).handoff(intent.operation_id);
void client.prepare({ signer_id: 'maker.sandbox', method: 'cancel_quote', args: { nonce: '255' } });
void client.prepare({ signer_id: 'maker.sandbox', method: 'advance_quote_epoch', args: { epoch: '1' } });
void client.prepare({ signer_id: 'maker.sandbox', method: 'revoke_signing_key', args: { key_id: 'demo-key' } });
// @ts-expect-error Quote nonces must remain canonical strings.
void client.prepare({ signer_id: 'maker.sandbox', method: 'cancel_quote', args: { nonce: 1 } });
