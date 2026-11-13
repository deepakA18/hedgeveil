export function SiteFooter({ workspace = false }: { workspace?: boolean }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <nav aria-label="Footer">
          <a
            href="https://github.com/deepakA18/hedgeveil/blob/HEAD/README.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs
          </a>
          <a href="/#questions">FAQs</a>
          <a href="/liquidity">How pricing works</a>
        </nav>
        <div className="footer-meta">
          {workspace && <span>Test assets. Production disabled</span>}
          <a href="https://near.org" target="_blank" rel="noopener noreferrer">
            NEAR
          </a>
          <a
            href="https://github.com/deepakA18/hedgeveil"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
