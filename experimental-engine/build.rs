use std::{env,fs,path::PathBuf};
fn main() {
    let base=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../native-engine/src");
    let out=PathBuf::from(env::var("OUT_DIR").unwrap());
    let rules=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../rust-engine/src/lib.rs");
    println!("cargo:rerun-if-changed={}",rules.display());
    let source=fs::read_to_string(rules).unwrap();assert_eq!(source.matches("fn connections(").count(),1);
    assert_eq!(source.matches("rank[i] += self.connections(a)").count(),1);
    assert_eq!(source.matches("self.connections(a) as f64 * 30.").count(),1);
    fs::write(out.join("rules.rs"),source.replace("fn connections(","fn legacy_connections(").replace("self.connections(a) as f64 * 30.","self.evaluation_connections(a) as f64 * connection_threat_weight()").replace("p.connections(a) * 180","p.ordering_connections(a) * connection_order_weight()")).unwrap();
    for file in ["strategy.rs","search.rs"] {
        let path=base.join(file); println!("cargo:rerun-if-changed={}",path.display());
        let source=fs::read_to_string(path).unwrap();
        let modified=if file=="strategy.rs" {
            assert_eq!(source.matches("fn static_score(").count(),1);
            assert_eq!(source.matches("fn is_critical(").count(),1);
            source.replace("fn static_score(","fn legacy_static_score(").replace("fn is_critical(","fn legacy_is_critical(")
        } else {
            assert_eq!(source.matches("\"5.3\"").count(),1);
            assert_eq!(source.matches("fn ranked(").count(),1);
            assert_eq!(source.matches("p.connections(a) * 180").count(),1);
            source.replace("\"5.3\"","\"5.9 experiment\"").replace("fn ranked(","fn legacy_ranked(").replace("p.connections(a) * 180","p.ordering_connections(a) * connection_order_weight()")
        };
        fs::write(out.join(file),modified).unwrap();
    }
}
