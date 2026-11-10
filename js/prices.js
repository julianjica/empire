// =====================================================================
//  Living market prices. Every good has a world price (a multiplier on
//  its normal market rates, 1 = normal) that drifts toward an equilibrium
//  set by world supply and demand, is pushed by the seasons, wars,
//  calamities and the crisis, and is moved by trades (with price impact,
//  so one huge sale is priced worse than many small ones). Each city then
//  pays a local price: world price × a local factor from its own and its
//  realm's stocks and flows, softened near trade hubs and free cities.
//
//  s.prices = { v, x:{g:log price}, imp:{g:log trade impact}, vel:{g}, you:{g:units, + bought / − sold},
//               oth:{g:units}, eq:{g}, sh:{g:{k:log}}, h:{g:[price×100]}, ht, lim:{buy, sell}, at }
//  (all lazily defaulted, so old saves load; nothing per city is saved)
//
//  Public: G.PRICES, G.prices, G.worldPrice, G.localPrice, G.priceQuote, G.priceWhy, G.priceTrend,
//          G.priceHistory, G.bestMarkets, G.priceValue, G.setPriceLimits, G.priceLimits, G.priceTick,
//          G.priceSample, G.priceGuard, G.priceRegisterCli, G.priceUI (string helpers for the tabs)
// =====================================================================
'use strict';

