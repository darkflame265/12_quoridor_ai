use quoridor_atlas6::{Atlas6,State};
use serde_json::{json,Value};
use std::io::{self,BufRead};
use std::sync::{Arc,atomic::AtomicBool};
fn main(){
 let stdin=io::stdin();let mut engine=Atlas6::new();
 for line in stdin.lock().lines().flatten(){
  let Ok(v)=serde_json::from_str::<Value>(&line)else{continue};
  let id=v["id"].clone();let result=match v["op"].as_str().unwrap_or("search"){
   "health"=>json!({"id":id,"done":true,"service":"quoridor-native-v1","engine":"Atlas 6","maxCores":4}),
   "cancel"=>json!({"id":id,"done":true,"cancelled":true}),
   _=>match serde_json::from_value::<State>(v["state"].clone()){
    Ok(s)=>match engine.search(&s,v["ms"].as_f64().unwrap_or(500.),v["cores"].as_u64().unwrap_or(1) as usize,Arc::new(AtomicBool::new(false))){
     Ok(r)=>{let mut out=serde_json::to_value(r).unwrap();out["id"]=id;out},
     Err(e)=>json!({"id":id,"done":true,"error":e})},
    Err(e)=>json!({"id":id,"done":true,"error":e.to_string()})
   }};
  println!("{}",result);
 }
}
