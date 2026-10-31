#[allow(dead_code)]
mod core {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../rust-engine/src/lib.rs"));
    include!("search.rs");
}
pub use core::{Atlas6, State, SearchResult};
