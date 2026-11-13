"use client";
import {
  overallStatus,
  statusLabels,
  type ServiceState,
} from "../../lib/status";
import { useStatus } from "./useStatus";
const headings: Record<ServiceState, string> = {
  operational: "All observed checks passed",
  degraded: "Some services need attention",
  unavailable: "A service is unavailable",
  unknown: "Some services are not verified",
};
const time = (at: string) =>
  new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
export function StatusPage() {
  const { report, loading, stale, refresh } = useStatus();
  const state = stale ? "unknown" : overallStatus(report?.services ?? []);
  return (
    <main id="status-main" className="status-main">
      <section className="status-summary" aria-live="polite">
        <span className={`status-emblem status-${state}`} aria-hidden="true">
          {state === "operational" ? "✓" : state === "unknown" ? "?" : "!"}
        </span>
        <p className="status-eyebrow">SYSTEM STATUS</p>
        <h1>{loading ? "Checking system status" : headings[state]}</h1>
        <p>
          {loading
            ? "Reading service observations…"
            : stale
              ? "Current checks could not be verified. Previous results are not live status."
              : `Last checked ${time(report!.checked_at)}`}
        </p>
        <button
          className="status-refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh status
        </button>
      </section>
      <div className="status-section-heading">
        <h2>Services</h2>
        <p>Live observations, refreshed every 15 seconds</p>
      </div>
      {report ? (
        <div className="status-grid">
          {report.services.map((service) => {
            const current = stale ? "unknown" : service.state;
            const history = report.history.slice(-30);
            return (
              <article className="status-service" key={service.id}>
                <header>
                  <h3>{service.name}</h3>
                  <span className={`service-state status-${current}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {statusLabels[current]}
                  </span>
                </header>
                <p>
                  {stale ? "Waiting for a new status check." : service.detail}
                </p>
                <div
                  className="status-history"
                  aria-label={`${service.name}, recent recorded checks`}
                >
                  {Array.from({ length: 30 - history.length }, (_, i) => (
                    <span
                      key={`empty-${i}`}
                      className="status-bar unobserved"
                      title="No observation"
                    />
                  ))}
                  {history.map((sample) => {
                    const value =
                      sample.services.find((r) => r.id === service.id)?.state ??
                      "unknown";
                    return (
                      <span
                        key={sample.checked_at}
                        className={`status-bar status-${value}`}
                        title={`${time(sample.checked_at)}: ${statusLabels[value]}`}
                      />
                    );
                  })}
                </div>
                <footer>
                  <span>
                    {history.length} recorded{" "}
                    {history.length === 1 ? "check" : "checks"}
                  </span>
                  <span>
                    {!stale && service.observed_at
                      ? `Observed ${time(service.observed_at)}`
                      : "No recent observation"}
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      ) : loading ? (
        <div className="status-grid" aria-label="Loading service checks">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="status-service status-placeholder" key={i}>
              Loading service observation…
            </div>
          ))}
        </div>
      ) : (
        <div className="status-empty" role="alert">
          <h2>Status is unavailable</h2>
          <p>
            The web app could not retrieve current checks. Use Refresh status to
            try again.
          </p>
        </div>
      )}
      <aside className="status-notes">
        <h2>About these checks</h2>
        <p>
          Bars show up to 30 actual checks collected while this web server is
          running. Empty bars mean no observation. Gaps between checks are not
          monitored uptime, and history resets on a server restart.
        </p>
        <p>
          Process availability does not guarantee a funded offer or a completed
          transaction. Wallet actions are confirmed only by finalized receipts.
          The background audit can lag independently of trading reconciliation.
        </p>
        <div className="status-legend">
          {Object.entries(statusLabels).map(([key, label]) => (
            <span key={key}>
              <span className={`status-dot status-${key}`} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </aside>
    </main>
  );
}
