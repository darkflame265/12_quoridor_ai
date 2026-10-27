#[allow(dead_code)]
mod core {
    include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../rust-engine/src/lib.rs"));
    include!(concat!(env!("OUT_DIR"),"/search.rs"));
    include!(concat!(env!("OUT_DIR"),"/strategy.rs"));
    include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
    include!("maze-evaluation.rs");
    include!("tactical-ordering.rs");
}
pub use core::{NativeEngine,NativeOutput,State};
pub use core::evaluation_benchmark;
