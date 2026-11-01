export const supportedEngines=['sigma','atlas-goal','atlas5'];
export function normalizeSessionSettings(data,{startup=false}={}){
 const migrate=startup&&data.settingsRevision!==1;
 const engine=supportedEngines.includes(data.engine)?data.engine:'sigma';
 return {...data,settingsRevision:1,
  unsupportedEngine:data.engine&&!supportedEngines.includes(data.engine)?data.engine:null,
  engine:startup?'sigma':engine,
  time:migrate?'variable':data.time??'variable',mode:migrate?'screen':data.mode??'screen',
  watch:{...data.watch,players:[0,1].map(t=>{
   const player=data.watch?.players?.[t]??{};
   return {...player,engine:migrate?(t===0?'atlas-goal':'atlas5'):supportedEngines.includes(player.engine)?player.engine:'atlas-goal',ms:player.ms??500,cores:player.cores??4};
  })}
 };
}
