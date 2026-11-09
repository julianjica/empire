// =====================================================================
//  Auto-explore: a city with the switch on keeps sending one scout at a
//  time to the nearest unexplored land it can reach, and quietly maps it.
//  State: s.autoExplore = { cityId: { on, rivals } }; moves carry m.auto.
// =====================================================================
'use strict';
(() => {
  const AE = s => (s.autoExplore = s.autoExplore || {});
  const MAX_OUT = 2;                       // scouts out at once per city
  const REVEAL = 3;                        // radius mapped where an auto-scout arrives

  G.autoExploreOn = (s, cityId) => !!(AE(s)[cityId] && AE(s)[cityId].on);
  G.setAutoExplore = (s, cityId, on, opts = {}) => {
    const c = s.cities[cityId];
    if (!c) return 'No such city';
    AE(s)[cityId] = Object.assign(AE(s)[cityId] || {}, { on: !!on }, opts);
    if (on) autoTick(s, c);
    return null;
  };
  const outFrom = (s, cityId) => s.moves.filter(m => m.auto && m.from === cityId && m.type === 'scout').length;

  // nearest unexplored, passable tile with land access; skip tiles another auto-scout is already heading to
  G.autoExploreTarget = (s, city, rivals) => {
    const N = s.map, taken = new Set(s.moves.filter(m => m.auto).map(m => m.y * N + m.x));
    const cands = [];
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.explored[i] || taken.has(i)) continue;
      const t = s.tiles[i];
      if (G.isWater(t) || DATA.terrain[t.terrain].impassable) continue;
      if (!rivals && t.city && s.cities[t.city] && s.cities[t.city].owner !== city.owner) continue;
      // prefer tiles at the edge of the known world (an explored neighbour) — they are reachable and map new ground
      const x = i % N, y = (i / N) | 0;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && s.explored[yy * N + xx]) { edge = true; break; } }
      cands.push({ t, d: G.dist(city, t) + (edge ? 0 : 3) });
    }
    cands.sort((a, b) => a.d - b.d);
    for (const c of cands.slice(0, 12)) {
      const plan = G.planMarch(s, city.owner, city, c.t, { scout: 1 });
      if (plan.ok) return c.t;
    }
    return null;
  };

  const autoTick = (s, city) => {
    const cfg = AE(s)[city.id];
    if (!cfg || !cfg.on || city.owner !== 'p') return;
    let out = outFrom(s, city.id);
    while (out < MAX_OUT && (city.units.scout || 0) >= 1) {
      const t = G.autoExploreTarget(s, city, cfg.rivals);
      if (!t) { if (!cfg.doneLogged) { cfg.doneLogged = true; G.log(s, 'p', `🦅 The scouts of ${city.name} find no more unknown land within reach.`, 'info'); } return; }
      cfg.doneLogged = false;
      const n = s.moves.length;
      if (G.sendArmy(s, city.id, t.x, t.y, 'scout', { scout: 1 })) return;
      for (let i = n; i < s.moves.length; i++) if (s.moves[i].type === 'scout' && s.moves[i].from === city.id) s.moves[i].auto = true;
      out++;
    }
  };

  // every ~10 game-seconds: keep scouts moving out of cities with the switch on
  G.slowHooks.push(s => {
    for (const [id, cfg] of Object.entries(AE(s))) {
      const c = s.cities[id];
      if (!c || c.owner !== 'p') { delete AE(s)[id]; continue; }
      if (cfg.on) autoTick(s, c);
    }
  });

  // an auto-scout maps a wider circle; reports only when it found something worth reading
  const prevResolve = G.resolveMove;
  G.resolveMove = (s, m) => {
    if (!m.auto || m.type !== 'scout') return prevResolve(s, m);
    const tile = G.tileAt(s, m.x, m.y);
    const interesting = tile && (tile.city || tile.camp || tile.oasis || tile.ruin || tile.minor);
    if (m.owner === 'p') G.reveal(s, m.x, m.y, REVEAL);
    if (interesting) return prevResolve(s, m);
    const report = G.report;
    G.report = () => null;      // open land: map it silently
    try { return prevResolve(s, m); } finally { G.report = report; }
  };
})();
