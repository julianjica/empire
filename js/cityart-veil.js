// Building art for the veil — see the CITYART contract in js/cityart.js
//  The Veilborn court: halls of moonlit glass and pale woven boughs, slender spires
//  hovering a hand's breadth above their plinths, briar arches, mirror pools full of
//  stars, dreamsilk threads and lantern-moths. Colours drift lilac → teal → silver
//  through the eras; masonry/architecture turn woven walls into pale moonstone.
'use strict';
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.veil) return;
  const TAU = Math.PI * 2;
  let A = null, c = null, X = null, E = null, era = 0;

  // ---------------------------------------------------------------
  // palette per era: lilac (Founding) → periwinkle (Kingdom) → teal (Empire) → silver (Legend)
  // ---------------------------------------------------------------
  const ERA = [
    { roof: '#9a82d4', roof2: '#7a66b8', wood: '#e8dfcc', wood2: '#c4b598', stone: '#d6cfe0', glass: '#4e4280', ng: '#dccbff', accent: '#c9a6f2', leaf: ['#7f6db8', '#9d8dd2', '#d4c8f0'], silk: '#f4eeff', metal: '#b8aed0', bloom: '#e8a8d8' },
    { roof: '#8790dc', roof2: '#6670c0', wood: '#ebe4d6', wood2: '#c8bca6', stone: '#d8d6e6', glass: '#46508a', ng: '#d6dcff', accent: '#a8c0f4', leaf: ['#6f7cbc', '#8f9ed8', '#d0d8f4'], silk: '#eef2ff', metal: '#bcc0da', bloom: '#c8b0f0' },
    { roof: '#58a8be', roof2: '#3e8aa0', wood: '#eceee8', wood2: '#b8c4c0', stone: '#d2e0e6', glass: '#2f5e7c', ng: '#bff4ff', accent: '#86e0e4', leaf: ['#4f8e98', '#6fb4bc', '#c8ecee'], silk: '#eafcff', metal: '#c4d6dc', bloom: '#9ae8e0' },
    { roof: '#a4b2e2', roof2: '#7c8cc8', wood: '#f0eef8', wood2: '#b8b8d4', stone: '#dcdcf0', glass: '#323a78', ng: '#f2f4ff', accent: '#d8e4ff', leaf: ['#8a94c8', '#b0bae0', '#eef2fa'], silk: '#ffffff', metal: '#e6e8f4', bloom: '#f0d8ff' },
  ];
  const GOLD = '#e2c874';

  // ---------------------------------------------------------------
  // small helpers (bound to the api of the current call)
  // ---------------------------------------------------------------
  const P = (gx, gy, z = 0) => A.P(gx, gy, z);
  const sn = col => A.SNOW ? A.mix(col, '#f3f6f9', 0.72) : col;
  const T = id => { try { return !!X.tech(id); } catch (e) { return false; } };
  const stoneWalls = () => T('masonry') || T('architecture') || era >= 2;
  const light = (x, y, r) => A.rec('lights', { x, y, r, col: 'fey' });
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // raw strokes that respect the night pass
  function stroke(col, lw, nightCol) { c.strokeStyle = A.GLOW ? (nightCol || A.F(col)) : col; c.lineWidth = lw; c.stroke(); }
  function fill(col, nightCol) { c.fillStyle = A.GLOW ? (nightCol || A.F(col)) : col; c.fill(); }
  // a soft second outline offset up-right: the glamour shimmer (day pass only)
  function ghost(pts, col = 'rgba(170,236,255,0.55)') {
    if (A.GLOW) return;
    c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(p[0] + 1.6, p[1] - 1.1) : c.moveTo(p[0] + 1.6, p[1] - 1.1));
    c.strokeStyle = col; c.lineWidth = 0.7; c.stroke();
  }

  // woven-bough lattice over the visible faces of a box
  function weave(b, col) {
    for (const side of ['L', 'R']) {
      const f = side === 'L' ? A.onL : A.onR, Lf = side === 'L' ? b.w : b.d, n = Math.max(2, Math.round(Lf / 0.22));
      for (let k = 0; k <= n; k++) {
        const u0 = Lf * k / n, u1 = Math.min(Lf, u0 + Lf / n * 1.6), u2 = Math.max(0, u0 - Lf / n * 1.6);
        A.line(f(b, u0, u0, 0, 0)[0], f(b, u1, u1, b.h, b.h)[0], col, 0.5);
        A.line(f(b, u0, u0, 0, 0)[0], f(b, u2, u2, b.h, b.h)[0], col, 0.5);
      }
      A.line(f(b, 0, 0, b.h - 0.8, 0)[0], f(b, Lf, Lf, b.h - 0.8, 0)[0], A.shade(col, -0.15), 1.1);
    }
  }
  // a wall block: woven boughs early, pale moonstone once masonry is known
  function wallBox(x, y, w, d, z, h, o = {}) {
    if (o.stone || stoneWalls()) {
      const b = A.box(x, y, w, d, z, h, o.col || E.stone);
      A.courses(b, 4, A.shade(o.col || E.stone, -0.12));
      return b;
    }
    const b = A.box(x, y, w, d, z, h, o.col || E.wood);
    weave(b, E.wood2);
    return b;
  }
  // tall arched (pointed) glass window on a box face
  function archWin(b, side, u, v, ww = 0.16, wh = 7) {
    const f = side === 'L' ? A.onL : A.onR;
    const q = f(b, u - ww / 2, u + ww / 2, v, v + wh), qf = f(b, u - ww / 2 - 0.035, u + ww / 2 + 0.035, v - 0.8, v + wh + 0.4);
    const m = lerp(q[3], q[2], 0.5), mf = lerp(qf[3], qf[2], 0.5);
    A.poly([qf[0], qf[1], qf[2], [mf[0], mf[1] - wh * 0.42 - 1], qf[3]], A.mix(E.wood, '#ffffff', 0.4), null);
    A.lamp([q[0], q[1], q[2], [m[0], m[1] - wh * 0.4], q[3]], side === 'L' ? E.glass : A.shade(E.glass, -0.15), E.ng);
    if (!A.GLOW) A.line(lerp(q[0], q[3], 0.15), lerp(q[0], q[3], 0.85), 'rgba(255,255,255,0.35)', 0.6);
  }
  function archRow(b, side, v, wh, gap = 0.34, ww = 0.14) {
    const Lf = side === 'L' ? b.w : b.d, n = Math.max(1, Math.floor(Lf / gap));
    for (let i = 0; i < n; i++) archWin(b, side, Lf * (i + 0.5) / n, v, ww, wh);
  }
  // ogee (onion-pointed) roof, the Veilborn signature
  function ogee(cx, cy, r, z, h, col, ribs = true) {
    col = sn(col);
    const [x, y, rx, ry] = A.ell(cx, cy, z, r);
    c.beginPath(); c.moveTo(x - rx, y);
    c.bezierCurveTo(x - rx * 1.22, y - h * 0.42, x - rx * 0.08, y - h * 0.58, x, y - h);
    c.bezierCurveTo(x + rx * 0.08, y - h * 0.58, x + rx * 1.22, y - h * 0.42, x + rx, y);
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.closePath();
    A.gradFill(x - rx, x + rx, col);
    if (ribs && !A.SNOW) for (const f of [-0.5, 0, 0.5]) {
      c.beginPath(); c.moveTo(x + rx * f, y + ry * Math.sqrt(1 - f * f));
      c.bezierCurveTo(x + rx * f * 1.25, y - h * 0.4, x + rx * f * 0.1, y - h * 0.6, x, y - h);
      stroke(A.shade(col, -0.28), 0.6);
    }
    ghost([[x - rx, y], [x - rx * 0.9, y - h * 0.38], [x, y - h], [x + rx * 0.9, y - h * 0.38], [x + rx, y]]);
    return z + h;
  }
  // a crescent moon (horns to the right); glows in the night pass
  function crescent(x, y, r, day = GOLD, night = '#fff6d8') {
    c.beginPath(); c.arc(x, y, r, -Math.PI / 2, Math.PI / 2, true);
    c.arc(x + r * 0.5, y, r * 1.118, 2.034, 4.249, false); c.closePath();
    c.fillStyle = A.GLOW ? night : day; c.fill();
    if (!A.GLOW) { c.strokeStyle = 'rgba(90,70,30,0.5)'; c.lineWidth = 0.5; c.stroke(); }
  }
  function moonFinial(cx, cy, z, h = 6, r = 2.6) {
    const a = P(cx, cy, z), t = P(cx, cy, z + h);
    A.line(a, t, era >= 3 ? GOLD : E.metal, 1.1);
    crescent(t[0], t[1] - r, r);
    return z + h + r * 2;
  }
  // a glowing hover-gap between plinth and body: halo + rising motes
  function hover(cx, cy, r, z, gap, n = 4) {
    const [x, y, rx, ry] = A.ell(cx, cy, z, r);
    c.beginPath(); c.ellipse(x, y - gap * 0.4, rx * 1.05, ry * 1.05 + gap * 0.3, 0, 0, TAU);
    if (A.GLOW) { c.fillStyle = 'rgba(150,120,230,0.55)'; c.fill(); }
    else { c.fillStyle = 'rgba(205,190,255,0.35)'; c.fill(); }
    A.rec('sparks', { x, y: y - gap * 0.3, kind: 'motes', r: rx * 1.1, n, h: gap * 2 + 8 });
  }
  // a slender spire floating above its moonstone plinth
  function spire(cx, cy, r, h, o = {}) {
    const z0 = o.z || 0, gap = o.gap == null ? 4 : o.gap;
    A.cyl(cx, cy, r * 1.35, z0, 3, E.stone, A.shade(E.stone, 0.06));
    for (const a of [0.6, 2.2, 3.8, 5.3]) { const [px, py] = P(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15, z0 + 3); A.lampDot(px, py, 0.7, E.accent, E.ng); }
    hover(cx, cy, r * 0.9, z0 + 3, gap, o.motes || 4);
    const zb = z0 + 3 + gap;
    // tapering body: a short point under the body hangs into the gap
    const [bx, by, brx] = A.ell(cx, cy, zb, r);
    A.poly([[bx - brx, by], [bx, by + gap * 0.7], [bx + brx, by]], A.shade(o.col || E.wood, -0.1));
    const bh = h * 0.62;
    A.cyl(cx, cy, r, zb, bh, o.col || E.wood, A.shade(o.col || E.wood, 0.05));
    if (o.twist !== false) A.twistLines(cx, cy, zb, zb + bh, r, A.shade(o.col || E.wood, -0.3), 1.6, 0.05, o.ph || 0);
    for (let v = 8; v < bh - 4; v += 11) { const [wx, wy] = P(cx + r * 0.6, cy + r * 0.6, zb + v); A.lamp([[wx - 1.2, wy], [wx + 1.2, wy], [wx + 1.2, wy - 3.5], [wx, wy - 5], [wx - 1.2, wy - 3.5]], E.glass, E.ng); }
    A.cyl(cx, cy, r * 1.25, zb + bh, 1.6, era >= 3 ? GOLD : E.metal);
    const zt = A.cone(cx, cy, r * 1.1, zb + bh + 1.6, h * 0.38, o.roof || E.roof);
    const [tx, ty, trx] = A.ell(cx, cy, zb + bh + 1.6, r * 1.1);
    ghost([[tx - trx, ty], [tx, ty - h * 0.38], [tx + trx, ty]]);
    return o.finial === false ? zt : moonFinial(cx, cy, zt, 4, 2 + r * 4);
  }
  // still mirror-pool full of stars
  function pool(cx, cy, rx, ry, o = {}) {
    const [x, y] = P(cx, cy), RX = rx * A.SQ2 * A.HW, RY = ry * A.SQ2 * A.HH;
    c.beginPath(); c.ellipse(x, y, RX + 2, RY + 1.4, 0, 0, TAU); fill(sn(E.stone)); stroke(A.OUT, 0.7, A.F(A.OUT));
    c.beginPath(); c.ellipse(x, y + 0.4, RX, RY, 0, 0, TAU);
    if (A.GLOW) { c.fillStyle = '#2a2a66'; c.fill(); }
    else if (A.SNOW) { c.fillStyle = '#dce6f2'; c.fill(); }
    else { const g = c.createLinearGradient(x - RX, y, x + RX, y); g.addColorStop(0, '#9fb0e0'); g.addColorStop(0.5, '#c8d4f4'); g.addColorStop(1, '#7a88c8'); c.fillStyle = g; c.fill(); }
    if (!A.GLOW && !A.SNOW) { c.beginPath(); c.ellipse(x - RX * 0.25, y - RY * 0.15, RX * 0.45, RY * 0.25, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill(); }
    const n = o.stars || 4;
    for (let k = 0; k < n; k++) { const a = k * 2.39 + 0.5, f = 0.25 + 0.6 * ((k * 37) % 10) / 10; A.lampDot(x + Math.cos(a) * RX * f, y + Math.sin(a) * RY * f, 0.8, '#ffffff', '#ffffff'); }
    if (o.moon !== false) crescent(x + RX * 0.25, y - RY * 0.05, Math.min(3, RY * 0.6), '#f4f0ff', '#fffbe8');
    A.rec('sparks', { x, y, kind: 'star' });
    return [x, y, RX, RY];
  }
  // a thorned briar arch between two ground points
  function briar(g0, g1, h, o = {}) {
    const a = P(g0[0], g0[1]), b = P(g1[0], g1[1]), m = lerp(a, b, 0.5);
    const top = [m[0], m[1] - h], col = A.SNOW ? '#6a7268' : '#4a5446';
    c.beginPath(); c.moveTo(a[0], a[1]); c.bezierCurveTo(a[0] - 2, a[1] - h * 0.7, top[0] - 4, top[1] - 2, top[0], top[1]);
    c.bezierCurveTo(top[0] + 4, top[1] - 2, b[0] + 2, b[1] - h * 0.7, b[0], b[1]);
    stroke(col, o.lw || 3.2); stroke(A.shade(col, 0.3), 0.9);
    // thorns and blossoms
    for (let k = 1; k < 10; k++) {
      const t = k / 10, p = t < 0.5 ? lerp(a, top, t * 2) : lerp(top, b, (t - 0.5) * 2);
      const bow = Math.sin(t * Math.PI) * 3, px = p[0] + (t < 0.5 ? -bow : bow) * 0.6, py = p[1];
      A.line([px, py], [px + (k % 2 ? 2.2 : -2.2), py - 1.6], col, 0.6);
      if (k % 3 === 1) A.lampDot(px, py - 0.5, 1.3, A.SNOW ? '#f2f6f8' : E.bloom, '#ffd8f6');
    }
    if (o.moon) crescent(top[0] - 1, top[1] - 5, 2.6);
    return top;
  }
  // a dreamsilk thread (sagging curve), bright at night
  function thread(a, b, sag = 4, col) {
    const m = lerp(a, b, 0.5);
    c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(m[0], m[1] + sag, b[0], b[1]);
    c.strokeStyle = A.GLOW ? '#c8b8ff' : (col || 'rgba(250,244,255,0.9)'); c.lineWidth = 0.6; c.stroke();
  }
  // a resting lantern-moth (wings + glowing body)
  function moth(x, y, s = 1) {
    c.beginPath(); c.ellipse(x - 2 * s, y - 0.6 * s, 2.2 * s, 1.4 * s, -0.5, 0, TAU); c.ellipse(x + 2 * s, y - 0.6 * s, 2.2 * s, 1.4 * s, 0.5, 0, TAU);
    c.fillStyle = A.GLOW ? '#8a70d0' : 'rgba(246,238,255,0.92)'; c.fill();
    if (!A.GLOW) { c.strokeStyle = 'rgba(90,70,130,0.6)'; c.lineWidth = 0.5; c.stroke(); }
    A.lampDot(x, y, 0.9 * s, '#e8d070', '#fff2b0');
  }
  const flyMoth = (gx, gy, z) => { const [x, y] = P(gx, gy, z); A.rec('sparks', { x, y, kind: 'fey', seed: A.R() }); };
  // a hanging moth-lantern on a crook post
  function mothPost(gx, gy, h = 13) {
    const [x, y] = P(gx, gy), post = '#5e4e74', lx = x + 4.5, ly = y - h + 2.5;
    // a dark twisted post on a pale footing stone, its crook ending in a little caged moth-lantern
    c.beginPath(); c.ellipse(x, y, 2.4, 1.1, 0, 0, TAU); fill(sn(E.stone)); stroke(A.OUT, 0.5, A.F(A.OUT));
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.quadraticCurveTo(x, y - h - 4, lx, y - h - 3); stroke(A.OUT, 2.6, A.F(A.OUT)); stroke(post, 1.5);
    if (!A.GLOW) for (let k = 3; k < h - 2; k += 4) A.line([x - 0.7, y - k], [x + 0.7, y - k - 1.6], A.shade(post, 0.3), 0.5);
    A.line([lx, y - h - 3], [lx, ly - 3], E.metal, 0.6);
    if (A.GLOW) { c.beginPath(); c.arc(lx, ly, 5, 0, TAU); c.fillStyle = 'rgba(255,240,200,0.28)'; c.fill(); }
    c.beginPath(); c.moveTo(lx, ly - 3.6); c.lineTo(lx + 2.2, ly - 1.4); c.lineTo(lx + 1.6, ly + 2.4); c.lineTo(lx - 1.6, ly + 2.4); c.lineTo(lx - 2.2, ly - 1.4); c.closePath();
    fill(A.mix(E.glass, '#ffffff', 0.15), '#fff0c8'); stroke('#3e3450', 0.7, A.F('#3e3450'));
    A.lampDot(lx, ly + 0.2, 1.6, '#f6dc8a', '#fff6d0');
    A.poly([[lx - 2.8, ly - 1.6], [lx, ly - 4.6], [lx + 2.8, ly - 1.6]], sn(E.roof), A.OUT, 0.4);
    moth(x + 1.2, y - h - 3.4, 0.55);
    light(lx, ly, 20);
    return [lx, ly];
  }
  // pale silver-barked tree with a lilac/teal crown
  function paleTree(gx, gy, s = 1) {
    const [x, y] = P(gx, gy);
    c.beginPath(); c.moveTo(x - 1.6 * s, y); c.quadraticCurveTo(x - 0.4 * s, y - 9 * s, x - 1.2 * s, y - 16 * s); c.lineTo(x + 1.2 * s, y - 16 * s); c.quadraticCurveTo(x + 0.6 * s, y - 9 * s, x + 1.6 * s, y); c.closePath();
    fill('#e6e2ea'); stroke(A.OUT, 0.6, A.F(A.OUT));
    if (!A.GLOW) for (let k = 3; k < 15; k += 4) A.line([x - 1 * s, y - k * s], [x + 0.4 * s, y - k * s - 0.6], '#7a7480', 0.6);
    if (A.SEASON === 3 && A.SNOW) { A.line([x, y - 14 * s], [x - 6 * s, y - 20 * s], '#d8d4dc', 1); A.line([x, y - 15 * s], [x + 5 * s, y - 22 * s], '#d8d4dc', 1); return; }
    const cols = A.SEASON === 2 ? ['#a8884a', '#d4b46a', '#f4e4b0'] : E.leaf;
    A.blobs(x, y - 19 * s, 7 * s, cols, A.SEASON === 0);
  }
  function tinyShroom(gx, gy, s = 0.5) { A.mushroom(gx, gy, s, era >= 2 ? '#7ab8c8' : '#b878c8'); }
  // round woven drum with arched glass, the base of bowers and halls
  function drum(cx, cy, r, z, h, col) {
    A.cyl(cx, cy, r, z, h, col || (stoneWalls() ? E.stone : E.wood), A.shade(col || E.wood, 0.06));
    const [bx, by, rx, ry] = A.ell(cx, cy, z, r);
    if (!stoneWalls() && !col) for (let k = -3; k <= 3; k++) { const f = k / 3.6, yb = by + Math.sqrt(1 - f * f) * ry; A.line([bx + rx * f, yb], [bx + rx * Math.min(0.96, f + 0.22), yb - h], E.wood2, 0.6); A.line([bx + rx * f, yb], [bx + rx * Math.max(-0.96, f - 0.22), yb - h], E.wood2, 0.6); }
    return [bx, by, rx, ry];
  }
  function drumWins(cx, cy, r, z, h, fs = [-0.55, 0.1, 0.62], wh = 6) {
    const [bx, by, rx, ry] = A.ell(cx, cy, z, r);
    for (const f of fs) {
      const xw = bx + rx * f, yb = by + Math.sqrt(1 - f * f) * ry - h * 0.3, hw = Math.max(1, rx * 0.14);
      A.poly([[xw - hw - 0.8, yb + 0.8], [xw + hw + 0.8, yb + 0.8], [xw + hw + 0.8, yb - wh], [xw, yb - wh - hw * 1.6 - 1], [xw - hw - 0.8, yb - wh]], A.mix(E.wood, '#ffffff', 0.4), null);
      A.lamp([[xw - hw, yb], [xw + hw, yb], [xw + hw, yb - wh], [xw, yb - wh - hw * 1.6], [xw - hw, yb - wh]], E.glass, E.ng);
    }
  }
  function drumDoor(cx, cy, r, z, dh = 8, f = 0.05) {
    const [bx, by, rx, ry] = A.ell(cx, cy, z, r), xw = bx + rx * f, yb = by + ry * Math.sqrt(1 - f * f);
    A.poly([[xw - 2.6, yb], [xw + 2.6, yb], [xw + 2.6, yb - dh * 0.7], [xw, yb - dh], [xw - 2.6, yb - dh * 0.7]], A.mix(E.wood, '#fff', 0.3), null);
    A.poly([[xw - 1.8, yb], [xw + 1.8, yb], [xw + 1.8, yb - dh * 0.66], [xw, yb - dh + 1], [xw - 1.8, yb - dh * 0.66]], '#4a3a6a', null);
    return [xw, yb];
  }
  // a hall: walls + steep gable with a thorned crest; returns top z
  function glassHall(x, y, w, d, h, o = {}) {
    const b = wallBox(x, y, w, d, o.z || 0, h, o);
    const ax = o.axis || (w >= d ? 'x' : 'y');
    archRow(b, 'L', h * 0.22, h * 0.55, o.gap || 0.34);
    archRow(b, 'R', h * 0.22, h * 0.55, o.gap || 0.34);
    const span = ax === 'x' ? d : w, rh = span * (o.steep || 17);
    const zt = vault(b, rh, o.roof || E.roof, ax);
    return { b, zt, ax, rh };
  }
  // the Veilborn roof: a pointed, gently swelling vault with a rose window in its end
  // and a thorned crest — ridge along axis 'x' or 'y'
  function vault(b, rh, col, axis, o = {}) {
    col = sn(col);
    const zb = b.z + b.h, ov = 0.1, eo = 0.05, NS = 7;
    const ax = axis === 'x';
    const half = (ax ? b.d : b.w) / 2 + ov, mid = ax ? b.y + b.d / 2 : b.x + b.w / 2;
    const a0 = (ax ? b.x : b.y) - eo, a1 = (ax ? b.x + b.w : b.y + b.d) + eo;
    const pt = (al, off, z) => ax ? P(al, mid + off, z) : P(mid + off, al, z);
    const prof = [];
    prof.push([half + 0.04, zb - 1.6]);   // a little upswept flare at the eave
    for (let k = 0; k <= NS; k++) { const s = k / NS; prof.push([half * (1 - s), zb + rh * Math.sin(s * Math.PI * 0.42) / Math.sin(Math.PI * 0.42)]); }
    // back slope (seen only past the ridge)
    const back = prof.map(([o2, z]) => pt(a0, -o2, z)).concat(prof.slice().reverse().map(([o2, z]) => pt(a1, -o2, z)));
    A.poly(back, A.shade(col, -0.3));
    // end cap (gable wall) at the far end of the axis
    const capCol = A.shade(b.col || E.wood, ax ? -0.18 : 0);
    const cap = prof.slice(1).map(([o2, z]) => pt(a1 - eo, o2, z)).concat(prof.slice(1).reverse().map(([o2, z]) => pt(a1 - eo, -o2, z)));
    A.poly(cap, capCol);
    // rose window in the cap
    const rz = zb + rh * 0.34, rp = pt(a1 - eo, 0, rz), rr = Math.max(1.6, Math.min(rh * 0.22, half * 5));
    A.circ(rp[0], rp[1], rr + 1, A.mix(E.wood, '#ffffff', 0.5), A.OUT);
    A.lampDot(rp[0], rp[1], rr, E.glass, E.ng);
    if (!A.GLOW) for (let q = 0; q < 3; q++) { const an = q / 3 * Math.PI; A.line([rp[0] + Math.cos(an) * rr, rp[1] + Math.sin(an) * rr], [rp[0] - Math.cos(an) * rr, rp[1] - Math.sin(an) * rr], 'rgba(255,255,255,0.45)', 0.5); }
    // front slope in strips: steep lower strips darker, the crown lighter
    const fcol = ax ? col : A.shade(col, -0.14);
    for (let k = 0; k < prof.length - 1; k++) {
      const [o0, z0] = prof[k], [o1, z1] = prof[k + 1];
      const t = k / (prof.length - 1);
      A.poly([pt(a0, o0, z0), pt(a1, o0, z0), pt(a1, o1, z1), pt(a0, o1, z1)], A.shade(fcol, -0.12 + t * 0.22), null);
    }
    const front = prof.map(([o2, z]) => pt(a1, o2, z)).concat(prof.slice().reverse().map(([o2, z]) => pt(a0, o2, z)));
    A.poly(front, null, A.OUT, 0.8);
    // slender ribs over the front slope
    if (!A.SNOW) { const L = a1 - a0, n = Math.max(2, Math.round(L / 0.32)); for (let q = 1; q < n; q++) { const al = a0 + L * q / n; c.beginPath(); prof.forEach(([o2, z], k) => { const p = pt(al, o2, z); k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); }); stroke(A.shade(fcol, -0.3), 0.5); } }
    const zt = zb + rh;
    A.line(pt(a0, 0, zt), pt(a1, 0, zt), era >= 3 ? GOLD : E.metal, 1.4);
    // thorned crest
    if (!A.SNOW) { const L = a1 - a0, n = Math.max(3, Math.round(L / 0.16)); for (let q = 1; q < n; q++) { const p = pt(a0 + L * q / n, 0, zt); A.line(p, [p[0] + 0.6, p[1] - (q % 2 ? 3.4 : 2)], era >= 3 ? GOLD : E.metal, 0.8); } }
    ghost([pt(a0, half, zb), pt(a0, 0, zt), pt(a1, 0, zt), pt(a1, half, zb)]);
    return zt;
  }

  // ---------------------------------------------------------------
  // buildings
  // ---------------------------------------------------------------
  const ART = {};
  const lo = band => [1, 5, 10, 15][band];

  // ----- the Moonlit Court (town hall) -----
  ART.townhall = ([x, y, w, d], L, band) => {
    const k = L - lo(band), cx = x + w * 0.47, cy = y + d * 0.45;
    let top = 0;
    if (band === 0) { // a ring-bower: woven drum under a glass ogee lantern, two small bowers, a briar gate
      A.cyl(cx, cy, 0.95, 0, 2.5, E.stone, A.shade(E.stone, 0.06));
      bower(x + 0.45, y + 0.5, 0.32, 9);
      bower(x + 2.25, y + 0.55, 0.3, 8);
      const H = 13 + k * 1.5;
      drum(cx, cy, 0.62, 2.5, H);
      drumWins(cx, cy, 0.62, 2.5, H, [-0.62, -0.2, 0.25, 0.68], 6);
      drumDoor(cx, cy, 0.62, 2.5, 9, 0.02);
      A.cyl(cx, cy, 0.72, 2.5 + H, 1.6, E.wood2);
      top = ogee(cx, cy, 0.72, 4.1 + H, 22 + k, E.roof);
      const [tx, ty] = P(cx, cy, top + 6); crescent(tx, ty, 3.4); light(tx, ty, 26); A.rec('sparks', { x: tx, y: ty, kind: 'moon' });
      // a fey ring of bough posts strung with glowing silk garlands round the dais (front half)
      const ring = [];
      for (let j = 0; j < 7; j++) { const a = -0.2 + j / 6 * Math.PI * 0.95; ring.push(P(cx + Math.cos(a) * 1.05, cy + Math.sin(a) * 1.05)); }
      ring.forEach(([px, py], j) => { if (j === 3) return; A.line([px, py], [px, py - 13], A.OUT, 2.4); A.line([px, py], [px, py - 13], '#5e4e74', 1.4); A.circ(px, py - 14.5, 2.2, A.mix(E.glass, '#ffffff', 0.15), A.OUT); A.lampDot(px, py - 14.5, 1.5, '#f6dc8a', '#fff6d0'); light(px, py - 14.5, 12); });
      for (let j = 0; j < ring.length - 1; j++) if (j !== 2 && j !== 3) thread([ring[j][0], ring[j][1] - 12], [ring[j + 1][0], ring[j + 1][1] - 12], 4);
      briar([x + 1.75, y + 2.35], [x + 2.35, y + 1.75], 16 + k, {});
      mothPost(x + 0.5, y + 2.0); flyMoth(x + 1.0, y + 2.2, 20);
      return top + 10;
    }
    // back spires first
    const sh = 34 + band * 10 + k * 2;
    if (band >= 3) top = spire(x + 0.42, y + 0.42, 0.17, sh + 14, { gap: 8, motes: 6 });
    if (band >= 2) top = Math.max(top, spire(x + 0.35, y + 1.95, 0.15, sh, { gap: 6, ph: 1 }));
    top = Math.max(top, spire(x + 2.4, y + 0.4, 0.16, sh + (band >= 2 ? 6 : 0), { gap: 6, ph: 2 }));
    if (band === 1) {
      const hw = 1.8, hd = 1.35;
      const g = glassHall(x + 0.45, y + 0.6, hw, hd, 14 + k, { axis: 'x' });
      archWin(g.b, 'L', hw / 2, 0, 0.3, 10);
      const lz = g.zt - 6;
      drum(x + 0.45 + hw / 2, y + 0.6 + hd / 2, 0.24, lz, 7, E.wood);
      drumWins(x + 0.45 + hw / 2, y + 0.6 + hd / 2, 0.24, lz, 7, [-0.3, 0.35], 4);
      top = Math.max(top, ogee(x + 0.45 + hw / 2, y + 0.6 + hd / 2, 0.3, lz + 7, 14, E.roof));
      briar([x + 1.0, y + 2.45], [x + 1.75, y + 2.45], 18 + k, { moon: true });
      mothPost(x + 2.5, y + 2.1);
      return top + 6;
    }
    // band 2+: a great glass hall with a domed drum; mirror pool before it
    if (band >= 3) { const wg = glassHall(x + 0.15, y + 0.72, 0.5, 0.8, 13 + k, { axis: 'y', steep: 18, gap: 0.3 }); void wg; }
    const hx = x + 0.75, hy = y + 0.7, hw = 1.65, hd = 1.4;
    const g = glassHall(hx, hy, hw, hd, 18 + k, { axis: 'x', steep: 14 });
    archWin(g.b, 'L', hw / 2, 0, 0.32, 12);
    const dr = band >= 3 ? 0.48 : 0.38, dz = g.zt - 8, dh = band >= 3 ? 12 : 8;
    drum(hx + hw / 2, hy + hd / 2, dr, dz, dh, stoneWalls() ? E.stone : E.wood);
    drumWins(hx + hw / 2, hy + hd / 2, dr, dz, dh, [-0.6, -0.2, 0.2, 0.6], dh * 0.55);
    A.cyl(hx + hw / 2, hy + hd / 2, dr * 1.12, dz + dh, 1.6, era >= 3 ? GOLD : E.metal);
    top = Math.max(top, ogee(hx + hw / 2, hy + hd / 2, dr * 1.12, dz + dh + 1.6, 22 + band * 4 + k, E.roof));
    const [tx, ty] = P(hx + hw / 2, hy + hd / 2, top + 8); crescent(tx, ty, 3.8); light(tx, ty, 34); A.rec('sparks', { x: tx, y: ty, kind: 'moon' });
    top += 12;
    if (band >= 3) { // glamour web between the spire tips
      const tips = [P(x + 0.42, y + 0.42, sh + 14 + 9), P(x + 0.35, y + 1.95, sh + 9), P(x + 2.4, y + 0.4, sh + 6 + 9)];
      thread(tips[0], tips[1], 6); thread(tips[0], tips[2], 6); thread(tips[1], [tx, ty + 6], 8); thread(tips[2], [tx, ty + 6], 8);
      for (const tp of tips) A.rec('sparks', { x: tp[0], y: tp[1], kind: 'star' });
    }
    pool(x + 0.55, y + 2.3, 0.38, 0.3, { stars: 3 + band });
    briar([x + 2.1, y + 2.6], [x + 2.6, y + 2.1], 18 + k, { moon: true });
    flyMoth(x + 1.4, y + 2.4, 26); flyMoth(x + 2.2, y + 1.6, 34);
    return top;
  };
  // a little woven bower with a leaf-ogee roof (shared piece)
  function bower(cx, cy, r, h, roof) {
    drum(cx, cy, r, 0, h);
    drumDoor(cx, cy, r, 0, Math.min(7, h * 0.8), 0.1);
    return ogee(cx, cy, r * 1.2, h, h * 1.1 + 4, roof || (era >= 1 ? E.roof : E.leaf[1]));
  }

  // ----- cottages: three kinds of Veilborn home -----
  ART.cottage = ([x, y], L, band, ctx) => {
    const i = ctx.i || 0, v = i % 3, wet = !!ctx.wet, s = wet ? [0.95, 1.0, 1.0, 1.0][band] : [0.95, 1.05, 1.15, 1.2][band];   // wet: on a pile deck over the water — no garden shrooms
    const cx = x + s / 2, cy = y + s / 2;
    let top;
    if (v === 0) { // round woven bower
      const r = 0.3 + band * 0.03, h = 8 + band * 2.5;
      drum(cx, cy, r, 0, h);
      drumWins(cx, cy, r, 0, h, band >= 2 ? [-0.55, 0.6] : [0.6], 4);
      drumDoor(cx, cy, r, 0, 7, -0.05);
      if (band === 0) top = A.dome(cx, cy, r * 1.25, h, 10, E.leaf[1]);
      else { A.cyl(cx, cy, r * 1.15, h, 1.2, E.wood2); top = ogee(cx, cy, r * 1.2, h + 1.2, 13 + band * 2, E.roof); }
      if (band >= 3) { const t = P(cx, cy, top + 3); crescent(t[0], t[1], 2.2); top += 6; }
    } else if (v === 1) { // narrow glass cottage with a steep gable
      const hw = 0.72, hd = 0.62, h = 9 + band * 2;
      const g = glassHall(cx - hw / 2, cy - hd / 2, hw, hd, h, { axis: i % 2 ? 'x' : 'y', steep: 20, gap: 0.3 });
      A.door(g.b, 'L', hw * 0.5, 0.2, 6, '#4a3a6a');
      top = g.zt;
      if (band >= 3) { // a tiny pavilion floats over the ridge
        const pz = g.zt + 3;
        hover(cx, cy, 0.14, g.zt - 2, 4, 3);
        A.cyl(cx, cy, 0.13, pz, 5, E.wood); top = ogee(cx, cy, 0.17, pz + 5, 9, E.roof);
      } else if (band >= 2) { const t = P(cx, cy, g.zt); A.line(t, [t[0], t[1] - 5], E.metal, 0.9); crescent(t[0], t[1] - 7, 2); top += 8; }
    } else { // tall lantern-house
      const r = 0.22 + band * 0.02, h = 13 + band * 4;
      if (band >= 2) { // a second, smaller tower behind, tied by silk
        const r2 = r * 0.7, h2 = h * 0.75;
        drum(cx - 0.28, cy - 0.25, r2, 0, h2); drumWins(cx - 0.28, cy - 0.25, r2, 0, h2, [0.4], 4);
        const t2 = ogee(cx - 0.28, cy - 0.25, r2 * 1.25, h2, 10, E.roof);
        thread(P(cx - 0.28, cy - 0.25, t2 - 4), P(cx, cy, h + 6), 3);
      }
      drum(cx, cy, r, 0, h);
      drumWins(cx, cy, r, 0, h, [0.45], 4); drumWins(cx, cy, r, h * 0.45, h * 0.5, [-0.4, 0.45], 3.5);
      drumDoor(cx, cy, r, 0, 7, 0);
      A.cyl(cx, cy, r * 1.45, h * 0.55, 1, E.wood2); // balcony ring
      top = band === 0 ? A.dome(cx, cy, r * 1.3, h, 8, E.leaf[1]) : ogee(cx, cy, r * 1.3, h, 14 + band * 2, E.roof);
      if (band >= 1) { const [mx, my] = P(cx + r * 1.4, cy + r * 1.4, h * 0.55); moth(mx, my - 2, 0.8); }
    }
    if (band >= 1 && i % 2 === 0) mothPost(x + s * 0.95, y + s * 0.95, 10);
    if (i % 4 === 3 && !wet) tinyShroom(x + 0.08, y + s * 0.85, 0.45);
    flyMoth(cx, cy, top + 4);
    return top + 2;
  };

  // ----- moonpetal gardens (farm) -----
  function ringBed(cx, cy, r0, r1, a0, a1, z, col, dots, n = 14) {
    const pts = [];
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push(P(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, z)); }
    for (let k = n; k >= 0; k--) { const a = a0 + (a1 - a0) * k / n; pts.push(P(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, z)); }
    A.poly(pts, sn(col), 'rgba(60,50,40,0.4)', 0.6);
    if (A.SNOW) return;
    const rm = (r0 + r1) / 2, m = Math.max(3, Math.round((a1 - a0) * rm / 0.12));
    for (let k = 0; k <= m; k++) { const a = a0 + (a1 - a0) * k / m, [px, py] = P(cx + Math.cos(a) * rm, cy + Math.sin(a) * rm, z); A.lampDot(px, py - 1.5, 1.2, dots[k % dots.length], k % 2 ? '#f0e4ff' : '#c8f4ff'); }
  }
  ART.farm = ([x, y, w, d], L, band, ctx) => {
    const k = L - lo(band), cx = x + w * 0.5, cy = y + d * 0.48;
    const soil = A.mix(A.GROUND, '#6a5a48', 0.55);
    const dots = [['#d8c8f8', '#ffffff', '#b8a0ec'], ['#8ad0f0', '#c8f0ff', '#a8a0f0'], ['#e8b860', '#f0d890', '#c87a40'], ['#e0e8f0']][A.SEASON];
    const rings = 2 + Math.min(3, band + (k >= 3 ? 1 : 0));
    for (let r = rings - 1; r >= 0; r--) {
      const r0 = 0.25 + r * 0.22, r1 = r0 + 0.17;
      ringBed(cx, cy, r0, r1, -Math.PI * 0.95 + r * 0.25, Math.PI * 0.55 - r * 0.1, 0.8, soil, dots, 10 + r * 4);
    }
    if (T('irrigation')) for (const a of [-2.2, -0.6, 0.9]) { A.line(P(cx, cy, 1), P(cx + Math.cos(a) * 1.05, cy + Math.sin(a) * 1.05, 1), A.GLOW ? '#6070c0' : '#a8d4f0', 1.4); }
    // centre: a woven gardener's bower, later a dew-glass house, then a moondial
    if (band >= 2) {
      const gb = A.box(x + 0.15, y + 0.15, 0.62, 0.5, 0, 9, A.mix(E.glass, '#ffffff', 0.5), { stroke: 'rgba(60,60,100,0.6)' });
      for (const side of ['L', 'R']) { const Lf = side === 'L' ? 0.62 : 0.5; for (let u = 0.1; u < Lf; u += 0.15) A.lamp((side === 'L' ? A.onL : A.onR)(gb, u, u + 0.11, 1, 8), A.mix(E.glass, '#c8ecff', 0.55), E.ng); }
      A.gable(gb, 8, A.mix(E.glass, '#ffffff', 0.35), 'x', null, 0.04);
    }
    bower(cx, cy, 0.17 + band * 0.02, 7 + band, band >= 1 ? E.roof : E.leaf[1]);
    if (band >= 1) briar([x + w - 0.15, y + 1.35], [x + w - 0.15, y + 1.85], 15, {});
    if (band >= 3) { const [mx, my] = P(x + 0.4, y + d - 0.75); A.cyl(x + 0.4, y + d - 0.75, 0.09, 0, 12, E.stone); crescent(mx, my - 16, 3.2); light(mx, my - 16, 18); }
    for (let m = 0; m < 1 + band; m++) flyMoth(x + 0.5 + m * 0.5, y + 0.6 + (m % 2) * 0.9, 12 + m * 3);
    return 26 + band * 3;
  };

  // ----- boughwright glade (lumber) -----
  ART.lumber = ([x, y, w, d], L, band) => {
    const k = L - lo(band);
    const trees = [[0.35, 0.4], [1.2, 0.3], [2.1, 0.45], [0.3, 1.25], [0.35, 2.1], [2.25, 1.2]].slice(0, 3 + band);
    for (const [tx, ty] of trees) paleTree(x + tx, y + ty, 0.9 + ((tx * 7) % 3) * 0.08);
    // two trees sung into an arch over the track
    if (band >= 1) { const a = P(x + 0.5, y + 2.95), b = P(x + 0.5 + 0.9, y + 2.95); c.beginPath(); c.moveTo(a[0], a[1]); c.bezierCurveTo(a[0] - 4, a[1] - 34, b[0] + 4, b[1] - 34, b[0], b[1]); stroke('#e2dee8', 3); stroke('#9a94a4', 0.6); }
    // woven longshed
    const g = glassHall(x + 0.9, y + 1.0, 1.15, 0.8, 9 + band * 1.5, { axis: 'x', steep: 15, gap: 0.42 });
    A.door(g.b, 'R', 0.4, 0.3, 7, '#4a3a6a');
    // steam-bent hoops of pale wood
    const nh = 2 + band + Math.floor(k / 2);
    for (let j = 0; j < nh; j++) { const hx = x + 0.4 + (j % 4) * 0.22, hy = y + 1.75 + Math.floor(j / 4) * 0.35, [px, py] = P(hx, hy); c.beginPath(); c.ellipse(px, py - 6, 5, 6, 0, Math.PI, TAU); stroke('#e8e0cc', 1.6); stroke('#a89a7a', 0.5); }
    if (band >= 2) { // silk drying canopy
      const px0 = x + 1.65, py0 = y + 2.1, pw = 0.7, pd = 0.55;
      for (const [gx, gy] of [[px0, py0], [px0 + pw, py0], [px0 + pw, py0 + pd], [px0, py0 + pd]]) A.line(P(gx, gy), P(gx, gy, 13), E.wood2, 1.1);
      A.lamp([P(px0, py0, 13), P(px0 + pw, py0, 13), P(px0 + pw, py0 + pd, 11), P(px0, py0 + pd, 11)], A.SNOW ? '#f2f6f8' : E.silk, '#bfa8ff');
    }
    if (band >= 3) { // song-stone crescent where trees are sung into shape
      const [sx, sy] = P(x + 2.15, y + 2.15); A.cyl(x + 2.15, y + 2.15, 0.12, 0, 4, E.stone); crescent(sx + 1, sy - 13, 5, A.mix(E.stone, '#ffffff', 0.4), '#e8e0ff');
      A.rec('sparks', { x: sx, y: sy - 10, kind: 'motes', r: 10, n: 5, h: 20 }); light(sx, sy - 12, 22);
    }
    return 30 + band * 3;
  };

  // ----- moonstone cut (quarry) -----
  ART.quarry = ([x, y, w, d], L, band) => {
    const k = L - lo(band), rockc = era >= 2 ? '#d2d6ea' : '#d0c6e0', dark = A.shade(rockc, -0.3);
    // a pale moonstone cliff along the back with a jagged crest
    const ch = 16 + band * 5 + k;
    const cb = A.box(x + 0.15, y + 0.08, w - 0.35, 0.28, 0, ch, rockc, { noTop: true });
    const crest = [], n = 9;
    for (let j = 0; j <= n; j++) crest.push(P(x + 0.15 + (w - 0.35) * j / n, y + 0.36, ch + (j % 2 ? 4 : -1) + ((j * 5) % 3) * 2));
    A.poly([P(x + 0.15, y + 0.36, 0), ...crest, P(x + w - 0.2, y + 0.36, 0)], rockc);
    if (!A.SNOW) for (let j = 1; j < n; j += 2) A.line(P(x + 0.15 + (w - 0.35) * j / n, y + 0.36, 2), crest[j], A.shade(rockc, -0.15), 0.6);
    else A.poly([...crest, ...crest.slice().reverse().map(p => [p[0], p[1] + 3])], '#f2f6f8', null);
    void cb;
    // the pit: terraces stepping down, clipped by its rim
    const px = x + 0.25, py = y + 0.5, pw = w - 0.6, pd = d - 1.15, steps = 2 + Math.min(3, band + (k >= 3 ? 1 : 0));
    c.save(); A.path(A.quad(px, py, pw, pd, 0)); c.clip();
    try {
    for (let i = 0; i <= steps; i++) {
      const ins = i * 0.16, z = -i * 6, rx = px + ins, ry = py + ins, rw = pw - 2 * ins, rd = pd - 2 * ins;
      if (rw <= 0.1 || rd <= 0.1) break;
      A.poly(A.quad(rx, ry, rw, rd, z), sn(i === steps ? dark : A.shade(rockc, -0.04 * i)), 'rgba(60,50,80,0.35)', 0.5);
      if (i < steps) { // inner walls on the far sides, facing us
        const ni = ins + 0.16, nz = z - 6;
        A.poly([P(rx + 0.16, ry + 0.16, nz), P(rx + rw - 0.16, ry + 0.16, nz), P(rx + rw - 0.16, ry + 0.16, z), P(rx + 0.16, ry + 0.16, z)], A.shade(rockc, -0.1 - 0.05 * i), null);
        A.poly([P(rx + 0.16, ry + 0.16, nz), P(rx + 0.16, ry + rd - 0.16, nz), P(rx + 0.16, ry + rd - 0.16, z), P(rx + 0.16, ry + 0.16, z)], A.shade(rockc, -0.2 - 0.05 * i), null);
        void ni;
      }
    }
    // glowing seams on the pit floor
    const [fx, fy] = P(px + pw / 2, py + pd / 2, -steps * 6); A.lampDot(fx, fy, 2.4, '#8a78c8', '#d8c8ff');
    } finally { c.restore(); }
    A.poly(A.quad(px, py, pw, pd, 0), null, 'rgba(60,50,80,0.5)', 0.8);
    // crystals growing from the cliff (bigger and more of them with level)
    const nc = 2 + band + Math.floor(k / 2);
    for (let j = 0; j < nc; j++) { const u = 0.25 + (w - 0.8) * ((j * 0.618) % 1); A.crystal(x + u, y + 0.38, ch * (0.2 + 0.3 * ((j * 0.37) % 1)), 8 + band * 3, 0.07, j % 2 ? '#a8d8f0' : '#b8a8f0'); }
    // cut blocks beside the pit and a bough hoist over it
    for (let j = 0; j < 1 + band; j++) A.box(x + w - 0.42, y + 0.55 + j * 0.34, 0.26, 0.26, 0, 6 + (j % 2) * 2, A.mix(rockc, '#ffffff', 0.25));
    const hb = P(x + 0.3, y + d - 0.75), ht = P(x + 0.3, y + d - 0.75, 30), hk = P(x + 0.3 + pw * 0.45, y + 0.5 + pd * 0.5, 28);
    A.line(hb, ht, E.wood2, 1.8); A.line(ht, hk, E.wood2, 1.3); thread(hk, [hk[0], hk[1] + 22], 0);
    A.box(x + 0.3 + pw * 0.45 - 0.1, y + 0.5 + pd * 0.5 - 0.1, 0.2, 0.2, 2, 4, A.mix(rockc, '#ffffff', 0.3));
    if (band >= 3) { // a block floats up out of the pit on a glamour
      const gx = x + pw * 0.75, gy = y + 0.5 + pd * 0.4;
      A.box(gx - 0.17, gy - 0.17, 0.34, 0.34, 20 + k, 7, A.mix(rockc, '#ffffff', 0.3));
      const [mx, my] = P(gx, gy, 14); A.rec('sparks', { x: mx, y: my, kind: 'motes', r: 9, n: 6, h: 24 }); light(mx, my - 6, 20);
    }
    return ch + 8;
  };

  // ----- amethyst delving (mine): an arched portal in the hill -----
  ART.mine = ([x, y, w, d], L, band) => {
    const mx = x + w * 0.35, my = y + d - 0.05, [px, py] = P(mx, my);
    const H = 15 + band * 3, W2 = 6 + band;
    // the portal: dark pointed arch with a glow deep inside
    A.poly([[px - W2, py], [px - W2, py - H * 0.62], [px, py - H], [px + W2, py - H * 0.62], [px + W2, py]], '#1c1626', null);
    A.lampDot(px, py - H * 0.35, 2.4, '#3a2a5a', '#c8a8ff'); light(px, py - H * 0.4, 18);
    // crystal jambs and a briar lintel
    A.crystal(mx - 0.32, my + 0.02, 0, H * 0.8, 0.08, '#b8a8f0'); A.crystal(mx + 0.3, my + 0.06, 0, H * 0.75, 0.08, '#a8d8f0');
    briar([mx - 0.3, my + 0.05], [mx + 0.3, my + 0.05], H + 6, { lw: 2, moon: band >= 1 });
    // pale cart track and a cart of glowing ore
    const rl = Math.max(0.3, Math.min(1.5, A.N - 0.3 - my));
    for (let j = 0; j * 0.28 < rl - 0.1; j++) { const gy = my + 0.1 + j * 0.28; A.line(P(mx - 0.2, gy), P(mx + 0.2, gy), E.wood2, 1.3); }
    A.line(P(mx - 0.14, my), P(mx - 0.14, my + rl), E.metal, 0.9); A.line(P(mx + 0.14, my), P(mx + 0.14, my + rl), E.metal, 0.9);
    const cy0 = my + Math.min(0.6, rl - 0.45); A.box(mx - 0.18, cy0, 0.36, 0.4, 2, 4.5, E.wood2);
    const [ox, oy] = P(mx, cy0 + 0.2, 7); for (let j = 0; j < 4; j++) A.lampDot(ox - 3 + j * 2, oy - (j % 2), 1.4, j % 2 ? '#a088e0' : '#7ac8e8', '#e0d0ff');
    // seams of amethyst in the hillside, more with depth
    const seams = [[0.9, 0.5, 26], [1.55, 0.25, 30], [0.4, 0.9, 22], [1.8, 0.9, 18], [1.2, 1.1, 14]].slice(0, 2 + band);
    for (const [sx, sy, z] of seams) { A.crystal(x + sx, y + sy, z, 7 + band * 1.5, 0.06, '#c0a8ff'); A.crystal(x + sx + 0.1, y + sy + 0.06, z - 1, 5, 0.05, '#9ad8f0'); }
    if (band >= 2) { // a crystal-lantern headframe
      const hx = x + w * 0.78, hy = y + d * 0.25, [hb0, hb1] = [P(hx - 0.2, hy), P(hx + 0.2, hy)], tp = P(hx, hy, 32);
      A.line(hb0, tp, E.wood2, 1.6); A.line(hb1, tp, E.wood2, 1.6); A.lampDot(tp[0], tp[1] - 2, 2.2, E.accent, E.ng); light(tp[0], tp[1] - 2, 20);
      thread(tp, P(mx + 0.3, my, H), 6);
    }
    if (band >= 3) { const [gx, gy] = P(x + w * 0.62, y + d * 0.55, 44); A.rec('sparks', { x: gx, y: gy, kind: 'motes', r: 12, n: 6, h: 24 }); A.crystal(x + w * 0.62, y + d * 0.55, 40, 12, 0.1, '#d0b8ff'); }
    return 24 + band * 5;
  };

    // ----- cocoon stores (warehouse): a great silk cocoon on a woven drum -----
  function cocoon(cx, cy, r, z, h, glow = true) { // a tall silk ellipsoid wound with threads
    const [x, y, rx, ry] = A.ell(cx, cy, z, r);
    c.beginPath(); c.moveTo(x, y + ry * 0.6); c.bezierCurveTo(x - rx * 1.25, y + ry * 0.6, x - rx * 1.1, y - h * 0.75, x, y - h * 1.08); c.bezierCurveTo(x + rx * 1.1, y - h * 0.75, x + rx * 1.25, y + ry * 0.6, x, y + ry * 0.6); c.closePath();
    if (A.GLOW) { c.fillStyle = glow ? '#1e1840' : A.F('#000'); c.fill(); }
    else { const g = c.createRadialGradient(x - rx * 0.35, y - h * 0.75, 1, x, y - h * 0.45, rx * 1.4); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, sn(A.mix(E.silk, E.accent, 0.15))); g.addColorStop(1, A.mix(E.silk, E.accent, 0.7)); c.fillStyle = g; c.fill(); c.strokeStyle = A.OUT; c.lineWidth = 0.8; c.stroke(); }
    if (!A.SNOW) for (let q = 1; q < 6; q++) { const yy = y - h * 0.05 - q * h * 0.17, ww = rx * Math.sqrt(Math.max(0, 1 - Math.pow((yy - (y - h * 0.5)) / (h * 0.55), 2))); c.beginPath(); c.moveTo(x - ww, yy + 1.5); c.quadraticCurveTo(x, yy + 4, x + ww, yy - 1.5); stroke('rgba(150,130,200,0.7)', 0.5, '#c8b8ff'); }
    return z + h * 1.05;
  }
  ART.warehouse = ([x, y, w, d], L, band) => {
    const k = L - lo(band), cx = x + w * 0.42, cy = y + d * 0.36;
    let top = 0;
    if (band >= 2) { // a second, smaller store behind
      const c2 = [x + w - 0.42, y + 0.4];
      drum(c2[0], c2[1], 0.3, 0, 7); top = cocoon(c2[0], c2[1], 0.32, 7, 18 + k);
    }
    const r = 0.5 + band * 0.04, h = 7 + band * 2;
    drum(cx, cy, r, 0, h);
    drumDoor(cx, cy, r, 0, 8, 0.15);
    drumWins(cx, cy, r, 0, h, [-0.6, 0.65], 3.5);
    A.cyl(cx, cy, r * 1.08, h, 1.4, E.wood2);
    top = Math.max(top, cocoon(cx, cy, r * 0.8, h + 1, 24 + band * 6 + k));
    light(...P(cx, cy, h + 14), 20);
    // a bough frame hung with smaller cocoons
    const fx = x + 0.2, fy = y + d - 0.75, fw = w - 0.45;
    const p0 = P(fx, fy), p1 = P(fx + fw, fy), t0 = P(fx, fy, 18), t1 = P(fx + fw, fy, 18);
    A.line(p0, t0, E.wood2, 1.5); A.line(p1, t1, E.wood2, 1.5); A.line(t0, t1, E.wood2, 1.5);
    const n = Math.min(6, 2 + band + Math.floor(k / 2));
    for (let j = 0; j < n; j++) {
      const tp = lerp(t0, t1, (j + 0.5) / n);
      A.line(tp, [tp[0], tp[1] + 3], E.silk, 0.6);
      c.beginPath(); c.ellipse(tp[0], tp[1] + 8, 2.4, 5, 0, 0, TAU); fill(j % 2 ? E.silk : A.mix(E.silk, E.accent, 0.35), '#9a84e0'); stroke(A.OUT, 0.5, A.F(A.OUT));
    }
    if (band >= 3) { const t = P(cx, cy, top + 2); crescent(t[0], t[1] - 2, 3.4); A.rec('sparks', { x: t[0], y: t[1], kind: 'star' }); top += 8; }
    if (T('guilds')) mothPost(x + 0.2, y + 0.3, 14);
    return top + 2;
  };
  // ----- the glimmer fair (market): silk stalls round a lantern-tree, later a striped pavilion -----
  ART.market = ([x, y, w, d], L, band) => {
    const k = L - lo(band), cx = x + w * 0.5, cy = y + d * 0.45;
    const canopy = (gx, gy, col, h = 13) => { // a crescent silk awning on two posts over a trestle
      const a = P(gx - 0.26, gy), b = P(gx + 0.26, gy), at = P(gx - 0.26, gy, h), bt = P(gx + 0.26, gy, h);
      A.box(gx - 0.24, gy - 0.14, 0.48, 0.24, 0, 4.5, E.wood);
      const [ix, iy] = P(gx, gy, 5); for (let q = 0; q < 4; q++) A.lampDot(ix - 4 + q * 2.6, iy - 1, 1.2, [E.accent, E.bloom, '#f0e090', '#a8e8c8'][q], '#fff0ff');
      A.line(a, at, E.wood2, 1.1); A.line(b, bt, E.wood2, 1.1);
      c.beginPath(); c.moveTo(at[0] - 3, at[1] + 1); c.quadraticCurveTo((at[0] + bt[0]) / 2, at[1] - 11, bt[0] + 3, bt[1] + 1); c.quadraticCurveTo((at[0] + bt[0]) / 2, at[1] - 4, at[0] - 3, at[1] + 1); c.closePath();
      fill(sn(col)); stroke(A.OUT, 0.6, A.F(A.OUT));
      if (!A.GLOW && !A.SNOW) { c.beginPath(); c.moveTo(at[0], at[1] - 2); c.quadraticCurveTo((at[0] + bt[0]) / 2, at[1] - 9, bt[0], bt[1] - 2); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.8; c.stroke(); }
    };
    const spots = [[0.4, 0.4], [1.3, 0.3], [2.0, 0.65], [0.3, 1.35], [2.05, 1.45], [0.55, 2.0]].slice(0, 2 + Math.min(4, band + Math.floor(k / 2)));
    const back = spots.filter(([sx, sy]) => sx + sy < 1.8), front = spots.filter(([sx, sy]) => sx + sy >= 1.8);
    back.forEach(([sx, sy], j) => canopy(x + sx, y + sy, A.STY.cloth[j % 4]));
    // the lantern-tree: a pale bough pole with curling arms of lanterns, crescent on top
    const ph = 30 + band * 6 + k;
    const tentZ = 11, tentH = 9 + band * 2;
    const pole = () => {
      const [bx, by] = P(cx, cy);
      c.beginPath(); c.moveTo(bx - 1.6, by); c.quadraticCurveTo(bx - 0.6, by - ph * 0.5, bx - 0.8, by - ph); c.lineTo(bx + 0.8, by - ph); c.quadraticCurveTo(bx + 0.6, by - ph * 0.5, bx + 1.6, by); c.closePath(); fill('#e8e4ee'); stroke(A.OUT, 0.6, A.F(A.OUT));
      const arms = 3 + band;
      for (let q = 0; q < arms; q++) {
        const zz = ph * (0.45 + 0.5 * q / arms), dir = q % 2 ? 1 : -1, len = 7 + (arms - q);
        c.beginPath(); c.moveTo(bx, by - zz); c.quadraticCurveTo(bx + dir * len * 0.6, by - zz - 5, bx + dir * len, by - zz - 1); stroke('#e0dce8', 1.1, A.F('#000'));
        A.line([bx + dir * len, by - zz - 1], [bx + dir * len, by - zz + 2], E.wood2, 0.5);
        A.lampDot(bx + dir * len, by - zz + 3.5, 1.5, [E.accent, '#f0d070', E.bloom][q % 3], ['#e8dcff', '#fff0b0', '#ffd8f6'][q % 3]);
      }
      crescent(bx, by - ph - 4, 3.6); light(bx, by - ph * 0.6, 30 + band * 4);
    };
    if (band >= 2) { // a striped silk pavilion round the tree
      for (let a = 0; a < 8; a++) { const an = a / 8 * TAU; if (Math.cos(an) + Math.sin(an) > 0) continue; const [px, py] = P(cx + Math.cos(an) * 0.55, cy + Math.sin(an) * 0.55); A.line([px, py], [px, py - tentZ], E.wood2, 1); }
      pole();
      const tc = A.STY.cloth[0];
      A.cone(cx, cy, 0.66, tentZ, tentH, tc);
      const [tx, ty, trx, try_] = A.ell(cx, cy, tentZ, 0.66);
      if (!A.SNOW && !A.GLOW) for (let q = 1; q < 8; q += 2) { const f = -1 + q / 4; c.beginPath(); c.moveTo(tx, ty - tentH); c.lineTo(tx + trx * f, ty + try_ * Math.sqrt(Math.max(0, 1 - f * f))); c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 2.2; c.stroke(); }
      for (let q = 0; q < 9; q++) { const f = -1 + (q + 0.5) / 4.5, px = tx + trx * f, py = ty + try_ * Math.sqrt(Math.max(0, 1 - f * f)); c.beginPath(); c.arc(px, py, trx / 9, 0, Math.PI); fill(sn(A.shade(tc, -0.1))); }
      for (let a = 0; a < 8; a++) { const an = a / 8 * TAU; if (Math.cos(an) + Math.sin(an) <= 0) continue; const [px, py] = P(cx + Math.cos(an) * 0.55, cy + Math.sin(an) * 0.55); A.line([px, py], [px, py - tentZ], E.wood2, 1); }
      const [bx, by] = P(cx, cy, tentZ + tentH - 2); c.beginPath(); c.moveTo(bx - 1, by); c.lineTo(bx - 0.8, by - (ph - tentZ - tentH + 2)); c.lineTo(bx + 0.8, by - (ph - tentZ - tentH + 2)); c.lineTo(bx + 1, by); c.closePath(); fill('#e8e4ee');
      const [cxp, cyp] = P(cx, cy, ph); crescent(cxp, cyp - 4, 3.6);
      if (band >= 3) for (let q = 0; q < 3; q++) flyMoth(cx + Math.cos(q * 2.1) * 0.5, cy + Math.sin(q * 2.1) * 0.5, ph + 4);
    } else pole();
    front.forEach(([sx, sy], j) => canopy(x + sx, y + sy, A.STY.cloth[(j + 2) % 4]));
    flyMoth(cx + 0.4, cy - 0.3, 26);
    return ph + 10;
  };
  // ----- thornguard hall (barracks): a long dark-roofed hall crowned with thorns -----
  ART.barracks = ([x, y, w, d], L, band) => {
    const k = L - lo(band);
    let top = 0;
    if (band >= 2) top = spire(x + w - 0.35, y + 0.35, 0.14, 36 + band * 6 + k, { gap: 4, roof: E.roof2 });
    if (band >= 3) top = Math.max(top, spire(x + 0.35, y + 0.35, 0.14, 36 + band * 6, { gap: 4, ph: 1.5, roof: E.roof2 }));
    const hw = w - 1.1, hd = 0.95, hh = 10 + band * 2;
    const b = wallBox(x + 0.55, y + 0.6, hw, hd, 0, hh);
    // narrow arrow-slit lancets instead of wide glass
    for (const side of ['L', 'R']) { const Lf = side === 'L' ? hw : hd, n = Math.max(2, Math.floor(Lf / 0.22)); for (let i = 0; i < n; i++) archWin(b, side, Lf * (i + 0.5) / n, hh * 0.3, 0.06, hh * 0.5); }
    A.door(b, 'L', hw / 2, 0.36, 9, '#2a1e44');
    const zt = vault(b, hd * 15, A.shade(E.roof2, -0.25), 'x');
    // big thorns bristling from the ridge and eaves
    for (let u = 0.08; u < hw; u += 0.2) {
      const p = P(x + 0.55 + u, y + 0.6 + hd / 2, zt); A.poly([[p[0] - 1.3, p[1] + 1], [p[0] + 1.3, p[1] + 1], [p[0] + 0.6, p[1] - 7]], '#3a3448', null);
      const e = P(x + 0.55 + u, y + 0.6 + hd + 0.1, hh - 1.4); A.line(e, [e[0] - 1.5, e[1] + 3.5], '#3a3448', 0.9);
    }
    // moon banners either side of the door, a briar gate
    for (const u of [0.18, hw - 0.18]) { const bx = x + 0.55 + u, by = y + 0.6 + hd + 0.2; A.banner(bx, by, 0, 22 + band * 2, E.roof2); const t = P(bx, by, 22 + band * 2); crescent(t[0] + 4, t[1] + 9, 1.8, '#f4f0ff', '#fff'); }
    briar([x + 0.55 + hw / 2 - 0.3, y + d - 0.45], [x + 0.55 + hw / 2 + 0.3, y + d - 0.45], 16 + band * 2, { moon: band >= 1 });
    return Math.max(top, zt + 8);
  };
