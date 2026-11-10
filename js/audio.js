// =====================================================================
//  Procedural music and sound effects (Web Audio only, nothing loaded)
//  - generative ambient score per race, shaped by season, daylight and danger
//  - sound effects found by diffing game state once a second (no engine hooks)
//  - off by default; the AudioContext is created only on a user gesture
// =====================================================================
'use strict';

(() => {
  const LS_KEY = 'emberCrown_audio';
  const cfg = { on: false, music: 0.5, fx: 0.7 };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch (e) { /* storage blocked */ }
  const saveCfg = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } };

  const game = () => { try { return typeof S !== 'undefined' ? S : null; } catch (e) { return null; } };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = Math.random;
  const pick = a => a[Math.floor(rnd() * a.length)];

  // ---------------------------------------------------------------
  // Audio graph
  // ---------------------------------------------------------------
  let ctx = null, master, musicBus, musicFilter, fxBus, revIn, noiseBuf = null;
  const stats = { nodes: 0, notes: 0, fx: 0, ticks: 0, tickAvgMs: 0, tickMaxMs: 0, pollAvgMs: 0, lastFx: null, fxLog: [] };
  const N = node => { stats.nodes++; return node; };

  const ensureCtx = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = N(ctx.createGain()); master.gain.value = 0.9; master.connect(ctx.destination);
    // one feedback-delay reverb shared by music and effects
    revIn = N(ctx.createGain()); revIn.gain.value = 1;
    const d1 = N(ctx.createDelay(1)); d1.delayTime.value = 0.31;
    const fb = N(ctx.createGain()); fb.gain.value = 0.42;
    const damp = N(ctx.createBiquadFilter()); damp.type = 'lowpass'; damp.frequency.value = 2200;
    const wet = N(ctx.createGain()); wet.gain.value = 0.32;
    revIn.connect(d1); d1.connect(damp); damp.connect(fb); fb.connect(d1); damp.connect(wet); wet.connect(master);
    musicBus = N(ctx.createGain()); musicBus.gain.value = cfg.music * 0.55;
    musicFilter = N(ctx.createBiquadFilter()); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 2400; musicFilter.Q.value = 0.4;
    musicFilter.connect(musicBus); musicBus.connect(master);
    const mSend = N(ctx.createGain()); mSend.gain.value = 0.7; musicBus.connect(mSend); mSend.connect(revIn);
    fxBus = N(ctx.createGain()); fxBus.gain.value = cfg.fx * 0.8; fxBus.connect(master);
    const fSend = N(ctx.createGain()); fSend.gain.value = 0.25; fxBus.connect(fSend); fSend.connect(revIn);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = rnd() * 2 - 1;
    return ctx;
  };

  // ---- small building blocks ----
  const env = (g, t, a, peak, dur, end = 0.0008) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + dur);
  };
  const tone = (type, f, t, len, dest) => {
    const o = N(ctx.createOscillator()); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(dest); o.start(t); o.stop(t + len + 0.05); return o;
  };
  const gainNode = dest => { const g = N(ctx.createGain()); g.connect(dest); return g; };
  const filt = (type, f, q, dest) => { const b = N(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; };
  const noise = (t, len, dest) => { const s = N(ctx.createBufferSource()); s.buffer = noiseBuf; s.loop = true; s.connect(dest); s.start(t, rnd() * 0.5); s.stop(t + len + 0.05); return s; };

  // ---------------------------------------------------------------
  // Instruments: fn(t, midi, dur, vel, dest)
  // ---------------------------------------------------------------
  const INST = {
    pluck(t, m, dur, v, dest) {              // lute-like
      const g = gainNode(dest); env(g, t, 0.004, 0.22 * v, Math.max(0.35, dur * 1.6));
      const lp = filt('lowpass', 3200, 1.2, g);
      lp.frequency.setValueAtTime(3600, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.4);
      const len = Math.max(0.4, dur * 1.6) + 0.01;
      tone('triangle', mtof(m), t, len, lp);
      const sg = gainNode(lp); sg.gain.value = 0.3; tone('sawtooth', mtof(m) * 1.002, t, len, sg);
    },
    harp(t, m, dur, v, dest) {
      const g = gainNode(dest); env(g, t, 0.003, 0.16 * v, 1.4);
      const lp = filt('lowpass', 2600, 0.7, g);
      tone('triangle', mtof(m), t, 1.4, lp); tone('sine', mtof(m + 12), t, 1.4, lp);
    },
    flute(t, m, dur, v, dest) {
      const g = gainNode(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * v, t + 0.12);
      g.gain.setValueAtTime(0.09 * v, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.25);
      const o = tone('sine', mtof(m), t, dur + 0.3, g);
      const lg = N(ctx.createGain()); lg.gain.value = mtof(m) * 0.006; lg.connect(o.frequency);
      tone('sine', 5.2, t, dur + 0.3, lg);
      const breath = gainNode(g); breath.gain.value = 0.05; noise(t, 0.1, filt('bandpass', mtof(m) * 2, 3, breath));
    },
    bowed(t, m, dur, v, dest) {              // deep bowed string
      const g = gainNode(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12 * v, t + 0.35);
      g.gain.setValueAtTime(0.12 * v, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.6);
      const lp = filt('lowpass', 900, 0.8, g);
      tone('sawtooth', mtof(m), t, dur + 0.7, lp); tone('sawtooth', mtof(m) * 1.004, t, dur + 0.7, lp);
    },
    bell(t, m, dur, v, dest) {               // FM anvil / bell
      const f = mtof(m), g = gainNode(dest); env(g, t, 0.002, 0.11 * v, 1.8);
      const c = tone('sine', f, t, 1.9, g);
      const mg = N(ctx.createGain()); mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.2);
      mg.connect(c.frequency); tone('sine', f * 2.76, t, 1.9, mg);
    },
    pad(t, m, dur, v, dest) {
      const g = gainNode(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * v, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.1);
      for (const c of [-7, 7]) { const o = tone('triangle', mtof(m), t, dur * 1.15, g); o.detune.value = c; }
    },
    chirp(t, m, dur, v, dest) {              // birdsong
      const g = gainNode(dest); const n = 2 + Math.floor(rnd() * 3), base = 2400 + rnd() * 1600;
      g.gain.setValueAtTime(0.0001, t);
      const o = tone('sine', base, t, n * 0.11 + 0.05, g);
      for (let i = 0; i < n; i++) {
        const s = t + i * 0.11;
        o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.3 + rnd() * 0.4), s + 0.05);
        g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(0.03 * v, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, s + 0.08);
      }
    },
    taiko(t, m, dur, v, dest) {
      const g = gainNode(dest); env(g, t, 0.002, 0.5 * v, 0.55);
      const o = tone('sine', 140, t, 0.6, g); o.frequency.exponentialRampToValueAtTime(48, t + 0.3);
      const ng = gainNode(dest); env(ng, t, 0.001, 0.15 * v, 0.08); noise(t, 0.1, filt('lowpass', 400, 0.7, ng));
    },
    reed(t, m, dur, v, dest) {               // raspy reed (duduk / shawm)
      const g = gainNode(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08 * v, t + 0.07);
      g.gain.setValueAtTime(0.08 * v, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.2);
      const bp = filt('bandpass', 1100, 1.1, g); const lp = filt('lowpass', 2600, 0.5, bp);
      const o = tone('sawtooth', mtof(m), t, dur + 0.25, lp);
      o.frequency.setValueAtTime(mtof(m - 1), t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.09); // scoop up
      const rasp = gainNode(g); rasp.gain.value = 0.25; noise(t, dur + 0.2, filt('bandpass', 1800, 2, rasp));
    },
    whistle(t, m, dur, v, dest) {            // tin whistle: bright, breathy, quick vibrato
      const g = gainNode(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * v, t + 0.04);
      g.gain.setValueAtTime(0.06 * v, t + dur * 0.75); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.15);
      const lp = filt('lowpass', 4200, 0.6, g);
      const o = tone('triangle', mtof(m), t, dur + 0.2, lp);
      o.frequency.setValueAtTime(mtof(m + 1), t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.05);   // a little flick into the note
      const sq = gainNode(lp); sq.gain.value = 0.18; tone('square', mtof(m), t, dur + 0.2, sq);
      const lg = N(ctx.createGain()); lg.gain.value = mtof(m) * 0.009; lg.connect(o.frequency);
      tone('sine', 6.3, t + dur * 0.3, dur * 0.7 + 0.2, lg);
      const breath = gainNode(g); breath.gain.value = 0.08; noise(t, 0.08, filt('bandpass', mtof(m) * 3, 4, breath));
    },
    glass(t, m, dur, v, dest) {              // glass bell: pure, slightly inharmonic partials, long shimmer
      const f = mtof(m);
      [[1, 0.07], [2.32, 0.03], [4.25, 0.018], [6.63, 0.008]].forEach(([k, a], i) => {
        const g = gainNode(dest); env(g, t, 0.002, a * v, 2.6 - i * 0.5);
        const o = tone('sine', f * k, t, 2.7, g); o.detune.value = (i % 2 ? 3 : -3);
      });
    },
    organ(t, m, dur, v, dest) {              // drawbar organ: octaves and a fifth, slow swell, no decay
      const g = gainNode(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045 * v, t + 0.5);
      g.gain.setValueAtTime(0.045 * v, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0008, t + dur + 0.8);
      const lp = filt('lowpass', 1400, 0.5, g);
      for (const [k, a] of [[0.5, 0.7], [1, 1], [1.5, 0.45], [2, 0.5], [4, 0.15]]) {
        const pg = gainNode(lp); pg.gain.value = a; tone('sine', mtof(m) * k, t, dur + 0.9, pg);
      }
    },
    toll(t, m, dur, v, dest) {               // distant tolling bell: low FM strike, long hum, muffled by distance
      const f = mtof(m), lp = filt('lowpass', 1100, 0.4, dest), g = gainNode(lp); env(g, t, 0.004, 0.16 * v, 5.5);
      const c = tone('sine', f, t, 5.6, g);
      const mg = N(ctx.createGain()); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + 3);
      mg.connect(c.frequency); tone('sine', f * 1.41, t, 5.6, mg);
      const hum = gainNode(lp); env(hum, t, 0.05, 0.05 * v, 6); tone('sine', f / 2, t, 6.1, hum);
    },
    swell(t, m, dur, v, dest) {              // a wave: filtered noise rising and falling
      const g = gainNode(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * v, t + dur * 0.45); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const lp = filt('lowpass', 300, 0.7, g);
      lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.45); lp.frequency.linearRampToValueAtTime(220, t + dur);
      noise(t, dur, lp);
    },
    gust(t, m, dur, v, dest) {               // wind gust: bandpassed noise whose pitch sweeps with the gust
      const g = gainNode(dest);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * v, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      const bp = filt('bandpass', 700, 2.5, g), f0 = 500 + rnd() * 500;
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f0 * (1.8 + rnd()), t + dur * 0.35); bp.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + dur);
      noise(t, dur, bp);
    },
  };

  // ---------------------------------------------------------------
  // Race themes
  // ---------------------------------------------------------------
  const MODES = {
    ionian: [0, 2, 4, 5, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
    phrygDom: [0, 1, 4, 5, 7, 8, 10], locrianish: [0, 1, 3, 5, 6, 8, 10],
    wholetone: [0, 2, 4, 6, 8, 10], harmMinor: [0, 2, 3, 5, 7, 8, 11],
  };
  const THEMES = {
    hearth: { root: 50, modes: ['mixolydian', 'ionian'], tense: 'aeolian', tempo: 84, prog: [0, 3, 4, 0, 5, 3, 6, 4],
      drone: { types: ['triangle', 'triangle'], ints: [-12, -5], gain: 0.05 } },
    delver: { root: 38, modes: ['dorian'], tense: 'phrygian', tempo: 64, prog: [0, 0, 6, 3, 0, 4, 2, 0],
      drone: { types: ['sawtooth', 'sawtooth'], ints: [0, 7], gain: 0.035 } },
    sylvan: { root: 55, modes: ['lydian'], tense: 'dorian', tempo: 74, prog: [0, 1, 0, 4, 5, 1, 3, 0],
      drone: { types: ['sine', 'triangle'], ints: [-12, -5], gain: 0.045 } },
    ash: { root: 40, modes: ['phrygian'], tense: 'phrygDom', tempo: 70, prog: [0, 1, 0, 6, 0, 1, 5, 0],
      drone: { types: ['sawtooth', 'sine'], ints: [0, -12], gain: 0.04 } },
    tide: { root: 50, modes: ['dorian', 'mixolydian'], tense: 'aeolian', tempo: 66, prog: [0, 3, 4, 0, 6, 3, 4, 0],
      drone: { types: ['triangle', 'sine'], ints: [-12, -5], gain: 0.04 } },
    veil: { root: 57, modes: ['lydian', 'wholetone'], tense: 'locrianish', tempo: 58, prog: [0, 1, 0, 3, 0, 1, 4, 0],
      drone: { types: ['sine', 'sine'], ints: [-12, -6], gain: 0.03 } },
    grave: { root: 36, modes: ['aeolian', 'harmMinor'], tense: 'locrianish', tempo: 52, prog: [0, 5, 3, 4, 0, 1, 5, 0],
      drone: { types: ['sawtooth', 'triangle'], ints: [0, -12], gain: 0.035 } },
    wind: { root: 62, modes: ['mixolydian', 'ionian'], tense: 'dorian', tempo: 80, prog: [0, 4, 0, 3, 0, 4, 3, 0],
      drone: { types: ['sine', 'triangle'], ints: [-24, -17], gain: 0.03 } },
  };
  //            spring summer autumn winter
  const SEASON = [{ tempo: 1, dens: 0.85, bright: 1 }, { tempo: 1.06, dens: 1, bright: 1.2 },
    { tempo: 0.95, dens: 0.72, bright: 0.85 }, { tempo: 0.82, dens: 0.42, bright: 0.6 }];

  // ---------------------------------------------------------------
  // Musical context read from the game (refreshed every tick, cheap)
  // ---------------------------------------------------------------
  let mood = { race: 'hearth', season: 0, day: 1, tense: false };
  let tenseCache = { t: 0, v: false };
  const readMood = () => {
    const s = game();
    if (!s || !s.empires || !s.empires.p) return mood = { race: 'hearth', season: 0, day: 0.8, tense: false, menu: true };
    let season = 0, day = 1, tense = false;
    try { season = G.season(s).index; } catch (e) { /* ignore */ }
    try { day = G.daylight(s); } catch (e) { /* ignore */ }
    const now = performance.now();
    if (now - tenseCache.t > 1000) { try { tenseCache = { t: now, v: incoming().length > 0 }; } catch (e) { tenseCache = { t: now, v: false }; } }
    tense = tenseCache.v;
    const race = THEMES[s.empires.p.race] ? s.empires.p.race : 'hearth';
    return mood = { race, season, day, tense };
  };

  // ---------------------------------------------------------------
  // Drones (persistent; rebuilt only when the race changes)
  // ---------------------------------------------------------------
  let drone = null;
  const stopDrone = () => {
    if (!drone) return;
    const t = ctx.currentTime;
    drone.g.gain.cancelScheduledValues(t); drone.g.gain.setTargetAtTime(0.0001, t, 0.6);
    drone.oscs.forEach(o => o.stop(t + 3));
    drone = null;
  };
  const startDrone = race => {
    stopDrone();
    const th = THEMES[race], t = ctx.currentTime;
    const g = N(ctx.createGain()); g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime(th.drone.gain, t, 1.5);
    g.connect(musicFilter);
    const oscs = th.drone.types.map((type, i) => { const o = N(ctx.createOscillator()); o.type = type; o.frequency.value = mtof(th.root + th.drone.ints[i]); o.detune.value = i ? 4 : -3; o.connect(g); o.start(t); return o; });
    // slow breathing on the drone level
    const lfo = N(ctx.createOscillator()); lfo.frequency.value = 0.07 + rnd() * 0.05;
    const lg = N(ctx.createGain()); lg.gain.value = th.drone.gain * 0.35; lfo.connect(lg); lg.connect(g.gain); lfo.start(t);
    oscs.push(lfo);
    drone = { race, g, oscs, base: th.drone.gain };
  };

  // ---------------------------------------------------------------
  // Lookahead scheduler (setTimeout + ctx.currentTime, so no drift)
  // ---------------------------------------------------------------
  const LOOKAHEAD = 0.3, TICK_MS = 100;
  let timer = null, nextTime = 0, step = 0, deg = 0, modeName = null, phraseRest = false;

  const scaleNote = (th, scale, d, octave = 0) => {
    const n = scale.length, o = Math.floor(d / n), i = ((d % n) + n) % n;
    return th.root + scale[i] + 12 * (o + octave);
  };

  const playStep = (t, sd) => {
    const m = mood, th = THEMES[m.race], se = SEASON[m.season] || SEASON[0];
    const night = 1 - m.day;
    if (step % 64 === 0) modeName = pick(th.modes);
    const scale = MODES[m.tense ? th.tense : modeName || th.modes[0]];
    const bar = Math.floor(step / 16), s16 = step % 16;
    const chord = th.prog[Math.floor(bar / 2) % th.prog.length];
    const dens = se.dens * (0.45 + 0.55 * m.day) * (m.menu ? 0.6 : 1);
    const vel = 0.8 + rnd() * 0.25;
    if (s16 === 0) phraseRest = bar % 2 === 1 && rnd() < 0.3 + 0.3 * night;  // breathe between phrases
    const play = (inst, midi, dur, v = vel) => { INST[inst](t, midi, dur, v, musicFilter); stats.notes++; };
    const walk = (strong) => {
      if (strong && rnd() < 0.6) deg = chord + pick([0, 2, 4]);
      else deg += pick([-2, -1, -1, 1, 1, 2]);
      if (deg > chord + 9) deg -= 3; if (deg < chord - 4) deg += 3;
      return deg;
    };

    switch (m.race) {
      case 'hearth':
        if (!phraseRest && s16 % 2 === 0 && rnd() < dens * 0.75) play('pluck', scaleNote(th, scale, walk(s16 % 8 === 0), 1), sd * 2);
        if (s16 % 8 === 0 && rnd() < dens * 0.45) play('flute', scaleNote(th, scale, chord + pick([4, 6, 7]), 1), sd * 6, 0.9);
        if (s16 === 0 && rnd() < 0.7) play('pluck', scaleNote(th, scale, chord, -1), sd * 6, 0.7);
        break;
      case 'delver':
        if (!phraseRest && s16 % 4 === 0 && rnd() < dens * 0.8) play('bowed', scaleNote(th, scale, walk(s16 === 0), 1), sd * 4);
        if (s16 === 0 && bar % 2 === 0 && rnd() < 0.55 + 0.2 * m.day) play('bell', scaleNote(th, scale, chord, 3), 1, 0.8);
        if (s16 === 10 && rnd() < dens * 0.25) play('bell', scaleNote(th, scale, chord + 4, 3), 1, 0.5);
        break;
      case 'sylvan':
        if (s16 % 8 === 0 && rnd() < dens * 0.9) {           // harp arpeggio
          const up = rnd() < 0.6;
          [0, 2, 4, 7].forEach((d, i) => { const tt = t + i * sd * 0.5; INST.harp(tt, scaleNote(th, scale, chord + (up ? d : 7 - d), 1), sd, vel * 0.9, musicFilter); stats.notes++; });
        }
        if (s16 === 0 && bar % 2 === 0) [0, 2, 4].forEach(d => play('pad', scaleNote(th, scale, chord + d), sd * 30, 0.9));
        if (!phraseRest && s16 % 4 === 2 && rnd() < dens * 0.35) play('harp', scaleNote(th, scale, walk(false), 2), sd * 2, 0.7);
        if (rnd() < 0.035 * m.day * se.dens) play('chirp', 0, 0.3, 0.8);
        break;
      case 'ash':
        if (!m.tense && [0, 6, 8, 11].includes(s16) && rnd() < (s16 === 0 ? 0.9 : dens * 0.6)) play('taiko', 0, 0.5, s16 === 0 ? 1 : 0.6);
        if (!phraseRest && s16 % 4 === 0 && rnd() < dens * 0.6) play('reed', scaleNote(th, scale, walk(s16 === 0), 1), sd * pick([3, 4, 6]));
        if (!phraseRest && s16 % 4 === 2 && rnd() < dens * 0.2) play('reed', scaleNote(th, scale, deg + 1, 1), sd * 1.5, 0.7);
        break;
      case 'tide':                                        // rolling swells, a lilting harp, a tin whistle over the waves
        if (s16 === 0 && bar % 2 === 0) play('swell', 0, sd * 14, 0.8 + 0.3 * se.dens);
        if (s16 % 4 === 0 && rnd() < dens * 0.85) {
          const d = [0, 2, 4, 2][s16 / 4];
          play('harp', scaleNote(th, scale, chord + d, 0), sd * 3, vel * 0.8);
        }
        if (!phraseRest && (s16 % 4 === 0 || s16 % 4 === 3) && rnd() < dens * 0.45) play('whistle', scaleNote(th, scale, walk(s16 % 8 === 0), 2), sd * (s16 % 4 ? 1 : 2.5));
        if (s16 === 0 && rnd() < 0.6) play('bowed', scaleNote(th, scale, chord, -1), sd * 12, 0.55);
        break;
      case 'veil':                                        // shimmering glass bells over a whole-tone / lydian haze
        if (s16 === 0 && bar % 2 === 0) [0, 2, 4, 6].forEach(d => play('pad', scaleNote(th, scale, chord + d), sd * 30, 0.75));
        if (s16 % 4 === 0 && rnd() < dens * 0.55) play('glass', scaleNote(th, scale, walk(s16 === 0), 2), 2, 0.8);
        if (s16 % 8 === 6 && rnd() < dens * 0.3) [0, 3].forEach((k, i) => { INST.glass(t + i * sd * 0.66, scaleNote(th, scale, deg + 2 + k, 3), 2, vel * 0.5, musicFilter); stats.notes++; });
        if (!phraseRest && s16 % 8 === 4 && rnd() < dens * 0.35) play('flute', scaleNote(th, scale, chord + pick([2, 4, 5]), 1), sd * 5, 0.6);
        break;
      case 'grave':                                       // organ drones in a low minor, a bell tolling far away
        if (s16 === 0 && bar % 2 === 0) [0, 2, 4].forEach(d => play('organ', scaleNote(th, scale, chord + d, 1), sd * 30, 0.9));
        if (s16 === 0 && bar % 4 === 0 && rnd() < 0.8) play('toll', th.root + 12, 6, 0.9);
        if (s16 === 8 && bar % 4 === 2 && rnd() < 0.35) play('toll', th.root + 19, 6, 0.5);
        if (!phraseRest && s16 % 8 === 0 && rnd() < dens * 0.5) play('bowed', scaleNote(th, scale, walk(s16 === 0), 1), sd * 7, 0.7);
        break;
      case 'wind':                                        // a high flute over open fifths, gusts sweeping the peaks
        if (s16 === 0 || (s16 === 8 && rnd() < 0.6)) [0, 4].forEach(d => play('harp', scaleNote(th, scale, chord + d, s16 ? 0 : -1), sd * 6, 0.75));
        if (!phraseRest && s16 % 4 === 0 && rnd() < dens * 0.6) play('flute', scaleNote(th, scale, walk(s16 % 8 === 0), 1), sd * pick([2, 3, 4]), 0.95);
        if (s16 === 4 && bar % 2 === 0 && rnd() < 0.5) play('pad', scaleNote(th, scale, chord + 4), sd * 24, 0.7);
        if (s16 % 8 === 2 && rnd() < 0.12 + 0.12 * se.dens) play('gust', 0, sd * (6 + rnd() * 8), 0.9);
        break;
    }
    if (m.tense) {                                        // danger: low drums for every people
      if ([0, 3, 8, 10, 12, 14].includes(s16) && (s16 === 0 || s16 === 8 || rnd() < 0.7)) play('taiko', 0, 0.5, s16 % 8 === 0 ? 1 : 0.55);
      if (s16 === 4 && bar % 2 === 1) play('bowed', scaleNote(th, scale, 1, -1), sd * 8, 0.8);
    }
  };

  const applyBus = () => {
    const m = mood, se = SEASON[m.season] || SEASON[0], t = ctx.currentTime;
    const cutoff = Math.max(320, Math.min(6000, 2600 * se.bright * (0.3 + 0.7 * m.day) * (m.tense ? 0.85 : 1)));
    musicFilter.frequency.setTargetAtTime(cutoff, t, 1.5);
    if (drone) drone.g.gain.setTargetAtTime(drone.base * (0.6 + 0.4 * m.day) * (m.tense ? 1.4 : 1), t, 2);
  };

  const tick = () => {
    timer = null;
    if (!ctx || !cfg.on || document.hidden) return;
    const t0 = performance.now();
    try {
      readMood();
      if (ctx.state === 'running') {
        if (!drone || drone.race !== mood.race) startDrone(mood.race);
        applyBus();
        const now = ctx.currentTime;
        if (nextTime < now) nextTime = now + 0.05;      // re-sync after suspend instead of a burst
        const se = SEASON[mood.season] || SEASON[0];
        const sd = 60 / (THEMES[mood.race].tempo * se.tempo * (mood.tense ? 1.12 : 1)) / 2; // eighth notes
        while (nextTime < now + LOOKAHEAD) {
          playStep(nextTime, sd);
          nextTime += sd * (step % 2 ? 0.92 : 1.08);       // a gentle lilt
          step++;
        }
      }
    } catch (e) { console.error('[audio]', e); }
    const dt = performance.now() - t0;
    stats.ticks++; stats.tickAvgMs = stats.tickAvgMs * 0.95 + dt * 0.05; stats.tickMaxMs = Math.max(stats.tickMaxMs, dt);
    timer = setTimeout(tick, TICK_MS);
  };
  const startMusic = () => { if (!timer && cfg.on && ctx) timer = setTimeout(tick, 0); };
  const stopMusic = () => { if (timer) clearTimeout(timer); timer = null; };

  // ---------------------------------------------------------------
  // Sound effects
  // ---------------------------------------------------------------
  const FX = {
    click(t) {
      const g = gainNode(fxBus); env(g, t, 0.001, 0.05, 0.03);
      noise(t, 0.04, filt('bandpass', 2600, 3, g));
    },
    knock(t) {                                // wood knock
      for (const [dt, f] of [[0, 190], [0.13, 170]]) {
        const g = gainNode(fxBus); env(g, t + dt, 0.001, 0.35, 0.12);
        const o = tone('triangle', f * 1.5, t + dt, 0.15, g); o.frequency.exponentialRampToValueAtTime(f, t + dt + 0.05);
        const ng = gainNode(fxBus); env(ng, t + dt, 0.001, 0.12, 0.04); noise(t + dt, 0.05, filt('bandpass', 900, 2, ng));
      }
    },
    chime(t, notes = [84, 91], gap = 0.09) { notes.forEach((m, i) => INST.bell(t + i * gap, m, 1, 1.1, fxBus)); },
    build(t) { FX.knock(t); FX.chime(t + 0.3, [84, 88, 91]); },
    train(t) {                                // marching taps + brass call
      [0, 0.1, 0.2].forEach(d => { const g = gainNode(fxBus); env(g, t + d, 0.001, 0.2, 0.06); noise(t + d, 0.07, filt('bandpass', 1500, 1.5, g)); });
      FX.horn(t + 0.32, [62, 69], 0.16, 0.6);
    },
    research(t) { [72, 76, 79, 83, 86].forEach((m, i) => { const g = gainNode(fxBus); env(g, t + i * 0.07, 0.003, 0.1, 0.6); tone('sine', mtof(m), t + i * 0.07, 0.65, g); tone('sine', mtof(m + 12), t + i * 0.07, 0.4, g); }); },
    horn(t, notes = [60, 67, 72], len = 0.24, v = 1) {
      notes.forEach((m, i) => {
        const s = t + i * len, dur = i === notes.length - 1 ? len * 3 : len * 0.95;
        const g = gainNode(fxBus);
        g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(0.16 * v, s + 0.04);
        g.gain.setValueAtTime(0.16 * v, s + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0008, s + dur + 0.15);
        const lp = filt('lowpass', 600, 1, g);
        lp.frequency.setValueAtTime(500, s); lp.frequency.linearRampToValueAtTime(2200, s + 0.08); lp.frequency.setTargetAtTime(1300, s + 0.1, 0.2);
        tone('sawtooth', mtof(m), s, dur + 0.2, lp); tone('sawtooth', mtof(m) * 1.003, s, dur + 0.2, lp);
      });
    },
    win(t) { FX.horn(t, [60, 67, 72, 76]); },
    loss(t) {
      INST.taiko(t, 0, 0.6, 1.3, fxBus);
      [[55, 0.2], [51, 0.6]].forEach(([m, d]) => { const g = gainNode(fxBus); env(g, t + d, 0.05, 0.11, 1.1); tone('triangle', mtof(m), t + d, 1.2, filt('lowpass', 900, 0.5, g)); tone('triangle', mtof(m - 12), t + d, 1.2, g); });
    },
    alarm(t) { for (let i = 0; i < 4; i++) INST.bell(t + i * 0.28, i % 2 ? 79 : 80, 1, 1.6, fxBus); },
    calamity(t) {
      const g = gainNode(fxBus); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + 3);
      noise(t, 3.1, filt('lowpass', 110, 1, g));
      [40, 46, 51].forEach(m => { const cg = gainNode(fxBus); cg.gain.setValueAtTime(0.0001, t); cg.gain.linearRampToValueAtTime(0.05, t + 0.8); cg.gain.exponentialRampToValueAtTime(0.0008, t + 3.2); tone('sawtooth', mtof(m), t, 3.3, filt('lowpass', 500, 0.6, cg)); });
    },
    questReady(t) { FX.chime(t, [79, 86], 0.14); },
    questClaim(t) { [88, 93, 91, 96].forEach((m, i) => { const g = gainNode(fxBus); env(g, t + i * 0.06, 0.002, 0.08, 0.25); tone('square', mtof(m), t + i * 0.06, 0.3, filt('lowpass', 4000, 0.5, g)); }); },
    hero(t) { FX.horn(t, [60, 64, 67, 72], 0.13, 0.8); FX.chime(t + 0.55, [84, 91, 96], 0.07); },
  };

  // throttling: per-sound cooldown plus a cap on effects per second
  const COOLDOWN = { click: 0.06, build: 1.2, train: 1.5, research: 1.5, win: 2, loss: 2, alarm: 4, calamity: 6, questReady: 3, questClaim: 0.8, hero: 2 };
  const lastPlayed = {};
  let recent = [];
  const playFx = (name, delay = 0) => {
    if (!ctx || !cfg.on || ctx.state !== 'running' || !FX[name] || cfg.fx <= 0) return false;
    const now = ctx.currentTime;
    if (now - (lastPlayed[name] || -99) < (COOLDOWN[name] || 1)) return false;
    recent = recent.filter(x => now - x < 1);
    if (name !== 'click' && recent.length >= 3) return false;
    lastPlayed[name] = now;
    if (name !== 'click') recent.push(now);
    try { FX[name](now + 0.02 + delay); stats.fx++; stats.lastFx = name; stats.fxLog.push(name); if (stats.fxLog.length > 12) stats.fxLog.shift(); } catch (e) { console.error('[audio]', e); }
    return true;
  };

  // ---------------------------------------------------------------
  // Event detection by diffing state once a second
  // ---------------------------------------------------------------
  let seen = null;
  const snapshot = s => {
    let quests = new Set(), claimed = 0;
    try { quests = new Set(G.activeQuests(s).filter(q => q.check(s)).map(q => q.id)); claimed = Object.keys((s.quests && s.quests.claimed) || {}).length; } catch (e) { /* quests module absent */ }
    let inc = new Set();
    try { inc = new Set(incoming().map(m => m.id)); } catch (e) { /* ignore */ }
    const cal = new Set((s.calamities || []).filter(c => c.start <= s.time && c.end > s.time).map(c => c.id));
    return { s, log0: s.log[0] || null, rep0: s.reports[0] ? s.reports[0].id : null, quests, claimed, inc, cal };
  };
  const poll = () => {
    if (!cfg.on || !ctx || document.hidden) return;
    const s = game();
    if (!s || !s.log || !s.reports) { seen = null; return; }
    const t0 = performance.now();
    try {
      if (!seen || seen.s !== s) { seen = snapshot(s); return; }   // new game / load: re-baseline silently
      const now = snapshot(s), want = new Set();
      for (let i = 0; i < Math.min(20, s.log.length) && s.log[i] !== seen.log0; i++) {
        const txt = s.log[i].text || '';
        if (txt.includes('🦸') && txt.includes('reached level')) want.add('hero');
        else if (txt.includes('reached level')) want.add('build');
        else if (txt.includes('📚')) want.add('research');
        else if (txt.startsWith('Training of')) want.add('train');
      }
      for (let i = 0; i < Math.min(20, s.reports.length) && s.reports[i].id !== seen.rep0; i++) {
        const k = s.reports[i].kind;
        if (k === 'win') want.add('win'); else if (k === 'loss') want.add('loss');
      }
      if ([...now.inc].some(id => !seen.inc.has(id))) want.add('alarm');
      if ([...now.cal].some(id => !seen.cal.has(id))) want.add('calamity');
      if (now.claimed > seen.claimed) want.add('questClaim');
      else if ([...now.quests].some(id => !seen.quests.has(id))) want.add('questReady');
      seen = now;
      // most urgent first, staggered so they don't pile on top of each other
      const order = ['alarm', 'calamity', 'loss', 'win', 'hero', 'questClaim', 'research', 'build', 'train', 'questReady'];
      let delay = 0;
      for (const n of order) if (want.has(n) && playFx(n, delay)) delay += 0.45;
    } catch (e) { console.error('[audio]', e); seen = null; }
    const dt = performance.now() - t0; stats.pollAvgMs = stats.pollAvgMs * 0.9 + dt * 0.1;
  };
  setInterval(poll, 1000);

  // ---------------------------------------------------------------
  // On / off, gestures, visibility
  // ---------------------------------------------------------------
  const wake = () => {           // must be called from a user gesture to actually start sound
    if (!cfg.on) return;
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.05);
    startMusic();
  };
  const onGesture = () => { if (cfg.on && (!ctx || ctx.state !== 'running')) wake(); };
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('keydown', onGesture, true);

  const turnOn = () => { cfg.on = true; saveCfg(); seen = null; wake(); };
  const turnOff = () => {
    cfg.on = false; saveCfg(); stopMusic();
    if (ctx) {                   // quick fade, then suspend so the device sleeps
      stopDrone(); master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      setTimeout(() => { if (!cfg.on && ctx) ctx.suspend().catch(() => {}); }, 300);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { stopMusic(); ctx.suspend().catch(() => {}); }
    else if (cfg.on) { seen = null; ctx.resume().catch(() => {}); startMusic(); }  // re-baseline: catch-up events stay silent
  });

  const setVol = (which, v) => {
    cfg[which] = clamp01(v); saveCfg();
    if (!ctx) return;
    if (which === 'music') musicBus.gain.setTargetAtTime(cfg.music * 0.55, ctx.currentTime, 0.05);
    else fxBus.gain.setTargetAtTime(cfg.fx * 0.8, ctx.currentTime, 0.05);
  };

  // ---------------------------------------------------------------
  // Controls: top-bar buttons + a popover living outside #app
  // ---------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    #ecAudioPop { position: fixed; z-index: 1000; min-width: 210px; padding: 10px 12px; display: none;
      background: var(--panel, #fbf6ea); color: var(--ink, #2b2118); border: 1px solid var(--line, #d8c9a8);
      border-radius: var(--radius, 10px); box-shadow: var(--shadow, 0 4px 14px rgba(0,0,0,.2)); font: 13px var(--ui, system-ui); }
    #ecAudioPop.on { display: block; }
    #ecAudioPop label { display: grid; grid-template-columns: 62px 1fr 34px; align-items: center; gap: 8px; margin: 6px 0; }
    #ecAudioPop input[type=range] { width: 100%; accent-color: var(--accent, #a0522d); }
    #ecAudioPop .hd { font-weight: 600; margin-bottom: 4px; display: flex; justify-content: space-between; }
    #ecAudioPop .muted { color: var(--muted, #7a6a55); font-size: 12px; }
    .ec-audio-btns { display: inline-flex; gap: 2px; }
  `;
  document.head.appendChild(style);

  let pop = null;
  const buildPop = () => {
    pop = document.createElement('div');
    pop.id = 'ecAudioPop';
    pop.innerHTML = `<div class="hd"><span>Sound</span><span class="muted" id="ecAudioStatus"></span></div>
      <label>Music <input type="range" id="ecAudioMusic" min="0" max="100" step="1"><span id="ecAudioMusicV" class="muted"></span></label>
      <label>Effects <input type="range" id="ecAudioFx" min="0" max="100" step="1"><span id="ecAudioFxV" class="muted"></span></label>
      <div class="muted">Original music, synthesised live for your people.</div>`;
    document.body.appendChild(pop);
    const bind = (id, which) => pop.querySelector('#' + id).addEventListener('input', ev => {
      setVol(which, ev.target.value / 100);
      pop.querySelector('#' + id + 'V').textContent = ev.target.value;
      if (which === 'fx') playFx('click');
    });
    bind('ecAudioMusic', 'music'); bind('ecAudioFx', 'fx');
  };
  const syncPop = () => {
    if (!pop) return;
    pop.querySelector('#ecAudioMusic').value = Math.round(cfg.music * 100);
    pop.querySelector('#ecAudioFx').value = Math.round(cfg.fx * 100);
    pop.querySelector('#ecAudioMusicV').textContent = Math.round(cfg.music * 100);
    pop.querySelector('#ecAudioFxV').textContent = Math.round(cfg.fx * 100);
    pop.querySelector('#ecAudioStatus').textContent = cfg.on ? 'on' : 'off';
  };
  const placePop = () => {
    const btn = document.querySelector('[data-act="audioSettings"]');
    if (!btn || !pop) return;
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth || 230;
    pop.style.top = Math.round(r.bottom + 6) + 'px';
    pop.style.left = Math.round(Math.max(8, Math.min((document.documentElement.clientWidth || window.innerWidth) - w - 8, r.right - w))) + 'px';
  };
  const closePop = () => { if (pop) pop.classList.remove('on'); };
  window.addEventListener('resize', () => { if (pop && pop.classList.contains('on')) placePop(); });

  if (typeof TOP_EXTRAS !== 'undefined') {
    TOP_EXTRAS.push(() => `<span class="ec-audio-btns"><button class="small" data-act="audioToggle" title="${cfg.on ? 'Mute sound' : 'Turn sound on'}" aria-label="${cfg.on ? 'Mute sound' : 'Turn sound on'}">${cfg.on ? '🔊' : '🔇'}</button><button class="small" data-act="audioSettings" title="Sound volume" aria-label="Sound volume">⚙</button></span>`);
  }
  if (typeof act !== 'undefined') {
    Object.assign(act, {
      audioToggle: () => {
        if (cfg.on) turnOff(); else turnOn();
        syncPop();
        try { render(true); } catch (e) { /* ignore */ }
        if (cfg.on) setTimeout(() => playFx('click'), 60);
      },
      audioSettings: () => {
        if (!pop) buildPop();
        if (pop.classList.contains('on')) return closePop();
        syncPop(); pop.classList.add('on'); placePop();
      },
    });
  }

  // capture phase: soft UI clicks and closing the popover; never stops propagation
  document.addEventListener('click', ev => {
    const t = ev.target;
    if (pop && pop.classList.contains('on') && !pop.contains(t) && !(t.closest && t.closest('[data-act="audioSettings"]'))) closePop();
    const el = t.closest && t.closest('[data-act]');
    if (el && el.dataset.act !== 'audioToggle' && el.tagName !== 'SELECT' && el.tagName !== 'INPUT') playFx('click');
  }, true);

  // ---------------------------------------------------------------
  // Debug handle
  // ---------------------------------------------------------------
  window.ECAUDIO = {
    on: turnOn,
    off: turnOff,
    play: name => { if (!ctx && cfg.on) wake(); return playFx(name); },
    fx: Object.keys(FX),
    state: () => ({
      enabled: cfg.on, music: cfg.music, effects: cfg.fx,
      ctx: ctx ? ctx.state : null, time: ctx ? +ctx.currentTime.toFixed(2) : 0,
      scheduling: !!timer, step, mood: { ...mood }, drone: drone ? drone.race : null,
      notesScheduled: stats.notes, nodesCreated: stats.nodes, effectsPlayed: stats.fx, lastEffect: stats.lastFx, recentEffects: stats.fxLog.slice(),
      ticks: stats.ticks, tickAvgMs: +stats.tickAvgMs.toFixed(3), tickMaxMs: +stats.tickMaxMs.toFixed(3), pollAvgMs: +stats.pollAvgMs.toFixed(3),
    }),
  };
})();
