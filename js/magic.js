// =====================================================================
//  Magic. Every city draws a little mana from the land; ley enclaves —
//  where glowing lines of power cross — give far more. Mage Towers study
//  schools of magic, each aligned with a god: a realm knows its people's
//  native school and the school of its faith's patron. Spells shape the
//  economy, war and, late in the game, the world itself. Heavy casting
//  strains the weave and risks wild backlash and demon rifts. The Great
//  Working is a third path to victory.
//    s.ley   = { nodes:[{id,x,y,power}], lines:[[i,j]], lineTiles:[idx...] }
//    s.magic = { strain:{cityId:n}, casts:{owner:{spell:[t...]}}, cool:{owner:{spell:t}}, fallen:{owner:[{t,n}]}, working:{owner:{stage,city,start,end}} }
// =====================================================================
'use strict';
(() => {

// ---------------------------------------------------------------------
// Data: the Mage Tower, battle mages for the classic peoples, schools, spells
// ---------------------------------------------------------------------
DATA.buildings.magetower = {
  name: 'Mage Tower', icon: '🔮', max: 20, time: 35, growth: 1.38, workers: 2,
  cost: { timber: 250, stone: 300, grain: 100, gold: 150 },
  desc: 'Where your magi study and cast. Draws mana from the land (far more on a ley enclave), trains battle mages, and unlocks stronger spells at levels 1, 5, 10 and 15.',
  req: { townhall: 4, academy: 1 },
};
DATA.buildingOrder.push('magetower');
{ const ws = DATA.buildingGroups.findIndex(g => g.name === 'Workshops'); DATA.buildingGroups.splice(ws + 1, 0, { name: 'Arcane', list: ['magetower'] }); }

const MAGES = {
  hearth: { id: 'hedgewizard', name: 'Hedge Wizard', icon: '🧙', desc: 'Village wise-folk who call rain and fire for the levy.' },
  delver: { id: 'runepriest', name: 'Rune Priest', icon: '🔷', desc: 'Carves battle-runes that harden shields and blades.' },
  sylvan: { id: 'moonsinger', name: 'Moonsinger', icon: '🌙', desc: 'Their songs mend wounds and tangle the enemy in roots.' },
  ash:    { id: 'emberseer', name: 'Emberseer', icon: '🔥', desc: 'Blood-painted shamans who hurl ash and flame.' },
};
for (const [race, m] of Object.entries(MAGES)) {
  if (!DATA.races[race]) continue;
  DATA.units[m.id] = DATA.units[m.id] || { name: m.name, icon: m.icon, type: 'ranged', atk: 45, defI: 30, defC: 25, spd: 5, carry: 20, upkeep: 0.9, time: 60, at: 'magetower', req: 3, mage: 1, cost: { grain: 80, gold: 80, mana: 20 }, desc: m.desc + ' Each mage strengthens the whole army (up to +30%).' };
  DATA.races[race].mageUnit = DATA.races[race].mageUnit || m.id;
}
for (const r of Object.values(DATA.races)) if (r.mageUnit && DATA.units[r.mageUnit] && !r.units.includes(r.mageUnit)) r.units.push(r.mageUnit);

// guardians and horrors
DATA.units.risen = DATA.units.risen || { name: 'Risen', icon: '🧟', type: 'inf', atk: 22, defI: 22, defC: 18, spd: 5, carry: 10, upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc: 'The dead, raised to fight again.' };
DATA.units.elemental = { name: 'Summoned Beast', icon: '🐻', type: 'inf', atk: 35, defI: 45, defC: 40, spd: 6, carry: 0, upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc: 'Called from the wild by song.' };
DATA.units.demon = { name: 'Rift Demon', icon: '👹', type: 'inf', atk: 48, defI: 40, defC: 36, spd: 6, carry: 0, upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc: 'Something that slipped through a tear in the weave.' };

// schools of magic, each aligned with a god of the pantheon (religion.js)
DATA.schools = {
  hearthweather: { name: 'Hearth & Weather', icon: '🌦️', god: 'ysolde', race: 'hearth', color: '#d9a23a' },
  runecraft:     { name: 'Runecraft',        icon: '🔷', god: 'durgan', race: 'delver', color: '#4a7ab8' },
  songroot:      { name: 'Song & Root',      icon: '🌿', god: 'oru',    race: 'sylvan', color: '#3f8f4a' },
  bloodember:    { name: 'Blood & Ember',    icon: '🩸', god: 'skarr',  race: 'ash',    color: '#b3261e' },
  tidestorm:     { name: 'Tides & Storms',   icon: '🌊', god: 'thalos', race: 'tide',   color: '#2f7fa8' },
  glamour:       { name: 'Glamour & Dreams', icon: '✨', god: 'lirael', race: 'veil',   color: '#9b6ad3' },
  necromancy:    { name: 'Necromancy',       icon: '💀', god: 'mirren', race: 'grave',  color: '#4d7a5a' },
  skywind:       { name: 'Sky & Lightning',  icon: '⚡', god: 'thalos', race: 'wind',   color: '#5fa3c8' },
};
DATA.schoolOrder = Object.keys(DATA.schools);

// spells. tier = Mage Tower level needed in the casting city; target: city (own), enemy (foreign city), realm, tile
// fx for timed effects: [{key, mult, mins, scope:'city'|'realm'}]; run(s, ctx) for instant effects; strain = weave strain added
DATA.spells = {
  // ---- open to every realm ----
  scry:       { name: 'Scrying',        icon: '🔭', tier: 1, cost: 40,  cool: 4,  strain: 4,  target: 'tile',  desc: 'Reveal the land around a place and see who stands there, as a scout would.' },
  transmute:  { name: 'Transmutation',  icon: '⚗️', tier: 1, cost: 35,  cool: 6,  strain: 6,  target: 'city',  desc: 'Turn a share of the city\'s most plentiful raw good into its scarcest one (at half value).' },
  manaward:   { name: 'Ward of Weaving',icon: '🛡️', tier: 5, cost: 120, cool: 20, strain: 10, target: 'city',  desc: 'For 30 minutes the city shrugs off the effects of calamities and wild magic.' },
  golems:     { name: 'Golem Labour',   icon: '🗿', tier: 10, cost: 220, cool: 25, strain: 14, target: 'city', fx: [{ key: 'raw', mult: 1.3, mins: 20 }, { key: 'refine', mult: 1.3, mins: 20 }], desc: 'Clay labourers toil beside your people: +30% raw goods and workshop output for 20 minutes.' },
  // ---- world-shaping (late) ----
  raiseland:  { name: 'Raise the Land', icon: '⛰️', tier: 15, cost: 900, cool: 60, strain: 45, target: 'tile', shape: 'raise', desc: 'Lift a stretch of water into new land (it must touch the shore) — a bridge across a sea.' },
  sinkland:   { name: 'Call the Waters',icon: '🌊', tier: 15, cost: 800, cool: 60, strain: 40, target: 'tile', shape: 'sink', desc: 'Sink empty land beneath the water, giving a city a shore and a harbour.' },
  growforest: { name: 'Wildwood',       icon: '🌳', tier: 15, cost: 600, cool: 45, strain: 30, target: 'tile', shape: 'forest', desc: 'A forest rises overnight on open land.' },
  raisepeaks: { name: 'Raise the Peaks',icon: '🏔️', tier: 15, cost: 700, cool: 45, strain: 35, target: 'tile', shape: 'peaks', desc: 'Push the earth up: plains become hills, hills become mountains.' },
  quicken:    { name: 'Quicken the Soil',icon: '🌾', tier: 15, cost: 600, cool: 45, strain: 30, target: 'tile', shape: 'fertile', desc: 'Turn plains or hills into fertile vale.' },
  // ---- Hearth & Weather (Ysolde) ----
  bountifulrain: { school: 'hearthweather', name: 'Bountiful Rain', icon: '🌧️', tier: 1, cost: 60, cool: 12, strain: 6, target: 'city', fx: [{ key: 'grain', mult: 1.5, mins: 20 }], desc: '+50% grain in a city for 20 minutes.' },
  hearthward:    { school: 'hearthweather', name: 'Warding Hearth', icon: '🔥', tier: 5, cost: 140, cool: 20, strain: 10, target: 'city', fx: [{ key: 'def', mult: 1.25, mins: 20 }], desc: '+25% defence in a city for 20 minutes.' },
  summersun:     { school: 'hearthweather', name: 'Call the Summer Sun', icon: '☀️', tier: 10, cost: 300, cool: 40, strain: 16, target: 'realm', fx: [{ key: 'grain', mult: 1.3, mins: 25, scope: 'realm' }, { key: 'travel', mult: 1.2, mins: 25, scope: 'realm' }, { key: 'popGrowth', mult: 1.2, mins: 25, scope: 'realm' }], desc: 'Summer in any season across the realm: +30% grain, +20% growth and march speed for 25 minutes.' },
  // ---- Runecraft (Durgan) ----
  runehaste:  { school: 'runecraft', name: 'Rune of Haste', icon: '⏩', tier: 1, cost: 70, cool: 12, strain: 6, target: 'city', fx: [{ key: 'buildTime', mult: 0.6, mins: 15 }], desc: 'Construction 40% faster in a city for 15 minutes.' },
  runeward:   { school: 'runecraft', name: 'Runeward', icon: '🧱', tier: 5, cost: 150, cool: 25, strain: 10, target: 'city', fx: [{ key: 'wall', mult: 1.6, mins: 30 }], desc: 'Walls give 60% more defence for 30 minutes.' },
  forgerunes: { school: 'runecraft', name: 'Forge-Runes', icon: '⚒️', tier: 10, cost: 320, cool: 40, strain: 16, target: 'realm', fx: [{ key: 'atk', mult: 1.12, mins: 20, scope: 'realm' }, { key: 'def', mult: 1.12, mins: 20, scope: 'realm' }], desc: '+12% attack and defence across the realm for 20 minutes.' },
  // ---- Song & Root (Oru) ----
  verdant:    { school: 'songroot', name: 'Verdant Song', icon: '🌱', tier: 1, cost: 60, cool: 12, strain: 6, target: 'city', fx: [{ key: 'timber', mult: 1.5, mins: 20 }, { key: 'popGrowth', mult: 1.3, mins: 20 }], desc: '+50% timber and +30% growth in a city for 20 minutes.' },
  healingsong:{ school: 'songroot', name: 'Healing Song', icon: '💚', tier: 5, cost: 130, cool: 20, strain: 8, target: 'city', desc: 'Lifts sickness from a city, restores 8% of its people and heals your hero there.' },
  wildcall:   { school: 'songroot', name: 'Call of the Wild', icon: '🐻', tier: 10, cost: 280, cool: 35, strain: 16, target: 'city', desc: 'Summoned beasts guard a city for 20 minutes.' },
  // ---- Blood & Ember (Skarr) ----
  bloodrage:  { school: 'bloodember', name: 'Bloodrage', icon: '😡', tier: 1, cost: 70, cool: 15, strain: 8, target: 'realm', fx: [{ key: 'atk', mult: 1.2, mins: 15, scope: 'realm' }], desc: '+20% attack across the realm for 15 minutes — at the price of 3% of the capital\'s people.' },
  emberstorm: { school: 'bloodember', name: 'Ember Storm', icon: '☄️', tier: 5, cost: 180, cool: 25, strain: 14, target: 'enemy', desc: 'Rain fire on an enemy city: 12% of its garrison falls and its grain and timber burn.' },
  curseofash: { school: 'bloodember', name: 'Curse of Ash', icon: '🌫️', tier: 10, cost: 300, cool: 40, strain: 18, target: 'enemy', fx: [{ key: 'raw', mult: 0.7, mins: 20 }], desc: 'An enemy city\'s raw goods fall by 30% for 20 minutes.' },
  // ---- Tides & Storms (Thalos) ----
  fairwinds:  { school: 'tidestorm', name: 'Fair Winds', icon: '🌬️', tier: 1, cost: 60, cool: 12, strain: 6, target: 'realm', fx: [{ key: 'travel', mult: 1.3, mins: 20, scope: 'realm' }], desc: 'Armies, caravans and ships move 30% faster for 20 minutes.' },
  tempest:    { school: 'tidestorm', name: 'Summon Tempest', icon: '🌀', tier: 5, cost: 180, cool: 25, strain: 14, target: 'enemy', desc: 'A storm batters an enemy city: ships founder (25%) and 8% of other troops fall. Worse on the coast.' },
  calmseas:   { school: 'tidestorm', name: 'Calm Seas', icon: '🌅', tier: 10, cost: 260, cool: 35, strain: 12, target: 'realm', fx: [{ key: 'upkeep', mult: 0.85, mins: 25, scope: 'realm' }, { key: 'caravan', mult: 1.5, mins: 25, scope: 'realm' }, { key: 'tax', mult: 1.1, mins: 25, scope: 'realm' }], desc: 'Trade and supply flow freely: troops eat 15% less, caravans carry 50% more, +10% taxes for 25 minutes.' },
  // ---- Glamour & Dreams (Lirael) ----
  veilmist:   { school: 'glamour', name: 'Veil of Mist', icon: '🌫️', tier: 1, cost: 70, cool: 18, strain: 8, target: 'realm', desc: 'Your realm fades from rivals\' minds: they are far less likely to attack you for 20 minutes.' },
  illusion:   { school: 'glamour', name: 'Mass Illusion', icon: '🪞', tier: 5, cost: 150, cool: 20, strain: 10, target: 'city', fx: [{ key: 'def', mult: 1.4, mins: 15 }], desc: 'Phantom defenders: +40% defence in a city for 15 minutes.' },
  dreamsend:  { school: 'glamour', name: 'Dreamsending', icon: '💭', tier: 10, cost: 260, cool: 40, strain: 12, target: 'enemy', desc: 'Send sweet dreams to a rival\'s court: +25 opinion, and a realm at war may sue for peace.' },
  // ---- Necromancy (Mirren) ----
  raisedead:  { school: 'necromancy', name: 'Raise the Fallen', icon: '🧟', tier: 1, cost: 80, cool: 15, strain: 10, target: 'city', desc: 'Raise a quarter of your soldiers who fell in the last 30 minutes as Risen in a city.' },
  plaguewind: { school: 'necromancy', name: 'Plague Wind', icon: '🦠', tier: 5, cost: 180, cool: 30, strain: 16, target: 'enemy', fx: [{ key: 'popGrowth', mult: 0.6, mins: 20 }], desc: 'An enemy city loses 12% of its people and grows slowly for 20 minutes.' },
  soulharvest:{ school: 'necromancy', name: 'Soul Harvest', icon: '👻', tier: 10, cost: 60, cool: 40, strain: 22, target: 'city', desc: 'Sacrifice 8% of a city\'s people for a flood of mana.' },
  // ---- Sky & Lightning (Thalos) ----
  windwalk:   { school: 'skywind', name: 'Windwalk', icon: '🪶', tier: 1, cost: 60, cool: 12, strain: 6, target: 'realm', fx: [{ key: 'travel', mult: 1.25, mins: 20, scope: 'realm' }, { key: 'vision', mult: 1.5, mins: 20, scope: 'realm' }], desc: '+25% march speed and +50% vision for 20 minutes.' },
  lightning:  { school: 'skywind', name: 'Call Lightning', icon: '⚡', tier: 5, cost: 170, cool: 25, strain: 14, target: 'enemy', desc: 'Lightning strikes an enemy city: a building loses a level and 5% of its garrison falls.' },
  stormshield:{ school: 'skywind', name: 'Eye of the Storm', icon: '🌪️', tier: 10, cost: 260, cool: 35, strain: 12, target: 'city', fx: [{ key: 'def', mult: 1.35, mins: 20 }, { key: 'wall', mult: 1.3, mins: 20 }], desc: 'Howling winds shield a city: +35% defence, walls +30% for 20 minutes.' },
};

// ---------------------------------------------------------------------
// Ley network
// ---------------------------------------------------------------------
const lineTilesOf = (s, a, b) => {
  const out = [], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
  for (let i = 0; i <= n; i++) out.push(Math.round(a.y + (b.y - a.y) * i / n) * s.map + Math.round(a.x + (b.x - a.x) * i / n));
  return out;
};
G.genLey = s => {
  const want = Math.round(s.map * s.map / 110);
  const nodes = [];
  for (let tries = 0; nodes.length < want && tries < 500; tries++) {
    const t = s.tiles[G.rint(0, s.tiles.length - 1)];
    if (G.isWater(t) || t.camp || t.oasis || t.ruin || t.minor) continue;
    if (nodes.some(n => Math.hypot(n.x - t.x, n.y - t.y) < 4.5)) continue;
    nodes.push({ id: nodes.length, x: t.x, y: t.y, power: G.pick([1, 1, 2, 2, 3]) });
  }
  // a Veilborn capital always lies near an enclave
  for (const c of Object.values(s.cities)) {
    if (s.empires[c.owner].race !== 'veil' || nodes.some(n => Math.hypot(n.x - c.x, n.y - c.y) <= 2.5)) continue;
    const t = G.freeTile(s, x => Math.hypot(x.x - c.x, x.y - c.y) >= 1 && Math.hypot(x.x - c.x, x.y - c.y) <= 2.2) || c;
    nodes.push({ id: nodes.length, x: t.x, y: t.y, power: 3 });
  }
  // connect: minimum spanning tree plus a couple of extra lines
  const lines = [], inTree = new Set([0]);
  while (inTree.size < nodes.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < nodes.length; j++) if (!inTree.has(j)) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (!best || d < best.d) best = { i, j, d };
    }
    if (!best) break;
    lines.push([best.i, best.j]); inTree.add(best.j);
  }
  for (let k = 0; k < 2 && nodes.length > 3; k++) { const a = G.rint(0, nodes.length - 1), b = G.rint(0, nodes.length - 1); if (a !== b && !lines.some(l => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a))) lines.push([a, b]); }
  const lineTiles = [...new Set(lines.flatMap(([a, b]) => lineTilesOf(s, nodes[a], nodes[b])))];
  return { nodes, lines, lineTiles };
};
const ley = s => { if (!s.ley) s.ley = G.genLey(s); return s.ley; };
const magic = s => {
  s.magic = s.magic || {};
  for (const k of ['strain', 'casts', 'cool', 'fallen', 'working']) s.magic[k] = s.magic[k] || {};
  return s.magic;
};
G.magicState = magic;

