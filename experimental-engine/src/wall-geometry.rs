// Dual-grid segments in tile widths. Contacts include end-to-end and T joints;
// interior crossings and overlapping segments are not connections.
const fn touching(a:usize,b:usize)->bool {
    let av=a>=64;let bv=b>=64;let ax=(a%8) as i32;let ay=(a%64/8) as i32;let bx=(b%8) as i32;let by=(b%64/8) as i32;
    if av==bv {return if av {ax==bx&&(ay-by==2||by-ay==2)} else {ay==by&&(ax-bx==2||bx-ax==2)};}
    let (hx,hy,vx,vy)=if av {(bx,by,ax,ay)} else {(ax,ay,bx,by)};
    let x=vx+1;let y=hy+1;
    x>=hx&&x<=hx+2&&y>=vy&&y<=vy+2&&(x==hx||x==hx+2||y==vy||y==vy+2)
}
const fn contact_masks()->[u128;128] {
    let mut masks=[0u128;128];let mut a=0;
    while a<128 {let mut b=0;while b<128 {if touching(a,b) {masks[a]|=1u128<<b;}b+=1;}a+=1;}masks
}
const CONTACT_MASKS:[u128;128]=contact_masks();
#[derive(Clone,Copy)]
enum GeometryMode {Legacy,RankOnly,EvalOnly,RankEval,Physical}
#[derive(Clone,Copy)]
enum ConnectionScope {Ranking,Evaluation,Setup}
fn geometry_mode()->GeometryMode {
    static MODE:std::sync::OnceLock<GeometryMode>=std::sync::OnceLock::new();
    *MODE.get_or_init(||match std::env::var("QUORIDOR_MAZE_GEOMETRY").as_deref(){Ok("physical")=>GeometryMode::Physical,Ok("rank-only")=>GeometryMode::RankOnly,Ok("eval-only")=>GeometryMode::EvalOnly,Ok("rank-eval")=>GeometryMode::RankEval,Ok("legacy")|Err(_)=>GeometryMode::Legacy,Ok(other)=>panic!("Unknown geometry mode: {other}")})
}
fn physical_geometry()->bool {matches!(geometry_mode(),GeometryMode::Physical)}
fn physical_scope(mode:GeometryMode,scope:ConnectionScope)->bool {
    match scope {ConnectionScope::Ranking=>matches!(mode,GeometryMode::RankOnly|GeometryMode::RankEval|GeometryMode::Physical),ConnectionScope::Evaluation=>matches!(mode,GeometryMode::EvalOnly|GeometryMode::RankEval|GeometryMode::Physical),ConnectionScope::Setup=>matches!(mode,GeometryMode::Physical)}
}
impl Position {
    fn physical_connections(&self,a:u16)->i32 {(self.walls&CONTACT_MASKS[(a-81) as usize]).count_ones() as i32}
    fn scoped_connections(&self,a:u16,scope:ConnectionScope)->i32 {if physical_scope(geometry_mode(),scope){self.physical_connections(a)}else{self.legacy_connections(a)}}
    fn connections(&self,a:u16)->i32 {self.scoped_connections(a,ConnectionScope::Setup)}
    fn ordering_connections(&self,a:u16)->i32 {self.scoped_connections(a,ConnectionScope::Ranking)}
    fn evaluation_connections(&self,a:u16)->i32 {self.scoped_connections(a,ConnectionScope::Evaluation)}
}
pub fn geometry_snapshot()->serde_json::Value {
    let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
    let mut p=Position::from_state(&s).unwrap();let mut counts=vec![];let mut legacy=vec![];let mut ranking=vec![];let mut evaluation=vec![];
    for a in 81..209u16 {let mut row=vec![];let mut old=vec![];let mut rank=vec![];let mut eval=vec![];for b in 0..128 {p.walls=1u128<<b;row.push(p.connections(a));old.push(p.legacy_connections(a));rank.push(p.ordering_connections(a));eval.push(p.evaluation_connections(a));}counts.push(row);legacy.push(old);ranking.push(rank);evaluation.push(eval);}
    serde_json::json!({"physicalMode":physical_geometry(),"counts":counts,"legacy":legacy,"ranking":ranking,"evaluation":evaluation})
}
pub fn geometry_scores(states:&[State])->serde_json::Value {
    let cache=SharedSearch{profile:2,..SharedSearch::default()};let mut raw=vec![];let mut cached=vec![];
    for s in states {let mut p=Position::from_state(s).unwrap();raw.push(p.evaluate());cached.push(cache.score_mode(&mut p,MazeMode::Cache4));}
    serde_json::json!({"raw":raw,"cached":cached})
}
#[cfg(test)]
mod geometry_tests {
    use super::*;
    fn mirror(i:usize)->usize {(if i>=64 {64}else{0})+(i%64/8)*8+7-i%8}
    fn rotate(i:usize)->usize {(if i>=64 {0}else{64})+(i%8)*8+7-i%64/8}
    #[test]
    fn all_pairs_are_symmetric_and_invariant_under_reflection_and_rotation() {
        for a in 0..128 {assert!(!touching(a,a));for b in 0..128 {assert_eq!(touching(a,b),touching(b,a));assert_eq!(touching(a,b),touching(mirror(a),mirror(b)));assert_eq!(touching(a,b),touching(rotate(a),rotate(b)));}}
    }
    #[test]
    fn contact_gaps_crossings_and_t_joints_are_distinguished() {
        let h=|x:usize,y:usize|y*8+x;let v=|x:usize,y:usize|64+y*8+x;
        assert!(!touching(h(3,4),v(5,3)));assert!(!touching(h(4,4),v(2,3)));
        assert!(!touching(h(3,4),v(3,4))); // interior cross
        assert!(!touching(h(3,4),h(4,4))); // overlap
        assert!(touching(h(3,4),h(5,4))); // straight end-to-end
        assert!(touching(h(3,4),v(4,3))); // endpoint contact
        assert!(touching(h(3,4),v(3,3))); // T joint
    }
    #[test]
    fn rank_only_does_not_change_evaluation_or_depth_setup() {
        assert!(physical_scope(GeometryMode::RankOnly,ConnectionScope::Ranking));
        assert!(!physical_scope(GeometryMode::RankOnly,ConnectionScope::Evaluation));assert!(!physical_scope(GeometryMode::RankOnly,ConnectionScope::Setup));
        assert!(physical_scope(GeometryMode::RankEval,ConnectionScope::Ranking));assert!(physical_scope(GeometryMode::RankEval,ConnectionScope::Evaluation));assert!(!physical_scope(GeometryMode::RankEval,ConnectionScope::Setup));
        assert!(!physical_scope(GeometryMode::EvalOnly,ConnectionScope::Ranking));assert!(physical_scope(GeometryMode::EvalOnly,ConnectionScope::Evaluation));
    }
}
