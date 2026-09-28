
// ============================================================================
// Shared game state
// ============================================================================
const G = {
  state: 'title', isle: null, isleIdx: 0, enemies: [], plots: [], sprites: [], villagers: [], bunnies: [], birds: [], fish: [],
  time: 0, night: 0, nightNum: 1, mode: 'bloom', vibe: false,
  get isleSave() { return SAVE.islands[ISLANDS[this.isleIdx].id]; },
  get sparks() { return this.isleSave.sparks; },
  set sparks(v) { this.isleSave.sparks = Math.max(0, Math.round(v)); UI.sparks(this.isleSave.sparks); },
};
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

// ============================================================================
// Combos: chain paints at night, dash-strike through Gloom, unleash Bloom Nova
// ============================================================================
const NOVA_AT = 5;
const Combo = {
  n: 0, t: 0, ready: false, stopT: 0, slowT: 0, lockT: 0,
  add(x, y, z, color) {
    if (G.state !== 'night' || this.lockT > 0) return;
    this.n++; this.t = 3.2;
    if (this.n >= 2) popText('×' + this.n, x, y + 2.2, z);
    if (this.n >= NOVA_AT && !this.ready) {
      this.ready = true;
      UI.toast(`<b>Bloom Nova ready</b>&nbsp;· ${UI.isTouch ? 'tap Burst' : Input.last === 'pad' ? 'press X' : 'press E'}`);
      AudioEngine.play('achievement', { vol: 0.6 });
    }
  },
  hitStop(d) { this.stopT = Math.max(this.stopT, d); },
  slowmo(d) { this.slowT = Math.max(this.slowT, d); },
  // returns the time scale for this frame
  tick(raw) {
    if (G.state !== 'night') { this.n = 0; this.ready = false; }
    this.t -= raw; if (this.t <= 0) this.n = 0;
    if (this.stopT > 0) { this.stopT -= raw; return 0.06; }
    if (this.slowT > 0) { this.slowT -= raw; return 0.35 + 0.65 * (1 - Math.min(1, this.slowT / 0.9)) * 0.3; }
    return 1;
  },
};
function popText(txt, x, y, z) {
  _v2.set(x, y, z).project(camera);
  if (_v2.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = txt;
  el.style.left = ((_v2.x + 1) / 2 * innerWidth) + 'px';
  el.style.top = ((1 - _v2.y) / 2 * innerHeight) + 'px';
  document.getElementById('labels').appendChild(el);
  setTimeout(() => el.remove(), 950);
}
// A prismatic star of light rays: the finishing flourish on a painted Gloom
function starBurst(x, y, z, scale = 1) {
  const cols = flowerColors();
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU;
    Sparkles.emit(x, y, z, { n: 4, color: cols[k % cols.length], speed: 0.6, vx: Math.cos(a) * 11 * scale, vz: Math.sin(a) * 11 * scale, up: 1.5, life: 0.55, size: 0.55 * scale, gravity: 0, drag: 4, bright: 2 });
  }
  Rings.emit(x, y - 0.4, z, { color: 0xffffff, r0: 0.2, r1: 3.2 * scale, life: 0.4, bright: 2.2 });
}
const GREY = new THREE.Color(0x8e88ac);
const GLOOM_EMISSIVE = new THREE.Color(0x2a2244);

function flowerColors() { return G.isle.pal.flower; }
// Collecting sparks plays a rising melody while they keep coming
let coinChain = 0, coinChainT = 0;
function collectSpark(n = 1) {
  G.sparks = G.sparks + n;
  const now = G.time;
  if (now - coinChainT > 1.4) coinChain = 0;
  coinChainT = now;
  AudioEngine.play('coin', { i: coinChain++, vol: 0.6 });
}
function nearestEnemy(x, z, range, exclude) {
  let best = null, bd = range * range;
  for (const e of G.enemies) {
    if (!e.alive || e.spawnT < 0.4 || e === exclude) continue;
    const d = dist2(x, z, e.x, e.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function segDist(px, pz, ax, az, bx, bz, out) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz + 1e-6), 0, 1);
  const cx = ax + vx * t, cz = az + vz * t;
  if (out) { out.x = cx; out.z = cz; }
  return Math.hypot(px - cx, pz - cz);
}
// Push a moving circle out of static + building colliders
const _cp = { x: 0, z: 0 };
function pushOut(p, r, includeHedges = true) {
  const isle = G.isle;
  for (const c of isle.colliders) {
    const dx = p.x - c.x, dz = p.z - c.z, min = c.r + r;
    if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 1e-5) { p.x += dx / d * (min - d); p.z += dz / d * (min - d); }
  }
  for (const pl of G.plots) {
    if (!pl.level) continue;
    if (pl.type === 'hedge') {
      if (!includeHedges) continue;
      const d = segDist(p.x, p.z, pl.ax, pl.az, pl.bx, pl.bz, _cp), min = 0.62 + r;
      if (d < min && d > 1e-5) { p.x += (p.x - _cp.x) / d * (min - d); p.z += (p.z - _cp.z) / d * (min - d); }
    } else {
      const dx = p.x - pl.x, dz = p.z - pl.z, min = pl.radius + r, d = Math.hypot(dx, dz);
      if (d < min && d > 1e-5) { p.x += dx / d * (min - d); p.z += dz / d * (min - d); }
    }
  }
  const dx = p.x - Heart.x, dz = p.z - Heart.z, min = Heart.radius + r, d = Math.hypot(dx, dz);
  if (d < min && d > 1e-5) { p.x += dx / d * (min - d); p.z += dz / d * (min - d); }
}
function keepInside(p, margin) {
  const r = Math.hypot(p.x, p.z), e = G.isle.edgeAt(p.x, p.z) - margin;
  if (r > e) { p.x *= e / r; p.z *= e / r; }
}

// ============================================================================
// Wobble: every clickable thing jiggles and sings
// ============================================================================
const Wobbles = [];
function wobble(o, note = 0, strength = 1) {
  const ex = Wobbles.find(w => w.o === o);
  if (ex) { ex.t = 0; ex.k = strength; return; }
  Wobbles.push({ o, t: 0, k: strength, bs: o.scale.clone(), bz: o.rotation.z });
}
function updateWobbles(dt) {
  for (let i = Wobbles.length - 1; i >= 0; i--) {
    const w = Wobbles[i];
    w.t += dt;
    const e = Math.exp(-w.t * 4.5) * w.k * (SAVE.settings.calm ? 0.45 : 1);
    const s = Math.sin(w.t * 22) * e;
    w.o.scale.set(w.bs.x * (1 - s * 0.12), w.bs.y * (1 + s * 0.2), w.bs.z * (1 - s * 0.12));
    w.o.rotation.z = w.bz + Math.sin(w.t * 15) * e * 0.08;
    if (w.t > 1.4) { w.o.scale.copy(w.bs); w.o.rotation.z = w.bz; Wobbles.splice(i, 1); }
  }
}

