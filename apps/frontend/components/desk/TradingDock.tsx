"use client";
import Link from "next/link";
import {
  HaloTabs,
  HaloTabsList,
  HaloTabsTrigger,
  HaloTabsIndicator,
  HaloTabsContent,
} from "../ui/halo-tabs";
import { PositionRows } from "./PositionRows";
import { useDesk } from "./DeskProvider";
import { StateBadge } from "./TerminalPrimitives";
import { actionName } from "../../lib/desk-api";
import { terminalState, explorerUrl } from "../../lib/market-display";
export function TradingDock({ expert }: { expert: boolean }) {
  const d = useDesk();
  return (
    <section className="trading-dock" aria-label="Account workspace">
      <HaloTabs defaultValue="positions">
        <HaloTabsList aria-label="Account panels" activateOnFocus>
          <HaloTabsTrigger value="positions">Positions</HaloTabsTrigger>
          <HaloTabsTrigger value="orders">Orders</HaloTabsTrigger>
          <HaloTabsTrigger value="activity">Activity</HaloTabsTrigger>
          <HaloTabsIndicator />
        </HaloTabsList>
        <HaloTabsContent value="positions">
          <PositionRows expert={expert} />
        </HaloTabsContent>
        <HaloTabsContent value="orders">
          <p className="rail-note">
            Quotes are all-or-nothing and do not rest on an order book.
            Submitted trades appear below.
          </p>
          {d.records
            .filter(
              (r) =>
                r.intent.method === "fill_quote" &&
                r.attempted &&
                !terminalState(r.result?.state),
            )
            .map((r) => (
              <div className="dock-operation" key={r.intent.operation_id}>
                <span>Trade awaiting receipt</span>
                <StateBadge state={r.result?.state ?? "UNKNOWN"} />
                <Link href="/activity">Check receipt</Link>
              </div>
            ))}
        </HaloTabsContent>
        <HaloTabsContent value="activity">
          {!d.account ? (
            <p className="rail-note">Connect your wallet to view activity.</p>
          ) : !d.records.length ? (
            <p className="rail-note">No retained operations available.</p>
          ) : (
            d.records
              .slice(-8)
              .reverse()
              .map((r) => (
                <div className="dock-operation" key={r.intent.operation_id}>
                  <span>{actionName(r.intent.method)}</span>
                  <StateBadge
                    state={
                      r.result?.state ?? (r.attempted ? "UNKNOWN" : "PREPARED")
                    }
                  />
                  {explorerUrl(r.hash) ? (
                    <a
                      href={explorerUrl(r.hash)!}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Receipt
                    </a>
                  ) : (
                    <Link href="/activity">Details</Link>
                  )}
                </div>
              ))
          )}
          <Link className="dock-all" href="/activity">
            All activity
          </Link>
        </HaloTabsContent>
      </HaloTabs>
    </section>
  );
}