// which city taps a node: the nearest city whose reach covers it
G.nodeTapper = (s, node) => {
  let best = null, bd = 1e9;
  for (const c of G.allCities ? G.allCities(s) : Object.values(s.cities)) {
    const d = Math.hypot(c.x - node.x, c.y - node.y);
    if (d <= G.cityReach(s, c) + 0.5 && d < bd) { bd = d; best = c; }
  }
  return best;
};
// cached per 10 game-seconds: who taps which node changes slowly
const LEY_CACHE = new WeakMap();
G.leyPower = (s, city) => {
  if (!s.ley) return 0;
  let c = LEY_CACHE.get(s);
  const tick = Math.floor(s.time / 10);
  if (!c || c.tick !== tick) { c = { tick, map: new Map() }; LEY_CACHE.set(s, c); }
  if (c.map.has(city.id)) return c.map.get(city.id);
  const v = leyPowerRaw(s, city);
  c.map.set(city.id, v);
  return v;
};
const leyPowerRaw = (s, city) => {
  let p = 0;
  for (const n of s.ley.nodes) {
    const d = Math.hypot(n.x - city.x, n.y - city.y);
    if (d > G.cityReach(s, city) + 0.5) continue;
    const tap = G.nodeTapper(s, n);
    if (tap !== city) continue;
    p += n.power * (d < 0.5 ? 2 : Math.max(0.35, 1 - d / (G.cityReach(s, city) + 1.5)));
  }
  if (s.ley.lineTiles.includes(city.y * s.map + city.x)) p += 0.5;
  return Math.round(p * 100) / 100;
};
G.nodesOf = (s, owner) => (s.ley ? s.ley.nodes.filter(n => { const c = G.nodeTapper(s, n); return c && c.owner === owner; }) : []);

