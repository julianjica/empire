// =====================================================================
//  City quarters: a city grows over the map. As its Town Hall and people
//  pass thresholds it may claim nearby tiles as quarters, each working that
//  one tile: farmland on fertile ground, lumber yards in the forest, mining
//  quarters on hills or a deposit, docks on the shore, a mill on the river,
//  an arcane quarter on a ley node, homes or a fort anywhere. A city on poor
//  land can grow toward its one good tile.
//    * slots: G.QTR.slots ([town hall, people] per slot, up to 7);
//    * founding costs goods and builder time (its own small queue, one at a time);
//    * quarters are territory (G.landOwner), block rival cities and camps, carry a
//      road to the core, and can be raided and burned (mission 'burn') without
//      taking the city; outer walls extend the wall to them;
//    * AI realms and free cities grow quarters by the same rules; governors pick too.
//  State: city.quarters = [{ x, y, type, built, start?, end?, cost?, o?, burnt? }]   (lazily [])
//         city.qrev (bumped on any change: the site cache), city.outerWall (0/1), city.outerAt (building until)
//         mi.quarters on free cities; tile.quarter = owning city / free city id (rebuilt from the lists)
//         s.qtr = { v } marks a save that already knows quarters; s.qtrNext = the next completion time
//  Don't confuse with G.quarters(city): the barracks' soldier housing (engine.js).
// =====================================================================
'use strict';
(() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // a steady 0..1 roll from a few keys: the AI and free cities decide without drawing from Math.random,
  // so other modules' seeded worlds only diverge through real effects
  const roll = (...k) => { let h = 2166136261; const str = k.join('|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const round5 = v => Math.max(5, Math.round(v / 5) * 5);
  const paceT = s => G.pace(s).time;
  const Q = G.QTR = {
    // [town hall, people] each further slot needs: Village 1, Town 2, … City 4, … Capital of Ages 7
    slots: [[3, 40], [6, 100], [8, 150], [10, 200], [13, 280], [16, 360], [19, 450]],
    reach: 2,                    // tiles from the core (Chebyshev), and each new quarter touches the core or another quarter
    cost: { timber: 240, stone: 200, grain: 160 }, growth: 1.45, toolsFrom: 3,   // goods only: gold stays for armies and spells
    time: 150, timeGrowth: 1.3,  // game seconds (× pace) for the first quarter; later ones take longer
    pending: 2,                  // quarters waiting in the queue at once
    share: 0.2,                  // a quarter works its tile like this share of the matching building, at the tile's own yield
    flatTh: 0.1,                 // its own flat yield grows 10% per Town Hall level
    depYield: 1.4,               // a quarter on a deposit of its good yields 40% more…
    depSite: 1.27,               // …and the city's whole output of that good counts the deposit fully (+50% instead of +18%)
    maxBonus: 2, maxCap: 4,      // lumber / mining quarters / docks: +2 max level each for the matching building (up to +4)
    burnMins: 30, repairFrac: 0.3, garrison: 0.4, fortGarrison: 0.75, militia: 6, loyalty: 5,
    outer: { cost: { stone: 600, timber: 220, gold: 120 }, time: 400, wall: 5 },
    road: 2,
    ai: { every: 1.5, chance: 0.6, reserve: 2 },   // AI realms keep twice the cost in store
    minor: { every: 6 },
  };
  const ty = t => DATA.terrainYield[t.terrain] || {};
  const TYPES = Q.types = {
    farm: { name: 'Farmland', icon: '🌾', goods: { grain: { flat: 12, b: 'farm' } }, housing: [8, 1.5],
      desc: 'Fields that work the full grain of this tile, and homes for the farmhands.',
      fits: (s, t) => t.deposit === 'grain' || (ty(t).grain || 0) >= 0.5, dep: ['grain'] },
    lumber: { name: 'Lumber yard', icon: '🪵', goods: { timber: { flat: 14, b: 'lumber' } }, max: { lumber: 1 },
      desc: 'Fells this forest for timber; the Lumber Camp may rise 2 levels higher.',
      fits: (s, t) => t.deposit === 'timber' || t.terrain === 'forest', dep: ['timber'] },
    mine: { name: 'Mining quarter', icon: '⛏️', goods: { stone: { flat: 10, b: 'quarry' }, ore: { flat: 5, b: 'mine' } }, max: { mine: 1, quarry: 1 },
      desc: 'Pit heads on the hill: stone and ore from this tile, a deposit worked fully; Mine and Quarry may rise 2 levels higher.',
      fits: (s, t) => t.deposit === 'stone' || t.deposit === 'ore' || t.terrain === 'hills' || t.terrain === 'mountain', dep: ['stone', 'ore'] },
    docks: { name: 'Docks', icon: '⚓', fish: true, max: { harbor: 1 },
      desc: 'Piers on the shore: fishing boats (more with open water and a Harbor), and the Harbor may rise 2 levels higher.',
      fits: (s, t) => G.coastal(s, t.x, t.y) },
    mill: { name: 'Mill quarter', icon: '⚙️', refine: 0.08,
      desc: 'Water wheels on the river drive the workshops: +8% from every smelter, forge and workshop.',
      fits: (s, t) => G.riverSet(s).has(t.y * s.map + t.x) },
    arcane: { name: 'Arcane quarter', icon: '🔮', ley: true,
      desc: 'Built on a ley node it taps the node at full strength (on a ley line, a little).',
      fits: (s, t) => !!leyAt(s, t.x, t.y) },
    homes: { name: 'Residential', icon: '🏘️', housing: [18, 3], tax: 0.03,
      desc: 'Streets of homes: more housing and +3% taxes.', fits: () => true },
    fort: { name: 'Fort', icon: '🏰', def: 0.06,
      desc: 'A walled outpost: +6% city defence, and raiders on the quarters meet a stronger guard.', fits: () => true },
  };
  Q.order = ['farm', 'lumber', 'mine', 'docks', 'mill', 'arcane', 'homes', 'fort'];

  // ---- ley -----------------------------------------------------------------
  const LINESET = new WeakMap();
  const leyAt = (s, x, y) => {
    const L = s.ley;
    if (!L) return null;
    for (const n of L.nodes) if (n.x === x && n.y === y) return { node: n };
    let set = LINESET.get(L.lineTiles);
    if (!set) { set = new Set(L.lineTiles); LINESET.set(L.lineTiles, set); }
    return set.has(y * s.map + x) ? { line: true } : null;
  };
  G.qtrLeyAt = leyAt;

  // ---- state & index ----------------------------------------------------------
  const list = c => c.quarters || (c.quarters = []);
  G.qtrList = list;
  const bump = c => { c.qrev = (c.qrev || 0) + 1; };
  const live = (s, q) => q.built && !(q.burnt > s.time);
  // tile.quarter on every claimed tile (rebuilt from the lists; cheap, run on changes and when cities come and go)
  const SYNC = new WeakMap();
  const sync = G.qtrSync = s => {
    for (const t of s.tiles) if (t.quarter) t.quarter = null;
    for (const c of Object.values(s.cities)) for (const q of c.quarters || []) { const t = G.tileAt(s, q.x, q.y); if (t && !t.city) t.quarter = c.id; }
    if (s.minors) for (const mi of Object.values(s.minors)) for (const q of mi.quarters || []) { const t = G.tileAt(s, q.x, q.y); if (t && !t.city && !t.quarter) t.quarter = mi.id; }
    let n = 0; for (const k in s.cities) n++;
    SYNC.set(s, n);
  };
  const syncIfStale = s => { let n = 0; for (const k in s.cities) n++; if (SYNC.get(s) !== n) sync(s); };
  // the quarter on a tile: { city | minor, q } or null
  G.qtrAt = (s, x, y) => {
    const t = G.tileAt(s, x, y);
    if (!t || !t.quarter) return null;
    const c = s.cities[t.quarter], mi = !c && s.minors ? s.minors[t.quarter] : null;
    const host = c || mi;
    if (!host || !host.quarters) return null;
    for (const q of host.quarters) if (q.x === x && q.y === y) return c ? { city: c, q } : { minor: mi, q };
    return null;
  };
  // the city on a tile: its core, or one of its quarters (free cities' quarters are not cities)
  G.cityAtTile = (s, x, y) => {
    const t = G.tileAt(s, x, y);
    if (!t) return null;
    if (t.city) return s.cities[t.city] || null;
    if (!t.quarter) return null;
    const h = G.qtrAt(s, x, y);
    return h && h.city ? h.city : null;
  };

  // ---- slots, rules, cost -----------------------------------------------------
  G.qtrSlots = (s, city) => {
    const th = G.lvl(city, 'townhall'), pop = city.pop || 0;
    let n = 0;
    for (const [t, p] of Q.slots) if (th >= t && pop >= p) n++; else break;
    return n;
  };
  G.qtrNextSlot = (s, city) => { const n = G.qtrSlots(s, city); return n < Q.slots.length ? { th: Q.slots[n][0], pop: Q.slots[n][1] } : null; };
  G.qtrCost = (s, city, n) => {
    if (n === undefined) n = list(city).length;
    const m = Math.pow(Q.growth, n), c = {};
    for (const [g, v] of Object.entries(Q.cost)) c[g] = round5(v * m);
    if (n >= Q.toolsFrom) c.tools = 5 * (n - Q.toolsFrom + 1);
    return c;
  };
  G.qtrTime = (s, city, n) => {
    if (n === undefined) n = list(city).length;
    const th = G.lvl(city, 'townhall');
    return Math.max(10, Math.round(Q.time * Math.pow(Q.timeGrowth, n) / (1 + 0.05 * Math.max(0, th - 1)) * paceT(s) * G.mod(s, city.owner, city, 'buildTime')));
  };
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  // can this city claim the tile at all (ignoring the type)? → null or the reason
  const tileErr = (s, city, x, y, host) => {
    const t = G.tileAt(s, x, y);
    if (!t) return 'Off the map';
    if (G.isWater(t) || (DATA.terrain[t.terrain] || {}).impassable) return 'Open water';
    if (t.city) return 'A city stands there';
    if (t.quarter) return 'Already a quarter';
    if (t.camp || t.oasis || t.ruin || t.minor) return 'The tile is taken';
    const d = cheb(t, city);
    if (d < 1 || d > Q.reach) return `Quarters lie within ${Q.reach} tiles of the city`;
    const qs = (host || city).quarters || [];
    if (d > 1 && !qs.some(q => cheb(q, t) <= 1)) return 'Must touch the city or one of its quarters';
    if (host === undefined) {
      const own = G.landOwner(s, x, y);
      if (own && own !== city.owner) return `Inside the lands of ${s.empires[own] ? s.empires[own].name : 'another realm'}`;
      if (!G.landReachable(s, city, t)) return 'Across the water';
    }
    return null;
  };
  G.qtrTypesFor = (s, x, y) => { const t = G.tileAt(s, x, y); return t ? Q.order.filter(k => TYPES[k].fits(s, t)) : []; };
  G.qtrStatus = (s, city, x, y, type) => {
    const def = TYPES[type];
    const n = list(city).length;
    const res = { cost: G.qtrCost(s, city, n), time: G.qtrTime(s, city, n), ok: true, reason: '' };
    if (!def) return { ...res, ok: false, reason: 'Unknown quarter' };
    const slots = G.qtrSlots(s, city);
    if (n >= slots) { const nx = G.qtrNextSlot(s, city); return { ...res, ok: false, locked: true, reason: nx ? `Next quarter at Town Hall ${nx.th} and ${nx.pop} people` : 'Every quarter is claimed' }; }
    if (list(city).filter(q => !q.built).length >= Q.pending) return { ...res, ok: false, reason: 'The quarter queue is full' };
    const err = tileErr(s, city, x, y);
    if (err) return { ...res, ok: false, reason: err };
    if (!def.fits(s, G.tileAt(s, x, y))) return { ...res, ok: false, reason: `${def.name} cannot stand on this ground` };
    if (!G.canAfford(s, city, res.cost)) return { ...res, ok: false, poor: true, reason: 'Not enough goods' };
    return res;
  };
  // the tiles a city could claim now: [{ x, y, types }]
  G.qtrOptions = (s, city) => {
    const out = [];
    for (let dy = -Q.reach; dy <= Q.reach; dy++) for (let dx = -Q.reach; dx <= Q.reach; dx++) {
      if (!dx && !dy) continue;
      const x = city.x + dx, y = city.y + dy;
      if (tileErr(s, city, x, y)) continue;
      const types = G.qtrTypesFor(s, x, y);
      if (types.length) out.push({ x, y, types });
    }
    return out;
  };
  const scheduleNext = s => {
    let nx = Infinity;
    for (const c of Object.values(s.cities)) {
      if (c.outerAt) nx = Math.min(nx, c.outerAt);
      for (const q of c.quarters || []) if (!q.built) nx = Math.min(nx, q.end);
    }
    s.qtrNext = nx === Infinity ? 0 : nx;
  };
  const queueEnd = (s, city) => { let t = s.time; for (const q of list(city)) if (!q.built) t = Math.max(t, q.end); return t; };
  G.foundQuarter = (s, cityId, x, y, type) => {
    const city = s.cities[cityId];
    if (!city) return 'No such city';
    const st = G.qtrStatus(s, city, x, y, type);
    if (!st.ok) return st.reason;
    G.pay(s, city, st.cost);
    const start = queueEnd(s, city);
    list(city).push({ x, y, type, built: false, start, end: start + st.time, cost: st.cost, o: city.owner });
    G.tileAt(s, x, y).quarter = city.id;
    scheduleNext(s);
    bump(city);
    return null;
  };
  G.cancelQuarter = (s, cityId, x, y) => {
    const city = s.cities[cityId];
    if (!city) return 'No such city';
    const qs = list(city), i = qs.findIndex(q => q.x === x && q.y === y && !q.built);
    if (i < 0) return 'Nothing being built there';
    const q = qs[i];
    G.gain(s, city, q.cost || {}, q.start <= s.time ? 0.5 : 1);
    qs.splice(i, 1);
    let t = s.time;
    for (const p of qs) {
      if (p.built) continue;
      const dur = p.end - p.start;
      if (p.start <= s.time) { t = p.end; continue; }     // the one under way keeps its place
      p.start = Math.max(t, s.time); p.end = p.start + dur; t = p.end;
    }
    const tt = G.tileAt(s, x, y); if (tt && tt.quarter === city.id) tt.quarter = null;
    scheduleNext(s); bump(city);
    return null;
  };
  // tear down a quarter (the player's own choice; no refund)
  G.razeQuarter = (s, cityId, x, y) => {
    const city = s.cities[cityId];
    if (!city) return 'No such city';
    const qs = list(city), i = qs.findIndex(q => q.x === x && q.y === y && q.built);
    if (i < 0) return 'No quarter there';
    qs.splice(i, 1);
    const tt = G.tileAt(s, x, y); if (tt && tt.quarter === city.id) tt.quarter = null;
    bump(city);
    return null;
  };
  G.repairQuote = (s, city, q) => { const c = {}; for (const [g, v] of Object.entries(G.qtrCost(s, city, Math.max(0, list(city).indexOf(q))))) c[g] = round5(v * Q.repairFrac); return c; };
  G.repairQuarter = (s, cityId, x, y) => {
    const city = s.cities[cityId];
    const q = city && list(city).find(o => o.x === x && o.y === y);
    if (!q || !(q.burnt > s.time)) return 'Nothing to repair';
    const cost = G.repairQuote(s, city, q);
    if (!G.canAfford(s, city, cost)) return 'Not enough goods';
    G.pay(s, city, cost); q.burnt = 0; bump(city);
    return null;
  };
  // outer walls: the wall reaches round the quarters
  G.outerWallStatus = (s, city) => {
    const O = Q.outer;
    const cost = { ...O.cost }, time = Math.round(O.time * paceT(s) * G.mod(s, city.owner, city, 'buildTime'));
    const res = { cost, time, ok: true, reason: '' };
    if (city.outerWall) return { ...res, ok: false, done: true, reason: 'Outer walls stand' };
    if (city.outerAt) return { ...res, ok: false, building: true, reason: 'Masons at work' };
    if (G.lvl(city, 'wall') < O.wall) return { ...res, ok: false, locked: true, reason: `Needs Wall ${O.wall}` };
    if (!list(city).some(q => q.built)) return { ...res, ok: false, locked: true, reason: 'Needs a finished quarter' };
    if (!G.canAfford(s, city, cost)) return { ...res, ok: false, poor: true, reason: 'Not enough goods' };
    return res;
  };
  G.buildOuterWall = (s, cityId) => {
    const city = s.cities[cityId];
    if (!city) return 'No such city';
    const st = G.outerWallStatus(s, city);
    if (!st.ok) return st.reason;
    G.pay(s, city, st.cost);
    city.outerAt = s.time + st.time;
    scheduleNext(s);
    return null;
  };

  // ---- roads: every quarter is linked to its core ---------------------------------
  const roadTiles = (s, city) => {
    const r = G.roadsState ? G.roadsState(s) : null;
    if (!r || !G.ROADS) return false;
    let changed = false;
    const T = G.ROADS.T[Q.road];
    const put = (x, y) => {
      const i = y * s.map + x;
      if ((r.lvl[i] || 0) < Q.road) { r.lvl[i] = Q.road; changed = true; }
      if ((r.wear[i] || 0) < T) r.wear[i] = T;
      r.used[i] = s.time;
    };
    let any = false;
    for (const q of city.quarters || []) if (q.built) { put(q.x, q.y); any = true; }
    if (any) put(city.x, city.y);
    if (changed && G.roadsDirty) G.roadsDirty(s);
    return changed;
  };
  G.qtrRoads = roadTiles;

  // ---- completion ---------------------------------------------------------------
  const complete = (s, city, q) => {
    q.built = true; delete q.start; delete q.end; delete q.cost; delete q.o;
    bump(city);
    roadTiles(s, city);
    if (G.roadsFlush) G.roadsFlush(s);
    if (city.owner === 'p') G.log(s, 'p', `${TYPES[q.type].icon} ${city.name} has grown: a new ${TYPES[q.type].name.toLowerCase()} at (${q.x}, ${q.y}).`, 'good');
  };
  G.stepHooks.push(s => {
    if (!s.qtrNext || s.time < s.qtrNext) return;
    for (const c of Object.values(s.cities)) {
      if (c.outerAt && c.outerAt <= s.time) { c.outerAt = 0; c.outerWall = 1; if (c.owner === 'p') G.log(s, 'p', `🧱 Outer walls now ring the quarters of ${c.name}.`, 'good'); }
      for (const q of c.quarters || []) if (!q.built && q.end <= s.time) complete(s, c, q);
    }
    scheduleNext(s);
  });

  // ---- yields --------------------------------------------------------------------
  const prodOf = (b, g, L) => { const d = DATA.buildings[b]; return d && d.prod && d.prod[g] && L > 0 ? d.prod[g] * L * Math.pow(1.12, L - 1) : 0; };
  const waterAround = (s, x, y) => { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && G.isWater(G.tileAt(s, x + dx, y + dy))) n++; return n; };
  // per-minute raw goods of one quarter (0 while building or burnt); eff = the city's worker efficiency
  G.qtrYield = (s, city, q, eff = 1) => {
    const out = {};
    if (!live(s, q)) return out;
    const def = TYPES[q.type], t = G.tileAt(s, q.x, q.y);
    if (!def || !t) return out;
    const th = G.lvl(city, 'townhall'), site = G.site(s, city), sc = 1 + Q.flatTh * th;
    const noSite = g => G.mod(s, city.owner, city, g) / (site[g] || 1);
    if (def.goods) for (const [g, o] of Object.entries(def.goods)) {
      const dep = t.deposit === g;
      let f = Math.max(ty(t)[g] || 0, dep ? 0.8 : 0) * (dep ? Q.depYield : 1);
      if (g === 'grain' && G.riverSet(s).has(t.y * s.map + t.x)) f *= 1.15;
      const v = (o.flat * sc + Q.share * prodOf(o.b, g, G.lvl(city, o.b))) * f * eff * noSite(g);
      if (v > 1e-6) out[g] = v;
    }
    if (def.fish) {
      const w = Math.min(5, waterAround(s, q.x, q.y)), hb = G.lvl(city, 'harbor');
      const v = ((6 + 2 * w) * sc + 0.25 * (hb ? 5 * hb * Math.pow(1.12, hb - 1) * Math.min(4, w) / 2 : 0)) * eff * noSite('grain') * G.mod(s, city.owner, city, 'fishing');
      if (v > 1e-6) out.grain = (out.grain || 0) + v;
    }
    return out;
  };
  const QLAST = new Map();
  G.econHooks.push((s, city, raw, eff) => {
    const qs = city.quarters;
    if (!qs || !qs.length) return;
    let tot = null;
    for (const q of qs) {
      if (!q.built) continue;
      const y = G.qtrYield(s, city, q, eff);
      for (const g in y) { raw[g] = (raw[g] || 0) + y[g]; (tot = tot || {})[g] = (tot[g] || 0) + y[g]; }
    }
    if (tot) QLAST.set(city.id, tot); else QLAST.delete(city.id);
  });
  // the ledger: our share of 'Other sources' gets its own line
  const baseEcon = G.econ;
  G.econ = (s, city, away) => {
    const e = baseEcon(s, city, away);
    const mine = city.quarters && city.quarters.length ? QLAST.get(city.id) : null;
    if (mine && e.rawParts) for (const g in mine) {
      const parts = e.rawParts[g];
      if (!parts) continue;
      const o = parts.find(p => p.label === 'Other sources');
      if (!o) continue;
      const v = Math.min(o.amount, mine[g]);
      o.amount -= v;
      if (o.amount <= 1e-6) parts.splice(parts.indexOf(o), 1);
      parts.push({ label: 'City quarters', amount: v });
    }
    return e;
  };
  // housing
  const housingOf = (s, city) => {
    let h = 0;
    const th = G.lvl(city, 'townhall');
    for (const q of city.quarters || []) { const d = TYPES[q.type]; if (d && d.housing && live(s, q)) h += d.housing[0] + d.housing[1] * th; }
    return h;
  };
  const basePopCap = G.popCap;
  G.popCap = (s, city) => {
    const v = basePopCap(s, city);
    if (!city.quarters || !city.quarters.length) return v;
    const h = housingOf(s, city);
    return h ? Math.round(v + h * G.mod(s, city.owner, city, 'housing')) : v;
  };
  const countLive = (s, city, type) => { let n = 0; for (const q of city.quarters || []) if (q.type === type && live(s, q)) n++; return n; };
  // mills (workshops) and homes (taxes)
  G.modSources.push((s, owner, city, key) => {
    if (key !== 'refine' && key !== 'tax') return 1;
    if (!city || !city.quarters || !city.quarters.length) return 1;
    return key === 'refine' ? 1 + TYPES.mill.refine * Math.min(2, countLive(s, city, 'mill')) : 1 + TYPES.homes.tax * countLive(s, city, 'homes');
  });
  // forts
  const baseDefense = G.cityDefense;
  G.cityDefense = (s, city, wb) => {
    const d = baseDefense(s, city, wb);
    if (!city.quarters || !city.quarters.length) return d;
    const n = countLive(s, city, 'fort');
    if (n) d.mult *= 1 + TYPES.fort.def * Math.min(2, n);
    return d;
  };
  // the site: a quarter on a deposit works it fully (the whole city's output of that good)
  const baseSite = G.site;
  G.site = (s, city) => {
    const b = baseSite(s, city);
    const qr = city.qrev || 0;
    if (b._q === qr) return b;
    if (b._b) Object.assign(b, b._b);
    const orig = {};
    for (const q of city.quarters || []) {
      if (!live(s, q)) continue;
      const d = TYPES[q.type], t = G.tileAt(s, q.x, q.y);
      if (!d || !d.dep || !t || !t.deposit || !d.dep.includes(t.deposit) || orig[t.deposit] !== undefined) continue;
      const g = t.deposit;
      if (typeof b[g] !== 'number') continue;
      orig[g] = b[g];
      b[g] = Math.min(2.2, b[g] * Q.depSite);
    }
    b._b = Object.keys(orig).length ? orig : undefined;
    b._q = qr;
    return b;
  };
  G.qtrDepositsWorked = (s, city) => { const b = G.site(s, city); return b._b ? Object.keys(b._b) : []; };
  // higher max levels for the matching buildings
  const maxBonus = (s, city, type) => {
    const qs = city.quarters;
    if (!qs || !qs.length) return 0;
    let n = 0;
    for (const q of qs) { const d = TYPES[q.type]; if (d && d.max && d.max[type] && q.built) n += d.max[type]; }
    return Math.min(Q.maxCap, n * Q.maxBonus);
  };
  G.qtrMaxBonus = maxBonus;
  const baseStatus = G.buildStatus;
  G.buildStatus = (s, city, type) => {
    const bonus = city.quarters && city.quarters.length && (type === 'lumber' || type === 'mine' || type === 'quarry' || type === 'harbor') ? maxBonus(s, city, type) : 0;
    if (!bonus) return baseStatus(s, city, type);
    const b = DATA.buildings[type];
    b.max += bonus;
    try { return baseStatus(s, city, type); } finally { b.max -= bonus; }
  };
  // ley: an arcane quarter on a node taps it at full strength, and claims it from any nearer core
  const arcaneNode = (s, n) => {
    const t = G.tileAt(s, n.x, n.y);
    if (!t || !t.quarter) return null;
    const h = G.qtrAt(s, n.x, n.y);
    return h && h.city && h.q.type === 'arcane' && live(s, h.q) ? h.city : null;
  };
  if (G.nodeTapper) {
    const baseTap = G.nodeTapper;
    G.nodeTapper = (s, node) => arcaneNode(s, node) || baseTap(s, node);
  }
  if (G.leyPower) {
    const baseLey = G.leyPower;
    G.leyPower = (s, city) => {
      const v = baseLey(s, city);
      const qs = city.quarters;
      if (!qs || !qs.length || !s.ley) return v;
      let add = 0;
      for (const q of qs) {
        if (q.type !== 'arcane' || !live(s, q)) continue;
        const at = leyAt(s, q.x, q.y);
        if (!at) continue;
        if (at.line) { add += 0.5; continue; }
        const n = at.node, d = Math.hypot(n.x - city.x, n.y - city.y), reach = G.cityReach(s, city);
        const got = d <= reach + 0.5 ? (d < 0.5 ? 2 : Math.max(0.35, 1 - d / (reach + 1.5))) : 0;
        add += n.power * (2 - got);
      }
      return add ? Math.round((v + add) * 100) / 100 : v;
    };
  }

  // ---- territory ---------------------------------------------------------------
  // a quarter is its city's land, and so is the ground right beside it that no core reaches
  const baseLandOwner = G.landOwner || (() => null);
  G.landOwner = (s, x, y) => {
    const t = G.tileAt(s, x, y);
    if (t && t.quarter) { const h = G.qtrAt(s, x, y); if (h && h.city) return h.city.owner; }
    const own = baseLandOwner(s, x, y);
    if (own) return own;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const u = G.tileAt(s, x + dx, y + dy);
      if (u && u.quarter && s.cities[u.quarter]) return s.cities[u.quarter].owner;
    }
    return null;
  };
  // no rival city, camp or settler on a quarter: engine.js G.freeTile, the settle checks and the AI's site search skip tile.quarter

  // ---- raids on the quarters: mission 'burn' --------------------------------------
  const baseSend = G.sendArmy;
  G.sendArmy = (s, fromId, x, y, type, units, cargo) => {
    const city = s.cities[fromId];
    const t = G.tileAt(s, x, y);
    if (city && t && t.quarter && !t.city) {
      const h = G.qtrAt(s, x, y);
      const foe = h && h.city && h.city.owner !== city.owner ? h.city : null;
      if (type === 'settle') return 'The tile is occupied';
      if (foe && (type === 'raid' || type === 'attack')) type = 'burn';
      if (type === 'burn') {
        if (!foe) return 'No enemy quarter there';
        if (!h.q.built) return 'Nothing stands there yet';
        if (G.canAttack) { const e = G.canAttack(s, city.owner, G.tileAt(s, foe.x, foe.y)); if (e) return e; }
        if (units && (units.settlers || units.herald)) { units = { ...units }; delete units.settlers; delete units.herald; }
      }
    } else if (type === 'burn') return 'No enemy quarter there';
    return baseSend(s, fromId, x, y, type, units, cargo);
  };
  const lootFrom = (s, city, cap) => {
    const loot = {};
    if (!(cap > 0)) return loot;
    const e = G.econLean(s, city), raw = Object.keys(DATA.goods).filter(g => DATA.goods[g].raw);
    let left = cap;
    for (const g of raw) {
      const can = Math.max(0, ((city.res[g] || 0) - e.protect) * 0.25);
      const take = Math.floor(Math.min(can, left / raw.length * 1.5, left));
      if (take > 0) { city.res[g] -= take; loot[g] = take; left -= take; }
    }
    return loot;
  };
  G.qtrDefenders = (s, city, q) => {
    const share = q.type === 'fort' ? Q.fortGarrison : Q.garrison, def = {};
    for (const [u, n] of Object.entries(city.units || {})) { if (u === 'hero' || !(n > 0)) continue; const k = Math.round(n * share); if (k > 0) def[u] = k; }
    const wall = city.outerWall ? G.cityDefense(s, city).mult : 1;
    return { units: def, mult: wall * (q.type === 'fort' ? 1.25 : 1), flat: Q.militia + 2 * G.lvl(city, 'townhall'), walled: !!city.outerWall };
  };
  G.moveHandlers.burn = (s, m) => {
    const h = G.qtrAt(s, m.x, m.y), me = s.empires[m.owner], home = s.cities[m.from];
    const city = h && h.city;
    if (!city || city.owner === m.owner || !h.q.built) { G.sendHome(s, m, m.units); return; }
    const q = h.q, def = G.qtrDefenders(s, city, q), defEmp = s.empires[city.owner];
    for (const hk of G.hostileHooks) hk(s, m.owner, city.owner, 'raid');
    const edge = G.armyEdge(s, m.owner, home, m.units);
    const gar = G.garrisonEdge(s, city.owner, def.units, def.mult, def.walled ? 'Outer walls' : 'Fort');
    const r = G.battle(s, m.owner, m.units, edge.mult, city.owner, def.units, def.walled || q.type === 'fort' ? gar.mult : 1, def.flat,
      { mode: 'raid', x: m.x, y: m.y, path: m.path, naval: m.naval, labels: [...edge.labels, ...(def.walled || q.type === 'fort' ? gar.labels : [])] });
    for (const u in def.units) city.units[u] = Math.max(0, (city.units[u] || 0) - (def.units[u] - (r.defLeft[u] || 0)));
    let loot = {}, extra;
    const qn = TYPES[q.type].name.toLowerCase();
    if (r.win) {
      q.burnt = s.time + Q.burnMins * 60 * paceT(s);
      bump(city);
      city.loyalty = Math.max(0, (city.loyalty ?? 100) - Q.loyalty);
      if (G.unitsCount(r.attLeft)) loot = lootFrom(s, city, G.carryOf(s, m.owner, r.attLeft));
      extra = `The ${qn} of ${city.name} at (${q.x}, ${q.y}) was put to the torch: it yields nothing for ${Q.burnMins} minutes unless repaired. Loyalty −${Q.loyalty}.`;
      if (G.unitsCount(def.units) > 0) me.wins = (me.wins || 0) + 1;
    } else {
      extra = `The guard of the ${qn} drove the raiders off.`;
      defEmp.wins = (defEmp.wins || 0) + (G.unitsCount(m.units) ? 1 : 0);
    }
    city.lastRaided = s.time;
    for (const hk of G.battleHooks) hk(s, { m, r, site: 'quarter', defOwner: city.owner, city, defHad: def.units });
    const pv = m.owner === 'p' ? r.win : !r.win;
    G.report(s, [m.owner, city.owner], `Raid on a quarter of ${city.name}: ${me.name} ${r.win ? 'burned it' : 'was repelled'}`, pv ? 'win' : 'loss',
      { att: me.name, def: defEmp.name, A: r.A, D: r.D, attSent: m.units, attLost: r.attLost, defHad: def.units, defLost: r.defLost, loot, extra, tactics: r.tactics });
    if (city.owner === 'p') G.log(s, 'p', `🔥 Raiders of ${me.name} ${r.win ? 'burned' : 'were beaten off at'} the ${qn} of ${city.name}.`, r.win ? 'bad' : 'good');
    G.sendHome(s, m, r.attLeft, loot);
  };

  // ---- choosing a quarter (AI, governors, migration) ------------------------------
  // value per minute, in gold-ish terms; R = the realm view (council.js) or null
  const val = g => (DATA.goods[g] && DATA.goods[g].value) || 1;
  G.qtrValue = (s, city, x, y, type, R, e) => {
    const def = TYPES[type], t = G.tileAt(s, x, y);
    if (!def || !t || !def.fits(s, t)) return -1;
    e = e || G.econLean(s, city);
    const need = g => {
      const x2 = R && R.goods && R.goods[g];
      if (x2) return 1 + 2 * (x2.short || 0) - (x2.glut ? 0.5 : 0);
      return (city.res[g] || 0) < e.cap * 0.3 || (e.net[g] || 0) < 0 ? 1.6 : (city.res[g] || 0) > e.cap * 0.85 ? 0.5 : 1;
    };
    const fake = { x, y, type, built: true };
    let v = 0;
    const y0 = G.qtrYield(s, city, fake, e.eff);
    for (const g in y0) v += y0[g] * val(g) * need(g);
    if (def.dep && t.deposit && def.dep.includes(t.deposit) && !G.qtrDepositsWorked(s, city).includes(t.deposit)) v += (e.raw[t.deposit] || 0) * (Q.depSite - 1) * val(t.deposit) * need(t.deposit);
    const th = G.lvl(city, 'townhall');
    if (def.housing) v += (def.housing[0] + def.housing[1] * th) * 0.12 * (city.pop >= e.civCap * 0.85 ? 2 : 0.6);
    if (def.tax) v += e.tax * def.tax;
    if (def.refine) v += e.refiners.reduce((a, r) => a + Object.entries(r.out).reduce((b, [g, n]) => b + n * val(g), 0), 0) * def.refine * (countLive(s, city, 'mill') >= 2 ? 0 : 1);
    if (def.ley) { const at = leyAt(s, x, y); v += at ? (at.node ? at.node.power * 1.6 : 0.5) * 6 : 0; }
    if (def.max) for (const b of Object.keys(def.max)) if (G.lvl(city, b) >= DATA.buildings[b].max - 2) v += 4;
    if (type === 'fort') v += 2 + (city.lastHit && s.time - city.lastHit.t < 1800 ? 12 : 0) + (city.lastRaided && s.time - city.lastRaided < 1800 ? 8 : 0) + (countLive(s, city, 'fort') ? -6 : 0);
    if (type === 'homes') v *= 0.9;
    return v;
  };
  // the best (tile, type) for this city now, or null
  G.qtrPick = (s, city, R) => {
    const e = G.econLean(s, city);
    let best = null;
    for (const o of G.qtrOptions(s, city)) for (const type of o.types) {
      const v = G.qtrValue(s, city, o.x, o.y, type, R, e);
      if (v > 0 && (!best || v > best.v)) best = { x: o.x, y: o.y, type, v };
    }
    return best;
  };
  // try to grow one quarter: realm-aware for governors, plain for AI; reserve = stores kept beyond the cost
  const tryGrow = (s, city, R, reserve) => {
    const qs = list(city);
    if (qs.some(q => !q.built) || qs.length >= G.qtrSlots(s, city)) return null;
    const cost = G.qtrCost(s, city, qs.length);
    if (!G.canAfford(s, city, cost, reserve)) return null;
    const p = G.qtrPick(s, city, R);
    if (!p) return null;
    return G.foundQuarter(s, city.id, p.x, p.y, p.type) ? null : p;
  };
  G.qtrGrow = tryGrow;
  // AI realms: the same rules, a look every minute and a half
  G.aiHooks.push((s, emp, dtMin) => {
    emp.qClock = (emp.qClock || 0) + dtMin;
    if (emp.qClock < Q.ai.every * paceT(s)) return;
    emp.qClock = 0;
    for (const c of G.citiesOf(s, emp.id)) {
      if (!c.quarters && G.qtrSlots(s, c) === 0) continue;
      if (roll(c.id, Math.floor(s.time / 60)) < Q.ai.chance) tryGrow(s, c, null, Q.ai.reserve);
    }
  });
  // governors (council.js): after the building pass, a governed city with a free slot claims the best tile
  if (G.councilGovern) {
    const baseGovern = G.councilGovern;
    G.councilGovern = s => {
      baseGovern(s);
      const gov = s.council && s.council.gov;
      if (!gov) return;
      let R = null;
      for (const [cid, g] of Object.entries(gov)) {
        const city = s.cities[cid];
        if (!city || !g.on || city.owner !== 'p' || g.quarters === false) continue;
        if (G.qtrSlots(s, city) <= list(city).length) continue;
        if (R === null) R = g.realm !== false && G.realmEcon && G.citiesOf(s, 'p').length >= 2 ? G.realmEcon(s, 'p') : false;
        const p = tryGrow(s, city, R || null, 1 + (g.reserve || 0) / 1000);
        if (p && g.log) { g.log.unshift({ t: s.time, text: `Queued a new quarter: ${TYPES[p.type].name.toLowerCase()} at (${p.x}, ${p.y})` }); if (g.log.length > 30) g.log.length = 30; }
      }
    };
  }

  // ---- free cities: quarters by size and age, no cost ---------------------------
  const minorSlots = (s, mi) => clamp(Math.floor(mi.size / 2 + s.time / (3600 * paceT(s)) / 2.5), 0, 1 + mi.size);
  const minorType = (s, mi, t) => {
    const fits = Q.order.filter(k => k !== 'arcane' && k !== 'mill' && TYPES[k].fits(s, t));
    const pref = mi.kind === 'mercenary' ? ['fort', 'mine'] : mi.kind === 'maritime' ? ['docks', 'farm'] : mi.kind === 'mage' && TYPES.arcane.fits(s, t) ? ['arcane'] : ['farm', 'lumber', 'mine', 'docks'];
    return pref.find(k => k === 'arcane' || fits.includes(k)) || fits.find(k => k !== 'homes' && k !== 'fort') || 'homes';
  };
  const growMinor = (s, mi) => {
    const qs = mi.quarters || (mi.quarters = []);
    if (qs.length >= minorSlots(s, mi)) return false;
    const opts = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const x = mi.x + dx, y = mi.y + dy;
      if (tileErr(s, mi, x, y, mi) || baseLandOwner(s, x, y)) continue;
      opts.push(G.tileAt(s, x, y));
    }
    if (!opts.length) return false;
    const t = opts[Math.floor(roll(mi.id, qs.length) * opts.length)];
    qs.push({ x: t.x, y: t.y, type: minorType(s, mi, t), built: true });
    t.quarter = mi.id;
    return true;
  };
  G.qtrGrowMinor = growMinor;
  if (G.minorDefense) {
    const baseMD = G.minorDefense;
    G.minorDefense = (s, mi) => {
      const d = baseMD(s, mi);
      const qs = mi.quarters || [];
      return qs.length ? { ...d, flat: d.flat + 4 * qs.length, mult: d.mult * (qs.some(q => q.type === 'fort') ? 1.05 : 1) } : d;
    };
  }

  // ---- the slow tick: index, roads, burnt quarters, captured cities, free cities -----
  G.slowHooks.push((s, dtMin) => {
    syncIfStale(s);
    let roadsChanged = false;
    for (const c of Object.values(s.cities)) {
      const qs = c.quarters;
      if (!qs || !qs.length) continue;
      for (let i = qs.length - 1; i >= 0; i--) {
        const q = qs[i];
        if (q.burnt && q.burnt <= s.time) { q.burnt = 0; bump(c); }
        if (!q.built && q.o && q.o !== c.owner) { qs.splice(i, 1); const t = G.tileAt(s, q.x, q.y); if (t && t.quarter === c.id) t.quarter = null; bump(c); }
      }
      if (roadTiles(s, c)) roadsChanged = true;
    }
    if (roadsChanged && G.roadsFlush) G.roadsFlush(s);
    if (s.minors) {
      s.qtrMinorClock = (s.qtrMinorClock || 0) + dtMin;
      if (s.qtrMinorClock >= Q.minor.every * paceT(s)) {
        s.qtrMinorClock = 0;
        for (const mi of Object.values(s.minors)) if (roll(mi.id, Math.floor(s.time / 60)) < 0.5) growMinor(s, mi);
      }
    }
  });

  // ---- new games and old saves ------------------------------------------------------
  G.newGameHooks.push(s => { s.qtr = { v: 1 }; });
  // an old save: every city gets the quarters its size has earned (free, built), by the same picker
  const autoAssign = (s, city) => {
    const qs = list(city), n = G.qtrSlots(s, city);
    let guard = 0;
    while (qs.length < n && guard++ < 10) {
      const p = G.qtrPick(s, city, null);
      if (!p) break;
      qs.push({ x: p.x, y: p.y, type: p.type, built: true });
      G.tileAt(s, p.x, p.y).quarter = city.id;
    }
    bump(city);
    roadTiles(s, city);
  };
  G.qtrAutoAssign = autoAssign;
  const assignOld = s => {
    const cities = Object.values(s.cities).sort((a, b) => (a.founded || 0) - (b.founded || 0));
    for (const c of cities) if (!Array.isArray(c.quarters)) autoAssign(s, c);
    if (s.minors) for (const mi of Object.values(s.minors)) if (!mi.quarters) { let k = 0; while (growMinor(s, mi) && k++ < 8); }
    if (G.roadsFlush) G.roadsFlush(s);
    delete s.qtr.todo;
  };
  G.slowHooks.unshift(s => {
    if (!s.qtr || !s.qtr.todo) return;
    try { assignOld(s); } catch (e) {
      // a save we cannot read quarters into still plays, without them
      if (typeof console !== 'undefined') console.error('quarters: old-save assignment failed', e);
      for (const c of Object.values(s.cities)) list(c);
      delete s.qtr.todo;
    }
  });
  const baseMigrate = G.migrate;
  G.migrate = s => {
    const o = baseMigrate(s) || s;
    try {
      if (!o.qtr) {
        o.qtr = { v: 1 };
        sync(o);
        o.qtr.todo = 1;
        try { assignOld(o); } catch (e) { /* a module wrapped after us has not defaulted its state yet: the first slow tick finishes */ }
      }
      if (!o.qtr.todo) for (const c of Object.values(o.cities)) list(c);
      sync(o);
      scheduleNext(o);
    } catch (e) { if (typeof console !== 'undefined') console.error('quarters migrate', e); }
    return o;
  };
})();
