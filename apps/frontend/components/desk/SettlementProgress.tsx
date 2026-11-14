"use client";
import { useDesk } from "./DeskProvider";
import { useNow } from "./Elements";
import { Countdown } from "./TerminalPrimitives";
import { InfoPopover } from "./InfoPopover";
import { settlementProgress } from "../../lib/settlement-progress";
import type { Series } from "../../lib/desk-types";

export function SettlementProgress({
  series,
  compact = false,
}: {
  series: Series;
  compact?: boolean;
}) {
  const d = useDesk(),
    now = useNow();
  if (
    !now ||
    series.config.oracle_version !== "native-trade-twap-v1" ||
    BigInt(series.config.maturity_ns) > BigInt(now) * 1000000n ||
    (compact && series.final_price !== null)
  )
    return null;
  const p = settlementProgress(d.state, series, now);
  const count =
    p.attempt !== null
      ? `Attempt ${p.attempt}${p.cap ? ` of ${p.cap}` : ""}`
      : null;
  if (compact)
    return (
      <span className="series-blocker">
        {count ? `${count}: ` : ""}
        {p.label}
        {p.nextNs && (
          <>
            {" "}
            in <Countdown targetNs={p.nextNs} />
          </>
        )}
      </span>
    );
  return (
    <div className="settlement-progress">
      <span>
        {count ?? "Attempt count unavailable"}
        {series.final_price === null && <>. {p.label}</>}
      </span>
      {series.final_price === null && (
        <span>
          Expired <Countdown targetNs={series.config.maturity_ns} elapsed /> ago
        </span>
      )}
      {p.nextNs && (
        <span>
          Next eligible attempt in <Countdown targetNs={p.nextNs} />. Completion
          time is not guaranteed.
        </span>
      )}
      {p.stopped && (
        <span>
          No automatic attempt is scheduled. Settlement can remain delayed;
          matching P and N can be merged from Your position.
        </span>
      )}
      <span>
        {p.attempts.length} recorded deliveries{" "}
        <InfoPopover label="Settlement delivery history">
          Times run from the source request to the resolver callback, not
          executor pickup. Pickup timestamps are unavailable. These observations
          do not establish a delivery SLA.
          {p.attempts.map((a) => (
            <span className="delivery-history-row" key={a.hash}>
              Request {a.request_id}:{" "}
              {a.outcome === "ACCEPTED"
                ? "Accepted"
                : a.outcome === "STALE_TRADE"
                  ? "Historical data rejected (STALE_TRADE)"
                  : a.outcome === "YIELD_TIMEOUT"
                    ? "Delivery timed out"
                    : "Evidence rejected"}
              , {(BigInt(a.delivery_ns) / 1000000n).toString()} ms.
            </span>
          ))}
        </InfoPopover>
      </span>
    </div>
  );
}
