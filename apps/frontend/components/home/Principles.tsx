export function Principles() {
  return (
    <div className="principles" aria-label="At a glance">
      <p>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h15v14H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12v3M16 11h5v5h-5z" />
        </svg>
        Your wallet. Your decision.
      </p>
      <p>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m3 3 9 1 9 9-8 8-9-9-1-9Z" />
          <circle cx="8" cy="8" r="1" />
        </svg>
        See the cost before you trade.
      </p>
      <p>
        <span className="near-word" aria-hidden="true">
          N
        </span>
        Built on NEAR.
      </p>
    </div>
  );
}
