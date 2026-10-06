import {post} from './api.js';
import {el,badge,button,formatScore,syntheticBadge,table,toast,verdictChip} from './ui.js';
import {makeChart} from './charts.js';

export function mount(root){
  const algorithm=el('select',{className:'select','aria-label':'DGA algorithm'},[
    el('option',{value:'lcg'},'LCG PRNG'),el('option',{value:'md5'},'Date-seeded MD5'),el('option',{value:'dictionary'},'Dictionary concatenation'),
  ]);
  const seed=el('input',{className:'input',type:'number',min:'0',value:'42','aria-label':'Seed'});
  const date=el('input',{className:'input',type:'date',value:'2026-01-01','aria-label':'Date'});
  const count=el('input',{className:'input',type:'number',min:'1',max:'200',value:'20','aria-label':'Domain count'});
  const rounds=el('input',{className:'input',type:'number',min:'1',max:'10',value:'5','aria-label':'Rounds'});
  const tries=el('input',{className:'input',type:'number',min:'1',max:'60',value:'12','aria-label':'Tries per domain'});
  const status=el('p',{className:'muted','aria-live':'polite'},'Mutations are scored against your local model only.');
  const output=el('section',{className:'section-block'});
  let lastEvasives=[];
  const run=button('Run evasion loop',async()=>{
    status.textContent='Running bounded mutation search…';
    output.replaceChildren();
    try{
      const result=await post('/evasion/loop',{algorithm:algorithm.value,seed:Number(seed.value),date:date.value,count:Number(count.value),rounds:Number(rounds.value),tries_per_domain:Number(tries.value)});
      lastEvasives=result.evasive_samples||[];
      const labels=result.rounds.map(r=>`Round ${r.round}`);
      const rates=result.rounds.map(r=>r.detection_rate);
      const cards=el('div',{className:'bento-grid'},[
        el('article',{className:'tile span-4 metric-tile'},[syntheticBadge(),el('span',{className:'metric-caption'},'Round 0 detection'),el('strong',{className:'metric-value'},formatScore(result.rounds[0]?.detection_rate||0))]),
        el('article',{className:'tile span-4 metric-tile'},[syntheticBadge(),el('span',{className:'metric-caption'},'Final detection'),el('strong',{className:'metric-value'},formatScore(result.rounds[result.rounds.length-1]?.detection_rate||0))]),
        el('article',{className:'tile span-4 metric-tile'},[syntheticBadge(),el('span',{className:'metric-caption'},'Evasive samples'),el('strong',{className:'metric-value'},String(lastEvasives.length))]),
      ]);
      const canvas=el('canvas',{role:'img','aria-label':'Detection rate across evasion rounds'});
      const chart=el('article',{className:'tile span-5'},[el('div',{className:'section-head'},[el('h2',{},'Detection rate by round'),syntheticBadge()]),el('div',{className:'chart-wrap'},canvas)]);
      const rows=result.rounds.map(r=>[`Round ${r.round}`,`${r.detected}/${r.domains}`,formatScore(r.detection_rate),`${r.evaded} evaded`]);
      const detail=el('article',{className:'tile span-7'},[el('div',{className:'section-head'},[el('h2',{},'Rounds'),syntheticBadge()]),table(['Round','Detected','Rate','Evaded'],rows)]);
      const examples=(result.evasive_details||[]).slice(0,8).map(e=>[el('span',{className:'mono'},e.original_domain),formatScore(e.original_probability),el('span',{className:'mono'},e.evasive_domain),formatScore(e.evasive_probability),e.evaded?'Evaded':'Caught']);
      const exTile=el('article',{className:'tile span-12 section-block'},[el('div',{className:'section-head'},[el('h2',{},'Evasive examples'),syntheticBadge()]),examples.length?table(['Original','Orig score','Evasive','Evasive score','Outcome'],examples):el('p',{className:'muted'},'No evasions found in this configuration.')]);
      output.replaceChildren(cards,el('div',{className:'bento-grid section-block'},[chart,detail]),exTile,el('p',{className:'note section-block'},result.note));
      makeChart(canvas,'line',{labels,datasets:[{label:'Detection rate',data:rates,borderColor:'#CC79A7',backgroundColor:'rgba(204,121,167,.2)',fill:true,tension:.3}]},{scales:{y:{min:0,max:1}}});
      status.textContent=`Loop complete. ${lastEvasives.length} evasive sample(s) available for the teaching-lab refit below.`;
      retrainBtn.disabled=!lastEvasives.length;
    }catch(error){status.textContent=error.message;toast(error.message,'error')}
  },'button button-primary neo');
  const retrainStatus=el('p',{className:'muted','aria-live':'polite'},'Refit trains a fresh LR head on frozen features; the saved bundle is never overwritten.');
  const retrainBtn=button('Retrain on evasives (lab only)',async()=>{
    retrainStatus.textContent='Refitting lab head…';
    try{
      const result=await post('/evasion/retrain',{evasive_domains:lastEvasives.slice(0,200)});
      retrainStatus.textContent=`Before ${formatScore(result.before.detection_rate)} → after ${formatScore(result.after.detection_rate)} (Δ ${(result.delta*100).toFixed(1)}pp on ${result.evasive_count} evasives). ${result.note}`;
      toast(`Lab refit: ${formatScore(result.before.detection_rate)} → ${formatScore(result.after.detection_rate)}`,'success');
    }catch(error){retrainStatus.textContent=error.message;toast(error.message,'error')}
  },'button button-primary neo');
  retrainBtn.disabled=true;
  root.replaceChildren(el('section',{className:'tile hero-tile neo'},[
    el('div',{className:'app-title-row'},[el('div',{},[el('p',{className:'eyebrow'},'EVASION / ATTACKER VS DEFENDER'),el('h1',{},'Stress your own model')]),syntheticBadge()]),
    el('p',{className:'muted'},'Defensive robustness test: bounded mutations try to flip DGA domains to benign against this local model. No network activity.'),
    el('div',{className:'form-row'},[
      el('label',{className:'field'},[el('span',{className:'field-label'},'Generator'),algorithm]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Seed'),seed]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Date'),date]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Count · max 200'),count]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Rounds · max 10'),rounds]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Tries · max 60'),tries]),
    ]),el('div',{className:'inline-actions section-block'},[run,retrainBtn,syntheticBadge()]),status,retrainStatus,
  ]),output);
}
