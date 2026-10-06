import {get,latencySummary} from '../api.js';
import {el,emptyState,table,syntheticBadge,toast} from '../ui.js';

export async function mount(root){
  const title=el('section',{className:'tile hero-tile neo'},[el('p',{className:'eyebrow'},'STATUS / LIVE API'),el('h1',{},'Service status'),el('p',{className:'muted'},'Service fields come from GET /api/health. Latencies below are measured by this browser session only.')]);
  const output=el('section',{className:'section-block'});
  const latency=latencySummary();
  root.replaceChildren(title,output);
  try{
    const health=await get('/health');
    const familyNames=health.dataset_stats.families;
    const fields=[
      ['API status',health.status],['Python version',health.versions.python],['Seed',health.versions.seed],
      ['Domains in active frame',health.dataset_stats.domains],['Family labels',familyNames.length],
      ['Loaded model slots',health.models_loaded.join(', ')],
    ];
    const tiles=el('div',{className:'bento-grid'},fields.map(([label,value])=>el('article',{className:'tile span-4'},[
      el('div',{className:'section-head'},[el('h3',{},label),syntheticBadge()]),el('strong',{className:'metric-value'},String(value)),
    ])));
    const measured=latencySummary()||latency;
    const latencyPanel=measured?el('article',{className:'tile section-block'},[
      el('div',{className:'section-head'},[el('h2',{},'Client-side API latency'),el('span',{className:'badge'},'This browser session')]),
      table(['Measure','Milliseconds'],[['p50',measured.p50],['p95',measured.p95],['Recorded calls',measured.count]]),
    ]):emptyState('No latency samples yet.','Use a tool page to make API requests; this page reports only this session’s observed calls.');
    output.replaceChildren(tiles,latencyPanel,el('section',{className:'tile section-block'},[el('h2',{},'Family labels'),el('p',{className:'muted'},familyNames.join(', '))]));
  }catch{
    output.replaceChildren(emptyState('The API did not return health data.','Start the FastAPI server and use Retry in the banner.'));
    toast('Status details are unavailable while the API is offline.','error');
  }
}