"use client";
import Link from "next/link";
import { useState } from "react";
import { useDesk } from "./DeskProvider";
import { Modal } from "./Modal";
import { WalletLogo } from "./WalletLogo";

export function WalletControl() {
  const d = useDesk();
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const shortAccount =
    d.account.length > 24
      ? `${d.account.slice(0, 12)}…${d.account.slice(-8)}`
      : d.account;
  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(d.account);
      setCopyStatus("Account copied");
    } catch {
      setCopyStatus(
        "Copy unavailable. Select the account name above to copy it.",
      );
    }
  }
  return (
    <div className="desk-wallet">
      {d.accounts.length ? (
        <button
          className="desk-button wallet-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Wallet account: ${d.account || "Choose account"}`}
          title={d.account || "Choose account"}
          disabled={d.busy}
          onClick={() => {
            setCopyStatus("");
            setOpen(true);
          }}
        >
          <WalletLogo id={d.walletInfo?.id ?? ""} />
          <span>{shortAccount || "Choose account"}</span>
          <span className="status-dot good" aria-hidden="true" />
        </button>
      ) : (
        <button
          className="desk-button lime"
          aria-busy={!!d.connecting}
          disabled={!d.session || d.busy}
          onClick={d.connect}
        >
          {d.connecting ? "Connecting…" : "Connect wallet"}
        </button>
      )}
      {d.connecting && (
        <span className="wallet-connecting" role="status">
          Continue in {d.connecting}
        </span>
      )}
      {open && d.accounts.length > 0 && (
        <Modal
          className="wallet-dialog"
          title="Your wallet"
          onClose={() => setOpen(false)}
        >
          <div className="wallet-identity">
            <WalletLogo id={d.walletInfo?.id ?? ""} />
            <div>
              <strong>{d.walletInfo?.name ?? "NEAR wallet"}</strong>
              <span>Connected</span>
            </div>
          </div>
          {d.accounts.length > 1 ? (
            <label className="wallet-account-label">
              Active account
              <select
                aria-label="Wallet account"
                value={d.account}
                disabled={d.busy}
                onChange={(e) => {
                  setCopyStatus("");
                  d.selectAccount(e.target.value);
                }}
              >
                <option disabled value="">
                  Choose account
                </option>
                {d.accounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="wallet-account-label">
              Account<p className="wallet-full-account">{d.account}</p>
            </div>
          )}
          <div className="wallet-account-actions">
            <button
              className="desk-button"
              disabled={!d.account}
              onClick={() => void copyAccount()}
            >
              {copyStatus === "Account copied" ? "Copied" : "Copy account"}
            </button>
            {d.account && (
              <a
                className="desk-button"
                href={`https://testnet.nearblocks.io/address/${encodeURIComponent(d.account)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on explorer
                <span className="sr-only"> (opens a new tab)</span>
              </a>
            )}
          </div>
          {copyStatus && (
            <p className="wallet-copy-status" role="status">
              {copyStatus}
            </p>
          )}
          <div className="wallet-account-links">
            <Link href="/funds" prefetch={false} onClick={() => setOpen(false)}>
              Manage funds
            </Link>
            <Link
              href="/activity"
              prefetch={false}
              onClick={() => setOpen(false)}
            >
              View activity
            </Link>
          </div>
          <button
            className="desk-button wallet-disconnect"
            disabled={d.busy}
            onClick={() => {
              setOpen(false);
              void d.disconnect();
            }}
          >
            Disconnect wallet
          </button>
        </Modal>
      )}
    </div>
  );
}
