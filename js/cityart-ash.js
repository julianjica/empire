// Building art for the ash — see the CITYART contract in js/cityart.js
//  Ashborn: a horned steppe horde. Felt yurts and bone-framed hide tents
//  (band 0) grow into staked war-camps and timber longhalls (bands 1-2),
//  then black-stone citadels lit by ember braziers (band 3). The era moves
//  the material on: hide → timber → black basalt (Empire) → obsidian with
//  ember glints (Legend). Skull standards, red hide banners, war drums,
//  wolf pens and smoking forges carry the horde's character everywhere.
'use strict';
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.ash) return;
  const ART = CITYART.ash;
  let A = null, C = null;
  const FELT = '#d6c09a', BONE = '#e6dac0', RED = '#a3221b', WOOD = '#5a4030', WOOD_D = '#3a2a20', EARTH = '#7a6248',
    BASALT = '#4e4846', BASALT_L = '#686060', OBS = '#2c2632', GLINT = '#a888e0', CLAY = '#9a6446', GOLD = '#e0b440';
  const def = (t, fn) => { ART[t] = (api, slot, L, band, ctx) => { A = api; C = ctx; return fn(slot, L, band, ctx); }; };
  const T = id => { try { return !!C.tech(id); } catch (e) { return false; } };
  const era = () => C.era || 0;
  const roofHide = () => ['#c0935e', '#a9784e', '#8e5c3c', '#5e3c30'][era()];
  const sigil = () => era() >= 3 ? GOLD : BONE;
  // material per growth band: hide → timber → black stone → obsidian (the era pulls it forward)
  const matOf = band => band >= 3 ? (era() >= 3 ? 'obs' : 'stone')
    : band === 2 ? (era() >= 3 ? 'obs' : era() >= 2 || T('architecture') ? 'stone' : 'timber')
    : band === 1 ? (era() >= 2 ? 'timber' : 'hide') : 'hide';
  const wallOf = m => m === 'obs' ? OBS : m === 'stone' ? BASALT_L : '#5e4636';
  const ringBase = () => era() >= 3 ? OBS : era() >= 2 || T('masonry') ? BASALT : null;
  // tiny depth queue: draw parts back to front (smaller gx + gy first)
  const scene = () => { const q = []; let top = 0; return { add: (gx, gy, f) => q.push([gx + gy, f]), run: () => { q.sort((a, b) => a[0] - b[0]); for (const e of q) { const h = e[1](); if (typeof h === 'number' && h > top) top = h; } return top; } }; };

  // ---------------- low-level strokes ----------------
  const stroke = (col, lw) => { const c = A.c; c.strokeStyle = A.F(col); c.lineWidth = lw; c.stroke(); };
  const arc = (x, y, rx, ry, a0, a1, col, lw) => { const c = A.c; c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, a0, a1); stroke(col, lw); };
  const curve = (a, cp, b, col, lw) => { const c = A.c; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(cp[0], cp[1], b[0], b[1]); stroke(col, lw); };
  const horns = (x, y, s = 1, col = BONE) => { curve([x - 1.5 * s, y], [x - 7 * s, y - 0.5 * s], [x - 6 * s, y - 7 * s], col, 1.8 * s); curve([x + 1.5 * s, y], [x + 7 * s, y - 0.5 * s], [x + 6 * s, y - 7 * s], col, 1.8 * s); };
  const glints = (pts, n) => { if (A.GLOW) return; for (let k = 0; k < n; k++) { const p = pts(A.R(), A.R()); A.line(p, [p[0] + 2.2, p[1] - 1.6], GLINT, 0.6); } };
  const smoke = (gx, gy, z, kind = 'hall', dark = false) => { const [x, y] = A.P(gx, gy, z); A.rec('smoke', { x, y, kind, seed: A.R(), dark }); };
  const fire = (gx, gy, z, s = 1, r = 26) => { const [x, y] = A.P(gx, gy, z); A.rec('fires', { x, y, s }); A.rec('lights', { x, y: y - 4 * s, r: r * s }); };

  // ---------------- horde pieces ----------------
  // a felt yurt: lattice drum, red straps, a lit door, a hide cone roof with a smoke crown
  function yurt(cx, cy, r, h, o = {}) {
    const { P, cyl, cone, ell, lamp, shade } = A;
    let z = o.z || 0;
    if (o.base) { cyl(cx, cy, r * 1.14, z, 2.5, o.base); z += 2.5; }
    const wall = o.col || FELT, roof = o.roof || roofHide();
    cyl(cx, cy, r, z, h, wall);
    const [x, y, rx, ry] = ell(cx, cy, z, r);
    if (!A.GLOW && r > 0.22) {
      const lc = shade(wall, -0.22), n = Math.max(4, Math.round(r * 14));
      for (let k = 0; k < n; k++) {
        const t0 = k / n * Math.PI, t1 = t0 + 0.42;
        if (t1 <= Math.PI) A.line([x + rx * Math.cos(t0), y + ry * Math.sin(t0) - 1], [x + rx * Math.cos(t1), y + ry * Math.sin(t1) - h + 1], lc, 0.45);
        const t2 = t0 - 0.42; if (t2 >= 0) A.line([x + rx * Math.cos(t0), y + ry * Math.sin(t0) - 1], [x + rx * Math.cos(t2), y + ry * Math.sin(t2) - h + 1], lc, 0.45);
      }
      arc(x, y - h * 0.62, rx, ry, 0, Math.PI, o.strap || RED, 1.5);
      if (o.straps === 2) arc(x, y - h * 0.25, rx, ry, 0, Math.PI, o.strap || RED, 1.1);
    }
    // door, facing front-left; at night the hearth shows through
    const td = Math.PI / 2 + 0.38, dx = x + rx * Math.cos(td), dy = y + ry * Math.sin(td), dh = Math.min(9, h * 0.75), dw = Math.max(1.3, r * 4.2);
    A.poly([[dx - dw - 0.8, dy], [dx + dw + 0.8, dy], [dx + dw + 0.8, dy - dh - 1], [dx - dw - 0.8, dy - dh - 1]], o.frame || RED, null);
    lamp([[dx - dw, dy], [dx + dw, dy], [dx + dw, dy - dh], [dx - dw, dy - dh]], '#2a1e18', '#ffb050');
    const rh = o.rh || Math.max(6, r * 20);
    const zt = cone(cx, cy, r * 1.1, z + h, rh, roof);
    const ap = P(cx, cy, zt);
    if (!A.GLOW) for (const t of [0.15, 0.5, 0.85]) { const a = t * Math.PI; A.line(ap, [x + rx * 1.1 * Math.cos(a), y - h + ry * 1.1 * Math.sin(a)], shade(roof, -0.3), 0.6); }
    // smoke crown: the roof ring with poles poking through
    A.line([ap[0] - 2, ap[1] + 1], [ap[0] - 3.5, ap[1] - 3], WOOD_D, 1); A.line([ap[0] + 2, ap[1] + 1], [ap[0] + 3.5, ap[1] - 3], WOOD_D, 1);
    if (o.crown) { A.skull(ap[0], ap[1] - 2, 0.8); horns(ap[0], ap[1] - 3, 0.55); }
    if (o.smoke) smoke(cx, cy, zt + 1, 'hall');
    return zt + (o.crown ? 6 : 2);
  }
  // a tall hide tent on a frame of mammoth ribs
  function boneTent(cx, cy, r, h, o = {}) {
    const { P, cone, ell, lamp } = A;
    const [x, y, rx, ry] = ell(cx, cy, 0, r), ap = P(cx, cy, h);
    for (const t of [1.25, 1.75]) { const a = t * Math.PI; curve([x + rx * Math.cos(a), y + ry * Math.sin(a)], [x + rx * Math.cos(a) * 0.4, ap[1] + h * 0.15], [ap[0] - Math.cos(a) * 6, ap[1] - 7], BONE, 1.6); }
    cone(cx, cy, r, 0, h, o.col || roofHide());
    if (!A.GLOW) { for (let k = 1; k < 4; k++) arc(x, y - h * k / 4.2, rx * (1 - k / 4.2), ry * (1 - k / 4.2), 0.15, Math.PI - 0.15, A.shade(o.col || roofHide(), -0.28), 0.6); }
    for (const t of [0.12, 0.88]) { const a = t * Math.PI; curve([x + rx * Math.cos(a), y + ry * Math.sin(a)], [x + rx * Math.cos(a) * 0.5, ap[1] + h * 0.2], [ap[0] - Math.cos(a) * 6, ap[1] - 7], BONE, 1.8); }
    const td = Math.PI / 2 + 0.3, dx = x + rx * Math.cos(td) * 0.9, dy = y + ry * Math.sin(td) * 0.9, dh = Math.min(10, h * 0.42);
    lamp([[dx - 3, dy], [dx + 3, dy], [dx, dy - dh]], '#2a1e18', '#ffa848');
    if (!A.GLOW) { A.circ(ap[0] - 1, ap[1] + h * 0.35, 1.6, RED); A.line([ap[0] - 4, ap[1] + h * 0.3], [ap[0] + 2, ap[1] + h * 0.3], RED, 0.9); }
    if (o.skull) A.skull(ap[0], ap[1] - 4, 0.8);
    return h + 8;
  }
  // a ridge tent of hide over poles, ridge along x
  function ridgeTent(x, y, w, d, h, o = {}) {
    const { P, poly, lamp, shade, line } = A, col = o.col || roofHide(), ym = y + d / 2;
    poly([P(x, y, 0), P(x + w, y, 0), P(x + w, ym, h), P(x, ym, h)], shade(col, -0.3));
    poly([P(x + w, y, 0), P(x + w, y + d, 0), P(x + w, ym, h)], shade(col, -0.12));
    const g0 = P(x + w, ym - d * 0.18, 0), g1 = P(x + w, ym + d * 0.18, 0), gt = P(x + w, ym, h * 0.62);
    lamp([g0, g1, gt], '#2a1e18', '#ffa848');
    poly([P(x, y + d, 0), P(x + w, y + d, 0), P(x + w, ym, h), P(x, ym, h)], col);
    if (!A.GLOW) for (let u = 0.25; u < w; u += 0.3) line(P(x + u, y + d, 0.5), P(x + u, ym, h - 0.5), shade(col, -0.2), 0.5);
    for (const gx of [x - 0.04, x + w + 0.04]) { const t = P(gx, ym, h); line([t[0] - 3, t[1] + 4], [t[0] + 2.5, t[1] - 3], WOOD_D, 1); line([t[0] + 3, t[1] + 4], [t[0] - 2.5, t[1] - 3], WOOD_D, 1); }
    line(P(x - 0.06, ym, h), P(x + w + 0.06, ym, h), WOOD_D, 1.2);
    if (o.red && !A.GLOW) line(P(x, y + d * 0.78, h * 0.42), P(x + w, y + d * 0.78, h * 0.42), RED, 1.4);
    return h + 4;
  }
  // an ember brazier on a basalt plinth (or an iron tripod)
  function brazier(gx, gy, z = 0, s = 1, ped = true) {
    const { P, line, lampDot } = A;
    if (ped) { A.box(gx - 0.07 * s, gy - 0.07 * s, 0.14 * s, 0.14 * s, z, 7 * s, era() >= 3 ? OBS : BASALT); z += 7 * s; }
    else { const t = P(gx, gy, z + 8 * s); for (const [dx, dy] of [[-0.1, 0.06], [0.1, 0.06], [0.02, -0.11]]) line(P(gx + dx * s, gy + dy * s, z), t, WOOD_D, 1); z += 8 * s; }
    const [x, y] = P(gx, gy, z);
    A.poly([[x - 4 * s, y - 1.5 * s], [x + 4 * s, y - 1.5 * s], [x + 2.5 * s, y + 1.6 * s], [x - 2.5 * s, y + 1.6 * s]], '#2a2420', null);
    lampDot(x, y - 1.5 * s, 2.6 * s, '#c0501a', '#ffb050');
    A.rec('fires', { x, y: y - 1.5 * s, s: 0.5 * s }); A.rec('lights', { x, y: y - 5 * s, r: 24 * s });
    return z + 6 * s;
  }
  // a skull standard: horned skull on a pole with red tassels, more skulls below
  function skullPole(gx, gy, h, n = 0, z = 0) {
    const { P, line } = A, t = P(gx, gy, z + h);
    line(P(gx, gy, z), t, WOOD_D, 1.6);
    line([t[0] - 4, t[1] + 5], [t[0] + 4, t[1] + 5], WOOD_D, 1.1);
    for (const dx of [-3.6, 3.6]) line([t[0] + dx, t[1] + 5], [t[0] + dx * 1.1, t[1] + 12], RED, 1.3);
    for (let k = 1; k <= n; k++) A.skull(t[0], t[1] + 6 + k * 5, 0.72);
    horns(t[0], t[1] - 1.5, 0.75); A.skull(t[0], t[1] - 0.5, 1.1);
    return z + h + 7;
  }
  // a red hide banner: horned crossbar, jagged tail, painted sigil
  function hornBanner(gx, gy, h, col = RED, z = 0) {
    const { P, line, poly } = A, t = P(gx, gy, z + h);
    line(P(gx, gy, z), t, WOOD_D, 1.5);
    poly([[t[0] - 4, t[1] + 3], [t[0] + 5, t[1] + 3], [t[0] + 5, t[1] + 17], [t[0] + 3, t[1] + 14], [t[0] + 0.5, t[1] + 18.5], [t[0] - 2, t[1] + 14], [t[0] - 4, t[1] + 17]], col);
    if (!A.GLOW) { A.circ(t[0] + 0.5, t[1] + 9, 2.4, null, sigil()); A.circ(t[0] + 0.5, t[1] + 9, 0.9, sigil()); line([t[0] - 2.5, t[1] + 13], [t[0] + 3.5, t[1] + 13], sigil(), 0.6); }
    line([t[0] - 5.5, t[1] + 3], [t[0] + 6.5, t[1] + 3], WOOD_D, 1.3);
    curve([t[0] - 5.5, t[1] + 3], [t[0] - 8, t[1] + 2], [t[0] - 7.5, t[1] - 2], BONE, 1.2); curve([t[0] + 6.5, t[1] + 3], [t[0] + 9, t[1] + 2], [t[0] + 8.5, t[1] - 2], BONE, 1.2);
    A.circ(t[0], t[1] - 0.5, 1.3, BONE);
    return z + h + 3;
  }
  // a carved totem pole: stacked glaring faces under spread wings and a horned skull
  function totem(gx, gy, h, s = 1) {
    const { P, poly, line, circ } = A, [x, y] = P(gx, gy);
    poly([[x - 3 * s, y], [x + 3 * s, y], [x + 2.4 * s, y - h], [x - 2.4 * s, y - h]], '#6a4a32');
    if (!A.GLOW) {
      poly([[x + 0.6 * s, y], [x + 3 * s, y], [x + 2.4 * s, y - h], [x + 0.5 * s, y - h]], '#4e3624', null);
      for (let v = 6 * s, k = 0; v < h - 6 * s; v += 9 * s, k++) {
        const yy = y - v; circ(x - 1.1 * s, yy - 3 * s, 0.9 * s, BONE); circ(x + 1.1 * s, yy - 3 * s, 0.9 * s, BONE);
        line([x - 2.6 * s, yy], [x + 2.6 * s, yy], k % 2 ? '#2f6a8a' : RED, 1.2 * s); line([x - 1.2 * s, yy - 1.2 * s], [x + 1.2 * s, yy - 1.2 * s], WOOD_D, 0.7 * s);
      }
    }
    poly([[x - 2.5 * s, y - h + 2], [x - 11 * s, y - h - 3 * s], [x - 9 * s, y - h + 2 * s], [x - 2.5 * s, y - h + 5]], '#7a5a3a');
    poly([[x + 2.5 * s, y - h + 2], [x + 11 * s, y - h - 3 * s], [x + 9 * s, y - h + 2 * s], [x + 2.5 * s, y - h + 5]], '#5e4430');
    horns(x, y - h - 2 * s, 0.8 * s); A.skull(x, y - h - 1 * s, 1.1 * s);
    return h + 8 * s;
  }
  // sharpened stakes along a grid polyline (sorted back to front), optional skulls
  function stakes(pts, h, o = {}) {
    const { P, poly, line } = A, z = o.z || 0, col = o.col || '#5a4030', st = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (o.gap || 0.17)));
      for (let k = (i ? 1 : 0); k <= n; k++) st.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n, st.length]);
    }
    st.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [gx, gy, k] of st) {
      const hh = h + ((k * 7) % 3) * 1.5, [x0, y0] = P(gx, gy, z), [tx, ty] = P(gx, gy, z + hh);
      const cc = o.bone && k % 4 === 0 ? BONE : col;
      poly([[x0 - 2, y0], [x0 + 2, y0], [tx + 2, ty + 3], [tx, ty - 2], [tx - 2, ty + 3]], cc, A.OUT, 0.5);
      if (!A.GLOW) line([x0 + 0.9, y0], [tx + 0.9, ty + 3], A.shade(cc, -0.3), 0.7);
      if (o.skulls && k % 7 === 3) A.skull(tx, ty + 6, 0.75);
    }
    if (!A.GLOW && pts.length > 1) for (let i = 0; i < pts.length - 1; i++) line(P(pts[i][0], pts[i][1], z + h * 0.45), P(pts[i + 1][0], pts[i + 1][1], z + h * 0.45), '#c9a874', 0.7);
    return z + h + 4;
  }
  // a war drum: hide skin stretched over a red-lacquered shell
  function drum(gx, gy, z, r, h) {
    const { cyl, ell, line } = A;
    cyl(gx, gy, r, z, h, '#8a3a24', BONE);
    const [x, y, rx, ry] = ell(gx, gy, z, r);
    if (!A.GLOW) for (let k = 0; k < 6; k++) { const a0 = k / 6 * Math.PI, a1 = (k + 0.5) / 6 * Math.PI; line([x + rx * Math.cos(a0), y + ry * Math.sin(a0) - h + 0.5], [x + rx * Math.cos(a1), y + ry * Math.sin(a1) - 0.5], BONE, 0.5); }
    line([x + rx * 0.2, y - h - ry * 0.2], [x + rx * 0.9, y - h - 7], WOOD_D, 1.2); A.circ(x + rx * 0.9, y - h - 7, 1.2, BONE);
    return z + h;
  }
  // a fence of lashed timber: crossed posts and two rails
  function lashFence(pts, h = 7) {
    const { P, line, circ } = A;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.42));
      const dx = (bx - ax) / n * 0.22, dy = (by - ay) / n * 0.22;
      for (let k = 0; k <= n; k++) { const gx = ax + (bx - ax) * k / n, gy = ay + (by - ay) * k / n; line(P(gx - dx, gy - dy), P(gx + dx, gy + dy, h + 2), WOOD, 1.2); line(P(gx + dx, gy + dy), P(gx - dx, gy - dy, h + 2), WOOD, 1.2); if (!A.GLOW) circ(...P(gx, gy, h * 0.55), 0.8, BONE); }
      line(P(ax, ay, h * 0.85), P(bx, by, h * 0.85), WOOD_D, 1); line(P(ax, ay, h * 0.4), P(bx, by, h * 0.4), WOOD_D, 1);
    }
  }
  // spiked teeth along the front edges of a box top
  function spikeTop(b, h = 5, col) {
    const { P, poly } = A, z = b.z + b.h; col = col || A.shade(b.col, -0.1);
    const nW = Math.max(2, Math.round(b.w / 0.22)), nD = Math.max(2, Math.round(b.d / 0.22));
    for (let k = 0; k <= nD; k++) { const gy = b.y + b.d * k / nD; poly([P(b.x + b.w, gy - 0.05, z), P(b.x + b.w, gy + 0.05, z), P(b.x + b.w, gy, z + h)], col, A.OUT, 0.5); }
    for (let k = 0; k <= nW; k++) { const gx = b.x + b.w * k / nW; poly([P(gx - 0.05, b.y + b.d, z), P(gx + 0.05, b.y + b.d, z), P(gx, b.y + b.d, z + h)], col, A.OUT, 0.5); }
  }
  // a black-stone (or obsidian) block with coursing, lit arrow slits and glints
  function stoneBlock(x, y, w, d, z, h, m, o = {}) {
    const col = o.col || wallOf(m), b = A.box(x, y, w, d, z, h, col);
    if (!A.GLOW) A.courses(b, 4.5, A.shade(col, m === 'obs' ? 0.12 : -0.18));
    if (m === 'obs') { glints((u, v) => A.onL(b, u * w, u * w, v * h, v * h)[0], 3 + Math.round(w * 2)); glints((u, v) => A.onR(b, u * d, u * d, v * h, v * h)[0], 2 + Math.round(d * 2)); }
    if (o.slits !== false && h > 9) {
      const nL = Math.max(1, Math.round(w / 0.5)), nR = Math.max(1, Math.round(d / 0.5)), v = h * 0.5;
      for (let i = 0; i < nL; i++) if (!(o.door && i === Math.floor(nL / 2))) A.lamp(A.onL(b, w * (i + 0.5) / nL - 0.035, w * (i + 0.5) / nL + 0.035, v, v + 5), '#1a1414', '#ffa040');
      for (let i = 0; i < nR; i++) A.lamp(A.onR(b, d * (i + 0.5) / nR - 0.035, d * (i + 0.5) / nR + 0.035, v, v + 5), '#1a1414', '#ffa040');
    }
    if (m === 'obs' && !A.GLOW) A.lamp(A.onL(b, 0.02, w - 0.02, h - 2.2, h - 1.5), '#7a2a1a', '#ff7a2a');
    else if (m === 'obs') A.lamp(A.onL(b, 0.02, w - 0.02, h - 2.2, h - 1.5), '#7a2a1a', '#ff7a2a');
    return b;
  }
  // a great door on the left face: open, firelit at night, a skull over the lintel
  function bigDoor(b, u, dw, dh, skullOver = true) {
    const f = A.onL;
    A.poly(f(b, u - dw / 2 - 0.05, u + dw / 2 + 0.05, 0, dh + 2), era() >= 3 ? '#1a1418' : WOOD_D, null);
    const q = f(b, u - dw / 2, u + dw / 2, 0, dh - 2.5), tp = f(b, u, u, dh, dh)[0];
    A.lamp([q[0], q[1], q[2], tp, q[3]], '#1e1612', '#ff9a40');
    if (skullOver) { const p = f(b, u, u, dh + 4.5, dh + 4.5)[0]; horns(p[0], p[1] - 0.5, 0.7); A.skull(p[0], p[1], 1); }
  }
  // a timber/stone longhall under a hide roof with crossed tusks at the gables
  function longhall(x, y, w, d, H, m, o = {}) {
    const { box, shade, onL, onR, line } = A, axis = o.axis || (w >= d ? 'x' : 'y');
    if (m !== 'hide' && (T('masonry') || m !== 'timber')) box(x - 0.05, y - 0.05, w + 0.1, d + 0.1, 0, 2.5, era() >= 3 ? OBS : BASALT);
    const z0 = m !== 'hide' && (T('masonry') || m !== 'timber') ? 2.5 : 0;
    let b;
    if (m === 'timber' || m === 'hide') {
      const col = '#5e4636'; b = box(x, y, w, d, z0, H, col);
      if (!A.GLOW) { for (let u = 0.13; u < w; u += 0.16) line(onL(b, u, u, 0, 0)[0], onL(b, u, u, H, H)[0], shade(col, -0.28), 0.6); for (let u = 0.13; u < d; u += 0.16) line(onR(b, u, u, 0, 0)[0], onR(b, u, u, H, H)[0], shade(col, -0.36), 0.6); line(onL(b, 0, w, H * 0.55, H * 0.55)[0], onL(b, 0, w, H * 0.55, H * 0.55)[1], RED, 1.2); }
      const nR = Math.max(1, Math.round(d / 0.55)); for (let i = 0; i < nR; i++) A.lamp(onR(b, d * (i + 0.5) / nR - 0.06, d * (i + 0.5) / nR + 0.06, H * 0.35, H * 0.35 + 4), '#2a1e18', '#ffb050');
    } else b = stoneBlock(x, y, w, d, z0, H, m, { door: true });
    bigDoor(b, o.door != null ? o.door : w / 2, 0.36, Math.min(11, H * 0.72));
    const rh = (axis === 'x' ? d : w) * (o.rk || 12), roof = o.roof || (m === 'obs' ? '#3a2e34' : m === 'stone' ? '#4a3a34' : roofHide());
    const zt = A.gable(b, rh, roof, axis, 'thatch', 0.16);
    const ge = axis === 'x' ? A.P(x + w + 0.1, y + d / 2, z0 + H + rh) : A.P(x + w / 2, y + d + 0.1, z0 + H + rh);
    curve(ge, [ge[0] - 2, ge[1] - 4], [ge[0] - 6, ge[1] - 8], BONE, 1.7); curve(ge, [ge[0] + 2, ge[1] - 4], [ge[0] + 6, ge[1] - 8], BONE, 1.7);
    const gb = axis === 'x' ? A.P(x - 0.1, y + d / 2, z0 + H + rh) : A.P(x + w / 2, y - 0.1, z0 + H + rh);
    curve(gb, [gb[0] - 2, gb[1] - 4], [gb[0] - 6, gb[1] - 8], BONE, 1.5); curve(gb, [gb[0] + 2, gb[1] - 4], [gb[0] + 6, gb[1] - 8], BONE, 1.5);
    if (m === 'obs' || o.spikes) { const n = 4; for (let k = 1; k < n; k++) { const p = axis === 'x' ? A.P(x + w * k / n, y + d / 2, z0 + H + rh) : A.P(x + w / 2, y + d * k / n, z0 + H + rh); A.poly([[p[0] - 1.3, p[1]], [p[0] + 1.3, p[1]], [p[0], p[1] - 6]], m === 'obs' ? OBS : BONE); } }
    if (o.smoke) smoke(axis === 'x' ? x + w * 0.3 : x + w / 2, axis === 'x' ? y + d / 2 : y + d * 0.3, z0 + H + rh, o.smoke);
    return zt + 8;
  }
  // a lookout of four leaning stakes, a hide-roofed platform and a skull
  function stakeTower(x, y, s, H, o = {}) {
    const { P, line, box, cone } = A, cx = x + s / 2, cy = y + s / 2;
    for (const [px, py] of [[x, y], [x + s, y], [x, y + s], [x + s, y + s]]) line(P(px, py), P(px + (cx - px) * 0.3, py + (cy - py) * 0.3, H), WOOD_D, 2);
    if (!A.GLOW) { line(P(x, y + s, H * 0.3), P(x + s, y + s, H * 0.62), WOOD, 1.1); line(P(x + s, y + s, H * 0.3), P(x, y + s, H * 0.62), WOOD, 1.1); line(P(x + s, y, H * 0.35), P(x + s, y + s, H * 0.6), WOOD, 1.1); }
    box(x - 0.08, y - 0.08, s + 0.16, s + 0.16, H, 4, '#5e4636');
    stakes([[x - 0.08, y + s + 0.08], [x + s + 0.08, y + s + 0.08], [x + s + 0.08, y - 0.08]], 5, { z: H + 4, gap: 0.14 });
    if (o.brazier) return brazier(cx, cy, H + 4, 1, false) + 4;
    const zt = cone(cx, cy, s * 0.72, H + 9, 14, roofHide());
    skullPole(cx, cy, 8, 0, zt - 2);
    return zt + 14;
  }
  function wagon(gx, gy, alongX = true) {
    const { box, gable, P, circ, line } = A, w = alongX ? 0.85 : 0.42, d = alongX ? 0.42 : 0.85;
    const bed = box(gx, gy, w, d, 3.5, 3, WOOD);
    gable({ x: gx + 0.03, y: gy + 0.03, w: w - 0.06, d: d - 0.06, z: 6.5, h: 2, col: FELT }, 6, FELT, alongX ? 'x' : 'y', null, 0.04);
    void bed;
    const wh = alongX ? [[gx + 0.15, gy + d], [gx + w - 0.15, gy + d]] : [[gx + w, gy + 0.15], [gx + w, gy + d - 0.15]];
    for (const [wx, wy] of wh) { const [cx, cy] = P(wx, wy, 3.4); circ(cx, cy, 3.4, '#6a4a30', A.OUT); circ(cx, cy, 1, WOOD_D); line([cx - 3, cy], [cx + 3, cy], WOOD_D, 0.6); line([cx, cy - 3], [cx, cy + 3], WOOD_D, 0.6); }
    const t0 = alongX ? P(gx + w, gy + d / 2, 4) : P(gx + w / 2, gy + d, 4), t1 = alongX ? P(gx + w + 0.35, gy + d / 2, 2) : P(gx + w / 2, gy + d + 0.35, 2);
    line(t0, t1, WOOD_D, 1.2);
    return 18;
  }
  function meatRack(gx, gy, alongX = true) {
    const { P, line, poly } = A, ex = alongX ? [0.5, 0] : [0, 0.5];
    const a = P(gx, gy, 0), b = P(gx + ex[0], gy + ex[1], 0), at = P(gx, gy, 12), bt = P(gx + ex[0], gy + ex[1], 12);
    line(a, at, WOOD_D, 1.1); line(b, bt, WOOD_D, 1.1); line(at, bt, WOOD_D, 1);
    for (let k = 1; k < 4; k++) { const m = [at[0] + (bt[0] - at[0]) * k / 4, at[1] + (bt[1] - at[1]) * k / 4]; poly([[m[0] - 1.3, m[1]], [m[0] + 1.3, m[1]], [m[0] + 1, m[1] + 6], [m[0] - 1, m[1] + 6]], k % 2 ? '#8a3a2a' : '#a8784e', null); }
  }
  function shields(gx, gy, n, alongX = true, z = 4) {
    const cols = [RED, '#c9a46a', '#3a2a20', '#6d4c8d'];
    for (let k = 0; k < n; k++) { const [x, y] = A.P(gx + (alongX ? k * 0.2 : 0), gy + (alongX ? 0 : k * 0.2), z); A.circ(x, y, 3.2, cols[k % 4], A.OUT); A.circ(x, y, 1, BONE); if (!A.GLOW) A.line([x - 3, y], [x + 3, y], A.shade(cols[k % 4], -0.3), 0.5); }
  }
  function spearRack(gx, gy, n = 4) {
    const { P, line, poly } = A;
    line(P(gx, gy, 3), P(gx, gy + 0.2 * n, 3), WOOD_D, 1.3); line(P(gx, gy, 9), P(gx, gy + 0.2 * n, 9), WOOD_D, 1.3);
    for (let k = 0; k < n; k++) { const a = P(gx, gy + 0.1 + k * 0.2, 0), b = P(gx, gy + 0.1 + k * 0.2, 17); line(a, b, '#7a5a3a', 1); poly([[b[0] - 1.2, b[1] + 1], [b[0] + 1.2, b[1] + 1], [b[0], b[1] - 3.5]], era() >= 2 ? '#d8dce2' : '#c8bfae', null); }
  }
  function dummy(gx, gy) {
    const [dx, dy] = A.P(gx, gy);
    A.line([dx, dy], [dx, dy - 12], WOOD, 1.4); A.line([dx - 4, dy - 9], [dx + 4, dy - 9], WOOD, 1.3);
    const c = A.c; c.beginPath(); c.ellipse(dx, dy - 7, 2.6, 3.6, 0, 0, A.TAU); c.fillStyle = A.F('#c9a868'); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke();
    A.skull(dx, dy - 12.5, 0.85);
  }
  function rug(gx, gy, w, d, col) { A.poly(A.quad(gx, gy, w, d, 0.3), col, A.OUT, 0.5); if (!A.GLOW) A.poly(A.quad(gx + 0.06, gy + 0.06, w - 0.12, d - 0.12, 0.35), null, BONE, 0.6); }
  function heap(gx, gy, rx, col, dots) { const [x, y] = A.P(gx, gy); const c = A.c; c.beginPath(); c.ellipse(x, y - 1, rx, rx * 0.5, 0, Math.PI, A.TAU); c.fillStyle = A.F(col); c.fill(); if (dots) for (let k = 0; k < 5; k++) A.circ(x - rx * 0.6 + k * rx * 0.3, y - 2 - (k % 2) * 1.5, 1.3, dots[k % dots.length]); }
  function stones(cx, cy, r, n, h, part = 0, skip = -1, col) { // standing stones round a ring; part 1 = back half, 2 = front half
    for (let k = 0; k < n; k++) { const t = k / n, a = t * A.TAU + 0.4, fr = Math.cos(a) + Math.sin(a) > 0; if ((part === 1 && fr) || (part === 2 && !fr) || k === skip) continue; const gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r; const b = A.box(gx - 0.07, gy - 0.06, 0.14, 0.12, 0, h + (k % 2) * 3, col || (era() >= 3 ? OBS : BASALT_L)); if (h > 8) A.lamp(A.onL(b, 0.05, 0.09, h * 0.4, h * 0.4 + 3), '#5a2a1a', '#ff8a3a'); }
  }

  // =====================================================================
  //  buildings
  // =====================================================================
  def('townhall', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band), base = ringBase();
    if (band === 0) {
      sc.add(x + 1.25, y + 1.15, () => yurt(x + 1.25, y + 1.15, 0.7 + L * 0.03, 12 + L, { smoke: true, straps: 2, crown: true, base }));
      sc.add(x + 2.1, y + 0.55, () => yurt(x + 2.1, y + 0.55, 0.38, 8, { base }));
      if (L >= 2) sc.add(x + 0.5, y + 2.1, () => yurt(x + 0.5, y + 2.1, 0.36, 8, { base }));
      sc.add(x + 2.35, y + 1.75, () => skullPole(x + 2.35, y + 1.75, 22 + L * 2, Math.min(2, L - 1)));
      sc.add(x + 1.55, y + 2.35, () => { A.firePit(x + 1.55, y + 2.35, 0.7); return 0; });
      if (L >= 3) sc.add(x + 0.3, y + 0.4, () => hornBanner(x + 0.3, y + 0.4, 26));
      return sc.run();
    }
    if (band === 1) { // the khan's two-tiered yurt behind a staked ring, a war drum on its platform
      const cx = x + 1.25, cy = y + 1.3, r = 0.9;
      sc.add(x, y, () => stakes([[x + 0.08, y + 1.9], [x + 0.08, y + 0.08], [x + 1.9, y + 0.08]], 13, { skulls: true, bone: true }));
      sc.add(cx, cy, () => { yurt(cx, cy, r, 13, { rh: 8, straps: 2, base }); return yurt(cx, cy, r * 0.55, 9 + (L - 5), { z: 17, smoke: true, crown: true, strap: '#c9a46a' }); });
      sc.add(x + 2.2, y + 0.55, () => { A.box(x + 1.95, y + 0.3, 0.5, 0.5, 0, 6, WOOD); return drum(x + 2.2, y + 0.55, 6, 0.2, 7); });
      sc.add(x + 0.45, y + 2.25, () => yurt(x + 0.45, y + 2.25, 0.34, 8, { base }));
      sc.add(x + 2.45, y + 2.0, () => skullPole(x + 2.45, y + 2.0, 30, 2));
      sc.add(x + 0.3, y + 0.45, () => hornBanner(x + 0.3, y + 0.45, 30));
      if (L >= 7) sc.add(x + 2.5, y + 1.2, () => hornBanner(x + 2.5, y + 1.2, 28, '#6d4c8d'));
      sc.add(x + 1.75, y + 2.45, () => { if (era() >= 2) brazier(x + 1.75, y + 2.45, 0, 1); else A.firePit(x + 1.75, y + 2.45, 0.75); return 0; });
      return sc.run();
    }
    if (band === 2) { // war-camp hall: a horned longhall, a stake lookout, braziers at the door
      sc.add(x + 2.05, y + 0.08, () => stakeTower(x + 2.05, y + 0.05, 0.6, 38 + (L - 10) * 2, { brazier: era() >= 2 }));
      sc.add(x + 0.45, y + 0.45, () => yurt(x + 0.45, y + 0.45, 0.36, 9, { base }));
      sc.add(x + 1.5, y + 1.65, () => longhall(x + 0.5, y + 1.0, 1.95, 1.3, 16 + (L - 10), m, { axis: 'x', smoke: 'hall' }));
      sc.add(x + 1.05, y + 2.55, () => brazier(x + 1.05, y + 2.55, 0, 0.9, era() >= 2));
      sc.add(x + 2.0, y + 2.55, () => brazier(x + 2.0, y + 2.55, 0, 0.9, era() >= 2));
      sc.add(x + 0.25, y + 2.5, () => hornBanner(x + 0.25, y + 2.5, 32));
      if (L >= 12) sc.add(x + 2.6, y + 1.3, () => skullPole(x + 2.6, y + 1.3, 30, 2));
      return sc.run();
    }
    // band 3: a black-stone citadel: stepped keep, horned crown, ember braziers on the battlements
    const H1 = 18 + (L - 15), H2 = 14 + (L - 15);
    sc.add(x + 2.4, y + 0.3, () => {
      const t = stoneBlock(x + 2.1, y + 0.02, 0.6, 0.6, 0, 50 + L, m);
      spikeTop(t, 4);
      return brazier(x + 2.4, y + 0.32, 50 + L, 1.1, false) + 2;
    });
    sc.add(x + 1.3, y + 1.35, () => {
      const b1 = stoneBlock(x + 0.25, y + 0.4, 1.85, 1.9, 0, H1, m, { door: true });
      bigDoor(b1, 0.92, 0.42, 13);
      if (!A.GLOW) for (const u of [0.35, 1.5]) { const q = A.onL(b1, u - 0.08, u + 0.08, 2, H1 - 2); A.poly([q[3], q[2], q[1], [(q[0][0] + q[1][0]) / 2, q[1][1] - 3], q[0]], RED, null); A.circ(...A.onL(b1, u, u, H1 - 6, H1 - 6)[0], 1.4, sigil()); }
      spikeTop(b1, 4);
      const b2 = stoneBlock(x + 0.6, y + 0.7, 1.2, 1.2, H1, H2, m);
      const zt = A.hip(b2, 18, m === 'obs' ? '#2a2228' : '#3e302c', 0.1);
      const ap = A.P(x + 1.2, y + 1.3, zt); horns(ap[0], ap[1] + 2, 1.7); A.skull(ap[0], ap[1] + 1, 1.5);
      if (m === 'obs') { A.lampDot(ap[0], ap[1] - 4, 1.6, '#c0501a', '#ffb050'); }
      brazier(x + 2.0, y + 2.2, H1, 0.8, false); brazier(x + 0.4, y + 2.2, H1, 0.8, false); brazier(x + 2.0, y + 0.5, H1, 0.8, false);
      return zt + 10;
    });
    sc.add(x + 0.2, y + 2.65, () => hornBanner(x + 0.2, y + 2.65, 36));
    sc.add(x + 2.6, y + 1.5, () => hornBanner(x + 2.6, y + 1.5, 36, '#6d4c8d'));
    return sc.run();
  });

  def('cottage', ([x, y, w, d], L, band, ctx) => {
    const i = ctx.i || 0, cx = x + w / 2, cy = y + d / 2, v = i % 3, base = ringBase(), wet = !!ctx.wet;   // wet: on a pile deck over the water — the home and a drying rack, no totems, fires or steps
    if (band === 0) {
      if (v === 1) return boneTent(cx, cy, 0.4, 20 + L, { skull: L >= 3 });
      const t = yurt(cx, cy, 0.38, 8 + L * 0.5, { base, smoke: i % 2 === 0 });
      if (L >= 3 && v === 2) meatRack(x + 0.05, y + d - 0.05, true);
      return t;
    }
    if (band === 1) {
      if (v === 1) { const t = boneTent(cx - 0.1, cy - 0.1, 0.46, 24, { skull: true }); yurt(x + w - 0.25, y + d - 0.2, 0.2, 6, {}); return t; }
      const t = yurt(cx - 0.05, cy - 0.05, 0.5, 10, { base, straps: 2, smoke: true });
      if (v === 2) meatRack(x + 0.02, y + d - 0.02, true); else if (!wet) skullPole(x + w - 0.12, y + d - 0.15, 16);
      return t;
    }
    const m = matOf(band);
    if (band === 2) {
      if (v === 0) { // timber roundhouse on a stone footing, hide cone roof
        if (m !== 'timber') A.cyl(cx, cy, 0.56, 0, 3, BASALT);
        const z0 = m !== 'timber' ? 3 : 0, col = m === 'obs' ? OBS : m === 'stone' ? BASALT_L : '#6a4a34';
        A.cyl(cx, cy, 0.5, z0, 11, col);
        const [ex, ey, rx, ry] = A.ell(cx, cy, z0, 0.5);
        if (!A.GLOW && m === 'timber') for (let k = 1; k < 9; k++) { const a = k / 9 * Math.PI; A.line([ex + rx * Math.cos(a), ey + ry * Math.sin(a)], [ex + rx * Math.cos(a), ey + ry * Math.sin(a) - 11], A.shade(col, -0.3), 0.5); }
        const dx = ex - rx * 0.35, dy = ey + ry * 0.94; A.lamp([[dx - 2.5, dy], [dx + 2.5, dy], [dx + 2.5, dy - 8], [dx - 2.5, dy - 8]], '#2a1e18', '#ffb050');
        A.lamp([[ex + rx * 0.6, ey + ry * 0.8 - 6], [ex + rx * 0.6 + 2, ey + ry * 0.75 - 6], [ex + rx * 0.6 + 2, ey + ry * 0.75 - 9], [ex + rx * 0.6, ey + ry * 0.8 - 9]], '#2a1e18', '#ffb050');
        const zt = A.cone(cx, cy, 0.62, z0 + 11, 16, roofHide()); const ap = A.P(cx, cy, zt); horns(ap[0], ap[1] + 3, 0.7); smoke(cx, cy, zt, 'house');
        return zt + 5;
      }
      if (v === 1) return longhall(x + (wet ? 0.04 : 0.12), y + (wet ? 0.1 : 0.18), wet ? 1.0 : 1.05, 0.8, 10, m, { axis: 'x', rk: 13, smoke: 'house' });
      // yurt raised on a timber deck with steps
      if (wet) return yurt(cx, cy - 0.02, 0.44, 10, { straps: 2, smoke: true });
      const deck = A.box(x + 0.12, y + 0.12, 1.05, 0.95, 0, 4, m === 'obs' ? OBS : m === 'stone' ? BASALT : WOOD); void deck;
      const t = yurt(cx, cy - 0.02, 0.44, 10, { z: 4, straps: 2, smoke: true });
      for (let k = 0; k < 3; k++) A.box(x + 0.2 + k * 0.0, y + 1.07 + k * 0.0, 0.3, 0.06 + k * 0.03, 0, 4 - k * 1.3, WOOD);
      return t;
    }
    // band 3: black-stone houses
    if (v === 1) { // square stone house with spiked roof-terrace and a hide awning
      const b = stoneBlock(x + 0.15, y + 0.15, 0.95, 0.85, 0, 15, m, { door: true });
      bigDoor(b, 0.47, 0.26, 9, false);
      spikeTop(b, 3.5);
      const tent = A.cone(x + 0.55, y + 0.5, 0.3, 15, 10, roofHide()); smoke(x + 0.8, y + 0.4, 17, 'house');
      return tent + 4;
    }
    const col = m === 'obs' ? OBS : BASALT_L;
    A.cyl(cx, cy, 0.52, 0, 15, col);
    const [ex, ey, rx, ry] = A.ell(cx, cy, 0, 0.52);
    if (!A.GLOW) for (let v2 = 4; v2 < 15; v2 += 4) arc(ex, ey - v2, rx, ry, 0.1, Math.PI - 0.1, A.shade(col, m === 'obs' ? 0.15 : -0.2), 0.6);
    const dx = ex - rx * 0.35, dy = ey + ry * 0.94; A.lamp([[dx - 2.6, dy], [dx + 2.6, dy], [dx + 2.6, dy - 7], [dx, dy - 9.5], [dx - 2.6, dy - 7]], '#1e1612', '#ff9a40');
    A.lamp([[ex + rx * 0.55, ey + ry * 0.8 - 8], [ex + rx * 0.55 + 1.6, ey + ry * 0.76 - 8], [ex + rx * 0.55 + 1.6, ey + ry * 0.76 - 12], [ex + rx * 0.55, ey + ry * 0.8 - 12]], '#1e1612', '#ffa040');
    const zt = A.cone(cx, cy, 0.62, 15, 17, m === 'obs' ? '#2e262c' : '#4a3a34');
    const ap = A.P(cx, cy, zt); horns(ap[0], ap[1] + 3, 0.8);
    if (!A.GLOW) { const hx = ex - rx * 0.35; A.poly([[hx - 3.4, dy - 9.5], [hx + 3.4, dy - 9.5], [hx + 2.6, dy - 12], [hx - 2.6, dy - 12]], RED, null); }
    if (v === 2 && !wet) brazier(x + w - 0.2, y + d - 0.2, 0, 0.7, true); else smoke(cx, cy, zt, 'house');

    return zt + 6;
  });

  def('warehouse', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band);
    if (band <= 1) { // the plunder train: hide-covered wagons round a heap of loot
      sc.add(x + 0.2, y + 0.3, () => wagon(x + 0.15, y + 0.2, true));
      if (band === 1 || L >= 3) sc.add(x + 1.1, y + 0.9, () => wagon(x + 1.1, y + 0.5, false));
      if (band === 1) sc.add(x + 0.7, y + 1.35, () => ridgeTent(x + 0.1, y + 1.0, 1.0, 0.75, 14, { red: true }));
      sc.add(x + 0.5, y + 1.9 + (band ? 0.3 : 0), () => { heap(x + 0.5, y + 1.95 + (band ? 0.25 : 0), 9, '#8a6a44', ['#e0b440', '#c9a46a', '#a3221b']); if (!A.GLOW) for (let k = 0; k < 3; k++) { const [gx, gy] = A.P(x + 0.4 + k * 0.1, y + 1.9 + (band ? 0.25 : 0), 3); A.circ(gx, gy - k, 0.8, '#fff0a0'); } return 8; });
      for (let k = 0; k < Math.min(3, 1 + Math.floor(L / 2)); k++) sc.add(x + 0.9 + k * 0.25, y + 2.1, () => { A.crate(x + 0.85 + k * 0.25, y + 2.0, 0.24); A.sack(x + 1.0 + k * 0.25, y + 2.2); return 0; });
      if (T('granaries')) sc.add(x + 0.3, y + 1.4, () => granary(x + 0.3, y + 1.4));
      return sc.run();
    }
    if (band === 2) { // a staked store-yard round a timber hoard hall
      sc.add(x, y, () => stakes([[x + 0.05, y + 2.3], [x + 0.05, y + 0.05], [x + 1.9, y + 0.05]], 12, { skulls: true }));
      sc.add(x + 0.95, y + 0.9, () => longhall(x + 0.25, y + 0.25, 1.35, 1.25, 15 + (L - 10), m, { axis: 'y' }));
      sc.add(x + 0.3, y + 1.85, () => wagon(x + 0.2, y + 1.65, true));
      if (T('granaries')) sc.add(x + 1.65, y + 0.35, () => granary(x + 1.65, y + 0.35));
      return sc.run();
    }
    // band 3: a black-stone treasure vault behind braziers
    sc.add(x + 0.95, y + 0.95, () => {
      const b = stoneBlock(x + 0.2, y + 0.2, 1.5, 1.45, 0, 20 + (L - 15), m, { door: true });
      bigDoor(b, 0.75, 0.5, 12);
      if (!A.GLOW) { for (const v of [3, 6.5]) A.line(A.onL(b, 0.52, 0.98, v, v)[0], A.onL(b, 0.52, 0.98, v, v)[1], '#8a8a90', 1); }
      const zt = A.hip(b, 16, m === 'obs' ? '#2a2228' : '#3e302c', 0.08);
      spikeTop(b, 4.5);
      const ap = A.P(b.x + b.w / 2, b.y + b.d / 2, zt); horns(ap[0], ap[1] + 2, 1.1); A.skull(ap[0], ap[1] + 1, 1);
      return zt + 6;
    });
    sc.add(x + 0.3, y + 2.0, () => wagon(x + 0.12, y + 1.85, true));
    sc.add(x + 1.15, y + 2.05, () => { heap(x + 1.15, y + 2.05, 8, '#8a6a44', ['#e0b440', '#f0d070', '#c9a46a']); A.lampDot(...A.P(x + 1.12, y + 2.03, 4), 1, '#fff0a0', '#ffe080'); return 6; });
    sc.add(x + 0.25, y + 1.8, () => brazier(x + 0.2, y + 1.75, 0, 0.9));
    sc.add(x + 1.6, y + 1.75, () => brazier(x + 1.55, y + 1.75, 0, 0.9));
    if (T('granaries')) sc.add(x + 1.75, y + 0.3, () => granary(x + 1.75, y + 0.3));
    return sc.run();
  });
  function granary(gx, gy) { // a round wicker grain basket on stilts under a hide cap
    for (const [dx, dy] of [[-0.12, 0.12], [0.12, 0.12], [0.12, -0.12]]) A.line(A.P(gx + dx, gy + dy), A.P(gx + dx, gy + dy, 5), WOOD_D, 1.2);
    A.cyl(gx, gy, 0.2, 5, 12, '#b8935a');
    const [ex, ey, rx, ry] = A.ell(gx, gy, 5, 0.2);
    if (!A.GLOW) for (let v = 2; v < 12; v += 2.2) arc(ex, ey - v, rx, ry, 0.1, Math.PI - 0.1, '#8a6a3a', 0.6);
    return A.cone(gx, gy, 0.26, 17, 8, roofHide()) + 2;
  }

  def('market', ([x, y, w, d], L, band) => {
    const sc = scene(), n = Math.min(4, 2 + band + (L % 5 >= 3 ? 1 : 0));
    sc.add(x, y, () => { rug(x + 0.25, y + 0.3, 0.75, 0.55, RED); rug(x + 1.35, y + 0.3, 0.6, 0.5, '#6d4c8d'); if (band >= 1) rug(x + 0.3, y + 1.4, 0.65, 0.6, '#b98c5f'); return 0; });
    const spots = [[x + 0.2, y + 0.15], [x + 1.35, y + 0.15], [x + 0.2, y + 1.3], [x + 1.15, y + 1.85]];
    for (let k = 0; k < n; k++) sc.add(spots[k][0] + 0.3, spots[k][1] + 0.16, () => { A.stall(spots[k][0], spots[k][1], A.STY.cloth[k % 4], 'hide'); return 16; });
    if (band >= 2) { // a great striped pavilion tent in the middle
      sc.add(x + 1.2, y + 1.15, () => {
        const cx = x + 1.2, cy = y + 1.15, r = 0.48 + band * 0.05;
        const base = band >= 3 ? (era() >= 3 ? OBS : BASALT) : null;
        if (base) A.cyl(cx, cy, r + 0.12, 0, 3, base);
        const z0 = base ? 3 : 0;
        A.cyl(cx, cy, r, z0, 9, FELT);
        const [ex, ey, rx, ry] = A.ell(cx, cy, z0, r);
        A.lamp([[ex - 3, ey + ry * 0.98], [ex + 3, ey + ry * 0.98], [ex + 3, ey + ry * 0.98 - 8], [ex - 3, ey + ry * 0.98 - 8]], '#2a1e18', '#ffb050');
        const zt = A.cone(cx, cy, r * 1.15, z0 + 9, 22 + (band - 2) * 6, RED);

        const ap = A.P(cx, cy, zt);
        if (!A.GLOW) for (const t of [0.2, 0.4, 0.6, 0.8]) { const a = t * Math.PI; const p = [ex + rx * 1.15 * Math.cos(a), ey - 9 + ry * 1.15 * Math.sin(a)]; A.poly([ap, [p[0] - 2.5, p[1]], [p[0] + 2.5, p[1]]], '#e6d2a8', null); }
        for (const t of [0.1, 0.5, 0.9]) { const a = t * Math.PI; const p = [ex + rx * 1.15 * Math.cos(a), ey - 9 + ry * 1.15 * Math.sin(a)]; A.line(p, [p[0], p[1] + 3], GOLD, 1); }
        A.line(ap, [ap[0], ap[1] - 8], WOOD_D, 1.2); A.circ(ap[0], ap[1] - 8, 1.4, GOLD);
        A.rec('flags', { x: ap[0], y: ap[1] - 7, col: A.STY.flag, len: 9, seed: A.R() });
        return zt + 10;
      });
    } else sc.add(x + 1.25, y + 1.1, () => skullPole(x + 1.25, y + 1.1, 26 + L, 1));
    if (L >= 3) sc.add(x + 0.5, y + 2.15, () => { A.animal(x + 0.55, y + 2.15, 'horse', 1); A.line(A.P(x + 0.15, y + 2.2), A.P(x + 0.15, y + 2.2, 9), WOOD_D, 1.2); return 0; });
    if (band >= 3) sc.add(x + 0.12, y + 0.12, () => totem(x + 0.1, y + 0.12, 40, 1));
    if (band >= 3) { sc.add(x + 0.15, y + 1.05, () => brazier(x + 0.12, y + 1.05, 0, 0.9)); sc.add(x + 1.95, y + 1.05, () => brazier(x + 1.95, y + 1.0, 0, 0.9)); }
    return sc.run() + 4;
  });

  def('academy', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band), base = ringBase();
    const tH = 28 + band * 6 + L;
    sc.add(x + 1.9, y + 0.45, () => { const h = totem(x + 1.95, y + 0.45, tH, 1); const [sx, sy] = A.P(x + 1.95, y + 0.45, tH + 6); A.rec('sparks', { x: sx, y: sy, kind: 'star' }); return h; });
    const lx = x + (band >= 3 ? 1.0 : 0.85), ly = y + (band >= 3 ? 1.0 : 0.85);
    if (band === 0) sc.add(x + 0.9, y + 0.9, () => boneTent(x + 0.9, y + 0.9, 0.55, 26 + L, { skull: true }));
    else sc.add(lx, ly, () => { // the shamans' lodge, antlers on its crown
      const t = yurt(lx, ly, 0.62, 12 + band, { base, straps: 2, smoke: true, roof: band >= 2 ? '#6e4a36' : null });
      const ap = A.P(lx, ly, t - 2);
      for (const s of [-1, 1]) { A.line(ap, [ap[0] + s * 7, ap[1] - 8], '#d8c8a0', 1.3); A.line([ap[0] + s * 4, ap[1] - 4.5], [ap[0] + s * 8, ap[1] - 4], '#d8c8a0', 1); A.line([ap[0] + s * 6, ap[1] - 6.5], [ap[0] + s * 5, ap[1] - 11], '#d8c8a0', 1); }
      return t + 8;
    });
    if (band >= 2) { // a ring of rune stones glowing with ember script
      sc.add(lx - 0.7, ly - 0.7, () => { stones(lx, ly, 0.8, 7, 11 + band * 2, 1, band >= 3 ? 4 : -1); return 0; });
      sc.add(lx + 0.75, ly + 0.75, () => { stones(lx, ly, 0.8, 7, 11 + band * 2, 2); return 0; });
    }
    if (band >= 3) sc.add(x + 0.3, y + 0.3, () => { // a basalt star-tower with a bone orrery
      const cx = x + 0.3, cy = y + 0.3, col = era() >= 3 ? OBS : BASALT_L, H = 34 + L;
      A.cyl(cx, cy, 0.28, 0, H, col);
      const [ex, ey, rx] = A.ell(cx, cy, 0, 0.28);
      for (let v = 10; v < H - 4; v += 10) A.lamp([[ex - 1, ey - v], [ex + 1, ey - v], [ex + 1, ey - v - 5], [ex - 1, ey - v - 5]], '#1a1414', '#ffa040');
      A.cyl(cx, cy, 0.36, H, 2, BASALT);
      const [ox, oy] = A.P(cx, cy, H + 12);
      arc(ox, oy, 9, 3.5, 0, A.TAU, BONE, 0.9); arc(ox, oy, 6, 7, 0.4, A.TAU + 0.4, BONE, 0.7);
      A.lampDot(ox, oy, 2.4, '#d06020', '#ffd070'); A.lampDot(ox + 9, oy, 1.2, '#e6dac0', '#ffffff');
      A.line(A.P(cx, cy, H + 2), [ox, oy], WOOD_D, 1);
      A.rec('sparks', { x: ox, y: oy, kind: 'star' }); A.rec('lights', { x: ox, y: oy, r: 26 });
      void rx;
      return H + 22;
    });
    if (T('cartography')) sc.add(x + 0.3, y + 1.75, () => { // a war-map painted on a stretched hide
      const a = A.P(x + 0.15, y + 1.8), b = A.P(x + 0.75, y + 1.8);
      A.line(a, [a[0], a[1] - 15], WOOD_D, 1.2); A.line(b, [b[0], b[1] - 15], WOOD_D, 1.2);
      A.poly([[a[0] + 1, a[1] - 14], [b[0] - 1, b[1] - 14], [b[0] - 1, b[1] - 5], [a[0] + 1, a[1] - 5]], '#d8bf90');
      if (!A.GLOW) { A.line([a[0] + 3, a[1] - 11], [b[0] - 4, b[1] - 8], RED, 0.8); A.line([a[0] + 6, a[1] - 7], [b[0] - 3, b[1] - 12], '#4a3a2a', 0.6); A.circ(b[0] - 4, b[1] - 8, 1, RED); }
      return 16;
    });
    if (T('medicine')) sc.add(x + 1.2, y + 1.8, () => { meatRack(x + 1.05, y + 1.8, true); return 12; });
    return sc.run();
  });
  // a clay bloomery furnace: a squat truncated cone with a glowing mouth
  function furnace(gx, gy, r, h, col = CLAY, z = 0) {
    const [x, y, rx, ry] = A.ell(gx, gy, z, r), c = A.c;
    c.beginPath(); c.moveTo(x - rx, y); c.lineTo(x - rx * 0.42, y - h); c.lineTo(x + rx * 0.42, y - h); c.lineTo(x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.closePath();
    A.gradFill(x - rx, x + rx, col);
    c.beginPath(); c.ellipse(x, y - h, rx * 0.42, ry * 0.42, 0, 0, A.TAU); c.fillStyle = A.GLOW ? '#ff9a3a' : '#5a2a1a'; c.fill();
    const mx = x - rx * 0.2, my = y + ry * 0.9;
    A.lamp([[mx - 3, my], [mx + 3, my], [mx + 2.4, my - 4], [mx, my - 5.5], [mx - 2.4, my - 4]], '#e8742a', '#ffb04a');
    A.rec('fires', { x: mx, y: my - 1, s: 0.4, glowOnly: true });
    A.rec('smoke', { x, y: y - h - 1, kind: 'smelter', seed: A.R(), dark: true });
    A.rec('lights', { x, y: y - h, r: 20 });
    return z + h + 2;
  }
  function bellowsBag(gx, gy) { // a hide bellows with a stick handle
    const [x, y] = A.P(gx, gy), c = A.c;
    c.beginPath(); c.ellipse(x, y - 3, 5, 3, -0.2, 0, A.TAU); c.fillStyle = A.F('#8a5a38'); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke();
    A.line([x + 4, y - 3], [x + 9, y - 1], WOOD_D, 1.2); A.line([x - 3, y - 5], [x - 6, y - 10], WOOD_D, 1);
  }
  def('smelter', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band);
    sc.add(x + 0.5, y + 0.45, () => { heap(x + 0.5, y + 0.45, 9, '#6a5a52', ['#a0522d', '#5a524c']); return 4; });
    sc.add(x + 0.4, y + 2.15, () => { heap(x + 0.4, y + 2.15, 7, '#2a2624', ['#3a3430']); return 3; });
    if (band >= 3) sc.add(x + 1.7, y + 0.4, () => { // a black-stone smelting stack banded with ember slits
      const H = 52 + (L - 15) * 2, col = era() >= 3 ? OBS : BASALT_L;
      const b = stoneBlock(x + 1.45, y + 0.15, 0.6, 0.6, 0, H, m, { slits: false });
      for (let v = 8; v < H - 4; v += 9) { A.lamp(A.onL(b, 0.1, 0.5, v, v + 1.2), '#7a2a1a', '#ff7a2a'); }
      A.box(x + 1.4, y + 0.1, 0.7, 0.7, H, 3, A.shade(col, -0.2));
      smoke(x + 1.75, y + 0.45, H + 4, 'smelter', true);
      return H + 6;
    });
    const nF = band === 0 ? 1 : band === 1 ? 2 : band === 2 ? 2 : 2;
    const fs = [[x + 1.15, y + 1.0], [x + 1.75, y + 1.55], [x + 0.6, y + 1.5]];
    for (let k = 0; k < nF; k++) {
      const [gx, gy] = band >= 3 && k === 0 ? fs[2] : fs[k];
      if (band === 2 && k === 0) sc.add(gx, gy, () => { // a stone furnace with a tapering flue
        const col = m === 'timber' ? '#7a6a62' : wallOf(m);
        const b = A.box(gx - 0.35, gy - 0.35, 0.7, 0.7, 0, 14, col); if (!A.GLOW) A.courses(b, 4, A.shade(col, -0.2));
        A.lamp(A.onL(b, 0.2, 0.5, 1, 7), '#e8742a', '#ffb04a'); A.rec('fires', { x: A.onL(b, 0.35, 0.35, 3, 3)[0][0], y: A.onL(b, 0.35, 0.35, 3, 3)[0][1], s: 0.5, glowOnly: true });
        const p = A.poly; const zb = 14, zt = 36 + (L - 10) * 2;
        p([A.P(gx + 0.25, gy - 0.25, zb), A.P(gx + 0.25, gy + 0.25, zb), A.P(gx + 0.12, gy + 0.12, zt), A.P(gx + 0.12, gy - 0.12, zt)], A.shade(col, -0.25));
        p([A.P(gx - 0.25, gy + 0.25, zb), A.P(gx + 0.25, gy + 0.25, zb), A.P(gx + 0.12, gy + 0.12, zt), A.P(gx - 0.12, gy + 0.12, zt)], col);
        smoke(gx, gy, zt + 2, 'smelter', true); A.rec('lights', { x: A.P(gx, gy, 8)[0], y: A.P(gx, gy, 8)[1], r: 26 });
        return zt + 2;
      });
      else sc.add(gx, gy, () => furnace(gx, gy, 0.38 + band * 0.03, 16 + band * 3 + (k ? 0 : L % 5), band >= 3 ? '#7a4a3a' : CLAY));
    }
    if (band >= 1) sc.add(x + 1.3, y + 0.45, () => { // a hide awning on bone posts over the workers
      const p = [[x + 0.9, y + 0.25], [x + 1.6, y + 0.25], [x + 1.6, y + 0.65], [x + 0.9, y + 0.65]];
      if (band >= 3) return 0;
      for (const [gx, gy] of p) A.line(A.P(gx, gy), A.P(gx, gy, gy > y + 0.5 ? 13 : 16), BONE, 1.4);
      A.poly([A.P(p[0][0], p[0][1], 16), A.P(p[1][0], p[1][1], 16), A.P(p[2][0], p[2][1], 13), A.P(p[3][0], p[3][1], 13)], roofHide());
      return 18;
    });
    sc.add(x + 0.85, y + 1.85, () => { bellowsBag(x + 0.85, y + 1.8); if (T('bellows')) bellowsBag(x + 1.4, y + 2.1); return 6; });
    if (T('metallurgy') || band >= 2) sc.add(x + 1.3, y + 2.2, () => { // molten run-off into ingot moulds
      const a = A.P(x + 1.0, y + 1.75, 0.3), b = A.P(x + 1.6, y + 2.25, 0.3);
      A.c.beginPath(); A.c.moveTo(a[0], a[1]); A.c.lineTo(b[0], b[1]); A.c.strokeStyle = A.GLOW ? '#ffb04a' : '#d0581a'; A.c.lineWidth = 1.6; A.c.stroke();
      for (let k = 0; k < 3; k++) { const p = A.P(x + 1.65 + k * 0.12, y + 2.3, 0.3); A.lampDot(p[0], p[1], 1.2, '#c0501a', '#ffc060'); }
      A.rec('lights', { x: b[0], y: b[1], r: 16 });
      return 2;
    });
    return sc.run();
  });

  def('smithy', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band);
    if (band >= 2) sc.add(x + 0.9, y + 0.7, () => {
      if (band === 2) return longhall(x + 0.2, y + 0.2, 1.5, 1.05, 14 + (L - 10), m, { axis: 'x', smoke: 'smithy' });
      const b = stoneBlock(x + 0.2, y + 0.2, 1.5, 1.05, 0, 18 + (L - 15), m, { door: true }); bigDoor(b, 0.75, 0.36, 11);
      const ch = A.box(x + 0.35, y + 0.3, 0.32, 0.32, 18 + (L - 15), 22, A.shade(wallOf(m), -0.1)); void ch;
      smoke(x + 0.51, y + 0.46, 42 + (L - 15), 'smithy', true);
      spikeTop(b, 3.5);
      return 44 + (L - 15);
    });
    else sc.add(x + 0.6, y + 0.6, () => yurt(x + 0.6, y + 0.6, 0.45 + band * 0.06, 10 + band * 2, { base: ringBase(), smoke: band === 1, straps: band + 1 }));
    if (band === 1) { // a second work station: grindstone and a staked yard behind
      sc.add(x, y, () => stakes([[x + 0.05, y + 1.4], [x + 0.05, y + 0.05], [x + 1.3, y + 0.05]], 11, { skulls: true }));
      sc.add(x + 1.95, y + 0.45, () => { const [gx, gy] = [x + 1.95, y + 0.45]; A.box(gx - 0.15, gy - 0.08, 0.3, 0.16, 0, 4, WOOD); const [wx, wy] = A.P(gx, gy + 0.08, 8); A.circ(wx, wy, 4.5, '#a8a29a', A.OUT); A.circ(wx, wy, 1, WOOD_D); A.line([wx, wy], [wx + 6, wy - 3], WOOD_D, 1); return 13; });
    }
    // the open forge: a hide canopy on horn-tipped bone posts over a stone hearth
    const fx = x + (band >= 2 ? 0.9 : 1.15), fy = y + (band >= 2 ? 1.45 : 1.0), fw = 1.1, fd = 0.75;
    sc.add(fx + fw / 2, fy + fd / 2, () => {
      const posts = [[fx, fy], [fx + fw, fy], [fx + fw, fy + fd], [fx, fy + fd]];
      for (const [gx, gy] of posts.slice(0, 2)) A.line(A.P(gx, gy), A.P(gx, gy, 15), BONE, 1.6);
      const hb = A.box(fx + 0.1, fy + 0.1, 0.45, 0.4, 0, 6, era() >= 2 ? BASALT : '#6a625c'); void hb;
      const [hx, hy] = A.P(fx + 0.32, fy + 0.3, 6); A.lampDot(hx, hy, 2.4, '#e8742a', '#ffb04a'); A.rec('fires', { x: hx, y: hy, s: 0.55 }); A.rec('lights', { x: hx, y: hy - 3, r: 28 });
      if (T('bellows')) bellowsBag(fx + 0.05, fy + 0.55);
      const [ax, ay] = A.P(fx + 0.8, fy + 0.5);
      A.poly([[ax - 3, ay], [ax + 3, ay], [ax + 1.5, ay - 3], [ax + 4, ay - 4.5], [ax - 4, ay - 4.5], [ax - 1.5, ay - 3]], '#3a3a40');
      A.rec('anvils', { x: ax, y: ay - 5 });
      for (const [gx, gy] of posts.slice(2)) A.line(A.P(gx, gy), A.P(gx, gy, 12), BONE, 1.6);
      A.poly([A.P(fx - 0.06, fy - 0.06, 15), A.P(fx + fw + 0.06, fy - 0.06, 15), A.P(fx + fw + 0.06, fy + fd + 0.06, 12), A.P(fx - 0.06, fy + fd + 0.06, 12)], roofHide());
      for (const [gx, gy, z] of [[fx - 0.06, fy + fd + 0.06, 12], [fx + fw + 0.06, fy + fd + 0.06, 12]]) { const p = A.P(gx, gy, z); curve(p, [p[0] - 3, p[1] - 1], [p[0] - 3, p[1] - 5], BONE, 1.1); }
      return 16;
    });
    sc.add(x + 0.35, y + 2.0, () => { spearRack(x + 0.25, y + 1.6, 2 + Math.min(3, L % 5 + band)); return 18; });
    sc.add(x + 0.95, y + 2.2, () => { A.barrel(x + 0.95, y + 2.2); return 0; });   // quench barrel
    if (T('metallurgy')) sc.add(x + 1.4, y + 2.25, () => { for (let k = 0; k < 3; k++) A.box(x + 1.3 + k * 0.08, y + 2.15, 0.25, 0.1, k * 2, 2, '#9aa0a8'); return 6; });
    return sc.run();
  });

  def('armory', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band);
    if (band === 0) sc.add(x + 0.85, y + 0.75, () => ridgeTent(x + 0.25, y + 0.3, 1.2, 0.85, 16, { red: true }));
    else if (band === 1) sc.add(x + 0.9, y + 0.8, () => ridgeTent(x + 0.2, y + 0.25, 1.5, 1.0, 19, { red: true }));
    else sc.add(x + 0.9, y + 0.85, () => {
      const top = band === 2 ? longhall(x + 0.2, y + 0.25, 1.5, 1.1, 15 + (L - 10), m, { axis: 'x', spikes: true }) : (() => { const b = stoneBlock(x + 0.2, y + 0.25, 1.5, 1.1, 0, 20 + (L - 15), m, { door: true }); bigDoor(b, 0.75, 0.36, 11); spikeTop(b, 5); const t = stoneBlock(x + 0.3, y + 0.3, 0.45, 0.45, 20 + (L - 15), 14, m); spikeTop(t, 4); return 40 + (L - 15); })();
      // round shields hung along the hall's flank
      const z = band === 2 ? 11 : 15; shields(x + 0.3, y + 1.38, 7, true, z);
      return top;
    });
    if (band < 2) sc.add(x + 0.4, y + 1.35, () => { shields(x + 0.3, y + 1.3, 3 + band * 2 + Math.min(2, L % 5), true, 3); return 6; });
    if (band === 1) { // a second store tent and a shield wall on a rail
      sc.add(x + 1.85, y + 1.35, () => ridgeTent(x + 1.5, y + 1.25, 0.6, 0.5, 11, {}));
      sc.add(x + 0.1, y + 0.1, () => { const a = A.P(x + 0.1, y + 0.15), b = A.P(x + 0.1, y + 1.05); A.line([a[0], a[1] - 7], [b[0], b[1] - 7], WOOD_D, 1.3); shields(x + 0.1, y + 0.2, 5, false, 6); return 10; });
    }
    sc.add(x + 1.95, y + 0.6, () => { spearRack(x + 1.95, y + 0.35, 4 + band); return 18; });
    sc.add(x + 0.5, y + 1.95, () => { // armour stands with horned helms
      for (let k = 0; k < 1 + band; k++) { const [px, py] = A.P(x + 0.4 + k * 0.32, y + 1.95); A.line([px, py], [px, py - 13], WOOD_D, 1.1); A.poly([[px - 3, py - 11], [px + 3, py - 11], [px + 2.4, py - 4], [px - 2.4, py - 4]], era() >= 2 ? '#7a7a80' : '#8a5a38'); A.circ(px, py - 13, 2, '#7a7a80', A.OUT); horns(px, py - 13.5, 0.4); }
      return 16;
    });
    if (T('fortification') || band >= 3) sc.add(x + 1.2, y + 2.15, () => { // spiked barricade
      for (let k = 0; k < 3; k++) { const gx = x + 0.95 + k * 0.28, gy = y + 2.15; A.line(A.P(gx - 0.12, gy - 0.1, 0), A.P(gx + 0.12, gy + 0.1, 10), WOOD, 1.4); A.line(A.P(gx + 0.12, gy - 0.1, 0), A.P(gx - 0.12, gy + 0.1, 10), WOOD, 1.4); }
      A.line(A.P(x + 0.95, y + 2.15, 5), A.P(x + 1.55, y + 2.15, 5), WOOD_D, 1.4);
      return 10;
    });
    return sc.run();
  });

  def('warpit', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2 + 0.05, r = 0.88 + band * 0.04, dep = 10 + band * 3, m = matOf(band);
    const { P, ell } = A, c = A.c;
    let top = 30 + band * 4;
    // back half first: stands, drum platform, the chieftain's seat
    if (band >= 2) { // tiered stands curving round the back of the pit
      for (let k = 2; k >= 0; k--) {
        const rr = r + 0.3 + k * 0.17, z = 3 + k * 4;
        const [ex, ey, rx, ry] = ell(cx, cy, z, rr);
        c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, Math.PI, A.TAU); c.lineTo(ex + rx, ey + z); c.ellipse(ex, ey + z, rx, ry, 0, A.TAU, Math.PI, true); c.closePath();
        c.fillStyle = A.F(band >= 3 ? A.shade(wallOf(m), 0.05 * k) : A.shade('#6a4a32', 0.06 * k)); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke();
        if (!A.GLOW) for (let j = 0; j < 9; j++) { const a = Math.PI + (j + 0.5) / 9 * Math.PI; A.circ(ex + rx * Math.cos(a), ey + ry * Math.sin(a) - 2.5, 1.5, ['#f0c8a0', '#b97f55', '#d9a57a'][(j + k) % 3]); }
      }
      // the chieftain's seat under a horned canopy at the back
      const [sx, sy] = P(cx - 0.75, cy - 0.75, 16);
      A.poly([[sx - 6, sy + 4], [sx + 6, sy + 4], [sx + 6, sy - 6], [sx - 6, sy - 6]], band >= 3 ? wallOf(m) : WOOD);
      A.poly([[sx - 8, sy - 6], [sx + 8, sy - 6], [sx, sy - 14]], RED); horns(sx, sy - 13, 1.2); A.skull(sx, sy - 12, 1.1);
      top = Math.max(top, 46);
    } else {
      // back stakes
      ringStakes(cx, cy, r + 0.15, false, band);
    }
    if (band >= 1) { // the war drum platform at the back corner
      const gx = x + 0.3, gy = y + 0.3;
      A.box(gx - 0.2, gy - 0.2, 0.45, 0.45, 0, 5, WOOD); drum(gx, gy, 5, 0.17, 6);
    }
    // the pit
    const [ex, ey, rx, ry] = ell(cx, cy, 0, r);
    c.save(); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, A.TAU); c.clip();
    c.fillStyle = A.F(band >= 3 ? '#3a3230' : '#4a3a30'); c.fill();
    for (let k = 1; k < 3; k++) { c.beginPath(); c.ellipse(ex, ey + k * dep / 3, rx * (1 - k * 0.06), ry * (1 - k * 0.06), 0, Math.PI, A.TAU); c.strokeStyle = A.F(band >= 3 ? '#5a5250' : '#6a5444'); c.lineWidth = 1.5; c.stroke(); }
    c.beginPath(); c.ellipse(ex, ey + dep, rx * 0.82, ry * 0.82, 0, 0, A.TAU); c.fillStyle = A.F(A.SNOW ? '#d8d4cc' : '#c9a878'); c.fill();
    if (!A.GLOW) { c.beginPath(); c.ellipse(ex + 4, ey + dep + 1, 3, 1.2, 0, 0, A.TAU); c.fillStyle = '#7a2a1a'; c.fill(); }
    c.restore();
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, A.TAU); stroke('#2a1e18', 1.4);
    A.rec('pit', { x: ex, y: ey + dep, rx: rx * 0.6, ry: ry * 0.6 });
    // front rim: stakes (early) or a black-stone arena wall with spikes (band 3)
    if (band >= 3) {
      const col = wallOf(m);
      const [wx, wy, wrx, wry] = ell(cx, cy, 0, r + 0.08), hgt = 7;
      c.beginPath(); c.ellipse(wx, wy, wrx, wry, 0, 0, Math.PI); c.lineTo(wx - wrx, wy - hgt); c.ellipse(wx, wy - hgt, wrx, wry, 0, Math.PI, 0, true); c.closePath();
      A.gradFill(wx - wrx, wx + wrx, col);
      for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI, px = wx + wrx * Math.cos(a), py = wy + wry * Math.sin(a) - hgt; A.poly([[px - 1.4, py], [px + 1.4, py], [px, py - 5]], m === 'obs' ? OBS : BONE); }
      if (m === 'obs') glints((u, v) => [wx - wrx + u * 2 * wrx, wy + wry * 0.6 - v * hgt], 6);
    } else ringStakes(cx, cy, r + 0.15, true, band);
    // braziers/torches on the rim, skull standards
    const nb = band >= 3 ? 4 : 2;
    const ang = band >= 3 ? [0.15, 1.45, 3.0, 4.6] : [0.25, 3.4];
    const pts = ang.slice(0, nb).map(a => [cx + Math.cos(a) * (r + 0.42), cy + Math.sin(a) * (r + 0.42)]).sort((p, q) => p[0] + p[1] - q[0] - q[1]);
    for (const [gx, gy] of pts) { if (band >= 2) brazier(gx, gy, 0, 1, band >= 3); else { const [bx, by] = P(gx, gy); A.line([bx, by], [bx, by - 10], WOOD_D, 1.6); A.rec('fires', { x: bx, y: by - 11, s: 0.7 }); A.rec('lights', { x: bx, y: by - 13, r: 22 }); } }
    if (band >= 1 && L % 5 >= 2) skullPole(x + w - 0.15, y + 0.2, 30, 2);
    hornBanner(x + 0.12, y + d - 0.12, 26 + band * 4);
    return top;
  });
  function ringStakes(cx, cy, r, frontHalf, band) {
    const { P, line } = A;
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * A.TAU, f = Math.cos(a) + Math.sin(a) > 0;
      if (f !== frontHalf) continue;
      const gx = cx + Math.cos(a) * r, gy = cy + Math.sin(a) * r, b = P(gx, gy), t = P(gx, gy, 11 + (k % 3) * 2 + band);
      line(b, t, k % 4 === 0 ? BONE : '#4a3426', 2); if (k % 5 === 0) A.skull(t[0], t[1] - 1, 0.8);
    }
    if (!A.GLOW) { const [ex, ey, rx, ry] = A.ell(cx, cy, 7, r); arc(ex, ey, rx, ry, frontHalf ? 0 : Math.PI, frontHalf ? Math.PI : A.TAU, '#c9a874', 0.7); }
  }

  def('barracks', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band);
    if (band <= 1) { // a war-camp of ridge tents round a fire
      const nt = band === 0 ? 2 + Math.min(1, Math.floor(L / 3)) : 3 + Math.min(1, Math.floor((L - 5) / 3));
      const spots = [[x + 0.15, y + 0.15], [x + 1.15, y + 0.15], [x + 2.1, y + 0.15], [x + 0.15, y + 1.0]];
      for (let k = 0; k < nt; k++) sc.add(spots[k][0] + 0.4, spots[k][1] + 0.3, () => ridgeTent(spots[k][0], spots[k][1], 0.8, 0.6, 11 + band * 2, { red: k % 2 === 0 }));
      if (band === 1) sc.add(x, y, () => stakes([[x + 0.03, y + 2.4], [x + 0.03, y + 0.03], [x + 2.95, y + 0.03]], 13, { skulls: true }));
      if (band === 1) sc.add(x + 1.6, y + 1.1, () => ridgeTent(x + 1.1, y + 0.95, 1.4, 0.7, 15, { red: true }));
      sc.add(x + 1.2, y + 1.9, () => { A.firePit(x + 1.2, y + 1.9, 0.75); return 0; });
    } else if (band === 2) {
      sc.add(x + 2.5, y + 0.4, () => stakeTower(x + 2.25, y + 0.1, 0.55, 34 + (L - 10) * 2, { brazier: era() >= 2 }));
      sc.add(x + 1.15, y + 0.7, () => longhall(x + 0.15, y + 0.2, 2.0, 1.0, 14 + (L - 10), m, { axis: 'x', smoke: 'hall', spikes: true }));
      sc.add(x + 0.55, y + 1.65, () => ridgeTent(x + 0.15, y + 1.35, 0.8, 0.6, 13, { red: true }));
    } else {
      sc.add(x + 2.5, y + 0.4, () => { const t = stoneBlock(x + 2.25, y + 0.1, 0.6, 0.6, 0, 44 + L, m); spikeTop(t, 4); return brazier(x + 2.55, y + 0.4, 44 + L, 1, false); });
      sc.add(x + 1.2, y + 0.75, () => { const b = stoneBlock(x + 0.15, y + 0.2, 2.0, 1.1, 0, 20 + (L - 15), m, { door: true }); bigDoor(b, 1.0, 0.4, 12); spikeTop(b, 4.5); brazier(x + 0.35, y + 1.15, b.h, 0.7, false); brazier(x + 2.0, y + 1.15, b.h, 0.7, false); return b.h + 10; });
    }
    // training ground: straw dummies wearing skulls
    for (let k = 0; k < 2 + band; k++) { const gx = x + 0.45 + k * 0.48, gy = y + 2.2; if (gx < x + w - 0.45) sc.add(gx, gy, () => { dummy(gx, gy); return 14; }); }
    sc.add(x + 0.15, y + 2.45, () => hornBanner(x + 0.15, y + 2.45, 28 + band * 3));
    return sc.run();
  });

  def('stable', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band), wolves = Math.min(5, 1 + Math.floor(L / 4));
    // the kennel: a hide den, a timber kennel hall, or a stone kennel with glowing eyes in the dark
    if (band <= 1) sc.add(x + 0.6, y + 0.6, () => { const t = boneTent(x + 0.6, y + 0.6, 0.45 + band * 0.08, 18 + band * 4, { skull: true }); if (band === 1) yurt(x + 0.5, y + 1.55, 0.32, 8, {}); return t; });
    else sc.add(x + 0.7, y + 1.0, () => {
      const top = band === 2 ? longhall(x + 0.15, y + 0.2, 1.1, 1.7, 11 + (L - 10) * 0.5, m, { axis: 'y', rk: 9 }) : (() => { const b = stoneBlock(x + 0.15, y + 0.2, 1.1, 1.7, 0, 15, m, { slits: false }); for (const u of [0.4, 1.0, 1.5]) { const q = A.onR(b, u - 0.17, u + 0.17, 0, 6), tp = A.onR(b, u, u, 9, 9)[0]; A.poly([q[0], q[1], q[2], tp, q[3]], '#120e0c', null); const e = A.onR(b, u, u, 3.5, 3.5)[0]; A.lampDot(e[0] - 1.3, e[1], 0.6, '#c09030', '#ffd040'); A.lampDot(e[0] + 1.3, e[1], 0.6, '#c09030', '#ffd040'); } spikeTop(b, 4); brazier(x + 0.3, y + 1.85, 15, 0.7, false); return A.hip(b, 10, m === 'obs' ? '#2a2228' : '#3e302c', 0.06); })();
      return top;
    });
    // the pen of lashed timber, wolves inside
    const px0 = x + 1.4, py0 = y + 0.2, px1 = x + w - 0.1, py1 = y + d - 0.3;
    sc.add(px0, py0, () => { lashFence([[px0, py1], [px0, py0], [px1, py0]], 7); return 0; });
    const spots = [[x + 1.9, y + 0.75, 1], [x + 2.2, y + 1.5, -1], [x + 1.75, y + 1.35, -1], [x + 2.35, y + 0.9, 1], [x + 1.95, y + 1.9, 1]];
    for (let k = 0; k < wolves; k++) sc.add(spots[k][0], spots[k][1], () => { A.animal(spots[k][0], spots[k][1], 'wolf', spots[k][2]); return 0; });
    sc.add(x + 1.65, y + 1.95, () => { heap(x + 1.65, y + 2.0, 5, BONE, ['#d8c8a8', '#ece2c8']); A.skull(...A.P(x + 1.65, y + 2.0, 3), 0.7); return 3; });
    sc.add(px1, py1, () => { lashFence([[px0, py1], [px1, py1], [px1, py0]], 7); return 8; });
    if (band >= 1) sc.add(x + 0.3, y + 2.3, () => meatRack(x + 0.1, y + 2.3, true) || 12);
    if (band >= 2) sc.add(x + 1.4, y + 0.15, () => hornBanner(x + 1.4, y + 0.15, 30, '#8d8d94'));   // a wolf-pelt standard
    return sc.run();
  });

  def('farm', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band), base = ringBase();
    if (band <= 1) sc.add(x + 0.7, y + 0.7, () => yurt(x + 0.7, y + 0.7, 0.45 + band * 0.07, 9 + band * 2, { base, smoke: true }));
    else if (band === 2) sc.add(x + 0.75, y + 0.7, () => longhall(x + 0.15, y + 0.25, 1.25, 0.9, 11 + (L - 10) * 0.5, m, { axis: 'x', rk: 11 }));
    else sc.add(x + 0.75, y + 0.65, () => { // stone granary drum beside a stone barn
      const b = stoneBlock(x + 0.15, y + 0.25, 1.15, 0.85, 0, 13, m, { door: true }); bigDoor(b, 0.55, 0.32, 9, false);
      return A.gable(b, 9, m === 'obs' ? '#2e262c' : '#4a3a34', 'x', 'thatch', 0.1);
    });
    if (band >= 1 || L >= 3) sc.add(x + 1.55, y + 0.4, () => { meatRack(x + 1.3, y + 0.35, true); return 12; });
    // a pen of lashed timber with goats (and boars once the herd grows)
    const fx0 = x + 0.2, fy0 = y + 1.3, fx1 = x + 1.5, fy1 = y + 2.15;
    sc.add(fx0, fy0, () => { lashFence([[fx0, fy1], [fx0, fy0], [fx1, fy0]], 6); return 0; });
    const nA = Math.min(4, 1 + Math.floor(L / 5));
    const an = [[x + 0.55, y + 1.65, 'goat', 1], [x + 1.05, y + 1.85, band >= 1 ? 'boar' : 'goat', -1], [x + 0.75, y + 1.95, 'goat', -1], [x + 1.2, y + 1.55, 'boar', 1]];
    for (let k = 0; k < nA; k++) sc.add(an[k][0], an[k][1], () => { A.animal(an[k][0], an[k][1], an[k][2], an[k][3]); return 0; });
    sc.add(fx1, fy1, () => { lashFence([[fx0, fy1], [fx1, fy1], [fx1, fy0]], 6); return 7; });
    if (T('irrigation')) sc.add(x + 1.65, y + 1.75, () => { // a shaduf lifting water into a trough
      const [wx, wy] = A.P(x + 1.6, y + 1.8); const c = A.c; c.beginPath(); c.ellipse(wx, wy, 5, 2.4, 0, 0, A.TAU); c.fillStyle = A.F(A.SNOW ? '#cfe2ee' : '#4f8fb8'); c.fill(); c.strokeStyle = A.F(BASALT); c.lineWidth = 1.4; c.stroke();
      const p = A.P(x + 1.8, y + 1.7); A.line(p, [p[0], p[1] - 14], WOOD_D, 1.3); A.line([p[0] - 9, p[1] - 6], [p[0] + 6, p[1] - 18], WOOD, 1.2); A.line([p[0] - 9, p[1] - 6], [p[0] - 9, p[1] - 1], '#3a2a20', 0.6);
      return 18;
    });
    if (band >= 3 || T('granaries')) sc.add(x + 1.75, y + 1.2, () => { if (band >= 3) { A.cyl(x + 1.75, y + 1.2, 0.26, 0, 18, era() >= 3 ? OBS : BASALT_L); return A.cone(x + 1.75, y + 1.2, 0.32, 18, 10, roofHide()) + 2; } return 0; });
    return sc.run();
  });

  def('lumber', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band);
    sc.add(x + 0.25, y + 0.25, () => { A.treePine(x + 0.2, y + 0.2, 0.8); return 0; });
    sc.add(x + 2.3, y + 0.4, () => { A.treePine(x + 2.35, y + 0.35, 0.7); return 0; });
    if (band <= 1) sc.add(x + 0.85, y + 0.8, () => { // a hide lean-to on crooked poles
      const x0 = x + 0.35, y0 = y + 0.45, ww = 1.1 + band * 0.3, dd = 0.7 + band * 0.15;
      for (const [gx, gy] of [[x0, y0], [x0 + ww, y0]]) A.line(A.P(gx, gy), A.P(gx, gy, 14), WOOD_D, 1.5);
      A.poly([A.P(x0, y0, 14), A.P(x0 + ww, y0, 14), A.P(x0 + ww, y0 + dd, 2), A.P(x0, y0 + dd, 2)], roofHide());
      if (!A.GLOW) A.line(A.P(x0, y0 + dd * 0.5, 8), A.P(x0 + ww, y0 + dd * 0.5, 8), RED, 1.1);
      return 16;
    });
    else if (band === 2) sc.add(x + 0.85, y + 0.85, () => longhall(x + 0.35, y + 0.4, 1.1, 1.0, 12 + (L - 10) * 0.5, m, { axis: 'y', rk: 10 }));
    else sc.add(x + 0.85, y + 0.85, () => { const b = stoneBlock(x + 0.35, y + 0.4, 1.1, 1.0, 0, 13, m, { door: true }); bigDoor(b, 0.55, 0.3, 9, false); return A.gable(b, 12, roofHide(), 'y', 'thatch', 0.12); });
    const piles = Math.min(4, 1 + Math.floor(L / 5));
    const ps = [[x + 0.2, y + 1.7], [x + 1.2, y + 1.7], [x + 0.2, y + 2.4], [x + 1.2, y + 2.4]];
    for (let k = 0; k < piles; k++) sc.add(ps[k][0] + 0.4, ps[k][1] + 0.2, () => { A.logPile(ps[k][0], ps[k][1], 0.85, k > 1 ? 2 : 3); return 12; });
    for (const [sx, sy] of [[0.15, 1.3], [0.9, 3.1], [0.5, 3.2], [1.95, 1.3]].slice(0, 2 + band)) sc.add(x + sx, y + sy, () => { A.stump(x + sx, y + sy); return 3; });
    sc.add(x + 1.85, y + 0.95, () => { // chopping block, axe in it
      const bx0 = x + 1.85, by0 = y + 0.95, [bx, by] = A.P(bx0, by0);
      A.cyl(bx0, by0, 0.13, 0, 4, '#7a5434', '#c9a874'); A.line([bx, by - 4], [bx + 4, by - 10], WOOD, 1.2); A.poly([[bx + 3, by - 11], [bx + 6.5, by - 10], [bx + 5, by - 7.5]], '#c8ccd2', null);
      return 10;
    });
    if (band >= 1) sc.add(x + 2.1, y + 1.55, () => { // a timber drying frame of lashed poles
      const g = [x + 1.9, y + 1.4]; for (const dy of [0, 0.5]) A.line(A.P(g[0], g[1] + dy), A.P(g[0], g[1] + dy, 16), WOOD_D, 1.3);
      A.line(A.P(g[0], g[1], 15), A.P(g[0], g[1] + 0.5, 15), WOOD_D, 1.2); for (let k = 0; k < 4; k++) A.line(A.P(g[0] - 0.05, g[1] + 0.06 + k * 0.12, 15), A.P(g[0] + 0.25, g[1] + 0.06 + k * 0.12, 1), '#9a6a3c', 1.4);
      return 17;
    });
    if (band >= 1) sc.add(x + 1.85, y + 2.0, () => { // sled for dragging trunks with a horned prow
      const g = [x + 1.6, y + 1.95]; A.box(g[0], g[1], 0.6, 0.3, 0, 2, WOOD); A.log(g[0] - 0.05, g[0] + 0.65, g[1] + 0.15, 4.2, 2);
      const p = A.P(g[0] + 0.65, g[1] + 0.15, 2); curve(p, [p[0] + 3, p[1] - 1], [p[0] + 4, p[1] - 6], BONE, 1.3);
      return 7;
    });
    if (band >= 3) sc.add(x + 1.95, y + 2.75, () => { // a log hoist
      const a = A.P(x + 1.7, y + 2.6), b = A.P(x + 2.2, y + 2.6), t = A.P(x + 1.95, y + 2.6, 34);
      A.line(a, t, WOOD_D, 1.8); A.line(b, t, WOOD_D, 1.8); A.line(t, [t[0] - 16, t[1] + 6], WOOD, 1.4); A.line([t[0] - 16, t[1] + 6], [t[0] - 16, t[1] + 20], '#3a2a20', 0.6);
      A.log(x + 1.4, x + 1.9, y + 2.4, 8, 1.8);
      return 36;
    });
    if (band >= 2) sc.add(x + 0.15, y + 3.2, () => brazier(x + 0.15, y + 3.2, 0, 0.8, era() >= 2));
    return sc.run();
  });

  def('quarry', (slot, L, band) => {
    const [x, y, w, d] = slot;
    let top = A.BLD.quarry(slot, L, band);   // the dug pit itself (terrain), then the horde's works round it
    const sc = scene();
    sc.add(x + 0.1, y + 0.1, () => skullPole(x + 0.1, y + 0.12, 24 + band * 3, band >= 2 ? 1 : 0));
    if (band >= 1) sc.add(x + 0.1, y + d - 0.15, () => { A.firePit(x + 0.2, y + d - 0.2, 0.55); return 0; });
    if (band >= 2) sc.add(x + w - 0.5, y + 0.3, () => { // overseer's lookout with a war drum
      const t = stakeTower(x + w - 0.75, y + 0.05, 0.5, 26 + band * 4, { brazier: band >= 3 });
      return t;
    });
    if (band >= 3) sc.add(x + 0.6, y + d - 0.5, () => { // dressed blocks of black stone / obsidian waiting to haul
      for (let k = 0; k < 3; k++) { const b = A.box(x + 0.35 + k * 0.38, y + d - 0.65, 0.3, 0.3, 0, 7, era() >= 3 ? OBS : BASALT); if (era() >= 3) glints((u, v) => A.onL(b, u * 0.3, u * 0.3, v * 7, v * 7)[0], 2); }
      return 8;
    });
    if (band >= 1) sc.add(x + 0.3, y + d * 0.5, () => hornBanner(x + 0.08, y + d * 0.55, 26));
    return Math.max(top, sc.run());
  });

  def('mine', (slot, L, band) => {
    const [x, y, w, d] = slot;
    const top = A.BLD.mine(slot, L, band);   // the shaft mouth in the hill, then the horde's marks
    const mx = x + w * 0.35, my = y + d - 0.05, sc = scene();
    sc.add(mx - 0.45, my - 0.1, () => skullPole(mx - 0.45, my - 0.1, 22 + band * 3, band >= 1 ? 1 : 0));
    if (band >= 1) sc.add(mx + 0.55, my - 0.1, () => brazier(mx + 0.55, my - 0.15, 0, 0.8, band >= 2));
    if (band >= 3) sc.add(mx - 0.75, my - 0.2, () => { // black-stone gate pillars
      for (const gx of [mx - 0.75]) { const b = stoneBlock(gx - 0.1, my - 0.3, 0.2, 0.2, 0, 26, matOf(3), { slits: false }); void b; brazier(gx, my - 0.2, 26, 0.7, false); }
      return 34;
    });
    if (band >= 2) sc.add(x + w * 0.75, y + d - 0.4, () => { A.box(x + w * 0.7, y + d - 0.5, 0.35, 0.25, 2, 4, WOOD); for (const u of [0.05, 0.3]) { const [cx, cy] = A.P(x + w * 0.7 + u, y + d - 0.25, 2); A.circ(cx, cy, 2, '#5a4030', A.OUT); } heap(x + w * 0.88, y + d - 0.38, 4, '#5a4a44', ['#a0522d', '#7a6a62']); return 8; });
    return Math.max(top, sc.run());
  });
  // siege engines: a skull-capped ram under a hide roof, and a bone-armed catapult
  function ram(gx, gy, done) {
    A.box(gx, gy, 1.0, 0.45, 3, 2, WOOD);
    for (const [wx, wy] of [[gx + 0.15, gy + 0.45], [gx + 0.85, gy + 0.45]]) { const [cx, cy] = A.P(wx, wy, 3); A.circ(cx, cy, 3.2, '#6a4a30', A.OUT); A.circ(cx, cy, 1, WOOD_D); }
    if (done > 0.3) for (const u of [0.1, 0.9]) { A.line(A.P(gx + u, gy + 0.05, 5), A.P(gx + u, gy + 0.22, 15), WOOD, 1.3); A.line(A.P(gx + u, gy + 0.4, 5), A.P(gx + u, gy + 0.22, 15), WOOD, 1.3); }
    if (done > 0.5) { A.log(gx - 0.25, gx + 1.15, gy + 0.22, 9, 2); const h = A.P(gx + 1.17, gy + 0.22, 9); horns(h[0], h[1] - 1, 0.6); A.skull(h[0], h[1], 0.9); }
    if (done > 0.8) A.poly([A.P(gx, gy + 0.05, 6), A.P(gx + 1.0, gy + 0.05, 6), A.P(gx + 1.0, gy + 0.22, 17), A.P(gx, gy + 0.22, 17)], roofHide());
  }
  function catapult(gx, gy, done, big) {
    const s = big ? 1.5 : 1;
    A.box(gx, gy, 0.8 * s, 0.55, 3, 2.5, WOOD);
    for (const wx of [gx + 0.12, gx + 0.8 * s - 0.12]) { const [cx, cy] = A.P(wx, gy + 0.55, 3); A.circ(cx, cy, 3, '#6a4a30', A.OUT); A.circ(cx, cy, 1, WOOD_D); }
    if (done > 0.3) { A.line(A.P(gx + 0.3 * s, gy + 0.1, 5), A.P(gx + 0.4 * s, gy + 0.28, 16 * s), WOOD, 1.4); A.line(A.P(gx + 0.5 * s, gy + 0.48, 5), A.P(gx + 0.4 * s, gy + 0.28, 16 * s), WOOD, 1.4); }
    if (done > 0.6) { const a = A.P(gx + 0.8 * s, gy + 0.28, 6), b = A.P(gx + 0.15, gy + 0.28, 19 * s); A.line(a, b, BONE, 1.8); A.circ(b[0], b[1] - 1, 2.4, BASALT, A.OUT); if (big) A.box(gx + 0.6 * s, gy + 0.15, 0.25, 0.25, 5, 7, BASALT); }
  }
  def('workshop', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band);
    if (band <= 1) sc.add(x + 0.7, y + 0.4, () => { // hide lean-to on bone poles
      const x0 = x + 0.1, y0 = y + 0.1, ww = 1.25, dd = 0.75;
      for (const [gx, gy] of [[x0, y0], [x0 + ww, y0]]) A.line(A.P(gx, gy), A.P(gx, gy, 15), BONE, 1.5);
      A.poly([A.P(x0, y0, 15), A.P(x0 + ww, y0, 15), A.P(x0 + ww, y0 + dd, 4), A.P(x0, y0 + dd, 4)], roofHide());
      A.box(x0 + 0.2, y0 + 0.2, 0.6, 0.25, 0, 5, '#9a7046');
      return 17;
    });
    else sc.add(x + 0.7, y + 0.5, () => band === 2 ? longhall(x + 0.1, y + 0.1, 1.3, 0.8, 12 + (L - 10) * 0.5, m, { axis: 'x', rk: 11 }) : (() => { const b = stoneBlock(x + 0.1, y + 0.1, 1.3, 0.8, 0, 15, m, { door: true }); bigDoor(b, 0.65, 0.4, 10); spikeTop(b, 4); return 20; })());
    sc.add(x + 1.95, y + 0.4, () => { A.logPile(x + 1.55, y + 0.15, 0.95, 2 + Math.min(1, band)); return 10; });
    const done = 0.35 + 0.65 * Math.min(1, (L % 5 + 1) / 4 + (band ? 0.5 : 0));
    sc.add(x + 0.6, y + d - 0.4, () => { ram(x + 0.2, y + d - 0.6, done); return 18; });
    if (band >= 1) sc.add(x + w - 0.6, y + d - 0.5, () => { catapult(x + w - (band >= 3 ? 1.3 : 0.95), y + d - 0.75, band >= 1 ? 1 : done, band >= 3); return 26; });
    sc.add(x + 1.4, y + 0.15, () => skullPole(x + 1.45, y + 0.12, 22));
    return sc.run();
  });

  def('tavern', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band);
    if (band === 0) sc.add(x + 0.72, y + 0.75, () => boneTent(x + 0.72, y + 0.75, 0.58, 28 + L, { skull: true }));
    else if (band === 1) sc.add(x + 0.7, y + 0.8, () => { A.c.save(); const t = ridgeTentY(x + 0.15, y + 0.15, 1.1, 1.35, 17); A.c.restore(); return t; });
    else sc.add(x + 0.72, y + 0.85, () => longhall(x + 0.12, y + 0.15, 1.2, 1.4, 15 + (L - 10) * 0.6, m, { axis: 'y', smoke: 'hall', door: 0.6 }));
    // the drinking-horn sign
    sc.add(x + w - 0.08, y + 1.0, () => { const p = A.P(x + w - 0.05, y + 1.0, 14 + band * 2); A.line(p, [p[0], p[1] + 14 + band * 2], WOOD_D, 1.2); A.line(p, [p[0] + 6, p[1] - 1], WOOD_D, 1); curve([p[0] + 3, p[1] + 2], [p[0] + 11, p[1] + 6], [p[0] + 12, p[1] - 3], band >= 3 ? GOLD : BONE, 2.6); return 18 + band * 2; });
    // the spit roast over the fire, log benches
    sc.add(x + 0.72, y + 2.1, () => {
      if (band >= 3) { brazier(x + 0.2, y + 2.35, 0, 0.8); }
      A.firePit(x + 0.72, y + 2.05, 0.75);
      const [rx, ry] = A.P(x + 0.72, y + 2.05);
      A.line([rx - 7, ry], [rx - 7, ry - 10], WOOD_D, 1); A.line([rx + 7, ry], [rx + 7, ry - 10], WOOD_D, 1); A.line([rx - 8, ry - 9], [rx + 8, ry - 9], WOOD_D, 1.2);
      const c = A.c; c.beginPath(); c.ellipse(rx, ry - 9, 4, 2.2, 0, 0, A.TAU); c.fillStyle = A.F('#8a4a2a'); c.fill();
      return 10;
    });
    if (band >= 1) sc.add(x + 0.3, y + 1.75, () => { A.log(x + 0.05, x + 0.5, y + 1.75, 2, 1.8); A.barrel(x + 1.2, y + 2.35); return 4; });
    if (band >= 2) sc.add(x + 0.15, y + 2.4, () => hornBanner(x + 0.1, y + 2.42, 26));
    return sc.run();
  });
  function ridgeTentY(x, y, w, d, h) { // ridge tent with the ridge along y (gable to the front-left)
    const { P, poly, lamp, shade, line } = A, col = roofHide(), xm = x + w / 2;
    poly([P(x, y, 0), P(x, y + d, 0), P(xm, y + d, h), P(xm, y, h)], shade(col, -0.3));
    poly([P(x, y + d, 0), P(x + w, y + d, 0), P(xm, y + d, h)], shade(col, -0.05));
    lamp([P(xm - w * 0.18, y + d, 0), P(xm + w * 0.18, y + d, 0), P(xm, y + d, h * 0.6)], '#2a1e18', '#ffa848');
    poly([P(x + w, y + d, 0), P(x + w, y, 0), P(xm, y, h), P(xm, y + d, h)], shade(col, -0.14));
    if (!A.GLOW) { for (let u = 0.25; u < d; u += 0.3) line(P(x + w, y + u, 0.5), P(xm, y + u, h - 0.5), shade(col, -0.3), 0.5); line(P(x + w * 0.8, y, h * 0.4), P(x + w * 0.8, y + d, h * 0.4), RED, 1.3); }
    line(P(xm, y - 0.06, h), P(xm, y + d + 0.06, h), WOOD_D, 1.2);
    const t = P(xm, y + d + 0.04, h); horns(t[0], t[1], 0.7);
    smoke(xm, y + d * 0.4, h, 'hall');
    return h + 6;
  }

  def('temple', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, sc = scene(), m = matOf(band);
    if (band === 0) { // a ring of bones round a fire altar, a skull totem behind
      sc.add(cx - 0.4, cy - 0.4, () => totem(cx - 0.4, cy - 0.4, 30 + L * 2, 1));
      sc.add(cx, cy, () => { for (let k = 0; k < 10; k++) { const a = k / 10 * A.TAU; const [bx, by] = A.P(cx + Math.cos(a) * 0.72, cy + Math.sin(a) * 0.72); A.line([bx, by], [bx + 1, by - 7], BONE, 1.6); } A.box(cx - 0.18, cy - 0.15, 0.36, 0.3, 0, 4, BASALT_L); fire(cx, cy + 0.0, 4, 0.9, 30); return 14; });
      return sc.run();
    }
    if (band === 1) { // standing stones with skulls round a fire altar
      sc.add(cx - 0.6, cy - 0.6, () => { stones(cx, cy, 0.75, 8, 14, 1); return 0; }); sc.add(cx + 0.6, cy + 0.6, () => { stones(cx, cy, 0.75, 8, 14, 2); return 0; });
      sc.add(cx - 0.45, cy - 0.45, () => totem(cx - 0.42, cy - 0.42, 36 + L, 1));
      sc.add(cx + 0.05, cy + 0.05, () => { A.box(cx - 0.22, cy - 0.2, 0.44, 0.4, 0, 6, BASALT_L); A.skull(...A.P(cx, cy + 0.2, 3.5), 0.9); fire(cx, cy, 6, 1.1, 34); return 18; });
      return sc.run();
    }
    // bands 2-3: a stepped altar-mound of black stone crowned with an eternal flame
    const tiers = band === 2 ? 2 : 3, s0 = 0.82;
    let z = 0;
    sc.add(cx, cy, () => {
      for (let k = 0; k < tiers; k++) {
        const s = s0 - k * 0.22, hh = 6 + (band >= 3 ? 2 : 0);
        const b = stoneBlock(cx - s, cy - s, 2 * s, 2 * s, z, hh, m === 'timber' ? 'stone' : m, { slits: false });
        if (k === 0) { const p = A.onL(b, s - 0.15, s + 0.15, 0, hh); A.poly(p, A.shade(b.col, -0.25), null); }   // steps up the front
        z += hh;
      }
      const fz = band >= 3 ? brazier(cx, cy, z, 1.6, false) : brazier(cx, cy, z, 1.3, false);
      fire(cx, cy, z + 10, 1.4 + band * 0.2, 40);
      const [hx, hy] = A.P(cx, cy, z + 6); void hx; void hy;
      return fz + 14;
    });
    // pylons (obsidian at the Legend era) with braziers at the corners
    const corners = [[x + 0.18, y + 0.18], [x + w - 0.18, y + 0.18], [x + 0.18, y + d - 0.18], [x + w - 0.18, y + d - 0.18]];
    for (const [gx, gy] of corners) {
      if (band === 2 && (gx > cx) === (gy > cy)) continue;
      sc.add(gx, gy, () => { if (band >= 3) { const b = stoneBlock(gx - 0.09, gy - 0.09, 0.18, 0.18, 0, 22, m, { slits: false }); void b; return brazier(gx, gy, 22, 0.8, false); } return totem(gx, gy, 30, 0.8); });
    }
    if (T('medicine')) sc.add(x + 0.3, y + d - 0.4, () => { meatRack(x + 0.15, y + d - 0.4, true); return 12; });
    return sc.run();
  });

  def('theatre', ([x, y, w, d], L, band) => {
    const sc = scene(), m = matOf(band), cx = x + w / 2, cy = y + d / 2 + 0.05;
    if (band >= 2) sc.add(x + 0.2, y + 0.1, () => { // stands at the back: timber, then black-stone tiers
      for (let k = 2; k >= 0; k--) { const b = A.box(x + 0.15 + k * 0.0, y + 0.08, w - 0.3, 0.22, 0, 4 + (2 - k) * 0, band >= 3 ? wallOf(m) : '#6a4a32'); void b; }
      const b1 = A.box(x + 0.15, y + 0.05, w - 0.3, 0.2, 0, 9, band >= 3 ? A.shade(wallOf(m), -0.05) : '#5a3e2a');
      const b2 = A.box(x + 0.15, y + 0.25, w - 0.3, 0.18, 0, 5, band >= 3 ? wallOf(m) : '#6a4a32');
      if (!A.GLOW) for (let j = 0; j < 10; j++) { const u = 0.1 + j * (w - 0.5) / 9; A.circ(...A.P(x + 0.15 + u, y + 0.15, 11.5), 1.5, ['#f0c8a0', '#b97f55', '#d9a57a'][j % 3]); A.circ(...A.P(x + 0.15 + u, y + 0.34, 7.5), 1.5, ['#d9a57a', '#f0c8a0', '#b97f55'][j % 3]); }
      void b1; void b2;
      return 14;
    });
    // the dance ring
    sc.add(cx, cy, () => {
      const [ex, ey, rx, ry] = A.ell(cx, cy, 0, 0.5); const c = A.c;
      c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, A.TAU); c.fillStyle = A.F(A.SNOW ? '#e0dcd4' : '#c9a878'); c.fill();
      if (band >= 3) { c.strokeStyle = A.F(wallOf(m)); c.lineWidth = 2.5; c.stroke(); } else ringStakes(cx, cy, 0.56, false, 0);
      A.firePit(cx, cy, 0.55);
      const [fx, fy] = A.P(cx, cy);
      A.person(fx - 8, fy + 1, RED, 0.9); A.person(fx + 8, fy, '#6d4c8d', 0.9);
      A.line([fx - 6, fy - 4], [fx - 3, fy - 9], '#c8ccd2', 0.9); A.line([fx + 6, fy - 4], [fx + 3, fy - 9], '#c8ccd2', 0.9);
      if (band < 3) ringStakes(cx, cy, 0.56, true, 0);
      return 14;
    });
    // audience round the ring
    const aud = Math.min(10, 3 + L);
    sc.add(x + 0.2, y + d - 0.15, () => { for (let i = 0; i < aud; i++) { const u = (i + 0.5) / aud; const [px, py] = A.P(x + 0.15 + u * (w - 0.3), y + d - 0.12 - (i % 2) * 0.1); A.person(px, py, A.STY.cloth[i % 4], 0.75); } return 10; });
    // war drums on either side
    if (band >= 1) { sc.add(x + 0.2, y + 0.6, () => drum(x + 0.22, y + 0.65, 0, 0.13, 7)); sc.add(x + w - 0.25, y + 0.6, () => drum(x + w - 0.25, y + 0.65, 0, 0.13, 7)); }
    if (band >= 3) { // a horned arch over the ring
      sc.add(cx, y + 0.5, () => { const a = A.P(cx - 0.7, y + 0.5), b = A.P(cx + 0.7, y + 0.5), t = A.P(cx, y + 0.5, 34); curve(a, [a[0] - 4, t[1]], t, BONE, 3); curve(b, [b[0] + 4, t[1]], t, BONE, 3); A.skull(t[0], t[1] + 1, 1.3); horns(t[0], t[1], 1.1); return 38; });
      sc.add(x + 0.15, y + d - 0.2, () => brazier(x + 0.12, y + d - 0.2, 0, 0.8)); sc.add(x + w - 0.15, y + d - 0.2, () => brazier(x + w - 0.12, y + d - 0.2, 0, 0.8));
    } else sc.add(x + w - 0.12, y + 0.15, () => hornBanner(x + w - 0.12, y + 0.15, 24 + band * 4));
    return sc.run();
  });

  def('magetower', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, H = 40 + band * 10 + Math.min(20, L), m = matOf(band);
    let orbZ, top;
    if (band <= 1) { // a fire-shaman's totem over a bone pyre
      totem(cx - 0.3, cy - 0.3, H * 0.85, 1.1);
      for (let r2 = 0; r2 < 3; r2++) A.log(cx - 0.4, cx + 0.4, cy + 0.2 - r2 * 0.05, 3 + r2 * 4, 2);
      for (let k = 0; k < 6; k++) { const a = k / 6 * A.TAU; const [bx, by] = A.P(cx + Math.cos(a) * 0.55, cy + Math.sin(a) * 0.55); curve([bx, by], [bx + 4, by - 8], [bx + Math.cos(a) * 3, by - 14], BONE, 1.8); }
      fire(cx, cy + 0.1, 14, 1.2 + band * 0.2, 30); orbZ = 30 + band * 6; top = H * 0.85 + 10;
    } else { // a tapering pylon of basalt (obsidian veined with fire at the Legend era)
      const col = wallOf(m === 'timber' ? 'stone' : m), s0 = 0.36, s1 = 0.16, h = H * 0.8;
      A.box(cx - 0.45, cy - 0.45, 0.9, 0.9, 0, 4, BASALT);
      A.poly([A.P(cx + s0, cy - s0, 4), A.P(cx + s0, cy + s0, 4), A.P(cx + s1, cy + s1, h), A.P(cx + s1, cy - s1, h)], A.shade(col, -0.22));
      A.poly([A.P(cx - s0, cy + s0, 4), A.P(cx + s0, cy + s0, 4), A.P(cx + s1, cy + s1, h), A.P(cx - s1, cy + s1, h)], col);
      // ember veins / runes
      for (let v = 10; v < h - 6; v += 9) { const t = v / h, sx = s0 + (s1 - s0) * t; A.lamp([A.P(cx - sx * 0.3, cy + sx, v), A.P(cx + sx * 0.3, cy + sx, v), A.P(cx + sx * 0.3, cy + sx, v + 4), A.P(cx - sx * 0.3, cy + sx, v + 4)], '#7a2a1a', '#ff8a3a'); }
      if (m === 'obs') glints((u, v) => A.P(cx - s0 + u * s0 * 2, cy + s0, 6 + v * h * 0.8), 6);
      // bone buttresses
      for (const [px, py] of [[cx - s0, cy + s0], [cx + s0, cy + s0], [cx + s0, cy - s0]]) { const a = A.P(px, py, H * 0.3), g = A.P(px + (px - cx) * 0.4, py + (py - cy) * 0.4); A.line(a, g, BONE, 2); }
      const z = brazier(cx, cy, h, 1.3, false);
      fire(cx, cy, h + 10, 1.3, 34);
      if (band >= 3) { // a crown of obsidian horns curling round the flame, rune-stones hanging in the air
        const t = A.P(cx, cy, h);
        for (const s2 of [-1, 1]) { curve([t[0] + s2 * 4, t[1] + 1], [t[0] + s2 * 13, t[1] - 4], [t[0] + s2 * 7, t[1] - 18], m === 'obs' ? '#3a3040' : BONE, 2.6); }
        for (let k = 0; k < 3; k++) { const a = k / 3 * A.TAU + 0.6, p = A.P(cx + Math.cos(a) * 0.5, cy + Math.sin(a) * 0.5, h - 10 - k * 6); A.poly([[p[0], p[1] - 4], [p[0] + 2.2, p[1]], [p[0], p[1] + 4], [p[0] - 2.2, p[1]]], OBS); A.lampDot(p[0], p[1], 0.9, '#c0501a', '#ffb050'); }
      }
      orbZ = z + 12 + band * 3; top = orbZ + 10;
    }
    const orb = A.P(cx, cy, orbZ);
    A.lampDot(orb[0], orb[1], 2.4 + band * 0.4, '#ffb070', '#fff0c0');
    A.rec('magic', { x: orb[0], y: orb[1], r: 9 + band * 3 + Math.min(6, L / 3), n: 3 + band * 2 + Math.floor(L / 5), col: 'rgba(255,140,60,A)', seed: A.R(), bolt: false });
    A.rec('lights', { x: orb[0], y: orb[1], r: 30 + band * 8 });
    return top;
  });

  // ---- spare-plot buildings: scale to the plot they are dealt ----
  def('hideout', ([x, y, w, d], L, band) => {
    const s = Math.min(1.8, Math.min(w, d) / 1.3), cx = x + w * 0.45, cy = y + d * 0.45, sc = scene(), m = matOf(band);
    if (w > 1.6) sc.add(x + 0.1, y + 0.1, () => stakes([[x + 0.1, y + d - 0.3], [x + 0.1, y + 0.1], [x + w - 0.3, y + 0.1]], 9 + band * 2, { skulls: true }));
    sc.add(cx, cy, () => { // an earth mound with a burrow mouth (a stone-framed trapdoor later)
      const [ex, ey, rx, ry] = A.ell(cx, cy, 0, 0.45 * s), c = A.c;
      c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, Math.PI); c.ellipse(ex, ey, rx, Math.max(ry, 10 * s), 0, Math.PI, A.TAU); c.closePath();
      A.gradFill(ex - rx, ex + rx, A.SNOW ? '#e6eaec' : '#6a5a3e');
      if (band <= 1) { // a low dark tent dug into the mound
        A.poly([[ex - 7 * s, ey + 2], [ex + 4 * s, ey + 3], [ex - 1 * s, ey - 9 * s]], '#3a2e28');
        A.lamp([[ex - 3 * s, ey + 2.5], [ex + 1 * s, ey + 2.7], [ex - 1 * s, ey - 3 * s]], '#120e0c', '#d07030');
      } else {
        const fc = m === 'obs' ? OBS : m === 'stone' ? BASALT : WOOD;
        A.poly([[ex - 6 * s, ey + 3], [ex + 4 * s, ey + 3], [ex + 4 * s, ey - 6 * s], [ex - 6 * s, ey - 6 * s]], fc);
        A.lamp([[ex - 4.5 * s, ey + 3], [ex + 2.5 * s, ey + 3], [ex + 2.5 * s, ey - 4 * s], [ex - 1 * s, ey - 5.5 * s], [ex - 4.5 * s, ey - 4 * s]], '#120e0c', '#d07030');
      }
      if (!A.GLOW) for (let k = 0; k < 4; k++) A.circ(ex - rx * 0.6 + k * rx * 0.4, ey - 4 * s - (k % 2) * 3, 1.3, '#4a5a2e');   // brush over the roof
      A.skull(ex + 6 * s, ey - 4 * s, 0.7);
      return 12 * s;
    });
    sc.add(cx + 0.35 * s, cy + 0.35 * s, () => { const [lx, ly] = A.P(cx + 0.35 * s, cy + 0.35 * s); A.line([lx, ly], [lx, ly - 12], WOOD_D, 1.1); A.line([lx, ly - 12], [lx + 3, ly - 12], WOOD_D, 1); A.skull(lx + 3, ly - 9.5, 0.65); A.lampDot(lx + 3, ly - 9.5, 0.9, '#7a3a1a', '#ff9a40'); A.rec('lights', { x: lx + 3, y: ly - 9.5, r: 12 }); return 14; });
    if (band >= 1 && w > 1.6) sc.add(x + w * 0.85, y + d * 0.2, () => stakeTower(x + w * 0.75, y + d * 0.1, 0.4, 22 + band * 4));
    if (band >= 3) sc.add(cx - 0.3 * s, cy + 0.35 * s, () => { A.rec('birds', { x: A.P(cx, cy, 30)[0], y: A.P(cx, cy, 30)[1], r: 14, n: 2, seed: A.R() }); return 0; });
    return sc.run();
  });

  def('shrine', ([x, y, w, d], L, band) => {
    const s = Math.min(2, Math.min(w, d) / 1.2), cx = x + w / 2, cy = y + d / 2, sc = scene(), m = matOf(band);
    if (s > 1.4) { // a big plot: a ring of tusk arches and skull poles round the cairn
      for (let k = 0; k < 6; k++) { const a = k / 6 * A.TAU + 0.5, gx = cx + Math.cos(a) * 0.42 * s, gy = cy + Math.sin(a) * 0.42 * s; sc.add(gx, gy, () => { const [bx, by] = A.P(gx, gy); curve([bx - 3, by], [bx - 4, by - 10], [bx + 1, by - 13], BONE, 1.8); curve([bx + 3, by], [bx + 4, by - 10], [bx - 1, by - 13], BONE, 1.8); return 14; }); }
      sc.add(cx - 0.55 * s, cy + 0.5 * s, () => skullPole(cx - 0.55 * s, cy + 0.5 * s, 22 + band * 3, 1));
      sc.add(cx + 0.5 * s, cy - 0.55 * s, () => skullPole(cx + 0.5 * s, cy - 0.55 * s, 22 + band * 3, 1));
    }
    if (band >= 2) sc.add(cx - 0.3 * s, cy - 0.3 * s, () => totem(cx - 0.32 * s, cy - 0.32 * s, 24 + band * 4, 0.8));
    sc.add(cx, cy, () => { // a cairn of stones topped by a horned skull, an offering fire before it
      if (band >= 3) { const b = stoneBlock(cx - 0.12, cy - 0.12, 0.24, 0.24, 0, 26 + L * 0.5, m, { slits: false }); A.lamp(A.onL(b, 0.08, 0.16, 8, 18), '#7a2a1a', '#ff8a3a'); const p = A.P(cx, cy, 26 + L * 0.5); A.poly([[p[0] - 3, p[1] + 1.5], [p[0] + 3, p[1] + 1.5], [p[0], p[1] - 6]], wallOf(m)); horns(p[0], p[1] - 3, 0.9); return 34 + L * 0.5; }
      const [x0, y0] = A.P(cx, cy), n = 4 + band * 3, k0 = Math.min(1.5, s * 0.9);
      for (let k = 0; k < n; k++) { const row = k < 4 ? 0 : k < 7 ? 1 : 2, off = row === 0 ? k : row === 1 ? k - 4 : 0; A.circ(x0 + (-6 + off * 4 + row * 2) * k0, y0 + (-2 - row * 3.4) * k0, 2.6 * k0, k % 2 ? BASALT_L : '#8a827a', A.OUT); }
      const top = Math.min(2, Math.ceil(n / 4)) * 3.4 * k0;
      horns(x0, y0 - 5 - top, 0.9 * k0); A.skull(x0, y0 - 4 - top, 1.1 * k0);
      return 14 + band * 3;
    });
    if (band >= 1) sc.add(cx + 0.1, cy + 0.3 * s, () => { // bone arch over the offering
      const a = A.P(cx - 0.3 * s, cy + 0.3 * s), b = A.P(cx + 0.3 * s, cy + 0.3 * s), t = A.P(cx, cy + 0.3 * s, 20);
      curve(a, [a[0] - 2, t[1]], t, BONE, 2); curve(b, [b[0] + 2, t[1]], t, BONE, 2);
      return 20;
    });
    sc.add(cx + 0.25 * s, cy + 0.42 * s, () => { if (band >= 2) brazier(cx + 0.3 * s, cy + 0.42 * s, 0, 0.7, true); else A.firePit(cx + 0.28 * s, cy + 0.42 * s, 0.45); return 6; });
    return sc.run();
  });

  def('harbor', ([x, y, w, d], L, band, ctx) => { // inland: a river landing of hide coracles and a raft
    if (ctx && ctx.coastal) return L > 0 ? shoreHarbor(L, band, ctx) : undefined;   // the shore works (below); a plot still unbuilt keeps cityview's stakes
    const s = Math.min(1.3, Math.min(w, d) / 2), sc = scene();
    sc.add(x + w * 0.5, y + d * 0.5, () => { const b = A.box(x + w * 0.2, y + d * 0.3, w * 0.55, d * 0.35, 0, 2, WOOD); if (!A.GLOW) for (let u = 0.1; u < b.w; u += 0.12) A.line(A.P(b.x + u, b.y + b.d, 2), A.P(b.x + u, b.y, 2), WOOD_D, 0.5); return 3; });
    for (let k = 0; k < 1 + band; k++) sc.add(x + 0.3 + k * 0.4 * s, y + d * 0.8, () => { const [px, py] = A.P(x + 0.3 + k * 0.45 * s, y + d * 0.82); const c = A.c; c.beginPath(); c.ellipse(px, py - 2, 5 * s, 2.6 * s, 0, 0, Math.PI); c.lineTo(px - 5 * s, py - 2); c.closePath(); c.fillStyle = A.F('#7a5236'); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke(); A.line([px - 4 * s, py - 2], [px + 4 * s, py - 2], BONE, 0.8); return 4; });
    sc.add(x + w * 0.85, y + d * 0.25, () => skullPole(x + w * 0.85, y + d * 0.25, 22));
    return sc.run();
  });

  def('generic', ([x, y, w, d], L, band) => {
    const r = Math.min(w, d) * 0.3, sc = scene();
    sc.add(x + w * 0.45, y + d * 0.45, () => band >= 2 ? longhall(x + 0.15, y + 0.15, Math.min(w - 0.3, 1.6), Math.min(d - 0.3, 1.2), 13 + band * 2, matOf(band), {}) : yurt(x + w * 0.45, y + d * 0.45, r, 9 + band * 2, { base: ringBase(), smoke: true }));
    return sc.run();
  });

  // the town wall, one piece at a time: stakes → staked earthwork → stone below stakes → black stone with braziers
  // cityview draws the wall piece just past a gatehouse / postern / the back corner tower AFTER that tower, so the
  // piece would paint over it: trim those pieces back to the tower's face (the tower stands in the gap)
  const GSIDE = {};
  function wallCut(fp, ctx, band) {
    let a = ctx.a; const b = ctx.b, key = (ctx.city && ctx.city.id) + ctx.side, kind = wallKind(band), near = (v, t) => Math.abs(v - t) < 0.01;
    const gCut = kind === 'stake' ? 0 : kind === 'bank' ? 13.22 : 13.34, pCut = kind === 'stake' || kind === 'bank' ? 0 : 12.66;
    if (near(a, 12.7)) { GSIDE[key] = 1; if (gCut) a = gCut; }
    else if (near(a, 12.38)) { GSIDE[key] = 2; if (pCut) a = pCut; }
    else if (near(a, 13) && GSIDE[key] === 1 && gCut) a = Math.max(a, gCut);
    if (near(a, 4) && band >= 2) a = 4.42;
    if (b - a < 0.03) return null;
    if (a === ctx.a) return { fp, a };
    return { a, fp: ctx.along ? [a, fp[1], b - a, fp[3]] : [fp[0], a, fp[2], b - a] };
  }
  def('wall', (fp0, L, band, ctx) => {
    const cut = wallCut(fp0, ctx, band); if (!cut) return 1;
    const fp = cut.fp, [x, y, w, d] = fp, along = ctx.along, a = cut.a, b = ctx.b, m = matOf(band), fort = T('fortification') ? 4 : 0;
    const mid = along ? y + d / 2 : x + w / 2;
    const line2 = z => along ? [[a, mid], [b, mid]] : [[mid, a], [mid, b]];
    if (band === 0) { stakes(line2(0), 15 + fort, { skulls: true, bone: true, gap: 0.2 }); return 1; }
    if (band === 1) {
      const bank = A.box(x, y, w, d, 0, 4, footingCol());
      void bank;
      stakes(line2(4), 14 + fort, { skulls: true, z: 4, gap: 0.19 });
      return 1;
    }
    if (band === 2 && m === 'timber') {
      const bw = A.box(x, y, w, d, 0, 10, BASALT); if (!A.GLOW) A.courses(bw, 3.5, A.shade(BASALT, -0.2));
      stakes(line2(10), 13 + fort, { skulls: true, z: 10, gap: 0.19 });
      return 1;
    }
    // black stone / obsidian rampart with spiked crenels and braziers every few tiles
    const H = 22 + band * 3 + fort, col = m === 'obs' ? '#3e383e' : BASALT_L;   // matches the stock black-stone wall towers; obsidian shows in teeth and glints
    const bw = A.box(x, y, w, d, 0, H, col);
    if (!A.GLOW) A.courses(bw, 4, A.shade(col, m === 'obs' ? 0.12 : -0.18));
    if (m === 'obs') glints((u, v) => along ? A.P(a + u * (b - a), y + d, v * H) : A.P(x + w, a + u * (b - a), v * H), Math.round((b - a) * 1.5));
    const n = Math.max(2, Math.round((b - a) / 0.22));
    for (let k = 0; k <= n; k++) { const u = a + (b - a) * k / n; const p = along ? A.P(u, y + d, H) : A.P(x + w, u, H); A.poly([[p[0] - 1.6, p[1]], [p[0] + 1.6, p[1]], [p[0], p[1] - (k % 2 ? 4 : 7)]], m === 'obs' ? OBS : k % 2 ? A.shade(col, -0.1) : col, A.OUT, 0.5); }
    if (m === 'obs') A.lamp(along ? [A.P(a, y + d, H - 3), A.P(b, y + d, H - 3), A.P(b, y + d, H - 2.2), A.P(a, y + d, H - 2.2)] : [A.P(x + w, a, H - 3), A.P(x + w, b, H - 3), A.P(x + w, b, H - 2.2), A.P(x + w, a, H - 2.2)], '#7a2a1a', '#ff7a2a');

    if (fort && !A.GLOW) for (let k = 0; k < n; k += 2) { const u = a + (b - a) * (k + 0.5) / n; const p = along ? A.P(u, y + d, H * 0.55) : A.P(x + w, u, H * 0.55); A.line(p, along ? [p[0] - 3, p[1] + 4] : [p[0] + 3, p[1] + 4], '#8a8a90', 1); }
    if (band >= 3 || era() >= 2) {
      for (let u = Math.ceil(a / 2.5) * 2.5; u < b - 0.3; u += 2.5) { if (u < a + 0.3) continue; brazier(along ? u : x + w / 2, along ? y + d / 2 : u, H, 0.75, false); }
    }
    if (m !== 'obs' && Math.round(a * 3) % 4 === 0) { const p = along ? A.P(a + 0.4, y + d, H * 0.7) : A.P(x + w, a + 0.4, H * 0.7); A.poly([[p[0] - 3, p[1] - 3], [p[0] + 3, p[1] - 3], [p[0] + 3, p[1] + 8], [p[0], p[1] + 5], [p[0] - 3, p[1] + 8]], RED); }
    return 1;
  });
  function footingCol() { return T('masonry') ? BASALT : EARTH; }

  // ================= wall towers, gatehouses and posterns: the same stakes / log / black-stone build as the wall =================
  const bandOfWall = L => L <= 0 ? -1 : L <= 4 ? 0 : L <= 9 ? 1 : L <= 14 ? 2 : 3;
  const trueWallBand = ctx => { const b = bandOfWall(ctx.wallLevel || 0); return ctx.fortified && ctx.wallLevel > 0 ? Math.max(1, b) : b; };
  // what the wall itself is built of at its real band ('stake' | 'bank' | 'footed' (basalt foot + stakes) | 'stone' | 'obs')
  const wallKind = wb => { const m = matOf(wb); return wb <= 0 ? 'stake' : wb === 1 ? 'bank' : wb === 2 && m === 'timber' ? 'footed' : m === 'obs' ? 'obs' : 'stone'; };
  const wallTop = (wb, kind) => { const fort = T('fortification') ? 4 : 0; return kind === 'stake' ? 15 + fort : kind === 'bank' ? 18 + fort : kind === 'footed' ? 23 + fort : 22 + wb * 3 + fort; };
  // a log blockhouse: earth / basalt footing, a timber drum of upright logs, a jettied fighting deck ringed with stakes,
  // and a hide cone with a skull standard (or a brazier crown)
  function logTower(x, y, s, H, o = {}) {
    const { box, shade, onL, onR, line } = A;
    let z = 0;
    if (o.foot) { const f = box(x - 0.04, y - 0.04, s + 0.08, s + 0.08, 0, o.foot, o.footCol || BASALT); if (!A.GLOW && o.foot > 5) A.courses(f, 3.5, shade(o.footCol || BASALT, -0.2)); z = o.foot; }
    const col = '#5e4636', b = box(x, y, s, s, z, H - z, col);
    if (!A.GLOW) {
      for (let u = 0.08; u < s; u += 0.11) { line(onL(b, u, u, 0, 0)[0], onL(b, u, u, H - z, H - z)[0], shade(col, -0.3), 0.6); line(onR(b, u, u, 0, 0)[0], onR(b, u, u, H - z, H - z)[0], shade(col, -0.38), 0.6); }
      line(onL(b, 0, s, (H - z) * 0.6, (H - z) * 0.6)[0], onL(b, 0, s, (H - z) * 0.6, (H - z) * 0.6)[1], RED, 1.3);
      line(onR(b, 0, s, (H - z) * 0.6, (H - z) * 0.6)[0], onR(b, 0, s, (H - z) * 0.6, (H - z) * 0.6)[1], A.shade(RED, -0.25), 1.3);
    }
    A.lamp(onL(b, s / 2 - 0.04, s / 2 + 0.04, (H - z) * 0.3, (H - z) * 0.3 + 5), '#1a1414', '#ffa040');
    A.lamp(onR(b, s / 2 - 0.04, s / 2 + 0.04, (H - z) * 0.3, (H - z) * 0.3 + 5), '#1a1414', '#ffa040');
    // jettied deck on bracing struts
    const j = 0.09, dk = box(x - j, y - j, s + 2 * j, s + 2 * j, H, 3, '#4e3828');
    if (!A.GLOW) for (const u of [0.05, s - 0.05]) { line(onL(b, u, u, H - z - 5, H - z - 5)[0], A.P(x + u, y + s + j, H), WOOD_D, 0.9); line(onR(b, u, u, H - z - 5, H - z - 5)[0], A.P(x + s + j, y + u, H), WOOD_D, 0.9); }
    void dk;
    stakes([[x - j, y + s + j], [x + s + j, y + s + j], [x + s + j, y - j]], 6, { z: H + 3, gap: 0.13, bone: true });
    const cx = x + s / 2, cy = y + s / 2;
    if (o.brazier) return brazier(cx, cy, H + 3, 1.1, false) + 2;
    const zt = A.cone(cx, cy, s * 0.62, H + 8, 12 + s * 14, roofHide());
    const ap = A.P(cx, cy, zt);
    horns(ap[0], ap[1] - 1, 0.7); A.skull(ap[0], ap[1], 0.9);
    if (o.banner) hornBanner(x + s + j, y + s + j, 12, RED, H + 3);
    return zt + 8;
  }
  // a black-stone (or obsidian) tower: lit slits, an overhanging spiked crown, a horned skull on the face,
  // a brazier, a hide-roof cap and red banners for the great corner towers
  function blackTower(x, y, s, H, m, o = {}) {
    const b = stoneBlock(x, y, s, s, 0, H, m);
    const col = m === 'obs' ? '#3e383e' : BASALT_L;
    if (!A.GLOW) { const p = A.onL(b, s / 2, s / 2, H * 0.78, H * 0.78)[0]; horns(p[0], p[1] - 1, 0.75); A.skull(p[0], p[1], 0.95); }
    if (o.banner) { const q = A.onR(b, s * 0.3, s * 0.7, H * 0.25, H * 0.68); A.poly([q[3], q[2], q[1], [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2 - 3], q[0]], RED); if (!A.GLOW) { const c0 = [(q[2][0] + q[3][0] + q[0][0] + q[1][0]) / 4, (q[2][1] + q[3][1] + q[0][1] + q[1][1]) / 4]; A.circ(c0[0], c0[1] - 2, 2, null, sigil()); } }
    const j = 0.07, cr = A.box(x - j, y - j, s + 2 * j, s + 2 * j, H, 4, A.shade(col, -0.08));
    if (!A.GLOW) A.courses(cr, 2, A.shade(col, m === 'obs' ? 0.1 : -0.2));
    if (m === 'obs') A.lamp(A.onL(cr, 0.02, cr.w - 0.02, 1.2, 1.9), '#7a2a1a', '#ff7a2a');
    spikeTop(cr, 5, m === 'obs' ? OBS : A.shade(col, -0.1));
    const cx = x + s / 2, cy = y + s / 2;
    if (o.roof) {
      const zt = A.cone(cx, cy, s * 0.6, H + 4, 14 + s * 16, m === 'obs' ? '#3a2e34' : '#4a3a34');
      const ap = A.P(cx, cy, zt); horns(ap[0], ap[1] - 1, 0.8); A.skull(ap[0], ap[1], 1);
      if (o.brazier) brazier(x + s + j - 0.08, y + s + j - 0.08, H + 4, 0.65, false);
      return zt + 8;
    }
    if (o.brazier) return brazier(cx, cy, H + 4, 1, true);
    skullPole(cx, cy, 10, 0, H + 4);
    return H + 20;
  }
  // grid helpers along a wall line: u runs along the wall, v across it (0 = the wall line)
  const wallFrame = ctx => {
    const along = ctx.along, f = ctx.fixed;
    return {
      at: (u, v, z = 0) => along ? A.P(u, f + v, z) : A.P(f + v, u, z),
      g: (u, v) => along ? [u, f + v] : [f + v, u],
      rect: (u0, u1, v0, v1) => along ? [u0, f + v0, u1 - u0, v1 - v0] : [f + v0, u0, v1 - v0, u1 - u0],
    };
  };
  def('walltower', ([x, y, w, d], L, band, ctx) => {
    const wb = trueWallBand(ctx), kind = wallKind(wb), top = wallTop(wb, kind), corner = !!ctx.corner;
    const s = corner ? 0.86 : 0.7, ox = x + (w - s) / 2, oy = y + (d - s) / 2;
    if (kind === 'stake' || kind === 'bank') { // a staked lookout on the earth bank
      if (kind === 'bank') A.box(ox - 0.05, oy - 0.05, s + 0.1, s + 0.1, 0, 4, footingCol());
      return logTower(ox + 0.08, oy + 0.08, s - 0.16, top + 10 + (corner ? 4 : 0), { foot: kind === 'bank' ? 4 : 0, footCol: footingCol(), brazier: false });
    }
    if (kind === 'footed') return logTower(ox, oy, s, top + 12 + (corner ? 6 : 0), { foot: 10, footCol: BASALT, banner: corner, brazier: !corner && (era() >= 2 || T('fortification')) });
    const m = kind;
    const H = top + (corner ? 14 + wb * 3 : 10);
    return blackTower(ox, oy, s, H, m, { banner: corner, roof: corner && wb >= 3, brazier: wb >= 3 || era() >= 2 });
  });
  def('gate', (fp, L, band, ctx) => {
    const wb = trueWallBand(ctx), kind = wallKind(wb), top = wallTop(wb, kind), g0 = ctx.g0, g1 = ctx.g1, mid = (g0 + g1) / 2;
    const F = wallFrame(ctx), sc = scene();
    const tusks = (z0, zA, s = 1) => { // two great tusks curving in to meet over the road, a horned skull where they cross
      const a = F.at(g0 + 0.05, 0, z0), b = F.at(g1 - 0.05, 0, z0), t = F.at(mid, 0, zA);
      curve(a, [a[0] + (t[0] - a[0]) * 0.1, t[1] - 4], [t[0] + (b[0] - a[0]) * 0.08, t[1] - 3], BONE, 3.2 * s);
      curve(b, [b[0] + (t[0] - b[0]) * 0.1, t[1] - 4], [t[0] - (b[0] - a[0]) * 0.08, t[1] - 3], BONE, 3.2 * s);
      if (!A.GLOW) { curve(a, [a[0] + (t[0] - a[0]) * 0.1, t[1] - 4], [t[0] + (b[0] - a[0]) * 0.08, t[1] - 3], '#c8b890', 1); }
      horns(t[0], t[1] - 2, 1.0 * s); A.skull(t[0], t[1] - 1, 1.25 * s);
      for (const dx of [-3, 3]) A.line([t[0] + dx, t[1] + 2], [t[0] + dx * 1.2, t[1] + 10], RED, 1.3);
      return zA + 10;
    };
    if (kind === 'stake') {
      for (const u of [g0 - 0.1, g1 + 0.1]) sc.add(...F.g(u, 0), () => skullPole(...F.g(u, 0), 26, 1));
      sc.add(...F.g(mid, 0.1), () => tusks(0, 30, 0.9));
      return sc.run();
    }
    if (kind === 'bank') {
      for (const u of [g0 - 0.5, g1 + 0.05]) sc.add(...F.g(u + 0.22, 0), () => { const r = F.rect(u, u + 0.45, -0.22, 0.23); A.box(r[0] - 0.04, r[1] - 0.04, r[2] + 0.08, r[3] + 0.08, 0, 4, footingCol()); return stakeTower(r[0], r[1], 0.45, top + 6, { brazier: T('fortification') || era() >= 1 }); });
      sc.add(...F.g(mid, 0.1), () => { const a = F.at(g0 - 0.05, 0, top + 2), b = F.at(g1 + 0.05, 0, top + 2); A.line(a, b, WOOD_D, 2.4); return tusks(top - 2, top + 10, 0.8); });
      return sc.run();
    }
    if (kind === 'footed') {
      const H = top + 14;
      sc.add(...F.g(g0 - 0.3, 0), () => logTower(...F.rect(g0 - 0.58, g0, -0.3, 0.28).slice(0, 2), 0.58, H, { foot: 10, banner: true }));
      sc.add(...F.g(mid, 0), () => { // a covered fighting bridge over the road
        const r = F.rect(g0, g1, -0.24, 0.24), b = A.box(r[0], r[1], r[2], r[3], H - 12, 9, '#5e4636');
        if (!A.GLOW) for (let u = 0.08; u < r[2]; u += 0.12) A.line(A.onL(b, u, u, 0, 0)[0], A.onL(b, u, u, 9, 9)[0], WOOD_D, 0.5);
        for (let u = 0.08; u < r[3]; u += 0.12) if (!A.GLOW) A.line(A.onR(b, u, u, 0, 0)[0], A.onR(b, u, u, 9, 9)[0], WOOD_D, 0.5);
        stakes(ctx.along ? [[r[0], r[1] + r[3]], [r[0] + r[2], r[1] + r[3]]] : [[r[0] + r[2], r[1]], [r[0] + r[2], r[1] + r[3]]], 6, { z: H - 3, gap: 0.14, skulls: true });
        const p = F.at(mid, 0.24, H - 9); horns(p[0], p[1] - 1, 0.9); A.skull(p[0], p[1], 1.1);
        return H + 4;
      });
      sc.add(...F.g(g1 + 0.3, 0), () => logTower(...F.rect(g1, g1 + 0.58, -0.3, 0.28).slice(0, 2), 0.58, H, { foot: 10, banner: true }));
      return sc.run();
    }
    // black-stone gatehouse: two spiked towers, a lintel block with the tusk crest, braziers on top
    const m = kind, H = top + 14 + wb * 2, col = m === 'obs' ? '#3e383e' : BASALT_L;
    sc.add(...F.g(g0 - 0.3, 0), () => blackTower(...F.rect(g0 - 0.62, g0, -0.32, 0.3).slice(0, 2), 0.62, H, m, { banner: true, brazier: true }));
    sc.add(...F.g(mid, 0), () => {
      const r = F.rect(g0, g1, -0.26, 0.26), b = stoneBlock(r[0], r[1], r[2], r[3], top - 6, 14, m, { slits: false });
      spikeTop(b, 4, m === 'obs' ? OBS : A.shade(col, -0.1));
      tusks(top + 4, top + 18, 1.1);
      return top + 30;
    });
    sc.add(...F.g(g1 + 0.3, 0), () => blackTower(...F.rect(g1, g1 + 0.62, -0.32, 0.3).slice(0, 2), 0.62, H, m, { banner: true, brazier: true }));
    return sc.run();
  });
  def('postern', (fp, L, band, ctx) => {
    const wb = trueWallBand(ctx), kind = wallKind(wb), top = wallTop(wb, kind), g0 = ctx.g0, g1 = ctx.g1, mid = (g0 + g1) / 2;
    const F = wallFrame(ctx), sc = scene();
    if (kind === 'stake' || kind === 'bank') {
      const z0 = kind === 'bank' ? 4 : 0;
      if (kind === 'bank') for (const u of [g0 - 0.22, g1]) sc.add(...F.g(u, 0), () => { const r = F.rect(u, u + 0.22, -0.16, 0.16); A.box(r[0], r[1], r[2], r[3], 0, 4, footingCol()); return 4; });
      for (const u of [g0 - 0.05, g1 + 0.05]) sc.add(...F.g(u, 0.05), () => { A.line(F.at(u, 0, z0), F.at(u, 0, top + 2), WOOD_D, 2.6); return top + 2; });
      sc.add(...F.g(mid, 0.1), () => { const a = F.at(g0 - 0.12, 0, top - 1), b = F.at(g1 + 0.12, 0, top - 1); A.line(a, b, WOOD_D, 2); const m0 = F.at(mid, 0, top + 1); A.skull(m0[0], m0[1], 0.85); horns(m0[0], m0[1] - 1, 0.6); return top + 6; });
      return sc.run();
    }
    if (kind === 'footed') {
      for (const u of [g0 - 0.24, g1]) sc.add(...F.g(u + 0.12, 0), () => logTower(...F.rect(u, u + 0.26, -0.15, 0.15).slice(0, 2), 0.26, top + 2, { foot: 10, brazier: true }));
      sc.add(...F.g(mid, 0.05), () => { const r = F.rect(g0, g1, -0.14, 0.14); A.box(r[0], r[1], r[2], r[3], top - 6, 4, '#4e3828'); const p = F.at(mid, 0.14, top - 8); A.skull(p[0], p[1], 0.8); return top; });
      return sc.run();
    }
    const m = kind, col = m === 'obs' ? '#3e383e' : BASALT_L;
    for (const u of [g0 - 0.24, g1]) sc.add(...F.g(u + 0.12, 0), () => { const r = F.rect(u, u + 0.26, -0.24, 0.24), b = stoneBlock(r[0], r[1], r[2], r[3], 0, top + 5, m, { slits: false }); spikeTop(b, 4, m === 'obs' ? OBS : A.shade(col, -0.1)); return top + 10; });
    sc.add(...F.g(mid, 0), () => { const r = F.rect(g0, g1, -0.2, 0.2), b = stoneBlock(r[0], r[1], r[2], r[3], top - 7, 7, m, { slits: false }); void b; const p = F.at(mid, 0.2, top - 3.5); horns(p[0], p[1] - 0.5, 0.6); A.skull(p[0], p[1], 0.8); return top; });
    return sc.run();
  });

  // ================= the shore: hide-boat beaches, bone and driftwood piers, longships under hide sails =================
  function shoreHarbor(L, band, ctx) {
    const { pt, at, depth } = ctx, e = ctx.edge, sc = scene(), alongX = ctx.along;
    const add = (dd, u, f) => { const p = pt(dd, u); sc.add(p[0], p[1], f); };
    const DRIFT = '#8a7458', mole = band >= 2 && (era() >= 2 || T('masonry'));
    const piers = ctx.piers.length ? ctx.piers : [ctx.u0], outs = [];
    // flat works first: the piers (a basalt mole for the main pier once the horde builds in stone)
    for (const u of piers) {
      const dd0 = depth(u), main = Math.abs(u - ctx.u0) < 0.01, out = Math.max(0.45, dd0 - (main ? 1.4 + band * 0.45 : 1.1 + band * 0.3));
      outs.push([u, out, dd0, main]);
      if (main && mole) prismPier(u, out, dd0 + 0.4, 0.3, 5, era() >= 3 ? OBS : BASALT);
      else bonePier(u, out, dd0 + 0.4, DRIFT, band);
    }
    function prismPier(u, d0, d1, hw, h, col) {
      const c = [[d0, u - hw], [d1, u - hw], [d1, u + hw], [d0, u + hw]], faces = [];
      for (let i = 0; i < 4; i++) { const p = c[i], q = c[(i + 1) % 4], g = pt((p[0] + q[0]) / 2, (p[1] + q[1]) / 2); faces.push([g[0] + g[1], [at(p[0], p[1], -3), at(q[0], q[1], -3), at(q[0], q[1], h), at(p[0], p[1], h)], i]); }
      faces.sort((a, b) => a[0] - b[0]);
      for (const [, q, i] of faces) A.poly(q, A.shade(col, i % 2 ? -0.2 : -0.08));
      A.poly(c.map(([dd, uu]) => at(dd, uu, h)), A.shade(col, 0.12));
      if (!A.GLOW) for (let dd = d0 + 0.35; dd < d1; dd += 0.35) A.line(at(dd, u - hw, h), at(dd, u + hw, h), A.shade(col, -0.15), 0.5);
      if (col === OBS) A.lamp([at(d0 + 0.05, u - hw * 0.15, h + 0.3), at(d1, u - hw * 0.15, h + 0.3), at(d1, u + hw * 0.15, h + 0.3), at(d0 + 0.05, u + hw * 0.15, h + 0.3)], '#5a2418', '#ff7a2a');
    }
    function bonePier(u, d0, d1, wood, b) {
      for (let dd = d0 + 0.1; dd < d1 - 0.3; dd += 0.5) for (const du of [-0.24, 0.24]) {
        const k = Math.round(dd * 2) % 3 === 0;
        if (k && b >= 1) { const p0 = at(dd, u + du, -3), p1 = at(dd, u + du, 7); curve(p0, [p0[0] + (du < 0 ? -3 : 3), (p0[1] + p1[1]) / 2], [p1[0] + (du < 0 ? -1 : 1), p1[1]], BONE, 1.6); }
        else A.line(at(dd, u + du, -3), at(dd, u + du, 4), WOOD_D, 1.4);
      }
      A.poly([at(d1, u - 0.24, 2), at(d1, u + 0.24, 2), at(d0, u + 0.24, 2), at(d0, u - 0.24, 2)], wood);
      if (!A.GLOW) for (let dd = d0 + 0.12; dd < d1; dd += 0.2) A.line(at(dd, u - 0.24, 2), at(dd, u + 0.24, 2), A.shade(wood, -0.3), 0.5);
      A.line(at(d0, u - 0.24, 2), at(d1, u - 0.24, 2), A.shade(wood, -0.4), 0.6);
    }
    // a round hide coracle: afloat (paddle in), or beached upside down
    const coracle = (dd, u, beached) => add(dd, u, () => {
      const [x, y] = at(dd, u), c = A.c;
      if (beached) { c.beginPath(); c.ellipse(x, y - 1, 5.4, 3, 0, Math.PI, A.TAU); c.closePath(); c.fillStyle = A.F('#7a5236'); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke(); if (!A.GLOW) { arc(x, y - 1, 5.4, 3, Math.PI * 1.15, Math.PI * 1.85, '#c9a874', 0.6); A.line([x - 3, y - 3.5], [x + 3, y - 3.5], '#5a3a26', 0.5); } return 4; }
      const hide = A.SNOW ? A.mix('#7a5236', '#b9cad4', 0.4) : '#7a5236';
      if (A.SNOW) { c.beginPath(); c.ellipse(x, y - 0.5, 9.5, 3.8, 0, 0, A.TAU); c.fillStyle = A.F('#eef5f9'); c.fill(); c.strokeStyle = A.F('#a9c2d0'); c.lineWidth = 0.6; c.stroke(); if (!A.GLOW) for (const t of [0.6, 2.4, 3.8, 5.2]) A.line([x + Math.cos(t) * 9.5, y - 0.5 + Math.sin(t) * 3.8], [x + Math.cos(t) * 6.5, y - 0.5 + Math.sin(t) * 2.6], '#c4d6e0', 0.5); }   // iced in
      c.beginPath(); c.ellipse(x, y - 1.5, 5.5, 2.8, 0, 0, Math.PI); c.lineTo(x - 5.5, y - 1.5); c.closePath(); c.fillStyle = A.F(hide); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke();
      arc(x, y - 1.5, 5.5, 2.4, Math.PI, A.TAU, A.shade(hide, -0.3), 0.7); arc(x, y - 1.5, 5.5, 2.4, 0, Math.PI, A.SNOW ? '#f6fafc' : '#c9a874', A.SNOW ? 1.6 : 0.9); A.line([x + 2, y - 7], [x - 1.5, y + 0.5], WOOD_D, 0.9); A.circ(x - 0.5, y - 3, 1.3, '#3a2a20');
      return 4;
    });
    const hullAlong = (u, d0, d1, big, sail) => { // a longship moored along a pier, a horned skull on its prow
      const dm = (d0 + d1) / 2;
      add(dm, u, () => {
        A.shipHull(e, u, d0, d1, big, sail);
        const hh = big ? 7 : 5;
        if (!A.GLOW && !A.SNOW) { // the hide sail's painted stripes (furled in winter)
          const m = (d0 + d1) / 2, hw = big ? 0.3 : 0.22, zs = hh + (big ? 30 : 19), sh0 = big ? 18 : 12;
          for (const t of [-0.55, 0, 0.55]) { const a = at(m, u + hw * 1.6 * t - hw * 0.18, zs), b = at(m, u + hw * 1.6 * t + hw * 0.18, zs); A.poly([a, b, [b[0], b[1] + sh0], [a[0], a[1] + sh0]], t ? (sail === RED ? '#e2d6bb' : RED) : A.shade(sail, -0.25), null); }
        }
        const bp = at(d0, u, hh + 3);
        curve(bp, [bp[0] - 1, bp[1] - 6], [bp[0] + 2, bp[1] - 9], WOOD_D, 1.8); horns(bp[0] + 2, bp[1] - 9, 0.6); A.skull(bp[0] + 2, bp[1] - 8, 0.75);
        if (!A.GLOW && big) for (let k = 1; k < 5; k++) { const p = at(d0 + (d1 - d0) * k / 5, u + (ctx.front ? 0.3 : -0.3), hh - 1); A.circ(p[0], p[1], 1.6, k % 2 ? RED : BONE, A.OUT); }
        return hh + (big ? 36 : 24);
      });
    };
    const sail = era() >= 3 ? '#5e3c30' : band >= 3 ? RED : '#b98c5f';
    // boats at the piers
    outs.forEach(([u, out, dd0, main], i) => {
      const len = dd0 - out, side = i % 2 ? -0.55 : 0.55;
      if (main && band >= 2 && len > 1.4) hullAlong(u - 0.55, out + 0.1, out + Math.min(2.3, len), true, sail);
      else if (band >= 1 && (main || (band >= 3 && i === outs.length - 1)) && len > 1.1) hullAlong(u + 0.55, out + 0.1, out + Math.min(1.7, len), false, band >= 3 ? sail : '#c0935e');
      else if (len > 0.6) coracle(out + Math.min(0.7, len * 0.45), u + side, false);
      // pier heads: a skull standard, a brazier from band 2
      add(out + 0.05, u + 0.18, () => band >= 2 ? brazier(...pt(out + 0.12, u + 0.16), 2, 0.55, false) : (A.line(at(out + 0.12, u + 0.18, 2), at(out + 0.12, u + 0.18, 13), WOOD_D, 1.1), A.skull(...at(out + 0.12, u + 0.18, 13), 0.7), 14));
    });
    // the beach: coracles pulled up, fish-drying racks, a fire, a hide boat-shed and bone crane as the harbour grows
    const sh = u => depth(u) + 0.22, us = [];
    for (const u of [piers[0] - 0.5, piers[piers.length - 1] + 0.5]) if (u > ctx.a + 0.4 && u < ctx.b - 0.4) us.push(u);
    if (band >= 2) for (const u of [ctx.u0 - 1.65, ctx.u0 + 1.65]) if (u > ctx.a + 0.4 && u < ctx.b - 0.4 && !piers.some(p => Math.abs(p - u) < 0.35)) us.push(u);
    us.forEach((u, k) => coracle(sh(u) + (k % 2) * 0.1, u, true));
    const ur = ctx.u0 + (band >= 1 ? 0.55 : -0.85);
    add(depth(ur) + 0.5, ur, () => { meatRack(...pt(depth(ur) + 0.5, ur - 0.25), alongX); return 13; });
    const uf = ctx.u0 + (band >= 1 ? -0.55 : 0.6);
    add(depth(uf) + 0.45, uf, () => { A.firePit(...pt(depth(uf) + 0.45, uf), 0.55); return 6; });
    add(depth(ctx.u0) + 0.3, ctx.u0 - 0.3, () => skullPole(...pt(depth(ctx.u0) + 0.3, ctx.u0 - 0.32), 22 + band * 3, band >= 1 ? 1 : 0));
    if (band >= 2) { // a hide boat-shed half over the water, a war-canoe drawn up inside
      const hi = piers[piers.length - 1] + 1.25, lo = piers[0] - 1.25, us0 = hi < ctx.b - 0.5 ? hi : lo, dd = depth(us0);
      if (us0 < ctx.b - 0.5 && us0 > ctx.a + 0.5) add(dd + 0.3, us0, () => {
        const a0 = pt(dd - 0.55, us0 - 0.3), a1 = pt(dd + 0.45, us0 + 0.3), r = [Math.min(a0[0], a1[0]), Math.min(a0[1], a1[1]), Math.abs(a0[0] - a1[0]), Math.abs(a0[1] - a1[1])];
        for (const [gx, gy] of [[r[0], r[1] + r[3]], [r[0] + r[2], r[1] + r[3]], [r[0] + r[2], r[1]]]) A.line(A.P(gx, gy, -3), A.P(gx, gy, 3), WOOD_D, 1.4);
        return longhall(r[0], r[1], r[2], r[3], 7 + band, band >= 3 && era() >= 2 ? 'stone' : 'timber', { roof: roofHide() });
      });
    }
    if (band >= 3) { // a crane of two mammoth tusks lifting a net of catch
      const cu = ctx.u0 - 0.5, cd = depth(cu) + 0.1;
      add(cd, cu, () => {
        const b0 = at(cd + 0.15, cu - 0.2), b1 = at(cd + 0.15, cu + 0.2), t = at(cd - 0.3, cu, 38);
        curve(b0, [b0[0] - 3, (b0[1] + t[1]) / 2], t, '#d8caa8', 1.8); curve(b1, [b1[0] + 3, (b1[1] + t[1]) / 2], t, '#d8caa8', 1.8); A.line(at(cd + 0.1, cu - 0.15, 18), at(cd + 0.1, cu + 0.15, 18), WOOD_D, 1.2);
        const hk = at(cd - 1.1, cu, 16); A.line(t, at(cd - 1.1, cu, 34), WOOD_D, 1.6); A.line(at(cd - 1.1, cu, 34), hk, '#3a2a20', 0.6);
        A.c.beginPath(); A.c.ellipse(hk[0], hk[1] + 3, 3.4, 4, 0, 0, A.TAU); A.c.fillStyle = A.F('#8a7a5a'); A.c.fill(); if (!A.GLOW) { A.line([hk[0] - 3, hk[1] + 1], [hk[0] + 3, hk[1] + 5], '#5a4a3a', 0.5); A.line([hk[0] + 3, hk[1] + 1], [hk[0] - 3, hk[1] + 5], '#5a4a3a', 0.5); }
        horns(t[0], t[1] - 1, 0.6); A.skull(t[0], t[1], 0.7);
        return 42;
      });
    }
    const [sx, sy] = at(Math.max(0.6, depth(ctx.u0) * 0.5), ctx.u0 + 1);
    if (!A.SNOW) A.rec('sparks', { x: sx, y: sy, kind: 'water', rx: 30, ry: 12 });
    return { top: Math.max(16, sc.run()), noDress: true, noTech: true };
  }

  // ================= the lighthouse: a fire beacon on the sea rocks =================
  def('lighthouse', ([x, y, w, d], L, band, ctx) => {
    const cx = x + w / 2, cy = y + d / 2;
    A.rock(cx - 0.15, cy + 0.25, 1.4, '#5e5652'); A.rock(cx + 0.3, cy - 0.15, 1.0, '#6e6660');
    let ft;
    if (era() >= 2 || T('masonry')) { // a stepped black-stone beacon tower
      const m = era() >= 3 ? 'obs' : 'stone', H1 = 26 + band * 5, H2 = 16 + band * 4;
      const b1 = stoneBlock(cx - 0.32, cy - 0.32, 0.64, 0.64, 0, H1, m);
      if (!A.GLOW) { const p = A.onL(b1, 0.32, 0.32, H1 * 0.7, 0)[0]; horns(p[0], p[1] - 1, 0.8); A.skull(p[0], p[1], 1); }
      const b2 = stoneBlock(cx - 0.24, cy - 0.24, 0.48, 0.48, H1, H2, m); spikeTop(b2, 5, m === 'obs' ? OBS : '#5a5250');
      void b2;
      for (const [gx, gy] of [[cx - 0.28, cy + 0.28], [cx + 0.28, cy + 0.28], [cx + 0.28, cy - 0.28]]) { const p = A.P(gx, gy, H1 + H2); A.line(p, [p[0], p[1] - 10], WOOD_D, 1); }
      ft = brazier(cx, cy, H1 + H2, 1.7, true);
      const p = A.P(cx, cy, H1 + H2 + 7 * 1.7);
      A.rec('beams', { x: p[0], y: p[1] - 2 });
      if (band >= 2) hornBanner(cx + 0.3, cy + 0.3, 14, RED, H1);
    } else { // a tall timber frame of lashed logs with a great fire basket
      const H = 34 + band * 6, s = 0.6;
      ft = stakeTower(cx - s / 2, cy - s / 2, s, H, { brazier: true });
      const p = A.P(cx, cy, H + 12); A.rec('beams', { x: p[0], y: p[1] });
    }
    skullPole(cx + 0.38, cy + 0.42, 16, 1);
    return ft + 6;
  });
})();

// cityview opt-outs (the return-object format in js/cityart.js): stock extras this people's art already draws itself.
// Wraps the return value only — the drawings above are untouched.
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.ash) return;
  const R = CITYART.ash, O = {
    smelter: { noTech: ['metallurgy', 'bellows'] },
    academy: { noDress: true },   // the yard fence would hide the war-map
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
