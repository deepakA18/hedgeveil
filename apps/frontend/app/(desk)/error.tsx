"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="desk-panel">
      <h1>This view could not load.</h1>
      <p>
        No action will be resent automatically. Reload the view, or open
        Activity to check an existing signing attempt.
      </p>
      <div className="desk-actions">
        <button className="desk-button lime" onClick={reset}>
          Try again
        </button>
        <a className="desk-button" href="/activity">
          Open Activity
        </a>
      </div>
    </section>
  );
}
