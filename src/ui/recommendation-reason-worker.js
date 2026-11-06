import {recommendationReason} from './recommendation-reason.js';
self.onmessage=({data})=>{
 try{self.postMessage({id:data.id,reason:recommendationReason(data.state,data.action,{review:true})});}
 catch{self.postMessage({id:data.id,reason:null});}
};
