export function Comparison() {
  return (
    <section
      className="story-section"
      id="comparison"
      aria-labelledby="comparison-title"
    >
      <div className="comparison-heading">
        <p className="section-label">How it is different from other options</p>
        <h2 id="comparison-title">
          Options, with NEAR
          <br /> at the centre.
        </h2>
        <p>
          Hedgeveil locks the NEAR needed for payouts before positions are
          created. That removes seller margin calls. The trade-off is full
          upfront funding and fewer trading tools.
        </p>
      </div>
      <div
        className="comparison-scroll"
        role="region"
        aria-label="Options comparison"
        tabIndex={0}
      >
        <table className="comparison-table">
          <caption>Backing and trading tools</caption>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Deribit inverse options</th>
              <th scope="col">Derive</th>
              <th scope="col">Hedgeveil</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Full payout backing required</th>
              <td>No</td>
              <td>No</td>
              <td>Yes</td>
            </tr>
            <tr>
              <th scope="row">Seller liquidation possible</th>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
            <tr>
              <th scope="row">Portfolio margin</th>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
            <tr>
              <th scope="row">Order book available</th>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
            <tr>
              <th scope="row">On-chain settlement</th>
              <td>No</td>
              <td>Yes</td>
              <td>Yes</td>
            </tr>
            <tr>
              <th scope="row">Payout currency</th>
              <td>BTC / ETH</td>
              <td>USDC</td>
              <td>NEAR</td>
            </tr>
            <tr>
              <th scope="row">Put options</th>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
