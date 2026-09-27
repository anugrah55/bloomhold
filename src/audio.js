// ============================================================================
// Bloomhold — audio.js
// Procedural Web Audio engine: generative ambient music + every SFX, all
// synthesized. Everything is pitched to the current island's scale / chord so
// whatever the player does sounds like part of the song.
// Defines exactly one global: AudioEngine
// ============================================================================
const AudioEngine = (() => {
  'use strict';

  // ---------------------------------------------------------------- helpers --
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;
  const pickOne = (arr) => arr[(Math.random() * arr.length) | 0];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const mod = (n, m) => ((n % m) + m) % m;
  const hum = () => rnd(-0.004, 0.004);
  const foldTo = (m, lo, hi) => {
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
    return m;
  };

  // ----------------------------------------------------------- music data --
  // Chords are semitone offsets from the island tonic (any octave; voicing
  // folds them). `b` = bass offset from tonic. Chords change every 2 bars.
  const ISLANDS = [
    { // 0 Petalmoor — D major pentatonic, sunny meadow
      name: 'Petalmoor', tonic: 62, penta: [0, 2, 4, 7, 9], arp: 'kal', rev: 1.0, bright: 1.0,
      chords: [
        { t: [0, 4, 7, 11, 14], b: 0 },   // Dmaj9
        { t: [9, 12, 16, 19, 23], b: -3 }, // Bm9
        { t: [5, 9, 12, 16], b: -7 },     // Gmaj7
        { t: [7, 12, 14, 16], b: -5 },    // A6sus
      ],
    },
    { // 1 Tidebloom — E lydian, tropical
      name: 'Tidebloom', tonic: 64, penta: [0, 2, 4, 7, 9], arp: 'marimba', rev: 0.95, bright: 1.1,
      chords: [
        { t: [0, 4, 7, 11, 14], b: 0 },   // Emaj9
        { t: [2, 6, 9, 12], b: 0 },       // F#/E
        { t: [9, 12, 16, 19, 23], b: -3 }, // C#m9
        { t: [7, 9, 14, 16], b: -5 },     // Bsus2(add6)
      ],
    },
    { // 2 Emberwood — A dorian, warm autumn
      name: 'Emberwood', tonic: 57, penta: [0, 3, 5, 7, 10], arp: 'kal', rev: 0.9, bright: 0.9,
      chords: [
        { t: [0, 3, 7, 10, 14], b: 0 },   // Am9
        { t: [5, 9, 12, 15, 19], b: 5 },  // D9
        { t: [3, 7, 10, 14], b: 3 },      // Cmaj7
        { t: [10, 14, 17, 19, 24], b: -2 }, // G6/9
      ],
    },
    { // 3 Frostglow — F# minor, ethereal sus chords
      name: 'Frostglow', tonic: 66, penta: [0, 3, 5, 7, 10], arp: 'glass', rev: 1.35, bright: 1.05,
      chords: [
        { t: [0, 3, 7, 14], b: 0 },       // F#m(add9)
        { t: [8, 12, 15, 19, 22], b: -4 }, // Dmaj9
        { t: [3, 5, 10, 12], b: 3 },      // Asus2(add6)
        { t: [10, 15, 17, 20], b: -2 },   // E7sus4
      ],
    },
    { // 4 Prismara — C lydian, dreamy maj7#11
      name: 'Prismara', tonic: 60, penta: [0, 2, 4, 6, 9], arp: 'bell', rev: 1.15, bright: 1.1,
      chords: [
        { t: [0, 4, 7, 11, 18], b: 0 },   // Cmaj7#11
        { t: [2, 6, 9, 12], b: 0 },       // D/C
        { t: [4, 7, 11, 14, 18], b: 4 },  // Em9
        { t: [9, 12, 16, 19, 23], b: -3 }, // Am9
      ],
    },
  ];

  // Layer levels + sequencer densities per mood.
  const MOODS = {
    menu:   { pad: 0.6,  arp: 0.35, bass: 0.3,  bell: 0.55, mel: 0.3,  perc: 0, wind: 0.5,  crickets: 0.15, birds: 0.15, tempo: 70, bright: 1500, arpD: 0.35, melD: 0.14, bellD: 0.14, bassD: 0.5, rev: 1.15 },
    day:    { pad: 0.45, arp: 0.6,  bass: 0.5,  bell: 0.25, mel: 0.45, perc: 0, wind: 0.45, crickets: 0,    birds: 1,    tempo: 78, bright: 2600, arpD: 0.72, melD: 0.28, bellD: 0.05, bassD: 0.7, rev: 0.9 },
    dusk:   { pad: 0.6,  arp: 0.4,  bass: 0.45, bell: 0.4,  mel: 0.35, perc: 0, wind: 0.5,  crickets: 0.45, birds: 0.2,  tempo: 72, bright: 1800, arpD: 0.45, melD: 0.2,  bellD: 0.1,  bassD: 0.6, rev: 1.05 },
    night:  { pad: 0.7,  arp: 0.18, bass: 0.35, bell: 0.65, mel: 0.2,  perc: 0, wind: 0.4,  crickets: 1,    birds: 0,    tempo: 66, bright: 1100, arpD: 0.2,  melD: 0.1,  bellD: 0.17, bassD: 0.5, rev: 1.25 },
    battle: { pad: 0.5,  arp: 0.4,  bass: 0.6,  bell: 0.35, mel: 0.3,  perc: 1, wind: 0.3,  crickets: 0.5,  birds: 0,    tempo: 80, bright: 1400, arpD: 0.5,  melD: 0.18, bellD: 0.08, bassD: 1,   rev: 1.0 },
    dawn:   { pad: 0.8,  arp: 0.45, bass: 0.35, bell: 0.45, mel: 0.3,  perc: 0, wind: 0.4,  crickets: 0.1,  birds: 0.7,  tempo: 74, bright: 3000, arpD: 0.5,  melD: 0.2,  bellD: 0.12, bassD: 0.5, rev: 1.1 },
  };
  MOODS.vibe = MOODS.menu;

  const LAYER_KEYS = ['pad', 'arp', 'bass', 'bell', 'mel', 'perc', 'wind', 'crickets', 'birds'];
  const LAYER_TRIM = { pad: 0.85, arp: 1.0, bass: 1.0, bell: 0.8, mel: 0.8, perc: 0.9, wind: 0.3, crickets: 0.1, birds: 0.12 };
  // [reverb send, delay send]
  const LAYER_SENDS = { pad: [0.55, 0], arp: [0.4, 0.3], bass: [0.06, 0], bell: [0.75, 0.25], mel: [0.5, 0.3], perc: [0.1, 0], wind: [0.2, 0], crickets: [0.45, 0], birds: [0.5, 0.1] };
  const PARAM_KEYS = ['tempo', 'arpD', 'melD', 'bellD', 'bassD', 'perc', 'crickets', 'birds'];

  const MUSIC_TRIM = 0.9;
  const MAX_VOICES = 40;
  const LOOKAHEAD = 0.12;
  const STEPS_PER_CHORD = 32;

  // ------------------------------------------------------------------ state --
  let ctx = null;
  let isReady = false;
  const vols = { master: 0.8, music: 0.7, sfx: 0.8 };
  let duckMul = 1, duckTimer = 0;
  let moodName = 'menu';
  let mood = MOODS.menu;
  const P = {};
  let intensity = 0, intensityS = 0;
  let islandIdx = 0, isl = ISLANDS[0], pendingIsland = null;

  // nodes
  let preMaster, masterGain, reverbIn, reverbOut, delayIn, delayNode;
  let mDry, mRev, mDel, sDry, sRev, sDel;
  let padIn, padFilter, padLfoG, melIn, percIn, noiseBuf;
  const layers = {};
  let sfxVoices = 0;
  const lastPlay = Object.create(null);

  // sequencer
  let step = 0, chordIdx = 0, chordPos = 0, nextT = 0, lastTick = 0, timer = null;
  let padDirty = true, activePad = [];
  let melDeg = 4, melActive = true, arpIdx = 0, lastDelayTempo = 0;

  // ------------------------------------------------------------ node utils --
  function gainNode(v) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }
  function biquad(type, f, q) {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }
  function mkOut(dest, pan) {
    const g = ctx.createGain();
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(dest);
      return { g, nodes: [g, p] };
    }
    g.connect(dest);
    return { g, nodes: [g] };
  }
  function disconnectAll(nodes) {
    for (const n of nodes) {
      try { n.disconnect(); } catch (e) { /* already gone */ }
    }
  }
  function cleanupOn(src, nodes) {
    src.onended = () => disconnectAll(nodes);
  }
  function noiseSrc(t, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(t, Math.random() * (noiseBuf.duration - 0.2));
    s.stop(t + dur);
    return s;
  }
  function makeIR(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = ctx.createBuffer(2, len, rate);
    const pre = Math.floor(rate * 0.012);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const k = 0.25 + 0.68 * x; // darker as the tail goes on
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);
        const fadeIn = i < pre ? i / pre : 1;
        d[i] = lp * Math.pow(1 - x, decay) * fadeIn * (1 + k);
      }
    }
    return buf;
  }

  // ---------------------------------------------------------- music theory --
  function curChord() {
    return isl.chords[chordIdx % isl.chords.length];
  }
  function chordPcs(ch) {
    const s = new Set();
    for (const x of ch.t) s.add(mod(x, 12));
    return s;
  }
  function chordNotes(ch, lo, hi) {
    const pcs = chordPcs(ch);
    const out = [];
    for (let m = Math.ceil(lo); m <= hi; m++) if (pcs.has(mod(m - isl.tonic, 12))) out.push(m);
    return out;
  }
  function pentaMidi(deg, base) {
    const pn = isl.penta;
    const n = pn.length;
    return base + pn[mod(deg, n)] + 12 * Math.floor(deg / n);
  }
  const pit = (o) => (+o.pitch || 0);

  // ------------------------------------------------------------ instruments --
  // Additive note: parts = [[ratio, amp, decayTimeConstant], ...]
  function partialsNote(dest, t, f, amp, parts, pan = 0, attack = 0.004) {
    const { g, nodes } = mkOut(dest, pan);
    g.gain.value = amp;
    let end = t, longest = null;
    for (const [ratio, a, tc] of parts) {
      const fr = f * ratio;
      if (fr > 16000 || fr < 20) continue;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0, t);
      pg.gain.linearRampToValueAtTime(a, t + attack);
      pg.gain.setTargetAtTime(0, t + attack, tc);
      o.connect(pg);
      pg.connect(g);
      const e = t + attack + tc * 7 + 0.02;
      o.start(t);
      o.stop(e);
      nodes.push(pg);
      if (e > end) { end = e; longest = o; }
    }
    if (longest) cleanupOn(longest, nodes);
    else disconnectAll(nodes);
    return end;
  }
  const kal = (d, t, f, amp, dec = 1, pan = 0) =>
    partialsNote(d, t, f, amp, [[1, 1, 0.32 * dec], [6.02, 0.16, 0.03 * dec], [2.0, 0.12, 0.015]], pan, 0.003);
  const bell = (d, t, f, amp, dec = 1, pan = 0) =>
    partialsNote(d, t, f, amp, [[1, 1, 0.85 * dec], [2.01, 0.25, 0.45 * dec], [3.93, 0.16, 0.22 * dec], [5.41, 0.09, 0.1 * dec]], pan, 0.004);
  const marimba = (d, t, f, amp, dec = 1, pan = 0) =>
    partialsNote(d, t, f, amp, [[1, 1, 0.22 * dec], [3.93, 0.3, 0.04 * dec], [9.8, 0.06, 0.012]], pan, 0.002);
  const glass = (d, t, f, amp, dec = 1, pan = 0) =>
    partialsNote(d, t, f, amp, [[1, 1, 0.2 * dec], [2.76, 0.22, 0.07 * dec], [5.4, 0.08, 0.03 * dec]], pan, 0.003);

  function oscSweep(dest, t, o) {
    const type = o.type || 'sine';
    const f0 = o.f0, f1 = o.f1 != null ? o.f1 : o.f0;
    const dur = o.dur != null ? o.dur : 0.1;
    const amp = o.amp != null ? o.amp : 0.2;
    const attack = o.attack != null ? o.attack : 0.004;
    const tc = o.tc != null ? o.tc : 0.05;
    const { g, nodes } = mkOut(dest, o.pan || 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + attack);
    g.gain.setTargetAtTime(0, t + attack, tc);
    const end = t + Math.max(dur, attack + tc * 7) + 0.02;
    osc.connect(g);
    osc.start(t);
    osc.stop(end);
    cleanupOn(osc, nodes);
    return end;
  }

  function noiseSweep(dest, t, dur, o = {}) {
    const type = o.type || 'bandpass';
    const f0 = o.f0 || 1000;
    const f1 = o.f1 != null ? o.f1 : f0;
    const q = o.q != null ? o.q : 1;
    const amp = o.amp != null ? o.amp : 0.2;
    const attack = o.attack != null ? o.attack : 0.01;
    const tc = o.tc != null ? o.tc : Math.max(0.01, (dur - attack) / 4);
    const { g, nodes } = mkOut(dest, o.pan || 0);
    const len = Math.max(dur, attack + tc * 7);
    const s = noiseSrc(t, len + 0.02);
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    if (o.f2 != null) {
      const mt = t + dur * (o.mid != null ? o.mid : 0.5);
      fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), mt);
      fl.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
    } else if (f1 !== f0) {
      fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + attack);
    g.gain.setTargetAtTime(0, t + attack, tc);
    s.connect(fl);
    fl.connect(g);
    nodes.push(fl);
    cleanupOn(s, nodes);
    return t + len + 0.02;
  }

  // Sustained chord swell through a sweeping lowpass (dawn, travel, boss...).
  function swellChord(dest, t, midis, o = {}) {
    const amp = o.amp != null ? o.amp : 0.05;
    const attack = o.attack != null ? o.attack : 0.6;
    const hold = o.hold != null ? o.hold : 1.5;
    const release = o.release != null ? o.release : 0.8;
    const types = o.types || ['sawtooth', 'triangle'];
    const lp0 = o.lp0 || 400, lp1 = o.lp1 || 2400, lpT = o.lpT || 1.5;
    const detune = o.detune != null ? o.detune : 8;
    const { g, nodes } = mkOut(dest, 0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = o.q != null ? o.q : 0.7;
    lp.frequency.setValueAtTime(lp0, t);
    if (lp1 !== lp0) lp.frequency.exponentialRampToValueAtTime(lp1, t + lpT);
    lp.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(1, t, attack / 3);
    g.gain.setTargetAtTime(0, t + hold, release);
    const end = t + hold + release * 7;
    let first = null;
    for (const m of midis) {
      for (let k = 0; k < types.length; k++) {
        const osc = ctx.createOscillator();
        osc.type = types[k];
        osc.frequency.value = mtof(m);
        osc.detune.value = (k % 2 ? detune : -detune) + rnd(-3, 3);
        const og = ctx.createGain();
        og.gain.value = amp * (types[k] === 'sawtooth' ? 0.6 : 1);
        osc.connect(og);
        og.connect(lp);
        osc.start(t);
        osc.stop(end);
        nodes.push(og);
        if (!first) first = osc;
      }
    }
    nodes.push(lp);
    if (first) cleanupOn(first, nodes);
    else disconnectAll(nodes);
    return end;
  }

  // ------------------------------------------------------------ music voices --
  function padVoice(m, t, pan, amp) {
    const f = mtof(m);
    const { g, nodes } = mkOut(padIn, pan);
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(amp, t, 0.8);
    const oscs = [];
    const spec = [['sawtooth', -8, 0.45], ['sawtooth', 8, 0.45], ['triangle', 0, 0.9]];
    for (const [type, det, a] of spec) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det + rnd(-3, 3);
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(g);
      padLfoG.connect(o.detune);
      o.start(t);
      oscs.push(o);
      nodes.push(og);
    }
    return { g, nodes, oscs };
  }
  function releasePad(v, t) {
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, 1.0);
    const end = t + 7.5;
    for (const o of v.oscs) o.stop(end);
    v.oscs[0].onended = () => {
      for (const o of v.oscs) {
        try { padLfoG.disconnect(o.detune); } catch (e) { /* ok */ }
      }
      disconnectAll(v.nodes);
    };
  }
  function triggerPad(t) {
    for (const v of activePad) releasePad(v, t);
    activePad = [];
    const ch = curChord();
    const lo = isl.tonic - 5;
    const notes = chordNotes(ch, lo, lo + 11)
      .map((m, i) => (i % 2 === 1 ? m + 12 : m))
      .sort((a, b) => a - b);
    const n = notes.length;
    notes.forEach((m, i) => {
      const pan = n > 1 ? (i / (n - 1)) * 0.9 - 0.45 : 0;
      activePad.push(padVoice(m, t + i * 0.04, pan, 0.055));
    });
  }

  function bassNote(t, midi, dur, vel, muted) {
    const f = mtof(midi);
    const { g, nodes } = mkOut(layers.bass, 0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = muted ? 2 : 0.5;
    lp.frequency.setValueAtTime(muted ? 1100 : 600, t);
    if (muted) lp.frequency.setTargetAtTime(180, t, 0.08);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f;
    const g2 = gainNode(0.35);
    o1.connect(lp);
    o2.connect(g2);
    g2.connect(lp);
    lp.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.015);
    let end;
    if (muted) {
      g.gain.setTargetAtTime(0, t + 0.02, 0.12);
      end = t + 0.95;
    } else {
      g.gain.setTargetAtTime(vel * 0.7, t + 0.015, 0.4);
      g.gain.setTargetAtTime(0, t + dur, 0.25);
      end = t + dur + 1.8;
    }
    o1.start(t);
    o2.start(t);
    o1.stop(end);
    o2.stop(end);
    nodes.push(lp, g2);
    cleanupOn(o1, nodes);
  }

  function arpNote(t, f, amp, pan) {
    switch (isl.arp) {
      case 'marimba': return marimba(layers.arp, t, f, amp * 1.1, 1.6, pan);
      case 'glass': return glass(layers.arp, t, f, amp * 0.9, 2.2, pan);
      case 'bell': return bell(layers.arp, t, f, amp * 0.75, 0.7, pan);
      default: return kal(layers.arp, t, f, amp, 1.2, pan);
    }
  }
  function vibesNote(t, f, amp, pan) {
    return partialsNote(melIn, t, f, amp, [[1, 1, 0.55], [4.0, 0.2, 0.09], [10.0, 0.04, 0.02]], pan, 0.005);
  }

  // percussion (soft lofi kit)
  function kick(t, vel) {
    const { g, nodes } = mkOut(percIn, 0);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, 0.09);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.75);
    cleanupOn(o, nodes);
  }
  function hat(t, vel, open) {
    const { g, nodes } = mkOut(percIn, rnd(-0.25, 0.25));
    const tc = open ? 0.07 : 0.018;
    const s = noiseSrc(t, tc * 7 + 0.02);
    const hp = biquad('highpass', 6500, 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.002, tc);
    s.connect(hp);
    hp.connect(g);
    nodes.push(hp);
    cleanupOn(s, nodes);
  }
  function shaker(t, vel) {
    const { g, nodes } = mkOut(percIn, rnd(-0.4, 0.4));
    const s = noiseSrc(t, 0.25);
    const bp = biquad('bandpass', 4800, 1.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.012);
    g.gain.setTargetAtTime(0, t + 0.012, 0.028);
    s.connect(bp);
    bp.connect(g);
    nodes.push(bp);
    cleanupOn(s, nodes);
  }
  function brush(t, vel) {
    const { g, nodes } = mkOut(percIn, 0.08);
    const s = noiseSrc(t, 0.55);
    const bp = biquad('bandpass', 2000, 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.003, 0.07);
    s.connect(bp);
    bp.connect(g);
    nodes.push(bp);
    cleanupOn(s, nodes);
    oscSweep(percIn, t, { type: 'triangle', f0: 190, f1: 170, dur: 0.05, amp: vel * 0.35, attack: 0.002, tc: 0.035 });
  }

  // nature
  function cricket(t, f, pulses, pan) {
    const { g, nodes } = mkOut(layers.crickets, pan);
    g.gain.value = rnd(0.5, 1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const am = gainNode(0);
    o.connect(am);
    am.connect(g);
    const pw = 0.022, gap = 0.048;
    for (let k = 0; k < pulses; k++) {
      const s = t + k * gap;
      am.gain.setValueAtTime(0, s);
      am.gain.linearRampToValueAtTime(1, s + 0.004);
      am.gain.linearRampToValueAtTime(0, s + pw);
    }
    const end = t + pulses * gap + 0.05;
    o.start(t);
    o.stop(end);
    nodes.push(am);
    cleanupOn(o, nodes);
  }
  function bird(t, pan) {
    const { g, nodes } = mkOut(layers.birds, pan);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const am = gainNode(0);
    o.connect(am);
    am.connect(g);
    const n = 2 + ((Math.random() * 4) | 0);
    const base = rnd(2400, 3600);
    let s = t;
    o.frequency.setValueAtTime(base, t);
    for (let k = 0; k < n; k++) {
      const d = rnd(0.05, 0.11);
      o.frequency.setValueAtTime(base * rnd(0.9, 1.05), s);
      o.frequency.exponentialRampToValueAtTime(base * rnd(1.15, 1.45), s + d * 0.45);
      o.frequency.exponentialRampToValueAtTime(base * rnd(0.8, 1.0), s + d);
      am.gain.setValueAtTime(0, s);
      am.gain.linearRampToValueAtTime(rnd(0.5, 1), s + 0.01);
      am.gain.linearRampToValueAtTime(0, s + d);
      s += d + rnd(0.04, 0.12);
    }
    o.start(t);
    o.stop(s + 0.05);
    nodes.push(am);
    cleanupOn(o, nodes);
  }

  // -------------------------------------------------------------- sequencer --
  function stepDur() {
    return 60 / P.tempo / 4;
  }

  function advance() {
    chordPos++;
    if (chordPos >= STEPS_PER_CHORD) {
      chordPos = 0;
      chordIdx = (chordIdx + 1) % isl.chords.length;
    }
    step++;
    if (step % 16 === 0 && pendingIsland !== null) {
      isl = ISLANDS[pendingIsland];
      pendingIsland = null;
      chordIdx = 0;
      chordPos = 0;
      padDirty = true;
      melDeg = 4;
      applyMood(1.3);
    }
  }

  function scheduleBass(t, tt, s16, ch, sd) {
    if (P.bassD < 0.02) return;
    const root = foldTo(isl.tonic + ch.b, 36, 47);
    if (P.perc > 0.5) {
      // lazy lofi groove, muted plucks
      const pat = { 0: [1, 0], 6: [0.55, 7], 8: [0.75, 0], 11: [0.35, 12], 14: [0.5, 7] };
      const e = pat[s16];
      if (e && chance(e[0] * (0.6 + 0.4 * intensityS))) bassNote(tt, root + e[1], sd * 2, 0.5 * rnd(0.85, 1), true);
    } else if (chordPos === 0) {
      bassNote(t, root, sd * 14, 0.42, false);
    } else if (chordPos === 16 && chance(P.bassD)) {
      bassNote(t, root, sd * 10, 0.36, false);
    } else if ((chordPos === 10 || chordPos === 26) && chance(0.3 * P.bassD)) {
      bassNote(tt, root + 7, sd * 5, 0.26, false);
    }
  }

  function scheduleStep(t) {
    const s16 = step % 16;
    const sd = stepDur();
    const ch = curChord();
    let sw = 0;
    if (s16 % 4 === 2) sw = sd * 0.3; // swung off-eighths
    else if (s16 % 2 === 1) sw = sd * 0.18;
    const tt = t + sw;

    // pads
    if (chordPos === 0 || padDirty) {
      triggerPad(t);
      padDirty = false;
    }
    if (s16 === 0 && chordPos % 16 === 0) melActive = chance(0.72);

    // bass
    scheduleBass(t, tt, s16, ch, sd);

    // arpeggio (8ths)
    if (s16 % 2 === 0 && chance(P.arpD * (s16 % 4 === 0 ? 1 : 0.75))) {
      const notes = chordNotes(ch, isl.tonic + 5, isl.tonic + 24);
      if (notes.length) {
        arpIdx += chance(0.15) ? 2 : 1;
        const L = notes.length;
        const cyc = Math.max(1, 2 * L - 2);
        const pos = mod(arpIdx, cyc);
        const idx = pos < L ? pos : cyc - pos;
        arpNote(tt + hum(), mtof(notes[clamp(idx, 0, L - 1)]), rnd(0.14, 0.22) * (s16 % 4 === 0 ? 1 : 0.8), rnd(-0.35, 0.35));
      }
    }

    // melody (random walk on the pentatonic)
    if (melActive && s16 % 2 === 0 && chance(P.melD * (s16 % 4 === 0 ? 1.2 : 0.7))) {
      let move = pickOne([-2, -1, -1, 0, 1, 1, 2]);
      if (chance(0.08)) move = pickOne([-4, 4]);
      melDeg = clamp(melDeg + move, -1, 11);
      if (s16 % 8 === 0) {
        const pcs = chordPcs(ch);
        for (const d of [0, 1, -1, 2, -2]) {
          const m = pentaMidi(melDeg + d, isl.tonic);
          if (pcs.has(mod(m - isl.tonic, 12))) { melDeg = clamp(melDeg + d, -1, 11); break; }
        }
      }
      vibesNote(tt + hum(), mtof(pentaMidi(melDeg, isl.tonic)), rnd(0.16, 0.24), rnd(-0.3, 0.3));
    }

    // music-box bells (quarters)
    if (s16 % 4 === 0 && chance(P.bellD)) {
      const ns = chordNotes(ch, isl.tonic + 12, isl.tonic + 31);
      if (ns.length) {
        const m = pickOne(ns);
        bell(layers.bell, tt + rnd(0, 0.02), mtof(m), rnd(0.1, 0.16), 1.2, rnd(-0.6, 0.6));
        if (chance(0.25)) {
          const m2 = pickOne(ns);
          if (m2 !== m) bell(layers.bell, tt + sd * 2 + rnd(0, 0.02), mtof(m2), rnd(0.07, 0.11), 1.2, rnd(-0.6, 0.6));
        }
      }
    }

    // percussion (battle)
    if (P.perc > 0.02) {
      const I = intensityS;
      if (s16 % 2 === 0) hat(tt + hum(), (s16 % 4 === 0 ? 0.2 : 0.13) * rnd(0.8, 1.1), s16 === 14 && chance(0.3));
      if (s16 === 0) kick(t, 0.55);
      if (s16 === 10 && I > 0.2) kick(tt, 0.45);
      if (s16 === 7 && I > 0.8 && chance(0.5)) kick(tt, 0.3);
      if ((s16 === 4 || s16 === 12) && I > 0.45) brush(tt + hum(), 0.3);
      if (s16 % 2 === 1 && I > 0.65) shaker(tt + hum(), 0.09 * rnd(0.7, 1.1));
    }

    // nature
    if (P.crickets > 0.03 && s16 % 4 === 0 && chance(0.55)) {
      cricket(t + rnd(0, sd * 3), rnd(4100, 4800), 3 + ((Math.random() * 3) | 0), rnd(-0.8, 0.8));
    }
    if (P.birds > 0.05 && s16 === 0 && chance(0.3)) {
      bird(t + rnd(0, sd * 8), rnd(-0.8, 0.8));
    }
  }

  function tick() {
    if (!ctx) return;
    if (ctx.state !== 'running') {
      lastTick = ctx.currentTime;
      return;
    }
    const now = ctx.currentTime;
    const dt = clamp(now - lastTick, 0, 1);
    lastTick = now;
    const k = 1 - Math.exp(-dt / 2.2);
    for (const key of PARAM_KEYS) P[key] += (mood[key] - P[key]) * k;
    intensityS += (intensity - intensityS) * (1 - Math.exp(-dt / 1.2));

    if (Math.abs(P.tempo - lastDelayTempo) > 0.5) {
      delayNode.delayTime.setTargetAtTime(0.75 * 60 / P.tempo, now, 0.5);
      lastDelayTempo = P.tempo;
    }

    // Fell behind (tab was backgrounded / context suspended): skip, don't burst.
    if (nextT < now - 0.15) {
      let guard = 0;
      while (nextT < now && guard++ < 5000) {
        nextT += stepDur();
        advance();
      }
      padDirty = true;
    }
    const ahead = (typeof document !== 'undefined' && document.hidden) ? 1.2 : LOOKAHEAD;
    let guard = 0;
    while (nextT < now + ahead && guard++ < 64) {
      try {
        scheduleStep(Math.max(nextT, now + 0.005));
      } catch (e) { /* never let the music loop die */ }
      nextT += stepDur();
      advance();
    }
  }

  // ------------------------------------------------------------------ mixing --
  function applyMood(tc = 1.3) {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const key of LAYER_KEYS) layers[key].gain.setTargetAtTime(mood[key] * LAYER_TRIM[key], now, tc);
    padFilter.frequency.setTargetAtTime(mood.bright * isl.bright, now, tc * 1.2);
    reverbOut.gain.setTargetAtTime(0.85 * mood.rev * isl.rev, now, tc);
  }
  function applyVolumes(tc = 0.08) {
    if (!ctx) return;
    const now = ctx.currentTime;
    masterGain.gain.setTargetAtTime(vols.master * 0.8, now, tc);
    const mv = vols.music * duckMul * MUSIC_TRIM;
    for (const n of [mDry, mRev, mDel]) n.gain.setTargetAtTime(mv, now, tc);
    for (const n of [sDry, sRev, sDel]) n.gain.setTargetAtTime(vols.sfx, now, tc);
  }

  function buildGraph() {
    // shared noise
    const nlen = Math.floor(ctx.sampleRate * 3);
    noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    // master: preMaster -> warm shelf -> compressor -> master gain -> out
    masterGain = gainNode(0);
    masterGain.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    comp.connect(masterGain);
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 9000;
    shelf.gain.value = -2.5;
    shelf.connect(comp);
    preMaster = gainNode(1);
    preMaster.connect(shelf);

    // reverb
    reverbIn = gainNode(1);
    const revHP = biquad('highpass', 180, 0.5);
    const convolver = ctx.createConvolver();
    convolver.buffer = makeIR(3.6, 2.4);
    reverbOut = gainNode(0.85);
    reverbIn.connect(revHP);
    revHP.connect(convolver);
    convolver.connect(reverbOut);
    reverbOut.connect(preMaster);

    // tape delay
    delayIn = gainNode(1);
    delayNode = ctx.createDelay(4);
    delayNode.delayTime.value = 0.6;
    const fb = gainNode(0.38);
    const dLP = biquad('lowpass', 2300, 0.5);
    const dHP = biquad('highpass', 260, 0.5);
    delayIn.connect(delayNode);
    delayNode.connect(dLP);
    dLP.connect(dHP);
    dHP.connect(fb);
    fb.connect(delayNode);
    const delayOut = gainNode(0.5);
    dHP.connect(delayOut);
    delayOut.connect(preMaster);
    const d2r = gainNode(0.3);
    delayOut.connect(d2r);
    d2r.connect(reverbIn);
    const wow = ctx.createOscillator();
    wow.frequency.value = 0.35;
    const wowG = gainNode(0.0025);
    wow.connect(wowG);
    wowG.connect(delayNode.delayTime);
    wow.start();

    // volume buses (dry / reverb send / delay send) for music and sfx
    mDry = gainNode(0); mRev = gainNode(0); mDel = gainNode(0);
    sDry = gainNode(0); sRev = gainNode(0); sDel = gainNode(0);
    mDry.connect(preMaster); mRev.connect(reverbIn); mDel.connect(delayIn);
    sDry.connect(preMaster); sRev.connect(reverbIn); sDel.connect(delayIn);

    // music layers
    for (const key of LAYER_KEYS) {
      const g = gainNode(0);
      g.connect(mDry);
      const [r, d] = LAYER_SENDS[key];
      if (r) { const s = gainNode(r); g.connect(s); s.connect(mRev); }
      if (d) { const s = gainNode(d); g.connect(s); s.connect(mDel); }
      layers[key] = g;
    }

    // pad chain with slow filter breathing + shared vibrato LFO
    padIn = gainNode(1);
    const padHP = biquad('highpass', 90, 0.6);
    padFilter = biquad('lowpass', 1500, 0.8);
    padIn.connect(padHP);
    padHP.connect(padFilter);
    padFilter.connect(layers.pad);
    const pfl = ctx.createOscillator();
    pfl.frequency.value = 0.05;
    const pflG = gainNode(260);
    pfl.connect(pflG);
    pflG.connect(padFilter.frequency);
    pfl.start();
    const padLfo = ctx.createOscillator();
    padLfo.frequency.value = 0.21;
    padLfoG = gainNode(5);
    padLfo.connect(padLfoG);
    padLfo.start();

    // melody tremolo (vibraphone feel)
    melIn = gainNode(0.8);
    const trem = ctx.createOscillator();
    trem.frequency.value = 4.8;
    const tremG = gainNode(0.16);
    trem.connect(tremG);
    tremG.connect(melIn.gain);
    trem.start();
    melIn.connect(layers.mel);

    // percussion bus (soft, lofi)
    percIn = biquad('lowpass', 7200, 0.5);
    percIn.connect(layers.perc);

    // wind bed
    const wsrc = ctx.createBufferSource();
    wsrc.buffer = noiseBuf;
    wsrc.loop = true;
    const wbp = biquad('bandpass', 550, 0.55);
    const wamp = gainNode(0.6);
    wsrc.connect(wbp);
    wbp.connect(wamp);
    wamp.connect(layers.wind);
    const wl1 = ctx.createOscillator();
    wl1.frequency.value = 0.043;
    const wl1g = gainNode(300);
    wl1.connect(wl1g);
    wl1g.connect(wbp.frequency);
    const wl2 = ctx.createOscillator();
    wl2.frequency.value = 0.11;
    const wl2g = gainNode(0.35);
    wl2.connect(wl2g);
    wl2g.connect(wamp.gain);
    wsrc.start();
    wl1.start();
    wl2.start();
  }

  // --------------------------------------------------------------------- SFX --
  function sfxVoice(opts, baseVol, rev = 0.3, del = 0) {
    if (sfxVoices >= MAX_VOICES) return null;
    const vol = baseVol * (opts.vol == null ? 1 : clamp(+opts.vol || 0, 0, 1.5));
    sfxVoices++;
    const inp = gainNode(vol);
    const nodes = [inp];
    let out = inp;
    const pan = +opts.pan || 0;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      inp.connect(p);
      nodes.push(p);
      out = p;
    }
    out.connect(sDry);
    if (rev > 0) { const s = gainNode(rev); out.connect(s); s.connect(sRev); nodes.push(s); }
    if (del > 0) { const s = gainNode(del); out.connect(s); s.connect(sDel); nodes.push(s); }
    let end = ctx.currentTime + 0.1;
    return {
      in: inp,
      at(e) { if (e > end) end = e; return e; },
      done() {
        const ms = Math.max(0, end - ctx.currentTime) * 1000 + 300;
        setTimeout(() => {
          disconnectAll(nodes);
          sfxVoices = Math.max(0, sfxVoices - 1);
        }, ms);
      },
    };
  }

  const SFX = {
    coin(o, t) {
      const v = sfxVoice(o, 0.5, 0.3, 0.12); if (!v) return;
      const m = pentaMidi(mod(o.i | 0, 10), isl.tonic + 12) + pit(o);
      v.at(kal(v.in, t, mtof(m), 0.5, 1.1));
      v.at(glass(v.in, t + 0.015, mtof(m + 12), 0.1, 0.7));
      v.done();
    },
    coinPay(o, t) {
      const v = sfxVoice(o, 0.5, 0.3, 0.08); if (!v) return;
      const m = pentaMidi(mod(o.i | 0, 10), isl.tonic) + pit(o);
      v.at(marimba(v.in, t, mtof(m), 0.55, 1.3));
      v.at(glass(v.in, t + 0.01, mtof(m + 24), 0.05, 0.5));
      v.done();
    },
    build(o, t) {
      const v = sfxVoice(o, 0.55, 0.5, 0.18); if (!v) return;
      const p0 = pit(o);
      const ns = chordNotes(curChord(), isl.tonic, isl.tonic + 26).slice(0, 7);
      ns.forEach((m, k) => {
        v.at(bell(v.in, t + 0.06 * k, mtof(m + p0), 0.22 - k * 0.015, 0.9));
        v.at(kal(v.in, t + 0.06 * k, mtof(m + p0 + 12), 0.08, 0.8));
      });
      v.at(noiseSweep(v.in, t, 0.5, { f0: 400, f1: 3800, q: 0.8, amp: 0.1, attack: 0.25, tc: 0.12 }));
      v.at(oscSweep(v.in, t, { f0: 120, f1: 45, dur: 0.18, amp: 0.45, tc: 0.08 }));
      v.done();
    },
    upgrade(o, t) {
      const v = sfxVoice(o, 0.6, 0.55, 0.2); if (!v) return;
      const ch = curChord(), p0 = pit(o);
      const ns = chordNotes(ch, isl.tonic - 5, isl.tonic + 31).slice(0, 10);
      ns.forEach((m, k) => v.at(bell(v.in, t + 0.045 * k, mtof(m + p0), 0.2, 1.1, k % 2 ? 0.3 : -0.3)));
      const top = chordNotes(ch, isl.tonic + 7, isl.tonic + 20).map((m) => m + p0);
      v.at(swellChord(v.in, t + 0.1, top, { amp: 0.035, attack: 0.4, hold: 0.9, release: 0.5, types: ['triangle', 'sine'], lp0: 1200, lp1: 5000, lpT: 0.8 }));
      v.at(noiseSweep(v.in, t, 0.7, { f0: 300, f1: 5000, q: 0.7, amp: 0.12, attack: 0.35, tc: 0.15 }));
      v.at(oscSweep(v.in, t, { f0: 130, f1: 40, dur: 0.25, amp: 0.5, tc: 0.1 }));
      v.done();
    },
    shoot(o, t) {
      const v = sfxVoice(o, 0.28, 0.2, 0.05); if (!v) return;
      const deg = o.i != null ? mod(o.i | 0, 10) : (Math.random() * 10) | 0;
      const f = mtof(pentaMidi(deg, isl.tonic + 12) + pit(o));
      v.at(oscSweep(v.in, t, { f0: f * 0.7, f1: f * 1.6, dur: 0.07, amp: 0.3, attack: 0.004, tc: 0.045 }));
      v.at(oscSweep(v.in, t + 0.035, { f0: f, f1: f * 1.9, dur: 0.05, amp: 0.12, tc: 0.03 }));
      v.done();
    },
    towerShoot(o, t) {
      const v = sfxVoice(o, 0.2, 0.2, 0); if (!v) return;
      const ns = chordNotes(curChord(), isl.tonic + 7, isl.tonic + 19);
      const m = (ns.length ? pickOne(ns) : isl.tonic + 12) + pit(o);
      v.at(marimba(v.in, t, mtof(m), 0.45, 0.5));
      v.at(noiseSweep(v.in, t, 0.03, { f0: 2500, f1: 1800, q: 2, amp: 0.12, attack: 0.002, tc: 0.008 }));
      v.done();
    },
    hit(o, t) {
      const v = sfxVoice(o, 0.35, 0.12, 0); if (!v) return;
      const pf = Math.pow(2, pit(o) / 12);
      v.at(oscSweep(v.in, t, { f0: 180 * pf, f1: 65 * pf, dur: 0.1, amp: 0.5, tc: 0.05 }));
      v.at(oscSweep(v.in, t + 0.01, { type: 'triangle', f0: 380 * pf, f1: 140 * pf, dur: 0.08, amp: 0.12, tc: 0.03 }));
      v.at(noiseSweep(v.in, t, 0.08, { type: 'lowpass', f0: 1400, f1: 400, q: 0.8, amp: 0.2, attack: 0.003, tc: 0.02 }));
      v.done();
    },
    heal(o, t) {
      const v = sfxVoice(o, 0.5, 0.6, 0.22); if (!v) return;
      const p0 = pit(o);
      const s = 2 + ((Math.random() * 4) | 0);
      const degs = [s, s + 2, s + 3, s + 5, s + 7];
      degs.forEach((d, k) => v.at(bell(v.in, t + k * 0.045, mtof(pentaMidi(d, isl.tonic + 12) + p0), 0.2 - k * 0.02, 0.8, (k - 2) * 0.2)));
      for (let k = 0; k < 3; k++) {
        v.at(glass(v.in, t + 0.12 + k * 0.07 + rnd(0, 0.03), mtof(pentaMidi(s + 8 + k, isl.tonic + 12) + p0), 0.06, 0.6, rnd(-0.6, 0.6)));
      }
      v.at(noiseSweep(v.in, t, 0.45, { type: 'highpass', f0: 6000, f1: 9000, q: 0.5, amp: 0.04, attack: 0.05, tc: 0.12 }));
      v.done();
    },
    dawn(o, t) {
      const v = sfxVoice(o, 0.55, 0.6, 0.1); if (!v) return;
      const ch = curChord(), p0 = pit(o);
      const ns = chordNotes(ch, isl.tonic - 5, isl.tonic + 6).map((m, i) => (i % 2 ? m + 12 : m) + p0);
      v.at(swellChord(v.in, t, ns, { amp: 0.05, attack: 1.2, hold: 2.2, release: 0.6, lp0: 300, lp1: 2800, lpT: 2.0 }));
      const hi = chordNotes(ch, isl.tonic + 12, isl.tonic + 30);
      if (hi.length) {
        [0.6, 1.0, 1.4, 1.9].forEach((d, k) => {
          v.at(bell(v.in, t + d, mtof(hi[(k * 2) % hi.length] + p0), 0.12, 1.3, k % 2 ? 0.4 : -0.4));
        });
      }
      v.at(swellChord(v.in, t, [foldTo(isl.tonic + ch.b, 36, 47) + p0], { amp: 0.12, attack: 1.0, hold: 2.0, release: 0.7, types: ['sine'], lp0: 400, lp1: 400, lpT: 1 }));
      v.done();
    },
    nightStart(o, t) {
      const v = sfxVoice(o, 0.6, 0.7, 0.1); if (!v) return;
      duck(0.35, 2.5);
      const f0 = mtof(foldTo(isl.tonic, 38, 49) + pit(o));
      v.at(partialsNote(v.in, t, f0, 0.45, [[1, 1, 1.6], [2.0, 0.45, 1.1], [2.76, 0.3, 0.8], [3.8, 0.18, 0.5], [5.2, 0.1, 0.3], [0.5, 0.4, 1.8]], 0, 0.02));
      v.at(noiseSweep(v.in, t + 0.2, 2.4, { f0: 600, f1: 7000, q: 1.2, amp: 0.06, attack: 1.8, tc: 0.25 }));
      for (let k = 0; k < 8; k++) {
        v.at(glass(v.in, t + 0.7 + k * 0.13, mtof(pentaMidi(k + 3, isl.tonic + 12) + pit(o)), 0.06 + k * 0.006, 0.9, k % 2 ? 0.4 : -0.4));
      }
      v.done();
    },
    waveStart(o, t) {
      const v = sfxVoice(o, 0.45, 0.5, 0.15); if (!v) return;
      const r = foldTo(isl.tonic, 45, 56) + pit(o);
      v.at(swellChord(v.in, t, [r, r + 7], { amp: 0.09, attack: 0.35, hold: 0.7, release: 0.35, types: ['sawtooth', 'triangle'], lp0: 350, lp1: 950, lpT: 0.4, q: 1.5, detune: 6 }));
      v.at(noiseSweep(v.in, t, 1.0, { f0: 800, f1: 1200, q: 1.5, amp: 0.035, attack: 0.3, tc: 0.2 }));
      v.done();
    },
    flower(o, t) {
      const v = sfxVoice(o, 0.3, 0.5, 0.25); if (!v) return;
      const m = pentaMidi(mod(o.i | 0, 10), isl.tonic + 12) + pit(o);
      v.at(bell(v.in, t, mtof(m), 0.3, 0.45));
      v.done();
    },
    wobble(o, t) {
      const v = sfxVoice(o, 0.4, 0.3, 0.1); if (!v) return;
      const f = mtof(pentaMidi(mod(o.i | 0, 10), isl.tonic) + pit(o));
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * 1.25, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(13, t);
      lfo.frequency.linearRampToValueAtTime(6, t + 0.6);
      const lg = gainNode(0);
      lg.gain.setValueAtTime(f * 0.07, t);
      lg.gain.setTargetAtTime(0, t, 0.18);
      lfo.connect(lg);
      lg.connect(osc.frequency);
      const g = gainNode(0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.006);
      g.gain.setTargetAtTime(0, t + 0.006, 0.17);
      osc.connect(g);
      g.connect(v.in);
      const end = t + 1.3;
      osc.start(t);
      lfo.start(t);
      osc.stop(end);
      lfo.stop(end);
      osc.onended = () => disconnectAll([g, lg]);
      v.at(end);
      v.at(oscSweep(v.in, t, { type: 'triangle', f0: f * 2.4, f1: f * 2, dur: 0.08, amp: 0.08, tc: 0.08 }));
      v.done();
    },
    ui(o, t) {
      const v = sfxVoice(o, 0.25, 0.2, 0); if (!v) return;
      const m = pentaMidi(o.i != null ? mod(o.i | 0, 10) : 5, isl.tonic + 12) + pit(o);
      v.at(kal(v.in, t, mtof(m), 0.35, 0.35));
      v.at(noiseSweep(v.in, t, 0.012, { type: 'highpass', f0: 5000, f1: 5000, q: 0.5, amp: 0.05, attack: 0.001, tc: 0.003 }));
      v.done();
    },
    uiHover(o, t) {
      const v = sfxVoice(o, 0.08, 0.1, 0); if (!v) return;
      v.at(glass(v.in, t, mtof(isl.tonic + 31 + pit(o)), 0.3, 0.25));
      v.done();
    },
    dash(o, t) {
      const v = sfxVoice(o, 0.35, 0.25, 0.05); if (!v) return;
      v.at(noiseSweep(v.in, t, 0.42, { f0: 500, f1: 2800, f2: 700, mid: 0.4, q: 1.1, amp: 0.3, attack: 0.07, tc: 0.08 }));
      const f = mtof(pentaMidi(4, isl.tonic) + pit(o));
      v.at(oscSweep(v.in, t, { f0: f, f1: f * 2, dur: 0.2, amp: 0.06, attack: 0.03, tc: 0.06 }));
      v.done();
    },
    burst(o, t) {
      const v = sfxVoice(o, 0.6, 0.6, 0.2); if (!v) return;
      duck(0.3, 1.2);
      const ch = curChord(), p0 = pit(o);
      v.at(oscSweep(v.in, t, { f0: 120, f1: 36, dur: 0.9, amp: 0.55, attack: 0.01, tc: 0.35 }));
      const ns = chordNotes(ch, isl.tonic + 7, isl.tonic + 36).slice(0, 9);
      ns.forEach((m, k) => v.at(bell(v.in, t + 0.03 * k, mtof(m + p0), 0.13, 0.9, ((k % 3) - 1) * 0.5)));
      v.at(noiseSweep(v.in, t, 1.0, { type: 'highpass', f0: 2500, f1: 7000, q: 0.5, amp: 0.08, attack: 0.15, tc: 0.25 }));
      const pad = chordNotes(ch, isl.tonic - 5, isl.tonic + 7).map((m) => m + p0);
      v.at(swellChord(v.in, t, pad, { amp: 0.03, attack: 0.25, hold: 0.9, release: 0.5, lp0: 3000, lp1: 900, lpT: 1.2 }));
      v.done();
    },
    hurt(o, t) {
      const v = sfxVoice(o, 0.4, 0.12, 0); if (!v) return;
      v.at(oscSweep(v.in, t, { f0: 140, f1: 52, dur: 0.18, amp: 0.55, tc: 0.08 }));
      v.at(noiseSweep(v.in, t, 0.14, { type: 'lowpass', f0: 700, f1: 250, q: 0.7, amp: 0.2, attack: 0.004, tc: 0.04 }));
      v.done();
    },
    grey(o, t) {
      const v = sfxVoice(o, 0.35, 0.5, 0.15); if (!v) return;
      const ns = chordNotes(curChord(), isl.tonic + 3, isl.tonic + 15);
      const m = (ns.length ? ns[ns.length - 1] : isl.tonic + 12) + pit(o);
      v.at(oscSweep(v.in, t, { type: 'triangle', f0: mtof(m), f1: mtof(m - 3), dur: 0.55, amp: 0.3, attack: 0.02, tc: 0.3 }));
      v.at(oscSweep(v.in, t + 0.05, { type: 'sine', f0: mtof(m - 5), f1: mtof(m - 8), dur: 0.6, amp: 0.18, attack: 0.03, tc: 0.32 }));
      v.done();
    },
    regrow(o, t) {
      const v = sfxVoice(o, 0.4, 0.5, 0.2); if (!v) return;
      const s = 2 + ((Math.random() * 3) | 0);
      for (let k = 0; k < 5; k++) {
        v.at(glass(v.in, t + k * 0.06, mtof(pentaMidi(s + k, isl.tonic + 12) + pit(o)), 0.16, 0.9, (k - 2) * 0.2));
      }
      v.at(noiseSweep(v.in, t, 0.5, { type: 'highpass', f0: 5000, f1: 8000, q: 0.5, amp: 0.035, attack: 0.2, tc: 0.1 }));
      v.done();
    },
    wish(o, t) {
      const v = sfxVoice(o, 0.5, 0.7, 0.25); if (!v) return;
      duck(0.2, 1.5);
      for (let k = 0; k < 12; k++) {
        v.at(bell(v.in, t + k * 0.038, mtof(pentaMidi(k, isl.tonic + 12) + pit(o)), 0.16 - k * 0.006, 0.9, Math.sin(k * 0.9) * 0.5));
      }
      const top = chordNotes(curChord(), isl.tonic + 19, isl.tonic + 31).map((m) => m + pit(o));
      v.at(swellChord(v.in, t + 0.4, top, { amp: 0.03, attack: 0.3, hold: 1.2, release: 0.6, types: ['sine', 'triangle'], lp0: 6000, lp1: 6000, lpT: 1 }));
      v.done();
    },
    firefly(o, t) {
      const v = sfxVoice(o, 0.18, 0.6, 0.2); if (!v) return;
      v.at(glass(v.in, t, mtof(pentaMidi(mod(o.i | 0, 10), isl.tonic + 24) + pit(o)), 0.4, 0.8));
      v.done();
    },
    travel(o, t) {
      const v = sfxVoice(o, 0.5, 0.6, 0.15); if (!v) return;
      duck(0.4, 3);
      const p0 = pit(o);
      v.at(noiseSweep(v.in, t, 3.2, { f0: 220, f1: 3200, f2: 300, mid: 0.45, q: 0.9, amp: 0.14, attack: 1.0, tc: 0.4 }));
      const ch = curChord();
      const ns = chordNotes(ch, isl.tonic - 5, isl.tonic + 6).map((m, i) => (i % 2 ? m + 12 : m) + p0);
      v.at(swellChord(v.in, t + 0.3, ns, { amp: 0.04, attack: 1.0, hold: 2.2, release: 0.8, lp0: 400, lp1: 2200, lpT: 1.8 }));
      const hi = chordNotes(ch, isl.tonic + 12, isl.tonic + 31);
      hi.forEach((m, k) => v.at(bell(v.in, t + 0.8 + k * 0.22, mtof(m + p0), 0.1, 1.2, k % 2 ? 0.5 : -0.5)));
      v.done();
    },
    achievement(o, t) {
      const v = sfxVoice(o, 0.5, 0.55, 0.2); if (!v) return;
      const p0 = pit(o);
      const ns = chordNotes(curChord(), isl.tonic + 12, isl.tonic + 30);
      if (!ns.length) { v.done(); return; }
      const n3 = [ns[0], ns[2] != null ? ns[2] : ns[ns.length - 1], ns[4] != null ? ns[4] : ns[ns.length - 1]];
      n3.forEach((m, k) => {
        const d = k * 0.12;
        v.at(bell(v.in, t + d, mtof(m + p0), 0.24, k === 2 ? 1.8 : 0.8));
        v.at(kal(v.in, t + d, mtof(m + p0 - 12), 0.12, 0.8));
      });
      for (let k = 0; k < 4; k++) {
        v.at(glass(v.in, t + 0.4 + k * 0.05, mtof(pentaMidi(7 + k, isl.tonic + 12) + p0), 0.06, 0.6, rnd(-0.6, 0.6)));
      }
      v.done();
    },
    deny(o, t) {
      const v = sfxVoice(o, 0.3, 0.1, 0); if (!v) return;
      const f = mtof(foldTo(isl.tonic, 45, 56) + pit(o));
      v.at(oscSweep(v.in, t, { f0: f, f1: f * 0.94, dur: 0.08, amp: 0.4, tc: 0.035 }));
      v.at(oscSweep(v.in, t + 0.11, { f0: f * 0.94, f1: f * 0.89, dur: 0.08, amp: 0.35, tc: 0.04 }));
      v.done();
    },
    chime(o, t) {
      const v = sfxVoice(o, 0.35, 0.65, 0.15); if (!v) return;
      const ns = chordNotes(curChord(), isl.tonic + 12, isl.tonic + 28).slice(0, 4);
      ns.forEach((m, k) => v.at(bell(v.in, t + k * 0.018, mtof(m + pit(o)), 0.18, 1.3, (k - 1.5) * 0.25)));
      v.done();
    },
    splash(o, t) {
      const v = sfxVoice(o, 0.35, 0.35, 0); if (!v) return;
      v.at(noiseSweep(v.in, t, 0.3, { type: 'lowpass', f0: 3800, f1: 450, q: 0.9, amp: 0.3, attack: 0.005, tc: 0.08 }));
      for (let k = 0; k < 4; k++) {
        const f0 = rnd(280, 520);
        v.at(oscSweep(v.in, t + rnd(0.02, 0.28), { f0, f1: f0 * rnd(2, 2.8), dur: 0.05, amp: 0.1, tc: 0.02 }));
      }
      v.done();
    },
    bossSpawn(o, t) {
      const v = sfxVoice(o, 0.55, 0.6, 0.1); if (!v) return;
      duck(0.4, 3);
      const r = foldTo(isl.tonic, 33, 44) + pit(o);
      v.at(swellChord(v.in, t, [r, r + 3, r + 7, r + 12], { amp: 0.06, attack: 1.0, hold: 1.8, release: 0.6, types: ['sawtooth', 'triangle'], lp0: 160, lp1: 900, lpT: 1.8, q: 2, detune: 12 }));
      v.at(oscSweep(v.in, t, { f0: 70, f1: 38, dur: 2.0, amp: 0.35, attack: 0.6, tc: 0.7 }));
      const hi = chordNotes(curChord(), isl.tonic + 19, isl.tonic + 31);
      if (hi.length) v.at(bell(v.in, t + 2.3, mtof(hi[0] + pit(o)), 0.16, 1.4));
      if (hi.length > 1) v.at(bell(v.in, t + 2.45, mtof(hi[1] + pit(o)), 0.12, 1.4));
      v.done();
    },
    playerDown(o, t) {
      const v = sfxVoice(o, 0.35, 0.4, 0.1); if (!v) return;
      const f = mtof(foldTo(isl.tonic, 55, 66) + pit(o));
      const { g, nodes } = mkOut(v.in, 0);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.9);
      const bp = biquad('bandpass', 1400, 3);
      bp.frequency.setValueAtTime(1400, t);
      bp.frequency.exponentialRampToValueAtTime(260, t + 0.9);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.03);
      g.gain.setTargetAtTime(0, t + 0.5, 0.2);
      osc.connect(bp);
      bp.connect(g);
      nodes.push(bp);
      const end = t + 2;
      osc.start(t);
      osc.stop(end);
      cleanupOn(osc, nodes);
      v.at(end);
      v.done();
    },
    respawn(o, t) {
      const v = sfxVoice(o, 0.4, 0.55, 0.2); if (!v) return;
      for (let k = 0; k < 6; k++) {
        v.at(glass(v.in, t + k * 0.05, mtof(pentaMidi(k + 2, isl.tonic + 12) + pit(o)), 0.14, 0.8));
      }
      const ns = chordNotes(curChord(), isl.tonic + 12, isl.tonic + 26).slice(0, 3);
      ns.forEach((m, k) => v.at(bell(v.in, t + 0.32, mtof(m + pit(o)), 0.12, 1.2, (k - 1) * 0.4)));
      v.done();
    },
    hold(o, t) {
      const v = sfxVoice(o, 0.28, 0.25, 0.05); if (!v) return;
      v.at(marimba(v.in, t, mtof(pentaMidi(mod(o.i | 0, 10), isl.tonic) + pit(o)), 0.4, 0.5));
      v.done();
    },
  };

  // -------------------------------------------------------------- public API --
  function init() {
    try {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC({ latencyHint: 'interactive' });
      buildGraph();
      for (const key of PARAM_KEYS) P[key] = mood[key];
      intensityS = intensity;
      isReady = true;
      applyVolumes(0.6); // gentle fade-in
      applyMood(0.8);
      lastDelayTempo = 0;
      nextT = ctx.currentTime + 0.15;
      lastTick = ctx.currentTime;
      padDirty = true;
      timer = setInterval(tick, 25);
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      isReady = false;
      if (timer) clearInterval(timer);
      timer = null;
      try { if (ctx) ctx.close(); } catch (e2) { /* ignore */ }
      ctx = null;
    }
  }

  function setVolumes(v) {
    if (!v || typeof v !== 'object') return;
    for (const key of ['master', 'music', 'sfx']) {
      if (typeof v[key] === 'number' && isFinite(v[key])) vols[key] = clamp(v[key], 0, 1);
    }
    if (isReady) applyVolumes(0.08);
  }

  function setMood(m) {
    if (!MOODS[m] || m === moodName) return;
    moodName = m;
    mood = MOODS[m];
    if (isReady) applyMood(1.3);
  }

  function setIntensity(x) {
    intensity = clamp(+x || 0, 0, 1);
  }

  function setIsland(i) {
    i = clamp(i | 0, 0, ISLANDS.length - 1);
    if (!isReady) {
      islandIdx = i;
      isl = ISLANDS[i];
      pendingIsland = null;
      return;
    }
    if (i === islandIdx) return;
    islandIdx = i;
    pendingIsland = i; // switches cleanly at the next bar
  }

  function play(name, opts) {
    if (!isReady || !ctx) return;
    const fn = SFX[name];
    if (!fn) return;
    try {
      const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const last = lastPlay[name] || 0;
      if (nowMs - last < 40) return; // max ~25 per second per sound
      lastPlay[name] = nowMs;
      if (sfxVoices >= MAX_VOICES) return;
      if (ctx.state === 'suspended') ctx.resume();
      fn(opts || {}, ctx.currentTime + 0.01);
    } catch (e) { /* sounds must never break the game */ }
  }

  function duck(amount = 0.5, seconds = 1.5) {
    if (!isReady || !ctx) return;
    try {
      duckMul = 1 - clamp(+amount || 0, 0, 1);
      applyVolumes(0.08);
      clearTimeout(duckTimer);
      duckTimer = setTimeout(() => {
        duckMul = 1;
        if (ctx) {
          const now = ctx.currentTime;
          const mv = vols.music * MUSIC_TRIM;
          for (const n of [mDry, mRev, mDel]) n.gain.setTargetAtTime(mv, now, 0.6);
        }
      }, Math.max(0, +seconds || 0) * 1000);
    } catch (e) { /* ignore */ }
  }

  return {
    init,
    get ready() { return isReady; },
    setVolumes,
    setMood,
    setIntensity,
    setIsland,
    play,
    duck,
  };
})();
