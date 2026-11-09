// =====================================================================
//  Research — a long, empire-wide technology tree studied at the Academy
//
//  4 eras (Founding, Kingdom, Empire, Legend) × 3 tiers = 12 columns,
//  11 branches (lanes). Every tech: id, name, icon, branch, era, tier,
//  col (= 3·era + tier), reqs (prerequisite ids: a DAG with cross-branch
//  links), fx (multipliers through G.mod, plus a few "special" keys that
//  wrappers below apply: happy, festival, culture, faith, routes,
//  influence, calamity, winter), ac (Academy level needed, from col).
//  People-specific techs carry `race` and are hidden from other peoples.
//
//  Compatibility: every key of the old 27-tech list (and `ciphers`, which
//  js/espionage.js re-declares after this file loads) is kept. `t.req`
//  (a single string, read by the espionage "steal secrets" mission) is
//  the first prerequisite; people techs get an unreachable '@race' value
//  so spies never copy them.
// =====================================================================
'use strict';

DATA.techEras = [
  { name: 'Founding', icon: '🪵', desc: 'Rough timber, charcoal and the first written marks.' },
  { name: 'Kingdom',  icon: '🔔', desc: 'Bronze, ink and the crafts of a settled realm.' },
  { name: 'Empire',   icon: '⚙️', desc: 'Steel, engineering and the machinery of state.' },
  { name: 'Legend',   icon: '✨', desc: 'Gold, ley-fire and works the bards will sing of.' },
];
DATA.techBranches = {
  agri:     { name: 'Agriculture & Husbandry',   icon: '🌾', desc: 'Fields, herds, health and the growth of your people.' },
  industry: { name: 'Industry & Craft',          icon: '⚒️', desc: 'Raw goods and the workshops that refine them.' },
  build:    { name: 'Construction & Engineering', icon: '🏗️', desc: 'Faster building, more storage and room to live.' },
  commerce: { name: 'Commerce & Trade',          icon: '⚖️', desc: 'Taxes, markets, caravans and trade routes.' },
  war:      { name: 'Warfare',                   icon: '⚔️', desc: 'Infantry, cavalry and archers: attack, defense, training, supply.' },
  siege:    { name: 'Siege & Fortification',     icon: '🏰', desc: 'Walls, towers, hidden stores and siege engines.' },
  sea:      { name: 'Seafaring',                 icon: '⚓', desc: 'Fishing, ships and the open water.' },
  arcana:   { name: 'Arcana',                    icon: '🔮', desc: 'Mana, spells and the study of the ley.' },
  faith:    { name: 'Faith & Culture',           icon: '🕯️', desc: 'Rites, festivals, culture and faith.' },
  state:    { name: 'Statecraft & Intrigue',     icon: '🗝️', desc: 'Law, spies, envoys to the free cities and crisis rule.' },
  lore:     { name: 'Exploration & Lore',        icon: '🧭', desc: 'Scouting, scholarship and heroes.' },
};
DATA.techBranchOrder = ['agri', 'industry', 'build', 'commerce', 'war', 'siege', 'sea', 'arcana', 'faith', 'state', 'lore'];
// Academy level needed per column (era·3 + tier)
DATA.techAcademy = [1, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 14];

