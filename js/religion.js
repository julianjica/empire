// =====================================================================
//  Religion — an original pantheon, founded faiths with tenets, faith
//  points, holy sites, spreading belief (city.faiths), priests who
//  preach, miracles, faith-driven diplomacy and a religious victory.
//
//  State (all defaulted lazily, so older saves load):
//    s.faiths = { id: { id, name, god, tenets:[a,b], founder, founded } }
//    s.holySites = [tileIdx]            tile.ruin.holy / tile.oasis.holy = godId
//    emp.faith (spendable), emp.faithTotal, emp.faithId (state faith),
//    emp.miracleUses = { kind: n }, emp.zealot, emp.holyWar
//    city.faiths = { faithId|'none': share }  (sums to 1)
//    city.sanctuary (until)
// =====================================================================
'use strict';

(() => {
  const paceMin = (s, m) => m * 60 * G.pace(s).time;

  // -------------------------------------------------------------------
  // Tuning
  // -------------------------------------------------------------------
  const R = G.RELIGION = {
    foundCost: 150, adoptCost: 40, adoptCooldown: 30,
    // faith per minute
    shrineFaith: 0.4, templeFaith: 0.8, happyFaith: 0.4, jubilantFaith: 0.8, holyFaith: 3, followerFaith: 0.15,
    // spread
    reach: 8, rate: 0.02, inertia: 1.5,
    selfW: 1, stateW: 0.6, nearW: 0.5, templeW: 0.3, shrineW: 0.15,
    priestConvert: 0.08, priestCap: 0.6, priestResist: 0.12,
    // effects
    stateHappy: 6, splitHappy: 6, charityHappy: 3, shrineHappy: 1, shrineHappyMax: 4,
    sharedOpinion: 20, otherOpinion: -8,
    heraldExtra: 0.5,
    // victory
    victoryShare: 0.6, victoryMinHours: 12, majorityMin: 0.4,
  };

  // -------------------------------------------------------------------
  // The pantheon. fx: modifiers through G.mod; named flags read below.
  // -------------------------------------------------------------------
  DATA.gods = {
    ysolde: { name: 'Ysolde the Harvest Mother', short: 'Ysolde', icon: '🌾', domain: 'Grain and growth', fx: { grain: 1.1, popGrowth: 1.1 },
      desc: '+10% grain and +10% growth in every city.' },
    durgan: { name: 'Durgan the Forge Father', short: 'Durgan', icon: '🔨', domain: 'Refining and defence', fx: { refine: 1.1, def: 1.06 },
      desc: '+10% workshop output and +6% defence.' },
    lirael: { name: 'Lirael the Moon-Singer', short: 'Lirael', icon: '🌙', domain: 'Culture and research', fx: { researchTime: 0.9 }, culture: 1.15,
      desc: '+15% culture; research 10% faster.' },
    skarr: { name: 'Skarr the Ash Wolf', short: 'Skarr', icon: '🐺', domain: 'Attack and plunder', fx: { atk: 1.06, carry: 1.15 }, zeal: true,
      desc: '+6% attack and +15% plunder carried. Its faithful are quick to holy war.' },
    thalos: { name: 'Thalos the Stormcaller', short: 'Thalos', icon: '⚡', domain: 'Trade and travel', fx: { tax: 1.06, travel: 1.08, caravan: 1.2 },
      desc: '+6% taxes, marches 8% faster, caravans carry 20% more.' },
    mirren: { name: 'Mirren the Veiled', short: 'Mirren', icon: '👁️', domain: 'Vision and loyalty', fx: { vision: 1.25 }, loyalty: 0.25,
      desc: '+25% vision; loyalty recovers +0.25 per minute faster in every city.' },
    oru: { name: 'Oru the Deep Root', short: 'Oru', icon: '🌳', domain: 'Timber, stone and healing', fx: { timber: 1.08, stone: 1.08 }, heal: 0.5,
      desc: '+8% timber and stone; healers halve the unhappiness of calamities.' },
  };
  DATA.godOrder = Object.keys(DATA.gods);
  // fallback leanings; a race may declare its own with DATA.races[race].gods = [godId, godId]
  DATA.raceGods = { hearth: ['ysolde', 'thalos'], delver: ['durgan', 'oru'], sylvan: ['lirael', 'oru'], ash: ['skarr', 'mirren'] };
  G.raceGods = race => {
    const r = DATA.races[race];
    const g = (r && Array.isArray(r.gods) && r.gods.filter(x => DATA.gods[x])) || DATA.raceGods[race];
    if (g && g.length) return g;
    // unknown people: a stable pair derived from the race id
    let h = 0; for (const ch of String(race)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const o = DATA.godOrder;
    return [o[h % o.length], o[(h + 3) % o.length]];
  };

  DATA.tenets = {
    tithes:     { name: 'Tithes',              icon: '🪙', fx: { tax: 1.08 }, desc: '+8% taxes.' },
    pilgrimage: { name: 'Pilgrimage',          icon: '🥾', holyGrowth: 1.25, holyFaith: 1.5, desc: '+25% growth in cities near a holy site you hold; holy sites give 50% more faith.' },
    monastic:   { name: 'Monastic Orders',     icon: '📜', fx: { researchTime: 0.92 }, desc: 'Research 8% faster.' },
    holywar:    { name: 'Holy Warriors',       icon: '🗡️', holyAtk: 1.1, zeal: true, desc: '+10% attack against realms of another faith (or none).' },
    charity:    { name: 'Charity',             icon: '🤲', happy: 3, desc: '+3 happiness in every city.' },
    missionary: { name: 'Missionary Zeal',     icon: '📣', spread: 1.5, desc: 'The faith spreads 50% faster; priests convert 50% more.' },
    groves:     { name: 'Sacred Groves',       icon: '🌲', fx: { timber: 1.1 }, desc: '+10% timber.' },
    ancestors:  { name: 'Ancestor Veneration', icon: '🕯️', loyalty: 0.3, desc: 'Loyalty recovers +0.3 per minute faster.' },
    fasting:    { name: 'Fasting',             icon: '🍂', fx: { upkeep: 0.92 }, desc: 'Troops eat 8% less.' },
    iconography:{ name: 'Iconography',         icon: '🖼️', culture: 1.15, desc: '+15% culture.' },
    arcane:     { name: 'Arcane Communion',    icon: '🔮', fx: { spellCost: 0.85 }, desc: 'Spells cost 15% less.' },
    forbidden:  { name: 'Forbidden Arts',      icon: '🩸', faith: 1.2, spellUnrest: 3, desc: '+20% faith, but each spell you cast unsettles your cities (−3 happiness for 10 minutes).' },
  };
  DATA.tenetOrder = Object.keys(DATA.tenets);

  DATA.miracles = {
    harvest:     { name: 'Blessed Harvest', icon: '🌾', cost: 150, city: true, mins: 10, desc: '+40% grain in one city for 10 minutes.' },
    banish:      { name: 'Banish',          icon: '✨', cost: 250, city: true, desc: 'End a bad calamity covering one of your cities.' },
    sanctuary:   { name: 'Sanctuary',       icon: '🛡️', cost: 200, city: true, mins: 20, desc: 'For 20 minutes the wyrm and the restless dead cannot break this city, and its defenders suffer half the losses.' },
    crusade:     { name: 'Crusade',         icon: '⚔️', cost: 300, mins: 15, desc: '+15% attack across the realm for 15 minutes.' },
    inspiration: { name: 'Inspiration',     icon: '💡', cost: 250, mins: 15, desc: 'Research started in the next 15 minutes takes 30% less time.' },
  };
  DATA.miracleOrder = Object.keys(DATA.miracles);

  // -------------------------------------------------------------------
  // Shrine building and the priest unit
  // -------------------------------------------------------------------
  DATA.buildings.shrine = {
    name: 'Shrine', icon: '🕯️', max: 10, time: 12, growth: 1.38,
    cost: { timber: 60, stone: 60, grain: 40 },
    desc: `A wayside shrine. +${R.shrineFaith} faith per minute and +${R.shrineHappy} happiness per level (up to +${R.shrineHappyMax}); spreads the state faith a little.`, req: { townhall: 2 },
  };
  if (!DATA.buildingOrder.includes('shrine')) DATA.buildingOrder.push('shrine');
  {
    const g = DATA.buildingGroups.find(x => x.name === 'Culture');
    if (g) { if (!g.list.includes('shrine')) g.list.splice(Math.max(0, g.list.indexOf('temple')), 0, 'shrine'); }
    else DATA.buildingGroups.push({ name: 'Faith', list: ['shrine'] });
  }
  DATA.units.priest = {
    name: 'Priest', icon: '📿', type: 'civ', atk: 0, defI: 4, defC: 4, spd: 5, carry: 0, upkeep: 0.4, time: 60, at: 'temple', req: 1, pop: 1,
    cost: { grain: 60, gold: 40 }, faith: 30,
    desc: 'Costs 30 faith as well. Sent to preach in any city (yours or a rival\'s), a priest converts part of its people to your state faith. Priests stay where they preach.',
  };
  if (!DATA.commonUnits.includes('priest')) DATA.commonUnits.push('priest');
  // priests also cost faith (goods costs can't hold it, so wrap the training checks)
  const baseTrainStatus = G.trainStatus;
  G.trainStatus = (s, city, unit) => {
    const st = baseTrainStatus(s, city, unit);
    const ff = DATA.units[unit] && DATA.units[unit].faith;
    if (!ff || !st.ok) return st;
    const emp = s.empires[city.owner];
    if (!emp.faithId) return { ok: false, locked: true, reason: 'Found or adopt a faith first' };
    return { ...st, max: Math.min(st.max, Math.floor((emp.faith || 0) / ff)) };
  };
  const baseQueueTrain = G.queueTrain;
  G.queueTrain = (s, cityId, unit, count) => {
    const ff = DATA.units[unit] && DATA.units[unit].faith;
    const city = s.cities[cityId];
    if (!ff || !city) return baseQueueTrain(s, cityId, unit, count);
    const emp = s.empires[city.owner];
    const n = Math.floor(count);
    if (!emp.faithId) return 'Found or adopt a faith first';
    if (n > 0 && (emp.faith || 0) < ff * n) return `Not enough faith (${ff} per ${DATA.units[unit].name})`;
    const err = baseQueueTrain(s, cityId, unit, count);
    if (!err) emp.faith -= ff * n;
    return err;
  };

  // -------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------
  const holyName = (god) => `Sanctum of ${DATA.gods[god].short}`;
  const markHolySites = s => {
    for (const t of s.special) { if (t.ruin) delete t.ruin.holy; if (t.oasis) delete t.oasis.holy; }
    const cands = s.special.filter(t => (t.ruin || t.oasis) && !Object.values(s.cities).some(c => G.dist(c, t) < 2));
    const picked = [];
    const want = Math.round(Math.max(4, Object.keys(s.empires).length) * Math.max(1, Math.sqrt((s.map * s.map) / 961)));   // ~4 on the classic world, more in crowded or bigger ones
    const ruins = cands.filter(t => t.ruin).sort(() => Math.random() - 0.5);
    const oases = cands.filter(t => t.oasis).sort(() => Math.random() - 0.5);
    const pool = [];
    for (let i = 0; i < Math.max(ruins.length, oases.length); i++) { if (ruins[i]) pool.push(ruins[i]); if (oases[i]) pool.push(oases[i]); }
    for (const t of pool) {
      if (picked.length >= want) break;
      if (picked.some(p => G.dist(p, t) < s.map / 5)) continue;
      picked.push(t);
    }
    for (const t of pool) { if (picked.length >= want) break; if (!picked.includes(t)) picked.push(t); }
    const gods = [...DATA.godOrder].sort(() => Math.random() - 0.5);
    picked.forEach((t, i) => { (t.ruin || t.oasis).holy = gods[i % gods.length]; });
    s.holySites = picked.map(t => G.tileIdx(s, t));
  };
  const ensureCity = c => {
    if (!c.faiths || typeof c.faiths !== 'object') c.faiths = { none: 1 };
    return c.faiths;
  };
  const ensure = s => {
    if (!s) return;
    s.faiths = s.faiths || {};
    if (!Array.isArray(s.holySites)) markHolySites(s);
    for (const e of Object.values(s.empires)) {
      if (e.faith === undefined) e.faith = 0;
      if (e.faithTotal === undefined) e.faithTotal = 0;
      if (e.faithId === undefined) e.faithId = null;
      e.miracleUses = e.miracleUses || {};
    }
    for (const c of Object.values(s.cities)) ensureCity(c);
  };
  G.ensureReligion = ensure;
  const baseFoundCity = G.foundCity;
  G.foundCity = (...a) => { const c = baseFoundCity(...a); if (c) ensureCity(c); return c; };

  const faithOf = (s, owner) => { const e = s.empires[owner]; return e && e.faithId && s.faiths && s.faiths[e.faithId] || null; };
  G.faithOf = faithOf;
  G.stateFaith = faithOf;
  G.patronOf = (s, owner) => { const f = faithOf(s, owner); return f ? f.god : null; };
  // the magic module calls this when a realm casts a spell (Forbidden Arts reads it)
  G.noteSpellCast = (s, owner) => { const e = s.empires[owner]; if (e) e.lastSpell = s.time; };
  const tenetsOf = f => (f ? f.tenets : []).map(t => DATA.tenets[t]).filter(Boolean);
  const fxProp = (f, prop, combine = 'mul') => {
    let v = combine === 'mul' ? 1 : 0;
    if (!f) return v;
    for (const src of [DATA.gods[f.god], ...tenetsOf(f)]) if (src && src[prop] !== undefined) v = combine === 'mul' ? v * src[prop] : v + src[prop];
    return v;
  };
  G.faithFx = (s, owner, prop, combine) => fxProp(faithOf(s, owner), prop, combine);
  G.hasTenet = (s, owner, t) => { const f = faithOf(s, owner); return !!(f && f.tenets.includes(t)); };

  // shares, majority
  G.cityFaiths = city => ensureCity(city);
  G.majorityFaith = city => {
    const fs = ensureCity(city);
    let best = 'none', bv = -1;
    for (const [k, v] of Object.entries(fs)) if (v > bv) { bv = v; best = k; }
    return best !== 'none' && bv >= R.majorityMin ? best : null;
  };
  const topTwo = city => {
    const arr = Object.entries(ensureCity(city)).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1]);
    return [arr[0] || [null, 0], arr[1] || [null, 0]];
  };
  const normalize = fs => {
    let t = 0;
    for (const k of Object.keys(fs)) { if (!(fs[k] > 1e-5) && k !== 'none') delete fs[k]; else t += fs[k] || 0; }
    if (!(t > 0)) { for (const k of Object.keys(fs)) delete fs[k]; fs.none = 1; return fs; }
    for (const k of Object.keys(fs)) fs[k] /= t;
    if (fs.none === undefined) fs.none = 0;
    return fs;
  };
  // move `amount` of the city's people to faith f, taken proportionally from everyone else
  G.convertCity = (s, city, f, amount) => {
    const fs = ensureCity(city);
    const others = 1 - (fs[f] || 0);
    if (others <= 0 || amount <= 0) return 0;
    const take = Math.min(amount, others);
    for (const k of Object.keys(fs)) if (k !== f) fs[k] -= fs[k] / others * take;
    fs[f] = (fs[f] || 0) + take;
    normalize(fs);
    return take;
  };

  // -------------------------------------------------------------------
  // Holy sites
  // -------------------------------------------------------------------
  G.holySites = s => { ensure(s); return s.holySites.map(i => s.tiles[i]).filter(t => t && (t.ruin || t.oasis) && (t.ruin || t.oasis).holy); };
  G.holySiteInfo = (s, t) => { const site = t.ruin || t.oasis; return site && site.holy ? { god: site.holy, name: holyName(site.holy), kind: t.ruin ? 'ruin' : 'oasis' } : null; };
  // the city that holds a holy site: an oasis's owner; for ruins the closest city within reach
  G.holySiteHolder = (s, t) => {
    if (t.oasis) { const c = t.oasis.owner && s.cities[t.oasis.owner]; return c || null; }
    let best = null, bd = 1e9;
    for (const c of Object.values(s.cities)) {
      const d = G.dist(c, t);
      if (d <= G.cityReach(s, c) + 1.5 && d < bd) { bd = d; best = c; }
    }
    return best;
  };
  G.holySitesOf = (s, owner) => G.holySites(s).filter(t => { const c = G.holySiteHolder(s, t); return c && c.owner === owner; });
  const holyCity = (s, city) => G.holySites(s).some(t => G.holySiteHolder(s, t) === city);

  // -------------------------------------------------------------------
  // Faith points
  // -------------------------------------------------------------------
  G.cityFaithRate = (s, city) => {
    const emp = s.empires[city.owner];
    let r = R.shrineFaith * G.lvl(city, 'shrine') + R.templeFaith * G.lvl(city, 'temple');
    const h = G.happyOf ? G.happyOf(city) : 55;
    if (h >= 75) r += R.jubilantFaith; else if (h >= 60) r += R.happyFaith;
    if (emp.faithId && G.majorityFaith(city) === emp.faithId) r += R.followerFaith;
    return r * G.pace(s).prod;
  };
  G.faithRate = (s, owner) => {
    ensure(s);
    let r = G.citiesOf(s, owner).reduce((a, c) => a + G.cityFaithRate(s, c), 0);
    const holy = G.holySitesOf(s, owner).length;
    r += holy * R.holyFaith * G.faithFx(s, owner, 'holyFaith') * G.pace(s).prod;
    r *= G.faithFx(s, owner, 'faith');
    return r;
  };

  // -------------------------------------------------------------------
  // Founding and adopting
  // -------------------------------------------------------------------
  const hasTemple = (s, owner) => G.citiesOf(s, owner).some(c => G.lvl(c, 'temple') >= 1);
  G.foundStatus = (s, owner) => {
    ensure(s);
    const emp = s.empires[owner];
    const cur = faithOf(s, owner);
    if (cur && cur.founder === owner) return { ok: false, have: true, reason: 'Your realm already has its own faith' };
    if (!hasTemple(s, owner)) return { ok: false, locked: true, reason: 'Needs a Temple in one of your cities' };
    if (emp.faith < R.foundCost) return { ok: false, poor: true, cost: R.foundCost, reason: `Needs ${R.foundCost} faith` };
    return { ok: true, cost: R.foundCost };
  };
  G.foundFaith = (s, owner, o) => {
    const st = G.foundStatus(s, owner);
    if (!st.ok) return st.reason;
    const name = String(o && o.name || '').trim().slice(0, 40);
    if (!name) return 'Name your faith';
    if (Object.values(s.faiths).some(f => f.name.toLowerCase() === name.toLowerCase())) return 'A faith of that name already exists';
    if (!DATA.gods[o.god]) return 'Choose a patron god';
    const tenets = [...new Set(o.tenets || [])];
    if (tenets.length !== 2 || !tenets.every(t => DATA.tenets[t])) return 'Choose two different tenets';
    const emp = s.empires[owner];
    emp.faith -= st.cost;
    const id = G.newId(s, 'f');
    s.faiths[id] = { id, name, god: o.god, tenets, founder: owner, founded: s.time, color: emp.color };
    const prev = emp.faithId;
    emp.faithId = id;
    emp.zealot = owner !== 'p' && (emp.aggr >= 0.6 || !!DATA.gods[o.god].zeal || tenets.includes('holywar'));
    // the faithful of the capital (and the temple cities) take up the new creed at once
    for (const c of G.citiesOf(s, owner)) G.convertCity(s, c, id, (c === G.capital(s, owner) ? 0.35 : 0.1) + 0.04 * G.lvl(c, 'temple'));
    const g = DATA.gods[o.god];
    if (owner === 'p') G.log(s, 'p', `⛪ ${name} is founded in the name of ${g.name}!`, 'good');
    else {
      G.log(s, 'p', `⛪ The ${emp.name} founded a faith: ${name}, devoted to ${g.name}.`, 'info');
      relEvent(s, owner, prev);
    }
    return null;
  };
  G.adoptStatus = (s, owner, faithId) => {
    ensure(s);
    const emp = s.empires[owner];
    const f = s.faiths[faithId];
    if (!f) return { ok: false, reason: 'No such faith' };
    if (emp.faithId === faithId) return { ok: false, have: true, reason: 'Already your state faith' };
    if (s.time - (emp.faithChanged || -1e12) < paceMin(s, R.adoptCooldown)) return { ok: false, reason: 'The priesthood will not change creeds again so soon' };
    if (emp.faith < R.adoptCost) return { ok: false, poor: true, cost: R.adoptCost, reason: `Needs ${R.adoptCost} faith` };
    return { ok: true, cost: R.adoptCost };
  };
  G.adoptFaith = (s, owner, faithId) => {
    const st = G.adoptStatus(s, owner, faithId);
    if (!st.ok) return st.reason;
    const emp = s.empires[owner];
    const prev = emp.faithId;
    emp.faith -= st.cost;
    emp.faithId = faithId;
    emp.faithChanged = s.time;
    const f = s.faiths[faithId];
    emp.zealot = owner !== 'p' && (emp.aggr >= 0.6 && (!!DATA.gods[f.god].zeal || f.tenets.includes('holywar')));
    const cap = G.capital(s, owner);
    if (cap) G.convertCity(s, cap, faithId, 0.15);
    if (owner === 'p') G.log(s, 'p', `⛪ The realm embraces ${f.name}.`, 'good');
    else { G.log(s, 'p', `⛪ The ${emp.name} adopted ${f.name} as its state faith.`, 'info'); relEvent(s, owner, prev); }
    return null;
  };

  // opinion jolts when an AI's faith changes relative to the player's
  const relEvent = (s, aiId, prevFaith) => {
    if (!G.rel) return;
    const p = s.empires.p.faithId, a = s.empires[aiId].faithId;
    if (!p) return;
    const r = G.rel(s, aiId);
    if (a === p && prevFaith !== p) r.opinion = G.clamp(r.opinion + 10, -100, 100);
    else if (a !== p && prevFaith === p) r.opinion = G.clamp(r.opinion - 10, -100, 100);
  };

  // -------------------------------------------------------------------
  // Spread (slow tick)
  // -------------------------------------------------------------------
  const infra = c => 1 + R.templeW * G.lvl(c, 'temple') + R.shrineW * G.lvl(c, 'shrine');
  const spreadOf = (s, fid) => { const f = s.faiths[fid]; return f ? fxProp(f, 'spread') : 1; };
  G.faithPressure = (s, city, cities) => {
    const press = {};
    const add = (k, v) => { if (v > 0) press[k] = (press[k] || 0) + v; };
    const fs = ensureCity(city);
    const own = infra(city);
    for (const [k, v] of Object.entries(fs)) if (k !== 'none') add(k, v * R.selfW * own);
    const emp = s.empires[city.owner];
    if (emp && emp.faithId && s.faiths[emp.faithId]) add(emp.faithId, (R.stateW + own - 1) * spreadOf(s, emp.faithId));
    for (const o of cities || Object.values(s.cities)) {
      if (o === city) continue;
      const d = G.dist(o, city);
      if (d > R.reach) continue;
      const w = R.nearW * infra(o) * (1 - d / (R.reach + 0.5));
      for (const [k, v] of Object.entries(ensureCity(o))) if (k !== 'none' && s.faiths[k]) add(k, v * w * spreadOf(s, k));
    }
    return press;
  };
  const spreadTick = (s, dtMin) => {
    const cities = Object.values(s.cities);
    const next = new Map();
    for (const c of cities) {
      const press = G.faithPressure(s, c, cities);
      const fs = ensureCity(c);
      const none = R.inertia + (fs.none || 0) * R.selfW;
      const total = none + Object.values(press).reduce((a, b) => a + b, 0);
      const target = { none: none / total };
      for (const [k, v] of Object.entries(press)) target[k] = v / total;
      next.set(c, target);
    }
    const k = Math.min(1, R.rate * dtMin * G.pace(s).prod);
    for (const c of cities) {
      const fs = c.faiths, target = next.get(c);
      for (const key of new Set([...Object.keys(fs), ...Object.keys(target)])) {
        if (key !== 'none' && !s.faiths[key]) { delete fs[key]; continue; }
        const t = target[key] || 0, v = fs[key] || 0;
        fs[key] = v + (t - v) * k;
      }
      normalize(fs);
    }
  };

  // -------------------------------------------------------------------
  // Priests: 'preach' marches
  // -------------------------------------------------------------------
  const baseSend = G.sendArmy;
  G.sendArmy = (s, fromId, x, y, type, units, cargo) => {
    if (type === 'preach') {
      ensure(s);
      const city = s.cities[fromId];
      if (!city) return 'No such city';
      const emp = s.empires[city.owner];
      if (!emp.faithId) return 'Found or adopt a faith before sending priests';
      const tile = G.tileAt(s, x, y);
      const tc = tile && tile.city && s.cities[tile.city];
      if (!tc) return 'Priests preach in cities';
      const keys = Object.keys(units || {}).filter(u => Math.floor(units[u]) > 0);
      if (!keys.length || keys.some(u => u !== 'priest')) return 'Send only priests to preach';
      const err = baseSend(s, fromId, x, y, type, units, cargo);
      if (!err) { const m = s.moves[s.moves.length - 1]; if (m && m.type === 'preach') m.faith = emp.faithId; }
      return err;
    }
    return baseSend(s, fromId, x, y, type, units, cargo);
  };
  G.preachAmount = (s, owner, target, n, faithId) => {
    const f = faithId || s.empires[owner].faithId;
    let per = R.priestConvert * (s.faiths[f] ? fxProp(s.faiths[f], 'spread') : 1);
    const tf = s.empires[target.owner].faithId;
    if (tf && tf !== f) per /= 1 + R.priestResist * G.lvl(target, 'temple');   // a rival temple's clergy pushes back
    return Math.min(R.priestCap, per * n);
  };
  // priests preach where they stand (heals a divided home city without a march)
  G.preachHere = (s, cityId, n) => {
    ensure(s);
    const c = s.cities[cityId];
    if (!c) return 'No such city';
    const emp = s.empires[c.owner];
    if (!emp.faithId) return 'Found or adopt a faith first';
    n = Math.min(Math.floor(n), c.units.priest || 0);
    if (!(n > 0)) return 'No priests here';
    c.units.priest -= n;
    const fid = emp.faithId;
    const before = Math.round((c.faiths[fid] || 0) * 100);
    G.convertCity(s, c, fid, G.preachAmount(s, c.owner, c, n, fid));
    G.log(s, c.owner, `📿 ${n} priest${n === 1 ? '' : 's'} preached in ${c.name}: followers ${before}% → ${Math.round(c.faiths[fid] * 100)}%.`, 'good');
    return null;
  };
  G.moveHandlers.preach = (s, m) => {
    ensure(s);
    const tile = G.tileAt(s, m.x, m.y);
    const tc = tile.city && s.cities[tile.city];
    const fid = m.faith || s.empires[m.owner].faithId;
    if (!tc || !s.faiths[fid]) { G.sendHome(s, m, m.units); return; }
    const n = m.units.priest || 0;
    const before = Math.round((ensureCity(tc)[fid] || 0) * 100);
    const got = G.convertCity(s, tc, fid, G.preachAmount(s, m.owner, tc, n, fid));
    const after = Math.round((tc.faiths[fid] || 0) * 100);
    const f = s.faiths[fid];
    const extra = `${n} priest${n === 1 ? '' : 's'} of ${f.name} preached in ${tc.name}: followers ${before}% → ${after}%.`;
    G.report(s, [m.owner], `Priests preached in ${tc.name}`, 'info', { extra });
    if (m.owner === 'p') G.log(s, 'p', `📿 ${extra}`, 'good');
    else if (tc.owner === 'p') G.log(s, 'p', `📿 Priests of ${f.name} (${s.empires[m.owner].name}) preached in ${tc.name}: their faith now holds ${after}%.`, 'warn');
    // rival courts resent missionaries (a little)
    if (m.owner === 'p' && tc.owner !== 'p' && G.rel && got > 0) { const r = G.rel(s, tc.owner); r.opinion = G.clamp(r.opinion - 2, -100, 100); }
    s.stats.preached = (s.stats.preached || 0) + (m.owner === 'p' ? n : 0);
  };

  // -------------------------------------------------------------------
  // Miracles
  // -------------------------------------------------------------------
  G.miracleCost = (s, owner, kind) => {
    ensure(s);
    const n = s.empires[owner].miracleUses[kind] || 0;
    return Math.round(DATA.miracles[kind].cost * (1 + 0.5 * n) / 10) * 10;
  };
  const badCalamitiesAt = (s, city) => (G.calamitiesAt ? G.calamitiesAt(s, city.x, city.y) : []).filter(c => DATA.calamities[c.kind] && DATA.calamities[c.kind].bad
    && !(DATA.calamities[c.kind].river && !G.site(s, city).river));
  G.badCalamitiesAt = badCalamitiesAt;
  G.miracleStatus = (s, owner, kind, cityId) => {
    ensure(s);
    const d = DATA.miracles[kind];
    if (!d) return { ok: false, reason: 'No such miracle' };
    const emp = s.empires[owner];
    const cost = G.miracleCost(s, owner, kind);
    if (!emp.faithId) return { ok: false, cost, locked: true, reason: 'Found or adopt a faith first' };
    let city = null;
    if (d.city) {
      city = s.cities[cityId];
      if (!city || city.owner !== owner) return { ok: false, cost, reason: 'Choose one of your cities' };
      if (kind === 'banish' && !badCalamitiesAt(s, city).length) return { ok: false, cost, reason: 'No calamity troubles this city' };
      if (kind === 'harvest' && (city.mods || []).some(m => m.label === 'Blessed Harvest' && m.until > s.time)) return { ok: false, cost, reason: 'Already blessed' };
      if (kind === 'sanctuary' && (city.sanctuary || 0) > s.time) return { ok: false, cost, reason: 'Already a sanctuary' };
    }
    if ((kind === 'crusade' || kind === 'inspiration') && (emp.mods || []).some(m => m.label === d.name && m.until > s.time)) return { ok: false, cost, reason: 'Already in effect' };
    if (emp.faith < cost) return { ok: false, cost, poor: true, reason: 'Not enough faith' };
    return { ok: true, cost, city };
  };
  const addMod = (s, target, key, mult, mins, label) => {
    target.mods = (target.mods || []).filter(md => md.until > s.time);
    target.mods.push({ key, mult, until: s.time + paceMin(s, mins), label });
  };
  G.castMiracle = (s, owner, kind, cityId) => {
    const st = G.miracleStatus(s, owner, kind, cityId);
    if (!st.ok) return st.reason;
    const emp = s.empires[owner];
    const d = DATA.miracles[kind];
    const city = st.city;
    emp.faith -= st.cost;
    emp.miracleUses[kind] = (emp.miracleUses[kind] || 0) + 1;
    let msg = '';
    if (kind === 'harvest') { addMod(s, city, 'grain', 1.4, d.mins, 'Blessed Harvest'); msg = `The fields of ${city.name} are blessed (+40% grain).`; }
    else if (kind === 'banish') {
      const c = badCalamitiesAt(s, city).sort((a, b) => b.end - a.end)[0];
      c.end = s.time;               // calamities.js ends it (and clears its lairs) on the next slow tick
      c.banished = owner;
      msg = `${DATA.calamities[c.kind].name} is banished from ${city.name}!`;
    } else if (kind === 'sanctuary') { city.sanctuary = s.time + paceMin(s, d.mins); msg = `${city.name} is a sanctuary: the wyrm and the dead cannot break it.`; }
    else if (kind === 'crusade') { addMod(s, emp, 'atk', 1.15, d.mins, d.name); msg = 'A crusade is proclaimed: +15% attack.'; }
    else if (kind === 'inspiration') { addMod(s, emp, 'researchTime', 0.7, d.mins, d.name); msg = 'The scholars are inspired: research started now is 30% faster.'; }
    if (owner === 'p') G.log(s, 'p', `${d.icon} ${d.name}: ${msg}`, 'good');
    else if (kind === 'crusade' || kind === 'banish') G.log(s, 'p', `${d.icon} The ${emp.name} invokes ${d.name}.`, 'info');
    return null;
  };

  // -------------------------------------------------------------------
  // Modifiers: patron god, tenets, holy-site growth (pilgrimage)
  // -------------------------------------------------------------------
  G.modSources.push((s, owner, city, key) => {
    const emp = s.empires[owner];
    if (!emp || !emp.faithId || !s.faiths) return 1;
    const f = s.faiths[emp.faithId];
    if (!f) return 1;
    let m = 1;
    const g = DATA.gods[f.god];
    if (g && g.fx[key]) m *= g.fx[key];
    for (const t of f.tenets) { const d = DATA.tenets[t]; if (d && d.fx && d.fx[key]) m *= d.fx[key]; }
    if (key === 'popGrowth' && city && f.tenets.includes('pilgrimage') && holyCity(s, city)) m *= DATA.tenets.pilgrimage.holyGrowth;
    return m;
  });

  // culture bonuses (Lirael, Iconography)
  if (G.cultureRate) {
    const baseCulture = G.cultureRate;
    G.cultureRate = (s, city) => baseCulture(s, city) * G.faithFx(s, city.owner, 'culture');
  }

  // -------------------------------------------------------------------
  // Happiness factors (wrapping culture.js)
  // -------------------------------------------------------------------
  if (G.happiness) {
    const baseHappy = G.happiness;
    G.happiness = (s, city) => {
      const h = baseHappy(s, city);
      ensure(s);
      const emp = s.empires[city.owner];
      const why = h.why.slice();
      const add = (label, v) => { if (Math.abs(v) >= 0.5) why.push({ label, value: Math.round(v) }); };
      const fs = ensureCity(city);
      if (emp.faithId && s.faiths[emp.faithId]) {
        const share = fs[emp.faithId] || 0;
        if (G.majorityFaith(city) === emp.faithId) add('State faith', R.stateHappy * share);
        add('Charity', G.faithFx(s, city.owner, 'happy', 'add'));
        const heal = G.faithFx(s, city.owner, 'heal', 'add');
        const cal = h.why.find(w => w.label === 'Calamity');
        if (heal && cal) add(`${DATA.gods.oru.short}'s healers`, -cal.value * heal);
      }
      const [a, b] = topTwo(city);
      if (a[1] > 0.25 && b[1] > 0.25) add('Divided faiths', -Math.min(R.splitHappy, 2 + (b[1] - 0.25) * 30));
      add('Shrines', Math.min(R.shrineHappyMax, R.shrineHappy * G.lvl(city, 'shrine')));
      const unrest = G.faithFx(s, city.owner, 'spellUnrest', 'add');
      if (unrest && emp.lastSpell !== undefined && s.time - emp.lastSpell < paceMin(s, 10)) add('Forbidden arts', -unrest);
      const raw = why.reduce((x, w) => x + w.value, 0);
      return { value: G.clamp(Math.round(raw), 0, 100), why, raw };
    };
  }

  // -------------------------------------------------------------------
  // Battles: holy warriors, sanctuary, conquest of the faithful, pilgrims
  // -------------------------------------------------------------------
  const baseBattle = G.battle;
  G.battle = (s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode) => {
    if (attOwner && defOwner && s.faiths && s.empires[attOwner] && s.empires[defOwner]) {
      const fa = s.empires[attOwner].faithId;
      if (fa && s.empires[defOwner].faithId !== fa) attMult *= G.faithFx(s, attOwner, 'holyAtk');
    }
    if (attOwner === null && (att.wyrm || att.restless) && def) {
      const city = Object.values(s.cities).find(c => c.units === def);
      if (city && (city.sanctuary || 0) > s.time) {
        const r = baseBattle(s, attOwner, att, attMult, defOwner, { ...def }, defMult, flatDef, mode);
        // the sanctuary holds: the monsters are turned back and defenders lose half as many
        const lost = {}, left = {};
        for (const [u, n] of Object.entries(def)) { const l = Math.floor((r.defLost[u] || 0) / 2); lost[u] = l; left[u] = n - l; }
        return { ...r, win: false, defLost: lost, defLeft: left, sanctuary: true };
      }
    }
    return baseBattle(s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode);
  };

  G.battleHooks.push((s, ctx) => {
    ensure(s);
    const { m, r } = ctx;
    // conquering the faithful: a city whose majority shares the attacker's faith yields faster
    if (ctx.site === 'city' && ctx.city && m.type === 'conquer' && r.win && (r.attLeft.herald || 0) > 0) {
      const fa = s.empires[m.owner].faithId;
      if (fa && G.majorityFaith(ctx.city) === fa) {
        const extra = Math.round(G.rint(20, 32) * R.heraldExtra * r.attLeft.herald);
        ctx.city.loyalty -= extra;
        G.log(s, m.owner, `⛪ The faithful of ${ctx.city.name} welcome our heralds (loyalty −${extra} more).`, 'good');
        G.log(s, ctx.city.owner, `⛪ The people of ${ctx.city.name} share the invaders' faith; loyalty crumbles faster.`, 'bad');
      }
    }
    // pilgrims: a victory at a holy site brings faith (once an hour per site)
    if ((ctx.site === 'ruin' || ctx.site === 'oasis') && r.win && ctx.tile) {
      const site = ctx.tile.ruin || ctx.tile.oasis;
      if (site && site.holy) {
        site.visited = site.visited || {};
        if (s.time - (site.visited[m.owner] || -1e12) >= paceMin(s, 60)) {
          site.visited[m.owner] = s.time;
          const gain = Math.round(50 * G.pace(s).prod);
          const emp = s.empires[m.owner];
          emp.faith += gain; emp.faithTotal += gain;
          G.log(s, m.owner, `🕯️ Pilgrims at the ${holyName(site.holy)} bring +${gain} faith.`, 'good');
        }
      }
    }
  });

  // -------------------------------------------------------------------
  // Diplomacy: shared faith, friction and holy war
  // -------------------------------------------------------------------
  const baseHostility = G.hostility;
  G.hostility = (s, aiId, target) => {
    const h = baseHostility(s, aiId, target);
    if (h <= 0 || !s.faiths) return h;
    const a = s.empires[aiId], b = s.empires[target];
    if (!a || !b || !a.faithId) return h;
    if (b.faithId === a.faithId) return h * 0.7;
    let m = b.faithId ? 1.08 : 1;          // the godless are no rivals for souls…
    if (a.zealot) m = b.faithId ? 1.2 : 1.1; // …except to zealots
    if (a.holyWar === target) m = 1.5;
    return h * m;
  };
  const STATUS_TARGET = { war: -25, neutral: 0, peace: 15, alliance: 35 };
  const diploTick = (s, dtMin) => {
    if (!G.rel) return;
    const p = s.empires.p;
    for (const e of Object.values(s.empires)) {
      if (e.id === 'p' || e.dead) continue;
      const r = G.rel(s, e.id);
      const base = STATUS_TARGET[r.status] ?? 0;
      // diplomacy pulls opinion toward `base` at 0.4/min; we pull a bit harder toward base + offset
      if (p.faithId && e.faithId) {
        if (p.faithId === e.faithId) { if (r.opinion < base + R.sharedOpinion) r.opinion = Math.min(base + R.sharedOpinion, r.opinion + 0.6 * dtMin); }
        else if (r.opinion > base + R.otherOpinion) r.opinion = Math.max(base + R.otherOpinion, r.opinion - 0.55 * dtMin);
      }
      // holy war: zealots of another faith who already loathe you
      if (e.zealot && e.faithId && p.faithId !== e.faithId) {
        if (e.holyWar !== 'p' && r.opinion < -30 && r.status !== 'peace' && r.status !== 'alliance' && G.aiPressure(s) > 0.4) {
          e.holyWar = 'p';
          G.log(s, 'p', `🔥 The ${e.name} proclaims a holy war against the unbelievers of ${p.name}!`, 'bad');
        }
      } else if (e.holyWar === 'p') { e.holyWar = null; G.log(s, 'p', `🕊️ The ${e.name} ends its holy war against you.`, 'info'); }
      if (e.holyWar === 'p' && (r.status === 'peace' || r.status === 'alliance')) e.holyWar = null;
    }
  };

  // -------------------------------------------------------------------
  // World summary and religious victory
  // -------------------------------------------------------------------
  G.faithWorld = s => {
    ensure(s);
    const cities = Object.values(s.cities);
    const by = {};
    let none = 0;
    for (const c of cities) { const f = G.majorityFaith(c); if (f) by[f] = (by[f] || 0) + 1; else none++; }
    return { total: cities.length, by, none };
  };
  // progress of a faith toward a religious victory, for its founder
  G.faithProgress = (s, fid) => {
    ensure(s);
    const f = s.faiths[fid];
    const w = G.faithWorld(s);
    const n = w.by[fid] || 0;
    const share = w.total ? n / w.total : 0;
    const winner = f && f.founder;
    const rivals = Object.values(s.empires).filter(e => !e.dead && e.id !== winner && G.citiesOf(s, e.id).length);
    const covered = rivals.filter(e => G.citiesOf(s, e.id).some(c => G.majorityFaith(c) === fid));
    const timeOk = s.time >= R.victoryMinHours * 3600 * G.pace(s).time;
    const alive = !!(f && s.empires[winner] && !s.empires[winner].dead && s.empires[winner].faithId === fid);
    return { n, total: w.total, share, need: R.victoryShare, rivals: rivals.length, covered: covered.length,
      missing: rivals.filter(e => !covered.includes(e)).map(e => e.id), timeOk, alive,
      met: alive && share >= R.victoryShare && covered.length === rivals.length && rivals.length > 0 };
  };
  const checkFaithVictory = s => {
    if (s.settings.mode !== 'conquest' || s.victory || s.gameOver) return;
    for (const fid of Object.keys(s.faiths)) {
      const pr = G.faithProgress(s, fid);
      if (!pr.met || !pr.timeOk) continue;
      const f = s.faiths[fid];
      if (f.founder === 'p') { s.victory = 'faith'; s.victoryFaith = fid; G.log(s, 'p', `⛪ ${f.name} is the faith of the world. Every realm hears your hymns — victory!`, 'good'); }
      else { s.gameOver = 'faith'; s.gameOverBy = f.founder; s.gameOverFaith = fid; G.log(s, 'p', `⛪ ${f.name} of the ${s.empires[f.founder].name} has swept the world. Their faith eclipses your crown.`, 'bad'); }
      return;
    }
  };

  // -------------------------------------------------------------------
  // Slow tick: faith, spread, loyalty, diplomacy, victory
  // -------------------------------------------------------------------
  G.slowHooks.push((s, dtMin) => {
    ensure(s);
    if (s.gameOver) return;
    for (const emp of Object.values(s.empires)) {
      if (emp.dead) continue;
      const g = G.faithRate(s, emp.id) * dtMin;
      emp.faith += g; emp.faithTotal += g;
      const loy = G.faithFx(s, emp.id, 'loyalty', 'add');
      if (loy) for (const c of G.citiesOf(s, emp.id)) c.loyalty = Math.min(100, (c.loyalty ?? 100) + loy * dtMin);
    }
    spreadTick(s, dtMin);
    diploTick(s, dtMin);
    checkFaithVictory(s);
  });

  // -------------------------------------------------------------------
  // AI
  // -------------------------------------------------------------------
  G.aiBuildFilters.push((s, city, type) => type !== 'shrine');
  const TENET_PREF = {
    hearth: ['tithes', 'charity', 'pilgrimage', 'monastic'],
    delver: ['ancestors', 'fasting', 'tithes', 'monastic'],
    sylvan: ['groves', 'iconography', 'missionary', 'charity'],
    ash: ['holywar', 'fasting', 'missionary', 'tithes'],
  };
  // for peoples without their own list: tenets that suit the patron
  const GOD_TENETS = {
    ysolde: ['pilgrimage', 'charity', 'tithes', 'fasting'], durgan: ['ancestors', 'fasting', 'tithes', 'holywar'],
    lirael: ['iconography', 'monastic', 'arcane', 'missionary'], skarr: ['holywar', 'fasting', 'missionary', 'forbidden'],
    thalos: ['tithes', 'missionary', 'pilgrimage', 'charity'], mirren: ['ancestors', 'arcane', 'forbidden', 'monastic'],
    oru: ['groves', 'charity', 'ancestors', 'fasting'],
  };
  const FAITH_NAMES = {
    ysolde: ['The Golden Sheaf', 'Children of the Furrow', 'The Harvest Covenant'],
    durgan: ['The Anvil Creed', 'Sons of the Forge', 'The Hammer Rite'],
    lirael: ['The Silver Choir', 'The Moonlit Path', 'Song of Lirael'],
    skarr: ['The Ash Pack', 'Fang of the Steppe', 'The Burning Howl'],
    thalos: ['The Storm Road', 'Thunder Covenant', 'The Windward Way'],
    mirren: ['The Veiled Eye', 'Keepers of the Hush', 'The Quiet Watch'],
    oru: ['The Deep Root', 'Children of the Loam', 'The Stone-and-Sap'],
  };
  const aiFaithName = (s, god) => {
    const used = new Set(Object.values(s.faiths).map(f => f.name));
    const opts = FAITH_NAMES[god].filter(n => !used.has(n));
    return opts.length ? G.pick(opts) : `${DATA.gods[god].short}'s Faithful ${Object.keys(s.faiths).length + 1}`;
  };
  G.aiFounding = (s, emp) => {
    const lean = G.raceGods(emp.race);
    const god = G.pick(lean);
    const pref = TENET_PREF[emp.race] || GOD_TENETS[god] || ['tithes', 'charity', 'missionary', 'monastic'];
    let tenets = [pref[0], G.pick(pref.slice(1))];
    if (emp.aggr >= 0.6 && !tenets.includes('holywar') && Math.random() < 0.5) tenets[1] = 'holywar';
    if (tenets[0] === tenets[1]) tenets[1] = pref[2];
    return { name: aiFaithName(s, god), god, tenets };
  };
  const aiPriestTarget = (s, emp, from) => {
    const fid = emp.faithId;
    let best = null, bs = -1e9;
    for (const c of Object.values(s.cities)) {
      if (c === from) continue;
      const d = G.dist(c, from);
      if (d > 14) continue;
      const fs = ensureCity(c);
      const share = fs[fid] || 0;
      if (share > 0.7) continue;
      const mine = c.owner === emp.id;
      if (!mine && G.rel && c.owner === 'p' && ['peace', 'alliance'].includes(G.rel(s, emp.id).status) && Math.random() < 0.5) continue;
      if (s.moves.some(m => m.type === 'preach' && m.owner === emp.id && m.x === c.x && m.y === c.y)) continue;
      // own split cities first, then nearby foreign cities with weak temples (godless realms are easy pickings)
      let score = mine ? (share < 0.5 ? 8 : 1) - d * 0.2 : 4 - d * 0.25 - 0.25 * G.lvl(c, 'temple') + (1 - share);
      if (!mine && !s.empires[c.owner].faithId) score += 2;
      if (!mine && share > 0.25) score += 2;                     // finish what was started
      if (score > bs) { bs = score; best = c; }
    }
    return bs > 0 ? best : null;
  };
  G.aiHooks.push((s, emp, dtMin) => {
    ensure(s);
    emp.relClock = (emp.relClock || 0) + dtMin;
    if (emp.relClock < 1 * G.pace(s).time) return;
    emp.relClock = 0;
    const cities = G.citiesOf(s, emp.id);
    if (!cities.length) return;
    const cap = G.capital(s, emp.id);
    const rate = G.faithRate(s, emp.id);
    // 1. shrines and temples when faith-poor
    const poor = rate < 1 + cities.length * 0.6;
    if (poor && G.aiPressure(s) > 0 && emp.gold > 150) {
      for (const c of cities) {
        if (c.buildQueue.length >= G.buildSlots(c) - 1 && c.buildQueue.length) continue;
        if (c.buildQueue.some(q => q.type === 'shrine' || q.type === 'temple')) continue;
        if (G.lvl(c, 'temple') < Math.min(3, G.lvl(c, 'townhall') - 3) && G.buildStatus(s, c, 'temple').ok) { G.queueBuild(s, c.id, 'temple'); break; }
        if (G.lvl(c, 'shrine') < Math.min(4, G.lvl(c, 'townhall')) && G.buildStatus(s, c, 'shrine').ok) { G.queueBuild(s, c.id, 'shrine'); break; }
      }
    }
    // 2. found or adopt
    if (!emp.faithId) {
      const weak = G.power(s, emp.id) < 0.6 * Math.max(...Object.values(s.empires).filter(e => !e.dead).map(e => G.power(s, e.id)));
      const lean = G.raceGods(emp.race);
      const existing = Object.values(s.faiths).filter(f => s.empires[f.founder] && !s.empires[f.founder].dead);
      const kin = existing.filter(f => lean.includes(f.god));
      if (existing.length && (weak || !hasTemple(s, emp.id)) && emp.faith >= R.adoptCost && s.time > paceMin(s, 150)) {
        const f = (kin.length ? kin : existing).sort((a, b) => (G.faithWorld(s).by[b.id] || 0) - (G.faithWorld(s).by[a.id] || 0))[0];
        G.adoptFaith(s, emp.id, f.id);
      } else if (G.foundStatus(s, emp.id).ok) G.foundFaith(s, emp.id, G.aiFounding(s, emp));
      return;
    }
    // the people's faith: when most of the realm's cities follow another creed, the crown turns to it
    const counts = {};
    for (const c of cities) { const f = G.majorityFaith(c); if (f) counts[f] = (counts[f] || 0) + 1; }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top && top[0] !== emp.faithId && top[1] >= Math.max(1, cities.length / 2) && !(counts[emp.faithId] >= top[1])
      && s.faiths[top[0]] && G.adoptStatus(s, emp.id, top[0]).ok) {
      G.adoptFaith(s, emp.id, top[0]);
      return;
    }
    const fid = emp.faithId;
    // 3. priests
    const temples = cities.filter(c => G.lvl(c, 'temple') >= 1);
    const priests = cities.reduce((a, c) => a + (c.units.priest || 0), 0);
    const training = temples.some(c => (c.train.temple || []).length);
    // late in the game, a faith-rich realm sends missions in force
    const rich = G.aiPressure(s) >= 1 && emp.faith > 800;
    const batch = rich ? 5 : 2;
    const wantPriests = 1 + Math.min(3, Math.floor(G.aiPressure(s) * 3)) + (rich ? 6 : 0);
    if (temples.length && priests < wantPriests && !training && emp.gold > 120 && emp.faith >= 60) {
      const c = temples.sort((a, b) => G.lvl(b, 'temple') - G.lvl(a, 'temple'))[0];
      const k = Math.min(batch, G.trainStatus(s, c, 'priest').max);
      if (k >= 2 && Math.random() < 0.5) G.queueTrain(s, c.id, 'priest', k);
    }
    for (const c of cities) {
      const n = c.units.priest || 0;
      if (n >= 1 && (ensureCity(c)[fid] || 0) < 0.5) { G.preachHere(s, c.id, Math.min(n, 4)); continue; }
      if (n < batch) continue;
      const t = aiPriestTarget(s, emp, c);
      if (t) { G.sendArmy(s, c.id, t.x, t.y, 'preach', { priest: n }); break; }
    }
    // 4. miracles
    for (const c of cities) {
      if (badCalamitiesAt(s, c).length && G.miracleStatus(s, emp.id, 'banish', c.id).ok) { G.castMiracle(s, emp.id, 'banish', c.id); return; }
      if (c.starving && G.miracleStatus(s, emp.id, 'harvest', c.id).ok) { G.castMiracle(s, emp.id, 'harvest', c.id); return; }
    }
    const marching = s.moves.some(m => m.owner === emp.id && (m.type === 'attack' || m.type === 'conquer') && m.arrive - s.time > 60);
    if (marching && emp.faith > G.miracleCost(s, emp.id, 'crusade') * 1.2 && G.miracleStatus(s, emp.id, 'crusade').ok) { G.castMiracle(s, emp.id, 'crusade'); return; }
    if (emp.faith > G.miracleCost(s, emp.id, 'inspiration') * 2.5 && G.miracleStatus(s, emp.id, 'inspiration').ok) G.castMiracle(s, emp.id, 'inspiration');
    void fid; void cap;
  });

  G.newGameHooks.push(s => {
    s.faiths = {};
    if (!Array.isArray(s.holySites)) markHolySites(s);
    ensure(s);
    for (const c of Object.values(s.cities)) { c.faiths = { none: 1 }; if (G.updateHappiness) G.updateHappiness(s, c); }
  });
})();
