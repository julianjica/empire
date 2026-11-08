// =====================================================================
//  World map: an inked-parchment cartographer's map drawn on ONE
//  persistent <canvas>. Defines window.worldMapHtml(city) and a
//  MOUNT_HOOKS entry that re-attaches the canvas after every render.
//
//  Layers
//    * terrain layer (offscreen, baked): paper, watercolour washes, lakes,
//      rivers, roads, ink glyphs, territories, fog of war, border, ageing.
//      Re-baked only when explored count / season / city layout changes.
//    * per frame: dimming of out-of-sight tiles, sites, armies, selection,
//      clouds, smoke, night tint + window lights, rain/snow, labels, frame.
// =====================================================================
'use strict';
(() => {
  const INK = '#3b2a1a';
  const PAPER = '#ead9b2';
  const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
  const P = 80;            // offscreen pixels per tile
  const M = 1.1;           // margin (in tiles) around the map for the border
  const ZMIN = 0.6, ZMAX = 3;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // prefers-reduced-motion: freeze decorative animation (clouds, pennants, smoke, rain/snow) and snap camera moves
  const RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduceMotion = !!(RM && RM.matches);
  if (RM) { const onRM = () => { reduceMotion = RM.matches; }; if (RM.addEventListener) RM.addEventListener('change', onRM); else if (RM.addListener) RM.addListener(onRM); }
  const RM_T = 12000;      // fixed clock (ms) used for drawing while motion is reduced
  const rng = seed => {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const colorOf = owner => (S.empires[owner] && S.empires[owner].color) || '#6b6b6b';

  // seasonal palettes (watercolour tints + glyph colours)
  const PAL = [
    { plains: '#d9d08c', fertile: '#a6cf6c', forest: '#79ad5c', hills: '#cdb98f', mountain: '#aaa59c', lake: '#86b5d8',
      crown: ['#86b95c', '#78ad52', '#93c266'], pine: '#4f7f45', tuft: 'rgba(64,92,34,.8)', hill: '#e6d9b2', flowers: ['#f0d34a', '#e88aa0', '#f7f2e2'], cap: 0.5 },
    { plains: '#e2cb7a', fertile: '#bcc65c', forest: '#5f9145', hills: '#d0b182', mountain: '#aba291', lake: '#7aaed6',
      crown: ['#5f9645', '#6a9e48', '#557f3c'], pine: '#3f6e3a', tuft: 'rgba(100,96,30,.8)', hill: '#e8d4a4', flowers: ['#e9c33e'], cap: 0 },
    { plains: '#dcb873', fertile: '#cfa652', forest: '#c47a3c', hills: '#c29c78', mountain: '#a29a90', lake: '#7ba6c8',
      crown: ['#d4843a', '#c4612f', '#e0aa42', '#a8792f', '#b84a2a'], pine: '#46683c', tuft: 'rgba(125,80,30,.8)', hill: '#e2c99e', flowers: [], cap: 0.45 },
    { plains: '#ebe9e2', fertile: '#e4e4da', forest: '#a3b0a2', hills: '#e2ded4', mountain: '#d7d9de', lake: '#b4cfe2',
      crown: null, pine: '#3d5e45', tuft: 'rgba(95,105,115,.6)', hill: '#f5f3ee', flowers: [], cap: 1 },
  ];

  // ------------------------------------------------------------------
  // module state (survives the per-second innerHTML rebuild)
  // ------------------------------------------------------------------
  const cam = { x: 15.5, y: 15.5, z: 2.2, tx: null, ty: null, tz: null, init: false };
  let canvas = null, ctx = null, tip = null;
  let W = 0, H = 640, DPR = 1, raf = 0;
  let layer = null, layerKey = '', lastBake = -1e9, lastCheck = -1e9;
  let noiseC = null, washC = null, terrC = null, dimGrey = null, dimWash = null;
  let glowC = null, cloudC = null, compassC = null, compassSz = 0, vignette = null;
  let vis = null, lastFrame = 0;
  let lastCityId = null, lastSelKey = null;
  let hover = null;               // {x, y} tile under the cursor
  const stats = { frames: [], bakeMs: 0, bakes: 0 };
  const parts = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.8, ph: Math.random() * TAU }));
  const clouds = (() => { const r = rng(9001); return Array.from({ length: 6 }, () => ({ x0: r() * 40, y: r() * 31, sp: 0.05 + r() * 0.07, sc: 4 + r() * 4, a: 0.08 + r() * 0.06 })); })();

  // ------------------------------------------------------------------
  // shared drawing helpers
  // ------------------------------------------------------------------
  function smoothClosed(path, pts) {
    const n = pts.length;
    const mx = (a, b) => (a[0] + b[0]) / 2, my = (a, b) => (a[1] + b[1]) / 2;
    path.moveTo(mx(pts[n - 1], pts[0]), my(pts[n - 1], pts[0]));
    for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; path.quadraticCurveTo(a[0], a[1], mx(a, b), my(a, b)); }
    path.closePath();
  }
  function blob(path, cx, cy, R, radFn, n, r, jit, scale = 1) {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU;
      const rr = R * (radFn ? radFn(a) : 1) * (1 + (r() - 0.5) * jit) * scale;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    smoothClosed(path, pts);
  }
  function noise() {
    if (noiseC) return noiseC;
    noiseC = mk(256, 256);
    const g = noiseC.getContext('2d'), id = g.createImageData(256, 256), r = rng(31337);
    for (let i = 0; i < id.data.length; i += 4) { const v = r(); id.data[i] = 96; id.data[i + 1] = 64; id.data[i + 2] = 30; id.data[i + 3] = v * v * v * 46; }
    g.putImageData(id, 0, 0);
    return noiseC;
  }

  // ------------------------------------------------------------------
  // terrain layer (baked)
  // ------------------------------------------------------------------
  function bake() {
    const t0 = performance.now();
    const N = S.map, L = Math.round((N + 2 * M) * P);
    if (!layer || layer.width !== L) layer = mk(L, L);
    const g = layer.getContext('2d');
    const X = v => (v + M) * P;
    const pal = PAL[G.season(S).index];
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = PAPER; g.fillRect(0, 0, L, L);
    const np = g.createPattern(noise(), 'repeat');
    g.fillStyle = np; g.fillRect(0, 0, L, L);
    paintWash(g, N, pal, X);
    paintLakes(g, N, X);
    paintRivers(g, N, X);
    paintRoads(g, X);
    paintGlyphs(g, N, X, pal);
    paintTerritory(g, L, X);
    paintFog(g, N, L, X, np);
    paintBorder(g, N, X);
    paintAge(g, L);
    stats.bakeMs = performance.now() - t0; stats.bakes++;
  }

  function paintWash(g, N, pal, X) {
    const Q = 20, WL = N * Q;
    if (!washC || washC.width !== WL) washC = mk(WL, WL);
    const w = washC.getContext('2d');
    w.setTransform(1, 0, 0, 1, 0, 0); w.globalAlpha = 1; w.clearRect(0, 0, WL, WL);
    const sc = mk(N, N), s = sc.getContext('2d');
    for (const t of S.tiles) if (S.explored[t.y * N + t.x]) { s.fillStyle = pal[t.terrain] || pal.plains; s.fillRect(t.x, t.y, 1, 1); }
    w.imageSmoothingEnabled = true; w.globalAlpha = 0.8; w.drawImage(sc, 0, 0, WL, WL);
    for (const t of S.tiles) {
      const i = t.y * N + t.x;
      if (!S.explored[i]) continue;
      const r = rng(i * 131 + 7), p = new Path2D();
      blob(p, (t.x + 0.5) * Q + (r() - 0.5) * Q * 0.3, (t.y + 0.5) * Q + (r() - 0.5) * Q * 0.3, Q * 0.62, null, 9, r, 0.45);
      w.globalAlpha = 0.45 + r() * 0.25; w.fillStyle = pal[t.terrain] || pal.plains; w.fill(p);
      if (r() < 0.35) { // granulation: a darker pigment pool
        const q = new Path2D(); blob(q, (t.x + r()) * Q, (t.y + r()) * Q, Q * (0.15 + r() * 0.2), null, 7, r, 0.5);
        w.globalAlpha = 0.18; w.fillStyle = '#6b5030'; w.fill(q);
      }
    }
    g.save(); g.globalAlpha = 0.6; g.globalCompositeOperation = 'multiply';
    g.drawImage(washC, X(0), X(0), N * P, N * P);
    g.restore();
  }

  const isLake = (x, y) => { const N = S.map; return x >= 0 && y >= 0 && x < N && y < N && S.tiles[y * N + x].terrain === 'lake'; };
  const DIRS8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  function lakeRadFn(x, y) {
    const rad = DIRS8.map(([dx, dy], k) => isLake(x + dx, y + dy) ? (k % 2 ? 1.1 : 0.8) : 0.44);
    return a => {
      const f = (((a % TAU) + TAU) % TAU) / (Math.PI / 4), k = Math.floor(f) % 8, u = f - Math.floor(f);
      const s = (1 - Math.cos(u * Math.PI)) / 2;
      return rad[k] * (1 - s) + rad[(k + 1) % 8] * s;
    };
  }
  function paintLakes(g, N, X) {
    const path = new Path2D(); let any = false;
    const lakes = S.tiles.filter(t => t.terrain === 'lake');
    for (const t of lakes) { blob(path, X(t.x + 0.5), X(t.y + 0.5), P, lakeRadFn(t.x, t.y), 28, rng((t.y * N + t.x) * 977 + 3), 0.14); any = true; }
    if (!any) return;
    g.save(); g.lineJoin = 'round';
    for (const [w, a] of [[0.46, 0.08], [0.32, 0.1], [0.18, 0.14]]) { g.strokeStyle = `rgba(60,105,150,${a})`; g.lineWidth = P * w; g.stroke(path); }
    g.strokeStyle = INK; g.lineWidth = P * 0.055; g.stroke(path);
    g.fillStyle = '#a9c8d8'; g.fill(path);
    g.save(); g.clip(path); g.strokeStyle = 'rgba(50,90,130,.13)'; g.lineWidth = P * 0.012; g.beginPath();
    for (let yy = 0; yy < X(N + 1); yy += P * 0.085) { g.moveTo(0, yy); g.lineTo(X(N + 1), yy); }
    g.stroke(); g.restore();
    // ripple lines
    g.strokeStyle = 'rgba(40,70,105,0.5)'; g.lineWidth = P * 0.016; g.lineCap = 'round';
    g.beginPath();
    for (const t of lakes) {
      const r = rng((t.y * N + t.x) * 41 + 5), n = 1 + (r() < 0.6 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const l = P * (0.16 + r() * 0.12), x0 = X(t.x + 0.5) + (r() - 0.5) * P * 0.35 - l / 2, y0 = X(t.y + 0.5) + (r() - 0.5) * P * 0.35, h = P * 0.035;
        g.moveTo(x0, y0); g.quadraticCurveTo(x0 + l / 4, y0 - h, x0 + l / 2, y0); g.quadraticCurveTo(x0 + 3 * l / 4, y0 + h, x0 + l, y0);
      }
    }
    g.stroke();
    g.restore();
  }

  function paintRivers(g, N, X) {
    const rivers = S.rivers || [];
    const jit = i => { const r = rng(i * 313 + 11); return [(r() - 0.5) * 0.34, (r() - 0.5) * 0.34]; };
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const riv of rivers) {
      if (!riv || riv.length < 2) continue;
      const pts = riv.map(i => { const t = S.tiles[i], j = t.terrain === 'lake' ? [0, 0] : jit(i); return { x: X(t.x + 0.5 + j[0]), y: X(t.y + 0.5 + j[1]), lake: t.terrain === 'lake' }; });
      const last = S.tiles[riv[riv.length - 1]];
      if (!pts[pts.length - 1].lake) {
        const dx = last.x === 0 ? -1 : last.x === N - 1 ? 1 : 0, dy = last.y === 0 ? -1 : last.y === N - 1 ? 1 : 0;
        if (dx || dy) { const p = pts[pts.length - 1]; pts.push({ x: p.x + dx * P * 0.75, y: p.y + dy * P * 0.75 }); }
      }
      const n = pts.length, mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      for (const pass of [{ col: 'rgba(110,160,205,0.32)', k: 2.8 }, { col: '#3d6a90', k: 1 }]) {
        g.strokeStyle = pass.col;
        for (let i = 0; i < n - 1; i++) {
          const a = i === 0 ? pts[0] : mid(pts[i - 1], pts[i]), c = pts[i], b = mid(pts[i], pts[i + 1]);
          g.lineWidth = P * (0.022 + 0.07 * (i / (n - 1))) * pass.k;
          g.beginPath(); g.moveTo(a.x, a.y); g.quadraticCurveTo(c.x, c.y, b.x, b.y); g.stroke();
        }
        if (!pts[n - 1].lake) {
          const a = mid(pts[n - 2], pts[n - 1]);
          g.lineWidth = P * 0.092 * pass.k; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(pts[n - 1].x, pts[n - 1].y); g.stroke();
        }
      }
    }
    g.restore();
  }

  function citiesByOwner() {
    const by = {};
    for (const c of Object.values(S.cities)) (by[c.owner] = by[c.owner] || []).push(c);
    return by;
  }
  function paintRoads(g, X) {
    g.save(); g.lineCap = 'round';
    for (const cs of Object.values(citiesByOwner())) {
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 8) continue;
        const r = rng(hash(a.id + '~' + b.id));
        const ax = X(a.x + 0.5), ay = X(a.y + 0.5), bx = X(b.x + 0.5), by = X(b.y + 0.5), len = Math.hypot(bx - ax, by - ay);
        const off = (r() - 0.5) * 0.4 * len, cx = (ax + bx) / 2 - (by - ay) / len * off, cy = (ay + by) / 2 + (bx - ax) / len * off;
        const curve = () => { g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx, cy, bx, by); g.stroke(); };
        g.setLineDash([]); g.strokeStyle = 'rgba(150,110,60,0.22)'; g.lineWidth = P * 0.13; curve();
        g.setLineDash([P * 0.13, P * 0.09]); g.strokeStyle = 'rgba(85,55,28,0.85)'; g.lineWidth = P * 0.04; curve();
      }
    }
    g.restore();
  }

  // --- ink glyphs ----------------------------------------------------
  function paintGlyphs(g, N, X, pal) {
    const winter = pal.cap === 1;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, t = S.tiles[i];
      if (!S.explored[i] || t.terrain === 'lake') continue;
      const r = rng(i * 7919 + 101), cx = X(x + 0.5), cy = X(y + 0.5);
      if (t.city || t.camp || t.oasis || t.ruin) { stipple(g, cx, cy, r, 4, 'rgba(70,50,30,.35)'); continue; } // keep sites clear
      switch (t.terrain) {
        case 'plains': stipple(g, cx, cy, r, 6, 'rgba(80,60,30,.4)'); if (r() < 0.4) tuft(g, cx + (r() - 0.5) * P * 0.5, cy + (r() - 0.5) * P * 0.5, r, pal.tuft, 0.8); break;
        case 'fertile': fertile(g, cx, cy, r, pal); break;
        case 'forest': forest(g, cx, cy, r, pal, winter); break;
        case 'hills': hills(g, cx, cy, r, pal); break;
        case 'mountain': mountain(g, cx, cy, r, pal); break;
      }
    }
    g.restore();
  }
  function stipple(g, cx, cy, r, n, col) {
    g.fillStyle = col;
    g.beginPath();
    for (let k = 0; k < n; k++) { const x = cx + (r() - 0.5) * P * 0.85, y = cy + (r() - 0.5) * P * 0.85; g.moveTo(x + 1.3, y); g.arc(x, y, P * 0.012 + r() * 0.8, 0, TAU); }
    g.fill();
  }
  function tuft(g, x, y, r, col, s = 1) {
    const u = P / 80 * s;
    g.strokeStyle = col; g.lineWidth = 1.2 * P / 80;
    g.beginPath();
    g.moveTo(x - 1 * u, y); g.quadraticCurveTo(x - 3 * u, y - 4 * u, x - 5 * u, y - 6 * u);
    g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2 * u, y - 8 * u);
    g.moveTo(x + 1 * u, y); g.quadraticCurveTo(x + 3 * u, y - 4 * u, x + 5 * u, y - 6 * u);
    g.stroke();
  }
  function fertile(g, cx, cy, r, pal) {
    stipple(g, cx, cy, r, 9, 'rgba(70,80,30,.38)');
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) tuft(g, cx + (r() - 0.5) * P * 0.7, cy + (r() - 0.5) * P * 0.7, r, pal.tuft, 0.9 + r() * 0.4);
    if (r() < 0.3) { // a little ploughed field
      const fx = cx + (r() - 0.5) * P * 0.3, fy = cy + (r() - 0.5) * P * 0.3, w = P * 0.28, h = P * 0.16;
      g.save(); g.translate(fx, fy); g.transform(1, 0, -0.35, 1, 0, 0);
      g.strokeStyle = 'rgba(90,65,30,.55)'; g.lineWidth = P * 0.012;
      g.strokeRect(-w / 2, -h / 2, w, h);
      g.beginPath(); for (let k = 1; k < 4; k++) { g.moveTo(-w / 2, -h / 2 + h * k / 4); g.lineTo(w / 2, -h / 2 + h * k / 4); } g.stroke();
      g.restore();
    }
    for (const col of pal.flowers) { if (r() < 0.5) continue; g.fillStyle = col; g.beginPath(); for (let k = 0; k < 3; k++) { const x = cx + (r() - 0.5) * P * 0.7, y = cy + (r() - 0.5) * P * 0.7; g.moveTo(x + 2, y); g.arc(x, y, P * 0.02, 0, TAU); } g.fill(); }
  }
  function forest(g, cx, cy, r, pal, winter) {
    const n = 5 + Math.floor(r() * 3), trees = [];
    for (let k = 0; k < n; k++) trees.push({ x: cx + (r() - 0.5) * P * 0.78, y: cy + (r() - 0.5) * P * 0.7 + P * 0.1, pine: winter ? r() < 0.75 : r() < 0.3, s: 1.05 + r() * 0.5 });
    trees.sort((a, b) => a.y - b.y);
    const u = P / 80;
    for (const tr of trees) {
      const s = tr.s * u, x = tr.x, y = tr.y;
      g.fillStyle = 'rgba(60,40,20,.16)'; g.beginPath(); g.ellipse(x + 2 * s, y, 7 * s, 2.2 * s, 0, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.25 * u;
      if (tr.pine) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 4 * s); g.stroke();
        g.beginPath();
        g.moveTo(x - 7 * s, y - 4 * s); g.lineTo(x - 2.5 * s, y - 11 * s); g.lineTo(x - 5 * s, y - 11 * s); g.lineTo(x, y - 22 * s);
        g.lineTo(x + 5 * s, y - 11 * s); g.lineTo(x + 2.5 * s, y - 11 * s); g.lineTo(x + 7 * s, y - 4 * s); g.closePath();
        g.fillStyle = pal.pine; g.fill(); g.stroke();
        if (winter) { g.fillStyle = '#fbfbf8'; g.beginPath(); g.moveTo(x, y - 22 * s); g.lineTo(x - 3.2 * s, y - 15 * s); g.lineTo(x + 0.5 * s, y - 16 * s); g.lineTo(x + 3.2 * s, y - 15 * s); g.closePath(); g.fill(); g.stroke(); }
        else { g.strokeStyle = 'rgba(30,40,20,.5)'; g.beginPath(); g.moveTo(x + 1.5 * s, y - 6 * s); g.lineTo(x + 5 * s, y - 5 * s); g.moveTo(x + 1.5 * s, y - 13 * s); g.lineTo(x + 3.5 * s, y - 12 * s); g.stroke(); }
      } else if (!pal.crown) { // winter: bare deciduous tree
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 14 * s);
        g.moveTo(x, y - 8 * s); g.lineTo(x - 5 * s, y - 14 * s); g.moveTo(x, y - 10 * s); g.lineTo(x + 5 * s, y - 16 * s);
        g.moveTo(x, y - 13 * s); g.lineTo(x - 2 * s, y - 18 * s); g.stroke();
      } else {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 7 * s); g.stroke();
        const cr = 7.5 * s, ccx = x, ccy = y - 13 * s, crown = new Path2D(), pts = [], m = 7;
        for (let k = 0; k < m; k++) { const a = k / m * TAU - Math.PI / 2, rr = cr * (0.9 + r() * 0.25); pts.push([ccx + Math.cos(a) * rr, ccy + Math.sin(a) * rr * 0.92]); }
        // scalloped crown: bulge outward between points
        crown.moveTo(pts[0][0], pts[0][1]);
        for (let k = 0; k < m; k++) {
          const a = pts[k], b = pts[(k + 1) % m], mxp = (a[0] + b[0]) / 2, myp = (a[1] + b[1]) / 2;
          crown.quadraticCurveTo(mxp + (mxp - ccx) * 0.45, myp + (myp - ccy) * 0.45, b[0], b[1]);
        }
        crown.closePath();
        g.fillStyle = pal.crown[Math.floor(r() * pal.crown.length)]; g.fill(crown);
        g.save(); g.clip(crown); g.fillStyle = 'rgba(40,40,20,.22)'; g.beginPath(); g.arc(ccx + cr * 0.55, ccy + cr * 0.35, cr, 0, TAU); g.fill(); g.restore();
        g.stroke(crown);
      }
    }
  }
  function hills(g, cx, cy, r, pal) {
    const n = r() < 0.55 ? 2 : 1, u = P / 80;
    const hs = [];
    for (let k = 0; k < n; k++) hs.push({ x: cx + (n === 1 ? (r() - 0.5) * 8 * u : (k ? 9 : -10) * u + (r() - 0.5) * 6 * u), y: cy + (n === 1 ? 8 * u : (k ? 14 : 2) * u), w: (34 + r() * 12) * u, h: (15 + r() * 7) * u });
    for (const h of hs) {
      const p = new Path2D();
      p.moveTo(h.x - h.w / 2, h.y); p.bezierCurveTo(h.x - h.w * 0.3, h.y - h.h * 1.3, h.x + h.w * 0.25, h.y - h.h * 1.35, h.x + h.w / 2, h.y);
      g.fillStyle = pal.hill; g.fill(p);
      g.strokeStyle = INK; g.lineWidth = 1.5 * u; g.stroke(p);
      // shading hatch on the lee slope
      g.strokeStyle = 'rgba(59,42,26,.6)'; g.lineWidth = 1 * u; g.beginPath();
      for (let k = 0; k < 4; k++) { const f = 0.55 + k * 0.1, sx = h.x + h.w * (f - 0.5), sy = h.y - h.h * (1 - Math.pow((f - 0.5) * 2, 2)) * 0.95; g.moveTo(sx, sy + 1.5 * u); g.lineTo(sx + 2 * u, sy + h.h * 0.45); }
      g.stroke();
      g.beginPath(); g.moveTo(h.x - h.w / 2 - 3 * u, h.y); g.lineTo(h.x - h.w / 2 + 2 * u, h.y); g.moveTo(h.x + h.w / 2 - 2 * u, h.y); g.lineTo(h.x + h.w / 2 + 4 * u, h.y); g.stroke();
    }
  }
  function mountain(g, cx, cy, r, pal) {
    const u = P / 80, peaks = [];
    if (r() < 0.55) peaks.push({ x: cx - 16 * u + r() * 4 * u, y: cy + 6 * u, w: 32 * u, h: (24 + r() * 8) * u });
    if (r() < 0.45) peaks.push({ x: cx + 17 * u + r() * 4 * u, y: cy + 9 * u, w: 28 * u, h: (20 + r() * 8) * u });
    peaks.push({ x: cx + (r() - 0.4) * 8 * u, y: cy + 20 * u, w: (46 + r() * 10) * u, h: (40 + r() * 12) * u });
    for (const pk of peaks) {
      const ax = pk.x + (r() - 0.5) * 6 * u, ay = pk.y - pk.h, lx = pk.x - pk.w / 2, rx = pk.x + pk.w / 2, by = pk.y;
      const mxb = pk.x + pk.w * 0.1;
      // light face
      const left = new Path2D(); left.moveTo(ax, ay); left.lineTo(ax - pk.w * 0.18, ay + pk.h * 0.35); left.lineTo(ax - pk.w * 0.26, ay + pk.h * 0.5); left.lineTo(lx, by); left.lineTo(mxb, by);
      left.lineTo(ax + pk.w * 0.05, ay + pk.h * 0.6); left.lineTo(ax - pk.w * 0.02, ay + pk.h * 0.3); left.closePath();
      const right = new Path2D(); right.moveTo(ax, ay); right.lineTo(ax - pk.w * 0.02, ay + pk.h * 0.3); right.lineTo(ax + pk.w * 0.05, ay + pk.h * 0.6); right.lineTo(mxb, by); right.lineTo(rx, by);
      right.lineTo(ax + pk.w * 0.24, ay + pk.h * 0.42); right.closePath();
      g.fillStyle = 'rgba(248,240,222,.55)'; g.fill(left);
      g.fillStyle = pal.cap === 1 ? 'rgba(150,160,175,.45)' : 'rgba(120,98,70,.38)'; g.fill(right);
      g.save(); g.clip(right); g.strokeStyle = 'rgba(59,42,26,.55)'; g.lineWidth = 1 * u; g.beginPath();
      for (let k = -pk.h; k < pk.w; k += 3.2 * u) { g.moveTo(ax + k, ay); g.lineTo(ax + k - pk.h * 0.6, by); }
      g.stroke(); g.restore();
      if (pal.cap > 0 && pk.h > 30 * u * (pal.cap === 1 ? 0 : 1)) {
        const f = 0.32 * (pal.cap === 1 ? 1 : 0.7), cap = new Path2D();
        cap.moveTo(ax, ay); cap.lineTo(ax - pk.w * 0.18 * f / 0.35, ay + pk.h * f);
        cap.lineTo(ax - pk.w * 0.06, ay + pk.h * f * 0.7); cap.lineTo(ax, ay + pk.h * f * 1.05); cap.lineTo(ax + pk.w * 0.08, ay + pk.h * f * 0.75);
        cap.lineTo(ax + pk.w * 0.24 * f / 0.42, ay + pk.h * f); cap.closePath();
        g.fillStyle = '#fbfbf9'; g.fill(cap); g.strokeStyle = 'rgba(59,42,26,.6)'; g.lineWidth = 0.9 * u; g.stroke(cap);
      }
      g.strokeStyle = INK; g.lineWidth = 1.7 * u;
      g.beginPath(); g.moveTo(lx, by); g.lineTo(ax - pk.w * 0.26, ay + pk.h * 0.5); g.lineTo(ax - pk.w * 0.18, ay + pk.h * 0.35); g.lineTo(ax, ay);
      g.lineTo(ax + pk.w * 0.24, ay + pk.h * 0.42); g.lineTo(rx, by); g.stroke();
      g.lineWidth = 1 * u; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax - pk.w * 0.02, ay + pk.h * 0.3); g.lineTo(ax + pk.w * 0.05, ay + pk.h * 0.6); g.lineTo(mxb, by); g.stroke();
      g.beginPath(); g.moveTo(lx - 4 * u, by); g.lineTo(rx + 4 * u, by); g.strokeStyle = 'rgba(59,42,26,.35)'; g.stroke();
    }
  }

  function paintTerritory(g, L, X) {
    const Q = P / 2, TL = Math.round(L / 2);
    if (!terrC || terrC.width !== TL) terrC = mk(TL, TL);
    const t = terrC.getContext('2d');
    const XQ = v => (v + M) * Q;
    const rOf = c => (G.cityReach ? G.cityReach(S, c) : 2.5);
    for (const [owner, cs] of Object.entries(citiesByOwner())) {
      const col = colorOf(owner);
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, TL, TL);
      const mkPath = inner => { const p = new Path2D(); for (const c of cs) { const R = rOf(c); blob(p, XQ(c.x + 0.5), XQ(c.y + 0.5), R * Q, null, 40, rng(hash(c.id)), 0.07, inner ? (R - 0.24) / R : 1); } return p; };
      const full = mkPath(false), inner = mkPath(true);
      t.lineJoin = 'round'; t.lineCap = 'round'; t.strokeStyle = col;
      t.globalAlpha = 0.26; t.lineWidth = Q * 0.4; t.stroke(full);
      t.globalAlpha = 0.95; t.setLineDash([Q * 0.02, Q * 0.13]); t.lineWidth = Q * 0.075; t.stroke(full); t.setLineDash([]);
      t.globalAlpha = 1; t.globalCompositeOperation = 'destination-out'; t.fill(inner);
      t.globalCompositeOperation = 'destination-over'; t.globalAlpha = 0.12; t.fillStyle = col; t.fill(full);
      g.drawImage(terrC, 0, 0, L, L);
    }
  }

  function paintFog(g, N, L, X, np) {
    const path = new Path2D(); let any = false;
    for (const t of S.tiles) {
      const i = t.y * N + t.x;
      if (S.explored[i]) continue;
      blob(path, X(t.x + 0.5), X(t.y + 0.5), P * 0.86, null, 18, rng(i * 53 + 29), 0.24); any = true;
    }
    if (!any) return;
    g.save();
    g.beginPath(); g.rect(X(0), X(0), N * P, N * P); g.clip();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(120,85,45,0.09)'; g.lineWidth = P * 0.75; g.stroke(path);
    g.strokeStyle = 'rgba(100,70,38,0.12)'; g.lineWidth = P * 0.36; g.stroke(path);
    g.strokeStyle = 'rgba(80,55,30,0.5)'; g.lineWidth = P * 0.035; g.stroke(path);
    g.fillStyle = PAPER; g.fill(path); g.fillStyle = np; g.fill(path);
    g.clip(path);
    g.lineWidth = P * 0.012;
    g.strokeStyle = 'rgba(90,62,35,0.10)'; g.beginPath();
    for (let d = -L; d < L; d += P * 0.19) { g.moveTo(d, 0); g.lineTo(d + L, L); }
    g.stroke();
    g.strokeStyle = 'rgba(90,62,35,0.06)'; g.beginPath();
    for (let d = 0; d < 2 * L; d += P * 0.19) { g.moveTo(d, 0); g.lineTo(d - L, L); }
    g.stroke();
    g.restore();
  }

  function paintBorder(g, N, X) {
    const a = X(0), b = X(N), o1 = P * 0.14, o2 = P * 0.44, span = b - a;
    g.save();
    g.fillStyle = 'rgba(59,42,26,0.85)';
    for (let k = 0; k < N; k += 2) {
      const s = X(k);
      g.fillRect(s, a - o2, P, o2 - o1); g.fillRect(s, b + o1, P, o2 - o1);
      g.fillRect(a - o2, s, o2 - o1, P); g.fillRect(b + o1, s, o2 - o1, P);
    }
    g.strokeStyle = INK;
    g.lineWidth = P * 0.02; g.strokeRect(a, a, span, span);
    g.lineWidth = P * 0.03; g.strokeRect(a - o1, a - o1, span + 2 * o1, span + 2 * o1); g.strokeRect(a - o2, a - o2, span + 2 * o2, span + 2 * o2);
    g.lineWidth = P * 0.07; g.strokeRect(a - o2 - P * 0.1, a - o2 - P * 0.1, span + 2 * o2 + P * 0.2, span + 2 * o2 + P * 0.2);
    // corner blocks
    for (const [cx, cy] of [[a, a], [b, a], [a, b], [b, b]]) {
      const sx = cx < b ? cx - o2 : cx + o1, sy = cy < b ? cy - o2 : cy + o1, w = o2 - o1;
      g.fillStyle = PAPER; g.fillRect(sx, sy, w, w); g.lineWidth = P * 0.02; g.strokeRect(sx, sy, w, w);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + w, sy + w); g.moveTo(sx + w, sy); g.lineTo(sx, sy + w); g.stroke();
    }
    g.fillStyle = INK; g.font = `italic ${Math.round(P * 0.24)}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k < N; k += 5) {
      g.fillText(String(k), X(k + 0.5), a - o2 - P * 0.36); g.fillText(String(k), X(k + 0.5), b + o2 + P * 0.36);
      g.fillText(String(k), a - o2 - P * 0.36, X(k + 0.5)); g.fillText(String(k), b + o2 + P * 0.36, X(k + 0.5));
    }
    g.restore();
  }

  function paintAge(g, L) {
    const r = rng(4242);
    g.save();
    for (let k = 0; k < 34; k++) {
      const x = r() * L, y = r() * L, rad = (0.04 + r() * 0.16) * L, dark = r() < 0.6;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, dark ? 'rgba(140,95,40,0.07)' : 'rgba(255,250,232,0.09)');
      gr.addColorStop(0.7, dark ? 'rgba(140,95,40,0.03)' : 'rgba(255,250,232,0.03)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // tea rings
    for (let k = 0; k < 2; k++) {
      const x = L * (0.2 + r() * 0.6), y = L * (0.2 + r() * 0.6), rad = P * (1.2 + r() * 0.6);
      g.strokeStyle = 'rgba(130,85,35,0.08)'; g.lineWidth = P * 0.08; g.beginPath(); g.arc(x, y, rad, r() * TAU, r() * TAU + 4.5); g.stroke();
      g.strokeStyle = 'rgba(130,85,35,0.06)'; g.lineWidth = P * 0.03; g.beginPath(); g.arc(x + 3, y + 2, rad * 0.97, 0, TAU); g.stroke();
    }
    // fibres
    g.strokeStyle = 'rgba(110,80,40,0.07)'; g.lineWidth = 1; g.beginPath();
    for (let k = 0; k < 600; k++) { const x = r() * L, y = r() * L, a = r() * TAU, l = 6 + r() * 20; g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.5) * l / 2, y + Math.sin(a + 0.5) * l / 2, x + Math.cos(a) * l, y + Math.sin(a) * l); }
    g.stroke();
    // darkened, worn paper edges
    for (const [x0, y0, x1, y1] of [[0, 0, 0, P * 0.9], [0, L, 0, L - P * 0.9], [0, 0, P * 0.9, 0], [L, 0, L - P * 0.9, 0]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(110,70,25,0.35)'); gr.addColorStop(1, 'rgba(110,70,25,0)');
      g.fillStyle = gr; g.fillRect(0, 0, L, L);
    }
    g.restore();
  }

  // ------------------------------------------------------------------
  // dimming of explored-but-not-visible tiles (tiny masks, smoothed when scaled)
  // ------------------------------------------------------------------
  function updateDim() {
    const N = S.map;
    if (!dimGrey || dimGrey.width !== N) { dimGrey = mk(N, N); dimWash = mk(N, N); }
    const gg = dimGrey.getContext('2d'), gw = dimWash.getContext('2d');
    const a = gg.createImageData(N, N), b = gw.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const on = S.explored[i] && !vis[i] ? 255 : 0, o = i * 4;
      a.data[o] = a.data[o + 1] = a.data[o + 2] = 128; a.data[o + 3] = on;
      b.data[o] = 236; b.data[o + 1] = 224; b.data[o + 2] = 198; b.data[o + 3] = on;
    }
    gg.putImageData(a, 0, 0); gw.putImageData(b, 0, 0);
  }

  // ------------------------------------------------------------------
  // site illustrations (drawn per frame, in a 100-unit tile space)
  // ------------------------------------------------------------------
  const TPL = {
    hamlet: [['hut', -14, 6, 1.15], ['hut', 13, 0, 1.05], ['hut', 1, 21, 1.1]],
    village: [['hut', -24, 2, 0.8], ['hall', 2, 6, 0.9], ['hut', 24, 10, 0.8], ['hut', -16, 22, 0.8], ['hut', 12, 26, 0.75], ['hut', -32, 16, 0.7]],
    town: [['house', -18, -2, 0.85], ['tower', 16, -2, 1], ['hall', -2, 12, 0.85], ['house', 22, 18, 0.8], ['house', -22, 20, 0.8], ['house', 4, 28, 0.75]],
    city: [['house', -28, -6, 0.8], ['spire', -8, -8, 1.25], ['house', 10, -10, 0.8], ['spire', 24, -2, 1.0], ['hall', 0, 10, 1], ['house', -28, 14, 0.8], ['house', 28, 18, 0.8], ['house', -12, 28, 0.75], ['house', 14, 30, 0.75]],
  };
  const WALLS = { hamlet: [28, 17, 12], village: [40, 24, 13], town: [40, 27, 12], city: [48, 32, 10] };

  function hut(c, x, y, s, roof, lw, lights) {
    c.lineWidth = lw; c.strokeStyle = INK;
    c.beginPath(); c.rect(x - 7 * s, y - 9 * s, 14 * s, 9 * s); c.fillStyle = '#efe3c4'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 10 * s, y - 8 * s); c.lineTo(x, y - 19 * s); c.lineTo(x + 10 * s, y - 8 * s); c.closePath(); c.fillStyle = roof; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 3 * s, y - 12 * s); c.lineTo(x + 3 * s, y - 12 * s); c.moveTo(x - 5 * s, y - 10 * s); c.lineTo(x + 5 * s, y - 10 * s); c.lineWidth = lw * 0.5; c.stroke();
    c.fillStyle = INK; c.fillRect(x - 1.6 * s, y - 5 * s, 3.2 * s, 5 * s);
    lights.push([x + 4 * s, y - 5 * s]);
    return [x, y - 19 * s];
  }
  function house(c, x, y, s, roof, lw, lights) {
    c.lineWidth = lw; c.strokeStyle = INK;
    c.beginPath(); c.rect(x - 9 * s, y - 13 * s, 18 * s, 13 * s); c.fillStyle = '#efe3c4'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 11 * s, y - 12 * s); c.lineTo(x - 6 * s, y - 21 * s); c.lineTo(x + 6 * s, y - 21 * s); c.lineTo(x + 11 * s, y - 12 * s); c.closePath(); c.fillStyle = roof; c.fill(); c.stroke();
    c.fillStyle = INK; c.fillRect(x - 6 * s, y - 9 * s, 3 * s, 3 * s); c.fillRect(x + 3 * s, y - 9 * s, 3 * s, 3 * s); c.fillRect(x - 1.5 * s, y - 5 * s, 3 * s, 5 * s);
    c.beginPath(); c.rect(x + 3 * s, y - 25 * s, 3 * s, 5 * s); c.fillStyle = '#c9b89a'; c.fill(); c.stroke();
    lights.push([x - 4.5 * s, y - 7.5 * s], [x + 4.5 * s, y - 7.5 * s]);
    return [x, y - 21 * s];
  }
  function hall(c, x, y, s, roof, lw, lights) {
    c.lineWidth = lw; c.strokeStyle = INK;
    c.beginPath(); c.rect(x - 15 * s, y - 14 * s, 30 * s, 14 * s); c.fillStyle = '#f0e6cc'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 18 * s, y - 13 * s); c.lineTo(x - 10 * s, y - 25 * s); c.lineTo(x + 10 * s, y - 25 * s); c.lineTo(x + 18 * s, y - 13 * s); c.closePath(); c.fillStyle = roof; c.fill(); c.stroke();
    c.beginPath(); c.rect(x - 3 * s, y - 32 * s, 6 * s, 7 * s); c.fillStyle = '#efe3c4'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 4.5 * s, y - 31 * s); c.lineTo(x, y - 37 * s); c.lineTo(x + 4.5 * s, y - 31 * s); c.closePath(); c.fillStyle = roof; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - 3.5 * s, y); c.lineTo(x - 3.5 * s, y - 6 * s); c.arc(x, y - 6 * s, 3.5 * s, Math.PI, 0); c.lineTo(x + 3.5 * s, y); c.fillStyle = INK; c.fill();
    c.fillRect(x - 11 * s, y - 10 * s, 3 * s, 4 * s); c.fillRect(x + 8 * s, y - 10 * s, 3 * s, 4 * s);
    lights.push([x - 9.5 * s, y - 8 * s], [x + 9.5 * s, y - 8 * s], [x, y - 3 * s]);
    return [x, y - 37 * s];
  }
  function tower(c, x, y, s, lw, lights, spire, roof) {
    c.lineWidth = lw; c.strokeStyle = INK;
    const w = 11 * s, h = spire ? 30 * s : 32 * s;
    c.beginPath(); c.rect(x - w / 2, y - h, w, h); c.fillStyle = '#ddd2b8'; c.fill(); c.stroke();
    c.strokeStyle = 'rgba(59,42,26,.5)'; c.lineWidth = lw * 0.6; c.beginPath();
    for (let k = 1; k < 4; k++) { c.moveTo(x + w / 2 - 1, y - h * k / 4); c.lineTo(x + w / 2 - 4 * s, y - h * k / 4); }
    c.stroke(); c.strokeStyle = INK; c.lineWidth = lw;
    c.fillStyle = INK; c.fillRect(x - 1 * s, y - h * 0.62, 2 * s, 5 * s);
    lights.push([x, y - h * 0.62 + 2.5 * s]);
    if (spire) {
      c.beginPath(); c.moveTo(x - w / 2 - 2 * s, y - h); c.lineTo(x, y - h - 26 * s); c.lineTo(x + w / 2 + 2 * s, y - h); c.closePath();
      c.fillStyle = roof === '#eef1f3' ? roof : '#5f6d84'; c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(x - 1.5 * s, y - h - 3 * s); c.lineTo(x - 0.5 * s, y - h - 20 * s); c.stroke(); c.strokeStyle = INK;
      return [x, y - h - 26 * s];
    }
    c.beginPath(); c.rect(x - w / 2 - 1.5 * s, y - h - 3 * s, w + 3 * s, 3 * s); c.fillStyle = '#ddd2b8'; c.fill(); c.stroke();
    for (let k = 0; k < 3; k++) { c.beginPath(); c.rect(x - w / 2 - 1.5 * s + k * (w + 3 * s - 3.4 * s) / 2, y - h - 6.5 * s, 3.4 * s, 3.5 * s); c.fill(); c.stroke(); }
    return [x, y - h - 6.5 * s];
  }
  function wallArc(c, kind, rx, ry, cy, back, lw, towers) {
    const a0 = back ? Math.PI : 0, a1 = back ? TAU : Math.PI;
    if (kind === 'stone') {
      c.beginPath(); c.ellipse(0, cy, rx, ry, 0, a0, a1);
      c.strokeStyle = INK; c.lineWidth = lw * 4.4; c.stroke();
      c.strokeStyle = '#ddd0b2'; c.lineWidth = lw * 2.6; c.stroke();
      c.fillStyle = INK; c.beginPath();
      for (let a = a0 + 0.1; a < a1; a += 0.2) { const ex = Math.cos(a) * rx, ey = cy + Math.sin(a) * ry; c.rect(ex - 1.3, ey - lw * 2.2 - 2.6, 2.6, 2.6); }
      c.fill();
      if (towers) for (const a of [0.2, 0.8, 1.25, 1.75].map(f => f * Math.PI)) {
        if ((a > Math.PI) !== back) continue;
        const ex = Math.cos(a) * rx, ey = cy + Math.sin(a) * ry;
        c.beginPath(); c.rect(ex - 4.5, ey - 13, 9, 13); c.fillStyle = '#d5c8aa'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
        c.beginPath(); c.moveTo(ex - 6, ey - 12); c.lineTo(ex, ey - 21); c.lineTo(ex + 6, ey - 12); c.closePath(); c.fillStyle = '#8a4b30'; c.fill(); c.stroke();
      }
    } else {
      c.beginPath(); c.ellipse(0, cy, rx, ry, 0, a0, a1); c.strokeStyle = 'rgba(59,42,26,.6)'; c.lineWidth = lw; c.stroke();
      c.strokeStyle = '#5a3e22'; c.lineWidth = lw * 1.4; c.beginPath();
      for (let a = a0 + 0.06; a < a1; a += 0.15) { const ex = Math.cos(a) * rx, ey = cy + Math.sin(a) * ry; c.moveTo(ex, ey); c.lineTo(ex, ey - 7); }
      c.stroke();
    }
  }
  function pennant(c, x, y, col, lw, t, seed) {
    const w = Math.sin(t * 3 + seed) * 2.2, w2 = Math.sin(t * 3 + seed + 1.2) * 2.2;
    c.strokeStyle = INK; c.lineWidth = lw; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 20); c.stroke();
    c.beginPath(); c.moveTo(x, y - 20); c.quadraticCurveTo(x + 9, y - 21 + w, x + 18, y - 18 + w2); c.lineTo(x + 12, y - 15.5 + w * 0.5); c.lineTo(x + 18, y - 12 + w2);
    c.quadraticCurveTo(x + 9, y - 13 + w, x, y - 12); c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = lw * 0.7; c.stroke();
  }
  function cityKind(c) { const th = G.lvl(c, 'townhall'); return th >= 10 ? 'city' : th >= 6 ? 'town' : th >= 3 ? 'village' : 'hamlet'; }
  function drawCity(c, city, lw, t, winter, lights) {
    const kind = cityKind(city), th = G.lvl(city, 'townhall'), wl = G.lvl(city, 'wall');
    const roofs = winter ? ['#eef1f3', '#e6eaee'] : ['#9c5a35', '#b0703c', '#8a4b30', '#a8643a'];
    let tpl = TPL[kind];
    if (kind === 'hamlet' && th < 2) tpl = tpl.slice(0, 2);
    if (kind === 'city' && th >= 15) tpl = [['spire', -30, 2, 0.9], ...tpl];
    const [rx, ry, cy] = WALLS[kind];
    const stone = kind === 'town' || kind === 'city';
    const walled = stone || wl > 0;
    const wkind = stone ? 'stone' : 'palisade';
    c.fillStyle = 'rgba(60,40,20,.16)'; c.beginPath(); c.ellipse(2, cy + 2, rx + 2, ry + 2, 0, 0, TAU); c.fill();
    if (walled) wallArc(c, wkind, rx, ry, cy, true, lw, wl > 0);
    let top = null;
    tpl.forEach(([type, x, y, s], k) => {
      const roof = roofs[k % roofs.length];
      let p;
      if (type === 'hut') p = hut(c, x, y, s, roof, lw, lights);
      else if (type === 'house') p = house(c, x, y, s, roof, lw, lights);
      else if (type === 'hall') p = hall(c, x, y, s, roof, lw, lights);
      else p = tower(c, x, y, s, lw, lights, type === 'spire', winter ? '#eef1f3' : null);
      if (!top || p[1] < top[1]) top = p;
    });
    if (walled) wallArc(c, wkind, rx, ry, cy, false, lw, wl > 0);
    pennant(c, top[0], top[1] + 1, colorOf(city.owner), lw, t, hash(city.id) % 7);
  }
  function tent(c, x, y, s, lw, winter) {
    c.lineWidth = lw; c.strokeStyle = INK;
    c.beginPath(); c.moveTo(x - 12 * s, y); c.lineTo(x, y - 17 * s); c.lineTo(x + 12 * s, y); c.closePath(); c.fillStyle = winter ? '#e9e6dc' : '#d8c39a'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x, y - 17 * s); c.lineTo(x - 4 * s, y); c.lineTo(x + 4 * s, y); c.closePath(); c.fillStyle = '#4a2418'; c.fill();
    c.beginPath(); c.moveTo(x, y - 17 * s); c.lineTo(x - 2 * s, y - 21 * s); c.moveTo(x, y - 17 * s); c.lineTo(x + 2 * s, y - 21 * s); c.stroke();
  }
  function drawCamp(c, camp, lw, t, winter, lights) {
    const tier = camp ? camp.tier : 1;
    if (tier >= 3) tent(c, -2, 0, 0.75, lw, winter);
    tent(c, -13, 12, 1, lw, winter); tent(c, 12, 16, 0.85, lw, winter);
    // campfire
    const f = 0.7 + Math.sin(t * 9) * 0.15 + Math.sin(t * 13.7) * 0.1;
    c.fillStyle = '#e07a2a'; c.beginPath(); c.moveTo(-3, 24); c.quadraticCurveTo(0, 24 - 9 * f, 3, 24); c.closePath(); c.fill();
    c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.beginPath(); c.moveTo(-4, 25); c.lineTo(4, 23); c.moveTo(-4, 23); c.lineTo(4, 25); c.stroke();
    lights.push([0, 21, 1.6]);
    // crossed swords
    c.save(); c.translate(0, -18);
    for (const sg of [-1, 1]) {
      c.save(); c.rotate(sg * 0.65);
      c.strokeStyle = INK; c.lineWidth = lw * 2.4; c.beginPath(); c.moveTo(0, 12); c.lineTo(0, -12); c.stroke();
      c.strokeStyle = '#c8ccd2'; c.lineWidth = lw * 1.1; c.beginPath(); c.moveTo(0, 6); c.lineTo(0, -11); c.stroke();
      c.strokeStyle = '#6b1f14'; c.lineWidth = lw * 1.6; c.beginPath(); c.moveTo(-4, 7); c.lineTo(4, 7); c.moveTo(0, 8); c.lineTo(0, 12); c.stroke();
      c.restore();
    }
    c.restore();
  }
  // wyrm lair, undead horde, fallen star (calamities.js)
  function drawMonster(c, camp, lw, t, lights) {
    c.strokeStyle = INK; c.lineWidth = lw;
    if (camp.kind === 'wyrm') {
      // cave mouth in a crag
      c.fillStyle = '#9a8f80'; c.beginPath(); c.moveTo(-30, 22); c.lineTo(-18, -8); c.lineTo(-4, -18); c.lineTo(12, -10); c.lineTo(30, 22); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#1e1612'; c.beginPath(); c.ellipse(0, 14, 9, 8, 0, Math.PI, 0); c.lineTo(9, 22); c.lineTo(-9, 22); c.closePath(); c.fill();
      // coiled wyrm with beating wings
      const fl = Math.sin(t * 3) * 0.35;
      c.fillStyle = '#7b1e18';
      for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(0, -20); c.quadraticCurveTo(sg * 26, -44 - fl * 18, sg * 36, -22 + fl * 10); c.quadraticCurveTo(sg * 22, -26, sg * 14, -16); c.closePath(); c.fill(); c.stroke(); }
      c.beginPath(); c.moveTo(-10, -12); c.quadraticCurveTo(-2, -30, 6, -26); c.quadraticCurveTo(14, -24, 12, -14); c.quadraticCurveTo(4, -6, -10, -12); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(6, -26); c.lineTo(16, -32); c.lineTo(10, -24); c.fill(); c.stroke();
      // fire breath flicker
      const f = 0.6 + 0.4 * Math.sin(t * 11);
      c.fillStyle = `rgba(240,140,40,${0.5 + f * 0.4})`; c.beginPath(); c.moveTo(16, -31); c.quadraticCurveTo(28, -36, 34 + f * 6, -30); c.quadraticCurveTo(26, -28, 16, -31); c.fill();
      lights.push([0, 16, 2]);
    } else if (camp.kind === 'undead') {
      for (const [x, y, h] of [[-16, 14, 16], [2, 18, 13], [16, 10, 18]]) {
        c.fillStyle = '#9b9a92'; c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x - 5, y - h + 5); c.arc(x, y - h + 5, 5, Math.PI, 0); c.lineTo(x + 5, y); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x - 2, y - h + 6); c.lineTo(x + 2, y - h + 6); c.moveTo(x, y - h + 3); c.lineTo(x, y - h + 10); c.stroke();
      }
      const g = 0.5 + 0.5 * Math.sin(t * 4);
      c.fillStyle = `rgba(110,220,140,${0.35 + g * 0.35})`;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-8 + i * 8, 24); c.quadraticCurveTo(-6 + i * 8, 10 - g * 6, -4 + i * 8, 24); c.fill(); }
      // skull
      c.fillStyle = '#eeeadc'; c.beginPath(); c.arc(0, -16, 9, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(-3.5, -17, 2.2, 0, TAU); c.arc(3.5, -17, 2.2, 0, TAU); c.fill();
      lights.push([0, 18, 1.4]);
    } else {
      // crater with a glowing star-shard
      c.fillStyle = '#6a5a48'; c.beginPath(); c.ellipse(0, 16, 30, 11, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#3a3026'; c.beginPath(); c.ellipse(0, 16, 18, 6, 0, 0, TAU); c.fill();
      const g = 0.6 + 0.4 * Math.sin(t * 2.5);
      c.fillStyle = `rgba(255,220,120,${0.25 * g})`; c.beginPath(); c.arc(0, 4, 22, 0, TAU); c.fill();
      c.fillStyle = '#f2d36b'; c.beginPath(); c.moveTo(0, -16); c.lineTo(6, 8); c.lineTo(0, 14); c.lineTo(-6, 8); c.closePath(); c.fill(); c.stroke();
      lights.push([0, 4, 2.2]);
    }
  }
  function palm(c, x, y, s, lw, lean) {
    c.strokeStyle = INK; c.lineWidth = lw * 2.2;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * 0.4, y - 16 * s, x + lean, y - 30 * s); c.stroke();
    c.strokeStyle = '#a07a48'; c.lineWidth = lw; c.stroke();
    const tx = x + lean, ty = y - 30 * s;
    for (const [a, l] of [[-2.7, 15], [-2.0, 13], [-1.2, 12], [-0.45, 14], [0.25, 15]]) {
      const ex = tx + Math.cos(a) * l * s, ey = ty + Math.sin(a) * l * s + 7 * s;
      const qx = tx + Math.cos(a) * l * 0.5 * s, qy = ty + Math.sin(a) * l * 0.5 * s - 3 * s;
      c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(qx, qy - 2 * s, ex, ey); c.quadraticCurveTo(qx, qy + 2 * s, tx, ty);
      c.fillStyle = '#5f8f3e'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw * 0.8; c.stroke();
    }
  }
  function drawOasis(c, o, lw, t) {
    if (o.owner && S.cities[o.owner]) {
      const col = colorOf(S.cities[o.owner].owner);
      c.save(); c.setLineDash([5, 4]); c.lineDashOffset = -t * 6; c.strokeStyle = col; c.lineWidth = lw * 2;
      c.beginPath(); c.ellipse(0, 8, 40, 30, 0, 0, TAU); c.stroke(); c.restore();
    }
    c.beginPath(); c.ellipse(4, 16, 24, 10, 0, 0, TAU); c.fillStyle = '#86b9d8'; c.fill(); c.strokeStyle = INK; c.lineWidth = lw; c.stroke();
    c.strokeStyle = 'rgba(40,70,105,.6)'; c.lineWidth = lw * 0.7; c.beginPath(); c.moveTo(-6, 16); c.quadraticCurveTo(0, 14, 6, 16); c.moveTo(6, 19); c.quadraticCurveTo(11, 17, 16, 19); c.stroke();
    palm(c, 14, 10, 0.75, lw, 6);
    palm(c, -12, 14, 1, lw, -7);
  }
  function drawRuin(c, ru, lw, t) {
    const ready = ru.readyAt <= S.time;
    c.globalAlpha = ready ? 1 : 0.45;
    c.fillStyle = 'rgba(60,40,20,.15)'; c.beginPath(); c.ellipse(0, 18, 30, 8, 0, 0, TAU); c.fill();
    c.lineWidth = lw; c.strokeStyle = INK;
    const col = (x, h, cut) => {
      c.beginPath(); c.moveTo(x - 4, 18); c.lineTo(x - 4, 18 - h); c.lineTo(x - 1, 18 - h - cut); c.lineTo(x + 1.5, 18 - h + 1); c.lineTo(x + 4, 18 - h - cut * 0.5); c.lineTo(x + 4, 18); c.closePath();
      c.fillStyle = '#e4dac4'; c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - 1.2, 16); c.lineTo(x - 1.2, 20 - h); c.moveTo(x + 1.5, 16); c.lineTo(x + 1.5, 20 - h); c.lineWidth = lw * 0.5; c.stroke(); c.lineWidth = lw;
      c.beginPath(); c.rect(x - 5.5, 16, 11, 3); c.fillStyle = '#d8ccb2'; c.fill(); c.stroke();
    };
    // two standing columns with a lintel, one broken stump, a fallen drum
    col(-16, 30, 0); col(-2, 30, 0);
    c.beginPath(); c.rect(-22, -15, 26, 5); c.fillStyle = '#e4dac4'; c.fill(); c.stroke();
    col(14, 14, 4);
    c.beginPath(); c.ellipse(20, 22, 6, 3.5, 0.2, 0, TAU); c.fillStyle = '#d8ccb2'; c.fill(); c.stroke();
    c.beginPath(); c.rect(4, 17, 9, 5); c.fill(); c.stroke();
    if (ready) { // faint glint of treasure
      const a = 0.5 + 0.5 * Math.sin(t * 2.5);
      c.strokeStyle = `rgba(214,170,60,${0.4 + a * 0.5})`; c.lineWidth = lw * 1.2;
      c.beginPath(); c.moveTo(-9, -22 - a * 3); c.lineTo(-9, -30 - a * 3); c.moveTo(-13, -26 - a * 3); c.lineTo(-5, -26 - a * 3); c.stroke();
    }
    c.globalAlpha = 1;
  }

  // --- army glyphs ---------------------------------------------------
  function drawBanner(c, col, lw, t, dir, seed) {
    const bob = Math.sin(t * 6 + seed) * 1.2;
    c.fillStyle = 'rgba(40,25,10,.25)'; c.beginPath(); c.ellipse(0, 2, 9, 3, 0, 0, TAU); c.fill();
    // arrowhead pointing where it marches
    c.save(); c.rotate(Math.atan2(dir[1], dir[0]));
    c.beginPath(); c.moveTo(16, 0); c.lineTo(8, -5); c.lineTo(10, 0); c.lineTo(8, 5); c.closePath(); c.fillStyle = INK; c.fill();
    c.restore();
    c.translate(0, bob);
    const w = Math.sin(t * 5 + seed) * 2.5;
    c.strokeStyle = INK; c.lineWidth = lw * 1.4; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -32); c.stroke();
    c.beginPath(); c.moveTo(0, -32); c.quadraticCurveTo(10, -33 + w, 20, -30 + w); c.lineTo(14, -25 + w * 0.5); c.lineTo(20, -20 + w); c.quadraticCurveTo(10, -21 + w, 0, -19); c.closePath();
    c.fillStyle = col; c.fill(); c.lineWidth = lw; c.stroke();
    c.beginPath(); c.arc(0, -33, 2, 0, TAU); c.fillStyle = '#c9a43c'; c.fill(); c.stroke();
  }
  function drawCart(c, col, lw, t, dir, settle) {
    const flip = dir[0] < 0 ? -1 : 1, bob = Math.abs(Math.sin(t * 7)) * 1;
    c.fillStyle = 'rgba(40,25,10,.25)'; c.beginPath(); c.ellipse(0, 3, 15, 3.5, 0, 0, TAU); c.fill();
    c.save(); c.scale(flip, 1); c.translate(0, -bob);
    c.strokeStyle = INK; c.lineWidth = lw;
    c.beginPath(); c.moveTo(12, -8); c.lineTo(22, -6); c.stroke();
    if (settle) { c.beginPath(); c.moveTo(-12, -11); c.bezierCurveTo(-12, -26, 12, -26, 12, -11); c.closePath(); c.fillStyle = '#f2ead6'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(-4, -11); c.quadraticCurveTo(-4, -22, 0, -22); c.moveTo(4, -11); c.quadraticCurveTo(4, -22, 0, -22); c.lineWidth = lw * 0.6; c.stroke(); c.lineWidth = lw; }
    else { c.fillStyle = '#c9a66b'; for (const [x, r] of [[-6, 4.5], [1, 5], [7, 4]]) { c.beginPath(); c.arc(x, -13, r, 0, TAU); c.fill(); c.stroke(); } }
    c.beginPath(); c.rect(-13, -12, 26, 7); c.fillStyle = '#9c6b3c'; c.fill(); c.stroke();
    for (const x of [-7, 7]) { c.beginPath(); c.arc(x, -3, 4.5, 0, TAU); c.fillStyle = '#e8dcc0'; c.fill(); c.stroke(); c.beginPath(); c.moveTo(x - 4.5, -3); c.lineTo(x + 4.5, -3); c.moveTo(x, -7.5); c.lineTo(x, 1.5); c.lineWidth = lw * 0.6; c.stroke(); c.lineWidth = lw; }
    c.fillStyle = col; c.beginPath(); c.moveTo(-12, -12); c.lineTo(-12, -30); c.lineTo(-3, -27); c.lineTo(-12, -24); c.fill(); c.beginPath(); c.moveTo(-12, -12); c.lineTo(-12, -30); c.stroke();
    c.restore();
  }
  function drawScout(c, col, lw, t, seed) {
    const f = Math.sin(t * 10 + seed) * 4;
    c.fillStyle = 'rgba(40,25,10,.2)'; c.beginPath(); c.ellipse(0, 6, 6, 2, 0, 0, TAU); c.fill();
    c.strokeStyle = INK; c.lineWidth = lw * 1.5; c.beginPath();
    c.moveTo(-14, -10 - f); c.quadraticCurveTo(-7, -18 - f * 0.4, 0, -10); c.quadraticCurveTo(7, -18 - f * 0.4, 14, -10 - f); c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(0, -9, 3, 0, TAU); c.fill(); c.lineWidth = lw * 0.7; c.stroke();
  }

  // ------------------------------------------------------------------
  // sprites
  // ------------------------------------------------------------------
  function glow() {
    if (glowC) return glowC;
    glowC = mk(64, 64); const g = glowC.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,236,170,1)'); gr.addColorStop(0.18, 'rgba(255,190,90,.9)'); gr.addColorStop(0.5, 'rgba(255,140,40,.25)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return glowC;
  }
  function cloud() {
    if (cloudC) return cloudC;
    cloudC = mk(256, 160); const g = cloudC.getContext('2d'), r = rng(555);
    for (let k = 0; k < 9; k++) {
      const x = 50 + r() * 156, y = 50 + r() * 60, rad = 30 + r() * 40, gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(30,35,60,.55)'); gr.addColorStop(1, 'rgba(30,35,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
    }
    return cloudC;
  }
  function compass(sz) {
    if (compassC && compassSz === sz) return compassC;
    compassSz = sz; compassC = mk(sz, sz);
    const g = compassC.getContext('2d'), R = sz * 0.36;
    g.translate(sz / 2, sz / 2 + sz * 0.04);
    g.fillStyle = 'rgba(236,222,186,.82)'; g.beginPath(); g.arc(0, 0, R * 1.05, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = sz * 0.008;
    g.beginPath(); g.arc(0, 0, R * 1.05, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, R * 0.93, 0, TAU); g.stroke();
    g.beginPath();
    for (let k = 0; k < 64; k++) { const a = k / 64 * TAU, r0 = k % 4 ? R * 0.97 : R * 0.93; g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05); }
    g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.45, 0, TAU); g.lineWidth = sz * 0.006; g.stroke();
    const point = (a, len, wid, dark) => {
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * len, sa * len); g.lineTo(px * wid, py * wid); g.closePath(); g.fillStyle = dark; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * len, sa * len); g.lineTo(-px * wid, -py * wid); g.closePath(); g.fillStyle = '#f3ead2'; g.fill(); g.stroke();
    };
    g.lineWidth = sz * 0.006; g.lineJoin = 'miter';
    for (let k = 0; k < 8; k++) point(Math.PI / 8 + k * Math.PI / 4, R * 0.55, R * 0.06, INK);
    for (let k = 0; k < 4; k++) point(Math.PI / 4 + k * Math.PI / 2, R * 0.72, R * 0.1, INK);
    for (let k = 0; k < 4; k++) point(-Math.PI / 2 + k * Math.PI / 2, R * 0.98, R * 0.13, k === 0 ? '#9b3b23' : INK);
    g.beginPath(); g.arc(0, 0, R * 0.06, 0, TAU); g.fillStyle = '#c9a43c'; g.fill(); g.stroke();
    g.fillStyle = INK; g.font = `bold ${Math.round(sz * 0.15)}px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('N', 0, -R * 1.1);
    return compassC;
  }

  // ------------------------------------------------------------------
  // camera
  // ------------------------------------------------------------------
  const base = () => Math.min(W, H) / (S.map + 2 * M);
  const tilePx = () => base() * cam.z;
  function clampCam() {
    if (!S) return;
    cam.z = clamp(cam.z, ZMIN, ZMAX);
    const N = S.map, tp = tilePx(), hw = W / 2 / tp, hh = H / 2 / tp, lo = -M, hi = N + M;
    cam.x = hi - lo <= 2 * hw ? N / 2 : clamp(cam.x, lo + hw, hi - hw);
    cam.y = hi - lo <= 2 * hh ? N / 2 : clamp(cam.y, lo + hh, hi - hh);
  }
  const toWorld = (px, py) => { const tp = tilePx(); return { x: cam.x + (px - W / 2) / tp, y: cam.y + (py - H / 2) / tp }; };
  function zoomAt(px, py, nz) {
    const w = toWorld(px, py);
    cam.z = clamp(nz, ZMIN, ZMAX);
    const tp = tilePx();
    cam.x = w.x - (px - W / 2) / tp; cam.y = w.y - (py - H / 2) / tp;
    cam.tx = cam.ty = cam.tz = null;
    clampCam();
  }
  function flyTo(x, y, z) { cam.tx = x + 0.5; cam.ty = y + 0.5; if (z) cam.tz = clamp(z, ZMIN, ZMAX); }
  function stepCam() {
    let moving = false;
    if (reduceMotion) {   // jump straight to the target instead of easing
      if (cam.tz != null) { cam.z = cam.tz; cam.tz = null; moving = true; }
      if (cam.tx != null) { cam.x = cam.tx; cam.y = cam.ty; cam.tx = cam.ty = null; moving = true; }
      if (moving) clampCam();
      return;
    }
    if (cam.tz != null) { cam.z += (cam.tz - cam.z) * 0.18; if (Math.abs(cam.tz - cam.z) < 0.003) { cam.z = cam.tz; cam.tz = null; } moving = true; }
    if (cam.tx != null) {
      cam.x += (cam.tx - cam.x) * 0.16; cam.y += (cam.ty - cam.y) * 0.16;
      if (Math.abs(cam.tx - cam.x) + Math.abs(cam.ty - cam.y) < 0.01) { cam.x = cam.tx; cam.y = cam.ty; cam.tx = cam.ty = null; }
      moving = true;
    }
    if (moving) {
      const px = cam.x, py = cam.y; clampCam();
      if (cam.tx != null && px === cam.x && py === cam.y) { /* still travelling */ } else if (cam.tx != null && Math.abs(px - cam.x) + Math.abs(py - cam.y) > 0) { cam.tx = cam.ty = null; }
    }
  }

  // ------------------------------------------------------------------
  // per-frame drawing
  // ------------------------------------------------------------------
  function tileName(t) {
    const i = t.y * S.map + t.x;
    const pos = ` (${t.x}, ${t.y})`;
    if (!S.explored[i]) return 'Unexplored lands' + pos;
    if (t.city && S.cities[t.city]) { const c = S.cities[t.city], e = S.empires[c.owner]; return `${c.name} · ${G.tier(c).name}${e ? ' of ' + e.name : ''}` + pos; }
    if (t.camp) { const cp = S.camps[t.camp]; if (cp && cp.kind) return ({ wyrm: "The Wyrm's lair", undead: 'Horde of the restless dead', star: 'Crater of a fallen star' }[cp.kind]) + pos; return `Brigand camp${cp ? ', tier ' + cp.tier : ''}` + pos; }
    if (t.oasis) { const o = t.oasis, oc = o.owner && S.cities[o.owner]; return `Oasis (+25% ${DATA.goods[o.bonus] ? DATA.goods[o.bonus].name : o.bonus})${oc ? ' · held by ' + oc.name : ''}` + pos; }
    if (t.ruin) return `Ruins, tier ${t.ruin.tier}${t.ruin.readyAt > S.time ? ' (plundered)' : ''}` + pos;
    return (DATA.terrain[t.terrain] ? DATA.terrain[t.terrain].name : t.terrain) + pos;
  }

  function draw(now) {
    const N = S.map, tp = tilePx(), t = now / 1000;
    const ox = W / 2 - cam.x * tp, oy = H / 2 - cam.y * tp;
    const SX = wx => ox + wx * tp, SY = wy => oy + wy * tp;
    const se = G.season(S).index, winter = se === 3;
    const c = ctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = '#2a211a'; c.fillRect(0, 0, W, H);
    const px0 = SX(-M), py0 = SY(-M), ps = (N + 2 * M) * tp;
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px0 - 2, py0 + 1, ps + 6, ps + 9); c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(px0 + 2, py0 + 4, ps + 2, ps + 4);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    // only blit the part of the layer that is on screen
    {
      const L = layer.width, k = L / ps;
      const sx0 = clamp((0 - px0) * k, 0, L), sy0 = clamp((0 - py0) * k, 0, L), sx1 = clamp((W - px0) * k, 0, L), sy1 = clamp((H - py0) * k, 0, L);
      if (sx1 > sx0 && sy1 > sy0) c.drawImage(layer, sx0, sy0, sx1 - sx0, sy1 - sy0, px0 + sx0 / k, py0 + sy0 / k, (sx1 - sx0) / k, (sy1 - sy0) / k);
    }
    // explored but out of sight: desaturate + paper wash
    c.globalCompositeOperation = 'saturation'; c.globalAlpha = 0.4; c.drawImage(dimGrey, SX(0), SY(0), N * tp, N * tp);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 0.22; c.drawImage(dimWash, SX(0), SY(0), N * tp, N * tp);
    c.globalAlpha = 1;

    // visible tile range
    const x0 = Math.max(0, Math.floor(-ox / tp) - 1), x1 = Math.min(N - 1, Math.ceil((W - ox) / tp) + 1);
    const y0 = Math.max(0, Math.floor(-oy / tp) - 1), y1 = Math.min(N - 1, Math.ceil((H - oy) / tp) + 1);
    const k = tp / 62, lw = Math.max(1.5, 0.9 / k);
    const lights = [], labels = [], smokes = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * N + x, tile = S.tiles[i];
      if (!S.explored[i] || !(tile.city || tile.camp || tile.oasis || tile.ruin)) continue;
      const cx = SX(x + 0.5), cy = SY(y + 0.5), lp = [];
      c.save(); c.translate(cx, cy); c.scale(k, k); c.lineCap = 'round'; c.lineJoin = 'round';
      if (tile.city && S.cities[tile.city]) {
        const city = S.cities[tile.city];
        drawCity(c, city, lw, t, winter, lp);
        const mine = city.owner === 'p';
        if (mine || cam.z >= 0.8 || tp >= 22) labels.push({ x: cx, y: cy + tp * 0.5, text: city.name, mine, cur: city.id === UI.city, sub: mine ? G.tier(city).name : (S.empires[city.owner] || {}).name });
        if (vis[i]) smokes.push([cx, cy, hash(city.id) % 100 / 100]);
      } else if (tile.camp) { const cp = S.camps[tile.camp]; if (cp && cp.kind) drawMonster(c, cp, lw, t, lp); else drawCamp(c, cp, lw, t, winter, lp); }
      else if (tile.oasis) drawOasis(c, tile.oasis, lw, t);
      else if (tile.ruin) drawRuin(c, tile.ruin, lw, t);
      c.restore();
      for (const l of lp) lights.push([cx + l[0] * k, cy + l[1] * k, l[2] || 1]);
    }

    // calamities: tinted, dashed regions with an emblem
    for (const q of (S.calamities || [])) {
      const def = DATA.calamities && DATA.calamities[q.kind];
      if (!def) continue;
      const fade = q.end > S.time ? Math.min(1, (S.time - q.start) / 20 + 0.2) : Math.max(0, 1 - (S.time - q.end) / 600);
      if (fade <= 0) continue;
      const qx = SX(q.x + 0.5), qy = SY(q.y + 0.5), rr = q.r * tp;
      if (qx + rr < 0 || qy + rr < 0 || qx - rr > W || qy - rr > H) continue;
      c.save(); c.globalAlpha = 0.16 * fade; c.fillStyle = def.color;
      c.beginPath();
      for (let a = 0; a <= TAU + 0.01; a += TAU / 48) { const wob = 1 + 0.05 * Math.sin(a * 5 + t * 0.6 + q.x) ; const px = qx + Math.cos(a) * rr * wob, py = qy + Math.sin(a) * rr * wob; a ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath(); c.fill();
      c.globalAlpha = 0.75 * fade; c.strokeStyle = def.color; c.lineWidth = Math.max(1.5, tp * 0.05); c.setLineDash([tp * 0.18, tp * 0.12]); c.lineDashOffset = -t * 8; c.stroke();
      c.setLineDash([]); c.globalAlpha = fade;
      const fs = Math.max(11, Math.min(18, tp * 0.36));
      c.font = `italic 600 ${fs}px "Iowan Old Style", Palatino, Georgia, serif`; c.textAlign = 'center';
      const ly = qy - rr * 0.78;
      c.lineWidth = 4; c.strokeStyle = 'rgba(244,234,210,.85)'; c.strokeText(def.name, qx, ly); c.fillStyle = def.color; c.fillText(def.name, qx, ly);
      if (q.end > S.time && def.bad && (q.kind === 'blight' || q.kind === 'swarm' || q.kind === 'flood' || q.kind === 'eruption')) {
        // drifting motes: spores, ash, rain or locusts
        c.fillStyle = def.color;
        for (let i = 0; i < 26; i++) {
          const a = i * 2.39996 + q.x, d = ((i * 0.37 + t * 0.05) % 1) * rr;
          const px = qx + Math.cos(a + t * 0.2) * d, py = qy + Math.sin(a + t * 0.2) * d - (q.kind === 'eruption' ? (t * 6 + i * 3) % 12 : 0);
          c.globalAlpha = 0.35 * fade; c.beginPath(); c.arc(px, py, Math.max(1, tp * 0.03), 0, TAU); c.fill();
        }
      }
      c.restore();
    }

    // selection and current city rings
    const ring = (x, y, rad, col, w, dash, off) => {
      c.save(); c.strokeStyle = col; c.lineWidth = w; if (dash) { c.setLineDash(dash); c.lineDashOffset = off || 0; }
      c.beginPath();
      for (let a = 0; a <= TAU + 0.01; a += TAU / 40) { const rr = rad * (1 + 0.035 * Math.sin(a * 3 + x)); const px = SX(x + 0.5) + Math.cos(a) * rr, py = SY(y + 0.5) + Math.sin(a) * rr * 0.92; a ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.stroke(); c.restore();
    };
    const cur = S.cities[UI.city];
    if (cur) ring(cur.x, cur.y, tp * 0.62, 'rgba(201,164,60,.95)', Math.max(1.5, tp * 0.05), [tp * 0.12, tp * 0.08], -t * 12);
    if (hover && !(UI.sel && UI.sel.x === hover.x && UI.sel.y === hover.y)) ring(hover.x, hover.y, tp * 0.5, 'rgba(59,42,26,.4)', 1.2);
    if (UI.sel) {
      const pulse = 1 + Math.sin(t * 3) * 0.04;
      ring(UI.sel.x, UI.sel.y, tp * 0.56 * pulse, 'rgba(139,42,26,.9)', Math.max(1.6, tp * 0.045));
      ring(UI.sel.x + 0.02, UI.sel.y - 0.02, tp * 0.6 * pulse, 'rgba(139,42,26,.45)', 1);
    }

    // armies
    const inc = new Set(incoming());
    const ak = clamp(tp * 1.25, 28, 72) / 100;
    for (const m of S.moves) {
      const mine = m.owner === 'p', hostile = inc.has(m);
      const p = G.movePos(S, m);
      if (!mine && !hostile) { const ii = clamp(Math.round(p.y), 0, N - 1) * N + clamp(Math.round(p.x), 0, N - 1); if (!vis[ii]) continue; }
      const ax = SX(p.x + 0.5), ay = SY(p.y + 0.5), bx = SX(m.x + 0.5), by = SY(m.y + 0.5);
      if (mine || hostile) {
        c.save(); c.setLineDash([2, 5]); c.lineCap = 'round'; c.lineWidth = 1.6;
        c.strokeStyle = hostile ? 'rgba(178,34,24,.75)' : 'rgba(59,42,26,.55)';
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); c.setLineDash([]);
        const d = 4; c.beginPath(); c.moveTo(bx - d, by - d); c.lineTo(bx + d, by + d); c.moveTo(bx + d, by - d); c.lineTo(bx - d, by + d); c.lineWidth = 2; c.stroke();
        c.restore();
      }
      if (ax < -40 || ay < -40 || ax > W + 40 || ay > H + 40) continue;
      const len = Math.hypot(m.x - m.fx, m.y - m.fy) || 1, dir = [(m.x - m.fx) / len, (m.y - m.fy) / len];
      c.save(); c.translate(ax, ay); c.scale(ak, ak); c.lineCap = 'round'; c.lineJoin = 'round';
      const alw = Math.max(1.4, 0.9 / ak);
      if (hostile) {
        const pu = 0.5 + 0.5 * Math.sin(t * 5);
        c.strokeStyle = `rgba(200,30,20,${0.45 + pu * 0.5})`; c.lineWidth = 2.5 + pu * 2;
        c.beginPath(); c.arc(0, -12, 24 + pu * 5, 0, TAU); c.stroke();
      }
      if (m.type === 'return') c.globalAlpha = 0.7;
      const col = hostile ? '#b3261e' : colorOf(m.owner), seed = hash(String(m.id || m.depart)) % 10;
      if (m.type === 'trade' || m.type === 'settle') drawCart(c, col, alw, t, dir, m.type === 'settle');
      else if (m.type === 'scout') drawScout(c, col, alw, t, seed);
      else drawBanner(c, col, alw, t, dir, seed);
      c.restore();
    }

    // drifting cloud shadows (world space)
    const cl = cloud();
    for (const cd of clouds) {
      const span = N + 16, wx = ((cd.x0 + t * cd.sp) % span) - 8, w = cd.sc * tp, h = w * 0.62;
      const sx = SX(wx), sy = SY(cd.y);
      if (sx + w < 0 || sx - w > W || sy + h < 0 || sy - h > H) continue;
      c.globalAlpha = cd.a; c.drawImage(cl, sx - w / 2, sy - h / 2, w, h);
    }
    c.globalAlpha = 1;

    // chimney smoke
    if (tp >= 24) {
      c.fillStyle = 'rgb(120,112,104)';
      for (const [cx, cy, sd] of smokes) for (let j = 0; j < 3; j++) {
        const ph = (t * 0.22 + j / 3 + sd) % 1;
        c.globalAlpha = (1 - ph) * 0.28 * Math.min(1, ph * 6);
        c.beginPath(); c.arc(cx + (6 + Math.sin(ph * 5 + sd * 9) * 5 + ph * 8) * k, cy - (26 + ph * 40) * k, (2.5 + ph * 7) * k, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }

    // weather
    const wv = Math.sin(S.time / 1500) + 0.6 * Math.sin(S.time / 577 + 1.3);
    const snow = winter, rainI = (se === 0 || se === 2) ? clamp((wv - 0.7) / 0.6, 0, 1) : 0, snowI = winter ? clamp((wv + 0.2) / 1.0, 0, 1) : 0;
    const wI = snow ? snowI : rainI;
    if (rainI > 0) { c.globalCompositeOperation = 'multiply'; c.fillStyle = `rgba(150,160,175,${0.25 * rainI})`; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }

    // day / night
    const day = G.daylight(S);
    let n = clamp((0.5 - day) / 0.42, 0, 1); n = n * n * (3 - 2 * n);
    const gold = Math.max(0, 1 - Math.abs(day - 0.38) / 0.16);
    if (n > 0.01 || gold > 0.01) {
      c.globalCompositeOperation = 'multiply';
      const q = n * 0.82;
      let r = lerp(255, 72, q), gch = lerp(255, 88, q), b = lerp(255, 150, q);
      r = lerp(r, r * 1.0, gold); gch = lerp(gch, gch * 0.88, gold * 0.6); b = lerp(b, b * 0.72, gold * 0.6);
      c.fillStyle = `rgb(${r | 0},${gch | 0},${b | 0})`; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
    }
    if (n > 0.05) {
      const gs = glow(); c.globalCompositeOperation = 'lighter';
      for (const [lx, ly, s] of lights) {
        const flick = 0.85 + 0.15 * Math.sin(t * 4 + lx * 0.7);
        const rad = Math.max(3.5, tp * 0.08) * s * flick;
        c.globalAlpha = n * 0.95; c.drawImage(gs, lx - rad, ly - rad, rad * 2, rad * 2);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }

    // rain / snow particles (screen space)
    if (wI > 0.02) {
      const dt = reduceMotion ? 0 : Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
      const cnt = Math.floor(parts.length * wI);
      c.beginPath();
      for (let j = 0; j < cnt; j++) {
        const q = parts[j];
        if (snow) { q.y += dt * q.v * 0.05; q.x += dt * 0.012 * Math.sin(t + q.ph); }
        else { q.y += dt * q.v * 0.9; q.x -= dt * q.v * 0.2; }
        if (q.y > 1) { q.y -= 1; q.x = Math.random(); } if (q.x < 0) q.x += 1; if (q.x > 1) q.x -= 1;
        const px = q.x * W, py = q.y * H;
        if (snow) { c.moveTo(px + 1.8, py); c.arc(px, py, 1.2 + q.v * 0.8, 0, TAU); } else { c.moveTo(px, py); c.lineTo(px - 3, py + 11); }
      }
      if (snow) { c.fillStyle = 'rgba(255,255,255,.92)'; c.shadowColor = 'rgba(60,70,90,.5)'; c.shadowBlur = 0; c.fill(); }
      else { c.strokeStyle = 'rgba(70,90,125,.4)'; c.lineWidth = 1; c.stroke(); }
    }

    // labels (screen-space, readable at any zoom)
    c.textAlign = 'center'; c.textBaseline = 'top'; c.lineJoin = 'round';
    for (const lb of labels) {
      const fs = lb.mine ? clamp(tp * 0.3, 11, 17) : clamp(tp * 0.25, 9.5, 14);
      c.font = `${lb.mine ? '700' : 'italic 500'} ${fs.toFixed(1)}px ${SERIF}`;
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(240,229,203,.9)'; c.strokeText(lb.text, lb.x, lb.y);
      c.fillStyle = lb.cur ? '#7a2414' : INK; c.fillText(lb.text, lb.x, lb.y);
      if (lb.mine) {
        const w = c.measureText(lb.text).width;
        c.strokeStyle = lb.cur ? 'rgba(122,36,20,.85)' : 'rgba(59,42,26,.7)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(lb.x - w / 2, lb.y + fs + 2); c.quadraticCurveTo(lb.x, lb.y + fs + 5, lb.x + w / 2, lb.y + fs + 2); c.stroke();
      }
      if (lb.sub && tp >= 40) {
        c.font = `italic ${(fs * 0.72).toFixed(1)}px ${SERIF}`; c.lineWidth = 3; c.strokeStyle = 'rgba(240,229,203,.85)';
        c.strokeText(lb.sub, lb.x, lb.y + fs + 5); c.fillStyle = 'rgba(59,42,26,.85)'; c.fillText(lb.sub, lb.x, lb.y + fs + 5);
      }
    }

    // vignette, compass, frame
    if (!vignette) { vignette = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6); vignette.addColorStop(0, 'rgba(40,24,8,0)'); vignette.addColorStop(1, 'rgba(40,24,8,.42)'); }
    c.fillStyle = vignette; c.fillRect(0, 0, W, H);
    const csz = Math.round(clamp(Math.min(W, H) * 0.17, 72, 124));
    c.globalAlpha = 0.92; c.drawImage(compass(Math.round(csz * DPR)), 12, H - csz - 12, csz, csz); c.globalAlpha = 1;
    c.strokeStyle = 'rgba(190,152,92,.9)'; c.lineWidth = 1.5; c.strokeRect(5.5, 5.5, W - 11, H - 11);
    c.lineWidth = 0.75; c.strokeRect(9.5, 9.5, W - 19, H - 19);
    c.fillStyle = 'rgba(190,152,92,.95)';
    for (const [x, y] of [[7.5, 7.5], [W - 7.5, 7.5], [7.5, H - 7.5], [W - 7.5, H - 7.5]]) { c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 5, y); c.lineTo(x, y + 5); c.lineTo(x - 5, y); c.closePath(); c.fill(); }
  }

  // ------------------------------------------------------------------
  // loop, sizing, layers
  // ------------------------------------------------------------------
  function fit(host) {
    const w = Math.max(240, host.clientWidth | 0);
    // phones: leave room for the header, the tile panel peeking below and the bottom tab bar
    const phone = window.innerWidth <= 700;
    const h = Math.round(clamp(Math.min(window.innerHeight * (phone ? 0.58 : 0.7), w), Math.min(300, Math.max(200, window.innerHeight * 0.5)), 2000));
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (w !== W || h !== H || dpr !== DPR) {
      W = w; H = h; DPR = dpr;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.height = h + 'px'; host.style.height = h + 'px';
      vignette = null;
      clampCam();
    }
  }
  const citySig = () => Object.values(S.cities).map(c => c.id + c.owner + c.x + ',' + c.y + ':' + (G.cityReach ? Math.round(G.cityReach(S, c) * 4) : 0)).join(';');
  function refresh(now, force) {
    if (!force && now - lastCheck < 250) return;
    lastCheck = now;
    vis = G.visibleSet(S);
    updateDim();
    let ex = 0; for (let i = 0; i < S.explored.length; i++) ex += S.explored[i] ? 1 : 0;
    const key = S.map + '|' + ex + '|' + G.season(S).index + '|' + citySig();
    if (key !== layerKey && (!layer || force || now - lastBake > 1000)) { bake(); layerKey = key; lastBake = now; }
  }
  function frame() {
    raf = 0;
    if (!S || UI.tab !== 'world' || document.hidden || !canvas || !canvas.isConnected) return;
    const t0 = performance.now();
    fit(canvas.parentNode);
    refresh(t0, !layer);
    // follow external selection / city changes
    if (UI.city !== lastCityId) { const c = S.cities[UI.city]; if (c && lastCityId !== null) flyTo(c.x, c.y); lastCityId = UI.city; }
    const sk = UI.sel ? UI.sel.x + ',' + UI.sel.y : '';
    if (sk !== lastSelKey) {
      if (UI.sel) { const tp = tilePx(), sx = W / 2 + (UI.sel.x + 0.5 - cam.x) * tp, sy = H / 2 + (UI.sel.y + 0.5 - cam.y) * tp; if (sx < 40 || sy < 40 || sx > W - 40 || sy > H - 40) flyTo(UI.sel.x, UI.sel.y); }
      lastSelKey = sk;
    }
    stepCam();
    clampCam();
    const tDraw = reduceMotion ? RM_T : t0;
    draw(tDraw);
    lastFrame = tDraw;
    const dt = performance.now() - t0;
    stats.frames.push(dt); if (stats.frames.length > 120) stats.frames.shift();
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  // ------------------------------------------------------------------
  // input
  // ------------------------------------------------------------------
  const pts = new Map();
  let drag = null, pinch = null;
  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function tileAtClient(e) {
    const p = local(e), w = toWorld(p.x, p.y), x = Math.floor(w.x), y = Math.floor(w.y);
    return x >= 0 && y >= 0 && x < S.map && y < S.map ? { x, y } : null;
  }
  function hideTip() { if (tip) tip.style.display = 'none'; hover = null; }
  function showTip(e) {
    const tt = tileAtClient(e);
    if (!tt) { hideTip(); return; }
    hover = tt;
    const p = local(e);
    tip.textContent = tileName(S.tiles[tt.y * S.map + tt.x]);
    tip.style.display = 'block';
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(p.x + 14, 4, W - tw - 4) + 'px';
    tip.style.top = (p.y + 18 + th > H ? p.y - th - 10 : p.y + 18) + 'px';
  }
  // touch: when the tile panel sits below the map (single column) and is fully off-screen, bring its top into view
  function revealPanel() {
    const panel = document.querySelector('.mapwrap > .card');
    if (!panel || window.innerWidth > 1100) return;
    const r = panel.getBoundingClientRect(), bar = window.innerWidth <= 700 ? 84 : 0;
    if (r.top < window.innerHeight - bar - 40) return;
    const dy = r.top - (window.innerHeight - bar - 160);
    // run after ui-core's pointerup reset of UI.holding, and hold off the 1 s render() (it restores scrollY) meanwhile
    setTimeout(() => {
      if (!reduceMotion) { UI.holding = true; setTimeout(() => { UI.holding = false; }, 700); }
      window.scrollBy({ top: dy, behavior: reduceMotion ? 'auto' : 'smooth' });
    }, 0);
  }
  function setupInput() {
    canvas.addEventListener('pointerdown', e => {
      if (!S || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      UI.holding = true;  // keep render() from rebuilding the DOM mid-gesture
      pts.set(e.pointerId, local(e));
      cam.tx = cam.ty = cam.tz = null;
      if (pts.size === 1) drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false, slop: e.pointerType === 'mouse' ? 5 : 10 };
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: cam.z, w: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
        if (drag) drag.moved = true;
      }
      canvas.classList.add('grabbing');
    });
    window.addEventListener('pointermove', e => {
      if (!canvas || !S) return;
      if (!pts.has(e.pointerId)) { if (e.target === canvas && e.pointerType === 'mouse') showTip(e); return; }
      UI.holding = true;
      pts.set(e.pointerId, local(e));
      if (pts.size === 1 && drag) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) > (drag.slop || 5)) drag.moved = true;
        if (drag.moved) { const tp = tilePx(); cam.x = drag.cx - dx / tp; cam.y = drag.cy - dy / tp; clampCam(); hideTip(); }
      } else if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        cam.z = clamp(pinch.z * d / pinch.d, ZMIN, ZMAX);
        const tp = tilePx(); cam.x = pinch.w.x - (mx - W / 2) / tp; cam.y = pinch.w.y - (my - H / 2) / tp; clampCam();
      }
    });
    const end = (e, cancel) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0) {
        canvas.classList.remove('grabbing');
        const d = drag; drag = null; pinch = null;
        if (!cancel && d && !d.moved) {
          const tt = tileAtClient(e);
          if (tt) { UI.sel = tt; lastSelKey = tt.x + ',' + tt.y; UI.holding = false; render(true); if (e.pointerType !== 'mouse') revealPanel(); }
        }
      } else if (pts.size === 1) {
        const [p] = [...pts.values()], r = canvas.getBoundingClientRect();
        drag = { sx: p.x + r.left, sy: p.y + r.top, cx: cam.x, cy: cam.y, moved: true }; pinch = null;
      }
    };
    window.addEventListener('pointerup', e => end(e, false));
    window.addEventListener('pointercancel', e => end(e, true));
    canvas.addEventListener('pointerleave', () => { if (!pts.size) hideTip(); });
    canvas.addEventListener('wheel', e => {
      if (!S) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const p = local(e);
      zoomAt(p.x, p.y, cam.z * Math.exp(-dy * 0.0016));
    }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    // iOS Safari: block the native pinch-zoom / double-tap zoom gestures over the map
    canvas.addEventListener('gesturestart', e => e.preventDefault());
    canvas.addEventListener('dblclick', e => e.preventDefault());
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'worldcanvas';
    canvas.setAttribute('aria-label', 'World map');
    ctx = canvas.getContext('2d');
    tip = document.createElement('div');
    tip.className = 'maptip';
    setupInput();
  }

  // ------------------------------------------------------------------
  // integration
  // ------------------------------------------------------------------
  const phaseName = () => { const p = G.dayPhase(S); return p < 0.2 || p >= 0.85 ? 'Night' : p < 0.3 ? 'Dawn' : p < 0.72 ? 'Day' : 'Dusk'; };
  window.worldMapHtml = city => {
    const owners = Object.values(S.empires).filter(e => !e.dead && Object.values(S.cities).some(c => c.owner === e.id && S.explored[c.y * S.map + c.x]));
    const legend = owners.map(e => `<span><i style="background:${e.color}"></i>${esc(e.name)}${e.id === 'p' ? ' (you)' : ''}</span>`).join('');
    return `<div class="mapcol"><div id="mapHost" class="maphost" style="height:${H}px">
        <div class="mapchip">${esc(G.season(S).name)} · ${phaseName()}</div>
        <div class="mapctl">
          <button data-act="wmZoomIn" title="Zoom in" aria-label="Zoom in">+</button>
          <button data-act="wmZoomOut" title="Zoom out" aria-label="Zoom out">&minus;</button>
          <button data-act="wmCenter" title="Center on ${esc(city.name)}" aria-label="Center on city" class="wide">Center</button>
        </div>
      </div>
      <div class="maplegend">${legend}<span class="muted">${window.matchMedia && matchMedia('(hover: none)').matches ? 'Drag to pan · pinch to zoom · tap a place to select it' : 'Drag to pan · scroll or pinch to zoom · click a place to select it'}</span></div></div>`;
  };

  Object.assign(act, {
    wmZoomIn: () => { cam.tz = clamp((cam.tz || cam.z) * 1.4, ZMIN, ZMAX); start(); },
    wmZoomOut: () => { cam.tz = clamp((cam.tz || cam.z) / 1.4, ZMIN, ZMAX); start(); },
    wmCenter: () => { const c = curCity(); if (c) flyTo(c.x, c.y, Math.max(cam.z, 1.5)); start(); },
  });

  MOUNT_HOOKS.push(tab => {
    if (tab !== 'world' || !S) { stop(); hideTip(); return; }
    const host = document.getElementById('mapHost');
    if (!host) { stop(); return; }
    ensureCanvas();
    host.insertBefore(canvas, host.firstChild);
    host.appendChild(tip);
    fit(host);
    if (!cam.init) {
      const c = curCity();
      cam.z = 2.2; if (c) { cam.x = c.x + 0.5; cam.y = c.y + 0.5; }
      cam.init = true; lastCityId = UI.city; lastSelKey = UI.sel ? UI.sel.x + ',' + UI.sel.y : '';
      clampCam();
    }
    start();
  });

  // debug / test helpers
  window.ECMAP = {
    cam,
    stats: () => { const f = stats.frames; const avg = f.reduce((a, b) => a + b, 0) / (f.length || 1); return { frames: f.length, avgMs: +avg.toFixed(2), maxMs: +Math.max(0, ...f).toFixed(2), bakeMs: +stats.bakeMs.toFixed(1), bakes: stats.bakes }; },
    tileToClient: (x, y) => { const r = canvas.getBoundingClientRect(), tp = tilePx(); return { x: r.left + W / 2 + (x + 0.5 - cam.x) * tp, y: r.top + H / 2 + (y + 0.5 - cam.y) * tp }; },
    rebake: () => { layerKey = ''; if (S) refresh(performance.now(), true); },
    reset: () => { cam.init = false; },
    layer: () => layer,
    toWorld: (cx, cy) => { const r = canvas.getBoundingClientRect(); return toWorld(cx - r.left, cy - r.top); },
    get reduceMotion() { return reduceMotion; },
  };
})();