(() => {
  const P = G.PRICES = {
    min: 0.3, max: 3,                 // world and local prices stay within these multiples of normal
    sampleMin: 1,                     // world supply and demand are re-read every game-minute (× pace)
    half: 24,                         // minutes (× pace) for the price to close half the gap to its target
    velKeep: 0.55, velGain: 0.5,      // momentum: share of last tick's move that carries on
    noise: 0.012,                     // random walk per √minute (log units)
    kFlow: 0.5,                       // equilibrium: (use − production) / (use + production) × kFlow …
    kStock: 0.55, fillEps: 0.08,      // … − ln((stock fill + eps) / (usual fill + eps)) × kStock  (log units)
    kSpill: 0.35, spillFrom: 0.8,     // … − kSpill × (world fill − 0.8) / 0.2 once the world's storehouses overflow (absolute)
    refHalf: 150,                     // 'usual' flows and fills: a slow average with a 2½-hour (× pace) half-life
    eqMax: 0.6,                       // the supply-and-demand term never exceeds ±0.6 (≈ ×0.55 … ×1.8)
    impK: 0.9,                        // trade impact: log move = impK × units / world volume
    volMin: 40,                       // world volume = 40 minutes of world flow …
    volStock: 0.04,                   // … + 4% of world stocks
    volFloor: 600,                    // … and never less than 600 gold's worth of the good
    impHalf: 18,                      // trade impact fades by half every 18 minutes (× pace)
    impMax: 0.8,
    locK: 0.9, locMax: 0.6,           // local impact: log move = locK × units / the city's storage
    floatHalf: 60,                    // goods sold (bought) count as still on (off) the world market for a while (× pace)
    histN: 48, histMin: 5,            // sparkline: the last 48 samples, one every 5 minutes (× pace)
    // local factor: exp(spread × (stock + flow + realm terms)), clamped
    loc: { stock: 0.55, flow: 0.25, realm: 0.3, min: 0.65, max: 1.5, near: 0.45, far: 14 },
    season: {                         // log shocks by season index (spring, summer, autumn, winter)
      grain: [0.04, 0.02, -0.16, 0.24], timber: [0, -0.1, 0.05, 0.22], bread: [0.02, 0, -0.1, 0.15],
    },
    war: { weapons: 0.42, iron: 0.24, ore: 0.08, tools: 0.06, runesteel: 0.15 },   // × share of realms at war (0..1)
    calam: { grain: 0.1, max: 0.3, silt: -0.06, famine: 0.35 },
    crisis: { all: { weapons: 0.2, iron: 0.12 }, winter: { timber: 0.3, grain: 0.15 }, demons: { mana: 0.2 }, deadmarch: { weapons: 0.1 }, wyrmking: { iron: 0.1, tools: 0.1 } },
    lim: { buy: 1.5, sell: 0.6 },     // automation's default price ceiling / floor (× normal, at the city's own price)
    urgentFrac: 0.02, urgentMax: 2.2, // a city with under 2% of its storage left may still buy up to 2.2× normal
    // the AI and governors
    aiBuyMax: 1.6, aiSellMin: 0.55,  // AI realms buy only up to 1.6× normal and sell only above 0.55× (unless spilling / nearly out)
    spikeSell: 1.35, spikeKeep: 0.45, spikeShare: 0.12,   // at 1.35× or more, sell up to 12% of storage, keeping 45%
    aiDip: 0.7, aiDipGold: 2000,      // AI realms with over 2000 gold buy raw goods they burn at 0.7× or less
  };

  const ln = Math.log, ex = Math.exp, clamp = G.clamp;
  const goods = () => DATA.goodOrder.filter(g => DATA.goods[g]);
  const paceT = s => G.pace(s).time;
  const r3 = v => Math.round(v * 1000) / 1000, r5 = v => Math.round(v * 1e5) / 1e5;
  const gname = g => DATA.goods[g].name.toLowerCase();
  const fmtN = n => { n = Math.round(n); return Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(n); };

  // ------------------------------------------------------------------
  // State (compact, lazily defaulted)
  // ------------------------------------------------------------------
  const st = s => {
    let p = s.prices;
    if (!p || typeof p !== 'object') p = s.prices = {};
    if (!p.v) { p.v = 1; }
    for (const k of ['x', 'imp', 'vel', 'you', 'oth', 'fl', 'eq', 'sh', 'h', 'ref']) if (!p[k] || typeof p[k] !== 'object') p[k] = {};
    if (!p.lim || typeof p.lim !== 'object') p.lim = { ...P.lim };
    return p;
  };
  G.prices = st;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

  // ------------------------------------------------------------------
  // Supply and demand: read from the econ each city's step already computed
  // (stepCity calls G.econLean every step; we keep the last answer per city, so sampling costs no econ)
  // ------------------------------------------------------------------
  const LAST = new WeakMap();
  const baseLean = G.econLean;
  G.econLean = (s, city, away) => { const e = baseLean(s, city, away); LAST.set(city, e); return e; };

  // non-saved world aggregates per state
  const AGG = new WeakMap();      // s -> { t, g: {P, U, S, C, V}, realm: {owner: {g: fill}}, city: Map(id -> {flow:{g}}), hub: Map(id -> d), hubKey }
  const hubsOf = s => {
    const out = [];
    for (const mi of Object.values(s.minors || {})) if (!mi.subject) out.push({ x: mi.x, y: mi.y, w: mi.kind === 'merchant' ? 0.6 : 1 });
    for (const c of G.allCities(s)) if (G.lvl(c, 'market') >= 10) out.push({ x: c.x, y: c.y, w: 1 });
    return out;
  };
  const sample = s => {
    const A = AGG.get(s) || { t: -1e9, g: {}, realm: {}, city: new Map(), hub: new Map(), hubKey: '' };
    const gl = goods(), W = {};
    for (const g of gl) W[g] = { P: 0, U: 0, S: 0, C: 0, n: 0, fm: 0 };
    const realm = {};
    for (const c of G.allCities(s)) {
      const e = LAST.get(c);
      if (!e) continue;
      const cap = e.cap || 1, fl = {};
      const R = realm[c.owner] || (realm[c.owner] = {});
      for (const g of gl) {
        const net = num(e.net[g]);
        let pr = num(e.raw[g]);
        for (const r of e.refiners) pr += num(r.out[g]);
        const us = Math.max(0, pr - net);
        const res = num(c.res[g]);
        const w = W[g];
        if (pr > 1e-6 || us > 1e-6 || res > 0.5) {
          const f = Math.min(1, res / cap);
          w.P += pr; w.U += us; w.S += res; w.C += cap; w.n++; w.fm += f;
          const rg = R[g] || (R[g] = [0, 0]); rg[0] += f; rg[1]++;
        }
        fl[g] = (us - pr) / (us + pr + 0.5);
      }
      A.city.set(c.id, { flow: fl, cap });
    }
    // free cities hold stores (no flows): their fill counts toward world stock
    for (const mi of Object.values(s.minors || {})) {
      for (const [g, v] of Object.entries(mi.stores || {})) {
        if (!W[g]) continue;
        const tgt = 400 * (mi.size || 1);
        W[g].S += Math.min(v, tgt * 2) * 0.5; W[g].C += tgt;
      }
    }
    for (const o of Object.keys(realm)) for (const g of gl) { const v = realm[o][g]; realm[o][g] = v && v[1] > 0 ? v[0] / v[1] : undefined; }   // mean city fill in each realm
    const fl = (s.prices && s.prices.fl) || {};
    for (const g of gl) { const w = W[g]; w.fm = w.n ? w.fm / w.n : 0; w.S = Math.max(0, w.S - num(fl[g])); w.V = Math.max(P.volFloor / DATA.goods[g].value, (w.P + w.U) / 2 * P.volMin + w.S * P.volStock); }
    A.g = W; A.realm = realm; A.t = s.time;
    // distances to the nearest hub (re-done when hubs change)
    const hubs = hubsOf(s), key = hubs.length + ':' + G.allCities(s).length + ':' + s.nextId;
    if (key !== A.hubKey) {
      A.hub = new Map(); A.hubKey = key;
      const dist = (c) => { let d = 1e9; for (const h of hubs) { const v = Math.hypot(h.x - c.x, h.y - c.y) * h.w; if (v < d) d = v; } return d; };   // a great market is its own hub (0)
      for (const c of G.allCities(s)) A.hub.set(c.id, dist(c));
      for (const mi of Object.values(s.minors || {})) A.hub.set('mi:' + mi.id, 0);
    }
    // centre the local factors so the average market sits at the world price
    A.vm = {};
    for (const g of gl) {
      if (!W[g].n) continue;
      let sum = 0, n = 0;
      for (const c of G.allCities(s)) { const cc = A.city.get(c.id); if (!cc) continue; sum += localRaw(A, c, cc, g, Math.min(1, num(c.res[g]) / (cc.cap || 1))); n++; }
      A.vm[g] = n ? sum / n : 0;
    }
    AGG.set(s, A);
    return A;
  };
  const agg = s => AGG.get(s) || sample(s);
  G.priceSample = s => sample(s);

  // ------------------------------------------------------------------
  // Equilibrium and shocks (log units)
  // ------------------------------------------------------------------
  // world flow index and stock fill for a good (raw numbers, before comparing them with what is usual)
  const idxOf = (A, g) => {
    const w = A.g[g];
    if (!w || !w.n) return null;
    return [(w.U - w.P) / (w.U + w.P + 1), w.C > 0 ? w.S / w.C : 0, w.fm];
  };
  // equilibrium (log units): how far flows and stocks are from what this world usually sees (p.ref, a slow average),
  // so 'normal' is the realm's own normal: a glut (stocks above usual, output outrunning use) lowers it, scarcity raises it
  const spillOf = fill => fill > P.spillFrom ? P.kSpill * Math.min(1, (fill - P.spillFrom) / (1 - P.spillFrom)) : 0;
  const eqOf = (s, g, A) => {
    const i = idxOf(A, g), ref = (s.prices && s.prices.ref || {})[g];
    if (!i || !ref) return 0;
    const fl = P.kFlow * (i[0] - ref[0]);
    const sk = -P.kStock * ln((i[1] + P.fillEps) / (ref[1] + P.fillEps)) - spillOf(i[1]);
    return clamp(fl + sk, -P.eqMax, P.eqMax);
  };
  const updRef = (s, p, A, dtMin) => {
    const k = 1 - Math.pow(0.5, dtMin / (P.refHalf * paceT(s)));
    for (const g of goods()) {
      const i = idxOf(A, g);
      if (!i) continue;
      const r = p.ref[g];
      if (!Array.isArray(r)) { p.ref[g] = [r5(i[0]), r5(i[1])]; continue; }
      r[0] = r5(r[0] + (i[0] - r[0]) * k); r[1] = r5(r[1] + (i[1] - r[1]) * k);
    }
  };
  const alive = s => Object.values(s.empires).filter(e => !e.dead);
  const wars = s => {
    const al = alive(s).map(e => e.id), set = new Set(al), count = {};
    let pairs = 0;
    const add = (a, b) => { if (!set.has(a) || !set.has(b)) return; pairs++; count[a] = (count[a] || 0) + 1; count[b] = (count[b] || 0) + 1; };
    for (const [id, r] of Object.entries(s.rel || {})) if (r && r.status === 'war') add('p', id);
    for (const [k, r] of Object.entries(s.airel || {})) if (r && r.status === 'war') { const [a, b] = k.split('|'); add(a, b); }
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return { pairs, share: clamp(pairs / Math.max(1, al.length * 0.5), 0, 1), top: top ? top[0] : null };
  };
  const BAD_GRAIN = { blight: 1, flood: 1, swarm: 1, wyrm: 0.6, eruption: 0.6 };
  const shocks = s => {
    const out = {}, why = {};
    const add = (g, k, v, text) => { if (!DATA.goods[g] || !v) return; (out[g] = out[g] || {})[k] = ((out[g] || {})[k] || 0) + v; (why[g] = why[g] || {})[k] = text; };
    const se = G.season(s);
    for (const [g, arr] of Object.entries(P.season)) {
      // blend into the coming season over the last quarter (traders stock up ahead)
      const a = arr[se.index], b = arr[(se.index + 1) % 4], f = se.progress > 0.75 ? (se.progress - 0.75) / 0.25 * 0.5 : 0;
      const v = a + (b - a) * f;
      const nm = G.SEASONS[se.index].toLowerCase();
      add(g, 'season', v, v > 0 ? `${nm} demand` : `${nm} plenty`);
    }
    const W = wars(s);
    if (W.share > 0) {
      const who = W.top && s.empires[W.top] ? (W.top === 'p' ? 'your wars' : `${s.empires[W.top].name} wars`) : 'wars';
      for (const [g, v] of Object.entries(P.war)) add(g, 'war', v * W.share, who);
    }
    const now = s.time;
    let cal = 0, silt = 0;
    for (const c of s.calamities || []) {
      if (!(c.end > now) || !(c.start <= now)) continue;
      if (BAD_GRAIN[c.kind]) cal += P.calam.grain * BAD_GRAIN[c.kind];
      if (c.kind === 'silt' || c.kind === 'feybloom') silt += P.calam.silt;
    }
    if (cal) add('grain', 'calamity', Math.min(P.calam.max, cal), 'blights and floods');
    if (silt) add('grain', 'silt', silt, 'rich silt');
    const all = G.allCities(s);
    if (all.length) {
      let starving = 0;
      for (const c of all) if (c.starving) starving++;
      if (starving) add('grain', 'famine', P.calam.famine * Math.min(1, starving / all.length * 3), `famine in ${starving} cit${starving > 1 ? 'ies' : 'y'}`);
    }
    if (s.crisis && s.crisis.status === 'active') {
      const nm = ((DATA.crises || {})[s.crisis.kind] || {}).name || 'the crisis';
      for (const [g, v] of Object.entries(P.crisis.all)) add(g, 'crisis', v, nm);
      for (const [g, v] of Object.entries(P.crisis[s.crisis.kind] || {})) add(g, 'crisis', v, nm);
    }
    return { out, why };
  };

  // ------------------------------------------------------------------
  // World and local prices
  // ------------------------------------------------------------------
  const worldLog = (p, g) => num(p.x[g]) + num(p.imp[g]);
  G.worldPrice = (s, g) => { const p = s.prices; if (!p || !p.x) return 1; return clamp(ex(worldLog(p, g)), P.min, P.max); };
  const isMinor = place => !!(place && place.owner === undefined && place.stores);
  // this city against the world, before centring: fuller than the average market → cheaper, making less than it uses → dearer,
  // its realm short → dearer; all of it softened near trade hubs and free cities (spread)
  const localRaw = (A, city, c, g, fill) => {
    const L = P.loc, i = idxOf(A, g), rf = (A.realm[city.owner] || {})[g], d = A.hub.get(city.id);
    const spread = L.near + (1 - L.near) * Math.min(1, (d === undefined ? L.far : d) / L.far);
    return spread * (L.stock * (i[2] - fill) + L.flow * (num(c.flow[g]) - i[0]) + L.realm * (i[2] - (rf === undefined ? i[2] : rf)));
  };
  // local factor: this city against the world (stock vs storage, net output, its realm's stocks), softened near hubs,
  // plus the lingering impact of trades made here (p.li)
  const localFactor = (s, place, g) => {
    if (!place) return 1;
    const A = AGG.get(s), L = P.loc;
    if (isMinor(place)) {                                     // a free city: its stores against what it likes to hold
      const tgt = 400 * (place.size || 1), fill = Math.min(2, num(place.stores[g]) / tgt);
      return clamp(ex(L.near * L.stock * 2 * (0.5 - fill * 0.5)), L.min, L.max);
    }
    const li = s.prices && s.prices.li && s.prices.li[place.id];
    const imp = li ? num(li[g]) : 0;
    const c = A && A.city.get(place.id);
    if (!c || !A.g[g] || !A.g[g].n) return clamp(ex(imp), L.min, L.max);
    return clamp(ex(localRaw(A, place, c, g, Math.min(1, num(place.res[g]) / (c.cap || 1))) - num(A.vm[g]) + imp), L.min, L.max);
  };
  G.localFactor = localFactor;
  G.localPrice = (s, place, g) => clamp(G.worldPrice(s, g) * localFactor(s, place, g), P.min, P.max);
  // what goods are worth at a place at today's prices (normal value × local price); free cities pay caravans with it
  G.priceValue = (s, place, goodsObj) => {
    let v = 0;
    for (const [g, n] of Object.entries(goodsObj || {})) if (DATA.goods[g] && n > 0) v += n * DATA.goods[g].value * (s.prices ? G.localPrice(s, place, g) : 1);
    return v;
  };

  // ------------------------------------------------------------------
  // Trades: impact along the trade (diminishing returns), quoted = executed
  //   world move  = impK × n / world volume       (fades with impHalf)
  //   local move  = locK × n / this city's storage (fades with impHalf)
  // ------------------------------------------------------------------
  const volume = (s, g) => { const A = agg(s), w = A.g[g]; return w ? w.V : P.volFloor / DATA.goods[g].value; };
  const impacts = (s, city, g, n) => {
    const dw = Math.min(P.impMax, P.impK * n / volume(s, g));
    const dl = Math.min(P.locMax, P.locK * n / Math.max(200, G.storageCap(s, city)));
    return { dw, dl, d: dw + dl };
  };
  // average multiplier over a trade that starts at m0 and walks the price by d (log units), clamped to [min,max]
  const avgWalk = (m0, d, sign) => {
    if (!(d > 1e-9)) return m0;
    const K = 16; let a = 0;
    for (let i = 0; i < K; i++) a += clamp(m0 * ex(sign * d * (i + 0.5) / K), P.min, P.max);
    return a / K;
  };
  const baseRates = G.marketRates;
  // the normal rates (price 1×), for 'vs normal'
  G.normalRates = (s, city, good) => baseRates(s, city, good);
  G.marketRates = (s, city, good) => {
    const r = baseRates(s, city, good);
    if (!s.prices || !DATA.goods[good]) return r;
    const m = G.localPrice(s, city, good);
    return { sell: r.sell * m, buy: r.buy * m, m, normal: r };
  };
  // the expected average price (per unit) of trading n units now, including impact; G.trade executes exactly this
  G.priceQuote = (s, city, good, n, dir) => {
    n = Math.floor(n);
    const r = baseRates(s, city, good), base = dir === 'sell' ? r.sell : r.buy;
    const m0 = s.prices ? G.localPrice(s, city, good) : 1;
    if (!(n > 0) || !s.prices) return { each: base * m0, total: base * m0 * Math.max(0, n), m0, mAvg: m0, mEnd: m0, d: 0, dw: 0, dl: 0, normal: base };
    const im = impacts(s, city, good, n), sign = dir === 'sell' ? -1 : 1;
    const mAvg = avgWalk(m0, im.d, sign);
    const each = base * mAvg;
    return { each, total: each * n, m0, mAvg, mEnd: clamp(m0 * ex(sign * im.d), P.min, P.max), d: im.d, dw: im.dw, dl: im.dl, normal: base };
  };

  // guards: automation, governors and the AI trade under a price ceiling / floor (× normal)
  let GUARD = null;
  G.priceGuard = (guard, fn) => { const prev = GUARD; GUARD = guard; try { return fn(); } finally { GUARD = prev; } };
  G.priceLimits = s => { const l = st(s).lim; return { buy: num(l.buy) || P.lim.buy, sell: num(l.sell) || 0 }; };
  G.setPriceLimits = (s, o = {}) => {
    const l = st(s).lim;
    if (o.buy !== undefined) { const v = +o.buy; if (!(v >= 1 && v <= P.max)) return `The ceiling must be between 1 and ${P.max}× normal`; l.buy = Math.round(v * 100) / 100; }
    if (o.sell !== undefined) { const v = +o.sell; if (!(v >= 0 && v <= 1)) return 'The floor must be between 0 and 1× normal'; l.sell = Math.round(v * 100) / 100; }
    return null;
  };
  const guardSays = (s, city, good, dir) => {
    // the AI realms trade under their own limits unless a caller set a guard
    const gd = GUARD || (city.owner !== 'p' ? { buyMax: P.aiBuyMax, sellMin: P.aiSellMin, ai: true } : null);
    if (!gd || (gd.owner && gd.owner !== city.owner)) return null;
    const m = G.localPrice(s, city, good), cap = G.storageCap(s, city), res = num(city.res[good]);
    if (dir === 'buy' && gd.buyMax && m > gd.buyMax + 1e-9) {
      const urgent = res < cap * P.urgentFrac && m <= Math.max(gd.buyMax, P.urgentMax);
      if (!urgent) return `${DATA.goods[good].name} costs ${m.toFixed(2)}× normal here, above the ceiling of ${gd.buyMax.toFixed(2)}×`;
    }
    if (dir === 'sell' && gd.sellMin && m < gd.sellMin - 1e-9 && res < cap * 0.97) return `${DATA.goods[good].name} fetches only ${m.toFixed(2)}× normal here, below the floor of ${gd.sellMin.toFixed(2)}×`;
    return null;
  };

  const baseTrade = G.trade;
  G.trade = (s, cityId, good, amount, dir) => {
    const city = s.cities[cityId];
    if (!city || !s.prices || !DATA.goods[good]) return baseTrade(s, cityId, good, amount, dir);
    if (G.lvl(city, 'market') < 1) return 'Build a Market first';
    const n = Math.floor(amount);
    if (!(n > 0)) return 'Enter an amount';
    const g0 = guardSays(s, city, good, dir);
    if (g0) return g0;
    const q = G.priceQuote(s, city, good, n, dir);
    const emp = s.empires[city.owner];
    if (dir === 'sell') {
      if (num(city.res[good]) < n) return 'Not enough ' + DATA.goods[good].name;
      city.res[good] -= n; emp.gold += q.total;
    } else {
      if (emp.gold < q.total) return 'Not enough gold';
      if (num(city.res[good]) + n > G.storageCap(s, city)) return 'Not enough storage';
      emp.gold -= q.total; city.res[good] = num(city.res[good]) + n;
    }
    if (city.owner === 'p') s.stats.traded = (s.stats.traded || 0) + n;
    // the trade moves the world price and this city's, and is remembered for 'why'
    const p = st(s), sign = dir === 'sell' ? -1 : 1;
    p.imp[good] = r5(clamp(num(p.imp[good]) + sign * q.dw, -P.impMax, P.impMax));
    const li = p.li || (p.li = {}), lc = li[city.id] || (li[city.id] = {});
    lc[good] = r5(clamp(num(lc[good]) + sign * q.dl, -P.locMax, P.locMax));
    const who = city.owner === 'p' ? 'you' : 'oth';
    p[who][good] = Math.round(num(p[who][good]) + sign * n);
    p.fl[good] = Math.round(num(p.fl[good]) + sign * n);
    return null;
  };

  // ------------------------------------------------------------------
  // The tick: sample supply and demand, relax toward the target, decay impact, record history
  // ------------------------------------------------------------------
  const rndN = () => { let a = 0; for (let i = 0; i < 3; i++) a += Math.random() - 0.5; return a * 2; };   // ~N(0, 1)
  G.priceTick = (s, dtMin) => {
    if (!(dtMin > 0) || !s.empires) return;
    const p = st(s), pt = paceT(s);
    const A0 = AGG.get(s);
    const t0 = A0 ? A0.t : null;
    const fresh = !A0 || s.time - t0 >= P.sampleMin * 60 * pt || s.time < t0;
    const A = fresh ? sample(s) : A0;
    if (fresh) updRef(s, p, A, t0 !== null && s.time > t0 ? Math.min(60 * pt, (s.time - t0) / 60) : dtMin);
    const S = shocks(s);
    const k = 1 - Math.pow(0.5, dtMin / (P.half * pt));
    const kImp = Math.pow(0.5, dtMin / (P.impHalf * pt)), kFl = Math.pow(0.5, dtMin / (P.floatHalf * pt));
    const nz = P.noise * Math.sqrt(dtMin / pt);
    for (const g of goods()) {
      const eq = eqOf(s, g, A);
      const shk = S.out[g] || {};
      let tgt = eq; for (const v of Object.values(shk)) tgt += v;
      const x = num(p.x[g]);
      const step = (tgt - x) * k;
      const vel = num(p.vel[g]) * Math.pow(P.velKeep, dtMin / pt) + step * P.velGain * (1 - Math.pow(P.velKeep, dtMin / pt));
      let nx = x + step + vel + nz * rndN();
      nx = clamp(nx, ln(P.min), ln(P.max));
      p.x[g] = r5(nx); p.vel[g] = r5(vel); p.eq[g] = r3(eq);
      const sh = {}; for (const [kk, v] of Object.entries(shk)) if (Math.abs(v) > 0.004) sh[kk] = [r3(v), S.why[g][kk]];
      if (Object.keys(sh).length) p.sh[g] = sh; else delete p.sh[g];
      if (p.imp[g]) { const v = num(p.imp[g]) * kImp; if (Math.abs(v) < 0.002) delete p.imp[g]; else p.imp[g] = r5(v); }
      for (const who of ['you', 'oth']) if (p[who][g]) { const v = num(p[who][g]) * kImp; if (Math.abs(v) < 1) delete p[who][g]; else p[who][g] = Math.round(v); }
      if (p.fl[g]) { const v = num(p.fl[g]) * kFl; if (Math.abs(v) < 1) delete p.fl[g]; else p.fl[g] = Math.round(v); }
    }
    if (p.li) for (const [cid, o] of Object.entries(p.li)) {
      if (!s.cities[cid]) { delete p.li[cid]; continue; }
      for (const g of Object.keys(o)) { const v = num(o[g]) * kImp; if (Math.abs(v) < 0.002) delete o[g]; else o[g] = r5(v); }
      if (!Object.keys(o).length) delete p.li[cid];
    }
    if (typeof p.ht !== 'number' || p.ht > s.time || s.time - p.ht >= P.histMin * 60 * pt) {
      p.ht = s.time;
      for (const g of goods()) {
        const h = Array.isArray(p.h[g]) ? p.h[g] : (p.h[g] = []);
        h.push(Math.round(G.worldPrice(s, g) * 100));
        if (h.length > P.histN) h.splice(0, h.length - P.histN);
      }
    }
  };
  // ------------------------------------------------------------------
  // Explaining prices: history, trend, why, best markets
  // ------------------------------------------------------------------
  G.priceHistory = (s, g) => ((s.prices && s.prices.h && s.prices.h[g]) || []).map(v => v / 100);
  G.priceTrend = (s, g) => {
    const h = G.priceHistory(s, g), now = G.worldPrice(s, g);
    const back = h.length > 3 ? h[h.length - 4] : h.length ? h[0] : now;
    const ch = back > 0 ? now / back - 1 : 0;
    return { dir: ch > 0.03 ? 1 : ch < -0.03 ? -1 : 0, change: ch, arrow: ch > 0.03 ? '▲' : ch < -0.03 ? '▼' : '▬' };
  };
  const pctOf = d => Math.round((ex(d) - 1) * 100);
  // the reasons behind a good's world price, biggest first: [{ text, d (log), pct }]
  G.priceWhy = (s, g) => {
    const p = s.prices;
    if (!p || !p.x) return [];
    const out = [];
    const A = AGG.get(s), i = A && idxOf(A, g), ref = p.ref && p.ref[g];
    if (i && ref) {
      const fl = P.kFlow * (i[0] - ref[0]), sk = -P.kStock * ln((i[1] + P.fillEps) / (ref[1] + P.fillEps)) - spillOf(i[1]);
      if (Math.abs(sk) >= 0.02) out.push({ text: sk > 0 ? 'thin stocks across the world' : 'full storehouses across the world', d: sk });
      if (Math.abs(fl) >= 0.02) out.push({ text: fl > 0 ? 'use outrunning output' : 'output outrunning use', d: fl });
    }
    for (const v of Object.values(p.sh[g] || {})) out.push({ text: v[1], d: v[0] });
    const imp = num(p.imp[g]);
    if (Math.abs(imp) >= 0.01) {
      const you = num(p.you[g]), oth = num(p.oth[g]);
      const mine = Math.abs(you) >= Math.abs(oth) && you !== 0;
      const n = mine ? you : oth;
      out.push({ text: mine ? `you ${n < 0 ? 'sold' : 'bought'} ${fmtN(Math.abs(n))} ${gname(g)}` : `${n < 0 ? 'other realms sold' : 'other realms bought'} ${fmtN(Math.abs(n))}`, d: imp });
    }
    const drift = num(p.x[g]) - num(p.eq[g]) - Object.values(p.sh[g] || {}).reduce((a, v) => a + v[0], 0);
    if (Math.abs(drift) >= 0.04) out.push({ text: drift > 0 ? 'settling down after a rise' : 'still climbing toward its level', d: drift });
    for (const o of out) o.pct = pctOf(o.d);
    return out.filter(o => o.text && Math.abs(o.pct) >= 1).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  };
  // where to sell (dir 'sell': who pays most) or buy (who charges least): your market cities, and for selling,
  // merchant republics, which pay caravans by the goods' worth there (× the share they pay)
  G.bestMarkets = (s, owner, g, dir = 'sell', n = 3) => {
    const out = [];
    for (const c of G.citiesOf(s, owner)) {
      if (G.lvl(c, 'market') < 1) continue;
      const r = G.marketRates(s, c, g);
      out.push({ kind: 'city', id: c.id, name: c.name, each: dir === 'sell' ? r.sell : r.buy, m: r.m || 1 });
    }
    if (dir === 'sell' && G.minorsList) {
      const share = (G.TRADE && G.TRADE.minorGoodsPay) || 0.5;
      for (const mi of G.minorsList(s)) {
        if (mi.kind !== 'merchant' || mi.subject || (owner === 'p' && !s.explored[mi.y * s.map + mi.x])) continue;
        const m = G.localPrice(s, mi, g);
        out.push({ kind: 'minor', id: mi.id, name: mi.name, each: DATA.goods[g].value * m * share, m, caravan: true });
      }
    }
    out.sort((a, b) => dir === 'sell' ? b.each - a.each : a.each - b.each);
    return out.slice(0, n);
  };

  // ------------------------------------------------------------------
  // Everyone reacts: automation and logistics trade under the player's ceiling / floor, governors too
  // (and sell into spikes); the AI has its own limits (in G.trade) and sells into spikes, buys dips
  // ------------------------------------------------------------------
  const playerGuard = s => { const l = G.priceLimits(s); return { owner: 'p', buyMax: l.buy, sellMin: l.sell }; };
  const guarded = (fn, test) => { if (!fn || fn._priced) return fn; const w = function (s, ...a) { return s && s.prices && (!test || test(s, ...a)) ? G.priceGuard(playerGuard(s), () => fn.call(this, s, ...a)) : fn.call(this, s, ...a); }; w._priced = true; return w; };
  const installLate = () => {
    if (G.supplyRun && !G.supplyRun._priced) G.supplyRun = guarded(G.supplyRun, (s, owner) => owner === 'p');
    if (G.autoTick && !G.autoTick._priced) G.autoTick = guarded(G.autoTick);
    if (G.autoRun && !G.autoRun._priced) G.autoRun = guarded(G.autoRun);
    if (G.councilGovern && !G.councilGovern._priced) {
      const base = G.councilGovern;
      G.councilGovern = s => { if (!s.prices) return base(s); G.priceGuard(playerGuard(s), () => base(s)); govSpikes(s); };
      G.councilGovern._priced = true;
    }
    if (G.minorRouteQuote && !G.minorRouteQuote._priced) {
      const base = G.minorRouteQuote;
      G.minorRouteQuote = (s, from, mi, give) => {
        const q = base(s, from, mi, give);
        if (!s.prices || !mi || mi.kind !== 'merchant' || !q) return q;
        const pay = Math.round(G.priceValue(s, mi, give) * ((G.TRADE && G.TRADE.minorGoodsPay) || 0.5));
        return { ...q, gold: q.gold - (q.goodsPay || 0) + pay, goodsPay: pay };
      };
      G.minorRouteQuote._priced = true;
    }
    if (G.routeQuote && !G.routeQuote._priced) {
      const base = G.routeQuote;
      // a foreign partner weighs what it gets and what it gives at its own city's prices
      G.routeQuote = (s, from, to, give, n, take) => {
        const q = base(s, from, to, give, n, take);
        if (!s.prices || !q || !to || !DATA.goods[give] || !DATA.goods[take]) return q;
        const f = G.localPrice(s, to, give) / G.localPrice(s, to, take);
        return { ...q, take: Math.floor(n * DATA.goods[give].value / DATA.goods[take].value * q.factor * f), price: f };
      };
      G.routeQuote._priced = true;
    }
    return true;
  };
  G.priceInstall = installLate;
  installLate();

  const SPIKE_GOODS = ['grain', 'timber', 'stone', 'ore', 'iron', 'tools', 'weapons'];
  // sell part of what a city holds above spikeKeep of its storage, for goods it makes more of than it uses, while dear
  const spikeSales = (s, city, e, guard) => {
    const sold = [];
    if (!e || G.lvl(city, 'market') < 1) return sold;
    const cap = e.cap || G.storageCap(s, city);
    for (const g of SPIKE_GOODS) {
      if (!DATA.goods[g] || (city.short && city.short[g]) || !(num(e.net[g]) > 0)) continue;
      const res = num(city.res[g]);
      if (res < cap * (P.spikeKeep + 0.05) || G.localPrice(s, city, g) < P.spikeSell) continue;
      const n = Math.floor(Math.min(cap * P.spikeShare, res - cap * P.spikeKeep));
      if (n < 10) continue;
      const before = s.empires[city.owner].gold;
      if ((guard ? G.priceGuard(guard, () => G.trade(s, city.id, g, n, 'sell')) : G.trade(s, city.id, g, n, 'sell')) === null) sold.push([g, n, s.empires[city.owner].gold - before]);
    }
    return sold;
  };
  const govSpikes = s => {
    const gov = s.council && s.council.gov;
    if (!gov) return;
    for (const [cid, g] of Object.entries(gov)) {
      const city = s.cities[cid];
      if (!city || !g.on || city.owner !== 'p' || g.market === false || G.lvl(city, 'market') < 1) continue;
      if ((g.pxAt || 0) > s.time) continue;
      g.pxAt = s.time + 120 * paceT(s);
      const sold = spikeSales(s, city, LAST.get(city), playerGuard(s));
      if (!sold.length) continue;
      g.log = g.log || [];
      g.log.unshift({ t: s.time, text: `Sold ${sold.map(([gd, n]) => fmtN(n) + ' ' + gname(gd)).join(', ')} into high prices (+${fmtN(sold.reduce((a, x) => a + x[2], 0))} gold)` });
      if (g.log.length > 12) g.log.length = 12;
    }
  };
  // AI realms: sell into spikes, and buy the raw goods they burn when cheap and the treasury is full
  G.aiHooks.push((s, emp) => {
    if (emp.id === 'p' || emp.dead || !s.prices || (emp.pxAt || 0) > s.time) return;
    emp.pxAt = s.time + 90 * paceT(s);
    for (const city of G.citiesOf(s, emp.id)) {
      if (G.lvl(city, 'market') < 1) continue;
      const e = LAST.get(city);
      spikeSales(s, city, e, null);
      if (!e || emp.gold < P.aiDipGold) continue;
      for (const g of ['grain', 'timber', 'stone']) {
        const res = num(city.res[g]);
        if (res > e.cap * 0.3 || !(num(e.use[g]) > 0) || G.localPrice(s, city, g) > P.aiDip) continue;
        const n = Math.floor(Math.min(e.cap * 0.1, (emp.gold - P.aiDipGold) / 4 / Math.max(0.01, G.marketRates(s, city, g).buy)));
        if (n >= 10) G.trade(s, city.id, g, n, 'buy');
      }
    }
  });

  // ------------------------------------------------------------------
  // Console: prices [good]
  // ------------------------------------------------------------------
  const SPARK = '▁▂▃▄▅▆▇█';
  const sparkText = h => { if (!h.length) return ''; const lo = Math.min(...h), hi = Math.max(...h); return h.map(v => SPARK[hi - lo < 1e-9 ? 3 : Math.round((v - lo) / (hi - lo) * 7)]).join(''); };
  G.priceSpark = sparkText;
  const cliCmds = () => [
    { name: 'prices', aliases: ['price'], group: 'Economy', usage: 'prices [good] [in city]', help: 'World and local market prices: trend, why they moved, the best markets.', tab: 'market',
      ex: ['prices', 'prices grain', 'prices iron in Oakford'],
      run(s, owner, a, ctx) {
        const t = (a.tokens || []).slice();
        const ii = t.findIndex(x => /^in$/i.test(x));
        let city = null;
        if (ii >= 0) { const nm = t.splice(ii).slice(1).join(' ').toLowerCase(); city = G.citiesOf(s, owner).find(c => c.name.toLowerCase().startsWith(nm)); if (!city) return { ok: false, err: `No city of yours called '${nm}'.` }; }
        city = city || (ctx && ctx.city && s.cities[ctx.city] && s.cities[ctx.city].owner === owner ? s.cities[ctx.city] : null) || G.capital(s, owner);
        const vis = DATA.goodOrder.filter(g => DATA.goods[g] && (!DATA.goods[g].race || DATA.goods[g].race === s.empires[owner].race));
        const q = t.join(' ').toLowerCase().trim();
        if (!q) {
          const rows = vis.map(g => {
            const w = G.worldPrice(s, g), tr = G.priceTrend(s, g), why = G.priceWhy(s, g)[0];
            const loc = city ? G.localPrice(s, city, g) : w;
            return `  ${(DATA.goods[g].name).padEnd(10)} ×${w.toFixed(2)} ${tr.arrow}  here ×${loc.toFixed(2)}  ${sparkText(G.priceHistory(s, g).slice(-16))}  ${why ? why.text + ' ' + (why.pct > 0 ? '+' : '') + why.pct + '%' : ''}`;
          });
          return { out: [`Market prices (× normal; here = ${city ? city.name : '—'}):`, ...rows, 'prices <good> for the reasons and the best markets.'], nav: { tab: 'market' } };
        }
        const g = vis.find(x => x === q || DATA.goods[x].name.toLowerCase() === q) || vis.find(x => DATA.goods[x].name.toLowerCase().startsWith(q));
        if (!g) return { ok: false, err: `No good called '${q}'. Goods: ${vis.map(x => DATA.goods[x].name.toLowerCase()).join(', ')}` };
        const nm = DATA.goods[g].name, w = G.worldPrice(s, g), tr = G.priceTrend(s, g);
        const lines = [`${DATA.goods[g].icon} ${nm}: world ×${w.toFixed(2)} ${tr.arrow} (${tr.change >= 0 ? '+' : ''}${Math.round(tr.change * 100)}% lately)  ${sparkText(G.priceHistory(s, g))}`];
        for (const y of G.priceWhy(s, g)) lines.push(`  ${y.pct > 0 ? '+' : ''}${y.pct}%  ${y.text}`);
        if (city && G.lvl(city, 'market')) {
          const r = G.marketRates(s, city, g), q1 = G.priceQuote(s, city, g, 1000, 'sell'), q2 = G.priceQuote(s, city, g, 1000, 'buy');
          lines.push(`In ${city.name}: ×${(r.m || 1).toFixed(2)} · sell ${r.sell.toFixed(2)} · buy ${r.buy.toFixed(2)} gold each (1,000 at once: sell ${q1.each.toFixed(2)}, buy ${q2.each.toFixed(2)})`);
        }
        const bs = G.bestMarkets(s, owner, g, 'sell'), bb = G.bestMarkets(s, owner, g, 'buy');
        if (bs.length) lines.push('Best to sell: ' + bs.map(b => `${b.kind === 'minor' ? '🏰 ' : ''}${b.name} ${b.each.toFixed(2)}${b.caravan ? ' (by caravan)' : ''}`).join(' · '));
        if (bb.length) lines.push('Cheapest to buy: ' + bb.map(b => `${b.name} ${b.each.toFixed(2)}`).join(' · '));
        const l = G.priceLimits(s);
        lines.push(`Automation buys only up to ×${l.buy.toFixed(2)} and sells only above ×${l.sell.toFixed(2)} (pricelimit <buy> <sell>).`);
        return { out: lines, nav: { tab: 'market' } };
      } },
  ];
  // 'prices limit 1.6 0.7' sets the automation ceiling and floor
  const limitCmd = { name: 'pricelimit', aliases: ['pricelimits'], group: 'Economy', usage: 'pricelimit <buy ceiling> [sell floor]', help: 'Automation, supply lines and governors buy only below the ceiling and sell only above the floor (× normal).', tab: 'market',
    ex: ['pricelimit 1.5 0.75'],
    run(s, owner, a) {
      const t = a.tokens || [];
      if (!t.length) { const l = G.priceLimits(s); return [`Ceiling ×${l.buy.toFixed(2)}, floor ×${l.sell.toFixed(2)}.`]; }
      const e = G.setPriceLimits(s, { buy: t[0], ...(t[1] !== undefined ? { sell: t[1] } : {}) });
      if (e) return { ok: false, err: e };
      const l = G.priceLimits(s); return [`Automation now buys up to ×${l.buy.toFixed(2)} and sells above ×${l.sell.toFixed(2)}.`];
    } };
  let cliDone = false;
  G.priceRegisterCli = () => {
    if (!G.cli || !Array.isArray(G.cli.commands)) return false;
    for (const c of [...cliCmds(), limitCmd]) if (!G.cli.commands.some(x => x.name === c.name)) G.cli.commands.push(c);
    return true;
  };
  G.slowHooks.push((s, dtMin) => { if (!cliDone && G.cli) cliDone = G.priceRegisterCli(); installLate(); G.priceTick(s, dtMin); });
  G.newGameHooks.push(s => { st(s); });
})();

