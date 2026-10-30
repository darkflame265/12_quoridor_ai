#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct RaceAssessment{
 pawn_only_outcome:i8,pawn_only_plies:u16,own_walls:usize,opponent_walls:usize,
 wall_probe_complete:bool,max_enemy_delay:i32,root_penalty:i32,full_game_proof:bool,
}
fn inspect_race(p:&Position,value:i8,plies:u16,deadline:f64,cancel:&AtomicBool)->RaceAssessment{
 let t=p.turn;let o=1-t;let mut out=RaceAssessment{pawn_only_outcome:value,pawn_only_plies:plies,own_walls:p.left[t],opponent_walls:p.left[o],wall_probe_complete:false,max_enemy_delay:0,root_penalty:0,full_game_proof:false};
 if value!=-1||p.left[t]!=1||p.left[o]!=0{return out;}
 let until=(now()+12.).min(now()+(deadline-now()).max(0.)*0.04);
 let base=p.distance(o,false);
 for a in 81..209{
  if cancel.load(Ordering::Relaxed)||now()>=until{return out;}
  if !p.fits(a){continue;}
  let mut child=p.clone();child.make(a);let own=child.distance(t,false);let enemy=child.distance(o,false);
  if own<100&&enemy<100{out.max_enemy_delay=out.max_enemy_delay.max(enemy-base);}
 }
 out.wall_probe_complete=true;
 // A finite evaluation correction only: walls may matter at future pawn
 // positions. Do not mark the full game lost or override proven mate scores.
 if out.max_enemy_delay==0{out.root_penalty=120;}
 out
}
fn race_biases(mut base:[i32;209],race:Option<&RaceAssessment>)->[i32;209]{
 if let Some(race)=race{if race.root_penalty>0{for value in &mut base{*value-=race.root_penalty;}}}base
}
