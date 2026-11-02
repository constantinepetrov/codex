// Паровоз Mikado 2-8-2 с тендером раскладывается и собирается в трёхвагонный скоростной состав.
// Один вход: прогресс p от 0 до 1. Каждая деталь едет из своей начальной позы в конечную по формуле от p,
// ключевых кадров нет. Оболочки (котёл, бак, бункер) меняют форму через morph target: цилиндр становится кузовом.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';

const PI = Math.PI;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const C = {
  bg: 0xfaf6ee, black: 0x1f2125, steel: 0xa4a9b0, brass: 0xb98d3a, white: 0xf6f4f0,
  burg: 0x651e32, glass: 0x141d27, dark: 0x30343a, light: 0xd9dbde,
};

// ---------- сцена ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.Fog(C.bg, 60, 170);
// студия: мягкие боксы света над тёплым полом, как в примерах навыка
{
  const env = new THREE.Scene();
  env.background = new THREE.Color(0xe6e0d4);
  const sb = (w, h, x, y, z, k, tint = [1, 0.985, 0.95]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(...tint).multiplyScalar(k), side: THREE.DoubleSide}));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  sb(16, 7, -12, 11, 9, 3.0); sb(10, 10, 11, 14, -7, 2.2); sb(20, 3, 2, 5, 17, 1.7); sb(12, 4, -14, 4, -10, 1.2, [0.9, 0.95, 1]);
  const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: 0xcfc6b6, side: THREE.DoubleSide}));
  g.rotation.x = -PI / 2; g.position.y = -1.5; env.add(g);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture;
  scene.environmentIntensity = 0.85;
  pm.dispose();
}
const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 1500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = PI * 0.495;
controls.minDistance = 8;
controls.maxDistance = 90;
const TARGET = new THREE.Vector3(-2, 2.2, 0);
controls.target.copy(TARGET);

const INK_FRAG = `
  uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D tNormal;
  uniform float uNear; uniform float uFar; uniform vec2 uPx; uniform vec3 uInk; uniform float uStrength;
  varying vec2 vUv;
  float lz(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - d * (uFar - uNear)); }
  vec3 nn(vec2 uv){ return normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0); }
  void main(){
    vec4 c = texture2D(tDiffuse, vUv);
    float z0 = lz(vUv);
    float zl = lz(vUv - vec2(uPx.x, 0.0)), zr = lz(vUv + vec2(uPx.x, 0.0));
    float zd = lz(vUv - vec2(0.0, uPx.y)), zu = lz(vUv + vec2(0.0, uPx.y));
    float lap = (abs(zl + zr - 2.0 * z0) + abs(zu + zd - 2.0 * z0)) / max(z0, 1e-3);
    float eD = smoothstep(0.004, 0.016, lap);
    vec3 n0 = nn(vUv);
    float eN = max(max(1.0 - dot(n0, nn(vUv - vec2(uPx.x, 0.0))), 1.0 - dot(n0, nn(vUv + vec2(uPx.x, 0.0)))),
                   max(1.0 - dot(n0, nn(vUv - vec2(0.0, uPx.y))), 1.0 - dot(n0, nn(vUv + vec2(0.0, uPx.y)))));
    float e = max(eD, smoothstep(0.3, 0.6, eN));
    e *= 1.0 - smoothstep(70.0, 130.0, z0);
    c.rgb = mix(c.rgb, uInk, e * uStrength);
    gl_FragColor = c;
  }`;
let composer, gtao, inkPass;
const QUAL = {ao: true};
window.__quality = (o) => { Object.assign(QUAL, o); if (o.low !== undefined) LOWU.value = o.low ? 1 : 0; if (gtao) gtao.needsSwap = QUAL.ao; if (o.shadow) { sun.shadow.mapSize.set(o.shadow, o.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; } if (o.pr) { renderer.setPixelRatio(o.pr); resize(); } };
function buildComposer() {
  const rt = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 0});
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({radius: 0.5, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12});
  gtao.normalMaterial.side = THREE.DoubleSide;
  // слабая машина: AO выключается, но карты нормалей и глубины для контура остаются
  const gtaoRender = gtao.render.bind(gtao);
  gtao.render = (r, writeBuffer, readBuffer, ...rest) => {
    if (QUAL.ao) return gtaoRender(r, writeBuffer, readBuffer, ...rest);
    gtao._overrideVisibility();
    gtao._renderOverride(r, gtao.normalMaterial, gtao.normalRenderTarget, 0x7777ff, 1.0);
    gtao._restoreVisibility();
  };
  composer.addPass(gtao);
  inkPass = new ShaderPass(new THREE.ShaderMaterial({
    uniforms: {tDiffuse: {value: null}, tDepth: {value: gtao.depthTexture}, tNormal: {value: gtao.normalTexture}, uNear: {value: camera.near}, uFar: {value: camera.far},
      uPx: {value: new THREE.Vector2(1 / 1920, 1 / 1080)}, uInk: {value: new THREE.Color().setRGB(0.07, 0.06, 0.055, THREE.LinearSRGBColorSpace)}, uStrength: {value: 0.55}},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: INK_FRAG,
  }));
  composer.addPass(inkPass);
  composer.addPass(new OutputPass());
}

