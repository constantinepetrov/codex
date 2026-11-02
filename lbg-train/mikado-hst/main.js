// Паровоз Mikado 2-8-2 с тендером раскладывается и собирается в трёхвагонный скоростной состав.
// Один вход: прогресс p от 0 до 1. Каждая деталь едет из своей начальной позы в конечную по формуле от p,
// ключевых кадров нет. Оболочки (котёл, бак, бункер) меняют форму через morph target: цилиндр становится кузовом.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

const PI = Math.PI;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const C = {
  bg: 0xf1ede4, black: 0x1f2125, steel: 0xa4a9b0, brass: 0xb98d3a, white: 0xf6f4f0,
  burg: 0x651e32, glass: 0x141d27, dark: 0x30343a, light: 0xd9dbde,
};

// ---------- сцена ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.Fog(C.bg, 70, 190);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;
const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = PI * 0.495;
controls.minDistance = 8;
controls.maxDistance = 90;
const TARGET = new THREE.Vector3(-2, 2.2, 0);
controls.target.copy(TARGET);

const sun = new THREE.DirectionalLight(0xfff4e4, 2.4);
sun.position.set(-18, 38, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, {left: -44, right: 44, top: 30, bottom: -30, near: 5, far: 120});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 4;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d0c0, 0.5));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({color: 0xe9e4d9, roughness: 1, metalness: 0}));
ground.rotation.x = -PI / 2;
ground.position.y = -0.14;
ground.receiveShadow = true;
scene.add(ground);
const ballast = new THREE.Mesh(new THREE.BoxGeometry(400, 0.12, 3.6), new THREE.MeshStandardMaterial({color: 0xc9c0b0, roughness: 1}));
ballast.position.y = -0.2;
ballast.receiveShadow = true;
scene.add(ballast);
const railMat = new THREE.MeshStandardMaterial({color: 0x8d9198, roughness: 0.4, metalness: 0.7});
for (const s of [-1, 1]) {
  const r = new THREE.Mesh(new THREE.BoxGeometry(400, 0.14, 0.1), railMat);
  r.position.set(0, -0.07, s * 0.7175);
  r.receiveShadow = true;
  scene.add(r);
}
const SLEEP_N = 170, SLEEP_DX = 0.75;
const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.1, 2.5), new THREE.MeshStandardMaterial({color: 0xaaa190, roughness: 1}), SLEEP_N);
sleepers.receiveShadow = true;
sleepers.frustumCulled = false;
scene.add(sleepers);
const _m4 = new THREE.Matrix4();
function placeSleepers(S) {
  const off = -(S % SLEEP_DX);
  for (let i = 0; i < SLEEP_N; i++) {
    _m4.makeTranslation(-SLEEP_N * SLEEP_DX / 2 + i * SLEEP_DX + off, -0.19, 0);
    sleepers.setMatrixAt(i, _m4);
  }
  sleepers.instanceMatrix.needsUpdate = true;
}

// ---------- материалы ----------
const mats = [];
const mat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({color: c, roughness: 0.5, metalness: 0.45, envMapIntensity: 0.6, ...o}); mats.push(m); return m; };

