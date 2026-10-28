use std::{env,fs,path::PathBuf};
fn main(){
 let base=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../native-engine/src");
 let out=PathBuf::from(env::var("OUT_DIR").unwrap());let file=base.join("search.rs");
 println!("cargo:rerun-if-changed={}",file.display());let mut source=fs::read_to_string(file).unwrap();
 // Original evaluation, ordering scores, LMR and repetition logic stay intact.
 for (from,to) in [
  ("let own = p.distance(t, false);\n        let enemy = p.distance(1 - t, false);","let ((own, enemy), path_cuts) = p.ranking_paths();"),
  ("let mine = p.distance(t, false);","let mine = p.ranking_distance(t, a, own, &path_cuts);"),
  ("let theirs = p.distance(1 - t, false);","let theirs = p.ranking_distance(1 - t, a, enemy, &path_cuts);")
 ] {assert_eq!(source.matches(from).count(),1);source=source.replace(from,to);}
 assert_eq!(source.matches("\"5.3\"").count(),1);
 source=source.replace("\"5.3\"","\"5.3 speed\"");fs::write(out.join("search.rs"),source).unwrap();
}
