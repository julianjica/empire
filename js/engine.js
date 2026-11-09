// =====================================================================
//  Ember & Crown — game engine (pure state, no DOM)
//  All times are in game-seconds (state.time). Rates are per game-minute.
//  Feature modules (research, hero, diplomacy, events) plug in through
//  the hook arrays below.
// =====================================================================
'use strict';

const G = {};
G.SAVE_KEY = 'emberCrown_save_v2';
G.VERSION = 2;

// ---- extension points ----
G.modSources = [];      // fn(s, owner, city, key) -> multiplier
G.stepHooks = [];       // fn(s, dt)
G.slowHooks = [];       // fn(s, dtMin)  every ~10 game-seconds
G.battleHooks = [];     // fn(s, ctx)    after any battle
G.hostileHooks = [];    // fn(s, attackerOwner, defenderOwner, type)
G.aiHooks = [];         // fn(s, emp, dtMin)
G.moveHandlers = {};    // type -> fn(s, m)
G.newGameHooks = [];    // fn(s, opts)
G.aiBuildFilters = [];
G.econHooks = [];       // fn(s, city, raw, eff) -> add extra raw production per minute (e.g. mana)  // fn(s, city, type) -> false to keep the AI's generic build picker away from a building
G.hostility = (s, aiId, target) => 1;   // replaced by diplomacy

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round5 = v => Math.max(5, Math.round(v / 5) * 5);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
Object.assign(G, { rnd, rint, pick, dist, clamp });

G.newId = (s, prefix) => prefix + (s.nextId++);
G.lvl = (city, b) => (city && city.buildings[b]) || 0;
G.raceOf = (s, city) => DATA.races[s.empires[city.owner].race];
G.tileAt = (s, x, y) => (x < 0 || y < 0 || x >= s.map || y >= s.map) ? null : s.tiles[y * s.map + x];
G.tileIdx = (s, t) => t.y * s.map + t.x;
G.citiesOf = (s, owner) => Object.values(s.cities).filter(c => c.owner === owner);
G.pace = s => DATA.pace[s.settings.pace] || DATA.pace.standard;
G.grace = s => G.pace(s).grace;
G.capital = (s, owner) => G.citiesOf(s, owner).sort((a, b) => (a.founded || 0) - (b.founded || 0))[0];

G.log = (s, owner, text, kind = 'info') => {
  if (owner !== 'p') return;
  s.log.unshift({ t: s.time, text, kind });
  if (s.log.length > 100) s.log.length = 100;
};

// ---------------------------------------------------------------------
// Modifier aggregator. Every multiplier in the game goes through here.
// Keys: goods (production), refine, tax, popGrowth, housing, storage,
// buildTime, trainTime, researchTime, travel (speed), atk, def, wall,
// carry, vision, caravan, upkeep, market, protect
// ---------------------------------------------------------------------
const ADDITIVE_RACE = { market: 1, protect: 1 };
G.mod = (s, owner, city, key) => {
  const emp = s.empires[owner];
  const race = DATA.races[emp.race];
  let m = 1;
  if (race.mult[key]) m *= race.mult[key];
  if (race.bonus[key] !== undefined) m *= ADDITIVE_RACE[key] ? 1 + race.bonus[key] : race.bonus[key];
  const isGood = !!DATA.goods[key];
  if (isGood || key === 'refine' || key === 'tax') {
    m *= G.pace(s).prod;
    if (owner !== 'p') m *= s.settings.aiMult;
  }
  if (isGood && city) {
    const site = G.site(s, city);
    if (site[key] !== undefined) m *= site[key];
    let add = 0;
    for (const oi of city.oases || []) { const o = s.tiles[oi].oasis; if (o && o.bonus === key) add += o.mult; }
    m *= 1 + add;
  }
  if (city && (key === 'tax' || key === 'popGrowth')) m *= G.site(s, city).prosper;
  for (const src of G.modSources) m *= src(s, owner, city, key);
  return m;
};

// ---------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------
G.buildCost = (type, level) => {
  const b = DATA.buildings[type];
  const m = Math.pow(b.growth, level - 1);
  const c = {};
  for (const [g, v] of Object.entries(b.cost)) c[g] = round5(v * m);
  if (level >= 6) c.tools = Math.round(2 * Math.pow(level - 5, 1.35)) + (c.tools || 0);
  return c;
};

G.buildTime = (s, city, type, level) => {
  const b = DATA.buildings[type];
  const th = G.lvl(city, 'townhall');
  const t = b.time * Math.pow(1.38, level - 1) / (1 + 0.05 * Math.max(0, th - 1));
  return Math.max(2, Math.round(t * G.pace(s).time * G.mod(s, city.owner, city, 'buildTime')));
};

G.storageCap = (s, city) => Math.round(800 * Math.pow(1.32, G.lvl(city, 'warehouse')) * G.mod(s, city.owner, city, 'storage'));

G.popCap = (s, city) => {
  const L = G.lvl(city, 'houses');
  let cap = (10 + 15 * L * Math.pow(1.07, L)) * G.mod(s, city.owner, city, 'housing');
  cap *= 1 + 0.04 * G.lvl(city, 'heartgrove');
  return Math.round(cap + 3 * G.lvl(city, 'townhall'));
};

G.workersReq = city => {
  let w = 0;
  for (const [t, L] of Object.entries(city.buildings)) {
    const b = DATA.buildings[t];
    if (b && b.workers && !(city.refineOff && city.refineOff[t])) w += b.workers * L;
  }
  return w;
};

G.recipeOf = (s, city, type) => {
  const race = G.raceOf(s, city);
  return (race.recipes && race.recipes[type]) || DATA.buildings[type].recipe;
};

G.tier = city => {
  const th = G.lvl(city, 'townhall');
  let t = DATA.tiers[0];
  for (const tt of DATA.tiers) if (th >= tt.th) t = tt;
  return t;
};

const BASE_YIELD = { grain: 6, timber: 8, stone: 7, ore: 3 };
const REFINE_ORDER = ['smelter', 'smithy', 'armory', 'runeforge', 'bakery', 'heartgrove'];

// Full economic picture of a city (nominal rates per minute).
G.econ = (s, city, awayUnits) => {
  const emp = s.empires[city.owner];
  const cap = G.storageCap(s, city);
  const popCap = G.popCap(s, city);
  const workersReq = G.workersReq(city);
  const eff = workersReq > 0 ? Math.min(1, city.pop / workersReq) : 1;

  // every settlement's commons yield a little of each raw good, independent of buildings
  const raw = {};
  for (const [g, v] of Object.entries(BASE_YIELD)) raw[g] = v * G.mod(s, city.owner, city, g);
  for (const [t, L] of Object.entries(city.buildings)) {
    const b = DATA.buildings[t];
    if (!b || !b.prod || L <= 0) continue;
    for (const [g, base] of Object.entries(b.prod)) {
      raw[g] = (raw[g] || 0) + base * L * Math.pow(1.12, L - 1) * eff * G.mod(s, city.owner, city, g);
    }
  }

  for (const h of G.econHooks) h(s, city, raw, eff);
  const hb = G.lvl(city, 'harbor');
  if (hb) raw.grain = (raw.grain || 0) + 5 * hb * Math.pow(1.12, hb - 1) * Math.min(4, G.site(s, city).water || 0) / 2 * eff * G.mod(s, city.owner, city, 'grain');
  const refiners = [];
  const refMod = G.mod(s, city.owner, city, 'refine');
  for (const t of REFINE_ORDER) {
    const L = G.lvl(city, t);
    if (!L) continue;
    const b = DATA.buildings[t];
    if (b.race && b.race !== emp.race) continue;
    const rec = G.recipeOf(s, city, t);
    const off = city.refineOff && city.refineOff[t];
    const outRate = off ? 0 : rec.rate * L * Math.pow(1.1, L - 1) * eff * refMod;
    const inp = {}, out = {};
    for (const [g, v] of Object.entries(rec.in)) inp[g] = v * outRate;
    for (const [g, v] of Object.entries(rec.out)) out[g] = v * outRate;
    refiners.push({ type: t, in: inp, out, off });
  }

  let upkeep = 0;
  const countUp = units => { for (const [u, n] of Object.entries(units || {})) upkeep += (DATA.units[u].upkeep || 0) * n; };
  countUp(city.units);
  if (awayUnits && awayUnits[city.id]) countUp(awayUnits[city.id]);
  upkeep *= G.mod(s, city.owner, city, 'upkeep');

  const popFood = city.pop * 0.12;
  const idle = Math.max(0, city.pop - workersReq);
  const tax = ((city.pop * 0.15 + idle * 0.35) + 1) * G.mod(s, city.owner, city, 'tax');

  const net = {};
  for (const g of DATA.goodOrder) net[g] = raw[g] || 0;
  for (const r of refiners) {
    for (const [g, v] of Object.entries(r.in)) net[g] -= v;
    for (const [g, v] of Object.entries(r.out)) net[g] += v;
  }
  let grainFood = popFood;
  if (emp.race === 'hearth' && (city.res.bread || 0) > 1) { net.bread -= popFood / 3; grainFood = 0; }
  net.grain -= grainFood + upkeep;

  const protect = cap * (0.1 + (G.mod(s, city.owner, city, 'protect') - 1));
  // soldiers are enrolled citizens: they take housing (beyond barracks quarters) away from civilians
  const soldiers = G.soldiers(s, city, awayUnits);
  const quarters = G.quarters(city);
  const civCap = Math.max(5, popCap - Math.max(0, soldiers - quarters));
  return { cap, protect, popCap, civCap, soldiers, quarters, workersReq, eff, raw, refiners, popFood, upkeep, tax, net, idle };
};

