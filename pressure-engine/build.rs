use std::{env,fs,path::PathBuf};
fn main(){
 let root=PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
 let source=root.join("../native-engine/src/search.rs");println!("cargo:rerun-if-changed={}",source.display());
 let mut s=fs::read_to_string(source).unwrap().replace("\r\n","\n");
 // Root action utility is bounded and never alters interior static evaluation.
 // Null windows are translated by the action's utility before searching.
 for(from,to) in [
  ("if pos.left == [0, 0] {", "if self.apply_pawn_finish(&pos,&mut out,deadline,&cancel) { return out; }\n        if pos.left == [0, 0] {"),
  ("if !cancel.load(Ordering::Relaxed) {\n            // A directly proven", "if !cancel.load(Ordering::Relaxed) {\n            self.apply_pawn_finish(&pos,&mut out,deadline,&cancel);\n            // A directly proven"),
  ("out.result.pv = vec![decode(action)];", "if !pawn_finish_preferred(&out,distance.saturating_add(1)) {\n                out.result.pv = vec![decode(action)];"),
  ("out.outcome = Some(1);", "out.outcome = Some(1);\n                out.win_proof=Some(WinProof{kind:\"last-wall-ending\",guaranteed_plies:distance.saturating_add(1),shortest_win_proven:false,wall_spent:true});\n                }"),
  ("struct SharedSearch {", "struct SharedSearch {\n    goal_root_active: AtomicBool,\n    goal_frontier: AtomicU64,"),
  ("            profile: 0,", "            goal_root_active: AtomicBool::new(false),\n            goal_frontier: AtomicU64::new(0),\n            profile: 0,"),
  ("for depth in 1..=max_depth.clamp(1, 64) {", "for depth in 1..=max_depth.clamp(1, 64) {\n            self.shared.goal_frontier.store((depth+2).min(14) as u64, Ordering::Relaxed);"),
  ("if ply < 12\n                && p.moves(1 - p.turn)", "if goal_deep_enabled() && self.shared.goal_root_active.load(Ordering::Relaxed) && ply < self.shared.goal_frontier.load(Ordering::Relaxed) as usize && goal_window(p)\n                || ply < 12\n                && p.moves(1 - p.turn)"),
  ("let protected = self.shared.is_critical(p, a);", "let protected = self.shared.is_critical(p, a) || goal_deep_enabled() && self.shared.goal_root_active.load(Ordering::Relaxed) && depth>=3 && i>=8 && goal_critical(p, a);"),
  ("((theirs - enemy) - (mine - own)) * 1600 - 130", "((theirs - enemy) - (mine - own)) * 1600 - 130 + if self.goal_root_active.load(Ordering::Relaxed) && enemy<=3 && theirs>enemy {1200}else{0}"),
  ("self.static_score(&mut mirror_position(p))", "self.goal_score(&mut mirror_position(p))"),
  ("self.static_score(p)", "self.goal_score(p)"),
  ("pub struct NativeOutput {","pub struct NativeOutput {\n    #[serde(skip_serializing_if = \"Option::is_none\")]\n    pub win_proof: Option<WinProof>,\n    #[serde(skip_serializing_if = \"Option::is_none\")]\n    pub goal_safety: Option<GoalSafety>,\n    #[serde(skip_serializing_if = \"Option::is_none\")]\n    pub pressure: Option<PressureFeatures>,"),
  ("let mut out = NativeOutput {","let mut out = NativeOutput {\n            win_proof: None,\n            goal_safety: None,\n            pressure: None,"),
  ("if s.winner.is_some() {", "let goal_active=goal_enabled() && goal_window(&pos) && pos.distance(pos.turn,false)<=3 && pos.left[1-pos.turn]>0;\n        if self.shared.goal_root_active.swap(goal_active,Ordering::Relaxed)!=goal_active {for cache in &self.shared.moves{cache.write().unwrap().clear();}}\n        if goal_enabled() { out.goal_safety=Some(self.shared.goal_details(&mut pos)); }\n        if s.winner.is_some() {"),
  ("let root_key = pos.key();","let root_key = pos.key();\n        let base_biases = pressure_biases(&mut pos, deadline, &cancel);\n        let tempo = tempo_biases(&mut pos, base_biases, deadline, &cancel);\n        let biases = goal_biases(&mut pos, tempo, deadline, &cancel);"),
  ("let score = -value;","let score = pressure_adjust(-value, biases[first as usize], 0);"),
  ("let base = alpha.load(Ordering::Acquire);","let global_base = alpha.load(Ordering::Acquire);\n                            let bias = if global_base.abs() > WIN - 500 { 0 } else { biases[a as usize] };\n                            let base = global_base - bias;"),
  ("let Ok(score) = result else {","let Ok(raw_score) = result else {"),
  ("let mut record = best.lock().unwrap();","let score = pressure_adjust(raw_score, bias, global_base);\n                                let mut record = best.lock().unwrap();"),
  ("progress(&out);","out.pressure = pressure_advice(s, out.result.pv.first());\n            progress(&out);"),
  ("if self.shared.profile == 0 {","if pressure_enabled() { if goal_enabled() { \"5.3 + goal safety 0.4\" } else if tempo_enabled() { \"5.3 + wall tempo 0.3\" } else { \"5.3 + immediate pressure 0.2\" } } else if self.shared.profile == 0 {"),
  ("return out;","out.pressure = pressure_advice(s, out.result.pv.first()); out.result.elapsed_ms = now()-start; return out;"),
 ]{let count=s.matches(from).count();assert!(count>0,"missing patch {from}");if from!="return out;"{assert_eq!(count,1,"ambiguous patch {from}");}s=s.replace(from,to);}
 // The final expression follows all cancellation/endgame fallbacks.
 let tail="        out\n    }\n}";assert_eq!(s.matches(tail).count(),1);s=s.replace(tail,"        out.pressure = pressure_advice(s, out.result.pv.first());\n        out.result.elapsed_ms = now()-start;\n        out\n    }\n}");
 let output=PathBuf::from(env::var("OUT_DIR").unwrap());fs::write(output.join("search.rs"),s).unwrap();
 let main_file=root.join("../native-engine/src/main.rs");println!("cargo:rerun-if-changed={}",main_file.display());let mut m=fs::read_to_string(main_file).unwrap().replace("\r\n","\n").replace("use quoridor_native::{NativeEngine, State};","use quoridor_pressure::{NativeEngine, State, explain_pressure, explain_tempo, explain_goal};");
 let marker="            \"health\" => emit(";assert_eq!(m.matches(marker).count(),1);m=m.replace(marker,&("            \"goal\" => emit(&output, serde_json::json!({\"id\":v[\"id\"],\"done\":true,\"diagnostics\":explain_goal(v.clone())})),\n".to_owned()+"            \"tempo\" => emit(&output, serde_json::json!({\"id\":v[\"id\"],\"done\":true,\"diagnostics\":explain_tempo(v[\"state\"].clone())})),\n            \"explain\" => emit(&output, serde_json::json!({\"id\":v[\"id\"],\"done\":true,\"diagnostics\":explain_pressure(v[\"state\"].clone())})),\n            \"health\" => emit("));fs::write(output.join("main.rs"),m).unwrap();
}
