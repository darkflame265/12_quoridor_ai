export const supportedEngines=['sigma2','sigma3','sigma4'];
export function normalizeSessionSettings(data,{startup=false}={}){
 const migrate=startup&&data.settingsRevision!==1;
 const engine=supportedEngines.includes(data.engine)?data.engine:'sigma4';
 const time=!migrate&&['500','variable'].includes(String(data.time))?String(data.time):'variable';
 return {...data,settingsRevision:1,
  unsupportedEngine:data.engine&&!supportedEngines.includes(data.engine)?data.engine:null,
  engine,aiAutoHint:data.aiAutoHint===true,screenAutoHint:typeof data.screenAutoHint==='boolean'?data.screenAutoHint:true,
  opponent:{engine:supportedEngines.includes(data.opponent?.engine)?data.opponent.engine:engine,time:['500','variable'].includes(String(data.opponent?.time))?String(data.opponent.time):time},
  time,mode:migrate?'screen':data.mode??'screen',cores:1,
  watch:{...data.watch,players:[0,1].map(t=>{
   const player=data.watch?.players?.[t]??{};
   return {...player,engine:supportedEngines.includes(player.engine)?player.engine:(t===0?'sigma2':'sigma4'),ms:[500,2000].includes(Number(player.ms))?Number(player.ms):500,cores:1};
  })}
 };
}
