"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
const KEY = "hedgeveil.trade-tour.v2";
let dismissedThisSession = false;

export function TradeTour({
  hasOpenMarkets,
  mobile,
  ready,
}: {
  hasOpenMarkets: boolean;
  mobile: boolean;
  ready: boolean;
}) {
  const [step, setStep] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!ready || started.current || dismissedThisSession) return;
    try {
      if (localStorage.getItem(KEY) === "seen") return;
    } catch {
      /* Session fallback below. */
    }
    const timer = window.setTimeout(() => {
      if (document.querySelector('dialog[open], [role="dialog"]')) return;
      started.current = true;
      setStep(0);
    }, 600);
    return () => clearTimeout(timer);
  }, [ready]);
  const steps = [
    {
      target: ".desk-wallet",
      anchor: ".desk-wallet",
      side: "bottom" as const,
      title: "Connect, then add trading funds",
      body: "Use Connect wallet to choose your account. Manage funds opens account setup and deposits. Your first deposit needs two approvals: account storage, then trading funds. Keep some NEAR in your wallet for fees.",
    },
    {
      target: ".series-rail",
      anchor: ".series-rail .region-heading",
      side: mobile ? ("bottom" as const) : ("right" as const),
      title: "Choose a price and end date",
      body: hasOpenMarkets
        ? "Choose a market from Open now. Its set price and end date determine when and how it pays. History shows markets that have already ended."
        : "There are no open markets right now. The list shows history so you can explore past payouts. You cannot buy an ended market; a new live market is needed to trade.",
    },
    {
      target: ".trade-controls",
      anchor: ".trade-controls",
      side: "bottom" as const,
      title: "Choose the position you want",
      body: "NEAR upside pays if the final reference price is above the set price. Capped value follows NEAR's dollar value up to that price. It does not protect you from a fall in NEAR. Either purchased position can lose its full cost, plus fees.",
    },
    {
      target: ".scenario-chart",
      anchor: ".scenario-chart .panel-top",
      side: "bottom" as const,
      title: "See what different prices would pay",
      body: "Move over the graph, tap it, or use the arrow keys to explore. Switch USD / NEAR to change the display. Payout is not profit: your purchase cost matters. For a settled market, exploration is hypothetical and its actual payout stays fixed.",
    },
    {
      target: mobile ? ".mobile-ticket-launch" : ".terminal-ticket",
      anchor: mobile
        ? ".mobile-ticket-launch"
        : ".terminal-ticket .region-heading",
      side: mobile ? ("top" as const) : ("left" as const),
      title: "Check the cost before signing",
      body: "On an open market, enter a quantity and request an offer. Check total cost, maximum loss and expiry, then review the exact trade in your wallet. An offer can expire or lose available inventory before it fills. No offer means no trade.",
    },
    {
      target: ".trading-dock",
      anchor: ".trading-dock",
      side: "top" as const,
      title: "Track your position and your receipt",
      body: "Positions shows what you hold. Activity shows whether an action is confirmed or still unresolved. Sell only when an offer is available, merge matching pairs before finalization, or claim after settlement. Portfolio also leads to withdrawals. Never repeat an unresolved payment.",
    },
  ];
  const current = step === null ? null : steps[step];
  const target = current?.target;
  const anchorSelector = current?.anchor;
  useLayoutEffect(() => {
    if (!target || !anchorSelector) {
      setAnchor(null);
      return;
    }
    const element = document.querySelector<HTMLElement>(target);
    const nextAnchor = document.querySelector<HTMLElement>(anchorSelector);
    element?.setAttribute("data-tour-active", "true");
    nextAnchor?.scrollIntoView({ block: "center", behavior: "instant" });
    setAnchor(nextAnchor);
    const frame = requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(frame);
      element?.removeAttribute("data-tour-active");
    };
  }, [target, anchorSelector]);
  function close() {
    dismissedThisSession = true;
    setStep(null);
    try {
      localStorage.setItem(KEY, "seen");
    } catch {
      /* No repeated prompt during this session. */
    }
  }
  if (step === null || !current) return null;
  return (
    <Popover.Root
      open={!!anchor}
      modal="trap-focus"
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Popover.Portal>
        <Popover.Backdrop className="tour-backdrop" />
        <Popover.Positioner
          anchor={anchor}
          positionMethod="fixed"
          side={current.side}
          align="start"
          sideOffset={12}
          collisionPadding={12}
          className="tour-positioner"
        >
          <Popover.Popup
            className="trade-tour"
            aria-label="Quick tour"
            initialFocus={heading}
            finalFocus={() =>
              anchor?.querySelector<HTMLElement>(
                "button:not(:disabled), a[href], input:not(:disabled)",
              ) ?? document.querySelector<HTMLElement>(".desk-wallet button")
            }
          >
            <p className="tour-progress">
              Step {step + 1} of {steps.length}
            </p>
            <Popover.Title render={<h3 ref={heading} tabIndex={-1} />}>
              {current.title}
            </Popover.Title>
            <Popover.Description className="tour-copy">
              {current.body}
            </Popover.Description>
            <div className="tour-controls">
              <Popover.Close onClick={close}>Skip tour</Popover.Close>
              <div>
                <button
                  type="button"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="tour-next"
                  onClick={() =>
                    step === steps.length - 1 ? close() : setStep(step + 1)
                  }
                >
                  {step === steps.length - 1 ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
