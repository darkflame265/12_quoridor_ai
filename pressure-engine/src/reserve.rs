// A positional certificate, never a forced win/loss oracle: pawns can still
// block and jump, and an opponent can choose a different route.
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
struct WallUtility{active:bool,attack_gain:[i32;2],defense_value:[i32;2],effective_value:[i32;2]}
fn stock_value(n:usize)->i32{(100.*(n as f64).sqrt()+20.*n as f64+0.5).floor()as i32}
// If neither shortest-path DAG uses either cut edge, both distances are
// unchanged and both routes survive. Avoid two BFS/cache lookups in that case.
fn cuts_shortest(a:u16,maps:&[[i16;81];2],reach:&[[i16;81];2],before:[i32;2])->bool{
 let k=(a-81)as usize;let n=(k%64/8)*9+k%8;let (step,offset)=if k>=64{(1,9)}else{(9,1)};
 for t in 0..2{for from in [n,n+offset]{let to=from+step;
  for (u,v) in [(from,to),(to,from)]{if reach[t][u]>=0&&maps[t][u]>=0&&maps[t][v]>=0&&reach[t][u]as i32+maps[t][u]as i32==before[t]&&maps[t][v]+1==maps[t][u]{return true;}}
 }}false
}
impl SharedSearch {
    fn wall_utility(&self,p:&mut Position)->WallUtility{
        let before=[p.distance(0,false),p.distance(1,false)];
        let active=goal_enabled()&&p.walls.count_ones()>=10&&before[0].min(before[1])<=10;
        let mut out=WallUtility{active,attack_gain:[0;2],defense_value:[0;2],effective_value:p.left.map(stock_value)};
        if !active{return out;}
        let mut rows=vec![];let mut threats=[None;2];let mut worst=[0;2];let maps=[p.goal_map(0),p.goal_map(1)];let reach=[from_map(p,p.p[0]),from_map(p,p.p[1])];
        for a in 81..209{
            if !p.fits(a){continue;}if !cuts_shortest(a,&maps,&reach,before){rows.push((a,[0,0]));continue;}let g=self.geometry(p,Some(a));let d=[g.maps[0][p.p[0]]as i32,g.maps[1][p.p[1]]as i32];
            if d.iter().any(|&n|n<0){continue;}
            let delta=[d[0]-before[0],d[1]-before[1]];rows.push((a,delta));
            for t in 0..2{let gain=delta[1-t]-delta[t].max(0);out.attack_gain[t]=out.attack_gain[t].max(gain);if delta[t]>worst[t]{worst[t]=delta[t];threats[t]=Some(a);}}
        }
        for t in 0..2{
            if p.left[t]==0{continue;}
            let attack=match out.attack_gain[t]{0=>0,1=>stock_value(p.left[t])/2,_=>stock_value(p.left[t])};
            // Keep a limited defensive value even when no current attacking
            // wall delays the opponent: a crossing can deny a harmful anchor.
            if p.left[1-t]>0 {if let Some(threat)=threats[t]{
                if rows.iter().any(|&(a,delta)|{if delta[t]>1{return false;}let mut q=p.clone();q.turn=t;q.make(a);!q.fits(threat)}){out.defense_value[t]=(worst[t]*40).min(120).min(stock_value(p.left[t]));}
            }}
            out.effective_value[t]=attack.max(out.defense_value[t]);
        }
        out
    }
    fn protected_route(&self,p:&mut Position,target:usize)->Option<i32>{
        let mut safe=p.edges;
        for a in 81..209 {
            if !p.fits(a){continue;}
            let geometry=self.geometry(p,Some(a));
            if geometry.maps[0][p.p[0]]<0||geometry.maps[1][p.p[1]]<0{continue;}
            let k=(a-81)as usize;let x=k%8;let y=(k%64)/8;
            let (n,d,offset)=if k>=64{(y*9+x,1,9)}else{(y*9+x,2,1)};
            for n in [n,n+offset]{let q=p.edges[n][d];if q>=0{safe[n][d]=-1;safe[q as usize][(d+2)%4]=-1;}}
        }
        let mut distances=[-1i16;81];let mut queue=vec![p.p[target]];distances[p.p[target]]=0;let mut head=0;
        while head<queue.len(){let n=queue[head];head+=1;if goal(n,target){return Some(distances[n]as i32);}
            for q in safe[n]{if q>=0&&distances[q as usize]<0{distances[q as usize]=distances[n]+1;queue.push(q as usize);}}
        }None
    }
    fn reserve_score(&self,p:&mut Position)->i32{
        let score=self.static_score(p);
        let utility=self.wall_utility(p);
        if utility.active{let t=p.turn;let o=1-t;return score-(stock_value(p.left[t])-stock_value(p.left[o]))+utility.effective_value[t]-utility.effective_value[o];}
        if !pressure_enabled()||p.walls.count_ones()<12{return score;}
        let holder=if p.left[0]>0&&p.left[1]==0{0}else if p.left[1]>0&&p.left[0]==0{1}else{return score;};
        let target=1-holder;
        if self.protected_route(p,target)!=Some(p.distance(target,false)){return score;}
        // Remove only the stock bonus; do not fabricate a mate or zero walls.
        let stock=(100.*(p.left[holder]as f64).sqrt()+20.*p.left[holder]as f64+0.5).floor()as i32;
        score-if holder==p.turn{stock}else{-stock}
    }
}