// краска кузовной оболочки: чёрный котёл превращается в белый кузов с окнами и бордовой полосой
function shellMaterial(up, win, bands) {
  const m = new THREE.MeshStandardMaterial({color: C.black, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.18, side: THREE.DoubleSide});
  const uni = {uM: {value: 0}, uUp: {value: up}, uWin: {value: win}, uBands: {value: bands}};
  m.userData.uni = uni;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vP;
uniform float uM,uUp,uWin,uBands;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ return 0.5 * vn(p) + 0.25 * vn(p * 2.1) + 0.125 * vn(p * 4.3) + 0.0625 * vn(p * 8.7); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float u = vP.x, v = vP.y;
      float n = fbm(vec2(u * 14.0, v * 10.0));
      float n2 = fbm(vec2(u * 9.0, v * 6.0) + 3.0);
      float k = smoothstep(0.0, 0.12, uM * 1.28 - (0.3 * n + 0.7 * u));
      float sdU = abs(fract(u * 6.0 + 0.5) - 0.5), sdV = abs(fract(v * 4.0 + 0.5) - 0.5);
      float seam = max(1.0 - smoothstep(0.0, 0.025, sdU), 1.0 - smoothstep(0.0, 0.03, sdV));
      float rv = length(fract(vec2(u * 6.0 * 9.0, v * 4.0 * 7.0)) - 0.5);
      float rivet = (1.0 - smoothstep(0.14, 0.24, rv)) * (1.0 - smoothstep(0.05, 0.09, min(sdU, sdV)));
      vec3 steelBlack = vec3(0.012, 0.013, 0.015);
      float band = (1.0 - smoothstep(0.0, 0.012, abs(u - 0.5))) + (1.0 - smoothstep(0.0, 0.012, abs(u - 0.14))) + (1.0 - smoothstep(0.0, 0.012, abs(u - 0.86)));
      vec3 loco = mix(steelBlack, vec3(0.07, 0.075, 0.08), clamp(band, 0.0, 1.0) * uBands);
      loco = mix(loco, vec3(0.11, 0.04, 0.022), smoothstep(0.6, 0.78, n2) * 0.8);
      loco += vec3(0.02) * seam + vec3(0.04) * rivet;
      vec3 body = vec3(0.90, 0.89, 0.87);
      body = mix(body, body * vec3(0.72, 0.70, 0.66), smoothstep(0.55, 0.82, fbm(vec2(u * 5.0, v * 4.0) + 7.0)) * 0.55);
      float shoulder = min(v, 1.0 - v);
      float stripe = 1.0 - smoothstep(0.022, 0.034, shoulder);
      float wv = smoothstep(0.075, 0.09, shoulder) * (1.0 - smoothstep(0.19, 0.205, shoulder));
      float wu = smoothstep(0.0, 0.02, fract(u * 9.0)) * (1.0 - smoothstep(0.66, 0.68, fract(u * 9.0))) * step(0.05, u) * step(u, 0.95);
      float win = wv * wu * uWin * uUp;
      vec3 col = mix(body, vec3(0.130, 0.013, 0.032), stripe);
      col = mix(col, vec3(0.006, 0.012, 0.02), win);
      col = col * (1.0 - 0.28 * seam) + vec3(0.03) * rivet;
      diffuseColor.rgb = mix(loco, col, k);`);
  };
  return m;
}

// ---------- геометрия оболочек ----------
function superSec(phi, w, h, n) {
  const c = Math.cos(phi), s = Math.sin(phi), e = 2 / n;
  return [w / 2 * Math.sign(c) * Math.pow(Math.abs(c), e), h / 2 * Math.sign(s) * Math.pow(Math.abs(s), e)];
}
// поперечное сечение кузова: форма A (котёл) и форма B (вагон или нос)
function pointFn(P) {
  return (u, v, up) => {
    const phi = up ? v * PI : PI + v * PI;
    let w = P.w, h = P.h, yc = P.yc, x = P.x0 + u * P.L;
    if (P.nose) {
      const t = P.nose === 'front' ? u : 1 - u;
      w *= Math.pow(Math.max(1 - Math.pow(t, 2.1), 0), 0.5);
      h *= Math.pow(Math.max(1 - Math.pow(t, 1.55), 0), 0.5);
      yc = P.yc - 0.62 * t * t;
    }
    const [z, y] = superSec(phi, w, h, P.n);
    return [x, yc + y, z];
  };
}
const NU = 26, NV = 28;
function shellGeo(PA, PB, up) {
  const fa = pointFn(PA), fb = pointFn(PB);
  const n = (NU + 1) * (NV + 1);
  const A = new Float32Array(n * 3), B = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let i = 0;
  for (let a = 0; a <= NU; a++) for (let b = 0; b <= NV; b++, i++) {
    const u = a / NU, v = b / NV;
    A.set(fa(u, v, up), i * 3);
    B.set(fb(u, v, up), i * 3);
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  const cen = (arr) => { const c = [0, 0, 0]; for (let k = 0; k < n; k++) for (let d = 0; d < 3; d++) c[d] += arr[k * 3 + d] / n; return c; };
  const cA = cen(A), cB = cen(B);
  for (let k = 0; k < n; k++) for (let d = 0; d < 3; d++) { A[k * 3 + d] -= cA[d]; B[k * 3 + d] -= cB[d]; }
  const idx = [];
  for (let a = 0; a < NU; a++) for (let b = 0; b < NV; b++) {
    const p0 = a * (NV + 1) + b, p1 = p0 + 1, p2 = p0 + NV + 1, p3 = p2 + 1;
    if (up) idx.push(p0, p1, p2, p1, p3, p2); else idx.push(p0, p2, p1, p1, p2, p3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(A, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const gb = new THREE.BufferGeometry();
  gb.setAttribute('position', new THREE.BufferAttribute(B, 3));
  gb.setIndex(idx);
  gb.computeVertexNormals();
  g.morphAttributes.position = [new THREE.BufferAttribute(B, 3)];
  g.morphAttributes.normal = [gb.attributes.normal];
  return {g, cA, cB};
}

// ---------- детали и позы ----------
const parts = [];
const byName = {};
const E = (x, y, z) => new THREE.Euler(x, y, z);
const Q = (x = 0, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(E(x, y, z));
const pose = (p, r = [0, 0, 0], s = [1, 1, 1]) => ({p: new THREE.Vector3(...p), q: Q(...r), s: new THREE.Vector3(...s)});

function add(name, o) {
  const root = new THREE.Group();
  root.add(o.obj);
  root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
  scene.add(root);
  const P = {name, root, obj: o.obj, A: o.A, Afn: o.Afn, B: o.B, d: o.d ?? hash(parts.length + 3), ex: o.ex, tw: o.tw, flip: o.flip, arc: o.arc ?? 1.2,
    label: o.label, tint: o.tint, morph: o.morph, spin: o.spin, wheel: o.wheel, shell: o.shell};
  parts.push(P);
  byName[name] = P;
  return P;
}
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (r, l, m, seg = 24) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), m); c.rotation.z = PI / 2; return c; }; // вдоль x
const cylZ = (r, l, m, seg = 24) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), m); c.rotation.x = PI / 2; return c; };
const at = (m, x, y = 0, z = 0) => { m.position.set(x, y, z); return m; };
const grp = (...c) => { const g = new THREE.Group(); c.forEach((x) => g.add(x)); return g; };

// 1. оболочки
const BODY = {w: 3.0, h: 3.25, n: 3.4, yc: 2.4};
const SHELLS = [
  {id: 'nose', label: 'Дымовая коробка', A: {x0: 5.0, L: 1.55, w: 2.25, h: 2.25, n: 2, yc: 2.9}, B: {...BODY, x0: 9.2, L: 5.0, nose: 'front'}, win: 0, bands: 0},
  {id: 'b1', label: 'Котёл', A: {x0: 0.75, L: 4.25, w: 2.1, h: 2.1, n: 2, yc: 2.9}, B: {...BODY, x0: 4.0, L: 5.2}, win: 1, bands: 1},
  {id: 'b2', label: 'Топка', A: {x0: -2.7, L: 3.4, w: 2.5, h: 2.5, n: 2, yc: 2.85}, B: {...BODY, x0: -6.4, L: 10.0}, win: 1, bands: 1},
  {id: 'b3', label: 'Бак тендера', A: {x0: -11.6, L: 7.4, w: 2.6, h: 2.6, n: 2, yc: 2.0}, B: {...BODY, x0: -11.8, L: 5.0}, win: 1, bands: 0},
  {id: 'tail', label: 'Угольный бункер', A: {x0: -8.0, L: 3.8, w: 2.7, h: 1.1, n: 4, yc: 3.45}, B: {...BODY, x0: -16.8, L: 5.0, nose: 'tail'}, win: 0, bands: 0},
];
const shellExUp = {nose: [1.5, 4.8, 0.8], b1: [0.5, 4.4, -1.2], b2: [-0.8, 4.0, 1.0], b3: [-1.0, 4.2, -0.8], tail: [-1.5, 5.4, 0.6]};
const shellExLo = {nose: [2.2, 0.2, 3.4], b1: [1.0, 0.0, -3.8], b2: [-1.2, 0.2, 3.9], b3: [-1.2, 0.0, -4.0], tail: [-2.0, 1.2, 3.8]};
SHELLS.forEach((S, k) => {
  for (const up of [1, 0]) {
    const {g, cA, cB} = shellGeo(S.A, S.B, !!up);
    const m = new THREE.Mesh(g, shellMaterial(up, S.win, S.bands));
    m.updateMorphTargets();
    const P = add(S.id + (up ? 'U' : 'L'), {
      obj: m, A: pose(cA), B: pose(cB), d: 0.12 + 0.16 * k + (up ? 0 : 0.05),
      ex: up ? shellExUp[S.id] : shellExLo[S.id], tw: {axis: [1, 0, 0], ang: up ? 0.7 : -0.7}, arc: up ? 3.2 : 1.0, label: S.label, morph: m, shell: true,
    });
  }
});

// 2. рама: три вложенных короба, выдвигаются телескопически
const SPINE = [
  {id: 'spA', size: 0.36, B: 8.4}, {id: 'spB', size: 0.3, B: -0.75 - 0.0}, {id: 'spC', size: 0.24, B: -11.0},
];
// B центры по длине 11.6 и перекрытию 1.9
SPINE[0].B = 8.4; SPINE[1].B = -0.65; SPINE[2].B = -11.0;
for (const S of SPINE) for (const s of [1, -1]) {
  const m = mat(C.dark, {metalness: 0.6, roughness: 0.4});
  const rail = box(11.6, S.size, S.size, m);
  const pin = new THREE.Group();
  for (const xx of [-5.4, 5.4]) { const c = cylZ(0.07, S.size + 0.08, mat(C.brass), 14); c.position.x = xx; pin.add(c); }
  add(S.id + (s > 0 ? 'L' : 'R'), {
    obj: grp(rail, pin), A: pose([1.7, 1.15, s * 0.52]), B: pose([S.B, 0.62, s * 0.6]), d: 0.55 + hash(S.size * 9 + s) * 0.25,
    ex: [0, 1.8, s * 3.0], arc: 1.5, label: 'Рама', tint: [C.black, C.dark, m],
  });
}

// 3. колёсные пары
function makeWheel(r, side, pinR) {
  const g = new THREE.Group();
  const mb = mat(C.black, {metalness: 0.5, roughness: 0.45}), ms = mat(C.steel, {metalness: 0.8, roughness: 0.3});
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.13, 48, 1, true), ms); tire.rotation.x = PI / 2; tire.material.side = THREE.DoubleSide;
  const rimOut = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r, 48), ms);
  const rimIn = rimOut.clone();
  rimOut.position.z = 0.065; rimIn.position.z = -0.065; rimIn.rotation.y = PI; rimOut.material.side = THREE.DoubleSide;
  const web = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.05, 48), mb); web.rotation.x = PI / 2;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.2, 20), ms); hub.rotation.x = PI / 2;
  g.add(tire, rimOut, rimIn, web, hub);
  for (let i = 0; i < 10; i++) {
    const sp = box(r * 0.7, r * 0.09, 0.09, ms);
    sp.position.set(Math.cos(i * PI / 5) * r * 0.5, Math.sin(i * PI / 5) * r * 0.5, 0);
    sp.rotation.z = i * PI / 5;
    g.add(sp);
  }
  if (pinR) {
    const a0 = side > 0 ? 0 : PI / 2;
    const pin = cylZ(0.07, 0.3, mat(C.brass), 14);
    pin.position.set(Math.cos(a0) * pinR, Math.sin(a0) * pinR, 0.12 * side);
    const cw = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.08, 20, 1, false, 0, 2.1), ms);
    cw.rotation.x = PI / 2; cw.rotation.z = a0 + PI + 1.05 - PI / 2 + PI / 2;
    cw.position.z = 0.0;
    g.add(pin, cw);
  }
  return g;
}
const AXLES = [
  {id: 'ax_pony', r: 0.45, x: 5.2, pin: 0}, {id: 'ax_d1', r: 0.8, x: 3.5, pin: 0.42}, {id: 'ax_d2', r: 0.8, x: 1.9, pin: 0.42},
  {id: 'ax_d3', r: 0.8, x: 0.3, pin: 0.42}, {id: 'ax_d4', r: 0.8, x: -1.3, pin: 0.42}, {id: 'ax_tr', r: 0.55, x: -2.9, pin: 0},
  {id: 'ax_t1', r: 0.4, x: -5.0, pin: 0}, {id: 'ax_t2', r: 0.4, x: -6.1, pin: 0}, {id: 'ax_t3', r: 0.4, x: -7.2, pin: 0},
  {id: 'ax_t4', r: 0.4, x: -9.0, pin: 0}, {id: 'ax_t5', r: 0.4, x: -10.1, pin: 0}, {id: 'ax_t6', r: 0.4, x: -11.2, pin: 0},
];
const BOGIE_X = [11.0, 6.3, 1.2, -4.0, -9.2, -14.0];
const RF = 0.46;
AXLES.forEach((a, k) => {
  const spin = new THREE.Group();
  const shaft = cylZ(0.1, 1.7, mat(C.steel), 16);
  spin.add(shaft);
  for (const s of [1, -1]) { const w = makeWheel(a.r, s, a.pin); w.position.z = s * 0.72; spin.add(w); }
  const bx = BOGIE_X[Math.floor(k / 2)] + (k % 2 ? 1.2 : -1.2);
  // ось, которая в паровозе тянет вперёд, становится передней осью тележки: порядок по x сохраняется
  add(a.id, {
    obj: spin, A: pose([a.x, a.r, 0]), B: pose([bx, RF, 0], [0, 0, 0], [RF / a.r, RF / a.r, 1]), d: 0.05 + 0.07 * k,
    ex: [0.0, 5.2 + 0.35 * (k % 4), (k % 2 ? 1 : -1) * 0.0], tw: {axis: [0, 0, 1], ang: 0}, flip: true, arc: 2.4, label: 'Колёсная пара',
    spin, wheel: {r0: a.r, ang: 0},
  });
});

// тележки
function bogieGeo(len) {
  const m = mat(C.dark, {metalness: 0.55, roughness: 0.4}), g = new THREE.Group();
  for (const s of [1, -1]) g.add(at(box(len, 0.15, 0.15, m), 0, 0, s * 1.2));
  for (const x of [-1, 1]) g.add(at(box(0.14, 0.14, 2.5, m), x * (len / 2 - 0.1), 0, 0));
  const bol = box(0.3, 0.14, 2.3, mat(C.steel)); g.add(bol);
  return {g, m};
}
const BOGIES = [
  {id: 'bg_pony', A: [5.2, 0.62, 0], len: 2.8}, {id: 'bg_eqL', A: [1.9, 1.0, 0.0], len: 4.6}, {id: 'bg_eqR', A: [0.4, 1.0, 0], len: 4.6},
  {id: 'bg_tr', A: [-2.9, 0.7, 0], len: 2.8}, {id: 'bg_t1', A: [-6.1, 0.62, 0], len: 3.4}, {id: 'bg_t2', A: [-10.1, 0.62, 0], len: 3.4},
];
BOGIES.forEach((b, k) => {
  const {g, m} = bogieGeo(4.0);
  add(b.id, {obj: g, A: pose(b.A, [0, 0, 0], [b.len / 4.0, 1, 1]), B: pose([BOGIE_X[k], 0.5, 0]), d: 0.3 + 0.1 * k, ex: [0, 3.0 + 0.3 * k, 0], flip: false, arc: 1.5, label: 'Тележка', tint: [C.black, C.dark, m]});
});

// 4. кинематика паровоза: боковые тяги, шатуны, ползуны, штоки (поза A живая, зависит от угла колеса)
const ROD = {R: 0.42, L: 2.5, yc: 0.82, drvX: [3.5, 1.9, 0.3, -1.3]};
const dyn = {phi: 0};
function sideRodA(s) {
  const ph = dyn.phi + (s > 0 ? 0 : PI / 2);
  return {p: new THREE.Vector3((ROD.drvX[0] + ROD.drvX[3]) / 2 + ROD.R * Math.cos(ph), 0.8 + ROD.R * Math.sin(ph), s * 0.9), q: Q(), s: new THREE.Vector3(1, 1, 1)};
}
function mainGeom(s) {
  const ph = dyn.phi + (s > 0 ? 0 : PI / 2);
  const px = ROD.drvX[1] + ROD.R * Math.cos(ph), py = 0.8 + ROD.R * Math.sin(ph);
  const xc = px + Math.sqrt(ROD.L * ROD.L - (ROD.yc - py) ** 2);
  return {px, py, xc};
}
for (const s of [1, -1]) {
  const sd = s > 0 ? 'L' : 'R';
  const rm = mat(C.steel, {metalness: 0.85, roughness: 0.3}), bm = mat(C.brass);
  const side = grp(box(4.95, 0.13, 0.06, rm));
  for (const x of [-2.4, -0.8, 0.8, 2.4]) { const c = cylZ(0.09, 0.12, bm, 14); c.position.x = x; side.add(c); }
  add('side' + sd, {obj: side, Afn: () => sideRodA(s), B: pose([-1.4, 0.4, s * 1.12], [0, 0, 0]), d: 0.58 + 0.04 * (s > 0), ex: [0, 2.4, s * 3.3], tw: {axis: [1, 0, 0], ang: s * 1.1}, arc: 1.3, label: 'Боковая тяга'});
  add('main' + sd, {obj: grp(box(ROD.L + 0.1, 0.16, 0.07, rm)), Afn: () => {
    const g = mainGeom(s);
    return {p: new THREE.Vector3((g.px + g.xc) / 2, (g.py + ROD.yc) / 2, s * 0.97), q: Q(0, 0, Math.atan2(ROD.yc - g.py, g.xc - g.px)), s: new THREE.Vector3(1, 1, 1)};
  }, B: pose([BOGIE_X[2 - (s > 0 ? 1 : 0)] + 0.0, 0.92, s * 1.0], [0, 0, 0.5 * s]), d: 0.64 + 0.04 * (s > 0), ex: [0, 3.0, s * 3.0], tw: {axis: [0, 0, 1], ang: 1.4}, arc: 1.6, label: 'Шатун'});
  add('cross' + sd, {obj: grp(box(0.34, 0.26, 0.2, rm)), Afn: () => ({p: new THREE.Vector3(mainGeom(s).xc, ROD.yc, s * 1.04), q: Q(), s: new THREE.Vector3(1, 1, 1)}), B: pose([BOGIE_X[3 - (s > 0 ? 0 : 0)] + (s > 0 ? 1.0 : -1.0), 0.95, s * 1.05]), d: 0.7, ex: [0, 3.2, s * 2.8], arc: 1.4, label: 'Ползун'});
  add('pist' + sd, {obj: grp(cyl(0.05, 1.0, bm, 12)), Afn: () => ({p: new THREE.Vector3(mainGeom(s).xc + 0.6, ROD.yc, s * 1.04), q: Q(), s: new THREE.Vector3(1, 1, 1)}), B: pose([BOGIE_X[4] + (s > 0 ? 0.9 : -0.9), 0.75, s * 1.0], [0, 0, 0.8]), d: 0.74, ex: [0, 3.4, s * 2.6], arc: 1.5, label: 'Шток поршня'});
  // цилиндр
  const cm = mat(C.dark, {metalness: 0.6, roughness: 0.4});
  const cg = grp(cyl(0.27, 1.25, cm, 24), at(box(0.18, 0.62, 0.62, rm), 0.62, 0, 0), at(cyl(0.34, 0.16, rm, 24), -0.58, 0, 0));
  add('cyl' + sd, {obj: cg, A: pose([5.55, ROD.yc, s * 1.04]), B: pose([8.7, 0.5, s * 0.78], [0, 0, 0], [1.5, 0.9, 0.9]), d: 0.52, ex: [1.0, 2.6, s * 3.2], tw: {axis: [1, 0, 0], ang: s * 1.2}, arc: 1.5, label: 'Цилиндр', tint: [C.dark, C.light, cm]});
}

// 5. кабина, пилот, дверца, фара, трубы
function wallGeo(w, h, d) {
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2); sh.lineTo(-w / 2, h / 2); sh.closePath();
  for (const cx of [-0.62, 0.62]) { const q = new THREE.Path(); const a = 0.46; q.moveTo(cx - a, 0.25 - a); q.lineTo(cx - a, 0.25 + a); q.lineTo(cx + a, 0.25 + a); q.lineTo(cx + a, 0.25 - a); q.closePath(); sh.holes.push(q); }
  const g = new THREE.ExtrudeGeometry(sh, {depth: d, bevelEnabled: false}); g.translate(0, 0, -d / 2); return g;
}
function ringGeo(ow, oh, iw, ih, depth) {
  const sh = new THREE.Shape(); sh.moveTo(-ow / 2, -oh / 2); sh.lineTo(ow / 2, -oh / 2); sh.lineTo(ow / 2, oh / 2); sh.lineTo(-ow / 2, oh / 2); sh.closePath();
  const h = new THREE.Path(); h.moveTo(-iw / 2, -ih / 2); h.lineTo(-iw / 2, ih / 2); h.lineTo(iw / 2, ih / 2); h.lineTo(iw / 2, -ih / 2); h.closePath(); sh.holes.push(h);
  const g = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled: false});
  g.translate(0, 0, -depth / 2); g.rotateY(PI / 2);
  return g;
}
const cabM = mat(C.black, {metalness: 0.4});
add('cabFront', {obj: new THREE.Mesh(ringGeo(3.0, 2.8, 2.6, 2.5, 0.1), cabM), A: pose([0.8, 2.85, 0]), B: pose([-6.6, 2.4, 0]), d: 0.2, ex: [-0.8, 3.5, 3.4], tw: {axis: [0, 1, 0], ang: 1.2}, arc: 1.4, label: 'Стенка кабины', tint: [C.black, C.dark, cabM]});
const cabM2 = mat(C.black, {metalness: 0.4});
add('cabBack', {obj: new THREE.Mesh(ringGeo(3.0, 2.8, 2.6, 2.5, 0.1), cabM2), A: pose([-3.3, 2.85, 0]), B: pose([3.8, 2.4, 0]), d: 0.4, ex: [-1.5, 3.2, -3.4], tw: {axis: [0, 1, 0], ang: -1.2}, arc: 1.6, label: 'Задняя стенка', tint: [C.black, C.dark, cabM2]});
const roofM = mat(C.black, {metalness: 0.4});
add('cabRoof', {obj: grp(box(3.0, 0.1, 3.0, roofM)), A: pose([-1.9, 4.3, 0]), B: pose([11.45, 3.66, 0], [0, 0, -0.30], [0.72, 1, 0.6]), d: 0.45, ex: [-1.0, 6.0, 1.0], tw: {axis: [0, 0, 1], ang: 0.8}, flip: true, arc: 3.0, label: 'Крыша кабины', tint: [C.black, C.glass, roofM]});
for (const s of [1, -1]) {
  const m = mat(C.black, {metalness: 0.4});
  add('cabW' + (s > 0 ? 'L' : 'R'), {obj: grp(new THREE.Mesh(wallGeo(2.9, 2.4, 0.08), m)), A: pose([-1.9, 3.05, s * 1.45]), B: pose([5.4, 1.9, s * 1.56], [0, 0, 0], [0.38, 0.88, 1]), d: 0.3, ex: [-1.5, 1.4, s * 3.6], tw: {axis: [1, 0, 0], ang: s * 1.4}, arc: 1.5, label: 'Стенка кабины', tint: [C.black, C.burg, m]});
  const rb = mat(C.dark, {metalness: 0.5});
  add('run' + (s > 0 ? 'L' : 'R'), {obj: grp(box(4.2, 0.07, 0.5, rb)), A: pose([2.3, 1.62, s * 1.18]), B: pose([-5.3, 1.9, s * 1.56], [0, 0, 0], [0.26, 28, 0.1]), d: 0.33, ex: [0.6, 2.2, s * 3.8], tw: {axis: [1, 0, 0], ang: -s * 1.5}, flip: true, arc: 1.8, label: 'Подножка', tint: [C.dark, C.burg, rb]});
  const tp = mat(C.black, {metalness: 0.4});
  add('tpl' + (s > 0 ? 'L' : 'R'), {obj: grp(box(7.2, 0.5, 0.1, tp)), A: pose([-7.6, 0.95, s * 1.12]), B: pose([-7.9, 1.9, s * 1.56], [0, 0, 0], [0.15, 4.2, 0.5]), d: 0.5, ex: [-1.0, 2.0, s * 3.9], tw: {axis: [1, 0, 0], ang: -s * 1.4}, arc: 1.5, label: 'Боковина тендера', tint: [C.black, C.burg, tp]});
}
const pm1 = mat(C.black, {metalness: 0.45});
add('pilot', {obj: grp(at(box(1.0, 0.8, 2.1, pm1), 0, 0, 0)), A: pose([6.9, 0.7, 0], [0, 0, 0.35]), B: pose([13.4, 0.9, 0], [0, 0, 0.45], [1.6, 0.35, 1.2]), d: 0.38, ex: [2.2, 1.2, 0.0], tw: {axis: [0, 0, 1], ang: -0.9}, arc: 1.6, label: 'Пилот', tint: [C.black, C.light, pm1]});
const dm = mat(C.dark, {metalness: 0.6});
add('door', {obj: grp(cyl(1.0, 0.14, dm, 40)), A: pose([6.55, 2.9, 0]), B: pose([14.1, 1.85, 0], [0, 0, 0], [1, 0.4, 0.5]), d: 0.48, ex: [3.0, 2.6, 0.0], tw: {axis: [0, 1, 0], ang: 1.3}, flip: true, arc: 2.2, label: 'Дверца дымовой коробки', tint: [C.dark, C.light, dm]});
const lampM = mat(C.steel, {metalness: 0.8, emissive: 0x000000});
add('lamp', {obj: grp(cyl(0.22, 0.4, lampM, 20)), A: pose([6.3, 4.15, 0]), B: pose([13.5, 2.15, 0], [0, 0, 0], [1.0, 0.6, 2.2]), d: 0.5, ex: [2.0, 4.2, 0.4], tw: {axis: [0, 0, 1], ang: 1.0}, arc: 2.0, label: 'Фара'});
for (const [id, label, A, B, rs, ex] of [
  ['chim', 'Дымовая труба', [5.6, 4.35, 0], [7.0, 4.1, 0], [1, 0.7, 4.8], [1.2, 3.6, -1.0]],
  ['dome', 'Паровой колпак', [2.3, 4.1, 0], [-1.3, 4.1, 0], [1.3, 0.55, 2.4], [-0.6, 3.8, 1.2]],
  ['sand', 'Песочница', [0.5, 4.05, 0], [-9.5, 4.1, 0], [1.2, 0.5, 3.0], [-1.4, 4.0, -1.0]],
]) {
  const m = mat(C.black, {metalness: 0.5});
  const body = id === 'chim' ? grp(cylV(0.28, 1.0, m), at(cylV(0.46, 0.18, m), 0, 0.55, 0)) : grp(cylV(0.55, 0.7, m), at(cylV(0.5, 0.2, m), 0, 0.4, 0));
  add(id, {obj: body, A: pose(A), B: pose(B, [0, 0, 0], [rs[0] * 1.0, rs[1], rs[2] * 0.6]), d: 0.42 + hash(id.length) * 0.2, ex, tw: {axis: [0, 0, 1], ang: 1.6}, flip: true, arc: 2.5, label, tint: [C.black, C.white, m]});
}
function cylV(r, l, m, seg = 24) { return new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), m); }
// уголь превращается в пульт кабины, он виден через стекло носа
{
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const f = 1 + 0.18 * Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 + x); pos.setXYZ(i, x * f, y * f * 0.55, z * f); }
  g.computeVertexNormals();
  const m = mat(0x15171a, {metalness: 0.2, roughness: 0.85});
  add('coal', {obj: new THREE.Mesh(g, m), A: pose([-6.0, 4.35, 0], [0, 0, 0], [2.2, 0.9, 1.15]), B: pose([12.0, 2.55, 0], [0, 0, 0], [0.9, 0.45, 0.9]), d: 0.55, ex: [-2.2, 6.2, 0.0], tw: {axis: [0, 1, 0], ang: 2.0}, flip: true, arc: 3.0, label: 'Уголь'});
}
// двери (6 штук): из подножек, боковин тендера и стенок кабины едут двери на борта
// (подножки и боковины уже заняты своими пластинами, двери берём из подножек как накладки)
const DOORS = [];
for (const [car, x] of [[1, 5.4], [2, 2.4], [3, -7.9]]) { /* ориентиры для README */ DOORS.push([car, x]); }


// пантограф: из поручней котла и трубы, которая шла вдоль котла
{
  const sm = mat(C.steel, {metalness: 0.8, roughness: 0.3}), s2 = mat(C.steel, {metalness: 0.8, roughness: 0.3}), s3 = mat(C.dark, {metalness: 0.7});
  add('hrL', {obj: grp(box(3.0, 0.1, 0.1, sm)), A: pose([2.6, 3.45, 1.2]), B: pose([2.9, 4.52, 0], [0, 0, 0.87], [0.41, 1, 1]), d: 0.5, ex: [0.5, 2.4, 2.0], tw: {axis: [0, 0, 1], ang: 1.2}, arc: 2.0, label: 'Поручень'});
  add('hrR', {obj: grp(box(3.0, 0.1, 0.1, s2)), A: pose([2.6, 3.45, -1.2]), B: pose([3.7, 4.52, 0], [0, 0, -0.87], [0.41, 1, 1]), d: 0.56, ex: [0.5, 2.4, -2.0], tw: {axis: [0, 0, 1], ang: -1.2}, arc: 2.0, label: 'Поручень'});
  add('pipe', {obj: grp(box(4.0, 0.12, 0.12, s3)), A: pose([3.0, 4.05, 0.25]), B: pose([3.3, 5.0, 0], [0, PI / 2, 0], [0.4, 1, 1]), d: 0.62, ex: [0.0, 3.2, 0.8], tw: {axis: [0, 1, 0], ang: 1.5}, arc: 2.4, label: 'Паровая труба'});
  for (const s of [1, -1]) {
    const lm = mat(C.steel, {metalness: 0.7, emissive: 0x000000});
    add('mark' + (s > 0 ? 'L' : 'R'), {obj: grp(cyl(0.12, 0.16, lm, 14)), A: pose([7.1, 1.35, s * 0.95]), B: pose([13.6, 1.85, s * 0.55], [0, 0, 0], [1, 0.8, 0.8]), d: 0.4, ex: [1.0, 1.2, s * 2.0], arc: 1.8, label: 'Маркерный огонь'});
  }
  const wm = mat(C.brass, {metalness: 0.7});
  add('whistle', {obj: grp(cylV(0.1, 0.5, wm, 14)), A: pose([1.0, 4.25, 0.5]), B: pose([-4.0, 4.1, 0], [0, 0, 0], [3.0, 0.4, 5.5]), d: 0.58, ex: [0.0, 3.4, 1.0], tw: {axis: [0, 0, 1], ang: 2.0}, flip: true, arc: 2.2, label: 'Свисток'});
}

// ---------- гидроцилиндры (кинематические связи между деталями) ----------
const jacks = [];
function jack(pa, la, pb, lb) {
  const bm = mat(C.steel, {metalness: 0.9, roughness: 0.25}), rm = mat(0xd9dbde, {metalness: 0.9, roughness: 0.2});
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 12), bm);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 10), rm);
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat(C.brass)), e2 = e1.clone();
  [barrel, rod, e1, e2].forEach((o) => { o.castShadow = true; o.frustumCulled = false; scene.add(o); });
  jacks.push({pa: byName[pa], la: new THREE.Vector3(...la), pb: byName[pb], lb: new THREE.Vector3(...lb), barrel, rod, e1, e2});
}
for (const id of ['nose', 'b1', 'b2', 'b3', 'tail']) {
  const sp = id === 'nose' || id === 'b1' ? 'spA' : id === 'b2' ? 'spB' : 'spC';
  jack(sp + 'L', [0, 0, 0], id + 'U', [0, -0.5, 1.1]);
  jack(sp + 'R', [0, 0, 0], id + 'L', [0, 0.4, -1.1]);
}
BOGIE_X.forEach((x, k) => jack((k < 2 ? 'spA' : k < 4 ? 'spB' : 'spC') + (k % 2 ? 'R' : 'L'), [(x - [8.4, 8.4, -0.65, -0.65, -11, -11][k]) * 0, 0, 0], ['bg_pony', 'bg_eqL', 'bg_eqR', 'bg_tr', 'bg_t1', 'bg_t2'][k], [0.9, 0.1, (k % 2 ? -1 : 1) * 1.2]));
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function updateJacks() {
  for (const j of jacks) {
    j.pa.root.updateMatrixWorld(true); j.pb.root.updateMatrixWorld(true);
    _a.copy(j.la).applyMatrix4(j.pa.root.matrixWorld);
    _b.copy(j.lb).applyMatrix4(j.pb.root.matrixWorld);
    _d.subVectors(_b, _a);
    const L = Math.max(_d.length(), 0.2);
    _d.normalize();
    _q.setFromUnitVectors(_up, _d);
    const bl = L * 0.55, rl = L * 0.5;
    j.barrel.scale.set(1, bl, 1); j.barrel.quaternion.copy(_q); j.barrel.position.copy(_a).addScaledVector(_d, bl / 2);
    j.rod.scale.set(1, rl, 1); j.rod.quaternion.copy(_q); j.rod.position.copy(_b).addScaledVector(_d, -rl / 2);
    j.e1.position.copy(_a); j.e2.position.copy(_b);
  }
}

// ---------- расчёт позы по прогрессу ----------
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
const FLIP_AXIS = {};
function tint(P, m) {
  if (!P.tint) return;
  const [a, b, mt] = P.tint;
  mt.color.setHex(a).lerp(new THREE.Color(b), m);
}
const FOLD_C = new THREE.Vector3(0.5, 2.3, 0), _F = new THREE.Vector3(), _J = new THREE.Vector3();
const backOut = (t, k = 1.5) => { const x = t - 1; return 1 + (k + 1) * x * x * x + k * x * x; };
function poseAll(p) {
  parts.forEach((P, i) => {
    const d = P.d;
    const u = sstep(0.06 + 0.07 * d, 0.30 + 0.07 * d, p);
    const a = sstep(0, 0.45, u);                       // деталь раскрывается на шарнире
    const c = Math.pow(sstep(0.45, 1, u), 1.6);        // и схлопывается в плотную массу
    const w0 = sstep(0.42 + 0.08 * d, 0.84 + 0.08 * d, p);
    const w = backOut(w0, P.shell ? 0.9 : 1.7);        // перелёт через цель и возврат
    const m = sstep(0.48 + 0.08 * d, 0.90 + 0.08 * d, p);
    const A = P.Afn ? P.Afn() : P.A;
    // точка в сжатой массе: близко к оси, у каждой детали своя
    _J.set(hash(i * 3 + 1) - 0.5, hash(i * 3 + 2) - 0.5, hash(i * 3 + 3) - 0.5).multiplyScalar(1.0);
    _F.copy(A.p).sub(FOLD_C).multiplyScalar(0.16).add(FOLD_C).add(_J);
    P.root.position.copy(A.p).lerp(_F, c);
    if (P.ex) { const e = 0.35 * a * (1 - c); P.root.position.x += P.ex[0] * e; P.root.position.y += P.ex[1] * e; P.root.position.z += P.ex[2] * e; }
    // в массе всё мелко дрожит
    const jit = 0.07 * c * (1 - w0);
    P.root.position.x += jit * Math.sin(p * 210 + i * 1.7); P.root.position.y += jit * Math.sin(p * 190 + i * 2.3); P.root.position.z += jit * Math.sin(p * 230 + i * 0.9);
    P.root.position.lerp(P.B.p, w);
    P.root.position.y += P.arc * 0.7 * Math.sin(PI * w0) * (P.shell ? 0.6 : 1);
    // посадка: затухающая дрожь на месте
    const pl = 0.84 + 0.08 * d, dtl = p - pl;
    if (dtl > 0) P.root.position.y += 0.05 * Math.exp(-26 * dtl) * Math.sin(95 * dtl + i);
    _q1.copy(A.q).slerp(P.B.q, w);
    if (P.tw) {
      _v.set(...P.tw.axis);
      _q2.setFromAxisAngle(_v, P.tw.ang * (0.5 * a + c) * (1 - w0)); _q1.multiply(_q2);
      if (P.flip && P.tw.axis[2] === 1) { _q2.setFromAxisAngle(_v, 2 * PI * w0); _q1.multiply(_q2); }
    }
    P.root.quaternion.copy(_q1);
    P.root.scale.copy(A.s).lerp(P.B.s, w).multiplyScalar(1 - (P.shell ? 0.25 : 0.4) * c * (1 - w0));
    if (P.morph) {
      P.morph.morphTargetInfluences[0] = m;
      P.morph.material.userData.uni.uM.value = m;
    }
    tint(P, m);
  });
}

// ---------- ход, колёса ----------
const state = {p: 0, target: null, tspeed: 0.05, S: 0, tour: true, idleT: 0, ghost: false, tourT: 0};
function speedAt(p) { return 83 * Math.pow(sstep(0.94, 1.0, p), 1.4) + 1.6 * (1 - sstep(0.04, 0.10, p)); }
function advance(dt) {
  const v = speedAt(state.p);
  state.S += v * dt;
  for (const P of parts) {
    if (!P.wheel) continue;
    const s = P.root.scale.x;
    P.wheel.ang += v * dt / (P.wheel.r0 * s);
    P.spin.rotation.z = -P.wheel.ang;
  }
  dyn.phi = -byName.ax_d1.wheel.ang;
  placeSleepers(state.S);
  return v;
}

// ---------- интерфейс ----------
const ui = document.createElement('div');
ui.className = 'lbg-ui';
ui.innerHTML = `
<div class="lbg-top"><div class="lbg-title"><i></i>LBG<span>Мы не читаем лекций. Мы тренируем на конкретный результат.</span></div>
<div class="lbg-stage"><b id="st">Паровоз</b><em id="pc">0%</em></div></div>
<div class="lbg-side"><div><span>Скорость</span><b id="sp">0 км/ч</b></div><div><span>Колёсных пар</span><b>12</b></div><div><span>Вагонов</span><b id="wg">0</b></div><div><span>Длина</span><b id="ln">21 м</b></div></div>
<div class="lbg-bar">
 <div class="lbg-btns"><button data-a="loco">Паровоз</button><button data-a="split">Сложить</button><button data-a="build">Собрать в скоростной</button><button data-a="go">Поехали</button></div>
 <input id="sl" type="range" min="0" max="1000" value="0">
 <div class="lbg-btns"><button data-v="q">3/4</button><button data-v="s">Сбоку</button><button data-v="f">Спереди</button><button data-v="t">Сверху</button><button data-a="ghost">Прозрачный корпус</button></div>
</div>
<div id="lb"></div>`;
app.appendChild(ui);
const st = ui.querySelector('#st'), pc = ui.querySelector('#pc'), sp = ui.querySelector('#sp'), sl = ui.querySelector('#sl'), wg = ui.querySelector('#wg'), ln = ui.querySelector('#ln'), lbBox = ui.querySelector('#lb');
const STAGES = [[0, 0.07, 'Паровоз Mikado 2-8-2'], [0.07, 0.40, 'Складывание'], [0.40, 0.62, 'Перестройка'], [0.62, 0.94, 'Сборка'], [0.94, 1.01, 'Скоростной состав']];
const LABELS = ['noseU', 'b1U', 'b2U', 'b3U', 'tailU', 'spAL', 'ax_d2', 'cylL', 'mainL', 'chim', 'cabRoof', 'coal', 'pilot', 'pipe'];
const labelEls = LABELS.map((id) => { const e = document.createElement('div'); e.className = 'lb'; e.textContent = byName[id].label; lbBox.appendChild(e); return {id, e}; });

function setView(k) {
  const V = {q: [24, 9, 26], s: [-2, 4, 52], f: [52, 5, 0.01], t: [-2, 56, 2]}[k];
  state.cam = {from: camera.position.clone(), to: new THREE.Vector3(...V), t: 0};
  userTouch();
}
function userTouch() { state.tour = false; state.idleT = 0; }
function animateTo(t, spd) { userTouch(); state.target = t; state.tspeed = spd; }
ui.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
  const a = b.dataset.a, v = b.dataset.v;
  if (v) return setView(v);
  if (a === 'loco') animateTo(0, 0.18);
  if (a === 'split') animateTo(0.40, 0.12);
  if (a === 'build') animateTo(0.94, 0.09);
  if (a === 'go') animateTo(1, 0.1);
  if (a === 'ghost') { state.ghost = !state.ghost; b.classList.toggle('on', state.ghost); setGhost(); userTouch(); }
}));
sl.addEventListener('input', () => { userTouch(); state.target = null; state.p = sl.value / 1000; });
['pointerdown', 'wheel', 'keydown'].forEach((e) => renderer.domElement.addEventListener(e, userTouch));
function setGhost() {
  for (const P of parts) if (P.shell) { const m = P.obj.material; m.transparent = state.ghost; m.opacity = state.ghost ? 0.2 : 1; m.depthWrite = !state.ghost; }
}

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.9 ? 52 : 32;
  camera.updateProjectionMatrix();
  ui.classList.toggle('narrow', w < 700);
}
addEventListener('resize', resize);
resize();
camera.position.set(19, 8, 21);
if (camera.aspect < 0.9) camera.position.multiplyScalar(1.7);

const proj = new THREE.Vector3();
let last = performance.now();
function tourP(t) {
  const T = [2.5, 18, 6, 14];
  const tt = t % (T[0] + T[1] + T[2] + T[3]);
  if (tt < T[0]) return 0;
  if (tt < T[0] + T[1]) return (tt - T[0]) / T[1];
  if (tt < T[0] + T[1] + T[2]) return 1;
  return 1 - (tt - T[0] - T[1] - T[2]) / T[3];
}
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  state.idleT += dt;
  if (!state.tour && state.idleT > 25 && state.target === null) state.tour = true;
  if (state.tour) { state.tourT += dt; state.p = tourP(state.tourT); controls.autoRotate = true; controls.autoRotateSpeed = 0.7; }
  else controls.autoRotate = false;
  if (state.target !== null) {
    const d = state.target - state.p;
    const step = state.tspeed * dt;
    if (Math.abs(d) <= step) { state.p = state.target; state.target = null; } else state.p += Math.sign(d) * step;
  }
  if (state.cam) {
    state.cam.t = Math.min(1, state.cam.t + dt / 1.3);
    const e = state.cam.t * state.cam.t * (3 - 2 * state.cam.t);
    camera.position.lerpVectors(state.cam.from, state.cam.to, e);
    if (state.cam.t >= 1) state.cam = null;
  }
  const v = advance(dt);
  poseAll(state.p);
  if (state.tour) {
    const want = lerp(30, 40, sstep(0.05, 0.3, state.p) * (1 - sstep(0.85, 1, state.p) * 0.4)) * (camera.aspect < 0.9 ? 1.7 : 1);
    _v.copy(camera.position).sub(controls.target);
    _v.setLength(lerp(_v.length(), want, 0.03));
    camera.position.copy(controls.target).add(_v);
  }
  updateJacks();
  controls.update();
  renderer.render(scene, camera);
  // панели читают те же величины, что двигают детали
  const p = state.p;
  const stage = STAGES.find(([a, b]) => p >= a && p < b);
  st.textContent = stage[2]; pc.textContent = Math.round(p * 100) + '%';
  sp.textContent = Math.round(v * 3.6) + ' км/ч';
  wg.textContent = String(['b1', 'b2', 'b3'].filter((id) => byName[id + 'U'].morph.morphTargetInfluences[0] > 0.97 && byName[id + 'L'].morph.morphTargetInfluences[0] > 0.97).length);
  const len = lerp(21, 31, sstep(0.36, 0.84, p));
  ln.textContent = len.toFixed(0) + ' м';
  if (document.activeElement !== sl) sl.value = Math.round(p * 1000);
  const la = sstep(0.08, 0.13, p) * (1 - sstep(0.17, 0.23, p));
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const {id, e} of labelEls) {
    const P = byName[id];
    proj.copy(P.root.position).project(camera);
    e.style.opacity = proj.z < 1 ? la : 0;
    e.style.transform = `translate(${(proj.x * 0.5 + 0.5) * w + 8}px, ${(-proj.y * 0.5 + 0.5) * h - 8}px)`;
  }
  requestAnimationFrame(frame);
}

// кадр фильма: всё считается из времени t (с). Камера летит по заданной траектории.
const FILM = {dur: 24, fps: 30};
const FP = [[0, 0], [2.5, 0], [7.0, 0.40], [8.4, 0.46], [17.0, 0.94], [18.6, 1], [24, 1]];
function filmP(t) { for (let i = 1; i < FP.length; i++) if (t <= FP[i][0]) { const [t0, p0] = FP[i - 1], [t1, p1] = FP[i]; return lerp(p0, p1, (t - t0) / (t1 - t0)); } return 1; }
let filmT = 0;
window.__film = (t) => {
  state.tour = false; state.target = null; ui.style.display = 'none'; controls.enabled = false;
  if (t < filmT) { state.S = 0; filmT = 0; }
  while (filmT < t - 1e-9) { const dt = Math.min(1 / 60, t - filmT); state.p = filmP(filmT + dt); advance(dt); filmT += dt; }
  state.p = filmP(t);
  const p = state.p, k = t / FILM.dur;
  const ang = lerp(0.62, 0.62 - 3.4, sstep(0, 1, k) * 0.9 + k * 0.1) ;
  const rad = 30 - 9 * sstep(0.05, 0.2, k) * (1 - sstep(0.3, 0.42, k)) + 12 * sstep(0.35, 0.6, k) - 8 * sstep(0.75, 1, k);
  const hgt = lerp(8, 12, sstep(0.1, 0.4, k)) - 5 * sstep(0.72, 1, k);
  const tx = lerp(-1.5, 3.5, sstep(0.72, 1, k));
  controls.target.set(tx, 2.2, 0);
  camera.position.set(tx + Math.cos(ang) * rad, hgt, Math.sin(-ang) * rad * 0.9 + 6 * (1 - Math.min(1, k * 2)));
  camera.lookAt(controls.target);
  poseAll(p); updateJacks();
  renderer.render(scene, camera);
  return p;
};
window.__film.meta = FILM;

window.__setP = (p, ui_ = true) => { state.tour = false; state.target = null; state.p = p; state.S = 0; ui.style.display = ui_ ? '' : 'none'; };
window.__cam = (x, y, z, tx = TARGET.x, ty = TARGET.y, tz = TARGET.z) => { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.update(); };
requestAnimationFrame(frame);
window.__ready = true;
