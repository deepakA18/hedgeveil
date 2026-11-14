import type { Claim, Operation, Quote } from "./desk-types.ts";
import { quoteEconomics } from "./market-display.ts";

export function positionBasis(
  records: Operation[],
  account: string,
  contract: string,
  network: string,
  series: string,
  claim: Claim,
  held: bigint,
): { cost: bigint | null; reason: string } {
  let acquired = 0n,
    disposed = 0n,
    cost = 0n,
    buys = 0;
  const seen = new Set<string>();
  try {
    for (const r of records) {
      const i = r.intent;
      if (
        i.signer_id !== account ||
        i.domain.contract_id !== contract ||
        i.domain.network !== network
      )
        continue;
      const q = i.args.quote as Quote | undefined;
      const relevant =
        i.method === "fill_quote"
          ? [...(q?.maker_gives ?? []), ...(q?.taker_gives ?? [])].some(
              (l) => l.asset.series_id === series && l.asset.kind === claim,
            )
          : i.args.series_id === series &&
            ["split", "merge", "redeem"].includes(i.method) &&
            (i.method !== "redeem" || i.args.leg === claim);
      if (!relevant) continue;
      const state = r.result?.state;
      if (
        ["FAILED_CONFIRMED", "CANCELLED", "QUOTE_EXPIRED_UNFILLED"].includes(
          state ?? "",
        )
      )
        continue;
      if (state !== "SUCCEEDED") {
        if (r.attempted || r.hash || r.candidate_hash)
          return { cost: null, reason: "Receipt pending" };
        continue;
      }
      if (!r.hash) return { cost: null, reason: "Entry history incomplete" };
      if (seen.has(r.hash)) continue;
      seen.add(r.hash);
      if (i.method === "split")
        return { cost: null, reason: "Pair cost not allocated" };
      if (i.method === "fill_quote") {
        if (!q || q.taker !== account)
          return { cost: null, reason: "Entry history incomplete" };
        const buy = quoteEconomics(q, series, claim, "BUY");
        const sell = quoteEconomics(q, series, claim, "SELL");
        if (buy) {
          acquired += buy.quantity;
          cost += buy.total;
          buys++;
        } else if (sell) disposed += sell.quantity;
        else return { cost: null, reason: "Entry history incomplete" };
      } else {
        const amount = BigInt(String(i.args.amount));
        if (amount <= 0n) throw Error("invalid amount");
        disposed += amount;
      }
    }
    if (
      held <= 0n ||
      acquired - disposed !== held ||
      acquired <= 0n ||
      cost < 0n
    )
      return { cost: null, reason: "Entry history incomplete" };
    if (disposed > 0n && buys > 1)
      return { cost: null, reason: "Ordered entry history needed" };
    return { cost: (cost * held + acquired - 1n) / acquired, reason: "" };
  } catch {
    return { cost: null, reason: "Entry history incomplete" };
  }
}

export function pnlPercent(pnl: bigint, cost: bigint): string | null {
  if (cost <= 0n) return null;
  const bps = (pnl * 10000n) / cost;
  const abs = bps < 0n ? -bps : bps;
  return `${pnl < 0n ? "−" : "+"}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}%`;
}
