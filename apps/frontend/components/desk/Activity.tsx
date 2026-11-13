"use client";
import {
  statusLabel,
  explorerUrl,
  terminalState,
} from "../../lib/market-display";
import { StateBadge } from "./TerminalPrimitives";
import { useState } from "react";
import { ActivityTable, operationState } from "./ActivityTable";
import { Modal } from "./Modal";
import { useDesk } from "./DeskProvider";
import { Panel, Empty, WalletGate, Form } from "./Elements";
import {
  formatNear,
  operationText,
  message,
  actionName,
} from "../../lib/desk-api";
export function Activity() {
  const d = useDesk(),
    [operation, setOperation] = useState(""),
    [hash, setHash] = useState(""),
    [detailId, setDetailId] = useState("");
  const detail = d.records.find((r) => r.intent.operation_id === detailId);
  const attempted = d.records.filter((r) => r.attempted);
  return (
    <>
      <h1 className="sr-only">Activity</h1>
      {!d.account ? (
        <WalletGate description="Connect to view your account activity." />
      ) : (
        <>
          <ActivityTable
            records={d.records}
            loading={d.loading}
            busy={d.busy}
            onDetails={setDetailId}
            onRefresh={() => void d.refresh()}
          />
          {detail && (
            <Modal
              title={actionName(detail.intent.method)}
              onClose={() => setDetailId("")}
            >
              <StateBadge state={operationState(detail)} />
              <p>
                {operationState(detail).includes("UNKNOWN")
                  ? "Quarantined. Do not resend. Check the receipts for this signing attempt."
                  : operationText(operationState(detail))}
              </p>
              {operationState(detail).includes("UNKNOWN") && !detail.hash && (
                <p>
                  No transaction hash was received. Check your wallet history.
                  If no wallet prompt appeared, allow pop-ups for this site. An
                  expired offer can be checked for an unfilled nonce; a missing
                  prompt alone does not confirm cancellation.
                </p>
              )}
              <dl className="desk-facts">
                <div>
                  <dt>Account</dt>
                  <dd className="break-anywhere">{detail.intent.signer_id}</dd>
                </div>
                <div>
                  <dt>Operation</dt>
                  <dd className="break-anywhere">
                    {detail.intent.operation_id}
                  </dd>
                </div>
                <div>
                  <dt>Contract</dt>
                  <dd className="break-anywhere">
                    {detail.intent.domain.contract_id}
                  </dd>
                </div>
              </dl>
              <div className="desk-inline">
                {explorerUrl(detail.hash) && (
                  <a
                    className="desk-button small"
                    href={explorerUrl(detail.hash)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </a>
                )}
                {detail.attempted && !terminalState(operationState(detail)) && (
                  <button
                    className="desk-button small"
                    disabled={d.busy}
                    onClick={() => void d.recover(detail.intent.operation_id)}
                  >
                    Check receipts
                  </button>
                )}
                {!detail.attempted && operationState(detail) === "PREPARED" && (
                  <button
                    className="desk-button small"
                    disabled={d.busy}
                    onClick={() => {
                      setDetailId("");
                      void d
                        .review(detail.intent)
                        .catch((e) => d.setError(message(e)));
                    }}
                  >
                    Resume review
                  </button>
                )}
              </div>
              <details className="desk-details">
                <summary>Technical details</summary>
                <pre>{JSON.stringify(detail, null, 2)}</pre>
              </details>
            </Modal>
          )}
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
