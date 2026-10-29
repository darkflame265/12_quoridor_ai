static ORDER_CALLS:AtomicU64=AtomicU64::new(0);
static ORDER_EVALS:AtomicU64=AtomicU64::new(0);
static ORDER_MAX:AtomicU64=AtomicU64::new(0);
static GOAL_MAPS:AtomicU64=AtomicU64::new(0);
fn filter_mode()->&'static str {
 static MODE:std::sync::OnceLock<String>=std::sync::OnceLock::new();
 MODE.get_or_init(||{let s=std::env::var("QUORIDOR_ROUTE_FILTER").unwrap_or("off".into());assert!(["off","exit","dag"].contains(&s.as_str()));s})
}
fn route_pool(p:&Position,list:&[u16],mode:&str)->Vec<usize> {
 let mut priority=[0i32;128];
 for side in 0..2 {
  let map=p.goal_map(side);GOAL_MAPS.fetch_add(1,Ordering::Relaxed);
  let mut queue=vec![(p.p[side],0usize)];let mut seen=[false;81];seen[p.p[side]]=true;
  for head in 0..queue.len()+81 {
   if head>=queue.len(){break;}
   let (n,depth)=queue[head];if depth>=if mode=="exit"{1}else{2}{continue;}
   for &raw in &p.edges[n] {
    if raw<0{continue;}let q=raw as usize;if map[q]!=map[n]-1{continue;}
    let x=(n%9).min(q%9) as i32;let y=(n/9).min(q/9) as i32;let horizontal=n/9==q/9;
    let anchors=if horizontal{[(x,y-1),(x,y)]}else{[(x-1,y),(x,y)]};
    for (wx,wy) in anchors {if (0..8).contains(&wx)&&(0..8).contains(&wy){let k=if horizontal{64}else{0}+(wy*8+wx) as usize;priority[k]+=if side==p.turn{32}else{128}/(depth as i32+1);}}
    if !seen[q]{seen[q]=true;queue.push((q,depth+1));}
   }
  }
 }
 let mut pool:Vec<usize>=(4..8.min(list.len())).collect();
 let mut late:Vec<usize>=(8..list.len()).filter(|&i|list[i]>=81&&priority[(list[i]-81)as usize]>0).collect();
 late.sort_by(|&a,&b|priority[(list[b]-81)as usize].cmp(&priority[(list[a]-81)as usize]).then(a.cmp(&b)));
 pool.extend(late.into_iter().take(8));pool
}
impl NativeSearcher {
 fn filter_order(&self,p:&mut Position,list:Vec<u16>,best:Option<u16>,ply:usize,depth:i32)->Result<Vec<u16>,()> {
  let mode=filter_mode();if mode=="off"||ply!=1||depth!=3||list.len()<=8{return Ok(list);}
  self.check()?;let pool=route_pool(p,&list,mode);ORDER_CALLS.fetch_add(1,Ordering::Relaxed);ORDER_MAX.fetch_max(pool.len()as u64,Ordering::Relaxed);
  let mut base=[0i32;209];for(a,score)in self.shared.ranked(p){base[a as usize]=score;}
  let mut scored=vec![];let mut chosen=[false;209];
  for i in pool {
   self.check()?;let a=list[i];let mut score=base[a as usize]+self.history[p.turn][a as usize];
   if Some(a)==best{score+=10000000;}else if self.killers.get(ply).is_some_and(|v|v.contains(&a)){score+=500000;}
   let u=p.make(a);if !p.terminal(){score-=self.shared.evaluate(p)*8;ORDER_EVALS.fetch_add(1,Ordering::Relaxed);}p.unmake(u);scored.push((i,a,score));chosen[a as usize]=true;
  }
  scored.sort_by(|a,b|b.2.cmp(&a.2).then(a.0.cmp(&b.0)));
  let mut result=list[..4].to_vec();result.extend(scored.into_iter().map(|v|v.1));result.extend(list.into_iter().skip(4).filter(|a|!chosen[*a as usize]));Ok(result)
 }
}
#[cfg(test)] mod filter_tests {
 use super::*;
 #[test] fn route_pool_is_bounded_and_restores_graph_and_scope(){
  let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
  let mut p=Position::from_state(&s).unwrap();let key=p.key();let edges=p.edges;
  let mut search=NativeSearcher::new(Arc::new(SharedSearch{profile:2,..SharedSearch::default()}));search.prepare(now()+30000.,Arc::new(AtomicBool::new(false)));
  let list=search.ordered(&mut p,None,1).unwrap();for(ply,depth)in[(0,3),(1,2),(2,3)]{assert_eq!(search.filter_order(&mut p,list.clone(),None,ply,depth).unwrap(),list);}
  for mode in ["exit","dag"]{let pool=route_pool(&p,&list,mode);assert!(pool.len()<=12);let unique:std::collections::HashSet<_>=pool.iter().collect();assert_eq!(unique.len(),pool.len());}
  let result=search.filter_order(&mut p,list.clone(),None,1,3).unwrap();assert_eq!(result[..4],list[..4]);let mut actual=result;let mut expected=list;actual.sort();expected.sort();assert_eq!(actual,expected);assert!(key==p.key());assert_eq!(edges,p.edges);
 }
}