// ============================================================================
// Player: the Bloomkeeper riding Floof
// ============================================================================
const Player = {
  root: new THREE.Group(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0,
  hp: 12, maxHp: 12, alive: true, downT: 0, dashT: 0, dashCd: 0, fireCd: 0, burstCd: 0, walkPh: 0, trailAcc: 0, trailSide: 1,
  hurtT: 0, splashT: 0, flowerSndT: 0, regenT: 0, radius: 0.7, y: 0, moveTarget: null, stuckT: 0,
  init() {
    this.mount = Models.mount();
    this.rider = Models.rider(0x7a5cff);
    (this.mount.userData.seat || this.mount).add(this.rider);
    this.root.add(this.mount);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.light = new THREE.PointLight(0xffd29a, 0, 16, 1.4);
    this.light.position.set(0, 3.2, 0);
    this.root.add(this.light);
    scene.add(this.root);
  },
  spawnAt(x, z) {
    this.pos.set(x, G.isle.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp; this.alive = true; this.root.visible = true; this.root.scale.setScalar(1);
    this.root.position.copy(this.pos);
  },
  hurt(d) {
    if (!this.alive || G.mode === 'zen') return;
    this.hp -= d; this.hurtT = 0.25; this.regenT = 3;
    if (this.hp <= 0) this.down();
  },
  down() {
    this.alive = false; this.downT = 5;
    AudioEngine.play('playerDown');
    Confetti.emit(this.pos.x, this.pos.y + 1, this.pos.z, { n: 24, color: [0x8b86a3, 0xb9b3d0, 0xffffff], speed: 4, up: 5 });
    UI.toast('Floof needs a moment. Back at the Heart soon.');
  },
  staffWorld(out) {
    const t = this.rider && this.rider.userData.staffTip;
    if (t) return t.getWorldPosition(out);
    return out.set(this.pos.x, this.pos.y + 2.2, this.pos.z);
  },
  nova() {
    Combo.ready = false; Combo.n = 0;
    Combo.lockT = 3; // the Nova's own kills don't recharge it (counts only while the game runs)
    this.burstCd = 9;
    const { x, y, z } = this.pos;
    const cols = flowerColors();
    Combo.hitStop(0.12); Combo.slowmo(1.1);
    Cam.shake(0.8);
    UI.banner('Bloom Nova', 'Every color at once.');
    AudioEngine.play('burst'); AudioEngine.play('wish'); AudioEngine.play('upgrade');
    [G.isle.pal.accent, cols[0], cols[1], cols[2], cols[4]].forEach((c, i) => Rings.emit(x, y + i * 0.05, z, { color: c, r0: 0.4 + i * 0.3, r1: 14 - i * 1.8, life: 0.8 + i * 0.18, bright: 1.5 }));
    for (let k = 0; k < 40; k++) { const a = k / 40 * TAU * 3, r = k * 0.28; Sparkles.emit(x + Math.cos(a) * r, y + 0.5 + k * 0.12, z + Math.sin(a) * r, { n: 2, color: cols[k % cols.length], speed: 1, up: 3, life: 1.4, size: 0.55, gravity: -1, bright: 1.5 }); }
    Sparkles.emit(x, y + 1, z, { n: 55, color: cols, speed: 4, up: 14, life: 1.6, size: 0.5, gravity: -8, bright: 1.3 });
    Confetti.emit(x, y + 2, z, { n: 120, color: cols, speed: 12, up: 10 });
    Butterflies.burst(x, y + 1, z, 10, 1.3);
    this.staffWorld(_v1);
    const targets = G.enemies.filter(e => e.alive && dist2(e.x, e.z, x, z) < 16 * 16);
    for (let k = 0; k < 18 && targets.length; k++) {
      const e = targets[k % targets.length];
      Bolts.fire(_v1.x, _v1.y, _v1.z, e, { color: cols[k % cols.length], dmg: 2, speed: 16 + k, size: 1.5 });
    }
    for (const e of targets) { const d = Math.hypot(e.x - x, e.z - z); e.hurt(12 * (1 - d / 22), pick(cols)); }
  },
  burst() {
    if (this.burstCd > 0 || !this.alive) return;
    if (Combo.ready && G.state === 'night') return this.nova();
    this.burstCd = 9;
    const { x, y, z } = this.pos;
    const cols = flowerColors();
    Rings.emit(x, y, z, { color: G.isle.pal.accent, r0: 0.5, r1: 9, life: 0.9, bright: 2 });
    Rings.emit(x, y, z, { color: cols[1], r0: 0.3, r1: 6.5, life: 0.7, bright: 2 });
    Confetti.emit(x, y + 1, z, { n: 50, color: cols, speed: 9, up: 6 });
    Sparkles.emit(x, y + 1, z, { n: 60, color: cols, speed: 9, life: 1.1, size: 0.5, up: 2 });
    AudioEngine.play('burst');
    Cam.shake(0.35);
    let hitAny = 0;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < 9) { e.hurt(6 * (1 - d / 14), pick(cols)); hitAny++; }
    }
    // ring every flower in reach as a rolling arpeggio
    const near = G.isle.flowers.filter(f => dist2(f.x, f.z, x, z) < 64).sort((a, b) => dist2(a.x, a.z, x, z) - dist2(b.x, b.z, x, z));
    near.forEach((f, k) => { f.t = G.time - 10; f.queue = Math.sqrt(dist2(f.x, f.z, x, z)) * 0.07; FlowerBounce.add(f, f.queue, k < 14); });
  },
  update(dt) {
    const isle = G.isle;
    this.burstCd = Math.max(0, this.burstCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (!this.alive) {
      this.downT -= dt;
      this.root.scale.setScalar(Math.max(0.001, this.root.scale.x - dt * 2));
      if (this.downT <= 0) {
        this.spawnAt(0, 7.5);
        AudioEngine.play('respawn');
        Sparkles.emit(this.pos.x, this.pos.y + 1, this.pos.z, { n: 40, color: flowerColors(), speed: 5, life: 1, size: 0.5 });
        Rings.emit(this.pos.x, this.pos.y, this.pos.z, { color: 0xffffff, r1: 4 });
      }
      return;
    }
    const canMove = (G.state === 'day' || G.state === 'night' || G.state === 'dusk' || G.state === 'dawn') && !G.vibe && !UI.modal;
    let ax = canMove ? Input.axis() : { x: 0, y: 0 };
    const speed = 7.6;
    // click / tap / hold-to-steer: ride toward a point when no stick or keys are used
    if (Math.hypot(ax.x, ax.y) > 0.05 || !canMove) this.moveTarget = null;
    else if (this.moveTarget) {
      const mt = this.moveTarget, dx = mt.x - this.pos.x, dz = mt.z - this.pos.z, d = Math.hypot(dx, dz);
      const vsp = Math.hypot(this.vel.x, this.vel.z);
      this.stuckT = vsp < 0.6 && d > 1 ? this.stuckT + dt : 0;
      if (d < 0.45 || this.stuckT > 0.5) { this.moveTarget = null; this.stuckT = 0; }
      else { const k = Math.min(1, d / 1.6); ax = { x: dx / d * k, y: dz / d * k }; }
    }
    if (canMove && (Input.hit('ShiftLeft') || Input.hit('ShiftRight') || UI.touchDash) && this.dashCd <= 0) {
      const l = Math.hypot(ax.x, ax.y);
      const dx = l > 0.1 ? ax.x / l : Math.sin(this.yaw), dz = l > 0.1 ? ax.y / l : Math.cos(this.yaw);
      this.vel.set(dx * 22, 0, dz * 22);
      this.dashT = 0.2; this.dashCd = 1.0;
      this.dashHits = new Set();
      AudioEngine.play('dash');
    }
    UI.touchDash = false;
    if (canMove && (Input.hit('KeyE') || Input.hit('KeyQ') || UI.touchBurst)) this.burst();
    UI.touchBurst = false;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const night = G.state === 'night';
      Sparkles.emit(this.pos.x, this.pos.y + 0.6, this.pos.z, { n: night ? 7 : 3, color: flowerColors(), speed: 1.5, life: night ? 0.9 : 0.6, size: night ? 0.6 : 0.45, up: 0.5, bright: night ? 2 : 1.4 });
      // Petal Strike: dashing through Gloom at night paints them hard
      if (night) for (const e of G.enemies) {
        if (!e.alive || e.spawnT < 0.4 || (this.dashHits && this.dashHits.has(e))) continue;
        if (dist2(e.x, e.z, this.pos.x, this.pos.z) > Math.pow(1.4 + e.radius, 2)) continue;
        this.dashHits && this.dashHits.add(e);
        const col = pick(flowerColors());
        e.hurt(3.5, col);
        Combo.hitStop(0.07); Cam.shake(0.25);
        Rings.emit(e.x, e.y + 0.2, e.z, { color: col, r0: 0.2, r1: 2.4, life: 0.35, bright: 2.4 });
        Sparkles.emit(e.x, e.y + e.hitH, e.z, { n: 18, color: [col, 0xffffff], speed: 7, life: 0.5, size: 0.5, up: 1, bright: 2.2 });
        const hn = this.dashHits ? this.dashHits.size : 1;
        popText(hn === 1 ? 'Petal Strike' : hn === 2 ? 'Double!' : hn === 3 ? 'Triple!' : 'Petal Storm!', e.x, e.y + 3, e.z);
        if (hn >= 2) Combo.hitStop(0.05 + hn * 0.01);
        AudioEngine.play('hit', { vol: 0.9 }); AudioEngine.play('chime', { vol: 0.4 });
      }
    } else {
      const k = 1 - Math.exp(-10 * dt);
      this.vel.x += (ax.x * speed - this.vel.x) * k;
      this.vel.z += (ax.y * speed - this.vel.z) * k;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    pushOut(this.pos, this.radius);
    keepInside(this.pos, 1.0);
    const gh = isle.heightAt(this.pos.x, this.pos.z);
    const inWater = gh < -0.3;
    this.y = damp(this.y, Math.max(gh, -0.5), 18, dt);
    this.pos.y = this.y;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.4) this.yaw = angleLerp(this.yaw, Math.atan2(this.vel.x, this.vel.z), 1 - Math.exp(-12 * dt));
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    // animation
    const mv = clamp(sp / speed, 0, 1.4);
    this.walkPh += dt * (3 + sp * 1.7);
    const ud = this.mount.userData;
    if (ud.legs) ud.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.walkPh + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI * 0.5 : 0)) * 0.75 * Math.min(mv, 1); });
    if (ud.body) { ud.body.position.y = (ud.body.userData.by ?? (ud.body.userData.by = ud.body.position.y)) + Math.abs(Math.sin(this.walkPh)) * 0.1 * mv + Math.sin(G.time * 2) * 0.02; ud.body.rotation.x = -this.vel.length() * 0.004; }
    if (ud.head) ud.head.rotation.x = Math.sin(this.walkPh * 2) * 0.06 * mv;
    if (ud.tail) ud.tail.rotation.y = Math.sin(G.time * 6) * 0.35;
    const rd = this.rider.userData;
    if (rd.scarf) rd.scarf.rotation.x = -0.2 - mv * 0.6 + Math.sin(G.time * 9) * 0.1 * mv;
    if (rd.hat) rd.hat.rotation.x = -mv * 0.12 + Math.sin(G.time * 1.5) * 0.03;
    this.root.scale.setScalar(this.hurtT > 0 ? 1 + Math.sin(this.hurtT * 60) * 0.06 : 1);
    // bloom trail
    if (!inWater) {
      this.trailAcc += sp * dt;
      if (this.trailAcc > 0.85) {
        this.trailAcc = 0; this.trailSide *= -1;
        const nx = Math.cos(this.yaw) * 0.35 * this.trailSide, nz = -Math.sin(this.yaw) * 0.35 * this.trailSide;
        const tx = this.pos.x + nx - Math.sin(this.yaw) * 0.5, tz = this.pos.z + nz - Math.cos(this.yaw) * 0.5;
        Trail.spawn(tx, isle.heightAt(tx, tz) - 0.02, tz, pick(flowerColors()));
      }
    } else if (sp > 1) {
      this.splashT -= dt;
      if (this.splashT <= 0) {
        this.splashT = 0.12;
        Sparkles.emit(this.pos.x, -0.15, this.pos.z, { n: 4, color: [0xffffff, isle.pal.water], speed: 2.5, life: 0.5, size: 0.3, up: 2.5, gravity: -9 });
        if (Math.random() < 0.15) AudioEngine.play('splash', { vol: 0.4 });
      }
    }
    // ring flowers
    this.flowerSndT -= dt;
    const cs = isle.flowerCell, cx = Math.floor(this.pos.x / cs), cz = Math.floor(this.pos.z / cs);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const list = isle.flowerGrid.get(gx + ',' + gz);
      if (!list) continue;
      for (const f of list) {
        if (G.time - f.t < 1.4) continue;
        if (dist2(f.x, f.z, this.pos.x, this.pos.z) > 1.3) continue;
        f.t = G.time;
        FlowerBounce.add(f, 0, this.flowerSndT <= 0);
        if (this.flowerSndT <= 0) this.flowerSndT = 0.075;
      }
    }
    // regen
    this.regenT -= dt;
    if (this.regenT <= 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 1.5);
    // attack
    this.fireCd -= dt;
    if (G.state === 'night' && this.fireCd <= 0) {
      const e = nearestEnemy(this.pos.x, this.pos.z, 9.5);
      if (e) {
        this.fireCd = 0.3;
        this.staffWorld(_v1);
        Bolts.fire(_v1.x, _v1.y, _v1.z, e, { color: pick(flowerColors()), dmg: 1, speed: 22 });
        AudioEngine.play('shoot', { vol: 0.45, pan: panOf(this.pos.x) });
      }
    }
    // lantern light
    this.light.intensity = G.night * 4.5;
    windU.uPlayer.value.copy(this.pos);
  },
};

