#[allow(dead_code)]
mod core {
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../rust-engine/src/lib.rs"));
 include!(concat!(env!("OUT_DIR"),"/search.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/strategy.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../search-probe-engine/src/probe.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../response-order-engine/src/ordering.rs"));
 include!("../filter.rs");
 #[derive(Deserialize)] pub struct RankInput {state:State,actions:Vec<u16>}
 pub fn audit(inputs:Vec<RankInput>)->serde_json::Value {
  assert_eq!(probe_mode(),"full");assert_eq!(probe_budget(),0);let mut rows=vec![];
  for input in inputs {
   let mut p=Position::from_state(&input.state).unwrap();let original=p.key();let edges=p.edges;let legal=p.actions();let mut branches=vec![];
   for a in input.actions {
    assert!(legal.contains(&a));let u=p.make(a);let child_key=p.key();
    let cache=Arc::new(SharedSearch{profile:2,..SharedSearch::default()});let mut search=NativeSearcher::new(cache.clone());search.prepare(now()+30000.,Arc::new(AtomicBool::new(false)));
    let value=search.negamax(&mut p,3,-INF,INF,1,&mut vec![original]).expect("Rank audit timed out");
    let reply=cache.entry(&child_key).expect("No reply entry").best;
    // Cold ordering deliberately excludes accumulated history, killers and TT.
    let mut cold=NativeSearcher::new(cache.clone());cold.prepare(now()+30000.,Arc::new(AtomicBool::new(false)));
    let old=cold.ordered(&mut p,None,1).unwrap();let selected=route_pool(&p,&old,filter_mode());let included=selected.iter().any(|&i|old[i]==reply);let limited=cold.filter_order(&mut p,old.clone(),None,1,3).unwrap();
    let mut ranked=cache.ranked(&mut p);cold.response_order(&mut p,&mut ranked,1).unwrap();ranked.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let full:Vec<u16>=ranked.into_iter().map(|v|v.0).collect();
    branches.push(serde_json::json!({"action":a,"rootValue":-value,"reply":reply,"included":included,"coldIndex":old.iter().position(|q|*q==reply),"limitedIndex":limited.iter().position(|q|*q==reply),"staticIndex":full.iter().position(|q|*q==reply),"coldFirst24":old.iter().take(24).collect::<Vec<_>>() }));
    assert!(child_key==p.key());p.unmake(u);assert!(original==p.key());assert_eq!(edges,p.edges);
   }rows.push(serde_json::json!(branches));
  }serde_json::json!(rows)
 }
}
use std::io::{self,Read};
fn main(){let mut s=String::new();io::stdin().read_to_string(&mut s).unwrap();println!("{}",core::audit(serde_json::from_str(&s).unwrap()));}
