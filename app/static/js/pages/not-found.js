import {el,link} from '../ui.js';

export function mount(root){
  root.replaceChildren(el('section',{className:'tile hero-tile neo'},[
    el('p',{className:'eyebrow'},'404 / NOT FOUND'),el('h1',{},'This route is not in the map.'),
    el('p',{className:'muted'},'Use the main navigation or return to the project overview.'),
    el('div',{className:'inline-actions'},[link('Go home','#/home','button button-primary neo'),link('Open Detect','#/app/detect','button button-quiet')]),
  ]));
}