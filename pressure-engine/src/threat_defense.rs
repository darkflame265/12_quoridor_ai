// Root utility from coherent opponent attack / our reply / opponent follow-up.
// All values are selective heuristics, never a full-game certificate.
fn parse_defense_reply(value:&serde_json::Value)->Option<u16>{
 let x=value["x"].as_u64()?;let y=value["y"].as_u64()?;
 match value["type"].as_str()?{
  "move" if x<9&&y<9=>Some((y*9+x)as u16),
  "wall" if x<8&&y<8=>match value["o"].as_str()?{"h"=>Some((81+y*8+x)as u16),"v"=>Some((145+y*8+x)as u16),_=>None},
  _=>None,
 }
}
impl NativeEngine{
 pub fn set_defense_reply(&mut self,value:serde_json::Value){self.shared.root_defense_reply.store(parse_defense_reply(&value).map_or(209,|a|a as usize),Ordering::Relaxed);}
}
pub fn explain_defense(value:serde_json::Value)->serde_json::Value{
 let Ok(state)=serde_json::from_value::<State>(value["state"].clone())else{return serde_json::json!({"error":"invalid state"});};
 let Ok(p)=Position::from_state(&state)else{return serde_json::json!({"error":"illegal state"});};
 let cancel=AtomicBool::new(false);let deadline=now()+value["ms"].as_f64().unwrap_or(500.).clamp(1.,2000.);
 let (biases,details)=threat_defense_biases(&p,[0;209],deadline,&cancel,parse_defense_reply(&value["state"]["defenseReply"]));
 let candidates=details.choices.clone();let adjustments:Vec<_>=biases.into_iter().enumerate().filter(|(_,v)|*v!=0).collect();
 serde_json::json!({"details":details,"candidates":candidates,"adjustments":adjustments,"proof":false})
}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct DefenseLine{
 risk:i32,delay:i32,arrival_margin:i32,distances:[i32;2],attack:Option<Action>,reply:Option<Action>,follow_up:Option<Action>,
}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct DefenseChoice{
 action:Action,risk:i32,delay:i32,forward_choices:usize,adjustment:i32,line:DefenseLine,
}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ThreatDefense{
 active:bool,complete:bool,initial_risk:i32,examined_actions:usize,elapsed_ms:f64,
 selected:Option<DefenseChoice>,continuation:Option<Action>,continuation_reviewed:bool,#[serde(skip)]choices:Vec<DefenseChoice>,
}
impl ThreatDefense{
 // Review a newly selected root without changing the utility used by the
 // completed search. Changing that utility here would invalidate its score.
 fn review_selected(&mut self,state:&State,action:Option<&Action>,deadline:f64,cancel:&AtomicBool){
  self.select(action);
  if !self.active||!self.complete||self.selected.is_some()||self.elapsed_ms>=220.{return;}
  let Some(action)=action else{return;};let a=action_code(action);
  let Ok(mut p)=Position::from_state(state)else{return;};
  if !p.actions().contains(&a){return;}
  let started=now();let until=(started+30.).min(deadline);
  if until<=started||cancel.load(Ordering::Relaxed){return;}
  let mut probe=ChainProbe::new(true);let mut q=p.clone();q.make(a);
  if let Some(line)=defense_line(&q,p.turn,&mut probe,until,cancel){
   let routes=forward_choices(&q,p.turn,&mut probe);
   self.choices.push(DefenseChoice{action:decode(a),risk:line.risk,delay:line.delay,forward_choices:routes,adjustment:0,line});
   self.examined_actions=self.choices.len();self.select(Some(action));
  }
  self.elapsed_ms+=now()-started;
 }

