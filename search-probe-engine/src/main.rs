#[allow(dead_code)]
mod core {
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../rust-engine/src/lib.rs"));
 include!(concat!(env!("OUT_DIR"),"/search.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/strategy.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
 include!("probe.rs");
}
use std::io::{self,Read};
fn main(){
 let mut input=String::new();io::stdin().read_to_string(&mut input).unwrap();
 let r:core::ProbeInput=serde_json::from_str(&input).unwrap();
 println!("{}",core::probe(r));
}
