import { ThemeToggle } from "../ThemeProvider";
export function SiteHeader({ deskUrl }: { deskUrl: string }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Hedgeveil home">
        <svg className="brand-mark" viewBox="0 0 32 40" aria-hidden="true">
          <path
            d="M3 8 13 2v15l13-7v24l-10 6V25l-3 2v8L3 40Z"
            fill="currentColor"
          />
        </svg>
        hedgeveil
      </a>
      <nav aria-label="Main navigation">
        <a href="#problem">The problem</a>
        <a href="#what-you-can-do">What you can do</a>
        <a href="#comparison">Why Hedgeveil</a>
      </nav>
      <ThemeToggle />
      <a className="button button-small" href={deskUrl}>
        Explore the app
      </a>
    </header>
  );
}
