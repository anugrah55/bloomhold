import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================================================================
// Core utilities
// ============================================================================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
const smooth = t => t * t * (3 - 2 * t);
const smoothstep = (a, b, v) => smooth(invLerp(a, b, v));
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const rr = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length) % arr.length];
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutElastic = t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
const angleLerp = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 2D gradient noise (Perlin-style), seeded
function makeNoise(seed) {
  const rng = mulberry32(seed);
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u), lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v) * 0.7;
  }
  n2.fbm = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); f *= 2; a *= 0.5; } return s; };
  return n2;
}
const NOISE = makeNoise(90210);
const Perf = { acc: 0, n: 0, scale: 1, cool: 4 };

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const hexLerp = (a, b, t, out = new THREE.Color()) => out.set(a).lerp(_c2.set(b), t);
function shiftColor(color, hueDeg, satMul = 1, lightAdd = 0) {
  const hsl = {}; color.getHSL(hsl);
  color.setHSL(((hsl.h + hueDeg / 360) % 1 + 1) % 1, clamp(hsl.s * satMul, 0, 1), clamp(hsl.l + lightAdd, 0, 1));
  return color;
}
const cssHex = c => '#' + c.getHexString();

// ============================================================================
// Island + palette definitions
// ============================================================================
const ISLANDS = [
  {
    id: 'petalmoor', name: 'Petalmoor', blurb: 'Pink blossoms and soft meadows. Every keeper starts here.',
    seed: 1337, radius: 33, paths: 3, difficulty: 1.0, skyHue: 0, weather: 'petals', aurora: 0.35,
    trees: ['blossom', 'blossom', 'round'], deco: ['rock', 'bush', 'mushroom', 'bush', 'stump'],
    pal: {
      grass: [0x8fe39a, 0x7ad68f, 0xa6ec9c], path: 0xf6d6a8, sand: 0xf9e3b4, rock: [0xc9b8e8, 0xb3a1d9],
      cliff: [0xe89ab8, 0xc77aa6, 0x9b5f9e, 0x6d4a8a], leaf: [0xff9ec7, 0xffb3d9, 0xff7eb6], leafAlt: [0x6fd6a0, 0x4fc48d],
      trunk: 0x8a5a7a, flower: [0xff5e8a, 0xffd23f, 0x7b6cff, 0xff8f3f, 0x3fd0ff, 0xffffff], roof: [0xff6b8b, 0x6c7bff, 0xffb347],
      wall: 0xfff1e0, wood: 0xb07a5a, water: 0x5fd4ff, accent: 0xff4fa0, glow: 0xffc36b,
    },
  },
  {
    id: 'tidebloom', name: 'Tidebloom', blurb: 'Coral gardens and turquoise lagoons. Warm rain, then rainbows.',
    seed: 4242, radius: 35, paths: 3, difficulty: 1.25, skyHue: -22, weather: 'rain', aurora: 0.3,
    trees: ['palm', 'palm', 'round'], deco: ['coral', 'shell', 'rock', 'coral', 'reeds', 'bush'],
    pal: {
      grass: [0x9ff0c8, 0x7ee6c0, 0xbaf5d0], path: 0xfff0c9, sand: 0xffe7b0, rock: [0xffb4a2, 0xf29a8a],
      cliff: [0xffd1a1, 0xf7a081, 0xd4708b, 0x8f5a9c], leaf: [0x4fe0b0, 0x2fcf9f, 0x7af2c4], leafAlt: [0xff7aa8, 0xffa07a],
      trunk: 0xc98f5e, flower: [0xff4f79, 0xffb03a, 0x39d5ff, 0xb66bff, 0xfff06a, 0xffffff], roof: [0x2ec4d6, 0xff7a59, 0xffd166],
      wall: 0xfffaf0, wood: 0xd39b6a, water: 0x2fe0e8, accent: 0x19d3c5, glow: 0xffd98a,
    },
  },
  {
    id: 'emberwood', name: 'Emberwood', blurb: 'An autumn forest that never finishes falling. Pumpkins glow at night.',
    seed: 777, radius: 36, paths: 4, difficulty: 1.5, skyHue: 16, weather: 'leaves', aurora: 0.25,
    trees: ['autumn', 'autumn', 'pine', 'round'], deco: ['pumpkin', 'mushroom', 'rock', 'stump', 'bush'],
    pal: {
      grass: [0xf2c46b, 0xe8b25a, 0xf5d27f], path: 0xf3e1c3, sand: 0xf6dcae, rock: [0xa98bd1, 0x8e73c0],
      cliff: [0xf08a5d, 0xd4604f, 0xa2456a, 0x5f3a78], leaf: [0xff7a3d, 0xff5a5a, 0xffb13d], leafAlt: [0xd9435f, 0xff9a3d],
      trunk: 0x6e3f5c, flower: [0xff3d6e, 0xffd23f, 0xa45cff, 0xff8a3d, 0x4fd1ff, 0xfff4d6], roof: [0x7a4cff, 0x2fb8a3, 0xff5a5a],
      wall: 0xfff0dc, wood: 0x9c5b45, water: 0x62b8ff, accent: 0xff6a3d, glow: 0xffb05a,
    },
  },
  {
    id: 'frostglow', name: 'Frostglow', blurb: 'Crystal peaks under a restless aurora. Snow falls without a sound.',
    seed: 31415, radius: 37, paths: 4, difficulty: 1.8, skyHue: -48, weather: 'snow', aurora: 1.0,
    trees: ['pine', 'pine', 'crystal'], deco: ['crystal', 'rock', 'snowball', 'crystal', 'stump'],
    pal: {
      grass: [0xe6f0ff, 0xd5e4ff, 0xf1f6ff], path: 0xc9c2f2, sand: 0xe0dcff, rock: [0x8fa3e8, 0x7a88d6],
      cliff: [0xb7c8ff, 0x9a9cf0, 0x7b6fd6, 0x4e3f9e], leaf: [0x7ee8e0, 0x5fd0e8, 0xa6f5ff], leafAlt: [0xc59bff, 0xff9ee8],
      trunk: 0x6b5a9e, flower: [0xff7ee8, 0x7efcff, 0xb9a0ff, 0xfff38a, 0x8affc1, 0xffffff], roof: [0xff6fb5, 0x6f8cff, 0x6ff0d0],
      wall: 0xf5f3ff, wood: 0x8a7ab8, water: 0x9ae6ff, accent: 0x9d7bff, glow: 0xa8f0ff,
    },
  },
  {
    id: 'prismara', name: 'Prismara', blurb: 'The last island. Every color at once, all the time.',
    seed: 8008, radius: 38, paths: 4, difficulty: 2.1, skyHue: 0, prism: true, weather: 'glitter', aurora: 0.8,
    trees: ['swirl', 'bigshroom', 'blossom', 'swirl'], deco: ['lollipop', 'crystal', 'mushroom', 'lollipop', 'bush'],
    pal: {
      grass: [0xff9ad5, 0x9ad5ff, 0xb5ff9a], path: 0xfff6e8, sand: 0xfff0f8, rock: [0xd8c8ff, 0xffc8e8],
      cliff: [0xff8ad8, 0xb28aff, 0x6fb6ff, 0x5fe3c0], leaf: [0xff5fd2, 0x5fd2ff, 0xd2ff5f], leafAlt: [0xb35fff, 0x5fffb3],
      trunk: 0xc98fd9, flower: [0xff4fa8, 0xffc93f, 0x4fe3ff, 0xa66bff, 0x6bff9a, 0xffffff], roof: [0xff5fd2, 0x5fd2ff, 0xffe35f],
      wall: 0xffffff, wood: 0xd9a8ff, water: 0xc6a8ff, accent: 0xff5fd2, glow: 0xfff08a,
    },
  },
];
const NIGHTS_TO_UNLOCK = 5;

