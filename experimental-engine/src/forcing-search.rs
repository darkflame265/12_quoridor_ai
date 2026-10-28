impl SharedSearch {
    fn forcing_ranked(&self,p:&mut Position)->Ranked {
        // Preserve the original order exactly; change only LMR exemptions.
        let ranked=self.legacy_ranked(p);let (key,flip)=canonical(p.key());
        let enemy=1-p.turn;
        let immediate=p.moves(enemy).into_iter().any(|a|goal(a as usize,enemy));
        let mut protected=vec![];
        for &(a,score) in &ranked {
            let winning=score>=20_000_000;
            let net=if a>=81&&!winning {(score-p.ordering_connections(a)*connection_order_weight()+130)/1600}else{0};
            let defense=if immediate {
                let undo=p.make(a);
                let safe=p.terminal()||!p.moves(enemy).into_iter().any(|q|goal(q as usize,enemy));
                p.unmake(undo);safe
            }else{false};
            // No top-four cutoff: a profitable disconnected wall must not
            // disappear merely because connected walls rank ahead of it.
            if winning||defense||a>=81&&net>=2 {protected.push(if flip {mirror_action(a)}else{a});}
        }
        let mut cache=self.critical[Self::shard(&key)].write().unwrap();
        if cache.len()>=512 {cache.clear();}cache.insert(key,protected);
        ranked
    }
}

pub fn forcing_review(states:&[State])->serde_json::Value {
    let mut rows=vec![];
    for (index,s) in states.iter().enumerate() {
        let mut p=Position::from_state(s).unwrap();let key=p.key();let edges=p.edges;
        let legacy=SharedSearch{profile:2,..SharedSearch::default()}.legacy_ranked(&mut p);
        let cache=SharedSearch{profile:2,..SharedSearch::default()};let found=cache.forcing_ranked(&mut p);
        assert_eq!(legacy,found);assert!(key==p.key());assert_eq!(edges,p.edges);
        let protected:Vec<_>=found.iter().filter(|(a,_)|cache.critical_mode(&p,*a,SearchMode::Forcing)).map(|&(a,_)|a).collect();
        rows.push(serde_json::json!({"index":index,"actions":found.len(),"protected":protected}));
    }
    serde_json::json!(rows)
}

pub fn forcing_analysis(states:&[State])->serde_json::Value {
    let mut rows=vec![];
    for (index,s) in states.iter().enumerate() {
        let mut p=Position::from_state(s).unwrap();let key=p.key();let edges=p.edges;
        let cache=SharedSearch{profile:2,..SharedSearch::default()};
        let ranked=cache.forcing_ranked(&mut p);
        let protected:Vec<_>=ranked.iter().filter(|(a,_)|cache.critical_mode(&p,*a,SearchMode::Forcing)).map(|&(a,_)|a).collect();
        let mut threats=vec![];
        for target in 0..2 {
            let fast=cache.fast_potential(&mut p,target,4);
            let expanded=cache.fast_potential(&mut p,target,8);
            let full=cache.wall_threat(&mut p,target);
            let candidates=if target!=p.turn {&protected[..]}else{&[][..]};
            threats.push(serde_json::json!({"target":target,"fast4":fast,"fast8":expanded,
                "fullGain":full.gain,"fullDelay":full.delay,"bestWall":full.action,
                "bestWallProtected":full.action.is_some_and(|a|candidates.contains(&a))}));
        }
        assert!(key==p.key());assert_eq!(edges,p.edges);
        rows.push(serde_json::json!({"index":index,"actions":ranked.len(),"protected":protected,"threats":threats}));
    }
    serde_json::json!(rows)
}

#[cfg(test)]
mod forcing_tests {
    use super::*;
    #[test]
    fn every_legal_immediate_defense_keeps_depth_without_changing_order() {
        let s:State=serde_json::from_str(r#"{"p":[{"x":0,"y":5},{"x":4,"y":7}],"walls":[],"left":[1,1],"turn":0,"winner":null}"#).unwrap();
        for mirror in [false,true] {
            let p=Position::from_state(&s).unwrap();let mut p=if mirror {mirror_position(&p)}else{p};
            let cache=SharedSearch{profile:2,..SharedSearch::default()};let key=p.key();let edges=p.edges;let enemy=1-p.turn;
            let expected=cache.reference_ranked(&mut p);let actual=cache.forcing_ranked(&mut p);assert_eq!(actual,expected);
            let mut defenses=0;
            for (a,_) in actual {
                let u=p.make(a);let safe=p.terminal()||!p.moves(enemy).into_iter().any(|q|goal(q as usize,enemy));p.unmake(u);
                if safe {defenses+=1;assert!(cache.critical_mode(&p,a,SearchMode::Forcing));}
            }
            assert!(defenses>0);assert!(key==p.key());assert_eq!(edges,p.edges);
        }
    }
}
