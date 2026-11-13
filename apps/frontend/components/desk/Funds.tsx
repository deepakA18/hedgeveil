"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { withdrawalBlocked, maximumDeposit } from "../../lib/market-display";
import { BalanceGrid } from "./BalanceGrid";
import { useDesk } from "./DeskProvider";
import { Heading, Panel, WalletGate, Form, AmountField } from "./Elements";
import { formatNear, parseNear } from "../../lib/desk-api";
export function Funds() {
  const d = useDesk(),
    [action, setAction] = useState("deposit_collateral"),
    [amount, setAmount] = useState(""),
    [withdraw, setWithdraw] = useState(""),
    [receiver, setReceiver] = useState(""),
    [customReceiver, setCustomReceiver] = useState(false);
  useEffect(() => {
    setCustomReceiver(false);
    setReceiver("");
    setWithdraw("");
    setAmount("");
    setAction("deposit_collateral");
  }, [d.account]);
  const balance = d.live?.accounts[d.account];
  const storageSetup =
    d.live && !balance ? d.live.storage.account_minimum : "0";
  const walletMaximum = maximumDeposit(d.live);
  const maxDeposit =
    walletMaximum === null
      ? null
      : walletMaximum > BigInt(storageSetup)
        ? walletMaximum - BigInt(storageSetup)
        : 0n;
  const pendingWithdrawal = withdrawalBlocked(d.records, d.live?.tickets ?? []);
  const fundingAction = balance ? action : "deposit_collateral";
  const fundingAmount =
    amount ||
    (fundingAction === "storage_deposit" && d.live
      ? formatNear(d.live.storage.account_minimum)
      : "");
  return (
    <>
      <Heading
        title="Funds"
        copy="Keep your wallet balance and trading balance separate. Review each transfer before signing."
      />
      {!d.account ? (
        <WalletGate description="Connect to add funds or withdraw to your wallet." />
      ) : (
        <>
          <BalanceGrid />
          <div className="desk-two funds-panels">
            <Panel title="Add funds">
              <Form
                label={
                  fundingAction === "storage_deposit"
                    ? "Review account setup"
                    : "Review deposit"
                }
                disabled={!d.ready || !d.live || d.busy}
                onSubmit={() =>
                  d.review({
                    method: fundingAction,
                    args: {},
                    attached_deposit: String(
                      BigInt(parseNear(fundingAmount)) +
                        (fundingAction === "deposit_collateral"
                          ? BigInt(storageSetup)
                          : 0n),
                    ),
                    ...(fundingAction === "deposit_collateral" &&
                    storageSetup !== "0"
                      ? { storage_deposit: storageSetup }
                      : {}),
                  })
                }
              >
                {balance && (
                  <details className="desk-details">
                    <summary>Advanced: account storage</summary>
                    <p>
                      Storage paid: {formatNear(balance.storage_paid)} NEAR.
                      Separate from spendable funds.
                    </p>
                    <label>
                      Transfer type
                      <select
                        value={action}
                        onChange={(e) => {
                          setAction(e.target.value);
                          setAmount("");
                        }}
                      >
                        <option value="deposit_collateral">
                          Add trading funds
                        </option>
                        <option value="storage_deposit">
                          Add account storage
                        </option>
                      </select>
                    </label>
                  </details>
                )}
                {storageSetup !== "0" && (
                  <p className="desk-muted">
                    First deposit includes {formatNear(storageSetup)} NEAR for
                    account storage, in addition to your trading funds. One
                    wallet approval.
                  </p>
                )}
                <AmountField
                  label="Amount in NEAR"
                  value={fundingAmount}
                  onChange={setAmount}
                />
                {fundingAction === "deposit_collateral" &&
                  maxDeposit !== null && (
                    <>
                      <button
                        type="button"
                        className="desk-text-link"
                        onClick={() =>
                          setAmount(formatNear(maxDeposit.toString()))
                        }
                      >
                        Max after gas reserve
                      </button>
                      <p className="desk-muted">
                        Leaves wallet storage and a conservative gas allowance.
                        The review checks the latest balance again.
                      </p>
                    </>
                  )}
              </Form>
              <p className="desk-muted">
                {fundingAction === "storage_deposit"
                  ? "Storage pays for your on-chain account records. It is not spendable trading collateral."
                  : "This moves NEAR from your wallet into your available trading balance."}{" "}
                Gas is paid separately.
              </p>
            </Panel>
            <Panel title="Withdraw to your wallet">
              <Form
                label="Review withdrawal"
                disabled={!d.ready || !balance || d.busy || pendingWithdrawal}
                disabledReason={
                  pendingWithdrawal
                    ? "A withdrawal is still unresolved. Track it in Activity before withdrawing again."
                    : undefined
                }
                onSubmit={() =>
                  d.review({
                    method: "request_withdrawal",
                    args: {
                      amount: parseNear(withdraw),
                      receiver: customReceiver ? receiver : d.account,
                    },
                  })
                }
              >
                <AmountField
                  label="Amount in NEAR"
                  value={withdraw}
                  onChange={setWithdraw}
                />
                <button
                  type="button"
                  className="desk-text-link"
                  disabled={!balance}
                  onClick={() => setWithdraw(formatNear(balance!.free))}
                >
                  Max available
                </button>
                <p>To your wallet: {d.account}</p>
                <details className="desk-details">
                  <summary>Send to another account</summary>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={customReceiver}
                      onChange={(e) => {
                        setCustomReceiver(e.target.checked);
                        setReceiver("");
                      }}
                    />{" "}
                    Use a different receiving account
                  </label>
                  {customReceiver && (
                    <label>
                      Receiving account
                      <input
                        value={receiver}
                        onChange={(e) => setReceiver(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        required
                      />
                    </label>
                  )}
                </details>
              </Form>
              <p className="desk-muted">
                Only available funds can be withdrawn. Wait for the transfer and
                callback receipts; an unresolved withdrawal must not be sent
                again.
              </p>
              <Link
                prefetch={false}
                className="desk-text-link"
                href="/activity"
              >
                Check withdrawal activity
              </Link>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
