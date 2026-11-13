"use client";
import Link from "next/link";
import { useState } from "react";
import { PositionRows } from "./PositionRows";
import { UsdEstimate } from "./SpotPrice";
import { marketName, relativeEnd } from "../../lib/market-display";
import { TokenAmount } from "./TokenAmount";
import { useDesk } from "./DeskProvider";
import {
  Heading,
  Panel,
  Empty,
  WalletGate,
  Form,
  AmountField,
  useNow,
  seriesStatus,
} from "./Elements";
import {
  formatNear,
  parseNear,
  claimName,
  dollars,
  message,
} from "../../lib/desk-api";
import type { Claim } from "../../lib/desk-types";
export function Portfolio() {
  const d = useDesk(),
    now = useNow(),
    [action, setAction] = useState("split"),
    [id, setId] = useState(""),
    [quantity, setQuantity] = useState("");
  const balance = d.live?.accounts[d.account];
  const positions = d.series
    .flatMap((s) =>
      (["N", "P"] as Claim[]).map((kind) => ({
        s,
        kind,
        amount: balance?.positions[s.slot]?.[kind === "N" ? "n" : "p"] ?? "0",
      })),
    )
    .filter((p) => BigInt(p.amount) > 0n);
  const eligible = d.series.filter(
    (s) =>
      s.final_price === null &&
      (action === "split"
        ? now > 0 && BigInt(s.config.mint_cutoff_ns) > BigInt(now) * 1000000n
        : BigInt(balance?.positions[s.slot]?.p ?? "0") > 0n &&
          BigInt(balance?.positions[s.slot]?.n ?? "0") > 0n),
  );
  const series = eligible.find((s) => s.config.series_id === id) ?? eligible[0];
  const actionBlocked = !series
    ? action === "split"
      ? "No series is open for creating pairs."
      : "You need matching claims in an unsettled series to combine a pair."
    : action === "split" && !d.state?.health.risk_allowed
      ? "Creating pairs is paused until data checks pass."
      : "";
  return (
    <>
      <Heading
        title="Portfolio"
        copy="Track what you hold. Sell when an offer is available, or claim after settlement."
        action={
          <Link prefetch={false} className="desk-button dark" href="/funds">
            Add / withdraw funds
          </Link>
        }
      />
      {!d.account ? (
        <WalletGate />
      ) : (
        <>
          <div className="desk-stats">
            <div>
              <span>Available balance</span>
              <strong>
                <TokenAmount value={balance?.free} label="Available balance" />
              </strong>
              <UsdEstimate amount={balance?.free} />
            </div>
            <div>
              <span>Positions held</span>
              <strong>{d.live ? positions.length : "—"}</strong>
            </div>
            <div>
              <span>Portfolio market value</span>
              <strong className="value-unavailable">Not quoted</strong>
              <small>Request an offer to see an exit price.</small>
            </div>
          </div>
          <Panel title="Your positions">
            {d.loading && !d.live ? (
              <div className="desk-skeleton">Loading finalized holdings…</div>
            ) : !d.live ? (
              <Empty title="Balances are unavailable.">
                <p>
                  Refresh to check finalized ownership. A missing response is
                  not a zero balance.
                </p>
              </Empty>
            ) : !positions.length ? (
              <Empty title="No positions yet.">
                <p>
                  {balance
                    ? "Explore markets to find your first trade."
                    : "Register your account and add funds to begin."}
                </p>
                <Link
                  prefetch={false}
                  className="desk-button"
                  href={balance ? "/markets" : "/funds"}
                >
                  {balance ? "Explore markets" : "Manage funds"}
                </Link>
              </Empty>
            ) : (
              <PositionRows expert />
            )}
          </Panel>
          <details className="desk-details">
            <summary>Advanced: create or combine a backed pair</summary>
            <div id="position-actions" className="desk-two">
              <Panel title="Create or combine a pair">
                <Form
                  editable
                  disabled={!d.ready || d.busy || !!actionBlocked}
                  disabledReason={actionBlocked}
                  label="Review action"
                  onSubmit={() =>
                    d.review({
                      method: action,
                      args: {
                        series_id: series!.config.series_id,
                        amount: parseNear(quantity),
                      },
                    })
                  }
                >
                  <label>
                    Action
                    <select
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                    >
                      <option value="merge">
                        Combine a matching pair into NEAR
                      </option>
                      <option value="split">Create a pair from NEAR</option>
                    </select>
                  </label>
                  <label>
                    Series
                    <select
                      value={series?.config.series_id ?? ""}
                      onChange={(e) => setId(e.target.value)}
                    >
                      {!series && <option value="">No eligible series</option>}
                      {eligible.map((s) => (
                        <option
                          key={s.config.series_id}
                          value={s.config.series_id}
                        >
                          {marketName(s)},{" "}
                          {relativeEnd(s.config.maturity_ns, now)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <AmountField
                    label="Quantity"
                    value={quantity}
                    onChange={setQuantity}
                  />
                </Form>
              </Panel>
              <section className="desk-panel soft">
                <span className="desk-label">Your next step</span>
                <h2>
                  {action === "merge"
                    ? "Two matching positions. One NEAR balance."
                    : "Create both sides, fully backed."}
                </h2>
                <p>
                  {action === "merge"
                    ? "Combine equal quantities of upside and capped-value positions from the same unsettled series. The matching NEAR backing returns to your app balance."
                    : "Creating a pair locks the full NEAR backing. This is available only before the series cutoff and while trading checks pass."}
                </p>
                <Link prefetch={false} className="desk-text-link" href="/funds">
                  Go to funds
                </Link>
              </section>
            </div>
          </details>
        </>
      )}
    </>
  );
}
