// =====================================================================
//  Four more peoples: the Tidekin, the Veilborn, the Gravebound and the
//  Windkin. Loaded right after data.js, before the engine, so this file
//  only declares data at load time (the merging tables in culture.js,
//  wonders.js and seasons.js pick up DATA.traditions / DATA.wonders /
//  DATA.seasonRace defined here). Their mechanics need G and the feature
//  modules, so they live in initRaces2(), which magic.js calls once every
//  system exists (it is idempotent; tests call it after loading).
// =====================================================================
'use strict';

// ---------------------------------------------------------------------
// Unique goods
// ---------------------------------------------------------------------
Object.assign(DATA.goods, {
  pearls:     { name: 'Pearls',     icon: '🦪', value: 4.0, race: 'tide' },
  dreamsilk:  { name: 'Dreamsilk',  icon: '🧵', value: 6.0, race: 'veil' },
  bonedust:   { name: 'Bonedust',   icon: '🦴', value: 2.5, race: 'grave' },
  stormglass: { name: 'Stormglass', icon: '🔷', value: 6.0, race: 'wind' },
});
for (const g of ['pearls', 'dreamsilk', 'bonedust', 'stormglass']) if (!DATA.goodOrder.includes(g)) DATA.goodOrder.push(g);

// ---------------------------------------------------------------------
// Peoples
//   extra bonus keys read by initRaces2 through G.mod:
//   fishing (Harbor grain), shipSpeed, shipCost (ships and Harbors),
//   raise (share of the fallen the Gravebound raise), mana, spellPower (magic.js)
// ---------------------------------------------------------------------
Object.assign(DATA.races, {
  tide: {
    name: 'Tidekin', adj: 'Tidekin', color: '#138d90',
    blurb: 'Sea-folk of the coasts and inland seas, as at home under the waves as on the shore. Their harbors teem with fish, their ships are the swiftest afloat and their warriors wade straight across the water, but the ore of the deep hills is strange to them.',
    perks: ['+10% grain, +10% taxes from the sea trade; Harbors fish 60% more', 'Ships and Harbors cost 25% less, ships sail 25% faster', 'Amphibious infantry and riders cross water without transports', 'Pearl Beds (coastal): pearls lift happiness and pay well at market', 'Capital always lies on the shore', '−20% ore'],
    mult: { grain: 1.1, ore: 0.8 },
    bonus: { fishing: 1.6, shipSpeed: 1.25, shipCost: 0.75, tax: 1.1 },
    unique: 'pearlbeds',
    units: ['shorespear', 'shellguard', 'harpooner', 'kelpierider', 'tidecharger', 'abyssguard', 'ram_t', 'treb_t'],
    recipes: {},
    aggr: 0.45,
    gods: ['thalos', 'ysolde'],
    heroNames: ['Marenna Saltbraid', 'Corwen Tidewright', 'Ysolt Pearlhand', 'Brannoc Gullcry', 'Nerys Deepcurrent', 'Halvard Foamcrest'],
    specialty: ['grain', 'timber', 'pearls'],
    mageUnit: 'tidesinger',
  },
  veil: {
    name: 'Veilborn', adj: 'Veilborn', color: '#c35bb0',
    blurb: 'A fey court from the twilight between worlds. Few in number and slow to grow, they weave glamours that turn blades aside and draw more mana from the land than any mortal people.',
    perks: ['+50% mana, spells 20% stronger', 'Glamour: illusions misdirect 1 blow in 10 (+10% defence)', 'Research 15% faster, +15% timber', 'Dreamspire: timber + grain → dreamsilk; each level +1.5% garrison defence', 'Capital lies near a ley enclave', '−10% housing, −15% growth'],
    mult: { timber: 1.15, ore: 0.9 },
    bonus: { mana: 1.5, spellPower: 1.2, def: 1.1, researchTime: 0.85, housing: 0.9, popGrowth: 0.85 },
    unique: 'dreamspire',
    units: ['duskblade', 'mirrorguard', 'moonbow', 'wisprider', 'nightmare', 'eclipseguard', 'ram_v', 'treb_v'],
    recipes: {},
    aggr: 0.4,
    gods: ['lirael', 'mirren'],
    heroNames: ['Sorrelai Duskwhisper', 'Quillon Mothwing', 'Ilvaine of the Gloaming', 'Peregrin Hollowmoon', 'Liraeth Glassbloom', 'Morrow Thistlecrown'],
    specialty: ['timber', 'mana', 'dreamsilk'],
    mageUnit: 'glamourweaver',
  },
  grave: {
    name: 'Gravebound', adj: 'Gravebound', color: '#56616b',
    blurb: 'A necromantic kingdom whose soldiers are the risen dead. Their legions need no bread, only bonedust ground from stone and ore, and every battle they win swells their ranks with the fallen. The living are few and joyless, and every neighbour fears them.',
    perks: ['Troops eat no grain: they cost bonedust and gold', 'After a victory, a quarter of the fallen (both sides) rise as levies', 'Ossuary: stone + ore → bonedust; each level raises 1% more', '+15% stone, +10% ore', 'Feared: rivals start with a lower opinion', '−20% growth, −15% grain, gloomy cities (−5 happiness)'],
    mult: { stone: 1.15, ore: 1.1, grain: 0.85 },
    bonus: { popGrowth: 0.8 },
    unique: 'ossuary',
    units: ['skeleton', 'barrowwarden', 'bonearcher', 'ghoulrunner', 'dreadknight', 'wightlord', 'ram_g', 'treb_g'],
    recipes: {},
    aggr: 0.65,
    gods: ['mirren', 'skarr'],
    heroNames: ['Vael the Unburied', 'Morcant Ashveil', 'Sister Cerys Bonewright', 'Ostrik Gravemantle', 'Hollow Edda', 'Lord Malgrin Pale'],
    specialty: ['stone', 'ore', 'bonedust'],
    mageUnit: 'necromancer',
  },
  wind: {
    name: 'Windkin', adj: 'Windkin', color: '#4f8fdc',
    blurb: 'Hawk-folk of the high peaks who ride the storm winds. Their fliers ignore rivers, seas and mountains alike and their eyes miss nothing, but grain grows poorly on their crags and their airborne warriors are lightly armoured.',
    perks: ['Fliers: Hawk and Roc Riders and Thunderwings fly straight over water and mountains', 'Scouts fly too; see 40% farther, march 12% faster', 'Aerie: stone + timber → stormglass; +3% vision and quarters 4 fliers per level', '+15% stone, +5% ore, +10% taxes from the high-pass tolls; light-boned troops eat 20% less', 'Fliers carry less and are lightly armoured', '−10% grain'],
    mult: { grain: 0.9, stone: 1.15, ore: 1.05 },
    bonus: { vision: 1.4, travel: 1.12, upkeep: 0.8, tax: 1.1 },
    unique: 'aerie',
    units: ['cliffspear', 'cragsentinel', 'galeshot', 'hawkrider', 'rocrider', 'thunderwing', 'ram_w', 'treb_w'],
    recipes: {},
    aggr: 0.55,
    gods: ['thalos', 'lirael'],
    heroNames: ['Kestra Highwind', 'Aerrow Talonfeather', 'Sky-Mother Ulva', 'Tarran Stormcrest', 'Wren Cloudpiercer', 'Faral Gustwing'],
    specialty: ['stone', 'ore', 'stormglass'],
    mageUnit: 'stormcaller',
  },
});
for (const r of ['tide', 'veil', 'grave', 'wind']) if (!DATA.raceOrder.includes(r)) DATA.raceOrder.push(r);

