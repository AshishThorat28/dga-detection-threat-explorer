import {get} from '../api.js';
import {el,badge,button,codeBlock,emptyState,table,syntheticBadge} from '../ui.js';

const routes=[
  ['GET','/','—','HTML application shell'],
  ['GET','/api/health','—','{status, models_loaded, dataset_stats, versions}'],
  ['POST','/api/predict','{domain}','Prediction: domain, verdict, probability, risk, models, features, warnings, family, coordinates, explanation'],
  ['POST','/api/predict/batch','{domains: string[]}','{results: Prediction[], summary: {total, dga, legitimate}}'],
  ['POST','/api/explain','{domain}','{domain, verdict, probability, model, intercept, attributions[], note}'],
  ['POST','/api/experiments/unseen','{train_families?, unseen_families?, per_family?}','{model, per_family[], known_macro, unseen_macro, generalization_gap, per_family_size, note}'],
  ['POST','/api/adversarial','{domain, length?, randomness?, digit_ratio?, vowel_ratio?, meaningful_word?, seed?}','{original, modified_domain, modified, confidence_change, feature_changes}'],
  ['POST','/api/simulate','{algorithm?, seed?, date?, count?, benign_count?}','{algorithm, generated, benign_controls, detected_dgas, false_positives, false_negatives, detection_rate, processing_ms, alerts[], results[], note}'],
  ['POST','/api/evasion/loop','{domains? | algorithm?, seed?, date?, count?, rounds?, tries_per_domain?}','{rounds[{round, detected, detection_rate, examples}], evasive_samples[], note}'],
  ['POST','/api/evasion/retrain','{evasive_domains[], benign_domains?}','{before{ detection_rate }, after{ detection_rate }, delta, note}'],
  ['GET','/api/game/sample?count=8&seed=42','query count 2-40, seed','{seed, count, samples[{domain, label, model_verdict, model_probability, family}], model_accuracy, note}'],
  ['POST','/api/generate','{algorithm?, seed?, date?, count?}','{algorithm, domains: Prediction[], caught, count}'],
  ['POST','/api/robustness','{domain}','{results: VariantPrediction[]}'],
  ['POST','/api/typosquat','{domain}','{domain, flagged, brand, distance, reason}'],
  ['GET','/api/points','—','Point[] or [] when the generated file is absent'],
  ['GET','/api/results','—','{metrics[], unseen_family_results[], per_family[], calibration[], robustness[], message}'],
  ['GET','/api/export?fmt=csv|json','query fmt (default csv)','CSV or JSON download of in-memory scan history'],
];

function codeExample(title,code,language){return el('section',{className:'tile'},[el('div',{className:'section-head'},[el('h3',{},title)]),codeBlock(code,language)])}

