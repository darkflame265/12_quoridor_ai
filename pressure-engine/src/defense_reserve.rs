// Bounded root heuristic, not a proof of future defensive play.
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct DefenseCost {action:Action,penalty:i32,remaining_risk:i32}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ReserveDefense {
 active:bool,complete:bool,stock:[usize;2],baseline_risk:i32,
 threats_considered:usize,penalized_actions:usize,selected:Option<DefenseCost>,
 #[serde(skip)]
 costs:Vec<DefenseCost>,
}
impl ReserveDefense {
 fn select(&mut self,action:Option<&Action>){self.selected=action.and_then(|a|self.costs.iter().find(|c|action_code(&c.action)==action_code(a)).cloned());}
}
fn reserve_attack(p:&mut Position,a:u16,target:usize)->Option<i32>{
 if !p.fits(a){return None;}
 let before=[p.distance(target,false),p.distance(1-target,false)];
 p.toggle(a,true);let after=[p.distance(target,false),p.distance(1-target,false)];p.toggle(a,false);
 if after[0]>=100||after[1]>=100{return None;}
 Some((after[0]-before[0]-(after[1]-before[1])-1).max(0))
}
fn defense_reserve_biases(p:&mut Position,base:[i32;209],deadline:f64,cancel:&AtomicBool)->([i32;209],ReserveDefense){
 let t=p.turn;let o=1-t;
 let mut details=ReserveDefense{active:goal_enabled()&&(1..=3).contains(&p.left[t])&&p.left[o]>0,
  complete:true,stock:p.left,baseline_risk:0,threats_considered:0,penalized_actions:0,selected:None,costs:vec![]};
 if !details.active{return (base,details);}
 let until=(now()+45.).min(now()+(deadline-now()).max(0.)*0.12);
 let expired=||cancel.load(Ordering::Relaxed)||now()>=until;
 let mut threats=vec![];
 for a in 81..209 {
  if expired(){details.complete=false;return (base,details);}
  if let Some(gain)=reserve_attack(p,a,t){if gain>0{threats.push((a,gain));}}
 }
 threats.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));threats.truncate(6);
 details.threats_considered=threats.len();details.baseline_risk=threats.first().map_or(0,|x|x.1);
 if threats.is_empty(){return (base,details);}
 let mut out=base;
 for a in p.actions(){
  if a<81{continue;}
  if expired(){details.complete=false;details.costs.clear();return (base,details);}
  // Clone so every exit, including cancellation, leaves the root untouched.
  let mut child=p.clone();child.make(a);let mut residual=0;
  for &(attack,_) in &threats {
   if expired(){details.complete=false;details.costs.clear();return (base,details);}
   residual=residual.max(reserve_attack(&mut child,attack,t).unwrap_or(0));
  }
  if residual==0{continue;}
  // Last wall has the highest option value. Opponent stock is capped rather
  // than treated as a sequence of free wall placements.
  let scarcity=(4-p.left[t]) as i32;
  let stock_pressure=p.left[o].saturating_sub(p.left[t]).min(2) as i32;
  let penalty=12*scarcity*(residual.min(4)+stock_pressure);
  out[a as usize]-=penalty;
  details.costs.push(DefenseCost{action:decode(a),penalty,remaining_risk:residual});
 }
 details.penalized_actions=details.costs.len();
 (out,details)
}
