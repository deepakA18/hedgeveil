import { PayoffChart } from "./PayoffChart";

export function Hero({ deskUrl }: { deskUrl: string }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">
          Options on NEAR.
          <br /> <span>Your exposure. Your choice.</span>
        </h1>
        <p className="hero-description">
          Choose how you take a position on NEAR.
          <br /> Review the cost and the payout before you trade.
        </p>
        <div className="hero-actions">
          <a className="button hero-primary" href={deskUrl}>
            Explore the app
          </a>
          <a className="button hero-secondary" href="#what-you-can-do">
            How it works
          </a>
        </div>
      </div>
      <div className="hero-product">
        <PayoffChart />
        <aside className="backing-panel" aria-labelledby="backing-title">
          <p className="backing-label">How it’s built</p>
          <h2 id="backing-title">
            Backed before
            <br /> you trade.
          </h2>
          <dl>
            <div>
              <dt>Paid upfront</dt>
              <dd>No margin top-ups on your purchase.</dd>
            </div>
            <div>
              <dt>NEAR backing</dt>
              <dd>Funds locked when positions are created.</dd>
            </div>
            <div>
              <dt>Wallet approved</dt>
              <dd>You review and sign each trade.</dd>
            </div>
          </dl>
          <p className="hero-risk">
            Your position can lose its full purchase cost, plus fees.
          </p>
        </aside>
      </div>
    </section>
  );
}
