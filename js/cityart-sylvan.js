// Building art for the sylvan — see the CITYART contract in js/cityart.js
//  Sylvani: elven forest folk whose halls are grown, not built. Woven
//  sapling bowers (band 0) become living trunk-halls with bark-and-leaf
//  spire roofs (band 1), then trees ringed by spiral stairs and decks
//  (band 2), and finally canopy towns of rope bridges and hanging lanterns
//  (band 3). The era moves the craft on: raw leaf and wicker (Founding) →
//  carved bark shingles (Kingdom) → moon-white stone footings and arches
//  (Empire) → silver-barked trees, gilded lanterns and glowing runes
//  (Legend). Fireflies drift round the glades at night.
'use strict';
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.sylvan) return;
  const ART = CITYART.sylvan;
  let A = null, C = null;
  const BARK = '#7a5a3c', BARK_D = '#5a4028', SILVER = '#c4b8a0', WICKER = '#b08c58', WOOD = '#a8774a', WOOD_D = '#6e5136',
    MOON = '#e8e6dc', FIELD = '#a3a08a', MOSS = '#5e8a46', STRAW = '#d9be7a', GOLD = '#e0b440', TEAL = '#7fe0c0';
  const def = (t, fn) => { ART[t] = (api, slot, L, band, ctx) => { A = api; C = ctx; return fn(slot, L, band, ctx); }; };
  const T = id => { try { return !!C.tech(id); } catch (e) { return false; } };
  const era = () => C.era || 0;
  const snowy = col => A.SNOW ? A.mix(col, '#f3f6f9', 0.8) : col;
  // bark: silver on the great trees of the Legend era
  const bark = (civic = false) => civic && era() >= 3 ? SILVER : era() >= 3 ? '#86684a' : BARK;
  // roofs: fresh leaf → bark shingle → green leaf-tile → silver-green
  const roofOf = () => ['#6aa64e', '#86683e', '#3f8a5e', '#6aa294'][era()];
  // footing stone: none (roots) → mossy fieldstone (masonry) → moon-white (Empire / architecture)
  const stoneOf = () => era() >= 2 || T('architecture') ? MOON : T('masonry') ? FIELD : null;
  const lampCol = () => era() >= 3 ? GOLD : '#e8b85a';
  const scene = () => { const q = []; let top = 0; return { add: (gx, gy, f) => q.push([gx + gy, f]), run: () => { q.sort((a, b) => a[0] - b[0]); for (const e of q) { const h = e[1](); if (typeof h === 'number' && h > top) top = h; } return top; } }; };

  // ---------------- low-level strokes ----------------
  const stroke = (col, lw) => { const c = A.c; c.strokeStyle = A.F(col); c.lineWidth = lw; c.stroke(); };
  const curve = (a, cp, b, col, lw) => { const c = A.c; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(cp[0], cp[1], b[0], b[1]); stroke(col, lw); };
  const Gp = (cx, cy, t, rr, z) => A.P(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr, z);
  const front = t => Math.cos(t) + Math.sin(t) > 0;
  const lightFill = (build, day, night) => { const c = A.c; c.beginPath(); build(c); c.fillStyle = A.GLOW ? night : day; c.fill(); };
  const fireflies = (gx, gy, z, r = 20) => { const [x, y] = A.P(gx, gy, z); A.rec('sparks', { x, y, kind: 'grove', r }); };
  const leaves = () => {
    const s = A.SEASON;
    if (era() >= 3 && s !== 3) return s === 2 ? ['#9a7a1e', '#d4a83a', '#f4dc7a'] : ['#3f8a5a', '#66b67a', '#d4eec0'];
    return [['#4f8a3e', '#6eac50', '#a8d878'], ['#3f7334', '#558f40', '#7db35a'], ['#8a6a1e', '#c4962e', '#e8c45a'], ['#3f6a52', '#5a8a6e', '#e9f1f3']][s];
  };
  // a leafy crown (seasonal); r in tiles
  function crown(cx, cy, z, r, blossom = false) {
    const [x, y] = A.P(cx, cy, z);
    A.blobs(x, y, r * A.HW * 1.1, leaves(), blossom && A.SEASON === 0);
    return z + r * A.HW * 1.25;
  }
  // a hanging lantern on a short cord (warm, gilded in the Legend era)
  function hang(x, y, r = 1.5, len = 4) {
    A.line([x, y - len], [x, y - r], '#3a2a20', 0.7);
    A.lampDot(x, y, r, lampCol(), '#ffe08a');
    if (!A.GLOW) A.circ(x, y - r, r * 0.5, WOOD_D);
    A.rec('lights', { x, y, r: r * 6 });
  }
  function tealLamp(x, y, r = 1.6) { A.line([x, y - 5], [x, y - r], '#3a2a20', 0.6); A.lampDot(x, y, r, '#8fd8c0', '#c8ffe8'); A.rec('lights', { x, y, r: r * 7, col: 'grove' }); }
  // lanterns strung on a sagging cord between screen points
  function lanternString(a, b, n = 3, sag = 5) {
    const c = A.c, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag * 2];
    c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(m[0], m[1], b[0], b[1]); stroke('#4a3a2a', 0.6);
    for (let k = 1; k <= n; k++) { const t = k / (n + 1), x = (1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * m[0] + t * t * b[0], y = (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * m[1] + t * t * b[1]; A.lampDot(x, y + 1.5, 1.2, lampCol(), '#ffe08a'); A.rec('lights', { x, y: y + 1.5, r: 7 }); }
  }

  // ---------------- living architecture ----------------
  // a trunk with flared roots and bark grain
  function trunk(cx, cy, r, z0, h, o = {}) {
    const col = o.col || bark(o.civic);
    A.cyl(cx, cy, r, z0, h, col, A.shade(col, 0.12));
    const nb = Math.max(5, Math.round(r * 26));
    if (!A.GLOW) for (let k = 0; k < nb; k++) { const t = -Math.PI / 4 + (k + 0.5) / nb * Math.PI; curve(Gp(cx, cy, t, r * 0.98, z0 + 2), Gp(cx, cy, t + 0.25, r * 1.0, z0 + h * 0.5), Gp(cx, cy, t - 0.05, r * 0.98, z0 + h - 1), A.shade(col, -0.25), 0.6); }
    if (!A.GLOW && r > 0.2 && h > 20) { const [kx, ky] = Gp(cx, cy, 0.1, r, z0 + h * 0.4); A.c.beginPath(); A.c.ellipse(kx, ky, 1.6, 2.4, 0, 0, Math.PI * 2); A.c.fillStyle = A.shade(col, -0.35); A.c.fill(); if (!A.SNOW && h > 30) { const [mx, my] = Gp(cx, cy, 1.2, r, z0 + 4); A.c.beginPath(); A.c.ellipse(mx, my, 4, 2, 0, 0, Math.PI * 2); A.c.fillStyle = MOSS; A.c.fill(); } }
    if (!o.noRoots && z0 <= 0.01) for (const t of [-0.5, 0.35, 1.1, 1.9]) A.poly([Gp(cx, cy, t - 0.4, r * 0.95, 0), Gp(cx, cy, t, r * 1.9, 0), Gp(cx, cy, t + 0.4, r * 0.95, 0), Gp(cx, cy, t, r * 0.9, Math.min(h * 0.25, 9))], A.shade(col, -0.08));
    return z0 + h;
  }
  // a few boughs reaching out of a trunk top into the crown
  function boughs(cx, cy, z, r, col) {
    const [x, y] = A.P(cx, cy, z);
    for (const [dx, dy] of [[-1, -0.7], [1, -0.8], [-0.4, -1.1], [0.5, -1.15]]) curve([x, y + 4], [x + dx * r * 10, y], [x + dx * r * 22, y + dy * r * 18], col || bark(), 2.2);
  }
  // a curved elven spire roof: concave cone with leaf/shingle scallops and a curled finial
  function spireRoof(cx, cy, r, z, h, col, o = {}) {
    const c = A.c; col = snowy(col || roofOf());
    const [x, y, rx, ry] = A.ell(cx, cy, z, r), lean = o.lean === undefined ? 2 : o.lean, tx = x + lean, ty = y - h;
    c.beginPath(); c.moveTo(x - rx, y); c.quadraticCurveTo(x - rx * 0.22, y - h * 0.3, tx, ty); c.quadraticCurveTo(x + rx * 0.22, y - h * 0.3, x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, Math.PI); c.closePath();
    A.gradFill(x - rx, x + rx, col);
    if (!A.GLOW && !A.SNOW) {
      const dk = A.shade(col, -0.24);
      for (const f of [0.0, 0.22, 0.45]) {
        const w = rx * Math.pow(1 - f, 2.1) * (1 - f * 0.1), yy = y - h * f * 0.62 + ry * (1 - f) * 0.9, n = Math.max(3, Math.round(w / 3.2));
        for (let k = 0; k < n; k++) { const xx = x - w + (k + 0.5) * 2 * w / n; c.beginPath(); c.arc(xx, yy - Math.sin((k + 0.5) / n * Math.PI) * ry * (1 - f) * 0.8, w / n, 0.1, Math.PI - 0.1); stroke(dk, 0.6); }
      }
    }
    // curled leaf finial
    curve([tx, ty], [tx + 5, ty - 4], [tx + 6.5, ty + 0.5], o.tip || A.shade(col, -0.3), 1.2);
    if (era() >= 3 && !o.noGild) A.circ(tx, ty, 1.3, GOLD);
    return z + h + 3;
  }
  // an arched door (lit at night) on the front of a round body
  function roundDoor(cx, cy, r, z, dh, t = Math.PI / 4 + 0.15) {
    const [dx, dy] = Gp(cx, cy, t, r, z), dw = Math.max(2, Math.min(4, r * 9));
    A.poly([[dx - dw - 1, dy], [dx + dw + 1, dy], [dx + dw + 1, dy - dh + dw], [dx, dy - dh - 1.5], [dx - dw - 1, dy - dh + dw]], A.STY.trim, null);
    lightFill(c => { c.moveTo(dx - dw, dy); c.lineTo(dx - dw, dy - dh + dw); c.arc(dx, dy - dh + dw, dw, Math.PI, 0); c.lineTo(dx + dw, dy); c.closePath(); }, '#3a2a1c', '#ffcf66');
  }
  function roundWin(cx, cy, r, z, t, s = 1.6) { const [wx, wy] = Gp(cx, cy, t, r, z); A.circ(wx, wy, s + 0.8, A.STY.trim); A.lampDot(wx, wy, s, '#3a4a40', '#ffd27a'); }
  // a hollow living trunk-hall: bark drum with a door, round windows and a spire roof
  function trunkHall(cx, cy, r, H, o = {}) {
    let z = o.z || 0;
    const st = o.stone === undefined ? stoneOf() : o.stone;
    if (st && !o.z) { A.cyl(cx, cy, r * 1.12, 0, 3, st, A.shade(st, 0.08)); z = 3; }
    trunk(cx, cy, r, z, H, { col: o.col || bark(o.civic), noRoots: !!st || !!o.z });
    if (era() >= 1 && !A.GLOW) { const [x, y, rx, ry] = A.ell(cx, cy, z + H - 3, r); A.c.beginPath(); A.c.ellipse(x, y, rx, ry, 0, 0.1, Math.PI - 0.1); stroke(era() >= 3 ? GOLD : '#c9a874', 1); }
    if (!o.noDoor) roundDoor(cx, cy, r, z, Math.min(10, H * 0.6));
    if (H > 13) { roundWin(cx, cy, r, z + H * 0.62, -0.25); if (r > 0.3) roundWin(cx, cy, r, z + H * 0.62, 1.25); }
    const zt = o.dome ? leafDome(cx, cy, r * 1.25, z + H, o.rh || r * 26, o.roof) : spireRoof(cx, cy, r * 1.3, z + H, o.rh || r * 50 + 6, o.roof, { lean: o.lean });
    return zt;
  }
  function leafDome(cx, cy, r, z, h, col) {
    col = col || roofOf();
    const zt = A.dome(cx, cy, r, z, h, col);
    if (!A.GLOW && !A.SNOW) { const [x, y, rx] = A.ell(cx, cy, z, r); for (let k = 1; k < 3; k++) { const yy = y - h * k * 0.3, w = rx * Math.sqrt(1 - Math.pow(k * 0.3, 2)), n = 5 - k; for (let j = 0; j < n; j++) { A.c.beginPath(); A.c.arc(x - w + (j + 0.5) * 2 * w / n, yy, w / n, 0.1, Math.PI - 0.1); stroke(A.shade(col, -0.25), 0.6); } } }
    return zt;
  }
  // a woven sapling bower hut (the first homes)
  function bower(cx, cy, r, h) {
    const [x, y, rx] = A.ell(cx, cy, 0, r);
    A.dome(cx, cy, r, 0, h, WICKER);
    if (!A.GLOW) {
      for (const k of [-0.6, -0.2, 0.2, 0.6]) curve([x + rx * k, y + 2], [x + rx * k * 1.25, y - h * 0.8], [x + rx * k * 0.2, y - h], A.shade(WICKER, -0.28), 0.7);
      for (const f of [0.3, 0.6]) curve([x - rx * Math.sqrt(1 - f * f), y - h * f], [x, y - h * f + 3], [x + rx * Math.sqrt(1 - f * f), y - h * f], A.shade(WICKER, -0.22), 0.6);
      const lc = leaves(); for (let k = 0; k < 6; k++) A.circ(x + (k - 2.5) * rx * 0.3, y - h * (0.78 + (k % 2) * 0.12), 2.6, k % 2 ? lc[1] : lc[0], A.OUT);
      if (A.SNOW) A.c.fill();
    }
    const [dx, dy] = Gp(cx, cy, Math.PI / 4 + 0.2, r * 0.95, 0);
    lightFill(c => { c.moveTo(dx - 2.6, dy); c.lineTo(dx - 2.6, dy - 4); c.arc(dx, dy - 4, 2.6, Math.PI, 0); c.lineTo(dx + 2.6, dy); c.closePath(); }, '#3a2a1c', '#ffbf5a');
    return h + 2;
  }
  // a lean-to: two front posts, a wattle back and a sloping leaf roof (open shelters of the first years)
  function leanTo(x0, y0, w, d, h) {
    A.box(x0, y0, w, 0.06, 0, h + 4, WICKER);
    if (!A.GLOW) for (let z = 3; z < h + 3; z += 3) A.line(A.P(x0, y0 + 0.06, z), A.P(x0 + w, y0 + 0.06, z), A.shade(WICKER, -0.25), 0.6);
    for (const [px, py] of [[x0, y0 + d], [x0 + w, y0 + d], [x0 + w, y0]]) A.line(A.P(px, py), A.P(px, py, h), WOOD_D, 1.3);
    const q = [A.P(x0 - 0.06, y0 - 0.04, h + 5), A.P(x0 + w + 0.06, y0 - 0.04, h + 5), A.P(x0 + w + 0.06, y0 + d + 0.08, h), A.P(x0 - 0.06, y0 + d + 0.08, h)];
    A.poly(q, snowy(roofOf()));
    if (!A.GLOW && !A.SNOW) A.roofLines([q[3], q[2], q[1], q[0]], 3, A.shade(roofOf(), -0.22));
    return h + 6;
  }
  // a long woven ridge-hut of bent saplings under leaf thatch
  function ridgeHut(x0, y0, w, d, h) {
    const b = A.box(x0, y0, w, d, 0, 4, WICKER);
    const zt = A.gable(b, h, roofOf(), w >= d ? 'x' : 'y', 'thatch', 0.1);
    const [dx, dy] = A.onL(b, w * 0.5, w * 0.5, 0, 0)[0];
    A.lamp([[dx - 2.4, dy], [dx + 2.4, dy], [dx + 2.4, dy - 6], [dx, dy - 8], [dx - 2.4, dy - 6]], '#3a2a1c', '#ffbf5a');
    return zt;
  }
  // a round deck around a trunk at height z, with rails and braces (drawn in front of the trunk)
  function deck(cx, cy, r, z, rt, o = {}) {
    for (const t of [0.1, 1.4]) A.line(Gp(cx, cy, t, r * 0.8, z), Gp(cx, cy, t, rt, z - 10), WOOD_D, 1.4);
    A.cyl(cx, cy, r, z, 2.2, o.col || WOOD, A.shade(o.col || WOOD, 0.14));
    if (!A.GLOW) { const [x, y, rx, ry] = A.ell(cx, cy, z + 2.2, r); for (let k = 1; k < 4; k++) { A.c.beginPath(); A.c.ellipse(x, y, rx * k / 4, ry * k / 4, 0, 0, Math.PI * 2); stroke(A.shade(o.col || WOOD, -0.12), 0.4); } }
    return z + 2.2;
  }
  function rail(cx, cy, r, z, frontPart = true) {
    const pts = [];
    for (let k = 0; k <= 12; k++) { const t = -Math.PI * 0.75 + k / 12 * Math.PI * 2; if (front(t) === frontPart) pts.push(t); }
    for (const t of pts) A.line(Gp(cx, cy, t, r, z), Gp(cx, cy, t, r, z + 5), WOOD_D, 0.9);
    for (let i = 0; i < pts.length - 1; i++) if (Math.abs(pts[i + 1] - pts[i]) < 0.6) A.line(Gp(cx, cy, pts[i], r, z + 5), Gp(cx, cy, pts[i + 1], r, z + 5), WOOD_D, 1);
  }
  // a spiral stair winding round a trunk; part 'back' or 'front'
  function stair(cx, cy, r, z0, z1, turns, part, t0 = 0.6) {
    const n = Math.round(turns * 16), w = 0.16;
    for (let k = 0; k <= n; k++) {
      const t = t0 + k / n * turns * Math.PI * 2, z = z0 + (z1 - z0) * k / n;
      if (front(t) !== (part === 'front')) continue;
      A.poly([Gp(cx, cy, t - 0.13, r, z), Gp(cx, cy, t + 0.13, r, z), Gp(cx, cy, t + 0.13, r + w, z), Gp(cx, cy, t - 0.13, r + w, z)], WOOD, A.OUT, 0.5);
      if (part === 'front' && k % 2 === 0) A.line(Gp(cx, cy, t, r + w, z), Gp(cx, cy, t, r + w, z + 6), WOOD_D, 0.7);
      if (part === 'front' && k < n) { const t2 = t0 + (k + 1) / n * turns * Math.PI * 2; if (front(t2)) A.line(Gp(cx, cy, t, r + w, z + 6), Gp(cx, cy, t2, r + w, z + (z1 - z0) / n + 6), WOOD_D, 0.6); }
    }
  }
  // a rope bridge between two grid points [gx, gy, z]
  function ropeBridge(a, b, sag = 6) {
    const pts = [], hi = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10, s = Math.sin(t * Math.PI) * sag; const gx = a[0] + (b[0] - a[0]) * t, gy = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t - s; pts.push(A.P(gx, gy, z)); hi.push(A.P(gx, gy, z + 6 + s * 0.3)); }
    for (let k = 0; k < 10; k++) A.line(pts[k], pts[k + 1], WOOD, 2.6);
    if (!A.GLOW) for (let k = 0; k <= 10; k++) A.line([pts[k][0] - 1.2, pts[k][1] - 0.6], [pts[k][0] + 1.2, pts[k][1] + 0.6], WOOD_D, 0.6);
    for (let k = 0; k < 10; k++) A.line(hi[k], hi[k + 1], '#cdbf98', 0.7);
    for (let k = 1; k < 10; k += 2) A.line(pts[k], hi[k], '#cdbf98', 0.5);
  }
  // a standing stone: grey and mossy, or moon-white with runes in the late eras
  function menhir(gx, gy, h, s = 1, z = 0) {
    const [x, y] = A.P(gx, gy, z), col = era() >= 2 || T('architecture') ? MOON : '#9a978a';
    A.poly([[x - 3 * s, y], [x + 3 * s, y], [x + 2.5 * s, y - h + 3 * s], [x + 0.6 * s, y - h], [x - 2.3 * s, y - h + 2.5 * s]], col);
    A.poly([[x + 0.8 * s, y], [x + 3 * s, y], [x + 2.5 * s, y - h + 3 * s], [x + 0.6 * s, y - h]], A.shade(col, -0.18), null);
    if (era() >= 2) A.lamp([[x - 1.3 * s, y - h * 0.55], [x - 0.3 * s, y - h * 0.55], [x - 0.3 * s, y - h * 0.3], [x - 1.3 * s, y - h * 0.3]], '#7ab8c8', '#c8f4ff');
    else if (!A.GLOW && !A.SNOW) A.poly([[x - 3 * s, y], [x - 0.5 * s, y], [x - 1.5 * s, y - h * 0.3]], MOSS, null);
    if (A.SNOW) A.poly([[x - 2.3 * s, y - h + 2.5 * s], [x + 0.6 * s, y - h], [x + 2.5 * s, y - h + 3 * s], [x, y - h + 3.5 * s]], '#f2f6f8', null);
    return z + h;
  }
  // a straw archery target on a tripod, arrows in it
  function target(gx, gy, s = 1) {
    const [x, y] = A.P(gx, gy);
    A.line([x - 3 * s, y], [x, y - 10 * s], WOOD_D, 1); A.line([x + 3 * s, y], [x, y - 10 * s], WOOD_D, 1); A.line([x + 1.5 * s, y - 1], [x + 0.5 * s, y - 9 * s], WOOD_D, 0.8);
    const cx = x, cy = y - 9 * s;
    A.c.beginPath(); A.c.ellipse(cx, cy, 4.6 * s, 5 * s, 0, 0, Math.PI * 2); A.c.fillStyle = A.F(A.SNOW ? '#e6e2d4' : STRAW); A.c.fill(); stroke(A.OUT, 0.7);
    A.c.beginPath(); A.c.ellipse(cx, cy, 3.1 * s, 3.4 * s, 0, 0, Math.PI * 2); stroke('#3f7f4a', 1.1);
    A.circ(cx, cy, 1.3 * s, '#c0392b');
    A.line([cx + 0.8, cy - 1], [cx + 4, cy - 3], WOOD_D, 0.6); A.line([cx - 1.5, cy + 1.2], [cx + 1.8, cy - 0.5], WOOD_D, 0.6);
  }
  function archer(gx, gy, col) {
    const [x, y] = A.P(gx, gy);
    A.person(x, y, col || A.STY.flag, 0.95);
    A.c.beginPath(); A.c.arc(x - 3, y - 6.5, 4.5, -1.2, 1.2); stroke('#6a4a2a', 0.9);
    A.line([x - 1.3, y - 10.6], [x - 1.3, y - 2.4], '#e8e0c8', 0.4); A.line([x - 3, y - 6.5], [x + 3, y - 6.5], '#5a4030', 0.6);
  }
  function wattle(pts, h = 6, col = '#8a6a40') {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.3));
      for (let k = 0; k <= n; k++) { const gx = ax + (bx - ax) * k / n, gy = ay + (by - ay) * k / n; A.line(A.P(gx, gy), A.P(gx, gy, h + 1), WOOD_D, 1); }
      for (const z of [h * 0.3, h * 0.6, h * 0.9]) A.line(A.P(ax, ay, z), A.P(bx, by, z), col, 1.3);
    }
  }
  function fruitTree(gx, gy, s = 1, fruit = '#c0392b') {
    const [x, y] = A.P(gx, gy);
    A.poly([[x - 1.2 * s, y], [x + 1.2 * s, y], [x + 0.8 * s, y - 7 * s], [x - 0.8 * s, y - 7 * s]], BARK);
    A.blobs(x, y - 11 * s, 5.5 * s, leaves(), A.SEASON === 0);
    if (A.SEASON === 1 || A.SEASON === 2) for (let k = 0; k < 5; k++) A.circ(x + Math.cos(k * 2.3) * 4 * s, y - 11 * s + Math.sin(k * 1.7) * 3 * s, 1 * s, fruit);
  }
  function skep(gx, gy) { const [x, y] = A.P(gx, gy); A.c.beginPath(); A.c.ellipse(x, y - 1, 3.5, 5.5, 0, Math.PI, Math.PI * 2); A.c.lineTo(x + 3.5, y); A.c.lineTo(x - 3.5, y); A.c.fillStyle = A.F(A.SNOW ? '#e8e8e0' : '#c9a454'); A.c.fill(); stroke(A.OUT, 0.6); if (!A.GLOW) for (let k = 1; k < 4; k++) A.line([x - 3.4 + k * 0.4, y - k * 1.5], [x + 3.4 - k * 0.4, y - k * 1.5], '#8a6a30', 0.5); A.circ(x, y - 1, 0.8, '#3a2a1c'); }
  // a hanging wicker seed-pod (granary / store)
  function seedPod(x, y, s = 1) { A.line([x, y - 6 * s], [x, y], '#4a3a2a', 0.7); A.c.beginPath(); A.c.ellipse(x, y + 4 * s, 3 * s, 4.5 * s, 0, 0, Math.PI * 2); A.c.fillStyle = A.F(WICKER); A.c.fill(); stroke(A.OUT, 0.6); if (!A.GLOW) A.line([x - 3 * s, y + 4 * s], [x + 3 * s, y + 4 * s], A.shade(WICKER, -0.3), 0.6); }
  // a leaf banner on a slender pole (green with a silver leaf)
  function leafBanner(gx, gy, h, z = 0, col) {
    const t = A.P(gx, gy, z + h); A.line(A.P(gx, gy, z), t, WOOD_D, 1.2);
    A.c.beginPath(); A.c.moveTo(t[0], t[1] + 2); A.c.quadraticCurveTo(t[0] + 9, t[1] + 4, t[0] + 6, t[1] + 16); A.c.quadraticCurveTo(t[0] + 2, t[1] + 10, t[0], t[1] + 13); A.c.closePath(); A.c.fillStyle = A.F(col || A.STY.flag); A.c.fill(); stroke(A.OUT, 0.6);
    if (!A.GLOW) { A.line([t[0] + 2, t[1] + 6], [t[0] + 5, t[1] + 12], era() >= 3 ? GOLD : '#e8f0e0', 0.9); }
    A.circ(t[0], t[1], 1.1, era() >= 3 ? GOLD : '#d8e0d0');
    return z + h;
  }
  // a whole tree-hall: roots, trunk, deck, pod and crown (band shapes how much)
  function greatTree(cx, cy, o) {
    const r = o.r, th = o.h, decks = o.decks || [], civic = !!o.civic;
    // back halves of stairs
    if (o.stair) stair(cx, cy, r, 2, o.stair, Math.max(1, o.stair / 30), 'back');
    let z = 0;
    for (const dz of decks) { trunk(cx, cy, r, z, dz.z - z, { civic, noRoots: z > 0 }); deck(cx, cy, dz.r, dz.z, r); rail(cx, cy, dz.r, dz.z + 2.2, false); z = dz.z + 2.2; if (dz.fn) dz.fn(dz.z + 2.2); }
    trunk(cx, cy, r * 0.85, z, th - z, { civic, noRoots: z > 0 });
    for (const dz of decks) rail(cx, cy, dz.r, dz.z + 2.2, true);
    if (o.stair) stair(cx, cy, r, 2, o.stair, Math.max(1, o.stair / 30), 'front');
    boughs(cx, cy, th, o.cr * 0.6, bark(civic));
    const zt = crown(cx, cy, th + o.cr * A.HW * 0.55, o.cr, o.blossom);
    return zt;
  }
  // moon-white footing ring (Empire on) or nothing
  function plinth(cx, cy, r, h = 3) { const st = stoneOf(); if (!st) return 0; A.cyl(cx, cy, r, 0, h, st, A.shade(st, 0.08)); return h; }

  // =================================================================
  //  buildings
  // =================================================================
  def('townhall', ([x, y, w, d], L, band) => {
    const S = scene(), cx = x + w * 0.46, cy = y + d * 0.46;
    if (band === 0) { // a young council oak with bowers round a moot fire
      S.add(x + w * 0.22, y + d * 0.3, () => bower(x + w * 0.22, y + d * 0.3, 0.32, 13));
      S.add(cx, cy, () => { trunk(cx, cy, 0.17, 0, 24 + L * 2); boughs(cx, cy, 24 + L * 2, 0.5); return crown(cx, cy, 34 + L * 2, 0.62 + L * 0.03, true); });
      S.add(x + w * 0.78, y + d * 0.3, () => bower(x + w * 0.78, y + d * 0.3, 0.3, 12));
      S.add(x + w * 0.28, y + d * 0.78, () => bower(x + w * 0.28, y + d * 0.78, 0.3, 12));
      S.add(x + w * 0.72, y + d * 0.72, () => { A.firePit(x + w * 0.72, y + d * 0.72, 0.8); for (const [dx, dy] of [[-0.3, 0], [0.3, -0.05], [0, 0.3]]) A.log(x + w * 0.72 + dx - 0.12, x + w * 0.72 + dx + 0.12, y + d * 0.72 + dy, 2, 1.6); });
      if (L >= 3) S.add(x + w * 0.9, y + d * 0.92, () => leafBanner(x + w * 0.9, y + d * 0.92, 24));
      return S.run();
    }
    const tr = 0.24 + band * 0.05, th = 44 + band * 14 + L, hallR = 0.5 + band * 0.04;
    if (band >= 2) { // the watch-tree at the back corner, bridged to the great tree
      const wx = x + w * 0.84, wy = y + d * 0.16, wz = th * 0.62;
      S.add(wx, wy, () => greatTree(wx, wy, { r: 0.13, h: th * 0.8, cr: 0.42, decks: [{ z: wz, r: 0.3, fn: zz => { const [lx, ly] = Gp(wx, wy, 0.8, 0.3, zz); hang(lx, ly + 8); } }] }));
      S.add(wx - 0.1, wy + 0.4, () => ropeBridge([wx - 0.2, wy + 0.22, wz + 2], [cx + 0.35, cy - 0.3, th * 0.55 + 2], 5));
    }
    if (band >= 3) { // a second tree at the left, a grove of halls
      const sx = x + w * 0.14, sy = y + d * 0.86, sz = th * 0.5;
      S.add(sx - 0.3, sy - 0.3, () => greatTree(sx, sy, { r: 0.14, h: th * 0.72, cr: 0.45, decks: [{ z: sz, r: 0.32, fn: zz => { const [lx, ly] = Gp(sx, sy, 0.8, 0.32, zz); hang(lx, ly + 8); } }] }));
      S.add(sx + 0.1, sy - 0.5, () => ropeBridge([sx + 0.2, sy - 0.25, sz + 2], [cx - 0.3, cy + 0.35, th * 0.55 + 2], 5));
    }
    S.add(cx, cy, () => {
      const pz = plinth(cx, cy, hallR * 1.25, 3);
      // the hall grown round the trunk base: a broad bark drum under a leaf skirt
      trunk(cx, cy, hallR, pz, 16 + band * 2, { civic: true, noRoots: pz > 0 });
      roundDoor(cx, cy, hallR, pz, 11);
      roundWin(cx, cy, hallR, pz + 10, -0.3); roundWin(cx, cy, hallR, pz + 10, 1.3);
      if (era() >= 1 && !A.GLOW) { const [ex, ey, rx, ry] = A.ell(cx, cy, pz + 14 + band * 2, hallR); A.c.beginPath(); A.c.ellipse(ex, ey, rx, ry, 0, 0.1, Math.PI - 0.1); stroke(era() >= 3 ? GOLD : '#c9a874', 1.2); }
      const z1 = pz + 16 + band * 2;
      spireRoof(cx, cy, hallR * 1.35, z1, 9, roofOf(), { lean: 0, noGild: true });
      const decks = [{ z: th * 0.55, r: 0.55 + band * 0.05, fn: zz => {
        // a pod-hall on the deck
        trunkHall(cx + 0.18, cy + 0.15, 0.22, 10, { z: zz, roof: roofOf(), rh: 13 });
        const [lx, ly] = Gp(cx, cy, 0.9, 0.55 + band * 0.05, zz); hang(lx, ly + 9, 1.6);
        const [mx, my] = Gp(cx, cy, -0.3, 0.55 + band * 0.05, zz); hang(mx, my + 9, 1.6);
      } }];
      if (band >= 3) decks.push({ z: th * 0.8, r: 0.42, fn: zz => { trunkHall(cx - 0.12, cy + 0.12, 0.16, 8, { z: zz, rh: 11 }); const [lx, ly] = Gp(cx, cy, 0.6, 0.42, zz); hang(lx, ly + 8); } });
      const top = greatTree(cx, cy, { r: tr, h: th, cr: 0.9 + band * 0.12, decks, civic: true, stair: band >= 2 ? th * 0.55 : 0 });
      if (band >= 1) { const [ax, ay] = A.P(cx, cy, th + 6); fireflies(cx, cy, th - 4, 26 + band * 6); void ax; void ay; }
      return top;
    });
    if (band === 1) S.add(x + w * 0.9, y + d * 0.4, () => { const [lx, ly] = A.P(x + w * 0.9, y + d * 0.4); A.line([lx, ly], [lx, ly - 14], WOOD_D, 1.2); A.line([lx, ly - 14], [lx - 5, ly - 14], WOOD_D, 1); hang(lx - 5, ly - 8); });
    // a moon-white stair arch at the front in the Empire era
    if (stoneOf() === MOON && band >= 2) S.add(x + w * 0.66, y + d * 0.66, () => {
      const ax = x + w * 0.66, ay = y + d * 0.66;
      for (const dv of [-0.2, 0.2]) A.box(ax + dv - 0.05, ay - dv - 0.05, 0.1, 0.1, 0, 16, MOON);
      const a0 = A.P(ax - 0.2, ay + 0.2, 16), a1 = A.P(ax + 0.2, ay - 0.2, 16); curve(a0, [(a0[0] + a1[0]) / 2, a0[1] - 9], a1, MOON, 2.6);
      if (era() >= 3) { const m = [(a0[0] + a1[0]) / 2, a0[1] - 4.5]; A.lampDot(m[0], m[1], 1.4, '#9ad8e8', '#d8f8ff'); A.rec('sparks', { x: m[0], y: m[1], kind: 'star' }); }
    });
    S.add(x + w * 0.93, y + d * 0.93, () => leafBanner(x + w * 0.93, y + d * 0.93, 26 + band * 4));
    if (band >= 2) S.add(x + w * 0.08, y + d * 0.55, () => leafBanner(x + w * 0.08, y + d * 0.55, 24 + band * 3, 0, A.STY.cloth[3]));
    return S.run();
  });

  def('cottage', ([x, y, w, d], L, band, ctx) => {
    const i = ctx.i || 0, cx = x + w * 0.5, cy = y + d * 0.5, v = (i * 7 + 3) % 3;
    if (band === 0) { // a woven bower; every third one a lean-to under a sapling
      const top = bower(cx, cy, 0.36 + (i % 2) * 0.04, 13 + (i % 3));
      if (v === 2) { trunk(x + w * 0.85, y + d * 0.2, 0.06, 0, 12); crown(x + w * 0.85, y + d * 0.2, 18, 0.28); }
      if (L >= 3 && i % 2 === 0) { const [lx, ly] = A.P(x + w * 0.2, y + d * 0.92); A.line([lx, ly], [lx, ly - 10], WOOD_D, 1); hang(lx + 3, ly - 6, 1.2); A.line([lx, ly - 10], [lx + 3, ly - 10], WOOD_D, 0.8); }
      return top;
    }
    if (band === 1 || v === 0 && band === 2) { // a living trunk-home under a curled spire
      const r = 0.3 + band * 0.02;
      const top = trunkHall(cx - 0.05, cy - 0.05, r, 13 + band * 2 + (i % 2) * 2, { rh: 19 + (i % 3) * 3, lean: (i % 2 ? -2 : 2), roof: A.mix(roofOf(), ['#3f8a5e', '#86683e', '#5a9a6a'][i % 3], 0.35) });
      if (v === 1) { trunk(x + w * 0.85, y + d * 0.15, 0.07, 0, 16); crown(x + w * 0.85, y + d * 0.15, 24, 0.3, true); }
      const [lx, ly] = Gp(cx - 0.05, cy - 0.05, -0.4, r + 0.05, 12); A.line([lx, ly], [lx + 4, ly], WOOD_D, 0.8); hang(lx + 4, ly + 4, 1.2);
      return top;
    }
    const rv = A.mix(roofOf(), ['#3f8a5e', '#86683e', '#5a9a6a'][i % 3], 0.35);
    if (band === 3 && v === 0) { // the elder's hollow: a broad hall grown into a living tree that rises out of its roof
      const hx = cx - 0.05, hy = cy - 0.05, H = 19;
      const top = trunkHall(hx, hy, 0.38, H, { dome: true, rh: 8, roof: rv });
      const z0 = (stoneOf() ? 3 : 0) + H + 4;
      trunk(hx - 0.05, hy - 0.05, 0.12, z0, 22, { noRoots: true });
      boughs(hx - 0.05, hy - 0.05, z0 + 22, 0.35);
      const ct = crown(hx - 0.08, hy - 0.1, z0 + 30, 0.44, true);
      const [lx, ly] = Gp(hx, hy, 1.2, 0.4, 16); hang(lx, ly + 2, 1.3);
      roundWin(hx, hy, 0.38, (stoneOf() ? 3 : 0) + 12, 0.35, 1.3);
      return Math.max(top, ct);
    }
    // band 2-3: a tree-house: a trunk with a deck and pod-home above a ground room
    const tr = 0.13, dz = 14 + band * 3, th = dz + 22 + band * 4;
    const S = scene();
    if (v === 2 || band === 3) S.add(x + w * 0.2, y + d * 0.25, () => trunkHall(x + w * 0.24, y + d * 0.3, 0.2, 10, { rh: 13, stone: null }));
    S.add(cx, cy, () => {
      const st = stoneOf(); if (st) A.cyl(cx, cy, 0.3, 0, 2.5, st, A.shade(st, 0.08));
      stair(cx, cy, tr, 1, dz, 0.75, 'back', 1.2);
      trunk(cx, cy, tr, 0, dz, { noRoots: !!st });
      deck(cx, cy, 0.38, dz, tr); rail(cx, cy, 0.38, dz + 2.2, false);
      trunk(cx, cy, tr * 0.8, dz + 2.2, th - dz - 2.2, { noRoots: true });
      const ztop = trunkHall(cx + 0.06, cy + 0.08, 0.25, 9 + band, { z: dz + 2.2, rh: 16, lean: i % 2 ? -2 : 2, roof: rv });
      rail(cx, cy, 0.38, dz + 2.2, true);
      stair(cx, cy, tr, 1, dz, 0.75, 'front', 1.2);
      boughs(cx, cy, th, 0.3);
      const ct = crown(cx - 0.05, cy - 0.1, th + 8, 0.36 + band * 0.04, true);
      const [lx, ly] = Gp(cx, cy, 1.0, 0.38, dz + 2); hang(lx, ly + 7, 1.3);
      if (band >= 3) { const [mx, my] = Gp(cx, cy, -0.2, 0.38, dz + 2); hang(mx, my + 7, 1.3); seedPod(...Gp(cx - 0.05, cy - 0.1, 2.6, 0.32, th + 2)); }
      return Math.max(ztop, ct);
    });
    return S.run();
  });

  def('farm', ([x, y, w, d], L, band) => {
    const S = scene(), irr = T('irrigation'), gran = T('granaries');
    // orchard rows: saplings → fruit trees; blossom in spring
    const trees = Math.min(8, 2 + band * 2 + Math.floor(L / 5));
    const spots = [[0.62, 0.15], [0.85, 0.2], [0.62, 0.42], [0.88, 0.48], [0.12, 0.62], [0.12, 0.86], [0.38, 0.88], [0.62, 0.9]];
    for (let k = 0; k < trees; k++) { const [u, v] = spots[k]; S.add(x + w * u, y + d * v, () => fruitTree(x + w * u, y + d * v, band === 0 ? 0.65 : 0.8 + band * 0.08, k % 3 ? '#c0392b' : '#e8a020')); }
    // herb beds
    S.add(x + w * 0.35, y + d * 0.6, () => { for (let k = 0; k < 3; k++) { const q = A.quad(x + w * 0.3 + k * 0.18, y + d * 0.5, 0.13, 0.4); A.poly(q, A.SNOW ? '#e8ecee' : '#6a4e32', null); if (!A.SNOW) for (let j = 0; j < 3; j++) { const [px, py] = A.P(x + w * 0.365 + k * 0.18, y + d * 0.56 + j * 0.13); A.circ(px, py - 1.5, 1.7, leaves()[j % 2 ? 1 : 2]); } } });
    // the gardener's home
    S.add(x + w * 0.24, y + d * 0.24, () => band === 0 ? bower(x + w * 0.24, y + d * 0.24, 0.34, 13) : trunkHall(x + w * 0.24, y + d * 0.24, 0.27, 12 + band, { rh: 17 }));
    if (band >= 1) S.add(x + w * 0.5, y + d * 0.2, () => { for (let k = 0; k < 2 + band; k++) skep(x + w * 0.44 + k * 0.12, y + d * 0.1 + k * 0.05); });
    if (band >= 1) S.add(x + w * 0.4, y + d * 0.45, () => { // vine trellis
      const a = [x + w * 0.42, y + d * 0.36], b = [x + w * 0.42, y + d * 0.04 + 0.3];
      for (const p of [a, b]) A.line(A.P(p[0], p[1]), A.P(p[0], p[1], 14), WOOD_D, 1.1);
      A.line(A.P(a[0], a[1], 14), A.P(b[0], b[1], 14), WOOD_D, 1); if (!A.SNOW) for (let k = 0; k < 5; k++) { const t = k / 4, p = A.P(a[0], a[1] + (b[1] - a[1]) * t, 13 - (k % 2) * 3); A.circ(p[0], p[1], 2.4, leaves()[1], A.OUT); if (A.SEASON === 2 || A.SEASON === 1) A.circ(p[0] + 1, p[1] + 2.5, 1.2, '#6a3a7a'); }
    });
    if (band >= 2) S.add(x + w * 0.22, y + d * 0.5, () => { // a wicker granary pod on legs
      const gx = x + w * 0.2, gy = y + d * 0.5;
      for (const [dx, dy] of [[-0.12, 0.08], [0.12, 0.08], [0, -0.12]]) A.line(A.P(gx + dx, gy + dy), A.P(gx, gy, 10), WOOD_D, 1.2);
      A.cyl(gx, gy, 0.17, 8, 10, WICKER, A.shade(WICKER, 0.1)); return spireRoof(gx, gy, 0.22, 18, 10);
    });
    if (band >= 3 && stoneOf()) S.add(x + w * 0.5, y + d * 0.98, () => { A.box(x + w * 0.05, y + d - 0.1, w * 0.85, 0.08, 0, 3, stoneOf()); });
    if (irr) S.add(x + w * 0.05, y + d * 0.4, () => { // a stone-lined rill and a little water wheel
      const q = [A.P(x + w * 0.04, y + d * 0.02), A.P(x + w * 0.1, y + d * 0.02), A.P(x + w * 0.1, y + d * 0.98), A.P(x + w * 0.04, y + d * 0.98)];
      A.poly(q, A.SNOW ? '#cfe2ee' : '#5f9fc8', '#8a8070', 0.6);
      const [wx, wy] = A.P(x + w * 0.07, y + d * 0.35, 5); A.circ(wx, wy, 5, null, WOOD_D); for (let k = 0; k < 4; k++) A.line([wx, wy], [wx + Math.cos(k * 0.8) * 5, wy + Math.sin(k * 0.8) * 5], WOOD_D, 0.8);
    });
    if (gran) S.add(x + w * 0.62, y + d * 0.15, () => { const [px, py] = A.P(x + w * 0.62, y + d * 0.15, 13); seedPod(px + 3, py, 0.8); seedPod(px - 3, py + 1, 0.7); });
    if (band >= 2) S.add(x + w * 0.85, y + d * 0.85, () => fireflies(x + w * 0.6, y + d * 0.6, 10, 18));
    const top = S.run();
    return Math.max(top, 20);
  });

  def('lumber', ([x, y, w, d], L, band) => {
    const S = scene();
    // the woodward's hall
    S.add(x + w * 0.3, y + d * 0.2, () => band === 0 ? (() => { const t = leanTo(x + w * 0.3 - 0.4, y + d * 0.2 - 0.25, 0.8, 0.45, 11); A.logPile(x + w * 0.3 - 0.3, y + d * 0.2 - 0.1, 0.6, 2); return t; })() : trunkHall(x + w * 0.3, y + d * 0.2, 0.3, 13 + band * 2, { rh: 18 }));
    // tended grove: tall living trees at the back; stumps sprouting new shoots; saplings in rows
    for (const [u, v, s] of [[0.78, 0.1, 1.0], [0.92, 0.3, 0.9], [0.1, 0.45, 0.85]]) S.add(x + w * u, y + d * v, () => A.treeDecid(x + w * u, y + d * v, s, true));
    const sap = Math.min(9, 3 + band * 2);
    for (let k = 0; k < sap; k++) { const gx = x + w * (0.12 + (k % 3) * 0.1), gy = y + d * (0.66 + Math.floor(k / 3) * 0.1); S.add(gx, gy, () => { const [px, py] = A.P(gx, gy); A.line([px, py], [px, py - 6], BARK, 1); A.circ(px, py - 7, 2.2, leaves()[1], A.OUT); }); }
    for (const [u, v] of [[0.6, 0.38], [0.85, 0.6], [0.45, 0.92]]) S.add(x + w * u, y + d * v, () => { A.stump(x + w * u, y + d * v); const [px, py] = A.P(x + w * u, y + d * v, 3); A.line([px, py], [px + 2, py - 4], '#5a8a3e', 0.8); A.circ(px + 2, py - 4.5, 1.2, leaves()[2]); });
    // gathered windfall logs
    const piles = Math.min(3, 1 + Math.floor(L / 6));
    for (let k = 0; k < piles; k++) S.add(x + w * 0.5, y + d * (0.5 + k * 0.12), () => A.logPile(x + w * 0.42, y + d * (0.48 + k * 0.12), 0.7, 2 + (k === 0 ? 1 : 0)));
    if (band >= 1) S.add(x + w * 0.65, y + d * 0.75, () => { // a bending frame shaping a green bough
      const gx = x + w * 0.65, gy = y + d * 0.75;
      for (const dv of [-0.25, 0.25]) A.line(A.P(gx + dv, gy), A.P(gx + dv, gy, 12), WOOD_D, 1.4);
      const a = A.P(gx - 0.32, gy, 4), b = A.P(gx + 0.32, gy, 4); curve(a, [(a[0] + b[0]) / 2, a[1] - 18], b, '#9a7a4a', 2.4);
      A.line(A.P(gx - 0.25, gy, 12), A.P(gx + 0.25, gy, 12), WOOD_D, 1.1);
    });
    if (band >= 2) S.add(x + w * 0.88, y + d * 0.86, () => { // drying racks of bow-staves
      const gx = x + w * 0.88, gy = y + d * 0.86; A.line(A.P(gx, gy - 0.3), A.P(gx, gy - 0.3, 12), WOOD_D, 1); A.line(A.P(gx, gy + 0.05), A.P(gx, gy + 0.05, 12), WOOD_D, 1); A.line(A.P(gx, gy - 0.3, 11), A.P(gx, gy + 0.05, 11), WOOD_D, 1);
      for (let k = 0; k < 5; k++) { const p = A.P(gx, gy - 0.26 + k * 0.07, 11); A.line([p[0] - 1, p[1] + 10], [p[0], p[1]], '#c8a060', 0.9); }
    });
    if (band >= 3) S.add(x + w * 0.4, y + d * 0.35, () => { const a = A.P(x + w * 0.3, y + d * 0.2, 0); void a; A.animal(x + w * 0.48, y + d * 0.36, era() >= 3 ? 'whitestag' : 'stag', 1); A.log(x + w * 0.52, x + w * 0.78, y + d * 0.38, 2, 1.8); });
    if (band >= 2) S.add(x + w * 0.3, y + d * 0.35, () => { const [lx, ly] = Gp(x + w * 0.3, y + d * 0.2, 0.9, 0.32, 9); hang(lx + 2, ly, 1.3); });
    return Math.max(S.run(), 24);
  });

  def('quarry', (slot, L, band) => {
    const [x, y, w, d] = slot;
    const top = A.BLD.quarry(slot, L, band);
    const S = scene();
    // carvers' leaf awning on bent poles
    S.add(x + w * 0.85, y + d * 0.2, () => { const gx = x + w * 0.82, gy = y + d * 0.12; for (const [dx, dy] of [[0, 0.45], [0.45, 0.45], [0.45, 0]]) A.line(A.P(gx + dx, gy + dy), A.P(gx + dx, gy + dy, 13), WOOD_D, 1.2); A.poly([A.P(gx - 0.05, gy - 0.05, 16), A.P(gx + 0.5, gy - 0.05, 16), A.P(gx + 0.5, gy + 0.5, 12), A.P(gx - 0.05, gy + 0.5, 12)], snowy(roofOf())); });
    // moss and ferns on the rim, a guardian tree
    S.add(x + w * 0.05, y + d * 0.1, () => A.treeDecid(x + w * 0.05, y + d * 0.08, 0.9, true));
    // carved work: rough blocks → moon-white blocks → a statue of a warden growing out of the stone
    if (band >= 1) S.add(x + w * 0.7, y + d * 0.9, () => { const col = stoneOf() || '#b8b2a2'; A.box(x + w * 0.66, y + d * 0.84, 0.25, 0.25, 0, 7, col); A.box(x + w * 0.72, y + d * 0.88, 0.18, 0.18, 7, 5, col); });
    if (band >= 2) S.add(x + w * 0.9, y + d * 0.72, () => { // a half-carved standing figure
      const gx = x + w * 0.9, gy = y + d * 0.72, col = stoneOf() || '#b8b2a2';
      A.box(gx - 0.14, gy - 0.14, 0.28, 0.28, 0, 4, A.shade(col, -0.1));
      const [px, py] = A.P(gx, gy, 4), hh = 14 + band * 4;
      A.poly([[px - 3, py], [px + 3, py], [px + 2.2, py - hh + 4], [px - 2.2, py - hh + 4]], col);
      A.circ(px, py - hh + 2, 2.3, col, A.OUT);
      if (band >= 3) { A.line([px + 2, py - hh + 6], [px + 5, py - hh - 4], A.shade(col, -0.2), 1); if (era() >= 2) A.lampDot(px, py - hh + 9, 1, '#9ad8e8', '#d8f8ff'); }
      return hh + 8;
    });
    S.add(x + w * 0.6, y + d * 0.95, () => { const [lx, ly] = A.P(x + w * 0.58, y + d * 0.96); A.line([lx, ly], [lx, ly - 12], WOOD_D, 1); hang(lx + 3, ly - 8, 1.3); A.line([lx, ly - 12], [lx + 3, ly - 12], WOOD_D, 0.8); });
    return Math.max(top, S.run());
  });

  def('mine', (slot, L, band) => {
    const [x, y, w, d] = slot;
    const top = A.BLD.mine(slot, L, band);
    // an old tree grows over the adit, its roots framing the mouth
    const mx = x + w * 0.35, my = y + d - 0.05, [px, py] = A.P(mx, my), sz = 1, H = (14 + band * 2) * sz, W2 = (6 + band) * sz;
    const tx = mx - 0.25, ty = my - 0.45;
    trunk(tx, ty, 0.12, 6, 12 + band * 3, { noRoots: true });
    crown(tx, ty, 30 + band * 4, 0.42 + band * 0.05);
    for (const s of [-1, 1]) curve([px + s * 2, py - H - 6], [px + s * (W2 + 6), py - H * 0.9], [px + s * (W2 + 1), py - 1], BARK, 2);
    curve([px - W2 - 2, py - H * 0.75], [px, py - H - 4], [px + W2 + 2, py - H * 0.75], BARK_D, 1.6);
    if (band >= 2) { hang(px - W2 - 4, py - H * 0.55, 1.4); }
    if (era() >= 2) { const st = stoneOf(); A.box(mx - 0.45, my - 0.05, 0.12, 0.12, 0, 16, st); A.box(mx + 0.33, my - 0.05, 0.12, 0.12, 0, 16, st); }
    return Math.max(top, 40 + band * 5);
  });

  def('warehouse', ([x, y, w, d], L, band) => {
    const S = scene();
    // a great hollow store-stump, more of them as it grows, baskets on pulleys
    const stores = [[0.32, 0.3, 0.42], [0.72, 0.42, 0.34], [0.36, 0.74, 0.3]].slice(0, band === 0 ? 1 : band === 1 ? 1 : band === 2 ? 2 : 3);
    if (band === 0) { // woven baskets and a log store under a leaf awning
      S.add(x + w * 0.4, y + d * 0.35, () => { const gx = x + w * 0.2, gy = y + d * 0.2; for (const [dx, dy] of [[0, 0.7], [0.8, 0.7], [0.8, 0]]) A.line(A.P(gx + dx, gy + dy), A.P(gx + dx, gy + dy, 12), WOOD_D, 1.3); A.poly([A.P(gx - 0.06, gy - 0.06, 16), A.P(gx + 0.86, gy - 0.06, 16), A.P(gx + 0.86, gy + 0.76, 11), A.P(gx - 0.06, gy + 0.76, 11)], snowy(roofOf())); for (let k = 0; k < 3; k++) { const [bx, by] = A.P(gx + 0.25 + k * 0.2, gy + 0.45); A.c.beginPath(); A.c.ellipse(bx, by - 3, 3.4, 3.6, 0, 0, Math.PI * 2); A.c.fillStyle = A.F(WICKER); A.c.fill(); stroke(A.OUT, 0.6); } return 18; });
      S.add(x + w * 0.6, y + d * 0.75, () => A.logPile(x + w * 0.35, y + d * 0.72, 0.6, 2));
      return S.run();
    }
    stores.forEach(([u, v, r], k) => S.add(x + w * u, y + d * v, () => {
      const cx = x + w * u, cy = y + d * v, H = 18 + band * 4 - k * 3;
      const st = stoneOf(); let z = 0; if (st) { A.cyl(cx, cy, r * 1.1, 0, 4, st, A.shade(st, 0.08)); z = 4; }
      trunk(cx, cy, r, z, H, { noRoots: !!st, col: era() >= 3 ? '#8a6c4c' : '#6e5038' });
      // broken crown ring, leaf-thatch lid
      roundDoor(cx, cy, r, z, 10, Math.PI / 4 - 0.2);
      if (H > 18) roundWin(cx, cy, r, z + H * 0.7, 1.2, 1.4);
      const zt = leafDome(cx, cy, r * 1.1, z + H, r * 18);
      // a sprouting shoot and a pulley arm with a basket
      const [ax, ay] = A.P(cx, cy, zt - 2); A.line([ax, ay], [ax + 3, ay - 7], '#5a8a3e', 0.9); A.circ(ax + 3, ay - 8, 1.6, leaves()[1]);
      const arm = Gp(cx, cy, 0.4, r + 0.25, z + H - 2), base = Gp(cx, cy, 0.4, r * 0.9, z + H - 2);
      A.line(base, arm, WOOD_D, 1.4); A.line(arm, [arm[0], arm[1] + 12], '#cdbf98', 0.6);
      A.c.beginPath(); A.c.ellipse(arm[0], arm[1] + 15, 3, 2.6, 0, 0, Math.PI * 2); A.c.fillStyle = A.F(WICKER); A.c.fill(); stroke(A.OUT, 0.6);
      if (k === 0 && band >= 2) { const [lx, ly] = Gp(cx, cy, -0.2, r + 0.04, z + 12); hang(lx, ly, 1.3); }
      return zt;
    }));
    if (band >= 3) S.add(x + w * 0.55, y + d * 0.4, () => ropeBridge([x + w * 0.32 + 0.3, y + d * 0.3 + 0.1, 24], [x + w * 0.72 - 0.25, y + d * 0.42 - 0.05, 21], 3));
    for (const [u, v] of [[0.8, 0.82], [0.65, 0.9]]) S.add(x + w * u, y + d * v, () => A.sack(x + w * u, y + d * v));
    return S.run();
  });

  def('market', ([x, y, w, d], L, band) => {
    const S = scene(), cx = x + w * 0.5, cy = y + d * 0.5;
    // a broad trading tree in the middle; stalls with leaf awnings round it
    const stalls = Math.min(5, 2 + band + (L >= 3 ? 1 : 0));
    const spots = [[0.08, 0.08], [0.66, 0.06], [0.06, 0.62], [0.7, 0.66], [0.38, 0.8]];
    const leafStall = (gx, gy, k) => {
      A.box(gx, gy, 0.5, 0.28, 0, 5, WOOD);
      const [sx, sy] = A.P(gx + 0.25, gy + 0.14, 5); for (let j = 0; j < 4; j++) A.circ(sx - 4 + j * 2.6, sy - 1, 1.3, ['#e2b84a', '#c0392b', '#7cae4a', '#a85a8a'][(j + k) % 4]);
      const p0 = A.P(gx, gy + 0.28), p1 = A.P(gx + 0.5, gy + 0.28), p2 = A.P(gx + 0.5, gy);
      for (const p of [p0, p1, p2]) A.line(p, [p[0], p[1] - 11], WOOD_D, 1);
      // a leaf-shaped awning with a curled tip
      const a = A.P(gx - 0.06, gy - 0.04, 13), b = A.P(gx + 0.6, gy - 0.04, 13), c2 = A.P(gx + 0.6, gy + 0.42, 9), dd = A.P(gx - 0.06, gy + 0.42, 9);
      A.c.beginPath(); A.c.moveTo(a[0], a[1]); A.c.quadraticCurveTo((a[0] + b[0]) / 2, a[1] - 3, b[0], b[1]); A.c.lineTo(c2[0], c2[1]); A.c.quadraticCurveTo((c2[0] + dd[0]) / 2, c2[1] + 3, dd[0], dd[1]); A.c.closePath(); A.c.fillStyle = A.F(snowy(A.STY.cloth[k % 4] === '#c9a74a' ? '#c9a74a' : k % 2 ? '#5c9b48' : '#7fb0a0')); A.c.fill(); stroke(A.OUT, 0.7);
      curve(b, [b[0] + 4, b[1] - 3], [b[0] + 3, b[1] + 2], WOOD_D, 0.8);
      hang(c2[0], c2[1] + 3, 1.2, 3);
    };
    for (let k = 0; k < stalls; k++) { const [u, v] = spots[k]; S.add(x + w * u, y + d * v, () => leafStall(x + w * u, y + d * v, k)); }
    S.add(cx, cy, () => {
      const pz = band >= 3 ? plinth(cx, cy, 0.5, 3) : 0;
      if (band >= 2) { // a trading deck round the trunk
        const decks = [{ z: 12, r: 0.5, fn: zz => { A.sack(...[cx + 0.2, cy + 0.15]); A.crate(cx - 0.25, cy + 0.1, 0.18, zz); } }];
        return greatTree(cx, cy, { r: 0.15, h: 34 + band * 5, cr: 0.58 + band * 0.05, decks, stair: 12 });
      }
      trunk(cx, cy, 0.12 + band * 0.04, pz, 24 + band * 6 + L, { noRoots: pz > 0 });
      boughs(cx, cy, 24 + band * 6 + L, 0.45);
      return crown(cx, cy, 31 + band * 7 + L, 0.5 + band * 0.08, true);
    });
    if (band >= 1) S.add(cx + 0.3, cy + 0.3, () => { const a = A.P(cx - 0.6, cy + 0.6, 14), b = A.P(cx, cy, 24), c2 = A.P(cx + 0.6, cy - 0.6, 14); lanternString(a, b, 2, 2); lanternString(b, c2, 2, 2); });
    if (band >= 3 && stoneOf() === MOON) S.add(x + w * 0.85, y + d * 0.35, () => { const gx = x + w * 0.85, gy = y + d * 0.35; A.cyl(gx, gy, 0.22, 0, 4, MOON); const [wx, wy, rx, ry] = A.ell(gx, gy, 4, 0.17); A.c.beginPath(); A.c.ellipse(wx, wy, rx, ry, 0, 0, Math.PI * 2); A.c.fillStyle = A.GLOW ? '#cfefff' : '#9fd8f0'; A.c.fill(); A.box(gx - 0.04, gy - 0.04, 0.08, 0.08, 4, 8, MOON); });
    return S.run();
  });

  def('barracks', ([x, y, w, d], L, band) => {
    const S = scene(), along = w >= d;
    // the warden lodge at the back; an archery lane in front
    const lx = x + w * (along ? 0.28 : 0.3), ly = y + d * (along ? 0.3 : 0.25);
    if (band === 0) S.add(lx, ly, () => ridgeHut(lx - 0.3, ly - 0.3, 1.1, 0.55, 12));
    else S.add(lx, ly, () => { // a long lodge: two trunk-halls joined by a leaf roof
      const top1 = trunkHall(lx, ly, 0.3, 14 + band * 2, { rh: 20 });
      return top1;
    });
    if (band >= 1) S.add(lx + 0.75, ly - 0.05, () => trunkHall(lx + 0.75, ly - 0.05, 0.24, 12 + band * 2, { rh: 17, dome: band === 1 }));
    if (band >= 2) { // a lookout tree with an archer's perch
      const tx = x + w * 0.88, ty = y + d * 0.2, tz = 26 + band * 4;
      S.add(tx, ty, () => { const t = greatTree(tx, ty, { r: 0.11, h: tz + 18, cr: 0.36, decks: [{ z: tz, r: 0.3, fn: zz => { const [ax, ay] = A.P(tx + 0.05, ty + 0.1, zz); A.person(ax, ay, A.STY.flag, 0.8); } }] }); return t; });
      if (band >= 3) S.add(tx - 0.3, ty + 0.2, () => ropeBridge([lx + 0.85, ly + 0.05, 24], [tx - 0.2, ty + 0.1, tz + 2], 4));
    }
    // targets: one per few levels
    const nt = Math.min(4, 1 + Math.floor(L / 5));
    for (let k = 0; k < nt; k++) { const gx = along ? x + w * (0.25 + k * 0.18) : x + w * 0.62, gy = along ? y + d * 0.62 : y + d * (0.25 + k * 0.18); S.add(gx, gy, () => target(gx, gy, 0.9)); }
    // archers at the line
    const na = Math.min(3, 1 + band);
    for (let k = 0; k < na; k++) { const gx = along ? x + w * (0.3 + k * 0.2) : x + w * 0.92, gy = along ? y + d * 0.92 : y + d * (0.3 + k * 0.2); S.add(gx, gy, () => archer(gx, gy, k % 2 ? A.STY.cloth[2] : A.STY.flag)); }
    if (T('fortification') || band >= 3) S.add(x + w * 0.05, y + d * 0.05, () => { for (let k = 0; k < 6; k++) { const gx = x + 0.08, gy = y + d * (0.1 + k * 0.14); const [px, py] = A.P(gx, gy); A.line([px, py], [px + 2, py - 9], BARK_D, 1.4); A.line([px, py - 3], [px - 2, py - 6], BARK_D, 0.8); } });
    return S.run();
  });

  def('stable', ([x, y, w, d], L, band) => {
    const S = scene();
    // a bower of arching saplings as the stall, a wattle paddock with stags
    const bx = x + w * 0.22, by = y + d * 0.25;
    S.add(bx, by, () => {
      // arched living stall: a row of bent saplings with a leaf roof
      const n = 2 + band, len = 0.4 + band * 0.25;
      const st = stoneOf(); if (st && band >= 2) A.box(bx - 0.35, by - 0.25, 0.7, len + 0.5, 0, 2.5, st);
      let top = 0;
      for (let k = 0; k <= n; k++) { const gy = by - 0.2 + k * len / n; const a = A.P(bx - 0.32, gy), b = A.P(bx + 0.32, gy); curve(a, [(a[0] + b[0]) / 2, a[1] - 34], b, BARK, 1.6); top = 20; }
      const q = [A.P(bx - 0.36, by - 0.22, 12), A.P(bx - 0.36, by - 0.2 + len, 12), A.P(bx, by - 0.2 + len, 19), A.P(bx, by - 0.22, 19)];
      A.poly(q, snowy(A.shade(roofOf(), -0.2)));
      const q2 = [A.P(bx + 0.36, by - 0.2 + len, 12), A.P(bx + 0.36, by - 0.22, 12), A.P(bx, by - 0.22, 19), A.P(bx, by - 0.2 + len, 19)];
      A.poly(q2, snowy(roofOf()));
      if (!A.GLOW && !A.SNOW) for (let k = 1; k < 4; k++) A.line(A.P(bx + 0.36 - k * 0.09, by - 0.2 + len, 12 + k * 1.75), A.P(bx + 0.36 - k * 0.09, by - 0.22, 12 + k * 1.75), A.shade(roofOf(), -0.25), 0.6);
      const [hx, hy] = A.P(bx + 0.36, by - 0.2 + len, 11); hang(hx, hy + 3, 1.3);
      return top + 2;
    });
    // paddock
    const px0 = x + w * 0.5, py0 = y + d * 0.12, px1 = x + w * 0.95, py1 = y + d * 0.92;
    S.add(px0, py0, () => wattle([[px0, py1], [px0, py0], [px1, py0]], 6));
    const kinds = era() >= 3 ? 'whitestag' : 'stag';
    const n = Math.min(5, 1 + Math.floor(L / 4));
    const spots = [[0.7, 0.35, 1], [0.8, 0.7, -1], [0.62, 0.6, -1], [0.88, 0.45, 1], [0.7, 0.82, 1]];
    for (let k = 0; k < n; k++) { const [u, v, f] = spots[k]; S.add(x + w * u, y + d * v, () => A.animal(x + w * u, y + d * v, band >= 3 && k === 0 ? 'whitestag' : kinds, f)); }
    S.add(px1, py1, () => wattle([[px0, py1], [px1, py1], [px1, py0]], 6));
    S.add(x + w * 0.3, y + d * 0.8, () => { A.haystack(x + w * 0.3, y + d * 0.78, 0.55); if (band >= 1) { const g = [x + w * 0.15, y + d * 0.6]; A.box(g[0], g[1], 0.35, 0.12, 0, 3, WOOD); } });
    if (band >= 2) S.add(x + w * 0.05, y + d * 0.55, () => A.treeDecid(x + w * 0.06, y + d * 0.55, 0.9, true));
    if (band >= 2) S.add(x + w * 0.95, y + d * 0.1, () => A.treeDecid(x + w * 0.95, y + d * 0.06, 1, true));
    return S.run();
  });

  def('workshop', ([x, y, w, d], L, band) => {
    const S = scene(), along = w >= d;
    // an open bowyer's pavilion of curved posts under a leaf roof
    const sx = x + 0.1, sy = y + 0.1, sw = along ? w * 0.45 : w - 0.2, sd = along ? d - 0.5 : d * 0.45, H = 13 + band * 2;
    S.add(sx + sw / 2, sy + sd / 2, () => {
      for (const [px, py] of [[sx, sy], [sx + sw, sy], [sx, sy + sd], [sx + sw, sy + sd]]) { const a = A.P(px, py), b = A.P(px, py, H); curve(a, [a[0] + 3, (a[1] + b[1]) / 2], b, BARK, 1.8); }
      A.box(sx + sw * 0.2, sy + sd * 0.4, sw * 0.6, 0.25, 0, 5, WOOD);
      const zt = A.hip({ x: sx, y: sy, w: sw, d: sd, z: 0, h: H, col: WOOD }, Math.min(sw, sd) * 14, roofOf(), 0.12, 'tile');
      const [lx, ly] = A.P(sx + sw, sy + sd, H - 1); hang(lx, ly + 4, 1.3);
      return zt;
    });
    // bow-staves and a rack of longbows
    S.add(sx + sw + 0.2, sy + 0.2, () => { const gx = sx + sw + 0.15, gy = sy + 0.15; A.line(A.P(gx, gy, 2), A.P(gx + 0.6, gy, 2), WOOD_D, 1.2); A.line(A.P(gx, gy, 9), A.P(gx + 0.6, gy, 9), WOOD_D, 1.2); for (let k = 0; k < 5; k++) { const p = A.P(gx + 0.05 + k * 0.12, gy, 0); A.c.beginPath(); A.c.moveTo(p[0], p[1]); A.c.quadraticCurveTo(p[0] - 3, p[1] - 8, p[0], p[1] - 16); stroke('#8a5a2a', 1.1); } });
    // siege craft of living wood: a ram with a carved stag head, a bent-bough thrower later
    const done = 0.4 + 0.6 * Math.min(1, L / 8);
    const rx = along ? x + w * 0.55 : x + 0.2, ry = along ? y + d * 0.55 : y + d * 0.6;
    S.add(rx + 0.4, ry + 0.2, () => {
      A.box(rx, ry, 0.9, 0.35, 3, 2, BARK);
      for (const u of [0.15, 0.75]) { const [wx, wy] = A.P(rx + u, ry + 0.35, 3); A.circ(wx, wy, 3, WOOD_D, A.OUT); A.circ(wx, wy, 1, BARK_D); }
      if (done > 0.5) { A.log(rx - 0.15, rx + 1.0, ry + 0.17, 8, 2); const [hx, hy] = A.P(rx + 1.02, ry + 0.17, 8); A.line([hx, hy], [hx + 3, hy - 6], '#e8d8b0', 1); A.line([hx, hy], [hx - 1, hy - 7], '#e8d8b0', 1); }
      if (done > 0.8) { const a = A.P(rx, ry + 0.17, 14), b = A.P(rx + 0.9, ry + 0.17, 14); curve(a, [(a[0] + b[0]) / 2, a[1] - 6], b, roofOf(), 3); }
    });
    if (band >= 2) S.add(x + w * 0.88, y + d * 0.3, () => { // a bent-bough thrower
      const gx = x + w * 0.85, gy = y + d * 0.28; A.box(gx - 0.2, gy - 0.15, 0.4, 0.3, 2, 2, BARK);
      const a = A.P(gx, gy, 4), b = A.P(gx - 0.2, gy, 30); curve(a, [a[0] + 8, (a[1] + b[1]) / 2], b, '#9a7a4a', 2.4);
      A.c.beginPath(); A.c.arc(b[0], b[1] + 2, 2.4, 0, Math.PI * 2); A.c.fillStyle = A.F('#8a7a6a'); A.c.fill();
      return 32;
    });
    return Math.max(S.run(), H + 10);
  });

  def('smelter', ([x, y, w, d], L, band) => {
    const S = scene(), bel = T('bellows'), met = T('metallurgy');
    // a charcoal clamp smoking under turf
    S.add(x + w * 0.25, y + d * 0.75, () => { const [cx2, cy2] = A.P(x + w * 0.25, y + d * 0.75); A.c.beginPath(); A.c.ellipse(cx2, cy2, 13, 6, 0, Math.PI, Math.PI * 2); A.c.ellipse(cx2, cy2, 13, 3, 0, 0, Math.PI); A.gradFill(cx2 - 13, cx2 + 13, A.SNOW ? '#e8ecee' : '#5a6a3a'); A.lampDot(cx2 - 3, cy2 - 4, 1.2, '#7a3a1a', '#ff8a3a'); A.rec('smoke', { x: cx2, y: cy2 - 10, kind: 'smelter', seed: A.R(), dark: true }); });
    // the burnt oak: a blackened hollow trunk as the furnace flue, a clay furnace at its foot
    const fx = x + w * 0.62, fy = y + d * 0.3, H = 30 + band * 8 + Math.min(8, L);
    S.add(fx, fy, () => {
      const st = stoneOf(); const base = '#9a6446'; if (st && band >= 2) A.cyl(fx, fy + 0.15, 0.4, 0, 3, st);
      if (band >= 1) { // the burnt oak: charred hollow trunk, snapped boughs, embers glowing in its cracks
        const ox = fx + 0.08, oy = fy - 0.16; trunk(ox, oy, 0.17, 0, H, { col: '#4a3a32' }); const [tx, ty] = A.P(ox, oy, H);
        A.line([tx - 2, ty + 8], [tx - 10, ty - 2], '#4a3a32', 2); A.line([tx - 10, ty - 2], [tx - 12, ty - 7], '#4a3a32', 1.2); A.line([tx + 2, ty + 14], [tx + 9, ty + 6], '#4a3a32', 1.8);
        A.c.beginPath(); A.c.ellipse(tx, ty, 5.6, 2.8, 0, 0, Math.PI * 2); A.c.fillStyle = A.GLOW ? '#ff9a3a' : '#2a1e18'; A.c.fill();
        for (let k = 0; k < 1 + band; k++) { const p = Gp(ox, oy, 0.2 + k * 0.45, 0.17, H * (0.25 + k * 0.2)); A.lamp([[p[0] - 0.7, p[1]], [p[0] + 0.7, p[1]], [p[0] + 1.2, p[1] - 6], [p[0], p[1] - 7]], '#a04a1a', '#ffb04a'); }
        A.rec('smoke', { x: tx, y: ty - 2, kind: 'smelter', seed: A.R(), dark: true }); A.rec('lights', { x: tx, y: ty, r: 14 }); }
      A.dome(fx, fy + 0.15, 0.34, st && band >= 2 ? 3 : 0, 16 + band * 2, base, false);
      const [mx, my] = Gp(fx, fy + 0.15, Math.PI / 4, 0.33, 3);
      lightFill(c => { c.moveTo(mx - 3, my); c.lineTo(mx - 3, my - 3); c.arc(mx, my - 3, 3, Math.PI, 0); c.lineTo(mx + 3, my); c.closePath(); }, '#e8742a', '#ffb04a');
      A.rec('fires', { x: mx, y: my - 2, s: 0.45, glowOnly: true }); A.rec('lights', { x: mx, y: my - 4, r: 20 });
      if (band === 0) { const [sx, sy] = A.P(fx, fy + 0.15, 18); A.rec('smoke', { x: sx, y: sy, kind: 'smelter', seed: A.R(), dark: true }); }
      return band >= 1 ? H + 8 : 22;
    });
    if (band >= 2) S.add(x + w * 0.3, y + d * 0.22, () => { // a second furnace under a leaf awning
      const gx = x + w * 0.3, gy = y + d * 0.22; for (const [dx, dy] of [[-0.3, 0.3], [0.3, 0.3], [0.3, -0.3]]) A.line(A.P(gx + dx, gy + dy), A.P(gx + dx, gy + dy, 14), WOOD_D, 1.2);
      A.dome(gx, gy, 0.22, 0, 11, '#9a6446', false); const [mx, my] = Gp(gx, gy, Math.PI / 4, 0.22, 2); A.lampDot(mx, my - 2, 1.8, '#e8742a', '#ffb04a');
      A.poly([A.P(gx - 0.36, gy - 0.36, 18), A.P(gx + 0.36, gy - 0.36, 18), A.P(gx + 0.36, gy + 0.36, 14), A.P(gx - 0.36, gy + 0.36, 14)], snowy(roofOf()));
      return 20;
    });
    if (bel) S.add(fx + 0.4, fy + 0.4, () => { const [bx2, by2] = A.P(fx + 0.42, fy + 0.45); A.poly([[bx2 - 5, by2 - 2], [bx2 + 4, by2 - 4], [bx2 + 4, by2], [bx2 - 5, by2]], '#8a5a3a'); A.line([bx2 + 4, by2 - 4], [bx2 + 9, by2 - 9], WOOD_D, 1.1); });
    if (met) S.add(fx + 0.1, fy + 0.6, () => { const a = A.P(fx + 0.1, fy + 0.45), b = A.P(fx + 0.1, fy + 0.85); A.line(a, b, '#ff8a3a', 2); A.lamp([[a[0] - 1, a[1]], [a[0] + 1, a[1]], [b[0] + 1, b[1]], [b[0] - 1, b[1]]], '#c0501a', '#ffb050'); });
    // bog-iron ore heap
    S.add(x + w * 0.8, y + d * 0.8, () => { const [ox, oy] = A.P(x + w * 0.85, y + d * 0.7); A.c.beginPath(); A.c.ellipse(ox, oy - 1, 7, 3.4, 0, Math.PI, Math.PI * 2); A.c.fillStyle = A.F('#6a5a46'); A.c.fill(); for (let k = 0; k < 5; k++) A.circ(ox - 4 + k * 2, oy - 2 - (k % 2) * 2, 1.4, k % 2 ? '#8a4a2a' : '#5a4a3a'); });
    return S.run();
  });

  def('smithy', ([x, y, w, d], L, band) => {
    const S = scene();
    // the smith's trunk-hall at the back, the forge under the boughs of a living tree in front
    const hx = x + w * 0.28, hy = y + d * 0.28;
    S.add(hx, hy, () => band === 0 ? leanTo(hx - 0.35, hy - 0.3, 0.75, 0.5, 11) : trunkHall(hx, hy, 0.34, 14 + band * 2, { rh: 20 }));
    if (band >= 1) S.add(hx + 0.05, hy - 0.2, () => { const st = stoneOf() || '#8a8274'; A.box(hx + 0.1, hy - 0.35, 0.2, 0.2, 0, 30 + band * 4, st); A.box(hx + 0.07, hy - 0.38, 0.26, 0.26, 30 + band * 4, 2, A.shade(st, -0.2)); const [px, py] = A.P(hx + 0.2, hy - 0.25, 34 + band * 4); A.rec('smoke', { x: px, y: py, kind: 'smithy', seed: A.R() }); return 36 + band * 4; });
    const tx = x + w * 0.78, ty = y + d * 0.35;
    S.add(tx, ty, () => { trunk(tx, ty, 0.13 + band * 0.02, 0, 26 + band * 6); boughs(tx, ty, 26 + band * 6, 0.5); return crown(tx - 0.1, ty + 0.1, 34 + band * 7, 0.55 + band * 0.06); });
    const fx = x + w * 0.55, fy = y + d * 0.68;
    S.add(fx, fy, () => {
      // forge hearth of river stones
      A.cyl(fx - 0.2, fy - 0.1, 0.2, 0, 6, stoneOf() || '#8a8274');
      const [hx2, hy2] = A.P(fx - 0.2, fy - 0.1, 6); A.lampDot(hx2, hy2, 2.4, '#e8742a', '#ffb04a'); A.rec('fires', { x: hx2, y: hy2 - 1, s: 0.5 }); A.rec('lights', { x: hx2, y: hy2 - 4, r: 24 });
      // anvil on a stump
      A.cyl(fx + 0.25, fy + 0.1, 0.1, 0, 4, BARK, '#c9a874');
      const [ax, ay] = A.P(fx + 0.25, fy + 0.1, 4); A.poly([[ax - 3, ay], [ax + 3, ay], [ax + 1.5, ay - 2.5], [ax + 4, ay - 4], [ax - 4, ay - 4], [ax - 1.5, ay - 2.5]], '#4a4a52');
      A.rec('anvils', { x: ax, y: ay - 5 });
      return 14;
    });
    // a rack of leaf-bladed swords
    S.add(x + w * 0.9, y + d * 0.8, () => { const gx = x + w * 0.9, gy = y + d * 0.68; const a = A.P(gx, gy), b = A.P(gx, gy + 0.3); A.line(a, [a[0], a[1] - 10], WOOD_D, 1); A.line(b, [b[0], b[1] - 10], WOOD_D, 1); A.line([a[0], a[1] - 8], [b[0], b[1] - 8], WOOD_D, 1); for (let k = 1; k < 4; k++) { const m = [a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4]; A.c.beginPath(); A.c.moveTo(m[0], m[1] + 1); A.c.quadraticCurveTo(m[0] + 1.8, m[1] - 7, m[0], m[1] - 13); A.c.quadraticCurveTo(m[0] - 1.8, m[1] - 7, m[0], m[1] + 1); A.c.fillStyle = A.F(era() >= 3 ? '#e8e0b0' : '#c8ccd2'); A.c.fill(); } });
    if (band >= 2) S.add(tx, ty + 0.4, () => { const a = A.P(tx, ty, 22), b = A.P(fx, fy, 12); lanternString(a, b, 2, 2); });
    return S.run();
  });

  def('armory', ([x, y, w, d], L, band) => {
    const S = scene();
    // the bowery: a tall trunk-hall hung with bows; staves seasoning on frames; woven shields
    const hx = x + w * 0.35, hy = y + d * 0.35, hr = 0.36 + band * 0.04;
    S.add(hx, hy, () => {
      if (band === 0) { const t = leanTo(hx - 0.4, hy - 0.3, 0.8, 0.5, 12); for (let k = 0; k < 4; k++) { const p = A.P(hx - 0.3 + k * 0.18, hy - 0.22, 9); A.c.beginPath(); A.c.arc(p[0] + 3, p[1] - 1, 5, Math.PI * 0.6, Math.PI * 1.4); stroke('#8a5a2a', 1.1); } return t; }
      const top = trunkHall(hx, hy, hr, 16 + band * 3, { rh: 22 + band * 3 });
      // bows hung on the trunk
      for (let k = 0; k < 2 + band; k++) { const t = -0.45 + k * 0.32; if (!front(t)) continue; const p = Gp(hx, hy, t, hr, 6 + (k % 2) * 3); A.c.beginPath(); A.c.arc(p[0] + 3, p[1] - 4, 5, Math.PI * 0.6, Math.PI * 1.4); stroke('#8a5a2a', 1.1); }
      return top;
    });
    if (band >= 2) S.add(x + w * 0.78, y + d * 0.2, () => trunkHall(x + w * 0.78, y + d * 0.22, 0.24, 14 + band * 2, { rh: 18, dome: true }));
    // seasoning frames
    const nf = Math.min(3, 1 + Math.floor(L / 6));
    for (let k = 0; k < nf; k++) S.add(x + w * 0.12, y + d * (0.6 + k * 0.13), () => { const gx = x + w * 0.1, gy = y + d * (0.6 + k * 0.13); A.line(A.P(gx, gy), A.P(gx, gy, 12), WOOD_D, 1); A.line(A.P(gx + 0.45, gy), A.P(gx + 0.45, gy, 12), WOOD_D, 1); A.line(A.P(gx, gy, 11), A.P(gx + 0.45, gy, 11), WOOD_D, 1); for (let j = 0; j < 5; j++) { const p = A.P(gx + 0.05 + j * 0.09, gy, 11); A.line(p, [p[0] - 0.5, p[1] + 9], '#c8a060', 1); } });
    // woven shields on a stand and quivers
    S.add(x + w * 0.7, y + d * 0.75, () => { for (let k = 0; k < 2 + Math.min(2, band); k++) { const [sx, sy] = A.P(x + w * (0.6 + k * 0.1), y + d * 0.8, 6); A.c.beginPath(); A.c.ellipse(sx, sy, 3.2, 4.2, 0, 0, Math.PI * 2); A.c.fillStyle = A.F(WICKER); A.c.fill(); stroke(A.OUT, 0.6); A.circ(sx, sy, 1.2, k % 2 ? A.STY.flag : A.STY.cloth[1]); } });
    if (T('fortification')) S.add(x + w * 0.5, y + d * 0.95, () => { for (let k = 0; k < 4; k++) { const [px, py] = A.P(x + w * (0.3 + k * 0.12), y + d * 0.95); A.line([px, py], [px + 3, py - 8], BARK_D, 1.3); } });
    if (band >= 3) S.add(x + w * 0.55, y + d * 0.3, () => ropeBridge([hx + 0.3, hy - 0.1, 22], [x + w * 0.78 - 0.2, y + d * 0.22 + 0.05, 18], 3));
    return S.run();
  });

  def('academy', ([x, y, w, d], L, band) => {
    const S = scene(), cx = x + w * 0.45, cy = y + d * 0.42, carto = T('cartography'), med = T('medicine');
    if (band === 0) { // a reading circle of stones under an old tree
      S.add(cx, cy, () => { trunk(cx, cy, 0.15, 0, 26); boughs(cx, cy, 26, 0.5); return crown(cx, cy, 36, 0.62); });
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + 0.4; S.add(cx + Math.cos(a) * 0.6, cy + Math.sin(a) * 0.55, () => { const gx = cx + Math.cos(a) * 0.6, gy = cy + Math.sin(a) * 0.55; A.cyl(gx, gy, 0.08, 0, 3, '#9a978a'); if (k === 1) { const [px, py] = A.P(gx, gy, 3); A.person(px, py, A.STY.cloth[2], 0.8); } }); }
      if (L >= 3) S.add(cx + 0.5, cy + 0.6, () => { const [px, py] = A.P(cx + 0.5, cy + 0.6); A.poly([[px - 4, py - 3], [px + 4, py - 3], [px + 4, py], [px - 4, py]], '#e8dcc0'); });
      return S.run();
    }
    // the starwatch: a slender tree with a library at its foot and an observatory deck on top
    const th = 46 + band * 14 + L;
    S.add(cx, cy, () => {
      const pz = plinth(cx, cy, 0.48, 3);
      trunk(cx, cy, 0.4, pz, 14 + band * 2, { civic: true, noRoots: pz > 0 });
      roundDoor(cx, cy, 0.4, pz, 10);
      for (const t of [-0.4, 0.2, 1.3]) roundWin(cx, cy, 0.4, pz + 9, t, 1.3);
      const z1 = pz + 14 + band * 2;
      spireRoof(cx, cy, 0.52, z1, 8, roofOf(), { lean: 0, noGild: true });
      const decks = band >= 2 ? [{ z: th * 0.72, r: 0.38, fn: zz => {
        // armillary / star-dome
        if (band >= 3 && stoneOf() === MOON) { A.cyl(cx, cy, 0.2, zz, 6, MOON); A.dome(cx, cy, 0.22, zz + 6, 9, era() >= 3 ? '#cfd8e8' : '#b8c4cc'); A.lamp([A.P(cx + 0.02, cy + 0.2, zz + 9), A.P(cx + 0.12, cy + 0.2, zz + 9), A.P(cx + 0.12, cy + 0.2, zz + 15), A.P(cx + 0.02, cy + 0.2, zz + 15)], '#3a4a5a', '#cfefff'); }
        else { const [ox, oy] = A.P(cx + 0.1, cy + 0.1, zz + 8); A.c.beginPath(); A.c.ellipse(ox, oy, 6, 6, 0, 0, Math.PI * 2); stroke(carto ? '#d9b44a' : '#a08a5a', 1); A.c.beginPath(); A.c.ellipse(ox, oy, 6, 2.2, 0.4, 0, Math.PI * 2); stroke(carto ? '#d9b44a' : '#a08a5a', 0.8); A.circ(ox, oy, 1.6, '#e8d070'); A.line([ox, oy + 6], [ox, oy + 9], WOOD_D, 1); }
        const [lx, ly] = Gp(cx, cy, 0.9, 0.38, zz); hang(lx, ly + 7, 1.3);
      } }] : [];
      const top = greatTree(cx, cy, { r: 0.13, h: th, cr: 0.5 + band * 0.08, decks, civic: true, stair: band >= 2 ? th * 0.72 : 0 });
      for (let k = 0; k < 3 + band * 2; k++) { const [sx, sy] = A.P(cx - 0.6 + k * 0.25, cy - 0.5 + (k % 2) * 0.3, th + 10 + (k % 3) * 8); A.lampDot(sx, sy, 1.2, '#bfe8ff', '#dff4ff'); A.rec('sparks', { x: sx, y: sy, kind: 'star' }); }
      return top;
    });
    if (med || band >= 2) S.add(x + w * 0.85, y + d * 0.75, () => { for (let k = 0; k < 3; k++) { const gx = x + w * 0.7 + k * 0.14, gy = y + d * 0.65; A.poly(A.quad(gx, gy, 0.1, 0.3), A.SNOW ? '#e8ecee' : '#6a4e32', null); if (!A.SNOW) for (let j = 0; j < 2; j++) { const [px, py] = A.P(gx + 0.05, gy + 0.08 + j * 0.14); A.circ(px, py - 1.5, 1.7, med ? ['#c8a0e0', '#e8e0a0', '#a8d878'][k] : leaves()[1]); } } });
    if (carto && band < 2) S.add(x + w * 0.85, y + d * 0.2, () => { const gx = x + w * 0.85, gy = y + d * 0.2; A.line(A.P(gx, gy), A.P(gx, gy, 10), WOOD_D, 1); const [ox, oy] = A.P(gx, gy, 14); A.circ(ox, oy, 4, null, '#d9b44a'); A.c.beginPath(); A.c.ellipse(ox, oy, 4, 1.5, 0.4, 0, Math.PI * 2); stroke('#d9b44a', 0.8); });
    return S.run();
  });

  def('tavern', ([x, y, w, d], L, band) => {
    const S = scene(), along = w >= d, cx = x + (along ? w * 0.3 : w * 0.5), cy = y + (along ? d * 0.5 : d * 0.28);
    // the mead-bower: a fat trunk-hall with a big round door, tables under strung lanterns
    const r = Math.min(0.5, Math.min(w, d) * 0.36);
    S.add(cx, cy, () => {
      if (band === 0) return bower(cx, cy, r, 15);
      let top;
      if (band >= 2) { // a cellar drum, a balcony deck, and the mead-hall above it
        const st = stoneOf(), z0 = st ? 3 : 0; if (st) A.cyl(cx, cy, r * 1.1, 0, 3, st);
        trunk(cx, cy, r, z0, 10, { noRoots: !!st }); roundDoor(cx, cy, r, z0, 9);
        deck(cx, cy, r + 0.12, z0 + 10, r); rail(cx, cy, r + 0.12, z0 + 12.2, false);
        top = trunkHall(cx, cy, r * 0.82, 8 + band * 2, { z: z0 + 12.2, rh: 18 + band * 2, noDoor: false });
        rail(cx, cy, r + 0.12, z0 + 12.2, true);
      } else top = trunkHall(cx, cy, r, 15 + band * 2, { rh: 20 + band * 2, dome: band === 1 });
      // a sign: a leaf-mug board
      const [sx, sy] = Gp(cx, cy, 1.1, r, 13); A.line([sx, sy], [sx + 6, sy], WOOD_D, 1); A.poly([[sx + 3, sy + 1], [sx + 9, sy + 1], [sx + 9, sy + 7], [sx + 3, sy + 7]], '#c9a874'); A.poly([[sx + 4.5, sy + 2.5], [sx + 7, sy + 2.5], [sx + 7, sy + 6], [sx + 4.5, sy + 6]], '#7a5a2a', null);
      return top;
    });
    const tx = x + (along ? w * 0.72 : w * 0.5), ty = y + (along ? d * 0.5 : d * 0.72);
    const nt = Math.min(3, 1 + band);
    for (let k = 0; k < nt; k++) { const gx = along ? tx + (k - 1) * 0.0 : tx + (k - 1) * 0.0, gy = along ? ty + (k - 1) * 0.32 : ty; const fx = along ? tx : tx + (k - 1) * 0.35, fy = along ? gy : ty; void gx; S.add(fx, fy, () => { A.cyl(fx, fy, 0.13, 0, 4, BARK, '#c9a874'); for (const [dx, dy] of [[-0.2, 0.05], [0.18, 0.08]]) A.cyl(fx + dx, fy + dy, 0.05, 0, 2.5, WOOD_D); const [mx, my] = A.P(fx, fy, 4); A.circ(mx - 1.5, my - 1, 0.9, '#e8d070'); }); }
    S.add(tx + 0.2, ty + 0.2, () => { const a = A.P(cx, cy, 18), b = A.P(along ? x + w - 0.08 : tx, along ? ty : y + d - 0.08, 0); A.line(b, [b[0], b[1] - 16], WOOD_D, 1); lanternString(a, [b[0], b[1] - 16], 2 + band, 3); });
    S.add(x + w * 0.9, y + d * 0.92, () => { A.barrel(x + (along ? w * 0.92 : w * 0.15), y + (along ? d * 0.15 : d * 0.92)); });
    return S.run();
  });

  def('theatre', ([x, y, w, d], L, band) => {
    const S = scene(), along = w >= d, cx = x + w / 2, cy = y + d / 2;
    const span = (along ? w : d) * 0.36;
    const at = (u, v) => along ? [cx + u, cy + v] : [cx + v, cy + u];
    // song-glade: two living trees bent to meet over a stage; audience on log benches
    if (band === 0) {
      S.add(cx, cy, () => { A.firePit(cx, cy, 0.7); const [px, py] = A.P(...at(0.25, -0.15)); A.person(px, py, A.STY.cloth[3], 0.85); A.c.beginPath(); A.c.ellipse(px + 3, py - 5, 1.6, 2.2, 0, 0, Math.PI * 2); stroke('#8a5a2a', 0.9); });
      for (const u of [-0.55, 0.55]) S.add(...at(u, 0.3), () => A.log(...(along ? [cx + u - 0.2, cx + u + 0.2, cy + 0.3] : [cx + 0.3 - 0.05, cx + 0.3 + 0.05, cy + u]), 2, 1.6));
      return Math.max(S.run(), 20);
    }
    const [s0x, s0y] = at(-span, -0.15), [s1x, s1y] = at(span, -0.15), aH = 22 + band * 7;
    S.add(...at(0, -0.3), () => {
      const st = band >= 3 && stoneOf() === MOON ? MOON : WOOD;
      const sb = along ? [cx - span, cy - 0.38, span * 2, 0.4] : [cx - 0.38, cy - span, 0.4, span * 2];
      A.box(sb[0], sb[1], sb[2], sb[3], 0, 3 + (band >= 2 ? 1 : 0), st);
      for (const [gx, gy, s] of [[s0x, s0y, -1], [s1x, s1y, 1]]) {
        trunk(gx, gy, 0.08, 0, aH * 0.55);
        const b0 = A.P(gx, gy, aH * 0.55), tp = A.P(...at(0, -0.15), aH);
        curve(b0, [b0[0] + s * 1, tp[1] + 2], tp, bark(), 3.4);
      }
      crown(...at(0, -0.15), aH + 6, 0.32 + band * 0.04, true);
      const [px, py] = A.P(...at(0, -0.22), 4); A.person(px, py, A.STY.cloth[3], 0.9);
      if (band >= 2) { const a = A.P(s0x, s0y, aH * 0.5), b = A.P(s1x, s1y, aH * 0.5); lanternString(a, b, 3 + band, 6); }
      if (band >= 3 && era() >= 2) { const tp = A.P(...at(0, -0.15), aH - 2); A.lampDot(tp[0], tp[1] + 3, 1.8, '#9ad8e8', '#d8f8ff'); A.rec('sparks', { x: tp[0], y: tp[1] + 3, kind: 'moon' }); }
      return aH + 18;
    });
    // log benches (moon-white tiers in the Empire era) with an audience
    const rows = Math.min(2, band);
    for (let rr = 0; rr < rows; rr++) S.add(...at(0, 0.25 + rr * 0.22), () => {
      const v = 0.25 + rr * 0.22;
      if (band >= 3 && stoneOf()) { const b = along ? [cx - span, cy + v - 0.08, span * 2, 0.16] : [cx + v - 0.08, cy - span, 0.16, span * 2]; A.box(b[0], b[1], b[2], b[3], 0, 2 + rr * 2, stoneOf()); }
      else A.log(...(along ? [cx - span, cx + span, cy + v] : [cx + v - 0.03, cx + v + 0.03, cy]), 2 + rr * 2, 1.7);
      const n = Math.min(5, 2 + Math.floor(L / 4));
      for (let k = 0; k < n; k++) { const u = -span * 0.8 + k * span * 1.6 / Math.max(1, n - 1); const [px, py] = A.P(...at(u, v), 3 + rr * 2); A.person(px, py, A.STY.cloth[(k + rr) % 4], 0.75); }
    });
    if (band >= 2) S.add(...at(span + 0.15, 0.4), () => fireflies(cx, cy, 14, 22));
    return S.run();
  });

  def('temple', ([x, y, w, d], L, band) => {
    const S = scene(), cx = x + w / 2, cy = y + d / 2, rad = Math.min(w, d) * 0.4;
    // the druid circle: posts → menhirs → trilithons round a sacred oak and a moonwell
    const n = band === 0 ? 6 : 7 + band;
    const stones = [];
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + 0.3; stones.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, k]); }
    const ring = ([gx, gy, k]) => () => {
      if (band === 0) { const [px, py] = A.P(gx, gy); A.poly([[px - 1.8, py], [px + 1.8, py], [px + 1.6, py - 13], [px, py - 15], [px - 1.6, py - 13]], '#7a5a3c'); if (k % 2 === 0) A.circ(px, py - 10, 1.4, A.STY.cloth[k % 4]); return 16; }
      return menhir(gx, gy, 14 + (k % 2) * 4 + band * 3, 0.9 + band * 0.08);
    };
    for (const s of stones) S.add(s[0], s[1], ring(s));
    if (band >= 2) { // lintels over neighbouring pairs (trilithons)
      for (let k = 0; k < n - 1; k += 2) { const a = stones[k], b = stones[k + 1]; S.add((a[0] + b[0]) / 2 + 0.01, (a[1] + b[1]) / 2 + 0.01, () => { const z = 14 + band * 3 + 0.5; const p = A.P(a[0], a[1], z), q = A.P(b[0], b[1], z); A.poly([[p[0], p[1]], [q[0], q[1]], [q[0], q[1] - 3.5], [p[0], p[1] - 3.5]], stoneOf() === MOON || era() >= 2 ? MOON : '#a8a598'); }); }
    }
    // centre: a sacred oak (band 0-1) / a moonwell beneath it (band 2+)
    S.add(x + w * 0.12, y + d * 0.12, () => { const tx = x + w * 0.1, ty = y + d * 0.1; trunk(tx, ty, 0.1 + band * 0.025, 0, 26 + band * 6, { civic: true }); boughs(tx, ty, 26 + band * 6, 0.38); if (band >= 1) { const [lx, ly] = A.P(tx + 0.25, ty, 22 + band * 6); tealLamp(lx, ly + 8); } return crown(tx, ty, 34 + band * 8, 0.36 + band * 0.06); });
    S.add(cx + 0.1, cy + 0.1, () => {
      if (band < 2) { const [ax, ay] = A.P(cx + 0.15, cy + 0.15); A.box(cx + 0.02, cy + 0.08, 0.28, 0.16, 0, 4, '#9a978a'); if (L >= 3) A.lampDot(ax, ay - 6, 1.4, '#e8b85a', '#ffd46e'); return 6; }
      const st = stoneOf() || '#a3a08a'; A.cyl(cx + 0.12, cy + 0.12, 0.3, 0, 3.5, st, A.shade(st, 0.06));
      const [wx, wy, rx, ry] = A.ell(cx + 0.12, cy + 0.12, 3.5, 0.24); A.c.beginPath(); A.c.ellipse(wx, wy, rx, ry, 0, 0, Math.PI * 2); A.c.fillStyle = A.GLOW ? '#cfefff' : A.SEASON === 3 ? '#d8eef8' : '#9fd8f0'; A.c.fill();
      A.rec('sparks', { x: wx, y: wy - 2, kind: 'moon' }); A.rec('lights', { x: wx, y: wy, r: 30 + band * 4, col: 'grove' });
      return 6;
    });
    if (T('medicine')) S.add(x + w * 0.92, y + d * 0.92, () => { const [px, py] = A.P(x + w * 0.9, y + d * 0.92); for (let k = 0; k < 4; k++) A.circ(px - 4 + k * 2.6, py - 2, 1.5, ['#c8a0e0', '#e8e0a0', '#a8d878', '#f0b0c0'][k]); });
    if (band >= 1) S.add(cx, cy + 0.3, () => fireflies(cx, cy, 12, 22 + band * 4));
    return S.run();
  });

  def('magetower', ([x, y, w, d], L, band) => {
    const cx = x + w / 2, cy = y + d / 2, H = 44 + band * 12 + Math.min(16, L);
    // the moontree: two silver trunks twisting round each other, cradling a moon-orb in their crown
    A.roots(cx, cy, 0.3);
    const pz = plinth(cx, cy, 0.42, 3);
    A.cyl(cx, cy, 0.2, pz, H * 0.78, '#b8c0c8', '#d8e0e8');
    A.twistLines(cx, cy, pz, pz + H * 0.78, 0.2, '#7e8894', 2 + band * 0.5, 0.9, 0);
    A.twistLines(cx, cy, pz, pz + H * 0.78, 0.2, '#dfe6ee', 2 + band * 0.5, 0.9, Math.PI);
    for (let v = 12; v < H * 0.7; v += 13) { const [wx, wy] = A.P(cx + 0.14, cy + 0.14, pz + v); A.lamp([[wx - 1.2, wy], [wx + 1.2, wy], [wx + 1.2, wy - 3.5], [wx, wy - 5], [wx - 1.2, wy - 3.5]], '#3a4658', '#dff0ff'); }
    if (band >= 1) { stair(cx, cy, 0.2, pz + 2, pz + H * 0.6, 1.5, 'front', 0.2); }
    const zc = pz + H * 0.78;
    boughs(cx, cy, zc, 0.5, '#b8c0c8');
    const [x0, y0] = A.P(cx, cy, zc + 12);
    A.blobs(x0, y0, (0.55 + band * 0.1) * A.HW, A.SEASON === 3 ? ['#7a8aa0', '#a8b8d0', '#f2f6fa'] : era() >= 3 ? ['#8a9ab8', '#c4d0ea', '#fff4c8'] : ['#7f93b8', '#aebfe0', '#eef4ff'], false);
    // the orb
    const [ox, oy] = A.P(cx, cy, zc + 14);
    A.lampDot(ox, oy, 3.4 + band * 0.4, '#e8f0ff', '#ffffff');
    A.rec('magic', { x: ox, y: oy, r: 10 + band * 3 + Math.min(6, L / 3), n: 3 + band * 2 + Math.floor(L / 5), col: 'rgba(200,230,255,A)', seed: A.R() });
    A.rec('lights', { x: ox, y: oy, r: 34 + band * 8, col: 'grove' });
    if (band >= 2) for (const t of [0.2, 1.6, 3.0]) { const p = Gp(cx, cy, t, 0.55, zc + 2); hang(p[0], p[1] + 6, 1.3); }
    if (band >= 3) for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.5; const [sx, sy] = A.P(cx + Math.cos(a) * 0.6, cy + Math.sin(a) * 0.6, zc + 22 + (k % 2) * 6); A.lampDot(sx, sy, 1.3, '#cfe8ff', '#ffffff'); A.rec('sparks', { x: sx, y: sy, kind: 'star' }); }
    return zc + 14 + (0.55 + band * 0.1) * A.HW;
  });

  def('heartgrove', ([x, y, w, d], L, band) => {
    const S = scene(), cx = x + w / 2, cy = y + d / 2;
    const glowLeaves = A.SEASON === 3 ? ['#3a6a7a', '#5a9ab0', '#e9f6f8'] : A.SEASON === 2 ? ['#1f7a6a', '#7ab890', '#e8e08a'] : ['#1f7a6a', '#38b090', '#9af0d0'];
    const r = 0.12 + band * 0.05 + L * 0.003, th = 30 + band * 12 + L, Rr = (0.6 + band * 0.24 + L * 0.008);
    // ring: river stones → mossy menhirs → moon-white stones with pools
    const n = 8;
    const ringAt = k => { const a = k / n * Math.PI * 2 + 0.2; return [cx + Math.cos(a) * w * 0.44, cy + Math.sin(a) * d * 0.44]; };
    for (let k = 0; k < n; k++) { const [gx, gy] = ringAt(k); S.add(gx, gy, () => { if (band <= 1) { const [sx, sy] = A.P(gx, gy); A.circ(sx, sy - 1.5, 2 + band * 0.6, '#a8a8a0', A.OUT); if (band === 1 && k % 2) A.lampDot(sx, sy - 5, 1, '#8fd8c0', '#c8ffe8'); return 4; } return menhir(gx, gy, 9 + (k % 2) * 3 + band * 2, 0.7); }); }
    S.add(cx, cy, () => {
      // great roots arching out of the ground
      if (band >= 2) for (const t of [-0.3, 0.7, 1.6, 2.6, 3.6]) { const a = Gp(cx, cy, t, r * 0.8, 6 + band * 2), b = Gp(cx, cy, t, r * 3.2, 0), m = Gp(cx, cy, t, r * 2.4, 10 + band * 4); curve(a, m, b, BARK_D, 2.6 + band * 0.4); }
      if (band >= 3) stair(cx, cy, r, 2, th * 0.6, 1.25, 'back');
      trunk(cx, cy, r, 0, th, { col: era() >= 3 ? '#8a7258' : '#7a5a3c' });
      // glowing sap veins
      for (let k = 0; k < 2 + band; k++) { const t = -0.4 + k * 0.5; if (!front(t)) continue; const p = Gp(cx, cy, t, r, th * (0.2 + (k % 3) * 0.18)); const q = Gp(cx, cy, t + 0.12, r, th * (0.2 + (k % 3) * 0.18) + 9); A.c.beginPath(); A.c.moveTo(p[0], p[1]); A.c.quadraticCurveTo(p[0] + 2, (p[1] + q[1]) / 2, q[0], q[1]); A.c.strokeStyle = A.GLOW ? '#c8ffe8' : '#6fcfb0'; A.c.lineWidth = 1.2; A.c.stroke(); }
      if (band >= 1) { const [dx, dy] = Gp(cx, cy, Math.PI / 4, r, 0); lightFill(c => { c.moveTo(dx - 3, dy); c.lineTo(dx - 3, dy - 6); c.arc(dx, dy - 6, 3, Math.PI, 0); c.lineTo(dx + 3, dy); c.closePath(); }, '#2a4a40', '#b0ffe0'); }
      if (band >= 3) stair(cx, cy, r, 2, th * 0.6, 1.25, 'front');
      boughs(cx, cy, th, Rr * 0.7, era() >= 3 ? '#8a7258' : '#6a4a30');
      const [x0, y0] = A.P(cx, cy, th + Rr * A.HW * 0.6);
      A.blobs(x0, y0, Rr * A.HW, glowLeaves, false);
      for (let k = 0; k < 5 + band * 3 + Math.floor(L / 3); k++) { const a = A.R() * Math.PI * 2, rr = A.R() * Rr * A.HW * 0.9; A.lampDot(x0 + Math.cos(a) * rr, y0 + Math.sin(a) * rr * 0.7, 1.3, '#d8ffe8', '#c8ffe0'); }
      // hanging lanterns on long cords from the boughs
      const nl = Math.min(8, band * 2 + Math.floor(L / 4));
      for (let k = 0; k < nl; k++) { const a = -0.6 + k / Math.max(1, nl - 1) * 2.6, lx = x0 + Math.cos(a + Math.PI / 2) * Rr * A.HW * 0.8, ly = y0 + Rr * A.HW * 0.45 + (k % 3) * 3; A.line([lx, ly - 8 - (k % 2) * 4], [lx, ly - 2], '#3a2a20', 0.5); A.lampDot(lx, ly, 1.6, '#8fd8c0', '#d8fff0'); A.rec('lights', { x: lx, y: ly, r: 10, col: 'grove' }); }
      A.rec('sparks', { x: x0, y: y0, kind: 'grove', r: Rr * A.HW });
      A.rec('lights', { x: x0, y: y0, r: Rr * A.HW * 1.6, col: 'grove' });
      return th + Rr * A.HW * 1.5;
    });
    if (band >= 3 && stoneOf()) S.add(cx + 0.5, cy + 0.5, () => { const gx = cx + w * 0.3, gy = cy + d * 0.3, [wx, wy, rx, ry] = A.ell(gx, gy, 1, 0.16); A.cyl(gx, gy, 0.2, 0, 1.5, stoneOf()); A.c.beginPath(); A.c.ellipse(wx, wy - 0.5, rx, ry, 0, 0, Math.PI * 2); A.c.fillStyle = A.GLOW ? '#c8ffe8' : '#7fd0c8'; A.c.fill(); });
    return S.run();
  });

  // small plots or big: everything is scaled to the slot
  def('shrine', ([x, y, w, d], L, band) => {
    const S = scene(), cx = x + w / 2, cy = y + d / 2, k = Math.min(1.2, Math.min(w, d) / 1.2);
    // a wayshrine: an antlered carved post with a lantern on a mossy stone; a bower and stones as it grows
    if (band >= 2 && w > 1.6) for (let j = 0; j < 5; j++) { const a = j / 5 * Math.PI * 2 + 0.5; S.add(cx + Math.cos(a) * 0.55 * k, cy + Math.sin(a) * 0.5 * k, () => menhir(cx + Math.cos(a) * 0.55 * k, cy + Math.sin(a) * 0.5 * k, 10 + band * 2, 0.7)); }
    if (band >= 1) S.add(cx - 0.3 * k, cy - 0.3 * k, () => A.treeDecid(cx - 0.32 * k, cy - 0.32 * k, 0.75 + band * 0.1, true));
    S.add(cx, cy, () => {
      A.rock(cx, cy + 0.05, 0.6 * k, '#8a8a7a');
      if (!A.SNOW) { const [mx, my] = A.P(cx - 0.05, cy + 0.05); A.circ(mx - 2, my - 3, 2, MOSS); }
      const ph = 14 + band * 4, [px, py] = A.P(cx, cy, 3);
      A.poly([[px - 1.6, py], [px + 1.6, py], [px + 1.4, py - ph], [px - 1.4, py - ph]], era() >= 2 ? MOON : '#8a6a44');
      if (!A.GLOW) for (let v = 4; v < ph - 2; v += 4) A.line([px - 1.4, py - v], [px + 1.4, py - v + 1.5], A.shade('#8a6a44', -0.3), 0.5);
      // antlers
      const tp = [px, py - ph]; for (const s of [-1, 1]) { curve(tp, [tp[0] + s * 5, tp[1] - 1], [tp[0] + s * 6, tp[1] - 8], '#e8d8b0', 1.1); A.line([tp[0] + s * 4.5, tp[1] - 2], [tp[0] + s * 7.5, tp[1] - 4], '#e8d8b0', 0.8); }
      hang(px + 2.5, py - ph * 0.55, 1.4, 3);
      if (band >= 3) { A.lampDot(tp[0], tp[1] - 3, 1.5, '#9ad8e8', '#d8f8ff'); A.rec('sparks', { x: tp[0], y: tp[1] - 3, kind: 'moon' }); }
      return ph + 12;
    });
    S.add(cx + 0.2 * k, cy + 0.25 * k, () => { const [bx, by] = A.P(cx + 0.22 * k, cy + 0.25 * k); A.c.beginPath(); A.c.ellipse(bx, by - 1, 3, 1.4, 0, 0, Math.PI * 2); A.c.fillStyle = A.F('#9a8a6a'); A.c.fill(); A.circ(bx - 1, by - 2, 1, '#c0392b'); A.circ(bx + 1, by - 2, 1, '#e2b84a'); });
    S.add(cx, cy + 0.3, () => fireflies(cx, cy, 10, 12 + band * 3));
    return S.run();
  });

  def('hideout', ([x, y, w, d], L, band) => {
    const S = scene(), cx = x + w / 2, cy = y + d / 2, k = Math.min(1.2, Math.min(w, d) / 1.2);
    // a ranger's hide: a leaf-thatched blind under a big tree, a rope ladder to a hidden perch
    const tx = cx - 0.15 * k, ty = cy - 0.2 * k, th = 30 + band * 8;
    S.add(tx, ty, () => {
      trunk(tx, ty, 0.11 + band * 0.02, 0, th);
      if (band >= 1) { // the hidden perch with a rope ladder
        const pz = th * 0.62; deck(tx, ty, 0.24, pz, 0.11);
        const p = Gp(tx, ty, Math.PI / 4 + 0.3, 0.2, pz); A.line(p, [p[0], p[1] + pz], '#cdbf98', 0.6); A.line([p[0] + 3, p[1]], [p[0] + 3, p[1] + pz], '#cdbf98', 0.6); for (let v = 3; v < pz; v += 4) A.line([p[0], p[1] + v], [p[0] + 3, p[1] + v], '#cdbf98', 0.6);
        if (band >= 2) { const [ax, ay] = A.P(tx, ty, pz + 2.2); A.person(ax + 2, ay, '#3f5a3a', 0.75); }
      }
      boughs(tx, ty, th, 0.45);
      return crown(tx, ty, th + 10, 0.5 + band * 0.06);
    });
    S.add(cx + 0.2 * k, cy + 0.15 * k, () => { // the blind: a low mound of branches and leaves with a dark slot
      const gx = cx + 0.2 * k, gy = cy + 0.15 * k, [bx, by] = A.P(gx, gy);
      A.c.beginPath(); A.c.ellipse(bx, by, 11 * k, 5 * k, 0, Math.PI, Math.PI * 2); A.c.ellipse(bx, by, 11 * k, 2.4 * k, 0, 0, Math.PI); A.gradFill(bx - 11 * k, bx + 11 * k, A.SNOW ? '#e6eaec' : '#5a7a3e');
      if (!A.GLOW && !A.SNOW) for (let j = 0; j < 6; j++) A.circ(bx - 8 * k + j * 3.2 * k, by - 3 - (j % 2) * 2, 2.2, leaves()[j % 3 === 2 ? 2 : j % 2]);
      A.lamp([[bx - 4, by - 2], [bx + 4, by - 2], [bx + 4, by - 3.5], [bx - 4, by - 3.5]], '#1e1a14', '#ffb050');
      return 10;
    });
    if (band >= 2 && w > 1.6) S.add(x + w * 0.85, y + d * 0.85, () => target(x + w * 0.85, y + d * 0.8, 0.8));
    return S.run();
  });

  // ---------------- the shore: root-woven jetties, living boathouses, swan boats, a lantern-tree lighthouse ----------------
  // everything is placed through the shore ctx (pt/at/depth), so one drawing fits any edge of the plot
  const swanWhite = () => era() >= 2 ? '#f2efe6' : era() >= 1 ? '#e8dcc0' : '#d8c8a0';
  // a swan-prowed hull lying along the shore normal: bow (neck) toward open water at d0, stern at d1
  function swanBoat(sc, u, d0, d1, o = {}) {
    const big = !!o.big, hw = o.hw || (big ? 0.26 : 0.16), hh = big ? 8 : 5, len = d1 - d0;
    const col = o.col || (era() >= 1 ? swanWhite() : BARK);
    const G2 = (dd, du) => sc.pt(dd, u + du);
    // a smooth hull: the bow sweeps up into the neck, a rounded stern
    const nearS = (() => { const p = sc.pt(d0 + len / 2, u + hw), q = sc.pt(d0 + len / 2, u - hw); return p[0] + p[1] > q[0] + q[1] ? 1 : -1; })();
    const gp = (t, sg, z) => A.P(...G2(d0 + len * t, sg * hw), z);
    const bt = A.P(...G2(d0, 0), hh + 2.5), sp = A.P(...G2(d1, 0), hh + 2);
    A.c.beginPath(); A.c.moveTo(bt[0], bt[1]); A.c.bezierCurveTo(...gp(0.25, -nearS, hh + 1), ...gp(0.9, -nearS, hh + 1), sp[0], sp[1]); A.c.bezierCurveTo(...gp(0.9, nearS, hh), ...gp(0.25, nearS, hh), bt[0], bt[1]); A.c.closePath();
    A.c.fillStyle = A.F(era() >= 1 ? A.shade(WOOD, -0.05) : A.shade(col, -0.2)); A.c.fill(); stroke(snowy(col), 1.6); stroke(A.OUT, 0.4);
    if (!A.GLOW) for (const t of [0.4, 0.65]) A.line(gp(t, -1, hh + 1), gp(t, 1, hh), WOOD_D, 0.8);
    A.c.beginPath(); A.c.moveTo(bt[0], bt[1]); A.c.bezierCurveTo(...gp(0.2, nearS * 1.1, hh - 0.5), ...gp(0.9, nearS * 1.15, hh - 0.5), sp[0], sp[1]); A.c.bezierCurveTo(...gp(0.85, nearS * 0.6, -2.5), ...gp(0.25, nearS * 0.5, -2.5), bt[0], bt[1]); A.c.closePath();
    A.c.fillStyle = A.F(snowy(col)); A.c.fill(); stroke(A.OUT, 0.7);
    // folded wings: feather strokes along the near side
    if (!A.GLOW) for (let k = 1; k <= (big ? 4 : 2); k++) { const t = 0.3 + k * 0.13, p = gp(t, nearS * 0.95, hh - 1.5); A.line(p, [p[0] + 3, p[1] - 1.2], A.shade(col, -0.3), 0.6); }
    if (era() >= 3) { A.c.beginPath(); A.c.moveTo(...gp(0.15, nearS, hh)); A.c.bezierCurveTo(...gp(0.35, nearS * 1.1, hh - 0.7), ...gp(0.75, nearS * 1.1, hh - 0.7), ...gp(0.95, nearS * 0.8, hh + 1)); stroke(GOLD, 0.8); }
    // the swan neck rising from the bow, head turned forward
    const b0 = A.P(...G2(d0, 0), hh + 2.5), st = A.P(...G2(d1, 0), hh + 2), dx = b0[0] - st[0], dy = b0[1] - st[1], dl = Math.hypot(dx, dy) || 1, fx = dx / dl, fy = dy / dl;
    const nh = big ? 15 : 10, head = [b0[0] - fx * 2, b0[1] - nh];
    curve(b0, [b0[0] + fx * 5, b0[1] - nh * 0.45], head, swanWhite(), big ? 2.6 : 2);
    A.circ(head[0], head[1], big ? 1.8 : 1.4, swanWhite());
    A.poly([[head[0] + fx * 1, head[1] - 0.6], [head[0] + fx * 4.2, head[1] + 0.8], [head[0] + fx * 1, head[1] + 0.8]], era() >= 3 ? GOLD : '#e07a2a', null);
    if (!A.GLOW) A.circ(head[0] + fx * 0.4, head[1] - 0.6, 0.45, '#1a1410');
    // tail feathers raised at the stern
    A.poly([[st[0], st[1]], [st[0] - fx * 3, st[1] - (big ? 7 : 5)], [st[0] - fx * 1, st[1] - 2]], A.shade(swanWhite(), -0.08));
    // a leaf sail on a slim mast (raised) or furled
    if (o.mast) {
      const m = d0 + len * 0.5, mb = A.P(...G2(m, 0), hh), mh = big ? 30 : 18, mt = [mb[0], mb[1] - mh];
      A.line(mb, mt, WOOD_D, big ? 1.4 : 1);
      if (o.sail) {
        const sc2 = A.GLOW ? A.F('#d8ecc8') : (era() >= 3 ? '#eef4e0' : '#cfe4b8'), w2 = big ? 9 : 6;
        A.c.beginPath(); A.c.moveTo(mt[0], mt[1] + 1); A.c.quadraticCurveTo(mt[0] + w2 * 1.6, mt[1] + mh * 0.35, mt[0] + 0.5, mb[1] - 4); A.c.quadraticCurveTo(mt[0] - w2 * 0.4, mt[1] + mh * 0.4, mt[0], mt[1] + 1); A.c.fillStyle = sc2; A.c.fill(); stroke(A.OUT, 0.6);
        if (!A.GLOW) curve([mt[0], mt[1] + 2], [mt[0] + w2 * 0.8, mt[1] + mh * 0.35], [mt[0] + 0.5, mb[1] - 5], '#8aa86a', 0.6);
      } else A.line([mt[0] - 4, mt[1] + 4], [mt[0] + 4, mt[1] + 2], '#e8e0c8', 2);
      A.rec('flags', { x: mt[0], y: mt[1] + 1, col: A.STY.flag, len: big ? 9 : 6, seed: A.R() });
    }
    if (o.lamp) { const p = A.P(...G2(d1 - 0.05, 0), hh + 9); A.line([p[0], p[1] + 9], [p[0], p[1]], WOOD_D, 0.8); hang(p[0] + 2, p[1] + 4, 1.2, 3); }
    return hh + (o.mast ? (big ? 30 : 18) : nh);
  }
  // a jetty of living roots: deck strands woven lengthwise, root arches plunging into the water
  function rootJetty(sc, u, band, extra = 0) {
    const dd0 = sc.depth(u), e0 = dd0 + 0.4, out = Math.max(0.5, dd0 - 2.4 - extra), hw = 0.24, z0 = 2;
    const at = (dd, du, z) => sc.at(dd, u + du, z);
    for (let dd = out + 0.12; dd < dd0 - 0.1; dd += 0.5) for (const s of [-1, 1]) curve(at(dd, s * hw, z0), at(dd + 0.08, s * (hw + 0.22), z0 - 1), at(dd + 0.3, s * (hw + 0.12), -3), s > 0 ? BARK_D : BARK, 1.6);
    const st = era() >= 2 ? MOON : null, deckCol = era() >= 3 ? '#b89670' : WOOD;
    if (st) { const [hx, hy] = sc.pt(out + 0.18, u); A.cyl(hx, hy, 0.22, -2, z0 + 0.5, st, A.shade(st, 0.08)); }
    A.poly([at(e0, -hw, z0), at(e0, hw, z0), at(out, hw, z0), at(out, -hw, z0)], A.SNOW ? A.mix(deckCol, '#f2f6f8', 0.6) : deckCol);
    if (!A.GLOW) for (const f of [-0.66, -0.22, 0.22, 0.66]) { A.c.beginPath(); for (let dd = out; dd <= e0 + 0.001; dd += 0.1) { const p = at(dd, hw * f + 0.035 * Math.sin(dd * 11 + f * 5), z0); dd === out ? A.c.moveTo(p[0], p[1]) : A.c.lineTo(p[0], p[1]); } stroke(A.shade(deckCol, -0.28), 0.5); }
    A.line(at(out, -hw, z0), at(out, hw, z0), A.shade(deckCol, -0.4), 1);
    // a twisted root rail along the jetty from the first growth band
    if (band >= 1) for (const s of [-1, 1]) { const pts = []; for (let dd = out + 0.1; dd <= dd0 + 0.1; dd += 0.2) pts.push(at(dd, s * hw * 0.95, z0 + 4 + Math.sin(dd * 6) * 0.8)); A.c.beginPath(); pts.forEach((p, k) => k ? A.c.lineTo(p[0], p[1]) : A.c.moveTo(p[0], p[1])); stroke(BARK_D, 0.9); for (let k = 0; k < pts.length; k += 3) { const q = pts[k]; A.line(q, [q[0], q[1] + 4], BARK_D, 0.7); } }
    return out;
  }
  // a curled lantern post on the jetty head
  function jettyLamp(sc, dd, u, h = 13) {
    const b = sc.at(dd, u, 2), t = [b[0], b[1] - h];
    A.line(b, t, WOOD_D, 1.2); curve(t, [t[0] + 1, t[1] - 4], [t[0] + 5, t[1] - 2], WOOD_D, 1);
    hang(t[0] + 5, t[1] + 3, 1.4, 4);
    return h + 2;
  }
  // a living boathouse: a leaf-roofed shed on root stilts at the water's edge, a sapling grown through its roof
  function boathouse(sc, u, s = 1) {
    const dd0 = sc.depth(u), a = sc.pt(dd0 - 0.7 * s, u - 0.32 * s), b = sc.pt(dd0 + 0.35, u + 0.32 * s);
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), d = Math.abs(a[1] - b[1]);
    for (const [px, py] of [[x, y + d], [x + w, y + d], [x + w, y], [x + w / 2, y + d], [x + w, y + d / 2]]) A.line(A.P(px, py, -2), A.P(px, py, 4), BARK_D, 1.6);
    const bx = A.box(x, y, w, d, 3, 9 * s, bark(), { right: A.shade(bark(), -0.25) });
    if (!A.GLOW) for (const side of ['L', 'R']) { const f = side === 'L' ? A.onL : A.onR, Lf = side === 'L' ? w : d; for (let k = 1; k < Math.round(Lf / 0.12); k++) { const q = f(bx, Lf * k / Math.round(Lf / 0.12), Lf * k / Math.round(Lf / 0.12), 0.5, 9 * s - 0.5); A.line(q[0], q[3], A.shade(bark(), -0.3), 0.4); } }
    // a round lit window on each face
    for (const side of ['L', 'R']) { const f = side === 'L' ? A.onL : A.onR, Lf = side === 'L' ? w : d, q = f(bx, Lf * 0.5, Lf * 0.5, 5 * s, 5 * s)[0]; A.circ(q[0], q[1], 2.2, A.STY.trim); A.lampDot(q[0], q[1], 1.5, '#3a4a40', '#ffd27a'); }
    const zt = A.gable(bx, 10 * s, snowy(roofOf()), sc.along ? 'y' : 'x', 'thatch', 0.12);
    const [tx, ty] = [x + w * 0.85, y + d * 0.85];
    trunk(tx, ty, 0.06, 3, 9 * s + 10, { noRoots: true });
    crown(tx, ty, 9 * s + 18, 0.26);
    return zt + 8;
  }
  // a bent "hoist tree": a living tree trained over the water, its bough a crane with a net of cargo
  function hoistTree(sc, u, band) {
    const cdd = sc.depth(u) + 0.6, [gx, gy] = sc.pt(cdd, u), H = 24 + band * 4;
    trunk(gx, gy, 0.11, 0, H);
    const top = A.P(gx, gy, H), tip = sc.at(Math.max(0.6, cdd - 1.6), u, H + 4);
    curve(top, [(top[0] + tip[0]) / 2, Math.min(top[1], tip[1]) - 8], tip, bark(), 2.4);
    const hook = sc.at(Math.max(0.6, cdd - 1.6), u, 12);
    A.line(tip, hook, '#cdbf98', 0.6);
    seedPod(hook[0], hook[1], 0.9);
    crown(gx, gy, H + 8, 0.36);
    return H + 18;
  }
  function coastHarbor(slot, L, band, sc) {
    if (!L) return undefined;
    const S = scene(), us = sc.piers.slice(), u0 = sc.u0;
    // the quay along the shoreline: woven roots, then moon-white stone
    const qa = us[0] - 0.35, qb = us[us.length - 1] + 0.35, qc = era() >= 2 ? MOON : era() >= 1 ? '#9a7a52' : WICKER;
    for (let u = qa; u < qb - 0.01; u += 0.25) { const u1 = Math.min(qb, u + 0.25); A.poly([sc.at(sc.depth(u) - 0.15, u, 2), sc.at(sc.depth(u1) - 0.15, u1, 2), sc.at(sc.depth(u1) + 0.35, u1, 2), sc.at(sc.depth(u) + 0.35, u, 2)], snowy(qc), null); }
    A.line(sc.at(sc.depth(qa) - 0.15, qa, 2), sc.at(sc.depth(qb) - 0.15, qb, 2), A.shade(qc, -0.4), 0.9);
    if (era() >= 2 && !A.GLOW) for (let u = qa + 0.3; u < qb; u += 0.5) A.line(sc.at(sc.depth(u) - 0.15, u, 2), sc.at(sc.depth(u) + 0.35, u, 2), A.shade(qc, -0.16), 0.5);
    const outs = us.map((u, i) => [u, rootJetty(sc, u, band, i === us.indexOf(u0) && band >= 2 ? 0.3 : 0)]);
    outs.forEach(([u, out], i) => {
      const dd0 = sc.depth(u), len = dd0 - out, side = i % 2 ? -0.5 : 0.5;
      S.add(...sc.pt(out + 0.05, u + 0.18), () => jettyLamp(sc, out + 0.1, u + 0.18, 12 + band));
      if (band >= 2 && u === u0 && len > 1.6) S.add(...sc.pt(out + 0.6, u - 0.55), () => swanBoat(sc, u - 0.58, out + 0.05, out + Math.min(2.3, len - 0.05), { big: true, mast: true, sail: band >= 3, lamp: era() >= 1 }));
      else if (len > 0.9) S.add(...sc.pt(out + 0.4, u + side), () => swanBoat(sc, u + side, out + 0.1, out + Math.min(1.1, len * 0.6), { mast: band >= 1 && i % 2 === 0, sail: band >= 1 && L >= 8 && i % 2 === 0 }));
    });
    // moored at the quay: a little swan skiff drawn up on the shore
    if (L >= 3) { const u = qa - 0.35, dd = sc.depth(u) - 0.3; if (u > sc.a + 0.4) S.add(...sc.pt(dd, u), () => swanBoat(sc, u, dd - 0.6, dd + 0.15, {})); }
    if (L >= 5) { const cu = u0 + 0.62; S.add(...sc.pt(sc.depth(cu) + 0.6, cu), () => hoistTree(sc, cu, band)); }
    if (L >= 8) { const bu = us[0] - 0.55 > sc.a + 0.5 ? us[0] - 0.55 : us[us.length - 1] + 0.55; S.add(...sc.pt(sc.depth(bu) - 0.2, bu), () => boathouse(sc, bu, 1)); }
    if (L >= 15) { const bu = us[us.length - 1] + 0.55; if (bu < sc.b - 0.5) S.add(...sc.pt(sc.depth(bu) - 0.2, bu), () => boathouse(sc, bu, 1.15)); }
    // a leaf banner at the root of the main jetty and fireflies over the water at night
    S.add(...sc.pt(sc.depth(u0) + 0.55, u0 - 0.38), () => leafBanner(...sc.pt(sc.depth(u0) + 0.55, u0 - 0.38), 20 + band * 3));
    if (band >= 1) { const [fx, fy] = sc.pt(sc.depth(u0) - 1, u0); fireflies(fx, fy, 10, 24); }
    const top = S.run();
    return { top: Math.max(top, 24), noDress: true };
  }

  // a tower grown from one great trunk: footing, a deck at the wall walk, a spire (or a leafy crown) on top
  function treeTower(gx, gy, r, H, o = {}) {
    let z = 0;
    if (o.st) { A.cyl(gx, gy, r * 1.4, 0, o.base + 2, o.st, A.shade(o.st, 0.08)); if (!A.GLOW) { const [x, y, rx, ry] = A.ell(gx, gy, o.base * 0.5 + 1, r * 1.4); A.c.beginPath(); A.c.ellipse(x, y, rx, ry, 0, 0.15, Math.PI - 0.15); stroke(A.shade(o.st, -0.2), 0.6); } z = o.base + 2; }
    const dz = o.deckZ;
    if (o.stair) stair(gx, gy, r, z + 2, dz, Math.max(0.8, (dz - z) / 26), 'back');
    trunk(gx, gy, r, z, dz - z, { civic: true, noRoots: z > 0 });
    if (o.stair) stair(gx, gy, r, z + 2, dz, Math.max(0.8, (dz - z) / 26), 'front');
    deck(gx, gy, r + 0.18, dz, r); rail(gx, gy, r + 0.18, dz + 2.2, false);
    const r2 = r * 0.86, z2 = dz + 2.2;
    trunk(gx, gy, r2, z2, H - z2, { civic: true, noRoots: true });
    if (H - z2 > 12) { roundWin(gx, gy, r2, z2 + (H - z2) * 0.5, 0.15); roundWin(gx, gy, r2, z2 + (H - z2) * 0.5, 1.35); }
    rail(gx, gy, r + 0.18, dz + 2.2, true);
    { const [lx, ly] = Gp(gx, gy, 0.75, r + 0.18, dz); hang(lx, ly + 7, 1.4); }
    if (era() >= 1 && !A.GLOW) { const [x, y, rx, ry] = A.ell(gx, gy, H - 2, r2); A.c.beginPath(); A.c.ellipse(x, y, rx, ry, 0, 0.1, Math.PI - 0.1); stroke(era() >= 3 ? GOLD : '#c9a874', 1); }
    let zt;
    if (o.crown) { boughs(gx, gy, H, 0.4); zt = crown(gx, gy, H + 6, o.crown); }
    else {
      // a leafy collar under the spire
      const lc = leaves(); for (let k = 0; k < 7; k++) { const t = -Math.PI * 0.15 + k / 6 * Math.PI * 1.1, [x, y] = Gp(gx, gy, t, r2 * 1.25, H + 1); A.circ(x, y, 2.6, lc[k % 2], A.OUT); }
      zt = spireRoof(gx, gy, r * 1.35, H, o.rh || 18);
    }
    if (o.flag) { leafBanner(gx, gy, 12, zt - 3); zt += 12; }
    if (o.ff) fireflies(gx, gy, H, 16);
    return zt;
  }
  // wall measures matching def('wall') below
  function wallDims(band) {
    const fort = T('fortification'), st = band >= 3 && stoneOf() ? stoneOf() : band >= 2 && stoneOf() === MOON ? MOON : null;
    const base = st ? 5 + band : band >= 2 ? 3 : 0, H = 14 + band * 3 + (fort ? 3 : 0);
    return { st, base, H, top: base + H, fort };
  }
  def('walltower', (slot, L, band, ctx) => {
    const gx = ctx.gx, gy = ctx.gy, corner = !!ctx.corner, W = wallDims(band);
    if (band <= 1) { // a watch-tree: one trunk, a deck at the wall walk, a leafy crown
      const top = treeTower(gx, gy, 0.2, W.top + 14, { deckZ: W.top + 1, crown: 0.4, st: null });
      return { top, noDress: true };
    }
    const r = corner ? 0.29 + (band - 2) * 0.03 : 0.24;
    const H = W.top + (corner ? 18 : 13) + (band - 2) * 6;
    const top = treeTower(gx, gy, r, H, { deckZ: W.top + 1, st: W.st, base: W.base, stair: band >= 3 && corner, rh: 16 + band * 3 + (corner ? 4 : 0), flag: corner && band >= 3, ff: band >= 3 });
    return { top, noDress: true };
  });
  // gates: bent-sapling arch → two living trunks knitting their boughs overhead → a gatehouse of two tree-towers and a bridge-hall
  function sylGate(ctx, band, wide) {
    const { along, fixed, g0, g1 } = ctx, W = wallDims(band), m = (g0 + g1) / 2;
    const pt = u => along ? [u, fixed] : [fixed, u];
    const at = (u, z = 0) => A.P(...pt(u), z);
    if (band === 0) {
      const h = wide ? 24 : 18;
      for (const u of [g0, g1]) { curve(at(u), at(u, h * 0.95), at(m, h), BARK, wide ? 2.8 : 2.2); curve(at(u + (u < m ? 0.05 : -0.05)), at(u, h * 0.8), at(m, h - 2), BARK_D, 1); }
      const lc = leaves(), [tx, ty] = at(m, h); A.circ(tx - 3, ty, 3.2, lc[0], A.OUT); A.circ(tx + 2, ty - 1, 3, lc[1], A.OUT); A.circ(tx, ty - 3, 2.4, lc[2]);
      if (A.SEASON === 0 && !A.SNOW) A.circ(tx + 1, ty - 2, 1, '#f7c6d6');
      hang(tx, ty + 6, 1.4, 4);
      return h + 6;
    }
    if (band === 1 || !wide) {
      const r = wide ? 0.15 : 0.11, h = W.top + (wide ? 8 : 4);
      if (W.st && !wide) { A.cyl(...pt(g0 - r), r * 1.4, 0, W.base, W.st); }
      trunk(...pt(g0 - r * 0.8), r, 0, h, { civic: true });
      // boughs knitting into a leafy arch
      const a = at(g0 - r * 0.4, h - 3), b = at(g1 + r * 0.4, h - 3), apex = at(m, h + (wide ? 12 : 8));
      curve(a, [apex[0] - 6, apex[1] - 4], apex, bark(true), 3.4); curve(b, [apex[0] + 6, apex[1] - 4], apex, bark(true), 3.4);
      curve(at(g0 - r * 0.4, h - 7), [apex[0] - 3, apex[1] + 2], [apex[0], apex[1] + 4], BARK_D, 1.2); curve(at(g1 + r * 0.4, h - 7), [apex[0] + 3, apex[1] + 2], [apex[0], apex[1] + 4], BARK_D, 1.2);
      const lc = leaves();
      for (let k = 0; k <= 6; k++) { const t = k / 6, p = t < 0.5 ? [a[0] + (apex[0] - a[0]) * t * 2, a[1] + (apex[1] - a[1]) * Math.sqrt(t * 2) - 2] : [apex[0] + (b[0] - apex[0]) * (t - 0.5) * 2, apex[1] + (b[1] - apex[1]) * Math.pow((t - 0.5) * 2, 2) - 2]; A.circ(p[0], p[1] - 2, 3.4 - Math.abs(t - 0.5) * 1.5, lc[k % 2], A.OUT); if (A.SNOW) A.circ(p[0] - 0.6, p[1] - 3.6, 1.8, '#f2f6f8'); }
      if (era() >= 2 && wide) { const [rx, ry] = apex; A.lampDot(rx, ry + 2, 1.6, '#9ad8e8', '#d8f8ff'); }
      if (W.st && !wide) { A.cyl(...pt(g1 + r), r * 1.4, 0, W.base, W.st); }
      trunk(...pt(g1 + r * 0.8), r, 0, h, { civic: true });
      hang(apex[0], apex[1] + 9, 1.6, 5);
      // the two trunks crown into the arch
      for (const u of [g0 - r * 0.8, g1 + r * 0.8]) { boughs(...pt(u), h, 0.25); crown(...pt(u), h + 4, wide ? 0.3 : 0.22); }
      if (wide && band >= 1) { leafBanner(...pt(g1 + r * 0.8), 12, h + 6); }
      return h + 20;
    }
    // the gatehouse
    const r = 0.25 + (band - 2) * 0.03, H = W.top + 18 + (band - 2) * 6, zb = W.top - 3, bh = 10;
    const t0 = treeTower(...pt(g0 - 0.28), r, H, { deckZ: W.top + 1, st: W.st, base: W.base, rh: 16 + band * 3, ff: band >= 3 });
    // the bridge-hall over the road: bark walls under a leaf roof, lit round windows, a moon-white arch below in the Empire
    const bx = along ? A.box(g0 - 0.05, fixed - 0.22, g1 - g0 + 0.1, 0.44, zb, bh, bark(true)) : A.box(fixed - 0.22, g0 - 0.05, 0.44, g1 - g0 + 0.1, zb, bh, bark(true));
    const f = along ? A.onL : A.onR, Lf = g1 - g0 + 0.1;
    for (const k of [0.25, 0.5, 0.75]) { const q = f(bx, Lf * k, Lf * k, bh * 0.55, bh * 0.55)[0]; A.circ(q[0], q[1], 2.2, A.STY.trim); A.lampDot(q[0], q[1], 1.5, '#3a4a40', '#ffd27a'); }
    if (W.st || era() >= 2) { const st = W.st || MOON, q0 = f(bx, 0, 0, 0, 0)[0], q1 = f(bx, Lf, Lf, 0, 0)[0], mm = [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2]; A.c.beginPath(); A.c.moveTo(q0[0], q0[1]); A.c.quadraticCurveTo(mm[0], mm[1] - 12, q1[0], q1[1]); stroke(st, 2.2); }
    const zr = A.gable(bx, 9, snowy(roofOf()), along ? 'x' : 'y', 'thatch', 0.1);
    { const q = f(bx, Lf * 0.5, Lf * 0.5, 0, 0)[0]; hang(q[0], q[1] + 5, 1.6, 4); }
    if (band >= 3) { const [px, py] = at(m, zr); void px; void py; leafBanner(...pt(m), 14, zr - 2); }
    const t1 = treeTower(...pt(g1 + 0.28), r, H, { deckZ: W.top + 1, st: W.st, base: W.base, rh: 16 + band * 3, flag: band >= 3 });
    return Math.max(t0, t1, zr + 14);
  }
  def('gate', (slot, L, band, ctx) => ({ top: sylGate(ctx, band, true), noDress: true }));
  def('postern', (slot, L, band, ctx) => ({ top: sylGate(ctx, band, false), noDress: true }));
  // the lighthouse: a great tree on a rocky islet, a spiral stair to a cage of boughs round a lantern, a leaf spire over it
  def('lighthouse', ([x, y, w, d], L, band) => {
    const gx = x + w / 2, gy = y + d / 2;
    A.rock(gx - 0.1, gy + 0.15, 1.3, '#8c8a7c'); A.rock(gx + 0.3, gy - 0.2, 0.9, '#9c9a8a');
    const st = stoneOf(); let z = 0;
    if (st) { A.cyl(gx, gy, 0.34, 0, 5, st, A.shade(st, 0.08)); z = 5; }
    const r = 0.19, H = 48 + band * 8, dz = H * 0.5;
    stair(gx, gy, r, z + 2, H - 6, 2, 'back');
    trunk(gx, gy, r, z, dz - z, { civic: true, noRoots: z > 0 });
    deck(gx, gy, 0.36, dz, r); rail(gx, gy, 0.36, dz + 2.2, false);
    trunk(gx, gy, r * 0.85, dz + 2.2, H - dz - 2.2, { civic: true, noRoots: true });
    rail(gx, gy, 0.36, dz + 2.2, true);
    stair(gx, gy, r, z + 2, H - 6, 2, 'front');
    roundWin(gx, gy, r * 0.85, H - 10, 0.3);
    // the lantern deck and its cage of boughs
    deck(gx, gy, 0.3, H, r * 0.85);
    const zl = H + 2.2, ch = 15 + band * 2, cr = 0.22;
    const ribs = [0, 1, 2, 3, 4, 5, 6, 7].map(k => k / 8 * Math.PI * 2 + 0.2);
    for (const t of ribs) if (!front(t)) curve(Gp(gx, gy, t, cr, zl), Gp(gx, gy, t, cr * 1.5, zl + ch * 0.55), A.P(gx, gy, zl + ch), bark(true), 1.3);
    const [lx, ly] = A.P(gx, gy, zl + ch * 0.45);
    A.c.beginPath(); A.c.ellipse(lx, ly, 6, 7, 0, 0, Math.PI * 2); A.c.fillStyle = A.GLOW ? 'rgba(255,230,140,0.9)' : 'rgba(255,226,140,0.45)'; A.c.fill();
    A.lampDot(lx, ly, 3.4, lampCol(), '#fff2b8');
    for (const t of ribs) if (front(t)) curve(Gp(gx, gy, t, cr, zl), Gp(gx, gy, t, cr * 1.5, zl + ch * 0.55), A.P(gx, gy, zl + ch), bark(true), 1.3);
    rail(gx, gy, 0.3, zl, true);
    A.rec('beams', { x: lx, y: ly });
    A.rec('lights', { x: lx, y: ly, r: 40 });
    const zt = spireRoof(gx, gy, 0.3, zl + ch - 2, 14 + band * 2);
    // leaves trailing from the deck, fireflies about the light
    const lc = leaves(); for (let k = 0; k < 5; k++) { const [px, py] = Gp(gx, gy, 0.2 + k * 0.5, 0.3, H); A.circ(px, py + 2, 2.2, lc[k % 2], A.OUT); }
    fireflies(gx, gy, H, 22);
    if (band >= 3) leafBanner(gx, gy, 10, zt - 2);
    return { top: zt + (band >= 3 ? 10 : 0), noDress: true };
  });

  def('harbor', ([x, y, w, d], L, band, ctx) => {
    if (ctx && ctx.coastal) return coastHarbor([x, y, w, d], L, band, ctx);
    const S = scene(), cx = x + w / 2, cy = y + d / 2;
    // a lily pond with a swan-prowed boat at a root jetty
    S.add(cx - 0.3, cy - 0.3, () => { const [px, py, rx, ry] = A.ell(cx, cy, 0, Math.min(w, d) * 0.4); A.c.beginPath(); A.c.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); A.c.fillStyle = A.F(A.SEASON === 3 ? '#cfe2ee' : '#4f8fb8'); A.c.fill(); stroke('#6a8a5a', 1.2); if (!A.SNOW) for (let k = 0; k < 4; k++) A.circ(px - rx * 0.5 + k * rx * 0.33, py + Math.sin(k * 2) * ry * 0.5, 1.8, '#5e9447'); });
    S.add(cx, cy, () => { const a = A.P(cx - 0.4, cy + 0.1, 3), b = A.P(cx + 0.1, cy + 0.1, 3); A.line(a, b, WOOD, 3); const [bx, by] = A.P(cx + 0.15, cy - 0.2); A.c.beginPath(); A.c.moveTo(bx - 8, by - 2); A.c.quadraticCurveTo(bx, by + 4, bx + 8, by - 2); A.c.closePath(); A.c.fillStyle = A.F('#e8e2d0'); A.c.fill(); stroke(A.OUT, 0.6); curve([bx + 7, by - 2], [bx + 11, by - 8], [bx + 8, by - 10], '#e8e2d0', 1.6); return 12; });
    if (band >= 1) S.add(cx + 0.4, cy + 0.4, () => trunkHall(x + w * 0.82, y + d * 0.2, 0.22, 11 + band * 2, { rh: 15 }));
    return S.run();
  });

  def('generic', ([x, y, w, d], L, band) => trunkHall(x + w / 2, y + d / 2, Math.min(0.42, Math.min(w, d) * 0.3), 13 + band * 2, { rh: 20 }));

  // the wall: thorn hedge → living palisade of close-grown trunks → trunks on a moon-white wall walk
  def('wall', ([fx, fy, fw, fd], L, band, ctx) => {
    const along = ctx.along, a = ctx.a, b = ctx.b, len = b - a, mid = along ? fy + fd / 2 : fx + fd / 2;
    const midc = along ? fy + fd / 2 : fx + fw / 2;
    const at = (u, z = 0) => along ? A.P(u, midc, z) : A.P(midc, u, z);
    const fort = T('fortification');
    void mid;
    if (band === 0) { // thorn hedge woven with briar roses
      A.box(fx, fy, fw, fd, 0, 9 + (fort ? 2 : 0), '#4a6e38');
      const n = Math.max(1, Math.round(len / 0.26));
      for (let k = 0; k < n; k++) { const u = a + (k + 0.5) * len / n, [hx, hy] = at(u, 10); A.circ(hx, hy, 3.4, A.SNOW ? '#eef3f5' : A.SEASON === 2 ? '#a86a2a' : '#557f40', A.OUT); if (!A.GLOW && !A.SNOW) { A.line([hx - 3, hy + 1], [hx - 5, hy - 2], '#2e3a22', 0.6); if (k % 3 === 0 && A.SEASON < 2) A.circ(hx + 1, hy - 1, 1.1, '#e85a7a'); } }
      return 12;
    }
    const st = band >= 3 && stoneOf() ? stoneOf() : band >= 2 && stoneOf() === MOON ? MOON : null;
    let base = 0;
    if (st) { const bw = A.box(fx, fy, fw, fd, 0, 5 + band, st); A.courses(bw, 3, A.shade(st, -0.12)); base = 5 + band; }
    else if (band >= 2) { A.box(fx, fy, fw, fd, 0, 3, '#6a5a3a'); base = 3; }
    // close-planted trunks
    const H = 14 + band * 3 + (fort ? 3 : 0), n = Math.max(1, Math.round(len / 0.22));
    for (let k = 0; k < n; k++) {
      const u = a + (k + 0.5) * len / n, [bx, by] = at(u, base), [tx, ty] = at(u, base + H - (k % 3) * 1.5);
      A.poly([[bx - 2.6, by], [bx + 2.6, by], [tx + 2.2, ty], [tx - 2.2, ty]], k % 2 ? bark() : A.shade(bark(), -0.08), A.OUT, 0.5);
      if (fort && k % 2 === 0) A.line([tx, ty], [tx + 1, ty - 5], BARK_D, 1);
    }
    // a woven wall-walk rail on the inner face
    if (band >= 2) A.line(at(a, base + H * 0.6), at(b, base + H * 0.6), WOOD_D, 1.2);
    // leafy crowns along the top
    const m = Math.max(1, Math.round(len / 0.45));
    for (let k = 0; k < m; k++) { const u = a + (k + 0.5) * len / m, [cx2, cy2] = at(u, base + H + 3); const lc = leaves(); A.circ(cx2, cy2, 4.2, lc[0], A.OUT); A.circ(cx2 - 1, cy2 - 1, 3.2, lc[1]); if (A.SNOW) A.circ(cx2 - 1, cy2 - 2.5, 2.2, '#f2f6f8'); }
    if (band >= 2 && Math.round(a * 2) % 3 === 0) { const [lx, ly] = at(a + len / 2, base + H * 0.7); hang(lx + 3, ly + 3, 1.3); }
    if (band >= 3 && era() >= 3 && st) { const [rx, ry] = at(a + len / 2, base * 0.5); A.lampDot(rx, ry, 1.2, '#9ad8e8', '#d8f8ff'); }
    return base + H + 8;
  });
})();

// cityview opt-outs (the return-object format in js/cityart.js): stock extras this people's art already draws itself.
// Wraps the return value only — the drawings above are untouched.
(() => {
  if (typeof CITYART === 'undefined' || !CITYART.sylvan) return;
  const R = CITYART.sylvan, O = {
    smelter: { noTech: ['metallurgy', 'bellows'] },   // the burnt oak is its own chimney
    farm: { noTech: ['granaries'] },
    market: { noDress: true },
    theatre: { noFinial: true },   // a ring of small trees: no centre to gild
    temple: ([x, y, w, d]) => ({ finial: [x + w * 0.1, y + d * 0.1] }),   // the shrine tree stands in the back corner
    // the central great tree (and its decks) is the hall
    townhall: ([x, y, w, d], top) => ({ hit: [[x, y, w, d, Math.min(top, 34)], [x + w / 2 - 0.75, y + d / 2 - 0.75, 1.5, 1.5, top]] }),
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
