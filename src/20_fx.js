
// ============================================================================
// FX: sparkles, confetti, rings, coins, butterflies, fireflies, weather, stars
// ============================================================================
const pointScale = () => (innerHeight * PR()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));

const Sparkles = (() => {
  const N = 2600;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N), grav = new Float32Array(N), drag = new Float32Array(N), s0 = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  const aAlpha = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('pcolor', aCol); geo.setAttribute('psize', aSize); geo.setAttribute('palpha', aAlpha);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(psize * uScale / -mv.z, 96.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); if (vA < 0.003) discard;
      float a = smoothstep(0.5, 0.0, r); a *= a; float core = smoothstep(0.16, 0.0, r); gl_FragColor = vec4(vC * (1.0 + core * 1.5), a * vA); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  scene.add(pts);
  let head = 0, activeCount = 0;
  const tc = new THREE.Color();
  function emit(x, y, z, o = {}) {
    const n = o.n || 10;
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % N;
      const sp = (o.speed ?? 3) * (0.35 + Math.random() * 0.65);
      const th = Math.random() * TAU, ph = Math.acos(rr(-1, 1));
      const sx = Math.sin(ph) * Math.cos(th), sy = Math.cos(ph), sz = Math.sin(ph) * Math.sin(th);
      const spread = o.spread ?? 0.2;
      pos[i * 3] = x + sx * spread; pos[i * 3 + 1] = y + sy * spread; pos[i * 3 + 2] = z + sz * spread;
      vel[i * 3] = sx * sp + (o.vx || 0); vel[i * 3 + 1] = Math.abs(sy) * sp * (o.upBias ?? 0.6) + sy * sp * (1 - (o.upBias ?? 0.6)) + (o.up ?? 1.5); vel[i * 3 + 2] = sz * sp + (o.vz || 0);
      const c = Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color;
      tc.set(c ?? 0xffffff);
      const b = o.bright ?? 1.4;
      col[i * 3] = tc.r * b; col[i * 3 + 1] = tc.g * b; col[i * 3 + 2] = tc.b * b;
      s0[i] = (o.size ?? 0.35) * rr(0.6, 1.3);
      max[i] = life[i] = (o.life ?? 1.0) * rr(0.6, 1.2);
      grav[i] = o.gravity ?? -3; drag[i] = o.drag ?? 1.5;
    }
    activeCount = N;
  }
  function update(dt) {
    if (!activeCount) return;
    let any = 0;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { if (alpha[i] !== 0) alpha[i] = 0; continue; }
      any++;
      life[i] -= dt;
      const t = life[i] / max[i];
      const dk = Math.exp(-drag[i] * dt);
      vel[i * 3] *= dk; vel[i * 3 + 1] = vel[i * 3 + 1] * dk + grav[i] * dt; vel[i * 3 + 2] *= dk;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      alpha[i] = t > 0 ? Math.min(1, t * 2.5) * (t < 1 ? 1 : 0) : 0;
      size[i] = s0[i] * (0.4 + 0.6 * Math.min(1, t * 1.6));
    }
    aPos.needsUpdate = aCol.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true;
    if (!any) activeCount = 0;
    mat.uniforms.uScale.value = pointScale();
  }
  function clear() { life.fill(0); alpha.fill(0); aAlpha.needsUpdate = true; }
  return { emit, update, clear };
})();

