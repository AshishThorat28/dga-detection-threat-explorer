let mounted=false;
export async function initExplorer(){
	if(mounted)return;
	const host=document.querySelector('#scene');
	try{
		const THREE=await import('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js');
		const points=await fetch('/api/points').then(response=>response.json());
		const scene=new THREE.Scene(); scene.background=new THREE.Color(0x0a1012);
		const camera=new THREE.PerspectiveCamera(55,host.clientWidth/host.clientHeight,.1,100); camera.position.z=3.4;
		const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(host.clientWidth,host.clientHeight); host.replaceChildren(renderer.domElement);
		const positions=new Float32Array(points.flatMap(point=>[point.x,point.y,point.z]));
		const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
		const material=new THREE.PointsMaterial({color:0x75cbd0,size:.035,transparent:true,opacity:.82}); const cloud=new THREE.Points(geometry,material); scene.add(cloud);
		const animate=()=>{requestAnimationFrame(animate);cloud.rotation.y+=.0015;renderer.render(scene,camera)}; animate(); mounted=true;
	}catch(error){host.querySelector('.scene-note').textContent='3D library unavailable. Run with network access to cdnjs.'}
}