// every city makes a little mana; towers and enclaves make much more
G.econHooks.push((s, city, raw, eff) => {
  const L = G.lvl(city, 'magetower');
  const lp = G.leyPower(s, city);
  const base = 0.6 + lp * 2 + (L ? (1.5 * L * Math.pow(1.1, L - 1)) * (1 + lp * 0.35) : 0);
  raw.mana = (raw.mana || 0) + base * Math.max(0.5, eff) * G.mod(s, city.owner, city, 'mana');
});

// ---------------------------------------------------------------------
// Schools, spell access and costs
// ---------------------------------------------------------------------
G.patronSchool = (s, owner) => {
  const god = G.patronOf ? G.patronOf(s, owner) : null;
  return god ? DATA.schoolOrder.filter(k => DATA.schools[k].god === god) : [];
};
G.schoolsOf = (s, owner) => {
  const race = s.empires[owner].race;
  const native = DATA.schoolOrder.filter(k => DATA.schools[k].race === race);
  return [...new Set([...native, ...G.patronSchool(s, owner)])];
};
G.towerLevel = (s, owner) => Math.max(0, ...G.citiesOf(s, owner).map(c => G.lvl(c, 'magetower')));
G.spellsOf = (s, owner) => {
  const schools = G.schoolsOf(s, owner);
  return Object.keys(DATA.spells).filter(id => !DATA.spells[id].school || schools.includes(DATA.spells[id].school));
};
G.spellCost = (s, owner, id) => {
  const sp = DATA.spells[id];
  const recent = ((magic(s).casts[owner] || {})[id] || []).filter(t => s.time - t < 3600 * G.pace(s).time).length;
  let mult = (1 + 0.2 * recent) * G.mod(s, owner, null, 'spellCost');
  const sc = sp.school && DATA.schools[sp.school];
  if (sc && G.patronOf && G.patronOf(s, owner) === sc.god) mult *= 0.85;      // faith and magic in harmony
  return Math.round(sp.cost * mult);
};
const power = (s, owner) => G.mod(s, owner, null, 'spellPower');
const amp = (s, owner, mult) => mult >= 1 ? 1 + (mult - 1) * power(s, owner) : 1 - (1 - mult) * power(s, owner);