const Confetti = (() => {
  const N = 1000;
  const g = new THREE.BufferGeometry();
  // a little petal: diamond with a fold
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, 0.32, 0.06, 0, 0, 0, 0.5, 0, 0, -0.5, 0, 0, 0.5, -0.32, 0.06, 0], 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: 0x222222 });
  const im = new THREE.InstancedMesh(g, mat, N);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  const P = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, s: 0.2, g: -6, flut: 0 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, new THREE.Color(1, 1, 1)); }
  scene.add(im);
  let head = 0, live = 0;
  const tc = new THREE.Color();
  function emit(x, y, z, o = {}) {
    const n = o.n || 12;
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % N;
      const p = P[i];
      const sp = (o.speed ?? 5) * rr(0.4, 1);
      const th = Math.random() * TAU;
      p.x = x + rr(-0.2, 0.2); p.y = y; p.z = z + rr(-0.2, 0.2);
      p.vx = Math.cos(th) * sp; p.vz = Math.sin(th) * sp; p.vy = (o.up ?? 5) * rr(0.6, 1.3);
      p.rx = rr(0, TAU); p.ry = rr(0, TAU); p.rz = rr(0, TAU);
      p.sx = rr(-8, 8); p.sy = rr(-8, 8); p.sz = rr(-8, 8);
      p.s = (o.size ?? 0.22) * rr(0.7, 1.3); p.g = o.gravity ?? -7; p.flut = o.flutter ?? 1;
      p.max = p.life = (o.life ?? 1.6) * rr(0.7, 1.2);
      const c = Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color;
      tc.set(c ?? 0xffffff); im.setColorAt(i, tc);
    }
    im.instanceColor.needsUpdate = true;
    live = N;
  }
  function update(dt, groundFn) {
    if (!live) return;
    let any = 0;
    for (let i = 0; i < N; i++) {
      const p = P[i];
      if (p.life <= 0) continue;
      p.life -= dt; any++;
      if (p.life <= 0) { im.setMatrixAt(i, zero); continue; }
      const dk = Math.exp(-1.8 * dt);
      p.vx *= dk; p.vz *= dk; p.vy = p.vy * Math.exp(-(p.vy < 0 ? 2.6 * p.flut : 0.6) * dt) + p.g * dt;
      p.x += p.vx * dt + Math.sin(p.life * 5 + i) * 0.6 * dt * p.flut; p.y += p.vy * dt; p.z += p.vz * dt;
      const gy = groundFn ? groundFn(p.x, p.z) + 0.05 : -999;
      if (p.y < gy) { p.y = gy; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; p.sx *= 0.9; p.sy *= 0.9; p.sz *= 0.9; }
      p.rx += p.sx * dt; p.ry += p.sy * dt; p.rz += p.sz * dt;
      const t = p.life / p.max;
      const s = p.s * Math.min(1, t * 3);
      e.set(p.rx, p.ry, p.rz); q.setFromEuler(e); v.set(p.x, p.y, p.z); sc.set(s, s, s);
      m4.compose(v, q, sc); im.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true;
    if (!any) live = 0;
  }
  function clear() { P.forEach((p, i) => { p.life = 0; im.setMatrixAt(i, zero); }); im.instanceMatrix.needsUpdate = true; }
  return { emit, update, clear };
})();

const Rings = (() => {
  const pool = [];
  const geo = new THREE.RingGeometry(0.86, 1, 64);
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.visible = false; m.renderOrder = 4;
    scene.add(m);
    pool.push({ m, t: 0, life: 0, r0: 1, r1: 5 });
  }
  let head = 0;
  function emit(x, y, z, o = {}) {
    const p = pool[head]; head = (head + 1) % pool.length;
    p.m.position.set(x, y + 0.08, z);
    p.m.material.color.set(o.color ?? 0xffffff).multiplyScalar(o.bright ?? 1.6);
    p.r0 = o.r0 ?? 0.5; p.r1 = o.r1 ?? 5; p.life = o.life ?? 0.7; p.t = 0;
    p.m.visible = true;
  }
  function update(dt) {
    for (const p of pool) {
      if (!p.m.visible) continue;
      p.t += dt;
      const t = p.t / p.life;
      if (t >= 1) { p.m.visible = false; continue; }
      const r = lerp(p.r0, p.r1, 1 - Math.pow(1 - t, 3));
      p.m.scale.set(r, 1, r);
      p.m.material.opacity = (1 - t) * (1 - t);
    }
  }
  return { emit, update };
})();

// Soft radial glow texture for light pools
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const glowGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
function makeGlowPool(color, radius) {
  const m = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 }));
  m.scale.setScalar(radius);
  m.renderOrder = 1;
  return m;
}

