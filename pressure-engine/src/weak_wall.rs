#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct WeakWallCost{action:Action,penalty:i32,enemy_delay:i32,own_delay:i32,sequence_penalty:i32,reserve_penalty:i32,retained_sequence_delay:i32,sequence_own_delay:i32,opportunity_progress:i32,defensive_exception:bool}
#[derive(Clone)]
struct WallRunEntry{action:u16,move_progress:i32}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct WeakWallConsumption{
 active:bool,complete:bool,wall_streak:usize,best_move_progress:i32,penalized_actions:usize,observed_sequence:usize,
 selected:Option<WeakWallCost>,#[serde(skip)]costs:Vec<WeakWallCost>,
}
#[cfg(test)]mod wall_sequence_tests{
 use super::*;
 #[test]fn bundle_cost_prices_cumulative_opportunity_without_penalizing_effective_chains(){
  assert_eq!(sequence_cost(4,0,2,2),0);
  assert_eq!(sequence_cost(2,1,6,4),80);
  assert_eq!(sequence_cost(0,0,10,8),96);
  assert_eq!(sequence_cost(0,0,1,1),0);
 }
 #[test]fn observed_game8_run_is_validated_and_available_to_selected_wall_comparison(){
  std::env::set_var("QUORIDOR_GOAL_MODE","on");
  let cases:serde_json::Value=serde_json::from_str(include_str!("../test-data/wall-sequence.json")).unwrap();
  for (i,case) in cases.as_array().unwrap().iter().enumerate(){
   let mut engine=NativeEngine::with_profile(2);engine.set_wall_run(&case["state"]);
   let run=engine.shared.root_wall_run.lock().unwrap().clone();assert_eq!(run.len(),if i==0{4}else{1});
   let state:State=serde_json::from_value(case["state"].clone()).unwrap();let mut p=Position::from_state(&state).unwrap();let key=p.key();
   let cancel=AtomicBool::new(false);let (_,reserve)=defense_reserve_biases(&mut p,[0;209],now()+2000.,&cancel);
   let (_,mut details)=weak_wall_biases(&mut p,[0;209],&reserve,&run,run.len(),now()+2000.,&cancel);
   assert!(details.complete);assert!(p.key()==key);details.select(Some(&decode(parse_defense_reply(&case["action"]).unwrap())));
   let selected=details.selected.unwrap();assert!(selected.penalty<=160);assert!(selected.opportunity_progress>=run.len()as i32);
   if i==0{assert_eq!(selected.sequence_penalty,64);}
   if i==1{assert!(!selected.defensive_exception);assert_eq!(selected.reserve_penalty,36);}
   engine.set_wall_run(&serde_json::Value::Null);assert!(engine.shared.root_wall_run.lock().unwrap().is_empty());
  }
 }
 #[test]fn mandatory_defense_and_timeouts_do_not_apply_partial_sequence_costs(){
  std::env::set_var("QUORIDOR_GOAL_MODE","on");
  let state:State=serde_json::from_value(serde_json::json!({"p":[{"x":4,"y":4},{"x":4,"y":7}],"turn":0,"left":[3,6],"walls":[],"winner":null})).unwrap();
  let mut p=Position::from_state(&state).unwrap();let cancel=AtomicBool::new(false);
  let (_,reserve)=defense_reserve_biases(&mut p,[0;209],now()+2000.,&cancel);
  let (cost,details)=weak_wall_biases(&mut p,[0;209],&reserve,&[],8,now()+2000.,&cancel);
  assert!(cost.iter().all(|&n|n==0));assert!(details.costs.is_empty());
  let state:State=serde_json::from_value(serde_json::json!({"p":[{"x":4,"y":6},{"x":4,"y":2}],"turn":0,"left":[3,6],"walls":[],"winner":null})).unwrap();
  let mut p=Position::from_state(&state).unwrap();cancel.store(true,Ordering::Relaxed);
  let (cost,details)=weak_wall_biases(&mut p,[0;209],&reserve,&[],8,now()+2000.,&cancel);
  assert!(!details.complete);assert!(details.costs.is_empty());assert!(cost.iter().all(|&n|n==0));
 }
}
impl WeakWallConsumption{
 fn select(&mut self,action:Option<&Action>){self.selected=action.and_then(|a|self.costs.iter().find(|c|action_code(&c.action)==action_code(a)).cloned());}
}
impl NativeEngine{
 pub fn set_wall_streak(&mut self,value:usize){self.shared.root_wall_streak.store(value.min(10),Ordering::Relaxed);}
 pub fn set_wall_run(&mut self,state:&serde_json::Value){
  let mut run=self.shared.root_wall_run.lock().unwrap();run.clear();
  if let (Some(rows),Some(walls),Some(turn))=(state["wallRun"].as_array(),state["walls"].as_array(),state["turn"].as_u64()){
   for row in rows.iter().take(10){
    let Some(action)=parse_defense_reply(row).filter(|&a|a>=81)else{continue;};
    if run.iter().any(|r|r.action==action)||!walls.iter().any(|w|w["owner"].as_u64()==Some(turn)&&parse_defense_reply(&serde_json::json!({"type":"wall","x":w["x"],"y":w["y"],"o":w["o"]}))==Some(action)){continue;}
    run.push(WallRunEntry{action,move_progress:row["moveProgress"].as_i64().unwrap_or(0).clamp(0,2)as i32});
   }
  }
 }
}
fn sequence_cost(retained:i32,own_delay:i32,opportunity:i32,count:usize)->i32{
 if count<2{return 0;}
 ((opportunity+own_delay-retained).max(0)*16).min(96)
}
fn weak_wall_biases(p:&mut Position,base:[i32;209],reserve:&ReserveDefense,run:&[WallRunEntry],streak:usize,deadline:f64,cancel:&AtomicBool)->([i32;209],WeakWallConsumption){
 let t=p.turn;let o=1-t;let own=p.distance(t,false);
 let mut details=WeakWallConsumption{active:goal_enabled()&&p.left[t]>0,complete:true,wall_streak:streak.max(run.len()),best_move_progress:0,penalized_actions:0,observed_sequence:run.len(),selected:None,costs:vec![]};
 if !details.active{return (base,details);}
 // Do not discourage a mandatory defensive wall or invent a useful pawn move.
 if p.moves(o).iter().any(|&q|goal(q as usize,o)){return (base,details);}
 let mut best=0;
 for a in p.moves(t){let mut child=p.clone();child.make(a);if child.terminal(){return (base,details);}best=best.max(own-child.distance(t,false));}
 details.best_move_progress=best;if best<=0{return (base,details);}
 let until=(now()+30.).min(now()+(deadline-now()).max(0.)*0.08);
 let expired=||cancel.load(Ordering::Relaxed)||now()>=until;
 let mut attack=None;let mut risk=0;
 if p.left[o]>0{for b in 81..209{if expired(){details.complete=false;return (base,details);}if let Some(gain)=reserve_attack(p,b,t){if gain>risk{risk=gain;attack=Some(b);}}}}
 let mut out=base;
 // Remove only the observed consecutive own walls; retain the current pawn
 // positions and every opposing wall for a common geometry comparison.
 let mut bare=p.clone();let mut removed=0;let mut opportunity=best;
 for row in run{let bit=1u128<<(row.action-81);if bare.walls&bit!=0{bare.toggle(row.action,false);bare.walls&=!bit;removed+=1;opportunity+=row.move_progress;}}
 let bare_own=bare.distance(t,false);
 for a in p.actions(){
  if a<81{continue;}if expired(){details.complete=false;details.costs.clear();return (base,details);}
  let f=pressure_feature(p,a);
  // Preserve walls that alleviate a measured immediate attack. Missing threat
  // candidates never constitute a safety or winning certificate.
  let mut defensive=reserve.active&&reserve.complete&&reserve.baseline_risk>0&&!reserve.costs.iter().any(|c|action_code(&c.action)==a);
  let mut child=p.clone();child.make(a);
  if let Some(b)=attack{if reserve_attack(&mut child,b,t).unwrap_or(0)<risk{defensive=true;}}
  let old_penalty=if f.enemy_delay<=1&&f.enemy_choices_after>=f.enemy_choices_before{24+16*streak.min(4)as i32+if f.enemy_delay<=0{24}else{0}+12*f.own_delay.max(0).min(2)}else{0};
  let sequence_own_delay=(child.distance(t,false)-bare_own).max(0);
  let mut retained=child.distance(o,false)-bare.distance(o,false);
  for reply in child.moves(o){
   if expired(){details.complete=false;details.costs.clear();return (base,details);}
   let mut end=child.clone();end.make(reply);let mut reference=bare.clone();reference.p=end.p;
   retained=retained.min(end.distance(o,false)-reference.distance(o,false));
  }
  let sequence_penalty=sequence_cost(retained,sequence_own_delay,opportunity,removed+1);
  // Existing measured reserve costs already price this wall; do not add the
  // same stock cost twice. Mandatory/measured defensive walls remain exempt.
  let already_priced=reserve.costs.iter().any(|c|action_code(&c.action)==a&&c.penalty>0);
  let remaining=p.left[t]-1;
  let reserve_penalty=if p.left[o]>remaining&&remaining<=2&&!already_priced{(3-remaining)as i32*12}else{0};
  let penalty=if defensive{0}else{(old_penalty+sequence_penalty+reserve_penalty).min(160)};
  out[a as usize]-=penalty;details.costs.push(WeakWallCost{action:decode(a),penalty,enemy_delay:f.enemy_delay,own_delay:f.own_delay,sequence_penalty:if defensive{0}else{sequence_penalty},reserve_penalty:if defensive{0}else{reserve_penalty},retained_sequence_delay:retained,sequence_own_delay,opportunity_progress:opportunity,defensive_exception:defensive});
 }
 details.penalized_actions=details.costs.iter().filter(|c|c.penalty>0).count();(out,details)
}
