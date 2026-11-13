"use client";
import Link from "next/link";
import { useDesk } from "./DeskProvider";
import { useNow, WalletGate } from "./Elements";
import { Num, StateBadge } from "./TerminalPrimitives";
import { LockedPayout } from "./SettlementPanel";
import {
  fixedPayout,
  intrinsicDelta,
  lifecycle,
  oracleCase,
} from "../../lib/terminal-data";
import {
  freshSpot,
  scenarioPayout,
  usdText,
  usdValue,
  marketName,
} from "../../lib/market-display";
import { message } from "../../lib/desk-api";
import type { Claim } from "../../lib/desk-types";
export function PositionRows({ expert = false }: { expert?: boolean }) {
  const d = useDesk(),
    now = useNow(),
    balance = d.live?.accounts[d.account];
  const rows = d.series
    .flatMap((s) =>
      (["P", "N"] as Claim[]).map((claim) => ({
        s,
        claim,
        quantity: BigInt(
          balance?.positions[s.slot]?.[claim === "P" ? "p" : "n"] ?? "0",
        ),
      })),
    )
    .filter((x) => x.quantity > 0n);
  if (!d.account)
    return <WalletGate compact description="Connect to see your positions." />;
  if (!d.live)
    return (
      <p className="rail-note">
        Position data unavailable. Refresh to verify balances.
      </p>
    );
  if (!rows.length)
    return (
      <p className="rail-note">
        No positions. <Link href="/funds">Manage funds</Link>
      </p>
    );
  return (
    <div className="positions-compact">
      {rows.map(({ s, claim, quantity }) => {
        const spot = freshSpot(d.spot, now) ? BigInt(d.spot.price) : null,
          state = lifecycle(s, now, oracleCase(d.state, s)),
          fixed = fixedPayout(s, quantity, claim),
          projected =
            fixed ??
            (spot === null
              ? null
              : scenarioPayout(quantity, BigInt(s.config.strike), spot, claim));
        const p = BigInt(balance?.positions[s.slot]?.p ?? "0"),
          n = BigInt(balance?.positions[s.slot]?.n ?? "0"),
          matched = p < n ? p : n;
        return (
          <article className="position-row" key={s.config.series_id + claim}>
            <div>
              <strong>
                {claim === "N" ? "Upside" : "Capped value"}, {marketName(s)}
              </strong>
              <StateBadge state={state} />
            </div>
            <dl>
              <div>
                <dt>Units</dt>
                <dd>
                  <Num value={quantity} unit="" />
                </dd>
              </div>
              <div>
                <dt>
                  {fixed === null
                    ? "At current spot, estimate"
                    : "Final payout"}
                </dt>
                <dd>
                  <Num value={projected} />
                  {projected !== null && spot !== null && (
                    <small>≈ {usdText(usdValue(projected, spot))}</small>
                  )}
                </dd>
              </div>
              <div>
                <dt>Matched pairs</dt>
                <dd>
                  <Num value={matched} unit="" />
                </dd>
              </div>
              {expert && (
                <div>
                  <dt>Intrinsic NEAR exposure</dt>
                  <dd>
                    <Num
                      value={
                        spot === null
                          ? null
                          : (fixed ??
                            intrinsicDelta(
                              quantity,
                              BigInt(s.config.strike),
                              spot,
                              claim,
                            ))
                      }
                      unit=""
                    />
                    <small>Payoff slope, not model delta</small>
                  </dd>
                </div>
              )}
            </dl>
            <div className="position-actions">
              {state === "OPEN" ? (
                <Link
                  href={`/trade?series=${encodeURIComponent(s.config.series_id)}&claim=${claim}&side=SELL&qty=${quantity / 1000000000000000000000000n}.${String(quantity % 1000000000000000000000000n).padStart(24, "0")}`}
                >
                  Sell, request quote
                </Link>
              ) : (
                <span>Sell, closed</span>
              )}
              <button
                disabled={
                  s.final_price !== null || matched === 0n || d.busy || !d.ready
                }
                title={
                  matched === 0n
                    ? "Requires matching upside and capped-value units"
                    : s.final_price !== null
                      ? "Claim each side after finalization"
                      : "Combine matching units"
                }
                onClick={() =>
                  void d
                    .review({
                      method: "merge",
                      args: {
                        series_id: s.config.series_id,
                        amount: String(matched),
                      },
                    })
                    .catch((e) => d.setError(message(e)))
                }
              >
                Merge pairs
              </button>
              <button
                disabled={s.final_price === null || d.busy || !d.ready}
                title={
                  s.final_price === null
                    ? "Available after finalization"
                    : "Review the fixed payout"
                }
                onClick={() =>
                  void d
                    .review({
                      method: "redeem",
                      args: {
                        series_id: s.config.series_id,
                        amount: String(quantity),
                        leg: claim,
                      },
                    })
                    .catch((e) => d.setError(message(e)))
                }
              >
                Claim
              </button>
            </div>
            <LockedPayout series={s} quantity={quantity} claim={claim} />
          </article>
        );
      })}
    </div>
  );
}