// ---------------------------------------------------------------------
// Military helpers
// ---------------------------------------------------------------------
// unit stats for an owner: heroes are dynamic, and forge upgrades raise attack/defense per unit type
G.unitStats = (s, owner, u) => {
  if (u === 'hero' && G.heroStats && owner) return G.heroStats(s, owner);
  const d = DATA.units[u];
  const up = owner && s.empires[owner] && s.empires[owner].upgrades && s.empires[owner].upgrades[u];
  if (!up) return d;
  const a = 1 + 0.04 * (up.a || 0), df = 1 + 0.04 * (up.d || 0);
  return { ...d, atk: d.atk * a, defI: d.defI * df, defC: d.defC * df };
};
// battle mages lend their spells to the army they march with (or the garrison they stand in)
G.mageBoost = (s, owner, units) => {
  let n = 0;
  for (const [u, k] of Object.entries(units || {})) if (DATA.units[u] && DATA.units[u].mage) n += k * DATA.units[u].mage;
  return n ? 1 + Math.min(0.3, 0.006 * n) * (owner ? G.mod(s, owner, null, 'spellPower') : 1) : 1;
};
G.wallBreak = units => Object.entries(units || {}).reduce((a, [u, n]) => a + (DATA.units[u].wallBreak || 0) * n, 0);
G.wreckPower = units => Object.entries(units || {}).reduce((a, [u, n]) => a + (DATA.units[u].wreck || 0) * n, 0);
G.unitsCount = units => Object.values(units || {}).reduce((a, b) => a + b, 0);
G.addUnits = (into, from) => { for (const [u, n] of Object.entries(from || {})) if (n > 0) into[u] = (into[u] || 0) + n; return into; };
G.atkPower = (s, owner, units) => Object.entries(units).reduce((a, [u, n]) => a + G.unitStats(s, owner, u).atk * n, 0);
G.defPower = (s, owner, units) => Object.entries(units).reduce((a, [u, n]) => { const d = G.unitStats(s, owner, u); return a + (d.defI + d.defC) / 2 * n; }, 0);
G.slowest = (s, owner, units) => Math.min(...Object.entries(units).filter(([, n]) => n > 0).map(([u]) => G.unitStats(s, owner, u).spd));
// ---- paths: armies walk around water; ships sail on it --------------------
const PATHS = new WeakMap();
G.isWater = t => !!t && t.terrain === 'lake';
G.coastal = (s, x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && G.isWater(G.tileAt(s, x + dx, y + dy))) return true; return false; };
G.clearPaths = s => { PATHS.delete(s.tiles); COMPS.delete(s.tiles); };
// shortest path (8 directions). Land paths avoid water; sea paths stay on water except the two end tiles.
// returns { len, path:[[x,y],...] } or null
G.path = (s, from, to, naval) => {
  let cache = PATHS.get(s.tiles); if (!cache) { cache = new Map(); PATHS.set(s.tiles, cache); }
  const key = from.x + ',' + from.y + '>' + to.x + ',' + to.y + (naval === 'any' ? 'a' : naval ? 's' : 'l');
  if (cache.has(key)) return cache.get(key);
  const N = s.map, start = from.y * N + from.x, goal = to.y * N + to.x;
  const ok = i => { if (i === start || i === goal || naval === 'any') return true; return naval ? G.isWater(s.tiles[i]) : !G.isWater(s.tiles[i]); };
  const D = new Float64Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
  D[start] = 0;
  const open = [start];
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (D[open[k]] < D[open[bi]]) bi = k;
    const u = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (done[u]) continue; done[u] = 1;
    if (u === goal) break;
    const ux = u % N, uy = (u - ux) / N;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const vx = ux + dx, vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= N || vy >= N) continue;
      const v = vy * N + vx;
      if (done[v] || !ok(v)) continue;
      if (dx && dy && !naval && naval !== 'any' && (G.isWater(s.tiles[uy * N + vx]) && G.isWater(s.tiles[vy * N + ux]))) continue;  // no squeezing between two water tiles
      const nd = D[u] + (dx && dy ? 1.4142 : 1);
      if (nd < D[v]) { D[v] = nd; prev[v] = u; open.push(v); }
    }
  }
  let res = null;
  if (D[goal] < Infinity) {
    const pts = []; for (let i = goal; i !== -1; i = prev[i]) pts.push([i % N, Math.floor(i / N)]);
    res = { len: D[goal], path: pts.reverse() };
  }
  cache.set(key, res);
  return res;
};
// connected land regions (flood fill, 8 directions, no squeezing between two water tiles), cached with the paths
const COMPS = new WeakMap();
G.landRegions = s => {
  let comp = COMPS.get(s.tiles); if (comp) return comp;
  const N = s.map; comp = new Int32Array(N * N).fill(-1);
  let id = 0;
  for (let i = 0; i < N * N; i++) {
    if (comp[i] !== -1 || G.isWater(s.tiles[i])) continue;
    const stack = [i]; comp[i] = id;
    while (stack.length) {
      const u = stack.pop(), ux = u % N, uy = (u - ux) / N;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const vx = ux + dx, vy = uy + dy;
        if ((!dx && !dy) || vx < 0 || vy < 0 || vx >= N || vy >= N) continue;
        const v = vy * N + vx;
        if (comp[v] !== -1 || G.isWater(s.tiles[v])) continue;
        if (dx && dy && G.isWater(s.tiles[uy * N + vx]) && G.isWater(s.tiles[vy * N + ux])) continue;
        comp[v] = id; stack.push(v);
      }
    }
    id++;
  }
  COMPS.set(s.tiles, comp);
  return comp;
};
G.landReachable = (s, from, to) => { const c = G.landRegions(s); return c[from.y * s.map + from.x] === c[to.y * s.map + to.x]; };
G.isIsland = (s, t) => { const c = G.landRegions(s); const cap = G.capital(s, 'p'); return !!cap && c[t.y * s.map + t.x] !== c[cap.y * s.map + cap.x]; };
const marchTime = (s, owner, len, spd) => Math.max(15, Math.round(len / (spd * G.mod(s, owner, null, 'travel')) * 120 * G.pace(s).travel));
// plan a march: land route for armies and caravans, sea route when ships carry the army
G.planMarch = (s, owner, from, to, units) => {
  units = units || {};
  const ships = Object.entries(units).filter(([u, n]) => n > 0 && DATA.units[u] && DATA.units[u].type === 'ship');
  const present = Object.entries(units).filter(([u, n]) => n > 0).map(([u]) => DATA.units[u]);
  // armies made only of fliers go straight over water; armies made only of swimmers may cross water too
  if (present.length && present.every(d => d.flying)) {
    const len = dist(from, to);
    return { ok: true, dur: marchTime(s, owner, len, G.slowest(s, owner, units)), path: [[from.x, from.y], [to.x, to.y]], naval: false, flying: true };
  }
  if (present.length && !ships.length && present.every(d => d.flying || d.amphibious)) {
    const land = G.path(s, from, to, false), any = G.path(s, from, to, 'any');
    const p = land && (!any || land.len <= any.len * 1.15) ? land : any;
    if (p) return { ok: true, dur: marchTime(s, owner, p.len, G.slowest(s, owner, units)), path: p.path, naval: false };
  }
  if (!ships.length) {
    const p = G.path(s, from, to, false);
    if (!p) return { ok: false, reason: 'No land route — only ships can reach this place (build a Harbor and transports).' };
    const spd = G.unitsCount(units) ? G.slowest(s, owner, units) : 8;
    return { ok: true, dur: marchTime(s, owner, p.len, spd), path: p.path, naval: false };
  }
  if (!G.coastal(s, from.x, from.y)) return { ok: false, reason: 'Ships can only sail from a coastal city' };
  if (!G.coastal(s, to.x, to.y)) return { ok: false, reason: 'Ships can only reach places on the shore' };
  const p = G.path(s, from, to, true);
  if (!p) return { ok: false, reason: 'No sea route between these shores' };
  const cap = ships.reduce((a, [u, n]) => a + (DATA.units[u].capacity || 0) * n, 0);
  const passengers = Object.entries(units).filter(([u]) => DATA.units[u].type !== 'ship').reduce((a, [u, n]) => a + Math.max(1, G.unitPop(u)) * n, 0);
  if (passengers > cap) return { ok: false, reason: `Not enough transport space: ${passengers} aboard, room for ${cap} (each Transport Cog carries 30)` };
  const spd = Math.min(...ships.map(([u]) => G.unitStats(s, owner, u).spd));
  return { ok: true, dur: marchTime(s, owner, p.len, spd), path: p.path, naval: true };
};
// travel time over land (falls back to a long straight-line estimate when water cuts the way, e.g. for abstract caravans)
G.travelTime = (s, owner, from, to, spd) => {
  const p = G.path(s, from, to, false);
  return marchTime(s, owner, p ? p.len : dist(from, to) * 1.6, spd);
};

G.trainTime = (s, city, unit) => {
  const u = DATA.units[unit];
  const L = Math.max(1, G.lvl(city, u.at));
  let t = u.time * Math.max(0.4, 1 - 0.03 * (L - 1)) * G.mod(s, city.owner, city, 'trainTime');
  t *= Math.max(0.4, 1 - 0.03 * G.lvl(city, 'warpit'));
  return Math.max(2, Math.round(t * G.pace(s).time));
};

// people each unit takes from the population (heroes and wild creatures take none)
G.unitPop = u => { const d = DATA.units[u]; if (!d || !d.at) return 0; if (d.pop !== undefined) return d.pop; return u === 'settlers' ? 5 : u === 'herald' ? 2 : d.type === 'siege' ? 3 : d.type === 'cav' ? 2 : d.req >= 10 ? 2 : 1; };
G.popOf = units => Object.entries(units || {}).reduce((a, [u, n]) => a + G.unitPop(u) * n, 0);
G.soldiers = (s, city, away) => {
  let n = G.popOf(city.units);
  if (away && away[city.id]) n += G.popOf(away[city.id]);
  else if (!away) for (const m of s.moves) if (m.from === city.id && m.owner === city.owner) n += G.popOf(m.units);
  for (const q of Object.values(city.train || {})) for (const it of q) n += G.unitPop(it.unit) * it.left;
  return n;
};
G.quarters = city => 10 * G.lvl(city, 'barracks') + 6 * G.lvl(city, 'stable') + 4 * G.lvl(city, 'warpit');
// how far a city's influence reaches: grows with its population
G.cityReach = (s, city) => 2 + Math.min(2.5, Math.sqrt(Math.max(0, city.pop)) / 10);
G.dismiss = (s, cityId, unit, n) => {
  const city = s.cities[cityId];
  n = Math.min(Math.floor(n), city.units[unit] || 0);
  if (!(n > 0) || !G.unitPop(unit)) return 'Nothing to dismiss';
  city.units[unit] -= n;
  city.pop += n * G.unitPop(unit);
  return null;
};

G.unitsFor = (s, city) => [...DATA.races[s.empires[city.owner].race].units, ...DATA.commonUnits];

// ---------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------
G.have = (s, city, g) => g === 'gold' ? s.empires[city.owner].gold : (city.res[g] || 0);
G.canAfford = (s, city, cost, mult = 1) => Object.entries(cost).every(([g, v]) => G.have(s, city, g) >= v * mult);
G.pay = (s, city, cost, mult = 1) => {
  for (const [g, v] of Object.entries(cost)) {
    if (g === 'gold') s.empires[city.owner].gold -= v * mult; else city.res[g] -= v * mult;
  }
};
G.gain = (s, city, goods, frac = 1) => {
  const cap = G.storageCap(s, city);
  for (const [g, v] of Object.entries(goods || {})) {
    if (g === 'gold') s.empires[city.owner].gold += v * frac;
    else city.res[g] = Math.min(Math.max(cap, city.res[g] || 0), (city.res[g] || 0) + v * frac);
  }
};
G.maxAffordable = (s, city, cost) => {
  let m = Infinity;
  for (const [g, v] of Object.entries(cost)) if (v > 0) m = Math.min(m, Math.floor(G.have(s, city, g) / v));
  return m === Infinity ? 0 : m;
};

// ---------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------
G.buildSlots = city => G.lvl(city, 'townhall') >= 10 ? 3 : 2;
G.nextLevel = (city, type) => G.lvl(city, type) + 1 + city.buildQueue.filter(q => q.type === type).length;

G.buildStatus = (s, city, type) => {
  const b = DATA.buildings[type];
  const emp = s.empires[city.owner];
  if (b.race && b.race !== emp.race) return { hidden: true };
  const level = G.nextLevel(city, type);
  const cost = G.buildCost(type, level);
  const res = { level, cost, time: G.buildTime(s, city, type, level), ok: true, reason: '' };
  if (level > b.max) return { ...res, ok: false, reason: 'Max level', maxed: true };
  for (const [rb, rl] of Object.entries(b.req || {})) {
    if (G.lvl(city, rb) < rl) return { ...res, ok: false, locked: true, reason: `Needs ${DATA.buildings[rb].name} ${rl}` };
  }
  if (type !== 'townhall' && level > G.lvl(city, 'townhall') * 2 + 2) return { ...res, ok: false, reason: `Needs Town Hall ${Math.ceil((level - 2) / 2)}` };
  if (b.coastal && !G.coastal(s, city.x, city.y)) return { ...res, ok: false, locked: true, reason: 'Needs a coastal city' };
  if (b.minCities && G.citiesOf(s, city.owner).length < b.minCities) return { ...res, ok: false, locked: true, reason: `Needs a realm of ${b.minCities} cities` };
  if (b.realmUnique && Object.values(s.cities).some(c => c.owner === city.owner && c !== city && (G.lvl(c, type) || c.buildQueue.some(q => q.type === type)))) return { ...res, ok: false, locked: true, reason: 'Already raised in another of your cities' };
  if (city.buildQueue.length >= G.buildSlots(city)) return { ...res, ok: false, reason: 'Queue full' };
  if (!G.canAfford(s, city, cost)) return { ...res, ok: false, reason: 'Not enough goods', poor: true };
  return res;
};

G.queueBuild = (s, cityId, type) => {
  const city = s.cities[cityId];
  const st = G.buildStatus(s, city, type);
  if (!st.ok) return st.reason;
  G.pay(s, city, st.cost);
  const last = city.buildQueue[city.buildQueue.length - 1];
  const start = last ? last.end : s.time;
  city.buildQueue.push({ type, level: st.level, cost: st.cost, dur: st.time, start, end: start + st.time });
  return null;
};

