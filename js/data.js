// =====================================================================
//  Ember & Crown — static game data (tables only, no logic)
// =====================================================================
'use strict';

const DATA = {};

// ---------------------------------------------------------------------
// Goods. "value" is the market value in gold.
// ---------------------------------------------------------------------
DATA.goods = {
  grain:     { name: 'Grain',     icon: '🌾', value: 0.3, raw: true },
  timber:    { name: 'Timber',    icon: '🪵', value: 0.4, raw: true },
  stone:     { name: 'Stone',     icon: '🪨', value: 0.4, raw: true },
  ore:       { name: 'Ore',       icon: '⛏️', value: 0.5, raw: true },
  iron:      { name: 'Iron',      icon: '🔩', value: 2.0 },
  tools:     { name: 'Tools',     icon: '🛠️', value: 5.0 },
  weapons:   { name: 'Weapons',   icon: '⚔️', value: 6.0 },
  mana:      { name: 'Mana',      icon: '✨', value: 3.0 },
  bread:     { name: 'Bread',     icon: '🍞', value: 1.2, race: 'hearth' },
  runesteel: { name: 'Runesteel', icon: '💠', value: 9.0, race: 'delver' },
  heartwood: { name: 'Heartwood', icon: '🌳', value: 6.0, race: 'sylvan' },
};
DATA.goodOrder = ['grain', 'timber', 'stone', 'ore', 'iron', 'tools', 'weapons', 'mana', 'bread', 'runesteel', 'heartwood'];

// ---------------------------------------------------------------------
// Terrain of world tiles. A city founded on a tile gets its bonus.
// ---------------------------------------------------------------------
DATA.terrain = {
  plains:   { name: 'Plains',        bonus: null,     mult: 0,    color: '#c9c27a' },
  fertile:  { name: 'Fertile vale',  bonus: 'grain',  mult: 0.25, color: '#9fbf62' },
  forest:   { name: 'Old forest',    bonus: 'timber', mult: 0.25, color: '#5f8f4a' },
  hills:    { name: 'Stony hills',   bonus: 'stone',  mult: 0.25, color: '#b5a48a' },
  mountain: { name: 'Mountain foot', bonus: 'ore',    mult: 0.25, color: '#8a8a8f' },
  lake:     { name: 'Lake',          bonus: null,     mult: 0,    color: '#6a9ac4', impassable: true },   // also used for inland seas
};

// ---------------------------------------------------------------------
// Races.
//   mult:     production multipliers per good
//   bonus:    misc multipliers (tax, popGrowth, housing, trainTime, carry, wall, refine)
//   recipes:  override of a building's recipe for this race
// ---------------------------------------------------------------------
DATA.races = {
  hearth: {
    name: 'Hearthfolk', adj: 'Hearthfolk', color: '#c0392b',
    blurb: 'Patient farmers and shrewd traders of the river valleys. Their mills turn grain into bread that feeds three mouths where grain feeds one, and their markets drive the hardest bargains.',
    perks: ['+25% grain', '+20% taxes', 'Better market rates, caravans carry 50% more', 'Bakery: grain → bread (feeds 3×, +50% growth)', 'Knights and Royal Guards need bread'],
    mult: { grain: 1.25 },
    bonus: { tax: 1.2, market: 0.1, caravan: 1.5 },
    unique: 'bakery',
    units: ['militia', 'pikeman', 'crossbow', 'outrider', 'knight', 'royalguard', 'ram_h', 'treb_h'],
    recipes: {},
  },
  delver: {
    name: 'Deepdelvers', adj: 'Deepdelver', color: '#7f5539',
    blurb: 'Stubborn miners from beneath the mountains. Nobody digs deeper or forges better; their runesteel arms the toughest shield-walls in the land, but their fields are poor.',
    perks: ['+40% ore, +25% stone', '+30% refining output', 'Walls 50% stronger, +15% storage, deep cellars hide 20% more', 'Master masons: build 8% faster', 'Runeforge: iron + stone → runesteel', '−15% grain'],
    mult: { ore: 1.4, stone: 1.25, grain: 0.85 },
    bonus: { refine: 1.3, wall: 1.5, protect: 0.2, storage: 1.15, buildTime: 0.92 },
    unique: 'runeforge',
    units: ['axeguard', 'ironshield', 'boltcaster', 'goatrider', 'boarrider', 'runeguard', 'ram_d', 'treb_d'],
    recipes: {},
  },
  sylvan: {
    name: 'Sylvani', adj: 'Sylvan', color: '#2e7d32',
    blurb: 'Long-lived wardens of the deep woods. They grow quickly and shape weapons from living wood rather than iron, and their riders are the swiftest anywhere — but ore is scarce to them.',
    perks: ['+30% timber', '+20% pop growth, +3% housing', 'See 30% farther, march 10% faster', 'Armory works timber, not iron', 'Heartgrove: timber → heartwood', '−25% ore'],
    mult: { timber: 1.3, ore: 0.75 },
    bonus: { popGrowth: 1.2, housing: 1.03, vision: 1.3, travel: 1.1 },
    unique: 'heartgrove',
    units: ['warden', 'thornguard', 'longbow', 'winddancer', 'stagrider', 'groveguard', 'ram_s', 'treb_s'],
    recipes: {
      armory: { in: { timber: 3 }, out: { weapons: 1 }, rate: 1.5 },
    },
  },
  ash: {
    name: 'Ashborn', adj: 'Ashborn', color: '#6d4c8d',
    blurb: 'Hardy clans from the scorched steppe who would rather take than make. They train fast, carry off more plunder, and hammer crude weapons straight from ore and stone.',
    perks: ['+40% plunder carried', '−15% training time, troops eat 15% less', 'Armory: ore + stone → weapons (skips iron)', 'War Pit: faster training, +attack', '−15% stone'],
    mult: { stone: 0.85 },
    bonus: { carry: 1.4, trainTime: 0.85, upkeep: 0.85 },
    unique: 'warpit',
    units: ['raider', 'slinger', 'brute', 'shaman', 'wolfrider', 'warlordblade', 'ram_a', 'treb_a'],
    recipes: {
      armory: { in: { ore: 2, stone: 1 }, out: { weapons: 1 }, rate: 1.5 },
    },
  },
};
DATA.raceOrder = ['hearth', 'delver', 'sylvan', 'ash'];

