"use client";
import Link from "next/link";
import { overallStatus, statusLabels } from "../../lib/status";
import { useStatus } from "./useStatus";
export function StatusLink() {
  const { report, stale } = useStatus();
  const state = stale ? "unknown" : overallStatus(report?.services ?? []);
  return (
    <Link
      href="/status"
      prefetch={false}
      className="footer-status"
      aria-label={`System status: ${statusLabels[state]}`}
    >
      <span className={`status-dot status-${state}`} aria-hidden="true" />
      Status
    </Link>
  );
}
