// =====================================================================
//  Roads and bridges: the land remembers where people walk.
//  Every finished journey (caravans most, armies a little) wears its path
//  into the ground: Track → Road → Paved road (paving needs Logistics and
//  stone from the realm whose land it is). Unused roads fade a level at a
//  time. Roads make G.path cheaper (engine.js asks G.roadCosts); unbridged
//  river tiles cost a ford penalty. Realms bridge the fords their traffic
//  keeps wading (timber; stone with Arches & Vaults), and the player may
//  order a bridge from the tile panel. Roads serve everyone, foes included.
//  State: s.roads = { wear:{idx:n}, lvl:{idx:1..3}, used:{idx:t}, ford:{idx:{owner:n}}, br:{idx:bridge}, epoch, rev, clock }
// =====================================================================
'use strict';
(() => {
  const RD = G.ROADS = {
    T: [0, 4, 14, 40],                 // wear needed for each level
    F: [1, 0.8, 0.6, 0.45],            // edge-cost factor of each level (none, track, road, paved)
    names: ['No road', 'Track', 'Road', 'Paved road'],
    icons: ['', '🥾', '🛤️', '🧱'],
    w: { trade: 1, settle: 1, reinforce: 0.4, return: 0.3, scout: 0 },   // wear per tile and journey (others 0.25)
    wOther: 0.25,
    pave: { tech: 'logistics', stone: 8 },
    ford: 1.5,                         // extra march cost of wading an unbridged river tile
    idle: 90,                          // game-minutes (× pace) without traffic before a level fades
    bridge: {
      wood: { cost: { timber: 120 }, min: 6, name: 'Wooden bridge' },
      stone: { cost: { stone: 160, timber: 40 }, min: 10, tech: 'arches', name: 'Stone bridge' },
      orderGold: { wood: 40, stone: 80 },   // a commissioned bridge also pays the builders' wages
      fords: 6,                        // a realm's fording traffic (in caravan-trips) that calls for a bridge
      aiFords: 3,                      // AI realms commission one on a busy crossing sooner
      reach: 10,                       // the funding city must lie within this many tiles
    },
  };
  const paceT = s => G.pace(s).time;
  const R = G.roadsState = s => {
    let r = s.roads;
    if (!r) r = s.roads = {};
    if (!r.wear) { r.wear = {}; r.lvl = r.lvl || {}; r.used = r.used || {}; }
    r.lvl = r.lvl || {}; r.used = r.used || {}; r.ford = r.ford || {}; r.br = r.br || {};
    r.epoch = r.epoch || 0; r.rev = r.rev || 0; r.clock = r.clock || 0;
    return r;
  };
  G.newGameHooks.push(s => { R(s); });
  const N = s => s.map;
  const xyOf = (s, i) => { const x = i % s.map; return [x, (i - x) / s.map]; };
  G.roadLevel = (s, x, y) => (s.roads && s.roads.lvl && s.roads.lvl[y * s.map + x]) || 0;
  G.bridgeAt = (s, x, y) => (s.roads && s.roads.br && s.roads.br[y * s.map + x]) || null;
  const bridged = (r, i) => { const b = r.br[i]; return !!(b && b.d); };
  G.isRiver = (s, x, y) => G.riverSet(s).has(y * s.map + x);
  // whose land a tile lies in: the nearest city whose reach covers it (matches the map's territory blobs)
  G.landOwner = (s, x, y) => {
    let best = null, bd = Infinity;
    for (const c of G.allCities(s)) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= G.cityReach(s, c) && d < bd) { bd = d; best = c; }
    }
    return best ? best.owner : null;
  };
  const nearestCity = (s, owner, x, y, maxD, need) => {
    let best = null, bd = Infinity;
    const lr = G.landRegions(s), ti = y * s.map + x;
    for (const c of G.citiesOf(s, owner)) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > maxD || d >= bd || lr[c.y * s.map + c.x] !== lr[ti]) continue;
      if (need && !G.canAfford(s, c, need)) continue;
      bd = d; best = c;
    }
    return best;
  };

  // ---- path costs (engine.js G.path) -----------------------------------
  // per-tile factors and ford penalties, rebuilt only when the network changes (epoch) or a city is founded/razed
  const COSTS = new WeakMap();
  G.roadCosts = s => {
    const r = s.roads;
    const rivers = s.rivers || [];
    if ((!r || !r.lvl) && !rivers.length) return null;
    const ep = r ? r.epoch || 0 : 0;
    let nc = 0; for (const k in s.cities) nc++;
    let c = COSTS.get(s.tiles);
    if (c && c.ep === ep && c.nc === nc && c.rv === rivers) return c.v;
    const NN = s.map * s.map;
    let fac = null, hm = 1;
    if (r && r.lvl) for (const k in r.lvl) {
      const L = r.lvl[k]; if (!L) continue;
      if (!fac) fac = new Float32Array(NN).fill(1);
      fac[k] = RD.F[L]; if (RD.F[L] < hm) hm = RD.F[L];
    }
    let ford = null;
    if (rivers.length) {
      ford = new Float32Array(NN);
      for (const i of G.riverSet(s)) {
        const t = s.tiles[i];
        if (!t || G.isWater(t) || t.city || (r && r.br && r.br[i] && r.br[i].d)) continue;
        ford[i] = RD.ford;
      }
    }
    const v = (fac || ford) ? { fac, ford, hm } : null;
    COSTS.set(s.tiles, { ep, nc, rv: rivers, v });
    return v;
  };
  // the network changed: new costs for every path (the memo in engine.js is dropped with the other path caches)
  const dirty = G.roadsDirty = s => { const r = R(s); r.dirtyAt = r.dirtyAt || s.time || 1; };
  G.roadsFlush = s => {
    const r = R(s);
    if (!r.dirtyAt) return false;
    r.dirtyAt = 0; r.epoch++; r.rev++;
    G.clearPaths(s);
    return true;
  };

  // ---- wear: every finished journey ------------------------------------
  const pathOf = (s, m) => {
    if (m.naval) return null;
    let p = m.path;
    if (!p || p.length < 2) {
      if (m.fx === undefined || m.fy === undefined) return null;
      const q = G.path(s, { x: m.fx, y: m.fy }, { x: m.x, y: m.y }, false);
      p = q && q.path;
    }
    if (!p || p.length < 2) return null;
    for (let k = 1; k < p.length; k++) if (Math.abs(p[k][0] - p[k - 1][0]) > 1 || Math.abs(p[k][1] - p[k - 1][1]) > 1) return null;   // fliers leave no trace
    return p;
  };
  // try to raise a tile toward the level its wear has earned (paving needs the tech and stone of the land's realm)
  const raise = (s, r, i) => {
    const w = r.wear[i] || 0, L = r.lvl[i] || 0;
    let to = L;
    while (to < 3 && w >= RD.T[to + 1]) to++;
    if (to === 3 && L < 3) {
      const [x, y] = xyOf(s, i), own = G.landOwner(s, x, y);
      const city = own && G.hasTech && G.hasTech(s, own, RD.pave.tech) ? nearestCity(s, own, x, y, 12, { stone: RD.pave.stone }) : null;
      if (city) G.pay(s, city, { stone: RD.pave.stone }); else to = 2;
    }
    if (to > L) { r.lvl[i] = to; return true; }
    return false;
  };
  G.roadsWear = (s, m, weight) => {
    if (!m || !s.empires[m.owner]) return 0;
    const w = weight !== undefined ? weight : (RD.w[m.type] !== undefined ? RD.w[m.type] : RD.wOther);
    if (!(w > 0)) return 0;
    const p = pathOf(s, m);
    if (!p) return 0;
    const r = R(s), Nn = s.map, rs = G.riverSet(s), cap = RD.T[3] + 10;
    let changed = 0;
    for (let k = 0; k < p.length; k++) {
      const i = p[k][1] * Nn + p[k][0], t = s.tiles[i];
      if (!t || G.isWater(t)) continue;
      r.wear[i] = Math.min(cap, (r.wear[i] || 0) + w);
      r.used[i] = s.time;
      if (r.wear[i] >= RD.T[(r.lvl[i] || 0) + 1] && raise(s, r, i)) changed++;
      if (k > 0 && rs.has(i) && !t.city && !r.br[i]) {
        const f = r.ford[i] || (r.ford[i] = {});
        f[m.owner] = (f[m.owner] || 0) + w;
        if (f[m.owner] >= RD.bridge.fords) G.startBridge(s, m.owner, i, true);
      }
    }
    if (changed) dirty(s);
    return changed;
  };

  // ---- bridges ------------------------------------------------------------
  G.bridgeKind = (s, owner) => (G.hasTech && G.hasTech(s, owner, RD.bridge.stone.tech) ? 'stone' : 'wood');
  const bridgeCost = (kind, ordered) => {
    const c = { ...RD.bridge[kind].cost };
    if (ordered) c.gold = RD.bridge.orderGold[kind];
    return c;
  };
  // can `owner` bridge tile (x, y)? → { ok, err, kind, cost, dur, city }
  G.bridgeQuote = (s, owner, x, y, opts = {}) => {
    const t = G.tileAt(s, x, y), r = R(s), i = y * s.map + x;
    const out = { ok: false, err: '', kind: null, cost: null, dur: 0, city: null };
    if (!t || G.isWater(t)) { out.err = 'Not on land'; return out; }
    if (!G.riverSet(s).has(i)) { out.err = 'No river here'; return out; }
    if (t.city) { out.err = 'The city already spans the river'; return out; }
    if (r.br[i]) { out.err = r.br[i].d ? 'A bridge already stands here' : 'A bridge is already being built here'; return out; }
    const own = G.landOwner(s, x, y);
    if (own && own !== owner) { out.err = `This is ${s.empires[own] ? s.empires[own].name : 'another realm'}'s land`; return out; }
    if (!opts.auto && !own) {   // neutral land: only close to one's own borders
      const near = G.citiesOf(s, owner).some(c => Math.hypot(c.x - x, c.y - y) <= G.cityReach(s, c) + 2.5);
      if (!near) { out.err = 'Too far from your lands (bridges are built within your territory or just beyond it)'; return out; }
    }
    let kind = opts.kind || G.bridgeKind(s, owner);
    if (kind === 'stone' && !(G.hasTech && G.hasTech(s, owner, RD.bridge.stone.tech))) kind = 'wood';
    out.kind = kind; out.cost = bridgeCost(kind, !opts.auto);
    out.dur = Math.round(RD.bridge[kind].min * 60 * paceT(s));
    const any = nearestCity(s, owner, x, y, RD.bridge.reach);
    if (!any) { out.err = `No city of yours within ${RD.bridge.reach} tiles over land`; return out; }
    out.city = nearestCity(s, owner, x, y, RD.bridge.reach, out.cost) || any;
    if (!G.canAfford(s, out.city, out.cost)) { out.err = `${out.city.name} lacks the materials`; return out; }
    out.ok = true;
    return out;
  };
  G.startBridge = (s, owner, i, auto, kind) => {
    const [x, y] = xyOf(s, i);
    const q = G.bridgeQuote(s, owner, x, y, { auto, kind });
    if (!q.ok) return q.err;
    const r = R(s);
    G.pay(s, q.city, q.cost);
    r.br[i] = { o: owner, k: q.kind, t0: s.time, at: s.time + q.dur, c: q.city.id };
    delete r.ford[i];
    r.rev++;
    if (owner === 'p') G.log(s, 'p', `🌉 Builders from ${q.city.name} start a ${RD.bridge[q.kind].name.toLowerCase()} at (${x}, ${y})${auto ? ', where your caravans keep wading the river' : ''}.`, 'info');
    return null;
  };
  G.orderBridge = (s, owner, x, y, kind) => G.startBridge(s, owner, y * s.map + x, false, kind);
  G.destroyBridge = (s, i, why) => {
    const r = R(s), b = r.br[i];
    if (!b) return false;
    delete r.br[i];
    r.rev++;
    if (b.d) dirty(s);
    const [x, y] = xyOf(s, i);
    if (b.o === 'p') G.log(s, 'p', `🌉 The ${b.k === 'stone' ? 'stone' : 'wooden'} bridge at (${x}, ${y}) is gone: ${why}.`, 'bad');
    return true;
  };
  // the river tiles before and after a tile (for drawing a bridge on the river's curve), and its direction
  const RNB = new WeakMap();
  G.riverNeighbours = (s, i) => {
    let m = RNB.get(s.rivers || []);
    if (!m) {
      m = new Map();
      for (const rv of s.rivers || []) for (let k = 0; k < rv.length; k++) if (!m.has(rv[k])) m.set(rv[k], [rv[Math.max(0, k - 1)], rv[Math.min(rv.length - 1, k + 1)]]);
      RNB.set(s.rivers || [], m);
    }
    return m.get(i) || null;
  };
  G.riverDir = (s, i) => {
    const nb = G.riverNeighbours(s, i);
    if (!nb) return [1, 0];
    const [ax, ay] = xyOf(s, nb[0]), [bx, by] = xyOf(s, nb[1]);
    return [bx - ax, by - ay];
  };

  // ---- the slow tick: bridges finish, roads fade, AI commissions bridges ----
  G.slowHooks.push((s, dtMin) => {
    const r = R(s);
    // bridges
    for (const k in r.br) {
      const b = r.br[k];
      if (!b.d && b.at <= s.time) {
        b.d = 1; r.rev++; dirty(s);
        const [x, y] = xyOf(s, +k);
        if (b.o === 'p') G.log(s, 'p', `🌉 The ${b.k === 'stone' ? 'stone' : 'wooden'} bridge at (${x}, ${y}) is finished: no more wading.`, 'good');
      } else if (b.d && b.up && b.up <= s.time) { delete b.up; r.rev++; }
      if (b.d && b.k === 'wood' && G.calamitiesAt) {
        const [x, y] = xyOf(s, +k);
        if (G.calamitiesAt(s, x, y).some(q => q.kind === 'flood')) G.destroyBridge(s, +k, 'the flood swept it away');
      }
    }
    r.clock += dtMin;
    if (r.clock >= 1) {
      const step = r.clock; r.clock = 0;
      const idle = RD.idle * 60 * paceT(s), stale = 10 * 60 * paceT(s);
      for (const k in r.wear) {
        const last = r.used[k] || 0;
        if (s.time - last < stale) continue;
        const L = r.lvl[k] || 0;
        if (L > 0) {
          if (s.time - last >= idle) {
            if (L > 1) { r.lvl[k] = L - 1; r.wear[k] = RD.T[L - 1]; } else { delete r.lvl[k]; r.wear[k] = RD.T[1] * 0.5; }
            r.used[k] = s.time; dirty(s);
          }
        } else {
          r.wear[k] *= Math.pow(0.97, step);
          if (r.wear[k] < 0.3) { delete r.wear[k]; delete r.used[k]; }
        }
      }
      for (const k in r.ford) {
        if (s.time - (r.used[k] || 0) < stale) continue;
        const f = r.ford[k];
        for (const o in f) { f[o] *= Math.pow(0.97, step); if (f[o] < 0.3) delete f[o]; }
        if (!Object.keys(f).length) delete r.ford[k];
      }
      // AI realms commission bridges on their busiest crossings, and rebuild wooden bridges in stone once they can
      r.aiClock = (r.aiClock || 0) + step;
      if (r.aiClock >= 3) {
        r.aiClock = 0;
        const best = {};
        for (const k in r.ford) for (const o in r.ford[k]) {
          if (o === 'p' || r.ford[k][o] < RD.bridge.aiFords) continue;
          if (!best[o] || r.ford[k][o] > best[o][1]) best[o] = [+k, r.ford[k][o]];
        }
        for (const o in best) if (s.empires[o] && !s.empires[o].dead) G.startBridge(s, o, best[o][0], false);
        for (const k in r.br) {
          const b = r.br[k];
          if (!b.d || b.k !== 'wood' || b.up || b.o === 'p' || !s.empires[b.o] || G.bridgeKind(s, b.o) !== 'stone' || (r.lvl[k] || 0) < 2) continue;
          const [x, y] = xyOf(s, +k), c = nearestCity(s, b.o, x, y, RD.bridge.reach, RD.bridge.stone.cost);
          if (c) { G.pay(s, c, RD.bridge.stone.cost); b.k = 'stone'; b.up = s.time + Math.round(RD.bridge.stone.min * 60 * paceT(s)); r.rev++; }
        }
      }
    }
    G.roadsFlush(s);
  });
  // rebuild one's own wooden bridge in stone (the player, from the tile panel)
  G.upgradeBridge = (s, owner, x, y) => {
    const r = R(s), i = y * s.map + x, b = r.br[i];
    if (!b || !b.d) return 'No finished bridge here';
    if (b.k === 'stone') return 'Already a stone bridge';
    if (b.o !== owner) return 'Not your bridge';
    if (G.bridgeKind(s, owner) !== 'stone') return 'Needs Arches & Vaults';
    const cost = bridgeCost('stone', true), c = nearestCity(s, owner, x, y, RD.bridge.reach, cost);
    if (!c) return 'No city of yours within reach has ' + Object.entries(cost).map(([g, v]) => v + ' ' + (g === 'gold' ? 'gold' : DATA.goods[g].name.toLowerCase())).join(', ');
    G.pay(s, c, cost); b.k = 'stone'; b.up = s.time + Math.round(RD.bridge.stone.min * 60 * paceT(s)); r.rev++;
    return null;
  };

  // ---- arrivals wear the road (wrapped before intercept.js; trade routes wrap outside at their first step) ----
  // traderoutes.js re-wraps G.resolveMove at the first step and takes caravans bound for free cities before they reach
  // inner wrappers, so once the first step runs the wear moves to an outermost wrapper (our step hook runs after theirs)
  const wearSafe = (s, m) => { try { G.roadsWear(s, m); } catch (e) { if (typeof console !== 'undefined') console.error('roads wear', e); } };
  let outer = false;
  const innerResolve = G.resolveMove;
  G.resolveMove = (s, m) => { if (!outer) wearSafe(s, m); return innerResolve(s, m); };
  G.stepHooks.push(() => {
    if (outer) return;
    outer = true;
    const inner = G.resolveMove;
    G.resolveMove = (s, m) => { wearSafe(s, m); return inner(s, m); };
  });
  // an enemy winning a fight on a bridge burns it
  G.battleHooks.push((s, ctx) => {
    if (!ctx || !ctx.r || !ctx.r.win || !ctx.m || !s.roads || !s.roads.br) return;
    const i = ctx.m.y * s.map + ctx.m.x, b = s.roads.br[i];
    if (b && b.o !== ctx.m.owner) G.destroyBridge(s, i, `${s.empires[ctx.m.owner] ? s.empires[ctx.m.owner].name : 'the enemy'} burned it after the battle`);
  });
  // no "river crossing" penalty where every river tile of the approach is bridged
  const baseField = G.battlefield;
  G.battlefield = (s, x, y, path, naval) => {
    const f = baseField(s, x, y, path, naval);
    if (!f || !f.crossing || !s.roads || !s.roads.br) return f;
    const rs = G.riverSet(s), Nn = s.map, br = s.roads.br;
    const tiles = [y * Nn + x, ...(path || []).slice(1).slice(-3).map(([px, py]) => py * Nn + px)].filter(i => rs.has(i));
    if (tiles.length && tiles.every(i => br[i] && br[i].d)) { f.crossing = false; f.bridge = true; }
    return f;
  };
  // old saves: lazy defaults (G.migrate runs before any hook)
  const baseMigrate = G.migrate;
  G.migrate = s => { const o = baseMigrate(s); R(o); return o; };
  // the map's bake key: changes when anything visible on the network changes
  G.roadsRev = s => (s.roads ? (s.roads.rev || 0) : 0);
  G.roadInfo = (s, x, y) => {
    const r = R(s), i = y * s.map + x, L = r.lvl[i] || 0, w = r.wear[i] || 0;
    return { lvl: L, name: RD.names[L], wear: w, next: L < 3 ? RD.T[L + 1] : null, factor: RD.F[L], river: G.riverSet(s).has(i), bridge: r.br[i] || null,
      ford: r.ford[i] ? { ...r.ford[i] } : null, idleLeft: L ? Math.max(0, RD.idle * 60 * paceT(s) - (s.time - (r.used[i] || 0))) : 0 };
  };
})();
