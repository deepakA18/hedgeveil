"use client";
import type { Series, Claim } from "../../lib/desk-types";
import {
  Q,
  freshSpot,
  usdText,
  usdValue,
  buyMetrics,
} from "../../lib/market-display";
import { amountDisplay } from "../../lib/amount-display";
import { parseNear } from "../../lib/desk-api";
import { useDesk } from "./DeskProvider";
export function IndicativeSummary({
  series,
  claim,
  quantity,
  mark,
  now,
}: {
  series: Series;
  claim: Claim;
  quantity: string;
  mark: { value: bigint; kind: string } | null;
  now: number;
}) {
  const { spot } = useDesk();
  let amount: bigint | null = null;
  try {
    amount = BigInt(parseNear(quantity));
    if (amount <= 0n) amount = null;
  } catch {}
  const settled = series.final_price !== null,
    k = BigInt(series.config.strike),
    live = freshSpot(spot, now) ? BigInt(spot.price) : null;
  const total = amount === null || !mark ? null : (amount * mark.value) / Q;
  const metrics =
    total !== null && amount !== null && live !== null && !settled
      ? buyMetrics(amount, total, 0n, k, live, claim)
      : null;
  const native = (v: bigint | null) =>
    v === null ? "—" : amountDisplay(v.toString()).text + " NEAR";
  return (
    <div className="indicative-summary">
      <div className="summary-label">
        {settled
          ? "Final settlement"
          : mark
            ? "Model estimate, not an offer"
            : "Model unavailable"}
      </div>
      <dl className="quote-metrics">
        <div>
          <dt>{settled ? "Reference price" : "Model / unit"}</dt>
          <dd>
            {settled
              ? usdText(BigInt(series.final_price!))
              : native(mark?.value ?? null)}
          </dd>
        </div>
        <div>
          <dt>{settled ? "Payout for quantity" : "Estimated cost"}</dt>
          <dd>{native(total)}</dd>
        </div>
        <div>
          <dt>{settled ? "Value at reference" : "Estimated purchase loss"}</dt>
          <dd>
            {settled && total !== null
              ? usdText(usdValue(total, BigInt(series.final_price!)))
              : native(total)}
          </dd>
        </div>
        {!settled && (
          <div>
            <dt>USD breakeven estimate</dt>
            <dd>
              {metrics
                ? metrics.breakEven === null
                  ? "Not reachable"
                  : usdText(metrics.breakEven)
                : "—"}
            </dd>
          </div>
        )}
      </dl>
      {!settled && (
        <span className="mark-caveat">Excludes spread, fees and gas.</span>
      )}
    </div>
  );
}