// ---------------------------------------------------------------------
// Unique buildings (pearlbeds is a raw producer; the other three are
// refiners run by the G.econ wrapper in initRaces2)
// ---------------------------------------------------------------------
Object.assign(DATA.buildings, {
  pearlbeds: {
    name: 'Pearl Beds', icon: '🦪', max: 20, time: 18, growth: 1.36, workers: 2, race: 'tide', coastal: true,
    cost: { timber: 110, stone: 50, grain: 60 }, prod: { pearls: 1.2 },
    desc: 'Divers tend oyster beds in the shallows. Pearls are a luxury: while a city has them stocked its people are happier (+6), and they fetch a fine price at market. Armoured Tidekin troops wear pearl-inlaid shells. Needs a coastal city.',
    req: { townhall: 2 },
  },
  dreamspire: {
    name: 'Dreamspire', icon: '🌌', max: 20, time: 24, growth: 1.38, workers: 2, race: 'veil',
    cost: { timber: 150, stone: 80, grain: 60 },
    recipe: { in: { timber: 3, grain: 1 }, out: { dreamsilk: 1 }, rate: 0.8 },
    desc: 'A slender tower where dreamers spin moth-silk from sleep. Dreamsilk arms the Veilborn host; each level also cloaks the city in glamours (+1.5% garrison defence).',
    req: { townhall: 3, lumber: 3 },
  },
  ossuary: {
    name: 'Ossuary', icon: '⚱️', max: 20, time: 18, growth: 1.36, workers: 2, race: 'grave',
    cost: { timber: 80, stone: 110 },
    recipe: { in: { stone: 2, ore: 0.5 }, out: { bonedust: 1 }, rate: 2.5 },
    desc: 'Bone-mills grind stone, ore and the remains of the old dead into bonedust, from which every Gravebound soldier is raised. Each level also raises 1% more of the fallen after a victory (up to +20%).',
    req: { townhall: 2 },
  },
  aerie: {
    name: 'Aerie', icon: '🪺', max: 20, time: 24, growth: 1.38, workers: 2, race: 'wind',
    cost: { timber: 140, stone: 140, grain: 40 },
    recipe: { in: { stone: 3, timber: 1 }, out: { stormglass: 1 }, rate: 0.8 },
    desc: 'Nests on the highest crags, where lightning is caught in glass. Stormglass harnesses the great fliers. Each level also adds +3% vision and quarters 4 soldiers.',
    req: { townhall: 3, quarry: 3 },
  },
});
{
  const i = DATA.buildingOrder.indexOf('warpit');
  DATA.buildingOrder.splice(i < 0 ? DATA.buildingOrder.length : i + 1, 0, ...['pearlbeds', 'dreamspire', 'ossuary', 'aerie'].filter(b => !DATA.buildingOrder.includes(b)));
  const ws = DATA.buildingGroups.find(g => g.name === 'Workshops');
  for (const b of ['pearlbeds', 'dreamspire', 'ossuary', 'aerie']) if (ws && !ws.list.includes(b)) ws.list.push(b);
}