// Time-of-day keyframes (hours). Colors are hex; the island's skyHue rotates them.
const TOD_KEYS = [
  { h: 0, top: 0x120a3a, hor: 0x4a2a8a, bot: 0x241050, sun: 0x9db0ff, sunI: 0.5, hemiS: 0x5a78e8, hemiG: 0x6a2a7a, hemiI: 0.78, night: 1, cloud: 0x4a3486 },
  { h: 4.5, top: 0x1f0f4a, hor: 0x8a3a9a, bot: 0x3a1656, sun: 0xb09cff, sunI: 0.45, hemiS: 0x7a64d8, hemiG: 0x40205c, hemiI: 0.75, night: 0.95, cloud: 0x5a3a8a },
  { h: 6.2, top: 0x6a6ad8, hor: 0xffa3b8, bot: 0xff8fb0, sun: 0xffb38a, sunI: 1.05, hemiS: 0xffc4d8, hemiG: 0x8a5a9a, hemiI: 0.95, night: 0.25, cloud: 0xffc0d0 },
  { h: 8.5, top: 0x7cc8ff, hor: 0xffe0d8, bot: 0xffd0e0, sun: 0xfff0d8, sunI: 1.5, hemiS: 0xd8ecff, hemiG: 0x9a8ab0, hemiI: 1.05, night: 0, cloud: 0xfff4f4 },
  { h: 13, top: 0x6ab8ff, hor: 0xcfeeff, bot: 0xbfe6ff, sun: 0xfff8ee, sunI: 1.65, hemiS: 0xdff2ff, hemiG: 0xa89ab8, hemiI: 1.1, night: 0, cloud: 0xffffff },
  { h: 16.6, top: 0x8aa8ff, hor: 0xffd6a8, bot: 0xffc8c0, sun: 0xffd09a, sunI: 1.5, hemiS: 0xffe2d0, hemiG: 0xa0809a, hemiI: 1.0, night: 0, cloud: 0xffe8d8 },
  { h: 18.4, top: 0x7a5ad8, hor: 0xff7a8a, bot: 0xff9a6a, sun: 0xff8a6a, sunI: 1.15, hemiS: 0xffa0b8, hemiG: 0x7a4a8a, hemiI: 0.9, night: 0.2, cloud: 0xffa0b0 },
  { h: 19.6, top: 0x3a1f8a, hor: 0xd84aa8, bot: 0x7a2a8a, sun: 0xd88aff, sunI: 0.7, hemiS: 0xb87ae8, hemiG: 0x4a2a6a, hemiI: 0.8, night: 0.7, cloud: 0x8a4ab0 },
  { h: 21, top: 0x160c48, hor: 0x5a2aa0, bot: 0x281254, sun: 0xa0a8ff, sunI: 0.52, hemiS: 0x607ae8, hemiG: 0x6a2a80, hemiI: 0.8, night: 1, cloud: 0x4e3690 },
  { h: 24, top: 0x120a3a, hor: 0x4a2a8a, bot: 0x241050, sun: 0x9db0ff, sunI: 0.5, hemiS: 0x5a78e8, hemiG: 0x6a2a7a, hemiI: 0.78, night: 1, cloud: 0x4a3486 },
];

