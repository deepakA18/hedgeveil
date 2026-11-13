import type { Claim, Offer } from "./desk-types.ts";
import { quoteEconomics } from "./market-display.ts";

export type OfferRequest = {
  mode: string;
  asset: { kind: Claim; series_id: string };
  amount: string;
  taker: string;
};

// Rank executable exact-size offers by cost/proceeds including the maker fee.
// The server preview still verifies signatures, balances and deployment binding.
export function bestReviewOffer(
  items: Offer[],
  request: OfferRequest,
  nowMs: number,
) {
  if (!nowMs) return -1;
  let best = -1,
    total = 0n;
  for (const [index, item] of items.entries()) {
    const q = item.quote;
    if (!q || q.taker !== request.taker) continue;
    try {
      if (BigInt(q.expiry_ns) <= BigInt(Math.floor(nowMs + 5000)) * 1000000n)
        continue;
      const e = quoteEconomics(
        q,
        request.asset.series_id,
        request.asset.kind,
        request.mode,
      );
      if (!e || e.quantity !== BigInt(request.amount) || e.total < 0n) continue;
      if (
        best < 0 ||
        (request.mode === "BUY" ? e.total < total : e.total > total)
      ) {
        best = index;
        total = e.total;
      }
    } catch {
      /* Malformed offers never reach review. */
    }
  }
  return best;
}

export async function requestReviewOffers(
  request: OfferRequest,
  fetchOffers: (request: OfferRequest) => Promise<{ items: Offer[] }>,
  current: () => boolean,
  wait: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 1200)),
) {
  const result = await fetchOffers(request);
  if (!current()) return null;
  // One bounded retry of quote discovery only. Never retry prepare, sign or send.
  if (
    result.items.length &&
    result.items.every(
      (o) =>
        !o.quote &&
        ["MAKER_BUSY", "MAKER_MAINTENANCE"].includes(o.reason ?? ""),
    )
  ) {
    await wait();
    if (!current()) return null;
    const retry = await fetchOffers(request);
    return current() ? retry : null;
  }
  return result;
}
