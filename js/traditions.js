// =====================================================================
//  Traditions — the cultural web. Loaded right after culture.js.
//
//  Nine pillars (Kinship, Labour, Honour, Faith, Lore, Hospitality,
//  Mystery, Land, Law) plus each people's Birthright, four ages each
//  (Roots, Customs, Heritage, Myth). Traditions are bought with culture.
//  What makes them cultural rather than technical:
//    · forks: mutually exclusive pairs (excl) — choosing one forsakes the other
//    · ethos: four axes (war, open, faith, kin) shifted by every tradition;
//      strong leanings unlock special traditions, grant a small virtue,
//      and make like-minded realms less hostile (G.hostility)
//    · ceremonies: some traditions grant a custom held on demand, with a
//      cooldown (festivals, war feasts, pilgrimages); seasonal ones are
//      offered as decisions when their season turns
//    · birthright: six traditions for each people, ending in a capstone
//    · tales: a tradition is cheaper once the realm has lived through a
//      related storylet; some need a state faith or a Mage Tower
//
//  State: empire.traditions [ids] (only appended), empire.ceremonies
//  { id: readyAt }, empire.tradTarget (AI). Ethos is derived from the
//  list, so saves need no migration.
//
//  Tradition fields: pillar, age 1-4, pre ['a|b', 'c'] (all groups, any
//  id within a group), excl (paired id), eth {axis: shift}, fx {modKey:
//  mult} through G.mod, named props (see PROPS), cer (ceremony id),
//  req {ethos:[axis, n], faith:true, tower:n}, tale (storylet id), lore.
// =====================================================================
'use strict';

