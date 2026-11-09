// =====================================================================
//  Supply lines: a realm-wide policy per good, and a cheap planner that
//  moves goods from cities with a surplus to cities that lack them, with
//  real caravans (type 'trade', m.supply) that travel the roads or sail
//  from a Harbor, use the source's caravan capacity and can be ambushed.
//
//  Policy (per realm, lazy so older saves load):
//    s.logistics[owner] = {
//      on,                    // master switch (the player's; AI realms always plan)
//      relief,                // also relieve shortages that hurt (famine, cold, rust…) for goods without a policy
//      goods: { g: { on, mode: 'min' | 'stock', n, export } }   // keep n minutes of use / n in stock; export above `export` (null = auto)
//      cities: { cityId: { g: { target, export } } }              // per-city overrides (absolute stock)
//      excl: { cityId: true },                                     // cities left out of the plan
//      sell, buy, reserve,    // auto-sell surplus that would spill / auto-buy hurting shortages above a gold reserve
//      next,                  // game time of the next planning pass
//      log: [{ t, text }], stats: { trips, shipped, lost, routed, sold, earned, bought, spent }
//    }
//  Shipments are moves { type:'trade', supply:true, leg:'out'|'back', from, to, cargo, sent, prio, path, naval }.
//  Standing internal routes (traderoutes.js) are preferred: a route already carrying the good covers the need,
//  and an idle one is hurried along when the need hurts.
//  Pure engine code (no S / UI / document); the UI lives in ui-ledger.js.
// =====================================================================
'use strict';
(() => {
  const L = G.LOGI = {
    every: 1,             // game-minutes (× pace) between planning passes for the player
    aiEvery: 2,           // … and for each AI realm
    minLoad: 20,          // smallest load worth a cart (hurting shortages ship any amount)
    lead: 3,              // minutes of a deficit city's net loss added on top of its target (goods on the road)
    hyst: 0.8,            // a city asks for goods once below this share of its target (or when a shortage hurts)
    exportFrac: 0.1,      // automatic export level: above max(1.5 × target, target + this share of storage)
    maxTarget: 0.9,       // targets never exceed this share of storage
    slotsPer: 4,          // supply caravans on the road per source city: 1 + floor(market level / 4)
    defaultMin: 10,
    sellAbove: 0.92, sellTo: 0.8,
    buyPrio: 60,          // auto-buy only shortages at least this urgent
    logMax: 40,
    hurryPrio: 60,        // standing routes are called out early for needs this urgent
  };
  // goods that can be moved (mana stays where the ley lines are)
  const movable = (s, owner) => DATA.goodOrder.filter(g => g !== 'mana' && DATA.goods[g] && (!DATA.goods[g].race || !s.empires[owner] || DATA.goods[g].race === s.empires[owner].race));
  G.supplyGoods = movable;
  // what an AI realm keeps (minutes of use); also the player's "recommended" policy
  const AI_POLICY = { grain: 12, timber: 10, stone: 10, iron: 8, tools: 10, weapons: 8, bonedust: 10, bread: 8 };
  G.LOGI_RECOMMENDED = AI_POLICY;

  const sum = o => Object.values(o || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const paceT = s => G.pace(s).time;
  const gname = g => DATA.goods[g] ? DATA.goods[g].name.toLowerCase() : g;
  const goodsText = o => Object.entries(o || {}).filter(([, n]) => n > 0).map(([g, n]) => `${Math.floor(n)} ${gname(g)}`).join(', ') || 'nothing';

  // -------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------
  const LS = (s, owner) => {
    const all = s.logistics = s.logistics || {};
    const o = all[owner] = all[owner] || {};
    o.goods = o.goods || {};
    // the player's cities balance each other automatically from the start: the recommended policy
    // (about ten minutes of everything they use up), switchable off in the Ledger or the city header
    if (o.on === undefined) {
      o.on = owner === 'p' && !L.playerOffByDefault;
      if (o.on) for (const [g, n] of Object.entries(AI_POLICY)) if (!o.goods[g] && DATA.goods[g] && movable(s, owner).includes(g)) o.goods[g] = { on: true, mode: 'min', n, export: null };
    }
    if (o.relief === undefined) o.relief = true;
    o.cities = o.cities || {};
    o.excl = o.excl || {};
    o.log = o.log || [];
    o.stats = o.stats || { trips: 0, shipped: 0, lost: 0, routed: 0, sold: 0, earned: 0, bought: 0, spent: 0 };
    if (o.reserve === undefined) o.reserve = 500;
    return o;
  };
  G.logistics = LS;
  const logLine = (s, o, text) => {
    o.log.unshift({ t: s.time, text });
    if (o.log.length > L.logMax) o.log.length = L.logMax;
  };

  G.setSupplyPolicy = (s, owner, g, cfg = {}) => {
    if (!DATA.goods[g] || !movable(s, owner).includes(g)) return 'That good cannot be shipped';
    const o = LS(s, owner);
    const p = o.goods[g] = o.goods[g] || { on: false, mode: 'min', n: L.defaultMin, export: null };
    if (cfg.on !== undefined) p.on = !!cfg.on;
    if (cfg.mode !== undefined) { if (cfg.mode !== 'min' && cfg.mode !== 'stock') return 'Unknown mode'; p.mode = cfg.mode; }
    if (cfg.n !== undefined) p.n = Math.max(0, Math.min(p.mode === 'min' ? 600 : 1e6, Math.floor(+cfg.n || 0)));
    if (cfg.export !== undefined) p.export = cfg.export === null || cfg.export === '' ? null : Math.max(0, Math.floor(+cfg.export || 0));
    if (cfg.on) o.on = true;
    o.next = Math.min(o.next || 0, s.time);
    return null;
  };
  // per-city override: { target, export } (absolute amounts; null or '' clears), or { off: true } to leave the city out
  G.setSupplyCity = (s, owner, cityId, g, cfg = {}) => {
    const city = s.cities[cityId];
    if (!city || city.owner !== owner) return 'Not one of your cities';
    const o = LS(s, owner);
    if (g === null || g === undefined) { if (cfg.off) o.excl[cityId] = true; else delete o.excl[cityId]; return null; }
    if (!DATA.goods[g]) return 'Unknown good';
    const c = o.cities[cityId] = o.cities[cityId] || {};
    const cur = c[g] = c[g] || {};
    for (const k of ['target', 'export']) if (cfg[k] !== undefined) { if (cfg[k] === null || cfg[k] === '') delete cur[k]; else cur[k] = Math.max(0, Math.floor(+cfg[k] || 0)); }
    if (!Object.keys(cur).length) delete c[g];
    if (!Object.keys(c).length) delete o.cities[cityId];
    return null;
  };
  G.setSupplyRealm = (s, owner, cfg = {}) => {
    const o = LS(s, owner);
    for (const k of ['on', 'relief', 'sell', 'buy']) if (cfg[k] !== undefined) o[k] = !!cfg[k];
    if (cfg.reserve !== undefined) o.reserve = Math.max(0, Math.floor(+cfg.reserve || 0));
    o.next = Math.min(o.next || 0, s.time);
    return null;
  };
  // the recommended policy: keep about ten minutes of everything the cities use up
  G.supplyRecommend = (s, owner) => {
    const o = LS(s, owner);
    for (const [g, n] of Object.entries(AI_POLICY)) if (movable(s, owner).includes(g)) o.goods[g] = { on: true, mode: 'min', n, export: null };
    o.on = true; o.relief = true;
    o.next = s.time;
    return null;
  };

  // -------------------------------------------------------------------
  // Targets and needs
  // -------------------------------------------------------------------
  // gross use per minute: what the people eat, upkeep and wear, and what workshops consume
  G.supplyUse = (s, city, g, e) => {
    e = e || G.econ(s, city);
    let u = (e.use && e.use[g]) || 0;
    if (g === 'grain') u += (e.grainFood || 0) + (e.upkeep || 0);
    if (g === 'bread') u += e.breadFood || 0;
    for (const r of e.refiners || []) if (!r.off && r.in[g]) u += r.in[g];
    return u;
  };
  const policyOf = (s, owner, o, g) => {
    if (owner !== 'p' && !o.on) return AI_POLICY[g] ? { on: true, mode: 'min', n: AI_POLICY[g], export: null } : null;
    const p = o.goods[g];
    return p && p.on ? p : null;
  };
  // { target, export, use, policy } for a city and good; target 0 when no policy applies
  G.supplyTarget = (s, city, g, e, o) => {
    e = e || G.econ(s, city);
    o = o || LS(s, city.owner);
    const pol = policyOf(s, city.owner, o, g);
    const use = G.supplyUse(s, city, g, e);
    const ov = (o.cities[city.id] || {})[g] || {};
    const cap = e.cap;
    let target = 0;
    if (ov.target !== undefined) target = ov.target;
    else if (pol) target = pol.mode === 'stock' ? pol.n : use * pol.n;
    else if (o.relief || city.owner !== 'p') target = use * L.defaultMin;    // relief only: used when a shortage hurts
    target = Math.min(target, cap * L.maxTarget);
    const set = ov.export !== undefined ? ov.export : pol && pol.export !== null && pol.export !== undefined ? pol.export : null;
    const exp = Math.max(target, set !== null ? set : Math.max(target * 1.5, target + cap * L.exportFrac));
    // in an emergency elsewhere a city gives down to a little above its own target, unless you set its export level
    const floor = set !== null ? exp : Math.min(exp, Math.max(target * 1.2, target + L.minLoad));
    return { target, export: exp, floor, use, policy: !!pol || ov.target !== undefined };
  };
  // how much a shortage hurts: { prio, why } — 0 when it does not
  G.supplyHurt = (s, city, g, e) => {
    const sh = city.short || {}, wear = city.wear || {};
    const res = city.res[g] || 0;
    const use = G.supplyUse(s, city, g, e);
    const winter = G.season ? G.season(s).index === 3 : false;
    if (g === 'grain') {
      if (city.starving) return { prio: 100, why: 'starving' };
      if (use > 0 && res < use * 3) return { prio: 85, why: 'famine near' };
    } else if (g === 'timber') {
      if (sh.timber) return { prio: winter ? 95 : 75, why: winter ? 'freezing' : 'no firewood' };
      if (winter && use > 0 && res < use * 5) return { prio: 70, why: 'winter firewood' };
    } else if (g === 'stone') {
      if (sh.stone) return { prio: G.lvl(city, 'wall') ? 80 : 62, why: G.lvl(city, 'wall') ? 'walls crumbling' : 'no stone for repairs' };
    } else if (G.SINK.grace[g]) {
      if (sh[g]) return { prio: 75, why: g === 'tools' ? 'tools worn out' : g === 'weapons' ? 'blunted weapons' : g === 'iron' ? 'armour rusting' : 'shortage' };
      if ((wear[g] || 0) > 0) return { prio: 65, why: 'wearing out' };
    }
    return { prio: 0, why: '' };
  };

  // goods on the road towards a city (supply carts and standing-route carts), and supply carts out of a city
  const roadState = (s, owner) => {
    const inbound = {}, out = {};
    for (const m of s.moves) {
      if (m.owner !== owner || m.type !== 'trade' || !m.cargo) continue;
      let to = null;
      if (m.supply) { if (m.leg !== 'back') { to = m.to; out[m.from] = (out[m.from] || 0) + 1; } }
      else if (m.route && m.leg === 'out') { const r = G.routeById ? G.routeById(s, m.route) : null; if (r && !r.foreign && r.to && r.to.kind !== 'minor') to = r.to.id; }
      if (!to) continue;
      const box = inbound[to] = inbound[to] || {};
      for (const [g, n] of Object.entries(m.cargo)) if (n > 0) box[g] = (box[g] || 0) + n;
    }
    return { inbound, out };
  };
  G.supplySlots = (s, city) => G.lvl(city, 'market') >= 1 ? 1 + Math.floor(G.lvl(city, 'market') / L.slotsPer) : 0;

  // how a cart gets from a to b: over land, or by sea from a Harbor; null when it cannot
  const reachCache = new WeakMap();
  G.supplyReach = (s, owner, a, b) => {
    let rc = reachCache.get(s.tiles);
    if (!rc) { rc = new Map(); reachCache.set(s.tiles, rc); }
    if (rc.size > 4000) rc.clear();
    const key = owner + ':' + a.id + '>' + b.id + ':' + (G.lvl(a, 'harbor') ? 'h' : '');
    if (rc.has(key)) return rc.get(key);
    let r = null;
    const land = G.planMarch(s, owner, a, b, {});
    if (land.ok) r = { dur: land.dur, path: land.path, naval: false };
    else if (G.lvl(a, 'harbor') >= 1 && DATA.units.transport) {
      const sea = G.planMarch(s, owner, a, b, { transport: 1 });
      if (sea.ok) r = { dur: sea.dur, path: sea.path, naval: true };
    }
    rc.set(key, r);
    return r;
  };

  // -------------------------------------------------------------------
  // The planner. Returns { ships, needs, idle } without changing anything.
  //   ships: [{ from, to, goods, prio, why, naval, dur, path }]  ·  routed: [{ route, from, to, g, n, prio, hurry }]
  //   needs: [{ city, g, need, prio, why, met, unmet }]          ·  notes: [text]
  // -------------------------------------------------------------------
  G.supplyPlan = (s, owner, opts = {}) => {
    const o = LS(s, owner);
    const cities = G.citiesOf(s, owner).filter(c => !o.excl[c.id]);
    const out = { ships: [], routed: [], needs: [], notes: [], surplus: {} };
    if (cities.length < 2) return out;
    const goods = movable(s, owner);
    const econ = {};
    for (const c of cities) econ[c.id] = (opts.econ && opts.econ[c.id]) || G.econ(s, c);
    const road = roadState(s, owner);
    const T = {}, avail = {}, spare = {};
    // needs and surpluses
    const needs = [];
    for (const c of cities) {
      const e = econ[c.id];
      T[c.id] = {}; avail[c.id] = {}; spare[c.id] = {};
      const inb = road.inbound[c.id] || {};
      for (const g of goods) {
        const t = G.supplyTarget(s, c, g, e, o);
        T[c.id][g] = t;
        const res = c.res[g] || 0;
        avail[c.id][g] = Math.max(0, Math.floor(res - t.export));
        spare[c.id][g] = Math.max(0, Math.floor(res - t.floor)) - avail[c.id][g];   // extra given only for hurting needs
        if (avail[c.id][g] > 0) out.surplus[g] = (out.surplus[g] || 0) + avail[c.id][g];
        const hurt = G.supplyHurt(s, c, g, e);
        if (!t.policy && !(hurt.prio && (o.relief || owner !== 'p'))) continue;
        if (!(t.target > 0) && !hurt.prio) continue;
        const have = res + (inb[g] || 0);
        if (!hurt.prio && have >= t.target * L.hyst) continue;
        const net = (e.net && e.net[g]) || 0;
        let want = Math.max(t.target, hurt.prio ? Math.max(t.use * L.defaultMin, L.minLoad) : 0) + Math.max(0, -net) * L.lead - have;
        want = Math.min(want, e.cap - res - (inb[g] || 0));
        if (!(want >= 1)) continue;
        const prio = hurt.prio || Math.round(20 + 30 * Math.max(0, 1 - have / Math.max(1, t.target)));
        needs.push({ city: c, g, need: Math.floor(want), prio, why: hurt.why || 'below target', met: 0 });
      }
    }
    needs.sort((a, b) => b.prio - a.prio || b.need - a.need);
    // sources
    const slots = {}, capLeft = {};
    for (const c of cities) { slots[c.id] = Math.max(0, G.supplySlots(s, c) - (road.out[c.id] || 0)); capLeft[c.id] = G.caravanCap(s, c); }
    const pending = new Map();     // 'from>to' -> ship
    const routes = (G.routes ? G.routes(s) : []).filter(r => r.owner === owner && !r.foreign && r.to && r.to.kind !== 'minor' && r.active);
    const inFlight = new Set(s.moves.filter(m => m.route).map(m => m.route));
    for (const nd of needs) {
      const dst = nd.city, g = nd.g;
      let left = nd.need;
      // a standing route that already carries this good covers what it brings
      for (const r of routes) {
        if (left <= 0) break;
        if (r.to.id !== dst.id || !(r.goods.give[g] > 0)) continue;
        const src = s.cities[r.from];
        if (!src || src.owner !== owner) continue;
        const n = Math.min(left, r.goods.give[g], Math.floor(src.res[g] || 0));
        if (n <= 0) continue;
        const hurry = nd.prio >= L.hurryPrio && !inFlight.has(r.id) && r.nextAt > s.time + 30;
        out.routed.push({ route: r.id, from: src.id, to: dst.id, g, n, prio: nd.prio, hurry });
        left -= n; nd.met += n;
      }
      if (left <= 0) continue;
      const urgent = nd.prio >= L.buyPrio;
      const minLoad = urgent ? 1 : Math.min(L.minLoad, nd.need);
      const has = c => avail[c.id][g] + (urgent ? spare[c.id][g] : 0);
      // nearest source with goods to spare and a cart free (a pair already loading this pass comes first)
      const srcs = cities.filter(c => c !== dst && has(c) >= minLoad && (pending.has(c.id + '>' + dst.id) ? pending.get(c.id + '>' + dst.id).room > 0 : slots[c.id] > 0 && capLeft[c.id] > 0))
        .sort((a, b) => (pending.has(a.id + '>' + dst.id) ? -1e3 : 0) + G.dist(a, dst) - ((pending.has(b.id + '>' + dst.id) ? -1e3 : 0) + G.dist(b, dst)));
      for (const src of srcs) {
        if (left < minLoad) break;
        const key = src.id + '>' + dst.id;
        let sh = pending.get(key);
        if (!sh) {
          const way = G.supplyReach(s, owner, src, dst);
          if (!way) continue;
          if (slots[src.id] <= 0) continue;
          sh = { from: src.id, to: dst.id, goods: {}, prio: nd.prio, why: nd.why, naval: way.naval, dur: way.dur, path: way.path, room: capLeft[src.id] };
          pending.set(key, sh); out.ships.push(sh); slots[src.id]--;
        }
        const n = Math.floor(Math.min(left, has(src), sh.room));
        if (n < minLoad) continue;
        sh.goods[g] = (sh.goods[g] || 0) + n;
        const a = Math.min(n, avail[src.id][g]);
        avail[src.id][g] -= a; spare[src.id][g] -= n - a;
        sh.room -= n; left -= n; nd.met += n;
        sh.prio = Math.max(sh.prio, nd.prio);
      }
    }
    out.ships = out.ships.filter(sh => sum(sh.goods) > 0);
    for (const nd of needs) out.needs.push({ city: nd.city.id, g: nd.g, need: nd.need, prio: nd.prio, why: nd.why, met: nd.met, unmet: Math.max(0, nd.need - nd.met) });
    for (const c of cities) if (!G.lvl(c, 'market')) out.notes.push(`${c.name} has no Market: it can receive goods but not send them`);
    return out;
  };

  // -------------------------------------------------------------------
  // Carrying out a plan
  // -------------------------------------------------------------------
  const dispatch = (s, owner, sh) => {
    const from = s.cities[sh.from], to = s.cities[sh.to];
    if (!from || !to || from.owner !== owner) return null;
    const cargo = {};
    for (const [g, n] of Object.entries(sh.goods)) { const k = Math.min(n, Math.floor(from.res[g] || 0)); if (k > 0) { cargo[g] = k; from.res[g] -= k; } }
    const sent = sum(cargo);
    if (!sent) return null;
    const m = {
      id: G.newId(s, 'm'), owner, type: 'trade', supply: true, leg: 'out', from: from.id, to: to.id,
      fx: from.x, fy: from.y, x: to.x, y: to.y, path: sh.path, naval: !!sh.naval, units: {}, cargo, sent, prio: sh.prio,
      depart: s.time, arrive: s.time + Math.max(15, sh.dur || G.travelTime(s, owner, from, to, 8)),
    };
    s.moves.push(m);
    return m;
  };
  // plan and act: dispatch carts, hurry routes, then the market (player's switches only)
  G.supplyRun = (s, owner, opts = {}) => {
    const o = LS(s, owner);
    const plan = G.supplyPlan(s, owner, opts);
    const emp = s.empires[owner];
    for (const rt of plan.routed) {
      if (!rt.hurry) continue;
      const r = G.routeById(s, rt.route);
      if (r && r.nextAt > s.time) { r.nextAt = s.time; o.stats.routed++; }
    }
    let urgent = null;
    for (const sh of plan.ships) {
      const m = dispatch(s, owner, sh);
      if (!m) continue;
      o.stats.trips++; o.stats.shipped += m.sent;
      const a = s.cities[sh.from], b = s.cities[sh.to];
      logLine(s, o, `${a.name} → ${b.name}: ${goodsText(m.cargo)}${sh.why && sh.why !== 'below target' ? ` (${sh.why})` : ''}${m.naval ? ' by sea' : ''}`);
      if (owner === 'p' && sh.prio >= 85 && !urgent) urgent = `🐪 Supply lines: ${goodsText(m.cargo)} from ${a.name} to ${b.name} (${sh.why}).`;
    }
    if (urgent && !(o.loggedAt > s.time - 120 * paceT(s))) { G.log(s, 'p', urgent, 'info'); o.loggedAt = s.time; }
    // the market (player's realm switches)
    if (owner === 'p' && (o.sell || o.buy)) {
      const wanted = {};
      for (const nd of plan.needs) if (nd.unmet > 0) wanted[nd.g] = true;
      if (o.buy) {
        for (const nd of plan.needs) {
          if (nd.unmet <= 0 || nd.prio < L.buyPrio) continue;
          const c = s.cities[nd.city];
          if (!c || !G.lvl(c, 'market')) continue;
          const room = Math.floor(G.storageCap(s, c) - (c.res[nd.g] || 0));
          const price = G.marketRates(s, c, nd.g).buy;
          const n = Math.floor(Math.min(nd.unmet, room, (emp.gold - o.reserve) / price));
          if (n < 1) continue;
          if (G.trade(s, c.id, nd.g, n, 'buy') === null) {
            o.stats.bought += n; o.stats.spent += n * price; nd.unmet -= n;
            logLine(s, o, `Bought ${n} ${gname(nd.g)} for ${c.name} (${Math.round(n * price)} gold, ${nd.why})`);
          }
        }
      }
      if (o.sell) {
        for (const c of G.citiesOf(s, owner)) {
          if (!G.lvl(c, 'market') || o.excl[c.id]) continue;
          const e = (opts.econ && opts.econ[c.id]) || G.econ(s, c);
          for (const g of movable(s, owner)) {
            if (wanted[g]) continue;
            const res = c.res[g] || 0;
            if (res < e.cap * L.sellAbove || !((e.net[g] || 0) > 0)) continue;
            const n = Math.floor(res - e.cap * L.sellTo);
            if (n < 1) continue;
            const price = G.marketRates(s, c, g).sell;
            if (G.trade(s, c.id, g, n, 'sell') === null) {
              o.stats.sold += n; o.stats.earned += n * price;
              logLine(s, o, `Sold ${n} ${gname(g)} from ${c.name} that had no room (+${Math.round(n * price)} gold)`);
            }
          }
        }
      }
    }
    o.lastPlan = { t: s.time, ships: plan.ships.length, needs: plan.needs.length, unmet: plan.needs.filter(n => n.unmet > 0).length };
    return plan;
  };

  // -------------------------------------------------------------------
  // Arrivals: deliver quietly; a city that changed hands sends the cart home
  // -------------------------------------------------------------------
  const homeOf = (s, m) => { const h = s.cities[m.from]; return h && h.owner === m.owner ? h : G.capital(s, m.owner); };
  const deliver = (s, m) => {
    const o = LS(s, m.owner);
    if (m.leg === 'back') { const h = homeOf(s, m); if (h) G.gain(s, h, m.cargo); return; }
    const to = s.cities[m.to];
    const lost = Math.max(0, (m.sent || 0) - sum(m.cargo));
    if (lost) o.stats.lost += lost;
    if (to && to.owner === m.owner) { G.gain(s, to, m.cargo); return; }
    const h = homeOf(s, m);
    if (!h || !sum(m.cargo)) return;
    if (m.owner === 'p') G.log(s, 'p', `🐪 A supply caravan found ${to ? to.name : 'its destination'} in other hands and turns home.`, 'warn');
    s.moves.push({ id: G.newId(s, 'm'), owner: m.owner, type: 'trade', supply: true, leg: 'back', from: h.id, to: h.id, fx: m.x, fy: m.y, x: h.x, y: h.y,
      units: {}, cargo: m.cargo, sent: sum(m.cargo), depart: s.time, arrive: s.time + G.travelTime(s, m.owner, m, h, 8) });
  };
  const prevTrade = G.moveHandlers.trade;
  G.moveHandlers.trade = (s, m) => {
    if (!m.supply) {
      if (prevTrade) return prevTrade(s, m);
      const t = G.tileAt(s, m.x, m.y), tc = t && t.city && s.cities[t.city];
      if (tc) G.gain(s, tc, m.cargo);
      return;
    }
    try { deliver(s, m); } catch (e) { if (typeof console !== 'undefined') console.error('supply arrival', e); }
  };

  // -------------------------------------------------------------------
  // Ambushes on the road (traderoutes.js only watches route carts)
  // -------------------------------------------------------------------
  const hostileTo = (s, owner, other) => {
    if (owner === other || !other) return false;
    if (owner === 'p') return G.rel(s, other).status === 'war';
    if (other === 'p') return G.rel(s, owner).status === 'war';
    return G.aiRel(s, owner, other).status === 'war';
  };
  const ambushes = (s, dtMin) => {
    const TR = G.TRADE;
    if (!TR || !G.routeAmbush) return;
    let camps = null, armies = null;
    for (const m of s.moves) {
      if (!m.supply || m.ambushed || !sum(m.cargo)) continue;
      if (!camps) {
        camps = Object.values(s.camps || {}).filter(k => (k.units.brigand || 0) > 0);
        armies = s.moves.filter(a => (a.type === 'raid' || a.type === 'attack' || a.type === 'conquer') && G.unitsCount(a.units) > 0);
      }
      const p = G.movePos(s, m);
      let lam = 0;
      const near = [], foes = [];
      for (const k of camps) if (Math.abs(k.x - p.x) <= TR.campRadius && Math.abs(k.y - p.y) <= TR.campRadius && G.dist(k, p) <= TR.campRadius) { near.push(k); lam += TR.campRate * k.tier; }
      for (const a of armies) if (hostileTo(s, m.owner, a.owner) && G.dist(G.movePos(s, a), p) <= TR.campRadius) { foes.push(a); lam += TR.armyRate; }
      if (!lam || Math.random() >= 1 - Math.exp(-lam * dtMin)) continue;
      let x = Math.random() * lam, src = null;
      for (const k of near) { x -= TR.campRate * k.tier; if (x <= 0) { src = { camp: k }; break; } }
      if (!src) src = foes.length ? { army: foes[Math.floor(Math.random() * foes.length)] } : { camp: near[0] };
      try { G.routeAmbush(s, m, src); } catch (e) { if (typeof console !== 'undefined') console.error('supply ambush', e); }
    }
  };

  // -------------------------------------------------------------------
  // Ticks: the player's realm on its own clock; AI realms through the AI hook
  // -------------------------------------------------------------------
  G.slowHooks.push((s, dtMin) => {
    ambushes(s, dtMin);
    const o = s.logistics && s.logistics.p;
    if (!o || !o.on || s.gameOver) return;
    if ((o.next || 0) > s.time) return;
    o.next = s.time + L.every * 60 * paceT(s);
    if (G.citiesOf(s, 'p').length < 2) return;
    G.supplyRun(s, 'p');
  });
  G.aiHooks.push((s, emp) => {
    if (emp.id === 'p' || emp.dead || s.gameOver) return;
    const o = LS(s, emp.id);
    if ((o.next || 0) > s.time) return;
    o.next = s.time + L.aiEvery * 60 * paceT(s) * (0.85 + Math.random() * 0.3);
    if (G.citiesOf(s, emp.id).length < 2) return;
    G.supplyRun(s, emp.id);
    o.log.length = 0;      // AI realms keep no log, only the tallies
  });

  // supply carts out on the road for a realm
  G.supplyInTransit = (s, owner) => s.moves.filter(m => m.supply && m.owner === owner);
})();
