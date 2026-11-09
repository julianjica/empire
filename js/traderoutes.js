// =====================================================================
//  Trade routes: standing agreements that send caravans over and over.
//  s.routes = [{ id, owner, from, to: { kind: 'city', id, owner }, goods: { give, take },
//                every (game-sec), nextAt, active, foreign, escort, trips, income, lost, note }]
//  A route may also run to a free city (js/minors.js): to = { kind: 'minor', id, owner: null, name },
//  foreign false. Its caravans are gifts: each trip raises the owner's influence there and pays gold
//  (merchant republics also pay for the goods), and the escort comes home on an empty back leg.
//  s.aiRoutes = [{ id, a, b, ca, cb, since, income }]   abstract AI-to-AI trade (gold only)
//  Caravans are real moves: type 'trade' with m.route = routeId and m.leg = 'out' | 'back',
//  so the world map draws them as carts and brigands or hostile armies can ambush them.
// =====================================================================
'use strict';

(() => {
  // -------------------------------------------------------------------
  // Tuning
  // -------------------------------------------------------------------
  const T = G.TRADE = {
    spd: 8,                          // caravan speed (same as a market caravan)
    intervals: [5, 10, 20, 30],      // departure intervals offered, in minutes (x pace time)
    defaultEvery: 10,
    perMarket: 4,                    // route slots per city: 1 + floor(market level / 4)
    // gold per completed foreign trip, paid to BOTH realms: (lin*d + sq*d^2) * (1 + mk*min market) * pace prod
    incomeLin: 2, incomeSq: 0.12, incomeMarket: 0.04,
    // exchange rate for foreign routes: value(give)/value(take) * factor
    rateBase: 0.7, rateSpecialty: 0.15, rateOpinion: 1 / 250, rateMarket: 0.012, rateMin: 0.5, rateMax: 1.2,
    minOpinion: 0,                   // foreign partners must like you at least this much
    opinionEvery: 2,                 // +1 opinion every N completed trips
    goodwillPer: 8, goodwillMax: 24, // opinion held up above the treaty baseline per active route
    breakPenalty: 8, declinePenalty: 2,
    // interception
    campRadius: 1.5,
    campRate: 0.18,                  // ambushes per minute spent in range, per camp tier
    armyRate: 0.6,                   // per hostile army in range
    party: 0.4,                      // share of a camp's brigands that ride out
    lossBare: [0.35, 0.65],          // cargo lost with no escort
    lossHeld: 0.1, lossBroken: 0.4,  // with an escort that holds / breaks
    // AI
    propose: 30,                     // mean minutes between route proposals from a friendly realm
    proposeOpinion: 5, maxWithPlayer: 2,
    aiOpen: 45,                      // mean minutes before two AI realms not at war open a route
    aiIncome: 0.5,                   // abstract AI-AI routes pay this share of a 10-minute trip's income per 10 minutes
    aiAvert: 0.4,                    // chance a fresh AI-AI war is talked down when they trade
    hostilityCut: 0.15, hostilityFloor: 0.55, aiHostility: 0.7,
    // routes to free cities: gold per trip = foreign-route formula (the free city's market counts as 2 + size) x this
    minorIncome: 0.5, minorMerchant: 1.5,
    minorGoodsPay: 0.5,              // merchant republics also pay this share of the goods' value, as for a hand-sent caravan
    minorInf: 0.6,                   // a standing route's goods count for this share of a hand-sent caravan's influence
    aiMinorLoad: 0.08, aiMinorMax: 500,   // AI caravans to free cities: share of storage, capped
    aiMinorRange: 10, aiMinorEvery: 2,
  };
  const SPECIALTY = { hearth: ['grain', 'timber', 'bread'], delver: ['ore', 'iron', 'stone', 'tools', 'runesteel'], sylvan: ['timber', 'grain', 'heartwood'], ash: ['weapons', 'ore', 'stone'] };
  G.TRADE_SPECIALTY = SPECIALTY;
  const STATUS_BASE = { war: -25, neutral: 0, peace: 15, alliance: 35 };
  const NO_ESCORT = { hero: 1, settlers: 1, herald: 1 };

  const routes = s => s.routes || (s.routes = []);
  const aiRoutes = s => s.aiRoutes || (s.aiRoutes = []);
  const sum = o => Object.values(o || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const paceT = s => G.pace(s).time;
  const goodsText = o => Object.entries(o || {}).filter(([, n]) => n > 0).map(([g, n]) => `${Math.floor(n)} ${g === 'gold' ? 'gold' : DATA.goods[g].name.toLowerCase()}`).join(', ') || 'nothing';
  const shiftOp = (s, id, d) => { const r = G.rel(s, id); r.opinion = G.clamp(r.opinion + d, -100, 100); };
  const seen = (s, ...cs) => cs.some(c => c && s.explored[c.y * s.map + c.x]);

  // where a route goes: a city, or a free city for kind 'minor'
  const isMinor = r => !!(r && r.to && r.to.kind === 'minor');
  const minorOf = (s, r) => (isMinor(r) && s.minors && s.minors[r.to.id]) || null;
  const destOf = (s, r) => (isMinor(r) ? minorOf(s, r) : s.cities[r.to.id]) || null;
  const destName = (s, r) => { const d = destOf(s, r); return d ? d.name : (r.to.name || '?'); };
  const valueOf = goods => Object.entries(goods || {}).reduce((a, [g, v]) => a + (DATA.goods[g] && v > 0 ? DATA.goods[g].value * v : 0), 0);
  G.routeIsMinor = isMinor;
  G.routeDest = (s, r) => destOf(s, r);

  G.routes = s => routes(s);
  G.aiRoutes = s => aiRoutes(s);
  G.routeById = (s, id) => routes(s).find(r => r.id === id);
  G.routeSlots = (s, city) => G.lvl(city, 'market') >= 1 ? 1 + Math.floor(G.lvl(city, 'market') / T.perMarket) : 0;
  G.routesFrom = (s, cityId) => routes(s).filter(r => r.from === cityId);
  G.routesWith = (s, owner, partner) => routes(s).filter(r => r.foreign && r.owner === owner && r.to.owner === partner);
  G.routeInFlight = (s, id) => s.moves.filter(m => m.route === id);
  G.routeEvery = (s, minutes) => Math.round(minutes * 60 * paceT(s));

  // -------------------------------------------------------------------
  // Terms
  // -------------------------------------------------------------------
  G.routeIncome = (s, a, b) => {
    const d = G.dist(a, b);
    const L = Math.min(G.lvl(a, 'market'), G.lvl(b, 'market'));
    return Math.round((T.incomeLin * d + T.incomeSq * d * d) * (1 + T.incomeMarket * L) * G.pace(s).prod);
  };
  G.tradeFactor = (s, from, to, take) => {
    const partner = s.empires[to.owner];
    const spec = SPECIALTY[partner.race].includes(take) ? T.rateSpecialty : 0;
    const op = from.owner === 'p' ? G.rel(s, to.owner).opinion : to.owner === 'p' ? G.rel(s, from.owner).opinion : 0;
    const f = T.rateBase + spec + op * T.rateOpinion + T.rateMarket * (G.lvl(from, 'market') + G.lvl(to, 'market'));
    return G.clamp(f, T.rateMin, T.rateMax);
  };
  // what a foreign city sends back for n of `give`
  G.routeQuote = (s, from, to, give, n, take) => {
    const factor = G.tradeFactor(s, from, to, take);
    const amount = Math.floor(n * DATA.goods[give].value / DATA.goods[take].value * factor);
    return { take: amount, factor, income: G.routeIncome(s, from, to) };
  };
  // goods a partner realm will put on a route: raw goods, iron and its specialties the player can use
  G.routeTakeGoods = (s, owner, partner) => {
    const race = s.empires[owner].race;
    const list = ['grain', 'timber', 'stone', 'ore', 'iron', ...SPECIALTY[s.empires[partner].race]];
    return [...new Set(list)].filter(g => !DATA.goods[g].race || DATA.goods[g].race === race);
  };
  G.tradePartnerError = (s, owner, partner) => {
    const e = s.empires[partner];
    if (!e || partner === owner) return 'Not a foreign realm';
    if (e.dead) return 'That realm has fallen';
    if (owner === 'p' || partner === 'p') {
      const r = G.rel(s, owner === 'p' ? partner : owner);
      if (r.status === 'war') return 'You are at war';
      if (r.opinion < T.minOpinion) return `They distrust you (opinion ${Math.round(r.opinion)})`;
    } else if (G.aiRel(s, owner, partner).status === 'war') return 'They are at war';
    return null;
  };
  // ---- free cities ----
  G.minorRouteError = (s, owner, mi) => {
    if (!mi || !s.minors || s.minors[mi.id] !== mi) return 'No such free city';
    if (!s.empires[owner] || s.empires[owner].dead) return 'Your realm has fallen';
    if (mi.subject) return mi.subject === owner ? `${mi.name} already pays you tribute` : `${mi.name} pays tribute to the ${s.empires[mi.subject].name}`;
    if (owner === 'p' && !s.explored[mi.y * s.map + mi.x]) return 'You have not found this city yet';
    return null;
  };
  G.minorRouteTargets = (s, owner) => (G.minorsList ? G.minorsList(s) : []).filter(mi => !G.minorRouteError(s, owner, mi));
  G.minorRouteIncome = (s, from, mi) => {
    const d = G.dist(from, mi);
    const L = Math.min(G.lvl(from, 'market'), 2 + (mi.size || 1));
    const k = mi.kind === 'merchant' ? T.minorMerchant : T.minorIncome;
    return Math.round((T.incomeLin * d + T.incomeSq * d * d) * (1 + T.incomeMarket * L) * G.pace(s).prod * k);
  };
  // what one trip would bring: influence now (it shrinks as influence grows) and gold
  G.minorRouteQuote = (s, from, mi, give) => {
    const value = valueOf(give), MI = G.MINORS;
    const inf = MI && G.minorGiftPreview ? G.minorGiftPreview(s, mi, from.owner, value * MI.caravanBonus * T.minorInf) : 0;
    const goodsPay = mi.kind === 'merchant' ? Math.round(value * T.minorGoodsPay) : 0;
    return { inf, gold: G.minorRouteIncome(s, from, mi) + goodsPay, goodsPay, value };
  };

  // foreign cities a realm may open a route to (the player only sees cities it has explored)
  G.routeTargets = (s, owner) => Object.values(s.cities).filter(c => c.owner !== owner && !G.tradePartnerError(s, owner, c.owner)
    && G.lvl(c, 'market') >= 1 && (owner !== 'p' || s.explored[c.y * s.map + c.x]));

  // -------------------------------------------------------------------
  // Create / cancel / pause / escort
  // opts: { give: {good: n}, takeGood, take (fixed amount, for AI proposals), every (minutes), escort }
  // returns the route, or an error string
  // -------------------------------------------------------------------
  G.createRoute = (s, owner, fromId, toId, opts = {}) => {
    const mi = !s.cities[toId] && s.minors ? s.minors[toId] : null;
    if (mi) return createMinorRoute(s, owner, fromId, mi, opts);
    const from = s.cities[fromId], to = s.cities[toId];
    if (!from || from.owner !== owner) return 'Not your city';
    if (!to) return 'No such city';
    if (to.id === from.id) return 'Choose another city';
    if (G.lvl(from, 'market') < 1) return `Build a Market in ${from.name} first`;
    if (G.routesFrom(s, fromId).length >= G.routeSlots(s, from)) return `${from.name} can run only ${G.routeSlots(s, from)} route${G.routeSlots(s, from) > 1 ? 's' : ''} (more every ${T.perMarket} market levels)`;
    const give = {};
    for (const [g, n] of Object.entries(opts.give || {})) if (DATA.goods[g] && Math.floor(n) > 0) give[g] = Math.floor(n);
    const total = sum(give);
    if (!total) return 'Choose goods and an amount';
    if (total > G.caravanCap(s, from)) return `A caravan from ${from.name} carries at most ${G.caravanCap(s, from)}`;
    const foreign = to.owner !== owner;
    const goods = { give, take: {} };
    if (foreign) {
      const err = G.tradePartnerError(s, owner, to.owner);
      if (err) return err;
      if (G.lvl(to, 'market') < 1) return `${to.name} has no Market`;
      if (Object.keys(give).length !== 1) return 'A foreign route trades one good';
      const g = Object.keys(give)[0], tg = opts.takeGood;
      if (!tg || !G.routeTakeGoods(s, owner, to.owner).includes(tg)) return 'Choose a good to receive';
      if (tg === g) return 'Choose a different good to receive';
      const amount = opts.take > 0 ? Math.floor(opts.take) : G.routeQuote(s, from, to, g, give[g], tg).take;
      if (amount < 1) return 'Too little to trade';
      goods.take[tg] = amount;
    }
    const minutes = Math.max(3, +opts.every || T.defaultEvery);
    const r = {
      id: G.newId(s, 'tr'), owner, from: fromId, to: { kind: 'city', id: toId, owner: to.owner }, goods,
      every: G.routeEvery(s, minutes), nextAt: s.time, active: true, foreign,
      escort: {}, trips: 0, income: 0, lost: 0, created: s.time, note: '',
    };
    routes(s).push(r);
    if (opts.escort) G.setEscort(s, r.id, opts.escort);
    if (owner === 'p') G.log(s, 'p', `🐪 Trade route opened: ${from.name} → ${to.name}${foreign ? ` (${s.empires[to.owner].name})` : ''}.`, 'good');
    return r;
  };
  const createMinorRoute = (s, owner, fromId, mi, opts) => {
    const from = s.cities[fromId];
    if (!from || from.owner !== owner) return 'Not your city';
    const err = G.minorRouteError(s, owner, mi);
    if (err) return err;
    if (G.lvl(from, 'market') < 1) return `Build a Market in ${from.name} first`;
    if (G.routesFrom(s, fromId).length >= G.routeSlots(s, from)) return `${from.name} can run only ${G.routeSlots(s, from)} route${G.routeSlots(s, from) > 1 ? 's' : ''} (more every ${T.perMarket} market levels)`;
    const give = {};
    for (const [g, n] of Object.entries(opts.give || {})) if (DATA.goods[g] && Math.floor(n) > 0) give[g] = Math.floor(n);
    const total = sum(give);
    if (!total) return 'Choose goods and an amount';
    if (total > G.caravanCap(s, from)) return `A caravan from ${from.name} carries at most ${G.caravanCap(s, from)}`;
    const minutes = Math.max(3, +opts.every || T.defaultEvery);
    const r = {
      id: G.newId(s, 'tr'), owner, from: fromId, to: { kind: 'minor', id: mi.id, owner: null, name: mi.name }, goods: { give, take: {} },
      every: G.routeEvery(s, minutes), nextAt: s.time, active: true, foreign: false,
      escort: {}, trips: 0, income: 0, influence: 0, lost: 0, created: s.time, note: '',
    };
    routes(s).push(r);
    if (opts.escort) G.setEscort(s, r.id, opts.escort);
    if (owner === 'p') G.log(s, 'p', `🐪 Trade route opened: ${from.name} → 🏰 ${mi.name}.`, 'good');
    return r;
  };
  // why: text for the log; voluntary: the owner broke it (foreign partners resent that)
  G.cancelRoute = (s, id, why, voluntary) => {
    const r = G.routeById(s, id);
    if (!r) return 'No such route';
    s.routes = routes(s).filter(x => x !== r);
    const from = s.cities[r.from];
    const name = `${from ? from.name : '?'} → ${destName(s, r)}`;
    if (r.foreign && voluntary && r.owner === 'p' && s.empires[r.to.owner] && !s.empires[r.to.owner].dead) {
      shiftOp(s, r.to.owner, -T.breakPenalty);
      G.log(s, 'p', `🐪 You broke the trade route ${name}. The ${s.empires[r.to.owner].name} are offended (−${T.breakPenalty} opinion).`, 'warn');
    } else if (r.owner === 'p') G.log(s, 'p', `🐪 Trade route ${name} ended${why ? ': ' + why : ''}.`, voluntary ? 'info' : 'warn');
    return null;
  };
  G.pauseRoute = (s, id) => {
    const r = G.routeById(s, id);
    if (!r) return 'No such route';
    r.active = !r.active;
    if (r.active && r.nextAt < s.time) r.nextAt = s.time;
    return null;
  };
  G.setEscort = (s, id, units) => {
    const r = G.routeById(s, id);
    if (!r) return 'No such route';
    const from = s.cities[r.from];
    const allowed = from ? G.unitsFor(s, from) : [];
    const esc = {};
    for (const [u, n] of Object.entries(units || {})) {
      const k = Math.floor(n);
      if (k > 0 && !NO_ESCORT[u] && allowed.includes(u) && DATA.units[u].type !== 'siege') esc[u] = k;
    }
    r.escort = esc;
    return null;
  };

  // -------------------------------------------------------------------
  // Risk: camps along the road and hostile armies near it
  // -------------------------------------------------------------------
  const hostileTo = (s, owner, other) => {
    if (owner === other) return false;
    if (owner === 'p') return G.rel(s, other).status === 'war';
    if (other === 'p') return G.rel(s, owner).status === 'war';
    return G.aiRel(s, owner, other).status === 'war';
  };
  const campsNear = (s, p) => Object.values(s.camps).filter(k => G.dist(k, p) <= T.campRadius && (k.units.brigand || 0) > 0);
  const armiesNear = (s, owner, p) => s.moves.filter(a => ['raid', 'attack', 'conquer'].includes(a.type) && G.unitsCount(a.units) > 0
    && hostileTo(s, owner, a.owner) && G.dist(G.movePos(s, a), p) <= T.campRadius);
  const rateAt = (s, owner, p, withArmies) => {
    let l = 0;
    for (const k of campsNear(s, p)) l += T.campRate * k.tier;
    if (withArmies) l += T.armyRate * armiesNear(s, owner, p).length;
    return l;
  };
  // per-trip ambush chance for a route (or a route-like {owner, from, to:{id}, foreign, escort})
  G.routeRisk = (s, route) => {
    const from = s.cities[route.from], to = destOf(s, route);
    if (!from || !to) return { chance: 0, camps: [], armies: 0, expectedLoss: 0, escortHolds: null };
    const owner = route.owner || from.owner;
    const dur = G.travelTime(s, owner, from, to, T.spd) / 60;
    const n = Math.max(4, Math.ceil(G.dist(from, to) * 4));
    let lam = 0;
    const camps = new Map(), armies = new Set();
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n, p = { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
      lam += rateAt(s, owner, p, false) * dur / n;
      for (const k of campsNear(s, p)) camps.set(k.id, k);
      for (const a of armiesNear(s, owner, p)) armies.add(a.id);
    }
    const legs = route.foreign ? 2 : 1;
    const chance = 1 - Math.exp(-lam * legs) * Math.pow(armies.size ? 0.5 : 1, legs);
    // how an escort would fare against the strongest party on the road
    let escortHolds = null, loss = (T.lossBare[0] + T.lossBare[1]) / 2;
    const esc = route.escort || {};
    if (G.unitsCount(esc)) {
      const worst = [...camps.values()].sort((a, b) => b.units.brigand - a.units.brigand)[0];
      if (worst) {
        const r = G.battle(s, null, { brigand: Math.max(3, Math.round(worst.units.brigand * T.party)) }, 1, owner, { ...esc }, 1, 0, 'raid');
        escortHolds = !r.win;
      } else escortHolds = true;
      loss = escortHolds ? T.lossHeld : T.lossBroken;
    }
    return { chance, camps: [...camps.values()].map(k => ({ id: k.id, tier: k.tier, x: k.x, y: k.y })), armies: armies.size, expectedLoss: chance * loss, escortHolds };
  };

  // resolve an ambush on caravan move m by a camp ({camp}) or a hostile army ({army}); deterministic but for the bare loss roll
  G.routeAmbush = (s, m, src) => {
    const r0 = G.routeById(s, m.route);
    const camp = src.camp, army = src.army;
    const attOwner = army ? army.owner : null;
    const party = army ? { ...army.units } : { brigand: Math.max(3, Math.round((camp.units.brigand || 0) * T.party)) };
    const attName = army ? s.empires[army.owner].name : 'Brigands';
    const escort = { ...m.units };
    let loss, held = false, b = null;
    if (G.unitsCount(escort)) {
      b = G.battle(s, attOwner, party, 1, m.owner, escort, 1, 0, 'raid');
      held = !b.win;
      loss = held ? T.lossHeld : T.lossBroken;
      m.units = Object.fromEntries(Object.entries(b.defLeft).filter(([, n]) => n > 0));
      if (camp) camp.units.brigand = Math.max(1, (camp.units.brigand || 0) - (b.attLost.brigand || 0));
      if (army) army.units = Object.fromEntries(Object.entries(b.attLeft).filter(([, n]) => n > 0));
    } else loss = G.rnd(T.lossBare[0], T.lossBare[1]);
    const stolen = {};
    for (const [g, n] of Object.entries(m.cargo || {})) {
      const k = Math.floor(n * loss);
      if (k > 0) { stolen[g] = k; m.cargo[g] = n - k; }
    }
    const into = camp ? (camp.loot = camp.loot || {}) : (army.cargo = army.cargo || {});
    for (const [g, k] of Object.entries(stolen)) if (g !== 'gold') into[g] = (into[g] || 0) + k;
    m.ambushed = true;
    const lostN = sum(stolen);
    if (r0) r0.lost = (r0.lost || 0) + lostN;
    const p = G.movePos(s, m);
    const where = `(${Math.round(p.x)}, ${Math.round(p.y)})`;
    const home = s.cities[m.from];
    const what = `${attName}${camp ? ` from the camp at (${camp.x}, ${camp.y})` : ''} fell on the caravan ${m.leg === 'back' ? 'heading home to' : 'from'} ${home ? home.name : 'home'}`;
    const extra = b ? `${what}. The escort ${held ? 'drove them off' : 'was overwhelmed'}; ${lostN ? goodsText(stolen) + ' lost' : 'nothing was lost'}.`
      : `${what} and made off with ${goodsText(stolen)}. An escort would have helped${camp ? ', and clearing the camp would make the road safe' : ''}.`;
    G.report(s, [m.owner], `Caravan ambushed near ${where}`, held ? 'win' : 'loss',
      b ? { att: attName, def: 'Caravan escort', A: b.A, D: b.D, attSent: party, defHad: escort, attLost: b.attLost, defLost: b.defLost, loot: stolen, extra }
        : { extra });
    G.log(s, m.owner, `🐪 ${attName} ambushed a caravan near ${where}${lostN ? ': ' + goodsText(stolen) + ' lost' : ''}.`, held ? 'warn' : 'bad');
    return { stolen, held, loss };
  };

  // -------------------------------------------------------------------
  // Departures
  // -------------------------------------------------------------------
  const pushLeg = (s, m0, leg, fromPos, toPos, cargo, units, homeId) => {
    const dur = G.travelTime(s, m0.owner, fromPos, toPos, T.spd);
    s.moves.push({
      id: G.newId(s, 'm'), owner: m0.owner, type: 'trade', route: m0.route, leg, from: homeId,
      fx: fromPos.x, fy: fromPos.y, x: toPos.x, y: toPos.y, units: units || {}, cargo: cargo || {},
      depart: s.time, arrive: s.time + dur,
    });
  };
  G.routeDepart = (s, r) => {
    const from = s.cities[r.from], to = destOf(s, r);
    if (!from || !to) return 'Gone';
    const internal = !r.foreign && !isMinor(r);   // only a city of one's own has storage to fill up
    const cargo = {};
    const cap = G.caravanCap(s, from);
    let room = cap;
    for (const [g, n] of Object.entries(r.goods.give)) {
      let k = Math.min(n, Math.floor(from.res[g] || 0), room);
      if (internal) k = Math.min(k, Math.max(0, Math.floor(G.storageCap(s, to) - (to.res[g] || 0))));
      if (k > 0) { cargo[g] = k; room -= k; }
    }
    if (!sum(cargo)) {
      const full = internal && Object.keys(r.goods.give).every(g => (to.res[g] || 0) >= G.storageCap(s, to) - 1);
      r.note = full ? `${to.name} is full` : `Waiting for ${Object.keys(r.goods.give).map(g => DATA.goods[g].name.toLowerCase()).join(', ')}`;
      r.nextAt = s.time + Math.min(r.every, 60 * paceT(s));
      return r.note;
    }
    for (const [g, k] of Object.entries(cargo)) from.res[g] -= k;
    const units = {};
    for (const [u, n] of Object.entries(r.escort || {})) {
      const k = Math.min(n, Math.floor(from.units[u] || 0));
      if (k > 0) { units[u] = k; from.units[u] -= k; }
    }
    r.note = sum(cargo) < sum(r.goods.give) ? 'Short load' : '';
    pushLeg(s, { owner: r.owner, route: r.id }, 'out', from, to, cargo, units, from.id);
    r.nextAt = s.time + r.every;
    r.lastDepart = s.time;
    return null;
  };

  // -------------------------------------------------------------------
  // Arrivals (caravans with m.route; ordinary caravans keep their old behaviour)
  // -------------------------------------------------------------------
  const homeOf = (s, m) => {
    const h = s.cities[m.from];
    return h && h.owner === m.owner ? h : G.capital(s, m.owner);
  };
  const arriveBack = (s, m) => {
    const home = homeOf(s, m);
    if (!home) return;
    if (G.dist(home, m) > 0.01) {   // home lost on the way: go on to the capital
      s.moves.push({ ...m, id: G.newId(s, 'm'), from: home.id, fx: m.x, fy: m.y, x: home.x, y: home.y, depart: s.time,
        arrive: s.time + G.travelTime(s, m.owner, m, home, T.spd) });
      return;
    }
    G.gain(s, home, m.cargo);
    G.addUnits(home.units, m.units);
  };
  const turnBack = (s, m, why) => {
    const home = homeOf(s, m);
    if (!home) return;
    if (m.owner === 'p') G.log(s, 'p', `🐪 A caravan turned back${why ? ': ' + why : ''}.`, 'warn');
    pushLeg(s, m, 'back', m, home, m.cargo, m.units, home.id);
  };
  const arriveOut = (s, m) => {
    const r = G.routeById(s, m.route);
    if (isMinor(r)) return arriveMinor(s, m, r);
    const to = r && s.cities[r.to.id];
    if (!r || !to || to.owner !== r.to.owner || (r.foreign && (hostileTo(s, r.owner, to.owner) || s.empires[to.owner].dead))) return turnBack(s, m, 'the route is closed');
    const from = s.cities[r.from];
    if (!r.foreign) {
      G.gain(s, to, m.cargo);
      r.trips++;
      r.delivered = (r.delivered || 0) + sum(m.cargo);
      if (r.owner === 'p' && r.trips === 1) G.log(s, 'p', `🐪 The first caravan of the route reached ${to.name} with ${goodsText(m.cargo)}.`, 'good');
      if (G.unitsCount(m.units)) pushLeg(s, m, 'back', to, from, {}, m.units, from.id);
      return;
    }
    // foreign: unload and load the agreed goods (from their stores, the rest from their merchants, as with
    // diplomacy's merchant offers), and both realms earn trade income
    const partner = s.empires[to.owner], me = s.empires[r.owner];
    const share = Math.min(1, sum(m.cargo) / Math.max(1, sum(r.goods.give)));
    G.gain(s, to, m.cargo);
    const back = {};
    for (const [g, n] of Object.entries(r.goods.take)) {
      const want = Math.floor(n * share);
      if (want > 0) back[g] = want;
      to.res[g] = Math.max(0, (to.res[g] || 0) - want);
    }
    const inc = G.routeIncome(s, from, to);
    me.gold += inc; partner.gold += inc;
    me.tradeIncome = (me.tradeIncome || 0) + inc;
    partner.tradeIncome = (partner.tradeIncome || 0) + inc;
    r.income += inc;
    r.trips++;
    if (r.owner === 'p' && r.trips % T.opinionEvery === 0) shiftOp(s, to.owner, 1);
    if (r.owner === 'p' && r.trips === 1) G.log(s, 'p', `🐪 The first caravan reached ${to.name}: +${inc} gold trade income for both realms.`, 'good');
    pushLeg(s, m, 'back', to, from, back, m.units, from.id);
  };
  // a route caravan reaches a free city: the goods are gifts (influence), the city pays trade gold
  // (merchant republics also pay for the goods, as for any caravan), and the escort goes home
  const arriveMinor = (s, m, r) => {
    const t = G.tileAt(s, m.x, m.y);
    const mi = (r ? minorOf(s, r) : null) || (G.minorAt ? G.minorAt(s, t) : null);
    const from = r && s.cities[r.from];
    const err = !r ? 'the route is closed' : !mi || mi.id !== r.to.id ? `${r.to.name || 'the free city'} is no longer free` : !from || from.owner !== r.owner ? 'its home city was lost' : G.minorRouteError(s, r.owner, mi);
    if (err) return turnBack(s, m, err);
    const MI = G.MINORS;
    const gifts = { ...(m.cargo || {}) };
    const rq = mi.req;
    if (rq && rq.type === 'deliver' && (gifts[rq.good] || 0) >= rq.amount && G.minorCompleteRequest) { gifts[rq.good] -= rq.amount; G.minorCompleteRequest(s, mi, r.owner); }
    const value = valueOf(gifts);
    const d = value > 0 && MI ? G.minorAddInfluence(s, mi, r.owner, value / (MI.giftDiv * G.minorScale(s)) * MI.caravanBonus * T.minorInf) : 0;
    for (const [g, v] of Object.entries(gifts)) if (v > 0 && DATA.goods[g]) mi.stores[g] = (mi.stores[g] || 0) + v * 0.5;
    const gold = G.minorRouteIncome(s, from, mi) + (mi.kind === 'merchant' ? Math.round(value * T.minorGoodsPay) : 0);
    const me = s.empires[r.owner];
    me.gold += gold; me.tradeIncome = (me.tradeIncome || 0) + gold;
    r.income += gold; r.influence = (r.influence || 0) + d; r.trips++;
    r.delivered = (r.delivered || 0) + sum(m.cargo);
    if (G.minorUpdatePatron) G.minorUpdatePatron(s, mi);
    if (r.owner === 'p' && r.trips === 1) G.log(s, 'p', `🐪 The first caravan reached 🏰 ${mi.name}: +${d.toFixed(1)} influence, +${gold} gold.`, 'good');
    pushLeg(s, m, 'back', mi, from, {}, m.units, from.id);
  };
  // js/minors.js (loaded after this file) wraps G.resolveMove and takes every caravan that reaches a free
  // city. Route caravans need their own arrival (escort, trips, back leg), so wrap whatever G.resolveMove
  // is once the first step runs: by then every module has loaded, and step hooks run before arrivals.
  let minorWrap = false;
  G.stepHooks.push(() => {
    if (minorWrap) return;
    minorWrap = true;
    const inner = G.resolveMove;
    G.resolveMove = (s, m) => {
      if (m && m.route && m.type === 'trade' && m.leg !== 'back') {
        const r = G.routeById(s, m.route);
        if (isMinor(r) || (!r && G.minorAt && G.minorAt(s, G.tileAt(s, m.x, m.y)))) {
          try { arriveMinor(s, m, r); } catch (e) { if (typeof console !== 'undefined') console.error('trade route arrival (free city)', e); }
          return;
        }
      }
      return inner(s, m);
    };
  });
  const plainTrade = (s, m) => {   // engine.js behaviour for ordinary caravans
    const tile = G.tileAt(s, m.x, m.y);
    const tc = tile && tile.city && s.cities[tile.city];
    if (tc) { G.gain(s, tc, m.cargo); G.log(s, m.owner, `Caravan arrived at ${tc.name}.`, 'good'); }
  };
  const prevTrade = G.moveHandlers.trade;
  G.moveHandlers.trade = (s, m) => {
    if (!m.route) return prevTrade ? prevTrade(s, m) : plainTrade(s, m);
    try { if (m.leg === 'back') arriveBack(s, m); else arriveOut(s, m); } catch (e) { if (typeof console !== 'undefined') console.error('trade route arrival', e); }
  };

  // -------------------------------------------------------------------
  // Slow tick: cancellations, departures, ambushes, goodwill, AI-AI trade
  // -------------------------------------------------------------------
  G.slowHooks.push((s, dtMin) => {
    // AI-AI: a fresh war between trading partners may be talked down (diplomacy's hook ran just before)
    for (const ar of [...aiRoutes(s)]) {
      const rel = G.aiRel(s, ar.a, ar.b);
      if (rel.status === 'war' && rel.since === s.time && Math.random() < T.aiAvert) {
        rel.status = 'neutral';
        const A = s.empires[ar.a], B = s.empires[ar.b];
        if (seen(s, ...G.citiesOf(s, ar.a), ...G.citiesOf(s, ar.b))) G.log(s, 'p', `🐪 Merchant guilds talk the ${A.name} and the ${B.name} back from the brink of war.`, 'info');
      }
    }
    // cancellations
    for (const r of [...routes(s)]) {
      const from = s.cities[r.from];
      if (isMinor(r)) {
        const mi = minorOf(s, r);
        if (!from || from.owner !== r.owner) G.cancelRoute(s, r.id, `${from ? from.name : 'the city'} changed hands`);
        else if (!mi) G.cancelRoute(s, r.id, `${r.to.name || 'the free city'} is no longer a free city`);
        else if (mi.subject) G.cancelRoute(s, r.id, mi.subject === r.owner ? `${mi.name} now pays you tribute` : `${mi.name} now pays tribute to the ${s.empires[mi.subject].name}`);
        continue;
      }
      const to = s.cities[r.to.id];
      if (!from || from.owner !== r.owner) G.cancelRoute(s, r.id, `${from ? from.name : 'the city'} changed hands`);
      else if (!to || to.owner !== r.to.owner) G.cancelRoute(s, r.id, `${to ? to.name : 'the city'} changed hands`);
      else if (r.foreign && s.empires[r.to.owner].dead) G.cancelRoute(s, r.id, `the ${s.empires[r.to.owner].name} have fallen`);
      else if (r.foreign && hostileTo(s, r.owner, r.to.owner)) G.cancelRoute(s, r.id, `war with the ${s.empires[r.to.owner].name}`);
    }
    // departures (one trip in flight per route)
    for (const r of routes(s)) {
      if (!r.active || r.nextAt > s.time) continue;
      if (s.moves.some(m => m.route === r.id)) { r.nextAt = s.time + 30; continue; }
      if (r.foreign && r.owner === 'p' && G.rel(s, r.to.owner).opinion < T.minOpinion) { r.note = 'They refuse to trade (opinion below 0)'; r.nextAt = s.time + 60 * paceT(s); continue; }
      G.routeDepart(s, r);
    }
    // ambushes on the road
    for (const m of [...s.moves]) {
      if (!m.route || m.ambushed || !sum(m.cargo)) continue;
      const p = G.movePos(s, m);
      const camps = campsNear(s, p), armies = armiesNear(s, m.owner, p);
      const lam = camps.reduce((a, k) => a + T.campRate * k.tier, 0) + T.armyRate * armies.length;
      if (!lam || Math.random() >= 1 - Math.exp(-lam * dtMin)) continue;
      // who strikes: weighted by the same rates
      let x = Math.random() * lam, src = null;
      for (const k of camps) { x -= T.campRate * k.tier; if (x <= 0) { src = { camp: k }; break; } }
      if (!src) src = armies.length ? { army: armies[Math.floor(Math.random() * armies.length)] } : { camp: camps[0] };
      G.routeAmbush(s, m, src);
    }
    // goodwill: active routes hold opinion up above the treaty baseline (diplomacy drifts it back to that)
    for (const e of Object.values(s.empires)) {
      if (e.id === 'p' || e.dead) continue;
      const n = G.routesWith(s, 'p', e.id).filter(r => r.active).length;
      if (!n) continue;
      const rel = G.rel(s, e.id), base = STATUS_BASE[rel.status] || 0, cap = base + Math.min(T.goodwillMax, T.goodwillPer * n);
      if (rel.opinion >= base && rel.opinion < cap) rel.opinion = Math.min(cap, rel.opinion + 0.4 * dtMin);
    }
    aiTrade(s, dtMin);
    aiPropose(s, dtMin);
  });

  // ---- abstract AI-to-AI routes ----
  const marketCities = (s, id) => G.citiesOf(s, id).filter(c => G.lvl(c, 'market') >= 1);
  const closestPair = (s, a, b) => {
    let best = null, bd = 1e9;
    for (const x of marketCities(s, a)) for (const y of marketCities(s, b)) { const d = G.dist(x, y); if (d < bd) { bd = d; best = [x, y]; } }
    return best;
  };
  const aiTrade = (s, dtMin) => {
    const pace = paceT(s);
    s.aiRoutes = aiRoutes(s).filter(ar => {
      const A = s.empires[ar.a], B = s.empires[ar.b];
      const ca = s.cities[ar.ca], cb = s.cities[ar.cb];
      if (!A || !B || A.dead || B.dead || G.aiRel(s, ar.a, ar.b).status === 'war') return false;
      if (!ca || !cb || ca.owner !== ar.a || cb.owner !== ar.b || !G.lvl(ca, 'market') || !G.lvl(cb, 'market')) {
        const pair = closestPair(s, ar.a, ar.b);
        if (!pair) return false;
        ar.ca = pair[0].id; ar.cb = pair[1].id;
      }
      const inc = T.aiIncome * G.routeIncome(s, s.cities[ar.ca], s.cities[ar.cb]) * dtMin / (T.defaultEvery * pace);
      A.gold += inc; B.gold += inc;
      A.tradeIncome = (A.tradeIncome || 0) + inc; B.tradeIncome = (B.tradeIncome || 0) + inc;
      ar.income = (ar.income || 0) + inc;
      return true;
    });
    const ais = Object.values(s.empires).filter(e => e.id !== 'p' && !e.dead);
    for (let i = 0; i < ais.length; i++) for (let j = i + 1; j < ais.length; j++) {
      const a = ais[i].id, b = ais[j].id;
      if (aiRoutes(s).some(ar => (ar.a === a && ar.b === b) || (ar.a === b && ar.b === a))) continue;
      if (G.aiRel(s, a, b).status === 'war' || Math.random() >= dtMin / (T.aiOpen * pace)) continue;
      const pair = closestPair(s, a, b);
      if (!pair) continue;
      aiRoutes(s).push({ id: G.newId(s, 'ar'), a, b, ca: pair[0].id, cb: pair[1].id, since: s.time, income: 0 });
      if (seen(s, pair[0], pair[1])) G.log(s, 'p', `🐪 The ${ais[i].name} and the ${ais[j].name} open a trade road.`, 'info');
    }
  };
  G.aiTradesWith = (s, a, b) => aiRoutes(s).some(ar => (ar.a === a && ar.b === b) || (ar.a === b && ar.b === a));

  // trading partners are slower to pick fights
  const baseHostility = G.hostility;
  G.hostility = (s, aiId, target) => {
    const h = baseHostility(s, aiId, target);
    if (!h) return h;
    if (target === 'p') {
      const n = G.routesWith(s, 'p', aiId).length;
      return n ? h * Math.max(T.hostilityFloor, 1 - T.hostilityCut * n) : h;
    }
    return G.aiTradesWith(s, aiId, target) ? h * T.aiHostility : h;
  };

  // ---- AI proposals to the player ----
  const RAW = ['grain', 'timber', 'stone', 'ore', 'iron'];
  G.routeProposal = (s, aiId) => {
    const aiCities = marketCities(s, aiId);
    const mine = G.citiesOf(s, 'p').filter(c => G.lvl(c, 'market') >= 1 && G.routesFrom(s, c.id).length < G.routeSlots(s, c));
    let best = null, bd = 1e9;
    for (const a of aiCities) for (const p of mine) { const d = G.dist(a, p); if (d < bd) { bd = d; best = [p, a]; } }
    if (!best) return null;
    const [pc, ac] = best;
    const capP = G.storageCap(s, pc), capA = G.storageCap(s, ac);
    // they ask for what they lack and the player has; they offer a specialty they hold
    const gives = RAW.filter(g => (pc.res[g] || 0) > Math.min(capP * 0.3, 1000)).sort((x, y) => (ac.res[x] || 0) / capA - (ac.res[y] || 0) / capA);
    const takes = G.routeTakeGoods(s, 'p', aiId).filter(g => SPECIALTY[s.empires[aiId].race].includes(g) && !gives.slice(0, 1).includes(g));
    const give = gives[0], take = takes.sort((x, y) => (ac.res[y] || 0) - (ac.res[x] || 0))[0];
    if (!give || !take) return null;
    const n = Math.max(50, Math.min(G.caravanCap(s, pc), Math.round(Math.min(capP * 0.15, (pc.res[give] || 0) * 0.4) / 50) * 50));
    const q = G.routeQuote(s, pc, ac, give, n, take);
    if (q.take < 1) return null;
    return { ai: aiId, from: pc.id, to: ac.id, give: { [give]: n }, takeGood: take, take: q.take, every: T.defaultEvery, income: q.income };
  };
  const aiPropose = (s, dtMin) => {
    for (const e of Object.values(s.empires)) {
      if (e.id === 'p' || e.dead) continue;
      const rel = G.rel(s, e.id);
      if (rel.status === 'war' || rel.opinion < T.proposeOpinion) continue;
      if (G.routesWith(s, 'p', e.id).length >= T.maxWithPlayer) continue;
      if ((s.pending || []).some(p => p.kind === 'tradeRoute' && p.data && p.data.ai === e.id)) continue;
      if (Math.random() >= dtMin / (T.propose * paceT(s))) continue;
      const d = G.routeProposal(s, e.id);
      if (!d) continue;
      const pc = s.cities[d.from], ac = s.cities[d.to];
      const g = Object.keys(d.give)[0];
      G.addPending(s, {
        kind: 'tradeRoute', title: `The ${e.name} propose a trade route`,
        text: `Every ${Math.round(d.every)} minutes, a caravan from ${pc.name} would carry ${d.give[g]} ${DATA.goods[g].name.toLowerCase()} to ${ac.name} and bring back ${d.take} ${DATA.goods[d.takeGood].name.toLowerCase()}. Both realms earn ${d.income} gold per trip.`,
        options: [{ key: 'accept', label: 'Open the route' }, { key: 'decline', label: 'Decline' }],
        expires: s.time + 300 * paceT(s), def: 'decline', data: d,
      });
    }
  };
  G.pendingHandlers.tradeRoute = (s, p, key, auto) => {
    const d = p.data;
    if (key !== 'accept') {
      if (!auto && s.empires[d.ai] && !s.empires[d.ai].dead) shiftOp(s, d.ai, -T.declinePenalty);
      return null;
    }
    const r = G.createRoute(s, 'p', d.from, d.to, { give: d.give, takeGood: d.takeGood, take: d.take, every: d.every });
    return typeof r === 'string' ? r : null;
  };

  // ---- AI internal routes: surplus city -> deficit city ----
  G.aiHooks.push((s, emp, dtMin) => {
    emp.trClock = (emp.trClock || 0) + dtMin;
    if (emp.trClock < 1) return;
    emp.trClock = 0;
    const cities = G.citiesOf(s, emp.id);
    if (cities.length < 2) return;
    // drop routes that are no longer needed
    for (const r of routes(s).filter(x => x.owner === emp.id && !x.foreign && !isMinor(x))) {
      const from = s.cities[r.from], to = s.cities[r.to.id];
      if (!from || !to) continue;
      const g = Object.keys(r.goods.give)[0];
      if ((to.res[g] || 0) > G.storageCap(s, to) * 0.7 || (from.res[g] || 0) < G.storageCap(s, from) * 0.3) G.cancelRoute(s, r.id, 'no longer needed');
    }
    for (const g of RAW) {
      const src = cities.filter(c => G.lvl(c, 'market') >= 1 && G.routesFrom(s, c.id).length < G.routeSlots(s, c) && (c.res[g] || 0) > G.storageCap(s, c) * 0.6)
        .sort((a, b) => (b.res[g] || 0) - (a.res[g] || 0))[0];
      if (!src) continue;
      const dst = cities.filter(c => c !== src && (c.res[g] || 0) < G.storageCap(s, c) * 0.25
        && !routes(s).some(r => r.from === src.id && r.to.id === c.id && r.goods.give[g])).sort((a, b) => G.dist(a, src) - G.dist(b, src))[0];
      if (!dst) continue;
      const n = Math.min(G.caravanCap(s, src), Math.round(G.storageCap(s, src) * 0.2));
      if (n >= 50 && typeof G.createRoute(s, emp.id, src.id, dst.id, { give: { [g]: n }, every: T.defaultEvery }) !== 'string') return;
    }
  });

  // ---- AI routes to free cities: one per realm, a good the free city wants, from a city with a surplus ----
  G.aiMinorRoute = (s, emp) => {
    const mine = routes(s).filter(x => x.owner === emp.id && isMinor(x));
    for (const r of mine) {   // drop it when the surplus is gone (or they fell out with the city)
      const from = s.cities[r.from], mi = minorOf(s, r), g = Object.keys(r.goods.give)[0];
      if (!from || !mi) continue;
      if ((from.res[g] || 0) < G.storageCap(s, from) * 0.2 || (mi.grudge && (mi.grudge[emp.id] || 0) > s.time)) G.cancelRoute(s, r.id, 'no longer worth it');
    }
    if (routes(s).some(x => x.owner === emp.id && isMinor(x)) || !G.minorsList) return null;
    let best = null, bs = -1e9;
    for (const c of G.citiesOf(s, emp.id)) {
      if (G.lvl(c, 'market') < 1 || G.routesFrom(s, c.id).length >= G.routeSlots(s, c)) continue;
      const cap = G.storageCap(s, c);
      for (const mi of G.minorsList(s)) {
        const d = G.dist(c, mi);
        if (d > T.aiMinorRange || G.minorRouteError(s, emp.id, mi) || (mi.grudge && (mi.grudge[emp.id] || 0) > s.time)) continue;
        const wants = ((DATA.minorKinds[mi.kind] || {}).wants || []).filter(g => DATA.goods[g] && (c.res[g] || 0) > cap * 0.5);
        if (!wants.length) continue;
        const sc = (mi.patron === emp.id ? 1.5 : mi.patron ? 0.5 : 1) + (mi.kind === 'merchant' ? 0.6 : 0) - d * 0.12 + Math.random() * 0.3;
        if (sc > bs) { bs = sc; best = { c, mi, g: wants.sort((a, b) => (c.res[b] || 0) - (c.res[a] || 0))[0] }; }
      }
    }
    if (!best) return null;
    const n = Math.min(G.caravanCap(s, best.c), Math.round(G.storageCap(s, best.c) * T.aiMinorLoad), T.aiMinorMax);
    if (n < 50) return null;
    const r = G.createRoute(s, emp.id, best.c.id, best.mi.id, { give: { [best.g]: n }, every: T.defaultEvery });
    return typeof r === 'string' ? null : r;
  };
  G.aiHooks.push((s, emp, dtMin) => {
    emp.trmClock = (emp.trmClock || 0) + dtMin;
    if (emp.trmClock < T.aiMinorEvery * paceT(s)) return;
    emp.trmClock = 0;
    G.aiMinorRoute(s, emp);
  });
})();
