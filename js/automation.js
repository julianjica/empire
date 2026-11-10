// =====================================================================
//  Automation — delegate by domain, so the player keeps the important
//  decisions. Pure engine code (no DOM / S / UI); the view lives in
//  js/ui-automation.js.
//
//  Domains (each a few switches and a short policy, all for the player 'p'):
//    research   auto-queue when the queue is empty, by focus or "recommended" (G.techRecommend)
//    grimoire   auto-study by focus (the AI study weights), keep enchantments in tower cities,
//               cast routine economic spells (e.g. Bountiful Rain when grain is short); forks wait for
//               the player (inbox) unless allowed or preferred
//    traditions auto-adopt along a pillar (G.aiTraditionScore), forks wait for the player unless
//               allowed or preferred; hold ceremonies (seasonal decisions and on-demand customs)
//    military   garrisons through governors' training, reinforce threatened cities (and march the
//               troops home once the threat has been gone a while), intercept
//               (or only alert), clear brigand camps when strongly favoured, forge upgrades
//    hero       spend points by a build, adventure to ruins when idle and healthy, generals ride to the army
//    magi       recruit within a budget, post idle magi (court in the best tower city, study otherwise)
//    economy    governors on new cities, supply lines, market sell/buy above the gold reserve
//    settle     trains settlers when renown allows another city, picks a safe site that fills the realm's
//               shortages (site survey + homeland seeks), escorts them when hostiles are near, logs why
//    faith      priests preach where the state faith is weak, shrines when faith is poor
//    events     resolve minor decisions with a temperament after a grace period. Important ones
//               (war, treaties, offers, succession, crises) always wait for the player.
//  Reserves (gold, mana floor, minimum garrison) are never spent through.
//  Presets: handsOn (all off), assisted, delegate; any change makes it 'custom'.
//
//  State (lazy, plain JSON; old saves load as Hands-on):
//    s.automation = { v, preset, d: { domain: { switch: value } }, res: { gold, mana, garrison },
//                     log: [{ t, d, text }], next: { domain: time }, seen: { pendingId: time },
//                     known: { cityId: 1 }, alerted: { moveId: 1 }, reinf: { moveId: 1 }, forkPref: { id: 1 }, stats: { domain: n },
//                     aforkPref: { arcanaId: 1 }, lent: { moveId: { from, to, units, at, calm } } }
//  Runs in a slow hook, one or two domains per tick, staggered; never while the game is over.
//  Public: G.automation, G.AUTO, G.autoPreset, G.autoSet, G.autoReserve, G.autoRun, G.autoTick,
//          G.autoInbox, G.autoInboxDo, G.autoLogOf, G.autoRegisterCli, G.autoThreats, G.autoInterceptOptions,
//          G.autoArcForks, G.autoArcForkPref, G.autoSettlePlan
// =====================================================================
'use strict';
(() => {
  const PT = s => G.pace(s).time;
  const HOSTILE = { raid: 1, attack: 1, conquer: 1, burn: 1 };
  const NONFIGHT = { settlers: 1, herald: 1, scout: 1, hero: 1, priest: 1 };
  const fights = u => { const d = DATA.units[u]; return !!d && !!d.at && !NONFIGHT[u] && d.type !== 'civ' && d.type !== 'ship'; };
  const soldiersOf = units => { let n = 0; for (const u in units || {}) if (fights(u) && units[u] > 0) n += units[u]; return n; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const safe = (fn, dflt) => (...a) => { try { return fn(...a); } catch (e) { if (typeof console !== 'undefined' && !safe.quiet) console.error('automation', e); return dflt; } };

  // -------------------------------------------------------------------
  // Domains, switches, policies
  // -------------------------------------------------------------------
  // sw: on/off switches (label); pol: policy selects [key, label, [[value, label], ...]]
  const DOMAINS = {
    research: { icon: '📚', name: 'Research', every: 20, desc: 'Queues the next topic whenever the research queue runs dry.',
      sw: { on: 'Auto-queue research' },
      pol: [['focus', 'Focus', [['recommended', 'Recommended'], ['balanced', 'Balanced'], ['economy', 'Economy'], ['military', 'Military'], ['magic', 'Magic'], ['faith', 'Faith']]]] },
    grimoire: { icon: '📖', name: 'Grimoire', every: 30, desc: 'Studies the Grimoire, keeps enchantments on your tower cities and casts routine blessings, never below the mana floor.',
      sw: { on: 'Auto-study', ench: 'Keep enchantments', buffs: 'Routine blessings' },
      pol: [['focus', 'Study focus', [['balanced', 'Balanced'], ['economy', 'Economy'], ['war', 'War'], ['wards', 'Wards & enchantments']]], ['forks', 'At a fork', [['ask', 'Ask me'], ['auto', 'Choose for me']]]] },
    traditions: { icon: '🎭', name: 'Traditions', every: 30, desc: 'Adopts traditions along a pillar when culture allows, and holds ceremonies.',
      sw: { on: 'Auto-adopt', cer: 'Hold ceremonies' },
      pol: [['pillar', 'Pillar', [['auto', 'Best fit']]], ['forks', 'At a fork', [['ask', 'Ask me'], ['auto', 'Choose for me']]]] },
    military: { icon: '🛡️', name: 'Military', every: 15, desc: 'Keeps garrisons, moves troops to threatened cities, meets columns in the field, clears camps and forges upgrades.',
      sw: { garrison: 'Keep garrisons (governors train)', balance: 'Reinforce threatened cities', camps: 'Clear nearby camps', forge: 'Forge upgrades with surplus' },
      pol: [['defend', 'Defence', [['off', 'Off'], ['alert', 'Alert me'], ['act', 'Intercept when strong']]]] },
    hero: { icon: '🦸', name: 'Hero & generals', every: 30, desc: 'Spends hero points by a build, adventures when idle and healthy, sends idle generals to the main army.',
      sw: { points: 'Spend points', adventure: 'Adventure to ruins', generals: 'Generals join the army' },
      pol: [['build', 'Build', [['balanced', 'Balanced'], ['warrior', 'Warrior'], ['leader', 'Leader'], ['guardian', 'Guardian'], ['steward', 'Steward'], ['mage', 'Mage']]]] },
    magi: { icon: '🧙', name: 'Magi', every: 60, desc: 'Recruits magi within a budget and posts idle ones (court in the best tower city, study otherwise).',
      sw: { on: 'Recruit & post magi' },
      pol: [['budget', 'Max per recruit', [['200', '200 gold'], ['400', '400 gold'], ['800', '800 gold'], ['1600', '1600 gold']]]] },
    economy: { icon: '⚖️', name: 'Economy', every: 30, desc: 'Puts governors on new cities, keeps supply lines running, trades surplus at market above the gold reserve, and buys the goods the research queue is stuck on (governors already buy for idle builders).',
      sw: { govNew: 'Governors on new cities', supply: 'Supply lines', market: 'Sell surplus / buy shortages', buyRest: 'Buy the rest so work never stalls' },
      pol: [['focus', 'Governor focus', [['balanced', 'Balanced']]], ['buyCap', 'Spend per purchase', [['25', '¼ of spare gold'], ['50', '½ of spare gold'], ['100', 'All spare gold']]]] },
    settle: { icon: '🏕️', name: 'Settlement', every: 30, desc: 'Trains settlers when renown allows another city, picks a safe site that fills what the realm lacks, and escorts the settlers when hostiles are near.',
      sw: { on: 'Found new cities' },
      pol: [['prefer', 'Prefer', [['gaps', 'What the realm lacks'], ['fit', 'Land our people love'], ['near', 'Close to home']]]] },
    faith: { icon: '⛪', name: 'Faith', every: 60, desc: 'Priests at home preach where your faith is weak; shrines go up when faith runs thin.',
      sw: { preach: 'Priests preach', shrines: 'Build shrines' }, pol: [] },
    events: { icon: '📜', name: 'Decisions', every: 10, desc: 'Answers minor decisions (events, seasons, tales, unrest) after a grace period. War, treaties, offers, succession and crises always wait for you.',
      sw: { on: 'Answer minor decisions' },
      pol: [['temper', 'Temperament', [['cautious', 'Cautious'], ['balanced', 'Balanced'], ['bold', 'Bold']]], ['grace', 'Grace', [['30', '½ min'], ['90', '1½ min'], ['180', '3 min']]]] },
  };
  const ORDER = Object.keys(DOMAINS);
  const RES = { gold: [0, 100, 300, 600, 1000, 2000], mana: [0, 30, 60, 120, 250], garrison: [0, 5, 10, 20, 40] };
  const BASE = () => ({
    research: { on: false, focus: 'recommended' },
    grimoire: { on: false, ench: false, buffs: false, focus: 'balanced', forks: 'ask' },
    traditions: { on: false, cer: false, pillar: 'auto', forks: 'ask' },
    military: { garrison: false, balance: false, camps: false, forge: false, defend: 'off' },
    hero: { points: false, adventure: false, generals: false, build: 'balanced' },
    magi: { on: false, budget: '400' },
    economy: { govNew: false, supply: false, market: false, buyRest: false, focus: 'balanced', buyCap: '25' },
    settle: { on: false, prefer: 'gaps' },
    faith: { preach: false, shrines: false },
    events: { on: false, temper: 'balanced', grace: '90' },
  });
  const PRESETS = {
    handsOn: { name: 'Hands-on', icon: '✋', desc: 'Everything is yours to decide. Supply lines and governors stay as you set them.', set: {} },
    assisted: { name: 'Assisted', icon: '🤝', desc: 'Research and study keep going, governors take new cities, supplies flow, ceremonies are held and you are warned of attacks.',
      set: { research: { on: true }, grimoire: { on: true }, economy: { govNew: true, supply: true }, traditions: { cer: true }, military: { defend: 'alert' } } },
    delegate: { name: 'Delegate', icon: '🤖', desc: 'Your stewards run the realm; you decide war, treaties, succession and crises.',
      set: { research: { on: true }, grimoire: { on: true, ench: true, buffs: true, forks: 'auto' }, traditions: { on: true, cer: true, forks: 'auto' },
        military: { garrison: true, balance: true, camps: true, forge: true, defend: 'act' }, hero: { points: true, adventure: true, generals: true },
        magi: { on: true }, economy: { govNew: true, supply: true, market: true, buyRest: true }, settle: { on: true }, faith: { preach: true, shrines: true }, events: { on: true } } },
  };
  // decisions the stewards may answer, and those that always wait for the player
  const MINOR = { event: 1, season: 1, storylet: 1, unrest: 1 };
  const IMPORTANT = { deal: 'offer', callToArms: 'war', peaceOffer: 'offer', allianceOffer: 'offer', tribute: 'offer', tradeRoute: 'offer',
    dynSuccession: 'succession', dynPretender: 'succession', dynClaim: 'succession', dynMatch: 'offer', crisis: 'crisis' };
  const FOCUS_BRANCH = {
    recommended: null, balanced: null,
    economy: { agri: 1, industry: 1, build: 1, commerce: 1, sea: 0.5, state: 0.4 },
    military: { war: 1, siege: 1, state: 0.4 },
    magic: { arcana: 1, lore: 1 },
    faith: { faith: 1, state: 0.6, lore: 0.4 },
  };
  const HERO_BUILD = {
    balanced: { str: 0.25, lead: 0.25, guard: 0.2, econ: 0.15, arcana: 0.15 }, warrior: { str: 0.65, lead: 0.35 }, leader: { lead: 0.6, str: 0.25, guard: 0.15 },
    guardian: { guard: 0.6, str: 0.4 }, steward: { econ: 0.6, guard: 0.4 }, mage: { arcana: 0.6, lead: 0.2, econ: 0.2 },
  };
  // returnCalm: game-minutes (× pace) a reinforced city must be free of threats before lent troops march home
  // settleRange / settleSafe / settleEscort: how far settlers look, how close danger may come to a site, and within what
  // distance of the site or the road hostiles call for an escort (share of the spare garrison)
  const AUTO = G.AUTO = { DOMAINS, ORDER, PRESETS, RES, MINOR, IMPORTANT, logMax: 80, inRatio: 1.7, campRatio: 2.5, advWin: 0.6, adoptGrace: 0,
    returnCalm: 10, settleRange: 9, settleSafe: 3, settleEscort: 6, escortShare: 0.5 };

  // pillar and governor-focus choices come from the tables other modules define
  const fillChoices = () => {
    if (DATA.pillars && DOMAINS.traditions.pol[0][2].length === 1) for (const [k, p] of Object.entries(DATA.pillars)) DOMAINS.traditions.pol[0][2].push([k, `${p.icon} ${p.name}`]);
    if (DATA.govFocus && DOMAINS.economy.pol[0][2].length === 1) for (const k of DATA.govFocusOrder || Object.keys(DATA.govFocus)) if (k !== 'balanced') DOMAINS.economy.pol[0][2].push([k, DATA.govFocus[k].name]);
  };

  // -------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------
  const logOn = s => !!(s.logistics && s.logistics.p ? s.logistics.p.on !== false : true);
  // fill in whatever a partial or older s.automation lacks (domains added later, switches, maps, reserves), keeping
  // every value it has; checked once per object (a loaded save is a new object, so it is checked again)
  const FILLED = new WeakSet();
  const MAPS = ['next', 'seen', 'known', 'alerted', 'reinf', 'forkPref', 'aforkPref', 'lent', 'stats'];
  const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const fill = A => {
    const base = BASE();
    if (!isObj(A.d)) A.d = {};
    for (const k of ORDER) A.d[k] = Object.assign(base[k], isObj(A.d[k]) ? A.d[k] : {});
    A.res = Object.assign({ gold: 300, mana: 60, garrison: 10 }, isObj(A.res) ? A.res : {});
    for (const k of MAPS) if (!isObj(A[k])) A[k] = {};
    if (!Array.isArray(A.log)) A.log = [];
    if (!A.preset) A.preset = 'custom';
    FILLED.add(A);
    return A;
  };
  G.automation = s => {
    const A0 = s.automation;
    if (A0 && A0.v) { if (!FILLED.has(A0)) { fillChoices(); fill(A0); } return A0; }
    fillChoices();
    const A = s.automation = Object.assign({ v: 1, preset: 'handsOn' }, isObj(s.automation) ? s.automation : {});
    A.v = 1;
    fill(A);
    // an older realm keeps its supply lines as they were
    A.d.economy.supply = logOn(s);
    for (const c of G.citiesOf(s, 'p')) A.known[c.id] = 1;
    return A;
  };
  const alog = (s, d, text) => {
    const A = G.automation(s);
    A.log.unshift({ t: Math.round(s.time), d, text });
    if (A.log.length > AUTO.logMax) A.log.length = AUTO.logMax;
    A.stats[d] = (A.stats[d] || 0) + 1;
  };
  G.autoLogOf = (s, d) => G.automation(s).log.filter(e => !d || e.d === d);

  const goldFree = (s, A) => s.empires.p.gold - A.res.gold;
  const manaFree = (s, A) => (G.manaOf ? G.manaOf(s, 'p') : 0) - A.res.mana;

  // side effects of a switch that drive other modules' own automation
  const applySide = (s, A, d, k) => {
    const E = A.d.economy;
    if (d === 'economy' && k === 'supply' && G.setSupplyRealm) {
      if (E.supply) { const L = s.logistics && s.logistics.p; if (!L || !L.goods || !Object.keys(L.goods).length) G.supplyRecommend(s, 'p'); G.setSupplyRealm(s, 'p', { on: true }); }
      else G.setSupplyRealm(s, 'p', { on: false });
    }
    if (d === 'economy' && k === 'market' && G.setSupplyRealm) G.setSupplyRealm(s, 'p', { sell: !!E.market, buy: !!E.market, reserve: A.res.gold });
    if (d === 'military' && k === 'garrison' && A.d.military.garrison) garrisons(s, A);
  };

  G.autoPreset = (s, key) => {
    const P = PRESETS[key];
    if (!P) return 'Unknown preset';
    const A = G.automation(s);
    const prev = JSON.parse(JSON.stringify(A.d));
    const base = BASE();
    for (const d of ORDER) {
      // policies chosen by the player survive a preset; switches follow it
      const keep = {};
      for (const [k] of DOMAINS[d].pol) keep[k] = A.d[d][k];
      A.d[d] = Object.assign(base[d], keep, P.set[d] || {});
      if (P.set[d] && P.set[d].defend) A.d[d].defend = P.set[d].defend;
      if (P.set[d] && P.set[d].forks) A.d[d].forks = P.set[d].forks;
    }
    // Hands-on leaves supply lines exactly as they are (the base game runs them for the player by default)
    if (key === 'handsOn') { A.d.military.defend = 'off'; A.d.traditions.forks = 'ask'; A.d.grimoire.forks = 'ask'; A.d.economy.supply = logOn(s); }
    A.preset = key;
    // keep other modules in step only where something changed
    if (prev.economy.supply !== A.d.economy.supply || logOn(s) !== A.d.economy.supply) applySide(s, A, 'economy', 'supply');
    if (prev.economy.market !== A.d.economy.market) applySide(s, A, 'economy', 'market');
    if (A.d.military.garrison) garrisons(s, A);
    if (A.d.economy.govNew) for (const c of G.citiesOf(s, 'p')) A.known[c.id] = 1;
    // Delegate hands every city to a governor at once
    if (key === 'delegate') for (const c of G.citiesOf(s, 'p')) if (G.govOf && !G.govOf(s, c.id)) { G.setGovernor(s, c.id, { focus: A.d.economy.focus }); govReserve(s, A, c.id); alog(s, 'economy', `A governor (${focusName(A.d.economy.focus)}) takes over ${c.name}`); }
    for (const d of ORDER) A.next[d] = Math.min(A.next[d] || 0, s.time + ORDER.indexOf(d) * 2);
    return null;
  };
  G.autoSet = (s, d, k, v) => {
    const A = G.automation(s), D = DOMAINS[d];
    if (!D) return 'Unknown domain';
    const pol = D.pol.find(p => p[0] === k);
    if (D.sw[k] !== undefined) A.d[d][k] = v === true || v === 'on' || v === 'true' || v === 1 || v === '1';
    else if (pol) { if (!pol[2].some(([x]) => String(x) === String(v))) return `Choose one of: ${pol[2].map(x => x[0]).join(', ')}`; A.d[d][k] = String(v); }
    else return 'Unknown setting';
    A.preset = 'custom';
    applySide(s, A, d, k);
    A.next[d] = s.time;
    return null;
  };
  // a whole domain on or off (every switch; Military's defence goes to act / off)
  G.autoDomain = (s, d, on) => {
    const D = DOMAINS[d]; if (!D) return 'Unknown domain';
    for (const k of Object.keys(D.sw)) { const e = G.autoSet(s, d, k, !!on); if (e) return e; }
    if (d === 'military') G.automation(s).d.military.defend = on ? 'act' : 'off';
    return null;
  };
  G.autoDomainOn = (s, d) => { const A = G.automation(s), D = DOMAINS[d]; return Object.keys(D.sw).some(k => A.d[d][k]) || (d === 'military' && A.d.military.defend !== 'off'); };
  G.autoReserve = (s, k, v) => {
    const A = G.automation(s);
    if (!(k in A.res)) return 'Unknown reserve';
    A.res[k] = Math.max(0, Math.min(100000, Math.floor(+v || 0)));
    if (k === 'gold' && A.d.economy.market) applySide(s, A, 'economy', 'market');
    if (k === 'garrison' && A.d.military.garrison) garrisons(s, A);
    return null;
  };

  // -------------------------------------------------------------------
  // Helpers shared by domains and the inbox
  // -------------------------------------------------------------------
  const targetCity = (s, m) => { const t = G.tileAt(s, m.x, m.y); return t && t.city ? s.cities[t.city] : null; };
  G.autoThreats = s => s.moves.filter(m => m.owner !== 'p' && HOSTILE[m.type] && m.arrive > s.time && (() => { const c = targetCity(s, m); return c && c.owner === 'p'; })());
  const threatened = s => { const set = new Set(); for (const m of G.autoThreats(s)) { const c = targetCity(s, m); if (c) set.add(c.id); } return set; };
  // fighting troops a city can spare above the minimum garrison (whole types, proportionally)
  const surplus = (city, keep, share = 1, naval = false) => {
    const own = {}; let n = 0;
    for (const [u, k] of Object.entries(city.units || {})) {
      const d = DATA.units[u];
      if (!d || !(k > 0) || NONFIGHT[u] || d.type === 'civ' || !d.at) continue;
      if (naval !== (d.type === 'ship')) continue;
      own[u] = k; n += k;
    }
    const spare = Math.max(0, n - keep) * share;
    if (spare < 1 || !n) return {};
    const out = {};
    for (const [u, k] of Object.entries(own)) { const x = Math.floor(k * spare / n); if (x > 0) out[u] = x; }
    return out;
  };
  const focusName = f => (DATA.govFocus && DATA.govFocus[f] ? DATA.govFocus[f].name : f).toLowerCase();
  const govReserve = (s, A, cityId) => { const g = s.council && s.council.gov && s.council.gov[cityId]; if (g && (g.reserve || 0) < A.res.gold) G.setGovernor(s, cityId, { reserve: A.res.gold }); };
  const garrisons = (s, A) => {
    if (!G.setGovernor || !s.council) return;
    for (const c of G.citiesOf(s, 'p')) {
      const g = s.council.gov && s.council.gov[c.id];
      if (g && g.on && (g.troops || 0) < A.res.garrison) { G.setGovernor(s, c.id, { troops: A.res.garrison }); alog(s, 'military', `${c.name}'s governor will keep ${A.res.garrison} soldiers`); }
    }
  };

  // intercept options against hostile columns (cached briefly: previews are not free)
  const IC_CACHE = new WeakMap();
  G.autoInterceptOptions = (s, fresh) => {
    const key = s.moves.length + ':' + Math.floor(s.time / 10);
    const c0 = IC_CACHE.get(s);
    if (!fresh && c0 && c0.key === key) return c0.list.filter(o => s.moves.includes(o.T));
    const A = G.automation(s), list = [];
    if (G.interceptPlan && G.previewIntercept) {
      const mine = G.citiesOf(s, 'p');
      for (const T of G.autoThreats(s)) {
        if (T.arrive - s.time < 30 || s.moves.some(x => x.type === 'intercept' && x.owner === 'p' && x.target === T.id)) continue;
        if (G.canIntercept(s, 'p', T)) continue;
        const p = G.movePos(s, T);
        let best = null;
        for (const c of mine.slice().sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 3)) {
          const units = surplus(c, A.res.garrison, 1, !!T.naval);
          if (!G.unitsCount(units)) continue;
          const plan = G.interceptPlan(s, 'p', c, T, units, null, { stride: 2 });
          if (!plan.ok) continue;
          const r = G.previewIntercept(s, c, T, units, null, plan);
          if (!r) continue;
          const ratio = r.D > 0 ? r.A / r.D : 9;
          if (!best || ratio > best.ratio) best = { T, city: c, units, ratio, A: r.A, D: r.D, target: targetCity(s, T), at: plan.name };
        }
        if (best) list.push(best);
      }
    }
    IC_CACHE.set(s, { key, list });
    return list;
  };

  // -------------------------------------------------------------------
  // Domain runners: each returns quietly when there is nothing to do
  // -------------------------------------------------------------------
  const RUN = {};

  RUN.research = (s, A) => {
    const P = A.d.research;
    if (!P.on || !G.research) return;
    const R = G.research(s, 'p');
    if ((R.queue || []).length) return;
    const sl = G.researchSlots(s, 'p');
    if (sl.free <= 0) return;
    const W = FOCUS_BRANCH[P.focus];
    const cand = G.techRecommend(s, 'p', W ? 40 : 12);
    let best = null, bs = 0;
    cand.forEach((id, i) => {
      const t = DATA.techs[id];
      const cost = G.techCost(id, t.repeat ? G.techLevel(s, 'p', id) + 1 : 1);
      if ((cost.gold || 0) > goldFree(s, A)) return;
      const w = (W ? (W[t.branch] || 0) : 1) / (1 + i * 0.2);
      if (w > bs) { bs = w; best = id; }
    });
    if (!best && W) best = cand.find(id => (G.techCost(id, 1).gold || 0) <= goldFree(s, A)) || null;
    if (!best) return;
    if (G.planResearch(s, 'p', null, best) === null) { const t = DATA.techs[best]; alog(s, 'research', `Queued ${t.icon} ${t.name} (${P.focus === 'recommended' ? 'recommended' : P.focus + ' focus'})`); }
  };

  const NODEW = {
    economy: n => (n.kind === 'ench' ? 1.6 : 0) + (n.spells || []).some(k => DATA.spells[k] && DATA.spells[k].ai === 'econ') * 2 + Object.keys(n.fx || {}).some(k => /grain|timber|stone|ore|mana|tax|popGrowth|housing|refine|buildTime|caravan|fishing|studyTime|spellCost|enchUpkeep/.test(k)) * 1.2,
    war: n => (n.spells || []).some(k => DATA.spells[k] && ['strike', 'defend'].includes(DATA.spells[k].ai)) * 2 + Object.keys(n.fx || {}).some(k => /atk|def|wall|raise|summon|travel/.test(k)) * 1.4,
    wards: n => (n.kind === 'ench' ? 2.5 : 0) + (n.spells || []).some(k => DATA.spells[k] && ['ward', 'defend'].includes(DATA.spells[k].ai)) * 1.5 + ((n.add || {}).enchSlots ? 1.5 : 0),
  };
  // may the stewards study this node? a fork side only when preferred, or when they may choose (its twin not preferred)
  const arcForkOk = (A, id) => {
    const n = (DATA.arcana || {})[id];
    if (!n || !n.excl) return true;
    const P = A.aforkPref || {};
    if (P[id]) return true;
    if (P[n.excl]) return false;
    return A.d.grimoire.forks === 'auto';
  };
  const studyPick = (s, A) => {
    const N = DATA.arcana || {}, f = A.d.grimoire.focus;
    const known = new Set(((s.empires.p.arcana || {}).known) || []);
    const ok = id => {
      const n = N[id]; if (!n || known.has(id)) return null;
      if (!arcForkOk(A, id)) return null;                  // a fork: the player's call
      const st = G.arcanaStatus(s, 'p', id);
      if (!st.ok || (st.cost.gold || 0) > goldFree(s, A) || (st.cost.mana || 0) > manaFree(s, A)) return null;
      return st;
    };
    // cheap filters first (prerequisites, school, fork), the full status only for the few that pass
    const schools = G.schoolsOf ? G.schoolsOf(s, 'p') : [];
    const KIND_W = { spell: 1.6, lore: 1.1, ench: 1.8, meta: 0.6 };
    let best = null, bs = 0;
    for (const id of DATA.arcanaOrder || []) {
      const n = N[id];
      if (!n || known.has(id) || (n.excl && (known.has(n.excl) || !arcForkOk(A, id))) || (n.school && !schools.includes(n.school)) || !(n.pre || []).every(g => g.some(x => known.has(x)))) continue;
      let w = f === 'balanced' ? (KIND_W[n.kind] || 1) : (NODEW[f] ? NODEW[f](n) : 1);
      if (w <= 0) continue;
      if (n.excl && (A.aforkPref || {})[id]) w = Math.max(w, 1) * 3;     // the side the player chose comes first
      if (n.school && G.schoolAttuned && G.schoolAttuned(s, 'p', n.school)) w *= 1.3;
      w /= 1 + 0.25 * (n.col || 0);
      if (w <= bs || !ok(id)) continue;
      bs = w; best = id;
    }
    return best;
  };
  // Grimoire forks the stewards wait on: both sides open to study (prerequisites, school, tower and era), neither known
  G.autoArcForks = s => {
    const A = G.automation(s), N = DATA.arcana || {}, out = [];
    const Ar = s.empires.p && s.empires.p.arcana;
    if (!G.arcanaStatus || !Ar) return out;
    const known = new Set(Ar.known || []), P = A.aforkPref || {}, seen = new Set();
    const schools = G.schoolsOf ? G.schoolsOf(s, 'p') : null;
    const open = id => {
      const n = N[id];
      if (!n || known.has(id) || (Ar.active && Ar.active.id === id)) return false;
      if (schools && n.school && !schools.includes(n.school)) return false;
      if (!(n.pre || []).every(g => g.some(x => known.has(x)))) return false;
      const st = G.arcanaStatus(s, 'p', id);
      return !st.locked && !st.forsaken && !st.hidden && !st.known && !st.active;
    };
    for (const id of DATA.arcanaOrder || Object.keys(N)) {
      const n = N[id];
      if (!n || !n.excl || seen.has(id)) continue;
      seen.add(id); seen.add(n.excl);
      if (P[id] || P[n.excl]) continue;
      if (open(id) && open(n.excl)) out.push([id, n.excl]);
    }
    return out;
  };
  G.autoArcForkPref = (s, id) => {
    const A = G.automation(s), n = (DATA.arcana || {})[id];
    if (!n || !n.excl) return 'Not a fork in the Grimoire';
    if (((s.empires.p.arcana || {}).known || []).includes(n.excl)) return `Already forsaken for ${DATA.arcana[n.excl].name}`;
    A.aforkPref[id] = 1; delete A.aforkPref[n.excl];
    A.studyAt = 0; A.next.grimoire = Math.min(A.next.grimoire || 0, s.time);
    alog(s, 'grimoire', `${n.icon || '📖'} ${n.name} chosen over ${DATA.arcana[n.excl].name} (at your word)`);
    return null;
  };
  RUN.grimoire = (s, A) => {
    const P = A.d.grimoire, emp = s.empires.p;
    if (!G.arcanaStatus) return;
    const towers = G.citiesOf(s, 'p').filter(c => G.lvl(c, 'magetower') > 0);
    if (!towers.length) return;
    // study
    const Ar = emp.arcana;
    if (P.on && Ar && !Ar.active && !(Ar.queue || []).length && (A.studyAt || 0) <= s.time) {
      const id = studyPick(s, A);
      if (!id) A.studyAt = s.time + 90 * PT(s);       // nothing affordable: look again in a while
      if (id && G.startStudy(s, 'p', id) === null) { const n = DATA.arcana[id]; alog(s, 'grimoire', `Began studying ${n.icon || '📖'} ${n.name} (${n.excl ? ((A.aforkPref || {})[id] ? 'the side of the fork you chose' : `chose it over ${DATA.arcana[n.excl].name} at a fork`) : P.focus + ' focus'})`); }
    }
    // enchantments where the tower can feed them
    if (P.ench && G.enchantmentsKnown) {
      const known = G.enchantmentsKnown(s, 'p');
      for (const c of towers) {
        if ((A.enchOff || {})[c.id] || (c.ench || []).length >= G.enchantSlots(s, c)) continue;
        const net = (G.econ(s, c).net || {}).mana || 0;
        const pick = known.filter(k => !G.hasEnchantment(c, k) && net > DATA.enchantments[k].upkeep * 1.5 * G.pace(s).prod && G.enchantStatus(s, 'p', c.id, k).ok && G.enchantCost(s, 'p', k).mana <= manaFree(s, A))[0];
        if (pick && G.enchantCity(s, 'p', c.id, pick) === null) { alog(s, 'grimoire', `Enchanted ${c.name}: ${DATA.enchantments[pick].icon} ${DATA.enchantments[pick].name}`); break; }
      }
    }
    // routine blessings: grain spells where grain is short, others only when the stores would spill
    if (P.buffs && G.spellsOf) {
      const best = towers.slice().sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'))[0];
      const strain = (s.magic && s.magic.strain && s.magic.strain[best.id]) || 0;
      if (strain > 40) return;
      const fill = G.manaFill ? G.manaFill(s, 'p') : 0;
      const cities = G.citiesOf(s, 'p');
      let hungry;      // worked out only when a grain spell is ready to cast
      const hungryOf = () => hungry !== undefined ? hungry : (hungry = cities.map(c => ({ c, net: (c.short && c.short.grain) ? -1e9 : ((G.econLean || G.econ)(s, c).net || {}).grain || 0 })).filter(x => x.net < 0).sort((a, b) => a.net - b.net)[0] || null);
      for (const id of G.spellsOf(s, 'p')) {
        const sp = DATA.spells[id];
        if (!sp || sp.ai !== 'econ' || !['city', 'realm'].includes(sp.target)) continue;
        const grain = (sp.fx || []).some(f => f.key === 'grain');
        if (!grain && fill < 0.6) continue;
        const st = G.spellStatus(s, 'p', best.id, id);
        if (!st.ok || st.cost > manaFree(s, A)) continue;
        if (grain && !hungryOf()) continue;
        const tgt = sp.target === 'city' ? (grain ? hungry.c : cities.slice().sort((a, b) => b.pop - a.pop)[0]) : null;
        if (G.castSpell(s, 'p', best.id, id, tgt ? tgt.id : undefined) === null) { alog(s, 'grimoire', `Cast ${sp.icon} ${sp.name}${tgt ? ' on ' + tgt.name : ''}${grain ? ' (grain is short)' : ' (mana stores brimming)'}`); break; }
      }
    }
  };

  // tradition forks the stewards wait on (both sides open, neither preferred)
  const forkOpen = (s, A, id) => {
    const t = DATA.traditions[id];
    if (!t || !t.excl) return false;
    if (A.forkPref[id]) return false;
    if (A.forkPref[t.excl]) return true;          // the other side is the chosen one
    return A.d.traditions.forks !== 'auto';
  };
  const tradCtx = (s, emp) => {
    const cities = G.citiesOf(s, emp.id);
    return { unhappy: cities.some(c => G.happyOf(c) < 50), atWar: Object.values(s.empires).some(o => o.id !== 'p' && !o.dead && G.rel(s, o.id).status === 'war'),
      big: cities.length > G.sizeFreeOf(s) + 1, faith: !!emp.faithId, ethos: G.ethosOf(s, emp.id) };
  };
  G.autoTraditionPick = s => {
    const A = G.automation(s), emp = s.empires.p, P = A.d.traditions;
    if (!G.traditionsFor || !G.traditionOpen) return null;
    const open = G.traditionsFor(s, 'p').filter(id => G.traditionOpen(s, 'p', id));
    const allowed = open.filter(id => !forkOpen(s, A, id));
    const inPillar = P.pillar !== 'auto' ? allowed.filter(id => DATA.traditions[id].pillar === P.pillar) : allowed;
    const pool = inPillar.length ? inPillar : allowed;
    if (!pool.length) return null;
    const ctx = tradCtx(s, emp);
    let best = null, bs = -1e9;
    for (const id of pool) {
      let v = G.aiTraditionScore(s, emp, id, ctx) - Math.random() * 1.5;
      if (A.forkPref[id]) v += 8;
      if (v > bs) { bs = v; best = id; }
    }
    return best;
  };
  G.autoForks = s => {
    const A = G.automation(s);
    if (!G.traditionsFor) return [];
    const out = [], seen = new Set();
    for (const id of G.traditionsFor(s, 'p')) {
      const t = DATA.traditions[id];
      if (!t.excl || seen.has(id) || A.forkPref[id] || A.forkPref[t.excl]) continue;
      if (!G.traditionOpen(s, 'p', id) || !G.traditionOpen(s, 'p', t.excl)) continue;
      seen.add(id); seen.add(t.excl);
      out.push([id, t.excl]);
    }
    return out;
  };
  G.autoForkPref = (s, id) => { const A = G.automation(s), t = DATA.traditions[id]; if (!t) return 'Unknown tradition'; A.forkPref[id] = 1; if (t.excl) delete A.forkPref[t.excl]; return null; };
  const cerOk = (s, A, cost) => (cost.gold || 0) <= goldFree(s, A);
  RUN.traditions = (s, A) => {
    const P = A.d.traditions, emp = s.empires.p;
    if (P.on) {
      const id = emp.autoTrad && DATA.traditions[emp.autoTrad] && G.traditionOpen(s, 'p', emp.autoTrad) && !forkOpen(s, A, emp.autoTrad) ? emp.autoTrad : G.autoTraditionPick(s);
      emp.autoTrad = id || null;
      if (id && G.traditionStatus(s, 'p', id).ok && G.adoptTradition(s, 'p', id) === null) {
        const t = DATA.traditions[id];
        alog(s, 'traditions', `Adopted ${t.icon} ${t.name}${P.pillar !== 'auto' && t.pillar === P.pillar ? ` (${DATA.pillars[P.pillar].name})` : ''}`);
        emp.autoTrad = null;
      }
    }
    if (P.cer && G.ceremoniesOf) {
      // seasonal ceremonies offered as decisions
      for (const p of (s.pending || []).slice()) {
        if (p.kind !== 'ceremony') continue;
        const st = G.ceremonyStatus(s, 'p', p.data.id);
        if (st.ok && cerOk(s, A, st.cost) && G.resolvePending(s, p.id, 'hold') === null) alog(s, 'traditions', `Held the ${DATA.ceremonies[p.data.id].name}`);
      }
      // customs held on demand when they answer a need (as the AI courts do)
      const cities = G.citiesOf(s, 'p');
      const unhappy = cities.some(c => G.happyOf(c) < 45), restless = cities.some(c => (c.loyalty ?? 100) < 60 && G.happyOf(c) < 30);
      const atWar = Object.values(s.empires).some(o => o.id !== 'p' && !o.dead && G.rel(s, o.id).status === 'war');
      const want = { lanterns: unhappy, pilgrimage: unhappy, midsummer: unhappy, assize: restless, warfeast: atWar && G.autoThreats(s).length > 0, saganight: true, firstfurrow: G.season(s).index === 0, hammerday: true, fair: true, starrite: (G.manaFill ? G.manaFill(s, 'p') : 1) < 0.3 };
      for (const id of G.ceremoniesOf(s, 'p')) {
        const c = DATA.ceremonies[id];
        if (!want[id] || c.season !== undefined) continue;
        const st = G.ceremonyStatus(s, 'p', id);
        if (st.ok && cerOk(s, A, st.cost) && G.holdCeremony(s, 'p', id) === null) { alog(s, 'traditions', `Held the ${c.name}`); break; }
      }
    }
  };

  // troops sent to reinforce a threatened city: once it has been calm for AUTO.returnCalm minutes they march home,
  // as many as are still there (the player may have moved some), never below the city's minimum garrison
  const lentHome = (s, A) => {
    const L = A.lent;
    if (!L || !Object.keys(L).length) return;
    const hot = threatened(s), calmFor = AUTO.returnCalm * 60 * PT(s);
    for (const [id, r] of Object.entries(L)) {
      const to = s.cities[r.to], home = s.cities[r.from];
      if (!to || to.owner !== 'p' || !home || home.owner !== 'p') { delete L[id]; continue; }
      if (r.at == null) {
        if (s.moves.some(m => m.id === id)) continue;                     // still on the road
        if (s.moves.some(m => m.via === id)) { delete L[id]; continue; }  // the player recalled or rerouted them
        r.at = r.calm = s.time;
      }
      if (hot.has(to.id) || hot.has(home.id)) { r.calm = s.time; continue; }
      if (s.time - r.calm < calmFor) continue;
      delete L[id];
      const units = {};
      let spare = soldiersOf(to.units) - A.res.garrison;
      for (const [u, n] of Object.entries(r.units)) { const k = Math.min(n, to.units[u] || 0, Math.max(0, spare)); if (k > 0) { units[u] = k; spare -= k; } }
      if (!G.unitsCount(units)) continue;
      if (G.sendArmy(s, to.id, home.x, home.y, 'reinforce', units) === null) alog(s, 'military', `${G.unitsCount(units)} soldiers lent to ${to.name} march home to ${home.name} (no threat for ${AUTO.returnCalm} min)`);
    }
  };
  G.autoLent = s => G.automation(s).lent;
  RUN.military = (s, A) => {
    const P = A.d.military;
    const threats = G.autoThreats(s);
    const hot = threatened(s);
    // garrisons through the governors' own training
    if (P.garrison) garrisons(s, A);
    // reinforce threatened cities that would not hold
    if (P.balance && threats.length) {
      for (const T of threats) {
        if (A.reinf[T.id]) continue;
        const X = targetCity(s, T); if (!X) continue;
        const atk = G.atkPower(s, T.owner, T.units || {});
        let need = atk * 1.2 - G.defPower(s, 'p', X.units);
        if (need <= 0) { A.reinf[T.id] = 1; continue; }
        const left = T.arrive - s.time - 5;
        for (const c of G.citiesOf(s, 'p').filter(c => c.id !== X.id && !hot.has(c.id)).sort((a, b) => dist(a, X) - dist(b, X))) {
          if (need <= 0) break;
          const units = surplus(c, A.res.garrison, 0.6);
          if (!G.unitsCount(units)) continue;
          if (G.travelTime(s, 'p', c, X, G.slowest(s, 'p', units)) >= left) continue;
          if (G.sendArmy(s, c.id, X.x, X.y, 'reinforce', units)) continue;
          const lm = s.moves.filter(m => m.owner === 'p' && m.type === 'reinforce' && m.from === c.id && m.x === X.x && m.y === X.y && m.depart === s.time).pop();
          if (lm) A.lent[lm.id] = { from: c.id, to: X.id, units: { ...lm.units }, at: null, calm: null };
          need -= G.defPower(s, 'p', units);
          alog(s, 'military', `Sent ${G.unitsCount(units)} soldiers from ${c.name} to reinforce ${X.name} (${s.empires[T.owner] ? 'the ' + s.empires[T.owner].name : 'raiders'} are coming)`);
        }
        A.reinf[T.id] = 1;
      }
    }
    // meet columns in the field
    if (P.defend !== 'off' && threats.length) {
      for (const o of G.autoInterceptOptions(s, true)) {
        if (A.alerted[o.T.id] && P.defend !== 'act') continue;
        const who = s.empires[o.T.owner] ? 'the ' + s.empires[o.T.owner].name : 'raiders';
        if (P.defend === 'act' && o.ratio >= AUTO.inRatio) {
          if (G.sendIntercept(s, o.city.id, o.T.id, o.units, null) === null) { alog(s, 'military', `Intercepting ${who} from ${o.city.name} at ${o.at} (odds ${o.ratio.toFixed(1)}:1)`); A.alerted[o.T.id] = 1; IC_CACHE.delete(s); }
        } else if (!A.alerted[o.T.id]) {
          A.alerted[o.T.id] = 1;
          const txt = `Defence alert: ${who} march on ${o.target ? o.target.name : 'your lands'}; ${o.city.name} could meet them at ${o.at} (odds ${o.ratio.toFixed(1)}:1)`;
          alog(s, 'military', txt);
          G.log(s, 'p', '🤖 ' + txt, o.ratio >= AUTO.inRatio ? 'warn' : 'info');
        }
      }
    }
    // lent troops march home once the threat has been gone a while
    if (P.balance) lentHome(s, A);
    // tidy memories of columns that have passed
    for (const k of ['alerted', 'reinf']) for (const id of Object.keys(A[k])) if (!s.moves.some(m => m.id === id)) delete A[k][id];
    // brigand camps near home, when strongly favoured and nothing threatens us
    if (P.camps && !threats.length && (A.campAt || 0) <= s.time) {
      A.campAt = s.time + 60 * PT(s);
      const camps = Object.values(s.camps || {}).filter(k => !k.kind && G.unitsCount(k.units) > 0);
      outer: for (const c of G.citiesOf(s, 'p')) {
        const units = surplus(c, Math.ceil(A.res.garrison * 1.5));
        if (G.unitsCount(units) < 5) continue;
        for (const k of camps.filter(k => dist(k, c) <= 6).sort((a, b) => dist(a, c) - dist(b, c))) {
          if (s.moves.some(m => m.owner === 'p' && m.x === k.x && m.y === k.y)) continue;
          const tile = G.tileAt(s, k.x, k.y);
          const r = (G.previewField || G.previewBattle)(s, c, tile, units, 'raid');
          if (!r || !r.win || r.A < r.D * AUTO.campRatio) continue;
          if (!G.sendArmy(s, c.id, k.x, k.y, 'raid', units)) { alog(s, 'military', `Sent ${G.unitsCount(units)} soldiers from ${c.name} to clear the brigand camp at (${k.x}, ${k.y})`); break outer; }
        }
      }
    }
    // forge upgrades with surplus
    if (P.forge && G.forgeStatus && (A.forgeAt || 0) <= s.time) {
      A.forgeAt = s.time + 90 * PT(s);
      const count = {};
      for (const c of G.citiesOf(s, 'p')) for (const [u, n] of Object.entries(c.units)) if (fights(u)) count[u] = (count[u] || 0) + n;
      for (const m of s.moves) if (m.owner === 'p') for (const [u, n] of Object.entries(m.units || {})) if (fights(u)) count[u] = (count[u] || 0) + n;
      const types = Object.keys(count).filter(u => count[u] >= 5).sort((a, b) => count[b] - count[a]);
      for (const c of G.citiesOf(s, 'p').filter(c => G.lvl(c, 'armory') > 0 && !c.forge)) {
        let done = false;
        for (const u of types.slice(0, 3)) {
          const kinds = G.upgradeLevel(s, 'p', u, 'a') <= G.upgradeLevel(s, 'p', u, 'd') ? ['a', 'd'] : ['d', 'a'];
          for (const k of kinds) {
            const st = G.forgeStatus(s, c.id, u, k);
            if (!st.ok || (st.cost.gold || 0) > goldFree(s, A) || !G.canAfford(s, c, st.cost, 1.5)) continue;
            if (G.startUpgrade(s, c.id, u, k) === null) { alog(s, 'military', `${c.name} forges ${DATA.units[u].name} ${k === 'a' ? 'weapons' : 'armour'} (level ${st.level})`); done = true; break; }
          }
          if (done) break;
        }
      }
    }
  };

  RUN.hero = (s, A) => {
    const P = A.d.hero, h = G.hero && G.hero(s);
    if (h && !h.dead && P.points && h.free > 0) {
      const want = HERO_BUILD[P.build] || HERO_BUILD.balanced;
      const spent = [];
      while (h.free > 0) {
        const total = Object.values(h.points).reduce((a, b) => a + b, 0) + 1;
        let best = 'str', bd = -1e9;
        for (const [k, w] of Object.entries(want)) { const d = w * total - (h.points[k] || 0); if (d > bd) { bd = d; best = k; } }
        if (G.heroAssign(s, best) !== null) break;
        spent.push(best);
      }
      if (spent.length) alog(s, 'hero', `${h.name} trained ${spent.map(k => (DATA.heroAttrs[k] || {}).name || k).join(', ')} (${P.build} build)`);
    }
    if (h && !h.dead && P.adventure && h.hp >= 75 && !G.heroMoving(s) && (A.advAt || 0) <= s.time && !G.autoThreats(s).length) {
      A.advAt = s.time + 120 * PT(s);
      const home = G.heroCity(s);
      if (home) {
        const escort = surplus(home, A.res.garrison, 0.25);
        const Pw = G.heroStats(s, 'p').atk * G.heroLeadership(s, 'p') + G.atkPower(s, 'p', escort) * 0.5;
        let best = null, bs = -1e9;
        for (const t of s.special) {
          if (!t.ruin || t.ruin.readyAt > s.time) continue;
          const d = dist(home, t);
          if (d > 8 || s.moves.some(m => m.x === t.x && m.y === t.y)) continue;
          const win = Pw / (Pw + 100 * Math.pow(t.ruin.tier, 1.8) * 0.6);
          if (win < AUTO.advWin) continue;
          const sc = t.ruin.tier * win - d * 0.15;
          if (sc > bs) { bs = sc; best = { t, win }; }
        }
        if (best && !G.sendArmy(s, home.id, best.t.x, best.t.y, 'adventure', { hero: 1, ...escort })) alog(s, 'hero', `${h.name} sets out for the ruins at (${best.t.x}, ${best.t.y}) (about ${Math.round(best.win * 100)}% to succeed)`);
      }
    }
    if (P.generals && G.generalsOf) {
      const cities = G.citiesOf(s, 'p'), hot = threatened(s);
      const hub = cities.slice().sort((a, b) => soldiersOf(b.units) - soldiersOf(a.units))[0];
      if (hub && soldiersOf(hub.units) > 0) for (const g of G.generalsOf(s, 'p')) {
        if (g.status !== 'home' || g.city === hub.id || hot.has(g.city)) continue;
        if (soldiersOf((s.cities[g.city] || {}).units) >= soldiersOf(hub.units) * 0.6) continue;
        if (G.stationGeneral(s, 'p', g.id, hub.id) === null) alog(s, 'hero', `General ${g.name} rides to the army at ${hub.name}`);
      }
    }
  };

  RUN.magi = (s, A) => {
    if (!A.d.magi.on || !G.magiCap) return;
    const cap = G.magiCap(s, 'p');
    if (!cap) return;
    const list = G.magiOf(s, 'p');
    if (list.length < cap) {
      const pool = G.magiPool(s, 'p');
      const best = pool.list.map((c, i) => ({ c, i })).sort((a, b) => b.c.rank - a.c.rank)
        .find(({ c }) => { const cost = G.magiRecruitCost(s, 'p', c.rank); return cost.gold <= +A.d.magi.budget && cost.gold <= goldFree(s, A) && cost.mana <= manaFree(s, A); });
      if (best && G.canRecruitMagus(s, 'p', best.i) === null) {
        const name = best.c.name;
        if (G.recruitMagus(s, 'p', best.i) === null) alog(s, 'magi', `Recruited ${name}, ${G.magusRankName(best.c).toLowerCase()} of ${DATA.schools[best.c.school].name}`);
      }
    }
    const towers = G.citiesOf(s, 'p').filter(c => G.lvl(c, 'magetower') > 0).sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'));
    for (const g of G.magiOf(s, 'p')) {
      if (g.status !== 'home' || g.station !== 'idle') continue;
      const courtless = towers.find(c => !G.courtMagusOf(s, c));
      if (courtless && G.stationMagus(s, 'p', g.id, 'court', courtless.id) === null) alog(s, 'magi', `${g.name} becomes court magus of ${courtless.name}`);
      else if (towers[0] && G.stationMagus(s, 'p', g.id, 'study', towers[0].id) === null) alog(s, 'magi', `${g.name} joins the Grimoire studies in ${towers[0].name}`);
    }
  };

  RUN.economy = (s, A) => {
    const P = A.d.economy;
    unstall(s, A);
    for (const c of G.citiesOf(s, 'p')) {
      if (A.known[c.id]) continue;
      A.known[c.id] = 1;
      if (P.govNew && G.setGovernor && !G.govOf(s, c.id)) {
        if (G.setGovernor(s, c.id, { focus: P.focus }) === null) { govReserve(s, A, c.id); if (A.d.military.garrison) garrisons(s, A); alog(s, 'economy', `A governor (${focusName(P.focus)}) takes over ${c.name}`); }
      }
    }
    if (P.market && s.logistics && s.logistics.p) { const L = s.logistics.p; if (!L.sell || !L.buy || L.reserve !== A.res.gold) G.setSupplyRealm(s, 'p', { sell: true, buy: true, reserve: A.res.gold }); }
  };

  // ---- settlement: new cities when renown allows ----
  const GOODS4 = ['grain', 'timber', 'stone', 'ore'];
  const gname = g => (DATA.goods[g] ? DATA.goods[g].name : g).toLowerCase();
  const atWarWith = (s, owner) => !!owner && owner !== 'p' && !!s.empires[owner] && !s.empires[owner].dead && G.rel(s, owner).status === 'war';
  // what threatens a spot within r tiles: brigands, monsters, a realm at war, a hostile column (a short phrase) or null
  const dangerNear = (s, p, r) => {
    for (const k of Object.values(s.camps || {})) if (G.unitsCount(k.units) > 0 && dist(k, p) <= r) return k.kind ? 'a monster lair' : 'brigands';
    if (G.monsterList) for (const mon of G.monsterList(s)) { const q = G.monsterPos ? G.monsterPos(s, mon) : mon; if (q && dist(q, p) <= r + 1) return 'monsters'; }
    for (const c of Object.values(s.cities)) if (atWarWith(s, c.owner) && dist(c, p) <= r + 2) return `the ${s.empires[c.owner].name}`;
    for (const m of s.moves) {
      if (m.owner === 'p' || !HOSTILE[m.type] || m.arrive <= s.time) continue;
      if (dist(m, p) <= r) return 'a hostile column';
      const q = G.movePos ? G.movePos(s, m) : null;
      if (q && dist(q, p) <= r) return 'a hostile column';
    }
    return null;
  };
  const settling = (s, c) => Object.values(c.train || {}).some(l => (l || []).some(q => q.unit === 'settlers' && q.left > 0));
  // the best safe site within reach of a city with settlers: { t, c, why, danger, value }
  const pickSite = (s, A, c) => {
    const emp = s.empires.p, R = AUTO.settleRange, pref = A.d.settle.prefer;
    const lack = G.realmLack(s, 'p');
    const RE = G.realmEcon ? safe(G.realmEcon, null)(s, 'p') : null;
    const short = {};
    for (const g of GOODS4) short[g] = RE && RE.goods && RE.goods[g] ? Math.max(0, RE.goods[g].short || 0) : 0;
    const others = [...Object.values(s.cities), ...Object.values(s.minors || {})];
    const wFit = pref === 'fit' ? 2 : 1, wGap = pref === 'fit' ? 0.4 : pref === 'near' ? 0.8 : 2, wDist = pref === 'near' ? 1 : 0.4;
    const cands = [];
    for (let y = Math.max(0, c.y - R); y <= Math.min(s.map - 1, c.y + R); y++) for (let x = Math.max(0, c.x - R); x <= Math.min(s.map - 1, c.x + R); x++) {
      const t = s.tiles[y * s.map + x];
      if (t.city || t.camp || t.oasis || t.ruin || t.quarter || t.minor || G.isWater(t) || DATA.terrain[t.terrain].impassable) continue;
      const d = dist(t, c);
      if (d < 3 || d > R) continue;
      if (others.some(o => o && o.x !== undefined && dist(o, t) < 2.8)) continue;
      const own = G.landOwner ? G.landOwner(s, x, y) : null;
      if (own && own !== 'p') continue;                       // another realm's land
      if (!G.landReachable(s, c, t)) continue;
      const site = G.siteYield(s, x, y);
      const fit = G.siteFit(site, emp.race);
      let gap = 0, best = null, bg = 0;
      // the goods the realm lacks pull toward land richer in them (relative: even in a poor region the better tile wins)
      for (const g of GOODS4) { const w = lack[g] + 1.5 * short[g], v = w * (site[g] - 1); gap += w * Math.max(-0.4, site[g] - 1); if (v > bg) { bg = v; best = g; } }
      const value = 2.4 * fit * wFit + 4 * gap * wGap + (site.deposits || []).length * 0.3 + (G.coastal(s, x, y) ? 0.3 : 0) - d * wDist;
      cands.push({ t, site, value, best, bg, fit });
    }
    cands.sort((a, b) => b.value - a.value);
    for (const k of cands.slice(0, 40)) {
      if (dangerNear(s, k.t, AUTO.settleSafe)) continue;       // never settle into danger
      const mid = { x: (c.x + k.t.x) / 2, y: (c.y + k.t.y) / 2 };
      const danger = dangerNear(s, k.t, AUTO.settleEscort) || dangerNear(s, mid, AUTO.settleEscort * 0.75);
      const bits = [];
      if (k.best && k.bg > 0.05) bits.push(`${G.stars(k.site[k.best])}★ ${gname(k.best)}, which the realm ${short[k.best] > 0.2 ? 'is short of' : 'lacks'}`);
      else if (k.fit > 0) bits.push(`good land for the ${DATA.races[emp.race].name}`);
      else bits.push('the best free land within reach');
      if ((k.site.deposits || []).length) bits.push(`${k.site.deposits.map(gname).join(' and ')} deposit${k.site.deposits.length > 1 ? 's' : ''}`);
      if (k.site.river) bits.push('by a river'); else if (k.site.lake) bits.push('on a lake');
      return { t: k.t, c, why: bits.join(', '), danger, value: k.value };
    }
    return null;
  };
  // where the settlers would start from: a city that has some, else the best city able to train them
  const settleSource = (s, A) => {
    const cities = G.citiesOf(s, 'p');
    const has = cities.filter(c => (c.units.settlers || 0) > 0);
    if (has.length) return { c: has[0], has: true };
    const req = (DATA.units.settlers || {}).req || 5;
    const able = cities.filter(c => G.lvl(c, 'townhall') >= req && !threatened(s).has(c.id)).sort((a, b) => b.pop - a.pop);
    return able.length ? { c: able[0], has: false } : null;
  };
  // a plan for the inbox (cached briefly) and for the stewards
  const PLAN_CACHE = new WeakMap();
  G.autoSettlePlan = (s, fresh) => {
    if (!G.canFoundCity(s, 'p')) return null;
    let settlers = 0;
    for (const c of G.citiesOf(s, 'p')) settlers += c.units.settlers || 0;
    const key = Math.floor(s.time / 20) + ':' + G.cityCount(s, 'p') + ':' + s.moves.length + ':' + settlers;
    const c0 = PLAN_CACHE.get(s);
    if (!fresh && c0 && c0.key === key) return c0.plan;
    const A = G.automation(s), src = settleSource(s, A);
    const site = src ? pickSite(s, A, src.c) : null;
    const plan = site ? { ...site, has: src.has } : null;
    PLAN_CACHE.set(s, { key, plan });
    return plan;
  };
  // buy what a city lacks for one cost at its market, above the gold reserve
  const buyFor = (s, A, c, cost) => buyRest(s, A, c, cost, 1, 'settle', 'the settlers', 1);
  // "Buy the rest" (G.shortfall in prices.js): buy what one cost still lacks at the city's market, above the gold
  // reserve and within a share of the spare gold; true when the cost is now affordable
  const buyRest = (s, A, c, cost, mult, d, what, share) => {
    if (G.canAfford(s, c, cost, mult)) return true;
    if (!G.shortfall) return false;
    const f = G.shortfall(s, c, cost, mult);
    if (!f.ok || f.gold > goldFree(s, A) * (share || 1)) return false;
    const emp = s.empires.p, gold0 = emp.gold;
    if (G.buyShortfall(s, c, cost, mult)) return false;
    alog(s, d, `Bought ${f.short.map(([g, n]) => n + ' ' + gname(g)).join(', ')} in ${c.name} for ${what} (${Math.round(gold0 - emp.gold)} gold)`);
    return G.canAfford(s, c, cost, mult);
  };
  G.autoBuyRest = (s, c, cost, mult, d, what) => { const A = G.automation(s); return !!A.d.economy.buyRest && buyRest(s, A, c, cost, mult || 1, d || 'economy', what || 'a stalled work', (+A.d.economy.buyCap || 25) / 100); };
  // stalled work the stewards unblock: the research queue's head waiting on goods
  const unstall = (s, A) => {
    if (!A.d.economy.buyRest) return;
    const share = (+A.d.economy.buyCap || 25) / 100;
    if (G.research && G.researchSlots) {
      const R = G.research(s, 'p'), sl = G.researchSlots(s, 'p');
      for (const id of (R.queue || []).slice(0, Math.max(0, sl.free))) {
        const t = DATA.techs[id]; if (!t) continue;
        const c = G.researchCityFor(s, 'p', id, null); if (!c) continue;
        const st = G.techStatus(s, c.id, id);
        if (!st.poor) continue;
        if (buyRest(s, A, c, st.cost, 1, 'research', `${t.icon} ${t.name}`, share) && G.startResearch(s, c.id, id) === null) {
          alog(s, 'research', `Started ${t.icon} ${t.name} in ${c.name} with goods bought at market`);
          return;
        }
      }
    }
  };
  const settleStep = (s, A) => {
    if (!G.canFoundCity(s, 'p')) return;
    const cities = G.citiesOf(s, 'p');
    const src = settleSource(s, A);
    if (!src) return;
    // settlers at hand: pick a site and send them
    if (src.has) {
      const plan = G.autoSettlePlan(s, true);
      if (!plan) { if ((A.settleWait || 0) <= s.time) { A.settleWait = s.time + 600 * PT(s); alog(s, 'settle', `Settlers wait in ${src.c.name}: no safe free land within reach`); } return; }
      const c = plan.c, units = { settlers: 1 };
      let escort = {};
      if (plan.danger) {
        escort = surplus(c, A.res.garrison, AUTO.escortShare);
        if (!G.unitsCount(escort)) { if ((A.settleWait || 0) <= s.time) { A.settleWait = s.time + 300 * PT(s); alog(s, 'settle', `Settlers wait in ${c.name}: ${plan.danger} near the site at (${plan.t.x}, ${plan.t.y}) and no soldiers to spare for an escort`); } return; }
        Object.assign(units, escort);
      }
      const err = G.sendArmy(s, c.id, plan.t.x, plan.t.y, 'settle', units);
      if (err) { PLAN_CACHE.delete(s); return; }
      PLAN_CACHE.delete(s);
      const n = G.unitsCount(escort);
      alog(s, 'settle', `Settlers set out from ${c.name} for (${plan.t.x}, ${plan.t.y}): ${plan.why}${n ? `; ${n} soldiers escort them (${plan.danger} nearby)` : ''}`);
      return;
    }
    // none yet: train them where the Town Hall allows, within the reserves
    if (cities.some(c => settling(s, c))) return;
    const c = src.c, st = G.trainStatus(s, c, 'settlers');
    if (!st.ok || !(st.byPop >= 1)) return;
    if ((st.cost.gold || 0) > goldFree(s, A)) return;
    if (!G.canAfford(s, c, st.cost) && !buyFor(s, A, c, st.cost)) {
      if ((A.settleWait || 0) <= s.time) { A.settleWait = s.time + 600 * PT(s); alog(s, 'settle', `Gathering goods for settlers in ${c.name} (renown allows city ${cities.length + 1})`); }
      return;
    }
    if (G.queueTrain(s, c.id, 'settlers', 1) === null) alog(s, 'settle', `Training settlers in ${c.name}: renown (${Math.round(G.renown(s, 'p'))}) allows city ${cities.length + 1}`);
  };
  RUN.settle = (s, A) => { if (A.d.settle.on) settleStep(s, A); };

  RUN.faith = (s, A) => {
    const P = A.d.faith, emp = s.empires.p;
    if (P.preach && emp.faithId && G.preachHere) {
      for (const c of G.citiesOf(s, 'p')) {
        const n = c.units.priest || 0;
        if (!n) continue;
        const share = (c.faiths || {})[emp.faithId] || 0;
        if (share >= 0.65) continue;
        if (G.preachHere(s, c.id, Math.min(n, 3)) === null) alog(s, 'faith', `Priests preached in ${c.name} (${Math.round(share * 100)}% of the faithful before)`);
      }
    }
    if (P.shrines && G.faithRate && (A.shrineAt || 0) <= s.time) {
      A.shrineAt = s.time + 180 * PT(s);
      const cities = G.citiesOf(s, 'p');
      if (G.faithRate(s, 'p') >= 1 + cities.length * 0.6) return;
      for (const c of cities) {
        if (G.govOf && G.govOf(s, c.id)) continue;               // the governor plans this city
        if (c.buildQueue.length >= G.buildSlots(c) || c.buildQueue.some(q => q.type === 'shrine' || q.type === 'temple')) continue;
        if (G.lvl(c, 'shrine') >= Math.min(4, G.lvl(c, 'townhall'))) continue;
        const st = G.buildStatus(s, c, 'shrine');
        if (!st.ok || ((st.cost || {}).gold || 0) > goldFree(s, A)) continue;
        G.queueBuild(s, c.id, 'shrine');
        if (c.buildQueue.some(q => q.type === 'shrine')) { alog(s, 'faith', `Queued a Shrine in ${c.name} (faith runs thin)`); break; }
      }
    }
  };

  // ---- minor decisions with a temperament ----
  const EV_PROTECT = { wells: 1, heal: 1, firewood: 1, placate: 1 };
  const EV_GROW = { buy: 1, hold: 1, feast: 1, accept: 1 };
  const choiceCost = (s, p, key) => {
    const d = p.data || {}, c = d.city && s.cities[d.city];
    if (p.kind === 'event') return key === 'accept' ? { grain: 200, city: c } : (['wells', 'heal', 'buy', 'hold'].includes(key) ? { gold: d.gold || 0 } : {});
    if (p.kind === 'season') return key === 'feast' ? { grain: d.grain, city: c } : key === 'firewood' ? { timber: d.timber, city: c } : {};
    if (p.kind === 'unrest') return key === 'placate' ? { gold: d.gold || 0 } : {};
    return {};
  };
  const affords = (s, A, cost, k = 1) => {
    if ((cost.gold || 0) * k > goldFree(s, A)) return false;
    for (const g of ['grain', 'timber']) if (cost[g] && (!cost.city || (cost.city.res[g] || 0) < cost[g] * k)) return false;
    return true;
  };
  G.autoChoose = (s, p, temper) => {
    const A = G.automation(s);
    temper = temper || A.d.events.temper;
    if (!MINOR[p.kind]) return null;
    if (p.kind === 'storylet') {
      const card = G.story && G.story.card ? G.story.card(s, p) : null;
      if (!card) return p.def;
      const ok = card.choices.filter(c => !c.need && !c.lack && (c.cost.gold || 0) <= goldFree(s, A) && (c.cost.mana || 0) <= manaFree(s, A));
      if (!ok.length) return p.def;
      const price = c => Object.entries(c.cost).reduce((a, [g, n]) => a + n * (g === 'gold' ? 1 : (DATA.goods[g] || {}).value || 1), 0);
      if (temper === 'cautious') return ok.filter(c => c.chance === null).sort((a, b) => price(a) - price(b))[0]?.key || p.def;
      if (temper === 'bold') return ok.filter(c => c.chance !== null && c.chance >= 0.35).sort((a, b) => a.chance - b.chance)[0]?.key || ok.sort((a, b) => price(b) - price(a))[0].key;
      // balanced: a sure thing or a good bet that is not the default shrug, else the default
      return ok.find(c => c.key !== p.def && (c.chance === null || c.chance >= 0.6))?.key || (ok.some(c => c.key === p.def) ? p.def : ok[0].key);
    }
    const keys = p.options.map(o => o.key);
    const prot = keys.find(k => EV_PROTECT[k]), grow = keys.find(k => EV_GROW[k]);
    if (prot) {
      const cost = choiceCost(s, p, prot);
      const want = temper === 'bold' ? affords(s, A, cost, 4) : affords(s, A, cost, temper === 'cautious' ? 1 : 1.2);
      return want ? prot : p.def;
    }
    if (grow) {
      if (temper === 'cautious') return p.def;
      const cost = choiceCost(s, p, grow);
      return affords(s, A, cost, temper === 'bold' ? 1 : 2) ? grow : p.def;
    }
    return p.def;
  };
  RUN.events = (s, A) => {
    const P = A.d.events;
    const ids = new Set();
    for (const p of (s.pending || []).slice()) {
      ids.add(p.id);
      if (A.seen[p.id] === undefined) A.seen[p.id] = Math.round(s.time);
      if (!P.on || !MINOR[p.kind] || IMPORTANT[p.kind]) continue;
      if (s.time - A.seen[p.id] < (+P.grace || 90) * PT(s)) continue;
      const key = G.autoChoose(s, p);
      if (!key) continue;
      const label = (p.options.find(o => o.key === key) || {}).label || key;
      let err = G.resolvePending(s, p.id, key);
      if (err && key !== p.def) err = G.resolvePending(s, p.id, p.def);
      if (!err) alog(s, 'events', `${p.title}: “${label}” (${P.temper})`);
    }
    for (const id of Object.keys(A.seen)) if (!ids.has(id)) delete A.seen[id];
  };

  // -------------------------------------------------------------------
  // The tick: staggered, one domain or two per slow tick
  // -------------------------------------------------------------------
  G.autoRun = (s, d) => { const A = G.automation(s); if (!RUN[d] || !s.empires.p || s.empires.p.dead) return; safe(RUN[d])(s, A); };
  G.autoTick = s => {
    if (!s.automation || s.gameOver || !s.empires.p || s.empires.p.dead || !G.cityCount(s, 'p')) return;
    const A = G.automation(s);
    let ran = 0;
    for (let i = 0; i < ORDER.length && ran < 2; i++) {
      const d = ORDER[(A.rr = ((A.rr || 0) + 1) % ORDER.length)];
      if ((A.next[d] || 0) > s.time) continue;
      A.next[d] = s.time + DOMAINS[d].every * PT(s);
      if (d !== 'events' && d !== 'economy' && !G.autoDomainOn(s, d)) continue;
      safe(RUN[d])(s, A);
      ran++;
    }
  };
  let cliDone = false;
  G.slowHooks.push(s => { if (!cliDone && G.cli) cliDone = G.autoRegisterCli(); G.autoTick(s); });
  G.newGameHooks.push((s, opts) => { if (opts && opts.automation && PRESETS[opts.automation]) G.autoPreset(s, opts.automation); });

  // -------------------------------------------------------------------
  // Decisions inbox: only what needs the player
  //   item = { id, kind, icon, text, prio, act: { label, key } | null, jump: { tab, city?, x?, y? } | null, pending? }
  // -------------------------------------------------------------------
  const KIND_TAB = { offer: 'diplomacy', war: 'diplomacy', succession: 'dynasty', crisis: 'diplomacy' };
  G.autoInbox = s => {
    if (!s || !s.empires || !s.empires.p) return [];
    const A = G.automation(s), out = [];
    const emp = s.empires.p;
    // war threats and declarations
    for (const T of G.autoThreats(s)) {
      const c = targetCity(s, T);
      const who = s.empires[T.owner] ? `The ${s.empires[T.owner].name}` : 'Raiders';
      out.push({ id: 'threat:' + T.id, kind: 'threat', icon: '⚔️', prio: 90, text: `${who} march on ${c ? c.name : 'your lands'} (${G.missionName ? G.missionName(T.type) : T.type}), arriving in ${Math.max(0, Math.round((T.arrive - s.time) / 60))} min`, jump: { tab: 'moves' } });
    }
    for (const e of Object.values(s.empires)) {
      if (e.id === 'p' || e.dead || !s.rel || !s.rel[e.id]) continue;
      const r = s.rel[e.id];
      if (r.status === 'war' && (r.since || 0) > s.time - 600 * PT(s)) out.push({ id: 'war:' + e.id, kind: 'war', icon: '🔥', prio: 85, text: `At war with the ${e.name}`, jump: { tab: 'diplomacy' } });
    }
    // battles you could intercept
    for (const o of G.autoInterceptOptions(s)) {
      if (o.ratio < 1.15) continue;
      out.push({ id: 'icept:' + o.T.id, kind: 'intercept', icon: '🛡️', prio: 80, text: `${o.city.name} could meet the column bound for ${o.target ? o.target.name : 'your lands'} at ${o.at} (odds ${o.ratio.toFixed(1)}:1)`, act: { label: 'Intercept' }, jump: { tab: 'moves' } });
    }
    // decisions waiting (important ones first)
    for (const p of s.pending || []) {
      const imp = IMPORTANT[p.kind];
      if (p.kind === 'ceremony' && A.d.traditions.cer) continue;
      if (!imp && MINOR[p.kind] && A.d.events.on) continue;             // the stewards will answer it
      out.push({ id: 'pend:' + p.id, kind: imp || 'decision', icon: imp === 'succession' ? '👑' : imp === 'war' ? '⚔️' : imp === 'crisis' ? '☄️' : imp ? '🤝' : '📜', prio: imp === 'succession' || imp === 'crisis' || imp === 'war' ? 88 : imp ? 70 : 50,
        text: p.title, pending: p, act: imp ? null : { label: 'Let the stewards decide' }, jump: { tab: KIND_TAB[imp] || (p.kind === 'storylet' ? 'tales' : 'city') } });
    }
    const offers = (s.offers || []).filter(o => o.expires > s.time && s.empires[o.ai]);
    if (offers.length) out.push({ id: 'offers', kind: 'offer', icon: '🐪', prio: 40, text: offers.length === 1 ? `A merchant offer from the ${s.empires[offers[0].ai].name}` : `${offers.length} merchant offers (${[...new Set(offers.map(o => s.empires[o.ai].name))].join(', ')})`, jump: { tab: 'diplomacy' } });
    // idle cities without a governor
    for (const c of G.citiesOf(s, 'p')) {
      if (G.govOf && G.govOf(s, c.id)) continue;
      if (c.buildQueue.length) continue;
      out.push({ id: 'idle:' + c.id, kind: 'idle', icon: '🏗️', prio: 45, text: `${c.name} builds nothing and has no governor`, act: { label: 'Appoint governor' }, jump: { tab: 'city', city: c.id } });
    }
    // a new city's site, when the stewards do not settle
    if (!A.d.settle.on) {
      const p = G.autoSettlePlan(s);
      if (p) out.push({ id: 'settle', kind: 'settle', icon: '🏕️', prio: 48, text: `A site is ready for a new city: (${p.t.x}, ${p.t.y}) near ${p.c.name}, ${p.why}${p.danger ? ` (${p.danger} nearby: send an escort)` : ''}`,
        act: { label: p.has ? 'Send settlers' : 'Train settlers' }, jump: { tab: 'world', x: p.t.x, y: p.t.y } });
    }
    // research
    if (G.research && !A.d.research.on) {
      const R = G.research(s, 'p'), sl = G.researchSlots(s, 'p');
      if (sl.total > 0 && sl.free > 0 && !(R.queue || []).length) out.push({ id: 'research', kind: 'research', icon: '📚', prio: 55, text: `${sl.free} study slot${sl.free > 1 ? 's' : ''} idle and the research queue is empty`, act: { label: 'Queue recommended' }, jump: { tab: 'research' } });
    }
    // hero points
    const h = G.hero && G.hero(s);
    if (h && !h.dead && h.free > 0 && !A.d.hero.points) out.push({ id: 'hero', kind: 'hero', icon: '🦸', prio: 35, text: `${h.name} has ${h.free} attribute point${h.free > 1 ? 's' : ''} to spend`, act: { label: `Spend (${A.d.hero.build})` }, jump: { tab: 'hero' } });
    // tradition forks the stewards wait on
    if (A.d.traditions.on && A.d.traditions.forks !== 'auto') for (const [a, b] of G.autoForks(s)) {
      const ta = DATA.traditions[a], tb = DATA.traditions[b];
      out.push({ id: 'fork:' + a, kind: 'fork', icon: '🎭', prio: 30, text: `A fork in your traditions: ${ta.icon} ${ta.name} or ${tb.icon} ${tb.name}`, fork: [a, b], forkOf: 'traditions', jump: { tab: 'culture' } });
    }
    // Grimoire forks the stewards wait on
    if (A.d.grimoire.on && A.d.grimoire.forks !== 'auto') for (const [a, b] of G.autoArcForks(s)) {
      const na = DATA.arcana[a], nb = DATA.arcana[b];
      out.push({ id: 'afork:' + a, kind: 'afork', icon: '📖', prio: 30, text: `A fork in the Grimoire: ${na.icon || '📖'} ${na.name} or ${nb.icon || '📖'} ${nb.name}`, fork: [a, b], forkOf: 'arcana', jump: { tab: 'magic' } });
    }
    return out.sort((a, b) => b.prio - a.prio);
  };
  G.autoInboxCount = s => G.autoInbox(s).length;
  // one-click resolve (key: the pending option, or a fork side)
  G.autoInboxDo = (s, id, key) => {
    const A = G.automation(s);
    const it = G.autoInbox(s).find(x => x.id === id);
    if (!it) return 'That has passed';
    if (it.pending) {
      if (key) return G.resolvePending(s, it.pending.id, key);
      if (IMPORTANT[it.pending.kind] || !MINOR[it.pending.kind]) return 'This one is yours to decide';
      const k = G.autoChoose(s, it.pending) || it.pending.def;
      const label = (it.pending.options.find(o => o.key === k) || {}).label || k;
      const err = G.resolvePending(s, it.pending.id, k);
      if (!err) alog(s, 'events', `${it.pending.title}: “${label}” (at your word)`);
      return err;
    }
    switch (it.kind) {
      case 'intercept': {
        const o = G.autoInterceptOptions(s, true).find(x => 'icept:' + x.T.id === id);
        if (!o) return 'No longer possible';
        const err = G.sendIntercept(s, o.city.id, o.T.id, o.units, null);
        if (!err) { IC_CACHE.delete(s); alog(s, 'military', `Intercepting from ${o.city.name} at ${o.at} (at your word)`); }
        return err;
      }
      case 'idle': { const cid = id.slice(5); const err = G.setGovernor(s, cid, { focus: A.d.economy.focus }); if (!err) { govReserve(s, A, cid); alog(s, 'economy', `A governor (${focusName(A.d.economy.focus)}) takes over ${s.cities[cid].name} (at your word)`); } return err; }
      case 'research': {
        const id2 = G.techRecommend(s, 'p', 1)[0];
        if (!id2) return 'Nothing to study now';
        const err = G.planResearch(s, 'p', null, id2);
        if (!err) alog(s, 'research', `Queued ${DATA.techs[id2].icon} ${DATA.techs[id2].name} (recommended, at your word)`);
        return err;
      }
      case 'hero': safe(RUN.hero)(s, { ...A, d: { ...A.d, hero: { ...A.d.hero, points: true, adventure: false, generals: false } } }); return null;
      case 'fork': return key ? (it.fork.includes(key) ? G.autoForkPref(s, key) : `Choose ${it.fork.join(' or ')}`) : 'Choose a side';
      case 'afork': return key ? (it.fork.includes(key) ? G.autoArcForkPref(s, key) : `Choose ${it.fork.join(' or ')}`) : 'Choose a side';
      case 'settle': {
        const before = A.log.length;
        settleStep(s, A);
        if (A.log.length > before && /^(Settlers set out|Training settlers)/.test(A.log[0].text)) { A.log[0].text += ' (at your word)'; return null; }
        return A.log.length > before ? A.log[0].text : 'Not possible right now';
      }
    }
    return 'Open it to decide';
  };

  // -------------------------------------------------------------------
  // Keyboard console commands (registered into G.cli.commands once it exists)
  // -------------------------------------------------------------------
  const cliCmds = () => [
    { name: 'auto', aliases: ['automation'], group: 'Game', usage: 'auto [domain|preset|reserve] [on|off|<policy> <value>]', help: 'Automation: list, switch a domain on/off, set a policy, a preset or a reserve.',
      ex: ['auto', 'auto research on', 'auto research focus economy', 'auto preset delegate', 'auto reserve gold 500', 'auto military defend act'], tab: 'automation',
      run(s, owner, a) {
        const A = G.automation(s), t = (a.tokens || []).map(x => x.toLowerCase());
        const status = () => [`Automation: ${(PRESETS[A.preset] || { name: 'Custom' }).name}. Reserves: ${A.res.gold} gold, ${A.res.mana} mana, ${A.res.garrison} soldiers per city.`,
          ...ORDER.map(d => `  ${d.padEnd(11)} ${G.autoDomainOn(s, d) ? 'on ' : 'off'}  ${Object.entries(DOMAINS[d].sw).map(([k]) => `${k}:${A.d[d][k] ? 'on' : 'off'}`).join(' ')}${DOMAINS[d].pol.map(([k]) => ` ${k}=${A.d[d][k]}`).join('')}`)];
        if (!t.length) return { out: status(), nav: { tab: 'automation' } };
        if (t[0] === 'preset') { const k = Object.keys(PRESETS).find(p => p.toLowerCase() === (t[1] || '').replace(/[-\s]/g, '').toLowerCase() || PRESETS[p].name.toLowerCase().replace(/[-\s]/g, '') === (t[1] || '').replace(/[-\s]/g, '')); if (!k) return { ok: false, err: 'Presets: handson, assisted, delegate' }; G.autoPreset(s, k); return [`Preset: ${PRESETS[k].name}.`]; }
        if (t[0] === 'reserve') { const e = G.autoReserve(s, t[1], t[2]); return e ? { ok: false, err: e + ' (gold, mana, garrison)' } : [`Reserve ${t[1]}: ${A.res[t[1]]}.`]; }
        const d = ORDER.find(x => x === t[0] || x.startsWith(t[0]));
        if (!d) return { ok: false, err: `Domains: ${ORDER.join(', ')}` };
        if (t.length === 1) return status().filter((l, i) => i === 0 || l.trim().startsWith(d));
        if (t[1] === 'on' || t[1] === 'off') { const e = G.autoDomain(s, d, t[1] === 'on'); return e ? { ok: false, err: e } : [`${DOMAINS[d].name}: ${t[1]}.`]; }
        const k = Object.keys(DOMAINS[d].sw).find(x => x.toLowerCase() === t[1]) || (DOMAINS[d].pol.find(p => p[0].toLowerCase() === t[1]) || [])[0];
        if (!k) return { ok: false, err: `${DOMAINS[d].name}: ${[...Object.keys(DOMAINS[d].sw), ...DOMAINS[d].pol.map(p => p[0])].join(', ')}` };
        const e = G.autoSet(s, d, k, t[2] === undefined ? 'on' : t[2]);
        return e ? { ok: false, err: e } : [`${DOMAINS[d].name} · ${k}: ${A.d[d][k]}.`];
      } },
    { name: 'inbox', aliases: ['todo', 'decisions'], group: 'Game', usage: 'inbox [resolve] [n] [option]', help: 'What needs you: list it, or resolve item n (with a decision option key).', tab: 'automation',
      ex: ['inbox', 'inbox resolve 1', 'inbox 2 hold'],
      run(s, owner, a) {
        const items = G.autoInbox(s), t = (a.tokens || []).filter((x, i) => !(i === 0 && /^(resolve|do|r)$/i.test(x)));
        if (!t.length) return { out: items.length ? items.map((it, i) => `${String(i + 1).padStart(2)}. ${it.icon} ${it.text}${it.act ? `  [inbox resolve ${i + 1}: ${it.act.label}]` : it.fork ? `  [inbox resolve ${i + 1} <${it.fork.join('|')}>]` : it.pending ? `  [inbox resolve ${i + 1} <${it.pending.options.map(o => o.key).join('|')}>]` : ''}`) : ['Nothing needs you. The realm runs smoothly.'], nav: { tab: 'automation' } };
        const it = items[(+t[0] || 0) - 1];
        if (!it) return { ok: false, err: `No item ${t[0]} (1-${items.length})` };
        const e = G.autoInboxDo(s, it.id, t[1]);
        return e ? (it.jump ? { ok: false, err: e, nav: it.jump.city ? { city: it.jump.city, tab: it.jump.tab } : { tab: it.jump.tab } } : { ok: false, err: e }) : [`Done: ${it.text}.`];
      } },
  ];
  G.autoRegisterCli = () => {
    if (!G.cli || !Array.isArray(G.cli.commands)) return false;
    for (const c of cliCmds()) if (!G.cli.commands.some(x => x.name === c.name)) G.cli.commands.push(c);
    return true;
  };
  G.autoRegisterCli();
})();