#[cfg(test)]mod reserve_tests{
 use super::*;
 #[test]fn protected_routes_replay_without_mutation_or_mate_claims(){
  let fixtures:serde_json::Value=serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"),"/../evaluation/fixtures/reserve-regressions.json"))).unwrap();
  let shared=SharedSearch::default();
  for f in fixtures.as_array().unwrap(){let s:State=serde_json::from_value(f["state"].clone()).unwrap();let mut p=Position::from_state(&s).unwrap();let key=p.key();let edges=p.edges;let result=shared.protected_route(&mut p,1);
   assert_eq!(result==Some(p.distance(1,false)),f["protected"].as_bool().unwrap());assert!(p.key()==key);assert_eq!(p.edges,edges);
   let mut mirrored=mirror_position(&p);assert_eq!(result,shared.protected_route(&mut mirrored,1));
  }
 }
 #[test]fn open_board_and_both_stock_preserve_original_evaluation(){
  let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();let mut p=Position::from_state(&s).unwrap();let shared=SharedSearch::default();assert_eq!(shared.reserve_score(&mut p),shared.static_score(&mut p));
 }
 #[test]fn shortest_route_filter_never_skips_a_distance_change_or_invalid_wall(){
  let cases:serde_json::Value=serde_json::from_str(include_str!("../test-data/race-game11.json")).unwrap();
  for row in cases.as_array().unwrap(){let mut p=Position::from_state(&serde_json::from_value::<State>(row["state"].clone()).unwrap()).unwrap();let key=p.key();let maps=[p.goal_map(0),p.goal_map(1)];let reach=[from_map(&p,p.p[0]),from_map(&p,p.p[1])];let before=[p.distance(0,false),p.distance(1,false)];
   for a in 81..209{if !p.fits(a)||cuts_shortest(a,&maps,&reach,before){continue;}p.toggle(a,true);assert_eq!([p.distance(0,false),p.distance(1,false)],before);p.toggle(a,false);}
   assert!(p.key()==key);
  }
 }
 #[test]fn both_stocks_keep_defense_but_discount_useless_attack_stock_at_game11(){
  let old=std::env::var("QUORIDOR_GOAL_MODE").ok();std::env::set_var("QUORIDOR_GOAL_MODE","on");
  let cases:serde_json::Value=serde_json::from_str(include_str!("../test-data/race-game11.json")).unwrap();let row=cases.as_array().unwrap().iter().find(|r|r["ply"]==38).unwrap();
  let mut p=Position::from_state(&serde_json::from_value::<State>(row["state"].clone()).unwrap()).unwrap();let key=p.key();let edges=p.edges;let shared=SharedSearch::default();let u=shared.wall_utility(&mut p);
  assert!(u.active);assert_eq!(u.attack_gain[1],0);assert!(u.defense_value[1]>0);assert_eq!(u.effective_value[1],u.defense_value[1]);assert!(u.effective_value[1]<stock_value(4));assert!(p.key()==key);assert!(p.edges==edges);
  assert!(shared.reserve_score(&mut p)<shared.static_score(&mut p));
  let mut mirror=mirror_position(&p);let other=shared.wall_utility(&mut mirror);assert_eq!(u.effective_value,other.effective_value);assert_eq!(shared.reserve_score(&mut p),shared.reserve_score(&mut mirror));
  // Earlier positions are also priced: consuming the 22nd wall cannot avoid
  // evaluation simply because both sides still have several walls.
  let row=&cases[0];let mut q=Position::from_state(&serde_json::from_value::<State>(row["state"].clone()).unwrap()).unwrap();let a=parse_defense_reply(&row["action"]).unwrap();q.make(a);let after=shared.wall_utility(&mut q);assert!(after.active);assert_eq!(after.attack_gain[1],0);assert!(after.effective_value[1]<stock_value(q.left[1]));
  if let Some(value)=old{std::env::set_var("QUORIDOR_GOAL_MODE",value);}else{std::env::remove_var("QUORIDOR_GOAL_MODE");}
 }
}
