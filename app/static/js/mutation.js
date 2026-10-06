import {post} from './api.js';
import {el,badge,button,formatScore,syntheticBadge,table,toast,verdictChip} from './ui.js';

const ranges=[
  ['length','Target label length',18,1,63,.01],
  ['randomness','Character randomness',.7,0,1,.05],
  ['digit_ratio','Digit ratio',.15,0,.8,.05],
  ['vowel_ratio','Vowel ratio',.3,0,1,.05],
];

export function mount(root){
  const domain=el('input',{className:'input',value:'qzv8xk2m1p9r.com',maxlength:'1000','aria-label':'Starting domain'});
  const word=el('input',{className:'input',maxlength:'32',placeholder:'Letters only · up to 32 characters','aria-label':'Meaningful word insertion'});
  const controls=ranges.map(([name,label,value,min,max,step])=>{
    const output=el('output',{},String(value));
    const input=el('input',{type:'range',min,max,step,value,'aria-label':label});
    input.addEventListener('input',()=>output.textContent=Number(input.value).toFixed(name==='length'?0:2));
    return {name,label,input,output};
  });
  const status=el('p',{className:'muted','aria-live':'polite'},'Edit the controls, then run a deterministic mutation.');
  const resultHost=el('section',{className:'section-block'});
  const run=button('Mutate and score',async()=>{
    status.textContent='Mutating and scoring both domains…';resultHost.replaceChildren(el('div',{className:'skeleton','aria-label':'Loading score comparison'}));
    const body={domain:domain.value,length:Number(controls[0].input.value),randomness:Number(controls[1].input.value),digit_ratio:Number(controls[2].input.value),vowel_ratio:Number(controls[3].input.value),meaningful_word:word.value,seed:42};
    try{
      const result=await post('/adversarial',body);
      const before=result.original,after=result.modified;
      const delta=result.confidence_change;
      const summary=el('div',{className:'metric-strip'},[
        ['Original DGA score',before.probability],['Modified DGA score',after.probability],['DGA score delta',delta],
      ].map(([label,value])=>el('article',{className:'tile metric-tile'},[syntheticBadge(),el('span',{className:'metric-caption'},label),el('strong',{className:'metric-value'},`${Number(value)>0&&label==='DGA score delta'?'+':''}${formatScore(value)}`)])));
      const comparison=el('div',{className:'two-col section-block'},[
        ...[['Original',before],['Mutated',after]].map(([label,item])=>el('article',{className:'tile'},[
          el('div',{className:'section-head'},[el('h3',{},label),syntheticBadge()]),el('p',{className:'mono'},item.domain),verdictChip(item.verdict),
          el('div',{className:'inline-actions section-block'},[badge(`DGA score ${formatScore(item.probability)}`),badge(`Family: ${item.family.name}`,'badge-approx')]),
        ])),
      ]);
      const keys=['length','entropy','vowel_ratio','digit_ratio','dictionary_coverage'];
      const changes=table(['Feature','Original','Mutated','Change'],keys.map(key=>[
        key.replaceAll('_',' '),Number(before.features[key]).toFixed(3),Number(after.features[key]).toFixed(3),`${result.feature_changes[key]>0?'+':''}${Number(result.feature_changes[key]).toFixed(3)}`,
      ]));
      resultHost.replaceChildren(summary,comparison,el('article',{className:'tile section-block'},[
        el('div',{className:'section-head'},[el('h2',{},'Feature changes'),badge('Approximate model response','badge-approx'),syntheticBadge()]),changes,
        el('p',{className:'note'},'DGA score delta and family scores are approximate model outputs, not evidence that a domain is malicious.'),
      ]));
      status.textContent='Mutation complete. The backend returns the modified string and before/after features.';
    }catch(error){status.textContent=error.message;resultHost.replaceChildren();toast(error.message,'error')}
  },'button button-primary neo');
  const fields=[
    el('label',{className:'field'},[el('span',{className:'field-label'},'Starting domain'),domain]),
    ...controls.map(control=>el('label',{className:'field'},[el('span',{className:'field-label'},[control.label,' ',control.output]),control.input])),
    el('label',{className:'field'},[el('span',{className:'field-label'},'Meaningful word insertion'),word]),
  ];
  root.replaceChildren(el('section',{className:'tile hero-tile neo'},[
    el('div',{className:'app-title-row'},[el('div',{},[el('p',{className:'eyebrow'},'MUTATION LAB / STRING-LEVEL'),el('h1',{},'Change the string, compare the score')]),syntheticBadge()]),
    el('p',{className:'muted'},'The endpoint changes character randomness, label length, digit/vowel proportions and optional meaningful-word insertion.'),
    el('div',{className:'form-row'},fields),el('div',{className:'inline-actions section-block'},[run,badge('Approximate','badge-approx')]),status,
  ]),resultHost);
}