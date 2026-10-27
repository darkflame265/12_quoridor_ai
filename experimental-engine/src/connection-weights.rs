#[derive(Clone,Copy,Debug,PartialEq)]
struct ConnectionWeights {order:i32,threat:i32}
fn parse_weight(value:Option<String>,default:i32,maximum:i32)->Result<i32,String> {
    let parsed=match value {None=>default,Some(v)=>v.parse::<i32>().map_err(|_|"Connection weight must be an integer".to_string())?};
    if !(0..=maximum).contains(&parsed) {return Err("Connection weight is out of range".to_string());}Ok(parsed)
}
fn connection_weights()->ConnectionWeights {
    static WEIGHTS:std::sync::OnceLock<ConnectionWeights>=std::sync::OnceLock::new();
    *WEIGHTS.get_or_init(||ConnectionWeights {
        order:parse_weight(std::env::var("QUORIDOR_MAZE_ORDER_WEIGHT").ok(),180,720).expect("Invalid order weight"),
        threat:parse_weight(std::env::var("QUORIDOR_MAZE_THREAT_WEIGHT").ok(),30,120).expect("Invalid threat weight"),
    })
}
fn connection_order_weight()->i32 {connection_weights().order}
fn connection_threat_weight()->f64 {connection_weights().threat as f64}
pub fn weight_snapshot(states:&[State])->serde_json::Value {
    let mut result=geometry_scores(states);let cache=SharedSearch{profile:2,..SharedSearch::default()};let mut rankings=vec![];
    for s in states {let mut p=Position::from_state(s).unwrap();let mut row=cache.ranked(&mut p);row.sort_by_key(|r|r.0);rankings.push(row);}
    let weights=connection_weights();result["weights"]=serde_json::json!({"order":weights.order,"threat":weights.threat});result["rankings"]=serde_json::json!(rankings);result
}
#[cfg(test)]
mod weight_tests {
    use super::*;
    #[test]
    fn defaults_ranges_and_invalid_weights_are_explicit() {
        assert_eq!(parse_weight(None,180,720).unwrap(),180);assert_eq!(parse_weight(None,30,120).unwrap(),30);
        assert_eq!(parse_weight(Some("0".into()),180,720).unwrap(),0);
        for v in ["-1","721","NaN","1.5",""] {assert!(parse_weight(Some(v.into()),180,720).is_err());}
        assert!(parse_weight(Some("121".into()),30,120).is_err());
    }
}
