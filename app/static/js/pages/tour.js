const steps=[
  ['A local research prototype','The default pipeline creates a small synthetic dataset; outputs are teaching results, not production telemetry.'],
  ['Inspect the evidence','Detect shows model slots, lexical features and local LR-logit attributions. The family score is approximate.'],
  ['Test, then read the limits','Try the DGA, mutation and simulation labs. Scores are approximate and domains are never contacted.'],
];

export function startTour(){
  const dialog=document.querySelector('#tour-dialog');
  if(!dialog||dialog.open)return;
  let index=0;
  const title=dialog.querySelector('#tour-title');
  const copy=dialog.querySelector('#tour-copy');
  const count=dialog.querySelector('#tour-count');
  const next=dialog.querySelector('#tour-next');
  const finish=()=>{localStorage.setItem('dga-tour-complete','1');dialog.close()};
  const draw=()=>{
    count.textContent=String(index+1).padStart(2,'0');
    title.textContent=steps[index][0];copy.textContent=steps[index][1];
    next.textContent=index===steps.length-1?'Finish':'Next';
  };
  dialog.querySelector('#tour-dismiss').onclick=finish;
  next.onclick=()=>{if(index<steps.length-1){index+=1;draw()}else finish()};
  draw();dialog.showModal();
}