// ---------------------------------------------------------------------
// Buildings.
//   cost:     base cost to reach level 1; scales by `growth`^(L-1)
//   time:     base build seconds for level 1; scales 1.38^(L-1)
//   prod:     { good: perMinute } at level 1 (raw producers)
//   recipe:   { in, out, rate } per minute at level 1 (refiners)
//   workers:  workers needed per level
//   req:      { building: level } prerequisites
// ---------------------------------------------------------------------
DATA.buildings = {
  townhall: {
    name: 'Town Hall', icon: '🏛️', max: 20, time: 20, growth: 1.42,
    cost: { timber: 80, stone: 80, grain: 80, gold: 30 },
    desc: 'Seat of the settlement. Speeds up construction, houses a few citizens, and unlocks new buildings and city tiers.',
  },
  houses: {
    name: 'Houses', icon: '🏘️', max: 20, time: 10, growth: 1.36,
    cost: { timber: 40, stone: 25, grain: 35 },
    desc: 'Homes for your people. Raises the population cap.',
  },
  warehouse: {
    name: 'Warehouse', icon: '📦', max: 20, time: 12, growth: 1.36,
    cost: { timber: 50, stone: 40, grain: 30 },
    desc: 'Raises storage for every good. A portion of stock is hidden from raiders.',
  },
  farm: {
    name: 'Farm', icon: '🌾', max: 20, time: 8, growth: 1.36, workers: 2,
    cost: { timber: 30, stone: 10, grain: 20 }, prod: { grain: 10 },
    desc: 'Grows grain to feed citizens and troops.',
  },
  lumber: {
    name: 'Lumber Camp', icon: '🪓', max: 20, time: 8, growth: 1.36, workers: 2,
    cost: { timber: 20, stone: 25, grain: 30 }, prod: { timber: 13 },
    desc: 'Fells timber.',
  },
  quarry: {
    name: 'Quarry', icon: '🪨', max: 20, time: 8, growth: 1.36, workers: 2,
    cost: { timber: 30, stone: 10, grain: 30 }, prod: { stone: 12 },
    desc: 'Cuts stone.',
  },
  mine: {
    name: 'Mine', icon: '⛏️', max: 20, time: 10, growth: 1.36, workers: 3,
    cost: { timber: 40, stone: 30, grain: 35 }, prod: { ore: 6 },
    desc: 'Digs ore, the start of the smithing chain.', req: { townhall: 1 },
  },
  smelter: {
    name: 'Smelter', icon: '🔥', max: 20, time: 18, growth: 1.38, workers: 3,
    cost: { timber: 80, stone: 110, grain: 30 },
    recipe: { in: { ore: 2, timber: 0.5 }, out: { iron: 1 }, rate: 4 },
    desc: 'Smelts ore into iron.', req: { townhall: 2, mine: 2 },
  },
  smithy: {
    name: 'Toolsmith', icon: '🛠️', max: 20, time: 22, growth: 1.38, workers: 3,
    cost: { timber: 120, stone: 90, iron: 20 },
    recipe: { in: { iron: 1, timber: 1 }, out: { tools: 1 }, rate: 1 },
    desc: 'Forges tools. Tools are needed for higher building levels and settlers.', req: { townhall: 3, smelter: 1 },
  },
  armory: {
    name: 'Armory', icon: '⚔️', max: 20, time: 22, growth: 1.38, workers: 3,
    cost: { timber: 110, stone: 120, iron: 20 },
    recipe: { in: { iron: 2, timber: 1 }, out: { weapons: 1 }, rate: 1.5 },
    desc: 'Forges weapons. Every soldier needs them.', req: { townhall: 3, barracks: 1 },
  },
  barracks: {
    name: 'Barracks', icon: '🛡️', max: 20, time: 20, growth: 1.38,
    cost: { timber: 120, stone: 100, grain: 60 },
    desc: 'Trains infantry. Higher levels unlock better troops and train faster.', req: { townhall: 2 },
  },
  stable: {
    name: 'Stable', icon: '🐎', max: 20, time: 30, growth: 1.38,
    cost: { timber: 220, stone: 160, grain: 120, iron: 40 },
    desc: 'Raises mounts and trains cavalry.', req: { townhall: 5, barracks: 3 },
  },
  wall: {
    name: 'Wall', icon: '🧱', max: 20, time: 20, growth: 1.38,
    cost: { stone: 150, timber: 60 },
    desc: 'Every level adds defense to your garrison.', req: { townhall: 3 },
  },
  market: {
    name: 'Market', icon: '⚖️', max: 20, time: 20, growth: 1.38,
    cost: { timber: 110, stone: 80, grain: 40 },
    desc: 'Trade goods for gold, and send caravans between your cities. Higher levels give better rates and bigger caravans.', req: { townhall: 3 },
  },
  workshop: {
    name: 'Siege Workshop', icon: '🪵', max: 20, time: 40, growth: 1.4,
    cost: { timber: 400, stone: 250, iron: 80, grain: 150 },
    desc: 'Carpenters and engineers build rams to break walls and catapults to wreck buildings.', req: { townhall: 8, barracks: 5, smithy: 5 },
  },
  harbor: {
    name: 'Harbor', icon: '⚓', max: 20, time: 30, growth: 1.38, workers: 2, coastal: true,
    cost: { timber: 300, stone: 150, grain: 100 },
    desc: 'Docks on the water. Fishing boats bring grain (more with more open water nearby), and shipwrights build transports and war galleys.', req: { townhall: 4 },
  },
  academy: {
    name: 'Academy', icon: '📚', max: 20, time: 30, growth: 1.38,
    cost: { timber: 160, stone: 140, grain: 80, gold: 60 },
    desc: 'Scholars research new techniques for your whole realm. Higher levels unlock advanced research and study faster.', req: { townhall: 3 },
  },
  // ---- race uniques ----
  bakery: {
    name: 'Mill & Bakery', icon: '🍞', max: 20, time: 16, growth: 1.36, workers: 2, race: 'hearth',
    cost: { timber: 90, stone: 70 },
    recipe: { in: { grain: 3 }, out: { bread: 1 }, rate: 2 },
    desc: 'Grinds grain and bakes bread. Citizens eat bread first: 1 bread feeds as much as 3 grain, and growth is 50% faster while bread is stocked.',
    req: { townhall: 2, farm: 3 },
  },
  runeforge: {
    name: 'Runeforge', icon: '💠', max: 20, time: 28, growth: 1.38, workers: 4, race: 'delver',
    cost: { timber: 120, stone: 200, iron: 40 },
    recipe: { in: { iron: 1, stone: 2 }, out: { runesteel: 1 }, rate: 0.6 },
    desc: 'Etches runes into iron bonded with stone, making runesteel for elite troops. Each level also adds +2% garrison defense.',
    req: { townhall: 4, smelter: 3 },
  },
  heartgrove: {
    name: 'Heartgrove', icon: '🌳', max: 20, time: 24, growth: 1.38, workers: 2, race: 'sylvan',
    cost: { timber: 160, stone: 60, grain: 60 },
    recipe: { in: { timber: 4 }, out: { heartwood: 1 }, rate: 0.8 },
    desc: 'Sung trees yield heartwood for bows and spears. Each level also adds +4% population cap.',
    req: { townhall: 3, lumber: 4 },
  },
  warpit: {
    name: 'War Pit', icon: '🔥', max: 20, time: 24, growth: 1.38, race: 'ash',
    cost: { timber: 120, stone: 90, grain: 120 },
    desc: 'Brutal training grounds. Each level cuts training time by 3% and adds +1% attack.',
    req: { townhall: 3, barracks: 3 },
  },
};
DATA.buildingOrder = ['townhall', 'houses', 'warehouse', 'academy', 'workshop', 'harbor', 'farm', 'lumber', 'quarry', 'mine', 'smelter', 'smithy', 'armory',
  'bakery', 'runeforge', 'heartgrove', 'warpit', 'barracks', 'stable', 'wall', 'market'];
