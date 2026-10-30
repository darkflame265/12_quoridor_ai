// Selective wall -> legal reply -> connected wall probe. Never a mate oracle.
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ConnectionChoice{action:Action,risk:i32}
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct ConnectionRisk{
 active:bool,complete:bool,estimate:i32,opponent_stock:usize,distances:[i32;2],
 first_candidates:usize,reply_limit:usize,examined_actions:usize,
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
fn chain_candidates(p:&mut Position,target:usize,anchor:Option<u16>,until:f64,cancel:&AtomicBool)->Option<Vec<u16>>{
 let before=[p.distance(target,false),p.distance(1-target,false)];let mut ranked=vec![];
 for a in 81..209{
  if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
  if anchor.is_some_and(|b|!connected(a,b))||!p.fits(a){continue;}
  p.toggle(a,true);let d=[p.distance(target,false),p.distance(1-target,false)];p.toggle(a,false);
  if d[0]>=100||d[1]>=100{continue;}
  let gain=d[0]-before[0]-(d[1]-before[1]);
  if gain<0||gain==0&&p.connections(a)==0{continue;}
  ranked.push((a,gain*16+p.connections(a)));
 }
 ranked.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
 ranked.truncate(if anchor.is_some(){3}else{2});Some(ranked.into_iter().map(|r|r.0).collect())
}
fn connection_exposure(p:&Position,target:usize,until:f64,cancel:&AtomicBool)->Option<(i32,usize)>{
 let attacker=1-target;if p.left[attacker]<2||p.terminal(){return Some((0,0));}
 let baseline=p.distance(target,false)-p.distance(attacker,false);
 let mut start=p.clone();start.turn=attacker;
 let first=chain_candidates(&mut start,target,None,until,cancel)?;
 let count=first.len();let mut worst=0;
 for a in first{
  let mut attacked=start.clone();attacked.make(a);
  // Every legal pawn response is included. Defensive walls are selective,
  // ranked by route balance after replying; omitted replies can lower risk.
  let mut replies=attacked.moves(target);let mut defenses=vec![];
  if attacked.left[target]>0{for b in 81..209{
   if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
   if !nearby(a,b)||!attacked.fits(b){continue;}
   let mut q=attacked.clone();q.make(b);let d=[q.distance(target,false),q.distance(attacker,false)];
   if d[0]<100&&d[1]<100{defenses.push((b,d[1]-d[0]));}
  }}
  defenses.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));defenses.truncate(3);
  replies.extend(defenses.into_iter().map(|r|r.0));let mut best_reply=i32::MAX;
  for response in replies{
   if cancel.load(Ordering::Relaxed)||now()>=until{return None;}
   let mut q=attacked.clone();q.make(response);
   if q.terminal(){best_reply=0;break;}
   let mut second_worst=(q.distance(target,false)-q.distance(attacker,false)-baseline-1).max(0);
   let seconds=chain_candidates(&mut q,target,Some(a),until,cancel)?;
   for b in seconds{let mut end=q.clone();end.make(b);
    // Two attacker turns and one defender turn: subtract their net turn cost.
    second_worst=second_worst.max((end.distance(target,false)-end.distance(attacker,false)-baseline-1).max(0));
   }
   best_reply=best_reply.min(second_worst);
  }
  if best_reply!=i32::MAX{worst=worst.max(best_reply);}
 }
 Some((worst.min(6),count))
}
fn connection_biases(p:&mut Position,base:[i32;209],deadline:f64,cancel:&AtomicBool)->([i32;209],ConnectionRisk){
 let t=p.turn;let mut details=ConnectionRisk{active:goal_enabled()&&p.left[1-t]>=2,complete:true,
  estimate:0,opponent_stock:p.left[1-t],distances:[p.distance(0,false),p.distance(1,false)],
  first_candidates:0,reply_limit:3,examined_actions:0,selected:None,choices:vec![]};
 if !details.active{return (base,details);}
 let until=(now()+60.).min(now()+(deadline-now()).max(0.)*0.14);
 let Some((risk,count))=connection_exposure(p,t,until,cancel)else{details.complete=false;return (base,details);};
 details.estimate=risk;details.first_candidates=count;
 // Always examine pawn moves; add two promising wall alternatives. Unexamined
 // actions retain the base estimate and receive no invented safety bonus.
 let mut actions=p.moves(t);let mut walls=vec![];
 for a in p.actions(){if a>=81{let f=pressure_feature(p,a);walls.push((a,f.net_gain*120+base[a as usize]));}}
 walls.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));walls.truncate(2);actions.extend(walls.into_iter().map(|r|r.0));
 let mut out=base;
 for a in actions{
  let mut child=p.clone();child.make(a);
  let Some((after,_))=connection_exposure(&child,t,until,cancel)else{details.complete=false;details.choices.clear();details.examined_actions=0;return (base,details);};
  out[a as usize]+=((risk-after)*48).clamp(-192,192);
  details.choices.push(ConnectionChoice{action:decode(a),risk:after});
 }
 details.examined_actions=details.choices.len();(out,details)
}
