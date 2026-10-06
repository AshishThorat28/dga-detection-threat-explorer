import {toast} from './ui.js';

const samples=[];

function setApiState(state,label){
	const pill=document.querySelector('#api-pill');
	const banner=document.querySelector('#api-banner');
	if(pill){pill.dataset.state=state;const text=pill.querySelector('span');if(text)text.textContent=label}
	if(banner)banner.hidden=state!=='offline';
}

function detailMessage(body){
	if(typeof body?.detail==='string')return body.detail;
	if(Array.isArray(body?.detail))return body.detail.map(item=>`${(item.loc||[]).slice(1).join('.')||'request'}: ${item.msg||'invalid value'}`).join('; ');
	return 'The API could not complete that request.';
}

export async function request(path,options={}){
	const started=performance.now();
	const {silent=false,...fetchOptions}=options;
	try{
		const response=await fetch(`/api${path}`,{
			...fetchOptions,
			headers:{...(fetchOptions.body?{'Content-Type':'application/json'}:{}),...(fetchOptions.headers||{})},
		});
		samples.push(performance.now()-started);
		if(samples.length>100)samples.shift();
		setApiState('online','API online');
		if(!response.ok){
			let body={};try{body=await response.json()}catch{}
			const message=detailMessage(body);
			if(!silent)toast(message,'error');
			throw new Error(message);
		}
		const contentType=response.headers.get('content-type')||'';
		return contentType.includes('application/json')?response.json():response;
	}catch(error){
		if(error instanceof TypeError){setApiState('offline','API offline');if(!silent)toast('The local API is unreachable. Start the FastAPI server and retry.','error')}
		throw error;
	}
}

export const get=path=>request(path);
export const post=(path,body)=>request(path,{method:'POST',body:JSON.stringify(body)});

export async function checkHealth(){
	setApiState('checking','Checking API');
	try{return await request('/health',{silent:true})}
	catch{setApiState('offline','API offline');return null}
}

export function latencySummary(){
	if(!samples.length)return null;
	const sorted=[...samples].sort((a,b)=>a-b);
	const percentile=value=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*value)-1)]);
	return {count:sorted.length,p50:percentile(.5),p95:percentile(.95)};
}

export function apiState(state,label){setApiState(state,label)}
