import { CoinbaseMarket } from "../../../services/market-data/coinbase.mjs";
import {
  marketReference,
  MODEL,
  TWAP_MODEL,
} from "../../../services/maker/valuation.mjs";
import { bridgeSettings } from "./desk-bridge.ts";
import type { Series, Session, IndexState } from "./desk-types.ts";
export interface MarkRow {
  seriesId: string;
  kind: "MODEL" | "SETTLED" | "UNAVAILABLE";
  p: string | null;
  n: string | null;
  reason: string | null;
}
export interface MarketMarks {
  contract: string;
  observedAt: string | null;
  fetchedAt: string;
  model: string;
  source: string;
  sigma: number | null;
  spot: string | null;
  height: IndexState["health"]["height"];
  items: MarkRow[];
}
// Read-only pricing. Never calls makers, consumes a nonce, or signs an offer.
export function markRows(
  series: Series[],
  snapshot: any,
  nowNs: string,
): MarkRow[] {
  return series.map((s) => {
    const window = s.config.observation_window as
      { start_ns?: string } | undefined;
    const unavailable = (reason: string): MarkRow => ({
      seriesId: s.config.series_id,
      kind: "UNAVAILABLE",
      p: null,
      n: null,
      reason,
    });
    if (s.final_price === null && BigInt(s.config.maturity_ns) <= BigInt(nowNs))
      return unavailable("AWAITING_SETTLEMENT");
    if (
      s.final_price === null &&
      s.config.oracle_version === "native-trade-twap-v1" &&
      (typeof window?.start_ns !== "string" || !/^\d+$/.test(window.start_ns))
    )
      return unavailable("MODEL_INPUT_UNAVAILABLE");
    if (
      s.final_price === null &&
      s.config.oracle_version === "native-trade-twap-v1" &&
      BigInt(window!.start_ns!) <= BigInt(nowNs)
    )
      return unavailable("MODEL_PARTIAL_HISTORY_REQUIRED");
    if (
      s.final_price === null &&
      !["native-sampled-v1", "native-trade-twap-v1"].includes(
        String(s.config.oracle_version),
      )
    )
      return unavailable("UNSUPPORTED_PROFILE");
    if (s.final_price === null && !snapshot)
      return unavailable("MARKET_DATA_UNAVAILABLE");
    // For finalized series the existing valuation uses only immutable final_price.
    const reference = snapshot ?? {
      source: "COINBASE_EXCHANGE_NEAR_USD_V1",
      price_scale: "1000000000000",
      timestamp_ns: nowNs,
    };
    try {
      const result = marketReference(reference, [s], nowNs);
      return {
        seriesId: s.config.series_id,
        kind: s.final_price === null ? "MODEL" : "SETTLED",
        p: result.marks["P:" + s.config.series_id],
        n: result.marks["N:" + s.config.series_id],
        reason: null,
      };
    } catch {
      return unavailable("MODEL_INPUT_UNAVAILABLE");
    }
  });
}
export function createMarksReader({
  transport = fetch,
  clock = Date.now,
  market = new CoinbaseMarket(),
} = {}) {
  let cached: MarketMarks | null = null,
    pending: Promise<MarketMarks> | null = null,
    lastAttempt = 0;
  return async (): Promise<MarketMarks> => {
    const now = clock();
    if (
      cached &&
      now - Date.parse(cached.fetchedAt) < 15000 &&
      (!cached.observedAt || now - Date.parse(cached.observedAt) < 60000)
    )
      return cached;
    if (pending) return pending;
    if (lastAttempt && now - lastAttempt < 5000)
      throw Error("MARKS_UNAVAILABLE");
    lastAttempt = now;
    pending = (async () => {
      const { backend } = bridgeSettings();
      const read = async (path: string) => {
        const r = await transport(backend + "/api/" + path, {
          headers: { origin: backend },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) throw Error("MARKS_UNAVAILABLE");
        return r.json();
      };
      const [session, state] = (await Promise.all([
        read("session"),
        read("state"),
      ])) as [Session, IndexState];
      if (!session.configured || !session.contract_id)
        throw Error("MARKS_UNAVAILABLE");
      const series = state.items.find((x) => x.contract === session.contract_id)
        ?.body.series;
      if (!series) throw Error("MARKS_UNAVAILABLE");
      let snapshot = null;
      if (
        series.some(
          (s) =>
            s.final_price === null &&
            ["native-sampled-v1", "native-trade-twap-v1"].includes(
              String(s.config.oracle_version),
            ) &&
            BigInt(s.config.maturity_ns) > BigInt(clock()) * 1000000n,
        )
      ) {
        try {
          snapshot = await market.snapshot(String(BigInt(clock()) * 1000000n));
        } catch {
          /* Missing live inputs remain unavailable. */
        }
      }
      const stamp = clock();
      cached = {
        contract: session.contract_id,
        fetchedAt: new Date(stamp).toISOString(),
        observedAt: snapshot
          ? new Date(
              Number(BigInt(snapshot.timestamp_ns) / 1000000n),
            ).toISOString()
          : null,
        model: series.some(
          (s) => s.config.oracle_version === "native-trade-twap-v1",
        )
          ? TWAP_MODEL
          : MODEL,
        source: snapshot
          ? "Coinbase Exchange, NEAR-USD"
          : "Registered chain state",
        sigma: snapshot?.sigma ?? null,
        spot: snapshot?.spot ?? null,
        height: state.health.height,
        items: markRows(series, snapshot, String(BigInt(stamp) * 1000000n)),
      };
      return cached;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}
export const readMarks = createMarksReader();