// ---------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------
Object.assign(DATA.units, {
  // Tidekin (amphibious: may cross water without transports when the whole army is amphibious)
  shorespear: { name: 'Shorespear',      icon: '🔱', type: 'inf',    role: 'infantry', atk: 20,  defI: 30, defC: 25, spd: 6,  carry: 40,  upkeep: 0.5, time: 20, at: 'barracks', req: 1, amphibious: true, cost: { grain: 40, gold: 15, weapons: 1 }, desc: 'Fisher-folk with tridents who wade ashore anywhere. Amphibious.' },
  shellguard: { name: 'Shellguard',      icon: '🐚', type: 'inf',    role: 'infantry', atk: 12,  defI: 60, defC: 55, spd: 5,  carry: 25,  upkeep: 0.6, time: 30, at: 'barracks', req: 3, amphibious: true, cost: { grain: 50, gold: 30, weapons: 2, pearls: 1 }, desc: 'Great pearl-inlaid shell shields locked into a wall. Amphibious.' },
  harpooner:  { name: 'Harpooner',       icon: '🎣', type: 'ranged', role: 'ranged', atk: 55,  defI: 25, defC: 25, spd: 6,  carry: 30,  upkeep: 0.7, time: 36, at: 'barracks', req: 5, amphibious: true, cost: { grain: 60, gold: 40, weapons: 3 }, desc: 'Whalers whose barbed harpoons punch through mail. Amphibious.' },
  kelpierider:{ name: 'Kelpie Rider',    icon: '🌊', type: 'cav',    role: 'cavalry', atk: 50,  defI: 22, defC: 30, spd: 15, carry: 90,  upkeep: 1.0, time: 40, at: 'stable',   req: 3, amphibious: true, cost: { grain: 80, gold: 60, weapons: 3 }, desc: 'Raiders on water-horses that gallop through surf and shallows alike. Amphibious.' },
  tidecharger:{ name: 'Tidecharger',     icon: '🐋', type: 'cav',    role: 'cavalry', atk: 88,  defI: 45, defC: 38, spd: 12, carry: 80,  upkeep: 1.5, time: 62, at: 'stable',   req: 1, cost: { grain: 120, gold: 110, weapons: 5, pearls: 4 }, desc: 'Armoured lancers on great sea-beasts that crash into a line like a breaking wave.' },
  abyssguard: { name: 'Abyssal Guard',   icon: '🦑', type: 'inf',    role: 'infantry', atk: 80,  defI: 90, defC: 80, spd: 5,  carry: 40,  upkeep: 1.4, time: 75, at: 'barracks', req: 10, amphibious: true, cost: { grain: 150, gold: 130, weapons: 6, pearls: 6 }, desc: 'Champions from the deep trenches in coral plate. Amphibious.' },
  ram_t:      { name: 'Coral Ram',       icon: '🪸', type: 'siege',  role: 'siege', atk: 40,  defI: 25, defC: 15, spd: 3,  carry: 0,   upkeep: 1.2, time: 90, at: 'workshop', req: 1, cost: { timber: 300, iron: 40, grain: 100, gold: 80 }, wallBreak: 0.25, desc: 'A ram capped with living coral that grows into the cracks it makes.' },
  treb_t:     { name: 'Wave Hurler',     icon: '🌀', type: 'siege',  role: 'siege', atk: 70,  defI: 15, defC: 10, spd: 2,  carry: 0,   upkeep: 1.5, time: 120, at: 'workshop', req: 5, cost: { timber: 400, stone: 200, iron: 60, gold: 120 }, wreck: 1, desc: 'A ship\'s mangonel on wheels, hurling barrels of seawater and stone.' },
  tidesinger: { name: 'Tidesinger',      icon: '🎶', type: 'ranged', role: 'mage', atk: 40,  defI: 28, defC: 25, spd: 6,  carry: 15,  upkeep: 0.8, time: 55, at: 'magetower', req: 3, mage: 1, amphibious: true, cost: { grain: 70, gold: 70, mana: 20 }, desc: 'Their songs call fog and squalls over the enemy. Each mage strengthens the whole army (up to +30%). Amphibious.' },
  // Veilborn
  duskblade:  { name: 'Duskblade',       icon: '🗡️', type: 'inf',    role: 'infantry', atk: 25,  defI: 32, defC: 28, spd: 7,  carry: 35,  upkeep: 0.5, time: 22, at: 'barracks', req: 1, cost: { grain: 40, gold: 20, weapons: 1 }, desc: 'Fey duellists who strike from where they seemed not to be.' },
  mirrorguard:{ name: 'Mirrorguard',     icon: '🪞', type: 'inf',    role: 'infantry', atk: 12,  defI: 62, defC: 62, spd: 6,  carry: 25,  upkeep: 0.6, time: 30, at: 'barracks', req: 3, cost: { grain: 50, gold: 30, weapons: 1, dreamsilk: 1 }, desc: 'Their shields show each foe a dozen false targets.' },
  moonbow:    { name: 'Moonbow',         icon: '🌙', type: 'ranged', role: 'ranged', atk: 60,  defI: 20, defC: 22, spd: 6,  carry: 25,  upkeep: 0.7, time: 38, at: 'barracks', req: 5, cost: { grain: 60, gold: 45, weapons: 2, dreamsilk: 1 }, desc: 'Archers whose silver shafts never seem to miss.' },
  wisprider:  { name: 'Wisp Rider',      icon: '🦋', type: 'cav',    role: 'cavalry', atk: 50,  defI: 22, defC: 30, spd: 17, carry: 80,  upkeep: 1.0, time: 40, at: 'stable',   req: 3, cost: { grain: 80, gold: 60, weapons: 2, dreamsilk: 1 }, desc: 'Riders on pale moths the size of horses, there and gone like will-o\'-wisps.' },
  nightmare:  { name: 'Nightmare Knight',icon: '🌑', type: 'cav',    role: 'cavalry', atk: 90,  defI: 40, defC: 35, spd: 14, carry: 70,  upkeep: 1.5, time: 60, at: 'stable',   req: 1, cost: { grain: 120, gold: 110, weapons: 4, dreamsilk: 4 }, desc: 'Knights on black dream-steeds whose hooves strike sparks of terror.' },
  eclipseguard:{ name: 'Eclipse Guard',  icon: '🌘', type: 'inf',    role: 'infantry', atk: 82,  defI: 95, defC: 90, spd: 5,  carry: 30,  upkeep: 1.5, time: 75, at: 'barracks', req: 10, cost: { grain: 140, gold: 140, weapons: 4, dreamsilk: 6 }, desc: 'The court\'s sworn blades, wrapped in shadows that drink the light.' },
  ram_v:      { name: 'Veil Breaker',    icon: '🌫️', type: 'siege',  role: 'siege', atk: 35,  defI: 25, defC: 15, spd: 3,  carry: 0,   upkeep: 1.1, time: 90, at: 'workshop', req: 1, cost: { timber: 280, dreamsilk: 4, grain: 100, gold: 80 }, wallBreak: 0.3, desc: 'A mist-wrapped engine that convinces stones they were never joined.' },
  treb_v:     { name: 'Starfall Orrery', icon: '🌠', type: 'siege',  role: 'siege', atk: 70,  defI: 15, defC: 10, spd: 2,  carry: 0,   upkeep: 1.4, time: 115, at: 'workshop', req: 5, cost: { timber: 350, stone: 150, dreamsilk: 6, gold: 120 }, wreck: 1, desc: 'Brass rings that call shards of falling stars down onto towers.' },
  glamourweaver:{ name: 'Glamourweaver', icon: '🔮', type: 'ranged', role: 'mage', atk: 38,  defI: 26, defC: 26, spd: 6,  carry: 10,  upkeep: 0.8, time: 55, at: 'magetower', req: 3, mage: 1, cost: { grain: 60, gold: 70, mana: 20, dreamsilk: 1 }, desc: 'Weavers of illusion who fill the field with phantom hosts. Each mage strengthens the whole army (up to +30%).' },
  // Gravebound (risen dead: no grain upkeep; they cost bonedust and gold)
  skeleton:   { name: 'Skeleton Levy',   icon: '💀', type: 'inf',    role: 'infantry', atk: 18,  defI: 28, defC: 22, spd: 5,  carry: 30,  upkeep: 0, time: 20, at: 'barracks', req: 1, cost: { bonedust: 7, gold: 6 }, desc: 'Rattling bones with rusted spears. They never tire and never eat.' },
  barrowwarden:{ name: 'Barrow Warden',  icon: '⚰️', type: 'inf',    role: 'infantry', atk: 12,  defI: 58, defC: 52, spd: 4,  carry: 20,  upkeep: 0, time: 30, at: 'barracks', req: 3, cost: { bonedust: 12, gold: 11 }, desc: 'Grave-guardians in tomb-plate who hold a gate for ever.' },
  bonearcher: { name: 'Bone Archer',     icon: '🏹', type: 'ranged', role: 'ranged', atk: 50,  defI: 22, defC: 22, spd: 5,  carry: 25,  upkeep: 0, time: 36, at: 'barracks', req: 5, cost: { bonedust: 15, gold: 15 }, desc: 'Skeletal bowmen loosing arrows fletched with grave-crow feathers.' },
  ghoulrunner:{ name: 'Ghoul Runner',    icon: '🧟', type: 'cav',    role: 'cavalry', atk: 45,  defI: 20, defC: 25, spd: 14, carry: 70,  upkeep: 0, time: 40, at: 'stable',   req: 3, cost: { bonedust: 17, gold: 22 }, desc: 'Loping ghouls that run down stragglers and drag off the spoils.' },
  dreadknight:{ name: 'Dread Knight',    icon: '🐴', type: 'cav',    role: 'cavalry', atk: 88,  defI: 45, defC: 35, spd: 11, carry: 60,  upkeep: 0, time: 62, at: 'stable',   req: 1, cost: { bonedust: 36, gold: 45 }, desc: 'Fallen lords on skeletal chargers, wreathed in grave-cold.' },
  wightlord:  { name: 'Wight Lord',      icon: '👻', type: 'inf',    role: 'infantry', atk: 82,  defI: 92, defC: 82, spd: 4,  carry: 30,  upkeep: 0, time: 80, at: 'barracks', req: 10, cost: { bonedust: 48, gold: 60 }, desc: 'Ancient kings bound to serve the Pale Crown. Their touch withers.' },
  ram_g:      { name: 'Bone Ram',        icon: '🦴', type: 'siege',  role: 'siege', atk: 40,  defI: 25, defC: 15, spd: 3,  carry: 0,   upkeep: 0, time: 90, at: 'workshop', req: 1, cost: { timber: 250, bonedust: 20, gold: 80 }, wallBreak: 0.25, desc: 'A ram of fused giant bones, pushed by the tireless dead.' },
  treb_g:     { name: 'Corpse Catapult', icon: '☠️', type: 'siege',  role: 'siege', atk: 70,  defI: 15, defC: 10, spd: 2,  carry: 0,   upkeep: 0, time: 120, at: 'workshop', req: 5, cost: { timber: 350, bonedust: 30, gold: 110 }, wreck: 1, desc: 'Flings plague-ridden remains and grave-stones over the walls.' },
  necromancer:{ name: 'Necromancer',     icon: '🧙', type: 'ranged', role: 'mage', atk: 40,  defI: 24, defC: 22, spd: 5,  carry: 10,  upkeep: 0, time: 55, at: 'magetower', req: 3, mage: 1, cost: { bonedust: 10, gold: 50, mana: 20 }, desc: 'Masters of the dead who goad the legions on. Each mage strengthens the whole army (up to +30%).' },
  risen:      { name: 'Risen',           icon: '🧟', type: 'inf',    role: 'infantry', atk: 20,  defI: 20, defC: 16, spd: 5,  carry: 10,  upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc: 'The fallen, raised to fight again. They take no citizens and eat nothing; in a Gravebound city they crumble if it holds too many.' },
  // Windkin (flying: an army made only of fliers goes straight over water and mountains)
  cliffspear: { name: 'Cliffspear',      icon: '🪶', type: 'inf',    role: 'infantry', atk: 20,  defI: 36, defC: 32, spd: 7,  carry: 35,  upkeep: 0.5, time: 20, at: 'barracks', req: 1, cost: { grain: 40, gold: 15, weapons: 1 }, desc: 'Crag-climbers with long spears who guard the mountain paths.' },
  cragsentinel:{ name: 'Crag Sentinel',  icon: '🗿', type: 'inf',    role: 'infantry', atk: 14,  defI: 60, defC: 64, spd: 6,  carry: 25,  upkeep: 0.6, time: 30, at: 'barracks', req: 3, cost: { grain: 50, gold: 30, weapons: 2 }, desc: 'Stone-still watchers with tall shields, braced against any charge.' },
  galeshot:   { name: 'Galeshot',        icon: '🌬️', type: 'ranged', role: 'ranged', atk: 58,  defI: 22, defC: 22, spd: 7,  carry: 25,  upkeep: 0.7, time: 36, at: 'barracks', req: 5, cost: { grain: 55, gold: 40, weapons: 2, stormglass: 1 }, desc: 'Archers who loose with the wind at their backs; stormglass tips crackle on impact.' },
  hawkrider:  { name: 'Hawk Rider',      icon: '🦅', type: 'cav',    role: 'flyer', atk: 50,  defI: 18, defC: 20, spd: 19, carry: 50,  upkeep: 0.8, time: 40, at: 'stable',   req: 3, flying: true, cost: { grain: 80, gold: 60, weapons: 2, stormglass: 1 }, desc: 'Raiders on giant hawks. Flying: straight over water and mountains, but lightly armoured and able to carry little.' },
  rocrider:   { name: 'Roc Rider',       icon: '🪽', type: 'cav',    role: 'flyer', atk: 92,  defI: 34, defC: 30, spd: 15, carry: 50,  upkeep: 1.5, time: 62, at: 'stable',   req: 1, flying: true, cost: { grain: 110, gold: 110, weapons: 4, stormglass: 4 }, desc: 'Lancers on vast rocs that stoop on their prey from the clouds. Flying.' },
  thunderwing:{ name: 'Thunderwing',     icon: '⚡', type: 'inf',    role: 'flyer', atk: 95,  defI: 68, defC: 68, spd: 9,  carry: 30,  upkeep: 1.5, time: 75, at: 'barracks', req: 10, flying: true, cost: { grain: 140, gold: 130, weapons: 5, stormglass: 6 }, desc: 'Elite winged warriors in stormglass harness who fall on the foe with the lightning. Flying.' },
  ram_w:      { name: 'Gale Ram',        icon: '🪵', type: 'siege',  role: 'siege', atk: 40,  defI: 25, defC: 15, spd: 3,  carry: 0,   upkeep: 1.2, time: 90, at: 'workshop', req: 1, cost: { timber: 300, iron: 40, grain: 100, gold: 80 }, wallBreak: 0.25, desc: 'A sail-driven ram that rolls downhill at terrible speed.' },
  treb_w:     { name: 'Storm Lobber',    icon: '⛈️', type: 'siege',  role: 'siege', atk: 72,  defI: 15, defC: 10, spd: 2,  carry: 0,   upkeep: 1.4, time: 115, at: 'workshop', req: 5, cost: { timber: 350, stone: 250, stormglass: 4, gold: 110 }, wreck: 1, desc: 'Hurls stormglass globes that burst into lightning over the rooftops.' },
  stormcaller:{ name: 'Stormcaller',     icon: '🌩️', type: 'ranged', role: 'mage', atk: 42,  defI: 22, defC: 22, spd: 8,  carry: 10,  upkeep: 0.8, time: 55, at: 'magetower', req: 3, mage: 1, flying: true, cost: { grain: 60, gold: 70, mana: 20, stormglass: 1 }, desc: 'Sky-priests who ride the updraughts and call down lightning. Each mage strengthens the whole army (up to +30%). Flying.' },
});

