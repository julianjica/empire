// Upkeep and wear: every good is used by something, shortages bite, the breakdown adds up, AIs stay solvent.
// node tests/economy.js [hours=6]
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const hours = +(process.argv[2] || 6);
const files = ['js/data.js', 'js/races2.js', 'js/engine.js', 'js/research.js', 'js/forge.js', 'js/hero.js', 'js/diplomacy.js', 'js/events.js', 'js/calamities.js', 'js/culture.js', 'js/traditions.js', 'js/wonders.js', 'js/seasons.js', 'js/religion.js', 'js/traderoutes.js', 'js/rivalheroes.js', 'js/magic.js', 'js/espionage.js', 'js/minors.js', 'js/chronicle.js', 'js/council.js', 'js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js'].filter(f => fs.existsSync(f));
eval(files.map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
if (typeof initRaces2 === 'function') initRaces2();
let fails = 0;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' ' + extra : '')); };
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
Math.random = mulberry(4242);
const fresh = (race = 'hearth') => { const s = G.newGame({ name: 'T', race, rivals: 1 }); s.settings.hostility = 0; s.calamityAt = 1e12; s.eventAt = 1e12; return s; };
const seasonAt = (s, i) => { s.time = (i + 0.5) * 7200 * G.pace(s).time; };
const sumParts = l => (l || []).reduce((a, p) => a + p.amount, 0);
const use = (parts, g) => (parts[g] || []).filter(p => p.amount < 0).reduce((a, p) => a - p.amount, 0);
// a busy city of each people: big, armed, every workshop built
const busy = (race) => {
  const s = fresh(race); const c = G.capital(s, 'p');
  Object.assign(c.buildings, { townhall: 12, houses: 12, warehouse: 12, farm: 12, lumber: 10, quarry: 10, mine: 10, smelter: 6, smithy: 5, armory: 5, wall: 8, barracks: 6, harbor: 3, magetower: 4, market: 3 });
  const uq = DATA.races[race].unique; if (uq && DATA.buildings[uq]) c.buildings[uq] = 5;
  c.pop = 300; c.ward = s.time + 600;
  for (const g of DATA.goodOrder) c.res[g] = 500;
  const units = DATA.races[race].units;
  c.units = { [units[1]]: 30, [units[2]]: 20, [units[4]]: 10 };
  const mage = DATA.races[race].mageUnit; if (mage && DATA.units[mage]) c.units[mage] = 4;
  return { s, c };
};

// ---- every good has a sink, and parts sum to net (all eight peoples) ----
const sinkOf = {};
for (const race of DATA.raceOrder) {
  const { s, c } = busy(race);
  const e = G.econ(s, c), parts = G.econParts(s, c, e);
  let worst = 0, worstG = '';
  for (const g of DATA.goodOrder) { const d = Math.abs(sumParts(parts[g]) - (e.net[g] || 0)); if (d > worst) { worst = d; worstG = g; } }
  ok(race + ': parts sum to net', worst < 1e-6, worstG + ' off by ' + worst);
  const goldNet = sumParts(parts.gold);
  ok(race + ': gold parts = taxes − wages', Math.abs(goldNet - (e.tax - e.wages)) < 1e-6 && e.wages > 0, goldNet.toFixed(2));
  for (const g of DATA.goodOrder) if (use(parts, g) > 0) sinkOf[g] = (sinkOf[g] || []).concat(race);
}
for (const g of DATA.goodOrder) ok('sink for ' + g, !!sinkOf[g], (sinkOf[g] || []).join(','));

// ---- firewood: winter burns more than summer; cold sites more ----
{
  const s = fresh('hearth'); const c = G.capital(s, 'p'); c.pop = 100;
  const fw = () => -(G.econ(s, c).sinks.timber.find(l => /^Firewood/.test(l.label)) || { amount: 0 }).amount;
  seasonAt(s, 1); const summer = fw(); seasonAt(s, 3); const winter = fw();
  ok('winter firewood > summer', winter > summer * 3, summer.toFixed(2) + ' vs ' + winter.toFixed(2));
  const was = c.terrain; c.terrain = 'mountain'; const cold = fw(); c.terrain = was;
  ok('mountain sites burn more', cold > winter, cold.toFixed(2));
  const d = fresh('delver'); const dc = G.capital(d, 'p'); dc.pop = 100; dc.terrain = 'plains'; seasonAt(d, 3);
  const dw = -(G.econ(d, dc).sinks.timber.find(l => /^Firewood/.test(l.label))).amount;
  ok('Deepdelvers feel winter less', dw < winter, dw.toFixed(2));
  // running out of firewood in winter: unhappy and a few die
  c.res.timber = 0; G.modSources.push(nofw = (s2, o, cc, k) => (cc === c && k === 'timber') ? 0 : 1);
  const p0 = c.pop; G.advance(s, 600, 60);
  ok('no firewood in winter: short, freezing, people lost', c.short.timber && G.happiness(s, c).why.some(w => /firewood/.test(w.label)) && c.pop < p0, JSON.stringify(c.short) + ' pop ' + p0.toFixed(0) + '->' + c.pop.toFixed(0));
  G.modSources.splice(G.modSources.indexOf(nofw), 1);
}
var nofw;

