import {initExplorer} from './explorer3d.js';
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const api=async(path,options={})=>{
	const response=await fetch('/api'+path,{headers:{'Content-Type':'application/json'},...options});
	if(!response.ok){const body=await response.json();throw new Error(typeof body.detail==='string'?body.detail:'Request failed')}
	return response.json();
};
const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
const percent=value=>`${(Number(value)*100).toFixed(1)}%`;
const metricCards=items=>items.map(([label,value])=>`<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('');

function showTab(name){
	$$('.tab').forEach(button=>{
		const selected=button.dataset.tab===name;
		button.classList.toggle('active',selected);
		button.setAttribute('aria-selected',String(selected));
	});
	$$('.panel').forEach(panel=>panel.classList.toggle('active',panel.id===name));
	if(name==='results')loadResults();
	if(name==='explorer')initExplorer();
}
$$('.tab').forEach(button=>button.onclick=()=>showTab(button.dataset.tab));
$$('.chips button').forEach(button=>button.onclick=()=>{$('#domain').value=button.dataset.example;analyze()});

function renderAttributions(explanation){
	const entries=explanation.attributions||[];
	const scale=Math.max(...entries.map(item=>Math.abs(item.contribution)),0.001);
	$('#xai-model').textContent=explanation.model;
	$('#xai-attributions').innerHTML=entries.map(item=>{
		const width=Math.max(2,Math.abs(item.contribution)/scale*100);
		const direction=item.contribution>=0?'toward-dga':'toward-legitimate';
		return `<div class="contribution-row"><span class="contribution-name">${esc(item.feature)}<small>${esc(item.source)}</small></span><span class="contribution-track ${direction}"><i style="width:${width}%"></i></span><b>${item.contribution>0?'+':''}${Number(item.contribution).toFixed(3)}</b></div>`;
	}).join('')||'<p class="muted">No non-zero features for this input.</p>';
	$('#xai-note').textContent=explanation.note;
	$('#xai-panel').classList.remove('hidden');
}

async function analyze(){
	const value=$('#domain').value.trim();
	if(!value)return;
	$('#status').textContent='Analyzing...';
	try{
		const result=await post('/predict',{domain:value});
		$('#result').classList.remove('hidden');
		$('#verdict').textContent=result.verdict;
		$('#verdict').style.color=result.verdict==='DGA'?'var(--bad)':'var(--good)';
		$('#risk').textContent=`${result.risk} RISK`;
		$('#probability').textContent=`${percent(result.probability)} consensus DGA probability`;
		$('#gauge-fill').style.width=percent(result.probability);
		$('#family-name').textContent=result.verdict==='DGA'?result.family.name:'No DGA family assigned';
		$('#family-score').textContent=result.verdict==='DGA'?`${percent(result.family.confidence)} family-classifier score · ${result.family.supported?'supported training family':'unresolved family'}`:'';
		$('#votes').innerHTML=Object.entries(result.models).map(([name,score])=>`<div class="vote"><span>${esc(name)}</span><span class="bar"><i style="width:${Math.max(0,Math.min(100,score*100))}%"></i></span><b>${percent(score)}</b></div>`).join('');
		$('#features').innerHTML=Object.entries(result.features).map(([name,score])=>`<span class="feature"><b>${esc(name.replaceAll('_',' '))}</b> ${Number(score).toFixed(2)}</span>`).join('');
		renderAttributions(result.explanation);
		$('#status').textContent=result.warnings.length?`Notices: ${result.warnings.join('; ')}`:'Analysis complete.';
	}catch(error){$('#status').textContent=error.message}
}
$('#analyze').onclick=analyze;
$('#domain').onkeydown=event=>{if(event.key==='Enter')analyze()};

$('#batch-run').onclick=async()=>{
	const domains=$('#batch-input').value.split(/[\n,]+/).map(value=>value.trim()).filter(Boolean).slice(0,500);
	if(!domains.length)return;
	try{
		const result=await post('/predict/batch',{domains});
		$('#batch-summary').textContent=`${result.summary.total} scanned · ${result.summary.dga} DGA · ${result.summary.legitimate} legitimate`;
		$('#batch-table').innerHTML=`<table class="table"><tr><th>Domain</th><th>Verdict</th><th>Probability</th><th>Family</th></tr>${result.results.map(row=>`<tr><td>${esc(row.domain)}</td><td>${esc(row.verdict)}</td><td>${percent(row.probability)}</td><td>${esc(row.family.name)}</td></tr>`).join('')}</table>`;
	}catch(error){$('#batch-summary').textContent=error.message}
};

$('#generate').onclick=async()=>{
	try{
		const result=await post('/generate',{algorithm:$('#algorithm').value,seed:Number($('#seed').value),date:$('#date').value,count:Number($('#count').value)});
		$('#formula').textContent=$('#algorithm').value==='lcg'?'x[n+1] = (a*x[n] + c) mod m':'same seed + same date = same list';
		$('#generated').innerHTML=result.domains.map(row=>`<div>${esc(row.domain)} · ${esc(row.verdict)} · ${esc(row.family.name)}</div>`).join('');
	}catch(error){$('#generated').textContent=error.message}
};

[['adv-length','adv-length-value',value=>value],['adv-randomness','adv-randomness-value',value=>Number(value).toFixed(2)],['adv-digit','adv-digit-value',value=>Number(value).toFixed(2)],['adv-vowel','adv-vowel-value',value=>Number(value).toFixed(2)]].forEach(([input,output,format])=>{
	$(`#${input}`).addEventListener('input',event=>{$(`#${output}`).textContent=format(event.target.value)});
});

