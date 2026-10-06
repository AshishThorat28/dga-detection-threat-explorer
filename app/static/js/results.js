import {get} from './api.js';
import {el,emptyState,formatScore,syntheticBadge,table} from './ui.js';
import {chartColors,makeChart} from './charts.js';

export async function mount(root){
	const pageTitle=el('section',{className:'tile hero-tile neo'},[
		el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'RESULTS / API DATA'),el('h1',{},'Evidence, with context')]),syntheticBadge()]),
		el('p',{className:'muted'},'Every metric on this page is read from GET /api/results. Results use synthetic data and are not production benchmarks.'),
	]);
	const output=el('section',{className:'section-block'},el('div',{className:'skeleton','aria-label':'Loading API results'}));
	root.replaceChildren(pageTitle,output);
	try{
		const result=await get('/results');
		if(!result.metrics?.length){output.replaceChildren(emptyState('No result artifacts are available.','Run python -m src.train to create the baseline result files.'));return}
		const metrics=result.metrics;
		const rows=metrics.map(row=>[row.model,formatScore(row.accuracy),formatScore(row.precision),formatScore(row.recall),formatScore(row.f1),formatScore(row.roc_auc),syntheticBadge()]);
		const canvas=el('canvas',{role:'img','aria-label':'Synthetic data model score comparison'});
		const chartTile=el('article',{className:'tile span-6'},[
			el('div',{className:'section-head'},[el('h2',{},'Model slot metrics'),syntheticBadge()]),el('div',{className:'chart-wrap'},canvas),
		]);
		const metricTable=el('article',{className:'tile span-6'},[
			el('div',{className:'section-head'},[el('h2',{},'Returned metrics'),syntheticBadge()]),
			table(['Model slot','Accuracy','Precision','Recall','F1','ROC-AUC','Data'],rows),
		]);
		output.replaceChildren(el('div',{className:'bento-grid'},[chartTile,metricTable]),el('p',{className:'note section-block'},result.message||'No additional result message was returned.'));
		makeChart(canvas,'bar',{
			labels:metrics.map(row=>row.model),
			datasets:[
				{label:'Accuracy',data:metrics.map(row=>row.accuracy),backgroundColor:'#0072B2'},
				{label:'Precision',data:metrics.map(row=>row.precision),backgroundColor:'#009E73'},
				{label:'Recall',data:metrics.map(row=>row.recall),backgroundColor:'#E69F00'},
				{label:'F1',data:metrics.map(row=>row.f1),backgroundColor:'#CC79A7'},
			],
		},{scales:{y:{min:0,max:1,ticks:{color:'var(--muted)'},grid:{color:'var(--border)'}},x:{ticks:{color:'var(--muted)'},grid:{color:'transparent'}}}});

		const extra=[];
		for(const [key,label] of [['per_family','Per-family counts'],['unseen_family_results','Unseen-family artifacts'],['robustness','Robustness artifacts']]){
			if(Array.isArray(result[key])&&result[key].length){
				extra.push(el('section',{className:'tile section-block'},[el('div',{className:'section-head'},[el('h2',{},label),syntheticBadge()]),el('pre',{className:'mono'},JSON.stringify(result[key],null,2))]));
			}else extra.push(el('section',{className:'empty-inline section-block'},`${label}: no saved artifact returned. Run python -m src.train to populate generated result files.`));
		}
		output.append(...extra);
	}catch{
		output.replaceChildren(emptyState('Results are unavailable.','Retry the API or run python -m src.train to create the local result artifacts.'));
	}
}
