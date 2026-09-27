
// ============================================================================
// Renderer, scene, camera, post-processing
// ============================================================================
loadSave();
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
const PR = () => (SAVE.settings.quality === 'low' ? Math.min(window.devicePixelRatio || 1, 1) : Math.min(window.devicePixelRatio || 1, 1.75)) * Perf.scale;
renderer.setPixelRatio(PR());
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffd6e0, 170, 720);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 2400);
camera.position.set(0, 40, 40);
camera.lookAt(0, 0, 0);

const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: SAVE.settings.quality === 'low' ? 0 : 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.55, 0.92);

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, tilt: { value: 1 }, focus: { value: 0.52 },
    hue: { value: 0 }, sat: { value: 1.12 }, vign: { value: 0.32 }, time: { value: 0 }, grain: { value: 0.018 },
    warm: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float tilt, focus, hue, sat, vign, time, grain; uniform vec3 warm;
    varying vec2 vUv;
    vec3 hueShift(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca); }
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      float d = abs(vUv.y - focus);
      float amt = smoothstep(0.17, 0.55, d) * tilt;
      if (amt > 0.002) {
        vec3 acc = col.rgb; float tot = 1.0; float r = amt * 5.5 * (res.y / 1000.0);
        for (int i = 0; i < 14; i++) {
          float a = float(i) * 2.39996;
          float rad = sqrt(float(i) + 0.5) / sqrt(14.0) * r;
          acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * rad / res).rgb; tot += 1.0;
        }
        col.rgb = acc / tot;
      }
      col.rgb *= warm;
      if (abs(hue) > 0.0001) col.rgb = max(hueShift(col.rgb, hue), 0.0);
      float l = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
      col.rgb = max(mix(vec3(l), col.rgb, sat), 0.0);
      vec2 q = vUv - 0.5; q.x *= res.x / res.y * 0.75;
      col.rgb *= 1.0 - vign * dot(q, q) * 1.7;
      col.rgb += (fract(sin(dot(vUv * res + time * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * grain;
      gl_FragColor = col;
    }`,
};
const gradePass = new ShaderPass(GradeShader);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(gradePass);
composer.addPass(outputPass);

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(PR());
  renderer.setSize(w, h, false);
  composer.setPixelRatio(PR());
  composer.setSize(w, h);
  gradePass.uniforms.res.value.set(w * PR(), h * PR());
}
addEventListener('resize', onResize);
onResize();

// ============================================================================
// Sky, stars, cloud sea, clouds, aurora
// ============================================================================
const skyU = {
  uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
  uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(-0.3, 0.5, -0.8).normalize() },
  uNight: { value: 0 }, uTime: { value: 0 },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 uTop, uHor, uBot, uSunCol, uSunDir, uMoonDir; uniform float uNight, uTime; varying vec3 vDir;
    float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    void main(){
      vec3 d = normalize(vDir); float y = d.y;
      vec3 c = y > 0.0 ? mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHor, uBot, pow(clamp(-y * 1.15, 0.0, 1.0), 0.75));
      c += uHor * 0.10 * exp(-abs(y) * 12.0);
      float s = max(dot(d, normalize(uSunDir)), 0.0);
      c += uSunCol * (pow(s, 400.0) * 3.0 + pow(s, 22.0) * 0.30 + pow(s, 3.0) * 0.07) * (1.0 - 0.7 * uNight);
      float m = dot(d, uMoonDir);
      c += vec3(1.0, 0.95, 1.1) * (smoothstep(0.9992, 0.9995, m) * 1.8 + pow(max(m, 0.0), 60.0) * 0.25) * uNight;
      if (uNight > 0.02) {
        vec3 p = d * 150.0; vec3 cell = floor(p); vec3 f = fract(p) - 0.5;
        float h = hash(cell);
        if (h > 0.968) {
          float tw = 0.55 + 0.45 * sin(uTime * (1.2 + h * 4.0) + h * 90.0);
          float st = smoothstep(0.34, 0.0, length(f)) * tw;
          vec3 sc = mix(vec3(1.0, 0.78, 0.95), vec3(0.72, 0.9, 1.0), fract(h * 37.0));
          c += sc * st * uNight * 1.8;
        }
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
sky.renderOrder = -10;
sky.frustumCulled = false;
scene.add(sky);

// Cloud sea far below the islands
const seaU = { uTime: { value: 0 }, uLight: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uFade: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() }, uNight: { value: 0 } };
const GLSL_NOISE = `
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }`;
const cloudSea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), new THREE.ShaderMaterial({
  uniforms: seaU, transparent: true, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: GLSL_NOISE + `
    uniform float uTime, uNight; uniform vec3 uLight, uShade, uFade, uCam; varying vec3 vW;
    void main(){
      vec2 p = vW.xz * 0.0045 + vec2(uTime * 0.006, uTime * 0.0025);
      float n = fbm(p) + 0.35 * fbm(p * 2.7 - uTime * 0.01);
      float puff = smoothstep(0.52, 0.95, n);
      vec3 c = mix(uShade, uLight, smoothstep(0.55, 1.1, n));
      float d = length(vW.xz - uCam.xz);
      float a = puff * (1.0 - smoothstep(500.0, 1700.0, d));
      c = mix(c, uFade, smoothstep(250.0, 1500.0, d));
      gl_FragColor = vec4(c, a * 0.92);
    }`,
}));
cloudSea.rotation.x = -Math.PI / 2;
cloudSea.position.y = -70;
cloudSea.renderOrder = -5;
scene.add(cloudSea);

// Aurora curtains (visible mostly in the low camera views: title + vibe)
const auroraU = { uTime: { value: 0 }, uAmt: { value: 0 }, uA: { value: new THREE.Color(0x6fffd0) }, uB: { value: new THREE.Color(0xff6fe0) } };
const aurora = new THREE.Group();
{
  const mat = new THREE.ShaderMaterial({
    uniforms: auroraU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position;
      p.z += sin(p.x * 0.012 + uTime * 0.25) * 30.0 + sin(p.x * 0.031 - uTime * 0.4) * 12.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: GLSL_NOISE + `uniform float uTime, uAmt; uniform vec3 uA, uB; varying vec2 vUv;
      void main(){
        float streak = fbm(vec2(vUv.x * 18.0 + uTime * 0.08, uTime * 0.05)) ;
        float band = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        vec3 c = mix(uA, uB, smoothstep(0.2, 0.9, vUv.y + streak * 0.3));
        float a = band * smoothstep(0.35, 0.8, streak) * uAmt * (0.6 + 0.4 * sin(vUv.x * 40.0 + uTime));
        a *= smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x));
        gl_FragColor = vec4(c * a * 1.3, 1.0);
      }`,
  });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(900, 160, 90, 1), mat);
    const a = -Math.PI / 2 + (i - 1) * 0.9;
    m.position.set(Math.cos(a) * 620, 170 + i * 30, Math.sin(a) * 620);
    m.lookAt(0, 150, 0);
    m.renderOrder = -8;
    m.frustumCulled = false;
    aurora.add(m);
  }
}
scene.add(aurora);

// Rainbow arc
const rainbowU = { uAmt: { value: 0 } };
const rainbow = new THREE.Mesh(new THREE.TorusGeometry(420, 26, 6, 96, Math.PI), new THREE.ShaderMaterial({
  uniforms: rainbowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uAmt; varying vec2 vUv;
    vec3 hsv(float h){ vec3 k = vec3(1.0, 2.0/3.0, 1.0/3.0); vec3 p = abs(fract(vec3(h) + k) * 6.0 - 3.0); return clamp(p - 1.0, 0.0, 1.0); }
    void main(){ float t = fract(vUv.y); float band = smoothstep(0.0, 0.2, t) * smoothstep(0.5, 0.3, t);
      vec3 c = hsv(t * 1.6 + 0.02) * 0.9; float end = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
      gl_FragColor = vec4(c * band * end * uAmt, 1.0); }`,
}));
rainbow.position.set(0, -150, -700);
rainbow.renderOrder = -7;
rainbow.visible = false;
scene.add(rainbow);

