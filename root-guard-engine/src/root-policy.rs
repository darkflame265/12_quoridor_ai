#[derive(Clone,Copy,Debug,PartialEq)]
enum RootMode {Off,Root,Tactical,Full}
fn root_mode()->RootMode {
 static MODE:std::sync::OnceLock<RootMode>=std::sync::OnceLock::new();
 *MODE.get_or_init(||match std::env::var("QUORIDOR_ROOT_GUARD_MODE").as_deref(){
  Ok("off")=>RootMode::Off,Ok("tactical")=>RootMode::Tactical,Ok("full")=>RootMode::Full,Ok("root")|Err(_)=>RootMode::Root,Ok(other)=>panic!("Invalid root mode: {other}")})
}
fn reference_full_width()->bool {root_mode()==RootMode::Full}
fn protect_root(depth:usize,a:u16,flags:&[bool;209])->bool {
 match root_mode(){RootMode::Off=>false,RootMode::Full=>true,RootMode::Root=>depth<5,RootMode::Tactical=>flags[a as usize]}
}
impl SharedSearch {
 fn root_flags(&self,p:&Position,roots:&[u16])->[bool;209] {
  if root_mode()!=RootMode::Tactical {return [false;209];}
  self.tactical_root_flags(p,roots)
 }
 fn tactical_root_flags(&self,p:&Position,roots:&[u16])->[bool;209] {
  let mut flags=[false;209];let enemy=1-p.turn;let mut next=p.clone();
  // Positive net gain includes the turn spent placing the wall. It is a
  // geometric threat estimate, not a proof of a forced win.
  if p.moves(enemy).into_iter().any(|a|goal(a as usize,enemy)) {
   for &a in roots {let undo=next.make(a);let safe=next.terminal()||!next.moves(enemy).into_iter().any(|q|goal(q as usize,enemy));next.unmake(undo);if safe {flags[a as usize]=true;}}
  }else{
   let attack=self.wall_threat(&mut next,enemy);
   if attack.gain>0 {if let Some(a)=attack.action {if roots.contains(&a){flags[a as usize]=true;}}}
  }
  flags
 }
}
#[derive(Deserialize)]
pub struct BranchInput {state:State,actions:Vec<u16>,depth:i32}
pub fn branch_audit(inputs:&[BranchInput])->serde_json::Value {
 assert_eq!(root_mode(),RootMode::Full);let mut rows=vec![];
 for input in inputs {
  let mut p=Position::from_state(&input.state).unwrap();let key=p.key();let edges=p.edges;let roots=p.actions();
  let cache=SharedSearch{profile:2,..SharedSearch::default()};let flags=cache.tactical_root_flags(&p,&roots);let mut actions=vec![];
  for &a in &input.actions {assert!(roots.contains(&a));let shared=Arc::new(SharedSearch{profile:2,..SharedSearch::default()});let mut search=NativeSearcher::new(shared);search.prepare(now()+15000.,Arc::new(AtomicBool::new(false)));
   let undo=p.make(a);let start=now();let score=-search.negamax(&mut p,input.depth-1,-INF,INF,1,&mut vec![key]).expect("Branch reference timed out");p.unmake(undo);
   actions.push(serde_json::json!({"action":a,"score":score,"nodes":search.nodes,"elapsedMs":now()-start,"tacticalProtected":flags[a as usize]}));
  }
  assert!(key==p.key());assert_eq!(edges,p.edges);rows.push(serde_json::json!({"depth":input.depth,"actions":actions}));
 }serde_json::json!(rows)
}
#[cfg(test)] mod root_tests {
 use super::*;
 #[test] fn tactical_flags_preserve_all_legal_immediate_defenses(){
  let s:State=serde_json::from_str(r#"{"p":[{"x":0,"y":5},{"x":4,"y":7}],"walls":[],"left":[1,1],"turn":0,"winner":null}"#).unwrap();
  let mut p=Position::from_state(&s).unwrap();let key=p.key();let edges=p.edges;let roots=p.actions();let cache=SharedSearch{profile:2,..SharedSearch::default()};let flags=cache.tactical_root_flags(&p,&roots);let mut count=0;
  for a in roots {let u=p.make(a);let safe=p.terminal()||!p.moves(1).into_iter().any(|q|goal(q as usize,1));p.unmake(u);if safe {count+=1;}assert_eq!(flags[a as usize],safe);}
  assert!(count>0);assert!(key==p.key());assert_eq!(edges,p.edges);
 }
}
