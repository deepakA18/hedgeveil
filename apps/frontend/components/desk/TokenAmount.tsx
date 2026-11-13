"use client";
import { useId, useState } from "react";
import { amountDisplay } from "../../lib/amount-display";

export function TokenAmount({
  value,
  unit = "NEAR",
  label = "Amount",
}: {
  value: unknown;
  unit?: string;
  label?: string;
}) {
  const { text, exact } = amountDisplay(value);
  const [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  const id = useId();
  if (exact === null)
    return (
      <span className="amount-missing" aria-label={`${label} unavailable`}>
        —
      </span>
    );
  return (
    <span className="token-amount">
      <button
        type="button"
        className="amount-trigger"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}: ${exact}${unit ? " " + unit : ""}. Show exact amount`}
        onClick={() => {
          setOpen(!open);
          setCopied(false);
          setFailed(false);
        }}
      >
        <span className="amount-number">{text}</span>
        {unit && <small>{unit}</small>}
      </button>
      {open && (
        <span id={id} className="amount-exact">
          <span>Exact amount</span>
          <code>
            {exact}
            {unit ? " " + unit : ""}
          </code>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(exact);
                setCopied(true);
                setFailed(false);
              } catch {
                setFailed(true);
              }
            }}
          >
            {copied ? "Copied" : "Copy exact amount"}
          </button>
          <span role="status">
            {failed
              ? "Copy unavailable. Select the exact amount above."
              : copied
                ? "Exact amount copied."
                : ""}
          </span>
        </span>
      )}
    </span>
  );
}
