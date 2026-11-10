// =====================================================================
//  CITYART — per-people building art for the isometric city view.
//  CONTRACT shared by js/cityview.js (which calls it) and js/cityart-<race>.js (which fill it).
//
//  CITYART[race][buildingType] = (api, slot, L, band, ctx) => topZ
//    race:  hearth | delver | sylvan | ash | tide | veil | grave | wind
//    buildingType: townhall, houses, cottage (one house of the houses district), farm, lumber, quarry, mine,
//           warehouse, market, barracks, stable, warpit, workshop, smelter, smithy, armory, academy, tavern,
//           theatre, temple, wall, harbor, magetower, hideout, shrine, and the people's own unique building
//           (bakery, runeforge, heartgrove, pearlbeds, dreamspire, ossuary, aerie, …) — anything BLD draws.
//    slot:  [gx, gy, w, d] in tiles (cottage: [gx, gy, size, size] or as cityview passes it)
//    L:     building level 1..20+; band = 0..3 growth band (1-4, 5-9, 10-14, 15+)
//    ctx:   { era (0..3 from G.techEra), tech (id => bool), city, season (0..3), snow (bool), night (bool),
//             i (index for repeated pieces), building (bool: being upgraded now), layout, active, activity,
//             coastal (bool) + the per-type extras below }
//           Also: 'walltower', 'gate', 'postern' (wall pieces), 'waterhome' (shore homes over the water, every
//           people on a coast; falls back to the people's 'cottage' raised on pilings), 'lighthouse' (coastal town hall 10+); 'harbor' is also called on a coast.
//    return the top z (height in logical px) for label/hit placement, like BLD functions do.
//    Return undefined/false to fall back to cityview's default drawing.
//    Or return an object to opt out of cityview's extras:
//      { top, noDress: true | ['stock','fence','sign','lamps','finial'], noFinial: true, finial: [gx, gy],
//        noTech: true | ['metallurgy','bellows','guilds','granaries','deepshafts','sawpits'],
//        hit: [[gx, gy, w, d, h], …] }      // hit boxes in grid tiles (+ height px); default = slot up to top,
//                                           // but townhall/magetower/mine keep the stock shaped areas unless hit is given
//      api.techMark(name, gx, gy, {n, h, col}) places a mark yourself: 'chimney' (= 'metallurgy'/'bellows'),
//        'guilds', 'granaries', 'deepshafts', 'sawpits'.
//    Extra ctx per type:
//      wall pieces: side 'N'|'S'|'W'|'E', along (runs along gx), wallLevel, wallBand, fortified;
//        'wall' a, b, thick; 'walltower' corner, gx, gy (side null at a corner); 'gate'/'postern' fixed, g0, g1, wide.
//      shore pieces (ctx.coastal = true; false everywhere else, incl. an inland harbor plot):
//        edge 'N'|'E'|'S'|'W', along, a, b (shore extent), u0 (harbor spot), span, piers [u…],
//        depth(u) (water reach from the edge), pt(dd, u) -> [gx, gy], at(dd, u, z) -> [x, y],
//        sea [dx, dy] (land -> water step), front (water drawn in front of land), lake;
//        'harbor' slot = the harbor works' grid rect (mostly water);
//        'waterhome' slot [gx, gy, .9, .85] + wet, u, dd, dep (cityview adds the boardwalk / rope bridges);
//        'lighthouse' slot [gx-.4, gy-.4, .8, .8] + u, dd; rec('beams', {x, y, col}) for the night sweep
//          (col: '#rrggbb' | 'r,g,b' | warm (default) / green / violet / blue / pearl / sea).
//  api (full list at the top of js/cityview.js) adds techMark(name, gx, gy, o), MAGECOL / magicCol, roofCol,
//    lerp2, boneVault, edgePt/lakeDepth/pier/boat/shipHull, stockHarbor/stockLighthouse/stockWallTower, Veilborn
//    flora (moonLily, silkGrass, briarRose, mirrorStone, mothPost, veilFlora, stoneRing); rec('lights', {col:
//    'storm'}) is stormglass blue; rec('sails', {x, y, r, col, frame}) spins with the building's activity.
//  api: the drawing primitives cityview uses — P(gx,gy,z)->[x,y], box, poly, cyl, cone, dome, line, circ,
//    lamp, lampDot, rec(layer, obj) for animated sparks/lights/smoke/birds, shade(hex, amt), STY (people's
//    colour style), R() seeded random, banner, flagpole, plus the higher-level helpers cityview exposes
//    (see the API comment at the top of js/cityview.js once it is published).
//  Drawing happens back-to-front within the slot: draw parts with smaller gx+gy first.
//
//  WONDERS — CITYART[race]['wonder_<race>'](api, slot, L, band, ctx)   (wonder_hearth, wonder_delver, … wonder_wind)
//    Only a city raising its OWN people's wonder (stage >= 1, or stage 1 queued) shows it; it gets a dedicated
//    great site chosen from the city's layout (cityview pickWonderSite): dry, clear of fields, cemetery, plaza,
//    quarters and main roads, on one plot edge. Every other city reserves nothing (other peoples' wonders stay hidden).
//    slot:  the great site [gx, gy, w, d]: normally 4.5 x 4.5 tiles (4.3 / 4.1 deep when a quarter sits close),
//           never less than 3.5 x 3.5 (outer ring only, cramped coastal / river towns). Read w and d, don't assume.
//           A site of depth >= 4.1 stands astride the town wall: the wall stops at both sides of it (towers at the
//           gap ends), so the wonder itself closes the circuit. The site is paved by cityview; a processional way
//           (paving + lamp pillars from stage 2) runs to the nearest main road.
//    L:     the stage, 1..10 (G.WONDER_STAGES); band = bandOf(L) as for buildings (0..2), mostly ignore it.
//    ctx:   the usual ctx plus  wonder: true, stage: L, stages: 10,
//             building: true while the next stage is being raised (queued and started),
//             site: { edge 'N'|'E'|'S'|'W' (plot edge it backs onto, like shores: N = gx 0 upper-left, E = gy 0
//                     upper-right, S = gx 24 lower-right, W = gy 24 lower-left), wallSide (wall side it breaks, or
//                     null), gap [lo, hi] (the wall opening along that side), way [[gx, gy], [gx, gy]] (from the
//                     site edge to the road, or null), full (true for a full 4.5 x 4.5) }.
//    Draw the wonder PARTLY BUILT below stage 10: the silhouette grows with the stage and is complete and crowned
//    only at 10. It must be the tallest structure in the city from stage 6 (> ~140 px) and about 1.5–2x the town
//    hall at 10 (~180–230 px). Town hall at band 3 is ~65–140 px tall (hearth ~113, ash / delver ~65–75,
//    wind / sylvan / grave ~130–140). The view opens upward (zooms out) automatically so up to ~230 px fits.
//    Return the top z, or { top, hit: [[gx, gy, w, d, h], …] } — give hit boxes per mass (terraces, towers, spire)
//    so the ground behind stays clickable; dress / tech marks are never drawn on a wonder.
//    Stage 0 (only queued) is drawn by cityview for every people: a cut pad, footings, stakes, stone, scaffolds and
//    a crane — the art is NOT called. While ctx.building (any queued stage) cityview adds a scaffold tower at the
//    front corner and two tall cranes over the site after the art; don't draw your own unless you want more.
//    Without art the stock BLD.wonder is used: a stepped monument (one terrace per stage to 5, a spire from 6,
//    gilded crown and beacon at 10). Lights: use lamp / lampDot / win (lit in the night pass) and
//    rec('lights', {x, y, r}) for beacons; api.nightGlass() is the people's lamp colour.
//    Preview: EC_CITYVIEW.wonderSite() returns the site; EC_CITYVIEW.frame the extra headroom in px.
// =====================================================================
'use strict';
const CITYART = {};
for (const r of ['hearth', 'delver', 'sylvan', 'ash', 'tide', 'veil', 'grave', 'wind']) CITYART[r] = {};

