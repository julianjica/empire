// Building art for the Windkin — see the CITYART contract in js/cityart.js
// Hawk-folk of the heights: stilts and cliff ledges, tall slender perch-towers with wind-vanes,
// woven-reed roofs (later blue shingles, then white stone), prayer-flag strings, wind chimes,
// windmills, rope lifts, and in the late eras stormglass that glows blue.
//   era 0 reed & timber on wooden stilts · 1 blue shingles · 2 stone piers and tall towers
//   era 3 white stone, gilded trim and glowing stormglass
'use strict';
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.wind) return;
  const W = CITYART.wind;
  let A = null, X = null, RN = Math.random, ERA = 0;
  const def = (t, fn) => {
    W[t] = (api, s, L, band, ctx) => {
      A = api; X = ctx; ERA = ctx.era || 0;
      RN = api.mkRng(api.hashStr(((ctx.city && ctx.city.id) || 'c') + ':' + t + ':' + (ctx.i || 0)));
      return fn(s, L || 1, band || 0, ERA);
    };
  };
  // ---------------------------------------------------------------- materials
  const TECH = id => { try { return !!X.tech(id); } catch (e) { return false; } };
  const snowy = col => X.snow ? A.mix(col, '#f3f6f9', 0.8) : col;
  const WHITE = '#f1ece0', ROCK = '#9b9488', STORM_D = '#5a8ab8', STORM_N = '#bfe6ff';
  const wallC = () => ERA >= 3 ? WHITE : ERA >= 2 || TECH('architecture') ? A.mix(A.STY.wall, A.STY.stone2, 0.5) : A.STY.wall;
  const stoneC = () => ERA >= 3 ? '#e4ddcc' : A.STY.stone2;
  const roofC = () => ERA === 0 ? A.STY.thatch : ERA >= 3 ? '#2f5c96' : A.STY.roof;
  const roofTex = () => ERA === 0 ? 'thatch' : 'tile';
  const woodC = () => A.STY.wood;
  const beamC = () => A.STY.beam;
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const cloth = i => A.STY.cloth[((i % 4) + 4) % 4];

  // ---------------------------------------------------------------- small props
  function chime(x, y) { A.line([x - 3, y], [x + 3, y], beamC(), 1); A.rec('chimes', { x, y, seed: RN() }); }
  function storm(x, y, r = 1.8, spark = true) { // a pane or orb of stormglass
    A.lampDot(x, y, r + 0.8, '#2e4a6a', '#6ab8ff');
    A.lampDot(x, y, r, STORM_D, STORM_N);
    if (!X.night) A.circ(x - r * 0.35, y - r * 0.35, r * 0.35, '#d8f0ff');
    if (spark) A.rec('sparks', { x, y, kind: 'star' });
    A.rec('lights', { x, y, r: 10 + r * 3 });
  }
  function vane(gx, gy, z, s = 1) { // a wind-vane: arrow with a feather tail, and compass arms
    const b = A.P(gx, gy, z), t = [b[0], b[1] - 9 * s];
    A.line(b, t, '#4a3a2a', 1.1);
    A.line([t[0] - 3 * s, t[1] + 3 * s], [t[0] + 3 * s, t[1] + 3 * s], '#4a3a2a', 0.6);
    const dir = RN() < 0.5 ? 1 : -1;
    A.line([t[0] - 5 * s * dir, t[1]], [t[0] + 5 * s * dir, t[1]], '#c9a03a', 1.2);
    A.poly([[t[0] + 5 * s * dir, t[1]], [t[0] + 2.5 * s * dir, t[1] - 1.6 * s], [t[0] + 2.5 * s * dir, t[1] + 1.6 * s]], '#c9a03a', null);
    A.poly([[t[0] - 5 * s * dir, t[1]], [t[0] - 7 * s * dir, t[1] - 2.6 * s], [t[0] - 3 * s * dir, t[1]], [t[0] - 7 * s * dir, t[1] + 2.4 * s]], A.STY.trim, A.OUT, 0.5);
    A.circ(t[0], t[1] - 1.5, 1, '#c9a03a');
    return z + 10 * s;
  }
  function cups(gx, gy, z) { // anemometer
    const b = A.P(gx, gy, z), t = [b[0], b[1] - 8];
    A.line(b, t, '#4a3a2a', 1);
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -1.5]]) { A.line(t, [t[0] + dx, t[1] + dy], '#4a3a2a', 0.7); A.circ(t[0] + dx, t[1] + dy, 1.1, '#c9a03a'); }
  }
  function flags(a, b, n, sag = 5, off = 0) { // a sagging string of little prayer flags between two screen points
    const pt = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * sag];
    A.c.beginPath(); for (let k = 0; k <= 10; k++) { const p = pt(k / 10); if (k) A.c.lineTo(p[0], p[1]); else A.c.moveTo(p[0], p[1]); }
    A.c.strokeStyle = A.F('#6a5a44'); A.c.lineWidth = 0.6; A.c.stroke();
    const cols = ['#d8a020', '#3d6aa6', '#c0503a', '#f4ead2', '#5e9a5a'];
    for (let k = 1; k <= n; k++) { const p = pt(k / (n + 1)); A.poly([[p[0] - 1.6, p[1]], [p[0] + 1.6, p[1]], [p[0] + 0.3, p[1] + 4.2]], cols[(k + off) % cols.length], null); }
  }
  function streamer(gx, gy, z, h, col, len = 14) { A.pennant(gx, gy, z, h, col || A.STY.flag); void len; }
  function hawk(x, y) { A.perchedHawk(x, y); }
  function perchArm(gx, gy, z, dx, dy, bird = true) { // a pole jutting out with a hawk on the end
    const a = A.P(gx, gy, z), b = A.P(gx + dx, gy + dy, z);
    A.line(a, b, beamC(), 1.4); A.line(A.P(gx, gy, z - 6), lerp2(a, b, 0.6), beamC(), 0.7);
    if (bird) hawk(b[0], b[1]);
  }
  function roc(x, y, s = 1, col = '#6a4a2e') { // a great perched roc
    const c = A.c;
    A.poly([[x - 4 * s, y - 4 * s], [x - 11 * s, y + 1 * s], [x - 3 * s, y - 1 * s]], A.shade(col, -0.25), null);   // tail
    c.beginPath(); c.ellipse(x, y - 8 * s, 5 * s, 7.5 * s, 0.25, 0, Math.PI * 2); c.fillStyle = A.F(col); c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.7; c.stroke();
    A.poly([[x - 4 * s, y - 13 * s], [x + 2 * s, y - 12 * s], [x + 1 * s, y - 2 * s], [x - 5 * s, y - 4 * s]], A.shade(col, -0.18), null);   // folded wing
    c.beginPath(); c.ellipse(x + 2 * s, y - 7 * s, 2.4 * s, 4 * s, 0.2, 0, Math.PI * 2); c.fillStyle = A.F('#e8dcc0'); c.fill();               // pale breast
    A.circ(x + 2.5 * s, y - 15.5 * s, 2.8 * s, A.shade(col, 0.1), A.OUT);
    A.poly([[x + 4.6 * s, y - 16.5 * s], [x + 8 * s, y - 15 * s], [x + 5.5 * s, y - 13.6 * s]], '#e0b040', null);
    A.circ(x + 3.4 * s, y - 16.2 * s, 0.6 * s, '#1a1410');
    A.line([x - 1 * s, y - 1 * s], [x - 1.5 * s, y + 1 * s], '#c9a03a', 0.9); A.line([x + 1.5 * s, y - 1 * s], [x + 1.5 * s, y + 1 * s], '#c9a03a', 0.9);
  }
  function wingEmblem(x, y, s, col) { // a spread pair of carved wings with a hawk head between
    for (const sd of [-1, 1]) for (let k = 3; k >= 0; k--) {
      A.poly([[x + sd * 1.2 * s, y + 0.5 * s], [x + sd * (5 + k * 2.4) * s, y - (6.5 - k * 1.7) * s], [x + sd * (4.2 + k * 2.4) * s, y - (3.2 - k * 1.5) * s], [x + sd * 1.5 * s, y + 2 * s]], k % 2 ? col : A.shade(col, -0.15), A.OUT, 0.4);
    }
    A.circ(x, y - 1 * s, 2 * s, col, A.OUT); A.poly([[x + 1.2 * s, y - 1.5 * s], [x + 3.6 * s, y - 0.5 * s], [x + 1.2 * s, y + 0.2 * s]], '#e0b040', null);
  }
  function sails(x, y, r, ang, col = '#efe2c4') { // static windmill sails
    for (let k = 0; k < 4; k++) {
      const a = ang + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a) * 0.92;
      const ex = x + ca * r, ey = y + sa * r, px = -sa * 4.2, py = ca * 4.2;
      A.line([x, y], [ex, ey], '#5a4030', 1.1);
      A.poly([[x + ca * 4, y + sa * 4], [ex, ey], [ex + px, ey + py], [x + ca * 4 + px, y + sa * 4 + py]], col, '#5a4030', 0.6);
    }
    A.circ(x, y, 1.8, '#4a3020');
  }
  function weave(q, col, n = 4) { // diagonal reed weave over a roof/wall plane q = [a, b, c, d]
    if (X.snow) return;
    for (let i = 1; i < n * 2; i++) { const t = i / (n * 2); A.line(lerp2(q[0], q[1], t), lerp2(q[3], q[2], Math.max(0, t - 0.15)), col, 0.45); }
  }
  // ---------------------------------------------------------------- structure
  function legs(x, y, w, d, z0, h) { // stilts (timber, braced) or stone piers from era 2
    const cs = [[x + 0.06, y + 0.06], [x + w - 0.06, y + 0.06], [x + 0.06, y + d - 0.06], [x + w - 0.06, y + d - 0.06]];
    if (ERA >= 2 || TECH('masonry') && h < 14) {
      for (const [gx, gy] of cs) { const p = A.box(gx - 0.07, gy - 0.07, 0.14, 0.14, z0, h, stoneC(), { noSnow: true }); void p; }
      return;
    }
    for (const [gx, gy] of cs) A.line(A.P(gx, gy, z0), A.P(gx, gy, z0 + h), beamC(), 1.8);
    if (h > 7) {
      A.line(A.P(cs[2][0], cs[2][1], z0 + 1), A.P(cs[3][0], cs[3][1], z0 + h - 1), beamC(), 0.7); A.line(A.P(cs[3][0], cs[3][1], z0 + 1), A.P(cs[2][0], cs[2][1], z0 + h - 1), beamC(), 0.7);
      A.line(A.P(cs[1][0], cs[1][1], z0 + 1), A.P(cs[3][0], cs[3][1], z0 + h - 1), beamC(), 0.7); A.line(A.P(cs[3][0], cs[3][1], z0 + 1), A.P(cs[1][0], cs[1][1], z0 + h - 1), beamC(), 0.7);
    }
  }
  function deck(x, y, w, d, z, rail = true) {
    const b = A.box(x, y, w, d, z, 1.4, woodC());
    if (rail) {
      A.line(A.P(x, y + d, z + 5), A.P(x + w, y + d, z + 5), beamC(), 0.8); A.line(A.P(x + w, y, z + 5), A.P(x + w, y + d, z + 5), beamC(), 0.8);
      for (let u = 0; u <= 1.001; u += 0.25) { A.line(A.P(x + w * u, y + d, z + 1.4), A.P(x + w * u, y + d, z + 5), beamC(), 0.6); A.line(A.P(x + w, y + d * u, z + 1.4), A.P(x + w, y + d * u, z + 5), beamC(), 0.6); }
    }
    return b;
  }
  function ladder(gx, gy, z0, z1) {
    const a = A.P(gx - 0.08, gy, z0), b = A.P(gx + 0.08, gy, z0);
    A.line(a, [a[0], a[1] - (z1 - z0)], '#8a6440', 0.8); A.line(b, [b[0], b[1] - (z1 - z0)], '#8a6440', 0.8);
    for (let k = 2; k < z1 - z0; k += 3) A.line([a[0], a[1] - k], [b[0], b[1] - k], '#c9a874', 0.7);
  }
  function rockBase(x, y, w, d, h) { // a craggy outcrop the building perches on
    const col = A.mix(A.STY.stone, ROCK, 0.5);
    const b = A.box(x, y, w, d, 0, h, col, { top: A.mix(A.GROUND, col, 0.35) });
    // strata and cracks
    for (let v = 3.5; v < h - 1; v += 3.5 + RN() * 1.5) {
      const j = (RN() - 0.5) * 1.6;
      A.line(A.onL(b, 0, 0, v, 0)[0], A.onL(b, w, 0, v + j, 0)[0], A.shade(col, -0.2), 0.6);
      A.line(A.onR(b, 0, 0, v + j, 0)[0], A.onR(b, d, 0, v, 0)[0], A.shade(col, -0.34), 0.6);
    }
    if (h > 5) for (let k = 0; k < 3; k++) { const u = (k + 0.3 + RN() * 0.4) / 3; A.line(A.onL(b, w * u, 0, 0, 0)[0], A.onL(b, w * u + 0.1, 0, h * 0.75, 0)[0], A.shade(col, -0.3), 0.6); A.line(A.onR(b, d * u, 0, 0, 0)[0], A.onR(b, d * u - 0.1, 0, h * 0.6, 0)[0], A.shade(col, -0.4), 0.6); }
    // boulders spilling round the foot and one bulging at the corner
    const sc = Math.min(1, 0.35 + h / 22);
    for (let u = 0.15; u < w; u += 0.35 + RN() * 0.2) { const [px, py] = A.P(x + u, y + d + 0.04, 0); boulder(px, py + 1, sc * (0.35 + RN() * 0.3), A.shade(col, -0.05 + RN() * 0.1)); }
    for (let u = 0.15; u < d; u += 0.35 + RN() * 0.2) { const [px, py] = A.P(x + w + 0.04, y + u, 0); boulder(px, py + 1, sc * (0.35 + RN() * 0.3), A.shade(col, -0.12 + RN() * 0.08)); }
    if (h > 7) { const [px, py] = A.P(x + w, y + d, h * 0.45); boulder(px, py + 2, sc * 0.55, A.shade(col, 0.04)); }
    if (!X.snow && h > 4) for (let k = 0; k < 3; k++) { const t = A.P(x + w * (0.15 + k * 0.3), y + d, h); A.line([t[0], t[1]], [t[0] - 1, t[1] + 3], '#6a8a4a', 0.8); A.line([t[0] + 1.5, t[1]], [t[0] + 2, t[1] + 3.5], '#5a7a3a', 0.8); }
    return b;
  }
  function crag(gx, gy, s) { A.rock(gx, gy, s, A.mix(A.STY.stone, ROCK, 0.4)); }
  function boulder(x, y, s, col) { // a faceted, irregular boulder at a screen point (A.rock works on ground points only)
    col = col || A.mix(A.STY.stone, ROCK, 0.5);
    const j = () => 0.8 + RN() * 0.4, sk = (RN() - 0.5) * 2.5 * s;
    const L0 = [x - 7 * s * j(), y], L1 = [x - 5.5 * s * j() + sk * 0.3, y - 6 * s * j()], T = [x + sk, y - 8.5 * s * j()], R1 = [x + 6 * s * j() + sk * 0.3, y - 5 * s * j()], R0 = [x + 7.5 * s * j(), y], B = [x + 1 * s, y + 2.5 * s], M = [x + 1 * s + sk * 0.4, y - 3.5 * s * j()];
    A.poly([L0, L1, T, R1, R0, B], col);
    A.poly([L1, T, R1, M], X.snow ? '#f2f6f8' : A.shade(col, 0.16), null);
    A.poly([M, R1, R0, B], A.shade(col, -0.2), null);
    A.line(L0, M, A.shade(col, -0.12), 0.5);
  }
  function cragStack(cx, cy, r, H, n = 5, z0 = 0) { // a natural rock pillar of stacked boulders; returns the top z
    const col = A.mix(A.STY.stone, ROCK, 0.55);
    for (let k = 0; k < n; k++) {
      const t = k / n, z = z0 + (H - z0) * t, s = (r * 9) * (1 - t * 0.55), j = () => (RN() - 0.5) * s * 2.4;
      const [x0, y0] = A.P(cx, cy, z);
      boulder(x0 - s * 3.4 + j(), y0 + s * 0.4 + j() * 0.5, s * (0.6 + RN() * 0.3), A.shade(col, -0.1 + RN() * 0.08));
      boulder(x0 + s * 3.2 + j(), y0 + s * 0.6 + j() * 0.5, s * (0.55 + RN() * 0.3), A.shade(col, -0.14 + RN() * 0.08));
      boulder(x0 + j() * 0.6, y0 + s * 1.3, s * (0.9 + RN() * 0.3), A.shade(col, -0.04 + RN() * 0.1));
      if (k % 2 && !X.snow) { A.line([x0 + j(), y0 + s], [x0 + j() * 0.3, y0 + s * 3], A.shade(col, -0.35), 0.6); }
    }
    const [tx, ty] = A.P(cx, cy, H); boulder(tx, ty + 3, r * 5, col);
    if (!X.snow) for (let k = 0; k < 3; k++) { const [gx, gy] = A.P(cx + (k - 1) * r * 0.5, cy + r * 0.3, H * (0.3 + k * 0.2)); A.line([gx, gy], [gx - 1, gy - 3], '#6a8a4a', 0.8); A.line([gx + 1.5, gy], [gx + 2, gy - 3], '#6a8a4a', 0.8); }
    return H + r * 30;
  }
  function fringe(a, b, col) { // a hanging fringe of reed or feathers under an eave
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(3, Math.round(L / 3.2));
    for (let k = 0; k < n; k++) { const p = lerp2(a, b, k / n), q = lerp2(a, b, (k + 1) / n), m = lerp2(p, q, 0.5); A.poly([p, q, [m[0], m[1] + 3.2]], k % 2 ? col : A.shade(col, 0.18), null); }
  }
  function crest(a, b) { // a ridge crest: reed tufts in era 0, white feathers after, gold-tipped in the Legend era
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(L / 5));
    for (let k = 0; k <= n; k++) {
      const p = lerp2(a, b, k / n), lean = (k / n - 0.5) * 3;
      if (ERA === 0) { A.line(p, [p[0] - 1.5 + lean, p[1] - 4], A.shade(A.STY.thatch, -0.3), 0.9); A.line(p, [p[0] + 1.5 + lean, p[1] - 4.5], A.shade(A.STY.thatch, -0.2), 0.9); continue; }
      A.c.beginPath(); A.c.ellipse(p[0] + lean * 0.5, p[1] - 3.5, 1.1, 3.2, lean * 0.12, 0, Math.PI * 2); A.c.fillStyle = A.F(X.snow ? '#ffffff' : '#f4ead2'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.4; A.c.stroke();
      A.circ(p[0] + lean * 0.8, p[1] - 6.2, 0.8, ERA >= 3 ? '#e0b440' : k % 2 ? A.STY.flag : '#c0503a');
    }
  }
  function weaveWall(b) { // woven-reed panels (era 0) on both faces
    const col = A.shade(A.STY.wall, -0.18);
    for (const side of ['L', 'R']) {
      const Lf = side === 'L' ? b.w : b.d, f = side === 'L' ? A.onL : A.onR;
      for (let u = -b.h / 20; u < Lf; u += 0.14) { const u1 = Math.min(Lf, u + b.h / 20), u0 = Math.max(0, u); if (u1 <= u0) continue; A.line(f(b, u0, u0, (u0 - u) * 20, 0)[0], f(b, u1, u1, (u1 - u) * 20, 0)[0], col, 0.45); }
      A.line(f(b, 0, 0, b.h - 0.6, 0)[0], f(b, Lf, Lf, b.h - 0.6, 0)[0], A.STY.beam, 1.2);
      A.line(f(b, 0, 0, 0.6, 0)[0], f(b, Lf, Lf, 0.6, 0)[0], A.STY.beam, 1.2);
    }
  }
  // a timber/stone hut with a reed (era 0) or shingle roof; returns { b, top }
  function hut(x, y, w, d, z, h, o = {}) {
    const col = o.col || wallC();
    const b = A.box(x, y, w, d, z, h, col);
    if (ERA >= 2 && !o.timber) A.courses(b, 4, A.shade(col, -0.12)); else if (ERA === 0) weaveWall(b); else A.planks(b, A.shade(col, -0.16));
    const axis = o.axis || (w >= d ? 'x' : 'y'), span = axis === 'x' ? d : w;
    let top;
    if (o.hip) top = A.hip(b, (o.rh || span * 22), roofC(), 0.16, roofTex());
    else {
      const rh = o.rh || span * 20;
      top = A.gable(b, rh, roofC(), axis, roofTex(), 0.16);
      const q = A.gableQ(b, rh, axis, 0.16);
      fringe(q[0], q[1], A.shade(snowy(roofC()), -0.22));
      if (o.crest !== false) crest(q[3], q[2]);
    }
    if (o.horns !== false) { // carved wing-tips on the gable ends
      const ends = axis === 'x' ? [A.P(x - 0.12, y + d / 2, top), A.P(x + w + 0.12, y + d / 2, top)] : [A.P(x + w / 2, y - 0.12, top), A.P(x + w / 2, y + d + 0.12, top)];
      for (const e of ends) { A.line(e, [e[0] - 4, e[1] - 5], ERA >= 3 ? '#e0b440' : beamC(), 1.3); A.line(e, [e[0] + 4, e[1] - 5], ERA >= 3 ? '#e0b440' : beamC(), 1.3); }
    }
    return { b, top };
  }
  // a slender perch-tower: shaft, a ring of perches near the top, steep cone and a vane
  function spire(cx, cy, r, H, o = {}) {
    const col = o.col || (ERA >= 2 ? stoneC() : wallC());
    A.cyl(cx, cy, r * 1.25, 0, 3, A.mix(A.STY.stone, ROCK, 0.4));
    A.cyl(cx, cy, r, 3, H - 3, col);
    const [bx, by] = A.P(cx, cy + r * 0.7, 0);
    if (ERA < 2) for (let v = 8; v < H - 6; v += 9) A.line([bx - 3, by - v], [bx + 3.5, by - v - 1.5], A.shade(col, -0.2), 0.7);
    for (let v = 10; v < H - 8; v += 12) { const [wx, wy] = A.P(cx + r * 0.5, cy + r * 0.85, v); A.lamp([[wx - 1, wy], [wx + 1, wy], [wx + 1, wy - 4], [wx - 1, wy - 4]], '#3a4655', A.nightGlass()); }
    // perch ring / gallery
    const gz = H;
    A.cyl(cx, cy, r * 1.7, gz, 1.6, woodC());
    const [gx0, gy0, rx, ry] = A.ell(cx, cy, gz + 1.6, r * 1.7);
    A.c.beginPath(); A.c.ellipse(gx0, gy0 - 4, rx, ry, 0, 0, Math.PI); A.c.strokeStyle = A.F(beamC()); A.c.lineWidth = 0.7; A.c.stroke();
    for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI; A.line([gx0 + Math.cos(a) * rx, gy0 + Math.sin(a) * ry], [gx0 + Math.cos(a) * rx, gy0 + Math.sin(a) * ry - 4], beamC(), 0.6); }
    const np = o.perches || 0;
    for (let k = 0; k < np; k++) { const a = 0.3 + k * 2.2; const ex = cx + Math.cos(a) * r * 2.6, ey = cy + Math.sin(a) * r * 2.6; if (Math.sin(a) > -0.3) perchArm(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 1.6, gz - 2, ex - cx - Math.cos(a) * r * 1.6, ey - cy - Math.sin(a) * r * 1.6, k % 2 === 0); }
    // lookout cabin + cone roof
    A.cyl(cx, cy, r * 1.05, gz + 1.6, 7, col);
    const [lx, ly] = A.P(cx + r * 0.4, cy + r * 0.9, gz + 3); A.lamp([[lx - 1.5, ly], [lx + 1.5, ly], [lx + 1.5, ly - 3.5], [lx - 1.5, ly - 3.5]], '#3a4655', A.nightGlass());
    let top = A.cone(cx, cy, r * 1.55, gz + 8.6, o.roofH || 16 + r * 20, o.roof || roofC());
    if (ERA >= 3 || o.glass) { const [sx, sy] = A.P(cx, cy, top + 2); A.line([sx, sy + 2], [sx, sy - 1], '#c9a03a', 1); storm(sx, sy - 2.5, 2); top += 5; }
    else if (o.vane !== false) top = vane(cx, cy, top - 1);
    return top;
  }
  function windmill(cx, cy, r, H, sr) { // tapered tower mill with a cap and sails facing the viewer
    const col = ERA >= 2 ? stoneC() : wallC();
    const [x0, y0] = A.P(cx, cy, 0), rx = r * A.SQ2 * A.HW, ry = r * A.SQ2 * A.HH;
    A.c.beginPath(); A.c.moveTo(x0 - rx, y0); A.c.lineTo(x0 - rx * 0.65, y0 - H); A.c.lineTo(x0 + rx * 0.65, y0 - H); A.c.lineTo(x0 + rx, y0); A.c.ellipse(x0, y0, rx, ry, 0, 0, Math.PI); A.c.closePath();
    A.gradFill(x0 - rx, x0 + rx, col);
    if (ERA < 2) for (let v = 5; v < H - 3; v += 5) A.line([x0 - rx * (1 - v / H * 0.35), y0 - v], [x0 + rx * (1 - v / H * 0.35), y0 - v], A.shade(col, -0.15), 0.5);
    A.lamp([[x0 - 1.2, y0 - H * 0.5], [x0 + 1.2, y0 - H * 0.5], [x0 + 1.2, y0 - H * 0.5 - 3.5], [x0 - 1.2, y0 - H * 0.5 - 3.5]], '#3a4655', A.nightGlass());
    A.poly([[x0 - 2, y0 + ry * 0.8], [x0 + 2, y0 + ry * 0.8], [x0 + 2, y0 + ry * 0.8 - 6], [x0 - 2, y0 + ry * 0.8 - 6]], A.STY.door, null);
    const top = A.cone(cx, cy, r * 0.8, H, 8 + r * 6, roofC());
    sails(x0 + 1, y0 - H + 1 + ry * 0.4, sr, 0.35 + RN() * 0.8, ERA >= 3 ? '#f4f0e4' : '#efe2c4');
    return Math.max(top, H + sr * 0.9);
  }
  function birds(gx, gy, z, n, r) { const [bx, by] = A.P(gx, gy, z); A.rec('birds', { x: bx, y: by, r, n, seed: RN() }); }
  function ropeLift(gx, gy, z0, z1, cargo = 'crate') { // a hoist arm with a rope and a dangling load
    const top = A.P(gx, gy, z1), arm = A.P(gx + 0.35, gy, z1);
    A.line(top, arm, beamC(), 1.3); A.line(A.P(gx, gy, z1 - 6), lerp2(top, arm, 0.6), beamC(), 0.7);
    A.circ(arm[0], arm[1] + 1, 1.3, null, '#3a2a20');
    const ly = arm[1] + (z1 - z0) * 0.55;
    A.line([arm[0], arm[1] + 1], [arm[0], ly], '#6a5a44', 0.6);
    if (cargo === 'basket') { A.c.beginPath(); A.c.ellipse(arm[0], ly + 2, 2.6, 2.2, 0, 0, Math.PI * 2); A.c.fillStyle = A.F('#c9a874'); A.c.fill(); A.line([arm[0] - 2.4, ly + 1.5], [arm[0] + 2.4, ly + 1.5], '#8a6a40', 0.6); }
    else A.poly([[arm[0] - 2.4, ly], [arm[0] + 2.4, ly], [arm[0] + 2.4, ly + 4], [arm[0] - 2.4, ly + 4]], '#a5773f');
  }

  // ================================================================ buildings
  def('townhall', ([x, y, w, d], L, band) => {
    let top = 0;
    // back-left: a cliff perch (band 3)
    if (band >= 3) { rockBase(x + 0.1, y + 0.1, 0.7, 0.7, 10); top = spire(x + 0.45, y + 0.45, 0.2, 40 + L * 1.2, { perches: 1 }); }
    // back-right: the great perch-tower (stock hit split is at x + 1.7)
    let tw = null;
    if (band >= 2) { const H = 50 + band * 12 + L * 1.6; tw = [x + 2.2, y + 0.5, H]; top = Math.max(top, spire(x + 2.2, y + 0.5, 0.33, H, { perches: 2 + band + (L % 3 === 0 ? 1 : 0), roofH: 22 + band * 4 })); }
    else if (band === 1) { const H = 24 + L * 1.5; tw = [x + 2.25, y + 0.45, H]; top = Math.max(top, spire(x + 2.25, y + 0.45, 0.2, H, { perches: 1 })); }
    // the hall itself, raised on stilts (stone piers later) over a rock shelf
    const hx = band === 0 ? x + 0.55 : x + 0.4, hy = band === 0 ? y + 0.9 : y + 0.95;
    const hw = band === 0 ? 1.55 : band === 1 ? 1.75 : 1.95, hd = band === 0 ? 1.2 : band === 1 ? 1.35 : 1.4;
    const pz = [6, 9, 11, 13][band];
    if (band >= 2) rockBase(hx - 0.2, hy - 0.2, hw + 0.4, hd + 0.4, pz - 3);
    else if (band >= 1) rockBase(hx - 0.15, hy - 0.15, hw * 0.55, hd + 0.2, Math.min(pz, 8));
    legs(hx, hy, hw, hd, 0, pz);
    deck(hx - 0.12, hy - 0.12, hw + 0.24, hd + 0.24, pz);
    ladder(hx + hw * 0.25, hy + hd + 0.12, 0, pz);
    const H = [11, 14, 16, 18][band] + Math.min(4, L * 0.25);
    const { b, top: rt } = hut(hx, hy, hw, hd, pz + 1.4, H, { axis: 'x', rh: hd * (18 + band * 3) });
    A.door(b, 'L', hw * 0.5, 0.3, Math.min(9, H * 0.65));
    const nw = 2 + band; for (let i = 0; i < nw; i++) { const u = hw * (i + 0.5) / nw; if (Math.abs(u - hw * 0.5) > 0.2) A.win(b, 'L', u, H * 0.35, 0.14, 5); }
    A.win(b, 'R', hd * 0.3, H * 0.35, 0.14, 5); A.win(b, 'R', hd * 0.7, H * 0.35, 0.14, 5);
    // a carved hawk head over the door
    const [hdx, hdy] = A.P(hx + hw * 0.5, hy + hd, pz + 1.4 + H * 0.92);
    if (band >= 1) wingEmblem(hdx, hdy, 0.8 + band * 0.18, ERA >= 3 ? '#e0b440' : ERA >= 2 ? '#d8c8a0' : '#9a6a40');
    else { A.circ(hdx, hdy, 2.4, '#8a6440', A.OUT); A.poly([[hdx + 1.5, hdy - 0.5], [hdx + 4.5, hdy + 0.8], [hdx + 1.5, hdy + 1.4]], '#e0b040', null); }
    // side balcony with a perch on the right
    perchArm(hx + hw, hy + hd * 0.5, pz + 1.4 + H * 0.6, 0.45, 0, band >= 1);
    chime(...A.P(hx + hw + 0.12, hy + hd + 0.12, pz + 1.4 + H));
    top = Math.max(top, rt + 6);
    if (band >= 2) A.chimney(hx + hw * 0.2, hy + hd * 0.3, pz + 1.4 + H, hd * 12, 'hall', A.shade(stoneC(), -0.1));
    // prayer flags from the hall's ridge to the tower gallery: more strings as the town grows
    if (tw) {
      const a = A.P(hx + hw, hy + hd / 2, rt), bb = A.P(tw[0], tw[1], tw[2] + 1);
      flags(a, bb, 4 + Math.min(8, L % 10), 6);
      if (band >= 3) {
        // a rope bridge between the two towers' galleries, and a roc on the great tower
        const a2 = A.P(x + 0.45, y + 0.45, 40 + L * 1.2 + 1.5), b3 = A.P(tw[0], tw[1], tw[2] + 1.5), pts = [];
        for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([a2[0] + (b3[0] - a2[0]) * t, a2[1] + (b3[1] - a2[1]) * t + Math.sin(t * Math.PI) * 9]); }
        for (let k = 0; k < 10; k++) A.line(pts[k], pts[k + 1], woodC(), 2.2);
        A.c.beginPath(); pts.forEach((q, k) => k ? A.c.lineTo(q[0], q[1] - 4) : A.c.moveTo(q[0], q[1] - 4)); A.c.strokeStyle = A.F('#cdbf98'); A.c.lineWidth = 0.6; A.c.stroke();
        roc(b3[0] + 7, b3[1] + 1, 0.75);
        flags(A.P(hx, hy + hd / 2, rt), a2, 6 + (L % 4), 6, 2);
      }
      if (ERA >= 3) { const [sx, sy] = A.P(tw[0], tw[1], top); A.rec('magic', { x: sx, y: sy - 6, r: 8, n: 4, col: 'rgba(150,210,255,A)', seed: RN(), bolt: false }); }
    } else {
      // band 0: a flag-pole of streamers
      streamer(x + 2.45, y + 0.6, 0, 22 + L * 2);
      flags(A.P(hx + hw, hy + hd / 2, rt), A.P(x + 2.45, y + 0.6, 20 + L * 2), 3 + L, 4);
    }
    if (band >= 2 && TECH('architecture')) { const [sx, sy] = A.P(hx + hw * 0.5, hy + hd, pz + 1.4 + H * 0.82); A.circ(sx, sy, 2.6, A.STY.trim, A.OUT); ERA >= 3 ? storm(sx, sy, 1.6, false) : A.lampDot(sx, sy, 1.6, '#3a4655', A.nightGlass()); }
    birds(x + 1.4, y + 1.4, top + 8, 2 + band, 26 + band * 6);
    return top;
  });

  // ------------------------------------------------- homes: stilt hut / ledge house / tower house
  def('cottage', ([x, y], L, band) => {
    const i = X.i || 0, form = i % 3, s = [0.9, 1.0, 1.08, 1.14][band];
    const cx = x + 0.6, cy = y + 0.55;
    let top;
    if (form === 0) { // round reed hut on stilts
      const pz = 5 + band * 2.5, r = 0.3 + band * 0.03;
      legs(cx - r, cy - r, r * 2, r * 2, 0, pz);
      A.cyl(cx, cy, r * 1.35, pz, 1.3, woodC());
      ladder(cx - r * 0.2, cy + r * 1.35, 0, pz);
      const wh = 7 + band * 1.5;
      A.cyl(cx, cy, r, pz + 1.3, wh, wallC());
      const [dx, dy] = A.P(cx - r * 0.1, cy + r, pz + 1.3); A.poly([[dx - 1.8, dy], [dx + 1.8, dy], [dx + 1.8, dy - 5.5], [dx - 1.8, dy - 5.5]], A.STY.door, null);
      const [wx, wy] = A.P(cx + r * 0.75, cy + r * 0.6, pz + 5); A.lamp([[wx - 1.2, wy], [wx + 1.2, wy], [wx + 1.2, wy - 2.8], [wx - 1.2, wy - 2.8]], '#3a4655', A.nightGlass());
      top = A.cone(cx, cy, r * 1.55, pz + 1.3 + wh, 9 + band * 2.5, roofC());
      const [tx, ty] = A.P(cx, cy, top); A.line([tx, ty], [tx, ty - 4], beamC(), 1); A.line([tx - 2, ty - 1], [tx + 2, ty - 5], beamC(), 0.7);
      if (band >= 1) perchArm(cx + r, cy, pz + 1.3 + wh - 1, 0.3, 0.05, i % 2 === 0);
      if (band >= 2) { A.cyl(cx + r * 1.4, cy - r * 1.2, r * 0.55, pz + 3, 5, wallC()); A.cone(cx + r * 1.4, cy - r * 1.2, r * 0.8, pz + 8, 6, roofC()); }
      if (band >= 3) chime(...A.P(cx + r * 1.2, cy + r * 1.2, pz + wh));
      top += 5;
    } else if (form === 1) { // a house on a rocky ledge
      const rh = 3 + band * 2.5;
      rockBase(x + 0.08, y + 0.08, s, s * 0.9, rh);
      crag(x + 0.15, y + s * 0.9 + 0.05, 0.45);
      const H = 8 + band * 2;
      const o = hut(x + 0.18, y + 0.18, s - 0.2, s * 0.9 - 0.25, rh, H, { axis: i % 2 ? 'x' : 'y' });
      A.door(o.b, 'L', (s - 0.2) * 0.4, 0.22, Math.min(7, H * 0.7));
      A.win(o.b, 'R', (s * 0.9 - 0.25) * 0.5, H * 0.35, 0.14, 4);
      if (band >= 2) { // jettied loft on the right
        const ub = A.box(x + s - 0.15, y + 0.3, 0.2, 0.42, rh + H * 0.4, 6, woodC());
        void ub;
      }
      if (i % 2 === 0) A.chimney(x + 0.35, y + 0.35, rh + H, 8, 'house', A.shade(A.STY.stone, -0.1));
      if (band >= 1) A.pennant(x + s + 0.02, y + 0.15, rh, 14 + band * 2);
      top = o.top + 4;
    } else { // narrow tower house with a perch gallery
      const tw = 0.5, H = 15 + band * 5 + (L % 5);
      const lean = A.box(x + 0.15, y + 0.6, 0.55, 0.42, 0, 7 + band, wallC()); A.planks(lean, A.shade(wallC(), -0.16));
      A.gable(lean, 6, roofC(), 'x', roofTex(), 0.1);
      const b = A.box(x + 0.6, y + 0.18, tw, tw, 0, H, ERA >= 2 ? stoneC() : wallC());
      ERA >= 2 ? A.courses(b, 4, A.shade(stoneC(), -0.12)) : A.timber(b, beamC());
      A.door(b, 'L', tw * 0.5, 0.2, 7);
      for (let v = 10; v < H - 3; v += 7) { A.win(b, 'L', tw * 0.5, v, 0.12, 3.5); A.win(b, 'R', tw * 0.5, v, 0.12, 3.5); }
      if (band >= 1) { deck(x + 0.52, y + 0.1, tw + 0.16, tw + 0.16, H, true); }
      top = A.hip({ x: x + 0.6, y: y + 0.18, w: tw, d: tw, z: band >= 1 ? H + 1.4 : 0, h: band >= 1 ? 0 : H }, 14 + band * 2, roofC(), 0.12);
      if (band >= 1) top = vane(x + 0.6 + tw / 2, y + 0.18 + tw / 2, top - 1, 0.8);
      if (band >= 2) perchArm(x + 0.6 + tw, y + 0.18 + tw * 0.5, H - 2, 0.3, 0.1, true);
      if (ERA >= 3) { const [sx, sy] = A.onL(b, tw * 0.5, tw * 0.5, H - 5, H - 5)[0]; storm(sx, sy, 1.3, false); }
      top += 3;
    }
    return top;
  });

  // ------------------------------------------------- farm: terraces, windbreak, windmill
  def('farm', ([x, y, w, d], L, band) => {
    let top = 12;
    // windmill in the back corner (grows; stock granaries stand at the right edge)
    if (band >= 1 || L >= 3) top = windmill(x + 0.55, y + 0.55, 0.32 + band * 0.04, 20 + band * 7 + L * 0.5, 13 + band * 2.5);
    // terraced plots stepping down toward the front, with dry-stone walls
    const rows = Math.min(3, 1 + band), wallH = [3, 4, 5, 5][band];
    for (let k = 0; k < rows; k++) {
      const tx = x + 0.15, ty = y + 1.05 + k * 0.38, tw = w - 0.75, td = 0.36, z = (rows - k - 1) * wallH;
      const b = A.box(tx, ty, tw, td, 0, z + 2, A.mix(A.STY.stone, ROCK, 0.3), { top: X.snow ? '#eef2f4' : X.season === 1 ? '#c9b24a' : X.season === 2 ? '#a8743a' : '#7cae4a' });
      if (!X.snow) for (let u = 0.1; u < tw; u += 0.16) A.line(A.P(tx + u, ty + 0.05, z + 2), A.P(tx + u, ty + td - 0.05, z + 2), X.season === 1 ? '#e2bf4a' : '#5e8f3e', 1.2);
      void b;
    }
    // reed windbreak along the back edge
    for (let u = 0.95; u < w - 0.2; u += 0.09) { const [px, py] = A.P(x + u, y + 0.25); A.line([px, py], [px + 1, py - 9 - (u * 13) % 3], X.snow ? '#c8ccc4' : '#b89a58', 1); }
    if (TECH('irrigation')) { const a = A.P(x + 0.15, y + 1.0, 1), b2 = A.P(x + w - 0.6, y + 1.0, 1); A.line(a, b2, '#4f8fb8', 2); A.line(a, [a[0], a[1] + 12], '#4f8fb8', 1.6); }
    if (band >= 2) { const o = hut(x + 1.2, y + 0.25, 0.55, 0.45, 0, 8, { axis: 'x' }); top = Math.max(top, o.top); }
    if (band >= 3) { const p = A.P(x + 0.25, y + 1.0); A.line(p, [p[0], p[1] - 26], beamC(), 1.3); const [dx, dy] = [p[0], p[1] - 26]; A.poly([[dx - 4, dy], [dx + 4, dy], [dx + 4, dy - 6], [dx - 4, dy - 6]], wallC()); A.poly([[dx - 5.5, dy - 6], [dx + 5.5, dy - 6], [dx, dy - 11]], snowy(roofC())); for (let k = 0; k < 3; k++) A.circ(dx - 2.5 + k * 2.5, dy - 3, 0.9, '#2a2018'); A.rec('birds', { x: dx, y: dy - 16, r: 10, n: 3, seed: RN() }); }
    A.rec('birds', { x: A.P(x + 1.2, y + 1.2, 30)[0], y: A.P(x + 1.2, y + 1.2, 30)[1], r: 14, n: 1 + band, seed: RN() });
    return top + 4;
  });

  // ------------------------------------------------- lumber: cliff log-slide, A-frame crane
  def('lumber', ([x, y, w, d], L, band) => {
    for (const [gx, gy, s] of [[x + 0.3, y + 0.3, 1.0], [x + 0.9, y + 0.2, 0.85], [x + 0.25, y + 1.0, 0.9], [x + 2.2, y + 0.3, 0.8]].slice(0, 4 - Math.min(2, band))) A.treePine(gx, gy, s);
    // the ridge the logs come down from
    rockBase(x + 0.2, y + 1.4, 0.8, 1.2, 10 + band * 3);
    A.treePine(x + 0.5, y + 1.7, 0.8);
    // log chute down to the yard
    const cz = 10 + band * 3, a = A.P(x + 1.0, y + 1.9, cz), b = A.P(x + 2.1, y + 2.6, 2);
    A.line(a, b, '#7a5434', 4); A.line([a[0], a[1] - 2], [b[0], b[1] - 2], '#9a7044', 1);
    for (let k = 0; k <= 3; k++) { const p = lerp2(a, b, k / 3); A.line(p, [p[0], p[1] + cz * (1 - k / 3) + 1], beamC(), 0.8); }
    A.log(x + 1.4, x + 1.75, y + 2.2, 6, 1.6);
    // sawyer's stilt hut
    const lz = 6 + band * 3;
    legs(x + 1.3, y + 0.6, 0.8, 0.6, 0, lz);
    deck(x + 1.25, y + 0.55, 0.9, 0.7, lz, true);
    ladder(x + 1.5, y + 1.25, 0, lz);
    const o = hut(x + 1.32, y + 0.62, 0.76, 0.56, lz + 1.4, 8 + band, { axis: 'x' });
    A.door(o.b, 'L', 0.38, 0.22, 6);
    let top = o.top;
    // A-frame crane from band 1
    if (band >= 1) {
      const fx = x + 2.2, fy = y + 1.3, H = 28 + band * 7 + L * 0.5;
      A.line(A.P(fx - 0.2, fy - 0.2), A.P(fx, fy, H), beamC(), 1.6); A.line(A.P(fx + 0.2, fy + 0.2), A.P(fx, fy, H), beamC(), 1.6);
      const tip = A.P(fx - 0.6, fy + 0.4, H - 4); A.line(A.P(fx, fy, H), tip, beamC(), 1.3);
      A.line(tip, [tip[0], tip[1] + 14], '#6a5a44', 0.6); A.log(fx - 0.85, fx - 0.4, fy + 0.4, H - 22, 1.5);
      top = Math.max(top, H);
    }
    if (band >= 2) { A.pennant(x + 2.2, y + 1.3, 28 + band * 7 + L * 0.5, 8); }
    if (TECH('sawpits') && band >= 2) A.logPile(x + 1.3, y + 1.5, 0.6, 2);
    return top + 4;
  });

  // ------------------------------------------------- quarry: terraced rock face, derrick hoist
  def('quarry', ([x, y, w, d], L, band) => {
    const col = A.mix(A.STY.stone2, ROCK, 0.3), tiers = 2 + Math.min(3, band + (L >= 3 ? 1 : 0));
    // a cut cliff at the back, stepping toward the viewer
    for (let k = 0; k < tiers; k++) {
      const tz = (tiers - k) * 6, b = A.box(x + 0.2, y + 0.2 + k * 0.35, w - 0.8, 0.4, 0, tz, A.shade(col, -0.04 * k));
      for (let u = 0.25; u < w - 0.8; u += 0.45) A.line(A.onL(b, u, u, 0.5, 0.5)[0], A.onL(b, u, u, tz - 0.5, tz - 0.5)[0], A.shade(col, -0.25), 0.6);
    }
    const fy = y + 0.2 + tiers * 0.35;
    A.box(x + 0.5, fy + 0.25, 0.3, 0.3, 0, 6, A.STY.stone2); A.box(x + 0.9, fy + 0.3, 0.26, 0.26, 0, 5, A.STY.stone);
    if (band >= 1) A.box(x + 0.6, fy + 0.3, 0.24, 0.24, 6, 5, A.STY.stone2);
    // wooden derrick hoisting a block off the top
    const dx = x + w - 0.45, dy = y + 0.6, H = 30 + band * 8 + L * 0.6;
    for (const [ox, oy] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) A.line(A.P(dx + ox, dy + oy), A.P(dx, dy, H), beamC(), 1.4);
    const boom = A.P(dx - 0.9, dy + 0.15, H - 6); A.line(A.P(dx, dy, H - 2), boom, beamC(), 1.6);
    A.line(boom, [boom[0], boom[1] + 18], '#6a5a44', 0.6);
    A.poly([[boom[0] - 3, boom[1] + 18], [boom[0] + 3, boom[1] + 18], [boom[0] + 3, boom[1] + 23], [boom[0] - 3, boom[1] + 23]], A.STY.stone2);
    const [wx, wy] = A.P(dx + 0.2, dy + 0.3, 4); A.circ(wx, wy, 4, null, '#5a4030'); A.line([wx - 4, wy], [wx + 4, wy], '#5a4030', 0.6); A.line([wx, wy - 4], [wx, wy + 4], '#5a4030', 0.6);
    if (band >= 2) { const dx2 = x + 0.4, dy2 = y + 0.3, H2 = H * 0.8; A.line(A.P(dx2 - 0.15, dy2), A.P(dx2, dy2, H2), beamC(), 1.2); A.line(A.P(dx2 + 0.15, dy2), A.P(dx2, dy2, H2), beamC(), 1.2); const bm = A.P(dx2 + 0.8, dy2 + 0.2, H2 - 4); A.line(A.P(dx2, dy2, H2), bm, beamC(), 1.2); A.line(bm, [bm[0], bm[1] + 12], '#6a5a44', 0.6); }
    if (band >= 3 || ERA >= 2) A.pennant(dx, dy, H, 8);
    ladder(x + 1.5, y + 0.2 + tiers * 0.35, 0, 6);
    return H + 8;
  });

  // ------------------------------------------------- mine: tunnel mouth in a crag, ore cableway
  def('mine', ([x, y, w, d], L, band) => {
    // crag the tunnel bores into (the stock hill is drawn too)
    cragStack(x + 0.75, y + 0.65, 0.3 + band * 0.03, 24 + band * 6 + L * 0.4, 3, 4);
    rockBase(x + 0.3, y + 0.55, 1.3, 0.85, 10 + band * 2);
    crag(x + 1.6, y + 0.6, 0.9);
    const [px, py] = A.P(x + 0.95, y + 1.4, 0);
    A.c.beginPath(); A.c.moveTo(px - 5, py); A.c.lineTo(px - 5, py - 7); A.c.lineTo(px, py - 10); A.c.lineTo(px + 5, py - 7); A.c.lineTo(px + 5, py); A.c.closePath(); A.c.fillStyle = A.F('#1f1a17'); A.c.fill();
    A.line([px - 5, py], [px - 5, py - 8], '#6a4a30', 1.6); A.line([px + 5, py], [px + 5, py - 8], '#6a4a30', 1.6); A.line([px - 6.5, py - 8], [px + 6.5, py - 8], '#6a4a30', 2);
    A.lantern(px + 7, py - 5, 1.5);
    // ore cableway from the crag top down to a stilted loading shed
    const pz = 10 + band * 2, top0 = A.P(x + 1.3, y + 0.75, pz + 12);
    A.line(A.P(x + 1.3, y + 0.75, pz), top0, beamC(), 1.6); A.line(A.P(x + 1.15, y + 0.75, pz), top0, beamC(), 1);
    const shed = [x + 1.85, y + 1.7];
    legs(shed[0] - 0.3, shed[1] - 0.25, 0.6, 0.5, 0, 6 + band);
    const o = hut(shed[0] - 0.3, shed[1] - 0.25, 0.6, 0.5, 6 + band, 7, { axis: 'x' });
    const end = A.P(shed[0], shed[1] - 0.25, 6 + band + 10);
    A.line(top0, end, '#4a3a2a', 0.7);
    for (let k = 1; k <= 1 + band; k++) { const p = lerp2(top0, end, k / (2 + band)); A.line(p, [p[0], p[1] + 3], '#4a3a2a', 0.5); A.poly([[p[0] - 2, p[1] + 3], [p[0] + 2, p[1] + 3], [p[0] + 1.5, p[1] + 6], [p[0] - 1.5, p[1] + 6]], '#6a5a4a'); }
    // rails out of the tunnel
    A.line(A.P(x + 0.85, y + 1.4), A.P(x + 0.85, y + 2.25), '#5a5a60', 1); A.line(A.P(x + 1.05, y + 1.4), A.P(x + 1.05, y + 2.25), '#5a5a60', 1);
    A.box(x + 0.78, y + 2.0, 0.34, 0.24, 1, 3.5, '#6a5a4a');
    if (band >= 2) A.pennant(x + 1.3, y + 0.75, pz + 12, 8);
    return Math.max(o.top, 30 + band * 6 + L * 0.4);
  });

  // ------------------------------------------------- warehouse: stacked stilted store with a rope lift
  def('warehouse', ([x, y, w, d], L, band) => {
    const bx = x + 0.25, by = y + 0.25, bw = w - 0.75, bd = d - 0.8;
    const pz = 6 + band * 1.5;
    legs(bx, by, bw, bd, 0, pz);
    deck(bx - 0.08, by - 0.08, bw + 0.16, bd + 0.16, pz, false);
    const floors = 1 + Math.min(2, band) + (band >= 3 ? 1 : 0);
    let z = pz + 1.4, b = null;
    for (let f = 0; f < floors; f++) {
      const inset = f * 0.08, fh = 10;
      b = A.box(bx + inset, by + inset, bw - inset * 2, bd - inset * 2, z, fh, f === 0 && ERA >= 2 ? stoneC() : wallC());
      A.planks(b, A.shade(wallC(), -0.16));
      A.poly(A.onL(b, (bw - inset * 2) * 0.4, (bw - inset * 2) * 0.6, 0.5, 7.5), A.STY.door, null);
      A.win(b, 'R', (bd - inset * 2) * 0.5, 4, 0.18, 3);
      z += fh;
    }
    let top = A.gable(b, bd * 18, roofC(), 'y', roofTex(), 0.18);
    ropeLift(bx + bw * 0.5, by + bd + 0.05, pz, z + 3, 'crate');
    // woven baskets hanging under the deck
    for (let k = 0; k < 1 + band; k++) { const [hx, hy] = A.P(bx + 0.2 + k * 0.3, by + bd + 0.08, pz); A.line([hx, hy], [hx, hy + 3], '#6a5a44', 0.5); A.c.beginPath(); A.c.ellipse(hx, hy + 5, 2.2, 2, 0, 0, Math.PI * 2); A.c.fillStyle = A.F('#c9a874'); A.c.fill(); }
    if (band >= 2) top = vane(bx + bw / 2, by + bd / 2, top - 1);
    if (ERA >= 3) { const [sx, sy] = A.onL(b, bw * 0.5 - 0.1, 0, 7, 7)[0]; storm(sx, sy, 1.3, false); }
    return top + 4;
  });

  // ------------------------------------------------- market: sail-cloth pavilions round a tall mast
  def('market', ([x, y, w, d], L, band) => {
    const cx = x + 1.0, cy = y + 0.95, H = 28 + band * 8 + L;
    const n = 3 + Math.min(4, band + Math.floor(L / 4));
    const mast = A.P(cx, cy, H);
    // sails from the mast down to posts (back ones first)
    const posts = [];
    for (let k = 0; k < n; k++) { const a = Math.PI * 1.05 + k / n * Math.PI * 2; posts.push([cx + Math.cos(a) * 0.85, cy + Math.sin(a) * 0.75, a]); }
    posts.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
    const sailsDrawn = (front) => {
      for (let k = 0; k < posts.length; k++) {
        const [gx, gy] = posts[k]; const isFront = gx + gy > cx + cy; if (isFront !== front) continue;
        const ph = 10 + (k % 2) * 2;
        A.line(A.P(gx, gy), A.P(gx, gy, ph), beamC(), 1.2);
        const nb = posts[(k + 1) % posts.length];
        const p1 = A.P(gx, gy, ph), p2 = A.P(nb[0], nb[1], 11), m = A.P(cx, cy, H * 0.62);
        A.poly([p1, [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 - 2], m], snowy(cloth(k)), A.OUT, 0.5);
        A.line(p1, mast, '#6a5a44', 0.4);
      }
    };
    sailsDrawn(false);
    A.line(A.P(cx, cy), mast, beamC(), 2);
    if (band >= 2) { A.cyl(cx, cy, 0.18, 0, 4, A.STY.stone2); }
    // trading tables under the canopy
    A.box(cx - 0.35, cy - 0.15, 0.3, 0.3, 0, 4, woodC()); A.box(cx + 0.1, cy + 0.1, 0.3, 0.3, 0, 4, woodC());
    A.sack(cx - 0.2, cy + 0.4); A.barrel(cx + 0.5, cy - 0.3);
    sailsDrawn(true);
    let top = vane(cx, cy, H, 1.1);
    flags(A.P(cx, cy, H - 2), A.P(x + w - 0.3, y + 0.3, 14), 5 + band, 4);
    if (band >= 1) flags(A.P(cx, cy, H - 4), A.P(x + 0.3, y + d - 0.35, 12), 4 + band, 4, 1);
    if (TECH('guilds') && band >= 2) { const o = hut(x + 1.75, y + 0.2, 0.5, 0.5, 0, 12, { axis: 'y', hip: true }); top = Math.max(top, o.top); }
    if (ERA >= 3) { storm(mast[0], mast[1] - 4, 2); }
    return top + 2;
  });

  // ------------------------------------------------- barracks: open-sided hall + lookout perch
  def('barracks', ([x, y, w, d], L, band) => {
    const hx = x + 0.3, hy = y + 0.3, hw = w - 0.9, hd = 1.0 + band * 0.1, H = 12 + band * 3;
    let top = 0;
    if (band >= 1) top = spire(x + w - 0.45, y + 0.4, 0.2 + band * 0.02, 30 + band * 8 + L, { perches: 1 + Math.floor(band / 2) });
    // closed back half, open colonnade front
    const back = A.box(hx, hy, hw, hd * 0.45, 0, H, ERA >= 2 ? stoneC() : wallC());
    ERA >= 2 ? A.courses(back, 4, A.shade(stoneC(), -0.12)) : A.planks(back, A.shade(wallC(), -0.16));
    for (let u = 0.2; u < hw; u += 0.45) A.win(back, 'L', u, H * 0.55, 0.12, 3);
    // spear racks along the back wall
    for (let u = 0.15; u < hw - 0.1; u += 0.12) { const p = A.P(hx + u, hy + hd * 0.45 + 0.05, 1); A.line(p, [p[0] + 0.5, p[1] - 11], '#8a7a6a', 0.6); A.poly([[p[0] + 0.5, p[1] - 11], [p[0] - 0.3, p[1] - 9], [p[0] + 1.2, p[1] - 9]], '#c8ccd2', null); }
    for (let u = 0; u <= hw + 0.01; u += hw / Math.max(2, Math.round(hw / 0.4))) A.line(A.P(hx + u, hy + hd), A.P(hx + u, hy + hd, H), ERA >= 2 ? stoneC() : beamC(), ERA >= 2 ? 2.2 : 1.6);
    A.line(A.P(hx + hw, hy), A.P(hx + hw, hy, H), beamC(), 1.6);
    const roofB = { x: hx, y: hy, w: hw, d: hd, z: 0, h: H, col: wallC() };
    top = Math.max(top, A.gable(roofB, hd * 18, roofC(), 'x', roofTex(), 0.15));
    if (band >= 2) { // upper roost loft on the ridge
      const lb = A.box(hx + hw * 0.35, hy + hd * 0.25, hw * 0.3, hd * 0.5, top - 4, 6, woodC());
      for (let k = 0; k < 3; k++) { const [px, py] = A.onL(lb, hw * 0.3 * (k + 0.5) / 3, 0, 1, 1)[0]; A.c.beginPath(); A.c.arc(px, py - 2.2, 1.6, Math.PI, 0); A.c.fillStyle = A.F('#2a2018'); A.c.fill(); }
      A.gable(lb, 5, roofC(), 'x', null, 0.06);
    }
    // perch poles for the hawk riders along the front
    for (let k = 0; k < Math.min(5, 1 + Math.floor(L / 3)); k++) { const gx = hx + 0.2 + k * 0.4, gy = y + d - 0.5; const p = A.P(gx, gy); A.line(p, [p[0], p[1] - 10], beamC(), 1); A.line([p[0] - 2.5, p[1] - 10], [p[0] + 2.5, p[1] - 10], beamC(), 0.9); if (k % 2 === 0) hawk(p[0], p[1] - 10); }
    A.pennant(hx + 0.05, hy + hd, H, 14);
    return top + 6;
  });

  // ------------------------------------------------- stable: the mews — tall cages and nest boxes for great birds
  def('stable', ([x, y, w, d], L, band) => {
    const mx = x + 0.3, my = y + 0.3, mw = w - 1.0, md = 0.9, H = 16 + band * 5;
    // tall open frame
    const corners = [[mx, my], [mx + mw, my], [mx, my + md], [mx + mw, my + md]];
    for (const [gx, gy] of corners.slice(0, 2)) A.line(A.P(gx, gy), A.P(gx, gy, H), beamC(), 1.6);
    // nest boxes stacked on the back wall
    const nb = A.box(mx, my, mw, 0.25, 0, H, woodC());
    const cols = Math.max(2, Math.round(mw / 0.45)), rows = 1 + Math.min(3, band + (L >= 3 ? 1 : 0));
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) { const [px, py] = A.onL(nb, mw * (k + 0.5) / cols, 0, 2 + r * (H / rows), 0)[0]; A.c.beginPath(); A.c.ellipse(px, py - 2.5, 2.4, 2.6, 0, 0, Math.PI * 2); A.c.fillStyle = A.F('#2a2018'); A.c.fill(); if ((k + r) % 3 === 0) { A.circ(px, py - 3, 1.2, '#7a5a3a'); A.circ(px + 0.8, py - 3.2, 0.4, '#e0b040'); } }
    // straw floor and a perch bar with a big hawk
    A.poly(A.quad(mx, my + 0.25, mw, md - 0.25), X.snow ? '#e8ecee' : '#d9b65a', null);
    const bar = [A.P(mx + 0.1, my + 0.6, H * 0.55), A.P(mx + mw - 0.1, my + 0.6, H * 0.55)]; A.line(bar[0], bar[1], beamC(), 1.4);
    const mid = lerp2(bar[0], bar[1], 0.5); roc(mid[0], mid[1], 0.55 + band * 0.08, '#7a5a3a');
    for (const [gx, gy] of corners.slice(2)) A.line(A.P(gx, gy), A.P(gx, gy, H), beamC(), 1.6);
    // net-like slats across the front face
    for (let k = 1; k < 4; k++) A.line(A.P(mx, my + md, H * k / 4), A.P(mx + mw, my + md, H * k / 4), '#8a6440', 0.5);
    const top = A.gable({ x: mx, y: my, w: mw, d: md, z: 0, h: H, col: woodC() }, md * 16, roofC(), 'x', roofTex(), 0.14);
    // band 3: a great roc on its own crag perch
    if (band >= 3) { const cz = cragStack(x + w - 0.5, y + 0.55, 0.22, 14, 3) - 4; const [rx, ry] = A.P(x + w - 0.5, y + 0.55, cz); roc(rx, ry, 1.1); }
    else if (band >= 1) { const p = A.P(x + w - 0.5, y + 0.6); A.line(p, [p[0], p[1] - 16], beamC(), 1.3); A.line([p[0] - 4, p[1] - 16], [p[0] + 4, p[1] - 16], beamC(), 1.1); hawk(p[0] + 2, p[1] - 16); }
    A.haystack(x + 0.5, y + d - 0.5, 0.45);
    A.rec('birds', { x: A.P(x + 1.4, y + 1.2, H + 18)[0], y: A.P(x + 1.4, y + 1.2, H + 18)[1], r: 16, n: 1 + band, seed: RN() });
    return Math.max(top, band >= 3 ? 34 : 0) + 4;
  });

  // ------------------------------------------------- war pit: a raised sky-ring on stilts
  def('warpit', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, r = 0.8 + band * 0.08, pz = 4 + band * 3;
    // stilts round the ring
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (Math.sin(a) < 0.1) A.line(A.P(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85), A.P(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, pz), ERA >= 2 ? stoneC() : beamC(), ERA >= 2 ? 3 : 1.6); }
    const [ex, ey, rx, ry] = A.ell(cx, cy, pz, r);
    A.c.beginPath(); A.c.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); A.c.fillStyle = A.F(X.snow ? '#e4e8ea' : '#c9a874'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.8; A.c.stroke();
    A.c.beginPath(); A.c.ellipse(ex, ey, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); A.c.strokeStyle = A.F('#a07a4a'); A.c.lineWidth = 0.8; A.c.stroke();
    A.c.beginPath(); A.c.ellipse(ex, ey + 2, rx, ry, 0, 0, Math.PI); A.c.strokeStyle = A.F(woodC()); A.c.lineWidth = 2.5; A.c.stroke();
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; if (Math.sin(a) >= 0.1) A.line(A.P(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85), A.P(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85, pz), ERA >= 2 ? stoneC() : beamC(), ERA >= 2 ? 3 : 1.6); }
    // rope rail with posts
    for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI; A.line([ex + Math.cos(a) * rx, ey + Math.sin(a) * ry], [ex + Math.cos(a) * rx, ey + Math.sin(a) * ry - 5], beamC(), 0.8); }
    A.c.beginPath(); A.c.ellipse(ex, ey - 5, rx, ry, 0, 0, Math.PI); A.c.strokeStyle = A.F('#cdbf98'); A.c.lineWidth = 0.7; A.c.stroke();
    A.rec('pit', { x: ex, y: ey, rx: rx * 0.6, ry: ry * 0.6 });
    // pennant poles round the ring, one more per growth band
    for (let k = 0; k < 2 + band; k++) { const a = -Math.PI * 0.9 + k * 0.7; A.pennant(cx + Math.cos(a) * r * 1.05, cy + Math.sin(a) * r * 1.05, pz, 18 + band * 3, cloth(k)); }
    if (band >= 2) A.box(x + 0.15, y + d - 0.55, 0.4, 0.4, 0, pz, woodC());   // judge's stand
    return pz + 26 + band * 3;
  });

  // ------------------------------------------------- workshop: glider-wright's shed with kites
  def('workshop', ([x, y, w, d], L, band) => {
    const sx = x + 0.15, sy = y + 0.15, sw = 1.35, sd = 0.9, H = 13 + band * 2;
    const back = A.box(sx, sy, sw, 0.12, 0, H, woodC()); void back;
    for (const [px, py] of [[sx, sy + sd], [sx + sw, sy + sd], [sx + sw, sy]]) A.line(A.P(px, py), A.P(px, py, H), beamC(), 1.6);
    A.poly([A.P(sx - 0.08, sy - 0.08, H + 6), A.P(sx + sw + 0.08, sy - 0.08, H + 6), A.P(sx + sw + 0.08, sy + sd + 0.1, H), A.P(sx - 0.08, sy + sd + 0.1, H)], snowy(roofC()));
    A.box(sx + 0.2, sy + 0.4, 0.7, 0.3, 0, 5, '#9a7046');
    // a glider frame on trestles: feathered wings of cloth and cane
    const gx = x + 1.85, gy = y + 0.7, gz = 7 + band;
    A.line(A.P(gx - 0.2, gy), A.P(gx - 0.2, gy, gz), beamC(), 1); A.line(A.P(gx + 0.2, gy + 0.1), A.P(gx + 0.2, gy + 0.1, gz), beamC(), 1);
    const c0 = A.P(gx, gy, gz + 1), wl = [c0[0] - 14 - band * 2, c0[1] + 2], wr = [c0[0] + 14 + band * 2, c0[1] - 2];
    A.poly([c0, wl, [wl[0] + 6, wl[1] + 4], [c0[0], c0[1] + 4], [wr[0] - 6, wr[1] + 4], wr], snowy('#efe2c4'), '#5a4030', 0.6);
    for (const t of [0.35, 0.7]) { A.line(c0, lerp2(c0, wl, t).map((v, i) => v + (i ? 4 * t : 0)), '#8a6440', 0.5); A.line(c0, lerp2(c0, wr, t).map((v, i) => v + (i ? 4 * t : 0)), '#8a6440', 0.5); }
    A.line([c0[0], c0[1]], [c0[0] + 2, c0[1] + 9], '#8a6440', 0.8);
    // kites hanging from the eaves
    for (let k = 0; k < 1 + band; k++) { const [kx, ky] = A.P(sx + 0.25 + k * 0.32, sy + sd + 0.1, H); A.line([kx, ky], [kx, ky + 3], '#6a5a44', 0.5); A.poly([[kx, ky + 3], [kx + 2.4, ky + 6], [kx, ky + 10], [kx - 2.4, ky + 6]], cloth(k), A.OUT, 0.4); }
    // band 2+: a launch ramp jutting out from a rock
    if (band >= 2) { rockBase(x + w - 0.6, y + 0.1, 0.45, 0.45, 8); const a = A.P(x + w - 0.4, y + 0.3, 8), b = A.P(x + w - 0.4, y + 1.0, 12); A.line(a, b, woodC(), 3); A.line(b, [b[0], b[1] + 12], beamC(), 0.8); }
    if (band >= 3) A.pennant(sx + sw, sy, H + 6, 10);
    return H + 14;
  });

  // ------------------------------------------------- smelter: wind-furnace with a scoop cowl
  def('smelter', ([x, y, w, d], L, band) => {
    let top = 0;
    const n = 1 + Math.min(2, band);
    const spots = [[x + 1.1, y + 0.6], [x + 0.6, y + 1.3], [x + 1.6, y + 1.3]];
    for (let k = 0; k < n; k++) {
      const [cx, cy] = spots[k], H = 22 + band * 5 + (k ? -4 : L * 0.4);
      const col = ERA >= 2 ? A.STY.stone2 : A.mix(A.STY.stone, ROCK, 0.4);
      // tapered stone kiln
      const [x0, y0] = A.P(cx, cy), rx = 0.32 * A.SQ2 * A.HW, ry = 0.32 * A.SQ2 * A.HH;
      A.c.beginPath(); A.c.moveTo(x0 - rx, y0); A.c.lineTo(x0 - rx * 0.55, y0 - H); A.c.lineTo(x0 + rx * 0.55, y0 - H); A.c.lineTo(x0 + rx, y0); A.c.ellipse(x0, y0, rx, ry, 0, 0, Math.PI); A.c.closePath(); A.gradFill(x0 - rx, x0 + rx, col);
      for (let v = 4; v < H - 2; v += 4) A.line([x0 - rx * (1 - v / H * 0.45), y0 - v], [x0 + rx * (1 - v / H * 0.45), y0 - v], A.shade(col, -0.18), 0.4);
      A.lampDot(x0 - 1, y0 - 3, 2.6, '#7a3a1a', '#ffb04a'); A.rec('lights', { x: x0 - 1, y: y0 - 3, r: 14 });
      // the wind scoop: a cowl on top, mouth turned to the wind
      A.poly([[x0 - rx * 0.55, y0 - H], [x0 + rx * 0.55, y0 - H], [x0 + rx * 0.9, y0 - H - 7], [x0 - rx * 0.2, y0 - H - 9]], A.shade(col, -0.1));
      A.c.beginPath(); A.c.ellipse(x0 + rx * 0.35, y0 - H - 8, rx * 0.55, 2.2, -0.2, 0, Math.PI * 2); A.c.fillStyle = A.F('#2a1e18'); A.c.fill();
      A.rec('smoke', { x: x0 - 2, y: y0 - H - 2, kind: 'smelter', seed: RN(), dark: true });
      top = Math.max(top, H + 10);
    }
    // a little wind wheel driving the bellows
    const [wx, wy] = A.P(x + 0.45, y + 0.5, 0); A.line([wx, wy], [wx, wy - 18 - band * 2], beamC(), 1.4); sails(wx, wy - 18 - band * 2, 8 + band, RN() * 2);
    A.box(x + 0.5, y + 0.6, 0.3, 0.2, 0, 4, '#6a4a30');
    A.rock(x + 0.4, y + d - 0.5, 0.5, '#8a5a3a'); A.rock(x + 0.7, y + d - 0.45, 0.4, '#6a5a50');
    return top;
  });

  // ------------------------------------------------- smithy: open forge under a lean roof, wind bellows
  def('smithy', ([x, y, w, d], L, band) => {
    const sx = x + 0.25, sy = y + 0.3, sw = 1.4, sd = 1.0, H = 12 + band * 2.5;
    const hb = A.box(sx, sy, 0.45, sd, 0, H, A.mix(A.STY.stone, ROCK, 0.3)); A.courses(hb, 3.5, A.shade(A.STY.stone, -0.2));   // forge hearth wall
    A.lampDot(...A.onR(hb, sd * 0.5, sd * 0.5, 4, 4)[0], 2.8, '#7a3a1a', '#ffb04a'); A.rec('lights', { x: A.onR(hb, sd * 0.5, 0, 4, 0)[0][0], y: A.onR(hb, sd * 0.5, 0, 4, 0)[0][1], r: 18 });
    A.chimney(sx + 0.1, sy + 0.3, H, 10 + band * 3, 'smithy', A.shade(A.STY.stone, -0.1));
    for (const [px, py] of [[sx + sw, sy], [sx + sw, sy + sd]]) A.line(A.P(px, py), A.P(px, py, H - 3), beamC(), 1.6);
    A.poly([A.P(sx, sy - 0.08, H + 2), A.P(sx + sw + 0.1, sy - 0.08, H - 3), A.P(sx + sw + 0.1, sy + sd + 0.1, H - 3), A.P(sx, sy + sd + 0.1, H + 2)], snowy(roofC()));
    // anvil and the smith
    const [ax, ay] = A.P(sx + 0.85, sy + 0.6);
    A.poly([[ax - 3, ay], [ax + 3, ay], [ax + 1.5, ay - 3], [ax + 4, ay - 4.5], [ax - 4, ay - 4.5], [ax - 1.5, ay - 3]], '#3a3a40');
    A.rec('anvils', { x: ax, y: ay - 5 });
    // hand-sized wind wheel pumping the bellows, on the hearth wall
    const [wx, wy] = A.P(sx, sy + sd * 0.5, H + 6); A.line(A.P(sx, sy + sd * 0.5, H), [wx, wy], beamC(), 1); sails(wx, wy, 7 + band, RN() * 2);
    // racks of talon-blades along the front
    for (let k = 0; k < Math.min(4, 1 + Math.floor(L / 4)); k++) { const p = A.P(x + w - 0.45, y + 0.4 + k * 0.3); A.line(p, [p[0], p[1] - 9], '#5a4030', 1); A.c.beginPath(); A.c.moveTo(p[0], p[1] - 9); A.c.quadraticCurveTo(p[0] + 4, p[1] - 9, p[0] + 3, p[1] - 4); A.c.strokeStyle = A.F('#c8ccd2'); A.c.lineWidth = 1; A.c.stroke(); }
    if (band >= 2) { const o = hut(sx + 0.55, sy - 0.05, 0.8, 0.35, H - 3, 6, { axis: 'x', horns: false }); void o; }
    return H + 12 + band * 3;
  });

  // ------------------------------------------------- armory: a tall narrow keep of racks, shield with a hawk
  def('armory', ([x, y, w, d], L, band) => {
    const bx = x + 0.6, by = y + 0.5, bw = 0.9, bd = 0.9, H = 22 + band * 7 + L * 0.5;
    const col = ERA >= 2 ? stoneC() : wallC();
    if (band >= 1) { const side = hut(x + 0.25, y + 1.45, 0.9, 0.5, 0, 10, { axis: 'x' }); A.door(side.b, 'L', 0.45, 0.2, 7); }
    const b = A.box(bx, by, bw, bd, 0, H, col);
    ERA >= 2 ? A.courses(b, 4.5, A.shade(col, -0.12)) : A.timber(b, beamC());
    A.door(b, 'L', bw * 0.5, 0.26, 9);
    for (let v = 14; v < H - 4; v += 9) { A.win(b, 'L', bw * 0.5, v, 0.1, 4); A.win(b, 'R', bd * 0.5, v, 0.1, 4); }
    // the shield: blue roundel with a gold hawk
    const [shx, shy] = A.onR(b, bd * 0.5, bd * 0.5, H * 0.5, H * 0.5)[0];
    A.circ(shx, shy, 4.4, A.STY.roof, A.OUT); A.poly([[shx - 3, shy - 0.5], [shx, shy + 0.8], [shx + 3, shy - 0.5], [shx, shy + 2.6]], '#e0b440', null); A.circ(shx, shy - 1, 1, '#e0b440');
    // overhanging gallery with crossed spears
    deck(bx - 0.1, by - 0.1, bw + 0.2, bd + 0.2, H, true);
    let top = A.hip({ x: bx, y: by, w: bw, d: bd, z: H + 1.4, h: 0 }, 16 + band * 2, roofC(), 0.16, roofTex());
    top = vane(bx + bw / 2, by + bd / 2, top - 1);
    const sp = A.P(bx + bw, by + bd, H + 2); A.line([sp[0] - 5, sp[1] + 3], [sp[0] + 4, sp[1] - 9], '#8a7a6a', 0.8); A.line([sp[0] + 5, sp[1] + 3], [sp[0] - 4, sp[1] - 9], '#8a7a6a', 0.8);
    if (band >= 2) perchArm(bx + bw, by + bd * 0.3, H - 3, 0.4, 0, true);
    if (TECH('metallurgy')) { const [mx, my] = A.onL(b, bw * 0.2, 0, H - 6, 0)[0]; A.poly([[mx - 2, my], [mx + 2, my], [mx + 2, my - 4], [mx - 2, my - 4]], '#c8ccd2'); }
    return top + 2;
  });

  // ------------------------------------------------- academy: observatory tower and map-room
  def('academy', ([x, y, w, d], L, band) => {
    let top = 0;
    const tx = x + 1.65, ty = y + 0.45, H = 26 + band * 8 + L * 0.6;
    // observatory tower at the back right
    const col = ERA >= 2 ? stoneC() : wallC();
    A.cyl(tx, ty, 0.36, 0, H, col);
    for (let v = 9; v < H - 4; v += 9) { const [wx, wy] = A.P(tx + 0.18, ty + 0.3, v); A.lamp([[wx - 1, wy], [wx + 1, wy], [wx + 1, wy - 4], [wx - 1, wy - 4]], '#3a4655', A.nightGlass()); }
    A.cyl(tx, ty, 0.46, H, 1.5, woodC());
    top = A.dome(tx, ty, 0.36, H + 1.5, 10 + band, ERA >= 3 ? '#c8d8e8' : band >= 2 ? '#8aa8c8' : roofC());
    // the slit and the telescope
    const [ox, oy] = A.P(tx, ty + 0.2, H + 6); A.line([ox, oy], [ox + 9, oy - 8 - band], '#c9a03a', 2.2);
    cups(tx - 0.2, ty - 0.2, top - 2);
    // map-room hall in front
    const o = hut(x + 0.25, y + 0.55, 1.3, 1.0, 0, 11 + band * 2, { axis: 'y' });
    A.door(o.b, 'L', 0.65, 0.26, 8);
    A.win(o.b, 'R', 0.3, 5, 0.14, 4); A.win(o.b, 'R', 0.7, 5, 0.14, 4);
    top = Math.max(top, o.top);
    // cartography: a big globe on a stand / chart line strung with maps
    if (TECH('cartography') || band >= 2) { const [gx, gy] = A.P(x + 1.8, y + 1.4, 0); A.line([gx, gy], [gx, gy - 6], '#5a4030', 1.2); A.circ(gx, gy - 9, 3.4, '#5a8ab8', A.OUT); A.line([gx - 3.4, gy - 9], [gx + 3.4, gy - 9], '#e8dcc4', 0.5); A.c.beginPath(); A.c.ellipse(gx, gy - 9, 1.5, 3.4, 0, 0, Math.PI * 2); A.c.strokeStyle = A.F('#e8dcc4'); A.c.lineWidth = 0.5; A.c.stroke(); }
    if (band >= 1) { const a = A.P(x + 0.9, y + 1.05, o.top - 2), b2 = A.P(tx, ty, H - 2); flags(a, b2, 3 + band, 4); }
    if (ERA >= 3) { const [sx, sy] = A.P(tx, ty, top + 2); storm(sx, sy, 1.8); }
    return Math.max(top, H + 12);
  });

  // ------------------------------------------------- tavern: the Roost — tall, with balconies and a feather sign
  def('tavern', ([x, y, w, d], L, band) => {
    const bx = x + 0.2, by = y + 0.25, bw = w - 0.5, bd = d - 0.75;
    const floors = 2 + Math.min(2, band) + (band >= 3 && L >= 18 ? 1 : 0);
    let z = 0, b;
    const fh = 10;
    for (let f = 0; f < floors; f++) {
      const jut = f * 0.06;
      b = A.box(bx - jut, by - jut, bw + jut * 2, bd + jut * 2, z, fh, f === 0 && ERA >= 2 ? stoneC() : wallC());
      f === 0 && ERA >= 2 ? A.courses(b, 4, A.shade(stoneC(), -0.12)) : A.timber(b, beamC());
      if (f === 0) A.door(b, 'L', (bw + jut * 2) * 0.5, 0.26, 8);
      else A.win(b, 'L', (bw + jut * 2) * 0.5, 3, 0.16, 4.5);
      const n = Math.max(2, Math.round(bd / 0.5)); for (let k = 0; k < n; k++) A.win(b, 'R', (bd + jut * 2) * (k + 0.5) / n, 3, 0.14, 4.5);
      if (f >= 1) { // balcony on the right face
        A.line(A.P(bx + bw + jut + 0.15, by, z + 1), A.P(bx + bw + jut + 0.15, by + bd, z + 1), woodC(), 2); A.line(A.P(bx + bw + jut + 0.15, by, z + 5), A.P(bx + bw + jut + 0.15, by + bd, z + 5), beamC(), 0.7);
      }
      z += fh;
    }
    let top = A.gable(b, (bw + 0.1) * 20, roofC(), 'y', roofTex(), 0.16);
    A.chimney(bx + 0.15, by + 0.2, z, 10, 'house', A.shade(A.STY.stone, -0.1));
    // the hanging feather sign
    const [sx, sy] = A.P(bx + bw, by + bd + 0.05, 9); A.line([sx, sy], [sx + 6, sy - 2], beamC(), 1.2); A.poly([[sx + 3, sy - 1], [sx + 9, sy - 3], [sx + 9, sy + 3], [sx + 3, sy + 5]], A.STY.roof); A.line([sx + 4.5, sy + 3], [sx + 7.8, sy - 1.5], '#f4ead2', 1.6);
    A.lantern(...A.P(bx + bw * 0.2, by + bd + 0.05, 9), 1.4);
    if (band >= 1) perchArm(bx + bw, by + bd * 0.3, z - 2, 0.35, 0, true);
    if (band >= 2) chime(...A.P(bx + bw + 0.1, by + bd + 0.1, z - 1));
    if (band >= 3) top = vane(bx + bw / 2, by + bd / 2, top - 1);
    // benches outside
    A.box(x + 0.25, y + d - 0.35, 0.5, 0.12, 0, 3, woodC());
    return top + 4;
  });

  // ------------------------------------------------- theatre: open-air amphitheatre on a ledge, sail backdrop
  def('theatre', ([x, y, w, d], L, band) => {
    const rows = 2 + Math.min(3, band + (L >= 3 ? 1 : 0));
    // ledge with stepped seats at the back
    rockBase(x + 0.1, y + 0.1, w - 0.3, 0.55, rows * 3 + 2);
    for (let r = 0; r < rows; r++) { const z = (rows - r) * 3, b = A.box(x + 0.2, y + 0.15 + r * 0.12, w - 0.5, 0.12, z - 3 + 2, 3, A.STY.stone2, { noSnow: false }); void b; }
    // little audience
    for (let k = 0; k < rows * 2; k++) { const r = k % rows, u = 0.3 + ((k * 0.37) % (w - 0.9)); const [px, py] = A.P(x + u, y + 0.2 + r * 0.12, (rows - r) * 3 + 2); A.circ(px, py - 3, 1.2, '#d9a57a'); A.poly([[px - 1.4, py - 2], [px + 1.4, py - 2], [px + 1.4, py + 0.5], [px - 1.4, py + 0.5]], cloth(k), null); }
    // stage in front with a sail backdrop strung between two masts
    const sx = x + 0.55, sy = y + 0.85, sw = 1.3, sd = 0.45, sz = 3 + band;
    A.box(sx, sy, sw, sd, 0, sz, woodC());
    const mh = 22 + band * 5;
    const m1 = A.P(sx, sy, mh), m2 = A.P(sx + sw, sy, mh);
    A.line(A.P(sx, sy, sz), m1, beamC(), 1.4); A.line(A.P(sx + sw, sy, sz), m2, beamC(), 1.4);
    A.poly([A.P(sx, sy, mh - 2), A.P(sx + sw, sy, mh - 2), A.P(sx + sw * 0.85, sy, sz + 3), [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2 + mh - sz - 6], A.P(sx + sw * 0.15, sy, sz + 3)], snowy(ERA >= 2 ? A.STY.roof : '#efe2c4'), A.OUT, 0.6);
    const ctr = A.P(sx + sw / 2, sy, mh * 0.6); A.circ(ctr[0], ctr[1], 3, '#e0b440'); A.poly([[ctr[0] - 3, ctr[1]], [ctr[0], ctr[1] + 1.2], [ctr[0] + 3, ctr[1]], [ctr[0], ctr[1] + 2.8]], A.STY.trim, null);
    A.pennant(sx, sy, mh, 8, cloth(0)); A.pennant(sx + sw, sy, mh, 8, cloth(2));
    flags(m1, m2, 5 + band, 3);
    for (const u of [0.1, sw - 0.1]) A.lantern(...A.P(sx + u, sy + sd, sz + 6), 1.3);
    return mh + 12;
  });

  // ------------------------------------------------- temple: sky shrine — a tiered tower of wing-eaves and bells
  def('temple', ([x, y, w, d], L, band) => {
    const cx = x + w / 2 - 0.05, cy = y + d / 2 - 0.05;
    rockBase(cx - 0.65, cy - 0.65, 1.3, 1.3, 4);
    const tiers = 2 + Math.min(3, band + (L >= 3 ? 1 : 0));
    let z = 4, s = 0.55, top = 0;
    const col = ERA >= 2 ? stoneC() : wallC();
    for (let k = 0; k < tiers; k++) {
      const h = k === 0 ? 11 : 8;
      const b = A.box(cx - s, cy - s, 2 * s, 2 * s, z, h, col);
      if (k === 0) A.archDoor ? A.archDoor(b, 'L', s, 0.3, 8) : A.door(b, 'L', s, 0.3, 8);
      else { const q = A.onL(b, s - 0.12, s + 0.12, 2, h - 1.5); A.c.beginPath(); A.c.moveTo(q[0][0], q[0][1]); A.c.lineTo(q[1][0], q[1][1]); A.c.lineTo(q[2][0], q[2][1]); A.c.lineTo(q[3][0], q[3][1]); A.c.closePath(); A.c.fillStyle = A.F('#2a2018'); A.c.fill(); const [bx2, by2] = A.onL(b, s, s, h - 3, 0)[0]; A.circ(bx2, by2, 1.3, '#c9a03a'); }
      A.win(b, 'R', s, h * 0.35, 0.12, 4);
      z += h;
      // upswept wing-eaves
      const e = s + 0.22, ez = z;
      const q = [A.P(cx - e, cy + e, ez - 2), A.P(cx + e, cy + e, ez - 2), A.P(cx + e, cy - e, ez - 2), A.P(cx - e, cy - e, ez - 2)];
      const apex = A.P(cx, cy, ez + 5);
      A.poly([q[3], q[2], apex], A.shade(snowy(roofC()), -0.25)); A.poly([q[1], q[2], apex], A.shade(snowy(roofC()), -0.12)); A.poly([q[0], q[1], apex], snowy(roofC()));
      for (const p of [q[0], q[1], q[2]]) { A.line(p, [p[0] + (p[0] < apex[0] ? -3 : 3), p[1] - 4], ERA >= 3 ? '#e0b440' : beamC(), 1.2); }
      chime(q[1][0], q[1][1] + 1);
      z += 2; s *= 0.78;
      top = ez + 5;
    }
    // finial: a carved hawk with spread wings, or a stormglass orb
    const [fx, fy] = A.P(cx, cy, top);
    A.line([fx, fy], [fx, fy - 6], '#5a4030', 1.2);
    if (ERA >= 3 || band >= 3) storm(fx, fy - 8, 2.2); else { A.line([fx - 6, fy - 8], [fx, fy - 6], '#c9a03a', 1.6); A.line([fx + 6, fy - 8], [fx, fy - 6], '#c9a03a', 1.6); }
    // prayer-flag strings fanning out from the top
    flags(A.P(cx, cy, top - 3), A.P(x + 0.1, y + d - 0.2, 6), 5 + band, 6);
    flags(A.P(cx, cy, top - 3), A.P(x + w - 0.2, y + 0.1, 6), 5 + band, 6, 2);
    birds(cx, cy, top + 14, 1 + band, 16);
    return top + 12;
  });

  // ------------------------------------------------- harbor (inland plot): a sky-dock with a mooring mast
  def('harbor', ([x, y, w, d], L, band) => {
    if (X && X.coastal) return undefined;   // inland design: on a coast cityview's stock piers stand until a coastal harbor is drawn
    const pz = 8 + band * 3;
    rockBase(x + 0.15, y + 0.15, w * 0.45, d * 0.6, pz - 2);
    legs(x + w * 0.45, y + 0.3, w * 0.4, d * 0.4, 0, pz);
    deck(x + w * 0.4, y + 0.25, w * 0.5, d * 0.5, pz);
    const mx = x + w * 0.7, my = y + 0.4, H = pz + 24 + band * 5;
    A.line(A.P(mx, my, pz), A.P(mx, my, H), beamC(), 1.8);
    const [kx, ky] = A.P(mx, my, H);
    // a tethered kite-glider riding the wind
    A.line([kx, ky], [kx - 18, ky - 10], '#6a5a44', 0.5);
    A.poly([[kx - 18, ky - 10], [kx - 26, ky - 8], [kx - 18, ky - 4], [kx - 10, ky - 8]], cloth(1), A.OUT, 0.5);
    A.pennant(mx, my, H, 6);
    A.crate(x + w * 0.5, y + 0.4, 0.22, pz + 1.4); A.sack(x + w * 0.6, y + 0.7);
    return H + 12;
  });

  // ------------------------------------------------- magetower: storm spire with a lightning rod and a stormglass heart
  def('magetower', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, H = 40 + band * 10 + Math.min(20, L);
    const col = ERA >= 2 ? stoneC() : wallC();
    A.cyl(cx, cy, 0.42, 0, 4, A.mix(A.STY.stone, ROCK, 0.4));
    // slender tapering shaft with copper coil
    const [x0, y0] = A.P(cx, cy, 4), rx = 0.3 * A.SQ2 * A.HW;
    A.c.beginPath(); A.c.moveTo(x0 - rx, y0); A.c.lineTo(x0 - rx * 0.6, y0 - H * 0.8); A.c.lineTo(x0 + rx * 0.6, y0 - H * 0.8); A.c.lineTo(x0 + rx, y0); A.c.closePath(); A.gradFill(x0 - rx, x0 + rx, col);
    A.twistLines(cx, cy, 6, H * 0.8, 0.24, '#c87a3a', 2.5 + band * 0.5, 0.7);
    for (let v = 12; v < H * 0.75; v += 11) { A.lamp([[x0 - 1, y0 - v], [x0 + 1, y0 - v], [x0 + 1, y0 - v - 4], [x0 - 1, y0 - v - 4]], STORM_D, STORM_N); }
    // open lantern-cage at the top holding the stormglass
    const gz = H * 0.8 + 4;
    A.cyl(cx, cy, 0.34, gz - 2, 2, woodC());
    const [gx, gy] = A.P(cx, cy, gz);
    for (const dx of [-6, -2, 2, 6]) A.line([gx + dx, gy], [gx + dx * 0.6, gy - 12], '#4a3a2a', 0.8);
    storm(gx, gy - 6, 3 + band * 0.4);
    A.cone(cx, cy, 0.3, gz + 12, 8, roofC());
    const [rx2, ry2] = A.P(cx, cy, gz + 20); A.line([rx2, ry2 + 2], [rx2, ry2 - 10], '#c87a3a', 1.2); A.circ(rx2, ry2 - 10, 1.2, '#e0b440');
    A.rec('magic', { x: gx, y: gy - 6, r: 6 + band * 2, n: 3 + band * 2, col: 'rgba(150,210,255,A)', seed: RN(), bolt: band >= 1 || ERA >= 2 });
    if (band >= 2) perchArm(cx + 0.2, cy + 0.2, H * 0.5, 0.35, 0.1, true);
    return gz + 32;
  });

  // ------------------------------------------------- hideout: a weathered lookout under a rock overhang
  def('hideout', ([x, y, w, d], L, band) => {
    const rw = Math.min(1.9, w - 0.5), rh = 20 + band * 4;
    rockBase(x + 0.2, y + 0.2, rw, 0.85, rh);
    cragStack(x + 0.2 + rw * 0.3, y + 0.5, 0.2, rh + 10 + band * 3, 2, rh);
    const o = hut(x + 0.35, y + 1.1, 1.0, 0.65, 0, 10 + band, { axis: 'x', horns: false, crest: false, col: A.shade(wallC(), -0.15) });
    A.poly(A.onL(o.b, 0.4, 0.62, 0, 7), '#2a2018', null);
    // a stone overhang jutting out over the roof
    A.box(x + 0.25, y + 1.0, Math.min(1.3, rw), 0.45, rh - 4, 3.5, A.mix(A.STY.stone, ROCK, 0.5));
    // rope ladder up the crag to a lookout nest
    const [lx, ly] = A.P(x + 0.2 + rw, y + 0.75, 0); A.line([lx, ly], [lx - 1, ly - rh], '#8a6a40', 0.6); A.line([lx + 2.4, ly], [lx + 1.4, ly - rh], '#8a6a40', 0.6);
    for (let k = 3; k < rh; k += 3) A.line([lx - k * 0.05, ly - k], [lx + 2.4 - k * 0.05, ly - k], '#8a6a40', 0.5);
    const [hx, hy] = A.P(x + 0.2 + rw * 0.3, y + 0.5, rh + 13 + band * 3); hawk(hx + 4, hy);
    A.lampDot(...A.onR(o.b, 0.32, 0, 4, 0)[0], 1.2, '#3a3a40', '#ffd27a');
    if (band >= 2) { const p = A.P(x + 0.2 + rw * 0.3, y + 0.5, rh + 10); A.line(p, [p[0], p[1] - 10], beamC(), 0.8); A.poly([[p[0], p[1] - 10], [p[0] + 6, p[1] - 8.5], [p[0], p[1] - 7]], '#3a3a48', null); }
    return rh + 26 + band * 3;
  });

  // ------------------------------------------------- the Aerie: cliffside nests → a great roost with rocs and stormglass
  def('aerie', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2;
    const H = 34 + band * 14 + L;   // the crag grows with the level
    // the crag: a pillar of stacked boulders that rises with the level
    const r = 0.36 + band * 0.04;
    const cragTop = cragStack(cx - 0.05, cy - 0.05, r, H, 3 + band);
    void cragTop;
    // a rope lift with a basket up to the first ledge
    ropeLift(cx + 0.55, cy - 0.35, 0, H * 0.4, 'basket');
    const nest = (gx, gy, zz, rr, eggs, bird) => {
      const [nx, ny, rx, ry] = A.ell(gx, gy, zz, rr);
      A.c.beginPath(); A.c.ellipse(nx, ny, rx, ry, 0, 0, Math.PI); A.c.lineTo(nx - rx, ny); A.c.ellipse(nx, ny - 4, rx * 1.05, ry * 1.1, 0, Math.PI, Math.PI * 2); A.c.closePath(); A.c.fillStyle = A.F('#7a5a36'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.7; A.c.stroke();
      for (let k = 0; k < 6; k++) { const a = k * 1.1; A.line([nx + Math.cos(a) * rx * 0.9, ny - 2 + Math.sin(a) * ry * 0.5], [nx + Math.cos(a + 1.4) * rx, ny + Math.sin(a + 1.4) * ry * 0.7], '#5a4024', 0.7); }
      for (let k = 0; k < eggs; k++) { A.c.beginPath(); A.c.ellipse(nx - 2 + k * 2.4, ny - 5, 1.3, 1.7, 0, 0, Math.PI * 2); A.c.fillStyle = A.F('#efe6d6'); A.c.fill(); }
      if (bird === 'hawk') hawk(nx + rx * 0.6, ny - 3); else if (bird === 'roc') roc(nx + 1, ny - 2, 0.9 + band * 0.15);
    };
    // nesting ledges jutting from the pillar: one more for every few levels
    const nl = Math.min(5, 1 + Math.floor(L / 4));
    for (let k = 0; k < nl; k++) {
      const side = k % 2 ? -1 : 1, zz = H * (0.25 + 0.6 * k / Math.max(1, nl)), gx = cx + (side > 0 ? 0.45 : -0.15), gy = cy + (side > 0 ? 0.0 : 0.45);
      A.box(gx - 0.18, gy - 0.18, 0.36, 0.36, zz - 1.4, 1.4, woodC());
      A.line(A.P(gx + 0.18, gy + 0.18, zz - 1.4), A.P(cx, cy, zz - 9), beamC(), 0.8);
      nest(gx, gy, zz, 0.15, 1 + (k % 2), k % 2 ? null : 'hawk');
    }
    const t = { z: H, s: r * 1.3 }, ts = t.s;
    let top = t.z;
    // timber roost-house or white stone hall built into the top shelf
    if (band >= 1) {
      const o = hut(cx - ts * 0.75, cy - ts * 0.75, ts * 1.1, ts * 0.9, t.z, 8 + band * 2, { axis: 'x' });
      A.poly(A.onL(o.b, ts * 0.35, ts * 0.65, 0, 6), '#2a2018', null);
      top = o.top;
      perchArm(cx + ts * 0.35, cy, t.z + 6, 0.45, 0.1, true);
    }
    // the crowning nest: a hawk's at first, a roc's from band 2
    nest(cx + ts * 0.35, cy + ts * 0.5, t.z, 0.3 + band * 0.04, 2 + (band >= 2 ? 1 : 0), band >= 2 ? 'roc' : 'hawk');
    top = Math.max(top, t.z + (band >= 2 ? 22 : 10));
    // stormglass: lightning caught in glass atop a copper rod
    if (ERA >= 2 || band >= 3) {
      const gx = cx - ts * 0.3, gy = cy - ts * 0.3, rz = top + 6;
      const a = A.P(gx, gy, t.z), b = A.P(gx, gy, rz + 10);
      A.line(a, b, '#c87a3a', 1.4);
      for (let k = 0; k < 3; k++) { const [px, py] = A.P(gx + (k - 1) * 0.12, gy, rz + 2 + k * 2); A.poly([[px - 1.6, py], [px, py - 5 - k], [px + 1.6, py], [px, py + 1.5]], STORM_D, A.OUT, 0.4); A.lamp([[px - 1, py], [px, py - 4 - k], [px + 1, py]], '#8ac8e8', STORM_N); }
      storm(b[0], b[1] - 2, 2.4);
      A.rec('magic', { x: b[0], y: b[1] - 2, r: 7 + band * 2, n: 3 + band * 2, col: 'rgba(140,200,255,A)', seed: RN(), bolt: true });
      top = rz + 14;
    }
    // streamers and the flock
    A.pennant(cx - 0.75, cy + 0.65, 0, H * 0.45, A.STY.flag);
    if (band >= 1) flags(A.P(cx - 0.75, cy + 0.65, H * 0.45), A.P(cx - ts * 0.5, cy + ts * 0.3, t.z + 4), 4 + band, 4);
    const [bx, by] = A.P(cx, cy, top + 10); A.rec('birds', { x: bx, y: by, r: 30 + band * 8, n: 3 + band, seed: RN() });
    return top + 8;
  });

  // ------------------------------------------------- shrine: a wind cairn with a feathered prayer-pole
  def('shrine', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2;
    const [bx, by] = A.P(cx, cy);
    const n = 4 + band * 2;
    for (let k = 0; k < n; k++) { A.c.beginPath(); A.c.ellipse(bx, by - 2 - k * 3, 9 - k * (6 / n), 3, 0, 0, Math.PI * 2); A.c.fillStyle = A.F(X.snow && k === n - 1 ? '#f2f6f8' : k % 2 ? '#a8a090' : '#968e80'); A.c.fill(); A.c.strokeStyle = A.F(A.OUT); A.c.lineWidth = 0.6; A.c.stroke(); }
    const H = n * 3 + 22 + band * 6, t = [bx, by - H];
    A.line([bx, by - n * 3], t, beamC(), 1.6);
    for (let k = 0; k < 3; k++) { A.c.beginPath(); A.c.ellipse(t[0] + (k - 1) * 2.2, t[1] + 2, 1.1, 3.4, (k - 1) * 0.4, 0, Math.PI * 2); A.c.fillStyle = A.F('#f4ead2'); A.c.fill(); }
    if (ERA >= 3) storm(t[0], t[1] - 3, 2);
    for (const [gx, gy] of [[x + 0.15, y + d - 0.3], [x + w - 0.3, y + 0.15], [x + 0.2, y + 0.2]].slice(0, 1 + Math.min(2, band))) { const p = A.P(gx, gy); A.line(p, [p[0], p[1] - 14], beamC(), 1); flags(t, [p[0], p[1] - 14], 4 + band, 5, gx > cx ? 2 : 0); }
    chime(t[0], t[1] + 8);
    return H + 6;
  });

  // ------------------------------------------------- spare-plot buildings
  def('generic', ([x, y, w, d], L, band) => {
    const ww = Math.min(w - 0.4, 1.6), dd = Math.min(d - 0.4, 1.3), pz = 4 + band * 2;
    legs(x + 0.15, y + 0.15, ww, dd, 0, pz);
    deck(x + 0.1, y + 0.1, ww + 0.1, dd + 0.1, pz, false);
    const o = hut(x + 0.18, y + 0.18, ww - 0.06, dd - 0.06, pz + 1.4, 10 + band * 2, {});
    A.door(o.b, 'L', (ww - 0.06) / 2, 0.24, 7);
    if (band >= 1) perchArm(x + 0.18 + ww - 0.06, y + 0.18 + dd / 2, pz + 8, 0.3, 0, true);
    return o.top + 4;
  });
})();
