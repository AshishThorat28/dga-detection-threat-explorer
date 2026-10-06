import {checkHealth,apiState} from './api.js';
import {el,toast} from './ui.js';
import {initPalette} from './palette.js';

const view=document.querySelector('#route-view');
const themeKey='dga-theme';
const pages={
  home:()=>import('./pages/home.js'),
  app:()=>import('./pages/app.js'),
  docs:()=>import('./pages/docs.js'),
  status:()=>import('./pages/status.js'),
  about:()=>import('./pages/about.js'),
};
let renderToken=0;

function routeFromHash(){
  const value=location.hash.replace(/^#\/?/,'');
  const [rawPath,query='']=value.split('?');
  const path=rawPath||'home';
  const parts=path.split('/').filter(Boolean);
  if(parts[0]==='app')return {page:'app',tab:parts[1]||'detect',query:new URLSearchParams(query)};
  return {page:pages[parts[0]]?parts[0]:'404',query:new URLSearchParams(query)};
}

function setGlobalActive(page){
  document.querySelectorAll('[data-global]').forEach(item=>{
    const active=item.dataset.global===page;
    if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  });
}

async function render(){
  const current=routeFromHash();
  const token=++renderToken;
  setGlobalActive(current.page==='app'?'app':current.page);
  view.replaceChildren(el('div',{className:'skeleton','aria-hidden':'true'}));
  try{
    if(current.page==='404'){
      const module=await import('./pages/not-found.js');
      if(token===renderToken)module.mount(view);
      return;
    }
    const module=await pages[current.page]();
    if(token===renderToken)await module.mount(view,current);
  }catch(error){
    if(token===renderToken){view.replaceChildren(el('section',{className:'tile'},[el('h1',{},'This page could not load'),el('p',{className:'muted'},error.message),el('a',{href:'#/home'},'Return home')]))}
  }
}

function applyTheme(){
  const theme=localStorage.getItem(themeKey)==='light'?'light':'dark';
  document.documentElement.dataset.theme=theme;
  document.querySelector('#theme-toggle').setAttribute('aria-label',`Switch to ${theme==='dark'?'light':'dark'} theme`);
}

document.querySelector('#theme-toggle').addEventListener('click',()=>{
  localStorage.setItem(themeKey,document.documentElement.dataset.theme==='dark'?'light':'dark');
  applyTheme();
});
document.querySelector('#api-retry').addEventListener('click',async()=>{
  const result=await checkHealth();
  if(result)toast('API connection restored.','success');
});

window.addEventListener('hashchange',render);
window.addEventListener('keydown',event=>{
  if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!(event.target instanceof Element&&event.target.matches('input,textarea,select,[contenteditable=true]'))){
    if(routeFromHash().page==='app'){event.preventDefault();document.querySelector('[data-domain-input]')?.focus()}
  }
  if(event.key==='Escape'){const domain=document.querySelector('[data-domain-input]');if(domain)domain.value=''}
  if(/^[1-9]$/.test(event.key)&&routeFromHash().page==='app'&&!(event.target instanceof Element&&event.target.matches('input,textarea,select'))){
    const tabs=['detect','batch','explorer','lab','experiments','mutation','simulation','evasion','game'];
    location.hash=`#/app/${tabs[Number(event.key)-1]}`;
  }
});

applyTheme();
initPalette();
render();
checkHealth();
if(!localStorage.getItem('dga-tour-complete')){
  import('./pages/tour.js').then(module=>module.startTour());
}