// Drifting clouds + distant islets (rebuilt per island for palette)
const ambientGroup = new THREE.Group();
scene.add(ambientGroup);
const clouds = [];
const islets = [];

// ============================================================================
// Lights + time of day
// ============================================================================
const hemi = new THREE.HemisphereLight(0xffffff, 0x886688, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(SAVE.settings.quality === 'low' ? 1024 : 2048, SAVE.settings.quality === 'low' ? 1024 : 2048);
{
  const sc = sun.shadow.camera; sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
}
scene.add(sun, sun.target);
const LIGHT_SUN = 0.5 * Math.PI, LIGHT_HEMI = 0.52 * Math.PI;

const TOD = {
  keys: TOD_KEYS.map(k => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), bot: new THREE.Color(k.bot), sun: new THREE.Color(k.sun), hemiS: new THREE.Color(k.hemiS), hemiG: new THREE.Color(k.hemiG), cloud: new THREE.Color(k.cloud) })),
  cur: { top: new THREE.Color(), hor: new THREE.Color(), bot: new THREE.Color(), sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), cloud: new THREE.Color(), sunI: 1, hemiI: 1, night: 0 },
  hour: 8, night: 0, hueShift: 0,
};
const _sunDir = new THREE.Vector3(), _moonDir = new THREE.Vector3(), _tmpV = new THREE.Vector3();
let cssTimer = 0;
function applyTOD(hour, dt, isleDef, time) {
  hour = ((hour % 24) + 24) % 24;
  TOD.hour = hour;
  const K = TOD.keys;
  let i = 0; while (i < K.length - 2 && hour >= K[i + 1].h) i++;
  const a = K[i], b = K[i + 1];
  const t = smooth(clamp((hour - a.h) / (b.h - a.h), 0, 1));
  const c = TOD.cur;
  ['top', 'hor', 'bot', 'sun', 'hemiS', 'hemiG', 'cloud'].forEach(k => c[k].copy(a[k]).lerp(b[k], t));
  c.sunI = lerp(a.sunI, b.sunI, t); c.hemiI = lerp(a.hemiI, b.hemiI, t); c.night = lerp(a.night, b.night, t);
  TOD.night = c.night;
  // island hue character
  let hs = isleDef ? isleDef.skyHue : 0;
  if (isleDef && isleDef.prism) hs = Math.sin(time * 0.045) * 70;
  TOD.hueShift = hs;
  if (hs) ['top', 'hor', 'bot', 'hemiS', 'cloud'].forEach(k => shiftColor(c[k], hs));

  skyU.uTop.value.copy(c.top); skyU.uHor.value.copy(c.hor); skyU.uBot.value.copy(c.bot);
  skyU.uSunCol.value.copy(c.sun); skyU.uNight.value = c.night;

  // Sun path: rises in the east (+x), sets in the west; moon hangs high behind.
  const dayAng = (hour - 6) / 12 * Math.PI;
  const elev = clamp(Math.sin(dayAng), 0.12, 1) * 1.1;
  _sunDir.set(Math.cos(dayAng) * 0.9, Math.sin(Math.min(elev, 1.25)), 0.55).normalize();
  _moonDir.set(-0.45, 0.72, 0.52).normalize();
  const lightDir = _tmpV.copy(_sunDir).lerp(_moonDir, smooth(c.night)).normalize();
  skyU.uSunDir.value.copy(_sunDir);
  sun.position.copy(lightDir).multiplyScalar(110);
  sun.color.copy(c.sun);
  sun.intensity = c.sunI * LIGHT_SUN;
  hemi.color.copy(c.hemiS); hemi.groundColor.copy(c.hemiG); hemi.intensity = c.hemiI * LIGHT_HEMI;

  scene.fog.color.copy(c.bot).lerp(c.hor, 0.35);
  seaU.uLight.value.copy(c.cloud); seaU.uShade.value.copy(c.bot).multiplyScalar(0.92).lerp(c.cloud, 0.25);
  seaU.uFade.value.copy(c.bot); seaU.uNight.value = c.night;
  MAT.cloud.emissive.copy(c.cloud).multiplyScalar(0.42);
  MAT.cloud.color.setScalar(1);

  // Glow materials heat up at night
  MAT.glow.color.setScalar(1 + c.night * 2.1);
  auroraU.uAmt.value = c.night * (isleDef ? isleDef.aurora : 0.5);
  bloomPass.strength = (0.36 + c.night * 0.34) * SAVE.settings.bloom;
  bloomPass.threshold = lerp(0.93, 0.84, c.night);

  cssTimer -= dt;
  if (cssTimer <= 0) {
    cssTimer = 0.4;
    const hsl = {}, S = THREE.SRGBColorSpace;
    const acc = _c1.copy(c.hor); acc.getHSL(hsl, S); acc.setHSL(hsl.h, clamp(hsl.s * 1.4, 0.62, 0.95), 0.66, S);
    const acc2 = _c2.copy(c.top); acc2.getHSL(hsl, S); acc2.setHSL(hsl.h, clamp(hsl.s * 1.2, 0.55, 0.9), 0.74, S);
    document.documentElement.style.setProperty('--accent', cssHex(acc));
    document.documentElement.style.setProperty('--accent-2', cssHex(acc2));
  }
}