// ---- tools: worn out by workers; a shortage slows raw goods ----
{
  const { s, c } = busy('hearth');
  const before = G.econ(s, c).raw.grain;
  c.res.tools = 0; c.refineOff = { smithy: true };
  G.advance(s, 600, 60);
  ok('tools run out -> short', c.short.tools, JSON.stringify(c.short));
  const after = G.econ(s, c).raw.grain;
  ok('tools shortage slows raw output ~15%', after < before * 0.9, before.toFixed(1) + ' -> ' + after.toFixed(1));
  ok('activity says so', Object.values(G.buildingActivity(s, c)).some(a => a.reason === 'Tools shortage'));
  c.refineOff = {}; c.res.tools = 300; c.res.iron = 300; G.advance(s, 900, 60);
  ok('stocked again -> shortage clears', !c.short.tools, JSON.stringify(c.short));
}

// ---- weapons: soldiers wear their kit; a shortage blunts the attack ----
{
  const { s, c } = busy('hearth');
  const units = { pikeman: 10 };
  const e0 = G.armyEdge(s, 'p', c, units).mult;
  c.res.weapons = 0; c.refineOff = { armory: true };
  G.advance(s, 600, 60);
  ok('weapons run out -> short', c.short.weapons, JSON.stringify(c.short));
  const e1 = G.armyEdge(s, 'p', c, units);
  ok('weapons shortage lowers attack', e1.mult < e0 * 0.95 && e1.labels.some(l => /Blunted/.test(l.label)), e0.toFixed(2) + ' -> ' + e1.mult.toFixed(2));
}

// ---- stone: walls need upkeep; a shortage decays them slowly ----
{
  const { s, c } = busy('hearth');
  const d0 = G.cityDefense(s, c).mult, w0 = G.lvl(c, 'wall');
  c.res.stone = 0;
  const nost = (s2, o, cc, k) => (cc === c && k === 'stone') ? 0 : 1; G.modSources.push(nost);
  c.refineOff = {}; G.advance(s, 15 * 60, 60);
  ok('stone runs out -> short, defence penalty', c.short.stone && G.cityDefense(s, c).mult < d0, d0.toFixed(2) + ' -> ' + G.cityDefense(s, c).mult.toFixed(2));
  ok('walls do not fall at once', G.lvl(c, 'wall') >= w0 - 1, w0 + ' -> ' + G.lvl(c, 'wall'));
  G.advance(s, 60 * 60, 60);
  const w1 = G.lvl(c, 'wall');
  ok('walls decay slowly over an hour', w1 < w0 && w1 >= w0 - 3, w0 + ' -> ' + w1);
  G.modSources.splice(G.modSources.indexOf(nost), 1);
}

// ---- gold: soldiers are paid; an empty treasury makes them desert ----
{
  const { s, c } = busy('hearth');
  const taxOff = (s2, o, cc, k) => k === 'tax' ? 0 : 1; G.modSources.push(taxOff);
  s.empires.p.gold = 0; const n0 = G.unitsCount(c.units);
  G.advance(s, 20 * 60, 60);
  ok('unpaid wages: short gold, unhappy, deserters', c.short.gold && G.happiness(s, c).why.some(w => /Unpaid/.test(w.label)) && G.unitsCount(c.units) < n0, n0 + ' -> ' + G.unitsCount(c.units));
  G.modSources.splice(G.modSources.indexOf(taxOff), 1);
}

// ---- luxuries: worn by the people, cheer while stocked ----
{
  const s = fresh('veil'); const c = G.capital(s, 'p'); c.pop = 100; c.res.dreamsilk = 0;
  const h0 = G.happiness(s, c).value; c.res.dreamsilk = 20; const h1 = G.happiness(s, c).value;
  ok('dreamsilk lifts the Veilborn', h1 === h0 + G.SINK.luxuryHappy, h0 + ' -> ' + h1);
  G.advance(s, 300, 30); ok('dreamsilk is worn away', c.res.dreamsilk < 20, c.res.dreamsilk.toFixed(2));
}

// ---- pace: quick wears twice as fast as standard ----
{
  const a = fresh('hearth'), b = G.newGame({ name: 'T', race: 'hearth', rivals: 1, pace: 'quick' });
  const ca = G.capital(a, 'p'), cb = G.capital(b, 'p'); ca.pop = cb.pop = 100; a.time = b.time = 0; ca.terrain = cb.terrain = 'plains';
  const fa = G.econ(a, ca).use.timber, fb = G.econ(b, cb).use.timber;
  ok('wear scales with pace', Math.abs(fb / fa - G.pace(b).prod / G.pace(a).prod) < 0.01, fa.toFixed(2) + ' / ' + fb.toFixed(2));
}