// [id, name, icon, branch, col, reqs, fx, flavour, race?]
const TECH_TREE = [
  // ---- Agriculture & Husbandry ----
  ['croprotation', 'Crop Rotation', '🌾', 'agri', 0, [], { grain: 1.08 }, 'Fallow fields rest and return richer.'],
  ['husbandry', 'Animal Husbandry', '🐄', 'agri', 0, [], { popGrowth: 1.05, upkeep: 0.97 }, 'Herds fenced, fed and bred with care.'],
  ['ploughs', 'Heavy Plough', '🐂', 'agri', 1, ['croprotation', 'sawpits'], { grain: 1.06 }, 'Iron-shod blades turn the heavy clay.'],
  ['herblore', 'Herb Lore', '🌿', 'agri', 2, ['husbandry'], { popGrowth: 1.06, happy: 1 }, 'The wise-women know a cure for every ache.'],
  ['irrigation', 'Irrigation', '💧', 'agri', 3, ['ploughs', 'masonry'], { grain: 1.1 }, 'Stone channels carry the river to every field.'],
  ['medicine', 'Medicine', '⚕️', 'agri', 3, ['herblore', 'scribes'], { popGrowth: 1.1, housing: 1.03 }, 'Physicians write down what the herbalists knew.'],
  ['threefield', 'Three-Field System', '🌻', 'agri', 4, ['irrigation'], { grain: 1.07, housing: 1.02 }, 'Wheat, beans and fallow, turn and turn about.'],
  ['sanitation', 'Sanitation', '🚰', 'agri', 6, ['medicine', 'aqueducts'], { popGrowth: 1.08, housing: 1.03, calamity: 0.1 }, 'Clean water in, foul water out: plagues falter.'],
  ['windmills', 'Windmills', '🌬️', 'agri', 7, ['threefield', 'gears'], { grain: 1.06, refine: 1.03 }, 'Sails on every hill grind the harvest.'],
  ['agronomy', 'Agronomy', '📗', 'agri', 8, ['windmills', 'academia'], { grain: 1.07, popGrowth: 1.04 }, 'Scholars in the furrows, ledgers of every yield.'],
  ['verdant', 'Verdant Alchemy', '🌱', 'agri', 10, ['agronomy', 'transmutation'], { grain: 1.06, popGrowth: 1.05 }, 'Elixirs in the soil wake seeds that slept for years.'],
  ['eternalharvest', 'Eternal Harvest', '🌟', 'agri', 11, ['verdant'], { grain: 1.05, winter: 0.3, housing: 1.03 }, 'Even under snow the glasshouses glow and bear.'],
  // ---- Industry & Craft ----
  ['sawpits', 'Saw Pits', '🪚', 'industry', 0, [], { timber: 1.08 }, 'Two sawyers, one pit, a mountain of planks.'],
  ['stonecutting', 'Stonecutting', '🪨', 'industry', 0, [], { stone: 1.08 }, 'Wedge, water and patience split the bedrock.'],
  ['deepshafts', 'Deep Shafts', '⛏️', 'industry', 1, ['stonecutting'], { ore: 1.08 }, 'Shored tunnels follow the vein downward.'],
  ['charcoal', 'Charcoal Burning', '🪵', 'industry', 1, ['sawpits'], { refine: 1.05 }, 'Smouldering clamps make a hotter fire than wood.'],
  ['bellows', 'Bellows', '🔥', 'industry', 2, ['deepshafts', 'charcoal'], { refine: 1.08 }, 'Leather lungs breathe white heat into the forge.'],
  ['waterwheels', 'Water Wheels', '⚙️', 'industry', 3, ['bellows', 'framing'], { timber: 1.05, stone: 1.05, refine: 1.03 }, 'The river turns saws, hammers and grindstones.'],
  ['metallurgy', 'Metallurgy', '⚗️', 'industry', 4, ['bellows', 'masonry'], { refine: 1.1 }, 'Stone furnaces and the secrets of the alloy.'],
  ['toolstandards', 'Guild Toolmaking', '🛠️', 'industry', 5, ['metallurgy'], { refine: 1.04, buildTime: 0.98, forgeTime: 0.92 }, 'Every guild tool the same, every part replaceable.'],
  ['blastfurnace', 'Blast Furnace', '🏭', 'industry', 6, ['metallurgy', 'gears'], { refine: 1.08, ore: 1.04 }, 'Towers of fire that never go out.'],
  ['blasting', 'Blasting Powder', '💥', 'industry', 7, ['blastfurnace', 'alchemy'], { ore: 1.07, stone: 1.07 }, 'Alchemists\' black powder opens the hillside.'],
  ['manufactories', 'Manufactories', '🧰', 'industry', 8, ['toolstandards', 'blastfurnace'], { refine: 1.07, timber: 1.05 }, 'Long halls where a hundred hands work as one.'],
  ['runeengines', 'Rune Engines', '🔩', 'industry', 10, ['manufactories', 'leymastery'], { refine: 1.06, timber: 1.04, stone: 1.04, ore: 1.04 }, 'Ley-driven engines that tire no more than the sun.'],
  // ---- Construction & Engineering ----
  ['granaries', 'Granaries', '📦', 'build', 0, [], { storage: 1.12 }, 'Raised floors and stout doors against rats and rain.'],
  ['framing', 'Timber Framing', '🏠', 'build', 1, ['sawpits'], { buildTime: 0.96, housing: 1.02 }, 'Pegged frames rise in a day.'],
  ['masonry', 'Masonry', '🧱', 'build', 2, ['stonecutting', 'framing'], { buildTime: 0.94 }, 'Dressed stone, true courses, lasting walls.'],
  ['warehousing', 'Warehousing', '🗃️', 'build', 3, ['granaries', 'masonry'], { storage: 1.12 }, 'Tallies, bays and clerks for every sack.'],
  ['arches', 'Arches & Vaults', '🌉', 'build', 4, ['masonry'], { buildTime: 0.95, housing: 1.02 }, 'A keystone holds what a beam never could.'],
  ['aqueducts', 'Aqueducts', '🏞️', 'build', 5, ['arches', 'irrigation'], { housing: 1.04, popGrowth: 1.04 }, 'Mountain water marches into town on stone legs.'],
  ['gears', 'Gears & Cranes', '🪝', 'build', 5, ['arches', 'waterwheels'], { buildTime: 0.95 }, 'Treadwheel cranes lift what forty men could not.'],
  ['architecture', 'Architecture', '🏛️', 'build', 6, ['arches', 'gears'], { buildTime: 0.93, storage: 1.1 }, 'Drawn plans, measured domes, cities by design.'],
  ['planning', 'Urban Planning', '🏘️', 'build', 7, ['architecture', 'aqueducts'], { housing: 1.04, popGrowth: 1.03 }, 'Straight streets, wide squares, fewer fires.'],
  ['greatvaults', 'Great Vaults', '🔐', 'build', 8, ['architecture', 'warehousing'], { storage: 1.12, protect: 1.03 }, 'Treasuries cut into the living rock.'],
  ['masterbuilders', 'Master Builders', '👷', 'build', 9, ['planning', 'manufactories'], { buildTime: 0.94, housing: 1.02 }, 'Lodges of masons whose secrets are passed by oath.'],
  ['livingstone', 'Living Stone', '🗿', 'build', 11, ['masterbuilders', 'runeengines'], { buildTime: 0.94, wall: 1.05, storage: 1.08 }, 'Walls that knit their own cracks.'],
  // ---- Commerce & Trade ----
  ['taxation', 'Taxation', '🪙', 'commerce', 0, [], { tax: 1.08 }, 'A tithe of every harvest, counted in the square.'],
  ['barter', 'Barter Fairs', '🏪', 'commerce', 1, ['taxation'], { market: 1.03 }, 'Once a moon the valley comes to trade.'],
  ['coinage', 'Coinage', '💰', 'commerce', 2, ['taxation', 'deepshafts'], { tax: 1.06 }, 'Stamped silver that every merchant trusts.'],
  ['caravanserai', 'Caravanserai', '🐪', 'commerce', 3, ['barter', 'husbandry'], { caravan: 1.5 }, 'Walled inns a day apart along the roads.'],
  ['guilds', 'Merchant Guilds', '⚖️', 'commerce', 4, ['caravanserai', 'coinage'], { tax: 1.08, market: 1.03 }, 'Fair weights, fixed prices, and dues to the crown.'],
  ['charters', 'Trade Charters', '📜', 'commerce', 5, ['guilds'], { routes: 1 }, 'Sealed rights to run a road for profit.'],
  ['banking', 'Banking', '🏦', 'commerce', 6, ['guilds', 'bureaucracy'], { tax: 1.08 }, 'Ledgers, loans and interest.'],
  ['credit', 'Letters of Credit', '✉️', 'commerce', 7, ['banking', 'charters'], { caravan: 1.3, market: 1.02 }, 'A slip of paper worth a cart of gold.'],
  ['companies', 'Trading Companies', '💼', 'commerce', 8, ['credit', 'navigation'], { routes: 1, tax: 1.04 }, 'Shareholders send fleets to the edge of the map.'],
  ['bourse', 'The Bourse', '📈', 'commerce', 9, ['banking', 'companies'], { market: 1.03, tax: 1.05 }, 'Prices called out at dawn set the whole realm\'s day.'],
  ['goldenage', 'Golden Age', '🌞', 'commerce', 11, ['bourse', 'patronage'], { tax: 1.06, happy: 1 }, 'Full coffers, full bellies, full theatres.'],
  // ---- Warfare ----
  ['drill', 'Drill', '🥁', 'war', 0, [], { trainTime: 0.94 }, 'Left, right, together: the drum makes soldiers.'],
  ['forgedblades', 'Forged Blades', '🗡️', 'war', 0, [], { atk: 1.05 }, 'Iron edges instead of fire-hardened wood.'],
  ['mail', 'Chain Mail', '🥋', 'war', 1, ['forgedblades'], { def: 1.05 }, 'Ten thousand riveted rings.'],
  ['packmules', 'Pack Mules', '🫏', 'war', 1, ['husbandry'], { carry: 1.15 }, 'Stubborn, sure-footed and able to carry the loot.'],
  ['archery', 'Archery Butts', '🏹', 'war', 2, ['drill', 'sawpits'], { atk: 1.03 }, 'Every village green a practice range on feast days.'],
  ['logistics', 'Logistics', '🗺️', 'war', 3, ['packmules', 'cartography'], { travel: 1.06 }, 'Depots, roads and a quartermaster who can count.'],
  ['rations', 'Field Rations', '🍖', 'war', 3, ['packmules', 'croprotation'], { upkeep: 0.92 }, 'Hardtack and salt pork keep for months.'],
  ['tempered', 'Tempered Steel', '⚔️', 'war', 4, ['forgedblades', 'bellows'], { atk: 1.06 }, 'Quenched and drawn: hard edge, supple spine.'],
  ['stirrups', 'Stirrups', '🐎', 'war', 4, ['mail', 'husbandry'], { atk: 1.03, travel: 1.02 }, 'A rider braced in the saddle strikes like a ram.'],
  ['plate', 'Plate Armor', '🛡️', 'war', 5, ['mail', 'metallurgy'], { def: 1.06 }, 'A knight in a shell of steel.'],
  ['officers', 'Officer Corps', '🪖', 'war', 5, ['tempered', 'logistics'], { trainTime: 0.95, atk: 1.02 }, 'Sergeants and captains who know their trade.'],
  ['warcraft', 'Art of War', '🎖️', 'war', 6, ['plate', 'officers'], { atk: 1.05, def: 1.05, trainTime: 0.95 }, 'The old treatises, copied and argued over in every camp.'],
  ['standing', 'Standing Armies', '🏕️', 'war', 7, ['warcraft', 'banking'], { upkeep: 0.93, unitCost: 0.96 }, 'Paid soldiers in barracks, ready all year.'],
  ['damascene', 'Damascene Steel', '🔪', 'war', 9, ['standing', 'blastfurnace'], { atk: 1.05, forgeTime: 0.92 }, 'Watered blades that cut silk in the air.'],
  ['regiments', 'Legendary Regiments', '🏅', 'war', 11, ['damascene', 'sagas'], { atk: 1.04, def: 1.05, trainTime: 0.95 }, 'Banners with a hundred battle honours.'],
  // ---- Siege & Fortification ----
  ['palisades', 'Palisades', '🚧', 'siege', 0, [], { wall: 1.08 }, 'Sharpened stakes and a ditch.'],
  ['cellars', 'Hidden Cellars', '🕳️', 'siege', 1, ['granaries'], { protect: 1.06 }, 'Trapdoors under the hearth hide the seed grain.'],
  ['watchtowers', 'Watchtowers', '🗼', 'siege', 2, ['palisades', 'framing'], { vision: 1.06, def: 1.02 }, 'A horn on every hill.'],
  ['fortification', 'Fortification', '🏰', 'siege', 3, ['palisades', 'masonry'], { wall: 1.12 }, 'Stone curtain walls and gatehouses.'],
  ['siegecraft', 'Siege Engineering', '🎯', 'siege', 4, ['fortification', 'archery'], { atk: 1.03, carry: 1.05 }, 'Sappers, mantlets and the patience to wait.'],
  ['concentric', 'Concentric Castles', '🏯', 'siege', 5, ['fortification', 'arches'], { wall: 1.1 }, 'A wall within a wall within a moat.'],
  ['counterweight', 'Counterweight Engines', '☄️', 'siege', 7, ['siegecraft', 'gears'], { atk: 1.04 }, 'Trebuchets that throw a cow over a castle.'],
  ['starforts', 'Star Forts', '✴️', 'siege', 8, ['concentric', 'blasting'], { wall: 1.1, def: 1.02 }, 'Low angled bastions that shrug off the cannonade.'],
  ['bastions', 'Bastion Garrisons', '🏴', 'siege', 9, ['starforts', 'standing'], { def: 1.04, protect: 1.04 }, 'Every bastion its own fortress.'],
  ['wardedramparts', 'Warded Ramparts', '🔰', 'siege', 11, ['bastions', 'wards'], { wall: 1.1, def: 1.03 }, 'Runes in the mortar turn stone and spell alike.'],
  // ---- Seafaring ----
  ['weirs', 'Fishing Weirs', '🎣', 'sea', 0, [], { fishing: 1.12 }, 'Wicker fences in the shallows fill themselves.'],
  ['boatbuilding', 'Boatbuilding', '🛶', 'sea', 1, ['sawpits'], { shipCost: 0.95 }, 'Clinker hulls on the strand.'],
  ['rigging', 'Sail Rigging', '⛵', 'sea', 2, ['boatbuilding'], { travel: 1.03 }, 'Lateen sails that tack into the wind.'],
  ['nets', 'Deep-Sea Nets', '🐟', 'sea', 3, ['weirs', 'boatbuilding'], { fishing: 1.12 }, 'Drift nets a mile long.'],
  ['shipwrights', "Shipwrights' Guild", '⚓', 'sea', 4, ['rigging', 'framing'], { shipCost: 0.94 }, 'Keels laid by masters on proper slipways.'],
  ['navigation', 'Navigation', '🔭', 'sea', 5, ['shipwrights', 'cartography'], { travel: 1.03, vision: 1.05 }, 'Lodestone, astrolabe and the stars.'],
  ['harborcranes', 'Harbor Cranes', '🏗️', 'sea', 6, ['navigation', 'gears'], { caravan: 1.2, fishing: 1.08 }, 'Quays where a ship is unloaded in an hour.'],
  ['galleons', 'Galleons', '🚢', 'sea', 8, ['harborcranes', 'plate'], { shipCost: 0.94, carry: 1.05 }, 'Towering hulls with holds like barns.'],
  ['admiralty', 'Admiralty', '🎏', 'sea', 9, ['galleons'], { fishing: 1.1, def: 1.02 }, 'Charts, dockyards and lords of the sea.'],
  ['leviathan', 'Leviathan Pacts', '🐋', 'sea', 11, ['admiralty', 'archmagery'], { fishing: 1.1, shipCost: 0.95, travel: 1.02 }, 'The great beasts of the deep swim at your side.'],
  // ---- Arcana ----
  ['hedgemagic', 'Hedge Magic', '🕯️', 'arcana', 0, [], { mana: 1.08 }, 'Charms, candles and the old words.'],
  ['starcharts', 'Star Charts', '✨', 'arcana', 1, ['hedgemagic'], { researchTime: 0.97, studyTime: 0.95 }, 'The night sky drawn and named.'],
  ['runes', 'Runecraft', '🔣', 'arcana', 2, ['hedgemagic', 'stonecutting'], { spellPower: 1.04 }, 'Cut the sign deep and the stone remembers.'],
  ['alchemy', 'Alchemy', '🧪', 'arcana', 3, ['runes', 'charcoal'], { refine: 1.03, mana: 1.05 }, 'Retorts, salts and a great many explosions.'],
  ['leylore', 'Ley Lore', '🌀', 'arcana', 4, ['runes', 'starcharts'], { mana: 1.08 }, 'Dowsers trace the rivers of power under the land.'],
  ['wards', 'Wards', '🧿', 'arcana', 5, ['leylore'], { def: 1.02, calamity: 0.1 }, 'Circles of salt and silver against storm and blight.'],
  ['thaumaturgy', 'Thaumaturgy', '🪄', 'arcana', 6, ['leylore', 'libraries'], { spellPower: 1.06, spellCost: 0.95 }, 'Magic made a discipline, with proofs.'],
  ['transmutation', 'Transmutation', '💎', 'arcana', 7, ['alchemy', 'thaumaturgy'], { refine: 1.04, ore: 1.03 }, 'Lead to iron, iron to steel, sometimes gold.'],
  ['arcaneacad', 'Arcane Colleges', '🔮', 'arcana', 8, ['thaumaturgy', 'libraries'], { researchTime: 0.95, mana: 1.06, studyTime: 0.92 }, 'Towers of apprentices and their long-suffering masters.'],
  ['leymastery', 'Ley Mastery', '💫', 'arcana', 9, ['arcaneacad'], { mana: 1.08, spellCost: 0.94 }, 'The ley bends where the archmages will it.'],
  ['archmagery', 'Archmagery', '🌠', 'arcana', 10, ['leymastery', 'transmutation'], { spellPower: 1.08 }, 'Spells that move weather and mountains.'],
  ['embercrown', 'The Ember Crown', '👑', 'arcana', 11, ['archmagery', 'greatlibrary'], { spellPower: 1.04, spellCost: 0.95, mana: 1.05, researchTime: 0.97 }, 'The ancient circlet of living flame, rekindled at last.'],
  // ---- Faith & Culture ----
  ['rites', 'Ancestor Rites', '🪦', 'faith', 0, [], { happy: 1, culture: 1.05 }, 'The dead are remembered, and so are their stories.'],
  ['oraltradition', 'Oral Tradition', '🗣️', 'faith', 1, ['rites'], { culture: 1.06 }, 'Songs that carry a people\'s memory.'],
  ['priesthood', 'Priesthood', '⛪', 'faith', 2, ['rites'], { faith: 1.08 }, 'Keepers of the shrines and the calendar.'],
  ['festivals', 'Festivals', '🎉', 'faith', 3, ['oraltradition', 'croprotation'], { festival: 4, happy: 1 }, 'Harvest home, midwinter fires, maypoles in spring.'],
  ['theology', 'Theology', '📿', 'faith', 4, ['priesthood', 'scribes'], { faith: 1.08 }, 'The gods argued over in ink.'],
  ['drama', 'Drama & Poetry', '🎭', 'faith', 5, ['festivals', 'theology'], { culture: 1.08 }, 'Masks, choruses and the great tragedies.'],
  ['patronage', 'Patronage of the Arts', '🖼️', 'faith', 7, ['drama', 'banking'], { culture: 1.08 }, 'Bankers buy their immortality in frescoes.'],
  ['cathedrals', 'Cathedrals', '🕍', 'faith', 8, ['theology', 'architecture'], { faith: 1.1, happy: 1 }, 'Spires that take three generations to finish.'],
  ['grandfestivals', 'Grand Festivals', '🎆', 'faith', 9, ['patronage'], { festival: 3, culture: 1.03 }, 'Fireworks, tourneys and a fountain running with wine.'],
  ['epics', 'Mythic Epics', '🐉', 'faith', 10, ['grandfestivals', 'cathedrals'], { culture: 1.08, faith: 1.04 }, 'The realm\'s story told as the gods\' own.'],
  ['apotheosis', 'Apotheosis', '🌅', 'faith', 11, ['epics'], { faith: 1.06, culture: 1.06, happy: 1 }, 'Your founders take their place among the stars.'],
  // ---- Statecraft & Intrigue ----
  ['lawcode', 'Law Code', '📃', 'state', 0, [], { tax: 1.03, happy: 1 }, 'Laws cut in stone where all can read them.'],
  ['messengers', 'Messengers', '🐦', 'state', 1, ['lawcode'], { spyTravel: 1.08, travel: 1.02 }, 'Relay riders and homing birds.'],
  ['envoys', 'Envoys', '🕊️', 'state', 2, ['messengers'], { influence: 1.1 }, 'Gifts, toasts and long dinners with the free cities.'],
  ['ciphers', 'Ciphers & Watchmen', '🗝️', 'state', 3, ['messengers', 'scribes'], { counterintel: 1.25, spy: 1.1 }, 'Secret letters and a watch on every gate.'],
  ['bureaucracy', 'Bureaucracy', '🗂️', 'state', 4, ['lawcode', 'scribes'], { tax: 1.03, buildTime: 0.98 }, 'Forms in triplicate: tedious, but nothing is lost.'],
  ['diplomacy', 'Diplomatic Corps', '🤝', 'state', 5, ['envoys', 'guilds'], { influence: 1.12 }, 'Permanent embassies in every court.'],
  ['spymasters', 'Spymasters', '🕵️', 'state', 7, ['ciphers', 'bureaucracy'], { spy: 1.1, spyTravel: 1.08, counterintel: 1.1 }, 'A quiet office that knows everything first.'],
  ['administration', 'Imperial Administration', '🏢', 'state', 8, ['bureaucracy', 'architecture'], { tax: 1.04, happy: 1 }, 'Governors, censuses and roads that reach every town.'],
  ['ministries', 'Crisis Ministries', '🧯', 'state', 9, ['administration', 'sanitation'], { calamity: 0.15, winter: 0.2 }, 'Stockpiles, fire brigades and a plan for the worst.'],
  ['whispers', 'Web of Whispers', '🕸️', 'state', 10, ['spymasters', 'diplomacy'], { spy: 1.08, counterintel: 1.08, influence: 1.08 }, 'Every tavern keeper is on your payroll.'],
  ['pax', 'Pax Imperia', '⚜️', 'state', 11, ['whispers', 'ministries'], { tax: 1.04, happy: 1, influence: 1.08 }, 'A peace so long that the old wars become legends.'],
  // ---- Exploration & Lore ----
  ['trailblazing', 'Trailblazing', '👣', 'lore', 0, [], { vision: 1.06, travel: 1.02 }, 'Blazed trees and cairns mark the way home.'],
  ['scribes', 'Scribes', '✒️', 'lore', 1, ['lawcode'], { researchTime: 0.97 }, 'Ink, reed and a steady hand.'],
  ['cartography', 'Cartography', '🧭', 'lore', 2, ['trailblazing', 'scribes'], { vision: 1.12 }, 'The known world, drawn to scale.'],
  ['herolore', 'Heroic Lore', '📖', 'lore', 3, ['scribes', 'trailblazing'], { heroXp: 1.15 }, 'The deeds of old heroes, studied for their lessons.'],
  ['libraries', 'Libraries', '📚', 'lore', 4, ['scribes', 'cartography'], { researchTime: 0.95 }, 'Chained books and quiet reading rooms.'],
  ['explorers', "Explorers' Guild", '🧗', 'lore', 5, ['cartography', 'logistics'], { vision: 1.08, travel: 1.03 }, 'Patrons pay handsomely for blank spaces filled.'],
  ['academia', 'Academia', '🎓', 'lore', 6, ['libraries'], { researchTime: 0.94 }, 'Colleges, disputations and the first universities.'],
  ['sagas', 'Sagas of Heroes', '🏆', 'lore', 7, ['herolore', 'academia'], { heroXp: 1.15, atk: 1.01 }, 'Every child knows the names of your champions.'],
  ['greatlibrary', 'Great Library', '🏫', 'lore', 9, ['academia', 'sagas'], { researchTime: 0.94 }, 'All the world\'s knowledge under one dome.'],
  ['planaratlas', 'Planar Atlas', '🪐', 'lore', 10, ['greatlibrary', 'leymastery'], { vision: 1.1, travel: 1.03 }, 'Maps of the roads between worlds.'],
  ['legends', 'Legends Reborn', '🐲', 'lore', 11, ['planaratlas'], { heroXp: 1.15, researchTime: 0.97 }, 'The heroes of the songs walk again.'],

  // ---- people-specific techs (era 0..3 → columns 1, 4, 7, 10) ----
  ['millstones', 'Millstones', '🫓', 'agri', 1, ['croprotation'], { grain: 1.05, refine: 1.03 }, 'Hearthfolk mills grind flour fine as river silt.', 'hearth'],
  ['hearthmarkets', 'Hearth Markets', '🧺', 'commerce', 4, ['barter', 'coinage'], { market: 1.04, caravan: 1.2 }, 'Hard bargains with a smile and a loaf.', 'hearth'],
  ['knightlyorders', 'Knightly Orders', '🐴', 'war', 7, ['plate', 'stirrups'], { def: 1.04, atk: 1.03, upkeep: 0.96 }, 'Sworn brotherhoods of the valley lords.', 'hearth'],
  ['harvestcrown', 'The Harvest Crown', '🌽', 'faith', 10, ['festivals', 'threefield'], { happy: 2, popGrowth: 1.06, grain: 1.04 }, 'A queen of the harvest crowned in every town.', 'hearth'],

  ['deepdelving', 'Deep Delving', '⛰️', 'industry', 1, ['stonecutting'], { ore: 1.06, stone: 1.04 }, 'Deeper than any surface-dweller dares.', 'delver'],
  ['runesmithing', 'Rune Smithing', '💠', 'industry', 4, ['bellows', 'runes'], { refine: 1.06, forgeTime: 0.92 }, 'Runes hammered into the hot metal.', 'delver'],
  ['mountainhalls', 'Mountain Halls', '🏔️', 'siege', 7, ['fortification', 'warehousing'], { wall: 1.08, storage: 1.06, protect: 1.03 }, 'Whole cities carved inside the peaks.', 'delver'],
  ['runesofmaking', 'Runes of Making', '🔨', 'arcana', 10, ['runesmithing', 'transmutation'], { refine: 1.05, buildTime: 0.95, def: 1.03 }, 'The first runes, those that shaped the mountains.', 'delver'],

  ['grovetending', 'Grove Tending', '🌳', 'industry', 1, ['sawpits'], { timber: 1.06, popGrowth: 1.03 }, 'Cut one, plant three, sing to them all.', 'sylvan'],
  ['wardenpaths', "Wardens' Paths", '🍃', 'lore', 4, ['trailblazing', 'cartography'], { travel: 1.04, vision: 1.06 }, 'Hidden ways through the deep wood.', 'sylvan'],
  ['livingbows', 'Living Bows', '🎋', 'war', 7, ['archery', 'officers'], { atk: 1.04, unitCost: 0.96 }, 'Bows grown, not carved, still green and supple.', 'sylvan'],
  ['heartforest', 'Heart of the Forest', '💚', 'faith', 10, ['herblore', 'drama'], { popGrowth: 1.06, housing: 1.04, timber: 1.04 }, 'The oldest tree wakes and blesses its children.', 'sylvan'],

  ['raidingparties', 'Raiding Parties', '🏇', 'war', 1, ['drill'], { carry: 1.1, travel: 1.02 }, 'In fast, out faster, saddlebags full.', 'ash'],
  ['bloodpits', 'Blood Pits', '🩸', 'war', 4, ['drill', 'archery'], { trainTime: 0.94, atk: 1.02 }, 'The war pits make warriors quickly, or not at all.', 'ash'],
  ['steppehordes', 'Steppe Hordes', '🐺', 'war', 7, ['rations', 'stirrups'], { upkeep: 0.93, carry: 1.08 }, 'An army that lives off the land it crosses.', 'ash'],
  ['ashascendant', 'Ash Ascendant', '🌋', 'war', 10, ['tempered', 'warcraft'], { atk: 1.05, trainTime: 0.95 }, 'The clans united under one burning banner.', 'ash'],

  ['pearldiving', 'Pearl Diving', '🦪', 'sea', 1, ['weirs'], { pearls: 1.12, fishing: 1.05 }, 'One breath, one oyster bed, one fortune.', 'tide'],
  ['tidereading', 'Tide Reading', '🌊', 'sea', 4, ['rigging'], { shipSpeed: 1.08, travel: 1.02 }, 'Ride the ebb out and the flood home.', 'tide'],
  ['coralbastions', 'Coral Bastions', '🪸', 'siege', 7, ['fortification', 'nets'], { wall: 1.06, def: 1.03 }, 'Reef-walls grown higher every year.', 'tide'],
  ['calldeep', 'Call of the Deep', '🔱', 'sea', 10, ['admiralty'], { fishing: 1.08, shipCost: 0.93, atk: 1.03 }, 'The sea itself answers the conch.', 'tide'],

  ['glimmer', 'Glimmer Weaving', '🧵', 'arcana', 1, ['hedgemagic'], { mana: 1.06, dreamsilk: 1.08 }, 'Threads spun from moonlight and dew.', 'veil'],
  ['dreamlib', 'Dream Libraries', '🌙', 'lore', 4, ['scribes', 'starcharts'], { researchTime: 0.95 }, 'Books written in sleep and read in sleep.', 'veil'],
  ['glamourmastery', 'Glamour Mastery', '🪞', 'arcana', 7, ['wards'], { def: 1.04, spellPower: 1.03 }, 'A hundred false reflections around every true blade.', 'veil'],
  ['twilightcourt', 'Court of Twilight', '🦋', 'state', 10, ['envoys', 'thaumaturgy'], { spellCost: 0.93, influence: 1.1, happy: 1 }, 'Fey lords and mortal kings bow at the same table.', 'veil'],

  ['bonegrinding', 'Bone Grinding', '🦴', 'industry', 1, ['stonecutting'], { bonedust: 1.1, stone: 1.03 }, 'Nothing is wasted in the Gravebound realm.', 'grave'],
  ['binding', 'Rites of Binding', '⛓️', 'faith', 4, ['rites', 'priesthood'], { raise: 1.1, upkeep: 0.96 }, 'The dead are bound by oath as well as spell.', 'grave'],
  ['ossuaryvaults', 'Ossuary Vaults', '⚱️', 'build', 7, ['warehousing'], { bonedust: 1.08, storage: 1.05, happy: 1 }, 'Orderly halls of bone, oddly comforting.', 'grave'],
  ['legioneternal', 'Legion Eternal', '💀', 'war', 10, ['plate', 'binding'], { raise: 1.1, def: 1.04 }, 'Legions that have marched for a thousand years.', 'grave'],

  ['updrafts', 'Updraft Lore', '🪶', 'lore', 1, ['trailblazing'], { vision: 1.06, travel: 1.02 }, 'Every thermal and gust named and known.', 'wind'],
  ['aeriebreeding', 'Aerie Breeding', '🦅', 'war', 4, ['husbandry', 'drill'], { trainTime: 0.95, upkeep: 0.96 }, 'Hawks and rocs raised from the egg.', 'wind'],
  ['stormlenses', 'Stormglass Lenses', '🔷', 'industry', 7, ['waterwheels', 'cartography'], { stormglass: 1.1, vision: 1.05 }, 'Lightning-fused glass that sees the far horizon.', 'wind'],
  ['thunderlords', 'Thunderlords', '⚡', 'war', 10, ['officers', 'stirrups'], { atk: 1.05, travel: 1.03 }, 'Riders who bring the storm with them.', 'wind'],
];

