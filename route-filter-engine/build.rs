use std::{env,fs,path::PathBuf};
fn main(){
 let file=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../native-engine/src/search.rs");
 println!("cargo:rerun-if-changed={}",file.display());
 let mut s=fs::read_to_string(file).unwrap().replace("\r\n","\n");
 for (from,to) in [
  ("self.nodes += 1;","if probe_budget()>0 && self.nodes>=probe_budget(){return Err(());}\n        self.nodes += 1;"),
  ("let cores = cores.clamp(1, 4);","let cores = cores.clamp(1, 4);\n        assert!(probe_budget()==0 || cores==1);"),
  ("let reduce = depth >= 3","let reduce = !probe_internal_full() && depth >= 3"),
  ("let reduced = depth >= 3","let reduced = !probe_root_full() && depth >= 3"),
  ("let list = self.ordered(p, hit.as_ref().map(|e| e.best), ply)?;","let list = self.ordered(p, hit.as_ref().map(|e| e.best), ply)?;\n        let list = self.filter_order(p, list, hit.as_ref().map(|e|e.best), ply, depth)?;"),
 ]{assert_eq!(s.matches(from).count(),1,"Patch mismatch: {from}");s=s.replace(from,to);}
 fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("search.rs"),s).unwrap();
}
