
// Exact retrograde WDL for a fixed board with exactly one unplaced wall.
// Pawn transitions stay in this table; spending the final wall enters a
// pre-solved zero-wall FixedMaze. Incomplete tables are never published.
struct OneWallMaze {
    outcome: Vec<i8>,
    distance: Vec<u16>,
    best: Vec<u16>,
}
impl OneWallMaze {
    fn solve(p:&Position,deadline:Instant,cancel:&AtomicBool)->Result<Self,()>{
        if p.left[0]+p.left[1]!=1{return Err(());}
        let owner=if p.left[0]==1{0}else{1};
        let size=81*81*2;
        let mut outcome=vec![0i8;size];
        let mut distance=vec![0u16;size];
        let mut best=vec![u16::MAX;size];
        let mut degree=vec![0u16;size];
        let mut max_loss=vec![0u16;size];
        let mut draw_wall=vec![u16::MAX;size];
        let mut parents:Vec<Vec<(usize,u16)>>=vec![vec![];size];
        let mut queue=Vec::with_capacity(size);
        let mut pos=p.clone();
        for a in 0..81{
            if Instant::now()>=deadline||cancel.load(Ordering::Relaxed){return Err(());}
            for b in 0..81{
                if a==b{continue;}
                for turn in 0..2{
                    let id=FixedMaze::index(a,b,turn);
                    pos.p=[a,b];pos.turn=turn;
                    if goal(a,0)||goal(b,1){
                        let winner=if goal(a,0){0}else{1};
                        outcome[id]=if winner==turn{1}else{-1};
                        queue.push(id);
                        continue;
                    }
                    for m in pos.moves(turn){
                        let child=if turn==0{FixedMaze::index(m as usize,b,1)}else{FixedMaze::index(a,m as usize,0)};
                        parents[child].push((id,m));
                        degree[id]+=1;
                    }
                }
            }
        }
        // Only the wall-holder can place walls. Each new wall has an
        // exactly solved zero-wall successor, including pawn jumps.
        for wall in 81u16..209{
            if Instant::now()>=deadline||cancel.load(Ordering::Relaxed){return Err(());}
            if !p.fits(wall){continue;}
            let mut next=p.clone();
            next.turn=owner;
            next.make(wall);
            let map0=next.goal_map(0);
            let map1=next.goal_map(1);
            let solved=FixedMaze::solve(&next,deadline,cancel)?;
            for a in 0..81{
                if a&15==0 && (Instant::now()>=deadline||cancel.load(Ordering::Relaxed)){return Err(());}
                if map0[a]<0||goal(a,0){continue;}
                for b in 0..81{
                    if a==b||map1[b]<0||goal(b,1){continue;}
                    let parent=FixedMaze::index(a,b,owner);
                    degree[parent]+=1;
                    let child=FixedMaze::index(a,b,1-owner);
                    let value=solved.outcome[child];
                    let d=solved.distance[child].saturating_add(1);
                    if value<0{
                        if outcome[parent]!=1||d<distance[parent]{
                            if outcome[parent]==0{queue.push(parent);}
                            outcome[parent]=1;distance[parent]=d;best[parent]=wall;
                        }
                    }else if value>0{
                        degree[parent]-=1;
                        if d>=max_loss[parent]{max_loss[parent]=d; if outcome[parent]==0{best[parent]=wall;}}
                    }else if draw_wall[parent]==u16::MAX{
                        draw_wall[parent]=wall;
                    }
                }
            }
        }
        for id in 0..size{
            if outcome[id]==0&&degree[id]==0{
                outcome[id]=-1;distance[id]=max_loss[id];queue.push(id);
            }
        }
        let mut head=0;
        while head<queue.len(){
            if head&255==0&&(Instant::now()>=deadline||cancel.load(Ordering::Relaxed)){return Err(());}
            let child=queue[head];head+=1;
            for &(parent,m) in &parents[child]{
                if outcome[parent]!=0{continue;}
                if outcome[child]<0{
                    outcome[parent]=1;
                    distance[parent]=distance[child].saturating_add(1);
                    best[parent]=m;
                    queue.push(parent);
                }else{
                    degree[parent]-=1;
                    let d=distance[child].saturating_add(1);
                    if d>=max_loss[parent]{max_loss[parent]=d;best[parent]=m;}
                    if degree[parent]==0{
                        outcome[parent]=-1;distance[parent]=max_loss[parent];queue.push(parent);
                    }
                }
            }
        }
        // Draws must preserve a drawn successor, never select an
        // arbitrary move that allows an immediate forced loss.
        for a in 0..81{
            for b in 0..81{
                if a==b{continue;}
                for turn in 0..2{
                    let id=FixedMaze::index(a,b,turn);
                    if outcome[id]!=0{continue;}
                    pos.p=[a,b];pos.turn=turn;
                    let keep=pos.moves(turn).into_iter().find(|&m|{
                        let child=if turn==0{FixedMaze::index(m as usize,b,1)}else{FixedMaze::index(a,m as usize,0)};
                        outcome[child]==0
                    });
                    best[id]=keep.or_else(||if turn==owner&&draw_wall[id]!=u16::MAX{Some(draw_wall[id])}else{None}).unwrap_or(u16::MAX);
                }
            }
        }
        Ok(Self{outcome,distance,best})
    }
    fn lookup(&self,p:&Position)->(i8,u16,u16){
        let id=FixedMaze::index(p.p[0],p.p[1],p.turn);
        (self.outcome[id],self.distance[id],self.best[id])
    }
}
