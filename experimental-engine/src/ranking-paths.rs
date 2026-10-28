impl Position {
    // One surviving shortest path proves that adding a wall cannot increase
    // this distance. Only walls cutting that path need a new BFS.
    fn ranking_paths(&self)->((i32,i32),[u128;2]) {
        if self.left[self.turn]==0 {
            return ((self.distance(self.turn,false),self.distance(1-self.turn,false)),[0;2]);
        }
        let mut distances=[100;2];let mut cuts=[0u128;2];
        for side in 0..2 {
            let map=self.goal_map(side);let mut n=self.p[side];
            if map[n]<0 {continue;}
            distances[side]=map[n] as i32;
            while map[n]>0 {
                let q=self.edges[n].iter().copied().find(|&q|q>=0&&map[q as usize]==map[n]-1).unwrap() as usize;
                let x=(n%9).min(q%9) as i32;let y=(n/9).min(q/9) as i32;
                let vertical=n/9==q/9;
                let anchors=if vertical {[(x,y-1),(x,y)]} else {[(x-1,y),(x,y)]};
                for (x,y) in anchors {if (0..8).contains(&x)&&(0..8).contains(&y) {
                    cuts[side]|=1u128<<((if vertical {64}else{0})+(y*8+x) as usize);
                }}
                n=q;
            }
        }
        ((distances[self.turn],distances[1-self.turn]),cuts)
    }
    fn ranking_distance(&self,side:usize,action:u16,before:i32,cuts:&[u128;2])->i32 {
        if action>=81&&cuts[side]&(1u128<<(action-81))==0 {before}
        else {self.distance(side,false)}
    }
}

pub fn ranking_benchmark(states:&[State],rounds:usize)->serde_json::Value {
    let mut checks=0;let mut skipped=0;let mut wall_queries=0;
    for state in states {
        let mut p=Position::from_state(state).unwrap();let key=p.key();let edges=p.edges;
        let ((own,enemy),cuts)=p.ranking_paths();let t=p.turn;
        assert_eq!(own,p.distance(t,false));assert_eq!(enemy,p.distance(1-t,false));
        for a in (81..209).filter(|&a|p.left[t]>0&&p.fits(a)).collect::<Vec<_>>() {
            let undo=p.make(a);
            for side in 0..2 {
                let before=if side==t {own}else{enemy};
                assert_eq!(p.ranking_distance(side,a,before,&cuts),p.distance(side,false));
                wall_queries+=1;if cuts[side]&(1u128<<(a-81))==0 {skipped+=1;}
            }
            p.unmake(undo);
        }
        let reference=SharedSearch{profile:2,..SharedSearch::default()}.reference_ranked(&mut p);
        let optimized=SharedSearch{profile:2,..SharedSearch::default()}.legacy_ranked(&mut p);
        assert_eq!(reference,optimized);checks+=reference.len();
        assert!(key==p.key());assert_eq!(edges,p.edges);
    }
    let mut samples=vec![];
    for repeat in 0..rounds {
        let mut row=serde_json::json!({"repeat":repeat});
        for optimized in if repeat%2==0 {[false,true]}else{[true,false]} {
            let cache=SharedSearch{profile:2,..SharedSearch::default()};
            let mut positions:Vec<_>=states.iter().map(|s|Position::from_state(s).unwrap()).collect();
            let start=std::time::Instant::now();let mut checksum=0i64;
            for p in &mut positions {let ranked=if optimized {cache.legacy_ranked(p)}else{cache.reference_ranked(p)};
                checksum+=std::hint::black_box(ranked.iter().map(|&(a,s)|a as i64+s as i64).sum::<i64>());
            }
            row[if optimized {"optimized"}else{"reference"}]=serde_json::json!({"micros":start.elapsed().as_micros(),"checksum":checksum});
        }
        assert_eq!(row["optimized"]["checksum"],row["reference"]["checksum"]);samples.push(row);
    }
    serde_json::json!({"positions":states.len(),"rankedActionsChecked":checks,"wallDistanceChecks":wall_queries,"bfsSkipped":skipped,"samples":samples})
}

#[cfg(test)]
mod ranking_path_tests {
    use super::*;
    #[test]
    fn shortest_path_witness_matches_bfs_through_generated_legal_games() {
        let start:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
        let mut p=Position::from_state(&start).unwrap();let mut seed=73619u64;
        for _ in 0..60 {
            let ((own,enemy),cuts)=p.ranking_paths();let t=p.turn;
            assert_eq!(own,p.distance(t,false));assert_eq!(enemy,p.distance(1-t,false));
            let key=p.key();let edges=p.edges;
            for a in (81..209).filter(|&a|p.left[t]>0&&p.fits(a)).collect::<Vec<_>>() {
                let u=p.make(a);
                assert_eq!(p.ranking_distance(t,a,own,&cuts),p.distance(t,false));
                assert_eq!(p.ranking_distance(1-t,a,enemy,&cuts),p.distance(1-t,false));
                p.unmake(u);
            }
            assert!(key==p.key());assert_eq!(edges,p.edges);
            let actions=p.actions();seed=seed.wrapping_mul(6364136223846793005).wrapping_add(1);
            p.make(actions[seed as usize%actions.len()]);
            if p.terminal() {p=Position::from_state(&start).unwrap();}
        }
    }
}
