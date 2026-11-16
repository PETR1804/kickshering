import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { steps } from './marker-config.js';

const live = location.pathname.endsWith('/live.html');
const room = new URLSearchParams(location.search).get('room') || 'demo';
const endpoint = '/api/pose?room=' + encodeURIComponent(room);
const pane = document.querySelector('#viewport');
const status = document.querySelector('#viewerStatus');
const legend = document.querySelector('#legend');

async function mountViewer() {
  const response = await fetch('./anchors.json');
  if (!response.ok) throw new Error('Не удалось загрузить метки.');
  const data = await response.json();
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const camera = new THREE.PerspectiveCamera(37, 1, .01, 100);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(live ? 0xe9e9e9 : 0x17191e);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  pane.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = !live;
  controls.minDistance = 1.5;
  controls.maxDistance = 7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x596273, 2));
  for (const [x, y, z, power] of [[-2, 4, 4, 2.3], [3, 2, -3, 1.6]]) {
    const light = new THREE.DirectionalLight(0xffffff, power);
    light.position.set(x, y, z);
    scene.add(light);
  }

  const loader = new GLTFLoader();
  const { scene: scooter } = await loader.loadAsync('./' + data.model);
  scene.add(scooter);
  const bounds = new THREE.Box3().setFromObject(scooter);
  const center = bounds.getCenter(new THREE.Vector3());
  const dimensions = bounds.getSize(new THREE.Vector3());
  const cameraOffset = new THREE.Vector3(.75, .52, 2.8);
  const resize = () => {
    const { clientWidth: width, clientHeight: height } = pane;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(cameraOffset, Math.max(dimensions.y * .83, dimensions.x / Math.max(camera.aspect, .5) * .8));
  controls.update();

  const sphere = new THREE.SphereGeometry(.019, 16, 12);
  const anchors = new Map(data.anchors.map(anchor => [anchor.id, anchor]));
  const markers = steps.map(step => {
    const marker = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({
      color: step.color, depthTest: false, toneMapped: false
    }));
    marker.renderOrder = 10;
    marker.position.fromArray(anchors.get(step.id).position);
    scene.add(marker);
    const button = document.createElement('button');
    button.className = 'button';
    button.type = 'button';
    button.textContent = step.title;
    button.style.setProperty('--mark-color', step.color);
    button.setAttribute('aria-pressed', 'true');
    legend.append(button);
    const setVisible = visible => {
      marker.visible = visible;
      button.setAttribute('aria-pressed', visible);
    };
    button.addEventListener('click', () => setVisible(!marker.visible));
    return { marker, setVisible };
  });
  const toggle = document.createElement('button');
  toggle.className = 'button';
  toggle.type = 'button';
  toggle.textContent = 'Скрыть / показать все';
  toggle.addEventListener('click', () => {
    const show = markers.every(({ marker }) => !marker.visible);
    markers.forEach(({ setVisible }) => setVisible(show));
  });
  legend.append(toggle);
  legend.parentElement.hidden = live;
  if (live) markers.forEach(({ setVisible }) => setVisible(false));
  let publishing = false, lastPublish = 0;
  if (live) {
    const select = document.querySelector('#editAnchor');
    for (const anchor of data.anchors) {
      const option=document.createElement('option'); option.value=anchor.id; option.textContent=anchor.name; select.append(option);
    }
    select.addEventListener('change',()=>markers.forEach(({marker,setVisible},i)=>setVisible(steps[i].id===select.value)));
    renderer.domElement.addEventListener('dblclick',event=>{
      if(!select.value) return;
      const rect=renderer.domElement.getBoundingClientRect();
      const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
      const ray=new THREE.Raycaster(); ray.setFromCamera(pointer,camera);
      const hit=ray.intersectObject(scooter,true)[0];
      if(hit) {
        anchors.get(select.value).position=hit.point.toArray();
        const i=steps.findIndex(step=>step.id===select.value); markers[i].marker.position.copy(hit.point);
      }
    });
    document.querySelector('#saveAnchors').addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='anchors.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    const layout = await (await fetch('./target-layout.json')).json();
    const img = new Image(); img.src = './assets/scooter-target.png'; await img.decode();
    for (const corners of Object.values(layout.tags)) {
      const [x,y] = corners[0]; const size = corners[1][0]-x; const margin=15;
      const tag = document.createElement('canvas'); tag.className='tag';
      tag.width=tag.height=size+margin*2;
      tag.getContext('2d').drawImage(img,x-margin,y-margin,size+margin*2,size+margin*2,0,0,tag.width,tag.height);
      Object.assign(tag.style,{left:(x-margin)/1120*100+'%',top:(y-margin)/1000*100+'%',width:tag.width/1120*100+'%',height:tag.height/1000*100+'%'});
      document.querySelector('#board').append(tag);
    }
  }
  const publish = async () => {
    publishing=true;
    const points = {};
    for (const anchor of data.anchors) {
      const v = new THREE.Vector3().fromArray(anchor.position).project(camera);
      points[anchor.id]=[v.x/2,v.y*1000/2240];
    }
    // Grip coordinates in the same world space as anchors.json.
    for (const [id,pos] of Object.entries({leftGrip:[-.39,1.34,-.23],rightGrip:[-.39,1.34,.23]})) {
      const v = new THREE.Vector3().fromArray(pos).project(camera);
      points[id]=[v.x/2,v.y*1000/2240];
    }
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({anchors:points}),signal:AbortSignal.timeout(2500)});
      if (!response.ok) throw new Error();
      document.querySelector('#sync').textContent='3D-точки передаются · телефон: /ar.html?live=1';
    } catch { document.querySelector('#sync').textContent='Нет связи. Запусти python server.py вместо Live Server'; }
    finally { publishing=false; }
  };
  status.hidden = true;
  new ResizeObserver(resize).observe(pane);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
    if (live && !publishing && performance.now()-lastPublish>100) { lastPublish=performance.now(); publish(); }
  });
}

mountViewer().catch(error => {
  console.error(error);
  status.textContent = 'Не удалось открыть 3D-модель. Проверь WebGL и попробуй обновить страницу.';
});
