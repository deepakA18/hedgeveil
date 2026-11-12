export function Questions() {
  return (
    <section className="faq-section" id="questions" aria-labelledby="faq-title">
      <div className="faq-intro">
        <h2 id="faq-title">Understanding Hedgeveil.</h2>
      </div>
      <div className="questions">
        <details>
          <summary>
            Why does Hedgeveil split NEAR into two positions?
            <span aria-hidden="true"></span>
          </summary>
          <p>
            The split lets you choose which part of NEAR’s price movement to
            hold. One position receives the value above a set price; the other
            follows NEAR’s value up to that cap. Together, matching quantities
            share the original NEAR backing. Buying one gives you a different
            exposure from holding NEAR itself.
          </p>
        </details>
        <details>
          <summary>
            Does the capped-value position protect me if NEAR falls?
            <span aria-hidden="true"></span>
          </summary>
          <p>
            No. The cap limits the position’s upside; it does not set a floor
            under its dollar value. Below the cap, its value at the final
            reference price falls with NEAR. It is not a put, a stablecoin or a
            guaranteed return. You can lose money on either position.
          </p>
        </details>
        <details>
          <summary>
            If the trade uses a dollar price, why is my payout in NEAR?
            <span aria-hidden="true"></span>
          </summary>
          <p>
            The dollar price determines how the locked NEAR is divided between
            the two positions. The contract pays NEAR, not dollars. Once that
            amount is fixed, its dollar value can still move with NEAR’s market
            price—including between the price observation, your claim and your
            withdrawal.
          </p>
        </details>
        <details>
          <summary>
            What backs my payout if the seller leaves?
            <span aria-hidden="true"></span>
          </summary>
          <p>
            The NEAR backing is locked in the contract when the paired positions
            are created. Selling a position does not release that backing to the
            seller, so your payout does not depend on them returning with funds
            later. It still depends on correct contract execution and valid
            price evidence; full backing does not remove those risks.
          </p>
        </details>
        <details>
          <summary>
            Why can an offer disappear before I sign?
            <span aria-hidden="true"></span>
          </summary>
          <p>
            Offers have an expiry, and the maker’s available assets can change
            before your transaction executes. The contract checks the offer and
            balances again when it runs. The full trade must succeed together;
            it will not buy only part of your requested amount. A failed
            transaction can still cost network fees.
          </p>
        </details>
        <details>
          <summary>
            Which price determines my final payout?
            <span aria-hidden="true"></span>
          </summary>
          <p>
            Each series fixes its price source, observation rules and end date
            before positions are created. Those rules determine the final
            reference price—not the maker’s quote or the chart price when you
            click claim. If the required evidence is missing or invalid, the
            payout remains unresolved; waiting longer does not automatically
            trigger a refund.
          </p>
        </details>
        <details>
          <summary>
            Why are claiming and withdrawing separate steps?
            <span aria-hidden="true"></span>
          </summary>
          <p>
            Claiming exchanges a finalized position for its NEAR payout in your
            Hedgeveil balance. You can use that balance for another trade or
            request a withdrawal to your wallet. The withdrawal is a separate
            transfer and must be confirmed. A pending transfer is not proof that
            funds arrived, and should not be sent again while its result is
            unknown.
          </p>
        </details>
      </div>
    </section>
  );
}
