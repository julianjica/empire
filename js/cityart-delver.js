// Building art for the delver — see the CITYART contract in js/cityart.js
// Deepdelvers: dwarven mountain holds. Squat ashlar half-sunk into banked rock, iron-bound arched
// doors under rune-cut lintels, forge stacks with glowing vents, gear hoists and ore carts on rails.
// Era: rough-hewn stone propped with timber and turf roofs (Founding) -> dressed ashlar and slate
// (Kingdom) -> bronze roofs and gearwork (Empire) -> verdigris, gilded runes and great carved faces (Legend).
'use strict';
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.delver) return;
  let A = null, X = null;
  const reg = (t, fn) => {
    CITYART.delver[t] = (api, slot, L, band, ctx) => {
      A = api; X = ctx;
      if (window.__ART_DEBUG) (window.__artSlots = window.__artSlots || {})['delver.' + t + (t === 'cottage' ? ctx.i : '')] = slot.slice();
      return fn(slot, L, band, ctx);
    };
  };
  // ---------------- wrappers ----------------
  const P = (gx, gy, z = 0) => A.P(gx, gy, z);
  const box = (...a) => A.box(...a), poly = (...a) => A.poly(...a), line = (...a) => A.line(...a), circ = (...a) => A.circ(...a);
  const shade = (h, f) => A.shade(h, f), mix = (a, b, t) => A.mix(a, b, t);
  const BAND_LO = [1, 5, 10, 15];
  const sub = (L, band) => Math.max(0, L - BAND_LO[band]);
  const IRON = '#34312e', BRONZE = '#98683e', GOLD = '#e0b440', VERD = '#6f9d8c', WOOD = '#7a5a3c', DOOR = '#3b322c';
  const FIRE_D = '#c8601e', FIRE_N = '#ffb04a';
  const ROCK = '#857d72';
  // stone of the walls: rough brown-grey at first, dressed and paler with masonry / architecture
  const stone = (f = 0) => shade(X.era === 0 && !X.tech('masonry') ? '#8a8279' : X.tech('architecture') ? '#b2ab9f' : '#a39d93', f);
  const trim = () => X.era >= 3 ? GOLD : X.era >= 2 ? BRONZE : '#6a645c';
  // roof material by era
  const roofCol = () => ['#6e5a44', '#66625e', '#4e5864', VERD][X.era];   // timber/turf, slate, lead with bronze caps, verdigris
  const runeDay = () => X.era >= 3 ? GOLD : '#4f86b0';

  // ---------------- texture & detail ----------------
  // ashlar joints on the two visible faces (rough, irregular stones in the Founding era)
  function ashlar(b, step = 4.5, col) {
    col = col || shade(b.col, -0.2);
    const rough = X.era === 0 && !X.tech('masonry');
    for (const side of ['L', 'R']) {
      const f = side === 'L' ? A.onL : A.onR, Lf = side === 'L' ? b.w : b.d;
      let row = 0;
      for (let v = step; v < b.h - 0.5; v += step, row++) {
        line(f(b, 0, 0, v, v)[0], f(b, Lf, Lf, v, v)[0], col, 0.55);
        const jw = rough ? 0.18 + ((row * 7) % 3) * 0.06 : 0.26;
        for (let u = (row % 2 ? jw / 2 : jw) + (rough ? (row * 0.37) % 0.1 : 0); u < Lf - 0.05; u += jw) line(f(b, u, u, v - step, v)[0], f(b, u, u, v - step, v)[2], col, 0.45);
      }
    }
  }
  function rune(x, y, r = 1.1) { A.lampDot(x, y, r, runeDay(), '#8fd8ff'); }
  // a row of small rune marks across a face, at height v
  function runeRow(b, side, v, u0 = 0.08, u1, gap = 0.13) {
    const f = side === 'L' ? A.onL : A.onR; u1 = u1 == null ? (side === 'L' ? b.w : b.d) - 0.08 : u1;
    const n = Math.max(2, Math.round((u1 - u0) / gap));
    for (let k = 0; k <= n; k++) { const p = f(b, u0 + (u1 - u0) * k / n, 0, v, v)[0]; A.lamp([[p[0] - 0.7, p[1] + 1], [p[0] + 0.7, p[1] + 1], [p[0] + 0.7, p[1] - 1.2], [p[0] - 0.7, p[1] - 1.2]], runeDay(), '#8fd8ff'); }
  }
  // an iron-bound round-arched door under a carved lintel (with runes from the Kingdom era / when asked)
  function ironDoor(b, side, u, dw = 0.32, dh = 10, runes) {
    const f = side === 'L' ? A.onL : A.onR;
    poly(f(b, u - dw / 2 - 0.08, u + dw / 2 + 0.08, 0, dh + 3.2), shade(b.col, -0.28), A.OUT, 0.6);
    const q = f(b, u - dw / 2, u + dw / 2, 0, dh - 2.6), tp = f(b, u, u, dh + 0.6, dh + 0.6)[0];
    const c = A.c; c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.lineTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]);
    c.quadraticCurveTo(tp[0] + (q[2][0] - q[3][0]) * 0.5, tp[1] - 1.5, q[3][0], q[3][1]); c.closePath();
    c.fillStyle = A.F(X.era >= 2 && dw > 0.3 ? mix(DOOR, BRONZE, 0.25) : DOOR); c.fill();
    for (const v of [2.2, dh * 0.55]) { line(f(b, u - dw / 2, u, v, v)[0], f(b, u + dw / 2, u, v, v)[0], X.era >= 2 ? BRONZE : '#1c1a18', 1.1); }
    line(f(b, u, u, 0, 0)[0], f(b, u, u, dh - 1, dh - 1)[0], '#1c1a18', 0.5);
    if (runes || (runes !== false && X.era >= 1)) { const n = dw > 0.4 ? 5 : 3; for (let k = 0; k < n; k++) { const p = f(b, u - dw / 2 + dw * (k + 0.5) / n, 0, dh + 1.6, 0)[0]; rune(p[0], p[1], 0.8); } }
  }
  // a glowing forge vent with a grill
  function vent(b, side, u, v, ww = 0.16, h = 4) {
    const f = side === 'L' ? A.onL : A.onR;
    poly(f(b, u - ww / 2 - 0.04, u + ww / 2 + 0.04, v - 0.8, v + h + 0.8), shade(b.col, -0.3), null);
    A.lamp(f(b, u - ww / 2, u + ww / 2, v, v + h), FIRE_D, FIRE_N);
    for (let k = 1; k < 3; k++) { const uu = u - ww / 2 + ww * k / 3; line(f(b, uu, 0, v, 0)[0], f(b, uu, 0, v + h, 0)[0], '#2a1a10', 0.6); }
  }
  // a small round-headed amber window cut deep into the stone
  function deepWin(b, side, u, v, ww = 0.13, wh = 4.5) {
    const f = side === 'L' ? A.onL : A.onR;
    poly(f(b, u - ww / 2 - 0.05, u + ww / 2 + 0.05, v - 1, v + wh + 1.2), shade(b.col, -0.3), null);
    const q = f(b, u - ww / 2, u + ww / 2, v, v + wh - 1), tp = f(b, u, u, v + wh + 0.6, 0)[0];
    A.lamp([q[0], q[1], q[2], tp, q[3]], '#3a3c44', A.nightGlass());
  }
  // a toothed cog (screen-space), optionally recorded as a turning wheel
  function cog(x, y, r, col = IRON, teeth = 8) {
    const c = A.c; c.beginPath();
    for (let k = 0; k < teeth * 2; k++) { const a = k / (teeth * 2) * A.TAU, rr = k % 2 ? r : r * 1.22; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fillStyle = A.F(col); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke();
    circ(x, y, r * 0.72, shade(col, 0.15), null);
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI; line([x - Math.cos(a) * r * 0.7, y - Math.sin(a) * r * 0.7], [x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7], shade(col, -0.2), 1); }
    circ(x, y, r * 0.22, X.era >= 2 ? BRONZE : '#1c1a18', null);
  }
  // banked rock behind a building's back edges: makes it look half-sunk into the hill
  function berm(x, y, w, d, h, col = ROCK) {
    const c = A.c;
    const a0 = P(x - 0.12, y + d, 0), a1 = P(x - 0.34, y + d * 0.55, h * 0.75), a2 = P(x - 0.25, y + d * 0.05, h * 0.98),
      a3 = P(x + w * 0.35, y - 0.3, h), a4 = P(x + w * 0.8, y - 0.28, h * 0.62), a5 = P(x + w + 0.05, y - 0.1, 0), e = P(x + w * 0.5, y + d * 0.5, 0);
    const outline = () => { c.beginPath(); c.moveTo(a0[0], a0[1]); c.quadraticCurveTo(a1[0] - 3, a1[1], a1[0], a1[1] - 2); c.quadraticCurveTo(a2[0] - 2, a2[1], a2[0] + 2, a2[1] - 2);
      c.quadraticCurveTo(a3[0] - 6, a3[1] - 3, a3[0], a3[1]); c.quadraticCurveTo(a4[0], a4[1] - 4, a4[0] + 3, a4[1]); c.quadraticCurveTo(a5[0] + 3, a5[1] - h * 0.3, a5[0], a5[1]); c.lineTo(e[0], e[1]); c.closePath(); };
    outline(); A.gradFill(a0[0], a5[0], col);
    // a lit upper face, ledges, cracks and boulders
    c.beginPath(); c.moveTo(a1[0], a1[1] - 2); c.quadraticCurveTo(a2[0] - 2, a2[1], a2[0] + 2, a2[1] - 2); c.quadraticCurveTo(a3[0] - 6, a3[1] - 3, a3[0], a3[1]);
    c.lineTo(...P(x + w * 0.3, y + 0.05, h * 0.62)); c.lineTo(...P(x + 0.05, y + d * 0.45, h * 0.5)); c.closePath(); c.fillStyle = A.F(A.SNOW ? '#f2f6f8' : shade(col, 0.13)); c.fill();
    line(P(x - 0.2, y + d * 0.3, h * 0.6), P(x + 0.1, y + d * 0.42, h * 0.22), shade(col, -0.3), 0.7);
    line(P(x + w * 0.5, y - 0.2, h * 0.8), P(x + w * 0.58, y, h * 0.3), shade(col, -0.3), 0.7);
    line(P(x + w * 0.12, y - 0.15, h * 0.7), P(x + w * 0.45, y - 0.12, h * 0.55), shade(col, -0.2), 0.6);
    if (!A.SNOW && A.SEASON < 2) for (const [gx, gy, z] of [[x - 0.26, y + d * 0.6, h * 0.5], [x + w * 0.6, y - 0.24, h * 0.66]]) { const [px, py] = P(gx, gy, z); circ(px, py, 2.2, '#6f8a4a', null); circ(px + 2, py + 1, 1.6, '#86a058', null); }
  }
  // turf roof (Founding era): a grassy hump on a flat stone top
  function sod(b) {
    const zt = b.z + b.h, [mx, my] = P(b.x + b.w / 2, b.y + b.d / 2, zt), c = A.c;
    c.beginPath(); c.ellipse(mx, my, b.w * A.HW * 0.75 + b.d * A.HW * 0.25, (b.w + b.d) * A.HH * 0.42, 0, Math.PI, A.TAU); c.closePath();
    c.fillStyle = A.F(A.SNOW ? '#f2f6f8' : A.SEASON === 2 ? '#9a8a4a' : '#7d8a52'); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.6; c.stroke();
    return zt + Math.min(b.w, b.d) * 9;
  }
  // low stone pyramid / hip roof in the era's material, with a gilded cap in the Legend era
  function slabRoof(b, rh) {
    const zt = A.hip(b, rh, roofCol(), 0.1, 'tile');
    if (X.era >= 2 && !A.SNOW) { // bronze (gilded in the Legend era) ridge caps down the hips
      const o = 0.1, x0 = b.x - o, x1 = b.x + b.w + o, y0 = b.y - o, y1 = b.y + b.d + o, W = x1 - x0, D = y1 - y0, zb = b.z + b.h, ym = (y0 + y1) / 2, xm = (x0 + x1) / 2;
      const r1 = W >= D ? P(x0 + D / 2, ym, zt) : P(xm, y0 + W / 2, zt), r2 = W >= D ? P(x1 - D / 2, ym, zt) : P(xm, y1 - W / 2, zt), cc = X.era >= 3 ? GOLD : BRONZE;
      line(P(x1, y1, zb), r2, cc, 1.3); line(P(x0, y1, zb), r1, cc, 1.3); line(P(x1, y0, zb), r2, cc, 1.3); line(r1, r2, cc, 1.6);
    }
    if (X.era >= 3) { const [px, py] = P(b.x + b.w / 2, b.y + b.d / 2, zt); circ(px, py, 1.6, GOLD, A.OUT); }
    return zt;
  }
  // a barrel vault (ridge along x or y) — the dwarven storehouse roof
  function vault(b, axis, col) {
    col = A.SNOW ? '#eef2f4' : col || roofCol();
    const zb = b.z + b.h, n = 10, o = 0.06;
    const r = (axis === 'x' ? b.d : b.w) / 2 + o, hz = r * 22;
    const pt = (s, a) => axis === 'x' ? P(s, b.y + b.d / 2 + r * Math.cos(a), zb + hz * Math.sin(a)) : P(b.x + b.w / 2 + r * Math.cos(a), s, zb + hz * Math.sin(a));
    const s0 = axis === 'x' ? b.x - o : b.y - o, s1 = axis === 'x' ? b.x + b.w + o : b.y + b.d + o;
    const surf = []; for (let k = 0; k <= n; k++) surf.push(pt(s0, k / n * Math.PI)); for (let k = n; k >= 0; k--) surf.push(pt(s1, k / n * Math.PI));
    poly(surf, shade(col, -0.22));
    const front = []; for (let k = 0; k <= n / 2; k++) front.push(pt(s0, k / n * Math.PI)); for (let k = n / 2; k >= 0; k--) front.push(pt(s1, k / n * Math.PI));
    poly(front, col, null);
    const rib = X.era === 2 && !A.SNOW ? BRONZE : shade(col, -0.32); for (let k = 1; k < 5; k++) { const t = s0 + (s1 - s0) * k / 5; for (let j = 0; j < n; j++) line(pt(t, j / n * Math.PI), pt(t, (j + 1) / n * Math.PI), rib, X.era === 2 ? 1 : 0.6); }
    // end cap (the visible gable end)
    const cap = []; for (let k = 0; k <= n; k++) cap.push(pt(s1 - o, k / n * Math.PI));
    poly(cap, shade(b.col || stone(), axis === 'x' ? -0.18 : 0));
    for (let k = 0; k <= n; k += 2) { const p = pt(s1 - o, k / n * Math.PI); circ(p[0], p[1], 0.9, X.era >= 3 ? GOLD : shade(b.col || stone(), -0.35), null); }
    return zb + hz;
  }
  // a carved standing stone "banner" with an emblem (hammer & anvil), glowing runes from the Kingdom era
  function stoneBanner(gx, gy, h = 18) {
    box(gx - 0.12, gy - 0.12, 0.24, 0.24, 0, 3, stone(-0.1));
    const [x, y] = P(gx, gy, 3), wd = 4.5, col = stone(0.05);
    poly([[x - wd + 1.4, y - 1], [x + wd + 1.4, y - 1], [x + wd + 1.4, y - h], [x - wd + 1.4, y - h]], shade(col, -0.3), null);
    poly([[x - wd, y], [x, y - 3], [x + wd, y], [x + wd, y - h], [x - wd, y - h]], col);
    poly([[x - wd - 1, y - h], [x + wd + 1, y - h], [x + wd + 1, y - h - 2], [x - wd - 1, y - h - 2]], X.era >= 2 ? BRONZE : shade(col, -0.15));
    const ec = X.era >= 3 ? GOLD : shade(col, -0.35);
    poly([[x - 2.6, y - h * 0.38], [x + 2.6, y - h * 0.38], [x + 1.6, y - h * 0.38 - 2], [x - 1.6, y - h * 0.38 - 2]], ec, null);  // anvil
    line([x - 1.5, y - h * 0.5], [x + 1.8, y - h * 0.82], ec, 1.2); poly([[x + 0.4, y - h * 0.88], [x + 3.4, y - h * 0.76], [x + 2.8, y - h * 0.68], [x - 0.2, y - h * 0.8]], ec, null); // hammer
    if (X.era >= 1) { rune(x - 2.6, y - h * 0.18, 0.7); rune(x, y - h * 0.15, 0.7); rune(x + 2.6, y - h * 0.18, 0.7); }
    return 3 + h + 2;
  }
  function brazier(gx, gy, z = 0, s = 1) {
    const [x, y] = P(gx, gy, z);
    line([x - 2.5 * s, y], [x - 1.5 * s, y - 6 * s], IRON, 1); line([x + 2.5 * s, y], [x + 1.5 * s, y - 6 * s], IRON, 1);
    poly([[x - 3.5 * s, y - 6 * s], [x + 3.5 * s, y - 6 * s], [x + 2.2 * s, y - 8.5 * s], [x - 2.2 * s, y - 8.5 * s]], X.era >= 2 ? BRONZE : IRON);
    A.lampDot(x, y - 8.6 * s, 1.6 * s, FIRE_D, FIRE_N);
    A.rec('fires', { x, y: y - 8.5 * s, s: 0.45 * s }); A.rec('lights', { x, y: y - 10 * s, r: 18 * s });
  }
  function rails(p0, p1) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy), nx = -dy / len * 0.12, ny = dx / len * 0.12;
    const n = Math.max(1, Math.round(len / 0.22));
    for (let k = 0; k <= n; k++) { const t = k / n, gx = p0[0] + dx * t, gy = p0[1] + dy * t; line(P(gx - nx * 1.5, gy - ny * 1.5), P(gx + nx * 1.5, gy + ny * 1.5), '#5a4030', 1.5); }
    for (const sgn of [-1, 1]) line(P(p0[0] + nx * sgn, p0[1] + ny * sgn), P(p1[0] + nx * sgn, p1[1] + ny * sgn), '#4a4a50', 0.9);
  }
  function oreCart(gx, gy, full = true) {
    const b = box(gx - 0.17, gy - 0.13, 0.34, 0.26, 1.5, 5, '#5e5248');
    line(A.onL(b, 0.02, 0, 4, 4)[0], A.onL(b, 0.32, 0, 4, 4)[0], IRON, 0.8);
    for (const u of [0.07, 0.27]) { const p = A.onL(b, u, 0, 0, 0)[0]; circ(p[0], p[1], 1.6, IRON, null); }
    if (full) { const [cx, cy] = P(gx, gy, 7); for (let k = 0; k < 4; k++) circ(cx - 3 + k * 2, cy - (k % 2), 1.5, k % 2 ? '#a0522d' : '#5a524c', null); }
  }
  // a stern carved dwarf face (screen-space): helm, brow, great beard, eyes that glow at night
  function stoneFace(x, y, s = 1, col) {
    col = col || stone(0.06);
    poly([[x - 6 * s, y - 14 * s], [x + 6 * s, y - 14 * s], [x + 7 * s, y - 20 * s], [x, y - 24 * s], [x - 7 * s, y - 20 * s]], X.era >= 3 ? GOLD : shade(col, -0.12)); // helm
    poly([[x - 6 * s, y - 14 * s], [x + 6 * s, y - 14 * s], [x + 5.5 * s, y - 7 * s], [x - 5.5 * s, y - 7 * s]], col);
    line([x - 5 * s, y - 12.2 * s], [x - 1 * s, y - 11.4 * s], shade(col, -0.4), 1.4 * s); line([x + 5 * s, y - 12.2 * s], [x + 1 * s, y - 11.4 * s], shade(col, -0.4), 1.4 * s);
    A.lampDot(x - 2.8 * s, y - 10.3 * s, 0.9 * s, '#2a2624', '#8fd8ff'); A.lampDot(x + 2.8 * s, y - 10.3 * s, 0.9 * s, '#2a2624', '#8fd8ff');
    poly([[x - 1 * s, y - 11 * s], [x + 1 * s, y - 11 * s], [x + 1.4 * s, y - 7.5 * s], [x - 1.4 * s, y - 7.5 * s]], shade(col, -0.15), null);
    poly([[x - 6.5 * s, y - 8 * s], [x + 6.5 * s, y - 8 * s], [x + 4 * s, y + 1 * s], [x, y + 4 * s], [x - 4 * s, y + 1 * s]], shade(col, 0.08)); // beard
    for (const dx of [-3, 0, 3]) line([x + dx * s, y - 7 * s], [x + dx * 0.7 * s, y + 1.5 * s], shade(col, -0.25), 0.7);
    if (X.era >= 2) circ(x, y + 1.5 * s, 1.1 * s, X.era >= 3 ? GOLD : BRONZE, null);
  }
  // a dwarf statue with a raised hammer on a plinth
  function statue(gx, gy, h = 20) {
    const pb = box(gx - 0.17, gy - 0.17, 0.34, 0.34, 0, 5, stone(-0.06)); void pb;
    const [x, y] = P(gx, gy, 5), col = X.era >= 3 ? '#c9a640' : X.era >= 2 ? '#8a6a4a' : stone(0.1), s = h / 20;
    line([x - 1.5 * s, y], [x - 1.5 * s, y - 4 * s], shade(col, -0.2), 2); line([x + 1.5 * s, y], [x + 1.5 * s, y - 4 * s], shade(col, -0.2), 2);
    poly([[x - 4 * s, y - 4 * s], [x + 4 * s, y - 4 * s], [x + 3.4 * s, y - 13 * s], [x - 3.4 * s, y - 13 * s]], col);
    poly([[x - 2.5 * s, y - 13 * s], [x + 2.5 * s, y - 13 * s], [x, y - 6 * s]], shade(col, 0.15), null);
    circ(x, y - 15 * s, 2.3 * s, shade(col, 0.05), A.OUT);
    poly([[x - 2.6 * s, y - 15.5 * s], [x + 2.6 * s, y - 15.5 * s], [x, y - 19 * s]], shade(col, -0.15), null);
    line([x + 3 * s, y - 11 * s], [x + 6 * s, y - 20 * s], shade(col, -0.3), 1.2);
    poly([[x + 3.6 * s, y - 21 * s], [x + 8.4 * s, y - 19.2 * s], [x + 7.8 * s, y - 17.6 * s], [x + 3 * s, y - 19.4 * s]], shade(col, -0.2));
    return 5 + h + 2;
  }
  // a square keep tower with a parapet (and a bronze/verdigris cap from the Empire era)
  function keep(x, y, w, d, H, flag = true) {
    const b = box(x, y, w, d, 0, H, stone(0.04)); ashlar(b, 5);
    for (let v = 10; v < H - 8; v += 11) { A.slit(b, 'L', w / 2, v, 6); A.slit(b, 'R', d / 2, v, 6); }
    if (X.tech('fortification')) box(x - 0.1, y - 0.1, w + 0.2, d + 0.2, H - 6, 3, shade(stone(), -0.2));
    const t = box(x - 0.06, y - 0.06, w + 0.12, d + 0.12, H, 2, shade(stone(), -0.1));
    let zt = H + 2;
    if (X.era >= 2) zt = slabRoof({ ...t, h: 2 }, Math.min(w, d) * 22);
    else A.parapet({ ...t, h: 2 }, 3), zt += 5;
    if (flag) A.flagpole(x + w / 2, y + d / 2, zt - 1, 12, A.STY.flag);
    return zt + 12;
  }
  function crateStack(gx, gy, n = 2) { for (let k = 0; k < n; k++) A.crate(gx - 0.14, gy - 0.14 - k * 0.0, 0.26 - k * 0.04, k * 5.7); }
  // a shaggy mountain goat, bigger than the stock beast: long coat, swept-back horns, a beard
  function goat(gx, gy, flip = 1, s = 1.45, col = '#d8ccb0') {
    const [x, y] = P(gx, gy), dk = shade(col, -0.45), c = A.c;
    for (const dx of [-4, -2.2, 2.6, 4.4]) line([x + dx * s * flip, y - 5 * s], [x + dx * s * flip, y], dk, 1.3 * s);
    c.beginPath(); c.ellipse(x, y - 7 * s, 6.4 * s, 3.6 * s, 0, 0, A.TAU); c.fillStyle = A.F(col); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke();
    c.beginPath(); c.ellipse(x - 0.5 * s * flip, y - 8.2 * s, 5 * s, 1.8 * s, 0, Math.PI, A.TAU); c.fillStyle = A.F(shade(col, 0.15)); c.fill();
    for (let k = -4; k <= 4; k += 2) line([x + k * s, y - 4.2 * s], [x + (k + 0.6) * s, y - 2.6 * s], shade(col, -0.25), 0.8);   // the shaggy fringe of the coat
    const hx = x + 7.5 * s * flip, hy = y - 12.5 * s;
    poly([[x + 3.5 * s * flip, y - 9.5 * s], [hx - 1 * s * flip, hy - 0.5 * s], [hx + 2.6 * s * flip, hy + 2.6 * s], [x + 6 * s * flip, y - 6 * s]], col);
    poly([[hx - 1.2 * s * flip, hy - 1.2 * s], [hx + 3.6 * s * flip, hy + 1.6 * s], [hx + 3 * s * flip, hy + 3.6 * s], [hx - 0.4 * s * flip, hy + 2.2 * s]], shade(col, -0.06));
    poly([[hx + 1.2 * s * flip, hy + 3 * s], [hx + 2.6 * s * flip, hy + 3.2 * s], [hx + 1.6 * s * flip, hy + 6.2 * s]], shade(col, -0.3), null);   // beard
    c.beginPath(); c.moveTo(hx, hy - 0.8 * s); c.quadraticCurveTo(hx - 2.5 * s * flip, hy - 6 * s, hx - 5.5 * s * flip, hy - 3.5 * s); c.strokeStyle = A.F('#5a4a36'); c.lineWidth = 1.5 * s; c.stroke();
    line([hx - 0.5 * s * flip, hy], [hx - 2.4 * s * flip, hy + 0.6 * s], dk, 1);   // ear
    A.lampDot(hx + 1.2 * s * flip, hy + 0.4 * s, 0.5 * s, '#2a2018', '#2a2018');
    line([x - 6 * s * flip, y - 8.5 * s], [x - 7.5 * s * flip, y - 10.5 * s], dk, 1.2 * s);
  }

  // =====================================================================
  //  TOWN HALL — the Hold Hall: terraces cut into the hillside, a keep at the back, a great door
  // =====================================================================
  reg('townhall', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.15, y + 0.15, w * 0.8, d * 0.7, 16 + band * 9);
    let top = 0;
    if (band >= 2) top = keep(x + 1.78, y + 0.06, 0.9, 0.9, 46 + band * 9 + s);
    const H = 15 + band * 2 + Math.min(4, s);
    if (band >= 1) { // upper terrace behind the hall
      const ut = box(x + 0.35, y + 0.3, 1.45, 1.0, 0, H + 11 + band * 2, stone(0.06)); ashlar(ut, 5);
      const n = 3; for (let k = 0; k < n; k++) deepWin(ut, 'R', 0.2 + k * 0.3, H + 3, 0.12, 5);
      if (band >= 3) {
        const t3 = box(x + 0.45, y + 0.38, 0.9, 0.7, ut.h, 11, stone(0.1)); ashlar(t3, 5);
        deepWin(t3, 'L', 0.25, 3); deepWin(t3, 'L', 0.65, 3); runeRow(t3, 'L', 9);
        top = Math.max(top, slabRoof(t3, 10));
      } else { A.parapet(ut, 3); top = Math.max(top, ut.h + 5); }
    }
    // the hall itself
    const hb = box(x + 0.3, y + 1.15, 2.15, 1.25, 0, H, stone());
    ashlar(hb);
    box(hb.x - 0.04, hb.y - 0.04, hb.w + 0.08, hb.d + 0.08, H - 3, 3, shade(stone(), -0.2));   // carved band
    if (band >= 1) runeRow(hb, 'L', H - 1.6, 0.1, 0.75), runeRow(hb, 'L', H - 1.6, 1.4, 2.05);
    ironDoor(hb, 'L', 1.07, 0.42 + band * 0.04, 10 + band * 1.2, band >= 1);
    for (const u of [0.35, 1.8]) deepWin(hb, 'L', u, H * 0.32, 0.14, 5);
    for (const u of [0.35, 0.9]) A.slit(hb, 'R', u, H * 0.38, 5);
    if (X.tech('architecture')) for (const u of [0.72, 1.42]) { const [px, py] = P(hb.x + u, hb.y + hb.d + 0.08); A.cyl(hb.x + u, hb.y + hb.d + 0.08, 0.07, 0, H - 3, stone(0.12)); void px; void py; }
    if (band === 0) top = Math.max(top, X.era === 0 ? sod(hb) : slabRoof(hb, 9));
    else if (band === 1) top = Math.max(top, slabRoof(hb, 10));
    else { (X.tech('fortification') ? A.parapet(hb, 3) : A.parapet(hb, 2.5)); top = Math.max(top, H + 5); }
    // the great face over the door (band 3) or a carved shield (band 2)
    if (band >= 3) { const [fx, fy] = P(hb.x + 1.07, hb.y + 0.95, H + 20); stoneFace(fx, fy + 6, 1.05); }
    else if (band >= 2) { const [fx, fy] = P(hb.x + 1.07, hb.y + hb.d, H + 3); circ(fx, fy, 4, trim(), A.OUT); circ(fx, fy, 1.6, A.STY.flag, null); }
    // braziers at the door, stone banners down the right side, a gong
    if (band >= 1 || s >= 2) { brazier(hb.x + 0.62, hb.y + hb.d + 0.18); brazier(hb.x + 1.52, hb.y + hb.d + 0.18); }
    if (band >= 2) { stoneBanner(x + 2.6, y + 1.3, 18 + band * 2); stoneBanner(x + 2.6, y + 2.0, 18 + band * 2); }
    else if (s >= 3) stoneBanner(x + 2.6, y + 1.6, 16);
    if (band === 0) A.flagpole(x + 2.55, y + 2.5, 0, 26, A.STY.flag);
    if (band >= 3 && X.era >= 3) statue(x + 0.2, y + 0.85, 22);
    return top;
  });

  // =====================================================================
  //  COTTAGE — a burrow-home dug into the slope, stone front, turf/slate/bronze roof
  // =====================================================================
  reg('cottage', ([x, y], L, band, ctx) => {
    const i = ctx.i || 0, s = sub(L, band), v = i % 3;
    berm(x + 0.1, y + 0.08, 1.05, 0.85, 11 + band * 5 + (i % 2) * 3);
    let top;
    if (band === 0) {
      const b = box(x + 0.3, y + 0.32, 0.8, 0.6, 0, 8, stone(-0.04)); ashlar(b, 3);
      if (X.era === 0) { line(A.onL(b, 0.04, 0, 0, 0)[0], A.onL(b, 0.04, 0, 8, 8)[0], WOOD, 1.6); line(A.onL(b, 0.76, 0, 0, 0)[0], A.onL(b, 0.76, 0, 8, 8)[0], WOOD, 1.6); }
      ironDoor(b, 'L', 0.32, 0.22, 6.5, false); deepWin(b, 'R', 0.3, 3, 0.1, 3);
      top = X.era === 0 ? sod(b) : slabRoof(b, 6);
      A.chimney(b.x + 0.6, b.y + 0.1, 8, 6, 'house', '#7a746c');
      if (s >= 1) A.barrel(x + 1.18, y + 1.02);
      if (s >= 2) { const [cx, cy] = P(x + 0.2, y + 1.05); circ(cx, cy - 2, 2.6, '#6b4b30', A.OUT); line([cx - 1, cy - 4], [cx + 2, cy - 8], '#4a3a2a', 1); }
      if (s >= 3) { const [lx, ly] = P(x + 0.28, y + 0.95); line([lx, ly], [lx, ly - 11], IRON, 1); A.lantern(lx + 2, ly - 9, 1.2); line([lx, ly - 11], [lx + 2, ly - 11], IRON, 0.8); }
      return top;
    }
    if (band === 1) {
      const b = box(x + 0.22, y + 0.24, 0.92, 0.7, 0, 10, stone()); ashlar(b, 3.4);
      box(b.x - 0.03, b.y - 0.03, b.w + 0.06, b.d + 0.06, 8, 2, shade(stone(), -0.2));
      ironDoor(b, 'L', 0.3, 0.24, 7.5); deepWin(b, 'L', 0.68, 3, 0.12, 3.5); deepWin(b, 'R', 0.35, 3, 0.12, 3.5);
      top = slabRoof(b, 8);
      A.chimney(b.x + 0.62, b.y + 0.08, 10 + 2, 9, 'house', '#7a746c');
      if (v === 0) oreCart(x + 1.15, y + 1.0, s >= 2); else if (v === 1) { A.barrel(x + 1.15, y + 0.98); if (s >= 2) A.barrel(x + 1.2, y + 0.8); } else { cog(...P(x + 1.15, y + 1.0, 4), 3.4, '#5a5450', 7); }
      if (s >= 3) { const [lx, ly] = P(x + 0.22, y + 1.02); line([lx, ly], [lx, ly - 11], IRON, 1); A.lantern(lx + 2, ly - 9, 1.2); line([lx, ly - 11], [lx + 2, ly - 11], IRON, 0.8); }
      return top;
    }
    // band 2+: terraced into the slope — a front storey and a set-back upper storey; band 3 adds a turret
    const lo = box(x + 0.18, y + 0.32, 1.0, 0.68, 0, 9, stone()); ashlar(lo, 3);
    ironDoor(lo, 'L', 0.3, 0.24, 7.5); deepWin(lo, 'L', 0.72, 2.5, 0.13, 3.5); deepWin(lo, 'R', 0.4, 2.5, 0.13, 3.5);
    A.parapet(lo, 2, stone(0.06));
    const up = box(x + 0.22, y + 0.12, 0.72, 0.42, 9, 8, stone(0.06)); ashlar(up, 3);
    deepWin(up, 'L', 0.22, 2, 0.11, 3.5); deepWin(up, 'L', 0.52, 2, 0.11, 3.5);
    top = slabRoof(up, 7);
    A.chimney(up.x + 0.55, up.y + 0.06, 17, 8, 'house', '#7a746c');
    if (band >= 3) {
      const tx = x + 1.05, ty = y + 0.35;
      A.cyl(tx, ty, 0.17, 0, 21, stone(0.08));
      const [wx, wy] = P(tx + 0.1, ty + 0.12, 13); A.lampDot(wx, wy, 1.3, '#3a3c44', A.nightGlass());
      top = Math.max(top, A.cone(tx, ty, 0.22, 21, 10, roofCol()));
      if (X.era >= 3) { const [gx, gy] = P(tx, ty, 31); circ(gx, gy, 1.4, GOLD, A.OUT); }
    }
    if (v === 0) oreCart(x + 1.12, y + 1.08, true); else if (v === 1) stoneBanner(x + 1.16, y + 1.05, 12); else { A.barrel(x + 1.12, y + 1.06); A.barrel(x + 1.2, y + 0.88); }
    if (s >= 2 || band >= 3) { const [lx, ly] = P(x + 0.12, y + 1.08); line([lx, ly], [lx, ly - 12], IRON, 1); A.lantern(lx + 2, ly - 10, 1.2); line([lx, ly - 12], [lx + 2, ly - 12], IRON, 0.8); }
    return top;
  });

  // =====================================================================
  //  MINE — a portal cut into the mountain, rails and ore carts, a gear headframe, an engine house
  // =====================================================================
  function headframe(gx, gy, H, big) {
    const a = P(gx - 0.25, gy + 0.2), b = P(gx + 0.25, gy - 0.2), c2 = P(gx - 0.2, gy - 0.25), t = P(gx, gy, H);
    const col = X.era >= 2 ? '#4a4644' : WOOD, lw = big ? 2.2 : 1.8;
    line(c2, t, shade(col, -0.2), lw); line(a, t, col, lw); line(b, t, col, lw);
    for (const f of [0.35, 0.65]) line([a[0] + (t[0] - a[0]) * f, a[1] + (t[1] - a[1]) * f], [b[0] + (t[0] - b[0]) * f, b[1] + (t[1] - b[1]) * f], col, 1);
    cog(t[0], t[1] + 2, big ? 6 : 4.5, X.era >= 2 ? '#5a5652' : '#6a5a48', big ? 10 : 8);
    line([t[0] + (big ? 6 : 4.5), t[1] + 2], [t[0] + (big ? 6 : 4.5), a[1] - 4], '#1c1a18', 0.6);
  }
  reg('mine', ([x, y, w, d], L, band) => {
    const s = sub(L, band), mx = x + w * 0.38, my = y + d - 0.12;
    // headframe and engine house at the back right
    if (band >= 1) headframe(x + w * 0.72, y + d * 0.28, 32 + band * 6, band >= 3);
    if (band >= 2) {
      const eh = box(x + w * 0.52, y + d * 0.08, 0.7, 0.55, 0, 13 + band, stone()); ashlar(eh, 4);
      vent(eh, 'L', 0.35, 3, 0.18, 4);
      const sx = eh.x + 0.1, sy = eh.y + 0.05, sh = 30 + band * 4;
      const st = box(sx, sy, 0.22, 0.22, 0, sh, stone(-0.08)); ashlar(st, 5);
      box(sx - 0.03, sy - 0.03, 0.28, 0.28, sh, 2, X.era >= 2 ? BRONZE : '#5a524c');
      const [px, py] = P(sx + 0.11, sy + 0.11, sh + 3); A.rec('smoke', { x: px, y: py, kind: 'smelter', seed: A.R(), dark: true });
      slabRoof(eh, 6);
    }
    if (band >= 3) headframe(x + w * 0.2, y + d * 0.22, 30, false);
    // the rock face round the portal
    berm(mx - 0.55, my - 0.9, 1.1, 0.6, 20 + band * 6, '#8a8276');
    const pw = 0.55 + band * 0.06, ph = 12 + band * 2.5;
    const fr = box(mx - pw / 2 - 0.16, my - 0.42, pw + 0.32, 0.36, 0, ph + 4, stone(0.02));
    if (X.era === 0 && !X.tech('masonry')) { // timber-propped adit
      const q = A.onL(fr, 0.16, 0.16 + pw, 0, ph); poly(q, '#1a1614', null);
      line(q[0], q[3], WOOD, 2.4); line(q[1], q[2], WOOD, 2.4); line([q[3][0] - 2, q[3][1]], [q[2][0] + 2, q[2][1]], WOOD, 2.8);
    } else {
      ashlar(fr, 4);
      const q = A.onL(fr, 0.16, 0.16 + pw, 0, ph - 4), tp = A.onL(fr, 0.16 + pw / 2, 0, ph + 1, 0)[0], c = A.c;
      c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.lineTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]); c.quadraticCurveTo(tp[0] + (q[2][0] - q[3][0]) / 2, tp[1] - 2, q[3][0], q[3][1]); c.closePath(); c.fillStyle = A.F('#1a1614'); c.fill();
      for (let k = 0; k < 5; k++) { const p = A.onL(fr, 0.16 + pw * (k + 0.5) / 5, 0, ph + 2, 0)[0]; rune(p[0], p[1], 0.8); }
      if (band >= 2) for (let k = 1; k < 5; k++) { const p0 = A.onL(fr, 0.16 + pw * k / 5, 0, 0, 0)[0], p1 = A.onL(fr, 0.16 + pw * k / 5, 0, ph - 4.5, 0)[0]; line(p0, p1, '#2e2a26', 0.9); }   // iron gate
    }
    const [lx, ly] = A.onL(fr, 0.06, 0, ph * 0.7, 0)[0]; A.lantern(lx, ly, 1.5);
    if (band >= 3) { const [fx, fy] = A.onL(fr, 0.16 + pw / 2, 0, ph + 18, 0)[0]; stoneFace(fx, fy, 0.9); }
    // rails out of the portal, carts, spoil
    const rl = Math.min(1.1, A.N - 0.4 - my);
    if (rl > 0.2) rails([mx, my - 0.05], [mx, my + rl]);
    if (rl > 0.3) oreCart(mx, my + Math.min(0.45, rl - 0.15), true);
    if (band >= 1 && rl > 0.2) { rails([mx + 0.05, my + 0.15], [x + w * 0.85, my + 0.15]); oreCart(x + w * 0.72, my + 0.15, s >= 1); }
    const piles = Math.min(3, band + (s >= 2 ? 1 : 0));
    for (let k = 0; k < piles; k++) { const [ox, oy] = P(x + 0.25 + k * 0.32, y + d * 0.45 + (k % 2) * 0.2), c = A.c; c.beginPath(); c.ellipse(ox, oy - 1, 6, 3, 0, Math.PI, A.TAU); c.fillStyle = A.F(A.SNOW ? '#e8ecee' : '#6a5e54'); c.fill(); for (let j = 0; j < 4; j++) circ(ox - 3 + j * 2, oy - 2 - (j % 2), 1.3, j % 2 ? '#a0522d' : '#7a6e62', null); }
    if (X.tech('deepshafts') && band >= 1) brazier(mx - pw / 2 - 0.3, my + 0.1);
    return 24 + band * 6;
  });

  // =====================================================================
  //  QUARRY — a terraced cliff of fresh-cut stone, a gear-driven derrick, blocks on rails
  // =====================================================================
  reg('quarry', ([x, y, w, d], L, band) => {
    const s = sub(L, band), steps = 1 + Math.min(3, band + (s >= 3 ? 1 : 0));
    berm(x + 0.1, y + 0.1, w - 0.5, d * 0.45, 30 + band * 6, '#8f877a');
    const fresh = '#b9b09e', rockc = '#958c7e';
    // ledges cut into the cliff, stepping down toward the front: ragged tops, split-off corners,
    // a fresh-cut face with drill lines (plug & feather), tool marks and a bedding seam
    function ledge(x0, y0, ww, dd, hh, k) {
      const n = Math.max(4, Math.round(ww / 0.16)), hs = [];
      for (let i = 0; i <= n; i++) hs.push(Math.max(3, hh + Math.sin(k * 3.1 + i * 2.3) * 1.5 + (((i * 7 + k * 5) % 3) - 1) * 0.9 - (i === n ? 2.5 : 0)));
      const xi = i => x0 + ww * i / n, face = mix(rockc, fresh, k % 2 ? 0.85 : 0.65), topc = A.SNOW ? '#eef2f4' : mix(shade(rockc, -0.06), '#7d8a52', A.SEASON === 3 ? 0 : 0.18);
      // the right (end) face: broken back at an angle
      poly([P(x0 + ww, y0, 0), P(x0 + ww + 0.1, y0 + dd * 0.6, 0), P(x0 + ww - 0.04, y0 + dd, 0), P(x0 + ww - 0.04, y0 + dd, hs[n]), P(x0 + ww, y0, hs[n] + 1.5)], shade(rockc, -0.24));
      // the top, following the ragged edge
      const top = []; for (let i = 0; i <= n; i++) top.push(P(xi(i), y0, hs[i] + 0.8)); for (let i = n; i >= 0; i--) top.push(P(xi(i) - (i === n ? 0.04 : 0), y0 + dd, hs[i]));
      poly(top, topc);
      if (!A.SNOW) for (let i = 1; i < n; i += 3) { const [tx, ty] = P(xi(i), y0 + dd * 0.4, hs[i]); circ(tx, ty, 1.3, '#6f8a4a', null); circ(tx + 1.6, ty + 0.4, 0.9, '#86a058', null); }
      // the fresh-cut front face with a recessed lower course
      const fr = [P(x0, y0 + dd, 0), P(x0 + ww - 0.04, y0 + dd, 0)]; for (let i = n; i >= 0; i--) fr.push(P(xi(i) - (i === n ? 0.04 : 0), y0 + dd, hs[i]));
      poly(fr, face);
      const seam = hh * 0.42;
      poly([P(x0 + 0.06, y0 + dd, 0), P(x0 + ww * 0.7, y0 + dd, 0), P(x0 + ww * 0.7, y0 + dd, seam), P(x0 + 0.06, y0 + dd, seam)], shade(face, -0.1), null);
      line(P(x0, y0 + dd, seam), P(x0 + ww - 0.04, y0 + dd, seam - 0.6), shade(fresh, -0.3), 0.6);
      for (let i = 1; i < n; i += 2) line(P(xi(i), y0 + dd, hs[i] - 0.4), P(xi(i), y0 + dd, Math.max(seam + 0.5, hs[i] - 4)), shade(fresh, -0.42), 0.7);   // drill holes
      for (let u = 0.12 + (k % 2) * 0.06; u < ww * 0.68; u += 0.14) line(P(x0 + u, y0 + dd, 0.8), P(x0 + u + 0.05, y0 + dd, seam - 0.8), shade(fresh, -0.2), 0.4);   // tool marks
      // a half-split block jutting from the face
      const bx = x0 + ww * (0.3 + (k % 3) * 0.15);
      box(bx, y0 + dd - 0.02, 0.2, 0.16, seam, 4, mix(fresh, '#ffffff', 0.1));
    }
    for (let k = 0; k < steps; k++) {
      const dy = d * 0.14 + k * 0.26, hh = (steps - k) * 7, x0 = x + 0.2 + k * 0.12 + (k % 2) * 0.05, ww = w - 0.85 - k * 0.22;
      ledge(x0, y + 0.08, ww, dy, hh, k);
      A.rock(x0 + ww * 0.85, y + dy + 0.18, 0.35 + (k % 2) * 0.15, rockc);
      if (k === steps - 1) for (let j = 0; j < 4; j++) A.rock(x0 + 0.2 + j * 0.28, y + dy + 0.22 + (j % 2) * 0.08, 0.18 + (j % 2) * 0.07, j % 2 ? fresh : rockc);   // rubble at the foot
    }
    // cut blocks waiting
    const nb = 2 + band + Math.min(2, s);
    for (let k = 0; k < nb; k++) { const gx = x + 0.3 + (k % 4) * 0.38, gy = y + d * 0.62 + Math.floor(k / 4) * 0.35; box(gx, gy, 0.26, 0.22, 0, 6, k % 2 ? fresh : stone(0.1)); if (k % 3 === 0) box(gx + 0.03, gy + 0.02, 0.2, 0.18, 6, 5, fresh); }
    // derrick: timber at first, iron with a treadwheel cog later
    if (band >= 1) {
      const bx = x + w - 0.75, by = y + d * 0.4, H = 30 + band * 6, [b0x, b0y] = P(bx, by), t = P(bx, by, H), j = P(bx - 0.9, by - 0.3, H - 6);
      box(bx - 0.18, by - 0.18, 0.36, 0.36, 0, 5, stone());
      line(P(bx, by, 5), t, X.era >= 2 ? '#4a4644' : WOOD, 2.2); line(P(bx + 0.18, by + 0.18, 5), t, X.era >= 2 ? '#4a4644' : WOOD, 1);
      line(t, j, X.era >= 2 ? '#4a4644' : WOOD, 1.6); line(j, [j[0], j[1] + 18], '#1c1a18', 0.6);
      box(bx - 0.98, by - 0.4, 0.22, 0.2, H - 30, 5, fresh);
      if (band >= 2) { cog(b0x + 7, b0y - 12, 6.5, X.era >= 2 ? '#5a5652' : '#6a5a48', 10); }
      void j;
    }
    if (band >= 2) { rails([x + 0.4, y + d - 0.35], [x + w - 0.5, y + d - 0.35]); oreCart(x + w * 0.5, y + d - 0.35, false); box(x + w * 0.5 - 0.1, y + d - 0.43, 0.2, 0.16, 6.5, 4, fresh); }
    if (band >= 3) { const sh = box(x + 0.15, y + d - 0.75, 0.7, 0.5, 0, 11, stone()); ashlar(sh, 4); slabRoof(sh, 6); }
    return 30 + band * 6;
  });

  // =====================================================================
  //  LUMBER — pines, a stone saw-house with a great cog, a gantry crane, a waterwheel mill
  // =====================================================================
  reg('lumber', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    for (const [fx, fy, sc] of [[0.25, 0.3, 0.9], [0.6, 0.15, 1], [0.15, 0.95, 0.8], [w - 0.4, 0.2, 0.85], [0.2, d * 0.55, 0.95]]) if (!(fx < 0.6 && fy < 0.6 && X.tech('sawpits'))) A.treePine(x + fx, y + fy, sc);
    let top = 26;
    const hx = x + 0.75, hy = y + d * 0.3, hw = Math.min(1.3, w - 1.1), hd = 0.9;
    if (band === 0) { // a lean-to against a stone back wall
      box(hx, hy, hw, 0.18, 0, 11, stone(-0.06));
      for (const u of [0.05, hw - 0.05]) line(P(hx + u, hy + hd), P(hx + u, hy + hd, 8), WOOD, 1.6);
      poly([P(hx - 0.05, hy, 12), P(hx + hw + 0.05, hy, 12), P(hx + hw + 0.05, hy + hd + 0.05, 8), P(hx - 0.05, hy + hd + 0.05, 8)], A.SNOW ? '#eef2f4' : '#6a5a46');
      A.logPile(hx + 0.1, hy + 0.35, hw - 0.3, 2);
      top = 14;
    } else {
      const b = box(hx, hy, hw, hd, 0, 12 + band * 2, stone()); ashlar(b, 4);
      ironDoor(b, 'L', hw * 0.3, 0.36, 9);
      deepWin(b, 'R', hd * 0.3, 5);
      top = band >= 2 && X.era >= 1 ? vault(b, 'x') : slabRoof(b, 8);
      const [cx, cy] = A.onR(b, hd * 0.65, 0, b.h * 0.55, 0)[0]; cog(cx, cy, 5 + band, '#8a8a90', 12);    // the saw blade
      if (band >= 3) { A.rec('wheels', { x: cx + 9, y: cy + 8, r: 8 }); }
      A.chimney(hx + hw * 0.75, hy + 0.15, b.h + 4, 6, 'house', '#6f6a64');
    }
    if (band >= 2) { // gantry crane over the log yard
      const g0 = [x + w - 0.45, y + d * 0.55], g1 = [x + w - 0.45, y + d - 0.5], H = 28 + band * 3;
      for (const g of [g0, g1]) line(P(...g), P(...g, H), X.era >= 2 ? '#4a4644' : WOOD, 2);
      line(P(...g0, H), P(...g1, H), X.era >= 2 ? '#4a4644' : WOOD, 2.2);
      const mid = [g0[0], (g0[1] + g1[1]) / 2], m = P(...mid, H); line(m, [m[0], m[1] + 14], '#1c1a18', 0.6);
      A.log(mid[0] - 0.3, mid[0] + 0.3, mid[1], H - 18, 2);
      cog(...P(...g0, H - 4), 4, '#5a5450', 8);
    }
    const piles = 1 + Math.min(3, band + (s >= 2 ? 1 : 0));
    for (let k = 0; k < piles; k++) A.logPile(x + 0.4 + (k % 2) * 0.75, y + d * 0.62 + Math.floor(k / 2) * 0.55, 0.6, 2 + (k % 2));
    if (s >= 1 || band >= 1) { A.stump(x + 0.3, y + d - 0.4); const [ax, ay] = P(x + 0.3, y + d - 0.4, 3); line([ax, ay], [ax + 4, ay - 6], '#4a3a2a', 1.1); poly([[ax + 3, ay - 6], [ax + 6, ay - 7], [ax + 5.5, ay - 4]], '#8a8a90', null); }
    return top;
  });

  // =====================================================================
  //  FARM — a stone barn dug into the bank, goat pen, root cellar, cistern & waterwheel
  // =====================================================================
  reg('farm', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.1, y + 0.1, w * 0.65, d * 0.5, 16 + band * 5);
    let top;
    if (band === 0) { // root cellar in the bank + a turf hut
      const b = box(x + 0.3, y + 0.35, 0.8, 0.6, 0, 8, stone(-0.04)); ashlar(b, 3);
      ironDoor(b, 'L', 0.4, 0.3, 6.5, false);
      top = X.era === 0 ? sod(b) : slabRoof(b, 6);
    } else {
      const b = box(x + 0.2, y + 0.25, 1.35, 0.95, 0, 11 + band * 2, stone()); ashlar(b, 4);
      const bd = band >= 2 ? 0.5 : 0.4; ironDoor(b, 'L', 0.55, bd, 9, false);
      line(A.onL(b, 0.55 - bd / 2, 0, 1, 0)[0], A.onL(b, 0.55 + bd / 2, 0, 8, 0)[0], '#1c1a18', 0.8);
      deepWin(b, 'R', 0.3, 5); deepWin(b, 'R', 0.7, 5);
      top = slabRoof(b, 10 + band);
      if (band >= 2) { // loft hoist: a beam with a pulley and a sack
        const [px, py] = A.onL(b, 1.1, 0, b.h + 4, 0)[0]; line([px, py], [px + 8, py + 3], WOOD, 2); cog(px + 8, py + 3, 2.2, '#5a5450', 6); line([px + 8, py + 5], [px + 8, py + 13], '#1c1a18', 0.6); A.sack(...[x + 1.42, y + 1.35]);
      }
    }
    // goat pen of dry-stone walls in front
    const pen = [x + 0.15, y + d - 0.85, 0.95, 0.7];
    for (const [ax, ay, bx, by] of [[pen[0], pen[1] + pen[3], pen[0] + pen[2], pen[1] + pen[3]], [pen[0] + pen[2], pen[1], pen[0] + pen[2], pen[1] + pen[3]]]) box(Math.min(ax, bx) - 0.04, Math.min(ay, by) - 0.04, Math.abs(bx - ax) + 0.08, Math.abs(by - ay) + 0.08, 0, 3.5, stone(-0.1));
    A.animal(pen[0] + 0.35, pen[1] + 0.35, 'goat', 1);
    if (band >= 1 || s >= 2) A.animal(pen[0] + 0.7, pen[1] + 0.5, 'goat', -1);
    if (band >= 2) A.animal(pen[0] + 0.3, pen[1] + 0.62, 'boar', 1);
    // cistern & waterwheel (irrigation), haystack
    if (X.tech('irrigation') || band >= 3) {
      const cx = x + w - 0.45, cy = y + d - 0.55;
      A.cyl(cx, cy, 0.26, 0, 6, stone(), A.SNOW ? '#dfe8ee' : '#4f8aa8');
      const [wx, wy] = P(cx, cy + 0.26, 8); A.rec('wheels', { x: wx, y: wy, r: 6 });
    }
    if (band >= 3) { // a round stone grain tower with a conical cap and a hoist door
      const sx = x + 1.78, sy = y + 1.3; A.cyl(sx, sy, 0.24, 0, 24 + s * 2, stone(0.04));
      const [dx, dy] = P(sx + 0.17, sy + 0.17, 16); A.lampDot(dx, dy, 1.4, '#3a3c44', A.nightGlass());
      top = Math.max(top, A.cone(sx, sy, 0.3, 24 + s * 2, 12, roofCol()));
    } else if (s >= 1 || band >= 1) A.haystack(x + 1.6, y + 1.45, 0.45);
    return top;
  });

  // =====================================================================
  //  WAREHOUSE — barrel-vaulted deep cellars behind a great round vault door, with a hoist
  // =====================================================================
  reg('warehouse', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.08, y + 0.08, w * 0.7, d * 0.6, 18 + band * 6);
    if (band >= 2) { const b2 = box(x + 0.15, y + 0.15, 0.6, d - 1.0, 0, 12 + band * 2, stone(0.04)); ashlar(b2, 4); vault(b2, 'y'); deepWin(b2, 'R', 0.3, 5); }
    const bx = band >= 2 ? x + 0.75 : x + 0.2, bw = band >= 2 ? Math.min(0.95, w - 1.1) : Math.min(1.3, w - 0.6), bd = d - 0.75;
    const b = box(bx, y + 0.2, bw, bd, 0, 12 + band * 2, stone()); ashlar(b, 4);
    // the great round door on the front end
    const [vx, vy] = A.onL(b, bw / 2, 0, 6 + band * 0.6, 0)[0], r = 4.6 + band * 0.6;
    circ(vx, vy, r + 1.4, shade(stone(), -0.3), A.OUT);
    cog(vx, vy, r * 0.82, X.era >= 2 ? BRONZE : '#6b6b70', 10);
    if (X.era >= 1) for (let k = 0; k < 6; k++) { const a = k / 6 * A.TAU; rune(vx + Math.cos(a) * (r + 0.6), vy + Math.sin(a) * (r + 0.6) * 0.9, 0.6); }
    for (let k = 0; k < 2; k++) deepWin(b, 'R', bd * (k + 1) / 3, 6);
    let top = vault(b, 'y');
    if (band >= 1) { // hoist arm with a hanging crate
      const [hx, hy] = A.onR(b, bd * 0.85, 0, b.h + 2, 0)[0]; line([hx, hy], [hx + 10, hy + 2], IRON, 1.8); cog(hx + 2, hy, 2.6, '#5a5450', 7);
      line([hx + 10, hy + 2], [hx + 10, hy + 12], '#1c1a18', 0.6); poly([[hx + 7, hy + 12], [hx + 13, hy + 12], [hx + 13, hy + 18], [hx + 7, hy + 18]], '#a5773f');
    }
    if (band >= 3) top = Math.max(top, stoneBanner(x + 0.25, y + d - 0.4, 16));
    for (let k = 0; k < Math.min(3, s); k++) A.barrel(x + 0.3 + k * 0.22, y + d - 0.38);
    return top;
  });

  // =====================================================================
  //  MARKET — a pillared stone arcade around a weighing crane, heavy cloth stalls
  // =====================================================================
  function arcade(x, y, w, d, H, n) { // flat stone roof on stout round-arched piers (back + right row)
    const pc = stone(0.06);
    for (let k = 0; k <= n; k++) { const gx = x + w * k / n; box(gx - 0.07, y + d - 0.07, 0.14, 0.14, 0, H, pc); }
    for (let k = 0; k < n; k++) { const gy = y + d * k / n; box(x + w - 0.07, gy - 0.07, 0.14, 0.14, 0, H, pc); }
    const r = box(x - 0.08, y - 0.08, w + 0.16, d + 0.16, H, 4, stone(0.02));
    for (let k = 0; k < n; k++) { const a = A.onL(r, 0.08 + w * k / n + 0.07, 0, 0, 0)[0], b2 = A.onL(r, 0.08 + w * (k + 1) / n - 0.07, 0, 0, 0)[0], c = A.c; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2 + 5, b2[0], b2[1]); c.strokeStyle = A.F(shade(pc, -0.3)); c.lineWidth = 1; c.stroke(); }
    return r;
  }
  reg('market', ([x, y, w, d], L, band) => {
    const s = sub(L, band), cols = ['#4a6a8a', '#8a5a3a', '#6d7a80', '#3f7f8f'];
    let top = 14;
    if (band >= 1) { // back arcade hall
      const H = 12 + band * 2, aw = w - 0.6, ad = band >= 2 ? 1.0 : 0.7;
      const back = box(x + 0.15, y + 0.12, aw, 0.2, 0, H, stone(-0.04)); ashlar(back, 4);
      for (let k = 0; k < 3; k++) A.crate(x + 0.3 + k * 0.4, y + 0.38);
      const r = arcade(x + 0.15, y + 0.12, aw, ad, H, Math.max(2, Math.round(aw / 0.55)));
      top = H + 4;
      if (band >= 2) { const up = box(x + 0.25, y + 0.15, aw - 0.25, ad - 0.35, H + 4, 9, stone(0.06)); ashlar(up, 4); for (let k = 0; k < 3; k++) deepWin(up, 'L', (aw - 0.25) * (k + 0.5) / 3, 2.5, 0.12, 4); top = band >= 3 ? vault(up, 'x') : slabRoof(up, 7); }
      else A.parapet(r, 2.5);
    }
    // weighing crane / clock of gears at the centre
    const cx = x + w * 0.55, cy = y + d * 0.58;
    box(cx - 0.15, cy - 0.15, 0.3, 0.3, 0, 4, stone(0.08));
    const t = P(cx, cy, 14 + band * 4); line(P(cx, cy, 4), t, X.era >= 2 ? BRONZE : WOOD, 2);
    line([t[0] - 9, t[1] + 2], [t[0] + 9, t[1] - 2], X.era >= 2 ? BRONZE : WOOD, 1.4);
    for (const sx of [-8, 8]) { line([t[0] + sx, t[1] - sx * 0.25], [t[0] + sx, t[1] - sx * 0.25 + 8], '#1c1a18', 0.5); poly([[t[0] + sx - 3, t[1] - sx * 0.25 + 8], [t[0] + sx + 3, t[1] - sx * 0.25 + 8], [t[0] + sx + 2, t[1] - sx * 0.25 + 10], [t[0] + sx - 2, t[1] - sx * 0.25 + 10]], X.era >= 2 ? BRONZE : '#8a8a90', null); }
    if (band >= 2) cog(t[0], t[1] + 6, 3.2, X.era >= 2 ? BRONZE : '#5a5450', 8);
    // stalls with heavy cloth along the left
    const nst = 2 + Math.min(2, band + (s >= 2 ? 1 : 0)), y0 = band >= 1 ? y + (band >= 2 ? 1.2 : 0.95) : y + 0.35;
    for (let k = 0; k < nst; k++) { const sy = y0 + k * 0.42; if (sy > y + d - 0.75) break; A.stall(x + 0.18, sy, cols[k % 4], null); }
    if (band === 0) { const ct = box(x + 1.0, y + 0.3, 0.8, 0.28, 0, 5, stone()); ashlar(ct, 2.5); A.sack(x + 1.2, y + 0.42); A.barrel(x + 1.6, y + 0.45); }
    if (band >= 3) brazier(x + w - 0.5, y + d * 0.5);
    return top;
  });

  // =====================================================================
  //  BARRACKS — a crenellated block hung with round shields, a corner keep, a gatehouse
  // =====================================================================
  reg('barracks', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.1, y + 0.1, w * 0.7, d * 0.5, 18 + band * 6);
    let top = 0;
    if (band >= 2) top = keep(x + 0.12, y + 0.12, 0.72, 0.72, 34 + band * 7, true);
    const H = 15 + band * 3, bx = band >= 2 ? x + 0.6 : x + 0.2, bw = w - (band >= 2 ? 1.0 : 0.6);
    const b = box(bx, y + 0.45, bw, d - 1.05, 0, H, stone()); ashlar(b, 4.5);
    ironDoor(b, 'L', bw * 0.5, 0.4, 10);
    const n = Math.max(3, Math.round(bw / 0.3)), clsS = A.STY.cloth;
    for (let k = 0; k < n; k++) { const u = bw * (k + 0.5) / n; if (Math.abs(u - bw / 2) < 0.3) continue; const p = A.onL(b, u, 0, H * 0.62, 0)[0]; circ(p[0], p[1], 2.6, clsS[k % 4], A.OUT); circ(p[0], p[1], 0.9, X.era >= 2 ? BRONZE : '#8a8a90', null); }
    for (let k = 0; k < 3; k++) A.slit(b, 'R', (b.d) * (k + 0.5) / 3, H * 0.45, 5);
    if (band === 0) top = Math.max(top, X.era === 0 ? sod(b) : slabRoof(b, 8));
    else { A.parapet(b, 3); top = Math.max(top, H + 5); if (X.tech('fortification')) { for (let k = 0; k < 3; k++) box(b.x + b.w * (k + 0.3) / 3, b.y + b.d - 0.04, 0.22, 0.12, H - 2, 5, WOOD); } }
    // crossed axes over the door
    const [ax, ay] = A.onL(b, bw / 2, 0, H - 2.5, 0)[0]; line([ax - 5, ay + 3], [ax + 5, ay - 4], '#3a2a20', 1.2); line([ax + 5, ay + 3], [ax - 5, ay - 4], '#3a2a20', 1.2);
    poly([[ax - 6, ay - 3], [ax - 3, ay - 6], [ax - 4, ay - 2]], '#c8ccd2', null); poly([[ax + 6, ay - 3], [ax + 3, ay - 6], [ax + 4, ay - 2]], '#c8ccd2', null);
    if (band >= 3) { const gh = box(bx + bw * 0.5 - 0.35, b.y + b.d, 0.7, 0.3, 0, H + 6, stone(0.06)); ashlar(gh, 4.5); ironDoor(gh, 'L', 0.35, 0.36, 11, true); A.parapet(gh, 3); top = Math.max(top, H + 11); }
    if (band >= 1 || s >= 3) { brazier(bx - 0.1, y + d - 0.5); }
    if (band >= 2) stoneBanner(x + w - 0.3, y + 0.5, 18);
    return top;
  });

  // =====================================================================
  //  STABLE — low stone byre with arched stalls for war-boars; a goat crag with a ramp
  // =====================================================================
  reg('stable', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.1, y + 0.1, w * 0.7, d * 0.45, 14 + band * 5);
    // the goat crag at the back right
    if (band >= 1) {
      A.rock(x + w - 0.6, y + 0.45, 1.3 + band * 0.25, '#8f877a'); A.rock(x + w - 0.95, y + 0.3, 0.9 + band * 0.2, '#857d72');
      if (band >= 2) { const c = A.c; c.save(); c.translate(0, -(10 + band * 2.5)); goat(x + w - 0.62, y + 0.45, 1, 1.3, '#8a7a62'); c.restore(); }
    }
    const H = 9 + band * 2, n = 2 + Math.min(2, band);
    const b = box(x + 0.2, y + 0.3, Math.min(w - 1.0, 0.55 * n + 0.2), 0.85, 0, H, stone()); ashlar(b, 3.5);
    for (let k = 0; k < n; k++) ironDoor(b, 'L', 0.2 + 0.55 * k + 0.25, 0.32, H - 3, false);
    if (band === 0 && X.era === 0) sod(b); else slabRoof(b, 8);
    if (band >= 3) { const b2 = box(x + 0.2, y + 1.15, 0.65, 0.75, 0, H, stone(0.04)); ashlar(b2, 3.5); ironDoor(b2, 'L', 0.32, 0.32, H - 3, false); slabRoof(b2, 7); }
    // goats grazing the foot of the crag, in front of the byre
    if (band >= 1) { goat(x + w - 0.22, y + 1.08, -1); if (sub(L, band) >= 2 || band >= 2) goat(x + w - 0.78, y + 1.62, 1, 1.05, '#ece4d0'); }
    // boar pen in front
    const fx0 = x + 0.95, fy0 = y + d - 0.15;
    A.fence([[fx0, fy0], [x + w - 0.35, fy0], [x + w - 0.35, y + 1.35]], 5, '#5a4636');
    A.animal(x + 1.4, y + d - 0.55, 'boar', 1);
    if (band >= 1 || s >= 2) A.animal(x + 1.9, y + d - 0.75, 'boar', -1);
    if (band >= 2) A.haystack(x + 0.5, y + d - 0.4, 0.45);
    if (band >= 2 && X.era >= 1) { const [lx, ly] = A.onL(b, 0.12, 0, H - 1, 0)[0]; A.lantern(lx, ly + 4, 1.3); }
    return H + 12;
  });

  // =====================================================================
  //  WAR PIT — a sunken arena ringed by stepped stone tiers, braziers and champion statues
  // =====================================================================
  reg('warpit', ([x, y, w, d], L, band) => {
    const s = sub(L, band), cx = x + w / 2, cy = y + d / 2, r = Math.min(w, d) * 0.4;
    const tiers = 1 + Math.min(3, band + (s >= 3 ? 1 : 0)), c = A.c;
    for (let k = tiers; k >= 1; k--) { // stepped rings, outermost first, each a little higher
      const [ex, ey, rx, ry] = A.ell(cx, cy, k * 2.5, r + k * 0.1);
      c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, A.TAU); c.fillStyle = A.F(stone(k % 2 ? 0.04 : -0.04)); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.8; c.stroke();
      c.beginPath(); c.ellipse(ex, ey + 2.5, rx, ry, 0, 0, Math.PI); c.lineTo(ex - rx, ey); c.ellipse(ex, ey, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fillStyle = A.F(stone(-0.2)); c.fill();
    }
    // the pit itself
    const [ex, ey, rx, ry] = A.ell(cx, cy, 0, r * 0.82), dep = 6 + band * 1.5;
    c.save(); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, A.TAU); c.clip();
    c.fillStyle = A.F('#3a3230'); c.fill();
    c.beginPath(); c.ellipse(ex, ey + dep, rx * 0.86, ry * 0.86, 0, 0, A.TAU); c.fillStyle = A.F(A.SNOW ? '#d8d4cc' : '#b49a74'); c.fill();
    c.restore();
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, A.TAU); c.strokeStyle = A.F(shade(stone(), -0.4)); c.lineWidth = 1.4; c.stroke();
    A.rec('pit', { x: ex, y: ey + dep, rx: rx * 0.6, ry: ry * 0.6 });
    // braziers on pillars, banners, statues
    for (const a of [0.4, 3.6]) { const gx = cx + Math.cos(a) * (r + 0.42), gy = cy + Math.sin(a) * (r + 0.42); box(gx - 0.09, gy - 0.09, 0.18, 0.18, 0, 6 + band * 2, stone(0.06)); brazier(gx, gy, 6 + band * 2, 0.9); }
    if (band >= 2) { stoneBanner(x + 0.25, y + 0.25, 18); stoneBanner(x + w - 0.25, y + 0.25, 18); }
    if (band >= 3) { statue(x + 0.25, y + d - 0.3, 20 + s); statue(x + w - 0.3, y + d * 0.5, 20 + s); }
    return 22 + band * 5;
  });

  // =====================================================================
  //  WORKSHOP — siege works: a stone shed open on piers, a geared gantry, a bolt-thrower in the yard
  // =====================================================================
  function boltThrower(gx, gy, done = 1) {
    const [x, y] = P(gx, gy);
    poly([[x - 9, y - 2], [x + 9, y - 2], [x + 7, y - 6], [x - 7, y - 6]], WOOD);
    for (const dx of [-6, 6]) circ(x + dx, y - 1.5, 2.6, '#4a3a2a', A.OUT);
    if (done < 0.5) return;
    line([x - 2, y - 6], [x + 2, y - 16], WOOD, 1.8);
    const c = A.c; c.beginPath(); c.moveTo(x - 10, y - 12); c.quadraticCurveTo(x + 1, y - 22, x + 12, y - 15); c.strokeStyle = A.F(X.era >= 2 ? BRONZE : '#5a4030'); c.lineWidth = 1.6; c.stroke();
    line([x - 10, y - 12], [x + 1, y - 13], '#cfc8b8', 0.5); line([x + 12, y - 15], [x + 1, y - 13], '#cfc8b8', 0.5);
    line([x - 4, y - 10], [x + 10, y - 17], '#c8ccd2', 1);
  }
  reg('workshop', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    const H = 13 + band * 2, sw = w - 0.6, sd = Math.min(0.9, d - 0.6);
    const back = box(x + 0.15, y + 0.12, sw, 0.22, 0, H + 3, stone()); ashlar(back, 4);
    if (band >= 1) vent(back, 'L', sw * 0.2, 4, 0.18, 4);
    for (const u of [0.05, sw * 0.5, sw - 0.05]) box(x + 0.15 + u - 0.06, y + 0.12 + sd - 0.06, 0.12, 0.12, 0, H, stone(0.06));
    const rb = { x: x + 0.1, y: y + 0.1, w: sw + 0.1, d: sd + 0.05, z: H, h: 0, col: stone() };
    let top = band >= 2 ? slabRoof({ ...rb, h: 0.01 }, 7) : (poly([P(rb.x, rb.y, H + 5), P(rb.x + rb.w, rb.y, H + 5), P(rb.x + rb.w, rb.y + rb.d, H), P(rb.x, rb.y + rb.d, H)], A.SNOW ? '#eef2f4' : roofCol()), H + 5);
    // half-built engine under the roof, finished one in the yard
    boltThrower(x + 0.15 + sw * 0.35, y + 0.12 + sd * 0.6, band >= 1 ? 0.4 : 1);
    if (band >= 1) boltThrower(x + sw * 0.75, y + d - 0.35, 1);
    if (band >= 2) { // gantry with a big cog
      const g = [x + w - 0.25, y + 0.25], Hc = H + 18; line(P(...g), P(...g, Hc), IRON, 2); line(P(...g, Hc), P(g[0] - 0.9, g[1] + 0.2, Hc - 3), IRON, 1.6);
      cog(...P(...g, Hc * 0.45), 5 + band, X.era >= 2 ? BRONZE : '#5a5450', 10); top = Math.max(top, Hc);
    }
    if (band >= 3) A.chimney(x + 0.3, y + 0.15, H + 3, 10, 'smithy', '#6f6a64');
    for (let k = 0; k < Math.min(3, s + band); k++) A.log(x + 0.2, x + 0.75, y + d - 0.2 - k * 0.12, 2.2, 1.6);
    return top;
  });

  // =====================================================================
  //  SMELTER — blast furnaces with glowing mouths, a great tapering stack, bellows house, ore ramp
  // =====================================================================
  function furnace(cx, cy, r, H) {
    A.cyl(cx, cy, r, 0, H, mix(stone(), '#5a4a40', 0.45), '#2e2622');
    const [x, y, rx] = A.ell(cx, cy, 0, r), c = A.c;
    for (let v = 5; v < H; v += 5) { c.beginPath(); c.ellipse(x, y - v, rx, rx / 2, 0, 0.15, Math.PI - 0.15); c.strokeStyle = A.F(shade(stone(), -0.25)); c.lineWidth = 0.6; c.stroke(); }
    for (const v of [H * 0.35, H * 0.8]) { c.beginPath(); c.ellipse(x, y - v, rx, rx / 2, 0, 0.05, Math.PI - 0.05); c.strokeStyle = A.F(X.era >= 2 ? BRONZE : IRON); c.lineWidth = 1.6; c.stroke(); }
    A.lamp([[x - 3, y + rx / 2 - 1], [x + 3, y + rx / 2 - 1], [x + 3, y + rx / 2 - 6], [x, y + rx / 2 - 8], [x - 3, y + rx / 2 - 6]], FIRE_D, '#ffc070');
    A.rec('fires', { x, y: y + rx / 2 - 2, s: 0.5, glowOnly: true }); A.rec('lights', { x, y: y + rx / 2 - 4, r: 22 });
    const [tx, ty] = A.P(cx, cy, H + 2); A.rec('smoke', { x: tx, y: ty, kind: 'smelter', seed: A.R(), dark: true });
    A.lampDot(tx, ty + 2, rx * 0.5, '#a04a1a', '#ff9a3a');
  }
  function stack(gx, gy, H, s = 0.42) { // a tapering square forge chimney with vents
    const t = s * 0.3, col = stone(-0.08);
    poly([P(gx + s, gy, 0), P(gx + s, gy + s, 0), P(gx + s - t, gy + s - t, H), P(gx + s - t, gy + t, H)], shade(col, -0.2));
    poly([P(gx, gy + s, 0), P(gx + s, gy + s, 0), P(gx + s - t, gy + s - t, H), P(gx + t, gy + s - t, H)], col);
    for (let v = 6; v < H - 4; v += 7) line(P(gx + s * v / H * 0.3, gy + s - t * v / H, v), P(gx + s - t * v / H, gy + s - t * v / H, v), shade(col, -0.25), 0.5);
    for (const v of [H * 0.3, H * 0.6]) { const p = P(gx + s / 2, gy + s - t * v / H, v); A.lamp([[p[0] - 1.2, p[1]], [p[0] + 1.2, p[1]], [p[0] + 1.2, p[1] - 3.5], [p[0] - 1.2, p[1] - 3.5]], FIRE_D, FIRE_N); }
    box(gx + t - 0.04, gy + t - 0.04, s - 2 * t + 0.08, s - 2 * t + 0.08, H, 2.5, X.era >= 2 ? BRONZE : '#4e4844');
    const [px, py] = P(gx + s / 2, gy + s / 2, H + 4); A.rec('smoke', { x: px, y: py, kind: 'smelter', seed: A.R(), dark: true });
    return H + 3;
  }
  reg('smelter', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.5, y + 0.08, w * 0.6, d * 0.35, 18 + band * 5);
    let top = 0;
    // stacks along the back right
    const ns = 1 + (band >= 2 ? 1 : 0) + (band >= 3 ? 1 : 0);
    for (let k = 0; k < ns; k++) top = Math.max(top, stack(x + w - 0.75 - k * 0.55, y + 0.15 + k * 0.05, 38 + band * 7 - k * 5 + (X.tech('bellows') ? 4 : 0)));
    // ore ramp from the back with a cart
    if (band >= 1) { rails([x + 0.7, y + 0.2], [x + 0.7, y + 0.95]); oreCart(x + 0.7, y + 0.45, true); }
    // furnaces
    furnace(x + 1.05, y + 1.05, 0.38 + band * 0.03, 18 + band * 4);
    if (band >= 2) furnace(x + 1.65, y + 0.95, 0.32, 16 + band * 3);
    if (band === 0) { const [kx, ky] = P(x + 0.5, y + 1.6), c = A.c; c.beginPath(); c.ellipse(kx, ky - 1, 9, 4.5, 0, Math.PI, A.TAU); c.fillStyle = A.F('#2e2a28'); c.fill(); A.lampDot(kx, ky - 3, 1.3, '#5a2a12', '#ff8a3a'); }
    // bellows house (bellows tech or band 2+)
    if (X.tech('bellows') || band >= 2) {
      const bb = box(x + 0.3, y + 1.35, 0.55, 0.45, 0, 9, stone()); ashlar(bb, 3); slabRoof(bb, 5);
      const [px, py] = A.onR(bb, 0.22, 0, 4.5, 0)[0]; poly([[px + 1, py - 3], [px + 9, py - 1], [px + 9, py + 1], [px + 1, py + 3]], '#7a5232'); line([px + 9, py], [px + 13, py - 1], IRON, 1.2);
    }
    // molten channel to the moulds (band 3 / metallurgy)
    if (band >= 3 || X.tech('metallurgy')) { const a = P(x + 1.05, y + 1.45), b2 = P(x + 1.6, y + 1.85); A.lamp([[a[0] - 1, a[1]], [b2[0] - 1, b2[1]], [b2[0] + 1, b2[1] - 1], [a[0] + 1, a[1] - 1]], '#e8742a', '#ffd070'); for (let k = 0; k < 3; k++) box(x + 1.55 + k * 0.18, y + 1.9, 0.14, 0.14, 0, 1.5, '#4a4644'); }
    if (s >= 2) { const [ox, oy] = P(x + 1.9, y + 1.6), c = A.c; c.beginPath(); c.ellipse(ox, oy - 1, 7, 3.5, 0, Math.PI, A.TAU); c.fillStyle = A.F('#6a5a52'); c.fill(); for (let k = 0; k < 4; k++) circ(ox - 3 + k * 2, oy - 2, 1.3, k % 2 ? '#a0522d' : '#7a6a62', null); }
    return top;
  });

  // =====================================================================
  //  SMITHY — a forge-house with a hooded glowing hearth, anvil, tool racks, a trip-hammer wheel
  // =====================================================================
  reg('smithy', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.1, y + 0.1, w * 0.65, d * 0.5, 16 + band * 5);
    const H = 12 + band * 2, b = box(x + 0.2, y + 0.2, 1.45, 1.15, 0, H, stone()); ashlar(b, 4);
    // the forge hood projecting from the front, with the hearth glowing under it
    const hb = box(x + 0.75, y + 1.35, 0.55, 0.32, 0, 7, stone(-0.06));
    A.lamp(A.onL(hb, 0.1, 0.45, 0.5, 4.5), FIRE_D, '#ffb04a');
    A.rec('fires', { x: A.onL(hb, 0.27, 0, 1, 0)[0][0], y: A.onL(hb, 0.27, 0, 1, 0)[0][1], s: 0.45 }); A.rec('lights', { x: A.onL(hb, 0.27, 0, 3, 0)[0][0], y: A.onL(hb, 0.27, 0, 3, 0)[0][1], r: 26 });
    poly([P(hb.x - 0.05, hb.y - 0.02, 7), P(hb.x + hb.w + 0.05, hb.y - 0.02, 7), P(hb.x + hb.w, hb.y + 0.12, H + 1), P(hb.x, hb.y + 0.12, H + 1)], stone(-0.12));
    ironDoor(b, 'L', 0.3, 0.3, 9);
    deepWin(b, 'R', 0.35, 5); deepWin(b, 'R', 0.8, 5);
    let top = X.era === 0 && band === 0 ? sod(b) : slabRoof(b, 9 + band);
    A.chimney(x + 0.95, y + 1.2, H, 12 + band * 3, 'smithy', '#6f6a64');
    // anvil
    const [ax, ay] = P(x + 1.0, y + 1.95);
    poly([[ax - 3, ay], [ax + 3, ay], [ax + 1.5, ay - 3], [ax + 4.5, ay - 4.5], [ax - 4.5, ay - 4.5], [ax - 1.5, ay - 3]], '#3a3a40');
    A.rec('anvils', { x: ax, y: ay - 5 });
    if (band >= 1 || s >= 2) { // tool rack
      const rx = x + 1.75, ry = y + 0.5; line(P(rx, ry, 9), P(rx, ry + 0.8, 9), WOOD, 1.4);
      for (let k = 0; k < 4; k++) { const a = P(rx, ry + 0.1 + k * 0.2, 0), t = P(rx, ry + 0.1 + k * 0.2, 13); line(a, t, '#6a4a30', 1); poly(k % 2 ? [[t[0] - 2, t[1]], [t[0] + 2, t[1]], [t[0] + 2, t[1] + 2], [t[0] - 2, t[1] + 2]] : [[t[0] - 1, t[1] + 2], [t[0] + 1, t[1] + 2], [t[0], t[1] - 2]], '#8a8a90', null); }
    }
    if (band >= 2) { // trip-hammer with a turning wheel on the right
      const [wx, wy] = A.onR(b, 0.3, 0, 6, 0)[0]; A.rec('wheels', { x: wx + 8, y: wy + 2, r: 7 }); cog(wx + 3, wy - 2, 3, '#5a5450', 7);
      line([wx + 3, wy - 2], [wx + 3, wy - 14], WOOD, 2);
    }
    if (band >= 3) top = Math.max(top, stack(x + 0.25, y + 0.25, 36 + s * 2, 0.34));
    return top;
  });

  // =====================================================================
  //  ARMORY — a vaulted arsenal faced with shields and axes, guarded by stone warriors
  // =====================================================================
  reg('armory', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.1, y + 0.1, w * 0.6, d * 0.65, 18 + band * 5);
    const H = 14 + band * 2.5, b = box(x + 0.25, y + 0.2, 1.3, 1.6, 0, H, stone()); ashlar(b, 4.5);
    ironDoor(b, 'L', 0.65, 0.42, 11, true);
    // shields and crossed axes on the faces
    for (const [side, u] of [['L', 0.22], ['L', 1.08], ['R', 0.4], ['R', 1.1]]) { const p = (side === 'L' ? A.onL : A.onR)(b, u, 0, H * 0.55, 0)[0]; circ(p[0], p[1], 3, A.STY.cloth[Math.round(u * 3) % 4], A.OUT); circ(p[0], p[1], 1, X.era >= 2 ? BRONZE : '#8a8a90', null); line([p[0] - 4, p[1] + 4], [p[0] + 4, p[1] - 5], '#3a2a20', 0.9); }
    for (let k = 0; k < 2; k++) A.slit(b, 'R', 0.75 + k * 0.2, H * 0.3, 5);
    if (band >= 1) runeRow(b, 'R', H - 1.5);
    let top = band >= 2 ? vault(b, 'y') : (band === 0 && X.era === 0 ? sod(b) : slabRoof(b, 9));
    A.chimney(x + 0.4, y + 0.35, H, 8 + band * 2, 'armory', '#6f6a64');
    if (band >= 2) statue(x + 0.25, y + 2.0, 18 + band * 2);
    if (band >= 3) statue(x + 1.25, y + 2.05, 22);
    // weapon rack at the right
    const rx = x + 1.85, ry = y + 0.45;
    if (band >= 1 || s >= 2) { line(P(rx, ry, 3), P(rx, ry + 1.0, 3), WOOD, 1.4); line(P(rx, ry, 9), P(rx, ry + 1.0, 9), WOOD, 1.4); for (let k = 0; k < 4; k++) { const a = P(rx, ry + 0.1 + k * 0.25, 0), t = P(rx, ry + 0.1 + k * 0.25, 15); line(a, t, '#6a4a30', 1); poly([[t[0] - 2.2, t[1] + 1], [t[0] + 2.2, t[1] - 1], [t[0] + 1, t[1] + 3]], '#c8ccd2', null); } }
    return top;
  });

  // =====================================================================
  //  ACADEMY — the Lorehall: stepped stone, rune tablets, a domed star-chamber (cartography)
  // =====================================================================
  reg('academy', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.1, y + 0.1, w * 0.65, d * 0.55, 18 + band * 5);
    const H = 13 + band * 2, b = box(x + 0.2, y + 0.25, w - 0.65, d - 0.75, 0, H, stone()); ashlar(b, 4);
    ironDoor(b, 'L', b.w * 0.5, 0.34, 9.5);
    for (const u of [0.25, b.w - 0.25]) deepWin(b, 'L', u, 4, 0.14, 5.5);
    for (let k = 0; k < 3; k++) deepWin(b, 'R', b.d * (k + 0.5) / 3, 4, 0.12, 5.5);
    runeRow(b, 'L', H - 1.6);
    let top;
    if (band >= 1) {
      A.parapet(b, 2);
      const up = box(b.x + 0.2, b.y + 0.12, b.w - 0.55, b.d - 0.4, H, 9 + band, stone(0.06)); ashlar(up, 4);
      deepWin(up, 'L', up.w * 0.3, 2.5, 0.12, 4.5); deepWin(up, 'L', up.w * 0.7, 2.5, 0.12, 4.5);
      top = H + up.h;
      if (band >= 2 || X.tech('cartography')) { // star-chamber dome with a brass telescope
        const cx = up.x + up.w * 0.5, cy = up.y + up.d * 0.5;
        top = A.dome(cx, cy, Math.min(up.w, up.d) * 0.45, top, 12 + band * 2, X.era >= 2 ? (X.era >= 3 ? VERD : BRONZE) : '#7a7470');
        const t0 = P(cx + 0.1, cy + 0.1, top - 6); line(t0, [t0[0] + 9, t0[1] - 8], X.era >= 2 ? GOLD : BRONZE, 2);
      } else top = slabRoof(up, 7);
    } else top = X.era === 0 ? sod(b) : slabRoof(b, 8);
    // rune tablets out front
    const nt = 1 + Math.min(3, band + (s >= 2 ? 1 : 0));
    for (let k = 0; k < nt; k++) { const gx = x + w - 0.3, gy = y + 0.35 + k * 0.38; const tb = box(gx - 0.04, gy - 0.12, 0.08, 0.24, 0, 10, stone(0.1)); for (let v = 3; v < 9; v += 2) A.lamp(A.onR(tb, 0.04, 0.2, v, v + 0.7), runeDay(), '#8fd8ff'); }
    if (band >= 3) { const t = box(x + 0.15, y + 0.15, 0.4, 0.4, 0, 40 + s * 2, stone(0.04)); ashlar(t, 5); for (let v = 10; v < t.h - 6; v += 10) deepWin(t, 'L', 0.2, v, 0.1, 4); top = Math.max(top, slabRoof(t, 12)); }
    return top;
  });

  // =====================================================================
  //  TAVERN — a barrel-vaulted alehall with a giant barrel for a front, a tankard sign
  // =====================================================================
  reg('tavern', ([x, y, w, d], L, band) => {
    const s = sub(L, band), ax = w >= d ? 'x' : 'y';
    berm(x + 0.08, y + 0.08, w * 0.7, d * 0.6, 14 + band * 4);
    const H = 11 + band * 2;
    const cut = [1.15, 0.85, 0.6, 0.6][band], b = ax === 'y' ? box(x + 0.15, y + 0.2, w - 0.45, d - cut, 0, H, stone()) : box(x + 0.2, y + 0.15, w - cut, d - 0.45, 0, H, stone());
    ashlar(b, 3.8);
    const side = ax === 'y' ? 'L' : 'R', fl = ax === 'y' ? b.w : b.d, along = ax === 'y' ? b.d : b.w;
    // giant barrel front
    const [bx, by] = (side === 'L' ? A.onL : A.onR)(b, fl / 2, 0, H * 0.48, 0)[0], r = fl * 9;
    const c = A.c; c.beginPath(); c.ellipse(bx, by, r * 0.75, r * 0.8, 0, 0, A.TAU); c.fillStyle = A.F('#8a5a32'); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.8; c.stroke();
    for (const k of [0.45, 0.75]) { c.beginPath(); c.ellipse(bx, by, r * 0.75 * k, r * 0.8 * k, 0, 0, A.TAU); c.strokeStyle = A.F(X.era >= 2 ? BRONZE : '#3a2a20'); c.lineWidth = 1; c.stroke(); }
    A.lamp([[bx - 2.5, by + r * 0.8 - 0.5], [bx + 2.5, by + r * 0.8 - 0.5], [bx + 2.5, by + 0.5], [bx, by - 1.5], [bx - 2.5, by + 0.5]], '#3a2216', '#ffc95c');
    A.rec('lights', { x: bx, y: by + 3, r: 22 });
    for (let k = 0; k < 3; k++) deepWin(b, side === 'L' ? 'R' : 'L', along * (k + 0.5) / 3, 4, 0.13, 4.5);
    let top = vault(b, ax);
    A.chimney(ax === 'y' ? b.x + b.w * 0.5 - 0.11 : b.x + 0.2, ax === 'y' ? b.y + 0.2 : b.y + b.d * 0.5 - 0.11, top - 4, 8, 'hall', '#6f6a64');
    // tankard sign on a bracket
    const [sx, sy] = (side === 'L' ? A.onL : A.onR)(b, fl * 0.92, 0, H - 1, 0)[0];
    line([sx, sy], [sx + 7, sy + 1], IRON, 1.2); poly([[sx + 4, sy + 2], [sx + 9, sy + 2], [sx + 8.5, sy + 9], [sx + 4.5, sy + 9]], X.era >= 2 ? BRONZE : '#c9a874'); circ(sx + 6.5, sy + 2.5, 2.2, '#f4ecda', null);
    if (band >= 2) { // a copper brewing still in the side yard
      const cx = x + w - 0.25, cy = y + d - 0.45;
      A.cyl(cx, cy, 0.17, 0, 9, X.era >= 2 ? BRONZE : '#9a6a3a'); A.dome(cx, cy, 0.17, 9, 5, X.era >= 2 ? BRONZE : '#9a6a3a', false);
      line(P(cx, cy, 14), P(cx - 0.25, cy - 0.15, 10), BRONZE, 1);
    }
    for (let k = 0; k < Math.min(3, s + band); k++) A.barrel(x + 0.25 + (k % 2) * 0.18, y + d - 0.3 - Math.floor(k / 2) * 0.2);
    if (band >= 3) { const [lx, ly] = P(x + 0.1, y + d - 0.15); line([lx, ly], [lx, ly - 13], IRON, 1); A.lantern(lx + 2, ly - 11, 1.3); line([lx, ly - 13], [lx + 2, ly - 13], IRON, 0.8); }
    return top;
  });

  // =====================================================================
  //  THEATRE — the Saga-hall: stepped stone tiers around a stage under a carved face
  // =====================================================================
  reg('theatre', ([x, y, w, d], L, band) => {
    const s = sub(L, band), ax = w >= d ? 'x' : 'y';
    const tiers = 2 + Math.min(3, band + (s >= 3 ? 1 : 0)), th = 3.2;
    // a half-bowl of stepped stone seats opening toward the front
    const cx = ax === 'x' ? x + w / 2 : x + w - 0.2, cy = ax === 'x' ? y + d - 0.2 : y + d / 2;
    const rx = ax === 'x' ? w / 2 - 0.1 : w - 0.3, ry = ax === 'x' ? d - 0.3 : d / 2 - 0.1;
    const a0 = ax === 'x' ? Math.PI : Math.PI / 2, n = 14;
    const arc = (f, z, rev) => { const o = []; for (let k = 0; k <= n; k++) { const t = a0 + (rev ? n - k : k) / n * Math.PI; o.push(P(cx + Math.cos(t) * rx * f, cy + Math.sin(t) * ry * f, z)); } return o; };
    const fr = r => 1 - r * 0.62 / tiers;
    poly(arc(1, tiers * th).concat(arc(1, 0, true)), stone(-0.22));               // outer wall
    for (let k = 0; k < tiers; k++) {
      const z = (tiers - k) * th, f0 = fr(k), f1 = fr(k + 1);
      poly(arc(f0, z).concat(arc(f1, z, true)), A.SNOW ? '#eef2f4' : stone(k % 2 ? 0.1 : 0.03));
      poly(arc(f1, z).concat(arc(f1, z - th, true)), stone(-0.14));
    }
    // the stage floor in the bowl
    poly(arc(fr(tiers), 0.5).concat(arc(fr(tiers), 0.5, true).slice(0, 1)), stone(-0.05));
    let top = tiers * th + 4;
    // a carved ancestor face watching from the top of the bowl
    if (band >= 2) { const bx = ax === 'x' ? cx : cx - rx * 0.95, by = ax === 'x' ? cy - ry * 0.95 : cy; const sl = box(bx - 0.18, by - 0.08, 0.36, 0.16, tiers * th, 16 + band * 2, stone(0.04)); void sl; const [fx, fy] = P(bx, by + 0.08, tiers * th + 4); stoneFace(fx, fy, 0.55 + band * 0.07); top = tiers * th + 18 + band * 2; }
    // pillars with braziers at the open ends, a skald on stage
    if (band >= 1 || s >= 2) for (const sg of [-1, 1]) { const gx = ax === 'x' ? cx + sg * rx * 0.92 : cx - 0.15, gy = ax === 'x' ? cy - 0.15 : cy + sg * ry * 0.92; box(gx - 0.08, gy - 0.08, 0.16, 0.16, 0, 9 + band * 2, stone(0.06)); brazier(gx, gy, 9 + band * 2, 0.75); }
    if (band >= 1) { const [px, py] = P(cx - (ax === 'y' ? 0.35 : 0), cy - (ax === 'x' ? 0.35 : 0), 0.5); A.person(px, py, A.STY.cloth[(L + 1) % 4], 0.9); }
    if (band >= 3) stoneBanner(ax === 'x' ? x + 0.2 : x + w - 0.2, ax === 'x' ? y + d - 0.15 : y + 0.2, 16);
    return top;
  });

  // =====================================================================
  //  TEMPLE — the Ancestor ziggurat: stepped stone, a great ancestral face, a rune-fire on top
  // =====================================================================
  reg('temple', ([x, y, w, d], L, band) => {
    const s = sub(L, band), steps = 2 + Math.min(2, band), cx = x + w / 2 - 0.05, cy = y + d / 2 - 0.05;
    let z = 0, sz = Math.min(w, d) - 0.3;
    for (let k = 0; k < steps; k++) {
      const hh = 8 + band;
      const b = box(cx - sz / 2, cy - sz / 2, sz, sz, z, hh, stone(k * 0.04)); ashlar(b, 4);
      if (k === 0) ironDoor(b, 'L', sz / 2, 0.32, Math.min(10, hh + 1), true);
      if (k === steps - 1 && band >= 1) runeRow(b, 'L', hh - 1.5), runeRow(b, 'R', hh - 1.5);
      z += hh; sz -= 0.3;
    }
    let top = z;
    if (band >= 2) { const [fx, fy] = P(cx, cy + sz / 2 + 0.15, z - 2); stoneFace(fx, fy, 0.75 + band * 0.08); }
    // the rune-fire: a blue flame bowl on the summit
    const [tx, ty] = P(cx, cy, z);
    box(cx - 0.12, cy - 0.12, 0.24, 0.24, z, 3, X.era >= 2 ? BRONZE : stone(-0.1));
    A.lampDot(tx, ty - 5, 2.2, '#4f86b0', '#9cf0ff'); A.rec('sparks', { x: tx, y: ty - 6, kind: 'rune' }); A.rec('lights', { x: tx, y: ty - 6, r: 30 });
    top = z + 10;
    if (band >= 3 && X.era >= 2) { top = Math.max(top, statue(x + w - 0.3, y + d - 0.3, 22 + s)); }
    for (const [gx, gy] of [[x + 0.15, y + d - 0.2], [x + w - 0.2, y + 0.15]]) if (band >= 1 || s >= 2) brazier(gx, gy);
    return top;
  });

  // =====================================================================
  //  MAGE TOWER — rune-tower of stacked stone drums ringed with glowing bands, a hovering rune stone
  // =====================================================================
  reg('magetower', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, H = 40 + band * 10 + Math.min(16, L), tiers = 3 + (band >= 2 ? 1 : 0);
    let z = 0;
    box(cx - 0.6, cy - 0.6, 1.2, 1.2, 0, 3, stone(-0.15));
    for (let i = 0; i < tiers; i++) {
      const sz = 0.5 - i * 0.075, hh = H / tiers;
      const b = box(cx - sz, cy - sz, 2 * sz, 2 * sz, z, hh, stone(i % 2 ? 0.0 : -0.1)); ashlar(b, 4.5);
      // corner buttress on the front edge, glowing rune bands and a rune column
      box(cx + sz - 0.06, cy + sz - 0.06, 0.12, 0.12, z, hh * 0.8, stone(-0.18));
      for (const sd of ['L', 'R']) { const f = sd === 'L' ? A.onL : A.onR; A.lamp(f(b, 0.06, 2 * sz - 0.06, hh - 4, hh - 2.8), runeDay(), '#9cf0ff'); }
      for (let v = 4; v < hh - 7; v += 3) { const p = A.onL(b, sz * 0.7, 0, v, 0)[0]; rune(p[0], p[1], 0.7); }
      A.slit(b, 'R', sz, hh * 0.35, 5);
      z += hh;
    }
    const top0 = { x: cx - 0.3, y: cy - 0.3, w: 0.6, d: 0.6, z: z - 3, h: 3, col: stone(0.04) }; A.parapet(top0, 3);
    // the hovering rune monolith (with orbiting stones at band 3)
    const mz = z + 8 + band * 2;
    const rb = box(cx - 0.09, cy - 0.09, 0.18, 0.18, mz, 12 + band * 2, '#5a6470'); A.lamp(A.onL(rb, 0.06, 0.12, 2, rb.h - 2), runeDay(), '#bff4ff'); A.lamp(A.onR(rb, 0.06, 0.12, 2, rb.h - 2), shade(runeDay(), -0.2), '#bff4ff');
    if (band >= 3) for (let k = 0; k < 4; k++) { const a = k / 4 * A.TAU + 0.8; box(cx + Math.cos(a) * 0.45 - 0.05, cy + Math.sin(a) * 0.45 - 0.05, 0.1, 0.1, mz + 2 + (k % 2) * 6, 5, '#6a7480'); }
    const orb = P(cx, cy, mz + rb.h * 0.5); A.lampDot(orb[0], orb[1] - 2, 1.6 + band * 0.3, '#d8e8ff', '#ffffff');
    A.rec('magic', { x: orb[0], y: orb[1], r: 9 + band * 3 + Math.min(6, L / 3), n: 4 + band * 2, col: 'rgba(110,210,255,A)', seed: A.R(), bolt: band >= 3 });
    if (X.era >= 3) { const [gx, gy] = P(cx, cy, mz + rb.h); circ(gx, gy, 1.6, GOLD, A.OUT); }
    return mz + rb.h + 4;
  });

  // =====================================================================
  //  HIDEOUT — a hidden cellar door among boulders, a spyhole lamp, a rope down a shaft
  // =====================================================================
  reg('hideout', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = Math.min(w, d), cx = x + w * 0.45, cy = y + d * 0.45;
    berm(cx - m * 0.35, cy - m * 0.35, m * 0.6, m * 0.5, 12 + band * 4, '#7d766c');
    const b = box(cx - m * 0.22, cy - m * 0.05, m * 0.44, m * 0.3, 0, 6 + band, '#7d766c');
    const q = A.onL(b, m * 0.12, m * 0.32, 0, 5 + band * 0.5); poly(q, '#2a2420', null);
    line(q[0], q[3], IRON, 0.8); line(q[1], q[2], IRON, 0.8);
    A.rock(cx + m * 0.3, cy + m * 0.25, 0.7 + band * 0.12, '#8a8276'); A.rock(cx - m * 0.35, cy + m * 0.3, 0.6, '#7d766c');
    const [lx, ly] = A.onL(b, m * 0.38, 0, 4 + band, 0)[0]; A.lampDot(lx, ly, 0.9, '#3a2a1a', '#ffc95c');
    if (band >= 1 || s >= 2) { const [px, py] = P(cx - m * 0.4, cy + m * 0.45); line([px, py], [px, py - 10], WOOD, 1); A.lantern(px + 2, py - 8, 1.1); }
    if (band >= 2) { A.barrel(cx + m * 0.05, cy + m * 0.42); A.crate(cx + m * 0.15, cy + m * 0.45, 0.2); }
    if (band >= 3) { const sh = P(cx + m * 0.35, cy - m * 0.25); line([sh[0] - 4, sh[1]], [sh[0], sh[1] - 16], WOOD, 1.4); line([sh[0] + 4, sh[1]], [sh[0], sh[1] - 16], WOOD, 1.4); line([sh[0], sh[1] - 16], [sh[0], sh[1] - 2], '#c9b88a', 0.6); }
    return 14 + band * 4;
  });

  // =====================================================================
  //  SHRINE — a ring of rune-cut standing stones round an altar with a blue flame
  // =====================================================================
  reg('shrine', ([x, y, w, d], L, band) => {
    const s = sub(L, band), m = Math.min(w, d), cx = x + w / 2, cy = y + d / 2, r = m * 0.34;
    const n = 3 + Math.min(5, band * 2 + (s >= 2 ? 1 : 0)), hgt = 9 + band * 2.5 + m * 1.5;
    const stones = []; for (let k = 0; k < n; k++) { const a = k / n * A.TAU + 0.3; stones.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    stones.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
    const front = (p) => p[0] + p[1] > cx + cy;
    const sw = Math.min(0.3, 0.14 + m * 0.05), drawStone = ([gx, gy]) => { const b = box(gx - sw / 2, gy - sw * 0.35, sw, sw * 0.7, 0, hgt, stone(0.04)); A.lamp(A.onL(b, sw * 0.38, sw * 0.62, 3, hgt - 3), runeDay(), '#8fd8ff'); };
    stones.filter(p => !front(p)).forEach(drawStone);
    const al = box(cx - 0.16, cy - 0.12, 0.32, 0.24, 0, 4, stone(-0.06)); void al;
    const [tx, ty] = P(cx, cy, 4); A.lampDot(tx, ty - 2.5, 1.8, '#4f86b0', '#9cf0ff'); A.rec('sparks', { x: tx, y: ty - 3, kind: 'rune' }); A.rec('lights', { x: tx, y: ty - 3, r: 22 });
    if (band >= 2) { const [px, py] = P(cx, cy - 0.3); void px; void py; }
    stones.filter(front).forEach(drawStone);
    if (band >= 3) stoneBanner(x + w - 0.2, y + 0.2, 16);
    return hgt + 4;
  });

  // =====================================================================
  //  RUNEFORGE — forge-hall with blue smoke, a great anvil glowing blue, rune pillars, a rune ring
  // =====================================================================
  reg('runeforge', ([x, y, w, d], L, band) => {
    const s = sub(L, band);
    berm(x + 0.08, y + 0.08, w * 0.7, d * 0.55, 18 + band * 5);
    const H = 14 + band * 2, b = box(x + 0.15, y + 0.15, 1.2, 0.95, 0, H, stone(0.02)); ashlar(b, 4.5);
    ironDoor(b, 'L', 0.4, 0.36, 10, true);
    runeRow(b, 'L', H - 1.5); runeRow(b, 'R', H - 1.5);
    vent(b, 'R', 0.3, 4, 0.16, 4); vent(b, 'R', 0.7, 4, 0.16, 4);
    let top = band >= 2 ? vault(b, 'x') : slabRoof(b, 8);
    { const sx = b.x + 0.85, sy = b.y + 0.12, sh = 30 + band * 6; const st = box(sx, sy, 0.24, 0.24, 0, sh, stone(-0.08)); ashlar(st, 5); box(sx - 0.03, sy - 0.03, 0.3, 0.3, sh, 2, X.era >= 2 ? BRONZE : '#4e4844'); const [px, py] = P(sx + 0.12, sy + 0.12, sh + 3); A.rec('smoke', { x: px, y: py, kind: 'runeforge', seed: A.R() }); top = Math.max(top, sh + 2); }
    // rune pillars framing the anvil (band 2+)
    const ax = x + 1.2, ay = y + 1.3;
    if (band >= 2) for (const [gx, gy] of [[ax - 0.45, ay - 0.15], [ax + 0.25, ay - 0.5]]) { const p = box(gx - 0.08, gy - 0.08, 0.16, 0.16, 0, 20 + band * 3, stone(0.08)); A.lamp(A.onL(p, 0.06, 0.1, 4, p.h - 4), runeDay(), '#9cf0ff'); }
    // the great anvil on a plinth
    box(ax - 0.2, ay - 0.15, 0.4, 0.3, 0, 4, stone(-0.1));
    const [px, py] = P(ax, ay, 4), k = 1.2 + band * 0.12;
    poly([[px - 3 * k, py], [px + 3 * k, py], [px + 1.5 * k, py - 3 * k], [px + 5 * k, py - 4.6 * k], [px - 4.5 * k, py - 4.6 * k], [px - 1.5 * k, py - 3 * k]], '#2e3a44');
    A.lamp([[px - 4.5 * k, py - 4.6 * k], [px + 5 * k, py - 4.6 * k], [px + 4.5 * k, py - 5.4 * k], [px - 4 * k, py - 5.4 * k]], '#6fc8ec', '#bff4ff');
    A.lampDot(px + 0.5 * k, py - 7.5 * k, 1.8 * k, '#7fd4f4', '#d8faff'); A.lampDot(px + 0.5 * k, py - 10 * k, 1.0 * k, '#a8e4fa', '#ffffff');
    A.rec('sparks', { x: px, y: py - 5 * k, kind: 'rune' }); A.rec('lights', { x: px, y: py - 6 * k, r: 28 });
    if (band >= 3) { // a hovering ring of runes over the anvil
      const [ex, ey] = P(ax, ay, 26); for (let j = 0; j < 10; j++) { const a = j / 10 * A.TAU; A.lampDot(ex + Math.cos(a) * 9, ey + Math.sin(a) * 3.5, 1, runeDay(), '#bff4ff'); }
      A.rec('sparks', { x: ex, y: ey, kind: 'rune' });
    }
    // standing rune stones
    const nstones = Math.min(3, band + (s >= 2 ? 1 : 0));
    for (const [gx, gy] of [[x + 1.7, y + 0.4], [x + 1.7, y + 0.95], [x + 0.35, y + 1.65]].slice(0, nstones)) { const r = box(gx - 0.08, gy - 0.07, 0.16, 0.14, 0, 11, '#7a756e'); A.lamp(A.onL(r, 0.06, 0.1, 3, 8), runeDay(), '#9cf0ff'); }
    return top;
  });

  // =====================================================================
  //  WALL — battered stone of huge blocks, square merlons, rune course (band 2+), bronze caps (era 2+)
  // =====================================================================
  reg('wall', ([fx, fy, fw, fd], L, band, ctx) => {
    const along = ctx.along, a = ctx.a, b = ctx.b;
    if (band <= 0) { // dry-stone wall with rough capstones
      const bw = box(fx, fy, fw, fd, 0, 9, '#8a847a'); ashlar(bw, 3, '#6e685f');
      const n = Math.max(1, Math.round((b - a) / 0.25));
      for (let k = 0; k < n; k++) { const u = a + (k + 0.5) * (b - a) / n, [hx, hy] = along ? P(u, fy + fd / 2, 9) : P(fx + fd / 2, u, 9); A.circ(hx, hy - 1, 2.4, k % 2 ? '#7d766c' : '#948c80', A.OUT); }
      return 9;
    }
    const H = 20 + band * 4 + (X.tech('fortification') ? 2 : 0), col = stone(-0.06);
    box(fx - (along ? 0 : 0.05), fy - (along ? 0.05 : 0), fw + (along ? 0 : 0.1), fd + (along ? 0.1 : 0), 0, 4, shade(col, -0.12));   // footing
    const bw = box(fx, fy, fw, fd, 4, H - 4, col); ashlar(bw, 5);
    if (band >= 2) { const f = along ? 'L' : 'R'; runeRow(bw, f, H - 9, 0.15, (along ? fw : fd) - 0.15, 0.45); }
    const n = Math.max(1, Math.round((b - a) / 0.34)), t = along ? fd : fw;
    for (let k = 0; k < n; k += 2) {
      const u0 = a + k * (b - a) / n + 0.02, u1 = a + (k + 1) * (b - a) / n - 0.02;
      const m = along ? box(u0, fy + t * 0.35, u1 - u0, t * 0.65, H, 5, col) : box(fx + t * 0.35, u0, t * 0.65, u1 - u0, H, 5, col);
      if (X.era >= 2) box(m.x + 0.02, m.y + 0.02, m.w - 0.04, m.d - 0.04, H + 5, 0.8, X.era >= 3 ? VERD : shade(BRONZE, -0.2));
    }
    if (band >= 3 && Math.round(a) % 3 === 0) { const [sx, sy] = along ? P((a + b) / 2, fy + fd, H * 0.55) : P(fx + fw, (a + b) / 2, H * 0.55); circ(sx, sy, 3.6, trim(), A.OUT); circ(sx, sy, 1.4, A.STY.flag, null); }
    return H + 5;
  });

  // =====================================================================
  //  WALL TOWERS, GATEHOUSE, POSTERN — square battered towers of the same great ashlar as the curtain,
  //  rune courses from band 2, parapets with braziers → bronze / verdigris hip caps (era 2+); the gate grows
  //  from a rune-cut trilithon to carved-face pylons to a fortress gatehouse with a great stone face.
  // =====================================================================
  const wallHt = band => 20 + band * 4 + (X.tech('fortification') ? 2 : 0);
  function sqTower(gx, gy, r, H, band, o = {}) {
    box(gx - r - 0.07, gy - r - 0.07, 2 * r + 0.14, 2 * r + 0.14, 0, 6, stone(-0.16));
    const b = box(gx - r, gy - r, 2 * r, 2 * r, 6, H - 6, stone(-0.03)); ashlar(b, 5);
    for (let v = 9; v < H - 12; v += 11) { A.slit(b, 'L', r, v, 6); A.slit(b, 'R', r, v, 6); }
    if (band >= 2) { runeRow(b, 'L', H - 14, 0.1, 2 * r - 0.1, 0.16); runeRow(b, 'R', H - 14, 0.1, 2 * r - 0.1, 0.16); }
    if (o.face) { const [fx, fy] = A.onL(b, r, r, H * 0.42 - 6, 0)[0]; stoneFace(fx, fy, o.face); }
    // corbelled machicolation, then a parapet with a brazier — or a bronze / verdigris hip cap from the Empire era
    const cb = box(gx - r - 0.08, gy - r - 0.08, 2 * r + 0.16, 2 * r + 0.16, H, 3, shade(stone(), -0.14));
    for (const side of ['L', 'R']) for (let u = 0.1; u < 2 * r + 0.1; u += 0.18) poly((side === 'L' ? A.onL : A.onR)(cb, u, u + 0.07, -2, 0), shade(stone(), -0.32), null);
    let zt = H + 3;
    if (o.roof && X.era >= 2) { const hb = box(gx - r - 0.04, gy - r - 0.04, 2 * r + 0.08, 2 * r + 0.08, zt, 4, stone(-0.06)); zt = slabRoof(hb, 10 + r * 14); }
    else {
      A.parapet({ x: gx - r - 0.08, y: gy - r - 0.08, w: 2 * r + 0.16, d: 2 * r + 0.16, z: H, h: 3, col: stone(-0.03) }, 3);
      zt += 5;
      if (o.brazier) brazier(gx, gy, H + 3, 0.9);
    }
    if (o.flag) { A.flagpole(gx, gy, zt - 1, 12, A.STY.flag); zt += 12; }
    return zt;
  }
  reg('walltower', ([x, y, w, d], L, band, ctx) => {
    const corner = ctx.corner, r = corner ? 0.47 : 0.38;
    const H = wallHt(band) + (corner ? 14 : 8) + (band >= 3 ? 6 : 0);
    return sqTower(ctx.gx, ctx.gy, r, H, band, { roof: corner || band >= 2, brazier: corner || band >= 2, flag: corner && band >= 3, face: corner && band >= 3 ? 0.7 : 0 });
  });
  const wpt = (ctx, u, off = 0) => ctx.along ? [u, ctx.fixed + off] : [ctx.fixed + off, u];
  const wbx = (ctx, u0, u1, o0, o1, z, h, col, opt) => ctx.along ? box(u0, ctx.fixed + o0, u1 - u0, o1 - o0, z, h, col, opt) : box(ctx.fixed + o0, u0, o1 - o0, u1 - u0, z, h, col, opt);
  const wside = ctx => ctx.along ? 'L' : 'R';
  function openDoor(ctx, u, dir, h) { // an iron-bound leaf swung open against the jamb
    const a = wpt(ctx, u, 0.04), b = wpt(ctx, u + dir * 0.05, 0.4);
    poly([P(...a, 0), P(...b, 0), P(...b, h), P(...a, h)], X.era >= 2 ? mix(DOOR, BRONZE, 0.25) : DOOR);
    for (const v of [h * 0.2, h * 0.55, h * 0.85]) line(P(...a, v), P(...b, v), X.era >= 2 ? BRONZE : '#1c1a18', 1);
  }
  function irongrate(ctx, u0, u1, z, drop, off) {
    const n = Math.max(3, Math.round((u1 - u0) / 0.11));
    for (let k = 0; k <= n; k++) { const u = u0 + (u1 - u0) * k / n; line(P(...wpt(ctx, u, off), z), P(...wpt(ctx, u, off), z - drop), IRON, 1); }
    line(P(...wpt(ctx, u0, off), z - drop * 0.45), P(...wpt(ctx, u1, off), z - drop * 0.45), IRON, 0.9);
  }
  reg('gate', ([x, y, w, d], L, band, ctx) => {
    const g0 = ctx.g0, g1 = ctx.g1, m = (g0 + g1) / 2, H = wallHt(band), sd = wside(ctx);
    if (band <= 0) { // a rune-cut trilithon of rough standing stones
      for (const [u0, u1] of [[g0 - 0.24, g0], [g1, g1 + 0.24]]) { const sb = wbx(ctx, u0, u1, -0.16, 0.16, 0, 17, '#8a847a'); ashlar(sb, 4, '#6e685f'); }
      const lb = wbx(ctx, g0 - 0.3, g1 + 0.3, -0.18, 0.18, 17, 4.5, '#948c80'); ashlar(lb, 2.2, '#6e685f');
      if (X.era >= 1) runeRow(lb, sd, 1.5, 0.3, (g1 - g0) + 0.3, 0.2);
      brazier(...wpt(ctx, g0 - 0.12, 0.34), 0, 0.7); brazier(...wpt(ctx, g1 + 0.12, 0.34), 0, 0.7);
      return 22;
    }
    if (band === 1) { // carved-face pylons, a runed lintel, iron-bound doors folded back
      const ph = H + 8;
      const pylon = (u0, u1) => { const pb = wbx(ctx, u0, u1, -0.3, 0.3, 0, ph, stone(0.02)); ashlar(pb, 4.5); const [fx, fy] = (sd === 'L' ? A.onL : A.onR)(pb, (u1 - u0) / 2, 0, ph * 0.5, 0)[0]; stoneFace(fx, fy, 0.55);
        const cb = wbx(ctx, u0 - 0.04, u1 + 0.04, -0.34, 0.34, ph, 2.5, shade(stone(), -0.14)); brazier(...wpt(ctx, (u0 + u1) / 2, 0), ph + 2.5, 0.8); void cb; };
      pylon(g0 - 0.36, g0);
      const lb = wbx(ctx, g0, g1, -0.24, 0.24, H - 3, 7, stone(-0.04)); ashlar(lb, 3.5); runeRow(lb, sd, 3, 0.12, (g1 - g0) - 0.12, 0.14);
      openDoor(ctx, g0, 1, H - 5); openDoor(ctx, g1, -1, H - 5);
      pylon(g1, g1 + 0.36);
      return ph + 14;
    }
    // the gatehouse: twin square towers, an arch block bearing a great carved face, an iron portcullis
    const TH = H + 16 + (band >= 3 ? 6 : 0), r = 0.27;
    let top = sqTower(...wpt(ctx, g0 - r, 0.02), r, TH, band, { roof: true, brazier: true });
    const ab = wbx(ctx, g0, g1, -0.3, 0.3, H - 8, 16, stone(0.02)); ashlar(ab, 4);
    runeRow(ab, sd, 13, 0.1, (g1 - g0) - 0.1, 0.14);
    const [fx, fy] = (sd === 'L' ? A.onL : A.onR)(ab, (g1 - g0) / 2, 0, 1, 0)[0]; stoneFace(fx, fy + 2, 0.75 + band * 0.08);
    irongrate(ctx, g0 + 0.05, g1 - 0.05, H - 8, 6, 0.31);
    const pp = wbx(ctx, g0, g1, -0.3, 0.3, H + 8, 0.01, stone()); A.parapet({ ...pp, h: 0.01 }, 3);
    openDoor(ctx, g0, 1, H - 10); openDoor(ctx, g1, -1, H - 10);
    top = Math.max(top, sqTower(...wpt(ctx, g1 + r, 0.02), r, TH, band, { roof: true, brazier: true, flag: band >= 3 }));
    if (band >= 3) { const [sx, sy] = P(...wpt(ctx, m, 0.31), H + 6); circ(sx, sy, 3.4, trim(), A.OUT); circ(sx, sy, 1.3, A.STY.flag, null); }
    return top;
  });
  reg('postern', ([x, y, w, d], L, band, ctx) => {
    const g0 = ctx.g0, g1 = ctx.g1, H = wallHt(band), sd = wside(ctx);
    if (band <= 0) {
      for (const [u0, u1] of [[g0 - 0.16, g0], [g1, g1 + 0.16]]) { const sb = wbx(ctx, u0, u1, -0.12, 0.12, 0, 12, '#8a847a'); ashlar(sb, 3, '#6e685f'); }
      const lb = wbx(ctx, g0 - 0.2, g1 + 0.2, -0.13, 0.13, 12, 3.5, '#948c80'); if (X.era >= 1) runeRow(lb, sd, 1.2, 0.15, (g1 - g0) + 0.25, 0.18);
      return 16;
    }
    for (const [u0, u1] of [[g0 - 0.24, g0], [g1, g1 + 0.24]]) { const jb = wbx(ctx, u0, u1, -0.24, 0.24, 0, H + 5, stone(0.02)); ashlar(jb, 4.5); }
    const lb = wbx(ctx, g0, g1, -0.22, 0.22, H - 7, 7, stone(-0.04)); ashlar(lb, 3.5); runeRow(lb, sd, 3, 0.08, (g1 - g0) - 0.08, 0.12);
    openDoor(ctx, g0, 1, H - 8);
    const cap = wbx(ctx, g0 - 0.28, g1 + 0.28, -0.26, 0.26, H + 5, 2.5, shade(stone(), -0.12)); void cap;
    if (band >= 2) brazier(...wpt(ctx, (g0 + g1) / 2, 0), H + 7.5, 0.7);
    return H + 16;
  });

  // =====================================================================
  //  SHORE — the hold's harbour: moles of coursed blocks, rune lamps, chain cranes on stone pillars,
  //  iron-banded ore barges, a vaulted stone boathouse; verdigris and gold in the Legend era.
  //  Everything in shore coordinates (dd from the edge, u along it), so it fits any edge.
  // =====================================================================
  const kit = ctx => {
    const pt = ctx.pt, at = ctx.at;
    const key = (dd, u) => { const p = pt(dd, u); return p[0] + p[1]; };
    const lbox = (d0, d1, u0, u1, z, h, col, o) => { const a = pt(d0, u0), b = pt(d1, u1); return box(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), z, h, col, o); };
    return { pt, at, key, lbox, axU: ctx.along ? 'x' : 'y', axD: ctx.along ? 'y' : 'x' };
  };
  function runeLamp(K, dd, u, h = 13) {
    const p0 = K.at(dd, u, 2), p1 = K.at(dd, u, h);
    line(p0, p1, IRON, 1.6); line([p1[0] - 2.5, p1[1]], [p1[0] + 2.5, p1[1]], IRON, 1);
    A.lampDot(p1[0], p1[1] - 2, 1.7, X.era >= 3 ? GOLD : '#8fd0f0', '#bff0ff'); A.rec('lights', { x: p1[0], y: p1[1] - 2, r: 14, col: 'storm' });
  }
  function bollard(K, dd, u) { const [x, y] = K.at(dd, u, 3); line([x, y], [x, y - 3], IRON, 2.2); circ(x, y - 3.3, 1.3, IRON, null); }
  // an iron-banded barge with a cargo of ore or cut blocks, a little stern cabin
  function barge(K, ctx, u, d0, d1, cargo, big) {
    const hw = big ? 0.24 : 0.19, hull = '#5e4a3a';
    const b = K.lbox(d0, d1, u - hw, u + hw, -1, 5, hull, { top: '#7a6450' });
    for (let k = 1; k < 5; k++) { const dd = d0 + (d1 - d0) * k / 5; line(K.at(dd, u - hw, -1), K.at(dd, u - hw, 4), IRON, 1.1); line(K.at(dd, u + hw, -1), K.at(dd, u + hw, 4), IRON, 1.1); line(K.at(dd, u - hw, 4), K.at(dd, u + hw, 4), IRON, 0.6); }
    line(K.at(d0, u - hw, 3.5), K.at(d1, u - hw, 3.5), X.era >= 2 ? BRONZE : IRON, 0.8); line(K.at(d0, u + hw, 3.5), K.at(d1, u + hw, 3.5), X.era >= 2 ? BRONZE : IRON, 0.8);
    void b;
    // stern cabin at the shore end, cargo amidships
    const cab = K.lbox(d1 - 0.36, d1 - 0.06, u - hw * 0.7, u + hw * 0.7, 4, 6, stone(-0.05)); A.hip({ ...cab }, 4, roofCol(), 0.04);
    const mid = (d0 + d1 - 0.3) / 2, [cx, cy] = K.at(mid, u, 5);
    if (cargo === 'ore') for (let k = 0; k < 7; k++) circ(cx - 6 + (k % 4) * 3.6 + (k > 3 ? 1.8 : 0), cy - (k > 3 ? 3 : 1), 2, k % 3 === 0 ? '#a0522d' : k % 3 === 1 ? '#5a524c' : '#6e665e', null);
    else { K.lbox(mid - 0.2, mid + 0.05, u - 0.12, u + 0.12, 4, 5, '#b9b09e'); K.lbox(mid + 0.08, mid + 0.3, u - 0.11, u + 0.11, 4, 5, '#a8a092'); }
    const [lx, ly] = K.at(d1 - 0.2, u, 13); A.lampDot(lx, ly, 1.2, '#e8b85a', '#ffd46e');
  }
  // a chain crane on a stone pillar: iron (bronze) jib over the water, a chain with a block on the hook, a cog-wheel winch
  function chainCrane(K, dd, u, H, band) {
    const pb = K.lbox(dd - 0.22, dd + 0.22, u - 0.22, u + 0.22, 0, H * 0.45, stone(-0.02)); ashlar(pb, 4);
    if (band >= 2) runeRow(pb, 'L', H * 0.45 - 5, 0.08, pb.w - 0.08, 0.14);
    const met = X.era >= 3 ? VERD : X.era >= 2 ? BRONZE : '#4a4644';
    const base = K.at(dd, u, H * 0.45), top = K.at(dd, u, H), tip = K.at(dd - 1.35, u, H + 2);
    line(base, top, met, 2.6); line(top, tip, met, 2); line(K.at(dd, u, H * 0.62), tip, met, 1.1);
    for (let k = 1; k < 5; k++) { const t = k / 5, a = [top[0] + (tip[0] - top[0]) * t, top[1] + (tip[1] - top[1]) * t], b2 = K.at(dd - 1.35 * t, u, H * 0.62 + (H + 2 - H * 0.62) * t); line(a, b2, met, 0.6); }
    // the chain: a dotted line of links down to the load
    const hk = K.at(dd - 1.35, u, 13);
    for (let k = 0; k <= 10; k++) { const t = k / 10; circ(tip[0] + (hk[0] - tip[0]) * t, tip[1] + (hk[1] - tip[1]) * t, 0.7, null, IRON); }
    K.lbox(dd - 1.47, dd - 1.23, u - 0.12, u + 0.12, 7, 5, '#b9b09e');
    const [cx, cy] = K.at(dd + 0.22, u + 0.22, H * 0.45 - 4); cog(cx, cy, 4.2 + band * 0.5, X.era >= 2 ? BRONZE : IRON, 9);
  }
  // a vaulted stone boathouse on the water (or a vaulted store with a door on the quay)
  function stoneHouse(K, ctx, d0, d1, u0, u1, H, kind) {
    const b = K.lbox(d0, d1, u0, u1, -2, H + 2, stone(0.02)); ashlar(b, 4);
    const toward = ctx.edge === 'S' ? 'R' : ctx.edge === 'W' ? 'L' : null;
    if (kind === 'boat' && toward) { const f = toward === 'L' ? A.onL : A.onR, Lf = toward === 'L' ? b.w : b.d; poly(f(b, Lf * 0.2, Lf * 0.8, 0, H * 0.75), '#1e1c1a', null); line(f(b, Lf * 0.2, Lf * 0.8, H * 0.75, 0)[0], f(b, Lf * 0.2, Lf * 0.8, H * 0.75, 0)[1], X.era >= 2 ? BRONZE : IRON, 1.2); }
    else { const sd = ctx.along ? 'R' : 'L', Lf = sd === 'L' ? b.w : b.d; ironDoor(b, sd, Lf / 2, Math.min(0.3, Lf * 0.5), Math.min(10, H - 2)); }
    deepWin(b, ctx.along ? 'L' : 'R', (ctx.along ? b.w : b.d) / 2, H * 0.6, 0.11, 3.5);
    return X.era === 0 && !X.tech('masonry') ? sod(b) : vault(b, K.axD);
  }
  reg('harbor', (slot, L, band, ctx) => {
    if (!ctx || !ctx.coastal || !L) return undefined;   // inland: cityview's stock river landing
    const K = kit(ctx), dep = ctx.depth, u0 = ctx.u0, piers = ctx.piers, sc = stone(-0.04);
    const flat = [], items = [], add = (dd, u, fn) => items.push([K.key(dd, u), fn]);
    // the quay: coursed blocks along the shore with iron bollards
    const qa = piers[0] - 0.45, qb = piers[piers.length - 1] + 0.45;
    flat.push(() => {
      for (let u = qa; u < qb - 0.01; u += 0.25) {
        const u1 = Math.min(qb, u + 0.25), d0 = dep(u) - 0.2, d1 = dep(u1) - 0.2;
        if (ctx.front) { poly([K.at(d0, u, -3), K.at(d1, u1, -3), K.at(d1, u1, 3), K.at(d0, u, 3)], shade(sc, -0.15)); line(K.at(d0, u, 0), K.at(d1, u1, 0), shade(sc, -0.35), 0.5); }
        poly([K.at(d0, u, 3), K.at(d1, u1, 3), K.at(dep(u1) + 0.4, u1, 3), K.at(dep(u) + 0.4, u, 3)], shade(sc, 0.08), null);
        line(K.at(d0, u, 3), K.at(dep(u) + 0.4, u, 3), shade(sc, -0.25), 0.45);
      }
      line(K.at(dep(qa) - 0.2, qa, 3), K.at(dep(qb) - 0.2, qb, 3), shade(sc, -0.4), 1);
    });
    // moles of coursed blocks running out from the quay; the main one broad, with a rune-lamp head
    const outs = piers.map(u => [u, Math.max(0.5, dep(u) - (band >= 1 ? 2.6 : 2.0))]);
    for (const [u, out] of outs) {
      const main = Math.abs(u - u0) < 0.01, hw = main ? 0.3 : 0.22;
      flat.push(() => {
        const b = K.lbox(out, dep(u) + 0.2, u - hw, u + hw, -3, 6, sc); ashlar(b, 3, shade(sc, -0.22));
        for (let dd = out + 0.3; dd < dep(u); dd += 0.4) line(K.at(dd, u - hw, 3), K.at(dd, u + hw, 3), shade(sc, -0.18), 0.45);
        if (main && band >= 1) { const hb = K.lbox(out - 0.12, out + 0.4, u - hw - 0.1, u + hw + 0.1, -3, 6.5, sc); ashlar(hb, 3, shade(sc, -0.22)); }
      });
      add(out + 0.12, u, () => { runeLamp(K, out + 0.12, u + hw - 0.08, main ? 16 : 12); if (band >= 1) bollard(K, out + 0.4, u - hw + 0.06); });
    }
    const gap = (ua, ub) => piers.some(p => Math.abs(p - ua) < 0.01) && piers.some(p => Math.abs(p - ub) < 0.01);
    // barges: an ore barge from the start, more (and a block barge) as the harbour grows
    outs.forEach(([u, out], i) => {
      const len = dep(u) - out, side = i === 0 ? -1 : i === outs.length - 1 ? 1 : (i % 2 ? -1 : 1);
      if (len < 1.0) return;
      if (i > 0 && i < outs.length - 1 && band < 2) return;
      const uu = u + side * 0.52, d0 = out + 0.1, d1 = out + Math.min(band >= 2 && i === 0 ? 2.0 : 1.5, len - 0.2);
      add((d0 + d1) / 2, uu, () => barge(K, ctx, uu, d0, d1, i % 2 ? 'blocks' : 'ore', band >= 2 && i === 0));
    });
    if (band === 0) { const bu = u0 + 0.9, bd = dep(bu) + 0.15; add(bd, bu, () => { oreCart(...K.pt(bd, bu), true); }); }
    // stone boathouse beside the main mole (band 1), a vaulted store between the outer moles (band 2)
    if (band >= 1 && gap(u0, u0 + 1.1)) { const d1 = dep(u0 + 0.55) + 0.1; add(d1 - 0.5, u0 + 0.55, () => stoneHouse(K, ctx, d1 - 0.95, d1, u0 + 0.3, u0 + 0.82, 11, 'boat')); }
    if (band >= 2 && gap(u0 + 1.1, u0 + 2.2)) { const d1 = dep(u0 + 1.65) + 0.1; add(d1 - 0.5, u0 + 1.65, () => stoneHouse(K, ctx, d1 - 0.85, d1, u0 + 1.38, u0 + 1.92, 16, 'store')); }
    // chain cranes: one from L5 at the main mole's root, a second at band 3
    if (L >= 5) { const cu = u0 - 0.55, cd = dep(cu) + 0.1; add(cd, cu, () => chainCrane(K, cd, cu, 36 + band * 5, band)); }
    if (band >= 3 && gap(u0 - 2.2, u0 - 1.1)) { const cu = u0 - 1.65, cd = dep(cu) + 0.1; add(cd, cu, () => chainCrane(K, cd, cu, 44, band)); }
    // ore and blocks on the quay; a hammer-bearing statue on the main mole head (band 3)
    add(dep(u0 + 1.1) + 0.2, u0 + 1.1, () => { const p = K.pt(dep(u0 + 1.1) + 0.24, u0 + 1.1); A.barrel(p[0], p[1]); if (band >= 1) A.crate(p[0] + 0.15, p[1] - 0.2, 0.22, 3); });
    if (band >= 3) { const [u, out] = outs.find(o => Math.abs(o[0] - u0) < 0.01) || outs[0]; add(out + 0.15, u, () => statue(...K.pt(out + 0.12, u), 22)); }
    for (const f of flat) f();
    items.sort((p, q) => p[0] - q[0]);
    for (const [, f] of items) f();
    { const [x2, y2] = K.at(Math.max(0.5, dep(u0) * 0.4), u0 + 1.4); A.rec('sparks', { x: x2, y: y2, kind: 'water', rx: 26, ry: 10 }); }
    return { top: 40 + band * 6, noDress: true };
  });
  // the lighthouse: a squat runed stone tower on the rocks, a carved face, a forge-fire brazier in an iron cage
  reg('lighthouse', ([x, y, w, d], L, band, ctx) => {
    const cx = x + w / 2, cy = y + d / 2;
    A.rock(cx - 0.3, cy - 0.15, 1.4, ROCK); A.rock(cx + 0.25, cy - 0.3, 1.1, '#8f877a');
    const ft = box(cx - 0.4, cy - 0.4, 0.8, 0.8, 0, 8, stone(-0.14)); ashlar(ft, 4);
    A.rock(cx - 0.05, cy + 0.42, 1.0, ROCK); A.rock(cx + 0.42, cy + 0.15, 0.8, '#7a7268');
    const r = 0.3, H = 36 + band * 6, b = box(cx - r, cy - r, 2 * r, 2 * r, 8, H, stone(0.02)); ashlar(b, 5);
    runeRow(b, 'L', H * 0.35, 0.08, 2 * r - 0.08, 0.12); runeRow(b, 'R', H * 0.35, 0.08, 2 * r - 0.08, 0.12);
    if (band >= 2) { runeRow(b, 'L', H * 0.75, 0.08, 2 * r - 0.08, 0.12); runeRow(b, 'R', H * 0.75, 0.08, 2 * r - 0.08, 0.12); }
    ironDoor(b, 'L', r, 0.26, 9);
    const [fx, fy] = A.onR(b, r, r, H * 0.55, 0)[0]; stoneFace(fx, fy, 0.6);
    deepWin(b, 'L', r, H * 0.55, 0.1, 4);
    // corbelled platform and the fire cage
    const zp = 8 + H, pl = box(cx - r - 0.1, cy - r - 0.1, 2 * r + 0.2, 2 * r + 0.2, zp, 3, shade(stone(), -0.12));
    for (const side of ['L', 'R']) for (let u = 0.06; u < 2 * r + 0.2; u += 0.16) poly((side === 'L' ? A.onL : A.onR)(pl, u, u + 0.07, -2.5, 0), shade(stone(), -0.32), null);
    const met = X.era >= 3 ? VERD : X.era >= 2 ? BRONZE : IRON, zc = zp + 3;
    const posts = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => [cx + a * r * 0.75, cy + c * r * 0.75]);
    for (const [px, py] of posts.slice(0, 3)) line(P(px, py, zc), P(px, py, zc + 14), met, 1.3);
    const [bx, by] = P(cx, cy, zc + 3);
    poly([[bx - 7, by - 3], [bx + 7, by - 3], [bx + 4.5, by + 2], [bx - 4.5, by + 2]], met);
    A.lampDot(bx, by - 4, 4.2, FIRE_D, FIRE_N); A.lampDot(bx, by - 6.5, 2.4, '#f0a040', '#fff0b0');
    A.rec('fires', { x: bx, y: by - 4, s: 1.1 });
    { const [ex, ey, erx, ery] = A.ell(cx, cy, zc + 10, r * 0.75 * Math.SQRT2), c = A.c; c.beginPath(); c.ellipse(ex, ey, erx, ery, 0, 0.05, Math.PI - 0.05); c.strokeStyle = A.F(met); c.lineWidth = 0.9; c.stroke(); }   // a cage band in front of the flame
    let zt = zc + 14;
    if (X.era >= 2) { const hb = { x: cx - r * 0.85, y: cy - r * 0.85, w: r * 1.7, d: r * 1.7, z: zt, h: 1.2, col: met }; zt = A.hip(hb, 8, met, 0.06); }
    else { for (let k = 0; k < 4; k++) line(P(...posts[k], zc + 14), P(...posts[(k + 1) % 4], zc + 14), met, 1); }
    const [tx, ty] = P(cx, cy, zt); circ(tx, ty - 1, 1.6, X.era >= 3 ? GOLD : met, A.OUT);
    A.rec('beams', { x: bx, y: by - 5 }); A.rec('lights', { x: bx, y: by - 5, r: 34 });
    return { top: zt + 4, noDress: true };
  });
})();

// cityview opt-outs (the return-object format in js/cityart.js): stock extras this people's art already draws itself.
// Wraps the return value only — the drawings above are untouched.
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.delver) return;
  const R = CITYART.delver, O = {
    smelter: { noTech: ['metallurgy', 'bellows'] },
    farm: { noTech: ['granaries'] },
    mine: { noTech: ['deepshafts'] },
    lumber: { noTech: ['sawpits'] },
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
