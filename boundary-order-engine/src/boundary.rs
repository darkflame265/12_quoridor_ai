static ORDER_CALLS:AtomicU64=AtomicU64::new(0);
static ORDER_EVALS:AtomicU64=AtomicU64::new(0);
static ORDER_MAX:AtomicU64=AtomicU64::new(0);
fn boundary_mode()->&'static str {
 static MODE:std::sync::OnceLock<String>=std::sync::OnceLock::new();
 MODE.get_or_init(||{let s=std::env::var("QUORIDOR_BOUNDARY_ORDER").unwrap_or("off".into());assert!(["off","window","promote"].contains(&s.as_str()));s})
}
impl NativeSearcher {
 fn boundary_order(&self,p:&mut Position,mut list:Vec<u16>,best:Option<u16>,ply:usize,depth:i32)->Result<Vec<u16>,()> {
  let mode=boundary_mode();if mode=="off" || ply!=1 || depth!=3 || list.len()<=8{return Ok(list);}
  let (start,end)=if mode=="window"{(4,16.min(list.len()))}else{(7,24.min(list.len()))};
  ORDER_CALLS.fetch_add(1,Ordering::Relaxed);ORDER_MAX.fetch_max((end-start) as u64,Ordering::Relaxed);
  let mut base=[0i32;209];for (a,score) in self.shared.ranked(p){base[a as usize]=score;}
  let mut selected=vec![];
  for i in start..end {
   self.check()?;let a=list[i];let mut score=base[a as usize]+self.history[p.turn][a as usize];
   if Some(a)==best{score+=10000000;}else if self.killers.get(ply).is_some_and(|v|v.contains(&a)){score+=500000;}
   let u=p.make(a);if !p.terminal(){score-=self.shared.evaluate(p)*8;ORDER_EVALS.fetch_add(1,Ordering::Relaxed);}p.unmake(u);
   selected.push((i,a,score));
  }
  selected.sort_by(|a,b|b.2.cmp(&a.2).then(a.0.cmp(&b.0)));
  if mode=="window"{for (slot,item) in (start..end).zip(selected){list[slot]=item.1;}}
  else {let item=selected[0];if item.0!=start{list.remove(item.0);list.insert(start,item.1);}}
  Ok(list)
 }
}
#[cfg(test)] mod boundary_tests {
 use super::*;
 #[test] fn boundary_reordering_preserves_scope_prefix_and_legal_set(){
  let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
  let mut p=Position::from_state(&s).unwrap();let key=p.key();let edges=p.edges;
  let mut search=NativeSearcher::new(Arc::new(SharedSearch{profile:2,..SharedSearch::default()}));search.prepare(now()+30000.,Arc::new(AtomicBool::new(false)));
  let list=search.ordered(&mut p,None,1).unwrap();for (ply,depth) in [(0,3),(1,2),(2,3)]{assert_eq!(search.boundary_order(&mut p,list.clone(),None,ply,depth).unwrap(),list);}
  let result=search.boundary_order(&mut p,list.clone(),None,1,3).unwrap();let prefix=if boundary_mode()=="window"{4}else{7};assert_eq!(result[..prefix],list[..prefix]);
  let mut actual=result;let mut expected=list;actual.sort();expected.sort();assert_eq!(actual,expected);assert!(key==p.key());assert_eq!(edges,p.edges);
  assert!(ORDER_MAX.load(Ordering::Relaxed)<=17);
 }
}
