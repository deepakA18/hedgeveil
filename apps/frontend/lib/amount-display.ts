import { formatNear } from "../../../packages/sdk/amounts.mjs";

// Display-only. No live USD price is available here, so summaries use four
// decimal places and mark lost precision. Inputs and signing keep exact units.
export function amountDisplay(
  value: unknown,
  precision: 4 | 6 = 4,
): {
  text: string;
  exact: string | null;
} {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,38})$/.test(value))
    return { text: "—", exact: null };
  const atomic = BigInt(value);
  if (atomic > (1n << 128n) - 1n) return { text: "—", exact: null };
  const exact = formatNear(value);
  if (atomic === 0n) return { text: "0", exact };
  const [whole, fraction = ""] = exact.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = fraction.slice(0, precision).replace(/0+$/, "");
  const hidden = /[1-9]/.test(fraction.slice(precision));
  if (whole === "0" && !tail && hidden)
    return { text: precision === 6 ? "<0.000001" : "<0.0001", exact };
  return {
    text: (hidden ? "≈ " : "") + grouped + (tail ? "." + tail : ""),
    exact,
  };
}