// pay mana from the casting city first, then from the realm's other cities
const manaOf = (s, owner) => G.citiesOf(s, owner).reduce((a, c) => a + (c.res.mana || 0), 0);
G.manaOf = manaOf;
const payMana = (s, owner, city, amount) => {
  if (manaOf(s, owner) < amount) return false;
  let left = amount;
  for (const c of [city, ...G.citiesOf(s, owner).filter(x => x !== city)]) { const take = Math.min(left, c.res.mana || 0); c.res.mana -= take; left -= take; if (left <= 0) break; }
  return true;
};

G.spellStatus = (s, owner, cityId, id) => {
  const sp = DATA.spells[id], city = s.cities[cityId];
  const res = { cost: G.spellCost(s, owner, id), ok: true };
  if (!G.spellsOf(s, owner).includes(id)) return { ...res, ok: false, hidden: true, reason: 'Not of your schools' };
  if (!city || city.owner !== owner) return { ...res, ok: false, reason: 'Cast from one of your cities' };
  if (G.lvl(city, 'magetower') < sp.tier) return { ...res, ok: false, locked: true, reason: `Needs a Mage Tower ${sp.tier} in ${city.name}` };
  const cd = (magic(s).cool[owner] || {})[id] || 0;
  if (cd > s.time) return { ...res, ok: false, reason: `Ready in ${Math.ceil((cd - s.time) / 60)} min` };
  if (manaOf(s, owner) < res.cost) return { ...res, ok: false, poor: true, reason: 'Not enough mana' };
  return res;
};

const addMod = (target, s, key, mult, mins, label) => {
  target.mods = (target.mods || []).filter(m => m.until > s.time);
  target.mods.push({ key, mult, until: s.time + mins * 60 * G.pace(s).time, label });
};
// 'raw' expands to the four raw goods
const applyFx = (s, owner, city, sp, target) => {
  for (const f of sp.fx || []) {
    const keys = f.key === 'raw' ? ['grain', 'timber', 'stone', 'ore'] : [f.key];
    const obj = f.scope === 'realm' ? s.empires[owner] : target;
    for (const k of keys) addMod(obj, s, k, amp(s, owner, f.mult), f.mins, sp.icon + ' ' + sp.name);
  }
};
const hostileAct = (s, owner, targetOwner) => { for (const h of G.hostileHooks) h(s, owner, targetOwner, 'raid'); };