// ============================================================================
// Buildings & enemies
// ============================================================================
const BTYPES = {
  cottage: { name: 'Cottage', cost: [3, 5, 8], income: [2, 3, 5], hp: [8, 12, 18],
    desc: ['Pays 2 sparks every dawn. A villager moves in.', 'Pays 3 sparks every dawn. Room for a second villager.', 'Pays 5 sparks every dawn. A full, happy house.'] },
  field: { name: 'Flower Field', cost: [3, 6, 9], income: [3, 4, 6], hp: [6, 9, 13],
    desc: ['Pays 3 sparks every dawn.', 'A windmill joins in. Pays 4 sparks every dawn.', 'The grandest garden around. Pays 6 sparks every dawn.'] },
  tower: { name: 'Paint Tower', cost: [5, 8, 12], range: [9.5, 11, 12.5], rate: [1.0, 1.5, 2.1], dmg: [1, 1.25, 1.6], hp: [10, 15, 22],
    desc: ['Fires paint at nearby Gloom.', 'Longer reach, faster paint.', 'Fires two bolts at once.'] },
  lantern: { name: 'Lumen Lantern', cost: [3, 5, 8], radius: [5.5, 7, 8.5], slow: [0.35, 0.45, 0.55], dps: [0.3, 0.5, 0.85], hp: [8, 12, 16],
    desc: ['Its light slows the Gloom and slowly colors it.', 'Brighter and wider light.', 'A radiant glow that paints steadily.'] },
  hedge: { name: 'Bloom Hedge', cost: [2, 4, 6], hp: [16, 30, 48],
    desc: ['A flowering wall the Gloom has to push through.', 'Thicker, taller blooms.', 'A mighty wall of flowers.'] },
  grove: { name: 'Sprite Grove', cost: [7, 10, 14], sprites: [2, 3, 5], hp: [10, 14, 20],
    desc: ['Two little sprites wake at night and chase the Gloom.', 'Three sprites.', 'Five sprites, a whole swarm.'] },
  chime: { name: 'Chime Spire', cost: [6, 9, 13], radius: [5.5, 6.5, 7.5], dmg: [2, 3, 4.5], period: [3, 2.6, 2.2], hp: [10, 14, 20],
    desc: ['Rings out a pulse that paints every nearby Gloom.', 'Louder, wider rings.', 'A sound you can almost see.'] },
};

