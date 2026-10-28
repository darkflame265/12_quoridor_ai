#[allow(dead_code)]
mod core {
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../rust-engine/src/lib.rs"));
 include!(concat!(env!("OUT_DIR"),"/search.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/strategy.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
 include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../speed-engine/src/ranking-paths.rs"));
 fn maze_reduction_allowed(depth:i32,root:bool,maze:bool)->bool {depth>=if !maze {3}else if root {5}else{4}}
 #[cfg(test)] mod maze_guard_tests {
  use super::*;
  #[test] fn open_positions_keep_original_reductions_and_maze_roots_are_protected(){
   for depth in 0..=8 {for root in [false,true] {assert_eq!(maze_reduction_allowed(depth,root,false),depth>=3);}}
   assert!(!maze_reduction_allowed(3,false,true));assert!(maze_reduction_allowed(4,false,true));
   assert!(!maze_reduction_allowed(4,true,true));assert!(maze_reduction_allowed(5,true,true));
  }
 }
}
pub use core::{NativeEngine,NativeOutput,State};
