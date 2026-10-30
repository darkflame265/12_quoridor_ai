import assert from 'node:assert/strict';
import {createPressureService} from '../server/pressure-service.mjs';
import {NativeClient} from '../src/native-client.js';
import {ScreenPonder} from '../src/screen-ponder.js';
import {initial,apply,legal} from '../src/engine.js';
const service=createPressureService({goal:true});let client,ponder,job;
try{
 await service.client.health();
 await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${service.server.address().port}`;
 client=new NativeClient({base:'/api/goal',expectedPressureBuild:service.engineInfo.build,fetcher:(url,options)=>fetch(base+url.replace('/api/goal',''),options)});
 assert.ok(await client.probe());
 const states=[];
 const engine={native:client,search(s,o){states.push(s);return client.search(s,o);},cancel(){client.cancel();}};
 ponder=new ScreenPonder();
 const source=apply(initial(),{type:'move',x:4,y:7}),options={wallStreak:0,defenseReply:null};
 job=ponder.start(engine,source,{valid:()=>true,prepare:s=>({state:s,options})});
 let cached;
 for(let i=0;i<100;i++){
  await new Promise(r=>setTimeout(r,50));
  cached=states.slice(1).map(s=>({state:s,result:ponder.take(engine,s,options)})).find(e=>e.result?.depth>=3);
  if(cached)break;
 }
 assert.ok(cached,'native completed iterations should become reusable');
 ponder.stop();await job;
 const hit=ponder.take(engine,cached.state,options);
 assert.ok(hit&&legal(cached.state,hit.pv[0]));
 console.log(JSON.stringify({nativePonderReusable:true,completedDepth:hit.depth,build:service.engineInfo.build,backgroundCores:1}));
}finally{ponder?.stop({clear:true});client?.dispose();await job;await service.close();}
