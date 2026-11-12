"use client";

import { useState } from "react";
import { actions } from "./content";

export function Actions({ deskUrl }: { deskUrl: string }) {
  const [selected, setSelected] = useState(0);
  const content = actions[selected];
  return (
    <section
      className="story-section"
      id="what-you-can-do"
      aria-labelledby="actions-title"
    >
      <div className="story-heading">
        <p className="section-label">What you can do</p>
        <h2 id="actions-title">
          Choose the exposure
          <br /> that fits your view.
        </h2>
        <p>
          Take a position on NEAR’s price, check its terms, and review the full
          cost before signing. Available trades depend on funded offers.
        </p>
      </div>
      <div className="action-layout">
        <div className="action-choices" aria-label="Explore available actions">
          <button
            type="button"
            className={selected === 0 ? "step selected" : "step"}
            data-step="0"
            aria-pressed={selected === 0}
            onClick={() => setSelected(0)}
            aria-controls="step-explainer"
          >
            <span className="step-number">01</span>
            <span>
              <strong>Buy the upside</strong>
              <span>A position that pays above a set price.</span>
            </span>
          </button>
          <button
            type="button"
            className={selected === 1 ? "step selected" : "step"}
            data-step="1"
            aria-pressed={selected === 1}
            onClick={() => setSelected(1)}
            aria-controls="step-explainer"
          >
            <span className="step-number">02</span>
            <span>
              <strong>Choose capped exposure</strong>
              <span>Follow NEAR’s value up to a limit.</span>
            </span>
          </button>
          <button
            type="button"
            className={selected === 2 ? "step selected" : "step"}
            data-step="2"
            aria-pressed={selected === 2}
            onClick={() => setSelected(2)}
            aria-controls="step-explainer"
          >
            <span className="step-number">03</span>
            <span>
              <strong>Manage your position</strong>
              <span>Request an early sale or claim a payout.</span>
            </span>
          </button>
        </div>
        <div
          className="action-detail"
          id="step-explainer"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="section-label" id="step-kicker">
            {content[0]}
          </p>
          <h3 id="step-title">{content[1]}</h3>
          <p id="step-copy">{content[2]}</p>
          <dl className="action-facts">
            <div>
              <dt>You receive</dt>
              <dd id="action-receive">{content[3]}</dd>
            </div>
            <div>
              <dt>Keep in mind</dt>
              <dd id="action-risk">{content[4]}</dd>
            </div>
          </dl>
          <a className="button" href={deskUrl}>
            Explore available trades
          </a>
        </div>
      </div>
      <p className="section-note">
        These explain how the positions work. They are not live quotes or price
        predictions.
      </p>
    </section>
  );
}
