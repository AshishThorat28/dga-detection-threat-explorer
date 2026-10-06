import {get} from './api.js';
import {el,button,formatScore,syntheticBadge,toast,verdictChip} from './ui.js';

export function mount(root){
  const seed=el('input',{className:'input',type:'number',min:'0',value:'42','aria-label':'Round seed'});
  const count=el('input',{className:'input',type:'number',min:'2',max:'40',value:'8','aria-label':'Round size'});
  const status=el('p',{className:'muted','aria-live':'polite'},'Pick legit or DGA for each domain, then reveal the answers.');
  const board=el('section',{className:'section-block'});
  let human=0;let answered=0;let model=0;let total=0;
  const score=el('p',{className:'metric-value'},'You 0/0 · Model —');
  async function deal(){
    board.replaceChildren(el('p',{className:'loading'},'Dealing a teaching round…'));
    try{
      const round=await get(`/game/sample?count=${Number(count.value)}&seed=${Number(seed.value)}`);
      human=0;answered=0;total=round.samples.length;
      model=Math.round(round.model_accuracy*total);
      score.textContent=`You 0/${total} · Model ${model}/${total} (${formatScore(round.model_accuracy)})`;
      const cards=round.samples.map((sample,index)=>{
        const domain=el('p',{className:'mono metric-value'},sample.domain);
        const pickLegit=el('button',{type:'button',className:'button button-small'},'Legit');
        const pickDga=el('button',{type:'button',className:'button button-small'},'DGA');
        const reveal=el('div',{className:'muted'},'Your call? (truth + model hidden until you pick)');
        const card=el('article',{className:'tile span-6'},[
          el('p',{className:'eyebrow'},`DOMAIN ${index+1} / ${total}`),domain,
          el('div',{className:'inline-actions'},[pickLegit,pickDga]),reveal,
        ]);
        const choose=(guess)=>{
          const ok=guess===sample.label;
          const modelOk=sample.model_verdict===sample.label;
          answered+=1;if(ok)human+=1;
          score.textContent=`You ${human}/${answered} · Model ${model}/${total} (${formatScore(round.model_accuracy)})`;
          pickLegit.disabled=true;pickDga.disabled=true;
          reveal.replaceChildren(
            el('div',{className:'inline-actions'},[verdictChip(`Truth: ${sample.label}`),verdictChip(`You: ${guess}`),verdictChip(`AI: ${sample.model_verdict}`)]),
            el('p',{className:'muted'},`You ${ok?'✓ correct':'✗ missed'} · Model ${modelOk?'✓':'✗'} · AI score ${formatScore(sample.model_probability)} · family ${sample.family}`),
          );
          if(answered===total)toast(`Round over: you ${human}/${total}, model ${model}/${total}.`,'success');
        };
        pickLegit.addEventListener('click',()=>choose('LEGITIMATE'));
        pickDga.addEventListener('click',()=>choose('DGA'));
        return card;
      });
      board.replaceChildren(el('div',{className:'bento-grid'},cards),el('p',{className:'note'},round.note));
      status.textContent='Round dealt. Dictionary-style DGAs fool humans most often — watch bluecloud47-style names.';
    }catch(error){board.replaceChildren();status.textContent=error.message;toast(error.message,'error')}
  }
  const dealBtn=button('Deal round',deal,'button button-primary neo');
  root.replaceChildren(el('section',{className:'tile hero-tile neo'},[
    el('div',{className:'app-title-row'},[el('div',{},[el('p',{className:'eyebrow'},'GAME / HUMAN VS AI'),el('h1',{},'Can you beat the model?')]),syntheticBadge()]),
    el('p',{className:'muted'},'Balanced local round: half presumed-legit, half generated DGA. Honest-play teaching game — answers live in the page by design.'),
    el('div',{className:'form-row'},[
      el('label',{className:'field'},[el('span',{className:'field-label'},'Seed'),seed]),
      el('label',{className:'field'},[el('span',{className:'field-label'},'Round size · 2-40'),count]),
    ]),el('div',{className:'inline-actions section-block'},[dealBtn,score]),
    status,
  ]),board);
}