// ---------------------------------------------------------------------
// Rival realms, homelands
// ---------------------------------------------------------------------
Object.assign(DATA.aiNames, {
  tide:  ['Saltmere', 'Pearlhaven', 'Coralreach', 'Brinewick', 'Gullstrand', 'Wavecrest'],
  veil:  ['Glimmerhollow', 'Duskmantle', 'Moonveil', 'Thistlegloam', 'Evenlight', 'Starmere Court'],
  grave: ['Ossaria', 'Gloomhallow', 'Cryptmoor', 'Barrowgate', 'Ashgrave', 'Mournhold'],
  wind:  ['Skyhold', 'Galewatch', 'Highroost', 'Stormcrag', 'Featherpeak', 'Aerith Spire'],
});
Object.assign(DATA.aiRulers, {
  tide: 'Admiralty of the Tides', veil: 'Court of the Twilight Veil', grave: 'Dominion of the Pale Crown', wind: 'Eyrie of the High Winds',
});
// the first terrain is the capital's own tile, so it is always land
Object.assign(DATA.homeland, {
  tide:  { terrain: { fertile: 0.35, plains: 0.25, lake: 0.2, forest: 0.2 }, seeks: { grain: 1, timber: 0.4, water: 0.15 } },
  veil:  { terrain: { forest: 0.5, fertile: 0.35, plains: 0.15 }, seeks: { timber: 0.7, grain: 0.7 } },
  // a few groves among the barrows: with no forest at all the Gravebound were starved of timber for building
  grave: { terrain: { hills: 0.4, plains: 0.25, mountain: 0.2, forest: 0.15 }, seeks: { stone: 1, ore: 0.6, grain: 0.3, timber: 0.3 } },
  wind:  { terrain: { mountain: 0.4, hills: 0.35, fertile: 0.15, plains: 0.1 }, seeks: { stone: 0.8, ore: 0.5, grain: 0.7 } },
});

