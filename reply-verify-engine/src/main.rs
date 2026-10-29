#[allow(dead_code)]
mod core {
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../rust-engine/src/lib.rs"));
 include!(concat!(env!("OUT_DIR"),"/search.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/strategy.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../search-probe-engine/src/probe.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../route-filter-engine/src/filter.rs"));
 include!("verify.rs");
 pub fn work()->serde_json::Value {serde_json::json!({"calls":MASK_CALLS.load(Ordering::Relaxed),"maxCandidates":MASK_MAX.load(Ordering::Relaxed),"eligibleFailLow":ELIGIBLE.load(Ordering::Relaxed),"extraSearches":EXTRA_SEARCHES.load(Ordering::Relaxed),"goalMaps":GOAL_MAPS.load(Ordering::Relaxed)})}
}
use std::io::{self,Read};
fn main(){let mut s=String::new();io::stdin().read_to_string(&mut s).unwrap();let input=serde_json::from_str(&s).unwrap();let mut result=core::probe(input);result["replyWork"]=core::work();println!("{}",result);}