// ============================================================================
// Shared custom materials
// ============================================================================
const windU = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3(9999, 0, 9999) } };
function makeWindMat() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU.uTime; sh.uniforms.uPlayer = windU.uPlayer;
    sh.vertexShader = 'uniform float uTime; uniform vec3 uPlayer;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 ip = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float hh = max(transformed.y, 0.0);
        vec2 w = vec2(sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.21), cos(uTime * 1.3 + ip.z * 0.3 + ip.x * 0.1)) * 0.08 * hh;
        vec2 dp = ip.xz - uPlayer.xz; float dl = length(dp);
        if (dl < 1.9) w += normalize(dp + 0.0001) * (1.9 - dl) * 0.6 * hh;
        mvPosition.xz += w;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}
const grassMat = makeWindMat();
const flowerMat = makeWindMat();

function makeWaterMat(pal) {
  const u = {
    uTime: { value: 0 }, uDeep: { value: new THREE.Color(pal.water).multiplyScalar(0.55) }, uShallow: { value: new THREE.Color(pal.water) },
    uLight: { value: new THREE.Color(1, 1, 1) }, uNight: { value: 0 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GLSL_NOISE + `uniform float uTime, uNight; uniform vec3 uDeep, uShallow, uLight; varying vec3 vW; varying vec2 vUv;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        vec3 c = mix(uDeep, uShallow, smoothstep(0.1, 0.95, r));
        float n = fbm(vW.xz * 0.9 + vec2(uTime * 0.25, uTime * 0.18));
        float sp = smoothstep(0.78, 0.86, n) * 0.9;
        float foam = smoothstep(0.78, 0.97, r) * (0.55 + 0.45 * sin(uTime * 2.0 + r * 30.0));
        c += vec3(sp + foam * 0.55);
        c *= uLight;
        c += uShallow * uNight * 0.35 * (0.6 + 0.4 * n);
        gl_FragColor = vec4(c, 0.88 * smoothstep(1.02, 0.94, r));
      }`,
  });
  return m;
}
function makeFallMat(pal) {
  const u = { uTime: { value: 0 }, uCol: { value: new THREE.Color(pal.water) }, uLight: { value: new THREE.Color(1, 1, 1) }, uNight: { value: 0 } };
  return new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL_NOISE + `uniform float uTime, uNight; uniform vec3 uCol, uLight; varying vec2 vUv;
      void main(){
        float s = vnoise(vec2(vUv.x * 14.0, vUv.y * 30.0 - uTime * 7.0));
        float streak = smoothstep(0.55, 0.95, s);
        vec3 c = mix(uCol, vec3(1.0), streak * 0.55 + (1.0 - vUv.y) * 0.1) * uLight + uCol * uNight * 0.45;
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float a = edge * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * (0.75 + streak * 0.25);
        gl_FragColor = vec4(c, a);
      }`,
  });
}

// ============================================================================
// Island generation
// ============================================================================
const PLOT_RAD = { cottage: 1.9, field: 2.4, tower: 1.35, lantern: 1.0, hedge: 2.3, grove: 2.1, chime: 1.45 };

