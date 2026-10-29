use std::{env,fs,path::PathBuf};
fn main(){
 let root=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
 let source=root.join("../native-engine/src/search.rs");println!("cargo:rerun-if-changed={}",source.display());
 let mut s=fs::read_to_string(source).unwrap().replace("\r\n","\n");
 // Root action utility is bounded and never alters interior static evaluation.
 // Null windows are translated by the action's utility before searching.
 for(from,to) in [
  ("pub struct NativeOutput {","pub struct NativeOutput {\n    #[serde(skip_serializing_if = \"Option::is_none\")]\n    pub pressure: Option<PressureFeatures>,"),
  ("let mut out = NativeOutput {","let mut out = NativeOutput {\n            pressure: None,"),
  ("let root_key = pos.key();","let root_key = pos.key();\n        let biases = pressure_biases(&mut pos, deadline, &cancel);"),
  ("let score = -value;","let score = pressure_adjust(-value, biases[first as usize], 0);"),
  ("let base = alpha.load(Ordering::Acquire);","let global_base = alpha.load(Ordering::Acquire);\n                            let bias = if global_base.abs() > WIN - 500 { 0 } else { biases[a as usize] };\n                            let base = global_base - bias;"),
  ("let Ok(score) = result else {","let Ok(raw_score) = result else {"),
  ("let mut record = best.lock().unwrap();","let score = pressure_adjust(raw_score, bias, global_base);\n                                let mut record = best.lock().unwrap();"),
  ("progress(&out);","out.pressure = pressure_advice(s, out.result.pv.first());\n            progress(&out);"),
  ("if self.shared.profile == 0 {","if pressure_enabled() { \"5.3 + immediate pressure 0.1\" } else if self.shared.profile == 0 {"),
  ("return out;","out.pressure = pressure_advice(s, out.result.pv.first()); out.result.elapsed_ms = now()-start; return out;"),
 ]{let count=s.matches(from).count();assert!(count>0,"missing patch {from}");if from!="return out;"{assert_eq!(count,1,"ambiguous patch {from}");}s=s.replace(from,to);}
 // The final expression follows all cancellation/endgame fallbacks.
 let tail="        out\n    }\n}";assert_eq!(s.matches(tail).count(),1);s=s.replace(tail,"        out.pressure = pressure_advice(s, out.result.pv.first());\n        out.result.elapsed_ms = now()-start;\n        out\n    }\n}");
 let output=PathBuf::from(env::var("OUT_DIR").unwrap());fs::write(output.join("search.rs"),s).unwrap();
 let main_file=root.join("../native-engine/src/main.rs");println!("cargo:rerun-if-changed={}",main_file.display());let mut m=fs::read_to_string(main_file).unwrap().replace("\r\n","\n").replace("use quoridor_native::{NativeEngine, State};","use quoridor_pressure::{NativeEngine, State, explain_pressure};");
 let marker="            \"health\" => emit(";assert_eq!(m.matches(marker).count(),1);m=m.replace(marker,"            \"explain\" => emit(&output, serde_json::json!({\"id\":v[\"id\"],\"done\":true,\"diagnostics\":explain_pressure(v[\"state\"].clone())})),\n            \"health\" => emit(");fs::write(output.join("main.rs"),m).unwrap();
}