// =====================================================================
//  Prices in the interface (string helpers the tabs call; the Prices card, help and glossary are
//  added once ui-core.js has loaded). No DOM work at load time, so the engine tests can load this file.
// =====================================================================
(() => {
  const P = G.PRICES;
  const e = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cls = m => m >= 1.15 ? 'px-hi' : m <= 0.87 ? 'px-lo' : 'px-mid';
  const pct = m => `${m >= 1 ? '+' : '−'}${Math.abs(Math.round((m - 1) * 100))}%`;
  const spark = (h, w = 72, ht = 18) => {
    if (h.length < 2) return '<span class="px-spark muted">—</span>';
    const lo = Math.min(...h, 0.95), hi = Math.max(...h, 1.05), y = v => (ht - 2) - (v - lo) / (hi - lo) * (ht - 4);
    const pts = h.map((v, i) => `${(i / (h.length - 1) * (w - 2) + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<svg class="px-spark" viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${w}" y1="${y(1).toFixed(1)}" y2="${y(1).toFixed(1)}" class="px-base"/><polyline points="${pts}" class="px-line"/></svg>`;
  };
  const amountOf = (S, g) => { const v = parseInt((typeof UI !== 'undefined' && UI.form && UI.form['mkt_' + g]) || 100, 10); return v > 0 ? v : 0; };
  const quote = (S, city, g, n) => {
    if (!S.prices || !(n > 0)) return '';
    const qs = G.priceQuote(S, city, g, n, 'sell'), qb = G.priceQuote(S, city, g, n, 'buy');
    const imp = qs.m0 > 0 ? 1 - qs.mAvg / qs.m0 : 0;
    return `≈ sell 🪙 ${qs.each.toFixed(2)} · buy 🪙 ${qb.each.toFixed(2)} each${imp >= 0.01 ? ` <span class="muted">(${Math.round(imp * 100)}% price impact)</span>` : ''}`;
  };
  const cell = (S, city, g) => {
    install();
    if (!S.prices) return '';
    const m = G.localPrice(S, city, g), t = G.priceTrend(S, g);
    return `<span class="px-chip ${cls(m)}" title="Here ${m.toFixed(2)}× normal · world ${G.worldPrice(S, g).toFixed(2)}×">×${m.toFixed(2)} ${t.arrow}</span>`;
  };
  const tip = (S, city, g) => {
    if (!S.prices || g === 'gold' || !DATA.goods[g] || !city) return '';
    const m = G.localPrice(S, city, g), w = G.worldPrice(S, g), t = G.priceTrend(S, g), why = G.priceWhy(S, g).slice(0, 2);
    const r = G.lvl(city, 'market') ? G.marketRates(S, city, g) : null;
    return `<div class="rt-price"><span class="muted">Market price here:</span> <b class="${cls(m)}">×${m.toFixed(2)}</b> ${t.arrow} <span class="muted">(world ×${w.toFixed(2)})</span>${r ? ` · sell ${r.sell.toFixed(2)} / buy ${r.buy.toFixed(2)}` : ' · <span class="muted">no Market here</span>'}${why.length ? `<div class="muted">${why.map(y => e(y.text) + ' ' + (y.pct > 0 ? '+' : '') + y.pct + '%').join(' · ')}</div>` : ''}</div>`;
  };
  let install = () => {};
  const card = city => {
    if (typeof S === 'undefined' || !S || !S.prices) return '';
    const goods = (typeof visibleGoods === 'function' ? visibleGoods() : DATA.goodOrder).filter(g => DATA.goods[g]);
    const multi = G.bestMarkets(S, 'p', 'grain', 'sell', 2).length > 1;
    const rows = goods.map(g => {
      const w = G.worldPrice(S, g), m = G.lvl(city, 'market') ? G.localPrice(S, city, g) : w, t = G.priceTrend(S, g), why = G.priceWhy(S, g).slice(0, 2);
      let best = '';
      if (multi) {
        const bs = G.bestMarkets(S, 'p', g, 'sell', 1)[0], bb = G.bestMarkets(S, 'p', g, 'buy', 1)[0];
        best = `<div class="px-best muted">${bs ? `Sell: ${bs.kind === 'minor' ? '🏰 ' : ''}${e(bs.name)} ${bs.each.toFixed(2)}${bs.caravan ? ' by caravan' : ''}` : ''}${bb ? ` · Buy: ${e(bb.name)} ${bb.each.toFixed(2)}` : ''}</div>`;
      }
      return `<div class="px-row"><div class="px-g">${DATA.goods[g].icon} ${e(DATA.goods[g].name)}</div>
        <div class="px-p"><b class="${cls(w)}" title="World price vs normal">×${w.toFixed(2)}</b> <span class="px-t ${t.dir > 0 ? 'px-hi' : t.dir < 0 ? 'px-lo' : 'muted'}" title="Trend over the last quarter hour">${t.arrow}</span>${Math.abs(m - w) > 0.02 ? ` <span class="muted" title="Price in ${e(city.name)}">here ×${m.toFixed(2)}</span>` : ''}</div>
        <div class="px-s">${spark(G.priceHistory(S, g))}</div>
        <div class="px-w">${why.length ? why.map(y => `<span class="${y.pct > 0 ? 'px-hi' : 'px-lo'}">${e(y.text)} ${y.pct > 0 ? '+' : ''}${y.pct}%</span>`).join(' · ') : '<span class="muted">steady</span>'}${best}</div></div>`;
    }).join('');
    const l = G.priceLimits(S);
    return `<div class="card px-card"><h3>📈 Prices <span class="muted" style="font-size:13px">× normal</span></h3>
      <p class="muted px-sub">Prices follow world supply and demand, the seasons, wars and calamities, and your own trades: a big sale lowers the price as it goes (so it pays less per unit than small ones), then the market recovers. Each city's price also depends on its own stocks and its realm's, less so near free cities and great markets.</p>
      <div class="px-list">${rows}</div>
      <div class="px-lim row"><span>Automation, supply lines and governors buy only up to</span>
        <input type="number" min="1" max="3" step="0.05" data-k="pxBuy" value="${e(UI.form.pxBuy || l.buy)}" aria-label="Price ceiling for automatic buying">×
        <span>and sell only above</span><input type="number" min="0" max="1" step="0.05" data-k="pxSell" value="${e(UI.form.pxSell || l.sell)}" aria-label="Price floor for automatic selling">×
        <button class="small" data-act="pxLimits">Set</button></div></div>`;
  };
  G.priceUI = { cell, quote, tip, card, spark, amountOf };

  const CSS = `.px-chip{font-size:11.5px;padding:0 4px;border-radius:6px;white-space:nowrap;margin-left:4px}
.px-hi{color:#c0503a}.px-lo{color:#3f8a4a}.px-mid{color:inherit}
.px-q{font-size:11.5px;margin-top:2px;white-space:normal;min-width:0}
.px-card .px-sub{font-size:12.5px}
.px-list{display:flex;flex-direction:column;gap:2px}
.px-row{display:grid;grid-template-columns:minmax(90px,1.1fr) minmax(90px,1fr) 76px minmax(0,3fr);gap:6px;align-items:center;padding:3px 0;border-bottom:1px solid rgba(127,127,127,.15);font-size:13px}
.px-w{font-size:12px;min-width:0;overflow-wrap:anywhere}.px-best{font-size:11.5px}
.px-spark{display:block;height:18px}.px-spark .px-line{fill:none;stroke:currentColor;stroke-width:1.4;vector-effect:non-scaling-stroke}.px-spark .px-base{stroke:rgba(127,127,127,.45);stroke-dasharray:2 2;stroke-width:1;vector-effect:non-scaling-stroke}
.px-lim{flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:12.5px}.px-lim input{width:64px}
.rt-price{margin-top:6px;padding-top:6px;border-top:1px solid rgba(127,127,127,.25);font-size:12.5px}
@media (max-width:640px){.px-chip{display:block;margin:0;font-size:11px}.px-q{font-size:10.5px}.px-row{grid-template-columns:1fr auto;grid-template-areas:"g p" "s s" "w w"}.px-g{grid-area:g}.px-p{grid-area:p;text-align:right}.px-s{grid-area:s}.px-w{grid-area:w}.px-spark{width:100%;max-width:100%}}`;

  let installed = false;
  install = () => {
    if (installed || typeof document === 'undefined') return;
    try { if (typeof MARKET_EXTRAS === 'undefined' || typeof HELP_SECTIONS === 'undefined') return; } catch (err) { return; }
    installed = true;
    const st = document.createElement('style'); st.id = 'pxStyle'; st.textContent = CSS; document.head.appendChild(st);
    MARKET_EXTRAS.unshift(card);
    if (!HELP_SECTIONS.some(h => h.id === 'prices')) {
      const i = HELP_SECTIONS.findIndex(h => h.id === 'economy');
      HELP_SECTIONS.splice(i >= 0 ? i + 1 : HELP_SECTIONS.length, 0, { id: 'prices', icon: '📈', title: 'Market prices', tabs: ['market'],
        words: 'price prices market supply demand sell buy trade spike glut scarcity arbitrage caravan ceiling floor impact season war',
        html: `<p>Every good has a <b>world price</b>, shown as a multiple of its normal rate (×1.00). It moves on its own:</p><ul>
<li><b>Supply and demand:</b> when the world's storehouses fill or output outruns use, the price sinks; when stocks thin or use outruns output, it climbs. "Normal" is what this world usually sees, so a lasting glut fades from the price over a few hours.</li>
<li><b>Events:</b> grain and firewood (timber) are dear in winter and cheap after the autumn harvest; weapons, iron and ore climb while many realms are at war; blights, floods and famine raise grain; the crisis raises what it threatens.</li>
<li><b>Your trades:</b> selling pushes the price down as you go and buying pushes it up, so <b>one huge sale pays less per unit than several small ones</b>. The market recovers within the hour. The amount box on the Market tab quotes the average you will get.</li>
<li><b>Local prices:</b> each city pays world price × a local factor: dearer where its stocks and its realm's are thin or it makes less than it uses, cheaper where it is full. Near free cities and great markets (Market 10+) local prices stay closer to the world's. Buy where it is cheap, carry it by caravan, sell where it is dear.</li>
<li><b>Free cities:</b> merchant republics pay caravans by the goods' worth at their own prices; foreign trade routes weigh goods at the partner's prices.</li>
<li><b>Automation:</b> supply lines, the Economy steward and governors buy only up to a ceiling (×1.5 by default) and sell only above a floor (×0.6), both at the city's own price; a city about to overflow sells anyway; a city with almost nothing left may still buy up to ×${P.urgentMax}. Governors also sell spare goods into high prices. Set the limits on the Market tab or with <b>pricelimit 1.5 0.6</b>.</li>
<li><b>Console:</b> <b>prices</b> lists every good; <b>prices grain</b> explains it and names your best markets.</li></ul>` });
    }
    if (typeof HELP_GLOSSARY !== 'undefined') {
      HELP_GLOSSARY.push(['Market price', 'A good’s price as a multiple of normal (×1.00): set by world supply and demand, seasons, wars and trades, then adjusted for each city’s own stocks.', 'prices']);
      HELP_GLOSSARY.push(['Price impact', 'How far a trade moves the price while it runs: big sales fetch less per unit than small ones; the market recovers within the hour.', 'prices']);
    }
    if (typeof act !== 'undefined') act.pxLimits = () => {
      const err = G.setPriceLimits(S, { buy: UI.form.pxBuy !== undefined ? UI.form.pxBuy : G.priceLimits(S).buy, sell: UI.form.pxSell !== undefined ? UI.form.pxSell : G.priceLimits(S).sell });
      const l = G.priceLimits(S);
      delete UI.form.pxBuy; delete UI.form.pxSell;
      if (typeof toast === 'function') toast(err || `Automation buys up to ×${l.buy.toFixed(2)} and sells above ×${l.sell.toFixed(2)}`);
      if (typeof render === 'function') render(true);
    };
    // live quotes: typing an amount on the Market tab updates the expected average price under it
    document.addEventListener('input', ev => {
      const k = ev.target && ev.target.dataset && ev.target.dataset.k;
      if (!k || k.indexOf('mkt_') !== 0 || typeof S === 'undefined' || !S) return;
      const g = k.slice(4), city = S.cities[UI.city], q = document.querySelector(`[data-quote="${g}"]`);
      if (city && q) q.innerHTML = quote(S, city, g, parseInt(ev.target.value, 10) || 0);
    });
  };
  G.priceUI.install = install;
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.addEventListener) document.addEventListener('DOMContentLoaded', install);
})();
