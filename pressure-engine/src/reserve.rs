// A positional certificate, never a forced win/loss oracle: pawns can still
// block and jump, and an opponent can choose a different route.
impl SharedSearch {
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
}
