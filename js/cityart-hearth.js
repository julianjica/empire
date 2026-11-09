// Building art for the hearth — see the CITYART contract in js/cityart.js
// Hearthfolk: warm farming folk of the river valleys. Whitewashed cob and half-timber under deep
// thatch (Founding) that turns to red tile (Kingdom/Empire) and blue slate with gilt (Legend);
// hedged gardens, dovecotes, haystacks, a turning mill, a bell-tower hall with a clock, a
// striped-awning market round a market cross, a village green with a maypole.
// Each building keeps its centrepiece over the slot centre (the stock level-20 finial lands there),
// leaves the front/right yard strip low (stock yard dressing is drawn after us) and returns its top.
'use strict';
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.hearth) return;
  let A = null, X = null;
  const reg = (t, fn) => {
    CITYART.hearth[t] = (api, slot, L, band, ctx) => {
      A = api; X = ctx;
      if (window.__ART_DEBUG) (window.__artSlots = window.__artSlots || {})['hearth.' + t + (t === 'cottage' ? ctx.i : '')] = slot.slice();
      return fn(slot, L, band, ctx);
    };
  };
  // ---------------- small wrappers over the api ----------------
  const P = (gx, gy, z = 0) => A.P(gx, gy, z);
  const box = (...a) => A.box(...a), poly = (...a) => A.poly(...a), line = (...a) => A.line(...a), circ = (...a) => A.circ(...a);
  const shade = (h, f) => A.shade(h, f), mix = (a, b, t) => A.mix(a, b, t);
  const BAND_LO = [1, 5, 10, 15];
  const sub = (L, band) => Math.max(0, L - BAND_LO[band]);          // 0.. within the band
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const TAU = Math.PI * 2;
  const WALLS = ['#f1e8d6', '#efdcb4', '#f0d6c8', '#e9e6d6'];   // cream, ochre-wash, rose-wash, lime white
  const THATCH = '#c9a14c', TILE = '#b4482f', SLATE = '#5f6a78', SHINGLE = '#8a5a3a', BEAM = '#6a4a30', OAK = '#8a6440';
  const STONE = '#c4baa8', STONE_D = '#a89e8c', BARN = '#a8482f', GOLD = '#e0b440';
  const CLOTH = ['#c0392b', '#e0b84a', '#3f6fa8', '#5e8f3e'];
  const HEDGE = () => A.SNOW ? '#e8eef0' : A.SEASON === 2 ? '#8a7a3a' : '#4f8a3e';
  const LEAF2 = () => A.SNOW ? '#f6f9fa' : A.SEASON === 2 ? '#b0903e' : '#6eac50';
  const GRASS = () => A.SNOW ? '#eef2f4' : A.SEASON === 2 ? '#b8ab5c' : A.SEASON === 1 ? '#8fba52' : '#9cc463';
  const stoneOK = () => X.tech('masonry') || X.era >= 2;

  // roof material: deep thatch in the Founding era, red tile through Kingdom/Empire, slate for Legend.
  function roofOf(grand = false, v = 0) {
    const e = X.era;
    if (e === 3 && !grand && v % 3 === 1) return { col: '#9a3e2a', tex: 'tile', o: 0.12, k: 1 };   // a few old red roofs among the slate
    if (e === 0 && !(grand && X.tech('masonry'))) return { col: THATCH, tex: 'thatch', o: 0.17, k: 1.12 };
    if (e === 0 || (e === 1 && !grand)) return { col: e === 0 ? SHINGLE : mix(TILE, '#8a5236', 0.25), tex: 'tile', o: 0.13, k: 1 };
    if (e === 3) return { col: SLATE, tex: 'slate', o: 0.12, k: 1 };
    return { col: TILE, tex: 'tile', o: 0.12, k: 1 };
  }
  // a gable roof with a proper material: thatch gets a thick eave lip and a rolled ridge, slate fine courses + gilt ridge
  function roof(b, rh, axis, m, extra = {}) {
    const col = extra.col || m.col, o = extra.o != null ? extra.o : m.o;
    const zt = A.gable(b, rh * m.k, col, axis, m.tex === 'slate' ? 'tile' : m.tex, o);
    const zb = b.z + b.h, x0 = b.x - o, x1 = b.x + b.w + o, y0 = b.y - o, y1 = b.y + b.d + o;
    const rc = A.SNOW ? '#eef2f4' : col;
    if (m.tex === 'thatch') {
      if (axis === 'x') { line(P(x0, y1, zb), P(x1, y1, zb), shade(rc, -0.32), 2.4); line(P(x0, b.y + b.d / 2, zt), P(x1, b.y + b.d / 2, zt), shade(rc, 0.12), 3); }
      else { line(P(x1, y0, zb), P(x1, y1, zb), shade(rc, -0.36), 2.4); line(P(b.x + b.w / 2, y0, zt), P(b.x + b.w / 2, y1, zt), shade(rc, 0.1), 3); }
    } else if (m.tex === 'slate' && !A.SNOW) {
      const q = axis === 'x' ? [P(x0, y1, zb), P(x1, y1, zb), P(x1, b.y + b.d / 2, zt), P(x0, b.y + b.d / 2, zt)] : [P(x1, y1, zb), P(x1, y0, zb), P(b.x + b.w / 2, y0, zt), P(b.x + b.w / 2, y1, zt)];
      A.roofLines(q, 9, shade(col, -0.18), 0.4);
      line(axis === 'x' ? P(x0, b.y + b.d / 2, zt) : P(b.x + b.w / 2, y0, zt), axis === 'x' ? P(x1, b.y + b.d / 2, zt) : P(b.x + b.w / 2, y1, zt), '#c9a03a', 1);
    }
    return zt;
  }
  // pyramid / spire over a square box (hip with a high rise)
  const spire = (b, rh, col) => A.hip(b, rh, col, 0.05, 'tile');
  // a window with painted shutters and (optionally) a flower box below
  function shutterWin(b, side, u, v, ww = 0.17, wh = 5, flowers = false, shut = '#3f6fa8') {
    const f = side === 'L' ? A.onL : A.onR;
    A.win(b, side, u, v, ww, wh);
    poly(f(b, u - ww / 2 - 0.1, u - ww / 2 - 0.03, v - 0.5, v + wh + 0.5), shut, null);
    poly(f(b, u + ww / 2 + 0.03, u + ww / 2 + 0.1, v - 0.5, v + wh + 0.5), shut, null);
    if (flowers) {
      poly(f(b, u - ww / 2 - 0.05, u + ww / 2 + 0.05, v - 2.2, v - 0.6), '#7a5232', A.OUT, 0.5);
      if (!A.SNOW) for (let k = 0; k < 4; k++) { const p = f(b, u - ww / 2 + k * ww / 3, u, v - 0.5, v)[0]; circ(p[0], p[1] - 0.6, 1.1, ['#e85a6a', '#f2c94c', '#ffffff', '#d870b0'][k], null); }
    }
  }
  function winRow(b, side, v, wh, ww = 0.16, gap = 0.36, skip = -1, shut = null) {
    const Lf = side === 'L' ? b.w : b.d, n = Math.max(1, Math.round(Lf / gap));
    for (let k = 0; k < n; k++) { if (k === skip) continue; const u = Lf * (k + 0.5) / n; if (shut) shutterWin(b, side, u, v, ww, wh, false, shut); else A.win(b, side, u, v, ww, wh); }
  }
  // tall arched window (churches, colleges)
  function archWin(b, side, u, v, ww = 0.14, wh = 9) {
    const f = side === 'L' ? A.onL : A.onR;
    const q = f(b, u - ww / 2, u + ww / 2, v, v + wh - 2), tp = f(b, u, u, v + wh, v + wh)[0];
    const fr = f(b, u - ww / 2 - 0.03, u + ww / 2 + 0.03, v - 0.8, v + wh - 2)[0];
    poly([f(b, u - ww / 2 - 0.03, 0, v - 0.8, 0)[0], f(b, u + ww / 2 + 0.03, 0, v - 0.8, 0)[0], f(b, u + ww / 2 + 0.03, 0, v + wh - 2, 0)[0], [tp[0], tp[1] - 1.2], f(b, u - ww / 2 - 0.03, 0, v + wh - 2, 0)[0]], STONE_D, null);
    void fr;
    A.c.beginPath(); A.c.moveTo(...q[0]); A.c.lineTo(...q[1]); A.c.lineTo(...q[2]); A.c.lineTo(...tp); A.c.lineTo(...q[3]); A.c.closePath();
    A.c.fillStyle = A.GLOW ? '#ffd88a' : '#4b5a6b'; A.c.fill();
  }
  // a hedge running between two grid points (round clipped bushes)
  function hedge(p0, p1, r = 2.3, gap = 0.2) {
    const n = Math.max(1, Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / gap));
    for (let k = 0; k <= n; k++) { const g = lerp(p0, p1, k / n), [hx, hy] = P(g[0], g[1]); circ(hx, hy - r * 0.9, r, HEDGE(), A.OUT); circ(hx - r * 0.3, hy - r * 1.25, r * 0.45, LEAF2(), null); }
  }
  function picket(p0, p1, h = 4.5, col = '#efe8d8') {
    const n = Math.max(1, Math.round(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.11));
    line(P(...p0, h * 0.7), P(...p1, h * 0.7), shade(col, -0.25), 0.8);
    for (let k = 0; k <= n; k++) { const g = lerp(p0, p1, k / n); line(P(g[0], g[1]), P(g[0], g[1], h), col, 1.1); }
  }
  function rail(p0, p1, h = 5, col = OAK) { A.fence([p0, p1], h, col); }
  const flat = (x, y, w, d, col, st = 'rgba(60,40,20,0.22)') => poly(A.quad(x, y, w, d), col, st);
  const grassPatch = (x, y, w, d) => flat(x, y, w, d, GRASS(), 'rgba(60,80,20,0.25)');
  const dirt = (x, y, w, d, col = '#c2a77a') => flat(x, y, w, d, A.SNOW ? '#e2e4e0' : col);
  function flowers(x, y, w, d, n = 8) {
    if (A.SNOW) return;
    for (let k = 0; k < n; k++) { const [px, py] = P(x + ((k * 0.618) % 1) * w, y + ((k * 0.382 + 0.2) % 1) * d); circ(px, py - 1, 1.1, ['#e85a6a', '#f2c94c', '#ffffff', '#d870b0', '#7aa8e8'][k % 5], null); }
  }
  // garden beds: rows of greens (or snow) inside a rectangle
  function vegBed(x, y, w, d) {
    flat(x, y, w, d, A.SNOW ? '#e4e8ea' : '#7a5a3a', 'rgba(60,40,20,0.3)');
    if (A.SNOW) return;
    const n = Math.max(2, Math.round(w / 0.13));
    for (let k = 0; k < n; k++) { const gx = x + (k + 0.5) * w / n; for (let j = 0; j < 3; j++) { const [px, py] = P(gx, y + (j + 0.5) * d / 3); circ(px, py - 1, 1.3, A.SEASON === 2 ? '#c08a2e' : j % 2 ? '#6eac50' : '#4f8a3e', null); } }
  }
  function curve(pts, col, lw) { A.c.beginPath(); A.c.moveTo(...pts[0]); for (let k = 1; k < pts.length; k++) A.c.lineTo(...pts[k]); A.c.strokeStyle = A.F(col); A.c.lineWidth = lw; A.c.stroke(); }
  function beehive(gx, gy) { // straw skep on a stand
    const [x, y] = P(gx, gy); line([x - 2.5, y], [x - 2.5, y - 2.5], '#5a3a22', 0.8); line([x + 2.5, y], [x + 2.5, y - 2.5], '#5a3a22', 0.8);
    A.c.beginPath(); A.c.moveTo(x - 3.4, y - 2.5); A.c.quadraticCurveTo(x - 3.6, y - 9.5, x, y - 10); A.c.quadraticCurveTo(x + 3.6, y - 9.5, x + 3.4, y - 2.5); A.c.closePath();
    A.c.fillStyle = A.F(A.SNOW ? '#eef2f4' : '#d8b05a'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.6; A.c.stroke();
    for (const v of [4.6, 6.6, 8.4]) line([x - 3.1 + (v - 4) * 0.25, y - v], [x + 3.1 - (v - 4) * 0.25, y - v], '#a07a34', 0.5);
    circ(x, y - 3.4, 0.7, '#3a2a18', null);
  }
  function dovecote(gx, gy, z = 0, hgt = 16) { // a little house on a post
    line(P(gx, gy, z), P(gx, gy, z + hgt), OAK, 1.6);
    const b = box(gx - 0.12, gy - 0.12, 0.24, 0.24, z + hgt, 5, '#f1e8d6');
    for (const s of ['L', 'R']) { const p = (s === 'L' ? A.onL : A.onR)(b, 0.12, 0.12, 2.2, 2.2)[0]; circ(p[0], p[1], 0.9, '#2a2018', null); }
    const zt = A.cone(gx, gy, 0.22, z + hgt + 5, 6, roofOf().col);
    const [px, py] = P(gx + 0.15, gy + 0.15, z + hgt + 1); circ(px, py, 1.3, '#f4f4f0', A.OUT);
    return zt;
  }
  function roundDovecote(gx, gy, r = 0.26, h = 18) { // stone dovecote tower
    A.cyl(gx, gy, r, 0, h, stoneOK() ? STONE : '#efe6d2');
    const [x, y] = P(gx, gy, h * 0.75); for (let k = -1; k <= 1; k++) circ(x + k * 3, y, 0.9, '#2a2018', null);
    const [x2, y2] = P(gx, gy, h * 0.5); for (let k = -1; k <= 1; k += 2) circ(x2 + k * 2, y2, 0.9, '#2a2018', null);
    const zt = A.cone(gx, gy, r + 0.05, h, 10, roofOf().col);
    circ(...P(gx, gy, zt + 1.5), 1.2, '#f4f4f0', A.OUT);
    return zt;
  }
  function woodpile(gx, gy, len = 0.35) { for (let r = 0; r < 2; r++) for (let i = 0; i < 2 - r; i++) A.log(gx, gx + len, gy + i * 0.12 + r * 0.06, 1.4 + r * 2.4, 1.3); }
  function waterButt(gx, gy) { A.cyl(gx, gy, 0.08, 0, 6, '#7a5232', A.SNOW ? '#dfe8ee' : '#4f7f9a'); }
  function chickens(gx, gy, n = 3) { for (let k = 0; k < n; k++) { const [x, y] = P(gx + k * 0.12, gy + (k % 2) * 0.1); circ(x, y - 1.6, 1.3, k % 2 ? '#f4efe4' : '#b8662e', null); circ(x + 1, y - 2.6, 0.6, '#c0392b', null); } }
  function bench(gx, gy) { const a = P(gx, gy, 2.5), b = P(gx + 0.25, gy, 2.5); line(a, b, '#7a5232', 1.6); line(P(gx + 0.02, gy), a, '#5a3a22', 0.8); line(P(gx + 0.23, gy), b, '#5a3a22', 0.8); }
  function lampPost(gx, gy, h = 12) { const [x, y] = P(gx, gy); line([x, y], [x, y - h], '#3a2a20', 1.1); line([x, y - h], [x + 3, y - h], '#3a2a20', 0.9); A.lantern(x + 3, y - h + 3, 1.3); }
  function cow(gx, gy, flip = 1) {
    const [x, y] = P(gx, gy);
    for (const dx of [-3.5, -1.8, 2.5, 4]) line([x + dx * flip, y - 3.5], [x + dx * flip, y], '#3a2a20', 1.1);
    A.c.beginPath(); A.c.ellipse(x, y - 5.5, 6, 3.2, 0, 0, TAU); A.c.fillStyle = A.F('#f4efe6'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.7; A.c.stroke();
    circ(x - 1.5 * flip, y - 6, 1.6, '#3a3230', null); circ(x + 2 * flip, y - 5, 1.2, '#3a3230', null);
    poly([[x + 5 * flip, y - 7], [x + 8.5 * flip, y - 7.5], [x + 9 * flip, y - 4.5], [x + 5.5 * flip, y - 4]], '#3a3230');
    line([x + 7 * flip, y - 7.5], [x + 7.5 * flip, y - 9], '#e8dcc0', 0.8);
  }
  function sheep(gx, gy) {
    const [x, y] = P(gx, gy); line([x - 2, y - 2], [x - 2, y], '#3a2a20', 1); line([x + 2, y - 2], [x + 2, y], '#3a2a20', 1);
    const wool = A.SNOW ? '#f4f1ea' : '#f2ede2';
    for (const [dx, dy] of [[-2.2, -4], [0, -5], [2.2, -4], [0, -3.2]]) circ(x + dx, y + dy, 2.4, wool, A.OUT);
    circ(x + 4, y - 4.6, 1.5, '#3a3230', null);
  }
  function pig(gx, gy) { const [x, y] = P(gx, gy); A.c.beginPath(); A.c.ellipse(x, y - 3, 4.4, 2.6, 0, 0, TAU); A.c.fillStyle = A.F('#e8a8a0'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.6; A.c.stroke(); circ(x + 4, y - 3, 1.4, '#e09890', null); }
  function scarecrow(gx, gy) { const [x, y] = P(gx, gy); line([x, y], [x, y - 14], '#6a4a30', 1.2); line([x - 5, y - 10], [x + 5, y - 10], '#6a4a30', 1.2); poly([[x - 3, y - 11], [x + 3, y - 11], [x + 2, y - 5], [x - 2, y - 5]], '#5e7f9e'); circ(x, y - 13, 2, '#e0c080', A.OUT); poly([[x - 3.5, y - 14], [x + 3.5, y - 14], [x, y - 18]], '#7a5232'); }
  function cart(gx, gy, alongX = true, load = 'hay') { // a two-wheeled farm cart
    const w = alongX ? 0.5 : 0.28, d = alongX ? 0.28 : 0.5;
    box(gx, gy, w, d, 3, 3, '#9a6a3c');
    if (load === 'hay') { const [hx, hy] = P(gx + w / 2, gy + d / 2, 6); A.c.beginPath(); A.c.ellipse(hx, hy - 1, alongX ? 8 : 6, 4.5, 0, Math.PI, TAU); A.c.fillStyle = A.F(A.SNOW ? '#eceee8' : '#d9b65a'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.6; A.c.stroke(); }
    else if (load === 'sacks') { const [hx, hy] = P(gx + w / 2, gy + d / 2, 6); for (let k = -1; k <= 1; k++) circ(hx + k * 3, hy - 1.5, 2, '#d8c79e', A.OUT); }
    else if (load === 'logs') { A.log(gx + 0.02, gx + w + 0.1, gy + d * 0.5, 7.5, 1.6); }
    else if (load === 'stone') { box(gx + 0.08, gy + 0.06, w * 0.6, d * 0.6, 6, 3, STONE); }
    const wp = alongX ? P(gx + w * 0.5, gy + d + 0.01, 3) : P(gx + w + 0.01, gy + d * 0.5, 3);
    circ(wp[0], wp[1], 3, null, '#4a3020'); circ(wp[0], wp[1], 0.8, '#4a3020');
    const sh = alongX ? [P(gx + w, gy + d * 0.3, 3.5), P(gx + w + 0.3, gy + d * 0.3, 1)] : [P(gx + w * 0.3, gy + d, 3.5), P(gx + w * 0.3, gy + d + 0.3, 1)];
    line(sh[0], sh[1], '#6a4a30', 1);
  }
  function clock(p, r = 3) {
    circ(p[0], p[1], r + 0.9, X.era >= 3 ? GOLD : '#4a3a2a', A.OUT);
    A.lampDot(p[0], p[1], r, '#f6f0de', '#ffe9b0');
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; circ(p[0] + Math.cos(a) * r * 0.75, p[1] + Math.sin(a) * r * 0.75, 0.35, '#3a2a20', null); }
    line(p, [p[0] + r * 0.5, p[1] - r * 0.35], '#2a1e14', 0.7); line(p, [p[0] - 0.1, p[1] - r * 0.8], '#2a1e14', 0.6);
    A.rec('lights', { x: p[0], y: p[1], r: 10 });
  }
  function weathercock(gx, gy, z) {
    const t = P(gx, gy, z), col = X.era >= 2 ? GOLD : '#3a2a20';
    line(t, [t[0], t[1] - 8], '#3a2a20', 1);
    line([t[0] - 3, t[1] - 4.5], [t[0] + 3, t[1] - 4.5], '#3a2a20', 0.6);
    poly([[t[0] - 3.5, t[1] - 8.5], [t[0] + 0.5, t[1] - 9], [t[0] + 2, t[1] - 12], [t[0] + 3.4, t[1] - 9.5], [t[0] + 2, t[1] - 7.6], [t[0] - 1.5, t[1] - 7.4]], col, '#3a2a20', 0.5);
    return z + 12;
  }
  function bell(px, py, r = 2.2) { poly([[px - r, py + r * 0.6], [px + r, py + r * 0.6], [px + r * 0.6, py - r * 0.6], [px, py - r], [px - r * 0.6, py - r * 0.6]], '#c9a03a'); }
  function maypole(gx, gy, h = 26) {
    const [x, y] = P(gx, gy), top = [x, y - h];
    const n = 6;
    for (let k = 0; k < n; k++) { const a = k / n * TAU + 0.3; const [ex, ey] = P(gx + Math.cos(a) * 0.32, gy + Math.sin(a) * 0.32); if (Math.sin(a) < 0) curve([top, [(top[0] + ex) / 2, (top[1] + ey) / 2 + 2], [ex, ey]], CLOTH[k % 4], 0.8); }
    line([x, y], top, '#f0e6d0', 1.6);
    for (let k = 3; k < h - 4; k += 4) line([x - 0.8, y - k], [x + 0.8, y - k - 2], '#c0392b', 0.8);
    A.c.beginPath(); A.c.ellipse(top[0], top[1] + 2, 3.2, 1.3, 0, 0, TAU); A.c.strokeStyle = A.F(A.SNOW ? '#7a8a7a' : '#4f8a3e'); A.c.lineWidth = 1.4; A.c.stroke();
    for (let k = 0; k < n; k++) { const a = k / n * TAU + 0.3; const [ex, ey] = P(gx + Math.cos(a) * 0.32, gy + Math.sin(a) * 0.32); if (Math.sin(a) >= 0) curve([top, [(top[0] + ex) / 2, (top[1] + ey) / 2 + 2], [ex, ey]], CLOTH[k % 4], 0.8); }
    A.rec('flags', { x: top[0], y: top[1] - 1, col: '#c0392b', len: 7, seed: A.R() });
  }
  function bunting(a, b, sag = 5, n = 8) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag], pt = t => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0], u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1]]; };
    A.c.beginPath(); A.c.moveTo(...a); A.c.quadraticCurveTo(...mid, ...b); A.c.strokeStyle = A.F('#5a4030'); A.c.lineWidth = 0.5; A.c.stroke();
    for (let k = 1; k < n; k++) { const p = pt(k / n), q = pt((k + 0.5) / n); poly([p, q, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 3]], CLOTH[k % 4], null); }
  }
  // a striped awning on the L (y+d) or R (x+w) face of box b, from u0 to u1 at height z
  function awning(b, side, u0, u1, z, dep = 0.22, c1 = '#c0392b', c2 = '#f6eedc') {
    const at = (u, out, zz) => side === 'L' ? P(b.x + u, b.y + b.d + out, zz) : P(b.x + b.w + out, b.y + u, zz);
    const n = Math.max(2, Math.round((u1 - u0) / 0.09));
    for (let k = 0; k < n; k++) {
      const a0 = u0 + (u1 - u0) * k / n, a1 = u0 + (u1 - u0) * (k + 1) / n;
      poly([at(a0, 0, z), at(a1, 0, z), at(a1, dep, z - 4), at(a0, dep, z - 4)], A.SNOW ? '#f2f5f8' : k % 2 ? c2 : c1, k === 0 || k === n - 1 ? A.OUT : null, 0.5);
      const m0 = at(a0, dep, z - 4), m1 = at(a1, dep, z - 4);
      A.c.beginPath(); A.c.moveTo(...m0); A.c.quadraticCurveTo((m0[0] + m1[0]) / 2, (m0[1] + m1[1]) / 2 + 2.6, ...m1); A.c.closePath(); A.c.fillStyle = A.F(k % 2 ? c2 : c1); A.c.fill();
    }
    line(at(u0, dep, z - 4), at(u1, dep, z - 4), A.OUT, 0.5);
  }
  // a market stall with a striped canopy; produce on the board
  function stall(gx, gy, col, alongX = true, goods = 0) {
    const w = alongX ? 0.5 : 0.3, d = alongX ? 0.3 : 0.5;
    box(gx, gy, w, d, 0, 4.5, '#9a6a3c');
    const [cx, cy] = P(gx + w / 2, gy + d / 2, 4.5);
    const G = [['#e2b84a', '#c0392b', '#7cae4a', '#e8873a'], ['#d8a24a', '#c88a3a', '#e8c070', '#b87a3a'], ['#f4f0e0', '#e8d890', '#f4f0e0', '#d8c860'], ['#5e8fc8', '#c0392b', '#e0b84a', '#5e8f3e']][goods % 4];
    for (let k = 0; k < 4; k++) circ(cx - 4 + k * 2.6, cy - 1, 1.4, G[k], null);
    for (const [px, py] of [[gx, gy + d], [gx + w, gy + d], [gx + w, gy]]) line(P(px, py, 0), P(px, py, 11), '#5a4030', 1);
    const q = [P(gx - 0.05, gy - 0.05, 13), P(gx + w + 0.05, gy - 0.05, 13), P(gx + w + 0.05, gy + d + 0.12, 8.5), P(gx - 0.05, gy + d + 0.12, 8.5)];
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a = alongX ? [lerp(q[0], q[1], k / n), lerp(q[0], q[1], (k + 1) / n), lerp(q[3], q[2], (k + 1) / n), lerp(q[3], q[2], k / n)] : [lerp(q[0], q[3], k / n), lerp(q[0], q[3], (k + 1) / n), lerp(q[1], q[2], (k + 1) / n), lerp(q[1], q[2], k / n)];
      poly(a, A.SNOW ? '#f2f5f8' : k % 2 ? '#f6eedc' : col, null);
    }
    poly(q, null, A.OUT, 0.6);
  }
  // a round tower that narrows from r0 at z to r1 at z + h (tower mills, clay bloomeries)
  function taperCyl(cx, cy, r0, r1, z, h, col, topCol) {
    const [ex, ey, rx, ry] = A.ell(cx, cy, z, r0), [tx, ty, trx, tr] = A.ell(cx, cy, z + h, r1);
    A.c.beginPath(); A.c.moveTo(ex - rx, ey); A.c.ellipse(ex, ey, rx, ry, 0, Math.PI, 0, true); A.c.lineTo(tx + trx, ty); A.c.ellipse(tx, ty, trx, tr, 0, 0, Math.PI, true); A.c.closePath(); A.gradFill(ex - rx, ex + rx, col);
    if (topCol) { A.c.beginPath(); A.c.ellipse(tx, ty, trx, tr, 0, 0, TAU); A.c.fillStyle = A.F(topCol); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.7; A.c.stroke(); }
    return z + h;
  }
  // a vertical wheel (treadwheel, water wheel); axis 'x' => its plane runs along x
  function vwheel(cx, cy, z0, rr, axis = 'x', col = '#7a5434', spokes = 8, lw = 2) {
    const pt = (t, f = 1) => P(cx + (axis === 'x' ? rr * f * Math.cos(t) : 0), cy + (axis === 'y' ? rr * f * Math.cos(t) : 0), z0 + rr * f * 26 * Math.sin(t));
    const ring = f => { A.c.beginPath(); for (let k = 0; k <= 28; k++) { const p = pt(k / 28 * TAU, f); k ? A.c.lineTo(...p) : A.c.moveTo(...p); } A.c.strokeStyle = A.F(col); A.c.lineWidth = lw; A.c.stroke(); };
    ring(1); ring(0.82);
    const c0 = P(cx, cy, z0);
    for (let k = 0; k < spokes; k++) line(c0, pt(k / spokes * TAU + 0.2, 0.9), shade(col, -0.15), 0.8);
    circ(c0[0], c0[1], 1.4, '#3a2a20', null);
  }
  function shield(px, py, col, s = 1, charge = 0) {
    poly([[px - 3 * s, py - 3.5 * s], [px + 3 * s, py - 3.5 * s], [px + 3 * s, py], [px, py + 4 * s], [px - 3 * s, py]], col, A.OUT, 0.6);
    if (charge === 0) poly([[px - 3 * s, py - 1 * s], [px, py - 3 * s], [px + 3 * s, py - 1 * s], [px + 3 * s, py + 0.3 * s], [px, py - 1.7 * s], [px - 3 * s, py + 0.3 * s]], GOLD, null);
    else if (charge === 1) poly([[px - 0.8 * s, py - 3.5 * s], [px + 0.8 * s, py - 3.5 * s], [px + 0.8 * s, py + 3 * s], [px - 0.8 * s, py + 3 * s]], '#f6eedc', null);
    else circ(px, py - 0.6 * s, 1.3 * s, GOLD, null);
  }
  function pikeRack(gx, gy, alongX = true, n = 4) {
    const a = P(gx, gy), b = alongX ? P(gx + 0.35, gy) : P(gx, gy + 0.35);
    line(a, [a[0], a[1] - 7], '#5a4030', 1); line(b, [b[0], b[1] - 7], '#5a4030', 1); line([a[0], a[1] - 6], [b[0], b[1] - 6], '#5a4030', 1);
    for (let k = 0; k < n; k++) { const m = lerp(a, b, (k + 0.5) / n); line([m[0], m[1] + 1], [m[0] + 1, m[1] - 20], '#7a5a3a', 0.8); poly([[m[0] + 0.3, m[1] - 20], [m[0] + 1.7, m[1] - 20], [m[0] + 1.2, m[1] - 24]], '#d8dce2', null); }
  }
  function target(gx, gy) { const [x, y] = P(gx, gy); line([x - 2, y], [x, y - 9], '#6a4a30', 1); line([x + 2, y], [x, y - 9], '#6a4a30', 1); circ(x, y - 9, 4.2, '#e6d49a', A.OUT); circ(x, y - 9, 2.7, '#c0392b', null); circ(x, y - 9, 1, '#f6eedc', null); }
  function horse(gx, gy, flip = 1, col) { A.animal(gx, gy, 'horse', flip); if (col) { const [x, y] = P(gx, gy); poly([[x - 3, y - 9], [x + 3, y - 9], [x + 3.5, y - 5], [x - 3.5, y - 5]], col, null); } }
  function well(gx, gy) {
    A.cyl(gx, gy, 0.16, 0, 5, STONE, A.SNOW ? '#e8eef0' : '#4f7f9a');
    const a = P(gx - 0.14, gy), b = P(gx + 0.14, gy);
    line([a[0], a[1] - 4], [a[0], a[1] - 13], '#6a4a30', 1.1); line([b[0], b[1] - 4], [b[0], b[1] - 13], '#6a4a30', 1.1);
    poly([[a[0] - 2, a[1] - 12], [b[0] + 2, b[1] - 12], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 17]], roofOf().col);
    line([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 11], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 6], '#4a3020', 0.6);
  }
  // a dormer on the front slope of an 'x' gable over box b, at u along x
  function dormer(b, rh, u, m, ww = 0.26, axis = 'x') {
    const zb = b.z + b.h, zf = zb + rh * 0.18, hh = 5.5;
    // at(along, out, z): along = position along the eave, out = distance outward from the front wall
    const at = axis === 'x' ? (a, o, z) => P(b.x + a, b.y + b.d + 0.02 + o, z) : (a, o, z) => P(b.x + b.w + 0.02 + o, b.y + a, z);
    const ua = u - ww / 2, ub = u + ww / 2;
    poly([at(ua, 0, zf), at(ub, 0, zf), at(ub, 0, zf + hh), at(ua, 0, zf + hh)], mix(b.col || '#f1e8d6', '#ffffff', 0.15));
    A.lamp([at(ua + 0.07, 0, zf + 1), at(ub - 0.07, 0, zf + 1), at(ub - 0.07, 0, zf + hh - 0.8), at(ua + 0.07, 0, zf + hh - 0.8)], '#4b5a6b', A.nightGlass());
    const rc = A.SNOW ? '#eef2f4' : m.col;
    poly([at(ua - 0.04, 0.03, zf + hh), at(u, 0.03, zf + hh + 4.5), at(u, -0.32, zf + hh + 6.5), at(ua - 0.04, -0.32, zf + hh + 2)], shade(rc, -0.2));
    poly([at(u, 0.03, zf + hh + 4.5), at(ub + 0.04, 0.03, zf + hh), at(ub + 0.04, -0.32, zf + hh + 2), at(u, -0.32, zf + hh + 6.5)], axis === 'x' ? rc : shade(rc, -0.1));
  }
  // a little open bell-cote / cupola on a roof ridge at (gx, gy, z)
  function cupola(gx, gy, z, s = 0.16, h = 7, withBell = true, cap = 'cone') {
    const b = box(gx - s, gy - s, 2 * s, 2 * s, z, h, '#efe6d2');
    for (const side of ['L', 'R']) { const f = side === 'L' ? A.onL : A.onR; poly(f(b, s * 0.45, s * 1.55, 1.2, h - 1.2), '#2e2620', null); }
    if (withBell) { const p = A.onL(b, s, s, h * 0.5, h * 0.5)[0]; bell(p[0], p[1], 1.6); }
    const zt = cap === 'cone' ? A.cone(gx, gy, s * 1.35, z + h, h * 1.1, roofOf(true).col) : spire({ x: gx - s - 0.03, y: gy - s - 0.03, w: 2 * s + 0.06, d: 2 * s + 0.06, z: z + h, h: 0, col: '#efe6d2' }, h, roofOf(true).col);
    return zt;
  }
  // a generic Hearthfolk house body: one or two storeys, timber or stone, gable roof
  function house(x, y, w, d, H, o = {}) {
    const m = o.m || roofOf(o.grand), axis = o.axis || (w >= d ? 'x' : 'y'), wall = o.wall || WALLS[0], shut = o.shut || null;
    let lo = null, b;
    if (o.two) {
      const h1 = H * 0.48;
      lo = box(x, y, w, d, 0, h1, o.stone ? STONE : wall);
      if (o.stone) A.courses(lo, 3, STONE_D); else A.timber(lo, BEAM);
      b = box(x - 0.05, y - 0.05, w + 0.1, d + 0.1, h1, H - h1, wall);
      A.timber(b, BEAM);
      if (o.wins !== false) { winRow(lo, 'L', 2.5, Math.min(5, h1 - 4.5), 0.16, 0.36, o.doorL ? 0 : -1); winRow(lo, 'R', 2.5, Math.min(5, h1 - 4.5)); winRow(b, 'L', 2.2, Math.min(5, H - h1 - 4), 0.16, 0.34, -1, shut); winRow(b, 'R', 2.2, Math.min(5, H - h1 - 4), 0.16, 0.34, -1, shut); }
      if (o.door !== false) A.door(lo, 'L', o.doorU != null ? o.doorU : w * 0.2, 0.22, Math.min(8, h1 - 1), o.doorCol);
    } else {
      b = box(x, y, w, d, 0, H, o.stone ? STONE : wall);
      if (o.stone) A.courses(b, 3, STONE_D); else if (o.timber !== false) A.timber(b, BEAM);
      if (o.wins !== false) { winRow(b, 'L', H * 0.35, Math.min(5, H * 0.4), 0.16, 0.38, 0, shut); winRow(b, 'R', H * 0.35, Math.min(5, H * 0.4), 0.16, 0.38, -1, shut); }
      if (o.door !== false) A.door(b, 'L', o.doorU != null ? o.doorU : w * 0.18, 0.22, Math.min(8, H - 2), o.doorCol);
    }
    const span = axis === 'x' ? b.d : b.w, rh = o.rh || span * (o.steep || 15);
    const top = o.hip ? A.hip(b, rh, m.col, m.o, 'tile') : roof(b, rh, axis, m);
    if (o.chim) A.chimney(axis === 'x' ? b.x + b.w * 0.8 : b.x + b.w * 0.25, axis === 'x' ? b.y + b.d * 0.25 : b.y + b.d * 0.2, b.z + b.h + rh * 0.3, rh * 0.7 + 3, o.chim, o.chimCol || (stoneOK() ? '#8a7f74' : '#9a5a42'));
    return { top, b, lo, rh: rh * m.k, axis, m };
  }

  // =====================================================================
  //  COTTAGE  (slot [gx, gy, 1.3, 1.2]; ctx.i varies each home)
  // =====================================================================
  reg('cottage', ([x, y], L, band, ctx) => {
    // ctx.wet: a fisher home raised on a pile deck over the water (slot ~1.1 x 1.0) — the house only, no yard; a coil of rope and a creel
    const wet = !!ctx.wet;
    if (wet) { x -= band === 0 ? 0.12 : band === 1 ? 0.07 : 0; y -= 0.06; }
    const i = ctx.i || 0, s = sub(L, band), m = roofOf(false, i), wall = WALLS[i % 4];
    const creel = () => { if (!wet) return; const [rx, ry] = P(x + (band === 0 ? 1.12 : 1.02), y + 0.94); A.c.beginPath(); A.c.ellipse(rx, ry - 1, 2.6, 1.3, 0, 0, Math.PI * 2); A.c.strokeStyle = A.F('#cdbf98'); A.c.lineWidth = 1.1; A.c.stroke(); A.c.beginPath(); A.c.ellipse(rx, ry - 1.4, 1.4, 0.7, 0, 0, Math.PI * 2); A.c.stroke(); A.crate(x + 0.2, y + 0.92, 0.16, 2); };
    const ax = i % 2 ? 'x' : 'y', shut = ['#3f6fa8', '#5e8f3e', '#a8482f', '#6a4a8a'][(i + 1) % 4];
    const stone = X.tech('masonry') || band >= 2;
    let top = 0;
    if (band === 0) { // a low cob cottage under a heavy thatch, a veg patch and a woodpile
      if (!wet) vegBed(x + 0.08, y + 0.9, 0.5, 0.22);
      if (s >= 1 && !wet) woodpile(x + 0.05, y + 0.15, 0.3);
      const b = box(x + 0.3, y + 0.15, 0.8, 0.66, 0, 9, wall);
      A.door(b, 'L', 0.25, 0.2, 7, '#6b3e22');
      shutterWin(b, 'L', 0.58, 3, 0.15, 3.6, s >= 2, shut);
      A.win(b, 'R', 0.33, 3.5, 0.14, 3.4);
      top = roof(b, ax === 'x' ? 11 : 12, ax, m, { o: 0.19 });
      if (s >= 1) A.chimney(ax === 'x' ? b.x + 0.6 : b.x + 0.25, ax === 'x' ? b.y + 0.2 : b.y + 0.15, b.z + b.h + 4, 6, 'house', '#9a7a62');
      if (wet) { creel(); return top; }
      if (s >= 3) hedge([x + 0.05, y + 1.15], [x + 0.62, y + 1.15], 2, 0.16);
      if (s >= 2) chickens(x + 1.0, y + 1.0, 2);
      return top;
    }
    if (band === 1) { // half-timbered, shuttered, a picket garden and a beehive
      if (!wet) { vegBed(x + 0.06, y + 0.92, 0.42, 0.22); woodpile(x + 0.02, y + 0.12, 0.28); }
      const b = box(x + 0.22, y + 0.1, 0.95, 0.74, 0, 11, wall);
      A.timber(b, BEAM);
      A.door(b, 'L', 0.26, 0.2, 8, ['#6b3e22', '#3f6fa8', '#5e8f3e', '#8a3a2a'][i % 4]);
      shutterWin(b, 'L', 0.68, 4, 0.16, 4, true, shut);
      shutterWin(b, 'R', 0.4, 4, 0.16, 4, s >= 2, shut);
      top = roof(b, 12, ax, m);
      A.chimney(ax === 'x' ? b.x + b.w * 0.75 : b.x + b.w * 0.28, ax === 'x' ? b.y + b.d * 0.3 : b.y + b.d * 0.2, b.z + b.h + 4, 7, 'house', stone ? '#8a7f74' : '#9a5a42');
      if (wet) { creel(); return top; }
      picket([x + 0.52, y + 1.17], [x + 1.25, y + 1.17]); picket([x + 1.25, y + 0.92], [x + 1.25, y + 1.17]);
      if (s >= 1) waterButt(x + 1.2, y + 0.82);
      if (s >= 3) beehive(x + 0.95, y + 1.02);
      if (s >= 2 && i % 3 === 0) chickens(x + 0.6, y + 1.0, 3);
      return top;
    }
    // band 2+: two storeys with a jettied, timbered upper floor; band 3 adds a side wing and a hedged garden
    if (band >= 3 && !wet) {
      const wb = box(x + 0.05, y + 0.1, 0.42, 0.58, 0, 9, stone ? STONE : wall);
      if (stone) A.courses(wb, 3, STONE_D);
      A.win(wb, 'L', 0.2, 3, 0.14, 3.6);
      roof(wb, 8, 'y', m);
    }
    const bx = wet ? x + 0.1 : band >= 3 ? x + 0.4 : x + 0.2, bw = wet ? 0.88 : band >= 3 ? 0.84 : 0.95;
    const lo = box(bx, y + 0.12, bw, 0.72, 0, 8, stone ? STONE : wall);
    if (stone) A.courses(lo, 2.7, STONE_D);
    A.door(lo, 'L', 0.24, 0.2, 7, ['#6b3e22', '#3f6fa8', '#5e8f3e', '#8a3a2a'][i % 4]);
    if (X.era >= 2) { A.win(lo, 'L', 0.62, 1.8, 0.28, 4.4); poly(A.onL(lo, 0.46, 0.78, 6.4, 7.4), '#7a5232', null); } else A.win(lo, 'L', 0.62, 2.5, 0.2, 3.5);
    A.win(lo, 'R', 0.4, 2.5, 0.18, 3.5);
    const up = box(bx - 0.05, y + 0.07, bw + 0.1, 0.82, 8, 8, wall);
    A.timber(up, BEAM);
    shutterWin(up, 'L', 0.3, 2, 0.15, 4, true, shut); shutterWin(up, 'L', 0.75, 2, 0.15, 4, true, shut);
    shutterWin(up, 'R', 0.42, 2, 0.15, 4, s >= 1, shut);
    const ux = i % 3 === 2 ? 'y' : 'x';   // some homes turn their gable to the street
    top = roof(up, ux === 'x' ? 13 : 14, ux, m);
    if (X.era >= 1 || s >= 2) dormer(up, 13 * m.k, (ux === 'x' ? up.w : up.d) * 0.5, m, 0.24, ux);
    if (ux === 'x') A.chimney(up.x + up.w * 0.82, up.y + up.d * 0.28, up.z + up.h + 5, 7, 'house', stone ? '#8a7f74' : '#9a5a42');
    else A.chimney(up.x + up.w * 0.25, up.y + up.d * 0.15, up.z + up.h + 5, 8, 'house', stone ? '#8a7f74' : '#9a5a42');
    const [lx, ly] = P(bx + 0.06, y + 0.88, 9); A.lantern(lx, ly, 1.2);
    if (wet) { creel(); return top; }
    if (band >= 3) {
      hedge([x + 0.02, y + 1.15], [x + 0.55, y + 1.15], 2.1, 0.15); hedge([x + 0.95, y + 1.15], [x + 1.27, y + 1.15], 2.1, 0.15); hedge([x + 1.27, y + 0.95], [x + 1.27, y + 1.12], 2.1, 0.15);
      const a = P(x + 0.62, y + 1.15), b2 = P(x + 0.88, y + 1.15);
      A.c.beginPath(); A.c.moveTo(a[0], a[1]); A.c.lineTo(a[0], a[1] - 8); A.c.quadraticCurveTo((a[0] + b2[0]) / 2, Math.min(a[1], b2[1]) - 15, b2[0], b2[1] - 8); A.c.lineTo(b2[0], b2[1]);
      A.c.strokeStyle = A.F(HEDGE()); A.c.lineWidth = 1.8; A.c.stroke();
      if (!A.SNOW && A.SEASON < 2) for (let k = 0; k < 4; k++) circ(a[0] + (b2[0] - a[0]) * (k + 0.5) / 4, Math.min(a[1], b2[1]) - 10 - Math.sin((k + 0.5) / 4 * Math.PI) * 3, 1, '#e85a6a', null);
      if (i % 3 === 0) dovecote(x + 1.15, y + 0.95, 0, 14); else if (i % 3 === 1) beehive(x + 1.12, y + 0.98); else A.haystack(x + 1.12, y + 0.98, 0.4);
    } else {
      picket([x + 0.45, y + 1.17], [x + 1.25, y + 1.17]); picket([x + 1.25, y + 0.95], [x + 1.25, y + 1.17]);
      if (s >= 2) { if (i % 2) beehive(x + 1.1, y + 1.0); else bench(x + 0.85, y + 1.02); }
      if (s >= 3 && i % 3 === 2) dovecote(x + 0.12, y + 1.0, 0, 13);
    }
    return top;
  });

  // =====================================================================
  //  TOWN HALL — moot hall on posts → guildhall with a bell-cote → L-shaped hall round a clock
  //  tower (in the crook, over the slot centre) on a village green with a maypole → spired tower.
  // =====================================================================
  reg('townhall', ([x, y, w, d], L, band, ctx) => {
    const s = sub(L, band), m = roofOf(true), cx = x + w / 2, cy = y + d / 2;
    if (band === 0) {
      grassPatch(x + 0.25, y + 0.25, w - 0.5, d - 0.5);
      // moot hall: the meeting room is up on oak posts, the market sits underneath
      dirt(cx - 0.62, cy - 0.47, 1.24, 0.94, '#b89a6a');
      A.sack(cx - 0.3, cy + 0.1); A.crate(cx + 0.1, cy - 0.1, 0.22);
      for (const [px, py] of [[cx - 0.55, cy + 0.4], [cx, cy + 0.4], [cx + 0.55, cy + 0.4], [cx + 0.55, cy - 0.4], [cx + 0.55, cy]]) box(px - 0.04, py - 0.04, 0.08, 0.08, 0, 8, OAK);
      const b = box(cx - 0.62, cy - 0.47, 1.24, 0.94, 8, 10, WALLS[0]);
      A.timber(b, BEAM); winRow(b, 'L', 3.5, 4, 0.15, 0.34, -1, '#a8482f'); winRow(b, 'R', 3.5, 4);
      let top = roof(b, 14, 'x', m);
      // stair to the door
      poly([P(cx - 0.62, cy + 0.47, 8), P(cx - 0.4, cy + 0.47, 8), P(cx - 0.4, cy + 0.85, 0), P(cx - 0.62, cy + 0.85, 0)], OAK);
      // bell frame
      const [bx, by] = P(x + 0.45, y + d - 0.55); line([bx - 3, by], [bx - 3, by - 17], '#6a4a30', 1.4); line([bx + 3, by], [bx + 3, by - 17], '#6a4a30', 1.4); line([bx - 4, by - 17], [bx + 4, by - 17], '#6a4a30', 1.6); bell(bx, by - 13.5);
      if (s >= 2) maypole(x + w - 0.75, y + d - 0.95, 24);
      if (s >= 1) bench(cx + 0.7, cy + 0.75);
      if (s >= 3) A.flagpole(x + w - 0.3, y + 0.35, 0, 26);
      return top;
    }
    if (band === 1) {
      grassPatch(x + 0.15, y + 1.9, w - 0.3, d - 2.0);
      grassPatch(x + 1.9, y + 0.15, w - 2.0, 1.75);
      const h = house(cx - 0.8, cy - 0.55, 1.6, 1.1, 21, { two: true, stone: stoneOK(), grand: true, axis: 'x', shut: '#a8482f', doorU: 0.8, doorCol: '#6b3e22' });
      awning(h.lo, 'L', 0.55, 1.05, 10.5, 0.18, '#a8482f', '#e0b84a');
      const top = cupola(cx, cy, h.top - 3, 0.15, 7 + s, true);
      if (X.era >= 1 || s >= 3) clock(A.onL(h.b, 0.8, 0.8, h.b.h - 1, h.b.h - 1)[0], 2.6);
      maypole(x + w - 0.65, y + d - 0.7, 26);
      well(x + 0.45, y + d - 0.5);
      if (s >= 1) bench(cx - 0.1, y + d - 0.35);
      if (s >= 2) lampPost(cx + 0.9, cy + 0.75);
      if (s >= 3) A.flagpole(x + 0.35, y + 0.35, 0, 30);
      return top;
    }
    // band 2+: an L of halls round the clock tower in the crook; the green spreads before it
    const big = band >= 3, th = (big ? 64 : 50) + s * 2.5, tw = big ? 0.74 : 0.68;
    grassPatch(x + 1.85, y + 1.85, w - 1.95, d - 1.95);
    grassPatch(x + 0.12, y + 2.1, 1.65, d - 2.2);
    const ha = house(x + 0.2, y + 0.2, 1.75, 0.8, big ? 24 : 21, { two: true, stone: true, grand: true, axis: 'x', shut: '#a8482f', door: false });
    if (big) for (let k = 0; k < 3; k++) { const u = 0.35 + k * 0.5; poly(A.onL(ha.lo, u - 0.12, u + 0.12, 0, 7), '#3a2e26', null); }
    const hb = house(x + 0.2, y + 1.0, 0.8, big ? 1.6 : 1.3, big ? 24 : 21, { two: true, stone: true, grand: true, axis: 'y', shut: '#a8482f', doorU: 0.4 });
    if (big) A.chimney(hb.b.x + 0.2, hb.b.y + 0.4, hb.b.z + hb.b.h + 4, 12, 'hall');
    // the tower over the slot centre
    const tx = cx - tw / 2, ty = cy - tw / 2;
    const tb = box(tx, ty, tw, tw, 0, th, STONE);
    A.courses(tb, 4, STONE_D);
    A.door(tb, 'L', tw / 2, 0.26, 10, '#5a3420'); poly(A.onL(tb, tw / 2 - 0.17, tw / 2 + 0.17, 10, 11.5), STONE_D, null);
    A.win(tb, 'L', tw / 2, th * 0.4, 0.12, 6); A.win(tb, 'R', tw / 2, th * 0.4, 0.12, 6);
    // clock stage
    const ck = th - 12;
    if (X.era >= 1 || big) { clock(A.onL(tb, tw / 2, tw / 2, ck, ck)[0], 3.6); clock(A.onR(tb, tw / 2, tw / 2, ck, ck)[0], 3.6); }
    // belfry
    const bf = box(tx - 0.03, ty - 0.03, tw + 0.06, tw + 0.06, th, 9, '#d8cfbf');
    for (const side of ['L', 'R']) { const f = side === 'L' ? A.onL : A.onR; for (const u of [0.22, 0.52]) { poly(f(bf, u * (tw / 0.74) - 0.08, u * (tw / 0.74) + 0.08, 1.5, 7.5), '#2a2420', null); } const p = f(bf, (tw + 0.06) * 0.5, 0, 4, 0)[0]; bell(p[0], p[1], 1.8); }
    let top;
    if (big) {
      top = spire({ x: tx - 0.08, y: ty - 0.08, w: tw + 0.16, d: tw + 0.16, z: th + 9, h: 0, col: STONE }, 30 + s * 2, X.era >= 2 ? SLATE : m.col);
      top = weathercock(cx, cy, top);
    } else top = spire({ x: tx - 0.08, y: ty - 0.08, w: tw + 0.16, d: tw + 0.16, z: th + 9, h: 0, col: STONE }, 14, m.col) + 2;
    // the green
    if (big && X.tech('architecture')) { // stone fountain
      const gx = x + w - 0.62, gy = y + d - 0.62; A.cyl(gx, gy, 0.3, 0, 4, STONE, A.SNOW ? '#dfe8ee' : '#5f9fc8'); A.cyl(gx, gy, 0.06, 4, 8, STONE); A.cyl(gx, gy, 0.14, 12, 2, STONE, A.SNOW ? '#dfe8ee' : '#7fbfe0');
      if (!A.SNOW) A.rec('sparks', { x: P(gx, gy, 14)[0], y: P(gx, gy, 14)[1] + 6, kind: 'water', rx: 7, ry: 3 });
    } else maypole(x + w - 0.62, y + d - 0.62, 28);
    flowers(x + 1.95, y + 1.95, 0.6, 0.5, 6);
    bench(x + 0.5, y + d - 0.35); if (s >= 1) bench(x + 1.95, y + 1.95);
    lampPost(x + 1.85, y + d - 0.2); if (s >= 2) lampPost(x + w - 0.2, y + 1.85);
    if (big) { A.banner(x + 0.25, y + d - 0.2, 0, 30, '#c0392b'); A.banner(x + w - 0.2, y + 0.3, 0, 30, '#e0b84a'); }
    return top;
  });

  // =====================================================================
  //  FARM — a homestead barn with haystacks, pens and dovecotes; the fields are drawn by cityview
  // =====================================================================
  reg('farm', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2;
    const bw = Math.min(band >= 3 ? 1.5 : 1.3, w * 0.55), bd = Math.min(0.85, d * 0.38);
    dirt(x + 0.2, y + 0.2, w - 0.4, d - 0.4, '#c8b07e');
    // behind the barn: dovecote, well, haystacks (clear of the granary marks at x+w-0.3)
    if (band >= 2) roundDovecote(x + 0.42, y + 0.42, band >= 3 ? 0.3 : 0.24, band >= 3 ? 22 : 17);
    else if (band === 1) dovecote(x + 0.4, y + 0.4, 0, 16);
    if (X.tech('irrigation')) well(cx - 0.1, y + 0.3);
    const hayN = Math.min(3, 1 + band + (s >= 2 ? 1 : 0));
    for (let k = 0; k < hayN; k++) A.haystack(Math.min(cx + bw / 2 + 0.15, x + w - 0.75) + (k % 2) * 0.22, y + 0.3 + k * 0.16, 0.55 + band * 0.06);
    // the barn, centred
    let top;
    if (band === 0) {
      const b = box(cx - bw * 0.4, cy - bd * 0.45, bw * 0.8, bd * 0.9, 0, 9, '#b08a5a');
      for (let k = 1; k < 8; k++) { const u = b.w * k / 8; line(A.onL(b, u, u, 0, 0)[0], A.onL(b, u, u, 9, 9)[0], '#8a6a3a', 0.5); }
      poly(A.onL(b, b.w * 0.3, b.w * 0.7, 0, 7), '#4a3424', null);
      top = roof(b, 13, 'x', m, { o: 0.2 });
    } else {
      const big = band >= 3, wall = big && stoneOK() ? STONE : BARN;
      const b = box(cx - bw / 2, cy - bd / 2, bw, bd, 0, big ? 15 : 12, wall);
      if (wall === STONE) { A.courses(b, 3.5, STONE_D); for (const k of [1, 2, 4, 5]) box(b.x + b.w * k / 6 - 0.05, b.y + b.d, 0.1, 0.08, 0, 9, STONE); }
      else for (let k = 1; k < 9; k++) { const u = b.w * k / 9; line(A.onL(b, u, u, 0, 0)[0], A.onL(b, u, u, b.h, b.h)[0], shade(BARN, -0.2), 0.6); }
      // big double doors with a white cross brace and a hayloft hatch
      const dq = A.onL(b, b.w * 0.38, b.w * 0.62, 0, b.h * 0.72); poly(dq, '#5a2e20', '#f0e6d0', 1);
      line(dq[0], dq[2], '#f0e6d0', 0.8); line(dq[1], dq[3], '#f0e6d0', 0.8); line(lerp(dq[0], dq[1], 0.5), lerp(dq[3], dq[2], 0.5), '#f0e6d0', 0.8);
      top = roof(b, big ? 18 : 15, 'x', m);
      const hq = A.onR(b, b.d * 0.35, b.d * 0.65, b.h + 1, b.h + 5); poly(hq, '#4a2a1a', '#f0e6d0', 0.7);
      if (big) { A.lantern(...A.onL(b, b.w * 0.25, 0, 7, 0)[0], 1.2); top = cupola(cx, cy, top - 3, 0.1, 5, false); }
      if (s >= 2 || big) { const p = A.onR(b, b.d * 0.5, 0, b.h + 7, 0)[0]; line(p, [p[0] + 6, p[1] - 3], '#5a3a22', 1.2); line([p[0] + 6, p[1] - 3], [p[0] + 6, p[1] + 6], '#3a2a20', 0.5); }
    }
    // pens in the front-left corner
    const px = x + 0.18, py = y + d - 0.85, pw = Math.min(0.85, w * 0.36), pd = 0.6;
    rail([px, py], [px + pw, py], 4); rail([px, py], [px, py + pd], 4);
    if (band === 0) { pig(px + 0.3, py + 0.35); if (s >= 1) pig(px + 0.6, py + 0.25); chickens(px + 0.35, py + 0.6, 2); }
    else if (band === 1) { cow(px + 0.35, py + 0.35, 1); if (s >= 1) cow(px + 0.65, py + 0.5, -1); chickens(x + w * 0.45, y + d - 0.4, 3); }
    else { sheep(px + 0.25, py + 0.3); sheep(px + 0.55, py + 0.45); cow(px + 0.6, py + 0.18, -1); if (band >= 3) sheep(px + 0.3, py + 0.55); }
    rail([px, py + pd], [px + pw, py + pd], 4); rail([px + pw, py], [px + pw, py + pd], 4);
    if (band >= 2) cart(Math.min(cx + bw * 0.5, x + w - 0.9), cy + bd * 0.55, true, A.SEASON === 2 ? 'hay' : 'sacks');
    if (band >= 3 || (band >= 1 && s >= 3)) scarecrow(x + w * 0.55, y + d - 0.3);
    return top;
  });

  // =====================================================================
  //  LUMBER — woodcutter's cabin → saw-pit shed → sawmill barn with an A-frame crane → drying sheds
  // =====================================================================
  reg('lumber', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2, alongX = w >= d;
    dirt(x + 0.25, y + 0.25, w - 0.5, d - 0.5, '#b09068');
    // woods behind
    A.treePine(x + 0.25, y + 0.3, 0.9); A.treePine(x + (alongX ? 1.0 : 0.3), y + (alongX ? 0.2 : 1.1), 0.8);
    if (band < 2) A.treePine(x + w - 0.35, y + 0.3, 0.85);
    for (let k = 0; k < 2 + band; k++) A.stump(x + 0.4 + ((k * 0.37) % 1) * (w - 0.8), y + d * 0.68 + ((k * 0.61) % 1) * 0.3);
    let top;
    // log piles along the long side
    const lp = alongX ? [x + 0.3, y + d - 0.55] : [x + w - 0.95, y + 0.4];
    A.logPile(lp[0], lp[1], 0.6, Math.min(4, 2 + band));
    if (band === 0) {
      const b = box(cx - 0.4, cy - 0.32, 0.8, 0.64, 0, 9, '#8a6440');
      for (let v = 1.5; v < 9; v += 1.8) { line(A.onL(b, 0, 0, v, v)[0], A.onL(b, b.w, 0, v, v)[0], '#5a3a22', 0.6); line(A.onR(b, 0, 0, v, v)[0], A.onR(b, b.d, 0, v, v)[0], '#5a3a22', 0.6); }
      A.door(b, 'L', 0.22, 0.2, 7, '#4a3020'); A.win(b, 'R', 0.32, 3.5, 0.14, 3);
      top = roof(b, 11, 'x', m);
      A.chimney(b.x + 0.6, b.y + 0.15, b.z + b.h + 3, 6, 'house', '#8a7a6a');
      // chopping block with an axe
      const [kx, ky] = P(cx + 0.65, cy + 0.55); A.cyl(cx + 0.65, cy + 0.55, 0.1, 0, 4, '#7a5434', '#c9a874'); line([kx, ky - 4], [kx + 3, ky - 9], '#6a4a30', 1); poly([[kx + 2, ky - 9.5], [kx + 4.5, ky - 10], [kx + 3.5, ky - 7.5]], '#c8ccd2', null);
      if (s >= 2) woodpile(cx + 0.45, cy - 0.5, 0.35);
      return top;
    }
    if (band === 1) { // a cabin plus an open saw-pit shed (over the slot centre)
      const hb = box(x + 0.3, y + 0.75, 0.6, 0.55, 0, 9, '#8a6440');
      for (let v = 1.5; v < 9; v += 1.8) line(A.onL(hb, 0, 0, v, v)[0], A.onL(hb, hb.w, 0, v, v)[0], '#5a3a22', 0.6);
      A.door(hb, 'L', 0.2, 0.18, 7, '#4a3020'); roof(hb, 10, 'y', m);
      // saw shed
      const sw = 1.0, sd = 0.6;
      dirt(cx - sw / 2, cy - sd / 2, sw, sd, '#d8c090');
      for (const [px, py] of [[cx - sw / 2, cy - sd / 2], [cx + sw / 2, cy - sd / 2], [cx - sw / 2, cy + sd / 2], [cx + sw / 2, cy + sd / 2]]) box(px - 0.04, py - 0.04, 0.08, 0.08, 0, 11, OAK);
      A.log(cx - 0.4, cx + 0.45, cy, 4, 2);
      A.person(...P(cx + 0.1, cy + 0.2), '#5e7f9e', 0.8);
      top = roof({ x: cx - sw / 2, y: cy - sd / 2, w: sw, d: sd, z: 11, h: 0, col: '#8a6440' }, 9, 'x', m);
      if (s >= 2) woodpile(x + w - 0.6, y + d - 0.5, 0.4);
      return top;
    }
    // band 2+: a plank-walled sawmill barn with stacks of sawn boards and an A-frame log crane
    const big = band >= 3;
    const bw = alongX ? 1.3 : 0.85, bd = alongX ? 0.85 : 1.3;
    const b = box(cx - bw / 2, cy - bd / 2, bw, bd, 0, big ? 15 : 13, '#9a6a3c');
    const n = Math.round((alongX ? bw : bd) / 0.1);
    for (let k = 1; k < n; k++) { const u = (alongX ? bw : bd) * k / n; const f = alongX ? A.onL : A.onR; line(f(b, u, u, 0, 0)[0], f(b, u, u, b.h, b.h)[0], '#7a5230', 0.5); }
    if (alongX) { poly(A.onL(b, bw * 0.3, bw * 0.7, 0, b.h * 0.75), '#3a2a1e', null); A.log(cx - 0.3, cx + 0.35, cy + bd / 2 + 0.05, 3, 1.8); }
    else { poly(A.onR(b, bd * 0.3, bd * 0.7, 0, b.h * 0.75), '#3a2a1e', null); }
    top = roof(b, big ? 16 : 14, alongX ? 'x' : 'y', m);
    if (big) top = cupola(cx, cy, top - 3, 0.1, 5, false);
    // board stacks
    const bs = alongX ? [x + w - 0.9, y + 0.35] : [x + 0.3, y + d - 0.9];
    for (let k = 0; k < 2 + (big ? 2 : 0); k++) box(bs[0] + (alongX ? 0 : k * 0.18), bs[1] + (alongX ? k * 0.15 : 0), alongX ? 0.55 : 0.14, alongX ? 0.12 : 0.55, 0, 3 + k % 2 * 2, '#d8b47a');
    // A-frame crane over a log
    const ax = alongX ? cx + bw / 2 + 0.25 : cx - 0.2, ay = alongX ? cy - 0.1 : cy + bd / 2 + 0.25;
    const ap = P(ax, ay, 26), a1 = P(ax - 0.2, ay - 0.15), a2 = P(ax + 0.2, ay + 0.15);
    line(a1, ap, '#6a4a30', 1.8); line(a2, ap, '#6a4a30', 1.8); line(ap, [ap[0] + 10, ap[1] + 4], '#6a4a30', 1.4); line([ap[0] + 10, ap[1] + 4], [ap[0] + 10, ap[1] + 16], '#3a2a20', 0.6);
    A.log(ax + 0.15, ax + 0.75, ay + 0.3, 3, 1.8);
    if (big) { // drying shed of slatted boards and a log cart
      const ds = alongX ? [x + 0.25, y + 0.25, 0.7, 0.55] : [x + 0.25, y + 0.25, 0.55, 0.7];
      const db = box(ds[0], ds[1], ds[2], ds[3], 0, 11, '#b08a5a');
      for (let k = 1; k < 6; k++) { const v = k * 1.8; line(A.onL(db, 0, 0, v, v)[0], A.onL(db, db.w, 0, v, v)[0], '#6a4a2a', 0.7); line(A.onR(db, 0, 0, v, v)[0], A.onR(db, db.d, 0, v, v)[0], '#6a4a2a', 0.7); }
      roof(db, 9, alongX ? 'x' : 'y', m);
      cart(x + w * 0.6, y + d - 0.6, alongX, 'logs');
      if (!A.SNOW) horse(x + w * 0.6 + (alongX ? 0.85 : 0.15), y + d - 0.45, 1);
    }
    if (s >= 2) A.lantern(...A.onL(b, 0.12, 0, 9, 0)[0], 1.2);
    return top;
  });

  // =====================================================================
  //  QUARRY — a cut rock face with terraces; shear legs → a great treadwheel crane → twin cranes
  // =====================================================================
  reg('quarry', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2, alongX = w >= d;
    const RK = '#aaa294', RK2 = '#8e8678';
    dirt(x + 0.1, y + 0.1, w - 0.2, d - 0.2, '#cfc6b4');
    // the pit: opening in the back two-thirds, terraces stepping down inside it
    const steps = 1 + Math.min(3, band + (s >= 3 ? 1 : 0)), D = 7;
    const ox = x + 0.2, oy = y + 0.2, ow = alongX ? w - 0.5 : w * 0.62, od = alongX ? d * 0.62 : d - 0.5;
    A.c.save(); A.path(A.quad(ox, oy, ow, od)); A.c.clip();
    for (let k = 0; k <= steps; k++) {
      const z = -D * k, o = 0.16 * k;
      const fx0 = ox + o, fy0 = oy + o;
      poly(A.quad(fx0, fy0, ow + 0.4, od + 0.4, z), k === steps ? (A.SNOW ? '#d8dcde' : '#8a8274') : shade(RK, -0.05 * k), null);
      if (k < steps) { // the cut faces of the next step down (back and left walls)
        poly([P(fx0 + 0.16, fy0 + 0.16, z), P(ox + ow + 0.4, fy0 + 0.16, z), P(ox + ow + 0.4, fy0 + 0.16, z - D), P(fx0 + 0.16, fy0 + 0.16, z - D)], shade(RK, -0.12 - 0.05 * k), A.OUT, 0.5);
        poly([P(fx0 + 0.16, fy0 + 0.16, z), P(fx0 + 0.16, oy + od + 0.4, z), P(fx0 + 0.16, oy + od + 0.4, z - D), P(fx0 + 0.16, fy0 + 0.16, z - D)], shade(RK2, -0.2 - 0.05 * k), A.OUT, 0.5);
        for (let j = 1; j < 4; j++) line(P(fx0 + 0.16 + j * 0.5, fy0 + 0.16, z), P(fx0 + 0.16 + j * 0.5, fy0 + 0.16, z - D), shade(RK, -0.3), 0.5);
      }
    }
    // a block being cut on the bottom
    box(ox + 0.16 * steps + 0.3, oy + 0.16 * steps + 0.3, 0.25, 0.2, -D * steps, 5, '#d8d0c0');
    A.c.restore();
    // the rim: a rock lip along the back edges, rubble at the side
    for (let k = 0; k < 3; k++) A.rock(alongX ? x + 0.4 + k * (w - 0.8) / 2 : x + 0.12, alongX ? y + 0.12 : y + 0.4 + k * (d - 0.8) / 2, 0.45 + (k % 2) * 0.15, k % 2 ? RK : RK2);
    A.rock(alongX ? x + w - 0.25 : x + 0.3, alongX ? y + 0.3 : y + d - 0.3, 0.7, RK2);
    // the rim in front of the pit, where the cranes stand and the blocks are stacked
    const rx = alongX ? cx : ox + ow + 0.12, ry = alongX ? oy + od + 0.12 : cy;   // rim centre
    const nb = 2 + band + Math.min(2, s);
    for (let k = 0; k < nb; k++) {
      const t = (k + 0.5) / nb, bx = alongX ? x + 0.35 + t * (w - 1.0) : rx + 0.2 + (k % 2) * 0.25, by = alongX ? ry + 0.2 + (k % 2) * 0.22 : y + 0.35 + t * (d - 1.0);
      if (Math.hypot(bx - rx, by - ry) < 0.45) continue;
      box(bx, by, 0.22, 0.18, 0, 5, k % 2 ? STONE : '#d8d0c0'); if (k % 3 === 0) box(bx + 0.02, by + 0.02, 0.16, 0.14, 5, 4, STONE);
    }
    // where the hook hangs: over the pit, just behind the rim
    const hx = alongX ? rx : rx - 0.55, hy = alongX ? ry - 0.55 : ry;
    let top;
    if (band === 0) { // a ladder into the pit, a sledge with a block, a pick
      const l0 = P(hx, hy, -D), l1 = P(rx, ry, 2); line([l0[0] - 2, l0[1]], [l1[0] - 2, l1[1]], '#6a4a30', 1); line([l0[0] + 2, l0[1]], [l1[0] + 2, l1[1]], '#6a4a30', 1);
      const [sx, sy] = P(rx + 0.3, ry + 0.25); line([sx - 8, sy], [sx + 6, sy - 3], '#6a4a30', 1.4); line([sx - 8, sy + 2], [sx + 6, sy - 1], '#6a4a30', 1.4);
      box(rx + 0.15, ry + 0.1, 0.28, 0.2, 1, 5, '#d8d0c0');
      A.person(...P(rx - 0.2, ry + 0.2), '#7a5a3a', 0.8);
      top = 14;
    } else if (band === 1) { // shear legs on the rim, the block swinging up out of the pit
      const tp = P(hx, hy, 30), l1 = P(rx - 0.25, ry + 0.2), l2 = P(rx + 0.25, ry + 0.2), l3 = P(hx, hy, -D);
      line(l1, tp, '#6a4a30', 2); line(l2, tp, '#6a4a30', 2); line(l3, tp, '#6a4a30', 1.4);
      line(tp, [tp[0], tp[1] + 22], '#3a2a20', 0.7); box(hx - 0.1, hy - 0.1, 0.2, 0.18, 4, 5, '#d8d0c0');
      const lb = box(alongX ? x + w - 0.75 : x + 0.25, alongX ? y + d - 0.6 : y + d - 0.75, alongX ? 0.5 : 0.4, alongX ? 0.4 : 0.5, 0, 8, '#9a7a52');
      roof(lb, 7, alongX ? 'x' : 'y', m);
      top = 30;
    } else { // a great treadwheel crane on the rim, its jib reaching out over the pit
      const big = band >= 3, ax = alongX ? 'x' : 'y', r = big ? 0.42 : 0.36;
      box(rx - 0.12, ry - 0.12, 0.24, 0.24, 0, 4, '#7a5434');
      vwheel(rx, ry + (alongX ? 0.05 : 0), 4 + r * 26, r, ax, '#7a5434', 10, 2.4);
      const jt = P(hx, hy, 46 + band * 3);
      line(P(rx, ry, 6), jt, '#6a4a30', 2.4); line(P(rx, ry, 4 + r * 26), jt, '#6a4a30', 1.2);
      line(jt, [jt[0], jt[1] + 34], '#3a2a20', 0.7); box(hx - 0.1, hy - 0.1, 0.22, 0.2, 10, 5, '#d8d0c0');
      A.person(...P(rx, ry + 0.02, 4), '#7a5a3a', 0.7);
      // masons' lodge at the side of the rim
      const lw = alongX ? 0.75 : 0.55, ld = alongX ? 0.55 : 0.75;
      const lx = alongX ? x + w - lw - 0.2 : x + 0.2, ly = alongX ? y + d - ld - 0.25 : y + d - ld - 0.2;
      house(lx, ly, lw, ld, 10, { m, wall: WALLS[1], chim: big ? 'house' : null, steep: 13 });
      if (big) { // second crane at the far end, and a stone cart
        const qx = alongX ? x + 0.55 : rx, qy = alongX ? ry : y + 0.55, q2x = alongX ? qx : qx - 0.5, q2y = alongX ? qy - 0.5 : qy;
        const tp = P(q2x, q2y, 30); line(P(qx - 0.2, qy + 0.15), tp, '#6a4a30', 1.8); line(P(qx + 0.2, qy + 0.15), tp, '#6a4a30', 1.8); line(tp, [tp[0], tp[1] + 26], '#3a2a20', 0.6);
        cart(alongX ? cx + 0.55 : rx + 0.2, alongX ? ry + 0.25 : cy + 0.55, alongX, 'stone');
      }
      top = 46 + band * 3;
    }
    return top;
  });

  // =====================================================================
  //  MINE — a timbered adit in the hill; bell-pit windlass → ore carts on rails → horse gin → engine house
  // =====================================================================
  reg('mine', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf();
    const mx = x + w * 0.35, my = y + d - 0.05, [px, py] = P(mx, my);
    const H = 15 + band * 2, W2 = 7 + band;
    // the dark mouth with an oak portal and a little roof
    poly([[px - W2, py], [px - W2, py - H * 0.75], [px, py - H], [px + W2, py - H * 0.75], [px + W2, py]], '#1f1a17', null);
    const fc = stoneOK() && band >= 2 ? STONE_D : '#6a4a30';
    line([px - W2, py], [px - W2, py - H * 0.78], fc, 2.6); line([px + W2, py], [px + W2, py - H * 0.78], fc, 2.6); line([px - W2 - 3, py - H * 0.78], [px + W2 + 3, py - H * 0.78], fc, 3);
    const rc = A.SNOW ? '#eef2f4' : m.col;
    poly([[px - W2 - 5, py - H * 0.78], [px, py - H - 7], [px + W2 + 5, py - H * 0.78], [px + W2 + 5, py - H * 0.78 - 2.5], [px, py - H - 9.5], [px - W2 - 5, py - H * 0.78 - 2.5]], rc);
    A.lantern(px + W2 + 3, py - H * 0.45, 1.5);
    // rails out of the mouth
    const rl = Math.max(0.4, Math.min(1.4, 24 - 0.3 - my));
    if (band >= 1) {
      for (let k = 0; k * 0.22 < rl; k++) { const gy = my + 0.08 + k * 0.22; line(P(mx - 0.2, gy), P(mx + 0.2, gy), '#6a4a30', 1.4); }
      line(P(mx - 0.13, my), P(mx - 0.13, my + rl), '#6a6a72', 1); line(P(mx + 0.13, my), P(mx + 0.13, my + rl), '#6a6a72', 1);
      const cy0 = my + Math.min(0.55, rl - 0.4);
      box(mx - 0.18, cy0, 0.36, 0.4, 2, 5, '#6a5a4a');
      const [ox, oy] = P(mx, cy0 + 0.2, 7.5); for (let k = 0; k < 4; k++) circ(ox - 3 + k * 2, oy - (k % 2), 1.6, k % 2 ? '#a0522d' : '#5a524c', null);
    } else { for (let k = 0; k < 3; k++) { const [bx, by] = P(mx + 0.25 + k * 0.15, my + 0.25); A.c.beginPath(); A.c.ellipse(bx, by - 2, 2.6, 2.4, 0, 0, TAU); A.c.fillStyle = A.F('#a07a44'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.5; A.c.stroke(); circ(bx, by - 3.5, 1.2, '#5a524c', null); } }
    // right-hand works (clear of the deep-shaft headframe at the front-right corner)
    const wx = x + w * 0.72, wy = y + d * 0.42;
    if (band === 0 || band === 1) { // a windlass over a bell-pit
      const [bx, by] = P(wx, wy); A.c.beginPath(); A.c.ellipse(bx, by, 7, 3.4, 0, 0, TAU); A.c.fillStyle = A.F('#2a221c'); A.c.fill();
      line([bx - 6, by], [bx - 6, by - 10], '#6a4a30', 1.4); line([bx + 6, by], [bx + 6, by - 10], '#6a4a30', 1.4); line([bx - 7, by - 9], [bx + 7, by - 9], '#5a3a22', 2.2);
      line([bx + 7, by - 9], [bx + 9, by - 6], '#5a3a22', 1); line([bx, by - 9], [bx, by - 2], '#3a2a20', 0.6);
      if (s >= 2 || band === 1) A.person(...P(wx + 0.25, wy + 0.1), '#7a5a3a', 0.75);
    }
    if (band === 1) { // a miner's hut
      const hb = box(x + w - 0.75, y + d - 0.7, 0.5, 0.45, 0, 8, WALLS[0]); A.timber(hb, BEAM); A.door(hb, 'L', 0.15, 0.16, 6);
      roof(hb, 8, 'x', m);
    }
    if (band >= 2) { // a horse gin winding the shaft: drum on an axle under a conical roof, a horse on the ring
      const [gx, gy] = P(wx, wy); A.c.beginPath(); A.c.ellipse(gx, gy, 16, 8, 0, 0, TAU); A.c.fillStyle = A.F(A.SNOW ? '#e4e6e2' : '#b89a6a'); A.c.fill(); A.c.strokeStyle = A.F('rgba(60,40,20,0.3)'); A.c.lineWidth = 0.6; A.c.stroke();
      line(P(wx, wy), P(wx + 0.45, wy + 0.1, 6), '#5a3a22', 1.4);
      if (!A.SNOW) horse(wx + 0.5, wy + 0.18, 1);
      for (const [ox, oy] of [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) line(P(wx + ox, wy + oy), P(wx + ox, wy + oy, 14), '#6a4a30', 1.2);
      A.cyl(wx, wy, 0.16, 6, 6, '#7a5434', '#9a7444');
      A.cone(wx, wy, 0.45, 14, 10, m.col);
    }
    if (band >= 3) { // a stone engine house with a tall stack and spoil heaps
      const eb = box(x + w - 0.75, y + 0.2, 0.55, 0.6, 0, 14, STONE); A.courses(eb, 3.5, STONE_D);
      archWin(eb, 'L', 0.27, 4, 0.14, 8); roof(eb, 10, 'y', m);
      A.chimney(eb.x + 0.05, eb.y + 0.05, 0, 34, 'hall', '#8a7f74');
      for (let k = 0; k < 2; k++) { const [ox, oy] = P(x + w * 0.55 + k * 0.3, y + d * 0.15 + k * 0.2); A.c.beginPath(); A.c.ellipse(ox, oy, 9, 4.5, 0, Math.PI, TAU); A.c.fillStyle = A.F(A.SNOW ? '#eef2f4' : '#7a6e60'); A.c.fill(); }
    }
    if (s >= 3 || band >= 2) A.lantern(px - W2 - 3, py - H * 0.45, 1.4);
    return 24 + band * 4;
  });

  // =====================================================================
  //  WAREHOUSE — a granary on staddle stones → hoist-beam store barn → tall merchant's warehouse
  // =====================================================================
  function staddles(x, y, w, d, h = 4) { for (const [px, py] of [[x + 0.06, y + 0.06], [x + w - 0.06, y + 0.06], [x + 0.06, y + d - 0.06], [x + w - 0.06, y + d - 0.06], [x + w / 2, y + d - 0.06], [x + w - 0.06, y + d / 2]]) { const [sx, sy] = P(px, py); poly([[sx - 1.2, sy], [sx + 1.2, sy], [sx + 0.8, sy - h + 1], [sx - 0.8, sy - h + 1]], STONE_D); A.c.beginPath(); A.c.ellipse(sx, sy - h + 1, 2.8, 1.3, 0, 0, TAU); A.c.fillStyle = A.F(STONE); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.5; A.c.stroke(); } }
  function hoist(b, side, z, len = 8) { // a beam sticking out of a gable with a rope and a sack
    const p = (side === 'L' ? A.onL : A.onR)(b, (side === 'L' ? b.w : b.d) / 2, 0, z, 0)[0], q = side === 'L' ? [p[0] - len * 0.7, p[1] + len * 0.35] : [p[0] + len * 0.7, p[1] + len * 0.35];
    line(p, q, '#5a3a22', 1.6); line(q, [q[0], q[1] + 9], '#3a2a20', 0.6); circ(q[0], q[1] + 11, 2.2, '#d8c79e', A.OUT);
  }
  reg('warehouse', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2;
    let top;
    if (band === 0) {
      const gw = 0.9, gd = 0.8, gx = cx - gw / 2, gy = cy - gd / 2;
      staddles(gx, gy, gw, gd, 5);
      const b = box(gx, gy, gw, gd, 4, 9, '#b08a5a');
      for (let k = 1; k < 9; k++) { const u = gw * k / 9; line(A.onL(b, u, u, 0, 0)[0], A.onL(b, u, u, 9, 9)[0], '#8a6a3a', 0.5); }
      poly(A.onL(b, 0.35, 0.58, 0, 7), '#4a3424', null);
      poly([P(gx + 0.35, gy + gd, 4), P(gx + 0.58, gy + gd, 4), P(gx + 0.58, gy + gd + 0.3, 0), P(gx + 0.35, gy + gd + 0.3, 0)], OAK);
      top = roof(b, 12, 'x', m, { o: 0.18 });
      A.sack(gx + gw + 0.15, gy + gd + 0.1); if (s >= 2) A.sack(gx - 0.1, gy + gd + 0.2);
      return top;
    }
    const big = band >= 2, tall = band >= 3;
    const bw = Math.min(1.25, w * 0.62), bd = Math.min(1.35, d * 0.56);
    if (tall) { // a second, older granary on staddles at the back-left
      staddles(x + 0.1, y + 0.1, 0.55, 0.5, 4); const gb = box(x + 0.1, y + 0.1, 0.55, 0.5, 4, 8, '#b08a5a'); roof(gb, 9, 'y', m);
    }
    const H = band === 1 ? 14 : tall ? 30 : 24;
    const h = house(cx - bw / 2, cy - bd / 2, bw, bd, H, { two: big, stone: big && stoneOK(), axis: 'y', wall: WALLS[1], door: false, wins: false, steep: 13 });
    // stacked loading doors on the gable end (L face) and a hoist
    const f = h.lo || h.b, nDoors = big ? 2 : 1;
    for (let k = 0; k < nDoors; k++) { const z0 = k === 0 ? 0 : h.b.z - (h.lo ? h.lo.z : 0) + 2; const tgt = k === 0 ? f : h.b; poly(A.onL(tgt, tgt.w * 0.35, tgt.w * 0.65, k === 0 ? 0 : 2, k === 0 ? 9 : 8), '#5a3a22', '#3a2a1a', 0.6); void z0; }
    if (big) { // a lucam: a gabled hoist hood jutting from the top of the gable end
      const lx = h.b.x + h.b.w / 2 - 0.15, ly = h.b.y + h.b.d - 0.02, lz = h.b.z + h.b.h - 3;
      const lb = box(lx, ly, 0.3, 0.24, lz, 8, WALLS[1]); A.timber(lb, BEAM);
      poly(A.onL(lb, 0.07, 0.23, 0.5, 6), '#5a3a22', null);
      roof(lb, 6, 'y', h.m, { o: 0.04 });
      const p = A.onL(lb, 0.15, 0, 6.5, 0)[0]; line(p, [p[0], p[1] + 14], '#3a2a20', 0.6); circ(p[0], p[1] + 16, 2.2, '#d8c79e', A.OUT);
    } else hoist(h.b, 'L', h.b.h + 1, 10);
    winRow(h.b, 'R', big ? 3 : h.b.h * 0.45, 4, 0.14, 0.4);
    if (h.lo) winRow(h.lo, 'R', 3, 4, 0.14, 0.4);
    top = h.top;
    if (tall) top = weathercock(cx, cy, top);
    A.barrel(cx + bw / 2 + 0.12, cy - bd / 2 + 0.2); A.sack(cx - bw / 2 - 0.08, cy + bd / 2 + 0.15);
    if (big) cart(cx - bw / 2 - 0.05, cy + bd / 2 + 0.22, true, 'sacks');
    if (s >= 2) A.lantern(...A.onL(f, f.w * 0.2, 0, 8, 0)[0], 1.2);
    return top;
  });

  // =====================================================================
  //  MARKET — stalls with striped awnings round a market cross → a roofed butter cross → cloth hall
  // =====================================================================
  reg('market', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(true), cx = x + w / 2, cy = y + d / 2;
    flat(x + 0.15, y + 0.15, w - 0.3, d - 0.3, A.SNOW ? '#e6e8ea' : stoneOK() ? '#cfc4b0' : '#c8b088');
    let top;
    // back row of stalls (the stock yard dressing adds the front row)
    const nb = Math.min(3, 1 + band);
    if (band >= 3) { // a timber cloth hall along the back edge with awnings
      const h = house(x + 0.2, y + 0.2, w - 0.6, 0.6, 20, { two: true, stone: stoneOK(), axis: 'x', grand: true, door: false, wins: false, wall: WALLS[1] });
      for (let k = 0; k < 3; k++) { const u = (w - 0.6) * (k + 0.5) / 3; poly(A.onL(h.lo, u - 0.15, u + 0.15, 0, 7.5), '#3a2e26', null); }
      awning(h.lo, 'L', 0.05, w - 0.65, 9.5, 0.2, '#c0392b', '#f6eedc');
      winRow(h.b, 'L', 2.5, 4, 0.15, 0.34, -1, '#3f6fa8');
      cupola(x + 0.2 + (w - 0.6) / 2, y + 0.5, h.top - 3, 0.1, 5, false);
    } else for (let k = 0; k < nb; k++) stall(x + 0.25 + k * 0.62, y + 0.25, CLOTH[k % 4], true, k + band);
    for (let k = 0; k < Math.min(2, band); k++) stall(x + 0.25, y + 0.95 + k * 0.62, CLOTH[(k + 2) % 4], false, k + 2);
    // the centrepiece
    if (band <= 1) { // stepped market cross
      for (let k = 0; k < 3; k++) box(cx - 0.3 + k * 0.08, cy - 0.3 + k * 0.08, 0.6 - k * 0.16, 0.6 - k * 0.16, k * 2.2, 2.2, STONE);
      box(cx - 0.05, cy - 0.05, 0.1, 0.1, 6.6, 18, STONE);
      const [tx, ty] = P(cx, cy, 22); line([tx - 3, ty], [tx + 3, ty], STONE_D, 1.8);
      top = 26;
    } else { // the butter cross: an open roofed shelter on posts over a stone step
      box(cx - 0.4, cy - 0.4, 0.8, 0.8, 0, 2.2, STONE);
      for (const [px, py] of [[cx - 0.33, cy + 0.33], [cx + 0.33, cy + 0.33], [cx + 0.33, cy - 0.33], [cx - 0.33, cy - 0.33]]) box(px - 0.04, py - 0.04, 0.08, 0.08, 2.2, 12, band >= 3 && stoneOK() ? STONE : OAK);
      box(cx - 0.07, cy - 0.07, 0.14, 0.14, 2.2, 12, STONE);
      const rb = { x: cx - 0.4, y: cy - 0.4, w: 0.8, d: 0.8, z: 14.2, h: 0, col: STONE };
      top = A.hip(rb, 14, m.col, 0.1, 'tile');
      top = weathercock(cx, cy, top) - 4;
      // a weighing beam
      const [wx, wy] = P(cx + 0.55, cy - 0.5); line([wx, wy], [wx, wy - 14], '#5a3a22', 1.2); line([wx - 6, wy - 13], [wx + 6, wy - 13], '#5a3a22', 1.2); line([wx - 6, wy - 13], [wx - 6, wy - 9], '#3a2a20', 0.5); line([wx + 6, wy - 13], [wx + 6, wy - 9], '#3a2a20', 0.5); line([wx - 8, wy - 9], [wx - 4, wy - 9], '#c9a03a', 1.2); line([wx + 4, wy - 9], [wx + 8, wy - 9], '#c9a03a', 1.2);
    }
    // bunting from the centre to the corners
    if (band >= 1) { const c0 = P(cx, cy, top - 3); bunting(c0, P(x + 0.25, y + 0.25, 13), 5, 8); bunting(c0, P(x + w - 0.3, y + 0.3, 12), 5, 8); if (band >= 2) bunting(c0, P(x + 0.3, y + d - 0.3, 12), 5, 8); }
    // produce, crates and a hand cart
    A.crate(x + w - 0.65, y + 0.85, 0.22); A.barrel(x + w - 0.45, y + 1.15);
    if (s >= 1 || band >= 1) cart(cx + 0.45, cy + 0.15, false, A.SEASON === 2 ? 'hay' : 'sacks');
    for (let k = 0; k < 3; k++) circ(...P(cx - 0.55 + k * 0.1, cy + 0.55), 1.8, A.SEASON === 2 ? '#e8873a' : '#7cae4a', A.OUT);
    if (band >= 2) { lampPost(x + 0.25, y + d - 0.25); }
    return top;
  });

  // =====================================================================
  //  BARRACKS — a guardhouse with pike racks → thatched barrack house with butts → stone barracks with
  //  a watchtower → a gatehouse; red-and-gold heraldry throughout
  // =====================================================================
  reg('barracks', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2, alongX = w >= d;
    dirt(x + 0.2, y + 0.2, w - 0.4, d - 0.4, '#c2a77a');
    let top;
    // back-left watchtower from band 2
    if (band >= 2) {
      const tx = x + 0.25, ty = y + 0.25, tw = 0.62, th = 38 + band * 6 + s;
      const tb = box(tx, ty, tw, tw, 0, th, STONE); A.courses(tb, 4, STONE_D);
      A.slit ? (A.slit(tb, 'L', tw / 2, th * 0.5), A.slit(tb, 'R', tw / 2, th * 0.5), A.slit(tb, 'L', tw / 2, th * 0.75)) : 0;
      if (X.tech('fortification') || band >= 3) { A.parapet({ x: tx - 0.05, y: ty - 0.05, w: tw + 0.1, d: tw + 0.1, z: th, h: 0, col: STONE }, 3); A.flagpole(tx + tw / 2, ty + tw / 2, th + 3, 14, '#c0392b', 10); }
      else { const zt = spire({ x: tx - 0.06, y: ty - 0.06, w: tw + 0.12, d: tw + 0.12, z: th, h: 0, col: STONE }, 14, m.col); A.flagpole(tx + tw / 2, ty + tw / 2, zt - 1, 10, '#c0392b', 9); }
    }
    if (band === 0) {
      const h = house(cx - 0.45, cy - 0.35, 0.9, 0.7, 10, { m, wall: WALLS[0], axis: 'x', chim: 'house' });
      top = h.top;
      pikeRack(cx + 0.55, cy - 0.2, false, 4);
      target(x + w - 0.5, y + 0.45); if (s >= 2) target(x + w - 0.85, y + 0.35);
      A.flagpole(cx - 0.6, cy + 0.5, 0, 24, '#c0392b', 9);
      if (s >= 1) { const [fx, fy] = P(cx + 0.2, cy + 0.75); A.lampDot(fx, fy, 2, '#c0501a', '#ff9a3a'); A.rec('fires', { x: fx, y: fy - 1, s: 0.6 }); A.rec('lights', { x: fx, y: fy - 4, r: 16 }); }
      return top;
    }
    // the barrack house over the centre, long and low
    const bw = alongX ? Math.min(1.8, w - 0.9) : 0.85, bd = alongX ? 0.85 : Math.min(1.8, d - 0.9);
    const bx = band >= 2 ? Math.max(cx - bw / 2, x + 0.95) : cx - bw / 2, by = band >= 2 && !alongX ? Math.max(cy - bd / 2, y + 0.95) : cy - bd / 2;
    const h = house(bx, by, bw, bd, band === 1 ? 12 : 20, { two: band >= 2, stone: band >= 2, m, axis: alongX ? 'x' : 'y', shut: '#c0392b', chim: 'hall', steep: 12 });
    top = h.top;
    // shields along the facade
    const fb = h.lo || h.b, side = alongX ? 'L' : 'R', Lf = alongX ? fb.w : fb.d;
    for (let k = 0; k < Math.round(Lf / 0.35); k++) { const u = (k + 0.5) * Lf / Math.round(Lf / 0.35); if (Math.abs(u - fb.w * 0.2) < 0.15 && alongX) continue; const p = (side === 'L' ? A.onL : A.onR)(fb, u, 0, fb.h - 2.5, 0)[0]; shield(p[0], p[1], k % 2 ? '#c0392b' : '#3f6fa8', 0.7, k % 3); }
    // butts and racks in the yard
    target(x + w - 0.45, y + d * 0.35); target(x + w - 0.45, y + d * 0.35 + 0.4);
    pikeRack(alongX ? bx : bx + bw + 0.15, alongX ? by + bd + 0.18 : by, alongX, 5);
    if (band >= 3) { // gatehouse arch at the front-left
      const gx = x + 0.15, gy = y + d - 0.75;
      const t1 = box(gx, gy, 0.35, 0.35, 0, 24, STONE), t2 = box(gx + 0.75, gy, 0.35, 0.35, 0, 24, STONE);
      A.courses(t1, 4, STONE_D); A.courses(t2, 4, STONE_D);
      const ar = box(gx + 0.35, gy + 0.05, 0.4, 0.25, 12, 8, STONE);
      poly(A.onL({ x: gx + 0.35, y: gy + 0.05, w: 0.4, d: 0.25, z: 0 }, 0.02, 0.38, 0, 12), '#2a2420', null);
      A.parapet({ ...t1, z: 0, h: 24 }, 2.5); A.parapet({ ...t2, z: 0, h: 24 }, 2.5); void ar;
      A.banner(gx + 0.55, gy + 0.3, 20, 10, '#c0392b');
    }
    if (s >= 2) { const [fx, fy] = P(cx, y + d - 0.35); A.lampDot(fx, fy, 2, '#c0501a', '#ff9a3a'); A.rec('fires', { x: fx, y: fy - 1, s: 0.6 }); A.rec('lights', { x: fx, y: fy - 4, r: 18 }); }
    return top;
  });

  // =====================================================================
  //  STABLE — an open lean-to → half-doored stable with a paddock → long stable with a horse-vane
  //  cupola → jousting tilt with striped barrier and pennants
  // =====================================================================
  reg('stable', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2, alongX = w >= d;
    dirt(x + 0.2, y + 0.2, w - 0.4, d - 0.4, '#bfa476');
    let top;
    const bw = alongX ? Math.min(0.75 + band * 0.45, w - 0.6) : 0.8, bd = alongX ? 0.8 : Math.min(0.75 + band * 0.45, d - 0.6);
    const bx = cx - bw / 2, by = y + 0.25 + (alongX ? 0 : 0);
    const byy = alongX ? Math.max(y + 0.2, cy - bd / 2 - 0.3) : cy - bd / 2;
    void by;
    if (band === 0) { // open-fronted lean-to on posts
      const b = { x: bx, y: byy, w: bw, d: bd, z: 0, h: 0 };
      box(bx, byy, bw, 0.1, 0, 10, '#8a6440'); box(bx, byy, 0.1, bd, 0, 10, '#8a6440');
      for (const [px, py] of [[bx + bw, byy + bd], [bx, byy + bd], [bx + bw, byy]]) box(px - 0.04, py - 0.04, 0.08, 0.08, 0, 9, OAK);
      A.haystack(bx + 0.3, byy + 0.3, 0.4);
      const rc = A.SNOW ? '#eef2f4' : m.col;
      poly([P(bx - 0.08, byy - 0.08, 12), P(bx + bw + 0.08, byy - 0.08, 12), P(bx + bw + 0.08, byy + bd + 0.1, 8), P(bx - 0.08, byy + bd + 0.1, 8)], rc);
      poly([P(bx + bw + 0.08, byy - 0.08, 12), P(bx + bw + 0.08, byy + bd + 0.1, 8), P(bx + bw + 0.08, byy + bd + 0.1, 7), P(bx + bw + 0.08, byy - 0.08, 11)], shade(rc, -0.3));
      void b;
      horse(bx + bw * 0.6, byy + bd + 0.15, 1);
      A.cyl(bx + bw + 0.3, byy + bd + 0.25, 0.1, 0, 3, '#7a5434', A.SNOW ? '#dfe8ee' : '#4f7f9a');
      top = 12;
      if (s >= 2) horse(cx + 0.7, cy + 0.6, -1);
      return top;
    }
    const h = house(bx, byy, bw, bd, band >= 2 ? 16 : 12, { m, axis: alongX ? 'x' : 'y', wall: band >= 2 && stoneOK() ? STONE : WALLS[1], stone: band >= 2 && stoneOK(), door: false, wins: false, steep: 12 });
    // stall half-doors with horses looking out
    const side = alongX ? 'L' : 'R', Lf = alongX ? h.b.w : h.b.d, n = Math.max(2, Math.round(Lf / 0.32));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) * Lf / n, f = side === 'L' ? A.onL : A.onR;
      poly(f(h.b, u - 0.1, u + 0.1, 0, 4.5), '#5a3a22', '#3a2a1a', 0.5);
      poly(f(h.b, u - 0.1, u + 0.1, 4.5, 8.5), '#1e1814', null);
      if (k % 2 === 0) { const p = f(h.b, u, 0, 6, 0)[0]; poly([[p[0] - 1, p[1] - 2], [p[0] + 1.2, p[1] - 2.5], [p[0] + (side === 'L' ? -2.5 : 2.5), p[1] + 1.5], [p[0], p[1] + 1.5]], ['#8a5a34', '#5a3a24', '#d8c8b0'][k % 3], null); }
    }
    top = h.top;
    if (band >= 2) { top = cupola(cx, h.b.y + h.b.d / 2 + (alongX ? 0 : 0), top - 4, 0.12, 6, false); const t = P(cx, h.b.y + h.b.d / 2, top); line(t, [t[0], t[1] - 6], '#3a2a20', 0.9); poly([[t[0] - 4, t[1] - 7], [t[0] + 2, t[1] - 8], [t[0] + 4, t[1] - 10], [t[0] + 4.5, t[1] - 8], [t[0] + 2.5, t[1] - 6.5], [t[0] - 3, t[1] - 6]], X.era >= 2 ? GOLD : '#3a2a20', null); top += 10; hoist(h.b, alongX ? 'R' : 'L', h.b.h + 2, 7); }
    // paddock in front with horses
    const px = x + 0.2, py = y + d - 0.95, pw = w - 0.5, pd = 0.7;
    rail([px, py], [px + pw, py], 5, '#efe8d8'); rail([px, py], [px, py + pd], 5, '#efe8d8');
    horse(px + pw * 0.3, py + 0.4, 1, band >= 3 ? '#c0392b' : null);
    if (s >= 1 || band >= 2) horse(px + pw * 0.65, py + 0.3, -1, band >= 3 ? '#3f6fa8' : null);
    if (band >= 3) { // the tilt: a striped barrier with pennants
      const a = [px + 0.15, py + 0.55], b = [px + pw - 0.15, py + 0.55];
      const n2 = 8; for (let k = 0; k < n2; k++) { const p0 = lerp(a, b, k / n2), p1 = lerp(a, b, (k + 1) / n2); poly([P(...p0, 2), P(...p1, 2), P(...p1, 6), P(...p0, 6)], k % 2 ? '#f6eedc' : '#c0392b', A.OUT, 0.4); }
      A.pennant(a[0], a[1], 0, 16, '#e0b84a'); A.pennant(b[0], b[1], 0, 16, '#3f6fa8');
    }
    A.haystack(x + w - 0.4, y + 0.4, 0.45);
    const lp = (alongX ? A.onL : A.onR)(h.b, 0.08, 0, 9, 0)[0]; A.lantern(lp[0], lp[1], 1.3);
    return top;
  });

  // =====================================================================
  //  WAR PIT (not usually theirs) — a roped sparring ring with benches
  // =====================================================================
  reg('warpit', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, r = Math.min(w, d) * 0.35;
    const [ex, ey] = P(cx, cy); A.c.beginPath(); A.c.ellipse(ex, ey, r * 33, r * 16.6, 0, 0, TAU); A.c.fillStyle = A.F(A.SNOW ? '#e6e8e6' : '#d8c08a'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.6; A.c.stroke();
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; line(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r), P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 7), OAK, 1.2); }
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, b = (k + 1) / 8 * TAU; line(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 6), P(cx + Math.cos(b) * r, cy + Math.sin(b) * r, 6), '#d8c79e', 0.7); }
    A.rec('pit', { x: ex, y: ey });
    bench(x + 0.2, y + d - 0.3); bench(x + w - 0.5, y + d - 0.3);
    A.flagpole(x + 0.3, y + 0.3, 0, 22 + band * 4, '#c0392b');
    return 12;
  });

  // =====================================================================
  //  SIEGE WORKSHOP — open timber shed → a ram on the stocks → a trebuchet frame → great barn + trebuchet
  // =====================================================================
  function ram(gx, gy, alongX, done = 1) {
    const w = alongX ? 0.9 : 0.4, d = alongX ? 0.4 : 0.9;
    box(gx, gy, w, d, 3, 1.5, '#7a5434');
    const wp = alongX ? [[gx + 0.15, gy + d], [gx + w - 0.15, gy + d]] : [[gx + w, gy + 0.15], [gx + w, gy + d - 0.15]];
    for (const [px, py] of wp) { const [x0, y0] = P(px, py, 3); circ(x0, y0, 3, '#6a4a30', A.OUT); circ(x0, y0, 1, '#3a2a20', null); }
    if (done > 0.4) { A.log(alongX ? gx - 0.1 : gx + w / 2, alongX ? gx + w + 0.15 : gx + w / 2 + 0.01, alongX ? gy + d / 2 : gy + d + 0.15, 8, 2); }
    if (done > 0.8) { const rb = { x: gx, y: gy, w, d, z: 4.5, h: 6, col: '#8a6440' }; for (const [px, py] of [[gx, gy + d], [gx + w, gy + d], [gx + w, gy]]) line(P(px, py, 4.5), P(px, py, 10.5), '#6a4a30', 1); A.gable(rb, 6, '#9a7444', alongX ? 'x' : 'y', null, 0.05); }
  }
  function trebuchet(gx, gy, alongX, H = 34, done = 1) {
    const a = P(gx, gy), b = alongX ? P(gx + 0.5, gy) : P(gx, gy + 0.5), t = P(gx + (alongX ? 0.25 : 0), gy + (alongX ? 0 : 0.25), H * 0.6);
    const a2 = P(gx + (alongX ? 0 : 0.25), gy + (alongX ? 0.25 : 0)), b2 = alongX ? P(gx + 0.5, gy + 0.25) : P(gx + 0.25, gy + 0.5);
    line(a, t, '#6a4a30', 2); line(b, t, '#6a4a30', 2); line(a2, t, '#6a4a30', 1.6); line(b2, t, '#6a4a30', 1.6); line(a, b, '#5a3a22', 1.6);
    if (done < 0.6) return H * 0.6;
    const arm1 = [t[0] - H * 0.5, t[1] - H * 0.4], arm2 = [t[0] + H * 0.18, t[1] + H * 0.15];
    line(arm1, arm2, '#7a5434', 2); line(arm1, [arm1[0] - 3, arm1[1] + 9], '#3a2a20', 0.6);
    poly([[arm2[0] - 3, arm2[1]], [arm2[0] + 3, arm2[1]], [arm2[0] + 3, arm2[1] + 7], [arm2[0] - 3, arm2[1] + 7]], '#6a5a4a');
    return H;
  }
  reg('workshop', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2, alongX = w >= d;
    dirt(x + 0.15, y + 0.15, w - 0.3, d - 0.3, '#c2a77a');
    const sw = alongX ? Math.min(1.2 + band * 0.15, w * 0.55) : d < 1.2 ? 0.8 : 0.9, sd = alongX ? Math.min(0.9, d - 0.6) : Math.min(1.2 + band * 0.15, d * 0.55);
    let top;
    if (band >= 3) {
      const h = house(cx - sw / 2, cy - sd / 2, sw, sd, 18, { m, axis: alongX ? 'x' : 'y', wall: WALLS[1], door: false, wins: false, steep: 13 });
      poly((alongX ? A.onL : A.onR)(h.b, (alongX ? sw : sd) * 0.25, (alongX ? sw : sd) * 0.75, 0, 13), '#2e241c', null);
      top = h.top;
      winRow(h.b, alongX ? 'R' : 'L', 8, 4, 0.14, 0.4);
    } else { // open shed on posts
      const z = 12 + band * 2;
      for (const [px, py] of [[cx - sw / 2, cy - sd / 2], [cx + sw / 2, cy - sd / 2], [cx - sw / 2, cy + sd / 2], [cx + sw / 2, cy + sd / 2], [cx, cy + sd / 2]]) box(px - 0.04, py - 0.04, 0.08, 0.08, 0, z, OAK);
      if (band >= 1) ram(cx - (alongX ? 0.45 : 0.2), cy - (alongX ? 0.2 : 0.45), alongX, Math.min(1, 0.3 + s * 0.2));
      else { A.logPile(cx - 0.3, cy - 0.1, 0.55, 2); }
      top = roof({ x: cx - sw / 2, y: cy - sd / 2, w: sw, d: sd, z, h: 0, col: '#8a6440' }, 11, alongX ? 'x' : 'y', m);
    }
    // timber stacks and a sawhorse
    A.logPile(alongX ? x + 0.2 : x + w - 0.75, alongX ? y + d - 0.45 : y + 0.25, 0.5, 2 + Math.min(2, band));
    const [hx, hy] = P(x + 0.35, y + 0.3); line([hx - 4, hy], [hx - 2, hy - 5], '#6a4a30', 1); line([hx + 4, hy - 2], [hx + 2, hy - 7], '#6a4a30', 1); line([hx - 3, hy - 5], [hx + 3, hy - 7], '#7a5434', 1.6);
    if (band >= 2) { // a trebuchet: a frame at band 2, finished at band 3
      const tx = alongX ? x + w - 0.75 : x + 0.25, ty = alongX ? y + 0.25 : y + d - 0.75;
      trebuchet(tx, ty, alongX, band >= 3 ? 40 : 30, band >= 3 || s >= 3 ? 1 : 0.5);
    }
    if (s >= 2) A.lantern(...P(cx + sw / 2, cy + sd / 2, 9), 1.2);
    return top;
  });

  // =====================================================================
  //  SMELTER — a clay bloomery with a charcoal clamp → stone furnace with a bellows shed → tall blast
  //  furnace driven by a water wheel → twin furnaces and a glowing casting floor
  // =====================================================================
  function furnace(gx, gy, r, h, col = '#9a8a7a', glow = true) { // a tapering square stone stack with a glowing mouth
    const i = r * 0.35;
    poly([P(gx + r, gy - r, 0), P(gx + r, gy + r, 0), P(gx + r - i, gy + r - i, h), P(gx + r - i, gy - r + i, h)], shade(col, -0.22));
    poly([P(gx - r, gy + r, 0), P(gx + r, gy + r, 0), P(gx + r - i, gy + r - i, h), P(gx - r + i, gy + r - i, h)], col);
    poly([P(gx - r + i, gy - r + i, h), P(gx + r - i, gy - r + i, h), P(gx + r - i, gy + r - i, h), P(gx - r + i, gy + r - i, h)], '#2a2420');
    for (let v = 4; v < h - 2; v += 4) { const t = v / h, rr = r - i * t; line(P(gx - rr, gy + rr, v), P(gx + rr, gy + rr, v), shade(col, -0.18), 0.5); line(P(gx + rr, gy - rr, v), P(gx + rr, gy + rr, v), shade(col, -0.3), 0.5); }
    const mq = [P(gx - r * 0.3, gy + r, 0), P(gx + r * 0.3, gy + r, 0), P(gx + r * 0.3, gy + r, 5), P(gx, gy + r, 7), P(gx - r * 0.3, gy + r, 5)];
    A.c.beginPath(); A.c.moveTo(...mq[0]); for (const p of mq.slice(1)) A.c.lineTo(...p); A.c.closePath(); A.c.fillStyle = A.GLOW ? '#ffb040' : '#e8682a'; A.c.fill();
    if (glow) { const [fx, fy] = P(gx, gy + r, 2); A.rec('fires', { x: fx, y: fy, s: 0.5 }); A.rec('lights', { x: fx, y: fy - 3, r: 22 }); }
    const [sx, sy] = P(gx, gy, h + 2); A.rec('smoke', { x: sx, y: sy, kind: 'smelter', seed: A.R(), dark: true });
    return h;
  }
  reg('smelter', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2;
    dirt(x + 0.2, y + 0.2, w - 0.4, d - 0.4, '#a89070');
    // ore heap and charcoal at the back-right
    for (let k = 0; k < 2 + band; k++) A.rock(x + w - 0.45 - (k % 2) * 0.25, y + 0.35 + k * 0.22, 0.45, k % 2 ? '#8a5a3a' : '#6a5a50');
    let top;
    if (band === 0) {
      // charcoal clamp: a smoking turf mound
      const [mx, my] = P(x + 0.6, y + 0.65); A.c.beginPath(); A.c.ellipse(mx, my, 12, 6, 0, Math.PI, TAU); A.c.fillStyle = A.F(A.SNOW ? '#eef2f4' : '#4a3e34'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.6; A.c.stroke();
      A.rec('smoke', { x: mx, y: my - 6, kind: 'smelter', seed: A.R() });
      // the clay bloomery: a squat tapering chimney of daub with a glowing mouth
      taperCyl(cx, cy, 0.26, 0.11, 0, 17, '#b06a42', '#2a1e18');
      for (const v of [5, 10]) { const [bx, by, brx, bry] = A.ell(cx, cy, v, 0.26 - 0.15 * v / 17); A.c.beginPath(); A.c.ellipse(bx, by, brx, bry, 0, 0.2, Math.PI - 0.2); A.c.strokeStyle = A.F('#8a4a2a'); A.c.lineWidth = 0.6; A.c.stroke(); }
      const [fx, fy] = P(cx + 0.17, cy + 0.17, 1); A.c.beginPath(); A.c.arc(fx, fy, 2.4, Math.PI, 0); A.c.closePath(); A.c.fillStyle = A.GLOW ? '#ffb040' : '#e8682a'; A.c.fill();
      A.rec('fires', { x: fx, y: fy, s: 0.45 }); A.rec('lights', { x: fx, y: fy - 3, r: 18 });
      A.rec('smoke', { x: P(cx, cy, 18)[0], y: P(cx, cy, 18)[1], kind: 'smelter', seed: A.R(), dark: true });
      // leather bellows
      const [bx, by] = P(cx - 0.4, cy + 0.25); poly([[bx - 4, by - 2], [bx + 3, by - 4], [bx + 3, by], [bx - 4, by + 1]], '#7a5232');
      A.person(...P(cx - 0.55, cy + 0.4), '#7a5a3a', 0.75);
      return 18;
    }
    if (band === 1) {
      top = furnace(cx, cy, 0.38, 26 + s * 2, '#9a8a7a');
      // bellows lean-to against the furnace's left
      const lb = box(cx - 0.95, cy - 0.3, 0.5, 0.6, 0, 8, WALLS[0]); A.timber(lb, BEAM);
      const rc = A.SNOW ? '#eef2f4' : m.col;
      poly([P(lb.x - 0.05, lb.y - 0.05, 12), P(lb.x + lb.w + 0.05, lb.y - 0.05, 12), P(lb.x + lb.w + 0.05, lb.y + lb.d + 0.1, 8), P(lb.x - 0.05, lb.y + lb.d + 0.1, 8)], rc);
      if (s >= 2) A.logPile(x + 0.25, y + d - 0.5, 0.5, 2);
      return top;
    }
    // band 2+: a tall blast furnace, water-wheel bellows, a casting floor
    const big = band >= 3;
    if (big) furnace(cx + 0.45, cy - 0.45, 0.32, 36, '#8a7e72');
    top = furnace(cx, cy, 0.45, (big ? 46 : 40) + s * 2, stoneOK() ? '#a8a092' : '#9a8a7a');
    // the wheel house and wheel on the left
    const wb = box(cx - 1.0, cy - 0.25, 0.42, 0.55, 0, 12, WALLS[0]); A.timber(wb, BEAM); roof(wb, 9, 'y', m);
    vwheel(cx - 0.75, cy + 0.42, 10, 0.32, 'y', '#6a4a30', 8, 2.2);
    A.rec('wheels', { x: P(cx - 0.75, cy + 0.42, 10)[0], y: P(cx - 0.75, cy + 0.42, 10)[1], r: 8 });
    // casting floor: glowing runnels into sand moulds
    const fl = [cx - 0.1, cy + 0.5];
    flat(fl[0] - 0.3, fl[1], 0.75, 0.45, A.SNOW ? '#e0dcd4' : '#c8b490');
    for (let k = 0; k < (big ? 3 : 2); k++) { const gy = fl[1] + 0.12 + k * 0.13; A.lamp([P(fl[0] - 0.25, gy - 0.02), P(fl[0] + 0.4, gy - 0.02), P(fl[0] + 0.4, gy + 0.02), P(fl[0] - 0.25, gy + 0.02)], '#e8682a', '#ffc050'); }
    A.rec('lights', { x: P(fl[0], fl[1] + 0.2)[0], y: P(fl[0], fl[1] + 0.2)[1], r: 22 });
    if (big) { // a charging ramp up to the furnace top
      const a = P(cx + 0.5, cy + 0.15, 0), b = P(cx + 0.12, cy - 0.1, 40);
      poly([a, [a[0] + 5, a[1] - 2], [b[0] + 5, b[1] - 2], b], OAK); for (let k = 1; k < 6; k++) { const p = lerp(a, b, k / 6); line(p, [p[0] + 5, p[1] - 2], '#5a3a22', 0.6); }
    }
    return top;
  });

  // =====================================================================
  //  TOOLSMITH (smithy) — an open forge under thatch → smithy with a big chimney and horseshoe sign →
  //  wheelwright's yard → two-bay shop with hanging tools
  // =====================================================================
  function forgeGlow(gx, gy, z = 3) { const [fx, fy] = P(gx, gy, z); A.lampDot(fx, fy, 2.6, '#e8682a', '#ffb040'); A.rec('fires', { x: fx, y: fy, s: 0.5 }); A.rec('lights', { x: fx, y: fy - 3, r: 22 }); }
  function anvil(gx, gy) { const [ax, ay] = P(gx, gy); poly([[ax - 1.5, ay], [ax + 1.5, ay], [ax + 1, ay - 3], [ax - 1, ay - 3]], '#3a3a40'); poly([[ax - 4, ay - 3], [ax + 3, ay - 3], [ax + 4.5, ay - 4.5], [ax - 3, ay - 5]], '#4a4a52'); A.rec('anvils', { x: ax, y: ay - 5 }); }
  function cartwheel(px, py, r = 4) { circ(px, py, r, null, '#5a3a22'); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; line([px - Math.cos(a) * r, py - Math.sin(a) * r], [px + Math.cos(a) * r, py + Math.sin(a) * r], '#6a4a30', 0.6); } circ(px, py, 1, '#4a3020', null); }
  function horseshoe(px, py, s = 1) { A.c.beginPath(); A.c.arc(px, py, 2.6 * s, Math.PI * 0.15, Math.PI * 0.85, true); A.c.strokeStyle = A.F(X.era >= 3 ? GOLD : '#8a8a92'); A.c.lineWidth = 1.4 * s; A.c.stroke(); }
  reg('smithy', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2;
    dirt(x + 0.2, y + 0.2, w - 0.4, d - 0.4, '#b49c78');
    let top;
    if (band === 0) { // an open forge under a thatched roof on posts
      const sw = 1.0, sd = 0.8, bx = cx - sw / 2, by = cy - sd / 2;
      box(bx, by, 0.35, 0.35, 0, 6, STONE); forgeGlow(bx + 0.2, by + 0.35, 5);
      A.chimney(bx + 0.06, by + 0.06, 6, 16, 'smithy', '#8a7f74');
      for (const [px, py] of [[bx + sw, by + sd], [bx, by + sd], [bx + sw, by], [bx, by]]) box(px - 0.04, py - 0.04, 0.08, 0.08, 0, 10, OAK);
      anvil(cx + 0.1, cy + 0.15);
      A.cyl(cx + 0.35, cy + 0.3, 0.1, 0, 4, '#7a5232', A.SNOW ? '#dfe8ee' : '#3a4a5a');
      top = roof({ x: bx, y: by, w: sw, d: sd, z: 10, h: 0, col: OAK }, 11, 'x', m);
      if (s >= 2) cartwheel(...P(bx + sw + 0.2, by + 0.2, 4));
      return top;
    }
    // smithy house: stone walls, the L face open as a forge bay
    const big = band >= 3, bw = big ? 1.4 : 1.1, bd = 0.85;
    const b = box(cx - bw / 2, cy - bd / 2, bw, bd, 0, 12, STONE); A.courses(b, 3, STONE_D);
    const bay = A.onL(b, bw * 0.15, bw * (big ? 0.5 : 0.62), 0, 9); poly(bay, '#2a201a', null);
    forgeGlow(b.x + bw * 0.3, b.y + bd - 0.05, 3);
    if (big) { const bay2 = A.onL(b, bw * 0.58, bw * 0.88, 0, 9); poly(bay2, '#2a201a', null); forgeGlow(b.x + bw * 0.72, b.y + bd - 0.05, 3); }
    A.win(b, 'R', bd * 0.5, 4, 0.16, 4);
    top = roof(b, 13, 'x', m);
    A.chimney(b.x + 0.15, b.y + 0.2, b.z + b.h + 2, 16 + band * 2, 'smithy', '#7a7068');
    anvil(b.x + bw * 0.4, b.y + bd + 0.3);
    // horseshoe sign over the bay
    const sp = A.onL(b, bw * 0.4, 0, 10.5, 0)[0]; horseshoe(sp[0], sp[1] - 1, 1.1);
    // tool rack on the right wall
    for (let k = 0; k < 3; k++) { const p = A.onR(b, 0.15 + k * 0.12, 0, 8, 0)[0]; line(p, [p[0], p[1] + 5], '#6a4a30', 0.8); poly([[p[0] - 1, p[1] + 5], [p[0] + 1.2, p[1] + 5], [p[0] + 1, p[1] + 7], [p[0] - 0.8, p[1] + 7]], '#9aa0a8', null); }
    if (band >= 2) { // wheelwright: wheels leaning, a grindstone
      for (let k = 0; k < 2 + (big ? 1 : 0); k++) cartwheel(...P(x + 0.35 + k * 0.18, y + d - 0.55, 4.2), 4);
      const [gx, gy] = P(x + w - 0.55, y + 0.5); line([gx - 3, gy], [gx - 3, gy - 5], '#6a4a30', 1); line([gx + 3, gy], [gx + 3, gy - 5], '#6a4a30', 1); circ(gx, gy - 6, 3.5, '#b8b0a2', A.OUT);
    }
    if (s >= 2 || big) A.lantern(...A.onL(b, bw * 0.08, 0, 9, 0)[0], 1.2);
    return top;
  });

  // =====================================================================
  //  ARMORY — a stone store with shields → heraldic timber armoury → crenellated stone armoury → tower
  // =====================================================================
  reg('armory', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2;
    dirt(x + 0.2, y + 0.2, w - 0.4, d - 0.4, '#bca880');
    let top;
    const bw = [0.85, 1.15, 1.3, 1.3][band], bd = [0.7, 0.85, 0.95, 0.95][band], H = [10, 14, 20, 22][band];
    if (band >= 3) { // round corner tower at the back-left
      const tg = [cx - bw / 2 - 0.05, cy - bd / 2 - 0.05];
      A.cyl(tg[0], tg[1], 0.3, 0, 38, STONE); A.cone(tg[0], tg[1], 0.36, 38, 18, m.col); A.flagpole(tg[0], tg[1], 56, 10, '#c0392b', 9);
    }
    const stone = band !== 1 || stoneOK();
    const b = box(cx - bw / 2, cy - bd / 2, bw, bd, 0, H, stone ? STONE : WALLS[1]);
    if (stone) A.courses(b, 3, STONE_D); else A.timber(b, BEAM);
    // iron-studded double door
    const dq = A.onL(b, bw * 0.4, bw * 0.62, 0, Math.min(10, H - 2)); poly(dq, '#4a2e1e', '#2a1a10', 0.8);
    for (let k = 1; k < 4; k++) line(lerp(dq[0], dq[3], k / 4), lerp(dq[1], dq[2], k / 4), '#2a2420', 0.7);
    // painted shields along both faces
    const nL = Math.max(2, Math.round(bw / 0.28)), nR = Math.max(2, Math.round(bd / 0.28));
    for (let k = 0; k < nL; k++) { const u = (k + 0.5) * bw / nL; if (u > bw * 0.33 && u < bw * 0.69) continue; const p = A.onL(b, u, 0, H - 4, 0)[0]; shield(p[0], p[1], CLOTH[k % 4], 0.8, k % 3); }
    for (let k = 0; k < nR; k++) { const p = A.onR(b, (k + 0.5) * bd / nR, 0, H - 4, 0)[0]; shield(p[0], p[1], CLOTH[(k + 2) % 4], 0.8, (k + 1) % 3); }
    if (band >= 2) {
      A.parapet({ x: b.x, y: b.y, w: bw, d: bd, z: 0, h: H, col: STONE }, 3);
      top = H + 5;
      const rb = box(cx - bw * 0.3, cy - bd * 0.3, bw * 0.6, bd * 0.6, H, 6, STONE);
      top = spire({ ...rb, h: 6 }, 10, m.col); void rb;
      // armour on stands
      for (let k = 0; k < 2; k++) { const [ax, ay] = P(x + w - 0.5, y + d - 0.9 + k * 0.32); line([ax, ay], [ax, ay - 6], '#5a3a22', 1); poly([[ax - 2.4, ay - 6], [ax + 2.4, ay - 6], [ax + 2, ay - 11], [ax - 2, ay - 11]], '#a8aeb8'); circ(ax, ay - 12.5, 1.8, '#a8aeb8', A.OUT); }
    } else top = roof(b, band === 0 ? 10 : 12, 'x', m);
    // weapon rack and a banner
    pikeRack(cx - bw / 2 - 0.05, cy + bd / 2 + 0.2, true, 4);
    if (band >= 1) A.banner(cx + bw / 2 + 0.15, cy + bd / 2 + 0.1, 0, 22, '#c0392b');
    if (s >= 2) A.lantern(...A.onL(b, bw * 0.3, 0, 8, 0)[0], 1.2);
    return top;
  });

  // =====================================================================
  //  ACADEMY — a schoolhouse with a bell → timber school with a lantern cupola → stone college with tall
  //  windows round a lawn → library wing and an observatory dome
  // =====================================================================
  reg('academy', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(true), cx = x + w / 2, cy = y + d / 2, alongX = w >= d;
    grassPatch(x + 0.15, y + 0.15, w - 0.3, d - 0.3);
    let top;
    if (band === 0) {
      const h = house(cx - 0.5, cy - 0.38, 1.0, 0.76, 11, { m, axis: 'x', wall: WALLS[3], shut: '#3f6fa8', chim: 'house' });
      top = cupola(cx, cy, h.top - 3, 0.1, 5, true);
      bench(cx - 0.3, cy + 0.6);
      if (s >= 2) { const [bx, by] = P(cx + 0.65, cy + 0.4); poly([[bx - 4, by - 4], [bx + 4, by - 6], [bx + 4, by - 1], [bx - 4, by + 1]], '#2a3a2e', '#6a4a30', 1); }
      return top;
    }
    if (band >= 3) { // library wing at the back and an observatory dome
      const lw = alongX ? 0.7 : 0.6, ld = alongX ? 0.6 : 0.7;
      const lib = house(x + 0.2, y + 0.2, lw, ld, 16, { m, stone: true, axis: alongX ? 'y' : 'x', wins: false, door: false });
      archWin(lib.b, 'L', lw * 0.5, 4, 0.14, 9); archWin(lib.b, 'R', ld * 0.5, 4, 0.14, 9);
      const ox = x + w - 0.5, oy = y + 0.5;
      A.cyl(ox, oy, 0.3, 0, 18, STONE);
      A.dome(ox, oy, 0.32, 18, 12, X.era >= 2 ? '#6aa89a' : m.col);
      const [sx, sy] = P(ox, oy + 0.1, 24); line([sx - 1, sy + 4], [sx + 4, sy - 6], '#3a2a20', 1.6);
      if (X.tech('cartography')) { const [tx, ty] = P(ox, oy, 30); line([tx, ty + 2], [tx + 7, ty - 4], '#c9a03a', 1.6); }
    }
    const bw = alongX ? Math.min(1.5, w - 0.7) : 1.0, bd = alongX ? 0.9 : Math.min(1.4, d - 0.6);
    const two = band >= 2, stone = band >= 2 || stoneOK();
    const H = band === 1 ? 14 : 22;
    const b0 = box(cx - bw / 2, cy - bd / 2, bw, bd, 0, H, stone ? STONE : WALLS[3]);
    if (stone) A.courses(b0, 3.5, STONE_D); else A.timber(b0, BEAM);
    if (two) { for (let k = 0; k < Math.round(bw / 0.3); k++) archWin(b0, 'L', (k + 0.5) * bw / Math.round(bw / 0.3), 3, 0.13, 8); for (let k = 0; k < Math.round(bd / 0.3); k++) archWin(b0, 'R', (k + 0.5) * bd / Math.round(bd / 0.3), 3, 0.13, 8); winRow(b0, 'R', 13.5, 4, 0.13, 0.3); winRow(b0, 'L', 13.5, 4, 0.13, 0.3); }
    else { winRow(b0, 'L', 4, 5, 0.16, 0.34, 1); winRow(b0, 'R', 4, 5, 0.16, 0.34); }
    A.door(b0, 'L', bw / 2, 0.26, 9, '#5a3420');
    top = roof(b0, (alongX ? bd : bw) * 15, alongX ? 'x' : 'y', m);
    top = cupola(cx, cy, top - 4, two ? 0.14 : 0.11, two ? 8 : 6, !two, two ? 'spire' : 'cone');
    if (band >= 2) A.chimney(b0.x + 0.15, b0.y + 0.2, H + 3, 10, 'hall');
    if (X.tech('medicine')) { vegBed(x + w - 0.7, y + d - 0.5, 0.45, 0.25); }
    if (s >= 1) bench(cx - 0.4, y + d - 0.3);
    if (s >= 3 || band >= 2) lampPost(x + 0.25, y + d - 0.25);
    return top;
  });

  // =====================================================================
  //  TAVERN — an alehouse with an ale-stake → inn with a swinging sign → coaching inn → three-gabled inn
  //  with a beer garden under bunting
  // =====================================================================
  reg('tavern', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), alongX = w >= d, cx = x + w / 2, cy = y + d / 2;
    const long = alongX ? w : d, short = alongX ? d : w;
    const bl = Math.min(long - 0.4, [0.9, 1.15, 1.5, 1.75][band]), bs = Math.min(short - 0.35, [0.75, 0.85, 0.95, 1.0][band]);
    const bw = alongX ? bl : bs, bd = alongX ? bs : bl;
    const bx = alongX ? x + 0.15 : cx - bw / 2 - 0.05, by = alongX ? cy - bd / 2 - 0.05 : y + 0.15;
    let h;
    if (band <= 1) h = house(bx, by, bw, bd, band === 0 ? 11 : 13, { m, axis: alongX ? 'x' : 'y', wall: WALLS[1], shut: '#5e8f3e', chim: 'house', door: false });
    else h = house(bx, by, bw, bd, band === 2 ? 22 : 24, { two: true, stone: stoneOK(), m, axis: alongX ? 'x' : 'y', wall: WALLS[(band + 1) % 4], shut: '#5e8f3e', chim: 'hall', door: false });
    const fb = h.lo || h.b, side = alongX ? 'L' : 'R', Lf = alongX ? fb.w : fb.d, f = side === 'L' ? A.onL : A.onR;
    poly(f(fb, Lf * 0.42, Lf * 0.58, 0, 8.5), '#6b3e22', null);
    let top = h.top;
    if (band >= 2) { const La = h.axis === 'x' ? h.b.w : h.b.d; dormer(h.b, h.rh, La * 0.28, m, 0.26, h.axis); dormer(h.b, h.rh, La * 0.74, m, 0.26, h.axis); if (band >= 3) dormer(h.b, h.rh, La * 0.51, m, 0.26, h.axis); }
    // sign
    const sp = f(fb, Lf * 0.68, 0, Math.min(fb.h + 2, 11), 0)[0];
    if (band === 0) { // ale-stake: a pole with a green bush
      line(sp, [sp[0] + (side === 'L' ? -8 : 8), sp[1] - 3], '#5a3a22', 1.2); const bp = [sp[0] + (side === 'L' ? -8 : 8), sp[1] + 1]; circ(bp[0], bp[1], 2.8, A.SNOW ? '#7a8a7a' : '#4f8a3e', A.OUT);
    } else { line(sp, [sp[0] + (side === 'L' ? -7 : 7), sp[1] - 2], '#3a2a20', 1); const q = [sp[0] + (side === 'L' ? -7 : 7), sp[1] - 2]; poly([[q[0] - 3, q[1] + 1], [q[0] + 3, q[1] + 1], [q[0] + 3, q[1] + 8], [q[0] - 3, q[1] + 8]], '#3f6fa8'); poly([[q[0] - 1.4, q[1] + 3], [q[0] + 1.2, q[1] + 3], [q[0] + 1.2, q[1] + 6.5], [q[0] - 1.4, q[1] + 6.5]], '#e2b84a', null); }
    // lanterns either side of the door
    const lp = f(fb, Lf * 0.36, 0, 8, 0)[0]; A.lantern(lp[0], lp[1], 1.3);
    if (band >= 1) { const lq = f(fb, Lf * 0.64, 0, 8, 0)[0]; A.lantern(lq[0], lq[1], 1.3); }
    // barrels and benches out front; a beer garden at band 3
    const ex = alongX ? x + w - 0.45 : x + w - 0.45, ey = alongX ? y + d - 0.3 : y + d - 0.45;
    A.barrel(ex, ey - 0.15); if (band >= 1) A.barrel(ex - 0.15, ey);
    if (alongX) bench(bx + 0.15, by + bd + 0.28); else bench(bx + bw + 0.15, by + 0.3);
    if (band >= 3) {
      const gx0 = alongX ? x + 0.2 : bx + bw + 0.05, gy0 = alongX ? by + bd + 0.05 : y + 0.2;
      for (let k = 0; k < 2; k++) { const tx = gx0 + (alongX ? 0.35 + k * 0.5 : 0.1), ty = gy0 + (alongX ? 0.12 : 0.4 + k * 0.5); box(tx, ty, 0.24, 0.16, 3, 1, '#9a6a3c'); }
      bunting(f(fb, Lf * 0.1, 0, fb.h, 0)[0], P(alongX ? x + w - 0.2 : x + w - 0.15, alongX ? y + d - 0.15 : y + d - 0.2, 14), 6, 9);
    }
    if (s >= 2 && band <= 1) A.cyl(alongX ? x + w - 0.3 : cx + 0.35, alongX ? cy - 0.3 : y + d - 0.3, 0.12, 0, 3, OAK, A.SNOW ? '#eef2f4' : '#4f8a3e');
    return top;
  });

  // =====================================================================
  //  THEATRE — a mummers' wagon → an open timber stage with curtains → a round thatched playhouse
  //  (a little Globe) → the grand playhouse with a flag and a tiring house
  // =====================================================================
  reg('theatre', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(true), cx = x + w / 2, cy = y + d / 2, alongX = w >= d;
    grassPatch(x + 0.1, y + 0.1, w - 0.2, d - 0.2);
    let top;
    if (band <= 1) {
      // benches facing the stage
      for (let k = 0; k < 2 + band; k++) bench(alongX ? cx - 0.6 + k * 0.4 : cx + 0.25, alongX ? cy + 0.3 : cy - 0.6 + k * 0.4);
      if (band === 0) { // painted wagon with a pop-up stage
        const gx = alongX ? cx - 0.4 : cx - 0.45, gy = alongX ? cy - 0.45 : cy - 0.4;
        const ww = alongX ? 0.8 : 0.45, dd = alongX ? 0.45 : 0.8;
        const b = box(gx, gy, ww, dd, 3, 9, '#c0392b');
        for (const [px, py] of alongX ? [[gx + 0.15, gy + dd], [gx + ww - 0.15, gy + dd]] : [[gx + ww, gy + 0.15], [gx + ww, gy + dd - 0.15]]) cartwheel(...P(px, py, 3), 3);
        poly((alongX ? A.onL : A.onR)(b, 0.1, (alongX ? ww : dd) - 0.1, 2, 8), '#e0b84a', null);
        top = A.gable(b, 7, '#3f6fa8', alongX ? 'x' : 'y', null, 0.06);
        A.rec('flags', { x: P(gx + ww / 2, gy + dd / 2, top)[0], y: P(gx + ww / 2, gy + dd / 2, top)[1] - 4, col: '#e0b84a', len: 8, seed: A.R(), pole: 6 });
        return top + 6;
      }
      // a raised plank stage under a canopy with striped curtains
      const sw = alongX ? 1.1 : 0.7, sd = alongX ? 0.7 : 1.1, gx = cx - sw / 2, gy = cy - sd / 2 - (alongX ? 0.15 : 0), gx2 = alongX ? gx : gx - 0.15;
      const st = box(gx2, gy, sw, sd, 0, 4, '#9a6a3c');
      for (let k = 1; k < 6; k++) line(alongX ? P(gx2 + sw * k / 6, gy, 4) : P(gx2, gy + sd * k / 6, 4), alongX ? P(gx2 + sw * k / 6, gy + sd, 4) : P(gx2 + sw, gy + sd * k / 6, 4), '#7a5230', 0.5);
      const back = alongX ? box(gx2, gy, sw, 0.08, 4, 14, '#7a2a2a') : box(gx2, gy, 0.08, sd, 4, 14, '#7a2a2a'); void back;
      for (const [px, py] of [[gx2 + sw, gy + sd], [alongX ? gx2 : gx2 + sw, alongX ? gy + sd : gy]]) box(px - 0.04, py - 0.04, 0.08, 0.08, 4, 14, OAK);
      awning({ x: gx2, y: gy, w: sw, d: sd }, alongX ? 'L' : 'R', 0.02, (alongX ? sw : sd) - 0.02, 19, 0.12, '#c0392b', '#e0b84a');
      A.person(...P(gx2 + sw * 0.5, gy + sd * 0.5, 4), '#3f6fa8', 0.85);
      top = 20;
      if (s >= 2) { A.pennant(gx2 + sw, gy, 4, 22, '#c0392b'); }
      return top;
    }
    // the round playhouse: timbered drum, galleried, a thatched ring roof open to the sky
    const big = band >= 3, R = Math.min(Math.min(w, d) * 0.46, big ? 0.68 : 0.58), H = big ? 18 : 15;
    A.cyl(cx, cy, R, 0, H, WALLS[0], '#7a5a3a');
    const [ex, ey, rx, ry] = A.ell(cx, cy, 0, R);
    for (let k = 1; k < 10; k++) { const a = Math.PI * k / 10, xx = ex - Math.cos(a) * rx, yy = ey + Math.sin(a) * ry; line([xx, yy], [xx, yy - H], BEAM, 1); }
    for (const v of [H * 0.45, H - 1]) { A.c.beginPath(); A.c.ellipse(ex, ey - v, rx, ry, 0, 0, Math.PI); A.c.strokeStyle = A.F(BEAM); A.c.lineWidth = 1.2; A.c.stroke(); }
    for (let k = 1; k < 8; k++) { const a = Math.PI * k / 8, xx = ex - Math.cos(a) * rx * 0.98, yy = ey + Math.sin(a) * ry * 0.98; A.lamp([[xx - 1, yy - H * 0.55], [xx + 1, yy - H * 0.55], [xx + 1, yy - H * 0.55 - 3.5], [xx - 1, yy - H * 0.55 - 3.5]], '#4b5a6b', A.nightGlass()); }
    // ring roof
    const rc = A.SNOW ? '#eef2f4' : X.era >= 2 ? m.col : THATCH;
    const [ox, oy, orx, ory] = A.ell(cx, cy, H, R + 0.08), [ix, iy, irx, iry] = A.ell(cx, cy, H + 6, R * 0.55);
    A.c.beginPath(); A.c.ellipse(ox, oy, orx, ory, 0, 0, TAU); A.c.fillStyle = A.F(shade(rc, -0.15)); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.8; A.c.stroke();
    A.c.beginPath(); A.c.ellipse(ox, oy, orx, ory, 0, 0, Math.PI); A.c.lineTo(ix - irx, iy); A.c.ellipse(ix, iy, irx, iry, 0, Math.PI, 0, true); A.c.closePath(); A.c.fillStyle = A.F(rc); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.stroke();
    A.c.beginPath(); A.c.ellipse(ix, iy, irx, iry, 0, 0, TAU); A.c.fillStyle = A.F(A.SNOW ? '#e8ecee' : '#a8b878'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.stroke();
    // the stage roof peeking up at the back of the yard
    const sb = { x: cx - R * 0.35, y: cy - R * 0.6, w: R * 0.7, d: R * 0.35, z: H + 2, h: 4, col: WALLS[0] }; box(sb.x, sb.y, sb.w, sb.d, sb.z, sb.h, WALLS[0]); top = A.gable(sb, 7, m.col, 'x', null, 0.04);
    // the playhouse flag on a mast in the middle of the yard (the stock finial lands on its tip)
    const mz = Math.max(top + 6, H + 26); line(P(cx, cy, H + 6), P(cx, cy, mz), '#4a3a2a', 1.3); A.rec('flags', { x: P(cx, cy, mz)[0], y: P(cx, cy, mz)[1] + 1, col: '#c0392b', len: 10, seed: A.R() });
    top = mz - 8;
    if (big) { // tiring house hut and lanterns
      const tb = box(alongX ? x + 0.15 : cx + R + 0.02, alongX ? cy - 0.25 : y + 0.15, 0.3, 0.3, 0, 10, WALLS[1]); A.timber(tb, BEAM); roof(tb, 7, 'x', m);
      lampPost(alongX ? x + w - 0.2 : cx - 0.5, alongX ? cy + 0.5 : y + d - 0.2);
    }
    // door
    poly([P(cx + R * 0.7, cy + R * 0.7, 0), P(cx + R * 0.85, cy + R * 0.5, 0), P(cx + R * 0.85, cy + R * 0.5, 8), P(cx + R * 0.7, cy + R * 0.7, 8)], '#5a3420', null);
    return top + 8;
  });

  // =====================================================================
  //  TEMPLE — a wayside chapel → village church with a bell-cote → cruciform church with a crossing
  //  tower → the crossing tower carries a tall spire; a lychgate and yews
  // =====================================================================
  reg('temple', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(true), cx = x + w / 2, cy = y + d / 2;
    grassPatch(x + 0.1, y + 0.1, w - 0.2, d - 0.2);
    let top;
    const yew = (gx, gy, sc = 0.8) => { const [tx, ty] = P(gx, gy); A.c.beginPath(); A.c.ellipse(tx, ty - 9 * sc, 4.2 * sc, 9 * sc, 0, 0, TAU); A.c.fillStyle = A.F(A.SNOW ? '#d8e2e0' : '#2f5a36'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.6; A.c.stroke(); circ(tx - 1.2 * sc, ty - 12 * sc, 1.6 * sc, A.SNOW ? '#f2f6f8' : '#3f6f44', null); };
    yew(x + 0.3, y + 0.35);
    if (band === 0) {
      const b = box(cx - 0.35, cy - 0.3, 0.7, 0.6, 0, 10, stoneOK() ? STONE : WALLS[3]);
      if (stoneOK()) A.courses(b, 3, STONE_D);
      archWin(b, 'R', 0.3, 3, 0.12, 6); A.door(b, 'L', 0.35, 0.2, 7, '#5a3420');
      top = roof(b, 12, 'x', m);
      // bell gable on the front end
      const gp = P(cx + 0.35, cy, top - 1); line([gp[0], gp[1]], [gp[0], gp[1] - 8], STONE_D, 3); bell(gp[0], gp[1] - 4, 1.6);
      if (s >= 2) { A.lantern(...A.onL(b, 0.12, 0, 7, 0)[0], 1.1); }
      return top + 2;
    }
    const stone = band >= 2 || stoneOK();
    const wall = stone ? STONE : WALLS[3];
    if (band === 1) { // nave along x through the centre, a little bell-cote on the west end
      const b = box(cx - 0.6, cy - 0.33, 1.2, 0.66, 0, 13, wall);
      if (stone) A.courses(b, 3, STONE_D);
      for (const u of [0.3, 0.6, 0.9]) archWin(b, 'L', u, 3.5, 0.12, 7);
      archWin(b, 'R', 0.33, 4, 0.14, 7);
      A.door(b, 'L', 0.1, 0.16, 8, '#5a3420');
      top = roof(b, 13, 'x', m);
      cupola(cx + 0.45, cy, top - 3, 0.1, 6, true, 'spire');
      yew(x + w - 0.3, y + 0.35, 0.7);
      return top;   // the nave ridge passes over the slot centre
    }
    // cruciform: nave (x), transepts (y), central tower over the slot centre
    const nl = 0.75, nw = 0.62, H = band >= 3 ? 16 : 14;
    const nave = box(cx - nl - 0.05, cy - nw / 2, nl * 2 + 0.1, nw, 0, H, wall); A.courses(nave, 3, STONE_D);
    for (const u of [0.25, 0.55, 1.05, 1.35]) archWin(nave, 'L', u, 4, 0.12, 8);
    A.door(nave, 'L', 0.1, 0.16, 9, '#5a3420');
    roof(nave, 13, 'x', m);
    const tr = box(cx - nw / 2, cy - nl + 0.1, nw, (nl - 0.1) * 2, 0, H, wall); A.courses(tr, 3, STONE_D);
    archWin(tr, 'L', nw / 2, 3, 0.2, 10); archWin(tr, 'R', 0.2, 4, 0.12, 8); archWin(tr, 'R', tr.d - 0.2, 4, 0.12, 8);
    roof(tr, 13, 'y', m);
    const tw = 0.5, th = H + 14 + (band >= 3 ? 8 : 0) + s;
    const tb = box(cx - tw / 2, cy - tw / 2, tw, tw, H, th - H, STONE); A.courses(tb, 3.5, STONE_D);
    for (const side of ['L', 'R']) { const f = side === 'L' ? A.onL : A.onR; poly(f(tb, 0.16, 0.34, th - H - 9, th - H - 3), '#2a2420', null); }
    if (X.era >= 1) clock(A.onL(tb, tw / 2, tw / 2, th - H - 13, 0)[0], 2.4);
    if (band >= 3) {
      A.parapet({ x: tb.x - 0.03, y: tb.y - 0.03, w: tw + 0.06, d: tw + 0.06, z: th - 0.5, h: 0, col: STONE }, 2.2);
      top = spire({ x: cx - tw * 0.38, y: cy - tw * 0.38, w: tw * 0.76, d: tw * 0.76, z: th, h: 0, col: STONE }, 34 + s * 2, X.era >= 2 ? SLATE : m.col);
      top = weathercock(cx, cy, top) - 4;
      // lychgate at the front
      const lg = [x + w - 0.55, y + d - 0.35];
      for (const [px, py] of [[lg[0], lg[1]], [lg[0] + 0.32, lg[1]], [lg[0], lg[1] + 0.14], [lg[0] + 0.32, lg[1] + 0.14]]) line(P(px, py), P(px, py, 8), OAK, 1.2);
      roof({ x: lg[0] - 0.02, y: lg[1] - 0.02, w: 0.36, d: 0.18, z: 8, h: 0, col: OAK }, 5, 'x', m, { o: 0.06 });
      yew(x + w - 0.25, y + 0.4, 0.75); yew(x + 0.35, y + d - 0.35, 0.65);
    } else { A.parapet({ x: tb.x - 0.03, y: tb.y - 0.03, w: tw + 0.06, d: tw + 0.06, z: th - 0.5, h: 0, col: STONE }, 2.2); top = th + 4; A.flagpole(cx, cy, th + 2, 8, '#e0b84a', 7); }
    if (s >= 2) A.lantern(...A.onL(nave, 0.22, 0, 8, 0)[0], 1.1);
    return top;
  });

  // =====================================================================
  //  MAGE TOWER — the star-tower: thatched stone tower with a star vane → crooked tower under a
  //  pointed hat → balcony and brass orrery → a domed observatory with a great telescope
  // =====================================================================
  reg('magetower', ([x, y, w, d], L, band) => {
    // the hedge-wizard's star-tower: a squat thatched stone tower with a star on its vane (1-4), a crooked
    // tower under a pointed hat (5-9), a balcony and brass orrery wheeling round the hat (10-14), and at
    // last an observatory: a domed top with an open slit and a great telescope (15+). Thatch → slate → copper → gilt by era.
    const M = CITYART.mage, s = sub(L, band), cx = x + w / 2, cy = y + d / 2, era = Math.max(0, Math.min(3, X.era | 0)), c = A.c;
    const segs = [1, 2, 3, 3][band], sh = [16, 14, 14, 15][band] + Math.min(4, s), r0 = band === 0 ? 0.44 : 0.38;
    const GOLDC = '#e2b84a', BRASS = era >= 3 ? '#e8c060' : '#c9a03a';
    if (band >= 2) M.groundCircle(A, cx, cy, 0.68, 'rgba(70,90,170,0.45)', '#c8d8ff', 16);
    vegBed(x + 0.1, y + d - 0.35, 0.5, 0.2);
    let z = 0, ox = 0, oy = 0;
    for (let k = 0; k < segs; k++) {
      const r = r0 - k * 0.035, col = k % 2 ? '#b8ae9c' : '#c8bea8';
      A.cyl(cx + ox, cy + oy, r, z, sh, col);
      const p = P(cx + ox + r * 0.7, cy + oy + r * 0.7, z + sh * 0.55); circ(p[0], p[1], 2.4, '#6a5a4a', null); A.lampDot(p[0], p[1], 1.7, '#5a6aa8', '#c8d8ff');
      if (band >= 1) M.pulse(A, p[0], p[1], 7, '#a8c0ff', 1.6);
      if (k % 2 === 1) { const q = P(cx + ox - r * 0.3, cy + oy + r * 0.95, z + sh * 0.5); circ(q[0], q[1], 2, '#6a5a4a', null); A.lampDot(q[0], q[1], 1.4, '#5a6aa8', '#c8d8ff'); }
      z += sh; ox += (k % 2 ? -0.04 : 0.05); oy += 0.03;
    }
    const tx = cx + ox, ty = cy + oy, rt = r0 - segs * 0.035 + 0.06;
    let top, orb;
    if (band === 0) { // thatched cone and a star on the weathervane
      const [bx, by, brx] = A.ell(tx, ty, z, rt + 0.12), hh = 18 + s;
      A.cone(tx, ty, rt + 0.12, z, hh, '#c9a95a');
      if (!A.GLOW && !A.SNOW) { c.beginPath(); for (let k = -3; k <= 3; k++) { c.moveTo(bx, by - hh + 2); c.lineTo(bx + k * brx / 3.2, by - 1); } c.strokeStyle = 'rgba(110,80,30,0.45)'; c.lineWidth = 0.6; c.stroke(); }
      const [vx, vy] = P(tx, ty, z + hh); line([vx, vy], [vx, vy - 8], '#5a4a3a', 1);
      star(vx, vy - 10, 3, GOLDC); top = z + hh + 12; orb = [vx, vy - 10];
    } else if (band <= 2) { // the leaning pointed hat
      if (band === 2) { // balcony ring with railings
        A.cyl(tx, ty, rt + 0.14, z - 3, 2, '#7a5434');
        const [ex, ey, rx, ry] = A.ell(tx, ty, z - 1, rt + 0.14);
        for (let k = 0; k < 9; k++) { const a = Math.PI * (k + 0.5) / 9; line([ex - Math.cos(a) * rx, ey + Math.sin(a) * ry], [ex - Math.cos(a) * rx, ey + Math.sin(a) * ry - 4], '#5a3a22', 0.7); }
        c.beginPath(); c.ellipse(ex, ey - 4, rx, ry, 0, 0, Math.PI); c.strokeStyle = A.F('#5a3a22'); c.lineWidth = 0.8; c.stroke();
      }
      const [bx0, by0, brx, bry] = A.ell(tx, ty, z + 2, rt + 0.04), hh = 26 + band * 6 + s;
      const tip = [bx0 + 7 + band * 2, by0 - hh], mid = [bx0 + 2, by0 - hh * 0.55];
      const hc = A.SNOW ? '#e8eef2' : era >= 3 ? '#3a3a7a' : era >= 1 ? '#4a4a8a' : '#8a7448';
      c.beginPath(); c.moveTo(bx0 - brx, by0); c.quadraticCurveTo(mid[0] - brx * 0.45, mid[1], tip[0], tip[1]); c.quadraticCurveTo(mid[0] + brx * 0.55, mid[1] + 3, bx0 + brx, by0); c.ellipse(bx0, by0, brx, bry, 0, 0, Math.PI); c.closePath();
      A.gradFill(bx0 - brx, bx0 + brx, hc);
      if (era >= 2) { c.beginPath(); c.ellipse(bx0, by0 - 3, brx * 0.92, bry, 0, 0, Math.PI); c.strokeStyle = A.F(GOLDC); c.lineWidth = 1.4; c.stroke(); }
      for (let k = 0; k < 4 + band * 2; k++) { const t = (k * 0.37 + 0.15) % 0.8 + 0.1; const p = [bx0 + (tip[0] - bx0) * t + (k % 2 ? -2 : 2) * (1 - t), by0 + (tip[1] - by0) * t]; A.lampDot(p[0], p[1], 0.9, '#f2d870', '#fff4b0'); }
      star(tip[0], tip[1] - 1, 2.4, GOLDC); orb = [tip[0], tip[1] + 6]; top = z + 2 + hh * 0.8;
      // herbs under the eave
      const [hx, hy] = P(tx + rt, ty + rt * 0.3, z - 2); for (let k = 0; k < 3; k++) { line([hx + k * 2, hy], [hx + k * 2, hy + 4], '#5a3a22', 0.5); circ(hx + k * 2, hy + 5, 1.2, A.SEASON === 2 ? '#a0803a' : '#5e8f3e', null); }
      if (band === 2) { // the brass orrery: rings round the hat, planets wheel on them after dark
        const [ox2, oy2, orx, ory] = A.ell(tx, ty, z + 12, rt + 0.34);
        for (const [k, tilt] of [[1, 0.18], [0.82, -0.25]]) { c.beginPath(); c.ellipse(ox2, oy2, orx * k, ory * k * 1.6, tilt, 0, Math.PI * 2); c.strokeStyle = A.GLOW ? '#ffe9a0' : BRASS; c.lineWidth = 0.9; c.stroke(); }
        M.ring(A, tx, ty, z + 12, rt + 0.3, '#ffe39a', 4, 0.5);
        const [sx, sy] = P(tx + rt + 0.05, ty, z + 3); line([sx, sy], [sx + 8, sy - 6], BRASS, 1.8);
      }
    } else { // the observatory: a wide drum, a dome split by a lit slit, and a great telescope
      A.cyl(tx, ty, rt + 0.1, z, 6, '#c8bea8'); z += 6;
      A.cyl(tx, ty, rt + 0.16, z, 1.6, '#7a5434');
      const dc = A.SNOW ? '#e8eef2' : era >= 3 ? '#d8b04a' : era >= 2 ? '#5fa08a' : '#5a6a8a', dh = 18 + s;
      A.dome(tx, ty, rt + 0.12, z + 1.6, dh, dc);
      const [sx, sy] = P(tx + 0.05, ty + rt * 0.5, z + 1.6);
      A.lamp([[sx - 2, sy - 1], [sx + 2, sy - 1], [sx + 1.2, sy - dh + 3], [sx - 1.2, sy - dh + 3]], '#1e2440', '#d8e4ff');
      M.pulse(A, sx, sy - dh * 0.5, 10, '#c0d4ff', 1.2);
      // the telescope out of the slit, angled to the sky; a brass armillary on the gallery
      c.beginPath(); c.moveTo(sx - 1, sy - dh * 0.55); c.lineTo(sx + 14, sy - dh - 10); c.strokeStyle = A.F('#3a2a1a'); c.lineWidth = 4.2; c.stroke();
      c.beginPath(); c.moveTo(sx - 1, sy - dh * 0.55); c.lineTo(sx + 14, sy - dh - 10); c.strokeStyle = A.F(BRASS); c.lineWidth = 2.8; c.stroke();
      circ(sx + 14, sy - dh - 10, 1.8, '#3a2a1a', null); A.lampDot(sx + 14, sy - dh - 10, 1.1, '#5a6aa8', '#e8f0ff');
      const [gx2, gy2] = P(tx - rt - 0.05, ty + 0.1, z + 6);
      for (const tl of [0.5, -0.5, 0]) { c.beginPath(); c.ellipse(gx2, gy2, 4, tl ? 2 : 4, tl, 0, Math.PI * 2); c.strokeStyle = A.F(BRASS); c.lineWidth = 0.8; c.stroke(); }
      A.lampDot(gx2, gy2, 1.2, '#f2d870', '#fff4b0');
      M.ring(A, tx, ty, z + dh * 0.6, rt + 0.42, '#ffe39a', 5, 0.35);
      const [px2, py2] = P(tx, ty, z + 1.6 + dh); star(px2, py2 - 4, 2.6, GOLDC);
      orb = [px2, py2 - 4]; top = z + dh + 8;
    }
    A.rec('magic', { x: orb[0], y: orb[1], r: 8 + band * 3 + Math.min(6, L / 3), n: 3 + band * 2, col: 'rgba(150,180,255,A)', seed: A.R(), bolt: false });
    A.rec('lights', { x: orb[0], y: orb[1], r: 20 + band * 6 });
    A.door({ x: cx - r0, y: cy - r0, w: r0 * 2, d: r0 * 2, z: 0 }, 'L', r0 * 0.9, 0.16, 7, '#3a3a6a');
    if (band >= 1) { const [bx, by] = P(x + w - 0.25, y + d - 0.15); line([bx, by], [bx, by - 7], '#5a4a3a', 1); A.lampDot(bx, by - 8, 1.3, '#e8b85a', '#ffd46e'); A.rec('lights', { x: bx, y: by - 8, r: 9 }); }
    return top;
    function star(sx0, sy0, r, col) { const pts = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; pts.push([sx0 + Math.cos(a) * rr, sy0 + Math.sin(a) * rr]); } A.lamp(pts, col, '#fff6c0'); if (!A.GLOW) A.poly(pts, null, '#7a5a1a', 0.5); M.pulse(A, sx0, sy0, 6 + r, '#ffe39a', 2.2); }
  });

  // =====================================================================
  //  HIDEOUT — a tumbledown hay barn with a cellar hatch; a shuttered lamp; more clutter and a
  //  smugglers' cart as it grows
  // =====================================================================
  reg('hideout', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2;
    const bw = Math.min(0.8 + band * 0.1, w - 0.4), bd = Math.min(0.6 + band * 0.08, d - 0.4);
    const b = box(cx - bw / 2, cy - bd / 2, bw, bd, 0, 9 + band, '#8a7458');
    for (let k = 1; k < 7; k++) { const u = bw * k / 7; line(A.onL(b, u, u, 0, 0)[0], A.onL(b, u, u, b.h - (k % 3) * 0.5, 0)[0], '#5a4a34', 0.6); }
    poly(A.onL(b, bw * 0.55, bw * 0.8, 0, 6.5), '#241c16', null);
    const top = roof(b, 10, 'x', { col: '#9a8a5a', tex: 'thatch', o: 0.15, k: 1 }, { col: A.SNOW ? undefined : '#9a8a5a' });
    // patched roof and a slipped board
    const pp = P(cx - bw * 0.1, cy + bd * 0.2, b.h + 4); poly([[pp[0] - 3, pp[1]], [pp[0] + 3, pp[1] - 1], [pp[0] + 3, pp[1] + 2], [pp[0] - 3, pp[1] + 3]], '#7a6a42', null);
    // the cellar hatch, half hidden by a haystack
    const hp = [cx + bw / 2 + 0.12, cy + bd / 2 - 0.05];
    poly([P(hp[0], hp[1]), P(hp[0] + 0.25, hp[1]), P(hp[0] + 0.25, hp[1] + 0.2), P(hp[0], hp[1] + 0.2)], '#5a3a22');
    line(P(hp[0] + 0.05, hp[1] + 0.1), P(hp[0] + 0.2, hp[1] + 0.1), '#2a1a10', 0.8);
    A.haystack(cx - bw / 2 - 0.05, cy + bd / 2 + 0.1, 0.5);
    // a hooded lamp, dim red at night
    const lp = A.onL(b, bw * 0.48, 0, 7, 0)[0]; A.lampDot(lp[0], lp[1], 1.4, '#a85a3a', '#ff7a4a'); A.rec('lights', { x: lp[0], y: lp[1], r: 9 });
    if (band >= 1 || s >= 2) { A.barrel(x + 0.25, y + 0.3); A.crate(x + 0.35, y + 0.45, 0.2); }
    if (band >= 2) cart(cx + bw / 2 - 0.1, cy - bd / 2 - 0.35 < y ? cy - bd / 2 : cy - bd / 2 - 0.35, true, 'sacks');
    if (band >= 3) { A.crate(x + w - 0.35, y + 0.3, 0.22); A.crate(x + w - 0.33, y + 0.32, 0.18, 4.8); }
    return top;
  });

  // =====================================================================
  //  SHRINE — a harvest shrine: a little roofed niche on a post with a corn dolly and candles →
  //  stone plinth, sheaves → a ring of flowers and lanterns → a yew circle and a small bell
  // =====================================================================
  reg('shrine', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2;
    const r = Math.min(w, d) * 0.4;
    if (band >= 2) { const [ex, ey] = P(cx, cy); A.c.beginPath(); A.c.ellipse(ex, ey, r * 33, r * 16.6, 0, 0, TAU); A.c.fillStyle = A.F(GRASS()); A.c.fill(); A.c.strokeStyle = A.F('rgba(60,80,20,0.3)'); A.c.lineWidth = 0.6; A.c.stroke(); }
    if (band >= 3) for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + 0.5; if (Math.sin(a) < 0) { const [tx, ty] = P(cx + Math.cos(a) * r, cy + Math.sin(a) * r); A.c.beginPath(); A.c.ellipse(tx, ty - 7, 3.2, 7, 0, 0, TAU); A.c.fillStyle = A.F(A.SNOW ? '#d8e2e0' : '#2f5a36'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.5; A.c.stroke(); } }
    // plinth and shrine house
    const base = band >= 1 ? box(cx - 0.18, cy - 0.18, 0.36, 0.36, 0, 4, STONE) : null; void base;
    const z0 = band >= 1 ? 4 : 0;
    line(P(cx, cy, z0), P(cx, cy, z0 + 8), OAK, 2.2);
    const sb = box(cx - 0.14, cy - 0.12, 0.28, 0.24, z0 + 8, 8, WALLS[0]);
    poly(A.onL(sb, 0.05, 0.23, 1, 7), '#3a2a20', null);
    const [dx, dy] = A.onL(sb, 0.14, 0, 1, 0)[0]; poly([[dx - 1.2, dy], [dx + 1.2, dy], [dx + 0.6, dy - 4.5], [dx, dy - 5.5], [dx - 0.6, dy - 4.5]], '#e0b84a', null);
    A.lampDot(dx + 1.8, dy - 1, 0.8, '#f2d870', '#fff0a0'); A.rec('lights', { x: dx, y: dy - 2, r: 10 });
    let top = roof(sb, 7, 'x', m, { o: 0.08 });
    // sheaves and candles in front
    const sheaf = (gx, gy) => { const [sx, sy] = P(gx, gy); for (let k = -2; k <= 2; k++) line([sx, sy], [sx + k * 1.2, sy - 8], A.SNOW ? '#c8c0a0' : '#d9b65a', 0.9); line([sx - 2, sy - 3], [sx + 2, sy - 3], '#8a6a2a', 1); };
    sheaf(cx + 0.3, cy + 0.25); if (band >= 1 || s >= 2) sheaf(cx - 0.25, cy + 0.32);
    for (let k = 0; k < 2 + band; k++) { const [px, py] = P(cx - 0.2 + k * 0.12, cy + 0.42); line([px, py], [px, py - 3], '#f4ecd8', 1.2); A.lampDot(px, py - 4, 0.8, '#f2c050', '#ffe080'); }
    if (band >= 2) { flowers(cx - r, cy - r * 0.2, r * 2, r * 1.2, 10); lampPost(cx + r * 0.9, cy + r * 0.3, 11); }
    if (band >= 3) { const [bx, by] = P(cx - r * 0.7, cy + r * 0.2); line([bx - 3, by], [bx - 3, by - 14], '#6a4a30', 1.2); line([bx + 3, by], [bx + 3, by - 14], '#6a4a30', 1.2); line([bx - 4, by - 14], [bx + 4, by - 14], '#6a4a30', 1.4); bell(bx, by - 11, 1.8); }
    return top;
  });

  // =====================================================================
  //  MILL & BAKERY — a post mill and an outdoor bread oven → bakehouse with its oven bump → stone tower
  //  mill and a shopfront with bread racks under an awning → great tower mill with a reefing stage
  // =====================================================================
  function breadRack(gx, gy, alongX = true) {
    const a = P(gx, gy), b = alongX ? P(gx + 0.3, gy) : P(gx, gy + 0.3);
    line(a, [a[0], a[1] - 9], '#6a4a30', 1); line(b, [b[0], b[1] - 9], '#6a4a30', 1);
    for (const v of [3, 6, 9]) { line([a[0], a[1] - v], [b[0], b[1] - v], '#6a4a30', 0.8); for (let k = 0; k < 3; k++) { const p = lerp([a[0], a[1] - v], [b[0], b[1] - v], (k + 0.5) / 3); A.c.beginPath(); A.c.ellipse(p[0], p[1] - 1, 1.8, 1.1, 0, 0, TAU); A.c.fillStyle = A.F(k % 2 ? '#c8883a' : '#d8a050'); A.c.fill(); } }
  }
  function breadOven(gx, gy, r = 0.22) { A.dome(gx, gy, r, 0, 9, '#c89a6a'); const [ox, oy] = P(gx + r * 0.7, gy + r * 0.7, 2); A.c.beginPath(); A.c.arc(ox, oy, 2, Math.PI, 0); A.c.closePath(); A.c.fillStyle = A.GLOW ? '#ffb040' : '#4a2a1a'; A.c.fill(); A.rec('lights', { x: ox, y: oy, r: 12 }); A.rec('smoke', { x: P(gx, gy, 10)[0], y: P(gx, gy, 10)[1], kind: 'bakery', seed: A.R() }); }
  reg('bakery', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = roofOf(), cx = x + w / 2, cy = y + d / 2;
    dirt(x + 0.15, y + 0.15, w - 0.3, d - 0.3, '#cdb48a');
    let top;
    // bakehouse at the back-right, oven and racks
    if (band === 0) breadOven(x + w - 0.45, y + 0.45, 0.22);
    else {
      const bw = band >= 2 ? 0.75 : 0.65, bd = band >= 2 ? 0.75 : 0.6;
      const bx = x + w - bw - 0.12, by = y + 0.12;
      const h = house(bx, by, bw, bd, band >= 3 ? 18 : 11, { two: band >= 3, stone: stoneOK(), m, axis: 'y', wall: WALLS[1], shut: '#a8482f', door: false });
      A.door(h.lo || h.b, 'L', bw * 0.3, 0.2, 7, '#6b3e22');
      // the oven bump with its chimney on the right face
      A.dome(bx + bw + 0.02, by + bd * 0.55, 0.16, 0, 8, '#c89a6a');
      A.chimney(bx + bw * 0.55, by + bd * 0.2, h.b.z + h.b.h + 2, 10, 'bakery', '#9a6a52');
      if (band >= 2) awning(h.lo || h.b, 'L', 0.38, bw - 0.02, 9.5, 0.18, '#c0392b', '#f6eedc');
      // a pretzel sign
      if (band >= 3 || s >= 3) { const p = A.onL(h.lo || h.b, bw * 0.8, 0, 10, 0)[0]; line(p, [p[0] - 5, p[1] - 2], '#3a2a20', 0.9); A.c.beginPath(); A.c.arc(p[0] - 5, p[1] + 2.5, 2.3, 0, TAU); A.c.strokeStyle = A.F('#c8883a'); A.c.lineWidth = 1.3; A.c.stroke(); }
      const wl = A.onL(h.lo || h.b, bw * 0.6, 0, 4.5, 0)[0]; A.rec('lights', { x: wl[0], y: wl[1], r: 12 });
    }
    // the windmill over the slot centre
    const H = [26, 32, 38, 44][band] + s * 1.5;
    if (band <= 1) { // post mill: a timber body on a trestled post
      const ps = P(cx, cy);
      line(P(cx - 0.3, cy), P(cx, cy, 10), '#6a4a30', 1.6); line(P(cx + 0.3, cy), P(cx, cy, 10), '#6a4a30', 1.6); line(P(cx, cy - 0.3), P(cx, cy, 10), '#6a4a30', 1.4); line(P(cx, cy + 0.3), P(cx, cy, 10), '#6a4a30', 1.4);
      line(ps, P(cx, cy, 13), '#5a3a22', 2.6);
      const bw = band ? 0.48 : 0.4;
      const b = box(cx - bw / 2, cy - bw / 2, bw, bw * 1.15, 13, H - 13 - 6, WALLS[1]);
      for (let k = 1; k < 5; k++) { const v = (H - 19) * k / 5; line(A.onL(b, 0, 0, v, v)[0], A.onL(b, bw, 0, v, v)[0], '#b09a78', 0.5); }
      A.win(b, 'R', bw * 0.6, (H - 19) * 0.55, 0.1, 3.5);
      top = roof(b, 9, 'y', m, { o: 0.05 });
      const hub = A.onL(b, bw / 2, 0, b.h - 2, 0)[0];
      A.rec('sails', { x: hub[0], y: hub[1] + 2, r: 17 + band * 3 });
      // ladder down to the ground
      line(A.onL(b, bw * 0.75, 0, 0, 0)[0], P(cx + bw * 0.25, cy + bw + 0.35), '#5a3a22', 1.2);
    } else { // stone tower mill with a boat-shaped cap
      const r = band >= 3 ? 0.4 : 0.34, i = r * 0.28, col = '#d8cfbf';
      const pts = k => [cx + Math.cos(k) * r, cy + Math.sin(k) * r];
      const [ex, ey, rx, ry] = A.ell(cx, cy, 0, r), [tx, ty, trx, tr] = A.ell(cx, cy, H, r - i);
      A.c.beginPath(); A.c.moveTo(ex - rx, ey); A.c.ellipse(ex, ey, rx, ry, 0, Math.PI, 0, true); A.c.lineTo(tx + trx, ty); A.c.ellipse(tx, ty, trx, tr, 0, 0, Math.PI, true); A.c.closePath(); A.gradFill(ex - rx, ex + rx, col);
      void pts;
      for (const v of [H * 0.3, H * 0.6]) { const p = P(cx + r * 0.6, cy + r * 0.6, v); A.lamp([[p[0] - 1.2, p[1]], [p[0] + 1.2, p[1]], [p[0] + 1.2, p[1] - 4], [p[0] - 1.2, p[1] - 4]], '#4b5a6b', A.nightGlass()); }
      A.door({ x: cx - r, y: cy - r, w: 2 * r, d: 2 * r, z: 0 }, 'L', r * 1.1, 0.18, 7, '#6b3e22');
      if (band >= 3) { A.cyl(cx, cy, r + 0.12, H * 0.45, 1.5, '#7a5434'); for (let k = 0; k < 9; k++) { const a = Math.PI * (k + 0.5) / 9, [gx2, gy2, grx, gry] = A.ell(cx, cy, H * 0.45 + 1.5, r + 0.12); line([gx2 - Math.cos(a) * grx, gy2 + Math.sin(a) * gry], [gx2 - Math.cos(a) * grx, gy2 + Math.sin(a) * gry - 4], '#5a3a22', 0.6); } }
      top = A.dome(cx, cy, r - i + 0.06, H, 10, X.era >= 3 ? SLATE : X.era >= 1 ? '#7a6a5a' : THATCH);
      const hub = P(cx + r * 0.75, cy + r * 0.75, H + 2);
      A.rec('sails', { x: hub[0], y: hub[1], r: 22 + band * 3 });
      A.rec('lights', { x: P(cx + r, cy + r, 4)[0], y: P(cx + r, cy + r, 4)[1], r: 10 });
    }
    // flour sacks, bread racks, a cart at the higher levels
    A.sack(x + 0.3, y + d - 0.35); if (s >= 1 || band >= 1) A.sack(x + 0.5, y + d - 0.28);
    if (band >= 1) breadRack(x + 0.25, y + 0.35, false);
    if (band >= 2) breadRack(x + 0.4, y + d - 0.6, true);
    if (band >= 3) cart(x + 0.2, cy + 0.15, false, 'sacks');
    return top;
  });

  // =====================================================================
  //  WALL (segments; towers, gatehouses and posterns below) — a dry-stone wall topped with hawthorn → limestone
  //  curtain with merlons and ivy → tiled timber hoarding along the walk → hanging heraldic banners
  // =====================================================================
  reg('wall', ([fx, fy, fw, fd], L, band, ctx) => {
    const along = ctx.along, a = ctx.a, b = ctx.b, len = b - a;
    const col = '#c4b8a2', cd = '#a89c86';
    if (band <= 0) {
      const bw = box(fx, fy, fw, fd, 0, 6, '#b0a490'); A.courses(bw, 2, '#8a7e6a');
      const n = Math.max(1, Math.round(len / 0.22));
      for (let k = 0; k <= n; k++) { const u = a + k * len / n, [hx, hy] = along ? P(u, fy + fd / 2, 6) : P(fx + fd / 2 + (fw - fd) / 2, u, 6); circ(hx, hy - 2.6, 3.2, HEDGE(), A.OUT); circ(hx - 1, hy - 3.8, 1.3, LEAF2(), null); if (!A.SNOW && A.SEASON === 0 && k % 3 === 0) circ(hx + 1, hy - 3, 0.9, '#ffffff', null); }
      return 11;
    }
    const H = 20 + band * 4;
    const bw = box(fx, fy, fw, fd, 0, H, col); A.courses(bw, 4, cd);
    const t = along ? fd : fw;
    const n = Math.max(1, Math.round(len / 0.28));
    const hoard = band >= 2 && (X.tech('fortification') || band >= 3);
    if (hoard) { // a timber gallery along the top under a tiled pentice roof
      const hb = along ? box(a, fy + t * 0.3, len, t * 0.75, H, 7, '#9a7444') : box(fx + t * 0.3, a, t * 0.75, len, H, 7, '#9a7444');
      for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; const f = along ? A.onL : A.onR; const p0 = f(hb, u * len - 0.04, u * len + 0.04, 2, 5); poly(p0, '#2a2018', null); }
      const m = roofOf(true), rc = A.SNOW ? '#eef2f4' : m.col;
      if (along) poly([P(a, fy + t * 0.2, H + 11), P(b, fy + t * 0.2, H + 11), P(b, fy + t * 1.15, H + 6.5), P(a, fy + t * 1.15, H + 6.5)], rc);
      else poly([P(fx + t * 0.2, a, H + 11), P(fx + t * 0.2, b, H + 11), P(fx + t * 1.15, b, H + 6.5), P(fx + t * 1.15, a, H + 6.5)], shade(rc, -0.12));
    } else {
      for (let k = 0; k < n; k += 2) { const u0 = a + k * len / n, u1 = a + (k + 1) * len / n; if (along) box(u0, fy + t * 0.45, u1 - u0, t * 0.55, H, 3.5, col); else box(fx + t * 0.45, u0, t * 0.55, u1 - u0, H, 3.5, col); }
    }
    // ivy creeping up the face, flower-box pots on the walk at band 1
    const ivy = Math.round(a * 7 + b * 3) % 3;
    if (!A.SNOW) for (let k = 0; k < Math.max(1, Math.round(len / 1.4)); k++) {
      if ((k + ivy) % 2) continue;
      const u = a + (k + 0.5) * len / Math.max(1, Math.round(len / 1.4)), [ix, iy] = along ? P(u, fy + t, 0) : P(fx + t, u, 0);
      for (let j = 0; j < 7; j++) circ(ix + Math.sin(j * 1.7) * 3, iy - 2 - j * (H / 8), 2.2 - j * 0.15, A.SEASON === 2 ? (j % 2 ? '#b0502a' : '#c87a2a') : j % 2 ? '#3f7a3a' : '#5e9447', null);
    }
    if (X.tech('fortification')) { const m2 = Math.max(1, Math.round(len / 0.7)); for (let k = 0; k < m2; k++) { const u = (k + 0.5) * len / m2; (along ? A.onL : A.onR)(bw, u, u, 0, 0); A.slit ? A.slit(bw, along ? 'L' : 'R', u, H * 0.5) : 0; } }
    if (band >= 3 && Math.round(a) % 3 === 0) { // heraldic banner hanging on the face
      const [px, py] = along ? P(a + len / 2, fy + t, H - 1) : P(fx + t, a + len / 2, H - 1);
      poly([[px - 3, py], [px + 3, py], [px + 3, py + 12], [px, py + 9.5], [px - 3, py + 12]], '#c0392b'); poly([[px - 0.7, py], [px + 0.7, py], [px + 0.7, py + 10], [px - 0.7, py + 10]], GOLD, null);
    }
    return H + (hoard ? 11 : 3.5);
  });

  // =====================================================================
  //  WALL TOWERS, GATEHOUSE, POSTERN — the same limestone as the curtain: round ivy-hung towers under
  //  thatch / red tile / slate cones, a timber hoarding ring once the walk is hoarded; the gate grows from a
  //  thatched lych-gate to stone piers under a tiled canopy to a twin-towered gatehouse with a half-timbered
  //  upper storey, portcullis and heraldic banner.
  // =====================================================================
  const WCOL = '#c4b8a2', WCD = '#a89c86';
  const wallH = band => 20 + band * 4;
  const hoarded = band => band >= 2 && (X.tech('fortification') || band >= 3);
  const towerRoof = () => { const m = roofOf(true); return m.tex === 'thatch' ? THATCH : m.col; };
  function cylLines(gx, gy, r, z0, z1, step, col) {
    const [x, y, rx, ry] = A.ell(gx, gy, 0, r), c = A.c;
    for (let v = z0 + step; v < z1 - 0.5; v += step) { c.beginPath(); c.ellipse(x, y - v, rx, ry, 0, 0.12, Math.PI - 0.12); c.strokeStyle = A.F(col); c.lineWidth = 0.6; c.stroke(); }
  }
  function cylSlit(gx, gy, r, v, h = 6, side = 0) { // an arrow slit on the round face (side: -1 left, 0 front, 1 right)
    const a = Math.PI / 4 + side * 0.75, [x, y] = P(gx + Math.cos(a) * r, gy + Math.sin(a) * r, v);
    A.lamp([[x - 0.8, y], [x + 0.8, y], [x + 0.8, y - h], [x - 0.8, y - h]], '#2e2a28', '#ffc35a');
  }
  function ivyUp(gx, gy, r, H, seed) {
    if (A.SNOW) return;
    const a = Math.PI / 4 + ((seed * 7) % 3 - 1) * 0.5, [ix, iy] = P(gx + Math.cos(a) * r, gy + Math.sin(a) * r, 0);
    for (let j = 0; j < 8; j++) circ(ix + Math.sin(j * 1.9 + seed) * 2.6, iy - 2 - j * (H / 11), 2.1 - j * 0.13, A.SEASON === 2 ? (j % 2 ? '#b0502a' : '#c87a2a') : j % 2 ? '#3f7a3a' : '#5e9447', null);
  }
  function crown(gx, gy, r, z, col, n = 8) { // a crenellated rim on a round tower
    A.cyl(gx, gy, r, z, 3, col);
    const ms = []; for (let k = 0; k < n; k++) { const a = (k + 0.5) / n * TAU; ms.push([Math.cos(a), Math.sin(a)]); }
    ms.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
    for (const [cx2, cy2] of ms) box(gx + cx2 * (r - 0.07) - 0.065, gy + cy2 * (r - 0.07) - 0.065, 0.13, 0.13, z + 3, 3.5, col);
    return z + 6.5;
  }
  function hoardRing(gx, gy, r, z) { // a timber hoarding ring with dark drop-slots
    A.cyl(gx, gy, r, z, 7, '#9a7444', '#8a6440');
    for (let k = -2; k <= 2; k++) { const a = Math.PI / 4 + k * 0.42, [x, y] = P(gx + Math.cos(a) * r, gy + Math.sin(a) * r, z + 2); poly([[x - 0.9, y], [x + 0.9, y], [x + 0.9, y - 3], [x - 0.9, y - 3]], '#2a2018', null); }
    return z + 7;
  }
  // a round tower: battered plinth, coursed limestone, ivy, slits, then crenels or hoarding, a cone roof
  function roundTower(gx, gy, r, H, band, o = {}) {
    A.cyl(gx, gy, r + 0.06, 0, 5, shade(WCOL, -0.1));
    A.cyl(gx, gy, r, 5, H - 5, WCOL); cylLines(gx, gy, r, 5, H, 4, WCD);
    ivyUp(gx, gy, r, H * 0.8, Math.round((gx + gy) * 3));
    cylSlit(gx, gy, r, H * 0.42, 6, -1); cylSlit(gx, gy, r, H * 0.62, 6, 1);
    if (X.era >= 1) cylSlit(gx, gy, r, H * 0.25, 5, 0);
    let z = H;
    if (o.hoard) z = hoardRing(gx, gy, r + 0.09, H);
    else if (!o.roof) return crown(gx, gy, r + 0.04, H, WCOL);
    else { A.cyl(gx, gy, r + 0.05, H, 2.5, shade(WCOL, -0.06)); z = H + 2.5; }
    const rc = towerRoof(), zt = A.cone(gx, gy, r + (o.hoard ? 0.17 : 0.12), z, (o.tall || 20) + r * 8, rc);
    if (X.era === 0 && !A.SNOW) { const [x, y, rx] = A.ell(gx, gy, z, r + 0.12); line([x - rx, y], [x + rx, y], shade(rc, -0.32), 2); }   // thatch eave lip
    if (X.era >= 3) { const [fx, fy] = P(gx, gy, zt); line([fx, fy], [fx, fy - 6], '#5a4a3a', 1); circ(fx, fy - 6, 1.4, GOLD, A.OUT); }
    return zt;
  }
  reg('walltower', ([x, y, w, d], L, band, ctx) => {
    const gx = ctx.gx, gy = ctx.gy, corner = ctx.corner;
    const hoard = hoarded(band), r = corner ? 0.47 : 0.38;
    const H = wallH(band) + (corner ? 16 : 9) + (band >= 3 ? 5 : 0) + (hoard ? 4 : 0);
    // side towers of a band-1 wall: squat crenellated drums; corners and later bands get roofs
    const roof = corner || band >= 2 || X.era >= 2;
    let top = roundTower(gx, gy, r, H, band, { hoard, roof, tall: corner ? 24 : 16 });
    if (corner && band >= 2) { A.flagpole(gx, gy, top - 1, 12, A.STY.flag); top += 12; }
    if (band >= 3 && corner) { // a hanging heraldic banner on the outward face
      const [px, py] = P(gx + r * 0.71, gy + r * 0.71, H - 4);
      poly([[px - 3, py], [px + 3, py], [px + 3, py + 13], [px, py + 10.5], [px - 3, py + 13]], '#c0392b'); poly([[px - 0.7, py], [px + 0.7, py], [px + 0.7, py + 11], [px - 0.7, py + 11]], GOLD, null);
    }
    return top;
  });
  // the gate's two sides along the wall line: u = position along the wall, fixed = the wall line
  const wallPt = (ctx, u, off = 0) => ctx.along ? [u, ctx.fixed + off] : [ctx.fixed + off, u];
  const wbox = (ctx, u0, u1, o0, o1, z, h, col, opt) => ctx.along ? box(u0, ctx.fixed + o0, u1 - u0, o1 - o0, z, h, col, opt) : box(ctx.fixed + o0, u0, o1 - o0, u1 - u0, z, h, col, opt);
  const wAxis = ctx => ctx.along ? 'x' : 'y';
  const wFace = ctx => ctx.along ? 'L' : 'R';
  function portcullis(ctx, u0, u1, z, drop) { // iron teeth hanging under an arch, on the outward-visible face
    const n = Math.max(3, Math.round((u1 - u0) / 0.12));
    for (let k = 0; k <= n; k++) { const u = u0 + (u1 - u0) * k / n; line(P(...wallPt(ctx, u, 0.29), z), P(...wallPt(ctx, u, 0.29), z - drop), '#2e2a28', 0.9); }
    line(P(...wallPt(ctx, u0, 0.29), z - drop * 0.5), P(...wallPt(ctx, u1, 0.29), z - drop * 0.5), '#2e2a28', 0.8);
  }
  function gateLeaf(ctx, u, dir, h) { // an open oak gate leaf folded back against the jamb
    const a = wallPt(ctx, u, 0.05), b = wallPt(ctx, u + dir * 0.06, 0.42);
    poly([P(...a, 0), P(...b, 0), P(...b, h), P(...a, h)], OAK);
    line(P(...a, h * 0.3), P(...b, h * 0.3), BEAM, 0.8); line(P(...a, h * 0.75), P(...b, h * 0.75), BEAM, 0.8);
  }
  reg('gate', ([x, y, w, d], L, band, ctx) => {
    const g0 = ctx.g0, g1 = ctx.g1, H = wallH(band), m = (g0 + g1) / 2, ax = wAxis(ctx);
    if (band <= 0) { // a lych-gate: oak posts under a little thatched roof, the hedge either side
      for (const u of [g0, g1]) for (const o of [-0.16, 0.16]) { const p = wallPt(ctx, u, o); box(p[0] - 0.05, p[1] - 0.05, 0.1, 0.1, 0, 15, OAK); }
      const b = wbox(ctx, g0 - 0.08, g1 + 0.08, -0.22, 0.22, 15, 1.5, BEAM);
      const zt = roof(b, 8, ax, roofOf(false));
      gateLeaf(ctx, g0 + 0.06, 1, 11); gateLeaf(ctx, g1 - 0.06, -1, 11);
      const [lx, ly] = P(...wallPt(ctx, m, 0.22), 14); A.lantern(lx, ly + 3, 1.3);
      return zt;
    }
    const stoneC = WCOL;
    if (band === 1) { // stone piers with pyramid caps, a beamed tiled canopy over the way
      const ph = H + 10;
      const pier = (u0, u1) => {
        wbox(ctx, u0 - 0.03, u1 + 0.03, -0.34, 0.34, 0, 4, shade(stoneC, -0.12));
        const pb = wbox(ctx, u0, u1, -0.31, 0.31, 4, ph - 4, stoneC); A.courses(pb, 4, WCD);
        const cap = wbox(ctx, u0 - 0.04, u1 + 0.04, -0.35, 0.35, ph, 2, shade(stoneC, -0.06));
        const zc = A.hip(cap, 7, shade(stoneC, -0.1), 0.01); const [bx, by] = P(...wallPt(ctx, (u0 + u1) / 2, 0), zc); circ(bx, by - 1, 1.6, shade(stoneC, 0.1), A.OUT);
      };
      pier(g0 - 0.34, g0);
      const bm = wbox(ctx, g0, g1, -0.2, 0.2, H + 1, 3, BEAM);
      const zt = roof(bm, 9, ax, roofOf(false), { o: 0.1 });
      gateLeaf(ctx, g0, 1, H - 5); gateLeaf(ctx, g1, -1, H - 5);
      pier(g1, g1 + 0.34);
      const [px, py] = P(...wallPt(ctx, m, 0.25), H); poly([[px - 3, py], [px + 3, py], [px + 3, py + 7], [px, py + 9], [px - 3, py + 7]], '#c0392b'); circ(px, py + 4, 1.3, GOLD, null);
      for (const u of [g0 - 0.16, g1 + 0.16]) { const [lx, ly] = P(...wallPt(ctx, u, 0.27), H - 2); A.lantern(lx, ly + 3, 1.3); }
      return Math.max(zt, ph + 6);
    }
    // gatehouse: twin round towers flanking an arch block with a half-timbered upper storey
    const hoard = hoarded(band), TH = H + 18 + (band >= 3 ? 6 : 0), r = 0.3;
    const tw = u => { const [tx, ty] = wallPt(ctx, u, 0.02); return roundTower(tx, ty, r, TH, band, { hoard, roof: true, tall: 18 }); };
    let top = tw(g0 - 0.26);
    const ab = wbox(ctx, g0, g1, -0.27, 0.27, H - 7, 9, stoneC); A.courses(ab, 4, WCD);
    portcullis(ctx, g0 + 0.06, g1 - 0.06, H - 7, 5);
    const up = wbox(ctx, g0 - 0.02, g1 + 0.02, -0.25, 0.25, H + 2, 10, X.era >= 3 ? '#efe7d6' : WALLS[1]); A.timber(up, BEAM);
    for (const u of [0.35, 0.95]) A.win(up, wFace(ctx), u, 3, 0.18, 5, BEAM);
    const zr = roof(up, 10, ax, roofOf(true));
    // heraldic shield over the arch; a clock in the Legend era
    const [sx, sy] = P(...wallPt(ctx, m, 0.27), H - 1);
    poly([[sx - 3.4, sy - 4], [sx + 3.4, sy - 4], [sx + 3.4, sy + 1], [sx, sy + 4.5], [sx - 3.4, sy + 1]], '#c0392b'); line([sx, sy - 4], [sx, sy + 4], GOLD, 1); line([sx - 3.2, sy - 1], [sx + 3.2, sy - 1], GOLD, 1);
    if (band >= 3 && X.era >= 2) { const [cx2, cy2] = P(...wallPt(ctx, m, 0.25), H + 18); circ(cx2, cy2, 3.2, '#f4ecd8', A.OUT); line([cx2, cy2], [cx2, cy2 - 2.4], '#2a2018', 0.8); line([cx2, cy2], [cx2 + 1.8, cy2], '#2a2018', 0.8); }
    top = Math.max(top, tw(g1 + 0.26), zr);
    if (band >= 3) { const [bx, by] = P(...wallPt(ctx, m, 0.27), TH - 4); poly([[bx - 4, by - 2], [bx + 4, by - 2], [bx + 4, by + 12], [bx, by + 9], [bx - 4, by + 12]], A.STY.flag); }
    return top;
  });
  reg('postern', ([x, y, w, d], L, band, ctx) => {
    const g0 = ctx.g0, g1 = ctx.g1, H = wallH(band), m = (g0 + g1) / 2, ax = wAxis(ctx);
    if (band <= 0) { // a wicket in the hedge: two posts, a cross-braced gate standing ajar, a tiny hood
      for (const u of [g0, g1]) { const p = wallPt(ctx, u); box(p[0] - 0.04, p[1] - 0.04, 0.08, 0.08, 0, 12, OAK); }
      const a = wallPt(ctx, g0 + 0.04, 0.02), b = wallPt(ctx, g0 + 0.32, 0.2);
      poly([P(...a, 1), P(...b, 1), P(...b, 8), P(...a, 8)], OAK); line(P(...a, 1), P(...b, 8), BEAM, 0.8);
      const hb = wbox(ctx, g0 - 0.06, g1 + 0.06, -0.12, 0.12, 12, 1, BEAM);
      return roof(hb, 5, ax, roofOf(false), { o: 0.06 });
    }
    const t = 0.22, jh = H + 4;
    for (const [u0, u1] of [[g0 - 0.22, g0], [g1, g1 + 0.22]]) { const jb = wbox(ctx, u0, u1, -t, t, 0, jh, WCOL); A.courses(jb, 4.5, WCD); }
    const lt = wbox(ctx, g0, g1, -0.2, 0.2, H - 6, 6, WCOL); A.courses(lt, 3, WCD);
    const [ax0, ay0] = P(...wallPt(ctx, g0 + 0.04, 0.2), H - 6), [ax1, ay1] = P(...wallPt(ctx, g1 - 0.04, 0.2), H - 6), [amx, amy] = P(...wallPt(ctx, m, 0.2), H - 3);
    A.c.beginPath(); A.c.moveTo(ax0, ay0); A.c.quadraticCurveTo(amx, amy - 2, ax1, ay1); A.c.strokeStyle = A.F(WCD); A.c.lineWidth = 1.2; A.c.stroke();
    let top = jh;
    if (band >= 2) { const hb = wbox(ctx, g0 - 0.25, g1 + 0.25, -0.24, 0.24, jh, 1.5, BEAM); top = roof(hb, 7, ax, roofOf(true), { o: 0.06 }); }
    const [lx, ly] = P(...wallPt(ctx, g1 + 0.11, t + 0.02), H - 4); A.lantern(lx, ly + 3, 1.2);
    return top;
  });

  // =====================================================================
  //  SHORE — the harbour works on a coast and the lighthouse
  //  Timber jetties on oak piles → a plank quay with a fisher's boathouse → a stone quay with tall gabled
  //  harbour houses, a treadwheel crane and moored cogs → a great crane house, a carrack and banners.
  //  Everything is placed in shore coordinates (dd from the plot edge, u along it) so it fits any edge.
  // =====================================================================
  const shoreKit = ctx => {
    const pt = ctx.pt, at = ctx.at;
    const key = (dd, u) => { const p = pt(dd, u); return p[0] + p[1]; };
    const rect = (d0, d1, u0, u1) => { const a = pt(d0, u0), b = pt(d1, u1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])]; };
    const lbox = (d0, d1, u0, u1, z, h, col, o) => { const r = rect(d0, d1, u0, u1); return box(r[0], r[1], r[2], r[3], z, h, col, o); };
    const deck = (d0, d1, u0, u1, z, col, st = A.OUT) => poly([at(d0, u0, z), at(d0, u1, z), at(d1, u1, z), at(d1, u0, z)], col, st);
    return { pt, at, key, rect, lbox, deck, axU: ctx.along ? 'x' : 'y', axD: ctx.along ? 'y' : 'x' };
  };
  // a merchant cog: round hull, square sail with a red band, castles fore and aft
  function cogShip(K, ctx, u, d0, d1, big, sail) {
    A.shipHull(ctx.edge, u, d0, d1, big, sail ? '#efe4c8' : null);
    const hw = big ? 0.3 : 0.22, hh = big ? 7 : 5, m = (d0 + d1) / 2;
    if (sail) { const zt = hh + (big ? 30 : 19), dz = big ? 18 : 12, ya = K.at(m, u - hw * 1.6, zt), yb = K.at(m, u + hw * 1.6, zt); poly([[ya[0], ya[1] + dz * 0.38], [yb[0], yb[1] + dz * 0.38], [yb[0], yb[1] + dz * 0.6], [ya[0], ya[1] + dz * 0.6]], '#b4482f', null); }
    const sc = K.lbox(d1 - 0.42, d1 - 0.08, u - hw * 0.75, u + hw * 0.75, hh + 1, big ? 6 : 4, '#7a5434'); line(A.onL(sc, 0, sc.w, sc.h, sc.h)[0], A.onL(sc, sc.w, sc.w, sc.h, sc.h)[0], '#e0b84a', 0.7);
    if (big) K.lbox(d0 + 0.32, d0 + 0.6, u - hw * 0.6, u + hw * 0.6, hh + 2, 4, '#7a5434');
    const [lx, ly] = K.at(d1 - 0.1, u, hh + (big ? 13 : 9)); A.lantern(lx, ly, 1.2);
  }
  // a treadwheel crane: a stone base (or a half-timbered crane house), the jib over the water, a load on the hook
  function crane(K, dd, u, H, band, house) {
    const sc = stoneOK() ? STONE_D : OAK;
    if (house) {
      const hb = K.lbox(dd - 0.26, dd + 0.26, u - 0.26, u + 0.26, 0, 8, sc); A.courses(hb, 3, shade(sc, -0.2));
      const up = K.lbox(dd - 0.28, dd + 0.28, u - 0.28, u + 0.28, 8, H - 18, WALLS[0]); A.timber(up, BEAM);
      A.win(up, 'L', up.w / 2, (H - 18) * 0.55, 0.14, 4, BEAM); A.win(up, 'R', up.d / 2, (H - 18) * 0.55, 0.14, 4, BEAM);
      roof(up, 9, K.axD, roofOf(true));
    } else {
      K.lbox(dd - 0.2, dd + 0.2, u - 0.2, u + 0.2, 0, 4, sc);
      line(K.at(dd + 0.15, u - 0.15, 4), K.at(dd, u, H), OAK, 1.2); line(K.at(dd + 0.15, u + 0.15, 4), K.at(dd, u, H), OAK, 1.2);
      line(K.at(dd, u, 4), K.at(dd, u, H), BEAM, 2.4);
    }
    const j = K.at(dd - 1.25, u, H + 3), b = K.at(dd, u, H - 6);
    line(b, j, BEAM, 2); line(K.at(dd, u, H), j, '#5a4030', 0.8);
    const hk = K.at(dd - 1.25, u, 12); line(j, hk, '#3a2a20', 0.6);
    K.lbox(dd - 1.36, dd - 1.14, u - 0.11, u + 0.11, 6, 5, '#a5773f');
    // the treadwheel beside the base
    const [wx, wy] = K.at(dd + 0.1, u + 0.42, 9), R0 = 7 + band;
    circ(wx, wy, R0, null, BEAM); circ(wx, wy, R0 - 1.4, null, shade(BEAM, 0.2));
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI; line([wx - Math.cos(a) * R0, wy - Math.sin(a) * R0], [wx + Math.cos(a) * R0, wy + Math.sin(a) * R0], BEAM, 0.7); }
    line([wx, wy], [wx, wy + R0 + 1], BEAM, 1.4);
  }
  // a tall gabled harbour house on piles between the jetties (warehouse / boathouse / customs)
  function harbourHouse(K, ctx, dd0, dd1, u0, u1, H, kind, v) {
    for (const dd of [dd0 + 0.05, dd1 - 0.05]) for (const u of [u0 + 0.04, u1 - 0.04]) line(K.at(dd, u, -3), K.at(dd, u, 2), shade(OAK, -0.4), 1.4);
    const base = stoneOK() && kind !== 'boat' ? STONE : null;
    let b;
    if (base) { const sb = K.lbox(dd0, dd1, u0, u1, 0, 5, base); A.courses(sb, 2.5, STONE_D); b = K.lbox(dd0, dd1, u0, u1, 5, H - 5, WALLS[v % 4]); }
    else { K.deck(dd0 - 0.05, dd1 + 0.05, u0 - 0.04, u1 + 0.04, 2, '#8a6440'); b = K.lbox(dd0, dd1, u0, u1, 2, H - 2, kind === 'boat' ? '#8a6a48' : WALLS[v % 4]); }
    if (kind === 'boat') { // weatherboarded boathouse, open to the water
      for (const side of ['L', 'R']) { const f = side === 'L' ? A.onL : A.onR, Lf = side === 'L' ? b.w : b.d; for (let v2 = 2; v2 < b.h; v2 += 2.2) line(f(b, 0, 0, v2, 0)[0], f(b, Lf, 0, v2, 0)[0], shade('#8a6a48', -0.25), 0.5); }
      const toward = ctx.edge === 'S' ? 'R' : ctx.edge === 'W' ? 'L' : null;
      if (toward) { const f = toward === 'L' ? A.onL : A.onR, Lf = toward === 'L' ? b.w : b.d; poly(f(b, Lf * 0.18, Lf * 0.82, 0, b.h * 0.7), '#2a2018', null); }
    } else {
      A.timber(b, BEAM);
      A.win(b, 'L', b.w / 2, b.h * 0.6, 0.14, 4.5, BEAM); A.win(b, 'R', b.d / 2, b.h * 0.6, 0.14, 4.5, BEAM);
      if (kind === 'ware') { // a hoist beam and loading door in the gable
        const f = ctx.along ? A.onR : A.onL, Lf = ctx.along ? b.d : b.w;
        poly(f(b, Lf * 0.38, Lf * 0.62, b.h * 0.18, b.h * 0.42), '#4a3020', null);
      }
    }
    const zt = roof(b, kind === 'boat' ? 8 : 11, K.axD, kind === 'boat' ? roofOf(false) : roofOf(true));
    if (kind === 'customs') { const [fx, fy] = K.at((dd0 + dd1) / 2, (u0 + u1) / 2, zt); line([fx, fy], [fx, fy - 9], '#4a3a2a', 1); A.rec('flags', { x: fx, y: fy - 8, col: '#c0392b', len: 9, seed: A.R() }); }
    return zt;
  }
  reg('harbor', (slot, L, band, ctx) => {
    if (!ctx || !ctx.coastal || !L) return undefined;   // inland: cityview's stock river landing
    const K = shoreKit(ctx), dep = ctx.depth, u0 = ctx.u0, piers = ctx.piers, era = X.era;
    const wood = era >= 3 ? '#9a7a54' : '#a07a4a', stoneQ = band >= 2 && stoneOK();
    const flat = [], items = [], add = (dd, u, fn) => items.push([K.key(dd, u), fn]);
    // the quay along the shore joining the jetties: planks at first, dressed stone from band 2
    const qa = piers[0] - 0.42, qb = piers[piers.length - 1] + 0.42;
    flat.push(() => {
      for (let u = qa; u < qb - 0.01; u += 0.25) {
        const u1 = Math.min(qb, u + 0.25), d0 = dep(u) - 0.18, d1 = dep(u1) - 0.18;
        if (stoneQ && ctx.front) poly([K.at(d0, u, -3), K.at(d1, u1, -3), K.at(d1, u1, 3), K.at(d0, u, 3)], STONE_D);
        poly([K.at(d0, u, stoneQ ? 3 : 2), K.at(d1, u1, stoneQ ? 3 : 2), K.at(dep(u1) + 0.38, u1, stoneQ ? 3 : 2), K.at(dep(u) + 0.38, u, stoneQ ? 3 : 2)], stoneQ ? STONE : wood, null);
        if (stoneQ) line(K.at(d0, u, 3), K.at(d0, u, 3), STONE_D, 0.5);
      }
      line(K.at(dep(qa) - 0.18, qa, stoneQ ? 3 : 2), K.at(dep(qb) - 0.18, qb, stoneQ ? 3 : 2), shade(stoneQ ? STONE : wood, -0.4), 0.9);
      if (stoneQ) for (let u = qa + 0.3; u < qb; u += 0.5) line(K.at(dep(u) - 0.18, u, 3), K.at(dep(u) + 0.38, u, 3), STONE_D, 0.45);
    });
    // jetties: timber on oak piles; the main one a stone mole from band 2
    const outs = piers.map(u => [u, Math.max(0.5, dep(u) - (band >= 1 ? 2.6 : 2.0))]);
    for (const [u, out] of outs) {
      if (stoneQ && Math.abs(u - u0) < 0.01) flat.push(() => { const b = K.lbox(out, dep(u) + 0.2, u - 0.3, u + 0.3, -3, 6, STONE); A.courses(b, 3, STONE_D); for (let dd = out + 0.3; dd < dep(u); dd += 0.45) line(K.at(dd, u - 0.3, 3), K.at(dd, u + 0.3, 3), STONE_D, 0.45); });
      else flat.push(() => {
        for (let dd = out + 0.1; dd < dep(u); dd += 0.55) for (const du of [-0.24, 0.24]) line(K.at(dd, u + du, -3), K.at(dd, u + du, 2.6), shade(wood, -0.45), 1.3);
        K.deck(out, dep(u) + 0.3, u - 0.25, u + 0.25, 2, wood);
        for (let dd = out + 0.15; dd < dep(u) + 0.25; dd += 0.22) line(K.at(dd, u - 0.25, 2), K.at(dd, u + 0.25, 2), shade(wood, -0.25), 0.5);
      });
      // mooring posts and a lantern at the jetty head
      add(out + 0.06, u, () => { for (const du of [-0.22, 0.22]) line(K.at(out + 0.06, u + du, 2), K.at(out + 0.06, u + du, 6), BEAM, 1.6); line(K.at(out + 0.08, u + 0.2, 2), K.at(out + 0.08, u + 0.2, 11), BEAM, 1); const [lx, ly] = K.at(out + 0.08, u + 0.2, 13); A.lantern(lx, ly, 1.3); });
    }
    const gap = (ua, ub) => piers.some(p => Math.abs(p - ua) < 0.01) && piers.some(p => Math.abs(p - ub) < 0.01);
    // band 0: fishing — rowboats, a net rack, creels and barrels
    outs.forEach(([u, out], i) => { const len = dep(u) - out; if (len > 0.9 && !(band >= 1 && i === 0) && !(band >= 2 && i === outs.length - 1)) { const dd = out + Math.min(0.75, len * 0.4), uu = u + (i % 2 ? -0.52 : 0.52); add(dd, uu, () => A.boat(...K.pt(dd, uu), band === 0 && i % 2 === 0)); } });
    add(dep(u0 + 0.6) + 0.1, u0 + 0.6, () => { A.barrel(...K.pt(dep(u0 + 0.5) + 0.12, u0 + 0.5)); A.crate(...K.pt(dep(u0 + 0.75) + 0.05, u0 + 0.75), 0.2, 2); });
    if (band === 0) add(dep(u0 - 0.6) + 0.15, u0 - 0.6, () => A.netRack(...K.pt(dep(u0 - 0.6) + 0.16, u0 - 0.6), !ctx.along));
    if (band === 0) { const bu = u0 + 1.0, bd = dep(bu) + 0.12; add(bd, bu, () => { A.boat(...K.pt(bd, bu), false); const [x2, y2] = K.at(bd + 0.1, bu + 0.25, 0); line([x2, y2], [x2 + 6, y2 - 3], '#a07a4a', 1.2); }); }
    // band 1+: a boathouse on piles beside the main jetty, a moored cog
    if (band >= 1 && gap(u0, u0 + 1.1)) { const d1 = dep(u0 + 0.55) + 0.05; add(d1 - 0.5, u0 + 0.55, () => harbourHouse(K, ctx, d1 - 0.95, d1, u0 + 0.3, u0 + 0.8, 12, 'boat', 0)); }
    if (band >= 1) { const [u, out] = outs[0], len = dep(u) - out; if (len > 1.5) add(out + 0.6, u - 0.56, () => cogShip(K, ctx, u - 0.56, out + 0.1, out + Math.min(2.1, len - 0.1), band >= 2, band >= 3 || (band >= 1 && L % 2 === 1))); }
    // L5+: a treadwheel crane at the root of the main jetty (a crane house from band 3)
    if (L >= 5) { const cu = u0 - 0.55, cd = dep(cu) + 0.05; add(cd, cu, () => crane(K, cd, cu, 38 + band * 5, band, band >= 3)); }
    // band 2+: tall gabled harbour houses between the jetties, a second ship at the far jetty
    if (band >= 2 && gap(u0 + 1.1, u0 + 2.2)) { const d1 = dep(u0 + 1.65) + 0.05; add(d1 - 0.5, u0 + 1.65, () => harbourHouse(K, ctx, d1 - 0.9, d1, u0 + 1.4, u0 + 1.9, 20 + band * 2, 'ware', 1)); }
    if (band >= 2) { const [u, out] = outs[outs.length - 1], len = dep(u) - out; if (len > 1.4 && outs.length > 1) add(out + 0.6, u + 0.56, () => cogShip(K, ctx, u + 0.56, out + 0.1, out + Math.min(1.8, len - 0.1), false, false)); }
    if (band >= 3 && gap(u0 - 2.2, u0 - 1.1)) { const d1 = dep(u0 - 1.65) + 0.05; add(d1 - 0.5, u0 - 1.65, () => harbourHouse(K, ctx, d1 - 0.9, d1, u0 - 1.9, u0 - 1.4, 24, 'customs', 2)); }
    if (band >= 2) add(dep(u0 + 1.1) + 0.2, u0 + 1.1, () => { const p = K.pt(dep(u0 + 1.1) + 0.22, u0 + 1.1); A.sack(p[0], p[1]); A.barrel(p[0] + 0.15, p[1] + 0.1); });
    if (band >= 3) for (const u of [qa + 0.1, qb - 0.1]) add(dep(u) + 0.2, u, () => { const p = K.pt(dep(u) + 0.22, u); A.banner(p[0], p[1], 2, 26, '#c0392b'); });
    for (const f of flat) f();
    items.sort((p, q) => p[0] - q[0]);
    for (const [, f] of items) f();
    if (!A.SNOW) A.rec('sparks', (() => { const [x, y] = K.at(Math.max(0.5, dep(u0) * 0.4), u0 + 1.4); return { x, y, kind: 'water', rx: 26, ry: 10 }; })());
    return { top: 40 + band * 6, noDress: true };
  });
  reg('lighthouse', ([x, y, w, d], L, band, ctx) => {
    const cx = x + w / 2, cy = y + d / 2, era = X.era;
    // a rock skerry with a stone plinth (a keeper's cottage on the rock from band 3)
    A.rock(cx - 0.25, cy - 0.15, 1.3, '#8a8478'); A.rock(cx + 0.25, cy - 0.3, 1.0, '#9a9488');
    if (band >= 3) { const kb = box(cx - 0.75, cy - 0.2, 0.42, 0.36, 0, 9, WALLS[0]); A.timber(kb, BEAM); A.win(kb, 'L', 0.2, 3, 0.12, 3.5, BEAM); roof(kb, 6, 'x', roofOf(false)); A.chimney(cx - 0.7, cy - 0.15, 12, 4, 'house'); }
    A.rock(cx - 0.1, cy + 0.35, 1.2, '#7e786c'); A.rock(cx + 0.38, cy + 0.2, 0.8, '#8a8478');
    const pl = box(cx - 0.34, cy - 0.34, 0.68, 0.68, 0, 6, STONE_D); A.courses(pl, 3, shade(STONE_D, -0.2));
    const H = 44 + band * 8, r0 = 0.27, r1 = 0.19, n = 6, white = era >= 1 ? '#f2ede2' : STONE;
    for (let k = 0; k < n; k++) {
      const r = r0 + (r1 - r0) * k / n, z = 6 + H * k / n, col = era >= 1 && (k === 2 || k === 4) ? '#b4482f' : white;
      A.cyl(cx, cy, r, z, H / n + 0.4, col);
      if (era === 0) cylLines(cx, cy, r, z - 1, z + H / n, 3.2, STONE_D);
    }
    for (const f of [0.22, 0.48, 0.72]) { const [wx, wy] = P(cx + 0.17, cy + 0.17, 6 + H * f); A.lamp([[wx - 1, wy], [wx + 1, wy], [wx + 1, wy - 4], [wx - 1, wy - 4]], '#4b5a6b', A.nightGlass()); }
    { const [dx, dy] = P(cx + 0.19, cy + 0.19, 6); poly([[dx - 2.2, dy + 1], [dx + 2.2, dy + 1], [dx + 2.2, dy - 6], [dx, dy - 8], [dx - 2.2, dy - 6]], '#6b3e22'); }
    // gallery, lantern room, cone roof
    const zg = 6 + H; A.cyl(cx, cy, r1 + 0.1, zg, 2, '#4a3a2a');
    { const [gx2, gy2, grx, gry] = A.ell(cx, cy, zg + 2, r1 + 0.1); for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; line([gx2 - Math.cos(a) * grx, gy2 + Math.sin(a) * gry], [gx2 - Math.cos(a) * grx, gy2 + Math.sin(a) * gry - 4], '#3a2a20', 0.6); } A.c.beginPath(); A.c.ellipse(gx2, gy2 - 4, grx, gry, 0, 0, Math.PI); A.c.strokeStyle = A.F('#3a2a20'); A.c.lineWidth = 0.8; A.c.stroke(); }
    A.cyl(cx, cy, r1 - 0.02, zg + 2, 9, '#3a4655');
    const [lx, ly] = P(cx, cy, zg + 7);
    A.lamp([[lx - 3.5, ly + 4], [lx + 3.5, ly + 4], [lx + 3.5, ly - 3.5], [lx - 3.5, ly - 3.5]], '#f2d36a', '#fff4c0');
    for (const dx of [-1.8, 1.8]) line([lx + dx, ly + 4], [lx + dx, ly - 3.5], '#2a2018', 0.6);
    const rc = era >= 3 ? SLATE : era >= 1 ? TILE : SHINGLE, zt = A.cone(cx, cy, r1 + 0.06, zg + 11, 12, rc);
    const [fx, fy] = P(cx, cy, zt); line([fx, fy], [fx, fy - 5], '#4a3a2a', 1); circ(fx, fy - 5, 1.3, era >= 3 ? GOLD : '#8a6440', A.OUT);
    A.rec('beams', { x: lx, y: ly }); A.rec('lights', { x: lx, y: ly, r: 34 });
    return { top: zt + 6, noDress: true };
  });
})();

