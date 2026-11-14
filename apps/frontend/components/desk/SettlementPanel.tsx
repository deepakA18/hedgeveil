"use client";
import {
  HaloTabs,
  HaloTabsList,
  HaloTabsTrigger,
  HaloTabsIndicator,
  HaloTabsContent,
} from "../ui/halo-tabs";
import { dateLabel } from "../../lib/desk-api";
import { InfoPopover } from "./InfoPopover";
import { SettlementProgress } from "./SettlementProgress";
import { useDesk } from "./DeskProvider";
import { useNow } from "./Elements";
import { Countdown, Num } from "./TerminalPrimitives";
import {
  oracleCase,
  expiryCase,
  lifecycle,
  fixedPayout,
  exactUsd,
  coefficientText,
  redeemedToDate,
} from "../../lib/terminal-data";
import { freshSpot, usdValue, usdText } from "../../lib/market-display";
import type { Series, Claim } from "../../lib/desk-types";
export function LockedPayout({
  series,
  quantity,
  claim,
}: {
  series: Series;
  quantity: bigint;
  claim: Claim;
}) {
  const d = useDesk(),
    now = useNow(),
    locked = fixedPayout(series, quantity, claim);
  if (!now || BigInt(series.config.maturity_ns) > BigInt(now) * 1000000n)
    return null;
  return (
    <div className="locked-payout">
      <span>{locked === null ? "Payout not finalized" : "Fixed payout"}</span>
      <strong>
        <Num value={locked} />
      </strong>
      <span>
        {locked !== null && freshSpot(d.spot, now)
          ? "≈ " + usdText(usdValue(locked, BigInt(d.spot.price))) + " now"
          : "Current USD value unavailable"}
      </span>
      <small>
        <Countdown targetNs={series.config.maturity_ns} elapsed /> since expiry.{" "}
        {locked === null
          ? "Expiry does not fix a payout without verified settlement."
          : "The NEAR amount is fixed; its dollar value still moves."}
      </small>
    </div>
  );
}
export function SettlementPanel({ series }: { series: Series }) {
  const d = useDesk(),
    now = useNow(),
    e = oracleCase(d.state, series),
    history = expiryCase(d.state, series),
    profile = String(series.config.oracle_version ?? ""),
    state = lifecycle(series, now, history ?? e),
    redeemed = redeemedToDate(series);
  const window = series.config.observation_window as
    { start_ns: string; end_ns: string } | undefined;
  const method =
    profile === "native-sampled-v1"
      ? "Average of three verified reports"
      : profile === "native-trade-twap-v1"
        ? "30-minute pre-expiry average"
        : "Unavailable";
  return (
    <section
      className="settlement-panel settlement-tabs"
      aria-label="Settlement evidence"
    >
      <HaloTabs defaultValue="samples" key={series.config.series_id}>
        <HaloTabsList aria-label="Settlement evidence" activateOnFocus>
          <HaloTabsTrigger value="samples">
            {profile === "native-trade-twap-v1" ? "Price history" : "Samples"}
          </HaloTabsTrigger>
          <HaloTabsTrigger value="backing">Backing</HaloTabsTrigger>
          <HaloTabsTrigger value="terms">Terms</HaloTabsTrigger>
          <HaloTabsIndicator />
        </HaloTabsList>
        <HaloTabsContent value="samples">
          {profile === "native-trade-twap-v1" && history && window ? (
            <div className="evidence-note twap-evidence">
              <SettlementProgress series={series} />
              <p>
                {history.price !== null
                  ? `Final reference ${exactUsd(history.price)}`
                  : history.accepted
                    ? `Verified average ${exactUsd(history.accepted.price)}; awaiting finalization or import.`
                    : history.pending !== null
                      ? "Price history requested; awaiting the authenticated response."
                      : history.last_result === "REJECTED"
                        ? "Price history could not be verified. Settlement needs review."
                        : now <
                            Number(BigInt(series.config.maturity_ns) / 1000000n)
                          ? "Price history will be verified after expiry."
                          : "Awaiting verified price history. Settlement time is not guaranteed."}
              </p>
              <p>
                {dateLabel(window.start_ns)} to {dateLabel(window.end_ns)}
              </p>
              <span>
                Coinbase NEAR/USD trade history, authenticated through Outlayer{" "}
                <InfoPopover label="Historical price evidence">
                  The reference is the time-weighted trade price over this exact
                  window, rounded down once. Incomplete or oversized history
                  delays settlement.
                  {history.accepted && (
                    <>
                      {" "}
                      Accepted {dateLabel(history.accepted.accepted_ns)}.
                      Evidence hash: {history.accepted.evidence_sha256}.
                      Response hash: {history.accepted.response_sha256}.
                    </>
                  )}
                </InfoPopover>
              </span>
            </div>
          ) : profile === "native-sampled-v1" && e && window ? (
            <>
              <div className="sample-slots">
                {[0, 1, 2].map((i) => {
                  const sample = e.samples[i],
                    start =
                      BigInt(window.start_ns) +
                      ((BigInt(window.end_ns) - BigInt(window.start_ns)) *
                        BigInt(i)) /
                        3n,
                    end =
                      BigInt(window.start_ns) +
                      ((BigInt(window.end_ns) - BigInt(window.start_ns)) *
                        BigInt(i + 1)) /
                        3n,
                    missed = now && end <= BigInt(now) * 1000000n;
                  return (
                    <div className={sample ? "sample-filled" : ""} key={i}>
                      <span className="sample-heading">
                        Sample {i + 1}
                        <InfoPopover label={`Sample ${i + 1} evidence`}>
                          Slot: {dateLabel(String(start))} to{" "}
                          {dateLabel(String(end))}.
                          {sample && (
                            <>
                              {" "}
                              Report: {dateLabel(sample.report_ns)}. Report +
                              {String(
                                (BigInt(sample.report_ns) - start) /
                                  1000000000n,
                              )}
                              s from slot start;{" "}
                              {String(
                                (BigInt(sample.accepted_ns) -
                                  BigInt(sample.report_ns)) /
                                  1000000000n,
                              )}
                              s old when accepted.
                            </>
                          )}{" "}
                          Source: {e.source.account}, {e.source.asset}.
                          Reporter: {e.source.reporter}. Timestamps are report
                          ingestion times.
                        </InfoPopover>
                      </span>
                      <strong>
                        {sample
                          ? exactUsd(sample.price)
                          : missed
                            ? "Missing"
                            : "Waiting"}
                      </strong>
                      {sample ? (
                        <time
                          title={dateLabel(sample.report_ns)}
                          dateTime={new Date(
                            Number(BigInt(sample.report_ns) / 1000000n),
                          ).toISOString()}
                        >
                          {new Date(
                            Number(BigInt(sample.report_ns) / 1000000n),
                          ).toLocaleTimeString()}
                        </time>
                      ) : (
                        <small>
                          {missed ? (
                            "Window closed"
                          ) : (
                            <>
                              Ends in <Countdown targetNs={String(end)} />
                            </>
                          )}
                        </small>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="evidence-note">
                {e.samples.filter(Boolean).length} of 3 verified reports{" "}
                <InfoPopover label="Price reports">
                  Source: {e.source.account}, {e.source.asset}. The final price
                  is the average of the three accepted reports, rounded down to
                  supported precision.
                </InfoPopover>
              </p>
              {state !== "FINALIZED" &&
                (e.samples.some((s) => !s) &&
                now >= Number(BigInt(window.end_ns) / 1000000n) ? (
                  <p className="settlement-warning">
                    Missing samples prevent settlement. No guaranteed completion
                    time or automatic backfill.
                  </p>
                ) : e.samples.every(Boolean) ? (
                  <p className="evidence-note">
                    {now <
                    Number(BigInt(series.config.maturity_ns) / 1000000n) +
                      60000 ? (
                      <>
                        Review ends in{" "}
                        <Countdown
                          targetNs={String(
                            BigInt(series.config.maturity_ns) + 60000000000n,
                          )}
                        />
                      </>
                    ) : (
                      "Review ended; awaiting finalization."
                    )}
                  </p>
                ) : null)}
            </>
          ) : (
            <p className="evidence-note">
              {profile === "native-sampled-v1"
                ? "Sample evidence is unavailable."
                : "Authenticated evidence is required for this profile."}
            </p>
          )}
        </HaloTabsContent>
        <HaloTabsContent value="backing">
          <div className="backing-total series-backing">
            <span className="label-with-help">
              NEAR backing remaining{" "}
              <InfoPopover label="NEAR backing remaining">
                Collateral for outstanding claims, not a count of units. Each
                redeemed claim reduces it by its exact payout.{" "}
                {d.state?.health.risk_allowed
                  ? "Reconciled snapshot"
                  : "Last retained snapshot, checks pending"}
                , block {d.state?.health.height ?? "unavailable"}.
              </InfoPopover>
            </span>
            <strong>
              <Num value={series.reserve} precision={6} />
            </strong>
          </div>
          <table className="backing-table" aria-label="Claim supply in units">
            <thead>
              <tr>
                <th scope="col">Units</th>
                <th scope="col">Capped value (P)</th>
                <th scope="col">Upside (N)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Minted</th>
                <td>
                  <Num value={redeemed?.minted} unit="" />
                </td>
                <td>
                  <Num value={redeemed?.minted} unit="" />
                </td>
              </tr>
              <tr>
                <th scope="row">Redeemed</th>
                <td>
                  <Num value={redeemed?.p} unit="" />
                </td>
                <td>
                  <Num value={redeemed?.n} unit="" />
                </td>
              </tr>
              <tr>
                <th scope="row">Outstanding</th>
                <td>
                  <Num value={series.outstanding_p} unit="" />
                </td>
                <td>
                  <Num value={series.outstanding_n} unit="" />
                </td>
              </tr>
            </tbody>
          </table>
          <p className="evidence-note">
            Merged pairs: <Num value={redeemed?.merged} unit="" />{" "}
            <InfoPopover label="Merged pairs">
              Each merged pair removes one unit of each side. Outstanding equals
              minted minus merged minus redeemed, for each side.
            </InfoPopover>
          </p>
        </HaloTabsContent>
        <HaloTabsContent value="terms">
          <dl className="settlement-terms">
            <div>
              <dt>End date</dt>
              <dd>{dateLabel(series.config.maturity_ns)}</dd>
            </div>
            <div>
              <dt>
                Price rule{" "}
                <InfoPopover label="How payouts work">
                  {method}.{" "}
                  {profile === "native-sampled-v1"
                    ? "The final price is rounded down to supported precision. Finalization requires complete evidence and a 60-second review after expiry."
                    : "This market follows its fixed source and observation rules."}{" "}
                  Once finalized, claim from your position, then withdraw
                  available NEAR. Missing evidence can delay the payout
                  indefinitely. The NEAR payout is fixed; its dollar value can
                  change before withdrawal.
                </InfoPopover>
              </dt>
              <dd>{method}</dd>
            </div>
            <div>
              <dt>Payout currency</dt>
              <dd>NEAR</dd>
            </div>
            <div>
              <dt>Per unit{series.final_price === null ? " (pending)" : ""}</dt>
              <dd>
                {series.final_price === null ? (
                  "Final price required"
                ) : (
                  <>
                    P {coefficientText(series.p_coefficient)} / N{" "}
                    {coefficientText(series.n_coefficient)} NEAR
                  </>
                )}
              </dd>
            </div>
          </dl>
        </HaloTabsContent>
      </HaloTabs>
    </section>
  );
}
