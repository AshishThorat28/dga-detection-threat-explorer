import {get,post} from './api.js';
import {el,badge,button,emptyState,formatScore,link,syntheticBadge,table,toast,verdictChip} from './ui.js';

const featureHelp={
	length:'Character count used by the lexical feature extractor.',
	entropy:'Shannon entropy over characters; higher values indicate a more varied string.',
	vowel_ratio:'Fraction of letters in the registrable label that are vowels.',
	consonant_ratio:'Fraction of letters in the registrable label that are consonants.',
	digit_ratio:'Fraction of characters in the registrable label that are digits.',
	hyphen_count:'Number of hyphens in the registrable label.',
	longest_consonant_run:'Longest uninterrupted consonant run in the label.',
	unique_ratio:'Fraction of distinct characters in the label.',
	dictionary_coverage:'Share of label words matching the small built-in vocabulary.',
	tld_length:'Number of characters in the top-level domain.',
};
const samples=[['github.com','legit-looking'],['qzv8xk2m1p9r.com','random-looking DGA'],['bluecloud47.org','dictionary-style'],['a.co','short domain']];
let lastDomain='';let lastPrediction=null;let history=[];

function contributionPanel(data){
	const values=data.attributions||[];
	if(!values.length)return emptyState('No local attribution values returned.','Try another domain.');
	const max=Math.max(...values.map(item=>Math.abs(item.contribution)),.001);
	const rows=values.map(item=>[
		el('span',{className:'contribution-feature'},[el('strong',{},item.feature),el('small',{className:'muted'},item.source)]),
		el('span',{className:'contribution-meter'},[
			el('span',{},item.direction),
			el('span',{className:`contribution-bar ${item.contribution<0?'negative':''}`},el('i',{style:`width:${Math.max(2,Math.abs(item.contribution)/max*100)}%`}))
		]),
		el('span',{className:'mono'},`${item.contribution>0?'+':''}${Number(item.contribution).toFixed(3)}`),
	]);
	return el('div',{},[table(['Feature / source','Direction','LR logit contribution'],rows),el('p',{className:'note'},'This additive breakdown explains the LR logit only; it does not decompose the ensemble DGA score.')]);
}

function predictionPanel(result,explanation){
	const isDga=result.verdict==='DGA';
	const modelSlots=Object.entries(result.models).map(([name,value])=>{
		const slot=el('div',{className:'model-slot'},[
			el('strong',{className:'mono'},name),
			el('span',{className:'meter'},el('i',{style:`width:${Math.max(0,Math.min(100,value*100))}%`})),
			el('span',{className:'mono'},formatScore(value)),
		]);
		return slot;
	});
	const info=el('button',{type:'button',className:'button button-small',title:'The active ensemble averages one logistic regression model and one random forest. Scores are synthetic-data outputs.', 'aria-label':'Model slot information'},'ⓘ');
	const signals=Object.entries(result.features).map(([name,value])=>[
		el('span',{title:featureHelp[name]||name},name.replaceAll('_',' ')),el('span',{className:'mono'},Number(value).toFixed(3)),
	]);
	const explanationTile=el('article',{className:'tile span-12'},[
		el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'WHY / LOCAL MODEL EVIDENCE'),el('h2',{},'LR logit contributions')]),syntheticBadge()]),
		contributionPanel(explanation),
	]);
	const family=result.verdict==='DGA'?el('div',{className:'tile span-4'},[
		el('div',{className:'section-head'},[el('h3',{},'Likely family'),badge('Approximate','badge-approx')]),
		el('p',{className:'metric-value'},result.family.name),el('p',{className:'muted'},`Family score ${formatScore(result.family.confidence)} · ${result.family.supported?'supported label':'outside supported labels'}`),
	]):el('div',{className:'tile span-4'},[el('h3',{},'Family identification'),el('p',{className:'muted'},'No DGA family is assigned to a legitimate verdict.')]);
	const lookalike=result.typosquat&&result.typosquat.flagged?el('article',{className:'tile span-12'},[
		el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'LOOKALIKE / TYPO CHECK'),el('h2',{},`Possible lookalike of ${result.typosquat.brand}`)]),badge('Lookalike','badge-approx')]),
		el('p',{},`⚠ ${result.typosquat.reason} (distance ${result.typosquat.distance}). DGA verdict stays ${result.verdict} — this is a separate phishing-style warning.`),
	]):null;
	return el('div',{className:'bento-grid section-block'},[
		el('article',{className:'tile span-8'},[
			el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'CLASSIFICATION'),el('h2',{},result.domain)]),syntheticBadge()]),
			el('div',{className:'inline-actions'},[verdictChip(result.verdict),syntheticBadge(),badge(`${result.risk} risk`)]),
			el('div',{className:'section-head section-block'},[el('strong',{},'DGA score'),el('strong',{className:'mono'},formatScore(result.probability))]),
			el('div',{className:'score-gauge',role:'meter','aria-label':'DGA score','aria-valuemin':'0','aria-valuemax':'100','aria-valuenow':String(Math.round(result.probability*100))},el('i',{style:`width:${result.probability*100}%`})),
			el('p',{className:'note'},'The DGA score is a ranking signal, not evidence that a domain is malicious.'),
		]),
		el('article',{className:'tile span-8'},[
			el('div',{className:'section-head'},[el('h3',{},'Model slots'),info,syntheticBadge()]),
			...modelSlots,
		]),family,
		el('article',{className:'tile span-8'},[
			el('div',{className:'section-head'},[el('h3',{},'Lexical features'),syntheticBadge()]),
			...signals.map(([label,value])=>el('div',{className:'feature-row'},[label,value])),
			result.warnings.length?el('p',{className:'note'},`Notices: ${result.warnings.join('; ')}`):el('p',{className:'note'},'No input notices.'),
		]),
		...(lookalike?[lookalike]:[]),
		explanationTile,
	]);
}

