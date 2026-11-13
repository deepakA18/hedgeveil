import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/home/SiteFooter";
import { ThemeToggle } from "../../components/ThemeProvider";
import { StatusPage } from "../../components/status/StatusPage";
import "./status.css";
export const metadata: Metadata = { title: "System status | Hedgeveil" };
export default function Page() {
  return (
    <div className="status-layout">
      <a className="skip" href="#status-main">
        Skip to service status
      </a>
      <header className="status-header">
        <Link href="/" className="wordmark">
          hedgeveil
        </Link>
        <nav aria-label="Status navigation">
          <Link href="/trade">Back to app</Link>
          <ThemeToggle />
        </nav>
      </header>
      <StatusPage />
      <SiteFooter workspace />
    </div>
  );
}
