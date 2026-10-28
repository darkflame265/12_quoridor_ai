fn probe_mode()->&'static str {
 static MODE:std::sync::OnceLock<String>=std::sync::OnceLock::new();
 MODE.get_or_init(||{let s=std::env::var("QUORIDOR_PROBE_MODE").unwrap_or("off".into());assert!(["off","root","internal","full"].contains(&s.as_str()));s})
}
fn probe_root_full()->bool {matches!(probe_mode(),"root"|"full")}
fn probe_internal_full()->bool {matches!(probe_mode(),"internal"|"full")}
fn probe_budget()->u64 {
 static BUDGET:std::sync::OnceLock<u64>=std::sync::OnceLock::new();
 *BUDGET.get_or_init(||std::env::var("QUORIDOR_PROBE_NODES").unwrap_or("0".into()).parse().expect("Invalid node budget"))
}
static TRACE:Mutex<Vec<serde_json::Value>>=Mutex::new(Vec::new());
fn probe_trace(depth:usize,index:usize,action:u16,reduced:bool,score:i32,full_window:bool){
 if std::env::var_os("QUORIDOR_PROBE_TRACE").is_some(){TRACE.lock().unwrap().push(serde_json::json!({"depth":depth,"index":index,"action":action,"reduced":reduced,"score":score,"bound":if full_window{"searched-value"}else{"upper-bound"}}));}
}
#[derive(Deserialize)]
pub struct ProbeInput {state:State,ms:f64,cores:usize,#[serde(rename="maxDepth")]max_depth:usize}
pub fn probe(input:ProbeInput)->serde_json::Value {
 assert!(input.ms.is_finite() && input.ms>0. && input.ms<=30000.);
 assert!((1..=4).contains(&input.cores));assert!((1..=64).contains(&input.max_depth));
 let mut engine=NativeEngine::with_profile(2);let mut iterations=vec![];
 let result=engine.search(&input.state,input.ms,input.cores,input.max_depth,Arc::new(AtomicBool::new(false)),|r|iterations.push(serde_json::to_value(r).unwrap()));
 let mut trace=TRACE.lock().unwrap();trace.sort_by_key(|v|(v["depth"].as_u64(),v["index"].as_u64()));
 serde_json::json!({"mode":probe_mode(),"nodeBudget":probe_budget(),"cores":input.cores,"result":result,"iterations":iterations,"trace":*trace})
}