// ---- repeatable "mastery" techs: open once a branch reaches the Legend era (column 9, Academy 11);
//      each can be studied again and again, every level adds the same small bonus, the next level
//      costs ×G.TECH_REPEAT_COST and takes ×G.TECH_REPEAT_TIME longer. Levels live in R.done
//      (true = level 1, a number = that level), so every "is it known?" check keeps working.
const TECH_REPEATS = [
  ['improvedharvests', 'Improved Harvests', '🌾', 'agri', 9, ['agronomy'], { grain: 1.02 }, 'Every season a better seed, a straighter furrow.'],
  ['refinedmethods', 'Workshop Refinements', '🔧', 'industry', 9, ['manufactories'], { refine: 1.02 }, 'A jig here, a better quench there: the workshops never stop learning.'],
  ['masonryrefine', 'Masonry Refinements', '🧱', 'build', 9, ['planning'], { buildTime: 0.98 }, 'Mortar a little stronger, scaffolds a little quicker, every year.'],
  ['ledgers', 'Ledger Keeping', '📒', 'commerce', 9, ['companies'], { tax: 1.02 }, 'Double entry, audited twice: not a copper slips away.'],
  ['armsdrills', 'Arms Drills', '🤺', 'war', 9, ['standing'], { atk: 1.02 }, 'The same thrust ten thousand times, until it is a reflex.'],
  ['rampartworks', 'Rampart Works', '🧰', 'siege', 9, ['starforts'], { wall: 1.03 }, 'Sappers thicken, angle and face the walls a little more each year.'],
  ['seamanship', 'Seamanship', '🪢', 'sea', 9, ['galleons'], { fishing: 1.03 }, 'Knots, soundings and weather-lore handed from bosun to boy.'],
  ['arcanetheory', 'Arcane Theory', '📐', 'arcana', 9, ['arcaneacad'], { spellPower: 1.02 }, 'Each proof opens two new questions, and a slightly brighter spell.'],
  ['devotions', 'Devout Observance', '🙏', 'faith', 9, ['cathedrals'], { faith: 1.02, culture: 1.02 }, 'Feasts, vigils and pilgrimages added to the calendar.'],
  ['civilservice', 'Civil Service', '🖋️', 'state', 9, ['administration'], { influence: 1.04, counterintel: 1.04 }, 'Examinations for every clerk, promotion by merit.'],
  ['scholarship', 'Scholarship', '🎓', 'lore', 9, ['academia'], { heroXp: 1.04, researchTime: 0.99 }, 'Footnotes upon footnotes: knowledge compounds.'],
];
G.TECH_REPEAT_COST = 1.25;   // cost of each further level
G.TECH_REPEAT_TIME = 1.12;   // study time of each further level
G.TECH_REPEAT_MAX = 20;      // levels per mastery tech

