import {post} from './api.js';
import {el,badge,button,emptyState,formatScore,syntheticBadge,table,toast,verdictChip} from './ui.js';
import {makeChart} from './charts.js';

const algorithms={
	lcg:['LCG recurrence','x[n+1] = (a × x[n] + c) mod m; each state produces a character.'],
	md5:['Date-seeded MD5','MD5(seed + date + index)[:14] becomes a .net label.'],
	dictionary:['Dictionary concatenation','Seeded word-pair selection plus a two-digit suffix.'],
};

export function mount(root){
	const algorithm=el('select',{className:'select','aria-label':'DGA generator'},[
		el('option',{value:'lcg'},'LCG PRNG'),el('option',{value:'md5'},'Date-seeded MD5'),el('option',{value:'dictionary'},'Dictionary concatenation'),
	]);
	const seed=el('input',{className:'input',type:'number',min:'0',value:'42','aria-label':'Generator seed'});
	const date=el('input',{className:'input',type:'date',value:'2026-01-01','aria-label':'Generator date'});
	const count=el('input',{className:'input',type:'number',min:'1',max:'500',value:'12','aria-label':'Generated domain count'});
	const state=el('p',{className:'muted','aria-live':'polite'},'Ready.');
	const output=el('section',{className:'section-block'});
	const pseudo=el('article',{className:'tile'},[el('h2',{},algorithms.lcg[0]),el('p',{className:'mono'},algorithms.lcg[1])]);
	const drawFormula=()=>{const [title,description]=algorithms[algorithm.value];pseudo.replaceChildren(el('h2',{},title),el('p',{className:'mono'},description))};
	algorithm.addEventListener('change',drawFormula);
	const payload=()=>({algorithm:algorithm.value,seed:Number(seed.value),date:date.value,count:Number(count.value)});
	const renderGenerated=(host,response)=>{
		const misses=response.domains.filter(row=>row.verdict!=='DGA');
		const ring=el('canvas',{role:'img','aria-label':'Synthetic DGA samples flagged and missed'});
		host.replaceChildren(
			el('div',{className:'section-head'},[el('h2',{},'Detector response'),syntheticBadge()]),
			el('div',{className:'metric-strip'},[
				el('article',{className:'tile metric-tile'},[syntheticBadge(),el('strong',{className:'metric-value'},`${response.caught} / ${response.count}`),el('span',{className:'metric-caption'},'flagged as DGA')]),
				el('article',{className:'tile metric-tile'},[syntheticBadge(),el('strong',{className:'metric-value'},String(misses.length)),el('span',{className:'metric-caption'},'DGA samples not flagged')]),
			]),
			el('article',{className:'tile section-block'},[el('div',{className:'section-head'},[el('h2',{},'Detector rate'),syntheticBadge()]),el('div',{className:'chart-wrap'},ring)]),
			table(['Generated domain','Verdict','Data','DGA score','Family · approximate'],response.domains.map(row=>[
				el('span',{className:'mono'},row.domain),verdictChip(row.verdict),syntheticBadge(),el('span',{className:'mono'},formatScore(row.probability)),el('span',{},row.family.name),
			])),
			misses.length?el('p',{className:'note'},`Not flagged: ${misses.map(row=>row.domain).join(', ')}`):el('p',{className:'note'},'All generated samples were flagged in this run.'),
		);
		makeChart(ring,'doughnut',{labels:['Flagged','Not flagged'],datasets:[{data:[response.caught,misses.length],backgroundColor:['#22C55E','#EF4444'],borderColor:'#14161C',borderWidth:3}]},{plugins:{legend:{position:'bottom'}}});
	};
	const run=async()=>{
		state.textContent='Generating and scoring…';
		try{const result=await post('/generate',payload());renderGenerated(output,result);state.textContent='Generation complete. Strings were produced locally; no network activity occurred.'}
		catch(error){state.textContent=error.message;toast(error.message,'error')}
	};
	const comparison=el('div',{className:'two-col section-block'});
	const compare=async(diverge=false)=>{
		comparison.replaceChildren(el('div',{className:'skeleton','aria-label':'Comparing generated lists'}),el('div',{className:'skeleton','aria-label':'Comparing generated lists'}));
		try{
			const first=payload(),second={...first,seed:first.seed+(diverge?1:0)};
			const [operator,malware]=await Promise.all([post('/generate',first),post('/generate',second)]);
			const identical=operator.domains.every((row,index)=>row.domain===malware.domains[index]?.domain);
			comparison.replaceChildren(...[
				['Operator / seed A',operator],['Malware / seed B',malware],
			].map(([title,result])=>el('article',{className:'tile'},[
				el('div',{className:'section-head'},[el('h3',{},title),badge(`seed ${result.domains.length?title.endsWith('A')?first.seed:second.seed:'—'}`)]),
				...result.domains.map(row=>el('p',{className:'mono'},row.domain)),
			])));
			comparison.append(el('p',{className:'note span-12'},identical?'Same accepted parameters returned identical lists. Change the seed or date to intentionally diverge them.':'Different seed parameter returned a different deterministic list.'));
		}catch(error){comparison.replaceChildren(emptyState('The comparison could not run.',error.message))}
	};
	const form=el('div',{className:'form-row'},[
		el('label',{className:'field'},[el('span',{className:'field-label'},'Algorithm'),algorithm]),
		el('label',{className:'field'},[el('span',{className:'field-label'},'Seed'),seed]),
		el('label',{className:'field'},[el('span',{className:'field-label'},'Date'),date]),
		el('label',{className:'field'},[el('span',{className:'field-label'},'Count · max 500'),count]),
	]);
	root.replaceChildren(
		el('section',{className:'tile hero-tile neo'},[
			el('div',{className:'app-title-row'},[el('div',{},[el('p',{className:'eyebrow'},'DGA LAB / LOCAL GENERATORS'),el('h1',{},'Generate and inspect')]),syntheticBadge()]),
			el('p',{className:'muted'},'The implemented mechanisms return strings only; they do not resolve, contact, or register domains.'),form,
			el('div',{className:'inline-actions section-block'},[button('Generate and score',run,'button button-primary neo'),button('Compare deterministic runs',()=>compare(false),'button button-quiet'),button('Change operator seed',()=>compare(true),'button button-quiet')]),
			state,
		]),el('section',{className:'section-block bento-grid'},[pseudo,el('article',{className:'tile'},[el('h2',{},'Repeatability'),el('p',{className:'muted'},'Both sides call the same API with the same generator inputs. Repeating inputs should recreate the sequence.')])]),output,comparison,
	);
}