G.cancelBuild = (s, cityId, index) => {
  const city = s.cities[cityId];
  const item = city.buildQueue[index];
  if (!item) return;
  const started = item.start <= s.time;
  G.gain(s, city, item.cost, started ? 0.5 : 1);
  city.buildQueue.splice(index, 1);
  let t = s.time;
  city.buildQueue.forEach((q, i) => {
    if (i === 0 && q.start <= s.time && index !== 0) { t = q.end; return; }
    q.start = t; q.end = t + q.dur; t = q.end;
  });
  const base = {};
  for (const q of city.buildQueue) { base[q.type] = (base[q.type] || G.lvl(city, q.type)) + 1; q.level = base[q.type]; }
};

// ---------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------
G.trainStatus = (s, city, unit) => {
  const u = DATA.units[unit];
  if (!u.at) return { ok: false, locked: true, reason: 'Cannot be trained' };
  if (G.lvl(city, u.at) < u.req) return { ok: false, locked: true, reason: `Needs ${DATA.buildings[u.at].name} ${u.req}` };
  const pp = G.unitPop(unit);
  const byPop = pp ? Math.max(0, Math.floor((city.pop - 5) / pp)) : Infinity;
  return { ok: true, max: Math.min(G.maxAffordable(s, city, u.cost), byPop), byPop, pop: pp, time: G.trainTime(s, city, unit) };
};

G.queueTrain = (s, cityId, unit, count) => {
  const city = s.cities[cityId];
  const u = DATA.units[unit];
  count = Math.floor(count);
  if (!(count > 0)) return 'Nothing to train';
  const st = G.trainStatus(s, city, unit);
  if (!st.ok) return st.reason;
  if (!G.canAfford(s, city, u.cost, count)) return 'Not enough goods';
  if (st.pop && city.pop - st.pop * count < 5) return `Not enough people to enrol (${Math.floor(city.pop)} citizens; each ${u.name} takes ${st.pop})`;
  G.pay(s, city, u.cost, count);
  city.pop -= st.pop * count;
  city.train[u.at] = city.train[u.at] || [];
  const q = city.train[u.at];
  q.push({ unit, left: count, each: st.time, next: q.length ? null : s.time + st.time });
  return null;
};

// ---------------------------------------------------------------------
// Market & caravans
// ---------------------------------------------------------------------
G.marketRates = (s, city, good) => {
  const L = G.lvl(city, 'market');
  const mb = G.mod(s, city.owner, city, 'market') - 1;
  const v = DATA.goods[good].value;
  return { sell: v * Math.min(0.95, 0.55 + 0.02 * L + mb), buy: v * Math.max(1.05, 1.9 - 0.035 * L - mb) };
};
G.trade = (s, cityId, good, amount, dir) => {
  const city = s.cities[cityId];
  if (G.lvl(city, 'market') < 1) return 'Build a Market first';
  amount = Math.floor(amount);
  if (!(amount > 0)) return 'Enter an amount';
  const r = G.marketRates(s, city, good);
  const emp = s.empires[city.owner];
  if (dir === 'sell') {
    if ((city.res[good] || 0) < amount) return 'Not enough ' + DATA.goods[good].name;
    city.res[good] -= amount; emp.gold += amount * r.sell;
  } else {
    const price = amount * r.buy;
    if (emp.gold < price) return 'Not enough gold';
    if ((city.res[good] || 0) + amount > G.storageCap(s, city)) return 'Not enough storage';
    emp.gold -= price; city.res[good] = (city.res[good] || 0) + amount;
  }
  if (city.owner === 'p') s.stats.traded = (s.stats.traded || 0) + amount;
  return null;
};
G.caravanCap = (s, city) => Math.round(G.lvl(city, 'market') * 500 * G.mod(s, city.owner, city, 'caravan'));

// ---------------------------------------------------------------------
// Renown, power & expansion
// ---------------------------------------------------------------------
G.renown = (s, owner) => {
  let r = 0;
  for (const c of G.citiesOf(s, owner)) for (const L of Object.values(c.buildings)) r += L;
  const e = s.empires[owner];
  return r + (e.wins || 0) * 3 + (e.conquests || 0) * 25 + (e.renownBonus || 0);
};
G.power = (s, owner) => {
  let p = 0;
  for (const c of G.citiesOf(s, owner)) {
    for (const L of Object.values(c.buildings)) p += L * 8;
    p += G.defPower(s, owner, c.units) * 0.5 + G.atkPower(s, owner, c.units) * 0.5;
  }
  for (const m of s.moves) if (m.owner === owner) p += G.atkPower(s, owner, m.units) * 0.5;
  return Math.round(p);
};
G.citySlotsUsed = (s, owner) => G.citiesOf(s, owner).length + s.moves.filter(m => m.owner === owner && m.type === 'settle').length;
G.nextCityRenown = (s, owner) => DATA.citySlots[G.citySlotsUsed(s, owner)] ?? Infinity;
G.canFoundCity = (s, owner) => G.renown(s, owner) >= G.nextCityRenown(s, owner);
G.oasisSlots = city => Math.min(4, 1 + Math.floor(G.lvl(city, 'townhall') / 5));

// ---------------------------------------------------------------------
// Location: yields of a site from the terrain around it (radius 2)
// ---------------------------------------------------------------------
const RIVER_SETS = new WeakMap();
const SITE_BASE = { grain: 0.45, timber: 0.62, stone: 0.52, ore: 0.65 };   // centres a typical site near 1×
G.siteYield = (s, x, y) => {
  const acc = { grain: 0, timber: 0, stone: 0, ore: 0 };
  let W = 0, river = false, lake = false, water = 0;
  const rv = s.rivers || [];
  let riverSet = RIVER_SETS.get(rv);
  if (!riverSet) { riverSet = new Set(rv.flat()); RIVER_SETS.set(rv, riverSet); }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const t = G.tileAt(s, x + dx, y + dy);
    const d = Math.hypot(dx, dy);
    if (!t || d > 2.3) continue;
    const w = d === 0 ? 1.5 : d <= 1.5 ? 1 : 0.6;
    const ty = DATA.terrainYield[t.terrain];
    for (const g in acc) acc[g] += ty[g] * w;
    W += w;
    if (d <= 1.5 && riverSet.has(t.y * s.map + t.x)) river = true;
    if (d <= 1.5 && t.terrain === 'lake') { lake = true; water++; }
  }
  const out = {};
  for (const g in acc) out[g] = clamp(SITE_BASE[g] + 1.4 * acc[g] / W, 0.4, 1.75);
  if (river) out.grain *= 1.15;
  if (lake) out.grain *= 1.1;
  out.river = river; out.lake = lake; out.water = water;
  out.prosper = 1 + (river ? 0.1 : 0) + (lake ? 0.05 : 0);
  return out;
};
G.site = (s, city) => {
  if (!city.site || city.site.x !== city.x || city.site.y !== city.y || city.site.water === undefined) city.site = { ...G.siteYield(s, city.x, city.y), x: city.x, y: city.y };
  return city.site;
};
G.stars = m => m < 0.6 ? 1 : m < 0.85 ? 2 : m < 1.1 ? 3 : m < 1.35 ? 4 : 5;
// how well a site suits a race (higher is better), used by AI settlers and the site survey
G.siteFit = (site, race) => Object.entries(DATA.homeland[race].seeks).reduce((a, [g, w]) => a + (site[g] - 1) * w, 0) + (site.prosper - 1) * 2;

// inland seas with a few islands; capitals stay connected by land (bridges are carved if needed)
const makeSeas = (s, capitals) => {
  const n = s.map >= 25 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const c = G.freeTile(s, t => capitals.every(cp => dist(cp, t) >= 7));
    if (!c) continue;
    const r = rnd(2.8, 4.2);
    for (const t of s.tiles) if (Math.hypot(t.x - c.x, t.y - c.y) + rnd(0, 1.1) < r && capitals.every(cp => dist(cp, t) >= 3)) t.terrain = 'lake';
    // an island or two
    for (let i = 0; i < rint(1, 2); i++) {
      const a = rnd(0, Math.PI * 2), d = rnd(0, Math.max(0, r - 2.2));
      const ix = Math.round(c.x + Math.cos(a) * d), iy = Math.round(c.y + Math.sin(a) * d);
      const ir = rnd(0.8, 1.5), kind = pick(['fertile', 'forest', 'hills', 'plains']);
      for (const t of s.tiles) if (Math.hypot(t.x - ix, t.y - iy) <= ir) t.terrain = kind;
    }
  }
  G.clearPaths(s);
  // land bridges so every capital can reach the player by land
  for (const cp of capitals.slice(1)) {
    if (G.path(s, capitals[0], cp, false)) continue;
    const steps = Math.ceil(dist(capitals[0], cp));
    for (let i = 0; i <= steps; i++) {
      const t = G.tileAt(s, Math.round(capitals[0].x + (cp.x - capitals[0].x) * i / steps), Math.round(capitals[0].y + (cp.y - capitals[0].y) * i / steps));
      if (G.isWater(t)) t.terrain = 'plains';
    }
    G.clearPaths(s);
  }
};

// paint a race's homeland terrain around (cx, cy)
const paintHomeland = (s, cx, cy, race) => {
  const pref = Object.entries(DATA.homeland[race].terrain);
  const roll = () => { let r = Math.random(); for (const [t, w] of pref) { r -= w; if (r <= 0) return t; } return pref[0][0]; };
  for (const t of s.tiles) {
    const d = Math.hypot(t.x - cx, t.y - cy);
    const p = d <= 1.5 ? 0.9 : d <= 2.5 ? 0.65 : d <= 3.6 ? 0.35 : 0;
    if (p && Math.random() < p && !(t.terrain === 'lake' && d > 1.5)) t.terrain = roll();
  }
  G.tileAt(s, cx, cy).terrain = pref[0][0] === 'mountain' ? 'hills' : pref[0][0];
};

// ---------------------------------------------------------------------
// Calendar (pure functions of time; visual only)
//   a visual day lasts 40 game-minutes; each season lasts 2 game-hours × pace
// ---------------------------------------------------------------------
G.DAY = 2400;
G.SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
G.dayPhase = s => (s.time % G.DAY) / G.DAY;                    // 0 = midnight, 0.5 = noon
G.daylight = s => { const p = G.dayPhase(s); return clamp(0.5 - 0.5 * Math.cos(p * Math.PI * 2), 0, 1); }; // 0 night .. 1 noon
G.season = s => {
  const len = 7200 * G.pace(s).time;
  const n = s.time / len;
  return { index: Math.floor(n) % 4, name: G.SEASONS[Math.floor(n) % 4], progress: n % 1, year: Math.floor(n / 4) + 1 };
};

// Rivers: lists of tile indices, flowing from high ground to a lake or the map edge
G.genRivers = s => {
  const rivers = [];
  const starts = s.tiles.filter(t => t.terrain === 'mountain' || t.terrain === 'hills');
  const want = Math.round(s.map / 6);
  const used = new Set();
  for (let tries = 0; rivers.length < want && tries < 60; tries++) {
    let t = starts[rint(0, starts.length - 1)];
    if (!t) break;
    // head toward the nearest lake or edge
    const lakes = s.tiles.filter(x => x.terrain === 'lake');
    const goal = lakes.length && Math.random() < 0.6 ? lakes.sort((a, b) => dist(a, t) - dist(b, t))[0]
      : pick([{ x: t.x, y: -1 }, { x: t.x, y: s.map }, { x: -1, y: t.y }, { x: s.map, y: t.y }]);
    const path = [];
    for (let i = 0; i < s.map * 2; i++) {
      const idx = t.y * s.map + t.x;
      if (used.has(idx) && path.length) break;
      path.push(idx);
      if (t.terrain === 'lake') break;
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => G.tileAt(s, t.x + dx, t.y + dy)).filter(Boolean)
        .filter(n => !path.includes(n.y * s.map + n.x));
      if (!opts.length) break;
      opts.sort((a, b) => (dist(a, goal) + rnd(0, 1.6)) - (dist(b, goal) + rnd(0, 1.6)));
      t = opts[0];
      if (t.x === 0 || t.y === 0 || t.x === s.map - 1 || t.y === s.map - 1) { path.push(t.y * s.map + t.x); break; }
    }
    if (path.length >= 5) { rivers.push(path); path.forEach(i => used.add(i)); }
  }
  return rivers;
};