const SHAPES = {
  raise:   t => G.isWater(t) ? 'plains' : null,
  sink:    t => !G.isWater(t) && !t.city && !t.camp && !t.oasis && !t.ruin ? 'lake' : null,
  forest:  t => ['plains', 'fertile', 'hills'].includes(t.terrain) ? 'forest' : null,
  peaks:   t => t.terrain === 'plains' || t.terrain === 'fertile' ? 'hills' : t.terrain === 'hills' ? 'mountain' : null,
  fertile: t => t.terrain === 'plains' || t.terrain === 'hills' ? 'fertile' : null,
};
G.reshape = (s, t, terrain) => {
  t.terrain = terrain;
  if (s.rivers && terrain === 'lake') s.rivers = s.rivers.map(r => r.filter(i => i !== G.tileIdx(s, t)));
  G.clearPaths(s);
  s.terrainRev = (s.terrainRev || 0) + 1;
  for (const c of Object.values(s.cities)) if (Math.hypot(c.x - t.x, c.y - t.y) <= 3) c.site = null;
};

// cast a spell. ctx: { city: casting city id, target: city id or {x,y} }
G.castSpell = (s, owner, cityId, id, target) => {
  const st = G.spellStatus(s, owner, cityId, id);
  if (!st.ok) return st.reason;
  const sp = DATA.spells[id], city = s.cities[cityId], emp = s.empires[owner];
  let tcity = null, tile = null;
  if (sp.target === 'city') { tcity = s.cities[target || cityId]; if (!tcity || tcity.owner !== owner) return 'Choose one of your cities'; }
  if (sp.target === 'enemy') {
    tcity = s.cities[target]; if (!tcity || tcity.owner === owner) return 'Choose a foreign city';
    if (Math.hypot(tcity.x - city.x, tcity.y - city.y) > 14) return `Too far from ${city.name} (14 tiles at most)`;
    if (owner === 'p' && !s.explored[tcity.y * s.map + tcity.x]) return 'You have never seen that city';
  }
  if (sp.target === 'tile') {
    tile = target && G.tileAt(s, target.x, target.y); if (!tile) return 'Choose a place on the map';
    if (sp.shape) {
      if (Math.hypot(tile.x - city.x, tile.y - city.y) > G.cityReach(s, city) + 3) return `Too far: shape the land within ${(G.cityReach(s, city) + 3).toFixed(1)} tiles of ${city.name}`;
      if (!SHAPES[sp.shape](tile)) return 'That land cannot be shaped this way';
      if (sp.shape === 'raise' && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = G.tileAt(s, tile.x + dx, tile.y + dy); return n && !G.isWater(n); })) return 'Raised land must touch the shore';
    }
  }
  payMana(s, owner, city, st.cost);
  if (G.noteSpellCast) G.noteSpellCast(s, owner);
  const M = magic(s);
  (M.casts[owner] = M.casts[owner] || {})[id] = [...((M.casts[owner] || {})[id] || []).filter(t => s.time - t < 7200), s.time];
  (M.cool[owner] = M.cool[owner] || {})[id] = s.time + sp.cool * 60 * G.pace(s).time;
  M.strain[city.id] = (M.strain[city.id] || 0) + sp.strain;
  const P = power(s, owner);
  let msg = `${sp.icon} ${sp.name} cast from ${city.name}.`;
  applyFx(s, owner, city, sp, tcity || city);
  switch (id) {
    case 'scry': {
      G.reveal(s, tile.x, tile.y, 3);
      const c = tile.city && s.cities[tile.city], camp = tile.camp && s.camps[tile.camp];
      if (owner === 'p' && (c || camp)) {
        const intel = { t: s.time, units: { ...(c ? c.units : camp.units) } };
        if (c) Object.assign(intel, { name: c.name, owner: c.owner, wall: G.lvl(c, 'wall'), th: G.lvl(c, 'townhall'), loyalty: Math.round(c.loyalty), res: Object.fromEntries(DATA.goodOrder.map(g => [g, Math.floor(c.res[g] || 0)]).filter(([, v]) => v > 0)) });
        s.intel[G.tileIdx(s, tile)] = intel;
        G.report(s, ['p'], `Scrying: ${c ? c.name : 'a camp'} (${tile.x}, ${tile.y})`, 'info', { scout: true, intel });
      }
      msg = `🔭 The mists part over (${tile.x}, ${tile.y}).`;
      break;
    }
    case 'transmute': {
      const raws = ['grain', 'timber', 'stone', 'ore'].sort((a, b) => (tcity.res[b] || 0) - (tcity.res[a] || 0));
      const from = raws[0], to = raws[3], amt = Math.floor((tcity.res[from] || 0) * 0.25);
      tcity.res[from] -= amt; G.gain(s, tcity, { [to]: Math.floor(amt * 0.5 * DATA.goods[from].value / DATA.goods[to].value * P) });
      msg = `⚗️ ${amt} ${DATA.goods[from].name.toLowerCase()} became ${DATA.goods[to].name.toLowerCase()} in ${tcity.name}.`;
      break;
    }
    case 'manaward': tcity.ward = s.time + 30 * 60 * G.pace(s).time; break;
    case 'healingsong':
      tcity.mods = (tcity.mods || []).filter(m => !(m.mult < 1 && m.key === 'popGrowth'));
      tcity.pop = Math.min(G.econ(s, tcity).civCap, tcity.pop * (1 + 0.08 * P));
      if (emp.hero && tcity.units.hero) emp.hero.hp = 100;
      break;
    case 'wildcall': {
      const n = Math.round((10 + 2 * G.lvl(city, 'magetower')) * P);
      tcity.units.elemental = (tcity.units.elemental || 0) + n;
      tcity.summoned = (tcity.summoned || []).concat([{ unit: 'elemental', n, until: s.time + 20 * 60 * G.pace(s).time }]);
      msg = `🐻 ${n} beasts answer the call and guard ${tcity.name}.`;
      break;
    }
    case 'bloodrage': { const cap = G.capital(s, owner); if (cap) cap.pop *= 0.97; break; }
    case 'emberstorm': case 'tempest': case 'lightning': {
      hostileAct(s, owner, tcity.owner);
      const killed = {};
      for (const [u, n] of Object.entries(tcity.units)) {
        const d = DATA.units[u]; if (!d.at && u !== 'hero') continue; if (u === 'hero') continue;
        const share = id === 'emberstorm' ? 0.12 : id === 'tempest' ? (d.type === 'ship' ? 0.25 : G.coastal(s, tcity.x, tcity.y) ? 0.1 : 0.06) : 0.05;
        const k = Math.round(n * share * P); if (k > 0) { tcity.units[u] -= k; killed[u] = k; }
      }
      if (id === 'emberstorm') for (const g of ['grain', 'timber']) tcity.res[g] = (tcity.res[g] || 0) * 0.8;
      if (id === 'lightning') { const b = G.pick(Object.keys(tcity.buildings).filter(k => tcity.buildings[k] > 1 && !DATA.buildings[k].wonder)); if (b) tcity.buildings[b]--; }
      if (owner === 'p' || tcity.owner === 'p') G.report(s, [owner, tcity.owner], `${sp.icon} ${sp.name} struck ${tcity.name}`, owner === 'p' ? 'win' : 'loss', { extra: `Cast by the ${emp.name}. Losses: ${Object.entries(killed).map(([u, n]) => n + ' ' + DATA.units[u].name).join(', ') || 'none'}.` });
      msg = `${sp.icon} ${sp.name} struck ${tcity.name}.`;
      break;
    }
    case 'curseofash': hostileAct(s, owner, tcity.owner); msg = `🌫️ ${tcity.name} is cursed.`; break;
    case 'plaguewind': hostileAct(s, owner, tcity.owner); tcity.pop *= 1 - 0.12 * P; msg = `🦠 Plague sweeps ${tcity.name}.`; if (tcity.owner === 'p') G.log(s, 'p', `🦠 A foul wind from the ${emp.name} brings plague to ${tcity.name}!`, 'bad'); break;
    case 'veilmist': emp.veiled = s.time + 20 * 60 * G.pace(s).time; break;
    case 'dreamsend': {
      if (tcity.owner !== 'p' && owner === 'p' && G.rel) { const r = G.rel(s, tcity.owner); r.opinion = Math.min(100, r.opinion + 25 * P); if (r.status === 'war' && Math.random() < 0.4) { r.status = 'peace'; r.since = s.time; msg += ' They wake longing for peace — the war is over.'; } }
      else if (owner !== 'p' && tcity.owner === 'p' && G.rel) { const r = G.rel(s, owner); r.opinion = Math.min(100, r.opinion + 10); }
      break;
    }
    case 'raisedead': {
      const lost = (M.fallen[owner] || []).filter(f => s.time - f.t < 1800 * G.pace(s).time).reduce((a, f) => a + f.n, 0);
      const n = Math.max(5, Math.round(lost * 0.25 * P));
      tcity.units.risen = (tcity.units.risen || 0) + n;
      M.fallen[owner] = [];
      msg = `🧟 ${n} of the fallen rise again in ${tcity.name}.`;
      break;
    }
    case 'soulharvest': { const k = tcity.pop * 0.08; tcity.pop -= k; G.gain(s, tcity, { mana: Math.round(k * 12 * P) }); msg = `👻 ${Math.round(k)} souls fuel the ${emp.name}'s magic.`; break; }
  }
  if (sp.shape) {
    const to = SHAPES[sp.shape](tile);
    G.reshape(s, tile, to);
    G.log(s, 'p', `${sp.icon} The land itself changes at (${tile.x}, ${tile.y}): now ${DATA.terrain[to].name.toLowerCase()}${owner === 'p' ? '' : `, by the magic of the ${emp.name}`}.`, owner === 'p' ? 'good' : 'warn');
    msg = `${sp.icon} ${sp.name}: the land at (${tile.x}, ${tile.y}) is now ${DATA.terrain[to].name.toLowerCase()}.`;
  }
  if (owner === 'p') G.log(s, 'p', msg, 'good');
  s.stats.spells = (s.stats.spells || 0) + (owner === 'p' ? 1 : 0);
  return null;
};