// ---------------------------------------------------------------------
// Traditions (merged by culture.js), wonders (wonders.js), seasons (seasons.js)
// ---------------------------------------------------------------------
DATA.traditions = Object.assign(DATA.traditions || {}, {
  // ---- Tidekin ----
  tidefest:   { name: 'Festival of Tides',   icon: '🌊', race: 'tide', tier: 1, happy: 4, fx: { grain: 1.1 }, desc: '+4 happiness, +10% grain.' },
  shipwright: { name: 'Shipwright Guilds',   icon: '⛵', race: 'tide', tier: 2, fx: { shipSpeed: 1.15, shipCost: 0.85, buildTime: 0.95 }, desc: 'Ships sail 15% faster and cost 15% less; construction 5% faster.' },
  pearldivers:{ name: 'Pearl Divers',        icon: '🦪', race: 'tide', tier: 2, fx: { pearls: 1.3, tax: 1.1 }, desc: '+30% pearls, +10% taxes.' },
  deepsong:   { name: 'Song of the Deep',    icon: '🐚', race: 'tide', tier: 3, happy: 3, fx: { fishing: 1.25, def: 1.08 }, desc: '+3 happiness; Harbors fish 25% more; +8% defence.' },
  // ---- Veilborn ----
  moonrites:  { name: 'Moonlit Rites',       icon: '🌕', race: 'veil', tier: 1, happy: 5, fx: { mana: 1.15 }, desc: '+5 happiness, +15% mana.' },
  mirrorhall: { name: 'Hall of Mirrors',     icon: '🪞', race: 'veil', tier: 2, fx: { def: 1.08, vision: 1.15 }, desc: '+8% defence; +15% vision.' },
  dreamweft:  { name: 'Dream Weavers',       icon: '🧵', race: 'veil', tier: 2, fx: { dreamsilk: 1.25, refine: 1.05, tax: 1.05 }, desc: '+25% dreamsilk, +5% refining and taxes.' },
  twilight:   { name: 'The Twilight Court',  icon: '👑', race: 'veil', tier: 3, culture: 1.2, fx: { spellPower: 1.15, popGrowth: 1.15, housing: 1.1 }, desc: 'Spells 15% stronger; +15% growth, +10% housing; +20% culture.' },
  // ---- Gravebound ----
  bonerites:  { name: 'Rites of the Ossuary',icon: '⚱️', race: 'grave', tier: 1, fx: { bonedust: 1.2, stone: 1.05 }, desc: '+20% bonedust, +5% stone.' },
  deathless:  { name: 'Deathless Legions',   icon: '💀', race: 'grave', tier: 2, fx: { raise: 1.3, atk: 1.05 }, desc: 'Raise 30% more of the fallen; +5% attack.' },
  procession: { name: 'Pale Processions',    icon: '🕯️', race: 'grave', tier: 2, happy: 6, weary: 0.5, desc: '+6 happiness; war weariness halved.' },
  palecrown:  { name: 'The Pale Crown',      icon: '☠️', race: 'grave', tier: 3, loyalty: 0.5, fx: { def: 1.1, popGrowth: 1.15 }, desc: '+10% defence, +15% growth; unrest erodes loyalty half as fast.' },
  // ---- Windkin ----
  skywatch:   { name: 'Skywatch',            icon: '🔭', race: 'wind', tier: 1, happy: 3, fx: { vision: 1.2 }, desc: '+3 happiness, +20% vision.' },
  galeroads:  { name: 'Gale Roads',          icon: '🌬️', race: 'wind', tier: 2, fx: { travel: 1.1, carry: 1.15 }, desc: 'March 10% faster; +15% plunder carried.' },
  glasswright:{ name: 'Glasswrights',        icon: '🔷', race: 'wind', tier: 2, fx: { stormglass: 1.25, refine: 1.05, stone: 1.05 }, desc: '+25% stormglass, +5% refining and stone.' },
  highnest:   { name: 'The High Nest',       icon: '🪺', race: 'wind', tier: 3, crowd: 0.5, fx: { grain: 1.15, popGrowth: 1.1, atk: 1.05 }, desc: '+15% grain, +10% growth, +5% attack; crowding unrest halved.' },
});

