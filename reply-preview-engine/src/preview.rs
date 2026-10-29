static MASK_CALLS:AtomicU64=AtomicU64::new(0);
static MASK_MAX:AtomicU64=AtomicU64::new(0);
static ELIGIBLE:AtomicU64=AtomicU64::new(0);
static EXTRA_SEARCHES:AtomicU64=AtomicU64::new(0);
static BASE_EVALS:AtomicU64=AtomicU64::new(0);
static PREVIEW_EVALS:AtomicU64=AtomicU64::new(0);
fn preview_mode()->&'static str {
 static MODE:std::sync::OnceLock<String>=std::sync::OnceLock::new();
 MODE.get_or_init(||{let s=std::env::var("QUORIDOR_REPLY_PREVIEW").unwrap_or("off".into());assert!(["off","gain","pressure"].contains(&s.as_str()));s})
}
struct ReplyPlan {mask:[bool;209],baseline:i32}
fn verification_plan(cache:&SharedSearch,p:&mut Position,list:&[u16],ply:usize,depth:i32)->ReplyPlan {
 let mut plan=ReplyPlan{mask:[false;209],baseline:0};let mode=preview_mode();
 if mode=="off"||probe_internal_full()||ply!=1||depth!=3||list.len()<=8{return plan;}
 let pool=route_pool(p,list,"exit");let mut count=0;
 for i in pool {if i>=8{plan.mask[list[i]as usize]=true;count+=1;}}
 MASK_CALLS.fetch_add(1,Ordering::Relaxed);MASK_MAX.fetch_max(count,Ordering::Relaxed);
 if count>0{plan.baseline=cache.evaluate(p);BASE_EVALS.fetch_add(1,Ordering::Relaxed);}plan
}
fn preview_needed(plan:&ReplyPlan,cache:&SharedSearch,child:&mut Position,a:u16,score:i32,alpha:i32)->bool {
 if !plan.mask[a as usize]||score>alpha{return false;}
 ELIGIBLE.fetch_add(1,Ordering::Relaxed);PREVIEW_EVALS.fetch_add(1,Ordering::Relaxed);
 let gain=-cache.evaluate(child)-plan.baseline;
 // Compare same-heuristic static values in the parent's perspective. Static
 // improvement is only a trigger to verify, never an added search score.
 if if preview_mode()=="gain"{gain>0}else{gain>=64}{EXTRA_SEARCHES.fetch_add(1,Ordering::Relaxed);true}else{false}
}
#[cfg(test)] mod preview_tests {
 use super::*;
 #[test] fn plans_preserve_graph_and_ignore_inactive_scope(){
  let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();let mut p=Position::from_state(&s).unwrap();
  let key=p.key();let edges=p.edges;let cache=Arc::new(SharedSearch{profile:2,..SharedSearch::default()});let mut search=NativeSearcher::new(cache.clone());search.prepare(now()+30000.,Arc::new(AtomicBool::new(false)));
  let list=search.ordered(&mut p,None,1).unwrap();for(ply,depth)in[(0,3),(1,2),(2,3)]{assert!(!verification_plan(&cache,&mut p,&list,ply,depth).mask.into_iter().any(|v|v));}
  let plan=verification_plan(&cache,&mut p,&list,1,3);assert!(plan.mask.into_iter().filter(|v|*v).count()<=8);for a in list.iter().take(8){assert!(!plan.mask[*a as usize]);}assert!(key==p.key());assert_eq!(edges,p.edges);
 }
}