 fn select(&mut self,action:Option<&Action>){self.selected=action.and_then(|a|self.choices.iter().find(|c|action_code(&c.action)==action_code(a)).cloned());}
 fn protect(&self,a:u16)->bool{self.complete&&self.choices.iter().any(|c|action_code(&c.action)==a&&(self.initial_risk>=2||c.risk>=2||c.risk<self.initial_risk||self.continuation.as_ref().is_some_and(|r|action_code(r)==a)))}
}
fn forward_choices(p:&Position,target:usize,probe:&mut ChainProbe)->usize{
 let maps=probe.geometry(p);let n=p.p[target];
 p.edges[n].iter().filter(|&&q|q>=0&&maps[target][q as usize]>=0&&maps[target][q as usize]<maps[target][n]).count()
}
fn defense_walls(p:&Position,target:usize,threats:&[u16],probe:&mut ChainProbe,until:f64,cancel:&AtomicBool)->Option<Vec<(u16,i32)>>{
 let before=probe.distances(p,target);let mut rows=vec![];
 for a in 81..209{
  if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
  if !p.fits(a){continue;}let mut q=p.clone();q.make(a);let after=probe.distances(&q,target);
  if after[0]>=100||after[1]>=100{continue;}
  let denies=threats.iter().filter(|&&b|!q.fits(b)).count()as i32;
  let progress=before[0]-after[0];
  rows.push((a,denies*160+progress*120+(after[1]-before[1])*40+forward_choices(&q,target,probe).min(2)as i32*8));
 }
 rows.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));Some(rows)
}
// Scan all legal first walls before limiting the continuation tree. A dangerous
// immediate detour must not disappear because its connectivity rank was low.
fn immediate_attacks(p:&Position,target:usize,probe:&mut ChainProbe,until:f64,cancel:&AtomicBool)->Option<Vec<u16>>{
 let before=probe.distances(p,target);let mut rows=vec![];
 for a in 81..209{
  if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
  if !p.fits(a){continue;}
  let mut q=p.clone();q.turn=1-target;q.make(a);let after=probe.distances(&q,target);
  if after[0]>=100||after[1]>=100{continue;}
  rows.push((a,(after[0]-before[0]-(after[1]-before[1]))*120+(after[0]-before[0])*12));
 }
 rows.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
 let mut result:Vec<u16>=rows.into_iter().take(4).map(|r|r.0).collect();
 let mut root=p.clone();root.turn=1-target;
 for a in chain_candidates(&mut root,target,None,probe,until,cancel)?.into_iter().take(2){if !result.contains(&a){result.push(a);}}
 Some(result)
}
fn defense_line(p:&Position,target:usize,probe:&mut ChainProbe,until:f64,cancel:&AtomicBool)->Option<DefenseLine>{
 let attacker=1-target;let mut empty=DefenseLine{risk:0,delay:0,arrival_margin:-10000,distances:[0,0],attack:None,reply:None,follow_up:None};
 if p.terminal(){return Some(empty);}
 let before=probe.distances(p,target);let baseline=before[0]-before[1];
 let mut start=p.clone();start.turn=attacker;
 if start.moves(attacker).iter().any(|&a|goal(a as usize,attacker)){empty.risk=8;empty.arrival_margin=10000;return Some(empty);}
 let mut attacks=if p.left[attacker]>0{immediate_attacks(&start,target,probe,until,cancel)?}else{vec![]};
 // Advancing is an actual opponent choice as well, not a free pass between walls.
 let mut advances=start.moves(attacker);advances.sort_by_key(|&a|{let mut q=start.clone();q.make(a);q.distance(attacker,false)});attacks.extend(advances.into_iter().take(2));
 let mut worst=empty;
 for attack in attacks{
  if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
  let mut hit=start.clone();hit.make(attack);
  let mut anchors=if hit.left[attacker]>0{chain_candidates(&mut hit,target,None,probe,until,cancel)?}else{vec![]};anchors.truncate(4);
  if attack>=81&&hit.left[attacker]>0{for a in chain_candidates(&mut hit,target,Some(attack),probe,until,cancel)?.into_iter().take(3){if !anchors.contains(&a){anchors.push(a);}}}
  let mut replies=hit.moves(target);
  if hit.left[target]>0{replies.extend(defense_walls(&hit,target,&anchors,probe,until,cancel)?.into_iter().take(4).map(|r|r.0));}
  let mut best:Option<DefenseLine>=None;
  for response in replies{
   let mut q=hit.clone();q.make(response);
   if q.terminal(){best=Some(DefenseLine{risk:0,delay:0,arrival_margin:-10000,distances:[0,0],attack:Some(decode(attack)),reply:Some(decode(response)),follow_up:None});break;}
   let mut follow=q.moves(attacker);
   if q.left[attacker]>0{
    let mut walls=chain_candidates(&mut q,target,None,probe,until,cancel)?;walls.truncate(3);
    if attack>=81{let linked=chain_candidates(&mut q,target,Some(attack),probe,until,cancel)?;for a in linked.into_iter().take(3){if !walls.contains(&a){walls.push(a);}}}
    follow.extend(walls);
   }
   let mut branch=DefenseLine{risk:0,delay:0,arrival_margin:-10000,distances:[0,0],attack:Some(decode(attack)),reply:Some(decode(response)),follow_up:None};
   for next in follow{
    if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
    let mut end=q.clone();end.make(next);let after=probe.distances(&end,target);
    let risk=if end.terminal(){8}else{(after[0]-after[1]-baseline-1).clamp(0,8)};
    let delay=(after[0]-before[0]).max(0);
    let margin=if end.terminal(){10000}else{(after[0]-after[1])*120+(end.left[attacker]as i32-end.left[target]as i32)*24};
    if margin>branch.arrival_margin{branch.risk=risk;branch.delay=delay;branch.arrival_margin=margin;branch.distances=after;branch.follow_up=Some(decode(next));}
   }
   if best.as_ref().map_or(true,|old|branch.arrival_margin<old.arrival_margin){best=Some(branch);}
  }
  if let Some(best)=best{if best.arrival_margin>worst.arrival_margin{worst=best;}}
 }
 Some(worst)
}
// Keep a selective risk correction below one pawn-distance unit even when
// comparing the most favored and most penalized candidates (96 < 120).
// The actual search still decides whether a retreat is necessary.
fn defense_adjustment(initial:i32,risk:i32,routes:i32,forward:i32)->i32{
 match std::env::var("QUORIDOR_DEFENSE_BIAS").as_deref(){
  Ok("off")=>0,
  Ok("legacy")=>((initial-risk)*120+(routes-forward)*12).clamp(-240,240),
  _=>((initial-risk)*24+(routes-forward)*6).clamp(-48,48),
 }
}
fn threat_defense_biases(p:&Position,base:[i32;209],deadline:f64,cancel:&AtomicBool,preferred:Option<u16>)->([i32;209],ThreatDefense){
 let started=now();let mut details=ThreatDefense{active:goal_enabled()&&p.left[1-p.turn]>0&&p.walls.count_ones()>=4,complete:true,initial_risk:0,examined_actions:0,elapsed_ms:0.,selected:None,continuation:None,continuation_reviewed:false,choices:vec![]};
 let mut run=||->Option<[i32;209]>{
  if !details.active{return Some(base);}
  let t=p.turn;let cap=if deadline-now()>1500.{120.}else{80.};let until=(now()+cap).min(now()+(deadline-now()).max(0.)*0.20);let mut probe=ChainProbe::new(true);
  let baseline=defense_line(p,t,&mut probe,until,cancel)?;details.initial_risk=baseline.risk;
  let original=p.clone();let threats=immediate_attacks(&original,t,&mut probe,until,cancel)?;
  let mut actions=p.moves(t);let before=probe.distances(p,t);let mut attacks=vec![];
  if p.left[t]>0{
   let defensive=defense_walls(p,t,&threats,&mut probe,until,cancel)?;
   if let Some(a)=preferred{if defensive.iter().any(|r|r.0==a){actions.push(a);details.continuation=Some(decode(a));}}
   actions.extend(defensive.iter().take(6).map(|r|r.0));
   // Keep preemptive walls that minimize the absolute race deficit against
   // the same first-attack set, not just walls touching the top-ranked threat.
   let mut prevention=vec![];
   for &(a,_) in &defensive{
    if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
    let mut q=p.clone();q.make(a);let after=probe.distances(&q,t);
    let mut worst=(after[0]-after[1])*120;
    for &attack in &threats{
     if !q.fits(attack){continue;}let mut hit=q.clone();hit.make(attack);
     let d=probe.distances(&hit,t);if d[0]>=100||d[1]>=100{continue;}
     worst=worst.max((d[0]-d[1])*120);
    }
    prevention.push((a,worst));
   }
   prevention.sort_by_key(|&(a,score)|(score,a));
   actions.extend(prevention.into_iter().take(3).map(|r|r.0));
   for &(a,_) in &defensive{let mut q=p.clone();q.make(a);let after=probe.distances(&q,t);attacks.push((a,(after[1]-before[1]-(after[0]-before[0]))*120+base[a as usize]));}
   attacks.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));actions.extend(attacks.into_iter().take(2).map(|r|r.0));
   // Reserve crossing anchors before the opponent installs the threatening wall.
   for &a in threats.iter().take(4){let cross=if a>=145{a-64}else{a+64};if defensive.iter().any(|r|r.0==cross){actions.push(cross);}}
  }
  if let Some(a)=preferred{if p.moves(t).contains(&a){actions.push(a);details.continuation=Some(decode(a));}}
  actions.sort_unstable();actions.dedup();let forward=forward_choices(p,t,&mut probe).min(2)as i32;let mut out=base;
  for a in actions{
   let mut q=p.clone();q.make(a);let line=defense_line(&q,t,&mut probe,until,cancel)?;let routes=forward_choices(&q,t,&mut probe);
   // Risk is an auxiliary signal, not a replacement for arrival progress.
   let adjustment=if std::env::var("QUORIDOR_DEFENSE_BIAS").is_ok(){
    defense_adjustment(baseline.risk,line.risk,routes.min(2)as i32,forward)
   }else{
    // Frontier distance already includes the proposed move and wall stocks;
    // keep its contribution small to avoid double-counting the main search.
    ((baseline.arrival_margin-line.arrival_margin)/5+(routes.min(2)as i32-forward)*6).clamp(-48,48)
   };
   out[a as usize]+=adjustment;details.choices.push(DefenseChoice{action:decode(a),risk:line.risk,delay:line.delay,forward_choices:routes,adjustment,line});
  }
  Some(out)
 };
 let result=run();details.elapsed_ms=now()-started;
 if let Some(out)=result{details.examined_actions=details.choices.len();details.continuation_reviewed=details.continuation.as_ref().is_some_and(|a|details.choices.iter().any(|c|action_code(&c.action)==action_code(a)));(out,details)}else{details.complete=false;details.choices.clear();(base,details)}
}
#[cfg(test)]
mod selected_review_tests{
 use super::*;
 #[test]
 fn new_root_is_reviewed_without_repricing_completed_search(){
  std::env::set_var("QUORIDOR_GOAL_MODE","on");
  let state:State=serde_json::from_value(serde_json::json!({"p":[{"x":4,"y":5},{"x":4,"y":3}],"turn":1,"left":[8,8],"winner":null,"walls":[{"x":0,"y":0,"o":"h","owner":0},{"x":2,"y":0,"o":"h","owner":1},{"x":0,"y":7,"o":"h","owner":0},{"x":2,"y":7,"o":"h","owner":1}]})).unwrap();
  let cancel=AtomicBool::new(false);let p=Position::from_state(&state).unwrap();
  let (_,mut details)=threat_defense_biases(&p,[0;209],now()+2000.,&cancel,None);
  assert!(details.active&&details.complete);
  let mut root=p.clone();let a=root.actions().into_iter().find(|a|!details.choices.iter().any(|c|action_code(&c.action)==*a)).unwrap();
  let action=decode(a);let count=details.choices.len();
  details.review_selected(&state,Some(&action),now()-1.,&cancel);
  assert!(details.selected.is_none());assert_eq!(details.choices.len(),count);
  details.review_selected(&state,Some(&action),now()+2000.,&cancel);
  let selected=details.selected.as_ref().expect("new recommendation must be reviewed");
  assert_eq!(action_code(&selected.action),a);assert_eq!(selected.adjustment,0);
  assert_eq!(details.choices.len(),count+1);
  details.review_selected(&state,Some(&action),now()+2000.,&cancel);
  assert_eq!(details.choices.len(),count+1);
 }
}

