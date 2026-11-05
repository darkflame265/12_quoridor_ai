export const supportedEngines=['sigma2','sigma3','sigma4'];
export function normalizeSessionSettings(data,{startup=false}={}){
 const migrate=startup&&data.settingsRevision!==1;
 const engine=supportedEngines.includes(data.engine)?data.engine:'sigma4';
 return {...data,settingsRevision:1,
  unsupportedEngine:data.engine&&!supportedEngines.includes(data.engine)?data.engine:null,
  engine:startup?'sigma4':engine,
  time:migrate?'variable':data.time??'variable',mode:migrate?'screen':data.mode??'screen',
  watch:{...data.watch,players:[0,1].map(t=>{
   const player=data.watch?.players?.[t]??{};
   return {...player,engine:supportedEngines.includes(player.engine)?player.engine:(t===0?'sigma2':'sigma4'),ms:player.ms??500,cores:player.cores??4};
  })}
 };
}
