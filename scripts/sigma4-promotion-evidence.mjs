/** Research quality checks: deliberately separate wins from evidence strength. */
export function wilson95(wins,n){
 if(!(n>0)||wins<0||wins>n)throw Error('invalid match counts');
 const z=1.96,p=wins/n,den=1+z*z/n;
 const center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 return [Math.max(0,center-half),Math.min(1,center+half)];
}
export function checkSigma4Promotion({games,wins,uniqueGames,uniqueFirstSix,seedPairs,cutoffs=0,modelsFrozen=false,pairedRoles=false}){
 const [lower,upper]=wilson95(wins,games);
 const requirements={
  manyPairedSeeds:seedPairs>=40,
  completeBalancedPairing:pairedRoles,
  enoughUniqueGames:uniqueGames>=Math.ceil(.8*games),
  enoughOpeningDiversity:uniqueFirstSix>=8,
  enoughGames:games>=80,
  noCutoffs:cutoffs===0,
  statisticallyAboveHalf:lower>.5,
  frozenModels:modelsFrozen
 };
 return {eligible:Object.values(requirements).every(Boolean),requirements,
  wins,games,winRate:wins/games,wilson95:[lower,upper],
  blockingReasons:Object.entries(requirements).filter(([,pass])=>!pass).map(([name])=>name)};
}
