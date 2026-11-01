use quoridor_atlas6::{Atlas6,State};
use serde_json::{json,Value};
use std::collections::HashMap;
use std::io::{self,BufRead,Write};
use std::sync::{mpsc,Arc,Mutex,atomic::{AtomicBool,Ordering}};
use std::thread;

fn main(){
 let (tx,rx)=mpsc::channel::<Value>();
 let output=thread::spawn(move||{
  let stdout=io::stdout();
  let mut locked=stdout.lock();
  for value in rx {
   if writeln!(locked,"{}",value).is_err(){break;}
   if locked.flush().is_err(){break;}
  }
 });
 let engine=Arc::new(Mutex::new(Atlas6::new()));
 let active=Arc::new(Mutex::new(HashMap::<String,Arc<AtomicBool>>::new()));
 let stdin=io::stdin();
 for line in stdin.lock().lines().flatten(){
  let Ok(v)=serde_json::from_str::<Value>(&line)else{continue};
  let id=v["id"].clone();
  let key=id.as_str().unwrap_or("").to_owned();
  match v["op"].as_str().unwrap_or("search"){
   "health"=>{
    let _=tx.send(json!({"id":id,"done":true,"service":"quoridor-native-v1","engine":"Atlas 6","maxCores":4}));
   },
   "cancel"=>{
    if let Some(flag)=active.lock().unwrap().remove(&key){
     flag.store(true,Ordering::Relaxed);
    }
    let _=tx.send(json!({"id":id,"done":true,"cancelled":true}));
   },
   "search"=>{
    let Ok(state)=serde_json::from_value::<State>(v["state"].clone())else{
     let _=tx.send(json!({"id":id,"done":true,"error":"Invalid state"}));
     continue;
    };
    let ms=v["ms"].as_f64().unwrap_or(500.);
    let cores=v["cores"].as_u64().unwrap_or(1) as usize;
    let flag=Arc::new(AtomicBool::new(false));
    {
     let mut pending=active.lock().unwrap();
     if pending.contains_key(&key){
      let _=tx.send(json!({"id":id,"done":true,"error":"Duplicate request id"}));
      continue;
     }
     pending.insert(key.clone(),flag.clone());
    }
    let engine=engine.clone();
    let active=active.clone();
    let tx=tx.clone();
    thread::spawn(move||{
     let result=engine.lock().unwrap().search(&state,ms,cores,flag.clone());
     {
      let mut pending=active.lock().unwrap();
      if pending.get(&key).map(|entry|Arc::ptr_eq(entry,&flag)).unwrap_or(false){
       pending.remove(&key);
      }
     }
     if flag.load(Ordering::Relaxed){return;}
     let value=match result{
      Ok(r)=>{
       let mut out=serde_json::to_value(r).unwrap();
       out["id"]=id;
       out
      },
      Err(e)=>json!({"id":id,"done":true,"error":e}),
     };
     let _=tx.send(value);
    });
   },
   _=>{
    let _=tx.send(json!({"id":id,"done":true,"error":"Unknown operation"}));
   }
  }
 }
 for (_,flag) in active.lock().unwrap().drain(){flag.store(true,Ordering::Relaxed);}
 drop(tx);
 let _=output.join();
}
