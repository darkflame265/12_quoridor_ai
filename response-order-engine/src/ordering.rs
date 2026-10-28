fn response_mode()->&'static str {
 static MODE:std::sync::OnceLock<String>=std::sync::OnceLock::new();
 MODE.get_or_init(||{let mode=std::env::var("QUORIDOR_RESPONSE_ORDER").unwrap_or("off".into());assert!(["off","routes","static"].contains(&mode.as_str()));mode})
}
impl NativeSearcher {
 fn response_order(&self,p:&mut Position,ranked:&mut Ranked,ply:usize)->Result<(),()> {
  let mode=response_mode();if mode=="off" || ply!=1{return Ok(());}
  let actor=p.turn;
  for (a,score) in ranked.iter_mut(){
   self.check()?;
   let u=p.make(*a);
   if !p.terminal(){
    let bonus=if mode=="routes" {
     let (_,own)=p.route(actor);let (_,enemy)=p.route(1-actor);(own-enemy)*32
    }else{-self.shared.evaluate(p)*8};
    *score+=bonus;
   }
   p.unmake(u);
  }Ok(())
 }
}
#[cfg(test)] mod ordering_tests {
 use super::*;
 #[test] fn response_order_preserves_legal_set_graph_and_hash(){
  let state:State=serde_json::from_str(r#"{"p":[{"x":4,"y":5},{"x":8,"y":3}],"walls":[{"x":0,"y":2,"o":"h"},{"x":2,"y":2,"o":"h"},{"x":4,"y":2,"o":"h"},{"x":6,"y":2,"o":"h"}],"left":[8,8],"turn":0,"winner":null}"#).unwrap();
  let mut p=Position::from_state(&state).unwrap();let key=p.key();let edges=p.edges;
  let shared=Arc::new(SharedSearch{profile:2,..SharedSearch::default()});let mut search=NativeSearcher::new(shared);
  search.prepare(now()+30000.,Arc::new(AtomicBool::new(false)));
  let mut expected=p.actions();expected.sort();for ply in [0,1,2]{let mut found=search.ordered(&mut p,None,ply).unwrap();found.sort();assert_eq!(found,expected);assert!(key==p.key());assert_eq!(edges,p.edges);}
 }
}
