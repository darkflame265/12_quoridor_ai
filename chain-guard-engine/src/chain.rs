// Three connected walls form a six-cell barrier. Check the original node,
// before making a response; no fixture IDs, colors or stock thresholds.
fn long_barrier(p:&Position)->bool {
 for y in 0..8 {for x in 0..4 {
  let k=y*8+x;let mask=(1u128<<k)|(1u128<<(k+2))|(1u128<<(k+4));
  if p.walls&mask==mask{return true;}
 }}
 for x in 0..8 {for y in 0..4 {
  let k=64+y*8+x;let mask=(1u128<<k)|(1u128<<(k+16))|(1u128<<(k+32));
  if p.walls&mask==mask{return true;}
 }}false
}
#[cfg(test)] mod chain_tests {
 use super::*;
 #[test] fn recognizes_horizontal_and_vertical_barriers_only_when_connected(){
  let mut s:State=serde_json::from_str(r#"{"p":[{"x":4,"y":8},{"x":4,"y":0}],"walls":[],"left":[10,10],"turn":0,"winner":null}"#).unwrap();
  assert!(!long_barrier(&Position::from_state(&s).unwrap()));
  for x in [0,2,4]{s.walls.push(Wall{x,y:3,o:"h".into()});}
  assert!(long_barrier(&Position::from_state(&s).unwrap()));s.walls.pop();assert!(!long_barrier(&Position::from_state(&s).unwrap()));
  s.walls.clear();for y in [1,3,5]{s.walls.push(Wall{x:5,y,o:"v".into()});}
  assert!(long_barrier(&Position::from_state(&s).unwrap()));
 }
}
