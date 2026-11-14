import type { NearConnector } from "@hot-labs/near-connect";
export type Claim = "P" | "N";
export type Asset = { kind: "COLLATERAL" | "P" | "N"; series_id?: string };
export type Leg = { asset: Asset; amount: string; shortfall?: string };
export interface Series {
  slot: number;
  config: {
    series_id: string;
    strike: string;
    maturity_ns: string;
    mint_cutoff_ns: string;
    [key: string]: unknown;
  };
  reserve?: string;
  outstanding_p?: string;
  outstanding_n?: string;
  total_split?: string;
  total_merged?: string;
  final_price: string | null;
  p_coefficient: string;
  n_coefficient: string;
  [key: string]: unknown;
}
export interface Balance {
  free: string;
  storage_paid: string;
  closing?: boolean;
  positions: Record<string, { p: string; n: string }>;
}
export interface Ticket {
  id: string;
  amount: string;
  receiver: string;
  state: string;
  balance_restored?: boolean;
}
export interface Market {
  epoch: string;
  keys: Record<string, { revoked: boolean }>;
  [key: string]: unknown;
}
export interface Snapshot {
  contract: string;
  kind: string;
  body: {
    series?: Series[];
    cases?: (OracleCase | ExpiryCase)[];
    accounts?: Record<string, Balance>;
    markets?: Record<string, Market>;
    [key: string]: unknown;
  };
}
export interface IndexState {
  settlement?: {
    observed_at: string | null;
    items: {
      series_id: string;
      state: string;
      observed_at: string | null;
      attempt: number | null;
      max_attempts: number | null;
      next_attempt_ns: string | null;
    }[];
    attempts: {
      series_id: string;
      hash: string;
      request_id: number;
      requested_ns: string;
      callback_ns: string;
      delivery_ns: string;
      pickup_lag_ns: null;
      outcome: string;
    }[];
  };
  items: Snapshot[];
  health: {
    risk_allowed: boolean;
    height: number | string | null;
    state?: string;
    age_ms?: number;
    stale?: boolean;
    discovery?: { lag_blocks?: number; state?: string };
  };
  sync?: unknown;
}
export interface LiveState {
  accounts: Record<string, Balance | null>;
  series: Series[];
  storage: { account_minimum: string; storage_byte_cost?: string };
  tickets: Ticket[];
  native: { amount: string; storage_usage?: number };
  gas_price?: string;
  now_ns: string;
  block_hash: string;
  pauses: Record<string, boolean>;
}
export interface Session {
  auth_required?: boolean;
  wallet: true;
  configured: boolean;
  network: "testnet";
  contract_id?: string;
  genesis_hash?: string;
  code_hash?: string;
  oracle_profile: string;
  oracle_label: string;
  accounts: { id: string; role: string }[];
  manifest: NearConnector["manifest"];
  subsidy: string;
}
export interface Intent {
  operation_id: string;
  signer_id: string;
  method: string;
  args: Record<string, unknown>;
  attached_deposit: string;
  storage_deposit?: string;
  gas: string;
  domain: { contract_id: string; network: string };
}
export interface Operation {
  intent: Intent;
  attempted: boolean;
  hash?: string;
  candidate_hash?: string;
  result?: { state: string; reason?: string };
  [key: string]: unknown;
}
export interface Preview {
  intent: Intent;
  required: Leg[];
  outputs: Leg[];
  blockers: string[];
  gas_allowance: string;
  custody: string;
  [key: string]: unknown;
}
export interface Quote {
  maker: string;
  taker: string;
  maker_gives: Leg[];
  taker_gives: Leg[];
  fee: { amount: string };
  expiry_ns: string;
  [key: string]: unknown;
}
export interface Offer {
  quote: Quote | null;
  reason?: string;
}
export interface ActionInput {
  method: string;
  args: Record<string, unknown>;
  attached_deposit?: string;
  operation_id?: string;
}

export interface OracleCase {
  config: Series["config"];
  state: string;
  price: string | null;
  source: { account: string; reporter: string; asset: string };
  samples: ({
    price: string;
    report_ns: string;
    accepted_ns: string;
    response_hash: string;
  } | null)[];
}

export interface ExpiryCase {
  config: Series["config"];
  state: string;
  price: string | null;
  pending: string | null;
  last_result: string;
  accepted: {
    price: string;
    evidence_sha256: string;
    response_sha256: string;
    accepted_ns: string;
  } | null;
}