const sun = new THREE.DirectionalLight(0xfff4e4, 2.4);
sun.position.set(-18, 38, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -44, right: 44, top: 30, bottom: -30, near: 5, far: 120});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
sun.shadow.radius = 6;
sun.shadow.blurSamples = 16;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d0c0, 0.5));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({color: 0xe3ddd0, roughness: 1, metalness: 0}));
ground.rotation.x = -PI / 2;
ground.position.y = -0.14;
ground.receiveShadow = true;
scene.add(ground);
const ballast = new THREE.Mesh(new THREE.BoxGeometry(1200, 0.12, 3.6), new THREE.MeshStandardMaterial({color: 0xc9c0b0, roughness: 1}));
ballast.position.y = -0.2;
ballast.receiveShadow = true;
scene.add(ballast);
const railMat = new THREE.MeshStandardMaterial({color: 0x8d9198, roughness: 0.4, metalness: 0.7});
for (const s of [-1, 1]) {
  const r = new THREE.Mesh(new THREE.BoxGeometry(1200, 0.14, 0.1), railMat);
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

// кузовная оболочка: ржавый чёрный металл с клёпкой превращается в белый лакированный кузов с вдавленными окнами.
// Всё нарисовано в шейдере по координатам оболочки, поэтому едет и меняет форму вместе с ней.
const LOWU = {value: 0};
function shellMaterial(up, win, bands, dimA, dimB, glass = 0, led = 0) {
  const m = new THREE.MeshPhysicalMaterial({color: C.black, roughness: 0.6, metalness: 0.1, envMapIntensity: 0.7, clearcoat: 1, clearcoatRoughness: 0.2, side: THREE.DoubleSide});
  const uni = {uGlass: {value: glass}, uLed: {value: led}, uM: {value: 0}, uUp: {value: up}, uWin: {value: win}, uBands: {value: bands}, uDimA: {value: new THREE.Vector2(...dimA)}, uDimB: {value: new THREE.Vector2(...dimB)}};
  m.userData.uni = uni;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni); sh.uniforms.uLow = LOWU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vP;
uniform float uM,uUp,uWin,uBands,uLow,uGlass,uLed; uniform vec2 uDimA,uDimB;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ return 0.5 * vn(p) + 0.25 * vn(p * 2.1) + 0.125 * vn(p * 4.3) + 0.0625 * vn(p * 8.7); }
float line(float x, float w){ return 1.0 - smoothstep(0.0, w, abs(fract(x + 0.5) - 0.5)); }
vec3 perturbN(vec3 sp, vec3 sn, vec2 dH, float fd){
  vec3 sx = normalize(dFdx(sp)), sy = normalize(dFdy(sp));
  vec3 r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1) * fd;
  vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * sn - g);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float u = vP.x, v = vP.y;
      float n = fbm(vec2(u * 14.0, v * 10.0));
      float n2 = fbm(vec2(u * 9.0, v * 6.0) + 3.0);
      float k = smoothstep(0.0, 0.12, uM * 1.28 - (0.3 * n + 0.7 * u));
      vec2 dim = mix(uDimA, uDimB, uM);
      float cu = u * dim.x, cv = v * dim.y;
      // швы: продольные раз в 1,0 м, поперечные раз в 1,3 м; заклёпки по швам
      float sU = line(cu / 1.0, 0.03), sV = line(cv / 1.3, 0.03);
      float seam = max(sU, sV);
      float nearSeam = max(1.0 - smoothstep(0.0, 0.14, abs(fract(cu / 1.0 + 0.5) - 0.5)), 1.0 - smoothstep(0.0, 0.14, abs(fract(cv / 1.3 + 0.5) - 0.5)));
      float rv = length(fract(vec2(cu, cv) / 0.1) - 0.5);
      float rivet = (1.0 - smoothstep(0.16, 0.30, rv)) * nearSeam;
      // котельные бандажи только у паровоза
      float bandH = 0.0;
      for (int i = 0; i < 4; i++) bandH += 1.0 - smoothstep(0.0, 0.10, abs(cu - (float(i) * 1.15 + 0.3)));
      bandH = clamp(bandH, 0.0, 1.0) * uBands;
      vec3 steelBlack = vec3(0.012, 0.013, 0.015);
      vec3 loco = mix(steelBlack, vec3(0.07, 0.075, 0.08), bandH);
      loco = mix(loco, vec3(0.11, 0.04, 0.022), smoothstep(0.6, 0.78, n2) * 0.8);
      loco += vec3(0.018) * seam + vec3(0.05) * rivet;
      vec3 body = vec3(0.90, 0.89, 0.87);
      body = mix(body, body * vec3(0.72, 0.70, 0.66), smoothstep(0.55, 0.82, fbm(vec2(u * 5.0, v * 4.0) + 7.0)) * 0.55);
      float shoulder = min(v, 1.0 - v);
      float stripe = 1.0 - smoothstep(0.022, 0.034, shoulder);
      float wv = smoothstep(0.075, 0.09, shoulder) * (1.0 - smoothstep(0.19, 0.205, shoulder));
      float wu = smoothstep(0.0, 0.02, fract(u * 9.0)) * (1.0 - smoothstep(0.66, 0.68, fract(u * 9.0))) * step(0.05, u) * step(u, 0.95);
      float win = wv * wu * uWin * uUp;
      vec3 col = mix(body, vec3(0.130, 0.013, 0.032), stripe);
      col = mix(col, vec3(0.006, 0.012, 0.02), win);
      col = col * (1.0 - 0.18 * seam);
      // лобовое стекло: трапеция по верху носа, сужается к кончику
      float gv = v - 0.5;
      float ghw = mix(0.30, 0.07, smoothstep(0.12, 0.74, u));
      float glassM = uGlass * smoothstep(0.10, 0.14, u) * (1.0 - smoothstep(0.70, 0.76, u)) * (1.0 - smoothstep(ghw - 0.012, ghw, abs(gv)));
      col = mix(col, vec3(0.003, 0.007, 0.011), glassM);
      float shl = min(v, 1.0 - v);
      float ledM = uLed * step(0.64, u) * (1.0 - smoothstep(0.86, 0.92, u)) * (1.0 - smoothstep(0.0, 0.016, abs(shl - (0.075 + 0.07 * (u - 0.64) / 0.26))));
      diffuseColor.rgb = mix(loco, col, k);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.62, 0.30, k) * (0.8 + 0.5 * n) + 0.25 * bandH * (1.0 - k);
      roughnessFactor = mix(roughnessFactor, 0.06, glassM * k);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(0.28, 0.04, k);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float hL = bandH * 1.2 - sU * 0.5 - sV * 0.5 + rivet * 0.9 + n * 0.25;
        float hT = -glassM * 0.7 - win * 1.4 - (max(sU * step(0.5, fract(cu / 3.0)), sV) * 0.5) + rivet * 0.5 + stripe * 0.12 + n * 0.1;
        float hh = mix(hL, hT, k);
        vec2 dH = vec2(dFdx(hh), dFdy(hh)) * 2.2;
        normal = perturbN(-vViewPosition, normal, dH, faceDirection);
      }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      material.clearcoat = k * (0.7 + 0.3 * glassM); material.clearcoatRoughness = 0.16;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * ledM * k * 3.0;`);
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
      w *= Math.pow(Math.max(1 - Math.pow(t, 1.7), 0), 0.5);
      h *= Math.pow(Math.max(1 - Math.pow(t, 1.35), 0), 0.55);
      yc = P.yc - 0.85 * Math.pow(t, 2.2);
      P._t = t;
    }
    let [z, y] = superSec(phi, w, h, P.n);
    if (P.nose && y > 0) z *= 1 - 0.3 * Math.pow(P._t, 1.2) * Math.min(1, y / (h / 2 + 1e-6)); // верх сужается: обтекаемый скос
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
    label: o.label, tint: o.tint, morph: o.morph, spin: o.spin, wheel: o.wheel, shell: o.shell, mod: o.mod, sh: o.sh, emis: o.emis};
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
  {id: 'nose', k: 0, label: 'Дымовая коробка', A: {x0: 5.0, L: 1.55, w: 2.25, h: 2.25, n: 2, yc: 2.9}, B: {...BODY, x0: 9.2, L: 5.0, nose: 'front'}, win: 0, bands: 0},
  {id: 'b1', k: 1, label: 'Котёл', A: {x0: 0.75, L: 4.25, w: 2.1, h: 2.1, n: 2, yc: 2.9}, B: {...BODY, x0: 4.0, L: 5.2}, win: 1, bands: 1},
  {id: 'b2', k: 2, label: 'Топка', A: {x0: -2.7, L: 3.4, w: 2.5, h: 2.5, n: 2, yc: 2.85}, B: {...BODY, x0: -6.4, L: 10.0}, win: 1, bands: 1},
  {id: 'tail', k: 3, label: 'Угольный бункер', A: {x0: -8.0, L: 3.8, w: 2.7, h: 1.1, n: 4, yc: 3.45}, B: {...BODY, x0: -11.8, L: 5.0}, win: 1, bands: 0},
  {id: 'b3', k: 4, label: 'Бак тендера', A: {x0: -11.6, L: 7.4, w: 2.6, h: 2.6, n: 2, yc: 2.0}, B: {...BODY, x0: -16.8, L: 5.0, nose: 'tail'}, win: 0, bands: 0},
];
const SIDE = [1, -1, 1, -1, 1], ROLL = [1, -1, 1, -1, 1];
const MODOBJ = {};
const MD = [0.04, 0.14, 0.30, 0.16, 0.04]; // порядок старта модулей: носовые вперёд, хвостовые назад, середина последней
SHELLS.forEach((S) => {
  const mod = {k: S.k, side: SIDE[S.k], dir: ROLL[S.k], ycA: S.A.yc, ycB: S.B.yc};
  MODOBJ[S.id] = mod;
  for (const up of [1, 0]) {
    const {g, cA, cB} = shellGeo(S.A, S.B, !!up);
    const m = new THREE.Mesh(g, shellMaterial(up, S.win, S.bands, [S.A.L, Math.PI * S.A.w / 2], [S.B.L, 5.2], S.id === 'nose' && up ? 1 : 0, S.id === 'nose' && up ? 1 : 0));
    m.updateMorphTargets();
    const sd = SIDE[S.k];
    const pz = (w) => (up ? 1 : -1) * sd * w / 2;
    add(S.id + (up ? 'U' : 'L'), {
      obj: m, A: pose(cA), B: pose(cB), d: MD[S.k], arc: 0.3, label: S.label, morph: m, shell: true, mod,
      sh: {up, side: sd, pivA: new THREE.Vector3(0, S.A.yc - cA[1], pz(S.A.w)), pivB: new THREE.Vector3(0, S.B.yc - cB[1], pz(S.B.w * (S.B.nose ? 0.8 : 1)))},
    });
  }
  // начинка: пучок труб, шестерни и бордовый блок. Едет вместе с модулем и видна, когда оболочка раскрыта
  const core = new THREE.Group();
  const cm = mat(C.dark, {metalness: 0.7, roughness: 0.4}), bm = mat(C.brass, {metalness: 0.8}), rm = mat(C.steel, {metalness: 0.85});
  const hot = new THREE.MeshStandardMaterial({color: 0x3a0e18, emissive: 0x651e32, emissiveIntensity: 0.9, roughness: 0.5}); mats.push(hot);
  core.add(cyl(0.3, 1, cm, 16));
  for (let i = 0; i < 6; i++) { const t = cyl(0.12, 1, i % 2 ? rm : bm, 10); t.position.set(0, Math.sin(i * PI / 3) * 0.6, Math.cos(i * PI / 3) * 0.6); core.add(t); }
  for (const x of [-0.32, 0.32]) { const gr = cyl(0.85, 0.04, cm, 14); gr.position.x = x; core.add(gr); const h2 = cyl(0.5, 0.05, bm, 14); h2.position.x = x; core.add(h2); }
  core.add(at(box(0.5, 0.34, 0.5, hot), 0, 0.15, 0));
  const xcA = S.A.x0 + S.A.L / 2, xcB = S.B.x0 + S.B.L / 2;
  add('core_' + S.id, {obj: core, A: pose([xcA, S.A.yc, 0], [0, 0, 0], [S.A.L * 0.9, S.A.w / 2 * 0.8, S.A.h / 2 * 0.8]), B: pose([xcB, 1.75, 0], [0, 0, 0], [S.B.L * 0.8, 1.0, 1.0]), d: MD[S.k], arc: 0.3, label: 'Силовой блок', mod});
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
  const bx = BOGIE_X[Math.floor(k / 2)] + (k % 2 ? -1.2 : 1.2);
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
  const sm = mat(C.steel, {metalness: 0.85, roughness: 0.3}), dm = mat(C.dark, {metalness: 0.7, roughness: 0.4}), brm = mat(0x6d7077, {metalness: 0.8, roughness: 0.35});
  const helix = new THREE.CatmullRomCurve3(Array.from({length: 40}, (_, i) => { const t = i / 39; return new THREE.Vector3(Math.cos(t * PI * 10) * 0.1, t * 0.3 - 0.15, Math.sin(t * PI * 10) * 0.1); }));
  const hg = new THREE.TubeGeometry(helix, 120, 0.018, 6);
  for (const x of [-1.2, 1.2]) for (const z of [-1.2, 1.2]) { const sp = new THREE.Mesh(hg, sm); sp.position.set(x, 0.22, z * 0.96); g.add(sp); }
  for (const x of [-1.2, 1.2]) {
    const mo = cylZ(0.2, 1.1, dm, 18); mo.position.set(x * 0.85, 0.1, 0); g.add(mo);
    for (const z of [-0.45, 0.45]) { const bd = cylZ(0.3, 0.03, brm, 24); bd.position.set(x, -0.04, z); g.add(bd); }
  }
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
add('cabFront', {obj: new THREE.Mesh(ringGeo(3.0, 2.8, 2.6, 2.5, 0.1), cabM), A: pose([0.8, 2.85, 0]), B: pose([3.8, 2.4, 0]), d: 0.2, ex: [-0.8, 3.5, 3.4], tw: {axis: [0, 1, 0], ang: 1.2}, arc: 1.4, label: 'Стенка кабины', tint: [C.black, C.dark, cabM]});
const cabM2 = mat(C.black, {metalness: 0.4});
add('cabBack', {obj: new THREE.Mesh(ringGeo(3.0, 2.8, 2.6, 2.5, 0.1), cabM2), A: pose([-3.3, 2.85, 0]), B: pose([-6.6, 2.4, 0]), d: 0.4, ex: [-1.5, 3.2, -3.4], tw: {axis: [0, 1, 0], ang: -1.2}, arc: 1.6, label: 'Задняя стенка', tint: [C.black, C.dark, cabM2]});
const roofM = mat(C.black, {metalness: 0.4});
add('cabRoof', {obj: grp(box(3.0, 0.1, 3.0, roofM)), A: pose([-1.9, 4.3, 0]), B: pose([10.2, 3.9, 0], [0, 0, -0.18], [0.3, 0.45, 0.42]), d: 0.45, ex: [-1.0, 6.0, 1.0], tw: {axis: [0, 0, 1], ang: 0.8}, flip: true, arc: 3.0, label: 'Крыша кабины', tint: [C.black, C.glass, roofM]});
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
    const lm = new THREE.MeshStandardMaterial({color: 0xdfe6ee, emissive: 0xcfe6ff, emissiveIntensity: 0, roughness: 0.25}); mats.push(lm);
    add('mark' + (s > 0 ? 'L' : 'R'), {obj: grp(cyl(0.12, 0.16, lm, 14)), A: pose([7.1, 1.35, s * 0.95]), B: pose([13.6, 1.85, s * 0.55], [0, 0, 0], [1, 0.8, 0.8]), d: 0.4, ex: [1.0, 1.2, s * 2.0], arc: 1.8, label: 'Маркерный огонь', emis: lm});
  }
  const wm = mat(C.brass, {metalness: 0.7});
  add('whistle', {obj: grp(cylV(0.1, 0.5, wm, 14)), A: pose([1.0, 4.25, 0.5]), B: pose([-4.0, 4.1, 0], [0, 0, 0], [3.0, 0.4, 5.5]), d: 0.58, ex: [0.0, 3.4, 1.0], tw: {axis: [0, 0, 1], ang: 2.0}, flip: true, arc: 2.2, label: 'Свисток'});
}

// шарниры: створки раскрываются, пока модуль едет, и защёлкиваются на месте
for (const sd of ['L', 'R']) {
  const sg = sd === 'L' ? 1 : -1;
  byName['cabW' + sd].hg = {axis: [1, 0, 0], piv: [0, -1.2, 0], ang: sg * 1.6};
  byName['run' + sd].hg = {axis: [1, 0, 0], piv: [0, 0, -sg * 0.25], ang: sg * 1.5};
  byName['tpl' + sd].hg = {axis: [1, 0, 0], piv: [0, -0.25, 0], ang: sg * 1.5};
}
byName.cabRoof.hg = {axis: [0, 0, 1], piv: [-1.5, 0, 0], ang: 0.9};
byName.chim.hg = {axis: [0, 0, 1], piv: [0, -0.5, 0], ang: -1.4};
byName.pilot.hg = {axis: [0, 0, 1], piv: [-0.5, -0.4, 0], ang: -0.7};
byName.door.hg = {axis: [0, 1, 0], piv: [0, 0, 1.0], ang: -1.3};
byName.door.d = 0; byName.pilot.d = 0;


// ---------- детализация (подменяем простые формы на модели с профилем) ----------
const lathe = (pts, mt, seg = 32) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mt);
function swap(name, group, tintMat) {
  const P = byName[name];
  P.root.remove(P.obj); P.obj = group; P.root.add(group);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  if (tintMat && P.tint) P.tint[2] = tintMat;
}
{
  const bm = () => mat(C.black, {metalness: 0.5, roughness: 0.5}), steel = mat(C.steel, {metalness: 0.85, roughness: 0.3}), brass = mat(C.brass, {metalness: 0.85, roughness: 0.3});
  // дымовая труба: раструб, шейка, венчик
  let mt = bm();
  swap('chim', grp(lathe([[0.62, -0.5], [0.5, -0.46], [0.36, -0.3], [0.27, -0.1], [0.25, 0.3], [0.29, 0.45], [0.42, 0.52], [0.42, 0.56], [0.27, 0.56], [0.0, 0.5]], mt)), mt);
  // паровой колпак и песочница: купола с кольцами и клапаном
  mt = bm();
  swap('dome', grp(lathe([[0.7, -0.35], [0.66, -0.3], [0.55, -0.15], [0.5, 0.1], [0.5, 0.3], [0.4, 0.42], [0.2, 0.5], [0.0, 0.52]], mt), at(cylV(0.08, 0.3, brass, 12), 0, 0.62, 0), at(lathe([[0.2, 0], [0.12, 0.05], [0.0, 0.08]], brass, 12), 0, 0.48, 0)), mt);
  mt = bm();
  swap('sand', grp(lathe([[0.55, -0.3], [0.5, -0.25], [0.45, 0], [0.45, 0.2], [0.34, 0.32], [0.14, 0.38], [0.0, 0.4]], mt), at(cylV(0.18, 0.06, steel, 14), 0, 0.42, 0)), mt);
  mt = bm();
  swap('whistle', grp(lathe([[0.1, -0.2], [0.08, 0], [0.12, 0.2], [0.0, 0.26]], mt, 12), at(cylV(0.04, 0.3, brass, 8), 0, -0.3, 0)), mt);
  // дверца дымовой коробки: обод, тарелка, запоры, штурвал
  mt = mat(C.dark, {metalness: 0.6});
  const door = new THREE.Group();
  door.add(cyl(1.0, 0.1, mt, 48));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 8, 48), steel); rim.rotation.y = PI / 2; rim.position.x = 0.05; door.add(rim);
  const boss = lathe([[0.0, 0], [0.34, 0], [0.3, 0.06], [0.0, 0.1]], steel, 24); boss.rotation.z = -PI / 2; boss.position.x = 0.05; door.add(boss);
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; const dg = box(0.14, 0.2, 0.08, steel); dg.position.set(0.08, Math.sin(a) * 0.9, Math.cos(a) * 0.9); dg.rotation.x = -a; door.add(dg); }
  const hw = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), brass); hw.rotation.y = PI / 2; hw.position.x = 0.2; door.add(hw);
  for (let i = 0; i < 4; i++) { const sp = box(0.02, 0.4, 0.03, brass); sp.position.x = 0.2; sp.rotation.x = i * PI / 4; door.add(sp); }
  door.add(at(cyl(0.05, 0.2, steel, 8), 0.14, 0, 0));
  swap('door', door, mt);
  // фара: корпус, линза, козырёк
  mt = mat(C.steel, {metalness: 0.8});
  const lensM = new THREE.MeshStandardMaterial({color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 0.0, roughness: 0.2}); mats.push(lensM);
  byName.lamp.emis = lensM;
  swap('lamp', grp(cyl(0.3, 0.45, mt, 24), at(cyl(0.24, 0.05, lensM, 24), 0.24, 0, 0), at(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 20, 1, true, -1.2, 2.4), mt), 0.18, 0.05, 0)), mt);
  // пилот: рейки клином и рама
  mt = bm();
  const pil = new THREE.Group();
  for (let i = -5; i <= 5; i++) { const bar = box(1.1, 0.05, 0.09, mt); bar.position.set(0.0, 0.0 - Math.abs(i) * 0.012, i * 0.2); bar.rotation.z = -0.3 - Math.abs(i) * 0.02; pil.add(bar); }
  for (const z of [-1.1, 1.1]) pil.add(at(box(1.1, 0.12, 0.08, steel), 0.0, -0.1, z));
  pil.add(at(box(0.08, 0.5, 2.3, mt), 0.52, -0.2, 0));
  for (const z of [-0.5, 0.5]) pil.add(at(cylV(0.04, 0.4, steel, 8), 0.6, -0.4, z));
  swap('pilot', pil, mt);
  // крыша кабины: арка с выступом. На скоростном поезде становится выгнутым лобовым стеклом
  mt = bm();
  const archG = new THREE.CylinderGeometry(1.9, 1.9, 3.0, 28, 1, true, PI / 2 - 0.85, 1.7); archG.rotateZ(PI / 2); archG.translate(0, -1.9, 0);
  mt.side = THREE.DoubleSide;
  const arch = new THREE.Mesh(archG, mt);
  swap('cabRoof', grp(arch, at(box(3.1, 0.04, 0.04, steel), 0, -0.02, 1.43), at(box(3.1, 0.04, 0.04, steel), 0, -0.02, -1.43)), mt);
  // гармошка: четыре гофры вместо одной рамки
  for (const [id, a] of [['cabFront', 0], ['cabBack', 1]]) {
    mt = mat(C.black, {metalness: 0.2, roughness: 0.8});
    const bel = new THREE.Group();
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(ringGeo(3.0 + (i % 2) * 0.06, 2.8 + (i % 2) * 0.06, 2.6, 2.5, 0.05), mt); r.position.x = (i - 1.5) * 0.12; bel.add(r); }
    swap(id, bel, mt);
  }
  // паровые трубы вдоль котла: изогнутые, с фланцами. На поезде лежат кабель-каналами по крыше
  for (const sd of [1, -1]) {
    mt = mat(C.steel, {metalness: 0.85, roughness: 0.3});
    const crv = new THREE.CatmullRomCurve3([new THREE.Vector3(-2, 0.3, 0), new THREE.Vector3(-1.2, 0.5, 0), new THREE.Vector3(0.2, 0.15, 0), new THREE.Vector3(1.4, -0.3, 0), new THREE.Vector3(2.1, -0.6, 0)]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(crv, 40, 0.07, 8), mt);
    const pg = grp(tube); for (const t of [0.05, 0.5, 0.95]) { const f = cyl(0.12, 0.04, brass, 12); const p0 = crv.getPoint(t); f.position.copy(p0); f.rotation.z = PI / 2 + Math.atan2(crv.getTangent(t).y, crv.getTangent(t).x); pg.add(f); }
    add('spipe' + (sd > 0 ? 'L' : 'R'), {obj: pg, A: pose([2.7, 3.55, sd * 1.15]), B: pose([6.7, 3.95, sd * 0.9], [0, 0, 0], [1.2, 0.2, 1]), d: 0.2, arc: 0.4, label: 'Паровая труба', tint: [C.steel, C.light, mt]});
  }
  // поручни котла: две трубы на стойках. Стойки едут вместе с котлом, на поезде встают вдоль крыши
  for (const sd of [1, -1]) {
    mt = mat(C.steel, {metalness: 0.9, roughness: 0.25});
    add('rail' + (sd > 0 ? 'L' : 'R'), {obj: grp(cyl(0.025, 4.6, mt, 8)), A: pose([3.4, 3.75, sd * 1.2]), B: pose([6.6, 3.9, sd * 1.32]), d: 0.16, arc: 0.4, label: 'Поручень'});
  }
}

// клапанный механизм Вальсхарта: эксцентриковая тяга, радиальная тяга и комбинационный рычаг, по три штанги на сторону.
// Точки считаются от угла колеса; на поезде штанги встают тягами у тележек.
function barAt(p0, p1, z) {
  return {p: new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, z), q: Q(0, 0, Math.atan2(p1[1] - p0[1], p1[0] - p0[0])), s: new THREE.Vector3(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 2.0, 1, 1)};
}
for (const sd of [1, -1]) {
  const nm = sd > 0 ? 'L' : 'R';
  const pts = () => {
    const ph = dyn.phi + (sd > 0 ? 0 : PI / 2);
    const E = [ROD.drvX[1] + 0.2 * Math.cos(ph + PI / 2), 0.8 + 0.2 * Math.sin(ph + PI / 2)];
    const Lk = [3.1, 1.45 + 0.26 * Math.sin(ph + PI / 2)];
    const g = mainGeom(sd), Cx = [g.xc - 0.55, 1.12 + 0.12 * Math.sin(ph)];
    return {E, Lk, Cx, X: [g.xc, ROD.yc]};
  };
  const mk = (id, lab, f, B, d) => {
    const bm = mat(C.steel, {metalness: 0.9, roughness: 0.28}), pm = mat(C.brass);
    add(id, {obj: grp(box(2.0, 0.07, 0.04, bm), at(cylZ(0.05, 0.08, pm, 10), -1, 0, 0), at(cylZ(0.05, 0.08, pm, 10), 1, 0, 0)), Afn: f, B, d, arc: 0.4, label: lab});
  };
  mk('ecc' + nm, 'Эксцентриковая тяга', () => { const q = pts(); return barAt(q.E, q.Lk, sd * 1.07); }, pose([BOGIE_X[0] - 0.4 * sd, 0.82, sd * 1.12], [0, 0, 0.25 * sd], [0.9, 1, 1]), 0.62);
  mk('rad' + nm, 'Радиальная тяга', () => { const q = pts(); return barAt(q.Lk, q.Cx, sd * 1.1); }, pose([BOGIE_X[1] - 0.2 * sd, 0.82, sd * 1.12], [0, 0, -0.2 * sd], [0.8, 1, 1]), 0.66);
  mk('cmb' + nm, 'Комбинационный рычаг', () => { const q = pts(); return barAt(q.Cx, q.X, sd * 1.12); }, pose([BOGIE_X[2] - 0.5 * sd, 0.8, sd * 1.12], [0, 0, 0.1], [0.4, 1, 1]), 0.7);
}
// люки бака тендера: из них получаются крышевые блоки хвостового вагона
for (const [id, xA, xB] of [['hatch1', -9.4, -9.0], ['hatch2', -6.9, -13.4]]) {
  const mt = mat(C.black, {metalness: 0.5, roughness: 0.45}), br = mat(C.brass, {metalness: 0.85});
  add(id, {obj: grp(lathe([[0.5, -0.05], [0.46, 0.02], [0.4, 0.12], [0.3, 0.16], [0.0, 0.17]], mt, 24), at(cylV(0.05, 0.1, br, 8), 0, 0.2, 0)), A: pose([xA, 3.4, 0]), B: pose([xB, 3.95, 0], [0, 0, 0], [1.3, 0.9, 1.5]), d: 0.7, arc: 0.4, label: 'Люк', tint: [C.black, C.white, mt]});
}

// ---------- мелочи паровоза: каждая деталь едет в своё место на поезде ----------
{
  const bm = () => mat(C.black, {metalness: 0.5, roughness: 0.45}), steel = () => mat(C.steel, {metalness: 0.9, roughness: 0.28}), brass = () => mat(C.brass, {metalness: 0.85, roughness: 0.3});
  const tube = (pts, r, mt, seg = 40) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 8), mt);
  // номерной щиток над дверцей: гладкий, без цифр
  { const mt = bm(); add('nplate', {obj: grp(box(0.05, 0.42, 0.78, mt), at(box(0.07, 0.34, 0.7, steel()), 0.01, 0, 0)), A: pose([6.6, 3.88, 0]), B: pose([14.0, 2.5, 0], [0, 0, 0.3], [1, 0.7, 0.5]), d: 0.02, mod: MODOBJ.nose, arc: 0.3, label: 'Номерной щиток', tint: [C.black, C.light, mt]}); }
  // лестницы пилота: два столба и перекладины. На поезде встают поручнями у дверей
  for (const sd of [1, -1]) {
    const mt = steel(), L = new THREE.Group();
    for (const z of [-0.18, 0.18]) L.add(at(cylV(0.025, 0.95, mt, 8), 0, 0, z));
    for (let i = 0; i < 5; i++) L.add(at(cylZ(0.02, 0.36, mt, 6), 0, -0.4 + i * 0.2, 0));
    add('lad' + (sd > 0 ? 'L' : 'R'), {obj: L, A: pose([6.9, 1.4, sd * 0.95], [0, 0, 0.2]), B: pose([4.7, 1.55, sd * 1.58]), d: 0.02, arc: 0.3, label: 'Лестница пилота'});
  }
  // ступени кабины: две подножки на сторону. На поезде встают под дверью хвостового вагона
  for (const sd of [1, -1]) {
    const mt = bm(), St = new THREE.Group();
    for (let i = 0; i < 2; i++) St.add(at(box(0.7, 0.05, 0.34, mt), 0, i * 0.4, i * 0.15));
    for (const x of [-0.3, 0.3]) St.add(at(box(0.04, 0.5, 0.04, mt), x, 0.2, 0.0));
    add('stp' + (sd > 0 ? 'L' : 'R'), {obj: St, A: pose([-3.0, 0.9, sd * 1.5]), B: pose([-7.9, 0.75, sd * 1.64]), d: 0.5, arc: 0.3, label: 'Ступени кабины', tint: [C.black, C.dark, mt]});
  }
  // воздушный резервуар: в поезде лежит под полом среднего вагона
  { const mt = steel(); const T = grp(cyl(0.28, 1.8, mt, 24), at(lathe([[0.28, 0], [0.22, 0.1], [0.0, 0.16]], mt, 20), 0.9, 0, 0), at(lathe([[0.28, 0], [0.22, 0.1], [0.0, 0.16]], mt, 20), -0.9, 0, 0)); T.children[1].rotation.z = -PI / 2; T.children[2].rotation.z = PI / 2;
    T.add(at(box(0.08, 0.5, 0.08, bm()), -0.5, -0.3, 0), at(box(0.08, 0.5, 0.08, bm()), 0.5, -0.3, 0));
    add('airtank', {obj: T, A: pose([1.0, 1.3, 1.42]), B: pose([-1.4, 0.65, 0.0]), d: 0.3, mod: MODOBJ.b2, arc: 0.3, label: 'Воздушный резервуар', tint: [C.steel, C.light, mt]}); }
  // воздушный насос: два сдвоенных цилиндра. В поезде компрессор под полом головного вагона
  { const mt = bm(); const P = grp(cylV(0.2, 0.7, mt, 18), at(cylV(0.14, 0.5, steel(), 14), 0, 0.55, 0), at(cylV(0.1, 0.1, brass(), 10), 0, 0.85, 0), at(box(0.5, 0.06, 0.4, mt), 0, -0.35, 0));
    add('airpump', {obj: P, A: pose([5.1, 2.3, -1.28]), B: pose([7.7, 0.75, 0.0], [0, 0, PI / 2]), d: 0.04, mod: MODOBJ.nose, arc: 0.3, label: 'Воздушный насос', tint: [C.black, C.dark, mt]}); }
  // турбогенератор прожектора: на поезде крышевой блок
  { const mt = bm(); const G = grp(cyl(0.2, 0.6, mt, 18), at(lathe([[0.2, 0], [0.17, 0.08], [0.0, 0.14]], steel(), 16), 0.3, 0, 0), at(box(0.3, 0.3, 0.3, steel()), -0.1, 0.2, 0)); G.children[1].rotation.z = -PI / 2;
    add('gener', {obj: G, A: pose([5.8, 3.65, 0.95]), B: pose([5.6, 4.05, 0.7], [0, 0, 0], [1.5, 0.5, 1.6]), d: 0.1, mod: MODOBJ.nose, arc: 0.3, label: 'Турбогенератор', tint: [C.black, C.white, mt]}); }
  // колокол: в поезде становится сигнальным гудком на крыше
  { const mt = brass(); add('bell', {obj: grp(lathe([[0.3, 0], [0.26, 0.08], [0.2, 0.22], [0.12, 0.3], [0.0, 0.34]], mt, 20), at(box(0.45, 0.06, 0.1, bm()), 0, 0.36, 0)), A: pose([4.6, 4.05, 0]), B: pose([8.4, 4.0, -0.5], [0, 0, 0], [0.8, 0.7, 0.8]), d: 0.12, mod: MODOBJ.b1, arc: 0.3, label: 'Колокол'}); }
  // питательная труба по котлу: на поезде кабель-канал по крыше
  { const mt = steel(); const F = grp(tube([[-1.7, 0, 0], [-0.8, 0.05, 0], [0.8, 0.0, 0], [1.7, -0.1, 0]], 0.05, mt, 30)); for (const x of [-1.2, 0, 1.2]) F.add(at(cyl(0.08, 0.05, brass(), 10), x, 0.02, 0));
    add('feed', {obj: F, A: pose([2.9, 2.45, 1.18]), B: pose([7.2, 4.0, -0.9], [0, 0, 0], [1.4, 1, 1]), d: 0.14, mod: MODOBJ.b1, arc: 0.3, label: 'Питательная труба'}); }
  // песочные трубки к колёсам: две пары. В поезде тормозные магистрали тележек
  for (const sd of [1, -1]) {
    const mt = steel(); const Sg = grp(tube([[0, 0.5, 0], [0.1, 0.1, 0.05 * sd], [0.15, -0.35, 0.12 * sd], [0.3, -0.62, 0.15 * sd]], 0.025, mt, 20), tube([[0.5, 0.5, 0], [0.6, 0.1, 0.05 * sd], [0.7, -0.35, 0.12 * sd], [0.8, -0.62, 0.15 * sd]], 0.025, mt, 20));
    add('sandp' + (sd > 0 ? 'L' : 'R'), {obj: Sg, A: pose([2.4, 1.5, sd * 1.08]), B: pose([BOGIE_X[1] - 0.3, 0.9, sd * 1.12]), d: 0.2, arc: 0.3, label: 'Песочные трубки'});
  }
  // тормозная рычажная передача: балка с колодками. В поезде тормозная балка тележки
  for (const sd of [1, -1]) {
    const mt = bm(); const Bg = grp(box(3.4, 0.08, 0.08, mt)); for (const x of [-1.5, -0.5, 0.5, 1.5]) Bg.add(at(box(0.18, 0.28, 0.09, steel()), x, 0.1, 0), at(cylV(0.02, 0.35, steel(), 6), x, -0.2, 0));
    add('brk' + (sd > 0 ? 'L' : 'R'), {obj: Bg, A: pose([0.9, 0.55, sd * 0.52]), B: pose([BOGIE_X[2], 0.58, sd * 0.52]), d: 0.5, arc: 0.3, label: 'Тормозная передача', tint: [C.black, C.dark, mt]});
  }
  // ящик с инструментом на тендере: в поезде крышевой блок хвостового вагона
  { const mt = bm(); add('tbox', {obj: grp(box(1.1, 0.36, 0.5, mt), at(box(1.1, 0.04, 0.54, steel()), 0, 0.2, 0), at(box(0.1, 0.1, 0.06, brass()), 0.4, 0.05, 0.27)), A: pose([-4.8, 4.35, -0.9]), B: pose([-8.6, 4.0, -0.8], [0, 0, 0], [1.2, 0.8, 1.0]), d: 0.14, mod: MODOBJ.tail, arc: 0.3, label: 'Ящик для инструмента', tint: [C.black, C.white, mt]}); }
  // фонарь тендера: в поезде бордовый хвостовой огонь
  { const lm = new THREE.MeshStandardMaterial({color: 0x651e32, emissive: 0xd0284f, emissiveIntensity: 0, roughness: 0.3}); mats.push(lm);
    add('tlamp', {obj: grp(cyl(0.16, 0.2, lm, 16), at(box(0.1, 0.34, 0.34, bm()), -0.14, 0, 0)), A: pose([-11.85, 3.3, 0]), B: pose([-16.75, 1.9, 0], [0, 0, 0], [1, 1.4, 1.4]), d: 0.04, mod: MODOBJ.b3, arc: 0.3, label: 'Фонарь тендера', emis: lm}); }
}

// рой мелких деталей: каждая едет из своей точки в свою, вместе со своим модулем
class Swarm {
  constructor(geo, mt, mod, items) { this.mod = mod; this.items = items; this.mesh = new THREE.InstancedMesh(geo, mt, items.length); this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; scene.add(this.mesh); swarms.push(this); }
}
const swarms = [];
const _sm = new THREE.Matrix4(), _spp = new THREE.Vector3(), _sqq = new THREE.Quaternion(), _sss = new THREE.Vector3();
function swarmUpdate(S, p) {
  const d = MD[S.mod.k];
  const w = backOut(sstep(0.30 + 0.05 * d, 0.70 + 0.05 * d, p), 0.7), m = sstep(0.34 + 0.05 * d, 0.84 + 0.05 * d, p), roll = sstep(0.28 + 0.05 * d, 0.60 + 0.05 * d, p);
  const ay = lerp(S.mod.ycA, S.mod.ycB, m), phi = S.mod.dir * 2 * PI * roll, cs = Math.cos(phi), sn = Math.sin(phi);
  const rq = new THREE.Quaternion().setFromAxisAngle(X_AXIS, phi);
  S.items.forEach((it, i) => {
    _spp.copy(it.a).lerp(it.b, w); _sqq.copy(it.qa).slerp(it.qb, w); _sss.copy(it.sa).lerp(it.sb, w);
    const ry = _spp.y - ay, rz = _spp.z; _spp.y = ay + ry * cs - rz * sn + LIFT * Math.sin(PI * sstep(0.26 + 0.05 * d, 0.76 + 0.05 * d, p)); _spp.z = ry * sn + rz * cs; _sqq.premultiply(rq);
    S.mesh.setMatrixAt(i, _sm.compose(_spp, _sqq, _sss));
  });
  S.mesh.instanceMatrix.needsUpdate = true;
}
{
  const R = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  // уголь: куча на бункере уходит внутрь третьего вагона грузом
  const coalMod = {k: 3, dir: ROLL[3], ycA: 3.45, ycB: 2.4};
  const q0 = new THREE.Quaternion();
  const coal = [];
  for (let i = 0; i < 160; i++) {
    const x = -8 + 3.8 * R(i, 1), z = (R(i, 2) - 0.5) * 2.1, hh = 0.5 * Math.max(0, 1 - (z / 1.05) ** 2) * (0.7 + 0.5 * Math.sin((x + 8) / 3.8 * PI));
    const sc = 0.12 + 0.14 * R(i, 3);
    coal.push({a: new THREE.Vector3(x, 4.0 + hh + R(i, 4) * 0.12, z), qa: new THREE.Quaternion().setFromEuler(E(R(i, 5) * 6, R(i, 6) * 6, R(i, 7) * 6)), sa: new THREE.Vector3(sc * 1.2, sc * 0.8, sc),
      b: new THREE.Vector3(-11.8 + 5 * R(i, 8), 1.1 + 0.9 * R(i, 9), (R(i, 10) - 0.5) * 2.2), qb: new THREE.Quaternion().setFromEuler(E(R(i, 11) * 6, R(i, 12) * 6, R(i, 13) * 6)), sb: new THREE.Vector3(sc * 0.9, sc * 0.9, sc * 0.9)});
  }
  new Swarm(new THREE.IcosahedronGeometry(1, 1), mat(0x17181b, {metalness: 0.3, roughness: 0.75}), coalMod, coal);
  // стойки поручней: вдоль котла, потом вдоль крыши головного вагона
  const stMod = {k: 1, dir: ROLL[1], ycA: 2.9, ycB: 2.4};
  const posts = [];
  for (let i = 0; i < 20; i++) {
    const sd = i % 2 ? 1 : -1, j = Math.floor(i / 2);
    posts.push({a: new THREE.Vector3(1.2 + j * 0.5, 3.56, sd * 1.2), qa: q0.clone(), sa: new THREE.Vector3(1, 1, 1), b: new THREE.Vector3(4.4 + j * 0.5, 3.7, sd * 1.33), qb: q0.clone(), sb: new THREE.Vector3(1, 1, 1)});
  }
  new Swarm(new THREE.CylinderGeometry(0.03, 0.04, 0.34, 8), mat(C.steel, {metalness: 0.9, roughness: 0.25}), stMod, posts);
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
  jack(sp + 'L', [0, 0, 0], id + 'U', [0, -0.45, 0.45]);
  jack(sp + 'R', [0, 0, 0], id + 'L', [0, 0.35, -0.45]);
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

parts.forEach((P) => { if (!P.shell && P.arc > 0.6) P.arc = 0.6; });

// ---------- расчёт позы по прогрессу ----------
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
function tint(P, m) {
  if (!P.tint) return;
  const [a, b, mt] = P.tint;
  mt.color.setHex(a).lerp(new THREE.Color(b), m);
}
const backOut = (t, k = 1.5) => { const x = t - 1; return 1 + (k + 1) * x * x * x + k * x * x; };
const X_AXIS = new THREE.Vector3(1, 0, 0), _pv = new THREE.Vector3(), _pv2 = new THREE.Vector3(), _qn = new THREE.Quaternion();
// поворот детали вокруг шарнира, заданного точкой pivL в её собственных координатах
function hingeAbout(P, axis, pivL, th) {
  _q2.setFromAxisAngle(axis, th);
  _qn.copy(_q1).multiply(_q2);
  P.root.position.add(_pv.copy(pivL).applyQuaternion(_q1)).sub(_pv2.copy(pivL).applyQuaternion(_qn));
  _q1.copy(_qn);
}
const _ax = new THREE.Vector3(), _pl = new THREE.Vector3();
const LIFT = 1.5; // модуль приподнимается на время переворота, чтобы не задеть колёса и тележки
function poseAll(p) {
  parts.forEach((P, i) => {
    const d = P.d;
    const op = sstep(0.08 + 0.06 * d, 0.26 + 0.06 * d, p) * (1 - sstep(0.62 + 0.05 * d, 0.80 + 0.05 * d, p)); // створки открыты
    const w0 = sstep(0.30 + 0.05 * d, 0.70 + 0.05 * d, p);
    const w = backOut(w0, P.shell ? 0.7 : 1.2);                                  // скольжение с перелётом
    const m = sstep(0.34 + 0.05 * d, 0.84 + 0.05 * d, p);
    const roll = sstep(0.28 + 0.05 * d, 0.60 + 0.05 * d, p);
    const A = P.Afn ? P.Afn() : P.A;
    P.root.position.copy(A.p).lerp(P.B.p, w);
    P.root.position.y += P.arc * Math.sin(PI * w0);
    _q1.copy(A.q).slerp(P.B.q, w);
    P.root.scale.copy(A.s).lerp(P.B.s, w);
    // створка оболочки раскрывается на шве, как раковина
    if (P.sh) {
      _pl.copy(P.sh.pivA).lerp(P.sh.pivB, m);
      hingeAbout(P, X_AXIS, _pl, P.sh.side * (P.sh.up ? 1.75 : 0.25) * op);
    } else if (P.hg) {
      _ax.set(...P.hg.axis); _pl.set(...P.hg.piv);
      hingeAbout(P, _ax, _pl, P.hg.ang * op);
    }
    // весь модуль проворачивается вокруг оси вагона (бочка) и встаёт на место
    if (P.mod) {
      const ay = lerp(P.mod.ycA, P.mod.ycB, m), phi = P.mod.dir * 2 * PI * roll;
      const ry = P.root.position.y - ay, rz = P.root.position.z, cs = Math.cos(phi), sn = Math.sin(phi);
      P.root.position.y = ay + ry * cs - rz * sn + LIFT * Math.sin(PI * sstep(0.26 + 0.05 * d, 0.76 + 0.05 * d, p)); P.root.position.z = ry * sn + rz * cs;
      _q2.setFromAxisAngle(X_AXIS, phi); _q1.premultiply(_q2);
    }
    // посадка: затухающая дрожь на месте
    const pl = 0.78 + 0.08 * d, dtl = p - pl;
    if (dtl > 0) P.root.position.y += 0.04 * Math.exp(-26 * dtl) * Math.sin(95 * dtl + i);
    P.root.quaternion.copy(_q1);
    if (P.morph) {
      P.morph.morphTargetInfluences[0] = m;
      P.morph.material.userData.uni.uM.value = m;
    }
    tint(P, m);
    if (P.emis) P.emis.emissiveIntensity = 2.2 * m;
    // колесо катится по рельсу, пока ползёт вместе с составом
    if (P.wheel) {
      const x = P.root.position.x;
      if (P.lastX !== undefined) { P.wheel.ang += (x - P.lastX) / (P.wheel.r0 * P.root.scale.x); P.spin.rotation.z = -P.wheel.ang; }
      P.lastX = x;
    }
  });
  swarms.forEach((S) => swarmUpdate(S, p));
}

// ---------- поиск столкновений: точки на поверхностях деталей, ячейки 0,3 м ----------
const catOf = (n) => /^(nose|b1|b2|b3|tail)[UL]$/.test(n) ? 'shell:' + n.replace(/[UL]$/, '') : /^core_/.test(n) ? 'core:' + n.slice(5) : /^ax_/.test(n) ? 'wheel' : /^bg_/.test(n) ? 'bogie' : /^sp[ABC][LR]$/.test(n) ? 'spine' : /^(side|main|cross|pist|ecc|rad|cmb|cyl)[LR]$/.test(n) ? 'rod' : /^(cab|run|tpl|pilot|door)/.test(n) ? 'panel' : 'small';
const samples = new Map();
function samplePts(P) {
  if (samples.has(P)) return samples.get(P);
  const list = [];
  P.root.traverse((o) => { if (o.isMesh && o.geometry.attributes.position) { const pos = o.geometry.attributes.position, n = pos.count, step = Math.max(1, Math.floor(n / 70)); const idx = []; for (let i = 0; i < n; i += step) idx.push(i); list.push({o, idx}); } });
  samples.set(P, list);
  return list;
}
const _cv = new THREE.Vector3();
window.__collide = (p, cell = 0.3) => {
  poseAll(p);
  const grid = new Map();
  parts.forEach((P, i) => {
    P.root.updateMatrixWorld(true);
    for (const {o, idx} of samplePts(P)) {
      const pos = o.geometry.attributes.position, mp = o.geometry.morphAttributes.position?.[0], inf = o.morphTargetInfluences?.[0] || 0;
      for (const j of idx) {
        _cv.fromBufferAttribute(pos, j);
        if (mp && inf) { _cv.multiplyScalar(1 - inf).x += mp.getX(j) * inf; _cv.y += mp.getY(j) * inf; _cv.z += mp.getZ(j) * inf; }
        _cv.applyMatrix4(o.matrixWorld);
        const key = Math.floor(_cv.x / cell) + ',' + Math.floor(_cv.y / cell) + ',' + Math.floor(_cv.z / cell);
        let set = grid.get(key); if (!set) grid.set(key, set = new Set()); set.add(i);
      }
    }
  });
  const pairs = {};
  for (const set of grid.values()) {
    if (set.size < 2) continue;
    const a = [...set];
    for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) {
      const A = parts[a[x]], B = parts[a[y]], ca = catOf(A.name), cb = catOf(B.name);
      const bad = (ca.startsWith('shell') && cb.startsWith('shell') && ca !== cb) || (ca.startsWith('shell') && cb.startsWith('core') && ca.split(':')[1] !== cb.split(':')[1]) || (cb.startsWith('shell') && ca.startsWith('core') && ca.split(':')[1] !== cb.split(':')[1]) ||
        ((ca.startsWith('shell') || ca.startsWith('core')) && (cb === 'wheel' || cb === 'bogie' || cb === 'panel')) || ((cb.startsWith('shell') || cb.startsWith('core')) && (ca === 'wheel' || ca === 'bogie' || ca === 'panel')) ||
        (ca === 'panel' && cb === 'panel') || (ca === 'wheel' && cb === 'wheel');
      if (!bad) continue;
      const k = A.name < B.name ? A.name + '|' + B.name : B.name + '|' + A.name;
      pairs[k] = (pairs[k] || 0) + 1;
    }
  }
  return pairs;
};

// ---------- пар: частицы из трубы, цилиндровых кранов и раскрывающихся швов ----------
// Пар не деталь (возникает и тает), поэтому считается отдельно: каждая частица живёт по формуле от времени clock.T.
const clock = {T: 0};
const STEAM = {on: true};
const steamEm = [];
function emitter(o) { o.parts = []; steamEm.push(o); return o; }
const seedR = (i, k) => { const x = Math.sin(i * 91.7 + k * 17.3) * 43758.5453; return x - Math.floor(x); };
emitter({name: 'chim', N: 220, life: 3.6, speed: 3.2, dir: [-0.28, 1, 0], size: [0.5, 2.6], spread: 0.25, pos: (o) => byName.chim.root.localToWorld(o.set(0, 0.62, 0)), str: (p, T) => (1 - sstep(0.04, 0.10, p)) * (0.7 + 0.3 * Math.sin(T * 13.8))});
for (const sd of [1, -1]) emitter({name: 'cock' + sd, N: 60, life: 0.9, speed: 4.5, dir: [0.35, -0.55, sd * 1], size: [0.15, 0.8], spread: 0.35, pos: (o) => byName['cyl' + (sd > 0 ? 'L' : 'R')].root.localToWorld(o.set(0.45, -0.28, 0)), str: (p, T) => (1 - sstep(0.04, 0.10, p)) * (((T % 1.7) < 0.55) ? 1 : 0)});
['nose', 'b1', 'b2', 'tail', 'b3'].forEach((id, k) => emitter({name: 'vent' + id, N: 100, life: 2.6, speed: 2.4, dir: [0, 1, SIDE[k] * 0.35], size: [0.5, 2.2], spread: 0.5, wide: [id, k],
  pos: (o, i) => { const P = byName[id + 'L']; o.copy(P.root.position); o.x += (seedR(i, 3) - 0.5) * 3.0; o.y += 0.7; return o; },
  str: (p, T) => { const d = MD[k]; return sstep(0.08 + 0.06 * d, 0.26 + 0.06 * d, p) * (1 - sstep(0.62 + 0.05 * d, 0.80 + 0.05 * d, p)) * (0.6 + 0.4 * Math.sin(T * 5 + k)); }}));
const STEAM_N = steamEm.reduce((a, e) => a + e.N, 0);
const sPos = new Float32Array(STEAM_N * 3), sA = new Float32Array(STEAM_N), sS = new Float32Array(STEAM_N);
const sGeo = new THREE.BufferGeometry();
sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
sGeo.setAttribute('aA', new THREE.BufferAttribute(sA, 1).setUsage(THREE.DynamicDrawUsage));
sGeo.setAttribute('aS', new THREE.BufferAttribute(sS, 1).setUsage(THREE.DynamicDrawUsage));
const steamMat = new THREE.ShaderMaterial({
  uniforms: {uK: {value: 600}},
  vertexShader: 'attribute float aA; attribute float aS; varying float vA; uniform float uK; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aS * uK / max(-mv.z, 0.1); vA = aA; }',
  fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.1, d); a = a * a * vA; if (a < 0.004) discard; vec3 col = mix(vec3(0.97, 0.97, 0.98), vec3(0.52, 0.56, 0.63), smoothstep(0.15, 1.0, d) * 0.85); gl_FragColor = vec4(col, min(a * 1.35, 0.9)); }',
  transparent: true, depthWrite: false,
});
const steamPts = new THREE.Points(sGeo, steamMat); steamPts.frustumCulled = false; steamPts.renderOrder = 6; scene.add(steamPts);
const _ev = new THREE.Vector3();
function updateSteam(p, v) {
  let n = 0;
  const T = clock.T;
  for (const e of steamEm) {
    e.root0 = e.root0 || new THREE.Vector3();
    const s = STEAM.on ? e.str(p, T) : 0;
    for (let i = 0; i < e.N; i++, n++) {
      const age = (T / e.life + seedR(i, 1)) % 1;
      e.pos(_ev, i);
      const sp = e.speed * age * e.life, sd = e.spread;
      const ox = e.dir[0] * sp + (seedR(i, 4) - 0.5) * sd * age * 2 - v * 0.03 * age * e.life;
      const oy = e.dir[1] * sp * (1 - 0.35 * age) + Math.sin(T * 1.4 + i) * 0.04 * age;
      const oz = e.dir[2] * sp + (seedR(i, 5) - 0.5) * sd * age * 2;
      sPos[n * 3] = _ev.x + ox; sPos[n * 3 + 1] = _ev.y + oy; sPos[n * 3 + 2] = _ev.z + oz;
      sA[n] = s * Math.pow(1 - age, 1.2) * sstep(0, 0.05, age) * 1.0;
      sS[n] = lerp(e.size[0], e.size[1], Math.sqrt(age)) * 1.5;
    }
  }
  sGeo.attributes.position.needsUpdate = sGeo.attributes.aA.needsUpdate = sGeo.attributes.aS.needsUpdate = true;
  steamMat.uniforms.uK.value = renderer.domElement.height / (2 * Math.tan(camera.fov * PI / 360));
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
<div class="lbg-side pn"><h4>Машина</h4>
 <div class="kv"><span>Класс</span><b id="cl">Паровоз 2-8-2</b></div>
 <div class="kv"><span>Скорость</span><b id="sp">0 км/ч</b></div>
 <div class="kv"><span>Колёсных пар</span><b>12</b></div>
 <div class="kv"><span>Вагонов</span><b id="wg">0</b></div>
 <div class="kv"><span>Длина</span><b id="ln">21 м</b></div>
 <div class="kv"><span>Модулей раскрыто</span><b id="op">0 из 5</b></div>
 <div class="kv"><span>Рама</span><b id="fr">сомкнута</b></div>
</div>
<div class="lbg-bar">
 <svg id="gantt" viewBox="0 0 1000 96" preserveAspectRatio="none"></svg>
 <div class="lbg-btns"><button data-a="loco">Паровоз</button><button data-a="split">Раскрыть</button><button data-a="build">Собрать в скоростной</button><button data-a="go">Поехали</button></div>
 <input id="sl" type="range" min="0" max="1000" value="0">
 <div class="lbg-btns"><button data-v="q">3/4</button><button data-v="s">Сбоку</button><button data-v="f">Спереди</button><button data-v="t">Сверху</button><button data-a="steam" class="on">Пар</button><button data-a="ghost">Прозрачный корпус</button></div>
</div>
<div class="lbg-panels">
 <div class="pn"><h4>Модули</h4><div id="mods"></div></div>
 <div class="pn"><h4>План по рельсу</h4><svg id="plan" viewBox="0 0 280 64"><line x1="0" y1="40" x2="280" y2="40" stroke="#b8b0a2" stroke-width="2"/></svg></div>
 <div class="pn"><h4>Ведущее колесо</h4><div class="kv"><span>Диаметр</span><b id="wd">1,60 м</b></div><div class="kv"><span>Обороты</span><b id="wr">0 об/мин</b></div><div class="kv"><span>Шатуны</span><b id="rods">на колёсах</b></div></div>
</div>
<div id="lb"></div>`;
app.appendChild(ui);
const st = ui.querySelector('#st'), pc = ui.querySelector('#pc'), sp = ui.querySelector('#sp'), sl = ui.querySelector('#sl'), wg = ui.querySelector('#wg'), ln = ui.querySelector('#ln'), lbBox = ui.querySelector('#lb');
const STAGES = [[0, 0.07, 'Паровоз Mikado 2-8-2'], [0.07, 0.30, 'Раскрытие'], [0.30, 0.72, 'Превращение'], [0.72, 0.94, 'Замки'], [0.94, 1.01, 'Скоростной состав']];
const LABELS = ['noseU', 'b1U', 'b2U', 'b3U', 'tailU', 'core_b1', 'core_b2', 'spAL', 'chim', 'cabRoof', 'coal', 'pilot'];
const labelEls = LABELS.map((id) => { const e = document.createElement('div'); e.className = 'lb'; e.textContent = byName[id].label; lbBox.appendChild(e); return {id, e}; });


