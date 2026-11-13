import { decimalPrice, freshSpot, type Spot } from "./market-display.ts";
const ENDPOINT = "https://api.exchange.coinbase.com/products/NEAR-USD/ticker";
export function createSpotReader(
  transport: typeof fetch = fetch,
  clock: () => number = Date.now,
) {
  let cached: Spot | null = null,
    pending: Promise<Spot> | null = null,
    lastAttempt = 0;
  return async function read(): Promise<Spot> {
    const now = clock();
    if (
      cached &&
      now - Date.parse(cached.fetchedAt) < 5000 &&
      freshSpot(cached, now)
    )
      return cached;
    if (pending) return pending;
    if (lastAttempt && now - lastAttempt < 5000)
      throw Error("SPOT_UNAVAILABLE");
    lastAttempt = now;
    pending = (async () => {
      const r = await transport(ENDPOINT, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(7000),
        headers: { accept: "application/json" },
      });
      if (!r.ok) throw Error("SPOT_UNAVAILABLE");
      const data = await r.json();
      const observedAt = typeof data.time === "string" ? data.time : "";
      const spot: Spot = {
        price: decimalPrice(data.price).toString(),
        observedAt,
        fetchedAt: new Date(clock()).toISOString(),
        source: "Coinbase Exchange",
        product: "NEAR-USD",
      };
      if (!freshSpot(spot, clock())) throw Error("SPOT_STALE");
      cached = spot;
      return spot;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}
export const readSpot = createSpotReader();
