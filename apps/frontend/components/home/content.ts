// Approved homepage copy. No market values or transaction fixtures.
export const actions = [
  [
    "Buy the upside",
    "If NEAR finishes above your chosen price.",
    "Your payout depends on how far the final reference price is above the trade’s set price. At or below that price, this position pays nothing.",
    "Any payout in NEAR, after the result is confirmed.",
    "A payout is not the same as profit. Subtract what you paid and the fees.",
  ],
  [
    "Choose capped exposure",
    "Follow NEAR’s value, up to a limit.",
    "At the final reference price, this position’s dollar value follows NEAR up to the trade’s cap. Above the cap, that dollar value stops rising. It is paid in NEAR.",
    "A NEAR payout whose reference dollar value is capped.",
    "This is not a put or a guaranteed dollar balance. If NEAR falls, the position’s dollar value falls too.",
  ],
  [
    "Manage your position",
    "Choose when to request an exit.",
    "Ask for an offer to sell before the end date. If a buyer is available and you accept, sign the sale in your wallet. Otherwise, hold until the result is confirmed and claim any payout.",
    "NEAR from a completed sale or a confirmed payout.",
    "Early sales are not guaranteed. Missing price data can delay a payout, and withdrawing to your wallet is a separate action.",
  ],
] as const;

export const payoffCopy = {
  upside: [
    "Upside payout in NEAR",
    "Zero at or below the set price. Above it, the payout rises towards one unit of NEAR per unit of backing.",
    "Pays above the set price. At or below it, the payout is zero.",
  ],
  capped: [
    "Capped-value payout in NEAR",
    "One unit of NEAR per unit of backing at or below the cap. Above the cap, the NEAR amount decreases as the final reference price rises.",
    "Below the cap, the NEAR amount stays constant while its dollar value falls with NEAR. Above it, the NEAR amount decreases.",
  ],
} as const;