const ETYPES = {
  smudge:   { hp: 4,   speed: 2.3, dmg: 1.0, radius: 0.6,  drop: 0.55, dropN: 1, flying: false, weight: 1 },
  drifter:  { hp: 2.4, speed: 3.7, dmg: 0.6, radius: 0.45, drop: 0.45, dropN: 1, flying: true,  weight: 1 },
  splitter: { hp: 7,   speed: 2.0, dmg: 1.2, radius: 0.85, drop: 1,    dropN: 1, flying: false, weight: 2.2 },
  lump:     { hp: 15,  speed: 1.45, dmg: 2.5, radius: 1.2, drop: 1,    dropN: 2, flying: false, weight: 3.5 },
  boss:     { hp: 110, speed: 1.05, dmg: 5,  radius: 2.8,  drop: 1,    dropN: 12, flying: false, weight: 20 },
};

const ACHIEVEMENTS = [
  { id: 'build1', name: 'First Bloom', desc: 'Build your first building.' },
  { id: 'heal1', name: 'Gentle Touch', desc: 'Paint your first Gloom.' },
  { id: 'heal100', name: 'Colorist', desc: 'Paint 100 Gloom.' },
  { id: 'heal500', name: 'Chromatic Saint', desc: 'Paint 500 Gloom.' },
  { id: 'boss1', name: 'Big Softie', desc: 'Paint a Great Gloom.' },
  { id: 'night5', name: 'Night Owl', desc: 'See 5 nights through.' },
  { id: 'night25', name: 'Moonkeeper', desc: 'See 25 nights through.' },
  { id: 'max1', name: 'Grand Design', desc: 'Raise a building to level 3.' },
  { id: 'flowers200', name: 'Meadow Musician', desc: 'Ring 200 flowers.' },
  { id: 'flowers2000', name: 'Flower Symphony', desc: 'Ring 2,000 flowers.' },
  { id: 'wish1', name: 'Make a Wish', desc: 'Catch a shooting star.' },
  { id: 'wish10', name: 'Stargazer', desc: 'Catch 10 shooting stars.' },
  { id: 'fire50', name: 'Firefly Friend', desc: 'Collect 50 fireflies.' },
  { id: 'wobble50', name: 'Fidget Garden', desc: 'Wobble 50 things.' },
  { id: 'vibe60', name: 'Just Vibing', desc: 'Spend a minute in vibe mode.' },
  { id: 'travel1', name: 'Island Hopper', desc: 'Sail to another island.' },
  { id: 'allisles', name: 'Archipelago', desc: 'Unlock every island.' },
];

