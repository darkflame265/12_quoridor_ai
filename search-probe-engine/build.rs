use std::{env,fs,path::PathBuf};
fn main(){
 let file=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../native-engine/src/search.rs");
 println!("cargo:rerun-if-changed={}",file.display());
 let mut source=fs::read_to_string(file).unwrap().replace("\r\n","\n");
 for (from,to) in [
  ("self.nodes += 1;","if probe_budget()>0 && self.nodes>=probe_budget(){return Err(());}\n        self.nodes += 1;"),
  ("let cores = cores.clamp(1, 4);","let cores = cores.clamp(1, 4);\n        assert!(probe_budget()==0 || cores==1, \"Node budgets require one core\");"),
  ("let reduce = depth >= 3","let reduce = !probe_internal_full() && depth >= 3"),
  ("let reduced = depth >= 3","let reduced = !probe_root_full() && depth >= 3"),
  ("let score = -value;","let score = -value;\n            probe_trace(depth,0,first,false,score,true);"),
  ("let Ok(score) = result else {","let Ok(score) = result else {"),
  ("                            {\n                                let mut record = best.lock().unwrap();","                            probe_trace(depth,i,a,reduced,score,score>base);\n                            {\n                                let mut record = best.lock().unwrap();"),
 ]{assert_eq!(source.matches(from).count(),1,"Patch mismatch: {from}");source=source.replace(from,to);}
 fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("search.rs"),source).unwrap();
}
