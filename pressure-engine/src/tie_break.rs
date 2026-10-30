impl SharedSearch{
 fn root_tie_key(&self,p:&Position,a:u16)->(u8,i32,usize,u16){
  let mut child=p.clone();child.make(a);
  let visits=if a<81{self.root_recent_pawns.lock().unwrap().iter().filter(|&&n|n==a as usize).count()}else{0};
  (if a>=81{1}else{0},child.distance(p.turn,false),visits,a)
 }
 fn prefer_root_tie(&self,p:&Position,a:u16,b:u16)->bool{self.root_tie_key(p,a)<self.root_tie_key(p,b)}
}
#[cfg(test)]mod tie_break_tests{
 use super::*;
 #[test]fn game9_equal_loss_moves_keep_outcome_and_distance_but_prefer_progress(){
  std::env::set_var("QUORIDOR_GOAL_MODE","on");std::env::set_var("QUORIDOR_PRESSURE_MODE","on");std::env::set_var("QUORIDOR_TEMPO_MODE","on");
  let cases:serde_json::Value=serde_json::from_str(include_str!("../test-data/tie-game9.json")).unwrap();
  for case in cases.as_array().unwrap().iter().filter(|c|c["ply"].as_u64().unwrap()>=57){
   let state:State=serde_json::from_value(case["state"].clone()).unwrap();let p=Position::from_state(&state).unwrap();
   let mut engine=NativeEngine::with_profile(2);let r=engine.search(&state,2000.,1,12,Arc::new(AtomicBool::new(false)),|_|{});
   assert_eq!(r.exact,Some(true));assert_eq!(r.outcome,Some(-1));
   let table=engine.endgames.get(&p.walls).unwrap();let (v,d,_)=table.lookup(&p);
   let a=action_code(&r.result.pv[0]);let mut q=p.clone();q.make(a);let (cv,cd,_)=table.lookup(&q);
   assert_eq!(cv,-v);assert_eq!(cd+1,d);assert!(q.distance(p.turn,false)<p.distance(p.turn,false));
  }
 }
 #[test]fn tied_mate_prefers_a_verified_move_over_spending_a_wall(){
  std::env::set_var("QUORIDOR_GOAL_MODE","on");std::env::set_var("QUORIDOR_PRESSURE_MODE","on");std::env::set_var("QUORIDOR_TEMPO_MODE","on");
  let cases:serde_json::Value=serde_json::from_str(include_str!("../test-data/tie-game9.json")).unwrap();let state:State=serde_json::from_value(cases[0]["state"].clone()).unwrap();
  let mut engine=NativeEngine::with_profile(2);let r=engine.search(&state,3000.,1,14,Arc::new(AtomicBool::new(false)),|_|{});
  assert_eq!(r.result.score,-WIN+12);assert_eq!(r.result.pv[0].kind,"move");
 }
 #[test]fn exact_winning_result_and_fastest_win_are_preserved(){
  std::env::set_var("QUORIDOR_GOAL_MODE","on");
  let state:State=serde_json::from_value(serde_json::json!({"p":[{"x":4,"y":6},{"x":0,"y":0}],"walls":[],"left":[0,0],"turn":0,"winner":null})).unwrap();
  let mut engine=NativeEngine::with_profile(2);let r=engine.search(&state,2000.,1,12,Arc::new(AtomicBool::new(false)),|_|{});
  assert_eq!(r.exact,Some(true));assert_eq!(r.outcome,Some(1));assert_eq!(r.result.score,WIN-11);
 }
}
impl NativeEngine{
 // Change only the selected move, never a certified outcome or distance.
 fn prefer_exact_output(&self,s:&State,out:&mut NativeOutput){
  if !goal_enabled()||out.exact!=Some(true){return;}
  let Ok(p)=Position::from_state(s)else{return;};
  let Some(table)=self.endgames.get(&p.walls)else{return;};
  let (value,plies,original)=table.lookup(&p);let mut best=original;
  for a in p.moves(p.turn){
   let mut child=p.clone();child.make(a);let (v,d,_)=table.lookup(&child);
   if v != -value||value!=0&&d.saturating_add(1)!=plies{continue;}
   if best==u16::MAX||self.shared.prefer_root_tie(&p,a,best){best=a;}
  }
  if best!=u16::MAX{out.result.pv=vec![decode(best)];}
 }
}
