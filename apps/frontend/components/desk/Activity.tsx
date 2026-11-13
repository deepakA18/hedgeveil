"use client";
import {
  statusLabel,
  explorerUrl,
  terminalState,
} from "../../lib/market-display";
import { StateBadge } from "./TerminalPrimitives";
import { useState } from "react";
import { useDesk } from "./DeskProvider";
import { Heading, Panel, Empty, WalletGate, Form } from "./Elements";
import {
  formatNear,
  operationText,
  message,
  actionName,
} from "../../lib/desk-api";
export function Activity() {
  const d = useDesk(),
    [operation, setOperation] = useState(""),
    [hash, setHash] = useState("");
  const attempted = d.records.filter((r) => r.attempted);
  return (
    <>
      <Heading
        title="Activity"
        copy="Follow confirmed receipts, pending transfers and actions that need another check."
      />
      {!d.account ? (
        <WalletGate description="Connect to view your account activity." />
      ) : (
        <>
          <p className="desk-muted">
            {d.receiptCheck ||
              "Pending receipts are checked automatically while this app is visible. Transactions are never resent."}
          </p>
          <Panel title="Your actions">
            {!d.records.length ? (
              <Empty
                title={
                  d.loading
                    ? "Loading retained actions…"
                    : "No actions to show."
                }
              >
                <p>
                  Actions prepared in this local workspace appear here. A
                  missing history response does not prove no transaction was
                  sent.
                </p>
              </Empty>
            ) : (
              <div className="activity-list">
                {d.records.map((r) => {
                  const state =
                    r.result?.state ??
                    (r.attempted ? "SUBMISSION_UNKNOWN" : "PREPARED");
                  return (
                    <article
                      className={
                        state.includes("UNKNOWN") ? "operation-quarantined" : ""
                      }
                      key={r.intent.operation_id}
                    >
                      <div className="panel-top">
                        <h3>{actionName(r.intent.method)}</h3>
                        <StateBadge state={state} />
                      </div>
                      <p>
                        {state.includes("UNKNOWN")
                          ? "Quarantined. Do not resend; use receipt recovery below."
                          : operationText(state)}
                      </p>
                      {typeof r.intent.args.amount === "string" && (
                        <p>
                          {formatNear(r.intent.args.amount)}{" "}
                          {r.intent.method === "request_withdrawal"
                            ? "NEAR"
                            : "units"}
                        </p>
                      )}
                      {["storage_deposit", "deposit_collateral"].includes(
                        r.intent.method,
                      ) && <p>{formatNear(r.intent.attached_deposit)} NEAR</p>}
                      {explorerUrl(r.hash) && (
                        <a
                          className="desk-text-link"
                          href={explorerUrl(r.hash)!}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View transaction
                        </a>
                      )}
                      <details className="desk-details">
                        <summary>
                          Advanced: receipt recovery and details
                        </summary>
                        <div className="desk-inline">
                          <button
                            className="desk-button small"
                            disabled={
                              d.busy || !r.attempted || terminalState(state)
                            }
                            onClick={() =>
                              void d.recover(r.intent.operation_id)
                            }
                          >
                            Check receipts
                          </button>
                          {!r.attempted && state === "PREPARED" && (
                            <button
                              className="desk-button small"
                              disabled={d.busy}
                              onClick={() =>
                                void d
                                  .review(r.intent)
                                  .catch((e) => d.setError(message(e)))
                              }
                            >
                              Resume review
                            </button>
                          )}
                        </div>

                        <pre>{JSON.stringify(r, null, 2)}</pre>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
          <details className="desk-details">
            <summary>
              Advanced: recover a response or manage withdrawal records
            </summary>
            <div className="desk-two">
              <Panel title="Recover a wallet response">
                <p>
                  If a wallet response was lost, verify the hash from that exact
                  signing attempt. This checks receipts; it never sends a
                  replacement transaction.
                </p>
                <Form
                  label="Check matching receipts"
                  disabled={!attempted.length || d.busy}
                  onSubmit={() =>
                    d.recover(
                      operation || attempted[0].intent.operation_id,
                      hash,
                    )
                  }
                >
                  <label>
                    Signing attempt
                    <select
                      value={
                        operation || attempted[0]?.intent.operation_id || ""
                      }
                      onChange={(e) => setOperation(e.target.value)}
                    >
                      {attempted.map((r) => (
                        <option
                          value={r.intent.operation_id}
                          key={r.intent.operation_id}
                        >
                          {actionName(r.intent.method)},{" "}
                          {r.intent.operation_id.slice(0, 12)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Transaction hash
                    <input
                      value={hash}
                      onChange={(e) => setHash(e.target.value)}
                      required
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                </Form>
              </Panel>
              <Panel title="Withdrawals">
                {!d.live ? (
                  <p>Refresh to load withdrawal tickets.</p>
                ) : !d.live.tickets.length ? (
                  <Empty title="No retained withdrawal tickets.">
                    <p>Withdrawal results are also recorded in your actions.</p>
                  </Empty>
                ) : (
                  d.live.tickets.map((t) => (
                    <article className="withdrawal-ticket" key={t.id}>
                      <div className="panel-top">
                        <h3>{formatNear(t.amount)} NEAR</h3>
                        <span className="desk-pill">
                          {statusLabel(t.state)}
                        </span>
                      </div>
                      <p className="break-anywhere">To {t.receiver}</p>
                      <p>
                        {t.state === "UNKNOWN"
                          ? "Funds remain quarantined. A timeout never permits a resend."
                          : t.state === "PENDING"
                            ? "Waiting for transfer and callback receipts."
                            : t.state === "FAILED_CONFIRMED"
                              ? "Transfer failed. Check the confirmed restoration before withdrawing again."
                              : "Transfer completed."}
                      </p>
                      {["SUCCEEDED", "FAILED_CONFIRMED"].includes(t.state) && (
                        <button
                          className="desk-button small"
                          disabled={d.busy}
                          onClick={() =>
                            void d
                              .review({
                                method: "close_ticket",
                                args: { ticket_id: String(t.id) },
                              })
                              .catch((e) => d.setError(message(e)))
                          }
                        >
                          Review ticket cleanup
                        </button>
                      )}
                      <details className="desk-details">
                        <summary>Ticket details</summary>
                        <pre>{JSON.stringify(t, null, 2)}</pre>
                      </details>
                    </article>
                  ))
                )}
              </Panel>
            </div>
          </details>
        </>
      )}
    </>
  );
}
