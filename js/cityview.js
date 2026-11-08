// =====================================================================
//  Ember & Crown — isometric city view.
//  Everything is drawn with canvas paths (no images). The static town is
//  painted to two offscreen canvases (day colours + a "lights" pass used
//  at night) only when the layout changes; each animation frame composites
//  them and adds smoke, villagers, soldiers, flags, weather and lighting.
//  Defines cityViewHtml(city) and registers a MOUNT_HOOKS entry.
// =====================================================================
'use strict';
(() => {
  // ------------------------------------------------------------------
  // geometry: grid (gx, gy) in tiles, z in logical pixels
  // ------------------------------------------------------------------
  const LW = 1000, LH = 630, N = 24, HW = 23.5, HH = 11.75, OX = 500, OY = 50, SQ2 = Math.SQRT2;
  const P = (gx, gy, z = 0) => [OX + (gx - gy) * HW, OY + (gx + gy) * HH - z];
  const clampv = (v, a, b) => v < a ? a : v > b ? b : v;
  const TAU = Math.PI * 2;

  // building slots [gx, gy, w, d]
  const SLOT = {
    townhall: [10.6, 10.6, 2.8, 2.8],
    smelter: [5.0, 5.0, 2.4, 2.4], smithy: [8.3, 5.0, 2.4, 2.4], armory: [5.0, 8.3, 2.4, 2.4],
    bakery: [7.8, 7.8, 1.9, 1.9], runeforge: [7.8, 7.8, 1.9, 1.9], heartgrove: [7.8, 7.8, 1.9, 1.9],
    warpit: [13.0, 4.9, 2.7, 2.6], barracks: [16.3, 4.9, 3.0, 2.6], stable: [16.4, 8.4, 2.8, 2.6], workshop: [13.0, 7.7, 2.7, 1.7],
    tavern: [12.85, 14.55, 1.45, 2.5], theatre: [14.55, 12.85, 2.5, 1.45], temple: [17.6, 17.6, 1.9, 1.9],
    market: [14.6, 14.6, 2.4, 2.4], warehouse: [17.5, 12.9, 2.0, 2.4], academy: [12.9, 17.5, 2.4, 2.0],
    houses: [4.8, 12.9, 6.2, 6.4],
    mine: [1.0, 1.2, 2.6, 2.4], quarry: [15.0, 0.6, 3.4, 2.6], lumber: [0.6, 15.0, 2.6, 3.4],
    farm: [20.8, 20.8, 2.3, 2.3],
  };
  const DRILL = [13.0, 9.55, 2.7, 1.6];
  const POND = [18.3, 18.3];
  const COTTAGES = [[8.75, 13.1], [8.75, 15.3], [6.9, 13.1], [6.9, 15.3], [8.75, 17.55], [5.0, 13.1], [5.0, 15.3], [6.9, 17.55], [5.0, 17.55]];
  const WALL_A = 4, WALL_B = 20, GATE0 = 11.3, GATE1 = 12.7;
  // walking paths (axis-aligned polylines)
  const PATHS = [
    [[9.9, 9.9], [12, 9.9], [14.1, 9.9], [14.1, 12], [14.1, 14.1], [12, 14.1], [9.9, 14.1], [9.9, 12], [9.9, 9.9]],
    [[12, 9.9], [12, 8.0], [12, 7.6], [12, 3.4], [12, 0.7]],
    [[9.9, 12], [8.45, 12], [7.6, 12], [6.6, 12], [3.4, 12], [0.7, 12]],
    [[14.1, 12], [16.05, 12], [17.25, 12], [20.5, 12], [23.3, 12]],
    [[12, 14.1], [12, 14.75], [12, 16.95], [12, 17.25], [12, 20.5], [12, 23.3]],
    [[12, 7.6], [7.6, 7.6], [4.6, 7.6]], [[7.6, 4.6], [7.6, 7.6], [7.6, 12]],
    [[16.05, 8.0], [19.5, 8.0]], [[16.05, 4.6], [16.05, 8.0], [16.05, 12]],
    [[12, 14.75], [8.45, 14.75], [6.6, 14.75], [4.6, 14.75]], [[12, 16.95], [8.45, 16.95], [6.6, 16.95], [4.6, 16.95]],
    [[6.6, 12], [6.6, 14.75], [6.6, 16.95], [6.6, 19.4]], [[8.45, 12], [8.45, 14.75], [8.45, 16.95], [8.45, 19.4]],
    [[17.25, 12], [17.25, 17.25], [12, 17.25]],
    [[4.2, 3.4], [12, 3.4], [19.8, 3.4]], [[3.4, 4.2], [3.4, 12], [3.4, 19.8]],
    [[20.5, 4.5], [20.5, 12], [20.5, 20.5], [12, 20.5], [4.5, 20.5]],
  ];
  const MAIN_ROADS = PATHS.slice(1, 5);

  // ------------------------------------------------------------------
  // colour helpers
  // ------------------------------------------------------------------
  const _cc = new Map();
  const rgbOf = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = (r, g, b) => '#' + ((1 << 24) | (clampv(Math.round(r), 0, 255) << 16) | (clampv(Math.round(g), 0, 255) << 8) | clampv(Math.round(b), 0, 255)).toString(16).slice(1);
  const shade = (h, f) => {
    const k = h + f; let v = _cc.get(k); if (v) return v;
    const [r, g, b] = rgbOf(h); const t = f < 0 ? 0 : 255, p = Math.abs(f);
    v = toHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p); _cc.set(k, v); return v;
  };
  const mix = (a, b, t) => { const A = rgbOf(a), B = rgbOf(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
  const hashStr = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mkRng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // ------------------------------------------------------------------
  // race palettes
  // ------------------------------------------------------------------
  const PAL = {
    hearth: { wall: '#f1e8d6', beam: '#6a4a30', stone: '#a9a093', stone2: '#c4baa8', roof: '#b4482f', thatch: '#c9a14c', door: '#6b3e22', trim: '#7a5a3c', flag: '#c0392b', accent: '#3f6fa8', cloth: ['#c0392b', '#e0b84a', '#3f6fa8', '#5e8f3e'], road: '#bba27a', wood: '#9a6a3c' },
    delver: { wall: '#9b958c', beam: '#5f5a54', stone: '#8c867e', stone2: '#a8a299', roof: '#6f6a64', thatch: '#7d8a5a', door: '#3b322c', trim: '#5a544e', flag: '#7f5539', accent: '#4f86b0', cloth: ['#4a6a8a', '#8a5a3a', '#6d7a80', '#3f7f8f'], road: '#9d978d', wood: '#7a5a3c' },
    sylvan: { wall: '#b48c5a', beam: '#6e5136', stone: '#a3a08a', stone2: '#c3bfa6', roof: '#4f9445', thatch: '#6fae52', door: '#4a3424', trim: '#7a5a3a', flag: '#2e7d32', accent: '#7fc8b0', cloth: ['#2e7d32', '#c9a74a', '#7fb0a0', '#a85a8a'], road: '#ad9e76', wood: '#a8774a' },
    ash: { wall: '#5a4434', beam: '#3a2a20', stone: '#5e5652', stone2: '#77706a', roof: '#a9784e', thatch: '#b88b5c', door: '#2a1e18', trim: '#e2d6bb', flag: '#a3221b', accent: '#a3221b', cloth: ['#a3221b', '#6d4c8d', '#b98c5f', '#3a2a20'], road: '#a68c6a', wood: '#5a4030' },
  };
  const TERRAIN_GRASS = { plains: '#a3b763', fertile: '#86b24e', forest: '#6f9a4a', hills: '#a6a36b', mountain: '#909b76', lake: '#90b070' };
  const SKIN = ['#f0c8a0', '#d9a57a', '#b97f55', '#8a5a3a'];

  // ------------------------------------------------------------------
  // region: the real neighbourhood of the city tile
  //   compass mapping: north = upper-left edge (gx = 0), east = upper-right
  //   edge (gy = 0), south = lower-right (gx = 24), west = lower-left (gy = 24).
  // ------------------------------------------------------------------
  const DIRN = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const secOf = (gx, gy) => ((Math.round(Math.atan2(gx - 12, -(gy - 12)) / (Math.PI / 4)) % 8) + 8) % 8;
  const OUTER_SITES = [
    { id: 'NE', r: [1.0, 1.2, 2.6, 2.4] }, { id: 'SE', r: [20.7, 0.8, 2.6, 2.6] }, { id: 'SW', r: [20.8, 20.8, 2.3, 2.3] }, { id: 'NW', r: [0.8, 20.6, 2.6, 2.6] },
    { id: 'N1', r: [0.6, 5.0, 2.6, 3.4] }, { id: 'N2', r: [0.6, 15.0, 2.6, 3.4] }, { id: 'E1', r: [5.0, 0.6, 3.4, 2.6] }, { id: 'E2', r: [15.0, 0.6, 3.4, 2.6] },
    { id: 'S1', r: [20.8, 5.0, 2.6, 3.4] }, { id: 'S2', r: [20.8, 15.0, 2.6, 3.4] }, { id: 'W1', r: [5.0, 20.8, 3.4, 2.6] }, { id: 'W2', r: [15.0, 20.8, 3.4, 2.6] },
  ];
  const DEFAULT_SITE = { mine: 'NE', quarry: 'E2', lumber: 'N2', farm: 'SW' };
  const WANT = { mine: { mountain: 4, hills: 2.5 }, quarry: { hills: 4, mountain: 3 }, lumber: { forest: 4 }, farm: { fertile: 4, plains: 2.5 } };
  const FIELD_CAND = [];
  for (const [a, b] of [[4.4, 6.1], [6.3, 8.5], [8.8, 11.1], [12.9, 15.1], [15.3, 17.6], [17.9, 20.1]]) FIELD_CAND.push([20.85, a, 2.35, b - a], [a, 20.85, b - a, 2.35], [0.75, a, 2.35, b - a], [a, 0.75, b - a, 2.35]);
  FIELD_CAND.push([20.9, 20.9, 2.3, 2.3], [20.8, 0.9, 2.4, 2.4], [0.9, 20.8, 2.4, 2.4], [1.0, 1.0, 2.4, 2.4]);
  const edgePt = (e, dd, u) => e === 'N' ? [dd, u] : e === 'E' ? [u, dd] : e === 'S' ? [N - dd, u] : [u, N - dd];
  const edgeCoord = (e, gx, gy) => e === 'N' ? [gx, gy] : e === 'E' ? [gy, gx] : e === 'S' ? [N - gx, gy] : [N - gy, gx];
  const lakeDepth = (z, u) => {
    const t = clampv((u - z.a) / (z.b - z.a), 0, 1);
    const f = (z.keepA && t < 0.5) || (z.keepB && t >= 0.5) ? 1 : Math.sin(Math.PI * t);
    return 0.6 + 2.5 * Math.pow(f, 0.6) + 0.18 * Math.sin(u * 2.3);
  };
  const riverC = (rv, u) => rv.pos + 0.32 * Math.sin(u * 0.55 + 1.3);
  const riverPt = (rv, u, off) => rv.along === 'gx' ? [u, riverC(rv, u) + off] : [riverC(rv, u) + off, u];
  let REG = null;
  const REGCACHE = new Map();
  function inWater(reg, gx, gy, m = 0) {
    if (reg.river) { const u = reg.river.along === 'gx' ? gx : gy, v = reg.river.along === 'gx' ? gy : gx; if (Math.abs(v - riverC(reg.river, u)) < 0.85 + m) return true; }
    for (const z of reg.lakes) { const [dd, u] = edgeCoord(z.e, gx, gy); if (u >= z.a - m && u <= z.b + m && dd < lakeDepth(z, u) + 0.35 + m) return true; }
    return false;
  }
  const rectWet = (reg, r, m = 0.1) => [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.5, 0], [0, 0.5], [1, 0.5], [0.5, 1]].some(([fx, fy]) => inWater(reg, r[0] + fx * r[2], r[1] + fy * r[3], m));
  const overlapR = (a, b, m) => a[0] < b[0] + b[2] + m && b[0] < a[0] + a[2] + m && a[1] < b[1] + b[3] + m && b[1] < a[1] + a[3] + m;
  function computeRegion(city) {
    const ck = `${city.id}:${city.x},${city.y}:${city.terrain}:${S.map}`;
    if (REGCACHE.has(ck)) return REGCACHE.get(ck);
    const tally = DIRN.map(() => ({})), all = {};
    const add = (o, k, w) => { o[k] = (o[k] || 0) + w; };
    add(all, city.terrain, 1.5);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const d = Math.hypot(dx, dy); if (d > 2.3) continue;
      const t = G.tileAt(S, city.x + dx, city.y + dy);
      const terr = t ? t.terrain : city.terrain, w = d <= 1.5 ? 1 : 0.6;
      add(tally[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8], terr, w); add(all, terr, w * 0.7);
    }
    const best = o => { let bk = null, bv = -1; for (const k in o) if (o[k] > bv) { bv = o[k]; bk = k; } return bk; };
    const ter = tally.map(o => best(o) || city.terrain);
    const site = typeof G.site === 'function' ? G.site(S, city) : { grain: 1, timber: 1, stone: 1, ore: 1 };
    // river: which way it runs and on which side of the town
    let river = null;
    if (site.river && S.rivers) {
      const pts = [], dv = [0, 0];
      for (const rv of S.rivers) {
        let i0 = -1, i1 = -1;
        rv.forEach((idx, i) => { const x = idx % S.map, y = Math.floor(idx / S.map); if (Math.hypot(x - city.x, y - city.y) <= 2.3) { pts.push([x - city.x, y - city.y]); if (i0 < 0) i0 = i; i1 = i; } });
        if (i0 >= 0) { const a = rv[Math.max(0, i0 - 1)], b = rv[Math.min(rv.length - 1, i1 + 1)]; dv[0] += (b % S.map) - (a % S.map); dv[1] += Math.floor(b / S.map) - Math.floor(a / S.map); }
      }
      if (pts.length) {
        const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        river = Math.abs(dv[0]) >= Math.abs(dv[1]) ? { along: 'gy', pos: my >= 0 ? 21.9 : 2.1 } : { along: 'gx', pos: mx <= 0 ? 21.9 : 2.1 };
      }
    }
    // lake shores along the plot edges
    const lakes = [];
    for (const e of ['N', 'E', 'S', 'W']) {
      let start = null;
      for (let u = 0.5; u <= 24.01; u += 0.5) {
        const [gx, gy] = edgePt(e, 1.2, u);
        const isL = u < 23.9 && ter[secOf(gx, gy)] === 'lake';
        if (isL && start === null) start = u;
        if (!isL && start !== null) { if (u - start >= 3) lakes.push({ e, a: Math.max(0, start - 0.5), b: Math.min(N, u) }); start = null; }
      }
    }
    // shores that meet at a corner run straight into each other instead of tapering
    const CORNER = { 'N0': 'E0', 'E0': 'N0', 'N24': 'W0', 'W0': 'N24', 'E24': 'S0', 'S0': 'E24', 'S24': 'W24', 'W24': 'S24' };
    const has = key => lakes.some(z => (z.e + (z.a <= 0.01 ? 0 : -1)) === key || (z.e + (z.b >= 23.99 ? 24 : -1)) === key);
    for (const z of lakes) { if (z.a <= 0.01 && has(CORNER[z.e + 0])) z.keepA = true; if (z.b >= 23.99 && has(CORNER[z.e + 24])) z.keepB = true; }
    const reg = { ter, all, site, river, lakes };
    // outer-ring yield buildings face the matching terrain
    const score = (b, s) => {
      if (rectWet(reg, s.r, 0.15)) return -99;
      const k = secOf(s.r[0] + s.r[2] / 2, s.r[1] + s.r[3] / 2), w = WANT[b];
      let v = (w[ter[k]] || 0) + 0.5 * ((w[ter[(k + 1) % 8]] || 0) + (w[ter[(k + 7) % 8]] || 0));
      if (DEFAULT_SITE[b] === s.id) v += 0.6;
      if (b === 'mine' && (s.r[0] < 4 || s.r[1] < 4)) v += 0.8;
      if (b === 'farm' && (s.r[0] > 20 || s.r[1] > 20)) v += 0.5;
      return v;
    };
    const pairs = [];
    for (const b of Object.keys(WANT)) for (const s of OUTER_SITES) pairs.push([score(b, s), b, s]);
    pairs.sort((a, b) => b[0] - a[0]);
    const slots = {}, taken = new Set();
    for (const [v, b, s] of pairs) if (!slots[b] && !taken.has(s.id) && v > -50) { slots[b] = s.r; taken.add(s.id); }
    for (const b of Object.keys(WANT)) if (!slots[b]) slots[b] = OUTER_SITES.find(s => s.id === DEFAULT_SITE[b]).r;
    const used = Object.values(slots);
    const fh = slots.farm, fc = [fh[0] + fh[2] / 2, fh[1] + fh[3] / 2];
    const dist2 = f => (f[0] + f[2] / 2 - fc[0]) ** 2 + (f[1] + f[3] / 2 - fc[1]) ** 2;
    reg.fields = FIELD_CAND.filter(f => !used.some(u => overlapR(f, u, 0.15)) && !rectWet(reg, f, 0.1) && !['mountain', 'forest'].includes(ter[secOf(f[0] + f[2] / 2, f[1] + f[3] / 2)]))
      .sort((a, b) => dist2(a) - dist2(b));
    reg.slots = slots;
    reg.sig = ter.join(',') + '|' + (river ? river.along + river.pos : '-') + '|' + lakes.map(l => l.e + l.a + '-' + l.b).join(';') + '|' + ['grain', 'timber', 'stone', 'ore'].map(g => (+site[g] || 1).toFixed(2)).join(',');
    REGCACHE.set(ck, reg);
    return reg;
  }
  const slotOf = t => (REG && REG.slots[t]) || SLOT[t];

  // ------------------------------------------------------------------
  // drawing state
  // ------------------------------------------------------------------
  let c = null, GLOW = false, REC = null, RACE = 'hearth', STY = PAL.hearth, SEASON = 0, SNOW = false, STARVE = false, R = Math.random, GROUND = '#9fb562';
  const OUT = 'rgba(42,28,18,0.55)';
  const F = s => GLOW ? '#000' : s;
  const rec = (k, o) => { if (REC) REC[k].push(o); };
  const roofCol = col => SNOW ? mix(col, '#f3f6f9', 0.8) : col;

  function path(pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
  function poly(pts, fill, stroke = OUT, lw = 0.8) {
    path(pts);
    if (fill) { c.fillStyle = F(fill); c.fill(); }
    if (stroke) { c.strokeStyle = F(stroke); c.lineWidth = lw; c.stroke(); }
  }
  function line(a, b, col, lw = 1) { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.strokeStyle = F(col); c.lineWidth = lw; c.stroke(); }
  function circ(x, y, r, fill, stroke) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); if (fill) { c.fillStyle = F(fill); c.fill(); } if (stroke) { c.strokeStyle = F(stroke); c.lineWidth = 0.8; c.stroke(); } }
  // light sources: dark glass by day, bright in the night pass
  function lamp(pts, day, night) { path(pts); c.fillStyle = GLOW ? night : day; c.fill(); }
  function lampDot(x, y, r, day, night) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = GLOW ? night : day; c.fill(); }
  const quad = (x, y, w, d, z = 0) => [P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z)];
  const hullBox = (x, y, w, d, h) => [P(x, y, h), P(x + w, y, h), P(x + w, y, 0), P(x + w, y + d, 0), P(x, y + d, 0), P(x, y + d, h)];

  // ------------------------------------------------------------------
  // iso primitives
  // ------------------------------------------------------------------
  function box(x, y, w, d, z, h, col, o = {}) {
    const st = o.stroke === undefined ? OUT : o.stroke;
    poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], o.right || shade(col, -0.2), st);
    poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], o.left || col, st);
    if (!o.noTop) poly(quad(x, y, w, d, z + h), SNOW && !o.noSnow ? mix(o.top || shade(col, 0.14), '#f2f6f8', 0.78) : o.top || shade(col, 0.14), st);
    return { x, y, w, d, z, h, col };
  }
  const onL = (b, u0, u1, v0, v1) => [P(b.x + u0, b.y + b.d, b.z + v0), P(b.x + u1, b.y + b.d, b.z + v0), P(b.x + u1, b.y + b.d, b.z + v1), P(b.x + u0, b.y + b.d, b.z + v1)];
  const onR = (b, u0, u1, v0, v1) => [P(b.x + b.w, b.y + u0, b.z + v0), P(b.x + b.w, b.y + u1, b.z + v0), P(b.x + b.w, b.y + u1, b.z + v1), P(b.x + b.w, b.y + u0, b.z + v1)];
  function win(b, side, u, v, ww = 0.2, wh = 6, frame) {
    const f = side === 'L' ? onL : onR;
    poly(f(b, u - ww / 2 - 0.035, u + ww / 2 + 0.035, v - 1, v + wh + 1), frame || STY.trim, null);
    lamp(f(b, u - ww / 2, u + ww / 2, v, v + wh), side === 'L' ? '#4b5a6b' : '#3a4655', '#ffc95c');
  }
  function door(b, side, u, dw = 0.3, dh = 9, col) {
    const f = side === 'L' ? onL : onR;
    poly(f(b, u - dw / 2 - 0.03, u + dw / 2 + 0.03, 0, dh + 1), STY.trim, null);
    poly(f(b, u - dw / 2, u + dw / 2, 0, dh), col || STY.door, null);
  }
  function rowWins(b, side, v, wh, skipMid, ww) {
    const Lf = side === 'L' ? b.w : b.d;
    const n = Math.max(1, Math.round(Lf / 0.62));
    for (let i = 0; i < n; i++) {
      if (skipMid && i === Math.floor(n / 2)) continue;
      win(b, side, Lf * (i + 0.5) / n, v, ww, wh);
    }
  }
  function timber(b, cb) {
    const h = b.h;
    for (const side of ['L', 'R']) {
      const Lf = side === 'L' ? b.w : b.d, f = side === 'L' ? onL : onR;
      const n = Math.max(2, Math.round(Lf / 0.55));
      const pt = (u, v) => f(b, u, u, v, v)[0];
      for (let i = 0; i <= n; i++) line(pt(Lf * i / n, 0), pt(Lf * i / n, h), cb, 1.2);
      line(pt(0, h * 0.5), pt(Lf, h * 0.5), cb, 1.2);
      line(pt(0, h - 0.6), pt(Lf, h - 0.6), cb, 1.5);
      line(pt(0, 0.5), pt(Lf / n, h * 0.5), cb, 1);
      line(pt(Lf, 0.5), pt(Lf - Lf / n, h * 0.5), cb, 1);
    }
  }
  function courses(b, step, col) {
    for (let v = step; v < b.h - 1; v += step) {
      line(P(b.x, b.y + b.d, b.z + v), P(b.x + b.w, b.y + b.d, b.z + v), col, 0.6);
      line(P(b.x + b.w, b.y, b.z + v), P(b.x + b.w, b.y + b.d, b.z + v), col, 0.6);
    }
  }
  function roofLines(q, n, col, lw = 0.6) { // q = [eaveA, eaveB, ridgeB, ridgeA]
    for (let i = 1; i < n; i++) {
      const t = i / n;
      line([q[0][0] + (q[3][0] - q[0][0]) * t, q[0][1] + (q[3][1] - q[0][1]) * t], [q[1][0] + (q[2][0] - q[1][0]) * t, q[1][1] + (q[2][1] - q[1][1]) * t], col, lw);
    }
  }
  // gable roof over box b; axis = ridge direction ('x' or 'y'); tex: 'thatch' | 'tile' | null
  function gable(b, rh, col, axis, tex, o = 0.12) {
    col = roofCol(col);
    const zb = b.z + b.h, zt = zb + rh, wl = b.col || STY.wall;
    const x0 = b.x - o, x1 = b.x + b.w + o, y0 = b.y - o, y1 = b.y + b.d + o;
    const tl = tex === 'thatch' ? shade(col, -0.18) : shade(col, -0.22);
    if (axis === 'x') {
      const ym = b.y + b.d / 2;
      poly([P(x0, y0, zb), P(x1, y0, zb), P(x1, ym, zt), P(x0, ym, zt)], shade(col, -0.28));
      poly([P(b.x + b.w, b.y, zb), P(b.x + b.w, b.y + b.d, zb), P(b.x + b.w, ym, zt)], shade(wl, -0.2));
      const q = [P(x0, y1, zb), P(x1, y1, zb), P(x1, ym, zt), P(x0, ym, zt)];
      poly(q, col);
      if (tex && !SNOW) roofLines(q, tex === 'thatch' ? 4 : 5, tl);
      line(P(x0, ym, zt), P(x1, ym, zt), shade(col, -0.35), 1.4);
    } else {
      const xm = b.x + b.w / 2;
      poly([P(x0, y0, zb), P(x0, y1, zb), P(xm, y1, zt), P(xm, y0, zt)], shade(col, -0.28));
      poly([P(b.x, b.y + b.d, zb), P(b.x + b.w, b.y + b.d, zb), P(xm, b.y + b.d, zt)], wl);
      const q = [P(x1, y1, zb), P(x1, y0, zb), P(xm, y0, zt), P(xm, y1, zt)];
      poly(q, shade(col, -0.14));
      if (tex && !SNOW) roofLines(q, tex === 'thatch' ? 4 : 5, shade(tl, -0.1));
      line(P(xm, y0, zt), P(xm, y1, zt), shade(col, -0.35), 1.4);
    }
    return zt;
  }
  function hip(b, rh, col, o = 0.12, tex) {
    col = roofCol(col);
    const zb = b.z + b.h, zt = zb + rh;
    const x0 = b.x - o, x1 = b.x + b.w + o, y0 = b.y - o, y1 = b.y + b.d + o, W = x1 - x0, D = y1 - y0, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
    const A = P(x0, y0, zb), B = P(x1, y0, zb), C = P(x1, y1, zb), Dd = P(x0, y1, zb);
    const back = shade(col, -0.3), right = shade(col, -0.16);
    if (W >= D) {
      const R1 = P(x0 + D / 2, ym, zt), R2 = P(x1 - D / 2, ym, zt);
      poly([A, B, R2, R1], back); poly([Dd, A, R1], back); poly([B, C, R2], right);
      poly([C, Dd, R1, R2], col); if (tex && !SNOW) roofLines([Dd, C, R2, R1], 4, shade(col, -0.2));
    } else {
      const R1 = P(xm, y0 + W / 2, zt), R2 = P(xm, y1 - W / 2, zt);
      poly([A, B, R1], back); poly([Dd, A, R1, R2], back); poly([B, C, R2, R1], right);
      poly([C, Dd, R2], col); if (tex && !SNOW) roofLines([C, B, R1, R2], 4, shade(col, -0.25));
    }
    return zt;
  }
  function ell(cx, cy, z, r) { const [x, y] = P(cx, cy, z); return [x, y, Math.max(0.2, r * SQ2 * HW), Math.max(0.2, r * SQ2 * HH)]; }
  function gradFill(xa, xb, col, st = true) {
    if (GLOW) c.fillStyle = '#000';
    else { const g = c.createLinearGradient(xa, 0, xb, 0); g.addColorStop(0, shade(col, 0.14)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.32)); c.fillStyle = g; }
    c.fill(); if (st) { c.strokeStyle = F(OUT); c.lineWidth = 0.8; c.stroke(); }
  }
  function cone(cx, cy, r, z, h, col, snowy = true) {
    if (snowy) col = roofCol(col);
    const [x, y, rx, ry] = ell(cx, cy, z, r);
    c.beginPath(); c.moveTo(x - rx, y); c.lineTo(x, y - h); c.lineTo(x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.closePath();
    gradFill(x - rx, x + rx, col);
    return z + h;
  }
  function cyl(cx, cy, r, z, h, col, top) {
    const [x, y, rx, ry] = ell(cx, cy, z, r);
    c.beginPath(); c.moveTo(x - rx, y - h); c.lineTo(x - rx, y); c.ellipse(x, y, rx, ry, 0, Math.PI, 0, true); c.lineTo(x + rx, y - h); c.closePath();
    gradFill(x - rx, x + rx, col);
    c.beginPath(); c.ellipse(x, y - h, rx, ry, 0, 0, TAU); c.fillStyle = F(top || shade(col, 0.12)); c.fill(); c.strokeStyle = F(OUT); c.lineWidth = 0.8; c.stroke();
    return z + h;
  }
  function dome(cx, cy, r, z, h, col, snowy = true) {
    if (snowy) col = roofCol(col);
    const [x, y, rx, ry] = ell(cx, cy, z, r);
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.ellipse(x, y, rx, Math.max(ry, h), 0, Math.PI, TAU); c.closePath();
    if (GLOW) c.fillStyle = '#000';
    else { const g = c.createRadialGradient(x - rx * 0.35, y - h * 0.65, 1, x, y - h * 0.3, rx * 1.25); g.addColorStop(0, shade(col, 0.25)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.35)); c.fillStyle = g; }
    c.fill(); c.strokeStyle = F(OUT); c.lineWidth = 0.8; c.stroke();
    return z + h;
  }
  function chimney(gx, gy, zb, h, kind, col = '#8a7f74') {
    const s = 0.22;
    box(gx, gy, s, s, zb, h, col);
    box(gx - 0.03, gy - 0.03, s + 0.06, s + 0.06, zb + h, 1.6, shade(col, -0.25));
    const [px, py] = P(gx + s / 2, gy + s / 2, zb + h + 2);
    rec('smoke', { x: px, y: py, kind, seed: R() });
  }
  function flagpole(gx, gy, z, h, col, len = 10) {
    const a = P(gx, gy, z), t = P(gx, gy, z + h);
    line(a, t, '#4a3a2a', 1.3); circ(t[0], t[1] - 0.5, 1.2, '#d9b44a');
    rec('flags', { x: t[0], y: t[1] + 1, col: col || STY.flag, len, seed: R() });
  }
  function lantern(x, y, r = 1.8) { line([x, y - r - 3], [x, y - r], '#3a2a20', 0.8); lampDot(x, y, r, '#e8b85a', '#ffd46e'); rec('lights', { x, y, r: r * 5 }); }
  function shadow(x, y, w, d, s) {
    if (GLOW) return;
    path([P(x, y), P(x + w, y), P(x + w + s, y - s), P(x + w + s, y + d - s), P(x + w, y + d), P(x, y + d)]);
    c.fillStyle = 'rgba(30,25,10,0.14)'; c.fill();
  }

  // ------------------------------------------------------------------
  // nature props
  // ------------------------------------------------------------------
  const leafCols = sylvan => {
    if (SEASON === 0) return ['#4f8a3e', '#6eac50', '#9bd06e'];
    if (SEASON === 1) return ['#3f7334', '#558f40', '#7db35a'];
    if (SEASON === 2) return sylvan ? ['#8a6a1e', '#c4962e', '#e8c45a'] : [['#9a4a1c', '#cf7429', '#eaa43e'], ['#8a3a1c', '#c2501f', '#e0803a'], ['#8a6a1c', '#c99a2e', '#ecc85a']][Math.floor(R() * 3)];
    return sylvan ? ['#3f6a52', '#5a8a6e', '#e9f1f3'] : null;
  };
  function blobs(x, y, Rr, cols, blossom) {
    const B = [[0, -0.15, 1], [-0.62, 0.18, 0.72], [0.62, 0.2, 0.7], [-0.3, -0.62, 0.64], [0.34, -0.58, 0.6]];
    for (const [dx, dy, s] of B) circ(x + dx * Rr, y + dy * Rr + 2, Rr * s, cols[0], OUT);
    for (const [dx, dy, s] of B) circ(x + dx * Rr - 0.5, y + dy * Rr, Rr * s * 0.92, cols[1]);
    for (const [dx, dy, s] of B) circ(x + dx * Rr - Rr * s * 0.3, y + dy * Rr - Rr * s * 0.32, Rr * s * 0.42, cols[2]);
    if (blossom) for (let i = 0; i < 9; i++) circ(x + (R() - 0.5) * Rr * 1.8, y + (R() - 0.6) * Rr * 1.5, 1.1, R() < 0.5 ? '#f7c6d6' : '#ffffff');
    if (SNOW && cols[2] === '#e9f1f3') for (const [dx, dy, s] of B.slice(3)) circ(x + dx * Rr, y + dy * Rr - Rr * s * 0.4, Rr * s * 0.5, '#f4f8fa');
  }
  function treeDecid(gx, gy, s = 1, sylvan = false) {
    const [x, y] = P(gx, gy);
    const th = 10 * s;
    poly([[x - 1.6 * s, y], [x + 1.6 * s, y], [x + 1.1 * s, y - th], [x - 1.1 * s, y - th]], '#6b4b30');
    const cols = leafCols(sylvan);
    if (!cols) { // bare winter tree
      const cx = x, cy = y - th;
      for (const [dx, dy] of [[-6, -9], [5, -10], [-2, -13], [8, -5], [-8, -4]]) { line([cx, cy], [cx + dx * s, cy + dy * s], '#5a4030', 1.1 * s); circ(cx + dx * s, cy + dy * s - 0.5, 1.2 * s, '#f4f8fa'); }
      return;
    }
    blobs(x, y - th - 6 * s, 8 * s, cols, SEASON === 0 && R() < 0.55);
  }
  function treePine(gx, gy, s = 1) {
    const [x, y] = P(gx, gy);
    poly([[x - 1.3 * s, y], [x + 1.3 * s, y], [x + 1.3 * s, y - 5 * s], [x - 1.3 * s, y - 5 * s]], '#5d4128');
    const g = SEASON === 2 ? '#3d6640' : '#35633f';
    for (let i = 0; i < 3; i++) {
      const by = y - 4 * s - i * 7 * s, w = (9 - i * 2.2) * s;
      poly([[x - w, by], [x + w, by], [x, by - 12 * s]], i % 2 ? shade(g, 0.08) : g);
      poly([[x, by - 12 * s], [x + w, by], [x, by]], shade(g, -0.18), null);
      if (SNOW) poly([[x - w * 0.55, by - 5 * s], [x, by - 12 * s], [x + w * 0.55, by - 5 * s], [x, by - 7 * s]], '#f2f6f8', null);
    }
  }
  function bush(gx, gy, s = 1) {
    const [x, y] = P(gx, gy);
    const cols = leafCols(false) || ['#7a8a7a', '#9aa89a', '#f2f6f8'];
    circ(x - 3 * s, y - 2.5 * s, 3.5 * s, cols[0], OUT); circ(x + 3 * s, y - 2.5 * s, 3.4 * s, cols[0], OUT); circ(x, y - 4.5 * s, 4 * s, cols[1], OUT);
    circ(x - 1.5 * s, y - 6 * s, 1.6 * s, cols[2]);
  }
  function rock(gx, gy, s = 1, col = '#9a948c') {
    const [x, y] = P(gx, gy);
    poly([[x - 7 * s, y], [x - 5 * s, y - 6 * s], [x + 1 * s, y - 8.5 * s], [x + 6 * s, y - 5 * s], [x + 7.5 * s, y]], col);
    poly([[x - 5 * s, y - 6 * s], [x + 1 * s, y - 8.5 * s], [x + 6 * s, y - 5 * s], [x + 1 * s, y - 3.5 * s]], shade(col, 0.18), null);
    poly([[x + 1 * s, y - 3.5 * s], [x + 6 * s, y - 5 * s], [x + 7.5 * s, y], [x + 1 * s, y]], shade(col, -0.18), null);
    if (SNOW) poly([[x - 4 * s, y - 6.2 * s], [x + 1 * s, y - 8.5 * s], [x + 5 * s, y - 5.4 * s], [x + 1 * s, y - 5.5 * s]], '#f2f6f8', null);
  }
  function stump(gx, gy) { cyl(gx, gy, 0.1, 0, 3, '#6b4b30', '#c9a874'); }
  function log(x0, x1, gy, z, r = 2.2) {
    poly([P(x0, gy, z + r), P(x1, gy, z + r), P(x1, gy, z - r), P(x0, gy, z - r)], '#7a5434');
    const [ex, ey] = P(x1, gy, z); circ(ex, ey, r, '#d9b47a', OUT); circ(ex, ey, r * 0.45, null, '#a07a4a');
  }
  function logPile(gx, gy, len, rows) {
    for (let r = 0; r < rows; r++) for (let i = 0; i < rows - r; i++) log(gx, gx + len, gy + i * 0.2 + r * 0.1, 2.2 + r * 3.6);
  }
  function crate(gx, gy, s = 0.28, z = 0) { const b = box(gx, gy, s, s, z, s * 22, '#a5773f'); line(onL(b, 0, s, 0, 0)[0], onL(b, s, s, s * 22, s * 22)[0], '#7a5428', 0.7); }
  function barrel(gx, gy) { cyl(gx, gy, 0.11, 0, 7, '#8a5a32', '#a87444'); const [x, y] = P(gx, gy, 3.5); c.beginPath(); c.ellipse(x, y, 3.3, 1.6, 0, 0, Math.PI); c.strokeStyle = F('#4a3020'); c.lineWidth = 0.7; c.stroke(); }
  function sack(gx, gy) { const [x, y] = P(gx, gy); c.beginPath(); c.ellipse(x, y - 3, 3.4, 3.2, 0, 0, TAU); c.fillStyle = F('#d8c79e'); c.fill(); c.strokeStyle = F(OUT); c.lineWidth = 0.7; c.stroke(); }
  function haystack(gx, gy, s = 1) {
    const [x, y] = P(gx, gy); const col = STARVE ? '#9a9486' : SNOW ? '#e8ece8' : '#d9b65a';
    c.beginPath(); c.moveTo(x - 7 * s, y); c.quadraticCurveTo(x - 6 * s, y - 13 * s, x, y - 14 * s); c.quadraticCurveTo(x + 6 * s, y - 13 * s, x + 7 * s, y); c.closePath();
    gradFill(x - 7 * s, x + 7 * s, col);
  }
  function fence(pts, h = 5, col = '#8a6440') { // polyline of grid points
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.4));
      for (let k = 0; k <= n; k++) { const gx = ax + (bx - ax) * k / n, gy = ay + (by - ay) * k / n; line(P(gx, gy), P(gx, gy, h), col, 1.1); }
      line(P(ax, ay, h * 0.85), P(bx, by, h * 0.85), col, 0.9); line(P(ax, ay, h * 0.4), P(bx, by, h * 0.4), col, 0.9);
    }
  }
  function firePit(gx, gy, s = 1) {
    const [x, y] = P(gx, gy);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; circ(x + Math.cos(a) * 5 * s, y + Math.sin(a) * 2.6 * s, 1.5 * s, '#7a726a', OUT); }
    lampDot(x, y, 2.5 * s, '#c0501a', '#ff9a3a');
    rec('fires', { x, y: y - 1, s }); rec('lights', { x, y: y - 4, r: 26 * s });
  }
  function banner(gx, gy, z, h, col) { // tall pole with hanging banner (static cloth) + flag on top
    const a = P(gx, gy, z), t = P(gx, gy, z + h);
    line(a, t, '#3a2a20', 1.4);
    poly([[t[0] + 0.5, t[1] + 3], [t[0] + 7, t[1] + 3], [t[0] + 7, t[1] + 15], [t[0] + 3.7, t[1] + 12], [t[0] + 0.5, t[1] + 15]], col || STY.flag);
    line([t[0] - 1, t[1] + 3], [t[0] + 8, t[1] + 3], '#3a2a20', 1.2);
  }
  function skull(x, y, s = 1) { circ(x, y, 2.2 * s, '#ece2c8', OUT); circ(x - 0.8 * s, y - 0.2 * s, 0.55 * s, '#2a1e18'); circ(x + 0.8 * s, y - 0.2 * s, 0.55 * s, '#2a1e18'); }
  function person(x, y, col, s = 1) { // static figure
    circ(x, y - 7.5 * s, 1.7 * s, SKIN[1]); poly([[x - 2 * s, y - 6 * s], [x + 2 * s, y - 6 * s], [x + 2.4 * s, y - 1.5 * s], [x - 2.4 * s, y - 1.5 * s]], col, null);
    line([x - 1 * s, y - 1.5 * s], [x - 1 * s, y], '#3a2a20', 1); line([x + 1 * s, y - 1.5 * s], [x + 1 * s, y], '#3a2a20', 1);
  }
  function animal(gx, gy, kind, flip = 1) {
    const [x, y] = P(gx, gy);
    const col = { horse: '#8a5a34', boar: '#5a4636', stag: '#b8875a', wolf: '#8d8d94' }[kind];
    for (const dx of [-4, -2, 3, 5]) line([x + dx * flip, y - 4], [x + dx * flip, y], shade(col, -0.3), 1.2);
    c.beginPath(); c.ellipse(x, y - 6, 6.5, 3.4, 0, 0, TAU); c.fillStyle = F(col); c.fill(); c.strokeStyle = F(OUT); c.lineWidth = 0.7; c.stroke();
    const hx = x + 7 * flip, hy = y - (kind === 'boar' ? 6 : 10);
    poly([[x + 4 * flip, y - 8], [hx, hy - 2], [hx + 3 * flip, hy + 1], [x + 5 * flip, y - 4]], col);
    if (kind === 'stag') { line([hx, hy - 2], [hx - 2 * flip, hy - 8], '#e8d8b0', 1); line([hx, hy - 2], [hx + 3 * flip, hy - 8], '#e8d8b0', 1); line([hx - 1 * flip, hy - 5], [hx - 4 * flip, hy - 7], '#e8d8b0', 0.8); }
    if (kind === 'boar') line([hx + 2 * flip, hy + 1], [hx + 4 * flip, hy - 1], '#f2ead8', 1);
    if (kind === 'horse') line([x + 4 * flip, y - 9], [hx - 1 * flip, hy - 2], '#3a2418', 1.6);
    if (kind === 'wolf') poly([[hx - 1 * flip, hy - 2], [hx, hy - 6], [hx + 1.5 * flip, hy - 2]], col);
    line([x - 6 * flip, y - 7], [x - 9 * flip, y - 3], shade(col, -0.2), 1.3);
  }

  // ------------------------------------------------------------------
  // race-specific architecture
  // ------------------------------------------------------------------
  function hallHearth(x, y, w, d, H, band, o) {
    const p = STY;
    box(x - 0.05, y - 0.05, w + 0.1, d + 0.1, 0, 2.5, '#8d857a');
    let b;
    if (band >= 2) {
      const lo = box(x, y, w, d, 2.5, H * 0.5, p.stone2); courses(lo, 4, shade(p.stone2, -0.16));
      rowWins(lo, 'R', 3, 5); door(lo, 'L', w / 2, 0.32, 8.5);
      const up = box(x - 0.06, y - 0.06, w + 0.12, d + 0.12, 2.5 + H * 0.5, H * 0.5, band >= 3 ? '#e6dccb' : p.wall);
      timber(up, p.beam); rowWins(up, 'L', 3, 5); rowWins(up, 'R', 3, 5);
      b = { x: x - 0.06, y: y - 0.06, w: w + 0.12, d: d + 0.12, z: 2.5, h: H, col: up.col };
    } else {
      b = box(x, y, w, d, 2.5, H, p.wall);
      if (band >= 1) timber(b, p.beam);
      rowWins(b, 'L', H * 0.45, 5, true); rowWins(b, 'R', H * 0.45, 5);
      door(b, 'L', w / 2, 0.3, Math.min(9, H * 0.62));
    }
    const axis = o.axis || (w >= d ? 'x' : 'y');
    const span = axis === 'x' ? b.d : b.w;
    const rh = o.rh || span * (band === 0 ? 11 : 9.5);
    const zt = o.hip ? hip(b, rh, o.roof || p.roof, 0.12, 'tile') : gable(b, rh, o.roof || (band === 0 ? p.thatch : p.roof), axis, band === 0 && !o.roof ? 'thatch' : 'tile');
    if (o.chim) axis === 'x' ? chimney(b.x + b.w * 0.75, b.y + b.d * 0.35, b.z + b.h + rh * 0.35, rh * 0.75 + 4, o.chim) : chimney(b.x + b.w * 0.35, b.y + b.d * 0.3, b.z + b.h + rh * 0.35, rh * 0.75 + 4, o.chim);
    return zt;
  }
  function parapet(b, h = 3, col) {
    col = col || shade(b.col, 0.05); const t = 0.13, z = b.z + b.h;
    box(b.x, b.y, b.w, t, z, h, col); box(b.x, b.y + t, t, b.d - t, z, h, col);
    const n = Math.max(2, Math.round(b.w / 0.32));
    for (let i = 0; i < n; i += 2) box(b.x + b.w * i / n, b.y + b.d - t, b.w / n, t, z, h + 2, col);
    const m = Math.max(2, Math.round(b.d / 0.32));
    for (let i = 0; i < m; i += 2) box(b.x + b.w - t, b.y + b.d * i / m, t, b.d / m, z, h + 2, col);
    box(b.x, b.y + b.d - t, b.w, t, z, h, col); box(b.x + b.w - t, b.y, t, b.d, z, h, col);
  }
  function archDoor(b, side, u, dw = 0.34, dh = 10) {
    const f = side === 'L' ? onL : onR;
    poly(f(b, u - dw / 2 - 0.06, u + dw / 2 + 0.06, 0, dh + 2.5), shade(b.col, -0.25), null);
    const q = f(b, u - dw / 2, u + dw / 2, 0, dh - 2), tp = f(b, u, u, dh, dh)[0];
    path([q[0], q[1], q[2], tp, q[3]]); c.fillStyle = F(STY.door); c.fill();
  }
  function slit(b, side, u, v, h = 6) { lamp((side === 'L' ? onL : onR)(b, u - 0.05, u + 0.05, v, v + h), '#2e2a28', '#ffc35a'); }
  function hallDelver(x, y, w, d, H, band, o) {
    const p = STY, col = band >= 2 ? p.stone2 : p.stone;
    box(x - 0.08, y - 0.08, w + 0.16, d + 0.16, 0, 2, shade(col, -0.2));
    const b = box(x, y, w, d, 2, H, col);
    courses(b, 4.5, shade(col, -0.14));
    box(x - 0.04, y - 0.04, w + 0.08, d + 0.08, 2 + H - 3, 3, shade(col, -0.18));          // carved band
    archDoor(b, 'L', w / 2, 0.36, Math.min(11, H * 0.7));
    const nL = Math.max(1, Math.round(w / 0.55)), nR = Math.max(1, Math.round(d / 0.55));
    for (let i = 0; i < nL; i++) if (i !== Math.floor(nL / 2)) slit(b, 'L', w * (i + 0.5) / nL, H * 0.4, 6);
    for (let i = 0; i < nR; i++) slit(b, 'R', d * (i + 0.5) / nR, H * 0.4, 6);
    if (o.runes) { lamp(onL(b, 0.05, w - 0.05, H - 5.5, H - 4.5), '#4fc3f7', '#9cf0ff'); lamp(onR(b, 0.05, d - 0.05, H - 5.5, H - 4.5), '#3aa8dc', '#9cf0ff'); rec('sparks', { x: P(x + w, y + d, 2 + H - 5)[0], y: P(x + w, y + d, 2 + H - 5)[1], kind: 'rune' }); }
    let top = 2 + H;
    if (band === 0) { // sod roof
      poly(quad(x, y, w, d, top), SNOW ? '#eef3f5' : '#7d8a52', OUT);
      const [mx, my] = P(x + w / 2, y + d / 2, top); c.beginPath(); c.ellipse(mx, my, w * HW * 0.7, d * HH * 0.55, 0, Math.PI, TAU); c.fillStyle = F(SNOW ? '#f4f8fa' : '#8d9a5c'); c.fill();
      return top + 4;
    }
    parapet(b, 3);
    if (band >= 2) {
      const i = Math.min(w, d) * 0.22;
      const b2 = box(x + i, y + i, w - 2 * i, d - 2 * i, top, H * 0.45, col); courses(b2, 4.5, shade(col, -0.14));
      for (let k = 0; k < 2; k++) slit(b2, 'L', (w - 2 * i) * (k + 0.5) / 2, H * 0.12, 5);
      if (o.runes || band >= 3) parapet(b2, 2.5);
      top += H * 0.45;
      if (band >= 3) {
        const i2 = i * 2; const b3 = box(x + i2, y + i2, w - 2 * i2, d - 2 * i2, top, H * 0.3, shade(col, 0.06)); top += H * 0.3;
        lamp(onL(b3, 0.05, w - 2 * i2 - 0.05, H * 0.15, H * 0.15 + 1.2), '#d9b45a', '#ffd46e');
      }
    }
    if (o.chim) chimney(x + w * 0.7, y + d * 0.2, 2 + H, (top - 2 - H) + 10, o.chim, '#6f6a64');
    return top;
  }
  function canopy(cx, cy, z, r, sylvan = true) {
    const [x, y] = P(cx, cy, z);
    const cols = leafCols(sylvan) || ['#3f6a52', '#5a8a6e', '#e9f1f3'];
    blobs(x, y, r * HW * 1.1, cols, false);
  }
  function pod(cx, cy, r, z, h, band) {
    cyl(cx, cy, r, z, h, '#c49a62', '#d8b07a');
    const [x, y] = P(cx, cy, z);
    const rx = r * SQ2 * HW;
    lamp([[x - rx * 0.25, y + 1], [x + rx * 0.1, y + 2], [x + rx * 0.1, y - h * 0.6], [x - rx * 0.25, y - h * 0.65]], '#3a3a30', '#ffcf66');
    dome(cx, cy, r * 1.15, z + h, h * 0.9 + 3, band >= 2 ? '#3f8a4a' : STY.roof);
  }
  function roots(cx, cy, r) {
    const [x, y] = P(cx, cy);
    for (const [dx, dy] of [[-1, 0.3], [1, 0.4], [-0.5, 0.6], [0.6, 0.65]]) line([x + dx * r * HW * 0.6, y], [x + dx * r * HW * 1.6, y + dy * 4], '#5a4028', 2);
  }
  function hallSylvan(x, y, w, d, H, band, o) {
    const cx = x + w / 2, cy = y + d / 2, r = Math.min(w, d) / 2;
    if (band === 0) {
      cyl(cx, cy, r * 0.75, 0, H * 0.55, '#b88f5c', '#c9a06a');
      const b = { x: cx - r * 0.5, y: cy - r * 0.5, w: r, d: r * 1.03, z: 0, h: H, col: '#b88f5c' };
      const [dx, dy] = P(cx + r * 0.2, cy + r * 0.75); poly([[dx - 3, dy], [dx + 3, dy], [dx + 3, dy - 8], [dx - 3, dy - 8]], STY.door, null);
      void b;
      return dome(cx, cy, r * 0.95, H * 0.55, H * 0.75, STY.roof);
    }
    roots(cx, cy, r * 0.35);
    const th = H * (1.1 + band * 0.25);
    cyl(cx, cy, r * 0.3, 0, th, STY.beam, shade(STY.beam, 0.15));
    const [lx, ly] = P(cx, cy + r * 0.3, 0); for (let k = 3; k < th * 0.55; k += 4) line([lx - 2, ly - k], [lx + 2, ly - k], '#c49a62', 1);   // ladder rungs
    const platZ = th * 0.45;
    cyl(cx, cy, r * 0.95, platZ, 2.5, STY.wood, shade(STY.wood, 0.15));
    pod(cx + r * 0.25, cy + r * 0.2, r * 0.42, platZ + 2.5, H * 0.45, band);
    if (band >= 2) { cyl(cx - r * 0.2, cy - r * 0.3, r * 0.6, th * 0.8, 2, STY.wood); pod(cx - r * 0.25, cy - r * 0.3, r * 0.3, th * 0.8 + 2, H * 0.35, band); }
    canopy(cx, cy, th + 10 + band * 3, r * (0.8 + band * 0.12));
    const [px, py] = P(cx + r * 0.95, cy, platZ); lantern(px, py + 6);
    if (band >= 3) { const [qx, qy] = P(cx, cy + r * 0.95, platZ); lantern(qx, qy + 6); const [sx, sy] = P(cx - r * 0.6, cy + r * 0.7, th * 0.8); lantern(sx, sy + 5); }
    return th + 20 + band * 6;
  }
  function hallAsh(x, y, w, d, H, band, o) {
    const cx = x + w / 2, cy = y + d / 2, r = Math.min(w, d) / 2;
    if (band === 0) {
      const top = cone(cx, cy, r * 0.9, 0, H * 1.5, STY.thatch);
      const [ax, ay] = P(cx, cy, top); line([ax - 3, ay - 4], [ax + 2, ay + 2], '#3a2a20', 1.2); line([ax + 3, ay - 4], [ax - 2, ay + 2], '#3a2a20', 1.2);
      const [dx, dy] = P(cx + r * 0.35, cy + r * 0.72); poly([[dx - 3, dy], [dx + 3, dy], [dx, dy - 9]], '#3a2a20', null);
      return top + 4;
    }
    if (band === 1) {
      cyl(cx, cy, r * 0.85, 0, H * 0.55, STY.roof, STY.thatch);
      const [x0, y0, rx] = ell(cx, cy, H * 0.3, r * 0.85); line([x0 - rx, y0], [x0 + rx, y0], '#6a4a30', 1);
      const [dx, dy] = P(cx + r * 0.3, cy + r * 0.8); poly([[dx - 3, dy], [dx + 3, dy], [dx + 3, dy - 8], [dx - 3, dy - 8]], '#2a1e18', null);
      const top = cone(cx, cy, r * 0.95, H * 0.55, H * 0.75, STY.thatch);
      const [ax, ay] = P(cx, cy, top); line([ax, ay], [ax, ay - 6], '#3a2a20', 1.2);
      return top + 6;
    }
    // longhouse of dark timber under a hide roof
    box(x - 0.05, y - 0.05, w + 0.1, d + 0.1, 0, 2, '#4a3e36');
    const b = box(x, y, w, d, 2, H * 0.7, band >= 3 ? STY.stone : STY.wall);
    if (band >= 3) courses(b, 4, shade(STY.stone, -0.18));
    else for (let u = 0.15; u < w; u += 0.25) line(onL(b, u, u, 0, 0)[0], onL(b, u, u, H * 0.7, H * 0.7)[0], shade(STY.wall, -0.25), 0.7);
    door(b, 'L', w / 2, 0.34, 9, '#1e1612');
    skull(...P(x + w / 2, y + d, 2 + 12.5), 0.9);
    const nR = Math.max(1, Math.round(d / 0.7)); for (let i = 0; i < nR; i++) win(b, 'R', d * (i + 0.5) / nR, H * 0.3, 0.16, 4, '#2a1e18');
    const axis = o.axis || (w >= d ? 'x' : 'y');
    const rh = (axis === 'x' ? d : w) * 12;
    const zt = gable(b, rh, STY.thatch, axis, 'thatch', 0.18);
    // crossed tusks at the gable ends
    const ge = axis === 'x' ? P(x + w, y + d / 2, b.z + b.h + rh) : P(x + w / 2, y + d, b.z + b.h + rh);
    line([ge[0], ge[1]], [ge[0] - 5, ge[1] - 7], STY.trim, 1.6); line([ge[0], ge[1]], [ge[0] + 5, ge[1] - 7], STY.trim, 1.6);
    if (o.chim) chimney(x + w * 0.3, y + d * 0.3, b.z + b.h + rh * 0.4, rh * 0.6 + 3, o.chim, '#4a3e36');
    return zt + 7;
  }
  function hall(x, y, w, d, H, band, o = {}) {
    return (RACE === 'hearth' ? hallHearth : RACE === 'delver' ? hallDelver : RACE === 'sylvan' ? hallSylvan : hallAsh)(x, y, w, d, H, band, o);
  }
  function tower(x, y, w, d, H, band, o = {}) {
    const cx = x + w / 2, cy = y + d / 2;
    if (RACE === 'hearth') {
      const b = box(x, y, w, d, 0, H, band >= 2 ? STY.stone2 : STY.wall); if (band >= 2) courses(b, 5, shade(STY.stone2, -0.15)); else timber(b, STY.beam);
      for (let v = 8; v < H - 6; v += 11) { win(b, 'L', w / 2, v, 0.16, 6); win(b, 'R', d / 2, v, 0.16, 6); }
      const zt = band >= 3 ? cone(cx, cy, w * 0.78, H, w * 30, o.roof || STY.roof) : hip(b, w * 15, o.roof || STY.roof, 0.1, 'tile');
      if (o.flag !== false) flagpole(cx, cy, zt - 1, 12, o.flagCol);
      return zt + 12;
    }
    if (RACE === 'delver') {
      const b = box(x, y, w, d, 0, H, STY.stone2); courses(b, 4.5, shade(STY.stone2, -0.15));
      for (let v = 8; v < H - 6; v += 10) { slit(b, 'L', w / 2, v); slit(b, 'R', d / 2, v); }
      box(x - 0.08, y - 0.08, w + 0.16, d + 0.16, H, 3, shade(STY.stone2, -0.15));
      const t = { x: x - 0.08, y: y - 0.08, w: w + 0.16, d: d + 0.16, z: H, h: 3, col: STY.stone2 };
      parapet(t, 3);
      if (o.flag !== false) flagpole(cx, cy, H + 3, 14, o.flagCol);
      return H + 18;
    }
    if (RACE === 'sylvan') {
      roots(cx, cy, 0.2);
      cyl(cx, cy, 0.2, 0, H, STY.beam, shade(STY.beam, 0.15));
      cyl(cx, cy, w * 0.6, H * 0.75, 2, STY.wood);
      pod(cx, cy, w * 0.35, H * 0.75 + 2, 9, band);
      canopy(cx, cy, H + 14, w * 0.75);
      const [lx, ly] = P(cx + w * 0.6, cy, H * 0.75); lantern(lx, ly + 6);
      if (o.flag !== false) rec('flags', { x: P(cx, cy, H + 30)[0], y: P(cx, cy, H + 30)[1], col: o.flagCol || STY.flag, len: 9, seed: R(), pole: 10 });
      return H + 32;
    }
    // ash: stake watchtower
    for (const [px, py] of [[x, y], [x + w, y], [x, y + d], [x + w, y + d]]) line(P(px, py), P(px + (cx - px) * 0.25, py + (cy - py) * 0.25, H), '#3a2a20', 2);
    line(P(x, y + d, H * 0.4), P(x + w, y + d, H * 0.7), '#3a2a20', 1.2); line(P(x + w, y, H * 0.4), P(x + w, y + d, H * 0.7), '#3a2a20', 1.2);
    const pb = box(x - 0.1, y - 0.1, w + 0.2, d + 0.2, H, 4, STY.wall);
    void pb;
    const zt = cone(cx, cy, w * 0.7, H + 4, 14, STY.thatch);
    if (o.flag !== false) flagpole(cx, cy, zt - 1, 11, o.flagCol);
    return zt + 11;
  }

  // ------------------------------------------------------------------
  // building drawers: (slot, level, band) -> height in px (for hit tests)
  // ------------------------------------------------------------------
  const BLD = {};
  BLD.townhall = ([x, y, w, d], L, band) => {
    let top = 0;
    if (RACE === 'sylvan') {
      if (band >= 2) top = tower(x + 1.9, y + 0.05, 0.8, 0.8, 52 + band * 6, band);
      top = Math.max(top, hallSylvan(x + 0.6, y + 0.6, 2.1, 2.1, 22 + band * 3, Math.max(1, band), {}));
      if (band >= 3) { top = Math.max(top, hallSylvan(x + 0.0, y + 1.7, 1.1, 1.1, 18, 1, {})); hallSylvan(x + 1.7, y + 0.0, 1.1, 1.1, 18, 1, {}); }
      if (band < 2) flagpole(x + 2.6, y + 2.6, 0, 26);
      return top;
    }
    if (RACE === 'ash') {
      if (band >= 2) top = tower(x + 2.0, y + 0.1, 0.7, 0.7, 38 + band * 5, band);
      if (band === 0) { top = hallAsh(x + 0.6, y + 0.6, 1.8, 1.8, 18, 0, {}); hallAsh(x + 0.1, y + 1.7, 1.0, 1.0, 12, 0, {}); }
      else if (band === 1) { hallAsh(x + 1.8, y + 0.2, 0.9, 0.9, 12, 0, {}); top = hallAsh(x + 0.5, y + 0.6, 2.0, 2.0, 24, 1, {}); }
      else { if (band >= 3) hallAsh(x + 1.4, y + 0.1, 1.3, 0.9, 20, 2, { axis: 'x' }); top = Math.max(top, hallAsh(x + 0.7, y + 1.0, 2.0, 1.6, 26, band, { axis: 'x', chim: 'hall' })); }
      banner(x + 2.75, y + 2.75, 0, 30 + band * 4); banner(x + 0.2, y + 2.75, 0, 26 + band * 4);
      firePit(x + 2.55, y + 1.0, 0.8);
      return top;
    }
    if (band === 0) { top = hall(x + 0.5, y + 0.7, 1.9, 1.5, 15, 0, { axis: 'x', chim: 'hall' }); flagpole(x + 2.6, y + 2.5, 0, 28); }
    else if (band === 1) { top = hall(x + 0.3, y + 0.5, 2.3, 1.8, 19, 1, { axis: 'x', chim: 'hall' }); flagpole(x + 2.65, y + 2.6, 0, 32); }
    else {
      if (band >= 3) { hall(x + 0.1, y + 0.1, 1.55, 0.95, 22, band, { axis: 'x' }); hall(x + 0.1, y + 1.15, 0.95, 1.55, 22, band, { axis: 'y' }); }
      top = tower(x + 1.8, y + 0.0, 0.9, 0.9, 44 + band * 8, band);
      top = Math.max(top, hall(x + 0.85, y + 0.95, 1.85, 1.65, 23, band, { axis: 'x', chim: 'hall', hip: band >= 3 }));
      if (band >= 3) { banner(x + 2.75, y + 2.75, 0, 34); banner(x + 0.2, y + 2.75, 0, 30); banner(x + 2.75, y + 0.2, 0, 30); }
    }
    if (RACE === 'hearth' && band <= 1) { // bell post
      const [bx, by] = P(x + 0.25, y + 2.6); line([bx - 3, by], [bx - 3, by - 16], '#6a4a30', 1.4); line([bx + 3, by], [bx + 3, by - 16], '#6a4a30', 1.4); line([bx - 4, by - 16], [bx + 4, by - 16], '#6a4a30', 1.6);
      circ(bx, by - 13, 2.2, '#c9a03a', OUT);
    }
    return top;
  };
  BLD.cottage = (x, y, band, i) => {
    const s = [1.0, 1.15, 1.25, 1.3][band];
    const ax = i % 2 ? 'x' : 'y';
    if (RACE === 'sylvan') {
      if (band === 0) return hallSylvan(x, y, s, s, 12, 0, {});
      if (i % 3 === 2 && band >= 2) return hallSylvan(x - 0.05, y - 0.05, s + 0.1, s + 0.1, 16, 1, {});
      const r = s * 0.42; roots(x + s / 2, y + s / 2, 0.12);
      cyl(x + s / 2, y + s / 2, 0.13, 0, 8 + band * 3, STY.beam);
      pod(x + s / 2, y + s / 2, r, 8 + band * 3, 9 + band, band);
      const [lx, ly] = P(x + s / 2 + r, y + s / 2, 8 + band * 3); lantern(lx + 1, ly + 4, 1.4);
      return 30 + band * 4;
    }
    if (RACE === 'ash') {
      if (band === 0 || i % 2) return hallAsh(x, y, s, s, 12 + band * 1.5, 0, {});
      if (band < 3 || i % 3) return hallAsh(x, y, s, s, 15 + band, 1, {});
      return hallAsh(x, y + 0.1, s, s * 0.85, 17, 2, { axis: ax });
    }
    if (RACE === 'delver') {
      const top = hallDelver(x, y, s, s * 0.9, 10 + band * 3, band >= 2 ? 1 : band, { chim: 'house' });
      return top;
    }
    const H = [11, 13, 17, 18][band];
    const top = hallHearth(x, y, s, s * 0.9, H, band, { axis: ax, chim: 'house' });
    if (band >= 1) { const [fx, fy] = P(x + s * 0.2, y + s * 0.9 + 0.08); for (let k = 0; k < 3; k++) circ(fx + k * 3, fy - 2, 1.3, ['#e85a6a', '#f2c94c', '#ffffff'][k]); }
    return top;
  };
  BLD.warehouse = ([x, y, w, d], L, band) => {
    let top;
    if (RACE === 'sylvan') {
      const n = 1 + Math.min(2, band);
      const pos = [[x + 0.55, y + 0.6], [x + 1.45, y + 0.9], [x + 0.75, y + 1.7]];
      top = 0;
      for (let i = 0; i < n; i++) {
        const [cx, cy] = pos[i];
        for (const [dx, dy] of [[-0.25, 0], [0.25, 0], [0, 0.25], [0, -0.25]]) line(P(cx + dx, cy + dy), P(cx + dx, cy + dy, 8), STY.beam, 1.6);
        cyl(cx, cy, 0.42, 8, 14 + band * 2, '#c9a66a', '#d9b87a');
        const [bx, by] = P(cx, cy, 8); for (let k = 3; k < 14; k += 3.5) { c.beginPath(); c.ellipse(bx, by - k, 0.42 * SQ2 * HW, 0.42 * SQ2 * HH, 0, 0, Math.PI); c.strokeStyle = F('#a07a44'); c.lineWidth = 0.7; c.stroke(); }
        top = Math.max(top, dome(cx, cy, 0.5, 22 + band * 2, 9, STY.roof));
      }
      sack(x + 1.7, y + 2.2); sack(x + 1.95, y + 2.1);
      return top;
    }
    if (RACE === 'ash') {
      top = hallAsh(x + 0.2, y + 0.2, 1.4, 1.4, 18 + band * 3, Math.min(2, band + 1), { axis: 'y' });
      for (const [gx, gy] of [[x + 1.65, y + 1.8], [x + 1.4, y + 2.15], [x + 0.4, y + 2.1]]) { crate(gx, gy, 0.26); sack(gx + 0.2, gy + 0.25); }
      const [cx, cy] = P(x + 1.0, y + 2.25); poly([[cx - 6, cy], [cx + 6, cy], [cx + 4, cy - 6], [cx - 4, cy - 6]], '#7a5428'); circ(cx, cy - 6, 1.2, '#e2b84a');
      return top;
    }
    if (RACE === 'delver') {
      const b = { x: x + 0.15, y: y + 0.2, w: w - 0.3, d: d - 0.5 };
      top = hallDelver(b.x, b.y, b.w, b.d, 14 + band * 3, band, {});
      const [vx, vy] = P(b.x + b.w * 0.5, b.y + b.d, 2 + 8);
      circ(vx, vy, 6, '#6b6b70', OUT); circ(vx, vy, 4.2, '#8a8a90', OUT); for (let k = 0; k < 6; k++) line([vx, vy], [vx + Math.cos(k) * 4, vy + Math.sin(k) * 4], '#4a4a50', 0.8);
      crate(x + 1.5, y + 2.0); barrel(x + 0.4, y + 2.15);
      return top;
    }
    // hearth: a barn with big doors
    const wallCol = band >= 2 ? STY.stone2 : '#a2563a';
    box(x + 0.1, y + 0.15, w - 0.2, d - 0.4, 0, 2.5, '#8d857a');
    const b = box(x + 0.1, y + 0.15, w - 0.2, d - 0.4, 2.5, 14 + band * 3, wallCol);
    if (band >= 2) courses(b, 4, shade(wallCol, -0.15)); else for (let u = 0.12; u < b.d; u += 0.18) line(onR(b, u, u, 0, 0)[0], onR(b, u, u, b.h, b.h)[0], shade(wallCol, -0.3), 0.6);
    const dw = 0.7, u = b.w / 2;
    poly(onL(b, u - dw / 2, u + dw / 2, 0, 11), '#6b3e22'); line(onL(b, u, u, 0, 0)[0], onL(b, u, u, 11, 11)[0], '#3a2414', 1);
    line(onL(b, u - dw / 2, u, 0, 11)[0], onL(b, u - dw / 2, u, 0, 11)[2], '#e8dcc4', 1); line(onL(b, u, u + dw / 2, 0, 11)[0], onL(b, u, u + dw / 2, 0, 11)[2], '#e8dcc4', 1);
    win(b, 'L', u, 13, 0.25, 3.5);
    top = gable(b, b.w * 11, band >= 1 ? STY.roof : STY.thatch, 'y', band >= 1 ? 'tile' : 'thatch');
    crate(x + 1.6, y + 2.0); crate(x + 1.62, y + 1.98, 0.22, 6); barrel(x + 0.35, y + 2.2); barrel(x + 0.55, y + 2.25); sack(x + 1.3, y + 2.25);
    return top;
  };
  function stall(gx, gy, col, kind) {
    box(gx, gy, 0.6, 0.32, 0, 5, STY.wood);
    const [cx, cy] = P(gx + 0.3, gy + 0.16, 5);
    for (let k = 0; k < 4; k++) circ(cx - 4 + k * 2.6, cy - 1, 1.3, ['#e2b84a', '#c0392b', '#7cae4a', '#e8873a'][(k + Math.floor(gx * 7)) % 4]);
    for (const [px, py] of [[gx, gy + 0.32], [gx + 0.6, gy + 0.32], [gx + 0.6, gy]]) line(P(px, py, 0), P(px, py, 11), '#5a4030', 1);
    const q = [P(gx - 0.06, gy - 0.05, 13), P(gx + 0.66, gy - 0.05, 13), P(gx + 0.66, gy + 0.5, 8.5), P(gx - 0.06, gy + 0.5, 8.5)];
    poly(q, kind === 'hide' ? '#a9784e' : kind === 'leaf' ? '#5c9b48' : col);
    if (kind === 'stripe') for (let k = 1; k < 6; k += 2) {
      const t0 = k / 6, t1 = (k + 1) / 6, lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      poly([lerp(q[0], q[1], t0), lerp(q[0], q[1], t1), lerp(q[3], q[2], t1), lerp(q[3], q[2], t0)], SNOW ? '#f2f5f8' : '#f6eedc', null);
    }
    if (kind === 'leaf') lantern(q[2][0], q[2][1] + 4, 1.3);
  }
  BLD.market = ([x, y, w, d], L, band) => {
    const kind = RACE === 'ash' ? 'hide' : RACE === 'sylvan' ? 'leaf' : 'stripe';
    const spots = [[x + 0.15, y + 0.15], [x + 1.6, y + 0.2], [x + 0.2, y + 1.55], [x + 1.75, y + 1.6], [x + 1.0, y + 2.1]];
    const n = Math.min(5, 2 + band + (L >= 3 ? 1 : 0));
    let top = 16;
    if (band >= 2) { // covered market hall in the middle
      const cx = x + 0.85, cy = y + 0.85;
      for (const [px, py] of [[cx, cy], [cx + 0.9, cy], [cx, cy + 0.9], [cx + 0.9, cy + 0.9]]) line(P(px, py), P(px, py, 15), '#5a4030', 1.6);
      const b = { x: cx, y: cy, w: 0.9, d: 0.9, z: 0, h: 15, col: STY.wall };
      top = RACE === 'ash' ? cone(cx + 0.45, cy + 0.45, 0.7, 15, 14, STY.thatch) : RACE === 'sylvan' ? dome(cx + 0.45, cy + 0.45, 0.65, 15, 12, STY.roof) : hip(b, 12, RACE === 'delver' ? STY.roof : STY.roof, 0.14, 'tile');
      if (band >= 3) flagpole(cx + 0.45, cy + 0.45, top - 1, 12);
      sack(cx + 0.3, cy + 0.6); crate(cx + 0.5, cy + 0.3, 0.24);
    }
    for (let i = 0; i < n; i++) stall(spots[i][0], spots[i][1], STY.cloth[i % STY.cloth.length], kind);
    barrel(x + 2.4, y + 1.2); sack(x + 1.2, y + 1.4);
    return top + 6;
  };
  BLD.academy = ([x, y, w, d], L, band) => {
    let top;
    if (RACE === 'sylvan') {
      top = hallSylvan(x + 0.2, y + 0.1, 1.8, 1.8, 22, Math.max(1, band), {});
      for (let k = 0; k < 3 + band; k++) { const [sx, sy] = P(x + 0.4 + k * 0.4, y + 1.0, 34 + (k % 2) * 8 + band * 4); lampDot(sx, sy, 1.6, '#bfe8ff', '#cfefff'); rec('sparks', { x: sx, y: sy, kind: 'star' }); }
      return top;
    }
    if (RACE === 'ash') {
      top = hallAsh(x + 0.2, y + 0.2, 1.5, 1.5, 18, Math.min(1, band), {});
      const [tx, ty] = P(x + 2.0, y + 1.6); // totem pole
      poly([[tx - 2.5, ty], [tx + 2.5, ty], [tx + 2.5, ty - 30 - band * 4], [tx - 2.5, ty - 30 - band * 4]], '#6a4a30');
      for (let k = 0; k < 3; k++) { const yy = ty - 8 - k * 9; circ(tx - 1, yy, 1, '#e2d6bb'); circ(tx + 1, yy, 1, '#e2d6bb'); line([tx - 2.5, yy + 3], [tx + 2.5, yy + 3], '#a3221b', 1.2); }
      skull(tx, ty - 33 - band * 4, 1.1);
      return Math.max(top, 40 + band * 4);
    }
    if (RACE === 'delver') {
      top = hallDelver(x + 0.15, y + 0.2, 1.9, 1.5, 16 + band * 2, band, {});
      // telescope on the roof
      const [tx, ty] = P(x + 1.1, y + 0.9, top); line([tx, ty], [tx + 9, ty - 9], '#c9a03a', 3); line([tx, ty], [tx - 3, ty + 4], '#5a4a3a', 1.2); line([tx, ty], [tx + 3, ty + 4], '#5a4a3a', 1.2);
      return top + 12;
    }
    top = hall(x + 0.75, y + 0.2, 1.5, 1.5, 15 + band * 2, band, { axis: 'y', roof: band >= 1 ? '#3d5f8a' : null });
    if (band >= 1) {
      const H = 30 + band * 7;
      const b = box(x + 0.15, y + 0.6, 0.8, 0.8, 0, H, band >= 2 ? STY.stone2 : STY.wall); if (band >= 2) courses(b, 5, shade(STY.stone2, -0.15));
      for (let v = 8; v < H - 5; v += 10) { win(b, 'L', 0.4, v, 0.15, 5); win(b, 'R', 0.4, v, 0.15, 5); }
      top = Math.max(top, band >= 3 ? dome(x + 0.55, y + 1.0, 0.5, H, 12, '#5d7fa8') : cone(x + 0.55, y + 1.0, 0.6, H, 22, '#3d5f8a'));
      if (band >= 3) { const [tx, ty] = P(x + 0.55, y + 1.0, H + 8); line([tx, ty], [tx + 8, ty - 6], '#c9a03a', 2.4); }
    }
    return top;
  };
  BLD.smelter = ([x, y, w, d], L, band) => {
    let top = hall(x + 0.2, y + 0.9, 1.6, 1.3, 14 + band * 2, band, { axis: 'x' });
    const stacks = 1 + (band >= 2 ? 1 : 0) + (band >= 3 ? 1 : 0);
    for (let i = 0; i < stacks; i++) {
      const sx = x + 1.75 + (i % 2) * 0.1, sy = y + 0.15 + i * 0.62;
      const H = 34 + band * 7 - i * 4;
      const b = box(sx, sy, 0.5, 0.5, 0, H, RACE === 'ash' ? '#5e5652' : '#9a8f84');
      courses(b, 5, shade('#9a8f84', -0.25));
      box(sx - 0.05, sy - 0.05, 0.6, 0.6, H, 2, '#5a524c');
      const [px, py] = P(sx + 0.25, sy + 0.25, H + 3);
      rec('smoke', { x: px, y: py, kind: 'smelter', seed: R(), dark: true });
      top = Math.max(top, H + 4);
      if (i === 0) { lamp(onL(b, 0.12, 0.38, 2, 8), '#e8742a', '#ffb04a'); rec('fires', { x: P(sx + 0.25, sy + 0.5, 4)[0], y: P(sx + 0.25, sy + 0.5, 4)[1], s: 0.45, glowOnly: true }); }
    }
    // ore + charcoal heaps
    const [ox, oy] = P(x + 0.5, y + 0.4); c.beginPath(); c.ellipse(ox, oy - 1, 8, 4, 0, Math.PI, TAU); c.fillStyle = F('#7a6a62'); c.fill();
    for (let k = 0; k < 6; k++) circ(ox - 5 + k * 2, oy - 2 - (k % 2) * 2, 1.5, k % 2 ? '#a0522d' : '#6a5a52');
    const [kx, ky] = P(x + 0.4, y + 2.3); c.beginPath(); c.ellipse(kx, ky - 1, 6, 3, 0, Math.PI, TAU); c.fillStyle = F('#2e2a28'); c.fill();
    return top;
  };
  BLD.smithy = ([x, y, w, d], L, band) => {
    const top = hall(x + 0.2, y + 0.2, 1.7, 1.4, 14 + band * 2, band, { axis: 'x', chim: 'smithy' });
    // open forge lean-to with anvil
    const fx = x + 1.0, fy = y + 1.7;
    for (const [px, py] of [[fx, fy + 0.6], [fx + 1.1, fy + 0.6]]) line(P(px, py), P(px, py, 12), STY.beam, 1.6);
    poly([P(fx - 0.05, fy, 15), P(fx + 1.15, fy, 15), P(fx + 1.15, fy + 0.7, 11), P(fx - 0.05, fy + 0.7, 11)], roofCol(RACE === 'ash' ? STY.thatch : RACE === 'sylvan' ? STY.roof : '#7a6a5a'));
    box(fx + 0.1, fy + 0.05, 0.4, 0.35, 0, 6, '#6a625c');
    lampDot(...P(fx + 0.3, fy + 0.4, 4), 1.8, '#e8742a', '#ffb04a');
    const [ax, ay] = P(fx + 0.8, fy + 0.35);
    poly([[ax - 3, ay], [ax + 3, ay], [ax + 1.5, ay - 3], [ax + 4, ay - 4.5], [ax - 4, ay - 4.5], [ax - 1.5, ay - 3]], '#3a3a40');
    rec('anvils', { x: ax, y: ay - 5 });
    // hanging sign with hammer
    const [sx, sy] = P(x + 0.2, y + 1.9, 14); line([sx, sy], [sx - 6, sy - 2], STY.beam, 1.2);
    poly([[sx - 9, sy - 1], [sx - 3, sy - 1], [sx - 3, sy + 5], [sx - 9, sy + 5]], '#c9a874'); line([sx - 7.5, sy + 4], [sx - 4.5, sy], '#3a3a40', 1.2);
    return top;
  };
  BLD.armory = ([x, y, w, d], L, band) => {
    const top = hall(x + 0.2, y + 0.2, 1.4, 1.8, 15 + band * 2, band, { axis: 'y', chim: 'armory' });
    // weapon rack
    const rx = x + 1.8, ry = y + 0.5;
    line(P(rx, ry, 3), P(rx, ry + 1.2, 3), STY.beam, 1.4); line(P(rx, ry, 9), P(rx, ry + 1.2, 9), STY.beam, 1.4);
    for (let k = 0; k < 5; k++) { const a = P(rx, ry + 0.1 + k * 0.25, 0), b = P(rx, ry + 0.1 + k * 0.25, 16); line(a, b, '#7a5a3a', 1); poly([[b[0] - 1.2, b[1] + 1], [b[0] + 1.2, b[1] + 1], [b[0], b[1] - 3]], '#c8ccd2', null); }
    // shield sign
    const [sx, sy] = P(x + 0.9, y + 2.0, 13);
    circ(sx, sy, 4.2, STY.flag, OUT); circ(sx, sy, 1.4, '#d9b44a');
    crate(x + 1.85, y + 1.9);
    return top;
  };
  BLD.bakery = ([x, y, w, d], L, band) => {
    hallHearth(x + 0.85, y + 0.75, 1.0, 1.05, 12 + band, Math.min(band, 1), { axis: 'y', chim: 'bakery' });
    // windmill tower (tapered) at the back corner
    const mx = x + 0.05, my = y + 0.05, mw = 0.8, H = 32 + band * 5, i = 0.14;
    const col = band >= 2 ? STY.stone2 : STY.wall;
    poly([P(mx + mw, my, 0), P(mx + mw, my + mw, 0), P(mx + mw - i, my + mw - i, H), P(mx + mw - i, my + i, H)], shade(col, -0.2));
    poly([P(mx, my + mw, 0), P(mx + mw, my + mw, 0), P(mx + mw - i, my + mw - i, H), P(mx + i, my + mw - i, H)], col);
    win({ x: mx, y: my, w: mw, d: mw, z: 0 }, 'L', mw / 2, 14, 0.14, 5);
    door({ x: mx, y: my, w: mw, d: mw, z: 0 }, 'L', mw / 2, 0.22, 7);
    const zt = cone(mx + mw / 2, my + mw / 2, mw * 0.5, H, 14, STY.thatch);
    const [hx, hy] = P(mx + mw / 2, my + mw - i + 0.12, H - 2);
    circ(hx, hy, 1.8, '#5a4030');
    rec('sails', { x: hx, y: hy, r: 19 + band * 1.5 });
    sack(x + 1.75, y + 1.85); sack(x + 1.55, y + 1.92);
    return Math.max(zt, H + 20);
  };
  BLD.runeforge = ([x, y, w, d], L, band) => {
    const top = hallDelver(x + 0.15, y + 0.15, 1.35, 1.35, 15 + band * 2, Math.max(1, band), { runes: true, chim: 'runeforge' });
    // standing rune stones
    for (const [gx, gy] of [[x + 1.75, y + 0.4], [x + 1.75, y + 1.2], [x + 0.5, y + 1.75], [x + 1.2, y + 1.8]]) {
      const b = box(gx - 0.1, gy - 0.08, 0.2, 0.16, 0, 11, '#7a756e');
      lamp(onL(b, 0.07, 0.13, 3, 8), '#4fc3f7', '#9cf0ff');
      const [sx, sy] = P(gx, gy + 0.08, 6); rec('sparks', { x: sx, y: sy, kind: 'rune' });
    }
    return top;
  };
  BLD.heartgrove = ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, r = 0.32 + band * 0.07, th = 38 + band * 10 + L;
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const [sx, sy] = P(cx + Math.cos(a) * 0.95, cy + Math.sin(a) * 0.95); circ(sx, sy - 1.5, 1.8, '#a8a8a0', OUT); }
    roots(cx, cy, r * 1.4);
    cyl(cx, cy, r, 0, th, '#7a5a3c', '#8a6a4a');
    const [tx, ty] = P(cx, cy + r, 0); for (let k = 6; k < th; k += 7) line([tx - 2, ty - k], [tx + 1, ty - k - 3], '#5a3e28', 1);
    lamp([[tx - 1.5, ty - th * 0.3], [tx + 1.5, ty - th * 0.3], [tx + 1.5, ty - th * 0.3 - 5], [tx - 1.5, ty - th * 0.3 - 5]], '#7fe0c0', '#b0ffe0');
    const [x0, y0] = P(cx, cy, th + 14);
    const Rr = (1.2 + band * 0.22) * HW;
    const cols = SEASON === 3 ? ['#3a6a7a', '#5a9ab0', '#e9f6f8'] : ['#1f7a6a', '#38b090', '#9af0d0'];
    blobs(x0, y0, Rr, cols, false);
    for (let k = 0; k < 6 + band * 3; k++) { const a = R() * TAU, rr = R() * Rr * 0.9; const gx = x0 + Math.cos(a) * rr, gy = y0 + Math.sin(a) * rr * 0.7; lampDot(gx, gy, 1.4, '#d8ffe8', '#c8ffe0'); }
    rec('sparks', { x: x0, y: y0, kind: 'grove', r: Rr });
    rec('lights', { x: x0, y: y0, r: Rr * 1.6, col: 'grove' });
    return th + 14 + Rr * 0.9;
  };
  BLD.warpit = ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, r = 1.05 + band * 0.04, dep = 10 + band * 3;
    const stakes = (from, to) => {
      for (let k = 0; k < 22; k++) {
        const a = k / 22 * TAU; if (a < from || a >= to) continue;
        const gx = cx + Math.cos(a) * (r + 0.18), gy = cy + Math.sin(a) * (r + 0.18);
        const b = P(gx, gy), t = P(gx, gy, 12 + (k % 3) * 2);
        line(b, t, k % 4 === 0 ? STY.trim : '#4a3426', 2); if (k % 5 === 0) skull(t[0], t[1] - 1, 0.8);
      }
    };
    // back stakes: angles where the point is "behind" (sin+cos < 0)
    stakes(Math.PI * 0.75, Math.PI * 1.75);
    const [ex, ey, rx, ry] = ell(cx, cy, 0, r);
    c.save(); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, TAU); c.clip();
    c.fillStyle = F('#4a3a30'); c.fill();
    for (let k = 1; k < 3; k++) { c.beginPath(); c.ellipse(ex, ey + k * dep / 3, rx * (1 - k * 0.06), ry * (1 - k * 0.06), 0, Math.PI, TAU); c.strokeStyle = F('#6a5444'); c.lineWidth = 1.5; c.stroke(); }
    c.beginPath(); c.ellipse(ex, ey + dep, rx * 0.82, ry * 0.82, 0, 0, TAU); c.fillStyle = F(SNOW ? '#d8d4cc' : '#c9a878'); c.fill();
    c.restore();
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, TAU); c.strokeStyle = F('#3a2a20'); c.lineWidth = 1.4; c.stroke();
    stakes(-1, Math.PI * 0.75); stakes(Math.PI * 1.75, 7);
    rec('pit', { x: ex, y: ey + dep, rx: rx * 0.6, ry: ry * 0.6 });
    for (const a of [0.2, 3.4]) { const gx = cx + Math.cos(a) * (r + 0.45), gy = cy + Math.sin(a) * (r + 0.45); const [bx, by] = P(gx, gy); line([bx, by], [bx, by - 9], '#3a2a20', 1.6); rec('fires', { x: bx, y: by - 10, s: 0.7 }); rec('lights', { x: bx, y: by - 12, r: 22 }); }
    banner(x + 0.1, y + d - 0.1, 0, 26 + band * 4); if (band >= 2) banner(x + w - 0.1, y + 0.1, 0, 26 + band * 4);
    return 34 + band * 4;
  };
  BLD.barracks = ([x, y, w, d], L, band) => {
    let top;
    if (RACE === 'ash') {
      top = hallAsh(x + 0.1, y + 0.1, 1.4, 1.4, 18, Math.min(2, band + 1), { axis: 'x' });
      hallAsh(x + 1.8, y + 0.2, 1.0, 1.0, 14, 0, {}); if (band >= 1) hallAsh(x + 1.7, y + 1.3, 1.1, 1.1, 14, 0, {});
    } else if (RACE === 'sylvan') {
      top = hallSylvan(x + 0.2, y + 0.1, 1.6, 1.6, 20, Math.max(1, band), {});
      hallSylvan(x + 1.9, y + 0.4, 1.0, 1.0, 12, 0, {});
    } else top = hall(x + 0.15, y + 0.15, 2.7, 1.3, 15 + band * 2, band, { axis: 'x', chim: band >= 1 ? 'hall' : null });
    // training dummies and weapon rack in front
    for (const gx of [x + 0.5, x + 1.3, x + 2.1]) {
      const [dx, dy] = P(gx, y + 2.15);
      line([dx, dy], [dx, dy - 12], '#5a4030', 1.4); line([dx - 4, dy - 9], [dx + 4, dy - 9], '#5a4030', 1.3);
      c.beginPath(); c.ellipse(dx, dy - 7, 2.6, 3.6, 0, 0, TAU); c.fillStyle = F('#d9be7a'); c.fill(); c.strokeStyle = F(OUT); c.lineWidth = 0.7; c.stroke();
      circ(dx, dy - 12.5, 2, '#d9be7a', OUT);
    }
    flagpole(x + w - 0.1, y + d - 0.1, 0, 28 + band * 3);
    return top;
  };
  BLD.stable = ([x, y, w, d], L, band) => {
    let top;
    if (RACE === 'ash') top = hallAsh(x + 0.1, y + 0.1, 1.3, 1.3, 16, Math.min(2, band + 1), {});
    else if (RACE === 'sylvan') top = hallSylvan(x + 0.1, y + 0.1, 1.4, 1.4, 18, Math.max(1, band), {});
    else top = hall(x + 0.1, y + 0.1, 1.2, 2.2, 12 + band * 2, band, { axis: 'y' });
    // paddock
    fence([[x + 1.5, y + 0.2], [x + 2.75, y + 0.2], [x + 2.75, y + 2.5], [x + 1.5, y + 2.5]], 6, '#8a6440');
    const kind = { hearth: 'horse', delver: 'boar', sylvan: 'stag', ash: 'wolf' }[RACE];
    const n = Math.min(4, 1 + Math.floor(L / 4));
    const spots = [[x + 2.1, y + 0.8, 1], [x + 2.3, y + 1.8, -1], [x + 1.9, y + 1.3, -1], [x + 2.5, y + 1.2, 1]];
    for (let i = 0; i < n; i++) animal(spots[i][0], spots[i][1], kind, spots[i][2]);
    haystack(x + 1.6, y + 2.2, 0.6);
    return top;
  };
  BLD.farm = ([x, y, w, d], L, band) => {
    const top = RACE === 'sylvan' ? hallSylvan(x + 0.4, y + 0.4, 1.3, 1.3, 14, Math.min(band, 1), {})
      : RACE === 'ash' ? hallAsh(x + 0.4, y + 0.4, 1.3, 1.3, 14, Math.min(band, 1), {})
      : RACE === 'delver' ? hallDelver(x + 0.4, y + 0.4, 1.3, 1.1, 11, Math.min(band, 1), { chim: 'house' })
      : hallHearth(x + 0.4, y + 0.4, 1.4, 1.1, 12, Math.min(band, 1), { axis: 'x', chim: 'house' });
    if (band >= 2) { // barn
      const b = box(x + 0.1, y + 1.65, 1.1, 0.6, 0, 11, RACE === 'hearth' ? '#a2563a' : STY.wood);
      gable(b, 7, RACE === 'ash' ? STY.thatch : STY.roof, 'x', 'tile');
    }
    haystack(x + 1.95, y + 0.5, 0.9); if (L >= 6) haystack(x + 2.0, y + 1.4, 0.75);
    return top;
  };
  const siteMul = g => (REG && REG.site && REG.site[g]) || 1;
  BLD.lumber = ([x, y, w, d], L, band) => {
    const top = hall(x + 0.2, y + 0.2, 1.3, 1.1, 11 + band, Math.min(band, 2), { axis: 'y' });
    const tb = siteMul('timber');
    const piles = clampv(1 + Math.floor(L / 5) + Math.round((tb - 1) * 2.5), 1, 5);
    const spots = [[0.1, 0.55], [0.5, 0.55], [0.1, 0.78], [0.5, 0.78], [0.62, 0.08]];
    for (let i = 0; i < piles; i++) logPile(x + spots[i][0] * w, y + spots[i][1] * d, 0.85, i > 1 ? 2 : 3);
    const stumps = [[0.86, 0.12], [0.93, 0.42], [0.85, 0.93], [0.06, 0.96], [0.72, 0.66], [0.95, 0.75], [0.4, 0.97]];
    const ns = clampv(3 + Math.round((tb - 1) * 4) + band, 2, stumps.length);
    for (let i = 0; i < ns; i++) stump(x + stumps[i][0] * w, y + stumps[i][1] * d);
    // chopping block with axe
    const bxg = x + 0.75 * w, byg = y + 0.42 * d;
    const [bx, by] = P(bxg, byg); cyl(bxg, byg, 0.14, 0, 4, '#7a5434', '#c9a874'); line([bx, by - 4], [bx + 4, by - 10], '#5a4030', 1.2); poly([[bx + 3, by - 11], [bx + 6, by - 10], [bx + 5, by - 8]], '#c8ccd2', null);
    if (tb > 1.15) { const [fx, fy] = P(x + 0.9 * w, y + 0.25 * d); person(fx, fy, '#7a5a3a'); line([fx + 2, fy - 6], [fx + 6, fy - 11], '#5a4030', 1.1); }
    if (band >= 2) { const [sx, sy] = P(x + 1.55, y + 0.75, 8); circ(sx, sy, 5, '#b8bcc4', OUT); circ(sx, sy, 1.2, '#5a5a60'); }
    return top;
  };
  BLD.quarry = ([x, y, w, d], L, band) => {
    const st = siteMul('stone');
    const ext = clampv((0.55 + 0.35 * Math.min(1, L / 12)) * (0.78 + 0.25 * st), 0.4, 1), dep = 8 + band * 5 + Math.max(0, st - 1) * 8;
    const pw = (w - 0.4) * ext, pd = (d - 0.5) * ext, px = x + 0.2, py = y + 0.25;
    const rimc = '#b9b0a0';
    poly(quad(px - 0.15, py - 0.15, pw + 0.3, pd + 0.3), SNOW ? '#e6ebee' : shade(rimc, -0.05), null);
    c.save(); path(quad(px, py, pw, pd)); c.clip();
    poly([P(px, py, 0), P(px + pw, py, 0), P(px + pw, py, -dep), P(px, py, -dep)], '#c4baa8');
    poly([P(px, py, 0), P(px, py + pd, 0), P(px, py + pd, -dep), P(px, py, -dep)], '#958b7c');
    poly(quad(px, py, pw, pd, -dep), '#a89e8e');
    poly([P(px, py, -dep * 0.5), P(px + pw, py, -dep * 0.5), P(px + pw, py + 0.3, -dep * 0.5), P(px + 0.3, py + 0.3, -dep * 0.5), P(px + 0.3, py + pd, -dep * 0.5), P(px, py + pd, -dep * 0.5)], '#b3a998');
    for (let u = 0.3; u < pw; u += 0.4) line(P(px + u, py, -1), P(px + u, py, -dep * 0.45), '#a0968a', 0.6);
    for (let k = 0; k < 3; k++) box(px + 0.5 + k * 0.6, py + pd - 0.6, 0.3, 0.25, -dep, 5, '#d0c6b4');
    c.restore();
    poly(quad(px, py, pw, pd), null, '#6a6258', 1);
    const sx = x + w - 0.8, sy = y + d - 0.65;
    const stacks = clampv(1 + Math.floor(L / 5) + Math.round((st - 1) * 2), 1, 5);
    for (let i = 0; i < stacks; i++) { box(sx - i * 0.5, sy, 0.4, 0.35, 0, 6, '#cfc5b2'); if (i < 2) box(sx - i * 0.5 + 0.05, sy + 0.05, 0.3, 0.25, 6, 5, '#d8cebc'); }
    if (band >= 2 || st > 1.3) {
      const [ax, ay] = P(px + pw + 0.1, py + 0.3); line([ax, ay], [ax - 3, ay - 26], '#6a4a30', 1.6); line([ax - 3, ay - 26], [ax - 18, ay - 18], '#6a4a30', 1.4); line([ax - 18, ay - 18], [ax - 18, ay - 4], '#3a2a20', 0.7);
      box(px + pw * 0.4, py + 0.4, 0.2, 0.2, -2, 4, '#d0c6b4');
    }
    return 14 + band * 6;
  };
  // the mine's hill (drawn even before the mine is dug)
  function mound([x, y, w, d]) {
    const ore = siteMul('ore'), ridge = REG && REG.ter && ['mountain', 'hills'].includes(REG.ter[secOf(x + w / 2, y + d / 2)]);
    const hk = (0.75 + 0.3 * ore) * (ridge ? 1.15 : 1);
    const col = RACE === 'delver' || (REG && REG.ter[secOf(x + w / 2, y + d / 2)] === 'mountain') ? '#8a8276' : '#8d8a68';
    const Q = (gx, gy, z = 0) => P(x + gx, y + gy, z * hk);
    const L0 = Q(-0.85, d + 0.5), Fr = Q(w + 0.1, d + 0.1), Rb = Q(w + 0.5, -1.05), Pk = Q(0.15, -0.05, 56);
    c.beginPath(); c.moveTo(...L0); c.quadraticCurveTo(...Q(-0.9, 1.0, 50), ...Pk); c.quadraticCurveTo(...Q(1.2, -1.1, 50), ...Rb); c.lineTo(...Fr); c.closePath();
    gradFill(L0[0], Rb[0], col);
    c.beginPath(); c.moveTo(...Pk); c.quadraticCurveTo(...Q(1.2, -1.1, 50), ...Rb); c.lineTo(...Fr); c.quadraticCurveTo(...Q(1.9, 1.7, 30), ...Pk); c.closePath();
    c.fillStyle = GLOW ? '#000' : 'rgba(30,25,20,0.16)'; c.fill();
    c.beginPath(); c.moveTo(...Q(-0.5, 0.4, 50)); c.quadraticCurveTo(...Pk, ...Q(0.6, -0.7, 50)); c.quadraticCurveTo(...Q(0.3, 0.1, 46), ...Q(-0.5, 0.4, 50)); c.closePath();
    c.fillStyle = F(SNOW ? '#f4f8fa' : shade(col, 0.2)); c.fill();
    rock(x + 1.6, y + 0.0, 0.8, shade(col, 0.05)); rock(x - 0.1, y + 1.7, 0.7, shade(col, 0.05));
    if (RACE !== 'delver') { treePine(x - 0.45, y + 1.8, 0.7); treePine(x + 2.0, y - 0.6, 0.65); }
  }
  BLD.mine = ([x, y, w, d], L, band) => {
    const ore = siteMul('ore');
    const mx = x + w * 0.35, my = y + d - 0.05;
    const [px, py] = P(mx, my);
    const sz = 0.8 + 0.25 * ore;
    const H = (14 + band * 2) * sz, W2 = (6 + band) * sz;
    path([[px - W2, py], [px - W2, py - H * 0.7], [px, py - H], [px + W2, py - H * 0.7], [px + W2, py]]); c.fillStyle = F('#1f1a17'); c.fill();
    const fc = RACE === 'delver' ? '#8c867e' : '#6a4a30', lw = RACE === 'delver' ? 3 : 2.2;
    line([px - W2, py], [px - W2, py - H * 0.72], fc, lw); line([px + W2, py], [px + W2, py - H * 0.72], fc, lw); line([px - W2 - 2, py - H * 0.72], [px + W2 + 2, py - H * 0.72], fc, lw + 0.5);
    if (RACE === 'delver') poly([[px - W2 - 3, py - H * 0.72], [px, py - H - 4], [px + W2 + 3, py - H * 0.72]], '#8c867e');
    lantern(px + W2 + 3, py - H * 0.5, 1.6);
    const rl = Math.max(0.3, Math.min(1.6, N - 0.3 - my));
    for (let k = 0; k * 0.28 < rl - 0.1; k++) { const gy = my + 0.1 + k * 0.28; line(P(mx - 0.22, gy), P(mx + 0.22, gy), '#6a4a30', 1.4); }
    line(P(mx - 0.15, my), P(mx - 0.15, my + rl), '#5a5a60', 1); line(P(mx + 0.15, my), P(mx + 0.15, my + rl), '#5a5a60', 1);
    const cy0 = my + Math.min(0.7, rl - 0.5);
    box(mx - 0.2, cy0, 0.4, 0.45, 2, 5, '#6a5a4a');
    const [cx, cy] = P(mx, cy0 + 0.22, 7.5); for (let k = 0; k < 4; k++) circ(cx - 3 + k * 2, cy - (k % 2), 1.6, k % 2 ? '#a0522d' : '#5a524c');
    const piles = clampv(Math.floor(L / 4) + Math.round((ore - 1) * 2), 0, 4);
    for (let i = 0; i < piles; i++) { const [ox, oy] = P(x + w * 0.72 + (i % 2) * 0.25, y + d * 0.35 + i * 0.4); c.beginPath(); c.ellipse(ox, oy - 1, 6, 3.2, 0, Math.PI, TAU); c.fillStyle = F('#6a5a52'); c.fill(); for (let k = 0; k < 4; k++) circ(ox - 3 + k * 2, oy - 2, 1.3, k % 2 ? '#a0522d' : '#7a6a62'); }
    if (band >= 2 || ore > 1.3) {
      const [hx, hy] = P(x + w * 0.77, y + d * 0.2); line([hx - 6, hy], [hx, hy - 30], '#6a4a30', 1.8); line([hx + 6, hy], [hx, hy - 30], '#6a4a30', 1.8); line([hx - 3, hy - 15], [hx + 3, hy - 15], '#6a4a30', 1.2);
      circ(hx, hy - 30, 5, null, '#3a2a20'); line([hx - 5, hy - 30], [hx + 5, hy - 30], '#3a2a20', 0.8); line([hx, hy - 35], [hx, hy - 25], '#3a2a20', 0.8);
    }
    return 22 + band * 4;
  };

  // ---- siege workshop, tavern, temple, theatre, and a fallback for unknown types ----
  function wheel(gx, gy, z, r = 3) { const [x, y] = P(gx, gy, z); circ(x, y, r, '#6a4a30', OUT); circ(x, y, r * 0.35, '#3a2a20'); line([x - r, y], [x + r, y], '#4a3020', 0.7); line([x, y - r], [x, y + r], '#4a3020', 0.7); }
  function siegeRam(gx, gy, done) { // wheeled frame with a slung log; done 0..1 = how far it is built
    const fc = '#7a5434';
    box(gx, gy, 1.1, 0.5, 3, 2, fc);
    for (const [wx, wy] of [[gx + 0.15, gy + 0.5], [gx + 0.95, gy + 0.5]]) wheel(wx, wy, 3, 3.2);
    if (done > 0.3) for (const u of [0.1, 1.0]) { line(P(gx + u, gy + 0.05, 5), P(gx + u, gy + 0.25, 16), fc, 1.3); line(P(gx + u, gy + 0.45, 5), P(gx + u, gy + 0.25, 16), fc, 1.3); }
    if (done > 0.5) log(gx - 0.2, gx + 1.25, gy + 0.25, 9, 2);
    if (done > 0.8) poly([P(gx, gy + 0.05, 5), P(gx + 1.1, gy + 0.05, 5), P(gx + 1.1, gy + 0.25, 17), P(gx, gy + 0.25, 17)], RACE === 'ash' ? '#a9784e' : '#8a6a44');
  }
  function siegeCatapult(gx, gy, done) {
    const fc = '#7a5434';
    box(gx, gy, 0.9, 0.6, 3, 2, fc);
    for (const [wx, wy] of [[gx + 0.15, gy + 0.6], [gx + 0.75, gy + 0.6]]) wheel(wx, wy, 3, 3);
    if (done > 0.3) { line(P(gx + 0.35, gy + 0.1, 5), P(gx + 0.45, gy + 0.3, 15), fc, 1.4); line(P(gx + 0.55, gy + 0.5, 5), P(gx + 0.45, gy + 0.3, 15), fc, 1.4); }
    if (done > 0.6) { const a = P(gx + 0.9, gy + 0.3, 6), b = P(gx + 0.05, gy + 0.3, 22); line(a, b, '#5a4030', 1.8); c.beginPath(); c.arc(b[0], b[1] - 1, 2.4, 0, TAU); c.fillStyle = F('#8a7a6a'); c.fill(); }
  }
  BLD.workshop = ([x, y, w, d], L, band) => {
    // open carpentry shed at the back, race-roofed
    const sx = x + 0.1, sy = y + 0.1, sw = 1.3, sd = 1.0, H = 13 + band * 2;
    for (const [px, py] of [[sx, sy + sd], [sx + sw, sy + sd], [sx + sw, sy]]) line(P(px, py), P(px, py, H), STY.beam, 1.6);
    box(sx, sy, sw, 0.12, 0, H, RACE === 'delver' ? STY.stone : STY.wood);
    const roof = RACE === 'ash' ? STY.thatch : RACE === 'sylvan' ? STY.roof : RACE === 'delver' ? STY.roof : STY.roof;
    if (RACE === 'delver') box(sx - 0.05, sy - 0.05, sw + 0.1, sd + 0.1, H, 3, STY.stone2);
    else poly([P(sx - 0.08, sy - 0.08, H + 6), P(sx + sw + 0.08, sy - 0.08, H + 6), P(sx + sw + 0.08, sy + sd + 0.1, H), P(sx - 0.08, sy + sd + 0.1, H)], roofCol(roof));
    box(sx + 0.2, sy + 0.4, 0.7, 0.3, 0, 5, '#9a7046');              // workbench
    logPile(x + 1.55, y + 0.15, 0.9, 3);                               // timber stacks
    if (L >= 5) logPile(x + 1.55, y + 0.75, 0.9, 2);
    const done = 0.35 + 0.65 * Math.min(1, L / 8);
    if (band % 2 === 0 || band >= 2) siegeRam(x + 0.25, y + d - 0.6, done); 
    if (band % 2 === 1 || band >= 2) siegeCatapult(x + w - 1.05, y + d - 0.75, done);
    if (RACE === 'ash') skull(...P(sx + sw, sy + sd, H + 1), 0.8);
    if (RACE === 'sylvan') { const [lx, ly] = P(sx + sw, sy + sd, H - 2); lantern(lx, ly, 1.4); }
    return H + 10;
  };
  function signBoard(gx, gy, z, col, motif) {
    const [sx, sy] = P(gx, gy, z); line([sx, sy], [sx + 6, sy - 2], STY.beam, 1.2);
    poly([[sx + 3, sy - 1], [sx + 9, sy - 3], [sx + 9, sy + 3], [sx + 3, sy + 5]], col);
    if (motif === 'mug') { poly([[sx + 4.8, sy], [sx + 7, sy - 0.7], [sx + 7, sy + 2.5], [sx + 4.8, sy + 3.2]], '#e2b84a', null); }
    if (motif === 'horn') line([sx + 4.5, sy + 2.5], [sx + 8, sy - 1], '#ece2c8', 1.4);
  }
  BLD.tavern = ([x, y, w, d], L, band) => {
    let top;
    if (RACE === 'sylvan') {
      top = hallSylvan(x, y + 0.1, w, w, 18, Math.max(1, band), {});
      const pts = [[x + 0.2, y + 1.7], [x + 1.2, y + 1.7], [x + 1.2, y + 2.4], [x + 0.2, y + 2.4]];
      for (const [gx, gy] of pts) line(P(gx, gy), P(gx, gy, 12), STY.beam, 1.1);
      for (let i = 0; i < 4; i++) { const a = P(...pts[i], 12), b = P(...pts[(i + 1) % 4], 12); line(a, b, '#3a2a20', 0.5); for (let k = 1; k < 3; k++) lantern(a[0] + (b[0] - a[0]) * k / 3, a[1] + (b[1] - a[1]) * k / 3 + 3, 1.2); }
      box(x + 0.45, y + 1.85, 0.5, 0.3, 0, 4, STY.wood);
      return top;
    }
    if (RACE === 'ash') {
      top = cone(x + w / 2, y + 0.85, 0.72, 0, 30 + band * 3, STY.thatch);
      const [dx, dy] = P(x + w / 2 + 0.25, y + 1.5); poly([[dx - 3, dy], [dx + 3, dy], [dx, dy - 9]], '#2a1e18', null);
      banner(x + 0.1, y + 1.6, 0, 22, STY.flag);
      firePit(x + 0.75, y + 2.1, 0.75);
      const [rx, ry] = P(x + 0.75, y + 2.1); line([rx - 7, ry - 9], [rx + 7, ry - 9], '#3a2a20', 1.2); c.beginPath(); c.ellipse(rx, ry - 9, 3.5, 2, 0, 0, TAU); c.fillStyle = F('#8a4a2a'); c.fill();
      return top + 4;
    }
    if (RACE === 'delver') {
      top = hallDelver(x + 0.05, y + 0.1, w - 0.1, d - 0.5, 15 + band * 2, Math.min(band, 2), { chim: 'house' });
      for (let k = 0; k < 3; k++) { const [sx, sy] = P(x + w - 0.05, y + 0.5 + k * 0.6, 9); circ(sx, sy, 2.6, ['#8a5a3a', '#6d7a80', '#a0522d'][k], OUT); circ(sx, sy, 0.8, '#d9b44a'); }
      signBoard(x + 0.2, y + d - 0.4, 13, '#c9a874', 'horn');
      barrel(x + 0.3, y + d - 0.15); barrel(x + 0.55, y + d - 0.1);
      return top;
    }
    top = hallHearth(x + 0.05, y + 0.1, w - 0.1, d - 0.5, 15 + band * 2, Math.min(band, 2), { axis: 'y', chim: 'house' });
    signBoard(x + w - 0.05, y + 0.6, 12, '#c9a874', 'mug');
    barrel(x + 0.3, y + d - 0.15); barrel(x + 0.55, y + d - 0.1);
    box(x + 0.85, y + d - 0.3, 0.45, 0.12, 0, 3, STY.wood);
    return top;
  };
  BLD.temple = ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2;
    if (RACE === 'hearth') { // chapel with a steeple
      const b = box(x + 0.15, y + 0.55, 1.4, 1.0, 0, 15 + band * 2, band >= 2 ? STY.stone2 : STY.wall);
      if (band >= 2) courses(b, 4, shade(STY.stone2, -0.15)); else timber(b, STY.beam);
      door(b, 'L', 0.7, 0.3, 9); for (const u of [0.25, 0.5, 0.75]) win(b, 'R', u, 6, 0.12, 7);
      lampDot(...P(x + 0.85, y + 1.55, 12), 2, '#4b5a6b', '#ffc95c');
      gable(b, 10, band >= 1 ? STY.roof : STY.thatch, 'x', band >= 1 ? 'tile' : 'thatch');
      const tH = 26 + band * 6;
      const t = box(x + 1.15, y + 0.15, 0.55, 0.55, 0, tH, band >= 2 ? STY.stone2 : STY.wall);
      win(t, 'L', 0.275, tH - 9, 0.14, 5); win(t, 'R', 0.275, tH - 9, 0.14, 5);
      const zt = cone(x + 1.425, y + 0.425, 0.42, tH, 18 + band * 3, '#5a6a7a');
      const [kx, ky] = P(x + 1.425, y + 0.425, zt); line([kx, ky], [kx, ky - 6], '#d9b44a', 1.2); line([kx - 2, ky - 4], [kx + 2, ky - 4], '#d9b44a', 1.2);
      return zt + 6;
    }
    if (RACE === 'delver') { // ancestor shrine carved in stone
      const b = box(x + 0.1, y + 0.1, w - 0.2, w - 0.2, 0, 6, STY.stone);
      box(x + 0.35, y + 0.35, w - 0.7, w - 0.7, 6, 4, STY.stone2);
      // the ancestor: a seated stone king
      const sx = cx - 0.25, sy = cy - 0.25;
      const body = box(sx, sy, 0.5, 0.45, 10, 14 + band * 3, '#9a948a');
      const hh = 10 + 14 + band * 3;
      box(sx + 0.08, sy + 0.08, 0.34, 0.3, hh, 7, '#a8a299');
      const [fx, fy] = P(sx + 0.25, sy + 0.38, hh + 3.5); line([fx - 2, fy], [fx + 2, fy], '#5a544e', 0.8); line([fx - 1.6, fy + 2.5], [fx + 1.6, fy + 2.5], '#5a544e', 1); // carved face
      poly([P(sx + 0.05, sy + 0.38, hh + 7), P(sx + 0.45, sy + 0.38, hh + 7), P(sx + 0.25, sy + 0.38, hh + 12)], '#c9a03a');   // crown
      lamp(onL(body, 0.1, 0.4, 6, 7.2), '#4fc3f7', '#9cf0ff');
      for (const [gx, gy] of [[x + 0.3, y + w - 0.3], [x + w - 0.3, y + 0.3]]) { box(gx - 0.1, gy - 0.1, 0.2, 0.2, 6, 6, '#6f6a64'); rec('fires', { x: P(gx, gy, 12)[0], y: P(gx, gy, 12)[1], s: 0.5 }); rec('lights', { x: P(gx, gy, 14)[0], y: P(gx, gy, 14)[1], r: 22 }); }
      void b;
      return hh + 14;
    }
    if (RACE === 'sylvan') { // moonwell shrine
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.3; const gx = cx + Math.cos(a) * 0.82, gy = cy + Math.sin(a) * 0.82; box(gx - 0.08, gy - 0.08, 0.16, 0.16, 0, 14 + (k % 2) * 4, '#e6e4dc'); }
      cyl(cx, cy, 0.5, 0, 4, '#c3bfa6', '#d8d4bc');
      const [wx, wy, rx, ry] = ell(cx, cy, 4, 0.4);
      c.beginPath(); c.ellipse(wx, wy, rx, ry, 0, 0, TAU); c.fillStyle = GLOW ? '#cfefff' : '#9fd8f0'; c.fill();
      rec('sparks', { x: wx, y: wy - 2, kind: 'moon' }); rec('lights', { x: wx, y: wy, r: 34, col: 'grove' });
      treeDecid(x + 0.25, y + 0.35, 0.9, true);
      return 26;
    }
    // ash: bone totem shrine
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; const [bx, by] = P(cx + Math.cos(a) * 0.8, cy + Math.sin(a) * 0.8); line([bx, by], [bx + 1, by - 7], '#ece2c8', 1.6); }
    const H = 34 + band * 5;
    const [tx, ty] = P(cx, cy);
    poly([[tx - 3, ty], [tx + 3, ty], [tx + 2.5, ty - H], [tx - 2.5, ty - H]], '#5a4030');
    for (let k = 0; k < 3; k++) skull(tx, ty - 9 - k * 9, 1.05);
    line([tx - 3, ty - H + 2], [tx - 9, ty - H - 6], '#ece2c8', 2); line([tx + 3, ty - H + 2], [tx + 9, ty - H - 6], '#ece2c8', 2);
    poly([[tx - 2, ty - H], [tx + 2, ty - H], [tx, ty - H - 6]], STY.flag);
    firePit(cx + 0.55, cy + 0.6, 0.6);
    return H + 8;
  };
  BLD.theatre = ([x, y, w, d], L, band) => {
    const crowd = n => { for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; const [px, py] = P(x + 0.2 + u * (w - 0.4), y + 0.25 + (i % 2) * 0.18, 3 + (i % 2) * 2); person(px, py, STY.cloth[i % STY.cloth.length], 0.8); } };
    const audience = Math.min(10, 3 + L);
    if (RACE === 'delver') { // stone amphitheatre: tiers step down towards the stage
      const cx = x + w / 2, cy = y + d - 0.15;
      for (let k = 0; k < 3; k++) {
        const r = 1.2 - k * 0.32, z = 8 - k * 3;
        const [ex, ey, rx, ry] = ell(cx, cy, z, r);
        c.beginPath(); c.moveTo(ex - rx, ey + z); c.lineTo(ex - rx, ey); c.ellipse(ex, ey, rx, ry, 0, Math.PI, TAU); c.lineTo(ex + rx, ey + z); c.closePath();
        c.fillStyle = F(shade(STY.stone2, -0.06 * k)); c.fill(); c.strokeStyle = F(OUT); c.lineWidth = 0.7; c.stroke();
      }
      crowd(audience);
      const st = box(cx - 0.45, cy - 0.35, 0.9, 0.35, 0, 3, STY.stone);
      void st;
      for (const u of [-0.4, 0.4]) box(cx + u - 0.06, cy - 0.4, 0.12, 0.12, 0, 16, '#a8a299');
      return 22;
    }
    if (RACE === 'ash') { // fighting ring with an audience
      const cx = x + w / 2, cy = y + d / 2;
      crowd(audience);
      const post = [];
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; post.push([cx + Math.cos(a) * 0.62, cy + Math.sin(a) * 0.55]); }
      const [ex, ey, rx, ry] = ell(cx, cy, 0, 0.58); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, TAU); c.fillStyle = F(SNOW ? '#e0dcd4' : '#c9a878'); c.fill();
      for (let k = 0; k < 8; k++) { const a = P(...post[k], 7), b = P(...post[(k + 1) % 8], 7); line(P(...post[k]), a, '#4a3426', 1.6); line(a, b, '#c9a874', 0.8); }
      const [fx, fy] = P(cx, cy); person(fx - 5, fy, '#a3221b'); person(fx + 5, fy, '#6d4c8d');
      line([fx - 3, fy - 5], [fx + 1, fy - 8], '#c8ccd2', 1); line([fx + 3, fy - 5], [fx - 1, fy - 8], '#c8ccd2', 1);
      banner(x + 0.1, y + 0.1, 0, 22, STY.flag); banner(x + w - 0.1, y + d - 0.1, 0, 22, STY.flag);
      rec('pit', { x: fx, y: fy - 2, rx: 6, ry: 3 });
      return 26;
    }
    crowd(audience);
    const sx = x + w / 2 - 0.6, sy = y + d - 0.75;
    if (RACE === 'sylvan') { // living-wood stage under arching boughs
      cyl(x + w / 2, sy + 0.35, 0.6, 0, 3, STY.wood, shade(STY.wood, 0.15));
      for (const s of [-1, 1]) { const b0 = P(x + w / 2 + s * 0.6, sy + 0.35), tp = P(x + w / 2, sy + 0.3, 24); c.beginPath(); c.moveTo(...b0); c.quadraticCurveTo(b0[0] + s * 2, tp[1] - 4, tp[0], tp[1]); c.strokeStyle = F(STY.beam); c.lineWidth = 2.4; c.stroke(); }
      canopy(x + w / 2, sy + 0.3, 30, 0.45);
      for (const s of [-1, 1]) { const [lx, ly] = P(x + w / 2 + s * 0.45, sy + 0.35, 16); lantern(lx, ly, 1.4); }
      return 40;
    }
    // hearth: timber playhouse stage with curtains
    const b = box(sx, sy, 1.2, 0.6, 0, 4, STY.wood);
    for (const [px, py] of [[sx, sy + 0.6], [sx + 1.2, sy + 0.6], [sx + 1.2, sy]]) line(P(px, py, 4), P(px, py, 18), STY.beam, 1.4);
    poly([P(sx + 0.05, sy + 0.6, 17), P(sx + 0.3, sy + 0.6, 17), P(sx + 0.22, sy + 0.6, 5), P(sx + 0.05, sy + 0.6, 5)], '#a3221b', null);
    poly([P(sx + 0.9, sy + 0.6, 17), P(sx + 1.15, sy + 0.6, 17), P(sx + 1.15, sy + 0.6, 5), P(sx + 0.98, sy + 0.6, 5)], '#a3221b', null);
    gable({ x: sx, y: sy, w: 1.2, d: 0.6, z: 0, h: 18, col: STY.wall }, 7, band >= 1 ? STY.roof : STY.thatch, 'x', band >= 1 ? 'tile' : 'thatch');
    const [px2, py2] = P(sx + 0.6, sy + 0.4, 4); person(px2, py2, '#3f6fa8', 0.9);
    flagpole(sx + 1.2, sy, 25, 8);
    void b;
    return 34;
  };
  BLD.generic = ([x, y, w, d], L, band) => {
    const ww = Math.min(w - 0.3, 1.8), dd = Math.min(d - 0.3, 1.5);
    return hall(x + 0.15, y + 0.15, ww, dd, 13 + band * 2, Math.min(band, 2), { axis: ww >= dd ? 'x' : 'y' });
  };

  // ------------------------------------------------------------------
  // construction, empty plots
  // ------------------------------------------------------------------
  function scaffold(x, y, w, d, H, active) {
    const col = '#9a7448';
    const pts = [[x, y + d], [x + w, y + d], [x + w, y], [x + w / 2, y + d], [x + w, y + d / 2]];
    for (const [gx, gy] of pts) line(P(gx, gy), P(gx, gy, H), col, 1.3);
    for (let z = 8; z <= H; z += 9) { line(P(x, y + d, z), P(x + w, y + d, z), col, 1.6); line(P(x + w, y, z), P(x + w, y + d, z), col, 1.6); }
    line(P(x, y + d, 0), P(x + w / 2, y + d, Math.min(H, 17)), col, 0.9); line(P(x + w, y, 0), P(x + w, y + d / 2, Math.min(H, 17)), col, 0.9);
    if (active) rec('hammers', { x: P(x + w * 0.75, y + d, Math.min(H, 17))[0], y: P(x + w * 0.75, y + d, Math.min(H, 17))[1] });
  }
  function foundation(x, y, w, d) {
    poly(quad(x, y, w, d), mix(GROUND, '#8a6a48', 0.5), null);
    const b = box(x + 0.15, y + 0.15, w - 0.3, d - 0.3, 0, 4, '#a39a8c');
    for (const [gx, gy] of [[x + 0.2, y + 0.2], [x + w - 0.3, y + 0.2], [x + 0.2, y + d - 0.3]]) box(gx, gy, 0.12, 0.12, 4, 10, '#8a6440');
    void b;
    crate(x + w - 0.35, y + d - 0.1, 0.22); log(x + 0.2, x + 0.9, y + d + 0.05, 2);
  }
  function plot(x, y, w, d, locked) {
    c.save(); if (locked) c.globalAlpha = 0.45;
    poly(quad(x + 0.1, y + 0.1, w - 0.2, d - 0.2), mix(GROUND, SNOW ? '#c8ccd0' : '#9a7a52', 0.3), null);
    const corners = [[x + 0.15, y + 0.15], [x + w - 0.15, y + 0.15], [x + w - 0.15, y + d - 0.15], [x + 0.15, y + d - 0.15]];
    for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; c.setLineDash([2, 2]); line(P(a[0], a[1], 4), P(b[0], b[1], 4), '#e8dcb8', 0.8); c.setLineDash([]); }
    for (const [gx, gy] of corners) line(P(gx, gy), P(gx, gy, 6), '#7a5a3a', 1.6);
    // little sign
    const [sx, sy] = P(x + w * 0.62, y + d - 0.15);
    line([sx, sy], [sx, sy - 11], '#6a4a30', 1.4);
    poly([[sx - 5, sy - 15], [sx + 5, sy - 13], [sx + 5, sy - 8], [sx - 5, sy - 10]], locked ? '#a49a8a' : '#d9c08a');
    if (!locked) { line([sx - 3, sy - 12.5], [sx + 3, sy - 11.2], '#6a4a30', 0.7); } else { circ(sx, sy - 11.2, 1.3, '#5a5048'); }
    c.restore();
  }

  // ------------------------------------------------------------------
  // walls
  // ------------------------------------------------------------------
  const wallBand = L => L <= 0 ? -1 : L <= 4 ? 0 : L <= 9 ? 1 : L <= 14 ? 2 : 3;
  function wallSeg(side, a, b, band) {
    const t = band === 0 ? 0.22 : 0.36;
    const fp = side === 'N' ? [a, WALL_A - t / 2, b - a, t] : side === 'S' ? [a, WALL_B - t / 2, b - a, t] : side === 'W' ? [WALL_A - t / 2, a, t, b - a] : [WALL_B - t / 2, a, t, b - a];
    const along = side === 'N' || side === 'S';
    if (band === 0) {
      if (RACE === 'sylvan') { // living hedge
        const bx = box(fp[0], fp[1], fp[2], fp[3], 0, 11, '#4f7d3c');
        void bx;
        const n = Math.max(1, Math.round((b - a) / 0.3));
        for (let k = 0; k < n; k++) { const u = a + (k + 0.5) * (b - a) / n; const [hx, hy] = along ? P(u, fp[1] + t / 2, 11) : P(fp[0] + t / 2, u, 11); circ(hx, hy, 3.4, SNOW ? '#eef3f5' : SEASON === 2 ? '#b0702a' : '#5e9447', OUT); if (SEASON === 0 && k % 2) circ(hx + 1, hy, 1, '#f7c6d6'); }
        return;
      }
      if (RACE === 'delver') { const bx = box(fp[0], fp[1], fp[2], fp[3], 0, 9, '#8a847a'); courses(bx, 3, '#6e685f'); return; }
      const n = Math.max(1, Math.round((b - a) / 0.2));
      const col = RACE === 'ash' ? '#5a4030' : '#9a7044';
      for (let k = 0; k < n; k++) {
        const u = a + (k + 0.5) * (b - a) / n;
        const gx = along ? u : fp[0] + t / 2, gy = along ? fp[1] + t / 2 : u;
        const h = 15 + ((k * 7) % 3) * 1.5 + (RACE === 'ash' ? 3 : 0);
        const [bx, by] = P(gx, gy), [tx, ty] = P(gx, gy, h);
        const cc = RACE === 'ash' && k % 3 === 0 ? STY.trim : col;
        poly([[bx - 2.2, by], [bx + 2.2, by], [tx + 2.2, ty + 3], [tx, ty - 1.5], [tx - 2.2, ty + 3]], cc, OUT, 0.6);
        line([bx + 1, by], [tx + 1, ty + 3], shade(cc, -0.25), 0.8);
        if (RACE === 'ash' && k % 9 === 4) skull(tx, ty + 6, 0.8);
      }
      const z1 = 6; line(along ? P(a, fp[1] + t, z1) : P(fp[0] + t, a, z1), along ? P(b, fp[1] + t, z1) : P(fp[0] + t, b, z1), shade(col, -0.3), 1);
      return;
    }
    const H = 20 + band * 4, col = RACE === 'ash' ? '#5e5652' : RACE === 'sylvan' ? '#b8b49a' : RACE === 'delver' ? '#8c867e' : '#b0a796';
    const bw = box(fp[0], fp[1], fp[2], fp[3], 0, H, col);
    courses(bw, 4, shade(col, -0.16));
    // merlons
    const n = Math.max(1, Math.round((b - a) / 0.28));
    for (let k = 0; k < n; k += 2) {
      const u0 = a + k * (b - a) / n, u1 = a + (k + 1) * (b - a) / n;
      if (along) box(u0, fp[1] + t * 0.45, u1 - u0, t * 0.55, H, 3.5, col); else box(fp[0] + t * 0.45, u0, t * 0.55, u1 - u0, H, 3.5, col);
    }
    if (RACE === 'sylvan' && !SNOW) { const [vx, vy] = along ? P((a + b) / 2, fp[1] + t, H * 0.6) : P(fp[0] + t, (a + b) / 2, H * 0.6); circ(vx, vy, 2.4, '#5e9447'); circ(vx + 2, vy + 3, 1.8, '#4f8a3e'); }
    if (RACE === 'ash' && (Math.round(a * 3) % 4 === 0)) { const [sx, sy] = along ? P(a + 0.2, fp[1] + t, H + 2) : P(fp[0] + t, a + 0.2, H + 2); line([sx, sy], [sx, sy - 8], '#3a2a20', 1); skull(sx, sy - 9, 0.7); }
  }
  function wallTower(gx, gy, band) {
    const H = 34 + band * 7, r = 0.42;
    if (RACE === 'delver' || RACE === 'ash') {
      const col = RACE === 'ash' ? '#5e5652' : '#9a948a';
      const b = box(gx - r, gy - r, 2 * r, 2 * r, 0, H, col); courses(b, 4.5, shade(col, -0.16));
      slit(b, 'L', r, H * 0.55); slit(b, 'R', r, H * 0.55);
      const t = box(gx - r - 0.08, gy - r - 0.08, 2 * r + 0.16, 2 * r + 0.16, H, 3, shade(col, -0.1)); parapet({ ...t, h: 3 }, 3);
      if (band >= 3) { if (RACE === 'ash') { const z = cone(gx, gy, r * 0.9, H + 6, 14, STY.thatch); flagpole(gx, gy, z - 1, 10); } else flagpole(gx, gy, H + 6, 14); }
      return;
    }
    const col = RACE === 'sylvan' ? '#bcb89e' : '#b5ac9b';
    cyl(gx, gy, r, 0, H, col);
    const [x, y, rx] = ell(gx, gy, 0, r);
    for (let v = 5; v < H; v += 5) { c.beginPath(); c.ellipse(x, y - v, rx, rx / 2, 0, 0.15, Math.PI - 0.15); c.strokeStyle = F(shade(col, -0.18)); c.lineWidth = 0.6; c.stroke(); }
    lamp([[x - 1, y - H * 0.55], [x + 1, y - H * 0.55], [x + 1, y - H * 0.55 - 6], [x - 1, y - H * 0.55 - 6]], '#2e2a28', '#ffc35a');
    if (band >= 3) { const z = cone(gx, gy, r * 1.2, H, 22, RACE === 'sylvan' ? STY.roof : STY.roof); flagpole(gx, gy, z - 1, 10); }
    else { cyl(gx, gy, r * 1.1, H, 3, shade(col, -0.05)); }
  }
  function gate(side, band) {
    const along = side === 'N' || side === 'S';
    const fixed = side === 'N' || side === 'W' ? WALL_A : WALL_B;
    const at = (u, z = 0) => along ? P(u, fixed, z) : P(fixed, u, z);
    if (band === 0) {
      for (const u of [GATE0, GATE1]) { const [bx, by] = at(u), [tx, ty] = at(u, 22); line([bx, by], [tx, ty], RACE === 'ash' ? STY.trim : '#7a5434', 3); if (RACE === 'ash') skull(tx, ty - 2, 0.9); }
      line(at(GATE0 - 0.1, 20), at(GATE1 + 0.1, 20), '#7a5434', 2.2);
      return;
    }
    const col = RACE === 'ash' ? '#5e5652' : RACE === 'sylvan' ? '#b8b49a' : RACE === 'delver' ? '#8c867e' : '#b0a796';
    const t = 0.5, H = 20 + band * 4;
    if (band === 1) {
      for (const u of [GATE0 - 0.25, GATE1]) { if (along) box(u, fixed - t / 2, 0.25, t, 0, H + 6, col); else box(fixed - t / 2, u, t, 0.25, 0, H + 6, col); }
      return;
    }
    // gatehouse: two towers and an arch block
    for (const u of [GATE0 - 0.55, GATE1]) { const b = along ? box(u, fixed - 0.3, 0.55, 0.6, 0, H + 14, col) : box(fixed - 0.3, u, 0.6, 0.55, 0, H + 14, col); courses(b, 4.5, shade(col, -0.16)); parapet(b, 3); }
    const arch = along ? box(GATE0, fixed - 0.25, GATE1 - GATE0, 0.5, H - 4, 12, col) : box(fixed - 0.25, GATE0, 0.5, GATE1 - GATE0, H - 4, 12, col);
    courses(arch, 4, shade(col, -0.16));
    if (side === 'S' || side === 'E') { const m = (GATE0 + GATE1) / 2; const [bx, by] = along ? P(m, fixed + 0.25, H + 2) : P(fixed + 0.25, m, H + 2); poly([[bx - 4, by - 2], [bx + 4, by - 2], [bx + 4, by + 8], [bx, by + 5], [bx - 4, by + 8]], STY.flag); }
  }

  // ------------------------------------------------------------------
  // ground, backdrop
  // ------------------------------------------------------------------
  function groundColor(terrain) {
    let g = TERRAIN_GRASS[terrain] || TERRAIN_GRASS.plains;
    if (REG) { let tw = 0, acc = [0, 0, 0]; for (const k in REG.all) { const rgb = rgbOf(TERRAIN_GRASS[k] || TERRAIN_GRASS.plains), w = REG.all[k]; acc = acc.map((v, i) => v + rgb[i] * w); tw += w; } if (tw) g = toHex(acc[0] / tw, acc[1] / tw, acc[2] / tw); }
    if (RACE === 'delver') g = mix(g, '#9a958a', 0.25);
    if (RACE === 'ash') g = mix(g, '#b9a06e', 0.35);
    if (SEASON === 0) g = mix(g, '#8ccf5a', 0.18);
    if (SEASON === 1) g = mix(g, '#c8b45a', 0.22);
    if (SEASON === 2) g = mix(g, '#b98a44', 0.38);
    if (SEASON === 3) g = mix(g, '#e8eef2', 0.82);
    return g;
  }
  // ridgeline along the two back edges from the real neighbouring tiles
  function drawRidge(dwellings) {
    const n = 24;
    const edges = {};
    let any = false;
    for (const e of ['N', 'E']) {
      const R2 = mkRng(hashStr(CITY.id + e));
      const h = [], k = [];
      for (let i = 0; i <= n; i++) {
        const u = e === 'N' ? N - i : i;
        const terr = REG.ter[secOf(...edgePt(e, 1.5, u))];
        k.push(terr);
        h.push(terr === 'mountain' ? (70 + R2() * 50) * (i % 2 ? 0.82 : 1) : terr === 'hills' ? 20 + R2() * 14 : 0);
      }
      for (let i = 1; i < n; i++) if (k[i] === 'hills') h[i] = (h[i - 1] + 2 * h[i] + h[i + 1]) / 4;
      if (h.some(v => v > 0)) any = true;
      edges[e] = { h, k };
    }
    if (!any && RACE === 'delver') for (let i = 6; i <= 18; i++) { edges.N.h[i] = 52 + (i % 2) * 10; edges.N.k[i] = 'mountain'; }
    const rockC = RACE === 'delver' ? '#857c72' : '#8a8378', hillC = '#9a8a66';
    const capC = kind => SNOW ? '#f2f6f8' : kind === 'hills' ? mix(GROUND, '#7a9a4a', 0.3) : shade(rockC, 0.2);
    for (const e of ['N', 'E']) {
      const { h, k } = edges[e];
      const at = (i, dd, z) => e === 'N' ? P(-dd, N - i, z) : P(N * 0 + i, -dd, z);
      for (let i = 0; i < n; i++) {
        if (!h[i] && !h[i + 1]) continue;
        const kind = h[i] >= h[i + 1] ? k[i] : k[i + 1];
        const hillish = kind === 'hills';
        const base = hillish ? (SNOW ? '#e6ecef' : mix(GROUND, '#6f8a48', 0.25)) : rockC;
        const face = e === 'N' ? shade(base, -0.14 + (i % 2) * 0.03) : shade(base, 0.04 + (i % 2) * 0.03);
        const to = hillish ? 1.8 : 0.3;
        poly([at(i, 0, 0), at(i + 1, 0, 0), at(i + 1, to, h[i + 1]), at(i, to, h[i])], face, hillish ? null : OUT, 0.6);
        if (hillish && !SNOW && (i % 3 === 1)) poly([at(i + 0.3, 0.4, h[i] * 0.25), at(i + 0.8, 0.45, h[i] * 0.3), at(i + 0.7, 0.9, h[i] * 0.55), at(i + 0.4, 0.85, h[i] * 0.5)], '#a8a090', null);
        if (kind === 'mountain') for (let s = 1; s < 4; s++) line(at(i, 0, Math.min(h[i], h[i + 1]) * 0.22 * s), at(i + 1, 0, Math.min(h[i], h[i + 1]) * 0.22 * s), shade(base, -0.3), 0.5);
        if (!hillish) poly([at(i, 0.3, h[i]), at(i + 1, 0.3, h[i + 1]), at(i + 1, 1.4, Math.max(0, h[i + 1] - 4)), at(i, 1.4, Math.max(0, h[i] - 4))], capC(kind), null);
        else line(at(i, to, h[i]), at(i + 1, to, h[i + 1]), shade(base, -0.25), 0.8);
      }
    }
    // Deepdelver homes carved into the high rock
    let placed = 0;
    for (let i = 3; i <= 21 && placed < dwellings; i += 2) for (const e of ['E', 'N']) {
      if (placed >= dwellings) break;
      const { h } = edges[e];
      if (Math.min(h[i - 1], h[i], h[i + 1]) < 40 || Math.abs((e === 'N' ? N - i : i) - 12) < 1.5) continue;
      const u = e === 'N' ? N - i : i;
      const at = (du, z) => e === 'E' ? P(u + du, -0.01, z) : P(-0.01, u + du, z);
      const fc = e === 'E' ? shade(rockC, 0.15) : shade(rockC, -0.05);
      poly([at(-0.55, 0), at(0.55, 0), at(0.55, 22), at(0, 27), at(-0.55, 22)], fc, OUT, 0.7);
      for (const du of [-0.45, 0.45]) poly([at(du - 0.07, 0), at(du + 0.07, 0), at(du + 0.07, 21), at(du - 0.07, 21)], shade(fc, 0.12), null);
      path([at(-0.18, 0), at(0.18, 0), at(0.18, 9), at(0, 12), at(-0.18, 9)]); c.fillStyle = F('#2a2420'); c.fill();
      path([at(-0.32, 14), at(-0.12, 14), at(-0.12, 19), at(-0.32, 19)]); c.fillStyle = GLOW ? '#ffc35a' : '#3a3632'; c.fill();
      path([at(0.12, 14), at(0.32, 14), at(0.32, 19), at(0.12, 19)]); c.fillStyle = GLOW ? '#ffc35a' : '#3a3632'; c.fill();
      const [lx, ly] = at(0.62, 10); lantern(lx, ly, 1.4);
      placed++;
    }
  }
  const waterCol = () => SEASON === 3 ? '#cfe2ee' : '#4f8fb8';
  function reeds(gx, gy) {
    if (SNOW) return;
    const [x, y] = P(gx, gy);
    for (let k = -2; k <= 2; k++) line([x + k * 1.3, y], [x + k * 1.8, y - 5 - Math.abs(k % 2) * 2], SEASON === 2 ? '#a88a4a' : '#5f8a3e', 0.8);
    if (SEASON === 1) circ(x + 1.5, y - 7, 0.9, '#6a4a30');
  }
  function boat(gx, gy, sail) {
    const [x, y] = P(gx, gy);
    poly([[x - 8, y - 2], [x + 8, y - 2], [x + 5, y + 2], [x - 5, y + 2]], '#7a5434');
    line([x - 7, y - 2], [x + 7, y - 2], '#a87444', 1);
    if (sail) { line([x, y - 2], [x, y - 18], '#4a3020', 1); poly([[x + 0.5, y - 17], [x + 8, y - 5], [x + 0.5, y - 5]], '#f2ead6'); }
  }
  function drawLakes() {
    const ring = (z, off) => { const out = []; for (let u = z.a; u <= z.b + 0.001; u += 0.25) out.push(P(...edgePt(z.e, Math.max(0, lakeDepth(z, u) + off), u))); out.push(P(...edgePt(z.e, 0, z.b)), P(...edgePt(z.e, 0, z.a))); return out; };
    for (const z of REG.lakes) poly(ring(z, 0.35), SNOW ? '#e8ecee' : '#d8c89a', null);
    for (const z of REG.lakes) poly(ring(z, 0), waterCol(), null);
    for (const z of REG.lakes) poly(ring(z, -0.8), SEASON === 3 ? '#dcebf3' : '#3f7fa8', null);
    for (const z of REG.lakes) {
      const water = [];
      for (let u = z.a; u <= z.b + 0.001; u += 0.25) water.push(P(...edgePt(z.e, lakeDepth(z, u), u)));
      c.beginPath(); c.moveTo(...water[0]); for (const p of water) c.lineTo(...p); c.strokeStyle = F(SNOW ? '#ffffff' : '#9cc8e0'); c.lineWidth = 1.2; c.stroke();
      for (let u = z.a + 0.6; u < z.b - 0.4; u += 0.9) if (Math.abs(u - 12) > 0.8) reeds(...edgePt(z.e, lakeDepth(z, u) + 0.15, u));
      // pier (at the road's end when the road runs into the water) and boats
      const u0 = z.a <= 11 && z.b >= 13 ? 12 : (z.a + z.b) / 2, dd0 = lakeDepth(z, u0);
      const deck = [P(...edgePt(z.e, dd0 + 0.4, u0 - 0.25), 2), P(...edgePt(z.e, dd0 + 0.4, u0 + 0.25), 2), P(...edgePt(z.e, 0.5, u0 + 0.25), 2), P(...edgePt(z.e, 0.5, u0 - 0.25), 2)];
      for (let dd = 0.6; dd < dd0; dd += 0.7) for (const du of [-0.24, 0.24]) line(P(...edgePt(z.e, dd, u0 + du), -3), P(...edgePt(z.e, dd, u0 + du), 2), '#5a4030', 1.2);
      poly(deck, '#a07a4a');
      for (let dd = 0.7; dd < dd0 + 0.3; dd += 0.25) line(P(...edgePt(z.e, dd, u0 - 0.25), 2), P(...edgePt(z.e, dd, u0 + 0.25), 2), '#7a5a3a', 0.5);
      if (SEASON !== 3) { boat(...edgePt(z.e, Math.min(dd0 - 0.4, 1.4), u0 + 0.9), false); if (z.b - z.a > 5) boat(...edgePt(z.e, Math.min(dd0 - 0.5, 1.9), u0 - 1.4), true); }
      const [sx, sy] = P(...edgePt(z.e, dd0 * 0.5, (z.a + z.b) / 2 + 1));
      if (SEASON < 3) rec('sparks', { x: sx, y: sy, kind: 'water', rx: 30, ry: 12 });
    }
  }
  function drawRiver() {
    const rv = REG.river;
    const bl = [], br = [], wl = [], wr = [], mid = [];
    for (let u = -0.2; u <= N + 0.21; u += 0.4) { bl.push(P(...riverPt(rv, u, -0.82))); br.push(P(...riverPt(rv, u, 0.82))); wl.push(P(...riverPt(rv, u, -0.58))); wr.push(P(...riverPt(rv, u, 0.58))); mid.push(P(...riverPt(rv, u, 0.08))); }
    c.save(); path([P(0, 0), P(N, 0), P(N, N), P(0, N)]); c.clip();
    poly([...bl, ...br.slice().reverse()], SNOW ? '#e4e8ea' : '#a08a5e', null);
    poly([...wl, ...wr.slice().reverse()], waterCol(), null);
    c.beginPath(); c.moveTo(...mid[0]); for (const p of mid) c.lineTo(...p); c.strokeStyle = F(SEASON === 3 ? '#eef6fa' : '#7ab4d8'); c.lineWidth = 2; c.stroke();
    c.restore();
    for (let u = 1; u < N - 0.5; u += 1.3) if (Math.abs(u - 12) > 1.4) reeds(...riverPt(rv, u, (Math.floor(u * 3) % 2 ? 0.7 : -0.7)));
    if (SEASON < 3) for (const u of [5, 18]) { const [sx, sy] = P(...riverPt(rv, u, 0)); rec('sparks', { x: sx, y: sy, kind: 'water', rx: 20, ry: 6 }); }
  }
  // slab sides under water where the shore or river meets a front edge
  function waterNotches() {
    const slab = 16, col = '#3f78a0';
    const notch = (a, b, e) => { const A = e === 'S' ? P(N, a) : P(a, N), B = e === 'S' ? P(N, b) : P(b, N); poly([A, B, [B[0], B[1] + slab * 0.7], [A[0], A[1] + slab * 0.7]], col, null); };
    for (const z of REG.lakes) if (z.e === 'S' || z.e === 'W') notch(z.a, z.b, z.e);
    const rv = REG.river;
    if (rv) { const c0 = riverC(rv, N); if (rv.along === 'gx') notch(c0 - 0.58, c0 + 0.58, 'S'); else notch(c0 - 0.58, c0 + 0.58, 'W'); }
  }
  function bridge() {
    const rv = REG.river, cc = riverC(rv, 12);
    const stone = RACE === 'delver' || G.lvl(CITY, 'townhall') >= 10;
    const col = stone ? '#a8a194' : '#9a6a3c';
    const fp = rv.along === 'gx' ? [11.45, cc - 1.0, 1.1, 2.0] : [cc - 1.0, 11.45, 2.0, 1.1];
    const b = box(fp[0], fp[1], fp[2], fp[3], 2, 2.5, col);
    if (stone) { const [ax, ay] = rv.along === 'gx' ? P(fp[0] + fp[2], cc, 0) : P(cc, fp[1] + fp[3], 0); c.beginPath(); c.ellipse(ax, ay + 1, 6, 4, 0, Math.PI, TAU); c.fillStyle = F('#2a3a48'); c.fill(); }
    const rail = (pts) => { for (let k = 0; k <= 4; k++) { const t = k / 4; const gx = pts[0][0] + (pts[1][0] - pts[0][0]) * t, gy = pts[0][1] + (pts[1][1] - pts[0][1]) * t; line(P(gx, gy, 4.5), P(gx, gy, 9), shade(col, -0.3), 1); } line(P(...pts[0], 9), P(...pts[1], 9), shade(col, -0.3), 1.3); };
    if (rv.along === 'gx') { rail([[fp[0] + 0.05, fp[1]], [fp[0] + 0.05, fp[1] + fp[3]]]); rail([[fp[0] + fp[2] - 0.05, fp[1]], [fp[0] + fp[2] - 0.05, fp[1] + fp[3]]]); }
    else { rail([[fp[0], fp[1] + 0.05], [fp[0] + fp[2], fp[1] + 0.05]]); rail([[fp[0], fp[1] + fp[3] - 0.05], [fp[0] + fp[2], fp[1] + fp[3] - 0.05]]); }
    void b;
  }
  function watermillSpot() {
    const rv = REG.river, f = REG.slots.farm;
    let u = rv.along === 'gx' ? f[0] + f[2] / 2 : f[1] + f[3] / 2;
    u = clampv(u, 2.5, 21.5); if (Math.abs(u - 12) < 2.2) u = u < 12 ? 9.3 : 14.7;
    const side = rv.pos > 12 ? 1 : -1, cc = riverC(rv, u);
    const hc = clampv(cc + side * 1.4, 0.8, N - 0.8);
    return { u, side, cc, hc };
  }
  function watermill() {
    const rv = REG.river, { u, side, cc, hc } = watermillSpot();
    const [x, y] = rv.along === 'gx' ? [u - 0.5, hc - 0.45] : [hc - 0.45, u - 0.5];
    const w = rv.along === 'gx' ? 1.0 : 0.9, d = rv.along === 'gx' ? 0.9 : 1.0;
    const b = box(x, y, w, d, 0, 12, RACE === 'delver' ? STY.stone2 : RACE === 'ash' ? '#6a5040' : '#e6dccb');
    if (RACE === 'hearth') timber(b, STY.beam);
    door(b, 'L', w / 2, 0.24, 7); win(b, 'R', d / 2, 7, 0.16, 4);
    gable(b, 8, RACE === 'ash' ? STY.thatch : RACE === 'sylvan' ? STY.roof : RACE === 'delver' ? STY.roof : STY.thatch, rv.along === 'gx' ? 'x' : 'y', 'thatch');
    const wc = rv.along === 'gx' ? P(u, cc + side * 0.55, 6) : P(cc + side * 0.55, u, 6);
    rec('wheels', { x: wc[0], y: wc[1], r: 8 });
    return 22;
  }
  function drawGround(city) {
    const top = P(0, 0), right = P(N, 0), bottom = P(N, N), left = P(0, N);
    const slab = 16;
    // slab sides (earth)
    poly([left, bottom, [bottom[0], bottom[1] + slab], [left[0], left[1] + slab]], RACE === 'delver' ? '#7a6e62' : '#8a6a48', OUT);
    poly([bottom, right, [right[0], right[1] + slab], [bottom[0], bottom[1] + slab]], RACE === 'delver' ? '#625850' : '#6f5238', OUT);
    waterNotches();
    for (let i = 0; i < 26; i++) { const t = R(), sd = R() < 0.5; const a = sd ? left : bottom, b = sd ? bottom : right; circ(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + 4 + R() * 10, 1 + R() * 1.4, '#a08a6a'); }
    line([left[0], left[1] + 5], [bottom[0], bottom[1] + 5], 'rgba(60,40,20,0.35)', 1); line([bottom[0], bottom[1] + 5], [right[0], right[1] + 5], 'rgba(60,40,20,0.35)', 1);
    poly([top, right, bottom, left], GROUND, OUT, 1);
    line(left, bottom, SNOW ? '#ffffff' : shade(GROUND, 0.2), 2); line(bottom, right, SNOW ? '#ffffff' : shade(GROUND, 0.1), 2);
    // texture: grass tufts / snow drifts / flowers
    for (let i = 0; i < 260; i++) {
      const gx = R() * N, gy = R() * N; const [x, y] = P(gx, gy);
      if (SNOW) { if (i % 3 === 0) { c.beginPath(); c.ellipse(x, y, 5, 1.6, 0, 0, TAU); c.fillStyle = F('#ffffff'); c.fill(); } continue; }
      line([x - 1.5, y], [x - 2.5, y - 3], shade(GROUND, -0.22), 0.8); line([x + 1, y], [x + 2, y - 3.2], shade(GROUND, -0.18), 0.8);
      if ((SEASON === 0 || SEASON === 1) && i % 7 === 0 && (gx < 3.6 || gy < 3.6 || gx > 20.4 || gy > 20.4)) circ(x, y - 1, 1.1, ['#f2c94c', '#ffffff', '#e86a8a', '#b07ad9'][i % 4]);
      if (SEASON === 2 && i % 6 === 0) circ(x, y - 0.5, 1.2, ['#d9822b', '#c4561f', '#e0a634'][i % 3]);
    }
    // inside the walls: trodden earth
    const inner = mix(GROUND, SNOW ? '#d8dde0' : RACE === 'ash' ? '#a88a62' : '#a8946a', 0.28);
    poly(quad(WALL_A, WALL_A, WALL_B - WALL_A, WALL_B - WALL_A), inner, null);
    // plaza
    const pav = RACE === 'delver' || G.lvl(city, 'townhall') >= 10 ? '#b3ab9e' : RACE === 'sylvan' ? '#b7aa82' : RACE === 'ash' ? '#a0866a' : '#c2b08a';
    poly(quad(9.75, 9.75, 4.5, 4.5), SNOW ? '#e4e8ea' : pav, 'rgba(60,40,20,0.3)');
    if (!SNOW) for (let gx = 9.75; gx < 14.2; gx += 0.5) { line(P(gx, 9.75), P(gx, 14.25), shade(pav, -0.1), 0.5); line(P(9.75, gx), P(14.25, gx), shade(pav, -0.1), 0.5); }
    // roads and lanes
    const cobble = RACE === 'delver' || G.lvl(city, 'townhall') >= 10;
    const roadCol = SNOW ? '#d4d8da' : cobble ? '#a8a194' : STY.road;
    const lane = SNOW ? '#dfe3e5' : mix(STY.road, inner, 0.35);
    const seg = (a, b, wd, col) => {
      const x0 = Math.min(a[0], b[0]) - wd / 2, x1 = Math.max(a[0], b[0]) + wd / 2, y0 = Math.min(a[1], b[1]) - wd / 2, y1 = Math.max(a[1], b[1]) + wd / 2;
      poly(quad(x0, y0, x1 - x0, y1 - y0), col, null);
    };
    PATHS.forEach((pth, i) => { if (i === 0 || MAIN_ROADS.includes(pth)) return; for (let k = 0; k < pth.length - 1; k++) seg(pth[k], pth[k + 1], 0.42, lane); });
    for (const pth of MAIN_ROADS) for (let k = 0; k < pth.length - 1; k++) {
      const a = pth[k], b = pth[k + 1];
      seg(a, b, 1.0, roadCol);
      if (cobble && !SNOW) { const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.35); for (let j = 0; j < n; j++) { const t = j / n; const gx = a[0] + (b[0] - a[0]) * t, gy = a[1] + (b[1] - a[1]) * t; const [x, y] = P(gx + (R() - 0.5) * 0.6, gy + (R() - 0.5) * 0.6); circ(x, y, 1, shade(roadCol, -0.12)); } }
      else if (!SNOW) { const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.6); for (let j = 0; j < n; j++) { const t = j / n; const [x, y] = P(a[0] + (b[0] - a[0]) * t + (R() - 0.5) * 0.5, a[1] + (b[1] - a[1]) * t + (R() - 0.5) * 0.5); circ(x, y, 0.8, shade(roadCol, -0.18)); } }
    }
    // drill yard
    poly(quad(DRILL[0], DRILL[1], DRILL[2], DRILL[3]), SNOW ? '#e0e4e6' : mix(inner, '#b8a07a', 0.5), 'rgba(60,40,20,0.25)');
    // farm fields
    const nf = fieldCount(city), dry = (REG.site.grain || 1) < 0.85;
    REG.fields.slice(0, nf).forEach((f, i) => field(f, true, i, dry));
    if (REG.river) drawRiver();
    drawLakes();
    // pond (or a bonfire ring for Ashborn)
    if (RACE !== 'ash' && !DATA.buildings.temple) {
      const [px, py, rx, ry] = ell(POND[0], POND[1], 0, 0.95);
      c.beginPath(); c.ellipse(px, py, rx + 2, ry + 1.5, 0, 0, TAU); c.fillStyle = F(SNOW ? '#c8ccd0' : '#8a7a5a'); c.fill();
      c.beginPath(); c.ellipse(px, py, rx, ry, 0, 0, TAU); c.fillStyle = F(SEASON === 3 ? '#cfe2ee' : '#4f8fb8'); c.fill();
      c.beginPath(); c.ellipse(px - 3, py - 1.5, rx * 0.6, ry * 0.45, 0, 0, TAU); c.fillStyle = F(SEASON === 3 ? '#e6f2f8' : '#6aa8cf'); c.fill();
      if (RACE === 'sylvan' && SEASON < 3) for (let k = 0; k < 4; k++) { const a = k * 1.7; circ(px + Math.cos(a) * rx * 0.6, py + Math.sin(a) * ry * 0.6, 2, '#5e9447'); if (k % 2) circ(px + Math.cos(a) * rx * 0.6, py + Math.sin(a) * ry * 0.6 - 1, 0.9, '#f7c6d6'); }
      if (SEASON < 3) rec('sparks', { x: px, y: py, kind: 'water', rx, ry });
    }
    // empty wall: survey line
    if (G.lvl(city, 'wall') === 0 && !city.buildQueue.some(q => q.type === 'wall')) {
      c.save(); c.setLineDash([3, 4]);
      poly(quad(WALL_A, WALL_A, WALL_B - WALL_A, WALL_B - WALL_A), null, 'rgba(90,60,30,0.45)', 1);
      c.restore();
    }
  }
  function fieldCount(city) {
    const L = G.lvl(city, 'farm');
    return L ? clampv(Math.round((1 + L / 2) * clampv(REG.site.grain || 1, 0.5, 1.6)), 1, REG.fields.length) : 0;
  }
  function field([x, y, w, d], planted, i, dry) {
    const soil = SNOW ? '#e4e8ea' : STARVE ? '#8a8276' : dry ? '#a88a5c' : '#8a6440';
    poly(quad(x + 0.08, y + 0.08, w - 0.16, d - 0.16), soil, 'rgba(60,40,20,0.35)');
    let crop;
    if (STARVE) crop = '#a39f8f';
    else if (SEASON === 0) crop = '#7cbf4a';
    else if (SEASON === 1) crop = i % 3 === 2 ? '#c9b24a' : '#e2bf4a';
    else if (SEASON === 2) crop = i % 2 ? '#c99a3a' : '#a8743a';
    else crop = '#f4f7f8';
    if (dry && !STARVE && !SNOW) crop = mix(crop, '#d8c48a', 0.5);
    const alongX = w > d ? false : d > w ? true : i % 2 === 0;
    const n = Math.round((alongX ? d : w) / 0.22);
    for (let k = 1; k < n; k++) {
      if (dry && k % 2) continue;
      const t = k / n;
      const a = alongX ? P(x + 0.15, y + d * t) : P(x + w * t, y + 0.15), b = alongX ? P(x + w - 0.15, y + d * t) : P(x + w * t, y + d - 0.15);
      if (SNOW) { line(a, b, '#c8ced2', 0.8); continue; }
      line(a, b, crop, SEASON === 1 ? 3.2 : 2.2);
      if (SEASON === 1 && !STARVE) line([a[0], a[1] - 1.5], [b[0], b[1] - 1.5], shade(crop, 0.25), 0.8);
    }
    if (SEASON === 2 && !STARVE && i % 3 === 0) { haystack(x + w * 0.5, y + d * 0.5, 0.55); }
  }

  // ------------------------------------------------------------------
  // scene assembly
  // ------------------------------------------------------------------
  let CITY = null;
  function bandOf(L) { return L <= 4 ? 0 : L <= 9 ? 1 : L <= 14 ? 2 : 3; }
  function drawScene(ctx, glow, k, offx, offy) {
    const city = CITY;
    c = ctx; GLOW = glow;
    c.setTransform(k, 0, 0, k, offx, offy);
    R = mkRng(hashStr(city.id) ^ 0x5bd1e995);
    REC = glow ? null : { smoke: [], flags: [], fires: [], hammers: [], sails: [], sparks: [], lights: [], hits: [], anvils: [], pit: [], wheels: [] };
    const terrain = city.terrain;
    // backdrop
    drawRidge(RACE === 'delver' ? Math.min(10, 2 + Math.ceil(G.lvl(city, 'houses') / 2)) : 0);
    drawGround(city);

    const items = [];
    const push = (k2, f) => items.push({ k: k2, f });
    const queue = city.buildQueue || [];
    const qOf = t => queue.filter(q => q.type === t);
    const hits = REC ? REC.hits : [];
    const addHit = (type, pts, depth) => { if (REC) hits.push({ type, pts, depth }); };

    // buildings this view has no slot for get a spare outer-ring plot, so nothing ever vanishes
    const planted = REG.fields.slice(0, fieldCount(city)), usedR = Object.values(REG.slots);
    const spare = OUTER_SITES.map(o => o.r).filter(r => !usedR.includes(r) && !rectWet(REG, r, 0.1) && !planted.some(f => overlapR(f, r, 0.1)));
    const GEN = {};
    for (const t of Object.keys(DATA.buildings)) if (!SLOT[t] && !REG.slots[t]) { const r = spare.shift(); if (r) GEN[t] = r; }
    const types = Object.keys(DATA.buildings).filter(t => SLOT[t] || GEN[t]);
    for (const t of types) {
      const st = G.buildStatus(S, city, t);
      if (st.hidden) continue;
      const s = GEN[t] || slotOf(t), L = G.lvl(city, t), band = bandOf(L), q = qOf(t);
      const active = q.some(e => e.start <= S.time);
      if (t === 'houses') {
        const n = L ? clampv(Math.ceil(L / 2.2), 1, 9) : 0;
        if (!L) { const [cx, cy] = COTTAGES[0]; push(cx + cy + 1, () => { q.length ? foundation(cx, cy, 1.2, 1.1) : plot(cx, cy, 1.2, 1.1, st.locked); if (q.length) scaffold(cx, cy, 1.2, 1.1, 18, active); }); addHit(t, hullBox(cx, cy, 1.2, 1.1, 22), cx + cy + 1); continue; }
        for (let i = 0; i < n; i++) {
          const [cx, cy] = COTTAGES[i];
          push(cx + cy + 1.1, () => { const h = BLD.cottage(cx, cy, band, i); addHit(t, hullBox(cx, cy, 1.3, 1.2, h), cx + cy + 1.1); if (q.length && i === n - 1) scaffold(cx - 0.05, cy - 0.05, 1.35, 1.25, h * 0.8, active); });
        }
        if (q.length && n < 9) { const [cx, cy] = COTTAGES[n]; push(cx + cy + 1, () => { foundation(cx, cy, 1.2, 1.1); scaffold(cx, cy, 1.2, 1.1, 16, active); }); addHit(t, hullBox(cx, cy, 1.2, 1.1, 20), cx + cy + 1); }
        continue;
      }
      const [x, y, w, d] = t === 'mine' && !L ? [s[0] + 0.4, s[1] + 1.4, 1.2, 1.0] : s;
      const depth = x + y + (w + d) / 2;
      if (!L) {
        push(depth, () => {
          if (q.length) { foundation(x, y, w, d); scaffold(x + 0.1, y + 0.1, w - 0.2, d - 0.2, 20, active); }
          else plot(x, y, w, d, st.locked);
        });
        addHit(t, hullBox(x, y, w, d, q.length ? 24 : 10), depth);
        continue;
      }
      if (t !== 'quarry' && t !== 'warpit') push(-1, () => shadow(x + 0.2, y + 0.2, w - 0.4, d - 0.4, 0.5 + band * 0.25));
      push(depth, () => {
        const h = (BLD[t] || BLD.generic)(s, L, band);
        if (q.length) scaffold(x + 0.15, y + 0.15, w - 0.3, d - 0.3, Math.min(h, 30), active);
        if (t === 'mine') addHit(t, hullBox(x - 0.2, y + d - 1.2, w * 0.75, 1.6, h), depth); else addHit(t, hullBox(x, y, w, d, h), depth);
        if (t === 'farm') REG.fields.slice(0, fieldCount(city)).forEach(f => addHit('farm', quad(...f), f[0] + f[1]));
      });
    }
    // the mine's hill, the bridge and the watermill
    { const m = slotOf('mine'); push(m[0] + m[1] + 0.3, () => mound(m)); }
    if (REG.river) {
      const cc = riverC(REG.river, 12);
      push(12 + cc + 0.6, bridge);
      if (G.lvl(city, 'farm') > 0 || G.lvl(city, 'bakery') > 0) {
        const ws = watermillSpot(), k2 = ws.u + ws.hc;
        push(k2, () => { const h = watermill(); void h; });
      }
    }
    // drill yard dummies when no barracks / archery butts
    if (RACE !== 'ash') push(13.0 + 4.9 + 2.8, () => {
      if (G.lvl(city, 'barracks') < 1) return;
      for (const [gx, gy] of [[13.6, 5.6], [14.6, 5.4], [15.4, 6.2]]) { const [tx, ty] = P(gx, gy); line([tx - 3, ty], [tx, ty - 9], '#6a4a30', 1); line([tx + 3, ty], [tx, ty - 9], '#6a4a30', 1); circ(tx, ty - 10, 4.2, '#e6d49a', OUT); circ(tx, ty - 10, 2.6, '#c0392b'); circ(tx, ty - 10, 1, '#f6eedc'); }
    });
    // plaza centrepiece
    push(14.0 + 10.0 + 0.2, () => {
      const [gx, gy] = [14.0, 10.0];
      if (RACE === 'hearth') { cyl(gx, gy, 0.28, 0, 5, '#9a9286', '#4f7fa8'); line(P(gx - 0.25, gy), P(gx - 0.25, gy, 14), '#6a4a30', 1.2); line(P(gx + 0.25, gy), P(gx + 0.25, gy, 14), '#6a4a30', 1.2); const b = { x: gx - 0.32, y: gy - 0.32, w: 0.64, d: 0.64, z: 0, h: 14, col: STY.wall }; gable(b, 6, STY.roof, 'x', 'tile', 0.05); }
      else if (RACE === 'delver') { box(gx - 0.25, gy - 0.25, 0.5, 0.5, 0, 6, '#8c867e'); box(gx - 0.12, gy - 0.12, 0.24, 0.24, 6, 18, '#a8a299'); lampDot(...P(gx, gy, 27), 2.4, '#e8a040', '#ffb04a'); rec('fires', { x: P(gx, gy, 25)[0], y: P(gx, gy, 25)[1], s: 0.5 }); rec('lights', { x: P(gx, gy, 26)[0], y: P(gx, gy, 26)[1], r: 26 }); }
      else if (RACE === 'sylvan') { for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; const [lx, ly] = P(gx + Math.cos(a) * 0.35, gy + Math.sin(a) * 0.35); line([lx, ly], [lx, ly - 12], '#6e5136', 1.2); lantern(lx, ly - 9, 1.5); } }
      else { firePit(gx, gy, 1); }
    });
    // Ashborn bonfire in the pond spot
    if (RACE === 'ash' && !DATA.buildings.temple) push(POND[0] + POND[1], () => { firePit(POND[0], POND[1], 1.4); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.3; skull(...P(POND[0] + Math.cos(a) * 0.8, POND[1] + Math.sin(a) * 0.8, 3), 0.8); } });
    if (RACE === 'ash') { for (const [gx, gy] of [[6.25, 16.2], [8.1, 14.5]]) if (G.lvl(city, 'houses') >= 3) push(gx + gy, () => firePit(gx, gy, 0.7)); }
    // sylvan lantern posts along the main roads
    if (RACE === 'sylvan') for (const [gx, gy] of [[12.65, 16.5], [12.65, 19.0], [16.5, 12.65], [19.0, 12.65], [11.35, 7.0], [7.0, 11.35]]) push(gx + gy, () => { const [lx, ly] = P(gx, gy); line([lx, ly], [lx, ly - 14], '#6e5136', 1.3); line([lx, ly - 14], [lx + 4, ly - 14], '#6e5136', 1); lantern(lx + 4, ly - 10, 1.6); });
    // hearth odds and ends
    if (RACE === 'hearth') { push(17.4 + 16.6, () => { const [cx, cy] = P(17.0, 16.8); poly([[cx - 7, cy - 4], [cx + 7, cy - 4], [cx + 6, cy - 9], [cx - 6, cy - 9]], '#9a6a3c'); circ(cx - 5, cy - 2, 2.6, '#5a4030'); circ(cx + 5, cy - 2, 2.6, '#5a4030'); haystack(17.0, 16.75, 0.45); }); }

    // walls
    const WL = G.lvl(city, 'wall'), wb = wallBand(WL), wq = qOf('wall').length > 0, wst = G.buildStatus(S, city, 'wall');
    const sides = ['N', 'W', 'E', 'S'];
    for (const side of sides) {
      for (let a = WALL_A; a < WALL_B - 0.01; a += 1) {
        const b = a + 1;
        const pieces = [];
        if (b <= GATE0 || a >= GATE1) pieces.push([a, b]); else { if (a < GATE0) pieces.push([a, GATE0]); if (b > GATE1) pieces.push([GATE1, b]); }
        for (const [p0, p1] of pieces) {
          const m = (p0 + p1) / 2;
          const gx = side === 'N' || side === 'S' ? m : side === 'W' ? WALL_A : WALL_B;
          const gy = side === 'N' || side === 'S' ? (side === 'N' ? WALL_A : WALL_B) : m;
          const dep = gx + gy + 0.3;
          if (wb >= 0) push(dep, () => wallSeg(side, p0, p1, wb));
          const fp = side === 'N' || side === 'S' ? [p0, gy - 0.25, p1 - p0, 0.5] : [gx - 0.25, p0, 0.5, p1 - p0];
          addHit('wall', hullBox(fp[0], fp[1], fp[2], fp[3], wb >= 0 ? 22 + wb * 4 : 8), dep);
        }
      }
      if (wb >= 0) { const m = (GATE0 + GATE1) / 2; const gx = side === 'N' || side === 'S' ? m : side === 'W' ? WALL_A : WALL_B, gy = side === 'N' || side === 'S' ? (side === 'N' ? WALL_A : WALL_B) : m; push(gx + gy + 0.35, () => gate(side, wb)); }
    }
    if (wb >= 2) for (const [gx, gy] of [[WALL_A, WALL_A], [WALL_B, WALL_A], [WALL_A, WALL_B], [WALL_B, WALL_B]]) { push(gx + gy + 0.4, () => wallTower(gx, gy, wb)); addHit('wall', hullBox(gx - 0.45, gy - 0.45, 0.9, 0.9, 40 + wb * 7), gx + gy + 0.4); }
    if (wq) for (const [gx, gy] of [[WALL_A + 1.5, WALL_B], [WALL_B, WALL_A + 1.5]]) push(gx + gy + 0.5, () => scaffold(gx - 0.5, gy - 0.3, 1.0, 0.6, 24, qOf('wall').some(e => e.start <= S.time)));
    if (wb < 0) push(WALL_B + 13.5, () => { // sign at the would-be gate
      const [sx, sy] = P(13.2, WALL_B + 0.4); c.save(); if (wst.locked) c.globalAlpha = 0.45;
      line([sx, sy], [sx, sy - 11], '#6a4a30', 1.4); poly([[sx - 5, sy - 15], [sx + 5, sy - 13], [sx + 5, sy - 8], [sx - 5, sy - 10]], '#d9c08a'); c.restore();
      for (const [gx, gy] of [[WALL_A, WALL_A], [WALL_B, WALL_A], [WALL_A, WALL_B], [WALL_B, WALL_B]]) line(P(gx, gy), P(gx, gy, 7), '#7a5a3a', 1.6);
    });

    // decor: woods, rocks, meadow and reeds following the real neighbouring terrain
    const Rd = mkRng(hashStr(city.id + 'decor'));
    const DENS = { forest: 1, mountain: 0.5, hills: 0.5, fertile: 0.32, plains: 0.22, lake: 0.2 };
    const raceMul = RACE === 'sylvan' ? 1.25 : RACE === 'ash' ? 0.65 : 1;
    const nfld = fieldCount(city);
    const outer = ['mine', 'quarry', 'lumber', 'farm'].map(slotOf).concat(Object.values(GEN));
    const blocked = (gx, gy) => {
      if (gx < 0.5 || gy < 0.5 || gx > N - 0.5 || gy > N - 0.5) return true;
      if (gx > 3.3 && gy > 3.3 && gx < 20.7 && gy < 20.7) return true;
      if (Math.abs(gx - 12) < 0.9 || Math.abs(gy - 12) < 0.9) return true;
      if (Math.abs(gx - 3.4) < 0.35 || Math.abs(gy - 3.4) < 0.35 || Math.abs(gx - 20.5) < 0.35 || Math.abs(gy - 20.5) < 0.35) return true;
      for (const [x, y, w, d] of outer) if (gx > x - 0.5 && gy > y - 0.5 && gx < x + w + 0.3 && gy < y + d + 0.3) return true;
      const m = slotOf('mine'); if (gx > m[0] - 1.1 && gy > m[1] - 1.2 && gx < m[0] + m[2] + 0.6 && gy < m[1] + m[3] + 0.6) return true;
      for (const [x, y, w, d] of REG.fields.slice(0, nfld)) if (gx > x - 0.2 && gy > y - 0.2 && gx < x + w + 0.2 && gy < y + d + 0.2) return true;
      if (inWater(REG, gx, gy, 0.15)) return true;
      if (REG.river && G.lvl(city, 'farm') + G.lvl(city, 'bakery') > 0) { const ws = watermillSpot(); const [mx, my] = REG.river.along === 'gx' ? [ws.u, ws.hc] : [ws.hc, ws.u]; if (Math.abs(gx - mx) < 1.0 && Math.abs(gy - my) < 1.0) return true; }
      return false;
    };
    const front = (gx, gy) => gx > 20 || gy > 20;
    let placed = 0;
    for (let tries = 0; placed < 150 && tries < 1400; tries++) {
      const gx = Rd() * N, gy = Rd() * N;
      if (blocked(gx, gy)) continue;
      const terr = REG.ter[secOf(gx, gy)];
      if (Rd() > (DENS[terr] || 0.25) * raceMul) continue;
      placed++;
      const roll = Rd(), s = 0.75 + Rd() * 0.45;
      let kind;
      if (terr === 'forest') kind = roll < (RACE === 'sylvan' ? 0.3 : 0.5) ? 'pine' : roll < 0.92 ? 'tree' : 'bush';
      else if (terr === 'mountain') kind = roll < 0.35 ? 'rock' : roll < 0.5 ? (front(gx, gy) ? 'crag' : 'rock') : roll < 0.9 ? 'pine' : 'scrub';
      else if (terr === 'hills') kind = roll < 0.3 ? 'rock' : roll < 0.5 ? 'mound' : roll < 0.75 ? 'scrub' : 'tree';
      else if (terr === 'fertile') kind = roll < 0.35 ? 'tree' : roll < 0.6 ? 'bush' : 'flowers';
      else if (terr === 'lake') kind = inWater(REG, gx, gy, 0.8) ? 'reeds' : roll < 0.5 ? 'bush' : 'tree';
      else kind = roll < 0.3 ? 'bush' : roll < 0.5 ? 'tree' : roll < 0.62 ? 'rock' : roll < 0.8 ? 'scrub' : 'flowers';
      if (RACE === 'ash' && kind === 'tree' && Rd() < 0.5) kind = Rd() < 0.5 ? 'bones' : 'scrub';
      const rockCol = terr === 'mountain' ? '#8f8a84' : '#a39d92';
      const fn = kind === 'rock' ? () => rock(gx, gy, s * (terr === 'mountain' ? 1.15 : 0.9), rockCol)
        : kind === 'crag' ? () => { rock(gx - 0.3, gy - 0.2, s * 1.5, rockCol); rock(gx + 0.25, gy + 0.1, s * 1.1, shade(rockCol, -0.05)); rock(gx - 0.1, gy + 0.35, s * 0.8, rockCol); }
        : kind === 'pine' ? () => treePine(gx, gy, s) : kind === 'tree' ? () => treeDecid(gx, gy, s, RACE === 'sylvan')
        : kind === 'mound' ? () => { const [x, y] = P(gx, gy); c.beginPath(); c.ellipse(x, y, 16 * s, 8 * s, 0, Math.PI, TAU); gradFill(x - 16 * s, x + 16 * s, SNOW ? '#eef2f4' : shade(GROUND, -0.06), false); rock(gx + 0.2, gy + 0.1, 0.5 * s, '#a39d92'); }
        : kind === 'scrub' ? () => { const [x, y] = P(gx, gy); const sc = SNOW ? '#c8ccc4' : SEASON === 2 ? '#a8783a' : '#8a8a4a'; for (let k = -2; k <= 2; k++) line([x, y], [x + k * 2.2, y - 4 - Math.abs(k) % 2 * 2], sc, 1); }
        : kind === 'flowers' ? () => { if (SNOW) return; const [x, y] = P(gx, gy); for (let k = 0; k < 6; k++) circ(x + Math.cos(k * 2.4) * 4, y + Math.sin(k * 2.4) * 2 - 1, 1.1, SEASON === 2 ? ['#d9822b', '#e0a634'][k % 2] : ['#f2c94c', '#ffffff', '#e86a8a', '#b07ad9'][k % 4]); }
        : kind === 'reeds' ? () => reeds(gx, gy)
        : kind === 'bones' ? () => { const [x, y] = P(gx, gy); line([x - 5, y], [x + 4, y - 2], '#ece2c8', 1.6); line([x - 2, y - 3], [x + 2, y + 1], '#ece2c8', 1.4); skull(x + 5, y - 2, 0.8); }
        : () => bush(gx, gy, s * 0.8);
      push(gx + gy, fn);
    }
    // a few trees inside the walls
    const inTrees = RACE === 'sylvan' ? [[4.6, 11.0], [11.0, 4.6], [15.9, 15.9], [19.5, 16.2], [16.2, 19.5], [4.7, 19.3]] : RACE === 'ash' ? [] : [[16.2, 19.4], [19.4, 16.2], [4.6, 11.1]];
    for (const [gx, gy] of inTrees) push(gx + gy, () => treeDecid(gx, gy, 0.85, RACE === 'sylvan'));

    items.sort((a, b) => a.k - b.k);
    for (const it of items) it.f();
    if (REC) REC.hits.sort((a, b) => b.depth - a.depth);
    return REC;
  }

  // ------------------------------------------------------------------
  // runtime: canvases, layout cache, animation
  // ------------------------------------------------------------------
  const cv = document.createElement('canvas');
  cv.className = 'cv-canvas';
  const ctx = cv.getContext('2d');
  const dayC = document.createElement('canvas'), glowC = document.createElement('canvas'), tmpC = document.createElement('canvas');
  let cssW = 0, cssH = 0, dpr = 1, K = 1, OFFX = 0, OFFY = 0, layoutKey = '', drawnKey = '', recd = null, running = false, rafId = 0;
  let hover = null, mouse = null, lastT = 0, cityId = null;
  let villagers = [], graph = null, lastHostH = 340;
  const perf = { frames: 0, total: 0, last: 0 };
  // prefers-reduced-motion: freeze villagers, smoke, flicker and weather on a fixed clock
  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduceMotion = !!(RM && RM.matches);
  if (RM) { const onRM = () => { reduceMotion = RM.matches; }; if (RM.addEventListener) RM.addEventListener('change', onRM); else if (RM.addListener) RM.addListener(onRM); }
  // touch: no hover, so a tap shows the highlight + label for a moment
  let lastPointerType = 'mouse', tapTimer = 0;

  function buildGraph() {
    const nodes = new Map();
    const key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2);
    const get = p => { const k = key(p); if (!nodes.has(k)) nodes.set(k, { p, n: [] }); return nodes.get(k); };
    for (const pth of PATHS) for (let i = 0; i < pth.length - 1; i++) { const a = get(pth[i]), b = get(pth[i + 1]); a.n.push(b); b.n.push(a); }
    // split long edges where another path's node lies on them (T-junctions)
    const all = [...nodes.values()];
    for (const pth of PATHS) for (let i = 0; i < pth.length - 1; i++) {
      const A = get(pth[i]), B = get(pth[i + 1]);
      const mid = all.filter(m => m !== A && m !== B && onSeg(m.p, A.p, B.p));
      if (!mid.length) continue;
      mid.sort((m1, m2) => dist(m1.p, A.p) - dist(m2.p, A.p));
      A.n = A.n.filter(z => z !== B); B.n = B.n.filter(z => z !== A);
      const chain = [A, ...mid, B];
      for (let k = 0; k < chain.length - 1; k++) { if (!chain[k].n.includes(chain[k + 1])) chain[k].n.push(chain[k + 1]); if (!chain[k + 1].n.includes(chain[k])) chain[k + 1].n.push(chain[k]); }
    }
    return [...nodes.values()].filter(nd => nd.n.length);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const onSeg = (p, a, b) => Math.abs(dist(a, p) + dist(p, b) - dist(a, b)) < 1e-6;

  function spawnVillagers(n) {
    if (!graph) graph = buildGraph();
    const inner = graph.filter(nd => nd.p[0] > 3 && nd.p[1] > 3 && nd.p[0] < 21 && nd.p[1] < 21);
    const pal = STY.cloth.concat(['#6a5a4a', '#8a7a5a', '#4a5a6a']);
    villagers = [];
    for (let i = 0; i < n; i++) {
      const a = (i % 4 === 3 ? graph : inner)[Math.floor(Math.random() * (i % 4 === 3 ? graph.length : inner.length))];
      const b = a.n[Math.floor(Math.random() * a.n.length)];
      villagers.push({ a, b, t: Math.random(), sp: 0.45 + Math.random() * 0.35, col: pal[i % pal.length], skin: SKIN[(i * 3) % SKIN.length], ph: Math.random() * 6, carry: Math.random() < 0.3, wait: 0 });
    }
  }
  function stepVillagers(dt) {
    for (const v of villagers) {
      if (v.wait > 0) { v.wait -= dt; continue; }
      const len = dist(v.a.p, v.b.p) || 0.01;
      v.t += v.sp * dt / len;
      if (v.t >= 1) {
        const prev = v.a; v.a = v.b; v.t = 0;
        const opts = v.a.n.length > 1 ? v.a.n.filter(z => z !== prev) : v.a.n;
        v.b = opts[Math.floor(Math.random() * opts.length)];
        if (Math.random() < 0.12) v.wait = 0.8 + Math.random() * 2.5;
      }
    }
  }

  function computeKey(city) {
    const emp = S.empires[city.owner];
    const se = G.season(S).index;
    REG = computeRegion(city);
    return [city.id, emp.race, se, city.terrain, REG.sig, Object.keys(DATA.buildings).length, JSON.stringify(city.buildings), (city.buildQueue || []).map(q => q.type + q.level + (q.start <= S.time ? 'a' : 'w')).join(','), city.starving ? 1 : 0, cssW, cssH, dpr].join('|');
  }
  function sizeCanvas(host) {
    const w = Math.max(280, Math.floor(host.clientWidth || 600));
    const h = Math.min(560, Math.round(w * LH / LW));
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (w === cssW && h === cssH && d === dpr) return;
    cssW = w; cssH = h; dpr = d;
    cv.width = dayC.width = glowC.width = tmpC.width = Math.round(w * d);
    cv.height = dayC.height = glowC.height = tmpC.height = Math.round(h * d);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    const s = Math.min(w / LW, h / LH);
    K = s * d; OFFX = (w - LW * s) / 2 * d; OFFY = (h - LH * s) / 2 * d;
    host.style.height = h + 'px'; lastHostH = h;
    drawnKey = '';
  }
  function rebuild() {
    const city = S.cities[cityId]; if (!city) return;
    CITY = city;
    RACE = S.empires[city.owner].race; STY = PAL[RACE] || PAL.hearth;
    SEASON = G.season(S).index; SNOW = SEASON === 3; STARVE = !!city.starving;
    REG = computeRegion(city);
    GROUND = groundColor(city.terrain);
    const t0 = performance.now();
    const dc = dayC.getContext('2d'); dc.setTransform(1, 0, 0, 1, 0, 0); dc.clearRect(0, 0, dayC.width, dayC.height);
    recd = drawScene(dc, false, K, OFFX, OFFY);
    const gc = tmpC.getContext('2d'); gc.setTransform(1, 0, 0, 1, 0, 0); gc.clearRect(0, 0, tmpC.width, tmpC.height);
    drawScene(gc, true, K, OFFX, OFFY);
    const g2 = glowC.getContext('2d'); g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, glowC.width, glowC.height);
    g2.globalCompositeOperation = 'source-over'; g2.drawImage(tmpC, 0, 0);
    try { g2.filter = `blur(${Math.max(2, 5 * K)}px)`; g2.globalCompositeOperation = 'lighter'; g2.drawImage(tmpC, 0, 0); g2.drawImage(tmpC, 0, 0); } catch (e) { /* no canvas filters */ }
    g2.filter = 'none'; g2.globalCompositeOperation = 'source-over';
    c = null;
    perf.rebuild = performance.now() - t0;
    drawnKey = layoutKey;
    const want = clampv(Math.round(city.pop / 12), 3, 22);
    const n = city.starving ? Math.max(2, Math.round(want / 2)) : want;
    if (villagers.length !== n || villagers.cityId !== city.id) { spawnVillagers(n); villagers.cityId = city.id; }
  }

  // --------------------------- per-frame -----------------------------
  const smoothstep = (a, b, x) => { const t = clampv((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function frame(ts) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    renderFrame(ts);
  }
  function renderFrame(ts) {
    if (!S || !S.cities[cityId]) return;
    const t0 = performance.now();
    if (drawnKey !== layoutKey) rebuild();
    if (!recd) return;
    const city = S.cities[cityId];
    const t = reduceMotion ? 12 : ts / 1000, dt = reduceMotion ? 0 : Math.min(0.1, lastT ? t - lastT : 0.016); lastT = t;
    const day = G.daylight(S), night = 1 - smoothstep(0.12, 0.5, day), dusk = Math.max(0, 1 - Math.abs(day - 0.3) / 0.18) * (1 - night * 0.5);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(dayC, 0, 0);
    ctx.setTransform(K, 0, 0, K, OFFX, OFFY);
    stepVillagers(dt);
    drawDynamic(city, t, night);
    // lighting
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (night > 0.01) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(16,24,64,${0.62 * night})`; ctx.fillRect(0, 0, cv.width, cv.height); }
    if (dusk > 0.01) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(255,128,48,${0.13 * dusk})`; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.globalCompositeOperation = 'destination-over';
    const sky = ctx.createLinearGradient(0, 0, 0, cv.height);
    const se = SEASON;
    const dayTop = ['#cfe6e2', '#cfe2ee', '#ead9c0', '#dfe7ee'][se], dayBot = ['#eef0dc', '#f1ead2', '#f0e2cc', '#f2f5f7'][se];
    sky.addColorStop(0, mix(mix(dayTop, '#e8a070', dusk * 0.5), '#141c38', night)); sky.addColorStop(1, mix(mix(dayBot, '#f0c090', dusk * 0.4), '#262c46', night));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter';
    const la = clampv(night * 1.1, 0, 1);
    if (la > 0.02) { ctx.globalAlpha = la; ctx.drawImage(glowC, 0, 0); ctx.globalAlpha = 1; }
    ctx.setTransform(K, 0, 0, K, OFFX, OFFY);
    drawLights(city, t, la);
    ctx.globalCompositeOperation = 'source-over';
    drawWeather(t, night);
    drawHover(t);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const ms = performance.now() - t0;
    perf.frames++; perf.total += ms; perf.last = ms;
  }

  function refinerOn(city, type) { return G.lvl(city, type) > 0 && !(city.refineOff && city.refineOff[type]) && ((city.refineEff && city.refineEff[type]) || 0) > 0.05; }
  function drawDynamic(city, t, night) {
    const X = ctx;
    // smoke
    for (const s of recd.smoke) {
      let on, a = 1;
      if (s.kind === 'house' || s.kind === 'hall') { on = SEASON === 3 || night > 0.6 || s.kind === 'hall' && SEASON === 2; a = 0.8; }
      else if (s.kind === 'smelter' || s.kind === 'smithy' || s.kind === 'armory' || s.kind === 'bakery' || s.kind === 'runeforge') on = refinerOn(city, s.kind);
      else on = false;
      if (!on) continue;
      if (s.kind !== 'house' && s.kind !== 'hall') a = 0.5 + 0.5 * clampv((city.refineEff || {})[s.kind] || 0, 0, 1);
      const n = s.dark ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const p = (t * (s.dark ? 0.28 : 0.2) + i / n + s.seed) % 1;
        const x = s.x + Math.sin(p * 5 + s.seed * 12) * 2.5 + p * 16;
        const y = s.y - p * (s.dark ? 46 : 34);
        const r = 1.8 + p * (s.dark ? 7.5 : 5.5);
        X.globalAlpha = (1 - p) * (s.dark ? 0.55 : 0.4) * a * Math.min(1, p * 6);
        X.fillStyle = s.kind === 'runeforge' ? '#b8d8e8' : s.dark ? '#6a645e' : '#e4e0d8';
        X.beginPath(); X.arc(x, y, r, 0, TAU); X.fill();
      }
    }
    X.globalAlpha = 1;
    // windmill sails
    for (const s of recd.sails) {
      const ang = refinerOn(city, 'bakery') ? t * 1.3 : 0.4;
      X.strokeStyle = '#5a4030'; X.lineWidth = 1.2;
      for (let k = 0; k < 4; k++) {
        const a = ang + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
        const ex = s.x + ca * s.r, ey = s.y + sa * s.r * 0.92;
        X.beginPath(); X.moveTo(s.x, s.y); X.lineTo(ex, ey); X.stroke();
        const px = -sa * 4.5, py = ca * 4.5 * 0.92;
        X.beginPath(); X.moveTo(s.x + ca * 5, s.y + sa * 5 * 0.92); X.lineTo(ex, ey); X.lineTo(ex + px, ey + py); X.lineTo(s.x + ca * 5 + px, s.y + sa * 5 * 0.92 + py); X.closePath();
        X.fillStyle = '#efe2c4'; X.fill(); X.strokeStyle = '#5a4030'; X.lineWidth = 0.8; X.stroke(); X.beginPath(); X.moveTo(s.x + ca * 10 + px, s.y + sa * 10 * 0.92 + py); X.lineTo(s.x + ca * 10, s.y + sa * 10 * 0.92); X.moveTo(s.x + ca * 15 + px, s.y + sa * 15 * 0.92 + py); X.lineTo(s.x + ca * 15, s.y + sa * 15 * 0.92); X.stroke();
      }
      X.fillStyle = '#4a3020'; X.beginPath(); X.arc(s.x, s.y, 2, 0, TAU); X.fill();
    }
    // water wheels
    for (const w of recd.wheels) {
      const a0 = t * 1.1;
      X.strokeStyle = '#5a4030'; X.lineWidth = 1.6; X.beginPath(); X.arc(w.x, w.y, w.r, 0, TAU); X.stroke();
      X.lineWidth = 1;
      for (let k = 0; k < 8; k++) { const a = a0 + k * Math.PI / 4; X.beginPath(); X.moveTo(w.x, w.y); X.lineTo(w.x + Math.cos(a) * w.r, w.y + Math.sin(a) * w.r); X.stroke(); X.fillStyle = '#7a5434'; X.fillRect(w.x + Math.cos(a) * w.r - 1.5, w.y + Math.sin(a) * w.r - 1.5, 3, 3); }
      if (SEASON !== 3) { X.fillStyle = 'rgba(255,255,255,0.6)'; for (let k = 0; k < 3; k++) { const p = (t * 1.5 + k / 3) % 1; X.beginPath(); X.arc(w.x + w.r * 0.6 + p * 4, w.y + w.r * 0.7 + p * 3, 1.2 * (1 - p) + 0.3, 0, TAU); X.fill(); } }
    }
    // fires
    for (const f of recd.fires) {
      if (f.glowOnly) continue;
      const fl = 0.75 + 0.25 * Math.sin(t * 13 + f.x) * Math.sin(t * 7.3 + f.y);
      flame(f.x, f.y, 5 * f.s * fl, '#e8582a'); flame(f.x + 1, f.y, 3.4 * f.s * fl, '#ffb03a'); flame(f.x + 0.5, f.y, 1.8 * f.s, '#fff0a0');
    }
    // flags
    for (const f of recd.flags) {
      let px = f.x, py = f.y;
      if (f.pole) { X.strokeStyle = '#4a3a2a'; X.lineWidth = 1.2; X.beginPath(); X.moveTo(px, py + f.pole); X.lineTo(px, py - 1); X.stroke(); }
      const L = f.len, hgt = 5.5;
      X.beginPath();
      const pts = [];
      for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push([px + u * L, py + Math.sin(t * 5 - u * 4 + f.seed * 9) * 1.6 * u]); }
      X.moveTo(px, py); for (const p of pts) X.lineTo(p[0], p[1]);
      for (let i = 6; i >= 0; i--) X.lineTo(pts[i][0], pts[i][1] + hgt * (1 - i / 6 * 0.25));
      X.closePath(); X.fillStyle = f.col; X.fill(); X.strokeStyle = 'rgba(40,20,10,0.5)'; X.lineWidth = 0.6; X.stroke();
    }
    // villagers
    const vis = night > 0.7 ? Math.ceil(villagers.length * 0.35) : villagers.length;
    for (let i = 0; i < vis; i++) {
      const v = villagers[i];
      const gx = v.a.p[0] + (v.b.p[0] - v.a.p[0]) * v.t, gy = v.a.p[1] + (v.b.p[1] - v.a.p[1]) * v.t;
      const [x, y] = P(gx, gy);
      const moving = v.wait <= 0, ph = t * 9 * v.sp + v.ph;
      walker(x, y, v.col, v.skin, moving ? ph : 0, v.carry, (v.b.p[0] - v.a.p[0]) - (v.b.p[1] - v.a.p[1]) < 0 ? -1 : 1);
    }
    // soldiers drilling
    const troops = Object.values(city.units || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
    if (troops > 0 && G.lvl(city, 'barracks') > 0) {
      const n = Math.min(8, Math.ceil(troops / 8));
      const cols = 4, march = Math.sin(t * 0.7) * 0.2;
      const step = Math.abs(Math.sin(t * 0.7)) < 0.95;
      for (let i = n - 1; i >= 0; i--) {
        const r = Math.floor(i / cols), k = i % cols;
        const gx = DRILL[0] + 0.45 + k * 0.6 + march, gy = DRILL[1] + 0.45 + r * 0.6;
        const [x, y] = P(gx, gy);
        soldier(x, y, STY.flag, step ? t * 6 + r : 0, Math.sin(t * 0.7 + Math.PI / 2) > 0 ? 1 : -1);
      }
      if (G.lvl(city, 'warpit') > 0) for (const pt of recd.pit) { const o = Math.sin(t * 3) * 3; soldier(pt.x - 6 + o, pt.y + 2, '#a3221b', t * 8, 1); soldier(pt.x + 6 - o, pt.y + 2, '#6d4c8d', t * 8 + 2, -1); }
    }
    // builders hammering
    for (const h of recd.hammers) {
      const sw = Math.sin(t * 9);
      walker(h.x, h.y, '#8a5a3a', SKIN[1], 0, false, 1);
      X.strokeStyle = '#5a4030'; X.lineWidth = 1.2; const a = -0.6 + sw * 0.9;
      const hx = h.x + 2 + Math.cos(a) * 5, hy = h.y - 6 + Math.sin(a) * 5;
      X.beginPath(); X.moveTo(h.x + 2, h.y - 6); X.lineTo(hx, hy); X.stroke();
      X.fillStyle = '#4a4a50'; X.fillRect(hx - 1.5, hy - 1.5, 3, 3);
      if (sw > 0.92) { X.fillStyle = '#ffe9a0'; for (let k = 0; k < 3; k++) X.fillRect(hx + 2 + k * 1.5, hy - 2 + k, 1, 1); }
    }
    // smith at the anvil
    if (refinerOn(city, 'smithy')) for (const a of recd.anvils) {
      const sw = Math.sin(t * 7);
      X.strokeStyle = '#3a3a40'; X.lineWidth = 1.3; const ang = -1.2 + sw * 0.8;
      X.beginPath(); X.moveTo(a.x - 4, a.y - 2); X.lineTo(a.x - 4 + Math.cos(ang) * 6, a.y - 2 + Math.sin(ang) * 6); X.stroke();
      if (sw > 0.85) for (let k = 0; k < 4; k++) { X.fillStyle = k % 2 ? '#ffd060' : '#ff8a30'; X.fillRect(a.x + (k - 2) * 2, a.y - 1 - k * 1.5, 1.2, 1.2); }
    }
  }
  function flame(x, y, s, col) {
    ctx.beginPath(); ctx.moveTo(x - s * 0.6, y); ctx.quadraticCurveTo(x - s * 0.7, y - s * 1.1, x, y - s * 2.1); ctx.quadraticCurveTo(x + s * 0.7, y - s * 1.1, x + s * 0.6, y); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
  }
  function walker(x, y, col, skin, ph, carry, dir) {
    const X = ctx, sw = Math.sin(ph) * 1.6, bob = Math.abs(Math.cos(ph)) * 0.8;
    X.fillStyle = 'rgba(30,20,10,0.22)'; X.beginPath(); X.ellipse(x, y, 3, 1.3, 0, 0, TAU); X.fill();
    X.strokeStyle = '#3a2a20'; X.lineWidth = 1.2;
    X.beginPath(); X.moveTo(x - 0.8, y - 3); X.lineTo(x - 0.8 + sw, y); X.moveTo(x + 0.8, y - 3); X.lineTo(x + 0.8 - sw, y); X.stroke();
    X.fillStyle = col; X.beginPath(); X.moveTo(x - 2.3, y - 3 - bob); X.lineTo(x + 2.3, y - 3 - bob); X.lineTo(x + 1.7, y - 8 - bob); X.lineTo(x - 1.7, y - 8 - bob); X.closePath(); X.fill();
    X.fillStyle = skin; X.beginPath(); X.arc(x, y - 9.8 - bob, 1.8, 0, TAU); X.fill();
    if (carry) { X.fillStyle = '#c9a874'; X.fillRect(x + dir * 1.5 - 1.5, y - 10 - bob, 3.2, 2.6); }
  }
  function soldier(x, y, col, ph, dir) {
    walker(x, y, col, SKIN[0], ph, false, dir);
    const X = ctx; X.strokeStyle = '#6a4a30'; X.lineWidth = 0.9;
    X.beginPath(); X.moveTo(x + dir * 2.6, y - 1); X.lineTo(x + dir * 2.6, y - 15); X.stroke();
    X.fillStyle = '#d8dce2'; X.beginPath(); X.moveTo(x + dir * 2.6 - 1, y - 15); X.lineTo(x + dir * 2.6 + 1, y - 15); X.lineTo(x + dir * 2.6, y - 18); X.closePath(); X.fill();
    X.fillStyle = '#8a8a90'; X.beginPath(); X.arc(x, y - 10.6, 1.9, Math.PI, TAU); X.fill();
  }
  function glowDot(x, y, r, col, a) {
    const X = ctx; const g = X.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
    X.fillStyle = g; X.beginPath(); X.arc(x, y, r, 0, TAU); X.fill();
  }
  function drawLights(city, t, la) {
    const X = ctx;
    for (const s of recd.sparks) {
      if (s.kind === 'rune') { const p = 0.55 + 0.45 * Math.sin(t * 2.4 + s.x * 0.3); glowDot(s.x, s.y, 9, 'rgba(110,210,255,A)', (0.25 + la * 0.5) * p); }
      else if (s.kind === 'grove') {
        for (let k = 0; k < 10; k++) { const ph = (t * 0.12 + k / 10) % 1; const a = k * 2.4 + t * 0.3; const x = s.x + Math.cos(a) * s.r * 0.8 * (0.4 + ph * 0.6), y = s.y + s.r * 0.3 - ph * s.r * 1.3; glowDot(x, y, 3.5, 'rgba(190,255,210,A)', (0.35 + la * 0.5) * Math.sin(ph * Math.PI)); }
      } else if (s.kind === 'moon') { const p = 0.6 + 0.4 * Math.sin(t * 1.7); glowDot(s.x, s.y, 16, 'rgba(190,230,255,A)', (0.3 + la * 0.6) * p); for (let k = 0; k < 4; k++) { const ph = (t * 0.25 + k / 4) % 1; glowDot(s.x + Math.cos(k * 1.9) * 4, s.y - ph * 22, 2.5, 'rgba(220,240,255,A)', Math.sin(ph * Math.PI) * (0.4 + la * 0.5)); }
      } else if (s.kind === 'star') { glowDot(s.x, s.y, 6, 'rgba(190,230,255,A)', (0.3 + la * 0.6) * (0.6 + 0.4 * Math.sin(t * 3 + s.x))); }
      else if (s.kind === 'water') { for (let k = 0; k < 3; k++) { const ph = (t * 0.6 + k / 3) % 1; const x = s.x + Math.cos(k * 2.1 + Math.floor(t * 0.6 + k / 3)) * s.rx * 0.6, y = s.y + Math.sin(k * 1.7 + Math.floor(t * 0.6 + k / 3)) * s.ry * 0.5; X.fillStyle = `rgba(255,255,255,${0.8 * Math.sin(ph * Math.PI)})`; X.fillRect(x - 1.5, y - 0.4, 3, 0.8); X.fillRect(x - 0.4, y - 1.5, 0.8, 3); } }
    }
    for (const f of recd.fires) { const fl = 0.8 + 0.2 * Math.sin(t * 11 + f.x); glowDot(f.x, f.y - 3 * f.s, 18 * f.s + 6, 'rgba(255,150,60,A)', (0.18 + la * 0.5) * fl); }
    if (la > 0.05) {
      for (const l of recd.lights) if (l.col !== 'grove') glowDot(l.x, l.y, l.r * 0.55, 'rgba(255,200,110,A)', la * 0.35);
      const vis = Math.ceil(villagers.length * 0.35);
      for (let i = 0; i < vis; i++) { const v = villagers[i]; if (i % 2) continue; const gx = v.a.p[0] + (v.b.p[0] - v.a.p[0]) * v.t, gy = v.a.p[1] + (v.b.p[1] - v.a.p[1]) * v.t; const [x, y] = P(gx, gy); glowDot(x + 3, y - 6, 9, 'rgba(255,200,110,A)', la * 0.6); X.fillStyle = `rgba(255,220,140,${la})`; X.fillRect(x + 2.4, y - 6.5, 1.4, 1.6); }
      if (SEASON === 1) for (let k = 0; k < 14; k++) { const x = (k * 137.5 + Math.sin(t * 0.5 + k) * 30) % LW, y = 300 + ((k * 83) % 260) + Math.cos(t * 0.7 + k) * 10; glowDot(x, y, 4, 'rgba(230,255,120,A)', la * Math.max(0, Math.sin(t * 2 + k * 1.3))); }
    }
  }
  function drawWeather(t, night) {
    const X = ctx;
    if (SEASON === 3) {
      X.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k < 90; k++) { const sp = 18 + (k % 5) * 6; const x = ((k * 97.3 + t * 9 + Math.sin(t * 0.8 + k) * 12) % LW + LW) % LW, y = (k * 53.7 + t * sp) % LH; X.beginPath(); X.arc(x, y, 0.8 + (k % 3) * 0.45, 0, TAU); X.fill(); }
    } else if (SEASON === 0 || SEASON === 2) {
      const cols = SEASON === 0 ? ['#f7c6d6', '#ffffff', '#f2a8c0'] : ['#d9822b', '#c4561f', '#e0a634'];
      for (let k = 0; k < 18; k++) {
        const x = ((k * 151.3 + t * 14 + Math.sin(t + k) * 20) % LW + LW) % LW, y = (k * 71.1 + t * (10 + k % 4 * 3)) % LH, a = t * 2 + k;
        X.fillStyle = cols[k % 3]; X.beginPath(); X.ellipse(x, y, 2.2, 1.1, a, 0, TAU); X.fill();
      }
    }
    void night;
  }
  function drawHover(t) {
    if (!hover) return;
    const X = ctx;
    const polys = recd.hits.filter(h => h.type === hover.type);
    X.save();
    X.lineJoin = 'round';
    X.shadowColor = 'rgba(255,214,120,0.95)'; X.shadowBlur = 10 * K;
    X.strokeStyle = `rgba(255,222,140,${0.8 + 0.2 * Math.sin(t * 5)})`; X.lineWidth = 2.6; X.fillStyle = 'rgba(255,236,170,0.14)';
    for (const h of polys) { X.beginPath(); X.moveTo(h.pts[0][0], h.pts[0][1]); for (let i = 1; i < h.pts.length; i++) X.lineTo(h.pts[i][0], h.pts[i][1]); X.closePath(); X.fill(); X.stroke(); }
    X.restore();
    if (!mouse) return;
    const txt = hover.text;
    X.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    const tw = X.measureText(txt).width + 16;
    let x = mouse.x + 14, y = mouse.y - 30;
    if (x + tw > LW - 4) x = mouse.x - tw - 10;
    if (y < 4) y = mouse.y + 18;
    X.fillStyle = 'rgba(32,24,16,0.88)';
    X.beginPath(); if (X.roundRect) X.roundRect(x, y, tw, 22, 6); else X.rect(x, y, tw, 22); X.fill();
    X.fillStyle = '#fbf2dc'; X.textBaseline = 'middle'; X.fillText(txt, x + 8, y + 11.5);
  }

  // --------------------------- interaction ---------------------------
  function toLogical(ev) {
    const r = cv.getBoundingClientRect();
    const px = (ev.clientX - r.left) * dpr, py = (ev.clientY - r.top) * dpr;
    return { x: (px - OFFX) / K, y: (py - OFFY) / K };
  }
  function inPoly(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function hitAt(p) {
    if (!recd) return null;
    for (const h of recd.hits) if (inPoly(p, h.pts)) return h.type;
    return null;
  }
  function describe(type) {
    const city = S.cities[cityId]; if (!city) return '';
    const b = DATA.buildings[type], L = G.lvl(city, type);
    const q = (city.buildQueue || []).filter(e => e.type === type);
    if (L) return `${b.name} · Lv ${L}${q.length ? ' (upgrading to ' + q[q.length - 1].level + ')' : ''}`;
    if (q.length) return `${b.name} · under construction`;
    const st = G.buildStatus(S, city, type);
    if (st.locked) return `${b.name} — ${st.reason}`;
    return `Empty plot — ${b.name}`;
  }
  cv.addEventListener('pointerdown', ev => {
    lastPointerType = ev.pointerType || 'mouse';
    if (lastPointerType !== 'mouse' && tapTimer) { clearTimeout(tapTimer); tapTimer = 0; hover = null; mouse = null; }
  });
  cv.addEventListener('pointermove', ev => {
    if (ev.pointerType === 'touch') return;   // touch drags scroll the page; taps are handled on click
    mouse = toLogical(ev);
    const type = hitAt(mouse);
    hover = type ? { type, text: describe(type) } : null;
    cv.style.cursor = type ? 'pointer' : 'default';
  });
  cv.addEventListener('pointerleave', ev => { if (tapTimer && ev.pointerType !== 'mouse') return; hover = null; mouse = null; });
  cv.addEventListener('click', ev => {
    const p = toLogical(ev);
    const type = hitAt(p);
    const touch = lastPointerType !== 'mouse';
    if (touch) {
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = 0; }
      hover = type ? { type, text: describe(type) } : null;
      mouse = type ? p : null;
      if (type) tapTimer = setTimeout(() => { tapTimer = 0; hover = null; mouse = null; }, 1800);
      if (reduceMotion && running) renderFrame(performance.now());
    }
    if (!type) return;
    UI.focusBld = type;
    render(true);
    const el = document.getElementById('bld-' + type);
    if (!el) return;
    const go = () => {
      const target = el.isConnected ? el : document.getElementById('bld-' + type);
      if (!target) return;
      // the 1 s render() restores window.scrollY and would cut a smooth scroll short; hold it off while scrolling
      if (!reduceMotion) { UI.holding = true; setTimeout(() => { UI.holding = false; }, 1100); }
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    };
    setTimeout(go, touch ? 650 : 0);   // on touch, let the tapped building's label show first; 0 lands after ui-core's pointerup reset
  });

  function start() {
    if (running || document.hidden) return;
    running = true; lastT = 0; rafId = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (UI.tab === 'city' && cv.isConnected) start(); });
  window.addEventListener('resize', () => { const host = document.getElementById('cityHost'); if (host && cv.isConnected) { host.style.height = ''; sizeCanvas(host); } });

  window.cityViewHtml = city => {
    cityId = city.id;
    layoutKey = computeKey(city);
    if (hover) hover.text = describe(hover.type);
    const se = G.season(S), day = G.daylight(S);
    const tod = day > 0.6 ? 'Day' : day > 0.25 ? (G.dayPhase(S) < 0.5 ? 'Dawn' : 'Dusk') : 'Night';
    return `<div class="card cityview"><div id="cityHost" class="cv-host" style="height:${lastHostH}px"></div>
      <div class="row cv-legend"><span>${esc(se.name)} · ${tod}</span><span class="spacer"></span><span class="muted">${matchMedia('(hover: none)').matches ? 'Tap a building to see it and jump to its card' : 'Hover a building for details · click to jump to it'}</span></div></div>`;
  };
  MOUNT_HOOKS.push(tab => {
    const host = document.getElementById('cityHost');
    if (tab === 'city' && host) {
      if (cv.parentNode !== host) host.appendChild(cv);
      sizeCanvas(host);
      layoutKey = layoutKey.replace(/\|[^|]*\|[^|]*\|[^|]*$/, `|${cssW}|${cssH}|${dpr}`);
      start();
    } else stop();
  });
  window.EC_CITYVIEW = { perf, get hits() { return recd && recd.hits; }, rebuild: () => { drawnKey = ''; REGCACHE.clear(); }, region: () => REG, draw: ts => renderFrame(ts == null ? performance.now() : ts), setHover: (type, x, y) => { hover = type ? { type, text: describe(type) } : null; mouse = x == null ? null : { x, y }; },
    get hover() { return hover; }, get reduceMotion() { return reduceMotion; },
    toClient: (x, y) => { const r = cv.getBoundingClientRect(); return { x: r.left + (x * K + OFFX) / dpr, y: r.top + (y * K + OFFY) / dpr }; } };
})();
