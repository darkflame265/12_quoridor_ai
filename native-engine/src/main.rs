use quoridor_native::{NativeEngine, State};
use std::io::{self, BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
fn emit(output: &Mutex<io::Stdout>, value: serde_json::Value) {
    let mut out = output.lock().unwrap();
    let _ = writeln!(out, "{}", value);
    let _ = out.flush();
}
fn main() {
    let output = Arc::new(Mutex::new(io::stdout()));
    let (tx, rx) = mpsc::channel::<(serde_json::Value, Arc<AtomicBool>)>();
    let writer = output.clone();
    std::thread::spawn(move || {
        let mut engines = [
            NativeEngine::with_profile(0),
            NativeEngine::with_profile(1),
            NativeEngine::with_profile(2),
            NativeEngine::with_profile(3),
        ];
        for (v, cancel) in rx {
            let id = v["id"].clone();
            if cancel.load(Ordering::Relaxed) {
                emit(
                    &writer,
                    serde_json::json!({"id":id,"done":true,"cancelled":true}),
                );
                continue;
            }
            match serde_json::from_value::<State>(v["state"].clone()) {
                Ok(state) => {
                    let index = match v["profile"].as_str().unwrap_or("baseline") {
                        "strategy" => 1,
                        "candidate" => 2,
                        "combined" => 3,
                        _ => 0,
                    };
                    let engine = &mut engines[index];
                    let r = engine.search(
                        &state,
                        v["ms"].as_f64().unwrap_or(500.),
                        v["cores"].as_u64().unwrap_or(4) as usize,
                        v["maxDepth"].as_u64().unwrap_or(40) as usize,
                        cancel,
                        |r| {
                            let mut data = serde_json::to_value(r).unwrap();
                            data["id"] = id.clone();
                            data["done"] = false.into();
                            emit(&writer, data);
                        },
                    );
                    let mut data = serde_json::to_value(r).unwrap();
                    data["id"] = id;
                    data["done"] = true.into();
                    emit(&writer, data);
                }
                Err(e) => emit(
                    &writer,
                    serde_json::json!({"id":id,"done":true,"error":e.to_string()}),
                ),
            }
        }
    });
    let mut active: Option<(serde_json::Value, Arc<AtomicBool>)> = None;
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else {
            break;
        };
        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                emit(
                    &output,
                    serde_json::json!({"done":true,"error":e.to_string()}),
                );
                continue;
            }
        };
        match v["op"].as_str().unwrap_or("search") {
            "health" => emit(
                &output,
                serde_json::json!({"id":v["id"],"done":true,"service":"quoridor-native-v1","engine":"Atlas 5 Native","maxCores":4}),
            ),
            "cancel" => {
                if let Some((id, cancel)) = &active {
                    if *id == v["id"] {
                        cancel.store(true, Ordering::Relaxed);
                    }
                }
            }
            _ => {
                if let Some((_, cancel)) = &active {
                    cancel.store(true, Ordering::Relaxed);
                }
                let cancel = Arc::new(AtomicBool::new(false));
                active = Some((v["id"].clone(), cancel.clone()));
                if tx.send((v, cancel)).is_err() {
                    break;
                }
            }
        }
    }
    if let Some((_, cancel)) = active {
        cancel.store(true, Ordering::Relaxed);
    }
}
