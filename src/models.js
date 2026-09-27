// ============================================================================
// models.js — procedural low-poly model library (Thronefall-inspired)
// Everything is built from primitives, colors baked into vertex colors,
// merged per material so each model costs 1–3 draw calls.
// ============================================================================

const MAT = (() => {
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const grey = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  grey.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n  float gg=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114)); diffuseColor.rgb=mix(vec3(gg),diffuseColor.rgb,0.12)*vec3(0.80,0.78,0.90);'
    );
  };
  grey.customProgramCacheKey = () => 'bloomhold-grey';
  const greyGlow = new THREE.MeshBasicMaterial({ color: 0x6d6880 });
  const cloud = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const eye = new THREE.MeshBasicMaterial({ color: 0xf6f0ff, toneMapped: false });
  return { solid, glow, grey, greyGlow, cloud, eye };
})();

const Models = (() => {
  const PI = Math.PI, TAU = PI * 2;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

  // ---------- small helpers ----------
  const R = (rng, a, b) => a + rng() * (b - a);
  const pk = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];
  const col = (hex) => new THREE.Color(hex);
  const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
  const mixc = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

  // Normalize a geometry: non-indexed, no uvs, transformed, flat normals, baked color.
  // o = { p:[x,y,z], r:[rx,ry,rz], order, s:number|[sx,sy,sz], j:jitter, rng, grad:[bottomMul, topMul] }
  function prep(geo, color, o = {}) {
    let g = geo;
    if (g.index) { const ng = g.toNonIndexed(); g.dispose(); g = ng; }
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    }
    g.clearGroups();
    const pos = g.attributes.position;
    if (o.j) {
      const rng = o.rng || Math.random, amt = o.j, map = new Map();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const key = Math.round(x * 500) + ',' + Math.round(y * 500) + ',' + Math.round(z * 500);
        let off = map.get(key);
        if (!off) { off = [(rng() - 0.5) * 2 * amt, (rng() - 0.5) * 2 * amt, (rng() - 0.5) * 2 * amt]; map.set(key, off); }
        pos.setXYZ(i, x + off[0], y + off[1], z + off[2]);
      }
    }
    const s = o.s === undefined ? 1 : o.s;
    if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.set(s, s, s);
    const r = o.r || [0, 0, 0];
    _e.set(r[0], r[1], r[2], o.order || 'XYZ');
    _q.setFromEuler(_e);
    const p = o.p || [0, 0, 0];
    _p.set(p[0], p[1], p[2]);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    g.computeVertexNormals();
    if (color !== null) {
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      if (color instanceof THREE.Color) _c.copy(color); else _c.set(color);
      let minY = Infinity, maxY = -Infinity;
      if (o.grad) {
        for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      for (let i = 0; i < n; i++) {
        let k = 1;
        if (o.grad) {
          const t = maxY > minY ? (g.attributes.position.getY(i) - minY) / (maxY - minY) : 1;
          k = o.grad[0] + (o.grad[1] - o.grad[0]) * t;
        }
        arr[i * 3] = _c.r * k; arr[i * 3 + 1] = _c.g * k; arr[i * 3 + 2] = _c.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return g;
  }

  // A Kit collects parts per material and merges them into meshes.
  class Kit {
    constructor() { this.s = []; this.g = []; }
    add(geo, color, o) { this.s.push(prep(geo, color, o)); return this; }
    glow(geo, color, o) { this.g.push(prep(geo, color, o)); return this; }
    geo(list) { const m = mergeGeometries(list); list.forEach((x) => x.dispose()); return m; }
    to(parent, glowList, shadows = true) {
      let solid = null, glow = null;
      if (this.s.length) {
        solid = new THREE.Mesh(this.geo(this.s), MAT.solid);
        solid.castShadow = shadows; solid.receiveShadow = true;
        parent.add(solid);
      }
      if (this.g.length) {
        glow = new THREE.Mesh(this.geo(this.g), MAT.glow);
        parent.add(glow);
        if (glowList) glowList.push(glow);
      }
      this.s = []; this.g = [];
      return { solid, glow };
    }
  }

  // primitive shortcuts (low segment counts = the look)
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
  const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);
  const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  const dod = (r) => new THREE.DodecahedronGeometry(r, 0);
  const oct = (r) => new THREE.OctahedronGeometry(r, 0);
  const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
  const dome = (r, w = 10, h = 4) => new THREE.SphereGeometry(r, w, h, 0, TAU, 0, PI / 2);
  const tor = (r, t, rs = 4, ts = 10) => new THREE.TorusGeometry(r, t, rs, ts);
  const capsule = (r, l, seg = 7) => new THREE.CapsuleGeometry(r, l, 2, seg);

  // triangular prism: base on y=0, apex y=h, width w along X, depth d along Z (centered)
  function prism(w, h, d) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return g;
  }

  // flat candy swirl disc in the XY plane (faces +Z), colors spiral by ring offset
  function swirlGeo(r, t, cols, rings = 5, wedges = 16) {
    const P = [], C = [];
    const cc = cols.map((h) => new THREE.Color(h));
    const put = (x, y, z, c) => { P.push(x, y, z); C.push(c.r, c.g, c.b); };
    const zf = t / 2, zb = -t / 2;
    for (let i = 0; i < rings; i++) {
      const r0 = (r * i) / rings, r1 = (r * (i + 1)) / rings;
      for (let j = 0; j < wedges; j++) {
        const a0 = (TAU * j) / wedges, a1 = (TAU * (j + 1)) / wedges;
        const c = cc[(j + i * 2) % cc.length];
        const x00 = Math.cos(a0) * r0, y00 = Math.sin(a0) * r0;
        const x10 = Math.cos(a0) * r1, y10 = Math.sin(a0) * r1;
        const x11 = Math.cos(a1) * r1, y11 = Math.sin(a1) * r1;
        const x01 = Math.cos(a1) * r0, y01 = Math.sin(a1) * r0;
        // front
        put(x00, y00, zf, c); put(x10, y10, zf, c); put(x11, y11, zf, c);
        if (i > 0) { put(x00, y00, zf, c); put(x11, y11, zf, c); put(x01, y01, zf, c); }
        // back (reversed)
        put(x00, y00, zb, c); put(x11, y11, zb, c); put(x10, y10, zb, c);
        if (i > 0) { put(x00, y00, zb, c); put(x01, y01, zb, c); put(x11, y11, zb, c); }
        if (i === rings - 1) { // rim
          put(x10, y10, zf, c); put(x10, y10, zb, c); put(x11, y11, zb, c);
          put(x10, y10, zf, c); put(x11, y11, zb, c); put(x11, y11, zf, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    return g;
  }

  // rotate a local offset by euler and add to a base point
  function along(base, local, rot, order = 'XYZ') {
    const v = new THREE.Vector3(local[0], local[1], local[2]).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2], order));
    return [base[0] + v.x, base[1] + v.y, base[2] + v.z];
  }

  // ======================================================================
  // TREES
  // ======================================================================
  function tree(kind, pal, rng) {
    rng = rng || Math.random;
    const g = new THREE.Group();
    const trunk = new Kit(), can = new Kit();
    const canopy = new THREE.Group();
    const glowList = [];
    let top = 1.6, radius = 0.38, height = 4, cx = 0, cz = 0;

    switch (kind) {
      case 'blossom': {
        const th = R(rng, 1.3, 2.0); top = th; radius = 0.36;
        trunk.add(cyl(0.15, 0.28, th, 6), pal.trunk, { p: [0, th / 2, 0], j: 0.03, rng });
        const br = rng() < 0.5 ? -1 : 1;
        trunk.add(cyl(0.07, 0.11, 0.9, 5), pal.trunk, { p: [br * 0.28, th - 0.05, 0.05], r: [0, 0, -br * 0.8] });
        const n = 5 + Math.floor(rng() * 3), spread = R(rng, 1.1, 1.5);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rng() * 0.6, d = i === 0 ? 0 : R(rng, 0.5, spread);
          const r = i === 0 ? R(rng, 1.0, 1.25) : R(rng, 0.6, 0.9);
          can.add(ico(r, 1), pal.leaf[i % pal.leaf.length], { p: [Math.cos(a) * d, 0.7 + R(rng, -0.15, 0.45) + (i === 0 ? 0.3 : 0), Math.sin(a) * d], s: [1, 0.8, 1], j: r * 0.12, rng });
        }
        for (let i = 0; i < 3; i++) {
          const a = rng() * TAU;
          can.add(ico(R(rng, 0.3, 0.45), 0), shade(pal.leaf[0], 0.82), { p: [Math.cos(a) * 1.0, 0.2, Math.sin(a) * 1.0], j: 0.05, rng });
        }
        height = th + 2.2;
        break;
      }
      case 'pine': {
        const th = R(rng, 0.6, 1.0); top = th; radius = 0.3;
        trunk.add(cyl(0.14, 0.22, th, 6), pal.trunk, { p: [0, th / 2, 0] });
        const grp = rng() < 0.55 ? pal.leaf : pal.leafAlt;
        const layers = 3 + Math.floor(rng() * 2), R0 = R(rng, 1.1, 1.45), lh = R(rng, 1.2, 1.5);
        let y = 0;
        for (let i = 0; i < layers; i++) {
          const rr = R0 * (1 - i * 0.22), hh = lh * (1 - i * 0.12);
          can.add(cone(rr, hh, 7), i % 2 ? shade(grp[0], 0.9) : grp[i % grp.length], { p: [0, y + hh / 2, 0], r: [0, rng() * TAU, 0], j: 0.05, rng });
          y += hh * 0.5;
        }
        height = th + y + lh * 0.5;
        break;
      }
      case 'palm': {
        const th = R(rng, 2.6, 3.8), bend = R(rng, 0.5, 1.1) * (rng() < 0.5 ? -1 : 1), n = 5;
        radius = 0.28;
        const pt = (t) => [bend * t * t, th * t, 0];
        for (let i = 0; i < n; i++) {
          const a = pt(i / n), b = pt((i + 1) / n);
          const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
          const rb = 0.21 - i * 0.015, rt = rb - 0.03;
          trunk.add(cyl(rt, rb, len * 1.02, 6), i % 2 ? shade(pal.trunk, 0.85) : pal.trunk,
            { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0], r: [0, 0, -Math.atan2(dx, dy)] });
        }
        const tp = pt(1); cx = tp[0]; top = tp[1];
        const fronds = 7;
        for (let i = 0; i < fronds; i++) {
          const a = (i / fronds) * TAU + rng() * 0.3;
          const c = pal.leaf[i % pal.leaf.length];
          const up = 0.35, down = -0.55, L1 = R(rng, 0.9, 1.1), L2 = R(rng, 0.9, 1.2);
          const d1 = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(-up, a, 0, 'YXZ'));
          const d2 = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(-down, a, 0, 'YXZ'));
          can.add(box(0.42, 0.05, L1), c, { p: [d1.x * L1 / 2, 0.1 + d1.y * L1 / 2, d1.z * L1 / 2], r: [-up, a, 0], order: 'YXZ' });
          const s2 = [d1.x * L1, 0.1 + d1.y * L1, d1.z * L1];
          can.add(box(0.34, 0.04, L2), shade(c, 0.9), { p: [s2[0] + d2.x * L2 / 2, s2[1] + d2.y * L2 / 2, s2[2] + d2.z * L2 / 2], r: [-down, a, 0], order: 'YXZ' });
        }
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU;
          can.add(ico(0.13, 0), pal.wood, { p: [Math.cos(a) * 0.17, -0.12, Math.sin(a) * 0.17] });
        }
        height = th + 0.6;
        break;
      }
      case 'autumn': {
        const th = R(rng, 1.3, 1.9); top = th; radius = 0.4;
        trunk.add(cyl(0.18, 0.32, th, 6), pal.trunk, { p: [0, th / 2, 0], j: 0.03, rng });
        trunk.add(cyl(0.06, 0.1, 0.8, 5), pal.trunk, { p: [0.3, th * 0.75, 0], r: [0, 0, -0.9] });
        const r0 = R(rng, 1.2, 1.55);
        can.add(dod(r0), pal.leaf[0], { p: [0, r0 * 0.8, 0], s: [1, 0.9, 1], j: 0.1, rng });
        const extra = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < extra; i++) {
          const a = rng() * TAU;
          can.add(dod(R(rng, 0.6, 0.9)), pal.leaf[1 + (i % 2)], { p: [Math.cos(a) * r0 * 0.7, r0 * R(rng, 0.5, 1.2), Math.sin(a) * r0 * 0.7], j: 0.08, rng });
        }
        for (let i = 0; i < 6; i++) { // falling leaf chips
          const a = rng() * TAU, d = R(rng, 0.5, 1.8);
          trunk.add(box(0.16, 0.025, 0.12), pk(pal.leaf, rng), { p: [Math.cos(a) * d, i < 3 ? 0.03 : R(rng, 0.3, th), Math.sin(a) * d], r: [rng() * 0.8, rng() * TAU, rng() * 0.8] });
        }
        height = th + r0 * 1.75;
        break;
      }
      case 'crystal': {
        const th = R(rng, 1.0, 1.6); top = th; radius = 0.32;
        trunk.add(cyl(0.12, 0.26, th, 5), pal.trunk, { p: [0, th / 2, 0], j: 0.02, rng });
        const n = 5 + Math.floor(rng() * 3);
        let maxY = 0;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rng() * 0.4;
          const tilt = i === 0 ? 0 : R(rng, 0.35, 0.75), len = i === 0 ? R(rng, 1.3, 1.7) : R(rng, 0.8, 1.2);
          const rot = [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt];
          const base = [0, 0.1, 0];
          const ctr = along(base, [0, len * 0.55, 0], rot);
          can.add(oct(0.32), pal.leaf[i % pal.leaf.length], { p: ctr, r: rot, s: [0.6, len * 1.6, 0.6], j: 0.02, rng });
          const tip = along(base, [0, len * 1.08, 0], rot);
          can.glow(oct(0.13), i % 2 ? pal.accent : pal.glow, { p: tip, r: rot, s: [1, 2, 1] });
          maxY = Math.max(maxY, tip[1]);
        }
        height = th + maxY + 0.2;
        break;
      }
      case 'swirl': {
        const th = R(rng, 1.6, 2.4), r = R(rng, 0.9, 1.3); top = th; radius = 0.22;
        trunk.add(cyl(0.07, 0.09, th, 6), pal.wall, { p: [0, th / 2, 0] });
        const cols = [pal.flower[Math.floor(rng() * 6)], 0xffffff, pal.flower[Math.floor(rng() * 6)], pal.accent];
        can.add(swirlGeo(r, 0.3, cols, 5, 16), null, { p: [0, r * 0.92, 0], r: [0, R(rng, -0.5, 0.5), 0] });
        can.add(ico(0.12, 0), pal.wall, { p: [0, 0.02, 0] });
        height = th + r * 1.9;
        break;
      }
      case 'bigshroom': {
        const th = R(rng, 1.6, 2.5); top = th; radius = 0.45;
        trunk.add(cyl(0.3, 0.46, th, 7), 0xfff1dc, { p: [0, th / 2, 0], j: 0.03, rng });
        trunk.add(cyl(0.5, 0.36, 0.14, 8), 0xffe4d0, { p: [0, th * 0.7, 0] });
        const r = R(rng, 1.5, 2.0);
        const capc = pk([pal.flower[0], pal.accent, pal.roof[0], pal.flower[2]], rng);
        can.add(dome(r, 11, 4), capc, { p: [0, 0.05, 0], s: [1, 0.62, 1], j: 0.04, rng });
        can.add(cyl(r * 0.96, r * 0.35, 0.28, 11), 0xfbe3f0, { p: [0, -0.05, 0] });
        const spots = 6 + Math.floor(rng() * 3);
        for (let i = 0; i < spots; i++) {
          const th2 = R(rng, 0.25, 1.15), ph = rng() * TAU;
          const p = [Math.sin(th2) * Math.cos(ph) * r * 0.98, 0.05 + Math.cos(th2) * r * 0.62, Math.sin(th2) * Math.sin(ph) * r * 0.98];
          can.add(ico(R(rng, 0.14, 0.26), 0), 0xffffff, { p, s: [1, 0.45, 1], r: [Math.sin(ph) * th2, 0, -Math.cos(ph) * th2] });
        }
        height = th + r * 0.7;
        break;
      }
      default: { // 'round'
        const th = R(rng, 1.1, 1.7); top = th; radius = 0.34;
        trunk.add(cyl(0.16, 0.26, th, 6), pal.trunk, { p: [0, th / 2, 0], j: 0.02, rng });
        const grp = rng() < 0.7 ? pal.leafAlt : pal.leaf;
        const r = R(rng, 1.0, 1.45);
        can.add(ico(r, 1), grp[0], { p: [0, r * 0.75, 0], s: [1, 0.92, 1], j: r * 0.1, rng });
        can.add(ico(r * 0.6, 1), grp[1 % grp.length], { p: [r * 0.62, r * 0.4, r * 0.2], j: r * 0.06, rng });
        can.add(ico(r * 0.5, 1), shade(grp[0], 1.08), { p: [-r * 0.55, r * 0.55, -r * 0.3], j: r * 0.06, rng });
        height = th + r * 1.6;
      }
    }
    trunk.to(g);
    canopy.position.set(cx, top, cz);
    can.to(canopy, glowList);
    g.add(canopy);
    g.userData = { canopy, height, radius, glow: glowList };
    return g;
  }

  // ======================================================================
  // DECO
  // ======================================================================
  function deco(kind, pal, rng) {
    rng = rng || Math.random;
    const g = new THREE.Group();
    const k = new Kit();
    const glowList = [];
    let radius = 0;
    switch (kind) {
      case 'rock': {
        const s = R(rng, 0.5, 1.4);
        k.add(dod(s * 0.6), pal.rock[0], { p: [0, s * 0.3, 0], s: [1, 0.72, 0.9], r: [0, rng() * TAU, 0], j: s * 0.08, rng });
        if (rng() < 0.6) k.add(dod(s * 0.3), pal.rock[1], { p: [s * 0.55, s * 0.12, s * 0.2], r: [rng(), rng(), 0], j: s * 0.04, rng });
        radius = s > 0.75 ? s * 0.55 : 0;
        break;
      }
      case 'bush': {
        const s = R(rng, 0.45, 0.8);
        k.add(ico(s, 1), pal.leafAlt[0], { p: [0, s * 0.6, 0], s: [1.2, 0.8, 1], j: s * 0.1, rng });
        k.add(ico(s * 0.65, 1), pal.leafAlt[1 % pal.leafAlt.length], { p: [s * 0.7, s * 0.4, 0.1], j: s * 0.07, rng });
        for (let i = 0; i < 5; i++) {
          const a = rng() * TAU, e = R(rng, 0.2, 1.1);
          k.add(ico(0.075, 0), pk(pal.flower, rng), { p: [Math.cos(a) * Math.cos(e) * s * 1.15, s * 0.6 + Math.sin(e) * s * 0.8, Math.sin(a) * Math.cos(e) * s]});
        }
        break;
      }
      case 'mushroom': {
        const n = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const s = i === 0 ? R(rng, 0.35, 0.55) : R(rng, 0.18, 0.32);
          const x = i === 0 ? 0 : R(rng, -0.45, 0.45), z = i === 0 ? 0 : R(rng, -0.45, 0.45);
          k.add(cyl(s * 0.22, s * 0.3, s * 0.9, 6), 0xfff1dc, { p: [x, s * 0.45, z] });
          const cc = pk([0xff5a6e, pal.flower[0], pal.accent, 0xff7a4a], rng);
          k.add(dome(s * 0.62, 8, 3), cc, { p: [x, s * 0.85, z], s: [1, 0.75, 1] });
          for (let j = 0; j < 3; j++) {
            const a = rng() * TAU;
            k.add(ico(s * 0.09, 0), 0xffffff, { p: [x + Math.cos(a) * s * 0.35, s * 0.85 + s * 0.35, z + Math.sin(a) * s * 0.35] });
          }
        }
        break;
      }
      case 'crystal': {
        const n = 3 + Math.floor(rng() * 3);
        k.add(dod(0.35), pal.rock[1], { p: [0, 0.1, 0], s: [1.3, 0.5, 1.3], j: 0.04, rng });
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rng(), tilt = i === 0 ? 0 : R(rng, 0.25, 0.6), len = i === 0 ? R(rng, 0.9, 1.3) : R(rng, 0.45, 0.8);
          const rot = [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt];
          const base = [Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.12];
          k.add(cyl(0.1, 0.13, len * 0.6, 6), pal.rock[0], { p: along(base, [0, len * 0.3, 0], rot), r: rot });
          k.glow(cone(0.105, len * 0.55, 6), i % 2 ? pal.accent : pal.glow, { p: along(base, [0, len * 0.6 + len * 0.27, 0], rot), r: rot });
        }
        radius = 0.35;
        break;
      }
      case 'coral': {
        const c1 = pk(pal.flower, rng), c2 = pk(pal.flower, rng);
        k.add(cyl(0.08, 0.12, 0.6, 5), c1, { p: [0, 0.3, 0] });
        const n = 4 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + rng() * 0.5, tilt = R(rng, 0.4, 0.9), len = R(rng, 0.35, 0.7);
          const rot = [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt];
          const base = [0, R(rng, 0.25, 0.55), 0];
          k.add(cyl(0.05, 0.07, len, 5), i % 2 ? c1 : c2, { p: along(base, [0, len / 2, 0], rot), r: rot });
          k.add(ico(0.085, 0), shade(i % 2 ? c1 : c2, 1.15), { p: along(base, [0, len, 0], rot) });
        }
        break;
      }
      case 'pumpkin': {
        const s = R(rng, 0.35, 0.55), pc = pk([0xff8a3d, 0xffa23d, 0xff6f3d], rng);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          k.add(ico(s * 0.55, 1), i % 2 ? pc : shade(pc, 0.9), { p: [Math.cos(a) * s * 0.35, s * 0.55, Math.sin(a) * s * 0.35], s: [0.8, 1, 0.8] });
        }
        k.add(cyl(0.05, 0.07, s * 0.4, 5), 0x6d8a3d, { p: [0, s * 1.15, 0], r: [0.2, 0, 0.15] });
        k.add(box(s * 0.5, 0.03, s * 0.3), 0x6fc46a, { p: [s * 0.25, s * 1.05, 0], r: [0, 0.4, -0.3] });
        radius = s * 0.8;
        break;
      }
      case 'stump': {
        const r = R(rng, 0.35, 0.55), h = R(rng, 0.35, 0.6);
        k.add(cyl(r, r * 1.15, h, 7), pal.trunk, { p: [0, h / 2, 0], j: 0.02, rng });
        k.add(cyl(r * 0.9, r * 0.9, 0.04, 7), pal.sand, { p: [0, h + 0.01, 0] });
        k.add(cyl(r * 0.45, r * 0.45, 0.05, 7), shade(pal.sand, 0.85), { p: [0, h + 0.02, 0] });
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + rng();
          k.add(cyl(0.05, 0.1, 0.5, 4), pal.trunk, { p: [Math.cos(a) * r * 1.1, 0.08, Math.sin(a) * r * 1.1], r: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] });
        }
        radius = r + 0.05;
        break;
      }
      case 'lollipop': {
        const h = R(rng, 0.6, 1.0), r = R(rng, 0.3, 0.45);
        k.add(cyl(0.035, 0.04, h, 5), 0xffffff, { p: [0, h / 2, 0] });
        k.add(swirlGeo(r, 0.12, [pk(pal.flower, rng), 0xffffff, pk(pal.flower, rng)], 4, 12), null, { p: [0, h + r * 0.85, 0], r: [0, rng() * TAU, 0] });
        break;
      }
      case 'shell': {
        const c = pk([pal.rock[0], pal.flower[0], 0xffd9c9, pal.sand], rng), s = R(rng, 0.8, 1.2);
        for (let i = 0; i < 6; i++) {
          const t = i / 6, a = t * TAU * 1.1, rr = 0.2 * (1 - t) * s;
          k.add(ico(0.2 * (1 - t * 0.75) * s, 1), shade(c, 1 - t * 0.15), { p: [Math.cos(a) * rr, 0.14 * s + t * 0.25 * s, Math.sin(a) * rr], s: [1, 0.85, 1] });
        }
        k.add(cone(0.1 * s, 0.25 * s, 6), 0xffffff, { p: [0, 0.48 * s, 0] });
        break;
      }
      case 'reeds': {
        const n = 5 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) {
          const x = R(rng, -0.35, 0.35), z = R(rng, -0.35, 0.35), h = R(rng, 0.7, 1.3), t = [R(rng, -0.2, 0.2), 0, R(rng, -0.2, 0.2)];
          k.add(cone(0.04, h, 3), pal.leafAlt[i % pal.leafAlt.length], { p: [x, h / 2, z], r: t });
          if (i % 2 === 0) k.add(cyl(0.05, 0.05, 0.2, 5), pal.wood, { p: along([x, 0, z], [0, h * 0.72, 0], t), r: t });
        }
        break;
      }
      case 'snowball': {
        if (rng() < 0.55) { // snowman
          k.add(ico(0.38, 1), 0xf5f8ff, { p: [0, 0.34, 0], j: 0.02, rng });
          k.add(ico(0.27, 1), 0xf5f8ff, { p: [0, 0.82, 0], j: 0.02, rng });
          k.add(ico(0.19, 1), 0xf5f8ff, { p: [0, 1.18, 0] });
          k.add(cone(0.05, 0.25, 5), 0xff8a3d, { p: [0, 1.18, 0.28], r: [PI / 2, 0, 0] });
          k.add(ico(0.03, 0), 0x2a2140, { p: [-0.07, 1.25, 0.16] });
          k.add(ico(0.03, 0), 0x2a2140, { p: [0.07, 1.25, 0.16] });
          k.add(tor(0.2, 0.06, 4, 8), pal.accent, { p: [0, 1.03, 0], r: [PI / 2, 0, 0] });
          k.add(cyl(0.14, 0.16, 0.2, 7), 0x3b2f55, { p: [0, 1.4, 0] });
          radius = 0.38;
        } else {
          k.add(ico(R(rng, 0.4, 0.7), 1), 0xf1f5ff, { p: [0, 0.1, 0], s: [1.3, 0.55, 1.1], j: 0.05, rng });
          k.add(ico(0.25, 1), 0xe6ecff, { p: [0.45, 0.08, 0.2], s: [1, 0.6, 1] });
        }
        break;
      }
      default: {
        k.add(dod(0.4), pal.rock[0], { p: [0, 0.2, 0], j: 0.04, rng });
      }
    }
    k.to(g, glowList);
    g.userData = { radius, glow: glowList };
    return g;
  }

  // ======================================================================
  // INSTANCING GEOMETRIES
  // ======================================================================
  let flowerCache = null;
  function flowerGeos() {
    if (flowerCache) return flowerCache;
    const st = [];
    st.push(prep(cyl(0.014, 0.02, 0.3, 4), 0x4fb864, { p: [0, 0.15, 0] }));
    st.push(prep(oct(0.06), 0x6fd07a, { p: [0.05, 0.1, 0], s: [1.6, 0.3, 0.8], r: [0, 0, 0.5] }));
    st.push(prep(oct(0.05), 0x5fc46e, { p: [-0.045, 0.16, 0.01], s: [1.6, 0.3, 0.8], r: [0, 0.3, -0.5] }));
    const pe = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      pe.push(prep(ico(0.05, 0), 0xffffff, { p: [Math.cos(a) * 0.055, 0.31, Math.sin(a) * 0.055], s: [1.3, 0.35, 0.8], r: [0, -a, 0.25] }));
    }
    pe.push(prep(ico(0.035, 0), 0xfff3b0, { p: [0, 0.325, 0] }));
    const stem = mergeGeometries(st), petals = mergeGeometries(pe);
    st.forEach((x) => x.dispose()); pe.forEach((x) => x.dispose());
    flowerCache = { stem, petals };
    return flowerCache;
  }

  let grassCache = null;
  function grassGeo() {
    if (grassCache) return grassCache;
    const parts = [];
    const blades = [[0, 0, 0.45, 0, 0], [0.07, 0.03, 0.36, 0.25, 0.3], [-0.07, 0.02, 0.38, -0.3, 0.1], [0.02, -0.07, 0.32, 0.1, -0.3], [-0.03, 0.07, 0.3, -0.1, 0.35]];
    for (const [x, z, h, rz, rx] of blades) {
      parts.push(prep(cone(0.045, h, 3), 0xffffff, { p: [x, h / 2, z], r: [rx, (x + z) * 10, rz], grad: [0.6, 1.0] }));
    }
    grassCache = mergeGeometries(parts);
    parts.forEach((x) => x.dispose());
    return grassCache;
  }

  // ======================================================================
  // BUILDINGS
  // ======================================================================
  // two sloped slabs + wall-colored gable triangle; ridge runs along Z so the gable faces +Z
  function gableRoof(k, W, D, RH, y0, roofC, wallC, ox = 0, oz = 0) {
    k.add(prism(W, RH * 0.96, D), wallC, { p: [ox, y0, oz] });
    const ang = Math.atan2(RH, W / 2), len = Math.hypot(W / 2, RH) + 0.4;
    for (const sx of [-1, 1]) {
      const nx = sx * Math.sin(ang), ny = Math.cos(ang);
      const cx = sx * W / 4 + sx * Math.cos(ang) * 0.2 + nx * 0.08;
      const cy = y0 + RH / 2 - Math.sin(ang) * 0.2 + ny * 0.08;
      k.add(box(len, 0.16, D + 0.5), roofC, { p: [ox + cx, cy, oz], r: [0, 0, -sx * ang] });
    }
    k.add(box(0.2, 0.16, D + 0.6), shade(roofC, 0.78), { p: [ox, y0 + RH + 0.06, oz] });
  }

  function cottage(g, ud, L, pal) {
    const k = new Kit();
    const W = [2.3, 2.4, 2.7][L - 1], D = [2.1, 2.2, 2.4][L - 1], WH = [1.5, 2.1, 2.3][L - 1], RH = [1.3, 1.45, 1.65][L - 1];
    const roofC = pal.roof[(L - 1) % 3], roofC2 = pal.roof[L % 3];
    const fz = D / 2;
    k.add(box(W + 0.4, 0.3, D + 0.4), pal.rock[0], { p: [0, 0.15, 0] });
    k.add(box(W, WH, D), pal.wall, { p: [0, 0.3 + WH / 2, 0] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.add(box(0.14, WH, 0.14), pal.wood, { p: [sx * W / 2, 0.3 + WH / 2, sz * D / 2] });
    if (L >= 2) k.add(box(W + 0.08, 0.12, D + 0.08), pal.wood, { p: [0, 0.3 + 1.2, 0] });
    gableRoof(k, W, D, RH, 0.3 + WH, roofC, pal.wall);
    k.glow(cyl(0.2, 0.2, 0.06, 8), pal.glow, { p: [0, 0.3 + WH + RH * 0.38, fz + 0.02], r: [PI / 2, 0, 0] });
    // door
    k.add(box(0.56, 0.95, 0.08), pal.wood, { p: [0, 0.3 + 0.475, fz + 0.03] });
    k.add(ico(0.04, 0), 0xffd26b, { p: [0.17, 0.3 + 0.48, fz + 0.09] });
    // windows
    const win = (x, y, z, side) => {
      if (side) k.glow(box(0.06, 0.42, 0.42), pal.glow, { p: [x, y, z] });
      else k.glow(box(0.42, 0.42, 0.06), pal.glow, { p: [x, y, z] });
    };
    const wx = W * 0.3;
    win(-wx, 0.3 + 0.8, fz + 0.02); win(wx, 0.3 + 0.8, fz + 0.02);
    win(W / 2 + 0.02, 0.3 + 0.8, 0, true); win(-W / 2 - 0.02, 0.3 + 0.8, 0, true);
    if (L >= 2) {
      win(-wx, 0.3 + 1.65, fz + 0.02); win(wx, 0.3 + 1.65, fz + 0.02);
      for (const sx of [-1, 1]) for (const ss of [-1, 1]) k.add(box(0.1, 0.46, 0.05), roofC2, { p: [sx * wx + ss * 0.29, 0.3 + 0.8, fz + 0.04] });
      // side wing
      const ex = W / 2 + 0.55;
      k.add(box(1.1, 1.2, 1.5), pal.wall, { p: [ex, 0.3 + 0.6, -0.15] });
      gableRoof(k, 1.1, 1.5, 0.7, 0.3 + 1.2, roofC2, pal.wall, ex, -0.15);
      k.glow(box(0.36, 0.36, 0.06), pal.glow, { p: [ex, 0.3 + 0.65, -0.15 + 0.77] });
    }
    // chimney
    k.add(box(0.34, 1.0, 0.34), pal.rock[1], { p: [-W * 0.26, 0.3 + WH + RH * 0.55, -D * 0.22] });
    k.add(box(0.44, 0.1, 0.44), shade(pal.rock[1], 0.85), { p: [-W * 0.26, 0.3 + WH + RH * 0.55 + 0.52, -D * 0.22] });
    // little bush by the door
    k.add(ico(0.24, 1), pal.leafAlt[0], { p: [W * 0.42, 0.42, fz + 0.28], j: 0.03 });
    k.add(ico(0.06, 0), pal.flower[0], { p: [W * 0.42 + 0.1, 0.6, fz + 0.4] });
    k.add(ico(0.06, 0), pal.flower[1], { p: [W * 0.42 - 0.12, 0.57, fz + 0.42] });
    if (L === 3) {
      // flower boxes
      for (const sx of [-1, 1]) {
        k.add(box(0.55, 0.14, 0.18), pal.wood, { p: [sx * wx, 0.3 + 0.53, fz + 0.1] });
        for (let i = 0; i < 3; i++) k.add(ico(0.07, 0), pal.flower[(i + (sx > 0 ? 2 : 0)) % 6], { p: [sx * wx + (i - 1) * 0.16, 0.3 + 0.65, fz + 0.12] });
      }
      // tiny tower
      const tx = -W / 2 - 0.25, tz = -D / 2 + 0.35, th = 3.3;
      k.add(cyl(0.42, 0.5, th, 7), pal.wall, { p: [tx, th / 2, tz] });
      k.add(cyl(0.52, 0.48, 0.14, 7), pal.wood, { p: [tx, th, tz] });
      k.add(cone(0.62, 1.2, 7), roofC2, { p: [tx, th + 0.65, tz] });
      k.add(ico(0.08, 0), 0xffd26b, { p: [tx, th + 1.3, tz] });
      k.glow(box(0.22, 0.34, 0.06), pal.glow, { p: [tx, th - 0.7, tz + 0.46] });
    }
    k.to(g, ud.glow);
    ud.height = 0.3 + WH + RH + 0.2;
    ud.radius = [1.5, 1.9, 2.1][L - 1];
  }

  function field(g, ud, L, pal) {
    const k = new Kit();
    const S = L === 1 ? 3.4 : 3.7;
    const soil = mixc(pal.wood, 0x6b4a3a, 0.4);
    k.add(box(S, 0.16, S), soil, { p: [0, 0.08, 0] });
    const ncol = [2, 4, 6][L - 1], rows = 4, per = 5;
    for (let i = 0; i < rows; i++) {
      const z = -S / 2 + (i + 0.5) * S / rows;
      k.add(box(S - 0.5, 0.14, 0.42), shade(soil, 0.82), { p: [0, 0.22, z] });
      for (let j = 0; j < per; j++) {
        const x = -S / 2 + 0.5 + j * (S - 1.0) / (per - 1);
        const c = pal.flower[(i * 2 + j) % ncol];
        const s = 0.12 + L * 0.025;
        k.add(cone(0.07, 0.32, 4), 0x5fbf6a, { p: [x, 0.43, z] });
        k.add(ico(s, 0), c, { p: [x, 0.58, z], r: [0, i + j, 0] });
        if (L >= 2) k.add(box(0.2, 0.03, 0.08), 0x6fd07a, { p: [x + 0.1, 0.4, z], r: [0, 0.5, -0.4] });
      }
    }
    // fence
    const fy = 0.35, post = (x, z) => k.add(box(0.12, 0.62, 0.12), pal.wood, { p: [x, 0.31, z] });
    const h = S / 2;
    for (const [x, z] of [[-h, -h], [h, -h], [-h, h], [h, h], [0, -h], [-h, 0], [h, 0], [-h * 0.3, h], [h * 0.3, h]]) post(x, z);
    for (const y of [fy, fy + 0.2]) {
      k.add(box(S, 0.07, 0.06), pal.wood, { p: [0, y, -h] });
      k.add(box(0.06, 0.07, S), pal.wood, { p: [-h, y, 0] });
      k.add(box(0.06, 0.07, S), pal.wood, { p: [h, y, 0] });
      k.add(box(h * 0.7, 0.07, 0.06), pal.wood, { p: [-h + h * 0.35, y, h] });
      k.add(box(h * 0.7, 0.07, 0.06), pal.wood, { p: [h - h * 0.35, y, h] });
    }
    if (L >= 2) {
      const sc = L === 3 ? 1.35 : 1.0;
      const wx = h - 0.15, wz = -h + 0.15;
      const roofC = pal.roof[L % 3];
      k.add(cyl(0.3 * sc, 0.48 * sc, 2.2 * sc, 6), pal.wall, { p: [wx, 1.1 * sc, wz] });
      k.add(cone(0.55 * sc, 0.8 * sc, 6), roofC, { p: [wx, 2.2 * sc + 0.4 * sc, wz] });
      k.add(box(0.3, 0.5, 0.06), pal.wood, { p: [wx, 0.25, wz + 0.45 * sc] });
      k.glow(box(0.2, 0.22, 0.06), pal.glow, { p: [wx, 1.4 * sc, wz + 0.38 * sc] });
      const sails = new THREE.Group();
      sails.position.set(wx, 2.05 * sc, wz + 0.48 * sc);
      const sk = new Kit();
      sk.add(ico(0.13 * sc, 0), pal.wood, {});
      for (let b = 0; b < 4; b++) {
        const a = b * PI / 2;
        sk.add(box(0.05, 1.15 * sc, 0.04), pal.wood, { p: [-Math.sin(a) * 0.6 * sc, Math.cos(a) * 0.6 * sc, 0], r: [0, 0, a] });
        sk.add(box(0.24 * sc, 0.8 * sc, 0.03), b % 2 ? pal.wall : roofC, { p: [-Math.sin(a) * 0.7 * sc + Math.cos(a) * 0.14 * sc, Math.cos(a) * 0.7 * sc + Math.sin(a) * 0.14 * sc, 0.02], r: [0, 0, a] });
      }
      sk.to(sails, ud.glow);
      g.add(sails);
      ud.spin.push({ obj: sails, axis: 'z', speed: 1.1 });
    }
    if (L === 3) {
      const sx = -h + 0.7, sz = 0.2;
      k.add(cyl(0.04, 0.04, 1.35, 4), pal.wood, { p: [sx, 0.68, sz] });
      k.add(box(0.95, 0.06, 0.06), pal.wood, { p: [sx, 1.02, sz] });
      k.add(box(0.36, 0.42, 0.2), pal.accent, { p: [sx, 0.98, sz] });
      k.add(ico(0.16, 0), pal.sand, { p: [sx, 1.36, sz] });
      k.add(cyl(0.3, 0.3, 0.04, 7), pal.roof[0], { p: [sx, 1.48, sz] });
      k.add(cone(0.17, 0.28, 7), pal.roof[0], { p: [sx, 1.62, sz] });
      for (const [bx, bz] of [[-h - 0.45, h - 0.4], [-h - 0.4, h - 1.05]]) {
        k.add(cyl(0.28, 0.28, 0.55, 8), pal.sand, { p: [bx, 0.28, bz], r: [0, 0.3, PI / 2] });
      }
    }
    k.to(g, ud.glow);
    ud.height = L === 1 ? 0.8 : (L === 2 ? 2.9 : 3.8);
    ud.radius = L === 1 ? 1.9 : 2.1;
  }

  function tower(g, ud, L, pal) {
    const k = new Kit();
    const H = [4.5, 5.5, 6.5][L - 1], bodyH = H - 2.5, topY = 0.4 + bodyH;
    const roofC = pal.roof[(L + 1) % 3], roofC2 = pal.roof[L % 3];
    k.add(cyl(1.05, 1.15, 0.4, 8), pal.rock[1], { p: [0, 0.2, 0] });
    k.add(cyl(0.72, 0.9, bodyH, 8), pal.rock[0], { p: [0, 0.4 + bodyH / 2, 0], j: 0.02 });
    const rAt = (t) => 0.9 - 0.18 * t;
    for (const t of [0.33, 0.7]) k.add(cyl(rAt(t) + 0.05, rAt(t) + 0.05, 0.13, 8), pal.wood, { p: [0, 0.4 + bodyH * t, 0] });
    k.add(box(0.46, 0.8, 0.12), pal.wood, { p: [0, 0.8, rAt(0.1) - 0.02] });
    k.glow(box(0.15, 0.42, 0.08), pal.glow, { p: [0, 0.4 + bodyH * 0.52, rAt(0.52) + 0.01] });
    k.glow(box(0.08, 0.42, 0.15), pal.glow, { p: [rAt(0.52) + 0.01, 0.4 + bodyH * 0.52, 0] });
    k.add(cyl(1.08, 0.8, 0.3, 8), pal.wood, { p: [0, topY + 0.15, 0] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + PI / 8;
      k.add(box(0.32, 0.3, 0.22), pal.rock[1], { p: [Math.sin(a) * 0.96, topY + 0.45, Math.cos(a) * 0.96], r: [0, a, 0] });
    }
    if (L >= 2) {
      k.add(cyl(0.03, 0.03, 1.4, 4), pal.wood, { p: [-0.8, topY + 1.0, -0.55] });
      k.add(cone(0.2, 0.55, 3), pal.accent, { p: [-0.8 + 0.27, topY + 1.5, -0.55], r: [0, 0, -PI / 2] });
      k.add(box(1.9, 0.12, 0.12), roofC2, { p: [0, 0.4 + bodyH * 0.9, 0], r: [0, PI / 4, 0] });
    }
    k.to(g, ud.glow);

    const head = new THREE.Group();
    head.position.set(0, topY + 0.3, 0);
    const hk = new Kit();
    hk.add(cyl(0.62, 0.66, 0.2, 8), roofC, { p: [0, 0.1, 0] });
    const barrels = L === 3 ? [-0.27, 0.27] : [0];
    for (const bx of barrels) {
      hk.add(cyl(0.24, 0.16, 0.9, 7), roofC2, { p: [bx, 0.45, 0.35], r: [PI / 2, 0, 0] });
      hk.add(tor(0.21, 0.05, 4, 8), pal.wood, { p: [bx, 0.45, 0.8] });
    }
    hk.glow(ico(0.3 + 0.06 * L, 1), pal.accent, { p: [0, 0.6, -0.25] });
    for (const sx of [-1, 1]) hk.add(box(0.08, 0.9, 0.08), pal.wood, { p: [sx * 0.55, 0.65, -0.35] });
    hk.add(cone(0.95, 0.75, 8), roofC, { p: [0, 1.45, -0.05], r: [0, PI / 8, 0] });
    hk.add(ico(0.09, 0), 0xffd26b, { p: [0, 1.88, -0.05] });
    hk.to(head, ud.glow);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.45, 0.85);
    head.add(muzzle);
    g.add(head);
    ud.head = head; ud.muzzle = muzzle;
    ud.height = H; ud.radius = 1.0;
  }

  function hangingLantern(ud, g, x, y, z, glowC, capC) {
    const piv = new THREE.Group();
    piv.position.set(x, y, z);
    const k = new Kit();
    k.add(cyl(0.012, 0.012, 0.26, 3), 0x3b2f55, { p: [0, -0.13, 0] });
    k.add(cyl(0.09, 0.12, 0.05, 8), capC, { p: [0, -0.27, 0] });
    k.glow(cyl(0.15, 0.15, 0.3, 8), glowC, { p: [0, -0.44, 0], s: [1, 1, 1] });
    k.add(cyl(0.12, 0.09, 0.05, 8), capC, { p: [0, -0.61, 0] });
    k.to(piv, ud.glow);
    g.add(piv);
    ud.swing.push(piv);
  }

  function lantern(g, ud, L, pal) {
    const k = new Kit();
    const h = [3.2, 3.8, 4.4][L - 1], postH = h - 0.5 - 0.9, topY = 0.5 + postH;
    const capC = pal.roof[(L + 2) % 3];
    k.add(cyl(0.42, 0.52, 0.3, 6), pal.rock[1], { p: [0, 0.15, 0] });
    k.add(cyl(0.3, 0.36, 0.2, 6), pal.rock[0], { p: [0, 0.4, 0] });
    k.add(cyl(0.09, 0.12, postH, 6), pal.wood, { p: [0, 0.5 + postH / 2, 0] });
    k.add(cyl(0.32, 0.28, 0.08, 6), pal.wood, { p: [0, topY + 0.04, 0] });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(box(0.05, 0.62, 0.05), pal.wood, { p: [x * 0.22, topY + 0.35, z * 0.22] });
    k.add(cone(0.44, 0.36, 6), capC, { p: [0, topY + 0.82, 0], r: [0, PI / 6, 0] });
    k.add(ico(0.07, 0), 0xffd26b, { p: [0, topY + 1.05, 0] });
    k.glow(ico(0.25 + 0.03 * L, 1), pal.glow, { p: [0, topY + 0.36, 0] });
    if (L >= 2) {
      k.add(box(1.5, 0.08, 0.08), pal.wood, { p: [0, topY - 0.25, 0] });
      hangingLantern(ud, g, -0.66, topY - 0.29, 0, mixc(pal.glow, pal.flower[0], 0.45), capC);
      hangingLantern(ud, g, 0.66, topY - 0.29, 0, mixc(pal.glow, pal.flower[2], 0.45), capC);
    }
    if (L === 3) {
      k.add(box(0.08, 0.08, 1.5), pal.wood, { p: [0, topY - 0.45, 0] });
      hangingLantern(ud, g, 0, topY - 0.49, -0.66, mixc(pal.glow, pal.flower[4], 0.45), capC);
      hangingLantern(ud, g, 0, topY - 0.49, 0.66, mixc(pal.glow, pal.flower[3], 0.45), capC);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU;
        k.add(ico(0.08, 0), pal.flower[i % 6], { p: [Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62] });
        k.add(cone(0.03, 0.12, 3), 0x5fbf6a, { p: [Math.cos(a) * 0.62, 0.04, Math.sin(a) * 0.62] });
      }
    }
    k.to(g, ud.glow);
    ud.height = h; ud.radius = 0.5;
  }

  function hedge(g, ud, L, pal) {
    const k = new Kit();
    const H = [1.3, 1.6, 2.0][L - 1];
    let y0 = 0;
    if (L >= 2) { k.add(box(4.7, 0.3, 1.2), pal.rock[0], { p: [0, 0.15, 0] }); y0 = 0.3; }
    const hh = H - y0;
    k.add(box(4.2, hh * 0.7, 0.85), shade(pal.leafAlt[1 % pal.leafAlt.length], 0.9), { p: [0, y0 + hh * 0.36, 0] });
    const xs = [-1.7, -0.85, 0, 0.85, 1.7];
    xs.forEach((x, i) => {
      k.add(ico(0.62, 1), pal.leafAlt[i % pal.leafAlt.length], { p: [x, y0 + hh / 2, 0], s: [1, (hh / 2) / 0.62 * 1.04, 0.55 / 0.62], j: 0.05 });
    });
    const nf = [12, 16, 20][L - 1];
    for (let i = 0; i < nf; i++) {
      const x = -2.0 + (4.0 * (i + 0.5)) / nf;
      const onTop = i % 3 === 0;
      const zs = i % 2 ? 1 : -1;
      const y = onTop ? y0 + hh + 0.02 : y0 + hh * (0.35 + ((i * 37) % 10) / 20);
      const z = onTop ? ((i * 13) % 7 - 3) * 0.08 : zs * 0.57;
      k.add(ico(0.09, 0), pal.flower[i % 6], { p: [x, y, z] });
    }
    if (L === 3) {
      for (const sx of [-1, 1]) {
        k.add(box(0.5, H + 0.4, 0.5), pal.rock[1], { p: [sx * 2.4, (H + 0.4) / 2, 0] });
        k.add(box(0.62, 0.1, 0.62), shade(pal.rock[1], 0.85), { p: [sx * 2.4, H + 0.45, 0] });
        k.glow(ico(0.2, 1), pal.glow, { p: [sx * 2.4, H + 0.7, 0] });
      }
      k.add(ico(0.36, 1), pal.leafAlt[0], { p: [0, H + 0.28, 0], j: 0.03 });
      k.add(ico(0.1, 0), pal.accent, { p: [0, H + 0.66, 0] });
    }
    k.to(g, ud.glow);
    ud.height = H + (L === 3 ? 0.9 : 0); ud.radius = 0.8; ud.length = 4.6; ud.depth = 1.1;
  }

  function grove(g, ud, L, pal) {
    const k = new Kit();
    k.add(cyl(2.0, 2.1, 0.1, 12), mixc(pal.leafAlt[1 % pal.leafAlt.length], 0x2f5a44, 0.3), { p: [0, 0.05, 0] });
    k.add(cyl(0.5, 0.68, 0.8, 7), pal.trunk, { p: [0, 0.5, 0], j: 0.02 });
    k.add(cyl(0.46, 0.46, 0.04, 7), pal.sand, { p: [0, 0.92, 0] });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      k.add(cyl(0.06, 0.12, 0.6, 4), pal.trunk, { p: [Math.cos(a) * 0.62, 0.18, Math.sin(a) * 0.62], r: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1] });
    }
    k.add(cyl(0.035, 0.05, 0.5, 4), 0x6d8a3d, { p: [0, 1.15, 0] });
    k.add(box(0.22, 0.03, 0.1), 0x6fd07a, { p: [0.1, 1.3, 0], r: [0, 0, 0.5] });
    k.add(box(0.22, 0.03, 0.1), 0x6fd07a, { p: [-0.1, 1.36, 0], r: [0, 0, -0.5] });
    const n = [5, 8, 10][L - 1], ng = [0, 3, 6][L - 1];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.2, r = 1.45 + (i % 2) * 0.2, s = 0.25 + ((i * 7) % 5) * 0.04;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      k.add(cyl(s * 0.25, s * 0.32, s * 1.1, 5), 0xfff1dc, { p: [x, 0.1 + s * 0.55, z] });
      const glowCap = (i * 3) % n < ng;
      const cc = i % 2 ? pal.flower[0] : pal.flower[2];
      if (glowCap) k.glow(dome(s * 0.7, 7, 3), i % 2 ? pal.accent : 0x9dfcff, { p: [x, 0.1 + s * 1.05, z], s: [1, 0.8, 1] });
      else k.add(dome(s * 0.7, 7, 3), cc, { p: [x, 0.1 + s * 1.05, z], s: [1, 0.8, 1] });
    }
    const stones = L >= 2 ? 5 : 3;
    for (let i = 0; i < stones; i++) {
      const a = (i / stones) * TAU + 0.9;
      k.add(box(0.3, 0.7 + (i % 2) * 0.3, 0.22), pal.rock[i % 2], { p: [Math.cos(a) * 1.85, 0.4, Math.sin(a) * 1.85], r: [0, -a, 0.08], j: 0.03 });
    }
    k.to(g, ud.glow);
    const core = new THREE.Group();
    core.position.set(0, 1.95, 0);
    const ck = new Kit();
    ck.glow(ico(0.3 + L * 0.03, 1), 0xd8ff8a, {});
    ck.glow(ico(0.1, 0), 0x9dfcff, { p: [0.55, 0.1, 0] });
    ck.glow(ico(0.09, 0), pal.accent, { p: [-0.5, -0.1, 0.2] });
    if (L === 3) ck.glow(ico(0.08, 0), 0xfff38a, { p: [0, 0.15, -0.55] });
    ck.to(core, ud.glow, false);
    g.add(core);
    ud.spin.push({ obj: core, axis: 'y', speed: 0.9 });
    ud.height = 2.5; ud.radius = 1.2;
  }

  function chime(g, ud, L, pal) {
    const k = new Kit();
    const pillarH = [2.3, 2.6, 2.9][L - 1];
    const roofC = pal.roof[(L + 1) % 3], roofC2 = pal.roof[(L + 2) % 3];
    k.add(cyl(1.3, 1.4, 0.3, 8), pal.rock[1], { p: [0, 0.15, 0], r: [0, PI / 8, 0] });
    k.add(cyl(1.0, 1.1, 0.15, 8), pal.rock[0], { p: [0, 0.37, 0], r: [0, PI / 8, 0] });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(cyl(0.09, 0.11, pillarH, 6), pal.wood, { p: [x * 0.8, 0.45 + pillarH / 2, z * 0.8] });
    const roofY = 0.45 + pillarH;
    k.add(box(1.9, 0.14, 0.14), pal.wood, { p: [0, roofY, 0.8] });
    k.add(box(1.9, 0.14, 0.14), pal.wood, { p: [0, roofY, -0.8] });
    k.add(box(0.14, 0.14, 1.9), pal.wood, { p: [0.8, roofY, 0] });
    k.add(box(0.14, 0.14, 1.9), pal.wood, { p: [-0.8, roofY, 0] });
    k.add(cone(1.75, 0.8, 8), roofC, { p: [0, roofY + 0.47, 0], r: [0, PI / 8, 0] });
    k.add(cone(1.05, 0.7, 8), roofC2, { p: [0, roofY + 1.05, 0], r: [0, PI / 8, 0] });
    let topY = roofY + 1.4;
    if (L === 3) { k.add(cone(0.6, 0.6, 8), roofC, { p: [0, roofY + 1.55, 0], r: [0, PI / 8, 0] }); topY = roofY + 1.85; }
    if (L >= 2) k.add(tor(1.2, 0.05, 4, 16), 0xffd26b, { p: [0, roofY + 0.12, 0], r: [PI / 2, 0, 0] });
    k.glow(oct(0.16), pal.accent, { p: [0, topY + 0.2, 0], s: [1, 1.8, 1] });
    k.to(g, ud.glow);

    const chimeAt = (x, z, c) => {
      const piv = new THREE.Group();
      piv.position.set(x, roofY - 0.02, z);
      const ck = new Kit();
      ck.add(cyl(0.012, 0.012, 0.36, 3), 0x3b2f55, { p: [0, -0.18, 0] });
      ck.glow(oct(0.1), c, { p: [0, -0.55, 0], s: [1, 2.6, 1] });
      ck.to(piv, ud.glow);
      g.add(piv); ud.swing.push(piv);
    };
    const spots = [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]];
    if (L >= 2) spots.push([0, 0.75], [0, -0.75], [0.75, 0], [-0.75, 0]);
    spots.forEach(([x, z], i) => chimeAt(x, z, i % 2 ? pal.accent : pal.glow));
    // center bell
    const bell = new THREE.Group();
    bell.position.set(0, roofY + 0.05, 0);
    const bk = new Kit();
    bk.add(cyl(0.015, 0.015, 0.3, 3), 0x3b2f55, { p: [0, -0.15, 0] });
    bk.add(cyl(0.13, 0.3, 0.42, 8), 0xffd26b, { p: [0, -0.5, 0] });
    bk.add(ico(0.1, 0), 0xffe7a0, { p: [0, -0.29, 0] });
    bk.glow(ico(0.08, 0), pal.glow, { p: [0, -0.75, 0] });
    bk.to(bell, ud.glow);
    g.add(bell); ud.swing.push(bell);
    ud.height = topY + 0.4; ud.radius = 1.3;
  }

  function building(type, level, pal) {
    const L = Math.max(1, Math.min(3, (level | 0) || 1));
    const g = new THREE.Group();
    const ud = { glow: [], head: null, muzzle: null, spin: [], swing: [], height: 3, radius: 1.5 };
    switch (type) {
      case 'cottage': cottage(g, ud, L, pal); break;
      case 'field': field(g, ud, L, pal); break;
      case 'tower': tower(g, ud, L, pal); break;
      case 'lantern': lantern(g, ud, L, pal); break;
      case 'hedge': hedge(g, ud, L, pal); break;
      case 'grove': grove(g, ud, L, pal); break;
      case 'chime': chime(g, ud, L, pal); break;
      default: cottage(g, ud, L, pal);
    }
    g.userData = ud;
    return g;
  }

  // ======================================================================
  // HEART TREE (the kingdom's heart)
  // ======================================================================
  function heartShapeGeo(size, depth) {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.1, -0.35, -0.55, -0.1, -0.5, 0.2);
    s.bezierCurveTo(-0.45, 0.5, -0.1, 0.55, 0, 0.3);
    s.bezierCurveTo(0.1, 0.55, 0.45, 0.5, 0.5, 0.2);
    s.bezierCurveTo(0.55, -0.1, 0.1, -0.35, 0, -0.5);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 1, curveSegments: 5 });
    g.translate(0, 0, -depth / 2);
    g.scale(size, size, size);
    return g;
  }

  function heartTree(pal) {
    const rng = mulberry(7);
    const g = new THREE.Group();
    const glowList = [];
    const k = new Kit();
    // roots
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      k.add(cyl(0.12, 0.38, 1.7, 5), i % 2 ? pal.trunk : shade(pal.trunk, 0.88),
        { p: [Math.cos(a) * 1.05, 0.32, Math.sin(a) * 1.05], r: [Math.sin(a) * 1.15, 0, -Math.cos(a) * 1.15], j: 0.04, rng });
    }
    // twisting trunk
    const segs = 5, TH = 4.2;
    for (let i = 0; i < segs; i++) {
      const t = i / segs, h = TH / segs;
      const r0 = 1.15 - t * 0.45, r1 = r0 - 0.09;
      const ox = Math.sin(t * 3.2) * 0.18, oz = Math.cos(t * 2.6) * 0.12;
      k.add(cyl(r1, r0, h * 1.08, 7), i % 2 ? pal.trunk : shade(pal.trunk, 0.9),
        { p: [ox, h * (i + 0.5), oz], r: [0, i * 0.35, Math.sin(i) * 0.05], j: 0.03, rng });
    }
    // branches
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5, tilt = 0.85;
      const rot = [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt];
      k.add(cyl(0.18, 0.34, 1.7, 5), pal.trunk, { p: along([0, TH - 0.4, 0], [0, 0.8, 0], rot), r: rot });
    }
    // little shrine stones around base
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      k.add(dod(0.22), pal.rock[i % 2], { p: [Math.cos(a) * 2.1, 0.12, Math.sin(a) * 2.1], s: [1, 0.6, 1], j: 0.03, rng });
    }
    k.to(g, glowList);

    // crown
    const crown = new THREE.Group();
    crown.position.set(0, TH, 0);
    const ck = new Kit();
    ck.add(ico(2.2, 1), pal.leaf[0], { p: [0, 1.7, 0], s: [1.1, 0.85, 1.1], j: 0.16, rng });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.2, d = R(rng, 2.1, 2.6);
      ck.add(ico(R(rng, 1.2, 1.55), 1), pal.leaf[(i + 1) % pal.leaf.length], { p: [Math.cos(a) * d, R(rng, 0.7, 1.4), Math.sin(a) * d], s: [1, 0.85, 1], j: 0.12, rng });
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 1.0;
      ck.add(ico(R(rng, 1.0, 1.3), 1), pal.leaf[(i + 2) % pal.leaf.length], { p: [Math.cos(a) * 1.0, 2.9, Math.sin(a) * 1.0], j: 0.1, rng });
    }
    ck.add(ico(0.9, 1), shade(pal.leaf[1 % pal.leaf.length], 1.05), { p: [0, 3.7, 0], j: 0.08, rng });
    // hanging glow fruit
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.35, d = R(rng, 1.6, 3.0);
      ck.add(cyl(0.012, 0.012, 0.35, 3), 0x3b2f55, { p: [Math.cos(a) * d, 0.12, Math.sin(a) * d] });
      ck.glow(ico(0.14, 0), i % 3 === 0 ? pal.accent : pal.glow, { p: [Math.cos(a) * d, -0.12, Math.sin(a) * d] });
    }
    ck.to(crown, glowList);
    g.add(crown);

    // glowing heart core
    const cg = prep(heartShapeGeo(1.0, 0.3), pal.accent, {});
    const core = new THREE.Mesh(cg, MAT.glow);
    core.position.set(0.05, 2.05, 1.02);
    core.rotation.x = -0.08;
    g.add(core);
    glowList.push(core);
    // frame ring around core
    const fk = new Kit();
    fk.add(tor(0.62, 0.09, 4, 12), shade(pal.trunk, 0.75), { p: [0.05, 2.02, 0.92], r: [-0.08, 0, 0] });
    fk.to(g);

    g.userData = { crown, core, height: TH + 4.6, radius: 1.6, glow: glowList };
    return g;
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ======================================================================
  // PLAYER: mount "Floof" + rider
  // ======================================================================
  function mount() {
    const rng = mulberry(42);
    const g = new THREE.Group();
    const cream = 0xfff6ec, cream2 = 0xffeef6, hoof = 0xc9a7e8, dark = 0x2a2140;
    // legs (attached to root so feet stay grounded)
    const legs = [];
    for (const [x, z] of [[-0.3, 0.38], [0.3, 0.38], [-0.3, -0.38], [0.3, -0.38]]) {
      const piv = new THREE.Group();
      piv.position.set(x, 0.52, z);
      const lk = new Kit();
      lk.add(cyl(0.13, 0.1, 0.46, 6), 0xf3e6ef, { p: [0, -0.23, 0] });
      lk.add(cyl(0.12, 0.13, 0.09, 6), hoof, { p: [0, -0.475, 0] });
      lk.to(piv);
      g.add(piv); legs.push(piv);
    }
    const body = new THREE.Group();
    g.add(body);
    const bk = new Kit();
    bk.add(ico(0.56, 1), cream, { p: [0, 0.86, 0], s: [1, 0.78, 1.3], j: 0.04, rng });
    const puffs = [[0.38, 0.95, 0.35], [-0.38, 0.95, 0.35], [0.42, 0.86, -0.3], [-0.42, 0.86, -0.3], [0, 1.14, 0.15], [0, 1.1, -0.4], [0.3, 0.72, 0], [-0.3, 0.72, 0]];
    puffs.forEach((p, i) => bk.add(ico(0.27, 1), i % 2 ? cream2 : cream, { p, j: 0.03, rng }));
    // saddle blanket
    bk.add(cyl(0.42, 0.46, 0.08, 8), 0xff7eb6, { p: [0, 1.2, -0.05], s: [1, 1, 1.15] });
    bk.add(cyl(0.44, 0.44, 0.03, 8), 0xffd23f, { p: [0, 1.17, -0.05], s: [1, 1, 1.15] });
    bk.to(body);
    const seat = new THREE.Object3D();
    seat.position.set(0, 1.24, -0.05);
    body.add(seat);
    // head
    const head = new THREE.Group();
    head.position.set(0, 1.02, 0.72);
    const hk = new Kit();
    hk.add(ico(0.34, 1), cream, { s: [1, 0.95, 1.05], j: 0.02, rng });
    hk.add(ico(0.19, 1), 0xffe4ec, { p: [0, -0.1, 0.25], s: [1.1, 0.8, 1] });
    hk.add(ico(0.06, 0), 0xff7fa8, { p: [0, -0.04, 0.42] });
    hk.add(ico(0.052, 0), dark, { p: [-0.15, 0.06, 0.27] });
    hk.add(ico(0.052, 0), dark, { p: [0.15, 0.06, 0.27] });
    hk.add(ico(0.018, 0), 0xffffff, { p: [-0.14, 0.085, 0.315] });
    hk.add(ico(0.018, 0), 0xffffff, { p: [0.16, 0.085, 0.315] });
    hk.add(ico(0.07, 0), 0xffa6c9, { p: [-0.22, -0.05, 0.22], s: [1, 0.6, 0.4] });
    hk.add(ico(0.07, 0), 0xffa6c9, { p: [0.22, -0.05, 0.22], s: [1, 0.6, 0.4] });
    hk.add(cone(0.07, 0.36, 5), 0xb9a4ff, { p: [-0.15, 0.36, -0.02], r: [-0.35, 0, 0.35] });
    hk.add(cone(0.07, 0.36, 5), 0x9ee6ff, { p: [0.15, 0.36, -0.02], r: [-0.35, 0, -0.35] });
    hk.add(ico(0.14, 0), cream2, { p: [-0.33, 0.1, -0.06], s: [0.6, 1.6, 0.4], r: [0, 0, 1.15] });
    hk.add(ico(0.14, 0), cream2, { p: [0.33, 0.1, -0.06], s: [0.6, 1.6, 0.4], r: [0, 0, -1.15] });
    for (let i = 0; i < 3; i++) hk.add(ico(0.1, 0), cream, { p: [(i - 1) * 0.08, 0.32, 0.05 + (i % 2) * 0.04] });
    hk.to(head);
    body.add(head);
    // tail
    const tail = new THREE.Group();
    tail.position.set(0, 0.95, -0.72);
    const tk = new Kit();
    tk.add(ico(0.2, 1), cream, { j: 0.03, rng });
    tk.add(ico(0.12, 0), cream2, { p: [0.1, 0.1, -0.1] });
    tk.add(ico(0.1, 0), cream2, { p: [-0.08, 0.12, -0.08] });
    tk.to(tail);
    body.add(tail);
    g.userData = { body, head, tail, legs, seat, height: 1.3 };
    return g;
  }

  function rider(cloakColor) {
    const g = new THREE.Group();
    const glowList = [];
    const k = new Kit();
    const cloak = cloakColor === undefined ? 0x7b6cff : cloakColor;
    const skin = 0xffd9c2, boot = 0x5a3d6e;
    for (const sx of [-1, 1]) {
      k.add(cyl(0.065, 0.07, 0.34, 5), shade(cloak, 0.7), { p: [sx * 0.24, 0.0, 0.08], r: [0.3, 0, sx * 0.55] });
      k.add(ico(0.085, 0), boot, { p: [sx * 0.33, -0.15, 0.14], s: [1, 0.8, 1.3] });
    }
    k.add(cyl(0.17, 0.2, 0.4, 7), 0xfff1e0, { p: [0, 0.3, 0] });
    k.add(cone(0.34, 0.62, 8), cloak, { p: [0, 0.3, -0.02] });
    k.add(ico(0.2, 1), skin, { p: [0, 0.72, 0] });
    k.add(ico(0.03, 0), 0x2a2140, { p: [-0.075, 0.74, 0.175] });
    k.add(ico(0.03, 0), 0x2a2140, { p: [0.075, 0.74, 0.175] });
    k.add(ico(0.04, 0), 0xffa6c9, { p: [-0.12, 0.68, 0.15], s: [1, 0.6, 0.4] });
    k.add(ico(0.04, 0), 0xffa6c9, { p: [0.12, 0.68, 0.15], s: [1, 0.6, 0.4] });
    // hair tufts peeking under the hat
    k.add(ico(0.1, 0), 0xff9e5e, { p: [-0.15, 0.8, -0.06] });
    k.add(ico(0.1, 0), 0xff9e5e, { p: [0.15, 0.8, -0.06] });
    // hands + staff
    k.add(ico(0.065, 0), skin, { p: [0.27, 0.43, 0.14] });
    k.add(ico(0.065, 0), skin, { p: [-0.25, 0.4, 0.2] });
    k.add(cyl(0.028, 0.034, 1.1, 5), 0xb07a5a, { p: [0.3, 0.55, 0.15], r: [0.25, 0, 0] });
    k.add(tor(0.08, 0.025, 3, 8), 0xffd26b, { p: [0.3, 1.06, 0.28], r: [PI / 2 + 0.25, 0, 0] });
    k.glow(ico(0.1, 1), 0xff6fd8, { p: [0.3, 1.13, 0.3] });
    k.to(g, glowList);
    const staffTip = new THREE.Object3D();
    staffTip.position.set(0.3, 1.13, 0.3);
    g.add(staffTip);
    // hat
    const hat = new THREE.Group();
    hat.position.set(0, 0.86, 0);
    const hk = new Kit();
    const hatC = mixc(cloak, 0x2a2140, 0.35);
    hk.add(cyl(0.36, 0.36, 0.05, 10), hatC, {});
    hk.add(cyl(0.21, 0.23, 0.09, 8), 0xffd23f, { p: [0, 0.07, 0] });
    hk.add(cone(0.22, 0.6, 8), hatC, { p: [0, 0.33, -0.04], r: [-0.22, 0, 0] });
    hk.add(cone(0.09, 0.3, 6), hatC, { p: [0, 0.68, -0.24], r: [-1.05, 0, 0] });
    hk.glow(oct(0.08), 0xffe27a, { p: [0, 0.74, -0.42], s: [1, 1, 0.5] });
    hk.to(hat, glowList);
    g.add(hat);
    // scarf
    const scarf = new THREE.Group();
    scarf.position.set(0, 0.56, 0);
    const sk = new Kit();
    sk.add(tor(0.16, 0.055, 4, 9), 0xffc93c, { r: [PI / 2, 0, 0] });
    sk.add(box(0.12, 0.035, 0.5), 0xffc93c, { p: [0.08, -0.05, -0.36], r: [0.35, 0.1, 0] });
    sk.add(box(0.12, 0.036, 0.1), 0xff7a59, { p: [0.08, -0.14, -0.6], r: [0.35, 0.1, 0] });
    sk.to(scarf);
    g.add(scarf);
    g.userData = { staffTip, scarf, hat, glow: glowList, height: 1.1 };
    return g;
  }

  // ======================================================================
  // THE GLOOM (enemies)
  // ======================================================================
  function enemy(type) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x6f6a86, flatShading: true });
    const rng = Math.random;
    const g = new THREE.Group();
    const parts = [], eyeParts = [], tipParts = [];
    const dark = 0x3a3450;
    const mk = new Kit();
    let height = 1.15, eyeY = 0.66;
    const B = (geo, o) => parts.push(prep(geo, 0xffffff, o));
    const eyeList = [];
    const E = (x, y, z, s = 1) => eyeList.push([x, y, z, s]);
    const brows = (x, y, z, w, sad = 0.35) => {
      mk.add(box(w, 0.035, 0.035), dark, { p: [-x, y, z], r: [0, 0, sad] });
      mk.add(box(w, 0.035, 0.035), dark, { p: [x, y, z], r: [0, 0, -sad] });
    };
    switch (type) {
      case 'drifter': {
        B(ico(0.4, 1), { p: [0, 1.25, 0], s: [1, 1.1, 1], j: 0.04, rng });
        B(cone(0.22, 0.8, 6), { p: [0, 0.95, -0.33], r: [-2.3, 0, 0] });
        B(cone(0.12, 0.55, 5), { p: [0.2, 1.02, -0.22], r: [-2.1, 0, 0.4] });
        B(cone(0.12, 0.55, 5), { p: [-0.2, 1.02, -0.22], r: [-2.1, 0, -0.4] });
        E(0.14, 1.32, 0.36, 0.85); E(-0.14, 1.32, 0.36, 0.85);
        mk.add(ico(0.045, 0), dark, { p: [0, 1.17, 0.4], s: [1.3, 0.5, 0.4] });
        brows(0.14, 1.44, 0.34, 0.1);
        height = 1.75; eyeY = 1.32;
        break;
      }
      case 'lump': {
        B(ico(1.2, 1), { p: [0, 1.0, 0], s: [1.05, 0.85, 1], j: 0.1, rng });
        B(ico(0.36, 1), { p: [1.2, 0.8, 0.2], s: [0.8, 1.3, 0.8], r: [0, 0, 0.4] });
        B(ico(0.36, 1), { p: [-1.2, 0.8, 0.2], s: [0.8, 1.3, 0.8], r: [0, 0, -0.4] });
        B(ico(0.36, 0), { p: [0.5, 0.15, 0.4], s: [1, 0.6, 1.3] });
        B(ico(0.36, 0), { p: [-0.5, 0.15, 0.4], s: [1, 0.6, 1.3] });
        B(ico(0.42, 0), { p: [0.3, 1.8, -0.4] });
        B(ico(0.3, 0), { p: [-0.45, 1.72, -0.2] });
        E(0.42, 1.3, 1.0, 1.5); E(-0.42, 1.3, 1.0, 1.5);
        mk.add(ico(0.07, 0), dark, { p: [0, 0.95, 1.13], s: [3, 0.6, 0.5] });
        brows(0.42, 1.55, 0.98, 0.26, 0.3);
        height = 2.1; eyeY = 1.3;
        break;
      }
      case 'splitter': {
        B(ico(0.62, 1), { p: [-0.36, 0.62, 0], j: 0.05, rng });
        B(ico(0.55, 1), { p: [0.4, 0.56, 0.05], j: 0.05, rng });
        B(ico(0.4, 1), { p: [0, 0.45, 0.1] });
        B(ico(0.15, 0), { p: [-0.5, 0.08, 0.2] });
        B(ico(0.15, 0), { p: [0.5, 0.08, 0.2] });
        E(-0.55, 0.74, 0.47, 0.8); E(-0.22, 0.76, 0.54, 0.8); E(0.26, 0.7, 0.5, 0.8); E(0.55, 0.7, 0.36, 0.8);
        mk.add(ico(0.05, 0), dark, { p: [-0.38, 0.5, 0.6], s: [1.4, 0.5, 0.4] });
        mk.add(ico(0.05, 0), dark, { p: [0.42, 0.46, 0.55], s: [1.4, 0.5, 0.4] });
        mk.add(box(0.03, 0.5, 0.03), dark, { p: [0.02, 0.62, 0.48], r: [0, 0, 0.15] });
        height = 1.25; eyeY = 0.73;
        break;
      }
      case 'boss': {
        B(ico(2.8, 1), { p: [0, 2.4, 0], s: [1, 0.85, 1], j: 0.2, rng });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + 0.3;
          B(ico(0.6, 0), { p: [Math.cos(a) * 2.2, 0.4, Math.sin(a) * 2.2], s: [1, 0.7, 1] });
        }
        B(ico(0.8, 1), { p: [2.7, 1.8, 0.4], s: [0.8, 1.2, 0.8], r: [0, 0, 0.4] });
        B(ico(0.8, 1), { p: [-2.7, 1.8, 0.4], s: [0.8, 1.2, 0.8], r: [0, 0, -0.4] });
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          const rot = [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4];
          const base = [Math.cos(a) * 1.4, 4.3, Math.sin(a) * 1.4];
          B(cone(0.35, 1.3, 5), { p: along(base, [0, 0.55, 0], rot), r: rot });
          tipParts.push(prep(oct(0.12), 0xffffff, { p: along(base, [0, 1.3, 0], rot), s: [1, 1.8, 1] }));
        }
        const xs = [-1.1, -0.55, 0, 0.55, 1.1];
        xs.forEach((x) => E(x, 2.95 + (x === 0 ? 0.25 : Math.abs(x) < 1 ? 0.12 : 0), 2.4 - 0.15 * Math.abs(x), x === 0 ? 2.8 : 2.1));
        mk.add(ico(0.2, 0), dark, { p: [0, 1.85, 2.5], s: [4, 0.8, 0.6] });
        brows(0.9, 3.45, 2.3, 0.6, 0.3);
        height = 5.2; eyeY = 2.95;
        break;
      }
      default: { // smudge
        B(ico(0.6, 1), { p: [0, 0.52, 0], s: [1, 0.85, 1], j: 0.06, rng });
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * TAU + 0.5;
          B(ico(0.18, 0), { p: [Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45] });
        }
        B(ico(0.14, 0), { p: [0.25, 0.07, 0.18], s: [1, 0.6, 1.3] });
        B(ico(0.14, 0), { p: [-0.25, 0.07, 0.18], s: [1, 0.6, 1.3] });
        B(cone(0.12, 0.3, 5), { p: [0.05, 1.05, 0], r: [0, 0, -0.3] });
        E(0.2, 0.66, 0.5); E(-0.2, 0.66, 0.5);
        mk.add(ico(0.06, 0), dark, { p: [0, 0.46, 0.56], s: [1.4, 0.5, 0.4] });
        brows(0.2, 0.8, 0.5, 0.14);
        height = 1.15; eyeY = 0.66;
      }
    }
    const bodyGeo = mergeGeometries(parts); parts.forEach((x) => x.dispose());
    const body = new THREE.Mesh(bodyGeo, mat);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const eyes = new THREE.Group();
    eyes.position.y = eyeY;
    for (const [x, y, z, s] of eyeList) eyeParts.push(prep(ico(0.09 * s, 0), 0xffffff, { p: [x, y - eyeY, z], s: [1, 1.35, 0.55] }));
    const eg = mergeGeometries(eyeParts);
    eyeParts.forEach((x) => x.dispose());
    eyes.add(new THREE.Mesh(eg, MAT.eye));
    g.add(eyes);
    if (tipParts.length) { // boss crown tips glow but don't blink
      const tg = mergeGeometries(tipParts); tipParts.forEach((x) => x.dispose());
      g.add(new THREE.Mesh(tg, MAT.eye));
    }
    mk.to(g);
    g.userData = { mat, eyes, height, body };
    return g;
  }

  // ======================================================================
  // ALLIES, FOLK & CRITTERS
  // ======================================================================
  function sprite() {
    const g = new THREE.Group();
    const glowList = [];
    const k = new Kit();
    k.glow(ico(0.25, 1), 0xe8ff9a, { p: [0, 0.25, 0] });
    k.add(cone(0.17, 0.2, 5), 0x5fd07a, { p: [0, 0.52, 0], r: [0.2, 0, 0.15] });
    k.add(box(0.03, 0.02, 0.16), 0x4fb864, { p: [0.02, 0.64, 0.02], r: [0.8, 0, 0] });
    k.add(ico(0.035, 0), 0x2a2140, { p: [-0.08, 0.29, 0.22] });
    k.add(ico(0.035, 0), 0x2a2140, { p: [0.08, 0.29, 0.22] });
    k.to(g, glowList, false);
    const mkWing = (sx) => {
      const w = new THREE.Group();
      w.position.set(sx * 0.18, 0.34, -0.08);
      const wk = new Kit();
      wk.add(ico(0.12, 0), 0xc8ffd8, { p: [sx * 0.14, 0, 0], s: [1.6, 0.2, 1], r: [0, 0, sx * 0.3] });
      wk.to(w, null, false);
      g.add(w);
      return w;
    };
    const wingL = mkWing(1), wingR = mkWing(-1);
    g.userData = { glow: glowList, wingL, wingR, height: 0.7 };
    return g;
  }

  function villager(color, rng) {
    rng = rng || Math.random;
    color = color === undefined ? 0xff7eb6 : color;
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const k = new Kit();
    const skin = pk([0xffd9c2, 0xf2c09c, 0xc98f6b, 0x8f5e45, 0xffe3d3], rng);
    const hair = pk([0x5a3d2e, 0xff9e5e, 0x2a2140, 0xffe08a, 0xb05a8a], rng);
    const dark = 0x2a2140;
    k.add(capsule(0.21, 0.28, 7), color, { p: [0, 0.36, 0] });
    k.add(cyl(0.216, 0.216, 0.06, 7), shade(color, 0.72), { p: [0, 0.32, 0] });
    k.add(ico(0.07, 0), dark, { p: [0.09, 0.04, 0.05], s: [1, 0.6, 1.3] });
    k.add(ico(0.07, 0), dark, { p: [-0.09, 0.04, 0.05], s: [1, 0.6, 1.3] });
    k.add(ico(0.07, 0), color, { p: [0.22, 0.38, 0.03] });
    k.add(ico(0.07, 0), color, { p: [-0.22, 0.38, 0.03] });
    k.add(ico(0.18, 1), skin, { p: [0, 0.8, 0] });
    k.add(ico(0.025, 0), dark, { p: [0.065, 0.82, 0.16] });
    k.add(ico(0.025, 0), dark, { p: [-0.065, 0.82, 0.16] });
    k.add(ico(0.035, 0), 0xffa6c9, { p: [0.11, 0.77, 0.13], s: [1, 0.6, 0.4] });
    k.add(ico(0.035, 0), 0xffa6c9, { p: [-0.11, 0.77, 0.13], s: [1, 0.6, 0.4] });
    const v = Math.floor(rng() * 5);
    if (v === 0) {
      k.add(ico(0.11, 0), hair, { p: [0, 0.96, -0.03] });
      k.add(ico(0.08, 0), hair, { p: [0.09, 0.93, -0.06] });
    } else if (v === 1) {
      k.add(cone(0.195, 0.34, 7), shade(color, 0.85), { p: [0, 1.0, -0.03], r: [-0.15, 0, 0] });
    } else if (v === 2) {
      k.add(cyl(0.3, 0.3, 0.03, 9), 0xf2d57a, { p: [0, 0.95, 0] });
      k.add(cyl(0.14, 0.16, 0.12, 8), 0xf2d57a, { p: [0, 1.02, 0] });
      k.add(cyl(0.165, 0.165, 0.03, 8), pk([0xff5e8a, 0x7b6cff, 0x3fd0ff], rng), { p: [0, 0.98, 0] });
    } else if (v === 3) {
      const bc = pk([0xff5e8a, 0x7b6cff, 0x3fd0ff, 0xffd23f, 0x5fd0a0], rng);
      k.add(dome(0.19, 8, 3), bc, { p: [0, 0.85, 0] });
      k.add(ico(0.065, 0), 0xffffff, { p: [0, 1.06, 0] });
    } else {
      k.add(ico(0.11, 0), hair, { p: [0, 0.95, -0.04] });
      const fc = [0xff5e8a, 0xffd23f, 0x7b6cff, 0xff8f3f, 0x3fd0ff, 0xffffff];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        k.add(ico(0.045, 0), fc[i], { p: [Math.cos(a) * 0.16, 0.93, Math.sin(a) * 0.16] });
      }
    }
    k.to(body);
    g.userData = { body, height: 1.0 };
    return g;
  }

  function bunny(color) {
    color = color === undefined ? 0xfff6ec : color;
    const g = new THREE.Group();
    const k = new Kit();
    k.add(ico(0.18, 1), color, { p: [0, 0.17, -0.02], s: [1, 0.9, 1.25] });
    k.add(ico(0.13, 1), color, { p: [0, 0.3, 0.17] });
    k.add(ico(0.022, 0), 0x2a2140, { p: [0.07, 0.33, 0.27] });
    k.add(ico(0.022, 0), 0x2a2140, { p: [-0.07, 0.33, 0.27] });
    k.add(ico(0.022, 0), 0xff7fa8, { p: [0, 0.29, 0.3] });
    k.add(ico(0.07, 0), 0xffffff, { p: [0, 0.2, -0.25] });
    k.add(ico(0.06, 0), shade(color, 0.9), { p: [0.1, 0.03, 0.08], s: [1, 0.5, 1.6] });
    k.add(ico(0.06, 0), shade(color, 0.9), { p: [-0.1, 0.03, 0.08], s: [1, 0.5, 1.6] });
    k.to(g);
    const ears = new THREE.Group();
    ears.position.set(0, 0.4, 0.13);
    const ek = new Kit();
    ek.add(ico(0.07, 0), color, { p: [-0.05, 0.11, 0], s: [0.45, 1.8, 0.3], r: [-0.2, 0, 0.2] });
    ek.add(ico(0.07, 0), color, { p: [0.05, 0.11, 0], s: [0.45, 1.8, 0.3], r: [-0.2, 0, -0.2] });
    ek.add(ico(0.04, 0), 0xffb3d0, { p: [-0.05, 0.11, 0.02], s: [0.45, 2.2, 0.3], r: [-0.2, 0, 0.2] });
    ek.add(ico(0.04, 0), 0xffb3d0, { p: [0.05, 0.11, 0.02], s: [0.45, 2.2, 0.3], r: [-0.2, 0, -0.2] });
    ek.to(ears);
    g.add(ears);
    g.userData = { ears, height: 0.55 };
    return g;
  }

  function bird(color) {
    color = color === undefined ? 0x7ad0ff : color;
    const g = new THREE.Group();
    const k = new Kit();
    k.add(ico(0.12, 0), color, { s: [1, 0.9, 1.6] });
    k.add(ico(0.085, 0), color, { p: [0, 0.07, 0.17] });
    k.add(cone(0.03, 0.09, 4), 0xffb03a, { p: [0, 0.06, 0.28], r: [PI / 2, 0, 0] });
    k.add(ico(0.018, 0), 0x2a2140, { p: [0.05, 0.1, 0.22] });
    k.add(ico(0.018, 0), 0x2a2140, { p: [-0.05, 0.1, 0.22] });
    k.add(box(0.12, 0.02, 0.14), shade(color, 0.8), { p: [0, 0.02, -0.22], r: [0.2, 0, 0] });
    k.to(g, null, false);
    const mkWing = (sx) => {
      const w = new THREE.Group();
      w.position.set(sx * 0.07, 0.03, 0);
      const wk = new Kit();
      wk.add(box(0.26, 0.02, 0.14), shade(color, 0.85), { p: [sx * 0.13, 0, 0] });
      wk.add(box(0.1, 0.018, 0.1), shade(color, 0.7), { p: [sx * 0.24, 0, -0.03] });
      wk.to(w, null, false);
      g.add(w);
      return w;
    };
    const wingL = mkWing(1), wingR = mkWing(-1);
    g.userData = { wingL, wingR };
    return g;
  }

  const bflyMats = new Map();
  let bflyGeo = null;
  function butterfly(color) {
    color = color === undefined ? 0xff7eb6 : color;
    let m = bflyMats.get(color);
    if (!m) { m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false }); bflyMats.set(color, m); }
    if (!bflyGeo) {
      const pts = [[0, 0.02], [0.06, 0.13], [0.17, 0.16], [0.21, 0.07], [0.13, 0.0], [0.15, -0.08], [0.07, -0.13], [0, -0.03]];
      const mkw = (sx) => {
        const s = new THREE.Shape();
        pts.forEach(([x, y], i) => (i ? s.lineTo(sx * x, y) : s.moveTo(sx * x, y)));
        const geo = new THREE.ShapeGeometry(s);
        geo.rotateX(PI / 2);
        return geo;
      };
      bflyGeo = { L: mkw(1), R: mkw(-1), body: prep(capsule(0.018, 0.14, 4), 0x3a2d4a, { r: [PI / 2, 0, 0] }) };
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bflyGeo.body, MAT.solid));
    const wingL = new THREE.Group(), wingR = new THREE.Group();
    wingL.add(new THREE.Mesh(bflyGeo.L, m));
    wingR.add(new THREE.Mesh(bflyGeo.R, m));
    g.add(wingL, wingR);
    g.userData = { wingL, wingR };
    return g;
  }

  function fish(color) {
    color = color === undefined ? 0xff8f3f : color;
    const g = new THREE.Group();
    const k = new Kit();
    k.add(ico(0.15, 0), color, { s: [0.65, 1, 1.75] });
    k.add(ico(0.12, 0), mixc(color, 0xffffff, 0.45), { p: [0, -0.05, 0.03], s: [0.6, 0.6, 1.5] });
    k.add(cone(0.13, 0.2, 4), shade(color, 0.85), { p: [0, 0, -0.32], r: [PI / 2, 0, 0], s: [0.25, 1, 1] });
    k.add(cone(0.06, 0.16, 3), shade(color, 0.85), { p: [0, 0.16, 0], r: [-0.4, 0, 0], s: [0.3, 1, 1] });
    k.add(ico(0.022, 0), 0x2a2140, { p: [0.07, 0.04, 0.17] });
    k.add(ico(0.022, 0), 0x2a2140, { p: [-0.07, 0.04, 0.17] });
    k.to(g, null, false);
    g.userData = { height: 0.3 };
    return g;
  }

  // ======================================================================
  // RIFT, CLOUDS, DISTANT ISLETS
  // ======================================================================
  let riftCount = 0;
  function rift() {
    const rng = mulberry(99 + riftCount++);
    const g = new THREE.Group();
    const glowList = [];
    const k = new Kit();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + rng() * 0.4;
      k.add(dod(R(rng, 0.25, 0.45)), pk([0x3b2f55, 0x4a3a6b, 0x2f2450], rng), { p: [Math.cos(a) * 1.2, 0.15, Math.sin(a) * 0.6], s: [1, 0.6, 1], j: 0.04, rng });
    }
    k.to(g, glowList);
    const shards = new THREE.Group();
    shards.position.set(0, 1.55, 0);
    const sk = new Kit();
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng() * 0.2, len = R(rng, 0.9, 1.5), rr = 1.15;
      const pos = [Math.cos(a) * rr, Math.sin(a) * rr, R(rng, -0.1, 0.1)];
      const rot = [R(rng, -0.2, 0.2), 0, a - PI / 2];
      sk.add(oct(0.26), pk([0x4b3677, 0x2f2450, 0x6e4fa8], rng), { p: along(pos, [0, len * 0.2, 0], rot), r: rot, s: [0.55, len, 0.55], j: 0.02, rng });
      if (i % 3 === 0) sk.glow(oct(0.09), 0x9d7bff, { p: along(pos, [0, len * 0.2 + 0.26 * len + 0.06, 0], rot), r: rot, s: [1, 2, 1] });
    }
    sk.to(shards, glowList);
    g.add(shards);
    const ig = swirlGeo(1.0, 0.04, [0xffffff, 0x8a8a8a, 0xffffff, 0x5a5a5a], 4, 16);
    const inner = new THREE.Mesh(ig, new THREE.MeshBasicMaterial({ color: 0x3a2a5c, vertexColors: true, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    inner.position.set(0, 1.55, 0);
    g.add(inner);
    g.userData = { inner, shards, glow: glowList, height: 3.0 };
    return g;
  }

  function cloud(rng) {
    rng = rng || Math.random;
    const parts = [];
    const n = 3 + Math.floor(rng() * 5);
    const main = R(rng, 1.1, 1.7);
    parts.push(prep(ico(main, 1), 0xffffff, { j: main * 0.08, rng }));
    let width = main * 2;
    for (let i = 0; i < n - 1; i++) {
      const side = i % 2 ? 1 : -1, tier = Math.floor(i / 2);
      const d = R(rng, 0.6, 1.0) * main * (1 + tier * 0.6);
      const r = (main * R(rng, 0.5, 0.8)) / (1 + tier * 0.3);
      parts.push(prep(ico(r, 1), 0xffffff, { p: [side * d, R(rng, -0.2, 0.3) * r, R(rng, -0.4, 0.4) * main], j: r * 0.08, rng }));
      width = Math.max(width, (d + r) * 2);
    }
    const geo = mergeGeometries(parts);
    parts.forEach((x) => x.dispose());
    const pos = geo.attributes.position, floor = -main * 0.3;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < floor) pos.setY(i, floor + (y - floor) * 0.15);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, MAT.cloud);
    m.castShadow = true; m.receiveShadow = false;
    m.userData = { width };
    return m;
  }

  function islandRock(pal, rng) {
    rng = rng || Math.random;
    const g = new THREE.Group();
    const k = new Kit();
    const w = R(rng, 3, 9), r = w / 2;
    k.add(cyl(r, r * 0.96, 0.4, 9), pal.grass[0], { p: [0, -0.2, 0], j: r * 0.04, rng });
    k.add(cyl(r * 0.98, r * 0.85, 0.35, 9), pal.cliff[0], { p: [0, -0.55, 0], j: r * 0.05, rng });
    const h1 = r * 0.5, h2 = r * 0.6, h3 = r * 0.9;
    k.add(cyl(r * 0.85, r * 0.6, h1, 9), pal.cliff[1], { p: [0, -0.72 - h1 / 2, 0], j: r * 0.06, rng });
    k.add(cyl(r * 0.6, r * 0.32, h2, 8), pal.cliff[2], { p: [0, -0.72 - h1 - h2 / 2, 0], j: r * 0.06, rng });
    k.add(cone(r * 0.32, h3, 7), pal.cliff[3], { p: [0, -0.72 - h1 - h2 - h3 / 2, 0], r: [PI, 0, 0], j: r * 0.04, rng });
    const nt = 1 + Math.floor(rng() * 3);
    const leaves = pal.leaf.concat(pal.leafAlt);
    for (let i = 0; i < nt; i++) {
      const a = rng() * TAU, d = rng() * r * 0.55, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const s = R(rng, 0.6, 1.0) * Math.min(1.2, r / 2.5);
      k.add(cyl(0.08 * s, 0.13 * s, 0.8 * s, 5), pal.trunk, { p: [x, 0.4 * s, z] });
      k.add(ico(0.55 * s, 1), pk(leaves, rng), { p: [x, 1.2 * s, z], j: 0.05 * s, rng });
    }
    if (rng() < 0.6) {
      const a = rng() * TAU;
      k.add(dod(0.35 * Math.min(1.5, r / 2)), pal.rock[0], { p: [Math.cos(a) * r * 0.5, 0.15, Math.sin(a) * r * 0.5], j: 0.04, rng });
    }
    k.to(g);
    g.userData = { width: w, height: 0.72 + h1 + h2 + h3 };
    return g;
  }

  return {
    tree, deco, flowerGeos, grassGeo, building, heartTree, mount, rider, enemy,
    sprite, villager, bunny, bird, butterfly, fish, rift, cloud, islandRock, swirlGeo,
  };
})();
