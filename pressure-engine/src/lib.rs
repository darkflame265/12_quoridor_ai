#[allow(dead_code)]
mod core {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../rust-engine/src/lib.rs"));
    include!(concat!(env!("OUT_DIR"), "/search.rs"));
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../native-engine/src/strategy.rs"));
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../native-engine/src/endgame-oracle.rs"));
    include!("pressure.rs");
    include!("reserve.rs");
    include!("tempo.rs");
}
pub use core::{NativeEngine, NativeOutput, State, explain_pressure, explain_tempo};
