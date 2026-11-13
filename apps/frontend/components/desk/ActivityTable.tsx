"use client";
import { Spinner } from "./Feedback";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { StateBadge } from "./TerminalPrimitives";
import { actionName, formatNear } from "../../lib/desk-api";
import { explorerUrl, terminalState } from "../../lib/market-display";
import type { Operation } from "../../lib/desk-types";

export function operationState(r: Operation) {
  return r.result?.state ?? (r.attempted ? "SUBMISSION_UNKNOWN" : "PREPARED");
}
function amount(r: Operation): string {
  if (["storage_deposit", "deposit_collateral"].includes(r.intent.method))
    return (
      formatNear(
        String(
          BigInt(r.intent.attached_deposit) -
            BigInt(r.intent.storage_deposit ?? "0"),
        ),
      ) + " NEAR"
    );
  if (typeof r.intent.args.amount === "string")
    return (
      formatNear(r.intent.args.amount) +
      (r.intent.method === "request_withdrawal" ? " NEAR" : " units")
    );
  return "—";
}
export function ActivityTable({
  records,
  loading,
  busy,
  onDetails,
  onRefresh,
}: {
  records: Operation[];
  loading: boolean;
  busy: boolean;
  onDetails: (id: string) => void;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState("transactions"),
    [page, setPage] = useState(0);
  const filters = [
    {
      id: "transactions",
      label: "Transactions",
      match: (r: Operation) => r.attempted,
    },
    {
      id: "attention",
      label: "Needs attention",
      match: (r: Operation) => r.attempted && !terminalState(operationState(r)),
    },
    { id: "drafts", label: "Drafts", match: (r: Operation) => !r.attempted },
  ];
  const rows = records.filter(filters.find((f) => f.id === filter)!.match);
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, pages - 1);
  return (
    <section className="activity-table-region" aria-label="Account activity">
      <div className="activity-toolbar">
        <div
          className="activity-filters"
          role="group"
          aria-label="Filter activity"
        >
          {filters.map((f) => (
            <button
              type="button"
              key={f.id}
              aria-pressed={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setPage(0);
              }}
            >
              {f.label}
              <span>{records.filter(f.match).length}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="desk-button small"
          disabled={busy || loading}
          onClick={onRefresh}
        >
          {loading && <Spinner />}
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <Table
        className="activity-table"
        aria-label="Wallet activity"
        aria-busy={loading}
      >
        <TableCaption>
          Activity recorded by this app. Unsubmitted reviews appear under
          Drafts.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Action</TableHead>
            <TableHead scope="col" className="amount-cell">
              Amount
            </TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col">Transaction</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Details</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!rows.length ? (
            <TableRow>
              <TableCell colSpan={5} className="activity-empty">
                {loading
                  ? "Loading activity…"
                  : filter === "drafts"
                    ? "No unsubmitted reviews."
                    : filter === "attention"
                      ? "No actions need attention."
                      : "No transactions yet. Add funds or make a trade to get started."}
              </TableCell>
            </TableRow>
          ) : (
            rows.slice(current * 20, current * 20 + 20).map((r) => {
              const state = operationState(r),
                url = explorerUrl(r.hash);
              return (
                <TableRow
                  key={r.intent.operation_id}
                  className={
                    state.includes("UNKNOWN")
                      ? "operation-quarantined"
                      : undefined
                  }
                >
                  <TableCell>
                    <strong>{actionName(r.intent.method)}</strong>
                    <span className="activity-reference">
                      {r.intent.operation_id.slice(0, 8)}
                    </span>
                  </TableCell>
                  <TableCell className="amount-cell">
                    {amount(r)}
                    {r.intent.storage_deposit && (
                      <small className="desk-muted">
                        {" "}
                        + {formatNear(r.intent.storage_deposit)} NEAR storage
                      </small>
                    )}
                  </TableCell>
                  <TableCell>
                    <StateBadge state={state} />
                    {state.includes("UNKNOWN") && (
                      <span className="activity-warning">Do not resend</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {url ? (
                      <a
                        className="activity-link"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.hash!.slice(0, 6)}…{r.hash!.slice(-4)}
                      </a>
                    ) : (
                      <span className="desk-muted">
                        {state === "QUOTE_EXPIRED_UNFILLED"
                          ? "Verified from chain state"
                          : r.attempted
                            ? "Awaiting receipt"
                            : "Not sent"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="activity-row-action">
                    <button
                      type="button"
                      className="desk-button small"
                      onClick={() => onDetails(r.intent.operation_id)}
                      aria-label={`Details for ${actionName(r.intent.method)} ${r.intent.operation_id.slice(0, 8)}`}
                    >
                      Details
                    </button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {pages > 1 && (
        <div className="activity-pagination">
          <button
            className="desk-button small"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            className="desk-button small"
            disabled={current + 1 === pages}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
