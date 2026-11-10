// =====================================================================
//  A living wilderness and a late-game crisis.
//
//  Roaming monsters (s.monsters = { id: rec }) walk the map instead of
//  sitting in camps: aurochs herds migrate with the seasons, troll and
//  giant war-bands wander and raid, griffons fly over the heights, sea
//  serpents haunt the great seas and werewolves prowl the forests at
//  night. Each record has the shape of a march (fx, fy, x, y, path,
//  depart, arrive) so G.movePos interpolates it like any army.
//
//  Hunting: an attack or raid sent at a monster's tile is tagged with the
//  monster's id. On arrival the army fights it if it is within CATCH
//  tiles, follows its tracks once if it moved up to TRACK tiles away, and
//  otherwise finds only a cold trail and goes home. A creature on the move
//  can also be intercepted (js/intercept.js: an 'intercept' move tagged
//  with m.monster lies in wait on its trail); it arrives here as a hunt.
//  War magi riding with an interception of a creature cast (G.magiMarch).
//
//  The crisis (s.crisis): late in Endless games (or very late in Conquest)
//  one world-threatening event, chosen by the state of the world, rises
//  in four stages. Its sources are camps (s.camps, kind 'crisis'); it
//  sends roaming warbands, makes the realms set their quarrels aside (a
//  grand truce, signed as 'crisis' treaties in js/diplomacy.js; no AI starts
//  a war on a realm fighting the crisis: G.crisisFighter), and
//  ends when every source is destroyed or a great ritual is completed —
//  or ravages every realm when time runs out.
//
//  Tests and tools can opt out: s.monsterAt = 1e12 (no new creatures),
//  s.crisisNext = 1e12 (no crisis).
// =====================================================================
'use strict';
(() => {
  const PT = s => G.pace(s).time;
  const MIN = (s, m) => m * 60 * PT(s);
  const HOURS = s => s.time / (3600 * PT(s));
  const CATCH = 1.6, TRACK = 4.5;

  // -------------------------------------------------------------------
  // creatures (never trained: at:null keeps them out of every build list)
  // -------------------------------------------------------------------
  const beastUnit = (name, icon, type, role, atk, defI, defC, spd, desc, extra) =>
    Object.assign({ name, icon, type, role, atk, defI, defC, spd, carry: 0, upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc }, extra || {});
  Object.assign(DATA.units, {
    aurochs:   beastUnit('Aurochs', '🦬', 'cav', 'cavalry', 12, 26, 20, 7, 'Great wild cattle that roam the open land with the seasons.'),
    troll:     beastUnit('Troll', '🧌', 'inf', 'infantry', 44, 40, 34, 5, 'Hulking, hungry and hard to kill.'),
    giant:     beastUnit('Hill Giant', '🗿', 'inf', 'infantry', 150, 130, 115, 4, 'A giant of the hills, strong enough to tear down a gate.'),
    griffon:   beastUnit('Griffon', '🦅', 'cav', 'flyer', 40, 30, 34, 12, 'Half eagle, half lion; it nests on the high peaks.', { flying: true }),
    serpent:   beastUnit('Sea Serpent', '🐍', 'ship', 'ship', 220, 260, 260, 9, 'A coiling terror of the deep seas.'),
    werewolf:  beastUnit('Werewolf', '🐺', 'cav', 'cavalry', 38, 26, 24, 9, 'Man by day, beast by night.'),
    fiend:     beastUnit('Fiend', '😈', 'inf', 'infantry', 52, 42, 38, 6, 'A demon of the great incursion.'),
    icewraith: beastUnit('Ice Wraith', '🥶', 'inf', 'infantry', 40, 48, 44, 5, 'Cold given a shape and a hunger.'),
    drake:     beastUnit('Drake', '🐲', 'cav', 'flyer', 70, 55, 60, 11, 'A young dragon of the Wyrm-King\'s brood.', { flying: true }),
    frostgiant: beastUnit('Frost Giant', '❄️', 'inf', 'infantry', 180, 170, 150, 4, 'A giant of the endless ice, keeper of a frost cairn.'),
  });

  // what roams: move 'land' | 'fly' | 'sea'; behave 'migrate' | 'raider' | 'hunter' | 'swim' | 'night' | 'siege'
  //   base/grow: units at spawn = base × (1 + grow × game-hours); minT: earliest spawn (game-minutes × pace)
  //   lootPer: goods per creature slain; roam: wander radius around the lair
  DATA.monsterKinds = {
    herd:      { name: 'Aurochs herd', icon: '🦬', unit: 'aurochs', move: 'land', habitat: ['plains', 'fertile'], behave: 'migrate', base: 10, grow: 0.25, minT: 0, w: 3, roam: 5, slow: 1.7,
                 lootPer: { grain: 45, tools: 0.6 }, renown: 3, portrait: 'beast', text: 'A great herd of wild aurochs, following the grass with the seasons: north in spring and summer, south in autumn and winter. Hunting it brings meat and hides; it only fights back when hunted.' },
    trolls:    { name: 'Troll war-band', icon: '🧌', unit: 'troll', move: 'land', habitat: ['hills', 'forest', 'mountain'], behave: 'raider', base: 6, grow: 0.35, minT: 50, w: 2.4, roam: 4, range: 6, slow: 1.4,
                 lootPer: { ore: 30, iron: 6, weapons: 3 }, renown: 8, trophy: 2, portrait: 'beast', text: 'Trolls wander the wilds near their lair and raid farms and caravans within reach. Hurt them and they slink home to lick their wounds.' },
    giants:    { name: 'Hill giants', icon: '🗿', unit: 'giant', move: 'land', habitat: ['hills', 'mountain'], behave: 'raider', base: 2, grow: 0.35, minT: 150, w: 1.3, roam: 4, range: 7, slow: 1.6,
                 lootPer: { stone: 260, ore: 160, iron: 30 }, renown: 14, trophy: 4, portrait: 'brigand', text: 'Giants stride down from the hills to smash walls and carry off stores. Slow, but terribly strong.' },
    griffons:  { name: 'Griffon flight', icon: '🦅', unit: 'griffon', move: 'fly', habitat: ['mountain', 'hills'], behave: 'hunter', base: 5, grow: 0.3, minT: 40, w: 2, roam: 6, range: 6, slow: 1.3,
                 lootPer: { grain: 15, tools: 2 }, renown: 8, trophy: 3, portrait: 'beast', text: 'Griffons wheel over the heights and swoop on herds, caravans and granaries. They fly over water and mountains alike.' },
    serpent:   { name: 'Sea serpent', icon: '🐍', unit: 'serpent', move: 'sea', minSea: 30, behave: 'swim', base: 1, grow: 0.12, minT: 80, w: 1.2, roam: 6, slow: 1.4,
                 lootPer: { grain: 900, tools: 40, iron: 80 }, renown: 18, trophy: 5, portrait: 'wyrm', text: 'A serpent coils through the great sea. It sinks ships that pass near and scares the fish from nearby harbors (−45% fishing). Only warships can hunt it.' },
    werewolves:{ name: 'Werewolf pack', icon: '🐺', unit: 'werewolf', move: 'land', habitat: ['forest'], behave: 'night', base: 4, grow: 0.35, minT: 70, w: 1.6, roam: 4, range: 5, slow: 1.2,
                 lootPer: { timber: 40, tools: 2 }, renown: 9, trophy: 3, portrait: 'beast', text: 'By day they hide in the deep forest; at night the pack hunts, falling on caravans and the towns at the forest\'s edge.' },
    // crisis warbands (spawned by the crisis only)
    fiends:    { name: 'Fiend host', icon: '😈', unit: 'fiend', move: 'land', behave: 'siege', base: 14, grow: 0.15, crisis: true, slow: 1.1, lootPer: { mana: 6, iron: 4 }, renown: 6, portrait: 'demon', text: 'Demons of the incursion marching on the nearest town.' },
    wraiths:   { name: 'Ice wraiths', icon: '🥶', unit: 'icewraith', move: 'land', behave: 'siege', base: 14, grow: 0.15, crisis: true, slow: 1.2, lootPer: { timber: 20, ore: 10 }, renown: 6, portrait: 'elemental', text: 'Wraiths of the Long Winter drifting south to put out the hearths.' },
    drakes:    { name: 'Drake flight', icon: '🐲', unit: 'drake', move: 'fly', behave: 'siege', base: 7, grow: 0.12, crisis: true, slow: 1.0, lootPer: { iron: 12, tools: 3 }, renown: 7, portrait: 'wyrm', text: 'The Wyrm-King\'s brood, burning their way across the land.' },
    deadcol:   { name: 'Column of the dead', icon: '💀', unit: 'restless', move: 'land', behave: 'siege', base: 22, grow: 0.15, crisis: true, slow: 1.3, lootPer: { iron: 4, weapons: 2 }, renown: 5, portrait: 'undead', text: 'The Dead March: a column of the restless dead walking on the living.' },
  };
  const KIND = DATA.monsterKinds;

  // -------------------------------------------------------------------
  // state helpers
  // -------------------------------------------------------------------
  const mons = s => (s.monsters = s.monsters || {});
  G.monsterList = s => Object.values(mons(s));
  G.monsterPos = (s, mon) => G.movePos(s, mon);
  const tileOf = (s, mon) => { const p = G.movePos(s, mon); return { x: Math.round(p.x), y: Math.round(p.y) }; };
  G.monsterTile = tileOf;
  G.monsterAt = (s, x, y, r = 0.75) => {
    let best = null, bd = r + 1e-9;
    for (const mon of Object.values(mons(s))) {
      const p = G.movePos(s, mon), d = Math.hypot(p.x - x, p.y - y);
      if (d <= bd) { bd = d; best = mon; }
    }
    return best;
  };
  G.monsterVisible = (s, mon, vis) => {
    vis = vis || G.visibleSet(s);
    const t = tileOf(s, mon);
    return !!vis[t.y * s.map + t.x];
  };
  G.monsterCount = mon => G.unitsCount(mon.units);
  const PLURAL = { aurochs: 'aurochs', troll: 'trolls', giant: 'hill giants', griffon: 'griffons', serpent: 'sea serpents', werewolf: 'werewolves', fiend: 'fiends', icewraith: 'ice wraiths', drake: 'drakes', restless: 'restless dead' };
  G.monsterUnitName = (mon, n) => {
    const u = KIND[mon.kind] && KIND[mon.kind].unit, d = DATA.units[u];
    if (!d) return 'creatures';
    return n === 1 ? d.name.toLowerCase() : (PLURAL[u] || d.name.toLowerCase() + 's');
  };
  G.monsterPower = (s, mon) => Math.round(G.atkPower(s, null, mon.units));
  const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  G.monsterHeading = (s, mon) => {
    if (s.time >= mon.arrive || (mon.x === mon.fx && mon.y === mon.fy)) return null;
    const a = Math.atan2(mon.y - mon.fy, mon.x - mon.fx);
    return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  };
  // a rough count, as a scout would give it
  G.monsterEstimate = mon => { const n = G.unitsCount(mon.units); return n <= 6 ? n : Math.round(n / 5) * 5; };
  const named = mon => (KIND[mon.kind] || { name: 'creatures' }).name;
  const lc = t => t.charAt(0).toLowerCase() + t.slice(1);

  const occupied = t => !!(t.city || t.camp || t.oasis || t.ruin || t.minor);
  const SEASIZE = new WeakMap();
  const seaSize = (s, x, y) => {
    let sz = SEASIZE.get(s.tiles);
    if (!sz) {
      const w = G.waterRegions(s); sz = new Map();
      for (let i = 0; i < w.length; i++) if (w[i] >= 0) sz.set(w[i], (sz.get(w[i]) || 0) + 1);
      SEASIZE.set(s.tiles, sz);
    }
    const id = G.waterRegions(s)[y * s.map + x];
    return id >= 0 ? sz.get(id) || 0 : 0;
  };
  // where a creature of this kind may stand
  const standOk = (s, k, t, from) => {
    if (!t || occupied(t)) return false;
    if (k.move === 'sea') {
      if (!G.isWater(t)) return false;
      if (from) { const w = G.waterRegions(s); return w[t.y * s.map + t.x] === w[from.y * s.map + from.x]; }
      return true;
    }
    if (G.isWater(t) || (DATA.terrain[t.terrain] || {}).impassable) return false;
    if (k.move === 'land' && from) { const c = G.landRegions(s); return c[t.y * s.map + t.x] === c[from.y * s.map + from.x]; }
    return true;
  };

  // -------------------------------------------------------------------
  // strength and spawning
  // -------------------------------------------------------------------
  const hostK = s => G.clamp(((s.settings && s.settings.hostility) || 0.85) / 0.85, 0.6, 1.5);
  G.monsterStrength = (s, kind, mult = 1) => {
    const k = KIND[kind];
    const n = k.base * (1 + k.grow * HOURS(s)) * (0.85 + 0.3 * G.aiPressure(s)) * (0.85 + 0.15 * hostK(s)) * mult;
    return Math.max(1, Math.round(n * G.rnd(0.88, 1.12)));
  };
  // how many roam at once: grows with the size of the world and with time
  G.monsterCap = s => Math.round(s.map * s.map / 300 * G.clamp(0.35 + HOURS(s) / 4, 0.35, 1));
  // the earliest a roaming raid can fall on a realm (the opening hours stay calm)
  //   (a hostility of 0 — tests, a peaceful setting — keeps roaming raiders off the player like every other threat)
  G.monsterRaidGate = (s, owner) => owner === 'p'
    ? (s.settings && s.settings.hostility === 0 ? Infinity : Math.max(5400 * PT(s), 7200 * PT(s) / hostK(s)))
    : 5400 * PT(s);
  const raidOpen = (s, owner, mon) => mon && KIND[mon.kind].crisis ? true : s.time >= G.monsterRaidGate(s, owner);

  const spawnSpot = (s, k) => {
    const pcs = G.citiesOf(s, 'p'), all = Object.values(s.cities);
    const far = HOURS(s) < 2 ? 7 : 5;
    return G.freeTile(s, t => {
      if (k.move === 'sea') return G.isWater(t) && seaSize(s, t.x, t.y) >= (k.minSea || 20) && all.every(c => G.dist(c, t) >= 3);
      if (G.isWater(t) || !(k.habitat || []).includes(t.terrain)) return false;
      return all.every(c => G.dist(c, t) >= 4) && pcs.every(c => G.dist(c, t) >= far)
        && Object.values(mons(s)).every(m => Math.hypot(m.x - t.x, m.y - t.y) >= 3);
    }, 4000);
  };
  // freeTile skips water: sea spots are drawn here
  const seaSpot = (s, k) => {
    const all = Object.values(s.cities);
    for (let i = 0; i < 3000; i++) {
      const t = s.tiles[G.rint(0, s.tiles.length - 1)];
      if (G.isWater(t) && !occupied(t) && seaSize(s, t.x, t.y) >= (k.minSea || 20) && all.every(c => G.dist(c, t) >= 3)) return t;
    }
    return null;
  };

  G.spawnMonster = (s, kind, at, opts = {}) => {
    const k = KIND[kind];
    if (!k) return null;
    const t = at ? G.tileAt(s, at.x, at.y) : (k.move === 'sea' ? seaSpot(s, k) : spawnSpot(s, k));
    if (!t) return null;
    const n = opts.n || G.monsterStrength(s, kind, opts.mult || 1);
    const id = G.newId(s, 'w');
    const mon = { id, kind, units: { [k.unit]: n }, max: n, lx: t.x, ly: t.y, fx: t.x, fy: t.y, x: t.x, y: t.y, path: null,
      depart: s.time, arrive: s.time, rest: s.time + MIN(s, G.rnd(1, 4)), mode: 'wander', born: s.time, raidAt: s.time + MIN(s, G.rnd(10, 25)), seen: 0 };
    if (opts.crisis) { mon.crisis = 1; mon.src = opts.src || null; mon.rest = s.time + MIN(s, 0.5); mon.raidAt = s.time; }
    mons(s)[id] = mon;
    return mon;
  };

  const pickKind = s => {
    const mins = s.time / (60 * PT(s));
    const pool = Object.entries(KIND).filter(([, k]) => !k.crisis && mins >= k.minT);
    const count = {};
    for (const m of Object.values(mons(s))) count[m.kind] = (count[m.kind] || 0) + 1;
    const ws = pool.map(([id, k]) => [id, k.w / (1 + (count[id] || 0))]);
    let r = Math.random() * ws.reduce((a, [, w]) => a + w, 0);
    for (const [id, w] of ws) { r -= w; if (r <= 0) return id; }
    return null;
  };

  // -------------------------------------------------------------------
  // movement
  // -------------------------------------------------------------------
  const pathLen = path => { let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return l; };
  const legTo = (s, mon, tx, ty, haste = 1) => {
    const k = KIND[mon.kind];
    const from = { x: mon.x, y: mon.y }, to = { x: tx, y: ty };
    if (from.x === tx && from.y === ty) return false;
    let path;
    if (k.move === 'fly') path = [[from.x, from.y], [tx, ty]];
    else {
      const p = G.path(s, from, to, k.move === 'sea');
      if (!p) return false;
      path = p.path;
    }
    const spd = (DATA.units[k.unit] || { spd: 6 }).spd;
    const dur = Math.max(30, pathLen(path) / spd * 120 * G.pace(s).travel * (k.slow || 1.4) / haste);
    Object.assign(mon, { fx: from.x, fy: from.y, x: tx, y: ty, path, depart: s.time, arrive: s.time + dur });
    if (k.behave === 'migrate') { mon.lx = tx; mon.ly = ty; }     // a herd's home is wherever it grazes
    return true;
  };
  G.monsterLegTo = legTo;
  // a destination near (cx, cy) within r tiles, best by score(t) (lower is better)
  const chooseNear = (s, mon, cx, cy, r, score) => {
    const k = KIND[mon.kind], here = { x: mon.x, y: mon.y };
    let best = null, bs = Infinity;
    for (let i = 0; i < 18; i++) {
      const x = Math.round(cx + G.rnd(-r, r)), y = Math.round(cy + G.rnd(-r, r));
      const t = G.tileAt(s, x, y);
      if (!t || (x === mon.x && y === mon.y) || !standOk(s, k, t, here)) continue;
      if (Object.values(s.cities).some(c => G.dist(c, t) < 1.5)) continue;
      const sc = score(t) + G.rnd(0, 1.2);
      if (sc < bs) { bs = sc; best = t; }
    }
    return best;
  };
  const night = s => G.daylight(s) < 0.3;
  const hurt = mon => G.unitsCount(mon.units) < mon.max * 0.45;
  // pick a city to raid: within range of the lair, weakest defence first; never a realm still inside its calm opening
  const raidTarget = (s, mon, range) => {
    let best = null, bs = Infinity;
    const p = G.movePos(s, mon);
    for (const c of Object.values(s.cities)) {
      const d = Math.min(Math.hypot(c.x - mon.lx, c.y - mon.ly), Math.hypot(c.x - p.x, c.y - p.y));
      if (d > range || !raidOpen(s, c.owner, mon) || (c.monRaidAt || 0) > s.time) continue;
      if (KIND[mon.kind].move === 'land' && !G.landReachable(s, { x: mon.x, y: mon.y }, c)) continue;
      const def = G.defPower(s, c.owner, c.units) * G.cityDefense(s, c).mult + G.cityDefense(s, c).flat;
      const sc = def / Math.max(1, G.atkPower(s, null, mon.units)) + d * 0.15;
      if (sc < bs) { bs = sc; best = c; }
    }
    return best;
  };
  // the tile next to a city that a creature attacks from
  const besideCity = (s, mon, city) => {
    const k = KIND[mon.kind], here = { x: mon.x, y: mon.y };
    let best = null, bd = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const t = G.tileAt(s, city.x + dx, city.y + dy);
      if (!t || (!dx && !dy) || Math.hypot(dx, dy) > G.cityReach(s, city) - 0.3 || !standOk(s, k, t, here)) continue;
      const d = Math.hypot(t.x - mon.x, t.y - mon.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };

  const plan = (s, mon) => {
    const k = KIND[mon.kind];
    const atLair = mon.x === mon.lx && mon.y === mon.ly;
    // hurt creatures go home to heal (crisis bands fight to the end)
    if (!k.crisis && hurt(mon)) {
      mon.mode = 'flee';
      if (!atLair && legTo(s, mon, mon.lx, mon.ly, 1.3)) return;
      const u = k.unit; mon.units[u] = Math.min(mon.max, (mon.units[u] || 0) + Math.max(1, Math.round(mon.max * 0.12)));
      mon.rest = s.time + MIN(s, G.rnd(5, 9));
      return;
    }
    if (mon.mode === 'flee') mon.mode = 'wander';
    switch (k.behave) {
      case 'migrate': {
        // spring and summer: north; autumn and winter: south — toward open grassland
        const se = G.season(s).index, goal = se <= 1 ? s.map * 0.15 : s.map * 0.85;
        mon.mode = se <= 1 ? 'north' : 'south';
        const t = chooseNear(s, mon, mon.x, mon.y + Math.sign(goal - mon.y) * 2, 3.5,
          t => Math.abs(t.y - goal) * 0.6 + ((k.habitat.includes(t.terrain) || t.terrain === 'forest') ? 0 : 2));
        if (t) legTo(s, mon, t.x, t.y);
        mon.rest = s.time + MIN(s, G.rnd(3, 8));
        return;
      }
      case 'swim': {
        const t = chooseNear(s, mon, mon.x, mon.y, k.roam, () => 0);
        if (t) legTo(s, mon, t.x, t.y);
        mon.rest = s.time + MIN(s, G.rnd(2, 6));
        return;
      }
      case 'siege': {
        // crisis bands march on the nearest town, raid it, and pick the next
        const p = { x: mon.x, y: mon.y };
        const cs = Object.values(s.cities).filter(c => (c.monRaidAt || 0) <= s.time && (k.move === 'fly' || G.landReachable(s, p, c)))
          .sort((a, b) => G.dist(a, p) - G.dist(b, p));
        const c = cs[0];
        mon.mode = 'raid';
        if (c) {
          mon.target = c.id;
          if (Math.hypot(c.x - mon.x, c.y - mon.y) <= G.cityReach(s, c)) { mon.rest = Math.max(s.time + MIN(s, 0.5), mon.raidAt); return; }   // already at the gates: wait for the assault
          const t = besideCity(s, mon, c); if (t && legTo(s, mon, t.x, t.y)) { mon.rest = s.time; return; }
        }
        const t = chooseNear(s, mon, mon.x, mon.y, 3, () => 0);
        if (t) legTo(s, mon, t.x, t.y);
        mon.rest = s.time + MIN(s, 2);
        return;
      }
      default: break;
    }
    // raiders, hunters and night packs
    if (k.behave === 'night' && !night(s)) {
      mon.mode = 'lair';
      if (!atLair && legTo(s, mon, mon.lx, mon.ly)) return;
      mon.rest = s.time + MIN(s, 3);
      return;
    }
    if (mon.mode === 'raid' || mon.mode === 'return') {
      mon.mode = 'wander';
      if (!atLair && legTo(s, mon, mon.lx, mon.ly)) { mon.mode = 'return'; return; }
    }
    if (s.time >= mon.raidAt) {
      // griffons rather take a herd if one grazes nearby
      if (k.behave === 'hunter') {
        const herd = Object.values(mons(s)).find(o => o.kind === 'herd' && Math.hypot(o.x - mon.x, o.y - mon.y) <= k.range);
        if (herd && Math.random() < 0.5) { mon.mode = 'prey'; mon.target = herd.id; if (legTo(s, mon, herd.x, herd.y)) return; }
      }
      const c = raidTarget(s, mon, k.range || 6);
      if (c) {
        const t = besideCity(s, mon, c);
        if (t && legTo(s, mon, t.x, t.y)) { mon.mode = 'raid'; mon.target = c.id; return; }
      }
      mon.raidAt = s.time + MIN(s, G.rnd(5, 10));
    }
    mon.mode = 'wander';
    const pref = k.habitat || [];
    const t = chooseNear(s, mon, mon.lx, mon.ly, k.roam || 4, t => (pref.includes(t.terrain) ? 0 : 1.5));
    if (t) legTo(s, mon, t.x, t.y);
    mon.rest = s.time + MIN(s, G.rnd(3, 7));
  };
  G.monsterPlan = plan;

  // -------------------------------------------------------------------
  // fights: a creature falls on a city, a caravan, a ship
  // -------------------------------------------------------------------
  const goodsTxt = g => Object.entries(g).filter(([, v]) => v > 0).map(([k, v]) => `${Math.round(v)} ${DATA.goods[k] ? DATA.goods[k].name.toLowerCase() : k}`).join(', ');
  const clean = u => Object.fromEntries(Object.entries(u || {}).filter(([, n]) => n > 0));
  G.monsterRaid = (s, mon, city) => {
    const k = KIND[mon.kind];
    const cd = G.cityDefense(s, city);
    const gar = G.garrisonEdge(s, city.owner, city.units, cd.mult, `Walls (level ${G.lvl(city, 'wall')})`);
    const att = { ...mon.units }, defHad = { ...city.units };
    const r = G.battle(s, null, att, 1, city.owner, city.units, gar.mult, cd.flat, { mode: 'raid', x: city.x, y: city.y, labels: gar.labels });
    city.units = r.defLeft;
    mon.units = clean(r.attLeft);
    const took = {};
    if (r.win) {
      const goods = k.behave === 'night' ? ['grain', 'timber'] : k.unit === 'giant' ? ['grain', 'stone', 'ore'] : k.unit === 'drake' ? ['grain', 'timber'] : ['grain'];
      for (const g of goods) { const v = Math.floor((city.res[g] || 0) * (k.crisis ? 0.22 : 0.15)); if (v > 0) { city.res[g] -= v; took[g] = v; } }
      if (k.behave === 'night' || k.crisis) city.pop = Math.max(3, city.pop * (k.crisis ? 0.93 : 0.96));
    }
    city.monRaidAt = s.time + MIN(s, k.crisis ? 12 : 30);
    mon.raidAt = s.time + MIN(s, k.crisis ? G.rnd(6, 10) : G.rnd(20, 35));
    const extra = r.win ? `The ${lc(k.name)} broke through${Object.keys(took).length ? ' and carried off ' + goodsTxt(took) : ''}${k.behave === 'night' || k.crisis ? '; some townsfolk were lost' : ''}.`
      : `The defenders drove the ${lc(k.name)} off.`;
    G.report(s, [city.owner], `${k.icon} ${k.name} fell upon ${city.name}`, city.owner === 'p' ? (r.win ? 'loss' : 'win') : 'info',
      { att: k.name, def: s.empires[city.owner].name, A: r.A, D: r.D, attSent: att, attLost: r.attLost, defHad, defLost: r.defLost, loot: took, extra, tactics: r.tactics });
    G.log(s, city.owner, `${k.icon} ${k.name} raided ${city.name}! ${r.win ? 'Our defenders fell back.' : 'We drove them off.'}`, r.win ? 'bad' : 'good');
    if (!G.unitsCount(mon.units)) { delete mons(s)[mon.id]; return r; }
    mon.mode = 'raid';     // the next plan sends it home
    mon.rest = s.time + MIN(s, 1);
    return r;
  };
  const ambush = (s, mon, m) => {
    const k = KIND[mon.kind];
    const escort = clean(m.units);
    let loss = G.rnd(0.35, 0.6), held = false, b = null;
    if (G.unitsCount(escort)) {
      b = G.battle(s, null, { ...mon.units }, 1, m.owner, escort, 1, 0, 'raid');
      held = !b.win; loss = held ? 0.08 : 0.5;
      m.units = clean(b.defLeft); mon.units = clean(b.attLeft);
    }
    const stolen = {};
    for (const [g, n] of Object.entries(m.cargo || {})) { const v = Math.floor(n * loss); if (v > 0) { stolen[g] = v; m.cargo[g] = n - v; } }
    m.ambushed = true;
    mon.raidAt = s.time + MIN(s, G.rnd(10, 20));
    const p = G.movePos(s, m), where = `(${Math.round(p.x)}, ${Math.round(p.y)})`;
    G.report(s, [m.owner], `${k.icon} ${k.name} ambushed a caravan near ${where}`, held ? 'win' : 'loss',
      b ? { att: k.name, def: 'Caravan escort', A: b.A, D: b.D, attSent: { ...mon.units, ...b.attLost }, defHad: escort, attLost: b.attLost, defLost: b.defLost, loot: stolen, extra: `The escort ${held ? 'drove them off' : 'was overwhelmed'}.` }
        : { extra: `The ${lc(k.name)} made off with ${goodsTxt(stolen) || 'nothing'}. An escort would have helped.` });
    G.log(s, m.owner, `${k.icon} ${k.name} fell on a caravan near ${where}${Object.keys(stolen).length ? ': ' + goodsTxt(stolen) + ' lost' : ''}.`, held ? 'warn' : 'bad');
    if (!G.unitsCount(mon.units)) delete mons(s)[mon.id];
  };
  const sinkShips = (s, mon, m) => {
    const k = KIND[mon.kind], had = clean(m.units);
    const b = G.battle(s, null, { ...mon.units }, 1, m.owner, had, 1, 0, { mode: 'raid', x: Math.round(mon.x), y: Math.round(mon.y), naval: true });
    m.units = clean(b.defLeft); mon.units = clean(b.attLeft);
    m.serpent = 1;
    mon.raidAt = s.time + MIN(s, G.rnd(8, 15));
    const p = G.movePos(s, m), where = `(${Math.round(p.x)}, ${Math.round(p.y)})`;
    G.report(s, [m.owner], `${k.icon} A sea serpent struck our ships near ${where}`, b.win ? 'loss' : 'win',
      { att: k.name, def: s.empires[m.owner].name, A: b.A, D: b.D, attSent: { ...mon.units, ...b.attLost }, defHad: had, attLost: b.attLost, defLost: b.defLost, loot: {}, extra: b.win ? 'Ships were dragged under.' : 'The crews beat the serpent back.' });
    if (!G.unitsCount(m.units)) s.moves = s.moves.filter(x => x !== m);
    if (!G.unitsCount(mon.units)) delete mons(s)[mon.id];
  };

  // -------------------------------------------------------------------
  // the tick: plan legs, raid, ambush, sink, sightings, spawning
  // -------------------------------------------------------------------
  const tickMonster = (s, mon) => {
    const k = KIND[mon.kind];
    if (!k || !G.unitsCount(mon.units)) { delete mons(s)[mon.id]; return; }
    const p = G.movePos(s, mon);
    // raids: a raiding band that reached its town (or any creature on the prowl inside a town's reach)
    if (mon.mode === 'raid' && k.behave !== 'swim') {
      const c = s.cities[mon.target];
      if (c && s.time >= mon.raidAt && Math.hypot(c.x - p.x, c.y - p.y) <= G.cityReach(s, c) && raidOpen(s, c.owner, mon) && (k.behave !== 'night' || night(s))) {
        G.monsterRaid(s, mon, c);
        return;
      }
      if (!c && s.time >= mon.arrive) mon.mode = 'wander';
    }
    // griffons fall on a herd
    if (mon.mode === 'prey' && s.time >= mon.arrive) {
      const herd = mons(s)[mon.target];
      if (herd && Math.hypot(herd.x - mon.x, herd.y - mon.y) <= 1.5) {
        const u = KIND.herd.unit, lost = Math.max(1, Math.floor((herd.units[u] || 0) * 0.15));
        herd.units[u] = (herd.units[u] || 0) - lost;
        if (herd.units[u] <= 0) delete mons(s)[herd.id];
      }
      mon.mode = 'wander'; mon.raidAt = s.time + MIN(s, G.rnd(15, 25));
    }
    // caravans and ships on the way
    if ((k.behave === 'raider' || k.behave === 'hunter' || (k.behave === 'night' && night(s)) || k.crisis) && s.time >= mon.raidAt) {
      const m = s.moves.find(m => m.type === 'trade' && !m.ambushed && raidOpen(s, m.owner, mon) && (() => { const q = G.movePos(s, m); return Math.hypot(q.x - p.x, q.y - p.y) <= 1.3; })()
        && !(G.patrolShields && G.patrolShields(s, m, mon)));   // a patrol on that road (js/patrols.js) scares the creature off or fights it first
      if (m) { ambush(s, mon, m); return; }
    }
    if (k.behave === 'swim' && s.time >= mon.raidAt) {
      const m = s.moves.find(m => m.naval && !m.serpent && raidOpen(s, m.owner, mon) && (() => { const q = G.movePos(s, m); return Math.hypot(q.x - p.x, q.y - p.y) <= 1.5; })());
      if (m) { sinkShips(s, mon, m); return; }
    }
    if (s.time >= mon.arrive && s.time >= (mon.rest || 0)) plan(s, mon);
  };
  G.monsterTick = s => { for (const mon of Object.values(mons(s))) if (mons(s)[mon.id]) tickMonster(s, mon); };

  const sightings = s => {
    const unseen = Object.values(mons(s)).filter(m => !m.seen);
    if (!unseen.length) return;
    const vis = G.visibleSet(s);
    for (const mon of unseen) {
      if (!G.monsterVisible(s, mon, vis)) continue;
      mon.seen = 1;
      const k = KIND[mon.kind], t = tileOf(s, mon), h = G.monsterHeading(s, mon);
      G.log(s, 'p', `${k.icon} ${k.name} spotted at (${t.x}, ${t.y})${h ? ', heading ' + h : ''}. ${k.crisis ? '' : k.behave === 'migrate' ? 'Good hunting.' : 'Keep an eye on it.'}`, k.behave === 'migrate' ? 'info' : 'warn');
    }
  };

  G.slowHooks.push((s, dtMin) => {
    if (s.gameOver) return;
    G.monsterTick(s);
    s.monsterAt = s.monsterAt ?? s.time + MIN(s, G.rnd(6, 12));
    if (s.time >= s.monsterAt) {
      s.monsterAt = s.time + MIN(s, G.rnd(8, 14));
      const wild = Object.values(mons(s)).filter(m => !m.crisis).length;
      if (wild < G.monsterCap(s)) { const kind = pickKind(s); if (kind) G.spawnMonster(s, kind); }
    }
    sightings(s);
  });

  // sea serpents scare the fish away from nearby harbors
  G.modSources.push((s, owner, city, key) => {
    if (key !== 'fishing' || !city || !s.monsters) return 1;
    for (const mon of Object.values(s.monsters)) if (mon.kind === 'serpent') { const p = G.movePos(s, mon); if (Math.hypot(p.x - city.x, p.y - city.y) <= 4) return 0.55; }
    return 1;
  });

  // -------------------------------------------------------------------
  // hunting: sending an army at a creature
  // -------------------------------------------------------------------
  const tagHunt = (s, n0, mon) => { for (let i = n0; i < s.moves.length; i++) { const m = s.moves[i]; if ((m.type === 'attack' || m.type === 'raid') && !m.monster) { m.monster = mon.id; m.mkind = mon.kind; } } };
  const baseSend = G.sendArmy;
  G.sendArmy = (s, fromId, x, y, type, units, cargo) => {
    const tile = G.tileAt(s, x, y), city = s.cities[fromId];
    const mon = (type === 'attack' || type === 'raid') && tile && !tile.city && !tile.camp && !tile.oasis && !tile.ruin && !tile.minor ? G.monsterAt(s, x, y) : null;
    if (!mon) return baseSend(s, fromId, x, y, type, units, cargo);
    if (!city) return 'No such city';
    if (G.isWater(tile)) {
      if (KIND[mon.kind].move !== 'sea') return `The ${lc(KIND[mon.kind].name)} is over the water: wait until it lands`;
      return huntAtSea(s, city, tile, type, units, mon);
    }
    const n0 = s.moves.length;
    const err = baseSend(s, fromId, x, y, type, units, cargo);
    if (!err) tagHunt(s, n0, mon);
    return err;
  };
  // the sea serpent: only ships can go out after it
  const huntAtSea = (s, city, tile, type, units, mon) => {
    const sent = {};
    if (!Object.entries(units || {}).some(([u, n]) => n >= 1 && DATA.units[u] && DATA.units[u].type === 'ship')) return 'Only ships can hunt a sea serpent: send War Galleys';
    for (const [u, n] of Object.entries(units || {})) { const k = Math.floor(n); if (k > 0) { if ((city.units[u] || 0) < k) return 'Not enough ' + DATA.units[u].name; sent[u] = k; } }
    if (!G.unitsCount(sent)) return 'Select some troops';
    const p = G.planMarch(s, city.owner, city, tile, sent);
    if (!p.ok) return p.reason;
    for (const [u, k] of Object.entries(sent)) city.units[u] -= k;
    s.moves.push({ id: G.newId(s, 'm'), owner: city.owner, type, from: city.id, fx: city.x, fy: city.y, x: tile.x, y: tile.y, path: p.path, naval: p.naval,
      units: sent, cargo: {}, depart: s.time, arrive: s.time + p.dur, monster: mon.id, mkind: mon.kind, serpent: 1 });
    return null;
  };

  const scaleLoot = (per, n) => Object.fromEntries(Object.entries(per).map(([g, v]) => [g, Math.floor(v * n)]).filter(([, v]) => v > 0));
  const capLoot = (loot, cap) => {
    const tot = Object.values(loot).reduce((a, b) => a + b, 0);
    if (tot <= cap || tot <= 0) return loot;
    const f = cap / tot;
    return Object.fromEntries(Object.entries(loot).map(([g, v]) => [g, Math.floor(v * f)]).filter(([, v]) => v > 0));
  };
  // reward for slaying a creature (also used for crisis bands)
  const slain = (s, owner, mon, m) => {
    const k = KIND[mon.kind], me = s.empires[owner];
    const ren = Math.round(k.renown * Math.min(2, 0.5 + Math.sqrt(mon.max / Math.max(1, k.base)) * 0.5));
    me.renownBonus = (me.renownBonus || 0) + ren;
    me.monstersSlain = (me.monstersSlain || 0) + 1;
    let trophy = null;
    if (m && m.units && m.units.hero && k.trophy && G.newHeroItem && (k.trophy >= 4 || Math.random() < 0.5)) {
      const h = G.heroOf ? G.heroOf(s, owner) : null;
      if (h && !h.dead && h.items) { trophy = G.newHeroItem(k.trophy); trophy.name = trophy.name + ' (' + k.name.replace(/^(The )?/, '').toLowerCase() + ' trophy)'; h.items.push(trophy); }
    }
    if (mon.crisis && s.crisis && s.crisis.status === 'active') crisisPoints(s, owner, 3);
    if (owner === 'p' && G.chronEvent) G.chronEvent(s, 'hunt', { a: 'p', x: k.name, n: ren });
    return { ren, trophy };
  };
  G.monsterSlain = slain;

  // the way home: an interception waited on the trail, so it walks back only as long as it marched
  const homeward = m => m.march ? { ...m, path: m.homePath || m.path, depart: 0, arrive: m.march } : m;
  // the war magi of an interception cast in its fight (plain hunts keep their magi out of it, as before)
  const huntArrive = (s, m) => m.type === 'intercept' && G.magiMarch ? G.magiMarch(s, m, () => huntArrive0(s, m)) : huntArrive0(s, m);
  const huntArrive0 = (s, m) => {
    const mon = mons(s)[m.monster], home = s.cities[m.from], me = s.empires[m.owner];
    const kname = (KIND[m.mkind] || { name: 'the creatures' }).name;
    if (m.owner === 'p') G.reveal(s, m.x, m.y, 2);
    if (!mon) {
      G.report(s, [m.owner], `The hunt for the ${lc(kname)} came to nothing`, 'info', { extra: 'Someone else got there first, or the creatures are gone. The army turns home.' });
      G.sendHome(s, homeward(m), m.units, m.cargo);
      return;
    }
    const p = G.movePos(s, mon), d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d > CATCH) {
      const t = { x: Math.round(p.x), y: Math.round(p.y) };
      const pl = !m.tracked && d <= TRACK && (G.tileAt(s, t.x, t.y)) ? G.planMarch(s, m.owner, { x: m.x, y: m.y }, t, m.units) : null;
      if (pl && pl.ok && (!G.isWater(G.tileAt(s, t.x, t.y)) || pl.naval)) {
        const nid = G.newId(s, 'm');
        if (G.magiRepoint) G.magiRepoint(s, m.owner, m.id, nid);
        if (m.general && G.generalById) { const g = G.generalById(s, m.owner, m.general); if (g && g.move === m.id) g.move = nid; }
        const back = m.march ? { march: m.march + Math.max(20, pl.dur), homePath: [...(m.homePath || m.path || [[m.fx, m.fy], [m.x, m.y]])].concat((pl.path || []).slice(1)) } : {};
        s.moves.push({ ...m, ...back, id: nid, fx: m.x, fy: m.y, x: t.x, y: t.y, path: pl.path, naval: pl.naval, depart: s.time, arrive: s.time + Math.max(20, pl.dur), tracked: 1 });
        G.log(s, m.owner, `🐾 The ${lc(kname)} had moved on; our hunters follow fresh tracks to (${t.x}, ${t.y}).`, 'info');
        return;
      }
      G.report(s, [m.owner], `The trail of the ${lc(kname)} went cold`, 'info', { extra: `When the army reached (${m.x}, ${m.y}) the ${lc(kname)} ${d > TRACK ? 'had moved too far away' : 'could not be followed'} — last seen near (${t.x}, ${t.y}). The army turns home.` });
      G.sendHome(s, homeward(m), m.units, m.cargo);
      return;
    }
    // the fight, on the creature's own ground
    const k = KIND[mon.kind];
    const mode = m.type === 'raid' ? 'raid' : 'attack';
    const tx = Math.round(p.x), ty = Math.round(p.y), tile = G.tileAt(s, tx, ty);
    const edge = G.armyEdge(s, m.owner, home, m.units);
    const defHad = { ...mon.units };
    const r = G.battle(s, m.owner, m.units, edge.mult, null, mon.units, 1, 0, { mode, x: tx, y: ty, path: m.path, naval: m.naval, labels: edge.labels });
    mon.units = clean(r.defLeft);
    const killed = !G.unitsCount(mon.units) || (r.win && mode === 'attack');
    const lostN = G.unitsCount(r.defLost);
    let loot = scaleLoot(k.lootPer || {}, killed ? mon.max : lostN * 0.6);
    loot = G.unitsCount(r.attLeft) ? capLoot(loot, Math.max(G.carryOf(s, m.owner, r.attLeft), killed ? 400 : 0)) : {};
    if (r.win) me.wins = (me.wins || 0) + 1;
    let extra = '';
    const tileObj = tile || G.tileAt(s, m.x, m.y);
    for (const h of G.battleHooks) h(s, { m, r, site: 'monster', defOwner: null, tile: tileObj, defHad, monster: mon });
    if (killed) {
      delete mons(s)[mon.id];
      const rw = slain(s, m.owner, mon, m);
      extra = `The ${lc(k.name)} ${k.behave === 'migrate' ? 'was hunted down' : 'was slain'} (+${rw.ren} renown).${rw.trophy ? ` The hero takes ${rw.trophy.icon} ${rw.trophy.name}.` : ''}`;
      G.log(s, m.owner, `${k.icon} ${m.owner === 'p' ? 'We' : 'The ' + me.name} slew the ${lc(k.name)}! (+${rw.ren} renown)`, 'good');
    } else {
      if (r.win || hurt(mon)) { mon.mode = 'flee'; mon.rest = s.time; mon.arrive = Math.min(mon.arrive, s.time); mon.fx = mon.x = tx; mon.fy = mon.y = ty; mon.path = null; }
      extra = r.win ? `The ${lc(k.name)} fled, wounded. Finish it with an all-out attack.` : `The ${lc(k.name)} threw back the hunters.`;
    }
    G.report(s, [m.owner], `${r.win ? 'Victory' : 'Defeat'} against the ${lc(k.name)} (${tx}, ${ty})`, r.win ? 'win' : 'loss',
      { att: me.name, def: k.name, A: r.A, D: r.D, attSent: m.units, attLost: r.attLost, defHad, defLost: r.defLost, loot, extra, tactics: r.tactics });
    G.sendHome(s, homeward(m), r.attLeft, loot);
  };
  const baseResolve = G.resolveMove;
  G.resolveMove = (s, m) => {
    if (m.monster && (m.type === 'attack' || m.type === 'raid' || m.type === 'intercept')) return huntArrive(s, m);
    // a crisis source does not scatter after a raid: only an all-out attack can cast it down
    if (m.type === 'raid') { const t = G.tileAt(s, m.x, m.y), k = t && t.camp && s.camps[t.camp]; if (k && k.kind === 'crisis') m.type = 'attack'; }
    return baseResolve(s, m);
  };

  // the send form's estimate against a creature
  const basePreview = G.previewBattle;
  G.previewBattle = (s, city, tile, units, mode) => {
    // a crisis source's guardians are known to all (their estimate is the real host, not a brigand band)
    const ck = tile && tile.camp && s.camps[tile.camp];
    if (ck && ck.kind === 'crisis' && !s.intel[G.tileIdx(s, tile)] && G.unitsCount(units)) {
      const edge = G.armyEdge(s, city.owner, city, units), pl = G.planMarch(s, city.owner, city, tile, units);
      const r = G.battle(s, city.owner, units, edge.mult, null, { ...ck.units }, 1, 5 * ck.tier, { mode: 'attack', x: tile.x, y: tile.y, path: pl.ok ? pl.path : null, naval: pl.ok && pl.naval, labels: edge.labels });
      return { known: true, estimated: true, age: null, ...r };
    }
    const mon = tile && !tile.city && !tile.camp && !tile.oasis && !tile.ruin && !tile.minor ? G.monsterAt(s, tile.x, tile.y) : null;
    if (!mon) return basePreview(s, city, tile, units, mode);
    if (!G.unitsCount(units)) return null;
    const edge = G.armyEdge(s, city.owner, city, units);
    const pl = G.planMarch(s, city.owner, city, tile, units);
    const r = G.battle(s, city.owner, units, edge.mult, null, { ...mon.units }, 1, 0, { mode: mode === 'raid' ? 'raid' : 'attack', x: tile.x, y: tile.y, path: pl.ok ? pl.path : null, naval: pl.ok && pl.naval, labels: edge.labels });
    return { known: true, estimated: true, age: null, monster: true, ...r };
  };

  // -------------------------------------------------------------------
  // AI: hunt creatures near home when strong enough (and the crisis' sources)
  // -------------------------------------------------------------------
  const offOf = (c, share = 0.75) => {
    const off = {};
    for (const [u, n] of Object.entries(c.units)) {
      const d = DATA.units[u];
      if (!d || n <= 0 || d.type === 'civ' || d.type === 'hero' || d.type === 'siege' || d.type === 'ship') continue;
      if (d.atk >= (d.defI + d.defC) / 2 * 0.7) { const k = Math.floor(n * share); if (k > 0) off[u] = k; }
    }
    return off;
  };
  G.aiHunt = (s, emp) => {
    if (s.moves.some(m => m.owner === emp.id && m.monster)) return false;
    let best = null;
    for (const c of G.citiesOf(s, emp.id)) {
      const off = offOf(c);
      if (!G.unitsCount(off) || G.atkPower(s, emp.id, off) < 150) continue;
      for (const mon of Object.values(mons(s))) {
        const k = KIND[mon.kind];
        if (k.move === 'sea') continue;
        const t = tileOf(s, mon), d = Math.hypot(t.x - c.x, t.y - c.y);
        const threat = k.crisis || k.behave === 'raider' || k.behave === 'night' || k.behave === 'hunter';
        if (d > (k.crisis ? 9 : threat ? 6 : 3.5)) continue;
        const tile = G.tileAt(s, t.x, t.y);
        if (!tile || occupied(tile) || G.isWater(tile) || !G.landReachable(s, c, tile)) continue;
        const r = G.battle(s, emp.id, off, 1, null, { ...mon.units }, 1, 0, { mode: 'attack', x: t.x, y: t.y });
        if (!r.win || r.attLoss > 0.4) continue;
        const sc = d - (threat ? 4 : 0) - (k.crisis ? 6 : 0) + r.attLoss * 6;
        if (!best || sc < best.sc) best = { sc, c, t, off };
      }
    }
    if (!best) return false;
    return !G.sendArmy(s, best.c.id, best.t.x, best.t.y, 'attack', best.off);
  };
  G.aiHooks.push((s, emp, dtMin) => {
    emp.huntClock = (emp.huntClock || 0) + dtMin;
    if (emp.huntClock < 5 * PT(s)) return;
    emp.huntClock = 0;
    if (s.crisis && s.crisis.status === 'active') aiCrisis(s, emp);
    if (G.aiPressure(s) > 0 && Object.keys(mons(s)).length) G.aiHunt(s, emp);
  });

  // -------------------------------------------------------------------
  // THE CRISIS
  // -------------------------------------------------------------------
  // srcUnit/srcN: the guardians of each source; band: the roaming warband kind it sends out
  DATA.crises = {
    demons: { name: 'The Demon Incursion', icon: '👹', color: '#7a2a8a', band: 'fiends', srcName: 'Great rift', srcUnit: 'demon', srcN: 120, srcGrow: 26, portrait: 'demon',
      ritual: { name: 'Seal the weave', cost: { mana: 250, gold: 400 } },
      text: 'The weave, strained by too much magic, tears open. Great rifts spill fiend hosts upon every realm.',
      fx: { 3: { popGrowth: 0.85 }, 4: { popGrowth: 0.7, tax: 0.9 } } },
    winter: { name: 'The Long Winter', icon: '❄️', color: '#5a8ab8', band: 'wraiths', srcName: 'Frost cairn', srcUnit: 'frostgiant', srcN: 16, srcGrow: 4.6, portrait: 'elemental',
      ritual: { name: 'Kindle the Great Hearthfires', cost: { timber: 900, grain: 700 } },
      text: 'An ice age creeps down from the north. Frost giants raise cairns that feed the cold; the seas freeze and the harvests fail.',
      fx: { 2: { grain: 0.85, fishing: 0.6 }, 3: { grain: 0.75, fishing: 0.4, travel: 0.9 }, 4: { grain: 0.65, fishing: 0.25, travel: 0.85, upkeep: 1.1 } } },
    wyrmking: { name: 'Return of the Wyrm-King', icon: '🐲', color: '#a8321e', band: 'drakes', srcName: 'Dragon eyrie', srcUnit: 'drake', srcN: 48, srcGrow: 11, portrait: 'wyrm',
      ritual: { name: 'Forge the Dragonbane', cost: { iron: 300, weapons: 150 } },
      text: 'The Wyrm-King wakes beneath the mountains. Its brood nests in eyries across the heights, and drake flights burn the fields.',
      fx: { 3: { grain: 0.88, timber: 0.88 }, 4: { grain: 0.78, timber: 0.78 } } },
    deadmarch: { name: 'The Dead March', icon: '☠️', color: '#3d6a4a', band: 'deadcol', srcName: 'Barrow gate', srcUnit: 'restless', srcN: 140, srcGrow: 30, portrait: 'undead',
      ritual: { name: 'The Rite of Lasting Rest', cost: { gold: 500, grain: 600 } },
      text: 'So many have fallen that the barrows open. The dead march in columns on the living, and every grave adds to their ranks.',
      fx: { 3: { popGrowth: 0.85 }, 4: { popGrowth: 0.7 } } },
  };
  const CR = DATA.crises;
  const STAGES = ['Omens', 'Rising', 'Onslaught', 'Cataclysm'];
  G.CRISIS_STAGES = STAGES;
  const stageLen = s => MIN(s, 45);
  G.crisisGoal = 100;

  // when the crisis comes: Endless after ~5 game-hours, Conquest only after ~10 (scaled by pace and hostility)
  G.crisisDueAt = s => {
    const endless = s.settings && s.settings.mode === 'endless';
    return (endless ? 5 : 10) * 3600 * PT(s) / Math.pow(hostK(s), 0.5);
  };
  G.crisisDue = s => {
    if (s.gameOver || (s.crisis && s.crisis.status === 'active')) return false;
    if (s.time < G.crisisDueAt(s) || G.aiPressure(s) < 0.9) return false;
    if (s.crisisNext && s.time < s.crisisNext) return false;
    return Object.values(s.empires).filter(e => !e.dead).length >= 2;
  };
  // which crisis: chosen by the state of the world
  G.crisisWeights = s => {
    const casts = s.magic && s.magic.casts ? Object.values(s.magic.casts).reduce((a, o) => a + Object.values(o || {}).reduce((b, l) => b + (Array.isArray(l) ? l.length : 0), 0), 0) : 0;
    const strain = s.magic && s.magic.strain ? Object.values(s.magic.strain).reduce((a, b) => a + b, 0) : 0;
    const rifts = Object.values(s.camps).filter(k => k.kind === 'rift').length;
    const N = s.tiles.length || 1;
    const mount = s.tiles.filter(t => t.terrain === 'mountain').length / N;
    const wyrms = (s.calamities || []).filter(c => c.kind === 'wyrm').length + (G.chronStat ? G.chronStat(s, 'wyrms') : 0);
    const grave = Object.values(s.empires).filter(e => !e.dead && e.race === 'grave').length;
    const wins = Object.values(s.empires).reduce((a, e) => a + (e.wins || 0), 0);
    const se = G.season(s).index;
    return {
      demons: 0.6 + casts / 25 + strain / 150 + rifts * 1.5,
      winter: 1 + (se >= 2 ? 0.8 : 0) + (s.tiles.some(t => t.y < s.map * 0.2 && !G.isWater(t)) ? 0.3 : 0),
      wyrmking: 0.6 + wyrms * 1.2 + mount * 6,
      deadmarch: 0.6 + grave * 1.5 + wins / 120,
    };
  };
  const pickCrisis = s => {
    const w = G.crisisWeights(s);
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
    return 'winter';
  };

  const crisisCamp = (s, def, t, n, i) => {
    const id = G.newId(s, 'k');
    s.camps[id] = { id, x: t.x, y: t.y, tier: 6, units: { [def.srcUnit]: n }, loot: { grain: 1500, timber: 1500, stone: 1500, ore: 1500, iron: 400, tools: 120, weapons: 200 }, kind: 'crisis', ck: s.crisis.kind, idx: i };
    t.camp = id;
    G.reveal(s, t.x, t.y, 2);
    return id;
  };
  const sourceSpots = (s, kind, n) => {
    const N = s.map, out = [];
    const ok = t => !occupied(t) && !G.isWater(t) && !(DATA.terrain[t.terrain] || {}).impassable && Object.values(s.cities).every(c => G.dist(c, t) >= 3) && out.every(o => G.dist(o, t) >= N / 5);
    for (let i = 0; i < n; i++) {
      let pred;
      if (kind === 'winter') pred = t => t.y < N * 0.3 && ok(t);                        // the north
      else if (kind === 'wyrmking') pred = t => (t.terrain === 'mountain' || t.terrain === 'hills') && ok(t);
      else if (kind === 'deadmarch') pred = t => ok(t) && (s.special.some(r => r.ruin && G.dist(r, t) <= 3) || Math.random() < 0.3);
      else pred = t => ok(t) && Object.values(s.cities).some(c => G.dist(c, t) <= 7);
      const t = G.freeTile(s, pred, 5000) || G.freeTile(s, ok, 5000);
      if (t) out.push(t);
    }
    return out;
  };

  G.startCrisis = (s, kind) => {
    kind = kind || pickCrisis(s);
    const def = CR[kind];
    if (!def) return null;
    const n = 3;
    s.crisis = { kind, stage: 1, start: s.time, status: 'active', progress: 0, goal: G.crisisGoal, sources: [], contrib: {}, ritualN: {}, ritualAt: {}, bandAt: s.time + MIN(s, 8), slain: 0 };
    s.crisis.end = s.time + stageLen(s) * STAGES.length;
    const spots = sourceSpots(s, kind, n);
    const H = HOURS(s);
    spots.forEach((t, i) => s.crisis.sources.push(crisisCamp(s, def, t, Math.round((def.srcN + def.srcGrow * H) * G.rnd(0.9, 1.1)), i)));
    s.crisis.srcPos = spots.map(t => [t.x, t.y]);
    s.crisis.nSources = s.crisis.sources.length;
    // the realms set their quarrels aside: wars among the AI realms pause, everyone warms to the player
    // wars among the AI realms end in a grand truce (a 'crisis' treaty: js/diplomacy.js) that lasts as long as the crisis
    s.crisis.truce = [];
    for (const [k, r] of Object.entries(s.airel || {})) if (r.status === 'war') {
      const [a, b] = k.split('|');
      if (G.signTreaty && DATA.treatyKinds && DATA.treatyKinds.crisis) G.signTreaty(s, 'crisis', a, b, { by: a, quiet: true });
      if (r.status === 'war') { r.status = 'peace'; r.since = s.time; }
      s.crisis.truce.push(k);
    }
    for (const e of Object.values(s.empires)) if (e.id !== 'p' && !e.dead && G.rel) { const r = G.rel(s, e.id); r.opinion = G.clamp(r.opinion + 15, -100, 100); }
    G.log(s, 'p', `${def.icon} ${def.name}! ${def.text} Destroy its ${spots.length} ${def.srcName.toLowerCase()}s or complete the ritual "${def.ritual.name}" before it ravages every realm.`, 'bad');
    // the rivals offer the player the grand truce: every war (and every cold standoff) ends in a pact while the crisis lasts
    const rivals = Object.values(s.empires).filter(e => e.id !== 'p' && !e.dead && G.rel && ['war', 'neutral'].includes(G.rel(s, e.id).status));
    if (G.addPending && rivals.length) {
      const atWar = rivals.filter(e => G.rel(s, e.id).status === 'war').length;
      G.addPending(s, { kind: 'crisis', title: `${def.icon} ${def.name}: a grand truce`, text: `Envoys from ${rivals.length > 1 ? rivals.length + ' courts' : 'the ' + rivals[0].name} propose a grand truce while ${def.name.replace(/^The /, 'the ')} lasts: ${atWar ? 'every war with you ends in peace, and ' : ''}no side may attack the other until it passes. No realm will start a war on one that fights the crisis, and every court warms to those who help destroy it. Refuse, and they will still be slow to strike you while the world burns.`,
        options: [{ key: 'truce', label: 'Swear the grand truce' }, { key: 'no', label: 'Our wars go on' }], expires: s.time + MIN(s, 10), def: 'no', data: { ev: 'truce' } });
    }
    if (G.chronEvent) G.chronEvent(s, 'crisis', { x: def.name, c: 'start', n: 1 });
    return s.crisis;
  };
  G.pendingHandlers.crisis = (s, p, key) => {
    if (p.data.ev === 'truce' && key === 'truce') {
      if (!G.crisisActive(s)) return 'The crisis has passed';
      for (const e of Object.values(s.empires)) {
        if (e.id === 'p' || e.dead) continue;
        const r = G.rel(s, e.id);
        if (r.status !== 'war' && r.status !== 'neutral') continue;
        if (G.signTreaty && DATA.treatyKinds && DATA.treatyKinds.crisis) G.signTreaty(s, 'crisis', 'p', e.id, { by: e.id, quiet: true });
        if (r.status === 'war') { r.status = 'peace'; r.since = s.time; }
      }
      G.log(s, 'p', '🕊️ The grand truce is sworn: our wars end while the crisis lasts.', 'good');
    }
    return null;
  };

  G.crisisSourcesLeft = s => s.crisis ? s.crisis.sources.filter(id => s.camps[id] && G.unitsCount(s.camps[id].units) > 0) : [];
  const crisisPoints = (s, owner, pts) => {
    const c = s.crisis;
    if (!c || c.status !== 'active') return;
    c.progress = Math.min(c.goal, c.progress + pts);
    c.contrib[owner] = (c.contrib[owner] || 0) + pts;
  };
  G.crisisPoints = crisisPoints;
  G.ritualCost = (s, owner) => {
    const c = s.crisis; if (!c) return null;
    const base = CR[c.kind].ritual.cost, k = Math.pow(1.25, (c.ritualN[owner] || 0)) * (1 + HOURS(s) / 12);
    return Object.fromEntries(Object.entries(base).map(([g, v]) => [g, Math.round(v * k)]));
  };
  G.RITUAL_PTS = 5;
  G.ritualStatus = (s, owner, cityId) => {
    const c = s.crisis;
    if (!c || c.status !== 'active') return 'There is no crisis';
    const city = s.cities[cityId];
    if (!city || city.owner !== owner) return 'Choose one of your cities';
    if ((c.ritualAt[owner] || 0) > s.time) return `The rite can be performed again in ${Math.ceil((c.ritualAt[owner] - s.time) / 60)} min`;
    if (!G.canAfford(s, city, G.ritualCost(s, owner))) return 'Not enough goods in ' + city.name;
    return null;
  };
  G.crisisContribute = (s, owner, cityId) => {
    const err = G.ritualStatus(s, owner, cityId);
    if (err) return err;
    const c = s.crisis, city = s.cities[cityId];
    G.pay(s, city, G.ritualCost(s, owner));
    c.ritualN[owner] = (c.ritualN[owner] || 0) + 1;
    c.ritualAt[owner] = s.time + MIN(s, 10);
    crisisPoints(s, owner, G.RITUAL_PTS);
    const def = CR[c.kind];
    if (owner === 'p') G.log(s, 'p', `${def.icon} ${city.name} gives to the rite: "${def.ritual.name}" (${Math.round(c.progress)}/${c.goal}).`, 'good');
    return null;
  };

  const endCrisis = (s, won) => {
    const c = s.crisis, def = CR[c.kind];
    c.status = won ? 'won' : 'lost';
    c.ended = s.time;
    s.crisisNext = s.time + 5 * 3600 * PT(s);
    // the sources and warbands melt away
    for (const id of c.sources) { const k = s.camps[id]; if (k) { const t = G.tileAt(s, k.x, k.y); if (t) t.camp = null; delete s.camps[id]; } }
    for (const mon of Object.values(mons(s))) if (mon.crisis) delete mons(s)[mon.id];
    // the grand truce ends with the crisis (the peace it made stays)
    if (G.treatiesOf && G.endTreaty) for (const t of [...((s.dip && s.dip.treaties) || [])]) if (t.kind === 'crisis') G.endTreaty(s, t, 'expired', null);
    if (won) {
      const total = Object.values(c.contrib).reduce((a, b) => a + b, 0) || 1;
      for (const e of Object.values(s.empires)) {
        if (e.dead) continue;
        const share = (c.contrib[e.id] || 0) / total;
        if (!c.contrib[e.id]) continue;          // only those who fought or gave share the glory
        const ren = Math.round(30 + 120 * share);
        e.renownBonus = (e.renownBonus || 0) + ren;
        if (e.id === 'p') c.reward = ren;
      }
      G.log(s, 'p', `${def.icon} ${def.name} is over: the realms prevailed!${c.reward ? ` Our part earns +${c.reward} renown.` : ' We played no part in the victory.'}`, 'good');
    } else {
      // the crisis ravages every realm
      for (const city of Object.values(s.cities)) {
        city.pop = Math.max(3, city.pop * 0.82);
        for (const u of Object.keys(city.units)) if (u !== 'hero') city.units[u] = Math.floor(city.units[u] * 0.85);
        const blds = Object.keys(city.buildings).filter(b => b !== 'townhall' && city.buildings[b] > 1 && !(DATA.buildings[b] || {}).wonder);
        if (blds.length) city.buildings[G.pick(blds)]--;
      }
      G.log(s, 'p', `${def.icon} ${def.name} ravaged the world: every realm lost people, soldiers and buildings before it faded.`, 'bad');
    }
    if (G.chronEvent) G.chronEvent(s, 'crisis', { x: def.name, c: won ? 'won' : 'lost', n: c.stage });
  };
  G.endCrisis = endCrisis;

  G.crisisTick = s => {
    const c = s.crisis;
    if (!c || c.status !== 'active') return;
    const def = CR[c.kind];
    const left = G.crisisSourcesLeft(s);
    if (left.length < (c.lastLeft ?? c.nSources)) {
      const k = (c.lastLeft ?? c.nSources) - left.length;
      c.progress = Math.min(c.goal, c.progress + k * 20);
      G.log(s, 'p', `${def.icon} A ${def.srcName.toLowerCase()} has fallen (${c.nSources - left.length}/${c.nSources}).`, 'good');
    }
    c.lastLeft = left.length;
    if (!left.length || c.progress >= c.goal) { endCrisis(s, true); return; }
    const stage = Math.min(STAGES.length, 1 + Math.floor((s.time - c.start) / stageLen(s)));
    if (stage > c.stage) {
      c.stage = stage;
      G.log(s, 'p', `${def.icon} ${def.name} grows worse: ${STAGES[stage - 1]} (stage ${stage}/${STAGES.length}).`, 'bad');
      // the sources swell
      for (const id of left) { const k = s.camps[id]; const u = def.srcUnit; k.units[u] = Math.round((k.units[u] || 0) * 1.15); }
    }
    if (s.time >= c.end) { endCrisis(s, false); return; }
    // warbands go out from the sources
    if (s.time >= c.bandAt) {
      c.bandAt = s.time + MIN(s, G.rnd(16, 22) - 2 * c.stage);
      const alive = Object.values(mons(s)).filter(m => m.crisis).length;
      if (c.stage >= 2 && alive < 1 + c.stage) {
        const src = s.camps[G.pick(left)];
        const near = src && (G.freeTile(s, t => G.dist(t, src) <= 2.5 && G.dist(t, src) >= 1 && !G.isWater(t), 800));
        if (near) G.spawnMonster(s, def.band, near, { crisis: true, src: src.id, mult: 0.7 + 0.25 * c.stage });
      }
    }
  };
  // omens come first: the crisis breaks some 25 game-minutes after they are seen
  G.slowHooks.push(s => {
    if (s.gameOver) return;
    if (G.crisisDue(s)) {
      if (!s.crisisOmen) {
        const kind = pickCrisis(s);
        s.crisisOmen = { kind, at: s.time + MIN(s, 25) };
        const def = CR[kind];
        G.log(s, 'p', `${def.icon} Dark omens: ${({ demons: 'the sky splits with violet light at night', winter: 'frost on the fields in high summer, and the birds fly south', wyrmking: 'the mountains smoke and the herds flee the heights', deadmarch: 'the barrows groan and the dogs howl at the graves' })[kind]}. Something terrible is coming — ${def.name.replace(/^The /, 'the ')}.`, 'warn');
      } else if (s.time >= s.crisisOmen.at) { const kind = s.crisisOmen.kind; s.crisisOmen = null; G.startCrisis(s, kind); }
    }
    G.crisisTick(s);
  });
  G.crisisActive = s => !!(s.crisis && s.crisis.status === 'active');
  // a realm fighting the crisis: it has given to the rite or slain its creatures, or has an army marching on a source
  // or a crisis warband. No AI realm starts a war on it while the crisis lasts (js/diplomacy.js).
  G.crisisFighter = (s, id) => {
    const c = s.crisis;
    if (!c || c.status !== 'active' || !id) return false;
    if ((c.contrib[id] || 0) > 0) return true;
    const atSource = m => { if (m.type !== 'attack' && m.type !== 'raid') return false; const t = G.tileAt(s, m.x, m.y), k = t && t.camp && s.camps[t.camp]; return !!(k && k.kind === 'crisis'); };
    return s.moves.some(m => m.owner === id && (m.crisisSrc || (m.monster && mons(s)[m.monster] && mons(s)[m.monster].crisis) || atSource(m)));
  };
  G.crisisInfo = s => {
    const c = s.crisis;
    if (!c) return null;
    const def = CR[c.kind];
    return { kind: c.kind, name: def.name, icon: def.icon, stage: c.stage, stageName: STAGES[c.stage - 1], progress: c.progress, goal: c.goal,
      sources: G.crisisSourcesLeft(s).length, nSources: c.nSources, left: Math.max(0, c.end - s.time), status: c.status, ritual: def.ritual.name, text: def.text };
  };

  // the realms set their quarrels aside while the world burns
  const prevHost = G.hostility;
  G.hostility = (s, aiId, target) => {
    const h = prevHost(s, aiId, target);
    if (h <= 0 || !s.crisis || s.crisis.status !== 'active') return h;
    return h * (target === 'p' ? 0.15 : 0.2);
  };
  // the crisis' own blight on every realm
  G.modSources.push((s, owner, city, key) => {
    const c = s.crisis;
    if (!c || c.status !== 'active') return 1;
    const fx = CR[c.kind].fx;
    let m = 1;
    for (let st = 1; st <= c.stage; st++) {
      const f = fx[st] && fx[st][key];
      if (!f) continue;
      if (c.kind === 'winter' && city) {
        // the ice spreads from the north: a third of the map at stage 2, two thirds at 3, all of it at 4
        const front = s.map * Math.min(1, (c.stage - 1) / 3);
        if (city.y > front) continue;
      }
      m = f;           // the latest stage's figure
    }
    return m;
  });
  // the Long Winter: in its last stage, winter everywhere, whatever the calendar says
  const baseSeason = G.season;
  G.season = s => {
    const se = baseSeason(s);
    if (s && s.crisis && s.crisis.status === 'active' && s.crisis.kind === 'winter' && s.crisis.stage >= 4 && se.index !== 3) return { ...se, index: 3, name: G.SEASONS[3] };
    return se;
  };
  G.winterFront = s => s.crisis && s.crisis.status === 'active' && s.crisis.kind === 'winter' ? s.map * Math.min(1, (s.crisis.stage - 1) / 3) : 0;

  // AI: rich realms give to the rite; strong ones march on the sources
  const aiCrisis = (s, emp) => {
    const c = s.crisis;
    const cities = G.citiesOf(s, emp.id);
    if (!cities.length) return;
    if ((c.ritualAt[emp.id] || 0) <= s.time && Math.random() < 0.35) {
      const city = cities.find(cc => !G.ritualStatus(s, emp.id, cc.id) && G.canAfford(s, cc, G.ritualCost(s, emp.id), 2));
      if (city) G.crisisContribute(s, emp.id, city.id);
    }
    if (s.moves.some(m => m.owner === emp.id && m.crisisSrc)) return;
    for (const id of G.crisisSourcesLeft(s)) {
      const k = s.camps[id];
      for (const cc of cities) {
        if (G.dist(cc, k) > 14 || !G.landReachable(s, cc, k)) continue;
        const off = offOf(cc, 0.85);
        if (!G.unitsCount(off)) continue;
        const r = G.battle(s, emp.id, off, 1, null, { ...k.units }, 1, 5 * k.tier, { mode: 'attack', x: k.x, y: k.y });
        if (!r.win) continue;
        const n0 = s.moves.length;
        if (!G.sendArmy(s, cc.id, k.x, k.y, 'attack', off)) { for (let i = n0; i < s.moves.length; i++) s.moves[i].crisisSrc = id; return; }
      }
    }
  };
  G.aiCrisis = aiCrisis;
  // a source destroyed: credit the victor
  G.battleHooks.push((s, ctx) => {
    if (!ctx.tile || !ctx.r || !ctx.r.win || !s.crisis || s.crisis.status !== 'active') return;
    const had = ctx.defHad || {};
    if (ctx.site === 'camp' && had[CR[s.crisis.kind].srcUnit] && !ctx.tile.camp && (s.crisis.srcPos || []).some(([x, y]) => x === ctx.tile.x && y === ctx.tile.y)) {
      const c = s.crisis;
      c.contrib[ctx.m.owner] = (c.contrib[ctx.m.owner] || 0) + 20;
      if (ctx.m.owner === 'p' && G.chronEvent) G.chronEvent(s, 'crisis', { x: CR[c.kind].srcName, c: 'source', n: c.stage });
    }
  });

  // -------------------------------------------------------------------
  // the chronicle
  // -------------------------------------------------------------------
  if (G.chronText) {
    const baseText = G.chronText;
    G.chronText = (s, ev) => {
      if (ev.k === 'hunt') return `${ev.a === 'p' ? 'Our hunters' : 'Hunters'} slew the ${lc(String(ev.x || 'beast'))}.`;
      if (ev.k === 'crisis') {
        const nm = String(ev.x || 'the crisis').replace(/^The /, 'the ');
        const t = ev.c === 'start' ? `${nm} began, and every realm trembled` : ev.c === 'won' ? `${nm} was overcome, and the realms stood together to the end`
          : ev.c === 'source' ? `our armies cast down a ${nm.toLowerCase()} of the crisis` : `${nm} ravaged the world before it passed`;
        return t.charAt(0).toUpperCase() + t.slice(1) + '.';
      }
      return baseText(s, ev);
    };
  }
  if (G.CHRON_KINDS) { G.CHRON_KINDS.war.push('hunt'); G.CHRON_KINDS.realm.push('crisis'); }

  // old saves: nothing roams yet, and no crisis has come
  const baseMigrate = G.migrate;
  G.migrate = function (s) {
    const out = baseMigrate.apply(this, arguments) || s;
    out.monsters = out.monsters || {};
    for (const mon of Object.values(out.monsters)) if (!KIND[mon.kind]) delete out.monsters[mon.id];
    return out;
  };
})();
