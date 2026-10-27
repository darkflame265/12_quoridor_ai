use std::{env,fs,path::PathBuf};
fn main() {
    let base=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../native-engine/src");
    let out=PathBuf::from(env::var("OUT_DIR").unwrap());
    for file in ["strategy.rs","search.rs"] {
        let path=base.join(file); println!("cargo:rerun-if-changed={}",path.display());
        let source=fs::read_to_string(path).unwrap();
        let modified=if file=="strategy.rs" {
            assert_eq!(source.matches("fn static_score(").count(),1);
            source.replace("fn static_score(","fn legacy_static_score(")
        } else {
            assert_eq!(source.matches("\"5.3\"").count(),1);
            source.replace("\"5.3\"","\"5.4 experiment\"")
        };
        fs::write(out.join(file),modified).unwrap();
    }
}