// Flowers that bounce + chime (shared by riding and Bloom Burst)
const FlowerBounce = (() => {
  const list = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
  function note(f) { return ((Math.floor((f.x * 0.9 + f.z * 0.45 + 400) / 1.3) + f.ci * 2) % 10 + 10) % 10; }
  function add(f, delay = 0, sound = true) {
    if (list.includes(f)) return;
    f.bt = -delay; f.snd = sound;
    list.push(f);
  }
  function update(dt) {
    if (!list.length) return;
    const ms = G.isle.flowerMeshes;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      const was = f.bt;
      f.bt += dt;
      if (f.bt < 0) continue;
      if (was < 0 || was === 0) {
        const col = G.isle.pal.flower[f.ci];
        Sparkles.emit(f.x, f.y + 0.4, f.z, { n: 3, color: col, speed: 1.6, life: 0.7, size: 0.28, up: 1.6 });
        if (f.snd) AudioEngine.play('flower', { i: note(f), vol: 0.32, pan: panOf(f.x) });
        SAVE.stats.flowers++;
        if (SAVE.stats.flowers === 200) Achieve('flowers200');
        if (SAVE.stats.flowers === 2000) Achieve('flowers2000');
      }
      const t = f.bt;
      const k = t > 1.1 ? 0 : Math.sin(t * 20) * Math.exp(-t * 5) * 0.5 + (t < 0.12 ? t * 3 : 0);
      q.setFromAxisAngle(ax, f.rot + k * 0.6); v.set(f.x, f.y, f.z); sc.set(f.s * (1 - k * 0.3), f.s * (1 + k), f.s * (1 - k * 0.3));
      m4.compose(v, q, sc);
      ms.stem.setMatrixAt(f.i, m4); ms.pet.setMatrixAt(f.i, m4);
      if (t > 1.1) list.splice(i, 1);
    }
    ms.stem.instanceMatrix.needsUpdate = ms.pet.instanceMatrix.needsUpdate = true;
  }
  function clear() { list.length = 0; }
  return { add, update, clear };
})();

// ============================================================================
// The Heart Tree
// ============================================================================
const Heart = {
  x: 0, z: 0, y: 0, hp: 40, maxHp: 40, radius: 1.9, grey: false, hurtT: 0, obj: null,
  init(isle, idx) {
    if (this.obj) scene.remove(this.obj);
    this.obj = Models.heartTree(isle.pal);
    this.y = isle.heightAt(0, 0);
    this.obj.position.set(0, this.y, 0);
    this.obj.traverse(o => { if (o.isMesh && o.material !== MAT.glow) { o.castShadow = true; o.receiveShadow = true; } });
    this.obj.userData.clickKind = 'heart';
    this.obj.userData.baseScale = 1;
    this.radius = (this.obj.userData.radius || 1.6) + 0.3;
    isle.group.add(this.obj);
    isle.clickables.push(this.obj);
    this.maxHp = this.hp = 34 + idx * 8;
    this.grey = false;
    if (!this.light) { this.light = new THREE.PointLight(0xff8fd0, 0, 22, 1.3); scene.add(this.light); }
    this.light.color.set(isle.pal.accent);
    this.light.position.set(0, this.y + 4.5, 1.2);
    this.pool = makeGlowPool(new THREE.Color(isle.pal.accent), 9);
    this.pool.position.set(0, this.y + 0.08, 0);
    isle.group.add(this.pool);
  },
  damage(a) {
    if (this.grey || G.mode === 'zen') return;
    this.hp -= a; this.hurtT = 0.2; this.alertT = 1.5;
    if (Math.random() < 0.1) Sparkles.emit(rr(-1.5, 1.5), this.y + rr(1, 5), rr(-1.5, 1.5), { n: 2, color: 0x8b86a3, speed: 1, life: 0.8, size: 0.4, up: 1, bright: 0.8 });
    if (this.hp <= 0) { this.hp = 0; Game.heartDimmed(); }
  },
  setGrey(g) { this.grey = g; setGreyMaterials(this.obj, g); },
  update(dt, time) {
    if (!this.obj) return;
    const ud = this.obj.userData;
    this.pulse = Math.max(0, (this.pulse || 0) - dt * 2.5);
    const pk = Math.sin(this.pulse * Math.PI) * 0.07;
    if (ud.crown) { const s = 1 + Math.sin(time * 1.1) * 0.012 + pk; ud.crown.scale.set(s, 1 + Math.sin(time * 1.1 + 0.6) * 0.015 + pk, s); ud.crown.rotation.y = Math.sin(time * 0.3) * 0.03; }
    if (ud.core) { const s = 1 + Math.sin(time * 2.2) * 0.07; ud.core.scale.setScalar(s); }
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.alertT = Math.max(0, (this.alertT || 0) - dt);
    this.obj.position.x = this.hurtT > 0 ? Math.sin(time * 70) * 0.08 : 0;
    this.light.intensity = G.night * (this.grey ? 2 : 11) * (0.85 + Math.sin(time * 2.2) * 0.15);
    this.pool.material.opacity = G.night * (this.grey ? 0.05 : 0.2);
  },
};