// ----- wisp stables -----
  ART.stable = ([x, y, w, d], L, band) => {
    const k = L - lo(band);
    // open bough stalls under a long leaf roof
    const sx = x + 0.3, sy = y + 0.35, sw = w - 0.7, sd = 0.75;
    const b = { x: sx, y: sy, w: sw, d: sd, z: 0, h: 10 + band, col: E.wood };
    A.box(sx, sy, sw, 0.12, 0, 10 + band, E.wood2);
    for (let u = 0; u <= sw + 0.01; u += sw / (3 + band)) { A.line(P(sx + u, sy + sd), P(sx + u, sy + sd, 10 + band), E.wood2, 1.4); }
    A.line(P(sx + sw, sy), P(sx + sw, sy, 10 + band), E.wood2, 1.4);
    const zt = vault(b, 9 + band, era >= 1 ? E.roof : E.leaf[1], 'x');
    // pale steeds (and nightmares once the court is old)
    const n = Math.min(4, 1 + band + Math.floor(k / 3));
    for (let j = 0; j < n; j++) A.animal(sx + 0.35 + j * (sw - 0.4) / Math.max(1, n - 1 || 1), sy + sd + 0.35, band >= 3 && j % 2 ? 'nightmare' : 'whitestag', j % 2 ? -1 : 1);
    // will-o-wisps drifting over the paddock
    for (let j = 0; j < 1 + band; j++) flyMoth(x + 0.5 + j * 0.55, y + d - 0.6, 12 + (j % 2) * 5);
    let top = zt;
    if (band >= 2) { const dx = x + w - 0.4, dy = y + d - 0.75; drum(dx, dy, 0.22, 0, 11); drumWins(dx, dy, 0.22, 0, 11, [0.3], 5); top = Math.max(top, ogee(dx, dy, 0.27, 11, 14, E.roof)); }
    return top + 2;
  };

  // ----- mirror duelling ring (war pit) -----
  ART.warpit = ([x, y, w, d], L, band) => {
    const k = L - lo(band), cx = x + w * 0.5, cy = y + d * 0.48, rx = 0.85 + band * 0.05, ry = 0.75 + band * 0.05;
    const [ex, ey] = P(cx, cy), RX = rx * A.SQ2 * A.HW, RY = ry * A.SQ2 * A.HH;
    // tiered seats from band 2
    if (band >= 2) for (let t = 2; t >= 1; t--) { c.beginPath(); c.ellipse(ex, ey, RX + t * 5, RY + t * 2.6, 0, 0, TAU); fill(sn(A.shade(E.stone, -0.05 * t))); stroke(A.OUT, 0.6, A.F(A.OUT)); }
    c.beginPath(); c.ellipse(ex, ey, RX, RY, 0, 0, TAU); fill(sn(A.mix(E.stone, '#8a8090', 0.35))); stroke(A.OUT, 0.8, A.F(A.OUT));
    c.beginPath(); c.ellipse(ex, ey + 1.5, RX * 0.8, RY * 0.8, 0, 0, TAU); fill(A.SNOW ? '#eef2f4' : '#bcb4a4');
    // crescent sigil on the sand
    if (!A.SNOW) crescent(ex - 2, ey + 1.5, RY * 0.45, 'rgba(120,100,160,0.45)', '#6a5aa0');
    A.rec('pit', { x: ex, y: ey, rx: RX * 0.6, ry: RY * 0.6 });
    // standing mirror shards round the ring
    const nm = 4 + band * 2 + Math.floor(k / 2);
    const ms = [];
    for (let j = 0; j < nm; j++) { const a = j / nm * TAU + 0.3; ms.push([Math.cos(a) + Math.sin(a), a]); }
    ms.sort((p, q) => p[0] - q[0]);
    for (const [, a] of ms) {
      const gx = cx + Math.cos(a) * (rx + 0.12), gy = cy + Math.sin(a) * (ry + 0.12), [mx, my] = P(gx, gy), h = 14 + band * 2;
      A.poly([[mx - 2.4, my], [mx + 2.4, my], [mx + 2.6, my - h * 0.8], [mx, my - h], [mx - 2.6, my - h * 0.8]], A.mix(E.wood2, '#ffffff', 0.3));
      A.lamp([[mx - 1.6, my - 1], [mx + 1.6, my - 1], [mx + 1.8, my - h * 0.78], [mx, my - h + 1.5], [mx - 1.8, my - h * 0.78]], A.mix('#c8d4f4', E.accent, 0.3), '#e0eaff');
      if (!A.GLOW) A.line([mx - 0.8, my - 3], [mx + 0.6, my - h * 0.7], 'rgba(255,255,255,0.8)', 0.6);
    }
    return 18 + band * 3;
  };

    // ----- glamourwright's workshop: a long hall under a saw-tooth glass roof, a great lens -----
  ART.workshop = ([x, y, w, d], L, band) => {
    const k = L - lo(band);
    const hx = x + 0.2, hy = y + 0.2, hw = w - 0.95, hd = d - 0.55, hh = 9 + band * 2;
    const b = wallBox(hx, hy, hw, hd, 0, hh);
    archRow(b, 'L', 2, hh - 4.5, 0.3); archRow(b, 'R', 2, hh - 4.5, 0.3);
    A.door(b, 'L', 0.4, 0.34, 8, '#4a3a6a');
    // saw-tooth roof: glass faces toward the front, woven backs
    const nT = Math.max(3, Math.round(hw / 0.32)), tw = hw / nT, th = 7 + band;
    for (let j = 0; j < nT; j++) {
      const x0 = hx + tw * j, x1 = x0 + tw, z0 = hh;
      A.poly([P(x0, hy, z0), P(x0, hy + hd, z0), P(x0 + tw * 0.15, hy + hd, z0 + th), P(x0 + tw * 0.15, hy, z0 + th)], sn(A.shade(E.roof2, -0.2)));
      A.lamp([P(x0 + tw * 0.15, hy, z0 + th), P(x0 + tw * 0.15, hy + hd, z0 + th), P(x1, hy + hd, z0), P(x1, hy, z0)], A.SNOW ? '#eef2f6' : A.mix(E.glass, '#c8e8ff', 0.45), '#2c2458');
      A.poly([P(x0 + tw * 0.15, hy + hd, z0 + th), P(x1, hy + hd, z0), P(x0, hy + hd, z0)], A.shade(E.wood, -0.05));
    }
    // a great lens on a frame throwing a glint
    const lx = x + w - 0.42, ly = y + d * 0.45, [px, py] = P(lx, ly), lr = 5 + band * 1.2;
    A.line([px - 4, py], [px, py - 16], E.wood2, 1.3); A.line([px + 4, py], [px, py - 16], E.wood2, 1.3);
    c.beginPath(); c.ellipse(px, py - 16 - lr, lr * 0.85, lr, 0, 0, TAU); c.fillStyle = A.GLOW ? '#4a3c90' : 'rgba(200,230,255,0.75)'; c.fill(); stroke(era >= 3 ? GOLD : E.metal, 1.6, '#e0d8ff');
    if (!A.GLOW) A.line([px - 2, py - 18 - lr * 1.2], [px + 1, py - 16 - lr * 0.4], 'rgba(255,255,255,0.9)', 0.8);
    light(px, py - 16 - lr, 18);
    for (let j = 0; j < 1 + band + Math.floor(k / 2); j++) A.crystal(x + 0.3 + j * 0.28, y + d - 0.2, 0, 7, 0.05, j % 2 ? '#a8d8f0' : '#c8b0f8');
    let top = hh + th;
    if (band >= 3) top = Math.max(top, spire(x + w - 0.3, y + 0.25, 0.11, 34, { gap: 3 }));
    return Math.max(top, 16 + lr * 2) + 2;
  };

