import { SiteHeader } from "../components/home/SiteHeader";
import { SiteFooter } from "../components/home/SiteFooter";
import { Hero } from "../components/home/Hero";
import { Principles } from "../components/home/Principles";
import { Problem } from "../components/home/Problem";
import { Actions } from "../components/home/Actions";
import { Comparison } from "../components/home/Comparison";
import { Questions } from "../components/home/Questions";
import { Closing } from "../components/home/Closing";
import { getDeskUrl } from "../lib/config";

export default function HomePage() {
  const deskUrl = getDeskUrl();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="page-shell">
        <SiteHeader deskUrl={deskUrl} />
        <main id="main">
          <Hero deskUrl={deskUrl} />
          <Principles />
          <Problem />
          <Actions deskUrl={deskUrl} />
          <Comparison />
          <Questions />
          <Closing deskUrl={deskUrl} />
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
