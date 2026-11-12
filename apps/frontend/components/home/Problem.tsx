export function Problem() {
  return (
    <section
      className="story-section"
      id="problem"
      aria-labelledby="problem-title"
    >
      <div className="story-heading">
        <p className="section-label">The problem</p>
        <h2 id="problem-title">
          A price move shouldn’t
          <br /> force your next move.
        </h2>
        <p>
          Borrowing to trade means a sudden price drop can force a position to
          close. With a fully paid Hedgeveil position, there’s no loan to repay
          and no balance to keep topping up.
        </p>
      </div>
      <div className="problem-grid">
        <article>
          <p className="section-label">Trading with borrowed funds</p>
          <h3>The market can decide when you leave.</h3>
          <p>
            If your account no longer covers the required margin, a leveraged
            position can be closed—even if the price later recovers.
          </p>
        </article>
        <article className="highlight-panel">
          <p className="section-label">Buying a Hedgeveil position</p>
          <h3>You pay for the position upfront.</h3>
          <p>
            A price move doesn’t trigger a margin call. You can hold through the
            end date, or request a price to sell earlier.
          </p>
          <p className="section-note">
            You can still lose the full purchase cost, plus fees. An early sale
            needs an available buyer.
          </p>
        </article>
      </div>
      <aside
        className="post-preview"
        aria-label="Related reading from Vitalik Buterin"
      >
        <div className="post-author">
          <span className="author-initials" aria-hidden="true">
            VB
          </span>
          <div>
            <strong>Vitalik Buterin</strong>
            <span>@VitalikButerin · June 1, 2026</span>
          </div>
          <span className="post-platform" aria-hidden="true">
            X
          </span>
        </div>
        <blockquote>
          “Building index-tracking assets on top of options instead of debt”
        </blockquote>
        <div className="post-footer">
          <a
            href="https://x.com/VitalikButerin/status/2061469961416032653"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the original post
          </a>
          <span>Related reading · not an endorsement of Hedgeveil</span>
        </div>
      </aside>
    </section>
  );
}
