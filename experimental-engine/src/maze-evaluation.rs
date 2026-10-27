impl SharedSearch {
    fn reference_potential(&self,p:&mut Position,target:usize)->i32 {
        let attacker=1-target;
        if p.left[attacker]==0 { return 0; }
        let base=self.geometry(p,None);
        let map=&base.maps[target];
        let distance=map[p.p[target]] as i32;
        let other=base.maps[attacker][p.p[attacker]] as i32;
        let mut legacy=[0f64;128];
        let mut coverage=[0usize;128];
        let mut seen=[false;81];
        let mut queue=vec![p.p[target]];seen[queue[0]]=true;
        let mut head=0;
        while head<queue.len() {
            let n=queue[head];head+=1;
            for &q in &p.edges[n] {
                if q<0 || map[q as usize]!=map[n]-1 {continue;}
                let q=q as usize;
                if !seen[q] {seen[q]=true;queue.push(q);}
                let x=(n%9).min(q%9) as i32;
                let y=(n/9).min(q/9) as i32;
                let vertical=n/9==q/9;
                let anchors=if vertical {[(x,y-1),(x,y)]} else {[(x-1,y),(x,y)]};
                for (x,y) in anchors {
                    if !(0..8).contains(&x)||!(0..8).contains(&y) {continue;}
                    let i=if vertical {64} else {0}+(y*8+x) as usize;
                    let a=(81+i) as u16;
                    if p.fits(a) {
                        legacy[i]+=p.evaluation_connections(a) as f64*30.+(distance-map[n] as i32) as f64*0.2+1.;
                        coverage[i]+=1;
                    }
                }
            }
        }
        let mut choices:Vec<usize>=(0..128).filter(|&i|coverage[i]>0).collect();
        choices.sort_by(|&a,&b|legacy[b].partial_cmp(&legacy[a]).unwrap().then(a.cmp(&b)));
        let mut selected:Vec<usize>=choices.iter().take(4).copied().collect();
        // Cover shortest-path cuts that connection-weighted ranking overlooks.
        // Keep the original four so the threat estimate never drops below them.
        choices.sort_by(|&a,&b|coverage[b].cmp(&coverage[a]).then(legacy[b].partial_cmp(&legacy[a]).unwrap()).then(a.cmp(&b)));
        for i in choices {if !selected.contains(&i) {selected.push(i);if selected.len()==8 {break;}}}
        let mut best=0;
        for i in selected {
            let after=self.geometry(p,Some((81+i) as u16));
            let d=after.maps[target][p.p[target]] as i32;
            let e=after.maps[attacker][p.p[attacker]] as i32;
            if d>=0&&e>=0 {best=best.max(d-distance-(e-other)-1);}
        }
        best
    }
    fn maze_potential(&self,p:&mut Position,target:usize)->i32 { self.fast_potential(p,target,8) }
    fn fast_potential(&self,p:&mut Position,target:usize,limit:usize)->i32 {
        let attacker=1-target;
        if p.left[attacker]==0 {return 0;}
        let base=self.geometry(p,None);let map=&base.maps[target];
        let distance=map[p.p[target]] as i32;let other=base.maps[attacker][p.p[attacker]] as i32;
        let mut legacy=[0f64;128];let mut coverage=[0usize;128];let mut connections=[None;128];
        let mut seen=[false;81];let mut queue=[0usize;81];queue[0]=p.p[target];seen[queue[0]]=true;let mut head=0;let mut tail=1;
        while head<tail {
            let n=queue[head];head+=1;
            for &q in &p.edges[n] {
                if q<0||map[q as usize]!=map[n]-1 {continue;}
                let q=q as usize;if !seen[q] {seen[q]=true;queue[tail]=q;tail+=1;}
                let x=(n%9).min(q%9) as i32;let y=(n/9).min(q/9) as i32;let vertical=n/9==q/9;
                let anchors=if vertical {[(x,y-1),(x,y)]} else {[(x-1,y),(x,y)]};
                for (x,y) in anchors {
                    if !(0..8).contains(&x)||!(0..8).contains(&y) {continue;}
                    let i=if vertical {64} else {0}+(y*8+x) as usize;let a=(81+i) as u16;
                    if p.fits(a) {
                        let c=*connections[i].get_or_insert_with(||p.evaluation_connections(a));
                        legacy[i]+=c as f64*30.+(distance-map[n] as i32) as f64*0.2+1.;coverage[i]+=1;
                    }
                }
            }
        }
        // At most eight candidates: linear bounded selection avoids two sorts
        // and heap-backed queues while preserving the reference tie order.
        let mut selected=[usize::MAX;8];let mut count=0;
        for round in 0..limit {
            let mut best=None;
            for i in 0..128 {
                if coverage[i]==0||selected[..count].contains(&i) {continue;}
                let better=best.is_none_or(|b:usize| {
                    if round<4 {legacy[i]>legacy[b]||legacy[i]==legacy[b]&&i<b}
                    else {coverage[i]>coverage[b]||coverage[i]==coverage[b]&&(legacy[i]>legacy[b]||legacy[i]==legacy[b]&&i<b)}
                });
                if better {best=Some(i);}
            }
            if let Some(i)=best {selected[count]=i;count+=1;} else {break;}
        }
        let mut best=0;
        for &i in &selected[..count] {
            let after=self.geometry(p,Some((81+i) as u16));let d=after.maps[target][p.p[target]] as i32;let e=after.maps[attacker][p.p[attacker]] as i32;
            if d>=0&&e>=0 {best=best.max(d-distance-(e-other)-1);}
        }
        best
    }
    fn score_mode(&self,p:&mut Position,mode:MazeMode)->i32 {
        if self.profile!=2 || p.walls.count_ones()<8 {return self.legacy_static_score(p);}
        if mode==MazeMode::Baseline {return p.evaluate();}
        let t=p.turn;let o=1-t;
        let (a,ar)=p.route(t);let (b,br)=p.route(o);
        let near=(p.p[0]%9).abs_diff(p.p[1]%9)+(p.p[0]/9).abs_diff(p.p[1]/9)<=3;
        let da=if near {p.distance(t,true)} else {a};
        let db=if near {p.distance(o,true)} else {b};
        let bonus=matches!(mode,MazeMode::Reserve|MazeMode::Combined8|MazeMode::Reference8);
        let stock=|n:usize,enemy:i32|100.*(n as f64).sqrt()+20.*n as f64+if bonus&&n>0 {(5-enemy).clamp(0,4) as f64*12.} else {0.};
        let reserve=stock(p.left[t],db)-stock(p.left[o],da);
        let potential=|p:&mut Position,side| if mode==MazeMode::Reference8 {self.reference_potential(p,side)} else {self.fast_potential(p,side,if matches!(mode,MazeMode::Coverage8|MazeMode::Combined8) {8} else {4})};
        let pressure=(potential(p,o)-potential(p,t))*64;
        (db-da)*120+(b-a)*12+if p.left[t]+p.left[o]>0 {(ar-br)*8} else {0}+(reserve+pressure as f64+0.5).floor() as i32
    }
    fn static_score(&self,p:&mut Position)->i32 {self.score_mode(p,maze_mode())}
}