// ---- building activity ----
{
  const { s, c } = busy('delver');
  c.res.ore = 0; G.modSources.push(noore = (s2, o, cc, k) => (cc === c && k === 'ore') ? 0 : 1);
  G.advance(s, 60, 10);
  const act = G.buildingActivity(s, c);
  ok('activity covers producers and workshops', ['farm', 'lumber', 'quarry', 'mine', 'smelter', 'smithy', 'armory', 'harbor', 'runeforge'].every(b => act[b] && ['working', 'slow', 'idle', 'blocked'].includes(act[b].state)), Object.keys(act).join(','));
  ok('smelter without ore is blocked', act.smelter.state === 'blocked' && /ore/i.test(act.smelter.reason), JSON.stringify(act.smelter));
  ok('farm working with a rate', act.farm.state === 'working' && act.farm.rate > 0, JSON.stringify(act.farm));
  c.res.grain = G.storageCap(s, c); G.advance(s, 10, 10);
  ok('full storage blocks the farm', G.buildingActivity(s, c).farm.state === 'blocked', JSON.stringify(G.buildingActivity(s, c).farm));
  c.refineOff.armory = true; G.advance(s, 10, 10);
  ok('paused workshop is idle', G.buildingActivity(s, c).armory.state === 'idle');
  c.pop = 0.5; ok('no workers: idle', G.buildingActivity(s, c, G.econ(s, c)).farm.state !== 'working');
  G.modSources.splice(G.modSources.indexOf(noore), 1);
}
var noore;

// ---- mana: a tower-less city with mages and a ward never runs short ----
{
  const s = fresh('hearth'); const c = G.capital(s, 'p'); delete c.buildings.magetower; c.res.mana = 0;
  c.units = { [DATA.races.hearth.mageUnit || 'militia']: 10 }; c.ward = s.time + 1800;
  G.advance(s, 180, 10);
  ok('no tower: mages and wards draw no upkeep', !c.short.mana && c.ward > s.time, JSON.stringify(c.short));
}

// ---- old saves load ----
{
  const s = fresh('grave'); const c = G.capital(s, 'p');
  delete c.short; delete c.wear;
  const json = G.serialize ? G.serialize(s) : JSON.stringify(s);
  const s2 = G.migrate(G.deserialize ? G.deserialize(json) : JSON.parse(json));
  const c2 = G.capital(s2, 'p');
  let err = null; try { G.advance(s2, 120, 10); G.econParts(s2, c2); G.buildingActivity(s2, c2); } catch (x) { err = x; }
  ok('a save without upkeep fields loads and runs', !err && c2.short && typeof c2.short === 'object', err ? err.message : '');
}

// ---- AIs stay solvent: all eight peoples as AI over the hours ----
{
  const t0 = Date.now();
  const stat = {};
  for (const [w, pr] of [[0, 'hearth'], [1, 'delver']]) {
    Math.random = mulberry(1000 + w * 7919);
    const s = G.newGame({ name: 'B', race: pr, rivals: 7, pace: 'standard', difficulty: 'normal' });
    const baseHost = G.hostility; G.hostility = (ss, a, t) => t === 'p' ? 0 : baseHost(ss, a, t);
    for (let m = 0; m < hours * 6; m++) {
      G.advance(s, 600, 60);
      for (const c of Object.values(s.cities)) {
        if (c.owner === 'p') continue;
        const r = s.empires[c.owner].race, st = stat[r] = stat[r] || { n: 0, starve: 0, neg: 0, short: 0, starveRun: {}, longest: 0 };
        st.n++;
        if (c.starving) { st.starve++; st.starveRun[c.id] = (st.starveRun[c.id] || 0) + 1; st.longest = Math.max(st.longest, st.starveRun[c.id]); } else st.starveRun[c.id] = 0;
        if (Object.keys(c.short || {}).length) st.short++;
        for (const g of DATA.goodOrder) if ((c.res[g] || 0) < -1e-6) st.neg++;
      }
      for (const e of Object.values(s.empires)) if (e.gold < -1e-6) (stat[e.race] = stat[e.race] || { n: 0, neg: 0 }).neg++;
    }
    G.hostility = baseHost;
  }
  for (const r of DATA.raceOrder) {
    const st = stat[r];
    if (!st) { ok(r + ' appears as AI', false); continue; }
    ok(r + ': AI solvent (no negative stocks, no city starving for 3 hours)', st.neg === 0 && st.longest < 18 && st.starve / st.n < 0.25,
      'starving ' + Math.round(st.starve / st.n * 100) + '% longest ' + st.longest * 10 + 'min, any shortage ' + Math.round(st.short / st.n * 100) + '%, neg ' + st.neg);
  }
  console.log('  solvency run ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
`);
