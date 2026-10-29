static MASK_CALLS:AtomicU64=AtomicU64::new(0);
static MASK_MAX:AtomicU64=AtomicU64::new(0);
static ELIGIBLE:AtomicU64=AtomicU64::new(0);
static EXTRA_SEARCHES:AtomicU64=AtomicU64::new(0);
fn reply_mode()->&'static str {
 static MODE:std::sync::OnceLock<String>=std::sync::OnceLock::new();
 MODE.get_or_init(||{let s=std::env::var("QUORIDOR_VERIFY_REPLY").unwrap_or("off".into());assert!(["off","near","all"].contains(&s.as_str()));s})
}
fn verification_mask(p:&Position,list:&[u16],ply:usize,depth:i32)->[bool;209] {
 let mut mask=[false;209];let mode=reply_mode();
 if mode=="off"||probe_internal_full()||ply!=1||depth!=3||list.len()<=8{return mask;}
 let pool=route_pool(p,list,"exit");let mut count=0;
 for i in pool {if i>=8{mask[list[i]as usize]=true;count+=1;}}
 MASK_CALLS.fetch_add(1,Ordering::Relaxed);MASK_MAX.fetch_max(count,Ordering::Relaxed);mask
}
fn verification_needed(mask:&[bool;209],a:u16,score:i32,alpha:i32)->bool {
 if !mask[a as usize]||score>alpha{return false;}
 ELIGIBLE.fetch_add(1,Ordering::Relaxed);
 // 64 is one existing wall-pressure unit. A reduced fail-low result is a
 // bound, so this is an experimental trigger, not a correctness proof.
 if reply_mode()=="all"||alpha-score<=64 {EXTRA_SEARCHES.fetch_add(1,Ordering::Relaxed);true}else{false}
}
#[cfg(test)] mod reply_tests {
 use super::*;
 #[test] fn reply_mask_is_limited_to_late_route_candidates_and_scope(){
  let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
  let mut p=Position::from_state(&s).unwrap();let key=p.key();let edges=p.edges;
  let mut search=NativeSearcher::new(Arc::new(SharedSearch{profile:2,..SharedSearch::default()}));search.prepare(now()+30000.,Arc::new(AtomicBool::new(false)));
  let list=search.ordered(&mut p,None,1).unwrap();for(ply,depth)in[(0,3),(1,2),(2,3)]{assert!(!verification_mask(&p,&list,ply,depth).into_iter().any(|v|v));}
  let mask=verification_mask(&p,&list,1,3);assert!(mask.into_iter().filter(|v|*v).count()<=8);for a in list.iter().take(8){assert!(!mask[*a as usize]);}
  assert!(key==p.key());assert_eq!(edges,p.edges);
 }
}