// ----------------------------------------------------------------------------
// Coins ("sparks")
// ----------------------------------------------------------------------------
const Coins = (() => {
  const N = 320;
  const geo = new THREE.OctahedronGeometry(0.22, 0);
  geo.scale(1, 1.35, 1);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const palette = [0xffd36b, 0xff9ad0, 0x9ff3ff, 0xffe08a, 0xffb36b].map(h => new THREE.Color(h).multiplyScalar(1.9));
  for (let i = 0; i < N; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, palette[i % palette.length]); }
  scene.add(im);
  const C = Array.from({ length: N }, () => ({ on: false }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
  let head = 0;
  function alloc() { for (let k = 0; k < N; k++) { const i = (head + k) % N; if (!C[i].on) { head = (i + 1) % N; return i; } } const i = head; head = (head + 1) % N; return i; }
  // fly along an arc from a point to a (possibly moving) target
  function fly(from, targetFn, dur, onArrive, delay = 0, arc = 2.5) {
    const i = alloc();
    Object.assign(C[i], { on: true, mode: 'fly', t: -delay, dur, sx: from.x, sy: from.y, sz: from.z, target: targetFn, onArrive, arc, spin: rr(0, TAU) });
    return i;
  }
  function drop(x, y, z, onCollect) {
    const i = alloc();
    const th = rr(0, TAU), sp = rr(1.5, 3.5);
    Object.assign(C[i], { on: true, mode: 'drop', t: 0, x, y, z, vx: Math.cos(th) * sp, vy: rr(5, 8), vz: Math.sin(th) * sp, onArrive: onCollect, spin: rr(0, TAU), bounces: 0 });
  }
  function update(dt, groundFn, playerPos) {
    for (let i = 0; i < N; i++) {
      const c = C[i];
      if (!c.on) continue;
      c.t += dt; c.spin += dt * 6;
      let s = 1;
      if (c.mode === 'fly') {
        if (c.t < 0) { im.setMatrixAt(i, zero); continue; }
        const T = clamp(c.t / c.dur, 0, 1);
        const tg = c.target();
        const e = T * T * (3 - 2 * T);
        c.x = lerp(c.sx, tg.x, e); c.z = lerp(c.sz, tg.z, e);
        c.y = lerp(c.sy, tg.y, e) + Math.sin(T * Math.PI) * c.arc;
        s = 0.6 + Math.sin(T * Math.PI) * 0.6;
        if (T >= 1) { c.on = false; im.setMatrixAt(i, zero); c.onArrive && c.onArrive(); continue; }
      } else if (c.mode === 'drop') {
        c.vy -= 22 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        const gy = groundFn(c.x, c.z) + 0.25;
        if (c.y < gy) { c.y = gy; c.vy = Math.abs(c.vy) * 0.45; c.vx *= 0.6; c.vz *= 0.6; c.bounces++; }
        if (c.t > 0.75) {
          // magnet to player
          const from = { x: c.x, y: c.y, z: c.z };
          Object.assign(c, { mode: 'fly', t: 0, dur: 0.45 + Math.hypot(c.x - playerPos.x, c.z - playerPos.z) * 0.02, sx: from.x, sy: from.y, sz: from.z, target: () => ({ x: playerPos.x, y: playerPos.y + 1.2, z: playerPos.z }), arc: 1.2 });
        }
      }
      q.setFromAxisAngle(ax, c.spin); v.set(c.x, c.y, c.z); sc.setScalar(s);
      m4.compose(v, q, sc); im.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true;
  }
  function clear() { C.forEach((c, i) => { c.on = false; im.setMatrixAt(i, zero); }); im.instanceMatrix.needsUpdate = true; }
  return { fly, drop, update, clear };
})();

// ----------------------------------------------------------------------------
// Paint bolts (projectiles)
// ----------------------------------------------------------------------------
const Bolts = (() => {
  const N = 200;
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, new THREE.Color(1, 1, 1)); }
  scene.add(im);
  const B = Array.from({ length: N }, () => ({ on: false }));
  let head = 0;
  const m4 = new THREE.Matrix4(), tc = new THREE.Color();
  function fire(x, y, z, target, o = {}) {
    const i = head; head = (head + 1) % N;
    const b = B[i];
    const col = o.color ?? 0xff6fb1;
    Object.assign(b, { on: true, x, y, z, target, speed: o.speed ?? 20, dmg: o.dmg ?? 1, color: col, life: 2.2, vx: 0, vy: 4, vz: 0, s: o.size ?? 1 });
    const tx = target.x - x, tz = target.z - z, l = Math.hypot(tx, tz) || 1;
    b.vx = tx / l * b.speed * 0.6; b.vz = tz / l * b.speed * 0.6;
    tc.set(col).multiplyScalar(2.4); im.setColorAt(i, tc); im.instanceColor.needsUpdate = true;
  }
  function update(dt) {
    for (let i = 0; i < N; i++) {
      const b = B[i];
      if (!b.on) continue;
      b.life -= dt;
      const t = b.target;
      if (t && t.alive) {
        const ty = t.y + (t.hitH || 0.6);
        const dx = t.x - b.x, dy = ty - b.y, dz = t.z - b.z, l = Math.hypot(dx, dy, dz) || 1;
        const k = 1 - Math.exp(-9 * dt);
        b.vx = lerp(b.vx, dx / l * b.speed, k); b.vy = lerp(b.vy, dy / l * b.speed, k); b.vz = lerp(b.vz, dz / l * b.speed, k);
        if (l < (t.radius || 0.5) + 0.3) {
          t.hurt(b.dmg, b.color);
          Sparkles.emit(b.x, b.y, b.z, { n: 7, color: b.color, speed: 4, life: 0.5, size: 0.35, up: 1 });
          AudioEngine.play('hit', { pan: panOf(b.x), vol: 0.5 });
          b.on = false; im.setMatrixAt(i, zero); continue;
        }
      } else { b.target = null; b.vy -= 12 * dt; if (b.life > 0.4) b.life = 0.4; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.life <= 0) { b.on = false; im.setMatrixAt(i, zero); continue; }
      if (Math.random() < 0.7) Sparkles.emit(b.x, b.y, b.z, { n: 1, color: b.color, speed: 0.3, life: 0.35, size: 0.3, up: 0, gravity: 0 });
      m4.makeScale(b.s, b.s, b.s).setPosition(b.x, b.y, b.z);
      im.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true;
  }
  function clear() { B.forEach((b, i) => { b.on = false; im.setMatrixAt(i, zero); }); im.instanceMatrix.needsUpdate = true; }
  return { fire, update, clear };
})();

// ----------------------------------------------------------------------------
// Butterflies (from healed Gloom + ambient)
// ----------------------------------------------------------------------------
const Butterflies = (() => {
  let pool = [];
  function rebuild(pal) {
    pool.forEach(b => scene.remove(b.o));
    pool = [];
    const cols = pal.flower.concat([pal.accent, pal.leaf[0]]);
    for (let i = 0; i < 90; i++) {
      const o = Models.butterfly(cols[i % cols.length]);
      o.visible = false;
      scene.add(o);
      pool.push({ o, on: false, mode: 'burst', t: 0, ph: rr(0, TAU), x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hx: 0, hz: 0, life: 0, sc: 1 });
    }
  }
  function get() { const b = pool.find(p => !p.on); return b; }
  function burst(x, y, z, n, scale = 1) {
    for (let k = 0; k < n; k++) {
      const b = get(); if (!b) return;
      const th = rr(0, TAU);
      Object.assign(b, { on: true, mode: 'burst', t: 0, x, y: y + 0.5, z, vx: Math.cos(th) * rr(1.5, 3.5), vy: rr(2.5, 4.5), vz: Math.sin(th) * rr(1.5, 3.5), life: rr(4, 6.5), sc: scale * rr(0.8, 1.25) });
      b.o.visible = true;
    }
  }
  function ambient(x, z, groundFn) {
    const b = get(); if (!b) return null;
    Object.assign(b, { on: true, mode: 'ambient', t: 0, x, y: groundFn(x, z) + 1, z, hx: x, hz: z, vx: 0, vy: 0, vz: 0, life: rr(25, 50), sc: rr(0.9, 1.3) });
    b.o.visible = true;
    return b;
  }
  function update(dt, time, groundFn, night) {
    let ambientCount = 0;
    for (const b of pool) {
      if (!b.on) continue;
      b.t += dt; b.life -= dt;
      const o = b.o;
      if (b.mode === 'burst') {
        b.vx += Math.sin(time * 3 + b.ph) * 4 * dt; b.vz += Math.cos(time * 2.6 + b.ph) * 4 * dt;
        b.vy += (1.4 - b.vy) * dt * 0.6;
        b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(time * 9 + b.ph) * 0.02; b.z += b.vz * dt;
      } else {
        ambientCount++;
        const tx = b.hx + Math.sin(time * 0.4 + b.ph) * 3, tz = b.hz + Math.cos(time * 0.33 + b.ph * 2) * 3;
        b.vx = damp(b.vx, (tx - b.x) * 0.8 + Math.sin(time * 2.1 + b.ph) * 1.4, 2, dt);
        b.vz = damp(b.vz, (tz - b.z) * 0.8 + Math.cos(time * 1.7 + b.ph) * 1.4, 2, dt);
        b.x += b.vx * dt; b.z += b.vz * dt;
        b.y = damp(b.y, groundFn(b.x, b.z) + 0.9 + Math.sin(time * 1.3 + b.ph) * 0.5, 3, dt);
        if (night > 0.6) b.life = Math.min(b.life, 1);
      }
      const fade = Math.min(1, b.life * 1.5) * Math.min(1, b.t * 4);
      if (b.life <= 0) { b.on = false; o.visible = false; continue; }
      o.position.set(b.x, b.y, b.z);
      o.rotation.y = Math.atan2(b.vx, b.vz);
      o.scale.setScalar(b.sc * fade);
      const flap = Math.sin(time * 22 + b.ph) * 0.9 + 0.2;
      if (o.userData.wingL) o.userData.wingL.rotation.z = flap;
      if (o.userData.wingR) o.userData.wingR.rotation.z = -flap;
    }
    return ambientCount;
  }
  function clear() { pool.forEach(b => { b.on = false; b.o.visible = false; }); }
  return { rebuild, burst, ambient, update, clear };
})();

// ----------------------------------------------------------------------------
// Bloom trail: tiny flowers sprouting where the mount steps
// ----------------------------------------------------------------------------
const Trail = (() => {
  const N = 140;
  let stem, pet;
  const T = Array.from({ length: N }, () => ({ t: -1, x: 0, y: 0, z: 0, rot: 0, s: 1 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let head = 0;
  function init() {
    const { stem: sg, petals: pg } = Models.flowerGeos();
    stem = new THREE.InstancedMesh(sg, MAT.solid, N);
    pet = new THREE.InstancedMesh(pg, MAT.solid, N);
    [stem, pet].forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; for (let i = 0; i < N; i++) { m.setMatrixAt(i, zero); m.setColorAt(i, new THREE.Color(1, 1, 1)); } scene.add(m); });
  }
  const tc = new THREE.Color();
  function spawn(x, y, z, color) {
    const i = head; head = (head + 1) % N;
    Object.assign(T[i], { t: 0, x, y, z, rot: rr(0, TAU), s: rr(0.8, 1.25) });
    tc.set(color); pet.setColorAt(i, tc); pet.instanceColor.needsUpdate = true;
  }
  function update(dt) {
    for (let i = 0; i < N; i++) {
      const f = T[i];
      if (f.t < 0) continue;
      f.t += dt;
      let s;
      if (f.t < 0.35) s = easeOutBack(f.t / 0.35);
      else if (f.t < 3.2) s = 1;
      else if (f.t < 3.9) s = 1 - smooth((f.t - 3.2) / 0.7);
      else { f.t = -1; stem.setMatrixAt(i, zero); pet.setMatrixAt(i, zero); continue; }
      q.setFromAxisAngle(ax, f.rot); v.set(f.x, f.y, f.z); sc.setScalar(Math.max(0.001, s * f.s));
      m4.compose(v, q, sc); stem.setMatrixAt(i, m4); pet.setMatrixAt(i, m4);
    }
    stem.instanceMatrix.needsUpdate = pet.instanceMatrix.needsUpdate = true;
  }
  function clear() { T.forEach((f, i) => { f.t = -1; stem.setMatrixAt(i, zero); pet.setMatrixAt(i, zero); }); stem.instanceMatrix.needsUpdate = pet.instanceMatrix.needsUpdate = true; }
  return { init, spawn, update, clear };
})();

// ----------------------------------------------------------------------------
// Motes by day, fireflies by night
// ----------------------------------------------------------------------------
const Fireflies = (() => {
  const N = 260;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  const home = new Float32Array(N * 3), ph = new Float32Array(N), gone = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aCol = new THREE.BufferAttribute(col, 3), aSize = new THREE.BufferAttribute(size, 1), aAlpha = new THREE.BufferAttribute(alpha, 1);
  geo.setAttribute('position', aPos); geo.setAttribute('pcolor', aCol); geo.setAttribute('psize', aSize); geo.setAttribute('palpha', aAlpha);
  const pts = new THREE.Points(geo, Sparkles && new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vC = pcolor; vA = palpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(psize * uScale / -mv.z, 64.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); if (vA < 0.003) discard; float a = smoothstep(0.5, 0.0, r); a *= a; float core = smoothstep(0.15, 0.0, r); gl_FragColor = vec4(vC * (1.0 + core * 2.0), a * vA); }`,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  scene.add(pts);
  const cNight = [new THREE.Color(0xd6ff7a), new THREE.Color(0xfff27a), new THREE.Color(0x9affd8), new THREE.Color(0xff9ae8)];
  const cDay = new THREE.Color(0xfff4d8);
  function scatter(isle) {
    const rng = Math.random;
    for (let i = 0; i < N; i++) {
      let x = 0, z = 0;
      for (let t = 0; t < 20; t++) { const a = rng() * TAU, r = Math.sqrt(rng()) * isle.R; x = Math.cos(a) * r; z = Math.sin(a) * r; if (isle.inside(x, z, 1)) break; }
      home[i * 3] = x; home[i * 3 + 1] = isle.heightAt(x, z) + rr(0.4, 2.6); home[i * 3 + 2] = z;
      ph[i] = rr(0, TAU); gone[i] = 0;
    }
  }
  function update(dt, time, night, collectPos, onCollect) {
    const nf = smoothstep(0.35, 0.9, night);
    for (let i = 0; i < N; i++) {
      const p = ph[i];
      const hx = home[i * 3], hy = home[i * 3 + 1], hz = home[i * 3 + 2];
      pos[i * 3] = hx + Math.sin(time * 0.35 + p) * 1.6 + Math.sin(time * 1.3 + p * 3) * 0.3;
      pos[i * 3 + 1] = hy + Math.sin(time * 0.6 + p * 2) * 0.5;
      pos[i * 3 + 2] = hz + Math.cos(time * 0.3 + p * 1.7) * 1.6;
      if (gone[i] > 0) { gone[i] -= dt; alpha[i] = 0; continue; }
      const blink = 0.5 + 0.5 * Math.sin(time * (1.4 + (i % 5) * 0.3) + p * 5);
      const c = nf > 0.5 ? cNight[i % cNight.length] : cDay;
      const b = lerp(0.7, 2.0, nf);
      col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
      alpha[i] = lerp(0.28 * (i % 3 === 0 ? 1 : 0), 0.35 + blink * 0.65, nf);
      size[i] = lerp(0.12, 0.34, nf);
      if (collectPos && nf > 0.5) {
        const dx = pos[i * 3] - collectPos.x, dz = pos[i * 3 + 2] - collectPos.z;
        if (dx * dx + dz * dz < 1.6 && pos[i * 3 + 1] < collectPos.y + 3) { gone[i] = rr(12, 25); onCollect(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], c); }
      }
    }
    aPos.needsUpdate = aCol.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = true;
    pts.material.uniforms.uScale.value = pointScale();
  }
  return { scatter, update };
})();

// ----------------------------------------------------------------------------
// Weather: petals, rain, leaves, snow, glitter
// ----------------------------------------------------------------------------
const Weather = (() => {
  const N = 900;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N), ph = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3), aCol = new THREE.BufferAttribute(col, 3), aSize = new THREE.BufferAttribute(size, 1), aAlpha = new THREE.BufferAttribute(alpha, 1);
  geo.setAttribute('position', aPos); geo.setAttribute('pcolor', aCol); geo.setAttribute('psize', aSize); geo.setAttribute('palpha', aAlpha);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 }, uShape: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 pcolor; attribute float psize; attribute float palpha; uniform float uScale; varying vec3 vC; varying float vA; varying float vR;
      void main(){ vC = pcolor; vA = palpha; vR = position.x * 1.7 + position.z; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(psize * uScale / -mv.z, 48.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uShape; varying vec3 vC; varying float vA; varying float vR;
      void main(){ vec2 p = gl_PointCoord - 0.5; float a;
        if (uShape < 0.5) { a = smoothstep(0.5, 0.2, length(p)); }
        else if (uShape < 1.5) { a = smoothstep(0.12, 0.0, abs(p.x)) * smoothstep(0.5, 0.2, abs(p.y)); }
        else { float c = cos(vR), s = sin(vR); vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y); a = smoothstep(0.5, 0.35, length(q * vec2(1.0, 2.2))); }
        if (a * vA < 0.01) discard; gl_FragColor = vec4(vC, a * vA); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 6;
  scene.add(pts);
  const cfg = {
    petals: { colors: [0xffb3d9, 0xff8fc4, 0xffe0f0], fall: 1.1, sway: 1.2, size: 0.3, shape: 2, n: 420, add: false },
    rain: { colors: [0xd8f4ff, 0xbfe8ff], fall: 16, sway: 0.1, size: 0.34, shape: 1, n: 900, add: false },
    leaves: { colors: [0xff7a3d, 0xffb13d, 0xff5a5a, 0xd9435f], fall: 1.3, sway: 1.6, size: 0.36, shape: 2, n: 360, add: false },
    snow: { colors: [0xffffff, 0xeaf0ff], fall: 1.0, sway: 0.7, size: 0.22, shape: 0, n: 900, add: false },
    glitter: { colors: [0xff7ad8, 0x7ae8ff, 0xfff07a, 0xa87aff, 0x7affb0], fall: 0.6, sway: 0.8, size: 0.16, shape: 0, n: 700, add: true },
  };
  let kind = 'petals', amt = 0, target = 0, timer = 30, def = cfg.petals, raining = false;
  const BOX = 60, H = 34;
  const tc = new THREE.Color();
  function setKind(k) {
    kind = k; def = cfg[k];
    mat.uniforms.uShape.value = def.shape;
    mat.blending = def.add ? THREE.AdditiveBlending : THREE.NormalBlending; mat.needsUpdate = true;
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rr(-BOX, BOX); pos[i * 3 + 1] = rr(0, H); pos[i * 3 + 2] = rr(-BOX, BOX); ph[i] = rr(0, TAU);
      tc.set(def.colors[i % def.colors.length]); const b = def.add ? 1.8 : 1;
      col[i * 3] = tc.r * b; col[i * 3 + 1] = tc.g * b; col[i * 3 + 2] = tc.b * b;
      size[i] = def.size * rr(0.7, 1.3);
    }
    aCol.needsUpdate = aSize.needsUpdate = true;
    amt = 0; target = 0; timer = rr(10, 40);
  }
  function update(dt, time, center, allowed, night) {
    timer -= dt;
    if (timer <= 0) {
      if (target > 0) { target = 0; timer = rr(50, 140); if (kind === 'rain') onRainEnd(); }
      else { target = rr(0.55, 1); timer = rr(40, 100); }
    }
    const tgt = allowed ? target : 0;
    amt = damp(amt, tgt, 0.35, dt);
    raining = kind === 'rain' && amt > 0.3;
    const count = Math.floor(def.n * amt);
    const ox = center.x, oz = center.z;
    for (let i = 0; i < N; i++) {
      if (i >= count) { alpha[i] = 0; continue; }
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      y -= def.fall * dt * (0.8 + (i % 7) * 0.05);
      x += Math.sin(time * 0.9 + ph[i]) * def.sway * dt + (kind === 'rain' ? -2 * dt : 0.4 * dt);
      z += Math.cos(time * 0.7 + ph[i]) * def.sway * 0.6 * dt;
      if (y < -8) { y = H + rr(0, 4); x = ox + rr(-BOX, BOX); z = oz + rr(-BOX, BOX); }
      if (x - ox > BOX) x -= BOX * 2; if (x - ox < -BOX) x += BOX * 2;
      if (z - oz > BOX) z -= BOX * 2; if (z - oz < -BOX) z += BOX * 2;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      alpha[i] = (kind === 'rain' ? 0.45 : 0.9) * (def.add ? (0.5 + 0.5 * Math.sin(time * 4 + ph[i] * 7)) : 1) * lerp(1, 0.7, night);
    }
    aPos.needsUpdate = aAlpha.needsUpdate = true;
    mat.uniforms.uScale.value = pointScale();
  }
  let onRainEnd = () => {};
  return { setKind, update, get raining() { return raining; }, set onRainEnd(f) { onRainEnd = f; }, force(v) { target = v; timer = rr(40, 80); } };
})();

// ----------------------------------------------------------------------------
// Shooting stars (screen-space driven, catchable)
// ----------------------------------------------------------------------------
const Stars = (() => {
  const list = [];
  const headGeo = new THREE.IcosahedronGeometry(0.8, 1);
  const _v = new THREE.Vector3(), _d = new THREE.Vector3();
  function spawn() {
    const m = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(2.2), toneMapped: false, transparent: true, depthTest: false }));
    m.renderOrder = 20;
    scene.add(m);
    const fromLeft = Math.random() < 0.5;
    const s = { m, t: 0, dur: rr(2.6, 4), x0: fromLeft ? rr(-0.1, 0.3) : rr(0.7, 1.1), y0: rr(0.05, 0.3), caught: false };
    s.x1 = s.x0 + (fromLeft ? rr(0.45, 0.8) : -rr(0.45, 0.8)); s.y1 = s.y0 + rr(0.2, 0.45);
    s.col = pick([0xfff2c0, 0xffc2ec, 0xc2f0ff]);
    list.push(s);
  }
  function screenToWorld(sx, sy, d, out) {
    _v.set(sx * 2 - 1, -(sy * 2 - 1), 0.5).unproject(camera);
    _d.copy(_v).sub(camera.position).normalize();
    return out.copy(camera.position).addScaledVector(_d, d);
  }
  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      s.t += dt;
      const t = s.t / s.dur;
      if (t >= 1 || s.caught) { scene.remove(s.m); s.m.material.dispose(); list.splice(i, 1); continue; }
      s.sx = lerp(s.x0, s.x1, t); s.sy = lerp(s.y0, s.y1, t);
      screenToWorld(s.sx, s.sy, 160, s.m.position);
      const fade = Math.sin(t * Math.PI);
      s.m.material.opacity = fade;
      s.m.scale.setScalar(0.6 + fade * 0.6);
      screenToWorld(lerp(s.x0, s.x1, t - 0.02), lerp(s.y0, s.y1, t - 0.02), 160, _v);
      Sparkles.emit(_v.x, _v.y, _v.z, { n: 2, color: s.col, speed: 0.5, life: 0.9, size: 1.5, up: 0, gravity: -0.5, bright: 1.4 });
    }
  }
  // returns true if a click at client coords caught a star
  function tryCatch(cx, cy, onCatch) {
    for (const s of list) {
      const px = s.sx * innerWidth, py = s.sy * innerHeight;
      if (Math.hypot(px - cx, py - cy) < 70) { s.caught = true; onCatch(s); return true; }
    }
    return false;
  }
  function clear() { list.forEach(s => scene.remove(s.m)); list.length = 0; }
  return { spawn, update, tryCatch, clear, get count() { return list.length; } };
})();

function panOf(x) {
  _tmpV.set(x, 0, 0);
  return clamp((x - camera.position.x) / 30, -0.8, 0.8);
}
