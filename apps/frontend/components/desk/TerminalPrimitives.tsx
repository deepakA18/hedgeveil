"use client";
import { type ReactNode } from "react";
import { amountDisplay } from "../../lib/amount-display";
import { gateCopy, type GateReason } from "../../lib/terminal-data";
import { useNow } from "./Elements";
export function Num({
  value,
  unit = "NEAR",
  precision = 4,
}: {
  value?: string | bigint | null;
  unit?: string;
  precision?: 4 | 6;
}) {
  return (
    <span
      className="num"
      title={
        value === undefined || value === null
          ? "Unavailable"
          : String(value) + " atomic units"
      }
    >
      {value === undefined || value === null
        ? "—"
        : amountDisplay(String(value), precision).text}
      {value !== undefined && value !== null && unit ? " " + unit : ""}
    </span>
  );
}
export function Countdown({
  targetNs,
  elapsed = false,
}: {
  targetNs: string;
  elapsed?: boolean;
}) {
  const now = useNow();
  const t = Number(BigInt(targetNs) / 1000000n),
    delta = now
      ? Math.max(0, Math.floor((elapsed ? now - t : t - now) / 1000))
      : null;
  const text =
    delta === null
      ? "—"
      : delta >= 86400
        ? `${Math.floor(delta / 86400)}d ${Math.floor((delta % 86400) / 3600)}h`
        : delta >= 3600
          ? `${Math.floor(delta / 3600)}h ${Math.floor((delta % 3600) / 60)}m`
          : delta >= 60
            ? `${Math.floor(delta / 60)}m ${delta % 60}s`
            : `${delta}s`;
  return (
    <time
      className="num"
      title={new Date(t).toLocaleString() + ", " + new Date(t).toUTCString()}
      dateTime={new Date(t).toISOString()}
    >
      {text}
    </time>
  );
}
const labels: Record<string, string> = {
  OPEN: "Open",
  MATURED_PENDING: "Awaiting settlement",
  PROPOSED: "In review",
  FINALIZED: "Finalized",
  RESOLUTION_DELAYED: "Settlement delayed",
  UNAVAILABLE: "Checking",
  PENDING: "Pending",
  SUCCEEDED: "Confirmed",
  WITHDRAWAL_SUCCEEDED: "Confirmed",
  FAILED_CONFIRMED: "Failed, verified",
  WITHDRAWAL_FAILED_CONFIRMED: "Failed, restored",
  UNKNOWN: "Unknown, quarantined",
  SUBMISSION_UNKNOWN: "Unknown, quarantined",
  WITHDRAWAL_UNKNOWN: "Unknown, quarantined",
  PREPARED: "Ready to review",
  CANCELLED: "Cancelled",
  QUOTE_EXPIRED_UNFILLED: "Expired without a fill",
};
export function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={
        "state-badge " +
        (state.includes("UNKNOWN")
          ? "quarantined"
          : state === "OPEN" || state === "FINALIZED" || state === "SUCCEEDED"
            ? "state-good"
            : "")
      }
      title={state}
    >
      {labels[state] ?? state}
    </span>
  );
}
export function Gate({
  reason,
  id,
  onAction,
  children,
}: {
  reason: GateReason | null;
  id?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  if (!reason) return <>{children}</>;
  return (
    <div id={id} className="execution-gate" data-reason={reason} role="status">
      <span>{gateCopy[reason][0]}</span>
      {onAction && (
        <button type="button" onClick={onAction}>
          {gateCopy[reason][1]}
        </button>
      )}
    </div>
  );
}
