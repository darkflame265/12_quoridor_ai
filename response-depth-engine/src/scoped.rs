impl NativeSearcher {
 fn scoped_order(&self,p:&mut Position,list:Vec<u16>,best:Option<u16>,ply:usize,depth:i32)->Result<Vec<u16>,()> {
  if response_mode()=="off" || ply!=1 || depth!=3 {return Ok(list);}
  let mut ranked=self.shared.ranked(p);self.response_order(p,&mut ranked,ply)?;
  for (a,score) in &mut ranked {
   *score+=self.history[p.turn][*a as usize];
   if Some(*a)==best{*score+=10000000;}else if self.killers.get(ply).is_some_and(|v|v.contains(a)){*score+=500000;}
  }
  ranked.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));Ok(ranked.into_iter().map(|v|v.0).collect())
 }
}
#[cfg(test)] mod scope_tests {
 use super::*;
 #[test] fn scope_preserves_other_depths_and_all_legal_actions(){
  let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
  let mut p=Position::from_state(&s).unwrap();let key=p.key();let edges=p.edges;
  let mut search=NativeSearcher::new(Arc::new(SharedSearch{profile:2,..SharedSearch::default()}));search.prepare(now()+30000.,Arc::new(AtomicBool::new(false)));
  let list=search.ordered(&mut p,None,1).unwrap();
  for (ply,depth) in [(0,3),(1,1),(1,2),(2,3)] {assert_eq!(search.scoped_order(&mut p,list.clone(),None,ply,depth).unwrap(),list);}
  let mut active=search.scoped_order(&mut p,list.clone(),None,1,3).unwrap();let mut original=list;active.sort();original.sort();assert_eq!(active,original);assert!(p.key()==key);assert_eq!(p.edges,edges);
 }
}
