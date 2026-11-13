"use client";
import Link from "next/link";
import {
  marketName,
  relativeEnd,
  distanceFromSpot,
} from "../../lib/market-display";
import { useState } from "react";
import { useDesk } from "./DeskProvider";
import { Heading, Empty, useNow, seriesStatus } from "./Elements";
import { dateLabel, dollars } from "../../lib/desk-api";
export function Markets() {
  const d = useDesk(),
    now = useNow(),
    [filter, setFilter] = useState("open");
  const open = d.series.filter((s) => seriesStatus(s, now) === "Open");
  const series =
    filter === "open"
      ? open
      : d.series.filter((s) => seriesStatus(s, now) !== "Open");
  return (
    <>
      <Heading
        title="Markets"
        copy="Choose an end date and a price level. Review an offer before you commit."
      />
      <div className="market-intro">
        <div>
          <span className="desk-label">The underlying</span>
          <h2>
            NEAR <span>/ USD</span>
          </h2>
          <p>Payouts in NEAR. Fully backed positions.</p>
        </div>
        <div>
          <span>Open series</span>
          <strong>{d.state || d.live ? open.length : "—"}</strong>
        </div>
        <div>
          <span>Price discovery</span>
          <strong>On request</strong>
        </div>
      </div>
      <section className="desk-panel">
        <div className="panel-top">
          <h2>Explore markets</h2>
          <div className="desk-tabs" aria-label="Filter series">
            {["open", "history"].map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === "history" ? "History" : "Open now"}
              </button>
            ))}
          </div>
        </div>
        <p className="desk-muted">
          Upside pays above the set price. Capped value follows NEAR up to that
          level. This is a funded quote market; prices appear when you request
          an offer.
        </p>
        {d.loading && !d.series.length ? (
          <div className="desk-skeleton" role="status">
            Loading registered markets…
          </div>
        ) : !series.length ? (
          <Empty
            title={
              d.state
                ? filter === "open"
                  ? "No open markets right now."
                  : "No past markets to show."
                : "Market data is unavailable."
            }
          >
            <p>
              {d.state
                ? "You can view past markets in History. A new trade needs an open series and an available offer."
                : "Refresh when the backend is available. No substitute prices are displayed."}
            </p>
          </Empty>
        ) : (
          <div
            className="desk-table-wrap"
            role="region"
            aria-label="Registered markets"
            tabIndex={0}
          >
            <table className="desk-table">
              <thead>
                <tr>
                  <th scope="col">Series</th>
                  <th className="numeric" scope="col">
                    Set price
                  </th>
                  <th scope="col">End date</th>
                  <th scope="col">Status</th>
                  <th scope="col">Position</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.config.series_id}>
                    <td>
                      <strong>{marketName(s)}</strong>
                      <small>
                        {distanceFromSpot(s.config.strike, d.spot, now)}
                      </small>
                    </td>
                    <td className="numeric">{dollars(s.config.strike)}</td>
                    <td>
                      <span title={dateLabel(s.config.maturity_ns)}>
                        {relativeEnd(s.config.maturity_ns, now)}
                        <small>
                          {now
                            ? new Date(
                                Number(BigInt(s.config.maturity_ns) / 1000000n),
                              ).toLocaleString()
                            : ""}
                        </small>
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          "desk-pill " +
                          (seriesStatus(s, now) === "Open" ? "positive" : "")
                        }
                      >
                        {seriesStatus(s, now)}
                      </span>
                    </td>
                    <td>
                      <div className="desk-inline">
                        <Link
                          prefetch={false}
                          className="desk-button small"
                          href={
                            "/trade?series=" +
                            encodeURIComponent(s.config.series_id) +
                            "&claim=N"
                          }
                        >
                          {seriesStatus(s, now) === "Open" ? "Upside" : "View"}
                        </Link>
                        {seriesStatus(s, now) === "Open" && (
                          <Link
                            prefetch={false}
                            className="desk-button small"
                            href={
                              "/trade?series=" +
                              encodeURIComponent(s.config.series_id) +
                              "&claim=P"
                            }
                          >
                            Capped value
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
