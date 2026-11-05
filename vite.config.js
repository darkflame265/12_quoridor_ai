const proxies=Object.fromEntries([['sigma2',4322],['sigma3',4323],['sigma4',4324]].map(([name,port])=>['/api/'+name,{target:'http://127.0.0.1:'+port,changeOrigin:true,rewrite:path=>path.replace('/api/'+name,'')}]));
export default {worker:{format:'es'},server:{host:'127.0.0.1',proxy:proxies},preview:{proxy:proxies}};
