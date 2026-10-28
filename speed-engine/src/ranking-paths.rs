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

