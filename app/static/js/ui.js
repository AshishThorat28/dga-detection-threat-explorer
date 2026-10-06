export function el(tag,options={},children=[]){
	const element=document.createElement(tag);
	for(const [key,value] of Object.entries(options||{})){
		if(value===undefined||value===null)continue;
		if(key==='text')element.textContent=String(value);
		else if(key==='className')element.className=value;
		else if(key==='value')element.value=value;
		else if(key==='checked')element.checked=Boolean(value);
		else if(key==='selected')element.selected=Boolean(value);
		else if(key.startsWith('on')&&typeof value==='function')element.addEventListener(key.slice(2).toLowerCase(),value);
		else element.setAttribute(key,String(value));
	}
	const items=Array.isArray(children)?children:[children];
	for(const child of items.flat(Infinity)){
		if(child instanceof Node)element.append(child);
		else if(child!==undefined&&child!==null)element.append(document.createTextNode(String(child)));
	}
	return element;
}

export function badge(text,kind=''){
	return el('span',{className:`badge ${kind}`},text);
}

export const syntheticBadge=()=>badge('Synthetic data','badge-synthetic');
export const prototypeBadge=()=>badge('Educational research prototype','badge-prototype');
export const approximateBadge=()=>badge('Approximate','badge-approx');

export function button(text,handler,className='button'){
	return el('button',{type:'button',className,text,onClick:handler});
}

export function link(text,href,className=''){
	return el('a',{href,className},text);
}

export function tile(title,content,className=''){
	return el('article',{className:`tile ${className}`},[
		el('h2',{},title),
		...(Array.isArray(content)?content:[content]),
	]);
}

export function verdictChip(verdict){
	const legitimate=verdict==='LEGITIMATE';
	const icon=el('span',{'aria-hidden':'true'},legitimate?'✓':'⚠');
	return el('span',{className:`verdict ${legitimate?'verdict-legitimate':'verdict-dga'}`},[icon,verdict]);
}

export function emptyState(title,description,action){
	const content=[el('strong',{},title),el('p',{className:'muted'},description)];
	if(action)content.push(action);
	return el('div',{className:'empty-state'},content);
}

export function toast(message,type='info'){
	const host=document.querySelector('#toast-stack');
	if(!host)return;
	const item=el('div',{className:'toast',role:'status','data-type':type},message);
	host.append(item);
	window.setTimeout(()=>item.remove(),5200);
}

export function table(headers,rows){
	const head=el('thead',{},el('tr',{},headers.map(header=>el('th',{scope:'col'},header))));
	const body=el('tbody',{},rows.map(row=>el('tr',{},row.map(cell=>el('td',{},cell)))));
	return el('div',{className:'table-scroll'},el('table',{className:'table'},[head,body]));
}

export function formatScore(value){return `${(Number(value)*100).toFixed(1)}%`}

export function copyButton(text){
	const control=button('Copy',async()=>{
		try{await navigator.clipboard.writeText(text);toast('Copied to clipboard.','success')}
		catch{toast('Clipboard access is unavailable in this browser.','error')}
	},'button button-small copy-button');
	control.setAttribute('aria-label','Copy code sample');
	return control;
}

export function codeBlock(code,language='text'){
	const pre=el('pre',{'data-language':language},el('code',{},code));
	const box=el('div',{className:'code-block'},[copyButton(code),pre]);
	return box;
}
