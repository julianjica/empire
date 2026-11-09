// =====================================================================
//  Espionage. A Spymaster's Den lets a city recruit spies (gold and a
//  couple of citizens). Spies slip to a rival city, work there for a
//  while and either succeed — intelligence, sabotage, poisoned stores,
//  sedition, stolen secrets, siphoned mana, a wounded hero, even a city
//  persuaded to defect — or fail, and may be caught: a diplomatic
//  incident. Spies left at home guard their city (counter-intelligence).
//  Every people has its own flair (DATA.spyRace). The AI plays too.
//    s.espionage = { spies:{id:spy}, dossiers:{owner:{cityId:dossier}}, feed:[...], ai:{owner:{next}}, caught:{owner:n}, stats:{owner:{ok,fail}} }
//    spy = { id, owner, name, level, xp, home, status:'training'|'idle'|'travel'|'work'|'return', ready, task:{type,target,from,phase,t0,t1,result} }
// =====================================================================
'use strict';
(() => {

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
DATA.buildings.hideout = {
  name: "Spymaster's Den", icon: '🕵️', max: 20, time: 26, growth: 1.38,
  cost: { timber: 140, stone: 110, grain: 60, gold: 80 },
  desc: 'A discreet house of whispers. Recruits spies, sends them against rival cities and guards this city against foreign agents. Each level adds counter-intelligence and, every third level, room for another spy.',
  req: { townhall: 3 },
};
if (!DATA.buildingOrder.includes('hideout')) DATA.buildingOrder.push('hideout');
{
  const mil = DATA.buildingGroups.findIndex(g => g.name === 'Military');
  if (!DATA.buildingGroups.some(g => g.list.includes('hideout'))) DATA.buildingGroups.splice(mil < 0 ? DATA.buildingGroups.length : mil + 1, 0, { name: 'Intrigue', list: ['hideout'] });
}

// a realm-wide study that sharpens both sides of the shadow war
DATA.techs.ciphers = { name: 'Ciphers & Watchmen', icon: '🗝️', cat: 'Military', ac: 4, fx: { counterintel: 1.25, spy: 1.1 }, desc: '+25% counter-intelligence in every city; your spies are 10% more capable.' };

// missions. base: success chance before skill and defenses · time: game-seconds at the target (× pace)
// hostile: 0 harmless … 3 grave (drives the size of an incident) · bribe: the target's people must be swayed
DATA.missions = {
  intel:    { name: 'Gather Intelligence', icon: '🔍', base: 0.85, time: 90,  gold: 40,  xp: 10, hostile: 0, desc: 'Count the garrison, stores, building queue, studies and hero. Fresh intelligence also helps later missions against the city.' },
  sabotage: { name: 'Sabotage',            icon: '💣', base: 0.6,  time: 150, gold: 120, xp: 25, hostile: 2, desc: 'Wreck the works: delay the building under construction, or knock a building down a level.' },
  poison:   { name: 'Poison the Stores',   icon: '☠️', base: 0.6,  time: 120, gold: 90,  xp: 20, hostile: 2, desc: 'Spoil a third of the grain (slowing growth for a while) or set the timber yards ablaze.' },
  unrest:   { name: 'Incite Unrest',       icon: '📢', base: 0.6,  time: 150, gold: 110, xp: 22, hostile: 1, bribe: true, desc: 'Agitators and pamphlets: happiness falls for 20 minutes and loyalty drops.' },
  tech:     { name: 'Steal Secrets',       icon: '📜', base: 0.45, time: 200, gold: 150, xp: 30, hostile: 1, desc: 'Copy the scholars\' notes: learn a technique they know and you do not, or sell their ledgers.' },
  mana:     { name: 'Siphon Mana',         icon: '✨', base: 0.55, time: 120, gold: 80,  xp: 20, hostile: 1, desc: 'Drain mana from their stores into your spy\'s home city.' },
  wound:    { name: 'Strike at the Hero',  icon: '🗡️', base: 0.4,  time: 180, gold: 160, xp: 35, hostile: 3, minLevel: 2, desc: 'Ambush their hero in the city: grievous wounds keep them from marching for a while. Nobody is assassinated outright.' },
  defect:   { name: 'Plot a Defection',    icon: '🏳️', base: 0.3,  time: 300, gold: 400, xp: 60, hostile: 3, minLevel: 3, bribe: true, desc: 'Turn a disloyal city (loyalty under 40, not a capital) to your banner. Its garrison scatters. If loyalty is too high when the plot ripens, it only shakes it.' },
};
DATA.missionOrder = ['intel', 'sabotage', 'poison', 'unrest', 'tech', 'mana', 'wound', 'defect'];

// each people's flair. spy: skill · counter: counter-intelligence · travel: how fast agents move
// bribe: resistance to sedition and defection · cost: recruiting cost · fav: per-mission skill
const SPY_DEFAULT = { spy: 1, counter: 1, travel: 1, bribe: 1, cost: 1, fav: {} };
DATA.spyRace = Object.assign(Object.fromEntries(DATA.raceOrder.map(r => [r, {}])), DATA.spyRace || {}, {
  hearth: { counter: 1.1, cost: 0.9, note: 'Close-knit villages notice strangers (+10% counter-intelligence); spies are cheaper to recruit.' },
  delver: { counter: 1.2, spy: 0.95, note: 'Sealed halls and runed doors (+20% counter-intelligence), but their agents are conspicuous above ground.' },
  sylvan: { spy: 1.1, travel: 1.2, fav: { intel: 1.15 }, note: 'Woodcraft: skilled, swift agents, keen observers.' },
  ash:    { counter: 0.9, fav: { sabotage: 1.25, poison: 1.15 }, note: 'Fire and ruin come naturally: sabotage and poison are their strength. Their camps are easy to infiltrate.' },
  tide:   { travel: 1.25, fav: { tech: 1.15, mana: 1.1 }, note: 'Smugglers along every coast: swift agents, deft thieves of secrets and mana.' },
  veil:   { spy: 1.3, counter: 1.15, fav: { unrest: 1.2, defect: 1.2 }, note: 'Masters of glamour: the finest spies in the world, best at sowing doubt and turning hearts.' },
  grave:  { spy: 0.9, counter: 1.05, bribe: 1.6, fav: { wound: 1.2 }, note: 'The dead cannot be bribed: their cities shrug off sedition and defection.' },
  wind:   { travel: 1.6, fav: { intel: 1.3 }, note: 'Windkin scouts ride the gales: the fastest agents, superb at gathering intelligence.' },
});
const raceFx = (s, owner) => {
  const e = s.empires[owner];
  return Object.assign({}, SPY_DEFAULT, (e && DATA.spyRace[e.race]) || {});
};
G.spyRaceFx = raceFx;

const SPY_NAMES = ['Wren', 'Nightjar', 'Mags the Quiet', 'Old Tobin', 'Silk', 'Ashe', 'Corvin', 'Lark', 'Pell', 'Moth', 'Ysolde', 'Grey Hob', 'Thistle', 'Vesper', 'Rook', 'Sable', 'Fennick', 'Marrow', 'Ilse', 'Quill', 'Juniper', 'Dace', 'Hollis', 'Briar'];
const XP_LEVELS = [0, 20, 50, 100, 170, 260];
G.SPY_MAX_LEVEL = XP_LEVELS.length;

// ---------------------------------------------------------------------
// State (lazy, so saves made before espionage existed load cleanly)
// ---------------------------------------------------------------------
const esp = s => {
  const E = s.espionage = s.espionage || {};
  for (const k of ['spies', 'dossiers', 'ai', 'caught', 'stats']) E[k] = E[k] || {};
  E.feed = E.feed || [];
  return E;
};
G.espState = esp;
const paceT = s => G.pace(s).time;
const spiesOf = (s, owner) => Object.values(esp(s).spies).filter(x => x.owner === owner);
G.spiesOf = spiesOf;
const foreign = (s, owner, city) => city && city.owner !== owner && s.empires[city.owner] && !s.empires[city.owner].dead;

// keep a short history for the player's Espionage tab
const feed = (s, entry) => {
  const E = esp(s);
  E.feed.unshift(Object.assign({ t: s.time }, entry));
  if (E.feed.length > 40) E.feed.length = 40;
};

// ---------------------------------------------------------------------
// Recruiting
// ---------------------------------------------------------------------
G.spyCap = (s, owner) => Math.min(12, G.citiesOf(s, owner).reduce((a, c) => a + (G.lvl(c, 'hideout') ? 1 + Math.floor(G.lvl(c, 'hideout') / 3) : 0), 0));
G.spyCost = (s, owner) => {
  const n = spiesOf(s, owner).length;
  return { gold: Math.round(60 * (1 + 0.2 * n) * raceFx(s, owner).cost / 5) * 5, grain: 40 };
};
G.SPY_POP = 2;
G.spyTrainTime = (s, city) => Math.round(150 * paceT(s) / (1 + 0.05 * Math.max(0, G.lvl(city, 'hideout') - 1)));
G.recruitStatus = (s, cityId) => {
  const city = s.cities[cityId];
  if (!city) return { ok: false, reason: 'No such city' };
  const cost = G.spyCost(s, city.owner);
  const res = { ok: true, cost, time: G.spyTrainTime(s, city), cap: G.spyCap(s, city.owner), have: spiesOf(s, city.owner).length };
  if (!G.lvl(city, 'hideout')) return { ...res, ok: false, locked: true, reason: `Build a Spymaster's Den in ${city.name}` };
  if (res.have >= res.cap) return { ...res, ok: false, reason: `Your dens can keep ${res.cap} spies; raise a den to keep more` };
  if (city.pop - G.SPY_POP < 5) return { ...res, ok: false, poor: true, reason: 'Not enough citizens' };
  if (!G.canAfford(s, city, cost)) return { ...res, ok: false, poor: true, reason: 'Not enough goods' };
  return res;
};
G.recruitSpy = (s, cityId) => {
  const st = G.recruitStatus(s, cityId);
  if (!st.ok) return st.reason;
  const city = s.cities[cityId];
  G.pay(s, city, st.cost);
  city.pop -= G.SPY_POP;
  const used = new Set(spiesOf(s, city.owner).map(x => x.name));
  const name = G.pick(SPY_NAMES.filter(n => !used.has(n))) || G.pick(SPY_NAMES) + ' ' + G.rint(2, 9);
  const id = G.newId(s, 'sp');
  esp(s).spies[id] = { id, owner: city.owner, name, level: 1, xp: 0, home: city.id, status: 'training', ready: s.time + st.time, task: null };
  return null;
};
G.dismissSpy = (s, spyId) => {
  const sp = esp(s).spies[spyId];
  if (!sp) return 'No such spy';
  if (sp.status !== 'idle' && sp.status !== 'training') return 'The spy is in the field';
  const home = s.cities[sp.home];
  if (home && home.owner === sp.owner) home.pop += G.SPY_POP;
  delete esp(s).spies[spyId];
  return null;
};

// ---------------------------------------------------------------------
// Skill, counter-intelligence and odds
// ---------------------------------------------------------------------
G.modSources.push((s, owner, city, key) => {
  if (key !== 'spy' && key !== 'counterintel' && key !== 'spyTravel') return 1;
  const r = raceFx(s, owner);
  return key === 'spy' ? r.spy : key === 'counterintel' ? r.counter : r.travel;
});
const guardsOf = (s, city) => Object.values(esp(s).spies).filter(x => x.owner === city.owner && x.home === city.id && x.status === 'idle');
G.cityGuards = guardsOf;
G.counterIntel = (s, city) => {
  const g = guardsOf(s, city).map(x => x.level).sort((a, b) => b - a).slice(0, 3);
  const base = 0.5 + 0.08 * G.lvl(city, 'hideout') + 0.12 * g.reduce((a, b) => a + b, 0) + 0.015 * G.lvl(city, 'wall');
  return base * G.mod(s, city.owner, city, 'counterintel');
};
G.spyPower = (s, spy, type) => (0.9 + 0.15 * (spy.level - 1)) * G.mod(s, spy.owner, null, 'spy') * ((raceFx(s, spy.owner).fav || {})[type] || 1);
const freshDossier = (s, owner, cityId) => { const d = (esp(s).dossiers[owner] || {})[cityId]; return d && s.time - d.t < 1800 * paceT(s); };
G.missionChance = (s, spy, type, city) => {
  const md = DATA.missions[type];
  let def = G.counterIntel(s, city);
  if (md.bribe) def *= raceFx(s, city.owner).bribe;
  let p = md.base + 0.4 * (G.spyPower(s, spy, type) - def);
  if (type !== 'intel' && freshDossier(s, spy.owner, city.id)) p += 0.08;
  return G.clamp(p, 0.05, 0.95);
};
G.caughtChance = (s, spy, city) => G.clamp(0.45 + 0.08 * guardsOf(s, city).length + 0.02 * G.lvl(city, 'hideout') - 0.06 * (spy.level - 1), 0.15, 0.85);
G.spyTravelTime = (s, spy, from, to) => Math.max(30, Math.round(G.dist(from, to) * 45 * G.pace(s).travel / G.mod(s, spy.owner, null, 'spyTravel')));
G.missionTime = (s, type) => Math.round(DATA.missions[type].time * paceT(s));
G.missionCost = (s, type) => ({ gold: Math.round(DATA.missions[type].gold * (1 + 0.05 * Math.min(10, s.time / (3600 * paceT(s)))) / 5) * 5 });

// ---------------------------------------------------------------------
// Sending a spy
// ---------------------------------------------------------------------
G.missionStatus = (s, spyId, cityId, type) => {
  const spy = esp(s).spies[spyId], city = s.cities[cityId], md = DATA.missions[type];
  if (!md) return { ok: false, reason: 'Unknown mission' };
  const cost = G.missionCost(s, type);
  if (!spy) return { ok: false, cost, reason: 'Choose a spy' };
  const res = { ok: true, cost };
  if (!foreign(s, spy.owner, city)) return { ...res, ok: false, reason: 'Choose a rival city' };
  const home = s.cities[spy.home];
  res.travel = home ? G.spyTravelTime(s, spy, home, city) : 0;
  res.time = G.missionTime(s, type);
  res.chance = G.missionChance(s, spy, type, city);
  if (spy.status !== 'idle') return { ...res, ok: false, reason: spy.status === 'training' ? 'Still in training' : 'Already in the field' };
  if (md.minLevel && spy.level < md.minLevel) return { ...res, ok: false, locked: true, reason: `Needs a spy of level ${md.minLevel}` };
  if (spy.owner === 'p' && !s.explored[city.y * s.map + city.x]) return { ...res, ok: false, reason: 'You have never seen that city' };
  if (type === 'defect' && G.capital(s, city.owner) === city) return { ...res, ok: false, reason: 'A capital will not defect' };
  if (type === 'defect' && G.citiesOf(s, city.owner).length < 2) return { ...res, ok: false, reason: 'A realm\'s last city will not defect' };
  if (s.empires[spy.owner].gold < cost.gold) return { ...res, ok: false, poor: true, reason: 'Not enough gold' };
  return res;
};
G.sendSpy = (s, spyId, cityId, type) => {
  const st = G.missionStatus(s, spyId, cityId, type);
  if (!st.ok) return st.reason;
  const spy = esp(s).spies[spyId];
  s.empires[spy.owner].gold -= st.cost.gold;
  spy.status = 'travel';
  spy.task = { type, target: cityId, targetOwner: s.cities[cityId].owner, from: spy.home, phase: 'travel', t0: s.time, t1: s.time + st.travel, work: st.time };
  return null;
};
G.recallSpy = (s, spyId) => {
  const spy = esp(s).spies[spyId];
  if (!spy || !spy.task || spy.status === 'return') return 'Nothing to recall';
  const done = s.time - spy.task.t0;
  spy.status = 'return';
  spy.task.phase = 'return'; spy.task.result = 'recalled';
  spy.task.t0 = s.time; spy.task.t1 = s.time + Math.max(20, Math.min(done, 600));
  return null;
};

// ---------------------------------------------------------------------
// Mission effects. Each returns { text, detail? } describing what happened.
// ---------------------------------------------------------------------
const goodsText = res => Object.entries(res).filter(([, v]) => v > 0).map(([g, v]) => `${DATA.goods[g] ? DATA.goods[g].icon : ''}${Math.floor(v)} ${DATA.goods[g] ? DATA.goods[g].name.toLowerCase() : g}`).join(', ');
const unitsText = units => Object.entries(units || {}).filter(([, n]) => n > 0).map(([u, n]) => `${n} ${DATA.units[u] ? DATA.units[u].name : u}`).join(', ') || 'no troops';
const ownerLabel = (s, o) => o === 'p' ? 'your realm' : `the ${s.empires[o].name}`;

G.dossierOf = (s, city) => {
  const tOwner = city.owner, R = G.research(s, tOwner), h = G.heroOf(s, tOwner);
  const train = Object.values(city.train || {}).flat().map(q => ({ unit: q.unit, left: q.left }));
  return {
    t: s.time, city: city.id, name: city.name, owner: tOwner, x: city.x, y: city.y,
    units: { ...city.units }, res: Object.fromEntries(DATA.goodOrder.map(g => [g, Math.floor(city.res[g] || 0)]).filter(([, v]) => v > 0)),
    wall: G.lvl(city, 'wall'), th: G.lvl(city, 'townhall'), loyalty: Math.round(city.loyalty ?? 100), pop: Math.round(city.pop),
    happy: G.happyOf ? G.happyOf(city) : null, hideout: G.lvl(city, 'hideout'), guards: guardsOf(s, city).length,
    queue: city.buildQueue.map(q => ({ type: q.type, level: q.level, end: q.end })), train,
    techs: Object.keys(R.done || {}), studying: R.active ? R.active.id : null, studies: (R.studies || []).map(x => x.id),
    hero: h && !h.dead ? { name: h.name, level: h.level, hp: Math.round(h.hp), here: (city.units.hero || 0) > 0 } : null,
    buildings: { ...city.buildings },
  };
};
const dossierText = (s, d) => [
  `Garrison: ${unitsText(Object.fromEntries(Object.entries(d.units).filter(([u]) => u !== 'hero')))}.`,
  `Stores: ${goodsText(d.res) || 'empty'}.`,
  `Wall ${d.wall} · Town Hall ${d.th} · ${d.pop} people · loyalty ${d.loyalty}%${d.happy !== null ? ` · happiness ${d.happy}` : ''}.`,
  `Building: ${d.queue.length ? d.queue.map(q => `${DATA.buildings[q.type] ? DATA.buildings[q.type].name : q.type} ${q.level}`).join(', ') : 'nothing'}.`,
  d.train.length ? `Training: ${d.train.map(q => `${q.left} ${DATA.units[q.unit] ? DATA.units[q.unit].name : q.unit}`).join(', ')}.` : 'Training: nothing.',
  `Scholars know ${d.techs.length} technique${d.techs.length === 1 ? '' : 's'}${d.studying && DATA.techs[d.studying] ? `, studying ${DATA.techs[d.studying].name}` : ''}.`,
  d.hero ? `Hero ${d.hero.name} (level ${d.hero.level}, ${d.hero.hp} health) is ${d.hero.here ? 'in the city' : 'elsewhere'}.` : 'No living hero.',
  `Counter-intelligence: den ${d.hideout || 'none'}, ${d.guards} spy guard${d.guards === 1 ? '' : 's'}.`,
].join(' ');

G.dossierText = dossierText;

const EFFECTS = {
  intel(s, spy, city) {
    const d = G.dossierOf(s, city);
    const D = esp(s).dossiers;
    if (spy.owner === 'p') {
      (D.p = D.p || {})[city.id] = d;
      s.intel[G.tileIdx(s, city)] = { t: s.time, name: d.name, owner: d.owner, units: d.units, res: d.res, wall: d.wall, th: d.th, loyalty: d.loyalty };
      G.reveal(s, city.x, city.y, 2);
    } else (D[spy.owner] = D[spy.owner] || {})[city.id] = { t: s.time };
    return { text: `${spy.name} mapped every secret of ${city.name}.`, detail: dossierText(s, d) };
  },
  sabotage(s, spy, city) {
    const q = city.buildQueue[0];
    if (q) {
      const delay = Math.round(Math.min(q.dur * 0.5 + 60 * paceT(s), 1800 * paceT(s)));
      for (const it of city.buildQueue) { if (it !== q) it.start += delay; it.end += delay; }
      q.dur += delay;
      return { text: `Saboteurs set back the ${DATA.buildings[q.type] ? DATA.buildings[q.type].name : q.type} in ${city.name} by ${Math.round(delay / 60)} min.` };
    }
    const pref = ['wall', 'hideout', 'smithy', 'armory', 'smelter', 'barracks', 'market', 'warehouse', 'stable', 'workshop'];
    const opts = Object.keys(city.buildings).filter(b => city.buildings[b] > 1 && b !== 'townhall' && DATA.buildings[b] && !DATA.buildings[b].wonder);
    const b = pref.find(x => opts.includes(x) && Math.random() < 0.6) || G.pick(opts);
    if (!b) return { text: `${spy.name} found nothing in ${city.name} worth wrecking.` };
    city.buildings[b]--;
    return { text: `Saboteurs wrecked the ${DATA.buildings[b].name} of ${city.name} (now level ${city.buildings[b]}).` };
  },
  poison(s, spy, city) {
    const food = (city.res.grain || 0) + (city.res.bread || 0) * 3 >= (city.res.timber || 0);
    if (food) {
      const g = Math.floor((city.res.grain || 0) * 0.33), b = Math.floor((city.res.bread || 0) * 0.33);
      city.res.grain -= g; if (b) city.res.bread -= b;
      city.mods = (city.mods || []).filter(m => m.until > s.time);
      city.mods.push({ key: 'popGrowth', mult: 0.7, until: s.time + 15 * 60 * paceT(s), label: '☠️ Poisoned stores' });
      return { text: `Poison spoiled ${goodsText({ grain: g, bread: b }) || 'what little food there was'} in ${city.name}; sickness slows its growth.` };
    }
    const t = Math.floor((city.res.timber || 0) * 0.3);
    city.res.timber -= t;
    return { text: `The timber yards of ${city.name} burned: ${t} timber lost.` };
  },
  unrest(s, spy, city) {
    city.sedition = s.time + 20 * 60 * paceT(s);
    const drop = Math.round(8 + 3 * spy.level);
    city.loyalty = Math.max(1, (city.loyalty ?? 100) - drop);
    if (G.updateHappiness) G.updateHappiness(s, city);
    return { text: `Agitators stir up ${city.name}: unhappiness spreads and loyalty falls by ${drop} to ${Math.round(city.loyalty)}%.` };
  },
  tech(s, spy, city) {
    const mine = G.research(s, spy.owner).done, theirs = G.research(s, city.owner).done;
    const myRace = s.empires[spy.owner].race;
    const opts = Object.keys(theirs).filter(id => { const t = DATA.techs[id]; return t && !t.repeat && !mine[id] && (t.reqs || (t.req ? [t.req] : [])).every(r => mine[r]) && (!t.race || t.race === myRace); });
    if (opts.length) {
      const id = G.pick(opts);
      mine[id] = true;
      if (G.bumpEpoch) G.bumpEpoch();
      const R = G.research(s, spy.owner);
      if ((R.studies || []).some(x => x.id === id)) G.cancelResearch(s, spy.owner, id);   // refunds half of that study
      return { text: `${spy.name} copied the scholars' notes in ${city.name}: you now know ${DATA.techs[id].icon} ${DATA.techs[id].name}.`, tech: id };
    }
    const tEmp = s.empires[city.owner];
    const gold = Math.round(Math.min(Math.max(0, tEmp.gold) * 0.1, 300) + 40);
    tEmp.gold = Math.max(0, tEmp.gold - gold + 40);
    s.empires[spy.owner].gold += gold;
    return { text: `There was nothing new to learn in ${city.name}, so ${spy.name} sold their ledgers for ${gold} gold.` };
  },
  mana(s, spy, city) {
    const amt = Math.floor(Math.min((city.res.mana || 0) * 0.3, 150 + 100 * spy.level));
    if (amt < 5) return { text: `The mana stores of ${city.name} were empty.` };
    city.res.mana -= amt;
    const home = s.cities[spy.home];
    if (home && home.owner === spy.owner) G.gain(s, home, { mana: amt });
    return { text: `${spy.name} siphoned ${amt} mana from ${city.name}${home ? ' to ' + home.name : ''}.` };
  },
  wound(s, spy, city) {
    const h = G.heroOf(s, city.owner);
    if (!h || h.dead) return { text: `${city.name} has no living hero to strike at.` };
    if (!(city.units.hero > 0)) {
      const hc = G.heroCityOf(s, city.owner);
      return { text: `${h.name} was not in ${city.name}${hc && (spy.owner !== 'p' || s.explored[hc.y * s.map + hc.x]) ? ` (they are in ${hc.name})` : ''}. ${spy.name} slipped away unseen.` };
    }
    const dmg = Math.round(30 + 10 * spy.level);
    h.hp = Math.max(5, (h.hp || 100) - dmg);
    return { text: `An ambush in the alleys of ${city.name}: ${h.name} is gravely wounded (${Math.round(h.hp)} health left).` };
  },
  defect(s, spy, city) {
    const old = city.owner;
    if ((city.loyalty ?? 100) >= 40 || G.capital(s, old) === city || G.citiesOf(s, old).length < 2) {
      const drop = 12;
      city.loyalty = Math.max(1, (city.loyalty ?? 100) - drop);
      return { text: `${city.name} was not ready to turn, but the plotters shook it: loyalty −${drop} (now ${Math.round(city.loyalty)}%).` };
    }
    defectCity(s, city, spy.owner);
    return { text: `${city.name} threw open its gates: it now flies the banner of ${ownerLabel(s, spy.owner)}!`, defected: old };
  },
};
G.missionEffects = EFFECTS;

// engine.js keeps its own city transfer private; a defection is a quieter version of it.
// Only cities of realms with other cities defect, so no realm dies (and no victory check is needed).
const defectCity = (s, city, newOwner) => {
  const oldOwner = city.owner;
  if ((city.units.hero || 0) > 0) {
    const cap = G.citiesOf(s, oldOwner).filter(c => c !== city).sort((a, b) => (a.founded || 0) - (b.founded || 0))[0];
    if (cap) cap.units.hero = 1;
  }
  city.owner = newOwner;
  city.loyalty = 25;
  city.buildQueue = []; city.train = {}; city.units = {}; city.mods = [];
  city.taxPolicy = 'normal'; city.placated = 0; city.sedition = 0;
  for (const t of Object.keys(city.buildings)) { const b = DATA.buildings[t]; if (b && b.race && b.race !== s.empires[newOwner].race) delete city.buildings[t]; }
  s.pending = (s.pending || []).filter(p => !(p.data && p.data.city === city.id));
  for (const sp of Object.values(esp(s).spies)) if (sp.home === city.id && sp.owner === oldOwner) relocate(s, sp);
  s.empires[newOwner].conquests = (s.empires[newOwner].conquests || 0) + 1;
  if (newOwner === 'p') G.reveal(s, city.x, city.y, 4);
};
G.defectCity = defectCity;

// a spy whose home is lost flees to the realm's capital (or vanishes if nothing is left)
const relocate = (s, sp) => {
  const cap = G.capital(s, sp.owner);
  if (!cap) { delete esp(s).spies[sp.id]; return; }
  sp.home = cap.id;
};

// ---------------------------------------------------------------------
// Incidents: caught spies sour relations
// ---------------------------------------------------------------------
const incident = (s, spy, city, md) => {
  const att = spy.owner, def = city.owner, E = esp(s);
  E.caught[def] = (E.caught[def] || 0) + 1;
  const sev = md.hostile;
  if (att === 'p' && G.rel) {
    const r = G.rel(s, def);
    r.opinion = G.clamp(r.opinion - (8 + 8 * sev), -100, 100);
    let extra = '';
    if (sev >= 2 && r.status === 'neutral' && r.opinion <= -60) { r.status = 'war'; r.since = s.time; extra = ` The ${s.empires[def].name} declares war!`; }
    else if (sev >= 3 && (r.status === 'peace' || r.status === 'alliance') && r.opinion < -20) { r.status = 'neutral'; r.since = s.time; extra = ` The ${s.empires[def].name} tears up your treaty.`; }
    G.log(s, 'p', `🕵️ ${spy.name} was caught in ${city.name} attempting ${md.name.toLowerCase()}. The ${s.empires[def].name} is furious.${extra}`, 'bad');
    G.report(s, ['p'], `Spy caught: ${spy.name} in ${city.name}`, 'loss', { extra: `${spy.name} (level ${spy.level}) was seized while attempting ${md.name.toLowerCase()} in ${city.name}. Relations with the ${s.empires[def].name} worsened (opinion now ${Math.round(r.opinion)}).${extra}` });
  } else if (def === 'p') {
    const r = G.rel ? G.rel(s, att) : null;
    let extra = '';
    if (r && (r.status === 'peace' || r.status === 'alliance')) {
      const gold = 50 + 50 * sev;
      const ae = s.empires[att]; const pay = Math.min(gold, Math.max(0, Math.floor(ae.gold)));
      if (pay > 0) { ae.gold -= pay; s.empires.p.gold += pay; extra = ` The ${ae.name} disavows the agent and pays ${pay} gold in reparations to keep the peace.`; }
    }
    for (const g of guardsOf(s, city)) gainXp(s, g, 6);
    G.log(s, 'p', `🕵️ Your watchmen caught a spy of the ${s.empires[att].name} in ${city.name}, sent to ${md.name.toLowerCase()}!${extra}`, 'warn');
    G.report(s, ['p'], `Foreign spy caught in ${city.name}`, 'win', { extra: `An agent of the ${s.empires[att].name} was caught attempting ${md.name.toLowerCase()} in ${city.name}.${extra}` });
    feed(s, { kind: 'caught', owner: att, city: city.id, cityName: city.name, type: spy.task.type, text: `Caught a spy of the ${s.empires[att].name} in ${city.name} (${md.name}).` });
  } else if (G.aiRel && sev >= 2) {
    const ar = G.aiRel(s, att, def);
    if (ar.status === 'neutral' && Math.random() < 0.2 * sev / 2) {
      ar.status = 'war'; ar.since = s.time;
      if ([city, G.capital(s, att)].some(c => c && s.explored[c.y * s.map + c.x])) G.log(s, 'p', `⚔️ A spy of the ${s.empires[att].name} was caught in ${city.name}: the ${s.empires[def].name} declares war on them.`, 'warn');
    }
  }
};

// a successful hostile act may still be traced back to its sender
const traced = (s, spy, city, md) => {
  if (!md.hostile) return false;
  return Math.random() < G.clamp(0.15 + 0.15 * G.counterIntel(s, city) - 0.04 * (spy.level - 1), 0.05, 0.6);
};

const gainXp = (s, spy, n) => {
  spy.xp += n;
  while (spy.level < G.SPY_MAX_LEVEL && spy.xp >= XP_LEVELS[spy.level]) {
    spy.level++;
    if (spy.owner === 'p') G.log(s, 'p', `🕵️ ${spy.name} is now a level ${spy.level} spy.`, 'good');
  }
};
G.spyGainXp = gainXp;
G.spyXpNext = spy => spy.level >= G.SPY_MAX_LEVEL ? null : XP_LEVELS[spy.level];

// ---------------------------------------------------------------------
// Resolution. opts.roll / opts.caughtRoll force the dice (tests).
// ---------------------------------------------------------------------
G.resolveMission = (s, spy, opts = {}) => {
  const task = spy.task, md = DATA.missions[task.type];
  const city = s.cities[task.target];
  const home = s.cities[spy.home];
  const back = home ? G.spyTravelTime(s, spy, city || home, home) : 30;
  const goHome = result => { spy.status = 'return'; Object.assign(task, { phase: 'return', t0: s.time, t1: s.time + back, result }); };
  if (!foreign(s, spy.owner, city) || city.owner !== task.targetOwner) {
    if (spy.owner === 'p') G.log(s, 'p', `🕵️ ${spy.name} found ${city ? city.name : 'the target'} changed hands and is coming home.`, 'info');
    goHome('aborted');
    return { aborted: true };
  }
  const chance = G.missionChance(s, spy, task.type, city);
  const roll = opts.roll ?? Math.random();
  const st = esp(s).stats[spy.owner] = esp(s).stats[spy.owner] || { ok: 0, fail: 0 };
  if (roll < chance) {
    const out = EFFECTS[task.type](s, spy, city);
    st.ok++;
    gainXp(s, spy, md.xp);
    const known = city.owner === 'p' || spy.owner === 'p' ? traced(s, spy, city, md) : false;
    if (spy.owner === 'p') {
      G.log(s, 'p', `${md.icon} ${out.text}`, 'good');
      G.report(s, ['p'], `${md.name}: ${city.name}`, 'win', { extra: out.text + (out.detail ? ' ' + out.detail : '') + (known ? ` Rumours of your hand in it reached the ${s.empires[city.owner].name}.` : '') });
      feed(s, { kind: 'ok', owner: 'p', city: city.id, cityName: city.name, type: task.type, text: out.text });
      if (known && G.rel) { const r = G.rel(s, city.owner); r.opinion = G.clamp(r.opinion - (4 + 4 * md.hostile), -100, 100); }
    } else if (city.owner === 'p' && md.hostile) {
      const who = known ? `Your watchmen traced it to the ${s.empires[spy.owner].name}.` : 'Nobody knows who sent them.';
      G.log(s, 'p', `${md.icon} Foreign agents in ${city.name}! ${out.text} ${who}`, 'bad');
      G.report(s, ['p'], `Enemy agents struck ${city.name}`, 'loss', { extra: `${out.text} ${who}` });
      feed(s, { kind: 'hit', owner: known ? spy.owner : null, city: city.id, cityName: city.name, type: task.type, text: out.text + ' ' + who });
    } else if (out.defected && s.explored[city.y * s.map + city.x]) {
      G.log(s, 'p', `🏳️ ${city.name} of the ${s.empires[out.defected].name} defected to the ${s.empires[spy.owner].name}.`, 'warn');
    }
    goHome('success');
    return { ok: true, chance, ...out };
  }
  st.fail++;
  const caught = (opts.caughtRoll ?? Math.random()) < G.caughtChance(s, spy, city);
  if (caught) {
    incident(s, spy, city, md);
    delete esp(s).spies[spy.id];
    return { ok: false, caught: true, chance };
  }
  gainXp(s, spy, 3);
  if (spy.owner === 'p') {
    G.log(s, 'p', `🕵️ ${spy.name} failed to ${md.name.toLowerCase()} in ${city.name}, but escaped.`, 'warn');
    feed(s, { kind: 'fail', owner: 'p', city: city.id, cityName: city.name, type: task.type, text: `${spy.name} failed (${md.name}) in ${city.name} but escaped.` });
  }
  goHome('failed');
  return { ok: false, caught: false, chance };
};

// spies move through their phases every slow tick
G.slowHooks.push(s => {
  if (!s.espionage) return;
  const E = esp(s);
  for (const sp of Object.values(E.spies)) {
    if (!s.empires[sp.owner] || s.empires[sp.owner].dead) { delete E.spies[sp.id]; continue; }
    const home = s.cities[sp.home];
    if (!home || home.owner !== sp.owner) { relocate(s, sp); if (!E.spies[sp.id]) continue; }
    if (sp.status === 'training') {
      if (sp.ready <= s.time) { sp.status = 'idle'; if (sp.owner === 'p') G.log(s, 'p', `🕵️ ${sp.name} has joined your spy network in ${s.cities[sp.home].name}.`, 'good'); }
      continue;
    }
    const t = sp.task;
    if (!t || sp.status === 'idle') continue;
    if (t.t1 > s.time) continue;
    if (t.phase === 'travel') { sp.status = 'work'; t.phase = 'work'; t.t0 = s.time; t.t1 = s.time + t.work; }
    else if (t.phase === 'work') G.resolveMission(s, sp);
    else if (t.phase === 'return') { sp.status = 'idle'; sp.task = null; sp.last = { type: t.type, result: t.result, t: s.time }; }
  }
});

// sedition: an extra entry in a city's happiness while agitators are at work
{
  const prev = G.happiness;
  if (prev) G.happiness = (s, city) => {
    const h = prev(s, city);
    if (city.sedition > s.time) {
      const v = -Math.round(15 / raceFx(s, city.owner).bribe);
      const raw = h.raw + v;
      return { ...h, why: [...h.why, { label: 'Agitators and pamphlets', value: v }], raw, value: G.clamp(Math.round(raw), 0, 100) };
    }
    return h;
  };
}

// ---------------------------------------------------------------------
// AI espionage
// ---------------------------------------------------------------------
G.aiBuildFilters.push((s, city, type) => type !== 'hideout');  // the AI raises its den deliberately, below
const AI_HOSTILE_PRESSURE = 0.28;   // ≈ 2 game-hours on standard pace (Fair rivals) before the AI turns its spies on the player
G.aiSpyTarget = (s, emp, spy) => {
  const home = s.cities[spy.home];
  if (!home) return null;
  const pr = G.aiPressure(s);
  // against the player, the chosen difficulty scales the pressure (as for armies); Fair = 0.85
  const prP = pr * (s.settings.hostility ?? 0.85) / 0.85;
  const out = [];
  for (const c of Object.values(s.cities)) {
    if (!foreign(s, emp.id, c)) continue;
    const d = G.dist(home, c);
    if (d > 22) continue;
    const h = G.hostility(s, emp.id, c.owner);
    const hostileOk = c.owner === 'p' ? prP >= AI_HOSTILE_PRESSURE && h > 0.5 : (pr >= 0.2 && h >= 1) || (pr >= 0.45 && h >= 0.6);
    const intelOk = c.owner === 'p' ? prP > 0.05 && h > 0.2 : h > 0.3;
    if (!hostileOk && !intelOk) continue;
    out.push({ c, d, h, hostileOk, w: (0.3 + h) / (3 + d) * (c.owner === 'p' ? 1.5 : 1) * (hostileOk ? 1.5 : 1) });
  }
  if (!out.length) return null;
  let r = Math.random() * out.reduce((a, o) => a + o.w, 0);
  for (const o of out) { r -= o.w; if (r <= 0) return o; }
  return out[out.length - 1];
};
G.aiPickMission = (s, emp, spy, tgt) => {
  const c = tgt.c, opts = [];
  const add = (type, w) => { if (w > 0 && G.missionStatus(s, spy.id, c.id, type).ok) opts.push({ type, w }); };
  const fresh = freshDossier(s, emp.id, c.id);
  add('intel', fresh ? 0 : tgt.hostileOk ? 1.2 : 2);
  if (tgt.hostileOk) {
    const war = tgt.h >= 1.2;
    add('sabotage', c.buildQueue.length ? 1.5 : 0.8);
    add('poison', (c.res.grain || 0) > 400 ? 1.2 : 0.5);
    add('unrest', war ? 1 : 0.6);
    const mine = G.research(s, emp.id).done;
    add('tech', Object.keys(G.research(s, c.owner).done).some(id => !mine[id]) ? 1.2 : 0.2);
    add('mana', (c.res.mana || 0) > 300 ? 1 : 0);
    add('wound', war && c.units.hero > 0 ? 1.2 : 0);
    add('defect', (c.loyalty ?? 100) < 35 && G.aiPressure(s) > 0.6 ? 2.5 : 0);
  }
  if (!opts.length) return null;
  let r = Math.random() * opts.reduce((a, o) => a + o.w, 0);
  for (const o of opts) { r -= o.w; if (r <= 0) return o.type; }
  return opts[opts.length - 1].type;
};
G.aiHooks.push((s, emp, dtMin) => {
  if (Math.random() > 0.4) return;
  const E = esp(s);
  const A = E.ai[emp.id] = E.ai[emp.id] || { next: 0 };
  const pr = G.aiPressure(s);
  const cities = G.citiesOf(s, emp.id);
  const dens = cities.filter(c => G.lvl(c, 'hideout') > 0);
  // raise a den in the capital once the grace period is over; grow it slowly as the world darkens
  const cap = G.capital(s, emp.id);
  if (cap && pr > 0.05 && G.lvl(cap, 'townhall') >= 3) {
    const L = G.lvl(cap, 'hideout'), want = Math.min(12, 1 + Math.round(pr * 6 + emp.aggr * 2));
    if (L < want && !cap.buildQueue.some(q => q.type === 'hideout') && cap.buildQueue.length < G.buildSlots(cap) && Math.random() < (L ? 0.04 : 0.25)) {
      const st = G.buildStatus(s, cap, 'hideout');
      if (st.ok) G.queueBuild(s, cap.id, 'hideout');
    }
  }
  if (!dens.length) return;
  // recruit
  const mine = spiesOf(s, emp.id);
  if (mine.length < G.spyCap(s, emp.id) && Math.random() < 0.35) {
    const city = dens.sort((a, b) => G.lvl(b, 'hideout') - G.lvl(a, 'hideout'))[0];
    const st = G.recruitStatus(s, city.id);
    if (st.ok && emp.gold > st.cost.gold * 2.5 && !emp.saving) G.recruitSpy(s, city.id);
  }
  // missions, on a cooldown
  if (s.time < A.next) return;
  const idle = mine.filter(x => x.status === 'idle');
  const busy = mine.filter(x => x.task).length;
  if (!idle.length || (mine.length >= 2 && idle.length < 2) || busy >= 1 + (pr > 0.6 ? 1 : 0)) return;
  const spy = idle.sort((a, b) => b.level - a.level)[0];
  const tgt = G.aiSpyTarget(s, emp, spy);
  A.next = s.time + G.rnd(10, 20) * 60 * paceT(s) / (0.6 + pr);
  if (!tgt) return;
  const type = G.aiPickMission(s, emp, spy, tgt);
  if (!type || emp.gold < G.missionCost(s, type).gold) return;
  G.sendSpy(s, spy.id, tgt.c.id, type);
});

})();