DATA.buildingGroups = [
  { name: 'Settlement', list: ['townhall', 'houses', 'warehouse', 'market', 'harbor', 'academy'] },
  { name: 'Raw goods', list: ['farm', 'lumber', 'quarry', 'mine'] },
  { name: 'Workshops', list: ['smelter', 'smithy', 'armory', 'bakery', 'runeforge', 'heartgrove'] },
  { name: 'Military', list: ['barracks', 'stable', 'workshop', 'warpit', 'wall'] },
];

// City tiers by Town Hall level
DATA.tiers = [
  { th: 1, name: 'Hamlet' },
  { th: 3, name: 'Village' },
  { th: 6, name: 'Town' },
  { th: 10, name: 'City' },
  { th: 15, name: 'Great City' },
  { th: 20, name: 'Capital of Ages' },
];

// Renown thresholds for the Nth city (index = number of cities already owned)
DATA.citySlots = [0, 60, 160, 320, 550, 850, 1250, 1800, 2500];

// ---------------------------------------------------------------------
// Units.
//   type: inf | ranged | cav | civ
//   atk, defI (vs infantry), defC (vs cavalry), spd (tiles/2 min), carry, upkeep (grain/min)
//   at:   training building, req: building level needed there
// ---------------------------------------------------------------------
DATA.units = {
  // Hearthfolk
  militia:   { name: 'Militia',      icon: '🗡️', type: 'inf',    role: 'infantry', atk: 15,  defI: 30, defC: 25, spd: 6,  carry: 40,  upkeep: 0.5, time: 20, at: 'barracks', req: 1, cost: { grain: 40, gold: 15, weapons: 1 }, desc: 'Farmhands with spears. Cheap, decent at holding the walls.' },
  pikeman:   { name: 'Pikeman',      icon: '🔱', type: 'inf',    role: 'infantry', atk: 12,  defI: 50, defC: 70, spd: 5,  carry: 25,  upkeep: 0.6, time: 28, at: 'barracks', req: 3, cost: { grain: 50, gold: 25, weapons: 2 }, desc: 'A hedge of pikes. The bane of cavalry.' },
  crossbow:  { name: 'Crossbowman',  icon: '🏹', type: 'ranged', role: 'ranged', atk: 50,  defI: 30, defC: 25, spd: 5,  carry: 30,  upkeep: 0.7, time: 35, at: 'barracks', req: 5, cost: { grain: 60, gold: 40, weapons: 3 }, desc: 'Punches through armor at range.' },
  knight:    { name: 'Knight',       icon: '🐴', type: 'cav',    role: 'cavalry', atk: 95,  defI: 45, defC: 30, spd: 13, carry: 80,  upkeep: 1.5, time: 60, at: 'stable',   req: 1, cost: { grain: 120, gold: 110, weapons: 6, bread: 15 }, desc: 'Heavy horse, fed on the finest bread.' },
  // Deepdelvers
  axeguard:  { name: 'Axeguard',     icon: '🪓', type: 'inf',    role: 'infantry', atk: 35,  defI: 35, defC: 25, spd: 5,  carry: 45,  upkeep: 0.6, time: 26, at: 'barracks', req: 1, cost: { grain: 50, gold: 25, weapons: 2 }, desc: 'Solid all-rounders with heavy axes.' },
  ironshield:{ name: 'Ironshield',   icon: '🛡️', type: 'inf',    role: 'infantry', atk: 15,  defI: 75, defC: 55, spd: 4,  carry: 30,  upkeep: 0.8, time: 38, at: 'barracks', req: 3, cost: { grain: 60, gold: 40, weapons: 2, runesteel: 2 }, desc: 'An unbreakable runesteel wall.' },
  boltcaster:{ name: 'Boltcaster',   icon: '🎯', type: 'ranged', role: 'ranged', atk: 60,  defI: 30, defC: 30, spd: 4,  carry: 25,  upkeep: 0.8, time: 45, at: 'barracks', req: 5, cost: { grain: 70, gold: 50, weapons: 4 }, desc: 'Clockwork crossbows that hit like hammers.' },
  boarrider: { name: 'Boar Rider',   icon: '🐗', type: 'cav',    role: 'cavalry', atk: 85,  defI: 55, defC: 45, spd: 10, carry: 70,  upkeep: 1.6, time: 65, at: 'stable',   req: 1, cost: { grain: 130, gold: 110, weapons: 5, runesteel: 4 }, desc: 'Armored riders on great tusked boars.' },
  // Sylvani
  warden:    { name: 'Warden',       icon: '🌿', type: 'inf',    role: 'infantry', atk: 20,  defI: 40, defC: 40, spd: 7,  carry: 40,  upkeep: 0.5, time: 22, at: 'barracks', req: 1, cost: { grain: 40, gold: 20, weapons: 1 }, desc: 'Woodland guards, quick on their feet.' },
  thornguard:{ name: 'Thornguard',   icon: '🌵', type: 'inf',    role: 'infantry', atk: 10,  defI: 60, defC: 55, spd: 6,  carry: 25,  upkeep: 0.6, time: 30, at: 'barracks', req: 3, cost: { grain: 50, gold: 30, weapons: 2, heartwood: 1 }, desc: 'Heartwood spears and thorn-woven shields.' },
  longbow:   { name: 'Longbow',      icon: '🏹', type: 'ranged', role: 'ranged', atk: 65,  defI: 20, defC: 25, spd: 6,  carry: 30,  upkeep: 0.7, time: 38, at: 'barracks', req: 5, cost: { grain: 60, gold: 45, weapons: 2, heartwood: 2 }, desc: 'The deadliest archers alive.' },
  stagrider: { name: 'Stag Rider',   icon: '🦌', type: 'cav',    role: 'cavalry', atk: 75,  defI: 35, defC: 50, spd: 16, carry: 75,  upkeep: 1.4, time: 60, at: 'stable',   req: 1, cost: { grain: 110, gold: 100, weapons: 4, heartwood: 3 }, desc: 'Swift as wind through the trees.' },
  // Ashborn
  raider:    { name: 'Raider',       icon: '🔪', type: 'inf',    role: 'infantry', atk: 35,  defI: 15, defC: 10, spd: 8,  carry: 60,  upkeep: 0.5, time: 16, at: 'barracks', req: 1, cost: { grain: 35, gold: 12, weapons: 1 }, desc: 'Fast, cheap and greedy.' },
  slinger:   { name: 'Slinger',      icon: '🪃', type: 'ranged', role: 'ranged', atk: 40,  defI: 30, defC: 20, spd: 7,  carry: 35,  upkeep: 0.6, time: 26, at: 'barracks', req: 3, cost: { grain: 45, gold: 25, weapons: 2 }, desc: 'Stones from afar; useful on the walls too.' },
  brute:     { name: 'Brute',        icon: '🪨', type: 'inf',    role: 'infantry', atk: 60,  defI: 25, defC: 20, spd: 6,  carry: 50,  upkeep: 0.8, time: 30, at: 'barracks', req: 5, cost: { grain: 60, gold: 30, weapons: 3 }, desc: 'Huge, angry, hard to stop.' },
  wolfrider: { name: 'Wolf Rider',   icon: '🐺', type: 'cav',    role: 'cavalry', atk: 105, defI: 25, defC: 20, spd: 17, carry: 110, upkeep: 1.6, time: 55, at: 'stable',   req: 1, cost: { grain: 120, gold: 100, weapons: 6 }, desc: 'The terror of the steppe.' },
  // ---- light cavalry, elites and siege (wallBreak: wall levels negated per ram; wreck: building damage per engine) ----
  outrider:  { name: 'Outrider',      icon: '🏇', type: 'cav',    role: 'cavalry', atk: 45,  defI: 20, defC: 30, spd: 16, carry: 100, upkeep: 1.0, time: 40, at: 'stable',   req: 3, cost: { grain: 80, gold: 60, weapons: 3 }, desc: 'Fast riders for raiding and running down stragglers.' },
  royalguard:{ name: 'Royal Guard',   icon: '👑', type: 'inf',    role: 'infantry', atk: 70,  defI: 85, defC: 75, spd: 5,  carry: 40,  upkeep: 1.4, time: 70, at: 'barracks', req: 10, cost: { grain: 150, gold: 130, weapons: 6, tools: 4, bread: 10 }, desc: 'The crown\'s finest, drilled from childhood. Strong in every role.' },
  ram_h:     { name: 'Battering Ram', icon: '🪵', type: 'siege',  role: 'siege', atk: 40,  defI: 25, defC: 15, spd: 3,  carry: 0,   upkeep: 1.2, time: 90, at: 'workshop', req: 1, cost: { timber: 300, iron: 40, grain: 100, gold: 80 }, wallBreak: 0.25, desc: 'A roofed ram. Each one weakens the enemy wall during the assault.' },
  treb_h:    { name: 'Trebuchet',     icon: '🎯', type: 'siege',  role: 'siege', atk: 70,  defI: 15, defC: 10, spd: 2,  carry: 0,   upkeep: 1.5, time: 120, at: 'workshop', req: 5, cost: { timber: 400, stone: 200, iron: 80, gold: 120 }, wreck: 1, desc: 'Hurls stones over walls. Survivors of a won battle wreck enemy buildings.' },

  goatrider: { name: 'Crag Rider',    icon: '🐐', type: 'cav',    role: 'cavalry', atk: 50,  defI: 40, defC: 30, spd: 12, carry: 70,  upkeep: 1.1, time: 45, at: 'stable',   req: 3, cost: { grain: 90, gold: 60, weapons: 3 }, desc: 'Sure-footed riders on giant mountain goats.' },
  runeguard: { name: 'Runeguard',     icon: '💠', type: 'inf',    role: 'infantry', atk: 80,  defI: 115, defC: 95, spd: 4, carry: 40,  upkeep: 1.6, time: 80, at: 'barracks', req: 10, cost: { grain: 150, gold: 140, weapons: 5, runesteel: 5 }, desc: 'Champions in rune-etched plate. Nearly immovable.' },
  ram_d:     { name: 'Bore Engine',   icon: '⚙️', type: 'siege',  role: 'siege', atk: 45,  defI: 35, defC: 25, spd: 3,  carry: 0,   upkeep: 1.2, time: 90, at: 'workshop', req: 1, cost: { timber: 200, iron: 80, stone: 100, gold: 80 }, wallBreak: 0.35, desc: 'A steam-driven drill that chews through walls faster than any ram.' },
  treb_d:    { name: 'Thunder Mortar',icon: '💥', type: 'siege',  role: 'siege', atk: 90,  defI: 20, defC: 15, spd: 2,  carry: 0,   upkeep: 1.6, time: 130, at: 'workshop', req: 5, cost: { iron: 160, stone: 200, tools: 10, gold: 140 }, wreck: 1.2, desc: 'Blackpowder and runes. Shatters towers.' },

  winddancer:{ name: 'Wind Dancer',   icon: '🍃', type: 'cav',    role: 'cavalry', atk: 55,  defI: 25, defC: 35, spd: 18, carry: 80,  upkeep: 1.0, time: 40, at: 'stable',   req: 3, cost: { grain: 80, gold: 60, weapons: 2, heartwood: 1 }, desc: 'Riders who seem to vanish between the trees.' },
  groveguard:{ name: 'Grove Keeper',  icon: '🌲', type: 'inf',    role: 'infantry', atk: 90,  defI: 100, defC: 105, spd: 3, carry: 0,  upkeep: 1.5, time: 90, at: 'barracks', req: 10, cost: { grain: 120, gold: 120, heartwood: 8 }, desc: 'An awakened tree-giant that marches to war.' },
  ram_s:     { name: 'Rootbreaker',   icon: '🌳', type: 'siege',  role: 'siege', atk: 45,  defI: 30, defC: 20, spd: 3,  carry: 0,   upkeep: 1.0, time: 90, at: 'workshop', req: 1, cost: { timber: 350, heartwood: 6, grain: 100, gold: 60 }, wallBreak: 0.25, desc: 'Living roots that pry stones apart.' },
  treb_s:    { name: 'Thornhurler',   icon: '🌵', type: 'siege',  role: 'siege', atk: 65,  defI: 20, defC: 15, spd: 3,  carry: 0,   upkeep: 1.2, time: 110, at: 'workshop', req: 5, cost: { timber: 450, heartwood: 8, gold: 100 }, wreck: 0.9, desc: 'A great bent tree that flings thorned boulders.' },

  shaman:    { name: 'Ash Shaman',    icon: '🔮', type: 'ranged', role: 'ranged', atk: 55,  defI: 35, defC: 30, spd: 6,  carry: 20,  upkeep: 0.9, time: 45, at: 'barracks', req: 7, cost: { grain: 80, gold: 70, weapons: 2 }, desc: 'Calls down ash and fire from behind the lines.' },
  warlordblade:{ name: 'Warlord\'s Blade', icon: '🗡️', type: 'inf', role: 'infantry', atk: 125, defI: 40, defC: 35, spd: 6, carry: 70, upkeep: 1.5, time: 70, at: 'barracks', req: 10, cost: { grain: 140, gold: 120, weapons: 8 }, desc: 'The warlord\'s sworn killers. All offence.' },
  ram_a:     { name: 'Skull Ram',     icon: '💀', type: 'siege',  role: 'siege', atk: 50,  defI: 20, defC: 10, spd: 4,  carry: 0,   upkeep: 1.0, time: 70, at: 'workshop', req: 1, cost: { timber: 250, ore: 120, grain: 80, gold: 50 }, wallBreak: 0.3, desc: 'Crude, cheap and terrifying.' },
  treb_a:    { name: 'Rock Flinger',  icon: '🪨', type: 'siege',  role: 'siege', atk: 75,  defI: 15, defC: 10, spd: 3,  carry: 0,   upkeep: 1.2, time: 100, at: 'workshop', req: 5, cost: { timber: 350, stone: 250, ore: 80, gold: 80 }, wreck: 1, desc: 'Ogres heave boulders from a giant sling.' },
  // Common
  settlers:  { name: 'Settlers',     icon: '🧺', type: 'civ',    role: 'support', atk: 0,   defI: 10, defC: 10, spd: 5,  carry: 0,   upkeep: 1,   time: 120, at: 'townhall', req: 5, cost: { grain: 600, timber: 600, stone: 500, gold: 400, tools: 20 }, desc: 'Families ready to found a new city on an empty tile.' },
  herald:    { name: 'Herald',       icon: '📯', type: 'civ',    role: 'support', atk: 30,  defI: 20, defC: 20, spd: 5,  carry: 0,   upkeep: 2,   time: 180, at: 'townhall', req: 8, cost: { grain: 800, gold: 1500, weapons: 30, tools: 30 }, desc: 'Sent with a conquering army. Each victory with a surviving herald lowers a city\'s loyalty; at zero it swears to you.' },
  scout:     { name: 'Scout',        icon: '🦅', type: 'civ',    role: 'support', atk: 0,   defI: 2,  defC: 2,  spd: 16, carry: 0,   upkeep: 0.3, time: 15, at: 'barracks', req: 1, cost: { grain: 30, gold: 25 }, desc: 'Sneaks close to report troops, stores and walls. Enemy scouts can catch them.' },
  hero:      { name: 'Hero',         icon: '🦸', type: 'hero',   role: 'support', atk: 0,   defI: 0,  defC: 0,  spd: 7,  carry: 0,   upkeep: 0,   time: 0, at: null, req: 0, cost: {}, desc: 'Your champion.' },
  // Ships (shared by all peoples; built at a Harbor in a coastal city). capacity: citizens a transport can carry
  transport: { name: 'Transport Cog',  icon: '⛵', type: 'ship', role: 'ship', atk: 5,  defI: 40, defC: 40, spd: 10, carry: 400, upkeep: 1.0, time: 90, at: 'harbor', req: 1, pop: 4, capacity: 30, cost: { timber: 400, gold: 100, tools: 10 }, desc: 'Carries up to 30 citizens\' worth of troops or settlers across water, and hauls plunder home.' },
  warship:   { name: 'War Galley',     icon: '🚢', type: 'ship', role: 'ship', atk: 80, defI: 70, defC: 70, spd: 11, carry: 100, upkeep: 2.0, time: 150, at: 'harbor', req: 5, pop: 6, cost: { timber: 600, iron: 120, tools: 20, gold: 200 }, desc: 'Rams and archers afloat. Raids and defends coastal cities and escorts transports.' },
  // Neutral
  beast:     { name: 'Wild beast',   icon: '🐻', type: 'inf',    role: 'infantry', atk: 25,  defI: 30, defC: 22, spd: 6,  carry: 0,   upkeep: 0,   time: 0, at: null, req: 0, cost: {}, desc: 'Wolves, bears and worse guard the wild places.' },
  brigand:   { name: 'Brigand',      icon: '☠️', type: 'inf',    role: 'infantry', atk: 20,  defI: 25, defC: 25, spd: 6,  carry: 40,  upkeep: 0,   time: 0, at: null, req: 0, cost: {}, desc: 'Outlaws holed up in the wilds.' },
};
DATA.commonUnits = ['scout', 'settlers', 'herald', 'transport', 'warship'];

