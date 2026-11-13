"use client";
import Link from "next/link";
import { Feedback } from "./Feedback";
import { ThemeToggle } from "../ThemeProvider";
import { SiteFooter } from "../home/SiteFooter";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useNow } from "./Elements";
import { SpotPrice } from "./SpotPrice";
import { Modal } from "./Modal";
import { useDesk } from "./DeskProvider";
import { freshSpot, terminalState } from "../../lib/market-display";
import { WalletControl } from "./WalletControl";
const links = [
  ["/trade", "Trade"],
  ["/portfolio", "Portfolio"],
  ["/funds", "Funds"],
  ["/activity", "Activity"],
];
export function DeskShell({ children }: { children: ReactNode }) {
  const d = useDesk(),
    path = usePathname(),
    now = useNow();
  const healthy = !!(
    d.state?.health.risk_allowed &&
    d.lastChecked &&
    typeof performance !== "undefined" &&
    performance.now() - d.checkedAtMono <= 60000
  );
  const [menu, setMenu] = useState(false),
    [healthOpen, setHealthOpen] = useState(false);
  const healthLabel = !d.session
    ? "Connecting to service"
    : !d.session.configured
      ? "Deployment unavailable"
      : healthy
        ? "Trading checks passed"
        : "Trading paused: data checks pending";
  const unresolved = d.records.filter(
    (r) => r.attempted && !terminalState(r.result?.state),
  ).length;
  const unknownWithdrawals =
    d.live?.tickets.filter(
      (t) => !["SUCCEEDED", "FAILED_CONFIRMED"].includes(t.state),
    ).length ?? 0;
  const staleSpot = !!d.session && !freshSpot(d.spot, now);
  return (
    <div className="desk-layout">
      <div className="desk-shell">
        <a className="skip" href="#desk-main">
          Skip to workspace
        </a>
        <header className="desk-header">
          <a className="wordmark" href="/">
            hedgeveil
          </a>
          <nav className="top-navigation" aria-label="Workspace">
            {links.map(([href, label]) => (
              <Link
                key={href}
                prefetch={false}
                href={href}
                aria-current={path === href ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <button
            className="desk-menu-toggle desk-button"
            aria-expanded={menu}
            aria-haspopup="dialog"
            onClick={() => setMenu(true)}
          >
            Menu
          </button>
          <SpotPrice />
          {(unresolved > 0 || unknownWithdrawals > 0) && (
            <Link className="unresolved-badge" href="/activity">
              {unresolved} unresolved
              {unknownWithdrawals ? `, ${unknownWithdrawals} withdrawals` : ""}
            </Link>
          )}
          <ThemeToggle />
          <WalletControl />
        </header>
        {path !== "/trade" &&
          d.session &&
          (!healthy ||
            staleSpot ||
            unresolved > 0 ||
            unknownWithdrawals > 0) && (
            <div className="degraded-strip" role="status">
              {staleSpot && (
                <span>Spot stale or unavailable, USD estimates hidden</span>
              )}
              {!healthy && (
                <button onClick={() => setHealthOpen(true)}>
                  New trades paused: data checks pending
                </button>
              )}
              {(unresolved > 0 || unknownWithdrawals > 0) && (
                <Link href="/activity">
                  Unresolved actions, check receipts before repeating
                </Link>
              )}
            </div>
          )}
        {menu && (
          <Modal title="Navigate Hedgeveil" onClose={() => setMenu(false)}>
            <nav className="mobile-navigation" aria-label="Mobile workspace">
              {[...links, ["/liquidity", "How pricing works"]].map(
                ([href, label]) => (
                  <Link
                    prefetch={false}
                    key={href}
                    href={href}
                    aria-current={path === href ? "page" : undefined}
                    onClick={() => setMenu(false)}
                  >
                    {label}
                  </Link>
                ),
              )}
            </nav>
          </Modal>
        )}
        {healthOpen && (
          <Modal title="Service status" onClose={() => setHealthOpen(false)}>
            <p role="status">{healthLabel}</p>
            <dl className="desk-facts">
              <div>
                <dt>Last reconciled block</dt>
                <dd>{d.state?.health.height ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Snapshot age</dt>
                <dd>
                  {d.state?.health.age_ms === undefined
                    ? "Unavailable"
                    : `${Math.floor(d.state.health.age_ms / 1000)}s at last check`}
                </dd>
              </div>
              <div>
                <dt>Discovery feed lag</dt>
                <dd>
                  {d.state?.health.discovery?.lag_blocks ?? "Unavailable"}{" "}
                  blocks
                </dd>
              </div>
            </dl>
            <p>
              Discovery feed lag is separate from receipt reconciliation.
              Trading follows the reconciler’s checks.
            </p>
            {d.lastChecked && (
              <p>Last checked {new Date(d.lastChecked).toLocaleString()}</p>
            )}
            <button
              className="desk-button"
              disabled={d.loading || d.busy || !d.session}
              onClick={() => void d.refresh()}
            >
              {d.loading ? "Refreshing…" : "Refresh"}
            </button>
          </Modal>
        )}
        <div className="desk-frame">
          <main id="desk-main" className="desk-main">
            {children}
          </main>
        </div>
      </div>
      <Feedback
        error={d.error}
        notice={d.notice}
        processing={
          d.connecting
            ? `Connecting to ${d.connecting}…`
            : d.busy
              ? "Processing…"
              : d.loading
                ? "Refreshing…"
                : ""
        }
      />
      <SiteFooter workspace />
    </div>
  );
}
