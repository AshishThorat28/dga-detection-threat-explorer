import {el,link} from '../ui.js';

const tabs=[
  ['detect','Detect'],['batch','Batch scan'],['explorer','3D projection'],['lab','DGA lab'],
  ['experiments','Experiments'],['mutation','Mutation lab'],['simulation','Simulation'],
  ['evasion','Evasion loop'],['game','Human vs AI'],['results','Results'],
];
const modules={
  detect:()=>import('../detect.js'),batch:()=>import('../batch.js'),explorer:()=>import('../explorer3d.js'),
  lab:()=>import('../lab.js'),experiments:()=>import('../experiments.js'),mutation:()=>import('../mutation.js'),
  simulation:()=>import('../simulation.js'),evasion:()=>import('../evasion.js'),game:()=>import('../game.js'),results:()=>import('../results.js'),
};

export async function mount(root,route){
  const current=tabs.some(([name])=>name===route.tab)?route.tab:'detect';
  const sidebar=el('nav',{className:'app-side', 'aria-label':'Application tools'});
  for(const [name,title] of tabs){
    const item=link(title,`#/app/${name}`);
    if(name===current)item.setAttribute('aria-current','page');
    sidebar.append(item);
  }
  const content=el('section',{className:'app-content','aria-live':'polite'});
  root.replaceChildren(el('div',{className:'app-layout'},[sidebar,content]));
  const page=await modules[current]();
  await page.mount(content,{query:route.query});
}