// ---------------------------------------------------------------------
// Fog of war (player only)
// ---------------------------------------------------------------------
G.visionRadius = (s, city) => (1.9 + G.cityReach(s, city) * 0.6 + G.lvl(city, 'townhall') * 0.08) * G.mod(s, city.owner, city, 'vision');
G.movePos = (s, m) => {
  const f = clamp((s.time - m.depart) / Math.max(1, m.arrive - m.depart), 0, 1);
  if (!m.path || m.path.length < 2) return { x: m.fx + (m.x - m.fx) * f, y: m.fy + (m.y - m.fy) * f };
  const seg = []; let total = 0;
  for (let i = 1; i < m.path.length; i++) { const l = Math.hypot(m.path[i][0] - m.path[i - 1][0], m.path[i][1] - m.path[i - 1][1]); seg.push(l); total += l; }
  let d = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const t = seg[i] ? Math.min(1, d / seg[i]) : 1, a = m.path[i], b = m.path[i + 1]; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }; }
    d -= seg[i];
  }
  return { x: m.x, y: m.y };
};
G.visibleSet = s => {
  const vis = new Uint8Array(s.map * s.map);
  const mark = (cx, cy, r) => {
    const r2 = r * r;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(s.map - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(s.map - 1, Math.ceil(cx + r)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) vis[y * s.map + x] = 1;
  };
  for (const c of G.citiesOf(s, 'p')) {
    mark(c.x, c.y, G.visionRadius(s, c));
    for (const oi of c.oases || []) mark(s.tiles[oi].x, s.tiles[oi].y, 1.5);
  }
  for (const m of s.moves) if (m.owner === 'p') { const p = G.movePos(s, m); mark(p.x, p.y, 1.6); }
  return vis;
};
G.updateExplored = s => {
  const vis = G.visibleSet(s);
  for (let i = 0; i < vis.length; i++) if (vis[i]) s.explored[i] = 1;
  return vis;
};
G.reveal = (s, x, y, r) => {
  for (let yy = Math.max(0, y - r); yy <= Math.min(s.map - 1, y + r); yy++)
    for (let xx = Math.max(0, x - r); xx <= Math.min(s.map - 1, x + r); xx++)
      if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r + 0.5) s.explored[yy * s.map + xx] = 1;
};

// ---------------------------------------------------------------------
// Armies
// ---------------------------------------------------------------------
G.sendArmy = (s, fromId, x, y, type, units, cargo) => {
  const city = s.cities[fromId];
  const tile = G.tileAt(s, x, y);
  if (!tile || DATA.terrain[tile.terrain].impassable) return 'Cannot go there';
  if (tile.x === city.x && tile.y === city.y) return 'That is this city';
  const sent = {};
  for (const [u, n] of Object.entries(units || {})) {
    const k = Math.floor(n);
    if (k > 0) {
      if ((city.units[u] || 0) < k) return 'Not enough ' + DATA.units[u].name;
      sent[u] = k;
    }
  }
  if (sent.hero && G.heroCanMarch) { const e = G.heroCanMarch(s, city.owner); if (e) return e; }
  const plan = G.planMarch(s, city.owner, city, tile, type === 'trade' ? {} : sent);
  if (!plan.ok) return plan.reason;
  let spd;
  if (type === 'trade') {
    const total = Object.values(cargo || {}).reduce((a, b) => a + Math.floor(b), 0);
    if (total <= 0) return 'Nothing to send';
    if (total > G.caravanCap(s, city)) return 'Caravan can carry at most ' + G.caravanCap(s, city);
    for (const [g, v] of Object.entries(cargo)) if ((city.res[g] || 0) < Math.floor(v)) return 'Not enough ' + DATA.goods[g].name;
    for (const [g, v] of Object.entries(cargo)) city.res[g] -= Math.floor(v);
    spd = 8;
  } else {
    if (!G.unitsCount(sent)) return 'Select some troops';
    if (type === 'settle') {
      if (!sent.settlers) return 'Send settlers to found a city';
      if (tile.city || tile.camp || tile.oasis || tile.ruin) return 'The tile is occupied';
      if (!G.canFoundCity(s, city.owner)) return `Need ${G.nextCityRenown(s, city.owner)} renown for another city`;
    }
    if (type === 'scout' && (!sent.scout || Object.keys(sent).some(u => u !== 'scout'))) return 'Send only scouts on a scouting mission';
    if (type === 'conquer' && !sent.herald) return 'A conquest needs a Herald';
    if (type === 'adventure') {
      if (!sent.hero) return 'Only a hero can lead an adventure';
      if (!tile.ruin) return 'Adventures lead to ruins';
      if (tile.ruin.readyAt > s.time) return 'These ruins were recently plundered';
    }
    if (type === 'reinforce') {
      const tc = tile.city && s.cities[tile.city];
      if (!tc || tc.owner !== city.owner) return 'You can only reinforce your own cities';
    }
    if (G.canAttack && ['raid', 'attack', 'conquer'].includes(type)) { const e = G.canAttack(s, city.owner, tile); if (e) return e; }
    for (const [u, k] of Object.entries(sent)) city.units[u] -= k;
    spd = G.slowest(s, city.owner, sent);
  }
  const dur = plan.dur;
  s.moves.push({
    id: G.newId(s, 'm'), owner: city.owner, type, from: fromId, fx: city.x, fy: city.y, x, y, path: plan.path, naval: plan.naval,
    units: sent, cargo: type === 'trade' ? Object.fromEntries(Object.entries(cargo).map(([g, v]) => [g, Math.floor(v)]).filter(([, v]) => v > 0)) : {},
    depart: s.time, arrive: s.time + dur,
  });
  return null;
};

const casualties = (units, frac) => {
  const lost = {}, left = {};
  for (const [u, n] of Object.entries(units)) {
    // the hero is never rolled as a casualty unless the whole army falls; hero.js applies wounds instead
    const l = frac >= 1 ? n : u === 'hero' ? 0 : Math.min(n, Math.round(n * frac));
    lost[u] = l; left[u] = n - l;
  }
  return { lost, left };
};

// battle(s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode)
G.battle = (s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode) => {
  let inf = 0, cav = 0;
  for (const [u, n] of Object.entries(att)) {
    const d = G.unitStats(s, attOwner, u);
    if (d.type === 'cav') cav += d.atk * n; else inf += d.atk * n;
  }
  const A = Math.max(1, (inf + cav) * attMult * (attOwner ? G.mod(s, attOwner, null, 'atk') : 1));
  const share = inf + cav > 0 ? inf / (inf + cav) : 1;
  let Du = 0;
  for (const [u, n] of Object.entries(def)) {
    const d = G.unitStats(s, defOwner, u);
    Du += n * (d.defI * share + d.defC * (1 - share));
  }
  const D = Math.max(1, Du * defMult * (defOwner ? G.mod(s, defOwner, null, 'def') : 1) + flatDef);
  let attLoss, defLoss;
  const win = A > D;
  if (mode === 'raid') {
    const x = Math.pow(win ? D / A : A / D, 1.5);
    if (win) { attLoss = x / (1 + x); defLoss = 1 / (1 + x); }
    else { attLoss = 1 / (1 + x); defLoss = x / (1 + x); }
  } else {
    if (win) { attLoss = Math.pow(D / A, 1.5); defLoss = 1; }
    else { attLoss = 1; defLoss = Math.pow(A / D, 1.5); }
  }
  const a = casualties(att, attLoss), d = casualties(def, defLoss);
  return { A: Math.round(A), D: Math.round(D), win, attLoss, defLoss, attLost: a.lost, attLeft: a.left, defLost: d.lost, defLeft: d.left };
};

// Expected outcome of sending `units` from `city` to `tile`, using only what the
// player knows (scouting intel, or the camp/ruin tier). Returns { known:false } if unscouted.
G.previewBattle = (s, city, tile, units, mode) => {
  if (!G.unitsCount(units)) return null;
  const owner = city.owner;
  const intel = s.intel[G.tileIdx(s, tile)];
  let def, defOwner = null, defMult = 1, flat = 0;
  if (tile.city) {
    const c = s.cities[tile.city];
    if (!intel) return { known: false };
    def = intel.units; defOwner = c.owner;
    defMult = (1 + 0.05 * (intel.wall || 0) * G.mod(s, c.owner, c, 'wall'));
    flat = 10 + 5 * (intel.th || 1);
  } else if (tile.camp) {
    const camp = s.camps[tile.camp];
    def = intel ? intel.units : { brigand: camp.tier * camp.tier * 6 + 4 };
    flat = 5 * camp.tier;
  } else if (tile.oasis && !tile.oasis.owner) {
    def = intel ? intel.units : { beast: tile.oasis.tier * tile.oasis.tier * 5 + 3 };
    flat = 5 * tile.oasis.tier;
  } else if (tile.ruin) {
    def = intel ? intel.units : { beast: tile.ruin.tier * tile.ruin.tier * 4 + 3 };
    flat = 5 * tile.ruin.tier;
  } else return null;
  let attMult = 1 + 0.01 * G.lvl(city, 'warpit');
  if (units.hero && G.heroLeadership) attMult *= G.heroLeadership(s, owner);
  const r = G.battle(s, owner, units, attMult, defOwner, { ...def }, defMult, flat, mode === 'raid' ? 'raid' : 'attack');
  return { known: true, estimated: !intel, age: intel ? s.time - intel.t : null, ...r };
};

G.cityDefense = (s, city, wallBreak = 0) => {
  const wall = Math.max(0, G.lvl(city, 'wall') - wallBreak);
  const mult = (1 + 0.05 * wall * G.mod(s, city.owner, city, 'wall')) * (1 + 0.02 * G.lvl(city, 'runeforge'));
  return { mult, flat: 10 + 5 * G.lvl(city, 'townhall') };
};

G.report = (s, owners, title, kind, body) => {
  if (!owners.includes('p')) return;
  s.reports.unshift({ id: G.newId(s, 'r'), t: s.time, owners, title, kind, body, read: false });
  if (s.reports.length > 100) s.reports.length = 100;
};

const takeLoot = (store, protect, capacity) => {
  const avail = {};
  let total = 0;
  for (const g of DATA.goodOrder) {
    const a = Math.max(0, (store[g] || 0) - protect);
    if (a > 0) { avail[g] = a; total += a; }
  }
  const take = Math.min(total, capacity);
  const loot = {};
  if (take <= 0) return loot;
  for (const [g, a] of Object.entries(avail)) {
    const v = Math.floor(a / total * take);
    if (v > 0) { loot[g] = v; store[g] -= v; }
  }
  return loot;
};
G.carryOf = (s, owner, units) => Object.entries(units).reduce((a, [u, n]) => a + G.unitStats(s, owner, u).carry * n, 0) * G.mod(s, owner, null, 'carry');

G.sendHome = (s, m, units, loot) => {
  if (!G.unitsCount(units)) return;
  const dur = m.arrive - m.depart;
  s.moves.push({ id: G.newId(s, 'm'), owner: m.owner, type: 'return', from: m.from, fx: m.x, fy: m.y, x: m.fx, y: m.fy,
    path: m.path ? [...m.path].reverse() : undefined, naval: m.naval, units, cargo: loot || {}, depart: s.time, arrive: s.time + dur });
};

G.foundCity = (s, owner, x, y, name, initial) => {
  const tile = G.tileAt(s, x, y);
  const id = G.newId(s, 'c');
  const race = s.empires[owner].race;
  const res = {};
  for (const g of DATA.goodOrder) res[g] = 0;
  Object.assign(res, initial || { grain: 400, timber: 400, stone: 400, ore: 150 });
  s.cities[id] = {
    id, owner, name: name || pick(DATA.aiNames[race]) + ' ' + rint(2, 9), x, y, terrain: tile.terrain,
    res, pop: 8, buildings: { townhall: 1, houses: 1, warehouse: 1, farm: 1, lumber: 1, quarry: 1 },
    buildQueue: [], train: {}, units: {}, refineOff: {}, loyalty: 100, founded: s.time, desert: 0, oases: [], mods: [],
  };
  tile.city = id;
  if (owner === 'p') G.reveal(s, x, y, 5);
  return s.cities[id];
};

