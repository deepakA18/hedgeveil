"use client";
import { useState, useId, type PointerEvent } from "react";
import { InfoPopover } from "./InfoPopover";
import { useDesk } from "./DeskProvider";
import { useNow } from "./Elements";
import { parseNear } from "../../lib/desk-api";
import {
  freshSpot,
  usdText,
  usdValue,
  scenarioPayout,
} from "../../lib/market-display";
import { nearBreakEven, fixedPayout, exactUsd } from "../../lib/terminal-data";
import { buyMetrics } from "../../lib/market-display";
import { amountDisplay } from "../../lib/amount-display";
import type { Claim, Series } from "../../lib/desk-types";
export function ScenarioChart({
  series,
  claim,
  quantity,
  cost,
  costKind = "offer",
  defaultUnit = "USD",
  onUnitChange,
}: {
  series: Series;
  claim: Claim;
  quantity: string;
  cost?: bigint;
  costKind?: "offer" | "model";
  defaultUnit?: "USD" | "NEAR";
  onUnitChange?: (unit: "USD" | "NEAR") => void;
}) {
  const { spot } = useDesk(),
    now = useNow(),
    uid = useId();
  const [unit, setUnit] = useState<"USD" | "NEAR">(defaultUnit),
    [selectedPrice, setSelectedPrice] = useState<bigint | null>(null),
    [inspecting, setInspecting] = useState(false);
  const finalized = series.final_price !== null;
  const finalPrice = finalized ? BigInt(series.final_price!) : null;
  const strike = BigInt(series.config.strike),
    live = freshSpot(spot, now) ? BigInt(spot.price) : null;
  let amount: bigint;
  try {
    amount = BigInt(parseNear(quantity));
    if (amount <= 0n) throw Error();
  } catch {
    return <p>Enter a positive quantity to explore the payout.</p>;
  }
  const base = finalPrice ?? live ?? strike,
    maxX = (base > strike ? base : strike) * 3n;
  const reference =
    finalPrice !== null
      ? finalPrice
      : selectedPrice === null
        ? base
        : selectedPrice > maxX
          ? maxX
          : selectedPrice;
  const hoverPrice =
    selectedPrice === null ? base : selectedPrice > maxX ? maxX : selectedPrice;
  const hoverPayout = scenarioPayout(amount, strike, hoverPrice, claim);
  const hoverDollars = usdValue(hoverPayout, hoverPrice);
  function inspectPrice(event: PointerEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    // Screen coordinates choose a bounded integer tick; financial math stays bigint.
    const tick = BigInt(
      Math.round(Math.max(0, Math.min(1, (point.x - 60) / 520)) * 10000),
    );
    setSelectedPrice((maxX * tick) / 10000n);
    setInspecting(true);
  }
  const payout =
      fixedPayout(series, amount, claim) ??
      scenarioPayout(amount, strike, reference, claim),
    dollars = usdValue(payout, reference);
  const entryCost =
    cost !== undefined && live !== null ? usdValue(cost, live) : null;
  const profit =
    cost === undefined
      ? null
      : unit === "NEAR"
        ? payout - cost
        : entryCost === null
          ? null
          : dollars - entryCost;
  const hoverProfit =
    cost === undefined
      ? null
      : unit === "NEAR"
        ? hoverPayout - cost
        : entryCost === null
          ? null
          : hoverDollars - entryCost;
  const endpoint = scenarioPayout(amount, strike, maxX, claim);
  const ymax =
    unit === "NEAR"
      ? claim === "P"
        ? amount
        : endpoint
      : usdValue(endpoint, maxX);
  const px = (p: bigint) => 60 + Number((p * 52000n) / maxX) / 100;
  const plotBottom = finalized ? 160 : 210,
    plotTop = finalized ? 35 : 60;
  const py = (v: bigint) =>
    plotBottom -
    Number((v * BigInt((plotBottom - plotTop) * 100)) / (ymax || 1n)) / 100;
  const plotPrices = [
    ...new Set([
      ...Array.from({ length: 121 }, (_, i) => (maxX * BigInt(i)) / 120n),
      strike,
      ...(finalPrice === null ? [] : [finalPrice]),
    ]),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const path = plotPrices
    .map((x, i) => {
      const p = scenarioPayout(amount, strike, x, claim),
        v = unit === "NEAR" ? p : usdValue(p, x);
      return `${i ? "L" : "M"}${px(x).toFixed(2)},${py(v).toFixed(2)}`;
    })
    .join(" ");
  const breakEven =
    cost === undefined
      ? null
      : unit === "NEAR"
        ? nearBreakEven(amount, cost, strike, claim)
        : live === null
          ? null
          : buyMetrics(amount, cost, 0n, strike, live, claim).breakEven;
  const signedNear = (v: bigint) =>
    (v < 0n ? "-" : "+") +
    amountDisplay((v < 0n ? -v : v).toString()).text +
    " NEAR";
  return (
    <figure
      className={"scenario-chart" + (finalized ? " settled-outcome" : "")}
      aria-labelledby={uid}
    >
      <div className="panel-top">
        <h2 id={uid}>
          {finalized
            ? "Settled at " + exactUsd(finalPrice!)
            : "Payout at the final price"}
          <InfoPopover label="Payout chart">
            Hover or tap to explore a hypothetical final price. The dashed line
            marks the set price {exactUsd(strike)}.{" "}
            {finalized
              ? `The solid line marks the actual final reference ${exactUsd(finalPrice!)}; the settled payout stays fixed. The dollar amount uses this final price, not today’s spot price.`
              : "The dotted line marks fresh spot when available."}{" "}
            Payouts are in NEAR; USD is a reference value, not guaranteed
            conversion proceeds.
          </InfoPopover>
        </h2>
        <div className="desk-tabs" aria-label="Payout currency">
          {(["USD", "NEAR"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={unit === v}
              onClick={() => {
                setUnit(v);
                onUnitChange?.(v);
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="scenario-plot">
        <svg
          viewBox={finalized ? "0 0 640 225" : "0 0 640 300"}
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={10000}
          aria-valuenow={Number((hoverPrice * 10000n) / maxX)}
          aria-valuetext={`${finalized ? "Hypothetical: " : ""}NEAR finishes at ${usdText(hoverPrice)}; payout ${amountDisplay(hoverPayout.toString()).text} NEAR, approximately ${usdText(hoverDollars)}`}
          aria-describedby={`${uid}-instructions`}
          aria-label={`${claim === "N" ? "Upside" : "Capped value"} payout in ${unit} at the final reference price${finalized ? ", hypothetical exploration" : ""}`}
          onFocus={() => setInspecting(true)}
          onBlur={() => setInspecting(false)}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setInspecting(false);
          }}
          onPointerDown={inspectPrice}
          onPointerMove={(event) => {
            if (event.pointerType === "mouse" || event.buttons > 0)
              inspectPrice(event);
          }}
          onKeyDown={(event) => {
            const step = maxX / 300n || 1n;
            let next = hoverPrice;
            if (event.key === "Escape") {
              setInspecting(false);
              return;
            }
            if (event.key === "Home") next = 0n;
            else if (event.key === "End") next = maxX;
            else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
              next -= step;
            else if (event.key === "ArrowRight" || event.key === "ArrowUp")
              next += step;
            else return;
            event.preventDefault();
            setInspecting(true);
            setSelectedPrice(next < 0n ? 0n : next > maxX ? maxX : next);
          }}
        >
          {(finalized ? [plotTop, plotBottom] : [60, 135, 210]).map((y) => (
            <path key={y} d={`M60 ${y}H580`} className="scenario-grid" />
          ))}
          <text x="60" y="20">
            Payout in {unit} for {amountDisplay(amount.toString()).text}{" "}
            {amount === 10n ** 24n ? "unit" : "units"}
          </text>
          {(finalized ? [0n, 2n] : [0n, 1n, 2n]).map((i) => (
            <text
              key={String(i)}
              x="52"
              y={py((ymax * i) / 2n) + 4}
              textAnchor="end"
              className="scenario-y-tick"
            >
              {unit === "USD"
                ? usdText((ymax * i) / 2n)
                : amountDisplay(((ymax * i) / 2n).toString()).text}
            </text>
          ))}
          <text x="60" y={finalized ? 187 : 239} textAnchor="middle">
            $0.00
          </text>
          {!finalized && (
            <text x="580" y="239" textAnchor="middle">
              {usdText(maxX)}
            </text>
          )}
          <path
            d={`M${px(strike)} ${plotBottom}v8`}
            className="scenario-strike"
          />
          <text
            className="scenario-key-tick"
            x={px(strike) - 6}
            y={finalized ? 187 : 239}
            textAnchor="end"
          >
            K {exactUsd(strike)}
          </text>
          {finalPrice !== null && (
            <>
              <path
                d={`M${px(finalPrice)} ${plotBottom}v30`}
                className="scenario-final"
              />
              <text
                className="scenario-key-tick"
                x={px(finalPrice) + 6}
                y={finalized ? 210 : 258}
                textAnchor="start"
              >
                Final {exactUsd(finalPrice)}
              </text>
            </>
          )}
          {!finalized && (
            <text x="320" y="290" textAnchor="middle">
              Final reference price (USD per NEAR)
            </text>
          )}
          <path
            d={`M${px(strike)} ${plotTop}V${plotBottom}`}
            className="scenario-strike"
          />
          {!finalized && live !== null && (
            <text
              x={Math.min(540, Math.max(100, px((finalPrice ?? live)!)))}
              y="46"
              textAnchor="middle"
            >
              {finalized
                ? "Final " + exactUsd(finalPrice!)
                : "Spot " + usdText(live!)}
            </text>
          )}
          {breakEven !== null && breakEven <= maxX && (
            <>
              <path
                d={`M${px(breakEven)} ${plotTop}V${plotBottom}`}
                className="scenario-breakeven"
              />
              <text
                x={Math.min(520, Math.max(130, px(breakEven)))}
                y="60"
                textAnchor="middle"
              >
                Break-even {usdText(breakEven)}
              </text>
            </>
          )}
          <path
            d={`${path} L580,${plotBottom} L60,${plotBottom} Z`}
            className="scenario-area"
          />
          <path d={path} className="scenario-curve" />
          {(finalPrice ?? live) !== null && (
            <path
              d={`M${px((finalPrice ?? live)!)} ${plotTop}V${plotBottom}`}
              className={finalized ? "scenario-final" : "scenario-spot"}
            />
          )}
          {inspecting && (
            <>
              <path
                d={`M${px(hoverPrice)} ${plotTop}V${plotBottom}`}
                className="scenario-cursor"
              />
              <circle
                cx={px(hoverPrice)}
                cy={py(unit === "USD" ? hoverDollars : hoverPayout)}
                r="5"
                className="scenario-point"
              />
            </>
          )}
          <circle
            cx={px(reference)}
            cy={py(unit === "USD" ? dollars : payout)}
            r="5"
            className="scenario-point"
          />
        </svg>
        {inspecting && (
          <div
            className="scenario-tooltip"
            style={{ [px(hoverPrice) > 320 ? "right" : "left"]: "3%" }}
          >
            {finalized && (
              <span className="scenario-hypothetical">
                Hypothetical, settlement unchanged
              </span>
            )}
            <span>
              If NEAR finishes at <strong>{usdText(hoverPrice)}</strong>
            </span>
            <strong>
              {amountDisplay(hoverPayout.toString()).text} NEAR ≈{" "}
              {usdText(hoverDollars)}
            </strong>
            <span>
              {hoverProfit === null
                ? "Payout only, no entry cost available"
                : `Profit / loss: ${unit === "USD" ? (hoverProfit > 0n ? "+" : "") + usdText(hoverProfit) : signedNear(hoverProfit)}`}
            </span>
          </div>
        )}
      </div>
      <span id={`${uid}-instructions`} className="sr-only">
        Hover or touch the graph to explore a price. Use arrow keys to adjust,
        Home for the lowest price and End for the highest.
        {finalized &&
          " Exploration is hypothetical; the settled payout remains fixed."}
      </span>
      <figcaption aria-live="polite">
        {!finalized && (
          <span className="scenario-reference">
            If NEAR finishes at {usdText(reference)}
          </span>
        )}
        <span className="scenario-result-label">
          {finalized
            ? `Payout for ${amountDisplay(amount.toString()).text} ${amount === 10n ** 24n ? "unit" : "units"}`
            : "You receive"}
        </span>
        <strong>
          {amountDisplay(payout.toString()).text} NEAR ≈ {usdText(dollars)}
        </strong>
        {!finalized && (
          <p>
            {profit === null
              ? finalized
                ? "USD at final reference"
                : "Payout only, cost not included"
              : `Estimated profit / loss: ${unit === "USD" ? (profit > 0n ? "+" : "") + usdText(profit) : signedNear(profit)}.`}
          </p>
        )}
      </figcaption>
      {cost !== undefined && (
        <p className="mark-caveat">
          {costKind === "model"
            ? "Model estimate; spread, fees and gas excluded."
            : "Offer fee included; gas excluded."}{" "}
          USD cost uses current spot.
        </p>
      )}
    </figure>
  );
}