export async function mount(root,context={}){
  const sidebar=el('nav',{className:'app-side docs-side','aria-label':'Documentation sections'});
  const sections=[['quickstart','Quickstart'],['api','API reference'],['methodology','Methodology'],['glossary','Glossary']];
  sections.forEach(([id,label])=>sidebar.append(el('a',{href:`#/docs?section=${id}`},label)));
  const main=el('div',{className:'docs-main'});
  const quick=el('section',{id:'quickstart',className:'tile hero-tile neo'},[
    el('p',{className:'eyebrow'},'QUICKSTART'),el('h1',{},'Run locally'),
    el('p',{className:'muted'},'Python 3.10+; no npm or frontend build step.'),
    codeBlock('python -m venv .venv\n.venv\\Scripts\\Activate.ps1\npython -m pip install -r requirements.txt\npython -m uvicorn app.main:app --host 127.0.0.1 --port 8000','powershell'),
    el('p',{className:'muted'},'Open http://127.0.0.1:8000 for the app and /docs for Swagger UI.'),
  ]);
  const apiSection=el('section',{id:'api',className:'section-block'},[
    el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'LIVE ROUTE CONTRACT'),el('h2',{},'API reference')]),el('a',{href:'/docs',target:'_blank',rel:'noreferrer'},'Open Swagger ↗')]),
    el('p',{className:'muted'},'Shapes below follow app/main.py and app/schemas.py. JSON uses the backend’s exact field names.'),
    table(['Method','Route','Request','Response shape'],routes.map(row=>row)),
    codeExample('cURL · one domain','curl -X POST http://127.0.0.1:8000/api/predict -H "Content-Type: application/json" -d "{\"domain\":\"github.com\"}"','bash'),
    codeExample('Python · batch','import requests\nresponse = requests.post(\n    "http://127.0.0.1:8000/api/predict/batch",\n    json={"domains": ["github.com", "qzv8xk2m1p9r.com"]},\n)\nprint(response.json())','python'),
    codeExample('JavaScript · explain','const response = await fetch("/api/explain", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify({ domain: "github.com" }),\n});\nconst explanation = await response.json();','javascript'),
    el('p',{className:'note'},'Backend contract note: /api/export reads the query parameter fmt (not format). The /api/adversarial JSON field named confidence_change is shown in this interface as a DGA score delta.'),
  ]);
  const modelCard=el('section',{id:'methodology',className:'section-block'},[
    el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'MODEL & DATASET CARD'),el('h2',{},'What is actually trained')]),syntheticBadge()]),
    el('p',{className:'muted'},'The default data is synthetic, deterministic and seeded with 42. The generator defines eight DGA-like families and only 12 unique benign domains. Training uses second-level-label character TF-IDF (2–4 grams) and handcrafted features, fit on the training split only.'),
    el('div',{className:'three-col'},[
      el('article',{className:'tile'},[el('h3',{},'LR'),el('p',{className:'muted'},'Logistic-regression binary baseline and the model whose logit is explained.')]),
      el('article',{className:'tile'},[el('h3',{},'RF'),el('p',{className:'muted'},'Random-forest binary model; holdout metrics are calculated separately from LR.')]),
      el('article',{className:'tile'},[el('h3',{},'XGB'),el('p',{className:'muted'},'XGBoost on the same TF-IDF + lexical matrix. Optional install.')]),
      el('article',{className:'tile'},[el('h3',{},'LSTM'),el('p',{className:'muted'},'Character-embedding LSTM over the second-level label. Optional install.')]),
      el('article',{className:'tile'},[el('h3',{},'CNN'),el('p',{className:'muted'},'Character-embedding 1D-CNN over the second-level label. Optional install.')]),
      el('article',{className:'tile'},[el('h3',{},'Ensemble'),el('p',{className:'muted'},'Displayed DGA score is the mean of available slot probabilities.')]),
    ]),
    el('p',{className:'note'},'Returned model scores are not evidence of maliciousness. Family labels are approximate. Synthetic holdout results do not demonstrate real-world generalization.'),
  ]);
  const glossary=el('section',{id:'glossary',className:'tile section-block'},[
    el('h2',{},'Glossary'),
    ...[
      ['DGA','Domain generation algorithm: a method for generating many candidate domains.'],
      ['C2','Command and control infrastructure used by malware.'],
      ['Entropy','A measure of character-distribution uncertainty in a string.'],
      ['TF-IDF','A term weighting method applied here to character n-grams.'],
      ['N-gram','A contiguous sequence of n characters; this model uses lengths two through four.'],
      ['Sinkholing','Redirecting a malicious domain to infrastructure controlled for observation or disruption.'],
      ['Logit','The linear score before logistic transformation; additive LR feature contributions sum in logit space.'],
    ].map(([term,definition])=>el('div',{className:'feature-row'},[el('strong',{},term),el('span',{className:'muted'},definition)])),
  ]);
  main.append(quick,apiSection,modelCard,glossary);
  root.replaceChildren(el('div',{className:'docs-layout'},[sidebar,main]));
  try{
    const health=await get('/health');
    const families=health.dataset_stats.families.filter(name=>name!=='benign');
    modelCard.append(el('p',{className:'muted'},`Families returned by the running API (${families.length} DGA families): ${families.join(', ')}.`));
    modelCard.append(badge(`Seed ${health.versions.seed}`,'badge-synthetic'));
  }catch{}
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting)sidebar.querySelectorAll('a').forEach(item=>item.setAttribute('aria-current',String(item.href.endsWith(`section=${entry.target.id}`))));
  }),{rootMargin:'-15% 0px -70% 0px'});
  sections.forEach(([id])=>observer.observe(root.querySelector(`#${id}`)));
  const target=context.query?.get('section');
  if(target)requestAnimationFrame(()=>root.querySelector(`#${CSS.escape(target)}`)?.scrollIntoView({behavior:'smooth',block:'start'}));
}