// keys handled by wrappers below rather than by G.mod (additive or unlock-like)
G.TECH_SPECIAL = { happy: 1, festival: 1, culture: 1, faith: 1, routes: 1, influence: 1, calamity: 1, winter: 1 };
const TECH_ADDITIVE = { happy: 1, festival: 1, routes: 1, calamity: 1, winter: 1 };

DATA.techs = {};
for (const [id, name, icon, branch, col, reqs, fx, flavor, race] of TECH_TREE) {
  DATA.techs[id] = {
    id, name, icon, branch, col, era: Math.floor(col / 3), tier: col % 3, reqs: reqs.slice(), fx, flavor,
    cat: branch === 'war' || branch === 'siege' ? 'Military' : 'Economy',
    ac: DATA.techAcademy[col],
    req: race ? '@' + race : reqs[0],
  };
  if (race) DATA.techs[id].race = race;
}
for (const [id, name, icon, branch, col, reqs, fx, flavor] of TECH_REPEATS) {
  DATA.techs[id] = {
    id, name, icon, branch, col, era: Math.floor(col / 3), tier: col % 3, reqs: reqs.slice(), fx, flavor,
    cat: branch === 'war' || branch === 'siege' ? 'Military' : 'Economy',
    ac: DATA.techAcademy[col], req: reqs[0], repeat: true,
  };
}
const REPEAT_IDS = TECH_REPEATS.map(r => r[0]);
DATA.techs.ciphers.cat = 'Military';
// remembered so a module that re-declares a tech (espionage.js: ciphers) gets its place back
const TECH_PLACE = {};
for (const [id, t] of Object.entries(DATA.techs)) TECH_PLACE[id] = { branch: t.branch, col: t.col, reqs: t.reqs.slice(), flavor: t.flavor, icon: t.icon, race: t.race };