// ============================================================================
// Save
// ============================================================================
const SAVE_KEY = 'bloomhold.save.v1';
const REDUCED_MOTION = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
function freshSave() {
  const s = {
    v: 1, current: 0, firstRun: true,
    settings: { music: 0.7, sfx: 0.8, muted: false, bloom: 1, tilt: REDUCED_MOTION ? 0.5 : 1, hue: REDUCED_MOTION ? 0 : 1, quality: 'high', mode: 'bloom', shake: !REDUCED_MOTION, buildMode: 'hold', tips: true, calm: REDUCED_MOTION, pace: 'normal', bigText: false },
    guide: 0,
    stats: { healed: 0, built: 0, flowers: 0, wishes: 0, fireflies: 0, nights: 0, wobbles: 0, vibe: 0, bosses: 0 },
    ach: {},
    islands: {},
  };
  ISLANDS.forEach((d, i) => { s.islands[d.id] = { unlocked: i === 0, nights: 0, sparks: 8, plots: {} }; });
  return s;
}
let SAVE = freshSave();
function loadSave(data) {
  try {
    const raw = data || JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (raw && raw.v === 1) {
      const base = freshSave();
      const defSettings = base.settings, defStats = base.stats;
      SAVE = Object.assign(base, raw);
      SAVE.settings = Object.assign({}, defSettings, raw.settings || {});
      SAVE.stats = Object.assign({}, defStats, raw.stats || {});
      ISLANDS.forEach((d, i) => { SAVE.islands[d.id] = Object.assign(freshSave().islands[d.id], (raw.islands || {})[d.id] || {}); });
      SAVE.islands[ISLANDS[0].id].unlocked = true;
      if (raw.guide === undefined && SAVE.stats.nights > 0) SAVE.guide = 99;
    }
  } catch (e) { SAVE = freshSave(); }
}
let saveTimer = 0;
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage unavailable */ }
}
function saveSoon() { saveTimer = 1.5; }

// ============================================================================
// Input
// ============================================================================
const Input = {
  keys: new Set(), pressed: new Set(), joy: { x: 0, y: 0, active: false }, buildHeld: false,
  mouse: { x: 0, y: 0, moved: 0 }, touch: false, last: 'kb',
  pad: { x: 0, y: 0, build: false, zoom: 0, prev: {}, connected: false },
  // Gamepad: left stick / d-pad ride, A build, B dash, X burst, Y night, Start menu, Select vibe, triggers zoom
  pollPad() {
    const P = this.pad;
    let gp = null;
    try { const pads = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of pads) if (p && p.connected) { gp = p; break; } } catch (e) { /* no gamepads */ }
    if (!gp) { P.x = P.y = P.zoom = 0; P.build = false; if (P.connected) P.connected = false; return; }
    if (!P.connected) { P.connected = true; this.onPad && this.onPad(); }
    const dz = v => Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8;
    const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    let x = dz(gp.axes[0] || 0), y = dz(gp.axes[1] || 0);
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
    P.x = x; P.y = y; P.build = b(0); P.peek = b(5);
    P.zoom = ((gp.buttons[7] && gp.buttons[7].value) || 0) - ((gp.buttons[6] && gp.buttons[6].value) || 0);
    const map = { 0: 'PadA', 1: 'ShiftLeft', 2: 'KeyE', 3: 'Enter', 9: 'Escape', 8: 'KeyV' };
    let any = Math.abs(x) + Math.abs(y) > 0;
    for (const i in map) { const now = b(+i); if (now && !P.prev[i]) this.pressed.add(map[i]); P.prev[i] = now; any = any || now; }
    if (any) this.last = 'pad';
  },
  down(k) { return this.keys.has(k); },
  hit(k) { return this.pressed.has(k); },
  endFrame() { this.pressed.clear(); },
  axis() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    if (this.joy.active) { x += this.joy.x; y += this.joy.y; }
    x += this.pad.x; y += this.pad.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  },
  building() { return this.down('Space') || this.buildHeld || this.pad.build; },
  buildPressed() { return this.hit('Space') || this.hit('PadA'); },
};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT')) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!Input.keys.has(e.code)) Input.pressed.add(e.code);
  Input.keys.add(e.code);
  Input.last = 'kb';
});
window.addEventListener('keyup', e => Input.keys.delete(e.code));
window.addEventListener('blur', () => { Input.keys.clear(); Input.buildHeld = false; Input.joy.active = false; });
window.addEventListener('pointermove', e => { Input.mouse.x = e.clientX; Input.mouse.y = e.clientY; Input.mouse.moved = performance.now(); });
window.addEventListener('pointerdown', e => { Input.mouse.x = e.clientX; Input.mouse.y = e.clientY; Input.last = e.pointerType === 'touch' ? 'touch' : 'mouse'; });