const transferCity = (s, city, newOwner, garrison) => {
  const oldOwner = city.owner;
  city.owner = newOwner;
  city.loyalty = 30;
  city.buildQueue = [];
  city.train = {};
  city.units = garrison;
  city.mods = [];
  city.taxPolicy = 'normal'; city.placated = 0;
  // buildings unique to another people (including their wonders) are torn down by the new masters
  for (const t of Object.keys(city.buildings)) {
    const b = DATA.buildings[t];
    if (b && b.race && b.race !== s.empires[newOwner].race) delete city.buildings[t];
  }
  s.empires[newOwner].conquests = (s.empires[newOwner].conquests || 0) + 1;
  if (!G.citiesOf(s, oldOwner).length) {
    s.empires[oldOwner].dead = true;
    s.empires[oldOwner].diedAt = s.time;
    s.moves = s.moves.filter(m => m.owner !== oldOwner);
    if (oldOwner === 'p') s.gameOver = 'defeat';
    else G.log(s, 'p', `The ${s.empires[oldOwner].name} has fallen.`, 'good');
  }
  checkVictory(s);
};

const checkVictory = s => {
  if (s.victory || s.gameOver || s.settings.mode === 'endless') return;
  const alive = Object.values(s.empires).filter(e => e.id !== 'p' && !e.dead);
  if (!alive.length) { s.victory = true; G.log(s, 'p', 'Every rival crown has fallen. The realm is yours!', 'good'); }
};

const claimOasis = (s, tile, city) => {
  const o = tile.oasis;
  const idx = G.tileIdx(s, tile);
  if (o.owner) {
    const prev = s.cities[o.owner];
    if (prev) prev.oases = (prev.oases || []).filter(i => i !== idx);
  }
  o.owner = city.id;
  city.oases = city.oases || [];
  city.oases.push(idx);
};

G.resolveMove = (s, m) => {
  const tile = G.tileAt(s, m.x, m.y);
  const me = s.empires[m.owner];
  const home = s.cities[m.from];

  if (m.owner === 'p' && m.type !== 'return') G.reveal(s, m.x, m.y, 1);
  if (G.moveHandlers[m.type]) return G.moveHandlers[m.type](s, m);

  if (m.type === 'return') {
    if (home && home.owner === m.owner) {
      G.addUnits(home.units, m.units);
      G.gain(s, home, m.cargo);
      G.log(s, m.owner, `Troops returned to ${home.name}${Object.keys(m.cargo).length ? ' with plunder' : ''}.`);
    } else {
      // home was lost while they were away: march on to the capital
      const cap = G.capital(s, m.owner);
      if (cap) {
        G.log(s, m.owner, `Their home lost, the troops march on to ${cap.name}.`, 'warn');
        s.moves.push({ ...m, id: G.newId(s, 'm'), from: cap.id, fx: m.x, fy: m.y, x: cap.x, y: cap.y, depart: s.time,
          arrive: s.time + G.travelTime(s, m.owner, m, cap, G.slowest(s, m.owner, m.units)) });
      } else if (m.units.hero && G.heroLost) G.heroLost(s, m.owner);
    }
    return;
  }
  if (m.type === 'trade') {
    const tc = tile.city && s.cities[tile.city];
    if (tc) { G.gain(s, tc, m.cargo); G.log(s, m.owner, `Caravan arrived at ${tc.name}.`, 'good'); }
    return;
  }
  if (m.type === 'reinforce') {
    const tc = tile.city && s.cities[tile.city];
    if (tc && tc.owner === m.owner) { G.addUnits(tc.units, m.units); G.log(s, m.owner, `Reinforcements arrived at ${tc.name}.`); }
    else G.sendHome(s, m, m.units);
    return;
  }
  if (m.type === 'settle') {
    if (!tile.city && !tile.camp && !tile.oasis && !tile.ruin && G.renown(s, m.owner) >= DATA.citySlots[G.citiesOf(s, m.owner).length]) {
      const nc = G.foundCity(s, m.owner, m.x, m.y, m.owner === 'p' ? `New ${pick(['Haven', 'Hope', 'Reach', 'Ford', 'Hold', 'Watch', 'Dawn', 'Mere'])}` : null);
      const rest = { ...m.units }; rest.settlers -= 1;
      G.addUnits(nc.units, rest);
      G.log(s, m.owner, `Settlers founded ${nc.name} at (${m.x}, ${m.y})!`, 'good');
    } else {
      G.log(s, m.owner, 'The settlers found the land taken and turned back.', 'bad');
      G.sendHome(s, m, m.units);
    }
    return;
  }
  if (m.type === 'scout') return resolveScout(s, m, tile);

  // ---- hostile: raid / attack / conquer ----
  const mode = m.type === 'raid' ? 'raid' : 'attack';
  let attMult = home ? (1 + 0.01 * G.lvl(home, 'warpit')) : 1;
  if (m.units.hero && G.heroLeadership) attMult *= G.heroLeadership(s, m.owner);
  attMult *= G.mageBoost(s, m.owner, m.units);

  // neutral sites: brigand camps, wild oases, ruins
  if (tile.camp || (tile.oasis && !tile.oasis.owner) || tile.ruin) {
    const site = tile.camp ? s.camps[tile.camp] : tile.oasis || tile.ruin;
    const name = tile.camp ? 'the brigand camp' : tile.oasis ? 'the oasis' : 'the ruins';
    if (tile.ruin && site.readyAt > s.time) {
      G.report(s, [m.owner], `The ruins at (${m.x}, ${m.y}) lie empty`, 'info', { extra: 'Someone plundered them recently. Nothing was found.' });
      G.sendHome(s, m, m.units);
      return;
    }
    if (tile.ruin && !site.units) site.units = { beast: site.tier * site.tier * 4 + 3 };
    const defHad = { ...site.units };
    const r = G.battle(s, m.owner, m.units, attMult, null, site.units, 1, 5 * (site.tier || 1), mode);
    site.units = r.defLeft;
    let loot = {};
    if (G.unitsCount(r.attLeft) && site.loot) loot = takeLoot(site.loot, 0, G.carryOf(s, m.owner, r.attLeft));
    if (r.win && G.unitsCount(defHad) > 0) me.wins = (me.wins || 0) + 1;
    let extra = '';
    if (tile.camp && !G.unitsCount(site.units)) {
      delete s.camps[tile.camp]; tile.camp = null;
      extra = 'The camp was razed. Other outlaws will gather elsewhere.';
    }
    if (tile.ruin && r.win && m.type !== 'adventure') { site.units = null; site.readyAt = s.time + 3600 * G.pace(s).time; extra = 'The ruins were cleared, but only a hero can find their hidden treasures.'; }
    if (tile.oasis && r.win && home && mode === 'attack') {
      if ((home.oases || []).length < G.oasisSlots(home) && dist(home, tile) <= G.cityReach(s, home) + 1.5) {
        claimOasis(s, tile, home);
        extra = `The oasis now belongs to ${home.name} (+25% ${DATA.goods[tile.oasis.bonus].name}).`;
        G.log(s, m.owner, extra, 'good');
      } else extra = `${home.name} could not hold the oasis: it must lie within ${(G.cityReach(s, home) + 1.5).toFixed(1)} tiles (a city's reach grows with its population) and the city needs a free oasis slot.`;
    }
    G.report(s, [m.owner], `${r.win ? 'Victory' : 'Defeat'} at ${name} (${m.x}, ${m.y})`, r.win ? 'win' : 'loss',
      { att: me.name, def: tile.camp ? 'Brigands' : 'Wild beasts', A: r.A, D: r.D, attSent: m.units, attLost: r.attLost, defHad, defLost: r.defLost, loot, extra });
    for (const h of G.battleHooks) h(s, { m, r, site: tile.ruin ? 'ruin' : tile.oasis ? 'oasis' : 'camp', defOwner: null, tile, defHad });
    G.sendHome(s, m, r.attLeft, loot);
    return;
  }

  // oasis owned by someone: no garrison, take it over
  if (tile.oasis && tile.oasis.owner) {
    const oc = s.cities[tile.oasis.owner];
    if (!oc || oc.owner === m.owner) { G.sendHome(s, m, m.units); return; }
    for (const h of G.hostileHooks) h(s, m.owner, oc.owner, m.type);
    let extra = 'No defenders were present.';
    if (mode === 'attack' && home && (home.oases || []).length < G.oasisSlots(home) && dist(home, tile) <= G.cityReach(s, home) + 1.5) {
      claimOasis(s, tile, home); extra = `The oasis was taken from ${oc.name}.`;
      G.log(s, oc.owner, `An oasis of ${oc.name} was seized by ${me.name}!`, 'bad');
    }
    G.report(s, [m.owner, oc.owner], `${me.name} marched on an oasis of ${oc.name}`, m.owner === 'p' ? 'win' : 'loss',
      { att: me.name, def: s.empires[oc.owner].name, A: Math.round(G.atkPower(s, m.owner, m.units)), D: 0, attSent: m.units, attLost: {}, defHad: {}, defLost: {}, loot: {}, extra });
    G.sendHome(s, m, m.units);
    return;
  }

  const city = tile.city && s.cities[tile.city];
  if (!city || city.owner === m.owner) { G.sendHome(s, m, m.units); return; }
  const defEmp = s.empires[city.owner];
  for (const h of G.hostileHooks) h(s, m.owner, city.owner, m.type);
  const brk = G.wallBreak(m.units);
  const wallBefore = G.lvl(city, 'wall');
  const cd = G.cityDefense(s, city, brk);
  let defMult = cd.mult;
  if (city.units.hero && G.heroDefense) defMult *= G.heroDefense(s, city.owner);
  defMult *= G.mageBoost(s, city.owner, city.units);
  const defHad = { ...city.units };
  const r = G.battle(s, m.owner, m.units, attMult, city.owner, city.units, defMult, cd.flat, mode);
  // siege: surviving rams damage the wall, surviving catapults wreck buildings
  const siegeNotes = [];
  if (r.win && mode === 'attack') {
    const wallHit = Math.min(G.lvl(city, 'wall'), Math.floor(G.wallBreak(r.attLeft) * 0.5));
    if (wallHit > 0) { city.buildings.wall -= wallHit; siegeNotes.push(`Rams broke the wall down by ${wallHit} level${wallHit > 1 ? 's' : ''}.`); }
    let hits = Math.min(5, Math.floor(G.wreckPower(r.attLeft) / 6));
    const wrecked = {};
    while (hits-- > 0) {
      const opts = Object.keys(city.buildings).filter(b => city.buildings[b] > (b === 'townhall' ? 1 : 0) && b !== 'wall' && !DATA.buildings[b].wonder);
      if (!opts.length) break;
      const b = G.pick(opts);
      city.buildings[b]--; if (!city.buildings[b]) delete city.buildings[b];
      wrecked[b] = (wrecked[b] || 0) + 1;
    }
    if (Object.keys(wrecked).length) siegeNotes.push('Catapults wrecked ' + Object.entries(wrecked).map(([b, n]) => `${DATA.buildings[b].name} (−${n})`).join(', ') + '.');
  }
  if (brk > 0 && wallBefore > 0) siegeNotes.unshift(`Siege engines negated ${Math.min(brk, wallBefore).toFixed(1)} wall levels during the assault.`);
  city.units = r.defLeft;
  let loot = {};
  if (G.unitsCount(r.attLeft)) loot = takeLoot(city.res, G.econ(s, city).protect, G.carryOf(s, m.owner, r.attLeft));
  let extra = siegeNotes.join(' ');
  if (r.win && G.unitsCount(defHad) > 0) me.wins = (me.wins || 0) + 1; else if (!r.win) defEmp.wins = (defEmp.wins || 0) + 1;
  for (const h of G.battleHooks) h(s, { m, r, site: 'city', defOwner: city.owner, city, defHad });
  if (m.type === 'conquer' && r.win && (r.attLeft.herald || 0) > 0) {
    const drop = rint(20, 32) * r.attLeft.herald;
    city.loyalty -= drop;
    extra = (extra ? extra + ' ' : '') + `Loyalty of ${city.name} fell by ${drop} to ${Math.max(0, Math.round(city.loyalty))}.`;
    if (city.loyalty <= 0) {
      const oldOwner = city.owner;
      const garrison = { ...r.attLeft }; delete garrison.herald;
      G.report(s, [m.owner, oldOwner], `${city.name} has fallen to ${me.name}!`, m.owner === 'p' ? 'win' : 'loss',
        { att: me.name, def: defEmp.name, A: r.A, D: r.D, attSent: m.units, attLost: r.attLost, defHad, defLost: r.defLost, loot: {}, extra: `${city.name} now swears loyalty to ${me.name}.` });
      G.log(s, m.owner, `${city.name} has been conquered!`, 'good');
      G.log(s, oldOwner, `${city.name} was conquered by ${me.name}!`, 'bad');
      transferCity(s, city, m.owner, garrison);
      return;
    }
  }
  const pv = m.owner === 'p' ? r.win : !r.win;
  const verb = mode === 'raid' ? 'Raid' : m.type === 'conquer' ? 'Conquest' : 'Assault';
  G.report(s, [m.owner, city.owner], `${verb} on ${city.name}: ${me.name} ${r.win ? 'won' : 'was repelled'}`, pv ? 'win' : 'loss',
    { att: me.name, def: defEmp.name, A: r.A, D: r.D, attSent: m.units, attLost: r.attLost, defHad, defLost: r.defLost, loot, extra });
  if (city.owner === 'p') G.log(s, 'p', `${city.name} was ${mode === 'raid' ? 'raided' : 'attacked'} by ${me.name}! ${r.win ? 'Our defenders fell.' : 'We held the walls.'}`, r.win ? 'bad' : 'good');
  G.sendHome(s, m, r.attLeft, loot);
};