// ----- moonforge crucible (smelter) -----
  ART.smelter = ([x, y, w, d], L, band) => {
    const k = L - lo(band), cx = x + w * 0.5, cy = y + d * 0.42;
    // a squat stone hearth with a tall glass alembic glowing violet inside
    A.cyl(cx, cy, 0.6, 0, 6 + band, E.stone, A.shade(E.stone, 0.05));
    const ah = 18 + band * 5 + k;
    const [bx, by, rx] = A.ell(cx, cy, 6 + band, 0.38);
    c.beginPath(); c.moveTo(bx - rx * 0.4, by - ah); c.lineTo(bx - rx * 0.4, by - ah * 0.65); c.bezierCurveTo(bx - rx * 1.3, by - ah * 0.5, bx - rx * 1.2, by + 2, bx, by + 2); c.bezierCurveTo(bx + rx * 1.2, by + 2, bx + rx * 1.3, by - ah * 0.5, bx + rx * 0.4, by - ah * 0.65); c.lineTo(bx + rx * 0.4, by - ah); c.closePath();
    if (A.GLOW) c.fillStyle = '#b080ff'; else { const gg = c.createLinearGradient(bx - rx, 0, bx + rx, 0); gg.addColorStop(0, 'rgba(230,236,255,0.95)'); gg.addColorStop(0.5, 'rgba(176,196,240,0.9)'); gg.addColorStop(1, 'rgba(120,130,200,0.95)'); c.fillStyle = gg; } c.fill(); stroke('rgba(50,50,100,0.8)', 0.9, '#d8c0ff');
    if (!A.GLOW) { A.line([bx - rx * 0.55, by - ah * 0.15], [bx - rx * 0.3, by - ah * 0.55], 'rgba(255,255,255,0.9)', 0.9); }
    { const [ox2, oy2] = P(cx + 0.42, cy + 0.42, 1); A.lamp([[ox2 - 2.5, oy2], [ox2 + 2.5, oy2 - 1], [ox2 + 2.5, oy2 - 4.5], [ox2, oy2 - 6], [ox2 - 2.5, oy2 - 3.5]], '#3a2a5a', '#e0a8ff'); }
    c.beginPath(); c.ellipse(bx, by - ah * 0.22, rx * 0.85, ah * 0.2, 0, 0, TAU); c.fillStyle = A.GLOW ? '#ffd8ff' : '#a070e0'; c.fill();
    light(bx, by - ah * 0.25, 26); A.rec('sparks', { x: bx, y: by - ah * 0.3, kind: 'rune' });
    A.rec('smoke', { x: bx, y: by - ah - 2, kind: 'smelter', seed: A.R() });
    // coiled copper→silver pipe to a cooling pool
    const pc = era >= 2 ? E.metal : '#c08a5a';
    c.beginPath(); const p0 = [bx + rx * 0.4, by - ah + 3]; c.moveTo(p0[0], p0[1]); c.bezierCurveTo(p0[0] + 14, p0[1] - 4, p0[0] + 18, p0[1] + 18, P(x + w - 0.35, y + d - 0.7, 6)[0], P(x + w - 0.35, y + d - 0.7, 6)[1]); stroke(pc, 1.6);
    const [qx, qy] = P(x + w - 0.35, y + d - 0.7); c.beginPath(); c.ellipse(qx, qy, 7, 3.5, 0, 0, TAU); fill(sn(E.stone)); c.beginPath(); c.ellipse(qx, qy + 0.5, 5.5, 2.6, 0, 0, TAU); c.fillStyle = A.GLOW ? '#8070e0' : '#9ab8e8'; c.fill();
    if (T('bellows')) { const [fx, fy] = P(cx - 0.6, cy + 0.5, 3); A.poly([[fx - 5, fy], [fx + 3, fy - 2], [fx + 3, fy + 2]], E.wood2); A.line([fx - 5, fy], [fx - 9, fy - 1], E.wood2, 1); }
    if (band >= 2) { for (let j = 0; j < band; j++) A.crystal(x + 0.3 + j * 0.25, y + 0.3, 0, 8, 0.06, '#c0a8ff'); }
    if (band >= 3) { hover(cx, cy, 0.18, 6 + band + ah * 0.7, 4, 4); A.dome(cx, cy, 0.2, 6 + band + ah + 2, 6, E.metal); }
    return 6 + band + ah + (band >= 3 ? 10 : 2);
  };

    // ----- silversmith (smithy): a round cold-forge under a crescent canopy -----
  ART.smithy = ([x, y, w, d], L, band) => {
    const k = L - lo(band);
    let top = 0;
    if (band >= 2) top = spire(x + w - 0.32, y + 0.32, 0.12, 30 + band * 5 + k, { gap: 3 });
    // the forge: a stone drum with a tall hood and blue-white fire in its mouth
    const fx = x + 0.7, fy = y + 0.7, fr = 0.4 + band * 0.03, fh = 9 + band * 2;
    A.cyl(fx, fy, fr, 0, fh, E.stone, A.shade(E.stone, 0.05));
    const [mx, my, mrx, mry] = A.ell(fx, fy, 0, fr);
    A.lamp([[mx + mrx * 0.1, my + mry * 0.95], [mx + mrx * 0.6, my + mry * 0.75], [mx + mrx * 0.6, my + mry * 0.75 - 6], [mx + mrx * 0.35, my + mry * 0.85 - 8.5], [mx + mrx * 0.1, my + mry * 0.95 - 6]], '#2a3050', '#d8f4ff');
    light(mx + mrx * 0.35, my + mry * 0.8 - 3, 22); A.rec('sparks', { x: mx + mrx * 0.35, y: my + mry * 0.8 - 4, kind: 'rune' });
    const ht = A.cone(fx, fy, fr * 0.9, fh, 8, era >= 2 ? E.metal : '#b08a6a');
    A.chimney(fx - 0.11, fy - 0.11, ht - 3, 10 + band * 3, 'smithy', A.shade(E.stone, -0.15));
    top = Math.max(top, ht + 13 + band * 3);
    // the crescent anvil and a curved silk-and-silver canopy over it
    const ax = x + 1.45, ay = y + 1.25;
    const [px, py] = P(ax, ay, 0);
    A.poly([[px - 3.5, py], [px + 3.5, py], [px + 2, py - 3.5], [px + 6, py - 6], [px - 6, py - 6], [px - 2, py - 3.5]], '#8a90a8');
    A.rec('anvils', { x: px, y: py - 6 });
    const cz = 15 + band * 2, p0 = P(ax - 0.55, ay + 0.15), p1 = P(ax + 0.45, ay - 0.45);
    A.line(p0, [p0[0], p0[1] - cz], E.wood2, 1.4); A.line(p1, [p1[0], p1[1] - cz], E.wood2, 1.4);
    const a = [p0[0], p0[1] - cz], b = [p1[0], p1[1] - cz], m = lerp(a, b, 0.5);
    c.beginPath(); c.moveTo(a[0] - 4, a[1] + 3); c.quadraticCurveTo(m[0], m[1] - 18, b[0] + 4, b[1] + 3); c.quadraticCurveTo(m[0], m[1] - 6, a[0] - 4, a[1] + 3); c.closePath();
    fill(sn(era >= 2 ? E.metal : E.roof)); stroke(A.OUT, 0.7, A.F(A.OUT));
    if (!A.GLOW && !A.SNOW) { c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(m[0], m[1] - 14, b[0], b[1]); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.8; c.stroke(); }
    // hanging silverwork that multiplies with level
    const nh = 2 + band + Math.floor(k / 2);
    for (let j = 0; j < nh; j++) { const t = (j + 0.5) / nh, q = lerp(a, b, t), sag = Math.sin(t * Math.PI) * 7; A.line([q[0], q[1] - sag], [q[0], q[1] - sag + 4], E.metal, 0.5); crescent(q[0], q[1] - sag + 6, 1.4, '#dfe2ee', '#f4f4ff'); }
    if (T('metallurgy')) for (let j = 0; j < 2; j++) A.box(x + 0.3 + j * 0.28, y + d - 0.9, 0.22, 0.14, 0, 2.5, '#c8ccd8');
    return Math.max(top, cz + 14);
  };

