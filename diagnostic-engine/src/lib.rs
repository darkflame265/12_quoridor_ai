#[allow(dead_code)]
mod core {
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../rust-engine/src/lib.rs"));
 include!(concat!(env!("OUT_DIR"),"/search.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/strategy.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../speed-engine/src/ranking-paths.rs"));
 fn diagnostic_full_width()->bool {
  static FULL:std::sync::OnceLock<bool>=std::sync::OnceLock::new();
  *FULL.get_or_init(||std::env::var("QUORIDOR_DIAGNOSTIC_FULL_WIDTH").as_deref()==Ok("1"))
 }
 pub fn audit(states:&[State])->serde_json::Value {
  let mut rows=vec![];
  for s in states {let mut p=Position::from_state(s).unwrap();let key=p.key();let edges=p.edges;
   let cache=SharedSearch{profile:2,..SharedSearch::default()};let mut threats=vec![];
   for target in 0..2 {let sampled=p.potential(target);let full=cache.wall_threat(&mut p,target);
    threats.push(serde_json::json!({"target":target,"sampled":sampled,"full":full.gain,"bestWall":full.action}));}
   rows.push(serde_json::json!({"score":p.evaluate(),"threats":threats}));assert!(key==p.key());assert_eq!(edges,p.edges);
  }serde_json::json!(rows)
 }
}
pub use core::{NativeEngine,NativeOutput,State,audit};
