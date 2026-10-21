/**
 * Browser UI: parameter form, live three.js preview, STL download.
 * Geometry is built in a web worker (see worker.js) so the page stays responsive.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARAM_GROUPS, PARAMS, DEFAULTS, PRESETS, normalizeParams } from './params.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1); // Z is up, like the printer

// ---------------------------------------------------------------- state
const state = { ...DEFAULTS, ...paramsFromUrl() };
let lastStats = null;
let lastParams = null;
let buildId = 0;
let pendingStl = null;

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

// ---------------------------------------------------------------- form
const form = document.getElementById('params');
const inputs = new Map();

for (const group of PARAM_GROUPS) {
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = group.label;
  fs.appendChild(legend);
  for (const p of group.params) {
    const row = document.createElement('div');
    row.className = 'param';
    const label = document.createElement('label');
    label.htmlFor = `p-${p.key}`;
    label.innerHTML = `${p.label}${p.unit ? `<span class="unit">${p.unit}</span>` : ''}`;
    row.appendChild(label);
    if (p.type === 'select') {
      const sel = document.createElement('select');
      sel.id = `p-${p.key}`;
      for (const o of p.options) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        sel.appendChild(opt);
      }
      sel.value = state[p.key];
      sel.addEventListener('change', () => setParam(p.key, sel.value));
      row.appendChild(sel);
      inputs.set(p.key, { set: (v) => { sel.value = v; } });
    } else {
      const range = document.createElement('input');
      range.type = 'range'; range.min = p.min; range.max = p.max; range.step = p.step; range.value = state[p.key];
      const num = document.createElement('input');
      num.type = 'number'; num.id = `p-${p.key}`; num.min = p.min; num.max = p.max; num.step = p.step; num.value = state[p.key];
      range.addEventListener('input', () => { num.value = range.value; setParam(p.key, parseFloat(range.value)); });
      num.addEventListener('change', () => { range.value = num.value; setParam(p.key, parseFloat(num.value)); });
      row.appendChild(range);
      row.appendChild(num);
      inputs.set(p.key, { set: (v) => { range.value = v; num.value = v; } });
    }
    if (p.help) {
      const help = document.createElement('div');
      help.className = 'help';
      help.textContent = p.help;
      row.appendChild(help);
    }
    fs.appendChild(row);
  }
  form.appendChild(fs);
}

const presetSel = document.getElementById('preset');
for (const name of Object.keys(PRESETS)) {
  const opt = document.createElement('option');
  opt.value = name; opt.textContent = name;
  presetSel.appendChild(opt);
}
for (const ev of ['change', 'input']) presetSel.addEventListener(ev, () => applyParams({ ...DEFAULTS, ...PRESETS[presetSel.value] }));
document.getElementById('reset').addEventListener('click', () => { presetSel.value = Object.keys(PRESETS)[0]; applyParams({ ...DEFAULTS }); });

function setParam(key, value) {
  state[key] = value;
  refreshVisibility();
  scheduleBuild();
}

function applyParams(params) {
  Object.assign(state, params);
  for (const p of PARAMS) inputs.get(p.key).set(state[p.key]);
  refreshVisibility();
  scheduleBuild();
}

function refreshVisibility() {
  const smooth = state.style === 'smooth';
  const faceted = state.style === 'faceted';
  document.getElementById('p-patternCount').closest('.param').style.display = smooth ? 'none' : '';
  document.getElementById('p-ribDepth').closest('.param').style.display = (smooth || faceted) ? 'none' : '';
  document.getElementById('p-twist').closest('.param').style.display = smooth ? 'none' : '';
}

// ---------------------------------------------------------------- url state
function paramsFromUrl() {
  const q = new URLSearchParams(location.search);
  const out = {};
  for (const p of PARAMS) if (q.has(p.key)) out[p.key] = p.type === 'select' ? q.get(p.key) : parseFloat(q.get(p.key));
  return normalizeParams(out).params;
}
function urlForParams(params) {
  const q = new URLSearchParams();
  for (const p of PARAMS) if (params[p.key] !== DEFAULTS[p.key]) q.set(p.key, params[p.key]);
  const s = q.toString();
  return location.pathname + (s ? '?' + s : '');
}

// ---------------------------------------------------------------- three.js
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15171c);
const camera = new THREE.PerspectiveCamera(40, 1, 1, 4000);
camera.position.set(260, -300, 220);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 80);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(200, -300, 400);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffe9c4, 0.5);
fill.position.set(-300, 200, 100);
scene.add(fill);

const bed = new THREE.GridHelper(256, 16, 0x4a5060, 0x2c3038);
bed.rotation.x = Math.PI / 2; // GridHelper lies in XZ by default; rotate to XY
scene.add(bed);
const bedLabel = new THREE.Mesh(new THREE.PlaneGeometry(256, 256), new THREE.MeshBasicMaterial({ color: 0x1a1d24, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
bedLabel.position.z = -0.2;
scene.add(bedLabel);

const model = new THREE.Group();
scene.add(model);
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // keeps y <= 0 when enabled
const shadeMaterial = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.55, metalness: 0.0, flatShading: false, side: THREE.DoubleSide });
const shadeMesh = new THREE.Mesh(new THREE.BufferGeometry(), shadeMaterial);
model.add(shadeMesh);

// Ghost objects: the LED puck in its pocket and the strap through the tunnels.
const ghosts = new THREE.Group();
model.add(ghosts);
const puckMat = new THREE.MeshStandardMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.55, roughness: 0.3 });
const strapMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.75, roughness: 0.9 });
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xe9e4dc, roughness: 0.9, side: THREE.DoubleSide });
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), ceilingMat);
ceiling.visible = false;
scene.add(ceiling);

function rebuildGhosts(stats, params) {
  ghosts.clear();
  const d = stats.derived;
  ghosts.position.z = stats.zOffset || 0;
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(params.puckDiameter / 2, params.puckDiameter / 2, params.puckHeight, 64), puckMat);
  puck.rotation.x = Math.PI / 2;
  puck.position.z = d.zFloor + params.puckHeight / 2;
  ghosts.add(puck);
  const w = params.strapWidth, th = Math.min(params.strapThickness, 2);
  const span = 2 * (d.rBoss + params.strapThickness);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, span, th), strapMat);
  top.position.z = d.zTop + th / 2;
  ghosts.add(top);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(w, th, params.loopLength + 14), strapMat);
    tail.position.set(0, s * (d.rBoss + params.strapThickness / 2), d.zTop - (params.loopLength + 14) / 2 + 1);
    ghosts.add(tail);
  }
}

function setMounted(on) {
  // The print orientation already is the mounted orientation (housing up, open
  // end down), so just swap the print bed for a ceiling plane sitting on the
  // strap (strap + mating velcro ≈ 3 mm).
  if (on) {
    ceiling.position.z = (lastStats ? lastStats.derived.zTop + (lastStats.zOffset || 0) : 150) + 3;
    ceiling.visible = true; bed.visible = false; bedLabel.visible = false;
  } else {
    ceiling.visible = false; bed.visible = true; bedLabel.visible = true;
  }
}

document.getElementById('section').addEventListener('change', (e) => {
  shadeMaterial.clippingPlanes = e.target.checked ? [clipPlane] : [];
  shadeMaterial.needsUpdate = true;
});
document.getElementById('ghosts').addEventListener('change', (e) => { ghosts.visible = e.target.checked; });
document.getElementById('mounted').addEventListener('change', (e) => setMounted(e.target.checked));

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
function animate() {
  resize();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// ---------------------------------------------------------------- worker glue
const statusEl = document.getElementById('status');
const statsEl = document.getElementById('stats');
const downloadBtn = document.getElementById('download');
let buildTimer = null;

function scheduleBuild() {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(requestBuild, 120);
}
function requestBuild() {
  const id = ++buildId;
  statusEl.textContent = 'Building…';
  statusEl.className = 'status busy';
  worker.postMessage({ type: 'build', id, params: { ...state } });
}

worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'built') {
    if (msg.id !== buildId) return; // stale
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(msg.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(msg.indices, 1));
    geo.computeVertexNormals();
    shadeMesh.geometry.dispose();
    shadeMesh.geometry = geo;
    lastStats = msg.stats;
    lastParams = msg.params;
    rebuildGhosts(msg.stats, msg.params);
    if (document.getElementById('mounted').checked) setMounted(true);
    showStats(msg.stats, msg.warnings);
    statusEl.textContent = `Ready · built in ${msg.stats.buildMs} ms`;
    statusEl.className = 'status';
    downloadBtn.disabled = false;
    history.replaceState(null, '', urlForParams(msg.params));
  } else if (msg.type === 'stl') {
    const blob = new Blob([msg.buffer], { type: 'model/stl' });
    const a = document.createElement('a');
    const p = msg.params;
    a.href = URL.createObjectURL(blob);
    a.download = `reflector-shade-${p.bottomDiameter}x${p.height}-${p.style}.stl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download STL';
  } else if (msg.type === 'error') {
    statusEl.textContent = 'Error: ' + msg.message;
    statusEl.className = 'status error';
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download STL';
  }
};

downloadBtn.addEventListener('click', () => {
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Exporting…';
  worker.postMessage({ type: 'stl', id: ++pendingStl, params: { ...state } });
});

document.getElementById('share').addEventListener('click', async () => {
  const url = location.origin + urlForParams(normalizeParams(state).params);
  try { await navigator.clipboard.writeText(url); statusEl.textContent = 'Link copied'; }
  catch { prompt('Copy this link', url); }
});

function fmt(n, d = 1) { return Number(n).toFixed(d); }
function showStats(s, warnings) {
  const over = s.maxOverhangDeg;
  const overClass = over > 55 ? 'warn' : 'ok';
  const rows = [
    ['Footprint', `${fmt(s.size.x)} × ${fmt(s.size.y)} mm, ${fmt(s.size.z)} mm tall`],
    ['Housing', `Ø${fmt(s.housingDiameter)} mm · pocket Ø${fmt(s.pocketDiameter, 2)} × ${fmt(s.pocketDepth)} mm`],
    ['Material', `${fmt(s.volumeMm3 / 1000)} cm³ ≈ ${fmt(s.estGramsPla, 0)} g PLA`],
    ['Max overhang', `<span class="${overClass}">${fmt(over, 0)}° from vertical${over > 55 ? ' – may need support' : ''}</span>`],
    ['Mesh', `${s.triangles.toLocaleString()} triangles`],
  ];
  let html = rows.map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('');
  for (const w of warnings || []) html += `<div class="warn">⚠ ${w}</div>`;
  statsEl.innerHTML = html;
}

// ---------------------------------------------------------------- go
refreshVisibility();
requestBuild();