DATA.wonders = Object.assign(DATA.wonders || {}, {
  tide:  { key: 'wonder_tide', name: 'The Pearl Lighthouse', icon: '🗼', fx: { grain: 0.03, tax: 0.02, fishing: 0.04 },
    desc: 'A tower of white stone and nacre whose beam guides every Tidekin ship home across the inland seas. Each stage: +3% grain, +4% Harbor fishing, +2% taxes across the realm.' },
  veil:  { key: 'wonder_veil', name: 'The Moonwell Gate', icon: '🌕', fx: { mana: 0.04, def: 0.015, researchTime: -0.02 },
    desc: 'A ring of moonstone over a well of starlight, the door between the mortal world and the twilight. Each stage: +4% mana, +1.5% defence, research 2% faster.' },
  grave: { key: 'wonder_grave', name: 'The Necropolis Eternal', icon: '🏚️', fx: { bonedust: 0.04, atk: 0.015, def: 0.015 },
    desc: 'A city of tombs beneath the capital where every Gravebound king still holds court. Each stage: +4% bonedust, +1.5% attack and defence.' },
  wind:  { key: 'wonder_wind', name: 'The Storm Eyrie', icon: '🌪️', fx: { travel: 0.02, vision: 0.03, atk: 0.015 },
    desc: 'A spire on the highest peak, wrapped in a never-ending storm where the great rocs nest. Each stage: +2% march speed, +3% vision, +1.5% attack.' },
});

//                spring summer autumn winter: how strongly each season is felt
DATA.seasonRace = Object.assign(DATA.seasonRace || {}, {
  tide:  [1, 1.1, 1, 0.8],     // Tidekin: summer seas are rich; the sea softens winter
  veil:  [1.1, 0.9, 1.2, 0.8], // Veilborn: the twilight folk love the turning of the year
  grave: [0.6, 0.8, 1.1, 0.4], // Gravebound: the dead barely notice the cold
  wind:  [1, 1.1, 1, 1.2],     // Windkin: summer winds carry them; mountain winters bite hard
});