function setGreyMaterials(root, g) {
  root.traverse(o => {
    if (!o.isMesh) return;
    if (g) {
      if (o.userData.origMat) return;
      o.userData.origMat = o.material;
      o.material = (o.material === MAT.glow || o.material.isMeshBasicMaterial) ? MAT.greyGlow : MAT.grey;
    } else if (o.userData.origMat) { o.material = o.userData.origMat; delete o.userData.origMat; }
  });
}

// ============================================================================
// Plots + buildings
// ============================================================================
const markerRingGeo = new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2);
const markerDiscGeo = new THREE.CircleGeometry(0.86, 48).rotateX(-Math.PI / 2);
const markerGemGeo = new THREE.OctahedronGeometry(0.28, 0);

class Plot {
  constructor(spot, isle) {
    Object.assign(this, { spot, id: spot.id, type: spot.type, x: spot.x, z: spot.z, rot: spot.rot, rad: spot.rad });
    this.y = isle.heightAt(this.x, this.z);
    this.level = 0; this.paid = 0; this.landed = 0; this.inflight = 0;
    this.obj = null; this.hp = 1; this.maxHp = 1; this.grey = false; this.cd = rr(0, 1); this.grow = -1;
    this.visible = false; this.focus = 0; this.shakeT = 0; this.swingAmp = 0; this.villagers = [];
    this.radius = this.rad * 0.85;
    if (this.type === 'hedge') {
      const hx = Math.cos(this.rot) * 2.3, hz = -Math.sin(this.rot) * 2.3;
      this.ax = this.x - hx; this.az = this.z - hz; this.bx = this.x + hx; this.bz = this.z + hz;
    }
    // marker
    const m = this.marker = new THREE.Group();
    const accent = new THREE.Color(isle.pal.accent);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
    this.discMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.12, depthWrite: false });
    const ring = new THREE.Mesh(markerRingGeo, this.ringMat), disc = new THREE.Mesh(markerDiscGeo, this.discMat);
    const s = this.type === 'hedge' ? 1 : this.rad;
    ring.scale.set(s, 1, s); disc.scale.set(s, 1, s);
    if (this.type === 'hedge') { ring.scale.set(2.5, 1, 0.75); disc.scale.set(2.5, 1, 0.75); }
    m.add(ring, disc);
    this.gem = new THREE.Mesh(markerGemGeo, new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.6), toneMapped: false }));
    this.gem.position.y = 1.3;
    m.add(this.gem);
    m.position.set(this.x, this.y + 0.07, this.z);
    m.rotation.y = this.rot;
    m.visible = false;
    isle.group.add(m);
  }
  get def() { return BTYPES[this.type]; }
  get cost() { return this.level < 3 ? this.def.cost[this.level] : 0; }
  get L() { return Math.max(0, this.level - 1); }
  setVisible(v, animate) {
    if (v === this.visible) return;
    this.visible = v;
    this.marker.visible = v && this.level === 0;
    if (v && animate) {
      Sparkles.emit(this.x, this.y + 0.5, this.z, { n: 20, color: G.isle.pal.accent, speed: 3, life: 1, size: 0.4 });
      Rings.emit(this.x, this.y, this.z, { color: G.isle.pal.accent, r0: 0.3, r1: this.rad * 1.4 });
    }
  }
  distTo(x, z) {
    if (this.type === 'hedge') return segDist(x, z, this.ax, this.az, this.bx, this.bz) - 0.6;
    return Math.hypot(x - this.x, z - this.z) - this.radius;
  }
  closest(x, z, out) {
    if (this.type === 'hedge') { segDist(x, z, this.ax, this.az, this.bx, this.bz, out); return out; }
    const d = Math.hypot(x - this.x, z - this.z) || 1;
    out.x = this.x + (x - this.x) / d * this.radius; out.z = this.z + (z - this.z) / d * this.radius;
    return out;
  }
  setLevel(lvl, animate) {
    const isle = G.isle;
    if (this.obj) { isle.group.remove(this.obj); const ci = isle.clickables.indexOf(this.obj); if (ci >= 0) isle.clickables.splice(ci, 1); }
    this.level = lvl;
    this.marker.visible = this.visible && lvl === 0;
    if (!lvl) { this.obj = null; return; }
    const o = this.obj = Models.building(this.type, lvl, isle.pal);
    o.position.set(this.x, this.y, this.z);
    o.rotation.y = this.rot;
    o.traverse(c => { if (c.isMesh && c.material !== MAT.glow) { c.castShadow = true; c.receiveShadow = true; } });
    o.userData.clickKind = this.type;
    o.userData.baseScale = 1;
    o.userData.plot = this;
    isle.group.add(o);
    isle.clickables.push(o);
    if (this.type !== 'hedge') this.radius = Math.max(o.userData.radius || this.rad * 0.8, 0.6);
    this.maxHp = this.hp = this.def.hp[lvl - 1];
    this.grey = false;
    if (!this.pool) {
      const pr = { lantern: this.def.radius ? this.def.radius[0] : 5, cottage: 3.4, tower: 2.4, grove: 3.4, chime: 3.2, field: 0, hedge: 0 }[this.type];
      if (pr) { this.pool = makeGlowPool(new THREE.Color(this.type === 'lantern' || this.type === 'cottage' ? isle.pal.glow : isle.pal.accent), pr); this.pool.position.set(this.x, this.y + 0.09, this.z); isle.group.add(this.pool); }
    }
    if (this.pool && this.type === 'lantern') this.pool.scale.setScalar(this.def.radius[lvl - 1]);
    if (animate) {
      this.grow = 0;
      o.scale.set(0.3, 0.01, 0.3);
    }
    if (this.type === 'cottage') this.syncVillagers();
  }
  syncVillagers() {
    const want = this.level;
    while (this.villagers.length < want) this.villagers.push(new Villager(this));
  }
  save() {
    const ps = G.isleSave.plots;
    if (this.level || this.paid) ps[this.id] = { l: this.level, p: this.paid, w: this.grey ? 1 : 0 }; else delete ps[this.id];
    saveSoon();
  }
  // one spark leaves the player
  payOne() {
    this.paid++; this.inflight++;
    G.sparks = G.sparks - 1;
    const idx = this.paid;
    Player.staffWorld(_v1);
    const from = { x: Player.pos.x, y: Player.pos.y + 1.6, z: Player.pos.z };
    Coins.fly(from, () => ({ x: this.x, y: this.y + 0.9, z: this.z }), 0.34, () => {
      this.inflight--;
      AudioEngine.play('coinPay', { i: idx - 1, vol: 0.7, pan: panOf(this.x) });
      Sparkles.emit(this.x, this.y + 0.9, this.z, { n: 5, color: [0xffd36b, 0xff9ad0], speed: 2, life: 0.5, size: 0.3 });
      this.gem.scale.setScalar(1.5);
      if (this.paid >= this.cost && this.inflight === 0) this.complete();
    }, 0, 1.6);
    this.save();
  }
  complete() {
    const up = this.level > 0;
    this.paid = 0;
    this.justBuilt = true;
    this.setLevel(this.level + 1, true);
    this.save();
    const cols = flowerColors();
    Confetti.emit(this.x, this.y + 1.5, this.z, { n: 36, color: cols, speed: 6, up: 7 });
    Sparkles.emit(this.x, this.y + 1.5, this.z, { n: 40, color: cols, speed: 6, life: 1.1, size: 0.45 });
    Rings.emit(this.x, this.y, this.z, { color: G.isle.pal.accent, r0: 0.5, r1: this.rad * 2.4, life: 0.8 });
    AudioEngine.play(up ? 'upgrade' : 'build');
    Cam.shake(0.15);
    SAVE.stats.built++;
    Achieve('build1');
    if (this.level === 3) Achieve('max1');
    UI.toast(`${this.def.name} ${up ? 'grew to level ' + this.level : 'bloomed'}`);
  }
  damage(a) {
    if (this.grey || !this.level || G.mode === 'zen') return;
    if (SAVE.settings.pace === 'gentle') a *= 0.7;
    this.hp -= a; this.shakeT = 0.18;
    if (Math.random() < 0.12) Sparkles.emit(this.x + rr(-1, 1), this.y + rr(0.5, 2.5), this.z + rr(-1, 1), { n: 2, color: 0x8b86a3, speed: 1, life: 0.8, size: 0.4, up: 1, bright: 0.8 });
    if (this.hp <= 0) this.setGrey(true);
  }
  setGrey(g, animate = true) {
    if (!this.obj || this.grey === g) return;
    for (let i = Wobbles.length - 1; i >= 0; i--) if (Wobbles[i].o === this.obj) Wobbles.splice(i, 1);
    this.grey = g; this.mending = false;
    setGreyMaterials(this.obj, g);
    const o = this.obj;
    if (g) {
      // wrecked: slumped, tilted and sunk into the ground until the Heart mends it
      this.hp = 0; this.grow = -1;
      o.rotation.set((Math.random() - 0.5) * 0.3, this.rot, (Math.random() < 0.5 ? -1 : 1) * rr(0.14, 0.26));
      o.scale.set(1.06, 0.6, 1.06);
      o.position.y = this.y - 0.32;
      if (animate) {
        AudioEngine.play('grey', { pan: panOf(this.x) });
        Cam.shake(0.2);
        if (G.time - (Game.wreckToastT || -99) > 6) { Game.wreckToastT = G.time; UI.toast(`Your ${this.def.name} was wrecked`); }
        Sparkles.emit(this.x, this.y + 1.5, this.z, { n: 24, color: [0x8b86a3, 0x5d5870], speed: 3, life: 1.2, size: 0.5, bright: 0.9 });
        Confetti.emit(this.x, this.y + 1.5, this.z, { n: 22, color: [0x7a6f8a, 0x9a8f9a, 0x5d5870, 0xb8a898], speed: 5, up: 5, size: 0.3, flutter: 0.3, life: 3 });
      }
      this.save();
    } else {
      this.hp = this.maxHp;
      o.rotation.set(0, this.rot, 0);
      o.position.y = this.y;
      o.scale.set(1, 1, 1);
      if (animate) {
        this.grow = 0;
        Sparkles.emit(this.x, this.y + 1.2, this.z, { n: 36, color: flowerColors(), speed: 5, life: 1.1, size: 0.5, bright: 1.8 });
        Confetti.emit(this.x, this.y + 1.5, this.z, { n: 24, color: flowerColors(), speed: 5, up: 7 });
        Rings.emit(this.x, this.y, this.z, { color: G.isle.pal.accent, r0: 0.4, r1: this.rad * 2.2, life: 0.7, bright: 2 });
        Butterflies.burst(this.x, this.y + 1, this.z, 2);
      }
      this.save();
    }
  }
  update(dt, time) {
    // marker
    if (this.marker.visible) {
      const f = this.focus;
      const nd = (1 - G.night * 0.75) * (G.sparks >= this.cost - this.paid || f > 0.5 ? 1 : 0.45);
      this.ringMat.opacity = ((G.state === 'day' ? 0.5 : 0.2) + f * 0.45 + Math.sin(time * 3 + this.x) * 0.06) * nd;
      this.discMat.opacity = (0.08 + f * 0.22) * nd;
      const gs = this.gem.scale.x;
      this.gem.scale.setScalar(damp(gs, 1, 6, dt));
      this.gem.position.y = 1.3 + Math.sin(time * 2 + this.z) * 0.15;
      this.gem.rotation.y = time * 1.4;
      this.gem.visible = G.state === 'day';
    }
    if (!this.obj) return;
    const o = this.obj;
    // grow / regrow animation
    if (this.grow >= 0) {
      this.grow += dt;
      const t = clamp(this.grow / 0.9, 0, 1);
      const e = easeOutElastic(t);
      o.scale.set(lerp(0.3, 1, Math.min(1, t * 2.5)) * (1 + (1 - e) * 0.2), Math.max(0.01, e), lerp(0.3, 1, Math.min(1, t * 2.5)) * (1 + (1 - e) * 0.2));
      if (t >= 1) { this.grow = -1; o.scale.set(1, 1, 1); }
    }
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.grey && Math.random() < dt * 2.5) Sparkles.emit(this.x + rr(-0.8, 0.8), this.y + rr(0.6, 1.8), this.z + rr(-0.8, 0.8), { n: 1, color: 0x8b86a3, speed: 0.3, up: 1.2, life: 1.6, size: 0.7, gravity: 0.2, bright: 0.6 });
    o.position.x = this.x + (this.shakeT > 0 ? Math.sin(time * 80) * 0.06 : 0);
    const ud = o.userData;
    if (ud.spin && !this.grey) for (const s of ud.spin) s.obj.rotation[s.axis || 'y'] += (s.speed || 1) * dt;
    this.swingAmp = damp(this.swingAmp, 0, 1.5, dt);
    if (ud.swing) ud.swing.forEach((s, i) => { s.rotation.z = Math.sin(time * 2.2 + i * 1.3) * (0.05 + this.swingAmp * 0.5); });
    if (this.pool) this.pool.material.opacity = this.grey ? 0 : G.night * (this.type === 'lantern' ? 0.5 : 0.32) * (0.9 + Math.sin(time * 3 + this.x) * 0.1);
    if (this.grey || G.state !== 'night') return;
    const L = this.L, d = this.def;
    if (this.type === 'tower') {
      this.cd -= dt;
      const tgt = nearestEnemy(this.x, this.z, d.range[L]);
      if (tgt && ud.head) {
        const ang = Math.atan2(tgt.x - this.x, tgt.z - this.z) - this.rot;
        ud.head.rotation.y = angleLerp(ud.head.rotation.y, ang, 1 - Math.exp(-10 * dt));
      }
      if (tgt && this.cd <= 0) {
        this.cd = 1 / d.rate[L];
        if (ud.muzzle) ud.muzzle.getWorldPosition(_v1); else _v1.set(this.x, this.y + (ud.height || 4), this.z);
        const col = pick(flowerColors());
        Bolts.fire(_v1.x, _v1.y, _v1.z, tgt, { color: col, dmg: d.dmg[L], speed: 18 });
        if (L === 2) {
          const t2 = nearestEnemy(this.x, this.z, d.range[L], tgt) || tgt;
          Bolts.fire(_v1.x, _v1.y + 0.2, _v1.z, t2, { color: pick(flowerColors()), dmg: d.dmg[L], speed: 17 });
        }
        AudioEngine.play('towerShoot', { vol: 0.4, pan: panOf(this.x) });
      }
    } else if (this.type === 'lantern') {
      const r2 = d.radius[L] * d.radius[L];
      for (const e of G.enemies) {
        if (!e.alive) continue;
        if (dist2(e.x, e.z, this.x, this.z) < r2) {
          e.slow = Math.max(e.slow, d.slow[L]);
          e.hurt(d.dps[L] * dt, G.isle.pal.glow, true);
          if (Math.random() < dt * 3) Sparkles.emit(e.x, e.y + 1, e.z, { n: 1, color: G.isle.pal.glow, speed: 0.5, life: 0.8, size: 0.35, up: 1.2, gravity: 0 });
        }
      }
    } else if (this.type === 'chime') {
      this.cd -= dt;
      if (this.cd <= 0) {
        const r = d.radius[L];
        const any = G.enemies.some(e => e.alive && dist2(e.x, e.z, this.x, this.z) < r * r);
        if (any) {
          this.cd = d.period[L];
          this.swingAmp = 1;
          Rings.emit(this.x, this.y + 0.2, this.z, { color: G.isle.pal.accent, r0: 0.5, r1: r, life: 0.6, bright: 2 });
          Rings.emit(this.x, this.y + 0.2, this.z, { color: 0xffffff, r0: 0.3, r1: r * 0.8, life: 0.5 });
          for (const e of G.enemies) if (e.alive && dist2(e.x, e.z, this.x, this.z) < r * r) e.hurt(d.dmg[L], pick(flowerColors()));
          AudioEngine.play('chime', { pan: panOf(this.x), vol: 0.6 });
        } else this.cd = 0.25;
      }
    }
  }
}

