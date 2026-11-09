// =====================================================================
//  Free cities — neutral city-states scattered over the world. They are
//  not empires: each keeps its own garrison, treasury and favour. Realms
//  court them with gold, caravans and by answering their requests; the
//  realm with the most influence (above a threshold) becomes their Patron
//  and enjoys a boon (stronger as an Ally). Free cities can be stormed:
//  victories wear down their resolve, and at nought the city falls — it
//  becomes a city of the conqueror (if the realm has a city slot to spare)
//  or is subjugated and pays tribute. Every other free city remembers.
//
//  State (lazily created, so older saves load and get free cities):
//    s.minors = { id: { id, name, kind, race, x, y, size, wall, units, grow,
//                       resolve, stores, inf:{owner:n}, patron, ally, subject,
//                       req, nextReq, nextGift, grudge:{owner:until}, hireAt:{owner:t} } }
//    tile.minor = id
// =====================================================================
'use strict';
(() => {

// ---------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------
const M = G.MINORS = {
  patronMin: 30, allyMin: 60, max: 100, hysteresis: 5,
  giftDiv: 8,                 // gold per point of influence (× the time scale)
  caravanBonus: 1.25,         // goods delivered by caravan count a little more than gold
  diminish: 130,              // gains shrink as influence rises: × (1 − inf / diminish)
  decayBase: 0.04, decayRate: 0.003,                  // per minute
  neighbourRate: 0.03, neighbourCap: 25, neighbourDist: 5,
  reqEvery: [15, 30], reqLife: 45, reqReward: 25, defendStrike: 30,
  attackLoss: 25, otherLoss: 12, conquestLoss: 25, grudgeMins: 60, grudgeMult: 0.25,
  resolveRegen: 0.3, aiWarCool: 20, giftEvery: 15, hireCool: 20,
  maxCitiesAI: 8,
};

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
DATA.minorKinds = {
  mercenary: { name: 'Mercenary Hold', icon: '⚔️', color: '#9b3b2a', garrison: 1.4,
    desc: 'Sellswords who fight for whoever pays. Their captains train your levies and hire out companies.',
    fx: { atk: 1.05, trainTime: 0.94 }, allyFx: { atk: 1.1, trainTime: 0.88 },
    boon: '+5% attack, training 6% faster; hire their companies cheaper', allyBoon: '+10% attack, training 12% faster; a free company now and then',
    wants: ['weapons', 'grain', 'iron'] },
  merchant: { name: 'Merchant Republic', icon: '⚖️', color: '#b8892a', garrison: 0.9,
    desc: 'A republic of guilds and counting-houses. Caravans sent here are paid for in gold.',
    fx: { tax: 1.06, market: 1.04, caravan: 1.1 }, allyFx: { tax: 1.12, market: 1.08, caravan: 1.2 },
    boon: '+6% taxes, better market rates, caravans +10%', allyBoon: '+12% taxes, much better market rates, caravans +20%, gold gifts',
    wants: ['timber', 'stone', 'iron', 'tools'] },
  mage: { name: 'Mage Enclave', icon: '🔮', color: '#7a4fc0', garrison: 0.9,
    desc: 'A tower-city of scholars and magi, built where the weave runs thin.',
    fx: { mana: 1.15, spellCost: 0.9 }, allyFx: { mana: 1.3, spellCost: 0.8 },
    boon: '+15% mana, spells 10% cheaper', allyBoon: '+30% mana, spells 20% cheaper, mana gifts',
    wants: ['mana', 'tools', 'stone'] },
  temple: { name: 'Temple City', icon: '🕯️', color: '#c9a43c', garrison: 0.8, faith: [0.4, 0.8],
    desc: 'A holy city of pilgrims and cloisters. Its blessing travels with its friends.',
    fx: { popGrowth: 1.05 }, allyFx: { popGrowth: 1.1 },
    boon: '+5% growth, +0.4 faith per minute', allyBoon: '+10% growth, +0.8 faith per minute, faith gifts',
    wants: ['grain', 'timber', 'stone'] },
  maritime: { name: 'Maritime Haven', icon: '⚓', color: '#2f7fa8', garrison: 1, coastal: true,
    desc: 'A harbour town of fishers and shipwrights. Its pilots know every current.',
    fx: { grain: 1.08, travel: 1.04 }, allyFx: { grain: 1.15, travel: 1.08 },
    boon: '+8% grain, marches and ships 4% faster', allyBoon: '+15% grain, 8% faster marches, grain gifts',
    wants: ['timber', 'iron', 'tools'] },
  forge: { name: 'Forge Town', icon: '⚒️', color: '#6b5a4a', garrison: 1.1,
    desc: 'Furnaces burn day and night in this town of smiths and smelters.',
    fx: { refine: 1.08, buildTime: 0.96 }, allyFx: { refine: 1.15, buildTime: 0.92 },
    boon: '+8% workshop output, building 4% faster', allyBoon: '+15% workshop output, building 8% faster, tools gifts',
    wants: ['ore', 'timber', 'grain'] },
};
DATA.minorKindOrder = Object.keys(DATA.minorKinds);
DATA.minorNames = {
  hearth: ['Brightwater', 'Oakmarket', 'Saltmere', 'Goldfurrow', 'Kingsford', 'Hollyford'],
  delver: ['Hammerdeep', 'Coppergate', 'Brasskeep', 'Flintholm', 'Gravelmouth', 'Orehold'],
  sylvan: ['Willowmere', 'Dawnbough', 'Fernhollow', 'Larkwood', 'Moonbrook', 'Ashgrove'],
  ash:    ['Redcairn', 'Scorchwell', 'Duskhowl', 'Cinderford', 'Bonepass', 'Embermoot'],
  tide:   ['Pearlhaven', 'Coralmouth', 'Saltspray', 'Tidewatch', 'Driftharbor', 'Shellcove'],
  veil:   ['Glimmerhold', 'Mirrorvale', 'Duskveil', 'Starwell', 'Lumen Spire', 'Silkshade'],
  grave:  ['Ossuary Gate', 'Hollowmere', 'Candlecrypt', 'Greymourn', 'Quietbarrow', 'Lanternfall'],
  wind:   ['Skyreach', 'Gale Aerie', 'Highperch', 'Cloudmoot', 'Featherfall', 'Stormcrest'],
};
// which free cities each people courts first
const RACE_PREF = { hearth: ['merchant', 'maritime'], delver: ['forge', 'mercenary'], sylvan: ['temple', 'mage'], ash: ['mercenary', 'forge'],
  tide: ['maritime', 'merchant'], veil: ['mage', 'temple'], grave: ['temple', 'mage'], wind: ['merchant', 'mercenary'] };
DATA.minorRequestInfo = {
  deliver: { icon: '📦', name: 'Delivery' },
  clear: { icon: '⛺', name: 'Clear the brigands' },
  defend: { icon: '🛡️', name: 'Defend the city' },
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const paceT = s => G.pace(s).time;
const hours = s => s.time / (3600 * paceT(s));
G.minorScale = s => 1 + 0.2 * Math.min(20, hours(s));
const alive = (s, o) => !!(s.empires[o] && !s.empires[o].dead);
const valueOf = goods => Object.entries(goods || {}).reduce((a, [g, v]) => a + (g === 'gold' ? v : (DATA.goods[g] ? DATA.goods[g].value * v : 0)), 0);
const near = (s, owner, mi) => Math.min(Infinity, ...G.citiesOf(s, owner).map(c => G.dist(c, mi)));
const seenBy = (s, mi) => !!s.explored[mi.y * s.map + mi.x];

const garrisonTypes = race => {
  const r = DATA.races[race] || DATA.races.hearth;
  const us = r.units.filter(u => DATA.units[u] && DATA.units[u].at === 'barracks' && DATA.units[u].type !== 'siege' && DATA.units[u].type !== 'civ')
    .sort((a, b) => DATA.units[a].req - DATA.units[b].req).slice(0, 3);
  if (!us.length) return { def: 'militia', atk: 'militia' };
  const dv = u => (DATA.units[u].defI + DATA.units[u].defC) / 2;
  return { def: [...us].sort((a, b) => dv(b) - dv(a))[0], atk: [...us].sort((a, b) => DATA.units[b].atk - DATA.units[a].atk)[0] };
};
G.minorUnitTypes = mi => garrisonTypes(mi.race);
const garrisonTarget = (s, mi) => Math.round((14 + 8 * mi.size) * (DATA.minorKinds[mi.kind].garrison || 1) * (1 + Math.min(3, hours(s) / 3)));
G.minorGarrisonTarget = garrisonTarget;
const storesTarget = (s, mi) => {
  const k = mi.size * Math.min(3, G.minorScale(s));
  return { grain: 400 * k, timber: 400 * k, stone: 300 * k, ore: 250 * k, iron: 40 * k, weapons: 30 * k, tools: 20 * k };
};
G.minorDefense = (s, mi) => ({ mult: 1 + 0.06 * mi.wall, flat: 15 + 8 * mi.size });

// ---------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const occupied = t => t.city || t.camp || t.oasis || t.ruin || t.minor;
const makeMinor = (s, t, kind, race, used) => {
  const pool = (DATA.minorNames[race] || DATA.minorNames.hearth).filter(n => !used.has(n));
  const name = pool.length ? G.pick(pool) : `Free ${DATA.minorKinds[kind].name.split(' ')[1] || 'City'} ${used.size + 1}`;
  used.add(name);
  const id = G.newId(s, 'fc');
  const size = G.rint(1, 3);
  const mi = { id, name, kind, race, x: t.x, y: t.y, size, wall: 2 + size, units: {}, grow: 0, resolve: 100, stores: {},
    inf: {}, patron: null, ally: false, subject: null, req: null, nextReq: s.time + G.rnd(20, 40) * 60 * paceT(s), nextGift: 0, grudge: {}, hireAt: {}, founded: s.time };
  const gt = garrisonTypes(race), n = garrisonTarget(s, mi);
  mi.units[gt.def] = Math.ceil(n * 0.65);
  mi.units[gt.atk] = (mi.units[gt.atk] || 0) + Math.floor(n * 0.35);
  mi.stores = storesTarget(s, mi);
  s.minors[id] = mi;
  t.minor = id;
  return mi;
};
G.placeMinors = s => {
  s.minors = s.minors || {};
  const rivals = Object.keys(s.empires).filter(id => id !== 'p').length;
  const want = G.clamp(rivals + 2, 3, 9);
  const cap = G.capital(s, 'p');
  const leyN = (s.ley && s.ley.nodes) || [];
  const used = new Set(Object.values(s.minors).map(m => m.name));
  const kinds = [];
  while (kinds.length < want) kinds.push(...shuffle([...DATA.minorKindOrder]));
  kinds.length = want;
  const N = s.map;
  const ok = (t, dc, dm) => !G.isWater(t) && !occupied(t) && !(DATA.terrain[t.terrain] || {}).impassable
    && t.x >= 1 && t.y >= 1 && t.x <= N - 2 && t.y <= N - 2
    && Object.values(s.cities).every(c => G.dist(c, t) >= dc)
    && Object.values(s.minors).every(m => G.dist(m, t) >= dm)
    && !leyN.some(n => n.x === t.x && n.y === t.y)
    && (!cap || G.landReachable(s, cap, t));
  for (const kind of kinds) {
    if (Object.keys(s.minors).length >= want) break;
    let best = null;
    for (const [dc, dm] of [[5, 5], [5, 4], [4, 3], [3, 2.5]]) {
      let cands = s.tiles.filter(t => ok(t, dc, dm));
      if (DATA.minorKinds[kind].coastal) { const coast = cands.filter(t => G.coastal(s, t.x, t.y)); if (coast.length) cands = coast; }
      if (!cands.length) continue;
      let bs = -1e9;
      for (let i = 0; i < 40; i++) {
        const t = cands[Math.floor(Math.random() * cands.length)];
        const y = G.siteYield(s, t.x, t.y);
        const sc = y.grain + y.timber + y.stone + y.ore + (y.prosper - 1) * 3 + Math.random() * 0.6;
        if (sc > bs) { bs = sc; best = t; }
      }
      break;
    }
    if (!best) break;
    const race = G.pick(DATA.raceOrder.filter(r => DATA.races[r]));
    makeMinor(s, best, kind, race, used);
  }
  return s.minors;
};

const normalize = mi => {
  mi.inf = mi.inf || {}; mi.units = mi.units || {}; mi.grudge = mi.grudge || {}; mi.hireAt = mi.hireAt || {}; mi.stores = mi.stores || {};
  if (mi.resolve === undefined) mi.resolve = 100;
  if (!DATA.minorKinds[mi.kind]) mi.kind = 'merchant';
  if (!DATA.races[mi.race]) mi.race = 'hearth';
};
const ensure = s => {
  if (!s) return {};
  if (!s.minors || typeof s.minors !== 'object') { s.minors = {}; G.placeMinors(s); }
  for (const mi of Object.values(s.minors)) {
    normalize(mi);
    const t = G.tileAt(s, mi.x, mi.y);
    if (t && !t.minor && !t.city) t.minor = mi.id;
  }
  return s.minors;
};
G.ensureMinors = ensure;
G.minorsList = s => Object.values(ensure(s));
G.minorAt = (s, t) => { if (!s || !s.minors || !t || !t.minor) return null; return s.minors[t.minor] || null; };
G.minorInf = (s, mi, owner) => (mi && mi.inf[owner]) || 0;
G.minorRanking = (s, mi) => Object.entries(mi.inf).filter(([o, v]) => alive(s, o) && v > 0.05).sort((a, b) => b[1] - a[1]).map(([owner, inf]) => ({ owner, inf }));
G.minorsOf = (s, owner) => G.minorsList(s).filter(mi => mi.patron === owner);
G.minorSubjects = (s, owner) => G.minorsList(s).filter(mi => mi.subject === owner);
G.minorStrength = mi => G.unitsCount(mi.units);
G.minorStatus = (s, mi, owner) => mi.subject ? (mi.subject === owner ? 'subject' : 'subjugated') : mi.patron === owner ? (mi.ally ? 'ally' : 'patron') : G.minorInf(s, mi, owner) >= 20 ? 'friend' : 'neutral';

// ---------------------------------------------------------------------
// Boons through G.mod (cached: rebuilt whenever patronage changes)
// ---------------------------------------------------------------------
const BOON = new WeakMap();
const rebuildBoons = s => {
  const map = {};
  for (const mi of Object.values(s.minors || {})) {
    if (!mi.patron || mi.subject) continue;
    const k = DATA.minorKinds[mi.kind];
    const fx = mi.ally ? k.allyFx : k.fx;
    const o = map[mi.patron] = map[mi.patron] || {};
    for (const [key, v] of Object.entries(fx)) o[key] = (o[key] || 1) * v;
  }
  BOON.set(s.minors, map);
  return map;
};
G.minorBoons = (s, owner) => { if (!s.minors) return {}; return (BOON.get(s.minors) || rebuildBoons(s))[owner] || {}; };
G.modSources.push((s, owner, city, key) => {
  if (!s.minors) return 1;
  const map = BOON.get(s.minors) || rebuildBoons(s);
  const o = map[owner];
  return (o && o[key]) || 1;
});

// ---------------------------------------------------------------------
// Influence
// ---------------------------------------------------------------------
const addInf = (s, mi, owner, d) => {
  if (!alive(s, owner) || mi.subject) return 0;
  const cur = mi.inf[owner] || 0;
  if (d > 0) {
    if ((mi.grudge[owner] || 0) > s.time) d *= M.grudgeMult;
    d *= Math.max(0.05, 1 - cur / M.diminish);
  }
  const nv = G.clamp(cur + d, 0, M.max);
  if (nv > 0.05) mi.inf[owner] = nv; else delete mi.inf[owner];
  return nv - cur;
};
G.minorAddInfluence = addInf;
const giftGain = (s, mi, owner, value) => value / (M.giftDiv * G.minorScale(s));
G.minorGiftOptions = s => [100, 250, 600].map(v => Math.round(v * G.minorScale(s) / 10) * 10);
G.minorGiftPreview = (s, mi, owner, gold) => {
  let d = giftGain(s, mi, owner, gold);
  if ((mi.grudge[owner] || 0) > s.time) d *= M.grudgeMult;
  return d * Math.max(0.05, 1 - (mi.inf[owner] || 0) / M.diminish);
};
const canDeal = (s, mi, owner) => {
  if (!mi) return 'No such free city';
  if (!alive(s, owner)) return 'Your realm has fallen';
  if (mi.subject) return mi.subject === owner ? `${mi.name} already pays you tribute` : `${mi.name} pays tribute to the ${s.empires[mi.subject].name}`;
  if (owner === 'p' && !seenBy(s, mi)) return 'You have not found this city yet';
  return null;
};
G.minorGift = (s, owner, mid, gold) => {
  const mi = ensure(s)[mid];
  const err = canDeal(s, mi, owner); if (err) return err;
  gold = Math.floor(gold);
  if (!(gold >= 10)) return 'Offer at least 10 gold';
  const emp = s.empires[owner];
  if (emp.gold < gold) return 'Not enough gold';
  emp.gold -= gold;
  const d = addInf(s, mi, owner, giftGain(s, mi, owner, gold));
  G.log(s, owner, `🏰 Your envoys bring ${gold} gold to ${mi.name} (+${d.toFixed(1)} influence).`, 'good');
  updatePatron(s, mi);
  return null;
};

// ---------------------------------------------------------------------
// Requests: deliveries, brigands to clear, raiders to beat off
// ---------------------------------------------------------------------
const reqGood = (s, mi) => {
  const ok = DATA.minorKinds[mi.kind].wants.filter(g => DATA.goods[g] && !DATA.goods[g].race);
  return G.pick(ok.length ? ok : ['grain']);
};
const reqAmount = (s, g) => {
  const v = DATA.goods[g].value;
  return Math.max(10, Math.round((v >= 2 ? 160 : 140) / v * G.minorScale(s) * (v >= 2 ? 0.5 : 1) / 10) * 10);
};
const nearCamp = (s, mi, maxD) => Object.values(s.camps).filter(c => !c.kind && !c.raidOn && G.dist(c, mi) <= maxD && G.dist(c, mi) >= 1)
  .sort((a, b) => G.dist(a, mi) - G.dist(b, mi))[0];
const newRequest = (s, mi) => {
  const life = M.reqLife * 60 * paceT(s);
  const roll = Math.random();
  const tier = G.clamp(1 + Math.floor(hours(s) / 2), 1, 5);
  let req = null;
  if (roll < 0.5) {
    const good = reqGood(s, mi);
    req = { type: 'deliver', good, amount: reqAmount(s, good) };
  } else if (roll < 0.8) {
    const camp = nearCamp(s, mi, 6) || G.spawnCamp(s, tier, mi);
    if (camp) req = { type: 'clear', camp: camp.id, x: camp.x, y: camp.y, tier: camp.tier };
  } else {
    // brigands already camped nearby plan the raid, or a new warband gathers
    const camp = nearCamp(s, mi, 6) || G.spawnCamp(s, tier, mi);
    if (camp) {
      camp.raidOn = mi.id;
      camp.units.brigand = Math.round(camp.units.brigand * 1.2);
      req = { type: 'defend', camp: camp.id, x: camp.x, y: camp.y, tier: camp.tier };
    }
  }
  if (!req) return null;
  req.id = G.newId(s, 'rq');
  req.since = s.time;
  req.expires = s.time + (req.type === 'defend' ? M.defendStrike * 60 * paceT(s) : life);
  req.reward = Math.round(M.reqReward);
  req.gold = Math.round(40 * G.minorScale(s) * (req.type === 'deliver' ? 1 : 2) / 5) * 5;
  mi.req = req;
  // realms that know the city hear of it
  if (seenBy(s, mi) && (mi.inf.p || 0) >= 5) G.log(s, 'p', `🏰 ${mi.name} asks for help: ${G.minorRequestText(s, mi)}.`, 'info');
  return req;
};
G.minorNewRequest = newRequest;
G.minorRequestText = (s, mi) => {
  const r = mi.req;
  if (!r) return '';
  if (r.type === 'deliver') return `deliver ${r.amount} ${DATA.goods[r.good].icon} ${DATA.goods[r.good].name} by caravan (or straight from a city within 15 tiles)`;
  if (r.type === 'clear') return `destroy the brigand camp at (${r.x}, ${r.y})`;
  return `beat off the raiders gathering at (${r.x}, ${r.y}) before they strike`;
};
const completeRequest = (s, mi, owner) => {
  const r = mi.req;
  if (!r || !alive(s, owner)) return;
  mi.req = null;
  mi.nextReq = s.time + G.rnd(M.reqEvery[0], M.reqEvery[1]) * 60 * paceT(s);
  const d = addInf(s, mi, owner, r.reward);
  s.empires[owner].gold += r.gold || 0;
  G.log(s, owner, `🏰 ${mi.name} thanks you for your help (+${d.toFixed(0)} influence, +${r.gold || 0} gold).`, 'good');
  if (owner !== 'p' && seenBy(s, mi) && (mi.inf.p || 0) >= 5) G.log(s, 'p', `🏰 The ${s.empires[owner].name} answered ${mi.name}'s request.`, 'info');
  updatePatron(s, mi);
};
G.minorCompleteRequest = completeRequest;
G.minorDeliverStatus = (s, owner, mid, cityId) => {
  const mi = ensure(s)[mid];
  const err = canDeal(s, mi, owner); if (err) return { ok: false, reason: err };
  const r = mi.req;
  if (!r || r.type !== 'deliver') return { ok: false, reason: 'They need no delivery now' };
  const city = s.cities[cityId];
  if (!city || city.owner !== owner) return { ok: false, reason: 'Deliver from one of your cities' };
  if (G.dist(city, mi) > 15) return { ok: false, reason: `${city.name} is too far — send a caravan` };
  if ((city.res[r.good] || 0) < r.amount) return { ok: false, reason: `${city.name} lacks ${r.amount} ${DATA.goods[r.good].name}` };
  return { ok: true };
};
G.minorDeliver = (s, owner, mid, cityId) => {
  const st = G.minorDeliverStatus(s, owner, mid, cityId);
  if (!st.ok) return st.reason;
  const mi = s.minors[mid], r = mi.req;
  s.cities[cityId].res[r.good] -= r.amount;
  completeRequest(s, mi, owner);
  return null;
};

// ---------------------------------------------------------------------
// Mercenaries for hire (mercenary holds)
// ---------------------------------------------------------------------
G.minorHireQuote = (s, owner, mid) => {
  const mi = s.minors && s.minors[mid];
  if (!mi || mi.kind !== 'mercenary') return null;
  const u = garrisonTypes(mi.race).atk, n = 4 + 2 * mi.size;
  const unitGold = valueOf(DATA.units[u].cost) * 1.3;
  const gold = Math.round(n * unitGold * (mi.patron === owner ? 0.7 : 1) / 5) * 5;
  return { unit: u, n, gold };
};
G.minorHireStatus = (s, owner, mid, cityId) => {
  const mi = ensure(s)[mid];
  const err = canDeal(s, mi, owner); if (err) return { ok: false, reason: err };
  if (mi.kind !== 'mercenary') return { ok: false, reason: 'Only mercenary holds hire out companies' };
  const q = G.minorHireQuote(s, owner, mid);
  if (G.minorInf(s, mi, owner) < 20) return { ok: false, reason: 'They hire out only to friends (20 influence)', q };
  if ((mi.hireAt[owner] || 0) > s.time) return { ok: false, reason: `Next company ready in ${Math.ceil((mi.hireAt[owner] - s.time) / 60)} min`, q };
  const city = s.cities[cityId];
  if (!city || city.owner !== owner) return { ok: false, reason: 'Choose one of your cities', q };
  if (s.empires[owner].gold < q.gold) return { ok: false, reason: 'Not enough gold', poor: true, q };
  return { ok: true, q };
};
G.minorHire = (s, owner, mid, cityId) => {
  const st = G.minorHireStatus(s, owner, mid, cityId);
  if (!st.ok) return st.reason;
  const mi = s.minors[mid], city = s.cities[cityId], q = st.q;
  const units = { [q.unit]: q.n };
  const plan = G.planMarch(s, owner, mi, city, units);
  const dur = plan.ok ? plan.dur : G.travelTime(s, owner, mi, city, DATA.units[q.unit].spd);
  s.empires[owner].gold -= q.gold;
  mi.hireAt[owner] = s.time + M.hireCool * 60 * paceT(s);
  s.moves.push({ id: G.newId(s, 'm'), owner, type: 'return', from: city.id, fx: mi.x, fy: mi.y, x: city.x, y: city.y,
    path: plan.ok && !plan.naval ? plan.path : undefined, units, cargo: {}, depart: s.time, arrive: s.time + dur, mercs: mi.id });
  G.log(s, owner, `⚔️ A company of ${q.n} ${DATA.units[q.unit].name} from ${mi.name} marches to ${city.name}.`, 'good');
  return null;
};

// ---------------------------------------------------------------------
// Patronage
// ---------------------------------------------------------------------
const updatePatron = (s, mi) => {
  if (mi.subject) { if (mi.patron) { mi.patron = null; mi.ally = false; rebuildBoons(s); } return; }
  const ranks = G.minorRanking(s, mi);
  const top = ranks[0];
  const prev = mi.patron, prevAlly = mi.ally;
  let np = null;
  if (top && top.inf >= M.patronMin) {
    np = top.owner;
    if (prev && prev !== np && alive(s, prev) && (mi.inf[prev] || 0) >= M.patronMin && top.inf < (mi.inf[prev] || 0) + M.hysteresis) np = prev;
  }
  mi.patron = np;
  mi.ally = !!np && (mi.inf[np] || 0) >= M.allyMin;
  if (np === prev && mi.ally === prevAlly) return;
  rebuildBoons(s);
  const kind = DATA.minorKinds[mi.kind];
  if (prev !== np) {
    if (prev === 'p') G.log(s, 'p', `⚠️ ${mi.name} no longer looks to you as patron${np ? ` — the ${s.empires[np].name} have won its favour` : ''}. Its boon is lost.`, 'warn');
    if (np === 'p') G.log(s, 'p', `🏰 ${mi.name} (${kind.name}) now looks to you as its patron: ${kind.boon}.`, 'good');
    else if (np && seenBy(s, mi) && near(s, 'p', mi) <= 12) G.log(s, 'p', `⚠️ The ${s.empires[np].name} became patron of ${mi.name}, a ${kind.name.toLowerCase()} near your lands.`, 'warn');
  } else if (np === 'p' && mi.ally && !prevAlly) G.log(s, 'p', `🤝 ${mi.name} is now your ally: ${kind.allyBoon}.`, 'good');
};
G.minorUpdatePatron = updatePatron;

// a hostile act against a free city: it hates the attacker, the others grow wary
const anger = (s, mi, owner, type) => {
  if (!alive(s, owner)) return;
  const raid = type === 'raid';
  mi.inf[owner] = Math.max(0, (mi.inf[owner] || 0) - M.attackLoss * (raid ? 0.6 : 1));
  if (!(mi.inf[owner] > 0.05)) delete mi.inf[owner];
  mi.grudge[owner] = s.time + M.grudgeMins * 60 * paceT(s);
  for (const o of Object.values(s.minors)) if (o !== mi) { addInf(s, o, owner, -M.otherLoss * (raid ? 0.5 : 1)); updatePatron(s, o); }
  if (owner === 'p' && G.rel) for (const e of Object.values(s.empires)) if (e.id !== 'p' && !e.dead) { const r = G.rel(s, e.id); r.opinion = G.clamp(r.opinion - (raid ? 2 : 4), -100, 100); }
  updatePatron(s, mi);
};

// ---------------------------------------------------------------------
// Conquest
// ---------------------------------------------------------------------
const capture = (s, mi, owner, garrison) => {
  const t = G.tileAt(s, mi.x, mi.y);
  const emp = s.empires[owner];
  const canCity = G.canFoundCity(s, owner) && (owner === 'p' || G.citiesOf(s, owner).length < M.maxCitiesAI);
  for (const o of Object.values(s.minors)) if (o !== mi) { addInf(s, o, owner, -M.conquestLoss); o.grudge[owner] = s.time + 2 * M.grudgeMins * 60 * paceT(s); updatePatron(s, o); }
  if (owner === 'p' && G.rel) for (const e of Object.values(s.empires)) if (e.id !== 'p' && !e.dead) { const r = G.rel(s, e.id); r.opinion = G.clamp(r.opinion - 10, -100, 100); }
  const wasPatron = mi.patron;
  if (canCity) {
    delete s.minors[mi.id];
    t.minor = null;
    const st = mi.stores || {};
    const res = {}; for (const g of DATA.goodOrder) res[g] = Math.floor(st[g] || 0) * 0.5;
    const c = G.foundCity(s, owner, mi.x, mi.y, mi.name, res);
    const L = 2 + mi.size;
    Object.assign(c.buildings, { townhall: L + 1, houses: L, warehouse: L, farm: L, lumber: L - 1, quarry: L - 1, mine: Math.max(1, L - 2), market: 2, barracks: 2, wall: Math.max(1, mi.wall - 2) });
    c.pop = 14 + 8 * mi.size;
    c.units = garrison;
    c.loyalty = 35;
    emp.conquests = (emp.conquests || 0) + 1;
    G.log(s, owner, `🏰 ${mi.name} has fallen! The free city is now one of your cities.`, 'good');
    if (owner !== 'p' && (seenBy(s, mi) || wasPatron === 'p')) G.log(s, 'p', `🏰 The ${emp.name} conquered the free city of ${mi.name}. The other free cities are outraged.`, 'warn');
    rebuildBoons(s);
    return c;
  }
  mi.subject = owner; mi.inf = {}; mi.patron = null; mi.ally = false; mi.req = null; mi.resolve = 40;
  mi.units = G.addUnits({}, garrison && Object.fromEntries(Object.entries(garrison).filter(([u]) => DATA.units[u] && DATA.units[u].at && DATA.units[u].type !== 'civ' && u !== 'hero').map(([u, n]) => [u, Math.floor(n / 3)])));
  G.log(s, owner, `🏰 ${mi.name} submits and will pay tribute${owner === 'p' ? ' (your realm has no city slot to rule it directly — earn more renown)' : ''}.`, 'good');
  if (owner !== 'p' && (seenBy(s, mi) || wasPatron === 'p')) G.log(s, 'p', `🏰 The ${emp.name} subjugated the free city of ${mi.name}.`, 'warn');
  rebuildBoons(s);
  return null;
};
G.minorCapture = capture;
G.minorTribute = (s, mi) => (3 + 2 * mi.size) * G.pace(s).prod;

// ---------------------------------------------------------------------
// Arrivals at a free city (wraps G.resolveMove: caravans, battles, scouts)
// ---------------------------------------------------------------------
const takeLoot = (store, capacity) => {
  const avail = Object.entries(store).filter(([, v]) => v >= 1);
  const total = avail.reduce((a, [, v]) => a + v, 0);
  const take = Math.min(total, capacity);
  const loot = {};
  if (take <= 0) return loot;
  for (const [g, v] of avail) { const k = Math.floor(v / total * take); if (k > 0) { loot[g] = k; store[g] -= k; } }
  return loot;
};
const arriveTrade = (s, m, mi) => {
  const cargo = m.cargo || {};
  const r = mi.req;
  const err = canDeal(s, mi, m.owner);
  if (err) {
    G.log(s, m.owner, `🐪 ${mi.name} turned the caravan away: ${err}.`, 'bad');
    s.moves.push({ id: G.newId(s, 'm'), owner: m.owner, type: 'return', from: m.from, fx: m.x, fy: m.y, x: m.fx, y: m.fy, path: m.path ? [...m.path].reverse() : undefined, naval: m.naval, units: {}, cargo, depart: s.time, arrive: s.time + (m.arrive - m.depart) });
    return;
  }
  let gifts = { ...cargo };
  if (r && r.type === 'deliver' && (cargo[r.good] || 0) >= r.amount) { gifts[r.good] -= r.amount; completeRequest(s, mi, m.owner); }
  const value = valueOf(gifts);
  let d = 0;
  if (value > 0) d = addInf(s, mi, m.owner, giftGain(s, mi, m.owner, value) * M.caravanBonus);
  let paid = 0;
  if (mi.kind === 'merchant' && value > 0) { paid = Math.round(value * 0.5); s.empires[m.owner].gold += paid; }
  for (const [g, v] of Object.entries(gifts)) if (v > 0 && DATA.goods[g]) mi.stores[g] = (mi.stores[g] || 0) + v * 0.5;
  if (value > 0) G.log(s, m.owner, `🐪 Your caravan reached ${mi.name} (+${d.toFixed(1)} influence${paid ? `, the guilds paid ${paid} gold` : ''}).`, 'good');
  updatePatron(s, mi);
};
const arriveScout = (s, m, mi, t) => {
  const intel = { t: s.time, name: mi.name, units: { ...mi.units }, wall: mi.wall, minor: mi.id,
    res: Object.fromEntries(Object.entries(mi.stores).map(([g, v]) => [g, Math.floor(v)]).filter(([, v]) => v > 0)) };
  if (m.owner === 'p') { s.intel[G.tileIdx(s, t)] = intel; G.reveal(s, m.x, m.y, 2); }
  G.report(s, [m.owner], `Scouting report: ${mi.name}, free city (${m.x}, ${m.y})`, 'info', { scout: true, intel });
  G.sendHome(s, m, m.units);
};
const arriveBattle = (s, m, mi, t) => {
  const me = s.empires[m.owner];
  const home = s.cities[m.from];
  if (mi.subject === m.owner) { G.sendHome(s, m, m.units); return; }
  const mode = m.type === 'raid' ? 'raid' : 'attack';
  let attMult = home ? 1 + 0.01 * G.lvl(home, 'warpit') : 1;
  if (m.units.hero && G.heroLeadership) attMult *= G.heroLeadership(s, m.owner);
  attMult *= G.mageBoost(s, m.owner, m.units);
  const d = G.minorDefense(s, mi);
  const defHad = { ...mi.units };
  const hadPatron = mi.patron, hadSubject = mi.subject;
  const r = G.battle(s, m.owner, m.units, attMult, null, mi.units, d.mult, d.flat, mode);
  mi.units = Object.fromEntries(Object.entries(r.defLeft).filter(([, n]) => n > 0));
  anger(s, mi, m.owner, m.type);
  let loot = {};
  if (G.unitsCount(r.attLeft)) loot = takeLoot(mi.stores, G.carryOf(s, m.owner, r.attLeft) * (mode === 'raid' ? 1 : 0.7));
  if (r.win && G.unitsCount(defHad) > 0) me.wins = (me.wins || 0) + 1;
  const notes = [];
  if (r.win && mode === 'attack') {
    const drop = G.rint(20, 30) + (m.type === 'conquer' ? G.rint(20, 32) * (r.attLeft.herald || 0) : 0);
    mi.resolve = Math.max(0, mi.resolve - drop);
    notes.push(`The resolve of ${mi.name} fell by ${drop} to ${Math.round(mi.resolve)}.`);
  }
  for (const h of G.battleHooks) h(s, { m, r, site: 'minor', defOwner: null, tile: t, defHad, minor: mi });
  const owners = [m.owner]; if (hadPatron && hadPatron !== m.owner) owners.push(hadPatron); if (hadSubject && !owners.includes(hadSubject)) owners.push(hadSubject);
  if (r.win && mode === 'attack' && mi.resolve <= 0 && G.unitsCount(r.attLeft) > 0) {
    const garrison = { ...r.attLeft }; delete garrison.herald;
    const c = capture(s, mi, m.owner, garrison);
    G.report(s, owners, `${mi.name} has fallen to the ${me.name}!`, m.owner === 'p' ? 'win' : 'loss',
      { att: me.name, def: mi.name, A: r.A, D: r.D, attSent: m.units, attLost: r.attLost, defHad, defLost: r.defLost, loot: {}, extra: notes.concat([c ? `${mi.name} is now a city of the ${me.name}.` : `${mi.name} now pays tribute to the ${me.name}.`]).join(' ') });
    if (!c) G.sendHome(s, m, garrison, loot);
    else if (Object.keys(loot).length) G.gain(s, c, loot);
    return;
  }
  if (!notes.length) notes.push(r.win ? 'The defenders broke.' : 'The free city held its walls.');
  if (hadPatron === 'p' && m.owner !== 'p') G.log(s, 'p', `⚠️ The ${me.name} attacked ${mi.name}, which looks to you as patron!`, 'warn');
  const verb = mode === 'raid' ? 'Raid' : m.type === 'conquer' ? 'Conquest' : 'Assault';
  G.report(s, owners, `${verb} on ${mi.name}: ${me.name} ${r.win ? 'won' : 'was repelled'}`, (m.owner === 'p') === r.win ? 'win' : 'loss',
    { att: me.name, def: mi.name, A: r.A, D: r.D, attSent: m.units, attLost: r.attLost, defHad, defLost: r.defLost, loot, extra: notes.join(' ') });
  G.sendHome(s, m, r.attLeft, loot);
};
const baseResolve = G.resolveMove;
G.resolveMove = (s, m) => {
  const t = G.tileAt(s, m.x, m.y);
  const mi = m.type !== 'return' && G.minorAt(s, t);
  if (!mi) return baseResolve(s, m);
  if (m.owner === 'p') G.reveal(s, m.x, m.y, 1);
  if (!s.empires[m.owner] || s.empires[m.owner].dead) return;
  switch (m.type) {
    case 'trade': return arriveTrade(s, m, mi);
    case 'scout': return arriveScout(s, m, mi, t);
    case 'raid': case 'attack': case 'conquer': return arriveBattle(s, m, mi, t);
    case 'settle': G.log(s, m.owner, `The settlers found ${mi.name} standing there and turned back.`, 'bad'); return G.sendHome(s, m, m.units);
    default: return G.sendHome(s, m, m.units, m.cargo);
  }
};

// sending: no settling on a free city (AI settlers are steered to a nearby tile), no tribute-city attacks
const baseSend = G.sendArmy;
G.sendArmy = (s, fromId, x, y, type, units, cargo) => {
  const t = G.tileAt(s, x, y);
  const mi = G.minorAt(s, t);
  if (mi) {
    const city = s.cities[fromId];
    if (type === 'settle') {
      if (!city || city.owner === 'p') return `${mi.name} stands here`;
      const alt = s.tiles.filter(o => !occupied(o) && !G.isWater(o) && !(DATA.terrain[o.terrain] || {}).impassable && G.dist(o, t) <= 3 && G.dist(o, mi) >= 2
        && Object.values(s.cities).every(c => G.dist(c, o) >= 2.8) && G.landReachable(s, city, o)).sort((a, b) => G.dist(a, t) - G.dist(b, t))[0];
      if (!alt) return `${mi.name} stands here`;
      return baseSend(s, fromId, alt.x, alt.y, type, units, cargo);
    }
    if (type === 'reinforce' || type === 'adventure') return 'Free cities do not take in foreign troops';
    if (['raid', 'attack', 'conquer'].includes(type) && city && mi.subject === city.owner) return `${mi.name} already pays you tribute`;
  }
  return baseSend(s, fromId, x, y, type, units, cargo);
};
// battle preview against a free city (needs a scouting report)
const basePreview = G.previewBattle;
G.previewBattle = (s, city, tile, units, mode) => {
  const mi = G.minorAt(s, tile);
  if (!mi) return basePreview(s, city, tile, units, mode);
  if (!G.unitsCount(units)) return null;
  const intel = s.intel[G.tileIdx(s, tile)];
  if (!intel) return { known: false };
  let attMult = 1 + 0.01 * G.lvl(city, 'warpit');
  if (units.hero && G.heroLeadership) attMult *= G.heroLeadership(s, city.owner);
  const d = G.minorDefense(s, mi);
  const r = G.battle(s, city.owner, units, attMult, null, { ...intel.units }, d.mult, d.flat, mode === 'raid' ? 'raid' : 'attack');
  return { known: true, estimated: false, age: s.time - intel.t, ...r };
};
// nothing else may be placed on a free city's tile
const baseFree = G.freeTile;
G.freeTile = (s, pred, tries) => baseFree(s, t => !t.minor && pred(t), tries);
// old saves get their free cities when loaded
const baseMigrate = G.migrate;
G.migrate = s => { const r = baseMigrate(s) || s; try { ensure(r); } catch (e) { if (typeof console !== 'undefined') console.error('free cities migrate', e); } return r; };

// clearing a brigand camp a free city asked about
G.battleHooks.push((s, ctx) => {
  if (ctx.site !== 'camp' || !ctx.tile || ctx.tile.camp || !s.minors) return;
  for (const mi of Object.values(s.minors)) {
    const r = mi.req;
    if (r && (r.type === 'clear' || r.type === 'defend') && r.x === ctx.tile.x && r.y === ctx.tile.y) completeRequest(s, mi, ctx.m.owner);
  }
});

// ---------------------------------------------------------------------
// Slow tick: garrisons, stores, influence decay, requests, patronage, gifts
// ---------------------------------------------------------------------
const patronGift = (s, mi) => {
  const owner = mi.patron, cap = G.capital(s, owner);
  if (!cap) return;
  const k = (mi.ally ? 2 : 1) * Math.min(4, G.minorScale(s));
  const emp = s.empires[owner];
  let what = '';
  switch (mi.kind) {
    case 'mercenary':
      if (mi.ally) { const u = garrisonTypes(mi.race).atk, n = 1 + mi.size; cap.units[u] = (cap.units[u] || 0) + n; what = `${n} ${DATA.units[u].name}`; }
      else { const v = Math.round(8 * k); G.gain(s, cap, { weapons: v }); what = `${v} weapons`; }
      break;
    case 'merchant': { const v = Math.round(50 * k); emp.gold += v; what = `${v} gold`; break; }
    case 'mage': { const v = Math.round(30 * k); G.gain(s, cap, { mana: v }); what = `${v} mana`; break; }
    case 'temple':
      if (emp.faith !== undefined) { const v = Math.round(10 * k); emp.faith += v; emp.faithTotal = (emp.faithTotal || 0) + v; what = `${v} faith`; }
      else { const v = Math.round(40 * k); emp.gold += v; what = `${v} gold`; }
      break;
    case 'maritime': { const v = Math.round(200 * k); G.gain(s, cap, { grain: v }); what = `${v} grain`; break; }
    case 'forge': { const v = Math.round(6 * k), w = Math.round(20 * k); G.gain(s, cap, { tools: v, iron: w }); what = `${v} tools and ${w} iron`; break; }
  }
  if (what) G.log(s, owner, `🎁 ${mi.name} sends ${what} to ${cap.name}.`, 'info');
};
G.slowHooks.push((s, dtMin) => {
  const minors = ensure(s);
  if (!BOON.get(s.minors)) rebuildBoons(s);
  const pt = paceT(s), prod = G.pace(s).prod;
  for (const mi of Object.values(minors)) {
    // garrison and stores regrow
    const target = garrisonTarget(s, mi);
    if (G.unitsCount(mi.units) < target) {
      mi.grow = (mi.grow || 0) + 0.25 * mi.size * (DATA.minorKinds[mi.kind].garrison || 1) * dtMin * prod;
      if (mi.grow >= 1) {
        const n = Math.floor(mi.grow), gt = garrisonTypes(mi.race);
        mi.grow -= n;
        const u = Math.random() < 0.65 ? gt.def : gt.atk;
        mi.units[u] = (mi.units[u] || 0) + n;
      }
    }
    const st = storesTarget(s, mi);
    for (const [g, v] of Object.entries(st)) if ((mi.stores[g] || 0) < v) mi.stores[g] = Math.min(v, (mi.stores[g] || 0) + v * 0.02 * dtMin * prod);
    mi.resolve = Math.min(100, mi.resolve + M.resolveRegen * dtMin / pt);
    // tribute cities
    if (mi.subject) {
      if (!alive(s, mi.subject)) { G.log(s, 'p', `🏰 ${mi.name} throws off the yoke of the fallen ${s.empires[mi.subject] ? s.empires[mi.subject].name : 'realm'} and is free again.`, 'info'); mi.subject = null; mi.resolve = 100; continue; }
      s.empires[mi.subject].gold += G.minorTribute(s, mi) * dtMin;
      continue;
    }
    // influence: neighbours' pull, then decay
    for (const e of Object.values(s.empires)) {
      if (e.dead) { delete mi.inf[e.id]; continue; }
      const n = G.citiesOf(s, e.id).filter(c => G.dist(c, mi) <= M.neighbourDist).length;
      if (n && (mi.inf[e.id] || 0) < M.neighbourCap && !((mi.grudge[e.id] || 0) > s.time)) mi.inf[e.id] = Math.min(M.neighbourCap, (mi.inf[e.id] || 0) + M.neighbourRate * n * dtMin / pt);
    }
    for (const [o, v] of Object.entries(mi.inf)) {
      const nv = v - (M.decayBase + v * M.decayRate) * dtMin / pt;
      if (nv > 0.05) mi.inf[o] = nv; else delete mi.inf[o];
    }
    for (const [o, until] of Object.entries(mi.grudge)) if (until <= s.time) delete mi.grudge[o];
    // requests
    const r = mi.req;
    if (r && (r.type === 'clear' || r.type === 'defend') && !s.camps[r.camp]) { mi.req = null; mi.nextReq = s.time + G.rnd(M.reqEvery[0], M.reqEvery[1]) * 60 * pt; }
    else if (r && r.expires <= s.time) {
      if (r.type === 'defend' && s.camps[r.camp]) {
        // the raiders strike
        const camp = s.camps[r.camp], d = G.minorDefense(s, mi);
        const res = G.battle(s, null, camp.units, 1, null, mi.units, d.mult, d.flat, 'raid');
        mi.units = Object.fromEntries(Object.entries(res.defLeft).filter(([, n]) => n > 0));
        if (res.win) { for (const g of Object.keys(mi.stores)) mi.stores[g] *= 0.6; mi.resolve = Math.max(10, mi.resolve - 20); }
        const ct = G.tileAt(s, camp.x, camp.y); if (ct) ct.camp = null; delete s.camps[camp.id];
        if (seenBy(s, mi) && (mi.inf.p || 0) >= 5) G.log(s, 'p', `🏰 Raiders fell on ${mi.name}${res.win ? ' and plundered it' : ', but were thrown back'}. Nobody came to help.`, res.win ? 'warn' : 'info');
      }
      mi.req = null; mi.nextReq = s.time + G.rnd(M.reqEvery[0], M.reqEvery[1]) * 60 * pt;
    } else if (!r && s.time >= mi.nextReq) {
      if (!newRequest(s, mi)) mi.nextReq = s.time + 10 * 60 * pt;
    }
    updatePatron(s, mi);
    // the patron's boon: faith, and gifts now and then
    if (mi.patron) {
      const k = DATA.minorKinds[mi.kind];
      const e = s.empires[mi.patron];
      if (k.faith && e.faith !== undefined) { const f = k.faith[mi.ally ? 1 : 0] * dtMin * prod; e.faith += f; e.faithTotal = (e.faithTotal || 0) + f; }
      if (!mi.nextGift) mi.nextGift = s.time + M.giftEvery * 60 * pt;
      else if (s.time >= mi.nextGift) { mi.nextGift = s.time + M.giftEvery * 60 * pt * (mi.ally ? 1 : 1.6); patronGift(s, mi); }
    } else mi.nextGift = 0;
  }
});

// ---------------------------------------------------------------------
// AI: court the free cities that suit them, answer requests, and now and
// then storm one (the more warlike the people, the likelier)
// ---------------------------------------------------------------------
const offense = (s, owner, city) => {
  const off = {};
  for (const [u, n] of Object.entries(city.units)) {
    const d = DATA.units[u];
    if (d && d.at && d.type !== 'civ' && d.type !== 'siege' && d.type !== 'ship' && n > 0 && d.atk >= (d.defI + d.defC) / 2 * 0.8) off[u] = Math.floor(n * 0.8);
  }
  return off;
};
const minorDefPower = (s, mi) => G.defPower(s, null, mi.units) * G.minorDefense(s, mi).mult + G.minorDefense(s, mi).flat;
G.minorDefPower = minorDefPower;
G.aiHooks.push((s, emp, dtMin) => {
  if (!s.minors) return;
  emp.minorClock = (emp.minorClock || 0) + dtMin;
  if (emp.minorClock < 2 * paceT(s)) return;
  emp.minorClock = 0;
  const cities = G.citiesOf(s, emp.id);
  if (!cities.length) return;
  const list = Object.values(s.minors).map(mi => ({ mi, d: Math.min(...cities.map(c => G.dist(c, mi))) })).filter(o => o.d <= 14);
  if (!list.length) return;
  const pref = RACE_PREF[emp.race] || [];
  // 1. answer requests
  for (const { mi } of list) {
    const r = mi.req;
    if (!r || mi.subject) continue;
    if (r.type === 'deliver') {
      // the AI buys the goods from its merchants rather than emptying a city's stores
      const cost = Math.round(r.amount * DATA.goods[r.good].value * 1.6);
      if (emp.gold > 400 + 200 * cities.length + cost && Math.random() < 0.7 && !canDeal(s, mi, emp.id)) {
        emp.gold -= cost; completeRequest(s, mi, emp.id); return;
      }
    } else if (!(r.aiSent && r.aiSent[emp.id] > s.time)) {
      const camp = s.camps[r.camp];
      if (!camp) continue;
      const D = G.defPower(s, null, camp.units) + 5 * camp.tier;
      for (const c of cities.filter(c => G.dist(c, camp) <= 10).sort((a, b) => G.dist(a, camp) - G.dist(b, camp))) {
        const off = offense(s, emp.id, c);
        if (G.atkPower(s, emp.id, off) * G.mod(s, emp.id, null, 'atk') > D * 1.5 && G.landReachable(s, c, camp) && !G.sendArmy(s, c.id, camp.x, camp.y, 'attack', off)) {
          r.aiSent = r.aiSent || {}; r.aiSent[emp.id] = s.time + 10 * 60 * paceT(s);
          return;
        }
      }
    }
  }
  // 2. gifts of gold, where it buys the most
  const reserve = 500 + 250 * cities.length + (emp.saving ? 700 : 0);
  if (emp.gold > reserve) {
    let best = null, bs = -1e9;
    for (const { mi, d } of list) {
      if (mi.subject || (mi.grudge[emp.id] || 0) > s.time) continue;
      const mine = mi.inf[emp.id] || 0;
      if (mine >= 75) continue;
      const top = G.minorRanking(s, mi).find(x => x.owner !== emp.id);
      const rival = top ? top.inf : 0;
      let sc = (pref[0] === mi.kind ? 3 : pref[1] === mi.kind ? 2 : 1) - d * 0.15 + Math.random();
      if (mi.patron === emp.id && mine - rival < 15) sc += 2;                        // defend a patronage
      else if (mi.patron && mi.patron !== emp.id && rival - mine < 30) sc += 1.5;    // contest one
      else if (!mi.patron && mine + 25 >= M.patronMin) sc += 1;
      if (sc > bs) { bs = sc; best = mi; }
    }
    if (best && Math.random() < 0.6 + 0.3 * (1 - emp.aggr)) {
      const amt = Math.round(G.clamp((emp.gold - reserve) * 0.35, 60, 500 * G.minorScale(s)));
      if (G.minorGift(s, emp.id, best.id, amt) === null) return;
    }
  }
  // 3. conquest — warlike realms, later in the game
  const pressure = G.aiPressure(s);
  if (pressure < 0.4 || (emp.minorWarAt || 0) > s.time || Math.random() > emp.aggr * pressure * 0.35) return;
  for (const { mi, d } of list.sort((a, b) => a.d - b.d)) {
    if (d > 10 || mi.patron === emp.id || mi.subject === emp.id) continue;
    if (mi.patron === 'p' && G.hostility(s, emp.id, 'p') <= 0.3) continue;
    const D = minorDefPower(s, mi);
    for (const c of cities.filter(c => G.dist(c, mi) <= 10)) {
      const off = offense(s, emp.id, c);
      const A = G.atkPower(s, emp.id, off) * G.mod(s, emp.id, null, 'atk');
      if (A < D * 1.4 || !G.landReachable(s, c, mi)) continue;
      const army = { ...off };
      const type = (c.units.herald || 0) > 0 && mi.resolve < 70 ? 'conquer' : 'attack';
      if (type === 'conquer') army.herald = 1;
      if (!G.sendArmy(s, c.id, mi.x, mi.y, type, army)) { emp.minorWarAt = s.time + M.aiWarCool * 60 * paceT(s); return; }
    }
  }
});

// new worlds get their free cities once the camps, oases, ruins, ley lines and holy sites exist
G.newGameHooks.push(s => { s.minors = {}; G.placeMinors(s); });
})();