// ----- mirrorguard armory -----
  ART.armory = ([x, y, w, d], L, band) => {
    const k = L - lo(band), cx = x + w * 0.45, cy = y + d * 0.42;
    // a hexagonal glass keep showing racks of pale armour
    const r = 0.62, h = 20 + band * 5 + k;
    const hex = z => Array.from({ length: 6 }, (_, j) => { const a = j / 6 * TAU + Math.PI / 6; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95, z]; });
    const lo6 = hex(0), hi6 = hex(h);
    for (let j = 0; j < 6; j++) {
      const a = lo6[j], b = lo6[(j + 1) % 6], mid = (Math.cos((j + 0.5) / 6 * TAU + Math.PI / 6) + Math.sin((j + 0.5) / 6 * TAU + Math.PI / 6));
      if (mid <= 0) continue;
      const face = [P(a[0], a[1], 0), P(b[0], b[1], 0), P(b[0], b[1], h), P(a[0], a[1], h)];
      A.poly(face, stoneWalls() ? E.stone : E.wood);
      const g = [lerp(face[0], face[1], 0.2), lerp(face[0], face[1], 0.8), lerp(face[3], face[2], 0.8), lerp(face[3], face[2], 0.2)];
      g[0][1] -= 3; g[1][1] -= 3; g[2][1] += 4; g[3][1] += 4;
      A.lamp(g, mid > 1.2 ? E.glass : A.shade(E.glass, -0.15), '#2e2860');
      if (!A.GLOW) { const m = lerp(g[0], g[1], 0.5); A.line([m[0], m[1] - 2], [m[0], m[1] - (h - 8)], 'rgba(220,226,240,0.8)', 1.6); circ0(m[0], m[1] - (h - 8), 1.6, '#e8ecf4'); }
    }
    A.poly(hi6.map(p => P(p[0], p[1], p[2])), sn(A.shade(E.stone, 0.05)));
    const zt = ogee(cx, cy, r * 1.05, h, 16 + band * 4, E.roof);
    // crescent-crested shields on posts at the door
    for (const [gx, gy] of [[x + 0.3, y + d - 0.75], [x + w - 0.5, y + d - 0.75]]) { const [sx, sy] = P(gx, gy); A.line([sx, sy], [sx, sy - 12], E.wood2, 1.1); A.poly([[sx - 3.5, sy - 16], [sx + 3.5, sy - 16], [sx + 3, sy - 10], [sx, sy - 7], [sx - 3, sy - 10]], A.STY.flag); crescent(sx - 0.5, sy - 12, 2, '#f4f0ff', '#fff'); }
    let top = moonFinial(cx, cy, zt, 4, 3);
    if (band >= 2) top = Math.max(top, spire(x + w - 0.35, y + 0.35, 0.12, 30 + band * 5, { gap: 4 }));
    return top;
  };
  function circ0(x, y, r, col) { A.circ(x, y, r, col); }

    // ----- starglass observatory (academy) -----
  ART.academy = ([x, y, w, d], L, band) => {
    const k = L - lo(band);
    let top = 0;
    if (band >= 2) top = spire(x + 0.3, y + 0.3, 0.13, 36 + band * 6 + k, { gap: 5 });
    // the great observatory drum at the back
    const ox = x + w - 0.62, oy = y + 0.55, orr = 0.42 + band * 0.03, oh = 14 + band * 4;
    drum(ox, oy, orr, 0, oh, stoneWalls() ? E.stone : null); drumWins(ox, oy, orr, 0, oh, [-0.55, 0, 0.55], 5);
    A.cyl(ox, oy, orr * 1.08, oh, 1.4, era >= 3 ? GOLD : E.metal);
    const dt = A.dome(ox, oy, orr * 1.05, oh + 1.4, 13 + band * 2, era >= 2 ? E.metal : E.roof2);
    const [sx, sy] = P(ox, oy, oh + 1.4);
    A.lamp([[sx - 1.6, sy + 2], [sx + 1.6, sy + 2], [sx + 1.1, sy - 12 - band * 2], [sx - 1.1, sy - 12 - band * 2]], '#2a2440', E.ng);
    A.line([sx + 0.5, sy - 7], [sx + 10 + band, sy - 15 - band], era >= 2 ? E.metal : '#c8a050', 2.4);
    A.circ(sx + 10 + band, sy - 15 - band, 1.4, '#e8e0ff', A.OUT);
    top = Math.max(top, dt);
    // a low reading-hall in front with a balustraded roof terrace
    const hb = wallBox(x + 0.2, y + 0.8, w - 1.05, d - 1.15, 0, 9 + band * 2);
    archRow(hb, 'L', 2, 9 + band * 2 - 4.5, 0.3); archRow(hb, 'R', 2, 9 + band * 2 - 4.5, 0.3);
    A.door(hb, 'L', (w - 1.05) / 2, 0.26, 7, '#4a3a6a');
    const tz = hb.z + hb.h;
    for (let u = 0; u <= hb.w + 0.01; u += hb.w / 6) { const p = P(hb.x + u, hb.y + hb.d, tz); A.line(p, [p[0], p[1] - 3], E.wood2, 0.9); }
    for (let u = 0; u <= hb.d + 0.01; u += hb.d / 3) { const p = P(hb.x + hb.w, hb.y + u, tz); A.line(p, [p[0], p[1] - 3], E.wood2, 0.9); }
    A.line(P(hb.x, hb.y + hb.d, tz + 3), P(hb.x + hb.w, hb.y + hb.d, tz + 3), E.wood2, 0.9); A.line(P(hb.x + hb.w, hb.y, tz + 3), P(hb.x + hb.w, hb.y + hb.d, tz + 3), E.wood2, 0.9);
    // armillary on the terrace from band 1
    if (band >= 1) { const [qx, qy] = P(hb.x + hb.w * 0.4, hb.y + hb.d * 0.5, tz); A.line([qx, qy], [qx, qy - 6], E.wood2, 1); c.beginPath(); c.ellipse(qx, qy - 10, 4.5, 4.5, 0, 0, TAU); stroke(era >= 3 ? GOLD : E.metal, 0.9, '#f0e8c0'); c.beginPath(); c.ellipse(qx, qy - 10, 4.5, 1.6, -0.4, 0, TAU); stroke(era >= 3 ? GOLD : E.metal, 0.7, '#f0e8c0'); A.lampDot(qx, qy - 10, 1.2, '#e8d070', '#fff4c0'); }
    top = Math.max(top, tz + 4);
    // a floating orrery above everything at band 3
    if (band >= 3) { const [rx, ry] = P(x + w * 0.45, y + d * 0.5, dt + 12); c.beginPath(); c.ellipse(rx, ry, 13, 4, -0.2, 0, TAU); stroke(GOLD, 0.9, '#fff0c0'); c.beginPath(); c.ellipse(rx, ry, 8, 6, 0.6, 0, TAU); stroke(E.metal, 0.7, '#e0e8ff'); A.lampDot(rx, ry, 2.2, '#f0d070', '#fff8d0'); A.lampDot(rx + 12, ry - 2, 1, E.accent, E.ng); A.lampDot(rx - 6, ry + 4, 1, E.bloom, E.ng); A.rec('sparks', { x: rx, y: ry, kind: 'star' }); top = Math.max(top, dt + 20); }
    if (T('cartography')) { const [mx, my] = P(x + 0.3, y + d - 0.3); A.line([mx, my], [mx, my - 7], E.wood2, 1); A.circ(mx, my - 10, 3, '#8ab8d8', A.OUT); A.line([mx - 3, my - 10], [mx + 3, my - 10], '#5a8a50', 0.8); }
    return top + 2;
  };
  // ----- the dewdrop tavern: two round drinking-towers joined by a covered bridge -----
  ART.tavern = ([x, y, w, d], L, band) => {
    const k = L - lo(band), cx = x + w * 0.5;
    const r1 = 0.42 + band * 0.03, h1 = 13 + band * 3 + Math.min(4, k);
    const b1 = [cx, y + 0.6], b2 = [cx + 0.02, y + 1.55];
    // back tower
    drum(b1[0], b1[1], r1, 0, h1); drumWins(b1[0], b1[1], r1, 0, h1, [-0.5, 0.5], 5); drumWins(b1[0], b1[1], r1, h1 * 0.5, h1 * 0.5, [0, 0.62], 4);
    A.cyl(b1[0], b1[1], r1 * 1.15, h1, 1.3, E.wood2);
    let top = ogee(b1[0], b1[1], r1 * 1.15, h1 + 1.3, 15 + band * 3, E.roof);
    if (band >= 2) A.chimney(b1[0] - 0.25, b1[1] - 0.2, h1 + 2, 9 + k, 'house', A.shade(E.stone, -0.1));
    // hanging moth-lanterns round the eaves
    for (let j = 0; j < 2 + band; j++) { const a = 0.2 + j * 0.55, [lx, ly] = P(b1[0] + Math.cos(a) * r1 * 1.15, b1[1] + Math.sin(a) * r1 * 1.15, h1); A.line([lx, ly], [lx, ly + 4], E.wood2, 0.5); A.lampDot(lx, ly + 5.5, 1.4, '#e8c870', '#fff0b0'); light(lx, ly + 5, 12); }
    // covered bridge
    if (band >= 1) { const bz = h1 * 0.55, bb = A.box(cx - 0.12, y + 0.95, 0.24, 0.32, bz, 5, E.wood); weave(bb, E.wood2); vault(bb, 4, E.roof2, 'y'); }
    // front tower, shorter, with a leaf cap that turns to an ogee
    const r2 = 0.34 + band * 0.02, h2 = 9 + band * 2.5;
    drum(b2[0], b2[1], r2, 0, h2); drumWins(b2[0], b2[1], r2, 0, h2, [0.55], 4); drumDoor(b2[0], b2[1], r2, 0, 8, -0.1);
    top = Math.max(top, band === 0 ? A.dome(b2[0], b2[1], r2 * 1.25, h2, 9, E.leaf[1]) : ogee(b2[0], b2[1], r2 * 1.2, h2, 12 + band * 2, E.roof2));
    // crescent sign on a crook post
    const [sx, sy] = P(x + w - 0.12, y + 1.95); c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy - 15); c.lineTo(sx - 6, sy - 15); stroke(E.wood2, 1.1); crescent(sx - 6, sy - 10, 3.4); light(sx - 6, sy - 10, 12);
    // a silk awning over a table in front
    if (band >= 1) { const a0 = P(x + 0.15, y + 2.05, 9), a1 = P(x + 0.15, y + 2.4, 9); A.line(P(x + 0.15, y + 2.05), a0, E.wood2, 1); A.line(P(x + 0.15, y + 2.4), a1, E.wood2, 1); const m = P(cx, y + 2.2, 11); A.poly([a0, m, a1], sn(A.STY.cloth[2]), A.OUT, 0.6); A.box(x + 0.25, y + 2.1, 0.3, 0.22, 0, 3.5, E.wood); }
    if (band >= 3) { flyMoth(x + 0.4, y + 1.0, h1 + 10); const t = P(b1[0], b1[1], top); crescent(t[0], t[1] - 4, 2.6); top += 6; }
    return top + 2;
  };

