"use client";

import { useState } from "react";
import { payoffCopy } from "./content";
import { payoffPath } from "../../lib/payoff-illustration";

export function PayoffChart() {
  const [selected, setSelected] = useState<"upside" | "capped">("upside");
  const copy = payoffCopy[selected];
  return (
    <figure className="payoff-panel" aria-labelledby="payoff-title">
      <div className="payoff-heading">
        <h2 id="payoff-title">Understand the payoff</h2>
        <span>At expiry</span>
      </div>
      <div
        className="payoff-options"
        role="group"
        aria-label="Choose a payoff to view"
      >
        <button
          type="button"
          data-payoff="upside"
          aria-pressed={selected === "upside"}
          onClick={() => setSelected("upside")}
          aria-controls="payoff-plot payoff-explanation"
        >
          Upside
        </button>
        <button
          type="button"
          data-payoff="capped"
          aria-pressed={selected === "capped"}
          onClick={() => setSelected("capped")}
          aria-controls="payoff-plot payoff-explanation"
        >
          Capped value
        </button>
      </div>
      <svg
        id="payoff-plot"
        className="payoff-plot"
        viewBox="0 0 640 280"
        role="img"
        aria-labelledby="plot-title plot-description"
      >
        <title id="plot-title">{copy[0]}</title>
        <desc id="plot-description">{copy[1]}</desc>
        <g className="plot-grid">
          <path d="M54 48H598 M54 134H598 M54 220H598 M54 48V220 M190 48V220 M326 48V220 M462 48V220 M598 48V220" />
        </g>
        <g className="plot-labels">
          <text x="54" y="24">
            NEAR payout per unit
          </text>
          <text x="36" y="53" textAnchor="end">
            1
          </text>
          <text x="36" y="139" textAnchor="end">
            0.5
          </text>
          <text x="36" y="225" textAnchor="end">
            0
          </text>
          <text x="326" y="273" textAnchor="middle">
            Final reference price
          </text>
          <text x="169" y="244" textAnchor="middle">
            Set price
          </text>
        </g>
        <path className="plot-strike" d="M168.53 48V220" />
        <path
          className="payoff-curve"
          id="upside-curve"
          visibility={selected === "upside" ? "visible" : "hidden"}
          d={payoffPath("upside")}
        />
        <path
          className="payoff-curve"
          id="capped-curve"
          visibility={selected === "capped" ? "visible" : "hidden"}
          d={payoffPath("capped")}
        />
      </svg>
      <figcaption id="payoff-explanation" aria-live="polite">
        {copy[2]}
      </figcaption>
      <p className="plot-note">
        Payoff illustration, before purchase cost and fees. Not a live quote.
      </p>
    </figure>
  );
}
