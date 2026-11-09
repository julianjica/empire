// The Chronicle: history sampling, downsampling, timeline, feats, summary, save/load.  node tests/chronicle.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const files = ['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f => fs.existsSync(f));
eval(files.map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? ' ' + x : '')); };
const fresh = (race = 'hearth', o = {}) => { const s = G.newGame({ name: 'T', race, ...o }); s.settings.hostility = 0; s.calamityAt = 1e12; s.eventAt = 1e12; return s; };
const slow = s => { s.slowClock = 9.99; G.step(s, 0.02); };
const kinds = s => s.chronicle.ev.map(e => e.k);
const lastOf = (s, k) => s.chronicle.ev.filter(e => e.k === k).pop();
const clean = t => typeof t === 'string' && t.length > 8 && !/undefined|null|NaN|\\{\\w\\}/.test(t);

// ---- a new game ----
{ const s = fresh(); const ch = s.chronicle;
  ok('new game has a chronicle', !!ch && ch.v === 1);
  ok('the chronicle opens with a dawn entry', ch.ev[0] && ch.ev[0].k === 'dawn', JSON.stringify(ch.ev[0]));
  ok('a first sample is taken at once', ch.h.t.length === 1 && Object.keys(ch.h.e).length === Object.keys(s.empires).length);
  ok('the player is known; far rivals are not', ch.met.p === 1 && G.chronKnown(s).includes('p'));
}

// ---- sampling ----
{ const s = fresh(); G.advance(s, 1800, 180);
  const ch = s.chronicle, n = ch.h.t.length;
  ok('samples every 3 game-minutes', n >= 10 && n <= 12, n);
  const lens = Object.values(ch.h.e).flatMap(row => G.CHRON.metricOrder.map(k => row[k].length));
  ok('every series is aligned with the sample times', lens.every(l => l === n));
  ok('renown and population are recorded', ch.h.e.p.r[n - 1] === G.renown(s, 'p') && ch.h.e.p.p[n - 1] > 0);
  ok('army size is recorded for rivals', ch.h.e.a1.a[n - 1] > 0, ch.h.e.a1.a[n - 1]);
  const sr = G.chronSeries(s, 'r');
  ok('chart series only include known realms', sr.lines.every(l => ch.met[l.id]) && sr.lines.some(l => l.id === 'p'));
  ok('the all-realms series includes everyone', G.chronSeries(s, 'r', true).lines.length === Object.keys(s.empires).length);
}

// ---- downsampling bound ----
{ const s = fresh(); const ch = s.chronicle; const every0 = ch.every;
  for (let i = 0; i < 1000; i++) { s.time += 60; G.chronSample(s); }
  const n = ch.h.t.length;
  ok('samples stay bounded', n <= G.CHRON.maxSamples && n >= G.CHRON.maxSamples / 2, n);
  ok('the interval grows as old samples are thinned', ch.every > every0, every0 + ' -> ' + ch.every);
  ok('the newest sample is kept', ch.h.t[n - 1] === Math.round(s.time));
  ok('times stay in order', ch.h.t.every((t, i) => i === 0 || t > ch.h.t[i - 1]));
  ok('series stay aligned after thinning', Object.values(ch.h.e).every(row => G.CHRON.metricOrder.every(k => row[k].length === n)));
  // a realm that appears later is padded
  s.empires.zz = { id: 'zz', name: 'Late Realm', race: 'ash', gold: 0, color: '#123456', aggr: 0.5 };
  G.chronSample(s);
  ok('a realm that appears later is padded with gaps', ch.h.e.zz.r.length === ch.h.t.length && ch.h.e.zz.r[0] === null);
}

