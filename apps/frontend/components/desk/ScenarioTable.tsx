"use client";
import { useDesk } from "./DeskProvider";
import { useNow } from "./Elements";
import { Num } from "./TerminalPrimitives";
import { parseNear } from "../../lib/desk-api";
import { freshSpot, usdText } from "../../lib/market-display";
import { scenarioRows } from "../../lib/terminal-data";
import type { Series, Claim } from "../../lib/desk-types";
export function ScenarioTable({
  series,
  claim,
  quantity,
  cost,
}: {
  series: Series;
  claim: Claim;
  quantity: string;
  cost?: bigint;
}) {
  const d = useDesk(),
    now = useNow();
  let amount: bigint;
  try {
    amount = BigInt(parseNear(quantity));
  } catch {
    return null;
  }
  const rows = freshSpot(d.spot, now)
    ? scenarioRows(
        amount,
        BigInt(series.config.strike),
        BigInt(d.spot.price),
        claim,
        cost,
      )
    : [];
  return (
    <section className="scenario-table" aria-label="Five price scenarios">
      <div className="region-heading">
        <h2>Price scenarios</h2>
        <small>At the final reference, fee included if quoted</small>
      </div>
      <table>
        <thead>
          <tr>
            <th>NEAR price</th>
            <th>Payout NEAR</th>
            <th>Value USD</th>
            <th>P&amp;L USD</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={String(r.pct)}>
                <td>
                  {usdText(r.x)}
                  <small>
                    {r.pct === 100n ? "Spot" : String(r.pct) + "% of spot"}
                  </small>
                </td>
                <td>
                  <Num value={r.payout} unit="" />
                </td>
                <td>{usdText(r.usd)}</td>
                <td>{r.pnlUsd === null ? "—" : usdText(r.pnlUsd)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>Fresh spot unavailable. Scenarios are hidden.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="source-line">
        USD values assume the reference price at payout. Later conversion can
        differ. Gas excluded.
      </p>
    </section>
  );
}