(() => {
  const paceMin = (s, m) => m * 60 * G.pace(s).time;

  // -------------------------------------------------------------------
  // Pillars, ages, ethos
  // -------------------------------------------------------------------
  DATA.pillars = {
    kin:    { name: 'Kinship & Hearth',     icon: '🏡', color: '#d9822b', desc: 'Families, feasts and full cradles: growth, happiness and housing.' },
    labour: { name: 'Labour & Guilds',      icon: '⚒️', color: '#a86f3c', desc: 'Work songs, lodges and masterworks: building and workshops.' },
    honour: { name: 'Honour & War',         icon: '⚔️', color: '#b8392b', desc: 'The warrior\'s code: attack, defence and the soldier\'s lot.' },
    faith:  { name: 'Faith & Rites',        icon: '🕯️', color: '#c9a227', desc: 'Offerings, saints and pilgrimages: faith, temples and festivals.' },
    lore:   { name: 'Lore & Learning',      icon: '📜', color: '#3f6fb5', desc: 'Storytellers and scribes: research, culture and heroes.' },
    trade:  { name: 'Hospitality & Trade',  icon: '🍷', color: '#2f9a8a', desc: 'Guest-right and fair days: markets, trade routes and free cities.' },
    arcana: { name: 'Mystery & Arcana',     icon: '🔮', color: '#8a55c9', desc: 'Hedge lore and star rites: mana and spells.' },
    land:   { name: 'Land & Seasons',       icon: '🌾', color: '#5c9a3a', desc: 'Furrow, forest and the turning year: harvests, seasons and calamities.' },
    law:    { name: 'Law & Order',          icon: '⚖️', color: '#5d6b7a', desc: 'Criers, courts and the night watch: loyalty, empire size and spies.' },
    people: { name: 'Birthright',           icon: '👑', color: '#b0476e', desc: 'The customs only your people keep, ending in their Way.' },
  };
  DATA.pillarOrder = ['kin', 'labour', 'honour', 'faith', 'lore', 'trade', 'arcana', 'land', 'law', 'people'];
  DATA.traditionAges = [null,
    { name: 'Roots',    roman: 'I',   need: 0 },
    { name: 'Customs',  roman: 'II',  need: 3 },
    { name: 'Heritage', roman: 'III', need: 8 },
    { name: 'Myth',     roman: 'IV',  need: 15 },
  ];
  DATA.ethosAxes = {
    war:   { plus: 'Martial',  minus: 'Peaceful',   iconPlus: '⚔️', iconMinus: '🕊️' },
    open:  { plus: 'Open',     minus: 'Insular',    iconPlus: '🌐', iconMinus: '🏰' },
    faith: { plus: 'Pious',    minus: 'Worldly',    iconPlus: '🙏', iconMinus: '⚖️' },
    kin:   { plus: 'Communal', minus: 'Mercantile', iconPlus: '🤝', iconMinus: '💰' },
  };
  DATA.ethosOrder = ['war', 'open', 'faith', 'kin'];
  const ETHOS = G.ETHOS = { lean: 4, gate: 6, devoted: 10, hostility: 0.2 };
  // the small virtue of a devoted people (|ethos| ≥ devoted), merged into the tradition effects
  DATA.ethosVirtues = {
    'war+':   { fx: { atk: 1.03 }, weary: 0.85, text: '+3% attack; war weariness −15%' },
    'war-':   { happy: 3, text: '+3 happiness in every city' },
    'open+':  { fx: { tax: 1.04 }, routes: 1.1, text: '+4% taxes; trade routes +10% gold' },
    'open-':  { fx: { def: 1.04, counterintel: 1.15 }, text: '+4% defence; counter-espionage +15%' },
    'faith+': { faith: 1.15, happy: 1, text: '+15% faith; +1 happiness' },
    'faith-': { fx: { researchTime: 0.96 }, text: 'Research 4% faster' },
    'kin+':   { fx: { popGrowth: 1.04 }, crowd: 0.9, text: '+4% growth; crowding unrest −10%' },
    'kin-':   { fx: { tax: 1.03, market: 1.05 }, text: '+3% taxes; better market rates' },
  };

  // -------------------------------------------------------------------
  // Ceremonies: held on demand, cost goods or gold, then rest a while.
  //   mins = duration of timed effects, cool = minutes before the next.
  // -------------------------------------------------------------------
  DATA.ceremonies = {
    lanterns:    { name: 'Night of Lanterns', icon: '🏮', cool: 60, mins: 12, cost: { gold: 60 }, season: 3,
      desc: 'Every city holds a festival (+10 happiness, faster growth) for 12 minutes and the realm gains a burst of culture.' },
    hammerday:   { name: 'Day of the Hammer', icon: '🔨', cool: 75, mins: 15, cost: { grain: 120, gold: 40 },
      desc: 'Guilds down tools for a feast, then work like fiends: +20% workshop output and construction 10% faster for 15 minutes.' },
    warfeast:    { name: 'War Feast', icon: '🍖', cool: 50, mins: 12, cost: { grain: 200 },
      desc: 'Roast oxen and boasting before battle: +10% attack across the realm for 12 minutes.' },
    pilgrimage:  { name: 'Pilgrimage', icon: '🥾', cool: 70, mins: 15, cost: { gold: 50, grain: 80 }, needsFaith: true,
      desc: 'The faithful walk to the holy places: a burst of faith and +5 happiness in every city for 15 minutes.' },
    saganight:   { name: 'Saga Night', icon: '🔥', cool: 60, mins: 0, cost: { gold: 40 },
      desc: 'Old tales by the fire: your hero gains experience and the realm gains culture.' },
    fair:        { name: 'Great Fair', icon: '🎪', cool: 70, mins: 15, cost: { timber: 120, grain: 80 },
      desc: 'Stalls, jugglers and foreign coin: +15% taxes and better market rates for 15 minutes.' },
    starrite:    { name: 'Rite of Stars', icon: '🌌', cool: 80, mins: 12, cost: { gold: 70 },
      desc: 'Magi read the sky together: every city gains mana and spells are 15% stronger for 12 minutes.' },
    firstfurrow: { name: 'First Furrow', icon: '🌱', cool: 70, mins: 15, cost: { gold: 30 }, season: 0,
      desc: 'The ruler cuts the first furrow: +20% grain for 15 minutes (+35% in spring).' },
    midsummer:   { name: 'Midsummer Fires', icon: '🔥', cool: 90, mins: 15, cost: { timber: 150 }, season: 1, onlySeason: 1,
      desc: 'Bonfires on every hill (summer only): +6 happiness and +5% attack for 15 minutes, and a burst of culture.' },
    assize:      { name: 'The Great Assize', icon: '⚖️', cool: 60, mins: 10, cost: { gold: 80 },
      desc: 'Judges ride the circuit: +12 loyalty in every city, unrest decisions settled and +4 happiness for 10 minutes.' },
  };
  DATA.ceremonyOrder = Object.keys(DATA.ceremonies);

  // -------------------------------------------------------------------
  // The web. Shared pillars: ten traditions each (3 / 3 / 2 / 2 by age).
  // -------------------------------------------------------------------
  const W = {};
  const T = (id, pillar, age, name, icon, o = {}) => { W[id] = Object.assign({ name, icon, pillar, age }, o); };

  // ---- Kinship & Hearth ----
  T('hearthsongs', 'kin', 1, 'Hearth Songs', '🎵', { happy: 3, eth: { kin: 1, war: -1 }, lore: 'Every household has a song only it knows.' });
  T('kinfeasts', 'kin', 1, 'Kin Feasts', '🍲', { famine: 0.6, fx: { popGrowth: 1.04 }, eth: { kin: 2 }, tale: 'famine', lore: 'No cousin goes hungry while the pot is warm.' });
  T('lanterns', 'kin', 1, 'Night of Lanterns', '🏮', { pre: ['hearthsongs'], cer: 'lanterns', eth: { open: 1 }, lore: 'Paper lights carried to the river for the dead and the newborn.' });
  T('greatfamilies', 'kin', 2, 'Great Families', '👪', { pre: ['kinfeasts'], excl: 'openhearths', crowd: 0.75, fx: { housing: 1.05 }, eth: { kin: 2, open: -1 }, lore: 'Three generations under one roof, and proud of it.' });
  T('openhearths', 'kin', 2, 'Open Hearths', '🚪', { pre: ['kinfeasts'], happy: 2, fx: { popGrowth: 1.05 }, eth: { open: 2 }, lore: 'A stranger at the door is fed before asked his name.' });
  T('midwives', 'kin', 2, 'Wise Midwives', '👶', { pre: ['hearthsongs'], calamity: 0.85, fx: { popGrowth: 1.04 }, eth: { kin: 1 }, tale: 'plague_doctor', lore: 'They know which herb, which charm and which prayer.' });
  T('namedays', 'kin', 3, 'Name-Day Gifts', '🎁', { pre: ['lanterns'], happy: 2, festival: 1.4, eth: { kin: 1, open: 1 }, lore: 'On your name-day the whole street owes you a cake.' });
  T('commons', 'kin', 3, 'The Commons', '🫂', { pre: ['greatfamilies|openhearths|midwives'], req: { ethos: ['kin', 6] }, size: 1, happy: 2, eth: { kin: 2 }, lore: 'Field, well and oven belong to all.' });
  T('everhearth', 'kin', 4, 'The Undying Hearth', '🔥', { pre: ['namedays|midwives'], happy: 3, fx: { housing: 1.06, popGrowth: 1.04 }, eth: { kin: 1 }, lore: 'A fire lit at the founding that has never gone out.' });
  T('goldengen', 'kin', 4, 'The Golden Generation', '🌟', { pre: ['commons|namedays'], culture: 1.07, crowd: 0.6, eth: { open: 1 }, lore: 'Children raised in plenty dream larger dreams.' });

  // ---- Labour & Guilds ----
  T('worksongs', 'labour', 1, 'Work Songs', '🎶', { happy: 1, fx: { refine: 1.04 }, eth: { kin: 1 }, lore: 'Hammers keep time with the old verses.' });
  T('apprentices', 'labour', 1, 'Apprenticeships', '🧰', { fx: { buildTime: 0.95 }, eth: { kin: -1 }, lore: 'Seven years of sweeping before you touch the chisel.' });
  T('masons', 'labour', 1, 'Masons\' Lodges', '🧱', { pre: ['apprentices'], fx: { stone: 1.06 }, eth: { open: -1 }, lore: 'Their marks are on every lintel, and their secrets in none.' });
  T('freeguilds', 'labour', 2, 'Free Guilds', '🏛️', { pre: ['worksongs|apprentices'], excl: 'corvee', fx: { tax: 1.04, refine: 1.04 }, eth: { kin: -2, open: 1 }, lore: 'Masters set their own prices, and pay their own dues.' });
  T('corvee', 'labour', 2, 'Corvée Duty', '⛏️', { pre: ['worksongs|apprentices'], fx: { buildTime: 0.9 }, happy: -1, eth: { kin: 2, war: 1 }, lore: 'Every household owes the realm ten days of labour.' });
  T('masterwork', 'labour', 2, 'Masterwork Marks', '🔨', { pre: ['worksongs'], cer: 'hammerday', fx: { tools: 1.08, weapons: 1.05 }, eth: { kin: -1 }, lore: 'A maker\'s mark is a promise, and a boast.' });
  T('grandworks', 'labour', 3, 'Grand Works', '🏗️', { pre: ['masons'], fx: { buildTime: 0.93, storage: 1.1 }, eth: { kin: 1 }, lore: 'Aqueducts and granaries built to outlast their builders.' });
  T('selfreliance', 'labour', 3, 'Self-Reliance', '🪵', { pre: ['freeguilds|corvee|masterwork'], req: { ethos: ['open', -6] }, fx: { timber: 1.05, stone: 1.05, ore: 1.05 }, eth: { open: -1 }, lore: 'We need nothing from beyond the hills.' });
  T('wonderwrights', 'labour', 4, 'Wonderwrights', '🗼', { pre: ['grandworks'], fx: { buildTime: 0.92 }, culture: 1.05, eth: { open: 1 }, lore: 'Builders whose names are carved beside the kings\'.' });
  T('industry', 'labour', 4, 'Ceaseless Industry', '⚙️', { pre: ['masterwork|selfreliance'], fx: { refine: 1.07, iron: 1.06 }, eth: { kin: -1 }, lore: 'The forges sing day and night.' });

  // ---- Honour & War ----
  T('warriorcode', 'honour', 1, 'Warrior\'s Code', '🗡️', { fx: { atk: 1.03 }, eth: { war: 2 }, lore: 'Never strike the fallen; never turn your back.' });
  T('shieldoaths', 'honour', 1, 'Shield Oaths', '🛡️', { fx: { def: 1.04 }, eth: { war: 1, kin: 1 }, lore: 'Each shield guards the man to its left.' });
  T('warfeast', 'honour', 1, 'War Feasts', '🍖', { pre: ['warriorcode'], cer: 'warfeast', eth: { war: 2 }, lore: 'The night before battle, every warrior eats like a king.' });
  T('glory', 'honour', 2, 'Glory Seekers', '⭐', { pre: ['warriorcode|shieldoaths'], excl: 'mercy', fx: { carry: 1.1, heroXp: 1.1 }, eth: { war: 3 }, lore: 'Better a short life sung of than a long one forgotten.' });
  T('mercy', 'honour', 2, 'Mercy to the Fallen', '🤲', { pre: ['warriorcode|shieldoaths'], raided: 0.5, weary: 0.75, happy: 2, eth: { war: -3 }, tale: 'deserters', lore: 'The beaten foe is bound up, fed, and sent home.' });
  T('veterans', 'honour', 3, 'Veteran Bands', '🎖️', { pre: ['pageantry|glory'], fx: { trainTime: 0.92, upkeep: 0.95 }, eth: { war: 1 }, lore: 'Old soldiers teach the young the tricks that kept them alive.' });
  T('warband', 'honour', 3, 'The Warband Ethos', '🩸', { pre: ['glory|pageantry|warfeast'], req: { ethos: ['war', 6] }, fx: { atk: 1.03 }, weary: 0.75, eth: { war: 2 }, lore: 'The realm is an army that happens to farm.' });
  T('undefeated', 'honour', 4, 'The Undefeated', '🏆', { pre: ['veterans|warband'], fx: { atk: 1.03, def: 1.03 }, loyalty: 0.8, eth: { war: 1 }, lore: 'No banner of ours has ever been taken. None ever will.' });
  T('citadel', 'honour', 4, 'Citadel Doctrine', '🏰', { pre: ['veterans|mercy'], fx: { wall: 1.15, def: 1.03 }, eth: { open: -1 }, lore: 'Every town a fortress, every fortress a home.' });

  // ---- Faith & Rites ----
  T('offerings', 'faith', 1, 'Hearth Offerings', '🕯️', { faith: 1.1, happy: 1, eth: { faith: 2 }, lore: 'A little bread and salt for the gods at every meal.' });
  T('sacredcal', 'faith', 1, 'Sacred Calendar', '📅', { festival: 1.25, seasonHappy: { 2: 2 }, eth: { faith: 1, kin: 1 }, lore: 'Holy days fall where the harvest falls.' });
  T('pilgrims', 'faith', 1, 'Pilgrim Roads', '🥾', { pre: ['offerings'], cer: 'pilgrimage', eth: { faith: 1, open: 1 }, tale: 'relic', lore: 'Waystones, inns and blessed wells for those who walk.' });
  T('ancestorcult', 'faith', 2, 'Ancestor Worship', '🗿', { pre: ['offerings|sacredcal'], excl: 'livingsaints', loyalty: 0.75, temple: 1.2, eth: { faith: 2, open: -1 }, lore: 'The dead are asked before anything is decided.' });
  T('livingsaints', 'faith', 2, 'Living Saints', '😇', { pre: ['offerings|sacredcal'], heroHappy: 4, faith: 1.12, eth: { faith: 2, open: 1 }, lore: 'Holiness walks among us, barefoot.' });
  T('choirs', 'faith', 2, 'Temple Choirs', '⛩️', { pre: ['sacredcal'], temple: 1.2, happy: 1, eth: { faith: 1 }, lore: 'A hundred voices under one roof.' });
  T('miraclekeepers', 'faith', 3, 'Keepers of Miracles', '✨', { pre: ['ancestorcult|livingsaints|pilgrims'], faith: 1.12, calamity: 0.8, eth: { faith: 1 }, tale: 'miracle', lore: 'Every wonder written down, every relic guarded.' });
  T('theocracy', 'faith', 3, 'Theocracy', '⛪', { pre: ['choirs|ancestorcult|livingsaints'], req: { ethos: ['faith', 6], faith: true }, faith: 1.15, loyalty: 0.8, culture: 1.05, eth: { faith: 2 }, lore: 'The high priest wears the crown, or holds it.' });
  T('mandate', 'faith', 4, 'Divine Mandate', '👑', { pre: ['theocracy|miraclekeepers'], happy: 2, faith: 1.1, size: 0.5, eth: { faith: 1 }, lore: 'The gods chose this realm. Who would argue with the gods?' });
  T('eternalrite', 'faith', 4, 'The Eternal Rite', '🔆', { pre: ['miraclekeepers|choirs'], temple: 1.25, culture: 1.04, eth: { faith: 1, kin: 1 }, lore: 'A prayer begun at the founding, passed from mouth to mouth, never finished.' });

  // ---- Lore & Learning ----
  T('storytellers', 'lore', 1, 'Storytellers', '📖', { culture: 1.06, eth: { open: 1 }, lore: 'Every village has one, and every one lies beautifully.' });
  T('scribes', 'lore', 1, 'Scribes\' Guild', '✍️', { fx: { researchTime: 0.97 }, eth: { faith: -1 }, lore: 'Ink-stained fingers, sharp eyes, sharper tongues.' });
  T('saganights', 'lore', 1, 'Saga Nights', '🔥', { pre: ['storytellers'], cer: 'saganight', eth: { kin: 1, war: 1 }, lore: 'The longest night is for the longest tale.' });
  T('oraltradition', 'lore', 2, 'Oral Tradition', '🗣️', { pre: ['storytellers|scribes'], excl: 'writtencanon', culture: 1.06, happy: 1, eth: { kin: 1, open: -1 }, lore: 'What is written can be burned. What is sung lives.' });
  T('writtencanon', 'lore', 2, 'Written Canon', '📚', { pre: ['storytellers|scribes'], fx: { researchTime: 0.95 }, eth: { open: 1, faith: -1 }, lore: 'One true copy of everything, chained in the library.' });
  T('heroicverse', 'lore', 3, 'Heroic Verse', '🎻', { pre: ['saganights'], fx: { heroXp: 1.2 }, heroHappy: 3, eth: { war: 1 }, tale: 'dragon_egg', lore: 'Your hero\'s deeds sung in every hall, slightly improved.' });
  T('freeinquiry', 'lore', 3, 'Free Inquiry', '🔭', { pre: ['patronage|writtencanon|oraltradition'], req: { ethos: ['open', 6] }, fx: { researchTime: 0.95 }, eth: { open: 1, faith: -1 }, tale: 'heretic', lore: 'Any question may be asked, even of the gods.' });
  T('chroniclers', 'lore', 4, 'Royal Chroniclers', '🪶', { pre: ['heroicverse|patronage'], culture: 1.07, eth: { faith: -1 }, lore: 'The realm\'s story, written while it happens.' });
  T('greatacademy', 'lore', 4, 'The Great Academy', '🎓', { pre: ['freeinquiry|writtencanon|patronage'], fx: { researchTime: 0.94, vision: 1.08 }, eth: { open: 1 }, lore: 'Scholars of every people argue in its courtyards.' });

  // ---- Hospitality & Trade ----
  T('guestright', 'trade', 1, 'Guest Right', '🍷', { envoy: 0.08, happy: 1, eth: { open: 2, war: -1 }, lore: 'Bread and salt shared make even an enemy safe for a night.' });
  T('fairdays', 'trade', 1, 'Fair Days', '🎪', { pre: ['tongue'], cer: 'fair', eth: { kin: -1, open: 1 }, lore: 'Once a season the market spills into every street.' });
  T('opengates', 'trade', 2, 'Open Gates', '🌐', { pre: ['guestright|tongue'], excl: 'closedgates', routes: 1.15, fx: { caravan: 1.15 }, eth: { open: 3 }, lore: 'Our gates stand open from dawn to dusk, and often after.' });
  T('closedgates', 'trade', 2, 'Closed Gates', '🏰', { pre: ['guestright|tongue'], fx: { counterintel: 1.2, def: 1.03 }, eth: { open: -3 }, lore: 'Strangers state their business at the wall.' });
  T('caravanserai', 'trade', 2, 'Caravanserais', '🐪', { pre: ['fairdays'], fx: { caravan: 1.15, market: 1.08 }, eth: { kin: -1 }, lore: 'Wells and walls every day\'s ride along the roads.' });
  T('envoys', 'trade', 3, 'Envoys and Gifts', '🎁', { pre: ['guestright'], envoy: 0.15, routes: 1.08, eth: { open: 1, war: -1 }, lore: 'A gift sent today is a friend tomorrow.' });
  T('merchantprinces', 'trade', 3, 'Merchant Princes', '💰', { pre: ['caravanserai|opengates|closedgates'], req: { ethos: ['kin', -6] }, fx: { tax: 1.05 }, routes: 1.12, eth: { kin: -2 }, lore: 'The richest houses sit on the council, and pay for its wars.' });
  T('crossroads', 'trade', 4, 'Crossroads of the World', '🧭', { pre: ['merchantprinces|caravanserai|opengates'], routes: 1.12, fx: { market: 1.08 }, culture: 1.04, eth: { open: 1 }, lore: 'Every road in the world passes through our markets.' });
  T('concord', 'trade', 4, 'The Grand Concord', '🕊️', { pre: ['envoys'], envoy: 0.2, calm: 0.85, happy: 1, eth: { war: -2, open: 1 }, lore: 'A table round enough for every realm.' });

  // ---- Mystery & Arcana ----
  T('hedgelore', 'arcana', 1, 'Hedge Lore', '🌿', { fx: { mana: 1.08 }, eth: { faith: -1 }, lore: 'Grandmother\'s charms, mostly harmless.' });
  T('starsigns', 'arcana', 1, 'Star Signs', '✨', { fx: { spellCost: 0.95, vision: 1.04 }, eth: { faith: 1 }, lore: 'No child is named until the sky is read.' });
  T('starrite', 'arcana', 1, 'Rite of Stars', '🌌', { pre: ['hedgelore|starsigns'], cer: 'starrite', eth: { faith: 1 }, tale: 'comet', lore: 'On clear nights the magi climb the towers together.' });
  T('wildmagic', 'arcana', 2, 'Embrace the Wild', '🌀', { pre: ['hedgelore'], excl: 'wardedweave', fx: { spellPower: 1.08, mana: 1.05 }, calamity: 1.1, eth: { open: 1 }, tale: 'wild_apprentice', lore: 'Magic is a storm. Dance in it.' });
  T('wardedweave', 'arcana', 2, 'Warded Weave', '🛡️', { pre: ['starsigns|hedgelore'], fx: { spellCost: 0.92 }, calamity: 0.85, eth: { open: -1 }, lore: 'Every spell bound, measured and signed for.' });
  T('magicircle', 'arcana', 2, 'Circle of Magi', '🔮', { pre: ['starsigns'], req: { tower: 1 }, fx: { mana: 1.08, studyTime: 0.9 }, eth: { open: -1 }, lore: 'Twelve chairs around a table of moonstone.' });
  T('leywalkers', 'arcana', 3, 'Ley Walkers', '〰️', { pre: ['magicircle|starrite'], fx: { mana: 1.08, travel: 1.03 }, eth: { open: 1 }, lore: 'They follow lines no one else can see.' });
  T('rationalmagic', 'arcana', 3, 'Arcane Rationalism', '🧪', { pre: ['wildmagic|wardedweave|magicircle'], req: { ethos: ['faith', -6] }, fx: { spellCost: 0.92, researchTime: 0.97 }, eth: { faith: -2 }, lore: 'Magic is a craft, not a gift. It can be taught.' });
  T('archmagi', 'arcana', 4, 'The Archmagi', '🧙', { pre: ['leywalkers|rationalmagic'], req: { tower: 5 }, fx: { spellPower: 1.1, spellCost: 0.92 }, eth: { faith: -1 }, lore: 'Seven who could unmake a city, and choose not to.' });
  T('weavekeepers', 'arcana', 4, 'Keepers of the Weave', '🕸️', { pre: ['leywalkers|wardedweave'], fx: { mana: 1.1 }, calamity: 0.8, eth: { faith: 1 }, lore: 'They mend the world where spells have torn it.' });

  // ---- Land & Seasons ----
  T('firstfurrow', 'land', 1, 'First Furrow', '🌱', { cer: 'firstfurrow', seasonFx: { 0: { popGrowth: 1.05 } }, eth: { faith: 1, kin: 1 }, lore: 'The ruler\'s own hand on the plough each spring.' });
  T('woodwise', 'land', 1, 'Woodwise', '🪓', { fx: { timber: 1.06 }, eth: { open: -1 }, lore: 'Take one tree, plant two.' });
  T('hillfolk', 'land', 1, 'Hill Lore', '⛰️', { fx: { stone: 1.04, ore: 1.04 }, eth: { war: 1 }, lore: 'Every crag has a name and a story.' });
  T('winterhearths', 'land', 2, 'Winter Hearths', '❄️', { pre: ['firstfurrow|woodwise'], seasonFx: { 3: { grain: 1.15, popGrowth: 1.1, upkeep: 0.9 } }, seasonHappy: { 3: 3 }, eth: { kin: 1 }, lore: 'The long nights are for stories, mending and mulled ale.' });
  T('tamewild', 'land', 2, 'Tame the Wild', '🪚', { pre: ['woodwise|hillfolk'], excl: 'livewithland', fx: { timber: 1.06, stone: 1.06 }, calamity: 1.1, eth: { faith: -2 }, lore: 'Drain the marsh, fell the wood, master the land.' });
  T('livewithland', 'land', 2, 'Live with the Land', '🍃', { pre: ['woodwise|firstfurrow'], calamity: 0.7, happy: 2, fx: { grain: 1.03 }, eth: { faith: 1, war: -1 }, lore: 'The land was here first. Ask before you take.' });
  T('weatherwise', 'land', 3, 'Weatherwise', '🌦️', { pre: ['winterhearths|livewithland|tamewild'], calamity: 0.8, seasonFx: { 1: { grain: 1.06 } }, eth: { kin: 1 }, lore: 'Old knees and red skies: we always know.' });
  T('midsummer', 'land', 3, 'Midsummer Fires', '☀️', { pre: ['firstfurrow|hillfolk'], cer: 'midsummer', seasonFx: { 1: { travel: 1.05 } }, eth: { war: 1, faith: 1 }, lore: 'Leap the fire and the year is yours.' });
  T('greatharvest', 'land', 4, 'The Great Harvest', '🌾', { pre: ['weatherwise|midsummer'], fx: { grain: 1.06 }, seasonFx: { 2: { tax: 1.08, popGrowth: 1.08 } }, eth: { kin: 1 }, lore: 'Granaries so full the rats grow fat and lazy.' });
  T('yearmasters', 'land', 4, 'Masters of the Year', '🗓️', { pre: ['weatherwise|winterhearths'], seasonFx: { 3: { travel: 1.15, grain: 1.1 } }, seasonHappy: { 0: 1, 1: 1, 2: 1, 3: 1 }, eth: { open: 1 }, lore: 'No season takes us by surprise.' });

  // ---- Law & Order ----
  T('watch', 'law', 1, 'Night Watch', '🏮', { fx: { counterintel: 1.1 }, loyalty: 0.9, eth: { open: -1, war: 1 }, lore: 'Twelve o\'clock and all\'s well.' });
  T('assize', 'law', 1, 'The Assize', '⚖️', { pre: ['criers'], cer: 'assize', eth: { kin: 1 }, lore: 'Justice rides from town to town on a grey horse.' });
  T('magistrates', 'law', 2, 'Magistrates', '📜', { pre: ['criers|watch'], size: 0.5, fx: { tax: 1.03 }, eth: { kin: -1 }, lore: 'A judge in every town, paid well enough to stay honest.' });
  T('ironlaw', 'law', 2, 'Iron Law', '⛓️', { pre: ['watch|criers'], excl: 'mercylaw', loyalty: 0.6, happy: -2, fx: { spy: 1.05 }, eth: { war: 1, open: -1 }, lore: 'The same rope for lord and thief.' });
  T('mercylaw', 'law', 2, 'Laws of Mercy', '🕊️', { pre: ['criers|watch'], happy: 2, placate: 0.7, eth: { war: -2, kin: 1 }, lore: 'A first crime forgiven; a second, mended.' });
  T('shadowministry', 'law', 3, 'Shadow Ministry', '🕵️', { pre: ['watch|ironlaw'], fx: { spy: 1.12, counterintel: 1.1 }, eth: { open: -1 }, tale: 'double_agent', lore: 'It does not exist, and it knows what you did.' });
  T('codex', 'law', 3, 'The Codex', '📕', { pre: ['magistrates|mercylaw|ironlaw'], size: 0.5, loyalty: 0.85, eth: { faith: -1 }, lore: 'Every law written down, in plain words, in every square.' });
  T('imperium', 'law', 4, 'Imperial Edicts', '🏛️', { pre: ['codex|shadowministry'], size: 1, fx: { tax: 1.03 }, eth: { war: 1 }, tale: 'succession', lore: 'One law, one coin, one road from sea to mountain.' });
  T('pax', 'law', 4, 'The Long Peace', '☮️', { pre: ['mercylaw|codex|magistrates'], req: { ethos: ['war', -6] }, happy: 3, weary: 0.6, calm: 0.85, eth: { war: -2 }, lore: 'Three generations who have never seen a sack.' });

  // ---- Birthright: two more for each people (their Way is the capstone) ----
  T('piefairs', 'people', 3, 'Pie Fairs', '🥧', { race: 'hearth', tier: 3, pre: ['guilds|greens'], bread: 3, happy: 2, fx: { grain: 1.05 }, eth: { kin: 1, open: 1 }, tale: 'hearth_millers', lore: 'The prize pie is judged by a council of grandmothers.' });
  T('wayhearth', 'people', 4, 'Way of the Hearth', '🏡', { race: 'hearth', tier: 4, pre: ['hearthoath|piefairs'], happy: 3, size: 0.5, fx: { popGrowth: 1.06, housing: 1.06 }, eth: { kin: 2 }, lore: 'Small doors, round windows, and a kettle always on.' });
  T('runelore', 'people', 3, 'Rune Lore', '🔷', { race: 'delver', tier: 3, pre: ['deepforge|sagas'], fx: { wall: 1.15, storage: 1.1 }, eth: { open: -1 }, tale: 'delver_vein', lore: 'Every stone remembers the rune cut into it.' });
  T('waydeep', 'people', 4, 'Way of the Deep', '⛏️', { race: 'delver', tier: 4, pre: ['oathhold|runelore'], fx: { ore: 1.08, refine: 1.06, def: 1.04 }, calamity: 0.75, eth: { open: -1, kin: 1 }, lore: 'Deeper, always deeper, and never alone.' });
  T('wildwardens', 'people', 3, 'Wardens of the Wild', '🦌', { race: 'sylvan', tier: 3, pre: ['revels|starwatch'], fx: { vision: 1.1, timber: 1.06 }, calamity: 0.8, eth: { faith: 1 }, tale: 'sylvan_stag', lore: 'The forest has eyes, and they are ours.' });
  T('waygrove', 'people', 4, 'Way of the Grove', '🌳', { race: 'sylvan', tier: 4, pre: ['eldertree|wildwardens'], culture: 1.06, happy: 3, fx: { popGrowth: 1.05, researchTime: 0.96 }, eth: { faith: 1, war: -1 }, lore: 'A thousand years is a long afternoon to a tree.' });
  T('trialfire', 'people', 3, 'Trial by Fire', '🔥', { race: 'ash', tier: 3, pre: ['spoils|emberrite'], fx: { trainTime: 0.92, heroXp: 1.15 }, eth: { war: 2 }, tale: 'ash_challenge', lore: 'Walk the coals; come out a warrior or not at all.' });
  T('wayember', 'people', 4, 'Way of the Ember', '🌋', { race: 'ash', tier: 4, pre: ['warchant|trialfire'], fx: { carry: 1.12, trainTime: 0.95 }, weary: 0.6, raided: 0.7, eth: { war: 2 }, lore: 'Burn bright, burn hot, and leave only ash.' });
  T('tidecallers', 'people', 3, 'Tidecallers', '🐚', { race: 'tide', tier: 3, pre: ['shipwright|pearldivers'], fx: { fishing: 1.15, shipSpeed: 1.08 }, eth: { open: 1 }, tale: 'tide_bell', lore: 'They sing, and the sea answers.' });
  T('waytide', 'people', 4, 'Way of the Tide', '🌊', { race: 'tide', tier: 4, pre: ['deepsong|tidecallers'], routes: 1.2, fx: { tax: 1.05, shipCost: 0.9 }, eth: { open: 2 }, lore: 'Everything comes back with the tide.' });
  T('glamourcourts', 'people', 3, 'Glamour Courts', '✨', { race: 'veil', tier: 3, pre: ['mirrorhall|dreamweft'], fx: { spellCost: 0.92, counterintel: 1.12 }, eth: { open: -1 }, tale: 'veil_mirror', lore: 'Nobody at court wears their own face.' });
  T('wayveil', 'people', 4, 'Way of the Veil', '🌙', { race: 'veil', tier: 4, pre: ['twilight|glamourcourts'], fx: { spellPower: 1.08, mana: 1.1 }, happy: 3, eth: { faith: 1, open: -1 }, lore: 'Between waking and dream there is a country, and we rule it.' });
  T('ossuarychoir', 'people', 3, 'Ossuary Choirs', '🦴', { race: 'grave', tier: 3, pre: ['deathless|procession'], fx: { raise: 1.15 }, loyalty: 0.8, eth: { faith: 1 }, tale: 'grave_candles', lore: 'The bones sing the low notes.' });
  T('waygrave', 'people', 4, 'Way of the Grave', '⚰️', { race: 'grave', tier: 4, pre: ['palecrown|ossuarychoir'], fx: { def: 1.04, upkeep: 0.92, raise: 1.1 }, calamity: 0.75, eth: { faith: 1, kin: 1 }, lore: 'Death is a door, and we keep the key.' });
  T('stormriders', 'people', 3, 'Storm Riders', '⚡', { race: 'wind', tier: 3, pre: ['galeroads|glasswright'], fx: { travel: 1.06, vision: 1.08 }, eth: { war: 1, open: 1 }, tale: 'wind_nest', lore: 'They ride the front of the storm, laughing.' });
  T('waywind', 'people', 4, 'Way of the Wind', '🪶', { race: 'wind', tier: 4, pre: ['highnest|stormriders'], fx: { atk: 1.03, travel: 1.05, carry: 1.1, popGrowth: 1.04 }, eth: { open: 1, war: 1 }, lore: 'The sky has no borders.' });

  // -------------------------------------------------------------------
  // The original traditions (culture.js and races2.js ids), placed in the web.
  // Their effects are unchanged; each gains a pillar, age, prerequisites and ethos.
  // -------------------------------------------------------------------
  const LEGACY = {
    criers:    { name: 'Town Criers', icon: '📣', tier: 1, happy: 4, desc: '+4 happiness in every city.' },
    tongue:    { name: 'Common Tongue', icon: '🗣️', tier: 1, size: 1, fx: { tax: 1.05 }, desc: 'Empire-size unrest −1 per extra city; +5% taxes.' },
    patronage: { name: 'Patronage of the Arts', icon: '🎨', tier: 2, culture: 1.3, fx: { researchTime: 0.9 }, desc: '+30% culture; research 10% faster.' },
    pageantry: { name: 'Martial Pageantry', icon: '🎖️', tier: 2, weary: 0.5, fx: { def: 1.05 }, desc: 'War weariness halved; +5% defense.' },
    harvest:   { name: 'Harvest Festivals', icon: '🌾', race: 'hearth', tier: 1, bread: 5, fx: { grain: 1.1 }, desc: '+10% grain; bread lifts happiness by a further +5.' },
    guilds:    { name: 'Guild Charters', icon: '📜', race: 'hearth', tier: 2, fx: { tax: 1.1, refine: 1.1 }, desc: '+10% taxes and refining.' },
    greens:    { name: 'Village Greens', icon: '🌳', race: 'hearth', tier: 2, crowd: 0.5, fx: { housing: 1.1 }, desc: 'Crowding unrest halved; +10% housing.' },
    hearthoath:{ name: 'Hearthfire Oaths', icon: '🔥', race: 'hearth', tier: 3, happy: 5, loyalty: 0.5, fx: { popGrowth: 1.15 }, desc: '+5 happiness, +15% growth; unrest erodes loyalty half as fast.' },
    ancestors: { name: 'Ancestor Halls', icon: '🗿', race: 'delver', tier: 1, happy: 5, temple: 1.5, desc: '+5 happiness; Temples make 50% more culture.' },
    deepforge: { name: 'Deep Forges', icon: '⚒️', race: 'delver', tier: 2, fx: { refine: 1.1, ore: 1.1 }, desc: '+10% ore and refining.' },
    sagas:     { name: 'Stone Sagas', icon: '🪨', race: 'delver', tier: 2, fx: { storage: 1.15, buildTime: 0.9 }, desc: '+15% storage; construction 10% faster.' },
    oathhold:  { name: 'Oathbound Holds', icon: '🛡️', race: 'delver', tier: 3, loyalty: 0.5, size: 1, fx: { def: 1.1 }, desc: '+10% defense; empire-size unrest −1 per extra city; unrest erodes loyalty half as fast.' },
    grovesong: { name: 'Song of the Grove', icon: '🎶', race: 'sylvan', tier: 1, happy: 5, fx: { timber: 1.1 }, desc: '+5 happiness, +10% timber.' },
    revels:    { name: 'Moonlit Revels', icon: '🌙', race: 'sylvan', tier: 2, festival: 2, amenity: 1.3, desc: 'Taverns, Temples and Theatres give 30% more happiness; festivals twice as joyful.' },
    starwatch: { name: 'Starwatchers', icon: '🔭', race: 'sylvan', tier: 2, fx: { researchTime: 0.85, vision: 1.15 }, desc: 'Research 15% faster; +15% vision.' },
    eldertree: { name: 'The Elder Tree', icon: '🌲', race: 'sylvan', tier: 3, culture: 1.25, crowd: 0.5, fx: { popGrowth: 1.1 }, desc: '+25% culture, +10% growth; crowding unrest halved.' },
    bloodfeast:{ name: 'Blood Feasts', icon: '🍖', race: 'ash', tier: 1, weary: 0.5, fx: { atk: 1.05 }, desc: 'War weariness halved; +5% attack.' },
    spoils:    { name: 'Spoils of the Steppe', icon: '💰', race: 'ash', tier: 2, raided: 0.5, fx: { carry: 1.2, tax: 1.05 }, desc: '+20% plunder carried, +5% taxes; raids on our towns upset people half as much.' },
    emberrite: { name: 'Ember Rites', icon: '🕯️', race: 'ash', tier: 2, happy: 5, fx: { trainTime: 0.9 }, desc: '+5 happiness; training 10% faster.' },
    warchant:  { name: 'War Chants', icon: '🥁', race: 'ash', tier: 3, fx: { atk: 1.1, upkeep: 0.9 }, desc: '+10% attack; troops eat 10% less.' },
  };
  const PLACE = {
    criers:    { pillar: 'law', age: 1, eth: { kin: 1, open: 1 }, lore: 'Hear ye! The news of the realm, shouted from every square.' },
    tongue:    { pillar: 'trade', age: 1, eth: { open: 2 }, lore: 'One language for the market, whatever you speak at home.' },
    patronage: { pillar: 'lore', age: 2, pre: ['storytellers|scribes'], eth: { open: 1, kin: -1 }, lore: 'Painters and poets at the ruler\'s table.' },
    pageantry: { pillar: 'honour', age: 2, pre: ['shieldoaths|warriorcode'], eth: { war: 2 }, lore: 'Banners, drums and polished helms on every feast day.' },
    // birthright: tier 1 roots, tier 2 after the root, tier 3 after either tier 2
    harvest: { eth: { kin: 1, faith: 1 } }, guilds: { pre: ['harvest'], eth: { kin: -1 } }, greens: { pre: ['harvest'], eth: { kin: 1 } }, hearthoath: { pre: ['guilds|greens'], eth: { kin: 1, war: -1 } },
    ancestors: { eth: { faith: 1, open: -1 } }, deepforge: { pre: ['ancestors'], eth: { kin: -1 } }, sagas: { pre: ['ancestors'], eth: { open: -1 } }, oathhold: { pre: ['deepforge|sagas'], eth: { war: 1 } },
    grovesong: { eth: { faith: 1, war: -1 } }, revels: { pre: ['grovesong'], eth: { open: 1 } }, starwatch: { pre: ['grovesong'], eth: { faith: -1 } }, eldertree: { pre: ['revels|starwatch'], eth: { faith: 1 } },
    bloodfeast: { eth: { war: 2 } }, spoils: { pre: ['bloodfeast'], eth: { war: 1, kin: -1 } }, emberrite: { pre: ['bloodfeast'], eth: { faith: 1 } }, warchant: { pre: ['spoils|emberrite'], eth: { war: 2 } },
    tidefest: { eth: { open: 1, kin: 1 } }, shipwright: { pre: ['tidefest'], eth: { open: 1 } }, pearldivers: { pre: ['tidefest'], eth: { kin: -1 } }, deepsong: { pre: ['shipwright|pearldivers'], eth: { faith: 1 } },
    moonrites: { eth: { faith: 1 } }, mirrorhall: { pre: ['moonrites'], eth: { open: -1 } }, dreamweft: { pre: ['moonrites'], eth: { kin: -1 } }, twilight: { pre: ['mirrorhall|dreamweft'], eth: { open: -1 } },
    bonerites: { eth: { faith: 1 } }, deathless: { pre: ['bonerites'], eth: { war: 2 } }, procession: { pre: ['bonerites'], eth: { faith: 1, war: -1 } }, palecrown: { pre: ['deathless|procession'], eth: { kin: 1 } },
    skywatch: { eth: { open: 1 } }, galeroads: { pre: ['skywatch'], eth: { war: 1 } }, glasswright: { pre: ['skywatch'], eth: { kin: -1 } }, highnest: { pre: ['galeroads|glasswright'], eth: { kin: 1 } },
  };
  // races2.js declared its peoples' traditions before this file ran; keep them, add ours
  G.TRAD_LEGACY = [...Object.keys(LEGACY), ...Object.keys(DATA.traditions || {})];
  DATA.traditions = Object.assign({}, LEGACY, DATA.traditions || {}, W);
  for (const [id, p] of Object.entries(PLACE)) if (DATA.traditions[id]) Object.assign(DATA.traditions[id], p);
  for (const [id, t] of Object.entries(DATA.traditions)) {
    t.id = id;
    if (t.race) { t.pillar = 'people'; if (!t.age) t.age = t.tier || 1; }
    t.pillar = t.pillar || 'law';
    t.age = t.age || t.tier || 1;
    t.tier = t.tier || t.age;
    t.pre = (t.pre || []).map(g => (Array.isArray(g) ? g : String(g).split('|')));
    t.eth = t.eth || {};
  }
  // forks are declared once; mirror them
  for (const [id, t] of Object.entries(DATA.traditions)) if (t.excl && DATA.traditions[t.excl]) DATA.traditions[t.excl].excl = id;
  DATA.traditionOrder = Object.keys(DATA.traditions).sort((a, b) => {
    const A = DATA.traditions[a], B = DATA.traditions[b];
    return DATA.pillarOrder.indexOf(A.pillar) - DATA.pillarOrder.indexOf(B.pillar) || A.age - B.age;
  });

  // every key a tradition may carry, and every G.mod key its fx may name
  G.TRAD_PROPS = {
    happy: 'add', size: 'add', bread: 'add', heroHappy: 'add', envoy: 'add',
    culture: 'mul', weary: 'mul', crowd: 'mul', loyalty: 'mul', temple: 'mul', festival: 'mul', amenity: 'mul', raided: 'mul',
    calamity: 'mul', famine: 'mul', placate: 'mul', faith: 'mul', routes: 'mul', calm: 'mul',
  };
  G.TRAD_MOD_KEYS = new Set(['refine', 'tax', 'popGrowth', 'housing', 'storage', 'buildTime', 'trainTime', 'researchTime', 'travel',
    'atk', 'def', 'wall', 'carry', 'vision', 'caravan', 'upkeep', 'market', 'protect', 'unitCost', 'shipCost', 'shipSpeed', 'fishing',
    'mana', 'spellPower', 'spellCost', 'studyTime', 'raise', 'heroXp', 'spy', 'counterintel', 'spyTravel', ...Object.keys(DATA.goods)]);

  // -------------------------------------------------------------------
  // Plain-words descriptions
  // -------------------------------------------------------------------
  const KEY_WORDS = {
    refine: 'workshop output', tax: 'taxes', popGrowth: 'growth', housing: 'housing', storage: 'storage', travel: 'march speed',
    atk: 'attack', def: 'defence', wall: 'wall strength', carry: 'plunder carried', vision: 'vision', caravan: 'caravan capacity',
    market: 'market rates', protect: 'hidden stores', fishing: 'Harbor fishing', mana: 'mana', spellPower: 'spell strength',
    raise: 'dead raised', heroXp: 'hero experience', spy: 'spy skill', counterintel: 'counter-espionage', spyTravel: 'spy speed', shipSpeed: 'ship speed',
  };
  const FASTER = { buildTime: 'construction', trainTime: 'training', researchTime: 'research', studyTime: 'Grimoire study' };
  const CHEAPER = { upkeep: 'troop upkeep', unitCost: 'unit costs', shipCost: 'ship costs', spellCost: 'spell costs' };
  const pct = m => Math.round(Math.abs(m - 1) * 100);
  const fxWords = (key, m) => {
    if (FASTER[key]) return `${FASTER[key][0].toUpperCase() + FASTER[key].slice(1)} ${pct(m)}% ${m < 1 ? 'faster' : 'slower'}`;
    if (CHEAPER[key]) return `${CHEAPER[key][0].toUpperCase() + CHEAPER[key].slice(1)} ${m < 1 ? '−' : '+'}${pct(m)}%`;
    const w = KEY_WORDS[key] || (DATA.goods[key] ? DATA.goods[key].name.toLowerCase() : key);
    return `${m >= 1 ? '+' : '−'}${pct(m)}% ${w}`;
  };
  const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
  G.traditionEffects = (t) => {
    const out = [];
    for (const [k, v] of Object.entries(t.fx || {})) out.push(fxWords(k, v));
    if (t.happy) out.push(`${t.happy > 0 ? '+' : '−'}${Math.abs(t.happy)} happiness in every city`);
    if (t.size) out.push(`Empire-size unrest −${t.size} per extra city`);
    if (t.culture) out.push(`+${pct(t.culture)}% culture`);
    if (t.bread) out.push(`Fresh bread +${t.bread} happiness`);
    if (t.heroHappy) out.push(`Hero in residence +${t.heroHappy} happiness`);
    if (t.weary) out.push(`War weariness −${pct(t.weary)}%`);
    if (t.crowd) out.push(`Crowding unrest −${pct(t.crowd)}%`);
    if (t.loyalty) out.push(`Unrest erodes loyalty ${pct(t.loyalty)}% slower`);
    if (t.temple) out.push(`Temples make ${pct(t.temple)}% more culture`);
    if (t.festival) out.push(`Festivals ${t.festival >= 2 ? 'twice' : pct(t.festival) + '%'} ${t.festival >= 2 ? 'as joyful' : 'more joyful'}`);
    if (t.amenity) out.push(`Taverns, Temples and Theatres +${pct(t.amenity)}% happiness`);
    if (t.raided) out.push(`Raids on our towns upset people ${pct(t.raided)}% less`);
    if (t.calamity) out.push(t.calamity < 1 ? `Calamities upset people ${pct(t.calamity)}% less` : `Calamities upset people ${pct(t.calamity)}% more`);
    if (t.famine) out.push(`Famine unrest −${pct(t.famine)}%`);
    if (t.placate) out.push(`Placating costs ${pct(t.placate)}% less`);
    if (t.faith) out.push(`+${pct(t.faith)}% faith`);
    if (t.routes) out.push(`Trade routes +${pct(t.routes)}% gold`);
    if (t.envoy) out.push(`+${t.envoy} influence per minute with every free city that knows you`);
    if (t.calm) out.push(`Rival realms ${pct(t.calm)}% less eager to attack you`);
    for (const [i, fx] of Object.entries(t.seasonFx || {})) out.push(`In ${SEASON_NAMES[i]}: ${Object.entries(fx).map(([k, v]) => fxWords(k, v).replace(/^./, c => c.toLowerCase())).join(', ')}`);
    const sh = Object.entries(t.seasonHappy || {});
    if (sh.length === 4) out.push(`+${sh[0][1]} happiness in every season`);
    else for (const [i, v] of sh) out.push(`+${v} happiness in ${SEASON_NAMES[i]}`);
    if (t.cer) out.push(`Grants the ceremony ${DATA.ceremonies[t.cer].icon} ${DATA.ceremonies[t.cer].name}`);
    return out;
  };
  for (const t of Object.values(DATA.traditions)) if (!t.desc) t.desc = G.traditionEffects(t).join('; ') + '.';

  // -------------------------------------------------------------------
  // Aggregated effects per realm (cached by the traditions array)
  // -------------------------------------------------------------------
  const trads = emp => (emp && emp.traditions) || [];
  const CACHE = new WeakMap();
  const ethosFrom = list => {
    const e = { war: 0, open: 0, faith: 0, kin: 0 };
    for (const id of list) { const t = DATA.traditions[id]; if (t) for (const [k, v] of Object.entries(t.eth)) e[k] = (e[k] || 0) + v; }
    return e;
  };
  const virtuesOf = e => DATA.ethosOrder.map(ax => e[ax] >= ETHOS.devoted ? ax + '+' : e[ax] <= -ETHOS.devoted ? ax + '-' : null).filter(Boolean);
  const aggregate = emp => {
    const list = trads(emp);
    const hit = CACHE.get(list);
    // (same test as comparing the signature string length|last id, without building the string on every call)
    if (hit && hit.len === list.length && hit.last === list[list.length - 1]) return hit;
    const sig = list.length + '|' + list[list.length - 1];
    const A = { sig, len: list.length, last: list[list.length - 1], fx: {}, props: {}, season: [{}, {}, {}, {}], seasonHappy: [0, 0, 0, 0], ethos: ethosFrom(list), cers: [] };
    for (const [p, c] of Object.entries(G.TRAD_PROPS)) A.props[p] = c === 'mul' ? 1 : 0;
    const take = src => {
      for (const [k, v] of Object.entries(src.fx || {})) A.fx[k] = (A.fx[k] || 1) * v;
      for (const [p, c] of Object.entries(G.TRAD_PROPS)) if (src[p] !== undefined) A.props[p] = c === 'mul' ? A.props[p] * src[p] : A.props[p] + src[p];
    };
    for (const id of list) {
      const t = DATA.traditions[id];
      if (!t) continue;
      take(t);
      for (const [i, fx] of Object.entries(t.seasonFx || {})) for (const [k, v] of Object.entries(fx)) A.season[i][k] = (A.season[i][k] || 1) * v;
      for (const [i, v] of Object.entries(t.seasonHappy || {})) A.seasonHappy[i] += v;
      if (t.cer && !A.cers.includes(t.cer)) A.cers.push(t.cer);
    }
    A.virtues = virtuesOf(A.ethos);
    for (const v of A.virtues) take(DATA.ethosVirtues[v]);
    CACHE.set(list, A);
    return A;
  };
  G.traditionAgg = aggregate;
  // tFx(emp, prop, 'mul'|'add') — the named effects culture.js reads
  G.traditionFx = (emp, prop, combine = 'mul') => {
    const A = aggregate(emp);
    if (A.props[prop] !== undefined) return A.props[prop];
    return combine === 'mul' ? 1 : 0;
  };
  G.traditionSeasonHappy = (s, emp) => aggregate(emp).seasonHappy[G.season(s).index] || 0;
  const tProp = (s, owner, p) => { const e = s.empires[owner]; return e ? G.traditionFx(e, p) : 1; };

  G.modSources.push((s, owner, city, key) => {
    const emp = s.empires[owner];
    if (!emp || !emp.traditions || !emp.traditions.length) return 1;
    const A = aggregate(emp);
    let m = A.fx[key] || 1;
    const sf = A.season[G.season(s).index][key];
    if (sf) m *= sf;
    return m;
  });

  // -------------------------------------------------------------------
  // Ethos
  // -------------------------------------------------------------------
  G.ethosOf = (s, owner) => aggregate(s.empires[owner]).ethos;
  G.ethosWords = e => DATA.ethosOrder.map(ax => {
    const v = e[ax], A = DATA.ethosAxes[ax];
    if (Math.abs(v) < ETHOS.lean) return null;
    const w = v > 0 ? A.plus : A.minus;
    return { axis: ax, sign: v > 0 ? 1 : -1, word: w, icon: v > 0 ? A.iconPlus : A.iconMinus, devoted: Math.abs(v) >= ETHOS.devoted };
  }).filter(Boolean);
  G.ethosTitle = e => {
    const ws = G.ethosWords(e).sort((a, b) => Math.abs(e[b.axis]) - Math.abs(e[a.axis]));
    if (!ws.length) return 'A people still finding its ways';
    return `A ${ws.slice(0, 2).map(w => (w.devoted ? 'devoutly ' : '') + w.word.toLowerCase()).join(', ')} people`;
  };
  // −1 (opposed ways) … +1 (kindred ways); weak in realms with little culture
  G.ethosAffinity = (s, a, b) => {
    const A = G.ethosOf(s, a), B = G.ethosOf(s, b);
    let dot = 0, na = 0, nb = 0;
    for (const ax of DATA.ethosOrder) { dot += A[ax] * B[ax]; na += A[ax] * A[ax]; nb += B[ax] * B[ax]; }
    na = Math.sqrt(na); nb = Math.sqrt(nb);
    if (na < 1 || nb < 1) return 0;
    return dot / (na * nb) * Math.min(1, Math.min(na, nb) / 8);
  };
  // kindred realms are slower to attack each other; Concord and the Long Peace calm rivals further
  const baseHostility = G.hostility;
  G.hostility = (s, aiId, target) => {
    const h = baseHostility(s, aiId, target);
    if (!h || !s.empires[target] || !s.empires[aiId]) return h;
    const aff = G.ethosAffinity(s, aiId, target);
    return h * (1 - ETHOS.hostility * aff) * tProp(s, target, 'calm');
  };

  // -------------------------------------------------------------------
  // Status, cost, adoption
  // -------------------------------------------------------------------
  G.traditionPeople = id => (DATA.traditions[id] || {}).race || null;
  G.traditionsFor = (s, owner) => DATA.traditionOrder.filter(id => { const r = DATA.traditions[id].race; return !r || r === s.empires[owner].race; });
  const COST = G.TRAD_COST = { base: [0, 80, 420, 1250, 3600], perAdopted: 0.15, tale: 0.75, round: 10 };
  G.taleSeen = (s, owner, tale) => !!(tale && G.story && G.story.flags && (() => { try { return G.story.flags(s, owner)[tale] !== undefined; } catch (e) { return false; } })());
  G.traditionCost = (s, owner, id) => {
    const n = trads(s.empires[owner]).length;
    const t = DATA.traditions[id];
    const age = t ? t.age : Math.min(4, 1 + Math.floor(n / 5));
    let c = COST.base[age] * (1 + COST.perAdopted * n);
    if (t && t.tale && G.taleSeen(s, owner, t.tale)) c *= COST.tale;
    return Math.max(COST.round, Math.round(c / COST.round) * COST.round);
  };
  const towerLvl = (s, owner) => Math.max(0, ...G.citiesOf(s, owner).map(c => G.lvl(c, 'magetower')));
  const reqText = r => {
    const parts = [];
    if (r.ethos) { const [ax, n] = r.ethos; const A = DATA.ethosAxes[ax]; parts.push(`${n > 0 ? A.plus : A.minus} ethos ${Math.abs(n)}+`); }
    if (r.faith) parts.push('a state faith');
    if (r.tower) parts.push(`a level ${r.tower} Mage Tower`);
    return parts.join(', ');
  };
  G.traditionReqText = id => reqText(DATA.traditions[id].req || {});
  G.traditionStatus = (s, owner, id) => {
    const emp = s.empires[owner];
    const t = DATA.traditions[id];
    if (!t || (t.race && t.race !== emp.race)) return { ok: false, foreign: true, reason: 'Not for your people' };
    const list = trads(emp);
    if (list.includes(id)) return { ok: false, have: true, reason: 'Adopted' };
    if (t.excl && list.includes(t.excl)) return { ok: false, forsaken: true, reason: `Forsaken for ${DATA.traditions[t.excl].name}` };
    const cost = G.traditionCost(s, owner, id);
    const need = DATA.traditionAges[t.age].need;
    if (list.length < need) return { ok: false, cost, locked: true, reason: `The age of ${DATA.traditionAges[t.age].name} needs ${need} traditions` };
    const missing = t.pre.filter(g => !g.some(x => list.includes(x)));
    if (missing.length) return { ok: false, cost, locked: true, missing, reason: 'Needs ' + missing.map(g => g.filter(x => DATA.traditions[x]).map(x => DATA.traditions[x].name).join(' or ')).join(' and ') };
    const r = t.req || {};
    if (r.ethos) {
      const [ax, n] = r.ethos; const v = G.ethosOf(s, owner)[ax];
      if (n > 0 ? v < n : v > n) return { ok: false, cost, locked: true, ethos: true, reason: `Needs ${reqText({ ethos: r.ethos })} (now ${v > 0 ? '+' : ''}${v})` };
    }
    if (r.faith && !emp.faithId) return { ok: false, cost, locked: true, reason: 'Needs a state faith' };
    if (r.tower && towerLvl(s, owner) < r.tower) return { ok: false, cost, locked: true, reason: `Needs a level ${r.tower} Mage Tower` };
    if ((emp.culture || 0) < cost) return { ok: false, cost, poor: true, reason: 'Not enough culture' };
    return { ok: true, cost };
  };
  // is it open to adopt, culture aside?
  const reachable = (s, owner, id) => { const st = G.traditionStatus(s, owner, id); return st.ok || st.poor; };
  G.traditionOpen = reachable;

  const ethosShiftText = t => Object.entries(t.eth).filter(([, v]) => v).map(([ax, v]) => `${v > 0 ? DATA.ethosAxes[ax].plus : DATA.ethosAxes[ax].minus} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(', ');
  G.traditionEthosText = id => ethosShiftText(DATA.traditions[id]);

  G.adoptTradition = (s, owner, id) => {
    const st = G.traditionStatus(s, owner, id);
    if (!st.ok) return st.reason;
    const emp = s.empires[owner];
    const before = G.ethosOf(s, owner);
    emp.culture -= st.cost;
    emp.traditions = [...trads(emp), id];
    const t = DATA.traditions[id];
    for (const c of G.citiesOf(s, owner)) G.updateHappiness(s, c);
    G.log(s, owner, `${t.icon} The realm embraces a new tradition: ${t.name}.`, 'good');
    if (t.excl && DATA.traditions[t.excl]) G.log(s, owner, `${DATA.traditions[t.excl].icon} ${DATA.traditions[t.excl].name} is forsaken: our people have chosen their way.`, 'info');
    const after = G.ethosOf(s, owner);
    // crossing an ethos threshold: say so; like-minded realms warm to us, opposed ones cool
    for (const ax of DATA.ethosOrder) {
      for (const lim of [ETHOS.lean, ETHOS.gate, ETHOS.devoted]) {
        for (const sg of [1, -1]) {
          if (before[ax] * sg < lim && after[ax] * sg >= lim) {
            const word = sg > 0 ? DATA.ethosAxes[ax].plus : DATA.ethosAxes[ax].minus;
            if (lim === ETHOS.devoted) G.log(s, owner, `🧭 Our people are now devoutly ${word.toLowerCase()}: ${DATA.ethosVirtues[ax + (sg > 0 ? '+' : '-')].text}.`, 'good');
            else if (lim === ETHOS.gate) G.log(s, owner, `🧭 Our ${word.toLowerCase()} ways open new traditions.`, 'good');
          }
        }
      }
    }
    if (owner === 'p' && s.rel) {
      for (const e of Object.values(s.empires)) {
        if (e.id === 'p' || e.dead) continue;
        const theirs = G.ethosOf(s, e.id);
        let d = 0;
        for (const [ax, v] of Object.entries(t.eth)) d += Math.sign(theirs[ax]) * Math.sign(v) * (Math.abs(theirs[ax]) >= ETHOS.lean ? 1 : 0);
        if (d) { const r = G.rel(s, e.id); r.opinion = G.clamp(r.opinion + G.clamp(d * 3, -6, 6), -100, 100); }
      }
    }
    return null;
  };

  // -------------------------------------------------------------------
  // Ceremonies
  // -------------------------------------------------------------------
  const cerScale = s => 1 + s.time / (3600 * G.pace(s).time) * 0.12;
  G.ceremoniesOf = (s, owner) => aggregate(s.empires[owner]).cers.slice();
  G.ceremonyCost = (s, owner, id) => {
    const c = DATA.ceremonies[id], k = cerScale(s) * (1 + 0.15 * Math.max(0, G.citiesOf(s, owner).length - 1));
    const out = {};
    for (const [g, v] of Object.entries(c.cost)) out[g] = Math.round(v * k / 5) * 5;
    return out;
  };
  G.ceremonyReady = (s, owner, id) => ((s.empires[owner].ceremonies || {})[id] || 0);
  G.ceremonyStatus = (s, owner, id) => {
    const c = DATA.ceremonies[id], emp = s.empires[owner];
    if (!c) return { ok: false, reason: 'No such ceremony' };
    if (!G.ceremoniesOf(s, owner).includes(id)) return { ok: false, locked: true, reason: 'Adopt its tradition first' };
    const cost = G.ceremonyCost(s, owner, id);
    const ready = G.ceremonyReady(s, owner, id);
    if (ready > s.time) return { ok: false, cooling: true, cost, ready, reason: `Ready in ${Math.ceil((ready - s.time) / 60)} min` };
    if (c.onlySeason !== undefined && G.season(s).index !== c.onlySeason) return { ok: false, cost, season: true, reason: `Only in ${SEASON_NAMES[c.onlySeason]}` };
    if (c.needsFaith && !emp.faithId) return { ok: false, cost, reason: 'Needs a state faith' };
    const cap = G.capital(s, owner);
    if (!cap) return { ok: false, reason: 'No capital' };
    if (!G.canAfford(s, cap, cost)) return { ok: false, cost, poor: true, reason: 'Not enough goods in the capital' };
    return { ok: true, cost };
  };
  const pushMod = (s, target, key, mult, mins, label, extra) => {
    target.mods = (target.mods || []).filter(md => md.until > s.time);
    target.mods.push(Object.assign({ key, mult, until: s.time + paceMin(s, mins), label }, extra || {}));
  };
  const cultureBurst = (s, owner, mins) => {
    const emp = s.empires[owner];
    const g = G.realmCultureRate(s, owner) * mins;
    emp.culture = (emp.culture || 0) + g; emp.cultureTotal = (emp.cultureTotal || 0) + g;
    return Math.round(g);
  };
  const CER_FX = {
    lanterns: (s, o, c) => { for (const city of G.citiesOf(s, o)) pushMod(s, city, 'popGrowth', 1.1, c.mins, 'Festival'); return `+${cultureBurst(s, o, 6)} culture`; },
    hammerday: (s, o, c) => { const e = s.empires[o]; pushMod(s, e, 'refine', 1.2, c.mins, c.name); pushMod(s, e, 'buildTime', 0.9, c.mins, c.name); return ''; },
    warfeast: (s, o, c) => { pushMod(s, s.empires[o], 'atk', 1.1, c.mins, c.name); return ''; },
    pilgrimage: (s, o, c) => {
      const e = s.empires[o]; const f = G.faithRate ? Math.round(G.faithRate(s, o) * 12 + 20) : 0;
      e.faith = (e.faith || 0) + f; if (e.faithTotal !== undefined) e.faithTotal += f;
      for (const city of G.citiesOf(s, o)) pushMod(s, city, 'ceremony', 1, c.mins, c.name, { happy: 5 });
      return `+${f} faith`;
    },
    saganight: (s, o) => { const xp = G.heroGainXp ? G.heroGainXp(s, Math.round(40 * cerScale(s)), o) : 0; return `+${cultureBurst(s, o, 5)} culture${xp ? `, +${xp} hero experience` : ''}`; },
    fair: (s, o, c) => { const e = s.empires[o]; pushMod(s, e, 'tax', 1.15, c.mins, c.name); pushMod(s, e, 'market', 1.1, c.mins, c.name); return ''; },
    starrite: (s, o, c) => {
      let n = 0; for (const city of G.citiesOf(s, o)) { const add = Math.round((15 + 4 * G.lvl(city, 'magetower')) * cerScale(s)); city.res.mana = (city.res.mana || 0) + add; n += add; }
      pushMod(s, s.empires[o], 'spellPower', 1.15, c.mins, c.name); return `+${n} mana`;
    },
    firstfurrow: (s, o, c) => { pushMod(s, s.empires[o], 'grain', G.season(s).index === 0 ? 1.35 : 1.2, c.mins, c.name); return ''; },
    midsummer: (s, o, c) => { for (const city of G.citiesOf(s, o)) pushMod(s, city, 'ceremony', 1, c.mins, c.name, { happy: 6 }); pushMod(s, s.empires[o], 'atk', 1.05, c.mins, c.name); return `+${cultureBurst(s, o, 4)} culture`; },
    assize: (s, o, c) => {
      for (const city of G.citiesOf(s, o)) { city.loyalty = Math.min(100, (city.loyalty ?? 100) + 12); pushMod(s, city, 'ceremony', 1, c.mins, c.name, { happy: 4 }); }
      if (o === 'p') s.pending = (s.pending || []).filter(p => p.kind !== 'unrest');
      return '';
    },
  };
  G.holdCeremony = (s, owner, id) => {
    const st = G.ceremonyStatus(s, owner, id);
    if (!st.ok) return st.reason;
    const c = DATA.ceremonies[id], emp = s.empires[owner];
    G.pay(s, G.capital(s, owner), st.cost);
    emp.ceremonies = emp.ceremonies || {};
    emp.ceremonies[id] = s.time + paceMin(s, c.cool);
    const extra = CER_FX[id](s, owner, c);
    for (const city of G.citiesOf(s, owner)) G.updateHappiness(s, city);
    G.log(s, owner, `${c.icon} ${/^The /.test(c.name) ? c.name : "The " + c.name} is held across the realm.${extra ? ' (' + extra + ')' : ''}`, 'good');
    return null;
  };
  // ceremonial happiness on cities (mods with a happy field)
  G.ceremonyHappy = (s, city) => {
    let v = 0; const labels = [];
    for (const md of city.mods || []) if (md.happy && md.until > s.time) { v += md.happy; if (!labels.includes(md.label)) labels.push(md.label); }
    return { value: v, label: labels.join(', ') };
  };

  // seasonal ceremonies are offered as decisions when their season begins
  G.pendingHandlers = G.pendingHandlers || {};
  G.pendingHandlers.ceremony = (s, p, key) => {
    if (key !== 'hold') return null;
    return G.holdCeremony(s, 'p', p.data.id);
  };
  const offerSeasonal = (s) => {
    const se = G.season(s);
    const key = se.year * 4 + se.index;
    const emp = s.empires.p;
    if (!emp || emp.dead || emp.lastSeasonOffer === key) return;
    emp.lastSeasonOffer = key;
    if (se.progress > 0.25) return;
    for (const id of G.ceremoniesOf(s, 'p')) {
      const c = DATA.ceremonies[id];
      if (c.season !== se.index || (s.pending || []).some(p => p.kind === 'ceremony')) continue;
      const st = G.ceremonyStatus(s, 'p', id);
      if (!st.ok) continue;
      const cost = Object.entries(st.cost).map(([g, v]) => `${v} ${g === 'gold' ? 'gold' : DATA.goods[g].name.toLowerCase()}`).join(', ');
      G.addPending(s, {
        kind: 'ceremony', title: `${c.icon} ${G.SEASONS[se.index]} brings the ${c.name}`,
        text: `The people expect the ${c.name} as the season turns. ${c.desc} Cost: ${cost}.`,
        options: [{ key: 'hold', label: `Hold it (${cost})` }, { key: 'skip', label: 'Not this year' }],
        expires: s.time + paceMin(s, 8), def: 'skip', data: { id },
      });
    }
  };

  // -------------------------------------------------------------------
  // Faith and trade-route bonuses wrap functions defined by later modules,
  // once, the first time the world runs
  // -------------------------------------------------------------------
  const ensureWraps = () => {
    if (G.faithRate && !G.faithRate._trad) {
      const base = G.faithRate;
      G.faithRate = (s, owner) => base(s, owner) * tProp(s, owner, 'faith');
      G.faithRate._trad = true;
    }
    if (G.routeIncome && !G.routeIncome._trad) {
      const base = G.routeIncome;
      G.routeIncome = (s, a, b) => Math.round(base(s, a, b) * (a && a.owner ? tProp(s, a.owner, 'routes') : 1));
      G.routeIncome._trad = true;
    }
  };
  G.ensureTraditionWraps = ensureWraps;

  // -------------------------------------------------------------------
  // Slow tick: envoys, seasonal ceremonies
  // -------------------------------------------------------------------
  G.slowHooks.push((s, dtMin) => {
    ensureWraps();
    if (s.gameOver) return;
    for (const emp of Object.values(s.empires)) {
      if (emp.dead || !emp.traditions || !emp.traditions.length) continue;
      const env = G.traditionFx(emp, 'envoy', 'add');
      if (env && s.minors && G.minorAddInfluence) {
        for (const mi of Object.values(s.minors)) {
          if (!mi || mi.subject || !((mi.inf || {})[emp.id] > 0)) continue;
          G.minorAddInfluence(s, mi, emp.id, env * dtMin);
          if (G.minorUpdatePatron) G.minorUpdatePatron(s, mi);
        }
      }
    }
    offerSeasonal(s);
  });

  // -------------------------------------------------------------------
  // AI: a personality-driven pick, saved for, then adopted
  // -------------------------------------------------------------------
  // each people leans toward some pillars
  const RACE_PILLARS = {
    hearth: { kin: 3, land: 2, labour: 1 }, delver: { labour: 3, honour: 1, law: 2 }, sylvan: { lore: 3, land: 2, arcana: 1 },
    ash: { honour: 2, kin: 2, labour: 1 }, tide: { trade: 3, land: 1, lore: 1 }, veil: { arcana: 3, lore: 1, faith: 1 },
    grave: { law: 2, labour: 2, faith: 1 }, wind: { trade: 2, land: 2, labour: 1 },
  };
  G.aiTraditionScore = (s, emp, id, ctx) => {
    const t = DATA.traditions[id];
    let sc = 4 + 2 * ((RACE_PILLARS[emp.race] || {})[t.pillar] || 0);
    if (t.race) sc += 6;
    // needs
    if (ctx.unhappy) sc += (t.happy || 0) * 2.5 + (t.size || 0) * 6 + (t.weary ? 4 : 0) + (t.crowd ? 4 : 0) + (t.amenity ? 4 : 0) + (t.calamity && t.calamity < 1 ? 2 : 0);
    if (ctx.atWar) sc += ((t.fx || {}).atk ? 5 : 0) + ((t.fx || {}).def ? 4 : 0) + (t.cer === 'warfeast' ? 3 : 0);
    if (ctx.big) sc += (t.size || 0) * 4 + (t.loyalty ? 3 : 0);
    if (ctx.faith && (t.faith || t.pillar === 'faith')) sc += 2;
    // personality: aggressive peoples lean martial, gentle ones peaceful
    const aggr = DATA.races[emp.race].aggr || 0.5;
    sc += (t.eth.war || 0) * (aggr - 0.5) * 4;
    // ethos coherence: keep to the ways already chosen
    for (const [ax, v] of Object.entries(t.eth)) sc += Math.sign(ctx.ethos[ax]) * v * Math.min(1, Math.abs(ctx.ethos[ax]) / 5) * 1.5;
    // cheaper ones a little more often; specials and capstones are prized
    sc -= (t.age - 1) * 0.5;
    if (t.req) sc += 3;
    return sc + Math.random() * 3;
  };
  G.aiPickTradition = (s, emp) => {
    const cities = G.citiesOf(s, emp.id);
    const ctx = {
      unhappy: cities.some(c => G.happyOf(c) < 50),
      atWar: Object.values(s.empires).some(o => o.id !== emp.id && !o.dead && (o.id === 'p' ? G.rel(s, emp.id).status === 'war' : G.aiRel(s, emp.id, o.id).status === 'war')),
      big: cities.length > G.sizeFreeOf(s) + 1,
      faith: !!emp.faithId,
      ethos: G.ethosOf(s, emp.id),
    };
    const opts = G.traditionsFor(s, emp.id).filter(id => reachable(s, emp.id, id));
    if (!opts.length) return null;
    let best = null, bs = -1e9;
    for (const id of opts) { const v = G.aiTraditionScore(s, emp, id, ctx); if (v > bs) { bs = v; best = id; } }
    return best;
  };
  const aiCeremonies = (s, emp) => {
    const cers = G.ceremoniesOf(s, emp.id);
    if (!cers.length) return;
    const cities = G.citiesOf(s, emp.id);
    const unhappy = cities.some(c => G.happyOf(c) < 45), restless = cities.some(c => (c.loyalty ?? 100) < 60 && G.happyOf(c) < 30);
    const atWar = Object.values(s.empires).some(o => o.id !== emp.id && !o.dead && (o.id === 'p' ? G.rel(s, emp.id).status === 'war' : G.aiRel(s, emp.id, o.id).status === 'war'));
    const want = { lanterns: unhappy, pilgrimage: unhappy, midsummer: unhappy, assize: restless, warfeast: atWar && Math.random() < 0.02, saganight: true, firstfurrow: G.season(s).index === 0 };
    for (const id of cers) if (want[id] && G.ceremonyStatus(s, emp.id, id).ok && emp.gold > 400) { G.holdCeremony(s, emp.id, id); return; }
  };
  G.aiHooks.push((s, emp) => {
    if (emp.id === 'p' || emp.dead) return;
    aiCeremonies(s, emp);
    let tgt = emp.tradTarget;
    if (!tgt || !DATA.traditions[tgt] || !reachable(s, emp.id, tgt)) tgt = emp.tradTarget = G.aiPickTradition(s, emp);
    if (tgt && G.traditionStatus(s, emp.id, tgt).ok) { G.adoptTradition(s, emp.id, tgt); emp.tradTarget = null; }
  });

  G.newGameHooks.push(s => {
    ensureWraps();
    for (const e of Object.values(s.empires)) { e.ceremonies = {}; e.tradTarget = null; }
  });
})();
