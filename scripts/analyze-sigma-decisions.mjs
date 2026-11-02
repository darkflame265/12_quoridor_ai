import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {apply,distance,legal,moves,validWall} from '../src/engine.js';
const source=process.argv[2]??'reports/sigma-selfplay/sigma2-valueguard20.json';
const target=process.argv[3]??'evaluation/sigma2-decision-review.json';
const games=JSON.parse(readFileSync(source,'utf8')).completed;
const legalActions=s=>{const out=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const w={type:'wall',x,y,o};if(validWall(s,w))out.push(w);}return out;};
const key=a=>JSON.stringify(a);
const measure=(s,side)=>distance(s,side)-distance(s,1-side);
const worstReply=(state,side)=>{if(state.winner!==null)return {score:state.winner===side?-10000:10000,reply:null};let worst={score:-Infinity,reply:null};for(const reply of legalActions(state)){const next=apply(state,reply);const score=next.winner===side?-10000:next.winner===1-side?10000:measure(next,side);if(score>worst.score)worst={score,reply};}return worst;};
const rows=[];
for(const game of games){
 for(const turn of game.trace){
  const side=turn.side,winBySigma2=game.winnerVariant==='sigma2';
  const sigma2Turn=game.index%2===side;
  if(!sigma2Turn)continue;
  const s=turn.state,actual=turn.action,after=apply(s,actual),beforeAdv=distance(s,1-side)-distance(s,side);
  const ownGain=distance(s,side)-distance(after,side);
  const oppGain=distance(s,1-side)-distance(after,1-side);
  const initial=turn.diagnostics?.topCandidates??[];
  const candidates=[actual,...initial.map(x=>x.action)].filter((a,i,list)=>list.findIndex(v=>key(v)===key(a))===i&&legal(s,a));
  const assessed=candidates.map(action=>{const n=apply(s,action),r=worstReply(n,side);return {action,visitCount:initial.find(c=>key(c.action)===key(action))?.visits??null,score:r.score,reply:r.reply,ownDistance:distance(n,side),opponentDistance:distance(n,1-side)};}).sort((a,b)=>a.score-b.score);
  const used=assessed.find(x=>key(x.action)===key(actual));
  const alternative=assessed.find(x=>key(x.action)!==key(actual));
  const delta=used&&alternative?used.score-alternative.score:null;
  const danger=after.winner===1-side||ownGain<0||oppGain>0||delta!==null&&delta>=2;
  if(!danger)continue;
  rows.push({game:game.index,ply:turn.ply+1,sigma2Won:winBySigma2,gameWinner:game.winnerVariant,side,action:actual,preRaceAdvantage:beforeAdv,ownGain,opponentGain:oppGain,actual:used,bestAlternative:alternative,regretProxy:delta,opponentDirectWin:after.winner===1-side,scope:'one opponent legal reply with wall-aware path metric; NOT a forced tactical proof'});
 }
}
rows.sort((a,b)=>Number(b.gameWinner==='sigma1')-Number(a.gameWinner==='sigma1')||(b.regretProxy??-1)-(a.regretProxy??-1));
const summary={source,games:games.length,reviewedSigma2Turns:games.flatMap(g=>g.trace.filter(t=>g.index%2===t.side)).length,flagged:rows.length,losingGameFlags:rows.filter(r=>r.gameWinner==='sigma1').length,highestPriority:rows.slice(0,20)};
mkdirSync(dirname(target),{recursive:true});
writeFileSync(target,JSON.stringify({summary:{...summary,highestPriority:undefined},rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));

