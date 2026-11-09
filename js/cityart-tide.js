// Building art for the tide — see the CITYART contract in js/cityart.js
//  The Tidekin build as the sea sculpts: driftwood halls on pilings over tide pools,
//  kelp thatch that becomes coral shell-tiles, sea-glass teal and at last mother-of-pearl
//  domes; nautilus-spiral towers capped with auger shells, upturned-hull roofs, nets,
//  fish-drying racks, boardwalks, coral, anchors and figureheads; a wet sheen at the
//  waterline and gulls overhead. Era 0 driftwood/kelp → 1 coral shell → 2 coral stone and
//  sea-glass → 3 nacre and gold.
'use strict';
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.tide) return;
  const TAU = Math.PI * 2;
  let A = null, c = null, X = null, E = null, era = 0;

  // ---------------------------------------------------------------
  // palette per era
  // ---------------------------------------------------------------
  const ERA = [
    { roof: '#7f8a4e', roof2: '#5f6a38', wall: '#e2d5b8', wood: '#9a8262', wood2: '#6e5a42', stone: '#bdb5a0', dome: '#c9b98e', cap: '#8a7a56', accent: '#3fa0ae', trim: '#efe4cc', glass: '#3f5a6a', tex: 'kelp' },
    { roof: '#d9785f', roof2: '#b85a44', wall: '#ece0c8', wood: '#a08a68', wood2: '#76604a', stone: '#cbc2b0', dome: '#e6b8a2', cap: '#d0705a', accent: '#3fa8b8', trim: '#f6eedc', glass: '#3f5a6a', tex: 'shell' },
    { roof: '#3f9aa8', roof2: '#2e7886', wall: '#f0dccb', wood: '#a89272', wood2: '#7a664e', stone: '#e0cfc0', dome: '#7cc6c8', cap: '#348c9a', accent: '#e0806e', trim: '#fbf3e6', glass: '#2c5a70', tex: 'glass' },
    { roof: '#dcd8ea', roof2: '#aaa6c4', wall: '#f6f0ea', wood: '#b09a7a', wood2: '#80694f', stone: '#ece4de', dome: '#efeaf4', cap: '#c8c2dc', accent: '#3fb0c0', trim: '#e6c45a', glass: '#2a4a68', tex: 'nacre' },
  ];
  const SHELL = '#f4e6dc', CORAL = ['#e8786a', '#f0a050', '#c070b8', '#f0c0b0'], PILE = '#5a4a38', ROPE = '#cdbf98';

  // ---------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------
  const P = (gx, gy, z = 0) => A.P(gx, gy, z);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const sn = col => A.SNOW ? A.mix(col, '#f3f6f9', 0.75) : col;
  const T = id => { try { return !!X.tech(id); } catch (e) { return false; } };
  const stoneAge = () => era >= 2 || T('masonry') || T('architecture');
  const warm = (x, y, r) => A.rec('lights', { x, y, r });
  function stroke(col, lw) { c.strokeStyle = A.F(col); c.lineWidth = lw; c.stroke(); }
  function fill(col) { c.fillStyle = A.F(col); c.fill(); }

  // a tide pool on the ground under a building (or a lagoon), with glints
  function pool(x, y, w, d, glint = true) {
    const q = A.quad(x, y, w, d, 0);
    A.poly(q, A.SNOW ? '#cfe0ea' : '#56aebb', 'rgba(40,70,80,0.45)', 0.7);
    if (!A.GLOW && !A.SNOW) {
      A.poly(A.quad(x + w * 0.12, y + d * 0.12, w * 0.76, d * 0.76, 0), '#6cc2cc', null);
      for (let k = 0; k < 3; k++) { const a = P(x + w * (0.2 + 0.22 * k), y + d * (0.3 + 0.18 * (k % 2))), b = P(x + w * (0.36 + 0.22 * k), y + d * (0.3 + 0.18 * (k % 2))); A.line(a, b, 'rgba(255,255,255,0.55)', 0.7); }
    }
    if (glint && !A.SNOW) { const [ex, ey] = P(x + w / 2, y + d / 2); A.rec('sparks', { x: ex, y: ey, kind: 'water', rx: (w + d) * 6, ry: (w + d) * 3 }); }
  }
  // round lagoon / pool ellipse
  function roundPool(cx, cy, r, z = 0, rim = true) {
    if (rim) { const [ex, ey, rx, ry] = A.ell(cx, cy, z, r + 0.08); c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, TAU); fill(A.SNOW ? '#e4e8ea' : E.stone); stroke(A.OUT, 0.7); }
    const [wx, wy, wrx, wry] = A.ell(cx, cy, z, r);
    c.beginPath(); c.ellipse(wx, wy + 0.5, wrx, wry, 0, 0, TAU); c.fillStyle = A.GLOW ? '#0c2a34' : A.SNOW ? '#cfe2ee' : '#3fa8b8'; c.fill();
    if (!A.GLOW) { c.beginPath(); c.ellipse(wx - wrx * 0.2, wy, wrx * 0.55, wry * 0.45, 0, 0, TAU); c.fillStyle = A.SNOW ? '#e6f2f8' : '#7fd4dc'; c.fill(); }
    return [wx, wy, wrx, wry];
  }
  // pilings: tarred posts with green weed and barnacles at the foot, cross braces in front
  function pilings(x, y, w, d, z1) {
    if (z1 <= 0.5) return;
    const nx = Math.max(2, Math.round(w / 0.45) + 1), ny = Math.max(2, Math.round(d / 0.45) + 1), pts = [];
    for (let i = 0; i < nx; i++) pts.push([x + 0.06 + (w - 0.12) * i / (nx - 1), y + d - 0.06]);
    for (let j = 0; j < ny - 1; j++) pts.push([x + w - 0.06, y + 0.06 + (d - 0.12) * j / (ny - 1)]);
    pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [px, py] of pts) {
      const a = P(px, py, 0), b = P(px, py, z1);
      A.line(a, b, PILE, 2.2);
      if (!A.GLOW) { A.line(a, P(px, py, Math.min(z1, 2.4)), '#4f7a46', 2.4); circ2(a[0] + 0.6, a[1] - 1.6, 0.5, '#e8e0d0'); }
    }
    if (z1 > 4) {
      A.line(P(x + 0.06, y + d - 0.06, 1), P(x + w - 0.06, y + d - 0.06, z1 - 0.8), PILE, 0.7);
      A.line(P(x + w - 0.06, y + 0.06, 1), P(x + w - 0.06, y + d - 0.06, z1 - 0.8), PILE, 0.7);
    }
  }
  function circ2(x, y, r, col) { A.circ(x, y, r, col); }
  // a plank deck
  function deck(x, y, w, d, z, h = 1.5, col) {
    const b = A.box(x, y, w, d, z, h, col || E.wood);
    if (!A.SNOW) for (let u = 0.18; u < w - 0.05; u += 0.18) A.line(P(x + u, y, z + h), P(x + u, y + d, z + h), A.shade(col || E.wood, -0.16), 0.5);
    return b;
  }
  // rope rail along the front edges of a deck
  function rail(x, y, w, d, z) {
    const pts = [[x, y + d], [x + w, y + d], [x + w, y]];
    for (const [px, py] of pts) A.line(P(px, py, z), P(px, py, z + 5), PILE, 1);
    for (const hh of [3, 5]) { A.line(P(x, y + d, z + hh), P(x + w, y + d, z + hh), ROPE, 0.7); A.line(P(x + w, y + d, z + hh), P(x + w, y, z + hh), ROPE, 0.7); }
  }
  // building walls: planks early, coral stone later
  function body(x, y, w, d, z, h, o = {}) {
    if (o.stone || (stoneAge() && !o.wood)) {
      const col = o.col || E.stone, b = A.box(x, y, w, d, z, h, col);
      coralCourses(b, col);
      return b;
    }
    const col = o.col || (era === 0 ? A.mix(E.wood, E.wall, 0.55) : E.wall), b = A.box(x, y, w, d, z, h, col);
    A.planks(b, A.shade(col, -0.2));
    return b;
  }
  function coralCourses(b, col) {
    A.courses(b, 3.6, A.shade(col, -0.12));
    if (A.GLOW || A.SNOW) return;
    let k = 0;   // a few shells and coral knobs set into the stone
    for (let v = 2; v < b.h - 2; v += 7.2) for (let u = 0.2 + (k % 2) * 0.15; u < b.w - 0.1; u += 0.5, k++) { const p = A.onL(b, u, u, v, v)[0]; A.circ(p[0], p[1], 0.7, k % 3 ? SHELL : CORAL[0]); }
  }
  // wet sheen near the waterline (day only)
  function sheen(b) {
    if (A.GLOW || A.SNOW) return;
    A.line(P(b.x, b.y + b.d, b.z + 1.2), P(b.x + b.w, b.y + b.d, b.z + 1.2), 'rgba(255,255,255,0.45)', 0.8);
    A.line(P(b.x + b.w, b.y + b.d, b.z + 1.2), P(b.x + b.w, b.y, b.z + 1.2), 'rgba(255,255,255,0.3)', 0.8);
  }
  // round window with a shell-white frame
  function roundWin(b, side, u, v, r = 1.5) { A.porthole(b, side, u, v, r); }
  // roof by era over a box: kelp thatch with a hanging fringe, coral shell tiles, sea-glass tiles, nacre
  function roof(b, rh, axis, o = 0.16) {
    const tex = E.tex, col = E.roof;
    const zt = A.gable(b, rh, col, axis, tex === 'kelp' ? 'thatch' : null, o);
    const q = A.gableQ(b, rh, axis, o);
    if (tex === 'kelp') {
      if (!A.SNOW) { // kelp fringe hanging off the front eave
        const n = Math.max(4, Math.round(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) / 3));
        for (let k = 0; k <= n; k++) { const p = lerp(q[0], q[1], k / n), l = 2.5 + (k * 7 % 3); A.line(p, [p[0] + (k % 2 ? 0.6 : -0.6), p[1] + l], E.roof2, 0.9); }
      }
    } else {
      A.shellScales(q, 3, A.shade(col, -0.28));
      if (tex === 'nacre') nacreSheen(q);
    }
    if (era >= 3) A.line(q[3], q[2], E.trim, 1.3);
    return zt;
  }
  // iridescent wash over a plane (day only)
  function nacreSheen(pts) {
    if (A.GLOW || A.SNOW) return;
    const xs = pts.map(p => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(255,190,220,0.30)'); g.addColorStop(0.35, 'rgba(170,240,230,0.28)'); g.addColorStop(0.7, 'rgba(200,190,255,0.30)'); g.addColorStop(1, 'rgba(255,230,200,0.25)');
    A.path(pts); c.fillStyle = g; c.fill();
  }
  // a scallop-ribbed dome: kelp-thatch, coral, sea-glass or mother-of-pearl by era
  function shellDome(cx, cy, r, z, h, col) {
    col = col || E.dome;
    const top = A.dome(cx, cy, r, z, h, col);
    const [x, y, rx, ry] = A.ell(cx, cy, z, r);
    if (!A.SNOW) for (let k = 1; k < 8; k++) { const a = k / 8 * Math.PI; A.line([x, y - h], [x - Math.cos(a) * rx, y + Math.sin(a) * ry], A.shade(col, -0.25), 0.6); }
    if (era >= 3 && !A.GLOW && !A.SNOW) {
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.ellipse(x, y, rx, Math.max(ry, h), 0, Math.PI, TAU); c.closePath();
      const g = c.createLinearGradient(x - rx, y - h, x + rx, y);
      g.addColorStop(0, 'rgba(255,190,225,0.35)'); g.addColorStop(0.4, 'rgba(160,240,230,0.3)'); g.addColorStop(0.75, 'rgba(195,185,255,0.35)'); g.addColorStop(1, 'rgba(255,240,210,0.2)');
      c.fillStyle = g; c.fill();
    }
    return top;
  }
  // a pearl on a gold stalk, glinting
  function pearlTip(x, y, r = 1.8) {
    A.line([x, y], [x, y - 4], '#d9b44a', 1);
    A.lampDot(x, y - 4 - r, r, '#f6f2ff', '#fff6e4');
    if (!A.GLOW) A.circ(x - r * 0.35, y - 4 - r * 1.35, r * 0.35, '#ffffff');
    A.rec('sparks', { x, y: y - 4 - r, kind: 'star' });
  }
  // nautilus-spiral tower: a cream drum wound with a russet spiral, auger-shell cap
  function spiralTower(cx, cy, r, z, h, o = {}) {
    const col = o.col || (era >= 3 ? '#f4eef0' : era >= 2 ? '#f8ece0' : '#efe2cc');
    A.cyl(cx, cy, r * 1.25, z, 3, E.stone);
    A.cyl(cx, cy, r, z + 3, h - 3, col);
    for (let k = 0; k < 2; k++) A.twistLines(cx, cy, z + 3, z + h, r, k ? A.shade('#c0704a', 0.2) : '#b8603e', 2.2, 0.06, k * Math.PI);
    // windows following the spiral
    for (let v = 10, k = 0; v < h - 6; v += 9, k++) { const a = 0.6 + (k % 2) * 0.5; const [wx, wy] = P(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95, z + v); A.lampDot(wx, wy, 1.3, E.glass, '#ffd27a'); }
    let zt = z + h;
    if (o.gallery !== false) { A.cyl(cx, cy, r * 1.35, zt, 2, E.wood); rail2(cx, cy, r * 1.35, zt + 2); }
    const capH = o.capH || r * 30;
    const tip = A.cone(cx, cy, r * 1.12, zt + 2, capH, o.capCol || E.cap);
    if (!A.SNOW) A.twistLines(cx, cy, zt + 2, tip, r * 1.12, A.shade(o.capCol || E.cap, -0.3), 3.2, 0.95);
    if (era >= 3 && !A.GLOW && !A.SNOW) { const [x0, y0, rx] = A.ell(cx, cy, zt + 2, r * 1.12); c.beginPath(); c.moveTo(x0 - rx, y0); c.lineTo(x0, y0 - capH); c.lineTo(x0 + rx, y0); c.closePath(); const g = c.createLinearGradient(x0 - rx, 0, x0 + rx, 0); g.addColorStop(0, 'rgba(255,200,230,0.35)'); g.addColorStop(0.5, 'rgba(170,240,230,0.3)'); g.addColorStop(1, 'rgba(200,190,255,0.35)'); c.fillStyle = g; c.fill(); }
    return tip;
  }
  function rail2(cx, cy, r, z) { const [x, y, rx, ry] = A.ell(cx, cy, z, r); c.beginPath(); c.ellipse(x, y - 2.5, rx, ry, 0, 0, Math.PI); stroke(ROPE, 0.7); for (const f of [-0.8, -0.3, 0.3, 0.8]) A.line([x + rx * f, y + ry * Math.sqrt(1 - f * f)], [x + rx * f, y + ry * Math.sqrt(1 - f * f) - 2.5], PILE, 0.7); }
  // a nautilus shell ornament in screen space
  function nautilus(x, y, s, col = SHELL) {
    c.beginPath();
    for (let i = 0; i <= 40; i++) { const t = i / 40 * 3.2 * Math.PI, rr = s * Math.exp(0.19 * (t - 3.2 * Math.PI)); const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
    c.closePath(); fill(col); stroke(A.OUT, 0.6);
    if (!A.GLOW) for (let k = 1; k < 6; k++) { const t = 3.2 * Math.PI - k * 0.9, rr = s * Math.exp(0.19 * (t - 3.2 * Math.PI)); A.line([x, y], [x + Math.cos(t) * rr, y + Math.sin(t) * rr], '#c0704a', 0.5); }
  }
  // branching coral
  function coral(gx, gy, z, s = 1, col) {
    col = A.SNOW ? '#e8eef2' : col || CORAL[Math.floor(A.R() * 3)];
    const [x, y] = P(gx, gy, z);
    const br = (x0, y0, a, l, dpt) => { const x1 = x0 + Math.cos(a) * l, y1 = y0 + Math.sin(a) * l; A.line([x0, y0], [x1, y1], col, 1.6 * s - dpt * 0.3); if (dpt < 2) { br(x1, y1, a - 0.5, l * 0.7, dpt + 1); br(x1, y1, a + 0.45, l * 0.65, dpt + 1); } else A.circ(x1, y1, 0.8 * s, col); };
    br(x, y, -Math.PI / 2, 4.5 * s, 0);
  }
  // anchor glyph
  function anchor(x, y, s = 1, col = '#4a4e56') {
    A.line([x, y - 7 * s], [x, y + 1 * s], col, 1.3 * s); A.line([x - 2.5 * s, y - 5 * s], [x + 2.5 * s, y - 5 * s], col, 1.1 * s);
    c.beginPath(); c.arc(x, y - 2 * s, 3.2 * s, 0.2, Math.PI - 0.2); stroke(col, 1.2 * s); A.circ(x, y - 8 * s, 1.1 * s, null, col);
  }
  // fish drying rack
  function fishRack(gx, gy, alongX = true, n = 4) {
    const a = alongX ? [gx - 0.3, gy] : [gx, gy - 0.3], b = alongX ? [gx + 0.3, gy] : [gx, gy + 0.3];
    A.line(P(...a), P(...a, 11), PILE, 1.2); A.line(P(...b), P(...b, 11), PILE, 1.2); A.line(P(...a, 10.5), P(...b, 10.5), PILE, 1);
    for (let k = 0; k < n; k++) { const [fx, fy] = lerp(P(...a, 10.5), P(...b, 10.5), (k + 0.5) / n); A.line([fx, fy], [fx, fy + 1.5], ROPE, 0.5); A.poly([[fx - 0.9, fy + 1.5], [fx + 0.9, fy + 1.5], [fx + 0.5, fy + 5.5], [fx, fy + 6.5], [fx - 0.5, fy + 5.5]], k % 2 ? '#a8b8bc' : '#c8a878', null); }
  }
  function buoy(gx, gy, col = '#d8503a') { const [x, y] = P(gx, gy); c.beginPath(); c.ellipse(x, y - 2, 2.2, 2.6, 0, 0, TAU); fill(col); stroke(A.OUT, 0.6); A.line([x - 2.1, y - 2], [x + 2.1, y - 2], '#f4ece0', 1); }
  // a little rowboat
  function boat(gx, gy, len = 0.6, alongX = true, col = '#a86a44', z = 0) {
    const a = alongX ? P(gx - len / 2, gy, z) : P(gx, gy - len / 2, z), b = alongX ? P(gx + len / 2, gy, z) : P(gx, gy + len / 2, z);
    const m = lerp(a, b, 0.5), nx = (b[1] - a[1]) * 0.18, ny = -(b[0] - a[0]) * 0.18;
    if (A.SNOW) { // the water is frozen: iced in, a ring of broken ice, a frosted hull, rime on the gunwale
      const rx = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 5;
      c.beginPath(); c.ellipse(m[0], m[1] + 0.5, rx, rx * 0.4, 0, 0, TAU); fill('#eef5f9'); stroke('#a9c2d0', 0.6);
      if (!A.GLOW) for (const t of [0.7, 2.2, 3.6, 5.1]) A.line([m[0] + Math.cos(t) * rx, m[1] + 0.5 + Math.sin(t) * rx * 0.4], [m[0] + Math.cos(t) * rx * 0.6, m[1] + 0.5 + Math.sin(t) * rx * 0.24], '#c4d6e0', 0.5);
      col = A.mix(col, '#b9cad4', 0.4);
    }
    A.poly([[a[0], a[1] - 2.5], [m[0] - nx * 0.4, m[1] - ny * 0.4 + 1.2], [b[0], b[1] - 2.5], [m[0] + nx * 0.3, m[1] + ny * 0.3 - 2.4]], col);
    A.line([a[0], a[1] - 2.5], [b[0], b[1] - 2.5], A.SNOW ? '#f6fafc' : '#f4ece0', A.SNOW ? 1.8 : 0.7);
  }
  // a gull standing on a ridge
  function gull(x, y) { if (A.GLOW) return; A.circ(x, y - 1.5, 1.4, '#fbfbf8', 'rgba(60,60,60,0.5)'); A.line([x + 1.2, y - 1.8], [x + 2.4, y - 1.6], '#e8a03a', 0.7); A.line([x - 1.4, y - 1.4], [x - 2.6, y - 2.2], '#6a6e76', 0.9); }
  function gulls(x, y, r = 22, n = 2) { A.rec('birds', { x, y, r, n, seed: A.R() }); }
  // an upturned-hull roof (a boat keel-up), ridge along axis
  function hullRoof(x, y, w, d, zb, rh, axis = 'x', col) {
    col = sn(col || (era >= 2 ? E.roof : '#8a6a48'));
    const n = 8, m = 6, alongX = axis === 'x';
    const r = (alongX ? d : w) / 2 + 0.07, xc = x + w / 2, yc = y + d / 2;
    const u0 = (alongX ? x : y) - 0.16, u1 = (alongX ? x + w : y + d) + 0.2, U = u1 - u0;
    // the hull narrows toward bow and stern and is keel-sharp on top
    const taper = u => 0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, Math.max(0, (u - u0) / U)));
    const pt = (u, a) => { const rr = r * taper(u), zz = zb + rh * Math.pow(Math.sin(a), 0.7) * (0.85 + 0.15 * taper(u)); return alongX ? P(u, yc + rr * Math.cos(a), zz) : P(xc + rr * Math.cos(a), u, zz); };
    for (let i = n - 1; i >= 0; i--) {
      const a0 = i / n * Math.PI, a1 = (i + 1) / n * Math.PI;
      const lit = alongX ? 0.14 * Math.sin((a0 + a1) / 2) - 0.12 * (a0 >= Math.PI / 2) : -0.04 - 0.16 * (a0 >= Math.PI / 2);
      const fc = A.shade(col, lit);
      for (let j = 0; j < m; j++) { const ua = u0 + U * j / m, ub = u0 + U * (j + 1) / m; A.poly([pt(ua, a0), pt(ub, a0), pt(ub, a1), pt(ua, a1)], fc, null); }
      if (!A.SNOW) { c.beginPath(); for (let j = 0; j <= m; j++) { const p = pt(u0 + U * j / m, a0); if (j) c.lineTo(...p); else c.moveTo(...p); } stroke(A.shade(col, -0.32), 0.55); }
    }
    // the stern transom at the visible end
    const cap = []; for (let i = 0; i <= n; i++) cap.push(pt(u1, i / n * Math.PI));
    A.poly(cap, A.shade(col, -0.24));
    c.beginPath(); for (let j = 0; j <= m; j++) { const p = pt(u0 + U * j / m, Math.PI / 2); if (j) c.lineTo(...p); else c.moveTo(...p); } stroke(A.shade(col, -0.5), 1.8);   // keel
    const k1 = pt(u1, Math.PI / 2); A.line(k1, [k1[0] + (alongX ? 3 : -3), k1[1] - 3], A.shade(col, -0.5), 1.6);   // sternpost
    return zb + rh;
  }
  // a thin stove pipe with a little cap and house smoke
  function pipe(gx, gy, z, h, kind = 'house') {
    A.cyl(gx, gy, 0.05, z, h, '#5a5550', '#3a3634');
    A.cyl(gx, gy, 0.08, z + h, 1.2, '#4a4642');
    const [px, py] = P(gx, gy, z + h + 2); A.rec('smoke', { x: px, y: py, kind, seed: A.R() });
  }
  // a small hull (boat) seen from the side, along axis: [x,y] start, len, depth
  function shipHull(gx, gy, len, beam, z, hh, alongX = true, col = '#8a5a3a', ribsOnly = 0) {
    const pts = [];
    const P2 = (u, v, zz) => alongX ? P(gx + u, gy + v, zz) : P(gx + v, gy + u, zz);
    // side outline: deck line and curved bottom (front side)
    for (let i = 0; i <= 10; i++) { const t = i / 10, u = t * len, sh = Math.sin(t * Math.PI); pts.push(P2(u, beam / 2 + beam * 0.5 * sh * 0.0 + (alongX ? beam / 2 : beam / 2) * 0, z + hh - hh * 0.95 * sh)); }
    if (ribsOnly) {
      for (let i = 1; i < 10; i++) { const t = i / 10, u = t * len, sh = Math.sin(t * Math.PI); A.line(P2(u, beam * 0.5 * sh, z + hh), P2(u, beam * 0.5 * sh, z + hh - hh * 0.95 * sh), '#c8a878', 1.2); A.line(P2(u, -beam * 0.5 * sh, z + hh), P2(u, 0, z + hh - hh * 0.95 * sh), '#a88858', 1); }
      A.line(P2(0, 0, z + hh * 1.15), P2(len, 0, z + hh * 1.2), '#7a5a3a', 1.8);
      c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(...p) : c.moveTo(...p)); stroke('#6a4a30', 1.6);
      return z + hh * 1.2;
    }
    const top = []; for (let i = 0; i <= 10; i++) { const t = i / 10, u = t * len, sh = Math.sin(t * Math.PI); top.push(P2(u, beam * 0.5 * sh, z + hh)); }
    const topB = []; for (let i = 10; i >= 0; i--) { const t = i / 10, u = t * len, sh = Math.sin(t * Math.PI); topB.push(P2(u, -beam * 0.5 * sh, z + hh)); }
    A.poly(top.concat(topB), A.SNOW ? '#f2f7fa' : A.shade(col, 0.25));
    const bot = []; for (let i = 0; i <= 10; i++) { const t = i / 10, u = t * len, sh = Math.sin(t * Math.PI); bot.push(P2(u, beam * 0.25 * sh, z + hh - hh * 0.95 * Math.pow(sh, 0.6))); }
    A.poly(top.concat(bot.reverse()), col);
    if (!A.SNOW) for (let k = 1; k < 3; k++) { c.beginPath(); for (let i = 0; i <= 10; i++) { const t = i / 10, sh = Math.sin(t * Math.PI), p = P2(t * len, beam * 0.5 * sh - beam * 0.12 * k * sh, z + hh - hh * 0.3 * k * Math.pow(sh, 0.6)); if (i) c.lineTo(...p); else c.moveTo(...p); } stroke(A.shade(col, -0.3), 0.5); }
    return z + hh;
  }
  // stripe awning / sail cloth over a stall
  function awning(gx, gy, w, d, z, colA, colB = '#f4ece0') {
    const q = [P(gx, gy + d, z), P(gx + w, gy + d, z), P(gx + w, gy, z + 4), P(gx, gy, z + 4)];
    A.poly(q, colB);
    for (let k = 0; k < 6; k += 2) A.poly([lerp(q[0], q[1], k / 6), lerp(q[0], q[1], (k + 1) / 6), lerp(q[3], q[2], (k + 1) / 6), lerp(q[3], q[2], k / 6)], colA, null);
    for (let k = 0; k <= 6; k++) { const p = lerp(q[0], q[1], k / 6); c.beginPath(); c.arc(p[0] + 1.2, p[1], 1.2, 0, Math.PI); fill(k % 2 ? colB : colA); }
  }
  // a lit lantern on a post
  function postLantern(gx, gy, h = 12) { const [x, y] = P(gx, gy); A.line([x, y], [x, y - h], PILE, 1); A.line([x, y - h], [x + 3, y - h], PILE, 0.8); A.lantern(x + 3, y - h + 4.5, 1.4); }
  // figurehead: a carved sea-maiden prow sticking out of a gable end
  function figurehead(x, y, s = 1, flip = 1) {
    A.poly([[x, y], [x + 7 * s * flip, y - 3 * s], [x + 9 * s * flip, y - 6 * s], [x + 6 * s * flip, y - 8 * s], [x + 2 * s * flip, y - 5 * s]], era >= 3 ? '#e6c45a' : '#c8a070');
    A.circ(x + 8 * s * flip, y - 8 * s, 1.8 * s, era >= 3 ? '#f0d478' : '#d8b080', A.OUT);
    A.line([x + 8 * s * flip, y - 9.5 * s], [x + 5 * s * flip, y - 10 * s], E.roof2, 1.1 * s);
  }
  // a simple stilt house: deck on pilings + body + roof. returns {b, top}
  function stiltHouse(x, y, w, d, z, h, axis, o = {}) {
    pilings(x, y, w, d, z);
    if (z > 0.5) deck(x - 0.08, y - 0.08, w + 0.16, d + 0.16, z, 1.4);
    const b = body(x, y, w, d, z + (z > 0.5 ? 1.4 : 0), h, o);
    sheen(b);
    A.door(b, 'L', w * (o.du || 0.5), 0.24, Math.min(8, h * 0.62), E.glass === '#3f5a6a' ? '#3e5a6a' : '#355a6a');
    const nR = Math.max(1, Math.round(d / 0.55)); for (let i = 0; i < nR; i++) roundWin(b, 'R', d * (i + 0.5) / nR, h * 0.55, 1.4);
    if (w > 0.9) for (const f of [0.2, 0.8]) roundWin(b, 'L', w * f, h * 0.58, 1.2);
    let top = o.dome ? b.z + b.h : roof(b, (axis === 'x' ? d : w) * (o.rh || 11), axis);
    if (o.dome) top = shellDome(x + w / 2, y + d / 2, Math.min(w, d) * 0.55, b.z + b.h, Math.min(w, d) * 18, o.domeCol);
    return { b, top };
  }
  const wrap = fn => (api, slot, L, band, ctx) => {
    A = api; c = api.c; X = ctx; era = Math.max(0, Math.min(3, ctx.era | 0)); E = ERA[era];
    return fn(slot, L, band, ctx);
  };
  const B = CITYART.tide;

  // =================================================================
  //  TOWN HALL — the Admiralty: a net-hung longhall on pilings, then a
  //  nautilus watchtower, a coral rotunda, and at last a pearl-domed palace
  // =================================================================
  B.townhall = wrap(([x, y, w, d], L, band) => {
    let top = 0;
    const lv = L - [1, 5, 10, 15][band];
    // tide pool under the front of the hall
    pool(x + 0.25, y + 0.35, w - 0.55, d - 0.9);
    if (band === 0) {
      fishRack(x + 0.45, y + 0.35, true, 3);
      const h = stiltHouse(x + 0.55, y + 0.75, 1.75, 1.15, 5, 12 + lv, 'x', { rh: 13, wood: true });
      top = h.top;
      // a round shell-hut annex with a conch roof
      pilings(x + 2.05, y + 0.45, 0.6, 0.6, 4); deck(x + 2.0, y + 0.4, 0.7, 0.7, 4, 1.2);
      A.cyl(x + 2.35, y + 0.75, 0.28, 5.2, 9, A.mix(E.wood, E.wall, 0.55));
      const tp = A.cone(x + 2.35, y + 0.75, 0.34, 14.2, 13, E.roof); if (!A.SNOW) A.twistLines(x + 2.35, y + 0.75, 14.2, tp, 0.34, E.roof2, 2.5, 0.95);
      A.netRack(x + 0.45, y + 2.45, true);
      // conch horn on a post — the Admiralty's call
      const [hx, hy] = P(x + 2.45, y + 2.3); A.line([hx, hy], [hx, hy - 15], PILE, 1.3); nautilus(hx + 1, hy - 17, 3.6);
      if (lv >= 2) A.flagpole(x + 2.6, y + 1.9, 0, 26);
      if (lv >= 3) { boat(x + 1.2, y + 2.55, 0.7, true); }
      gulls(...P(x + 1.4, y + 1.3, top + 12), 18, 2);
      return top;
    }
    if (band === 1) {
      // nautilus watchtower at the back
      top = spiralTower(x + 2.25, y + 0.55, 0.3, 0, 38 + lv * 2.5, { capH: 14 });
      pilings(x + 0.3, y + 0.5, 2.0, 1.7, 5); deck(x + 0.25, y + 0.45, 2.1, 1.8, 5, 1.4);
      const b = body(x + 0.45, y + 0.6, 1.75, 1.3, 6.4, 15, {});
      sheen(b); A.door(b, 'L', 0.875, 0.3, 9); for (const u of [0.3, 1.45]) roundWin(b, 'L', u, 9, 1.5); for (const u of [0.35, 0.95]) roundWin(b, 'R', u, 9, 1.5);
      const zt = roof(b, 14, 'x');
      const [ex, ey] = P(x + 2.36, y + 1.25, b.z + b.h + 2); nautilus(ex, ey, 2.8);
      gull(...P(x + 1.0, y + 1.25, zt));
      rail(x + 0.25, y + 0.45, 2.1, 1.8, 6.4);
      fishRack(x + 0.3, y + 2.45, true, 4); A.netRack(x + 1.15, y + 2.55, true);
      A.flagpole(x + 2.65, y + 2.55, 0, 30);
      if (lv >= 2) pipe(x + 0.85, y + 0.8, b.z + b.h + 4, 10, 'hall');
      if (lv >= 3) postLantern(x + 2.0, y + 2.6, 12);
      gulls(...P(x + 2.25, y + 0.55, top + 8), 22, 3);
      return Math.max(top, zt);
    }
    // band 2+: coral-stone admiralty with a rotunda
    const big = band >= 3;
    if (big) { top = spiralTower(x + 0.35, y + 0.4, 0.26, 0, 52 + lv * 2, { capH: 16 }); }
    top = Math.max(top, spiralTower(x + 2.35, y + 0.4, 0.3, 0, (big ? 64 : 50) + lv * 2.5, { capH: 18 }));
    // the rotunda behind the hall
    const rcx = x + 1.45, rcy = y + 0.85, rr = big ? 0.62 : 0.5;
    A.cyl(rcx, rcy, rr + 0.08, 0, 3, E.stone);
    A.cyl(rcx, rcy, rr, 3, big ? 24 : 18, stoneAge() ? E.stone : E.wall);
    { const [x0, y0, rx, ry] = A.ell(rcx, rcy, 3, rr); for (const f of [-0.75, -0.4, 0, 0.4, 0.75]) { const yy = y0 + ry * Math.sqrt(1 - f * f); A.line([x0 + rx * f, yy], [x0 + rx * f, yy - (big ? 24 : 18)], A.shade(E.stone, -0.18), 1.4); A.lampDot(x0 + rx * f + rx * 0.18, yy - (big ? 14 : 11), 1.3, E.glass, '#ffd27a'); } }
    let dz = 3 + (big ? 24 : 18);
    A.cyl(rcx, rcy, rr + 0.06, dz, 2, E.trim);
    const dt = shellDome(rcx, rcy, rr + 0.04, dz + 2, big ? 30 : 22);
    { const [px, py] = P(rcx, rcy, dt); pearlTip(px, py, big ? 2.4 : 1.9); }
    top = Math.max(top, dt + 8);
    // the front hall on a coral plinth, with an arcade over the water
    A.box(x + 0.3, y + 1.35, 2.2, 1.0, 0, 4, E.stone);
    const b = body(x + 0.4, y + 1.45, 2.0, 0.8, 4, 16, {});
    for (const u of [0.3, 0.7, 1.3, 1.7]) roundWin(b, 'L', u, 9, 1.6);
    roundWin(b, 'R', 0.4, 9, 1.6);
    const zt = roof(b, 11, 'x');
    // arcade: coral columns in front of the hall
    for (let k = 0; k <= 4; k++) { const gx = x + 0.4 + k * 0.5; A.cyl(gx, y + 2.38, 0.06, 4, 13, E.trim); }
    A.box(x + 0.34, y + 2.28, 2.12, 0.2, 17, 2, E.trim);
    A.door(b, 'L', 1.0, 0.36, 10);
    { const [ex, ey] = P(x + 2.52, y + 1.85, 4 + 16 + 4); figurehead(ex, ey, big ? 1.2 : 1, 1); }
    { const [sx, sy] = P(x + 1.4, y + 2.25, 4 + 16 + 4); nautilus(sx, sy, 3.2); }
    gull(...P(x + 0.9, y + 1.85, zt)); gull(...P(x + 1.9, y + 1.85, zt));
    // anchors flanking the steps
    for (const u of [0.25, 2.55]) { const [ax, ay] = P(x + u, y + 2.62); anchor(ax, ay, 1.2); }
    if (big) { A.banner(x + 2.75, y + 2.75, 0, 34, E.accent); A.banner(x + 0.15, y + 2.75, 0, 30, ERA[1].roof); }
    else A.flagpole(x + 2.7, y + 2.6, 0, 32);
    if (lv >= 2 || big) for (const u of [0.95, 1.85]) postLantern(x + u, y + 2.7, 11);
    if (big && lv >= 2) { coral(x + 0.15, y + 1.5, 0, 1.1); coral(x + 2.7, y + 1.3, 0, 1.0); }
    gulls(...P(x + 1.4, y + 1.0, top), 30, 3 + band);
    return Math.max(top, zt);
  });

  // =================================================================
  //  COTTAGES — fisher homes on stilts, three kinds by index:
  //  gabled stilt hut, conch-roofed round hut, and the upturned-boat house
  // =================================================================
  B.cottage = wrap(([x, y], L, band, ctx) => {
    const i = ctx.i || 0, s = [0.95, 1.1, 1.2, 1.25][band], kind = i % 3;
    const z = [3, 4, 5, 6][band];
    pool(x - 0.02, y + 0.05, s * 0.95, s * 0.95);
    if (kind === 1) { // round shell hut with a conch-spiral roof
      const cx = x + s / 2, cy = y + s / 2, r = s * (0.32 + band * 0.02);
      pilings(cx - r, cy - r, r * 2, r * 2, z);
      A.cyl(cx, cy, r + 0.1, z, 1.3, E.wood);
      const hh = 9 + band * 2;
      A.cyl(cx, cy, r, z + 1.3, hh, stoneAge() ? E.stone : A.mix(E.wood, E.wall, 0.6));
      const [x0, y0, rx, ry] = A.ell(cx, cy, z + 1.3, r);
      A.poly([[x0 - 2, y0 + ry], [x0 + 2, y0 + ry], [x0 + 2, y0 + ry - 6.5], [x0, y0 + ry - 8], [x0 - 2, y0 + ry - 6.5]], '#3e5a6a', null);
      A.lampDot(x0 + rx * 0.62, y0 + ry * 0.5 - hh * 0.55, 1.4, E.glass, '#ffd27a');
      let top;
      if (band >= 2 && era >= 2) { top = shellDome(cx, cy, r * 1.12, z + 1.3 + hh, 11 + band); }
      else { top = A.cone(cx, cy, r * 1.3, z + 1.3 + hh, 13 + band * 2, E.roof); if (!A.SNOW) A.twistLines(cx, cy, z + 1.3 + hh, top, r * 1.3, E.roof2, 2.6, 0.95); }
      if (band >= 3) { const [px, py] = P(cx, cy, top); pearlTip(px, py, 1.4); top += 7; }
      if (band >= 1) fishRack(x + s * 0.9, y + s * 0.95, false, 3);
      return top + 2;
    }
    if (kind === 2) { // the upturned-boat house: a hull for a roof
      const w = s * 0.82, d = s * 0.62, bx = x + 0.08, by = y + 0.15;
      pilings(bx, by, w, d, z); deck(bx - 0.06, by - 0.06, w + 0.12, d + 0.12, z, 1.3);
      const b = body(bx, by, w, d, z + 1.3, 6 + band * 2, { wood: band < 2 });
      sheen(b); A.door(b, 'L', w * 0.35, 0.22, Math.min(7, b.h * 0.85)); roundWin(b, 'L', w * 0.75, b.h * 0.5, 1.2); roundWin(b, 'R', d * 0.5, b.h * 0.5, 1.2);
      let top = hullRoof(bx, by, w, d, b.z + b.h, 9 + band * 1.5, 'x', band >= 2 ? E.roof : '#8a6a48');
      if (band >= 1) { const [ex, ey] = P(bx + w + 0.14, by + d / 2, b.z + b.h + 4); figurehead(ex, ey, 0.6 + band * 0.1, 1); }
      if (band >= 2) pipe(bx + w * 0.3, by + d * 0.3, top - 4, 7);
      if (band >= 3) { const [px, py] = P(bx + w * 0.5, by + d / 2, top); gull(px, py); }
      A.netRack(x + s * 0.95, y + s * 0.9, false);
      return top + 3;
    }
    // gabled stilt hut, gaining a storey and a pearl cupola
    const w = s * 0.86, d = s * 0.72, bx = x + 0.06, by = y + 0.1, ax = i % 2 ? 'x' : 'y';
    const h = stiltHouse(bx, by, w, d, z, [9, 11, 14, 15][band], ax, { rh: 12, wood: band === 0 });
    let top = h.top;
    if (band >= 1) pipe(bx + w * 0.72, by + d * 0.3, h.b.z + h.b.h + 2, 8);
    if (band >= 1 && i % 2 === 0) netHang(h.b);
    if (band >= 3) { const cz = top - 3; A.cyl(bx + w / 2, by + d / 2, 0.12, cz, 4, E.trim); top = shellDome(bx + w / 2, by + d / 2, 0.16, cz + 4, 5); const [px, py] = P(bx + w / 2, by + d / 2, top); pearlTip(px, py, 1.2); top += 6; }
    else if (band >= 1) { const g = ax === 'x' ? P(bx + w + 0.16, by + d / 2, top) : P(bx + w / 2, by + d + 0.16, top); gull(g[0], g[1]); }
    return top + 2;
  });
  function netHang(b) { // a net drying down the right wall
    const q = [P(b.x + b.w + 0.03, b.y + 0.08, b.z + b.h * 0.9), P(b.x + b.w + 0.03, b.y + b.d * 0.6, b.z + b.h * 0.9), P(b.x + b.w + 0.05, b.y + b.d * 0.6, b.z + 1), P(b.x + b.w + 0.05, b.y + 0.08, b.z + 1)];
    for (let k = 0; k <= 4; k++) { const t = k / 4; A.line(lerp(q[0], q[1], t), lerp(q[3], q[2], t), ROPE, 0.5); A.line(lerp(q[0], q[3], t), lerp(q[1], q[2], t), ROPE, 0.5); }
    A.circ(...lerp(q[2], q[3], 0.5), 1.1, '#e0a040');
  }

  // =================================================================
  //  PEARL BEDS — terraced lagoons stepping down to the sea, open oysters
  //  glinting with pearls, divers, a sorting pavilion on stilts
  // =================================================================
  B.pearlbeds = wrap(([x, y, w, d], L, band) => {
    const n = 1 + Math.min(3, band), lv = L - [1, 5, 10, 15][band];
    let top = 10;
    // terraces: back-high to front-low, each a stone-rimmed lagoon
    const terr = [[x + 0.15, y + 0.15, 0.95, 0.8, 9], [x + 1.0, y + 0.3, 0.8, 0.9, 6], [x + 0.2, y + 1.0, 0.85, 0.75, 3.5], [x + 0.95, y + 1.15, 0.85, 0.65, 1]].slice(0, n);
    if (band >= 1) { // pavilion where the pearls are sorted (back corner)
      const px = x + 1.2, py = y + 0.08;
      pilings(px, py, 0.6, 0.5, 10); deck(px - 0.04, py - 0.04, 0.68, 0.58, 10, 1.2);
      for (const [gx, gy] of [[px + 0.05, py + 0.45], [px + 0.55, py + 0.45], [px + 0.55, py + 0.05]]) A.line(P(gx, gy, 11.2), P(gx, gy, 19), E.trim, 1.2);
      top = band >= 2 ? shellDome(px + 0.3, py + 0.25, 0.38, 19, 10 + band * 2) : A.cone(px + 0.3, py + 0.25, 0.42, 19, 9, E.roof);
      const [lx, ly] = P(px + 0.3, py + 0.25, 15); A.lampDot(lx, ly, 1.6, '#f6f0ff', '#fff4d8'); warm(lx, ly, 16);
      if (band >= 3) { const [tx, ty] = P(px + 0.3, py + 0.25, top); pearlTip(tx, ty, 2); top += 8; }
    }
    terr.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    terr.forEach(([tx, ty, tw, td, tz], k) => {
      if (tz > 0.5) { const b = A.box(tx, ty, tw, td, 0, tz, E.stone, { noTop: true }); coralCourses(b, E.stone); }
      A.box(tx, ty, tw, td, tz, 1.2, A.shade(E.stone, 0.08), { noTop: true });
      const q = A.quad(tx + 0.06, ty + 0.06, tw - 0.12, td - 0.12, tz + 1.0);
      A.poly(q, A.GLOW ? '#0c2a34' : A.SNOW ? '#cfe2ee' : k % 2 ? '#3aa6b6' : '#46b2bc', 'rgba(30,60,70,0.4)', 0.6);
      if (!A.GLOW && !A.SNOW) A.poly(A.quad(tx + tw * 0.2, ty + td * 0.2, tw * 0.5, td * 0.45, tz + 1.0), '#78d0d8', null);
      // waterfall lip to the next step
      if (k < terr.length - 1 && !A.SNOW) { const a = P(tx + tw, ty + td * 0.5, tz + 1.2), b2 = P(tx + tw, ty + td * 0.5, Math.max(0, tz - 3)); A.line(a, b2, 'rgba(220,250,255,0.85)', 2); }
      // open oysters with pearls
      const m = 2 + Math.min(3, Math.floor((lv + band * 2) / 2));
      for (let j = 0; j < m; j++) {
        const gx = tx + tw * (0.2 + 0.6 * ((j * 0.37 + k * 0.21) % 1)), gy = ty + td * (0.25 + 0.5 * ((j * 0.61 + k * 0.13) % 1)), [ox, oy] = P(gx, gy, tz + 1.0);
        c.beginPath(); c.ellipse(ox, oy, 2.2, 1.1, 0, 0, TAU); fill('#8a8478');
        c.beginPath(); c.ellipse(ox, oy - 1.3, 2.2, 1.1, 0, Math.PI, TAU); fill('#d8d0dc');
        A.lampDot(ox, oy - 0.6, 0.85, '#fbf6ff', '#fff6e8');
      }
      const [wx, wy, wrx, wry] = A.ell(tx + tw / 2, ty + td / 2, tz + 1, Math.min(tw, td) * 0.42);
      A.rec('divers', { x: wx, y: wy, rx: wrx, ry: wry, seed: A.R() });
      if (!A.SNOW) A.rec('sparks', { x: wx, y: wy, kind: 'water', rx: wrx * 0.8, ry: wry * 0.8 });
      if (k === 0 || k === 2) A.rec('sparks', { x: wx + 3, y: wy, kind: 'star' });
    });
    // diving board, baskets, shells
    { const [bx, by] = P(x + 0.18, y + 0.95, 11); A.line(P(x + 0.18, y + 0.95, 0), [bx, by], PILE, 1.4); A.line([bx, by], [bx + 8, by + 1], E.wood, 2); }
    A.shellPile(x + 1.7, y + 1.85, 5 + band);
    const [kx, ky] = P(x + 0.35, y + 1.85); c.beginPath(); c.ellipse(kx, ky - 2, 3, 2.4, 0, 0, TAU); fill('#c9a874'); stroke(A.OUT, 0.6); A.lampDot(kx, ky - 3.6, 1, '#f6f0ff', '#fff6e8');
    if (band >= 2) coral(x + 1.8, y + 0.2, 0, 1); if (band >= 3) { coral(x + 0.1, y + 1.6, 0, 0.9, CORAL[2]); A.flagpole(x + 1.85, y + 1.0, 0, 26, E.accent); }
    return top + 4;
  });

  // =================================================================
  //  FARM — the kelp-and-salt steading: a hull-roofed barn on pilings,
  //  kelp drying lines, salt pans; irrigation adds tide sluices, granaries a shell silo
  // =================================================================
  B.farm = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    // salt pans along the back (grow with band)
    const pans = 1 + band;
    for (let k = 0; k < pans; k++) { const px = x + 0.1 + (k % 2) * 0.55, py = y + 0.1 + Math.floor(k / 2) * 0.5; A.poly(A.quad(px, py, 0.5, 0.42, 0.3), A.SNOW ? '#eef2f4' : k % 2 ? '#e8e4dc' : '#bfe0e2', 'rgba(80,70,50,0.5)', 0.6); if (!A.GLOW && !A.SNOW) for (let j = 0; j < 3; j++) A.circ(...P(px + 0.12 + j * 0.13, py + 0.2 + (j % 2) * 0.1, 0.3), 1, '#ffffff'); }
    let top;
    const bx = x + 1.05, by = y + 0.55, bw = 0.95, bd = 0.75;
    const z = 3 + band;
    pilings(bx, by, bw, bd, z); deck(bx - 0.06, by - 0.06, bw + 0.12, bd + 0.12, z, 1.3);
    const b = body(bx, by, bw, bd, z + 1.3, 8 + band * 2, { wood: band < 2 });
    sheen(b); A.door(b, 'R', bd * 0.5, 0.34, 7, E.wood2); roundWin(b, 'L', bw * 0.5, b.h * 0.6, 1.3);
    top = band >= 1 ? hullRoof(bx, by, bw, bd, b.z + b.h, 11 + band, 'y') : roof(b, 11, 'y');
    // kelp drying lines in front
    const nl = 1 + Math.min(2, Math.floor((lv + band) / 2));
    for (let k = 0; k < nl; k++) { const gy = y + 1.55 + k * 0.25; const a = P(x + 0.15, gy, 9), b2 = P(x + 0.95, gy, 9); A.line(P(x + 0.15, gy), a, PILE, 1); A.line(P(x + 0.95, gy), b2, PILE, 1); A.line(a, b2, ROPE, 0.6); for (let j = 1; j < 8; j++) { const p = lerp(a, b2, j / 8); A.line(p, [p[0] + 0.5, p[1] + 5 + (j % 3)], A.SNOW ? '#c8ccc4' : '#5f6a38', 1.4); } }
    if (T('irrigation')) { // tide sluice: a channel with a little gate
      A.poly(A.quad(x + 0.05, y + 1.2, w - 0.1, 0.16, 0.2), A.SNOW ? '#cfe2ee' : '#4fb0bc', null);
      const g = A.box(x + 0.85, y + 1.16, 0.12, 0.24, 0, 7, E.wood2); void g;
    }
    if (T('granaries') || band >= 3) { // a shell-domed silo (the stock silos stand at the right edge)
      A.cyl(x + 0.35, y + 1.05, 0.2, 0, 16, stoneAge() ? E.stone : E.wall); shellDome(x + 0.35, y + 1.05, 0.22, 16, 8);
    }
    if (band >= 2) { // tide wheel
      const [wx, wy] = P(bx + bw + 0.12, by + bd * 0.7, 6); c.beginPath(); c.ellipse(wx, wy, 3.5, 7, 0, 0, TAU); stroke(E.wood2, 1.4); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; A.line([wx, wy], [wx + Math.cos(a) * 3.5, wy + Math.sin(a) * 7], E.wood2, 0.8); }
    }
    gull(...P(bx + bw / 2, by + bd / 2, top));
    return top + 3;
  });

  // =================================================================
  //  LUMBER — the shipwright's slip: driftwood stacks, then a hull's ribs
  //  rising on the slipway, planked, and at last a ship near launch under a crane
  // =================================================================
  B.lumber = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    let top = 14;
    // a work shed at the back
    const s = body(x + 0.2, y + 0.2, 0.9, 0.7, 0, 9 + band, { wood: true });
    top = roof(s, 10, 'x');
    A.door(s, 'L', 0.45, 0.4, 7, E.wood2);
    // slipway: planks sloping to the water at the front
    const sx = x + 0.7, sy = y + 1.1, sl = Math.min(d - 1.3, 2.0);
    A.poly([P(sx, sy, 2), P(sx + 0.9, sy, 2), P(sx + 0.9, sy + sl, 0), P(sx, sy + sl, 0)], A.SNOW ? '#e4e6e8' : E.wood2);
    for (let k = 1; k < 6; k++) A.line(P(sx, sy + sl * k / 6, 2 - 2 * k / 6), P(sx + 0.9, sy + sl * k / 6, 2 - 2 * k / 6), A.shade(E.wood2, -0.25), 0.5);
    const hl = 0.8 + band * 0.3;
    if (band === 0) { A.logPile(x + 0.75, y + 1.4, 0.8, 2 + Math.min(2, lv)); A.log(x + 1.5, x + 2.2, y + 2.4, 0, 2.2); }
    else shipHull(sx + 0.45, sy + 0.1, Math.min(hl, sl - 0.1), 0.6, 2, 9 + band * 2, false, '#8a5a3a', band === 1 && lv < 3 ? 1 : 0);
    if (band >= 2) { // mast stepped in the hull
      const [mx, my] = P(sx + 0.45, sy + 0.1 + hl * 0.45, 14 + band * 2); A.line([mx, my], [mx, my - 26 - band * 4], '#6a4a30', 1.6); A.line([mx - 7, my - 18], [mx + 7, my - 18], '#6a4a30', 1); top = Math.max(top, 40 + band * 6);
    }
    if (band >= 3) { // crane on the shore
      const b0 = P(x + 1.9, y + 0.6), t0 = P(x + 1.9, y + 0.6, 42), j = P(sx + 0.45, sy + 0.6, 38);
      A.line(b0, t0, '#7a5434', 2); A.line(P(x + 2.1, y + 0.6), t0, '#7a5434', 1); A.line(t0, j, '#7a5434', 1.5); A.line(j, [j[0], j[1] + 12], '#3a2a20', 0.6); top = Math.max(top, 44);
    }
    A.logPile(x + 1.55, y + 0.35, 0.7, 1 + Math.min(3, band + (lv > 2 ? 1 : 0)));
    // sawhorse & a coil of rope
    { const [hx, hy] = P(x + 0.35, y + 1.6); A.line([hx - 4, hy], [hx - 1, hy - 5], PILE, 1); A.line([hx + 4, hy], [hx + 1, hy - 5], PILE, 1); A.line([hx - 3, hy - 5], [hx + 3, hy - 5], '#c8a878', 2); }
    { const [rx, ry] = P(x + 0.4, y + 2.2); for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(rx, ry - k * 1.2, 3 - k * 0.4, 1.4, 0, 0, TAU); stroke(ROPE, 1); } }
    if (T('sawpits') || band >= 2) { const [px, py] = P(x + 1.5, y + 2.6); A.line([px - 6, py], [px + 6, py - 3], '#6a4a30', 1.6); }
    return top;
  });

  // =================================================================
  //  QUARRY — a white coral-limestone cliff cut in steps, the lowest flooded
  //  by the tide; shear-legs hoist blocks; later a stone-dressers' shed
  // =================================================================
  B.quarry = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const rockC = A.SNOW ? '#e6eaec' : '#d9ccb4', rockD = A.shade(rockC, -0.22), rockT = A.SNOW ? '#f4f8fa' : A.mix(rockC, A.GROUND, 0.35);
    // the headland: a ragged limestone mass along the back and left edges
    const ch = 24 + band * 5, R = A.mkRng(7 + band);
    const back = [], left = [];
    for (let k = 0; k <= 8; k++) back.push(P(x + 0.05 + (w - 0.1) * k / 8, y + 0.08, ch * (0.62 + 0.38 * Math.sin(k / 8 * Math.PI)) * (0.85 + 0.15 * R())));
    for (let k = 0; k <= 6; k++) left.push(P(x + 0.08, y + 0.08 + (d * 0.75) * k / 6, ch * (0.7 - 0.55 * k / 6) * (0.85 + 0.15 * R())));
    A.poly([P(x + 0.05, y + 0.08, 0), P(x + w - 0.05, y + 0.08, 0)].concat(back.slice().reverse()), rockD);
    A.poly([P(x + 0.08, y + 0.08, 0)].concat(left, [P(x + 0.08, y + 0.08 + d * 0.75, 0)]), A.shade(rockC, -0.1));
    // the worked face: stepped cuts that deepen with level
    const steps = 2 + band, sd = (d - 1.0) / steps;
    for (let k = 0; k < steps; k++) {
      const sy = y + 0.1 + k * sd, z = Math.max(1.5, ch * 0.55 * (1 - (k + 0.5) / steps)), inset = 0.15 + k * 0.12;
      const bb = A.box(x + inset, sy, w - inset - 0.15, sd + 0.02, 0, z, k % 2 ? rockC : A.shade(rockC, 0.05), { top: rockT });
      if (!A.SNOW && !A.GLOW) { for (let u = 0.25; u < bb.w - 0.1; u += 0.32) A.line(A.onL(bb, u, u, 0, 0)[0], A.onL(bb, u + 0.05, u + 0.05, bb.h, bb.h)[0], rockD, 0.6); A.line(A.onL(bb, 0, bb.w, bb.h * 0.5, 0)[0], A.onL(bb, bb.w, bb.w, bb.h * 0.5, 0)[0], rockD, 0.5); }
      if (!A.GLOW && !A.SNOW && k === 0) for (let j = 0; j < 4; j++) { const p = A.onL(bb, 0.3 + j * 0.45, 0.3 + j * 0.45, bb.h * 0.55, 0)[0]; nautilus(p[0], p[1], 1.6, '#efe2cc'); }   // fossil shells in the face
    }
    // the flooded pit at the front, where the tide gets in
    pool(x + 0.2, y + d - 0.9, w * 0.42, 0.5);
    const nb = 2 + Math.min(5, band * 2 + Math.floor(lv / 2));
    for (let k = 0; k < nb; k++) { const gx = x + w * 0.52 + (k % 3) * 0.26, gy = y + d - 0.85 + Math.floor(k / 3) * 0.26; A.box(gx, gy, 0.2, 0.2, 0, 4.5, k % 2 ? '#efe6d6' : '#e6dac4'); }
    let top = ch;
    if (band >= 1) { // shear legs hoisting a block
      const a = P(x + w * 0.4, y + d - 1.2), b2 = P(x + w * 0.75, y + d - 1.2), t0 = P(x + w * 0.57, y + d - 0.9, 34 + band * 4);
      A.line(a, t0, '#7a5434', 1.6); A.line(b2, t0, '#7a5434', 1.6); A.line(t0, [t0[0], t0[1] + 20], '#3a2a20', 0.6);
      A.poly([[t0[0] - 3, t0[1] + 20], [t0[0] + 3, t0[1] + 20], [t0[0] + 3, t0[1] + 24], [t0[0] - 3, t0[1] + 24]], '#efe6d6');
      top = Math.max(top, 36 + band * 4);
    }
    if (band >= 2) { const s = body(x + w - 0.75, y + d - 0.65, 0.55, 0.45, 0, 8, { wood: era < 2 }); roof(s, 8, 'y'); }
    if (band >= 3) { coral(x + 0.3, y + 0.35, ch * 0.5, 1.1); A.flagpole(x + w * 0.5, y + 0.15, ch * 0.9, 12, E.accent); }
    return top;
  });

  // =================================================================
  //  MINE — a sea-cave adit at the foot of the headland: driftwood-framed
  //  mouth, later under a whale-jaw arch; rails, a cart, a winch on the hill
  // =================================================================
  B.mine = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const mx = x + w * 0.35, my = y + d - 0.05;
    const [px, py] = P(mx, my);
    const H = 15 + band * 2.5, W2 = 7 + band;
    // rock lip round the mouth
    c.beginPath(); c.moveTo(px - W2 - 5, py + 1); c.lineTo(px - W2 - 4, py - H * 0.8); c.quadraticCurveTo(px, py - H - 9, px + W2 + 4, py - H * 0.8); c.lineTo(px + W2 + 5, py + 1); c.closePath(); fill(A.SNOW ? '#dfe4e6' : '#8a8478'); stroke(A.OUT, 0.8);
    c.beginPath(); c.moveTo(px - W2, py); c.lineTo(px - W2, py - H * 0.7); c.quadraticCurveTo(px, py - H * 1.15, px + W2, py - H * 0.7); c.lineTo(px + W2, py); c.closePath(); c.fillStyle = A.GLOW ? '#2a1a0c' : '#1e1a18'; c.fill();
    if (!A.GLOW && !A.SNOW) { A.line([px - W2 - 3, py - H * 0.5], [px - W2 - 1, py - 2], '#4f7a46', 1.6); A.line([px + W2 + 2, py - H * 0.6], [px + W2 + 1, py - 3], '#4f7a46', 1.6); }
    if (band === 0) { A.line([px - W2 + 1, py], [px - W2 + 1, py - H * 0.72], E.wood2, 2.2); A.line([px + W2 - 1, py], [px + W2 - 1, py - H * 0.72], E.wood2, 2.2); A.line([px - W2 - 1, py - H * 0.72], [px + W2 + 1, py - H * 0.72], E.wood2, 2.6); }
    else { // a whale's jawbones as the arch
      for (const f of [-1, 1]) { c.beginPath(); c.moveTo(px + f * (W2 + 2), py); c.quadraticCurveTo(px + f * (W2 + 4), py - H * 1.05, px + f * 1, py - H - 5); stroke('#ece2c8', 3); c.beginPath(); c.moveTo(px + f * (W2 + 2), py); c.quadraticCurveTo(px + f * (W2 + 4), py - H * 1.05, px + f * 1, py - H - 5); stroke(A.OUT, 0.5); }
    }
    A.lampDot(px, py - H * 0.45, 1.4, '#7a5a3a', '#ffcf6a'); warm(px, py - H * 0.45, 16);
    if (band >= 2) A.lantern(px + W2 + 6, py - H * 0.55, 1.6);
    // rails and sleepers out to the lane, a cart of ore
    const rl = Math.max(0.3, Math.min(1.4, A.N - 0.3 - my));
    for (let k = 0; k * 0.28 < rl - 0.1; k++) { const gy = my + 0.1 + k * 0.28; A.line(P(mx - 0.22, gy), P(mx + 0.22, gy), E.wood2, 1.4); }
    A.line(P(mx - 0.15, my), P(mx - 0.15, my + rl), '#5a5a60', 1); A.line(P(mx + 0.15, my), P(mx + 0.15, my + rl), '#5a5a60', 1);
    const cy0 = my + Math.min(0.6, rl - 0.5); A.box(mx - 0.2, cy0, 0.4, 0.42, 2, 5, '#6a5a4a');
    { const [cx, cy] = P(mx, cy0 + 0.21, 7.5); for (let k = 0; k < 4; k++) A.circ(cx - 3 + k * 2, cy - (k % 2), 1.5, k % 2 ? '#a0522d' : '#5a524c'); }
    // shell-roofed shed beside the cave
    if (band >= 1) { const s = body(x + w * 0.62, y + d - 0.75, 0.6, 0.5, 0, 7, { wood: true }); roof(s, 7, 'x'); A.door(s, 'L', 0.3, 0.22, 5.5, E.wood2); }
    let top = H + 10;
    if (band >= 2 || T('deepshafts')) { // winch tripod on the hill
      const [hx, hy] = P(x + w * 0.77, y + d * 0.2); A.line([hx - 6, hy], [hx, hy - 30], E.wood2, 1.8); A.line([hx + 6, hy], [hx, hy - 30], E.wood2, 1.8); A.line([hx - 3, hy - 15], [hx + 3, hy - 15], E.wood2, 1.2);
      c.beginPath(); c.arc(hx, hy - 30, 5, 0, TAU); stroke('#3a2a20', 1); top = Math.max(top, 36);
    }
    for (let i = 0; i < Math.min(4, Math.floor(L / 4)); i++) { const [ox, oy] = P(x + w * 0.72 + (i % 2) * 0.25, y + d * 0.4 + i * 0.25); c.beginPath(); c.ellipse(ox, oy - 1, 5.5, 3, 0, Math.PI, TAU); fill('#6a5a52'); for (let k = 0; k < 3; k++) A.circ(ox - 2 + k * 2, oy - 2, 1.2, k % 2 ? '#a0522d' : '#7a6a62'); }
    if (band >= 3) { A.flagpole(x + w * 0.15, y + d - 0.3, 0, 22, E.accent); A.shellPile(x + w * 0.2, y + d - 0.6, 5); }
    void lv;
    return top;
  });

  // =================================================================
  //  WAREHOUSE — the salt-fish store: a long upturned-hull roof on a coral
  //  base, cargo hoist on a gable; it doubles in length and gains a second hull
  // =================================================================
  B.warehouse = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    let top;
    if (band >= 2) { // a second, older store behind
      const b2 = body(x + 0.15, y + 0.15, 0.7, 1.3 + (band >= 3 ? 0.5 : 0), 0, 11, {});
      top = hullRoof(b2.x, b2.y, b2.w, b2.d, b2.h, 11, 'y');
    }
    const bw = 1.2 + Math.min(0.5, band * 0.15), bd = 0.8 + band * 0.12, bx = x + w - bw - 0.15, by = y + 0.35;
    const b = body(bx, by, bw, bd, 0, 11 + band * 2, {});
    sheen(b);
    A.door(b, 'L', bw * 0.5, 0.42, 10, E.wood2);
    for (const u of [0.25, bw - 0.25]) roundWin(b, 'L', u, b.h * 0.62, 1.3);
    for (let k = 0; k < Math.max(1, Math.round(bd / 0.45)); k++) roundWin(b, 'R', bd * (k + 0.5) / Math.max(1, Math.round(bd / 0.45)), b.h * 0.6, 1.3);
    top = Math.max(top || 0, hullRoof(bx, by, bw, bd, b.h, 12 + band * 2, 'x', era >= 2 ? E.roof : '#7a5a40'));
    // cargo hoist: a beam out of the gable with a net of crates
    const [hx, hy] = P(bx + bw + 0.1, by + bd / 2, b.h + 6); A.line([hx - 5, hy + 2], [hx + 6, hy - 1], E.wood2, 2); A.line([hx + 5, hy - 1], [hx + 5, hy + 10], '#3a2a20', 0.6);
    A.poly([[hx + 2, hy + 10], [hx + 8, hy + 10], [hx + 7, hy + 16], [hx + 3, hy + 16]], '#a5773f'); for (let k = 0; k < 3; k++) A.line([hx + 2 + k * 2, hy + 10], [hx + 3 + k * 2, hy + 16], ROPE, 0.5);
    if (band >= 1) { const [ex, ey] = P(bx + bw + 0.16, by + bd / 2, b.h + 2); anchor(ex - 8, ey + 10, 0.9); }
    for (let k = 0; k < Math.min(3, lv + band); k++) A.barrel(x + 0.25 + k * 0.25, y + d - 0.6);
    if (band >= 3) { const [px, py] = P(bx + bw / 2, by + bd / 2, top); gull(px, py); A.flagpole(bx + 0.1, by + 0.1, top - 4, 12, E.accent); }
    return top + 2;
  });

  // =================================================================
  //  MARKET — the fish market: sail-cloth awnings over fish tables round a
  //  shell fountain; then a covered fish hall, and at last a pearl-domed exchange
  // =================================================================
  B.market = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    let top = 14;
    if (band >= 2) { // covered hall at the back with an open arcade
      const hb = body(x + 0.2, y + 0.15, 1.6, 0.7, 0, 13, {});
      for (let k = 0; k < 4; k++) { const u = 0.2 + k * 0.4; A.lamp(A.onL(hb, u - 0.12, u + 0.12, 0, 8), '#2e2a28', '#ffc35a'); }
      top = roof(hb, 10, 'x');
      if (band >= 3) { const t = shellDome(x + 1.0, y + 0.5, 0.42, top - 4, 16); const [px, py] = P(x + 1.0, y + 0.5, t); pearlTip(px, py, 2); top = t + 8; }
    }
    // fountain
    const fx = x + w / 2 + 0.1, fy = y + d / 2 + 0.15;
    roundPool(fx, fy, 0.3);
    A.cyl(fx, fy, 0.05, 1, 8, E.stone);
    { const [sx, sy] = P(fx, fy, 10); c.beginPath(); c.moveTo(sx - 4.5, sy); c.arc(sx, sy, 4.5, Math.PI, TAU); c.closePath(); fill(SHELL); stroke(A.OUT, 0.6); if (!A.SNOW) A.rec('sparks', { x: sx, y: sy + 7, kind: 'water', rx: 6, ry: 2.5 }); }
    // stalls with fish tables
    const spots = [[x + 0.2, y + 0.95], [x + 1.55, y + 0.95], [x + 0.2, y + 1.65], [x + 1.55, y + 1.65], [x + 0.9, y + 0.5]].slice(0, 2 + Math.min(3, band + Math.floor(lv / 2)));
    if (band >= 2) spots.pop();
    spots.sort((a, b) => a[0] + a[1] - b[0] - b[1]).forEach(([gx, gy], k) => {
      A.box(gx, gy, 0.55, 0.3, 0, 5, E.wood);
      const [cx, cy] = P(gx + 0.27, gy + 0.15, 5);
      for (let j = 0; j < 3; j++) A.poly([[cx - 4 + j * 3, cy - 1], [cx - 2 + j * 3, cy - 2], [cx - 1 + j * 3, cy - 1], [cx - 2 + j * 3, cy]], j % 2 ? '#a8b8bc' : '#d08a70', null);
      for (const [px, py] of [[gx, gy + 0.3], [gx + 0.55, gy + 0.3]]) A.line(P(px, py), P(px, py, 11), PILE, 0.9);
      awning(gx - 0.03, gy - 0.02, 0.61, 0.36, 11, [E.accent, ERA[1].roof, '#4a6aa8', '#e0b84a'][k % 4]);
    });
    if (band >= 1) { A.netRack(x + 0.25, y + 0.35, true); }
    if (T('guilds')) { const [sx, sy] = P(x + 0.15, y + d - 0.15); A.line([sx, sy], [sx, sy - 18], PILE, 1.2); nautilus(sx, sy - 20, 3); }
    return top;
  });

  // =================================================================
  //  BARRACKS — the Shellguard hall: a longhouse under a great turtle-shell
  //  roof, harpoon racks and shell shields; grows a drill deck and a watch spiral
  // =================================================================
  function turtleRoof(cx, cy, rx0, ry0, z, h) {
    const col = sn(era >= 2 ? '#5f8a6a' : '#6a7a4a');
    const [x, y, rx, ry] = [...A.P(cx, cy, z), rx0, ry0];
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.ellipse(x, y, rx, Math.max(ry, h), 0, Math.PI, TAU); c.closePath();
    if (A.GLOW) { c.fillStyle = A.F(col); c.fill(); }
    else { const g = c.createRadialGradient(x - rx * 0.3, y - h * 0.7, 1, x, y - h * 0.3, rx * 1.2); g.addColorStop(0, A.shade(col, 0.3)); g.addColorStop(0.6, col); g.addColorStop(1, A.shade(col, -0.35)); c.fillStyle = g; c.fill(); }
    stroke(A.OUT, 0.8);
    if (!A.SNOW) { // scute plates
      const sc = A.shade(col, -0.35);
      c.beginPath(); c.ellipse(x, y - h * 0.55, rx * 0.35, h * 0.32, 0, 0, TAU); stroke(sc, 0.8);
      for (const f of [-0.62, 0.62]) { c.beginPath(); c.ellipse(x + rx * f, y - h * 0.35, rx * 0.22, h * 0.28, 0, 0, TAU); stroke(sc, 0.8); }
      c.beginPath(); c.ellipse(x, y - h * 0.08, rx * 0.25, h * 0.15, 0, 0, TAU); stroke(sc, 0.7);
    }
    A.line([x - rx, y], [x + rx, y], A.shade(col, -0.45), 1.2);
    return z + h;
  }
  B.barracks = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    let top = 0;
    if (band >= 2) top = spiralTower(x + w - 0.45, y + 0.4, 0.24, 0, 40 + band * 6 + lv, { capH: 13 });
    const bw = 1.6 + band * 0.25, bd = 0.95, bx = x + 0.25, by = y + 0.35;
    const b = body(bx, by, bw, bd, 0, 10 + band * 2, { wood: band === 0 });
    sheen(b); A.door(b, 'L', bw * 0.5, 0.32, 8, E.wood2);
    for (let k = 0; k < Math.round(bw / 0.45); k++) { const u = (k + 0.5) * bw / Math.round(bw / 0.45); if (Math.abs(u - bw / 2) > 0.2) A.lamp(A.onL(b, u - 0.06, u + 0.06, 5, 9), '#2e2a28', '#ffc35a'); }
    // shields on the right wall
    for (let k = 0; k < 2 + Math.min(2, band); k++) { const p = A.onR(b, bd * (k + 0.5) / (2 + Math.min(2, band)), 0, b.h * 0.55, 0)[0]; A.circ(p[0], p[1], 2.4, k % 2 ? SHELL : E.accent, A.OUT); A.line([p[0] - 1.8, p[1]], [p[0] + 1.8, p[1]], A.shade(SHELL, -0.3), 0.5); }
    const [rcx, rcy] = [bx + bw / 2, by + bd / 2];
    const rx = (bw + bd) / 2 * A.HW * 0.98;
    top = Math.max(top, turtleRoof(rcx, rcy, rx, rx * 0.5, b.h, rx * 0.78 + band * 2));
    // harpoon racks in the yard
    const nr = 1 + Math.min(2, Math.floor((band + lv) / 2));
    for (let k = 0; k < nr; k++) { const gx = x + 0.35 + k * 0.55, gy = y + d - 0.75, a = P(gx, gy), bb = P(gx + 0.35, gy); A.line(a, [a[0], a[1] - 9], PILE, 1); A.line(bb, [bb[0], bb[1] - 9], PILE, 1); A.line([a[0], a[1] - 7], [bb[0], bb[1] - 7], PILE, 1); for (let j = 1; j < 4; j++) { const m = lerp(a, bb, j / 4); A.line([m[0], m[1] + 1], [m[0] + 1, m[1] - 15], '#8a7a62', 0.8); A.poly([[m[0] + 0.2, m[1] - 15], [m[0] + 1.8, m[1] - 15], [m[0] + 1.2, m[1] - 18]], '#c8ccd2', null); } }
    if (band >= 1) A.banner(x + w - 0.2, y + d - 0.6, 0, 26, E.accent);
    if (band >= 3) { const [ex, ey] = P(bx + bw + 0.05, rcy, b.h + 4); figurehead(ex, ey, 1.1, 1); }
    if (T('fortification') && band >= 1) { const [gx, gy] = P(x + w - 0.3, y + d - 0.3); anchor(gx, gy, 1.1); }
    return top + 2;
  });

  // =================================================================
  //  STABLE — kelpie pens: a stilted stall-row over a fenced lagoon where
  //  sea-horses surface; the Tidecharger whale-pen appears at the top band
  // =================================================================
  function kelpie(x, y, s = 1, flip = 1) {
    const col = A.SNOW ? '#5a8a8a' : '#3f8a8a';
    c.beginPath(); c.moveTo(x - 2 * s * flip, y); c.quadraticCurveTo(x - 2.5 * s * flip, y - 7 * s, x + 0.5 * s * flip, y - 9 * s); c.lineTo(x + 4 * s * flip, y - 7.5 * s); c.lineTo(x + 3.5 * s * flip, y - 6 * s); c.lineTo(x + 0.8 * s * flip, y - 6.5 * s); c.quadraticCurveTo(x + 1 * s * flip, y - 3 * s, x + 2 * s * flip, y); c.closePath(); fill(col); stroke(A.OUT, 0.6);
    A.line([x - 0.5 * s * flip, y - 8.5 * s], [x - 2.5 * s * flip, y - 5 * s], '#7fc0a0', 1.2 * s);   // fin-mane
    if (!A.GLOW) A.circ(x + 2 * s * flip, y - 7.6 * s, 0.4 * s, '#101418');
  }
  B.stable = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    // lagoon pen in front
    const px = x + 0.2, py = y + 1.05, pw = w - 0.5, pd = d - 1.45;
    pool(px, py, pw, pd);
    // stall row on stilts at the back
    const z = 3 + band;
    const sw = 1.3 + band * 0.25;
    const h = stiltHouse(x + 0.25, y + 0.2, Math.min(sw, w - 0.5), 0.65, z, 9 + band, 'x', { rh: 10, wood: band < 2, du: 0.25 });
    for (let k = 0; k < 3; k++) { const u = 0.55 + k * 0.32; if (u < h.b.w - 0.1) A.poly(A.onL(h.b, u - 0.1, u + 0.1, 0, 6), '#3a2a20', null); }
    let top = h.top;
    // kelpies surfacing
    const nk = 1 + Math.min(3, band + Math.floor(lv / 3));
    for (let k = 0; k < nk; k++) { const [kx, ky] = P(px + pw * (0.2 + 0.25 * k), py + pd * (0.35 + 0.3 * (k % 2))); kelpie(kx, ky, 0.9, k % 2 ? -1 : 1); if (!A.GLOW && !A.SNOW) { c.beginPath(); c.ellipse(kx, ky, 4, 1.4, 0, 0, TAU); stroke('rgba(255,255,255,0.6)', 0.6); } }
    if (band >= 3) { // the back of a great sea-beast in its own pen
      const [wx, wy] = P(px + pw * 0.75, py + pd * 0.7); c.beginPath(); c.ellipse(wx, wy, 11, 4.5, 0, Math.PI, TAU); fill('#4a5a72'); stroke(A.OUT, 0.7); if (!A.GLOW) { A.circ(wx + 6, wy - 2.2, 0.6, '#101418'); A.line([wx - 11, wy], [wx - 15, wy - 4], '#4a5a72', 2); } A.rec('sparks', { x: wx - 2, y: wy - 6, kind: 'water', rx: 3, ry: 4 });
    }
    // pen fence of posts and rope
    const fpts = [[px, py + pd], [px + pw, py + pd], [px + pw, py]];
    A.fence(fpts, 5, '#a8987a');
    A.netRack(x + w - 0.3, y + 0.4, false);
    return top;
  });

  // =================================================================
  //  WAR PIT — the tide ring: a sparring island in a round pool,
  //  harpoon targets, boardwalk seats; the walls rise to a coral arena
  // =================================================================
  B.warpit = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const cx = x + w / 2, cy = y + d / 2, r = Math.min(w, d) * 0.4;
    if (band >= 2) { // back half of the arena wall
      const hz = 6 + band * 2;
      for (let k = 0; k < 14; k++) { const a0 = Math.PI + k / 14 * Math.PI, a1 = a0 + Math.PI / 14; A.poly([P(cx + Math.cos(a0) * (r + 0.15), cy + Math.sin(a0) * (r + 0.15), 0), P(cx + Math.cos(a1) * (r + 0.15), cy + Math.sin(a1) * (r + 0.15), 0), P(cx + Math.cos(a1) * (r + 0.15), cy + Math.sin(a1) * (r + 0.15), hz), P(cx + Math.cos(a0) * (r + 0.15), cy + Math.sin(a0) * (r + 0.15), hz)], k % 2 ? E.stone : A.shade(E.stone, -0.08)); }
    }
    roundPool(cx, cy, r);
    // sand island in the middle
    const [ix, iy, irx, iry] = A.ell(cx, cy, 0, r * 0.45); c.beginPath(); c.ellipse(ix, iy, irx, iry, 0, 0, TAU); fill(A.SNOW ? '#eef0f2' : '#e8d8a8'); stroke(A.OUT, 0.6);
    A.person(ix - 3, iy, E.accent, 0.9); A.person(ix + 3, iy, ERA[1].roof, 0.9);
    // stepping posts across the water
    for (let k = 0; k < 3 + band; k++) { const a = k / (3 + band) * TAU + 0.4; const [sx, sy] = P(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75); A.line([sx, sy], [sx, sy - 4], PILE, 2.2); }
    // targets on poles
    for (const [gx, gy] of [[x + 0.25, y + 0.3], [x + w - 0.3, y + 0.25]].slice(0, 1 + (band >= 1))) { const [tx, ty] = P(gx, gy); A.line([tx, ty], [tx, ty - 12], PILE, 1.2); A.circ(tx, ty - 13, 3.6, '#e6d49a', A.OUT); A.circ(tx, ty - 13, 2, E.accent); A.circ(tx, ty - 13, 0.8, '#f6eedc'); }
    if (band >= 1) { // boardwalk seats
      const bz = 4; deck(x + 0.1, y + d - 0.45, w - 0.2, 0.3, 0, bz);
      for (let k = 0; k < 2 + Math.min(4, lv + band); k++) A.person(...P(x + 0.3 + k * 0.4, y + d - 0.3, bz + 1), A.R() < 0.5 ? E.accent : '#c0704a', 0.7);
    }
    if (band >= 2) { const hz = 6 + band * 2; for (let k = 0; k < 14; k++) { const a0 = k / 14 * Math.PI, a1 = a0 + Math.PI / 14; if (Math.sin((a0 + a1) / 2) > 0.8 && band < 3) continue; A.poly([P(cx + Math.cos(a0) * (r + 0.15), cy + Math.sin(a0) * (r + 0.15), 0), P(cx + Math.cos(a1) * (r + 0.15), cy + Math.sin(a1) * (r + 0.15), 0), P(cx + Math.cos(a1) * (r + 0.15), cy + Math.sin(a1) * (r + 0.15), hz * 0.5), P(cx + Math.cos(a0) * (r + 0.15), cy + Math.sin(a0) * (r + 0.15), hz * 0.5)], k % 2 ? E.stone : A.shade(E.stone, 0.06)); } }
    if (band >= 3) { A.banner(x + 0.15, y + 0.15, 0, 30, E.accent); A.banner(x + w - 0.15, y + 0.15, 0, 30, ERA[1].roof); }
    return 16 + band * 4;
  });

  // =================================================================
  //  WORKSHOP — the rope-walk and net loft: a long shed with a rope-walk of
  //  posts, coils, a capstan; grows a sail loft and a spiral crane
  // =================================================================
  B.workshop = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const bw = Math.min(w - 0.5, 1.3 + band * 0.25), bd = Math.min(d - 0.6, 0.75);
    const b = body(x + 0.2, y + 0.15, bw, bd, 0, 10 + band * 2, { wood: band < 2 });
    sheen(b); A.door(b, 'L', 0.35, 0.36, 8, E.wood2);
    for (let k = 1; k < 3 + band; k++) { const u = 0.35 + k * (bw - 0.5) / (2 + band); if (u < bw - 0.1) roundWin(b, 'L', u, b.h * 0.6, 1.2); }
    let top = band >= 2 ? hullRoof(b.x, b.y, b.w, b.d, b.h, 10, 'x') : roof(b, 9, 'x');
    if (band >= 1) { // sail loft: a canvas drying above the roof
      const a = P(b.x + 0.2, b.y + bd / 2, top), bb = P(b.x + bw - 0.2, b.y + bd / 2, top);
      A.line(a, [a[0], a[1] - 14], PILE, 1); A.line(bb, [bb[0], bb[1] - 14], PILE, 1);
      A.poly([[a[0], a[1] - 13], [bb[0], bb[1] - 13], [bb[0] - 2, bb[1] - 5], [a[0] + 2, a[1] - 4]], '#f4ece0'); top += 14;
    }
    // the rope-walk: posts along the front with a long rope
    const ry = y + d - 0.35, n = 3 + Math.min(4, band + lv);
    let prev = null;
    for (let k = 0; k < n; k++) { const gx = x + 0.2 + k * (w - 0.4) / (n - 1), p = P(gx, ry), t0 = [p[0], p[1] - 7]; A.line(p, t0, PILE, 1.1); if (prev) A.line(prev, t0, ROPE, 0.9); prev = t0; }
    // capstan
    { const [kx, ky] = P(x + w - 0.3, y + bd + 0.35); A.cyl(x + w - 0.3, y + bd + 0.35, 0.1, 0, 5, E.wood2); A.line([kx - 6, ky - 5], [kx + 6, ky - 5], E.wood2, 1.2); A.line([kx - 3, ky - 3], [kx + 3, ky - 7], E.wood2, 1.2); }
    for (let k = 0; k < 1 + band; k++) { const [rx, ry2] = P(x + 0.4 + k * 0.3, y + bd + 0.45); for (let j = 0; j < 3; j++) { c.beginPath(); c.ellipse(rx, ry2 - j * 1.2, 2.6 - j * 0.3, 1.2, 0, 0, TAU); stroke(ROPE, 1); } }
    if (band >= 3) { const t = spiralTower(x + w - 0.35, y + 0.35, 0.18, 0, 34, { capH: 10, gallery: false }); top = Math.max(top, t); }
    return top + 2;
  });

  // =================================================================
  //  SMELTER — the shell-lime kiln: a squat bottle kiln of coral rubble,
  //  later two, and a bellows house; metallurgy adds an iron-banded stack
  // =================================================================
  function bottleKiln(cx, cy, r, h, col) {
    A.cyl(cx, cy, r, 0, h * 0.45, col);
    const [x0, y0, rx] = A.ell(cx, cy, h * 0.45, r), [, , rx2] = A.ell(cx, cy, h, r * 0.35);
    c.beginPath(); c.moveTo(x0 - rx, y0); c.quadraticCurveTo(x0 - rx * 1.05, y0 - h * 0.35, x0 - rx2, y0 - h * 0.55); c.lineTo(x0 + rx2, y0 - h * 0.55); c.quadraticCurveTo(x0 + rx * 1.05, y0 - h * 0.35, x0 + rx, y0); c.closePath();
    A.gradFill(x0 - rx, x0 + rx, col);
    A.cyl(cx, cy, r * 0.35, h, 2.5, A.shade(col, -0.2));
    const [fx, fy, frx, fry] = A.ell(cx, cy, 0, r); A.lamp([[fx - 2.5, fy + fry], [fx + 2.5, fy + fry], [fx + 2.5, fy + fry - 5], [fx, fy + fry - 7], [fx - 2.5, fy + fry - 5]], '#5a2a1a', '#ff9a3a');
    A.rec('lights', { x: fx, y: fy + fry - 3, r: 18 });
    return h + 2.5;
  }
  function kilnSmoke(cx, cy, z) { const [px, py] = P(cx, cy, z + 1); A.rec('smoke', { x: px, y: py, kind: 'smelter', dark: true, seed: A.R() }); }
  B.smelter = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const col = stoneAge() ? E.stone : '#cfc4b0';
    let top = 0;
    if (band >= 2) { top = bottleKiln(x + 0.65, y + 0.6, 0.38, 26 + band * 3, col); kilnSmoke(x + 0.65, y + 0.6, top); }
    const h = 22 + band * 4 + lv;
    top = Math.max(top, bottleKiln(x + 1.45, y + 1.1, 0.5, h, col));
    kilnSmoke(x + 1.45, y + 1.1, h + 2.5);
    if (!A.GLOW && !A.SNOW) for (let k = 0; k < 4; k++) { const [sx, sy] = P(x + 1.45 + Math.cos(k * 1.6) * 0.5, y + 1.1 + Math.sin(k * 1.6) * 0.5, 4 + k * 3); A.circ(sx, sy, 0.8, SHELL); }
    // shell heaps waiting to be burnt into lime, and ore baskets
    A.shellPile(x + 0.4, y + 1.6, 6 + band); A.shellPile(x + 0.75, y + 1.85, 4 + band);
    if (band >= 1) { const s = body(x + 1.55, y + 0.15, 0.7, 0.5, 0, 8, { wood: true }); roof(s, 7, 'x'); A.lamp(A.onL(s, 0.2, 0.5, 0, 5), '#3a1a10', '#ff9a3a'); }
    if (T('bellows')) { const [bx, by] = P(x + 0.95, y + 1.5, 2); A.poly([[bx - 4, by], [bx + 4, by - 1], [bx + 2, by - 5], [bx - 3, by - 4]], '#8a5a3a'); }
    if (T('metallurgy')) { const [mx, my] = P(x + 1.45, y + 1.1, h * 0.25); for (let k = 0; k < 2; k++) { c.beginPath(); const [, , rx] = A.ell(0, 0, 0, 0.51); c.ellipse(mx, my - k * 6, rx, rx * 0.5, 0, 0.1, Math.PI - 0.1); stroke('#4a4e56', 1.4); } }
    return top + 4;
  });

  // =================================================================
  //  SMITHY — the harpoon forge: an open forge under a sail awning, an
  //  anvil on a whale vertebra, racks of harpoons; becomes a coral forge-hall
  // =================================================================
  B.smithy = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    let top;
    const b = body(x + 0.2, y + 0.2, 1.2 + band * 0.15, 0.8, 0, 10 + band * 2, { wood: band === 0 });
    sheen(b);
    A.lamp(A.onL(b, 0.25, 0.6, 0, 7), '#3a1a10', '#ff9a3a'); A.rec('lights', { x: A.onL(b, 0.42, 0.42, 4, 4)[0][0], y: A.onL(b, 0.42, 0.42, 4, 4)[0][1], r: 18 });
    roundWin(b, 'R', 0.4, b.h * 0.6, 1.3);
    top = roof(b, 10, 'x');
    A.chimney(b.x + b.w - 0.35, b.y + 0.2, b.h + 4, 9 + band * 2, 'smithy', stoneAge() ? E.stone : '#9a8f84');
    // open forge under an awning in front-right
    const fx = x + w - 0.85, fy = y + 1.2;
    for (const [px, py] of [[fx, fy + 0.6], [fx + 0.6, fy + 0.6], [fx + 0.6, fy]]) A.line(P(px, py), P(px, py, 14), PILE, 1.1);
    awning(fx - 0.03, fy - 0.03, 0.66, 0.66, 14, ERA[1].roof, '#efe4cc');
    const [hx, hy] = P(fx + 0.3, fy + 0.3, 3); A.box(fx + 0.15, fy + 0.15, 0.3, 0.3, 0, 3, '#7a6a5a'); A.lampDot(hx, hy - 1, 2, '#c85a2a', '#ffb050'); A.rec('fires', { x: hx, y: hy, s: 0.4 }); A.rec('lights', { x: hx, y: hy, r: 22 });
    // anvil on a whale vertebra
    { const [ax, ay] = P(x + 0.6, y + 1.55); c.beginPath(); c.ellipse(ax, ay - 2, 3.4, 2, 0, 0, TAU); fill('#ece2c8'); stroke(A.OUT, 0.6); A.poly([[ax - 3, ay - 5], [ax + 4, ay - 5], [ax + 2, ay - 3.5], [ax - 2, ay - 3.5]], '#4a4e56'); A.rec('anvils', { x: ax, y: ay - 6 }); }
    // harpoon rack
    const nh = 3 + Math.min(4, lv + band);
    { const a = P(x + 0.25, y + d - 0.5), bb = P(x + 0.95, y + d - 0.5); A.line([a[0], a[1] - 8], [bb[0], bb[1] - 8], PILE, 1); for (let k = 0; k < nh; k++) { const m = lerp(a, bb, (k + 0.5) / nh); A.line([m[0], m[1]], [m[0] + 1, m[1] - 16], '#8a7a62', 0.8); A.poly([[m[0] + 0.2, m[1] - 16], [m[0] + 2, m[1] - 16], [m[0] + 1.2, m[1] - 19.5]], '#c8ccd2', null); } }
    if (band >= 3) { const [ex, ey] = P(b.x + b.w + 0.16, b.y + b.d / 2, b.h + 3); anchor(ex - 4, ey + 9, 1); }
    return top + 2;
  });

  // =================================================================
  //  ARMORY — the shell-plate store: a coral keep with a great scallop shield
  //  on its face and crossed tridents; turrets and pearl inlay with growth
  // =================================================================
  function scallop(x, y, s, col) {
    c.beginPath(); c.moveTo(x, y + 4 * s); c.lineTo(x - 5 * s, y - 2 * s); c.arc(x, y - 2 * s, 5 * s, Math.PI, TAU); c.lineTo(x, y + 4 * s); c.closePath(); fill(col); stroke(A.OUT, 0.7);
    if (!A.GLOW) for (let k = 1; k < 6; k++) { const a = Math.PI + k / 6 * Math.PI; A.line([x, y + 3.5 * s], [x + Math.cos(a) * 4.8 * s, y - 2 * s + Math.sin(a) * 4.8 * s], A.shade(col, -0.25), 0.5); }
  }
  function trident(x, y, h, col = '#c8ccd2', tilt = 0) {
    const tx = x + tilt * h, ty = y - h; A.line([x, y], [tx, ty], '#8a7a62', 1);
    A.line([tx - 2.5, ty + 1], [tx + 2.5, ty - 1], col, 1); for (const o of [-2.5, 0, 2.5]) A.line([tx + o, ty - o * 0.4], [tx + o + tilt * 4, ty - o * 0.4 - 4], col, 0.9);
  }
  B.armory = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    let top = 0;
    const bw = 1.3, bd = 1.1, bx = x + 0.45, by = y + 0.4;
    if (band >= 2) { for (const [gx, gy] of [[bx - 0.12, by - 0.12], [bx + bw - 0.18, by - 0.12]]) { const t = A.box(gx, gy, 0.3, 0.3, 0, 22 + band * 3, E.stone); coralCourses(t, E.stone); top = Math.max(top, shellDome(gx + 0.15, gy + 0.15, 0.2, t.h, 7)); } }
    const b = body(bx, by, bw, bd, 0, 14 + band * 3, { stone: band >= 1 });
    sheen(b);
    A.door(b, 'L', bw * 0.5, 0.32, 9, '#4a4e56');
    roundWin(b, 'R', bd * 0.3, b.h * 0.6, 1.3); roundWin(b, 'R', bd * 0.7, b.h * 0.6, 1.3);
    const zt = band >= 1 ? A.hip(b, 10, E.roof, 0.12) : roof(b, 11, 'x');
    if (band >= 1) A.shellScales([P(bx - 0.12, by + bd + 0.12, b.h), P(bx + bw + 0.12, by + bd + 0.12, b.h), P(bx + bw - bd / 2, by + bd / 2, zt), P(bx + bd / 2, by + bd / 2, zt)], 2, A.shade(E.roof, -0.28));
    top = Math.max(top, zt);
    // the great scallop shield over the door with crossed tridents
    const [sx, sy] = A.onL(b, bw * 0.5, bw * 0.5, b.h * 0.72, 0)[0];
    trident(sx - 5, sy + 6, 14, '#c8ccd2', -0.35); trident(sx + 5, sy + 6, 14, '#c8ccd2', 0.35);
    scallop(sx, sy, 0.8 + band * 0.12, era >= 3 ? '#f0e8f4' : SHELL);
    if (era >= 3 || band >= 3) A.lampDot(sx, sy, 1.2, '#f6f2ff', '#fff6e4');
    // armour stands in the yard: shell breastplates
    for (let k = 0; k < 1 + Math.min(3, lv + band); k++) { const [ax, ay] = P(x + 0.3 + k * 0.35, y + d - 0.4); A.line([ax, ay], [ax, ay - 9], PILE, 1); c.beginPath(); c.ellipse(ax, ay - 8, 2.6, 3.2, 0, 0, TAU); fill(k % 2 ? SHELL : '#d8c0b0'); stroke(A.OUT, 0.6); }
    if (T('fortification')) A.flagpole(bx + bw - 0.1, by + 0.1, zt - 2, 12, E.accent);
    return top + 3;
  });

  // =================================================================
  //  ACADEMY — the Tide School: a scholar's hall with a nautilus observatory,
  //  an armillary of rings; cartography spreads sea-charts and a great globe
  // =================================================================
  B.academy = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    let top = 0;
    // observatory spiral at back-right
    if (band >= 1) {
      const t = spiralTower(x + w - 0.5, y + 0.45, 0.28, 0, 30 + band * 8 + lv, { capH: 6, capCol: E.accent });
      // armillary rings on the top
      const [ax, ay] = P(x + w - 0.5, y + 0.45, t + 6);
      c.beginPath(); c.ellipse(ax, ay, 6, 6, 0, 0, TAU); stroke('#d9b44a', 1); c.beginPath(); c.ellipse(ax, ay, 6, 2.2, 0.4, 0, TAU); stroke('#d9b44a', 0.9); c.beginPath(); c.ellipse(ax, ay, 2.2, 6, 0.3, 0, TAU); stroke('#d9b44a', 0.8); A.circ(ax, ay, 1.4, E.accent);
      top = t + 13;
    }
    const bw = Math.min(w - 0.9, 1.3 + band * 0.1), bd = Math.min(d - 0.6, 1.0);
    const h = stiltHouse(x + 0.2, y + 0.3, bw, bd, band >= 2 ? 0 : 3, 13 + band * 2, 'x', { rh: 10, du: 0.3 });
    top = Math.max(top, h.top);
    for (let k = 0; k < 3; k++) { const u = 0.55 + k * 0.28; if (u < bw - 0.1) A.win(h.b, 'L', u, 6, 0.14, 7); }
    if (band >= 2) { const dt = shellDome(x + 0.2 + bw / 2, y + 0.3 + bd / 2, 0.32, top - 3, 12); top = Math.max(top, dt); const [px, py] = P(x + 0.2 + bw / 2, y + 0.3 + bd / 2, dt); A.line([px, py], [px, py - 5], '#d9b44a', 1); top = Math.max(top, dt + 5); }
    // a spyglass on a tripod for reading the stars and the swell
    { const gx = x + w * 0.55, gy = y + d - 0.35, [tx, ty] = P(gx, gy); A.line([tx - 3, ty], [tx, ty - 9], PILE, 0.9); A.line([tx + 3, ty], [tx, ty - 9], PILE, 0.9); A.line([tx, ty + 1], [tx, ty - 9], PILE, 0.9); A.line([tx - 4, ty - 7], [tx + 5, ty - 12], '#b08a3a', 2.2); A.circ(tx + 5, ty - 12, 1.1, '#3f5a6a'); }
    // a tide clock: a post with a dial in a little pool
    roundPool(x + 0.45, y + d - 0.45, 0.2);
    { const [cx, cy] = P(x + 0.45, y + d - 0.45, 0); A.line([cx, cy], [cx, cy - 13], PILE, 1.2); A.circ(cx, cy - 15, 3, '#f4ece0', A.OUT); A.line([cx, cy - 15], [cx + 2, cy - 16.5], '#3a2a20', 0.7); }
    if (T('cartography') || band >= 3) { // a great globe and a chart table
      const gx = x + w - 0.45, gy = y + d - 0.45; A.cyl(gx, gy, 0.07, 0, 5, E.wood2); const [ox, oy] = P(gx, gy, 9); A.circ(ox, oy, 4, '#3f8ab0', A.OUT); if (!A.GLOW) { A.circ(ox - 1, oy - 1, 1.6, '#7aa050'); A.circ(ox + 1.8, oy + 1.2, 1, '#7aa050'); } c.beginPath(); c.arc(ox, oy, 5, -0.8, 2.3); stroke('#d9b44a', 0.8);
      const tb = A.box(x + 1.1, y + d - 0.6, 0.45, 0.3, 0, 5, E.wood); void tb; A.poly(A.quad(x + 1.12, y + d - 0.58, 0.41, 0.26, 5.2), '#efe2c0', null);
    }
    return top + 2;
  });

  // =================================================================
  //  TAVERN — "The Drowned Gull": a beached ship turned alehouse, a cabin
  //  built on its deck; masts, lanterns and bunting come with growth
  // =================================================================
  B.tavern = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const long = d >= w, len = Math.max(w, d) - 0.35, beam = Math.min(w, d) - 0.45;
    const gx = x + (long ? 0.2 + beam / 2 + 0.05 : 0.15), gy = y + (long ? 0.15 : 0.2 + beam / 2 + 0.05);
    // keel blocks
    for (let k = 0; k < 3; k++) { const u = len * (0.25 + k * 0.25); A.box(long ? gx - 0.08 : gx + u - 0.08, long ? gy + u - 0.08 : gy - 0.08, 0.16, 0.16, 0, 3, '#7a6a5a'); }
    const hh = 9 + band * 1.5;
    const deckZ = shipHull(gx, gy, len, beam, 3, hh, !long, era >= 2 ? '#6a4a34' : '#7a5236');
    // portholes along the visible side
    for (let k = 0; k < 3 + band; k++) { const t = (k + 1) / (4 + band), sh = Math.sin(t * Math.PI); const p = long ? P(gx + beam * 0.5 * sh, gy + t * len, 3 + hh * 0.55) : P(gx + t * len, gy + beam * 0.5 * sh, 3 + hh * 0.55); A.circ(p[0], p[1], 1.6, '#e8dcc0', A.OUT); A.lampDot(p[0], p[1], 1, '#3f5a6a', '#ffc95c'); }
    // cabin on deck (aft)
    const cw = long ? beam * 0.7 : len * 0.42, cd = long ? len * 0.42 : beam * 0.7;
    const cx0 = long ? gx - cw / 2 : gx + len * 0.12, cy0 = long ? gy + len * 0.12 : gy - cd / 2;
    const cb = body(cx0, cy0, cw, cd, deckZ, 8 + band * 1.5, { wood: true });
    A.door(cb, long ? 'R' : 'L', (long ? cd : cw) * 0.5, 0.22, 6, '#4a3020');
    A.win(cb, long ? 'L' : 'R', (long ? cw : cd) * 0.5, 3, 0.16, 3.5);
    let top = roof(cb, (long ? cw : cd) * 11, long ? 'y' : 'x');
    // the mast(s) with bunting
    const nm = band >= 2 ? 2 : 1;
    for (let m = 0; m < nm; m++) {
      const u = len * (0.68 - m * 0.0) + (m ? -len * 0.0 : 0), mm = m ? 0.88 : 0.66;
      const p0 = long ? P(gx, gy + len * mm, deckZ) : P(gx + len * mm, gy, deckZ), mh = 26 + band * 5 - m * 6;
      A.line(p0, [p0[0], p0[1] - mh], '#5a4030', 1.6); A.line([p0[0] - 6, p0[1] - mh * 0.7], [p0[0] + 6, p0[1] - mh * 0.7], '#5a4030', 1);
      if (band >= 1) { const q = long ? P(gx, gy, deckZ + 6) : P(gx, gy, deckZ + 6); c.beginPath(); c.moveTo(p0[0], p0[1] - mh); c.quadraticCurveTo((p0[0] + q[0]) / 2, (p0[1] - mh + q[1]) / 2 + 6, q[0], q[1]); stroke(ROPE, 0.6); for (let k = 1; k < 6; k++) { const t = k / 6, bx = p0[0] + (q[0] - p0[0]) * t, by = (p0[1] - mh) + (q[1] - p0[1] + mh) * t + Math.sin(t * Math.PI) * 4; A.poly([[bx - 1.4, by], [bx + 1.4, by], [bx, by + 3]], [E.accent, ERA[1].roof, '#f0d890'][k % 3], null); } }
      if (m === 0) A.rec('flags', { x: p0[0], y: p0[1] - mh + 1, col: E.accent, len: 9, seed: A.R() });
      top = Math.max(top, deckZ + mh);
      void u;
    }
    // hanging sign & lanterns
    { const p = long ? P(gx + beam * 0.5, gy + len * 0.95, deckZ + 2) : P(gx + len * 0.95, gy + beam * 0.5, deckZ + 2); A.lantern(p[0], p[1] + 2, 1.6); }
    if (band >= 1) { const p = long ? P(gx + beam * 0.5, gy + len * 0.3, deckZ + 2) : P(gx + len * 0.3, gy + beam * 0.5, deckZ + 2); A.lantern(p[0], p[1] + 2, 1.4); }
    if (band >= 3) { const p = long ? P(gx, gy + len + 0.05, deckZ) : P(gx + len + 0.05, gy, deckZ); figurehead(p[0], p[1], 1, 1); }
    for (let k = 0; k < Math.min(3, lv + 1); k++) A.barrel(long ? x + 0.12 : x + 0.3 + k * 0.22, long ? y + 0.3 + k * 0.22 : y + d - 0.12);
    return top;
  });

  // =================================================================
  //  THEATRE — the Shell: a scallop-shell bandshell stage over the water,
  //  seating tiers on the shore that climb with growth; at night it glows
  // =================================================================
  B.theatre = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const long = w >= d;
    // a pool before the stage
    // stage at the back-left end; tiers toward the front-right
    const sx = x + 0.15, sy = y + 0.15, sw = long ? 0.8 : w - 0.3, sd = long ? d - 0.3 : 0.8;
    pool(sx, sy, sw, sd, true);
    pilings(sx + 0.05, sy + 0.05, sw - 0.1, sd - 0.1, 3);
    deck(sx + 0.05, sy + 0.05, sw - 0.1, sd - 0.1, 3, 1.2);
    // the great scallop shell rising behind the stage
    const shH = 22 + band * 7 + lv, scx = sx + sw / 2, scy = sy + sd / 2;
    const a = long ? P(sx + 0.08, sy + 0.05, 4) : P(sx + 0.05, sy + 0.08, 4), b = long ? P(sx + 0.08, sy + sd - 0.05, 4) : P(sx + sw - 0.05, sy + 0.08, 4);
    const m = lerp(a, b, 0.5), rad = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
    const rim = t => { const u = (1 - Math.cos(Math.PI * t)) / 2, p = lerp(a, b, u); return [p[0], p[1] - Math.sin(Math.PI * t) * shH]; };
    const fan = () => { c.beginPath(); c.moveTo(a[0], a[1]); for (let k = 1; k <= 24; k++) c.lineTo(...rim(k / 24)); c.closePath(); };
    fan();
    if (A.GLOW) { c.fillStyle = '#2a2018'; c.fill(); }
    else { const g = c.createRadialGradient(m[0], m[1], 2, m[0], m[1] - shH * 0.4, shH); g.addColorStop(0, era >= 3 ? '#fff4fa' : '#fbf0e6'); g.addColorStop(0.7, era >= 3 ? '#e8dcf0' : '#f0d8c8'); g.addColorStop(1, era >= 2 ? '#d89a88' : '#d8b098'); c.fillStyle = g; c.fill(); }
    stroke(A.OUT, 0.8);
    // ribs fanning from the hinge, with a scalloped rim
    if (!A.GLOW) for (let k = 1; k < 10; k++) A.line(m, rim(k / 10), 'rgba(160,100,80,0.5)', 0.7);
    for (let k = 0; k < 10; k++) { const p = rim((k + 0.5) / 10); A.circ(p[0], p[1], 1.6, era >= 3 ? '#f4ecf6' : '#f6e6da'); }
    // hinge "ears"
    A.poly([[m[0] - 5, m[1] + 1], [m[0] + 5, m[1] + 1], [m[0] + 3, m[1] - 4], [m[0] - 3, m[1] - 4]], era >= 3 ? '#e6c45a' : '#e0b8a0');
    if (era >= 3) nacreSheen([rim(0), rim(0.25), rim(0.5), rim(0.75), rim(1)]);
    // footlights
    for (let k = 0; k < 4; k++) { const p = lerp(a, b, (k + 0.5) / 4); A.lampDot(p[0] + 4, p[1] + 2, 0.9, '#e8c070', '#ffe0a0'); }
    { const [lx, ly] = P(scx, scy, 10); A.rec('lights', { x: lx, y: ly, r: 26 + band * 4 }); }
    // performers
    A.person(...P(scx + 0.1, scy - 0.1, 4.2), E.accent, 0.8); if (band >= 1) A.person(...P(scx + 0.15, scy + 0.25, 4.2), '#c0704a', 0.8);
    // seating tiers stepping up away from the stage
    const nt = 1 + Math.min(3, band + (lv >= 3 ? 1 : 0));
    for (let k = nt - 1; k >= 0; k--) {
      const off = 0.95 + k * 0.32, tz = 2 + k * 2.5;
      const tb = long ? A.box(x + off, y + 0.2, 0.3, d - 0.4, 0, tz, E.stone) : A.box(x + 0.2, y + off, w - 0.4, 0.3, 0, tz, E.stone);
      void tb;
      for (let j = 0; j < 3 + band; j++) { const t = (j + 0.5) / (3 + band); const p = long ? P(x + off + 0.15, y + 0.25 + t * (d - 0.5), tz) : P(x + 0.25 + t * (w - 0.5), y + off + 0.15, tz); if ((j + k) % 2 === 0) A.person(p[0], p[1], [E.accent, '#c0704a', '#e0b84a', '#4a6aa8'][(j + k) % 4], 0.6); }
    }
    if (band >= 2) { A.pennant(x + w - 0.15, y + 0.15, 0, 28, E.accent); }
    if (band >= 3) { A.pennant(x + w - 0.15, y + d - 0.15, 0, 26, ERA[1].roof); const tp = rim(0.5); pearlTip(tp[0], tp[1] + 2, 2); }
    return shH + 8;
  });

  // =================================================================
  //  TEMPLE — the House of the Deep: coral columns round a mirror tide-pool,
  //  a nautilus spire over a shell dome; the god's pearl glows in the lantern
  // =================================================================
  B.temple = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const cx = x + w / 2, cy = y + d / 2;
    let top = 0;
    if (band >= 1) top = spiralTower(x + 0.4, y + 0.4, 0.2, 0, 30 + band * 9 + lv, { capH: 14 });
    // platform & cella
    A.box(x + 0.25, y + 0.25, w - 0.5, d - 0.5, 0, 3, E.stone);
    const r = Math.min(w, d) * 0.3;
    A.cyl(cx + 0.1, cy + 0.1, r, 3, 13 + band * 3, stoneAge() ? E.stone : E.wall);
    { const [x0, y0, rx, ry] = A.ell(cx + 0.1, cy + 0.1, 3, r); A.lamp([[x0 - 2.4, y0 + ry], [x0 + 2.4, y0 + ry], [x0 + 2.4, y0 + ry - 7], [x0, y0 + ry - 9.5], [x0 - 2.4, y0 + ry - 7]], '#3e5a6a', '#bfeaff'); A.rec('lights', { x: x0, y: y0 + ry - 4, r: 20 }); }
    const dz = 3 + 13 + band * 3;
    A.cyl(cx + 0.1, cy + 0.1, r + 0.05, dz, 1.6, E.trim);
    const dt = shellDome(cx + 0.1, cy + 0.1, r + 0.04, dz + 1.6, 14 + band * 3);
    { const [px, py] = P(cx + 0.1, cy + 0.1, dt); pearlTip(px, py, 2 + band * 0.2); }
    top = Math.max(top, dt + 8);
    // ring of coral columns (front half after the cella)
    const nc = 6 + band * 2;
    for (let k = 0; k < nc; k++) { const a = k / nc * TAU; if (Math.cos(a) + Math.sin(a) < -0.2) continue; const gx = cx + 0.1 + Math.cos(a) * (r + 0.22), gy = cy + 0.1 + Math.sin(a) * (r + 0.22); A.cyl(gx, gy, 0.045, 3, 11 + band * 2, CORAL[3]); A.circ(...P(gx, gy, 14 + band * 2), 1.2, SHELL); }
    // mirror tide pool in front
    if (band >= 2 || T('medicine')) { roundPool(x + 0.45, y + d - 0.45, 0.22); A.rec('sparks', { x: P(x + 0.45, y + d - 0.45)[0], y: P(x + 0.45, y + d - 0.45)[1], kind: 'star' }); }
    if (band >= 3) { coral(x + w - 0.3, y + 0.35, 3, 1.1); coral(x + 0.3, y + d - 0.9, 3, 0.9, CORAL[2]); }
    return top;
  });

  // =================================================================
  //  SHRINE — a grotto of the sea-mother: a statue on a rock in a pool under
  //  a shell canopy; candles and offerings of shells grow round it
  // =================================================================
  B.shrine = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const cx = x + w / 2, cy = y + d / 2, r = Math.min(w, d) * 0.38;
    roundPool(cx, cy, r);
    A.rock(cx - 0.05, cy - 0.05, 1.0 + band * 0.15, A.SNOW ? '#d8dcde' : '#8a948e');
    // statue: a robed figure holding a shell
    const [sx, sy] = P(cx, cy, 6);
    A.poly([[sx - 3, sy], [sx + 3, sy], [sx + 1.6, sy - 12], [sx - 1.6, sy - 12]], era >= 3 ? '#f2ecf4' : '#e6e0d4'); A.circ(sx, sy - 13.5, 2, era >= 3 ? '#f2ecf4' : '#e6e0d4', A.OUT);
    nautilus(sx + 3, sy - 8, 2.2);
    let top = 22;
    if (band >= 1) { // shell canopy on two posts
      for (const f of [-1, 1]) A.line([sx + f * 7, sy + 4], [sx + f * 7, sy - 18], E.trim, 1.3);
      scallop(sx, sy - 22, 1.5 + band * 0.15, era >= 3 ? '#f0e8f4' : SHELL); top = 34 + band * 2;
    }
    A.lampDot(sx, sy - 9, 1.2, '#f6f2ff', '#fff6e4'); A.rec('lights', { x: sx, y: sy - 9, r: 16 });
    for (let k = 0; k < 2 + Math.min(4, lv + band); k++) { const a = k * 1.3 + 0.5; const [lx, ly] = P(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75); A.lampDot(lx, ly - 1.5, 0.9, '#e8c070', '#ffd890'); }
    A.shellPile(x + w - 0.25, y + d - 0.2, 3 + band);
    if (band >= 2) coral(x + 0.2, y + 0.25, 0, 0.9);
    return top;
  });

  // =================================================================
  //  HARBOR (only on an inland spare plot) — a little canal basin with a quay,
  //  a moored boat and a crane
  // =================================================================
  B.harbor = wrap(([x, y, w, d], L, band, ctx) => {
    if (ctx && ctx.coastal) return coastalHarbor([x, y, w, d], L, band, ctx);   // the shore harbour (below)
    pool(x + 0.15, y + 0.5, w - 0.3, d - 0.65);
    A.box(x + 0.1, y + 0.15, w - 0.2, 0.35, 0, 3, E.stone);
    boat(x + w / 2, y + d * 0.65, 0.8, true);
    if (band >= 1) boat(x + w * 0.3, y + d * 0.85, 0.6, true, '#6a8a9a');
    const s = body(x + 0.2, y + 0.05, 0.6, 0.4, 3, 8, { wood: band < 2 }); const top = roof(s, 7, 'x');
    if (band >= 2) { const t = P(x + w - 0.3, y + 0.3, 34); A.line(P(x + w - 0.3, y + 0.3, 3), t, '#7a5434', 1.8); A.line(t, P(x + w * 0.5, y + d * 0.6, 30), '#7a5434', 1.2); }
    buoy(x + w - 0.35, y + d - 0.3);
    return Math.max(top, band >= 2 ? 34 : 0);
  });

  // =================================================================
  //  MAGE TOWER — the tide-shell spire: an auger-shell spire cradling a water-orb,
  //  coral buttresses, a storm over it and at last a waterspout winding up the shell
  // =================================================================
  B.magetower = wrap(([x, y, w, d], L, band) => {
    // the tide-shell spire: a low conch grotto with a water-orb in a shell bowl (1-4) → a tall auger shell,
    // its suture spiralling up, the orb cradled at its tip (5-9) → coral buttresses, a bigger orb trailing
    // bubbles, a storm brewing over it (10-14) → a living waterspout winding up the shell, droplets wheeling
    // round a great sea-glass orb (15+). Sand → pearl → rose nacre by era.
    const M = CITYART.mage, cx = x + w / 2, cy = y + d / 2, k = Math.max(0, L - [1, 5, 10, 15][band]);
    const H = [20, 46, 58, 70][band] + Math.min(10, k * 2);
    const WATER = era >= 3 ? '#4ac8e8' : '#3aa0d0';
    roundPool(cx, cy + 0.05, 0.42 + band * 0.05);
    if (band >= 2) M.groundCircle(A, cx, cy + 0.05, 0.66, 'rgba(40,130,170,0.5)', '#9cf0ff', 14);
    coral(cx - 0.45, cy + 0.2, 0, 0.7 + band * 0.12);
    if (band >= 2) coral(cx + 0.2, cy - 0.46, 0, 0.6 + band * 0.1);
    const turns = 2 + band, r0 = [0.3, 0.42, 0.46, 0.5][band], z0 = 2;
    const shellC = era >= 3 ? '#efe6f2' : era >= 2 ? '#f2e2d0' : era >= 1 ? '#ead6bc' : '#dcc8a8';
    const tip = A.cone(cx, cy, r0, z0, H, shellC);
    A.twistLines(cx, cy, z0, tip, r0, A.shade(shellC, -0.35), turns, 0.97);
    A.twistLines(cx, cy, z0 + 3, tip, r0 * 0.9, '#c0704a', turns, 0.97, 0.5);
    for (let i = 1; i < turns * 6; i++) {
      const t = i / (turns * 6), ang = t * TAU * turns, rr = r0 * (1 - t * 0.97);
      if (Math.cos(ang) + Math.sin(ang) <= 0.2) continue;
      const [kx, ky] = P(cx + Math.cos(ang) * rr * 1.05, cy + Math.sin(ang) * rr * 1.05, z0 + (tip - z0) * t);
      if (i % 3 === 0) { A.lampDot(kx, ky + 3, 1.1, '#2a6a8a', '#bff4ff'); if (i % 6 === 0) M.pulse(A, kx, ky + 3, 6, '#8ff0ff', 1.8); } else A.circ(kx, ky, 1.3 - t * 0.6, A.shade(shellC, 0.1), A.OUT);
    }
    // the flared pink aperture at its foot, a door in its lip
    { const [ax, ay, arx] = A.ell(cx + 0.2, cy + 0.2, z0, r0 * 0.75); c.beginPath(); c.ellipse(ax, ay - 4, arx * 0.7, 7, -0.4, 0, TAU); fill(era >= 3 ? '#f4c8d8' : '#e8a090'); stroke(A.OUT, 0.7); c.beginPath(); c.ellipse(ax, ay - 4, arx * 0.4, 4.5, -0.4, 0, TAU); c.fillStyle = A.GLOW ? '#6ad8ff' : '#7a3a3a'; c.fill(); }
    if (era >= 3 && !A.GLOW && !A.SNOW) { const [x0, y0, rx] = A.ell(cx, cy, z0, r0); nacreSheen([[x0 - rx, y0], [x0, y0 - H], [x0 + rx, y0]]); }
    if (band >= 3) { // the waterspout: two glowing streams winding up round the shell
      for (const ph of [0, Math.PI]) M.spiral(A, cx, cy, z0 + 2, tip + 6, r0 * 1.3, 'rgba(70,170,220,0.85)', '#9cf0ff', turns * 0.6, 0.7, ph, 2);
      M.ring(A, cx, cy, tip - 4, 0.42, '#9cf0ff', 6, 0.9);
    }
    // the water-orb: in a shell bowl on the tip, rising as the tower grows
    const oz = tip + 6 + band * 2, orR = [3.2, 4.2, 5.4, 6.6][band];
    const [ox, oy] = P(cx, cy, oz);
    { const [bx, by] = P(cx, cy, tip - 1); c.beginPath(); c.moveTo(bx - orR - 2, by - 2); c.quadraticCurveTo(bx, by + 5, bx + orR + 2, by - 2); c.quadraticCurveTo(bx, by + 1, bx - orR - 2, by - 2); fill(era >= 2 ? '#f4c8d8' : SHELL); stroke(A.OUT, 0.7); }
    M.orb(A, ox, oy, orR, WATER);
    if (!A.GLOW) { c.beginPath(); c.moveTo(ox - orR * 0.7, oy + orR * 0.15); c.quadraticCurveTo(ox - orR * 0.2, oy - orR * 0.15, ox, oy + orR * 0.15); c.quadraticCurveTo(ox + orR * 0.3, oy + orR * 0.4, ox + orR * 0.7, oy + orR * 0.1); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.7; c.stroke(); }
    M.pulse(A, ox, oy, orR * 2.6, '#8ff0ff', 1.3);
    if (band >= 1) M.rise(A, ox, oy - orR, { r: orR * 0.6, h: 18 + band * 6, n: 3 + band, col: '#c8f8ff', sp: 0.3, sz: 1.4 });
    // the storm it calls
    if (band >= 2) M.cloud(A, P(cx, cy, oz + 18)[0], P(cx, cy, oz + 18)[1], 0.8 + band * 0.12, 'rgba(90,100,120,0.6)');
    A.rec('magic', { x: ox, y: oy, r: 9 + band * 3 + Math.min(6, L / 3), n: 3 + band * 2 + Math.floor(L / 5), col: 'rgba(120,230,255,A)', seed: A.R(), bolt: band >= 2 });
    A.rec('lights', { x: ox, y: oy, r: 30 + band * 8, col: 'sea' });
    const top = oz + orR + (band >= 2 ? 22 : 4);
    return { top, noDress: ['stock'], hit: [[x + 0.15, y + 0.15, w - 0.3, d - 0.3, oz + orR]] };
  });

  // =================================================================
  //  HIDEOUT — the smugglers' den: a shack under a keel-up wreck, a sea cave,
  //  crates of contraband and a shuttered lantern
  // =================================================================
  B.hideout = wrap(([x, y, w, d], L, band) => {
    const lv = L - [1, 5, 10, 15][band];
    const bw = Math.max(0.5, Math.min(w - 0.4, 0.9 + band * 0.12)), bd = Math.max(0.42, Math.min(d - 0.5, 0.6 + band * 0.05));
    // a sea-cave in a rock outcrop behind the shack
    { const [rx, ry] = P(x + 0.25, y + 0.12); c.beginPath(); c.moveTo(rx - 14, ry + 6); c.quadraticCurveTo(rx - 12, ry - 22, rx + 4, ry - 24); c.quadraticCurveTo(rx + 22, ry - 18, rx + 24, ry + 4); c.closePath(); fill(A.SNOW ? '#e2e6e8' : '#7e7a72'); stroke(A.OUT, 0.7);
      c.beginPath(); c.moveTo(rx - 4, ry + 3); c.quadraticCurveTo(rx + 2, ry - 14, rx + 10, ry + 2); c.closePath(); c.fillStyle = A.GLOW ? '#1a1008' : '#1e1a18'; c.fill(); A.lampDot(rx + 3, ry - 3, 1, '#5a4a30', '#ffb040'); }
    const b = body(x + 0.2, y + Math.min(0.3, Math.max(0.12, d - bd - 0.2)), bw, bd, 0, 6 + band, { wood: true, col: '#7a6a54' });
    A.door(b, 'L', bw * 0.3, 0.2, 5.5, '#2a2018');
    const top = hullRoof(b.x, b.y, bw, bd, b.h, 9 + band * 1.5, 'x', '#5a4a3a');
    // a hooded lantern, dim by day, a slit of light by night
    const [lx, ly] = A.onL(b, bw * 0.7, bw * 0.7, b.h * 0.6, 0)[0]; A.lampDot(lx, ly, 1.1, '#5a4a30', '#ffb040'); A.rec('lights', { x: lx, y: ly, r: 10 });
    for (let k = 0; k < 2 + Math.min(4, band + lv); k++) A.crate(x + 0.25 + (k % 3) * 0.26, y + d - 0.45 + Math.floor(k / 3) * 0.05, 0.22, Math.floor(k / 3) * 5);
    if (band >= 1) boat(x + w - 0.35, y + 0.4, 0.6, false, '#4a5a5a');
    if (band >= 2) A.netRack(x + w - 0.3, y + d - 0.3, true);
    if (band >= 3) { const [sx, sy] = P(x + 0.15, y + d - 0.15); A.line([sx, sy], [sx, sy - 12], PILE, 1); A.circ(sx, sy - 13, 1.6, '#ece2c8', A.OUT); }
    return top + 2;
  });

  // =================================================================
  //  WONDER — the Pearl Lighthouse on a spare plot: a mother-of-pearl
  //  spiral with a pearl lantern and a sweeping beam
  // =================================================================
  B.wonder_tide = wrap(([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, H = 46 + band * 10 + L;
    roundPool(cx, cy, Math.min(w, d) * 0.42);
    A.rock(cx - 0.1, cy, 1.4, A.SNOW ? '#d8dcde' : '#9aa49e');
    const t = spiralTower(cx, cy, 0.3, 4, H, { col: '#f6f0f4', capCol: '#e0d8ec', capH: 12 });
    // the great pearl lantern crowning it
    const [px, py] = P(cx, cy, t + 4), pr = 4 + band;
    A.line([px, py + 4], [px, py], '#d9b44a', 1.4);
    A.lampDot(px, py - pr, pr, '#f4eef6', '#fff6e0');
    if (!A.GLOW) { A.circ(px - pr * 0.35, py - pr * 1.35, pr * 0.3, '#ffffff'); c.beginPath(); c.arc(px, py - pr, pr, 0, TAU); stroke('rgba(180,150,200,0.7)', 0.7); }
    A.rec('beams', { x: px, y: py - pr, col: 'pearl' }); A.rec('lights', { x: px, y: py - pr, r: 40 }); A.rec('sparks', { x: px, y: py - pr, kind: 'star' });
    A.rock(cx + 0.35, cy + 0.3, 0.9, A.SNOW ? '#d8dcde' : '#9aa49e');
    gulls(px, py - 18, 26, 3);
    return t + 6 + pr * 2;
  });

  // =================================================================
  //  WALL segments — driftwood stakes hung with nets → coral rubble with
  //  shells → coral ashlar with scallop merlons → pearl-white with a teal cap
  // =================================================================
  B.wall = wrap(([fx, fy, fw, fd], L, band, ctx) => {
    const along = ctx.along, a = ctx.a, b = ctx.b, len = b - a;
    const ptF = (u, z) => along ? P(u, fy + fd, z) : P(fx + fw, u, z);   // on the visible face
    if (band <= 0) {
      const n = Math.max(2, Math.round(len / 0.18));
      for (let k = 0; k < n; k++) {
        const u = a + (k + 0.5) * len / n, gx = along ? u : fx + fw / 2, gy = along ? fy + fd / 2 : u;
        const h = 14 + ((k * 7) % 3) * 2, [bx, by] = P(gx, gy), [tx, ty] = P(gx, gy, h);
        A.poly([[bx - 2, by], [bx + 2, by], [tx + 2, ty + 2.5], [tx, ty - 1.5], [tx - 2, ty + 2.5]], k % 4 === 1 ? '#b8a888' : '#a8987a', A.OUT, 0.6);
      }
      // net strung along it with floats
      const q = [ptF(a, 12), ptF(b, 12), ptF(b, 4), ptF(a, 4)];
      for (let k = 0; k <= 3; k++) { const t = k / 3; A.line(lerp(q[0], q[3], t), lerp(q[1], q[2], t), ROPE, 0.5); }
      for (let k = 0; k <= Math.round(len * 5); k++) { const t = k / Math.max(1, Math.round(len * 5)); A.line(lerp(q[0], q[1], t), lerp(q[3], q[2], t), ROPE, 0.4); }
      if (Math.round(a * 2) % 3 === 0) { const p = lerp(q[0], q[1], 0.5); A.circ(p[0], p[1], 1.5, '#e0a040', A.OUT); }
      return 16;
    }
    const H = 18 + band * 4;
    const col = band === 1 ? '#cfc2ac' : band === 2 ? '#e2d4c4' : '#f2ece6';
    const bx = A.box(fx, fy, fw, fd, 0, H, col);
    if (band === 1) { // rubble: irregular stones and shells
      if (!A.GLOW && !A.SNOW) for (let k = 0; k < len * 6; k++) { const u = a + (k + 0.5) / 6, v = 3 + ((k * 5) % 4) * 3.5; const p = ptF(Math.min(b - 0.05, u), v); c.beginPath(); c.ellipse(p[0], p[1], 2.4 + (k % 3) * 0.5, 1.5, 0, 0, TAU); fill(A.shade(col, k % 2 ? -0.1 : 0.08)); if (k % 3 === 0) A.circ(p[0] + 2, p[1] - 2, 0.8, k % 2 ? CORAL[0] : SHELL); }
    } else {
      A.courses(bx, 4, A.shade(col, -0.12));
      if (!A.GLOW && !A.SNOW) A.line(ptF(a, 1.5), ptF(b, 1.5), '#4f7a46', 1.6);   // weed line at the foot
    }
    // cap / merlons
    if (band >= 2) {
      const capC = band >= 3 ? ERA[2].roof : E.stone;
      A.box(fx - 0.03, fy - 0.03, fw + 0.06, fd + 0.06, H, 1.6, capC);
      const n = Math.max(1, Math.round(len / 0.33));
      for (let k = 0; k < n; k++) { const u = a + (k + 0.5) * len / n, p = ptF(u, H + 1.6); c.beginPath(); c.moveTo(p[0] - 3.2, p[1]); c.arc(p[0], p[1], 3.2, Math.PI, TAU); c.closePath(); fill(A.SNOW ? '#f2f6f8' : band >= 3 ? '#f8f2ee' : col); stroke(A.OUT, 0.6); if (!A.GLOW && !A.SNOW) for (const o of [-1.6, 0, 1.6]) A.line([p[0], p[1]], [p[0] + o, p[1] - 2.8], A.shade(col, -0.25), 0.4); }
      if (band >= 3 && Math.round(a) % 2 === 0) { const p = ptF(a + len / 2, H * 0.55); A.circ(p[0], p[1], 2.4, '#e6c45a', A.OUT); A.lampDot(p[0], p[1], 1.4, '#3f5a6a', '#ffd27a'); }
    } else {
      const n = Math.max(1, Math.round(len / 0.3));
      for (let k = 0; k < n; k += 2) { const u0 = a + k * len / n, u1 = Math.min(b, u0 + len / n); A.box(along ? u0 : fx, along ? fy : u0, along ? u1 - u0 : fw, along ? fd : u1 - u0, H, 3, col); }
    }
    if (T('fortification') && Math.round(a) % 2 === 1) { const p = ptF(a + len / 2, H + 2); A.line([p[0], p[1]], [p[0], p[1] - 9], PILE, 1); A.lantern(p[0] + 2.5, p[1] - 5, 1.3); }
    return H + 3;
  });
  // =================================================================
  //  SHORE & WALL PIECES — shared helpers
  // =================================================================
  // the wall's own stone per band (matches B.wall): driftwood → coral rubble → coral ashlar → pearl-white
  const WALLSTONE = ['#cfc2ac', '#cfc2ac', '#e2d4c4', '#f2ece6'];
  // a convex prism over a grid polygon: the visible side faces, then the top
  function prism(pts, z0, z1, col, o = {}) {
    const n = pts.length; let cx = 0, cy = 0; for (const p of pts) { cx += p[0] / n; cy += p[1] / n; }
    const st = o.stroke === undefined ? A.OUT : o.stroke;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      let nx = q[1] - p[1], ny = -(q[0] - p[0]);
      if (nx * ((p[0] + q[0]) / 2 - cx) + ny * ((p[1] + q[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
      if (nx + ny <= 1e-4) continue;
      A.poly([P(p[0], p[1], z0), P(q[0], q[1], z0), P(q[0], q[1], z1), P(p[0], p[1], z1)], A.shade(o.side || col, ny > nx ? -0.04 : -0.2), st, 0.6);
    }
    A.poly(pts.map(p => P(p[0], p[1], z1)), o.top || sn(A.shade(col, 0.1)), st, 0.6);
  }
  // a round drum of coral stone with courses, shell inlay and a weed line at the foot
  function drum(cx, cy, r, z, h, col, wet = true) {
    A.cyl(cx, cy, r, z, h, col);
    const [x, y, rx, ry] = A.ell(cx, cy, z, r);
    for (let v = 4; v < h - 1; v += 4) { c.beginPath(); c.ellipse(x, y - v, rx, ry, 0, 0.12, Math.PI - 0.12); stroke(A.shade(col, -0.16), 0.55); }
    if (!A.GLOW && !A.SNOW) {
      for (let v = 6, k = 0; v < h - 3; v += 7, k++) for (const a of [0.5 + (k % 2) * 0.5, 1.9 + (k % 2) * 0.4]) A.circ(x + Math.cos(a) * rx * 0.9, y - v + Math.sin(a) * ry * 0.9, 0.75, k % 3 ? SHELL : CORAL[0]);
      if (wet) { c.beginPath(); c.ellipse(x, y - 1.4, rx, ry, 0, 0.05, Math.PI - 0.05); stroke('#4f7a46', 1.8); }
    }
  }
  // a crown of scallop merlons round the front half of a drum
  function scallopCrown(cx, cy, r, z, col, s = 1) {
    const [x, y, rx, ry] = A.ell(cx, cy, z, r), pts = [];
    for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI; pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry, Math.sin(a)]); }
    pts.sort((p, q) => p[2] - q[2]);
    for (const [px, py] of pts) {
      c.beginPath(); c.moveTo(px - 2.6 * s, py); c.arc(px, py, 2.6 * s, Math.PI, TAU); c.closePath(); fill(A.SNOW ? '#f2f6f8' : col); stroke(A.OUT, 0.55);
      if (!A.GLOW && !A.SNOW) for (const o of [-1.3, 0, 1.3]) A.line([px, py], [px + o * s, py - 2.3 * s], A.shade(col, -0.25), 0.4);
    }
  }
  // an auger-shell conch cap; era 3 nacre sheen and a pearl
  function conchCap(cx, cy, r, z, h, pearl) {
    const col = era >= 3 ? '#e4dcee' : era >= 2 ? E.cap : era >= 1 ? '#d0705a' : '#8a7a56';
    const tip = A.cone(cx, cy, r, z, h, col);
    if (!A.SNOW) A.twistLines(cx, cy, z, tip, r, A.shade(col, -0.32), 2.6, 0.95);
    if (era >= 3 && !A.GLOW && !A.SNOW) { const [x0, y0, rx] = A.ell(cx, cy, z, r); nacreSheen([[x0 - rx, y0], [x0, y0 - h], [x0 + rx, y0]]); }
    if (pearl) { const [px, py] = P(cx, cy, tip); pearlTip(px, py, 1.6); return tip + 8; }
    return tip;
  }
  // a little pearl-boat: a coral-red hull, its scallop-shell sail
  function pearlBoat(dd, u, len, col, sail, z = 0) {
    const S = X, [gx, gy] = S.pt(dd, u);
    boat(gx, gy, len, S.edge === 'N' || S.edge === 'S', col, z);
    if (!A.GLOW && !A.SNOW) { const [bx, by] = P(gx, gy, z); A.line([bx - 5, by + 1.5], [bx + 5, by + 1.5], 'rgba(255,255,255,0.5)', 0.7); }
    if (!sail) return z + 4;
    const [mx, my] = S.at(dd, u, z + 1.5), h = 10 + len * 7;
    if (A.SNOW) { A.line([mx, my], [mx, my - h * 0.8], PILE, 1); A.line([mx - 0.5, my - h * 0.6], [mx + 4.5, my - h * 0.55], SHELL, 2.2); A.line([mx - 0.5, my - h * 0.8 - 0.5], [mx + 0.5, my - h * 0.8 - 0.5], '#f6fafc', 1.4); return z + h * 0.8 + 2; }   // sail furled in the ice
    A.line([mx, my], [mx, my - h], PILE, 1);
    const sc = era >= 3 ? '#f4eef6' : sail === true ? SHELL : sail;
    c.beginPath(); c.moveTo(mx + 0.5, my - 3); for (let k = 0; k <= 10; k++) { const a = -Math.PI * 0.95 + k / 10 * Math.PI * 0.62, rr = h * 0.72 * (1 + 0.06 * (k % 2)); c.lineTo(mx + 0.5 + Math.cos(a) * rr * 0.75 + h * 0.42, my - 3 + Math.sin(a) * rr); } c.closePath(); fill(sc); stroke(A.OUT, 0.6);
    if (!A.GLOW) for (let k = 1; k < 6; k++) { const a = -Math.PI * 0.95 + k / 6 * Math.PI * 0.62; A.line([mx + 0.5, my - 3], [mx + 0.5 + Math.cos(a) * h * 0.7 * 0.75 + h * 0.42, my - 3 + Math.sin(a) * h * 0.7], A.shade(sc, -0.22), 0.5); }
    return z + h + 3;
  }
  // a tall ship moored along a pier: hull, two masts with coral-striped square sails and a shell banner
  function tideShip(d0, d1, u, big) {
    const S = X, p0 = S.pt(d0, u), p1 = S.pt(d1, u), alongX = S.edge === 'N' || S.edge === 'S';
    const gx = Math.min(p0[0], p1[0]), gy = Math.min(p0[1], p1[1]), len = Math.abs(d1 - d0);
    const hull0 = era >= 3 ? '#7a5a6a' : era >= 2 ? '#3f6a7a' : '#8a5a3a';
    if (A.SNOW) { // iced in at the pier: a sheet of broken ice round the hull
      const m = (d0 + d1) / 2, r = len / 2 + 0.35, hw = (big ? 0.46 : 0.36) / 2 + 0.3, ring = [];
      for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; ring.push(P(...S.pt(m + Math.cos(a) * r, u + Math.sin(a) * hw))); }
      A.poly(ring, '#eef5f9', '#a9c2d0', 0.6);
    }
    const hh = big ? 7 : 5, top = shipHull(gx, gy, len, big ? 0.46 : 0.36, -1, hh, alongX, A.SNOW ? A.mix(hull0, '#b9cad4', 0.4) : hull0);
    let zt = top;
    const masts = big ? [0.32, 0.68] : [0.5];
    for (const f of masts) {
      const dm = d0 + (d1 - d0) * f, [bx, by] = S.at(dm, u, top), H = (big ? 34 : 24) * (f === masts[0] && big ? 0.85 : 1);
      A.line([bx, by], [bx, by - H], '#4a3a2a', big ? 1.5 : 1.1);
      for (const [v, w] of [[H * 0.45, 8], [H * 0.78, 6]]) {
        const y0 = by - v - 7, q = [[bx - w, y0], [bx + w, y0], [bx + w * 1.05, y0 + 9], [bx - w * 1.05, y0 + 9]];
        A.line([bx - w - 1, y0], [bx + w + 1, y0], '#4a3a2a', 0.9);
        if (A.SNOW) { A.line([bx - w, y0 + 1], [bx + w, y0 + 1], '#e8dcc0', 2.2); A.line([bx - w, y0 - 0.4], [bx + w, y0 - 0.4], '#f6fafc', 1); continue; }   // sails furled on the yards
        A.poly(q, era >= 3 ? '#f6f0f2' : '#f2ead6', A.OUT, 0.5);
        if (!A.GLOW) A.poly([[bx - w * 0.33, y0], [bx + w * 0.33, y0], [bx + w * 0.35, y0 + 9], [bx - w * 0.35, y0 + 9]], era >= 2 ? E.accent : CORAL[0], null);
      }
      A.rec('flags', { x: bx, y: by - H + 1, col: A.STY.flag, len: 9, seed: A.R() });
      zt = Math.max(zt, top + H);
    }
    if (big) { const [fx, fy] = S.at(d0, u, top + 3); A.circ(fx, fy, 1.6, era >= 3 ? '#e6c45a' : '#d8b080', A.OUT); }
    return zt;
  }

  // =================================================================
  //  HARBOR on the coast — coral moles and shell-roofed boathouses: one driftwood jetty and a
  //  pearl-boat at first; then moles of coral rubble, boathouses with keel or shell roofs, a diving
  //  platform over the pearl-beds, net racks; then tall ships, a whalebone crane, and at last a
  //  nacre beacon on the mole head
  // =================================================================
  function coastalHarbor(slot, L, band, S) {
    if (!L) return undefined;
    const D = S.depth, u0 = S.u0, us = S.piers.slice().sort((p, q) => p - q), molC = WALLSTONE[Math.min(3, era + 1)];
    const stone = era >= 1;
    const jobs = [], J = (dd, u, fn, bias = 0) => { const g = S.pt(dd, u); jobs.push([g[0] + g[1] + bias, fn]); };
    let top = 20;
    // quay along the shore joining the piers: driftwood boards, coral stone from the second era
    const qa = us[0] - 0.4, qb = us[us.length - 1] + 0.4;
    J(0, -99, () => {
      for (let u = qa; u < qb - 0.01; u += 0.25) {
        const u1 = Math.min(qb, u + 0.25), pts = [S.pt(D(u) - 0.2, u), S.pt(D(u1) - 0.2, u1), S.pt(D(u1) + 0.32, u1), S.pt(D(u) + 0.32, u)];
        prism(pts, -1, 3, stone ? molC : E.wood, { stroke: null });
      }
      const ln = []; for (let u = qa; u <= qb + 0.001; u += 0.25) ln.push(S.at(D(u) - 0.2, u, 3));
      c.beginPath(); ln.forEach((p, k) => k ? c.lineTo(...p) : c.moveTo(...p)); stroke(A.shade(stone ? molC : E.wood, -0.35), 0.8);
      if (stone && !A.GLOW && !A.SNOW) { const w2 = []; for (let u = qa; u <= qb + 0.001; u += 0.25) w2.push(S.at(D(u) - 0.2, u, 0.6)); c.beginPath(); w2.forEach((p, k) => k ? c.lineTo(...p) : c.moveTo(...p)); stroke('#4f7a46', 1.4); }
    }, -1000);
    // piers: the main coral mole at u0, driftwood jetties on pilings beside it
    const outs = [];
    us.forEach((u, i) => {
      const dd0 = D(u), main = Math.abs(u - u0) < 0.01, reach = main ? (band >= 2 ? 2.7 : band >= 1 ? 2.3 : 1.9) : 1.8 + band * 0.2;
      const out = Math.max(0.45, dd0 - reach); outs.push([u, out, dd0, main]);
      J((out + dd0) / 2, u, () => {
        if (main && stone) {
          // a low mole of tumbled coral rubble: three uneven runs stepping out to a rough head, dark and weedy at the waterline
          const hw = 0.19 + band * 0.015, mc = A.mix(molC, '#8e8676', 0.35), d1 = dd0 + 0.2, d2 = out + 0.3, sp = (d1 - d2) / 3;
          const sum = g => g[0] + g[1], near = sum(S.pt((d1 + d2) / 2, u + 1)) > sum(S.pt((d1 + d2) / 2, u - 1)) ? 1 : -1;
          const runs = [[hw + 0.02, 3.3], [hw - 0.025, 2.8], [hw + 0.01, 3.1]].map(([w, z], k) => [d1 - sp * k + 0.02, d1 - sp * (k + 1), w, z]);
          runs.sort((p, q) => sum(S.pt(p[0], u)) - sum(S.pt(q[0], u)));
          for (const [da, db, w, z] of runs) {
            prism([S.pt(da, u - w), S.pt(da, u + w), S.pt(db, u + w * 0.9), S.pt(db, u - w * 0.9)], -2, z, mc, { top: sn(A.mix(mc, '#a49a86', 0.3)) });
            if (!A.GLOW && !A.SNOW) for (let dd = db + 0.06, k = 0; dd < da - 0.04; dd += 0.11, k++) { const p = S.at(dd, u + near * w * 0.97, 1.2 + (k * 7 % 3) * 0.7); c.beginPath(); c.ellipse(p[0], p[1], 2 + (k % 3) * 0.5, 1.2, 0, 0, TAU); fill(A.shade(mc, k % 2 ? -0.16 : 0.06)); if (k % 4 === 1) A.circ(p[0] + 1.4, p[1] - 0.8, 0.7, k % 8 === 1 ? CORAL[0] : SHELL); }
            // broken rubble along both top edges
            for (const sd of [-near, near]) for (let dd = db + 0.1, k = 0; dd < da - 0.05; dd += 0.17, k++) { const p = S.at(dd, u + sd * w * 0.85, z + 0.4); c.beginPath(); c.ellipse(p[0], p[1], 1.6 + (k % 2) * 0.6, 1.1, 0, 0, TAU); fill(sn(A.shade(mc, (k % 3 - 1) * 0.1))); stroke(A.OUT, 0.35); }
            if (!A.SNOW) { A.line(S.at(da, u + near * w, 0.5), S.at(db, u + near * w * 0.9, 0.5), '#3f5a44', 2.2); A.line(S.at(da, u + near * w, -0.6), S.at(db, u + near * w * 0.9, -0.6), '#2c3c3a', 1.4); }
          }
          // a rough, lower head of heaped blocks, with tumbled stones in the water round it
          const hr = hw + 0.1, oc = [], rf = [1, 0.9, 1.06, 0.88, 1, 0.93, 1.08, 0.9];
          for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; oc.push(S.pt(d2 + Math.cos(a) * hr * rf[k], u + Math.sin(a) * hr * rf[k])); }
          const rocks = () => { for (const du of [-0.3, 0.26]) A.rock(...S.pt(d2 - 0.12, u + du), 0.3, sn('#7e786c')); }, seaFront = sum(S.pt(d2 - 0.4, u)) > sum(S.pt(d2, u));
          if (!seaFront) rocks();
          prism(oc, -2, 3.6, mc, { top: sn(A.mix(mc, '#a49a86', 0.3)) });
          if (seaFront) rocks();
          if (!A.GLOW && !A.SNOW) { for (let k = 0; k < 4; k++) { const p = S.at(d2 + Math.cos(k * 1.7) * hr * 0.5, u + Math.sin(k * 1.7) * hr * 0.5, 3.8); A.circ(p[0], p[1], 0.8, k % 2 ? SHELL : CORAL[k % 3]); } for (let dd = out + 0.6; dd < dd0; dd += 0.45) { const p = S.at(dd, u + (dd * 7 % 2 ? 0.08 : -0.07), 3.2); A.circ(p[0], p[1], 0.7, (dd * 3 | 0) % 2 ? SHELL : CORAL[(dd * 5 | 0) % 3]); } }
        } else {
          const hw = main ? 0.24 : 0.19, z = 3;
          for (let dd = out + 0.1; dd < dd0; dd += 0.55) for (const du of [-hw + 0.02, hw - 0.02]) { const a = S.at(dd, u + du, -3), b = S.at(dd, u + du, z); A.line(a, b, PILE, 1.4); if (!A.GLOW) A.line(a, S.at(dd, u + du, -0.8), '#4f7a46', 1.6); }
          A.poly([S.at(dd0 + 0.3, u - hw, z), S.at(dd0 + 0.3, u + hw, z), S.at(out, u + hw, z), S.at(out, u - hw, z)], sn(E.wood), A.OUT, 0.5);
          if (!A.SNOW) for (let dd = out + 0.12; dd < dd0 + 0.3; dd += 0.2) A.line(S.at(dd, u - hw, z), S.at(dd, u + hw, z), A.shade(E.wood, -0.22), 0.45);
          for (const du of [-hw, hw]) A.line(S.at(out + 0.05, u + du, z + 3), S.at(Math.min(dd0, out + 1.4), u + du, z + 3), ROPE, 0.6);
        }
      }, -500);
    });
    // boats and ships on the water beside the piers
    outs.forEach(([u, out, dd0, main], i) => {
      const len = dd0 - out;
      if (main && band >= 2 && len > 1.6) J(out + 1, u - 0.62, () => { top = Math.max(top, tideShip(out + 0.15, out + Math.min(2.1, len - 0.1), u - 0.62, true)); });
      else if (!main && band >= 3 && len > 1.3 && i === outs.length - 1) J(out + 0.9, u + 0.56, () => { top = Math.max(top, tideShip(out + 0.15, out + Math.min(1.7, len - 0.1), u + 0.56, false)); });
      else if (len > 0.8) { const du = i % 2 ? -0.5 : 0.5, dd = out + Math.min(0.75, len * 0.4); J(dd, u + du, () => pearlBoat(dd, u + du, 0.62, i % 2 ? '#3f8a9a' : '#c0604a', true)); }
      if (len > 1.4 && (band >= 1 || main)) { const du = i % 2 ? 0.48 : -0.48, dd = out + len * 0.72; J(dd, u + du, () => pearlBoat(dd, u + du, 0.48, '#a86a44', band >= 1 && i % 3 === 1 ? '#f0c0b0' : false)); }
      // buoys and a lantern post at each pier head
      J(out - 0.25, u + 0.3, () => { buoy(...S.pt(Math.max(0.15, out - 0.25), u + 0.3), i % 2 ? '#f0c050' : '#d8503a'); });
      J(out + 0.06, u - 0.2, () => { const p = S.at(out + 0.08, u - 0.2, main && stone ? 3.6 : 3); A.line(p, [p[0], p[1] - 9], PILE, 1); A.lantern(p[0], p[1] - 6, 1.3); }, 0.01);
    });
    // the diving platform over the pearl-beds, off the main mole (band 1+)
    if (band >= 1) {
      const o = outs.find(q => q[3]) || outs[0], [u, out] = o, du = 0.62, dd = out + 0.25, z = 12 + band * 2;
      J(dd, u + du, () => {
        const p = S.pt(dd, u + du), s = 0.2;
        for (const [ax, ay] of [[-s, -s], [s, -s], [-s, s], [s, s]]) { const a = P(p[0] + ax, p[1] + ay, -3), b = P(p[0] + ax, p[1] + ay, z); A.line(a, b, PILE, 1.5); if (!A.GLOW) A.line(a, P(p[0] + ax, p[1] + ay, -0.6), '#4f7a46', 1.8); }
        A.line(P(p[0] - s, p[1] + s, 1), P(p[0] + s, p[1] + s, z - 1), PILE, 0.6); A.line(P(p[0] + s, p[1] - s, 1), P(p[0] + s, p[1] + s, z - 1), PILE, 0.6);
        deck(p[0] - s - 0.04, p[1] - s - 0.04, 2 * s + 0.08, 2 * s + 0.08, z, 1.2);
        const tip = S.pt(dd - 0.55, u + du); A.poly([P(p[0], p[1] - 0.06, z + 1.2), P(p[0], p[1] + 0.06, z + 1.2), P(tip[0], tip[1] + 0.06, z + 1.2), P(tip[0], tip[1] - 0.06, z + 1.2)], E.trim, A.OUT, 0.5);
        const [wx, wy, wrx, wry] = A.ell(...S.pt(Math.max(0.3, dd - 0.6), u + du), 0, 0.5);
        if (!A.SNOW) A.rec('divers', { x: wx, y: wy, rx: wrx, ry: wry, seed: A.R() });
        const [hx, hy] = P(p[0], p[1], z + 1.2); A.circ(hx, hy - 6, 1.5, '#c89a7a', A.OUT); A.line([hx, hy - 4.5], [hx, hy], '#3f8a9a', 1.6);
        if (band >= 2) { A.line([hx + 4, hy], [hx + 4, hy - 13], PILE, 0.9); scallop(hx + 4, hy - 15, 0.7, era >= 3 ? '#f0e8f4' : SHELL); }
        top = Math.max(top, z + 20);
      });
    }
    // boathouse(s): stilted sheds half over the water, keel-up hull roofs → shell domes
    const bh = band >= 2 ? [u0 - 0.58, u0 + 1.68] : band >= 1 ? [u0 - 0.58] : [];
    for (const u of bh) {
      if (u < S.a + 0.5 || u > S.b - 0.5) continue;
      const dd0 = D(u);
      J(dd0 + 0.1, u, () => {
        const a = S.pt(dd0 - 0.32, u - 0.3), b = S.pt(dd0 + 0.36, u + 0.3);
        const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), d = Math.abs(a[1] - b[1]);
        pilings(x, y, w, d, 3);
        deck(x - 0.05, y - 0.05, w + 0.1, d + 0.1, 3, 1.2);
        const bd = body(x, y, w, d, 4.2, 8 + band, { wood: era < 2 });
        sheen(bd);
        const alongX = S.edge === 'N' || S.edge === 'S';
        A.door(bd, 'L', w * 0.5, Math.min(0.32, w * 0.6), 6, '#2e4a58'); roundWin(bd, 'R', d * 0.5, (8 + band) * 0.55, 1.3);
        let t2;
        if (era >= 2) t2 = shellDome(x + w / 2, y + d / 2, Math.min(w, d) * 0.62, bd.z + bd.h, 9 + band * 2);
        else t2 = hullRoof(x, y, w, d, bd.z + bd.h, 7 + band, alongX ? 'x' : 'y');
        if (era >= 3) { const [px, py] = P(x + w / 2, y + d / 2, t2); pearlTip(px, py, 1.4); t2 += 6; }
        else { const [fx, fy] = P(x + w / 2, y + d / 2, t2); gull(fx, fy); }
        top = Math.max(top, t2 + 4);
      });
    }
    // net racks and fish racks along the quay
    { const u = u0 + 0.56, dd = D(u) + 0.12; J(dd, u, () => A.netRack(...S.pt(dd, u), !(S.edge === 'N' || S.edge === 'S'))); }
    if (band >= 2 && us.length > 3) { const u = us[0] + 0.55, dd = D(u) + 0.12; J(dd, u, () => fishRack(...S.pt(dd, u), !(S.edge === 'N' || S.edge === 'S'), 4)); }
    if (L >= 3) { const u = u0 - 0.2, dd = D(u) + 0.25; J(dd, u, () => { A.shellPile(...S.pt(dd, u), 3 + band); A.crate(...S.pt(dd + 0.05, u + 0.25), 0.2); }); }
    // the whalebone crane at the root of the main mole (level 5+): bone shear-legs, a jib and a net of pearl-shell
    if (L >= 5) {
      const cu = u0 + 0.36, cdd = D(cu) + 0.05, H = 30 + band * 5;
      J(cdd, cu, () => {
        const bone = era >= 2 ? '#f2ead8' : '#e8dcc0';
        const f1 = S.at(cdd + 0.22, cu - 0.2, 3), f2 = S.at(cdd + 0.22, cu + 0.2, 3), t0 = S.at(cdd, cu, H), j = S.at(Math.max(0.5, cdd - 1.4), cu, H - 4);
        for (const f of [f1, f2]) { c.beginPath(); c.moveTo(...f); c.quadraticCurveTo(f[0] + (t0[0] - f[0]) * 0.4 - 4, f[1] + (t0[1] - f[1]) * 0.55, t0[0], t0[1]); stroke(A.OUT, 3.4); c.beginPath(); c.moveTo(...f); c.quadraticCurveTo(f[0] + (t0[0] - f[0]) * 0.4 - 4, f[1] + (t0[1] - f[1]) * 0.55, t0[0], t0[1]); stroke(bone, 2.2); }
        A.line(t0, j, A.OUT, 2.6); A.line(t0, j, bone, 1.6); A.line(S.at(cdd, cu, H - 10), j, ROPE, 0.7);
        const hk = S.at(Math.max(0.5, cdd - 1.4), cu, 12); A.line(j, hk, ROPE, 0.6);
        c.beginPath(); c.ellipse(hk[0], hk[1] + 2, 3, 2.6, 0, 0, TAU); fill('#c8b890'); stroke(A.OUT, 0.5); A.line([hk[0] - 3, hk[1] + 1], [hk[0] + 3, hk[1] + 3], ROPE, 0.5);
        if (!A.GLOW) { A.circ(hk[0] - 1, hk[1] + 1.5, 0.8, '#f6f2ff'); A.circ(hk[0] + 1, hk[1] + 2.4, 0.7, '#f0d8e8'); }
        const [wx, wy] = S.at(cdd + 0.3, cu, 5); c.beginPath(); c.arc(wx, wy, 4, 0, TAU); stroke(PILE, 0.9); A.line([wx - 4, wy], [wx + 4, wy], PILE, 0.6); A.line([wx, wy - 4], [wx, wy + 4], PILE, 0.6);
        top = Math.max(top, H + 4);
      });
    }
    // a nacre beacon on the mole head in the Legend band
    if (band >= 3) {
      const o = outs.find(q => q[3]) || outs[0], [u, out] = o;
      J(out + 0.3, u, () => {
        const [gx, gy] = S.pt(out + 0.3, u), t = spiralTower(gx, gy, 0.13, stone ? 3.6 : 3, 20, { gallery: false, capH: 6, col: era >= 3 ? '#f6f0f4' : undefined });
        const [px, py] = P(gx, gy, t); A.lampDot(px, py - 3, 2.2, '#f4eef6', '#fff6e0'); A.rec('lights', { x: px, y: py - 3, r: 26 }); A.rec('sparks', { x: px, y: py - 3, kind: 'star' });
        top = Math.max(top, t + 6);
      }, 0.02);
    }
    // gulls and glints on the water
    { const [gx, gy] = S.at(Math.max(0.5, D(u0) - 1.4), u0 + 0.6, 30); gulls(gx, gy, 26, 2 + band); }
    if (!A.SNOW) { const [sx, sy] = S.at(Math.max(0.4, D(u0) * 0.45), u0 - 1, 0); A.rec('sparks', { x: sx, y: sy, kind: 'water', rx: 30, ry: 12 }); }
    jobs.sort((p, q) => p[0] - q[0]);
    for (const [, fn] of jobs) fn();
    return top;
  }

  // =================================================================
  //  LIGHTHOUSE (town hall 10+) — the Pearl Light: a nautilus-wound tower on a coral reef,
  //  a gilded lantern cage holding a great pearl; taller, with buttresses and a gallery, in the Legend band
  // =================================================================
  B.lighthouse = wrap(([x, y, w, d], L, band, ctx) => {
    const gx = x + w / 2, gy = y + d / 2;
    // the reef: foam, rocks and coral heads
    if (!A.SNOW && !A.GLOW) { const [fx, fy, rx, ry] = A.ell(gx, gy, 0, 0.62); c.beginPath(); c.ellipse(fx, fy, rx, ry, 0, 0, TAU); stroke('rgba(255,255,255,0.65)', 1.2); }
    A.rock(gx - 0.18, gy - 0.2, 1.1, A.SNOW ? '#d8dcde' : '#8a948e'); A.rock(gx + 0.25, gy - 0.12, 0.9, A.SNOW ? '#d8dcde' : '#9aa49e');
    coral(gx - 0.42, gy + 0.18, 0, 0.9, CORAL[0]); coral(gx + 0.1, gy + 0.42, 0, 0.8, CORAL[2]);
    const base = era >= 1 ? WALLSTONE[Math.min(3, era + 1)] : '#bdb5a0';
    drum(gx, gy, 0.4, 0, 5, base);
    const H = 44 + band * 8 + Math.min(10, Math.max(0, L - 10));
    const col = era >= 3 ? '#f6f0f4' : era >= 2 ? '#f8ece0' : '#efe2cc';
    // tapered tower wound with a coral spiral
    const [x0, y0] = P(gx, gy, 5), r0 = 0.3 * A.SQ2 * A.HW, r1 = 0.2 * A.SQ2 * A.HW;
    c.beginPath(); c.moveTo(x0 - r0, y0); c.lineTo(x0 - r1, y0 - H); c.lineTo(x0 + r1, y0 - H); c.lineTo(x0 + r0, y0); c.ellipse(x0, y0, r0, r0 / 2, 0, 0, Math.PI); c.closePath(); A.gradFill(x0 - r0, x0 + r0, col);
    if (!A.SNOW) for (let k = 0; k < 3; k++) { c.beginPath(); for (let i = 0; i <= 24; i++) { const t = i / 24, v = t * H, rr = r0 + (r1 - r0) * t, a = t * TAU * 1.6 + k * TAU / 3; if (Math.sin(a) < -0.05) { c.stroke(); c.beginPath(); continue; } const px = x0 + Math.cos(a) * rr, py = y0 - v + Math.sin(a) * rr * 0.5; c.lineTo(px, py); } stroke(era >= 2 ? E.accent : '#c0704a', 2.4); }
    if (era >= 3) nacreSheen([[x0 - r0, y0], [x0 - r1, y0 - H], [x0 + r1, y0 - H], [x0 + r0, y0]]);
    for (let v = 10; v < H - 8; v += 11) A.lampDot(x0 + r0 * 0.25, y0 - v, 1.3, E.glass, '#ffd27a');
    A.poly([[x0 - 2.2, y0 + 2], [x0 + 2.2, y0 + 2], [x0 + 2.2, y0 - 5], [x0, y0 - 7], [x0 - 2.2, y0 - 5]], '#355a6a', A.OUT, 0.5);
    // coral buttresses at the foot in the Legend band
    if (band >= 3) for (const s of [-1, 1]) A.poly([[x0 + s * r0, y0], [x0 + s * (r0 + 5), y0 + 1], [x0 + s * r0 * 0.85, y0 - H * 0.3]], A.shade(col, -0.12), A.OUT, 0.5);
    let z = 5 + H;
    // gallery with a rope rail
    A.cyl(gx, gy, 0.3, z, 2, E.wood); rail2(gx, gy, 0.3, z + 2);
    // lantern cage: gold ribs round the great pearl
    const [lx, ly] = P(gx, gy, z + 2), pr = 4 + band * 0.6, cageH = 13;
    const gold = era >= 1 ? '#d9b44a' : '#8a7a56';
    A.poly([[lx - 6, ly], [lx + 6, ly], [lx + 6, ly - cageH], [lx - 6, ly - cageH]], A.GLOW ? '#000' : 'rgba(200,230,240,0.35)', null);
    A.lampDot(lx, ly - cageH / 2, pr, '#f4eef6', '#fff6e0');
    if (!A.GLOW) { A.circ(lx - pr * 0.35, ly - cageH / 2 - pr * 0.4, pr * 0.3, '#ffffff'); c.beginPath(); c.arc(lx, ly - cageH / 2, pr, 0, TAU); stroke('rgba(180,150,200,0.7)', 0.7); }
    for (const dx of [-6, -2, 2, 6]) A.line([lx + dx, ly], [lx + dx, ly - cageH], gold, 0.9);
    z += 2 + cageH;
    const tip = conchCap(gx, gy, 0.32, z, 14 + band * 2, false);
    const [tx, ty] = P(gx, gy, tip); pearlTip(tx, ty, 1.6);
    A.rec('beams', { x: lx, y: ly - cageH / 2, col: 'pearl' }); A.rec('lights', { x: lx, y: ly - cageH / 2, r: 40 + band * 6 }); A.rec('sparks', { x: lx, y: ly - cageH / 2, kind: 'star' });
    gulls(lx, ly - 30, 26, 2);
    return { top: tip + 8, hit: [[gx - 0.4, gy - 0.4, 0.8, 0.8, tip + 8]] };
  });

  // =================================================================
  //  WALL TOWERS — coral drums matching the wall: rubble with a shell cap, then ashlar with a
  //  scallop crown, then pearl-white with an auger-shell conch and a pearl
  // =================================================================
  B.walltower = wrap(([sx, sy, sw, sd], L, band, ctx) => {
    const gx = ctx.gx, gy = ctx.gy, corner = !!ctx.corner, b = Math.max(1, band);
    const col = WALLSTONE[b], r = corner ? 0.42 : 0.36, H = 18 + b * 4 + (corner ? 14 : 9) + b * 3;
    A.cyl(gx, gy, r * 1.14, 0, 3, A.shade(col, -0.18));
    drum(gx, gy, r, 3, H - 3, col);
    // windows: lamp-lit round ports
    for (let v = 12; v < H - 6; v += 11) { const [wx, wy] = P(gx + r * 0.55, gy + r * 0.8, v); A.lampDot(wx, wy, 1.3, E.glass, '#ffd27a'); }
    let top = H;
    if (b === 1) { // rubble drum: a low kelp / shell cap
      A.cyl(gx, gy, r * 1.12, H, 2, A.shade(col, 0.05));
      top = shellDome(gx, gy, r * 1.0, H + 2, 10, era === 0 ? '#c9b98e' : E.dome);
      if (!A.SNOW) { const [x, y] = P(gx, gy, H + 2); A.line([x - 6, y + 1], [x - 7, y + 5], E.roof2, 0.9); }
    } else {
      A.cyl(gx, gy, r * 1.2, H, 2.2, b >= 3 ? ERA[2].roof : E.stone);
      scallopCrown(gx, gy, r * 1.15, H + 2.2, b >= 3 ? '#f8f2ee' : col, 1);
      top = H + 5;
      if (b >= 3 || corner) top = conchCap(gx, gy, r * 0.9, H + 2.2, corner ? 18 + b * 3 : 14, b >= 3);
      if (b >= 3 && !A.GLOW) { const [x, y] = P(gx + r * 0.7, gy + r * 0.7, H * 0.55); A.circ(x, y, 2.2, '#e6c45a', A.OUT); A.lampDot(x, y, 1.2, '#3f5a6a', '#ffd27a'); }
    }
    if (ctx.fortified || T('fortification')) { const [lx, ly] = P(gx + r * 0.95, gy + r * 0.4, H * 0.6); A.line([lx, ly], [lx + 2, ly], PILE, 0.7); A.lantern(lx + 2, ly + 4, 1.2); }
    if (corner && b >= 2) { const [fx, fy] = P(gx, gy, top); A.rec('flags', { x: fx, y: fy + 1, col: A.STY.flag, len: 9, seed: A.R() }); }
    return { top, hit: [[gx - 0.45, gy - 0.45, 0.9, 0.9, top]] };
  });

  // =================================================================
  //  GATE (main road) — a whalebone arch hung with nets → coral pillars topped with shells and
  //  a rope of floats → a gatehouse of two coral drums over a round-arched passage under a great scallop
  // =================================================================
  function gatePiece(ctx, band, wide) {
    const along = ctx.along, f = ctx.fixed, g0 = ctx.g0, g1 = ctx.g1, mid = (g0 + g1) / 2;
    const at = (u, z = 0, o = 0) => along ? P(u, f + o, z) : P(f + o, u, z);
    const gp = (u, o = 0) => along ? [u, f + o] : [f + o, u];
    if (band <= 0) {
      // whalebone: two jawbones meeting in a point, nets and floats hung from the posts
      const hgt = wide ? 32 : 22, a0 = at(g0), a1 = at(g1), tp = at(mid, hgt);
      for (const [p0, sgn] of [[a0, 1], [a1, -1]]) for (const [lw, col] of [[4.4, A.OUT], [3, '#efe6d6']]) { c.beginPath(); c.moveTo(...p0); c.quadraticCurveTo(p0[0] - sgn * 5, tp[1] + 6, tp[0], tp[1]); stroke(col, lw); }
      for (const u of [g0 - 0.18, g1 + 0.18]) { const [bx, by] = at(u), [tx, ty] = at(u, 15); A.poly([[bx - 2, by], [bx + 2, by], [tx + 2, ty + 2.5], [tx, ty - 1.5], [tx - 2, ty + 2.5]], '#a8987a', A.OUT, 0.6); }
      if (wide) { nautilus(tp[0], tp[1] + 5, 3); A.line(at(g0 + 0.2, 20), at(g1 - 0.2, 20), ROPE, 0.6); for (let k = 1; k < 4; k++) { const p = lerp(at(g0 + 0.2, 20), at(g1 - 0.2, 20), k / 4); A.circ(p[0], p[1] + 2, 1.4, k % 2 ? '#e0a040' : '#d8503a', A.OUT); } }
      return { top: hgt + 6 };
    }
    const b = band, col = WALLSTONE[Math.min(3, b)], H = 18 + b * 4, t = wide ? 0.5 : 0.42;
    if (b === 1 || !wide) {
      // pillars (gate) / a doorway in a raised wall block (postern)
      if (!wide) {
        const bx0 = g0, len = g1 - g0, bb = along ? A.box(bx0, f - t / 2, len, t, 0, H + 5, col) : A.box(f - t / 2, bx0, t, len, 0, H + 5, col);
        coralCourses(bb, col);
        const side = along ? 'L' : 'R', w0 = (g1 - g0) * 0.55, u = len / 2, face = along ? A.onL : A.onR;
        const q = face(bb, u - w0 / 2, u + w0 / 2, 0, H * 0.5), tp = face(bb, u, u, H * 0.5 + w0 * 9, 0)[0];
        c.beginPath(); c.moveTo(...q[0]); c.lineTo(...q[1]); c.lineTo(...q[2]); c.quadraticCurveTo(q[2][0], tp[1], tp[0], tp[1]); c.quadraticCurveTo(q[3][0], tp[1], q[3][0], q[3][1]); c.closePath(); fill(A.GLOW ? '#000' : '#2a3a40'); stroke(A.shade(col, -0.3), 1.2);
        void side;
        const ps = face(bb, u, u, H * 0.5 + w0 * 9 + 5, 0)[0]; scallop(ps[0], ps[1], 0.6, b >= 3 ? '#f0e8f4' : SHELL);
        if (b >= 2) { const n = 3; for (let k = 0; k < n; k++) { const p = face(bb, len * (k + 0.5) / n, 0, H + 5, 0)[0]; c.beginPath(); c.moveTo(p[0] - 2.6, p[1]); c.arc(p[0], p[1], 2.6, Math.PI, TAU); c.closePath(); fill(A.SNOW ? '#f2f6f8' : col); stroke(A.OUT, 0.5); } }
        const [lx, ly] = face(bb, u + w0 / 2 + 0.06, 0, H * 0.5 + 2, 0)[0]; A.lantern(lx + 1, ly, 1.2);
        return { top: H + 10 };
      }
      for (const u of [g0 + 0.04, g1 - 0.04]) { const [cx, cy] = gp(u); drum(cx, cy, 0.2, 0, H + 6, col, true); scallop(...P(cx, cy, H + 12), 0.75, era >= 3 ? '#f0e8f4' : SHELL); }
      const a = at(g0 + 0.04, H + 2), z = at(g1 - 0.04, H + 2), pts = [];
      for (let k = 0; k <= 10; k++) { const tt = k / 10; pts.push([a[0] + (z[0] - a[0]) * tt, a[1] + (z[1] - a[1]) * tt + Math.sin(tt * Math.PI) * 7]); }
      c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(...p) : c.moveTo(...p)); stroke(ROPE, 1);
      for (let k = 1; k < 10; k += 2) A.circ(pts[k][0], pts[k][1] + 1.5, 1.4, k % 4 === 1 ? '#e0a040' : '#d8503a', A.OUT);
      return { top: H + 22 };
    }
    // gatehouse: two drum towers and a passage block between under a scallop pediment
    const tr = 0.28, TH = H + 14 + (b - 2) * 6;
    const [c0x, c0y] = gp(g0 + 0.02), [c1x, c1y] = gp(g1 - 0.02);
    const tower = (cx, cy) => {
      A.cyl(cx, cy, tr * 1.14, 0, 3, A.shade(col, -0.18)); drum(cx, cy, tr, 3, TH - 3, col);
      A.cyl(cx, cy, tr * 1.2, TH, 2, b >= 3 ? ERA[2].roof : E.stone); scallopCrown(cx, cy, tr * 1.15, TH + 2, b >= 3 ? '#f8f2ee' : col, 0.9);
      const [wx, wy] = P(cx + tr * 0.5, cy + tr * 0.85, TH * 0.6); A.lampDot(wx, wy, 1.3, E.glass, '#ffd27a');
      return b >= 3 ? conchCap(cx, cy, tr * 0.95, TH + 2, 16, true) : TH + 5;
    };
    let top = tower(c0x, c0y);
    // passage block
    const p0 = g0 + 0.24, p1 = g1 - 0.24;
    const bb = along ? A.box(p0, f - 0.25, p1 - p0, 0.5, 0, H + 6, col) : A.box(f - 0.25, p0, 0.5, p1 - p0, 0, H + 6, col);
    coralCourses(bb, col);
    const face = along ? A.onL : A.onR, len = p1 - p0, u = len / 2, ow = len * 0.8;
    const q = face(bb, u - ow / 2, u + ow / 2, 0, H * 0.48), tp = face(bb, u, u, H * 0.48 + ow * 8, 0)[0];
    const arch = () => { c.beginPath(); c.moveTo(...q[0]); c.lineTo(...q[1]); c.lineTo(...q[2]); c.quadraticCurveTo(q[2][0], tp[1], tp[0], tp[1]); c.quadraticCurveTo(q[3][0], tp[1], q[3][0], q[3][1]); c.closePath(); };
    arch(); fill(A.GLOW ? '#000' : '#24343a'); stroke(A.shade(col, -0.32), 1.6);
    // open sea-green doors folded back, a portcullis of driftwood
    if (!A.GLOW) { for (let k = 1; k < 5; k++) { const p0 = lerp(q[0], q[1], k / 5); A.line(p0, [p0[0], p0[1] - (q[0][1] - q[3][1]) * 0.9], '#5a4a38', 0.7); } }
    // merlons over the passage, the great scallop pediment, a gilt nautilus in the Legend band
    const n = Math.max(2, Math.round(len / 0.33));
    for (let k = 0; k < n; k++) { const p = face(bb, len * (k + 0.5) / n, 0, H + 6, 0)[0]; c.beginPath(); c.moveTo(p[0] - 2.8, p[1]); c.arc(p[0], p[1], 2.8, Math.PI, TAU); c.closePath(); fill(A.SNOW ? '#f2f6f8' : b >= 3 ? '#f8f2ee' : col); stroke(A.OUT, 0.5); }
    const pc = face(bb, u, u, H * 0.48 + ow * 8 + 7, 0)[0];
    scallop(pc[0], pc[1], 1.1 + (b - 2) * 0.2, era >= 3 ? '#f0e8f4' : era >= 1 ? '#f0c0b0' : SHELL);
    if (b >= 3) nautilus(pc[0], pc[1] - 1, 2.4, '#e6c45a');
    const ban = face(bb, u, u, H + 4, 0)[0];
    if (ctx.side === 'S' || ctx.side === 'E' || b >= 3) for (const s of [-1, 1]) { const bx = ban[0] + s * 13, by = ban[1] + s * (along ? 6.5 : -6.5); A.poly([[bx - 2.5, by - 2], [bx + 2.5, by - 2], [bx + 2.5, by + 8], [bx, by + 6], [bx - 2.5, by + 8]], A.STY.flag, A.OUT, 0.5); if (!A.GLOW) A.circ(bx, by + 2.5, 1, SHELL); }
    for (const s of [0.07, len - 0.07]) { const p = face(bb, s, 0, H * 0.5, 0)[0]; A.lantern(p[0], p[1], 1.2); }
    top = Math.max(top, tower(c1x, c1y), H + 6 + 16);
    return { top };
  }
  B.gate = wrap((s, L, band, ctx) => { const r = gatePiece(ctx, band, true); return { top: r.top, hit: [[s[0], s[1], s[2], s[3], r.top]] }; });
  B.postern = wrap((s, L, band, ctx) => { const r = gatePiece(ctx, band, false); return { top: r.top, hit: [[s[0], s[1], s[2], s[3], r.top]] }; });

})();

// cityview opt-outs (the return-object format in js/cityart.js): stock extras this people's art already draws itself.
// Wraps the return value only — the drawings above are untouched.
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.tide) return;
  const R = CITYART.tide, O = {
    smelter: { noTech: ['metallurgy', 'bellows'] },   // the lime kiln is its own chimney
    farm: { noTech: ['granaries'] },
    market: { noDress: true },
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
