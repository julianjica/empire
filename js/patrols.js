// =====================================================================
//  Road patrols and the Protector of the Trade.
//
//  A realm stations troops on a stretch of road (a trade route, or the road
//  between two places) as a standing patrol with a base city. A patrol:
//   - deters brigands, armies and roaming creatures along the stretch, and
//     fights the ones that strike anyway before they reach the caravan
//     (G.routeAmbush, monsters.js, field interceptions from intercept.js);
//   - makes the road a little faster for caravans and supply carts, wears it
//     in and gives vision along it;
//   - costs a field upkeep (grain from its base city, gold from the treasury)
//     and leaves the garrison at home thinner.
//  Keeping the roads safe earns score toward the realm title "Protector of the
//  Trade" (renown, better route income, favour with merchant republics); rivals
//  earn it too and contest it.
//
//  State (lazily defaulted, so old saves load):
//    s.patrols = { list: [{ id, owner, base, route|null, from, to, name, path:[[x,y]], len, units,
//                           general|null, since, readyAt, hungry, stats: { deterred, fights, won, kills,
//                           lost, protected, paidGrain, paidGold } }],
//                  rev, prot: { score: { owner: n }, holder, since, contested, renown, at } }
//  Caravans covered by a patrol carry m.ptSped (sped up once) and m.ptCov (share of the road covered).
//
//  API: G.PATROL, G.patrols, G.patrolsOf, G.patrolById, G.patrolCreate, G.patrolRecall, G.patrolSetUnits,
//       G.patrolRisk, G.patrolPlan, G.patrolCoverAt, G.patrolCovers, G.patrolUpkeep, G.patrolGuard,
//       G.protector, G.protectorScore, G.protectorTick, G.patrolStretch, G.patrolsRev, G.aiPatrol,
//       G.patrolShields (monsters.js), G.patrolRegisterCli
// =====================================================================
'use strict';

