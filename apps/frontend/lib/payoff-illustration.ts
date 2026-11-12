export type PayoffSide = "upside" | "capped";

// Dimensionless illustration only: strike = 1, backing = 1. This does not
// value a trade or calculate transaction amounts; those use exact SDK units.
export function payoffPath(side: PayoffSide): string {
  return Array.from({ length: 381 }, (_, index) => {
    const price = 0.2 + index / 100;
    const capped = Math.min(1, 1 / price);
    const payout = side === "capped" ? capped : 1 - capped;
    const x = 54 + (index / 380) * 544;
    const y = 220 - payout * 172;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}