// ============================================================================
// The Gloom
// ============================================================================
class Enemy {
  constructor(type, rift, hpMul) {
    this.type = type; this.def = ETYPES[type];
    this.obj = Models.enemy(type);
    this.obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.mat = this.obj.userData.mat;
    this.mat.color.copy(GREY);
    if (this.mat.emissive) this.mat.emissive.copy(GLOOM_EMISSIVE);
    this.maxHp = this.hp = this.def.hp * hpMul;
    this.radius = this.def.radius;
    this.hitH = (this.obj.userData.height || this.radius * 2) * 0.5;
    this.x = rift.x + rr(-0.6, 0.6); this.z = rift.z + rr(-0.6, 0.6); this.y = G.isle.heightAt(this.x, this.z);
    this.path = G.isle.paths[rift.path].pts;
    this.wp = 1; this.target = null; this.retargetT = 0; this.slow = 0; this.alive = true; this.dying = -1;
    this.spawnT = 0; this.hitT = 0; this.ph = rr(0, TAU); this.blinkT = rr(1, 4); this.yaw = 0; this.atkT = 0;
    this.paint = new THREE.Color(pick(flowerColors()));
    this.speed = this.def.speed * rr(0.9, 1.1) * (1 + (ISLANDS[G.isleIdx].difficulty - 1) * 0.15);
    this.obj.position.set(this.x, this.y - 1, this.z);
    this.obj.scale.setScalar(0.01);
    scene.add(this.obj);
  }
  hurt(amount, color, silent) {
    if (!this.alive) return;
    this.hp -= amount;
    if (color !== undefined && !silent) this.paint.lerp(_c1.set(color), 0.35);
    const p = Math.pow(clamp(1 - this.hp / this.maxHp, 0, 1), 0.75);
    this.mat.color.copy(GREY).lerp(this.paint, p);
    if (this.mat.emissive) this.mat.emissive.copy(GLOOM_EMISSIVE).lerp(_c2.copy(this.paint).multiplyScalar(0.35), p);
    if (!silent) this.hitT = 0.14;
    if (this.hp <= 0) this.heal();
  }
  heal() {
    this.alive = false; this.dying = 0;
    const { x, z } = this; const y = this.y + this.hitH;
    const cols = flowerColors();
    const big = this.type === 'boss' ? 3 : this.type === 'lump' ? 1.6 : 1;
    Confetti.emit(x, y, z, { n: Math.round(22 * big), color: cols.concat([this.paint.getHex()]), speed: 5 * big, up: 6 });
    Sparkles.emit(x, y, z, { n: Math.round(26 * big), color: cols, speed: 5 * big, life: 1.1, size: 0.45 * Math.sqrt(big) });
    Rings.emit(x, this.y, z, { color: this.paint, r0: 0.3, r1: 2.5 * big, life: 0.6 });
    const nB = { smudge: 2, drifter: 1, splitter: 3, lump: 4, boss: 18 }[this.type];
    Butterflies.burst(x, y, z, nB, this.type === 'boss' ? 1.6 : 1);
    AudioEngine.play('heal', { i: ri(0, 9), pan: panOf(x), vol: this.type === 'boss' ? 1 : 0.75 });
    if (Math.random() < this.def.drop) for (let k = 0; k < this.def.dropN; k++) Coins.drop(x, y, z, () => collectSpark());
    SAVE.stats.healed++;
    Achieve('heal1');
    if (SAVE.stats.healed >= 100) Achieve('heal100');
    if (SAVE.stats.healed >= 500) Achieve('heal500');
    if (this.type === 'boss') { SAVE.stats.bosses++; Achieve('boss1'); Cam.shake(0.6); }
    if (this.type === 'splitter') {
      for (let k = 0; k < 2; k++) {
        const e = new Enemy('smudge', { x, z, path: 0 }, (this.maxHp / this.def.hp) * 0.6);
        e.path = this.path; e.wp = this.wp; e.x = x + rr(-0.8, 0.8); e.z = z + rr(-0.8, 0.8); e.spawnT = 0.3;
        G.enemies.push(e); Game.waveTotal++;
      }
    }
    Combo.add(x, y, z, this.paint);
    if (Combo.n >= 2 || this.type === 'boss' || Combo.lockT > 0) { starBurst(x, y, z, this.type === 'boss' ? 2 : 1 + Math.min(Combo.n, 6) * 0.08); Combo.hitStop(0.045); }
    Game.onHealed(this);
  }
  fade() { // dissolves without reward (when the Heart dims)
    this.alive = false; this.dying = 0; this.silentDeath = true;
    Sparkles.emit(this.x, this.y + this.hitH, this.z, { n: 10, color: 0x8b86a3, speed: 2, life: 1, size: 0.5, bright: 0.8 });
  }
  retarget() {
    const P = Player;
    if (P.alive && G.mode !== 'zen' && dist2(P.pos.x, P.pos.z, this.x, this.z) < Math.pow(4.2 + this.radius, 2)) { this.target = { kind: 'player' }; return; }
    if (this.target && this.target.kind === 'plot' && !this.target.ref.grey && this.target.ref.level) return;
    if (!this.def.flying) {
      let best = null, bd = 3.0 + this.radius * 0.5;
      for (const p of G.plots) { if (!p.level || p.grey) continue; const d = p.distTo(this.x, this.z); if (d < bd) { bd = d; best = p; } }
      if (best) { this.target = { kind: 'plot', ref: best }; return; }
    }
    this.target = null;
  }
  update(dt, time) {
    const o = this.obj;
    if (this.dying >= 0) {
      this.dying += dt;
      const t = this.dying / 0.3;
      const s = t < 0.5 ? 1 + t * 0.7 : Math.max(0.001, 1.35 * (1 - (t - 0.5) * 2));
      o.scale.setScalar(s);
      if (this.silentDeath) { this.mat.transparent = true; this.mat.opacity = 1 - t; }
      return t >= 1;
    }
    this.spawnT += dt;
    this.hitT = Math.max(0, this.hitT - dt);
    const slow = this.slow; this.slow = 0;
    this.retargetT -= dt;
    if (this.retargetT <= 0) { this.retargetT = 0.35; this.retarget(); }
    let tx, tz, reach, attacking = false;
    const t = this.target;
    if (t && t.kind === 'player') {
      if (!Player.alive) { this.target = null; }
      tx = Player.pos.x; tz = Player.pos.z; reach = this.radius + 0.65;
    } else if (t && t.kind === 'plot') {
      t.ref.closest(this.x, this.z, _cp); tx = _cp.x; tz = _cp.z; reach = this.radius + 0.35 + (t.ref.type === 'hedge' ? 0.62 : 0);
      if (t.ref.grey || !t.ref.level) this.target = null;
    }
    if (!this.target) {
      if (this.def.flying || this.wp >= this.path.length) { tx = Heart.x; tz = Heart.z; reach = this.radius + Heart.radius + 0.2; this.atHeart = true; }
      else {
        const p = this.path[this.wp];
        tx = p.x; tz = p.z; reach = -1;
        if (dist2(this.x, this.z, tx, tz) < 2.2) this.wp++;
      }
    }
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
    const spd = this.speed * (1 - slow) * (this.spawnT < 0.6 ? 0.3 : 1) * (SAVE.settings.pace === 'gentle' ? 0.72 : 1);
    if (reach > 0 && d <= reach) {
      attacking = true;
      this.atkT += dt;
      const dmg = this.def.dmg * dt;
      if (this.target && this.target.kind === 'player') Player.hurt(dmg * 1.4);
      else if (this.target && this.target.kind === 'plot') this.target.ref.damage(dmg);
      else Heart.damage(dmg);
    } else {
      this.x += dx / d * spd * dt; this.z += dz / d * spd * dt;
    }
    // hedges block walkers
    if (!this.def.flying) {
      for (const p of G.plots) {
        if (p.type !== 'hedge' || !p.level || p.grey) continue;
        const hd = segDist(this.x, this.z, p.ax, p.az, p.bx, p.bz, _cp), min = 0.62 + this.radius;
        if (hd < min && hd > 1e-5) {
          this.x += (this.x - _cp.x) / hd * (min - hd); this.z += (this.z - _cp.z) / hd * (min - hd);
          if (!this.target) this.target = { kind: 'plot', ref: p };
        }
      }
    }
    // separation
    for (const e of G.enemies) {
      if (e === this || !e.alive) continue;
      const sx = this.x - e.x, sz = this.z - e.z, min = (this.radius + e.radius) * 0.85;
      if (Math.abs(sx) > min || Math.abs(sz) > min) continue;
      const sd = Math.hypot(sx, sz);
      if (sd < min && sd > 1e-4) { const push = (min - sd) * 0.5; this.x += sx / sd * push; this.z += sz / sd * push; }
    }
    if (this.target && this.target.kind === 'player') { const p = { x: this.x, z: this.z }; pushOut(p, this.radius * 0.8, false); this.x = p.x; this.z = p.z; }
    const gh = G.isle.heightAt(this.x, this.z);
    this.y = damp(this.y, Math.max(gh, -0.35), 12, dt);
    // visuals
    const moving = !attacking;
    this.ph += dt * (moving ? spd * 2.6 : 5);
    this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
    o.rotation.y = this.yaw;
    const sq = Math.sin(this.ph) * (moving ? 0.08 : 0.04) + (attacking ? Math.sin(this.atkT * 9) * 0.07 : 0);
    const spawnS = this.spawnT < 0.7 ? easeOutBack(this.spawnT / 0.7) : 1;
    const hs = this.hitT / 0.14;
    o.scale.set(spawnS * (1 - sq * 0.5 + hs * 0.25), spawnS * (1 + sq - hs * 0.3), spawnS * (1 - sq * 0.5 + hs * 0.25));
    const rise = this.spawnT < 0.7 ? (1 - smooth(this.spawnT / 0.7)) * -1 : 0;
    o.position.set(this.x, this.y + rise + (this.def.flying ? Math.sin(time * 2.5 + this.ph) * 0.25 : Math.abs(Math.sin(this.ph)) * 0.08), this.z);
    const eyes = o.userData.eyes;
    if (eyes) {
      this.blinkT -= dt;
      eyes.scale.y = this.blinkT < 0.12 ? 0.15 : 1;
      if (this.blinkT < 0) this.blinkT = rr(1.8, 4.5);
    }
    return false;
  }
  dispose() { scene.remove(this.obj); this.mat.dispose(); }
}