// ---------------------------------------------------------------------
// Effects that need more than a timed modifier
// ---------------------------------------------------------------------
G.modSources.push((s, owner, city, key) => {
  // Ward of Weaving cancels calamity penalties
  if (!city || !city.ward || city.ward <= s.time || !s.calamities) return 1;
  let m = 1;
  for (const c of s.calamities) {
    if (c.end <= s.time || Math.hypot(c.x - city.x, c.y - city.y) > c.r) continue;
    const f = DATA.calamities[c.kind] && DATA.calamities[c.kind].fx[key];
    if (f && f < 1) m /= f;
  }
  return m;
});
// Veil of Mist: rivals forget you for a while; the Great Working draws their wrath
{
  const prev = G.hostility;
  G.hostility = (s, aiId, target) => {
    let h = prev(s, aiId, target);
    if (h <= 0) return h;
    const e = s.empires[target];
    if (e && e.veiled > s.time) h *= 0.35;
    const w = s.magic && s.magic.working && s.magic.working[target];
    if (w && w.stage > 0) h *= 1 + 0.15 * w.stage;
    return h;
  };
}
// count the fallen, for Raise the Fallen
G.battleHooks.push((s, ctx) => {
  const M = magic(s), r = ctx.r;
  const note = (owner, units) => { if (!owner) return; const n = Object.entries(units || {}).reduce((a, [u, k]) => a + (DATA.units[u] && DATA.units[u].at ? k : 0), 0); if (n) (M.fallen[owner] = M.fallen[owner] || []).push({ t: s.time, n }); };
  note(ctx.m.owner, r.attLost);
  note(ctx.defOwner, r.defLost);
});

