import {get,post} from './api.js';
import {el,badge,button,emptyState,formatScore,syntheticBadge,table,toast} from './ui.js';
import {familyPalette,makeChart} from './charts.js';

function selectFamilies(names,label){
  const select=el('select',{className:'select','aria-label':label,multiple:true,size:'7'});
  names.forEach(name=>select.append(el('option',{value:name},name)));
  return select;
}

export async function mount(root){
  const heading=el('section',{className:'tile hero-tile neo'},[
    el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'EXPERIMENT / FAMILY-DISJOINT'),el('h1',{},'Test on families withheld from training')]),syntheticBadge()]),
    el('p',{className:'muted'},'Known scores use an internal random split. Each unseen test combines the excluded DGA family with held-out benign controls.'),
  ]);
  const controls=el('section',{className:'tile section-block'},[el('p',{className:'loading'},'Loading family labels from API…')]);
  const output=el('section',{className:'section-block'});
  root.replaceChildren(heading,controls,output);
  let health;
  try{health=await get('/health')}catch{controls.replaceChildren(emptyState('Family labels are unavailable.','Retry after the local API is available.'));return}
  const families=health.dataset_stats.families.filter(name=>name!=='benign');
  const train=selectFamilies(families,'Training DGA families');
  const unseen=selectFamilies(families,'Unseen DGA families');
  const perFamily=el('input',{className:'input',type:'number',min:'20',max:'1000',value:'120','aria-label':'Synthetic samples per DGA family'});
  const status=el('p',{className:'muted','aria-live':'polite'},'Choose explicit family sets or leave both blank for one held-out run per family.');
  const run=button('Run evaluation',async()=>{
    const training=[...train.selectedOptions].map(option=>option.value);
    const heldOut=[...unseen.selectedOptions].map(option=>option.value);
    if(training.some(name=>heldOut.includes(name))){toast('Training and unseen selections must not overlap.','error');return}
    const body={per_family:Number(perFamily.value)};
    if(training.length)body.train_families=training;
    if(heldOut.length)body.unseen_families=heldOut;
    status.replaceChildren(el('span',{},'Running family-held-out fits…'),el('span',{className:'progress'},el('i')));
    output.replaceChildren();
    try{
      const result=await post('/experiments/unseen',body);
      const summary=el('div',{className:'metric-strip'},[
        ['Known macro F1',result.known_macro.f1],['Unseen macro F1',result.unseen_macro.f1],['Generalization gap',result.generalization_gap],
      ].map(([label,value])=>el('article',{className:'tile metric-tile'},[syntheticBadge(),el('span',{className:'metric-caption'},label),el('strong',{className:'metric-value'},formatScore(value))])));
      const canvas=el('canvas',{role:'img','aria-label':'Known and unseen F1 scores by held-out family'});
      const chartTile=el('article',{className:'tile section-block'},[el('div',{className:'section-head'},[el('h2',{},'Known vs unseen F1'),syntheticBadge()]),el('div',{className:'chart-wrap'},canvas)]);
      const metrics=values=>[formatScore(values.accuracy),formatScore(values.precision),formatScore(values.recall),formatScore(values.f1)];
      const rows=result.per_family.map(row=>[
        row.unseen_family,`${row.dga_samples} DGA / ${row.benign_controls} benign`,...metrics(row.known),...metrics(row.unseen),syntheticBadge(),
      ]);
      const detailTable=table(['Excluded family','Test composition','Known accuracy','Known precision','Known recall','Known F1','Unseen accuracy','Unseen precision','Unseen recall','Unseen F1','Data'],rows);
      output.replaceChildren(summary,el('div',{className:'bento-grid section-block'},[chartTile,el('article',{className:'tile span-6'},[
        el('div',{className:'section-head'},[el('h2',{},'Per-family scores'),syntheticBadge()]),detailTable,
      ])]),el('p',{className:'note section-block'},result.note));
      const labels=result.per_family.map(row=>row.unseen_family);
      makeChart(canvas,'bar',{
        labels,
        datasets:[
          {label:'Known split F1',data:result.per_family.map(row=>row.known.f1),backgroundColor:labels.map(name=>familyPalette[name]||familyPalette.benign)},
          {label:'Unseen F1',data:result.per_family.map(row=>row.unseen.f1),backgroundColor:labels.map(name=>`${familyPalette[name]||familyPalette.benign}99`)},
        ],
      },{scales:{y:{min:0,max:1,ticks:{color:'var(--muted)'},grid:{color:'var(--border)'}},x:{ticks:{color:'var(--muted)'},grid:{color:'transparent'}}}});
      status.textContent=`Completed ${result.per_family.length} held-out family runs.`;
    }catch(error){status.textContent=error.message;toast(error.message,'error')}
  },'button button-primary neo');
  controls.replaceChildren(
    el('div',{className:'form-row'},[
      el('label',{className:'field'},[el('span',{className:'field-label'},'Training families · optional'),train]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Unseen families · optional'),unseen]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Samples per family · 20–1,000'),perFamily]),
    ]),el('p',{className:'note'},'Small benign control set; demonstration, not strong generalization evidence.'),
    run,status,
  );
}