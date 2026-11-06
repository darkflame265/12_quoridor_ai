import messages from './messages.json' with {type:'json'};

export const languageKey='quoridor-language';
export function preferredLanguage(storage,language='en'){
 try{const saved=storage?.getItem(languageKey);if(saved==='ko'||saved==='en')return saved;}catch{}
 return /^ko(?:-|$)/i.test(language)?'ko':'en';
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pairs=[...messages,
 ['{0} · 목표까지 {1}칸','{0} · {1} steps to goal'],
 ['남은 벽 {0}개 / 10개','{0} of 10 walls remaining'],
 ['{0}수 직후 · 과거 기보','After ply {0} · history'],
 ['{0}수 {1} {2}','Ply {0}: {1} {2}'],
 ['당시 추천: {0}','Recommendation at the time: {0}'],
 ['언어 선택','Choose language'],['한국어로 전환','Switch to Korean'],['영어로 전환','Switch to English'],
 ['이동 점','move dots'],['합법 이동 전체 일치','all legal moves match']
];
function compile(from,to){
 const ids=[],tokens=from.trim().split(/(\{\d+\})/),weight=from.replace(/\{\d+\}/g,'').length;
 let numeric=false;
 const source=tokens.map((x,i)=>{const m=x.match(/^\{(\d+)\}$/);if(!m)return escape(x);ids.push(Number(m[1]));
  const number=/^\s*(?:초|칸|수|개|곳|열|행|회|번째|s\b|plies\b|steps\b|simulations\b|nodes\b|walls?\b)/.test(tokens[i+1]??'');
  numeric||=number;return number?'([\\d.,+-]+)':'(.*?)';
 }).join('');
 return {regex:new RegExp('^'+source+'$'),ids,to:to.trim(),weight,numeric};
}
function pack(reverse=false){
 const values=pairs.map(([a,b])=>reverse?[b,a]:[a,b]);
 return {exact:new Map(values.filter(([x])=>!x.includes('{')).map(([a,b])=>[a.trim(),b.trim()])),
  patterns:values.filter(([x])=>x.includes('{')).map(([a,b])=>compile(a,b)).filter(p=>!reverse||p.weight>=8||p.numeric).sort((a,b)=>b.weight-a.weight),
  phrases:values.filter(([a])=>!a.includes('{')&&a.trim().length>=2).sort((a,b)=>b[0].length-a[0].length)};
}
const en=pack(),ko=pack(true);
export function translateText(value,language='en',depth=0){
 const raw=String(value??'');if(depth>7||!raw.trim())return raw;
 if(language==='en'&&!/[가-힣]/.test(raw)||language==='ko'&&/[가-힣]/.test(raw))return raw;
 const table=language==='ko'?ko:en,text=raw.trim(),leading=raw.slice(0,raw.indexOf(text)),trailing=raw.slice(raw.indexOf(text)+text.length);
 const done=result=>leading+result+trailing;
 if(table.exact.has(text))return done(table.exact.get(text));
 for(const p of table.patterns){const match=text.match(p.regex);if(!match)continue;
  const args={};p.ids.forEach((id,i)=>{args[id]=translateText(match[i+1],language,depth+1);});
  return done(p.to.replace(/\{(\d+)\}/g,(_,id)=>args[id]??''));
 }
 const segments=text.split(/(?<=[.!?])\s+|\s+·\s+/);
 if(segments.length>1){let result=text;for(const s of segments){const translated=translateText(s,language,depth+1);if(s!==translated)result=result.replace(s,translated);}return done(result);}
 if(language==='en'){
  let result=text;for(const [from,to] of table.phrases){const phrase=from.trim();if(result.includes(phrase))result=result.split(phrase).join(to.trim());}
  return done(result);
 }
 return raw;
}