DATA.aiNames = {
  hearth: ['Elmsworth', 'Barleyford', 'Millbrook', 'Ashdown', 'Copperhill', 'Wheatmere'],
  delver: ['Karak Dun', 'Grimhollow', 'Ironvein', 'Stonebeard Hold', 'Deepmoot', 'Anvilrock'],
  sylvan: ['Lothmere', 'Silverleaf', 'Eldenshade', 'Mosswhisper', 'Thornvale', 'Starglade'],
  ash:    ['Cinderjaw', 'Blackfang', 'Ruinmaw', 'Skullrock', 'Emberclaw', 'Dustmarch'],
};
DATA.aiRulers = {
  hearth: 'Duchy of the Vale', delver: 'Hold of the Deep King', sylvan: 'Circle of the Glade', ash: 'Horde of the Red Sky',
};
DATA.empireColors = ['#e2b007', '#c0392b', '#2980b9', '#8e44ad', '#16a085', '#d35400', '#1abc9c', '#7f8c8d', '#c2185b'];

// ---------------------------------------------------------------------
// Pace presets (chosen at new game). prod: production multiplier,
// time: build/train/research time multiplier, travel: march time multiplier.
// ---------------------------------------------------------------------
DATA.pace = {
  quick:    { name: 'Quick',    desc: 'An evening or two. Everything grows twice as fast.', prod: 2.0, time: 0.5, travel: 0.6, grace: 15 * 60, ramp: 1.5 * 3600 },
  standard: { name: 'Standard', desc: 'A few evenings to a week of casual play.',             prod: 1.0, time: 1.0, travel: 1.0, grace: 30 * 60, ramp: 4 * 3600 },
  long:     { name: 'Long',     desc: 'Weeks of check-ins, classic browser-game pacing.',      prod: 0.6, time: 1.7, travel: 1.3, grace: 60 * 60, ramp: 10 * 3600 },
};
DATA.modes = {
  conquest: { name: 'Conquest', desc: 'Topple every rival realm to win.' },
  endless:  { name: 'Endless',  desc: 'No victory. Fallen realms rise again, brigand warlords keep coming, and you build as long as you like.' },
};