// ---------------------------------------------------------------------
// effect text (generated from fx: one source of truth for log, UI and tests)
// ---------------------------------------------------------------------
const pctUp = f => Math.round((f - 1) * 100);
const pctDown = f => Math.round((1 - f) * 100);
const FX_TEXT = {
  refine: f => `+${pctUp(f)}% workshop output`,
  tax: f => `+${pctUp(f)}% taxes`,
  market: f => `better market prices (+${pctUp(f)} pts)`,
  caravan: f => `caravans carry ${pctUp(f)}% more`,
  popGrowth: f => `population grows ${pctUp(f)}% faster`,
  housing: f => `+${pctUp(f)}% housing`,
  storage: f => `+${pctUp(f)}% storage`,
  buildTime: f => `construction ${pctDown(f)}% faster`,
  trainTime: f => `troops train ${pctDown(f)}% faster`,
  researchTime: f => `research ${pctDown(f)}% faster`,
  forgeTime: f => `forge upgrades ${pctDown(f)}% faster`,
  travel: f => `armies and caravans march ${pctUp(f)}% faster`,
  atk: f => `+${pctUp(f)}% attack`,
  def: f => `+${pctUp(f)}% defense`,
  wall: f => `walls ${pctUp(f)}% stronger`,
  carry: f => `troops carry ${pctUp(f)}% more plunder`,
  vision: f => `cities see ${pctUp(f)}% farther`,
  upkeep: f => `troops eat ${pctDown(f)}% less`,
  protect: f => `${pctUp(f)}% more of your stock hidden from raiders`,
  heroXp: f => `heroes gain ${pctUp(f)}% more experience`,
  mana: f => `+${pctUp(f)}% mana`,
  spellPower: f => `spells ${pctUp(f)}% stronger`,
  spellCost: f => `spells cost ${pctDown(f)}% less mana`,
  studyTime: f => `Grimoire study ${pctDown(f)}% faster`,
  fishing: f => `harbors fish ${pctUp(f)}% more`,
  shipCost: f => `ships ${pctDown(f)}% cheaper`,
  shipSpeed: f => `ships sail ${pctUp(f)}% faster`,
  unitCost: f => `troops ${pctDown(f)}% cheaper`,
  spy: f => `spies ${pctUp(f)}% more capable`,
  counterintel: f => `+${pctUp(f)}% counter-intelligence`,
  spyTravel: f => `spies travel ${pctUp(f)}% faster`,
  raise: f => `${pctUp(f)}% more of the fallen rise`,
  culture: f => `+${pctUp(f)}% culture`,
  faith: f => `+${pctUp(f)}% faith`,
  influence: f => `+${pctUp(f)}% influence with free cities from trade and deeds`,
  happy: v => `+${v} happiness in every city`,
  festival: v => `festivals lift happiness by ${v} more`,
  routes: v => `+${v} trade route per market city`,
  calamity: v => `calamities hurt your cities ${Math.round(v * 100)}% less`,
  winter: v => `winter hurts ${Math.round(v * 100)}% less`,
};
G.techFxKeys = () => Object.keys(FX_TEXT).concat(Object.keys(DATA.goods));
G.techFxPart = (k, v) => FX_TEXT[k] ? FX_TEXT[k](v) : DATA.goods[k] ? `+${pctUp(v)}% ${DATA.goods[k].name.toLowerCase()}` : `${k} ×${v}`;
G.techFxText = id => {
  const t = DATA.techs[id];
  if (!t) return '';
  const s = Object.entries(t.fx || {}).map(([k, v]) => G.techFxPart(k, v)).join(', ');
  return s ? s[0].toUpperCase() + s.slice(1) + '.' : '';
};

// fill in tree fields for techs declared elsewhere (or re-declared, like ciphers by espionage.js)
let techCount = 0;
const normalizeTech = (id, t) => {
  const p = TECH_PLACE[id] || {};
  if (t.branch === undefined) t.branch = p.branch || (t.cat === 'Military' ? 'war' : 'industry');
  if (t.col === undefined) t.col = p.col !== undefined ? p.col : Math.max(0, Math.min(11, DATA.techAcademy.findIndex(a => a >= (t.ac || 1))));
  t.era = Math.floor(t.col / 3); t.tier = t.col % 3;
  if (!Array.isArray(t.reqs)) t.reqs = p.reqs ? p.reqs.slice() : t.req && typeof t.req === 'string' && DATA.techs[t.req] ? [t.req] : [];
  if (!t.flavor && p.flavor) t.flavor = p.flavor;
  if (!t.icon) t.icon = p.icon || '📜';
  if (p.race && !t.race) t.race = p.race;
  t.ac = DATA.techAcademy[t.col];
  t.req = t.race ? '@' + t.race : t.reqs[0];
  t.fx = t.fx || {};
  t.id = id;
  t.desc = G.techFxText(id);
};
const normalizeAll = () => {
  const ids = Object.keys(DATA.techs);
  if (ids.length === techCount && DATA.techs.ciphers && DATA.techs.ciphers.reqs) return;
  for (const id of ids) normalizeTech(id, DATA.techs[id]);
  techCount = ids.length;
  CHILDREN = null;
};
let CHILDREN = null;
G.techUnlocks = id => {
  if (!CHILDREN) {
    CHILDREN = {};
    for (const [k, t] of Object.entries(DATA.techs)) for (const r of t.reqs || []) (CHILDREN[r] = CHILDREN[r] || []).push(k);
  }
  return CHILDREN[id] || [];
};

// ---------------------------------------------------------------------
// costs and times
// ---------------------------------------------------------------------
const BRANCH_COST = {
  agri:     { grain: 1.3 },
  industry: { stone: 1.2, timber: 1.1 },
  build:    { stone: 1.3 },
  commerce: { gold: 1.35 },
  war:      { iron: 1 },
  siege:    { stone: 1.25, iron: 0.7 },
  sea:      { timber: 1.35 },
  arcana:   { gold: 1.2, mana: 1 },
  faith:    { grain: 1.15, gold: 1.15 },
  state:    { gold: 1.5 },
  lore:     { gold: 1.2 },
};
G.TECH_GOOD_CAP = 12000;
// level: for repeatable techs, the level being studied (1 = first); every further level costs ×G.TECH_REPEAT_COST
G.techCost = (id, level = 1) => {
  normalizeAll();
  const t = DATA.techs[id];
  const col = t.col, m = Math.pow(1.32, col) * (t.repeat ? Math.pow(G.TECH_REPEAT_COST, Math.max(0, level - 1)) : 1);
  const b = BRANCH_COST[t.branch] || {};
  const c = {
    timber: 220 * m * (b.timber || 1), stone: 170 * m * (b.stone || 1),
    grain: 140 * m * (b.grain || 1), gold: 100 * m * (b.gold || 1),
  };
  if (b.iron) c.iron = 28 * m * b.iron;
  if (b.mana && col >= 3) c.mana = 10 * m;
  if (col >= 3) c.tools = 4 * (col - 1);
  for (const g of Object.keys(c)) {
    if (g !== 'gold' && c[g] > G.TECH_GOOD_CAP) { c.gold += (c[g] - G.TECH_GOOD_CAP) * DATA.goods[g].value; c[g] = G.TECH_GOOD_CAP; }
    c[g] = Math.round(c[g]);
  }
  return c;
};
G.techBaseTime = (id, level = 1) => { normalizeAll(); const t = DATA.techs[id]; return 100 * Math.pow(1.36, t.col) * (t.repeat ? Math.pow(G.TECH_REPEAT_TIME, Math.max(0, level - 1)) : 1); };
// level defaults to the next level this realm would study
G.techTime = (s, owner, id, city, level) => {
  const t = DATA.techs[id];
  const ac = G.lvl(city, 'academy');
  if (level === undefined) level = t.repeat ? G.techLevel(s, owner, id) + 1 : 1;
  const base = G.techBaseTime(id, level) / (1 + 0.06 * Math.max(0, ac - t.ac));
  return Math.round(base * G.pace(s).time * G.mod(s, owner, city, 'researchTime'));
};

// ---------------------------------------------------------------------
// state and queries
// ---------------------------------------------------------------------
// R = { done: {id: true | level}, studies: [{ id, city, start, end, cost, level? }], queue?, queueCity?, queueWait? }
// Several studies run at once (see G.researchSlots). `R.active` is kept as a non-saved accessor for
// older code: it reads the first study, and assigning null drops it. Old saves with a stored
// R.active are migrated into R.studies the first time G.research sees them.
const READY = new WeakSet();
const prepResearch = R => {
  const d = Object.getOwnPropertyDescriptor(R, 'active');
  if (!Array.isArray(R.studies)) R.studies = [];
  if (d && 'value' in d) {
    delete R.active;
    if (d.value && d.value.id && !R.studies.some(x => x.id === d.value.id)) R.studies.unshift(d.value);
  }
  if (!d || 'value' in d) Object.defineProperty(R, 'active', {
    configurable: true, enumerable: false,
    get() { return this.studies[0] || null; },
    set(v) { if (!v) this.studies.shift(); else if (this.studies.length) this.studies[0] = v; else this.studies.push(v); },
  });
  READY.add(R);
};
G.research = (s, owner) => {
  if (!hooksReady) ensureHooks();
  const e = s.empires[owner];
  if (!e.research) e.research = { done: {}, studies: [] };
  const R = e.research;
  if (!READY.has(R)) prepResearch(R);
  if (!R.done) R.done = {};
  return R;
};
G.hasTech = (s, owner, id) => !!G.research(s, owner).done[id];
// level of a tech: 0 unknown, 1 known; repeatable techs count up from there
const levelIn = (R, id) => { const d = R.done[id]; return d === true ? 1 : typeof d === 'number' ? Math.max(0, d) : d ? 1 : 0; };
G.techLevel = (s, owner, id) => levelIn(G.research(s, owner), id);
G.isRepeatTech = id => !!(DATA.techs[id] && DATA.techs[id].repeat);
G.researchStudies = (s, owner) => G.research(s, owner).studies;
G.researchStudy = (s, owner, id) => G.research(s, owner).studies.find(x => x.id === id) || null;

