/**
 * Browser UI: parameter form, live three.js preview, STL download.
 * Geometry is built in a web worker (src/worker/geometry.worker.ts, driven
 * through src/app/worker/workerClient.ts) so the page stays responsive.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { assemble } from '@core/assembly/assemble.ts';
import type { ClassicShadeDerived } from '@core/geometry/parts/classicShade.ts';
import type { Assembly, PartStats, Warning } from '@core/model/assembly.ts';
import {
  classicParamsToProject,
  createDefaultProject,
  loadProject,
  projectToClassicParams,
  type Project,
} from '@core/model/project.ts';
import {
  CLASSIC_SHADE_DEFAULTS,
  CLASSIC_SHADE_DEFS,
  CLASSIC_SHADE_GROUPS,
  isParamVisible,
  type ClassicSelectKey,
  type ClassicShadeKey,
  type ClassicShadeParams,
} from '@core/schema/defs.ts';
import { normalizeClassicShade } from '@core/schema/normalize.ts';
import { createWorkerClient, type ExportFile } from './app/worker/workerClient.ts';

// The example gallery: every src/examples/*.lamp.json, validated, default first.
const DEFAULT_EXAMPLE_ID = 'bell-default';
const rank = (p: Project) => (p.id === DEFAULT_EXAMPLE_ID ? 0 : 1);
const EXAMPLES: Project[] = Object.values(
  import.meta.glob<{ default: unknown }>('./examples/*.lamp.json', { eager: true }),
)
  .map((mod) => loadProject(mod.default))
  .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

THREE.Object3D.DEFAULT_UP.set(0, 0, 1); // Z is up, like the printer

// ---------------------------------------------------------------- state
const state: ClassicShadeParams = { ...CLASSIC_SHADE_DEFAULTS, ...paramsFromUrl() };
/**
 * Everything the flat parameters do not describe (name, printer, colours): the
 * example last picked, else a new project.
 */
let baseProject: Project = createDefaultProject();
/** The project and assembly of the latest build request. */
let latest: { project: Project; assembly: Assembly } | null = null;
let lastDerived: ClassicShadeDerived | null = null;

const client = createWorkerClient();

// ---------------------------------------------------------------- form
const form = document.getElementById('params')!;
const inputs = new Map<
  ClassicShadeKey,
  { set: (v: ClassicShadeParams[ClassicShadeKey]) => void }
>();

