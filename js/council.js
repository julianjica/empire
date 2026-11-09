// =====================================================================
//  The Royal Council and city governors.
//
//  Five advisors — Steward, Marshal, Spymaster, High Priest, Archmage —
//  read the realm every few game-seconds and offer short, prioritized,
//  actionable advice: { id, advisor, priority, text, action }. Actions are
//  plain data the UI interprets: jumps ({kind:'city'|'tab'|'tile'}) or
//  one-click deeds ({kind:'build'|'cast'|'train'|'placate'|'tax'}) that run
//  through G.councilDo. Advice is cached outside the save; only snoozes,
//  dismissals and governor settings persist.
//
//  Governors take a city's build queue with a focus (Growth, Production,
//  Military, Faith & Culture, Magic, Balanced) and an optional gold reserve.
//  They never spend below the reserve, never build what would starve the
//  city, respect storage, never touch wonders or realm-unique works, and
//  keep a short log.
//
//  State (lazy, so older saves load):
//    s.council = { gov: { cityId: { on, focus, reserve, troops, log:[{t,text}], wait } },
//                  snooze: { adviceId: untilTime | -1 (dismissed until it clears) } }
//  Pure engine code: no S / UI / document here (UI lives in ui-council.js).
// =====================================================================
'use strict';
(() => {
  const paceT = s => G.pace(s).time;
  const dist = G.dist;

  const C = G.COUNCIL = {
    refresh: 5,          // game-seconds between advice rebuilds
    urgent: 70,          // priority at or above which an item counts as urgent
    perAdvisor: 5,       // at most this many items per advisor
    snoozeMins: 15,      // game-minutes (× pace) a snooze lasts
    earlyHours: 1,       // the Steward teaches during the first game-hour (× pace)
    logMax: 8,
    timeWeight: 12,      // how strongly governors prefer quick works
    waitMins: 4,         // a governor waits this long (× pace) to afford its first choice before settling for another
  };

  // -------------------------------------------------------------------
  // The councillors, flavoured by people
  // -------------------------------------------------------------------
  DATA.councilRoles = {
    steward:   { role: 'Steward',     icon: '🌾', domain: 'Granaries, stores and builders', quiet: 'The granaries are full and the builders busy. Nothing needs you.' },
    marshal:   { role: 'Marshal',     icon: '⚔️', domain: 'Armies, walls and threats',      quiet: 'No banners on the horizon. The watch is quiet.' },
    spymaster: { role: 'Spymaster',   icon: '🕵️', domain: 'Intelligence and free cities',   quiet: 'My little birds sing of nothing that concerns you.' },
    priest:    { role: 'High Priest', icon: '🕯️', domain: 'Faith, happiness and unrest',    quiet: 'The people are content, and the gods are not angry.' },
    archmage:  { role: 'Archmage',    icon: '🔮', domain: 'Mana, the weave and spells',      quiet: 'The weave lies smooth. I am at my studies.' },
  };
  DATA.councilOrder = ['steward', 'marshal', 'spymaster', 'priest', 'archmage'];
  // [title, name] per people and role
  DATA.councilNames = {
    hearth: { steward: ['Reeve', 'Hollis Barleywright'], marshal: ['Lord Marshal', 'Ser Aldwin Pike'], spymaster: ['Keeper of Whispers', 'Mother Wren'], priest: ['Abbess', 'Maud of the Sheaf'], archmage: ['Hedge-Magus', 'Tamsin Rainward'] },
    delver: { steward: ['Hoardwarden', 'Brokk Tallyhand'], marshal: ['War-Thane', 'Durga Ironbrow'], spymaster: ['Whisperdeep', 'Nali Stonequiet'], priest: ['Runefather', 'Odvar the Grey'], archmage: ['Loremistress', 'Hilda Deepglow'] },
    sylvan: { steward: ['Bough-Keeper', 'Ellowen Fairbranch'], marshal: ['Thorn-Marshal', 'Caelir Swiftbow'], spymaster: ['Shadowleaf', 'Ysra Nightbloom'], priest: ['Moon-Priestess', 'Ithil Silverdew'], archmage: ['Songweaver', 'Aerin Starbough'] },
    ash:    { steward: ['Hoardmaster', 'Grusk Many-Sacks'], marshal: ['Warchief', 'Kharza Bloodfang'], spymaster: ['Ashtongue', 'Vesk the Smiling'], priest: ['Flamecaller', 'Morgra Cinderhand'], archmage: ['Emberseer', 'Tazh Ashen-Eye'] },
    tide:   { steward: ['Pursewarden', 'Coralie Netmender'], marshal: ['Tide-Captain', 'Morrow Saltblade'], spymaster: ['Undertow', 'Selka Mistwater'], priest: ['Deep-Cantor', 'Nereth of the Shell'], archmage: ['Stormcaller', 'Ilun Wavecrest'] },
    veil:   { steward: ['Coinwhisper', 'Sabeline Duskpurse'], marshal: ['Dusk-Marshal', 'Varos Nightward'], spymaster: ['Mirrormask', 'Nyx'], priest: ['Oracle', 'Lunessa the Veiled'], archmage: ['Dreamweaver', 'Orrin Mothwing'] },
    grave:  { steward: ['Tallykeeper', 'Morbin Ledgerbone'], marshal: ['Death-Marshal', 'Ser Calyx the Unfallen'], spymaster: ['Gravewhisper', 'Ossa Quietcrypt'], priest: ['Bone-Priest', 'Varek of the Barrow'], archmage: ['Lich-Scribe', 'Esmerault'] },
    wind:   { steward: ['Cloud-Steward', 'Pell Highgranary'], marshal: ['Sky-Marshal', 'Aeria Stormtalon'], spymaster: ['Featherquiet', 'Lirr'], priest: ['Gale-Cantor', 'Soren Brightwing'], archmage: ['Stormseer', 'Ventis Thunderbrow'] },
  };
  const initials = name => name.replace(/^(Ser|Lord|Lady)\s+/, '').split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 2).map(w => w[0]).join('') || name[0];
  G.councilor = (s, role, owner = 'p') => {
    const R = DATA.councilRoles[role];
    const race = (s.empires[owner] || {}).race;
    const n = (DATA.councilNames[race] || DATA.councilNames.hearth)[role];
    return { key: role, role: R.role, icon: R.icon, domain: R.domain, quiet: R.quiet, title: n[0], name: n[1], initials: initials(n[1]) };
  };

  // -------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------
  const council = s => {
    const c = s.council = s.council || {};
    c.gov = c.gov || {};
    c.snooze = c.snooze || {};
    return c;
  };
  G.councilState = council;

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------
  const HOSTILE_MOVES = ['raid', 'attack', 'conquer'];
  const bname = t => DATA.buildings[t] ? DATA.buildings[t].name : t;
  const uname = u => DATA.units[u] ? DATA.units[u].name : u;
  const rate = r => (r >= 0 ? '+' : '−') + Math.abs(r).toFixed(Math.abs(r) < 10 ? 1 : 0);
  const canBuild = (s, c, t) => { const b = DATA.buildings[t]; if (!b || b.wonder || b.realmUnique) return false; const st = G.buildStatus(s, c, t); return st.ok; };
  const buildAct = (c, t, level) => ({ kind: 'build', c: c.id, b: t, label: `Build ${bname(t)}${level ? ' ' + level : ''}` });
  const cityAct = (c, label, b) => ({ kind: 'city', c: c.id, b, label: label || `Open ${c.name}` });
  const tabAct = (t, label, c) => ({ kind: 'tab', t, c: c ? c.id : undefined, label });
  const tileAct = (x, y, label) => ({ kind: 'tile', x, y, label: label || 'Show on map' });
  const ourCityAt = (s, x, y) => {
    const t = G.tileAt(s, x, y);
    if (!t) return null;
    if (t.city && s.cities[t.city] && s.cities[t.city].owner === 'p') return s.cities[t.city];
    if (t.oasis && t.oasis.owner && s.cities[t.oasis.owner] && s.cities[t.oasis.owner].owner === 'p') return s.cities[t.oasis.owner];
    return null;
  };
  const threatening = (s, id) => {
    const e = s.empires[id];
    if (!e || e.dead || id === 'p') return false;
    const r = s.rel && s.rel[id];
    if (r && r.status === 'war') return true;
    if (r && (r.status === 'peace' || r.status === 'alliance')) return false;
    if (r && r.opinion <= -20) return true;
    try { return G.hostility(s, id, 'p') > 0.6; } catch (e2) { return false; }
  };
  const atWar = (s, id) => !!(s.rel && s.rel[id] && s.rel[id].status === 'war');
  const price = (s, owner, u) => Object.entries(G.unitCost(s, owner, u)).reduce((a, [g, v]) => a + v * (g === 'gold' ? 1 : (DATA.goods[g] ? DATA.goods[g].value : 1)), 0) || 1;
  // the best defender a city can train against a given share of cavalry
  const bestDefender = (s, city, cavShare) => {
    const race = DATA.races[s.empires[city.owner].race];
    let best = null, bv = -1;
    for (const u of race.units) {
      const d = DATA.units[u];
      if (!d || !d.at || d.type === 'siege' || d.type === 'ship' || d.type === 'civ') continue;
      if (!G.trainStatus(s, city, u).ok) continue;
      const v = (d.defI * (1 - cavShare) + d.defC * cavShare) / price(s, city.owner, u);
      if (v > bv) { bv = v; best = u; }
    }
    return best;
  };
  const cavShareOf = units => {
    let inf = 0, cav = 0;
    for (const [u, n] of Object.entries(units || {})) { const d = DATA.units[u]; if (!d || !d.at) continue; if (d.type === 'cav') cav += d.atk * n; else inf += d.atk * n; }
    return inf + cav > 0 ? cav / (inf + cav) : null;
  };
  const grainFloor = (s, city, e) => Math.min(e.cap * 0.25, Math.max(80, (e.popFood + e.upkeep) * 10));
  const isEarly = s => s.time < C.earlyHours * 3600 * paceT(s);

  // -------------------------------------------------------------------
  // Governors: focus weights and the build picker
  // -------------------------------------------------------------------
  DATA.govFocus = {
    balanced:   { name: 'Balanced',        icon: '⚖️', desc: 'A bit of everything, as a sensible reeve would.', w: {} },
    growth:     { name: 'Growth',          icon: '🌾', desc: 'Farms, homes and food first: more people, more taxes.', w: { farm: 30, houses: 25, harbor: 20, bakery: 20, heartgrove: 20, pearlbeds: 10, townhall: 12, tavern: 10, warehouse: 5 } },
    production: { name: 'Production',      icon: '⚒️', desc: 'Camps, quarries, mines and workshops.', w: { lumber: 25, quarry: 25, mine: 22, smelter: 25, smithy: 20, runeforge: 25, dreamspire: 15, ossuary: 15, aerie: 15, pearlbeds: 15, warehouse: 15, market: 8 } },
    military:   { name: 'Military',        icon: '🛡️', desc: 'Barracks, armoury and walls; can also keep a garrison trained.', w: { barracks: 35, armory: 25, wall: 35, stable: 20, warpit: 25, workshop: 10, smithy: 10, aerie: 10 } },
    faith:      { name: 'Faith & Culture', icon: '🕯️', desc: 'Temples, shrines, theatres and taverns.', w: { temple: 40, shrine: 35, theatre: 30, tavern: 22, academy: 5 } },
    magic:      { name: 'Magic',           icon: '🔮', desc: 'The Academy and the Mage Tower.', w: { magetower: 45, academy: 25, temple: 5 } },
  };
  DATA.govFocusOrder = ['balanced', 'growth', 'production', 'military', 'faith', 'magic'];
  const GRAIN_B = ['farm', 'harbor', 'bakery'];
  const AMENITY = ['tavern', 'temple', 'theatre'];

  // score every building the city could raise next; returns candidates sorted best first
  const govCandidates = (s, city, focus, e) => {
    e = e || G.econ(s, city);
    const emp = s.empires[city.owner];
    const th = G.lvl(city, 'townhall');
    const F = (DATA.govFocus[focus] || DATA.govFocus.balanced).w;
    const aggr = focus === 'military' ? 0.8 : 0.3;
    const nearCap = DATA.goodOrder.some(g => g !== 'mana' && (city.res[g] || 0) > e.cap * 0.8);
    const hungry = city.starving || (e.net.grain < 0 && (city.res.grain || 0) < -e.net.grain * 30);
    const happy = G.happyOf ? G.happyOf(city) : 60;
    let tooBig = false;
    const out = [];
    for (const t of DATA.buildingOrder) {
      const b = DATA.buildings[t];
      if (!b || b.wonder || b.realmUnique) continue;            // wonders and realm-unique works stay manual
      const st = G.buildStatus(s, city, t);
      if (st.hidden || st.maxed || st.locked) continue;
      if (/Town Hall/.test(st.reason || '')) continue;
      // respect storage: a cost no warehouse here can hold
      if (Object.entries(st.cost).some(([g, v]) => g !== 'gold' && v > e.cap * 0.95)) { tooBig = true; continue; }
      if (hungry && !GRAIN_B.includes(t)) continue;               // never build while the city starves, except food
      const L = G.lvl(city, t);
      let w = 20, why = '';
      switch (t) {
        case 'farm': if (e.net.grain < 5 + city.pop * 0.05) { w += 120; why = 'grain is short'; } else w += (city.res.grain || 0) < e.cap * 0.25 ? 45 - L : 32 - L; break;
        case 'houses': if (city.pop >= e.civCap * 0.9) { w += 70; why = 'homes are full'; } else w += 5; break;
        case 'warehouse': if (nearCap) { w += 60; why = 'stores are nearly full'; } break;
        case 'townhall': w += 25 + (L <= 3 ? 20 : 0); break;
        case 'lumber': w += 28 - L + ((city.res.timber || 0) < e.cap * 0.15 ? 25 : 0); break;
        case 'quarry': w += 28 - L + ((city.res.stone || 0) < e.cap * 0.15 ? 25 : 0); break;
        case 'mine': w += 22 - L + ((city.res.ore || 0) < e.cap * 0.15 ? 20 : 0); break;
        case 'workshop': w += focus === 'military' ? 5 - L * 2 : -30; break;
        case 'smelter': w += 22 - L; break;
        case 'smithy': w += (city.res.tools || 0) < 20 ? 30 : 5; break;
        case 'armory': w += 22 - L + aggr * 10; break;
        case 'barracks': w += 15 + aggr * 10 - L; break;
        case 'stable': w += aggr * 12 - L; break;
        case 'wall': w += L >= th + 1 ? -60 : 10 + (1 - aggr) * 12 - L; break;
        case 'market': w += emp.gold > 800 && L < 3 ? 25 : -5; break;
        case 'academy': w += L < 3 ? 12 : -5; break;
        case 'harbor': w += 18 - L; break;
        case 'hideout': w += -15 - L; break;
        default: w += 18 - L;
      }
      if (e.eff < 0.95 && t === 'houses') { w += 50; why = 'short of workers'; }
      if (t === 'houses' && e.net.grain < 1 + city.pop * 0.03) w -= 50;            // more mouths would starve
      if (AMENITY.includes(t) && happy >= 62 && focus !== 'faith') w -= 25;
      if (AMENITY.includes(t) && happy < 40) { w += 30; why = 'the people are unhappy'; }
      if (t !== 'townhall' && L >= th + 2) w -= 40;
      w += F[t] || 0;
      out.push({ t, w, st, why });
    }
    if (tooBig) { const wh = out.find(c => c.t === 'warehouse'); if (wh) { wh.w += 80; wh.why = 'costs outgrow our storage'; } }
    // builders' time is the scarcest good: favour quick works over slow, deep ones
    if (out.length > 2) {
      const ts = out.map(c => c.st.time).sort((a, b) => a - b), med = ts[Math.floor(ts.length / 2)] || 1;
      for (const c of out) c.w -= C.timeWeight * Math.log2(Math.max(0.25, c.st.time / med));
    }
    return out.sort((a, b) => b.w - a.w);
  };
  // can the governor pay for this without breaking its rules?
  const govAffords = (s, city, cand, reserve, e) => {
    if (!cand.st.ok) return false;
    const emp = s.empires[city.owner];
    const cost = cand.st.cost;
    if ((cost.gold || 0) > 0 && emp.gold - cost.gold < (reserve || 0)) return false;
    if (!GRAIN_B.includes(cand.t) && (cost.grain || 0) > 0 && (city.res.grain || 0) - cost.grain < grainFloor(s, city, e)) return false;
    return true;
  };
  // the governor's choice (or the Steward's suggestion): { t, why, level } or { wait: reason }
  G.councilPick = (s, city, focus = 'balanced', opts = {}) => {
    const e = opts.econ || G.econ(s, city);
    const cands = govCandidates(s, city, focus, e);
    if (!cands.length) return { wait: 'nothing left to build' };
    const reserve = opts.reserve || 0;
    const top = cands[0];
    const okList = cands.filter(c => govAffords(s, city, c, reserve, e));
    if (okList.length && okList[0] === top) return { t: top.t, why: top.why, level: top.st.level };
    if (opts.patient) {
      // wait a little for the first choice if the goods are coming in
      const waited = opts.waitedSince != null ? s.time - opts.waitedSince : 0;
      if (waited < C.waitMins * 60 * paceT(s)) {
        const short = Object.entries(top.st.cost).filter(([g, v]) => G.have(s, city, g) < v + (g === 'gold' ? reserve : 0));
        const soon = short.every(([g, v]) => g === 'gold' ? true : (e.net[g] || 0) > 0 && (v - G.have(s, city, g)) / e.net[g] < C.waitMins * paceT(s));
        if (soon) return { wait: `saving for ${bname(top.t)} ${top.st.level}`, saving: top.t };
      }
    }
    const pick = okList.find(c => c.w >= top.w - 40) || (opts.patient ? okList[0] : okList[0]);
    if (pick) return { t: pick.t, why: pick.why, level: pick.st.level };
    if (top.st.reason === 'Queue full') return { wait: 'builders busy' };
    const gold = (top.st.cost.gold || 0) > 0 && s.empires[city.owner].gold - top.st.cost.gold < reserve;
    return { wait: gold && reserve ? `keeping ${reserve} gold in reserve` : `gathering goods for ${bname(top.t)}`, saving: top.t };
  };

  // ---- governor state and actions ----
  G.govOf = (s, cityId) => {
    const g = council(s).gov[cityId];
    return g && g.on ? g : null;
  };
  G.setGovernor = (s, cityId, cfg) => {
    const city = s.cities[cityId];
    if (!city || city.owner !== 'p') return 'Not one of your cities';
    const gov = council(s).gov;
    const g = gov[cityId] = gov[cityId] || { on: false, focus: 'balanced', reserve: 0, troops: 0, log: [] };
    if (cfg.focus !== undefined) {
      if (cfg.focus === 'off' || cfg.focus === null) g.on = false;
      else if (DATA.govFocus[cfg.focus]) { g.focus = cfg.focus; g.on = true; }
      else return 'Unknown focus';
    }
    if (cfg.on !== undefined) g.on = !!cfg.on;
    if (cfg.reserve !== undefined) g.reserve = Math.max(0, Math.floor(+cfg.reserve || 0));
    if (cfg.troops !== undefined) g.troops = Math.max(0, Math.min(500, Math.floor(+cfg.troops || 0)));
    if (cfg.market !== undefined) g.market = !!cfg.market;
    g.wait = null;
    if (G.councilDirty) G.councilDirty(s);
    return null;
  };
  const govLog = (s, g, text) => {
    g.log = g.log || [];
    g.log.unshift({ t: s.time, text });
    if (g.log.length > C.logMax) g.log.length = C.logMax;
  };
  const defendersOf = (s, city) => {
    const race = DATA.races[s.empires[city.owner].race];
    let n = 0;
    const isDef = u => { const d = DATA.units[u]; return d && d.at && race.units.includes(u) && d.type !== 'siege' && d.type !== 'ship' && d.type !== 'civ'; };
    for (const [u, k] of Object.entries(city.units)) if (isDef(u)) n += k;
    for (const q of Object.values(city.train || {}).flat()) if (isDef(q.unit)) n += q.left;
    return n;
  };
  const govTrain = (s, city, g, e) => {
    if (g.focus !== 'military' || !(g.troops > 0)) return;
    const have = defendersOf(s, city);
    if (have >= g.troops) return;
    let cs = 0.3;
    // answer what the nearest threatening realm fields, if we know it
    let bestD = 1e9;
    for (const o of Object.values(s.cities)) {
      if (o.owner === 'p' || !threatening(s, o.owner)) continue;
      const d = dist(o, city); if (d > 14 || d >= bestD) continue;
      const intel = s.intel && s.intel[G.tileIdx(s, o)];
      const sh = intel ? cavShareOf(intel.units) : null;
      if (sh !== null) { bestD = d; cs = sh; }
    }
    const u = bestDefender(s, city, cs);
    if (!u) return;
    const d = DATA.units[u];
    if ((city.train[d.at] || []).length) return;
    const st = G.trainStatus(s, city, u);
    const cost = G.unitCost(s, city.owner, u);
    const emp = s.empires[city.owner];
    let n = Math.min(g.troops - have, st.max, Math.floor(city.pop * 0.2 / Math.max(1, st.pop || 1)));
    if (cost.gold) n = Math.min(n, Math.floor((emp.gold - (g.reserve || 0)) / cost.gold));
    if (cost.grain) n = Math.min(n, Math.floor(((city.res.grain || 0) - grainFloor(s, city, e)) / cost.grain));
    // never train more than the fields can feed
    const up = (d.upkeep || 0) * G.mod(s, city.owner, city, 'upkeep');
    if (up > 0) n = Math.min(n, Math.floor((e.net.grain - 1) / up));
    if (!(n >= 1)) return;
    if (G.queueTrain(s, city.id, u, n) === null) govLog(s, g, `Training ${n} ${uname(u)} (garrison ${have + n}/${g.troops})`);
  };
  // with a market, a governor sells what would spill over and buys what its next work lacks — never below the reserve
  const govMarket = (s, city, g, e) => {
    if (g.market === false || G.lvl(city, 'market') < 1) return;
    const emp = s.empires[city.owner];
    for (const gd of ['grain', 'timber', 'stone', 'ore']) {
      if ((city.res[gd] || 0) > e.cap * 0.92 && (e.net[gd] || 0) > 0) {
        const n = Math.floor(e.cap * 0.15);
        if (G.trade(s, city.id, gd, n, 'sell') === null) {
          // fold repeated sales into one log line so they don't push out the building news
          const prev = (g.log || []).find(l => l.sold === gd && s.time - l.t < 600 * paceT(s));
          if (prev) { prev.n += n; prev.t = s.time; prev.text = `Sold ${prev.n} ${DATA.goods[gd].name.toLowerCase()} that had no room`; }
          else { govLog(s, g, `Sold ${n} ${DATA.goods[gd].name.toLowerCase()} that had no room`); g.log[0].sold = gd; g.log[0].n = n; }
        }
      }
    }
    // upkeep goods running out (tools, weapons, iron, firewood, stone, bonedust): buy half an hour's worth
    const lack = ['tools', 'weapons', 'iron', 'timber', 'stone', 'bonedust'].filter(gd => (city.short || {})[gd] || ((e.use && e.use[gd]) > 0 && (e.net[gd] || 0) < 0 && (city.res[gd] || 0) < -(e.net[gd]) * 10));
    for (const gd of lack) {
      const n = Math.ceil(Math.min(e.cap * 0.2 - (city.res[gd] || 0), Math.max(10, (e.use[gd] || 0) * 30)));
      if (!(n > 0)) continue;
      const price = n * G.marketRates(s, city, gd).buy;
      if (emp.gold - price < (g.reserve || 0) + 100) continue;
      if (G.trade(s, city.id, gd, n, 'buy') === null) govLog(s, g, `Bought ${n} ${DATA.goods[gd].name.toLowerCase()} for upkeep (${Math.round(price)} gold)`);
    }
    const want = g.wait && g.wait.saving;
    if (!want) return;
    const st = G.buildStatus(s, city, want);
    if (st.maxed || st.locked || st.reason === 'Queue full') return;
    const short = Object.entries(st.cost).filter(([gd, v]) => gd !== 'gold' && DATA.goods[gd] && G.have(s, city, gd) < v).map(([gd, v]) => [gd, Math.ceil(v - G.have(s, city, gd))]);
    if (!short.length) return;
    const price = short.reduce((a, [gd, n]) => a + n * G.marketRates(s, city, gd).buy, 0);
    if (emp.gold - price - (st.cost.gold || 0) < (g.reserve || 0) + 100) return;
    if (short.some(([gd, n]) => (city.res[gd] || 0) + n > e.cap)) return;
    for (const [gd, n] of short) G.trade(s, city.id, gd, n, 'buy');
    govLog(s, g, `Bought ${short.map(([gd, n]) => n + ' ' + DATA.goods[gd].name.toLowerCase()).join(', ')} for ${bname(want)} (${Math.round(price)} gold)`);
  };
  const govStep = (s, city, g) => {
    const e = G.econ(s, city);
    govMarket(s, city, g, e);
    let built = 0;
    while (built < 2 && city.buildQueue.length < G.buildSlots(city)) {
      const pick = G.councilPick(s, city, g.focus, { reserve: g.reserve, patient: true, waitedSince: g.wait ? g.wait.since : null, econ: e });
      if (!pick.t) {
        if (!g.wait || g.wait.text !== pick.wait) g.wait = { since: g.wait && g.wait.saving === pick.saving ? g.wait.since : s.time, text: pick.wait, saving: pick.saving };
        break;
      }
      const err = G.queueBuild(s, city.id, pick.t);
      if (err) break;
      g.wait = null;
      built++;
      govLog(s, g, `Queued ${bname(pick.t)} ${pick.level}${pick.why ? ' — ' + pick.why : ''}`);
    }
    govTrain(s, city, g, e);
  };
  G.councilGovern = s => {
    if (s.gameOver) return;
    const gov = council(s).gov;
    for (const [cid, g] of Object.entries(gov)) {
      const city = s.cities[cid];
      if (!city) { delete gov[cid]; continue; }
      if (!g.on || city.owner !== 'p') continue;
      govStep(s, city, g);
    }
  };
  G.slowHooks.push(s => { if (s.council && s.council.gov) G.councilGovern(s); });

  // -------------------------------------------------------------------
  // Advice
  // -------------------------------------------------------------------
  const ADVISORS = {};

  // ---- Steward: food, stores, builders, the year ------------------------
  const EARLY_PATH = [['farm', 2, 'More fields first: grain feeds everyone, and every new citizen eats.'], ['houses', 2, 'Homes next: every farm and camp needs workers to run.'],
    ['lumber', 2, 'A second level of lumber camp keeps timber flowing for everything else.'], ['townhall', 2, 'A bigger Town Hall builds faster and unlocks new buildings.'],
    ['barracks', 1, 'A Barracks lets you train scouts and your first soldiers.'], ['academy', 1, 'The Academy (Town Hall 3) opens research.']];
  ADVISORS.steward = (s, X, add) => {
    const early = isEarly(s);
    const cap0 = G.capital(s, 'p');
    const se = G.season(s);
    for (const c of X.cities) {
      const e = X.econ[c.id];
      const gov = G.govOf(s, c.id);
      // famine
      const hungry = c.starving || (e.net.grain < 0 && (c.res.grain || 0) < -e.net.grain * 10);
      if (hungry) {
        const act = canBuild(s, c, 'farm') ? buildAct(c, 'farm', G.nextLevel(c, 'farm')) : G.lvl(c, 'market') ? tabAct('market', 'Buy grain', c) : cityAct(c, 'Open city', 'farm');
        add('steward', `starving:${c.id}`, c.starving ? 92 : 80,
          c.starving ? `${c.name} is starving! Grain ${rate(e.net.grain)}/min and the granary is empty — people will leave. Build farms, buy grain or send some troops away.`
            : `${c.name} eats more grain than it grows (${rate(e.net.grain)}/min); the granary runs dry in about ${Math.max(1, Math.round((c.res.grain || 0) / -e.net.grain))} minutes.`, act);
      }
      // supply lines (js/logistics.js): this city starves or lacks an upkeep good while another of ours overflows with it
      if (G.supplyPlan && X.cities.length > 1) {
        const lg = (s.logistics && s.logistics.p) || {};
        const gd = ['grain', 'timber', 'stone', 'iron', 'tools', 'weapons'].find(g => (g === 'grain' ? hungry : (c.short || {})[g]) && !(lg.on && (((lg.goods || {})[g] || {}).on || lg.relief !== false)));
        const src = gd && X.cities.find(o => o !== c && G.lvl(o, 'market') && (o.res[gd] || 0) > X.econ[o.id].cap * 0.6 && (X.econ[o.id].net[gd] || 0) > 0);
        if (src) add('steward', `supply:${c.id}:${gd}`, c.starving ? 84 : 66, `${c.name} ${gd === 'grain' ? 'goes hungry' : 'has run out of ' + DATA.goods[gd].name.toLowerCase()} while ${src.name} overflows with it. A supply line in the 📒 Ledger would send caravans by itself.`, tabAct('ledger', 'Set supply lines'));
      }
      // workers and homes
      if (e.eff < 0.9) add('steward', `workers:${c.id}`, 62, `${c.name} is short of workers (${Math.round(e.eff * 100)}%): every farm and camp runs slower. More homes would help.`, canBuild(s, c, 'houses') ? buildAct(c, 'houses', G.nextLevel(c, 'houses')) : cityAct(c, null, 'houses'));
      else if (c.pop >= e.civCap * 0.95 && e.net.grain > 2 && !c.buildQueue.some(q => q.type === 'houses')) add('steward', `homes:${c.id}`, 40, `${c.name} has no room to grow (${Math.floor(c.pop)}/${e.civCap} citizens). Raise more homes.`, canBuild(s, c, 'houses') ? buildAct(c, 'houses', G.nextLevel(c, 'houses')) : cityAct(c, null, 'houses'));
      // full storage
      const full = DATA.goodOrder.filter(g => g !== 'mana' && (c.res[g] || 0) >= e.cap * 0.97 && (e.net[g] || 0) > 0.05);
      if (full.length) {
        const names = full.map(g => DATA.goods[g].icon + ' ' + DATA.goods[g].name.toLowerCase()).join(', ');
        add('steward', `full:${c.id}`, 52, `${c.name}'s stores are full of ${names} — new goods go to waste. Enlarge the warehouse or sell at the market.`,
          canBuild(s, c, 'warehouse') ? buildAct(c, 'warehouse', G.nextLevel(c, 'warehouse')) : G.lvl(c, 'market') ? tabAct('market', 'Open market', c) : cityAct(c, null, 'warehouse'));
      }
      // idle builders (the governor handles its own city)
      if (!gov && c.buildQueue.length < G.buildSlots(c)) {
        let sug = null, teach = '';
        if (early && c === cap0) {
          const step = EARLY_PATH.find(([b, L]) => G.lvl(c, b) < L && !c.buildQueue.some(q => q.type === b && q.level >= L));
          if (step && canBuild(s, c, step[0])) { sug = { t: step[0], level: G.nextLevel(c, step[0]) }; teach = ' ' + step[2]; }
          else if (step) add('steward', `goal:${step[0]}`, 22, `Next goal: ${bname(step[0])} ${step[1]}. ${step[2]}`, cityAct(c, 'Show me', step[0]));
        }
        if (!sug) { const p = G.councilPick(s, c, 'balanced', { econ: e }); if (p.t) sug = { t: p.t, level: p.level, why: p.why }; }
        if (sug) {
          const empty = c.buildQueue.length === 0;
          add('steward', `idle:${c.id}`, (empty ? 50 : 30) + (early ? 10 : 0),
            `${empty ? 'The builders of ' + c.name + ' are idle' : 'A building slot is free in ' + c.name}. I suggest ${bname(sug.t)} ${sug.level}${sug.why ? ' (' + sug.why + ')' : ''}.${teach}${!early && X.cities.length > 1 ? ' A governor could manage this city for you.' : ''}`,
            buildAct(c, sug.t, sug.level));
        }
      }
      if (gov && gov.wait && s.time - gov.wait.since > 10 * 60 * paceT(s) && c.buildQueue.length === 0)
        add('steward', `govwait:${c.id}`, 24, `The governor of ${c.name} has been idle a while: ${gov.wait.text}.${gov.reserve ? ' Perhaps lower the gold reserve?' : ''}`, tabAct('council', 'Governors'));
      // idle workshops
      for (const r of e.refiners) {
        if (r.off) continue;
        const f = c.refineEff && c.refineEff[r.type];
        if (f !== undefined && f < 0.5) {
          const lack = Object.keys(r.in).filter(g => (c.res[g] || 0) < 5).map(g => DATA.goods[g].name.toLowerCase());
          add('steward', `refine:${c.id}:${r.type}`, 32, `The ${bname(r.type)} in ${c.name} works at ${Math.round(f * 100)}% — ${lack.length ? 'short of ' + lack.join(' and ') : 'its output has no room in storage'}.`, cityAct(c, 'Open city', r.type));
        }
      }
      // upkeep shortages: firewood, repairs, tools, weapons, wages, bonedust
      const FIX = { timber: 'lumber', stone: 'quarry', iron: 'smelter', tools: 'smithy', weapons: 'armory', bonedust: 'ossuary', mana: 'magetower' };
      for (const gd of Object.keys(c.short || {})) {
        if (gd === 'gold') { add('steward', `short:${c.id}:gold`, 70, `The treasury is empty and the soldiers of ${c.name} go unpaid (${rate(-(e.wages || 0))} gold/min in wages): they grumble and some desert. Raise taxes, sell goods or dismiss troops.`, tabAct('market', 'Open market', c)); continue; }
        if (!DATA.goods[gd]) continue;
        const b = FIX[gd];
        const act = b && DATA.buildings[b] && canBuild(s, c, b) ? buildAct(c, b, G.nextLevel(c, b)) : G.lvl(c, 'market') ? tabAct('market', 'Buy ' + DATA.goods[gd].name.toLowerCase(), c) : cityAct(c, 'Open city', b);
        add('steward', `short:${c.id}:${gd}`, gd === 'timber' && se.index === 3 ? 78 : 58, `${c.name} has run out of ${DATA.goods[gd].icon} ${DATA.goods[gd].name.toLowerCase()} (uses ${rate(-((e.use && e.use[gd]) || 0))}/min). ${G.SHORT_TEXT[gd] || ''}`, act);
      }
      // firewood before winter: the cold burns much more timber
      if (G.firewoodSeason && (se.index === 2 || (se.index === 1 && se.progress > 0.75)) && !(c.short || {}).timber) {
        const fw = ((e.sinks && e.sinks.timber) || []).find(l => /^Firewood/.test(l.label));
        if (fw) {
          const now = -fw.amount, winter = now / Math.max(0.2, G.firewoodSeason(s, 'p')) * (1 + (DATA.firewoodSeason[3] - 1) * ((DATA.seasonRace[s.empires.p.race] || [1, 1, 1, 1])[3]));
          const winterNet = e.net.timber + now - winter;
          if (winterNet < 0 && (c.res.timber || 0) < -winterNet * 7200 * paceT(s) / 60)
            add('steward', `firewood:${c.id}`, 44, `Winter will burn about ${Math.round(winter)} timber a minute as firewood in ${c.name}, more than it cuts. Stock timber or raise the lumber camp, or the people will freeze.`,
              canBuild(s, c, 'lumber') ? buildAct(c, 'lumber', G.nextLevel(c, 'lumber')) : cityAct(c, null, 'lumber'));
        }
      }
      // the year: stock grain before winter
      if (G.seasonFx && (se.index === 2 || (se.index === 1 && se.progress > 0.75))) {
        const k = (DATA.seasonRace && DATA.seasonRace[s.empires.p.race] || [1, 1, 1, 1])[3];
        const winterNet = e.net.grain - (e.raw.grain || 0) * 0.3 * k - e.upkeep * 0.15 * k;
        const need = -winterNet * 7200 * paceT(s) / 60;
        if (winterNet < 0 && (c.res.grain || 0) < need) {
          add('steward', `winter:${c.id}`, 48, `Winter is coming: ${c.name} will run short of grain (about ${rate(winterNet)}/min in the cold). Stock the granary — raise farms or buy grain while it is cheap.`,
            canBuild(s, c, 'farm') ? buildAct(c, 'farm', G.nextLevel(c, 'farm')) : G.lvl(c, 'market') ? tabAct('market', 'Open market', c) : cityAct(c, null, 'farm'));
        }
      }
    }
  };

  // ---- Marshal: threats, walls, counters, idle armies, rival heroes ------
  ADVISORS.marshal = (s, X, add) => {
    for (const m of s.moves) {
      if (m.owner === 'p' || !HOSTILE_MOVES.includes(m.type)) continue;
      const c = ourCityAt(s, m.x, m.y);
      if (!c) continue;
      const left = m.arrive - s.time;
      const who = s.empires[m.owner] ? `The ${s.empires[m.owner].name}` : 'Raiders';
      const n = G.unitsCount(m.units);
      const hero = m.units && m.units.hero ? ' Their champion rides with them.' : '';
      const def = G.defPower(s, 'p', c.units), att = s.empires[m.owner] ? G.atkPower(s, m.owner, m.units) * 0.9 : 0;
      const verdict = att > def * G.cityDefense(s, c).mult * 1.1 ? ' Our garrison looks too weak — reinforce, train or raise the walls.' : ' Our garrison should hold.';
      add('marshal', `incoming:${m.id || m.arrive + ':' + c.id}`, 90 + Math.max(0, Math.min(8, 8 - left / (60 * paceT(s)))),
        `${who} march on ${c.name} (${m.type}) with about ${n} soldiers — they arrive in {eta}.${hero}${verdict}`, tabAct('military', 'Prepare defences', c), { at: m.arrive });
    }
    // border walls
    for (const c of X.cities) {
      let foe = null, fd = 1e9;
      for (const o of Object.values(s.cities)) { if (o.owner === 'p' || !threatening(s, o.owner)) continue; const d = dist(o, c); if (d < fd) { fd = d; foe = o; } }
      if (!foe || fd > 10) continue;
      const th = G.lvl(c, 'townhall'), w = G.lvl(c, 'wall');
      if (th >= 3 && w < Math.max(1, Math.floor(th / 2)) && !c.buildQueue.some(q => q.type === 'wall')) {
        add('marshal', `wall:${c.id}`, atWar(s, foe.owner) ? 66 : 45, `${c.name} lies ${fd.toFixed(0)} tiles from ${foe.name} of the ${s.empires[foe.owner].name}, and its wall is ${w ? 'only level ' + w : 'not yet built'}.`,
          canBuild(s, c, 'wall') ? buildAct(c, 'wall', G.nextLevel(c, 'wall')) : cityAct(c, null, 'wall'));
      }
    }
    // counters to what scouts and spies have seen
    const seen = {};
    for (const o of Object.values(s.cities)) {
      if (o.owner === 'p' || !threatening(s, o.owner) || seen[o.owner]) continue;
      const intel = s.intel && s.intel[G.tileIdx(s, o)];
      if (!intel || s.time - intel.t > 3600 * paceT(s)) continue;
      const cs = cavShareOf(intel.units);
      if (cs === null) continue;
      const near = X.cities.slice().sort((a, b) => dist(a, o) - dist(b, o))[0];
      if (!near || dist(near, o) > 14) continue;
      const u = bestDefender(s, near, cs);
      if (!u) continue;
      seen[o.owner] = true;
      const mix = cs > 0.55 ? 'mostly cavalry' : cs < 0.25 ? 'mostly foot soldiers' : 'a mix of foot and horse';
      add('marshal', `counter:${o.owner}`, 34, `Our last report on ${o.name} (${s.empires[o.owner].name}) shows ${mix}. ${uname(u)} ${DATA.units[u].icon} is our best answer to it from ${near.name}.`, tabAct('military', `Train ${uname(u)}`, near));
    }
    // idle armies
    if (!s.moves.some(m => m.owner === 'p' && HOSTILE_MOVES.includes(m.type))) {
      const army = X.cities.map(c => ({ c, atk: G.atkPower(s, 'p', Object.fromEntries(Object.entries(c.units).filter(([u]) => u !== 'hero' && DATA.units[u] && DATA.units[u].at))) })).sort((a, b) => b.atk - a.atk)[0];
      if (army && army.atk > 400) {
        const camp = Object.values(s.camps).filter(k => k.kind !== 'rift' && s.explored[k.y * s.map + k.x] && dist(k, army.c) <= 8 && G.defPower(s, null, k.units) * 1.6 < army.atk).sort((a, b) => dist(a, army.c) - dist(b, army.c))[0];
        if (camp) add('marshal', `idle:${army.c.id}`, 22, `The army in ${army.c.name} sits idle. The brigand camp at (${camp.x}, ${camp.y}) looks beatable — plunder and renown await.`, tileAct(camp.x, camp.y, 'Show the camp'));
      }
    }
    // rival champions
    if (G.rivalHeroStatus && G.heroOf) {
      const mine = G.heroOf(s, 'p');
      for (const e of Object.values(s.empires)) {
        if (e.id === 'p' || e.dead || !threatening(s, e.id)) continue;
        const h = G.heroOf(s, e.id);
        if (!h || h.dead) continue;
        if (h.level >= ((mine && !mine.dead) ? mine.level : 0) + 3) {
          add('marshal', `hero:${e.id}`, 20, `${h.name}, champion of the ${e.name}, is level ${h.level} — ${G.rivalHeroStatus(s, e.id).text}. Ours should not face them alone.`, tabAct('hero', 'Hero'));
          break;
        }
      }
    }
  };

  // ---- Spymaster: stale intel, free cities ------------------------------
  ADVISORS.spymaster = (s, X, add) => {
    const E = G.espState ? G.espState(s) : null;
    const spies = G.spiesOf ? G.spiesOf(s, 'p') : [];
    const idle = spies.filter(x => x.status === 'idle');
    // stale intel on threatening neighbours (the nearest city of each)
    const done = {};
    for (const o of Object.values(s.cities).map(o => ({ o, d: Math.min(...X.cities.map(c => dist(c, o))) })).sort((a, b) => a.d - b.d)) {
      const c = o.o;
      if (c.owner === 'p' || done[c.owner] || !threatening(s, c.owner) || o.d > 15 || !s.explored[c.y * s.map + c.x]) continue;
      done[c.owner] = true;
      const dos = E && E.dossiers && E.dossiers.p && E.dossiers.p[c.id];
      const intel = s.intel && s.intel[G.tileIdx(s, c)];
      const t = Math.max(dos ? dos.t : -1e9, intel ? intel.t : -1e9);
      if (s.time - t < 1800 * paceT(s)) continue;
      const age = t < 0 ? 'We know nothing of' : `Our news of ${c.name} is ${Math.round((s.time - t) / 60)} minutes old —`;
      const near = X.cities.slice().sort((a, b) => dist(a, c) - dist(b, c))[0];
      let act;
      if (idle.length) act = tabAct('espionage', 'Send a spy');
      else if (G.spiesOf && near && G.lvl(near, 'hideout') < 1 && canBuild(s, near, 'hideout')) act = buildAct(near, 'hideout', 1);
      else act = tileAct(c.x, c.y, 'Scout it');
      add('spymaster', `intel:${c.owner}`, atWar(s, c.owner) ? 58 : 40, `${t < 0 ? age + ' ' + c.name : age} the ${s.empires[c.owner].name} ${atWar(s, c.owner) ? 'are at war with us' : 'look hostile'}. ${idle.length ? `${idle[0].name} is free to go.` : 'Send scouts or a spy before they surprise us.'}`, act);
    }
    if (G.minorsList) {
      const M = G.MINORS || { patronMin: 30, hysteresis: 5 };
      for (const mi of G.minorsList(s)) {
        if (mi.subject) continue;
        const d = X.cities.length ? Math.min(...X.cities.map(c => dist(c, mi))) : 99;
        const known = s.explored[mi.y * s.map + mi.x];
        if (!known || d > 15) continue;
        const ours = (mi.inf && mi.inf.p) || 0;
        if (mi.req && (!mi.req.expires || mi.req.expires > s.time)) {
          const txt = G.minorRequestText ? G.minorRequestText(s, mi) : 'help';
          add('spymaster', `req:${mi.id}:${mi.req.id || ''}`, mi.req.type === 'defend' ? 56 : 46 + (mi.patron === 'p' ? 6 : 0), `${mi.name}, a free city ${Math.round(d)} tiles away, asks us to ${txt}. Helping wins influence${mi.req.gold ? ' and ' + mi.req.gold + ' gold' : ''}.`, mi.req.x != null ? tileAct(mi.req.x, mi.req.y, 'Show where') : tabAct('minors', 'Free cities'));
        }
        const rival = Math.max(0, ...Object.entries(mi.inf || {}).filter(([o]) => o !== 'p').map(([, v]) => v));
        if (mi.patron === 'p' && rival >= ours - 10) {
          add('spymaster', `patron:${mi.id}`, 55, `Our hold on ${mi.name} is slipping: a rival's influence (${Math.round(rival)}) is close to ours (${Math.round(ours)}). A gift or a favour would keep its boon.`, tabAct('minors', 'Free cities'));
        } else if (!mi.patron && ours >= M.patronMin - 10 && ours < M.patronMin) {
          add('spymaster', `nearpatron:${mi.id}`, 28, `${mi.name} is close to taking us as patron (${Math.round(ours)}/${M.patronMin} influence).`, tabAct('minors', 'Free cities'));
        }
      }
    }
    if (idle.length >= 2 && Object.keys(done).length) add('spymaster', 'idle-spies', 18, `${idle.length} of our spies sit idle in their dens.`, tabAct('espionage', 'Espionage'));
  };

  // ---- High Priest: happiness, unrest, faith, festivals -------------------
  ADVISORS.priest = (s, X, add) => {
    const emp = s.empires.p;
    if (G.happiness) {
      for (const c of X.cities) {
        const h = G.happyOf(c);
        if (h >= 40) continue;
        const why = (G.happiness(s, c).why || []).filter(w => w.value < 0).sort((a, b) => a.value - b.value);
        const worst = why[0];
        const cause = worst ? ` The worst of it: ${worst.label.toLowerCase()} (${worst.value}).` : '';
        let act = null;
        if (h < 20) {
          const cost = G.placateCost ? G.placateCost(s, c) : Infinity;
          if (!((c.placated || 0) > s.time) && emp.gold >= cost) act = { kind: 'placate', c: c.id, label: `Bread & circuses (${cost} gold)` };
        }
        if (!act && worst && /High taxes/.test(worst.label)) act = { kind: 'tax', c: c.id, policy: 'normal', label: 'Lower taxes' };
        if (!act && worst && /Crowding/.test(worst.label) && canBuild(s, c, 'houses')) act = buildAct(c, 'houses', G.nextLevel(c, 'houses'));
        if (!act) { const b = AMENITY.find(t => canBuild(s, c, t)); if (b) act = buildAct(c, b, G.nextLevel(c, b)); }
        if (!act) act = tabAct('culture', 'Culture', c);
        add('priest', `${h < 20 ? 'unrest' : 'discontent'}:${c.id}`, h < 20 ? 84 : 50, h < 20 ? `${c.name} is in open unrest (happiness ${h}): goods, taxes and loyalty are falling.${cause}` : `The people of ${c.name} grumble (happiness ${h}); work slows and growth falters.${cause}`, act);
      }
    }
    // festivals and other decisions that wait on you
    for (const p of (s.pending || [])) {
      if (p.kind === 'season' || (p.kind === 'event' && p.data && p.data.ev === 'festival')) {
        add('priest', `pending:${p.id || p.title}`, 36, `The people await your word on “${p.title}”. You will find it in the decisions panel.`, null);
      }
    }
    // faith
    if (G.foundStatus && !emp.faithId) {
      const st = G.foundStatus(s, 'p');
      if (st && st.ok) add('priest', 'found-faith', 48, 'We have the faith and a temple to found a religion of our own — the gods are waiting to be named.', tabAct('religion', 'Found a faith'));
    }
    if (DATA.buildings.temple && !X.cities.some(c => G.lvl(c, 'temple')) && s.time > 1800 * paceT(s)) {
      const c = X.cities.find(x => canBuild(s, x, 'temple'));
      if (c) add('priest', 'temple', 20, 'No temple stands in our realm. A temple brings happiness, culture and faith.', buildAct(c, 'temple', 1));
    }
  };

  // ---- Archmage: strain, rifts, spells, mana ------------------------------
  const SPELL_NEED = { grain: 'hungry', popGrowth: 'grow', buildTime: 'build', def: 'threat', wall: 'threat', raw: 'prod', refine: 'prod', timber: 'prod', tax: 'gold' };
  ADVISORS.archmage = (s, X, add) => {
    if (!G.magicState) return;
    const M = G.magicState(s);
    for (const c of X.cities) {
      const v = M.strain[c.id] || 0;
      if (v > 60 && !(c.ward > s.time)) {
        const ward = G.spellStatus(s, 'p', c.id, 'manaward');
        add('archmage', `strain:${c.id}`, 74, `The weave around ${c.name} is badly strained (${Math.round(v)}). Wild magic may lash back — a rift, a storm or burnt mana. Cast nothing more from there for a while.`,
          ward.ok ? { kind: 'cast', c: c.id, spell: 'manaward', target: c.id, label: 'Cast Ward of Weaving' } : tabAct('magic', 'Magic'));
      } else if (v > 40) add('archmage', `strain40:${c.id}`, 38, `Weave strain in ${c.name} is rising (${Math.round(v)}). Past 60 it may tear.`, tabAct('magic', 'Magic'));
    }
    for (const k of Object.values(s.camps)) {
      if (k.kind !== 'rift' || !s.explored[k.y * s.map + k.x]) continue;
      const near = X.cities.find(c => dist(c, k) <= 7);
      if (near) add('archmage', `rift:${k.id}`, 64, `A demon rift gapes at (${k.x}, ${k.y}), ${dist(near, k).toFixed(0)} tiles from ${near.name}. Demons will strike until it is sealed — that is worth renown.`, tileAct(k.x, k.y, 'Show the rift'));
    }
    // a useful spell ready to cast
    const towers = X.cities.filter(c => G.lvl(c, 'magetower') > 0 && (M.strain[c.id] || 0) < 30);
    if (towers.length && G.spellsOf) {
      const needs = {};
      for (const c of X.cities) {
        const e = X.econ[c.id];
        if (e.net.grain < 2 || c.starving) needs.hungry = needs.hungry || c;
        if (c.buildQueue.length >= G.buildSlots(c)) needs.build = needs.build || c;
        if (X.threatened[c.id]) needs.threat = needs.threat || c;
        needs.prod = needs.prod || c;
      }
      const big = X.cities.slice().sort((a, b) => b.pop - a.pop)[0];
      needs.grow = big; needs.gold = big;
      if (!needs.build) needs.prod = big;
      let shown = 0;
      const order = ['threat', 'hungry', 'build', 'prod', 'grow', 'gold'];
      const spells = G.spellsOf(s, 'p').filter(id => { const sp = DATA.spells[id]; return (sp.target === 'city' || sp.target === 'realm') && sp.fx && sp.fx.length; });
      for (const need of order) {
        if (shown >= 2 || !needs[need]) continue;
        const id = spells.find(id => DATA.spells[id].fx.some(f => SPELL_NEED[f.key] === need) && towers.some(t => G.spellStatus(s, 'p', t.id, id).ok) && G.manaOf(s, 'p') >= G.spellCost(s, 'p', id) * 1.3);
        if (!id) continue;
        const sp = DATA.spells[id], from = towers.find(t => G.spellStatus(s, 'p', t.id, id).ok), tgt = sp.target === 'city' ? needs[need] : null;
        add('archmage', `spell:${id}`, need === 'threat' ? 60 : need === 'hungry' ? 42 : 26, `${sp.icon} ${sp.name} is ready${tgt ? ' for ' + tgt.name : ''}: ${sp.desc}`,
          { kind: 'cast', c: from.id, spell: id, target: tgt ? tgt.id : undefined, label: `Cast (${G.spellCost(s, 'p', id)} mana)` });
        shown++;
      }
    }
    // mana going to waste
    for (const c of X.cities) {
      const e = X.econ[c.id];
      if ((c.res.mana || 0) >= e.cap * 0.97 && (e.net.mana || 0) > 0.05 && G.lvl(c, 'magetower')) { add('archmage', `mana:${c.id}`, 30, `${c.name}'s mana stores are full; what the land gives now is lost. Spend it on a spell.`, tabAct('magic', 'Magic')); break; }
    }
    if (!X.cities.some(c => G.lvl(c, 'magetower')) && s.time > 3600 * paceT(s)) {
      const c = X.cities.find(x => canBuild(s, x, 'magetower'));
      if (c) add('archmage', 'tower', 15, 'We have no Mage Tower. Mana gathers unused; a tower would let us cast.', buildAct(c, 'magetower', 1));
    }
  };

  // ---- build, cache, filter -----------------------------------------------
  const CACHE = new WeakMap();
  const build = s => {
    const X = { cities: G.citiesOf(s, 'p'), econ: {}, threatened: {} };
    for (const c of X.cities) X.econ[c.id] = G.econ(s, c);
    for (const m of s.moves) if (m.owner !== 'p' && HOSTILE_MOVES.includes(m.type)) { const c = ourCityAt(s, m.x, m.y); if (c) X.threatened[c.id] = true; }
    const per = {};
    const add = (advisor, id, priority, text, action, extra) => {
      (per[advisor] = per[advisor] || []).push(Object.assign({ id: advisor + ':' + id, advisor, priority: Math.round(priority), text, action: action || null }, extra || {}));
    };
    if (X.cities.length) {
      for (const k of DATA.councilOrder) {
        try { ADVISORS[k](s, X, add); } catch (err) { if (typeof console !== 'undefined') console.error('council', k, err); }
      }
    }
    let all = [];
    for (const k of DATA.councilOrder) all = all.concat((per[k] || []).sort((a, b) => b.priority - a.priority).slice(0, C.perAdvisor));
    return all.sort((a, b) => b.priority - a.priority);
  };
  // every item the council would raise now (cached), before snoozes
  G.councilRaw = s => {
    const tick = Math.floor(s.time / C.refresh);
    let c = CACHE.get(s);
    if (c && c.tick === tick) return c.list;
    const list = build(s);
    CACHE.set(s, { tick, list });
    // a dismissal lasts until the situation clears; expired snoozes go
    const sn = council(s).snooze, ids = new Set(list.map(i => i.id));
    for (const [id, until] of Object.entries(sn)) if ((until === -1 && !ids.has(id)) || (until !== -1 && until <= s.time)) delete sn[id];
    return list;
  };
  G.councilDirty = s => { CACHE.delete(s); };
  const hidden = (s, id) => { const u = council(s).snooze[id]; return u === -1 || (u !== undefined && u > s.time); };
  // the advice to show: sorted by priority, snoozed and dismissed items left out. opts.advisor filters
  G.councilAdvice = (s, opts = {}) => G.councilRaw(s).filter(i => !hidden(s, i.id) && (!opts.advisor || i.advisor === opts.advisor) && (!opts.city || (i.action && i.action.c === opts.city)));
  G.councilUrgent = s => G.councilAdvice(s).filter(i => i.priority >= C.urgent).length;
  G.councilSnooze = (s, id, mins = C.snoozeMins) => { council(s).snooze[id] = s.time + mins * 60 * paceT(s); return null; };
  G.councilDismiss = (s, id) => { council(s).snooze[id] = -1; return null; };
  G.councilRestore = s => { council(s).snooze = {}; return null; };
  G.councilHiddenCount = s => G.councilRaw(s).filter(i => hidden(s, i.id)).length;

  // perform a one-click deed; returns an error string or null
  G.councilDo = (s, a) => {
    if (!a) return 'Nothing to do';
    const city = a.c && s.cities[a.c];
    if (a.c && (!city || city.owner !== 'p')) return 'That city is no longer ours';
    let err = null;
    switch (a.kind) {
      case 'build': {
        const b = DATA.buildings[a.b];
        if (!b || b.wonder || b.realmUnique) return 'The council leaves that choice to you';
        err = G.queueBuild(s, a.c, a.b); break;
      }
      case 'cast': err = G.castSpell ? G.castSpell(s, 'p', a.c, a.spell, a.target) : 'No magic'; break;
      case 'train': err = G.queueTrain(s, a.c, a.u, a.n || 1); break;
      case 'placate': err = G.placate ? G.placate(s, a.c) : 'Not possible'; break;
      case 'tax': err = G.setTaxPolicy ? G.setTaxPolicy(s, a.c, a.policy || 'normal') : 'Not possible'; break;
      default: return 'Not a deed';
    }
    CACHE.delete(s);
    return err || null;
  };
})();