const resolveScout = (s, m, tile) => {
  const me = s.empires[m.owner];
  const city = tile.city && s.cities[tile.city];
  const camp = tile.camp && s.camps[tile.camp];
  const site = camp || tile.oasis || tile.ruin;
  const defScouts = city ? (city.units.scout || 0) : 0;
  const sent = m.units.scout;
  const chance = defScouts ? sent / (sent + defScouts * 1.5) : 1;
  if (Math.random() > chance) {
    if (city && city.owner !== m.owner) for (const h of G.hostileHooks) h(s, m.owner, city.owner, 'scout');
    G.report(s, [m.owner], `Scouts lost near (${m.x}, ${m.y})`, 'loss', { scout: true, failed: true, extra: `All ${sent} scouts were caught by the defenders' scouts.` });
    if (city && city.owner === 'p') G.log(s, 'p', `Our scouts caught spies from ${me.name} near ${city.name}.`, 'good');
    return;
  }
  const intel = { t: s.time };
  if (city) {
    intel.name = city.name; intel.owner = city.owner;
    intel.units = { ...city.units };
    intel.res = Object.fromEntries(DATA.goodOrder.map(g => [g, Math.floor(city.res[g] || 0)]).filter(([, v]) => v > 0));
    intel.wall = G.lvl(city, 'wall'); intel.th = G.lvl(city, 'townhall'); intel.loyalty = Math.round(city.loyalty);
  } else if (site) {
    intel.units = { ...(site.units || (tile.ruin ? { beast: site.tier * site.tier * 4 + 3 } : {})) };
    if (site.loot) intel.res = Object.fromEntries(Object.entries(site.loot).map(([g, v]) => [g, Math.floor(v)]));
  }
  if (m.owner === 'p') { s.intel[G.tileIdx(s, tile)] = intel; G.reveal(s, m.x, m.y, 2); }
  G.report(s, [m.owner], `Scouting report: ${city ? city.name : camp ? 'brigand camp' : tile.oasis ? 'oasis' : tile.ruin ? 'ruins' : 'open land'} (${m.x}, ${m.y})`, 'info', { scout: true, intel });
  G.sendHome(s, m, m.units);
};

// ---------------------------------------------------------------------
// Per-city simulation step
// ---------------------------------------------------------------------
const stepCity = (s, city, dt, away) => {
  const emp = s.empires[city.owner];
  const e = G.econ(s, city, away);
  const k = dt / 60;
  const cap = e.cap;

  for (const [g, r] of Object.entries(e.raw)) city.res[g] = Math.min(Math.max(cap, city.res[g] || 0), (city.res[g] || 0) + r * k);

  city.refineEff = city.refineEff || {};
  for (const ref of e.refiners) {
    let f = 1;
    for (const [g, v] of Object.entries(ref.in)) { const need = v * k; if (need > 0) f = Math.min(f, (city.res[g] || 0) / need); }
    for (const [g, v] of Object.entries(ref.out)) { const out = v * k; if (out > 0) f = Math.min(f, Math.max(0, cap - (city.res[g] || 0)) / out); }
    f = clamp(f, 0, 1);
    for (const [g, v] of Object.entries(ref.in)) city.res[g] -= v * k * f;
    for (const [g, v] of Object.entries(ref.out)) city.res[g] = (city.res[g] || 0) + v * k * f;
    city.refineEff[ref.type] = f;
  }

  let popGrain = e.popFood * k, breadBonus = false;
  if (emp.race === 'hearth' && (city.res.bread || 0) > 0) {
    const need = e.popFood / 3 * k;
    const eat = Math.min(city.res.bread, need);
    city.res.bread -= eat;
    popGrain *= 1 - eat / need;
    breadBonus = eat >= need * 0.99;
  }
  const grainNeed = popGrain + e.upkeep * k;
  if (city.res.grain >= grainNeed) { city.res.grain -= grainNeed; city.starving = false; }
  else { city.res.grain = 0; city.starving = true; }

  if (city.starving) {
    city.pop = Math.max(3, city.pop - Math.max(0.5, city.pop * 0.03) * k);
    const n = G.unitsCount(city.units) - (city.units.hero || 0);
    city.desert = (city.desert || 0) + n * 0.02 * k;
    while (city.desert >= 1) {
      const big = Object.entries(city.units).filter(([u, c]) => u !== 'hero' && c > 0).sort((a, b) => b[1] - a[1])[0];
      if (!big) { city.desert = 0; break; }
      city.units[big[0]]--; city.desert -= 1;
      if (!city.desertLogged) { G.log(s, city.owner, `Hunger in ${city.name}: troops are deserting!`, 'bad'); city.desertLogged = true; }
    }
  } else {
    city.desertLogged = false; city.desert = 0;
    if (city.pop < e.civCap) {
      const g = (0.6 + 0.04 * (e.civCap - city.pop)) * G.mod(s, city.owner, city, 'popGrowth') * (breadBonus ? 1.5 : 1) * G.pace(s).prod;
      city.pop = Math.min(e.civCap, city.pop + g * k);
    } else if (city.pop > e.civCap) city.pop = Math.max(e.civCap, city.pop - Math.max(1, (city.pop - e.civCap) * 0.05) * k);
  }

  emp.gold += e.tax * k;
  city.loyalty = Math.min(100, (city.loyalty ?? 100) + 0.4 * (1 + 0.25 * Math.max(0, (s.maxCities || 1) - G.citiesOf(s, city.owner).length)) * k);
  if (city.mods && city.mods.length) city.mods = city.mods.filter(md => md.until > s.time);

  while (city.buildQueue.length && city.buildQueue[0].end <= s.time) {
    const q = city.buildQueue.shift();
    city.buildings[q.type] = q.level;
    const b = DATA.buildings[q.type];
    G.log(s, city.owner, `${b.icon} ${b.name} reached level ${q.level} in ${city.name}.`, 'good');
    if (q.type === 'townhall') {
      const t = G.tier(city);
      if (t.th === q.level) G.log(s, city.owner, `${city.name} has grown into a ${t.name}!`, 'good');
    }
  }

  for (const q of Object.values(city.train)) {
    while (q.length && q[0].next !== null && q[0].next <= s.time) {
      const it = q[0];
      city.units[it.unit] = (city.units[it.unit] || 0) + 1;
      it.left--;
      if (it.left > 0) it.next += it.each;
      else {
        const done = it.next;
        q.shift();
        G.log(s, city.owner, `Training of ${DATA.units[it.unit].name} complete in ${city.name}.`);
        if (q.length) q[0].next = done + q[0].each;
      }
    }
  }
};

// ---------------------------------------------------------------------
// Neutral world: camps, oases, ruins
// ---------------------------------------------------------------------
G.freeTile = (s, pred, tries = 3000) => {
  for (let i = 0; i < tries; i++) {
    const t = s.tiles[rint(0, s.tiles.length - 1)];
    if (t.city || t.camp || t.oasis || t.ruin || DATA.terrain[t.terrain].impassable) continue;
    if (pred(t)) return t;
  }
  return null;
};
G.spawnCamp = (s, tier, near) => {
  const pc = G.citiesOf(s, 'p');
  const t = near
    ? G.freeTile(s, x => dist(x, near) >= 3 && dist(x, near) <= 6 && Object.values(s.cities).every(c => dist(c, x) >= 2.5))
    : G.freeTile(s, x => Object.values(s.cities).every(c => dist(c, x) >= 3) && Object.values(s.camps).every(c => dist(c, x) >= 2));
  if (!t) return null;
  if (!tier) {
    const d = pc.length ? Math.min(...pc.map(c => dist(c, t))) : 8;
    tier = clamp(Math.round(d / 4.5 + rnd(-0.6, 0.6) + s.time / (3 * 3600 * G.pace(s).time)), 1, 6);
  }
  const id = G.newId(s, 'k');
  const camp = { id, x: t.x, y: t.y, tier, units: { brigand: tier * tier * 6 + 4 }, loot: {} };
  for (const g of ['grain', 'timber', 'stone', 'ore']) camp.loot[g] = tier * 350;
  camp.loot.iron = tier * 40; camp.loot.weapons = tier * 40;
  s.camps[id] = camp;
  t.camp = id;
  return camp;
};

const stepNeutrals = (s, dt) => {
  const k = dt / 60 * G.pace(s).prod;
  for (const camp of Object.values(s.camps)) {
    if (camp.kind) continue;              // wyrm lairs, undead hordes and craters don't regrow brigands
    const targetN = camp.tier * camp.tier * 6 + 4;
    const n = camp.units.brigand || 0;
    if (n < targetN) {
      camp.grow = (camp.grow || 0) + 0.15 * camp.tier * k;
      if (camp.grow >= 1) { camp.units.brigand = n + Math.floor(camp.grow); camp.grow -= Math.floor(camp.grow); }
    }
    for (const g of ['grain', 'timber', 'stone', 'ore', 'iron', 'weapons']) {
      const target = camp.tier * (g === 'iron' || g === 'weapons' ? 40 : 350);
      if ((camp.loot[g] || 0) < target) camp.loot[g] = Math.min(target, (camp.loot[g] || 0) + target * 0.02 * k);
    }
  }
  for (const t of s.special) {
    const o = t.oasis;
    if (o && !o.owner) {
      const target = o.tier * o.tier * 5 + 3;
      const n = o.units.beast || 0;
      if (n < target) { o.grow = (o.grow || 0) + 0.1 * o.tier * k; if (o.grow >= 1) { o.units.beast = n + Math.floor(o.grow); o.grow -= Math.floor(o.grow); } }
    }
  }
};

// ---------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------
// 0 during the grace period, then ramps up to 1 over pace.ramp
G.aiPressure = s => {
  const p = G.pace(s);
  const t = s.time - p.grace;
  if (t <= 0) return 0;
  return Math.pow(clamp(t / p.ramp, 0, 1), 1.3);
};

