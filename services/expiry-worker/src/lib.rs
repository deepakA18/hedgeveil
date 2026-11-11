use chrono::DateTime;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
pub const POLICY: &str = "COINBASE_NEAR_USD_TRADE_TWAP_V1";
pub const WINDOW: u64 = 1_800_000_000;
pub const MAX_AGE: u64 = 60_000_000;
pub const MAX_PAGES: usize = 64;
pub const MAX_BODY: usize = 1_000_000;
pub const MAX_EVIDENCE: usize = 2_000_000;
pub const SCALE: u128 = 1_000_000_000_000;
pub type Result<T> = std::result::Result<T, String>;
#[cfg(test)]
mod tests;

#[derive(Deserialize, Serialize, Debug, Clone)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub expiry_seconds: String,
}
impl Request {
    pub fn end(&self) -> Result<u64> {
        let end = uint(&self.expiry_seconds)?
            .checked_mul(1_000_000)
            .ok_or("TIME_OVERFLOW")?;
        if end < WINDOW {
            return Err("WINDOW_UNDERFLOW".into());
        }
        Ok(end)
    }
}
pub fn uint(s: &str) -> Result<u64> {
    if s.is_empty() || (s.len() > 1 && s.starts_with('0')) || !s.bytes().all(|b| b.is_ascii_digit())
    {
        return Err("INTEGER_FORMAT".into());
    }
    s.parse().map_err(|_| "INTEGER_RANGE".into())
}
pub fn price(s: &str) -> Result<u128> {
    let mut parts = s.split('.');
    let whole = uint(parts.next().ok_or("PRICE_FORMAT")?)? as u128;
    let fraction = parts.next();
    if parts.next().is_some() {
        return Err("PRICE_FORMAT".into());
    }
    let mut n = whole.checked_mul(SCALE).ok_or("PRICE_RANGE")?;
    if let Some(f) = fraction {
        if f.is_empty() || f.len() > 12 || !f.bytes().all(|b| b.is_ascii_digit()) {
            return Err("PRICE_PRECISION".into());
        }
        n += f.parse::<u128>().map_err(|_| "PRICE_FORMAT")? * 10u128.pow(12 - f.len() as u32);
    }
    if n == 0 || n > 1_000_000 * SCALE {
        return Err("PRICE_RANGE".into());
    }
    Ok(n)
}
#[derive(Deserialize)]
struct WireTrade {
    trade_id: u64,
    time: String,
    price: String,
}
#[derive(Debug, Clone)]
pub struct Trade {
    pub id: u64,
    pub us: u64,
    pub price: u128,
}
pub fn parse_page(body: &str) -> Result<Vec<Trade>> {
    if body.len() > MAX_BODY {
        return Err("BODY_LIMIT".into());
    }
    let wire: Vec<WireTrade> = serde_json::from_str(body).map_err(|_| "TRADE_FORMAT")?;
    if wire.is_empty() || wire.len() > 1000 {
        return Err("PAGE_SIZE".into());
    }
    let rows: Vec<Trade> = wire
        .into_iter()
        .map(|r| {
            if !r.time.ends_with('Z') {
                return Err("TIME_ZONE".into());
            }
            let t = DateTime::parse_from_rfc3339(&r.time).map_err(|_| "TRADE_TIME")?;
            if t.timestamp() < 0
                || t.timestamp_subsec_nanos() % 1000 != 0
                || t.timestamp_subsec_nanos() >= 1_000_000_000
            {
                return Err("TIME_PRECISION".into());
            }
            Ok(Trade {
                id: r.trade_id,
                us: u64::try_from(t.timestamp_micros()).map_err(|_| "TIME_RANGE")?,
                price: price(&r.price)?,
            })
        })
        .collect::<Result<_>>()?;
    validate_order(&rows)?;
    Ok(rows)
}
fn validate_order(rows: &[Trade]) -> Result<()> {
    for p in rows.windows(2) {
        if p[0].id.checked_sub(1) != Some(p[1].id) {
            return Err("TRADE_ID_GAP".into());
        }
        if p[0].us < p[1].us {
            return Err("TRADE_TIME_ORDER".into());
        }
    }
    Ok(())
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Page {
    pub after: Option<String>,
    pub next_after: String,
    pub body: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Evidence {
    pub request: Request,
    pub pages: Vec<Page>,
}
#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Calculation {
    pub policy: String,
    pub product: String,
    pub start_us: String,
    pub end_us: String,
    pub price_scale: String,
    pub price: String,
    pub weighted_sum: String,
    pub predecessor_id: String,
    pub successor_id: String,
    pub evidence_sha256: String,
}
pub fn calculate(e: &Evidence) -> Result<Calculation> {
    let end = e.request.end()?;
    let start = end - WINDOW;
    if e.pages.is_empty() || e.pages.len() > MAX_PAGES {
        return Err("PAGE_LIMIT".into());
    }
    let mut all = Vec::new();
    let mut cursor = None;
    let mut total = 0usize;
    for (i, p) in e.pages.iter().enumerate() {
        total = total.checked_add(p.body.len()).ok_or("EVIDENCE_LIMIT")?;
        if total > MAX_EVIDENCE {
            return Err("EVIDENCE_LIMIT".into());
        }
        if p.after != cursor {
            return Err("CURSOR_CHAIN".into());
        }
        let rows = parse_page(&p.body)?;
        if uint(&p.next_after)? != rows.last().ok_or("PAGE_EMPTY")?.id {
            return Err("CURSOR_VALUE".into());
        }
        if i + 1 < e.pages.len() && rows.last().ok_or("PAGE_EMPTY")?.us <= start {
            return Err("EXTRA_PAGES".into());
        }
        cursor = Some(p.next_after.clone());
        all.extend(rows);
    }
    validate_order(&all)?;
    let predecessor = all.iter().find(|r| r.us <= start).ok_or("MISSING_START")?;
    let successor = all
        .iter()
        .rev()
        .find(|r| r.us >= end)
        .ok_or("MISSING_END")?;
    let mut effective = predecessor;
    let mut at = start;
    let mut sum = 0u128;
    for r in all
        .iter()
        .rev()
        .filter(|r| r.id > predecessor.id && r.us < end)
    {
        add_interval(&mut sum, effective, at, r.us)?;
        effective = r;
        at = r.us;
    }
    add_interval(&mut sum, effective, at, end)?;
    let bytes = serde_json::to_vec(e).map_err(|_| "EVIDENCE_ENCODING")?;
    Ok(Calculation {
        policy: POLICY.into(),
        product: "NEAR-USD".into(),
        start_us: start.to_string(),
        end_us: end.to_string(),
        price_scale: SCALE.to_string(),
        price: (sum / WINDOW as u128).to_string(),
        weighted_sum: sum.to_string(),
        predecessor_id: predecessor.id.to_string(),
        successor_id: successor.id.to_string(),
        evidence_sha256: format!("{:x}", Sha256::digest(bytes)),
    })
}
fn add_interval(sum: &mut u128, r: &Trade, start: u64, end: u64) -> Result<()> {
    if end < start || start < r.us {
        return Err("INTERVAL_ORDER".into());
    }
    if end - r.us > MAX_AGE {
        return Err("STALE_TRADE".into());
    }
    *sum = sum
        .checked_add(
            r.price
                .checked_mul((end - start) as u128)
                .ok_or("MATH_OVERFLOW")?,
        )
        .ok_or("MATH_OVERFLOW")?;
    Ok(())
}