// ---------------------------------------------------------------------
// Location: what each terrain contributes to a settlement within 2 tiles.
// A site's yield of a good is a base + 1.4 × (weighted share), so a city in a
// forest is rich in timber but may be poor in ore. Rivers and lakes add prosperity.
// ---------------------------------------------------------------------
DATA.terrainYield = {
  plains:   { grain: 0.62, timber: 0.12, stone: 0.2, ore: 0.08 },    // open steppe and heath: some grain, little else
  fertile:  { grain: 1.0, timber: 0.18, stone: 0.05, ore: 0.03 },
  forest:   { grain: 0.15, timber: 1.0, stone: 0.1, ore: 0.05 },
  hills:    { grain: 0.2, timber: 0.1, stone: 1.0, ore: 0.5 },       // hill country: stone and iron together
  mountain: { grain: 0.03, timber: 0.05, stone: 0.55, ore: 1.0 },
  lake:     { grain: 0.4, timber: 0, stone: 0, ore: 0 },
};
// Homelands painted around each race's capital, and the goods each race looks for when settling
DATA.homeland = {
  hearth: { terrain: { fertile: 0.55, plains: 0.3, forest: 0.15 }, seeks: { grain: 1, timber: 0.3 } },
  delver: { terrain: { mountain: 0.45, hills: 0.4, forest: 0.15 }, seeks: { ore: 1, stone: 0.6, grain: 0.6 } },
  sylvan: { terrain: { forest: 0.7, fertile: 0.2, hills: 0.1 }, seeks: { timber: 1, grain: 0.3 } },
  ash:    { terrain: { plains: 0.45, hills: 0.4, mountain: 0.15 }, seeks: { ore: 0.8, stone: 0.8 } },
};

