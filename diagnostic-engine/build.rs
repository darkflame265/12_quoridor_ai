use std::{env,fs,path::PathBuf};
fn main(){
 let root=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
 let source_path=root.join("../native-engine/src/search.rs");println!("cargo:rerun-if-changed={}",source_path.display());
 let mut source=fs::read_to_string(source_path).unwrap();
 for (from,to) in [
  ("let own = p.distance(t, false);\n        let enemy = p.distance(1 - t, false);","let ((own, enemy), path_cuts) = p.ranking_paths();"),
  ("let mine = p.distance(t, false);","let mine = p.ranking_distance(t, a, own, &path_cuts);"),
  ("let theirs = p.distance(1 - t, false);","let theirs = p.ranking_distance(1 - t, a, enemy, &path_cuts);"),
  ("let reduce = depth >= 3","let reduce = !diagnostic_full_width() && depth >= 3"),
  ("let reduced = depth >= 3","let reduced = !diagnostic_full_width() && depth >= 3"),
  ("\"5.3\"","\"5.3 diagnostic\"")
 ]{assert_eq!(source.matches(from).count(),1);source=source.replace(from,to);}
 fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("search.rs"),source).unwrap();
}