// ---- timeline: conquest, war, peace, calamity ----
{ const s = fresh(); const ch = s.chronicle;
  const ai = G.capital(s, 'a1');
  // conquering a rival city (state change, as the engine's private transfer does)
  G.foundCity(s, 'a1', ...(() => { const t = G.freeTile(s, x => G.dist(x, ai) >= 3 && G.dist(x, ai) <= 5); return [t.x, t.y]; })(), 'Spoilham');
  slow(s);
  const spoil = Object.values(s.cities).find(c => c.name === 'Spoilham');
  spoil.owner = 'p'; s.empires.p.conquests = 1;
  slow(s);
  const ev = lastOf(s, 'conq');
  ok('a conquest is entered in the timeline', ev && ev.a === 'p' && ev.b === 'a1' && ev.c === 'Spoilham', JSON.stringify(ev));
  ok('conquest text reads well', clean(G.chronText(s, ev)), G.chronText(s, ev));
  ok('conquest is counted', G.chronStat(s, 'conquered') === 1);
  // losing it back, then retaking it
  spoil.owner = 'a1'; slow(s);
  ok('a lost city is entered', lastOf(s, 'conq').b === 'p' && G.chronStat(s, 'lost') === 1);
  spoil.owner = 'p'; slow(s);
  ok('retaking a lost city is counted', G.chronStat(s, 'retaken') === 1);
  // war and peace with the player
  G.rel(s, 'a2').status = 'war'; slow(s);
  ok('a war is entered', lastOf(s, 'war') && lastOf(s, 'war').b === 'a2', JSON.stringify(lastOf(s, 'war')));
  G.rel(s, 'a2').status = 'peace'; slow(s);
  ok('a peace is entered', lastOf(s, 'peace') && lastOf(s, 'peace').b === 'a2' && G.chronStat(s, 'peaces') === 1);
  G.rel(s, 'a2').status = 'alliance'; slow(s);
  ok('an alliance is entered', !!lastOf(s, 'ally'));
  // AI wars stay hidden until both realms are known
  const before = s.chronicle.ev.length;
  for (const id of ['a1', 'a2', 'a3']) delete ch.met[id];
  s.explored.fill(0); G.aiRel(s, 'a1', 'a3').status = 'war'; slow(s);
  ok('a war between unknown realms is not recorded', !s.chronicle.ev.slice(before).some(e => e.k === 'war'));
  ch.met.a1 = 1; ch.met.a3 = 1; G.aiRel(s, 'a1', 'a3').status = 'peace'; slow(s);
  ok('a peace between known realms is recorded', !!s.chronicle.ev.slice(before).find(e => e.k === 'peace' && e.a !== 'p'));
  // a calamity strikes the capital and passes
  const cap = G.capital(s, 'p'); s.explored.fill(1);
  const cal = G.startCalamity(s, 'quake', G.tileAt(s, cap.x, cap.y));
  slow(s);
  const ce = lastOf(s, 'cal');
  ok('a calamity on our lands is entered', ce && ce.n >= 1 && ce.x === 'quake', JSON.stringify(ce));
  ok('calamity text reads well', clean(G.chronText(s, ce)), G.chronText(s, ce));
  cal.end = s.time - 1; slow(s);
  ok('enduring it is entered and counted', !!lastOf(s, 'calend') && G.chronStat(s, 'endured') === 1);
  G.checkFeats(s);
  ok('feats unlock: conquest, survivor, peacemaker, alliance, retaken', ['conqueror', 'survivor', 'peacemaker', 'allied', 'phoenix'].every(f => G.featsThisGame(s).includes(f)), G.featsThisGame(s).join());
  ok('an earned feat is entered in the timeline', kinds(s).includes('feat'));
  // a revolt removes a city
  const reb = G.citiesOf(s, 'p').find(c => c !== cap);
  G.revoltCity(s, reb); slow(s);
  ok('a revolt is entered', lastOf(s, 'revolt') && lastOf(s, 'revolt').a === 'p');
  // a rival falls
  for (const c of G.citiesOf(s, 'a3')) c.owner = 'a1';
  s.empires.a3.dead = true; slow(s);
  ok('a fallen realm is entered', lastOf(s, 'fall') && lastOf(s, 'fall').b === 'a3');
}