$('#adv-run').onclick=async()=>{
	$('#adv-status').textContent='Mutating and scoring...';
	try{
		const result=await post('/adversarial',{
			domain:$('#adv-domain').value,length:Number($('#adv-length').value),
			randomness:Number($('#adv-randomness').value),digit_ratio:Number($('#adv-digit').value),
			vowel_ratio:Number($('#adv-vowel').value),meaningful_word:$('#adv-word').value,seed:42,
		});
		const original=result.original,modified=result.modified;
		$('#adv-output').classList.remove('hidden');
		$('#adv-summary').innerHTML=metricCards([
			['Original',`${original.verdict} · ${percent(original.probability)}`],
			['Modified',`${modified.verdict} · ${percent(modified.probability)}`],
			['Probability change',`${result.confidence_change>0?'+':''}${percent(result.confidence_change)}`],
		]);
		$('#adv-comparison').innerHTML=`<table class="table"><tr><th>State</th><th>Domain</th><th>Verdict</th><th>DGA probability</th><th>Family</th></tr><tr><td>Original</td><td>${esc(original.domain)}</td><td>${esc(original.verdict)}</td><td>${percent(original.probability)}</td><td>${esc(original.family.name)}</td></tr><tr><td>Modified</td><td>${esc(result.modified_domain)}</td><td>${esc(modified.verdict)}</td><td>${percent(modified.probability)}</td><td>${esc(modified.family.name)}</td></tr></table>`;
		const features=['length','entropy','vowel_ratio','digit_ratio','dictionary_coverage'];
		$('#adv-features').innerHTML=`<h3>Feature changes</h3><table class="table"><tr><th>Feature</th><th>Original</th><th>Modified</th><th>Change</th></tr>${features.map(name=>`<tr><td>${esc(name.replaceAll('_',' '))}</td><td>${Number(original.features[name]).toFixed(3)}</td><td>${Number(modified.features[name]).toFixed(3)}</td><td>${result.feature_changes[name]>0?'+':''}${Number(result.feature_changes[name]).toFixed(3)}</td></tr>`).join('')}</table>`;
		$('#adv-status').textContent='Mutation complete. Scores are model outputs, not calibrated probabilities.';
	}catch(error){$('#adv-status').textContent=error.message}
};

