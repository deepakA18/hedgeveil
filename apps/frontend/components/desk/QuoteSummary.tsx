"use client";
import { InfoPopover } from "./InfoPopover";
import { useDesk } from "./DeskProvider";
import { useNow } from "./Elements";
import { nearBreakEven, percent } from "../../lib/terminal-data";
import { Q } from "../../lib/market-display";
import { formatNear } from "../../lib/desk-api";
import {
  buyMetrics,
  freshSpot,
  usdText,
  usdValue,
  quoteEconomics,
} from "../../lib/market-display";
import type { Quote, Series, Claim } from "../../lib/desk-types";
export function QuoteSummary({
  quote,
  series,
  claim,
  side,
  unit = "USD",
}: {
  quote: Quote;
  series: Series;
  claim: Claim;
  side: string;
  unit?: "USD" | "NEAR";
}) {
  const d = useDesk(),
    now = useNow(),
    e = quoteEconomics(quote, series.config.series_id, claim, side);
  if (!e) return <p>See the exact assets and fees in the signed terms.</p>;
  const spot = freshSpot(d.spot, now) ? BigInt(d.spot.price) : null,
    k = BigInt(series.config.strike);
  const costUsd = spot === null ? null : usdValue(e.total, spot);
  const metrics =
    spot === null || side !== "BUY"
      ? null
      : buyMetrics(e.quantity, e.gross, e.fee, k, spot, claim);
  const breakEven =
      unit === "NEAR"
        ? nearBreakEven(e.quantity, e.total, k, claim)
        : (metrics?.breakEven ?? null),
    premium = metrics?.premium ?? null;
  return (
    <>
      <dl className="quote-metrics">
        <div>
          <dt>
            {side === "BUY"
              ? "You pay"
              : e.total < 0n
                ? "Net cost to sell"
                : "You receive after fee"}
          </dt>
          <dd>
            {formatNear((e.total < 0n ? -e.total : e.total).toString())} NEAR
            {costUsd !== null && (
              <small>
                ≈ {usdText(costUsd < 0n ? -costUsd : costUsd)} at current spot
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Price per unit</dt>
          <dd>
            {formatNear(((e.total * Q) / e.quantity).toString())} NEAR
            <small>
              {percent(e.total, e.quantity)} of backing, fee included
            </small>
          </dd>
        </div>
        {side === "BUY" && (
          <>
            <div>
              <dt className="label-with-help">
                Maximum loss{" "}
                <InfoPopover label="Maximum loss">
                  For this purchase, you can lose the full cost including the
                  quoted fee, plus wallet gas. There are no margin top-ups for
                  holding this purchased position.
                </InfoPopover>
              </dt>
              <dd>{formatNear(e.total.toString())} NEAR + gas</dd>
            </div>
            <div>
              <dt className="label-with-help">
                Price to break even{" "}
                <InfoPopover label="Break-even">
                  The final reference price where payout covers this offer’s
                  cost on the selected USD or NEAR basis. Gas is excluded. USD
                  cost uses fresh spot at review; it is not a guaranteed
                  conversion rate.
                </InfoPopover>
              </dt>
              <dd>
                {spot === null && unit === "USD"
                  ? "Spot unavailable"
                  : breakEven === null
                    ? "Not reachable at this cost"
                    : "≈ " + usdText(breakEven)}
                <small>{unit} basis, gas excluded</small>
              </dd>
            </div>
            <div>
              <dt>Move from spot</dt>
              <dd>
                {spot !== null && breakEven !== null
                  ? percent(breakEven - spot, spot, true)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Payout limit</dt>
              <dd>
                {formatNear(e.quantity.toString())} NEAR
                {claim === "N" ? " (limit)" : ""}
              </dd>
            </div>
          </>
        )}
      </dl>
      {side === "BUY" ? (
        <details className="desk-details">
          <summary>Payout limits and pricing</summary>
          <dl className="quote-metrics">
            <div>
              <dt>Payout limit</dt>
              <dd>
                {claim === "P"
                  ? `${usdText(usdValue(e.quantity, k))} at the reference price`
                  : "No fixed USD cap"}
                <small>
                  Up to {formatNear(e.quantity.toString())} NEAR
                  {claim === "N" ? " (approached as price rises)" : ""}
                </small>
              </dd>
            </div>
            <div>
              <dt>Price over current intrinsic</dt>
              <dd>
                {premium === null
                  ? "Spot unavailable"
                  : (premium < 0n ? "-" : "") +
                    formatNear((premium < 0n ? -premium : premium).toString()) +
                    " NEAR"}
                <small>Before fee; not a fair-value estimate</small>
              </dd>
            </div>
          </dl>
          <p className="desk-muted">
            Payouts settle in NEAR. USD values use the final reference; they are
            not guaranteed conversion proceeds. Rounding may change the exact
            breakeven.
          </p>
        </details>
      ) : (
        <p className="desk-muted">
          Proceeds are not profit: your original purchase cost is not included.
        </p>
      )}
    </>
  );
}
