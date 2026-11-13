"use client";
import { InfoPopover } from "./InfoPopover";
import { useDesk } from "./DeskProvider";
import { Num } from "./TerminalPrimitives";
import { message } from "../../lib/desk-api";
import type { Series } from "../../lib/desk-types";
export function SeriesPositionContext({
  series,
  beforeReview,
  primary = false,
}: {
  series: Series;
  beforeReview: () => void;
  primary?: boolean;
}) {
  const d = useDesk(),
    balance = d.live?.accounts[d.account];
  const known = !!d.account && !!balance;
  const missing = d.account ? "Account data unavailable" : "Connect wallet";
  const position = balance?.positions[series.slot];
  const p = known ? BigInt(position?.p ?? "0") : null,
    n = known ? BigInt(position?.n ?? "0") : null;
  const matched = p === null || n === null ? null : p < n ? p : n;
  const reason =
    series.final_price !== null
      ? "Finalized, claim each side"
      : !d.account
        ? "Connect wallet to see matching pairs"
        : !d.ready || matched === null
          ? "Refresh account data"
          : matched === 0n
            ? "Matching P and N required"
            : d.busy
              ? "Finish the current wallet action"
              : null;
  return (
    <section
      className={"series-position-context" + (primary ? " primary-exit" : "")}
      aria-label="Selected series holdings"
    >
      <h3>{primary ? "Exit with matching pairs" : "Your position"}</h3>
      <dl className="quote-metrics">
        <div>
          <dt>Capped value (P)</dt>
          <dd>{known ? <Num value={p} unit="units" /> : missing}</dd>
        </div>
        <div>
          <dt>Upside (N)</dt>
          <dd>{known ? <Num value={n} unit="units" /> : missing}</dd>
        </div>
        <div>
          <dt className="label-with-help">
            Matched pairs{" "}
            <InfoPopover label="Matched pairs">
              Equal quantities of capped value (P) and upside (N) from the same
              market. Before finalization, merging one pair returns 1 NEAR to
              your trading balance without a price report. A single side cannot
              be merged alone.
            </InfoPopover>
          </dt>
          <dd>{known ? <Num value={matched} unit="pairs" /> : missing}</dd>
        </div>
      </dl>
      {series.final_price === null && (
        <>
          <button
            className={"desk-button" + (primary ? " lime" : "")}
            disabled={d.account ? !!reason : !d.session || d.busy}
            title={reason ?? "Review merging all matching pairs"}
            onClick={() => {
              if (!d.account) {
                beforeReview();
                d.connect();
                return;
              }
              if (reason || matched === null || matched <= 0n) return;
              beforeReview();
              void d
                .review({
                  method: "merge",
                  args: {
                    series_id: series.config.series_id,
                    amount: String(matched),
                  },
                })
                .catch((e) => d.setError(message(e)));
            }}
          >
            {!d.account ? "Connect wallet to merge" : "Review merge"}
          </button>
          {reason && (
            <p className="source-line" role="status">
              {reason}
            </p>
          )}
        </>
      )}
    </section>
  );
}
