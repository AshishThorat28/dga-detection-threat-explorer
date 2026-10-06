import {el,badge,link,syntheticBadge} from '../ui.js';

function section(title,items){return el('section',{className:'tile section-block'},[el('h2',{},title),...items.map(([heading,copy])=>el('div',{className:'section-block'},[el('h3',{},heading),el('p',{className:'muted'},copy)]))])}

export function mount(root){
  const intro=el('section',{className:'tile hero-tile neo'},[
    el('div',{className:'inline-actions'},[badge('Educational research prototype','badge-prototype'),syntheticBadge()]),
    el('p',{className:'eyebrow'},'ABOUT / TRUST'),el('h1',{},'A teaching instrument, not a security boundary.'),
    el('p',{className:'muted'},'This project demonstrates string-based DGA detection and experiment design. Treat every score and family label as an approximate research output.'),
  ]);
  const limits=section('Limitations',[
    ['Synthetic data only','The default pipeline constructs eight synthetic DGA-like families and a small benign vocabulary with seed 42. The metrics do not represent production generalization.'],
    ['DGA score limits','The score is a mean of model-slot outputs, not evidence that a domain is malicious. The XAI panel explains the LR logit, not the ensemble score.'],
    ['Family prediction is approximate','The family classifier is separate from binary detection and only describes families represented in its synthetic training set.'],
    ['Projection is deterministic','3D coordinates come from a deterministic character projection, not a learned embedding. Axis values have no semantic meaning.'],
  ]);
  const privacy=section('Privacy and safe use',[
    ['Local processing','The application does not send domains to third-party analysis services. DGA generators produce strings and do not resolve, contact, or register them.'],
    ['In-memory scan history','The server keeps the export history in process memory. It resets when the service restarts; exported files are the user’s responsibility.'],
    ['Deployment boundary','The development server binds to loopback. Do not expose it publicly without authentication, network controls, and deployment hardening.'],
  ]);
  const references=section('References',[
    ['LSTM DGA detection','J. Woodbridge, H. S. Anderson, A. Ahuja, and D. Grant, “Predicting Domain Generation Algorithms with Long Short-Term Memory Networks,” arXiv:1611.00791, 2016.'],
    ['Reuse permissions','No license is set in this repository. Standard copyright applies; reuse permission has not been granted.'],
  ]);
  root.replaceChildren(intro,limits,privacy,references,el('div',{className:'inline-actions section-block'},[link('Read methodology','#/docs?section=methodology','button button-quiet'),link('Open API status','#/status','button button-quiet')]));
}