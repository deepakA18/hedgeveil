export function Closing({ deskUrl }: { deskUrl: string }) {
  return (
    <section className="closing" aria-labelledby="closing-title">
      <div>
        <p className="eyebrow">A new perspective starts here</p>
        <h2 id="closing-title">
          Make room for
          <br /> your next move.
        </h2>
      </div>
      <div className="closing-action">
        <a className="button" href={deskUrl}>
          Explore the app
        </a>
        <p>Take a look. Get familiar. Go at your pace.</p>
      </div>
    </section>
  );
}
