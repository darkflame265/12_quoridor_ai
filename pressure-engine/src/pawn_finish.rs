#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct WinProof {
    kind: &'static str,
    guaranteed_plies: u16,
    shortest_win_proven: bool,
    wall_spent: bool,
}
impl NativeEngine {
    fn apply_pawn_finish(&mut self,p:&Position,out:&mut NativeOutput,deadline:f64,cancel:&AtomicBool)->bool {
        if !goal_enabled() || p.left[p.turn]==0 || p.left[1-p.turn]!=0 || cancel.load(Ordering::Relaxed) || now()>=deadline {return false;}
        let cached=self.endgames.contains_key(&p.walls);
        if !cached {
            let budget=now()+(deadline-now()).max(0.)*0.25;
            let Ok(table)=FixedMaze::solve(p,budget.min(deadline),cancel)else{return false;};
            if self.endgames.len()>=8 {self.endgames.clear();}
            self.endgames.insert(p.walls,table);
        }
        if cancel.load(Ordering::Relaxed){return false;}
        let Some(table)=self.endgames.get(&p.walls)else{return false;};
        let (value,distance,action)=table.lookup(p);
        // The opponent has no walls, so a pawn-only winning strategy remains
        // legal in the original game. Draw/loss in this restricted game says
        // nothing conclusive about the value of our retained walls.
        if value!=1 || !p.moves(p.turn).contains(&action){return false;}
        out.result.pv=vec![decode(action)];
        out.result.score=WIN-distance as i32;
        out.result.depth=0;
        out.result.nodes=out.result.nodes.saturating_add(if cached{0}else{12960});
        out.exact=Some(true);
        out.outcome=Some(1);
        out.win_proof=Some(WinProof{kind:"pawn-only-strategy",guaranteed_plies:distance,shortest_win_proven:false,wall_spent:false});
        true
    }
}
fn pawn_finish_preferred(out:&NativeOutput,wall_distance:u16)->bool {
    out.outcome==Some(1) && out.win_proof.as_ref().is_some_and(|proof|
        proof.kind=="pawn-only-strategy" && proof.guaranteed_plies<=wall_distance)
}
