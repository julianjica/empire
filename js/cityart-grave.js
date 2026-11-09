// Building art for the grave — see the CITYART contract in js/cityart.js
//  Gravebound: a necromantic realm of crooked slate-roofed houses, crypts, bone-ribbed vaults,
//  wrought iron, witch-light green lanterns, ravens and fog. Eras: 0 daub & timber under sod/thatch,
//  1 slate & iron, 2 dressed stone with lancets and buttresses, 3 black basalt cathedrals with
//  sickly green rose windows. Bands (L 1-4, 5-9, 10-14, 15+) are silhouette milestones; most
//  buildings also gain a little something every level.
'use strict';
(() => {
  const GR = CITYART.grave;
  let A = null, X = null;
  const TAU = Math.PI * 2;
  const IRON = '#1c1c22', BONE = '#e6dec6', GLOW = '#8affb0';
  // ---------------------------------------------------------------- shared helpers
  const rc = col => X.snow ? A.mix(col, '#f3f6f9', 0.8) : col;
  const rngOf = k => A.mkRng(A.hashStr((X.city && X.city.id) + 'grave' + k + (X.i || 0)));
  function pal() {
    const e = X.era, ston = X.tech('masonry') || e >= 2;
    return {
      e, ston,
      wall: e >= 3 ? '#4a4854' : ston ? '#686870' : e === 1 ? '#625e60' : '#6e665c',
      stone: e >= 3 ? '#42424c' : '#5c5c64', stone2: e >= 3 ? '#50505a' : '#74747c',
      roof: e === 0 ? '#4a4238' : e === 1 ? '#363840' : e === 2 ? '#2e3038' : '#24252c',
      beam: '#26262c', trim: e >= 3 ? '#d8cfb4' : '#aaa290', door: '#18181e',
      wood: '#3e3832',
    };
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // a steep gable whose ridge leans a little: the crooked Gravebound roof
  function gableL(b, rh, col, axis, lean = 0, o = 0.12) {
    col = rc(col);
    const { P, poly, line, shade } = A, zb = b.z + b.h, zt = zb + rh, wl = b.col;
    const x0 = b.x - o, x1 = b.x + b.w + o, y0 = b.y - o, y1 = b.y + b.d + o;
    const Lp = (gx, gy, z) => { const p = P(gx, gy, z); p[0] += lean; return p; };
    let q, apex;
    if (axis === 'x') {
      const ym = b.y + b.d / 2;
      poly([P(x0, y0, zb), P(x1, y0, zb), Lp(x1, ym, zt), Lp(x0, ym, zt)], shade(col, -0.28));
      apex = Lp(b.x + b.w, ym, zt);
      poly([P(b.x + b.w, b.y, zb), P(b.x + b.w, b.y + b.d, zb), apex], shade(wl, -0.2));
      q = [P(x0, y1, zb), P(x1, y1, zb), Lp(x1, ym, zt), Lp(x0, ym, zt)];
      poly(q, col);
    } else {
      const xm = b.x + b.w / 2;
      poly([P(x0, y0, zb), P(x0, y1, zb), Lp(xm, y1, zt), Lp(xm, y0, zt)], shade(col, -0.28));
      apex = Lp(xm, b.y + b.d, zt);
      poly([P(b.x, b.y + b.d, zb), P(b.x + b.w, b.y + b.d, zb), apex], wl);
      q = [P(x1, y1, zb), P(x1, y0, zb), Lp(xm, y0, zt), Lp(xm, y1, zt)];
      poly(q, shade(col, -0.14));
    }
    if (!X.snow) { A.roofLines(q, 6, shade(col, -0.22), 0.5); for (let k = 1; k < 6; k++) { const a = lerp(q[0], q[1], k / 6), c2 = lerp(q[3], q[2], k / 6); A.line(a, lerp(a, c2, 0.5), shade(col, -0.18), 0.4); } }
    line(q[3], q[2], shade(col, -0.45), 1.5);
    // iron spikes on both ridge ends
    for (const e of [q[3], q[2]]) { line(e, [e[0], e[1] - 5], IRON, 1); A.poly([[e[0] - 1, e[1] - 4.5], [e[0] + 1, e[1] - 4.5], [e[0], e[1] - 7]], IRON, null); }
    if (X.era >= 3) for (const e of [q[3], q[2]]) A.lampDot(e[0], e[1] - 7.5, 0.9, '#5ab878', GLOW);   // Legend: witch-light on every ridge spike
    return { zt, q, apex };
  }
  function raven(x, y, s = 1) {
    const c = A.c; c.beginPath(); c.ellipse(x, y - 2.6 * s, 1.5 * s, 2.6 * s, -0.35, 0, TAU); c.fillStyle = A.F('#121216'); c.fill();
    A.circ(x + 0.9 * s, y - 5.4 * s, 1.15 * s, '#121216'); A.poly([[x + 1.8 * s, y - 5.7 * s], [x + 3.5 * s, y - 5.2 * s], [x + 1.8 * s, y - 4.8 * s]], '#4a4a50', null);
    A.line([x - 1 * s, y - 0.6 * s], [x - 2.8 * s, y + 0.9 * s], '#121216', 1);
  }
  const ravensCircle = (gx, gy, z, n, r = 26) => { const [x, y] = A.P(gx, gy, z); A.rec('birds', { x, y, r, n, seed: A.R() }); };
  function wisp(gx, gy, z) { const [x, y] = A.P(gx, gy, z); A.rec('sparks', { x, y, kind: 'moon' }); A.rec('lights', { x, y, r: 16, col: 'witch' }); }
  function fog(gx, gy, r, a = 0.22) { // soft low banks of mist (day canvas only; the night tint keeps them pale)
    if (X.night) return;
    const c = A.c, [x, y] = A.P(gx, gy);
    for (let k = 0; k < 3; k++) {
      const cx = x + (k - 1) * r * 11, cy = y + (k % 2) * 1.5, rx = r * 16;
      c.save(); c.translate(cx, cy); c.scale(1, 0.24);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(222,226,230,${a})`); g.addColorStop(1, 'rgba(222,226,230,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore();
    }
  }
  function greenFlame(x, y, s = 1) {
    A.lamp([[x - 2.2 * s, y], [x + 2.2 * s, y], [x + 1.2 * s, y - 3 * s], [x + 0.4 * s, y - 6.5 * s], [x - 0.6 * s, y - 3.5 * s], [x - 1.4 * s, y - 5 * s]], '#5ad888', '#c8ffd8');
    A.rec('lights', { x, y: y - 3 * s, r: 22 * s, col: 'witch' }); A.rec('sparks', { x, y: y - 3 * s, kind: 'witch' });
  }
  function brazier(gx, gy, z = 0, s = 1) {
    const [x, y] = A.P(gx, gy, z);
    A.line([x - 2.2 * s, y], [x, y - 6 * s], IRON, 1); A.line([x + 2.2 * s, y], [x, y - 6 * s], IRON, 1); A.line([x, y + 0.6], [x, y - 6 * s], IRON, 1);
    A.poly([[x - 3 * s, y - 6 * s], [x + 3 * s, y - 6 * s], [x + 2 * s, y - 8 * s], [x - 2 * s, y - 8 * s]], IRON, null);
    greenFlame(x, y - 8 * s, s * 0.9);
  }
  function coffin(gx, gy, z = 0, s = 1, col = '#3a2e26') {
    const [x, y] = A.P(gx, gy, z);
    A.poly([[x - 1.6 * s, y], [x + 1.6 * s, y], [x + 2.4 * s, y - 6 * s], [x + 1.4 * s, y - 9.5 * s], [x - 1.4 * s, y - 9.5 * s], [x - 2.4 * s, y - 6 * s]], col);
    A.line([x, y - 1.8 * s], [x, y - 8 * s], '#8a7a5a', 0.6); A.line([x - 1.1 * s, y - 6.3 * s], [x + 1.1 * s, y - 6.3 * s], '#8a7a5a', 0.6);
  }
  function coffinFlat(gx, gy, z = 0) { // lying along gx
    const { P, poly, shade } = A, w = 0.42, d = 0.16, h = 3;
    poly([P(gx, gy + d, z), P(gx + w, gy + d, z), P(gx + w, gy + d, z + h), P(gx, gy + d, z + h)], '#3a2e26');
    poly([P(gx + w, gy, z), P(gx + w, gy + d, z), P(gx + w, gy + d, z + h), P(gx + w, gy, z + h)], shade('#3a2e26', -0.25));
    poly([P(gx, gy, z + h), P(gx + w, gy, z + h), P(gx + w, gy + d, z + h), P(gx, gy + d, z + h)], X.snow ? '#e8ecee' : '#4e4034');
  }
  function skel(x, y, s = 1) { // a risen labourer
    const c = BONE;
    A.circ(x, y - 9 * s, 1.5 * s, c, A.OUT);
    A.line([x, y - 7.6 * s], [x, y - 3.5 * s], c, 1); for (const v of [6.5, 5.3]) A.line([x - 1.4 * s, y - v * s], [x + 1.4 * s, y - v * s], c, 0.7);
    A.line([x, y - 3.5 * s], [x - 1.3 * s, y], c, 0.9); A.line([x, y - 3.5 * s], [x + 1.3 * s, y], c, 0.9);
    A.line([x, y - 7 * s], [x + 2.5 * s, y - 4.5 * s], c, 0.8); A.line([x, y - 7 * s], [x - 2.2 * s, y - 5 * s], c, 0.8);
  }
  function skullRow(b, side, v, n, s = 0.55, u0 = 0.08) {
    const Lf = side === 'L' ? b.w : b.d, f = side === 'L' ? A.onL : A.onR;
    for (let k = 0; k < n; k++) { const u = u0 + (Lf - 2 * u0) * (k + 0.5) / n; A.skull(...f(b, u, u, v, v)[0], s); }
  }
  // gothic rose window in screen space
  function rose(x, y, r, e) {
    A.circ(x, y, r + 1.2, A.STY.trim, A.OUT);
    A.lampDot(x, y, r, '#2a4032', e >= 3 ? '#b8ffd0' : GLOW);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; A.line([x, y], [x + Math.cos(a) * r, y + Math.sin(a) * r], '#1a1a20', 0.6); }
    A.circ(x, y, r * 0.3, '#1a1a20');
    if (e >= 3) A.rec('lights', { x, y, r: r * 5, col: 'witch' });
  }
  function buttressL(b, u, h, depth = 0.14) { // a stepped buttress on the left (front) face
    const { box, shade } = A;
    box(b.x + u - 0.05, b.y + b.d, 0.1, depth, b.z, h * 0.55, shade(b.col, -0.08));
    box(b.x + u - 0.05, b.y + b.d, 0.1, depth * 0.6, b.z + h * 0.55, h * 0.3, shade(b.col, -0.08));
  }
  function buttressR(b, u, h, depth = 0.14) {
    const { box, shade } = A;
    box(b.x + b.w, b.y + u - 0.05, depth, 0.1, b.z, h * 0.55, shade(b.col, -0.08));
    box(b.x + b.w, b.y + u - 0.05, depth * 0.6, 0.1, b.z + h * 0.55, h * 0.3, shade(b.col, -0.08));
  }
  function pinnacle(gx, gy, z, h = 8, col) { const [tx, ty] = A.P(gx, gy, z); A.poly([[tx - 1.5, ty], [tx + 1.5, ty], [tx, ty - h]], col || '#3a3a42'); }
  // a belfry tower with a spire (or battlements); returns top z
  function belfry(x, y, s, H, band, o = {}) {
    const p = pal(), col = o.col || p.stone2, { box, courses, lancet, shade, P, line, circ, lampDot } = A;
    const b = box(x, y, s, s, 0, H, col); courses(b, 4.5, shade(col, -0.2));
    for (let v = 8; v < H - 16; v += 12) { lancet(b, 'L', s / 2, v, 0.12, 6); lancet(b, 'R', s / 2, v, 0.12, 6); }
    // open bell chamber
    const bz = H - 12;
    for (const side of ['L', 'R']) {
      const f = side === 'L' ? A.onL : A.onR, q = f(b, s * 0.25, s * 0.75, bz, bz + 8), tp = f(b, s / 2, s / 2, bz + 11, bz + 11)[0];
      A.path([q[0], q[1], q[2], tp, q[3]]); A.c.fillStyle = A.F('#101014'); A.c.fill();
    }
    const [bx, by] = P(x + s, y + s / 2, bz + 5); circ(bx - 0.5, by, 2.3, '#6a5a3a'); line([bx - 3, by - 2.5], [bx + 2, by - 2.5], IRON, 0.8);
    let top;
    if (o.crenel || X.tech('fortification') && o.fort) {
      const t = box(x - 0.06, y - 0.06, s + 0.12, s + 0.12, H, 3, shade(col, -0.1)); A.parapet({ ...t, h: 3 }, 3);
      top = H + 6;
      if (o.spire !== false) top = A.cone(x + s / 2, y + s / 2, s * 0.38, H + 3, s * 40, p.roof);
    } else {
      for (const [gx, gy] of [[x, y + s], [x + s, y + s], [x + s, y]]) pinnacle(gx, gy, H, 7 + band, shade(col, -0.1));
      top = A.cone(x + s / 2, y + s / 2, s * 0.62, H, s * (38 + band * 10), p.roof);
    }
    const [fx, fy] = P(x + s / 2, y + s / 2, top);
    line([fx, fy], [fx, fy - 6], IRON, 1.1);
    if (band >= 2 || p.e >= 2) { lampDot(fx, fy - 7.5, 1.9, '#4a8a5a', GLOW); A.rec('lights', { x: fx, y: fy - 7.5, r: 22, col: 'witch' }); A.rec('sparks', { x: fx, y: fy - 7.5, kind: 'witch' }); }
    else { line([fx - 2.5, fy - 4], [fx + 2.5, fy - 4], IRON, 0.9); }
    if (o.raven !== false) raven(fx + 4, fy + 4, 0.8);
    return top + 9;
  }
  // a crooked town house: daub & timber (era 0-1) or stone, jettied upper floors, leaning steep slate roof
  function house(x, y, w, d, H, band, o = {}) {
    const p = pal(), { box, timber, courses, shade, win, door, lancet, archDoor } = A;
    const axis = o.axis || (w >= d ? 'x' : 'y'), storeys = o.storeys || 1, lean = o.lean || 0;
    const sh = H / storeys;
    let b = null, z = 0;
    for (let s = 0; s < storeys; s++) {
      const j = s * 0.05, stone = p.ston && s === 0 || p.e >= 3;
      const col = stone ? (s === 0 ? p.stone2 : p.wall) : p.wall;
      b = box(x - j, y - j, w + j * 2, d + j * 2, z, sh, col);
      if (stone || p.e >= 2 && s === 0) courses(b, 4, shade(col, -0.18)); else timber(b, p.beam);
      // windows
      const nL = Math.max(1, Math.round(b.w / 0.45)), nR = Math.max(1, Math.round(b.d / 0.45));
      for (let k = 0; k < nL; k++) {
        if (s === 0 && k === Math.floor(nL / 2)) continue;
        const u = b.w * (k + 0.5) / nL;
        if (p.e >= 2) lancet(b, 'L', u, sh * 0.3, 0.12, Math.min(6, sh * 0.45)); else win(b, 'L', u, sh * 0.35, 0.14, Math.min(4.5, sh * 0.35), p.trim);
      }
      for (let k = 0; k < nR; k++) { const u = b.d * (k + 0.5) / nR; if (p.e >= 2) lancet(b, 'R', u, sh * 0.3, 0.12, Math.min(6, sh * 0.45)); else win(b, 'R', u, sh * 0.35, 0.14, Math.min(4.5, sh * 0.35), p.trim); }
      if (s === 0) { if (p.e >= 2) archDoor(b, 'L', b.w / 2, 0.26, Math.min(9, sh * 0.75)); else door(b, 'L', b.w / 2, 0.24, Math.min(8, sh * 0.7), p.door); }
      if (s > 0) { // jetty brackets
        for (const u of [0.05, b.w - 0.05]) A.line(A.onL(b, u, u, 0, 0)[0], A.onL(b, u + (u < 0.1 ? 0.06 : -0.06), u + (u < 0.1 ? 0.06 : -0.06), -3, -3)[0], p.beam, 1);
      }
      z += sh;
    }
    const span = axis === 'x' ? b.d : b.w;
    const rf = gableL(b, span * (o.rh || 22 + band * 2), o.roof || p.roof, axis, lean, 0.1);
    if (o.dormer && axis === 'x') { // a little gabled dormer on the front slope
      const db = { x: b.x + b.w * 0.35, y: b.y + b.d * 0.62, w: b.w * 0.3, d: b.d * 0.3, z: b.z + b.h, h: span * 6, col: p.wall };
      A.box(db.x, db.y, db.w, db.d, db.z, db.h, p.wall); A.win(db, 'L', db.w / 2, 1.5, 0.12, Math.max(2.5, db.h - 3), p.trim);
      gableL(db, db.w * 18, o.roof || p.roof, 'y', 0, 0.04);
    }
    if (o.chim) A.chimney(b.x + b.w * (axis === 'x' ? 0.78 : 0.3), b.y + b.d * (axis === 'x' ? 0.35 : 0.2), b.z + b.h + span * 5, span * 7 + 4, o.chim, '#34343c');
    if (o.lamp) A.witchLamp(x + w + 0.1, y + d + 0.1, 0, 12);
    return rf.zt + 8;
  }
  // a little mausoleum with pediment and columns; returns top z
  function crypt(x, y, w, d, h, o = {}) {
    const p = pal(), { box, courses, shade, P, lamp, poly } = A;
    const col = o.col || p.stone2;
    box(x - 0.05, y - 0.05, w + 0.1, d + 0.1, 0, 2, shade(col, -0.25));
    const b = box(x, y, w, d, 2, h, col); courses(b, 3.5, shade(col, -0.18));
    for (const u of [0.08, w - 0.16]) box(x + u, y + d, 0.08, 0.08, 2, h, shade(col, 0.1));
    const dq = A.onL(b, w * 0.32, w * 0.68, 0, Math.min(h - 2, 9)), tp = A.onL(b, w / 2, w / 2, Math.min(h - 2, 9) + 2.5, 0)[0];
    A.path([dq[0], dq[1], dq[2], tp, dq[3]]); A.c.fillStyle = o.glow ? (X.night ? '#a8ffc0' : '#2f5a3c') : A.F('#141418'); A.c.fill();
    if (o.glow) { const [gx, gy] = P(x + w / 2, y + d, 6); A.rec('lights', { x: gx, y: gy, r: 18, col: 'witch' }); }
    const rf = gableL(b, w * 12, o.roof || shade(col, -0.2), 'y', 0, 0.06);
    A.skull(rf.apex[0], rf.apex[1] + 4, 0.55);
    void poly; void lamp;
    return rf.zt + 4;
  }
  function boneVault(x, y, w, d, zb, col) { // a barrel vault ribbed with bone, ridge along x
    const { P, poly, shade, circ } = A, yc = y + d / 2, r = d / 2, rz = d * 13, n = 10;
    const pt = (gx, a) => P(gx, yc + r * Math.cos(a), zb + rz * Math.sin(a));
    for (let i = n - 1; i >= 0; i--) { const a0 = i / n * Math.PI, a1 = (i + 1) / n * Math.PI; poly([pt(x, a0), pt(x + w, a0), pt(x + w, a1), pt(x, a1)], rc(shade(col, -0.25 + 0.3 * Math.sin((a0 + a1) / 2) - 0.12 * (a0 > Math.PI / 2))), null); }
    const cap = []; for (let i = 0; i <= n; i++) cap.push(pt(x + w, i / n * Math.PI)); poly(cap, shade(pal().stone, -0.18));
    const nr = Math.max(3, Math.round(w / 0.32));
    for (let k = 0; k <= nr; k++) { const gx = x + w * (0.06 + 0.88 * k / nr); A.c.beginPath(); for (let i = 0; i <= n; i++) { const pp = pt(gx, i / n * Math.PI); if (i) A.c.lineTo(...pp); else A.c.moveTo(...pp); } A.c.strokeStyle = A.F(BONE); A.c.lineWidth = 2.2; A.c.stroke(); circ(...pt(gx, Math.PI / 2), 1.4, BONE); }
    return { top: zb + rz, cap: P(x + w, yc, zb), pt };
  }
  function ironGate(gx, gy, alongX, wd = 0.5, h = 14) {
    const { P, line, c } = A, a = alongX ? [gx - wd / 2, gy] : [gx, gy - wd / 2], b = alongX ? [gx + wd / 2, gy] : [gx, gy + wd / 2];
    for (const q of [a, b]) { A.box(q[0] - 0.05, q[1] - 0.05, 0.1, 0.1, 0, h, '#3a3a42'); }
    const pa = P(...a, h - 2), pb = P(...b, h - 2), m = lerp(pa, pb, 0.5);
    c.beginPath(); c.moveTo(...pa); c.quadraticCurveTo(m[0], m[1] - 9, ...pb); c.strokeStyle = A.F(IRON); c.lineWidth = 1.2; c.stroke();
    for (let k = 1; k < 6; k++) { const q = lerp(a, b, k / 6); line(P(...q), P(...q, h - 4 + Math.sin(k / 6 * Math.PI) * 4), IRON, 0.7); }
    A.skull(m[0], m[1] - 3, 0.6);
  }
  function scarecrow(gx, gy, s = 1) {
    const [x, y] = A.P(gx, gy);
    A.line([x, y], [x, y - 16 * s], '#4a3a2a', 1.3); A.line([x - 6 * s, y - 12 * s], [x + 6 * s, y - 12 * s], '#4a3a2a', 1.1);
    A.poly([[x - 5 * s, y - 12.5 * s], [x + 5 * s, y - 12.5 * s], [x + 3 * s, y - 5 * s], [x + 1 * s, y - 7 * s], [x - 1.5 * s, y - 4.5 * s], [x - 3.5 * s, y - 7 * s]], '#3e3a44');
    A.circ(x, y - 15 * s, 2 * s, '#c8b890', A.OUT); A.poly([[x - 3.5 * s, y - 16 * s], [x + 3.5 * s, y - 16 * s], [x + 0.5 * s, y - 21 * s]], '#26262c');
    raven(x + 5 * s, y - 12.5 * s, 0.7);
  }
  function gourds(gx, gy, n = 3) { const [x, y] = A.P(gx, gy); for (let k = 0; k < n; k++) { A.circ(x + k * 3.6 - n * 1.6, y - 1.6 - (k % 2), 1.9, X.snow ? '#e8ecee' : '#8a6a3a', A.OUT); } }
  const flagCol = () => A.STY.flag;
  // wrap: set the module state and let each drawer return its top
  const def = (k, fn) => { GR[k] = (api, s, L, band, ctx) => { A = api; X = ctx; return fn(s, L, band, pal()); }; };

  // ================================================================ TOWN HALL: the Black Keep
  def('townhall', ([x, y, w, d], L, band, p) => {
    let top = 0;
    const lean = [3, 2, 1, 0][band];
    // the tall belfry at the back right (where hit tests expect the tower)
    if (band >= 1) top = belfry(x + 1.85, y + 0.05, 0.75 + band * 0.05, 34 + band * 12 + L * 0.8, band, { fort: true });
    if (band === 0) {
      // a crooked timber longhall with a bell gallows beside it
      top = Math.max(top, house(x + 0.45, y + 0.7, 1.9, 1.3, 15 + L, 0, { axis: 'x', lean, chim: 'hall', rh: 26 }));
      const [bx, by] = A.P(x + 2.45, y + 0.6);
      A.line([bx - 4, by], [bx - 4, by - 22], p.wood, 1.6); A.line([bx + 4, by], [bx + 4, by - 22], p.wood, 1.6); A.line([bx - 6, by - 22], [bx + 6, by - 22], p.wood, 1.8);
      A.circ(bx, by - 18, 2.6, '#6a5a3a', A.OUT); raven(bx + 5, by - 22, 0.8);
    } else {
      const b0 = { x: x + 0.3, y: y + 0.85, w: 1.95, d: 1.55 };
      const H = 18 + band * 4 + L * 0.5, col = p.e >= 3 ? '#34343e' : p.stone;
      A.box(b0.x - 0.06, b0.y - 0.06, b0.w + 0.12, b0.d + 0.12, 0, 2.5, A.shade(col, -0.25));
      const b = A.box(b0.x, b0.y, b0.w, b0.d, 2.5, H, col); A.courses(b, 4.2, A.shade(col, -0.18));
      // nave runs along y: gable end with rose window faces the front-left
      const nL = 3, nR = Math.max(3, Math.round(b.d / 0.38));
      for (let k = 0; k < nR; k++) A.lancet(b, 'R', b.d * (k + 0.5) / nR, H * 0.32, 0.13, H * 0.42);
      if (band >= 2) for (let k = 1; k < nR; k++) buttressR(b, b.d * k / nR, H, 0.16);
      for (let k = 0; k < nL; k++) if (k !== 1) A.lancet(b, 'L', b.w * (k + 0.5) / nL, H * 0.25, 0.13, H * 0.35);
      A.archDoor(b, 'L', b.w / 2, 0.36, Math.min(13, H * 0.45));
      if (band >= 2) for (const u of [0.06, b.w - 0.06]) buttressL(b, u, H, 0.18);
      // flying buttresses (architecture)
      if (X.tech('architecture') && band >= 2) for (let k = 1; k < nR; k += 2) { const pz = H * 0.6; A.box(b.x + b.w + 0.28, b.y + b.d * k / nR - 0.05, 0.1, 0.1, 0, pz, A.shade(col, -0.05)); A.line(A.P(b.x + b.w + 0.3, b.y + b.d * k / nR, pz), A.P(b.x + b.w, b.y + b.d * k / nR, H + 2), A.shade(col, -0.1), 2.4); pinnacle(b.x + b.w + 0.33, b.y + b.d * k / nR, pz, 6); }
      const rf = gableL(b, b.w * (16 + band * 4), p.roof, 'y', lean, 0.1);
      // the rose window in the front gable
      const rz = b.z + b.h + b.w * (16 + band * 4) * 0.32, [rx, ry] = A.P(b.x + b.w / 2, b.y + b.d, rz);
      if (band >= 2) rose(rx, ry, 3 + band * 1.2 + p.e * 0.5, p.e); else A.lancet(b, 'L', b.w / 2, H - 1, 0.16, 5);
      if (band >= 3) for (const u of [-0.14, b.w - 0.26]) { // twin west towers framing the rose window
        const tx = b.x + u, ty = b.y + b.d - 0.32, ts = 0.4, th = H + 16 + L * 0.5;
        const tb = A.box(tx, ty, ts, ts, 0, th, col); A.courses(tb, 4.2, A.shade(col, -0.18));
        for (let v = 10; v < th - 6; v += 11) { A.lancet(tb, 'L', ts / 2, v, 0.1, 6); A.lancet(tb, 'R', ts / 2, v, 0.1, 6); }
        for (const [gx, gy] of [[tx, ty + ts], [tx + ts, ty + ts], [tx + ts, ty]]) pinnacle(gx, gy, th, 7, A.shade(col, -0.1));
        const zt = A.cone(tx + ts / 2, ty + ts / 2, ts * 0.5, th, 22 + p.e * 3, p.roof);
        const [fx, fy] = A.P(tx + ts / 2, ty + ts / 2, zt); A.line([fx, fy], [fx, fy - 5], IRON, 1); A.lampDot(fx, fy - 6, 1.6, '#4a8a5a', GLOW); A.rec('lights', { x: fx, y: fy - 6, r: 16, col: 'witch' });
        top = Math.max(top, zt + 8);
      }
      // bone trim over the doorway, a skull keystone
      A.skull(...A.P(b.x + b.w / 2, b.y + b.d, b.z + Math.min(13, H * 0.45) + 3), 0.85);
      if (band >= 2 && L >= 12) skullRow(b, 'L', H - 3, 5, 0.5);
      top = Math.max(top, rf.zt + 10);
      // a little side chapel / crypt on the left front at band 3
      if (band >= 3) crypt(x + 0.05, y + 0.1, 0.62, 0.62, 12, { glow: true });
    }
    // iron railing, lamps, ravens and the low fog of the plaza
    A.ironFence([[x + 0.02, y + 2.78], [x + 1.0, y + 2.78]], 8); A.ironFence([[x + 1.6, y + 2.78], [x + 2.78, y + 2.78], [x + 2.78, y + 1.4]], 8);
    A.witchLamp(x + 1.08, y + 2.85, 0, 15); A.witchLamp(x + 1.55, y + 2.85, 0, 15);
    if (band >= 2) brazier(x + 2.6, y + 2.55, 0, 1.1);
    ravensCircle(x + 2.2, y + 0.4, top - 10, 2 + band, 22 + band * 5);
    if (band >= 1) wisp(x + 0.3, y + 2.4, 14);
    fog(x + 1.4, y + 2.6, 0.9);
    return top;
  });

  // ================================================================ HOUSES: crooked town houses
  def('cottage', ([x, y], L, band, p) => {
    const i = X.i || 0, kind = i % 3, rnd = rngOf('cot'), lean = (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 5);
    const s = [1.0, 1.1, 1.2, 1.25][band], ax = i % 2 ? 'x' : 'y';
    let top;
    if (kind === 1 && band >= 1) { // a narrow tower-house with a candle in the top window
      const tw = 0.62 + band * 0.04;
      top = house(x + 0.1, y + 0.15, tw, tw, 16 + band * 7, band, { axis: 'y', storeys: 1 + band, lean: lean * 1.4, rh: 30, chim: band >= 2 ? 'house' : null });
      if (band >= 3) { // a turret corbelled off the corner
        const tx = x + 0.1 + tw, ty = y + 0.15 + tw;
        A.cyl(tx, ty, 0.14, 18, 14, p.wall); A.cone(tx, ty, 0.2, 32, 14, p.roof);
      }
      // the family plot beside it
      A.tomb(x + 0.95, y + 0.55, 0.65); if (band >= 2) A.tomb(x + 1.1, y + 0.95, 0.6);
      A.ironFence([[x + 0.8, y + 1.15], [x + 1.25, y + 1.15], [x + 1.25, y + 0.35]], 5);
    } else if (kind === 2 && band >= 2) { // a house with its own little mausoleum
      top = house(x, y + 0.1, s * 0.78, s * 0.75, 12 + band * 4, band, { axis: ax, storeys: band >= 3 ? 2 : 1, lean, chim: 'house', dormer: band >= 3 });
      crypt(x + s * 0.82, y + 0.75, 0.38, 0.38, 7 + band, { glow: band >= 3 });
    } else {
      const storeys = band >= 2 ? 2 : 1, H = [9, 12, 17, 20][band] + (L % 5) * 0.4;
      top = house(x, y, s, s * 0.88, H, band, { axis: ax, storeys: band >= 3 ? 3 : storeys, lean, chim: 'house', dormer: band >= 1 && ax === 'x', roof: p.e === 0 && band === 0 ? '#4a4034' : undefined, rh: band === 0 ? 18 : 24 });
      if (band >= 1 && i % 2 === 0) A.tomb(x + s * 0.12, y + s * 0.9 + 0.14, 0.7);
    }
    if (i % 3 === 0 && band >= 1) A.witchLamp(x + s + 0.05, y + s * 0.9 + 0.1, 0, 11);
    if (band === 0 && i % 2) A.deadTree(x + 1.15, y + 0.25, 0.55);
    if (band >= 2 && i % 4 === 1) raven(...A.P(x + s / 2, y + s * 0.45, top - 8), 0.7);
    return top;
  });
  // the district as a whole is drawn as cottages; 'houses' itself (if ever called) declines
  // ================================================================ FARM: the gaunt grange
  def('farm', ([x, y, w, d], L, band, p) => {
    let top;
    const bw = 1.0 + band * 0.12, bd = 0.85 + band * 0.08;
    top = house(x + 0.15, y + 0.2, bw, bd, 12 + band * 3, band, { axis: 'x', lean: 2, rh: 30, roof: p.e === 0 ? '#4e4436' : p.roof });
    // the tall barn doors on the side
    const b = { x: x + 0.15, y: y + 0.2, w: bw, d: bd, z: 0 };
    A.poly(A.onR(b, bd * 0.3, bd * 0.7, 0, 9), '#2a2420'); A.line(A.onR(b, bd * 0.5, bd * 0.5, 0, 0)[0], A.onR(b, bd * 0.5, bd * 0.5, 9, 9)[0], '#5a4a3a', 0.7);
    if (band >= 2) { // a tattered black windmill
      const mx = x + 0.4, my = y + 1.55, mh = 26 + band * 4;
      A.box(mx - 0.22, my - 0.22, 0.44, 0.44, 0, mh, p.wall); A.timber({ x: mx - 0.22, y: my - 0.22, w: 0.44, d: 0.44, z: 0, h: mh }, p.beam);
      const zt = A.cone(mx, my, 0.36, mh, 12, p.roof);
      const [hx, hy] = A.P(mx + 0.22, my + 0.22, mh - 2);
      for (let k = 0; k < 4; k++) { const a = 0.5 + k * Math.PI / 2, ex = hx + Math.cos(a) * 22, ey = hy + Math.sin(a) * 19; A.line([hx, hy], [ex, ey], '#2a2420', 1.2); const px = -Math.sin(a) * 4, py = Math.cos(a) * 3.6; A.poly([[hx + Math.cos(a) * 5, hy + Math.sin(a) * 4.5], [ex, ey], [ex + px * 0.7, ey + py * 0.7], [hx + Math.cos(a) * 9 + px, hy + Math.sin(a) * 8 + py]], '#8a8486'); }
      A.circ(hx, hy, 1.8, IRON); top = Math.max(top, zt + 18);
    }
    scarecrow(x + 1.55, y + 1.0, 0.9 + band * 0.05);
    if (band >= 1) scarecrow(x + 1.0, y + 1.85, 0.85);
    gourds(x + 1.25, y + 1.55, 2 + Math.min(4, Math.floor(L / 4)));
    if (band >= 3) gourds(x + 0.75, y + 2.0, 4);
    if (X.tech('irrigation')) { // a black-water well with a sweep
      const [wx, wy] = A.P(x + 1.75, y + 1.75); A.cyl(x + 1.75, y + 1.75, 0.13, 0, 4, p.stone2, '#1e2a2a');
      A.line([wx + 4, wy], [wx + 4, wy - 12], p.wood, 1.2); A.line([wx - 6, wy - 16], [wx + 10, wy - 9], p.wood, 1.1);
    }
    A.deadTree(x + 2.05, y + 2.05, 0.7);
    ravensCircle(x + 1.3, y + 1.2, 30, 2 + band, 20);
    fog(x + 1.2, y + 1.9, 0.7);
    return top;
  });

  // ================================================================ LUMBER: the deadwood yard
  def('lumber', ([x, y, w, d], L, band, p) => {
    // the grey wood behind, thinning as the yard grows
    const nT = Math.max(2, 7 - band * 1.5);
    for (let k = 0; k < nT; k++) { const gx = x + 0.2 + (k % 3) * 0.8, gy = y + 0.25 + Math.floor(k / 3) * 0.55; if (k % 2) A.deadTree(gx, gy, 0.8); else A.treePine(gx, gy, 0.75); }
    for (let k = 0; k < 2 + band; k++) A.stump(x + 0.4 + k * 0.45, y + 1.35 + (k % 2) * 0.2);
    // a saw shed with a crooked slate roof, open at the front
    const sx = x + 0.9, sy = y + 1.75, sw = 1.0 + band * 0.12, sd = 0.75, sh = 10 + band * 2;
    for (const [gx, gy] of [[sx, sy + sd], [sx + sw, sy + sd], [sx + sw, sy]]) A.line(A.P(gx, gy), A.P(gx, gy, sh), p.wood, 2);
    A.box(sx, sy, sw, 0.08, 0, sh, p.wall); A.box(sx, sy, 0.08, sd, 0, sh, p.wall);
    A.box(sx + 0.15, sy + 0.25, sw - 0.3, 0.2, 0, 3.5, '#6a5038');
    A.log(sx + 0.2, sx + sw - 0.2, sy + 0.35, 5, 1.8);
    const rf = gableL({ x: sx, y: sy, w: sw, d: sd, z: 0, h: sh, col: p.wall }, sd * 22, p.roof, 'x', 2, 0.1);
    let top = rf.zt + 8;
    if (band >= 1) A.logPile(x + 0.15, y + 2.85, 0.8, Math.min(4, 1 + band));
    if (band >= 2) { // a tall timber crane for the big trunks
      const [cx, cy] = A.P(x + 2.25, y + 1.4), [tx, ty] = A.P(x + 2.25, y + 1.4, 30 + band * 3);
      A.line([cx, cy], [tx, ty], p.wood, 2); A.line([tx, ty], [tx - 22, ty + 8], p.wood, 1.5); A.line([tx - 20, ty + 7.5], [tx - 20, ty + 20], IRON, 0.6);
      A.log(x + 1.2, x + 1.6, y + 1.35, 10 + band, 1.5);
      top = Math.max(top, 34 + band * 3);
    }
    skel(...A.P(x + 0.75, y + 2.5), 0.9); if (band >= 1) skel(...A.P(x + 2.1, y + 2.9), 0.85);
    if (band >= 3) A.witchLamp(x + 2.4, y + 3.2, 0, 12);
    return top;
  });

  // ================================================================ QUARRY: the slate pit
  def('quarry', ([x, y, w, d], L, band, p) => {
    const { P, poly, shade } = A, rock = '#4e4e56';
    const px = x + 0.3, py = y + 0.3, pw = w - 0.9, pd = d - 0.9, dep = 8 + band * 5 + L * 0.3;
    poly(A.quad(px - 0.15, py - 0.15, pw + 0.3, pd + 0.3), X.snow ? '#e6ebee' : '#5a5a5e', null);
    poly([P(px, py, 0), P(px + pw, py, 0), P(px + pw, py, -dep), P(px, py, -dep)], shade(rock, 0.18));
    poly([P(px, py, 0), P(px, py + pd, 0), P(px, py + pd, -dep), P(px, py, -dep)], shade(rock, -0.05));
    poly(A.quad(px, py, pw, pd, -dep), '#3e3e46');
    // stepped terraces, one per band
    for (let k = 1; k <= band + 1; k++) { const t = k / (band + 2), z = -dep * t, o = 0.18 * k; poly([P(px, py, z), P(px + pw, py, z), P(px + pw, py + o, z), P(px + o, py + o, z), P(px + o, py + pd, z), P(px, py + pd, z)], shade(rock, 0.1 - k * 0.04)); }
    // slate slabs at the bottom
    for (let k = 0; k < 2 + band; k++) A.box(px + 0.5 + k * 0.4, py + pd - 0.5, 0.3, 0.2, -dep, 3, '#5a5c66');
    poly(A.quad(px, py, pw, pd), null, '#2a2a30', 1);
    // treadwheel crane on the rim
    const cx = x + w - 0.4, cy = y + 0.6, [wx, wy] = P(cx, cy, 10);
    A.box(cx - 0.15, cy - 0.15, 0.3, 0.3, 0, 4, p.wood);
    A.circ(wx, wy, 7 + band, null, '#3a3028'); A.circ(wx, wy, 1.5, '#3a3028');
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; A.line([wx - Math.cos(a) * (7 + band), wy - Math.sin(a) * (7 + band)], [wx + Math.cos(a) * (7 + band), wy + Math.sin(a) * (7 + band)], '#3a3028', 0.6); }
    const [jx, jy] = P(cx - 0.9, cy + 0.7, 26 + band * 4); A.line([wx, wy], [jx, jy], p.wood, 1.6); A.line([jx, jy], [jx, jy + 18 + band * 3], IRON, 0.6);
    A.box(cx - 1.0, cy + 0.6, 0.22, 0.18, 26 + band * 4 - 22 - band * 3 - 4, 4, '#5a5c66');
    let top = 30 + band * 4;
    // a cutters' hut / the slate hall
    if (band >= 1) top = Math.max(top, house(x + w - 0.58, y + d - 1.45, 0.48, 0.55, 10 + band * 3, band, { axis: 'y', lean: -2, chim: 'house' }));
    if (band >= 3) { for (const k of [0, 1]) { const ox = x + 0.15 + k * 0.35; A.box(ox, y + d - 0.4, 0.16, 0.16, 0, 22 + k * 4, '#3a3a42'); pinnacle(ox + 0.08, y + d - 0.32, 22 + k * 4, 6, '#3a3a42'); } } // half-cut obelisks
    skel(...P(px + 0.6, py + pd - 0.2, -dep), 0.85); skel(...P(x + w - 0.6, y + 1.3), 0.85); if (band >= 2) skel(...P(px + 1.4, py + pd - 0.1, -dep), 0.85);
    A.witchLamp(x + 0.2, y + d - 0.2, 0, 12);
    return top;
  });

  // ================================================================ MINE: the crypt-mouth
  def('mine', ([x, y, w, d], L, band, p) => {
    const { P, line, poly } = A, mx = x + w * 0.35, my = y + d - 0.05, [px, py] = P(mx, my);
    const H = 16 + band * 4, W2 = 7 + band * 1.2;
    // a gothic arch carved into the hill, framed in dark stone
    poly([[px - W2 - 4, py], [px - W2 - 4, py - H * 0.72], [px, py - H - 6], [px + W2 + 4, py - H * 0.72], [px + W2 + 4, py]], p.stone);
    A.path([[px - W2, py], [px - W2, py - H * 0.68], [px, py - H], [px + W2, py - H * 0.68], [px + W2, py]]); A.c.fillStyle = A.F('#0e0e12'); A.c.fill();
    for (let k = 0; k < 5; k++) { const t = k / 4, a = Math.PI * (0.15 + 0.7 * t); line([px - Math.cos(a) * (W2 + 2), py - H * 0.68 - Math.sin(a) * (H * 0.32 + 4)], [px - Math.cos(a) * (W2 + 4), py - H * 0.7 - Math.sin(a) * (H * 0.34 + 6)], '#2a2a30', 0.8); }
    A.skull(px, py - H - 2, 0.9 + band * 0.1);
    if (band >= 2) for (const sx of [-1, 1]) { A.skull(px + sx * (W2 + 2), py - H * 0.72 - 1, 0.6); }
    // green glow deep inside
    A.lampDot(px, py - H * 0.3, 2.2, '#24402c', '#7affa8'); A.rec('lights', { x: px, y: py - H * 0.3, r: 24, col: 'witch' });
    A.witchLamp(mx + 0.55, my + 0.05, 0, 13);
    // rails and an ore cart
    const rl = Math.max(0.3, Math.min(1.6, A.N - 0.3 - my));
    for (let k = 0; k * 0.28 < rl - 0.1; k++) { const gy = my + 0.1 + k * 0.28; line(P(mx - 0.22, gy), P(mx + 0.22, gy), '#3a3028', 1.4); }
    line(P(mx - 0.15, my), P(mx - 0.15, my + rl), '#5a5a60', 1); line(P(mx + 0.15, my), P(mx + 0.15, my + rl), '#5a5a60', 1);
    const cy0 = my + Math.min(0.7, rl - 0.5);
    A.box(mx - 0.2, cy0, 0.4, 0.45, 2, 5, '#3a3a42'); const [ox, oy] = P(mx, cy0 + 0.22, 8); for (let k = 0; k < 4; k++) A.circ(ox - 3 + k * 2, oy - (k % 2), 1.5, k % 2 ? '#6a5a50' : '#4a7a5a');
    skel(...P(mx + 0.35, cy0 + 0.35), 0.85);
    let top = H + 10;
    // winding house beside the portal from band 1; a second shaft tower at band 3
    if (band >= 1) top = Math.max(top, house(x + w * 0.62, y + d - 0.75, 0.55, 0.5, 10 + band * 2, band, { axis: 'y', lean: 2, chim: 'house' }));
    if (band >= 3) { const tx = x + w * 0.05, ty = y + d - 0.9; A.box(tx, ty, 0.35, 0.35, 0, 30, p.stone2); A.courses({ x: tx, y: ty, w: 0.35, d: 0.35, z: 0, h: 30 }, 4.5, A.shade(p.stone2, -0.2)); const zt = A.cone(tx + 0.175, ty + 0.175, 0.3, 30, 14, p.roof); top = Math.max(top, zt + 4); }
    return top;
  });

  // ================================================================ WAREHOUSE: the charnel store
  def('warehouse', ([x, y, w, d], L, band, p) => {
    const bw = 1.1 + band * 0.1, bd = 1.3 + band * 0.12, storeys = 1 + Math.min(3, Math.floor((L + 1) / 5));
    const bx = x + 0.2, by = y + 0.25;
    let top = house(bx, by, bw, bd, 11 + storeys * 7, band, { axis: 'y', storeys, lean: 1.5, rh: 24 });
    // a hoist beam jutting from the gable with a coffin on the rope
    const [hx, hy] = A.P(bx + bw / 2, by + bd + 0.25, 8 + storeys * 7);
    A.line(A.P(bx + bw / 2, by + bd, 10 + storeys * 7), [hx, hy], p.beam, 2); A.line([hx, hy], [hx, hy + 12], IRON, 0.6);
    coffin(bx + bw / 2, by + bd + 0.27, 8 + storeys * 7 - 24, 0.8);
    if (band >= 2) { // a low side wing with a bone-ribbed roof
      A.box(x + 0.25 + bw, y + 0.3, 0.45, 0.9, 0, 10, p.stone);
      boneVault(x + 0.25 + bw, y + 0.3, 0.45, 0.9, 10, p.roof);
    }
    if (band >= 3) for (let k = 1; k < 4; k++) buttressR({ x: bx, y: by, w: bw, d: bd, z: 0, col: p.stone2 }, bd * k / 4, 22);
    // stacked coffins and crates
    for (let k = 0; k < Math.min(4, 1 + Math.floor(L / 5)); k++) coffinFlat(x + 0.25 + k * 0.05, y + d - 0.45 - k * 0.0, k * 3);
    return top;
  });

  // ================================================================ MARKET: the night market
  def('market', ([x, y, w, d], L, band, p) => {
    const { P } = A;
    let top = 20;
    if (band >= 2) { // a covered market hall on black posts
      const hx = x + 0.35, hy = y + 0.3, hw = 1.4, hd = 1.1, hh = 12 + band * 2;
      for (const [gx, gy] of [[hx, hy], [hx + hw, hy], [hx, hy + hd], [hx + hw, hy + hd], [hx + hw / 2, hy + hd], [hx + hw, hy + hd / 2]]) A.box(gx - 0.05, gy - 0.05, 0.1, 0.1, 0, hh, '#2a2a30');
      const rf = gableL({ x: hx, y: hy, w: hw, d: hd, z: 0, h: hh, col: p.wall }, hd * 20, p.roof, 'x', 1, 0.12);
      for (let k = 0; k < 4; k++) { const [lx, ly] = P(hx + 0.2 + k * 0.35, hy + hd, hh - 1); A.lantern(lx, ly + 4, 1.2); }
      top = rf.zt + 6;
      if (band >= 3) top = Math.max(top, belfry(hx + hw / 2 - 0.15, hy + 0.15, 0.3, hh + 22, band, { raven: false }));
    } else { // a market cross / obelisk with a hanging lantern
      const ox = x + 1.0, oy = y + 0.9, oh = 18 + band * 6 + L;
      A.box(ox - 0.25, oy - 0.25, 0.5, 0.5, 0, 3, p.stone);
      A.box(ox - 0.1, oy - 0.1, 0.2, 0.2, 3, oh, p.stone2);
      const [tx, ty] = P(ox, oy, oh + 3); A.poly([[tx - 2, ty], [tx + 2, ty], [tx, ty - 7]], p.stone2); A.skull(tx, ty + 3, 0.6);
      A.line([tx, ty + 6], [tx + 7, ty + 6], IRON, 1); A.lantern(tx + 7, ty + 11, 1.6);
      top = oh + 12;
    }
    // stalls under black and violet awnings, strung with lantern lines
    const st = [[x + 0.15, y + 1.55], [x + 1.55, y + 0.25], [x + 1.6, y + 1.2]].slice(0, 1 + Math.min(2, band));
    st.forEach(([gx, gy], k) => A.stall(gx, gy, ['#34343e', '#4a3a52', '#2c3a3a'][k], 'grave'));
    const a = P(x + 0.1, y + 0.1, 16), b = P(x + 2.3, y + 0.1, 16), c2 = P(x + 0.1, y + 2.3, 16);
    for (const [s0, s1] of [[a, b], [a, c2]]) { A.c.beginPath(); A.c.moveTo(...s0); A.c.quadraticCurveTo((s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2 + 8, ...s1); A.c.strokeStyle = A.F(IRON); A.c.lineWidth = 0.6; A.c.stroke(); for (let k = 1; k < 4; k++) { const t = k / 4, m = lerp(s0, s1, t); A.lampDot(m[0], m[1] + 8 * 4 * t * (1 - t) + 1.5, 1.2, '#4a8a5a', GLOW); } }
    A.rec('lights', { x: P(x + 1, y + 1)[0], y: P(x + 1, y + 1, 12)[1], r: 30, col: 'witch' });
    fog(x + 1.2, y + 1.6, 0.6, 0.12);
    return top;
  });

  // ================================================================ BARRACKS: barrow-halls of the risen
  function barrow(gx, gy, len, h, p) { // an earthen long-mound along gx with a stone portal facing front-right
    const { P, c } = A, [x0, y0] = P(gx, gy + 0.35), [x1, y1] = P(gx + len, gy + 0.35);
    const g = X.snow ? '#e4e8ea' : A.mix(A.GROUND, '#4a5040', 0.45);
    c.beginPath(); c.moveTo(...P(gx, gy + 0.7)); c.quadraticCurveTo(x0 - 4, y0 - h * 1.2, (x0 + x1) / 2, Math.min(y0, y1) - h * 1.1); c.quadraticCurveTo(x1 + 6, y1 - h * 1.1, ...P(gx + len, gy)); c.lineTo(...P(gx + len, gy + 0.7)); c.closePath();
    A.gradFill(x0 - 6, x1 + 6, g);
    // portal of three stones
    const pg = gx + len - 0.05, [qx, qy] = P(pg, gy + 0.45);
    A.poly([[qx - 4, qy], [qx - 4, qy - 9], [qx + 4, qy - 9], [qx + 4, qy]], '#0e0e12');
    A.box(pg - 0.03, gy + 0.18, 0.1, 0.1, 0, 10, p.stone2); A.box(pg - 0.03, gy + 0.62, 0.1, 0.1, 0, 10, p.stone2);
    A.box(pg - 0.06, gy + 0.12, 0.14, 0.66, 10, 2.5, p.stone);
    A.lampDot(qx, qy - 4, 1.6, '#24402c', '#7affa8'); A.rec('lights', { x: qx, y: qy - 4, r: 14, col: 'witch' });
    A.skull(qx, qy - 13.5, 0.6);
    return h * 1.1 + 4;
  }
  def('barracks', ([x, y, w, d], L, band, p) => {
    let top = 0;
    if (band >= 2) { // a fortified crypt-keep
      const kx = x + 0.3, ky = y + 0.25, kw = 1.6, kd = 1.15, kh = 16 + band * 3 + L * 0.3;
      const b = A.box(kx, ky, kw, kd, 0, kh, p.stone); A.courses(b, 4, A.shade(p.stone, -0.18));
      for (let k = 0; k < 4; k++) A.slit(b, 'L', kw * (k + 0.5) / 4, kh * 0.45, 5); for (let k = 0; k < 3; k++) A.slit(b, 'R', kd * (k + 0.5) / 3, kh * 0.45, 5);
      A.archDoor(b, 'L', kw / 2, 0.36, 11); A.skull(...A.P(kx + kw / 2, ky + kd, 14), 0.8);
      if (X.tech('fortification') || band >= 3) { const t = A.box(kx - 0.05, ky - 0.05, kw + 0.1, kd + 0.1, kh, 3, A.shade(p.stone, -0.1)); A.parapet({ ...t, h: 3 }, 3); top = kh + 7; }
      else top = gableL(b, kd * 18, p.roof, 'x', 0, 0.1).zt + 6;
      if (band >= 3) top = Math.max(top, belfry(kx + kw - 0.2, ky - 0.15, 0.45, kh + 22, band, { crenel: true, spire: true }));
      barrow(x + 0.2, y + 1.6, 1.4, 8, p);
    } else {
      top = barrow(x + 0.25, y + 0.25, 1.6 + band * 0.4, 10 + band * 2 + L * 0.4, p);
      if (band >= 1) top = Math.max(top, barrow(x + 0.3, y + 1.35, 1.3, 8 + L * 0.3, p));
      // standing stones
      for (let k = 0; k < 2 + band; k++) { const gx = x + 2.3 + (k % 2) * 0.3, gy = y + 0.4 + k * 0.5; A.box(gx, gy, 0.12, 0.1, 0, 10 + (k % 3) * 2, '#5a5a62'); }
    }
    A.banner(x + w - 0.25, y + d - 0.3, 0, 26 + band * 4, flagCol());
    A.witchLamp(x + 0.15, y + d - 0.15, 0, 13);
    ravensCircle(x + 1.3, y + 1.0, top, 2, 18);
    return top;
  });

  // ================================================================ STABLE: the nightmare stables
  def('stable', ([x, y, w, d], L, band, p) => {
    const sw = 1.6 + band * 0.15, sd = 0.75;
    let top = house(x + 0.15, y + 0.2, sw, sd, 11 + band * 2, band, { axis: 'x', lean: -2, rh: 24 });
    const b = { x: x + 0.15, y: y + 0.2, w: sw, d: sd, z: 0 };
    const n = 3 + band; for (let k = 0; k < n; k++) { const u = sw * (k + 0.5) / n; A.poly(A.onL(b, u - 0.12, u + 0.12, 0, 6), '#141418'); A.line(A.onL(b, u - 0.12, u + 0.12, 3, 3)[0], A.onL(b, u - 0.12, u + 0.12, 3, 3)[1], '#5a4a3a', 0.8); }
    // a bone-arch gateway at band 2+
    if (band >= 2) { const [gx, gy] = A.P(x + 1.9, y + 2.4); for (const s of [-1, 1]) { A.c.beginPath(); A.c.moveTo(gx + s * 7, gy); A.c.quadraticCurveTo(gx + s * 9, gy - 14, gx + s * 1, gy - 22); A.c.strokeStyle = A.F(BONE); A.c.lineWidth = 2.6; A.c.stroke(); } A.skull(gx, gy - 23, 0.8); top = Math.max(top, 26); }
    A.ironFence([[x + 0.3, y + 1.3], [x + 1.4, y + 1.3], [x + 1.4, y + 2.4]], 6);
    A.animal(x + 0.75, y + 1.75, 'nightmare', 1); if (L >= 3) A.animal(x + 1.0, y + 2.25, 'nightmare', -1);
    if (band >= 1) A.animal(x + 2.1, y + 1.6, 'nightmare', -1);
    if (band >= 3) A.animal(x + 2.4, y + 2.0, 'nightmare', 1);
    // the eyes of the beasts glow at night
    for (const [gx, gy, f] of [[0.75, 1.75, 1], [1.0, 2.25, -1]].slice(0, L >= 3 ? 2 : 1)) { const [ex, ey] = A.P(x + gx, y + gy); A.lampDot(ex + 8 * f, ey - 10, 0.6, '#3a6a4a', GLOW); }
    return top;
  });

  // ================================================================ WAR PIT: the bone arena
  def('warpit', ([x, y, w, d], L, band, p) => {
    const { P, c } = A, cx = x + w / 2, cy = y + d / 2, r = Math.min(w, d) * 0.4, dep = 6 + band * 2;
    const [ex, ey, rx, ry] = A.ell(cx, cy, 0, r);
    c.beginPath(); c.ellipse(ex, ey, rx + 5, ry + 3, 0, 0, TAU); c.fillStyle = A.F(X.snow ? '#e4e8ea' : '#4a4848'); c.fill();
    if (band >= 1) for (let t = 0; t < band; t++) { c.beginPath(); c.ellipse(ex, ey, rx + 5 - t * 3, ry + 3 - t * 1.6, 0, 0, TAU); c.strokeStyle = A.F('#6a6a70'); c.lineWidth = 1.6; c.stroke(); }
    c.beginPath(); c.ellipse(ex, ey + dep * 0.3, rx * 0.72, ry * 0.72, 0, 0, TAU); c.fillStyle = A.F('#2a2624'); c.fill();
    c.beginPath(); c.ellipse(ex, ey + dep * 0.5, rx * 0.6, ry * 0.6, 0, 0, TAU); c.fillStyle = A.F(X.snow ? '#d8dcde' : '#6a5a48'); c.fill();
    A.rec('pit', { x: ex, y: ey + dep * 0.5, rx: rx * 0.6, ry: ry * 0.6 });
    // a ring of bone stakes with skulls
    const n = 10 + band * 3;
    for (let k = 0; k < n; k++) { const a = k / n * TAU, sx = ex + Math.cos(a) * (rx + 2), sy = ey + Math.sin(a) * (ry + 1.5); if (Math.sin(a) < -0.2) { A.line([sx, sy], [sx, sy - 9], BONE, 1.4); if (k % 3 === 0) A.skull(sx, sy - 10, 0.55); } }
    for (let k = 0; k < n; k++) { const a = k / n * TAU, sx = ex + Math.cos(a) * (rx + 2), sy = ey + Math.sin(a) * (ry + 1.5); if (Math.sin(a) >= -0.2) { A.line([sx, sy], [sx, sy - 9], BONE, 1.4); if (k % 3 === 0) A.skull(sx, sy - 10, 0.55); } }
    brazier(x + 0.2, y + d - 0.25, 0, 1); brazier(x + w - 0.25, y + 0.2, 0, 1);
    if (band >= 2) ironGate(x + w - 0.1, cy + 0.4, false, 0.6, 18);
    A.banner(x + 0.15, y + 0.15, 0, 26 + band * 4, flagCol());
    return 26 + band * 4;
  });

  // ================================================================ WORKSHOP: the coffinwright & engine yard
  def('workshop', ([x, y, w, d], L, band, p) => {
    const sw = Math.min(w - 0.5, 1.2 + band * 0.15), sd = Math.min(d - 0.4, 0.9);
    let top = house(x + 0.15, y + 0.15, sw, sd, 11 + band * 2, band, { axis: 'x', lean: 2, chim: 'house', storeys: band >= 3 ? 2 : 1 });
    // a lean-to of upright coffins
    for (let k = 0; k < 2 + band; k++) coffin(x + 0.3 + k * 0.22, y + sd + 0.45, 0, 0.8);
    // a bone-and-iron siege engine taking shape
    const ex = x + sw + 0.35, ey = y + 0.3, [bx, by] = A.P(ex, ey + 0.5);
    A.line([bx - 6, by], [bx + 6, by - 3], p.wood, 2); A.line([bx - 4, by - 1], [bx, by - 14 - band * 2], p.wood, 1.6); A.line([bx + 4, by - 2], [bx, by - 14 - band * 2], p.wood, 1.6);
    A.line([bx, by - 14 - band * 2], [bx + 10, by - 20 - band * 3], BONE, 1.6); A.skull(bx + 10, by - 21 - band * 3, 0.6);
    if (X.tech('guilds')) A.signBoard(x + 0.2, y + sd + 0.2, 12, '#34343e', 'tools');
    skel(...A.P(x + sw * 0.6, y + sd + 0.3), 0.85);
    return Math.max(top, 22 + band * 3);
  });

  // ================================================================ SMELTER: the soulforge
  def('smelter', ([x, y, w, d], L, band, p) => {
    const n = 1 + Math.min(2, band), { P } = A;
    let top = 0;
    for (let k = n - 1; k >= 0; k--) {
      const fx = x + 0.55 + k * 0.6, fy = y + 0.75 + (k % 2) * 0.55, fh = 14 + band * 3;
      const b = A.box(fx, fy, 0.55, 0.55, 0, fh, p.stone); A.courses(b, 3.5, A.shade(p.stone, -0.2));
      A.box(fx + 0.05, fy + 0.05, 0.45, 0.45, fh, 2, IRON);
      const zt = A.cone(fx + 0.275, fy + 0.275, 0.2, fh + 2, 10, '#2a2a30');
      A.box(fx + 0.21, fy + 0.21, 0.13, 0.13, zt - 6, 10, '#2e2e36');
      A.chimney(fx + 0.21, fy + 0.21, zt + 2, 3, 'smelter', '#2e2e36');
      // the furnace mouth burns green
      const q = A.onL(b, 0.15, 0.4, 1, 6); A.lamp(q, '#3a6a4a', '#b8ffcc'); const m = lerp(q[0], q[2], 0.5); A.rec('lights', { x: m[0], y: m[1], r: 22, col: 'witch' }); A.rec('sparks', { x: m[0], y: m[1], kind: 'witch' });
      top = Math.max(top, zt + 10);
    }
    if (X.tech('bellows')) { const [bx, by] = P(x + 1.9, y + 1.9, 2); A.poly([[bx - 7, by], [bx + 5, by - 3], [bx + 5, by - 7], [bx - 7, by - 6]], '#4a3a2e'); A.line([bx + 5, by - 5], [bx + 10, by - 6], IRON, 1.2); }
    for (let k = 0; k < 2 + band; k++) A.rock(x + 0.3 + k * 0.3, y + d - 0.35, 0.45, k % 2 ? '#4a6a5a' : '#5a5050');
    skel(...P(x + 1.6, y + 1.6), 0.85);
    return top;
  });

  // ================================================================ SMITHY: the scythe forge
  def('smithy', ([x, y, w, d], L, band, p) => {
    const { P } = A, sw = 1.2 + band * 0.12, sd = 0.9;
    // an open-fronted forge shed on stone piers
    for (const [gx, gy] of [[x + 0.3, y + 0.3 + sd], [x + 0.3 + sw, y + 0.3 + sd], [x + 0.3 + sw, y + 0.3]]) A.box(gx - 0.06, gy - 0.06, 0.12, 0.12, 0, 12 + band, p.stone2);
    A.box(x + 0.3, y + 0.3, sw, 0.1, 0, 12 + band, p.stone); A.box(x + 0.3, y + 0.3, 0.1, sd, 0, 12 + band, p.stone);
    const hb = A.box(x + 0.45, y + 0.45, 0.45, 0.4, 0, 6, p.stone); const q = A.onL(hb, 0.08, 0.37, 1, 5); A.lamp(q, '#3a6a4a', '#b8ffcc'); { const m = lerp(q[0], q[2], 0.5); A.rec('lights', { x: m[0], y: m[1], r: 20, col: 'witch' }); A.rec('sparks', { x: m[0], y: m[1], kind: 'witch' }); }
    A.chimney(x + 0.55, y + 0.5, 6, 18 + band * 3, 'smithy', '#2e2e36');
    const rf = gableL({ x: x + 0.3, y: y + 0.3, w: sw, d: sd, z: 0, h: 12 + band, col: p.wall }, sd * 20, p.roof, 'x', -2, 0.1);
    const [ax, ay] = P(x + 0.3 + sw * 0.65, y + 0.3 + sd * 0.7);
    A.poly([[ax - 3, ay], [ax + 3, ay], [ax + 1.5, ay - 3], [ax + 4, ay - 4.5], [ax - 4, ay - 4.5], [ax - 1.5, ay - 3]], '#3a3a40'); A.rec('anvils', { x: ax, y: ay - 5 });
    // racks of scythes and hooked blades
    const rx = x + 1.9, [r0x, r0y] = P(rx, y + 1.6), [r1x, r1y] = P(rx, y + 2.1);
    A.line([r0x, r0y], [r0x, r0y - 12], p.wood, 1); A.line([r1x, r1y], [r1x, r1y - 12], p.wood, 1); A.line([r0x, r0y - 11], [r1x, r1y - 11], p.wood, 1);
    for (let k = 0; k < 2 + band; k++) { const m = lerp([r0x, r0y], [r1x, r1y], (k + 0.5) / (2 + band)); A.line([m[0], m[1] - 11], [m[0], m[1] + 1], '#5a4a3a', 0.8); A.c.beginPath(); A.c.moveTo(m[0], m[1] - 11); A.c.quadraticCurveTo(m[0] + 5, m[1] - 13, m[0] + 6, m[1] - 8); A.c.strokeStyle = A.F('#c8ccd2'); A.c.lineWidth = 0.9; A.c.stroke(); }
    let top = rf.zt + 6;
    if (band >= 1) { const [gx, gy] = P(x + 0.45, y + 1.75, 5); A.box(x + 0.3, y + 1.6, 0.4, 0.18, 0, 3, p.stone); A.circ(gx, gy, 4.5, '#6a6a70', A.OUT); A.circ(gx, gy, 1, IRON); }
    if (band >= 2) top = Math.max(top, house(x + 1.62, y + 0.3, 0.6, 0.6, 14 + band * 4, band, { axis: 'y', storeys: band >= 3 ? 3 : 2, lean: 3, chim: 'house' }));
    if (band >= 3) raven(...P(x + 1.92, y + 0.6, top - 6), 0.8);
    return top;
  });

  // ================================================================ ARMORY: the iron vault
  def('armory', ([x, y, w, d], L, band, p) => {
    const vx = x + 0.3, vy = y + 0.35, vw = 1.3 + band * 0.1, vd = 1.0, vh = 9 + band * 3 + L * 0.3;
    A.box(vx - 0.06, vy - 0.06, vw + 0.12, vd + 0.12, 0, 2, A.shade(p.stone, -0.25));
    const b = A.box(vx, vy, vw, vd, 2, vh, p.stone); A.courses(b, 3.6, A.shade(p.stone, -0.2));
    // studded iron doors
    const dq = A.onL(b, vw * 0.3, vw * 0.7, 0, Math.min(10, vh - 1)); A.poly(dq, '#26262c');
    for (let r = 1; r < 4; r++) for (let k = 1; k < 4; k++) { const pt = A.onL(b, vw * (0.3 + 0.1 * k), vw * (0.3 + 0.1 * k), r * 2.4, r * 2.4)[0]; A.circ(pt[0], pt[1], 0.5, '#8a8a90'); }
    A.slit(b, 'R', vd * 0.3, vh * 0.4, 5); A.slit(b, 'R', vd * 0.7, vh * 0.4, 5);
    let top;
    if (band >= 3 || p.e >= 3) top = boneVault(vx, vy, vw, vd, 2 + vh, p.roof).top + 4;
    else top = gableL(b, vd * 14, p.roof, 'x', 0, 0.08).zt + 4;
    // a skull shield over the door
    const [sx, sy] = A.P(vx + vw / 2, vy + vd, 2 + Math.min(10, vh - 1) + 4); A.poly([[sx - 4, sy - 3], [sx + 4, sy - 3], [sx + 3.5, sy + 2], [sx, sy + 5], [sx - 3.5, sy + 2]], flagCol()); A.skull(sx, sy, 0.55);
    if (band >= 2) top = Math.max(top, belfry(vx + vw - 0.05, vy - 0.2, 0.42, vh + 20, band, { crenel: true, spire: false, raven: false }));
    if (X.tech('metallurgy')) for (let k = 0; k < 3; k++) { const [hx, hy] = A.P(x + 2.0, y + 0.6 + k * 0.3); A.line([hx, hy], [hx, hy - 15], '#5a4a3a', 0.8); A.poly([[hx, hy - 15], [hx + 3, hy - 13], [hx, hy - 11]], '#a8acb2', null); }
    return top;
  });

  // ================================================================ ACADEMY: the necromantic college
  def('academy', ([x, y, w, d], L, band, p) => {
    const hx = x + 0.2, hy = y + 0.3, hw = 1.4 + band * 0.1, hd = 1.0;
    let top = house(hx, hy, hw, hd, 14 + band * 4 + L * 0.3, band, { axis: 'x', storeys: band >= 2 ? 2 : 1, lean: -1, dormer: band >= 1, chim: 'house' });
    // the library tower with a clock face
    if (band >= 1) { const t = belfry(hx + hw + 0.05, hy + 0.05, 0.45, 26 + band * 8 + L * 0.4, band, { raven: true }); top = Math.max(top, t); const [cx, cy] = A.P(hx + hw + 0.5, hy + 0.27, 18 + band * 6); A.circ(cx, cy, 2.6, BONE, A.OUT); A.line([cx, cy], [cx, cy - 2], IRON, 0.6); A.line([cx, cy], [cx + 1.6, cy], IRON, 0.6); }
    // an observatory dome (cartography)
    if (X.tech('cartography')) { const ox = hx + 0.35, oy = hy + 0.3, oz = 14 + band * 4 + L * 0.3 + 6; const zt = A.dome(ox, oy, 0.25, oz, 9, '#3a4a4a'); const [tx, ty] = A.P(ox, oy, oz + 5); A.line([tx, ty], [tx + 9, ty - 6], '#8a7a5a', 1.6); top = Math.max(top, zt + 4); }
    // apothecary green bottles at the window (medicine)
    if (X.tech('medicine')) { const [bx, by] = A.P(hx + 0.2, hy + hd + 0.05, 2); for (let k = 0; k < 3; k++) A.lampDot(bx + k * 2.4, by - 2 - (k % 2), 1.1, '#3a7a4a', GLOW); }
    // a reading garden of tombs
    A.tomb(x + 0.3, y + d - 0.3, 0.7); if (band >= 1) A.tomb(x + 0.7, y + d - 0.25, 0.65); if (band >= 2) A.deadTree(x + 2.1, y + d - 0.35, 0.6);
    return top;
  });

  // ================================================================ TAVERN: the Wake (a coffin-sign inn)
  def('tavern', ([x, y, w, d], L, band, p) => {
    const storeys = 1 + Math.min(2, Math.floor(L / 4));
    let top = house(x + 0.15, y + 0.2, w - 0.35, d - 0.6, 10 + storeys * 6, band, { axis: 'y', storeys, lean: 3, chim: 'house', rh: 24 });
    // the sign: a coffin-shaped board with a tankard
    const [sx, sy] = A.P(x + w - 0.2, y + d - 0.35, 13); A.line([sx, sy], [sx + 7, sy], IRON, 1);
    A.poly([[sx + 5, sy + 1], [sx + 9, sy + 1], [sx + 10, sy + 5], [sx + 9, sy + 10], [sx + 5, sy + 10], [sx + 4, sy + 5]], '#3a2e26'); A.lampDot(sx + 7, sy + 5.5, 1.3, '#c8a050', '#ffe0a0');
    for (let k = 0; k < storeys; k++) { const [lx, ly] = A.P(x + w - 0.18, y + 0.5 + k * 0.4, 8 + k * 6); A.lantern(lx, ly, 1.2); }
    A.barrel(x + 0.35, y + d - 0.2); A.barrel(x + 0.6, y + d - 0.15);
    if (band >= 1) { A.box(x + 0.85, y + d - 0.32, 0.4, 0.12, 0, 3, p.wood); skel(...A.P(x + 1.0, y + d - 0.1), 0.8); }
    return top;
  });

  // ================================================================ THEATRE: the danse macabre stage
  def('theatre', ([x, y, w, d], L, band, p) => {
    const { P } = A, sx = x + 0.2, sy = y + 0.2, sw = w - 0.5, sd = 0.55, sh = 16 + band * 4;
    // a gothic proscenium wall with a pointed arch and red-black curtains
    const b = A.box(sx, sy, sw, sd, 0, sh, p.stone); A.courses(b, 4, A.shade(p.stone, -0.18));
    const q = A.onL(b, sw * 0.2, sw * 0.8, 3, sh * 0.72), tp = A.onL(b, sw / 2, sw / 2, sh * 0.72 + 5, 0)[0];
    A.path([q[0], q[1], q[2], tp, q[3]]); A.c.fillStyle = A.F('#141016'); A.c.fill();
    A.poly([q[0], lerp(q[0], q[1], 0.28), lerp(q[3], q[2], 0.18), q[3]], '#5a1e2a'); A.poly([lerp(q[0], q[1], 0.72), q[1], q[2], lerp(q[3], q[2], 0.82)], '#5a1e2a');
    // dancing skeletons on the boards, lit green from the footlights
    const mid = lerp(q[0], q[1], 0.5); skel(mid[0] - 4, mid[1] + 1, 0.9); skel(mid[0] + 5, mid[1] - 1, 0.9);
    for (let k = 0; k < 4; k++) { const f = lerp(q[0], q[1], 0.2 + k * 0.2); A.lampDot(f[0], f[1] + 1, 0.9, '#3a7a4a', GLOW); }
    A.rec('lights', { x: mid[0], y: mid[1] - 6, r: 30, col: 'witch' });
    const rf = gableL(b, sd * 20, p.roof, 'x', 0, 0.08);
    for (const u of [0, sw]) { const g = P(sx + u, sy + sd, sh); A.poly([[g[0] - 1.8, g[1]], [g[0] + 1.8, g[1]], [g[0], g[1] - 10 - band * 2]], A.shade(p.stone, -0.1)); }
    // masks over the arch
    A.skull(tp[0], tp[1] - 3, 0.8);
    let top = rf.zt + 10;
    if (band >= 1) for (const u of [-0.05, sw - 0.25]) { // turrets flanking the stage
      const tx = sx + u, ty = sy + sd - 0.05, th = sh + 10 + band * 4 + L;
      const tb = A.box(tx, ty, 0.3, 0.3, 0, th, p.stone2); A.courses(tb, 4, A.shade(p.stone2, -0.2)); A.lancet(tb, 'L', 0.15, th - 12, 0.1, 6);
      const zt = A.cone(tx + 0.15, ty + 0.15, 0.24, th, 16, p.roof); top = Math.max(top, zt + 6);
      const [fx, fy] = P(tx + 0.15, ty + 0.15, zt); A.line([fx, fy], [fx, fy - 4], IRON, 1); A.lantern(fx + 3, fy + 4, 1.2);
    }
    if (band >= 2) { // a black awning over the stalls on bone poles
      const ay = y + 0.9, ad = Math.min(d - 1.0, 0.45), ah = 11;
      for (const gx of [sx + 0.1, sx + sw - 0.1]) A.line(P(gx, ay + ad), P(gx, ay + ad, ah), BONE, 1.2);
      A.poly([P(sx, ay, ah + 3), P(sx + sw, ay, ah + 3), P(sx + sw, ay + ad, ah), P(sx, ay + ad, ah)], rc('#2a2030'));
      for (let k = 0; k < 6; k++) { const m = lerp(P(sx, ay + ad, ah), P(sx + sw, ay + ad, ah), (k + 0.5) / 6); A.poly([[m[0] - 3, m[1]], [m[0] + 3, m[1]], [m[0], m[1] + 3]], '#5a1e2a', null); }
    }
    // benches for the audience
    for (let r = 0; r < 1 + band; r++) { const by = y + 0.95 + r * 0.22; if (by > y + d - 0.12) break; A.box(sx + 0.2, by, sw - 0.4, 0.08, 0, 2.5, p.wood); }
    if (band >= 1) { A.banner(x + 0.1, y + d - 0.1, 0, 22, '#5a1e2a'); A.banner(x + w - 0.1, y + d - 0.1, 0, 22, flagCol()); }
    return top;
  });

  // ================================================================ TEMPLE: the cathedral of the pale gods
  def('temple', ([x, y, w, d], L, band, p) => {
    const col = p.e >= 3 ? '#30303a' : p.stone2;
    const nx = x + 0.25, ny = y + 0.35, nw = 1.0, nd = 1.25 + band * 0.1, nh = 16 + band * 6 + L * 0.6;
    let top = 0;
    // the bell tower or the great spire at the back
    top = belfry(nx + nw - 0.05, ny - 0.25, 0.45 + band * 0.05, nh + 22 + band * 10, band, { col });
    A.box(nx - 0.06, ny - 0.06, nw + 0.12, nd + 0.12, 0, 2.5, A.shade(col, -0.25));
    const b = A.box(nx, ny, nw, nd, 2.5, nh, col); A.courses(b, 4.2, A.shade(col, -0.18));
    const nR = Math.max(3, Math.round(nd / 0.33));
    for (let k = 0; k < nR; k++) A.lancet(b, 'R', nd * (k + 0.5) / nR, nh * 0.3, 0.12, nh * 0.45);
    if (band >= 1) for (let k = 1; k < nR; k++) buttressR(b, nd * k / nR, nh, 0.15);
    A.archDoor(b, 'L', nw / 2, 0.32, Math.min(12, nh * 0.45));
    for (const u of [0.05, nw - 0.05]) buttressL(b, u, nh, 0.16);
    const rh = nw * (20 + band * 5), rf = gableL(b, rh, p.roof, 'y', 0, 0.08);
    const [rx, ry] = A.P(nx + nw / 2, ny + nd, 2.5 + nh + rh * 0.3);
    if (band >= 1) rose(rx, ry, 3 + band * 1.3 + p.e * 0.4, p.e); else A.lancet(b, 'L', nw / 2, nh * 0.6, 0.14, 5);
    if (band >= 2) for (const u of [0, nw]) pinnacle(nx + u, ny + nd, 2.5 + nh, 12, A.shade(col, -0.05));
    A.skull(...A.P(nx + nw / 2, ny + nd, 2.5 + Math.min(12, nh * 0.45) + 3), 0.75);
    // churchyard
    A.tomb(x + 1.55, y + 1.5, 0.75); A.tomb(x + 1.7, y + 1.0, 0.7); if (band >= 1) A.tomb(x + 1.45, y + 1.8, 0.7);
    A.witchLamp(x + 1.75, y + 1.8, 0, 13);
    wisp(x + 1.6, y + 1.3, 10); fog(x + 1.3, y + 1.7, 0.6);
    ravensCircle(nx + nw, ny, top - 6, 3, 18);
    return Math.max(top, rf.zt + 10);
  });

  // ================================================================ MAGE TOWER: the necromancer's spire
  def('magetower', ([x, y, w, d], L, band, p) => {
    const cx = x + w / 2, cy = y + d / 2, H = 40 + band * 10 + Math.min(20, L), col = '#2e2e36';
    // a buttressed plinth, then two tapering drums with a bone-railed gallery between
    A.box(cx - 0.42, cy - 0.42, 0.84, 0.84, 0, 5, p.stone);
    for (const [ox, oy] of [[-0.42, 0.3], [0.3, 0.3], [0.3, -0.42]]) { A.box(cx + ox, cy + oy, 0.12, 0.12, 5, 9 + band * 2, p.stone2); pinnacle(cx + ox + 0.06, cy + oy + 0.06, 14 + band * 2, 6); }
    const h1 = H * 0.5, h2 = H * 0.32;
    A.cyl(cx, cy, 0.3, 5, h1, col, '#3a3a44');
    A.twistLines(cx, cy, 5, 5 + h1, 0.3, BONE, 1.2, 0.95); A.twistLines(cx, cy, 5, 5 + h1, 0.3, BONE, 1.2, 0.95, Math.PI);
    const gz = 5 + h1; A.cyl(cx, cy, 0.4, gz, 2.5, '#3a3a44');
    { const [ex, ey, rx, ry] = A.ell(cx, cy, gz + 2.5, 0.4); for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI, px = ex + Math.cos(a) * rx, py = ey + Math.sin(a) * ry; A.line([px, py], [px, py - 4], BONE, 0.9); } }
    A.cyl(cx, cy, 0.22, gz + 2.5, h2, col, '#3a3a44');
    for (let v = 12; v < h1; v += 13) { const [lx, ly] = A.P(cx + 0.21, cy + 0.21, 5 + v); A.lamp([[lx - 1, ly], [lx + 1, ly], [lx + 1, ly - 5], [lx, ly - 6.5], [lx - 1, ly - 5]], '#24302a', GLOW); }
    { const [lx, ly] = A.P(cx + 0.16, cy + 0.16, gz + 6); A.lamp([[lx - 1, ly], [lx + 1, ly], [lx + 1, ly - 5], [lx, ly - 6.5], [lx - 1, ly - 5]], '#24302a', GLOW); }
    // a crown of bone spikes round a green orb
    const z0 = gz + 2.5 + h2, [ox, oy] = A.P(cx, cy, z0 + 2);
    A.cyl(cx, cy, 0.3, z0, 2.5, col);
    const spikes = front => { for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, ex = ox + Math.cos(a) * 6.5, ey = oy + Math.sin(a) * 3 + 1; if ((Math.sin(a) >= 0) === front) { A.c.beginPath(); A.c.moveTo(ex, ey); A.c.quadraticCurveTo(ex + Math.cos(a) * 4, ey - 6, ex + Math.cos(a) * 1, ey - 11 - band * 1.5); A.c.strokeStyle = A.F(BONE); A.c.lineWidth = 1.6; A.c.stroke(); } } };
    spikes(false);
    A.lampDot(ox, oy - 7, 3 + band * 0.5, '#4aa870', '#c8ffd8');
    spikes(true);
    if (band >= 2) for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.4; A.skull(ox + Math.cos(a) * 12, oy - 9 + Math.sin(a) * 4, 0.6); } // skulls orbiting the orb
    A.rec('magic', { x: ox, y: oy - 7, r: 8 + band * 2, n: 3 + band * 2, col: 'rgba(120,255,160,A)', seed: A.R(), bolt: band >= 3 });
    A.rec('lights', { x: ox, y: oy - 7, r: 30 + band * 6, col: 'witch' });
    ravensCircle(cx, cy, z0 + 12, 2 + band, 16);
    return z0 + 16 + band;
  });

  // ================================================================ HIDEOUT: the catacomb stair
  def('hideout', ([x, y, w, d], L, band, p) => {
    const cw = Math.min(0.9, w * 0.45);
    let top = 0;
    if (band >= 2) top = crypt(x + w - 0.85, y + 0.2, 0.55, 0.5, 10 + band * 2, { glow: band >= 3 });
    top = Math.max(top, crypt(x + 0.3, y + 0.3, cw, cw * 0.9, 9 + band * 2 + Math.min(4, L * 0.3), { glow: false }));
    // steps down into the dark beside it
    const sx = x + 0.4 + cw, sy = y + 0.45 + (band >= 2 ? 0.55 : 0);
    A.poly(A.quad(sx, sy, 0.4, 0.55), '#141418');
    for (let k = 0; k < 4; k++) A.line(A.P(sx, sy + 0.1 + k * 0.12, -k * 1.5), A.P(sx + 0.4, sy + 0.1 + k * 0.12, -k * 1.5), '#4a4a52', 0.8);
    A.ironFence([[sx, sy + 0.6], [sx + 0.45, sy + 0.6]], 5);
    A.lampDot(...A.P(sx + 0.2, sy + 0.3, -3), 1.4, '#24402c', '#7affa8');
    const nT = 2 + band + Math.floor(L / 4);
    for (let k = 0; k < Math.min(9, nT); k++) A.tomb(x + 0.3 + (k % 4) * 0.42, y + d - 0.35 - Math.floor(k / 4) * 0.35 - (k % 2) * 0.1, 0.7);
    A.deadTree(x + 0.2, y + d * 0.55, 0.7);
    if (band >= 1) { const [tx, ty] = A.P(x + 0.2, y + d * 0.55); A.lantern(tx - 6, ty - 10, 1.3); }
    if (band >= 3) ironGate(x + w * 0.5, y + d - 0.1, true, 0.5, 14);
    fog(x + w / 2, y + d / 2, 0.7);
    return top;
  });
  function mourner(gx, gy, s = 1) { // a hooded stone mourner on a plinth
    const [x, y] = A.P(gx, gy); A.box(gx - 0.1, gy - 0.1, 0.2, 0.2, 0, 4 * s, '#6a6a72');
    A.poly([[x - 2.6 * s, y - 4 * s], [x + 2.6 * s, y - 4 * s], [x + 1.6 * s, y - 13 * s], [x, y - 15.5 * s], [x - 1.6 * s, y - 13 * s]], '#8a8a92');
    A.circ(x + 0.3 * s, y - 12.6 * s, 1 * s, '#2a2a30');
  }
  def('shrine', ([x, y, w, d], L, band, p) => {
    const cw = Math.min(0.8, w * 0.4) + band * 0.06;
    let top = crypt(x + 0.3, y + 0.3, cw, cw * 0.9, 10 + band * 3 + Math.min(4, L * 0.3), { glow: band >= 1 });
    for (let k = 0; k < Math.min(8, 2 + band * 2); k++) A.tomb(x + 0.35 + (k % 4) * 0.4, y + d - 0.4 - Math.floor(k / 4) * 0.4, 0.7);
    if (band >= 1) mourner(x + 0.4 + cw + 0.3, y + 0.55, 1 + band * 0.1);
    if (band >= 2) { A.witchLamp(x + 0.25, y + d - 0.2, 0, 12); A.deadTree(x + w - 0.35, y + 0.35, 0.7); }
    if (band >= 3) { A.ironFence([[x + 0.1, y + d - 0.1], [x + w - 0.1, y + d - 0.1]], 6); wisp(x + w / 2, y + d / 2, 14); }
    fog(x + w / 2, y + d * 0.6, 0.5);
    return top;
  });
  // ================================================================ HARBOR (inland plot): the ferryman's landing
  def('harbor', ([x, y, w, d], L, band, p) => {
    if (X && X.coastal) return undefined;   // inland design: on a coast cityview's stock piers stand until a coastal harbor is drawn
    const { c, P } = A, cx = x + w / 2, cy = y + d / 2;
    const [ex, ey, rx, ry] = A.ell(cx, cy + 0.2, 0, Math.min(w, d) * 0.38);
    c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, TAU); c.fillStyle = X.night ? '#0a1a14' : (X.season === 3 ? '#c8d0d4' : '#24343a'); c.fill();
    A.rec('lights', { x: ex, y: ey, r: rx, col: 'witch' });
    A.box(x + 0.25, cy - 0.1, w * 0.4, 0.2, 0, 3, p.wood);
    // a black ferry with a hooded ferryman and a lantern
    const [fx, fy] = P(cx + 0.1, cy + 0.35, 0); A.poly([[fx - 10, fy - 3], [fx + 10, fy - 3], [fx + 7, fy + 1], [fx - 7, fy + 1]], '#1a1a20');
    A.poly([[fx - 1.5, fy - 3], [fx + 1.5, fy - 3], [fx + 0.6, fy - 11], [fx - 0.6, fy - 11]], '#2a2a34'); A.line([fx + 2, fy - 2], [fx + 6, fy - 16], '#5a4a3a', 0.8); A.lantern(fx - 7, fy - 7, 1.2);
    return house(x + w - 0.8, y + 0.15, 0.6, 0.55, 12, band, { axis: 'x', lean: 2 });
  });

  // ================================================================ OSSUARY: the bone-mill and skull tower
  def('ossuary', ([x, y, w, d], L, band, p) => {
    let top = 0;
    // the ossuary tower stacked with skulls, rising with the level (back right)
    if (band >= 1) {
      const tx = x + 1.25, ty = y + 0.1, ts = 0.5, th = 18 + band * 10 + L;
      const b = A.box(tx, ty, ts, ts, 0, th, p.e >= 3 ? '#3a3a44' : p.stone2); A.courses(b, 4, A.shade(p.stone2, -0.2));
      for (let v = 4; v < th - 4; v += 4.5) { skullRow(b, 'L', v, 3, 0.48); skullRow(b, 'R', v, 3, 0.48); }
      const zt = A.cone(tx + ts / 2, ty + ts / 2, ts * 0.62, th, 12 + band * 4, p.roof);
      const [fx, fy] = A.P(tx + ts / 2, ty + ts / 2, zt); A.skull(fx, fy - 2, 0.9); greenFlame(fx, fy - 4, 0.9 + band * 0.15);
      top = zt + 10;
      if (band >= 3) ravensCircle(tx, ty, zt, 4, 20);
    }
    // the bone-vaulted crypt (bone mill)
    const bx = x + 0.2, by = y + 0.55, bw = 0.95 + band * 0.08, bd = 0.85, h = 8 + band * 2;
    A.box(bx - 0.06, by - 0.06, bw + 0.12, bd + 0.12, 0, 2.5, A.shade(p.stone, -0.25));
    const b = A.box(bx, by, bw, bd, 2.5, h, p.stone); A.courses(b, 3.5, A.shade(p.stone, -0.2));
    for (let r = 0; r < 2; r++) skullRow(b, 'L', 3 + r * 4, 4, 0.5);
    const v = boneVault(bx, by, bw, bd, 2.5 + h, '#3e3e48');
    const [dx, dy] = A.P(bx + bw, by + bd / 2, 2.5);
    A.lamp([[dx - 2.5, dy + 1.2], [dx + 2.5, dy - 1.2], [dx + 2.5, dy - 8], [dx, dy - 11], [dx - 2.5, dy - 7.8]], '#3a7a4a', '#a8ffc0');
    A.rec('lights', { x: dx, y: dy - 5, r: 30, col: 'witch' }); A.rec('sparks', { x: dx, y: dy - 5, kind: 'witch' });
    top = Math.max(top, v.top + 6);
    // a grinding stone (the mill) from band 2: a great bone wheel
    if (band >= 2) { const [wx, wy] = A.P(x + 0.35, y + 1.65, 9); A.circ(wx, wy, 8, '#5a5a62', A.OUT); A.circ(wx, wy, 6, null, BONE); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; A.line([wx, wy], [wx + Math.cos(a) * 6, wy + Math.sin(a) * 6], BONE, 1.1); } A.circ(wx, wy, 1.6, IRON); }
    // urns, tombs and bone heaps
    for (const [gx, gy] of [[x + 1.0, y + 1.7], [x + 1.4, y + 1.55], [x + 1.75, y + 1.35]].slice(0, 1 + Math.min(2, band))) A.tomb(gx, gy, 0.75);
    const [hx, hy] = A.P(x + 1.25, y + 1.2); for (let k = 0; k < 3 + band; k++) A.skull(hx + (k % 3) * 3 - 3, hy - Math.floor(k / 3) * 2.5, 0.55);
    if (p.e >= 2) wisp(bx + bw / 2, by + bd / 2, v.top + 6);
    fog(x + 0.9, y + 1.6, 0.6);
    return top;
  });

  // generic spare-plot buildings keep the stock hall; walls keep the stock iron fence / stone curtain
})();
