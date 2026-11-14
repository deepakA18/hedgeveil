import {
  parseNear as parse,
  formatNear as format,
} from "../../../packages/sdk/amounts.mjs";
import { errorText, stateText } from "../../web/public/model.mjs";
export const parseNear = parse as (text: string) => string;
export const formatNear = format as (atomic: string) => string;
export const claimName = (kind: string) =>
  kind === "N" ? "Upside" : kind === "P" ? "Capped value" : "NEAR";
export const shortAccount = (s: string) =>
  s.length > 25 ? s.slice(0, 10) + "…" + s.slice(-8) : s;
export function dollars(value: string) {
  const n = BigInt(value),
    q = 10n ** 12n;
  return (
    "$" +
    String(n / q) +
    (n % q
      ? "." +
        String(n % q)
          .padStart(12, "0")
          .replace(/0+$/, "")
      : "")
  );
}
export function dateLabel(ns: string) {
  return (
    new Date(Number(BigInt(ns) / 1000000n)).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC"
  );
}
export function message(e: unknown) {
  const code = e instanceof Error ? e.message : "SERVICE_UNAVAILABLE";
  return (
    (errorText as Record<string, string>)[code] ??
    (
      {
        OPERATION_LIMIT:
          "Your activity record limit has been reached. Existing operations remain recoverable; contact support before creating more.",
        AUTH_REQUIRED: "Verify wallet ownership to access your operations.",
        OWNER_MISMATCH: "Verify the selected wallet account before continuing.",
        AUTH_INVALID:
          "Wallet verification expired or did not match. Verify again.",
        RATE_LIMITED:
          "Too many requests. Wait a minute before trying again. Nothing was resent.",
        SERVICE_UNAVAILABLE:
          "The service is unavailable. Try refreshing. No action will be resent.",
        WALLET_RESPONSE_UNAVAILABLE:
          "The wallet response is uncertain. Check Activity before trying another action.",
        WALLET_ACCOUNT: "Connect a wallet and choose an account.",
        WALLET_CHANGED:
          "The wallet account changed. Review again using your selected account.",
        DEPLOYMENT_NOT_CONFIGURED:
          "The deployment is not configured. Trading is unavailable.",
        QUOTE_EXPIRED: "This offer expired. Request a fresh offer.",
        WALLET_CONNECTION_FAILED:
          "Wallet connection did not complete. You can try again.",
      } as Record<string, string>
    )[code] ??
    "This action could not be completed. Check Activity for any retained attempt before trying again."
  );
}
export const operationText = (state: string) =>
  (stateText as Record<string, string>)[state] ??
  "Unresolved. Check receipts; do not repeat the action.";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api/desk/" + path, {
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await r.json();
  if (
    ["AUTH_REQUIRED", "OWNER_MISMATCH"].includes(data.error) &&
    typeof window !== "undefined"
  )
    window.dispatchEvent(new Event("hedgeveil:verify-wallet"));
  if (!r.ok || data.error) throw Error(data.error ?? "SERVICE_UNAVAILABLE");
  return data as T;
}

export const actionName = (method: string) =>
  (
    ({
      storage_deposit: "Register or add storage",
      deposit_collateral: "Add trading funds",
      request_withdrawal: "Withdraw NEAR",
      fill_quote: "Trade positions",
      redeem: "Claim a settled payout",
      merge: "Combine a matching pair",
      split: "Create a backed pair",
      close_ticket: "Close a completed withdrawal record",
      cancel_quote: "Cancel a quote",
      advance_quote_epoch: "Invalidate earlier quotes",
      revoke_signing_key: "Revoke a maker signing key",
    }) as Record<string, string>
  )[method] ?? method.replaceAll("_", " ");
