import { TweetGrid } from "../ui/tweet-grid";
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
        className="home-tweet"
        aria-label="Related reading from Vitalik Buterin"
      >
        <div className="home-tweet-intro">
          <p className="section-label">The idea behind it</p>
          <h3>Options as a foundation.</h3>
          <p>
            Vitalik’s post explores building index-tracking assets with options
            instead of debt.
          </p>
          <a
            href="https://x.com/VitalikButerin/status/2061469961416032653"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the original post
          </a>
          <small>Related reading, not an endorsement of Hedgeveil.</small>
        </div>
        <TweetGrid tweets={["2061469961416032653"]} columns={1} spacing="sm" />
      </aside>
    </section>
  );
}