#[derive(Clone,Copy,PartialEq)]
enum MazeMode {Baseline,Cache4,Reserve,Coverage8,Combined8,Reference8}
fn maze_mode()->MazeMode {
    static MODE:std::sync::OnceLock<MazeMode>=std::sync::OnceLock::new();
    *MODE.get_or_init(||match std::env::var("QUORIDOR_MAZE_MODE").as_deref() {
        Ok("baseline")=>MazeMode::Baseline,Ok("reserve")=>MazeMode::Reserve,Ok("coverage8")=>MazeMode::Coverage8,
        Ok("combined8")=>MazeMode::Combined8,Ok("reference8")=>MazeMode::Reference8,Ok("cache4")|Err(_)=>MazeMode::Cache4,
        Ok(other)=>panic!("Unknown QUORIDOR_MAZE_MODE: {other}"),
    })
}

pub fn evaluation_benchmark(states:&[State],rounds:usize)->serde_json::Value {
    let mut rows=vec![];
    for (name,mode) in [("baseline",MazeMode::Baseline),("cache4",MazeMode::Cache4),("reserve",MazeMode::Reserve),("coverage8",MazeMode::Coverage8),("combined8",MazeMode::Combined8),("reference8",MazeMode::Reference8)] {
        let cache=SharedSearch{profile:2,..SharedSearch::default()};let mut positions:Vec<Position>=states.iter().map(|s|Position::from_state(s).unwrap()).collect();
        let cold=std::time::Instant::now();let first:Vec<i32>=positions.iter_mut().map(|p|cache.score_mode(p,mode)).collect();let cold_us=cold.elapsed().as_micros();
        let start=std::time::Instant::now();let mut checksum=0i64;
        for _ in 0..rounds {for p in &mut positions {checksum+=std::hint::black_box(cache.score_mode(p,mode)) as i64;}}
        rows.push(serde_json::json!({"mode":name,"positions":positions.len(),"rounds":rounds,"coldMicros":cold_us,"warmMicros":start.elapsed().as_micros(),"checksum":checksum,"scores":first}));
    }
    serde_json::json!(rows)
}