// ---------- панели: состояние модулей, план по рельсу, колесо ----------
const MODNAMES = [['nose', 'Дымовая коробка', 'Нос'], ['b1', 'Котёл', 'Вагон 1'], ['b2', 'Топка', 'Вагон 2'], ['tail', 'Бункер', 'Вагон 3'], ['b3', 'Бак тендера', 'Хвост']];
const modsBox = ui.querySelector('#mods'), plan = ui.querySelector('#plan');
const modRows = MODNAMES.map(([id, a, b]) => {
  const r = document.createElement('div'); r.className = 'mrow';
  r.innerHTML = `<span class="mn">${a} <i>›</i> ${b}</span><span class="ms"></span><span class="mb"><i></i></span>`;
  modsBox.appendChild(r);
  return {id, ms: r.querySelector('.ms'), bar: r.querySelector('.mb i')};
});
const NS = 'http://www.w3.org/2000/svg';
const planX = (x) => (x + 20) / 38 * 280;
const planRects = MODNAMES.map(() => { const r = document.createElementNS(NS, 'rect'); r.setAttribute('y', 24); r.setAttribute('height', 14); r.setAttribute('rx', 2); plan.appendChild(r); return r; });
const planWheels = AXLES.map(() => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cy', 42); c.setAttribute('r', 2.6); c.setAttribute('fill', '#2b2622'); plan.appendChild(c); return c; });
const wd = ui.querySelector('#wd'), wr = ui.querySelector('#wr'), rodsEl = ui.querySelector('#rods');
const f1 = (x) => x.toFixed(2).replace('.', ',');
function updatePanels(p, v) {
  MODNAMES.forEach(([id], i) => {
    const d = MD[i], op = sstep(0.08 + 0.06 * d, 0.26 + 0.06 * d, p) * (1 - sstep(0.62 + 0.05 * d, 0.80 + 0.05 * d, p));
    const w0 = sstep(0.30 + 0.05 * d, 0.70 + 0.05 * d, p), m = sstep(0.34 + 0.05 * d, 0.84 + 0.05 * d, p);
    const st = p < 0.07 ? 'паровоз' : (op > 0.6 && w0 > 0.03 && w0 < 0.97) ? 'раскрыт, едет' : op > 0.8 ? 'раскрыт' : w0 > 0 && w0 < 1 ? 'едет' : (p > 0.78 + 0.08 * d && p < 0.94) ? 'замок' : w0 >= 1 ? 'вагон' : 'раскрытие';
    modRows[i].ms.textContent = st;
    modRows[i].bar.style.width = Math.round((w0 * 0.6 + m * 0.4) * 100) + '%';
    const P = byName[id + 'L'], L = lerp(MODS_L[id][0], MODS_L[id][1], m);
    const rc = planRects[i]; rc.setAttribute('x', planX(P.root.position.x - L / 2)); rc.setAttribute('width', Math.max(2, L / 38 * 280));
    rc.setAttribute('fill', m > 0.9 ? '#651e32' : '#2b2622'); rc.setAttribute('opacity', 0.55 + 0.4 * m);
  });
  AXLES.forEach((a, i) => planWheels[i].setAttribute('cx', planX(byName[a.id].root.position.x)));
  const d1 = byName.ax_d1, r = d1.wheel.r0 * d1.root.scale.x;
  wd.textContent = f1(r * 2) + ' м';
  wr.textContent = Math.round(v / (2 * PI * r) * 60) + ' об/мин';
  rodsEl.textContent = p < 0.1 ? 'на колёсах' : p < 0.7 ? 'сняты' : 'тяги тележек';
}
const MODS_L = {nose: [1.55, 5.0], b1: [4.25, 5.2], b2: [3.4, 10.0], tail: [3.8, 5.0], b3: [7.4, 5.0]};


// ---------- хронология: когда каждый модуль раскрывается, едет и защёлкивается ----------
const gantt = ui.querySelector('#gantt');
const GROW = [['Нос', 0], ['Вагон 1', 1], ['Вагон 2', 2], ['Вагон 3', 3], ['Хвост', 4]];
let gcursor;
{
  const mk = (t, at) => { const e = document.createElementNS(NS, t); for (const k in at) e.setAttribute(k, at[k]); gantt.appendChild(e); return e; };
  [[0.07, 'Паровоз'], [0.30, 'Раскрытие'], [0.72, 'Превращение'], [0.94, 'Замки']].forEach(([x, lab]) => { mk('line', {x1: x * 1000, x2: x * 1000, y1: 0, y2: 96, stroke: 'rgba(43,38,34,0.25)', 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke'}); });
  GROW.forEach(([lab, k], i) => {
    const d = MD[k], y = 20 + i * 15;
    mk('rect', {x: 0, y, width: 1000, height: 11, fill: 'rgba(43,38,34,0.05)'});
    mk('rect', {x: (0.08 + 0.06 * d) * 1000, y, width: 0.18 * 1000, height: 11, fill: '#b9899a'});            // раскрытие
    mk('rect', {x: (0.30 + 0.05 * d) * 1000, y, width: 0.40 * 1000, height: 11, fill: '#651e32'});           // ход и превращение
    mk('rect', {x: (0.62 + 0.05 * d) * 1000, y, width: 0.18 * 1000, height: 11, fill: '#2b2622', opacity: 0.8}); // замок
  });
  gcursor = mk('line', {x1: 0, x2: 0, y1: 0, y2: 96, stroke: '#2b2622', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke'});
  gantt.addEventListener('pointerdown', (e) => { const r = gantt.getBoundingClientRect(); userTouch(); state.target = null; state.p = clamp((e.clientX - r.left) / r.width); });
}
const ganttLabels = document.createElement('div'); ganttLabels.className = 'glabels';
ganttLabels.innerHTML = ['Паровоз', 'Раскрытие', 'Превращение', 'Замки', 'Скоростной состав'].map((t, i) => `<span style="left:${[0, 0.07, 0.30, 0.72, 0.94][i] * 100}%;${i === 4 ? 'transform:translateX(-100%);margin-left:-0.5%;' : ''}">${t}</span>`).join('');
const gwrap = document.createElement('div'); gwrap.className = 'gwrap';
ui.querySelector('.lbg-bar').insertBefore(ganttLabels, gantt);
gantt.parentNode.insertBefore(gwrap, gantt); gwrap.appendChild(gantt);
GROW.forEach(([lab], i) => { const e = document.createElement('span'); e.className = 'grow'; e.textContent = lab; e.style.top = (14.6 + i * 10.9) + 'px'; gwrap.appendChild(e); });
const opEl = ui.querySelector('#op'), frEl = ui.querySelector('#fr'), clEl = ui.querySelector('#cl');
function updateSpec(p) {
  let n = 0; MD.forEach((d) => { const o = sstep(0.08 + 0.06 * d, 0.26 + 0.06 * d, p) * (1 - sstep(0.62 + 0.05 * d, 0.80 + 0.05 * d, p)); if (o > 0.5) n++; });
  opEl.textContent = n + ' из 5';
  frEl.textContent = p < 0.3 ? 'сомкнута' : p < 0.84 ? 'выдвигается' : 'выдвинута';
  clEl.textContent = p < 0.3 ? 'Паровоз 2-8-2' : p < 0.94 ? 'Превращение' : 'Скоростной состав';
  gcursor.setAttribute('x1', p * 1000); gcursor.setAttribute('x2', p * 1000);
}

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
  if (a === 'split') animateTo(0.30, 0.10);
  if (a === 'build') animateTo(0.94, 0.09);
  if (a === 'go') animateTo(1, 0.1);
  if (a === 'steam') { STEAM.on = !STEAM.on; b.classList.toggle('on', STEAM.on); }
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
  if (!composer) buildComposer();
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  inkPass.uniforms.uPx.value.set(1 / (w * renderer.getPixelRatio()), 1 / (h * renderer.getPixelRatio()));
  camera.aspect = w / h;
  if (w >= 1100) camera.setViewOffset(w, h, 170, 0, w, h); else camera.clearViewOffset();
  camera.fov = w / h < 0.9 ? 52 : 32;
  camera.updateProjectionMatrix();
  ui.classList.toggle('narrow', w < 700); ui.classList.toggle('medium', w >= 700 && w < 1100);
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
  clock.T += dt;
  const v = advance(dt);
  poseAll(state.p);
  if (state.tour) {
    const want = lerp(30, 40, sstep(0.05, 0.3, state.p) * (1 - sstep(0.85, 1, state.p) * 0.4)) * (camera.aspect < 0.9 ? 1.7 : 1);
    _v.copy(camera.position).sub(controls.target);
    _v.setLength(lerp(_v.length(), want, 0.03));
    camera.position.copy(controls.target).add(_v);
  }
  updateJacks();
  scene.updateMatrixWorld(true); updateSteam(state.p, v);
  controls.update();
  composer.render();
  // панели читают те же величины, что двигают детали
  const p = state.p;
  const stage = STAGES.find(([a, b]) => p >= a && p < b);
  st.textContent = stage[2]; pc.textContent = Math.round(p * 100) + '%';
  sp.textContent = Math.round(v * 3.6) + ' км/ч';
  wg.textContent = String(['b1', 'b2', 'b3'].filter((id) => byName[id + 'U'].morph.morphTargetInfluences[0] > 0.97 && byName[id + 'L'].morph.morphTargetInfluences[0] > 0.97).length);
  const len = lerp(21, 31, sstep(0.36, 0.84, p));
  ln.textContent = len.toFixed(0) + ' м';
  updatePanels(p, v); updateSpec(p);
  if (document.activeElement !== sl) sl.value = Math.round(p * 1000);
  const la = sstep(0.12, 0.17, p) * (1 - sstep(0.26, 0.32, p));
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
const FP = [[0, 0], [2.5, 0], [7.5, 0.30], [15.5, 0.72], [19.5, 0.94], [21, 1], [24, 1]];
function filmP(t) { for (let i = 1; i < FP.length; i++) if (t <= FP[i][0]) { const [t0, p0] = FP[i - 1], [t1, p1] = FP[i]; return lerp(p0, p1, (t - t0) / (t1 - t0)); } return 1; }
let filmT = 0;
window.__film = (t) => {
  state.tour = false; state.target = null; ui.style.display = 'none'; controls.enabled = false;
  if (t < filmT) { state.S = 0; filmT = 0; }
  while (filmT < t - 1e-9) { const dt = Math.min(1 / 60, t - filmT); state.p = filmP(filmT + dt); advance(dt); poseAll(state.p); filmT += dt; }
  state.p = filmP(t);
  const p = state.p, k = t / FILM.dur;
  const ang = lerp(0.62, 0.62 - 3.4, sstep(0, 1, k) * 0.9 + k * 0.1) ;
  const rad = 30 - 5 * sstep(0.05, 0.2, k) * (1 - sstep(0.6, 0.75, k)) + 8 * sstep(0.6, 0.8, k) - 4 * sstep(0.85, 1, k);
  const hgt = lerp(8, 12, sstep(0.1, 0.4, k)) - 5 * sstep(0.72, 1, k);
  const tx = lerp(-1.5, 3.5, sstep(0.72, 1, k));
  controls.target.set(tx, 2.2, 0);
  camera.position.set(tx + Math.cos(ang) * rad, hgt, Math.sin(-ang) * rad * 0.9 + 6 * (1 - Math.min(1, k * 2)));
  camera.lookAt(controls.target);
  poseAll(p); updateJacks(); clock.T = t; scene.updateMatrixWorld(true); updateSteam(p, speedAt(p));
  composer.render();
  return p;
};
window.__film.meta = FILM;

window.__setP = (p, ui_ = true) => { state.tour = false; state.target = null; state.p = p; state.S = 0; ui.style.display = ui_ ? '' : 'none'; };
window.__cam = (x, y, z, tx = TARGET.x, ty = TARGET.y, tz = TARGET.z) => { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.update(); };
requestAnimationFrame(frame);
window.__ready = true;