#[cfg(test)]mod defense_bias_tests{
 use super::*;
 #[test]fn selective_risk_cannot_outweigh_a_pawn_step(){
  std::env::remove_var("QUORIDOR_DEFENSE_BIAS");
  for initial in 0..=8 {for risk in 0..=8 {for routes in 0..=2 {
   assert!(defense_adjustment(initial,risk,routes,2).abs()<=48);
  }}}
  assert!(defense_adjustment(5,3,2,2)-defense_adjustment(5,7,2,2)<120);
  assert!(defense_adjustment(5,3,2,2)>0);
  assert!(defense_adjustment(5,7,2,2)<0);
 }
}

impl NativeEngine{
 pub fn set_recent_pawns(&mut self,value:&serde_json::Value){
  let mut recent=self.shared.root_recent_pawns.lock().unwrap();recent.clear();
  if let Some(rows)=value.as_array(){recent.extend(rows.iter().rev().take(4).filter_map(|v|v.as_u64()).filter(|&n|n<81).map(|n|n as usize));}
 }
 fn progress_biases(&self,p:&Position,mut biases:[i32;209])->[i32;209]{
  if !goal_enabled(){return biases;}
  let recent=self.shared.root_recent_pawns.lock().unwrap();
  let root=p.clone();let before=root.distance(p.turn,false);
  for a in p.moves(p.turn){
   let visits=recent.iter().filter(|&&n|n==a as usize).count();
   if visits==0||goal(a as usize,p.turn){continue;}
   let mut q=p.clone();q.make(a);let after=q.distance(p.turn,false);
   // A bounded cost for revisiting without progress. Tactical search and mate
   // scores can override it; legal retreats are never removed from the tree.
   if after>=before{biases[a as usize]-=(visits.min(2)as i32)*96;}
  }
  biases
 }
}