async function showRobustness(root,domain){
	const host=root.querySelector('#robustness');
	host.replaceChildren(el('p',{className:'loading'},'Loading robustness variants…'));
	try{
		const data=await post('/robustness',{domain});
		host.replaceChildren(el('div',{className:'section-head'},[el('h2',{},'Built-in robustness variants'),syntheticBadge()]));
		const grid=el('div',{className:'three-col'});
		for(const row of data.results){
			grid.append(el('article',{className:'tile'},[
				el('h3',{},row.variant),el('p',{className:'mono'},row.domain),verdictChip(row.verdict),syntheticBadge(),
				el('p',{className:'metric-value'},`DGA score ${formatScore(row.probability)}`),
			]));
		}
		host.append(grid);
	}catch{host.replaceChildren(emptyState('Robustness variants unavailable.','Retry after the local API responds.'))}
}

async function showPointLink(root,domain){
	const host=root.querySelector('#point-link');
	try{
		const points=await get('/points');
		const found=Array.isArray(points)&&points.some(point=>point.domain===domain);
		if(found)host.replaceChildren(link('Locate matching point in 3D →','#/app/explorer?d='+encodeURIComponent(domain),'button button-quiet'));
	}catch{}
}

async function analyze(root,value){
	const results=root.querySelector('#detect-result');
	results.replaceChildren(el('div',{className:'skeleton','aria-label':'Loading analysis'}));
	try{
		const prediction=await post('/predict',{domain:value});
		const explanation=await post('/explain',{domain:value});
		lastDomain=prediction.domain;lastPrediction=prediction;
		history.unshift({domain:prediction.domain,verdict:prediction.verdict,score:prediction.probability});history=history.slice(0,12);
		results.replaceChildren(predictionPanel(prediction,explanation));
		root.querySelector('#detect-status').textContent='Analysis complete. Review the returned model evidence.';
		root.querySelector('#robustness').replaceChildren();
		root.querySelector('#run-robustness').disabled=false;
		await showPointLink(root,prediction.domain);
		renderHistory(root);
	}catch(error){results.replaceChildren(emptyState('Analysis did not complete.',error.message));root.querySelector('#detect-status').textContent='Check the domain and API status.'}
}

function renderHistory(root){
	const host=root.querySelector('#detect-history');
	host.replaceChildren(el('div',{className:'section-head'},[
		el('h2',{},'This-page session history'),
		el('div',{className:'inline-actions'},[
			link('Export CSV','/api/export?fmt=csv','button button-small button-primary neo'),
			link('Export JSON','/api/export?fmt=json','button button-small button-primary neo'),
			button('Clear',()=>{history=[];renderHistory(root)},'button button-small button-quiet'),
		]),
	]));
	if(!history.length){host.append(el('p',{className:'muted'},'Predictions from this page remain in memory until you leave or clear the list.'));return}
	host.append(table(['Domain','Verdict','DGA score','Action'],history.map(row=>[
		el('span',{className:'mono'},row.domain),verdictChip(row.verdict),el('span',{className:'mono'},formatScore(row.score)),button('Re-run',()=>{root.querySelector('[data-domain-input]').value=row.domain;analyze(root,row.domain)},'button button-small'),
	])));
}

export async function mount(root,context={}){
	const input=el('input',{className:'input',id:'detect-domain','data-domain-input':'true',placeholder:'example.com','autocomplete':'off','aria-label':'Domain to analyze'});
	const form=el('form',{className:'inline-actions'},[input,button('Analyze',event=>{event.preventDefault();analyze(root,input.value.trim())},'button button-primary neo')]);
	form.addEventListener('submit',event=>{event.preventDefault();analyze(root,input.value.trim())});
	const examples=el('div',{className:'inline-actions'});
	for(const [domain,label] of samples)examples.append(button(`${label} · ${domain}`,()=>{input.value=domain;analyze(root,domain)},'button button-quiet'));
	const card=el('section',{className:'tile hero-tile neo'},[
		el('div',{className:'app-title-row'},[el('div',{},[el('p',{className:'eyebrow'},'DETECT / DOMAIN STRING'),el('h1',{},'Inspect one domain')]),syntheticBadge()]),
		el('p',{className:'muted'},'Binary screening, approximate family output and local model evidence.'),form,examples,el('p',{id:'detect-status',className:'muted','aria-live':'polite'},'Ready for a domain.'),
	]);
	const resultHost=el('div',{id:'detect-result'});
	const robustnessButton=button('Run robustness variants',()=>lastDomain&&showRobustness(root,lastDomain),'button button-primary neo');
	robustnessButton.id='run-robustness';robustnessButton.disabled=true;
	const tools=el('section',{className:'section-block'},[
		el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'SECONDARY ANALYSIS'),el('h2',{},'String perturbation check')]),syntheticBadge()]),
		el('p',{className:'muted'},'The built-in variants append a word, insert a hyphen, or lengthen the label.'),
		robustnessButton,
		el('div',{id:'robustness',className:'section-block'}),el('div',{id:'point-link',className:'section-block'}),
	]);
	const historyHost=el('section',{id:'detect-history',className:'section-block'});
	root.replaceChildren(card,resultHost,tools,historyHost);
	root.querySelector('#run-robustness').disabled=true;
	renderHistory(root);
	input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();analyze(root,input.value.trim())}});
	const deepLink=context.query?.get('d');if(deepLink){input.value=deepLink;analyze(root,deepLink)}
	else if(lastPrediction){input.value=lastPrediction.domain}
}
