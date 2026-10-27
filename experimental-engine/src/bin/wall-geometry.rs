use std::io::{self,Read};
fn main(){
    if std::env::args().any(|a|a=="--scores") {let mut input=String::new();io::stdin().read_to_string(&mut input).unwrap();let states:Vec<quoridor_native::State>=serde_json::from_str(&input).unwrap();println!("{}",quoridor_native::geometry_scores(&states));}
    else {println!("{}",quoridor_native::geometry_snapshot());}
}