// cityview opt-outs (the return-object format in js/cityart.js): stock extras this people's art already draws itself.
// Wraps the return value only — the drawings above are untouched.
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.hearth) return;
  const R = CITYART.hearth, O = {
    smelter: { noTech: ['metallurgy', 'bellows'] },
    farm: { noTech: ['granaries'] },
    mine: { noTech: ['deepshafts'] },
    lumber: { noTech: ['sawpits'] },
    market: { noDress: true },
    theatre: { noDress: true },
    temple: { noDress: true },
    warehouse: { noFinial: true },
    // the hall on the whole slot, the clock tower over its centre (band 2+)
    townhall: ([x, y, w, d], top) => ({ noDress: true, hit: [[x, y, w, d, Math.min(top, 46)], [x + w / 2 - 0.45, y + d / 2 - 0.45, 0.9, 0.9, top]] }),
    // the stacked tower with its hat drooping to the right
    magetower: ([x, y, w, d], top) => ({ hit: [[x + w / 2 - 0.4, y + d / 2 - 0.5, 0.9, 0.8, top]] }),
  };
  for (const t of Object.keys(O)) {
    const f = R[t]; if (typeof f !== 'function') continue;
    R[t] = (api, slot, L, band, ctx) => {
      const h = f(api, slot, L, band, ctx);
      if (h === undefined || h === false || h === null || typeof h === 'object') return h;
      return Object.assign({ top: +h || 0 }, typeof O[t] === 'function' ? O[t](slot, +h || 0) : O[t]);
    };
  }
})();
