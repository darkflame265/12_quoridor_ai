import {preferredLanguage,languageKey,translateText} from './translate.js';

// Translate presentation nodes only; recognition and engine state remain intact.
export function mountLocalization(){
 let storage;try{storage=localStorage;}catch{}
 let language=preferredLanguage(storage,navigator.language),texts=new WeakMap(),attributes=new WeakMap();
 const text=node=>{
  if(!node.parentElement||node.parentElement.closest('script,style,[data-no-translate]'))return;
  const prior=texts.get(node),raw=prior&&node.data===prior.rendered?prior.raw:node.data;
  const rendered=translateText(raw,language);texts.set(node,{raw,rendered});if(node.data!==rendered)node.data=rendered;
 };
 const attrs=element=>{
  if(element.closest('[data-no-translate]'))return;
  let saved=attributes.get(element);if(!saved){saved={};attributes.set(element,saved);}
  for(const name of ['aria-label','title','placeholder','aria-valuetext']){
   const current=element.getAttribute(name);if(current===null)continue;
   const prior=saved[name],raw=prior&&current===prior.rendered?prior.raw:current,rendered=translateText(raw,language);
   saved[name]={raw,rendered};if(current!==rendered)element.setAttribute(name,rendered);
  }
 };
 const tree=node=>{
  if(node.nodeType===Node.TEXT_NODE){text(node);return;}if(node.nodeType!==Node.ELEMENT_NODE)return;
  attrs(node);const walker=document.createTreeWalker(node,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  while(walker.nextNode())walker.currentNode.nodeType===Node.TEXT_NODE?text(walker.currentNode):attrs(walker.currentNode);
 };
 const update=()=>{
  document.documentElement.lang=language;
  for(const button of document.querySelectorAll('[data-language]')){const selected=button.dataset.language===language;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-selected',selected);}
  tree(document.body);
 };
 document.querySelector('#language-switch').addEventListener('click',e=>{const button=e.target.closest('[data-language]');if(!button)return;language=button.dataset.language;try{storage?.setItem(languageKey,language);}catch{}update();});
 update();
 const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='childList')for(const n of r.addedNodes)tree(n);else if(r.type==='characterData')text(r.target);else attrs(r.target);}});
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','aria-valuetext']});
 return {get language(){return language;},translate:value=>translateText(value,language)};
}