// ============================================================================
// Sprites from the Sprite Grove
// ============================================================================
class Sprite {
  constructor(grove, k) {
    this.grove = grove; this.k = k;
    this.obj = Models.sprite();
    this.x = grove.x; this.z = grove.z; this.y = grove.y + 1.5;
    this.ph = rr(0, TAU); this.target = null; this.retargetT = 0; this.zapT = 0; this.life = 0;
    this.obj.position.set(this.x, this.y, this.z);
    scene.add(this.obj);
  }
  update(dt, time) {
    this.life += dt;
    const g = this.grove;
    this.retargetT -= dt;
    if (this.retargetT <= 0) {
      this.retargetT = 0.5;
      const e = nearestEnemy(this.x, this.z, 8);
      this.target = e && dist2(e.x, e.z, g.x, g.z) < 15 * 15 ? e : null;
    }
    let tx, tz, ty;
    if (this.target && this.target.alive) {
      tx = this.target.x + Math.cos(time * 3 + this.ph) * 0.9; tz = this.target.z + Math.sin(time * 3 + this.ph) * 0.9; ty = this.target.y + this.target.hitH + 0.6;
      if (dist2(this.x, this.z, this.target.x, this.target.z) < 2.6) {
        this.target.hurt(1.5 * dt, 0xd6ff7a, true);
        this.zapT -= dt;
        if (this.zapT <= 0) { this.zapT = 0.12; Sparkles.emit(lerp(this.x, this.target.x, 0.5), lerp(this.y, this.target.y + this.target.hitH, 0.5), lerp(this.z, this.target.z, 0.5), { n: 2, color: [0xd6ff7a, 0xfff27a], speed: 1, life: 0.35, size: 0.35, up: 0, gravity: 0 }); }
      }
    } else {
      const a = time * 0.9 + this.k * TAU / 5;
      tx = g.x + Math.cos(a) * 2.4; tz = g.z + Math.sin(a) * 2.4; ty = g.y + 1.8 + Math.sin(time * 2 + this.k) * 0.3;
    }
    const k = 1 - Math.exp(-3.2 * dt);
    this.x += (tx - this.x) * k; this.z += (tz - this.z) * k; this.y += (ty - this.y) * k;
    this.obj.position.set(this.x, this.y + Math.sin(time * 6 + this.ph) * 0.1, this.z);
    this.obj.rotation.y = time * 2 + this.ph;
    this.obj.scale.setScalar(Math.min(1, this.life * 2));
    if (Math.random() < dt * 6) Sparkles.emit(this.x, this.y, this.z, { n: 1, color: 0xd6ff7a, speed: 0.3, life: 0.5, size: 0.25, up: -0.2, gravity: 0 });
  }
  dispose() { scene.remove(this.obj); }
}

