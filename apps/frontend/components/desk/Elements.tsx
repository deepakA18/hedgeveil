"use client";
import {
  useEffect,
  useState,
  useRef,
  useId,
  type ReactNode,
  type FormEvent,
} from "react";
import { errorToast } from "./Feedback";
import { HaloButton } from "../ui/halo-button";
import { useDesk } from "./DeskProvider";
import { message } from "../../lib/desk-api";
import type { Series } from "../../lib/desk-types";
import { isOpen } from "../../lib/market-display";
export function Heading({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="desk-heading">
      <div>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"desk-panel " + className}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="desk-empty">
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function WalletGate({
  compact = false,
  description = "Connect to view your balances and account activity.",
}: {
  compact?: boolean;
  description?: string;
}) {
  const d = useDesk();
  return (
    <section
      className={`wallet-gate ${compact ? "wallet-gate-compact" : "wallet-gate-page"}`}
      aria-label="Connect your wallet"
    >
      <div className="wallet-gate-content">
        <h2>Connect your wallet</h2>
        <p>{description}</p>
        <button
          type="button"
          className="desk-button lime"
          aria-haspopup="dialog"
          aria-busy={!!d.connecting}
          disabled={!d.session || d.busy}
          onClick={d.connect}
        >
          {d.connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {d.connecting && <p role="status">Continue in {d.connecting}</p>}
      </div>
    </section>
  );
}
export function Form({
  children,
  onSubmit,
  label,
  disabled = false,
  editable = false,
  disabledReason,
  disabledDescriptionId,
}: {
  children: ReactNode;
  onSubmit: () => Promise<void>;
  label: string;
  disabled?: boolean;
  editable?: boolean;
  disabledReason?: string;
  disabledDescriptionId?: string;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null),
    hintId = useId();
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending || disabled) return;
    setPending(true);
    setError("");
    try {
      await onSubmit();
    } catch (e) {
      setError(message(e));
      errorToast(message(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="desk-form" onSubmit={submit} aria-busy={pending}>
      <fieldset disabled={pending || (disabled && !editable)}>
        {children}
      </fieldset>
      {error && (
        <p role="alert" className="desk-danger" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
      {disabledReason && (
        <p className="form-hint" id={hintId}>
          {disabledReason}
        </p>
      )}
      <HaloButton
        type="submit"
        className="cult-action"
        isLoading={pending}
        loadingText="Preparing…"
        aria-describedby={
          disabledDescriptionId ?? (disabledReason ? hintId : undefined)
        }
        disabled={disabled || pending}
      >
        {label}
      </HaloButton>
    </form>
  );
}
export function AmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="text"
        name={label.toLowerCase().replaceAll(" ", "-")}
        inputMode="decimal"
        pattern="[0-9]+([.][0-9]{1,24})?"
        title="Enter a decimal amount with up to 24 decimal places."
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder="0.00"
      />
    </label>
  );
}
export function useNow() {
  const { clock } = useDesk();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;
  return clock &&
    typeof performance !== "undefined" &&
    performance.now() - clock.receivedAt < 90000
    ? Math.floor(clock.serverMs + performance.now() - clock.receivedAt)
    : 0;
}
export function seriesStatus(s: Series, now: number) {
  return !now
    ? "Loading"
    : s.final_price !== null
      ? "Settled"
      : now && BigInt(s.config.maturity_ns) <= BigInt(now) * 1000000n
        ? "Awaiting settlement"
        : isOpen(s, now)
          ? "Open"
          : "Price averaging";
}
