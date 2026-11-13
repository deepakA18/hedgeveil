"use client";
import { InfoPopover } from "./InfoPopover";
import { useDesk } from "./DeskProvider";
import { Num } from "./TerminalPrimitives";
export function BalanceGrid({ compact = false }: { compact?: boolean }) {
  const d = useDesk(),
    b = d.live?.accounts[d.account],
    tickets = d.live?.tickets;
  const pending = tickets
    ?.filter((t) => !["SUCCEEDED", "FAILED_CONFIRMED"].includes(t.state))
    .reduce((a, t) => a + BigInt(t.amount), 0n);
  return (
    <dl
      className={"balance-grid " + (compact ? "compact" : "")}
      aria-label="Separate account balances"
    >
      <div>
        <dt className="label-with-help">
          Available to trade{" "}
          <InfoPopover label="Trading balance">
            Deposited NEAR available for trades or withdrawal. This is separate
            from your wallet balance, storage funds and pending withdrawals.
          </InfoPopover>
        </dt>
        <dd>
          <Num value={b?.free} />
        </dd>
      </div>
      <div>
        <dt className="label-with-help">
          Quote reserves{" "}
          <InfoPopover label="Quote reserves">
            Requesting an offer does not reserve your funds or the maker’s
            inventory. The contract checks both again during execution.
          </InfoPopover>
        </dt>
        <dd>Not reserved</dd>
      </div>
      {!compact && (
        <>
          <div>
            <dt>Storage paid</dt>
            <dd>
              <Num value={b?.storage_paid} />
            </dd>
          </div>
          <div>
            <dt>Storage required</dt>
            <dd>
              <Num value={d.live?.storage.account_minimum} />
            </dd>
          </div>
          <div>
            <dt>Wallet balance</dt>
            <dd>
              <Num value={d.live?.native.amount} />
            </dd>
            <small>Before storage and gas</small>
          </div>
        </>
      )}
      <div>
        <dt>Pending withdrawals</dt>
        <dd>
          <Num value={pending} />
        </dd>
      </div>
    </dl>
  );
}