const aiBuildChoice = (s, city) => {
  const e = G.econ(s, city);
  const th = G.lvl(city, 'townhall');
  const emp = s.empires[city.owner];
  const cands = [];
  const nearCap = DATA.goodOrder.some(g => (city.res[g] || 0) > e.cap * 0.8);
  for (const t of DATA.buildingOrder) {
    const st = G.buildStatus(s, city, t);
    if (st.hidden || st.maxed || st.locked) continue;
    if (G.aiBuildFilters.some(f => !f(s, city, t))) continue;
    const L = G.lvl(city, t);
    let w = 20 + rnd(0, 18);
    switch (t) {
      case 'farm': w += e.net.grain < 5 + city.pop * 0.05 ? 120 : (city.res.grain || 0) < e.cap * 0.25 ? 45 - L : 32 - L; break;
      case 'houses': w += city.pop >= e.popCap * 0.9 ? 70 : 5; break;
      case 'warehouse': w += nearCap ? 60 : 0; break;
      case 'townhall': w += 25 + (L <= 3 ? 20 : 0); break;
      case 'lumber': w += 28 - L + ((city.res.timber || 0) < e.cap * 0.15 ? 25 : 0); break;
      case 'quarry': w += 28 - L + ((city.res.stone || 0) < e.cap * 0.15 ? 25 : 0); break;
      case 'mine': w += 22 - L + ((city.res.ore || 0) < e.cap * 0.15 ? 20 : 0); break;
      case 'workshop': w += G.aiPressure(s) > 0.6 ? 10 + emp.aggr * 15 - L * 2 : -30; break;
      case 'smelter': w += 22 - L; break;
      case 'smithy': w += (city.res.tools || 0) < 20 ? 30 : 5; break;
      case 'armory': w += 22 - L + emp.aggr * 10; break;
      case 'barracks': w += 15 + emp.aggr * 10 - L; break;
      case 'stable': w += emp.aggr * 12 - L; break;
      case 'wall': w += L >= th + 1 ? -60 : 10 + (1 - emp.aggr) * 12 - L + G.aiPressure(s) * 10; break;
      case 'market': w += emp.gold > 800 && L < 3 ? 25 : -5; break;
      case 'academy': w += L < 3 ? 12 : -5; break;
      default: w += 18 - L;
    }
    if (e.eff < 0.95 && t === 'houses') w += 50;
    if (t !== 'townhall' && L >= th + 2) w -= 40;
    cands.push({ t, w, st });
  }
  cands.sort((a, b) => b.w - a.w);
  const ok = cands.filter(c => c.st.ok);
  if (ok.length && (ok[0] === cands[0] || Math.random() < 0.5)) return ok[0].t;
  return null;
};

// share of cavalry attack among the armies of hostile realms near this city
const threatCavShare = (s, city) => {
  let inf = 0, cav = 0;
  for (const o of Object.values(s.cities)) {
    if (o.owner === city.owner || dist(o, city) > 12 || G.hostility(s, city.owner, o.owner) <= 0.3) continue;
    for (const [u, n] of Object.entries(o.units)) { const d = DATA.units[u]; if (!d.at) continue; if (d.type === 'cav') cav += d.atk * n; else inf += d.atk * n; }
  }
  return inf + cav > 0 ? cav / (inf + cav) : 0.3;
};

// when a city is about to be hit, nearby cities of the same realm send defenders if they can arrive in time
const aiDefend = (s, empId) => {
  for (const m of s.moves) {
    if (m.owner === empId || m.aiHelped || !['raid', 'attack', 'conquer'].includes(m.type)) continue;
    const tile = G.tileAt(s, m.x, m.y);
    const target = tile.city && s.cities[tile.city];
    if (!target || target.owner !== empId) continue;
    m.aiHelped = true;
    const left = m.arrive - s.time;
    const helpers = G.citiesOf(s, empId).filter(c => c !== target).sort((a, b) => dist(a, target) - dist(b, target));
    for (const c of helpers.slice(0, 2)) {
      const def = {};
      for (const [u, n] of Object.entries(c.units)) { const d = DATA.units[u]; if (d.at && d.type !== 'civ' && d.type !== 'siege' && (d.defI + d.defC) / 2 >= d.atk * 0.9) def[u] = Math.floor(n * 0.5); }
      if (!G.unitsCount(def)) continue;
      if (G.travelTime(s, empId, c, target, G.slowest(s, empId, def)) < left) G.sendArmy(s, c.id, target.x, target.y, 'reinforce', def);
    }
  }
};

const aiTrain = (s, city) => {
  const emp = s.empires[city.owner];
  const race = DATA.races[emp.race];
  if (G.lvl(city, 'barracks') < 1) return;
  const e = G.econ(s, city);
  if (e.net.grain < 3 || city.starving || (emp.saving && emp.gold < 900) || (city.res.grain || 0) < Math.min(400, e.cap * 0.2)) return;
  const late = G.aiPressure(s) > 0.7;
  if (late && G.lvl(city, 'townhall') >= 8 && (city.units.herald || 0) < 2 && !(city.train.townhall || []).length && emp.gold > 2500 && Math.random() < 0.15) {
    if (G.canAfford(s, city, DATA.units.herald.cost)) { G.queueTrain(s, city.id, 'herald', 1); return; }
  }
  const opts = race.units.filter(u => G.trainStatus(s, city, u).ok);
  if (!opts.length) return;
  const wantAtk = Math.random() < emp.aggr * (0.5 + G.aiPressure(s));
  // value per unit of cost: attackers by attack; defenders by the defence that answers the nearby threat's cavalry share
  const cs = threatCavShare(s, city);
  const price = u => Object.entries(DATA.units[u].cost).reduce((a, [g, v]) => a + v * (g === 'gold' ? 1 : DATA.goods[g].value), 0) || 1;
  const val = u => { const d = DATA.units[u]; return (wantAtk ? d.atk : d.defI * (1 - cs) + d.defC * cs) / price(u); };
  let pool = opts.filter(u => DATA.units[u].type !== 'siege');
  // siege engines: some, once the realm means business
  if (wantAtk && G.aiPressure(s) > 0.6 && Math.random() < 0.25) { const sg = opts.filter(u => DATA.units[u].type === 'siege'); if (sg.length) pool = sg; }
  const unit = pool.sort((a, b) => val(b) - val(a))
    .find(u => G.maxAffordable(s, city, DATA.units[u].cost) >= 1 && !(city.train[DATA.units[u].at] || []).length);
  if (!unit) return;
  const st = G.trainStatus(s, city, unit);
  // keep most people working: enrol at most a fifth of the citizens at once
  const max = Math.min(st.max, Math.floor(city.pop * 0.2 / Math.max(1, st.pop)));
  const n = Math.min(max, rint(2, 6) + G.lvl(city, 'barracks'));
  if (n > 0) G.queueTrain(s, city.id, unit, n);
};

const aiMarket = (s, city) => {
  if (G.lvl(city, 'market') < 1) return;
  const cap = G.storageCap(s, city);
  const emp = s.empires[city.owner];
  for (const g of ['grain', 'timber', 'stone', 'ore']) if ((city.res[g] || 0) > cap * 0.9) G.trade(s, city.id, g, cap * 0.2, 'sell');
  for (const g of ['grain', 'timber', 'stone']) {
    if ((city.res[g] || 0) < cap * 0.1 && emp.gold > (emp.saving ? 1000 : 400)) G.trade(s, city.id, g, Math.min(cap * 0.2, emp.gold / 4 / G.marketRates(s, city, g).buy), 'buy');
  }
};

const aiExpand = (s, empId) => {
  const cities = G.citiesOf(s, empId);
  const emp = s.empires[empId];
  if (!G.canFoundCity(s, empId) || cities.length >= 7) { emp.saving = false; return; }
  for (const c of cities) {
    if ((c.units.settlers || 0) > 0) {
      let best = null, bd = 1e9;
      for (const t of s.tiles) {
        if (t.city || t.camp || t.oasis || t.ruin || DATA.terrain[t.terrain].impassable) continue;
        const d = dist(t, c);
        if (d < 3 || d > 7) continue;
        if (Object.values(s.cities).some(o => dist(o, t) < 2.8)) continue;
        if (!G.landReachable(s, c, t)) continue;
        const score = d * 0.4 + rnd(0, 1) - 4 * G.siteFit(G.siteYield(s, t.x, t.y), emp.race);
        if (score < bd) { bd = score; best = t; }
      }
      if (best) G.sendArmy(s, c.id, best.x, best.y, 'settle', { settlers: 1 });
      return;
    }
  }
  const src = cities.find(c => G.lvl(c, 'townhall') >= 5 && !(c.train.townhall || []).length);
  const training = cities.some(c => (c.train.townhall || []).some(q => q.unit === 'settlers'));
  emp.saving = !!src && !training;
  if (src && G.canAfford(s, src, DATA.units.settlers.cost)) { G.queueTrain(s, src.id, 'settlers', 1); emp.saving = false; }
};

const aiWar = (s, empId) => {
  const emp = s.empires[empId];
  const pressure = G.aiPressure(s);
  for (const c of G.citiesOf(s, empId)) {
    const off = {};
    for (const [u, n] of Object.entries(c.units)) {
      const d = DATA.units[u];
      if (d.type !== 'civ' && d.type !== 'hero' && d.type !== 'siege' && n > 0 && d.atk >= (d.defI + d.defC) / 2 * 0.8) off[u] = Math.floor(n * 0.8);
    }
    const A = G.atkPower(s, empId, off) * G.mod(s, empId, null, 'atk');
    if (A < 250) continue;
    const targets = [];
    for (const camp of Object.values(s.camps)) {
      const d = G.defPower(s, null, camp.units) + 5 * camp.tier;
      if (A > d * 1.5) targets.push({ x: camp.x, y: camp.y, score: dist(c, camp) - 2, type: 'raid' });
    }
    for (const t of s.special) {
      if (t.oasis && !t.oasis.owner && dist(c, t) <= G.cityReach(s, c) + 1.5 && (c.oases || []).length < G.oasisSlots(c)) {
        const d = G.defPower(s, null, t.oasis.units) + 5 * t.oasis.tier;
        if (A > d * 1.6) targets.push({ x: t.x, y: t.y, score: dist(c, t) - 3, type: 'attack' });
      }
    }
    for (const o of Object.values(s.cities)) {
      if (o.owner === empId) continue;
      const hate = G.hostility(s, empId, o.owner);
      if (hate <= 0) continue;
      if (o.owner === 'p' && (pressure <= 0 || s.time - (o.lastRaided || -1e9) < 1200 * G.pace(s).time / Math.max(0.3, pressure)
        || s.time - (emp.lastHitP || -1e9) < 900 * G.pace(s).time / Math.max(0.4, pressure))) continue;
      const cd = G.cityDefense(s, o, G.wallBreak(Object.fromEntries(Object.entries(c.units).filter(([u]) => DATA.units[u].type === 'siege'))));
      const d = G.defPower(s, o.owner, o.units) * cd.mult * G.mod(s, o.owner, null, 'def') + cd.flat;
      const p = o.owner === 'p' ? pressure * s.settings.hostility : 0.6;
      if (A > d * 1.3 && Math.random() < emp.aggr * hate * p) {
        const myN = G.citiesOf(s, empId).length, theirN = G.citiesOf(s, o.owner).length;
        const conquer = (c.units.herald || 0) > 0 && pressure > 0.7 && A > d * 2 && myN <= theirN + 2 && myN < 8;
        targets.push({ x: o.x, y: o.y, score: dist(c, o) - (o.owner === 'p' ? 8 : 0), type: conquer ? 'conquer' : 'raid', far: o.owner === 'p' ? 17 : 13 });
      }
    }
    if (!targets.length) continue;
    targets.sort((a, b) => a.score - b.score);
    const t = targets.find(t => G.landReachable(s, c, t));
    if (!t) continue;
    if (dist(c, t) > (t.far || 13)) continue;
    const army = { ...off };
    if (t.type === 'conquer') army.herald = 1;
    const tt0 = G.tileAt(s, t.x, t.y);
    if (tt0.city && G.lvl(s.cities[tt0.city], 'wall') >= 4) for (const [u, n] of Object.entries(c.units)) if (DATA.units[u].type === 'siege' && n > 0) army[u] = n;
    if (!G.sendArmy(s, c.id, t.x, t.y, t.type, army)) {
      const tt = G.tileAt(s, t.x, t.y);
      if (tt.city) { s.cities[tt.city].lastRaided = s.time; if (s.cities[tt.city].owner === 'p') emp.lastHitP = s.time; }
    }
    return;
  }
};