// ---------------------------------------------------------------------
// Battlefields. Units fight on the defender's tile.
//   def:   extra defence for whoever holds the ground (rough terrain)
//   roles: per unit role, a bonus/penalty to attack (attackers) or defence (defenders)
// Flyers ignore terrain. Every role's combined terrain/river/weather effect is
// clamped to ±25% (DATA.battleRules.cap).
// Roles: infantry, cavalry, ranged, siege, flyer, ship, mage, support
// (explicit `role` on each unit; G.roleOf infers it for units added elsewhere).
// ---------------------------------------------------------------------
DATA.battleTerrain = {
  plains:   { def: 0,    roles: { cavalry: 0.10, siege: 0.05 },                                   text: 'Open ground: cavalry charge freely.' },
  fertile:  { def: 0,    roles: { cavalry: 0.05 },                                                text: 'Farmland: good riding country.' },
  forest:   { def: 0.08, roles: { cavalry: -0.20, ranged: -0.10, siege: -0.15, infantry: 0.05 },  text: 'Trees break charges and block arrows.' },
  hills:    { def: 0.08, roles: { ranged: 0.15, cavalry: -0.10, siege: -0.10 },                   text: 'High ground for archers; slopes slow riders.' },
  mountain: { def: 0.12, roles: { cavalry: -0.20, siege: -0.20, ranged: 0.10, infantry: 0.05 },   text: 'Narrow passes: foot soldiers hold, horses and engines struggle.' },
  lake:     { def: 0,    roles: { ship: 0.10 },                                                   text: 'Open water.' },
};
DATA.roleInfo = {
  infantry: { name: 'Infantry', icon: '🛡️' }, cavalry: { name: 'Cavalry', icon: '🐎' }, ranged: { name: 'Ranged', icon: '🏹' },
  siege: { name: 'Siege', icon: '🪵' }, flyer: { name: 'Flyers', icon: '🦅' }, ship: { name: 'Ships', icon: '⛵' },
  mage: { name: 'Mages', icon: '🔮' }, support: { name: 'Support', icon: '🧺' },
};
DATA.battleRules = {
  cap: 0.25,             // no role's terrain/weather effect beyond ±25%
  river: -0.15,          // attacking across a river (the last steps of the march), not flyers or amphibious troops
  riverSpring: -0.20,    // rivers run high in spring
  amphibious: 0.10,      // amphibious troops at a river or on the shore
  snow: { cavalry: -0.10 },                           // winter
  weather: {                                          // calamities over the battlefield
    flood:    { name: 'Flooded fields', roles: { cavalry: -0.10, siege: -0.10 } },
    eruption: { name: 'Ash fall',       roles: { ranged: -0.10 } },
    tempest:  { name: 'Arcane tempest', roles: { mage: 0.10 } },
  },
  counter: 0.10,         // infantry beats cavalry, cavalry beats ranged, ranged beats infantry: up to ±10% by army shares
  beats: { infantry: 'cavalry', cavalry: 'ranged', ranged: 'infantry' },
  volley: 0.5,           // share of casualties the enemy's ranged/mage/siege power inflicts in the opening volley
  pursuit: 0.5,          // share of the loser's casualties the winner's riders and flyers inflict in the rout
  rout: 0.15,            // in raids, the winner's riders kill up to 15% more of the fleeing; the loser's riders save up to 15%
};
