// Selective wall -> legal reply -> connected wall probe. Never a mate oracle.
fn connection_done(base:[i32;209],mut details:ConnectionRisk,probe:&ChainProbe,started:f64)->([i32;209],ConnectionRisk){
 details.elapsed_ms=now()-started;details.geometry_hits=probe.hits;details.geometry_builds=probe.builds;(base,details)
}
pub fn explain_connection(value:serde_json::Value)->serde_json::Value{
 let Ok(state)=serde_json::from_value::<State>(value["state"].clone())else{return serde_json::json!({"error":"invalid state"});};
 let Ok(p)=Position::from_state(&state)else{return serde_json::json!({"error":"illegal state"});};
 let wide=value["wide"].as_bool().unwrap_or(false);let mut probe=ChainProbe::new(wide);probe.wide_attacks=value["attacksWide"].as_bool().unwrap_or(wide);probe.wide_defenses=value["defensesWide"].as_bool().unwrap_or(wide);probe.cache_enabled=value["cache"].as_bool().unwrap_or(true);let cancel=AtomicBool::new(false);
 let started=now();let until=started+value["ms"].as_f64().unwrap_or(1000.).clamp(1.,2000.);
 if value["root"].as_bool().unwrap_or(false){
  let mut position=p.clone();let (biases,details)=connection_biases_cached(&mut position,[0;209],until,&cancel,probe.cache_enabled);
  let adjustments:Vec<_>=biases.into_iter().enumerate().filter(|(_,v)|*v!=0).collect();
  return serde_json::json!({"root":true,"complete":details.complete,"estimate":details.estimate,"elapsedMs":details.elapsed_ms,"geometryHits":details.geometry_hits,"geometryBuilds":details.geometry_builds,"adjustments":adjustments});
 }
 let result=connection_exposure(&p,p.turn,&mut probe,until,&cancel);
 serde_json::json!({"attacksWide":probe.wide_attacks,"defensesWide":probe.wide_defenses,"cache":probe.cache_enabled,"complete":result.is_some(),"estimate":result.map(|r|r.0),"firstCandidates":result.map(|r|r.1),"elapsedMs":now()-started,"geometryHits":probe.hits,"geometryBuilds":probe.builds,"proof":false})
}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ConnectionChoice{action:Action,risk:i32}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ConnectionRisk{
 active:bool,complete:bool,estimate:i32,opponent_stock:usize,distances:[i32;2],
 first_candidates:usize,reply_limit:usize,examined_actions:usize,elapsed_ms:f64,geometry_hits:usize,geometry_builds:usize,defense_review:bool,initial_estimate:i32,
 selected:Option<ConnectionChoice>,#[serde(skip)]choices:Vec<ConnectionChoice>,
}
impl ConnectionRisk{
 fn select(&mut self,action:Option<&Action>){self.selected=action.and_then(|a|self.choices.iter().find(|c|action_code(&c.action)==action_code(a)).cloned());}
}
fn nearby(a:u16,b:u16)->bool{
 let a=(a-81)as usize;let b=(b-81)as usize;
 // Include crossing anchors as candidates; fits() later rejects crossings.
 (a%8).abs_diff(b%8)<=2&&((a%64)/8).abs_diff((b%64)/8)<=2
}
fn connected(a:u16,b:u16)->bool{
 let a=(a-81)as usize;let b=(b-81)as usize;
 let (ax,ay,av)=(a%8,(a%64)/8,a>=64);let (bx,by,bv)=(b%8,(b%64)/8,b>=64);
 if av==bv{return if av{ax==bx&&ay.abs_diff(by)==2}else{ay==by&&ax.abs_diff(bx)==2};}
 let (hx,hy,vx,vy)=if av{(bx,by,ax,ay)}else{(ax,ay,bx,by)};
 // Segment intersection; illegal center crossings are rejected by fits().
 vx+1>=hx&&vx+1<=hx+2&&hy+1>=vy&&hy+1<=vy+2
}
fn chain_candidates(p:&mut Position,target:usize,anchor:Option<u16>,probe:&mut ChainProbe,until:f64,cancel:&AtomicBool)->Option<Vec<u16>>{
 let before=probe.distances(p,target);let maps=probe.geometry(p);let reach=from_map(p,p.p[target]);let mut ranked=vec![];
 for a in 81..209{
  if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
  if anchor.is_some_and(|b|!connected(a,b))||!p.fits(a){continue;}
  p.toggle(a,true);let d=probe.with_wall(p,target,a);p.toggle(a,false);
  if d[0]>=100||d[1]>=100{continue;}
  let gain=d[0]-before[0]-(d[1]-before[1]);
  if gain<0||gain==0&&p.connections(a)==0&&!cuts_shortest_branch(p,a,&reach,&maps[target],before[0] as i16){continue;}
  ranked.push((a,gain*16+p.connections(a)));
 }
 ranked.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
 ranked.truncate(if probe.wide_attacks{if anchor.is_some(){6}else{4}}else{if anchor.is_some(){3}else{2}});Some(ranked.into_iter().map(|r|r.0).collect())
}
fn connection_exposure(p:&Position,target:usize,probe:&mut ChainProbe,until:f64,cancel:&AtomicBool)->Option<(i32,usize)>{
 let attacker=1-target;if p.left[attacker]<2||p.terminal(){return Some((0,0));}
 let d=probe.distances(p,target);let baseline=d[0]-d[1];
 let mut start=p.clone();start.turn=attacker;
 let first=chain_candidates(&mut start,target,None,probe,until,cancel)?;
 let count=first.len();let mut worst=0;
 for a in first{
  let mut attacked=start.clone();attacked.make(a);
  // Every legal pawn response is included. Defensive walls are selective,
  // ranked by route balance after replying; omitted replies can lower risk.
  let mut replies=attacked.moves(target);let mut defenses=vec![];
  if attacked.left[target]>0{for b in 81..209{
   if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
   if !probe.wide_defenses&&!nearby(a,b)||!attacked.fits(b){continue;}
   let mut q=attacked.clone();q.make(b);let d=probe.distances(&q,target);
   if d[0]<100&&d[1]<100{defenses.push((b,d[1]-d[0]));}
  }}
  defenses.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));let mut selected:Vec<u16>=defenses.iter().filter(|r|nearby(a,r.0)).take(3).map(|r|r.0).collect();
  if probe.wide_defenses{for &(b,_) in defenses.iter().take(6){if !selected.contains(&b){selected.push(b);}}}
  replies.extend(selected);let mut best_reply=i32::MAX;
  for response in replies{
   if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
   let mut q=attacked.clone();q.make(response);
   if q.terminal(){best_reply=0;break;}
   let mut second_worst=0;
   let seconds=chain_candidates(&mut q,target,Some(a),probe,until,cancel)?;
   for b in seconds{let mut end=q.clone();end.make(b);
    // Two attacker turns and one defender turn: subtract their net turn cost.
    let d=probe.distances(&end,target);second_worst=second_worst.max((d[0]-d[1]-baseline-1).max(0));
   }
   best_reply=best_reply.min(second_worst);
  }
  if best_reply!=i32::MAX{worst=worst.max(best_reply);}
 }
 Some((worst.min(6),count))
}
fn connection_biases(p:&mut Position,base:[i32;209],deadline:f64,cancel:&AtomicBool)->([i32;209],ConnectionRisk){
 connection_biases_cached(p,base,deadline,cancel,true)
}
fn connection_biases_cached(p:&mut Position,base:[i32;209],deadline:f64,cancel:&AtomicBool,use_cache:bool)->([i32;209],ConnectionRisk){
 let started=now();let mut probe=ChainProbe::new(false);probe.cache_enabled=use_cache;
 let t=p.turn;let mut details=ConnectionRisk{active:goal_enabled()&&p.left[1-t]>=2,complete:true,
  estimate:0,opponent_stock:p.left[1-t],distances:[p.distance(0,false),p.distance(1,false)],
  first_candidates:0,reply_limit:3,examined_actions:0,elapsed_ms:0.,geometry_hits:0,geometry_builds:0,defense_review:false,initial_estimate:0,selected:None,choices:vec![]};
 if !details.active{return connection_done(base,details,&probe,started);}
 let until=(now()+60.).min(now()+(deadline-now()).max(0.)*0.14);
 let Some((mut risk,count))=connection_exposure(p,t,&mut probe,until,cancel)else{details.complete=false;return connection_done(base,details,&probe,started);};
 details.initial_estimate=risk;
 // A high warning may be caused by omitted distant defensive walls. Keep all
 // local replies and add the six best global replies before using that warning.
 if risk>=2&&p.left[t]>0{
  probe.wide_defenses=true;details.defense_review=true;details.reply_limit=9;
  let Some((reviewed,_))=connection_exposure(p,t,&mut probe,until,cancel)else{details.complete=false;return connection_done(base,details,&probe,started);};
  risk=reviewed;
 }
 details.estimate=risk;details.first_candidates=count;
 // Always examine pawn moves; add two promising wall alternatives. Unexamined
 // actions retain the base estimate and receive no invented safety bonus.
 let mut actions=p.moves(t);let mut walls=vec![];let before=probe.distances(p,t);
 for a in 81..209{
  if cancel.load(Ordering::Relaxed)||now()>=until{details.complete=false;return connection_done(base,details,&probe,started);}
  if !p.fits(a){continue;}
  p.toggle(a,true);let after=probe.with_wall(p,t,a);p.toggle(a,false);
  if after[0]>=100||after[1]>=100{continue;}
  let net_gain=after[1]-before[1]-(after[0]-before[0])-1;
  walls.push((a,net_gain*120+base[a as usize]));
 }
 walls.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));walls.truncate(2);actions.extend(walls.into_iter().map(|r|r.0));
 let mut out=base;
 for a in actions{
  let mut child=p.clone();child.make(a);
  let Some((after,_))=connection_exposure(&child,t,&mut probe,until,cancel)else{details.complete=false;details.choices.clear();details.examined_actions=0;return connection_done(base,details,&probe,started);};
  out[a as usize]+=((risk-after)*48).clamp(-192,192);
  details.choices.push(ConnectionChoice{action:decode(a),risk:after});
 }
 details.examined_actions=details.choices.len();connection_done(out,details,&probe,started)
}