// ---- faiths, spells, the Working, wonders, victory ----
{ const s = fresh(); const c = G.capital(s, 'p'); s.explored.fill(1);
  c.buildings.temple = 1; s.empires.p.faith = 1000;
  ok('found a faith', G.foundFaith(s, 'p', { name: 'The Ember Way', god: G.raceGods('hearth')[0], tenets: ['tithes', 'charity'] }) === null);
  slow(s);
  ok('a founded faith is entered', lastOf(s, 'faith') && lastOf(s, 'faith').a === 'p' && /Ember Way/.test(G.chronText(s, lastOf(s, 'faith'))), lastOf(s, 'faith') && G.chronText(s, lastOf(s, 'faith')));
  c.res.mana = 1e5; c.buildings.magetower = 15; c.buildings.townhall = 15;
  ok('a spell cast is counted', G.castSpell(s, 'p', c.id, 'bountifulrain', c.id) === null && G.chronStat(s, 'spells') === 1);
  const land = s.tiles.find(t => ['plains', 'fertile', 'hills'].includes(t.terrain) && !t.city && !t.camp && !t.oasis && !t.ruin && Math.hypot(t.x - c.x, t.y - c.y) <= 3 && Math.hypot(t.x - c.x, t.y - c.y) > 0);
  // Wildwood is taught in the Song & Root tree (Archmage circle): open the school and learn the node first
  G.grimoire(s, 'p').opened = [...G.grimoire(s, 'p').opened, 'songroot'];
  ok('Wildwood is learned through its Grimoire node', G.learnArcanum(s, 'p', G.spellNode('growforest'), { free: true, path: true }) === null && G.spellsOf(s, 'p').includes('growforest'));
  const r = land ? G.castSpell(s, 'p', c.id, 'growforest', { x: land.x, y: land.y }) : 'no land';
  ok('a world-shaping spell is entered', r === null && lastOf(s, 'spell') && lastOf(s, 'spell').n === 1 && G.chronStat(s, 'shaped') === 1, r);
  G.magicState(s).working.p = { stage: 1, end: null }; slow(s);
  ok('a stage of the Great Working is entered', lastOf(s, 'work') && lastOf(s, 'work').n === 1);
  c.buildings[DATA.wonders.hearth.key] = 1; slow(s);
  ok('a wonder stage is entered', lastOf(s, 'wonder') && lastOf(s, 'wonder').n === 1);
  G.checkFeats(s);
  ok('feats unlock: prophet, first spell, world-shaper, working, first stone', ['prophet', 'firstspell', 'shaper', 'working', 'wonder1'].every(f => G.featsThisGame(s).includes(f)), G.featsThisGame(s).join());
  s.victory = 'wonder'; slow(s); G.checkFeats(s);
  ok('a victory is entered', lastOf(s, 'victory') && lastOf(s, 'victory').x === 'wonder');
  ok('a victory feat unlocks', G.featsThisGame(s).includes('win_wonder'));
  const sm = G.chronSummary(s);
  ok('the summary has standings, stats and feats', sm.outcome === 'wonder' && sm.standings[0] && sm.standings.some(x => x.id === 'p') && sm.stats.spells === 2 && sm.feats.includes('win_wonder'), JSON.stringify(sm.stats));
  ok('a final sample is taken at the end', s.chronicle.h.t[s.chronicle.h.t.length - 1] === Math.round(s.time));
}
{ const s = fresh(); s.gameOver = 'arcane'; s.gameOverBy = 'a1'; s.chronicle.met.a1 = 1; slow(s);
  const e = lastOf(s, 'defeat');
  ok('a defeat is entered', e && e.x === 'arcane' && clean(G.chronText(s, e)), e && G.chronText(s, e));
}

// ---- free cities (if js/minors.js is present) ----
if (G.minorsList) { const s = fresh(); s.explored.fill(1); slow(s);
  const ms = G.minorsList(s);
  if (ms.length >= 2) {
    s.empires.p.renownBonus = 5000;
    const c = G.minorCapture(s, ms[0], 'p', {}); slow(s);
    const e = lastOf(s, 'freecity');
    ok('storming a free city is entered as a conquest', c && e && e.x === 'took' && e.a === 'p' && G.chronStat(s, 'conquered') === 1 && !kinds(s).includes('found'), e && G.chronText(s, e));
    ms[1].subject = 'p'; slow(s);
    ok('a free city made to bow is entered', lastOf(s, 'freecity').x === 'sub' && clean(G.chronText(s, lastOf(s, 'freecity'))));
  } else console.log('SKIP fewer than two free cities');
} else console.log('SKIP no free cities module');

// ---- feats persist across games ----
{ const all = G.featsAll();
  ok('feats are stored in their own localStorage key', !!localStorage.getItem(G.FEATS_KEY) && all.conqueror && all.win_wonder && all.conqueror.race === 'hearth');
  const s = fresh('ash');
  ok('a new game starts with no feats of its own', G.featsThisGame(s).length === 0);
  ok('but the old feats survive a new game', G.featsAll().conqueror && G.featsAll().prophet);
  G.wipe();
  ok('and survive wiping the save', !!G.featsAll().conqueror);
  ok('20-30 feats, each with icon, name, desc and test', G.FEATS.length >= 20 && G.FEATS.length <= 32 && G.FEATS.every(f => f.icon && f.name && f.desc && typeof f.test === 'function'), G.FEATS.length);
  ok('feat ids are unique', new Set(G.FEATS.map(f => f.id)).size === G.FEATS.length);
}

