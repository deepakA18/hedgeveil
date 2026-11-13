"use client";
import { errorToast, Spinner } from "./Feedback";
import { useEffect, useRef, useState, useId } from "react";
import { useSearchParams } from "next/navigation";

import { useDesk, LegList } from "./DeskProvider";
import { Empty, Form, AmountField, useNow, seriesStatus } from "./Elements";
import {
  api,
  parseNear,
  dollars,
  dateLabel,
  message,
} from "../../lib/desk-api";

import { InfoPopover } from "./InfoPopover";
import { useWorkspaceResize } from "./WorkspaceResize";
import { ServiceStatus } from "./ServiceStatus";
import { TradeTour } from "./TradeTour";
import { ScenarioChart } from "./ScenarioChart";
import { QuoteSummary } from "./QuoteSummary";
import { Q, freshSpot, isOpen, quoteEconomics } from "../../lib/market-display";
import { bestReviewOffer, requestReviewOffers } from "../../lib/trade-review";
import { MotionConfig } from "motion/react";
import {
  FamilyDrawerRoot,
  FamilyDrawerTrigger,
  FamilyDrawerPortal,
  FamilyDrawerOverlay,
  FamilyDrawerContent,
  FamilyDrawerAnimatedWrapper,
  FamilyDrawerTitle,
  FamilyDrawerDescription,
  FamilyDrawerClose,
} from "../ui/family-drawer";
import { SeriesList } from "./SeriesList";
import { SettlementPanel } from "./SettlementPanel";
import { ScenarioTable } from "./ScenarioTable";
import { SeriesPositionContext } from "./SeriesPositionContext";
import { BalanceGrid } from "./BalanceGrid";
import { TradingDock } from "./TradingDock";
import { Gate, Num, Countdown } from "./TerminalPrimitives";
import {
  type GateReason,
  gateLabel,
  gateCopy,
  lifecycle,
  oracleCase,
  expiryCase,
  offerGate,
} from "../../lib/terminal-data";
import { scenarioPayout } from "../../lib/market-display";
import type { Claim, Offer } from "../../lib/desk-types";
export function Trade() {
  const gateId = useId();
  const d = useDesk(),
    params = useSearchParams(),
    now = useNow();
  const [id, setId] = useState(params.get("series") ?? ""),
    [claim, setClaim] = useState<Claim>(
      params.get("claim") === "P" ? "P" : "N",
    ),
    [mode, setMode] = useState(params.get("side") === "SELL" ? "SELL" : "BUY"),
    [quantity, setQuantity] = useState(params.get("qty") ?? "1"),
    [offers, setOffers] = useState<Offer[]>([]),
    [requested, setRequested] = useState(false),
    [fetching, setFetching] = useState(false),
    [quoteError, setQuoteError] = useState(""),
    [scenarioOffer, setScenarioOffer] = useState<number | null>(null),
    [offerKey, setOfferKey] = useState("");
  const [chartUnit, setChartUnit] = useState<"USD" | "NEAR">("USD"),
    [expert, setExpert] = useState(false),
    [mobile, setMobile] = useState(false),
    [ticketOpen, setTicketOpen] = useState(false);
  const resize = useWorkspaceResize(mobile);
  useEffect(() => {
    const m = matchMedia("(max-width: 1023px)");
    const update = () => {
      setMobile(m.matches);
      if (!m.matches) setTicketOpen(false);
    };
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setQuantity(params.get("qty") ?? "1");
    setId(params.get("series") ?? "");
    setClaim(params.get("claim") === "P" ? "P" : "N");
    setMode(params.get("side") === "SELL" ? "SELL" : "BUY");
  }, [params]);
  function choose(values: { series?: string; claim?: Claim; side?: string }) {
    if (values.claim) setClaim(values.claim);
    if (values.side) setMode(values.side);
    if (values.series !== undefined) setId(values.series);
    const next = new URLSearchParams(window.location.search);
    next.set("qty", quantity);
    for (const [key, value] of Object.entries(values)) next.set(key, value);
    window.history.replaceState(null, "", "/trade?" + next.toString());
  }
  const requestVersion = useRef(0);
  const series =
    d.series.find((s) => s.config.series_id === id) ??
    d.series.find((s) => isOpen(s, now)) ??
    d.series.toSorted((a, b) =>
      Number(BigInt(b.config.maturity_ns) - BigInt(a.config.maturity_ns)),
    )[0];
  const selectedId = series?.config.series_id ?? "";
  const fingerprint = [selectedId, claim, mode, quantity, d.account].join("|");
  const current = useRef(fingerprint);
  current.current = fingerprint;
  useEffect(() => {
    requestVersion.current++;
    setOffers([]);
    setScenarioOffer(null);
    setRequested(false);
    setQuoteError("");
    setFetching(false);
    return () => {
      requestVersion.current++;
    };
  }, [fingerprint]);
  const open = !!series && seriesStatus(series, now) === "Open";
  let validQuantity = false;
  try {
    validQuantity = BigInt(parseNear(quantity)) > 0n;
  } catch {
    /* Editing an amount. */
  }
  async function reviewTrade() {
    if (!validQuantity || gate || fetching) return;
    const amount = parseNear(quantity);
    const at = current.current,
      run = ++requestVersion.current;
    const startedAt = performance.now();
    const stillCurrent = () =>
      at === current.current && run === requestVersion.current;
    setQuoteError("");
    setFetching(true);
    setRequested(true);
    setOffers([]);
    try {
      const request = {
        mode,
        asset: { kind: claim, series_id: selectedId },
        amount,
        taker: d.account,
      };
      const result = await requestReviewOffers(
        request,
        (body) => api<{ items: Offer[] }>("quotes", body),
        stillCurrent,
      );
      if (!result || !stillCurrent()) return;
      setOffers(result.items);
      setOfferKey(at);
      const first = bestReviewOffer(
        result.items,
        request,
        now + performance.now() - startedAt,
      );
      setScenarioOffer(first < 0 ? null : first);
      if (first < 0) {
        const reason = result.items.some((o) => o.quote)
          ? "QUOTE_EXPIRED"
          : offerGate(result.items.map((o) => o.reason));
        errorToast(gateCopy[reason][0]);
        return;
      }
      setTicketOpen(false);
      await d.review({
        method: "fill_quote",
        args: { quote: result.items[first].quote },
      });
    } catch (error) {
      if (at === current.current && run === requestVersion.current) {
        setQuoteError(message(error));
        errorToast(message(error));
      }
    } finally {
      if (run === requestVersion.current) setFetching(false);
    }
  }
  const balance = d.live?.accounts[d.account];
  const blockedReason = !series
    ? d.series.length
      ? "No open series right now. View past markets in History."
      : "Market data is unavailable. Refresh to check again."
    : !open
      ? "This series has ended. Trading is closed."
      : !d.account
        ? "Use Connect wallet in the header to request an offer."
        : !d.ready
          ? "Your account data is unavailable. Refresh before requesting an offer."
          : !balance
            ? "Register your account in Funds before requesting an offer."
            : !d.state?.health.risk_allowed
              ? "Trading is paused until data checks pass. Refresh to check again."
              : d.busy
                ? "Finish your current wallet action first."
                : "";
  const visibleOffers = offerKey === fingerprint ? offers : [];
  const selectedQuote =
    scenarioOffer === null ? null : visibleOffers[scenarioOffer]?.quote;
  const expired =
    !!selectedQuote &&
    BigInt(selectedQuote.expiry_ns) <= BigInt(now) * 1000000n;
  const economics = selectedQuote
    ? quoteEconomics(selectedQuote, selectedId, claim, mode)
    : null;
  const gate: GateReason | null = !now
    ? "PAUSED"
    : !open
      ? "NO_OPEN_SERIES"
      : !d.account
        ? "WALLET_REQUIRED"
        : !d.ready ||
            !d.state?.health.risk_allowed ||
            performance.now() - d.checkedAtMono > 60000
          ? "INDEXER_LAG"
          : !balance
            ? "STORAGE_UNPAID"
            : d.busy
              ? "BUSY"
              : null;
  const validQuotes = visibleOffers.filter(
    (o) => o.quote && BigInt(o.quote.expiry_ns) > BigInt(now) * 1000000n,
  );
  const makerCount = new Set(validQuotes.map((o) => o.quote!.maker)).size;
  const executableCost =
    mode === "BUY" && economics && !expired ? economics.total : undefined;
  function changeQuantity(value: string) {
    setQuantity(value);
    const next = new URLSearchParams(window.location.search);
    next.set("qty", value);
    window.history.replaceState(null, "", "/trade?" + next.toString());
  }
  const missingQuoteReason: GateReason =
    gate ??
    (expired ? "QUOTE_EXPIRED" : offerGate(visibleOffers.map((o) => o.reason)));
  const delayed =
    !!series &&
    lifecycle(
      series,
      now,
      expiryCase(d.state, series) ?? oracleCase(d.state, series),
    ) === "RESOLUTION_DELAYED";
  const ticket = (
    <section
      className="terminal-ticket workspace-panel"
      data-panel="ticket"
      aria-label="Trade ticket"
    >
      <div className="region-heading">
        <h2>
          {delayed
            ? "Exit position"
            : mode === "SELL"
              ? "Sell position"
              : "Trade ticket"}
          <ServiceStatus />
        </h2>
      </div>
      <section className="trade-controls" aria-label="Choose your market">
        <div className="desk-tabs" role="group" aria-label="Choose exposure">
          <button
            aria-pressed={claim === "N"}
            onClick={() => choose({ claim: "N" })}
          >
            NEAR upside
          </button>
          <button
            aria-pressed={claim === "P"}
            onClick={() => choose({ claim: "P" })}
          >
            Capped value
          </button>
        </div>
        <div className="desk-tabs" role="group" aria-label="Trade side">
          <button
            disabled={!open}
            title={!open ? gateLabel.NO_OPEN_SERIES : undefined}
            aria-pressed={mode === "BUY"}
            onClick={() => choose({ side: "BUY" })}
          >
            Buy
          </button>
          <button
            disabled={!open}
            title={!open ? gateLabel.NO_OPEN_SERIES : undefined}
            aria-pressed={mode === "SELL"}
            onClick={() => choose({ side: "SELL" })}
          >
            Sell
          </button>
        </div>
      </section>
      {delayed && series && (
        <SeriesPositionContext
          primary
          series={series}
          beforeReview={() => setTicketOpen(false)}
        />
      )}
      <Form
        editable
        label={
          gate
            ? gateLabel[gate]
            : fetching
              ? "Checking makers…"
              : "Review trade"
        }
        disabled={!!gate || fetching || !validQuantity}
        disabledReason={
          !validQuantity
            ? "Enter a quantity greater than zero."
            : gate
              ? undefined
              : blockedReason
        }
        disabledDescriptionId={gateId}
        onSubmit={reviewTrade}
      >
        <div className="quantity-with-help">
          <AmountField
            label="Quantity"
            value={quantity}
            onChange={changeQuantity}
          />
          <InfoPopover label="Quantity">
            One unit is one side of a pair backed by 1 NEAR. You buy the
            selected side, not both sides. Your offer shows its actual cost.
          </InfoPopover>
        </div>
        <Gate
          id={gateId}
          reason={
            !validQuantity
              ? gate
              : fetching || !requested || (selectedQuote && !expired)
                ? gate
                : missingQuoteReason
          }
          onAction={gate === "INDEXER_LAG" ? () => void d.refresh() : undefined}
        />
      </Form>
      {series && selectedQuote && !expired ? (
        <QuoteSummary
          quote={selectedQuote}
          series={series}
          claim={claim}
          side={mode}
          unit={chartUnit}
        />
      ) : (
        <dl
          className="quote-metrics quote-unavailable"
          data-reason={missingQuoteReason}
        >
          {["Executable price", "Total cost", "Maximum loss", "Break-even"].map(
            (label) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd aria-label={gateLabel[missingQuoteReason]}>—</dd>
              </div>
            ),
          )}
        </dl>
      )}
      {fetching && (
        <p role="status">
          <Spinner />
          Checking funded inventory…
        </p>
      )}
      {quoteError && (
        <p role="alert" className="desk-danger">
          {quoteError}
        </p>
      )}
      {selectedQuote && (
        <>
          <div className="quote-banner">
            <span>
              {expired ? (
                "Expired"
              ) : (
                <>
                  Expires in <Countdown targetNs={selectedQuote.expiry_ns} />
                </>
              )}
            </span>
            <span className="label-with-help">
              All-or-nothing{" "}
              <InfoPopover label="Offer execution">
                One maker fills the full signed quantity or the trade fails. An
                offer does not reserve inventory; availability is checked again
                when the transaction executes.
              </InfoPopover>
            </span>
            <span>
              {makerCount} maker{makerCount === 1 ? "" : "s"} responded
            </span>
            {economics && (
              <span>
                Signed size <Num value={economics.quantity} unit="units" />
              </span>
            )}
          </div>
          <details className="desk-details">
            <summary>Exact assets, fees and signature</summary>
            <LegList
              legs={[
                ...selectedQuote.taker_gives,
                {
                  asset: { kind: "COLLATERAL" },
                  amount: selectedQuote.fee.amount,
                },
              ]}
            />
            <pre>{JSON.stringify(selectedQuote, null, 2)}</pre>
          </details>
        </>
      )}
      {series && !delayed && (
        <SeriesPositionContext
          series={series}
          beforeReview={() => setTicketOpen(false)}
        />
      )}
      <BalanceGrid compact />
    </section>
  );
  return (
    <MotionConfig reducedMotion="always">
      <div className="trade-workspace terminal-workspace" style={resize.style}>
        <h1 className="sr-only">Trade NEAR</h1>
        <TradeTour
          ready={
            !!d.session && !!d.state && !d.loading && !d.busy && !ticketOpen
          }
          mobile={mobile}
          hasOpenMarkets={d.series.some((s) => isOpen(s, now))}
        />
        <div className="terminal-grid resizable-grid" ref={resize.gridRef}>
          <SeriesList
            series={d.series}
            selected={selectedId}
            choose={(series) => choose({ series })}
            now={now}
            expert={expert}
            onExpertChange={(value) => {
              setExpert(value);
              setChartUnit(value ? "NEAR" : "USD");
            }}
            claim={claim}
            offers={visibleOffers}
            side={mode}
          />
          {resize.leftDivider}
          <div className="terminal-center workspace-panel" data-panel="chart">
            {series ? (
              <>
                <div className="selected-market-line">
                  <span className="label-with-help">
                    <strong>K {dollars(series.config.strike)}</strong>
                    <InfoPopover label="Set price">
                      The price level fixed when this market was created. Upside
                      pays only above it; capped value stops gaining dollar
                      value above it. Settlement uses the market's final
                      reference price, not the current spot price.
                    </InfoPopover>
                  </span>
                  <span title={dateLabel(series.config.maturity_ns)}>
                    {open ? (
                      <>
                        Ends in{" "}
                        <Countdown targetNs={series.config.maturity_ns} />
                      </>
                    ) : (
                      <span className="selected-market-status">
                        <span className="state-badge">
                          {series.final_price !== null
                            ? "Settled"
                            : "Awaiting settlement"}
                        </span>{" "}
                        Ended{" "}
                        <Countdown
                          targetNs={series.config.maturity_ns}
                          elapsed
                        />{" "}
                        ago
                      </span>
                    )}
                  </span>
                </div>
                {expert && freshSpot(d.spot, now) && (
                  <div className="intrinsic-line">
                    Intrinsic at spot, P{" "}
                    <Num
                      value={scenarioPayout(
                        Q,
                        BigInt(series.config.strike),
                        BigInt(d.spot.price),
                        "P",
                      )}
                      unit=""
                    />{" "}
                    / N{" "}
                    <Num
                      value={scenarioPayout(
                        Q,
                        BigInt(series.config.strike),
                        BigInt(d.spot.price),
                        "N",
                      )}
                      unit=""
                    />{" "}
                    , not a quote
                  </div>
                )}
                {!open && series.final_price === null && (
                  <SettlementPanel series={series} />
                )}
                <ScenarioChart
                  key={series.config.series_id + String(expert)}
                  series={series}
                  claim={claim}
                  quantity={quantity}
                  cost={executableCost}
                  defaultUnit={expert ? "NEAR" : "USD"}
                  onUnitChange={setChartUnit}
                />
                {series.final_price === null && (
                  <ScenarioTable
                    series={series}
                    claim={claim}
                    quantity={quantity}
                    cost={executableCost}
                  />
                )}
                {(series.final_price !== null || (open && expert)) && (
                  <SettlementPanel series={series} />
                )}
              </>
            ) : (
              <Empty title="Market data unavailable">
                <p>
                  The registered series will appear when the service responds.
                </p>
              </Empty>
            )}
          </div>
          {resize.rightDivider}
          {!mobile && ticket}
          {!mobile && resize.heightDivider}
          {!mobile && <TradingDock expert={expert} />}
        </div>
        {mobile && (
          <FamilyDrawerRoot open={ticketOpen} onOpenChange={setTicketOpen}>
            <div className="mobile-ticket-launch">
              <FamilyDrawerTrigger asChild>
                <button className="desk-button lime">
                  {delayed ? "Merge matching pairs" : "Open trade ticket"}
                </button>
              </FamilyDrawerTrigger>
              <span>
                {selectedQuote && !expired
                  ? "Offer ready"
                  : delayed
                    ? "No price report needed"
                    : !open
                      ? "Market closed"
                      : "Review trade"}
              </span>
            </div>
            <FamilyDrawerPortal>
              <FamilyDrawerOverlay className="ticket-drawer-overlay" />
              <FamilyDrawerContent className="ticket-drawer">
                <FamilyDrawerAnimatedWrapper>
                  <div className="drawer-heading">
                    <FamilyDrawerTitle>Trade NEAR</FamilyDrawerTitle>
                    <FamilyDrawerClose>Close</FamilyDrawerClose>
                  </div>
                  <FamilyDrawerDescription>
                    Review cost and payout before signing.
                  </FamilyDrawerDescription>
                  {ticket}
                </FamilyDrawerAnimatedWrapper>
              </FamilyDrawerContent>
            </FamilyDrawerPortal>
          </FamilyDrawerRoot>
        )}
        {mobile && <TradingDock expert={expert} />}
      </div>
    </MotionConfig>
  );
}
