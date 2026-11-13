import { Heading, Panel } from "./Elements";
export function Vault() {
  return (
    <>
      <Heading
        title="Tracking vault"
        copy="The options market is available separately from the tracking vault."
      />
      <Panel title="No deposits are open">
        <p>
          No tested strategy has passed the required economic selection gates.
          Vault subscriptions remain disabled.
        </p>
        <p>
          There is no advertised yield, guaranteed dollar balance or active
          automated strategy.
        </p>
        <a className="desk-button lime" href="/markets">
          Explore options
        </a>
      </Panel>
    </>
  );
}