// ---------------------------------------------------------------------
//  CITYART.mage — shared bits for the mage towers (and anything else arcane) of every people.
//  All take the api first. Animated records are 'sparks' kinds drawn by cityview's light pass:
//    pulse  {x, y, r, col, sp}            a glow that breathes (runes, cracks, windows)
//    ring   {x, y, rx, ry, col, n, sp}    glyph-motes turning round an ellipse (orreries, rune rings, coils)
//    rise   {x, y, r, h, n, col, sp}      motes drifting up and fading (embers, bubbles, wisps, petals of light)
//    shards {x, y, r, h, n, col, sp}      little crystal shards bobbing and turning round a point
//  col is a hex colour; the helpers turn it into the 'rgba(r,g,b,A)' template cityview's glowDot wants.
// ---------------------------------------------------------------------
CITYART.mage = (() => {
  const rgba = hex => {
    const h = String(hex || '#b48cff').replace('#', ''), f = h.length === 3 ? h.replace(/./g, c => c + c) : h.slice(0, 6), v = parseInt(f, 16) || 0;
    return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},A)`;
  };
  const rec = (A, o) => A.rec('sparks', o);
  return {
    rgba,
    pulse: (A, x, y, r, col, sp = 2) => rec(A, { kind: 'pulse', x, y, r, col: rgba(col), sp, ph: A.R() * 6 }),
    ring: (A, cx, cy, z, r, col, n = 6, sp = 0.6) => { const [x, y, rx, ry] = A.ell(cx, cy, z, r); rec(A, { kind: 'ring', x, y, rx, ry, col: rgba(col), n, sp, ph: A.R() * 6 }); },
    rise: (A, x, y, o = {}) => rec(A, { kind: 'rise', x, y, r: o.r || 8, h: o.h || 40, n: o.n || 6, col: rgba(o.col), sp: o.sp || 0.12, sz: o.sz || 2.6, ph: A.R() }),
    shards: (A, x, y, o = {}) => rec(A, { kind: 'shards', x, y, r: o.r || 10, h: o.h || 6, n: o.n || 4, col: rgba(o.col), sp: o.sp || 0.5, ph: A.R() * 6 }),
    // a polyline that is drawn in its day colour and burns bright in the night-lights pass
    glowLine: (A, pts, day, night, lw = 1) => {
      const c = A.c; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.strokeStyle = A.GLOW ? night : day; c.lineWidth = lw; c.stroke();
    },
    // a spiral band round an upright (front half only), lit in the night pass (twistLines goes dark at night)
    spiral: (A, cx, cy, z0, z1, r, day, night, turns = 1.25, taper = 0.9, ph = 0, lw = 1.4) => {
      const c = A.c; c.beginPath(); let pen = false;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, a = t * Math.PI * 2 * turns + ph, rr = r * (1 - t * taper), [px, py] = A.P(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z0 + (z1 - z0) * t);
        if (Math.cos(a) + Math.sin(a) > 0) { if (pen) c.lineTo(px, py); else c.moveTo(px, py); pen = true; } else pen = false;
      }
      c.strokeStyle = A.GLOW ? night : day; c.lineWidth = lw; c.stroke();
    },
    // a rune circle laid on the ground round (cx, cy): two rings and tick-runes, lit at night
    groundCircle: (A, cx, cy, r, day, night, n = 12, z = 0.3) => {
      const c = A.c, [x, y, rx, ry] = A.ell(cx, cy, z, r);
      c.strokeStyle = A.GLOW ? night : day;
      for (const k of [1, 0.84]) { c.beginPath(); c.ellipse(x, y, rx * k, ry * k, 0, 0, Math.PI * 2); c.lineWidth = k === 1 ? 1.2 : 0.7; c.stroke(); }
      c.beginPath();
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, px = x + Math.cos(a) * rx * 0.92, py = y + Math.sin(a) * ry * 0.92; if (i % 2) { c.moveTo(px - 1.4, py); c.lineTo(px + 1.4, py); } else { c.moveTo(px, py - 1.1); c.lineTo(px + 1.2, py); c.lineTo(px, py + 1.1); } }
      c.lineWidth = 0.8; c.stroke();
    },
    // a square block tapering from half-width s0 to s1 (an obelisk shaft, a spire tier); the two faces we see get
    // colL / colR, the top a cap; o.glow = [day, night] makes the faces lit windows-style in the night pass
    taper: (A, cx, cy, s0, s1, z0, h, colL, colR, o = {}) => {
      const P = A.P, z1 = z0 + h;
      const fl = [P(cx - s0, cy + s0, z0), P(cx + s0, cy + s0, z0), P(cx + s1, cy + s1, z1), P(cx - s1, cy + s1, z1)];
      const fr = [P(cx + s0, cy + s0, z0), P(cx + s0, cy - s0, z0), P(cx + s1, cy - s1, z1), P(cx + s1, cy + s1, z1)];
      if (o.glow) { A.lamp(fl, colL, o.glow[1]); A.lamp(fr, colR, o.glow[1]); A.poly(fl, null, A.OUT, 0.8); A.poly(fr, null, A.OUT, 0.8); }
      else { A.poly(fl, colL); A.poly(fr, colR); }
      if (s1 > 0.01) A.poly([P(cx - s1, cy - s1, z1), P(cx + s1, cy - s1, z1), P(cx + s1, cy + s1, z1), P(cx - s1, cy + s1, z1)], o.cap || A.shade(colL, 0.12));
      return { fl, fr, z1 };
    },
    // an n-sided upright prism (glass, crystal, a shell ring): only the faces turned to us are drawn.
    // col(i, lit) -> fill for face i; tip > 0 adds a pyramid point of that height; returns the top z
    prism: (A, cx, cy, r, z, h, n, col, tip = 0, rTop = r, rot = 0) => {
      const P = A.P, pts = (rr, zz) => Array.from({ length: n }, (_, i) => { const a = rot + i / n * Math.PI * 2; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, zz]; });
      const lo = pts(r, z), hi = pts(rTop, z + h);
      const faces = [];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n, mx = (lo[i][0] + lo[j][0]) / 2 - cx, my = (lo[i][1] + lo[j][1]) / 2 - cy; if (mx + my > 0.001) faces.push([i, j, mx - my]); }
      faces.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
      for (const [i, j, side] of faces) { const q = [P(...lo[i]), P(...lo[j]), P(...hi[j]), P(...hi[i])]; const f = col(i, side); if (Array.isArray(f)) { A.lamp(q, f[0], f[1]); A.poly(q, null, A.OUT, 0.7); } else A.poly(q, f, A.OUT, 0.7); }
      if (tip > 0) {
        const top = [cx, cy, z + h + tip];
        for (const [i, j, side] of faces) { const q = [P(...hi[i]), P(...hi[j]), P(...top)]; const f = col(i, side, true); if (Array.isArray(f)) { A.lamp(q, f[0], f[1]); A.poly(q, null, A.OUT, 0.7); } else A.poly(q, f, A.OUT, 0.7); }
        return z + h + tip;
      }
      A.poly(hi.map(p => P(...p)), (() => { const f = col(-1, 0, true); return Array.isArray(f) ? f[0] : f; })(), A.OUT, 0.7);
      return z + h;
    },
    // a soft cloud of puffs (storm clouds over a stormcatcher)
    cloud: (A, x, y, s, col) => {
      const c = A.c; c.fillStyle = A.GLOW ? '#000' : col;
      for (const [dx, dy, r] of [[-7, 1, 5], [-1, -3, 6.5], [6, 0, 5], [1, 2, 5.5]]) { c.beginPath(); c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); c.fill(); }
    },
    // a glass/water orb: shaded sphere by day, a bright pearl in the night pass
    orb: (A, x, y, r, col, rim = '#ffffff') => {
      const c = A.c; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
      if (A.GLOW) c.fillStyle = A.mix(col, '#ffffff', 0.55);
      else { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, A.mix(col, '#ffffff', 0.75)); g.addColorStop(0.55, col); g.addColorStop(1, A.shade(col, -0.35)); c.fillStyle = g; }
      c.fill(); c.strokeStyle = A.F(A.OUT); c.lineWidth = 0.8; c.stroke();
      if (!A.GLOW) { c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.28, 0, Math.PI * 2); c.fillStyle = rim; c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1; }
    },
  };
})();