for (const group of CLASSIC_SHADE_GROUPS) {
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = group.label;
  fs.appendChild(legend);
  for (const p of group.params) {
    const row = document.createElement('div');
    row.className = 'param';
    const label = document.createElement('label');
    label.htmlFor = `p-${p.key}`;
    const unit = p.type === 'select' ? undefined : p.unit;
    label.innerHTML = `${p.label}${unit ? `<span class="unit">${unit}</span>` : ''}`;
    row.appendChild(label);
    if (p.type === 'select') {
      const sel = document.createElement('select');
      sel.id = `p-${p.key}`;
      for (const o of p.options) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o;
        sel.appendChild(opt);
      }
      sel.value = state[p.key];
      // The dropdown only offers p.options, which are the valid values for p.key.
      sel.addEventListener('change', () =>
        setParam(p.key, sel.value as ClassicShadeParams[ClassicSelectKey]),
      );
      row.appendChild(sel);
      inputs.set(p.key, {
        set: (v) => {
          sel.value = String(v);
        },
      });
    } else {
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(p.min);
      range.max = String(p.max);
      range.step = String(p.step);
      range.value = String(state[p.key]);
      const num = document.createElement('input');
      num.type = 'number';
      num.id = `p-${p.key}`;
      num.min = String(p.min);
      num.max = String(p.max);
      num.step = String(p.step);
      num.value = String(state[p.key]);
      range.addEventListener('input', () => {
        num.value = range.value;
        setParam(p.key, parseFloat(range.value));
      });
      num.addEventListener('change', () => {
        range.value = num.value;
        setParam(p.key, parseFloat(num.value));
      });
      row.appendChild(range);
      row.appendChild(num);
      inputs.set(p.key, {
        set: (v) => {
          range.value = String(v);
          num.value = String(v);
        },
      });
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

const presetSel = document.getElementById('preset') as HTMLSelectElement;
for (const example of EXAMPLES) {
  const opt = document.createElement('option');
  opt.value = example.id;
  opt.textContent = example.name;
  presetSel.appendChild(opt);
}
for (const ev of ['change', 'input'])
  presetSel.addEventListener(ev, () => {
    const example = EXAMPLES.find((x) => x.id === presetSel.value);
    if (example) {
      baseProject = example;
      applyParams(projectToClassicParams(example));
    }
  });
document.getElementById('reset')!.addEventListener('click', () => {
  presetSel.value = EXAMPLES[0]?.id ?? '';
  baseProject = createDefaultProject();
  applyParams({ ...CLASSIC_SHADE_DEFAULTS });
});

function setParam<K extends ClassicShadeKey>(key: K, value: ClassicShadeParams[K]) {
  state[key] = value;
  refreshVisibility();
  scheduleBuild();
}

function applyParams(params: ClassicShadeParams) {
  Object.assign(state, params);
  for (const p of CLASSIC_SHADE_DEFS) inputs.get(p.key)!.set(state[p.key]);
  refreshVisibility();
  scheduleBuild();
}

function refreshVisibility() {
  for (const p of CLASSIC_SHADE_DEFS) {
    const row = document.getElementById(`p-${p.key}`)!.closest<HTMLElement>('.param')!;
    row.style.display = isParamVisible(p, state) ? '' : 'none';
  }
}

// ---------------------------------------------------------------- url state
function paramsFromUrl(): ClassicShadeParams {
  const q = new URLSearchParams(location.search);
  const out: Partial<Record<ClassicShadeKey, unknown>> = {};
  for (const p of CLASSIC_SHADE_DEFS)
    if (q.has(p.key)) out[p.key] = p.type === 'select' ? q.get(p.key) : parseFloat(q.get(p.key)!);
  return normalizeClassicShade(out).values;
}
function urlForParams(params: ClassicShadeParams) {
  const q = new URLSearchParams();
  for (const p of CLASSIC_SHADE_DEFS)
    if (params[p.key] !== CLASSIC_SHADE_DEFAULTS[p.key]) q.set(p.key, String(params[p.key]));
  const s = q.toString();
  return location.pathname + (s ? '?' + s : '');
}

// ---------------------------------------------------------------- three.js
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
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
const bedLabel = new THREE.Mesh(
  new THREE.PlaneGeometry(256, 256),
  new THREE.MeshBasicMaterial({
    color: 0x1a1d24,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  }),
);
bedLabel.position.z = -0.2;
scene.add(bedLabel);

const model = new THREE.Group();
scene.add(model);
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // keeps y <= 0 when enabled
const shadeMaterial = new THREE.MeshStandardMaterial({
  color: 0xf4efe6,
  roughness: 0.55,
  metalness: 0.0,
  flatShading: false,
  side: THREE.DoubleSide,
});
const shadeMesh = new THREE.Mesh(new THREE.BufferGeometry(), shadeMaterial);
model.add(shadeMesh);

// Ghost objects: the LED puck in its pocket and the strap through the tunnels.
const ghosts = new THREE.Group();
model.add(ghosts);
const puckMat = new THREE.MeshStandardMaterial({
  color: 0x9fd3ff,
  transparent: true,
  opacity: 0.55,
  roughness: 0.3,
});
const strapMat = new THREE.MeshStandardMaterial({
  color: 0x3a3a3a,
  transparent: true,
  opacity: 0.75,
  roughness: 0.9,
});
const ceilingMat = new THREE.MeshStandardMaterial({
  color: 0xe9e4dc,
  roughness: 0.9,
  side: THREE.DoubleSide,
});
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), ceilingMat);
ceiling.visible = false;
scene.add(ceiling);

function rebuildGhosts(d: ClassicShadeDerived, params: ClassicShadeParams) {
  ghosts.clear();
  ghosts.position.z = d.zOffset || 0;
  const puck = new THREE.Mesh(
    new THREE.CylinderGeometry(
      params.puckDiameter / 2,
      params.puckDiameter / 2,
      params.puckHeight,
      64,
    ),
    puckMat,
  );
  puck.rotation.x = Math.PI / 2;
  puck.position.z = d.zFloor + params.puckHeight / 2;
  ghosts.add(puck);
  const w = params.strapWidth,
    th = Math.min(params.strapThickness, 2);
  const span = 2 * (d.rBoss + params.strapThickness);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, span, th), strapMat);
  top.position.z = d.zTop + th / 2;
  ghosts.add(top);
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(w, th, params.loopLength + 14), strapMat);
    tail.position.set(
      0,
      s * (d.rBoss + params.strapThickness / 2),
      d.zTop - (params.loopLength + 14) / 2 + 1,
    );
    ghosts.add(tail);
  }
}

function setMounted(on: boolean) {
  // The print orientation already is the mounted orientation (housing up, open
  // end down), so just swap the print bed for a ceiling plane sitting on the
  // strap (strap + mating velcro ≈ 3 mm).
  if (on) {
    ceiling.position.z = (lastDerived ? lastDerived.zTop + (lastDerived.zOffset || 0) : 150) + 3;
    ceiling.visible = true;
    bed.visible = false;
    bedLabel.visible = false;
  } else {
    ceiling.visible = false;
    bed.visible = true;
    bedLabel.visible = true;
  }
}

