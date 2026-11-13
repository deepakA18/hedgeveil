export type ReceiptResult = { state?: string; hash?: string; reason?: string };
export function receiptFeedback(result: ReceiptResult) {
  if (result.state === "QUOTE_EXPIRED_UNFILLED")
    return {
      type: "info",
      title: "Offer expired without a fill",
      description:
        "Verified on chain. Request a fresh offer to trade. Any transaction gas is separate.",
      timeout: 0,
    };
  if (["SUCCEEDED", "WITHDRAWAL_SUCCEEDED"].includes(result.state ?? ""))
    return {
      type: "success",
      title: "Transaction confirmed",
      description: "Verified by finalized receipts.",
      timeout: 8000,
    };
  if (
    ["FAILED_CONFIRMED", "WITHDRAWAL_FAILED_CONFIRMED"].includes(
      result.state ?? "",
    )
  )
    return {
      type: "error",
      title: "Transaction failed",
      description:
        "Failure confirmed by receipts. View the transaction for details.",
      timeout: 0,
    };
  if (result.state === "PENDING")
    return {
      type: "loading",
      title: "Waiting for confirmation",
      description: "Checking receipts. Do not send this transaction again.",
      timeout: 0,
    };
  return {
    type: "warning",
    title: "Transaction needs verification",
    description:
      "The outcome is not yet verified. Recover it in Activity; do not resend.",
    timeout: 0,
  };
}
