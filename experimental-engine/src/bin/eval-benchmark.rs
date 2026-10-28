use std::io::{self,Read};
fn main(){
    let mut data=String::new();io::stdin().read_to_string(&mut data).unwrap();
    let states:Vec<quoridor_native::State>=serde_json::from_str(&data).unwrap();
    if std::env::args().any(|a|a=="--forcing") {println!("{}",quoridor_native::forcing_review(&states));}
    else if std::env::args().any(|a|a=="--ranking") {println!("{}",quoridor_native::ranking_benchmark(&states,7));}
    else {println!("{}",quoridor_native::evaluation_benchmark(&states,50));}
}
