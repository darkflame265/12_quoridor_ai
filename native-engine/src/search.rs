use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64};
use std::sync::{Arc, Mutex, RwLock};

const SHARDS: usize = 64;
type Ranked = Vec<(u16, i32)>;
fn mirror_key(k: Key) -> Key {
    let mut walls = 0u128;
    for i in 0..16 {
        walls |= (((k.walls >> (i * 8)) as u8).reverse_bits() as u128) << (i * 8);
    }
    Key {
        walls,
        p: k.p.map(|n| {
            let n = n as usize;
            (n + 8 - 2 * (n % 9)) as u8
        }),
        left: k.left,
        turn: k.turn,
    }
}
fn mirror_action(a: u16) -> u16 {
    if a < 81 {
        a + 8 - 2 * (a % 9)
    } else {
        let k = a - 81;
        81 + k + 7 - 2 * (k % 8)
    }
}
fn canonical(k: Key) -> (Key, bool) {
    let other = mirror_key(k);
    if (other.walls, other.p, other.left, other.turn) < (k.walls, k.p, k.left, k.turn) {
        (other, true)
    } else {
        (k, false)
    }
}
fn mirror_position(p: &Position) -> Position {
    let mut out = p.clone();
    let key = mirror_key(p.key());
    out.walls = key.walls;
    out.p = key.p.map(|n| n as usize);
    for n in 0..81 {
        let dest = n + 8 - 2 * (n % 9);
        for d in 0..4 {
            let q = p.edges[n][d];
            out.edges[dest][[0, 3, 2, 1][d]] = if q < 0 {
                -1
            } else {
                let q = q as usize;
                (q + 8 - 2 * (q % 9)) as i16
            };
        }
    }
    out
}
fn mirror_entry(mut e: Entry) -> Entry {
    e.best = mirror_action(e.best);
    e.context = e.context.into_iter().map(mirror_key).collect();
    e
}
struct SharedSearch {
    profile: u8,
    entries: Vec<RwLock<HashMap<Key, Entry>>>,
    evaluations: Vec<RwLock<HashMap<Key, i32>>>,
    moves: Vec<RwLock<HashMap<Key, Ranked>>>,
    critical: Vec<RwLock<HashMap<Key, Vec<u16>>>>,
    geometries: Vec<RwLock<HashMap<u128, Arc<GoalGeometry>>>>,
    hits: AtomicU64,
}
impl Default for SharedSearch {
    fn default() -> Self {
        Self {
            profile: 0,
            entries: (0..SHARDS).map(|_| RwLock::new(HashMap::new())).collect(),
            evaluations: (0..SHARDS).map(|_| RwLock::new(HashMap::new())).collect(),
            moves: (0..SHARDS).map(|_| RwLock::new(HashMap::new())).collect(),
            critical: (0..SHARDS).map(|_| RwLock::new(HashMap::new())).collect(),
            geometries: (0..SHARDS).map(|_| RwLock::new(HashMap::new())).collect(),
            hits: AtomicU64::new(0),
        }
    }
}
impl SharedSearch {
    fn shard(k: &Key) -> usize {
        ((k.walls as u64 ^ (k.walls >> 64) as u64).wrapping_mul(0x9e3779b97f4a7c15)
            ^ (k.p[0] as u64 * 331 + k.p[1] as u64 * 17 + k.turn as u64)) as usize
            % SHARDS
    }
    fn entry(&self, key: &Key) -> Option<Entry> {
        let (key, flip) = canonical(*key);
        let value = self.entries[Self::shard(&key)]
            .read()
            .unwrap()
            .get(&key)
            .cloned();
        if value.is_some() {
            self.hits.fetch_add(1, Ordering::Relaxed);
        }
        value.map(|e| if flip { mirror_entry(e) } else { e })
    }
    fn store(&self, key: Key, value: Entry) {
        let (key, flip) = canonical(key);
        let value = if flip { mirror_entry(value) } else { value };
        let mut map = self.entries[Self::shard(&key)].write().unwrap();
        if map.len() >= 2048 {
            map.clear();
        }
        if map
            .get(&key)
            .is_none_or(|old| value.depth >= old.depth || value.context != old.context)
        {
            map.insert(key, value);
        }
    }
    fn evaluate(&self, p: &mut Position) -> i32 {
        let (key, flip) = canonical(p.key());
        if let Some(&score) = self.evaluations[Self::shard(&key)]
            .read()
            .unwrap()
            .get(&key)
        {
            self.hits.fetch_add(1, Ordering::Relaxed);
            return score;
        }
        let score = if flip {
            self.static_score(&mut mirror_position(p))
        } else {
            self.static_score(p)
        };
        let mut map = self.evaluations[Self::shard(&key)].write().unwrap();
        if map.len() >= 1024 {
            map.clear();
        }
        map.insert(key, score);
        score
    }
    fn ranked(&self, p: &mut Position) -> Ranked {
        let (key, flip) = canonical(p.key());
        if let Some(list) = self.moves[Self::shard(&key)].read().unwrap().get(&key) {
            self.hits.fetch_add(1, Ordering::Relaxed);
            return list
                .iter()
                .map(|&(a, s)| (if flip { mirror_action(a) } else { a }, s))
                .collect();
        }
        let t = p.turn;
        let own = p.distance(t, false);
        let enemy = p.distance(1 - t, false);
        let mut list = p.moves(t);
        if p.left[t] > 0 {
            list.extend((81..209u16).filter(|&a| p.fits(a)));
        }
        let mut ranked = vec![];
        let mut critical = vec![];
        let urgent = self.profile >= 2
            && (enemy <= 2 || p.moves(1 - t).into_iter().any(|a| goal(a as usize, 1 - t)));
        for a in list {
            let u = p.make(a);
            let score = if p.terminal() {
                20000000
            } else {
                let mine = p.distance(t, false);
                let theirs = p.distance(1 - t, false);
                if mine >= 100 || theirs >= 100 {
                    p.unmake(u);
                    continue;
                }
                if self.profile >= 2
                    && (urgent && (a < 81 || theirs > enemy)
                        || a >= 81
                            && ((theirs - enemy) - (mine - own) >= 2
                                || p.left[t] == 0 && theirs > enemy))
                {
                    critical.push(if flip { mirror_action(a) } else { a });
                }
                if a < 81 {
                    (own - mine) * 1500 + 250
                } else {
                    ((theirs - enemy) - (mine - own)) * 1600 - 130
                }
            };
            p.unmake(u);
            ranked.push((a, score + if a >= 81 { p.connections(a) * 180 } else { 0 }));
        }
        let mut protected = self.critical[Self::shard(&key)].write().unwrap();
        if protected.len() >= 512 {
            protected.clear();
        }
        protected.insert(key, critical);
        drop(protected);
        let mut map = self.moves[Self::shard(&key)].write().unwrap();
        if map.len() >= 512 {
            map.clear();
        }
        map.insert(
            key,
            ranked
                .iter()
                .map(|&(a, s)| (if flip { mirror_action(a) } else { a }, s))
                .collect(),
        );
        ranked
    }
}
struct NativeSearcher {
    shared: Arc<SharedSearch>,
    deadline: f64,
    cancel: Arc<AtomicBool>,
    nodes: u64,
    history: [[i32; 209]; 2],
    killers: Vec<Vec<u16>>,
}
impl NativeSearcher {
    fn new(shared: Arc<SharedSearch>) -> Self {
        Self {
            shared,
            deadline: 0.,
            cancel: Arc::new(AtomicBool::new(false)),
            nodes: 0,
            history: [[0; 209]; 2],
            killers: vec![],
        }
    }
    fn prepare(&mut self, deadline: f64, cancel: Arc<AtomicBool>) {
        self.deadline = deadline;
        self.cancel = cancel;
        self.nodes = 0;
        self.killers.clear();
        for row in &mut self.history {
            for n in row {
                *n /= 2;
            }
        }
    }
    fn check(&self) -> Result<(), ()> {
        if now() >= self.deadline || self.cancel.load(Ordering::Relaxed) {
            Err(())
        } else {
            Ok(())
        }
    }
    fn ordered(&self, p: &mut Position, best: Option<u16>, ply: usize) -> Result<Vec<u16>, ()> {
        self.check()?;
        let t = p.turn;
        let mut ranked = self.shared.ranked(p);
        for (a, score) in &mut ranked {
            *score += self.history[t][*a as usize];
            if Some(*a) == best {
                *score += 10000000;
            } else if self.killers.get(ply).is_some_and(|v| v.contains(a)) {
                *score += 500000;
            }
        }
        ranked.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        Ok(ranked.into_iter().map(|(a, _)| a).collect())
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
        if let Some(a) = p
            .moves(p.turn)
            .into_iter()
            .find(|&a| goal(a as usize, p.turn))
        {
            self.shared.store(
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
            if ply < 12
                && p.moves(1 - p.turn)
                    .into_iter()
                    .any(|a| goal(a as usize, 1 - p.turn))
            {
                depth = 1;
            } else {
                if self.shared.profile > 0 {
                    self.check()?;
                }
                return Ok(self.shared.evaluate(p));
            }
        }
        let hit = self.shared.entry(&key);
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
            let protected = self.shared.is_critical(p, a);
            let u = p.make(a);
            let setup = ply < 2 && a >= 81 && p.connections(a) > 0;
            let reduce = depth >= 3
                && i >= 8
                && Some(a) != hit.as_ref().map(|e| e.best)
                && !setup
                && !protected
                && !p.terminal();
            let result = (|| {
                let mut score;
                if i == 0 {
                    score = -self.negamax(p, depth - 1, -beta, -alpha, ply + 1, path)?;
                } else {
                    score = -self.negamax(
                        p,
                        depth - 1 - if reduce { 1 } else { 0 },
                        -alpha - 1,
                        -alpha,
                        ply + 1,
                        path,
                    )?;
                    if reduce && score > alpha {
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
                Ok(s) => s,
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
                self.killers[ply].retain(|&b| b != a);
                self.killers[ply].insert(0, a);
                self.killers[ply].truncate(2);
                break;
            }
        }
        path.pop();
        let score = if best > WIN - 500 {
            best + ply as i32
        } else if best < -WIN + 500 {
            best - ply as i32
        } else {
            best
        };
        self.shared.store(
            key,
            Entry {
                depth,
                score,
                best: best_move,
                flag: if best <= original_alpha {
                    2
                } else if best >= original_beta {
                    1
                } else {
                    0
                },
                context: path.clone(),
            },
        );
        Ok(best)
    }
}
struct FixedMaze {
    outcome: Vec<i8>,
    distance: Vec<u16>,
    best: Vec<u16>,
}
impl FixedMaze {
    fn index(a: usize, b: usize, t: usize) -> usize {
        (a * 81 + b) * 2 + t
    }
    fn solve(p: &Position, deadline: f64, cancel: &AtomicBool) -> Result<Self, ()> {
        let size = 81 * 81 * 2;
        let mut outcome = vec![0i8; size];
        let mut distance = vec![0u16; size];
        let mut best = vec![u16::MAX; size];
        let mut degree = vec![0u8; size];
        let mut parents: Vec<Vec<(usize, u16)>> = vec![vec![]; size];
        let mut queue = vec![];
        let mut pos = p.clone();
        for a in 0..81 {
            if now() >= deadline || cancel.load(Ordering::Relaxed) {
                return Err(());
            }
            for b in 0..81 {
                if a == b {
                    continue;
                }
                for t in 0..2 {
                    let key = Self::index(a, b, t);
                    pos.p = [a, b];
                    pos.turn = t;
                    let winner = if goal(a, 0) {
                        Some(0)
                    } else if goal(b, 1) {
                        Some(1)
                    } else {
                        None
                    };
                    if let Some(w) = winner {
                        outcome[key] = if w == t { 1 } else { -1 };
                        queue.push(key);
                        continue;
                    }
                    for m in pos.moves(t) {
                        let child = if t == 0 {
                            Self::index(m as usize, b, 1)
                        } else {
                            Self::index(a, m as usize, 0)
                        };
                        parents[child].push((key, m));
                        degree[key] += 1;
                    }
                }
            }
        }
        let mut max_loss = vec![0u16; size];
        let mut head = 0;
        while head < queue.len() {
            if head & 255 == 0 && (now() >= deadline || cancel.load(Ordering::Relaxed)) {
                return Err(());
            }
            let child = queue[head];
            head += 1;
            for &(parent, m) in &parents[child] {
                if outcome[parent] != 0 {
                    continue;
                }
                if outcome[child] == -1 {
                    outcome[parent] = 1;
                    distance[parent] = distance[child] + 1;
                    best[parent] = m;
                    queue.push(parent);
                } else {
                    degree[parent] -= 1;
                    if distance[child] + 1 >= max_loss[parent] {
                        max_loss[parent] = distance[child] + 1;
                        best[parent] = m;
                    }
                    if degree[parent] == 0 {
                        outcome[parent] = -1;
                        distance[parent] = max_loss[parent];
                        queue.push(parent);
                    }
                }
            }
        }
        Ok(Self {
            outcome,
            distance,
            best,
        })
    }
    fn lookup(&self, p: &Position) -> (i8, u16, u16) {
        let k = Self::index(p.p[0], p.p[1], p.turn);
        let mut best = self.best[k];
        if self.outcome[k] == 0 {
            best = p
                .moves(p.turn)
                .into_iter()
                .find(|&m| {
                    let child = if p.turn == 0 {
                        Self::index(m as usize, p.p[1], 1)
                    } else {
                        Self::index(p.p[0], m as usize, 0)
                    };
                    self.outcome[child] == 0
                })
                .unwrap_or(u16::MAX);
        }
        (self.outcome[k], self.distance[k], best)
    }
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeOutput {
    #[serde(flatten)]
    pub result: Output,
    pub workers: usize,
    pub shared_cache_hits: u64,
    pub cancelled: bool,
    pub backend: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exact: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<i8>,
}
pub struct NativeEngine {
    shared: Arc<SharedSearch>,
    workers: Vec<Mutex<NativeSearcher>>,
    endgames: HashMap<u128, FixedMaze>,
}
impl Default for NativeEngine {
    fn default() -> Self {
        Self::with_profile(2)
    }
}
impl NativeEngine {
    pub fn with_profile(profile: u8) -> Self {
        let shared = Arc::new(SharedSearch {
            profile: profile.min(2),
            ..SharedSearch::default()
        });
        Self {
            workers: (0..4)
                .map(|_| Mutex::new(NativeSearcher::new(shared.clone())))
                .collect(),
            shared,
            endgames: HashMap::new(),
        }
    }
}
impl NativeEngine {
    fn pv(&self, p: &Position, depth: usize) -> Vec<Action> {
        let mut pos = p.clone();
        let mut out = vec![];
        let mut seen = vec![];
        for _ in 0..depth {
            let key = pos.key();
            if pos.terminal() || seen.contains(&key) {
                break;
            }
            seen.push(key);
            let Some(e) = self.shared.entry(&key) else {
                break;
            };
            if !pos.actions().contains(&e.best) {
                break;
            }
            out.push(decode(e.best));
            pos.make(e.best);
        }
        out
    }
    pub fn search(
        &mut self,
        s: &State,
        ms: f64,
        cores: usize,
        max_depth: usize,
        cancel: Arc<AtomicBool>,
        mut progress: impl FnMut(&NativeOutput),
    ) -> NativeOutput {
        let start = now();
        let deadline = start + ms.clamp(1., 30000.);
        let cores = cores.clamp(1, 4);
        let hits = self.shared.hits.load(Ordering::Relaxed);
        let mut out = NativeOutput {
            result: Output {
                pv: vec![],
                score: 0,
                depth: 0,
                nodes: 0,
                elapsed_ms: 0.,
                engine: format!(
                    "Atlas {} · Native Rust ×{}",
                    if self.shared.profile == 0 { "5" } else { "5.1" },
                    cores
                ),
                partitioned: false,
                error: None,
            },
            workers: cores,
            shared_cache_hits: 0,
            cancelled: false,
            backend: "native",
            exact: None,
            outcome: None,
        };
        let mut pos = match Position::from_state(s) {
            Ok(p) => p,
            Err(e) => {
                out.result.error = Some(e);
                return out;
            }
        };
        if s.winner.is_some() {
            return out;
        }
        if let Some(a) = pos
            .moves(pos.turn)
            .into_iter()
            .find(|&a| goal(a as usize, pos.turn))
        {
            out.result.pv = vec![decode(a)];
            out.result.score = WIN - 1;
            out.result.depth = 1;
            out.result.nodes = 1;
            out.result.elapsed_ms = now() - start;
            return out;
        }
        if pos.left == [0, 0] {
            if !self.endgames.contains_key(&pos.walls) {
                if let Ok(table) = FixedMaze::solve(&pos, deadline, &cancel) {
                    if self.endgames.len() >= 8 {
                        self.endgames.clear();
                    }
                    self.endgames.insert(pos.walls, table);
                }
            }
            if let Some(table) = self.endgames.get(&pos.walls) {
                let (value, distance, a) = table.lookup(&pos);
                if a != u16::MAX {
                    out.result.pv = vec![decode(a)];
                    out.result.score = value as i32 * (WIN - distance as i32);
                    out.result.nodes = 12960;
                    out.result.elapsed_ms = now() - start;
                    out.exact = Some(true);
                    out.outcome = Some(value);
                    return out;
                }
            }
        }
        for w in &self.workers[..cores] {
            w.lock().unwrap().prepare(deadline, cancel.clone());
        }
        let root_key = pos.key();
        let mut roots = {
            let worker = self.workers[0].lock().unwrap();
            worker
                .ordered(&mut pos, self.shared.entry(&root_key).map(|e| e.best), 0)
                .unwrap_or_else(|_| pos.actions())
        };
        if roots.is_empty() {
            return out;
        }
        out.result.pv = vec![decode(roots[0])];
        for depth in 1..=max_depth.clamp(1, 64) {
            if now() >= deadline || cancel.load(Ordering::Relaxed) {
                break;
            }
            let first = roots[0];
            let mut child = pos.clone();
            child.make(first);
            let first_result = self.workers[0].lock().unwrap().negamax(
                &mut child,
                depth as i32 - 1,
                -INF,
                INF,
                1,
                &mut vec![root_key],
            );
            let Ok(value) = first_result else {
                break;
            };
            let score = -value;
            let alpha = AtomicI32::new(score);
            let next = AtomicUsize::new(1);
            let completed = AtomicUsize::new(1);
            let best = Mutex::new((first, score));
            std::thread::scope(|scope| {
                for worker in &self.workers[..cores] {
                    let roots = &roots;
                    let alpha = &alpha;
                    let next = &next;
                    let completed = &completed;
                    let best = &best;
                    let pos = &pos;
                    scope.spawn(move || {
                        let mut searcher = worker.lock().unwrap();
                        loop {
                            if searcher.check().is_err() {
                                break;
                            }
                            let i = next.fetch_add(1, Ordering::Relaxed);
                            if i >= roots.len() {
                                break;
                            }
                            let a = roots[i];
                            let protected = searcher.shared.is_critical(pos, a);
                            let mut p = pos.clone();
                            p.make(a);
                            let base = alpha.load(Ordering::Acquire);
                            let reduced = depth >= 3
                                && i >= 8
                                && !(a >= 81 && p.connections(a) > 0)
                                && !protected
                                && !p.terminal();
                            let result = (|| {
                                let mut score = -searcher.negamax(
                                    &mut p,
                                    depth as i32 - 1 - if reduced { 1 } else { 0 },
                                    -base - 1,
                                    -base,
                                    1,
                                    &mut vec![root_key],
                                )?;
                                if reduced && score > base {
                                    score = -searcher.negamax(
                                        &mut p,
                                        depth as i32 - 1,
                                        -base - 1,
                                        -base,
                                        1,
                                        &mut vec![root_key],
                                    )?;
                                }
                                if score > base {
                                    score = -searcher.negamax(
                                        &mut p,
                                        depth as i32 - 1,
                                        -INF,
                                        -base,
                                        1,
                                        &mut vec![root_key],
                                    )?;
                                }
                                Ok::<i32, ()>(score)
                            })();
                            let Ok(score) = result else {
                                break;
                            };
                            {
                                let mut record = best.lock().unwrap();
                                if score > record.1 {
                                    *record = (a, score);
                                    alpha.fetch_max(score, Ordering::AcqRel);
                                }
                            }
                            completed.fetch_add(1, Ordering::Relaxed);
                        }
                    });
                }
            });
            if completed.load(Ordering::Relaxed) != roots.len() {
                break;
            }
            let (a, score) = *best.lock().unwrap();
            self.shared.store(
                root_key,
                Entry {
                    depth: depth as i32,
                    score,
                    flag: 0,
                    best: a,
                    context: vec![],
                },
            );
            out.result.pv = self.pv(&pos, depth);
            out.result.depth = depth;
            out.result.score = score;
            out.result.nodes = self.workers[..cores]
                .iter()
                .map(|w| w.lock().unwrap().nodes)
                .sum();
            out.result.elapsed_ms = now() - start;
            out.shared_cache_hits = self.shared.hits.load(Ordering::Relaxed) - hits;
            progress(&out);
            if score.abs() > WIN - 500 {
                break;
            }
            roots.retain(|&b| b != a);
            roots.insert(0, a);
        }
        out.result.nodes = self.workers[..cores]
            .iter()
            .map(|w| w.lock().unwrap().nodes)
            .sum();
        out.result.elapsed_ms = now() - start;
        out.shared_cache_hits = self.shared.hits.load(Ordering::Relaxed) - hits;
        out.cancelled = cancel.load(Ordering::Relaxed);
        out
    }
}
#[cfg(test)]
mod native_tests {
    use super::*;
    fn initial() -> State {
        serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap()
    }
    #[test]
    fn returns_legal_and_shared_work() {
        let s = initial();
        let mut engine = NativeEngine::default();
        let r = engine.search(&s, 200., 4, 3, Arc::new(AtomicBool::new(false)), |_| {});
        assert_eq!(r.result.depth, 3);
        assert!(r.shared_cache_hits > 0);
        let a = &r.result.pv[0];
        assert!(Position::from_state(&s)
            .unwrap()
            .actions()
            .contains(&((a.y * 9 + a.x) as u16)));
    }
    #[test]
    fn fixed_maze_retrograde_obeys_minimax() {
        let s = initial();
        let p = Position::from_state(&s).unwrap();
        let table = FixedMaze::solve(&p, now() + 10000., &AtomicBool::new(false)).unwrap();
        let mut pos = p.clone();
        for a in 9..81 {
            for b in 0..72 {
                if a == b {
                    continue;
                }
                for t in 0..2 {
                    pos.p = [a, b];
                    pos.turn = t;
                    let (v, _, m) = table.lookup(&pos);
                    let children: Vec<i8> = pos
                        .moves(t)
                        .iter()
                        .map(|&m| {
                            let mut n = pos.clone();
                            n.make(m);
                            table.lookup(&n).0
                        })
                        .collect();
                    assert!(pos.moves(t).contains(&m));
                    if v == 1 {
                        assert!(children.contains(&-1));
                    } else if v == -1 {
                        assert!(children.iter().all(|&v| v == 1));
                    } else {
                        assert!(!children.contains(&-1));
                        assert!(children.contains(&0));
                    }
                }
            }
        }
    }
    #[test]
    fn cancelled_search_does_not_corrupt_following_search() {
        let mut e = NativeEngine::default();
        let s = initial();
        let r = e.search(&s, 500., 4, 40, Arc::new(AtomicBool::new(true)), |_| {});
        assert!(r.cancelled);
        let r = e.search(&s, 200., 2, 3, Arc::new(AtomicBool::new(false)), |_| {});
        assert_eq!(r.result.depth, 3);
    }
    #[test]
    fn mirror_cache_actions_and_paths_round_trip() {
        let s = initial();
        let mut p = Position::from_state(&s).unwrap();
        p.make(81 + 2 * 8 + 1);
        let mirrored = mirror_position(&p);
        assert!(mirror_key(mirrored.key()) == p.key());
        let cache = SharedSearch::default();
        let mut a = cache.ranked(&mut p);
        let mut b: Vec<_> = cache
            .ranked(&mut mirrored.clone())
            .into_iter()
            .map(|(a, s)| (mirror_action(a), s))
            .collect();
        a.sort();
        b.sort();
        assert_eq!(a, b);
        assert_eq!(
            cache.evaluate(&mut p),
            cache.evaluate(&mut mirrored.clone())
        );
        for n in 0..209 {
            assert_eq!(mirror_action(mirror_action(n)), n);
        }
    }
}