// ---------------------------------------------------------------------
// Wild magic: strain, backlash, rifts
// ---------------------------------------------------------------------
const spawnRift = (s, city) => {
  const t = G.freeTile(s, x => Math.hypot(x.x - city.x, x.y - city.y) >= 2 && Math.hypot(x.x - city.x, x.y - city.y) <= 4 && !G.isWater(x));
  if (!t) return null;
  const id = G.newId(s, 'k');
  const n = Math.round(10 + s.time / (1800 * G.pace(s).time) * 3);
  s.camps[id] = { id, x: t.x, y: t.y, tier: 5, units: { demon: n }, loot: { mana: 400 + n * 20, iron: 200, tools: 40 }, kind: 'rift', near: city.id, next: s.time + 600 * G.pace(s).time };
  t.camp = id;
  G.reveal(s, t.x, t.y, 1);
  return s.camps[id];
};
G.slowHooks.push((s, dtMin) => {
  if (!s.ley) s.ley = G.genLey(s);
  const M = magic(s);
  for (const [cid, v] of Object.entries(M.strain)) {
    const city = s.cities[cid];
    if (!city) { delete M.strain[cid]; continue; }
    M.strain[cid] = Math.max(0, v - 2 * dtMin);
    if (v > 60 && !(city.ward > s.time) && Math.random() < (v - 60) / 400 * dtMin) {
      const roll = Math.random();
      if (roll < 0.35) {
        const rift = spawnRift(s, city);
        if (rift) G.log(s, city.owner, `👹 Wild magic tears the weave near ${city.name}: a rift opens at (${rift.x}, ${rift.y}) and demons pour out!`, 'bad');
        if (rift && city.owner !== 'p' && s.explored[rift.y * s.map + rift.x]) G.log(s, 'p', `👹 A demon rift opened near ${city.name} (${rift.x}, ${rift.y}) — the ${s.empires[city.owner].name} overreached.`, 'warn');
      } else if (roll < 0.6 && G.startCalamity) { G.startCalamity(s, 'tempest', G.tileAt(s, city.x, city.y)); }
      else { city.res.mana = (city.res.mana || 0) * 0.5; G.log(s, city.owner, `💥 A wild surge in ${city.name} burns away half its mana.`, 'bad'); }
      M.strain[cid] = v * 0.4;
    }
  }
  // rifts send demons against the nearest city now and then
  for (const camp of Object.values(s.camps)) {
    if (camp.kind !== 'rift' || camp.next > s.time) continue;
    camp.next = s.time + G.rnd(10, 18) * 60 * G.pace(s).time;
    if (!(camp.units.demon > 0)) continue;
    const target = Object.values(s.cities).sort((a, b) => Math.hypot(a.x - camp.x, a.y - camp.y) - Math.hypot(b.x - camp.x, b.y - camp.y))[0];
    if (!target || Math.hypot(target.x - camp.x, target.y - camp.y) > 7) continue;
    const n = Math.max(1, Math.floor(camp.units.demon * 0.5));
    const cd = G.cityDefense(s, target);
    const r = G.battle(s, null, { demon: n }, 1, target.owner, target.units, cd.mult, cd.flat, 'attack');
    target.units = r.defLeft; camp.units.demon -= r.attLost.demon;
    if (r.win) { target.pop *= 0.9; for (const g of ['grain', 'timber', 'mana']) target.res[g] = (target.res[g] || 0) * 0.85; }
    G.report(s, [target.owner], `Demons from a rift assaulted ${target.name}`, target.owner === 'p' ? (r.win ? 'loss' : 'win') : 'info',
      { att: 'Rift Demons', def: s.empires[target.owner].name, A: r.A, D: r.D, attSent: { demon: n }, attLost: r.attLost, defHad: G.addUnits({ ...r.defLeft }, r.defLost), defLost: r.defLost, loot: {}, extra: r.win ? 'The demons broke in and wrought havoc.' : 'The demons were thrown back.' });
  }
  // summoned guardians fade
  for (const c of Object.values(s.cities)) {
    if (!c.summoned || !c.summoned.length) continue;
    c.summoned = c.summoned.filter(x => {
      if (x.until > s.time) return true;
      c.units[x.unit] = Math.max(0, (c.units[x.unit] || 0) - x.n); if (!c.units[x.unit]) delete c.units[x.unit];
      return false;
    });
  }
});
// closing a rift is worth renown
G.battleHooks.push((s, ctx) => {
  const t = ctx.tile;
  if (!t || !ctx.defHad || !ctx.defHad.demon || !ctx.r.win) return;
  const me = s.empires[ctx.m.owner];
  me.renownBonus = (me.renownBonus || 0) + 15;
  G.log(s, ctx.m.owner, `👹 The rift at (${t.x}, ${t.y}) is sealed. (+15 renown)`, 'good');
});

