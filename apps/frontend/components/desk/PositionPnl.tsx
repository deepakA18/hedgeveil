"use client";
import { useEffect, useRef, useState } from "react";
import { useDesk } from "./DeskProvider";
import { useNow } from "./Elements";
import { Num, Countdown } from "./TerminalPrimitives";
import { api } from "../../lib/desk-api";
import { positionBasis, pnlPercent } from "../../lib/position-pnl";
import { bestReviewOffer } from "../../lib/trade-review";
import { quoteEconomics } from "../../lib/market-display";
import type { Claim, Offer, Series } from "../../lib/desk-types";

export function PositionPnl({
  series,
  claim,
  quantity,
  fixed,
  open,
}: {
  series: Series;
  claim: Claim;
  quantity: bigint;
  fixed: bigint | null;
  open: boolean;
}) {
  const d = useDesk(),
    now = useNow();
  const basis = positionBasis(
    d.records,
    d.account,
    d.session?.contract_id ?? "",
    d.session?.network ?? "",
    series.config.series_id,
    claim,
    quantity,
  );
  const identity = JSON.stringify([
    d.account,
    d.session?.contract_id,
    series.config.series_id,
    claim,
    String(quantity),
    d.records,
  ]);
  const current = useRef(identity);
  current.current = identity;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [result, setResult] = useState<{
    identity: string;
    net: bigint;
    expiry: string;
  } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    identity: string;
    text: string;
  } | null>(null);
  const valid =
    result?.identity === identity &&
    now > 0 &&
    BigInt(result.expiry) > BigInt(now) * 1000000n;
  const net = fixed ?? (open && valid ? result!.net : null);
  const pnl = net !== null && basis.cost !== null ? net - basis.cost : null;
  const percent =
    pnl !== null && basis.cost !== null ? pnlPercent(pnl, basis.cost) : null;
  async function check() {
    if (pending === identity) return;
    setPending(identity);
    setFailure(null);
    setResult(null);
    const start = performance.now();
    try {
      const request = {
        mode: "SELL",
        asset: { kind: claim, series_id: series.config.series_id },
        amount: String(quantity),
        taker: d.account,
      };
      const response = await api<{ items: Offer[] }>("quotes", request);
      if (!mounted.current || current.current !== identity) return;
      const index = bestReviewOffer(
        response.items,
        request,
        now + performance.now() - start,
      );
      if (index < 0) {
        const busy = response.items.some((x) =>
          ["MAKER_BUSY", "MAKER_MAINTENANCE", "MAKER_UNAVAILABLE"].includes(
            x.reason ?? "",
          ),
        );
        setFailure({
          identity,
          text: busy ? "Makers unavailable" : "No sell offer",
        });
        return;
      }
      const quote = response.items[index].quote!;
      const economics = quoteEconomics(
        quote,
        series.config.series_id,
        claim,
        "SELL",
      )!;
      setResult({ identity, net: economics.total, expiry: quote.expiry_ns });
    } catch (error) {
      if (mounted.current && current.current === identity)
        setFailure({
          identity,
          text:
            error instanceof Error &&
            ["AUTH_REQUIRED", "AUTH_INVALID", "OWNER_MISMATCH"].includes(
              error.message,
            )
              ? "Verify wallet to check"
              : "Offer check unavailable",
        });
    } finally {
      if (mounted.current) setPending((p) => (p === identity ? null : p));
    }
  }
  return (
    <div className="position-pnl" aria-live="polite">
      {pnl === null ? (
        <span className="num">—</span>
      ) : (
        <span className={pnl < 0n ? "desk-danger" : "state-good"}>
          {pnl < 0n ? "−" : pnl > 0n ? "+" : ""}
          <Num value={pnl < 0n ? -pnl : pnl} precision={6} />
          {percent && <small className="num">{percent}</small>}
        </span>
      )}
      <small>
        {basis.cost === null ? (
          basis.reason
        ) : fixed !== null ? (
          "Settlement P&L"
        ) : valid ? (
          <>
            Sell estimate, <Countdown targetNs={result!.expiry} />
          </>
        ) : !open ? (
          "Awaiting settlement"
        ) : failure?.identity === identity ? (
          failure.text
        ) : result?.identity === identity ? (
          "Offer expired"
        ) : (
          "Fresh sell offer needed"
        )}
      </small>
      {basis.cost !== null && fixed === null && open && (
        <button
          type="button"
          className="text-button"
          disabled={!d.ready || !now || pending === identity}
          onClick={() => void check()}
        >
          {pending === identity ? (
            <>
              <span className="desk-spinner" aria-hidden="true" /> Checking…
            </>
          ) : valid ? (
            "Refresh P&L"
          ) : (
            "Check P&L"
          )}
        </button>
      )}
    </div>
  );
}
