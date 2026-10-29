fn pressure_enabled()->bool { match std::env::var("QUORIDOR_PRESSURE_MODE").as_deref(){Ok("on")=>true,Ok("off")|Err(_)=>false,_=>panic!("unknown pressure mode")} }
#[derive(Clone,Serialize,Default)]
#[serde(rename_all="camelCase")]
pub struct PressureFeatures {
    pub action: Option<Action>, pub enemy_delay:i32, pub own_delay:i32, pub placement_cost:i32,
    pub net_gain:i32, pub first_contact:Option<usize>, pub near_cut_edges:usize,
    pub retained_delay:i32, pub enemy_choices_before:usize, pub enemy_choices_after:usize,
    pub connections:i32, pub legacy_order_score:i32, pub bias:i32,
}
fn from_map(p:&Position,start:usize)->[i16;81]{let mut d=[-1;81];d[start]=0;let mut q=vec![start];let mut head=0;while head<q.len(){let n=q[head];head+=1;for &b in &p.edges[n]{if b>=0&&d[b as usize]<0{d[b as usize]=d[n]+1;q.push(b as usize);}}}d}
fn pressure_feature(p:&mut Position,a:u16)->PressureFeatures {
 let t=p.turn;let o=1-t;let own=p.distance(t,false);let enemy=p.distance(o,false);let old_goal=p.goal_map(o);let reach=from_map(p,p.p[o]);let old_edges=p.edges;
 let before_choices=p.moves(o).len();let contacts=if a>=81{p.connections(a)}else{0};let u=p.make(a);
 let mine=p.distance(t,false);let theirs=p.distance(o,false);let mut f=PressureFeatures{action:Some(decode(a)),enemy_delay:theirs-enemy,own_delay:mine-own,placement_cost:if a>=81{1}else{0},net_gain:(theirs-enemy)-(mine-own)-if a>=81{1}else{0},enemy_choices_before:before_choices,enemy_choices_after:p.moves(o).len(),connections:contacts,..PressureFeatures::default()};
 f.legacy_order_score=if a<81{(own-mine)*1500+250}else{((theirs-enemy)-(mine-own))*1600-130+contacts*180};
 if a>=81&&mine<100&&theirs<100 {
  let after=p.goal_map(o);let mut first=None;let mut cuts=0;
  for n in 0..81{if reach[n]<0||old_goal[n]<0||reach[n]+old_goal[n]!=old_goal[p.p[o]]{continue;}for (direction,&q)in old_edges[n].iter().enumerate(){if q>=0&&old_goal[q as usize]==old_goal[n]-1&&p.edges[n][direction]!=q{let at=reach[n] as usize;first=Some(first.map_or(at,|old:usize|old.min(at)));if at<3{cuts+=1;}}}}
  f.first_contact=first;f.near_cut_edges=cuts;
  let replies=p.moves(o);f.retained_delay=replies.iter().map(|&q|(after[q as usize]-old_goal[q as usize])as i32).min().unwrap_or(0);
  let loses=replies.iter().any(|&q|goal(q as usize,o));
  if !loses&&f.net_gain>=0&&cuts>0 {let at=first.unwrap_or(99);f.bias=(((3-at.min(3))as i32)*5+f.net_gain.min(2)*2+f.retained_delay.max(0).min(2)*2-(mine-own).max(0)*8).clamp(0,24);}
 }
 p.unmake(u);f
}
fn pressure_adjust(score:i32,bias:i32,alpha:i32)->i32 {if score.abs()>WIN-500||alpha.abs()>WIN-500{score}else{score+bias}}
fn pressure_biases(p:&mut Position,deadline:f64,cancel:&AtomicBool)->[i32;209]{let mut result=[0;209];if !pressure_enabled(){return result;}for a in p.actions(){if now()>=deadline||cancel.load(Ordering::Relaxed){return [0;209];}result[a as usize]=pressure_feature(p,a).bias;}result}
fn action_code(a:&Action)->u16 {if a.kind=="move"{(a.y*9+a.x)as u16}else{81+(if a.o==Some("v"){64}else{0})+(a.y*8+a.x)as u16}}
fn pressure_advice(s:&State,a:Option<&Action>)->Option<PressureFeatures>{let a=a?;let mut p=Position::from_state(s).ok()?;let code=action_code(a);if !p.actions().contains(&code){return None;}Some(pressure_feature(&mut p,code))}
pub fn explain_pressure(value:serde_json::Value)->serde_json::Value {let Ok(s)=serde_json::from_value::<State>(value)else{return serde_json::json!({"error":"invalid state"});};let Ok(mut p)=Position::from_state(&s)else{return serde_json::json!({"error":"illegal state"});};let rows:Vec<_>=p.actions().into_iter().map(|a|pressure_feature(&mut p,a)).collect();serde_json::json!({"mode":if pressure_enabled(){"on"}else{"off"},"profile":"candidate","maxBias":24,"pawnDistanceUnit":120,"rows":rows})}
#[cfg(test)]mod pressure_tests{use super::*;
 #[test]fn mate_scores_are_never_changed(){assert_eq!(pressure_adjust(WIN-1,24,0),WIN-1);assert_eq!(pressure_adjust(-WIN+1,24,0),-WIN+1);assert_eq!(pressure_adjust(100,24,0),124);}
 #[test]fn metrics_restore_position_and_bound_bonus(){let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":6},{"x":4,"y":2}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();let mut p=Position::from_state(&s).unwrap();let before=p.key();let edges=p.edges;for a in p.actions(){let f=pressure_feature(&mut p,a);assert!((0..=24).contains(&f.bias));if f.bias>0{assert!(f.net_gain>=0&&f.near_cut_edges>0);}assert!(p.key()==before);assert_eq!(p.edges,edges);}}
}
