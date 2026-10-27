// Reuse the independently verified board rules without changing the shipped WASM.
#[allow(dead_code)]
mod core {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../rust-engine/src/lib.rs"
    ));
    include!("search.rs");
    include!("strategy.rs");
}
pub use core::{NativeEngine, NativeOutput, State};
