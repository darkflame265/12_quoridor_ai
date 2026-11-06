export function preferCompletedSearch(fresh,pondered){
 if(!pondered?.pv?.length||!fresh?.pv?.length)return fresh;
 if(pondered.exact&&!fresh.exact)return {...pondered,done:true,ponderReused:true};
 if(!fresh.exact&&(pondered.depth??-1)>(fresh.depth??-1))return {...pondered,done:true,ponderReused:true};
 return fresh;
}
