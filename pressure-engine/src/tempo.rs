// Development-only root utility. The normal service never enables this flag.
fn tempo_enabled()->bool{std::env::var("QUORIDOR_TEMPO_MODE").as_deref()==Ok("on")}
fn attack_gain(p:&mut Position,attacker:usize,until:f64,cancel:&AtomicBool)->Option<i32>{
 let target=1-attacker;let own=p.distance(attacker,false);let enemy=p.distance(target,false);let mut best=0;
 for a in 81..209 {if now()>=until||cancel.load(Ordering::Relaxed){return None;}if !p.fits(a){continue;}p.toggle(a,true);let mine=p.distance(attacker,false);let theirs=p.distance(target,false);p.toggle(a,false);
  if mine<100&&theirs<100{best=best.max(theirs-enemy-(mine-own)-1);}
 }Some(best)
}
fn tempo_penalty(p:&mut Position,a:u16,original_danger:i32,until:f64,cancel:&AtomicBool)->Option<i32>{
 let f=pressure_feature(p,a);let t=p.turn;let o=1-t;
 if a<81||p.left[t]<2||p.left[o]==0||f.enemy_delay!=0||f.own_delay!=0||f.near_cut_edges>0&&(!prep_enabled()||f.enemy_choices_after<f.enemy_choices_before){return Some(0);}
 let own=p.distance(t,false);let enemy=p.distance(o,false);let original_map=p.goal_map(o);let u=p.make(a);let replies=p.moves(o);
 // Optimistic two-wall payback protects preparation with a plausible follow-up.
 // This is not a prediction that the opponent will stand still.
 let mut payoff=false;let mut complete=true;
 for b in 81..209 {if now()>=until||cancel.load(Ordering::Relaxed){complete=false;break;}if !p.fits(b){continue;}p.toggle(b,true);let mine=p.distance(t,false);let theirs=p.distance(o,false);p.toggle(b,false);
  if mine<100&&theirs<100&&theirs-enemy-(mine-own)>=2{
   if prep_enabled(){p.toggle(b,true);let after=p.goal_map(o);p.toggle(b,false);if !replies.iter().all(|&q|!goal(q as usize,o)&&after[q as usize]>=0&&after[q as usize]-original_map[q as usize]-(mine-own)as i16>=2){continue;}}
   payoff=true;break;
  }
 }
 let danger=if payoff||!complete{Some(original_danger)}else{attack_gain(p,o,until,cancel)};p.unmake(u);
 if !complete{return None;}
 danger.map(|d|if !payoff&&d>=original_danger{16}else{0})
}
fn tempo_biases(p:&mut Position,base:[i32;209],deadline:f64,cancel:&AtomicBool)->[i32;209]{
 if !tempo_enabled()||p.walls.count_ones()<4||p.left[0]==0||p.left[1]==0{return base;}
 let until=(now()+60.).min(now()+(deadline-now()).max(0.)*0.15);
 let Some(danger)=attack_gain(p,1-p.turn,until,cancel)else{return base;};let mut result=base;
 for a in p.actions(){let Some(penalty)=tempo_penalty(p,a,danger,until,cancel)else{return base;};result[a as usize]-=penalty;}
 result
}
pub fn explain_tempo(value:serde_json::Value)->serde_json::Value{
 let Ok(s)=serde_json::from_value::<State>(value)else{return serde_json::json!({"error":"invalid state"});};let Ok(mut p)=Position::from_state(&s)else{return serde_json::json!({"error":"illegal state"});};let actions=p.actions();let start=now();let cancel=AtomicBool::new(false);let base=pressure_biases(&mut p,start+10000.,&cancel);let adjusted=tempo_biases(&mut p,base,start+10000.,&cancel);
 let rows:Vec<_>=actions.into_iter().filter(|a|base[*a as usize]!=adjusted[*a as usize]).map(|a|serde_json::json!({"action":decode(a),"oldBias":base[a as usize],"candidateBias":adjusted[a as usize]})).collect();serde_json::json!({"enabled":tempo_enabled(),"elapsedMs":now()-start,"changes":rows})
}
#[cfg(test)]mod tempo_tests{use super::*;
 #[test]fn tempo_probe_restores_position_and_times_out_without_partial_biases(){
  let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":5},{"x":4,"y":3}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();let mut p=Position::from_state(&s).unwrap();let key=p.key();let edges=p.edges;let cancel=AtomicBool::new(false);
  for a in p.actions(){let value=tempo_penalty(&mut p,a,0,now()+1000.,&cancel);assert!(matches!(value,Some(0)|Some(16)));assert!(p.key()==key);assert_eq!(p.edges,edges);}
  assert_eq!(tempo_penalty(&mut p,81,0,0.,&cancel),None);assert!(p.key()==key);
 }
}
