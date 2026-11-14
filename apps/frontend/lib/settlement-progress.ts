import type { IndexState, Series } from "./desk-types";

// Operational observations never decide finality, balances or retry authority.
export function settlementProgress(
  state: IndexState | null,
  series: Series,
  now: number,
) {
  const data = state?.settlement;
  const item = data?.items.find((i) => i.series_id === series.config.series_id);
  const attempts = (data?.attempts ?? [])
    .filter((a) => a.series_id === series.config.series_id)
    .toSorted((a, b) => a.requested_ns.localeCompare(b.requested_ns));
  const age = item?.observed_at ? now - Date.parse(item.observed_at) : Infinity;
  const fresh = Number.isFinite(age) && age >= 0 && age <= 90000;
  const final = series.final_price !== null;
  const labels: Record<string, string> = {
    WAIT_CALLBACK: "Awaiting delivery",
    WAIT_DELIVERY_RETRY_BACKOFF: "Waiting to retry",
    DELIVERY_RETRY_REVIEW_REQUIRED: "Retry needs review",
    EVIDENCE_REJECTED_REVIEW_REQUIRED: "Evidence needs review",
    DELIVERY_RETRY_CAP_REACHED: "Retry limit reached",
    DELIVERY_RETRY_WINDOW_CLOSED: "Retry authorization ended",
    HALTED_TRANSACTION: "Receipt unresolved",
    HALTED_SIGNER: "Receipt recovery pending",
    KEEPER_ERROR: "Settlement check unavailable",
    PAUSED: "Settlement paused",
    TRANSACTION_CONFIRMED: "Checking settlement",
    WAIT_OBSERVED_STATE: "Checking settlement",
  };
  const next = item?.next_attempt_ns;
  const nextNs =
    !final &&
    fresh &&
    item?.state === "WAIT_DELIVERY_RETRY_BACKOFF" &&
    next &&
    /^\d+$/.test(next) &&
    BigInt(next) > BigInt(Math.floor(now)) * 1000000n
      ? next
      : null;
  const count =
    Number.isInteger(item?.attempt) && item!.attempt! >= 0
      ? item!.attempt
      : null;
  const cap =
    Number.isInteger(item?.max_attempts) && item!.max_attempts! >= (count ?? 0)
      ? item!.max_attempts
      : null;
  return {
    label: final
      ? "Finalized"
      : !fresh
        ? "Settlement status updating"
        : (labels[item!.state] ?? "Awaiting settlement"),
    attempt: count,
    cap,
    nextNs,
    attempts,
    stopped:
      !final &&
      fresh &&
      [
        "DELIVERY_RETRY_CAP_REACHED",
        "DELIVERY_RETRY_WINDOW_CLOSED",
        "DELIVERY_RETRY_REVIEW_REQUIRED",
        "EVIDENCE_REJECTED_REVIEW_REQUIRED",
      ].includes(item!.state),
  };
}
