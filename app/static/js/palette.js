import {el} from './ui.js';

const commands=[
  ['Home','#/home'],['Detect a domain','#/app/detect'],['Batch scan','#/app/batch'],
  ['3D projection','#/app/explorer'],['DGA lab','#/app/lab'],['Unseen-family experiment','#/app/experiments'],
  ['Mutation lab','#/app/mutation'],['Attack vs defense','#/app/simulation'],
  ['Evasion loop (attacker vs defender)','#/app/evasion'],['Human vs AI game','#/app/game'],['Results','#/app/results'],
  ['Documentation','#/docs'],['Status','#/status'],['About, privacy & limitations','#/about'],
  ['Example: legitimate-looking domain','#/app/detect?d=github.com'],
  ['Example: random-looking DGA','#/app/detect?d=qzv8xk2m1p9r.com'],
  ['Example: dictionary-style domain','#/app/detect?d=bluecloud47.org'],
  ['Example: short domain','#/app/detect?d=a.co'],
];

export function initPalette(){
  const dialog=document.querySelector('#command-palette');
  const input=document.querySelector('#palette-search');
  const list=document.querySelector('#palette-items');
  const open=()=>{dialog.showModal();input.value='';draw();input.focus()};
  const draw=()=>{
    const query=input.value.toLowerCase();
    list.replaceChildren(...commands.filter(([label])=>label.toLowerCase().includes(query)).map(([label,path],index)=>{
      const item=el('button',{type:'button',className:'palette-item',role:'option','aria-selected':String(index===0)},[el('span',{},label),el('span',{className:'muted'},'↵')]);
      item.addEventListener('click',()=>{dialog.close();location.hash=path});
      return item;
    }));
  };
  document.querySelector('#palette-open').addEventListener('click',open);
  input.addEventListener('input',draw);
  window.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();open()}
  });
  dialog.addEventListener('keydown',event=>{
    const options=[...list.querySelectorAll('button')];
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      if(!options.length)return;
      const current=options.indexOf(document.activeElement);
      const direction=event.key==='ArrowDown'?1:-1;
      const next=current<0?(direction>0?0:options.length-1):(current+direction+options.length)%options.length;
      options.forEach((option,index)=>option.setAttribute('aria-selected',String(index===next)));
      options[next].focus();
    }
    if(event.key==='Enter'){
      event.preventDefault();
      (options.includes(document.activeElement)?document.activeElement:list.querySelector('[aria-selected="true"]'))?.click();
    }
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
  draw();
}