$('#sim-run').onclick=async()=>{
	$('#sim-status').textContent='Generating domains and scoring controls...';
	try{
		const result=await post('/simulate',{
			algorithm:$('#sim-algorithm').value,seed:Number($('#sim-seed').value),date:$('#sim-date').value,
			count:Number($('#sim-count').value),benign_count:Number($('#sim-benign').value),
		});
		$('#sim-output').classList.remove('hidden');
		$('#sim-summary').innerHTML=metricCards([
			['DGA domains generated',result.generated],['DGA alerts',result.detected_dgas],
			['False positives',result.false_positives],['False negatives',result.false_negatives],
			['Detection rate',percent(result.detection_rate)],['Processing time',`${result.processing_ms.toFixed(1)} ms`],
		]);
		$('#sim-results').innerHTML=`<table class="table"><tr><th>Domain</th><th>Known class</th><th>Prediction</th><th>DGA probability</th><th>Alert</th></tr>${result.results.map(row=>`<tr><td>${esc(row.domain)}</td><td>${esc(row.expected)}</td><td>${esc(row.verdict)}</td><td>${percent(row.probability)}</td><td>${row.alert?'YES':'NO'}</td></tr>`).join('')}</table><p class="note">${esc(result.note)}</p>`;
		$('#sim-status').textContent='Simulation complete.';
	}catch(error){$('#sim-status').textContent=error.message}
};

async function loadResults(){
	try{
		const result=await api('/results');
		const rows=result.metrics||[];
		$('#results-content').innerHTML=rows.length?`<table class="table"><tr><th>Model slot</th><th>Accuracy</th><th>Precision</th><th>Recall</th><th>F1</th><th>ROC-AUC</th></tr>${rows.map(row=>`<tr><td>${esc(row.model)}</td><td>${percent(row.accuracy)}</td><td>${percent(row.precision)}</td><td>${percent(row.recall)}</td><td>${percent(row.f1)}</td><td>${percent(row.roc_auc)}</td></tr>`).join('')}</table><p class="lede">${esc(result.message||'')}</p>`:`<p>${esc(result.message||'No model metrics are available.')}</p>`;
	}catch(error){$('#results-content').textContent=error.message}
}

$('#unseen-run').onclick=async()=>{
	$('#unseen-status').textContent='Running leave-one-family-out evaluations...';
	try{
		const result=await post('/experiments/unseen',{});
		$('#unseen-output').classList.remove('hidden');
		$('#unseen-summary').innerHTML=metricCards([
			['Known-family F1',percent(result.known_macro.f1)],
			['Unseen-family F1',percent(result.unseen_macro.f1)],
			['Generalization gap',`${result.generalization_gap>0?'+':''}${percent(result.generalization_gap)}`],
		]);
		const metrics=values=>`<td>${percent(values.accuracy)}</td><td>${percent(values.precision)}</td><td>${percent(values.recall)}</td><td>${percent(values.f1)}</td>`;
		$('#unseen-table').innerHTML=`<table class="table"><tr><th>Excluded family</th><th>DGA / benign controls</th><th colspan="4">Known split: accuracy / precision / recall / F1</th><th colspan="4">Unseen: accuracy / precision / recall / F1</th></tr>${result.per_family.map(row=>`<tr><td>${esc(row.unseen_family)}</td><td>${row.dga_samples} / ${row.benign_controls}</td>${metrics(row.known)}${metrics(row.unseen)}</tr>`).join('')}</table>`;
		$('#unseen-note').textContent=result.note;
		$('#unseen-status').textContent=`Completed ${result.per_family.length} family-held-out evaluations · ${result.per_family_size} synthetic samples per family.`;
	}catch(error){$('#unseen-status').textContent=error.message}
};

$('#theme').onclick=()=>{document.body.classList.toggle('light');localStorage.theme=document.body.classList.contains('light')?'light':'dark'};
if(localStorage.theme==='light')document.body.classList.add('light');
(async()=>{try{const health=await api('/health');$('#health').textContent=`API online · ${health.dataset_stats.domains} domains · ${health.models_loaded.length} model slots`}catch{$('#health').textContent='API unavailable'}})();
document.onkeydown=event=>{
	if(event.key==='/'&&!document.activeElement.matches('input,textarea,select')){event.preventDefault();$('#domain').focus()}
	if(event.key==='Escape')$('#domain').value='';
	if(/^[1-7]$/.test(event.key))showTab(['detect','batch','explorer','lab','adversarial','simulation','results'][Number(event.key)-1]);
};
