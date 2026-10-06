import {post} from './api.js';
import {el,badge,button,emptyState,formatScore,link,syntheticBadge,table,toast,verdictChip} from './ui.js';
import {makeChart} from './charts.js';

function parseDomains(text){
	const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(row=>row.split(',')[0].trim().replace(/^['"]|['"]$/g,'')).filter(Boolean);
	if(lines[0]?.toLowerCase()==='domain')lines.shift();
	const unique=[...new Set(lines)];
	if(unique.length>500)throw new Error('Batch limited to 500 unique domain strings.');
	return unique;
}

export function mount(root){
	let results=[];let sortKey='domain';let descending=false;let chart=null;
	const input=el('textarea',{className:'textarea',id:'batch-domains','aria-label':'Domains to scan','placeholder':'One domain per line, or comma-separated'});
	const file=el('input',{type:'file',accept:'.txt,.csv,text/plain,text/csv','aria-label':'Choose a text or CSV file'});
	const filter=el('input',{className:'input',type:'search',placeholder:'Filter returned domains','aria-label':'Filter batch results'});
	const output=el('section',{id:'batch-output',className:'section-block'});
	const progress=el('div',{className:'progress hidden','aria-label':'Batch processing'},el('i'));
	const chartCanvas=el('canvas',{role:'img','aria-label':'Synthetic-data batch verdict counts'});
	const chartHost=el('div',{className:'tile'},[
		el('div',{className:'section-head'},[el('h2',{},'Verdict mix'),syntheticBadge()]),
		el('div',{className:'chart-wrap'},chartCanvas),
	]);
	const renderRows=()=>{
		const query=filter.value.toLowerCase();
		const sorted=[...results].filter(row=>row.domain.toLowerCase().includes(query));
		sorted.sort((a,b)=>{
			const value=row=>sortKey==='family'?row.family.name:sortKey==='data'?'Synthetic data':row[sortKey];
			const left=value(a),right=value(b);
			const comparison=typeof left==='number'?left-right:String(left).localeCompare(String(right));
			return descending?-comparison:comparison;
		});
		const headers=['Domain','Verdict','DGA score','Risk','Family · approximate','Data'];
		const head=el('thead',{},el('tr',{},headers.map((label,index)=>{
			const keys=['domain','verdict','probability','risk','family','data'];
			const control=button(label,()=>{if(sortKey===keys[index])descending=!descending;else{sortKey=keys[index];descending=false}renderRows()},'button button-quiet');
			return el('th',{scope:'col'},control);
		})));
		const body=el('tbody',{},sorted.map(row=>el('tr',{},[
			el('td',{className:'mono'},row.domain),el('td',{},verdictChip(row.verdict)),
			el('td',{className:'mono'},formatScore(row.probability)),el('td',{},row.risk),
			el('td',{},row.family.name),el('td',{},syntheticBadge()),
		])));
		const tableView=el('div',{className:'table-scroll'},el('table',{className:'table'},[head,body]));
		root.querySelector('#batch-table').replaceChildren(tableView);
	};
	const updateChart=(summary)=>{
		if(chart){chart.destroy();chart=null}
		if(!globalThis.Chart)return;
		chart=makeChart(chartCanvas,'doughnut',{
			labels:['⚠ DGA','✓ LEGITIMATE'],datasets:[{data:[summary.dga,summary.legitimate],backgroundColor:['#EF4444','#22C55E'],borderColor:['#14161C','#14161C'],borderWidth:3}],
		},{plugins:{legend:{position:'bottom'}}});
	};
	const run=async()=>{
		try{
			const domains=parseDomains(input.value);
			if(!domains.length)throw new Error('Enter at least one domain.');
			progress.classList.remove('hidden');output.replaceChildren();
			root.querySelector('#batch-state').textContent=`Sending ${domains.length} domains…`;
			const response=await post('/predict/batch',{domains});
			results=response.results;progress.classList.add('hidden');
			root.querySelector('#batch-state').textContent=`${response.summary.total} scanned · ${response.summary.dga} DGA · ${response.summary.legitimate} legitimate`;
			root.querySelector('#batch-summary').replaceChildren(syntheticBadge());
			root.querySelector('#batch-table').replaceChildren();
			output.replaceChildren(el('div',{className:'bento-grid'},[
				el('article',{className:'tile span-4'},[el('div',{className:'section-head'},[el('h3',{},'Scanned'),syntheticBadge()]),el('strong',{className:'metric-value'},response.summary.total)]),
				el('article',{className:'tile span-4'},[el('div',{className:'section-head'},[el('h3',{},'DGA verdicts'),syntheticBadge()]),el('strong',{className:'metric-value'},response.summary.dga)]),
				el('article',{className:'tile span-4'},[el('div',{className:'section-head'},[el('h3',{},'Legitimate verdicts'),syntheticBadge()]),el('strong',{className:'metric-value'},response.summary.legitimate)]),
			]));
			updateChart(response.summary);renderRows();
		}catch(error){progress.classList.add('hidden');root.querySelector('#batch-state').textContent=error.message;toast(error.message,'error')}
	};
	const dropZone=el('div',{className:'tile section-block drop-zone'},[el('span',{className:'muted'},'Drop a .txt or .csv file here, or choose it above.')]);
	dropZone.addEventListener('dragover',event=>{event.preventDefault();dropZone.classList.add('drag-over')});
	dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
	dropZone.addEventListener('drop',async event=>{event.preventDefault();dropZone.classList.remove('drag-over');const dropped=event.dataTransfer.files[0];if(dropped){input.value=await dropped.text();run()}});
	file.addEventListener('change',async()=>{if(file.files[0])input.value=await file.files[0].text()});
	filter.addEventListener('input',renderRows);
	const card=el('section',{className:'tile hero-tile neo'},[
		el('div',{className:'app-title-row'},[el('div',{},[el('p',{className:'eyebrow'},'BATCH / MAX 500'),el('h1',{},'Scan a list')]),syntheticBadge()]),
		el('p',{className:'muted'},'Paste domain strings or drop a .txt/.csv file. Duplicate inputs are collapsed before submission.'),
		input,el('div',{className:'section-block'},[el('label',{className:'field'},[el('span',{className:'field-label'},'Load a file'),file])]),dropZone,
		el('div',{className:'inline-actions section-block'},[button('Scan list',run,'button button-primary neo'),link('Export CSV','/api/export?fmt=csv','button button-small button-primary neo'),link('Export JSON','/api/export?fmt=json','button button-small button-primary neo')]),
		progress,el('p',{id:'batch-state',className:'muted','aria-live':'polite'},'Ready.'),
	]);
	const resultTools=el('div',{className:'section-block'},[el('div',{className:'section-head'},[el('label',{className:'field'},[el('span',{className:'field-label'},'Filter results'),filter]),badge('Sort by selecting a column')]),chartHost,output,el('div',{id:'batch-summary'}),el('div',{id:'batch-table'})]);
	root.replaceChildren(card,resultTools);
}
