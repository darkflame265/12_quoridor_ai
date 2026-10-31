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
 fn search_node(&mut self,p:&mut Position,depth:i32,mut alpha:i32,beta:i32,ply:i32)->Result<i32,()>{
  self.nodes+=1;if self.nodes&31==0&&!self.check(){return Err(());}
  if p.terminal(){return Ok(-29000+ply);}
  if depth<=0{return Ok(Self::evaluate(p));}
  let key=p.key();let cached=self.table.get(&key).copied();
  if let Some(e)=cached{if e.depth>=depth{if e.flag==0||e.flag==1&&e.score<=alpha||e.flag==2&&e.score>=beta{return Ok(e.score);}}}
  let original=alpha;let mut best=-32000;let mut best_move=0;
  let actions=self.ordered(p,cached.map(|e|e.best)); let actions:Vec<u16>=actions.into_iter().take(if depth>=3{14}else{20}).collect();
  for a in actions{
   let u=p.make(a);
   let value=self.search_node(p,depth-1,-beta,-alpha,ply+1);
   p.unmake(u);
   let score=-value?;
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
  let mut roots=self.ordered(&mut p,None); roots.truncate(24);
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
 #[test]fn legal_opening(){let s=serde_json::from_str::<State>(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
 let mut e=Atlas6::new();let r=e.search(&s,100.,1,Arc::new(AtomicBool::new(false))).unwrap();
 assert!(!r.pv.is_empty());assert!(r.depth>=1);assert!(r.elapsed_ms<350.);
 }
}