const checked = (e: Event) => (e.target as HTMLInputElement).checked;
document.getElementById('section')!.addEventListener('change', (e) => {
  shadeMaterial.clippingPlanes = checked(e) ? [clipPlane] : [];
  shadeMaterial.needsUpdate = true;
});
document.getElementById('ghosts')!.addEventListener('change', (e) => {
  ghosts.visible = checked(e);
});
document.getElementById('mounted')!.addEventListener('change', (e) => setMounted(checked(e)));

function resize() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
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
const statusEl = document.getElementById('status')!;
const statsEl = document.getElementById('stats')!;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;
let buildTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleBuild() {
  clearTimeout(buildTimer);
  buildTimer = setTimeout(requestBuild, 120);
}
function requestBuild() {
  latest = currentAssembly();
  statusEl.textContent = 'Building…';
  statusEl.className = 'status busy';
  client.build(latest.assembly.parts);
}

/** The project for the current parameters, assembled at the chosen quality. */
function currentAssembly(): { project: Project; assembly: Assembly } {
  const project = classicParamsToProject({ ...state }, baseProject);
  return { project, assembly: assemble(project, { quality: state.quality }) };
}

/** The classic-shade builder reports its derived dimensions in the stats. */
function classicDerived(stats: PartStats): ClassicShadeDerived {
  return stats.derived as ClassicShadeDerived;
}

function showError(message: string) {
  statusEl.textContent = 'Error: ' + message;
  statusEl.className = 'status error';
  downloadBtn.disabled = false;
  downloadBtn.textContent = 'Download STL';
}

client.onPart((msg) => {
  // The client only passes on parts of the latest build, which `latest` describes.
  const part = latest?.assembly.parts.find((p) => p.id === msg.partId);
  if (!latest || !part) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(msg.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(msg.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(msg.indices, 1));
  shadeMesh.geometry.dispose();
  shadeMesh.geometry = geo;
  lastDerived = classicDerived(msg.stats);
  rebuildGhosts(lastDerived, part.params);
  if ((document.getElementById('mounted') as HTMLInputElement).checked) setMounted(true);
  showStats(msg.stats, lastDerived, [...latest.assembly.warnings, ...msg.warnings]);
  statusEl.textContent = msg.cached ? 'Ready · from cache' : `Ready · built in ${msg.buildMs} ms`;
  statusEl.className = 'status';
  downloadBtn.disabled = false;
  history.replaceState(null, '', urlForParams(part.params));
});
client.onPartError((msg) => showError(msg.message));
client.onError((err) => showError(err.message));

function download(file: ExportFile) {
  const blob = new Blob([file.data], { type: file.mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

downloadBtn.addEventListener('click', async () => {
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Exporting…';
  try {
    const { project, assembly } = currentAssembly();
    const files = await client.export({
      format: 'stl',
      parts: assembly.parts,
      layout: assembly.layout,
      printer: project.printer,
      meta: { name: project.name },
    });
    for (const file of files) download(file);
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download STL';
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  }
});

document.getElementById('share')!.addEventListener('click', async () => {
  const url = location.origin + urlForParams(normalizeClassicShade(state).values);
  try {
    await navigator.clipboard.writeText(url);
    statusEl.textContent = 'Link copied';
  } catch {
    prompt('Copy this link', url);
  }
});

function fmt(n: number, d = 1) {
  return Number(n).toFixed(d);
}
function showStats(s: PartStats, d: ClassicShadeDerived, warnings: readonly Warning[]) {
  const over = s.maxOverhangDeg;
  const overClass = over > 55 ? 'warn' : 'ok';
  const { min, max } = s.bbox;
  const rows = [
    [
      'Footprint',
      `${fmt(max[0] - min[0])} × ${fmt(max[1] - min[1])} mm, ${fmt(max[2] - min[2])} mm tall`,
    ],
    [
      'Housing',
      `Ø${fmt(2 * d.rBoss)} mm · pocket Ø${fmt(2 * d.rPocket, 2)} × ${fmt(d.pocketDepth)} mm`,
    ],
    ['Material', `${fmt(s.volumeMm3 / 1000)} cm³ ≈ ${fmt(s.estGramsPla, 0)} g PLA`],
    [
      'Max overhang',
      `<span class="${overClass}">${fmt(over, 0)}° from vertical${over > 55 ? ' – may need support' : ''}</span>`,
    ],
    ['Mesh', `${s.triangles.toLocaleString()} triangles`],
  ];
  let html = rows.map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('');
  for (const w of warnings) html += `<div class="warn">⚠ ${w.message}</div>`;
  statsEl.innerHTML = html;
}

// ---------------------------------------------------------------- go
refreshVisibility();
requestBuild();