// ---------------------------------------------------------------------
// study slots: parallel studies, each pinned to a city with an Academy
//   - a realm with any Academy has 1 slot;
//   - every city with an Academy of level G.RESEARCH_SLOT_ACADEMY (3)+ counts for one slot,
//     an Academy of level G.RESEARCH_DOUBLE_ACADEMY (12)+ for two (it runs two studies);
//   - at most G.RESEARCH_SLOT_MAX (4) slots.
// A city runs one study at a time (two with an Academy 12+), and a topic only starts once all of
// its prerequisites are known, so it never runs alongside its own prerequisite.
// ---------------------------------------------------------------------
G.RESEARCH_SLOT_ACADEMY = 3;
G.RESEARCH_DOUBLE_ACADEMY = 12;
G.RESEARCH_SLOT_MAX = 4;
G.researchHostCap = city => { const a = G.lvl(city, 'academy'); return a >= G.RESEARCH_DOUBLE_ACADEMY ? 2 : a >= 1 ? 1 : 0; };
const slotWorth = city => { const a = G.lvl(city, 'academy'); return a >= G.RESEARCH_DOUBLE_ACADEMY ? 2 : a >= G.RESEARCH_SLOT_ACADEMY ? 1 : 0; };
G.researchCityLoad = (s, city) => {
  const R = G.research(s, city.owner);
  let n = 0;
  for (const x of R.studies) if (x.city === city.id) n++;
  return n;
};
G.researchHostFree = (s, city) => G.researchHostCap(city) - G.researchCityLoad(s, city);
G.researchSlots = (s, owner) => {
  const R = G.research(s, owner), cs = G.citiesOf(s, owner);
  let any = false, worth = 0;
  for (const c of cs) { if (G.lvl(c, 'academy') > 0) any = true; worth += slotWorth(c); }
  const total = any ? Math.min(G.RESEARCH_SLOT_MAX, Math.max(1, worth)) : 0;
  const used = R.studies.length;
  let hint = '';
  if (!any) hint = 'Build an Academy (Town Hall 3) to begin research.';
  else if (total < G.RESEARCH_SLOT_MAX) {
    const A = G.RESEARCH_SLOT_ACADEMY, low = cs.filter(c => !slotWorth(c));
    if (cs.length === 1) hint = `Found another city and raise its Academy to ${A} for ${total > 1 ? 'one more' : 'a second'} study slot${G.lvl(cs[0], 'academy') < G.RESEARCH_DOUBLE_ACADEMY ? ` (or raise this Academy to ${G.RESEARCH_DOUBLE_ACADEMY} to run two studies here)` : ''}.`;
    else if (low.length && worth >= 1) hint = `Raise the Academy of another city (${low.slice(0, 2).map(c => c.name).join(', ')}) to level ${A} for one more study slot.`;
    else if (low.length) hint = `Raise Academies to level ${A} in two cities for a second study slot.`;
    else hint = `Found another city with an Academy ${A}+ for one more slot${cs.some(c => G.lvl(c, 'academy') >= G.RESEARCH_DOUBLE_ACADEMY) ? '' : `, or raise an Academy to ${G.RESEARCH_DOUBLE_ACADEMY} to run two studies there`}.`;
  }
  return { total, used, free: Math.max(0, total - used), hint };
};
// the city that should study a topic: the preferred one if it can, else the best free Academy (affordable first)
G.researchCityFor = (s, owner, id, pref) => {
  const t = DATA.techs[id];
  if (!t) return null;
  const cost = G.techCost(id, t.repeat ? G.techLevel(s, owner, id) + 1 : 1);
  const can = c => c && c.owner === owner && G.lvl(c, 'academy') >= t.ac && G.researchHostFree(s, c) > 0;
  if (can(pref) && G.canAfford(s, pref, cost)) return pref;
  const able = G.citiesOf(s, owner).filter(can).sort((a, b) => G.lvl(b, 'academy') - G.lvl(a, 'academy'));
  return able.find(c => G.canAfford(s, c, cost)) || (can(pref) ? pref : able[0]) || null;
};
G.techForOwner = (s, owner, id) => { const t = DATA.techs[id]; return !!t && (!t.race || t.race === s.empires[owner].race); };
G.techList = (s, owner) => { normalizeAll(); return Object.keys(DATA.techs).filter(id => G.techForOwner(s, owner, id)); };
G.bestAcademy = (s, owner) => G.citiesOf(s, owner).filter(c => G.lvl(c, 'academy') > 0)
  .sort((a, b) => G.lvl(b, 'academy') - G.lvl(a, 'academy') || (a.founded || 0) - (b.founded || 0))[0] || null;

// technology era 0..3: the highest era in which the realm knows ≥ 40% of the techs open to its people
G.TECH_ERA_SHARE = 0.5;   // a realm enters an era once it knows half the techniques of the era before
G.techEra = (s, owner) => {
  const e = s && s.empires && s.empires[owner];
  if (!e || !e.research || !e.research.done) return 0;
  normalizeAll();
  const tot = [0, 0, 0, 0], got = [0, 0, 0, 0];
  for (const [id, t] of Object.entries(DATA.techs)) {
    if ((t.race && t.race !== e.race) || t.repeat) continue;
    tot[t.era]++;
    if (e.research.done[id]) got[t.era]++;
  }
  let era = 0;
  for (let i = 1; i < 4; i++) { if (tot[i - 1] && got[i - 1] >= Math.ceil(tot[i - 1] * G.TECH_ERA_SHARE)) era = i; else break; }
  return era;
};
// progress toward each era (for the UI): [{ got, total, need }]
G.techEraProgress = (s, owner) => {
  normalizeAll();
  const e = s.empires[owner], R = G.research(s, owner);
  const per = [0, 1, 2, 3].map(i => {
    const ids = Object.keys(DATA.techs).filter(id => DATA.techs[id].era === i && !DATA.techs[id].repeat && (!DATA.techs[id].race || DATA.techs[id].race === e.race));
    return { got: ids.filter(id => R.done[id]).length, total: ids.length };
  });
  // need / prevGot: how many techniques of the era before are needed to enter this one, and how many are known
  return per.map((p, i) => ({ ...p, need: i ? Math.ceil(per[i - 1].total * G.TECH_ERA_SHARE) : 0, prevGot: i ? per[i - 1].got : 0 }));
};

G.techStatus = (s, cityId, id) => {
  normalizeAll();
  const city = s.cities[cityId];
  const t = DATA.techs[id];
  if (!t || !city) return { ok: false, locked: true, hidden: !t, reason: 'Unknown', cost: {}, time: 0 };
  if (t.race && t.race !== s.empires[city.owner].race) return { ok: false, hidden: true, locked: true, reason: `Only the ${DATA.races[t.race].name} know this`, cost: {}, time: 0 };
  const R = G.research(s, city.owner);
  const rep = !!t.repeat, level = levelIn(R, id), next = rep ? level + 1 : 1;
  const cost = G.techCost(id, next);
  const time = G.techTime(s, city.owner, id, city, next);
  const extra = rep ? { repeat: true, level, next } : {};
  if (R.done[id] && !rep) return { done: true, cost, time };
  const study = R.studies.find(x => x.id === id);
  if (study) return { active: true, study, cost, time, ...extra };
  if (rep && level >= G.TECH_REPEAT_MAX) return { ok: false, done: true, maxed: true, reason: 'Fully mastered', cost, time, ...extra };
  const miss = t.reqs.filter(r => !R.done[r]);
  if (miss.length) return { ok: false, locked: true, missing: miss, reason: `Needs ${miss.map(r => DATA.techs[r] ? DATA.techs[r].name : r).join(' and ')}`, cost, time, ...extra };
  if (G.lvl(city, 'academy') < t.ac) return { ok: false, locked: true, academy: true, reason: `Needs Academy ${t.ac} here`, cost, time, ...extra };
  const sl = G.researchSlots(s, city.owner);
  if (sl.free <= 0) return { ok: false, busy: true, reason: sl.total > 1 ? `All ${sl.total} study slots are busy` : 'Scholars are busy', cost, time, ...extra };
  if (G.researchHostFree(s, city) <= 0) return { ok: false, busy: true, here: true, reason: `Scholars in ${city.name} are busy: another Academy can take it`, cost, time, ...extra };
  if (!G.canAfford(s, city, cost)) return { ok: false, poor: true, reason: 'Not enough goods', cost, time, ...extra };
  return { ok: true, cost, time, ...extra };
};

G.startResearch = (s, cityId, id) => {
  const city = s.cities[cityId];
  const st = G.techStatus(s, cityId, id);
  if (!st.ok) return st.reason || 'Cannot research';
  G.pay(s, city, st.cost);
  const R = G.research(s, city.owner);
  const study = { id, city: cityId, start: s.time, end: s.time + st.time, cost: st.cost };
  if (st.repeat) study.level = st.next;
  R.studies.push(study);
  if (R.queue) { const i = R.queue.indexOf(id); if (i >= 0) R.queue.splice(i, 1); if (!st.repeat) R.queue = R.queue.filter(q => q !== id); }
  return null;
};

// cancel one study (by tech id; without an id, the first, as before): 50% of its goods come back
G.cancelResearch = (s, owner, id) => {
  const R = G.research(s, owner);
  const i = id ? R.studies.findIndex(x => x.id === id) : 0;
  const st = R.studies[i];
  if (!st) return false;
  const city = s.cities[st.city];
  if (city && city.owner === owner) G.gain(s, city, st.cost, 0.5);
  R.studies.splice(i, 1);
  return true;
};

