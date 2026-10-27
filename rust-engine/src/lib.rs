use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

const WIN: i32 = 30000;
const INF: i32 = 32000;
const VERSION: &str = "Atlas 4 · Rust/WASM";
#[derive(Clone, Copy, Deserialize, Serialize)]
pub struct Coord {
    pub x: usize,
    pub y: usize,
}
#[derive(Clone, Deserialize)]
pub struct Wall {
    pub x: usize,
    pub y: usize,
    pub o: String,
}
#[derive(Clone, Deserialize)]
pub struct State {
    pub p: [Coord; 2],
    pub walls: Vec<Wall>,
    pub left: [usize; 2],
    pub turn: usize,
    pub winner: Option<usize>,
}
#[derive(Clone, Serialize)]
pub struct Action {
    #[serde(rename = "type")]
    kind: &'static str,
    x: usize,
    y: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    o: Option<&'static str>,
}
fn decode(a: u16) -> Action {
    let n = a as usize;
    if n < 81 {
        Action {
            kind: "move",
            x: n % 9,
            y: n / 9,
            o: None,
        }
    } else {
        Action {
            kind: "wall",
            x: (n - 81) % 8,
            y: ((n - 81) % 64) / 8,
            o: Some(if n >= 145 { "v" } else { "h" }),
        }
    }
}
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct Key {
    walls: u128,
    p: [u8; 2],
    left: [u8; 2],
    turn: u8,
}
#[derive(Clone)]
pub struct Position {
    edges: [[i16; 4]; 81],
    walls: u128,
    p: [usize; 2],
    left: [usize; 2],
    turn: usize,
}
#[derive(Clone, Copy)]
struct Undo {
    action: u16,
    old: usize,
}
fn neighbor(n: usize, d: usize) -> i16 {
    match d {
        0 => {
            if n >= 9 {
                (n - 9) as i16
            } else {
                -1
            }
        }
        1 => {
            if n % 9 < 8 {
                (n + 1) as i16
            } else {
                -1
            }
        }
        2 => {
            if n < 72 {
                (n + 9) as i16
            } else {
                -1
            }
        }
        _ => {
            if n % 9 > 0 {
                (n - 1) as i16
            } else {
                -1
            }
        }
    }
}
fn goal(n: usize, t: usize) -> bool {
    if t == 0 {
        n < 9
    } else {
        n >= 72
    }
}
impl Position {
    pub fn from_state(s: &State) -> Result<Self, String> {
        if s.turn > 1
            || s.left.iter().any(|&n| n > 10)
            || s.p.iter().any(|p| p.x > 8 || p.y > 8)
            || s.p[0].x == s.p[1].x && s.p[0].y == s.p[1].y
        {
            return Err("invalid pawn, turn or wall count".into());
        }
        let mut p = Self {
            edges: std::array::from_fn(|n| std::array::from_fn(|d| neighbor(n, d))),
            walls: 0,
            p: s.p.map(|c| c.y * 9 + c.x),
            left: s.left,
            turn: s.turn,
        };
        for w in &s.walls {
            if w.x > 7 || w.y > 7 || !matches!(w.o.as_str(), "h" | "v") {
                return Err("invalid wall".into());
            }
            let a = (81 + if w.o == "v" { 64 } else { 0 } + w.y * 8 + w.x) as u16;
            if !p.fits(a) {
                return Err("overlapping wall".into());
            }
            p.walls |= 1u128 << (a - 81);
            p.toggle(a, true);
        }
        if p.distance(0, false) >= 100 || p.distance(1, false) >= 100 {
            return Err("wall blocks final route".into());
        }
        Ok(p)
    }
    fn key(&self) -> Key {
        Key {
            walls: self.walls,
            p: self.p.map(|n| n as u8),
            left: self.left.map(|n| n as u8),
            turn: self.turn as u8,
        }
    }
    fn occupied(&self, i: usize) -> bool {
        self.walls & (1u128 << i) != 0
    }
    fn toggle(&mut self, a: u16, block: bool) {
        let i = (a - 81) as usize;
        let v = i >= 64;
        let k = i % 64;
        let n = (k / 8) * 9 + k % 8;
        let d = if v { 1 } else { 2 };
        let m = if v { n + 9 } else { n + 1 };
        for n in [n, m] {
            let q = neighbor(n, d) as usize;
            self.edges[n][d] = if block { -1 } else { q as i16 };
            self.edges[q][(d + 2) % 4] = if block { -1 } else { n as i16 };
        }
    }
    fn fits(&self, a: u16) -> bool {
        let i = (a - 81) as usize;
        let v = i >= 64;
        let k = i % 64;
        let x = k % 8;
        let y = k / 8;
        if self.occupied(i) || self.occupied((i + 64) % 128) {
            return false;
        }
        if v {
            !(y > 0 && self.occupied(i - 8) || y < 7 && self.occupied(i + 8))
        } else {
            !(x > 0 && self.occupied(i - 1) || x < 7 && self.occupied(i + 1))
        }
    }
    fn pawn_moves_from(&self, t: usize, from: usize) -> Vec<u16> {
        let mut out = Vec::with_capacity(5);
        let other = self.p[1 - t];
        for d in 0..4 {
            let n = self.edges[from][d];
            if n < 0 {
                continue;
            }
            let n = n as usize;
            if n != other {
                out.push(n as u16);
                continue;
            }
            let jump = self.edges[n][d];
            if jump >= 0 {
                out.push(jump as u16);
            } else {
                for side in [(d + 1) % 4, (d + 3) % 4] {
                    let q = self.edges[n][side];
                    if q >= 0 {
                        out.push(q as u16);
                    }
                }
            }
        }
        out
    }
    fn moves(&self, t: usize) -> Vec<u16> {
        self.pawn_moves_from(t, self.p[t])
    }
    pub fn distance(&self, t: usize, pawns: bool) -> i32 {
        let mut dist = [-1i16; 81];
        let mut queue = [0usize; 81];
        let (mut head, mut tail) = (0, 1);
        queue[0] = self.p[t];
        dist[queue[0]] = 0;
        while head < tail {
            let n = queue[head];
            head += 1;
            if goal(n, t) {
                return dist[n] as i32;
            }
            if pawns {
                for q in self.pawn_moves_from(t, n) {
                    let q = q as usize;
                    if dist[q] < 0 {
                        dist[q] = dist[n] + 1;
                        queue[tail] = q;
                        tail += 1;
                    }
                }
            } else {
                for &q in &self.edges[n] {
                    if q >= 0 && dist[q as usize] < 0 {
                        let q = q as usize;
                        dist[q] = dist[n] + 1;
                        queue[tail] = q;
                        tail += 1;
                    }
                }
            }
        }
        100
    }
    fn goal_map(&self, t: usize) -> [i16; 81] {
        let mut dist = [-1i16; 81];
        let mut queue = [0usize; 81];
        let (mut head, mut tail) = (0, 9);
        for x in 0..9 {
            let n = if t == 0 { x } else { 72 + x };
            queue[x] = n;
            dist[n] = 0;
        }
        while head < tail {
            let n = queue[head];
            head += 1;
            for &q in &self.edges[n] {
                if q >= 0 && dist[q as usize] < 0 {
                    let q = q as usize;
                    dist[q] = dist[n] + 1;
                    queue[tail] = q;
                    tail += 1;
                }
            }
        }
        dist
    }
    fn route(&self, t: usize) -> (i32, i32) {
        let map = self.goal_map(t);
        let n = self.p[t];
        let routes = self.edges[n]
            .iter()
            .filter(|&&q| q >= 0 && map[q as usize] == map[n] - 1)
            .count();
        (map[n] as i32, routes as i32)
    }
    fn make(&mut self, a: u16) -> Undo {
        let u = Undo {
            action: a,
            old: self.p[self.turn],
        };
        if a < 81 {
            self.p[self.turn] = a as usize;
        } else {
            self.walls |= 1u128 << (a - 81);
            self.toggle(a, true);
            self.left[self.turn] -= 1;
        }
        self.turn = 1 - self.turn;
        u
    }
    fn unmake(&mut self, u: Undo) {
        self.turn = 1 - self.turn;
        if u.action < 81 {
            self.p[self.turn] = u.old;
        } else {
            self.walls &= !(1u128 << (u.action - 81));
            self.toggle(u.action, false);
            self.left[self.turn] += 1;
        }
    }
    fn terminal(&self) -> bool {
        goal(self.p[1 - self.turn], 1 - self.turn)
    }
    pub fn actions(&mut self) -> Vec<u16> {
        if self.terminal() {
            return vec![];
        }
        let mut out = self.moves(self.turn);
        if self.left[self.turn] > 0 {
            for a in 81..209u16 {
                if !self.fits(a) {
                    continue;
                }
                self.toggle(a, true);
                let ok = self.distance(0, false) < 100 && self.distance(1, false) < 100;
                self.toggle(a, false);
                if ok {
                    out.push(a);
                }
            }
        }
        out
    }
    fn connections(&self, a: u16) -> i32 {
        let i = (a - 81) as usize;
        let v = i >= 64;
        let x = (i % 64 % 8) as i32;
        let y = (i % 64 / 8) as i32;
        let mut count = 0;
        let same = if v {
            [(x, y - 2), (x, y + 2)]
        } else {
            [(x - 2, y), (x + 2, y)]
        };
        for (x, y) in same {
            if (0..8).contains(&x)
                && (0..8).contains(&y)
                && self.occupied(if v { 64 } else { 0 } + (y * 8 + x) as usize)
            {
                count += 1;
            }
        }
        let cross = if v {
            [(x - 1, y), (x, y), (x - 1, y + 2), (x, y + 2)]
        } else {
            [(x, y - 1), (x, y), (x + 2, y - 1), (x + 2, y)]
        };
        for (x, y) in cross {
            if (0..8).contains(&x)
                && (0..8).contains(&y)
                && self.occupied(if v { 0 } else { 64 } + (y * 8 + x) as usize)
            {
                count += 1;
            }
        }
        count
    }
    fn potential(&mut self, target: usize) -> i32 {
        let attacker = 1 - target;
        if self.left[attacker] == 0 {
            return 0;
        }
        let map = self.goal_map(target);
        let base = map[self.p[target]] as i32;
        let other = self.distance(attacker, false);
        let mut rank = [0f64; 128];
        let mut seen = [false; 81];
        let mut queue = vec![self.p[target]];
        seen[queue[0]] = true;
        let mut head = 0;
        while head < queue.len() {
            let n = queue[head];
            head += 1;
            for &q in &self.edges[n] {
                if q < 0 || map[q as usize] != map[n] - 1 {
                    continue;
                }
                let q = q as usize;
                if !seen[q] {
                    seen[q] = true;
                    queue.push(q);
                }
                let x = (n % 9).min(q % 9) as i32;
                let y = (n / 9).min(q / 9) as i32;
                let v = n / 9 == q / 9;
                let anchors = if v {
                    [(x, y - 1), (x, y)]
                } else {
                    [(x - 1, y), (x, y)]
                };
                for (wx, wy) in anchors {
                    if !(0..8).contains(&wx) || !(0..8).contains(&wy) {
                        continue;
                    }
                    let i = if v { 64 } else { 0 } + (wy * 8 + wx) as usize;
                    let a = (81 + i) as u16;
                    if self.fits(a) {
                        rank[i] += self.connections(a) as f64 * 30.
                            + (base - map[n] as i32) as f64 * 0.2
                            + 1.;
                    }
                }
            }
        }
        let mut choices: Vec<usize> = (0..128).filter(|&i| rank[i] > 0.).collect();
        choices.sort_by(|&a, &b| rank[b].partial_cmp(&rank[a]).unwrap().then(a.cmp(&b)));
        let mut best = 0;
        for i in choices.into_iter().take(4) {
            let a = (81 + i) as u16;
            self.toggle(a, true);
            let d = self.distance(target, false);
            let e = self.distance(attacker, false);
            self.toggle(a, false);
            if d < 100 && e < 100 {
                best = best.max(d - base - (e - other) - 1);
            }
        }
        best
    }
    fn evaluate(&mut self) -> i32 {
        let t = self.turn;
        let o = 1 - t;
        let (a, ar) = self.route(t);
        let (b, br) = self.route(o);
        let near =
            (self.p[0] % 9).abs_diff(self.p[1] % 9) + (self.p[0] / 9).abs_diff(self.p[1] / 9) <= 3;
        let da = if near { self.distance(t, true) } else { a };
        let db = if near { self.distance(o, true) } else { b };
        let total = self.left[t] + self.left[o];
        let stock = |n: usize| 100. * (n as f64).sqrt() + 20. * n as f64;
        let reserve = stock(self.left[t]) - stock(self.left[o]);
        let pressure = (self.potential(o) - self.potential(t)) * 64;
        (db - da) * 120
            + (b - a) * 12
            + if total > 0 { (ar - br) * 8 } else { 0 }
            + (reserve + pressure as f64 + 0.5).floor() as i32
    }
}
#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    fn now_ms() -> f64;
    fn progress(ptr: *const u8, len: usize);
}
fn now() -> f64 {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        return now_ms();
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        use std::sync::OnceLock;
        use std::time::Instant;
        static START: OnceLock<Instant> = OnceLock::new();
        START.get_or_init(Instant::now).elapsed().as_secs_f64() * 1000.
    }
}
#[derive(Clone)]
struct Entry {
    depth: i32,
    score: i32,
    flag: u8,
    best: u16,
    context: Vec<Key>,
}
#[derive(Default)]
pub struct Engine {
    table: HashMap<Key, Entry>,
    evaluations: HashMap<Key, i32>,
    history: Vec<Vec<i32>>,
    killers: Vec<Vec<u16>>,
    deadline: f64,
    nodes: u64,
    node_limit: u64,
    offset: usize,
    stride: usize,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub pv: Vec<Action>,
    pub score: i32,
    pub depth: usize,
    pub nodes: u64,
    pub elapsed_ms: f64,
    pub engine: String,
    pub partitioned: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
impl Engine {
    fn check(&self) -> Result<(), ()> {
        if self.nodes >= self.node_limit || now() >= self.deadline {
            Err(())
        } else {
            Ok(())
        }
    }
    fn ordered(&mut self, p: &mut Position, tt: Option<u16>, ply: usize) -> Result<Vec<u16>, ()> {
        let t = p.turn;
        let own = p.distance(t, false);
        let enemy = p.distance(1 - t, false);
        let mut list = p.moves(t);
        if p.left[t] > 0 {
            list.extend((81..209u16).filter(|&a| p.fits(a)));
        }
        let mut ranked = Vec::new();
        for a in list {
            self.check()?;
            if ply == 0 && a as usize % self.stride != self.offset {
                continue;
            }
            let mut score = self.history[t][a as usize];
            if Some(a) == tt {
                score += 10000000;
            } else if self.killers.get(ply).is_some_and(|v| v.contains(&a)) {
                score += 500000;
            }
            let u = p.make(a);
            if p.terminal() {
                score += 20000000;
            } else {
                let mine = p.distance(t, false);
                let theirs = p.distance(1 - t, false);
                if mine >= 100 || theirs >= 100 {
                    p.unmake(u);
                    continue;
                }
                score += if a < 81 {
                    (own - mine) * 1500 + 250
                } else {
                    ((theirs - enemy) - (mine - own)) * 1600 - 130
                };
            }
            p.unmake(u);
            if a >= 81 {
                score += p.connections(a) * 180;
            }
            ranked.push((a, score));
        }
        ranked.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        Ok(ranked.into_iter().map(|v| v.0).collect())
    }
    fn evaluate(&mut self, p: &mut Position) -> i32 {
        let key = p.key();
        if let Some(&v) = self.evaluations.get(&key) {
            return v;
        }
        let score = p.evaluate();
        if self.evaluations.len() > 25000 {
            self.evaluations.clear();
        }
        self.evaluations.insert(key, score);
        score
    }
    fn negamax(
        &mut self,
        p: &mut Position,
        mut depth: i32,
        mut alpha: i32,
        mut beta: i32,
        ply: usize,
        path: &mut Vec<Key>,
    ) -> Result<i32, ()> {
        self.nodes += 1;
        if self.nodes & 63 == 0 {
            self.check()?;
        }
        if p.terminal() {
            return Ok(-WIN + ply as i32);
        }
        let key = p.key();
        if path.contains(&key) {
            return Ok(0);
        }
        let win = p
            .moves(p.turn)
            .into_iter()
            .find(|&a| goal(a as usize, p.turn));
        if let Some(a) = win {
            self.table.insert(
                key,
                Entry {
                    depth: 99,
                    score: WIN - 1,
                    flag: 0,
                    best: a,
                    context: path.clone(),
                },
            );
            return Ok(WIN - ply as i32 - 1);
        }
        if depth <= 0 {
            let threat = p
                .moves(1 - p.turn)
                .into_iter()
                .any(|a| goal(a as usize, 1 - p.turn));
            if threat && ply < 12 {
                depth = 1;
            } else {
                return Ok(self.evaluate(p));
            }
        }
        let hit = self.table.get(&key).cloned();
        if let Some(e) = &hit {
            if e.context == *path && e.depth >= depth {
                let score = if e.score > WIN - 500 {
                    e.score - ply as i32
                } else if e.score < -WIN + 500 {
                    e.score + ply as i32
                } else {
                    e.score
                };
                match e.flag {
                    0 => return Ok(score),
                    1 => alpha = alpha.max(score),
                    _ => beta = beta.min(score),
                }
                if alpha >= beta {
                    return Ok(score);
                }
            }
        }
        let original_alpha = alpha;
        let original_beta = beta;
        let list = self.ordered(p, hit.as_ref().map(|e| e.best), ply)?;
        if list.is_empty() {
            return Ok(-INF);
        }
        let (mut best, mut best_move) = (-INF, list[0]);
        path.push(key);
        for (i, &a) in list.iter().enumerate() {
            let u = p.make(a);
            let setup = ply < 2 && a >= 81 && p.connections(a) > 0;
            let reduced = depth >= 3
                && i >= 8
                && Some(a) != hit.as_ref().map(|e| e.best)
                && !p.terminal()
                && !setup;
            let result = (|| {
                let mut score;
                if i == 0 {
                    score = -self.negamax(p, depth - 1, -beta, -alpha, ply + 1, path)?;
                } else {
                    score = -self.negamax(
                        p,
                        depth - 1 - if reduced { 1 } else { 0 },
                        -alpha - 1,
                        -alpha,
                        ply + 1,
                        path,
                    )?;
                    if reduced && score > alpha {
                        score = -self.negamax(p, depth - 1, -alpha - 1, -alpha, ply + 1, path)?;
                    }
                    if score > alpha && score < beta {
                        score = -self.negamax(p, depth - 1, -beta, -alpha, ply + 1, path)?;
                    }
                }
                Ok(score)
            })();
            p.unmake(u);
            let score = match result {
                Ok(v) => v,
                Err(()) => {
                    path.pop();
                    return Err(());
                }
            };
            if score > best {
                best = score;
                best_move = a;
            }
            alpha = alpha.max(score);
            if alpha >= beta {
                self.history[p.turn][a as usize] =
                    (self.history[p.turn][a as usize] + depth * depth).min(100000);
                if self.killers.len() <= ply {
                    self.killers.resize(ply + 1, vec![]);
                }
                self.killers[ply].retain(|&n| n != a);
                self.killers[ply].insert(0, a);
                self.killers[ply].truncate(2);
                break;
            }
        }
        path.pop();
        if self.table.len() > 100000 {
            self.table.clear();
        }
        let score = if best > WIN - 500 {
            best + ply as i32
        } else if best < -WIN + 500 {
            best - ply as i32
        } else {
            best
        };
        self.table.insert(
            key,
            Entry {
                depth,
                score,
                flag: if best <= original_alpha {
                    2
                } else if best >= original_beta {
                    1
                } else {
                    0
                },
                best: best_move,
                context: path.clone(),
            },
        );
        Ok(best)
    }
    fn pv(&self, p: &Position, depth: usize) -> Vec<Action> {
        let mut p = p.clone();
        let mut out = vec![];
        let mut seen = vec![];
        for _ in 0..depth {
            let key = p.key();
            if p.terminal() || seen.contains(&key) {
                break;
            }
            seen.push(key);
            if let Some(e) = self.table.get(&key) {
                if !p.actions().contains(&e.best) {
                    break;
                }
                out.push(decode(e.best));
                p.make(e.best);
            } else {
                break;
            }
        }
        out
    }
    pub fn search(
        &mut self,
        s: &State,
        ms: f64,
        max_depth: usize,
        node_limit: u64,
        offset: usize,
        stride: usize,
    ) -> Output {
        let start = now();
        let mut out = Output {
            pv: vec![],
            score: 0,
            depth: 0,
            nodes: 0,
            elapsed_ms: 0.,
            engine: VERSION.into(),
            partitioned: stride > 1,
            error: None,
        };
        let mut p = match Position::from_state(s) {
            Ok(p) => p,
            Err(e) => {
                out.error = Some(e);
                return out;
            }
        };
        if s.winner.is_some() {
            return out;
        }
        self.offset = offset;
        self.stride = stride.max(1);
        self.history = vec![vec![0; 209]; 2];
        self.killers.clear();
        self.nodes = 0;
        self.node_limit = node_limit.max(1);
        self.deadline = start + ms.max(1.);
        let fallback = p
            .actions()
            .into_iter()
            .filter(|&a| a as usize % self.stride == offset)
            .next();
        if let Some(a) = fallback {
            out.pv = vec![decode(a)];
        } else {
            return out;
        }
        // A partition has different bounds: never reuse the previous root score.
        self.table.remove(&p.key());
        for depth in 1..=max_depth.min(64) {
            if self.check().is_err() {
                break;
            }
            match self.negamax(&mut p, depth as i32, -INF, INF, 0, &mut vec![]) {
                Ok(score) => {
                    let pv = self.pv(&p, depth);
                    if !pv.is_empty() {
                        out.pv = pv;
                        out.depth = depth;
                        out.score = score;
                    }
                    out.nodes = self.nodes;
                    out.elapsed_ms = now() - start;
                    #[cfg(target_arch = "wasm32")]
                    {
                        if let Ok(bytes) = serde_json::to_vec(&out) {
                            unsafe {
                                progress(bytes.as_ptr(), bytes.len());
                            }
                        }
                    }
                    if score.abs() > WIN - 500 {
                        break;
                    }
                }
                Err(()) => break,
            }
        }
        out.nodes = self.nodes;
        out.elapsed_ms = now() - start;
        out
    }
}
thread_local! {static ENGINE:RefCell<Engine>=RefCell::new(Engine::default());}
static LENGTH: AtomicUsize = AtomicUsize::new(0);
#[no_mangle]
pub extern "C" fn q_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}
#[no_mangle]
pub unsafe extern "C" fn q_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
    }
}
fn output(bytes: Vec<u8>) -> *mut u8 {
    LENGTH.store(bytes.len(), Ordering::Relaxed);
    Box::into_raw(bytes.into_boxed_slice()) as *mut u8
}
#[no_mangle]
pub extern "C" fn q_len() -> usize {
    LENGTH.load(Ordering::Relaxed)
}
#[no_mangle]
pub unsafe extern "C" fn q_solve(
    ptr: *const u8,
    len: usize,
    ms: f64,
    depth: usize,
    nodes: u32,
    offset: usize,
    stride: usize,
) -> *mut u8 {
    let data = std::slice::from_raw_parts(ptr, len);
    let result = match serde_json::from_slice::<State>(data) {
        Ok(s) => ENGINE
            .with(|e| {
                serde_json::to_vec(&e.borrow_mut().search(
                    &s,
                    ms,
                    depth,
                    if nodes == 0 { u64::MAX } else { nodes as u64 },
                    offset,
                    stride,
                ))
            })
            .unwrap(),
        Err(e) => serde_json::to_vec(&serde_json::json!({"error":e.to_string()})).unwrap(),
    };
    output(result)
}
#[no_mangle]
pub unsafe extern "C" fn q_inspect(ptr: *const u8, len: usize) -> *mut u8 {
    let result = (|| {
        let s: State = serde_json::from_slice(std::slice::from_raw_parts(ptr, len))
            .map_err(|e| e.to_string())?;
        let mut p = Position::from_state(&s)?;
        Ok::<_, String>(
            serde_json::json!({"actions":p.actions(),"distances":[p.distance(0,false),p.distance(1,false)],"score":p.evaluate()}),
        )
    })();
    output(
        serde_json::to_vec(&match result {
            Ok(v) => v,
            Err(e) => serde_json::json!({"error":e}),
        })
        .unwrap(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn initial() -> State {
        serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap()
    }
    #[test]
    fn moves_and_routes() {
        let mut p = Position::from_state(&initial()).unwrap();
        assert_eq!(p.actions().len(), 131);
        assert_eq!(p.distance(0, false), 8);
    }
    #[test]
    fn restores_every_action() {
        let mut p = Position::from_state(&initial()).unwrap();
        let key = p.key();
        let edges = p.edges;
        for a in p.actions() {
            let u = p.make(a);
            p.unmake(u);
            assert!(p.key() == key);
            assert_eq!(p.edges, edges);
        }
    }
    #[test]
    fn finds_jump_finish() {
        let mut s = initial();
        s.p = [Coord { x: 4, y: 2 }, Coord { x: 4, y: 1 }];
        let r = Engine::default().search(&s, 200., 4, 100000, 0, 1);
        assert_eq!(r.pv[0].y, 0);
        assert_eq!(r.pv[0].x, 4);
    }
}
