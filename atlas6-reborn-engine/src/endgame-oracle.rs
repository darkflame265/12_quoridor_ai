// Completed fixed-maze tables are read on first entry into a wall-free ending.
// New tables may use a quarter of the root budget. Partial tables are discarded.
impl SharedSearch {
    fn oracle_score(
        &self,
        p: &Position,
        ply: usize,
        path: &[Key],
        deadline: f64,
        cancel: &AtomicBool,
    ) -> Result<Option<i32>, ()> {
        if p.left != [0, 0] || path.iter().any(|k| k.left == [0, 0]) {
            return Ok(None);
        }
        if cancel.load(Ordering::Relaxed) || now() >= deadline {
            return Err(());
        }
        let cached = self.oracle.lock().unwrap().get(&p.walls).cloned();
        let table = if let Some(table) = cached {
            self.oracle_hits.fetch_add(1, Ordering::Relaxed);
            table
        } else {
            let budget = f64::from_bits(self.oracle_deadline.load(Ordering::Relaxed)).min(deadline);
            if now() >= budget {
                return Ok(None);
            }
            let Ok(table) = FixedMaze::solve(p, budget, cancel) else {
                if cancel.load(Ordering::Relaxed) || now() >= deadline {
                    return Err(());
                }
                return Ok(None);
            };
            let table = Arc::new(table);
            let mut cache = self.oracle.lock().unwrap();
            if cache.len() >= 32 {
                cache.clear();
            }
            cache.insert(p.walls, table.clone());
            self.oracle_solves.fetch_add(1, Ordering::Relaxed);
            table
        };
        let (value, distance, _) = table.lookup(p);
        if value == -1 && ply == 1 && path.len() == 1 {
            let added = p.walls ^ path[0].walls;
            if added.count_ones() == 1 {
                self.root_wins
                    .lock()
                    .unwrap()
                    .insert(81 + added.trailing_zeros() as u16, distance);
            }
        }
        Ok(Some(value as i32 * (WIN - distance as i32 - ply as i32)))
    }
}

#[cfg(test)]
mod oracle_tests {
    use super::*;
    fn ending() -> Position {
        let s: State = serde_json::from_str(
            r#"{"p":[{"x":4,"y":4},{"x":4,"y":5}],"walls":[],"left":[0,0],"turn":1,"winner":null}"#,
        )
        .unwrap();
        Position::from_state(&s).unwrap()
    }
    #[test]
    fn oracle_reuses_complete_tables_and_respects_path_context() {
        let p = ending();
        let shared = SharedSearch::default();
        let until = now() + 10000.;
        shared
            .oracle_deadline
            .store(until.to_bits(), Ordering::Relaxed);
        let cancel = AtomicBool::new(false);
        let expected = FixedMaze::solve(&p, until, &cancel).unwrap().lookup(&p);
        let mut before = p.key();
        before.left = [1, 0];
        let score = shared
            .oracle_score(&p, 1, &[before], until, &cancel)
            .unwrap()
            .unwrap();
        assert_eq!(score, expected.0 as i32 * (WIN - expected.1 as i32 - 1));
        assert_eq!(shared.oracle_solves.load(Ordering::Relaxed), 1);
        assert_eq!(
            shared
                .oracle_score(&p, 1, &[before], until, &cancel)
                .unwrap(),
            Some(score)
        );
        assert_eq!(shared.oracle_hits.load(Ordering::Relaxed), 1);
        assert_eq!(
            shared
                .oracle_score(&p, 2, &[p.key()], until, &cancel)
                .unwrap(),
            None
        );
    }
    #[test]
    fn cancelled_or_out_of_budget_work_does_not_publish_partial_tables() {
        let p = ending();
        let shared = SharedSearch::default();
        let until = now() + 1000.;
        assert_eq!(
            shared
                .oracle_score(&p, 1, &[], until, &AtomicBool::new(false))
                .unwrap(),
            None
        );
        assert!(shared.oracle.lock().unwrap().is_empty());
        shared
            .oracle_deadline
            .store(until.to_bits(), Ordering::Relaxed);
        assert!(shared
            .oracle_score(&p, 1, &[], until, &AtomicBool::new(true))
            .is_err());
        assert!(shared.oracle.lock().unwrap().is_empty());
    }
    #[test]
    fn a_last_wall_is_scored_by_its_actual_ending_at_depth_one() {
        let s: State = serde_json::from_str(
            r#"{"p":[{"x":4,"y":4},{"x":4,"y":5}],"walls":[{"x":2,"y":5,"o":"h"},{"x":6,"y":5,"o":"h"}],"left":[1,0],"turn":0,"winner":null}"#,
        )
        .unwrap();
        let mut engine = NativeEngine::default();
        let r = engine.search(&s, 2000., 2, 1, false, Arc::new(AtomicBool::new(false)), |_| {});
        assert_eq!(r.result.depth, 1);
        assert!(r.endgame_solves > 0);
        assert!(r.result.score > WIN - 100);
        assert_eq!(r.exact, Some(true));
        assert_eq!(r.outcome, Some(1));
        let a = &r.result.pv[0];
        assert_eq!(a.kind, "wall");
        let mut p = Position::from_state(&s).unwrap();
        let action = (81 + if a.o.as_deref() == Some("v") { 64 } else { 0 } + a.y * 8 + a.x) as u16;
        p.make(action);
        let table = FixedMaze::solve(&p, now() + 10000., &AtomicBool::new(false)).unwrap();
        assert_eq!(table.lookup(&p).0, -1);
    }
}
