use std::time::{Duration,Instant};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
#[derive(Clone,serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct SearchResult {
    pub pv:Vec<Action>,pub score:i32,pub depth:usize,pub nodes:u64,
    pub elapsed_ms:f64,pub engine:String,pub done:bool,
}
#[derive(Clone,Copy)]
struct CacheEntry{depth:i32,score:i32,best:u16,flag:u8}
pub struct Atlas6{table:HashMap<Key,CacheEntry>,nodes:u64,deadline:Instant,cancel:Arc<AtomicBool>}
impl Atlas6 {
 pub fn new()->Self{Self{table:HashMap::new(),nodes:0,deadline:Instant::now(),cancel:Arc::new(AtomicBool::new(false))}}
 fn check(&self)->bool{!self.cancel.load(Ordering::Relaxed)&&Instant::now()<self.deadline}
 fn evaluate(p:&mut Position)->i32{
  if p.terminal(){return -29000;}
  let t=p.turn;let o=1-t;
  let mine=p.distance(t,false);let theirs=p.distance(o,false);
  let stock=(p.left[t] as i32-p.left[o] as i32)*22;
  (theirs-mine)*180+stock
 }
 fn ordered(&mut self,p:&mut Position,tt:Option<u16>)->Vec<u16>{
  let t=p.turn;let o=1-t;let before=(p.distance(t,false),p.distance(o,false));
  let mut list=Vec::new();
  for a in p.actions(){
   let u=p.make(a);
   let mine=p.distance(t,false);let enemy=p.distance(o,false);
   let score=if p.terminal(){1_000_000}else if a<81{(before.0-mine)*1000+150}else{((enemy-before.1)-(mine-before.0))*1300-120};
   p.unmake(u);
   list.push((a,score+if Some(a)==tt{2_000_000}else{0}));
  }
  list.sort_unstable_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
  list.into_iter().map(|x|x.0).collect()
 }
 // Keep forced goal blocks and high-impact path cuts even when their
 // immediate ordering score is low. Every retained wall remains legal.
 fn tactical_candidates(&mut self,p:&mut Position,tt:Option<u16>,limit:usize)->Vec<u16>{
  let ranked=self.ordered(p,tt);
  if ranked.len()<=limit{return ranked;}
  let t=p.turn;let enemy=1-t;
  let before=(p.distance(t,false),p.distance(enemy,false));
  let mut forcing=Vec::new();
  for &a in &ranked{
   if a<81{
    let u=p.make(a);let win=p.terminal();p.unmake(u);
    if win{forcing.push(a);}
    continue;
   }
   let u=p.make(a);
   let enemy_dist=p.distance(enemy,false);
   let own_dist=p.distance(t,false);
   p.unmake(u);
   // Blocks that materially damage the opponent's race are protected.
   if (enemy_dist-before.1)-(own_dist-before.0)>=2{forcing.push(a);}
  }
  let mut out:Vec<u16>=ranked.iter().take(limit).copied().collect();
  for a in forcing{if !out.contains(&a){out.push(a);}}
  // Protect every legal wall that stops a one-step goal by the opponent.
  if p.distance(enemy,false)<=1 && p.left[t]>0{
   for &a in &ranked{
    if a<81 || out.contains(&a){continue;}
    let u=p.make(a);
    let stopped=p.distance(enemy,false)>1;
    p.unmake(u);
    if stopped{out.push(a);}
   }
  }

  out
 } // A bounded tactical continuation prevents the search horizon from
 // silently ending in the middle of a forcing wall exchange.
 fn tactical_leaf(&mut self,p:&mut Position,mut alpha:i32,beta:i32,ply:i32,remaining:i32)->Result<i32,()>{
  self.nodes+=1;
  if self.nodes&31==0&&!self.check(){return Err(());}
  if p.terminal(){return Ok(-29000+ply);}
  if p.moves(p.turn).into_iter().any(|a|goal(a as usize,p.turn)){return Ok(28999-ply);}
  let stand=Self::evaluate(p);
  if remaining<=0 || p.distance(1-p.turn,false)>2{return Ok(stand);}
  let t=p.turn;let o=1-t;
  let own=p.distance(t,false);let enemy=p.distance(o,false);
  // Only search forcing continuations. Do not assume a quiet evaluation
  // is safe while the other pawn is one move from its goal.
  let urgent=enemy<=1;
  let mut candidates=Vec::new();
  for a in p.actions(){
   if a<81{if urgent{candidates.push((a,-1));}continue;}
   let u=p.make(a);
   let own_after=p.distance(t,false);let enemy_after=p.distance(o,false);
   p.unmake(u);
   let swing=(enemy_after-enemy)-(own_after-own);
   if swing>=2 || urgent && enemy_after>enemy{
    candidates.push((a,swing));
   }
  }
  if candidates.is_empty(){return Ok(stand);}
  candidates.sort_unstable_by(|a,b|b.1.cmp(&a.1));
  // Stand pat is only safe when there is no immediate opponent goal threat.
  let mut best=if urgent{-32000}else{stand};
  if !urgent{alpha=alpha.max(stand);if alpha>=beta{return Ok(alpha);}}
  for (a,_) in candidates.into_iter().take(if urgent{12}else{3}){
   let u=p.make(a);
   let r=self.tactical_leaf(p,-beta,-alpha,ply+1,remaining-1);
   p.unmake(u);
   let score=-r?;
   best=best.max(score);alpha=alpha.max(score);
   if alpha>=beta{break;}
  }
  Ok(best)
 } fn search_node(&mut self,p:&mut Position,depth:i32,mut alpha:i32,beta:i32,ply:i32)->Result<i32,()>{
  self.nodes+=1;if self.nodes&31==0&&!self.check(){return Err(());}
  if p.terminal(){return Ok(-29000+ply);}
  if depth<=0{return self.tactical_leaf(p,alpha,beta,ply,4);}
  let key=p.key();let cached=self.table.get(&key).copied();
  if let Some(e)=cached{if e.depth>=depth{if e.flag==0||e.flag==1&&e.score<=alpha||e.flag==2&&e.score>=beta{return Ok(e.score);}}}
  let original=alpha;let mut best=-32000;let mut best_move=0;
  let actions=self.tactical_candidates(p,cached.map(|e|e.best),if depth>=3{14}else{20});
  for (i,a) in actions.into_iter().enumerate(){
   let u=p.make(a);
   // PVS: establish the first principal variation with a full window;
   // probe siblings with a narrow window and re-search only on improvement.
   let value=if i==0 || alpha<=-31000 {
    self.search_node(p,depth-1,-beta,-alpha,ply+1).map(|v|-v)
   }else{
    match self.search_node(p,depth-1,-alpha-1,-alpha,ply+1){
     Ok(v) if -v>alpha && -v<beta => self.search_node(p,depth-1,-beta,-alpha,ply+1).map(|v|-v),
     other=>other.map(|v|-v),
    }
   };
   p.unmake(u);
   let score=value?;
   if score>best{best=score;best_move=a;}
   alpha=alpha.max(score);if alpha>=beta{break;}
  }
  if best==-32000{return Ok(Self::evaluate(p));}
  if self.table.len()>400_000{self.table.clear();}
  self.table.insert(key,CacheEntry{depth,score:best,best:best_move,flag:if best<=original{1}else if best>=beta{2}else{0}});
  Ok(best)
 }
 pub fn search(&mut self,state:&State,ms:f64,_cores:usize,cancel:Arc<AtomicBool>)->Result<SearchResult,String>{
  let start=Instant::now();self.deadline=start+Duration::from_secs_f64((ms.clamp(1.,30000.)-12.).max(1.)/1000.);
  self.cancel=cancel;self.nodes=0;
  let mut p=Position::from_state(state)?;
  let mut result=SearchResult{pv:vec![],score:0,depth:0,nodes:0,elapsed_ms:0.,engine:"Atlas 6 · Independent Alpha-Beta".into(),done:true};
  if p.terminal(){return Ok(result);}
  let mut roots=self.tactical_candidates(&mut p,None,24);
  if roots.is_empty(){return Ok(result);}
  result.pv=vec![decode(roots[0])];
  for depth in 1..=48{
   if !self.check(){break;}
   let mut best=-32000;let mut chosen=roots[0];let mut complete=true;
   for &a in &roots{
    let u=p.make(a);
    let r=self.search_node(&mut p,depth-1,-32000,32000,1);
    p.unmake(u);
    match r{Ok(score)=>{let score=-score;if score>best{best=score;chosen=a;}},Err(())=>{complete=false;break;}}
   }
   if !complete{break;}
   result.score=best;result.depth=depth as usize;result.pv=vec![decode(chosen)];
   roots.retain(|&a|a!=chosen);roots.insert(0,chosen);
   if best>28000{break;}
  }
  result.nodes=self.nodes;result.elapsed_ms=start.elapsed().as_secs_f64()*1000.;
  Ok(result)
 }
}
#[cfg(test)]
mod atlas6_tests{
 use super::*;
 #[test]fn preserves_every_one_step_goal_block(){
  let s=serde_json::from_str::<State>(r#"{"p":[{"x":4,"y":8},{"x":4,"y":7}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
  let mut p=Position::from_state(&s).unwrap();
  let mut e=Atlas6::new();
  let all=p.actions();
  let mut defenses=Vec::new();
  for a in all{
   if a<81{continue;}
   let u=p.make(a);
   let blocks=p.distance(1,false)>1;
   p.unmake(u);
   if blocks{defenses.push(a);}
  }
  assert!(!defenses.is_empty());
  let selected=e.tactical_candidates(&mut p,None,1);
  for a in defenses{assert!(selected.contains(&a),"missing legal immediate goal defense: {a}");}
 } #[test]fn legal_opening(){let s=serde_json::from_str::<State>(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
 let mut e=Atlas6::new();let r=e.search(&s,100.,1,Arc::new(AtomicBool::new(false))).unwrap();
 assert!(!r.pv.is_empty());assert!(r.depth>=1);assert!(r.elapsed_ms<350.);
 }
}
