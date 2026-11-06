const modes=['ai','sandbox','watch','screen'];

// Radio semantics with spatial arrow navigation; the hidden field preserves
// the existing session format while the cards are the only visible control.
export function mountModePicker(input,group){
 const buttons=[...group.querySelectorAll('[data-mode]')];
 const sync=()=>{
  if(!modes.includes(input.value))input.value='screen';
  for(const button of buttons){const selected=button.dataset.mode===input.value;button.setAttribute('aria-checked',String(selected));button.tabIndex=selected?0:-1;button.classList.toggle('is-selected',selected);}
 };
 const choose=(mode,focus=false)=>{
  if(input.value!==mode){input.value=mode;input.dispatchEvent(new Event('change',{bubbles:true}));}
  sync();if(focus)buttons.find(button=>button.dataset.mode===mode)?.focus();
 };
 for(const button of buttons)button.addEventListener('click',()=>choose(button.dataset.mode));
 group.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-mode]');if(!button)return;
  const index=modes.indexOf(button.dataset.mode),offset={ArrowRight:1,ArrowLeft:-1,ArrowDown:2,ArrowUp:-2}[event.key];
  let target;if(offset!==undefined)target=(index+offset+4)%4;else if(event.key==='Home')target=0;else if(event.key==='End')target=3;else return;
  event.preventDefault();choose(modes[target],true);
 });
 input.addEventListener('change',sync);sync();return sync;
}
