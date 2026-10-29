fn goal_enabled()->bool{std::env::var("QUORIDOR_GOAL_MODE").as_deref()==Ok("on")}
fn goal_eval_enabled()->bool{std::env::var("QUORIDOR_GOAL_EVAL_MODE").as_deref()==Ok("on")}
fn prep_enabled()->bool{std::env::var("QUORIDOR_PREP_MODE").as_deref()==Ok("on")}
fn goal_deep_enabled()->bool{std::env::var("QUORIDOR_GOAL_DEEP_MODE").as_deref()==Ok("on")}
fn goal_window(p:&Position)->bool{
 if p.left==[0,0]||p.left[0]+p.left[1]>6{return false;}
 let a=p.distance(0,false);let b=p.distance(1,false);a.min(b)<=3&&a.max(b)<=6
}
fn goal_critical(p:&Position,a:u16)->bool{
 if !goal_enabled()||!goal_window(p){return false;}if a<81{return true;}
 let t=p.turn;let before=[p.distance(0,false),p.distance(1,false)];let mut q=p.clone();q.make(a);
 if q.distance(1-t,false)>before[1-t]{return true;}
 // A quiet wall can deny the opponent a goal-blocking anchor by crossing it.
 let k=(a-81)as usize;let x=k%8;let y=(k%64)/8;
 (p.p[0]/9<=3&&y<=1&&x.abs_diff(p.p[0]%9)<=1)||(p.p[1]/9>=5&&y>=6&&x.abs_diff(p.p[1]%9)<=1)
}
fn goal_biases(p:&mut Position,base:[i32;209],deadline:f64,cancel:&AtomicBool)->[i32;209]{
 if !goal_enabled()||!goal_window(p)||p.distance(p.turn,false)>3||p.left[1-p.turn]<2||p.left[p.turn]>p.left[1-p.turn]{return base;}
 let shared=SharedSearch::default();let risk=shared.goal_details(p);if risk.exposure[p.turn]==0{return base;}
 let mut out=base;for a in p.actions(){if now()>=deadline||cancel.load(Ordering::Relaxed){return base;}if a<81{continue;}
  let k=(a-81)as usize;let y=(k%64)/8;let far=if p.turn==0{y>=5}else{y<=2};if !far{continue;}
  let f=pressure_feature(p,a);
  // A one-turn wall buying only one enemy step is not free pressure while
  // our own goal corridor needs scarce defensive replies. Winning scores
  // are still protected by pressure_adjust's mate guard.
  if f.enemy_delay==1&&f.own_delay==0{out[a as usize]-=f.bias+16;}
 }out
}
struct GoalExposure{target:usize,base:[i32;2],nodes:usize,best:i32}
impl GoalExposure{
 fn visit(&mut self,shared:&SharedSearch,p:&mut Position,left:usize,used:i32){
  if self.nodes>=24{return;}self.nodes+=1;
  let target=self.target;let attacker=1-target;let current=[p.distance(0,false),p.distance(1,false)];
  self.best=self.best.max(current[target]-self.base[target]-(current[attacker]-self.base[attacker])-used);
  if left==0{return;}let mut actions=vec![];
  for a in 81..209{if !p.fits(a){continue;}let maps=shared.geometry(p,Some(a));let theirs=maps.maps[target][p.p[target]]as i32;let mine=maps.maps[attacker][p.p[attacker]]as i32;
   if mine>=0&&theirs>current[target]{actions.push((a,theirs-current[target]-(mine-current[attacker])));}}
  actions.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
  for (a,_) in actions{if self.nodes>=24{break;}let turn=p.turn;p.turn=attacker;let u=p.make(a);self.visit(shared,p,left-1,used+1);p.unmake(u);p.turn=turn;}
 }
}
impl SharedSearch{
 fn goal_score(&self,p:&mut Position)->i32{
  let score=self.reserve_score(p);if !goal_enabled()||!goal_eval_enabled()||!goal_window(p){return score;}
  let t=p.turn;let distances=[p.distance(0,false),p.distance(1,false)];let mut risk=[0;2];
  for target in 0..2{if distances[target]>4||p.left[1-target]<2{continue;}let mut exposure=GoalExposure{target,base:distances,nodes:0,best:0};exposure.visit(self,p,p.left[1-target].min(3),0);risk[target]=exposure.best.min(4);}
  score+(risk[1-t]-risk[t])*120
 }
}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct GoalSafety{active:bool,distances:[i32;2],exposure:[i32;2],wall_stock:[usize;2],goal_threat:bool,max_extension:usize,chain_node_cap:usize}
impl SharedSearch{
 fn goal_details(&self,p:&mut Position)->GoalSafety{
  let distances=[p.distance(0,false),p.distance(1,false)];let active=goal_enabled()&&goal_window(p);let mut exposure=[0;2];
  if active{for target in 0..2{if distances[target]>4||p.left[1-target]<2{continue;}let mut work=GoalExposure{target,base:distances,nodes:0,best:0};work.visit(self,p,p.left[1-target].min(3),0);exposure[target]=work.best.min(4);}}
  GoalSafety{active,distances,exposure,wall_stock:p.left,goal_threat:active&&distances[p.turn]<=3&&p.left[1-p.turn]>0,max_extension:if goal_deep_enabled(){2}else{0},chain_node_cap:24}
 }
}
pub fn explain_goal(value:serde_json::Value)->serde_json::Value{
 let Ok(s)=serde_json::from_value::<State>(value["state"].clone())else{return serde_json::json!({"error":"invalid state"});};let Ok(mut p)=Position::from_state(&s)else{return serde_json::json!({"error":"illegal state"});};
 let shared=SharedSearch::default();let start=now();let details=shared.goal_details(&mut p);let adjusted=shared.goal_score(&mut p);serde_json::json!({"details":details,"score":adjusted,"elapsedMs":now()-start,"exact":false})
}
#[cfg(test)]mod goal_tests{use super::*;
 fn fixture()->Position{let rows:serde_json::Value=serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"),"/../evaluation/fixtures/goal-safety-regressions.json"))).unwrap();let row=rows.as_array().unwrap().iter().find(|r|r["id"]=="third-loss-ply-37").unwrap();Position::from_state(&serde_json::from_value::<State>(row["state"].clone()).unwrap()).unwrap()}
 #[test]fn connected_goal_walls_find_exposure_and_restore_both_orientations(){
  let shared=SharedSearch::default();let base=fixture();for mut p in [base.clone(),mirror_position(&base)]{let key=p.key();let edges=p.edges;let mut work=GoalExposure{target:0,base:[p.distance(0,false),p.distance(1,false)],nodes:0,best:0};work.visit(&shared,&mut p,3,0);assert_eq!(work.best,1);assert!(work.nodes<=24);assert!(p.key()==key);assert_eq!(p.edges,edges);}
 }
 #[test]fn goal_window_excludes_opening_and_exact_zero_wall_ending(){let mut p=fixture();assert!(goal_window(&p));p.left=[0,0];assert!(!goal_window(&p));p.left=[10,10];assert!(!goal_window(&p));}
 #[test]fn exposure_diagnostic_does_not_claim_an_exact_game_result(){let p=fixture();let _=p;let invalid=explain_goal(serde_json::json!({"state":null}));assert!(invalid.get("error").is_some());}
}
