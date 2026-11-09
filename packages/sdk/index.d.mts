/** All money and nanosecond values are canonical unsigned decimal strings, checked at runtime. */
export type UInt = string;
export type Network = 'sandbox' | 'testnet';
export type Asset = {
    kind: 'COLLATERAL';
} | {
    kind: 'P' | 'N';
    series_id: string;
};
export interface Leg {
    asset: Asset;
    amount: UInt;
}
export interface Domain {
    protocol_version: '1';
    network: Network;
    contract_id: string;
}
export interface Quote {
    kind: 'quote';
    schema_version: '0.2.0';
    domain: Domain;
    maker: string;
    taker: string | null;
    maker_gives: Leg[];
    taker_gives: Leg[];
    fee: {
        asset: 'NATIVE_NEAR';
        amount: UInt;
        receiver: string;
    };
    fill_rule: 'ALL_OR_NOTHING';
    rounding: 'EXACT_AMOUNTS';
    nonce: UInt;
    cancellation_epoch: UInt;
    expiry_ns: UInt;
    signing_key_id: string;
    signature_scheme: 'ed25519';
    signature: string;
}
export interface MethodArgs {
    cancel_quote: { nonce: UInt };
    advance_quote_epoch: { epoch: UInt };
    revoke_signing_key: { key_id: string };
    storage_deposit: Record<string, never>;
    deposit_collateral: Record<string, never>;
    split: {
        series_id: string;
        amount: UInt;
    };
    merge: {
        series_id: string;
        amount: UInt;
    };
    transfer: {
        asset: Asset;
        amount: UInt;
        receiver: string;
    };
    redeem: {
        series_id: string;
        leg: 'P' | 'N';
        amount: UInt;
    };
    fill_quote: {
        quote: Quote;
    };
    vault_mint_basket: {
        vault_id: string;
        shares: UInt;
        max_inputs: Leg[];
    };
    vault_redeem_in_kind: {
        vault_id: string;
        shares: UInt;
        min_outputs: Leg[];
    };
    request_withdrawal: {
        amount: UInt;
        receiver: string;
    };
    close_ticket: {
        ticket_id: UInt;
    };
}
export type Method = keyof MethodArgs;
export type Input = {
    [M in Method]: {
        signer_id: string;
        method: M;
        args: MethodArgs[M];
        attached_deposit?: UInt;
        operation_id?: string;
    };
}[Method];
export type Intent = Input & {
    kind: 'transaction';
    schema_version: '0.2.0';
    domain: Domain;
    operation_id: string;
    attached_deposit: UInt;
    gas: UInt;
};
export interface Configuration {
    rpc_url: string;
    network: Network;
    chain_id: string;
    genesis_hash: string;
    contract_id: string;
    code_hash: string;
}
export type State = 'PREPARED' | 'CANCELLED' | 'PENDING' | 'SUBMISSION_UNKNOWN' | 'SUCCEEDED' | 'FAILED_CONFIRMED' | 'WITHDRAWAL_UNKNOWN' | 'WITHDRAWAL_SUCCEEDED' | 'WITHDRAWAL_FAILED_CONFIRMED';
export interface Result {
    operation_id?: string;
    state: State;
    hash?: string | null;
    candidate_hash?: string;
    reason?: string;
    warnings?: string[];
    receipt_id?: string;
    ledger_operation_id?: string;
    ticket_id?: UInt;
    ticket_state?: string | null;
    callback_receipt_id?: string;
}
export interface SignRequest {
    signerId: string;
    receiverId: string;
    network: Network;
    operationId: string;
    actions: [
        {
            type: 'FunctionCall';
            methodName: Method;
            args: MethodArgs[Method];
            deposit: UInt;
            gas: UInt;
        }
    ];
}
export type Signer = (request: SignRequest, onHash: (hash: string) => Promise<void>) => Promise<{
    hash: string;
} | {
    cancelled_before_submission: true;
} | void>;
export interface JournalRecord {
    version: 1;
    intent: Intent;
    binding: Omit<Configuration, 'rpc_url'>;
    attempted: boolean;
    hash: string | null;
    candidate_hash: string | null;
    result: Result | null;
}
export class FileJournal {
    constructor(directory: string);
    create(intent: Intent, binding: Omit<Configuration, 'rpc_url'>): Promise<unknown>;
    get(id: string): Promise<JournalRecord>;
    claim(id: string): Promise<void>;
    bind(id: string, hash: string): Promise<void>;
    observe(id: string, result: Result, evidence?: unknown): Promise<Result>;
}
export class Client {
    constructor(options: {
        config: Configuration;
        journal: string;
        transport?: {
            fetchImpl?: typeof fetch;
            timeout_ms?: number;
        };
    });
    journal: FileJournal;
    prepare(input: Input): Promise<Intent>;
    record(id: string): Promise<JournalRecord>;
    balances(account_id: string): Promise<{
        network: Network;
        contract_id: string;
        account_id: string;
        account: unknown;
        tickets: unknown[];
        vault: unknown;
        series: unknown[];
        consistency: string;
    }>;
    submit(id: string, signer: Signer): Promise<Result>;
    handoff(id: string): Promise<SignRequest>;
    rememberHash(id: string, hash: string): Promise<void>;
    recover(id: string, suppliedHash?: string): Promise<Result>;
}
export function buildIntent(input: Input & {
    contract_id: string;
    network?: Network;
}): Intent;
export function parseNear(value: string): UInt;
export function formatNear(value: UInt): string;
export const METHODS: Readonly<Record<Method, string>>;
export function toWireIntent(intent: Intent): Omit<Intent, 'signer_id' | 'gas'>;
export {walletSelectorSigner, walletReturn} from './wallet.mjs';
export {nearConnectSigner} from './near-connect.mjs';
