#[derive(Clone,Copy,PartialEq)]
enum SearchMode {Legacy,Ordering,Protected}
fn search_mode()->SearchMode {
    static MODE:std::sync::OnceLock<SearchMode>=std::sync::OnceLock::new();
    *MODE.get_or_init(||match std::env::var("QUORIDOR_MAZE_SEARCH").as_deref() {
        Ok("ordering")=>SearchMode::Ordering,Ok("protected")=>SearchMode::Protected,
        Ok("legacy")|Err(_)=>SearchMode::Legacy,Ok(other)=>panic!("Unknown search mode: {other}"),
    })
}
impl SharedSearch {
    fn ranked(&self,p:&mut Position)->Ranked {self.ranked_mode(p,search_mode())}
    fn ranked_mode(&self,p:&mut Position,mode:SearchMode)->Ranked {
        if self.profile!=2||mode==SearchMode::Legacy {return self.legacy_ranked(p);}
        let (key,flip)=canonical(p.key());
        if flip {let mut mirrored=mirror_position(p);return self.ranked_mode(&mut mirrored,mode).into_iter().map(|(a,s)|(mirror_action(a),s)).collect();}
        if let Some(list)=self.moves[Self::shard(&key)].read().unwrap().get(&key) {
            self.hits.fetch_add(1,Ordering::Relaxed);
            return list.iter().map(|&(a,s)|(if flip {mirror_action(a)} else {a},s)).collect();
        }
        let t=p.turn;let own=p.distance(t,false);let enemy=p.distance(1-t,false);
        let urgent=enemy<=2||p.moves(1-t).into_iter().any(|a|goal(a as usize,1-t));
        let mut actions=p.moves(t);
        if p.left[t]>0 {actions.extend((81..209u16).filter(|&a|p.fits(a)));}
        let mut ranked=vec![];let mut protected=vec![];
        for a in actions {
            let connections=if a>=81 {p.connections(a)} else {0};
            let u=p.make(a);let mut critical=false;
            let score=if p.terminal() {20_000_000} else {
                let mine=p.distance(t,false);let theirs=p.distance(1-t,false);
                if mine>=100||theirs>=100 {p.unmake(u);continue;}
                let net=(theirs-enemy)-(mine-own);
                let defense=urgent&&(a<81||theirs>enemy);
                let forcing=a>=81&&(net>=2||p.left[t]==0&&theirs>enemy||connections>0&&net>=1);
                critical=defense||forcing;
                let base=if a<81 {(own-mine)*1500+250} else {net*1600-130};
                base+if a>=81&&urgent&&theirs>enemy {6000} else if a>=81&&connections>0&&net>=1 {400} else {0}
            };
            p.unmake(u);let score=score+connections*180;
            ranked.push((a,score));
            if critical {protected.push((if flip {mirror_action(a)} else {a},score));}
        }
        // Bound nonurgent full-depth exceptions. All actions stay in the tree;
        // reduced actions that improve alpha retain the existing full re-search.
        if !urgent {protected.sort_by(|a,b|b.1.cmp(&a.1).then(a.0.cmp(&b.0)));protected.truncate(4);}
        let mut metadata=self.critical[Self::shard(&key)].write().unwrap();
        if metadata.len()>=512 {metadata.clear();}
        metadata.insert(key,protected.into_iter().map(|(a,_)|a).collect());drop(metadata);
        let mut cache=self.moves[Self::shard(&key)].write().unwrap();if cache.len()>=512 {cache.clear();}
        cache.insert(key,ranked.iter().map(|&(a,s)|(if flip {mirror_action(a)} else {a},s)).collect());
        ranked
    }
    fn is_critical(&self,p:&Position,a:u16)->bool {self.critical_mode(p,a,search_mode())}
    fn critical_mode(&self,p:&Position,a:u16,mode:SearchMode)->bool {
        if self.profile!=2||mode!=SearchMode::Protected {return self.legacy_is_critical(p,a);}
        let (key,flip)=canonical(p.key());let a=if flip {mirror_action(a)} else {a};
        self.critical[Self::shard(&key)].read().unwrap().get(&key).is_none_or(|list|list.contains(&a))
    }
}

#[cfg(test)]
mod ordering_tests {
    use super::*;
    fn cache()->SharedSearch {SharedSearch{profile:2,..SharedSearch::default()}}
    #[test]
    fn ordering_keeps_every_legal_action_and_restores_state_and_mirrors() {
        let fixtures:serde_json::Value=serde_json::from_str(include_str!(concat!(env!("CARGO_MANIFEST_DIR"),"/../evaluation/fixtures/native54-search-review.json"))).unwrap();
        for f in fixtures["cases"].as_array().unwrap() {
            let s:State=serde_json::from_value(f["state"].clone()).unwrap();let mut p=Position::from_state(&s).unwrap();let key=p.key();let edges=p.edges;
            let mut expected:Vec<u16>=cache().legacy_ranked(&mut p).into_iter().map(|(a,_)|a).collect();expected.sort();
            for mode in [SearchMode::Ordering,SearchMode::Protected] {
                let c=cache();let mut found=c.ranked_mode(&mut p,mode);let mut ids:Vec<u16>=found.iter().map(|(a,_)|*a).collect();ids.sort();assert_eq!(ids,expected);assert!(key==p.key());assert_eq!(p.edges,edges);
                let mut mirrored=mirror_position(&p);let mut other=cache().ranked_mode(&mut mirrored,mode);for (a,_) in &mut other {*a=mirror_action(*a);}found.sort();other.sort();assert_eq!(found,other);
                if p.distance(1-p.turn,false)>2&&!p.moves(1-p.turn).into_iter().any(|a|goal(a as usize,1-p.turn)) {assert!(ids.iter().filter(|&&a|c.critical_mode(&p,a,mode)).count()<=if mode==SearchMode::Protected {4} else {0});}
                for &a in &ids {assert_eq!(c.critical_mode(&p,a,mode),c.critical_mode(&mirrored,mirror_action(a),mode));}
            }
        }
    }
    #[test]
    fn urgent_defenses_are_protected_but_ordering_only_keeps_legacy_reductions() {
        let s:State=serde_json::from_str(r#"{"p":[{"x":0,"y":5},{"x":4,"y":7}],"walls":[],"left":[1,1],"turn":0,"winner":null}"#).unwrap();
        let mut p=Position::from_state(&s).unwrap();let c=cache();let list=c.ranked_mode(&mut p,SearchMode::Protected);let wall=81+7*8+3;
        assert!(list.iter().any(|(a,_)|*a==wall));assert!(c.critical_mode(&p,wall,SearchMode::Protected));assert!(!c.critical_mode(&p,wall,SearchMode::Ordering));
        let score=|a|list.iter().find(|(m,_)|*m==a).unwrap().1;assert!(score(wall)>score(81));
    }
}
