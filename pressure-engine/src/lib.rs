#[allow(dead_code)]
mod core {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../rust-engine/src/lib.rs"));
    include!(concat!(env!("OUT_DIR"), "/search.rs"));
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../native-engine/src/strategy.rs"));
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../native-engine/src/endgame-oracle.rs"));
    include!("pressure.rs");
    include!("reserve.rs");
    include!("defense_reserve.rs");
    include!("weak_wall.rs");
    include!("connection_probe.rs");
    include!("connection_risk.rs");
    include!("tempo.rs");
    include!("goal_guard.rs");
    include!("pawn_finish.rs");
}
pub use core::{NativeEngine, NativeOutput, State, explain_pressure, explain_tempo, explain_goal, explain_connection};
