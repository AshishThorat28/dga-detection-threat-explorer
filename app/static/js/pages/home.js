import {get,post} from '../api.js';
import {el,badge,button,emptyState,formatScore,link,prototypeBadge,syntheticBadge,toast} from '../ui.js';

const features=[
  ['01','Detect','Binary domain screening, model slots and feature evidence.','#/app/detect'],
  ['02','Batch scan','Score up to 500 supplied domains.','#/app/batch'],
  ['03','Character projection','Inspect the deterministic coordinate file when present.','#/app/explorer'],
  ['04','DGA lab','Generate deterministic LCG, MD5 and dictionary samples.','#/app/lab'],
  ['05','Unseen-family experiment','Compare known-family and held-out-family scores.','#/app/experiments'],
  ['06','Mutation lab','Change string traits and inspect the score delta.','#/app/mutation'],
  ['07','Attack / defense','Score locally generated DGA and benign controls.','#/app/simulation'],
  ['08','Evasion loop','Mutate DGA strings until the local model misses; refit a lab head.','#/app/evasion'],
  ['09','Human vs AI','Guess legit vs DGA, then compare your accuracy to the model.','#/app/game'],
];

function flowDiagram(){
  const steps=['Synthetic data generator','Normalize / deduplicate','Character TF-IDF 2–4 grams + lexical signals','LR / RF + LR variants','Family classifier','FastAPI','Browser UI'];
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 1120 170');svg.setAttribute('role','img');svg.setAttribute('aria-label','Pipeline from synthetic data generation through FastAPI to the browser');svg.classList.add('architecture-diagram');
  const title=document.createElementNS(svg.namespaceURI,'title');title.textContent='DGA detection pipeline';svg.append(title);
  const defs=document.createElementNS(svg.namespaceURI,'defs');
  const marker=document.createElementNS(svg.namespaceURI,'marker');marker.setAttribute('id','flow-arrow');marker.setAttribute('markerWidth','8');marker.setAttribute('markerHeight','8');marker.setAttribute('refX','6');marker.setAttribute('refY','3');marker.setAttribute('orient','auto');
  const arrow=document.createElementNS(svg.namespaceURI,'path');arrow.setAttribute('d','M0,0 L0,6 L7,3 z');arrow.setAttribute('fill','var(--muted)');marker.append(arrow);defs.append(marker);svg.append(defs);
  steps.forEach((label,index)=>{
    const x=8+index*158;const group=document.createElementNS(svg.namespaceURI,'g');
    const rect=document.createElementNS(svg.namespaceURI,'rect');rect.setAttribute('x',x);rect.setAttribute('y','42');rect.setAttribute('width','136');rect.setAttribute('height','86');rect.setAttribute('rx','12');rect.setAttribute('fill','var(--surface-2)');rect.setAttribute('stroke','var(--border)');group.append(rect);
    const number=document.createElementNS(svg.namespaceURI,'text');number.setAttribute('x',x+12);number.setAttribute('y','62');number.setAttribute('fill','var(--accent)');number.setAttribute('font-size','11');number.textContent=String(index+1).padStart(2,'0');group.append(number);
    const words=label.split(' ');const text=document.createElementNS(svg.namespaceURI,'text');text.setAttribute('x',x+12);text.setAttribute('y','84');text.setAttribute('fill','var(--text)');text.setAttribute('font-size','11');text.setAttribute('font-family','Inter, sans-serif');
    const lines=[];let line='';for(const word of words){if(`${line} ${word}`.trim().length>19){lines.push(line);line=word}else line=`${line} ${word}`.trim()}if(line)lines.push(line);
    lines.slice(0,3).forEach((value,lineIndex)=>{const span=document.createElementNS(svg.namespaceURI,'tspan');span.setAttribute('x',x+12);span.setAttribute('dy',lineIndex===0?'0':'15');span.textContent=value;text.append(span)});group.append(text);svg.append(group);
    if(index<steps.length-1){const connector=document.createElementNS(svg.namespaceURI,'line');connector.setAttribute('x1',x+138);connector.setAttribute('x2',x+154);connector.setAttribute('y1','85');connector.setAttribute('y2','85');connector.setAttribute('stroke','var(--muted)');connector.setAttribute('marker-end','url(#flow-arrow)');svg.append(connector)}
  });
  return svg;
}

function metricTile(label,value){
  return el('article',{className:'tile metric-tile'},[el('span',{className:'metric-caption'},label),el('strong',{className:'metric-value'},value)]);
}

async function loadMetrics(target){
  target.replaceChildren(syntheticBadge(),el('div',{className:'skeleton section-block','aria-label':'Loading API metrics'}));
  try{
    const result=await get('/results');
    if(!result.metrics?.length){target.append(emptyState('No result metrics are available.','Run python -m src.train to generate the baseline metrics.'));return}
    for(const metric of result.metrics){
      target.append(el('div',{className:'section-block'},[
        el('div',{className:'section-head'},[el('h3',{},`${metric.model} model slot`),syntheticBadge()]),
        el('div',{className:'metric-strip'},[
          metricTile('Accuracy',formatScore(metric.accuracy)),metricTile('Precision',formatScore(metric.precision)),
          metricTile('Recall',formatScore(metric.recall)),metricTile('F1',formatScore(metric.f1)),
          metricTile('ROC-AUC',formatScore(metric.roc_auc)),
        ]),
      ]));
    }
    if(result.message)target.append(el('p',{className:'note section-block'},result.message));
  }catch{target.append(emptyState('Metrics are unavailable.','Retry the API or run python -m src.train after the service is back.'))}
}

