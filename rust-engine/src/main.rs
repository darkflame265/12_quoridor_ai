use quoridor_atlas::{Engine, State};
use std::io::{self, BufRead, Write};
fn main() {
    let mut engine = Engine::default();
    for line in io::stdin().lock().lines() {
        let line = match line {
            Ok(v) => v,
            Err(_) => break,
        };
        let result = (|| {
            let v: serde_json::Value = serde_json::from_str(&line)?;
            let state: State =
                serde_json::from_value(v.get("state").cloned().unwrap_or_else(|| v.clone()))?;
            Ok::<_, serde_json::Error>(serde_json::to_value(engine.search(
                &state,
                v["ms"].as_f64().unwrap_or(1000.),
                v["maxDepth"].as_u64().unwrap_or(40) as usize,
                u64::MAX,
                0,
                1,
            ))?)
        })();
        let response = match result {
            Ok(v) => v,
            Err(e) => serde_json::json!({"error":e.to_string()}),
        };
        println!("{}", response);
        let _ = io::stdout().flush();
    }
}
