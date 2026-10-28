use std::{env,fs,path::PathBuf};
fn main(){
 let file=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../native-engine/src/search.rs");println!("cargo:rerun-if-changed={}",file.display());
 let mut source=fs::read_to_string(file).unwrap();
 for (from,to) in [
  ("let own = p.distance(t, false);\n        let enemy = p.distance(1 - t, false);","let ((own, enemy), path_cuts) = p.ranking_paths();"),
  ("let mine = p.distance(t, false);","let mine = p.ranking_distance(t, a, own, &path_cuts);"),
  ("let theirs = p.distance(1 - t, false);","let theirs = p.ranking_distance(1 - t, a, enemy, &path_cuts);"),
  ("let reduce = depth >= 3","let reduce = !reference_full_width() && depth >= 3"),
  ("out.result.pv = vec![decode(roots[0])];","out.result.pv = vec![decode(roots[0])];\n        let root_flags = self.shared.root_flags(&pos, &roots);"),
  ("let reduced = depth >= 3","let reduced = depth >= 3 && !protect_root(depth, a, &root_flags)"),
  ("\"5.3\"","\"5.3 root-guard\"")
 ]{assert_eq!(source.matches(from).count(),1);source=source.replace(from,to);}
 fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("search.rs"),source).unwrap();
}
