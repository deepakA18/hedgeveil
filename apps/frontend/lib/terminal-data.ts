import type { Series, IndexState, OracleCase, Claim } from "./desk-types.ts";
import { Q, scenarioPayout } from "./market-display.ts";
export type GateReason =
  | "STALE_SPOT"
  | "INDEXER_LAG"
  | "NO_OPEN_SERIES"
  | "MAKER_DOWN"
  | "NO_QUOTE"
  | "QUOTE_EXPIRED"
  | "INSUFFICIENT_FREE"
  | "STORAGE_UNPAID"
  | "UNRESOLVED_WITHDRAWAL"
  | "PAUSED"
  | "WALLET_REQUIRED"
  | "BUSY";
export const gateCopy: Record<GateReason, [string, string]> = {
  STALE_SPOT: [
    "Fresh spot unavailable. USD estimates are hidden.",
    "Check again",
  ],
  INDEXER_LAG: [
    "Account checks are behind. New trades are paused.",
    "Refresh data",
  ],
  NO_OPEN_SERIES: ["This market is closed to new trades.", "View history"],
  MAKER_DOWN: ["The maker could not be reached.", "Request again"],
  NO_QUOTE: ["No funded offer for this quantity.", "Change quantity"],
  QUOTE_EXPIRED: ["This offer has expired.", "Refresh offers"],
  INSUFFICIENT_FREE: ["Available funds do not cover this trade.", "Add funds"],
  STORAGE_UNPAID: [
    "Register account storage before trading.",
    "Set up account",
  ],
  UNRESOLVED_WITHDRAWAL: [
    "A withdrawal needs verification. Do not resend.",
    "Check Activity",
  ],
  PAUSED: ["Trading is paused.", "Check status"],
  WALLET_REQUIRED: [
    "Connect your wallet to request an offer.",
    "Connect in header",
  ],
  BUSY: ["Finish the current wallet action first.", "Check wallet"],
};
export function percent(n: bigint, d: bigint, signed = false) {
  if (d <= 0n) return "—";
  const b = (n * 10000n) / d,
    a = b < 0n ? -b : b;
  return (
    (b < 0n ? "-" : signed && b > 0n ? "+" : "") +
    String(a / 100n) +
    "." +
    String(a % 100n).padStart(2, "0") +
    "%"
  );
}
export function oracleCase(
  state: IndexState | null,
  s: Series,
): OracleCase | undefined {
  const source = state?.items.find(
    (x) =>
      x.contract === s.config.oracle_account_id && x.kind === "external_oracle",
  );
  return source?.body.cases?.find(
    (c) =>
      c.config.series_id === s.config.series_id &&
      c.config.oracle_config_hash === s.config.oracle_config_hash,
  );
}
export function lifecycle(s: Series, now: number, evidence?: OracleCase) {
  if (s.final_price !== null) return "FINALIZED";
  if (!now) return "UNAVAILABLE";
  if (BigInt(s.config.maturity_ns) > BigInt(Math.floor(now)) * 1000000n)
    return "OPEN";
  if (evidence?.state === "RESOLUTION_DELAYED") return "RESOLUTION_DELAYED";
  // A resolver may be finalized while the clearinghouse still awaits its callback.
  if (evidence?.state === "PROPOSED") return "PROPOSED";
  return "MATURED_PENDING";
}
export function nearBreakEven(
  quantity: bigint,
  cost: bigint,
  k: bigint,
  claim: Claim,
): bigint | null {
  if (quantity <= 0n || cost < 0n || k <= 0n) return null;
  if (cost === 0n) return claim === "P" ? null : k;
  if (cost >= quantity) return null; // equality is a flat region for P, not one threshold
  const d = claim === "N" ? quantity - cost : cost;
  return (k * quantity + d - 1n) / d;
}
export function fixedPayout(
  s: Series,
  quantity: bigint,
  claim: Claim,
): bigint | null {
  return s.final_price === null
    ? null
    : (quantity * BigInt(claim === "P" ? s.p_coefficient : s.n_coefficient)) /
        Q;
}
export function intrinsicDelta(
  quantity: bigint,
  k: bigint,
  x: bigint,
  claim: Claim,
): bigint | null {
  if (x === k) return null;
  return claim === "P" ? (x < k ? quantity : 0n) : x > k ? quantity : 0n;
}
export function scenarioRows(
  quantity: bigint,
  k: bigint,
  spot: bigint,
  claim: Claim,
  cost?: bigint,
) {
  return [50n, 80n, 100n, 120n, 150n].map((pct) => {
    const x = (spot * pct) / 100n,
      payout = scenarioPayout(quantity, k, x, claim);
    return {
      pct,
      x,
      payout,
      usd: (payout * x) / Q,
      pnlNear: cost === undefined ? null : payout - cost,
      pnlUsd: cost === undefined ? null : (payout * x - cost * spot) / Q,
    };
  });
}

/** Exact stored oracle price, without rounding a report before averaging. */
export function exactUsd(value: string | bigint) {
  const n = BigInt(value),
    scale = 10n ** 12n;
  const tail = String(n % scale)
    .padStart(12, "0")
    .replace(/0+$/, "");
  return "$" + String(n / scale) + (tail ? "." + tail : ".00");
}
export function coefficientText(value: string) {
  const n = BigInt(value);
  const rounded = (n + Q / 20000n) / (Q / 10000n);
  return (
    String(rounded / 10000n) + "." + String(rounded % 10000n).padStart(4, "0")
  );
}
export function missedSampleSlots(
  s: Series,
  evidence: OracleCase | undefined,
  now: number,
) {
  if (!evidence || !now || s.config.oracle_version !== "native-sampled-v1")
    return [];
  const w = s.config.observation_window as { start_ns: string; end_ns: string };
  if (!w) return [];
  const start = BigInt(w.start_ns),
    duration = BigInt(w.end_ns) - start;
  return [0, 1, 2]
    .filter(
      (i) =>
        !evidence.samples[i] &&
        start + (duration * BigInt(i + 1)) / 3n <= BigInt(now) * 1000000n,
    )
    .map((i) => i + 1);
}

export const gateLabel: Record<GateReason, string> = {
  STALE_SPOT: "Spot unavailable",
  INDEXER_LAG: "Account checks pending",
  NO_OPEN_SERIES: "Market closed",
  MAKER_DOWN: "Maker unavailable",
  NO_QUOTE: "No quote",
  QUOTE_EXPIRED: "Quote expired",
  INSUFFICIENT_FREE: "Insufficient funds",
  STORAGE_UNPAID: "Account setup required",
  UNRESOLVED_WITHDRAWAL: "Withdrawal unresolved",
  PAUSED: "Trading paused",
  WALLET_REQUIRED: "Wallet not connected",
  BUSY: "Wallet action pending",
};

/** Every split issues both legs; a merge burns both; redemption burns its leg. */
export function redeemedToDate(s: Series) {
  if (
    [s.total_split, s.total_merged, s.outstanding_p, s.outstanding_n].some(
      (v) => typeof v !== "string" || !/^\d+$/.test(v),
    )
  )
    return null;
  const minted = BigInt(s.total_split!),
    merged = BigInt(s.total_merged!);
  const p = minted - merged - BigInt(s.outstanding_p!),
    n = minted - merged - BigInt(s.outstanding_n!);
  return p < 0n || n < 0n ? null : { minted, merged, p, n };
}
