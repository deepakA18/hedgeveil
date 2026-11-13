"use client";
import { useState } from "react";
import { useDesk } from "./DeskProvider";
import { Countdown, StateBadge, Num } from "./TerminalPrimitives";
import {
  freshSpot,
  usdText,
  Q,
  scenarioPayout,
  quoteEconomics,
} from "../../lib/market-display";
import {
  percent,
  lifecycle,
  oracleCase,
  missedSampleSlots,
} from "../../lib/terminal-data";
import type { Series, Claim, Offer } from "../../lib/desk-types";
export function SeriesList({
  series,
  selected,
  choose,
  now,
  expert,
  onExpertChange,
  claim,
  offers,
  side,
}: {
  series: Series[];
  selected: string;
  choose: (id: string) => void;
  now: number;
  expert: boolean;
  onExpertChange: (value: boolean) => void;
  claim: Claim;
  offers: Offer[];
  side: string;
}) {
  const d = useDesk(),
    [history, setHistory] = useState(false),
    open = series.filter((s) => lifecycle(s, now) === "OPEN");
  const showHistory = history || !open.length,
    rows = (
      showHistory ? series.filter((s) => lifecycle(s, now) !== "OPEN") : open
    ).toSorted((a, b) =>
      BigInt(a.config.maturity_ns) === BigInt(b.config.maturity_ns)
        ? Number(BigInt(a.config.strike) - BigInt(b.config.strike))
        : Number(BigInt(a.config.maturity_ns) - BigInt(b.config.maturity_ns)),
    );
  const dates = [...new Set(rows.map((s) => s.config.maturity_ns))];
  return (
    <aside
      className="series-rail workspace-panel"
      data-panel="markets"
      aria-label="Series list"
    >
      <div className="region-heading">
        <h2>NEAR markets</h2>
      </div>
      <div className="market-list-options">
        <div className="desk-tabs series-tabs">
          <button aria-pressed={!history} onClick={() => setHistory(false)}>
            Open now <span className="num">({open.length})</span>
          </button>
          <button aria-pressed={history} onClick={() => setHistory(true)}>
            History
          </button>
        </div>
        <label className="expert-toggle">
          <input
            type="checkbox"
            checked={expert}
            onChange={(e) => onExpertChange(e.target.checked)}
          />
          More detail
        </label>
      </div>
      {!open.length && !history && (
        <p className="rail-note">No open series. Showing history.</p>
      )}
      <div className="series-groups">
        {dates.map((date) => (
          <section key={date}>
            <h3>
              {new Date(Number(BigInt(date) / 1000000n)).toLocaleDateString(
                undefined,
                { month: "short", day: "numeric", year: "numeric" },
              )}
              <small>
                {new Date(Number(BigInt(date) / 1000000n)).toLocaleTimeString(
                  undefined,
                  { hour: "2-digit", minute: "2-digit" },
                )}
              </small>
            </h3>
            {rows
              .filter((s) => s.config.maturity_ns === date)
              .map((s) => {
                const spot = freshSpot(d.spot, now)
                    ? BigInt(d.spot.price)
                    : null,
                  evidence = oracleCase(d.state, s),
                  state = lifecycle(s, now, evidence),
                  missed = missedSampleSlots(s, evidence, now);
                const quotes =
                  s.config.series_id === selected
                    ? offers.flatMap((o) =>
                        o.quote &&
                        BigInt(o.quote.expiry_ns) > BigInt(now) * 1000000n
                          ? [o.quote]
                          : [],
                      )
                    : [];
                const economics = quotes
                  .map((q) =>
                    quoteEconomics(q, s.config.series_id, claim, side),
                  )
                  .filter((e) => e !== null)
                  .sort((a, b) => {
                    const diff = a.total * b.quantity - b.total * a.quantity;
                    return diff === 0n
                      ? 0
                      : diff < 0n
                        ? side === "BUY"
                          ? -1
                          : 1
                        : side === "BUY"
                          ? 1
                          : -1;
                  });
                const best = economics[0];
                return (
                  <button
                    type="button"
                    className="series-row"
                    data-series={s.config.series_id}
                    key={s.config.series_id}
                    aria-pressed={s.config.series_id === selected}
                    onClick={() => choose(s.config.series_id)}
                  >
                    <span className="series-row-top">
                      <strong>{usdText(BigInt(s.config.strike))}</strong>
                      <StateBadge state={state} />
                    </span>
                    <span className="series-row-meta">
                      <span>
                        {s.final_price !== null
                          ? percent(
                              BigInt(s.config.strike),
                              BigInt(s.final_price),
                            ) + " of final price"
                          : state === "OPEN"
                            ? spot
                              ? percent(BigInt(s.config.strike), spot) +
                                " of spot"
                              : "Spot unavailable"
                            : state === "RESOLUTION_DELAYED"
                              ? null
                              : "Final price pending"}
                      </span>
                      <span>
                        {state === "OPEN" ? (
                          <Countdown targetNs={date} />
                        ) : (
                          <>
                            Ended <Countdown targetNs={date} elapsed /> ago
                          </>
                        )}
                      </span>
                    </span>
                    {state === "OPEN" && (
                      <span className="series-quote-line">
                        <span>
                          {side === "BUY" ? "Ask" : "Bid"},{" "}
                          {claim === "N" ? "Upside" : "Capped"}
                        </span>
                        <span>
                          {state !== "OPEN" ? (
                            "Closed"
                          ) : best ? (
                            <Num value={(best.total * Q) / best.quantity} />
                          ) : s.config.series_id === selected &&
                            offers.length ? (
                            offers.every(
                              (o) => o.reason === "MAKER_UNAVAILABLE",
                            ) ? (
                              "Maker down"
                            ) : (
                              "No quote"
                            )
                          ) : (
                            "Request quote"
                          )}
                        </span>
                      </span>
                    )}
                    {state === "RESOLUTION_DELAYED" && (
                      <span className="series-blocker">
                        {missed.length === 3
                          ? "Window elapsed without reports"
                          : missed.length
                            ? "Missing sample" +
                              (missed.length > 1 ? "s " : " ") +
                              missed.join(", ")
                            : "Settlement evidence unavailable"}
                      </span>
                    )}
                    {best && state === "OPEN" && (
                      <span className="series-quote-line">
                        <span>Signed size</span>
                        <Num value={best.quantity} unit="units" />
                      </span>
                    )}
                    {expert && (
                      <span className="series-expert">
                        <span>
                          {s.final_price !== null
                            ? "Final P / N"
                            : "Intrinsic P / N"}{" "}
                          <span className="num">
                            {s.final_price !== null ? (
                              <>
                                <Num value={s.p_coefficient} unit="" /> /{" "}
                                <Num value={s.n_coefficient} unit="" />
                              </>
                            ) : state === "OPEN" && spot ? (
                              <>
                                <Num
                                  value={scenarioPayout(
                                    Q,
                                    BigInt(s.config.strike),
                                    spot,
                                    "P",
                                  )}
                                  unit=""
                                />{" "}
                                /{" "}
                                <Num
                                  value={scenarioPayout(
                                    Q,
                                    BigInt(s.config.strike),
                                    spot,
                                    "N",
                                  )}
                                  unit=""
                                />
                              </>
                            ) : (
                              "—"
                            )}
                          </span>
                        </span>
                        <span>
                          Outstanding P <Num value={s.outstanding_p} unit="" />
                        </span>
                        <span>
                          Outstanding N <Num value={s.outstanding_n} unit="" />
                        </span>
                        <span>
                          NEAR backing <Num value={s.reserve} precision={6} />
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
          </section>
        ))}
      </div>
      {!rows.length && <p className="rail-note">Market data unavailable.</p>}
    </aside>
  );
}
