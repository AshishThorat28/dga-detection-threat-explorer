import {get} from './api.js';
import {el,badge,button,emptyState,syntheticBadge,toast} from './ui.js';
import {familyPalette} from './charts.js';

let disposePrevious=null;

function colorHex(THREE,value){return new THREE.Color(value)}

export async function mount(root,context={}){
	disposePrevious?.();
	root.replaceChildren(el('section',{className:'tile hero-tile neo'},[
		el('div',{className:'section-head'},[el('div',{},[el('p',{className:'eyebrow'},'APP / DETERMINISTIC PROJECTION'),el('h1',{},'3D character projection')]),syntheticBadge()]),
		el('p',{className:'muted'},'Each dot is a domain placed by a deterministic character projection. It is a teaching aid, not a learned embedding, and axis positions have no semantic meaning.'),
	]));
	let points;
	try{points=await get('/points')}catch{return}
	if(!Array.isArray(points)||!points.length){
		root.append(emptyState('No projection points are available.','Run python -m src.train to generate results/points3d.json.'));
		return;
	}
	const colorMode=el('select',{className:'select','aria-label':'Point colors'},[el('option',{value:'verdict'},'Color by verdict'),el('option',{value:'family'},'Color by family')]);
	const auto=el('input',{type:'checkbox',checked:true,'aria-label':'Auto rotate'});
	const flat=el('input',{type:'checkbox','aria-label':'2D projection'});
	const pointSize=el('input',{type:'range',min:'2',max:'12',step:'1',value:'6','aria-label':'Point size'});
	const opacity=el('input',{type:'range',min:'0.2',max:'1',step:'0.05',value:'0.82','aria-label':'Point opacity'});
	const search=el('input',{className:'input',placeholder:'Find exact domain','aria-label':'Find a domain in the projection'});
	const controls=el('div',{className:'bento-grid section-block'},[
		el('label',{className:'field tile span-3'},[el('span',{className:'field-label'},'Color mode'),colorMode]),
		el('label',{className:'field tile span-3'},[el('span',{className:'field-label'},'Point size'),pointSize]),
		el('label',{className:'field tile span-3'},[el('span',{className:'field-label'},'Opacity'),opacity]),
		el('label',{className:'tile span-3'},[auto,el('span',{},'Auto rotate')]),
		el('label',{className:'tile span-3'},[flat,el('span',{},'2D projection')]),
		el('label',{className:'field tile span-6'},[el('span',{className:'field-label'},'Search points'),search]),
		button('Reset camera',()=>{},'button button-quiet'),
	]);
	const sceneHost=el('section',{className:'explorer-scene section-block','aria-label':'Interactive point cloud'});
	const overlay=el('div',{className:'scene-overlay'},[
		button('How to read this',()=>help.hidden=!help.hidden,'button button-quiet'),
		el('div',{className:'legend','aria-label':'Point families'}),
	]);
	const help=el('aside',{className:'help-overlay hidden'},[
		el('strong',{},'How to read this'),el('p',{className:'muted'},'Coordinates are generated from a fixed character formula. They are not a learned embedding and do not encode semantic similarity.'),
	]);
	const tooltip=el('div',{className:'scene-tooltip',role:'status'});
	const pinned=el('aside',{className:'pinned-panel hidden','aria-live':'polite'});
	sceneHost.append(overlay,help,tooltip,pinned);
	const legend=overlay.querySelector('.legend');
	const families=[...new Set(points.map(point=>point.family))];
	const enabled=new Set(families);const enabledClasses=new Set([0,1]);
	function drawLegend(){
		legend.replaceChildren();
		const entries=colorMode.value==='verdict'
			?[['LEGITIMATE',0,familyPalette.benign,'✓'],['DGA',1,'#EF4444','⚠']]
			:families.map(family=>[family,family,familyPalette[family]||familyPalette.benign,'']);
		for(const [label,key,color,icon] of entries){
			const isEnabled=colorMode.value==='verdict'?enabledClasses.has(key):enabled.has(key);
			const toggle=el('button',{type:'button',className:'legend-item button button-quiet',title:`Double-click to isolate ${label}`,'aria-pressed':String(isEnabled)},[
				el('span',{className:'swatch',style:`background:${color}`,'aria-hidden':'true'}),icon?el('span',{'aria-hidden':'true'},icon):null,el('span',{},label),
			]);
			toggle.addEventListener('click',()=>{
				const selected=colorMode.value==='verdict'?enabledClasses:enabled;
				if(selected.has(key))selected.delete(key);else selected.add(key);
				drawLegend();applyFilters();
			});
			toggle.addEventListener('dblclick',()=>{
				const selected=colorMode.value==='verdict'?enabledClasses:enabled;
				selected.clear();selected.add(key);drawLegend();applyFilters();
			});
			legend.append(toggle);
		}
	}
	drawLegend();
	root.append(controls,sceneHost,el('p',{className:'note section-block'},'Pan: drag with Shift or right mouse button. Orbit: drag. Zoom: scroll. Click a point to pin its domain details.'));

	let THREE,renderer,animation=0,visible=true;
	try{THREE=await import('/static/vendor/three.module.js')}catch{return sceneHost.append(emptyState('The local 3D renderer could not load.','Check app/static/vendor/three.module.js and refresh.'))}
	try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}
	catch{return sceneHost.append(emptyState('WebGL is unavailable in this browser.','Use the family labels and API data from the other app views.'))}

	const scene=new THREE.Scene();
	const camera=new THREE.PerspectiveCamera(52,1,.1,100);let radius=3.6,targetRadius=3.6,theta=0,phi=1.25;
	let orbitX=0,orbitY=0,panX=0,panY=0;
	const target=new THREE.Vector3(0,0,0);const desiredTarget=target.clone();
	const group=new THREE.Group();scene.add(group);
	const geometry=new THREE.BufferGeometry();
	const bounds=['x','y','z'].map(axis=>({
		min:Math.min(...points.map(point=>point[axis])),max:Math.max(...points.map(point=>point[axis])),
	}));
	const projectPoint=point=>['x','y','z'].map((axis,index)=>{
		const {min,max}=bounds[index];return max===min?0:((point[axis]-min)/(max-min)-.5)*2;
	});
	const coordinates=new Float32Array(points.length*3);const colors=new Float32Array(points.length*3);
	points.forEach((point,index)=>{
		coordinates.set(projectPoint(point),index*3);
		const rgb=colorHex(THREE,familyPalette[point.family]||familyPalette.benign);colors.set([rgb.r,rgb.g,rgb.b],index*3);
	});
	geometry.setAttribute('position',new THREE.BufferAttribute(coordinates,3));
	geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
	const material=new THREE.PointsMaterial({size:Number(pointSize.value),vertexColors:true,transparent:true,opacity:Number(opacity.value),sizeAttenuation:false});
	const cloud=new THREE.Points(geometry,material);group.add(cloud);
	const grid=new THREE.GridHelper(4,12,0x364152,0x273244);grid.position.y=-1.1;group.add(grid);
	const axes=new THREE.AxesHelper(.25);group.add(axes);
	const raycaster=new THREE.Raycaster();raycaster.params.Points.threshold=.045;
	const pointer=new THREE.Vector2();let drag=null;let activePoint=null;
	renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
	renderer.domElement.setAttribute('aria-label','3D points for API-returned domains');
	renderer.domElement.setAttribute('role','img');sceneHost.prepend(renderer.domElement);
	const resize=()=>{const width=Math.max(sceneHost.clientWidth,1);const height=Math.max(sceneHost.clientHeight,1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix()};
	const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(sceneHost);resize();
	const setCamera=()=>{camera.position.set(target.x+radius*Math.sin(phi)*Math.sin(theta),target.y+radius*Math.cos(phi),target.z+radius*Math.sin(phi)*Math.cos(theta));camera.lookAt(target)};
	const familyVisible=point=>enabled.has(point.family)&&(colorMode.value!=='verdict'||enabledClasses.has(point.label));
	const applyFilters=()=>{
		const array=geometry.attributes.position.array;
		points.forEach((point,index)=>{const offset=index*3;const [x,y,z]=projectPoint(point);const show=familyVisible(point);array[offset]=show?x:9999;array[offset+1]=show?y:9999;array[offset+2]=show&&!flat.checked?z:0});
		geometry.attributes.position.needsUpdate=true;
		if(colorMode.value==='verdict'){
			points.forEach((point,index)=>{const color=point.label===0?familyPalette.benign:'#EF4444';const rgb=colorHex(THREE,color);colors.set([rgb.r,rgb.g,rgb.b],index*3)});
		}else points.forEach((point,index)=>{const rgb=colorHex(THREE,familyPalette[point.family]||familyPalette.benign);colors.set([rgb.r,rgb.g,rgb.b],index*3)});
		geometry.attributes.color.needsUpdate=true;
	};
	const projectPointer=event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);return raycaster.intersectObject(cloud)[0]};
	const showPoint=(point,x,y)=>{const verdict=point.label===0?'LEGITIMATE':'DGA';tooltip.replaceChildren(el('strong',{},point.domain||'Domain not provided'),el('br'),syntheticBadge(),verdictChip(verdict),el('span',{},point.family),verdict==='DGA'?badge('Approximate','badge-approx'):null);tooltip.style.display='block';tooltip.style.left=`${x+12}px`;tooltip.style.top=`${y+12}px`};
	const pinPoint=point=>{activePoint=point;pinned.replaceChildren(el('div',{className:'section-head'},[el('strong',{},point.domain||'Domain not provided'),button('Close',()=>pinned.classList.add('hidden'),'button button-small button-quiet')]),syntheticBadge(),el('p',{},`${point.family} · ${point.label===0?'LEGITIMATE':'DGA'}`));pinned.classList.remove('hidden')};
	renderer.domElement.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY,moved:false,pan:event.shiftKey||event.button===2};renderer.domElement.setPointerCapture(event.pointerId)});
	renderer.domElement.addEventListener('pointermove',event=>{
		if(drag){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.moved||=Math.abs(dx)+Math.abs(dy)>2;if(drag.pan){panX-=dx*.003*radius;panY+=dy*.003*radius}else{orbitX-=dx*.006;orbitY+=dy*.006}drag.x=event.clientX;drag.y=event.clientY;return}
		const hit=projectPointer(event);if(hit){const point=points[hit.index];if(point&&familyVisible(point))showPoint(point,event.offsetX,event.offsetY)}else tooltip.style.display='none';
	});
	renderer.domElement.addEventListener('pointerup',event=>{if(drag&&!drag.moved){const hit=projectPointer(event);if(hit&&points[hit.index])pinPoint(points[hit.index])}drag=null});
	renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
	renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();targetRadius=Math.max(1.4,Math.min(12,targetRadius+event.deltaY*.004))},{passive:false});
	pointSize.addEventListener('input',()=>material.size=Number(pointSize.value));
	opacity.addEventListener('input',()=>material.opacity=Number(opacity.value));
	colorMode.addEventListener('change',()=>{drawLegend();applyFilters()});flat.addEventListener('change',applyFilters);
	controls.querySelector('button').addEventListener('click',()=>{radius=targetRadius=3.6;theta=0;phi=1.25;orbitX=orbitY=panX=panY=0;target.set(0,0,0);desiredTarget.set(0,0,0);setCamera()});
	search.addEventListener('keydown',event=>{if(event.key==='Enter'){const point=points.find(item=>item.domain===search.value.trim());if(!point){toast('That exact domain is not present in the returned point set.','info');return}auto.checked=false;group.rotation.set(0,0,0);desiredTarget.set(...projectPoint(point));if(flat.checked)desiredTarget.z=0;pinPoint(point)}});
	setCamera();applyFilters();
	const observer=new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting)});observer.observe(sceneHost);
	let disposed=false;
	const animate=()=>{
		if(disposed||!sceneHost.isConnected)return;
		if(visible&&document.visibilityState==='visible'){
			theta+=orbitX;phi=Math.max(.15,Math.min(2.95,phi+orbitY));
			desiredTarget.x+=panX;desiredTarget.y+=panY;
			orbitX*=.82;orbitY*=.82;panX*=.82;panY*=.82;
			radius+=(targetRadius-radius)*.16;target.lerp(desiredTarget,.16);
			setCamera();if(auto.checked)group.rotation.y+=.001;renderer.render(scene,camera);
		}
		animation=requestAnimationFrame(animate);
	};animate();
	disposePrevious=()=>{disposed=true;cancelAnimationFrame(animation);observer.disconnect();resizeObserver.disconnect();renderer.dispose();geometry.dispose();material.dispose()};
	const deepDomain=context.query?.get('d');if(deepDomain){search.value=deepDomain;search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))}
}
