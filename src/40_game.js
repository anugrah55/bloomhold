
// ============================================================================
// Camera
// ============================================================================
const Cam = {
  mode: 'title', zoom: 40, shakeAmt: 0,
  cur: { dist: 95, el: 0.32, az: 0.9, tx: 0, ty: 2, tz: 0 },
  shake(a) { if (SAVE.settings.shake && !SAVE.settings.calm) this.shakeAmt = Math.max(this.shakeAmt, a); },
  peek: 0,
  swoop() { this.cur.dist = 170; this.cur.el = 1.2; },
  update(dt, time) {
    const c = this.cur;
    let d, el, az, tx, ty, tz, lam;
    if (this.mode === 'game') {
      const P = Player;
      d = this.zoom * (camera.aspect < 1 ? 1.3 : 1); el = 0.8; az = 0; lam = 4;
      tx = P.pos.x + P.vel.x * 0.16; ty = P.pos.y + 0.8; tz = P.pos.z + P.vel.z * 0.16;
      this.peek = damp(this.peek, Input.down('Tab') || Input.pad.peek ? 1 : 0, 6, dt);
      if (this.peek > 0.001) { d = lerp(d, 105 * (camera.aspect < 1 ? 1.5 : 1), this.peek); el = lerp(el, 1.15, this.peek); tx = lerp(tx, 0, this.peek); tz = lerp(tz, 4, this.peek); ty = lerp(ty, 0, this.peek); }
    } else {
      // slow orbit for the title screen and vibe mode
      c.az += dt * (this.mode === 'vibe' ? 0.045 * (0.4 + VIBE.speed * 0.3) : 0.03) * (SAVE.settings.calm ? 0.5 : 1);
      az = c.az;
      const title = this.mode === 'title';
      d = (title ? 88 : 74) + Math.sin(time * 0.045) * 14;
      el = (title ? 0.26 : 0.3) + Math.sin(time * 0.033) * 0.1;
      const rx = Math.cos(az), rz = -Math.sin(az);
      const off = title && innerWidth > 760 ? -16 : 0;
      tx = rx * off; ty = title ? 4 : 2 + Math.sin(time * 0.05) * 2; tz = rz * off;
      lam = 0.7;
    }
    c.dist = damp(c.dist, d, lam * 0.8, dt);
    c.el = damp(c.el, el, lam * 0.8, dt);
    c.az = this.mode === 'game' ? angleLerp(c.az, az, 1 - Math.exp(-lam * 0.6 * dt)) : az;
    c.tx = damp(c.tx, tx, lam, dt); c.ty = damp(c.ty, ty, lam, dt); c.tz = damp(c.tz, tz, lam, dt);
    this.shakeAmt = damp(this.shakeAmt, 0, 5, dt);
    const sh = this.shakeAmt;
    const ce = Math.cos(c.el);
    camera.position.set(
      c.tx + Math.sin(c.az) * ce * c.dist + (Math.random() - 0.5) * sh,
      c.ty + Math.sin(c.el) * c.dist + (Math.random() - 0.5) * sh,
      c.tz + Math.cos(c.az) * ce * c.dist + (Math.random() - 0.5) * sh);
    camera.lookAt(c.tx, c.ty, c.tz);
    gradePass.uniforms.focus.value = this.mode === 'game' ? 0.5 : 0.56;
    gradePass.uniforms.tilt.value = SAVE.settings.tilt * (this.mode === 'game' ? 1 : 0.55) * (1 - this.peek * 0.8);
  },
};

const VIBE = { speed: 1, hour: 12, t: 0, idleT: 0 };

// ============================================================================
// Achievements
// ============================================================================
function Achieve(id) {
  if (SAVE.ach[id]) return;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  SAVE.ach[id] = Date.now();
  UI.toast(`<b>${a.name}</b>${a.desc}`, true);
  AudioEngine.play('achievement');
  saveSoon();
}

