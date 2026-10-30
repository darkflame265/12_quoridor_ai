#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct WeakWallCost{action:Action,penalty:i32,enemy_delay:i32,own_delay:i32}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct WeakWallConsumption{
 active:bool,complete:bool,wall_streak:usize,best_move_progress:i32,penalized_actions:usize,
 selected:Option<WeakWallCost>,#[serde(skip)]costs:Vec<WeakWallCost>,
}
impl WeakWallConsumption{
 fn select(&mut self,action:Option<&Action>){self.selected=action.and_then(|a|self.costs.iter().find(|c|action_code(&c.action)==action_code(a)).cloned());}
}
impl NativeEngine{
 pub fn set_wall_streak(&mut self,value:usize){self.shared.root_wall_streak.store(value.min(10),Ordering::Relaxed);}
}
fn weak_wall_biases(p:&mut Position,base:[i32;209],reserve:&ReserveDefense,streak:usize,deadline:f64,cancel:&AtomicBool)->([i32;209],WeakWallConsumption){
 let t=p.turn;let o=1-t;let own=p.distance(t,false);
 let mut details=WeakWallConsumption{active:goal_enabled()&&p.left[t]>0,complete:true,wall_streak:streak,best_move_progress:0,penalized_actions:0,selected:None,costs:vec![]};
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
 for a in p.actions(){
  if a<81{continue;}if expired(){details.complete=false;details.costs.clear();return (base,details);}
  let f=pressure_feature(p,a);if f.enemy_delay>1||f.enemy_choices_after<f.enemy_choices_before{continue;}
  // Preserve walls that alleviate a measured immediate attack. Missing threat
  // candidates never constitute a safety or winning certificate.
  if reserve.active&&reserve.complete&&reserve.baseline_risk>0&&!reserve.costs.iter().any(|c|action_code(&c.action)==a){continue;}
  if let Some(b)=attack{let mut child=p.clone();child.make(a);if reserve_attack(&mut child,b,t).unwrap_or(0)<risk{continue;}}
  let penalty=24+16*streak.min(4) as i32+if f.enemy_delay<=0{24}else{0}+12*f.own_delay.max(0).min(2);
  out[a as usize]-=penalty;details.costs.push(WeakWallCost{action:decode(a),penalty,enemy_delay:f.enemy_delay,own_delay:f.own_delay});
 }
 details.penalized_actions=details.costs.len();(out,details)
}
