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
 risk:i32,delay:i32,attack:Option<Action>,reply:Option<Action>,follow_up:Option<Action>,
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
fn defense_line(p:&Position,target:usize,probe:&mut ChainProbe,until:f64,cancel:&AtomicBool)->Option<DefenseLine>{
 let attacker=1-target;let mut empty=DefenseLine{risk:0,delay:0,attack:None,reply:None,follow_up:None};
 if p.terminal(){return Some(empty);}
 let before=probe.distances(p,target);let baseline=before[0]-before[1];
 let mut start=p.clone();start.turn=attacker;
 if start.moves(attacker).iter().any(|&a|goal(a as usize,attacker)){empty.risk=8;return Some(empty);}
 let mut attacks=if p.left[attacker]>0{chain_candidates(&mut start,target,None,probe,until,cancel)?}else{vec![]};
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
   if q.terminal(){best=Some(DefenseLine{risk:0,delay:0,attack:Some(decode(attack)),reply:Some(decode(response)),follow_up:None});break;}
   let mut follow=q.moves(attacker);
   if q.left[attacker]>0{
    let mut walls=chain_candidates(&mut q,target,None,probe,until,cancel)?;walls.truncate(3);
    if attack>=81{let linked=chain_candidates(&mut q,target,Some(attack),probe,until,cancel)?;for a in linked.into_iter().take(3){if !walls.contains(&a){walls.push(a);}}}
    follow.extend(walls);
   }
   let mut branch=DefenseLine{risk:0,delay:0,attack:Some(decode(attack)),reply:Some(decode(response)),follow_up:None};
   for next in follow{
    if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
    let mut end=q.clone();end.make(next);let after=probe.distances(&end,target);
    let risk=if end.terminal(){8}else{(after[0]-after[1]-baseline-1).clamp(0,8)};
    let delay=(after[0]-before[0]).max(0);
    if risk>branch.risk||risk==branch.risk&&delay>branch.delay{branch.risk=risk;branch.delay=delay;branch.follow_up=Some(decode(next));}
   }
   if best.as_ref().map_or(true,|old|(branch.risk,branch.delay)<(old.risk,old.delay)){best=Some(branch);}
  }
  if let Some(best)=best{if best.risk>worst.risk||best.risk==worst.risk&&best.delay>worst.delay{worst=best;}}
 }
 Some(worst)
}
fn threat_defense_biases(p:&Position,base:[i32;209],deadline:f64,cancel:&AtomicBool,preferred:Option<u16>)->([i32;209],ThreatDefense){
 let started=now();let mut details=ThreatDefense{active:goal_enabled()&&p.left[1-p.turn]>0&&p.walls.count_ones()>=4,complete:true,initial_risk:0,examined_actions:0,elapsed_ms:0.,selected:None,continuation:None,continuation_reviewed:false,choices:vec![]};
 let mut run=||->Option<[i32;209]>{
  if !details.active{return Some(base);}
  let t=p.turn;let cap=if deadline-now()>1500.{120.}else{80.};let until=(now()+cap).min(now()+(deadline-now()).max(0.)*0.20);let mut probe=ChainProbe::new(true);
  let baseline=defense_line(p,t,&mut probe,until,cancel)?;details.initial_risk=baseline.risk;
  let mut original=p.clone();let threats=chain_candidates(&mut original,t,None,&mut probe,until,cancel)?;
  let mut actions=p.moves(t);let before=probe.distances(p,t);let mut attacks=vec![];
  if p.left[t]>0{
   let defensive=defense_walls(p,t,&threats,&mut probe,until,cancel)?;
   if let Some(a)=preferred{if defensive.iter().any(|r|r.0==a){actions.push(a);details.continuation=Some(decode(a));}}
   actions.extend(defensive.iter().take(6).map(|r|r.0));
   for &(a,_) in &defensive{let mut q=p.clone();q.make(a);let after=probe.distances(&q,t);attacks.push((a,(after[1]-before[1]-(after[0]-before[0]))*120+base[a as usize]));}
   attacks.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));actions.extend(attacks.into_iter().take(2).map(|r|r.0));
   // Reserve crossing anchors before the opponent installs the threatening wall.
   for &a in threats.iter().take(4){let cross=if a>=145{a-64}else{a+64};if defensive.iter().any(|r|r.0==cross){actions.push(cross);}}
  }
  if let Some(a)=preferred{if p.moves(t).contains(&a){actions.push(a);details.continuation=Some(decode(a));}}
  actions.sort_unstable();actions.dedup();let forward=forward_choices(p,t,&mut probe).min(2)as i32;let mut out=base;
  for a in actions{
   let mut q=p.clone();q.make(a);let line=defense_line(&q,t,&mut probe,until,cancel)?;let routes=forward_choices(&q,t,&mut probe);
   // Use the same distance unit as the underlying evaluation. The cap prevents
   // a selective four-ply estimate from overwhelming a large strategic score.
   let adjustment=((baseline.risk-line.risk)*120+(routes.min(2)as i32-forward)*12).clamp(-240,240);
   out[a as usize]+=adjustment;details.choices.push(DefenseChoice{action:decode(a),risk:line.risk,delay:line.delay,forward_choices:routes,adjustment,line});
  }
  Some(out)
 };
 let result=run();details.elapsed_ms=now()-started;
 if let Some(out)=result{details.examined_actions=details.choices.len();details.continuation_reviewed=details.continuation.as_ref().is_some_and(|a|details.choices.iter().any(|c|action_code(&c.action)==action_code(a)));(out,details)}else{details.complete=false;details.choices.clear();(base,details)}
}