#[cfg(test)]mod progress_bias_tests{
 use super::*;
 #[test]fn history_only_penalizes_nonprogress_and_resets(){
  std::env::set_var("QUORIDOR_GOAL_MODE","on");
  let state:State=serde_json::from_value(serde_json::json!({"p":[{"x":4,"y":5},{"x":5,"y":0}],"turn":1,"left":[10,10],"winner":null,"walls":[]})).unwrap();
  let p=Position::from_state(&state).unwrap();let mut engine=NativeEngine::with_profile(1);
  engine.set_recent_pawns(&serde_json::json!([4,14]));
  let bias=engine.progress_biases(&p,[0;209]);
  assert_eq!(bias[4],-96); // e9 revisits without progress
  assert_eq!(bias[14],0); // f8 advances even if visited before
  engine.set_recent_pawns(&serde_json::Value::Null);
  assert!(engine.progress_biases(&p,[0;209]).iter().all(|&n|n==0));
  assert_eq!(pressure_adjust(WIN-1,-192,0),WIN-1);
  assert_eq!(pressure_adjust(-WIN+1,-192,0),-WIN+1);
 }
}
#[cfg(test)]mod connection_arrival_tests{
 use super::*;
 #[test]fn large_observed_detours_survive_first_wall_selection(){
  let cases:serde_json::Value=serde_json::from_str(include_str!("../test-data/connection-detours.json")).unwrap();
  for case in cases.as_array().unwrap(){
   let state:State=serde_json::from_value(case["state"].clone()).unwrap();
   let p=Position::from_state(&state).unwrap();let cancel=AtomicBool::new(false);
   let mut probe=ChainProbe::new(true);
   let attacks=immediate_attacks(&p,0,&mut probe,now()+2000.,&cancel).unwrap();
   let a=parse_defense_reply(&case["attack"]).unwrap();
   assert!(attacks.contains(&a),"observed detour must be examined");
   assert!(p.key()==Position::from_state(&state).unwrap().key());
  }
 }
}