// ----- the masque theatre -----
  ART.theatre = ([x, y, w, d], L, band) => {
    const k = L - lo(band);
    // a half-shell stage: back wall arcs into a crescent hood
    const sx = x + 0.3, sy = y + 0.25, sw = w - 0.6;
    const back = wallBox(sx, sy, sw, 0.22, 0, 14 + band * 3);
    const hz = 14 + band * 3, a = P(sx, sy + 0.22, hz), b = P(sx + sw, sy + 0.22, hz), m = lerp(a, b, 0.5);
    c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(m[0], m[1] - 26 - band * 4, b[0], b[1]); c.quadraticCurveTo(m[0], m[1] - 12, a[0], a[1]); c.closePath(); fill(sn(E.roof)); stroke(A.OUT, 0.7, A.F(A.OUT));
    void back;
    // stage platform and silk curtains
    A.box(sx + 0.05, sy + 0.22, sw - 0.1, 0.5, 0, 3, E.wood);
    const c0 = P(sx + 0.1, sy + 0.5, 3), c1 = P(sx + sw - 0.1, sy + 0.5, 3);
    for (const [p, dir] of [[c0, 1], [c1, -1]]) { A.poly([[p[0], p[1]], [p[0], p[1] - hz + 2], [p[0] + dir * 9, p[1] - hz + 2], [p[0] + dir * 4, p[1]]], sn(A.STY.cloth[0])); }
    // two great masks over the stage: one silver, one moon-gold
    const mm = lerp(c0, c1, 0.5);
    for (const [dx, col] of [[-5, '#eef0f6'], [5, GOLD]]) { A.circ(mm[0] + dx, mm[1] - hz - 2, 3.4, col, A.OUT); A.lampDot(mm[0] + dx - 1.2, mm[1] - hz - 2.6, 0.6, '#2a2440', E.ng); A.lampDot(mm[0] + dx + 1.2, mm[1] - hz - 2.6, 0.6, '#2a2440', E.ng); }
    light(mm[0], mm[1] - 8, 26);
    // footlights
    for (let j = 0; j < 4 + band; j++) { const p = lerp(P(sx + 0.15, sy + 0.72, 3), P(sx + sw - 0.15, sy + 0.72, 3), j / (3 + band)); A.lampDot(p[0], p[1], 0.9, '#e8c870', '#fff0b0'); }
    // tiers of seats with growth
    const tiers = 1 + Math.min(3, band + (k >= 3 ? 1 : 0));
    for (let t = 0; t < tiers; t++) A.box(sx + 0.15 + t * 0.06, sy + 0.85 + t * 0.12, sw - 0.3 - t * 0.12, 0.1, 0, 1.5 + t * 0.8, A.shade(E.stone, -0.04 * t));
    let top = hz + 26 + band * 4;
    if (band >= 2) { spire(x + 0.2, y + 0.15, 0.09, 28 + band * 4, { gap: 3, finial: false }); spire(x + w - 0.25, y + 0.15, 0.09, 28 + band * 4, { gap: 3, finial: false, ph: 2 }); }
    if (band >= 3) { const tp = [m[0], m[1] - 26 - band * 4]; crescent(tp[0], tp[1] - 6, 4); A.rec('sparks', { x: tp[0], y: tp[1] - 6, kind: 'moon' }); top += 10; }
    return top;
  };

  // ----- moon temple -----
  ART.temple = ([x, y, w, d], L, band) => {
    const k = L - lo(band), cx = x + w * 0.5, cy = y + d * 0.47;
    const r = 0.6 + band * 0.05;
    A.cyl(cx, cy, r + 0.12, 0, 2.5, E.stone, A.shade(E.stone, 0.06));
    // ring of slender pillars round a moonwell
    const n = 6 + band * 2, ph = 16 + band * 4 + k;
    const pil = Array.from({ length: n }, (_, j) => { const a = j / n * TAU; return [Math.cos(a) + Math.sin(a), cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
    pil.sort((p, q) => p[0] - q[0]);
    const backP = pil.filter(p => p[0] <= 0), frontP = pil.filter(p => p[0] > 0);
    for (const [, gx, gy] of backP) A.cyl(gx, gy, 0.05, 2.5, ph, stoneWalls() ? E.stone : E.wood);
    const [wx, wy] = pool(cx, cy, r * 0.62, r * 0.55, { stars: 4 + band, moon: true }); void wx; void wy;
    const [mx, my] = P(cx, cy, 6); A.rec('sparks', { x: mx, y: my - 2, kind: 'moon' }); light(mx, my, 30);
    for (const [, gx, gy] of frontP) A.cyl(gx, gy, 0.05, 2.5, ph, stoneWalls() ? E.stone : E.wood);
    let top;
    if (band === 0) { // open ring with a crescent arch over the front
      const t = P(cx + r * 0.7, cy + r * 0.7, ph + 2.5); crescent(t[0], t[1] - 4, 4.5); top = ph + 14;
    } else {
      // a ring beam and (band 2+) a glass ogee dome
      const ring = A.ell(cx, cy, 2.5 + ph, r);
      c.beginPath(); c.ellipse(ring[0], ring[1], ring[2], ring[3], 0, 0, TAU); stroke(era >= 3 ? GOLD : E.metal, 2.2, A.F(E.metal));
      if (band >= 2) top = ogee(cx, cy, r * 1.02, 2.5 + ph, 20 + band * 4, A.mix(E.glass, '#ffffff', band >= 3 ? 0.35 : 0.5));
      else top = A.cone(cx, cy, r * 1.02, 2.5 + ph, 12, E.roof);
      top = moonFinial(cx, cy, top, 5, 3.4);
    }
    if (band >= 3) { const tp = P(cx, cy, top + 2); A.rec('sparks', { x: tp[0], y: tp[1], kind: 'star' }); }
    flyMoth(cx - 0.6, cy + 0.6, 18);
    return top;
  };

  // ----- wayside moon shrine (spare plot) -----
  ART.shrine = ([x, y, w, d], L, band) => {
    const cx = x + w * 0.5, cy = y + d * 0.45, s = Math.min(w, d);
    pool(cx + s * 0.15, cy + s * 0.2, 0.22 + band * 0.04, 0.18 + band * 0.03, { stars: 2 + band, moon: false });
    const [sx, sy] = P(cx - s * 0.2, cy - s * 0.15);
    A.cyl(cx - s * 0.2, cy - s * 0.15, 0.14, 0, 3, E.stone);
    A.poly([[sx - 3, sy - 3], [sx + 3, sy - 3], [sx + 2.4, sy - 18 - band * 3], [sx, sy - 21 - band * 3], [sx - 2.4, sy - 18 - band * 3]], sn(A.mix(E.stone, '#ffffff', 0.3)));
    crescent(sx, sy - 13 - band * 2, 3, E.accent, E.ng); light(sx, sy - 13, 18);
    if (band >= 1) briar([cx + s * 0.05, cy + s * 0.45], [cx + s * 0.4, cy + s * 0.45], 12, {});
    return 24 + band * 3;
  };

  // ----- veiled bower (spymaster's den) -----
  ART.hideout = ([x, y, w, d], L, band) => {
    const cx = x + w * 0.5, cy = y + d * 0.45, s = Math.min(w, d);
    // a briar thicket hiding a little door; masks hung in the thorns
    const hedge = (gx, gy, r) => { const [hx, hy] = P(gx, gy); c.beginPath(); c.ellipse(hx, hy - r * 0.6, r, r * 0.75, 0, 0, TAU); fill(A.SNOW ? '#e6ecef' : '#4f5e50'); stroke(A.OUT, 0.6, A.F(A.OUT)); for (let q = 0; q < 4; q++) A.line([hx - r * 0.7 + q * r * 0.45, hy - r * 0.9], [hx - r * 0.5 + q * r * 0.45, hy - r * 1.3], '#2e3a2e', 0.6); if (!A.SNOW) for (let q = 0; q < 3; q++) A.lampDot(hx - r * 0.5 + q * r * 0.5, hy - r * (0.5 + (q % 2) * 0.4), 1, q % 2 ? E.bloom : E.accent, '#e8d8ff'); };
    hedge(cx - s * 0.25, cy - s * 0.2, 9 + band); hedge(cx + s * 0.2, cy - s * 0.25, 8 + band);
    const r = 0.22 + band * 0.03;
    drum(cx, cy, r, 0, 8 + band * 2, A.shade(E.wood, -0.15));
    drumDoor(cx, cy, r, 0, 7, 0.1);
    { const [ex, ey] = P(cx + r * 0.75, cy + r * 0.75, 4); A.lampDot(ex - 1.2, ey, 0.6, '#3a3048', '#d8f0ff'); A.lampDot(ex + 1.2, ey, 0.6, '#3a3048', '#d8f0ff'); }
    const top = A.dome(cx, cy, r * 1.35, 8 + band * 2, 9, A.SNOW ? '#e6ecef' : '#5a6a5a');
    briar([cx + r * 0.2, cy + r + 0.12], [cx + r + 0.12, cy + r * 0.2], 11 + band * 2, { lw: 2.4 });
    hedge(cx - s * 0.3, cy + s * 0.25, 7 + band); hedge(cx + s * 0.28, cy + s * 0.2, 7);
    const [mx, my] = P(cx + s * 0.28, cy + s * 0.2, 9); A.circ(mx, my, 2.4, '#f0eef6', A.OUT); A.lampDot(mx - 0.8, my - 0.4, 0.5, '#201828', E.ng); A.lampDot(mx + 0.8, my - 0.4, 0.5, '#201828', E.ng);
    if (band >= 2) { const [lx, ly] = P(cx - s * 0.3, cy + s * 0.25, 12); A.lampDot(lx, ly, 1.2, '#6a5aa0', '#c8b8ff'); }
    return top + 3;
  };

  // ----- moon quay (inland harbor) -----
  ART.harbor = ([x, y, w, d], L, band, ctx) => {
    if (ctx && ctx.coastal) return coastHarbor([x, y, w, d], L, band, ctx);
    const cx = x + w * 0.5, cy = y + d * 0.55;
    pool(cx, cy, Math.min(w, d) * 0.4, Math.min(w, d) * 0.32, { stars: 4, moon: false });
    // a swan-necked crescent boat
    const [bx, by] = P(cx, cy);
    c.beginPath(); c.moveTo(bx - 9, by - 2); c.quadraticCurveTo(bx, by + 4, bx + 9, by - 2); c.lineTo(bx + 6, by - 3); c.quadraticCurveTo(bx, by, bx - 6, by - 3); c.closePath(); fill(E.wood); stroke(A.OUT, 0.6, A.F(A.OUT));
    c.beginPath(); c.moveTo(bx + 8, by - 2); c.quadraticCurveTo(bx + 12, by - 10, bx + 9, by - 13); stroke(E.silk, 1.6);
    A.line([bx, by - 2], [bx, by - 16], E.wood2, 1); A.poly([[bx, by - 16], [bx + 6, by - 6], [bx, by - 4]], sn(E.silk));
    const [px, py] = P(x + 0.3, y + 0.3); A.line([px, py], [px, py - 12], E.wood2, 1.4); mothPost(x + 0.35, y + 0.4, 12);
    return 20 + band * 2;
  };

  // ----- glamourweaver's spire (mage tower) -----
  ART.magetower = ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, k = L - lo(band);
    A.cyl(cx, cy, 0.5, 0, 3, E.stone, A.shade(E.stone, 0.06));
    // stacked drums, each floating free of the one beneath
    const segs = 2 + Math.min(3, band + (k >= 3 ? 1 : 0));
    let z = 3, r = 0.3;
    for (let s = 0; s < segs; s++) {
      const gap = 3 + s, hh = 13 - s * 1.2 + band;
      hover(cx, cy, r * 0.9, z, gap, 3);
      z += gap; A.cyl(cx, cy, r, z, hh, s % 2 ? E.wood : (stoneWalls() ? E.stone : E.wood), A.shade(E.wood, 0.05));
      A.twistLines(cx, cy, z, z + hh, r, A.shade(E.roof2, -0.1), 1.2, 0.05, s);
      const [wx, wy] = P(cx + r * 0.6, cy + r * 0.6, z + hh * 0.35); A.lamp([[wx - 1.3, wy], [wx + 1.3, wy], [wx + 1.3, wy - 4], [wx, wy - 5.5], [wx - 1.3, wy - 4]], E.glass, E.ng);
      A.cyl(cx, cy, r * 1.2, z + hh, 1.2, era >= 3 ? GOLD : E.metal);
      z += hh + 1.2; r *= 0.86;
    }
    // crystal crown and the orbiting magic
    const zc = z + 2;
    A.crystal(cx - 0.12, cy + 0.05, zc - 2, 10 + band * 2, 0.06, '#a888f0'); A.crystal(cx + 0.1, cy - 0.12, zc - 2, 9, 0.06, '#88c8f0');
    const top = A.crystal(cx, cy, zc - 2, 18 + band * 4, 0.1, '#c8b0ff');
    const orb = P(cx, cy, top + 8); crescent(orb[0], orb[1], 3.2, '#f0e8ff', '#ffffff');
    A.rec('magic', { x: orb[0], y: orb[1], r: 10 + band * 3 + Math.min(6, L / 3), n: 3 + band * 2 + Math.floor(L / 5), col: 'rgba(214,170,255,A)', seed: A.R(), bolt: false });
    light(orb[0], orb[1], 30 + band * 8);
    return top + 12;
  };

  // ----- the Dreamspire: an impossible twisting tower wrapped in dreamsilk -----
  ART.dreamspire = ([x, y, w, d], L, band) => {
    const cx = x + w * 0.5, cy = y + d * 0.45, k = L - lo(band);
    const H = 46 + band * 14 + k * 2;
    // anchor posts around, threads run from them up the tower
    const posts = [[x + 0.2, y + 0.25], [x + w - 0.2, y + 0.2], [x + 0.2, y + d - 0.45], [x + w - 0.25, y + d - 0.5]].slice(0, 2 + Math.min(2, band));
    const backPosts = posts.filter(([gx, gy]) => gx + gy < cx + cy), frontPosts = posts.filter(([gx, gy]) => gx + gy >= cx + cy);
    const postTop = ([gx, gy]) => { const [px, py] = P(gx, gy); A.line([px, py], [px, py - 14], E.wood2, 1.4); A.lampDot(px, py - 15, 1.3, E.accent, E.ng); return [px, py - 14]; };
    const bt = backPosts.map(postTop);
    // the loom at the foot: a spinning wheel of moonlight
    A.cyl(cx, cy, 0.55, 0, 3, E.stone, A.shade(E.stone, 0.05));
    // twisted body: stacked slices rotating, each slightly offset → a twisting, leaning tower
    const n = 9 + band * 3, sliceH = H / n;
    let topPt = null;
    for (let s = 0; s < n; s++) {
      const t = s / n, r = 0.34 * (1 - t * 0.7), off = Math.sin(t * Math.PI * 1.3) * 0.12, z = 3 + s * sliceH;
      const floatGap = band >= 2 && s === n - 2 ? 4 : 0;
      const col = s % 2 ? A.mix(E.wood, E.accent, 0.25) : E.wood;
      A.cyl(cx + off, cy - off * 0.5, r, z + floatGap, sliceH * 0.92, col, A.shade(col, 0.05));
      A.twistLines(cx + off, cy - off * 0.5, z + floatGap, z + floatGap + sliceH, r, A.shade(E.roof2, -0.05), 0.5, 0.1, s * 0.9);
      if (s % 3 === 1) { const [wx, wy] = P(cx + off + r * 0.6, cy - off * 0.5 + r * 0.6, z + sliceH * 0.3); A.lampDot(wx, wy - 1, 1.1, E.glass, E.ng); }
      topPt = [cx + off, cy - off * 0.5, z + sliceH + floatGap];
    }
    // silk wrapping: glowing spiral threads round the whole tower
    for (let q = 0; q < 2 + band; q++) A.twistLines(cx, cy, 4, H, 0.38, A.GLOW ? '#d8c8ff' : 'rgba(255,250,255,0.95)', 2.2 + q * 0.4, 0.7, q * 2.1);
    // crown: a floating crystal and a crescent
    const zc = topPt[2] + (band >= 1 ? 5 : 1);
    if (band >= 1) hover(topPt[0], topPt[1], 0.08, topPt[2], 4, 4);
    const ct = A.crystal(topPt[0], topPt[1], zc, 14 + band * 3, 0.09, '#d0b8ff');
    const cp = P(topPt[0], topPt[1], ct + 6); crescent(cp[0], cp[1], 3.6 + band * 0.4); A.rec('sparks', { x: cp[0], y: cp[1], kind: 'moon' });
    // threads from the anchor posts to the tower
    const anchorA = P(cx, cy, H * 0.55), anchorB = P(cx, cy, H * 0.8);
    for (const p of bt) { thread(p, anchorA, 5); thread(p, anchorB, 7); }
    for (const p of frontPosts.map(postTop)) { thread(p, anchorA, 5); if (band >= 2) thread(p, anchorB, 8); }
    // a spinning wheel of moonlight at the foot
    const [lx, ly] = P(x + w - 0.45, y + d - 0.55);
    A.line([lx - 4, ly], [lx, ly - 10], E.wood2, 1); A.line([lx + 4, ly], [lx, ly - 10], E.wood2, 1);
    c.beginPath(); c.ellipse(lx, ly - 12, 5, 5, 0, 0, TAU); stroke(E.wood2, 1.2); for (let q = 0; q < 4; q++) { const a = q / 4 * Math.PI; A.line([lx + Math.cos(a) * 5, ly - 12 + Math.sin(a) * 5], [lx - Math.cos(a) * 5, ly - 12 - Math.sin(a) * 5], E.wood2, 0.5); }
    thread([lx, ly - 12], anchorA, 4);
    // motes shed from the tower, lantern-moths circling
    const [mx, my] = P(cx, cy, H * 0.7);
    A.rec('sparks', { x: mx, y: my, kind: 'motes', r: 16 + band * 5, n: 7 + band * 3, h: H * 0.8 });
    light(mx, my, 44 + band * 8);
    for (let q = 0; q < 1 + band; q++) flyMoth(cx + Math.cos(q * 2.3) * 0.7, cy + Math.sin(q * 2.3) * 0.6, H * (0.4 + q * 0.12));
    return Math.max(ct + 12, H + 10);
  };

  // ----- the Moonwell Gate (wonder): a great moonstone ring rising over a star-pool -----
  ART.wonder_veil = ([x, y, w, d], L) => {
    const s = Math.min(w, d), cx = x + w / 2, cy = y + d / 2, prog = Math.min(1, L / 10);
    const R = s * 0.42 * 20 + 6;                          // ring radius in px
    const [gx, gy] = P(cx - s * 0.08, cy - s * 0.08);
    // standing stones round the well
    const n = 6;
    for (let j = 0; j < n; j++) { const a = j / n * TAU; if (Math.cos(a) + Math.sin(a) > 0) continue; const [sx, sy] = P(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42); A.poly([[sx - 2, sy], [sx + 2, sy], [sx + 1.5, sy - 9], [sx - 1.5, sy - 9]], sn(E.stone)); }
    // the ring: built up stone by stone from both feet
    const thick = 4 + s * 1.5, segs = 18, built = Math.round(segs * prog);
    for (let j = 0; j < segs; j++) {
      const side = j % 2, idx = Math.floor(j / 2); if (j >= built) continue;
      const t0 = idx / (segs / 2), t1 = (idx + 1) / (segs / 2);
      const a0 = side ? Math.PI * (0.5 + t0) : Math.PI * (0.5 - t0), a1 = side ? Math.PI * (0.5 + t1) : Math.PI * (0.5 - t1);
      const cX = gx, cY = gy - R;
      const p = (a, r) => [cX + Math.cos(a) * r, cY + Math.sin(a) * r];
      A.poly([p(a0, R), p(a1, R), p(a1, R - thick), p(a0, R - thick)], sn(j % 4 < 2 ? E.stone : A.shade(E.stone, -0.08)));
      if (j % 3 === 0) { const q = p((a0 + a1) / 2, R - thick / 2); A.lampDot(q[0], q[1], 1, E.accent, E.ng); }
    }
    if (prog >= 1) { // complete: a crescent hangs in the ring and the space within shimmers
      c.beginPath(); c.arc(gx, gy - R, R - thick, 0, TAU); c.fillStyle = A.GLOW ? 'rgba(70,50,150,0.35)' : 'rgba(200,220,255,0.28)'; c.fill();
      crescent(gx, gy - R, R * 0.35); A.rec('sparks', { x: gx, y: gy - R, kind: 'moon' }); light(gx, gy - R, R * 1.4);
      A.rec('sparks', { x: gx, y: gy - R * 0.5, kind: 'motes', r: R * 0.8, n: 10, h: R * 1.5 });
    } else { A.box(cx + s * 0.2, cy - s * 0.35, 0.25, 0.25, 0, 5, E.stone); }
    // the star-pool in front
    pool(cx + s * 0.1, cy + s * 0.12, s * 0.28, s * 0.22, { stars: 3 + Math.round(prog * 5), moon: prog >= 1 });
    for (let j = 0; j < n; j++) { const a = j / n * TAU; if (Math.cos(a) + Math.sin(a) <= 0) continue; const [sx, sy] = P(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42); A.poly([[sx - 2, sy], [sx + 2, sy], [sx + 1.5, sy - 9], [sx - 1.5, sy - 9]], sn(E.stone)); A.lampDot(sx, sy - 6, 0.8, E.accent, E.ng); }
    return (R * 2 + 4) / 1;
  };

  // ----- walls: briar hedge → bough palisade → moonstone with glass → silver -----
  ART.wall = ([x, y, w, d], L, band, ctx) => {
    const along = ctx.along, len = along ? w : d;
    const pt = (u, z, off = 0.5) => along ? P(x + u, y + d * off, z) : P(x + w * off, y + u, z);
    if (band === 0) { // briar hedge with glow-blossoms
      A.box(x, y, w, d, 0, 9, A.SNOW ? '#dfe6e8' : '#4a5a4a');
      const n = Math.max(1, Math.round(len / 0.28));
      for (let j = 0; j < n; j++) { const [hx, hy] = pt((j + 0.5) * len / n, 9); A.circ(hx, hy, 3.2, A.SNOW ? '#eef2f4' : '#56685a', A.OUT); A.line([hx - 2, hy - 1], [hx - 4, hy - 4], '#2e3a2e', 0.6); A.line([hx + 1, hy - 2], [hx + 3, hy - 5], '#2e3a2e', 0.6); if (j % 2 === 0) A.lampDot(hx + 1, hy - 0.5, 1, E.bloom, '#ffd8f6'); }
      return 12;
    }
    const H = 14 + band * 5;
    if (band === 1) { // woven bough palisade with thorned tops
      const b = A.box(x, y, w, d, 0, H, E.wood); weave(b, E.wood2);
      const n = Math.max(2, Math.round(len / 0.2));
      for (let j = 0; j <= n; j++) { const [tx, ty] = pt(j * len / n, H, 1); A.poly([[tx - 1.4, ty], [tx + 1.4, ty], [tx, ty - 5]], A.shade(E.wood2, -0.1), null); }
      return H + 5;
    }
    // moonstone with glass lancets and crescent merlons
    const b = A.box(x, y, w, d, 0, H, E.stone); A.courses(b, 4.5, A.shade(E.stone, -0.12));
    const n = Math.max(1, Math.round(len / 0.5));
    for (let j = 0; j < n; j++) {
      const u = (j + 0.5) * len / n;
      if (along) archWin(b, 'L', u, H * 0.35, 0.1, H * 0.35); else archWin(b, 'R', u, H * 0.35, 0.1, H * 0.35);
      const [mx, my] = pt(u, H, 0.6); crescent(mx, my - 3.4, 3, era >= 3 ? GOLD : A.mix(E.stone, '#ffffff', 0.3), '#f0e8ff');
    }
    if (band >= 3) { const [sx, sy] = pt(len / 2, H + 9); A.rec('sparks', { x: sx, y: sy, kind: 'star' }); }
    if (ctx.tech('fortification')) { const [gx, gy] = pt(len * 0.5, H * 0.6, 1.02); A.lampDot(gx, gy, 1.4, E.accent, E.ng); }
    return H + 6;
  };

  // ---------------------------------------------------------------
  // the shore: glass piers, moon-sail skiffs, mirror-stones and lilies; a moonlit lighthouse spire
  // (everything placed through the shore ctx — pt/at/depth — so it fits any edge)
  // ---------------------------------------------------------------
  const glassFill = () => A.GLOW ? 'rgba(150,130,230,0.55)' : 'rgba(214,232,255,0.62)';
  // a crescent-hulled skiff along the shore normal: prow toward open water at d0, stern at d1
  // winter: the water is frozen — a sheet of broken ice round the hull
  function iceRing(sc, u, d0, d1, hw) {
    const m = (d0 + d1) / 2, r = (d1 - d0) / 2 + 0.3, ring = [];
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; ring.push(P(...sc.pt(m + Math.cos(a) * r, u + Math.sin(a) * (hw + 0.28)))); }
    A.poly(ring, '#eef5f9', '#a9c2d0', 0.6);
    if (!A.GLOW) for (const k of [1, 6, 10, 13]) { const a = k / 16 * TAU; A.line(ring[k], P(...sc.pt(m + Math.cos(a) * r * 0.6, u + Math.sin(a) * (hw + 0.1))), '#c4d6e0', 0.5); }
  }
  function moonSkiff(sc, u, d0, d1, o = {}) {
    const big = !!o.big, hw = o.hw || (big ? 0.25 : 0.15), hh = big ? 7.5 : 5, len = d1 - d0;
    if (A.SNOW) { o = Object.assign({}, o, { sail: false }); iceRing(sc, u, d0, d1, hw); }
    const col = A.SNOW ? A.mix(o.col || (era >= 1 ? A.mix(E.metal, '#ffffff', 0.45) : E.wood), '#b9cad4', 0.4) : o.col || (era >= 1 ? A.mix(E.metal, '#ffffff', 0.45) : E.wood);
    const G2 = (dd, du) => sc.pt(dd, u + du);
    // a smooth crescent hull: both ends sweep up like the horns of the moon
    const m = (d0 + d1) / 2, nearS = (() => { const a = sc.pt(m, u + hw), b = sc.pt(m, u - hw); return a[0] + a[1] > b[0] + b[1] ? 1 : -1; })();
    const horn = big ? 8 : 5.5, bt = P(...G2(d0, 0), hh + horn), st2 = P(...G2(d1, 0), hh + horn * 0.8);
    const gp = (t, sg, z) => P(...G2(d0 + len * t, sg * hw), z);
    c.beginPath(); c.moveTo(bt[0], bt[1]); c.bezierCurveTo(...gp(0.2, -nearS, hh + 1), ...gp(0.8, -nearS, hh + 1), st2[0], st2[1]); c.bezierCurveTo(...gp(0.8, nearS, hh), ...gp(0.2, nearS, hh), bt[0], bt[1]); c.closePath();
    fill(A.SNOW ? A.mix(E.wood2, '#b9cad4', 0.4) : A.shade(E.wood2, -0.05)); stroke(sn(col), 1.6); stroke(A.OUT, 0.4, A.F(A.OUT));
    if (!A.GLOW) for (const t of [0.38, 0.62]) A.line(gp(t, -1, hh + 1), gp(t, 1, hh), A.shade(E.wood2, -0.3), 0.7);
    c.beginPath(); c.moveTo(bt[0], bt[1]); c.bezierCurveTo(...gp(0.18, nearS * 1.1, hh - 0.5), ...gp(0.82, nearS * 1.1, hh - 0.5), st2[0], st2[1]); c.bezierCurveTo(...gp(0.75, nearS * 0.55, -2.5), ...gp(0.25, nearS * 0.55, -2.5), bt[0], bt[1]); c.closePath();
    fill(sn(col)); stroke(A.OUT, 0.7, A.F(A.OUT));
    // a glowing rune line along the gunwale (rimed over in winter)
    c.beginPath(); c.moveTo(...gp(0.12, nearS * 0.95, hh + 1.2)); c.bezierCurveTo(...gp(0.3, nearS * 1.1, hh - 1.4), ...gp(0.7, nearS * 1.1, hh - 1.4), ...gp(0.88, nearS * 0.95, hh + 0.8));
    if (A.SNOW) { stroke('#f6fafc', 1.8); c.beginPath(); c.moveTo(...gp(0.12, nearS * 0.95, hh + 1.2)); c.bezierCurveTo(...gp(0.3, nearS * 1.1, hh - 1.4), ...gp(0.7, nearS * 1.1, hh - 1.4), ...gp(0.88, nearS * 0.95, hh + 0.8)); }
    stroke(E.accent, 0.9, E.ng);
    const gun = [[G2(d0, 0), hh + horn]];
    const prow = P(...gun[0][0], gun[0][1]);
    if (era >= 3) A.circ(prow[0], prow[1], 1.2, GOLD);
    if (o.crystal) { A.crystal(...gun[0][0], gun[0][1] - 1, 7, 0.05, '#c8b0ff'); light(prow[0], prow[1] - 4, 14); }
    if (o.mast) {
      const m = d0 + len * 0.5, mb = P(...G2(m, 0), hh), mh = big ? 32 : 19, mt = [mb[0], mb[1] - mh];
      A.line(mb, mt, era >= 3 ? GOLD : E.wood2, big ? 1.4 : 1);
      if (o.sail) { // a crescent moon-sail of dreamsilk
        const r = big ? 11 : 7, cy = mt[1] + mh * 0.42;
        c.beginPath(); c.arc(mt[0], cy, r, -Math.PI / 2, Math.PI / 2, false); c.quadraticCurveTo(mt[0] + r * 0.9, cy, mt[0], cy - r); c.closePath();
        c.fillStyle = A.GLOW ? '#b8a8f0' : sn(E.silk); c.fill(); stroke(A.OUT, 0.6, A.F(A.OUT));
        if (!A.GLOW) { c.beginPath(); c.arc(mt[0], cy, r * 0.7, -Math.PI / 2.4, Math.PI / 2.4, false); stroke(E.accent, 0.6); }
        if (A.GLOW) light(mt[0] + r * 0.5, cy, r * 2.2);
      } else A.line([mt[0] - 3, mt[1] + 5], [mt[0] + 3, mt[1] + 4], E.silk, 2);
      crescent(mt[0], mt[1] - 3, big ? 2.6 : 1.8);
    }
    if (o.lamp) { const p = P(...G2(d1 - 0.05, 0), hh + 8); A.line([p[0], p[1] + 6], [p[0], p[1]], E.wood2, 0.8); A.lampDot(p[0] + 2, p[1] + 2, 1.2, E.accent, E.ng); light(p[0] + 2, p[1] + 2, 10); }
    return hh + (o.mast ? (big ? 34 : 21) : 9);
  }
  // a glass pier: a pale translucent deck on slender crystal piles, lit studs along its edges
  function glassPier(sc, u, band, extra = 0) {
    const dd0 = sc.depth(u), e0 = dd0 + 0.4, out = Math.max(0.5, dd0 - 2.4 - extra), hw = 0.22, z0 = 2.5;
    const at = (dd, du, z) => sc.at(dd, u + du, z);
    for (let dd = out + 0.1; dd < dd0 - 0.05; dd += 0.55) for (const s of [-1, 1]) { const a = at(dd, s * hw * 0.85, z0), b = at(dd, s * hw * 0.85, -3); A.line(a, b, era >= 2 ? A.mix(E.stone, E.accent, 0.3) : E.wood2, 1.3); }
    const frame = era >= 1 ? A.mix(E.stone, '#ffffff', 0.2) : E.wood;
    A.poly([at(e0, -hw - 0.04, z0), at(e0, hw + 0.04, z0), at(out, hw + 0.04, z0), at(out, -hw - 0.04, z0)], frame);
    A.poly([at(e0, -hw + 0.04, z0), at(e0, hw - 0.04, z0), at(out + 0.06, hw - 0.04, z0), at(out + 0.06, -hw + 0.04, z0)], era >= 1 ? glassFill() : A.shade(E.wood, -0.06), null);
    if (!A.GLOW) for (let dd = out + 0.3; dd < e0; dd += 0.35) A.line(at(dd, -hw + 0.04, z0), at(dd, hw - 0.04, z0), era >= 1 ? 'rgba(255,255,255,0.7)' : A.shade(E.wood, -0.2), 0.5);
    A.line(at(out, -hw - 0.04, z0), at(out, hw + 0.04, z0), A.shade(frame, -0.35), 1);
    // lit studs along both edges; a silk rail from the second band
    for (let dd = out + 0.25; dd < dd0; dd += 0.5) for (const s of [-1, 1]) { const p = at(dd, s * (hw + 0.02), z0 + 0.5); A.lampDot(p[0], p[1], 0.7, E.accent, E.ng); }
    if (band >= 1) for (const s of [-1, 1]) { const a = at(out + 0.1, s * hw, z0 + 5), b = at(dd0, s * hw, z0 + 5); A.line(at(out + 0.1, s * hw, z0), a, E.metal, 0.7); A.line(at(dd0, s * hw, z0), b, E.metal, 0.7); thread(a, b, 2); }
    return out;
  }
  // a glass boathouse: a little vaulted hall over the water's edge on crystal piles
  function glassBoathouse(sc, u, s = 1) {
    const dd0 = sc.depth(u), a = sc.pt(dd0 - 0.7 * s, u - 0.3 * s), b = sc.pt(dd0 + 0.35, u + 0.3 * s);
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), d = Math.abs(a[1] - b[1]);
    for (const [px, py] of [[x, y + d], [x + w, y + d], [x + w, y], [x + w / 2, y + d], [x + w, y + d / 2]]) A.line(P(px, py, -2), P(px, py, 4), E.stone, 1.4);
    const h = glassHall(x, y, w, d, 10 * s, { z: 3, axis: sc.along ? 'y' : 'x', gap: 0.26, steep: 22 });
    const zt = moonFinial(x + w / 2, y + d / 2, h.zt - 1, 4, 2.2);
    return zt;
  }
  // the silk hoist: a slender moonstone arch at the quay, a crystal at its crown, dreamsilk lifting a floating crate
  function silkHoist(sc, u, band) {
    const cdd = sc.depth(u) + 0.55, [gx, gy] = sc.pt(cdd, u), H = 28 + band * 4;
    A.cyl(gx, gy, 0.12, 0, 3, E.stone);
    const base = P(gx, gy, 3), top = P(gx, gy, H), tip = sc.at(Math.max(0.6, cdd - 1.5), u, H + 2);
    A.line(base, top, sn(E.stone), 2.4); A.line([base[0] + 1, base[1]], [top[0] + 1, top[1]], A.shade(E.stone, -0.25), 0.8);
    c.beginPath(); c.moveTo(top[0], top[1]); c.quadraticCurveTo((top[0] + tip[0]) / 2, Math.min(top[1], tip[1]) - 7, tip[0], tip[1]); stroke(E.stone, 1.8);
    A.crystal(gx, gy, H, 8 + band, 0.05, '#c8b0ff'); light(top[0], top[1] - 4, 16);
    const [cx2, cy2] = sc.pt(Math.max(0.6, cdd - 1.5), u), cz = 10 + band * 2;
    thread(tip, P(cx2, cy2, cz + 4), 0, A.GLOW ? '#c8b8ff' : 'rgba(250,244,255,0.95)');
    A.box(cx2 - 0.07, cy2 - 0.07, 0.14, 0.14, cz - 3, 4, A.mix(E.wood2, E.silk, 0.3));
    const [mx, my] = P(cx2, cy2, cz - 6); A.rec('sparks', { x: mx, y: my, kind: 'motes', r: 6, n: 3, h: 10 });
    return H + 12;
  }
  function coastHarbor(slot, L, band, sc) {
    if (!L) return undefined;
    const q = [], add = (g, f) => q.push([g[0] + g[1], f]);
    const us = sc.piers.slice(), u0 = sc.u0;
    // the quay: pale boards, then moonstone with a lit edge
    const qa = us[0] - 0.35, qb = us[us.length - 1] + 0.35, qc = stoneWalls() ? E.stone : E.wood;
    for (let u = qa; u < qb - 0.01; u += 0.25) { const u1 = Math.min(qb, u + 0.25); A.poly([sc.at(sc.depth(u) - 0.15, u, 2), sc.at(sc.depth(u1) - 0.15, u1, 2), sc.at(sc.depth(u1) + 0.35, u1, 2), sc.at(sc.depth(u) + 0.35, u, 2)], sn(qc), null); }
    A.line(sc.at(sc.depth(qa) - 0.15, qa, 2), sc.at(sc.depth(qb) - 0.15, qb, 2), A.shade(qc, -0.35), 0.9);
    if (!A.GLOW) for (let u = qa + 0.25; u < qb; u += 0.5) A.line(sc.at(sc.depth(u) - 0.15, u, 2), sc.at(sc.depth(u) + 0.35, u, 2), A.shade(qc, -0.14), 0.5);
    if (band >= 1) for (let u = qa + 0.2; u < qb; u += 0.4) { const p = sc.at(sc.depth(u) - 0.12, u, 2.4); A.lampDot(p[0], p[1], 0.7, E.accent, E.ng); }
    const outs = us.map(u => [u, glassPier(sc, u, band, u === u0 && band >= 2 ? 0.3 : 0)]);
    outs.forEach(([u, out], i) => {
      const len = sc.depth(u) - out, side = i % 2 ? -0.48 : 0.48;
      // pier head: a crystal on a moonstone stub, glowing
      add(sc.pt(out + 0.1, u), () => { const [hx, hy] = sc.pt(out + 0.12, u); A.cyl(hx, hy, 0.1, 2.5, 3, E.stone); const zt = A.crystal(hx, hy, 5.5, 8 + band * 2, 0.06, i % 2 ? '#88c8f0' : '#c8b0ff'); const p = P(hx, hy, 9); light(p[0], p[1], 14); return zt; });
      if (band >= 2 && u === u0 && len > 1.6) add(sc.pt(out + 0.6, u - 0.55), () => moonSkiff(sc, u - 0.56, out + 0.05, out + Math.min(2.3, len - 0.05), { big: true, mast: true, sail: band >= 3, crystal: true, lamp: true }));
      else if (len > 0.9) add(sc.pt(out + 0.4, u + side), () => moonSkiff(sc, u + side, out + 0.1, out + Math.min(1.15, len * 0.6), { mast: i % 2 === 0, sail: L >= 8 && i % 2 === 0 }));
    });
    // moon-lilies on the still water between the piers; mirror-stones and moth posts on the quay
    for (let k = 0; k < outs.length - 1; k++) { const u = (outs[k][0] + outs[k + 1][0]) / 2, dd = sc.depth(u) - 0.7; add(sc.pt(dd, u), () => A.moonLily(...sc.pt(dd, u), 0.6)); }
    { const u = qb + 0.35; if (u < sc.b - 0.3) add(sc.pt(sc.depth(u) - 0.5, u), () => A.moonLily(...sc.pt(sc.depth(u) - 0.5, u), 0.7)); }
    if (L >= 3) { const u = qa - 0.25, dd = sc.depth(u) + 0.45; add(sc.pt(dd, u), () => A.mirrorStone(...sc.pt(dd, u), 0.85)); }
    add(sc.pt(sc.depth(u0) + 0.55, u0 - 0.36), () => mothPost(...sc.pt(sc.depth(u0) + 0.55, u0 - 0.36), 14 + band * 2));
    if (L >= 5) { const cu = u0 + 0.62; add(sc.pt(sc.depth(cu) + 0.55, cu), () => silkHoist(sc, cu, band)); }
    if (L >= 8) { const bu = us[0] - 0.55 > sc.a + 0.5 ? us[0] - 0.55 : us[us.length - 1] + 0.55; add(sc.pt(sc.depth(bu) - 0.2, bu), () => glassBoathouse(sc, bu, 1)); }
    if (L >= 15) { const bu = us[us.length - 1] + 0.55; if (bu < sc.b - 0.5) add(sc.pt(sc.depth(bu) - 0.2, bu), () => glassBoathouse(sc, bu, 1.15)); const u = qb + 0.15, dd = sc.depth(u) + 0.5; add(sc.pt(dd, u), () => A.mirrorStone(...sc.pt(dd, u), 1)); }
    { const [sx, sy] = sc.pt(sc.depth(u0) - 1.1, u0), p = P(sx, sy); A.rec('sparks', { x: p[0], y: p[1], kind: 'star' }); }
    q.sort((a, b) => a[0] - b[0]);
    let top = 24; for (const [, f] of q) { const h = f(); if (typeof h === 'number' && h > top) top = h; }
    return { top, noDress: true };
  }

  // a Veilborn tower: briar-woven (band ≤ 1) or moonstone with lancets, crescent merlons, a floating glass lantern and crystals
  function wovenDrum(cx, cy, r, z, h) {
    A.cyl(cx, cy, r, z, h, E.wood, A.shade(E.wood, 0.06));
    const [bx, by, rx, ry] = A.ell(cx, cy, z, r);
    if (!A.GLOW) for (let k = -3; k <= 3; k++) { const f = k / 3.6, yb = by + Math.sqrt(1 - f * f) * ry; A.line([bx + rx * f, yb], [bx + rx * Math.min(0.96, f + 0.25), yb - h], E.wood2, 0.6); A.line([bx + rx * f, yb], [bx + rx * Math.max(-0.96, f - 0.25), yb - h], E.wood2, 0.6); }
  }
  function lanternRoom(cx, cy, r, z, h) { // glass drum glowing violet-white at night
    const [x, y, rx] = A.ell(cx, cy, z, r);
    A.cyl(cx, cy, r, z, h, E.glass);
    A.lamp([[x - rx * 0.85, y], [x + rx * 0.85, y], [x + rx * 0.85, y - h], [x - rx * 0.85, y - h]], A.mix(E.glass, E.accent, 0.35), E.ng);
    if (!A.GLOW) for (const f of [-0.5, 0, 0.5]) A.line([x + rx * f, y + 0.5], [x + rx * f, y - h], E.metal, 0.6);
    if (!A.GLOW) A.line([x - rx * 0.6, y - h * 0.8], [x - rx * 0.4, y - h * 0.2], 'rgba(255,255,255,0.6)', 0.7);
    return [x, y - h / 2];
  }
  function veilTower(gx, gy, r, H, band, o = {}) {
    if (band <= 1) { // a woven watch-spire with an ogee hood
      A.cyl(gx, gy, r * 1.25, 0, 2, E.wood2);
      wovenDrum(gx, gy, r, 2, H - 2);
      drumWins(gx, gy, r, H * 0.5, H * 0.3, [0.1], 5);
      A.cyl(gx, gy, r * 1.3, H, 1.4, E.wood2);
      const [mx, my] = P(gx + r * 1.1, gy + r * 1.1, H - 6); A.lampDot(mx, my, 1.4, E.accent, E.ng); light(mx, my, 12);
      const zt = ogee(gx, gy, r * 1.3, H + 1.4, 16, E.roof);
      return moonFinial(gx, gy, zt, 3, 2.2);
    }
    A.cyl(gx, gy, r * 1.25, 0, 3, A.shade(E.stone, -0.06), E.stone);
    const body = H - 3;
    A.cyl(gx, gy, r, 3, body, sn(E.stone), A.shade(E.stone, 0.08));
    if (!A.GLOW) { const [x, y, rx, ry] = A.ell(gx, gy, 0, r); for (let v = 7; v < body; v += 5) { c.beginPath(); c.ellipse(x, y - 3 - v, rx, ry, 0, 0.15, Math.PI - 0.15); stroke(A.shade(E.stone, -0.14), 0.5); } }
    if (o.twist !== false) A.twistLines(gx, gy, 3, H, r, A.mix(E.accent, E.stone, 0.4), 1.2, 0, o.ph || 0);
    drumWins(gx, gy, r, H * 0.42, H * 0.25, [-0.35, 0.45], 7);
    // gallery with crescent merlons
    A.cyl(gx, gy, r * 1.28, H, 2, era >= 3 ? GOLD : E.metal);
    for (const t of [0.0, 0.8, 1.6, 2.3]) { const [mx, my] = P(gx + Math.cos(t) * r * 1.15, gy + Math.sin(t) * r * 1.15, H + 2); crescent(mx - 1, my - 2.4, 2.2, era >= 3 ? GOLD : A.mix(E.stone, '#ffffff', 0.4), '#f0e8ff'); }
    let z = H + 2;
    if (o.lantern) { // the crown floats: a glass lantern room hovering over the gallery
      const gap = 3 + band;
      hover(gx, gy, r * 0.8, z, gap, 3);
      z += gap;
      const [lx, ly] = lanternRoom(gx, gy, r * 0.78, z, 8 + band);
      light(lx, ly, 22 + band * 4);
      z += 8 + band;
      A.cyl(gx, gy, r * 0.95, z, 1.2, era >= 3 ? GOLD : E.metal);
      z += 1.2;
    }
    const zt = ogee(gx, gy, r * (o.lantern ? 0.95 : 1.2), z, 14 + band * 3, E.roof);
    // crystal crown: a cluster for corners, a single shard otherwise
    if (o.crystals) { A.crystal(gx - 0.07, gy + 0.05, zt - 3, 6 + band, 0.04, '#88c8f0'); A.crystal(gx + 0.06, gy - 0.07, zt - 3, 6 + band, 0.04, '#a888f0'); }
    const ct = A.crystal(gx, gy, zt - 2, 9 + band * 2 + (o.crystals ? 3 : 0), 0.06, '#c8b0ff');
    const tp = P(gx, gy, ct); light(tp[0], tp[1] + 4, 14);
    if (band >= 3) A.rec('sparks', { x: tp[0], y: tp[1], kind: 'star' });
    return ct + 2;
  }
  const veilWallH = band => band === 0 ? 9 : 14 + band * 5;   // matches ART.wall
  ART.walltower = (slot, L, band, ctx) => {
    const gx = ctx.gx, gy = ctx.gy, corner = !!ctx.corner, WH = veilWallH(band);
    const r = band <= 1 ? 0.2 : corner ? 0.3 : 0.25;
    const H = WH + (band <= 1 ? 12 : corner ? 16 + (band - 2) * 6 : 11);
    return { top: veilTower(gx, gy, r, H, band, { lantern: corner || band >= 3, crystals: corner, ph: gx + gy }), noDress: true };
  };
  // gates: a briar arch → woven pylons under a great briar arch → a crystal gatehouse with a glowing runic arch
  function veilGate(ctx, band, wide) {
    const { along, fixed, g0, g1 } = ctx, m = (g0 + g1) / 2, WH = veilWallH(band);
    const pt = u => along ? [u, fixed] : [fixed, u];
    const at = (u, z = 0) => P(...pt(u), z);
    if (band === 0) {
      if (wide) mothPost(...pt(g0 + 0.1), 19);
      briar(pt(g0), pt(g1), wide ? 30 : 22, { moon: wide, lw: wide ? 3.4 : 2.6 });
      if (wide) mothPost(...pt(g1 - 0.1), 19);
      else { const t = at(m, 21); A.line([t[0], t[1]], [t[0], t[1] + 3], E.metal, 0.6); A.circ(t[0], t[1] + 5.4, 2.3, A.mix(E.glass, '#ffffff', 0.15), A.OUT); A.lampDot(t[0], t[1] + 5.4, 1.5, '#f6dc8a', '#fff6d0'); moth(t[0] + 3.2, t[1] + 1.5, 0.5); light(t[0], t[1] + 5.4, 14); }
      return (wide ? 30 : 22) + 8;
    }
    if (band === 1 || !wide) {
      const pw = wide ? 0.2 : 0.14, ph = WH + (wide ? 8 : 5), stone = band >= 2;
      const pylon = u => { const [px, py] = pt(u); const b = stone ? wallBox(px - pw / 2, py - pw / 2, pw, pw, 0, ph, { stone: true }) : A.box(px - pw / 2, py - pw / 2, pw, pw, 0, ph, E.wood); if (!stone) weave(b, E.wood2); const zt = A.cone(px, py, pw * 0.7, ph, 8, E.roof); const tp = P(px, py, zt); A.lampDot(tp[0], tp[1] + 3, 1.1, E.accent, E.ng); };
      pylon(g0 - pw / 2);
      // the arch: briar early; a pointed moonstone arch with a glowing rune band later
      if (stone) {
        const a = at(g0, ph - 4), b = at(g1, ph - 4), apex = at(m, ph + (wide ? 14 : 10));
        c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(a[0] + (apex[0] - a[0]) * 0.1, apex[1], apex[0], apex[1]); c.quadraticCurveTo(b[0] - (b[0] - apex[0]) * 0.1, apex[1], b[0], b[1]); stroke(sn(E.stone), 4); stroke(E.accent, 1, E.ng);
        A.crystal(...pt(m), ph + (wide ? 14 : 10) - 1, 8 + band * 2, 0.05, '#c8b0ff'); light(apex[0], apex[1] - 3, 16);
      } else briar(pt(g0), pt(g1), ph + (wide ? 12 : 8), { moon: wide, lw: 3 });
      pylon(g1 + pw / 2);
      return ph + (wide ? 24 : 18);
    }
    // the crystal gatehouse
    const r = 0.26, H = WH + 15 + (band - 2) * 5, zb = WH - 3, bh = 11;
    const t0 = veilTower(...pt(g0 - 0.26), r, H, band, { lantern: band >= 3, crystals: band >= 3, ph: 1 });
    const bx = along ? wallBox(g0 - 0.02, fixed - 0.22, g1 - g0 + 0.04, 0.44, zb, bh, { stone: true }) : wallBox(fixed - 0.22, g0 - 0.02, 0.44, g1 - g0 + 0.04, zb, bh, { stone: true });
    const side = along ? 'L' : 'R', Lf = g1 - g0 + 0.04;
    archRow(bx, side, bh * 0.25, bh * 0.5, 0.3, 0.1);
    // the glowing pointed arch: from the road up to the bridge's underside, on the gate's outer face
    const f = along ? A.onL : A.onR, off = 0.22, fp = (u, z) => along ? P(u, fixed + off, z) : P(fixed + off, u, z);
    const q0 = fp(g0 + 0.02, 0), q1 = fp(g1 - 0.02, 0), ap = fp(m, zb + 1), k0 = fp(g0 + 0.02, zb * 0.55), k1 = fp(g1 - 0.02, zb * 0.55);
    c.beginPath(); c.moveTo(q0[0], q0[1]); c.lineTo(k0[0], k0[1]); c.quadraticCurveTo(k0[0] + (ap[0] - k0[0]) * 0.1, ap[1] + 2, ap[0], ap[1]); c.quadraticCurveTo(k1[0] - (k1[0] - ap[0]) * 0.1, ap[1] + 2, k1[0], k1[1]); c.lineTo(q1[0], q1[1]);
    stroke(sn(E.stone), 3.4); stroke(E.accent, 1, E.ng);
    for (const t of [0.2, 0.5, 0.8]) { const p = t < 0.5 ? [k0[0] + (ap[0] - k0[0]) * t * 2, k0[1] + (ap[1] - k0[1]) * Math.sqrt(t * 2)] : [ap[0] + (k1[0] - ap[0]) * (t - 0.5) * 2, ap[1] + (k1[1] - ap[1]) * Math.pow((t - 0.5) * 2, 2)]; A.lampDot(p[0], p[1], 1, E.ng, '#ffffff'); }
    // crescent merlons and a great crescent over the arch
    for (let k = 0; k < 4; k++) { const u = (k + 0.5) / 4 * Lf, p = f(bx, u, u, bh, bh)[0]; crescent(p[0] - 1, p[1] - 3, 2.4, era >= 3 ? GOLD : A.mix(E.stone, '#ffffff', 0.4), '#f0e8ff'); }
    const cp = at(m, zb + bh + 10); crescent(cp[0] - 2, cp[1], 5 + band * 0.5); light(cp[0], cp[1], 22); A.rec('sparks', { x: cp[0], y: cp[1], kind: 'moon' });
    const t1 = veilTower(...pt(g1 + 0.26), r, H, band, { lantern: band >= 3, crystals: band >= 3, ph: 2 });
    return Math.max(t0, t1, zb + bh + 16);
  }
  ART.gate = (slot, L, band, ctx) => ({ top: veilGate(ctx, band, true), noDress: true });
  ART.postern = (slot, L, band, ctx) => ({ top: veilGate(ctx, band, false), noDress: true });
  // the lighthouse: a moonstone spire on a mirror-stone islet, its glass lantern floating free, a moon-lamp within
  ART.lighthouse = ([x, y, w, d], L, band) => {
    const gx = x + w / 2, gy = y + d / 2;
    A.rock(gx - 0.1, gy + 0.15, 1.3, '#8a86a0'); A.rock(gx + 0.3, gy - 0.2, 0.9, '#9a96b0');
    A.mirrorStone(gx - 0.32, gy - 0.05, 0.7, 2);
    const r = 0.2, H = 46 + band * 8;
    A.cyl(gx, gy, 0.34, 0, 4, A.shade(E.stone, -0.06), E.stone);
    A.cyl(gx, gy, r * 1.15, 4, 3, E.stone);
    A.cyl(gx, gy, r, 7, H - 7, sn(E.stone), A.shade(E.stone, 0.08));
    A.twistLines(gx, gy, 7, H, r, A.mix(E.accent, E.stone, 0.3), 2.2, 0, 0.4);
    for (let v = 14; v < H - 6; v += 12) { const [wx, wy] = P(gx + r * 0.6, gy + r * 0.6, v); A.lamp([[wx - 1.2, wy], [wx + 1.2, wy], [wx + 1.2, wy - 3.5], [wx, wy - 5], [wx - 1.2, wy - 3.5]], E.glass, E.ng); }
    A.cyl(gx, gy, r * 1.45, H, 2, era >= 3 ? GOLD : E.metal);
    for (const t of [0.2, 1.0, 1.8, 2.6, 3.4]) { const [mx, my] = P(gx + Math.cos(t) * r * 1.3, gy + Math.sin(t) * r * 1.3, H + 2); crescent(mx - 1, my - 2.4, 2, era >= 3 ? GOLD : A.mix(E.stone, '#ffffff', 0.4), '#f0e8ff'); }
    // the floating lantern with a crescent moon-lamp inside
    const gap = 5; hover(gx, gy, r * 0.9, H + 2, gap, 5);
    const zl = H + 2 + gap, lh = 12 + band * 2;
    const [lx, ly] = lanternRoom(gx, gy, r * 0.95, zl, lh);
    c.beginPath(); c.ellipse(lx, ly, 7, 7, 0, 0, TAU); c.fillStyle = A.GLOW ? 'rgba(240,232,255,0.85)' : 'rgba(240,232,255,0.4)'; c.fill();
    crescent(lx - 1, ly, 3.4, '#f4f0ff', '#ffffff');
    A.rec('beams', { x: lx, y: ly, col: 'violet' });
    light(lx, ly, 44);
    A.cyl(gx, gy, r * 1.15, zl + lh, 1.4, era >= 3 ? GOLD : E.metal);
    const zt = ogee(gx, gy, r * 1.15, zl + lh + 1.4, 16 + band * 2, E.roof);
    const ct = A.crystal(gx, gy, zt - 2, 10 + band * 2, 0.06, '#c8b0ff');
    for (let k = 0; k < 2 + band; k++) flyMoth(gx + Math.cos(k * 2.1) * 0.6, gy + Math.sin(k * 2.1) * 0.5, H * (0.5 + k * 0.12));
    return { top: ct + 3, noDress: true };
  };

  // ---------------------------------------------------------------
  // register: bind api/ctx, then draw
  // ---------------------------------------------------------------
  for (const t of Object.keys(ART)) {
    CITYART.veil[t] = (api, slot, L, band, ctx) => {
      A = api; c = api.c; X = ctx; era = Math.max(0, Math.min(3, ctx.era | 0)); E = ERA[era];
      return ART[t](slot, L, band, ctx);
    };
  }
})();