export async function mount(root){
  const heroDemo=el('div',{className:'hero-demo'},[
    el('div',{className:'section-head'},[el('h3',{},'Try a domain'),syntheticBadge()]),
    el('label',{className:'field'},[el('span',{className:'field-label'},'Domain string'),el('input',{className:'input',id:'home-domain',value:'github.com','aria-label':'Domain for mini demo'})]),
    button('Analyze',async()=>{
      const input=root.querySelector('#home-domain');
      const output=root.querySelector('#home-demo-result');
      output.replaceChildren(el('div',{className:'skeleton','aria-label':'Loading result'}));
      try{
        const result=await post('/predict',{domain:input.value});
        const isDga=result.verdict==='DGA';
        const rows=[
          el('span',{className:`verdict ${isDga?'verdict-dga':'verdict-legitimate'}`},[el('span',{'aria-hidden':'true'},isDga?'⚠':'✓'),result.verdict]),
          badge('Synthetic data','badge-synthetic'),el('span',{className:'mono'},`DGA score ${formatScore(result.probability)}`),
        ];
        if(result.typosquat&&result.typosquat.flagged)rows.push(el('span',{className:'mono'},`⚠ Lookalike of ${result.typosquat.brand} (${result.typosquat.reason})`));
        output.replaceChildren(el('div',{className:'demo-result'},rows));
      }catch(error){output.replaceChildren(el('p',{className:'muted'},error.message))}
    },'button button-primary neo'),
    el('div',{id:'home-demo-result','aria-live':'polite'}),
  ]);
  const hero=el('section',{className:'tile hero-tile neo hero-grid'},[
    el('div',{},[
      el('div',{className:'inline-actions'},[prototypeBadge(),syntheticBadge()]),
      el('p',{className:'eyebrow'},'DOMAIN-STRING RESEARCH'),
      el('h1',{},'Read the shape. Test the signal.'),
      el('p',{className:'muted'},'A local teaching lab for DGA detection, model evidence and family-held-out experiments.'),
      el('div',{className:'inline-actions'},[link('Open the app →','#/app/detect','button button-primary neo'),link('Read the docs','#/docs','button button-quiet')]),
    ]),heroDemo,
  ]);
  const featureGrid=el('div',{className:'bento-grid'});
  features.forEach(([number,title,description,href])=>{
    featureGrid.append(el('a',{href,className:'tile feature-link span-3'},[
      el('span',{className:'feature-number'},number),el('h3',{},title),el('p',{className:'muted'},description),el('span',{className:'muted','aria-hidden':'true'},'Open tool →'),
    ]));
  });
  const steps=el('div',{className:'section-block'},[
    el('div',{className:'section-head'},[el('h2',{},'How it works'),syntheticBadge()]),
    el('div',{className:'three-col'},[
      el('article',{className:'tile'},[el('span',{className:'feature-number'},'01'),el('h3',{},'Normalize'),el('p',{className:'muted'},'Normalize and deduplicate domain strings in the local synthetic dataset.')]),
      el('article',{className:'tile'},[el('span',{className:'feature-number'},'02'),el('h3',{},'Represent'),el('p',{className:'muted'},'Combine character TF-IDF n-grams (2–4) with handcrafted lexical features.')]),
      el('article',{className:'tile'},[el('span',{className:'feature-number'},'03'),el('h3',{},'Score'),el('p',{className:'muted'},'Average binary model-slot scores and report a separate supported-family prediction.')]),
    ]),
  ]);
  const metrics=el('section',{className:'section-block'},[el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'CURRENT API OUTPUT'),el('h2',{},'Baseline metrics')]),syntheticBadge()]),el('div',{id:'home-metrics'})]);
  const architecture=el('section',{className:'section-block tile'},[el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'REAL PIPELINE'),el('h2',{},'From synthetic sample to local UI')]),syntheticBadge()]),el('div',{className:'architecture-scroll'},flowDiagram())]);
  const useCases=el('section',{className:'section-block'},[el('div',{className:'section-head'},[el('h2',{},'A controlled research surface')]),el('div',{className:'three-col'},[
    el('article',{className:'tile'},[el('h3',{},'Teaching'),el('p',{className:'muted'},'Relate domain string patterns to the score and model inputs.')]),
    el('article',{className:'tile'},[el('h3',{},'DGA experimentation'),el('p',{className:'muted'},'Generate local deterministic samples and inspect family-held-out results.')]),
    el('article',{className:'tile'},[el('h3',{},'String-level triage demo'),el('p',{className:'muted'},'Explore feature evidence without contacting or resolving a domain.')]),
  ])]);
  const faq=el('section',{className:'section-block tile'},[el('h2',{},'Questions worth asking'),
    ...[
      ['Why synthetic data?','The bundled dataset is generated deterministically so the example runs offline. It is not representative security telemetry.'],
      ['Does a high DGA score prove a domain is malicious?','No. The score is a model output trained on synthetic data and is not evidence that a domain is malicious.'],
      ['Does the 3D projection learn semantic distance?','No. Coordinates are deterministic character-derived teaching coordinates; axes have no semantic meaning.'],
    ].map(([question,answer])=>el('details',{className:'faq'},[el('summary',{},question),el('p',{},answer)])),
  ]);
  const closing=el('section',{className:'section-block tile hero-tile neo'},[el('h2',{},'Explore the actual model output.'),el('p',{className:'muted'},'Every score shown here is returned by the local API.'),link('Open Detect →','#/app/detect','button button-primary neo')]);
  root.replaceChildren(hero,steps,el('section',{className:'section-block'},[el('div',{className:'section-head'},[el('h2',{},'Research tools')]),featureGrid]),metrics,architecture,useCases,faq,closing);
  loadMetrics(root.querySelector('#home-metrics'));
  const query=new URLSearchParams(location.hash.split('?')[1]||'');
  if(query.has('d'))root.querySelector('#home-domain').value=query.get('d');
}