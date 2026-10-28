#[allow(dead_code)]
mod core {
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../rust-engine/src/lib.rs"));
 include!(concat!(env!("OUT_DIR"),"/search.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/strategy.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../speed-engine/src/ranking-paths.rs"));
 // Root choices get one extra ply before late-move reduction is allowed.
 fn guard_reduction_allowed(depth:i32,root:bool)->bool {depth>=if root {5}else{4}}
 #[cfg(test)] mod guard_tests {
  use super::*;
  #[test] fn shallow_nodes_and_root_boundary_are_protected(){
   for depth in 0..=3 {assert!(!guard_reduction_allowed(depth,false));assert!(!guard_reduction_allowed(depth,true));}
   assert!(guard_reduction_allowed(4,false));assert!(!guard_reduction_allowed(4,true));assert!(guard_reduction_allowed(5,true));
  }
 }
}
pub use core::{NativeEngine,NativeOutput,State};
