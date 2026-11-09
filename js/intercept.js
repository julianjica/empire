// =====================================================================
//  Field battles: intercepting columns on the march.
//
//  Any march on the map (armies, raids, conquests, reinforcements,
//  settlers, caravans, scouts, ships) can be met in the open field by a
//  force sent from one of your cities. The interceptor marches to the
//  earliest point of the target's remaining road it can reach no later
//  than the target does, waits there, and the two fight where they meet:
//  no walls, the ground of that tile, stances, generals, heroes and
//  battle mages as in any other battle (raid-style casualties: the loser
//  routs instead of being wiped out).
//
//  State: new move type 'intercept' with
//    m.target   id of the column being intercepted
//    m.march    the marching time from home (the way back takes as long)
//    m.homePath the road home (after a re-target, both legs)
//    m.retargeted  1 once it has followed a changed course
//  Moves made by G.sendHome carry m.via = the id of the march they came
//  from, so an interceptor can follow a column that turned home.
//  A column that won its field battle carries m.delayed (seconds lost).
//  Old saves have none of this and load as they are.
//
//  War magi (js/magi.js) ride with interceptions like any hostile march
//  and fight in the field battle: duels, casts and counters against the
//  magi riding with the column. Battle previews show the magic expected.
//
//  Roaming monsters (js/monsters.js) on the move can be intercepted too:
//  the troops wait where the creature's trail crosses theirs, and the
//  meeting is resolved as a hunt (m.monster: the hunt's tracking — follow
//  fresh tracks once, or a cold trail). A resting creature has no road to
//  cut across: the hunt (Attack/Raid on its tile) is the way.
//
//  A caravan of yours taken by a rival gets a report of its own.
//
//  API: G.canIntercept, G.interceptPlan, G.sendIntercept, G.previewIntercept,
//       G.recallMove, G.columnIntel, G.columnSide, G.fieldName, G.aiIntercept,
//       G.interceptTarget (a column or a roaming monster by id)
//  Ships intercept ships at sea (and fliers can reach them); land armies
//  meet columns on land only.
// =====================================================================
'use strict';
(() => {
  const IC = {
    catch: 1.75,          // tiles: the target must be this close to the meeting point when the interceptor gets there
    delay: 0.06,          // a column that wins loses this share of its journey, in time
    delayMin: 20, delayMax: 240,
    closeR: 2.6,          // tiles from your cities or columns at which a foreign column is watched closely
    aiEvery: 1.5,         // AI looks for columns to intercept every this many game minutes (× pace)
    aiRatio: 1.7,         // AI intercepts only when this much stronger in the field
    aiKeep: 0.3,          // and leaves this share of each unit type at home
    aiCaravan: 250,       // a caravan worth intercepting carries at least this much
    aiCities: 3,          // AI tries its few nearest cities only
  };
  G.IC = IC;
  const HOSTILE = { raid: 1, attack: 1, conquer: 1, burn: 1 };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const sum = o => Object.values(o || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const clean = u => Object.fromEntries(Object.entries(u || {}).map(([k, n]) => [k, Math.floor(n)]).filter(([k, n]) => n > 0 && DATA.units[k]));
  const findMove = (s, id) => (s.moves || []).find(m => m.id === id) || null;
  // roaming monsters have the shape of a march (fx, fy, x, y, path, depart, arrive)
  const monsterOf = (s, T) => T && T.kind && s.monsters && s.monsters[T.id] === T ? T : null;
  const monKind = mon => (DATA.monsterKinds && DATA.monsterKinds[mon.kind]) || { name: 'creatures', move: 'land' };
  const lcName = mon => monKind(mon).name.replace(/^The /, 'the ').toLowerCase();
  const atSeaOf = (s, T) => !!T.naval || (!!monsterOf(s, T) && monKind(T).move === 'sea');
  G.interceptTarget = (s, id) => findMove(s, id) || (s.monsters && s.monsters[id]) || null;
  const isShip = u => DATA.units[u] && DATA.units[u].type === 'ship';
  const PT = s => G.pace(s).time;

  // ---- who may intercept whom ----
  // returns an error text, or null when allowed
  G.canIntercept = (s, owner, T) => {
    if (monsterOf(s, T)) {
      if (!s.empires[owner] || s.empires[owner].dead) return 'No realm';
      if (!G.unitsCount(T.units)) return 'The creatures are gone';
      if (T.arrive <= s.time + 1) return `The ${lcName(T)} is not on the move: there is no road to cut across. Hunt it where it stands (Attack or Raid)`;
      return null;
    }
    if (!T || !s.moves.includes(T)) return 'That column is no longer on the road';
    if (T.owner === owner) return 'That is your own column';
    if (!s.empires[owner] || s.empires[owner].dead) return 'No realm';
    const other = s.empires[T.owner];
    if (!other) return null;                       // brigands and wild things: always
    if (other.dead) return 'That realm has fallen';
    if (G.liegeOf && (G.liegeOf(s, owner) === T.owner || G.liegeOf(s, T.owner) === owner)) return `The ${other.name} are bound to you by fealty`;
    const st = G.statusOf ? G.statusOf(s, owner, T.owner) : 'war';
    if (st === 'alliance') return `The ${other.name} are your allies`;
    if (G.hasTreaty && (G.hasTreaty(s, owner, T.owner, 'alliance') || G.hasTreaty(s, owner, T.owner, 'defense'))) return `A pact binds you to the ${other.name}`;
    if (owner !== 'p' && st !== 'war') return 'Not at war';
    return null;
  };
  // how a column looks to a viewer: 'own' | 'ally' | 'hostile' | 'neutral'
  G.columnSide = (s, viewer, m) => {
    if (m.owner === viewer) return 'own';
    if (!s.empires[m.owner]) return 'hostile';
    const st = G.statusOf ? G.statusOf(s, viewer, m.owner) : 'neutral';
    if (st === 'war') return 'hostile';
    if (st === 'alliance' || (G.liegeOf && (G.liegeOf(s, viewer) === m.owner || G.liegeOf(s, m.owner) === viewer))) return 'ally';
    const t = G.tileAt(s, m.x, m.y), c = t && t.city && s.cities[t.city];
    if (HOSTILE[m.type] && c && c.owner === viewer) return 'hostile';
    return 'neutral';
  };

  // ---- the road of a column: its vertices with the time it passes each ----
  const roadOf = m => {
    if (m.path && m.path.length >= 2) return m.path.map(p => [p[0], p[1]]);
    const n = Math.max(1, Math.ceil(Math.hypot(m.x - m.fx, m.y - m.fy)));
    const out = [];
    for (let i = 0; i <= n; i++) out.push([m.fx + (m.x - m.fx) * i / n, m.fy + (m.y - m.fy) * i / n]);
    return out;
  };
  const timeline = m => {
    const road = roadOf(m), out = [];
    let total = 0; const cum = [0];
    for (let i = 1; i < road.length; i++) { total += Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]); cum.push(total); }
    const span = Math.max(1, m.arrive - m.depart);
    for (let i = 0; i < road.length; i++) out.push({ i, x: road[i][0], y: road[i][1], t: m.depart + (total ? cum[i] / total : 1) * span, last: i === road.length - 1 });
    return out;
  };
  G.columnTimeline = timeline;
  // the part of a column's road already travelled, ending where it stands now
  const travelled = (s, m) => {
    const road = roadOf(m), p = G.movePos(s, m);
    const f = clamp((s.time - m.depart) / Math.max(1, m.arrive - m.depart), 0, 1);
    let total = 0; const seg = [];
    for (let i = 1; i < road.length; i++) { const l = Math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]); seg.push(l); total += l; }
    let d = f * total; const out = [road[0]];
    for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) break; d -= seg[i]; out.push(road[i + 1]); }
    out.push([p.x, p.y]);
    return { path: out, pos: p };
  };
  G.columnTravelled = travelled;

  // ---- names for the battlefield ----
  const nearestPlace = (s, x, y) => {
    let best = null, bd = 7;
    for (const c of Object.values(s.cities)) { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c.name; } }
    if (s.minors) for (const mi of Object.values(s.minors)) { const d = Math.hypot(mi.x - x, mi.y - y); if (d < bd) { bd = d; best = mi.name; } }
    return best;
  };
  G.fieldName = (s, x, y, crossing) => {
    const t = G.tileAt(s, Math.round(x), Math.round(y));
    const place = nearestPlace(s, x, y);
    const terr = t ? t.terrain : 'plains';
    const river = !G.isWater(t) && (crossing || (t && G.riverSet && G.riverSet(s).has(t.y * s.map + t.x)));
    const word = river ? 'the Ford' : { forest: 'the Woods', hills: 'the Heights', mountain: 'the Pass', fertile: 'the Fields', plains: 'the Plain', lake: 'the Waters' }[terr] || 'the Field';
    if (place) return `${word} ${terr === 'lake' && !river ? 'off' : 'of'} ${place}`;
    return `${word} at (${Math.round(x)}, ${Math.round(y)})`;
  };
  const destName = (s, m) => {
    if (monsterOf(s, m)) return `(${m.x}, ${m.y})`;
    const t = G.tileAt(s, m.x, m.y);
    if (t && t.city && s.cities[t.city]) return s.cities[t.city].name;
    if (t && t.minor && s.minors && s.minors[t.minor]) return s.minors[t.minor].name;
    return `(${m.x}, ${m.y})`;
  };

  // ---- the meeting point ----
  // from: a city (or any {x, y}); units: the interceptors; orders: { stance, general } (march speed)
  // returns { ok, x, y, at, dur, wait, path, naval, terrain, river, name } or { ok:false, reason }
  G.interceptPlan = (s, owner, from, T, units, orders, opt) => {
    const err = G.canIntercept(s, owner, T);
    if (err) return { ok: false, reason: err };
    units = clean(units);
    if (!G.unitsCount(units)) return { ok: false, reason: 'Select some troops' };
    if (T.arrive <= s.time + 1) return { ok: false, reason: `They are already at ${destName(s, T)}` };
    const present = Object.keys(units);
    const ships = present.some(isShip), fly = present.every(u => DATA.units[u].flying);
    const atSea = atSeaOf(s, T);
    if (atSea && !ships && !fly) return { ok: false, reason: 'They sail by sea: only ships (or fliers) can meet them' };
    if (!atSea && ships) return { ok: false, reason: 'Ships cannot fight a column on land: send land troops' };
    const fct = orders && G.marchFactor ? G.marchFactor(s, owner, orders) : 1;
    const stride = (opt && opt.stride) || 1;
    const tl = timeline(T);
    let late = Infinity, cands = 0, routed = 0;
    for (let k = 0; k < tl.length; k++) {
      const v = tl[k];
      if (v.last || v.t <= s.time + 2 || v.t >= T.arrive - 1) continue;
      if (stride > 1 && k % stride && !tl[k + 1].last) continue;
      const tx = Math.round(v.x), ty = Math.round(v.y), tile = G.tileAt(s, tx, ty);
      if (!tile || tile.city || tile.minor || (G.cityAtTile && G.cityAtTile(s, tx, ty))) continue;   // city cores and their quarters
      const water = G.isWater(tile);
      if (water && !ships && !fly) continue;
      if (!water && ships) continue;
      if (tile.x === from.x && tile.y === from.y) continue;
      cands++;
      const pl = G.planMarch(s, owner, from, tile, units);
      if (!pl.ok) continue;
      routed++;
      const dur = Math.max(15, Math.round(pl.dur / fct));
      const slack = v.t - (s.time + dur);
      if (slack >= 0) {
        const f = G.battlefield ? G.battlefield(s, tx, ty, pl.path, pl.naval) : null;
        return { ok: true, x: tx, y: ty, at: Math.round(v.t), dur, wait: Math.round(slack), path: pl.path, naval: !!pl.naval, terrain: tile.terrain,
          river: !!(f && (f.river || f.crossing)), name: G.fieldName(s, tx, ty, f && f.crossing), vertex: v.i, arriveAt: T.arrive };
      }
      late = Math.min(late, -slack);
    }
    if (cands && !routed) return { ok: false, reason: atSea ? 'No sea route reaches their course' : 'No road from here reaches their route' };
    return { ok: false, reason: `Too slow — they reach ${destName(s, T)} first`, late: Math.round(late) };
  };

  // the casualty shaping of a marching column's own stance and general, as the defending side of a field battle
  const mulK = (into, k) => {
    for (const key of ['loss', 'foeLoss', 'volley', 'pursuit']) if (k[key] !== undefined) into[key] = (into[key] ?? 1) * k[key];
    if (k.cap !== undefined) into.cap = Math.min(into.cap ?? 1, k.cap);
    return into;
  };
  const columnEdge = (s, T, units, f) => {
    const home = s.cities[T.from];
    const e = G.armyEdge(s, T.owner, home && home.owner === T.owner ? home : null, units);
    const labels = e.labels.map(l => ({ ...l, side: 'def' }));
    let mult = e.mult; const k = {};
    if (G.stanceEdge && T.stance && T.stance !== 'balanced' && DATA.stances && DATA.stances[T.stance]) {
      const se = G.stanceEdge(s, T.owner, T.stance, units, 'att', false);
      for (const l of se.labels) labels.push({ ...l, side: 'def' });
      mult *= se.mult; mulK(k, se.k || {});
    }
    const g = T.general && G.generalById ? G.generalById(s, T.owner, T.general) : null;
    if (g && G.generalEdge) {
      const ge = G.generalEdge(s, T.owner, g, units, 'def', f, 'raid', null);
      labels.push(...ge.labels); mult *= ge.mult; mulK(k, ge.k || {});
    }
    return { mult, labels, k };
  };
  // real: a battle that is being fought (not an estimate): the magi riding with the column defend it
  const fieldBattle = (s, owner, home, units, T, defUnits, x, y, path, naval, real) => {
    const f = G.battlefield(s, x, y, path, naval);
    const edge = G.armyEdge(s, owner, home, units);
    if (monsterOf(s, T))   // a creature on its trail: no stance, general or walls, fought to the end as a hunt is
      return G.battle(s, owner, units, edge.mult, null, defUnits, 1, 0, { mode: 'attack', x, y, path, naval, field: f, hold: false, labels: edge.labels });
    const ce = columnEdge(s, T, defUnits, f);
    return G.battle(s, owner, units, edge.mult, s.empires[T.owner] ? T.owner : null, defUnits, ce.mult, 0,
      { mode: 'raid', x, y, path, naval, field: f, hold: false, labels: [...edge.labels, ...ce.labels], k: { att: {}, def: ce.k }, defMove: real ? T : undefined });
  };

  // ---- what a viewer knows of a column (size bands, mission, destination, general) ----
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const sig2 = v => { if (v < 20) return Math.max(1, Math.round(v)); const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
  const sizeWord = n => n < 15 ? 'a small band' : n < 50 ? 'a warband' : n < 150 ? 'a large host' : n < 400 ? 'a great army' : 'a vast horde';
  const MISSION = { raid: 'raid', attack: 'assault', conquer: 'conquest', settle: 'settlers', reinforce: 'reinforcements', trade: 'caravan', return: 'returning home', scout: 'scouts', adventure: 'hero\'s adventure', intercept: 'interception', preach: 'preachers', burn: 'raid on a quarter' };
  const COARSE = { raid: 'war host', attack: 'war host', conquer: 'war host', intercept: 'war host', reinforce: 'war host', adventure: 'war host', settle: 'settlers', trade: 'caravan', return: 'returning column', scout: 'scouts', preach: 'preachers', burn: 'war host' };
  G.missionName = type => MISSION[type] || type;
  const freshIntel = (s, viewer, m) => {
    const home = s.cities[m.from];
    if (!home) return false;
    const lim = 1800 * PT(s);
    const it = viewer === 'p' && s.intel && s.intel[G.tileIdx(s, home)];
    if (it && s.time - it.t < lim) return true;
    const d = s.espionage && s.espionage.dossiers && s.espionage.dossiers[viewer] && s.espionage.dossiers[viewer][home.id];
    return !!(d && s.time - d.t < lim);
  };
  // vis: the viewer's visible set (player only, optional)
  G.columnIntel = (s, viewer, m, vis) => {
    const n = G.unitsCount(m.units);
    const out = { side: G.columnSide(s, viewer, m), count: n };
    if (m.owner === viewer) return { ...out, level: 'own', exact: true, approx: n, lo: n, hi: n, word: sizeWord(n), mission: G.missionName(m.type), dest: true, general: m.general || null, known: true };
    const p = G.movePos(s, m);
    let close = false;
    for (const c of G.citiesOf(s, viewer)) if (dist(c, p) <= IC.closeR + (G.visionRadius ? Math.max(0, G.visionRadius(s, c) - 3) * 0.5 : 0)) { close = true; break; }
    if (!close) for (const o of s.moves) if (o.owner === viewer && dist(G.movePos(s, o), p) <= IC.closeR) { close = true; break; }
    const spied = freshIntel(s, viewer, m);
    const t = G.tileAt(s, m.x, m.y), tc = t && t.city && s.cities[t.city];
    const atUs = !!(tc && tc.owner === viewer);
    let seen = true;
    if (vis) { const N = s.map; const i = clamp(Math.round(p.y), 0, N - 1) * N + clamp(Math.round(p.x), 0, N - 1); seen = !!vis[i]; }
    const level = close || spied ? 'close' : seen ? 'seen' : atUs ? 'reported' : 'unseen';
    const err = level === 'close' ? 0.1 : 0.3;
    const noise = (hash(String(m.id) + ':' + level) * 2 - 1) * 0.4 * err;
    const approx = n ? sig2(n * (1 + noise)) : 0;
    const lo = n ? Math.max(1, Math.floor(approx * (1 - err) / 1.06)) : 0, hi = n ? Math.ceil(approx * (1 + err) * 1.06) : 0;
    return { ...out, level, exact: false, approx, lo, hi, word: n ? sizeWord(approx) : 'no escort',
      mission: level === 'close' || (atUs && HOSTILE[m.type]) ? G.missionName(m.type) : COARSE[m.type] || 'column',
      dest: level === 'close' || atUs, general: level === 'close' ? (m.general || null) : null, known: level !== 'unseen' };
  };

  // ---- sending ----
  G.sendIntercept = (s, fromId, targetId, units, orders) => {
    const city = s.cities[fromId];
    if (!city) return 'No such city';
    const owner = city.owner, T = G.interceptTarget(s, targetId);
    if (!T) return 'That column is no longer on the road';
    const mon = monsterOf(s, T);
    const sent = {};
    for (const [u, n] of Object.entries(units || {})) {
      const k = Math.floor(n);
      if (k > 0) { if ((city.units[u] || 0) < k) return 'Not enough ' + (DATA.units[u] ? DATA.units[u].name : u); sent[u] = k; }
    }
    if (!G.unitsCount(sent)) return 'Select some troops';
    for (const u of ['settlers', 'herald']) if (sent[u]) return `${DATA.units[u].name} do not fight in the field`;
    if (sent.hero && G.heroCanMarch) { const e = G.heroCanMarch(s, owner); if (e) return e; }
    orders = orders || {};
    if (orders.stance && (!DATA.stances || !DATA.stances[orders.stance])) return 'Unknown stance';
    if (orders.general) {
      if (!G.generalAvailable) return 'No generals';
      const e = G.generalAvailable(s, owner, orders.general, fromId);
      if (e) return e;
    }
    const plan = G.interceptPlan(s, owner, city, T, sent, orders);
    if (!plan.ok) return plan.reason;
    for (const [u, k] of Object.entries(sent)) city.units[u] -= k;
    const m = { id: G.newId(s, 'm'), owner, type: 'intercept', from: city.id, fx: city.x, fy: city.y, x: plan.x, y: plan.y, path: plan.path, naval: plan.naval,
      units: sent, cargo: {}, depart: s.time, arrive: plan.at, target: T.id, march: plan.dur };
    if (orders.stance && orders.stance !== 'balanced') m.stance = orders.stance;
    if (mon) { m.monster = mon.id; m.mkind = mon.kind; }   // resolved as a hunt (js/monsters.js): the same tracking
    const g = orders.general ? G.generalById(s, owner, orders.general) : null;
    if (g) { m.general = g.id; g.status = 'marching'; g.move = m.id; g.city = null; }
    s.moves.push(m);
    if (G.magiRide) G.magiRide(s, m);
    if (owner === 'p') G.log(s, 'p', mon ? `🛡️ Hunters ride from ${city.name} to lie in wait for the ${lcName(mon)} at ${plan.name}.`
      : `🛡️ Troops ride from ${city.name} to meet the ${s.empires[T.owner] ? s.empires[T.owner].name + '\'s ' : ''}${G.missionName(T.type)} at ${plan.name}.`, 'info');
    return null;
  };

  // expected outcome; the player sees foreign columns only as well as they know them
  G.previewIntercept = (s, city, T, units, orders, plan) => {
    units = clean(units);
    if (!T || !G.unitsCount(units)) return null;
    plan = plan || G.interceptPlan(s, city.owner, city, T, units, orders);
    if (!plan.ok) return null;
    const mon = monsterOf(s, T);
    let def = { ...T.units }, exact = true, foeMagi = [];
    if (mon) {
      const n = G.unitsCount(def), est = G.monsterEstimate ? G.monsterEstimate(mon) : n;
      if (n && est !== n) def = Object.fromEntries(Object.entries(def).map(([u, c]) => [u, Math.max(1, Math.round(c * est / n))]));
      exact = false;
    } else {
      const intel = G.columnIntel(s, city.owner, T);
      if (!intel.exact && intel.count > 0) {
        const k = intel.approx / intel.count;
        def = Object.fromEntries(Object.entries(def).map(([u, n]) => [u, u === 'hero' ? n : Math.max(1, Math.round(n * k))]));
      }
      exact = intel.exact;
      // magi riding with the column, as far as we can see them (close watch only)
      if (T.magi && G.magusById && (intel.level === 'close' || intel.level === 'own')) foeMagi = T.magi.map(id => G.magusById(s, T.owner, id)).filter(g => g && g.move === T.id);
    }
    const run = () => fieldBattle(s, city.owner, city, units, T, def, plan.x, plan.y, plan.path, plan.naval && G.isWater(G.tileAt(s, plan.x, plan.y)));
    const withMagi = () => G.magiPreviewWith ? G.magiPreviewWith(s, city, units, foeMagi, run) : run();
    const r = G.withOrders && orders ? G.withOrders(s, city.owner, units, orders, withMagi) : withMagi();
    return { ...r, estimated: !exact, plan, monster: !!mon };
  };

  // every battle preview (the send form's, free cities', creatures') shows the battle magic expected:
  // the war magi who would ride, and whether the defenders' magi may answer. Installed here, after
  // js/minors.js and js/monsters.js have wrapped G.previewBattle, so their previews include it too.
  {
    const basePreview = G.previewBattle;
    G.previewBattle = (s, city, tile, units, mode) => {
      if (!G.magiPreviewWith || !city || !units) return basePreview(s, city, tile, units, mode);
      const tc = tile && tile.city && s.cities[tile.city];
      const foe = tc && tc.owner !== city.owner && G.magiAt ? G.magiAt(s, tc.owner, tc.id) : [];
      return G.magiPreviewWith(s, city, units, foe, () => basePreview(s, city, tile, units, mode));
    };
  }

  // ---- the way home (interceptors walk back the road they came) ----
  const goHome = (s, m, units, loot) => {
    if (!G.unitsCount(units)) return;
    G.sendHome(s, { ...m, path: m.homePath || m.path, depart: 0, arrive: m.march || Math.max(15, m.arrive - m.depart) }, units, loot);
  };
  {
    const baseHome = G.sendHome;
    G.sendHome = (s, m, units, loot) => {
      const before = s.moves.length;
      const r = baseHome(s, m, units, loot);
      if (s.moves.length > before) { const nm = s.moves[s.moves.length - 1]; if (nm && nm.owner === m.owner && nm.type === 'return' && !nm.via) nm.via = m.id; }
      return r;
    };
  }
  // the march a column became (it turned home, or was rerouted by G.sendHome)
  const successor = (s, id) => s.moves.find(x => x.via === id) || null;

  // ---- recalling a column of one's own ----
  G.recallMove = (s, id, owner = 'p') => {
    const m = findMove(s, id);
    if (!m || m.owner !== owner) return 'No such column';
    if (m.type === 'return') return 'Already heading home';
    if (m.route || m.supply) return 'Caravans of a trade route or supply line keep to their schedule';
    const home = s.cities[m.from];
    if (!home || home.owner !== owner) return 'Their home city is lost';
    const tr = travelled(s, m);
    s.moves.splice(s.moves.indexOf(m), 1);
    const elapsed = Math.max(5, Math.round(s.time - m.depart));
    const synth = { ...m, x: Math.round(tr.pos.x), y: Math.round(tr.pos.y), path: tr.path, depart: 0, arrive: elapsed };
    if (G.unitsCount(m.units)) G.sendHome(s, synth, m.units, m.cargo);
    else s.moves.push({ id: G.newId(s, 'm'), owner, type: 'return', from: m.from, fx: tr.pos.x, fy: tr.pos.y, x: m.fx, y: m.fy, path: [...tr.path].reverse(), naval: m.naval,
      units: {}, cargo: m.cargo || {}, depart: s.time, arrive: s.time + elapsed, via: m.id });
    if (m.general && G.generalById) { const g = G.generalById(s, owner, m.general); const nm = s.moves.find(x => x.via === m.id); if (g && g.move === m.id && nm) { nm.general = g.id; g.move = nm.id; } }
    if (owner === 'p') G.log(s, 'p', `↩️ The ${G.missionName(m.type)} bound for ${destName(s, m)} turns back to ${home.name}.`, 'info');
    return null;
  };

  // ---- the meeting ----
  const capLoot = (goods, cap) => {
    const tot = sum(goods);
    if (tot <= cap) return Object.fromEntries(Object.entries(goods || {}).map(([g, v]) => [g, Math.floor(v)]).filter(([, v]) => v > 0));
    const f = cap / tot;
    return Object.fromEntries(Object.entries(goods).map(([g, v]) => [g, Math.floor(v * f)]).filter(([, v]) => v > 0));
  };
  const nameOf = (s, o) => s.empires[o] ? s.empires[o].name : 'Brigands';
  const arrive = (s, m) => {
    const me = s.empires[m.owner];
    if (!me || me.dead) return;
    let T = findMove(s, m.target);
    let p = T && G.movePos(s, T);
    const allowed = T && !G.canIntercept(s, m.owner, T);
    if (!T || !allowed || dist(p, m) > IC.catch) {
      const next = T && allowed ? T : !T ? successor(s, m.target) : null;
      if (next && !m.retargeted && !G.canIntercept(s, m.owner, next)) {
        const plan = G.interceptPlan(s, m.owner, { x: m.x, y: m.y }, next, m.units, { stance: m.stance, general: m.general });
        if (plan.ok) {
          const nid = G.newId(s, 'm');
          if (G.magiRepoint) G.magiRepoint(s, m.owner, m.id, nid);
          if (m.general && G.generalById) { const g = G.generalById(s, m.owner, m.general); if (g && g.move === m.id) g.move = nid; }
          s.moves.push({ ...m, id: nid, fx: m.x, fy: m.y, x: plan.x, y: plan.y, path: plan.path, naval: plan.naval, depart: s.time, arrive: plan.at,
            target: next.id, retargeted: 1, homePath: [...(m.homePath || m.path || [[m.fx, m.fy], [m.x, m.y]])].concat(plan.path.slice(1)), march: (m.march || 0) + plan.dur });
          if (m.owner === 'p') G.log(s, 'p', `🛡️ The ${nameOf(s, next.owner)} column changed course; our riders follow to ${plan.name}.`, 'info');
          return;
        }
      }
      const why = T && !allowed ? 'The order was withdrawn: we may no longer fight them.' : 'They had changed course or reached safety before our troops arrived.';
      G.report(s, [m.owner], `The interception came to nothing`, 'info', { extra: `${why} The troops turn home.` });
      goHome(s, m, m.units, {});
      return;
    }
    // the battle, where they meet
    const x = Math.round(p.x), y = Math.round(p.y);
    const tile = G.tileAt(s, x, y) || G.tileAt(s, m.x, m.y);
    const naval = !!(T.naval && G.isWater(tile));
    const them = s.empires[T.owner], defOwner = them ? T.owner : null;
    if (defOwner) for (const h of G.hostileHooks) h(s, m.owner, defOwner, 'attack');
    const home = s.cities[m.from];
    const defHad = { ...T.units };
    const prev = G._gctx;
    G._gctx = { owner: m.owner, units: m.units, move: m, general: m.general || null, stance: m.stance || 'balanced', info: null };
    let r;
    try {
      r = fieldBattle(s, m.owner, home && home.owner === m.owner ? home : null, m.units, T, { ...T.units }, tile.x, tile.y, m.path, naval, true);
      const win = r.win;
      if (win && G.unitsCount(defHad) > 0) me.wins = (me.wins || 0) + 1;
      else if (!win && them) them.wins = (them.wins || 0) + 1;
      for (const h of G.battleHooks) h(s, { m, r, site: 'field', defOwner, tile, defHad, target: T });
      const fname = G.fieldName(s, tile.x, tile.y, r.tactics && r.tactics.crossing);
      const caravan = T.type === 'trade';
      let loot = {}, extra = '';
      const dest = destName(s, T);
      if (win) {
        s.moves.splice(s.moves.indexOf(T), 1);
        if (sum(T.cargo) && G.unitsCount(r.attLeft)) loot = capLoot(T.cargo, Math.max(G.carryOf(s, m.owner, r.attLeft), caravan ? 200 : 0));
        if (T.type === 'return') {
          const had = sum(T.cargo);
          if (G.unitsCount(r.defLeft)) { T.units = r.defLeft; T.cargo = {}; s.moves.push(T); }
          extra = `The beaten column fled on toward home${had ? ', leaving its plunder behind' : ''}.`;
        } else {
          const tr = travelled(s, T);
          const synth = { ...T, x: Math.round(tr.pos.x), y: Math.round(tr.pos.y), path: tr.path, depart: 0, arrive: Math.max(10, Math.round(s.time - T.depart)) };
          if (G.unitsCount(r.defLeft)) G.sendHome(s, synth, r.defLeft, {});
          extra = caravan ? `The caravan was taken${sum(loot) ? ': ' + Object.entries(loot).map(([g, v]) => `${v} ${DATA.goods[g] ? DATA.goods[g].name.toLowerCase() : g}`).join(', ') : ''}; its drivers scattered${G.unitsCount(r.defLeft) ? ' and the escort fled home' : ''}.`
            : `Their ${G.missionName(T.type)} toward ${dest} is broken${G.unitsCount(r.defLeft) ? '; the survivors rout home' : ''}.`;
        }
      } else {
        const d = Math.round(clamp(IC.delay * (T.arrive - T.depart), IC.delayMin, IC.delayMax));
        T.units = r.defLeft;
        if (!G.unitsCount(T.units) && !sum(T.cargo) && T.type !== 'trade') s.moves.splice(s.moves.indexOf(T), 1);
        else { T.depart += d; T.arrive += d; T.delayed = (T.delayed || 0) + d; }
        extra = `The ${nameOf(s, T.owner)} beat off the interception and march on toward ${dest}, delayed a little. Our survivors fall back.`;
      }
      const theirs = defOwner ? nameOf(s, defOwner) : 'Brigands';
      const pv = m.owner === 'p' ? win : defOwner === 'p' ? !win : win;
      const body = { att: me.name, def: theirs, A: r.A, D: r.D, attSent: m.units, attLost: r.attLost, defHad, defLost: r.defLost, loot, extra, tactics: r.tactics,
        field: { name: fname, x: tile.x, y: tile.y, mission: T.type, dest } };
      // our own caravan taken by a rival: a report in our words, saying where it was bound, who took it, where, and what was lost
      const ourCaravan = caravan && defOwner === 'p' && m.owner !== 'p';
      if (ourCaravan) {
        const place = nearestPlace(s, tile.x, tile.y);
        const where = place ? `near ${place}` : `at (${tile.x}, ${tile.y})`;
        const goods = o => Object.entries(o || {}).filter(([, v]) => v >= 1).map(([g, v]) => `${Math.floor(v)} ${DATA.goods[g] ? DATA.goods[g].name.toLowerCase() : g}`).join(', ');
        const cargo = goods(T.cargo);
        const title = win ? `🐪 Your caravan to ${dest} was intercepted by the ${me.name} ${where} — cargo lost`
          : `🐪 Your caravan to ${dest} beat off the ${me.name} ${where}`;
        const what = win ? `The ${me.name} fell on our caravan to ${dest} at ${fname} and took it. Cargo lost: ${cargo || 'none'}${sum(loot) ? ` (they carried off ${goods(loot)})` : ''}.${G.unitsCount(r.defLeft) ? ' The surviving escort flees home.' : ''}`
          : `The ${me.name} tried to take our caravan to ${dest} at ${fname}; its escort drove them off and it travels on, a little delayed.`;
        G.report(s, ['p'], title, win ? 'loss' : 'win', { ...body, extra: what, caravan: { dest, by: me.name, where, lost: win ? { ...(T.cargo || {}) } : {} } });
        G.log(s, 'p', `${title}.`, win ? 'bad' : 'good');
      } else G.report(s, [m.owner, defOwner].filter(Boolean), `⚔️ Battle at ${fname}: ${win ? me.name + ' won' : theirs + ' held'}`, pv ? 'win' : 'loss', body);
      if (m.owner === 'p') G.log(s, 'p', `⚔️ Battle at ${fname}: ${win ? 'we broke the ' + theirs + ' column' : 'the ' + theirs + ' column beat us off'}.`, win ? 'good' : 'bad');
      else if (defOwner === 'p' && !ourCaravan) G.log(s, 'p', `⚔️ The ${me.name} fell on our ${G.missionName(T.type)} at ${fname}: ${win ? 'it was broken' : 'we drove them off'}.`, win ? 'bad' : 'good');
      goHome(s, m, r.attLeft, loot);
    } finally { G._gctx = prev; }
  };
  G.moveHandlers.intercept = arrive;

  // ---- the AI: meet hostile columns heading for its cities, and rich enemy caravans ----
  const fieldUnits = (city, naval) => {
    const out = {};
    for (const [u, n] of Object.entries(city.units || {})) {
      const d = DATA.units[u];
      if (!d || !(n > 0) || ['settlers', 'herald', 'scout', 'hero'].includes(u) || d.type === 'civ') continue;
      if (!!naval !== (d.type === 'ship')) continue;
      const k = Math.floor(n * (1 - IC.aiKeep));
      if (k > 0) out[u] = k;
    }
    return out;
  };
  G.interceptFieldUnits = fieldUnits;
  G.aiIntercept = (s, emp) => {
    const owner = emp.id, mine = G.citiesOf(s, owner);
    if (!mine.length) return null;
    for (const T of s.moves) {
      if (T.owner === owner || T.arrive - s.time < 30) continue;
      const t = G.tileAt(s, T.x, T.y), tc = t && t.city && s.cities[t.city];
      const threat = HOSTILE[T.type] && tc && tc.owner === owner;
      const prize = T.type === 'trade' && sum(T.cargo) >= IC.aiCaravan;
      if (!threat && !prize) continue;
      if (G.canIntercept(s, owner, T)) continue;
      if (s.moves.some(x => x.type === 'intercept' && x.owner === owner && x.target === T.id)) continue;
      const p = G.movePos(s, T);
      const near = mine.slice().sort((a, b) => dist(a, p) - dist(b, p)).slice(0, IC.aiCities);
      for (const c of near) {
        if (prize && dist(c, p) > 6) continue;
        const units = fieldUnits(c, T.naval);
        if (!G.unitsCount(units)) continue;
        const plan = G.interceptPlan(s, owner, c, T, units, null, { stride: 2 });
        if (!plan.ok) continue;
        const r = fieldBattle(s, owner, c, units, T, { ...T.units }, plan.x, plan.y, plan.path, plan.naval && G.isWater(G.tileAt(s, plan.x, plan.y)));
        if (r.A < r.D * IC.aiRatio) continue;
        if (!G.sendIntercept(s, c.id, T.id, units, null)) return T.id;
      }
    }
    return null;
  };
  G.aiHooks.push((s, emp, dtMin) => {
    emp.icClock = (emp.icClock || 0) + dtMin;
    if (emp.icClock < IC.aiEvery * PT(s)) return;
    emp.icClock = 0;
    try { G.aiIntercept(s, emp); } catch (e) { if (typeof console !== 'undefined') console.error('ai intercept', e); }
  });
})();
