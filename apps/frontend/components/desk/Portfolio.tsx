"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
} from "./Elements";
import { parseNear } from "../../lib/desk-api";
import type { Claim } from "../../lib/desk-types";
export function Portfolio() {
  const d = useDesk(),
    now = useNow(),
    [action, setAction] = useState<"split" | "merge">("split"),
    [pairOpen, setPairOpen] = useState(false),
    [id, setId] = useState(""),
    [quantity, setQuantity] = useState("");
  const pairHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (pairOpen) pairHeading.current?.focus();
  }, [pairOpen, action]);
  function openPair(next: "split" | "merge") {
    setAction(next);
    setId("");
    setQuantity("");
    setPairOpen(true);
  }
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
          <div className="desk-actions portfolio-actions">
            {d.account && (
              <>
                <button
                  type="button"
                  className="desk-button lime"
                  aria-expanded={pairOpen && action === "split"}
                  aria-controls="position-actions"
                  onClick={() => openPair("split")}
                >
                  Create a pair
                </button>
                <button
                  type="button"
                  className="desk-button dark"
                  aria-expanded={pairOpen && action === "merge"}
                  aria-controls="position-actions"
                  onClick={() => openPair("merge")}
                >
                  Merge pairs
                </button>
              </>
            )}
          </div>
        }
      />
      {!d.account ? (
        <WalletGate description="Connect to view and manage your positions." />
      ) : (
        <>
          {pairOpen && (
            <section
              id="position-actions"
              className="desk-panel portfolio-pair"
              aria-labelledby="pair-title"
            >
              <div className="portfolio-pair-heading">
                <h2 id="pair-title" ref={pairHeading} tabIndex={-1}>
                  {action === "split"
                    ? "Create a pair"
                    : "Merge pairs into NEAR"}
                </h2>
                <button
                  type="button"
                  className="desk-button"
                  onClick={() => setPairOpen(false)}
                >
                  Close
                </button>
              </div>
              <p className="form-hint">
                {action === "split"
                  ? "Use your trading balance to create equal amounts of Upside and Capped value. One pair is backed by 1 NEAR."
                  : "Combine equal amounts of Upside and Capped value from the same market. Each pair returns 1 NEAR to your trading balance."}
              </p>
              <Form
                key={action}
                editable
                disabled={!d.ready || d.busy || !!actionBlocked}
                disabledReason={actionBlocked}
                label={
                  action === "split" ? "Review pair creation" : "Review merge"
                }
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
                  Market
                  <select
                    value={series?.config.series_id ?? ""}
                    onChange={(e) => setId(e.target.value)}
                  >
                    {!series && <option value="">No eligible market</option>}
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
                  label="Pairs"
                  value={quantity}
                  onChange={setQuantity}
                />
              </Form>
            </section>
          )}
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
                  href={balance ? "/trade" : "/funds"}
                >
                  {balance ? "Explore markets" : "Manage funds"}
                </Link>
              </Empty>
            ) : (
              <PositionRows expert />
            )}
          </Panel>
        </>
      )}
    </>
  );
}
