"use client";
import { InfoPopover } from "./InfoPopover";
import { useDesk } from "./DeskProvider";
import { useNow } from "./Elements";
import { freshSpot, usdText, usdValue } from "../../lib/market-display";
export function SpotPrice() {
  const { spot } = useDesk(),
    now = useNow();
  return (
    <div className="spot-price">
      <span className="label-with-help">
        NEAR / USD{" "}
        <InfoPopover label="NEAR price">
          {freshSpot(spot, now)
            ? `Indicative price from Coinbase Exchange, observed ${Math.max(0, Math.floor((now - Date.parse(spot.observedAt)) / 1000))} seconds ago. `
            : "No fresh market observation is available. "}
          Used for display estimates, not the settlement price. Estimates are
          hidden when the observation is stale.
        </InfoPopover>
      </span>
      <strong>
        {freshSpot(spot, now)
          ? usdText(BigInt(spot.price))
          : "Price unavailable"}
      </strong>
    </div>
  );
}
export function UsdEstimate({ amount }: { amount: string | undefined }) {
  const { spot } = useDesk(),
    now = useNow();
  return (
    <small>
      {amount && freshSpot(spot, now)
        ? "≈ " +
          usdText(usdValue(BigInt(amount), BigInt(spot.price))) +
          " at current spot"
        : "USD estimate unavailable"}
    </small>
  );
}
