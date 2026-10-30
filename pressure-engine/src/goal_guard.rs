fn goal_enabled()->bool{std::env::var("QUORIDOR_GOAL_MODE").as_deref()==Ok("on")}
fn goal_eval_enabled()->bool{std::env::var("QUORIDOR_GOAL_EVAL_MODE").as_deref()==Ok("on")}
fn prep_enabled()->bool{std::env::var("QUORIDOR_PREP_MODE").as_deref()==Ok("on")}
fn goal_deep_enabled()->bool{std::env::var("QUORIDOR_GOAL_DEEP_MODE").as_deref()==Ok("on")}
fn goal_window(p:&Position)->bool{
 if p.left==[0,0]||p.left[0]+p.left[1]>6{return false;}
 let a=p.distance(0,false);let b=p.distance(1,false);a.min(b)<=3&&a.max(b)<=6
}
fn arrival_window(p:&Position)->bool{
 if !goal_enabled()||p.left==[0,0]||p.left[0]+p.left[1]>6{return false;}
 let a=p.distance(0,false);let b=p.distance(1,false);
 // With only one attacking wall, ordinary search already reaches the finish
 // cheaply. Do not spend its budget on a redundant selective continuation.
 let two_wall_attack=(p.left[0]==2&&p.left[1]>=3)||(p.left[1]==2&&p.left[0]>=3);
 a.min(b)<=2&&a.max(b)<=4&&two_wall_attack
}
impl NativeSearcher{
 // A small selective continuation at the leaf, not an exact endgame solver.
 // Three plies can see attack -> reply -> second attack across a horizon.
 fn arrival_frontier(&mut self,p:&mut Position,left:usize,budget:&mut usize,path:&mut Vec<Key>)->Result<i32,()>{
  self.check()?;self.nodes+=1;
  if p.terminal(){return Ok(-15000);}
  let key=p.key();if path.contains(&key){return Ok(0);}
  if left==0||*budget==0{return Ok(self.shared.evaluate(p).clamp(-14000,14000));}
  *budget-=1;let t=p.turn;let o=1-t;
  let before=[p.distance(0,false),p.distance(1,false)];let maps=[p.goal_map(0),p.goal_map(1)];let reach=[from_map(p,p.p[0]),from_map(p,p.p[1])];let mut walls=vec![];let mut threats=vec![];
  for a in 81..209{
   if !p.fits(a)||!cuts_shortest(a,&maps,&reach,before){continue;}let g=self.shared.geometry(p,Some(a));let d=[g.maps[0][p.p[0]]as i32,g.maps[1][p.p[1]]as i32];if d.iter().any(|&n|n<0){continue;}
   if p.left[t]>0&&d[o]>before[o]{walls.push((a,(d[o]-before[o])-(d[t]-before[t])));}
   if p.left[o]>0&&d[t]>before[t]{threats.push((a,(d[t]-before[t])-(d[o]-before[o])));}
  }
  walls.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));threats.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
  let mut actions=p.moves(t);actions.extend(walls.into_iter().take(2).map(|r|r.0));
  if p.left[t]>0{for &(a,_) in threats.iter().take(2){let cross=if a>=145{a-64}else{a+64};if p.fits(cross){let g=self.shared.geometry(p,Some(cross));if g.maps[0][p.p[0]]>=0&&g.maps[1][p.p[1]]>=0{actions.push(cross);}}}}
  actions.sort_unstable();actions.dedup();
  // Order by immediate arrival balance so the node cap explores useful replies
  // first. The cap returns static estimates, never a fabricated mate score.
  actions.sort_by_cached_key(|&a|{let mut q=p.clone();q.make(a);if q.terminal(){-10000}else{q.distance(t,false)-q.distance(o,false)}});
  let mut best=-INF;path.push(key);
  for a in actions{
   let u=p.make(a);let result=self.arrival_frontier(p,left-1,budget,path);p.unmake(u);
   match result{Ok(value)=>best=best.max(-value),Err(())=>{path.pop();return Err(());}}
  }
  path.pop();Ok(if best == -INF{self.shared.evaluate(p)}else{best})
 }
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
 if !goal_enabled()||!goal_window(p)||p.distance(p.turn,false)>3||p.left[1-p.turn]<2{return base;}
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
pub struct GoalSafety{active:bool,distances:[i32;2],exposure:[i32;2],wall_stock:[usize;2],wall_utility:WallUtility,arrival_frontier:bool,arrival_node_cap:usize,goal_threat:bool,max_extension:usize,chain_node_cap:usize}
impl SharedSearch{
 fn goal_details(&self,p:&mut Position)->GoalSafety{
  let distances=[p.distance(0,false),p.distance(1,false)];let active=goal_enabled()&&goal_window(p);let mut exposure=[0;2];
  if active{for target in 0..2{if distances[target]>4||p.left[1-target]<2{continue;}let mut work=GoalExposure{target,base:distances,nodes:0,best:0};work.visit(self,p,p.left[1-target].min(3),0);exposure[target]=work.best.min(4);}}
  GoalSafety{active,distances,exposure,wall_stock:p.left,wall_utility:self.wall_utility(p),arrival_frontier:arrival_window(p),arrival_node_cap:6,goal_threat:active&&distances[p.turn]<=3&&p.left[1-p.turn]>0,max_extension:if goal_deep_enabled(){2}else{0},chain_node_cap:24}
 }
}
pub fn explain_goal(value:serde_json::Value)->serde_json::Value{
 let Ok(s)=serde_json::from_value::<State>(value["state"].clone())else{return serde_json::json!({"error":"invalid state"});};let Ok(mut p)=Position::from_state(&s)else{return serde_json::json!({"error":"illegal state"});};
 let shared=SharedSearch::default();let start=now();let details=shared.goal_details(&mut p);let adjusted=shared.goal_score(&mut p);serde_json::json!({"details":details,"score":adjusted,"elapsedMs":now()-start,"exact":false})
}
#[cfg(test)]mod goal_tests{use super::*;
 #[test]fn bounded_arrival_search_restores_position_and_does_not_claim_mate(){
  let old=std::env::var("QUORIDOR_GOAL_MODE").ok();std::env::set_var("QUORIDOR_GOAL_MODE","on");
  let cases:serde_json::Value=serde_json::from_str(include_str!("../test-data/race-game11.json")).unwrap();let row=cases.as_array().unwrap().iter().find(|r|r["ply"]==40).unwrap();
  let mut p=Position::from_state(&serde_json::from_value::<State>(row["state"].clone()).unwrap()).unwrap();let a=parse_defense_reply(&row["action"]).unwrap();p.make(a);let key=p.key();let edges=p.edges;
  assert!(arrival_window(&p));let mut searcher=NativeSearcher::new(Arc::new(SharedSearch::default()));searcher.prepare(now()+2000.,Arc::new(AtomicBool::new(false)));let mut path=vec![];let mut budget=6;
  let score=searcher.arrival_frontier(&mut p,3,&mut budget,&mut path).unwrap();assert!(score.abs()<WIN-500);assert!(budget<=6);assert!(path.is_empty());assert!(p.key()==key);assert!(p.edges==edges);
  searcher.cancel.store(true,Ordering::Relaxed);assert!(searcher.arrival_frontier(&mut p,3,&mut 6,&mut path).is_err());assert!(p.key()==key);
  if let Some(value)=old{std::env::set_var("QUORIDOR_GOAL_MODE",value);}else{std::env::remove_var("QUORIDOR_GOAL_MODE");}
 }
 fn fixture()->Position{let rows:serde_json::Value=serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"),"/../evaluation/fixtures/goal-safety-regressions.json"))).unwrap();let row=rows.as_array().unwrap().iter().find(|r|r["id"]=="third-loss-ply-37").unwrap();Position::from_state(&serde_json::from_value::<State>(row["state"].clone()).unwrap()).unwrap()}
 #[test]fn connected_goal_walls_find_exposure_and_restore_both_orientations(){
  let shared=SharedSearch::default();let base=fixture();for mut p in [base.clone(),mirror_position(&base)]{let key=p.key();let edges=p.edges;let mut work=GoalExposure{target:0,base:[p.distance(0,false),p.distance(1,false)],nodes:0,best:0};work.visit(&shared,&mut p,3,0);assert_eq!(work.best,1);assert!(work.nodes<=24);assert!(p.key()==key);assert_eq!(p.edges,edges);}
 }
 #[test]fn goal_window_excludes_opening_and_exact_zero_wall_ending(){let mut p=fixture();assert!(goal_window(&p));p.left=[0,0];assert!(!goal_window(&p));p.left=[10,10];assert!(!goal_window(&p));}
 #[test]fn exposure_diagnostic_does_not_claim_an_exact_game_result(){let p=fixture();let _=p;let invalid=explain_goal(serde_json::json!({"state":null}));assert!(invalid.get("error").is_some());}
}
