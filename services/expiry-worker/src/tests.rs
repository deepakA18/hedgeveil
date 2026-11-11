use super::*;
use serde_json::{json, Value};
fn data() -> Evidence {
    let rows:Vec<_>=(0..=60).rev().map(|i|json!({"trade_id":i+1,"time":format!("1970-01-01T00:{:02}:{:02}.000000Z",30+i/2,if i%2==0{0}else{30}),"price":if i<30{"2.00000000"}else{"4.00000000"}})).collect();
    // Last timestamp must be 01:00, not 00:60.
    let mut rows = rows;
    rows[0]["time"] = json!("1970-01-01T01:00:00.000000Z");
    Evidence {
        request: Request {
            expiry_seconds: "3600".into(),
        },
        pages: vec![Page {
            after: None,
            next_after: "1".into(),
            body: serde_json::to_string(&rows).unwrap(),
        }],
    }
}
fn edit(e: &mut Evidence, f: impl FnOnce(&mut Vec<Value>)) {
    let mut rows: Vec<Value> = serde_json::from_str(&e.pages[0].body).unwrap();
    f(&mut rows);
    e.pages[0].body = serde_json::to_string(&rows).unwrap();
}
#[test]
fn exact_weighted_integral() {
    let r = calculate(&data()).unwrap();
    assert_eq!(r.price, "3000000000000");
    assert_eq!(r.weighted_sum, (3 * SCALE * WINDOW as u128).to_string());
}
#[test]
fn exclusive_end() {
    let mut e = data();
    edit(&mut e, |r| r[0]["price"] = json!("10000"));
    assert_eq!(calculate(&e).unwrap().price, "3000000000000");
}
#[test]
fn highest_id_wins_at_start_timestamp() {
    let mut e = data();
    edit(&mut e, |r| {
        for row in r.iter_mut() {
            row["price"] = json!("2");
        }
        r[60]["price"] = json!("999");
        r[59]["time"] = r[60]["time"].clone();
    });
    let c = calculate(&e).unwrap();
    assert_eq!(c.price, "2000000000000");
    assert_eq!(c.predecessor_id, "2");
}
#[test]
fn fractional_atomic_average_floors_once() {
    let mut e = data();
    edit(&mut e, |r| r[60]["price"] = json!("2.000000000001"));
    let c = calculate(&e).unwrap();
    assert_eq!(c.price, "3000000000000");
    assert_eq!(
        c.weighted_sum,
        (3 * SCALE * WINDOW as u128 + 30_000_000).to_string()
    );
}
#[test]
fn missing_id() {
    let mut e = data();
    edit(&mut e, |r| {
        r.remove(10);
    });
    assert_eq!(calculate(&e).unwrap_err(), "TRADE_ID_GAP");
}
#[test]
fn missing_boundaries() {
    let mut e = data();
    edit(&mut e, |r| {
        r.remove(0);
    });
    assert_eq!(calculate(&e).unwrap_err(), "MISSING_END");
    let mut e = data();
    edit(&mut e, |r| {
        r.pop();
    });
    e.pages[0].next_after = "2".into();
    assert_eq!(calculate(&e).unwrap_err(), "MISSING_START");
}
#[test]
fn stale() {
    let mut e = data();
    edit(&mut e, |r| {
        r.last_mut().unwrap()["time"] = json!("1970-01-01T00:28:00Z")
    });
    assert_eq!(calculate(&e).unwrap_err(), "STALE_TRADE");
}
#[test]
fn bad_cursor() {
    let mut e = data();
    e.pages[0].after = Some("8".into());
    assert_eq!(calculate(&e).unwrap_err(), "CURSOR_CHAIN");
}
#[test]
fn price_precision() {
    assert_eq!(price("3.123456789012").unwrap(), 3_123_456_789_012);
    for s in ["0", "-2", "3e2", "1.0000000000001", "NaN", "01", "1000001"] {
        assert!(price(s).is_err(), "{s}");
    }
}
#[test]
fn time_precision() {
    let mut e = data();
    edit(&mut e, |r| {
        r[0]["time"] = json!("1970-01-01T01:00:00.000000001Z")
    });
    assert_eq!(calculate(&e).unwrap_err(), "TIME_PRECISION");
}
#[test]
fn time_order() {
    let mut e = data();
    edit(&mut e, |r| r[2]["time"] = json!("1970-01-01T01:00:00Z"));
    assert_eq!(calculate(&e).unwrap_err(), "TRADE_TIME_ORDER");
}
#[test]
fn duplicate_id() {
    let mut e = data();
    edit(&mut e, |r| r[2]["trade_id"] = r[1]["trade_id"].clone());
    assert_eq!(calculate(&e).unwrap_err(), "TRADE_ID_GAP");
}
#[test]
fn paginated_equivalence() {
    let e = data();
    let expected = calculate(&e).unwrap();
    let rows: Vec<Value> = serde_json::from_str(&e.pages[0].body).unwrap();
    let split = 20;
    let mut e = e;
    let cursor = rows[split - 1]["trade_id"].to_string();
    e.pages = vec![
        Page {
            after: None,
            next_after: cursor.clone(),
            body: serde_json::to_string(&rows[..split]).unwrap(),
        },
        Page {
            after: Some(cursor),
            next_after: "1".into(),
            body: serde_json::to_string(&rows[split..]).unwrap(),
        },
    ];
    assert_eq!(calculate(&e).unwrap().price, expected.price);
}
