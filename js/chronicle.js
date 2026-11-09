// =====================================================================
//  The Chronicle: history, a narrative timeline and feats.
//  s.chronicle = {
//    v, every (sample interval, game-sec), next (time of the next sample),
//    h: { t: [times], e: { empireId: { r, c, p, a, g, m, w, f } } }  // parallel int arrays
//    ev: [{ t, k, a, an, b, bn, c, x, n }]   // timeline (text is written at read time, in the player's voice)
//    met: { id: 1 }, snap: {...}             // what the realm knows / last seen state, for diffing
//    st: { counters }, feats: { id: time }   // this game's statistics and feats
//  }
//  Everything is detected by diffing state in a slow hook (the engine's
//  conquest/victory code is private), plus a few chained wrappers
//  (G.castSpell, G.migrate) and battle hooks. Feats also persist across
//  games in localStorage (G.FEATS_KEY).
// =====================================================================
'use strict';

(() => {
  const C = G.CHRON = {
    every: 180,          // a sample every 3 game-minutes (x pace) …
    maxSamples: 128,     // … until the cap; then every other sample goes and the interval doubles
    maxEvents: 150,
    metrics: {
      r: { name: 'Renown', icon: '⭐' },
      p: { name: 'Population', icon: '👥' },
      a: { name: 'Army', icon: '🛡️' },
      c: { name: 'Cities', icon: '🏰' },
      g: { name: 'Gold', icon: '🪙' },
      m: { name: 'Mana', icon: '✨' },
      w: { name: 'Wonder stages', icon: '🏛️' },
      f: { name: 'Faithful', icon: '⛪' },
    },
  };
  C.metricOrder = Object.keys(C.metrics);
  G.FEATS_KEY = 'emberCrown_feats_v1';

  const safe = fn => function () { try { return fn.apply(this, arguments); } catch (e) { if (typeof console !== 'undefined') console.error('chronicle:', e); } };
  const nameOf = (s, id) => (s.empires[id] && s.empires[id].name) || (G.minorName && G.minorName(s, id)) || 'a free city';
  const isRealm = (s, id) => !!s.empires[id] && !s.empires[id].minor;
  const realmIds = s => Object.keys(s.empires).filter(id => isRealm(s, id));
  const seenAt = (s, o) => !!(o && s.explored && s.explored[o.y * s.map + o.x]);

  // -------------------------------------------------------------------
  // state
  // -------------------------------------------------------------------
  const snapshot = (s, ch) => {
    const cities = {};
    for (const c of Object.values(s.cities)) cities[c.id] = [c.owner, c.name, c.x, c.y];
    const rel = {};
    for (const [id, r] of Object.entries(s.rel || {})) rel[id] = r.status;
    const airel = {};
    for (const [k, r] of Object.entries(s.airel || {})) airel[k] = r.status;
    const wonder = {}, dead = {}, slain = {};
    for (const e of Object.values(s.empires)) { wonder[e.id] = e._wonderLevel || 0; dead[e.id] = e.dead ? 1 : 0; slain[e.id] = e.heroesSlain || 0; }
    const work = {};
    const M = s.magic && s.magic.working;
    if (M) for (const [id, w] of Object.entries(M)) work[id] = w.stage || 0;
    const h = G.heroOf ? G.heroOf(s, 'p') : null;
    const minors = {};
    for (const mi of Object.values(s.minors || {})) minors[mi.id] = [mi.name, mi.x, mi.y, mi.subject || null];
    ch.snap = {
      cities, minors, rel, airel, wonder, dead, slain, work,
      faiths: Object.keys(s.faiths || {}),
      cal: (s.calamities || []).filter(c => !c.ended && c.end > s.time).map(c => c.id),
      hero: h ? (h.dead ? 1 : 0) : 0,
      end: s.victory || s.gameOver || null,
    };
  };
  const ensure = s => {
    if (s.chronicle && s.chronicle.v) return s.chronicle;
    const ch = s.chronicle = { v: 1, every: C.every, next: s.time, h: { t: [], e: {} }, ev: [], met: { p: 1 }, st: {}, feats: {}, held: {}, calTouch: {} };
    for (const c of G.citiesOf(s, 'p')) ch.held[c.id] = 1;
    snapshot(s, ch);
    updateMet(s, ch, true);
    return ch;
  };
  G.chronicle = ensure;

  const updateMet = (s, ch, quiet) => {
    for (const id of realmIds(s)) {
      if (ch.met[id]) continue;
      const r = s.rel && s.rel[id];
      if (G.citiesOf(s, id).some(c => seenAt(s, c)) || (r && r.status !== 'neutral')) {
        ch.met[id] = 1;
        if (!quiet) addEvent(s, 'meet', { b: id });
      }
    }
  };
  G.chronKnown = s => { const ch = ensure(s); return realmIds(s).filter(id => ch.met[id]); };

  const addEvent = (s, k, d = {}) => {
    const ch = ensure(s);
    const ev = { t: Math.round(s.time), k };
    if (d.a) { ev.a = d.a; ev.an = nameOf(s, d.a); }
    if (d.b) { ev.b = d.b; ev.bn = nameOf(s, d.b); }
    for (const f of ['c', 'x', 'n']) if (d[f] !== undefined && d[f] !== null) ev[f] = d[f];
    ch.ev.push(ev);
    if (ch.ev.length > C.maxEvents) ch.ev.splice(0, ch.ev.length - C.maxEvents);
    return ev;
  };
  G.chronEvent = addEvent;
  const bump = (s, k, n = 1) => { const st = ensure(s).st; st[k] = (st[k] || 0) + n; return st[k]; };
  G.chronStat = (s, k) => ensure(s).st[k] || 0;

  // -------------------------------------------------------------------
  // sampling
  // -------------------------------------------------------------------
  const armyOf = (s, id) => {
    let n = 0;
    for (const c of G.citiesOf(s, id)) n += G.unitsCount(c.units) - (c.units.hero || 0);
    for (const m of s.moves) if (m.owner === id && m.type !== 'trade') n += G.unitsCount(m.units) - (m.units.hero || 0);
    return n;
  };
  const followers = (s, id) => {
    const f = s.empires[id].faithId;
    if (!f) return 0;
    let n = 0;
    for (const c of Object.values(s.cities)) n += (c.pop || 0) * ((c.faiths && c.faiths[f]) || 0);
    return n;
  };
  const measure = (s, id) => {
    const cs = G.citiesOf(s, id), e = s.empires[id];
    return {
      r: e.dead ? 0 : G.renown(s, id), c: cs.length,
      p: cs.reduce((a, c) => a + (c.pop || 0), 0), a: armyOf(s, id),
      g: e.gold || 0, m: cs.reduce((a, c) => a + ((c.res && c.res.mana) || 0), 0),
      w: e._wonderLevel || 0, f: followers(s, id),
    };
  };
  const sample = s => {
    const ch = ensure(s), H = ch.h;
    const i = H.t.length;
    H.t.push(Math.round(s.time));
    for (const id of realmIds(s)) {
      let row = H.e[id];
      if (!row) { row = H.e[id] = {}; for (const k of C.metricOrder) row[k] = new Array(i).fill(null); }
      const v = measure(s, id), gone = s.empires[id].dead;
      for (const k of C.metricOrder) row[k].push(gone ? null : Math.round(v[k]));
    }
    for (const row of Object.values(H.e)) for (const k of C.metricOrder) while (row[k].length < H.t.length) row[k].push(null);
    if (H.t.length > C.maxSamples) {
      // thin evenly: keep every other sample (always the newest), double the interval
      const keep = (_, j) => (H.t.length - 1 - j) % 2 === 0;
      H.t = H.t.filter(keep);
      for (const row of Object.values(H.e)) for (const k of C.metricOrder) row[k] = row[k].filter(keep);
      ch.every *= 2;
    }
    ch.next = s.time + ch.every * G.pace(s).time;
  };
  G.chronSample = s => sample(s);
  // { t: [...], lines: [{ id, name, color, vals }] } for one metric, known realms only
  G.chronSeries = (s, metric, all) => {
    const ch = ensure(s);
    const ids = all ? Object.keys(ch.h.e) : Object.keys(ch.h.e).filter(id => ch.met[id] && s.empires[id]);
    return { t: ch.h.t.slice(), lines: ids.map(id => ({ id, name: s.empires[id] ? s.empires[id].name : id, color: s.empires[id] ? s.empires[id].color : '#888', vals: ch.h.e[id][metric] || [] })) };
  };

  // -------------------------------------------------------------------
  // detection by diffing (runs every slow tick, after the other modules)
  // -------------------------------------------------------------------
  const touches = (s, cal, c) => Math.hypot(c.x - cal.x, c.y - cal.y) <= (cal.r || 2) + 1;
  const visible = (s, ...ids) => ids.every(id => id === 'p' || ensure(s).met[id]);
  const detect = s => {
    const ch = ensure(s), snap = ch.snap;
    updateMet(s, ch);
    // cities: founded, conquered, lost to revolt
    for (const c of Object.values(s.cities)) {
      const was = snap.cities[c.id];
      if (!was) {
        // a free city stormed and made a city of the realm
        const freed = Object.entries(snap.minors || {}).find(([id, m]) => m[1] === c.x && m[2] === c.y && !(s.minors && s.minors[id]));
        if (freed) {
          if (c.owner === 'p') { bump(s, 'conquered'); bump(s, 'freeTaken'); ch.held[c.id] = 1; }
          if (c.owner === 'p' || (seenAt(s, c) && ch.met[c.owner])) addEvent(s, 'freecity', { a: c.owner, c: c.name, x: 'took' });
          continue;
        }
        if (c.owner === 'p') { bump(s, 'founded'); ch.held[c.id] = 1; }
        if (c.owner === 'p' || (isRealm(s, c.owner) && seenAt(s, c) && ch.met[c.owner])) addEvent(s, 'found', { a: c.owner, c: c.name });
      } else if (was[0] !== c.owner) {
        const from = was[0], to = c.owner;
        if (to === 'p') {
          bump(s, 'conquered');
          if (ch.held[c.id] && ch.st.lostIds && ch.st.lostIds.includes(c.id)) bump(s, 'retaken');
          ch.held[c.id] = 1;
          if (s.empires[from] && s.empires[from].dead) bump(s, 'toppled');
        }
        if (from === 'p') { bump(s, 'lost'); (ch.st.lostIds = ch.st.lostIds || []).push(c.id); if (ch.st.lostIds.length > 30) ch.st.lostIds.shift(); }
        if (from === 'p' || to === 'p' || seenAt(s, c)) addEvent(s, 'conq', { a: to, b: from, c: c.name });
      }
    }
    for (const [id, was] of Object.entries(snap.cities)) {
      if (s.cities[id]) continue;
      if (was[0] === 'p') { bump(s, 'lost'); bump(s, 'revolts'); }
      if (was[0] === 'p' || seenAt(s, { x: was[2], y: was[3] })) addEvent(s, 'revolt', { a: was[0], c: was[1] });
    }
    // free cities made to bow
    for (const mi of Object.values(s.minors || {})) {
      const was = (snap.minors || {})[mi.id];
      if (!was || !mi.subject || was[3] === mi.subject) continue;
      if (mi.subject === 'p') bump(s, 'freeSubdued');
      if (mi.subject === 'p' || (ch.met[mi.subject] && seenAt(s, mi))) addEvent(s, 'freecity', { a: mi.subject, c: mi.name, x: 'sub' });
    }
    // the player's wars, peaces and alliances
    for (const [id, r] of Object.entries(s.rel || {})) {
      const prev = snap.rel[id] || 'neutral';
      if (r.status === prev || !s.empires[id]) continue;
      if (r.status === 'war') { addEvent(s, 'war', { a: 'p', b: id }); bump(s, 'wars'); }
      else if (r.status === 'peace' && prev === 'war') { addEvent(s, 'peace', { a: 'p', b: id }); bump(s, 'peaces'); }
      else if (r.status === 'alliance') { addEvent(s, 'ally', { a: 'p', b: id }); bump(s, 'alliances'); }
    }
    for (const [k, r] of Object.entries(s.airel || {})) {
      const prev = snap.airel[k] || 'neutral';
      if (r.status === prev) continue;
      const [a, b] = k.split('|');
      if (!visible(s, a, b) || !s.empires[a] || !s.empires[b]) continue;
      if (r.status === 'war') addEvent(s, 'war', { a, b });
      else if (r.status === 'peace' && prev === 'war') addEvent(s, 'peace', { a, b });
    }
    // empires falling and rising again
    for (const e of Object.values(s.empires)) {
      const was = snap.dead[e.id] || 0;
      if (e.dead && !was && e.id !== 'p' && (ch.met[e.id] || ch.ev.some(x => x.b === e.id))) addEvent(s, 'fall', { b: e.id });
      if (!e.dead && was) { addEvent(s, 'rise', { a: e.id }); delete ch.met[e.id]; }
      // wonders
      const wl = e._wonderLevel || 0, pw = snap.wonder[e.id] || 0;
      if (wl > pw && DATA.wonders && DATA.wonders[e.race]) {
        if (e.id === 'p') { addEvent(s, 'wonder', { a: 'p', x: DATA.wonders[e.race].name, n: wl }); ch.st.wonderMax = Math.max(ch.st.wonderMax || 0, wl); }
        else if (ch.met[e.id] && [1, 5, 8, 10].includes(wl)) addEvent(s, 'wonder', { a: e.id, x: DATA.wonders[e.race].name, n: wl });
      }
      // heroes slain
      const hs = e.heroesSlain || 0;
      if (hs > (snap.slain[e.id] || 0)) { if (e.id === 'p') { bump(s, 'heroesSlain', hs - (snap.slain[e.id] || 0)); addEvent(s, 'slay', { a: 'p' }); } else if (ch.met[e.id]) addEvent(s, 'slay', { a: e.id }); }
    }
    // the player's hero
    const h = G.heroOf ? G.heroOf(s, 'p') : null;
    if (h && h.dead && !snap.hero) { addEvent(s, 'herofall', { a: 'p', x: h.name }); bump(s, 'heroFalls'); }
    // faiths
    for (const [id, f] of Object.entries(s.faiths || {})) {
      if (snap.faiths.includes(id)) continue;
      if (f.founder === 'p') bump(s, 'faiths');
      if (f.founder === 'p' || ch.met[f.founder]) addEvent(s, 'faith', { a: f.founder, x: f.name, c: DATA.gods && DATA.gods[f.god] ? DATA.gods[f.god].name : '' });
    }
    // calamities: struck and endured
    const cals = s.calamities || [];
    for (const cal of cals) {
      if (cal.ended || cal.end <= s.time || snap.cal.includes(cal.id)) continue;
      const mine = G.citiesOf(s, 'p').filter(c => touches(s, cal, c)).map(c => c.id);
      const def = (DATA.calamities && DATA.calamities[cal.kind]) || {};
      if (mine.length) ch.calTouch[cal.id] = mine;
      const near = !mine.length && def.bad && seenAt(s, cal) && Object.values(s.cities).some(c => c.owner !== 'p' && ch.met[c.owner] && touches(s, cal, c));
      if (mine.length || near) addEvent(s, 'cal', { x: cal.kind, n: mine.length, c: mine.length ? s.cities[mine[0]].name : '' });
    }
    for (const id of snap.cal) {
      const cal = cals.find(c => c.id === id);
      if (cal && !cal.ended && cal.end > s.time) continue;
      const touched = ch.calTouch[id];
      if (touched) {
        delete ch.calTouch[id];
        if (touched.some(cid => s.cities[cid] && s.cities[cid].owner === 'p')) {
          bump(s, 'endured');
          const def = cal && DATA.calamities ? DATA.calamities[cal.kind] : null;
          if (def && def.bad !== false) addEvent(s, 'calend', { a: 'p', x: cal.kind });
        }
      }
    }
    // the Great Working
    const M = s.magic && s.magic.working;
    if (M) for (const [id, w] of Object.entries(M)) {
      const st = w.stage || 0, prev = snap.work[id] || 0;
      if (st > prev && (id === 'p' || ch.met[id])) { addEvent(s, 'work', { a: id, n: st }); if (id === 'p') ch.st.workMax = Math.max(ch.st.workMax || 0, st); }
    }
    // the end of the game
    const end = s.victory || s.gameOver || null;
    if (end && !snap.end) {
      if (s.victory) { addEvent(s, 'victory', { a: 'p', x: String(s.victory === true ? 'conquest' : s.victory) }); ch.st.won = s.victory === true ? 'conquest' : s.victory; }
      else { addEvent(s, 'defeat', { a: s.gameOverBy || null, x: String(s.gameOver) }); ch.st.defeat = s.gameOver; }
      ch.endedAt = Math.round(s.time);
      sample(s);
      snapshot(s, ch);
      checkFeats(s);
    }
    // peaks for the summary
    const ren = G.renown(s, 'p');
    ch.st.peakRenown = Math.max(ch.st.peakRenown || 0, ren);
    ch.st.peakCities = Math.max(ch.st.peakCities || 0, G.citiesOf(s, 'p').length);
    snapshot(s, ch);
  };
  G.chronDetect = s => detect(s);

  // -------------------------------------------------------------------
  // hooks and wrappers
  // -------------------------------------------------------------------
  G.newGameHooks.push(safe((s, opts) => {
    delete s.chronicle;
    const ch = ensure(s);
    const cap = G.capital(s, 'p');
    addEvent(s, 'dawn', { a: 'p', c: cap ? cap.name : '' });
    sample(s);
    ch.newGame = true;
  }));
  G.slowHooks.push(safe((s, dtMin) => {
    const ch = ensure(s);
    detect(s);
    if (s.time >= ch.next) sample(s);
    ch.featClock = (ch.featClock || 0) + dtMin;
    if (ch.featClock >= 1) { ch.featClock = 0; checkFeats(s); }
  }));
  G.battleHooks.push(safe((s, ctx) => {
    const { m, r } = ctx;
    if (!m || !r) return;
    if (m.owner === 'p') {
      if (r.win) bump(s, 'battlesWon'); else bump(s, 'battlesLost');
      if (r.win && ctx.defHad && ctx.defHad.wyrm) { bump(s, 'wyrms'); addEvent(s, 'wyrm', { a: 'p' }); }
    } else if (ctx.site === 'city' && ctx.defOwner === 'p') {
      if (!r.win) { bump(s, 'repelled'); bump(s, 'battlesWon'); } else bump(s, 'battlesLost');
    }
  }));
  if (G.castSpell) {
    const cast = G.castSpell;
    G.castSpell = function (s, owner, cityId, id, target) {
      const res = cast.apply(this, arguments);
      if (res === null) safe(() => {
        const sp = DATA.spells[id] || {};
        if (owner === 'p') { bump(s, 'spells'); if (sp.shape) bump(s, 'shaped'); }
        if (sp.shape || sp.tier >= 10) {
          if (owner === 'p') addEvent(s, 'spell', { a: 'p', x: sp.name, n: sp.shape ? 1 : 0 });
          else if (ensure(s).met[owner] && sp.shape) addEvent(s, 'spell', { a: owner, x: sp.name, n: 1 });
        }
      })();
      return res;
    };
  }
  {
    const mig = G.migrate;
    G.migrate = function (s) { const out = mig.apply(this, arguments); safe(ensure)(out || s); return out; };
  }

  // -------------------------------------------------------------------
  // the chronicler's voice: one per people
  // -------------------------------------------------------------------
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  G.chronOrd = ord;
  const VOICE = {
    hearth: { book: 'The Hearth-Annals', era: 'harvest', we: 'our folk', hall: 'hearth',
      dawn: 'a handful of families banked their first fire at {c}, and called it home',
      found: ['a new hearth was kindled at {c}', 'settlers carried the hearth-fire to {c}'],
      take: ['{c} was brought under our roof', 'the banners of the hearth rose over {c}'],
      lose: ['{c} was torn from our hearths by {b}', 'we wept for {c}, taken by {b}'],
      war: 'the bells rang out, for {b} would have war', peace: 'the ploughs went back to the fields: peace with {b}',
      end: 'May the granaries never empty.', cal: 'we banked the fires and waited out {x}' },
    delver: { book: 'The Deep Ledger', era: 'delving', we: 'the Hold', hall: 'hold',
      dawn: 'the first shaft was sunk beneath {c}, and the Hold was founded in stone',
      found: ['a new hold was cut at {c}', 'the masons sealed the first gate of {c}'],
      take: ['{c} was entered in the Ledger as ours', 'our hammers rang in the halls of {c}'],
      lose: ['{c} was struck from the Ledger, seized by {b}', 'a grudge was carved for {c}, taken by {b}'],
      war: 'a grudge was entered against {b}, and the Hold marched', peace: 'the account with {b} was closed, and peace recorded',
      end: 'So it is written, so it is carved.', cal: 'the Hold shut its gates against {x}, and endured' },
    sylvan: { book: 'The Leafsong', era: 'turning of leaves', we: 'the Grove', hall: 'grove',
      dawn: 'a seed was sung into the earth at {c}, and the Grove awoke',
      found: ['a new grove took root at {c}', 'the song spread to {c}'],
      take: ['{c} was woven into the Grove', 'roots closed over the walls of {c}'],
      lose: ['a branch was cut: {c} fell to {b}', 'the song fell silent in {c}, taken by {b}'],
      war: 'the leaves turned red, for {b} came with axes', peace: 'the wind was gentle again: peace with {b}',
      end: 'What grows slowly, endures.', cal: 'the Grove bent beneath {x}, and did not break' },
    ash: { book: 'The Ash-Sagas', era: 'burning', we: 'the Horde', hall: 'camp',
      dawn: 'the war-drums first sounded at {c}, and the Horde gathered',
      found: ['a war-camp was staked at {c}', 'the Horde pitched its tents at {c}'],
      take: ['{c} was put to the torch and claimed', 'the skulls of {c} were added to the cairn'],
      lose: ['shame! {c} was taken by {b}', '{c} fell to {b}; blood will answer'],
      war: 'the drums thundered: war upon {b}', peace: 'the Horde sheathed its blades, for now, with {b}',
      end: 'The fire remembers.', cal: 'the Horde laughed at {x}, and outlasted it' },
    tide: { book: 'The Tidelogs', era: 'tide', we: 'the Fleet', hall: 'harbour',
      dawn: 'the first keel was laid at {c}, and the tide carried the Fleet into history',
      found: ['a new harbour was charted at {c}', 'anchors dropped at {c}'],
      take: ['{c} was boarded and taken', 'our sails filled the harbour of {c}'],
      lose: ['{c} was lost to {b}, like a ship on the rocks', 'the log records {c} taken by {b}'],
      war: 'storm signals flew: war with {b}', peace: 'fair winds returned: peace with {b}',
      end: 'The tide turns, and the log goes on.', cal: 'the Fleet rode out {x}' },
    veil: { book: 'The Dreaming Scrolls', era: 'dreaming', we: 'the Veil', hall: 'spire',
      dawn: 'a dream was spoken aloud at {c}, and became a city',
      found: ['a new spire was dreamed into being at {c}', 'the Veil drew {c} out of the mist'],
      take: ['{c} woke to find itself ours', 'a quiet glamour settled over {c}, and it was ours'],
      lose: ['{c} faded from our dreams, taken by {b}', 'the dream of {c} was broken by {b}'],
      war: 'the dreams turned dark: {b} chose war', peace: 'sweet dreams again: peace with {b}',
      end: 'Was it a dream? It was a dream.', cal: 'the Veil slept through {x}, and woke unharmed' },
    grave: { book: 'The Ossuary Rolls', era: 'long night', we: 'the Barrow', hall: 'barrow',
      dawn: 'the first barrow was opened at {c}, and the dead stood watch',
      found: ['a new barrow was dug at {c}', 'the dead walked to {c} and stayed'],
      take: ['{c} joined the silent kingdom', 'the bells of {c} now toll for us'],
      lose: ['{c} was stolen from the dead by {b}', '{c} fell to {b}; the dead are patient'],
      war: 'the bones rattled: war with {b}', peace: 'the dead lay down again: peace with {b}',
      end: 'All things come to the Barrow in the end.', cal: 'the Barrow endured {x}, as the dead endure all things' },
    wind: { book: 'The Sky-Lays', era: 'high wind', we: 'the Eyrie', hall: 'eyrie',
      dawn: 'the first nest was built on the heights of {c}, and the Eyrie took wing',
      found: ['a new eyrie was raised at {c}', 'the flock settled at {c}'],
      take: ['{c} was won from the sky', 'our wings shadowed {c}, and it bowed'],
      lose: ['{c} was torn from the sky by {b}', 'the winds wept: {c} fell to {b}'],
      war: 'the storm-horns sounded: war with {b}', peace: 'the winds calmed: peace with {b}',
      end: 'The sky remembers every wing.', cal: 'the Eyrie rose above {x}' },
  };
  G.CHRON_VOICE = VOICE;
  const voiceOf = s => VOICE[s.empires.p.race] || VOICE.hearth;
  const pickBy = (arr, t) => Array.isArray(arr) ? arr[Math.abs(Math.round(t)) % arr.length] : arr;
  const fill = (tpl, d) => tpl.replace(/\{(\w)\}/g, (_, k) => d[k] !== undefined ? d[k] : '');
  const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
  const CAL_NOUN = { wyrm: 'an elder wyrm', deadrise: 'the restless dead', quake: 'the Earthshaker', flood: 'the drowning rains', eruption: 'the fire mountain', swarm: 'the chittering swarm', blight: 'the grey blight', silt: 'the rich silt', starfall: 'a falling star', tempest: 'an arcane tempest', obsidian: 'fields of obsidian', feybloom: 'a feywild bloom' };
  const calName = kind => CAL_NOUN[kind] || ((DATA.calamities && DATA.calamities[kind] && DATA.calamities[kind].name) || kind).replace(/^The /, 'the ');
  G.chronYear = (s, t) => Math.floor(t / (7200 * G.pace(s).time) / 4) + 1;
  G.chronSeason = (s, t) => G.SEASONS[Math.floor(t / (7200 * G.pace(s).time)) % 4];
  G.chronBook = s => voiceOf(s).book;

  // one timeline entry as prose, from the player's point of view
  G.chronText = (s, ev) => {
    const v = voiceOf(s);
    const who = (id, nm) => id === 'p' ? v.we : 'the ' + (nm || nameOf(s, id));
    const d = { a: who(ev.a, ev.an), b: who(ev.b, ev.bn), c: ev.c || '', x: String(ev.x || '').replace(/^The /, 'the '), n: ev.n };
    let t;
    switch (ev.k) {
      case 'dawn': t = fill(v.dawn, d); break;
      case 'meet': t = `${v.we} first met ${d.b}`; break;
      case 'found': t = ev.a === 'p' ? fill(pickBy(v.found, ev.t), d) : `${d.a} founded ${d.c}`; break;
      case 'conq':
        if (ev.a === 'p') t = fill(pickBy(v.take, ev.t), d) + (ev.b && ev.b !== 'p' ? `, wrested from ${d.b}` : '');
        else if (ev.b === 'p') t = fill(pickBy(v.lose, ev.t), d);
        else t = `${d.a} took ${d.c} from ${d.b}`;
        break;
      case 'freecity': t = ev.x === 'took' ? `${d.a} stormed the free city of ${d.c} and made it ${ev.a === 'p' ? 'ours' : 'their own'}` : `the free city of ${d.c} bowed to ${d.a} and paid tribute`; break;
      case 'revolt': t = ev.a === 'p' ? `${d.c} rose against ${v.we} and was lost to the rebels` : `${d.c} rose in revolt against ${d.a}`; break;
      case 'war': t = ev.a === 'p' ? fill(v.war, d) : `${d.a} and ${d.b} went to war`; break;
      case 'peace': t = ev.a === 'p' ? fill(v.peace, d) : `${d.a} and ${d.b} made peace`; break;
      case 'ally': t = `${v.we} swore an alliance with ${d.b}`; break;
      case 'fall': t = `${d.b} fell, and their crown was broken`; break;
      case 'rise': t = `a new dynasty rose: ${d.a}`; break;
      case 'wonder': t = ev.a === 'p' ? (ev.n >= 10 ? `${d.x} was completed, and the world marvelled` : `${d.x} rose to its ${ord(ev.n)} stage`) : `${d.a} raised ${d.x} to its ${ord(ev.n)} stage`; break;
      case 'cal': {
        const def = (DATA.calamities && DATA.calamities[ev.x]) || {};
        const nm = calName(ev.x);
        t = !ev.n ? `${nm} struck the lands of our neighbours` : def.bad === false ? `${nm} came to ${d.c}, and with it strange gifts` : `${nm} fell upon ${d.c}${ev.n > 1 ? ` and ${ev.n - 1} more of our cities` : ''}`;
        break;
      }
      case 'calend': t = fill(v.cal, { ...d, x: calName(ev.x) }); break;
      case 'faith': t = ev.a === 'p' ? `${v.we} founded a faith, ${d.x}${d.c ? `, in the name of ${d.c}` : ''}` : `${d.a} founded a faith, ${d.x}`; break;
      case 'spell': t = ev.n ? `${d.a} cast ${d.x}, and the very land changed shape` : `${d.a} wove ${d.x}`; break;
      case 'work': t = `${d.a} completed the ${ord(ev.n)} stage of the Great Working`; break;
      case 'slay': t = ev.a === 'p' ? `our champion slew a famed hero of a rival realm` : `${d.a} slew a famed hero`; break;
      case 'herofall': t = `${d.x}, our champion, fell`; break;
      case 'wyrm': t = `${v.we} slew an elder wyrm`; break;
      case 'feat': t = `a deed worth remembering: ${d.x}`; break;
      case 'victory': t = ({ conquest: 'every rival crown had fallen, and the world was ours', wonder: 'our wonder stood complete, and our legend outlasted the ages', faith: 'our faith became the faith of the world', arcane: 'the Great Working was done, and the weave answered to us' })[ev.x] || 'victory was ours'; t += '. ' + v.end; break;
      case 'defeat': t = ev.x === 'defeat' ? `our last city fell, and the chronicle closes` : `${ev.a ? d.a : 'a rival'} ${({ wonder: 'completed their wonder', faith: 'swept the world with their faith', arcane: 'completed the Great Working' })[ev.x] || 'triumphed'}, and our story ended in their shadow`; break;
      default: t = ev.k;
    }
    return cap1(t) + (/[.!?]$/.test(t) ? '' : '.');
  };
  // which major kinds belong to a filter
  G.CHRON_KINDS = {
    war: ['war', 'peace', 'ally', 'conq', 'freecity', 'fall', 'rise', 'revolt', 'slay', 'herofall', 'wyrm', 'meet'],
    realm: ['dawn', 'found', 'wonder', 'faith', 'spell', 'work', 'feat', 'victory', 'defeat', 'cal', 'calend'],
  };

  // -------------------------------------------------------------------
  // feats
  // -------------------------------------------------------------------
  const P = s => s.empires.p;
  const st = (s, k) => (ensure(s).st[k] || 0);
  const minorsOfP = s => {
    try {
      if (typeof G.minorsOf === 'function') return (G.minorsOf(s, 'p') || []).length + (typeof G.minorSubjects === 'function' ? (G.minorSubjects(s, 'p') || []).length : 0);
    } catch (e) { }
    return 0;
  };
  const spyWins = s => {
    try {
      return (s.espionage && s.espionage.stats && s.espionage.stats.p && s.espionage.stats.p.ok) || 0;
    } catch (e) { return 0; }
  };
  const foreignFaithful = s => {
    const f = P(s).faithId;
    if (!f || !G.majorityFaith) return false;
    return Object.values(s.cities).some(c => c.owner !== 'p' && G.majorityFaith(c) === f);
  };
  const leads = s => {
    const known = G.chronKnown(s).filter(id => id !== 'p' && !s.empires[id].dead);
    if (known.length < 2 || s.time < 3 * 3600 * G.pace(s).time) return false;
    const me = G.renown(s, 'p');
    return known.every(id => G.renown(s, id) < me);
  };
  G.FEATS = [
    { id: 'settler', icon: '🏘️', name: 'A Second Hearth', desc: 'Found a second city.', test: s => G.citiesOf(s, 'p').length >= 2 },
    { id: 'realm5', icon: '🏰', name: 'A Realm of Five', desc: 'Rule five cities at once.', test: s => G.citiesOf(s, 'p').length >= 5 },
    { id: 'conqueror', icon: '⚔️', name: 'Spear-Won', desc: 'Take a city by force: a rival\'s or a free city.', test: s => st(s, 'conquered') >= 1 },
    { id: 'toppler', icon: '💀', name: 'Breaker of Crowns', desc: 'Take the last city of a rival realm.', test: s => st(s, 'toppled') >= 1 },
    { id: 'phoenix', icon: '🔥', name: 'What Was Ours', desc: 'Win back a city you had lost.', test: s => st(s, 'retaken') >= 1 },
    { id: 'walls', icon: '🛡️', name: 'The Walls Held', desc: 'Repel five assaults on your cities.', test: s => st(s, 'repelled') >= 5 },
    { id: 'survivor', icon: '🌋', name: 'Weathered the Storm', desc: 'Endure a calamity that struck your lands without losing the city.', test: s => st(s, 'endured') >= 1 },
    { id: 'wyrmslayer', icon: '🐉', name: 'Wyrmslayer', desc: 'Slay an elder wyrm.', test: s => st(s, 'wyrms') >= 1 },
    { id: 'heroslayer', icon: '🗡️', name: 'Bane of Champions', desc: 'Slay a rival hero.', test: s => st(s, 'heroesSlain') >= 1 || (P(s).heroesSlain || 0) >= 1 },
    { id: 'peacemaker', icon: '🕊️', name: 'Swords to Ploughshares', desc: 'Make peace with a realm you were at war with.', test: s => st(s, 'peaces') >= 1 },
    { id: 'allied', icon: '🤝', name: 'Bound by Oath', desc: 'Swear an alliance.', test: s => st(s, 'alliances') >= 1 },
    { id: 'foremost', icon: '🥇', name: 'Foremost of Realms', desc: 'After three hours, out-renown every realm you know (at least two).', test: leads },
    { id: 'host', icon: '🏹', name: 'A Mighty Host', desc: 'Field an army of 300 soldiers.', test: s => armyOf(s, 'p') >= 300 },
    { id: 'metropolis', icon: '🏙️', name: 'City of Multitudes', desc: 'Grow a single city to 600 people.', test: s => G.citiesOf(s, 'p').some(c => c.pop >= 600) },
    { id: 'customs', icon: '🎭', name: 'Keepers of Custom', desc: 'Adopt three traditions.', test: s => (P(s).traditions || []).length >= 3 },
    { id: 'prophet', icon: '⛪', name: 'Prophet', desc: 'Found a faith.', test: s => st(s, 'faiths') >= 1 || !!(s.faiths && Object.values(s.faiths).some(f => f.founder === 'p')) },
    { id: 'missionary', icon: '📿', name: 'Beyond Our Borders', desc: 'Have a foreign city follow your state faith.', test: foreignFaithful },
    { id: 'firstspell', icon: '✨', name: 'First Weaving', desc: 'Cast a spell.', test: s => st(s, 'spells') >= 1 },
    { id: 'shaper', icon: '⛰️', name: 'World-Shaper', desc: 'Reshape the land with a great spell.', test: s => st(s, 'shaped') >= 1 },
    { id: 'working', icon: '🌌', name: 'The Weave Answers', desc: 'Complete a stage of the Great Working.', test: s => !!(s.magic && s.magic.working && s.magic.working.p && s.magic.working.p.stage >= 1) },
    { id: 'wonder1', icon: '🏛️', name: 'First Stone', desc: 'Raise the first stage of your wonder.', test: s => (P(s)._wonderLevel || 0) >= 1 },
    { id: 'wonder5', icon: '🗿', name: 'Halfway to Legend', desc: 'Raise your wonder to stage five.', test: s => (P(s)._wonderLevel || 0) >= 5 },
    { id: 'merchant', icon: '🐪', name: 'Open Roads', desc: 'Open a trade route.', test: s => !!(G.routes && G.routes(s).some(r => r.owner === 'p')) },
    { id: 'tradeprince', icon: '💰', name: 'Merchant Prince', desc: 'Earn 1,500 gold from trade routes in one game.', test: s => (P(s).tradeIncome || 0) >= 1500 },
    { id: 'freecities', icon: '🏳️', name: 'Friend of the Free', desc: 'Be patron (or overlord) of three free cities at once.', test: s => minorsOfP(s) >= 3, needs: () => typeof G.minorsOf === 'function' },
    { id: 'spymaster', icon: '🕵️', name: 'Whispers in the Dark', desc: 'Complete a spy mission.', test: s => spyWins(s) >= 1, needs: () => typeof G.sendSpy === 'function' },
    { id: 'win_conquest', icon: '👑', name: 'By Iron', desc: 'Win by conquest.', test: s => s.victory === true || s.victory === 'conquest' },
    { id: 'win_wonder', icon: '🏛️', name: 'By Legend', desc: 'Win with a wonder.', test: s => s.victory === 'wonder' },
    { id: 'win_faith', icon: '🙏', name: 'By Faith', desc: 'Win a religious victory.', test: s => s.victory === 'faith' },
    { id: 'win_arcane', icon: '🔮', name: 'By the Weave', desc: 'Win with the Great Working.', test: s => s.victory === 'arcane' },
  ];
  const featById = id => G.FEATS.find(f => f.id === id);
  G.featActive = f => !f.needs || f.needs();

  // persistent store: { id: { t (ms), race, realm } }
  G.featsAll = () => {
    try { const raw = typeof localStorage !== 'undefined' && localStorage.getItem(G.FEATS_KEY); return raw ? JSON.parse(raw) || {} : {}; } catch (e) { return {}; }
  };
  const saveAll = all => { try { localStorage.setItem(G.FEATS_KEY, JSON.stringify(all)); } catch (e) { } };
  G.featsThisGame = s => Object.keys(ensure(s).feats);
  G.featJustEarned = [];   // ids earned since the UI last looked (for a toast)
  const checkFeats = s => {
    const ch = ensure(s);
    let all = null;
    for (const f of G.FEATS) {
      if (ch.feats[f.id] !== undefined || !G.featActive(f)) continue;
      let ok = false;
      try { ok = !!f.test(s); } catch (e) { ok = false; }
      if (!ok) continue;
      ch.feats[f.id] = Math.round(s.time);
      addEvent(s, 'feat', { x: f.name });
      all = all || G.featsAll();
      if (!all[f.id]) all[f.id] = { t: Date.now(), race: P(s).race, realm: P(s).name };
      all[f.id].n = (all[f.id].n || 0) + 1;
      G.featJustEarned.push(f.id);
      if (G.log) G.log(s, 'p', `${f.icon} Feat: ${f.name} — ${f.desc}`, 'good');
    }
    if (all) saveAll(all);
  };
  G.checkFeats = s => checkFeats(s);
  G.featById = featById;

  // -------------------------------------------------------------------
  // end-of-game summary
  // -------------------------------------------------------------------
  G.chronSummary = s => {
    const ch = ensure(s);
    const known = G.chronKnown(s);
    const stand = known.map(id => {
      const e = s.empires[id], v = measure(s, id);
      return { id, name: e.name, race: e.race, color: e.color, dead: !!e.dead, renown: e.dead ? 0 : G.renown(s, id), cities: v.c, pop: Math.round(v.p), army: v.a, conquests: e.conquests || 0, wonder: e._wonderLevel || 0 };
    }).sort((a, b) => (a.dead - b.dead) || b.renown - a.renown);
    return {
      book: G.chronBook(s), time: ch.endedAt || Math.round(s.time), outcome: s.victory ? (s.victory === true ? 'conquest' : s.victory) : s.gameOver || null,
      by: s.gameOverBy || null, standings: stand,
      stats: {
        peakRenown: ch.st.peakRenown || 0, peakCities: ch.st.peakCities || 0, founded: ch.st.founded || 0, conquered: ch.st.conquered || 0,
        lost: ch.st.lost || 0, battlesWon: ch.st.battlesWon || 0, battlesLost: ch.st.battlesLost || 0, repelled: ch.st.repelled || 0,
        spells: ch.st.spells || 0, endured: ch.st.endured || 0, wars: ch.st.wars || 0, heroesSlain: ch.st.heroesSlain || 0,
      },
      feats: Object.keys(ch.feats),
    };
  };
})();
