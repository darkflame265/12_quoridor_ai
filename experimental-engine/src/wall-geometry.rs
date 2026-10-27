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
fn physical_geometry()->bool {
    static MODE:std::sync::OnceLock<bool>=std::sync::OnceLock::new();
    *MODE.get_or_init(||match std::env::var("QUORIDOR_MAZE_GEOMETRY").as_deref(){Ok("physical")=>true,Ok("legacy")|Err(_)=>false,Ok(other)=>panic!("Unknown geometry mode: {other}")})
}
impl Position {
    fn physical_connections(&self,a:u16)->i32 {(self.walls&CONTACT_MASKS[(a-81) as usize]).count_ones() as i32}
    fn connections(&self,a:u16)->i32 {if physical_geometry(){self.physical_connections(a)}else{self.legacy_connections(a)}}
}
pub fn geometry_snapshot()->serde_json::Value {
    let s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
    let mut p=Position::from_state(&s).unwrap();let mut counts=vec![];let mut legacy=vec![];
    for a in 81..209u16 {let mut row=vec![];let mut old=vec![];for b in 0..128 {p.walls=1u128<<b;row.push(p.connections(a));old.push(p.legacy_connections(a));}counts.push(row);legacy.push(old);}
    serde_json::json!({"physicalMode":physical_geometry(),"counts":counts,"legacy":legacy})
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
}