const aiThink = (s, dtMin) => {
  for (const emp of Object.values(s.empires)) {
    if (emp.id === 'p' || emp.dead) continue;
    for (const city of G.citiesOf(s, emp.id)) {
      if (city.buildQueue.length < 1) { const t = aiBuildChoice(s, city); if (t) G.queueBuild(s, city.id, t); }
      if (Math.random() < 0.5) aiTrain(s, city);
      aiMarket(s, city);
    }
    aiExpand(s, emp.id);
    aiDefend(s, emp.id);
    emp.warClock = (emp.warClock || 0) + dtMin;
    if (emp.warClock > 1.5 * G.pace(s).time) { emp.warClock = 0; aiWar(s, emp.id); }
    for (const h of G.aiHooks) h(s, emp, dtMin);
  }
};

// ---------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------
G.step = (s, dt) => {
  s.time += dt;
  const away = {};
  for (const m of s.moves) if (G.unitsCount(m.units)) away[m.from] = G.addUnits(away[m.from] || {}, m.units);
  for (const city of Object.values(s.cities)) stepCity(s, city, dt, away);
  stepNeutrals(s, dt);
  for (const h of G.stepHooks) h(s, dt);
  s.moves.sort((a, b) => a.arrive - b.arrive);
  while (s.moves.length && s.moves[0].arrive <= s.time) G.resolveMove(s, s.moves.shift());
  s.slowClock = (s.slowClock || 0) + dt;
  if (s.slowClock >= 10) {
    const dtMin = s.slowClock / 60;
    s.slowClock = 0;
    s.maxCities = Math.max(...Object.keys(s.empires).map(id => G.citiesOf(s, id).length));
    aiThink(s, dtMin);
    G.updateExplored(s);
    s.campClock = (s.campClock || 0) + dtMin;
    if (s.campClock > 5 * G.pace(s).time) { s.campClock = 0; for (let i = 0; i < 2 && Object.keys(s.camps).length < s.campTarget; i++) G.spawnCamp(s); }
    for (const h of G.slowHooks) h(s, dtMin);
  }
};

G.advance = (s, gameSeconds, maxSteps = 4000) => {
  if (!(gameSeconds > 0)) return;
  const stepSize = Math.max(2, gameSeconds / maxSteps);
  let left = gameSeconds;
  while (left > 0) {
    const dt = Math.min(stepSize, left);
    G.step(s, dt);
    left -= dt;
  }
};

// ---------------------------------------------------------------------
// World generation / new game
// ---------------------------------------------------------------------
G.newGame = (opts) => {
  const { name, cityName, race, difficulty = 'normal', pace = 'standard', mode = 'conquest' } = opts;
  const rivals = G.clamp(Math.round(opts.rivals || 3), 1, DATA.raceOrder.length - 1);
  const size = opts.size || 31 + 4 * Math.max(0, rivals - 3);   // the world grows with the number of rivals
  const s = {
    version: G.VERSION, time: 0, nextId: 1, realLast: Date.now(), map: size,
    settings: { speed: 1, pace, mode, difficulty, aiMult: { easy: 0.75, normal: 1, hard: 1.3 }[difficulty], hostility: { easy: 0.5, normal: 0.85, hard: 1.25 }[difficulty] },
    empires: {}, cities: {}, camps: {}, tiles: [], special: [], moves: [], reports: [], log: [], intel: {}, stats: {},
    campTarget: Math.round(size * size / 42),
  };
  s.explored = new Array(size * size).fill(0);
  const types = ['fertile', 'forest', 'hills', 'mountain', 'plains', 'plains'];
  const seeds = [];
  for (let i = 0; i < Math.round(size * size / 13); i++) seeds.push({ x: rnd(0, size), y: rnd(0, size), t: pick(types) });
  for (let i = 0; i < Math.round(size * size / 110); i++) seeds.push({ x: rnd(2, size - 2), y: rnd(2, size - 2), t: 'lake', r: rnd(1, 1.8) });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let best = null, bd = 1e9;
    for (const sd of seeds) {
      let d = Math.hypot(sd.x - x, sd.y - y) + rnd(0, 1.2);
      if (sd.t === 'lake') { if (d > sd.r) continue; d -= 10; }
      if (d < bd) { bd = d; best = sd; }
    }
    s.tiles.push({ x, y, terrain: best.t, city: null, camp: null });
  }

  s.empires.p = { id: 'p', name: name || 'Your Realm', race, gold: 250, color: DATA.empireColors[0], aggr: 0 };
  // rivals: a random selection of the other peoples (the classic four first when only 3 rivals are chosen)
  const others = DATA.raceOrder.filter(r => r !== race);
  const classic = others.filter(r => ['hearth', 'delver', 'sylvan', 'ash'].includes(r)).sort(() => Math.random() - 0.5);
  const fresh = others.filter(r => !classic.includes(r)).sort(() => Math.random() - 0.5);
  const chosen = (opts.rivalRaces && opts.rivalRaces.length ? opts.rivalRaces : (rivals <= 3 ? [...classic, ...fresh] : [...classic, ...fresh].sort(() => Math.random() - 0.5))).slice(0, rivals);
  const AGGR = { ash: 0.75, delver: 0.4, sylvan: 0.45, hearth: 0.35 };
  chosen.forEach((r, i) => {
    const id = 'a' + (i + 1);
    s.empires[id] = { id, name: DATA.aiRulers[r], race: r, gold: 250, color: DATA.races[r].color, aggr: DATA.races[r].aggr ?? AGGR[r] ?? 0.45 };
  });
  const aiIds = chosen.map((r, i) => 'a' + (i + 1));

  const c = (size - 1) / 2;
  // choose capital sites first, paint each people's homeland around them, then found the cities
  const pt = G.freeTile(s, t => Math.hypot(t.x - c, t.y - c) < 4) || G.freeTile(s, () => true);
  const ais = [];
  for (const id of aiIds) {
    const spread = aiIds.length <= 3 ? 0.38 : aiIds.length <= 5 ? 0.3 : 0.24;
    const t = G.freeTile(s, t => dist(t, pt) >= size * 0.33 && ais.every(a => dist(a, t) >= size * spread))
      || G.freeTile(s, t => dist(t, pt) >= size * 0.25 && ais.every(a => dist(a, t) >= 6))
      || G.freeTile(s, t => dist(t, pt) >= 7);
    ais.push(t);
  }
  paintHomeland(s, pt.x, pt.y, race);
  aiIds.forEach((id, i) => paintHomeland(s, ais[i].x, ais[i].y, s.empires[id].race));
  makeSeas(s, [pt, ...ais]);
  s.rivers = G.genRivers(s);
  const pc = G.foundCity(s, 'p', pt.x, pt.y, cityName || 'Hearthstead', { grain: 450, timber: 750, stone: 700, ore: 200 });
  pc.pop = 12; pc.buildings.mine = 1;

  for (const [i, id] of aiIds.entries()) {
    const t = ais[i];
    const city = G.foundCity(s, id, t.x, t.y, DATA.aiNames[s.empires[id].race][0]);
    city.buildings.mine = 1; city.pop = 12;
    city.units[DATA.races[s.empires[id].race].units[0]] = 6;
  }

  for (let i = 0; i < s.campTarget; i++) G.spawnCamp(s);

  const goods = ['grain', 'timber', 'stone', 'ore'];
  for (let i = 0; i < Math.round(size * size / 60); i++) {
    const t = G.freeTile(s, x => Object.values(s.cities).every(cc => dist(cc, x) >= 2));
    if (!t) continue;
    const tier = clamp(Math.round(dist(t, pt) / 5 + rnd(-0.5, 0.5)), 1, 5);
    t.oasis = { bonus: pick(goods), mult: 0.25, tier, owner: null, units: { beast: tier * tier * 5 + 3 } };
    s.special.push(t);
  }
  for (let i = 0; i < Math.round(size * size / 90); i++) {
    const t = G.freeTile(s, x => Object.values(s.cities).every(cc => dist(cc, x) >= 3));
    if (!t) continue;
    t.ruin = { tier: clamp(Math.round(dist(t, pt) / 5 + rnd(-0.5, 1)), 1, 5), readyAt: 0, units: null };
    s.special.push(t);
  }

  for (const h of G.newGameHooks) h(s, opts);
  G.updateExplored(s);
  G.log(s, 'p', `The ${DATA.races[race].name} of ${pc.name} take their first steps toward greatness.`, 'good');
  return s;
};

// ---------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------
// serialise / deserialise a game (special tiles stored as indices, not copies)
G.serialize = s => {
  const special = s.special;
  s.special = special.map(t => G.tileIdx(s, t));
  try { return JSON.stringify(s); } finally { s.special = special; }
};
// bring any v2 save up to date: fill fields added by later features, so updates never wipe games
G.migrate = s => {
  s.rivers = s.rivers || G.genRivers(s);
  for (const k of ['calamities', 'pending', 'offers', 'moves', 'reports', 'log']) s[k] = s[k] || [];
  for (const k of ['intel', 'stats', 'airel', 'rel']) s[k] = s[k] || {};
  s.explored = s.explored || new Array(s.map * s.map).fill(1);
  for (const c of Object.values(s.cities)) {
    c.oases = c.oases || []; c.mods = c.mods || []; c.train = c.train || {}; c.refineOff = c.refineOff || {};
    c.buildQueue = c.buildQueue || []; c.units = c.units || {}; c.taxPolicy = c.taxPolicy || 'normal';
    for (const g of DATA.goodOrder) c.res[g] = c.res[g] || 0;
  }
  for (const e of Object.values(s.empires)) { e.upgrades = e.upgrades || {}; e.traditions = e.traditions || []; e.culture = e.culture || 0; e.cultureTotal = e.cultureTotal || 0; }
  s.saveRev = SAVE_REV;
  return s;
};
const SAVE_REV = 3;     // bump when migrate() learns something new
G.deserialize = json => {
  const s = JSON.parse(json);
  if (!s || s.version !== G.VERSION || !Array.isArray(s.tiles) || !s.empires || !s.empires.p) return null;
  s.special = (s.special || []).map(i => typeof i === 'number' ? s.tiles[i] : s.tiles[i.y * s.map + i.x]);
  return G.migrate(s);
};
G.save = s => {
  s.realLast = Date.now();
  try { localStorage.setItem(G.SAVE_KEY, G.serialize(s)); return true; } catch (e) { return false; }
};
G.load = () => {
  try { const raw = localStorage.getItem(G.SAVE_KEY); return raw ? G.deserialize(raw) : null; } catch (e) { return null; }
};
// three manual save slots alongside the autosave
G.SLOT_KEY = n => 'emberCrown_slot_' + n;
G.saveSlot = (s, n) => {
  s.realLast = Date.now();
  try { localStorage.setItem(G.SLOT_KEY(n), G.serialize(s)); return null; } catch (e) { return 'Could not save (browser storage full?)'; }
};
G.loadSlot = n => { try { const raw = localStorage.getItem(G.SLOT_KEY(n)); return raw ? G.deserialize(raw) : null; } catch (e) { return null; } };
G.slotInfo = n => {
  try {
    const raw = localStorage.getItem(G.SLOT_KEY(n));
    if (!raw) return null;
    const s = JSON.parse(raw);
    return { realm: s.empires.p.name, race: s.empires.p.race, time: s.time, savedAt: s.realLast, cities: Object.values(s.cities).filter(c => c.owner === 'p').length };
  } catch (e) { return null; }
};
G.clearSlot = n => { try { localStorage.removeItem(G.SLOT_KEY(n)); } catch (e) { } };
G.wipe = () => { try { localStorage.removeItem(G.SAVE_KEY); localStorage.removeItem('emberCrown_save_v1'); } catch (e) { } };

G.catchUp = s => {
  const realSec = Math.min(12 * 3600, Math.max(0, (Date.now() - (s.realLast || Date.now())) / 1000));
  const game = realSec;   // the world runs at 1x while you're away, whatever the speed setting
  if (game > 5) G.advance(s, game, 6000);
  s.realLast = Date.now();
  return game;
};