// ============================================================================
// Villagers
// ============================================================================
class Villager {
  constructor(home) {
    this.home = home;
    const pal = G.isle.pal;
    this.obj = Models.villager(pick(pal.roof.concat(pal.flower.slice(0, 5))), Math.random);
    this.obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.obj.userData.clickKind = 'villager';
    this.obj.userData.baseScale = 1;
    const door = this.door();
    this.x = door.x + rr(-0.6, 0.6); this.z = door.z + rr(-0.6, 0.6);
    this.tx = this.x; this.tz = this.z; this.wait = rr(0.5, 3); this.inside = false; this.s = 0; this.ph = rr(0, TAU); this.yaw = 0; this.hop = 0; this.greetT = 0;
    this.obj.position.set(this.x, G.isle.heightAt(this.x, this.z), this.z);
    this.obj.scale.setScalar(0.001);
    scene.add(this.obj);
    G.isle.clickables.push(this.obj);
    G.villagers.push(this);
  }
  door() { const h = this.home; return { x: h.x + Math.sin(h.rot) * 2.2, z: h.z + Math.cos(h.rot) * 2.2 }; }
  pickDest() {
    const r = Math.random();
    let x, z;
    if (r < 0.35) { const d = this.door(); x = d.x + rr(-3, 3); z = d.z + rr(-3, 3); }
    else if (r < 0.65) { const a = rr(0, TAU), rad = rr(4.4, 5.6); x = Math.cos(a) * rad; z = Math.sin(a) * rad; }
    else { const built = G.plots.filter(p => p.level && p.type !== 'hedge'); const p = built.length ? pick(built) : this.home; x = p.x + Math.sin(p.rot) * (p.radius + 1.4); z = p.z + Math.cos(p.rot) * (p.radius + 1.4); }
    const pt = { x, z }; keepInside(pt, 2); this.tx = pt.x; this.tz = pt.z;
  }
  update(dt, time) {
    const goHome = G.night > 0.55 || this.home.grey;
    let target = 1;
    if (goHome) {
      const d = this.door();
      this.tx = d.x; this.tz = d.z;
      if (dist2(this.x, this.z, d.x, d.z) < 0.5) { this.inside = true; }
    } else if (this.inside) { this.inside = false; const d = this.door(); this.x = d.x; this.z = d.z; this.wait = rr(0.5, 2); }
    if (this.inside) target = 0;
    this.s = damp(this.s, target, 6, dt);
    const dx = this.tx - this.x, dz = this.tz - this.z, d = Math.hypot(dx, dz);
    let moving = false;
    if (d > 0.25) {
      if (this.wait <= 0 || goHome) {
        const sp = goHome ? 2.4 : 1.3;
        this.x += dx / d * sp * dt; this.z += dz / d * sp * dt; moving = true;
        this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
      } else this.wait -= dt;
    } else if (!goHome) {
      this.wait -= dt;
      if (this.wait <= 0) { this.pickDest(); this.wait = rr(1.5, 6); }
    }
    // greet the player
    this.greetT -= dt;
    if (Player.alive && this.greetT <= 0 && !this.inside && dist2(this.x, this.z, Player.pos.x, Player.pos.z) < 6) {
      this.greetT = rr(6, 12); this.hop = 0.001;
      this.yaw = Math.atan2(Player.pos.x - this.x, Player.pos.z - this.z);
      Sparkles.emit(this.x, G.isle.heightAt(this.x, this.z) + 1.3, this.z, { n: 6, color: [0xff7ab8, 0xffd36b], speed: 1.5, life: 0.8, size: 0.3, up: 1.8 });
    }
    let hy = 0;
    if (this.hop > 0) { this.hop += dt; hy = Math.sin(clamp(this.hop / 0.45, 0, 1) * Math.PI) * 0.55; if (this.hop > 0.45) this.hop = 0; }
    this.ph += dt * (moving ? 9 : 2);
    const y = G.isle.heightAt(this.x, this.z);
    this.obj.position.set(this.x, y + hy + (moving ? Math.abs(Math.sin(this.ph)) * 0.08 : 0), this.z);
    this.obj.rotation.y = this.yaw;
    if (!Wobbles.some(w => w.o === this.obj)) this.obj.scale.setScalar(Math.max(0.001, this.s));
    this.obj.visible = this.s > 0.02;
  }
  dispose() { scene.remove(this.obj); }
}