// ---------------------------------------------------------------------
// research queue: queueing a tech also queues its missing prerequisites
// ---------------------------------------------------------------------
G.techPath = (s, owner, id) => {
  const R = G.research(s, owner), out = [], seen = {};
  const visit = k => {
    if (seen[k] || !DATA.techs[k]) return;
    if (k !== id || !DATA.techs[k].repeat) { if (R.done[k] || R.studies.some(x => x.id === k)) return; }
    seen[k] = true;
    for (const r of DATA.techs[k].reqs) visit(r);
    out.push(k);
  };
  visit(id);
  return out;
};
// The queue is unlimited. A topic may be queued once its prerequisites are known, being
// studied, or queued ahead of it; G.planResearch queues the whole missing chain. Goods are paid
// when a topic starts, so cancelling a queued topic costs nothing. Whenever a study slot is free
// the first queued topic whose prerequisites are all KNOWN (so never one whose prerequisite is
// still being studied), that is not already running, and that a free Academy can afford starts;
// this repeats until the slots are full. The others wait (R.queueWait notes why) and are retried
// every few seconds. A repeatable tech may sit in the queue several times: one entry per level.
const queueArgs = (a, b) => typeof b === 'string' ? { cityId: a, id: b } : { cityId: null, id: a };
// levels of a repeatable tech already promised: known + studying + queued
const plannedLevel = (R, id) => levelIn(R, id) + (R.studies.some(x => x.id === id) ? 1 : 0) + (R.queue || []).filter(k => k === id).length;
const queueCheck = (s, owner, id) => {
  if (!DATA.techs[id] || !G.techForOwner(s, owner, id)) return 'Not for your people';
  const R = G.research(s, owner);
  if (DATA.techs[id].repeat) return plannedLevel(R, id) >= G.TECH_REPEAT_MAX ? 'Every level is already planned' : null;
  if (R.done[id]) return 'Already known';
  if (R.studies.some(x => x.id === id)) return 'Already being studied';
  if ((R.queue || []).includes(id)) return 'Already queued';
  return null;
};
const enqueue = (s, owner, ids, cityId) => {
  const R = G.research(s, owner);
  R.queue = R.queue || [];
  R.queue.push(...ids);
  if (cityId && s.cities[cityId] && s.cities[cityId].owner === owner) {
    R.queueCity = R.queueCity || {};
    for (const k of ids) R.queueCity[k] = cityId;
  }
  G.processResearchQueue(s, owner);
  return null;
};
// G.queueResearch(s, owner, cityId, id) — one topic (prerequisites known, studied or queued);
// for a repeatable tech, one more level; the old 3-argument form (s, owner, id) plans the whole path
G.queueResearch = (s, owner, a, b) => {
  const { cityId, id } = queueArgs(a, b);
  if (typeof b !== 'string') return G.planResearch(s, owner, null, id);
  const err = queueCheck(s, owner, id);
  if (err) return err;
  const R = G.research(s, owner), q = R.queue || [];
  const miss = DATA.techs[id].reqs.filter(r => !R.done[r] && !R.studies.some(x => x.id === r) && !q.includes(r));
  if (miss.length) return `Needs ${miss.map(r => DATA.techs[r].name).join(' and ')} first (plan the path to queue them too)`;
  return enqueue(s, owner, [id], cityId);
};
// G.planResearch(s, owner, cityId, id) — the topic and every missing prerequisite, in order
G.planResearch = (s, owner, cityId, id) => {
  const err = queueCheck(s, owner, id);
  if (err) return err;
  const R = G.research(s, owner);
  const add = G.techPath(s, owner, id).filter(k => k === id && DATA.techs[k].repeat || !(R.queue || []).includes(k));
  if (add.some(k => !G.techForOwner(s, owner, k))) return 'Not for your people';
  return enqueue(s, owner, add, cityId);
};
// dropping a topic also drops queued topics that depend on it; for a repeatable tech only one
// queued level goes (the one at index `at`, else the last)
G.unqueueResearch = (s, owner, id, at) => {
  const R = G.research(s, owner);
  if (!R.queue) return;
  if (DATA.techs[id] && DATA.techs[id].repeat) {
    const i = at !== undefined && R.queue[at] === id ? +at : R.queue.lastIndexOf(id);
    if (i >= 0) R.queue.splice(i, 1);
    if (R.queueWait && R.queueWait.id === id && !R.queue.includes(id)) R.queueWait = null;
    return;
  }
  const drop = new Set([id]);
  for (const k of R.queue) if (DATA.techs[k] && DATA.techs[k].reqs.some(r => drop.has(r))) drop.add(k);
  R.queue = R.queue.filter(k => !drop.has(k));
  if (R.queueCity) for (const k of drop) delete R.queueCity[k];
  if (R.queueWait && drop.has(R.queueWait.id)) R.queueWait = null;
};
G.dequeueResearch = G.unqueueResearch;
// move a queued topic one place up (delta -1) or down (+1); never ahead of its own prerequisite
// (`at`: the queue index, for a repeatable tech queued more than once)
G.moveQueuedResearch = (s, owner, id, delta, at) => {
  const R = G.research(s, owner), q = R.queue || [];
  const i = at !== undefined && q[at] === id ? +at : q.indexOf(id), j = i + (delta < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= q.length) return 'Cannot move';
  const first = q[Math.min(i, j)], second = q[Math.max(i, j)];
  if (DATA.techs[second] && DATA.techs[second].reqs.includes(first)) return `${DATA.techs[second].name} needs ${DATA.techs[first].name}`;
  q[i] = q[j]; q[j] = id;
  return null;
};
G.processResearchQueue = (s, owner) => {
  const R = G.research(s, owner);
  if (!R.queue || !R.queue.length) { R.queueWait = null; return; }
  if (G.researchSlots(s, owner).free <= 0) { R.queueWait = null; return; }   // every slot busy: nothing is waiting on goods
  R.queue = R.queue.filter(k => DATA.techs[k] && (DATA.techs[k].repeat ? levelIn(R, k) < G.TECH_REPEAT_MAX : !R.done[k]) && G.techForOwner(s, owner, k));
  const cities = G.citiesOf(s, owner);
  let wait = null;
  for (let guard = 0; guard < G.RESEARCH_SLOT_MAX + 1; guard++) {
    if (G.researchSlots(s, owner).free <= 0) { wait = null; break; }
    let started = false;
    wait = null;
    const tried = new Set();
    for (const k of R.queue) {
      const t = DATA.techs[k];
      if (tried.has(k) || !t.reqs.every(r => R.done[r]) || R.studies.some(x => x.id === k)) continue;
      tried.add(k);
      const cost = G.techCost(k, t.repeat ? levelIn(R, k) + 1 : 1);
      const able = cities.filter(c => G.lvl(c, 'academy') >= t.ac);
      if (!able.length) { wait = wait || { id: k, reason: `Needs an Academy of level ${t.ac}` }; continue; }
      const free = able.filter(c => G.researchHostFree(s, c) > 0);
      if (!free.length) { wait = wait || { id: k, reason: 'Waiting for a free Academy' }; continue; }
      const pref = R.queueCity && s.cities[R.queueCity[k]];
      const city = (pref && free.includes(pref) && G.canAfford(s, pref, cost)) ? pref
        : free.filter(c => G.canAfford(s, c, cost)).sort((a, b) => G.lvl(b, 'academy') - G.lvl(a, 'academy'))[0];
      if (!city) { wait = wait || { id: k, reason: 'Waiting for goods' }; continue; }
      if (G.startResearch(s, city.id, k) === null) {
        if (R.queueCity && !R.queue.includes(k)) delete R.queueCity[k];
        if (owner === 'p') G.log(s, owner, `📚 From the queue, scholars in ${city.name} begin ${t.icon} ${t.name}${t.repeat ? ' (level ' + (levelIn(R, k) + 1) + ')' : ''}.`);
        started = true;
        break;
      }
    }
    if (!started) break;
  }
  R.queueWait = wait;
};
G.researchQueueNote = (s, owner) => {
  const w = G.research(s, owner).queueWait;
  return w && DATA.techs[w.id] ? `${DATA.techs[w.id].name}: ${w.reason.toLowerCase()}` : '';
};
// what the queue will do next, one entry per queued topic: { id, level (repeatables), next (starts as
// soon as a slot and goods allow, alongside the others marked next), after (the unknown prerequisite it waits for) }
G.researchQueuePlan = (s, owner) => {
  const R = G.research(s, owner), sl = G.researchSlots(s, owner);
  const running = new Set(R.studies.map(x => x.id)), seen = {};
  // free slots now, or (all busy) the topics that take over as the running ones finish
  let room = sl.free > 0 ? sl.free : sl.total;
  return (R.queue || []).map(k => {
    const t = DATA.techs[k];
    if (!t) return { id: k };
    seen[k] = (seen[k] || 0) + 1;
    const level = t.repeat ? levelIn(R, k) + (running.has(k) ? 1 : 0) + seen[k] : 0;
    const after = t.reqs.find(r => !R.done[r]) || null;
    let next = false;
    if (!after && !running.has(k) && room > 0) { next = true; room--; running.add(k); }
    return { id: k, level, next, after, busy: !after && running.has(k) && !next };
  });
};

// ---------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------
// per-empire product of every known tech's fx (memoized on the number of known techs)
const FX_CACHE = new WeakMap();
// inside a step the answer is also remembered per realm until the engine's epoch moves on (after each hook, each
// resolved move, and wherever a tech is learnt), sparing the count of known techs on every modifier lookup
const FX_STEP = new Map();
let fxEpoch = -1, fxState = null;
G.techFx = (s, owner) => {
  if (!G._modCache) return techFxRaw(s, owner);
  if (fxEpoch !== G._epoch || fxState !== s) { FX_STEP.clear(); fxEpoch = G._epoch; fxState = s; }
  const e = s.empires[owner];
  const done = e && e.research && e.research.done;
  const m = FX_STEP.get(owner);
  if (m !== undefined && m.done === done && m.race === (e && e.race)) return m.fx;
  const fx = techFxRaw(s, owner);
  FX_STEP.set(owner, { done, race: e && e.race, fx });
  return fx;
};
const techFxRaw = (s, owner) => {
  const e = s.empires[owner];
  const R = e && e.research;
  if (!R || !R.done) return null;
  const n = Object.keys(R.done).length;
  if (!n) return null;
  // levels of repeatable techs are part of the signature: a level-up changes no key count
  let lv = 0;
  for (const id of REPEAT_IDS) if (R.done[id]) lv += levelIn(R, id);
  const c = FX_CACHE.get(R.done);
  if (c && c.n === n && c.lv === lv && c.race === e.race) return c.fx;
  if (techCount !== Object.keys(DATA.techs).length) normalizeAll();
  const fx = {};
  for (const id in R.done) {
    const t = DATA.techs[id];
    if (!t || (t.race && t.race !== e.race)) continue;
    const L = t.repeat ? levelIn(R, id) : 1;
    if (!L) continue;
    for (const [k, v] of Object.entries(t.fx)) fx[k] = TECH_ADDITIVE[k] ? (fx[k] || 0) + v * L : (fx[k] || 1) * (L === 1 ? v : Math.pow(v, L));
  }
  FX_CACHE.set(R.done, { n, lv, race: e.race, fx });
  return fx;
};
G.techMult = (s, owner, key) => { const fx = G.techFx(s, owner); return (fx && fx[key]) || 1; };
G.techAdd = (s, owner, key) => { const fx = G.techFx(s, owner); return (fx && fx[key]) || 0; };

