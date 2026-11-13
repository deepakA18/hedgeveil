import type {
  LiveState,
  Claim,
  Quote,
  Series,
  Operation,
  Ticket,
} from "./desk-types.ts";
export const Q = 10n ** 24n;
export const USD = 10n ** 12n;
export const SPOT_MAX_AGE = 30_000;
export interface Spot {
  price: string;
  observedAt: string;
  fetchedAt: string;
  source: "Coinbase Exchange";
  product: "NEAR-USD";
}
export function decimalPrice(value: unknown): bigint {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,12})?$/.test(value)
  )
    throw Error("INVALID_PRICE");
  const [a, b = ""] = value.split(".");
  const n = BigInt(a) * USD + BigInt(b.padEnd(12, "0"));
  if (n <= 0n || n > 1_000_000n * USD) throw Error("INVALID_PRICE");
  return n;
}
export function freshSpot(spot: Spot | null, now: number): spot is Spot {
  if (!spot || !now) return false;
  const observed = Date.parse(spot.observedAt),
    fetched = Date.parse(spot.fetchedAt);
  return (
    Number.isFinite(observed) &&
    Number.isFinite(fetched) &&
    observed <= now + 5000 &&
    fetched <= now + 5000 &&
    now - observed <= SPOT_MAX_AGE &&
    now - fetched <= SPOT_MAX_AGE
  );
}
export function usdText(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const n = value < 0n ? -value : value;
  if (n > 0n && n < USD / 100n) return sign + "<$0.01";
  const cents = (n + USD / 200n) / (USD / 100n);
  return (
    sign +
    "$" +
    String(cents / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    String(cents % 100n).padStart(2, "0")
  );
}
export function priceText(value: string): string {
  const n = BigInt(value),
    cents = usdText(n);
  return n % (USD / 100n) === 0n ? cents : "≈ " + cents;
}
export function marketName(s: Series) {
  return "NEAR " + priceText(s.config.strike);
}
export function relativeEnd(ns: string, now: number) {
  if (!now) return "Loading expiry…";
  const delta = Number(BigInt(ns) / 1000000n) - now;
  if (delta <= 0) return "Ended";
  const minutes = Math.max(1, Math.ceil(delta / 60000));
  return minutes >= 1440
    ? `Ends in ${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`
    : minutes >= 60
      ? `Ends in ${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `Ends in ${minutes}m`;
}
export function isOpen(s: Series, now: number) {
  return (
    !!now &&
    s.final_price === null &&
    BigInt(s.config.maturity_ns) > BigInt(now) * 1000000n
  );
}
export function distanceFromSpot(
  strike: string,
  spot: Spot | null,
  now: number,
) {
  if (!freshSpot(spot, now)) return "Spot unavailable";
  const pct =
    ((BigInt(strike) - BigInt(spot.price)) * 10000n) / BigInt(spot.price);
  return `${pct > 0n ? "+" : ""}${Number(pct) / 100}% from spot`;
}
// Same coefficient flooring as the contract; results are atomic NEAR, never floats.
export function scenarioPayout(
  quantity: bigint,
  strike: bigint,
  reference: bigint,
  claim: Claim,
) {
  if (quantity < 0n || strike <= 0n || reference < 0n)
    throw Error("INVALID_SCENARIO");
  const p = reference <= strike ? Q : (strike * Q) / reference;
  return (quantity * (claim === "P" ? p : Q - p)) / Q;
}
export function usdValue(near: bigint, price: bigint) {
  return (near * price) / Q;
}
export function quoteEconomics(
  quote: Quote,
  seriesId: string,
  claim: Claim,
  side: string,
) {
  const claims = side === "BUY" ? quote.maker_gives : quote.taker_gives,
    cash = side === "BUY" ? quote.taker_gives : quote.maker_gives;
  if (
    claims.length !== 1 ||
    claims[0].asset.kind !== claim ||
    claims[0].asset.series_id !== seriesId ||
    cash.length !== 1 ||
    cash[0].asset.kind !== "COLLATERAL"
  )
    return null;
  const quantity = BigInt(claims[0].amount),
    gross = BigInt(cash[0].amount),
    fee = BigInt(quote.fee.amount);
  if (quantity <= 0n || gross < 0n || fee < 0n) return null;
  return {
    quantity,
    gross,
    fee,
    total: side === "BUY" ? gross + fee : gross - fee,
  };
}
export const terminalState = (s: string | undefined) =>
  [
    "CANCELLED",
    "SUCCEEDED",
    "FAILED_CONFIRMED",
    "WITHDRAWAL_SUCCEEDED",
    "WITHDRAWAL_FAILED_CONFIRMED",
  ].includes(s ?? "");
export function withdrawalBlocked(records: Operation[], tickets: Ticket[]) {
  return (
    tickets.some((t) => !["SUCCEEDED", "FAILED_CONFIRMED"].includes(t.state)) ||
    records.some(
      (r) =>
        r.attempted &&
        r.intent.method === "request_withdrawal" &&
        !terminalState(r.result?.state),
    )
  );
}
export function statusLabel(state: string) {
  return (
    (
      {
        CANCELLED: "Cancelled",
        SUCCEEDED: "Confirmed",
        WITHDRAWAL_SUCCEEDED: "Confirmed",
        FAILED_CONFIRMED: "Failed",
        WITHDRAWAL_FAILED_CONFIRMED: "Failed, funds restored",
        PREPARED: "Ready to review",
        PENDING: "Pending",
        SUBMISSION_UNKNOWN: "Needs verification",
        WITHDRAWAL_UNKNOWN: "Needs verification",
        UNKNOWN: "Needs verification",
      } as Record<string, string>
    )[state] ?? "Needs verification"
  );
}
export function explorerUrl(hash: unknown) {
  return typeof hash === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hash)
    ? "https://testnet.nearblocks.io/txns/" + hash
    : null;
}

// Same conservative gas allowance as the current SDK intent + backend preview.
// The final review always refreshes/revalidates it before wallet signing.
export function maximumDeposit(live: LiveState | null): bigint | null {
  if (
    !live?.gas_price ||
    !live.storage.storage_byte_cost ||
    !Number.isSafeInteger(live.native.storage_usage) ||
    live.native.storage_usage! < 0
  )
    return null;
  const remaining =
    BigInt(live.native.amount) -
    BigInt(live.native.storage_usage!) *
      BigInt(live.storage.storage_byte_cost) -
    250000000000000n * BigInt(live.gas_price) * 2n;
  return remaining > 0n ? remaining : 0n;
}
export function buyMetrics(
  quantity: bigint,
  gross: bigint,
  fee: bigint,
  strike: bigint,
  spot: bigint,
  claim: Claim,
) {
  if (quantity <= 0n || gross < 0n || fee < 0n || spot <= 0n || strike <= 0n)
    throw Error("INVALID_QUOTE_METRICS");
  const costUsd = usdValue(gross + fee, spot);
  const perUnit = (costUsd * Q + quantity - 1n) / quantity;
  return {
    costUsd,
    breakEven:
      claim === "P" && perUnit > strike
        ? null
        : claim === "N"
          ? strike + perUnit
          : perUnit,
    premium: gross - scenarioPayout(quantity, strike, spot, claim),
  };
}
