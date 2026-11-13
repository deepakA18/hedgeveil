"use client";
import { useState, useEffect } from "react";
import type { MarketMarks } from "../../lib/marks-server";
import type { Series, Claim } from "../../lib/desk-types";
import { amountDisplay } from "../../lib/amount-display";
import { usdText, isOpen } from "../../lib/market-display";
import { dateLabel } from "../../lib/desk-api";
export function useMarketMarks() {
  const [marks, setMarks] = useState<MarketMarks | null>(null);
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function poll() {
      if (document.visibilityState !== "hidden") {
        try {
          const r = await fetch("/api/marks", {
            cache: "no-store",
            signal: abort.signal,
          });
          if (!r.ok) throw Error();
          const body = await r.json();
          if (active) setMarks(body);
        } catch {
          if (active) setMarks(null);
        }
      }
      if (active) timer = setTimeout(poll, 15000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, []);
  return marks;
}
export function usableMark(
  marks: MarketMarks | null,
  series: Series | undefined,
  claim: Claim,
  now: number,
  contract?: string,
) {
  if (!marks || !series || marks.contract !== contract) return null;
  const row = marks.items.find((x) => x.seriesId === series.config.series_id);
  if (!row || row.kind === "UNAVAILABLE") return null;
  if (row.kind === "SETTLED" && series.final_price === null) return null;
  if (
    row.kind === "MODEL" &&
    (!isOpen(series, now) ||
      !marks.observedAt ||
      Date.parse(marks.observedAt) > now ||
      now - Date.parse(marks.observedAt) > 60000 ||
      now - Date.parse(marks.fetchedAt) > 60000)
  )
    return null;
  return { value: BigInt(claim === "P" ? row.p! : row.n!), kind: row.kind };
}
export function MarketGrid({
  series,
  selected,
  choose,
  marks,
  now,
  contract,
}: {
  series: Series[];
  selected: string;
  choose: (id: string) => void;
  marks: MarketMarks | null;
  now: number;
  contract?: string;
}) {
  const open = series.filter((s) => isOpen(s, now));
  const rows = (open.length ? open : series).toSorted((a, b) =>
    a.config.maturity_ns === b.config.maturity_ns
      ? Number(BigInt(a.config.strike) - BigInt(b.config.strike))
      : Number(BigInt(a.config.maturity_ns) - BigInt(b.config.maturity_ns)),
  );
  return (
    <section
      className="market-grid"
      aria-label={open.length ? "Open markets" : "Settlement history"}
    >
      <div className="market-grid-heading">
        <h2>{open.length ? "Market marks" : "Settlement history"}</h2>
        <span>
          {open.length
            ? `${open.length} open, indicative, not offers`
            : `${rows.length} registered, no open markets`}
        </span>
      </div>
      <div className="market-grid-scroll">
        <table>
          <thead>
            <tr>
              <th>Ends</th>
              <th>Set price</th>
              <th>Capped / unit</th>
              <th>Upside / unit</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const p = usableMark(marks, s, "P", now, contract),
                n = usableMark(marks, s, "N", now, contract);
              return (
                <tr
                  key={s.config.series_id}
                  aria-selected={selected === s.config.series_id}
                >
                  <td title={dateLabel(s.config.maturity_ns)}>
                    {now
                      ? new Date(
                          Number(BigInt(s.config.maturity_ns) / 1000000n),
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>
                  <td>
                    <button
                      className="market-price"
                      aria-label={`Inspect ${s.config.series_id}, set price ${usdText(BigInt(s.config.strike))}`}
                      onClick={() => choose(s.config.series_id)}
                    >
                      {usdText(BigInt(s.config.strike))}
                    </button>
                  </td>
                  <td>{p ? amountDisplay(p.value.toString()).text : "—"}</td>
                  <td>{n ? amountDisplay(n.value.toString()).text : "—"}</td>
                  <td>
                    {s.final_price !== null
                      ? usdText(BigInt(s.final_price))
                      : p
                        ? "Model"
                        : BigInt(s.config.maturity_ns) <= BigInt(now) * 1000000n
                          ? "Pending"
                          : "Unavailable"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="market-grid-unit">
        {open.length ? "Model marks" : "Final payouts"} in NEAR per unit.{" "}
        {marks?.height ? `Block ${marks.height.toLocaleString()}` : ""}
      </p>
    </section>
  );
}