function generateIsland(def) {
  const rng = mulberry32(def.seed);
  const noise = makeNoise(def.seed * 7 + 3);
  const R = def.radius, pal = def.pal;
  const group = new THREE.Group();
  const disposables = [];
  const isle = {
    def, pal, R, group, paths: [], plotSpots: [], rifts: [], ponds: [], channels: [], colliders: [], clickables: [], trees: [],
    waterMats: [], fallMats: [], flowers: [], flowerMeshes: null, sways: [], rng,
  };

  // --- outline --------------------------------------------------------------
  const o1 = rng() * 100, o2 = rng() * 100;
  const E = th => R * (1 + 0.11 * noise(Math.cos(th) * 1.3 + o1, Math.sin(th) * 1.3 + o2) + 0.05 * noise(Math.cos(th) * 3.1 - o2, Math.sin(th) * 3.1 + o1));
  isle.edge = E;
  isle.edgeAt = (x, z) => E(Math.atan2(z, x));

  // --- paths ----------------------------------------------------------------
  const nP = def.paths;
  const base = rng() * TAU;
  const segs = [];
  for (let k = 0; k < nP; k++) {
    const th = base + k * TAU / nP + (rng() - 0.5) * 0.4;
    const ctrl = [];
    const steps = 5;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const r = lerp(E(th) - 1.4, 5.0, t);
      const wob = (s > 0 && s < steps) ? (rng() - 0.5) * 0.7 * (1 - t * 0.5) : 0;
      const a = th + wob * (12 / Math.max(r, 6));
      ctrl.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
    const len = curve.getLength();
    const n = Math.max(40, Math.round(len / 0.45));
    const pts = curve.getSpacedPoints(n).map(v => ({ x: v.x, z: v.z }));
    const path = { k, th, pts, len };
    isle.paths.push(path);
    for (let i = 0; i < pts.length - 1; i++) segs.push(pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
  }
  const segArr = new Float32Array(segs);
  function pathDistRaw(x, z) {
    let best = 1e9;
    for (let i = 0; i < segArr.length; i += 4) {
      const ax = segArr[i], az = segArr[i + 1], bx = segArr[i + 2], bz = segArr[i + 3];
      const vx = bx - ax, vz = bz - az; const wx = x - ax, wz = z - az;
      const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz + 1e-6), 0, 1);
      const dx = wx - vx * t, dz = wz - vz * t; const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.min(Math.sqrt(best), Math.max(0, Math.hypot(x, z) - 5.6));
  }
  isle.pathDistRaw = pathDistRaw;

  // --- ponds + waterfalls ----------------------------------------------------
  const pathAngles = isle.paths.map(p => p.th);
  const angGap = a => Math.min(...pathAngles.map(p => Math.abs(((a - p + Math.PI) % TAU + TAU) % TAU - Math.PI)));
  const nPonds = R > 34 ? 2 : 1;
  for (let tries = 0; tries < 200 && isle.ponds.length < nPonds; tries++) {
    const a = rng() * TAU, r = lerp(0.38, 0.7, rng()) * R, pr = lerp(2.6, 3.8, rng());
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDistRaw(x, z) < pr + 2.6) continue;
    if (isle.ponds.some(p => Math.hypot(p.x - x, p.z - z) < p.r + pr + 6)) continue;
    isle.ponds.push({ x, z, r: pr });
  }
  const nFalls = R > 35 ? 2 : 1;
  const fallSpots = [];
  for (let tries = 0; tries < 300 && fallSpots.length < nFalls; tries++) {
    const a = rng() * TAU;
    if (angGap(a) < 0.45) continue;
    if (fallSpots.some(f => Math.abs(((a - f.a + Math.PI) % TAU + TAU) % TAU - Math.PI) < 1.2)) continue;
    const e = E(a);
    const px = Math.cos(a) * (e - 3.0), pz = Math.sin(a) * (e - 3.0);
    if (pathDistRaw(px, pz) < 4) continue;
    if (isle.ponds.some(p => Math.hypot(p.x - px, p.z - pz) < p.r + 4)) continue;
    fallSpots.push({ a, e });
    isle.ponds.push({ x: px, z: pz, r: 1.7, spring: true });
    isle.channels.push({ ax: px, az: pz, bx: Math.cos(a) * (e + 0.5), bz: Math.sin(a) * (e + 0.5), w: 0.75 });
  }

  // --- plots ------------------------------------------------------------------
  const spots = isle.plotSpots;
  let pid = 0;
  function freeFor(x, z, rad, onPath) {
    const r = Math.hypot(x, z);
    if (r > E(Math.atan2(z, x)) - rad - 2.2) return false;
    if (r < 7.2 + rad) return false;
    if (!onPath && pathDistRaw(x, z) < rad + 1.5) return false;
    for (const p of isle.ponds) if (Math.hypot(p.x - x, p.z - z) < p.r + rad + 1.2) return false;
    for (const s of spots) if (Math.hypot(s.x - x, s.z - z) < s.rad + rad + (onPath || s.type === 'hedge' ? 0.6 : 1.3)) return false;
    return true;
  }
  function addSpot(type, x, z, unlock, rot, onPath) {
    const rad = PLOT_RAD[type];
    for (let a = 0; a < 18; a++) {
      const jx = a === 0 ? 0 : (rng() - 0.5) * 2.2 * Math.min(a, 6) * 0.5;
      const jz = a === 0 ? 0 : (rng() - 0.5) * 2.2 * Math.min(a, 6) * 0.5;
      const X = x + (onPath ? 0 : jx), Z = z + (onPath ? 0 : jz);
      if (freeFor(X, Z, rad, onPath)) {
        const r = rot !== undefined ? rot : Math.atan2(-X, -Z);
        spots.push({ id: 'p' + (pid++), type, x: X, z: Z, rot: r, unlock, rad });
        return true;
      }
      if (onPath) return false;
    }
    return false;
  }
  const pointOnPath = (path, f) => {
    const i = clamp(Math.round(f * (path.pts.length - 1)), 1, path.pts.length - 2);
    const p = path.pts[i], a = path.pts[i - 1], b = path.pts[i + 1];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return { x: p.x, z: p.z, tx, tz, nx: -tz, nz: tx };
  };
  // gaps between paths (angular midpoints)
  const sortedA = pathAngles.map(a => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
  const gaps = sortedA.map((a, i) => { const b = i === sortedA.length - 1 ? sortedA[0] + TAU : sortedA[i + 1]; return { mid: (a + b) / 2, span: b - a }; });

  // Ring 1 around the heart
  const inner = ['cottage', 'field', 'cottage', 'cottage', 'field'];
  gaps.forEach((g, i) => {
    const t = inner[i % inner.length];
    addSpot(t, Math.cos(g.mid) * 10.5, Math.sin(g.mid) * 10.5, i < 3 ? 0 : 1);
  });
  // Path defenses
  isle.paths.forEach((path, k) => {
    const side = k % 2 ? 1 : -1;
    const t1 = pointOnPath(path, 0.62);
    addSpot('tower', t1.x + t1.nx * 3.0 * side, t1.z + t1.nz * 3.0 * side, k < 2 ? 0 : 1);
    const h = pointOnPath(path, 0.5);
    addSpot('hedge', h.x, h.z, 1, Math.atan2(-h.tx, -h.tz), true);
    const l1 = pointOnPath(path, 0.42);
    addSpot('lantern', l1.x - l1.nx * 2.6 * side, l1.z - l1.nz * 2.6 * side, 2);
    const t2 = pointOnPath(path, 0.3);
    addSpot('tower', t2.x - t2.nx * 3.0 * side, t2.z - t2.nz * 3.0 * side, 3);
    const c1 = pointOnPath(path, 0.78);
    addSpot('chime', c1.x - c1.nx * 3.2 * side, c1.z - c1.nz * 3.2 * side, 4);
  });
  // Ring 2 between paths
  gaps.forEach((g, i) => {
    const r2 = 17 + (i % 2) * 2;
    addSpot('field', Math.cos(g.mid - 0.12) * r2, Math.sin(g.mid - 0.12) * r2, 1 + (i % 2));
    addSpot('cottage', Math.cos(g.mid + g.span * 0.22) * (r2 - 2.5), Math.sin(g.mid + g.span * 0.22) * (r2 - 2.5), 2);
    addSpot('grove', Math.cos(g.mid - g.span * 0.24) * (r2 + 1), Math.sin(g.mid - g.span * 0.24) * (r2 + 1), 3);
    if (i % 2 === 0) addSpot('lantern', Math.cos(g.mid) * 13.8, Math.sin(g.mid) * 13.8, 5);
  });

  // --- height field -------------------------------------------------------------
  const hillN = makeNoise(def.seed + 99);
  function heightRaw(x, z) {
    const r = Math.hypot(x, z);
    const e = E(Math.atan2(z, x));
    const rn = r / e;
    const pd = pathDistRaw(x, z);
    let f = smoothstep(1.3, 3.4, pd) * smoothstep(6.5, 10, r);
    for (const s of spots) { const d = Math.hypot(s.x - x, s.z - z); if (d < s.rad + 3) f *= smoothstep(s.rad + 0.4, s.rad + 2.6, d); }
    let h = (0.32 * noise.fbm(x * 0.05, z * 0.05, 3) + 0.14) * f;
    h += 2.2 * smoothstep(0.62, 0.95, hillN(x * 0.035, z * 0.035) + 0.5) * f * smoothstep(0.35, 0.6, rn);
    for (const p of isle.ponds) { const d = Math.hypot(p.x - x, p.z - z); h -= 0.85 * smoothstep(p.r + 0.9, p.r * 0.55, d); }
    for (const c of isle.channels) {
      const vx = c.bx - c.ax, vz = c.bz - c.az; const t = clamp(((x - c.ax) * vx + (z - c.az) * vz) / (vx * vx + vz * vz), 0, 1);
      const d = Math.hypot(x - c.ax - vx * t, z - c.az - vz * t); h = Math.min(h, lerp(h, -0.55, smoothstep(c.w + 0.8, c.w * 0.4, d)));
    }
    h -= 0.45 * smoothstep(0.9, 1.0, rn);
    return h;
  }
  const GN = 150, GS = R * 2.7, G0 = -GS / 2, GC = GS / (GN - 1);
  const hgrid = new Float32Array(GN * GN), pgrid = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const x = G0 + i * GC, z = G0 + j * GC;
    const inside = Math.hypot(x, z) < E(Math.atan2(z, x)) + 2;
    hgrid[j * GN + i] = inside ? heightRaw(x, z) : -0.6;
    pgrid[j * GN + i] = inside ? pathDistRaw(x, z) : 50;
  }
  function sampleGrid(g, x, z) {
    const gx = clamp((x - G0) / GC, 0, GN - 1.001), gz = clamp((z - G0) / GC, 0, GN - 1.001);
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const a = g[iz * GN + ix], b = g[iz * GN + ix + 1], c = g[(iz + 1) * GN + ix], d = g[(iz + 1) * GN + ix + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  }
  isle.heightAt = (x, z) => sampleGrid(hgrid, x, z);
  isle.pathDist = (x, z) => sampleGrid(pgrid, x, z);
  isle.inside = (x, z, margin = 0) => Math.hypot(x, z) < E(Math.atan2(z, x)) - margin;

  // --- terrain mesh ---------------------------------------------------------------
  const RINGS = 30, SEG = 132;
  const V = [];
  for (let i = 0; i <= RINGS; i++) {
    const row = [];
    for (let j = 0; j < SEG; j++) {
      let th = j / SEG * TAU, t = i / RINGS;
      if (i === 0) { row.push([0, heightRaw(0, 0), 0]); continue; }
      if (i < RINGS) { th += (rng() - 0.5) * 0.45 * TAU / SEG; t += (rng() - 0.5) * 0.4 / RINGS; }
      const r = Math.pow(t, 0.92) * E(th);
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      row.push([x, heightRaw(x, z), z]);
    }
    V.push(row);
  }
  const tPos = [], tCol = [];
  const gA = new THREE.Color(pal.grass[0]), gB = new THREE.Color(pal.grass[1]), gC = new THREE.Color(pal.grass[2]);
  const sandC = new THREE.Color(pal.sand), lipC = new THREE.Color(pal.grass[1]).multiplyScalar(0.82);
  const tmpC = new THREE.Color(), hsl = {};
  function groundColor(x, z, out) {
    const r = Math.hypot(x, z), e = E(Math.atan2(z, x));
    if (def.prism) {
      const h = (Math.atan2(z, x) / TAU + r * 0.012 + noise(x * 0.04, z * 0.04) * 0.25 + 1) % 1;
      out.setHSL(h, 0.68, 0.7, THREE.SRGBColorSpace);
    } else {
      const n = noise.fbm(x * 0.055, z * 0.055, 3);
      out.copy(gB).lerp(gA, clamp(n * 1.6 + 0.55, 0, 1));
      const n2 = noise(x * 0.11 + 40, z * 0.11);
      if (n2 > 0.12) out.lerp(gC, clamp((n2 - 0.12) * 3, 0, 0.8));
    }
    for (const p of isle.ponds) { const d = Math.hypot(p.x - x, p.z - z); if (d < p.r + 1.3) out.lerp(sandC, smoothstep(p.r + 1.3, p.r + 0.2, d)); }
    for (const c of isle.channels) {
      const vx = c.bx - c.ax, vz = c.bz - c.az; const t = clamp(((x - c.ax) * vx + (z - c.az) * vz) / (vx * vx + vz * vz), 0, 1);
      const d = Math.hypot(x - c.ax - vx * t, z - c.az - vz * t); if (d < c.w + 1) out.lerp(sandC, smoothstep(c.w + 1, c.w, d));
    }
    if (r / e > 0.955) out.lerp(lipC, 0.5);
    out.getHSL(hsl); out.setHSL(hsl.h, hsl.s, clamp(hsl.l + (rng() - 0.5) * 0.035, 0, 1));
    return out;
  }
  function pushTri(a, b, c, color) {
    // ensure upward-facing winding
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    const ny = uz * vx - ux * vz;
    if (ny < 0) { const t = b; b = c; c = t; }
    tPos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) tCol.push(color.r, color.g, color.b);
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEG; j++) {
      const j2 = (j + 1) % SEG;
      if (i === 0) {
        const a = V[0][0], b = V[1][j], c = V[1][j2];
        pushTri(a, b, c, groundColor((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3, tmpC));
      } else {
        const a = V[i][j], b = V[i + 1][j], c = V[i + 1][j2], d = V[i][j2];
        pushTri(a, b, c, groundColor((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3, tmpC));
        pushTri(a, c, d, groundColor((a[0] + c[0] + d[0]) / 3, (a[2] + c[2] + d[2]) / 3, tmpC));
      }
    }
  }
  const terrGeo = new THREE.BufferGeometry();
  terrGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
  terrGeo.setAttribute('color', new THREE.Float32BufferAttribute(tCol, 3));
  terrGeo.computeVertexNormals();
  const terrMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const terrain = new THREE.Mesh(terrGeo, terrMat);
  terrain.receiveShadow = true;
  group.add(terrain);
  disposables.push(terrGeo, terrMat);
  isle.terrain = terrain;

  // --- underside -----------------------------------------------------------------
  {
    const depthScale = R / 33;
    const layers = [[0, 1], [0.8, 0.99], [2.4, 0.94], [5.2, 0.84], [9, 0.69], [13.5, 0.5], [18.5, 0.32], [24, 0.15]];
    const rows = layers.map(([d, s], li) => {
      const row = [];
      for (let j = 0; j < SEG; j++) {
        const th = j / SEG * TAU;
        if (li === 0) { row.push(V[RINGS][j]); continue; }
        const jit = 1 + (rng() - 0.5) * 0.12 + noise(Math.cos(th) * 2 + li, Math.sin(th) * 2) * 0.15;
        const r = E(th) * s * jit;
        row.push([Math.cos(th) * r, -d * depthScale + (rng() - 0.5) * 0.8, Math.sin(th) * r]);
      }
      return row;
    });
    const tip = [0, -31 * depthScale, 0];
    const uPos = [], uCol = [];
    const cl = pal.cliff.map(c => new THREE.Color(c));
    const bandColor = (li, out) => {
      if (li === 0) out.copy(lipC).multiplyScalar(0.9);
      else out.copy(cl[Math.min(Math.floor((li - 1) * 0.62), 3)]);
      out.getHSL(hsl); return out.setHSL(hsl.h, hsl.s, clamp(hsl.l + (rng() - 0.5) * 0.06, 0, 1));
    };
    const pushOut = (a, b, c, col) => {
      const cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
      if (nx * cx + nz * cz < 0) { const t = b; b = c; c = t; }
      uPos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) uCol.push(col.r, col.g, col.b);
    };
    for (let li = 0; li < rows.length - 1; li++) {
      for (let j = 0; j < SEG; j++) {
        const j2 = (j + 1) % SEG;
        const a = rows[li][j], b = rows[li + 1][j], c = rows[li + 1][j2], d = rows[li][j2];
        pushOut(a, b, c, bandColor(li, tmpC));
        pushOut(a, c, d, bandColor(li, tmpC));
      }
    }
    const last = rows[rows.length - 1];
    for (let j = 0; j < SEG; j++) pushOut(last[j], tip, last[(j + 1) % SEG], bandColor(rows.length, tmpC));
    const ug = new THREE.BufferGeometry();
    ug.setAttribute('position', new THREE.Float32BufferAttribute(uPos, 3));
    ug.setAttribute('color', new THREE.Float32BufferAttribute(uCol, 3));
    ug.computeVertexNormals();
    const um = new THREE.Mesh(ug, MAT.solid);
    um.receiveShadow = true;
    group.add(um);
    disposables.push(ug);
  }

  // --- paths + plaza ---------------------------------------------------------------
  {
    const pPos = [], pCol = [];
    const pc = new THREE.Color(pal.path), edgeC = new THREE.Color(pal.path).lerp(new THREE.Color(pal.grass[1]), 0.45);
    const quad = (a, b, c, d, col) => {
      pPos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) pCol.push(col.r, col.g, col.b);
    };
    isle.paths.forEach(path => {
      const P = path.pts, n = P.length;
      const L = [], Rr = [], L2 = [], R2 = [];
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const nx = -tz, nz = tx;
        const f = i / (n - 1);
        const w = 1.15 + 0.14 * noise(i * 0.18, path.k * 3.3) + smoothstep(0.85, 1, f) * 0.5 + smoothstep(0.08, 0, f) * 0.6;
        const y = isle.heightAt(P[i].x, P[i].z) + 0.045;
        L.push([P[i].x + nx * w, y, P[i].z + nz * w]); Rr.push([P[i].x - nx * w, y, P[i].z - nz * w]);
        L2.push([P[i].x + nx * (w + 0.32), y - 0.012, P[i].z + nz * (w + 0.32)]); R2.push([P[i].x - nx * (w + 0.32), y - 0.012, P[i].z - nz * (w + 0.32)]);
      }
      for (let i = 0; i < n - 1; i++) {
        tmpC.copy(pc); tmpC.getHSL(hsl); tmpC.setHSL(hsl.h, hsl.s, clamp(hsl.l + (rng() - 0.5) * 0.03, 0, 1));
        quad(L[i], L[i + 1], Rr[i + 1], Rr[i], tmpC);
        quad(L2[i], L2[i + 1], L[i + 1], L[i], edgeC);
        quad(Rr[i], Rr[i + 1], R2[i + 1], R2[i], edgeC);
      }
    });
    // plaza ring
    const PS = 40;
    const pr = j => 5.9 + Math.sin(j * 1.7) * 0.18 + noise(j * 0.4, 7) * 0.4;
    for (let j = 0; j < PS; j++) {
      const a1 = j / PS * TAU, a2 = (j + 1) / PS * TAU;
      const r1 = pr(j), r2 = pr((j + 1) % PS);
      const y = isle.heightAt(0, 0) + 0.05;
      const c0 = [0, y, 0], p1 = [Math.cos(a1) * r1, y, Math.sin(a1) * r1], p2 = [Math.cos(a2) * r2, y, Math.sin(a2) * r2];
      const e1 = [Math.cos(a1) * (r1 + 0.35), y - 0.012, Math.sin(a1) * (r1 + 0.35)], e2 = [Math.cos(a2) * (r2 + 0.35), y - 0.012, Math.sin(a2) * (r2 + 0.35)];
      tmpC.copy(pc).multiplyScalar(j % 2 ? 1 : 0.97);
      pPos.push(...c0, ...p2, ...p1); for (let k = 0; k < 3; k++) pCol.push(tmpC.r, tmpC.g, tmpC.b);
      pPos.push(...p1, ...p2, ...e2, ...p1, ...e2, ...e1); for (let k = 0; k < 6; k++) pCol.push(edgeC.r, edgeC.g, edgeC.b);
    }
    // fix winding so every triangle faces up
    for (let i = 0; i < pPos.length; i += 9) {
      const ux = pPos[i + 3] - pPos[i], uz = pPos[i + 5] - pPos[i + 2], vx = pPos[i + 6] - pPos[i], vz = pPos[i + 8] - pPos[i + 2];
      if (uz * vx - ux * vz < 0) {
        for (let k = 0; k < 3; k++) { const t = pPos[i + 3 + k]; pPos[i + 3 + k] = pPos[i + 6 + k]; pPos[i + 6 + k] = t; }
      }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
    pg.setAttribute('color', new THREE.Float32BufferAttribute(pCol, 3));
    pg.computeVertexNormals();
    const pm = new THREE.Mesh(pg, MAT.solid);
    pm.receiveShadow = true;
    group.add(pm);
    disposables.push(pg);
  }

  // --- water ------------------------------------------------------------------------
  const waterMat = makeWaterMat(pal);
  isle.waterMats.push(waterMat);
  disposables.push(waterMat);
  isle.ponds.forEach(p => {
    const g = new THREE.CircleGeometry(p.r + 0.35, 20);
    const pos = g.attributes.position;
    for (let i = 1; i < pos.count; i++) { const k = 1 + (rng() - 0.5) * 0.08; pos.setX(i, pos.getX(i) * k); pos.setY(i, pos.getY(i) * k); }
    const m = new THREE.Mesh(g, waterMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, -0.2, p.z);
    m.renderOrder = 2;
    group.add(m);
    disposables.push(g);
  });
  const fallMat = makeFallMat(pal);
  isle.fallMats.push(fallMat);
  disposables.push(fallMat);
  isle.falls = [];
  isle.channels.forEach((c, idx) => {
    // flat channel from spring to edge
    const dx = c.bx - c.ax, dz = c.bz - c.az, l = Math.hypot(dx, dz);
    const cg = new THREE.PlaneGeometry(c.w * 2, l, 1, 1);
    const cm = new THREE.Mesh(cg, waterMat);
    cm.rotation.x = -Math.PI / 2;
    cm.rotation.z = -Math.atan2(dx, dz) + Math.PI;
    cm.position.set((c.ax + c.bx) / 2, -0.21, (c.az + c.bz) / 2);
    cm.renderOrder = 2;
    group.add(cm);
    disposables.push(cg);
    // falling ribbon
    const ox = dx / l, oz = dz / l, nx = -oz, nz = ox;
    const fp = [], fu = [], fi = [];
    const STEPS = 26;
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS;
      const out = 0.2 + 2.2 * Math.sqrt(t), y = -0.2 - t * 48 - t * t * 8;
      const w = c.w * (1 + t * 1.6);
      const cx = c.bx + ox * out, cz = c.bz + oz * out;
      fp.push(cx + nx * w, y, cz + nz * w, cx - nx * w, y, cz - nz * w);
      fu.push(0, t, 1, t);
      if (s < STEPS) { const b = s * 2; fi.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    fg.setIndex(fi);
    const fm = new THREE.Mesh(fg, fallMat);
    fm.renderOrder = 3;
    group.add(fm);
    disposables.push(fg);
    isle.falls.push({ x: c.bx + ox * 0.6, z: c.bz + oz * 0.6, ox, oz });
  });

  // --- rifts --------------------------------------------------------------------------
  isle.paths.forEach(path => {
    const p = path.pts[0];
    const rot = Math.atan2(-p.x, -p.z);
    isle.rifts.push({ x: p.x, z: p.z, rot, path: path.k });
  });

  // --- decoration ------------------------------------------------------------------
  const blocked = (x, z, rad, extra = {}) => {
    const r = Math.hypot(x, z);
    if (r > E(Math.atan2(z, x)) - (extra.edge ?? 1.4)) return true;
    if (r < (extra.heart ?? 8.5)) return true;
    if (isle.pathDist(x, z) < (extra.path ?? 2.5)) return true;
    for (const s of spots) if (Math.hypot(s.x - x, s.z - z) < s.rad + rad + (extra.plot ?? 1.8)) return true;
    for (const p of isle.ponds) if (Math.hypot(p.x - x, p.z - z) < p.r + rad + 0.6) return true;
    for (const c of isle.channels) {
      const vx = c.bx - c.ax, vz = c.bz - c.az; const t = clamp(((x - c.ax) * vx + (z - c.az) * vz) / (vx * vx + vz * vz), 0, 1);
      if (Math.hypot(x - c.ax - vx * t, z - c.az - vz * t) < c.w + rad + 0.4) return true;
    }
    for (const rf of isle.rifts) if (Math.hypot(rf.x - x, rf.z - z) < 4.5) return true;
    return false;
  };
  const treeN = Math.round(R * 2.9);
  const treeClump = makeNoise(def.seed + 5);
  let placed = 0;
  for (let tries = 0; tries < treeN * 30 && placed < treeN; tries++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * R * 1.15;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const rn = r / E(a);
    const want = smoothstep(0.3, 0.85, rn) * 0.85 + 0.08 + treeClump(x * 0.08, z * 0.08) * 0.6;
    if (rng() > want) continue;
    if (blocked(x, z, 0.8)) continue;
    if (isle.colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 1.9)) continue;
    const tr = Models.tree(pick(def.trees, rng), pal, rng);
    tr.position.set(x, isle.heightAt(x, z), z);
    tr.rotation.y = rng() * TAU;
    const s = lerp(0.85, 1.2, rng());
    tr.scale.setScalar(s);
    group.add(tr);
    const cr = (tr.userData.radius || 0.45) * s;
    isle.colliders.push({ x, z, r: cr + 0.25, kind: 'tree' });
    tr.userData.clickKind = 'tree';
    tr.userData.baseScale = s;
    isle.clickables.push(tr);
    isle.trees.push(tr);
    if (tr.userData.canopy) isle.sways.push({ o: tr.userData.canopy, ph: rng() * TAU, amp: 0.025 + rng() * 0.025 });
    placed++;
  }
  const decoN = Math.round(R * 1.9);
  placed = 0;
  for (let tries = 0; tries < decoN * 30 && placed < decoN; tries++) {
    const a = rng() * TAU, r = Math.sqrt(rng()) * R * 1.1;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blocked(x, z, 0.5, { path: 1.9, heart: 7, plot: 1.2 })) continue;
    if (isle.colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 0.9)) continue;
    const kind = pick(def.deco, rng);
    const d = Models.deco(kind, pal, rng);
    d.position.set(x, isle.heightAt(x, z), z);
    d.rotation.y = rng() * TAU;
    group.add(d);
    const cr = d.userData.radius || 0;
    if (cr > 0.25) isle.colliders.push({ x, z, r: cr + 0.2, kind: 'rock' });
    d.userData.clickKind = kind;
    d.userData.baseScale = 1;
    isle.clickables.push(d);
    placed++;
  }
  // stones around the plaza
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + 0.3;
    const x = Math.cos(a) * 6.9, z = Math.sin(a) * 6.9;
    if (isle.pathDist(x, z) < 1.8) continue;
    const d = Models.deco('rock', pal, rng);
    d.scale.setScalar(0.45);
    d.position.set(x, isle.heightAt(x, z), z);
    group.add(d);
  }

  // --- grass (instanced) ---------------------------------------------------------------
  {
    const G = SAVE.settings.quality === 'low' ? 1400 : 3200;
    const geo = Models.grassGeo();
    const im = new THREE.InstancedMesh(geo, grassMat, G);
    im.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let tries = 0; tries < G * 6 && n < G; tries++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * R * 1.1;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!isle.inside(x, z, 0.6)) continue;
      if (isle.pathDist(x, z) < 1.55) continue;
      if (Math.hypot(x, z) < 6.4) continue;
      if (isle.ponds.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 0.4)) continue;
      const s = lerp(0.7, 1.35, rng());
      ps.set(x, isle.heightAt(x, z) - 0.02, z); q.setFromAxisAngle(ax, rng() * TAU); sc.set(s, s * lerp(0.8, 1.3, rng()), s);
      m4.compose(ps, q, sc); im.setMatrixAt(n, m4);
      groundColor(x, z, tmpC); tmpC.multiplyScalar(lerp(0.95, 1.18, rng()));
      im.setColorAt(n, tmpC);
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.frustumCulled = false;
    group.add(im);
  }

  // --- flowers (instanced, musical) ------------------------------------------------------
  {
    const { stem, petals } = Models.flowerGeos();
    const F = SAVE.settings.quality === 'low' ? 700 : 1300;
    const stemIM = new THREE.InstancedMesh(stem, flowerMat, F);
    const petIM = new THREE.InstancedMesh(petals, flowerMat, F);
    stemIM.receiveShadow = petIM.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
    const fc = pal.flower.map(h => new THREE.Color(h));
    const green = new THREE.Color(1, 1, 1);
    let n = 0;
    const patches = [];
    for (let tries = 0; tries < 400 && patches.length < Math.round(R * 0.7); tries++) {
      const a = rng() * TAU, r = lerp(8, R * 0.95, Math.sqrt(rng()));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (blocked(x, z, 1.5, { path: 2.2, heart: 7, plot: 0.5 })) continue;
      patches.push({ x, z, r: lerp(1.8, 3.6, rng()), c: Math.floor(rng() * fc.length) });
    }
    const addFlower = (x, z, ci) => {
      if (n >= F) return;
      if (!isle.inside(x, z, 0.8) || isle.pathDist(x, z) < 1.5 || Math.hypot(x, z) < 6.5) return;
      if (isle.ponds.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 0.5)) return;
      const s = lerp(0.85, 1.3, rng());
      const rot = rng() * TAU;
      ps.set(x, isle.heightAt(x, z) - 0.02, z); q.setFromAxisAngle(ax, rot); sc.setScalar(s);
      m4.compose(ps, q, sc);
      stemIM.setMatrixAt(n, m4); petIM.setMatrixAt(n, m4);
      stemIM.setColorAt(n, green);
      petIM.setColorAt(n, fc[ci]);
      isle.flowers.push({ i: n, x, z, y: ps.y, s, rot, ci, t: -10, bounce: 0 });
      n++;
    };
    patches.forEach(p => {
      const cnt = Math.round(p.r * p.r * 3.2);
      for (let k = 0; k < cnt; k++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * p.r;
        addFlower(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, rng() < 0.75 ? p.c : Math.floor(rng() * fc.length));
      }
    });
    for (let k = 0; k < 260; k++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * R;
      addFlower(Math.cos(a) * r, Math.sin(a) * r, Math.floor(rng() * fc.length));
    }
    stemIM.count = petIM.count = n;
    stemIM.instanceMatrix.needsUpdate = petIM.instanceMatrix.needsUpdate = true;
    stemIM.frustumCulled = petIM.frustumCulled = false;
    group.add(stemIM, petIM);
    isle.flowerMeshes = { stem: stemIM, pet: petIM };
    // spatial hash
    const cell = 2;
    isle.flowerGrid = new Map();
    isle.flowers.forEach(f => {
      const key = Math.floor(f.x / cell) + ',' + Math.floor(f.z / cell);
      if (!isle.flowerGrid.has(key)) isle.flowerGrid.set(key, []);
      isle.flowerGrid.get(key).push(f);
    });
    isle.flowerCell = cell;
  }

  // --- pebbles along paths -------------------------------------------------------------
  {
    const pg = new THREE.DodecahedronGeometry(0.16, 0);
    const im = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ flatShading: true }), 600);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const rc = pal.rock.map(h => new THREE.Color(h).lerp(new THREE.Color(0xffffff), 0.2));
    let n = 0;
    isle.paths.forEach(path => {
      for (let i = 2; i < path.pts.length - 2 && n < 600; i += 2) {
        if (rng() < 0.35) continue;
        const a = path.pts[i - 1], b = path.pts[i + 1];
        let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1;
        const side = rng() < 0.5 ? -1 : 1, off = 1.45 + rng() * 0.35;
        const x = path.pts[i].x - tz / l * off * side, z = path.pts[i].z + tx / l * off * side;
        const s = lerp(0.6, 1.5, rng());
        ps.set(x, isle.heightAt(x, z) + 0.04, z); q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3)); sc.set(s, s * 0.6, s);
        m4.compose(ps, q, sc); im.setMatrixAt(n, m4); im.setColorAt(n, pick(rc, rng)); n++;
      }
    });
    im.count = n;
    im.castShadow = false; im.receiveShadow = true;
    group.add(im);
    disposables.push(pg, im.material);
  }

  // --- ambient: clouds + islets (per island palette) --------------------------------------
  clouds.forEach(c => ambientGroup.remove(c.o)); clouds.length = 0;
  islets.forEach(c => ambientGroup.remove(c.o)); islets.length = 0;
  for (let i = 0; i < 34; i++) {
    const c = Models.cloud(rng);
    const a = rng() * TAU, r = lerp(58, 280, Math.pow(rng(), 0.8));
    const y = lerp(-46, 16, rng()) - (r < 90 ? 10 : 0);
    c.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const s = lerp(1.2, 3.4, rng()) * (r > 150 ? 1.6 : 1);
    c.scale.set(s, s * lerp(0.6, 1, rng()), s);
    c.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    ambientGroup.add(c);
    clouds.push({ o: c, a, r, y, sp: lerp(0.004, 0.012, rng()) * (rng() < 0.5 ? 1 : -1), bob: rng() * TAU });
  }
  for (let i = 0; i < 9; i++) {
    const o = Models.islandRock(pal, rng);
    const a = i / 9 * TAU + rng() * 0.5, r = lerp(95, 230, rng());
    const y = lerp(-26, 12, rng());
    o.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    o.scale.setScalar(lerp(1.2, 2.6, rng()));
    o.rotation.y = rng() * TAU;
    o.traverse(m => { if (m.isMesh) { m.castShadow = false; } });
    ambientGroup.add(o);
    islets.push({ o, y, ph: rng() * TAU });
  }

  isle.dispose = () => {
    disposables.forEach(d => d.dispose && d.dispose());
    scene.remove(group);
  };
  isle.update = (dt, time) => {
    isle.waterMats.forEach(m => { m.uniforms.uTime.value = time; });
    isle.fallMats.forEach(m => { m.uniforms.uTime.value = time; });
    for (let i = 0; i < isle.sways.length; i++) {
      const s = isle.sways[i];
      s.o.rotation.z = Math.sin(time * 0.9 + s.ph) * s.amp;
      s.o.rotation.x = Math.cos(time * 0.7 + s.ph * 1.3) * s.amp * 0.7;
    }
  };
  isle.setLight = (col, night) => {
    isle.waterMats.forEach(m => { m.uniforms.uLight.value.copy(col); m.uniforms.uNight.value = night; });
    isle.fallMats.forEach(m => { m.uniforms.uLight.value.copy(col); m.uniforms.uNight.value = night; });
  };
  scene.add(group);
  return isle;
}

function updateAmbient(dt, time) {
  for (const c of clouds) {
    c.a += c.sp * dt;
    c.o.position.set(Math.cos(c.a) * c.r, c.y + Math.sin(time * 0.2 + c.bob) * 1.2, Math.sin(c.a) * c.r);
  }
  for (const s of islets) s.o.position.y = s.y + Math.sin(time * 0.25 + s.ph) * 1.6;
  skyU.uTime.value = time;
  seaU.uTime.value = time;
  seaU.uCam.value.copy(camera.position);
  auroraU.uTime.value = time;
  windU.uTime.value = time;
  sky.position.copy(camera.position);
  aurora.position.set(camera.position.x, 0, camera.position.z);
  cloudSea.position.x = camera.position.x; cloudSea.position.z = camera.position.z;
}
