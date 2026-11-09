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
    // march factor of each terrain off-road (the land has no marsh, desert or snow; lakes are impassable)
    terrain: { plains: 1, fertile: 1, forest: 1.35, hills: 1.5, mountain: 2.2 },
    cityF: 1,                          // a city's own tile: streets, whatever the ground
    // peoples at home in rough country (off-road factors that replace the terrain's for their marches)
    raceTerrain: { sylvan: { forest: 1 }, delver: { hills: 1.1, mountain: 1.5 }, grave: { hills: 1.2, mountain: 1.7 } },
    alt: { K: 5, minRegion: 40, stale: 12, maxPatch: 400 },   // A* landmarks per land region (see altUpdate: patch or rebuild)
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
  // the peoples' terrain perks, listed with their other perks (race picker, realm panel)
  const perkTxt = (r, txt) => { const d = DATA.races[r]; if (d && Array.isArray(d.perks) && !d.perks.includes(txt)) d.perks.push(txt); };
  perkTxt('sylvan', `Forest paths: march through forest as on open ground (others ×${RD.terrain.forest})`);
  perkTxt('grave', `Tireless dead: hills ×${RD.raceTerrain.grave.hills}, mountains ×${RD.raceTerrain.grave.mountain} (others ×${RD.terrain.hills} / ×${RD.terrain.mountain})`);
  perkTxt('delver', `Mountain roads: hills ×${RD.raceTerrain.delver.hills}, mountains ×${RD.raceTerrain.delver.mountain} (others ×${RD.terrain.hills} / ×${RD.terrain.mountain})`);
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
  // Every land tile has a march factor: its terrain's (RD.terrain), or its road level's when a road runs there
  // (a road overrides the terrain, so roads matter most through rough country). City tiles count as open ground.
  // Unbridged river tiles add a ford penalty. Rebuilt only when the network changes (epoch), a city is founded or
  // razed, the rivers change, or a spell reshapes the land (s.terrainRev / G.clearPaths).
  const COSTS = new WeakMap();
  const terrainF = t => { const f = RD.terrain[t.terrain]; return f !== undefined ? f : 1; };
  G.terrainFactor = (s, x, y) => { const t = G.tileAt(s, x, y); return !t || G.isWater(t) ? null : t.city ? RD.cityF : terrainF(t); };
  G.roadCosts = s => {
    const r = s.roads, rivers = s.rivers || [], tr = s.terrainRev || 0;
    const ep = r ? r.epoch || 0 : 0;
    let nc = 0; for (const k in s.cities) nc++;
    let c = COSTS.get(s.tiles);
    if (c && c.ep === ep && c.nc === nc && c.rv === rivers && c.tr === tr) return c.v;
    // stale costs mean stale memoised paths too (a city founded on hills, rivers changed): drop them
    // (after an epoch change roadsFlush already did; safe mid-search, G.path holds its own references)
    if (c) baseClear(s);
    const NN = s.map * s.map, lvl = r && r.lvl, fac = new Float32Array(NN);
    let hm = Infinity;
    for (let i = 0; i < NN; i++) {
      const t = s.tiles[i];
      if (!t || G.isWater(t)) { fac[i] = 1; continue; }
      const L = lvl ? lvl[i] || 0 : 0;
      const f = fac[i] = L ? RD.F[L] : t.city ? RD.cityF : terrainF(t);
      if (f < hm) hm = f;
    }
    if (hm === Infinity) hm = 1;
    let ford = null;
    if (rivers.length) {
      ford = new Float32Array(NN);
      for (const i of G.riverSet(s)) {
        const t = s.tiles[i];
        if (!t || G.isWater(t) || t.city || (r && r.br && r.br[i] && r.br[i].d)) continue;
        ford[i] = RD.ford;
      }
    }
    const v = { fac, ford, hm, heur: null };
    v.heur = goal => altHeur(s, v, goal);
    altUpdate(s, v);
    COSTS.set(s.tiles, { ep, nc, rv: rivers, tr, v });
    return v;
  };

  // ---- the A* heuristic: landmarks (ALT) per land region ---------------------
  // A plain octile heuristic must be scaled by the cheapest factor anywhere (one paved tile made every search
  // ~4x slower), and it knows nothing of hills. Instead a few landmarks per land region carry exact distances
  // over a lower-bound cost field `base` (≤ today's factors everywhere); |d_L(n) - d_L(goal)| is then an
  // admissible, consistent estimate, and A* stays exactly optimal (checked against Dijkstra in tests/roads.js).
  //   When tiles get cheaper (a fresh track, a paved road, a finished city on a mountain) `base` drops to match
  //   and the built tables are patched in place: a decrease-only Dijkstra seeded at those tiles (distances can
  //   only shrink, and only behind the changed tiles). Tiles that get dearer (roads fading) keep their old base:
  //   the estimate just loosens, and once that passes RD.alt.stale (or too many tiles changed at once) the
  //   tables are dropped and rebuilt lazily, region by region, on the next search there (5 Dijkstras over the
  //   region, ~2-3 ms on an 80x80 map).
  const LMS = new WeakMap();
  const altFresh = (s, v, old) => ({ base: new Float32Array(v.fac), tables: new Map(), builds: old ? old.builds : 0, patches: old ? old.patches : 0, ms: old ? old.ms : 0, NN: v.fac.length });
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const altUpdate = (s, v) => {
    let A = LMS.get(s.tiles);
    if (!A || A.NN !== v.fac.length) { A = altFresh(s, v, A); LMS.set(s.tiles, A); }
    const b = A.base, f = v.fac, cheaper = [];
    let loose = 0;
    for (let i = 0; i < f.length; i++) { const d = b[i] - f[i]; if (d > 0) cheaper.push(i); else if (d < 0) loose -= d; }
    if (loose > RD.alt.stale || cheaper.length > RD.alt.maxPatch) { A = altFresh(s, v, A); LMS.set(s.tiles, A); }
    else if (cheaper.length) {
      for (const i of cheaper) b[i] = f[i];
      if (A.tables.size) {
        const t0 = now(), water = G.waterMask(s);
        for (const T of A.tables.values()) if (T) for (const D of T) altPatch(s, b, water, D, cheaper);
        A.patches++; A.ms += now() - t0;
      }
    }
    v.alt = A;
  };
  // Dijkstra over the lower-bound field (land only, no squeezing between two water tiles) from a seeded heap
  const altRun = (s, b, water, D, hI, hF) => {
    const N = s.map;
    while (hI.length) {
      const u = hI[0], du = hF[0], li = hI.pop(), lf = hF.pop(), n = hI.length;
      if (n) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && hF[c + 1] < hF[c]) c++; if (hF[c] >= lf) break; hI[k] = hI[c]; hF[k] = hF[c]; k = c; } hI[k] = li; hF[k] = lf; }
      if (du > D[u]) continue;
      const ux = u % N, uy = (u - ux) / N, bu = b[u];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const vx = ux + dx, vy = uy + dy;
        if (vx < 0 || vy < 0 || vx >= N || vy >= N) continue;
        const v = vy * N + vx;
        if (water[v]) continue;
        if (dx && dy && water[uy * N + vx] && water[vy * N + ux]) continue;
        const nd = du + (dx && dy ? 1.4142 : 1) * (bu + b[v]) * 0.5;
        if (nd < D[v]) {
          D[v] = nd;
          let k = hI.length; hI.push(v); hF.push(nd);
          while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= nd) break; hI[k] = hI[p]; hF[k] = hF[p]; k = p; }
          hI[k] = v; hF[k] = nd;
        }
      }
    }
  };
  const heapPush = (hI, hF, i, f) => { let k = hI.length; hI.push(i); hF.push(f); while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= f) break; hI[k] = hI[p]; hF[k] = hF[p]; k = p; } hI[k] = i; hF[k] = f; };
  const altDijkstra = (s, b, water, src, D) => { D.fill(Infinity); D[src] = 0; altRun(s, b, water, D, [src], [0]); };
  // the field got cheaper at `tiles`: pull each one down from its neighbours, then let the gains spread
  const altPatch = (s, b, water, D, tiles) => {
    const N = s.map, hI = [], hF = [];
    for (const i of tiles) {
      if (water[i]) continue;
      const ux = i % N, uy = (i - ux) / N;
      let best = D[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const vx = ux + dx, vy = uy + dy;
        if (vx < 0 || vy < 0 || vx >= N || vy >= N) continue;
        const v = vy * N + vx;
        if (water[v] || D[v] === Infinity) continue;
        if (dx && dy && water[uy * N + vx] && water[vy * N + ux]) continue;
        const nd = D[v] + (dx && dy ? 1.4142 : 1) * (b[i] + b[v]) * 0.5;
        if (nd < best) best = nd;
      }
      if (best === Infinity) continue;
      D[i] = best;
      heapPush(hI, hF, i, best);
    }
    altRun(s, b, water, D, hI, hF);
  };
  // the landmark tables of one land region (null for small regions: the octile estimate is enough there)
  const altTables = (s, A, g) => {
    if (A.tables.has(g)) return A.tables.get(g);
    const t0 = now();
    const lr = G.landRegions(s), N = s.map, water = G.waterMask(s);
    const cells = [];
    for (let i = 0; i < lr.length; i++) if (lr[i] === g) cells.push(i);
    if (cells.length < RD.alt.minRegion) { A.tables.set(g, null); return null; }
    // farthest-point landmarks: the first is the cell farthest from the region's centroid, each next one the cell
    // farthest (in march cost) from all landmarks chosen so far
    let cx = 0, cy = 0; for (const i of cells) { cx += i % N; cy += (i / N) | 0; } cx /= cells.length; cy /= cells.length;
    let L = cells[0], bd = -1;
    for (const i of cells) { const d = Math.hypot(i % N - cx, ((i / N) | 0) - cy); if (d > bd) { bd = d; L = i; } }
    const K = Math.min(RD.alt.K, cells.length), out = [], minD = new Float64Array(lr.length).fill(Infinity);
    for (let k = 0; k < K; k++) {
      const D = new Float64Array(lr.length);
      altDijkstra(s, A.base, water, L, D);
      out.push(D);
      let far = -1, fd = -1;
      for (const i of cells) { if (D[i] < minD[i]) minD[i] = D[i]; if (minD[i] > fd && minD[i] < Infinity) { fd = minD[i]; far = i; } }
      if (far < 0 || fd <= 0) break;
      L = far;
    }
    A.tables.set(g, out); A.builds++;
    A.ms += now() - t0;
    return out;
  };
  // an A* estimate toward `goal` for land paths, or null (then G.path falls back to octile × the cheapest factor)
  const altHeur = (s, v, goal) => {
    const A = v.alt, lr = G.landRegions(s), g = lr[goal];
    if (!A || g === undefined || g < 0) return null;
    const T = altTables(s, A, g);
    if (!T) return null;
    const N = s.map, gx = goal % N, gy = (goal - gx) / N, hm = v.hm, K = T.length;
    const dg = new Float64Array(K); for (let k = 0; k < K; k++) dg[k] = T[k][goal];
    const T0 = T[0];
    return i => {
      const x = i % N, y = (i - x) / N, ax = x > gx ? x - gx : gx - x, ay = y > gy ? y - gy : gy - y;
      let h = (ax > ay ? ax + 0.4142 * ay : ay + 0.4142 * ax) * hm;
      if (T0[i] === Infinity) return h;        // outside the goal's region (a water start tile)
      for (let k = 0; k < K; k++) { let d = T[k][i] - dg[k]; if (d < 0) d = -d; if (d > h) h = d; }
      return h;
    };
  };
  G.altStats = s => { const A = LMS.get(s.tiles); return A ? { builds: A.builds, patches: A.patches, ms: +A.ms.toFixed(1), regions: A.tables.size } : null; };
  // spells and world generation reshape the land: drop the cost field and the landmarks with the other path caches
  const baseClear = G.clearPaths;
  G.clearPaths = s => { baseClear(s); COSTS.delete(s.tiles); LMS.delete(s.tiles); };

  // ---- each people's own feet: a path's march length for an owner ----------------
  // G.path searches one shared cost field (its memo serves every realm); peoples at home in some country
  // (RD.raceTerrain) re-cost the path they get, so their marches there are faster, though the route is the same.
  G.raceTerrain = (s, owner) => { const e = s.empires[owner]; return (e && RD.raceTerrain[e.race]) || null; };
  G.marchLen = (s, owner, p) => {
    if (!p || !p.path || p.path.length < 2) return p ? p.len : 0;
    const adj = G.raceTerrain(s, owner);
    if (!adj) return p.len;
    const rc = G.roadCosts(s), fac = rc.fac, N = s.map, lvl = s.roads && s.roads.lvl;
    const f = i => {
      const t = s.tiles[i];
      if (!t || G.isWater(t) || t.city || (lvl && lvl[i])) return fac[i];
      const a = adj[t.terrain];
      return a !== undefined && a < fac[i] ? a : fac[i];
    };
    let d = 0, pu = p.path[0][1] * N + p.path[0][0], fu = f(pu);
    for (let k = 1; k < p.path.length; k++) {
      const [x, y] = p.path[k], v = y * N + x, fv = f(v);
      const diag = x !== p.path[k - 1][0] && y !== p.path[k - 1][1];
      d += (diag ? 1.4142 : 1) * ((fu + fv) - (fac[pu] + fac[v])) * 0.5;
      pu = v; fu = fv;
    }
    return Math.max(0.1, p.len + d);
  };
  // the network changed: new costs for every path (the memo in engine.js is dropped with the other path caches;
  // the landmarks survive and are patched, see altUpdate)
  const dirty = G.roadsDirty = s => { const r = R(s); r.dirtyAt = r.dirtyAt || s.time || 1; };
  G.roadsFlush = s => {
    const r = R(s);
    if (!r.dirtyAt) return false;
    r.dirtyAt = 0; r.epoch++; r.rev++;
    baseClear(s);
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