#[cfg(test)]
mod maze_tests {
    use super::*;
    #[test]
    fn expanded_threat_preserves_original_candidates_and_board() {
        let fixtures:serde_json::Value=serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"),"/../evaluation/fixtures/native54-search-review.json"))).unwrap();
        let cache=SharedSearch{profile:2,..SharedSearch::default()};
        for f in fixtures["cases"].as_array().unwrap() {
            let s:State=serde_json::from_value(f["state"].clone()).unwrap();let mut p=Position::from_state(&s).unwrap();
            let key=p.key();let edges=p.edges;
            for side in 0..2 {
                let expanded=cache.maze_potential(&mut p,side);let old=p.potential(side);
                assert!(expanded>=old,"expanded={expanded}, original={old}");
                let full=cache.wall_threat(&mut p,side).gain;assert!(expanded<=full);
                assert_eq!(p.edges,edges);assert!(p.key()==key);
            }
            assert_eq!(cache.evaluate(&mut p),cache.evaluate(&mut mirror_position(&p)));
        }
    }
    #[test]
    fn no_enemy_walls_remove_threat_and_opening_is_unchanged() {
        let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
        let mut p=Position::from_state(&s).unwrap();let cache=SharedSearch{profile:2,..SharedSearch::default()};
        assert_eq!(cache.static_score(&mut p),p.evaluate());p.left=[0,0];assert_eq!(cache.maze_potential(&mut p,0),0);assert_eq!(cache.maze_potential(&mut p,1),0);
    }
    #[test]
    fn cache_only_is_score_identical_and_fast_expansion_matches_reference() {
        let fixtures:serde_json::Value=serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"),"/../evaluation/fixtures/native54-search-review.json"))).unwrap();
        let cache=SharedSearch{profile:2,..SharedSearch::default()};
        for f in fixtures["cases"].as_array().unwrap() {
            let s:State=serde_json::from_value(f["state"].clone()).unwrap();let mut p=Position::from_state(&s).unwrap();
            for _ in 0..12 {
                assert_eq!(cache.score_mode(&mut p,MazeMode::Cache4),p.evaluate());
                assert_eq!(cache.score_mode(&mut p,MazeMode::Combined8),cache.score_mode(&mut p,MazeMode::Reference8));
                for side in 0..2 {assert_eq!(cache.fast_potential(&mut p,side,8),cache.reference_potential(&mut p,side));}
                let key=p.key();let edges=p.edges;cache.score_mode(&mut p,MazeMode::Coverage8);assert!(key==p.key());assert_eq!(edges,p.edges);
                let a=p.moves(p.turn)[0];p.make(a);if p.terminal() {break;}
            }
        }
    }
}
