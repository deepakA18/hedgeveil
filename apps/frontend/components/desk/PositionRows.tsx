"use client";
import Link from "next/link";
import { useDesk } from "./DeskProvider";
import { useNow, WalletGate } from "./Elements";
import { Countdown, Num, StateBadge } from "./TerminalPrimitives";
import { LockedPayout } from "./SettlementPanel";
import {
  fixedPayout,
  intrinsicDelta,
  lifecycle,
  oracleCase,
  expiryCase,
} from "../../lib/terminal-data";
import {
  freshSpot,
  scenarioPayout,
  usdText,
  usdValue,
} from "../../lib/market-display";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../ui/table";
import { exactUsd } from "../../lib/terminal-data";
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
      <Table className="positions-table" aria-label="Your positions">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Position</TableHead>
            <TableHead scope="col">Expiry</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col" className="position-number">
              Units
            </TableHead>
            <TableHead scope="col" className="position-number">
              Payout
            </TableHead>
            <TableHead scope="col" className="position-number">
              Matched pairs
            </TableHead>
            {expert && (
              <TableHead scope="col" className="position-number">
                NEAR exposure
              </TableHead>
            )}
            <TableHead scope="col" className="position-action-head">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ s, claim, quantity }) => {
            const spot = freshSpot(d.spot, now) ? BigInt(d.spot.price) : null,
              state = lifecycle(
                s,
                now,
                expiryCase(d.state, s) ?? oracleCase(d.state, s),
              ),
              fixed = fixedPayout(s, quantity, claim),
              projected =
                fixed ??
                (spot === null
                  ? null
                  : scenarioPayout(
                      quantity,
                      BigInt(s.config.strike),
                      spot,
                      claim,
                    ));
            const p = BigInt(balance?.positions[s.slot]?.p ?? "0"),
              n = BigInt(balance?.positions[s.slot]?.n ?? "0"),
              matched = p < n ? p : n;
            return (
              <TableRow key={s.config.series_id + claim}>
                <TableCell>
                  <Link
                    className="position-market"
                    href={`/trade?series=${encodeURIComponent(s.config.series_id)}&claim=${claim}`}
                  >
                    <strong>{claim === "N" ? "Upside" : "Capped value"}</strong>
                    <small className="num">
                      NEAR {exactUsd(s.config.strike)}
                    </small>
                  </Link>
                </TableCell>
                <TableCell>
                  <time
                    dateTime={new Date(
                      Number(BigInt(s.config.maturity_ns) / 1000000n),
                    ).toISOString()}
                    title={new Date(
                      Number(BigInt(s.config.maturity_ns) / 1000000n),
                    ).toUTCString()}
                  >
                    {now
                      ? new Date(
                          Number(BigInt(s.config.maturity_ns) / 1000000n),
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </time>
                  <small>
                    {now &&
                    BigInt(s.config.maturity_ns) <= BigInt(now) * 1000000n
                      ? "Ended "
                      : "In "}
                    <Countdown
                      targetNs={s.config.maturity_ns}
                      elapsed={
                        !!now &&
                        BigInt(s.config.maturity_ns) <= BigInt(now) * 1000000n
                      }
                    />
                    {now &&
                    BigInt(s.config.maturity_ns) <= BigInt(now) * 1000000n
                      ? " ago"
                      : ""}
                  </small>
                </TableCell>
                <TableCell>
                  <StateBadge state={state} />
                </TableCell>
                <TableCell className="position-number">
                  <Num value={quantity} unit="" />
                </TableCell>
                <TableCell className="position-number">
                  <Num value={projected} precision={6} />
                  {projected !== null && spot !== null && (
                    <small className="num">
                      ≈ {usdText(usdValue(projected, spot))}
                    </small>
                  )}
                  <small>
                    {fixed === null
                      ? "At current spot, estimate"
                      : "Final payout"}
                  </small>
                  {now &&
                    BigInt(s.config.maturity_ns) <= BigInt(now) * 1000000n && (
                      <details className="position-evidence">
                        <summary>Settlement details</summary>
                        <LockedPayout
                          series={s}
                          quantity={quantity}
                          claim={claim}
                        />
                      </details>
                    )}
                </TableCell>
                <TableCell className="position-number">
                  <Num value={matched} unit="" />
                </TableCell>
                {expert && (
                  <TableCell className="position-number">
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
                    <small>Payoff slope</small>
                  </TableCell>
                )}
                <TableCell>
                  <div className="position-actions">
                    {state === "OPEN" ? (
                      <Link
                        href={`/trade?series=${encodeURIComponent(s.config.series_id)}&claim=${claim}&side=SELL&qty=${quantity / 1000000000000000000000000n}.${String(quantity % 1000000000000000000000000n).padStart(24, "0")}`}
                      >
                        Sell
                      </Link>
                    ) : (
                      <button disabled title="Market closed to selling">
                        Sell
                      </button>
                    )}
                    <button
                      disabled={
                        s.final_price !== null ||
                        matched === 0n ||
                        d.busy ||
                        !d.ready
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