// ---------------------------------------------------------------------
// Mechanics. Call once after every feature module has loaded (magic.js
// does); safe to call again.
// ---------------------------------------------------------------------
const RACES2 = {
  pearlHappy: 6,        // happiness while pearls are stocked
  pearlEat: 0.01,       // pearls worn and traded away per citizen per minute
  graveGloom: 5,        // happiness lost in every Gravebound city
  raiseShare: 0.25,     // share of the fallen (both sides) raised after a Gravebound victory
  raisePerOssuary: 0.01, raiseOssuaryMax: 0.2,
  risenCap: (city) => 20 + 5 * ((city.buildings.barracks || 0) + (city.buildings.ossuary || 0)),
  risenRot: 0.05,       // share of the excess risen that crumbles per minute
  fearOpinion: 15,      // opinion lost with every neighbour of the Gravebound at the start
  glamourPerSpire: 0.015,
  aerieVision: 0.03, aerieQuarters: 4,
};
const initRaces2 = () => {
  if (typeof G === 'undefined' || G._races2) return;
  G._races2 = true;
  G.RACES2 = RACES2;
  const raceOf = (s, owner) => s.empires[owner] && s.empires[owner].race;

  // other modules' per-race tables: fill in the new peoples
  if (G.TRADE_SPECIALTY) for (const r of ['tide', 'veil', 'grave', 'wind']) G.TRADE_SPECIALTY[r] = G.TRADE_SPECIALTY[r] || DATA.races[r].specialty;
  try { if (typeof SPECIALTY !== 'undefined') for (const r of ['tide', 'veil', 'grave', 'wind']) SPECIALTY[r] = SPECIALTY[r] || DATA.races[r].specialty; } catch (e) { /* diplomacy absent */ }
  if (DATA.raceGods) for (const r of ['tide', 'veil', 'grave', 'wind']) DATA.raceGods[r] = DATA.raceGods[r] || DATA.races[r].gods;
  if (DATA.heroNames) for (const r of ['tide', 'veil', 'grave', 'wind']) DATA.heroNames[r] = DATA.heroNames[r] || DATA.races[r].heroNames;

  // ---- economy: unique refiners --------------------------------------
  const REF2 = ['dreamspire', 'ossuary', 'aerie'];
  const baseEcon = G.econ;
  G.econ = (s, city, away) => {
    const e = baseEcon(s, city, away);
    const race = raceOf(s, city.owner);
    if (race !== 'tide' && race !== 'veil' && race !== 'grave' && race !== 'wind') return e;
    let refMod = null;
    for (const t of REF2) {
      const L = G.lvl(city, t);
      if (!L || DATA.buildings[t].race !== race || e.refiners.some(r => r.type === t)) continue;
      if (refMod === null) refMod = G.mod(s, city.owner, city, 'refine');
      const rec = G.recipeOf(s, city, t);
      const off = city.refineOff && city.refineOff[t];
      const outRate = off ? 0 : rec.rate * L * Math.pow(1.1, L - 1) * e.eff * refMod;
      const inp = {}, out = {};
      for (const [g, v] of Object.entries(rec.in)) { inp[g] = v * outRate; e.net[g] = (e.net[g] || 0) - inp[g]; }
      for (const [g, v] of Object.entries(rec.out)) { out[g] = v * outRate * G.mod(s, city.owner, city, g) / G.pace(s).prod / (city.owner !== 'p' ? s.settings.aiMult : 1); e.net[g] = (e.net[g] || 0) + out[g]; }
      e.refiners.push({ type: t, in: inp, out, off });
    }
    // (Harbor fishing, with the 'fishing' key, lives in the engine's econ)
    return e;
  };
  // Aerie quarters fliers
  const baseQuarters = G.quarters;
  G.quarters = city => baseQuarters(city) + RACES2.aerieQuarters * G.lvl(city, 'aerie');

  // ---- modifiers -------------------------------------------------------
  G.modSources.push((s, owner, city, key) => {
    if (key === 'vision' && city && G.lvl(city, 'aerie') && raceOf(s, owner) === 'wind') return 1 + RACES2.aerieVision * G.lvl(city, 'aerie');
    return 1;
  });
  // Veilborn glamours: each Dreamspire level hardens the garrison
  const baseDefense = G.cityDefense;
  G.cityDefense = (s, city, wallBreak) => {
    const d = baseDefense(s, city, wallBreak);
    const L = G.lvl(city, 'dreamspire');
    if (L && raceOf(s, city.owner) === 'veil') return { ...d, mult: d.mult * (1 + RACES2.glamourPerSpire * L) };
    return d;
  };

  // ---- ships: Tidekin sail faster, build cheaper and quicker ----------
  const isShip = u => DATA.units[u] && DATA.units[u].type === 'ship';
  const baseStats = G.unitStats;
  G.unitStats = (s, owner, u) => {
    const d = baseStats(s, owner, u);
    if (owner && isShip(u) && raceOf(s, owner) === 'tide') return { ...d, spd: d.spd * G.mod(s, owner, null, 'shipSpeed') };
    return d;
  };
  const baseTrainTime = G.trainTime;
  G.trainTime = (s, city, unit) => {
    const t = baseTrainTime(s, city, unit);
    return isShip(unit) && raceOf(s, city.owner) === 'tide' ? Math.max(2, Math.round(t * G.mod(s, city.owner, city, 'shipCost'))) : t;
  };
  // cheaper ships: the 'shipCost' key is read by G.unitCost (training, AI and the price shown)
  // cheaper Harbors (queueBuild pays the cost buildStatus quotes)
  const baseBuildStatus = G.buildStatus;
  G.buildStatus = (s, city, type) => {
    const st = baseBuildStatus(s, city, type);
    if (type !== 'harbor' || st.hidden || raceOf(s, city.owner) !== 'tide') return st;
    const k = G.mod(s, city.owner, city, 'shipCost');
    const cost = {};
    for (const [g, v] of Object.entries(st.cost)) cost[g] = Math.max(1, Math.round(v * k));
    const res = { ...st, cost };
    if (st.poor && G.canAfford(s, city, cost)) { res.ok = true; res.reason = ''; res.poor = false; }
    return res;
  };

  // ---- Windkin scouts fly ----------------------------------------------
  const basePlan = G.planMarch;
  G.planMarch = (s, owner, from, to, units) => {
    if (units && raceOf(s, owner) === 'wind') {
      const present = Object.entries(units).filter(([, n]) => n > 0).map(([u]) => u);
      if (present.includes('scout') && present.every(u => u === 'scout' || (DATA.units[u] && DATA.units[u].flying))) {
        const spd = G.slowest(s, owner, units);
        const len = G.dist(from, to);
        const dur = Math.max(15, Math.round(len / (spd * G.mod(s, owner, null, 'travel')) * 120 * G.pace(s).travel));
        return { ok: true, dur, path: [[from.x, from.y], [to.x, to.y]], naval: false, flying: true };
      }
    }
    return basePlan(s, owner, from, to, units);
  };

  // ---- happiness: pearls cheer the Tidekin, the Gravebound are gloomy ---
  if (G.happiness) {
    const baseHappy = G.happiness;
    G.happiness = (s, city) => {
      const h = baseHappy(s, city);
      const race = raceOf(s, city.owner);
      let delta = 0;
      const why = h.why.slice();
      if (race === 'tide' && (city.res.pearls || 0) > 1) { why.push({ label: 'Pearls', value: RACES2.pearlHappy }); delta += RACES2.pearlHappy; }
      if (race === 'grave') { why.push({ label: 'Gloom of the grave', value: -RACES2.graveGloom }); delta -= RACES2.graveGloom; }
      if (!delta) return h;
      const raw = (h.raw !== undefined ? h.raw : h.value) + delta;
      return { ...h, why, raw, value: G.clamp(Math.round(raw), 0, 100) };
    };
  }

  // ---- slow tick: pearls are worn, excess risen crumble ----------------
  G.slowHooks.push((s, dtMin) => {
    for (const city of Object.values(s.cities)) {
      const race = raceOf(s, city.owner);
      if (race === 'tide' && city.res.pearls > 0) city.res.pearls = Math.max(0, city.res.pearls - city.pop * RACES2.pearlEat * dtMin);
      const n = city.units.risen || 0;
      if (!n || race !== 'grave') continue;     // risen raised by spells for other peoples are left to magic.js
      const cap = RACES2.risenCap(city);
      if (n <= cap) { city.risenRot = 0; continue; }
      city.risenRot = (city.risenRot || 0) + Math.max(0.2, (n - cap) * RACES2.risenRot) * dtMin;
      const lost = Math.min(n - cap, Math.floor(city.risenRot));
      if (lost > 0) { city.units.risen = n - lost; city.risenRot -= lost; if (!city.units.risen) delete city.units.risen; }
    }
  });

  // ---- Gravebound raise the fallen after a victory ---------------------
  const LIVING = { inf: 1, ranged: 1, cav: 1 };
  const fallen = lost => Object.entries(lost || {}).reduce((a, [u, n]) => {
    const d = DATA.units[u];
    return a + (d && LIVING[d.type] && u !== 'risen' && u !== 'hero' ? n * (d.type === 'cav' || (d.req || 0) >= 10 ? 2 : 1) : 0);
  }, 0);
  G.raiseShare = (s, owner, home) => {
    const oss = home ? Math.min(RACES2.raiseOssuaryMax, RACES2.raisePerOssuary * G.lvl(home, 'ossuary')) : 0;
    return (RACES2.raiseShare + oss) * G.mod(s, owner, null, 'raise');
  };
  G.battleHooks.push((s, ctx) => {
    const { m, r } = ctx;
    let owner = null, into = null, home = null;
    if (r.win && raceOf(s, m.owner) === 'grave' && G.unitsCount(r.attLeft) > 0) { owner = m.owner; into = r.attLeft; home = s.cities[m.from]; }
    else if (!r.win && ctx.city && ctx.defOwner && raceOf(s, ctx.defOwner) === 'grave') { owner = ctx.defOwner; into = ctx.city.units; home = ctx.city; }
    if (!owner) return;
    const n = Math.floor((fallen(r.attLost) + fallen(r.defLost)) * G.raiseShare(s, owner, home));
    if (n <= 0) return;
    into.risen = (into.risen || 0) + n;
    ctx.risen = n;
    G.log(s, owner, `💀 ${n} of the fallen rose again to join the ${s.empires[owner].name}.`, 'good');
    if (owner !== 'p' && (m.owner === 'p' || ctx.defOwner === 'p')) G.log(s, 'p', `💀 The fallen rise to join the ${s.empires[owner].name}: ${n} risen dead.`, 'bad');
  });

  // ---- new game: coastal Tidekin capitals, feared Gravebound ------------
  G.newGameHooks.push((s) => {
    const caps = Object.keys(s.empires).map(id => G.capital(s, id)).filter(Boolean);
    const pcap = G.capital(s, 'p');
    for (const cap of caps) {
      if (raceOf(s, cap.owner) !== 'tide' || G.coastal(s, cap.x, cap.y)) continue;
      const opts = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = G.tileAt(s, cap.x + dx, cap.y + dy);
        if ((dx || dy) && t && !t.city && !t.camp && !t.oasis && !t.ruin && !(s.ley && s.ley.nodes && s.ley.nodes.some(n => n.x === t.x && n.y === t.y))) opts.push(t);
      }
      for (const t of opts.sort(() => Math.random() - 0.5)) {
        const was = t.terrain;
        t.terrain = 'lake'; G.clearPaths(s);
        if (caps.every(c => c === pcap || G.landReachable(s, pcap, c))) break;
        t.terrain = was; G.clearPaths(s);
      }
      for (const c of Object.values(s.cities)) if (G.dist(c, cap) <= 3.5) delete c.site;
    }
    if (G.rel) {
      const pGrave = raceOf(s, 'p') === 'grave';
      for (const e of Object.values(s.empires)) {
        if (e.id === 'p' || !(pGrave || e.race === 'grave')) continue;
        const rel = G.rel(s, e.id);
        rel.opinion = G.clamp(rel.opinion - RACES2.fearOpinion, -100, 100);
      }
    }
  });

  // ---- AI: raise the unique building early (troops depend on its good) ---
  const AI_UNIQUE = { tide: 'pearlbeds', veil: 'dreamspire', grave: 'ossuary', wind: 'aerie' };
  G.aiHooks.push((s, emp) => {
    const b = AI_UNIQUE[emp.race];
    if (!b || Math.random() > 0.25) return;
    for (const city of G.citiesOf(s, emp.id)) {
      const L = G.lvl(city, b);
      if (L >= Math.min(8, G.lvl(city, 'townhall') + 1) || city.buildQueue.some(q => q.type === b) || city.buildQueue.length >= G.buildSlots(city)) continue;
      if (emp.race === 'grave' || (city.res[DATA.buildings[b].recipe ? Object.keys(DATA.buildings[b].recipe.out)[0] : 'pearls'] || 0) < 40) {
        if (G.buildStatus(s, city, b).ok) G.queueBuild(s, city.id, b);
      }
    }
  });
};
if (typeof window !== 'undefined') window.initRaces2 = initRaces2;