// ============================================================================
// Critters: bunnies, birds, fish, ambient butterflies
// ============================================================================
class Bunny {
  constructor(isle) {
    this.obj = Models.bunny(pick([0xffffff, 0xf7e8dc, 0xe8d2c0, 0xfff0f6]));
    this.obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.obj.userData.clickKind = 'bunny';
    this.obj.userData.baseScale = 1;
    let x = 0, z = 0;
    for (let t = 0; t < 40; t++) { const a = rr(0, TAU), r = rr(10, isle.R * 0.85); x = Math.cos(a) * r; z = Math.sin(a) * r; if (isle.inside(x, z, 3) && isle.pathDist(x, z) > 2) break; }
    this.x = x; this.z = z; this.hopT = -1; this.wait = rr(0.5, 3); this.yaw = rr(0, TAU); this.fx = x; this.fz = z; this.tx = x; this.tz = z;
    this.obj.position.set(x, isle.heightAt(x, z), z);
    isle.group.add(this.obj);
    isle.clickables.push(this.obj);
  }
  update(dt, time) {
    const isle = G.isle;
    const pd = dist2(this.x, this.z, Player.pos.x, Player.pos.z);
    if (this.hopT < 0) {
      this.wait -= dt * (pd < 12 ? 4 : 1);
      if (this.wait <= 0) {
        let a = rr(0, TAU), len = rr(0.6, 1.4);
        if (pd < 12) { a = Math.atan2(this.x - Player.pos.x, this.z - Player.pos.z) + rr(-0.6, 0.6); len = rr(1.2, 1.9); }
        const p = { x: this.x + Math.sin(a) * len, z: this.z + Math.cos(a) * len };
        keepInside(p, 2.5); pushOut(p, 0.3);
        this.fx = this.x; this.fz = this.z; this.tx = p.x; this.tz = p.z; this.hopT = 0; this.yaw = a;
      }
    } else {
      this.hopT += dt;
      const t = clamp(this.hopT / 0.32, 0, 1);
      this.x = lerp(this.fx, this.tx, t); this.z = lerp(this.fz, this.tz, t);
      if (t >= 1) { this.hopT = -1; this.wait = pd < 12 ? rr(0.05, 0.25) : rr(0.8, 4); }
    }
    const hy = this.hopT >= 0 ? Math.sin(clamp(this.hopT / 0.32, 0, 1) * Math.PI) * 0.4 : 0;
    this.obj.position.set(this.x, isle.heightAt(this.x, this.z) + hy, this.z);
    this.obj.rotation.y = this.yaw;
    const ears = this.obj.userData.ears;
    if (ears) ears.rotation.x = Math.sin(time * 3 + this.x) * 0.1 - hy * 0.6;
    this.obj.visible = G.night < 0.8;
  }
}

const Birds = {
  flock: [], timer: 20,
  update(dt, time) {
    this.timer -= dt;
    if (this.timer <= 0 && !this.flock.length && G.night < 0.3) {
      this.timer = rr(35, 70);
      const n = ri(5, 9), a = rr(0, TAU), dir = { x: -Math.cos(a), z: -Math.sin(a) };
      const sx = Math.cos(a) * 110, sz = Math.sin(a) * 110, y = rr(12, 20);
      const col = pick([0xffffff, 0xfff0f6, 0xffe8c8]);
      for (let i = 0; i < n; i++) {
        const o = Models.bird(col);
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        const ox = -dir.z * side * row * 1.6 - dir.x * row * 1.4, oz = dir.x * side * row * 1.6 - dir.z * row * 1.4;
        o.position.set(sx + ox, y + rr(-0.4, 0.4), sz + oz);
        o.rotation.y = Math.atan2(dir.x, dir.z);
        scene.add(o);
        this.flock.push({ o, ph: rr(0, TAU), dir, life: 0 });
      }
    }
    for (let i = this.flock.length - 1; i >= 0; i--) {
      const b = this.flock[i];
      b.life += dt;
      b.o.position.x += b.dir.x * 11 * dt; b.o.position.z += b.dir.z * 11 * dt;
      b.o.position.y += Math.sin(time * 1.5 + b.ph) * 0.01;
      const f = Math.sin(time * 11 + b.ph) * 0.7;
      if (b.o.userData.wingL) b.o.userData.wingL.rotation.z = f;
      if (b.o.userData.wingR) b.o.userData.wingR.rotation.z = -f;
      if (b.life > 22) { scene.remove(b.o); this.flock.splice(i, 1); }
    }
  },
  clear() { this.flock.forEach(b => scene.remove(b.o)); this.flock.length = 0; },
};

const Fish = {
  list: [], ponds: [], timer: 4,
  init(isle) {
    this.list.forEach(f => scene.remove(f.o)); this.list = [];
    this.ponds = isle.ponds.filter(p => !p.spring);
    this.pal = isle.pal;
  },
  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0 && this.ponds.length) {
      this.timer = rr(3, 9);
      const p = pick(this.ponds);
      const a = rr(0, TAU), r = rr(0, p.r * 0.5), len = rr(1.2, 2.2);
      const x0 = p.x + Math.cos(a) * r, z0 = p.z + Math.sin(a) * r, dir = rr(0, TAU);
      const o = Models.fish(pick(this.pal.flower.slice(0, 4)));
      scene.add(o);
      this.list.push({ o, t: 0, x0, z0, x1: x0 + Math.cos(dir) * len, z1: z0 + Math.sin(dir) * len, dir });
      Sparkles.emit(x0, -0.15, z0, { n: 8, color: [0xffffff, this.pal.water], speed: 2.2, life: 0.6, size: 0.3, up: 3, gravity: -10 });
      if (dist2(x0, z0, Player.pos.x, Player.pos.z) < 400) AudioEngine.play('splash', { vol: 0.5, pan: panOf(x0) });
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const t = clamp(f.t / 0.85, 0, 1);
      const x = lerp(f.x0, f.x1, t), z = lerp(f.z0, f.z1, t), y = -0.3 + Math.sin(t * Math.PI) * 1.5;
      f.o.position.set(x, y, z);
      f.o.rotation.set(0, Math.atan2(f.x1 - f.x0, f.z1 - f.z0), 0);
      f.o.rotateX(lerp(-1.1, 1.1, t));
      if (t >= 1) {
        Sparkles.emit(x, -0.15, z, { n: 10, color: [0xffffff, this.pal.water], speed: 2.5, life: 0.6, size: 0.3, up: 3, gravity: -10 });
        Rings.emit(x, -0.28, z, { color: 0xffffff, r0: 0.2, r1: 1.4, life: 0.8, bright: 0.8 });
        scene.remove(f.o); this.list.splice(i, 1);
      }
    }
  },
};
