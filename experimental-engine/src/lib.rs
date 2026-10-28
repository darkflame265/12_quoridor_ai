#[allow(dead_code)]
mod core {
    include!(concat!(env!("OUT_DIR"),"/rules.rs"));
    include!(concat!(env!("OUT_DIR"),"/search.rs"));
    include!(concat!(env!("OUT_DIR"),"/strategy.rs"));
    include!(concat!(env!("CARGO_MANIFEST_DIR"),"/../native-engine/src/endgame-oracle.rs"));
    include!("maze-evaluation.rs");
    include!("tactical-ordering.rs");
    include!("wall-geometry.rs");
    include!("connection-weights.rs");
    include!("ranking-paths.rs");
    include!("forcing-search.rs");
}
pub use core::{NativeEngine,NativeOutput,State};
pub use core::evaluation_benchmark;
pub use core::{geometry_snapshot,geometry_scores};
pub use core::weight_snapshot;
pub use core::ranking_benchmark;
pub use core::forcing_review;