const badFx = (key, f) => (key === 'upkeep' || key.endsWith('Time') || key.endsWith('Cost')) ? f > 1 : f < 1;
G.modSources.push((s, owner, city, key) => {
  if (!hooksReady) ensureHooks();
  const fx = G.techFx(s, owner);
  if (!fx) return 1;
  let m = (!G.TECH_SPECIAL[key] && fx[key]) || 1;
  // resilience: part of a calamity's or winter's penalty is ignored
  if (city && fx.calamity && s.calamities && s.calamities.length && DATA.calamities) {
    const res = Math.min(0.6, fx.calamity);
    for (const c of s.calamities) {
      if (c.end <= s.time) continue;
      const d = DATA.calamities[c.kind];
      const f = d && d.fx && d.fx[key];
      if (!f || !badFx(key, f) || Math.hypot(c.x - city.x, c.y - city.y) > c.r) continue;
      if (d.river && !G.site(s, city).river) continue;
      m *= Math.pow(f, -res);
    }
  }
  if (fx.winter && DATA.seasonFx && G.season) {
    const se = G.season(s).index;
    const f = DATA.seasonFx[se] && DATA.seasonFx[se].fx[key];
    if (f && badFx(key, f)) {
      const k = (DATA.seasonRace && DATA.seasonRace[s.empires[owner].race] || [1, 1, 1, 1])[se];
      const eff = 1 + (f - 1) * k;
      if (eff > 0) m *= Math.pow(eff, -Math.min(0.6, fx.winter));
    }
  }
  return m;
});

// wrappers around functions of later-loading modules (installed once every module exists)
let hooksReady = false;
const WRAPPED = {};
const wrap = (name, make) => {
  if (WRAPPED[name] || typeof G[name] !== 'function') return !!WRAPPED[name];
  G[name] = make(G[name]);
  WRAPPED[name] = true;
  return true;
};
const ensureHooks = () => {
  normalizeAll();
  let all = true;
  all = wrap('happiness', orig => (s, city) => {
    const h = orig(s, city);
    let add = G.techAdd(s, city.owner, 'happy');
    const fest = G.techAdd(s, city.owner, 'festival');
    if (fest && (city.mods || []).some(m => m.label === 'Festival' && m.until > s.time)) add += fest;
    if (add && h && h.why) {
      h.why.push({ label: 'Learning & customs', value: Math.round(add) });
      h.raw = (h.raw || 0) + add;
      h.value = Math.max(0, Math.min(100, Math.round(h.raw)));
    }
    return h;
  }) && all;
  all = wrap('cultureRate', orig => (s, city) => orig(s, city) * G.techMult(s, city.owner, 'culture')) && all;
  all = wrap('faithRate', orig => (s, owner) => orig(s, owner) * G.techMult(s, owner, 'faith')) && all;
  all = wrap('routeSlots', orig => (s, city) => { const b = orig(s, city); return b > 0 ? b + Math.round(G.techAdd(s, city.owner, 'routes')) : b; }) && all;
  all = wrap('minorAddInfluence', orig => (s, mi, owner, d, ...rest) => orig(s, mi, owner, d > 0 && s.empires[owner] ? d * G.techMult(s, owner, 'influence') : d, ...rest)) && all;
  all = wrap('upgradeTime', orig => (s, city, level) => Math.max(1, Math.round(orig(s, city, level) * G.mod(s, city.owner, city, 'forgeTime')))) && all;
  hooksReady = all;
};
G.researchHooksReady = () => { ensureHooks(); return hooksReady; };

G.stepHooks.push(s => {
  if (!hooksReady) ensureHooks();
  for (const e of Object.values(s.empires)) {
    let R = e.research;
    if (!R) continue;
    if (!R.studies) { if (!R.active) continue; R = G.research(s, e.id); }   // an old save: migrate
    if (!R.studies.length) continue;
    let fin = false;
    for (let i = R.studies.length - 1; i >= 0; i--) {
      const st = R.studies[i];
      if (!(st.end <= s.time)) continue;
      R.studies.splice(i, 1);
      const t = DATA.techs[st.id];
      if (!t) continue;
      if (t.repeat) {
        const L = Math.min(G.TECH_REPEAT_MAX, levelIn(R, st.id) + 1);
        R.done[st.id] = L === 1 ? true : L;
        G.log(s, e.id, `📚 Research complete: ${t.icon} ${t.name}, level ${L}. ${G.techFxText(t.id)}`, 'good');
      } else {
        R.done[st.id] = true;
        G.log(s, e.id, `📚 Research complete: ${t.icon} ${t.name}. ${G.techFxText(t.id)}`, 'good');
      }
      fin = true;
    }
    if (fin) {
      if (G.bumpEpoch) G.bumpEpoch();
      if (R.queue && R.queue.length) G.processResearchQueue(s, e.id);
    }
  }
});
G.slowHooks.push(s => {
  for (const e of Object.values(s.empires)) {
    const R = e.research;
    if (R && R.queue && R.queue.length && !e.dead) G.processResearchQueue(s, e.id);
  }
});
G.newGameHooks.push(() => ensureHooks());

// ---------------------------------------------------------------------
// recommendations (player UI) and AI research
// ---------------------------------------------------------------------
// candidates: techs whose prerequisites are known and that the best Academy can teach
const openTechs = (s, owner, city) => {
  const R = G.research(s, owner), race = s.empires[owner].race, ac = G.lvl(city, 'academy');
  const out = [];
  for (const [id, t] of Object.entries(DATA.techs)) {
    if ((t.race && t.race !== race) || R.studies.some(x => x.id === id)) continue;
    if (t.repeat ? levelIn(R, id) >= G.TECH_REPEAT_MAX : R.done[id]) continue;
    if (!t.reqs.every(r => R.done[r])) continue;
    out.push({ id, t, gated: ac < t.ac });
  }
  return out;
};
const AI_BRANCH_W = {
  war: a => 0.5 + 1.6 * a, siege: a => 0.6 + 1.0 * a,
  agri: a => 1.5 - 0.7 * a, industry: a => 1.5 - 0.6 * a, build: a => 1.4 - 0.6 * a, commerce: a => 1.3 - 0.6 * a,
  sea: () => 0.5, arcana: () => 0.6, faith: () => 0.7, state: () => 0.6, lore: () => 0.8,
};
const RACE_BRANCH = { tide: { sea: 2.2 }, veil: { arcana: 2.2, lore: 1.3 }, delver: { industry: 1.4, siege: 1.4 }, sylvan: { agri: 1.2, lore: 1.3 }, hearth: { agri: 1.3, commerce: 1.4 }, ash: { war: 1.3 }, grave: { war: 1.2, industry: 1.2 }, wind: { lore: 1.4, war: 1.1 } };
const techWeight = (s, emp, t) => {
  const a = emp.aggr ?? 0.5;
  let w = (AI_BRANCH_W[t.branch] || (() => 1))(a) * ((RACE_BRANCH[emp.race] || {})[t.branch] || 1);
  if (t.race) w *= 2.2;
  if (t.branch === 'sea' && !G.citiesOf(s, emp.id).some(c => G.lvl(c, 'harbor') > 0)) w *= 0.3;
  if (t.branch === 'arcana' && !G.citiesOf(s, emp.id).some(c => G.lvl(c, 'magetower') > 0)) w *= 0.5;
  // mastery techs are a late sink: less attractive with every level
  if (t.repeat) w *= 0.6 / (1 + levelIn(G.research(s, emp.id), t.id));
  return w / (1 + 0.12 * t.col);
};
const nextCost = (s, owner, id) => G.techCost(id, DATA.techs[id].repeat ? G.techLevel(s, owner, id) + 1 : 1);
G.techRecommend = (s, owner, n = 3) => {
  const city = G.bestAcademy(s, owner);
  if (!city) return [];
  const emp = s.empires[owner];
  const pseudo = { ...emp, aggr: 0.35 };
  return openTechs(s, owner, city).filter(o => !o.gated)
    .map(o => ({ id: o.id, w: techWeight(s, pseudo, o.t) * (G.canAfford(s, city, nextCost(s, owner, o.id)) ? 1.6 : 1) / Math.pow(1.3, o.t.col) * (1 + 0.15 * G.techUnlocks(o.id).length) }))
    .sort((a, b) => b.w - a.w).slice(0, n).map(o => o.id);
};

// picks a topic for the best Academy that has room for another study (null when none has)
G.aiResearchPick = (s, emp) => {
  const city = G.citiesOf(s, emp.id).filter(c => G.researchHostFree(s, c) > 0)
    .sort((a, b) => G.lvl(b, 'academy') - G.lvl(a, 'academy') || (a.founded || 0) - (b.founded || 0))[0];
  if (!city) return null;
  const opts = openTechs(s, emp.id, city);
  const open = opts.filter(o => !o.gated);
  // ambitious scholars: when most of what is left needs a bigger Academy, raise it
  if (open.length < 3 && opts.some(o => o.gated) && city.buildQueue.length < G.buildSlots(city) && !city.buildQueue.some(q => q.type === 'academy') && Math.random() < 0.3) {
    const st = G.buildStatus(s, city, 'academy');
    if (st.ok) G.queueBuild(s, city.id, 'academy');
  }
  // keep a margin so research never starves construction
  const aff = open.filter(o => G.canAfford(s, city, nextCost(s, emp.id, o.id), 1.15));
  if (!aff.length) return null;
  let tot = 0;
  const ws = aff.map(o => { const w = techWeight(s, emp, o.t); tot += w; return w; });
  let r = Math.random() * tot;
  for (let i = 0; i < aff.length; i++) { r -= ws[i]; if (r <= 0) return { city, id: aff[i].id }; }
  return { city, id: aff[aff.length - 1].id };
};
// AI studies something affordable now and then, filling its free study slots one by one
G.aiHooks.push((s, emp) => {
  if (Math.random() > 0.25 || emp.saving) return;
  if (G.researchSlots(s, emp.id).free <= 0) return;
  const p = G.aiResearchPick(s, emp);
  if (p) G.startResearch(s, p.city.id, p.id);
});
