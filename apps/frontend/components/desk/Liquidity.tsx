"use client";
import { useState } from "react";
import { TokenAmount } from "./TokenAmount";
import { useDesk } from "./DeskProvider";
import { Heading, Panel, Empty, Form } from "./Elements";
import { shortAccount } from "../../lib/desk-api";
export function Liquidity() {
  const d = useDesk(),
    [action, setAction] = useState("cancel_quote"),
    [value, setValue] = useState("");
  const snapshot = d.state?.items.find(
    (x) => x.contract === d.session?.contract_id,
  )?.body;
  const own = snapshot?.markets?.[d.account];
  return (
    <>
      <Heading
        title="How pricing works"
        copy="Makers quote when you ask. There is no continuous order book or guaranteed exit."
      />
      <div className="desk-notice">
        The current makers are operated by the project. These accounts are
        funded with test assets, not independent market demand.
      </div>
      <details className="desk-details">
        <summary>Positions, units and model marks</summary>
        <p>
          Each unit is one claim from a pair backed by 1 NEAR. Upside pays above
          the set price; capped value follows NEAR up to that price in dollar
          terms. Neither is a guaranteed dollar deposit.
        </p>
        <p>
          Model marks are read-only estimates from external market inputs. They
          exclude maker spread, fees and gas and cannot be signed or filled.
          Only a funded, signed offer is executable. The legacy terminal-price
          model is an approximation for sampled settlement; the new 30-minute
          profile remains unavailable until its aligned model passes acceptance.
        </p>
        <p>
          Final settlement rows show actual recorded payout coefficients, not
          offers to trade.
        </p>
      </details>
      <div className="desk-two">
        {!d.session?.accounts.length ? (
          <Panel title="Makers">
            <Empty title="Maker information is unavailable.">
              <p>Refresh when the service is ready.</p>
            </Empty>
          </Panel>
        ) : (
          d.session.accounts
            .filter((a) => a.role === "maker")
            .map((a, i) => {
              const balance = snapshot?.accounts?.[a.id],
                market = snapshot?.markets?.[a.id];
              return (
                <Panel key={a.id} title={"Maker " + (i + 1)}>
                  <p className="desk-muted" title={a.id}>
                    {shortAccount(a.id)}
                  </p>
                  <div className="liquidity-amount">
                    <span>Available collateral</span>
                    <strong>
                      <TokenAmount
                        value={balance?.free}
                        label="Maker collateral"
                      />
                    </strong>
                  </div>
                  <p>
                    Quotes depend on current market inputs, available inventory
                    and active signing authorization.
                  </p>
                  <details className="desk-details">
                    <summary>Account and inventory</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          account: a.id,
                          inventory: balance ?? null,
                          market: market ?? null,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </Panel>
              );
            })
        )}
      </div>
      {own && (
        <Panel title="Your maker authorization">
          <Form
            disabled={d.busy || !d.ready}
            label="Review authorization change"
            onSubmit={() =>
              d.review({
                method: action,
                args:
                  action === "cancel_quote"
                    ? { nonce: value }
                    : action === "advance_quote_epoch"
                      ? { epoch: value }
                      : { key_id: value },
              })
            }
          >
            <label>
              Action
              <select
                value={action}
                onChange={(e) => {
                  setAction(e.target.value);
                  setValue("");
                }}
              >
                <option value="cancel_quote">Cancel a quote nonce</option>
                <option value="advance_quote_epoch">
                  Invalidate earlier quote epochs
                </option>
                <option value="revoke_signing_key">Revoke a signing key</option>
              </select>
            </label>
            <label>
              {action === "cancel_quote"
                ? "Nonce"
                : action === "advance_quote_epoch"
                  ? "Next epoch"
                  : "Signing key ID"}
              <input
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          </Form>
          <p className="desk-muted">
            Revocation is permanent for this key ID. Changing the epoch does not
            stop your worker from issuing new quotes.
          </p>
        </Panel>
      )}
    </>
  );
}
