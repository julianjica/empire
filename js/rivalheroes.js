// =====================================================================
//  Rival heroes — every AI realm fields a champion with a personality.
//  Hero state lives on s.empires[id].hero (same shape as the player's,
//  see hero.js). This module names them, spends their points, sends them
//  into ruins, lets them lead big attacks and guard threatened cities,
//  revives them for gold, and announces famous heroes in the Chronicle.
// =====================================================================
'use strict';
{
  DATA.heroNames = {
    hearth: ['Bertram Oakshield', 'Wynna of the Ford', 'Cedric Thornfield', 'Maud Ashcombe', 'Osric Hollowell', 'Elspeth Fairbairn', 'Garrick Wheatley', 'Rosalind Brackenridge'],
    delver: ['Borgrim Deepanvil', 'Hilda Stonebrow', 'Kragga Ironmantle', 'Brokka Flintvein', 'Odda Hammerfall', 'Gundar Slatebeard', 'Thessa Cobblehelm', 'Ruddik Copperjaw'],
    sylvan: ['Ithrael Dawnwhisper', 'Saelith Moonbough', 'Caerwyn Thistledown', 'Aelor Silverbark', 'Lysandre Fernsong', 'Nimrae Starbloom', 'Faelan Mistwood', 'Oriel Ashenleaf'],
    ash:    ['Gorrak Bloodtusk', 'Vashka the Red', 'Murz Skullbreaker', 'Kharza Cinderfang', 'Drazhul Ashmaw', 'Zugra Ironhide', 'Throk Embergut', 'Yeska Smoke-Eye'],
  };
  // points: share of attribute points; join: chance to lead a big attack; adv: appetite for ruins; trinket: preferred trinket effect
  DATA.heroPersonalities = {
    warlord:    { name: 'Warlord',    icon: '⚔️', desc: 'trains might and leadership, and leads the realm\'s big attacks', points: { str: 0.5, lead: 0.5 }, join: 0.85, adv: 0.35, trinket: 'lead' },
    steward:    { name: 'Steward',    icon: '📜', desc: 'tends the capital\'s fields and walls',                          points: { econ: 0.5, guard: 0.5 }, join: 0.2, adv: 0.25, trinket: 'good' },
    adventurer: { name: 'Adventurer', icon: '🧭', desc: 'trains might and a little arcana, and roams the ruins for treasure',                  points: { str: 0.8, arcana: 0.2 }, join: 0.45, adv: 1, trinket: 'xp' },
  };
  // which personalities each people tends to raise
  const RACE_BENT = {
    hearth: { warlord: 1, steward: 2, adventurer: 1 },
    delver: { warlord: 1, steward: 2, adventurer: 1 },
    sylvan: { warlord: 1, steward: 1, adventurer: 2 },
    ash:    { warlord: 3, steward: 0.5, adventurer: 1 },
  };
  const ANY_BENT = { warlord: 1, steward: 1, adventurer: 1 };   // peoples added later (races2.js)
  // AI heroes learn a little slower than the player's, more so on gentle settings
  const AI_XP = { easy: 0.35, normal: 0.5, hard: 0.7 };
  const HOSTILE = ['raid', 'attack', 'conquer'];
  const P_OF = h => DATA.heroPersonalities[h.personality] || DATA.heroPersonalities.warlord;

  const weighted = obj => {
    const tot = Object.values(obj).reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (const [k, w] of Object.entries(obj)) { r -= w; if (r <= 0) return k; }
    return Object.keys(obj)[0];
  };

  G.newRivalHero = (s, emp) => {
    const used = new Set(Object.values(s.empires).map(e => e.hero && e.hero.name));
    // a people's own list (DATA.races[race].heroNames, e.g. from races2.js) wins over ours
    const list = (DATA.races[emp.race] && DATA.races[emp.race].heroNames) || DATA.heroNames[emp.race] || [].concat(...Object.values(DATA.heroNames));
    const names = list.filter(n => !used.has(n));
    const h = G.newHeroState(G.pick(names.length ? names : list));
    h.personality = weighted(RACE_BENT[emp.race] || ANY_BENT);
    h.rival = true;
    return h;
  };

  // give an AI realm its hero if it has none (new games, and lazily for older saves)
  G.ensureRivalHero = (s, emp) => {
    if (!emp || emp.id === 'p') return null;
    if (!emp.hero) {
      emp.hero = G.newRivalHero(s, emp);
      const cap = !emp.dead && G.capital(s, emp.id);
      if (cap) cap.units.hero = 1;
    }
    const h = emp.hero;
    if (!h.personality) h.personality = weighted(RACE_BENT[emp.race] || ANY_BENT);
    return h;
  };

  G.newGameHooks.push(s => { for (const e of Object.values(s.empires)) if (e.id !== 'p') G.ensureRivalHero(s, e); });

  G.modSources.push((s, owner, city, key) => {
    if (key !== 'heroXp' || owner === 'p' || !owner) return 1;
    return AI_XP[s.settings.difficulty] || AI_XP.normal;
  });

  // ---- where is it? ----
  G.rivalHeroStatus = (s, id) => {
    const h = G.heroOf(s, id);
    if (!h) return { key: 'none', text: 'no champion' };
    if (h.dead) return { key: 'fallen', text: h.reviveAt ? 'fallen (being revived)' : 'fallen' };
    const m = G.heroMovingOf(s, id);
    if (m) return { key: 'marching', text: m.type === 'adventure' ? 'off to the ruins' : m.type === 'return' ? 'marching home' : HOSTILE.includes(m.type) ? 'leading an army' : 'on the road', move: m };
    const c = G.heroCityOf(s, id);
    if (c) return { key: 'home', text: 'at ' + c.name, city: c };
    return { key: 'unknown', text: 'whereabouts unknown' };
  };

  // ---- spending, equipment ----
  const spendPoints = (s, emp, h) => {
    const want = P_OF(h).points;
    while (h.free > 0) {
      const total = Object.values(h.points).reduce((a, b) => a + b, 0) + 1;
      let best = null, bd = -1e9;
      for (const [k, w] of Object.entries(want)) { const d = w * total - h.points[k]; if (d > bd) { bd = d; best = k; } }
      if (G.heroAssign(s, best, emp.id)) break;
    }
  };
  const itemScore = (h, it) => {
    if (!it) return -1;
    let v = it.rarity + 1;
    if (it.slot === 'trinket') {
      const pref = P_OF(h).trinket;
      if (it.fx[pref] || (pref === 'xp' && it.fx.regen)) v += 2;
    }
    return v;
  };
  G.rivalEquipBest = (s, emp) => {
    const h = G.heroOf(s, emp.id);
    if (!h) return;
    for (const slot of ['weapon', 'armor', 'horse', 'trinket']) {
      const best = h.items.filter(it => it.slot === slot).sort((a, b) => itemScore(h, b) - itemScore(h, a))[0];
      if (best && itemScore(h, best) > itemScore(h, h.eq[slot])) G.heroEquip(s, best.id, emp.id);
    }
    // sell what it will never wear
    while (h.items.length > 4) {
      const worst = h.items.slice().sort((a, b) => itemScore(h, a) - itemScore(h, b))[0];
      G.heroSell(s, worst.id, emp.id);
    }
  };

  // ---- threats against a realm ----
  const threats = (s, id) => s.moves.filter(m => m.owner !== id && HOSTILE.includes(m.type) && (() => {
    const t = G.tileAt(s, m.x, m.y); const c = t && t.city && s.cities[t.city]; return c && c.owner === id;
  })());

  // ---- lead the big attack just sent by aiWar this tick ----
  const joinAttacks = (s, emp, h) => {
    const p = P_OF(h);
    for (const m of s.moves) {
      if (m.owner !== emp.id || m.heroChecked || !HOSTILE.includes(m.type)) continue;
      m.heroChecked = true;
      if (m.units.hero || m.depart !== s.time || h.dead || h.hp < 60) continue;
      const city = s.cities[m.from];
      if (!city || city.owner !== emp.id || !(city.units.hero > 0)) continue;
      const tile = G.tileAt(s, m.x, m.y);
      const target = tile.city && s.cities[tile.city];
      const A = G.atkPower(s, emp.id, m.units);
      let chance;
      // against the player the hero rides out less often (scaled by the Rivals setting), so it doesn't pile onto every raid
      if (target) chance = A >= 500 ? p.join * (target.owner === 'p' ? 0.7 * Math.min(1, s.settings.hostility) : 1) : 0;
      else if (tile.camp) chance = p.join * 0.3;
      else chance = 0;
      if (!chance || Math.random() >= chance) continue;
      if (threats(s, emp.id).some(t => t.x === city.x && t.y === city.y)) continue;   // stays to defend its own walls
      delete city.units.hero;
      m.units.hero = 1;
      m.arrive = m.depart + G.travelTime(s, emp.id, city, tile, G.slowest(s, emp.id, m.units));
      h.ledAttacks = (h.ledAttacks || 0) + 1;
      return true;
    }
    return false;
  };

  // ---- guard a threatened city, otherwise rest in the capital ----
  const guard = (s, emp, h, home) => {
    const cap = G.capital(s, emp.id);
    const th = threats(s, emp.id).filter(m => !m.heroAnswered);
    if (th.length) {
      th.sort((a, b) => (b.x === cap.x && b.y === cap.y) - (a.x === cap.x && a.y === cap.y) || a.arrive - b.arrive);
      for (const m of th) {
        m.heroAnswered = true;
        if (m.x === home.x && m.y === home.y) return true;      // already standing on those walls
        const t = G.tileAt(s, m.x, m.y);
        if (h.hp >= 30 && G.travelTime(s, emp.id, home, t, G.heroStats(s, emp.id).spd) < m.arrive - s.time
          && !G.sendArmy(s, home.id, m.x, m.y, 'reinforce', { hero: 1 })) { h.guarded = (h.guarded || 0) + 1; return true; }
      }
      return true;     // under threat: stay put
    }
    if (threats(s, emp.id).length) return true;
    // idle away from the capital (after a conquest or a defence): head back
    if (cap && home !== cap && h.hp >= 20 && Math.random() < 0.2) { G.sendArmy(s, home.id, cap.x, cap.y, 'reinforce', { hero: 1 }); return true; }
    return false;
  };

  // ---- ruins near its own realm ----
  const adventure = (s, emp, h, home) => {
    const p = P_OF(h);
    if (h.hp < 75 || (emp.heroAdvAt || 0) > s.time || Math.random() > 0.15 * p.adv) return false;
    const mine = G.citiesOf(s, emp.id), theirs = G.citiesOf(s, 'p');
    // a modest escort: a fifth of the home troops, never siege engines or civilians
    const escort = {};
    for (const [u, n] of Object.entries(home.units)) { const d = DATA.units[u]; if (u !== 'hero' && d.at && d.type !== 'civ' && d.type !== 'siege' && n > 0) escort[u] = Math.floor(n * 0.2); }
    const P = G.heroStats(s, emp.id).atk * G.heroLeadership(s, emp.id) + G.atkPower(s, emp.id, escort) * 0.5;
    // the nearest ruin of every player city is left for the player
    const ruins = s.special.filter(t => t.ruin);
    const reserved = new Set(theirs.map(c => ruins.reduce((b, t) => !b || G.dist(c, t) < G.dist(c, b) ? t : b, null)));
    let best = null, bs = -1e9;
    for (const t of ruins) {
      if (t.ruin.readyAt > s.time || reserved.has(t)) continue;
      const d = G.dist(home, t);
      if (d > 8) continue;
      const near = Math.min(...mine.map(c => G.dist(c, t)));
      const pd = theirs.length ? Math.min(...theirs.map(c => G.dist(c, t))) : 99;
      if (pd < near || pd < 4) continue;            // leave the ruins by the player's lands alone
      const D = 100 * Math.pow(t.ruin.tier, 1.8);
      const win = P / (P + D * 0.6);
      if (win < 0.5) continue;
      const sc = t.ruin.tier * win - d * 0.15;
      if (sc > bs) { bs = sc; best = t; }
    }
    emp.heroAdvAt = s.time + G.rnd(15, 30) * 60 * G.pace(s).time;
    if (!best) return false;
    const units = { hero: 1 };
    for (const [u, n] of Object.entries(escort)) if (n > 0) units[u] = n;
    return !G.sendArmy(s, home.id, best.x, best.y, 'adventure', units);
  };

  // ---- revive for gold ----
  G.rivalReviveCost = (s, id) => 150 * G.heroOf(s, id).level;
  const revive = (s, emp, h) => {
    if (h.reviveAt || !G.capital(s, emp.id)) return;
    const cost = G.rivalReviveCost(s, emp.id);
    if (emp.gold < cost + 100 || s.time - (h.diedAt || 0) < 600 * G.pace(s).time) return;
    emp.gold -= cost;
    h.reviveAt = s.time + G.reviveTime(s, emp.id);
    h.revived = (h.revived || 0) + 1;
  };

  G.rivalHeroThink = (s, emp) => {
    const h = G.ensureRivalHero(s, emp);
    if (!h) return;
    if (h.dead) { revive(s, emp, h); return; }
    if (h.free > 0) spendPoints(s, emp, h);
    if (h.items.length) G.rivalEquipBest(s, emp);
    if (joinAttacks(s, emp, h)) return;
    const home = G.heroCityOf(s, emp.id);
    if (!home) return;                 // marching
    if (guard(s, emp, h, home)) return;
    adventure(s, emp, h, home);
  };
  G.aiHooks.push((s, emp) => G.rivalHeroThink(s, emp));

  // ---- slow tick: lazy init for old saves, orphaned heroes, fame in the Chronicle ----
  G.slowHooks.push(s => {
    for (const emp of Object.values(s.empires)) {
      if (emp.id === 'p') continue;
      const h = G.ensureRivalHero(s, emp);
      if (!h || emp.dead) continue;
      // a hero left without a city (a fallen realm reborn in Endless) returns to the new capital
      if (!h.dead && !G.heroCityOf(s, emp.id) && !G.heroMovingOf(s, emp.id)) {
        const cap = G.capital(s, emp.id);
        if (cap) cap.units.hero = 1;
      }
      if (!h.dead && h.level >= G.HERO_FAME_LEVEL && !h.fameLogged) {
        h.fameLogged = true;
        G.log(s, 'p', `📜 Tales spread of ${h.name}, the ${P_OF(h).name.toLowerCase()} of the ${emp.name} (level ${h.level}). Their armies fight harder when this hero leads.`, 'warn');
      }
    }
    // famous rival heroes seen near your lands
    const mine = G.citiesOf(s, 'p');
    if (!mine.length) return;
    for (const m of s.moves) {
      if (m.owner === 'p' || !m.units.hero || m.fameSeen || !G.heroFamous(s, m.owner)) continue;
      const f = G.clamp((s.time - m.depart) / Math.max(1, m.arrive - m.depart), 0, 1);
      const pos = { x: m.fx + (m.x - m.fx) * f, y: m.fy + (m.y - m.fy) * f };
      const near = mine.find(c => G.dist(c, pos) <= 6);
      if (!near) continue;
      m.fameSeen = true;
      const h = G.heroOf(s, m.owner);
      G.log(s, 'p', `👁️ The famed ${h.name} (level ${h.level}) of the ${s.empires[m.owner].name} was seen marching near ${near.name}.`, 'warn');
    }
  });
}
