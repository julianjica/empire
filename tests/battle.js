// Tactical battles: roles, battlefield terrain, rivers, counters, phases, previews and reports.
// Run from the repo root: node tests/battle.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
// a bare DOM so the report renderer in ui-core.js can be loaded
const fakeEl = () => ({ value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
global.document = { getElementById: fakeEl, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: fakeEl(), documentElement: fakeEl(), createElement: fakeEl };
global.window = { scrollY: 0, scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/ui-core.js'].filter(f=>fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
if (typeof initRaces2 === 'function') initRaces2();
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : '')); };
const ROLES = Object.keys(DATA.roleInfo);
const R = DATA.battleRules;

// ---- roles ----
ok('every unit has a known role', Object.keys(DATA.units).every(u => ROLES.includes(G.roleOf(u))), Object.keys(DATA.units).filter(u => !ROLES.includes(G.roleOf(u))).join(','));
const raceUnits = DATA.raceOrder.flatMap(r => DATA.races[r].units);
ok('all 8 peoples listed', DATA.raceOrder.length === 8);
ok('every people\\'s unit has an explicit role (mages may be inferred)', raceUnits.every(u => DATA.units[u].role || DATA.units[u].mage), raceUnits.filter(u => !DATA.units[u].role && !DATA.units[u].mage).join(','));
ok('every people fields infantry, cavalry and ranged', DATA.raceOrder.every(r => ['infantry', 'cavalry', 'ranged'].every(k => DATA.races[r].units.some(u => G.roleOf(u) === k)) || DATA.races[r].units.some(u => G.roleOf(u) === 'flyer')));
ok('role inference', G.roleOf('knight') === 'cavalry' && G.roleOf('longbow') === 'ranged' && G.roleOf('ram_h') === 'siege' && G.roleOf('rocrider') === 'flyer'
  && G.roleOf('warship') === 'ship' && G.roleOf('stormcaller') === 'mage' && G.roleOf('scout') === 'support' && G.roleOf('pikeman') === 'infantry');
ok('inferred roles for units added by modules', G.roleOf('wyrm') === 'infantry' && (!DATA.units.priest || G.roleOf('priest') === 'support') && DATA.races.hearth.mageUnit && G.roleOf(DATA.races.hearth.mageUnit) === 'mage');

// ---- terrain bounds ----
let worst = 0;
for (const terrain of Object.keys(DATA.battleTerrain)) for (let season = 0; season < 4; season++) for (const crossing of [false, true]) for (const coast of [false, true]) {
  const f = { terrain, river: crossing, crossing, coast, season, weather: Object.keys(R.weather), naval: false };
  for (const u of Object.keys(DATA.units)) for (const side of ['att', 'def']) worst = Math.max(worst, Math.abs(G.fieldMult(f, u, side) - 1));
}
ok('no role\\'s ground effect beyond ±25%', worst <= R.cap + 1e-9, 'worst ' + worst.toFixed(3));
ok('terrain tables cover every map terrain', Object.keys(DATA.terrain).every(t => DATA.battleTerrain[t]));
ok('table entries within ±25%', Object.values(DATA.battleTerrain).every(t => t.def <= 0.25 && Object.values(t.roles).every(v => Math.abs(v) <= 0.25)));
const fld = (terrain, extra) => Object.assign({ terrain, river: false, crossing: false, coast: false, season: 1, weather: [], naval: false }, extra || {});
ok('cavalry weak in forest, strong on plains', G.fieldMult(fld('forest'), 'knight', 'att') === 0.8 && G.fieldMult(fld('plains'), 'knight', 'att') === 1 + DATA.battleTerrain.plains.roles.cavalry);
ok('archers strong on hills', G.fieldMult(fld('hills'), 'longbow', 'def') === 1.15);
ok('siege poor in the mountains', G.fieldMult(fld('mountain'), 'ram_h', 'att') === 0.8);
ok('flyers ignore the ground', G.fieldMult(fld('forest', { crossing: true, season: 3 }), 'rocrider', 'att') === 1);
ok('winter snow slows cavalry', G.fieldMult(fld('hills', { season: 3 }), 'knight', 'att') < G.fieldMult(fld('hills'), 'knight', 'att'));
ok('river crossing penalised (worse in spring)', G.fieldMult(fld('fertile', { crossing: true }), 'militia', 'att') === 1 + R.river
  && G.fieldMult(fld('fertile', { crossing: true, season: 0 }), 'militia', 'att') === 1 + R.riverSpring && G.fieldMult(fld('fertile', { crossing: true }), 'militia', 'def') === 1);
ok('amphibious troops strong at rivers and shores', G.fieldMult(fld('fertile', { crossing: true }), 'shorespear', 'att') === 1 + R.amphibious && G.fieldMult(fld('plains', { coast: true }), 'shorespear', 'def') === 1 + R.amphibious);
ok('flooded fields bog down cavalry', Math.abs(G.fieldMult(fld('fertile', { weather: ['flood'] }), 'knight', 'att') - (1 + DATA.battleTerrain.fertile.roles.cavalry - 0.1)) < 1e-9);

// ---- counters ----
const cav = { cavalry: 1 }, infm = { infantry: 1 }, rng = { ranged: 1 };
ok('infantry beats cavalry', G.counterBonus(infm, cav) === R.counter && G.counterBonus(cav, infm) === -R.counter);
ok('cavalry beats ranged, ranged beats infantry', G.counterBonus(cav, rng) > 0 && G.counterBonus(rng, infm) > 0 && G.counterBonus(rng, cav) < 0);
ok('even mixes cancel out', Math.abs(G.counterBonus({ infantry: 1 / 3, cavalry: 1 / 3, ranged: 1 / 3 }, { infantry: 1 / 3, cavalry: 1 / 3, ranged: 1 / 3 })) < 1e-9);
let cmax = 0; for (let i = 0; i < 300; i++) { const a = [Math.random(), Math.random(), Math.random(), Math.random()], b = [Math.random(), Math.random(), Math.random(), Math.random()];
  const sa = a.reduce((x, y) => x + y), sb = b.reduce((x, y) => x + y);
  const m = { infantry: a[0] / sa, cavalry: a[1] / sa, ranged: a[2] / sa, siege: a[3] / sa }, t = { infantry: b[0] / sb, cavalry: b[1] / sb, ranged: b[2] / sb, flyer: b[3] / sb };
  cmax = Math.max(cmax, Math.abs(G.counterBonus(m, t))); }
ok('counters bounded by ±10%', cmax <= R.counter + 1e-9, cmax.toFixed(3));

// ---- battles ----
const s = G.newGame({ name: 'T', race: 'hearth' }); s.settings.hostility = 0;
const cap = G.capital(s, 'p');
const tileOf = terrain => s.tiles.find(t => t.terrain === terrain && !t.city && !t.camp && !t.oasis && !t.ruin && !t.minor);
const plains = tileOf('plains') || tileOf('fertile'), forest = tileOf('forest');
const bat = (att, def, mode, x, y, extra) => G.battle(s, 'p', att, 1, null, def, 1, 10, Object.assign({ mode, x, y }, extra || {}));
const kP = bat({ knight: 50 }, { brigand: 100 }, 'raid', plains.x, plains.y), kF = bat({ knight: 50 }, { brigand: 100 }, 'raid', forest.x, forest.y);
ok('cavalry charge hits harder on open ground than in a forest', kP.A > kF.A && kF.D > kP.D, kP.A + ' vs ' + kF.A);
const plain = G.battle(s, 'p', { knight: 50 }, 1, null, { brigand: 100 }, 1, 10, 'raid');
ok('string modes still work (no battlefield)', plain.tactics && plain.tactics.terrain === null && plain.A > 0);
ok('classic result fields kept', ['A', 'D', 'win', 'attLoss', 'defLoss', 'attLost', 'attLeft', 'defLost', 'defLeft'].every(k => k in kP));
// the same army, the same foes: a river at the target costs the attacker
const rt = tileOf('fertile') || plains;
const keep = s.rivers; s.rivers = []; G.clearPaths(s);
const dry = bat({ militia: 100 }, { brigand: 60 }, 'raid', rt.x, rt.y);
s.rivers = [[rt.y * s.map + rt.x]];
const wet = bat({ militia: 100 }, { brigand: 60 }, 'raid', rt.x, rt.y);
const wetSwim = bat({ shorespear: 100 }, { brigand: 60 }, 'raid', rt.x, rt.y), drySwimRef = (() => { s.rivers = []; const r = bat({ shorespear: 100 }, { brigand: 60 }, 'raid', rt.x, rt.y); s.rivers = [[rt.y * s.map + rt.x]]; return r; })();
ok('river crossing penalty', wet.tactics.crossing && Math.abs(wet.A / dry.A - (G.season(s).index === 0 ? 1 + R.riverSpring : 1 + R.river)) < 0.02, wet.A + ' vs ' + dry.A);
ok('amphibious troops wade in and gain', wetSwim.A > drySwimRef.A || drySwimRef.tactics.coast);
ok('river crossing named in the breakdown', wet.tactics.mods.some(m => m.side === 'att' && /River crossing/.test(m.label) && m.pct < 0));
// a march whose last steps cross a river
const path = [[cap.x, cap.y], [rt.x, rt.y], [rt.x + (rt.x + 1 < s.map ? 1 : -1), rt.y]];
const bf = G.battlefield(s, path[2][0], path[2][1], path, false);
ok('crossing from the march route', bf.crossing === true && G.battlefield(s, path[2][0], path[2][1], path, true).crossing === (s.rivers[0][0] === path[2][1] * s.map + path[2][0]));
s.rivers = keep; G.clearPaths(s);
// phases
let phaseOk = true, phaseNote = '';
for (const [att, def, mode] of [[{ knight: 40, crossbow: 30, militia: 50 }, { brigand: 80 }, 'raid'], [{ militia: 10 }, { brigand: 200 }, 'attack'], [{ crossbow: 60, outrider: 20 }, { pikeman: 30, crossbow: 20 }, 'attack'], [{ knight: 30, hero: 1 }, { brigand: 30 }, 'raid']]) {
  const r = bat(att, def, mode, plains.x, plains.y);
  for (const [side, lost] of [['att', r.attLost], ['def', r.defLost]]) for (const u of Object.keys(lost)) {
    const sum = r.tactics.phases.reduce((a, p) => a + ((side === 'att' ? p.attLost : p.defLost)[u] || 0), 0);
    if (sum !== lost[u]) { phaseOk = false; phaseNote = side + ' ' + u + ' ' + sum + '/' + lost[u]; }
  }
}
ok('three phases whose casualties add up to the totals', phaseOk, phaseNote);
const vr = bat({ crossbow: 80 }, { brigand: 40 }, 'raid', plains.x, plains.y);
ok('archers do their killing in the opening volley', G.unitsCount(vr.tactics.phases[0].defLost) > 0 && vr.tactics.phases.length === 3);
const pr = bat({ knight: 80 }, { brigand: 30 }, 'raid', plains.x, plains.y);
ok('riders run down the fleeing in the pursuit', G.unitsCount(pr.tactics.phases[2].defLost) > 0);
// every modifier sits within its bound
ok('modifiers stay within bounds', [kP, kF, wet, vr, pr].every(r => r.tactics.mods.every(m => m.kind !== 'field' && m.kind !== 'counter' || Math.abs(m.pct) <= 25)));

// ---- preview matches the real battle ----
const camp = Object.values(s.camps).filter(c => G.landReachable(s, cap, c)).sort((a, b) => G.dist(a, cap) - G.dist(b, cap))[0];
const ct = G.tileAt(s, camp.x, camp.y);
cap.units = { knight: 30, crossbow: 30, militia: 60 }; Object.assign(cap.buildings, { barracks: 5 });
s.intel[G.tileIdx(s, ct)] = { t: s.time, units: { ...camp.units } };
const army = { knight: 30, crossbow: 30, militia: 60 };
const pv = G.previewField(s, cap, ct, army, 'raid');
const err = G.sendArmy(s, cap.id, ct.x, ct.y, 'raid', army);
const mv = s.moves.find(m => m.type === 'raid');
ok('raid sent', !err && !!mv, err);
camp.units = { ...s.intel[G.tileIdx(s, ct)].units };
if (mv) { mv.arrive = s.time + 1; G.advance(s, 2, 4); }
const rep = s.reports.find(r => r.body && r.body.attSent && r.body.tactics);
ok('battle report carries the breakdown', !!rep && rep.body.tactics.phases.length === 3 && rep.body.tactics.terrain === ct.terrain);
ok('preview matches the resolution', !!rep && pv.A === rep.body.A && pv.D === rep.body.D && JSON.stringify(pv.attLost) === JSON.stringify(rep.body.attLost), pv.A + '/' + pv.D + ' vs ' + (rep && rep.body.A) + '/' + (rep && rep.body.D));
ok('preview shows the terrain and counters', pv.tactics && pv.tactics.terrain === ct.terrain && Array.isArray(pv.tactics.mods));
ok('preview against an AI city (scouted) includes walls', (() => { const ai = G.capital(s, 'a1'); ai.buildings.wall = 5; const t = G.tileAt(s, ai.x, ai.y);
  s.intel[G.tileIdx(s, t)] = { t: s.time, units: { ...ai.units, militia: 20 }, wall: 5, th: 3 };
  const p = G.previewField(s, cap, t, { militia: 10 }, 'attack'); return p.known && p.tactics.mods.some(m => /Walls/.test(m.label) && m.pct > 0) && p.tactics.mods.some(m => m.kind === 'flat'); })());

// ---- reports render, old and new ----
let html = '', threw = '';
try { html = reportBody(rep); } catch (e) { threw = e.message; }
ok('new report renders with phases and modifiers', !threw && /Opening volley/.test(html) && /Battlefield/.test(html), threw);
const old = { id: 'r0', t: 0, title: 'Old', kind: 'win', body: { att: 'A', def: 'B', A: 10, D: 5, attSent: { militia: 3 }, attLost: {}, defHad: { brigand: 2 }, defLost: { brigand: 2 }, loot: {}, extra: '' } };
threw = ''; try { html = reportBody(old); } catch (e) { threw = e.message; }
ok('old reports without a breakdown still render', !threw && /Strength/.test(html) && !/Opening volley/.test(html), threw);
threw = ''; try { reportBody({ body: { ...old.body, tactics: { v: 0 } } }); reportBody({ body: { scout: true, failed: true, extra: 'x' } }); } catch (e) { threw = e.message; }
ok('malformed or other reports do not break', !threw, threw);
ok('help mentions terrain and counters', /river/i.test(renderHelp()) && /counter/i.test(renderHelp()));
// saves keep reports
s.reports.unshift(old); G.save(s); const s2 = G.load();
ok('save/load keeps old and new reports', s2 && s2.reports.some(r => r.id === 'r0') && s2.reports.some(r => r.body && r.body.tactics));

// ---- all eight peoples fight ----
for (const race of DATA.raceOrder) {
  const w = G.newGame({ name: 'T', race }); w.settings.hostility = 0;
  const c = G.capital(w, 'p');
  const units = {};
  for (const u of DATA.races[race].units) if (DATA.units[u].type !== 'civ') units[u] = 12;
  c.units = { ...units };
  const foe = G.capital(w, 'a1'); const ft = G.tileAt(w, foe.x, foe.y);
  foe.units = { [DATA.races[w.empires.a1.race].units[0]]: 20, [DATA.races[w.empires.a1.race].units[2]]: 10 };
  let e = '', r2 = null;
  try {
    const p = G.previewField(w, c, ft, units, 'raid');
    e = G.sendArmy(w, c.id, ft.x, ft.y, 'raid', units) || '';
    const m = w.moves.find(x => x.type === 'raid');
    if (m) { m.arrive = w.time + 1; G.advance(w, 2, 4); }
    r2 = w.reports.find(x => x.body && x.body.tactics);
    if (p && p.known === false) e = e || '';
  } catch (x) { e = x.message; }
  ok('the ' + DATA.races[race].name + ' can fight (' + Object.keys(units).length + ' unit types)', !e && !!r2 && Object.keys(r2.body.tactics.roles.att).length >= 3, e || (r2 && JSON.stringify(r2.body.tactics.roles.att)));
}

// ---- free-city battles get the battlefield too ----
if (G.minorAt && s.minors && Object.keys(s.minors).length) {
  const mi = Object.values(s.minors)[0]; const mt = G.tileAt(s, mi.x, mi.y);
  cap.units = { knight: 200, crossbow: 200, militia: 200 };
  G._field = { owner: 'p', units: { knight: 5 }, x: mt.x, y: mt.y, path: null };
  const r3 = G.battle(s, 'p', G._field.units, 1, null, { ...mi.units }, 1, 10, 'raid'); G._field = null;
  ok('module battles during an arrival pick up the battlefield', r3.tactics.terrain === mt.terrain);
}
// ---- the AI weighs counters ----
ok('AI reads the neighbours\\' army mix', typeof G.aiThreatRoles === 'function');
const w2 = G.newGame({ name: 'T', race: 'hearth' }); G.advance(w2, 1800, 200);
ok('AI runs with tactical estimates', Object.values(w2.empires).every(e => !e.dead));

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
`);
