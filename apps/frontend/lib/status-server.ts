import { readSpot } from "./spot-server.ts";
import { backendHeaders, bridgeSettings } from "./desk-bridge.ts";
import type { ServiceCheck, StatusReport, StatusSnapshot } from "./status.ts";

// Bounded, observation-only history. No network writes or background RFQs.
// Gaps and process restarts are not counted as successful checks.
export function createStatusReader(
  backend: () => string = () => bridgeSettings().backend,
  transport: typeof fetch = fetch,
  spot = readSpot,
  clock = Date.now,
) {
  const history: StatusSnapshot[] = [];
  let pending: Promise<StatusReport> | null = null;
  let cached: StatusReport | null = null;
  return async function read(): Promise<StatusReport> {
    if (cached && clock() - Date.parse(cached.checked_at) < 15000)
      return cached;
    if (pending) return pending;
    pending = (async () => {
      const [api, price] = await Promise.allSettled([
        (async () => {
          const response = await transport(backend() + "/api/status", {
            headers: backendHeaders(),
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          });
          if (!response.ok) throw Error("STATUS_UNAVAILABLE");
          const body = await response.json();
          if (
            !Array.isArray(body.services) ||
            body.services.length !== 9 ||
            new Set(body.services.map((r: ServiceCheck) => r.id)).size !== 9 ||
            ![
              "api",
              "indexer",
              "rpc",
              "contracts",
              "discovery",
              "maker-1",
              "maker-2",
              "settlement",
              "renewal",
            ].every((id) =>
              body.services.some((r: ServiceCheck) => r.id === id),
            ) ||
            !Number.isFinite(Date.parse(body.checked_at)) ||
            clock() - Date.parse(body.checked_at) > 30000 ||
            Date.parse(body.checked_at) > clock() + 1000
          )
            throw Error("INVALID_STATUS");
          return body.services.map((r: ServiceCheck) => {
            if (
              !/^[a-z0-9-]{1,40}$/.test(r.id) ||
              !["operational", "degraded", "unavailable", "unknown"].includes(
                r.state,
              ) ||
              typeof r.name !== "string" ||
              r.name.length > 80 ||
              typeof r.detail !== "string" ||
              r.detail.length > 500 ||
              (r.observed_at !== null &&
                !Number.isFinite(Date.parse(r.observed_at)))
            )
              throw Error("INVALID_STATUS");
            return {
              id: r.id,
              name: r.name,
              state: r.state,
              detail: r.detail,
              observed_at: r.observed_at,
            };
          }) as ServiceCheck[];
        })(),
        spot(),
      ]);
      const now = clock(),
        at = new Date(now).toISOString();
      const services: ServiceCheck[] = [
        {
          id: "frontend",
          name: "Web application",
          state: "operational",
          detail:
            "The web server and status route are responding. Wallet signing is checked separately during use.",
          observed_at: at,
        },
      ];
      if (api.status === "fulfilled") services.push(...api.value);
      else {
        services.push({
          id: "api",
          name: "Application API",
          state: "unavailable",
          detail:
            "The backend status endpoint could not be reached or verified. Try again shortly.",
          observed_at: at,
        });
        for (const [id, name] of [
          ["indexer", "Receipt reconciliation"],
          ["rpc", "NEAR RPC reads"],
          ["contracts", "Core and resolver"],
          ["discovery", "FASTNEAR background audit"],
          ["maker-1", "Maker 1"],
          ["maker-2", "Maker 2"],
          ["settlement", "Outlayer settlement"],
          ["renewal", "Market renewal"],
        ])
          services.push({
            id,
            name,
            state: "unknown",
            detail:
              "Backend telemetry is unavailable; this service has not been verified.",
            observed_at: null,
          });
      }
      const fresh =
        price.status === "fulfilled" &&
        now - Date.parse(price.value.observedAt) >= 0 &&
        now - Date.parse(price.value.observedAt) < 30000;
      services.splice(4, 0, {
        id: "prices",
        name: "Coinbase market prices",
        state: fresh ? "operational" : "degraded",
        detail: fresh
          ? "A fresh NEAR/USD spot observation is available. Maker valuation also checks its own historical inputs."
          : "Fresh NEAR/USD spot data is unavailable. Indicative USD values must stay hidden.",
        observed_at:
          fresh && price.status === "fulfilled" ? price.value.observedAt : null,
      });
      const snapshot = { checked_at: at, services };
      history.push(snapshot);
      if (history.length > 30) history.shift();
      cached = { ...snapshot, history: [...history] };
      return cached;
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  };
}
export const readStatus = createStatusReader();