(() => {
  const PT = G.PATROL = {
    minUnits: 5,                 // a patrol is at least this many troops
    maxLen: 18,                  // tiles: the longest stretch one patrol can watch
    perCities: 3, maxPatrols: 6, // patrols per realm: 1 + cities / 3, at most 6
    cover: 1.6,                  // tiles either side of the road a patrol watches
    reach: 7,                    // tiles of road the whole patrol can reach in time; longer stretches field a share
    reachSwift: 3,               // a Swift warden reaches 3 tiles further
    joinMin: 0.35,               // never less than this share rides to a fight
    deterMax: 0.5,               // at full strength a patrol scares off half the ambushes before they start
    deterWarden: 0.1, deterRough: 0.08,   // Warden trait; Ambusher trait in forest, hills and mountains
    deterCap: 0.65,
    speed: 0.06, speedSwift: 0.04,        // caravans on a watched road travel up to 6% faster (+4% with a Swift warden)
    wear: 0.25, wearEvery: 5,    // road wear per tile every 5 game-minutes (× pace): a patrol walks its road in
    fieldGrain: 1.25,            // troops in the field eat a quarter more than at home …
    fieldGold: 0.02,             // … and draw a gold wage per head (population) per game-minute
    desert: 0.02,                // share of the patrol that deserts per minute while its upkeep goes unpaid
    vision: 1.4,                 // tiles of sight along a patrolled road
    hold: 1.1,                   // a patrol "holds" when its defence is at least 1.1× the strongest threat's attack
    // risk levels (per route): Safe / Watched / Risky / Deadly
    safeChance: 0.03, deadlyChance: 0.3, watchedShare: 0.5, warReach: 6,
    // Protector of the Trade
    half: 90,                    // score halves every 90 game-minutes (× pace)
    claim: 30,                   // score needed to claim the title
    contest: 0.8,                // a rival at 80% of the holder's score contests it …
    take: 1.2,                   // … and takes it at 120%
    lapse: 0.5,                  // the title lapses when the holder falls below half the claim
    renown: 40,                  // renown while held
    income: 0.1,                 // +10% route income (both ends of a foreign route; free-city routes)
    favour: 0.1,                 // influence per game-minute with every merchant republic
    pts: { trip: 0.5, deter: 2, repel: 3, escort: 1, intercept: 5, monster: 3, camp: 3, watch: 0.12 },
    // AI
    aiEvery: 4,                  // game-minutes (× pace) between AI patrol decisions
    aiShare: 0.25,               // an AI sends at most a quarter of a city's field troops
    aiKeep: 0.6,                 // and only from a city whose garrison stays at 60% or more
    aiMinPower: 250,             // field power a base city needs before it spares a patrol
    aiPer: 4, aiMax: 3,          // AI patrols: 1 + cities / 4, at most 3
    aiGuard: 1.4,                // AI aims for 1.4× the threat
  };
  const NONFIELD = { hero: 1, settlers: 1, herald: 1, scout: 1 };
  const LEVELS = {
    safe: { name: 'Safe', icon: '🟢', cls: 'safe' },
    watched: { name: 'Watched', icon: '🛡️', cls: 'watched' },
    risky: { name: 'Risky', icon: '🟠', cls: 'risky' },
    deadly: { name: 'Deadly', icon: '🔴', cls: 'deadly' },
  };
  G.PATROL_LEVELS = LEVELS;

  const sum = o => Object.values(o || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const clean = u => Object.fromEntries(Object.entries(u || {}).map(([k, n]) => [k, Math.floor(n)]).filter(([k, n]) => n > 0 && DATA.units[k]));
  const paceT = s => G.pace(s).time;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const safe = (fn, what) => { try { return fn(); } catch (e) { if (typeof console !== 'undefined') console.error('patrols: ' + what, e); return undefined; } };
  const nameOf = (s, o) => (s.empires[o] ? s.empires[o].name : 'Brigands');

  // -------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------
  const st = s => {
    let P = s.patrols;
    if (!P || typeof P !== 'object' || Array.isArray(P)) P = s.patrols = {};
    if (!Array.isArray(P.list)) P.list = [];
    if (!P.rev) P.rev = 1;
    if (!P.prot || typeof P.prot !== 'object') P.prot = {};
    const pr = P.prot;
    if (!pr.score || typeof pr.score !== 'object') pr.score = {};
    if (pr.holder === undefined) pr.holder = null;
    if (pr.contested === undefined) pr.contested = null;
    return P;
  };
  G.patrols = s => st(s).list;
  G.patrolsOf = (s, owner) => st(s).list.filter(p => p.owner === owner);
  G.patrolById = (s, id) => st(s).list.find(p => p.id === id) || null;
  G.patrolsRev = s => (s.patrols && s.patrols.rev) || 0;
  const bump = s => { st(s).rev++; };
  const placeOf = (s, id) => (id && (s.cities[id] || (s.minors && s.minors[id]))) || null;
  const placeName = (s, id) => { const p = placeOf(s, id); return p ? p.name : '?'; };
  const maxPatrols = (s, owner) => Math.min(PT.maxPatrols, 1 + Math.floor(G.citiesOf(s, owner).length / PT.perCities));
  G.patrolMax = maxPatrols;

  // the road a patrol walks: the land path between its two ends (straight when there is none)
  const roadBetween = (s, a, b) => {
    const p = G.path(s, { x: a.x, y: a.y }, { x: b.x, y: b.y }, false);
    if (p && p.path && p.path.length >= 2) return { path: p.path.map(q => [q[0], q[1]]), len: p.len || p.path.length };
    const n = Math.max(1, Math.ceil(dist(a, b)));
    const out = [];
    for (let i = 0; i <= n; i++) out.push([Math.round(a.x + (b.x - a.x) * i / n), Math.round(a.y + (b.y - a.y) * i / n)]);
    return { path: out, len: dist(a, b) };
  };
  G.patrolStretch = (s, fromId, toId) => {
    const a = placeOf(s, fromId), b = placeOf(s, toId);
    if (!a || !b) return null;
    return roadBetween(s, a, b);
  };

  // ---- coverage: tile indices within PT.cover of the road and of the straight line (route caravans ride straight) ----
  const COVER = new WeakMap();
  const coverOf = (s, p) => {
    const key = p.path.length + ':' + p.from + '>' + p.to;
    const c = COVER.get(p);
    if (c && c.key === key && c.N === s.map) return c.set;
    const set = new Set(), N = s.map, R = PT.cover, R2 = R * R;
    const mark = (x, y) => {
      for (let yy = Math.max(0, Math.floor(y - R)); yy <= Math.min(N - 1, Math.ceil(y + R)); yy++)
        for (let xx = Math.max(0, Math.floor(x - R)); xx <= Math.min(N - 1, Math.ceil(x + R)); xx++)
          if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= R2) set.add(yy * N + xx);
    };
    for (const q of p.path) mark(q[0], q[1]);
    const a = placeOf(s, p.from), b = placeOf(s, p.to);
    if (a && b) { const n = Math.max(1, Math.ceil(dist(a, b) * 2)); for (let i = 0; i <= n; i++) mark(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); }
    COVER.set(p, { key, N, set });
    return set;
  };
  const ready = (s, p) => s.time >= (p.readyAt || 0) && G.unitsCount(p.units) > 0;
  // the ready patrol of an owner watching a point (the strongest when several do)
  G.patrolCoverAt = (s, owner, x, y) => {
    const P = s.patrols;
    if (!P || !P.list || !P.list.length) return null;
    const i = Math.round(y) * s.map + Math.round(x);
    let best = null, bp = -1;
    for (const p of P.list) {
      if (p.owner !== owner || !ready(s, p) || !coverOf(s, p).has(i)) continue;
      const pw = guardPower(s, p);
      if (pw > bp) { bp = pw; best = p; }
    }
    return best;
  };
  // share of a polyline (or a straight segment) watched by an owner's patrols
  const shareOf = (s, owner, pts) => {
    if (!pts.length) return { share: 0, patrol: null };
    let hit = 0, best = null;
    for (const q of pts) { const p = G.patrolCoverAt(s, owner, q[0], q[1]); if (p) { hit++; if (!best) best = p; } }
    return { share: hit / pts.length, patrol: best };
  };
  const segPts = (a, b, n) => { const out = []; n = n || Math.max(4, Math.ceil(dist(a, b) * 2)); for (let i = 0; i < n; i++) { const f = (i + 0.5) / n; out.push([a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f]); } return out; };
  const movePts = m => {
    if (m.path && m.path.length >= 2) { const step = Math.max(1, Math.floor(m.path.length / 12)); const out = []; for (let i = 0; i < m.path.length; i += step) out.push(m.path[i]); return out; }
    return segPts({ x: m.fx, y: m.fy }, { x: m.x, y: m.y }, 10);
  };
  G.patrolCovers = (s, m) => shareOf(s, m.owner, movePts(m));

  // ---- strength ----
  const generalOf = (s, p) => (p.general && G.generalById ? G.generalById(s, p.owner, p.general) : null);
  const hasTrait = (s, p, t) => { const g = generalOf(s, p); return !!(g && G.generalHas && G.generalHas(g, t)); };
  // the share of the patrol that reaches a fight in time
  const joinShare = (s, p) => Math.max(PT.joinMin, Math.min(1, (PT.reach + (hasTrait(s, p, 'swift') ? PT.reachSwift : 0)) / Math.max(1, p.len || 1)));
  const joinUnits = (s, p) => {
    const k = joinShare(s, p), out = {};
    for (const [u, n] of Object.entries(p.units || {})) { const j = Math.max(n > 0 ? 1 : 0, Math.round(n * k)); if (j > 0) out[u] = Math.min(n, j); }
    return out;
  };
  const edgeOf = (s, p, units, f) => {
    const base = s.cities[p.base];
    const e = G.armyEdge(s, p.owner, base && base.owner === p.owner ? base : null, units);
    let mult = e.mult; const labels = e.labels.map(l => ({ ...l, side: 'def' })); let k = {};
    const g = generalOf(s, p);
    if (g && G.generalEdge) { const ge = G.generalEdge(s, p.owner, g, units, 'def', f || null, 'raid', null); mult *= ge.mult; labels.push(...ge.labels); k = ge.k || {}; }
    return { mult, labels, k };
  };
  const guardPower = (s, p, units) => {
    units = units || joinUnits(s, p);
    const g = generalOf(s, p);
    return G.defPower(s, p.owner, units) * (g && G.generalLeadership ? G.generalLeadership(g) : 1);
  };
  G.patrolGuard = (s, p) => guardPower(s, p);
  const threatPower = (s, owner, units) => G.atkPower(s, owner, units || {});
  const campParty = k => ({ brigand: Math.max(3, Math.round((k.units.brigand || 0) * ((G.TRADE && G.TRADE.party) || 0.4))) });
  const ROUGH = { forest: 1, hills: 1, mountain: 1 };
  const deterOf = (s, p, guard, threat, x, y) => {
    let d = PT.deterMax * Math.min(1, threat > 0 ? guard / threat : 1);
    if (hasTrait(s, p, 'warden')) d += PT.deterWarden;
    if (hasTrait(s, p, 'ambusher')) { const t = G.tileAt(s, Math.round(x), Math.round(y)); if (t && ROUGH[t.terrain]) d += PT.deterRough; }
    return Math.min(PT.deterCap, Math.max(0, d));
  };

  // ---- losses on a patrol ----
  const applyLosses = (s, p, sent, left) => {
    let lost = 0;
    for (const [u, n] of Object.entries(sent)) {
      const dead = Math.max(0, n - Math.floor((left && left[u]) || 0));
      if (!dead) continue;
      p.units[u] = Math.max(0, (p.units[u] || 0) - dead);
      if (!p.units[u]) delete p.units[u];
      lost += dead;
    }
    p.stats.lost += lost;
    return lost;
  };
  const xp = (s, p, kills) => { const g = generalOf(s, p); if (g && G.generalGainXp) G.generalGainXp(s, p.owner, g, 6 + Math.min(40, kills)); };
  // the patrol fights a party where they meet; returns the battle (r.win: the attackers broke the patrol)
  const patrolBattle = (s, p, foe, foeOwner, x, y) => {
    const units = joinUnits(s, p);
    const f = G.battlefield ? safe(() => G.battlefield(s, Math.round(x), Math.round(y), null, false), 'field') : null;
    const e = edgeOf(s, p, units, f);
    const r = G.battle(s, foeOwner, { ...foe }, 1, p.owner, units, e.mult, 0, { mode: 'raid', x: Math.round(x), y: Math.round(y), field: f || undefined, hold: false, labels: e.labels, k: { att: {}, def: e.k } });
    applyLosses(s, p, units, r.defLeft);
    const kills = sum(r.attLost);
    p.stats.fights++; p.stats.kills += kills;
    if (!r.win) p.stats.won++;
    xp(s, p, kills);
    return { r, sent: units };
  };

  // -------------------------------------------------------------------
  // Create, recall, change
  // -------------------------------------------------------------------
  const fieldUnitsOf = (s, owner, units) => {
    const out = {};
    for (const [u, n] of Object.entries(clean(units))) {
      const d = DATA.units[u];
      if (!d || NONFIELD[u] || d.type === 'ship' || d.type === 'siege' || d.type === 'civ') continue;
      out[u] = n;
    }
    return out;
  };
  // opts: { route } or { from, to }; base (defaults to the route's city or the nearer end); units; general
  G.patrolCreate = (s, owner, opts = {}) => {
    const emp = s.empires[owner];
    if (!emp || emp.dead) return 'No realm';
    let route = null, from = opts.from, to = opts.to;
    if (opts.route) {
      route = G.routeById ? G.routeById(s, opts.route) : null;
      if (!route) return 'No such trade route';
      if (route.owner !== owner) return 'Not your trade route';
      from = route.from; to = route.to.id;
    }
    const a = placeOf(s, from), b = placeOf(s, to);
    if (!a || !b) return 'Choose both ends of the road';
    if (a === b) return 'Choose two different places';
    let base = opts.base ? s.cities[opts.base] : null;
    if (!base) base = a.owner === owner && s.cities[a.id] ? a : b.owner === owner && s.cities[b.id] ? b : G.citiesOf(s, owner).sort((x, y) => dist(x, a) - dist(y, a))[0];
    if (!base || base.owner !== owner) return 'The base must be one of your cities';
    if (owner === 'p' && !(s.explored[a.y * s.map + a.x] && s.explored[b.y * s.map + b.x])) return 'You have not explored that road';
    const list = st(s).list;
    if (list.filter(p => p.owner === owner).length >= maxPatrols(s, owner)) return `You can field ${maxPatrols(s, owner)} patrol${maxPatrols(s, owner) > 1 ? 's' : ''} (one more every ${PT.perCities} cities)`;
    if (list.some(p => p.owner === owner && ((p.from === a.id && p.to === b.id) || (p.from === b.id && p.to === a.id)))) return 'That road is already patrolled';
    const units = fieldUnitsOf(s, owner, opts.units);
    if (G.unitsCount(units) < PT.minUnits) return `A patrol needs at least ${PT.minUnits} field troops`;
    for (const [u, n] of Object.entries(units)) if ((base.units[u] || 0) < n) return `Not enough ${DATA.units[u].name} in ${base.name}`;
    const road = roadBetween(s, a, b);
    if (road.len > PT.maxLen) return `Too long a road (${Math.round(road.len)} tiles): a patrol watches at most ${PT.maxLen}`;
    if (dist(base, a) > PT.maxLen && dist(base, b) > PT.maxLen) return `${base.name} is too far from that road`;
    let g = null;
    if (opts.general) {
      if (!G.generalAvailable) return 'No generals';
      const e = G.generalAvailable(s, owner, opts.general, base.id);
      if (e) return e;
      g = G.generalById(s, owner, opts.general);
    }
    for (const [u, n] of Object.entries(units)) base.units[u] -= n;
    const mid = road.path[Math.floor(road.path.length / 2)];
    const march = G.travelTime(s, owner, base, { x: mid[0], y: mid[1] }, G.slowest(s, owner, units));
    const p = {
      id: G.newId(s, 'pt'), owner, base: base.id, route: route ? route.id : null, from: a.id, to: b.id,
      name: `${a.name} – ${b.name}`, path: road.path, len: Math.round(road.len * 10) / 10, units, general: g ? g.id : null,
      since: s.time, readyAt: s.time + Math.max(15, Math.round(march)), hungry: 0,
      stats: { deterred: 0, fights: 0, won: 0, kills: 0, lost: 0, protected: 0, paidGrain: 0, paidGold: 0 },
    };
    if (g) { g.status = 'patrolling'; g.city = base.id; g.move = p.id; }
    list.push(p);
    bump(s);
    if (owner === 'p') G.log(s, 'p', `🛡️ ${G.unitsCount(units)} troops ride out from ${base.name} to patrol the road ${p.name}${g ? `, led by ${g.name}, Warden of the Roads` : ''}.`, 'info');
    return p;
  };
  // troops march home from the middle of their road (a general rides with them)
  const sendBack = (s, p, home) => {
    const units = clean(p.units);
    const mid = p.path[Math.floor(p.path.length / 2)] || [home.x, home.y];
    const g = generalOf(s, p);
    if (!G.unitsCount(units)) { if (g) { g.status = 'home'; g.city = home.id; g.move = null; } return; }
    const m = { id: G.newId(s, 'm'), owner: p.owner, type: 'return', from: home.id, fx: mid[0], fy: mid[1], x: home.x, y: home.y, units, cargo: {},
      depart: s.time, arrive: s.time + Math.max(10, Math.round(G.travelTime(s, p.owner, { x: mid[0], y: mid[1] }, home, G.slowest(s, p.owner, units)))) };
    s.moves.push(m);
    if (g) { g.status = 'marching'; g.move = m.id; g.city = null; m.general = g.id; }
  };
  G.patrolRecall = (s, id, owner = 'p', why) => {
    const P = st(s), p = P.list.find(x => x.id === id);
    if (!p || p.owner !== owner) return 'No such patrol';
    P.list = P.list.filter(x => x !== p);
    bump(s);
    const base = s.cities[p.base];
    const home = base && base.owner === owner ? base : G.capital(s, owner);
    if (home) sendBack(s, p, home);
    else { const g = generalOf(s, p); if (g) { g.status = 'home'; g.move = null; } }
    if (owner === 'p') G.log(s, 'p', `🛡️ The patrol on ${p.name} ${why ? why + ' and ' : ''}marches home to ${home ? home.name : 'nowhere'}.`, why ? 'warn' : 'info');
    return null;
  };
  // add troops from the base, or send some home: units = the patrol's new strength
  G.patrolSetUnits = (s, id, units, owner = 'p') => {
    const p = G.patrolById(s, id);
    if (!p || p.owner !== owner) return 'No such patrol';
    const base = s.cities[p.base];
    if (!base || base.owner !== owner) return 'Its base city is lost';
    const want = fieldUnitsOf(s, owner, units);
    if (G.unitsCount(want) < PT.minUnits) return `A patrol needs at least ${PT.minUnits} field troops (recall it instead)`;
    for (const [u, n] of Object.entries(want)) { const add = n - (p.units[u] || 0); if (add > 0 && (base.units[u] || 0) < add) return `Not enough ${DATA.units[u].name} in ${base.name}`; }
    const back = {};
    for (const u of new Set([...Object.keys(want), ...Object.keys(p.units)])) {
      const d = (want[u] || 0) - (p.units[u] || 0);
      if (d > 0) base.units[u] -= d; else if (d < 0) back[u] = -d;
    }
    p.units = want;
    if (G.unitsCount(back)) { const keep = p.units; p.units = back; sendBack(s, { ...p, general: null }, base); p.units = keep; }
    bump(s);
    return null;
  };
  G.patrolSetGeneral = (s, id, genId, owner = 'p') => {
    const p = G.patrolById(s, id);
    if (!p || p.owner !== owner) return 'No such patrol';
    const old = generalOf(s, p);
    if (genId) {
      const e = G.generalAvailable ? G.generalAvailable(s, owner, genId, p.base) : 'No generals';
      if (e) return e;
    }
    if (old) { old.status = 'home'; old.city = p.base; old.move = null; }
    p.general = null;
    if (genId) { const g = G.generalById(s, owner, genId); g.status = 'patrolling'; g.city = p.base; g.move = p.id; p.general = g.id; }
    return null;
  };

  // upkeep per game-minute: { grain, gold }
  G.patrolUpkeep = (s, p) => {
    const base = s.cities[p.base];
    let grain = 0;
    for (const [u, n] of Object.entries(p.units || {})) grain += (DATA.units[u] ? DATA.units[u].upkeep || 0 : 0) * n;
    grain *= PT.fieldGrain * (base ? G.mod(s, p.owner, base, 'upkeep') : 1);
    if (hasTrait(s, p, 'forager')) grain = 0;
    return { grain, gold: G.popOf(p.units) * PT.fieldGold };
  };

  // -------------------------------------------------------------------
  // Risk per route: Safe / Watched / Risky / Deadly
  // -------------------------------------------------------------------
  const hostileTo = (s, owner, other) => {
    if (!other || owner === other || !s.empires[other]) return false;
    return (G.statusOf ? G.statusOf(s, owner, other) : 'war') === 'war';
  };
  const MON_RAID = { raider: 1, hunter: 1, night: 1 };
  // the threats along a stretch from a to b: { camps, armies, monsters, war, worst (units), worstOwner, threat (attack power) }
  const threatsAlong = (s, owner, a, b) => {
    const pts = segPts(a, b);
    const R = (G.TRADE && G.TRADE.campRadius) || 1.5;
    const camps = new Map(), armies = new Map(), mons = new Map();
    for (const q of pts) {
      const p = { x: q[0], y: q[1] };
      for (const k of Object.values(s.camps || {})) if ((k.units.brigand || 0) > 0 && dist(k, p) <= R) camps.set(k.id, k);
      for (const m of s.moves) if (['raid', 'attack', 'conquer'].includes(m.type) && G.unitsCount(m.units) && hostileTo(s, owner, m.owner) && dist(G.movePos(s, m), p) <= R) armies.set(m.id, m);
      for (const mon of Object.values(s.monsters || {})) {
        const k = DATA.monsterKinds && DATA.monsterKinds[mon.kind];
        if (!k || !(MON_RAID[k.behave] || k.crisis) || !G.unitsCount(mon.units)) continue;
        const mp = G.movePos(s, mon);
        if (dist(mp, p) <= 2) mons.set(mon.id, mon);
      }
    }
    let war = 0;
    for (const e of Object.values(s.empires)) {
      if (e.dead || !hostileTo(s, owner, e.id)) continue;
      if (G.citiesOf(s, e.id).some(c => pts.some(q => Math.hypot(c.x - q[0], c.y - q[1]) <= PT.warReach))) war++;
    }
    let worst = null, worstOwner = null, threat = 0;
    for (const k of camps.values()) { const u = campParty(k), t = threatPower(s, null, u); if (t > threat) { threat = t; worst = u; worstOwner = null; } }
    for (const m of armies.values()) { const t = threatPower(s, m.owner, m.units); if (t > threat) { threat = t; worst = { ...m.units }; worstOwner = m.owner; } }
    for (const mon of mons.values()) { const t = threatPower(s, null, mon.units); if (t > threat) { threat = t; worst = { ...mon.units }; worstOwner = null; } }
    return { camps: [...camps.values()], armies: armies.size, monsters: mons.size, war, worst, worstOwner, threat, pts };
  };
  // risk of a route (or a route-like { owner, from, to:{ id, kind } }, or a stretch { owner, from, to } of place ids)
  G.patrolRisk = (s, route) => {
    const owner = route.owner;
    const fromId = route.from, toId = route.to && typeof route.to === 'object' ? route.to.id : route.to;
    const a = placeOf(s, fromId), b = placeOf(s, toId);
    if (!a || !b) return { level: 'safe', chance: 0, base: 0, share: 0, threat: 0, guard: 0, holds: true, deter: 0, patrol: null, camps: [], armies: 0, monsters: 0, war: 0 };
    const isMinorDest = !s.cities[toId];
    const rlike = route.goods ? route : { owner, from: fromId, to: { id: toId, kind: isMinorDest ? 'minor' : 'city' }, foreign: !!route.foreign, escort: route.escort || {} };
    const rk = baseRisk ? baseRisk(s, rlike) : { chance: 0 };
    const th = threatsAlong(s, owner, a, b);
    const cov = shareOf(s, owner, th.pts);
    const p = cov.patrol;
    const guard = p ? guardPower(s, p) * edgeOf(s, p, joinUnits(s, p)).mult : 0;
    const holds = !th.threat || guard >= th.threat * PT.hold;
    const deter = p ? deterOf(s, p, guard, th.threat, (a.x + b.x) / 2, (a.y + b.y) / 2) : 0;
    const base = Math.min(1, (rk.chance || 0) + 0.12 * th.monsters);
    const chance = 1 - Math.pow(1 - base, 1 - deter * cov.share);
    let level;
    if (base < PT.safeChance && !th.armies && !th.war) level = 'safe';
    else if (p && cov.share >= PT.watchedShare && holds) level = 'watched';
    else if (th.armies || chance >= PT.deadlyChance) level = 'deadly';
    else level = 'risky';
    return { level, chance, base, share: cov.share, threat: Math.round(th.threat), guard: Math.round(guard), holds, deter, patrol: p ? p.id : null,
      camps: th.camps.map(k => ({ id: k.id, tier: k.tier, x: k.x, y: k.y })), armies: th.armies, monsters: th.monsters, war: th.war, expectedLoss: rk.expectedLoss || 0 };
  };

  // the route list a realm sees: every standing route it runs, with its risk
  G.patrolRoutes = (s, owner) => (G.routes ? G.routes(s) : []).filter(r => r.owner === owner).map(r => ({ r, risk: G.patrolRisk(s, r) }));

  // -------------------------------------------------------------------
  // Suggestions (for the AI, the UI's suggestion card and an automation domain later)
  // returns [{ route, from, to, name, level, chance, threat, base, units, guard, enough, reason }]
  // -------------------------------------------------------------------
  const pickUnits = (s, owner, city, need, share) => {
    const pool = fieldUnitsOf(s, owner, city.units);
    const out = {};
    let guard = 0;
    const order = Object.keys(pool).sort((x, y) => { const a = G.unitStats(s, owner, x), b = G.unitStats(s, owner, y); return (b.defI + b.defC) - (a.defI + a.defC); });
    for (const u of order) {
      const cap = Math.floor(pool[u] * share);
      if (cap <= 0) continue;
      const d = G.unitStats(s, owner, u), per = (d.defI + d.defC) / 2;
      const n = Math.min(cap, Math.max(1, Math.ceil((need - guard) / Math.max(1, per))));
      if (n > 0) { out[u] = n; guard += per * n; }
      if (guard >= need) break;
    }
    return { units: out, guard };
  };
  G.patrolPlan = (s, owner, opts = {}) => {
    const out = [];
    const mine = G.patrolsOf(s, owner);
    const free = maxPatrols(s, owner) - mine.length;
    for (const { r, risk } of G.patrolRoutes(s, owner)) {
      if (risk.level !== 'risky' && risk.level !== 'deadly') continue;
      if (mine.some(p => p.route === r.id || (p.from === r.from && p.to === r.to.id) || (p.to === r.from && p.from === r.to.id))) continue;
      const base = s.cities[r.from];
      if (!base || base.owner !== owner) continue;
      const dest0 = placeOf(s, r.to.id);
      const rlen = dest0 ? roadBetween(s, base, dest0).len : PT.reach;
      const reachK = Math.max(PT.joinMin, Math.min(1, PT.reach / Math.max(1, rlen)));
      const need = Math.max(80, risk.threat * (opts.guard || PT.aiGuard)) / reachK;
      const pk = pickUnits(s, owner, base, need, opts.share || (owner === 'p' ? 0.5 : PT.aiShare));
      const dest = placeOf(s, r.to.id);
      out.push({ route: r.id, from: r.from, to: r.to.id, name: `${base.name} → ${dest ? dest.name : '?'}`, level: risk.level, chance: risk.chance, threat: risk.threat,
        base: base.id, units: pk.units, guard: Math.round(pk.guard * reachK), enough: G.unitsCount(pk.units) >= PT.minUnits && pk.guard * reachK >= risk.threat * PT.hold,
        slot: free > 0, reason: risk.armies ? 'hostile armies near the road' : risk.camps.length ? `${risk.camps.length} brigand camp${risk.camps.length > 1 ? 's' : ''} near the road` : risk.monsters ? 'creatures on the prowl' : risk.war ? 'enemy cities near the road' : 'ambushes' });
    }
    out.sort((x, y) => (y.level === 'deadly') - (x.level === 'deadly') || y.chance - x.chance);
    return out;
  };

  // -------------------------------------------------------------------
  // Wrapping the trade-route risk and ambushes (traderoutes.js loads before this file)
  // -------------------------------------------------------------------
  const baseRisk = G.routeRisk;
  if (baseRisk) {
    G.routeRisk = (s, route) => {
      const rk = baseRisk(s, route);
      if (!rk || !s.patrols || !s.patrols.list.length) return rk;
      const owner = route.owner || (s.cities[route.from] || {}).owner;
      if (!owner || !G.patrolsOf(s, owner).length) return rk;
      const pr = G.patrolRisk(s, { ...route, owner });
      if (!pr.patrol) return rk;
      return { ...rk, chance: Math.min(rk.chance, pr.chance), expectedLoss: rk.expectedLoss * (pr.holds ? (1 - pr.deter) * 0.2 : 1 - pr.deter * pr.share), patrol: pr.patrol, level: pr.level };
    };
  }

  // an ambush by a camp ({camp}) or a hostile army ({army}) on caravan m: the patrol on that stretch first scares
  // them off or fights them; only a party that breaks the patrol reaches the caravan
  const baseAmbush = G.routeAmbush;
  if (baseAmbush) {
    G.routeAmbush = (s, m, src) => {
      const pos = G.movePos(s, m);
      const p = s.patrols && s.patrols.list.length ? G.patrolCoverAt(s, m.owner, pos.x, pos.y) : null;
      if (!p) {
        const res = baseAmbush(s, m, src);
        if (res && res.held && G.unitsCount(m.units)) G.protectorScore(s, m.owner, PT.pts.escort);
        return res;
      }
      const foe = src.army ? clean(src.army.units) : campParty(src.camp);
      const foeOwner = src.army ? src.army.owner : null;
      const guard = guardPower(s, p) * edgeOf(s, p, joinUnits(s, p)).mult, threat = threatPower(s, foeOwner, foe);
      const where = `(${Math.round(pos.x)}, ${Math.round(pos.y)})`;
      if (Math.random() < deterOf(s, p, guard, threat, pos.x, pos.y)) {
        p.stats.deterred++;
        G.protectorScore(s, p.owner, PT.pts.deter);
        if (p.owner === 'p' && !(p.toldAt > s.time - 120 * paceT(s))) { p.toldAt = s.time; G.log(s, 'p', `🛡️ ${nameOf(s, foeOwner)} eyed a caravan near ${where}, saw the patrol on ${p.name} and slunk away.`, 'good'); }
        return { stolen: {}, held: true, loss: 0, deterred: true, patrol: p.id };
      }
      const { r, sent } = patrolBattle(s, p, foe, foeOwner, pos.x, pos.y);
      if (src.camp) src.camp.units.brigand = Math.max(1, (src.camp.units.brigand || 0) - (r.attLost.brigand || 0));
      if (src.army) src.army.units = clean(r.attLeft);
      const title = r.win ? `The patrol on ${p.name} was broken near ${where}` : `The patrol on ${p.name} drove off an ambush near ${where}`;
      G.report(s, [p.owner, foeOwner].filter(Boolean), (r.win ? '🛡️ ' : '🛡️ ') + title, p.owner === 'p' ? (r.win ? 'loss' : 'win') : 'info',
        { att: nameOf(s, foeOwner), def: `Patrol (${p.name})`, A: r.A, D: r.D, attSent: foe, defHad: sent, attLost: r.attLost, defLost: r.defLost, loot: {}, tactics: r.tactics,
          extra: r.win ? 'The patrol broke and the raiders fell on the caravan.' : 'The patrol met them on the road; the caravan never saw them.' });
      if (!r.win) {
        m.ambushed = true;
        G.protectorScore(s, p.owner, PT.pts.repel);
        if (p.owner === 'p') G.log(s, 'p', `🛡️ ${title}.`, 'good');
        return { stolen: {}, held: true, loss: 0, patrol: p.id };
      }
      if (p.owner === 'p') G.log(s, 'p', `🛡️ ${title}.`, 'bad');
      if (src.army && !G.unitsCount(src.army.units)) { m.ambushed = true; return { stolen: {}, held: true, loss: 0, patrol: p.id }; }
      return baseAmbush(s, m, src);
    };
  }

  // roaming creatures (monsters.js asks before it falls on a caravan): true when a patrol shielded the caravan
  G.patrolShields = (s, m, mon) => {
    if (!s.patrols || !s.patrols.list.length || !m || !mon) return false;
    if (!G.unitsCount(mon.units)) return true;
    const pos = G.movePos(s, m);
    const p = G.patrolCoverAt(s, m.owner, pos.x, pos.y);
    if (!p) return false;
    const foe = clean(mon.units);
    const guard = guardPower(s, p) * edgeOf(s, p, joinUnits(s, p)).mult, threat = threatPower(s, null, foe);
    const k = (DATA.monsterKinds && DATA.monsterKinds[mon.kind]) || { name: 'Creatures', icon: '🐾' };
    if (Math.random() < deterOf(s, p, guard, threat, pos.x, pos.y)) {
      p.stats.deterred++; G.protectorScore(s, p.owner, PT.pts.deter);
      mon.raidAt = s.time + 600 * paceT(s);
      return true;
    }
    const { r, sent } = patrolBattle(s, p, foe, null, pos.x, pos.y);
    mon.units = clean(r.attLeft);
    mon.raidAt = s.time + 900 * paceT(s);
    G.report(s, [p.owner], `${k.icon} ${r.win ? `${k.name} broke the patrol on ${p.name}` : `The patrol on ${p.name} drove off ${k.name.replace(/^The /, 'the ')}`}`, r.win ? 'loss' : 'win',
      { att: k.name, def: `Patrol (${p.name})`, A: r.A, D: r.D, attSent: foe, defHad: sent, attLost: r.attLost, defLost: r.defLost, loot: {}, tactics: r.tactics, extra: r.win ? 'The beast went on to the caravan.' : 'The caravan passed unharmed.' });
    if (!G.unitsCount(mon.units) && s.monsters) delete s.monsters[mon.id];
    if (r.win) return false;
    m.ambushed = true;
    G.protectorScore(s, p.owner, PT.pts.monster);
    return true;
  };

  // -------------------------------------------------------------------
  // Foreign route income: the Protector's routes pay more (traderoutes.js G.routeTripIncome follows prices)
  // -------------------------------------------------------------------
  const holderOf = s => (s.patrols && s.patrols.prot && s.patrols.prot.holder) || null;
  if (G.routeTripIncome) {
    const baseTrip = G.routeTripIncome;
    G.routeTripIncome = (s, r, from, to, cargo) => {
      const v = baseTrip(s, r, from, to, cargo);
      const h = holderOf(s);
      return h && ((from && from.owner === h) || (to && to.owner === h)) ? Math.round(v * (1 + PT.income)) : v;
    };
  }
  if (G.minorRouteQuote) {
    const baseMQ = G.minorRouteQuote;
    G.minorRouteQuote = (s, from, mi, give) => {
      const q = baseMQ(s, from, mi, give);
      const h = holderOf(s);
      return q && h && from && from.owner === h ? { ...q, gold: Math.round(q.gold * (1 + PT.income)), protector: true } : q;
    };
    G.minorRouteQuote._priced = !!baseMQ._priced;   // prices.js wraps only once
  }

  // -------------------------------------------------------------------
  // Supply lines prefer a patrolled road when it is not much longer (logistics.js loads before this file)
  // -------------------------------------------------------------------
  const ALT = new WeakMap();
  // march cost of a tile path: step length × the ground's factor (roads.js; geometric length without it)
  const costLen = (s, path) => {
    const rc = G.roadCosts ? safe(() => G.roadCosts(s), 'costs') : null, fac = rc && rc.fac, N = s.map;
    if (!fac) return plen(path);
    let d = 0;
    for (let k = 1; k < path.length; k++) {
      const u = path[k - 1][1] * N + path[k - 1][0], v = path[k][1] * N + path[k][0];
      d += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]) * ((fac[u] || 1) + (fac[v] || 1)) / 2;
    }
    return d;
  };
  G.patrolCostLen = costLen;
  const plen = path => { let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return l; };
  PT.supplyDetour = 1.2;
  if (G.supplyReach) {
    const baseReach = G.supplyReach;
    G.supplyReach = (s, owner, a, b) => {
      const way = baseReach(s, owner, a, b);
      if (!way || way.naval || !s.patrols || !s.patrols.list.length) return way;
      const mine = G.patrolsOf(s, owner).filter(p => ready(s, p));
      if (!mine.length) return way;
      let cache = ALT.get(s);
      if (!cache || cache.rev !== s.patrols.rev) { cache = { rev: s.patrols.rev, m: new Map() }; ALT.set(s, cache); }
      const key = owner + ':' + a.id + '>' + b.id;
      if (cache.m.has(key)) { const c = cache.m.get(key); return c ? { ...way, ...c } : way; }
      const direct = costLen(s, way.path) || dist(a, b);
      const covDirect = shareOf(s, owner, way.path).share;
      let best = null;
      // join the patrol's road at the vertex nearest the source, leave it at the vertex nearest the destination
      const near = (path, q) => { let bi = 0, bd = 1e9; for (let k = 0; k < path.length; k++) { const d = Math.hypot(path[k][0] - q.x, path[k][1] - q.y); if (d < bd) { bd = d; bi = k; } } return bi; };
      const leg = (q, v) => (q.x === v[0] && q.y === v[1]) ? { path: [[q.x, q.y]] } : G.path(s, q, { x: v[0], y: v[1] }, false);
      for (const p of mine) {
        if (covDirect >= 0.9) break;
        const i = near(p.path, a), j = near(p.path, b);
        if (i === j) continue;
        const road = i < j ? p.path.slice(i, j + 1) : p.path.slice(j, i + 1).reverse();
        const l1 = leg(a, road[0]), l2 = leg(b, road[road.length - 1]);
        if (!l1 || !l2) continue;
        const path = [...l1.path, ...road.slice(1), ...[...l2.path].reverse().slice(1)];
        const len = costLen(s, path);
        if (len > direct * PT.supplyDetour) continue;
        const cov = shareOf(s, owner, path).share;
        if (cov <= covDirect + 0.2) continue;
        if (!best || cov > best.cov || (cov === best.cov && len < best.len)) best = { path, len, cov };
      }
      const alt = best ? { path: best.path, dur: Math.max(way.dur, Math.round(way.dur * best.len / Math.max(0.1, direct))), patrolled: true } : null;
      cache.m.set(key, alt);
      return alt ? { ...way, ...alt } : way;
    };
  }

  // -------------------------------------------------------------------
  // Garrison counts, power and vision see the troops on patrol
  // -------------------------------------------------------------------
  {
    const baseSoldiers = G.soldiers;
    G.soldiers = (s, city, away) => {
      let n = baseSoldiers(s, city, away);
      const P = s.patrols;
      if (P && P.list && P.list.length) for (const p of P.list) if (p.base === city.id && p.owner === city.owner) n += G.popOf(p.units);
      return n;
    };
    const basePower = G.power;
    G.power = (s, owner) => {
      let v = basePower(s, owner);
      const P = s.patrols;
      if (P && P.list && P.list.length) for (const p of P.list) if (p.owner === owner) v += Math.round((G.atkPower(s, owner, p.units) + G.defPower(s, owner, p.units)) * 0.25);
      return v;
    };
    const baseVis = G.visibleSet;
    G.visibleSet = s => {
      const vis = baseVis(s);
      const P = s.patrols;
      if (!P || !P.list || !P.list.length) return vis;
      const N = s.map, R = PT.vision, R2 = R * R;
      for (const p of P.list) {
        if (p.owner !== 'p' || !ready(s, p)) continue;
        for (let i = 0; i < p.path.length; i += 2) {
          const [cx, cy] = p.path[i];
          for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(N - 1, Math.ceil(cy + R)); y++)
            for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(N - 1, Math.ceil(cx + R)); x++)
              if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= R2) vis[y * N + x] = 1;
        }
      }
      return vis;
    };
  }

  // -------------------------------------------------------------------
  // Caravans that arrive along a watched road count toward the Protector's score
  // -------------------------------------------------------------------
  {
    const prevTrade = G.moveHandlers.trade;
    G.moveHandlers.trade = (s, m) => {
      if (m && m.ptCov >= 0.5 && m.leg !== 'back' && sum(m.cargo) > 0) {
        const p = G.patrolById(s, m.ptBy);
        if (p) p.stats.protected++;
        G.protectorScore(s, m.owner, PT.pts.trip);
      }
      return prevTrade ? prevTrade(s, m) : undefined;
    };
  }

  // -------------------------------------------------------------------
  // Field interceptions (intercept.js loads after this file: wrapped at the first tick)
  // -------------------------------------------------------------------
  // the patrol on the road meets the interceptors before they reach the caravan
  const meetIntercept = (s, m, inner) => {
    const T = s.moves.find(x => x.id === m.target);
    if (!T || T.type !== 'trade' || T.owner === m.owner || !s.patrols || !s.patrols.list.length) return inner(s, m);
    const pos = G.movePos(s, T);
    if (dist(pos, m) > ((G.IC && G.IC.catch) || 1.75) + 0.5) return inner(s, m);
    const p = G.patrolCoverAt(s, T.owner, pos.x, pos.y) || G.patrolCoverAt(s, T.owner, m.x, m.y);
    if (!p || (G.canIntercept && G.canIntercept(s, m.owner, T))) return inner(s, m);
    const me = s.empires[m.owner];
    if (!me || me.dead) return inner(s, m);
    const x = Math.round(m.x), y = Math.round(m.y);
    const units = clean(p.units);        // the whole patrol turns out: the riders were seen coming
    const f = G.battlefield ? safe(() => G.battlefield(s, x, y, m.path, false), 'field') : null;
    const home = s.cities[m.from];
    const ae = G.armyEdge(s, m.owner, home && home.owner === m.owner ? home : null, m.units);
    const de = edgeOf(s, p, units, f);
    const attSent = { ...m.units };
    const r = G.battle(s, m.owner, { ...m.units }, ae.mult, p.owner, units, de.mult, 0, { mode: 'raid', x, y, path: m.path, field: f || undefined, hold: false,
      labels: [...ae.labels, ...de.labels], k: { att: {}, def: de.k } });
    applyLosses(s, p, units, r.defLeft);
    const kills = sum(r.attLost);
    p.stats.fights++; p.stats.kills += kills; xp(s, p, kills);
    const fname = G.fieldName ? G.fieldName(s, x, y) : `(${x}, ${y})`;
    const body = { att: me.name, def: `${nameOf(s, p.owner)} patrol (${p.name})`, A: r.A, D: r.D, attSent, defHad: units, attLost: r.attLost, defLost: r.defLost, loot: {}, tactics: r.tactics, field: { name: fname, x, y, mission: 'trade' } };
    if (!r.win) {
      p.stats.won++;
      // (when the patrol breaks, intercept.js fires the hostile hooks itself as the riders reach the caravan)
      if (s.empires[p.owner]) for (const h of G.hostileHooks) h(s, m.owner, p.owner, 'attack');
      G.protectorScore(s, p.owner, PT.pts.intercept);
      if (G.unitsCount(r.attLeft)) G.sendHome(s, { ...m, path: m.homePath || m.path, depart: 0, arrive: m.march || Math.max(15, m.arrive - m.depart) }, clean(r.attLeft), {});
      G.report(s, [m.owner, p.owner].filter(o => s.empires[o]), `🛡️ ${p.owner === 'p' ? 'Our' : `The ${nameOf(s, p.owner)}`} patrol on ${p.name} turned back ${m.owner === 'p' ? 'our' : `the ${me.name}`} interception at ${fname}`,
        p.owner === 'p' ? 'win' : m.owner === 'p' ? 'loss' : 'info', { ...body, extra: 'The patrol met the riders on the road before they reached the caravan, which travels on unharmed.' });
      if (p.owner === 'p') G.log(s, 'p', `🛡️ The patrol on ${p.name} beat off the ${me.name} at ${fname}; the caravan travels on.`, 'good');
      if (m.owner === 'p') G.log(s, 'p', `⚔️ The ${nameOf(s, p.owner)} patrol on ${p.name} turned our riders back at ${fname}.`, 'bad');
      return;
    }
    G.report(s, [m.owner, p.owner].filter(o => s.empires[o]), `🛡️ The patrol on ${p.name} was broken at ${fname}`, p.owner === 'p' ? 'loss' : m.owner === 'p' ? 'win' : 'info',
      { ...body, extra: 'The riders broke through the patrol and rode on for the caravan.' });
    if (p.owner === 'p') G.log(s, 'p', `🛡️ The ${me.name} broke our patrol on ${p.name} at ${fname} and ride on for the caravan.`, 'bad');
    m.units = clean(r.attLeft);
    if (!G.unitsCount(m.units)) return;
    return inner(s, m);
  };
  // AI interceptions (and the player's preview) see the patrol riding with a caravan on its road
  const withPatrols = (s, fn) => {
    const P = s && s.patrols;
    if (!P || !P.list || !P.list.length) return fn();
    const saved = [];
    try {
      for (const T of s.moves) {
        if (T.type !== 'trade') continue;
        const pos = G.movePos(s, T);
        const p = G.patrolCoverAt(s, T.owner, pos.x, pos.y);
        if (!p) continue;
        saved.push([T, T.units]);
        T.units = G.addUnits({ ...(T.units || {}) }, p.units);
      }
      return fn();
    } finally { for (const [T, u] of saved) T.units = u; }
  };
  G.patrolWithEscorts = withPatrols;
  let lateDone = false;
  const installLate = () => {
    if (lateDone) return;
    if (!G.moveHandlers.intercept || !G.aiIntercept) return;
    lateDone = true;
    const inner = G.moveHandlers.intercept;
    G.moveHandlers.intercept = (s, m) => meetIntercept(s, m, inner);
    const baseAI = G.aiIntercept;
    G.aiIntercept = (s, emp) => withPatrols(s, () => baseAI(s, emp));
    if (G.previewIntercept) { const basePrev = G.previewIntercept; G.previewIntercept = (s, city, T, units, orders, plan) => withPatrols(s, () => basePrev(s, city, T, units, orders, plan)); }
  };
  G.patrolInstall = installLate;
  G.stepHooks.push(() => { if (!lateDone) installLate(); });

  // -------------------------------------------------------------------
  // The Protector of the Trade
  // -------------------------------------------------------------------
  G.protector = s => st(s).prot;
  G.protectorScore = (s, owner, pts) => {
    if (!owner || !s.empires[owner] || s.empires[owner].dead || !(pts > 0)) return;
    const pr = st(s).prot;
    pr.score[owner] = (pr.score[owner] || 0) + pts;
  };
  const setRenown = (s, owner, n) => {
    const e = s.empires[owner];
    if (!e) return;
    e.renownBonus = (e.renownBonus || 0) + n;
  };
  G.protectorTick = (s, dtMin) => {
    const pr = st(s).prot;
    const k = Math.pow(0.5, dtMin / (PT.half * paceT(s)));
    for (const o of Object.keys(pr.score)) {
      if (!s.empires[o] || s.empires[o].dead) { delete pr.score[o]; continue; }
      pr.score[o] *= k;
      if (pr.score[o] < 0.05) delete pr.score[o];
    }
    // the holder lost its realm
    if (pr.holder && (!s.empires[pr.holder] || s.empires[pr.holder].dead)) { pr.holder = null; pr.renown = 0; }
    const ranked = Object.entries(pr.score).sort((a, b) => b[1] - a[1]);
    const hs = pr.holder ? pr.score[pr.holder] || 0 : 0;
    const top = ranked.find(([o]) => o !== pr.holder);
    const give = (o, why) => {
      const old = pr.holder;
      if (old) { setRenown(s, old, -(pr.renown || 0)); }
      pr.holder = o; pr.since = s.time; pr.contested = null;
      pr.renown = o ? PT.renown : 0;
      if (o) setRenown(s, o, PT.renown);
      if (o === 'p') G.log(s, 'p', `🛡️ You are hailed as Protector of the Trade${why ? ' ' + why : ''}: +${PT.renown} renown, +${Math.round(PT.income * 100)}% route income, and the merchant republics favour you.`, 'good');
      else if (old === 'p') G.log(s, 'p', `🛡️ ${o ? `The ${nameOf(s, o)} are now hailed as Protectors of the Trade` : 'No realm keeps the roads safe enough: the title of Protector of the Trade lapses'}. You lose its renown and favour.`, 'bad');
      else if (o) G.log(s, 'p', `🛡️ The ${nameOf(s, o)} are hailed as Protectors of the Trade.`, 'info');
    };
    if (!pr.holder) { if (top && top[1] >= PT.claim) give(top[0]); }
    else if (hs < PT.claim * PT.lapse && !(top && top[1] >= PT.claim)) give(null);
    else if (top && top[1] >= PT.claim && top[1] > hs * PT.take) give(top[0], `, taking the title from the ${nameOf(s, pr.holder)}`);
    else if (top && top[1] >= hs * PT.contest && top[1] >= PT.claim * PT.lapse) {
      if (pr.contested !== top[0]) {
        pr.contested = top[0];
        if (pr.holder === 'p') G.log(s, 'p', `🛡️ The ${nameOf(s, top[0])} contest your title of Protector of the Trade: keep your roads safe or lose it.`, 'warn');
        else if (top[0] === 'p') G.log(s, 'p', `🛡️ You contest the ${nameOf(s, pr.holder)}'s title of Protector of the Trade.`, 'info');
      }
    } else pr.contested = null;
    // merchant republics favour the Protector
    if (pr.holder && s.minors && G.minorAddInfluence) {
      for (const mi of Object.values(s.minors)) if (mi.kind === 'merchant' && !mi.subject) safe(() => G.minorAddInfluence(s, mi, pr.holder, PT.favour * dtMin / paceT(s)), 'favour');
    }
  };
  // camps cleared near a road count
  G.battleHooks.push((s, ctx) => {
    if (!ctx || ctx.site !== 'camp' || !ctx.r || !ctx.r.win || !ctx.m || !ctx.tile || !(ctx.defHad && ctx.defHad.brigand)) return;
    const t = ctx.tile, owner = ctx.m.owner;
    if (!s.empires[owner]) return;
    const nearRoad = (G.roadLevel && [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => G.roadLevel(s, t.x + dx, t.y + dy) >= 1))
      || (G.routes && G.routes(s).some(r => { const a = s.cities[r.from], b = placeOf(s, r.to.id); return a && b && segDist(t, a, b) <= 2; }));
    if (nearRoad) G.protectorScore(s, owner, PT.pts.camp);
  });
  const segDist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const f = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    return Math.hypot(p.x - a.x - f * dx, p.y - a.y - f * dy);
  };

  // -------------------------------------------------------------------
  // The slow tick: upkeep, lost bases, faster caravans, wear, watch score, the title
  // -------------------------------------------------------------------
  G.slowHooks.push((s, dtMin) => {
    if (!lateDone) installLate();
    if (!cliDone && G.cli) cliDone = G.patrolRegisterCli();
    const P = s.patrols;
    if (P && P.list && P.list.length) safe(() => tick(s, P, dtMin), 'tick');
    if (P && P.prot && (P.prot.holder || Object.keys(P.prot.score || {}).length)) safe(() => G.protectorTick(s, dtMin), 'title');
  });
  const tick = (s, P, dtMin) => {
    for (const p of [...P.list]) {
      const emp = s.empires[p.owner];
      if (!emp || emp.dead) { P.list = P.list.filter(x => x !== p); bump(s); continue; }
      const base = s.cities[p.base];
      if (!base || base.owner !== p.owner) {
        const cap = G.capital(s, p.owner);
        if (!cap) { P.list = P.list.filter(x => x !== p); bump(s); continue; }
        G.patrolRecall(s, p.id, p.owner, `lost its base ${base ? base.name : ''}`.trim());
        continue;
      }
      if (!G.unitsCount(p.units)) { G.patrolRecall(s, p.id, p.owner, 'was wiped out'); continue; }
      const g = generalOf(s, p);
      if (p.general && (!g || g.status !== 'patrolling')) p.general = null;
      // upkeep: grain from the base, gold from the treasury
      const up = G.patrolUpkeep(s, p);
      const grain = up.grain * dtMin, gold = up.gold * dtMin;
      const fed = (base.res.grain || 0) >= grain, paid = emp.gold >= gold;
      p.stats.paidGrain += Math.min(grain, base.res.grain || 0); p.stats.paidGold += Math.min(gold, Math.max(0, emp.gold));
      base.res.grain = Math.max(0, (base.res.grain || 0) - grain);
      emp.gold = Math.max(0, emp.gold - gold);
      if (!fed || !paid) {
        p.hungry = (p.hungry || 0) + dtMin;
        p.desert = (p.desert || 0) + G.unitsCount(p.units) * PT.desert * dtMin;
        while (p.desert >= 1) {
          const big = Object.entries(p.units).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0];
          if (!big) break;
          p.units[big[0]]--; if (!p.units[big[0]]) delete p.units[big[0]];
          p.desert -= 1; p.stats.lost++;
        }
        if (p.owner === 'p' && !(p.hungerToldAt > s.time - 120 * paceT(s))) { p.hungerToldAt = s.time; G.log(s, 'p', `🛡️ The patrol on ${p.name} goes ${!fed ? 'hungry' : 'unpaid'}: troops are deserting.`, 'warn'); }
      } else p.hungry = 0;
      if (!ready(s, p)) continue;
      if (!p.onStation) {
        p.onStation = 1; bump(s);
        if (p.owner === 'p') { G.log(s, 'p', `🛡️ The patrol on ${p.name} is on station.`, 'info'); for (let i = 0; i < p.path.length; i += 2) G.reveal(s, p.path[i][0], p.path[i][1], 1); }
      }
      // the watch: realms keeping a dangerous road earn a little every minute
      if (((p.watchAt || 0) <= s.time)) {
        p.watchAt = s.time + 60 * paceT(s);
        const a = placeOf(s, p.from), b = placeOf(s, p.to);
        if (a && b) { const th = threatsAlong(s, p.owner, a, b); p.threat = Math.round(th.threat); if (th.threat > 0 || th.war) G.protectorScore(s, p.owner, PT.pts.watch); }
      }
      // wear: the patrol walks its road
      if ((p.wearAt || 0) <= s.time) {
        p.wearAt = s.time + PT.wearEvery * 60 * paceT(s);
        if (G.roadsWear && p.since < s.time - 5) safe(() => G.roadsWear(s, { owner: p.owner, type: 'patrol', path: p.path, fx: p.path[0][0], fy: p.path[0][1], x: p.path[p.path.length - 1][0], y: p.path[p.path.length - 1][1] }, PT.wear), 'wear');
      }
    }
    // caravans and supply carts on a watched road: a little faster, once, as they set out
    const owners = new Set(P.list.map(p => p.owner));
    for (const m of s.moves) {
      if (m.type !== 'trade' || m.ptSped || m.naval || !owners.has(m.owner)) continue;
      if (s.time - m.depart > 60) { m.ptSped = 1; continue; }
      m.ptSped = 1;
      const cov = G.patrolCovers(s, m);
      if (!cov.share) continue;
      m.ptCov = Math.round(cov.share * 100) / 100; m.ptBy = cov.patrol.id;
      const k = PT.speed * cov.share + (hasTrait(s, cov.patrol, 'swift') ? PT.speedSwift * cov.share : 0);
      const dur = m.arrive - m.depart;
      m.arrive = Math.max(s.time + 1, Math.round(m.depart + dur * (1 - k)));
    }
  };

  // -------------------------------------------------------------------
  // AI: patrol their own dangerous routes; recall when home is threatened
  // -------------------------------------------------------------------
  const threatened = (s, city) => s.moves.some(m => ['raid', 'attack', 'conquer'].includes(m.type) && m.owner !== city.owner && m.x === city.x && m.y === city.y);
  const fieldPower = (s, owner, units) => G.atkPower(s, owner, fieldUnitsOf(s, owner, units)) + G.defPower(s, owner, fieldUnitsOf(s, owner, units));
  G.aiPatrol = (s, emp) => {
    const owner = emp.id;
    const mine = G.patrolsOf(s, owner);
    // recall: a threatened base, a road no route uses any more, a road gone quiet
    for (const p of mine) {
      const base = s.cities[p.base];
      const used = (G.routes ? G.routes(s) : []).some(r => r.owner === owner && (r.id === p.route || (r.from === p.from && r.to.id === p.to)));
      if (!base || threatened(s, base) || !used || (p.threat === 0 && s.time - p.since > 40 * 60 * paceT(s))) { G.patrolRecall(s, p.id, owner); return 'recall'; }
    }
    if (mine.length >= Math.min(PT.aiMax, 1 + Math.floor(G.citiesOf(s, owner).length / PT.aiPer))) return null;
    for (const sg of G.patrolPlan(s, owner)) {
      if (!sg.enough || !sg.slot) continue;
      const base = s.cities[sg.base];
      if (!base || threatened(s, base)) continue;
      const before = fieldPower(s, owner, base.units);
      if (before < PT.aiMinPower) continue;
      const after = before - fieldPower(s, owner, sg.units);
      if (after < before * PT.aiKeep) continue;
      const r = G.patrolCreate(s, owner, { route: sg.route, units: sg.units });
      if (typeof r !== 'string') return r;
    }
    return null;
  };
  G.aiHooks.push((s, emp, dtMin) => {
    if (emp.id === 'p' || emp.dead || s.gameOver) return;
    emp.ptClock = (emp.ptClock || 0) + dtMin;
    if (emp.ptClock < PT.aiEvery * paceT(s)) return;
    emp.ptClock = 0;
    if (!(G.routes ? G.routes(s) : []).some(r => r.owner === emp.id) && !(s.patrols && s.patrols.list.some(p => p.owner === emp.id))) return;
    safe(() => G.aiPatrol(s, emp), 'ai');
  });

  // -------------------------------------------------------------------
  // Saves: sanitize on load (old saves have no s.patrols and get one lazily)
  // -------------------------------------------------------------------
  {
    const baseMigrate = G.migrate;
    G.migrate = s => {
      const o = baseMigrate(s);
      const t = o || s;
      if (t && t.patrols) {
        const P = st(t);
        P.list = P.list.filter(p => p && p.id && t.empires[p.owner] && Array.isArray(p.path) && p.path.length >= 1);
        for (const p of P.list) {
          p.units = clean(p.units);
          p.stats = Object.assign({ deterred: 0, fights: 0, won: 0, kills: 0, lost: 0, protected: 0, paidGrain: 0, paidGold: 0 }, p.stats || {});
          if (!p.len) p.len = Math.max(1, plen(p.path));
        }
      }
      return o;
    };
  }

  // -------------------------------------------------------------------
  // Keyboard console: patrol, patrols, recall patrol N
  // -------------------------------------------------------------------
  const unitsText = units => Object.entries(units || {}).filter(([, n]) => n > 0).map(([u, n]) => `${n} ${DATA.units[u] ? DATA.units[u].name : u}`).join(', ') || 'none';
  const parseUnits = (s, owner, city, str) => {
    str = String(str || '').trim();
    const pool = fieldUnitsOf(s, owner, city.units);
    if (!str || /^all$/i.test(str)) return pool;
    if (/^half$/i.test(str)) return Object.fromEntries(Object.entries(pool).map(([u, n]) => [u, Math.floor(n / 2)]).filter(([, n]) => n > 0));
    const out = {};
    const here = Object.keys(pool).map(id => ({ id, name: DATA.units[id].name }));
    for (const part of str.split(/\s*(?:,|\band\b|\+)\s*/i).filter(Boolean)) {
      const mm = /^(\d+|all|half)\s+(.+)$/i.exec(part) || /^(.+?)\s+(\d+)$/.exec(part);
      let n, name;
      if (mm && /^(\d+|all|half)$/i.test(mm[1])) { n = mm[1].toLowerCase(); name = mm[2]; } else if (mm) { name = mm[1]; n = mm[2]; } else { name = part; n = 'all'; }
      const r = G.cli.match(name, here);
      if (!r.hit) throw new Error(`No field troops called '${name}' in ${city.name} (there: ${unitsText(pool)}).`);
      const u = r.hit.id, have = pool[u] || 0;
      const k = n === 'all' ? have : n === 'half' ? Math.floor(have / 2) : parseInt(n, 10);
      if (!(k > 0) || k > have) throw new Error(`Only ${have} ${DATA.units[u].name} in ${city.name}.`);
      out[u] = (out[u] || 0) + k;
    }
    return out;
  };
  const placeItems = (s, owner) => {
    const out = G.citiesOf(s, owner).map(c => ({ id: c.id, name: c.name }));
    for (const c of Object.values(s.cities)) if (c.owner !== owner && s.explored[c.y * s.map + c.x]) out.push({ id: c.id, name: c.name });
    for (const mi of Object.values(s.minors || {})) if (s.explored[mi.y * s.map + mi.x]) out.push({ id: mi.id, name: mi.name });
    return out;
  };
  const resolve = (raw, items, what) => {
    const r = G.cli.match(raw, items);
    if (r.hit) return r.hit;
    if (r.amb) throw new Error(`'${raw}' could be ${r.amb.slice(0, 5).map(x => x.name).join(', ')} — be more specific.`);
    throw new Error(`No ${what} called '${raw}'.`);
  };
  const levelWord = rk => `${LEVELS[rk.level].icon} ${LEVELS[rk.level].name}`;
  const cliCmds = () => [
    { name: 'patrol', aliases: ['guard'], group: 'Military', usage: 'patrol <route #|from A to B> <units> [general X]', help: 'Station troops on a road as a standing patrol: fewer ambushes, interceptions meet the patrol first.', tab: 'military',
      ex: ['patrol 1 40 militia', 'patrol from Oakford to Ashby 30 pikemen, 10 crossbowmen general Aldous', 'patrol 2 all'],
      run(s, owner, a, ctx) {
        try {
          let rest = a.rest || '';
          let gen = null;
          const gi = rest.search(/\s+general\s+/i);
          if (gi >= 0) { gen = rest.slice(gi).replace(/^\s+general\s+/i, '').trim(); rest = rest.slice(0, gi); }
          let opts = {}, unitsStr = '';
          const fm = /^from\s+(.+?)\s+to\s+(.+)$/i.exec(rest.trim());
          if (fm) {
            const items = placeItems(s, owner);
            // the destination may run on into the units: try the longest place name that matches
            const words = fm[2].split(/\s+/);
            let to = null, k = words.length;
            for (; k >= 1; k--) { const r = G.cli.match(words.slice(0, k).join(' '), items); if (r.hit) { to = r.hit; break; } }
            if (!to) throw new Error(`No place you know called '${fm[2]}'.`);
            const from = resolve(fm[1], items, 'place');
            opts = { from: from.id, to: to.id };
            unitsStr = words.slice(k).join(' ');
          } else {
            const t = rest.trim().split(/\s+/);
            if (!t[0]) {
              const plan = G.patrolPlan(s, owner);
              const rs = G.patrolRoutes(s, owner);
              return { out: ['Usage: patrol <route #|from A to B> <units> [general X]', ...rs.map(({ r, risk }, i) => `  #${i + 1} ${placeName(s, r.from)} → ${placeName(s, r.to.id)}  ${levelWord(risk)} (${Math.round(risk.chance * 100)}%)`),
                ...(plan.length ? [`Suggested: patrol ${rs.findIndex(x => x.r.id === plan[0].route) + 1} ${unitsText(plan[0].units)}`] : [])] };
            }
            const rs = G.patrolRoutes(s, owner);
            const n = parseInt(t[0].replace(/^#/, ''), 10);
            let r = n > 0 ? (rs[n - 1] || {}).r : null;
            if (!r) {
              const items = rs.map(({ r: x }) => ({ id: x.id, name: `${placeName(s, x.from)} to ${placeName(s, x.to.id)}`, alt: [placeName(s, x.to.id)] }));
              const hit = G.cli.match(t[0], items);
              if (!hit.hit) throw new Error(`No route #${t[0]}. Type 'patrols' for your routes.`);
              r = G.routeById(s, hit.hit.id);
            }
            opts = { route: r.id };
            unitsStr = t.slice(1).join(' ');
          }
          const a0 = placeOf(s, opts.route ? G.routeById(s, opts.route).from : opts.from), b0 = placeOf(s, opts.route ? G.routeById(s, opts.route).to.id : opts.to);
          // the base: the city you are looking at when it is one end, else the first end that is yours, else the nearest city
          const own = [a0, b0].filter(x => x && x.owner === owner && s.cities[x.id]);
          const cur = ctx && ctx.city && own.find(x => x.id === ctx.city);
          const base = cur || own[0] || G.citiesOf(s, owner).sort((x, y) => dist(x, a0) - dist(y, a0))[0];
          if (!base) throw new Error('No city to send them from.');
          opts.base = base.id;
          opts.units = parseUnits(s, owner, base, unitsStr);
          if (gen) opts.general = resolve(gen, (G.generalsOf ? G.generalsOf(s, owner) : []).map(g => ({ id: g.id, name: g.name })), 'general').id;
          const p = G.patrolCreate(s, owner, opts);
          if (typeof p === 'string') return { ok: false, err: p };
          const up = G.patrolUpkeep(s, p);
          return { out: [`🛡 ${unitsText(p.units)} from ${base.name} patrol ${p.name} (${p.len} tiles)${p.general ? ` under ${G.generalById(s, owner, p.general).name}` : ''}; on station in ${Math.max(0, Math.round((p.readyAt - s.time) / 60))} min. Upkeep ${up.grain.toFixed(1)} grain + ${up.gold.toFixed(1)} gold a minute.`], nav: { tab: 'military' } };
        } catch (e) { return { ok: false, err: e.message }; }
      } },
    { name: 'patrols', group: 'Military', usage: 'patrols', help: 'Your patrols and the risk on every trade route; who holds the title of Protector of the Trade.', tab: 'military',
      ex: ['patrols'],
      run(s, owner) {
        const ps = G.patrolsOf(s, owner), pr = G.protector(s);
        const out = [];
        out.push(ps.length ? `Patrols (${ps.length}/${maxPatrols(s, owner)}):` : `No patrols (you may field ${maxPatrols(s, owner)}).`);
        ps.forEach((p, i) => { const up = G.patrolUpkeep(s, p); out.push(`  ${i + 1}. ${p.name} · ${unitsText(p.units)}${p.general ? ' · ' + G.generalById(s, owner, p.general).name : ''} · ${ready(s, p) ? 'on station' : 'marching out'} · deterred ${p.stats.deterred}, won ${p.stats.won}/${p.stats.fights}, lost ${p.stats.lost} · ${up.grain.toFixed(1)} grain + ${up.gold.toFixed(1)} gold/min`); });
        const rs = G.patrolRoutes(s, owner);
        if (rs.length) { out.push('Routes:'); rs.forEach(({ r, risk }, i) => out.push(`  #${i + 1} ${placeName(s, r.from)} → ${placeName(s, r.to.id)}  ${levelWord(risk)} ${Math.round(risk.chance * 100)}%${risk.threat ? ` · threat ${risk.threat} vs guard ${risk.guard}` : ''}`)); }
        out.push(`Protector of the Trade: ${pr.holder ? (pr.holder === owner ? 'you' : 'the ' + nameOf(s, pr.holder)) : 'nobody'}${pr.contested ? ` (contested by ${pr.contested === owner ? 'you' : 'the ' + nameOf(s, pr.contested)})` : ''} · your score ${Math.round(pr.score[owner] || 0)} (claim at ${PT.claim})`);
        return { out, nav: { tab: 'military' } };
      } },
  ];
  let cliDone = false;
  G.patrolRegisterCli = () => {
    if (!G.cli || !Array.isArray(G.cli.commands)) return false;
    for (const c of cliCmds()) if (!G.cli.commands.some(x => x.name === c.name)) G.cli.commands.push(c);
    // 'recall patrol N' rides on the existing recall command
    const rc = G.cli.commands.find(x => x.name === 'recall');
    if (rc && !rc._patrol) {
      const baseRun = rc.run;
      rc.run = function (s, owner, a, ctx) {
        const t = a.tokens || [];
        if (/^patrols?$/i.test(t[0] || '')) {
          const ps = G.patrolsOf(s, owner);
          const n = parseInt(String(t[1] || '').replace(/^#/, ''), 10);
          const p = ps[n - 1];
          if (!p) return { ok: false, err: ps.length ? `No patrol #${t[1] || ''}: you have ${ps.length} (type 'patrols').` : 'You have no patrols.' };
          const e = G.patrolRecall(s, p.id, owner);
          return e ? { ok: false, err: e } : [`↩ The patrol on ${p.name} marches home.`];
        }
        return baseRun.call(this, s, owner, a, ctx);
      };
      rc.usage = (rc.usage || 'recall <#>') + ' | recall patrol <N>';
      rc._patrol = true;
    }
    return true;
  };
  G.newGameHooks.push(s => { st(s); });
})();
