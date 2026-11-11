use hedgeveil_expiry_worker::calculate;
use std::io::{Read, Write};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    std::io::stdin()
        .take(65_000_001)
        .read_to_string(&mut input)?;
    if input.len() > 65_000_000 {
        return Err("INPUT_LIMIT".into());
    }
    #[cfg(not(target_os = "wasi"))]
    let evidence: hedgeveil_expiry_worker::Evidence = serde_json::from_str(&input)?;
    #[cfg(target_os = "wasi")]
    let evidence = fetch(serde_json::from_str(&input)?)?;
    let result = calculate(&evidence)?;
    #[cfg(not(target_os = "wasi"))]
    serde_json::to_writer(std::io::stdout(), &result)?;
    #[cfg(target_os = "wasi")]
    serde_json::to_writer(
        std::io::stdout(),
        &serde_json::json!({"calculation":result,"evidence":evidence}),
    )?;
    std::io::stdout().write_all(b"\n")?;
    Ok(())
}

#[cfg(target_os = "wasi")]
fn fetch(
    request: hedgeveil_expiry_worker::Request,
) -> Result<hedgeveil_expiry_worker::Evidence, Box<dyn std::error::Error>> {
    use hedgeveil_expiry_worker::{parse_page, uint, Evidence, Page, MAX_BODY, MAX_PAGES, WINDOW};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use wasi_http_client::Client;
    let now = u64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_micros())?;
    let end = request.end()?;
    if end > now {
        return Err("EXPIRY_NOT_REACHED".into());
    }
    let mut evidence = Evidence {
        request,
        pages: Vec::new(),
    };
    let mut cursor: Option<String> = None;
    let mut total = 0usize;
    for _ in 0..MAX_PAGES {
        let mut url =
            "https://api.exchange.coinbase.com/products/NEAR-USD/trades?limit=1000".to_string();
        if let Some(ref id) = cursor {
            uint(id)?;
            url.push_str("&after=");
            url.push_str(id);
        }
        let response = Client::new()
            .get(&url)
            .header("User-Agent", "Hedgeveil-expiry/1.0")
            .connect_timeout(Duration::from_secs(5))
            .send()?;
        if response.status() != 200 {
            return Err("HTTP_FAILURE".into());
        }
        let next = response
            .headers()
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("cb-after"))
            .map(|(_, v)| v.clone())
            .ok_or("CURSOR_MISSING")?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk(16384)? {
            if bytes.len() + chunk.len() > MAX_BODY {
                return Err("BODY_LIMIT".into());
            }
            bytes.extend(chunk);
        }
        let body = String::from_utf8(bytes)?;
        total += body.len();
        if total > hedgeveil_expiry_worker::MAX_EVIDENCE {
            return Err("EVIDENCE_LIMIT".into());
        }
        let rows = parse_page(&body)?;
        let received = u64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_micros())?;
        if rows[0].us > received {
            return Err("FUTURE_TRADE".into());
        }
        let done = rows.last().ok_or("PAGE_EMPTY")?.us <= end - WINDOW;
        evidence.pages.push(Page {
            after: cursor,
            next_after: next.clone(),
            body,
        });
        if done {
            return Ok(evidence);
        }
        cursor = Some(next);
    }
    Err("PAGE_LIMIT".into())
}
