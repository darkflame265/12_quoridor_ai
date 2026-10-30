// Per-probe cache: geometry is independent of pawn positions, turn and stock.
struct ChainProbe{
 maps:HashMap<u128,[[i16;81];2]>,hits:usize,builds:usize,wide_attacks:bool,wide_defenses:bool,cache_enabled:bool,
}
impl ChainProbe{
 fn new(wide:bool)->Self{Self{maps:HashMap::new(),hits:0,builds:0,wide_attacks:wide,wide_defenses:wide,cache_enabled:true}}
 fn geometry(&mut self,p:&Position)->[[i16;81];2]{self.geometry_key(p,p.walls)}
 fn geometry_key(&mut self,p:&Position,key:u128)->[[i16;81];2]{
  if self.cache_enabled{if let Some(maps)=self.maps.get(&key){self.hits+=1;return *maps;}}
  let maps=[p.goal_map(0),p.goal_map(1)];self.builds+=1;
  if self.maps.len()>=512{self.maps.clear();}
  if self.cache_enabled{self.maps.insert(key,maps);}maps
 }
 fn distances(&mut self,p:&Position,target:usize)->[i32;2]{
  let maps=self.geometry(p);Self::lookup(p,target,&maps)
 }
 fn with_wall(&mut self,p:&Position,target:usize,a:u16)->[i32;2]{
  // toggle() edits edges only; make() also updates the persistent wall mask.
  // Temporary probes must include their extra wall in the cache key.
  let maps=self.geometry_key(p,p.walls|(1u128<<(a-81)));Self::lookup(p,target,&maps)
 }
 fn lookup(p:&Position,target:usize,maps:&[[i16;81];2])->[i32;2]{
  [target,1-target].map(|t|{let d=maps[t][p.p[t]];if d<0{100}else{d as i32}})
 }
}
// Cutting an equal shortest-path branch can prepare a second wall even when
// the first wall alone does not change the pawn's distance.
fn cuts_shortest_branch(p:&Position,a:u16,reach:&[i16;81],goal_map:&[i16;81],distance:i16)->bool{
 let k=(a-81)as usize;let x=k%8;let y=(k%64)/8;
 let (n,delta,offset)=if k>=64{(y*9+x,1,9)}else{(y*9+x,9,1)};
 [n,n+offset].into_iter().any(|n|{let q=n+delta;
  !blocked_edge(p,n,q)&&[(n,q),(q,n)].into_iter().any(|(u,v)|reach[u]>=0&&goal_map[u]>=0&&reach[u]+goal_map[u]==distance&&goal_map[v]==goal_map[u]-1)
 })
}
fn blocked_edge(p:&Position,n:usize,q:usize)->bool{!p.edges[n].iter().any(|&v|v==q as i16)}
