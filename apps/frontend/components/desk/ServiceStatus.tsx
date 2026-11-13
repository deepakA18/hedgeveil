"use client";
import { InfoPopover } from "./InfoPopover";
import { useDesk } from "./DeskProvider";
import { useNow } from "./Elements";
import { freshSpot } from "../../lib/market-display";

export function ServiceStatus() {
  const d = useDesk(),
    now = useNow();
  const healthy = !!(
    d.state?.health.risk_allowed &&
    d.lastChecked &&
    typeof performance !== "undefined" &&
    performance.now() - d.checkedAtMono <= 60000
  );
  return (
    <InfoPopover label="Trading status">
      <span className="service-status-line">
        {!d.session
          ? "Connecting to service"
          : !d.session.configured
            ? "Deployment unavailable"
            : healthy
              ? "Trading checks passed"
              : "New trades paused: data checks pending"}
        .
      </span>
      <span className="service-status-line">
        Last reconciled block: {d.state?.health.height ?? "Unavailable"}.
      </span>
      <span className="service-status-line">
        Snapshot age:{" "}
        {d.state?.health.age_ms === undefined
          ? "Unavailable"
          : `${Math.floor(d.state.health.age_ms / 1000)}s at last check`}
        .
      </span>
      <span className="service-status-line">
        Discovery feed lag:{" "}
        {d.state?.health.discovery?.lag_blocks ?? "Unavailable"} blocks. Trading
        follows receipt reconciliation, not discovery lag alone.
      </span>
      {!freshSpot(d.spot, now) && (
        <span className="service-status-line">
          Spot stale or unavailable, USD estimates hidden.
        </span>
      )}
      {d.lastChecked && (
        <span className="service-status-line">
          Last checked {new Date(d.lastChecked).toLocaleString()}.
        </span>
      )}
      <button
        className="service-refresh"
        disabled={d.loading || d.busy || !d.session}
        onClick={() => void d.refresh()}
      >
        {d.loading ? "Refreshing…" : "Refresh status"}
      </button>
    </InfoPopover>
  );
}