// ---------------------------------------------------------------------
// The Great Working — a third path to victory
// ---------------------------------------------------------------------
G.WORKING_STAGES = 5;
G.workingNeeds = { nodes: 4, tower: 15 };
G.workingStageCost = stage => ({ mana: Math.round(2500 * Math.pow(1.45, stage)), gold: 1500 * (stage + 1) });
G.workingStatus = (s, owner) => {
  const w = magic(s).working[owner] || { stage: 0 };
  const nodes = G.nodesOf(s, owner).length;
  const city = G.citiesOf(s, owner).sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'))[0];
  const res = { stage: w.stage, active: !!w.end, end: w.end, nodes, city, cost: G.workingStageCost(w.stage), ok: true };
  if (w.stage >= G.WORKING_STAGES) return { ...res, ok: false, done: true, reason: 'Complete' };
  if (w.end) return { ...res, ok: false, reason: 'A stage is under way' };
  if (nodes < G.workingNeeds.nodes) return { ...res, ok: false, reason: `Hold ${G.workingNeeds.nodes} ley nodes (you hold ${nodes})` };
  if (!city || G.lvl(city, 'magetower') < G.workingNeeds.tower) return { ...res, ok: false, reason: `Needs a Mage Tower ${G.workingNeeds.tower}` };
  if (manaOf(s, owner) < res.cost.mana) return { ...res, ok: false, poor: true, reason: 'Not enough mana' };
  if (s.empires[owner].gold < res.cost.gold) return { ...res, ok: false, poor: true, reason: 'Not enough gold' };
  return res;
};
G.workingStageTime = (s, stage) => Math.round(2400 * Math.pow(1.25, stage) * G.pace(s).time);
G.beginWorkingStage = (s, owner) => {
  const st = G.workingStatus(s, owner);
  if (!st.ok) return st.reason;
  payMana(s, owner, st.city, st.cost.mana); s.empires[owner].gold -= st.cost.gold;
  const M = magic(s);
  M.working[owner] = { stage: st.stage, city: st.city.id, start: s.time, end: s.time + G.workingStageTime(s, st.stage) };
  M.strain[st.city.id] = (M.strain[st.city.id] || 0) + 25;
  const emp = s.empires[owner];
  G.log(s, 'p', owner === 'p' ? `🌌 The Great Working: stage ${st.stage + 1} of ${G.WORKING_STAGES} begins in ${st.city.name}.` : `🌌 The ${emp.name} has begun stage ${st.stage + 1} of the Great Working in ${st.city.name}! Break their hold on the ley nodes or take the city to stop it.`, owner === 'p' ? 'good' : 'warn');
  return null;
};
G.slowHooks.push(s => {
  const M = magic(s);
  for (const [owner, w] of Object.entries(M.working)) {
    if (!w.end || w.end > s.time) continue;
    const emp = s.empires[owner], city = s.cities[w.city];
    // the ritual fails if the city fell or the ley hold broke
    if (!city || city.owner !== owner || G.nodesOf(s, owner).length < G.workingNeeds.nodes) {
      w.end = null; G.log(s, 'p', `🌌 The ${owner === 'p' ? '' : emp.name + "'s "}Great Working faltered: ${!city || city.owner !== owner ? 'its city was lost' : 'its hold on the ley nodes broke'}.`, owner === 'p' ? 'bad' : 'good');
      continue;
    }
    w.stage++; w.end = null;
    G.log(s, 'p', owner === 'p' ? `🌌 Stage ${w.stage} of the Great Working is complete.` : `🌌 The ${emp.name} completed stage ${w.stage} of ${G.WORKING_STAGES} of the Great Working.`, owner === 'p' ? 'good' : 'warn');
    if (w.stage >= G.WORKING_STAGES) {
      emp.renownBonus = (emp.renownBonus || 0) + 250;
      if (s.settings.mode === 'conquest' && !s.victory && !s.gameOver) {
        if (owner === 'p') { s.victory = 'arcane'; G.log(s, 'p', '🌌 The Great Working is done. The weave of the world answers to you — victory!', 'good'); }
        else { s.gameOver = 'arcane'; s.gameOverBy = owner; G.log(s, 'p', `🌌 The ${emp.name} completed the Great Working. The world bends to their will.`, 'bad'); }
      }
    }
  }
});
// realm boons from completed stages
G.modSources.push((s, owner, city, key) => {
  const w = s.magic && s.magic.working && s.magic.working[owner];
  if (!w || !w.stage) return 1;
  if (key === 'mana') return 1 + 0.1 * w.stage;
  if (key === 'spellPower') return 1 + 0.05 * w.stage;
  return 1;
});

// ---------------------------------------------------------------------
// AI magic
// ---------------------------------------------------------------------
G.aiHooks.push((s, emp, dtMin) => {
  if (Math.random() > 0.35) return;
  const cities = G.citiesOf(s, emp.id).filter(c => G.lvl(c, 'magetower') > 0);
  if (!cities.length) return;
  const M = magic(s);
  const best = cities.sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'))[0];
  if ((M.strain[best.id] || 0) > 45) return;
  const mana = manaOf(s, emp.id);
  const can = (id, k = 1.6) => { const st = G.spellStatus(s, emp.id, best.id, id); return st.ok && mana > st.cost * k ? st : null; };
  const spells = G.spellsOf(s, emp.id);
  // defend a city under threat
  const threatened = s.moves.find(m => m.owner !== emp.id && ['raid', 'attack', 'conquer'].includes(m.type) && (() => { const t = G.tileAt(s, m.x, m.y); return t.city && s.cities[t.city].owner === emp.id; })());
  if (threatened) {
    const t = G.tileAt(s, threatened.x, threatened.y);
    for (const id of ['illusion', 'stormshield', 'hearthward', 'runeward', 'wildcall']) if (spells.includes(id) && can(id)) { G.castSpell(s, emp.id, best.id, id, t.city); return; }
  }
  // ward against calamities
  const struck = G.citiesOf(s, emp.id).find(c => G.calamitiesAt && G.calamitiesAt(s, c.x, c.y).some(q => DATA.calamities[q.kind].bad));
  if (struck && can('manaward')) { G.castSpell(s, emp.id, best.id, 'manaward', struck.id); return; }
  // raise the fallen
  if (spells.includes('raisedead') && (M.fallen[emp.id] || []).reduce((a, f) => a + f.n, 0) > 20 && can('raisedead')) { G.castSpell(s, emp.id, best.id, 'raisedead', best.id); return; }
  // strike an enemy at war, late in the game
  if (G.aiPressure(s) > 0.5) {
    const foe = Object.values(s.cities).filter(c => c.owner !== emp.id && Math.hypot(c.x - best.x, c.y - best.y) <= 14 && G.hostility(s, emp.id, c.owner) >= 1.2)[0];
    if (foe) for (const id of ['emberstorm', 'lightning', 'tempest', 'plaguewind', 'curseofash']) if (spells.includes(id) && can(id)) { G.castSpell(s, emp.id, best.id, id, foe.id); return; }
  }
  // the Great Working, when the stars align
  if (G.aiPressure(s) > 0.9 && G.workingStatus(s, emp.id).ok && Math.random() < 0.3) { G.beginWorkingStage(s, emp.id); return; }
  // otherwise, an economic spell on its best city
  for (const id of ['bountifulrain', 'verdant', 'runehaste', 'golems', 'calmseas', 'summersun']) if (spells.includes(id) && can(id, 3) && Math.random() < 0.5) { G.castSpell(s, emp.id, best.id, id, best.id); return; }
});

// new games get a ley network
G.newGameHooks.push(s => { s.ley = G.genLey(s); magic(s); });

// peoples defined in races2.js attach their mechanics now that every system exists
if (typeof initRaces2 === 'function') initRaces2();
})();
