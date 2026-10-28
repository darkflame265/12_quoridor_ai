use std::{env,fs,path::PathBuf};
fn main(){
 let file=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("../native-engine/src/search.rs");
 println!("cargo:rerun-if-changed={}",file.display());
 let mut s=fs::read_to_string(file).unwrap().replace("\r\n","\n");
 for (from,to) in [
  ("self.nodes += 1;","if probe_budget()>0 && self.nodes>=probe_budget(){return Err(());}\n        self.nodes += 1;"),
  ("let cores = cores.clamp(1, 4);","let cores = cores.clamp(1, 4);\n        assert!(probe_budget()==0 || cores==1);"),
  ("        path.push(key);\n        for (i, &a)","        let chain_guard = depth==3 && ply==1 && long_barrier(p);\n        path.push(key);\n        for (i, &a)"),
  ("let reduce = depth >= 3","let reduce = !chain_guard && depth >= 3"),
 ]{assert_eq!(s.matches(from).count(),1,"Patch mismatch: {from}");s=s.replace(from,to);}
 fs::write(PathBuf::from(env::var("OUT_DIR").unwrap()).join("search.rs"),s).unwrap();
}