// ============================================================================
// UI
// ============================================================================
const $ = id => document.getElementById(id);
const UI = {
  modal: null, touchDash: false, touchBurst: false, hudHidden: false, labelPool: [], cache: {},
  init() {
    this.isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    if (this.isTouch) $('app').classList.add('touch');
    $('btnPlay').onclick = () => { click(); Game.start(); };
    $('btnTitleMap').onclick = () => { click(); this.openMap(); };
    $('btnTitleVibe').onclick = () => { click(); Game.start(true); };
    $('btnTitleSettings').onclick = () => { click(); this.openMenu('settings'); };
    $('btnVibe').onclick = () => { click(); Game.toggleVibe(); };
    $('btnMap').onclick = () => { click(); this.openMap(); };
    $('btnMenu').onclick = () => { click(); this.openMenu('settings'); };
    $('btnSound').onclick = () => { click(); SAVE.settings.muted = !SAVE.settings.muted; applyAudioSettings(); saveSoon(); };
    $('nightBtn').onclick = () => { click(); if (G.state === 'day') Game.requestNight(); else if (G.state === 'night' && G.mode === 'zen') Game.endNight(true); };
    $('btnFull').onclick = () => { click(); toggleFullscreen(); };
    $('vibeExit').onclick = () => { click(); Game.toggleVibe(false); };
    $('vibeSpeed').oninput = e => { VIBE.speed = +e.target.value; setFill(e.target); };
    setFill($('vibeSpeed'));
    document.querySelectorAll('#vibeHue button').forEach(b => b.onclick = () => { click(); SAVE.settings.hue = +b.dataset.v; this.syncSegs(); saveSoon(); });
    document.querySelectorAll('#titleMode button').forEach(b => b.onclick = () => { click(); setMode(b.dataset.v); });
    // touch buttons
    const hold = (el, on, off) => { el.addEventListener('pointerdown', e => { e.preventDefault(); on(); }); ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, off)); };
    hold($('tBuild'), () => { Input.buildHeld = true; UI.promptTapped = true; }, () => { Input.buildHeld = false; });
    hold($('tDash'), () => { this.touchDash = true; }, () => {});
    hold($('tBurst'), () => { this.touchBurst = true; }, () => {});
    Edges.init();
    $('app').classList.toggle('bigtext', !!SAVE.settings.bigText);
    const pr = $('prompt');
    pr.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); Input.buildHeld = true; UI.promptTapped = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => pr.addEventListener(ev, () => { Input.buildHeld = false; }));
    Input.onPad = () => this.toast('Controller ready. Stick to ride, <b>A</b> builds, <b>X</b> bursts, <b>Y</b> calls the night');
    // labels pool
    for (let i = 0; i < 40; i++) { const d = document.createElement('div'); d.className = 'plabel'; d.style.opacity = 0; $('labels').appendChild(d); this.labelPool.push({ el: d, html: '', vis: false }); }
    this.sparks(G.sparks, true);
    this.syncSegs();
    this.syncTitle();
    applyAudioSettings();
  },
  syncSegs() {
    document.querySelectorAll('#vibeHue button').forEach(b => b.classList.toggle('on', +b.dataset.v === SAVE.settings.hue));
    document.querySelectorAll('#titleMode button').forEach(b => b.classList.toggle('on', b.dataset.v === SAVE.settings.mode));
    const chip = $('modeChip');
    chip.textContent = G.mode === 'zen' ? 'Zen' : 'Bloom';
    chip.classList.toggle('zen', G.mode === 'zen');
    $('btnSound').classList.toggle('off', SAVE.settings.muted);
  },
  syncTitle() {
    const s = G.isleSave;
    $('playSub').textContent = `${ISLANDS[G.isleIdx].name} · ${s.nights ? 'Night ' + (s.nights + 1) + ' ahead' : 'A fresh start'}`;
    $('isleName').textContent = ISLANDS[G.isleIdx].name;
    this.dayLabel();
  },
  dayLabel() {
    const s = G.isleSave;
    const label = G.state === 'night' || G.state === 'dusk' ? `Night ${G.nightNum}` : `Day ${s.nights + 1}`;
    if (this.cache.day !== label) { this.cache.day = label; $('dayLabel').textContent = label; }
  },
  sparks(n, silent) {
    const el = $('sparkCount');
    if (!el) return;
    el.textContent = n;
    if (!silent) { const p = $('sparks'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
  },
  deny() { const p = $('sparks'); p.classList.remove('deny'); void p.offsetWidth; p.classList.add('deny'); },
  toast(html, ach) {
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = 'toast pill';
    t.innerHTML = (ach ? '<i class="gem"></i>' : '') + '<span>' + html + '</span>';
    if (ach) t.querySelector('span').innerHTML = html.replace('</b>', '</b>&nbsp;·&nbsp;');
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => t.classList.add('out'), 3400);
    setTimeout(() => t.remove(), 3950);
  },
  banner(big, small) {
    const b = $('banner');
    $('bannerBig').textContent = big; $('bannerSmall').textContent = small || '';
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  },
  showHUD(v) { $('hud').classList.toggle('gone', !v || this.hudHidden); },
  setPrompt(p) {
    const el = $('prompt');
    if (!p) { if (!el.classList.contains('hide')) el.classList.add('hide'); this.cache.prompt = ''; return; }
    el.classList.remove('hide');
    const key = p.title + '|' + p.desc + '|' + p.pips + '|' + p.paid + '|' + p.key + '|' + p.poor;
    if (this.cache.prompt !== key) {
      this.cache.prompt = key;
      $('pTitle').innerHTML = p.title;
      $('pDesc').textContent = p.desc;
      const pips = $('pPips');
      if (p.pips) { let h = ''; for (let i = 0; i < p.pips; i++) h += `<i class="${i < p.paid ? 'on' : ''}"></i>`; pips.innerHTML = h; pips.hidden = false; }
      else { pips.innerHTML = ''; pips.hidden = true; }
      $('pKey').innerHTML = p.key;
      el.classList.toggle('poor', !!p.poor);
    }
    $('pRing').hidden = p.ring === undefined;
    if (p.ring !== undefined) $('pRingFill').style.width = (p.ring * 100).toFixed(1) + '%';
  },
  labels(list) {
    const pool = this.labelPool;
    for (let i = 0; i < pool.length; i++) {
      const L = pool[i], it = list[i];
      if (!it) { if (L.vis) { L.el.style.opacity = 0; L.vis = false; } continue; }
      _v1.set(it.x, it.y, it.z).project(camera);
      if (_v1.z > 1) { if (L.vis) { L.el.style.opacity = 0; L.vis = false; } continue; }
      const sx = (_v1.x + 1) / 2 * innerWidth, sy = (1 - _v1.y) / 2 * innerHeight;
      L.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
      if (L.html !== it.html) { L.html = it.html; L.el.innerHTML = it.html; }
      const cls = 'plabel' + (it.cls ? ' ' + it.cls : '');
      if (L.el.className !== cls) L.el.className = cls;
      if (!L.vis || L.op !== it.op) { L.el.style.opacity = it.op ?? 1; L.vis = true; L.op = it.op; }
    }
  },
  closeModal() { $('panels').innerHTML = ''; this.modal = null; },
  openPanel(name, html) {
    this.modal = name;
    $('panels').innerHTML = `<div class="panelwrap" id="pw"><div class="panel" role="dialog" aria-modal="true">${html}</div></div>`;
    $('pw').addEventListener('pointerdown', e => { if (e.target.id === 'pw') { click(); this.closeModal(); } });
  },
  openMap() {
    if (G.state === 'night' || G.state === 'dusk') { this.toast('The map opens again at dawn.'); return; }
    const cards = ISLANDS.map((d, i) => {
      const s = SAVE.islands[d.id];
      const locked = !s.unlocked;
      const here = i === G.isleIdx;
      const p = d.pal;
      const hex = h => '#' + h.toString(16).padStart(6, '0');
      const g = d.prism ? 'linear-gradient(90deg,#ff9ad5,#ffe08a,#9affc1,#9ad5ff,#d59aff)' : `linear-gradient(135deg,${hex(p.grass[2])},${hex(p.grass[0])})`;
      const sky = `linear-gradient(180deg,${hex(p.leaf[1])}55,${hex(p.water)}66)`;
      const need = i > 0 ? `${NIGHTS_TO_UNLOCK} nights on ${ISLANDS[i - 1].name}` : '';
      const nn = `${s.nights} night${s.nights === 1 ? '' : 's'}`;
      const status = locked ? `Locked · ${need}` : here ? `You are here · ${nn}` : `${nn} · Sail here`;
      return `<button class="isle ${locked ? 'locked' : ''} ${here ? 'here' : ''}" data-i="${i}" ${locked ? 'disabled' : ''}>
        <div class="art" style="background:${sky};--g:${g};--c1:${hex(p.cliff[0])};--c2:${hex(p.cliff[1])};--c3:${hex(p.cliff[3])}"></div>
        <div class="meta"><span class="nm">${d.name}</span><span class="bl">${d.blurb}</span><span class="st">${status}</span></div></button>`;
    }).join('');
    this.openPanel('map', `<h2>The Archipelago</h2><p class="lede">Each island keeps its own kingdom and sparks. See ${NIGHTS_TO_UNLOCK} nights through to reveal the next one.</p>
      <div class="isles">${cards}</div><div class="btnrow"><button class="btn ghost" id="mapClose">Close</button></div>`);
    $('mapClose').onclick = () => { click(); this.closeModal(); };
    document.querySelectorAll('.isle').forEach(b => b.onclick = () => { if (b.disabled) return; click(); Game.travel(+b.dataset.i); });
  },
  openMenu(tab = 'settings') {
    const S = SAVE.settings;
    const tabs = ['settings', 'journal', 'controls'].map(t => `<button class="tab ${t === tab ? 'on' : ''}" data-t="${t}">${{ settings: 'Settings', journal: 'Journal', controls: 'Controls' }[t]}</button>`).join('');
    let body = '';
    if (tab === 'settings') {
      const slider = (id, label, v, min = 0, max = 1, step = 0.05) => `<div class="row"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="v" id="${id}V">${Math.round(v / max * 100)}%</span></div>`;
      const seg = (id, label, opts, val) => `<div class="row"><span>${label}</span><div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(val) ? 'on' : ''}">${l}</button>`).join('')}</div><span></span></div>`;
      const group = (title, rows) => `<section class="sgroup"><h3>${title}</h3><div class="rows">${rows}</div></section>`;
      body = `<div class="sgrid">
        ${group('Play', `
          ${seg('sMode', 'Mode', [['bloom', 'Bloom'], ['zen', 'Zen']], S.mode)}
          ${seg('sPace', 'Night pace', [['normal', 'Normal'], ['gentle', 'Gentle']], S.pace)}
          ${seg('sBuild', 'Paying sparks', [['hold', 'Hold'], ['tap', 'Tap once']], S.buildMode)}
          ${seg('sTips', 'Guide tips', [['1', 'On'], ['0', 'Off']], S.tips ? '1' : '0')}`)}
        ${group('Sound', `
          ${slider('sMusic', 'Music', S.music)}
          ${slider('sSfx', 'Sounds', S.sfx)}`)}
        ${group('Look', `
          ${slider('sBloom', 'Glow', S.bloom, 0, 1.6, 0.05)}
          ${slider('sTilt', 'Miniature blur', S.tilt, 0, 1.5, 0.05)}
          ${seg('sHue', 'Hue drift', [[0, 'Still'], [1, 'Drift'], [2, 'Wild']], S.hue)}
          ${seg('sQual', 'Quality', [['high', 'Lush'], ['low', 'Light']], S.quality)}`)}
        ${group('Comfort', `
          ${seg('sCalm', 'Reduce motion', [['0', 'Off'], ['1', 'On']], S.calm ? '1' : '0')}
          ${seg('sShake', 'Screen shake', [['1', 'On'], ['0', 'Off']], S.shake ? '1' : '0')}
          ${seg('sText', 'Text size', [['0', 'Normal'], ['1', 'Large']], S.bigText ? '1' : '0')}`)}
      </div>
      <div class="btnrow"><button class="btn" id="mClose">${G.state === 'title' ? 'Done' : 'Resume'}</button>${G.state !== 'title' ? '<button class="btn ghost" id="mTitle">Title screen</button>' : ''}<button class="btn warn" id="mReset">Reset all progress</button></div>`;
    } else if (tab === 'journal') {
      const st = SAVE.stats;
      const stat = (v, l) => `<div class="stat"><b>${Number(Math.floor(v)).toLocaleString()}</b><span>${l}</span></div>`;
      body = `<div class="stats">${stat(st.healed, 'Gloom painted')}${stat(st.nights, 'Nights seen')}${stat(st.built, 'Things built')}${stat(st.flowers, 'Flowers rung')}${stat(st.wishes, 'Wishes caught')}${stat(st.fireflies, 'Fireflies')}</div>
        <div class="achs">${ACHIEVEMENTS.map(a => `<div class="ach ${SAVE.ach[a.id] ? 'got' : ''}"><i class="gem"></i><div><b>${a.name}</b><span>${a.desc}</span></div></div>`).join('')}</div>
        <div class="btnrow"><button class="btn" id="mClose">${G.state === 'title' ? 'Done' : 'Resume'}</button></div>`;
    } else {
      body = `<div class="keys">
        <kbd>WASD</kbd><span><b>Ride.</b> Arrow keys work too.</span>
        <kbd>Space</kbd><span><b>Hold on a glowing plot</b> to pay sparks and build. Hold at the Heart to call the night.</span>
        <kbd>Shift</kbd><span><b>Dash</b> for a quick burst of speed.</span>
        <kbd>E</kbd><span><b>Bloom Burst</b> paints every Gloom nearby and rings the flowers around you.</span>
        <kbd>Combo</kbd><span><b>Petal Strike:</b> dash (Shift) through Gloom at night. Paint 5 in a row for <b>Bloom Nova</b>, then press E.</span>
        <kbd>Enter</kbd><span><b>Begin the night</b> from anywhere.</span>
        <kbd>R</kbd><span><b>Mend the kingdom</b> at the Heart. Wrecked buildings stay broken until you restore them.</span>
        <kbd>V</kbd><span><b>Vibe mode.</b> The camera drifts and time flows on its own.</span>
        <kbd>M</kbd><span><b>Islands</b> map.</span>
        <kbd>H</kbd><span><b>Hide the HUD.</b></span>
        <kbd>Tab</kbd><span><b>Hold to peek</b> at the whole island.</span>
        <kbd>F</kbd><span><b>Fullscreen.</b></span>
        <kbd>Click</kbd><span><b>Wobble anything.</b> Catch shooting stars at night for a wish.</span>
        <kbd>Scroll</kbd><span><b>Zoom</b> in and out.</span>
        <kbd>Mouse</kbd><span><b>Click the ground to ride there</b>, or hold the button to steer. Press the build card at the bottom to pay.</span>
        <kbd>Pad</kbd><span><b>Controller:</b> stick rides, A builds, B dashes, X bursts, Y calls the night, RB peeks, triggers zoom, Start pauses, Select toggles vibe mode.</span>
      </div>
      <p class="lede" style="margin-top:18px">In Bloom mode the Gloom can drain buildings grey, but everything regrows at dawn. There is no game over. Zen mode keeps the nights quiet.</p>
      <div class="btnrow"><button class="btn" id="mClose">${G.state === 'title' ? 'Done' : 'Resume'}</button></div>`;
    }
    this.openPanel('menu', `<h2>${G.state === 'title' ? 'Bloomhold' : 'Paused'}</h2><div class="tabs">${tabs}</div>${body}`);
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => { click(); this.openMenu(b.dataset.t); });
    $('mClose').onclick = () => { click(); this.closeModal(); };
    if ($('mTitle')) $('mTitle').onclick = () => { click(); this.closeModal(); Game.toTitle(); };
    if (tab === 'settings') {
      const bindSlider = (id, key, max, fn) => { const el = $(id); setFill(el); el.oninput = () => { S[key] = +el.value; $(id + 'V').textContent = Math.round(S[key] / max * 100) + '%'; setFill(el); fn && fn(); saveSoon(); }; };
      bindSlider('sMusic', 'music', 1, applyAudioSettings);
      bindSlider('sSfx', 'sfx', 1, applyAudioSettings);
      bindSlider('sBloom', 'bloom', 1.6);
      bindSlider('sTilt', 'tilt', 1.5);
      const bindSeg = (id, fn) => document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => { click(); fn(b.dataset.v); document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === b)); saveSoon(); });
      bindSeg('sMode', v => setMode(v));
      bindSeg('sHue', v => { S.hue = +v; this.syncSegs(); });
      bindSeg('sQual', v => { S.quality = v; applyQuality(); });
      bindSeg('sShake', v => { S.shake = v === '1'; });
      bindSeg('sBuild', v => { S.buildMode = v; });
      bindSeg('sPace', v => { S.pace = v; });
      bindSeg('sCalm', v => { S.calm = v === '1'; });
      bindSeg('sText', v => { S.bigText = v === '1'; $('app').classList.toggle('bigtext', S.bigText); });
      bindSeg('sTips', v => { S.tips = v === '1'; if (S.tips && SAVE.guide >= Guide.steps.length) SAVE.guide = 0; });
      let armed = false;
      $('mReset').onclick = () => {
        click();
        if (!armed) { armed = true; $('mReset').textContent = 'Click again to erase everything'; return; }
        SAVE = freshSave(); saveGame(); this.closeModal(); Game.loadIsland(0); Game.toTitle(); this.toast('Progress reset. A fresh meadow awaits.');
      };
    }
  },
};
function toggleFullscreen() {
  const fail = () => UI.toast('Fullscreen is not available in this view.');
  try {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const el = document.documentElement, fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return fail();
    const p = fn.call(el); if (p && p.catch) p.catch(fail);
  } catch (e) { fail(); }
}
// Range preview under the plot you're standing on, before any spark is spent
const RangeRing = (() => {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const g = new THREE.Group(); g.add(m, fill); g.visible = false; g.renderOrder = 3;
  scene.add(g);
  let r = 1;
  return {
    update(dt, time, plot) {
      let want = 0;
      if (plot) {
        const d = BTYPES[plot.type], L = Math.min(plot.level, 2);
        want = plot.type === 'tower' ? d.range[L] : plot.type === 'lantern' || plot.type === 'chime' ? d.radius[L] : plot.type === 'grove' ? 13 : 0;
      }
      if (!want) { g.visible = false; return; }
      r = g.visible ? damp(r, want, 8, dt) : want * 0.6;
      g.visible = true;
      g.position.set(plot.x, plot.y + 0.1, plot.z);
      g.scale.set(r, 1, r);
      const c = _c1.set(G.isle.pal.accent);
      m.material.color.copy(c).multiplyScalar(0.9 + Math.sin(time * 3) * 0.2);
      fill.material.color.copy(c).multiplyScalar(0.12);
    },
  };
})();
function setFill(el) { const p = (el.value - el.min) / (el.max - el.min) * 100; el.style.setProperty('--fill', p + '%'); }
function click() { AudioEngine.play('ui', { vol: 0.6 }); }
function applyAudioSettings() {
  const S = SAVE.settings;
  AudioEngine.setVolumes({ master: S.muted ? 0 : 0.9, music: S.music, sfx: S.sfx });
  if (UI.syncSegs) UI.syncSegs();
}
function applyQuality() {
  const low = SAVE.settings.quality === 'low';
  const size = low ? 1024 : 2048;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  composer.renderTarget1.samples = composer.renderTarget2.samples = low ? 0 : 4;
  composer.renderTarget1.dispose(); composer.renderTarget2.dispose();
  onResize();
}
function setMode(v) {
  SAVE.settings.mode = v; G.mode = v;
  if (v === 'zen') G.enemies.forEach(e => e.alive && e.fade());
  UI.syncSegs(); saveSoon();
}
function currentMood() {
  if (G.state === 'title') return 'menu';
  if (G.vibe) return 'vibe';
  if (G.state === 'night') return G.mode === 'zen' ? 'night' : 'battle';
  if (G.state === 'dusk') return 'dusk';
  if (G.state === 'dawn') return 'dawn';
  return 'day';
}

// ============================================================================
// Onboarding guide: one gentle goal at a time, taught by doing
// ============================================================================
const ICONS = {
  cottage: '<svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>',
  field: '<svg viewBox="0 0 24 24"><path d="M12 20v-8"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6Z"/><path d="M12 14c0-3-2-5-6-5 0 3 2 5 6 5Z"/><path d="M5 20h14"/></svg>',
  tower: '<svg viewBox="0 0 24 24"><path d="M7 20V9h10v11"/><path d="M6 9V5h3v2h2V5h2v2h2V5h3v4"/><path d="M5 20h14"/><circle cx="12" cy="13" r="1.5"/></svg>',
  lantern: '<svg viewBox="0 0 24 24"><path d="M12 3v3"/><path d="M8 8h8l-1 9H9Z"/><path d="M9 20h6"/><path d="M12 11v3"/></svg>',
  hedge: '<svg viewBox="0 0 24 24"><path d="M3 18h18"/><path d="M4 18v-5a3 3 0 0 1 5-2 3 3 0 0 1 6 0 3 3 0 0 1 5 2v5"/></svg>',
  grove: '<svg viewBox="0 0 24 24"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8Z"/></svg>',
  chime: '<svg viewBox="0 0 24 24"><path d="M6 16h12l-2-3V9a4 4 0 0 0-8 0v4Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>',
};
function holdHint(verb, tapAllowed = true) {
  const tap = tapAllowed && SAVE.settings.buildMode === 'tap';
  const how = Input.last === 'pad' ? (tap ? 'Press <kbd>A</kbd>' : 'Hold <kbd>A</kbd>')
    : Input.last === 'touch' ? (tap ? 'Tap here' : 'Hold here')
    : (tap ? 'Press <kbd>Space</kbd>' : 'Hold <kbd>Space</kbd>') + (Input.last === 'mouse' ? (tap ? ' or click here' : ' or hold here') : '');
  return `${how} to ${verb}`;
}
function holdWord() {
  const tap = SAVE.settings.buildMode === 'tap';
  if (Input.last === 'pad') return tap ? 'press A' : 'hold A';
  if (Input.last === 'touch') return tap ? 'tap the build button' : 'hold the build button';
  return tap ? 'press Space' : 'hold Space';
}
const nearestPlot = (type, built = false) => {
  let best = null, bd = 1e9;
  for (const p of G.plots) {
    if (!p.visible || (type && p.type !== type) || (built ? !p.level : p.level)) continue;
    const d = dist2(p.x, p.z, Player.pos.x, Player.pos.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
};
const plotTarget = p => p && { x: p.x, y: p.y, z: p.z, h: p.level ? (p.obj.userData.height || 3) + 1 : 1.6 };
const Guide = {
  beacon: null, shownIdx: -1, dayT: 0,
  steps: [
    { text: () => 'Ride to the glowing ring', target: () => plotTarget(nearestPlot('tower') || nearestPlot()), done: () => !!Game.focus },
    { text: () => `Build a Paint Tower: ${holdWord()}`, target: () => plotTarget(nearestPlot('tower')), done: () => G.plots.some(p => p.type === 'tower' && p.level), skip: () => !nearestPlot('tower') },
    { text: () => 'Build a Cottage. It pays sparks every dawn', target: () => plotTarget(nearestPlot('cottage')), done: () => G.plots.some(p => p.type === 'cottage' && p.level), skip: () => !nearestPlot('cottage') || G.sparks < 3 && !nearestPlot('cottage').paid },
    { text: () => Game.wrecked().length ? (G.sparks > 0 ? 'Mend the wrecked buildings at the Heart' : 'Out of sparks: begin the night to earn more') : `Ride to the Heart and ${holdWord()} to call the night`, target: () => ({ x: 0, y: Heart.y, z: 0, h: 9.5 }), done: () => G.state !== 'day' },
    { text: () => G.mode === 'zen' ? 'A quiet night. Ride through fireflies to collect them' : 'Ride to the Gloom. You and your towers paint them on your own', target: () => { const e = nearestEnemy(Player.pos.x, Player.pos.z, 80); return e && { x: e.x, y: e.y, z: e.z, h: 2.4 }; }, done: () => G.state === 'dawn' || G.state === 'day' },
    { text: () => 'Dawn pays every building. Spend it and keep growing', target: () => null, done: () => G.state === 'day' && Guide.dayT > 8 },
  ],
  current() {
    if (!SAVE.settings.tips || G.state === 'title' || G.vibe) return null;
    return this.steps[SAVE.guide] || null;
  },
  advance() {
    SAVE.guide++;
    AudioEngine.play('achievement', { vol: 0.5 });
    if (SAVE.guide >= this.steps.length) UI.toast("You've got the hang of it. Enjoy the island.");
    saveSoon();
  },
  update(dt, time) {
    if (!this.beacon) {
      this.beacon = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      this.beacon.rotation.x = Math.PI;
      scene.add(this.beacon);
    }
    this.dayT = G.state === 'day' ? this.dayT + dt : 0;
    let s = this.current();
    while (s && s.skip && s.skip()) { SAVE.guide++; s = this.current(); }
    if (s && s.done()) { this.advance(); s = this.current(); }
    const el = $('guide');
    if (!s) { this.beacon.visible = false; if (!el.hidden) el.hidden = true; this.target = null; return; }
    const txt = s.text();
    if (el.hidden) el.hidden = false;
    if (this.shownIdx !== SAVE.guide) { this.shownIdx = SAVE.guide; el.classList.remove('new'); void el.offsetWidth; el.classList.add('new'); }
    if (UI.cache.guide !== txt) { UI.cache.guide = txt; $('guideText').textContent = txt; }
    const t = s.target();
    this.target = t;
    this.beacon.visible = !!t && !(Game.focus && SAVE.guide <= 1);
    if (t) {
      this.beacon.position.set(t.x, t.y + t.h + 0.6 + Math.abs(Math.sin(time * 3.2)) * 0.6, t.z);
      this.beacon.rotation.y = time * 2;
      this.beacon.material.color.set(G.isle.pal.accent).multiplyScalar(1.8);
    }
  },
};

// Off-screen arrows: incoming Gloom, the Heart in trouble, the current goal
const Edges = {
  pool: [],
  init() {
    for (let i = 0; i < 12; i++) {
      const d = document.createElement('div'); d.className = 'edge'; d.innerHTML = '<span class="ar"></span><b></b>';
      $('edges').appendChild(d); this.pool.push({ el: d, ar: d.firstChild, b: d.lastChild, txt: '', cls: '', on: false });
    }
  },
  project(x, y, z) {
    _v1.set(x, y, z).project(camera);
    const sx = (_v1.x + 1) / 2 * innerWidth, sy = (1 - _v1.y) / 2 * innerHeight;
    return { sx, sy, behind: _v1.z > 1 };
  },
  onScreen(p, m = 30) { return !p.behind && p.sx > m && p.sx < innerWidth - m && p.sy > m && p.sy < innerHeight - m; },
  show(list) {
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2;
    const top = 76, bottom = H - (UI.isTouch ? 250 : 96), left = 30, right = W - 30;
    for (let i = 0; i < this.pool.length; i++) {
      const E = this.pool[i], it = list[i];
      if (!it) { if (E.on) { E.el.classList.remove('on'); E.on = false; } continue; }
      let dx = it.sx - cx, dy = it.sy - cy;
      if (it.behind) { dx = -dx; dy = -dy; }
      const ang = Math.atan2(dy, dx);
      const kx = dx > 0 ? (right - cx) / dx : (left - cx) / (dx || -1e-6);
      const ky = dy > 0 ? (bottom - cy) / dy : (top - cy) / (dy || -1e-6);
      const k = Math.min(Math.abs(kx), Math.abs(ky));
      const x = cx + dx * k, y = cy + dy * k;
      E.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      E.ar.style.transform = `rotate(${ang.toFixed(3)}rad)`;
      if (E.txt !== it.text) { E.txt = it.text; E.b.textContent = it.text; }
      const cls = 'edge on ' + it.kind;
      if (E.cls !== cls) { E.cls = cls; E.el.className = cls; }
      E.on = true;
    }
  },
};

// ============================================================================
// Game flow
// ============================================================================
const Game = {
  hour: 8, dayT: 0, phaseT: 0, fromHour: 8, plan: null, waveTotal: 0, healed: 0, nightT: 0, evIdx: 0,
  holdT: 0, holdTick: 0, payT: 0, payN: 0, focus: null, starT: 8, bfT: 1, dimT: -1, travelT: -1, travelIdx: 0, fireN: 0,
  rifts: [], riftVis: [], labelT: 0,

  loadIsland(idx) {
    if (!SAVE.islands[ISLANDS[idx].id].unlocked) idx = 0;
    // tear down
    G.enemies.forEach(e => e.dispose()); G.enemies = [];
    G.sprites.forEach(s => s.dispose()); G.sprites = [];
    G.villagers.forEach(v => v.dispose()); G.villagers = [];
    Birds.clear(); Stars.clear(); Bolts.clear(); Coins.clear(); Confetti.clear(); Sparkles.clear(); Trail.clear(); FlowerBounce.clear();
    Wobbles.length = 0;
    if (G.isle) G.isle.dispose();
    // build
    G.isleIdx = idx; SAVE.current = idx;
    this.mendInflight = 0; this.autoMend = false;
    const def = ISLANDS[idx];
    G.isle = generateIsland(def);
    Heart.init(G.isle, idx);
    const sv = G.isleSave;
    G.plots = G.isle.plotSpots.map(s => new Plot(s, G.isle));
    G.plots.forEach(p => {
      const s = sv.plots[p.id];
      if (s) { p.paid = s.p || 0; if (s.l) p.setLevel(s.l, false); if (s.l && s.w) p.setGrey(true, false); }
      p.setVisible(p.spot.unlock <= sv.nights || p.level > 0, false);
    });
    G.bunnies = Array.from({ length: 8 }, () => new Bunny(G.isle));
    Fish.init(G.isle);
    Butterflies.rebuild(def.pal);
    Fireflies.scatter(G.isle);
    Weather.setKind(def.weather);
    this.rifts = G.isle.rifts.map(r => {
      const o = Models.rift();
      o.position.set(r.x, G.isle.heightAt(r.x, r.z), r.z);
      o.rotation.y = r.rot;
      G.isle.group.add(o);
      const pool = makeGlowPool(new THREE.Color(0x7a4ad8), 4);
      pool.position.set(r.x, G.isle.heightAt(r.x, r.z) + 0.1, r.z);
      G.isle.group.add(pool);
      return { o, pool, s: 0.6 };
    });
    G.nightNum = sv.nights + 1;
    G.mode = SAVE.settings.mode;
    Player.spawnAt(0, 8);
    Cam.cur.tx = 0; Cam.cur.tz = 8;
    this.hour = 8; this.dayT = 0;
    if (G.state !== 'title') G.state = 'day';
    this.plan = this.planNight();
    AudioEngine.setIsland(idx);
    UI.sparks && UI.sparks(G.sparks, true);
    if (UI.syncTitle && $('playSub')) UI.syncTitle();
    rainbow.visible = false; this.rainbowT = 0;
    Weather.onRainEnd = () => { if (G.night < 0.2) this.rainbowT = 70; };
    saveSoon();
  },

  planNight() {
    const n = G.nightNum, d = ISLANDS[G.isleIdx].difficulty, isle = G.isle;
    const nR = Math.min(isle.rifts.length, 1 + Math.floor((n - 1) / 2));
    const start = (n * 7 + G.isleIdx * 3) % isle.rifts.length;
    const rifts = []; for (let k = 0; k < nR; k++) rifts.push((start + k) % isle.rifts.length);
    const rng = mulberry32(n * 131 + G.isleIdx * 7919);
    let budget = (3.2 + n * 2.9) * d;
    const pool = [['smudge', 1]];
    if (n >= 2) pool.push(['drifter', 0.55]);
    if (n >= 3) pool.push(['splitter', 0.4]);
    if (n >= 4) pool.push(['lump', 0.32]);
    const tot = pool.reduce((s, p) => s + p[1], 0);
    const boss = n % 5 === 0;
    if (boss) budget = Math.max(4, budget - 12);
    const waves = Math.min(4, 1 + Math.floor((n + 1) / 3));
    const events = [], perRift = {};
    let ri = 0;
    for (let w = 0; w < waves; w++) {
      let wb = budget / waves * (0.8 + w * 0.15);
      let t = w * 17 + 1.5;
      while (wb > 0.5) {
        let r = rng() * tot, type = 'smudge';
        for (const [ty, wgt] of pool) { r -= wgt; if (r <= 0) { type = ty; break; } }
        if (ETYPES[type].weight > wb + 0.6) type = 'smudge';
        const rift = rifts[ri++ % rifts.length];
        events.push({ t, type, rift });
        perRift[rift] = (perRift[rift] || 0) + 1;
        wb -= ETYPES[type].weight;
        t += 0.55 + rng() * 0.8;
      }
    }
    if (boss) { const rift = rifts[0]; events.push({ t: (waves - 1) * 17 + 7, type: 'boss', rift }); perRift[rift] = (perRift[rift] || 0) + 1; }
    events.sort((a, b) => a.t - b.t);
    return { events, perRift, rifts, total: events.length, boss, hpMul: 1 + (n - 1) * 0.1 };
  },

  start(vibe) {
    const t = $('title');
    t.classList.add('out');
    G.state = 'day';
    Cam.mode = 'game';
    this.hour = Math.max(this.hour, 8);
    UI.showHUD(true);
    AudioEngine.setMood('day');
    UI.syncTitle();
    if (SAVE.firstRun) {
      SAVE.firstRun = false;
      setTimeout(() => UI.banner(ISLANDS[G.isleIdx].name, UI.isTouch ? 'Drag on the left side to ride.' : 'Ride with WASD or the arrow keys, or click where you want to go.'), 600);
    } else {
      setTimeout(() => UI.banner(ISLANDS[G.isleIdx].name, `Day ${G.isleSave.nights + 1}`), 400);
    }
    if (vibe) this.toggleVibe(true);
    saveSoon();
  },
  toTitle() {
    if (G.vibe) this.toggleVibe(false);
    if (G.state === 'night' || G.state === 'dusk') { G.enemies.forEach(e => e.alive && e.fade()); }
    G.state = 'title';
    Cam.mode = 'title';
    $('title').classList.remove('out');
    UI.showHUD(false);
    UI.syncTitle();
    AudioEngine.setMood('menu');
    saveGame();
  },
  toggleVibe(on) {
    on = on === undefined ? !G.vibe : on;
    if (on === G.vibe) return;
    if (on && G.state === 'night' && G.mode === 'bloom' && G.enemies.some(e => e.alive)) { UI.toast('Vibe mode opens once the Gloom is painted.'); return; }
    if (on && G.state === 'title') { this.start(true); return; }
    G.vibe = on;
    if (on) {
      VIBE.hour = G.state === 'title' ? 12 : this.hour;
      Cam.mode = 'vibe';
      Cam.cur.az = Math.atan2(camera.position.x, camera.position.z);
      UI.showHUD(false);
      $('vibebar').hidden = false;
      $('vibebar').classList.remove('idle');
      VIBE.idleT = 3.5;
      AudioEngine.setMood('vibe');
    } else {
      Cam.mode = G.state === 'title' ? 'title' : 'game';
      UI.showHUD(G.state !== 'title');
      $('vibebar').hidden = true;
      AudioEngine.setMood(currentMood());
    }
  },
  travel(idx) {
    this.autoMend = false;
    UI.closeModal();
    if (idx === G.isleIdx) return;
    if (G.vibe) this.toggleVibe(false);
    saveGame();
    AudioEngine.play('travel');
    $('fade').classList.add('on');
    this.travelT = 1.0; this.travelIdx = idx;
  },
  finishTravel() {
    const wasTitle = G.state === 'title';
    this.loadIsland(this.travelIdx);
    G.state = wasTitle ? 'title' : 'day';
    if (!wasTitle) { Cam.swoop(); UI.banner(ISLANDS[G.isleIdx].name, ISLANDS[G.isleIdx].blurb); AudioEngine.setMood('day'); }
    $('fade').classList.remove('on');
    Achieve('travel1');
  },

  wrecked() { return G.plots.filter(p => p.level && p.grey && !p.mending); },
  repairCost() { return this.wrecked().reduce((s, p) => s + p.level * 2, 0); },
  // Paid-in credit lives in each island's save, so it survives reloads and never leaks between islands.
  get mendPaid() { return G.isleSave.mend || 0; },
  set mendPaid(v) { G.isleSave.mend = Math.max(0, v); },
  mendInflight: 0, mendT: 0, mendN: 0,
  mendQueue() { return this.wrecked().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)); },
  // Restore every wreck the credit already covers, nearest first.
  settleMend() {
    let head = this.mendQueue()[0];
    while (head && this.mendPaid >= head.level * 2) {
      this.mendPaid -= head.level * 2;
      this.mendPlot(head);
      head = this.mendQueue()[0];
    }
    if (!head && this.mendPaid) { G.sparks = G.sparks + this.mendPaid; this.mendPaid = 0; } // nothing left to mend: give credit back
  },
  // One spark flies from Floof into the Heart. It's only spent when it lands, so a coin cleared by travel or reset costs nothing.
  mendOne() {
    this.settleMend();
    const q = this.mendQueue();
    if (!q.length || this.mendPaid + this.mendInflight >= this.repairCost()) return 'full';
    if (G.sparks - this.mendInflight <= 0) { AudioEngine.play('deny'); UI.deny(); return 'broke'; }
    const isle = G.isle, pip = this.mendPaid + this.mendInflight;
    this.mendInflight++;
    Coins.fly({ x: Player.pos.x, y: Player.pos.y + 1.6, z: Player.pos.z }, () => ({ x: 0, y: Heart.y + 4.2, z: 0 }), 0.34, () => {
      if (G.isle !== isle) return;
      this.mendInflight = Math.max(0, this.mendInflight - 1);
      if (G.sparks <= 0) return;
      G.sparks = G.sparks - 1;
      this.mendPaid = this.mendPaid + 1;
      AudioEngine.play('coinPay', { i: pip, vol: 0.7 });
      Sparkles.emit(0, Heart.y + 4.2, 0, { n: 6, color: [0xffd36b, isle.pal.accent], speed: 2.5, life: 0.6, size: 0.35, bright: 1.8 });
      Heart.pulse = 1;
      this.settleMend();
      saveSoon();
    }, 0, 1.6);
    return 'paid';
  },
  mendPlot(p) {
    const isle = G.isle, sv = G.isleSave, hy = Heart.y + 4.5;
    p.mending = true;
    Heart.pulse = 1;
    Rings.emit(0, Heart.y, 0, { color: isle.pal.accent, r0: 0.8, r1: 9, life: 0.8, bright: 1.8 });
    // a ribbon of light arcs from the Heart to the wreck
    for (let k = 0; k <= 12; k++) setTimeout(() => {
      if (G.isle !== isle) return;
      const t = k / 12;
      Sparkles.emit(p.x * t, lerp(hy, p.y + 1.5, t) + Math.sin(t * Math.PI) * 3.2, p.z * t, { n: 5, color: isle.pal.flower, speed: 0.6, up: 0.3, life: 0.8, size: 0.6, gravity: 0, bright: 2 });
    }, k * 32);
    setTimeout(() => {
      if (G.isle !== isle) { if (sv.plots[p.id]) sv.plots[p.id].w = 0; saveSoon(); return; }
      if (!p.grey) return;
      p.setGrey(false, true);
      AudioEngine.play('regrow', { pan: panOf(p.x) });
      if (!G.plots.some(q => q.level && q.grey)) {
        UI.banner('Restored', 'The Heart mended every broken home.');
        AudioEngine.play('upgrade');
        Rings.emit(0, Heart.y, 0, { color: 0xffffff, r0: 0.5, r1: 16, life: 1.2, bright: 1.6 });
        Sparkles.emit(0, hy, 0, { n: 60, color: isle.pal.flower, speed: 7, up: 5, life: 1.4, size: 0.55, bright: 1.6 });
        Butterflies.burst(0, hy, 0, 6);
        Cam.shake(0.25);
      }
    }, 460);
    saveSoon();
  },
  // Enter / button: if sparks could still buy something, ask once more instead of starting right away
  requestNight() {
    if (G.state !== 'day' || G.vibe) return;
    const cheapest = Math.min(...G.plots.filter(p => p.visible && p.level < 3).map(p => p.cost - p.paid));
    const now = performance.now();
    if (G.sparks >= cheapest && G.sparks > 0 && !(this.confirmUntil > now)) {
      this.confirmUntil = now + 4000;
      AudioEngine.play('deny', { vol: 0.5 });
      return;
    }
    this.confirmUntil = 0;
    this.beginNight();
  },
  beginNight() {
    if (G.state !== 'day' || G.vibe) return;
    G.state = 'dusk';
    this.phaseT = 0; this.fromHour = this.hour; this.holdT = 0;
    this.plan = this.planNight();
    this.nightT = 0; this.evIdx = 0; this.waveTotal = G.mode === 'zen' ? 0 : this.plan.total; this.healed = 0; this.dimT = -1;
    Heart.hp = Heart.maxHp;
    AudioEngine.play('nightStart');
    AudioEngine.setMood('dusk');
    const p = this.plan;
    UI.banner(`Night ${G.nightNum}`, G.mode === 'zen'
      ? 'A quiet night. Catch fireflies and shooting stars.'
      : `${p.total} Gloom drift in from ${p.rifts.length === 1 ? 'one rift' : p.rifts.length + ' rifts'}${p.boss ? ', and something big' : ''}.`);
    if (G.mode !== 'zen') {
      G.plots.forEach(pl => { if (pl.type === 'grove' && pl.level && !pl.grey) for (let k = 0; k < BTYPES.grove.sprites[pl.L]; k++) G.sprites.push(new Sprite(pl, k)); });
    }
    UI.dayLabel();
  },
  endNight(ok) {
    if (G.state !== 'night' && G.state !== 'dusk') return;
    G.state = 'dawn';
    this.phaseT = 0; this.fromHour = this.hour < 24 ? this.hour : this.hour;
    G.enemies.forEach(e => e.alive && e.fade());
    G.sprites.forEach(s => { Sparkles.emit(s.x, s.y, s.z, { n: 8, color: 0xd6ff7a, speed: 2, life: 0.8, size: 0.35 }); s.dispose(); });
    G.sprites = [];
    AudioEngine.play('dawn');
    AudioEngine.setMood('dawn');
    const sv = G.isleSave;
    const counted = ok || G.mode === 'zen';
    // income
    let total = 4, k = 0;
    const incomeFrom = [{ x: Heart.x, y: Heart.y + 5, z: Heart.z, n: 4 }];
    G.plots.forEach(p => {
      if (!p.level || p.grey) return;
      const inc = BTYPES[p.type].income;
      if (inc) { const n = ok ? inc[p.L] : Math.ceil(inc[p.L] / 2); total += n; incomeFrom.push({ x: p.x, y: p.y + 2.5, z: p.z, n }); }
    });
    incomeFrom.forEach(src => {
      for (let i = 0; i < src.n; i++) {
        const idx = k++;
        Coins.fly({ x: src.x, y: src.y, z: src.z }, () => ({ x: Player.pos.x, y: Player.pos.y + 1.3, z: Player.pos.z }), 0.9 + Math.random() * 0.3, () => collectSpark(), 2.2 + idx * 0.09, 5);
      }
    });
    // regrow
    const wrecked = G.plots.filter(p => p.level && p.grey).length;
    const dawnIsle = G.isle;
    if (wrecked) setTimeout(() => { if (G.isle !== dawnIsle) return; const c = Math.max(0, this.repairCost() - this.mendPaid); UI.toast(`${wrecked} building${wrecked > 1 ? 's were' : ' was'} wrecked. Mend ${wrecked > 1 ? 'them' : 'it'} at the Heart for <b>${c} spark${c === 1 ? '' : 's'}</b>`); }, 4200);
    if (Heart.grey) setTimeout(() => { Heart.setGrey(false); AudioEngine.play('regrow'); }, 1200);
    Heart.hp = Heart.maxHp;
    if (counted) {
      sv.nights++;
      SAVE.stats.nights++;
      if (SAVE.stats.nights >= 5) Achieve('night5');
      if (SAVE.stats.nights >= 25) Achieve('night25');
    }
    G.nightNum = sv.nights + 1;
    setTimeout(() => {
      const painted = G.mode === 'zen' ? '' : ` · ${this.healed} Gloom painted`;
      UI.banner('Dawn', ok || G.mode === 'zen' ? `+${total} sparks drift home${painted}.` : `The Heart rested. A smaller harvest: +${total}${painted}.`);
      // new plots
      let fresh = 0;
      G.plots.forEach(p => { if (!p.visible && p.spot.unlock <= sv.nights) { p.setVisible(true, true); fresh++; } });
      if (fresh) setTimeout(() => UI.toast(`${fresh} new plot${fresh > 1 ? 's' : ''} bloomed on the island`), 1800);
      // next island
      const nextDef = ISLANDS[G.isleIdx + 1];
      if (nextDef && sv.nights >= NIGHTS_TO_UNLOCK && !SAVE.islands[nextDef.id].unlocked) {
        SAVE.islands[nextDef.id].unlocked = true;
        setTimeout(() => UI.toast(`A new island drifted into view: <b>${nextDef.name}</b>. Open the map.`), 3200);
        if (ISLANDS.every(d => SAVE.islands[d.id].unlocked)) Achieve('allisles');
      }
    }, 1400);
    if (Math.random() < 0.3 || Weather.raining) this.rainbowT = 60;
    UI.dayLabel();
    saveGame();
  },
  heartDimmed() {
    if (this.dimT >= 0 || G.state !== 'night') return;
    this.dimT = 3;
    Heart.setGrey(true);
    G.enemies.forEach(e => e.alive && e.fade());
    UI.banner('The Heart dims', 'It will bloom again at dawn.');
    AudioEngine.play('grey');
  },
  onHealed() {
    this.healed++;
  },

  // ---------------------------------------------------------------------------
  update(dt) {
    const t = G.time;
    const def = ISLANDS[G.isleIdx];
    Input.pollPad();
    if (Input.pad.zoom) Cam.zoom = clamp(Cam.zoom + Input.pad.zoom * dt * 22, 22, 64);
    if (Steer.active && G.state !== 'title' && !G.vibe && !UI.modal && performance.now() - Steer.t0 > 200) {
      const pt = groundPoint(Input.mouse.x, Input.mouse.y);
      if (pt) Player.moveTarget = pt;
    }
    const paused = !!UI.modal && G.state !== 'title';
    // travel fade
    if (this.travelT > 0) { this.travelT -= dt; if (this.travelT <= 0) this.finishTravel(); }
    // hotkeys
    if (!UI.modal) {
      if (Input.hit('Escape') || Input.hit('KeyP')) { if (G.vibe) this.toggleVibe(false); else if (G.state !== 'title') UI.openMenu('settings'); }
      if (G.state !== 'title') {
        if (Input.hit('KeyV')) this.toggleVibe();
        if (Input.hit('KeyM') && !G.vibe) UI.openMap();
        if (Input.hit('KeyH')) { UI.hudHidden = !UI.hudHidden; UI.showHUD(!G.vibe); }
        if (Input.hit('Enter')) { if (G.state === 'day') this.requestNight(); else if (G.state === 'night' && G.mode === 'zen') this.endNight(true); }
        if (Input.hit('KeyF')) toggleFullscreen();
      } else if (Input.hit('Enter') || Input.hit('PadA')) Game.start();
    } else if (Input.hit('Escape')) { click(); UI.closeModal(); }

    // time of day
    let hour;
    if (G.state === 'title' && !G.vibe) hour = 15.5 + t * 0.09;
    else if (G.vibe) { VIBE.hour += dt * VIBE.speed * 0.1; hour = VIBE.hour; SAVE.stats.vibe += dt; if (SAVE.stats.vibe > 60) Achieve('vibe60'); }
    else hour = this.hour;
    applyTOD(hour, dt, def, t);
    G.night = TOD.night;
    const c = TOD.cur;
    _c1.copy(c.hemiS).multiplyScalar(c.hemiI * 0.55).add(_c2.copy(c.sun).multiplyScalar(c.sunI * 0.4));
    G.isle.setLight(_c1, G.night);

    if (!paused && G.state !== 'title') this.updateState(dt);

    // simulation
    if (!paused) {
      if (G.state !== 'title') Player.update(dt);
      else { windU.uPlayer.value.set(9999, 0, 9999); Player.light.intensity = G.night * 4; }
      for (let i = G.enemies.length - 1; i >= 0; i--) {
        const e = G.enemies[i];
        if (e.update(dt, t)) { e.dispose(); G.enemies.splice(i, 1); }
      }
      G.plots.forEach(p => p.update(dt, t));
      Combo.lockT = Math.max(0, (Combo.lockT || 0) - dt);
      G.sprites.forEach(s => s.update(dt, t));
      G.villagers.forEach(v => v.update(dt, t));
      G.bunnies.forEach(b => b.update(dt, t));
      Birds.update(dt, t);
      Fish.update(dt);
      Heart.update(dt, t);
      Bolts.update(dt);
      Coins.update(dt, G.isle.heightAt, Player.pos);
    }
    // ambience + fx always run
    updateAmbient(dt, t);
    G.isle.update(dt, t);
    Sparkles.update(dt);
    Confetti.update(dt, G.isle.heightAt);
    Rings.update(dt);
    Trail.update(dt);
    FlowerBounce.update(dt);
    updateWobbles(dt);
    const nAmb = Butterflies.update(dt, t, G.isle.heightAt, G.night);
    this.bfT -= dt;
    if (this.bfT <= 0) {
      this.bfT = 1.5;
      if (G.night < 0.4 && nAmb < 12 && G.isle.flowers.length) { const f = pick(G.isle.flowers); Butterflies.ambient(f.x, f.z, G.isle.heightAt); }
    }
    const collect = G.state === 'night' || G.state === 'dusk' || (G.state === 'day' && G.night > 0.5) ? Player.pos : null;
    Fireflies.update(dt, t, G.night, Player.alive && G.state !== 'title' ? collect : null, (x, y, z, col) => {
      this.fireN++;
      SAVE.stats.fireflies++;
      AudioEngine.play('firefly', { i: this.fireN % 10, vol: 0.5, pan: panOf(x) });
      Sparkles.emit(x, y, z, { n: 10, color: col.getHex(), speed: 2, life: 0.7, size: 0.35 });
      if (this.fireN % 5 === 0) Coins.fly({ x, y, z }, () => ({ x: Player.pos.x, y: Player.pos.y + 1.3, z: Player.pos.z }), 0.5, () => collectSpark());
      if (SAVE.stats.fireflies >= 50) Achieve('fire50');
    });
    Weather.update(dt, t, G.state === 'title' || G.vibe ? camera.position : Player.pos, true, G.night);
    // shooting stars
    this.starT -= dt;
    if (this.starT <= 0) {
      const zen = G.mode === 'zen' || G.state === 'title' || G.vibe;
      this.starT = zen ? rr(4, 9) : rr(8, 18);
      if (G.night > 0.6 && Stars.count < 2) Stars.spawn();
    }
    Stars.update(dt);
    // rainbow
    this.rainbowT = Math.max(0, (this.rainbowT || 0) - dt);
    rainbowU.uAmt.value = damp(rainbowU.uAmt.value, this.rainbowT > 0 && G.night < 0.25 ? 0.55 : 0, 0.5, dt);
    rainbow.visible = rainbowU.uAmt.value > 0.01;
    rainbow.position.set(camera.position.x * 0.2, -150, camera.position.z - 700);
    // rifts
    const act = this.plan ? this.plan.rifts : [];
    this.rifts.forEach((r, i) => {
      const active = act.includes(i) && G.mode !== 'zen';
      const target = active ? (G.state === 'night' || G.state === 'dusk' ? 1.15 : 0.9) : 0.55;
      r.s = damp(r.s, target, 3, dt);
      r.o.scale.setScalar(r.s);
      const ud = r.o.userData;
      if (ud.inner) ud.inner.rotation.z += dt * (active ? 2.2 : 0.5);
      if (ud.shards) { ud.shards.rotation.z = Math.sin(t * 0.7 + i) * 0.06; ud.shards.position.y = Math.sin(t * 1.2 + i) * 0.1; }
      r.pool.material.opacity = active ? 0.25 + G.night * 0.35 : 0.08;
      if (active && G.state === 'night' && Math.random() < dt * 6) Sparkles.emit(r.o.position.x + rr(-1, 1), r.o.position.y + rr(0.5, 3), r.o.position.z + rr(-1, 1), { n: 1, color: [0x9a7ad8, 0x5a4a8a], speed: 0.6, life: 1.2, size: 0.5, up: 0.8, gravity: 0, bright: 1 });
    });
    // hue drift
    const hueMode = SAVE.settings.calm ? Math.min(SAVE.settings.hue, 0) : SAVE.settings.hue;
    gradePass.uniforms.hue.value = hueMode === 0 ? 0 : hueMode === 1 ? Math.sin(t * 0.05) * 0.16 + Math.sin(t * 0.017) * 0.08 : (t * 0.06) % TAU;
    gradePass.uniforms.time.value = t;
    gradePass.uniforms.sat.value = 1.1 + G.night * 0.05;

    RangeRing.update(dt, t, G.state === 'day' && !G.vibe ? this.focus : null);
    // the Gloom's route tonight, drawn as drifting wisps along the paths
    if (G.state === 'day' && G.mode !== 'zen' && this.plan && !G.vibe && !paused) {
      this.wispT = (this.wispT || 0) + dt; this.wispAcc = (this.wispAcc || 0) + dt;
      if (this.wispAcc > 0.1) {
        this.wispAcc = 0;
        for (const ri of this.plan.rifts) {
          const pts = G.isle.paths[G.isle.rifts[ri].path].pts;
          for (let k = 0; k < 3; k++) {
            const u = ((this.wispT / 10) + k / 3) % 1, p = pts[Math.floor(u * (pts.length - 1))];
            Sparkles.emit(p.x, G.isle.heightAt(p.x, p.z) + 0.45, p.z, { n: 1, color: [0x9a7ad8, 0xc9b8ff], speed: 0.25, life: 1.3, size: 0.55, up: 0.15, gravity: 0, bright: 0.8 });
          }
        }
      }
    }
    Cam.update(dt, t);
    // vibe bar idle
    if (G.vibe) {
      if (performance.now() - Input.mouse.moved < 100) VIBE.idleT = 3;
      VIBE.idleT -= dt;
      $('vibebar').classList.toggle('idle', VIBE.idleT <= 0);
    }
    this.updateUI(dt);
    saveTimer -= dt;
    if (saveTimer <= 0 && saveTimer > -1) { saveTimer = -2; saveGame(); }
  },

  updateState(dt) {
    const st = G.state;
    if (st === 'day') {
      this.dayT += dt;
      this.hour = 8 + Math.min(this.dayT / 220, 1) * 8.6;
      AudioEngine.setIntensity(0);
    } else if (st === 'dusk') {
      this.phaseT += dt;
      this.hour = lerp(this.fromHour, 20.8, smooth(clamp(this.phaseT / 5, 0, 1)));
      if (this.phaseT >= 5) {
        G.state = 'night'; this.nightT = 0; this.evIdx = 0;
        AudioEngine.setMood(G.mode === 'zen' ? 'night' : 'battle');
        if (G.mode !== 'zen') AudioEngine.play('waveStart');
      }
    } else if (st === 'night') {
      this.nightT += dt;
      if (G.mode === 'zen') {
        this.hour = 20.8 + Math.min(this.nightT / 60, 1) * 8.4;
        if (this.nightT > 62) this.endNight(true);
      } else {
        const p = this.plan;
        while (this.evIdx < p.events.length && p.events[this.evIdx].t <= this.nightT) {
          const ev = p.events[this.evIdx++];
          const rift = G.isle.rifts[ev.rift];
          const e = new Enemy(ev.type, rift, p.hpMul);
          G.enemies.push(e);
          if (ev.type === 'boss') { AudioEngine.play('bossSpawn'); Cam.shake(0.5); UI.toast('A Great Gloom rises from the rift'); }
          if (this.evIdx > 1 && ev.t - p.events[this.evIdx - 2].t > 8) AudioEngine.play('waveStart');
        }
        const alive = G.enemies.filter(e => e.alive).length;
        AudioEngine.setIntensity(clamp(alive / 12, 0.15, 1));
        const prog = this.waveTotal ? this.healed / this.waveTotal : 1;
        this.hour = damp(this.hour, 20.8 + prog * 5.6, 0.8, dt);
        if (this.dimT >= 0) { this.dimT -= dt; if (this.dimT < 0) this.endNight(false); }
        else if (this.evIdx >= p.events.length && alive === 0 && this.nightT > 3) this.endNight(true);
      }
    } else if (st === 'dawn') {
      this.phaseT += dt;
      const target = 30.5;
      this.hour = lerp(this.fromHour, target, smooth(clamp(this.phaseT / 6, 0, 1)));
      if (this.phaseT >= 6) {
        G.state = 'day'; this.hour = 6.5 + 1.5; this.dayT = 0;
        this.plan = this.planNight();
        AudioEngine.setMood('day');
        UI.dayLabel();
      }
    }
    // building + calling the night
    const P = Player;
    let focus = null, fd = 2.1;
    if (st === 'day' && P.alive && !G.vibe) {
      for (const p of G.plots) {
        if (!p.visible || p.level >= 3 || p.grey) continue;
        const d = p.type === 'hedge' ? segDist(P.pos.x, P.pos.z, p.ax, p.az, p.bx, p.bz) - 0.4 : Math.hypot(P.pos.x - p.x, P.pos.z - p.z) - (p.level ? p.radius : p.rad * 0.7);
        if (d < fd) { fd = d; focus = p; }
      }
    }
    G.plots.forEach(p => { p.focus = damp(p.focus, p === focus ? 1 : 0, 10, dt); });
    this.focus = focus;
    const tapMode = SAVE.settings.buildMode === 'tap';
    const pressed = Input.buildPressed() || UI.promptTapped;
    UI.promptTapped = false;
    if (tapMode && pressed) this.auto = focus || (this.nearHeart ? 'heart' : null);
    if (this.auto && this.auto !== focus && !(this.auto === 'heart' && this.nearHeart)) this.auto = null;
    const holding = Input.building() || (tapMode && !!this.auto);
    if (!holding) this.payLock = false;
    if (focus && focus.justBuilt) { focus.justBuilt = false; this.payLock = true; if (this.auto === focus) this.auto = null; }
    if (focus && holding && !this.payLock) {
      this.payT -= dt;
      if (this.payT <= 0) {
        if (focus.paid < focus.cost) {
          if (G.sparks > 0) { focus.payOne(); this.payN++; this.payT = Math.max(0.06, 0.15 - this.payN * 0.012); }
          else { AudioEngine.play('deny'); UI.deny(); this.payT = 0.7; this.auto = null; }
        }
      }
    } else { this.payT = 0; this.payN = 0; }
    // heart: hold to call the night
    const nearHeart = st === 'day' && !focus && P.alive && Math.hypot(P.pos.x, P.pos.z) < 6.8 && !G.vibe;
    const mending = nearHeart && this.wrecked().length > 0 && !(this.travelT > 0);
    if (mending && (Input.hit('KeyR') || (tapMode && pressed))) this.autoMend = true;
    if (!mending) this.autoMend = false;
    if (mending) { this.mendLock = true; if (this.auto === 'heart') this.auto = null; }
    if (!holding) this.mendLock = false;
    if (mending && (holding || this.autoMend)) {
      this.mendT -= dt;
      if (this.mendT <= 0) {
        const r = this.mendOne();
        if (r === 'paid') { this.mendN++; this.mendT = Math.max(0.06, 0.14 - this.mendN * 0.01); }
        else { this.mendT = r === 'broke' ? 0.7 : 0.1; if (r === 'broke') this.autoMend = false; }
      }
    } else { this.mendT = 0; this.mendN = 0; }
    if (nearHeart && holding && !mending && !this.mendLock) {
      this.holdT += dt;
      this.holdTick -= dt;
      if (this.holdTick <= 0) { this.holdTick = 0.22; AudioEngine.play('hold', { i: Math.floor(this.holdT / 0.22) }); }
      if (this.holdT >= 1.3) { this.holdT = 0; this.auto = null; this.beginNight(); }
    } else { this.holdT = Math.max(0, this.holdT - dt * 3); this.holdTick = 0; }
    this.nearHeart = nearHeart;
  },

  updateUI(dt) {
    if (G.state === 'title') { UI.setPrompt(null); UI.labels([]); Edges.show([]); if (Guide.beacon) Guide.beacon.visible = false; if (!$('touch').hidden) $('touch').hidden = true; return; }
    const st = G.state;
    // prompt
    const f = this.focus;
    const touch = UI.isTouch;
    if (f) {
      const d = f.def, cost = f.cost, need = cost - f.paid;
      const poor = G.sparks < need;
      UI.setPrompt({
        title: d.name + (f.level ? `<small>Level ${f.level + 1}</small>` : ''),
        desc: d.desc[f.level],
        pips: cost, paid: f.paid,
        key: poor ? `You need ${need - G.sparks} more spark${need - G.sparks === 1 ? '' : 's'}. Paint Gloom or wait for dawn.` : holdHint(f.level ? 'upgrade' : 'build'),
        poor,
      });
    } else if (this.nearHeart && this.wrecked().length) {
      const n = this.wrecked().length, cost = this.repairCost(), left = cost - this.mendPaid - this.mendInflight, poor = G.sparks - this.mendInflight <= 0 && left > 0;
      UI.setPrompt({
        title: 'Mend the kingdom',
        desc: `${n} building${n > 1 ? 's are' : ' is'} wrecked. Each one blooms back as soon as its sparks are paid, nearest first.`,
        pips: Math.min(cost, 30), paid: Math.min(this.mendPaid, 30),
        key: poor ? `Out of sparks. Begin the night (${touch ? 'the moon button' : Input.last === 'pad' ? '<kbd>Y</kbd>' : '<kbd>Enter</kbd>'}) and paint Gloom to earn more.` : holdHint('mend') + (Input.last === 'kb' ? ' · <kbd>R</kbd> mends all you can afford' : ''),
        poor,
      });
    } else if (this.nearHeart) {
      const p = this.plan;
      UI.setPrompt({
        title: 'The Heart',
        desc: G.mode === 'zen' ? `Night ${G.nightNum} will be quiet and full of fireflies.` : `Night ${G.nightNum}: ${p.total} Gloom from ${p.rifts.length === 1 ? 'one rift' : p.rifts.length + ' rifts'}${p.boss ? ', plus a Great Gloom' : ''}.`,
        pips: 0, paid: 0,
        key: holdHint('call the night'),
        ring: this.holdT / 1.3,
      });
    } else if (!Player.alive && st !== 'title') {
      UI.setPrompt({ title: 'Floof is resting', desc: `Back at the Heart in ${Math.max(1, Math.ceil(Player.downT))}…`, pips: 0, paid: 0, key: 'The Gloom only borrowed your color.' });
    } else UI.setPrompt(null);
    // guide + off-screen arrows
    Guide.update(dt, G.time);
    const edges = [];
    if (!G.vibe) {
      if ((st === 'night' || st === 'dusk') && G.mode !== 'zen') {
        if (Heart.alertT > 0) {
          const hp = Edges.project(0, Heart.y + 4, 0);
          if (!Edges.onScreen(hp, 60)) edges.push({ ...hp, kind: 'heart', text: '♥' });
          $('nightbar').classList.add('hurt');
          if (G.time - (this.heartToastT || -99) > 14) { this.heartToastT = G.time; UI.toast('The Heart is being drained. Ride back to help'); }
        } else $('nightbar').classList.remove('hurt');
        const sectors = new Map();
        for (const e of G.enemies) {
          if (!e.alive || e.spawnT < 0.3) continue;
          const pr = Edges.project(e.x, e.y + 1, e.z);
          if (Edges.onScreen(pr, 40)) continue;
          const a = Math.round(Math.atan2(pr.sy - innerHeight / 2, pr.sx - innerWidth / 2) / (TAU / 10));
          const sc = sectors.get(a) || { n: 0, sx: 0, sy: 0, behind: pr.behind };
          sc.n++; sc.sx += pr.sx; sc.sy += pr.sy; sectors.set(a, sc);
        }
        for (const sc of sectors.values()) edges.push({ sx: sc.sx / sc.n, sy: sc.sy / sc.n, behind: sc.behind, kind: 'gloom', text: String(sc.n) });
      }
      if (st === 'day' && this.wrecked().length && !this.nearHeart) {
        const hp = Edges.project(0, Heart.y + 4, 0);
        if (!Edges.onScreen(hp, 60)) edges.push({ ...hp, kind: 'heart', text: '♥' });
      }
      if (Guide.target && st === 'day') {
        const gp = Edges.project(Guide.target.x, Guide.target.y + 1, Guide.target.z);
        if (!Edges.onScreen(gp, 40)) edges.push({ ...gp, kind: 'guide', text: '✦' });
      }
    }
    Edges.show(edges);
    // dawn income preview
    const inc = $('income');
    const showInc = st === 'day' && !touch;
    if (inc.hidden === showInc) inc.hidden = !showInc;
    if (showInc) {
      let total = 4;
      for (const p of G.plots) if (p.level && !p.grey && BTYPES[p.type].income) total += BTYPES[p.type].income[p.L];
      const t = `+${total} at dawn`;
      if (UI.cache.inc !== t) { UI.cache.inc = t; inc.textContent = t; }
    }
    // touch controls only while riding
    const tb = SAVE.settings.buildMode === 'tap' ? 'Tap to build' : 'Hold to build';
    if (UI.cache.tb !== tb) { UI.cache.tb = tb; $('tBuild').textContent = tb; }
    const tBuildHide = st !== 'day';
    if ($('tBuild').hidden !== tBuildHide) $('tBuild').hidden = tBuildHide;
    $('app').classList.toggle('atnight', st === 'night' || st === 'dusk');
    const tEl = $('touch');
    const tHide = G.vibe || !!UI.modal;
    if (tEl.hidden !== tHide) tEl.hidden = tHide;
    // combo meter
    const cb = $('combo');
    const showCombo = st === 'night' && G.mode !== 'zen' && (Combo.n >= 2 || Combo.ready);
    if (cb.hidden === showCombo) cb.hidden = !showCombo;
    if (showCombo) {
      const novaKey = touch ? 'tap Burst' : Input.last === 'pad' ? 'press X' : 'press E';
      const ct = Combo.ready ? `Bloom Nova ready · ${novaKey}` : `Combo ×${Combo.n}`;
      if (UI.cache.combo !== ct) { UI.cache.combo = ct; $('comboText').textContent = ct; cb.classList.toggle('ready', Combo.ready); }
      $('comboFill').style.width = (Combo.ready ? 100 : Math.min(1, Combo.n / NOVA_AT) * 100 * Math.max(0.15, Combo.t / 3.2) ** 0.3).toFixed(0) + '%';
    }
    $('burst').classList.toggle('nova', Combo.ready);
    const mv = $('moves');
    const showMoves = (st === 'night' || st === 'dusk') && G.mode !== 'zen' && !G.vibe && Player.alive;
    if (mv.hidden === showMoves) mv.hidden = !showMoves;
    if (showMoves) {
      const t = touch ? 'touch' : Input.last === 'pad' ? 'pad' : 'kb';
      const nova = Combo.ready ? 'ready, press now!' : Combo.n ? `combo ${Math.min(Combo.n, NOVA_AT)} / ${NOVA_AT}` : `after a ${NOVA_AT}-paint combo`;
      if (UI.cache.moves !== t) {
        UI.cache.moves = t; UI.cache.nova = '';
        const k = t === 'pad' ? ['B', 'X'] : t === 'touch' ? ['Dash', 'Burst'] : ['Shift', 'E'];
        mv.innerHTML = `<div class="mv1"><kbd>${k[0]}</kbd><span><b>Petal Strike</b> Dash through Gloom</span></div><div class="mv2"><kbd>${k[1]}</kbd><span><b>Bloom Nova</b> <i id="mvNova"></i></span></div>`;
      }
      if (UI.cache.nova !== nova) { UI.cache.nova = nova; $('mvNova').textContent = nova; }
      mv.classList.toggle('ready', Combo.ready);
      mv.classList.toggle('cd', Player.dashCd > 0);
    }
    // night bar
    const nb = $('nightbar');
    const showNB = (st === 'night' || st === 'dusk') && G.mode !== 'zen';
    if (nb.hidden === showNB) nb.hidden = !showNB;
    if (showNB) {
      $('heartMeter').style.width = (Heart.hp / Heart.maxHp * 100).toFixed(1) + '%';
      const txt = `${this.healed} / ${this.waveTotal} painted`;
      if (UI.cache.heal !== txt) { UI.cache.heal = txt; $('healCount').textContent = txt; }
    }
    // night button
    const btn = $('nightBtn');
    const showBtn = !G.vibe && (st === 'day' || (st === 'night' && G.mode === 'zen'));
    if (btn.hidden === showBtn) btn.hidden = !showBtn;
    const confirming = st === 'day' && this.confirmUntil > performance.now();
    const btnTxt = confirming ? `${G.sparks} sparks unspent` : st === 'day' ? 'Begin Night' : 'Call the Dawn';
    const subTxt = confirming ? (touch ? 'Tap again to begin' : 'Press again to begin') : (touch ? 'Tap' : Input.last === 'pad' ? 'Y' : 'Enter');
    if (UI.cache.btn !== btnTxt + subTxt) { UI.cache.btn = btnTxt + subTxt; btn.querySelector('.col span').textContent = btnTxt; $('nightSub').textContent = subTxt; btn.classList.toggle('confirm', confirming); }
    // burst
    const bEl = $('burst');
    const bp = 1 - Player.burstCd / 9;
    bEl.querySelector('.orb').style.setProperty('--p', bp.toFixed(3));
    bEl.classList.toggle('ready', bp >= 1);
    UI.dayLabel();
    // world labels
    const list = [];
    if (st === 'day' && !G.vibe) {
      const P = Player.pos;
      for (const p of G.plots) {
        if (!p.visible || p.level >= 3) continue;
        const d = Math.hypot(p.x - P.x, p.z - P.z);
        if (p.level === 0 ? d > 22 : d > 8) continue;
        const need = p.cost - p.paid;
        const h = p.level ? (p.obj.userData.height || 3) + 0.9 : 2.1;
        const icon = ICONS[p.type] || '';
        const near = d < 11 || p === this.focus;
        const html = p.level ? `${icon}<span class="nm">Lv ${p.level + 1}</span><i class="gem"></i>${need}`
          : `${icon}${near ? `<span class="nm">${p.def.name}</span>` : ''}<i class="gem"></i>${need}`;
        list.push({ x: p.x, y: p.y + h, z: p.z, html, cls: p === this.focus ? 'focus' : '', op: clamp(1.4 - d / 22, 0.35, 1) });
      }
      for (const p of G.plots) if (p.grey && p.level && Math.hypot(p.x - P.x, p.z - P.z) < 26) list.push({ x: p.x, y: p.y + 2.2, z: p.z, html: p.mending ? 'Mending…' : 'Wrecked · mend at the Heart', cls: 'rift', op: 0.9 });
      if (this.wrecked().length && !this.nearHeart) list.push({ x: 0, y: Heart.y + 10, z: 0, html: `Mend here&nbsp;<i class="gem"></i>${Math.max(0, this.repairCost() - this.mendPaid)}`, cls: 'focus', op: 1 });
      if (this.plan && G.mode !== 'zen') this.plan.rifts.forEach(ri => {
        const r = G.isle.rifts[ri];
        const kinds = {};
        this.plan.events.forEach(ev => { if (ev.rift === ri) kinds[ev.type] = (kinds[ev.type] || 0) + 1; });
        const cls = { smudge: '', drifter: 'dr', splitter: 'sp', lump: 'lu', boss: 'bo' };
        const chips = Object.entries(kinds).map(([k, n]) => `<span class="th" title="${k}"><i class="${cls[k]}"></i>${n}</span>`).join('&nbsp;');
        list.push({ x: r.x, y: G.isle.heightAt(r.x, r.z) + 3.8, z: r.z, html: `Tonight&nbsp;${chips}`, cls: 'rift', op: 0.95 });
      });
    } else if ((st === 'night' || st === 'dusk') && !G.vibe && G.mode !== 'zen') {
      for (const p of G.plots) {
        if (!p.level || p.grey || p.hp >= p.maxHp) continue;
        list.push({ x: p.x, y: p.y + (p.obj.userData.height || 3) + 0.7, z: p.z, html: `<span class="hpbar"><i style="width:${(p.hp / p.maxHp * 100).toFixed(0)}%"></i></span>`, cls: 'hpl', op: 1 });
      }
    }
    if (Player.alive && Player.hp < Player.maxHp - 0.05 && G.mode !== 'zen' && !G.vibe) {
      list.push({ x: Player.pos.x, y: Player.pos.y + 3.1, z: Player.pos.z, html: `<span class="hpbar"><i style="width:${(Player.hp / Player.maxHp * 100).toFixed(0)}%"></i></span>`, cls: 'hpl me', op: 1 });
    }
    list.sort((a, b) => (b.cls === 'focus') - (a.cls === 'focus'));
    UI.labels(list.slice(0, UI.labelPool.length));
  },
};

// ============================================================================
// Pointer: wobble things, catch stars, touch joystick
// ============================================================================
const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const Steer = { active: false, t0: 0 };
function groundPoint(cx, cy) {
  _ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const h = raycaster.intersectObject(G.isle.terrain, false)[0];
  if (!h || !G.isle.inside(h.point.x, h.point.z, 1)) return null;
  return { x: h.point.x, z: h.point.z };
}
function rideTo(cx, cy) {
  if (G.state === 'title' || G.vibe || !Player.alive) return false;
  const pt = groundPoint(cx, cy);
  if (!pt) return false;
  Player.moveTarget = pt;
  Rings.emit(pt.x, G.isle.heightAt(pt.x, pt.z), pt.z, { color: 0xffffff, r0: 0.2, r1: 1.1, life: 0.45, bright: 0.9 });
  return true;
}
const WOBBLE_NOTE = { tree: 0, rock: 2, bush: 4, mushroom: 6, crystal: 8, heart: 5, villager: 7, bunny: 9, cottage: 3, field: 1, tower: 5, lantern: 7, hedge: 2, grove: 6, chime: 9 };
function worldClick(cx, cy) {
  if (UI.modal) return;
  if (G.night > 0.4 && Stars.tryCatch(cx, cy, s => {
    AudioEngine.play('wish');
    SAVE.stats.wishes++;
    Achieve('wish1'); if (SAVE.stats.wishes >= 10) Achieve('wish10');
    Sparkles.emit(s.m.position.x, s.m.position.y, s.m.position.z, { n: 50, color: [0xfff2c0, 0xffc2ec, 0xc2f0ff], speed: 8, life: 1.2, size: 2, bright: 2.5 });
    if (G.state !== 'title') {
      for (let k = 0; k < 3; k++) Coins.fly({ x: Player.pos.x + rr(-3, 3), y: Player.pos.y + 14, z: Player.pos.z + rr(-3, 3) }, () => ({ x: Player.pos.x, y: Player.pos.y + 1.3, z: Player.pos.z }), 0.8, () => collectSpark(), k * 0.15, 0.5);
      UI.toast('You caught a wish. <b>+3 sparks</b>');
    }
  })) return;
  _ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const hits = raycaster.intersectObjects(G.isle.clickables, true);
  if (!hits.length) { rideTo(cx, cy); return; }
  let o = hits[0].object;
  while (o && !o.userData.clickKind) o = o.parent;
  if (!o) { rideTo(cx, cy); return; }
  const kind = o.userData.clickKind;
  wobble(o, 0, 1);
  const base = WOBBLE_NOTE[kind] ?? 4;
  AudioEngine.play('wobble', { i: (base + ri(0, 2)) % 10, pan: clamp((cx / innerWidth) * 2 - 1, -0.8, 0.8) });
  const p = hits[0].point;
  Sparkles.emit(p.x, p.y, p.z, { n: 10, color: flowerColors(), speed: 3, life: 0.7, size: 0.35 });
  if (kind === 'tree') Confetti.emit(p.x, p.y + 0.5, p.z, { n: 6, color: G.isle.pal.leaf, speed: 2, up: 1, gravity: -2, flutter: 2, life: 2.5 });
  if (kind === 'heart') Butterflies.burst(p.x, p.y, p.z, 2);
  SAVE.stats.wobbles++;
  if (SAVE.stats.wobbles >= 50) Achieve('wobble50');
}
{
  let joyId = null, joyX = 0, joyY = 0, tapStart = null;
  const stick = $('stick'), knob = stick.querySelector('i');
  canvas.addEventListener('pointerdown', e => {
    ensureAudio();
    if (e.pointerType === 'touch' && G.state !== 'title' && !G.vibe && e.clientX < innerWidth * 0.5 && joyId === null) {
      joyId = e.pointerId; joyX = e.clientX; joyY = e.clientY;
      stick.style.left = joyX + 'px'; stick.style.top = joyY + 'px'; stick.classList.add('on');
      Input.joy.active = true; Input.joy.x = 0; Input.joy.y = 0;
      return;
    }
    tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (e.pointerType === 'mouse' && e.button === 0) { Steer.active = true; Steer.t0 = performance.now(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - joyX, dy = e.clientY - joyY;
    const l = Math.hypot(dx, dy), max = 50;
    if (l > max) { dx = dx / l * max; dy = dy / l * max; }
    Input.joy.x = dx / max; Input.joy.y = dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = e => {
    Steer.active = false;
    if (e.pointerId === joyId) { joyId = null; Input.joy.active = false; stick.classList.remove('on'); knob.style.transform = ''; return; }
    if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 12 && performance.now() - tapStart.t < 450) worldClick(e.clientX, e.clientY);
    tapStart = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); Cam.zoom = clamp(Cam.zoom + e.deltaY * 0.03, 22, 64); }, { passive: false });
  window.addEventListener('pointermove', () => { if (G.vibe) VIBE.idleT = 3; });
}
function ensureAudio() {
  if (AudioEngine.ready) return;
  AudioEngine.init();
  applyAudioSettings();
  AudioEngine.setIsland(G.isleIdx);
  AudioEngine.setMood(currentMood());
}
window.addEventListener('pointerdown', ensureAudio);
window.addEventListener('keydown', ensureAudio);
// Leaving mid-night pauses the game, so nothing happens while you're away
function autoPause() {
  saveGame();
  Steer.active = false; Input.buildHeld = false;
  const threatened = (G.state === 'night' || G.state === 'dusk') && G.mode === 'bloom' && G.enemies.some(e => e.alive);
  if (threatened && !UI.modal && !G.vibe) UI.openMenu('settings');
}
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('blur', autoPause);
window.addEventListener('pagehide', saveGame);

// ============================================================================
// Main loop + boot
// ============================================================================
const clock = new THREE.Clock();
let booted = false;
// Adaptive resolution: keep frames smooth on slower GPUs
function adaptResolution(rawDt) {
  Perf.acc += rawDt; Perf.n++;
  Perf.cool -= rawDt;
  if (Perf.acc < 1.5) return;
  const avg = Perf.acc / Perf.n; Perf.acc = 0; Perf.n = 0;
  if (Perf.cool > 0 || document.hidden) return;
  let next = Perf.scale;
  if (avg > 1 / 42 && Perf.scale > 0.55) next = Math.max(0.55, Perf.scale - 0.15);
  else if (avg < 1 / 75 && Perf.scale < 1) next = Math.min(1, Perf.scale + 0.1);
  if (next !== Perf.scale) { Perf.scale = next; Perf.cool = 3; onResize(); }
}
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  const steps = (window.__bh && window.__bh.steps) || 1;
  if (steps === 1) adaptResolution(raw);
  const ts = Combo.tick(dt);
  try {
    for (let k = 0; k < steps; k++) {
      G.time += dt * ts;
      Game.update(dt * ts);
      if (k < steps - 1) Input.endFrame();
    }
    composer.render();
  } catch (err) {
    console.error(err);
    if (!frame.errShown) { frame.errShown = true; window.dispatchEvent(new ErrorEvent('error', { message: String(err && err.message || err) + (err && err.stack ? '\n' + err.stack.split('\n').slice(0, 3).join('\n') : '') })); }
  }
  Input.endFrame();
}
function boot(data) {
  if (booted) return;
  booted = true;
  if (data && data.save) loadSave(data.save);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* optional */ }
  G.mode = SAVE.settings.mode;
  Trail.init();
  Player.init();
  Game.loadIsland(SAVE.current || 0);
  UI.init();
  Cam.update(0.016, 0);
  setTimeout(() => $('loading').classList.add('out'), 350);
  if (/[?&]debug/.test(location.search)) window.__bh = { G, Game, Player, Heart, Cam, UI, Enemy, TOD, renderer, Combo, get SAVE() { return SAVE; } };
  frame();
}
try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ save: SAVE })); } catch (e) { /* no hot reload */ }
{
  const hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
}
