#[allow(dead_code)]
mod core {
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../rust-engine/src/lib.rs"));
 include!(concat!(env!("OUT_DIR"),"/search.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/strategy.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../search-probe-engine/src/probe.rs"));
 include!("boundary.rs");
 pub fn work()->serde_json::Value {serde_json::json!({"calls":ORDER_CALLS.load(Ordering::Relaxed),"evaluations":ORDER_EVALS.load(Ordering::Relaxed),"maxPerCall":ORDER_MAX.load(Ordering::Relaxed)})}
}
use std::io::{self,Read};
fn main(){let mut s=String::new();io::stdin().read_to_string(&mut s).unwrap();let input=serde_json::from_str(&s).unwrap();let mut result=core::probe(input);result["orderingWork"]=core::work();println!("{}",result);}