// ---- save / load ----
{ const s = fresh(); G.advance(s, 3600, 360); G.rel(s, 'a1').status = 'war'; slow(s);
  const n = s.chronicle.ev.length, m = s.chronicle.h.t.length;
  G.save(s); const s2 = G.load();
  ok('the chronicle survives save/load', s2 && s2.chronicle && s2.chronicle.ev.length === n && s2.chronicle.h.t.length === m);
  G.advance(s2, 600, 60);
  ok('and keeps recording after a load', s2.chronicle.h.t.length > m && !s2.chronicle.ev.slice(n).some(e => e.k === 'found' && e.a !== 'p' && !s2.chronicle.met[e.a]));
  // an old save without any chronicle
  const s3 = fresh(); G.advance(s3, 1200, 120); delete s3.chronicle;
  const json = G.serialize(s3);
  const s4 = G.deserialize(json);
  ok('an old save without a chronicle loads', !!s4 && !!s4.chronicle && s4.chronicle.ev.length === 0);
  G.advance(s4, 1200, 120);
  ok('and starts its chronicle without replaying old history', !s4.chronicle.ev.some(e => e.k === 'found' || e.k === 'dawn') && s4.chronicle.h.t.length >= 1, kinds(s4).join());
  const s5 = JSON.parse(json); delete s5.chronicle; G.advance(s5, 60, 6);
  ok('lazy init also works without migrate', !!s5.chronicle);
}

// ---- all eight peoples speak ----
{ const evs = [{ t: 100, k: 'dawn', a: 'p', c: 'Home' }, { t: 200, k: 'found', a: 'p', c: 'Newtown' }, { t: 300, k: 'conq', a: 'p', an: 'Me', b: 'a1', bn: 'Foe', c: 'Gate' }, { t: 400, k: 'conq', a: 'a1', an: 'Foe', b: 'p', c: 'Gate' },
    { t: 500, k: 'war', a: 'p', b: 'a1', bn: 'Foe' }, { t: 600, k: 'peace', a: 'p', b: 'a1', bn: 'Foe' }, { t: 700, k: 'cal', x: 'wyrm', n: 2, c: 'Home' }, { t: 800, k: 'calend', a: 'p', x: 'flood' },
    { t: 900, k: 'faith', a: 'p', x: 'The Way', c: 'Ysolde' }, { t: 1000, k: 'spell', a: 'p', x: 'Raise the Land', n: 1 }, { t: 1100, k: 'victory', a: 'p', x: 'faith' }, { t: 1200, k: 'defeat', a: 'a1', an: 'Foe', x: 'wonder' },
    { t: 1300, k: 'fall', b: 'a1', bn: 'Foe' }, { t: 1400, k: 'wonder', a: 'p', x: 'The Spire', n: 3 }, { t: 1500, k: 'herofall', a: 'p', x: 'Aldric' }, { t: 1600, k: 'revolt', a: 'p', c: 'Gate' }];
  const bad = [], seen = new Set();
  for (const race of DATA.raceOrder) {
    const s = fresh(race);
    for (const e of evs) { const t = G.chronText(s, e); if (!clean(t)) bad.push(race + ':' + e.k + ':' + t); seen.add(t); }
    ok(race + ': has a chronicler (' + G.chronBook(s) + ')', !!G.CHRON_VOICE[race] && G.chronBook(s).length > 4);
  }
  ok('every people writes every kind of entry cleanly', !bad.length, bad.slice(0, 3).join(' | '));
  ok('the peoples write in different voices', seen.size > evs.length * 5, seen.size);
}

// ---- a long run: save size and cost ----
{ const s = G.newGame({ name: 'T', race: 'tide' }); const t0 = Date.now();
  G.advance(s, 12 * 3600, 12 * 360);
  const ms = Date.now() - t0;
  const full = G.serialize(s).length, ch = s.chronicle; delete s.chronicle; const without = G.serialize(s).length; s.chronicle = ch;
  ok('a 12-hour game keeps the chronicle small', full - without < 30000, (full - without) + ' bytes of ' + full + ', ' + ch.h.t.length + ' samples, ' + ch.ev.length + ' entries, ' + ms + 'ms');
  ok('the timeline stays bounded', ch.ev.length <= G.CHRON.maxEvents);
  ok('every entry of a real game reads cleanly', ch.ev.every(e => clean(G.chronText(s, e))), (ch.ev.find(e => !clean(G.chronText(s, e))) || {}).k);
}
console.log(fails ? fails + ' FAILED' : 'all chronicle checks passed');
`);
