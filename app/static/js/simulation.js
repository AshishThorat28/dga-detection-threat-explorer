import {post} from './api.js';
import {el,badge,button,formatScore,syntheticBadge,table,toast,verdictChip} from './ui.js';
import {makeChart} from './charts.js';

export function mount(root){
  const algorithm=el('select',{className:'select','aria-label':'DGA algorithm'},[
    el('option',{value:'lcg'},'LCG PRNG'),el('option',{value:'md5'},'Date-seeded MD5'),el('option',{value:'dictionary'},'Dictionary concatenation'),
  ]);
  const seed=el('input',{className:'input',type:'number',min:'0',value:'42','aria-label':'Simulation seed'});
  const date=el('input',{className:'input',type:'date',value:'2026-01-01','aria-label':'Simulation date'});
  const dgaCount=el('input',{className:'input',type:'number',min:'1',max:'200',value:'20','aria-label':'Generated DGA domain count'});
  const benignCount=el('input',{className:'input',type:'number',min:'1',max:'200',value:'20','aria-label':'Benign control count'});
  const status=el('p',{className:'muted','aria-live':'polite'},'DGA and benign samples are generated locally.');
  const output=el('section',{className:'section-block'});
  const run=button('Run simulation',async()=>{
    status.replaceChildren(el('span',{},'Scoring generated samples…'),el('span',{className:'progress'},el('i')));
    output.replaceChildren();
    try{
      const result=await post('/simulate',{algorithm:algorithm.value,seed:Number(seed.value),date:date.value,count:Number(dgaCount.value),benign_count:Number(benignCount.value)});
      const metrics=[
        ['DGA domains generated',result.generated],['DGA alerts',result.detected_dgas],
        ['False positives',result.false_positives],['False negatives',result.false_negatives],
        ['Detection rate',formatScore(result.detection_rate)],['Processing time',`${Number(result.processing_ms).toFixed(1)} ms`],
      ];
      const cards=el('div',{className:'bento-grid'},metrics.map(([label,value])=>el('article',{className:'tile span-4 metric-tile'},[
        syntheticBadge(),el('span',{className:'metric-caption'},label),el('strong',{className:'metric-value'},String(value)),
      ])));
      const canvas=el('canvas',{role:'img','aria-label':'Synthetic attack and defense outcome counts'});
      const chart=el('article',{className:'tile span-5'},[el('div',{className:'section-head'},[el('h2',{},'Outcome counts'),syntheticBadge()]),el('div',{className:'chart-wrap'},canvas)]);
      const rows=result.results.map(row=>[
        el('span',{className:'mono'},row.domain),row.expected,verdictChip(row.verdict),formatScore(row.probability),row.alert?'Alert':'No alert',syntheticBadge(),
      ]);
      const detail=el('article',{className:'tile span-7'},[
        el('div',{className:'section-head'},[el('h2',{},'Scored samples'),syntheticBadge()]),table(['Domain','Known label','Detector','DGA score','Outcome','Data'],rows),
      ]);
      output.replaceChildren(cards,el('div',{className:'bento-grid section-block'},[chart,detail]),el('p',{className:'note section-block'},result.note));
      makeChart(canvas,'doughnut',{
        labels:['✓ Detected DGA','⚠ False negative','⚠ False positive','✓ Correctly clear'],
        datasets:[{data:[result.detected_dgas,result.false_negatives,result.false_positives,result.benign_controls-result.false_positives],backgroundColor:['#22C55E','#EF4444','#F59E0B','#718096'],borderColor:'#14161C',borderWidth:3}],
      },{plugins:{legend:{position:'bottom'}}});
      status.textContent='Simulation complete. Ground-truth labels are known because both classes were generated locally.';
    }catch(error){status.textContent=error.message;toast(error.message,'error')}
  },'button button-primary neo');
  root.replaceChildren(el('section',{className:'tile hero-tile neo'},[
    el('div',{className:'app-title-row'},[el('div',{},[el('p',{className:'eyebrow'},'SIMULATION / ATTACK VS DEFENSE'),el('h1',{},'Generate, score, account')]),syntheticBadge()]),
    el('p',{className:'muted'},'This controlled run uses local deterministic DGA strings and benign controls. No network activity is performed.'),
    el('div',{className:'form-row'},[
      el('label',{className:'field'},[el('span',{className:'field-label'},'Generator'),algorithm]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Seed'),seed]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Date'),date]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'DGA count · max 200'),dgaCount]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Benign controls · max 200'),benignCount]),
    ]),el('div',{className:'inline-actions section-block'},[run,syntheticBadge()]),status,
  ]),output);
}