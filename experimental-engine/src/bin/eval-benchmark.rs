use std::io::{self,Read};
fn main(){
    let mut data=String::new();io::stdin().read_to_string(&mut data).unwrap();
    let states:Vec<quoridor_native::State>=serde_json::from_str(&data).unwrap();
    println!("{}",quoridor_native::evaluation_benchmark(&states,50));
}
