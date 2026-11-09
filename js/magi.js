// =====================================================================
//  The Circle of Magi — the people of magic, and magic at war.
//
//  Every realm keeps a circle of named magi: recruited where a Mage Tower
//  stands, paid in mana every minute, each of one school (G.schoolsOf),
//  ranked Apprentice → Archmage, aging with the calendar, with one or two
//  traits. A magus serves at one of four stations:
//    court — Court Magus of a city (one per city, needs a Mage Tower): more
//            mana there, cheaper and stronger spells cast from it, the weave
//            strain there fades faster;
//    war   — War Magus based in a city: rides out with hostile marches from
//            that city (10+ soldiers) and casts battle spells, defends the
//            city while home; duels enemy magi and counters their spells;
//    study — speeds the realm's grimoire study (G.magiStudyBonus);
//    idle  — waits in a city.
//  Life events: rank-ups, loyalty (rivals lure, ambition, mana shortages),
//  defection or going rogue, death of old age (a senior magus leaves an
//  apprentice who takes over the station), wounds and death in battle.
//
//  State (lazy, plain JSON — old saves grow a circle on first look):
//    s.magi = { v, seq, rev, realms: { owner: R } }
//    R = { list: [magus], pool: { next, list: [cand] } | null, fallen: [ {name, rank, school, cause, t} ], aiAt }
//    magus = { id, name, race, seed, school, rank 1..5, xp, bornS (season index), traits: [], loyalty 0..100, hp 0..100,
//              station 'idle'|'court'|'war'|'study', city (base city id), status 'home'|'riding'|'marching',
//              until (riding), move (marching), guard (war: stays home), battles, duels, wins, luredBy, honorAt, joined }
//
//  API: G.magiOf, G.magusById, G.magiCap, G.magiRecruitCost, G.magiUpkeep, G.magiPool, G.canRecruitMagus,
//    G.recruitMagus, G.stationMagus, G.setMagusGuard, G.dismissMagus, G.honorMagus, G.honorCost, G.courtMagusOf,
//    G.magiAt, G.magiStudyBonus, G.magusAge, G.magusRankName, G.magusSpec, G.magusBattleSpells, G.magusXpNeed,
//    G.magiCourtFx, G.magiTick (catch-up for tests), G.MAGI (tuning; MAGI.rng fixes the fate dice in tests).
//  Pure engine code (no DOM); the UI lives in ui-magi.js.
// =====================================================================
'use strict';
(() => {
  const MG = G.MAGI = {
    ranks: ['Apprentice', 'Adept', 'Magus', 'Master', 'Archmage'],
    xpNeed: [80, 170, 300, 480],          // xp from rank r to r+1
    capPerTower: 4, capMax: 10,          // capacity: 1 per 4 Mage Tower levels in the realm (rounded up), at most 10
    cost: { gold: 120, goldStep: 80, goldRank: 60, mana: 60, manaStep: 30, manaRank: 40 },
    upkeep: [0.5, 0.7, 0.9, 1.1, 1.3],   // mana per minute by rank (× pace production)
    poolEvery: 2 * 3600,                 // candidates refresh (× pace time)
    speed: 10,                           // riding speed between cities
    courtMana: [0.12, 0.04],             // court: +12% mana, +4% per rank above 1
    courtCost: 0.03, courtPower: 0.03,   // per rank: −3% spell cost, +3% spell power for spells cast from the court city
    courtStrain: 0.5,                    // extra weave strain shed per minute per rank
    studyBonus: [0.04, 0.02], studyCap: 1.6,
    xpRate: { court: 0.4, study: 0.5, war: 0.15, idle: 0.1 },
    minHp: 40, regen: 20,                // health needed to ride to war; health regained per game hour
    rideMin: 10, maxRiders: 3,           // soldiers a march needs before war magi ride with it; magi per march
    loyalty: { base: 70, drift: 0.4, defect: 25, defectPerHour: 0.5, lurePerHour: 0.04 },
    honor: { gold: 60, goldRank: 40, gain: 25, coolMin: 60 },
    side: { max: 1.18, min: 0.88 },      // bounds of the magi's combined multiplier on each side
    rng: null,
  };
  const HOSTILE = { raid: 1, attack: 1, conquer: 1, intercept: 1 };   // marches war magi ride with (interceptions: js/intercept.js)
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const paceT = s => G.pace(s).time;
  const seasonLen = s => ((G.DYN && G.DYN.seasonSec) || 7200) * paceT(s);
  const nowS = s => s.time / seasonLen(s);
  // a small deterministic generator (names, candidates, duel luck): same state, same outcome
  const hashStr = str => { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  const prng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const rpick = (r, a) => a[Math.floor(r() * a.length) % a.length];
  // the Circle's own dice: life events never draw from Math.random, so they leave the rest of the game's luck untouched
  const OWN = prng(0x51C1E);
  const rnd = () => (MG.rng || OWN)();

  // ---- traits ----
  DATA.magusTraits = {
    reckless:       { name: 'Reckless',       icon: '🔥', desc: '+15% battle-spell strength; at court +10% spell power, but spells cast there add 50% more weave strain. Twice the risk of dying in duels.' },
    scholarly:      { name: 'Scholarly',      icon: '📜', desc: '+50% experience at court and in study; in study, +50% to the grimoire bonus.' },
    leysensitive:   { name: 'Ley-sensitive',  icon: '💠', desc: 'As court magus: the mana bonus is half again as large (doubled if the city taps a ley enclave).' },
    battlehardened: { name: 'Battle-hardened', icon: '⚔️', desc: '+10% battle-spell strength, +1 in duels, half the risk of dying in battle.' },
    ambitious:      { name: 'Ambitious',      icon: '👑', desc: '+25% experience, but loyalty settles 15 lower (10 more while a higher-ranked magus serves the realm) and rivals lure them twice as easily.' },
    frail:          { name: 'Frail',          icon: '🕯️', desc: 'Twice the yearly risk of dying of age; −1 in duels.' },
    devoted:        { name: 'Devoted',        icon: '🤝', desc: 'Loyalty settles 15 higher; never defects or goes rogue.' },
  };
  const has = (g, t) => !!(g && g.traits && g.traits.includes(t));

  // ---- battle spells: two per school, the second learned at rank 3 (Magus) ----
  // kind: volley (+attack, sharper opening volley), shield (fewer own losses, a little defence), rout (foe loses more, longer pursuit),
  //       summon (+strength), hex (the foe is weakened). Strength grows +25% per rank above Apprentice.
  DATA.battleSpells = {
    hailstorm:     { school: 'hearthweather', rank: 1, kind: 'volley', name: 'Hailstorm',        icon: '🌨️' },
    mistcloak:     { school: 'hearthweather', rank: 3, kind: 'shield', name: 'Cloak of Mist',    icon: '🌫️' },
    runeaegis:     { school: 'runecraft',     rank: 1, kind: 'shield', name: 'Runic Aegis',      icon: '🔷' },
    runebreak:     { school: 'runecraft',     rank: 3, kind: 'hex',    name: 'Rune of Breaking', icon: '💔' },
    thornsnare:    { school: 'songroot',      rank: 1, kind: 'rout',   name: 'Thorn Snare',      icon: '🌿' },
    beastcall:     { school: 'songroot',      rank: 3, kind: 'summon', name: 'Call the Pack',    icon: '🐺' },
    fireball:      { school: 'bloodember',    rank: 1, kind: 'volley', name: 'Fireball',         icon: '☄️' },
    bloodfury:     { school: 'bloodember',    rank: 3, kind: 'rout',   name: 'Blood Fury',       icon: '🩸' },
    squall:        { school: 'tidestorm',     rank: 1, kind: 'volley', name: 'Squall',           icon: '🌊' },
    drowningfog:   { school: 'tidestorm',     rank: 3, kind: 'shield', name: 'Drowning Fog',     icon: '🌁' },
    phantomhost:   { school: 'glamour',       rank: 1, kind: 'summon', name: 'Phantom Host',     icon: '👥' },
    terror:        { school: 'glamour',       rank: 3, kind: 'rout',   name: 'Waking Terror',    icon: '😱' },
    wither:        { school: 'necromancy',    rank: 1, kind: 'hex',    name: 'Wither',           icon: '🥀' },
    raiseslain:    { school: 'necromancy',    rank: 3, kind: 'summon', name: 'Raise the Slain',  icon: '🧟' },
    chainlightning:{ school: 'skywind',       rank: 1, kind: 'volley', name: 'Chain Lightning',  icon: '⚡' },
    galewall:      { school: 'skywind',       rank: 3, kind: 'shield', name: 'Wall of Gales',    icon: '🌪️' },
  };
  DATA.battleSpellKinds = {
    volley: { name: 'Opening volley', desc: '+5% strength and a 25% sharper opening volley' },
    shield: { name: 'Shield',         desc: '10% fewer own losses and +2% strength' },
    rout:   { name: 'Rout',           desc: 'the foe loses 10% more and the pursuit runs 30% longer' },
    summon: { name: 'Summoning',      desc: '+6% strength' },
    hex:    { name: 'Hex',            desc: 'the foe fights 4% weaker' },
  };
  // a spell for any school the tables above do not know (schools added later)
  const FALLBACK = { rank: 1, kind: 'volley', name: 'Arcane Bolt', icon: '✨' };
  const spellsOfSchool = school => Object.entries(DATA.battleSpells).filter(([, b]) => b.school === school).map(([id, b]) => ({ id, ...b }));
  G.magusBattleSpells = g => {
    const all = spellsOfSchool(g.school);
    const list = all.length ? all : [{ id: 'arcanebolt', ...FALLBACK, school: g.school }];
    return list.filter(b => b.rank <= g.rank);
  };

  // ---- names per people ----
  DATA.magusNames = {
    hearth: [['Aldric', 'Bethan', 'Corwin', 'Elspeth', 'Fenwick', 'Gwendolyn', 'Hollis', 'Maudie', 'Oswin', 'Rosalind', 'Tobiah', 'Wynn'], ['the Grey', 'of Hearthmoor', 'Rainwhistle', 'Hedgewise', 'the Kindly', 'Stormbrow', 'Candlewick', 'of the Long Barn']],
    delver: [['Agna', 'Borin', 'Dvalin', 'Eitri', 'Frida', 'Gudrun', 'Hjalmar', 'Ingrid', 'Nyr', 'Runa', 'Sindri', 'Thorgrim'], ['Runecarver', 'Deepsight', 'the Etcher', 'Glowbeard', 'of the Ninth Hall', 'Stonesinger', 'Emberhand', 'Sigilwright']],
    sylvan: [['Aelwen', 'Calanthe', 'Eirlys', 'Fionnar', 'Ilmare', 'Lirien', 'Miriel', 'Nimloth', 'Orophin', 'Saelind', 'Thranduin', 'Yavanna'], ['Rootsinger', 'of the Moonwell', 'Leafwhisper', 'the Green', 'Starbloom', 'Dewcaller', 'Thornweaver', 'of the Old Oak']],
    ash:    [['Azgal', 'Bruka', 'Dazhra', 'Gorza', 'Khazra', 'Murkash', 'Nazgra', 'Rakhul', 'Shagra', 'Ughra', 'Varza', 'Zogh'], ['Ashtongue', 'the Smoke-Eyed', 'Bloodseer', 'Cinderskin', 'Flamecaller', 'the Scorched', 'Skullfire', 'Embermaw']],
    tide:   [['Aolani', 'Brine', 'Coralie', 'Delmar', 'Isolwen', 'Lirr', 'Marisol', 'Nerys', 'Pelan', 'Seren', 'Undine', 'Wave'], ['Stormcaller', 'of the Deep', 'Saltwhisper', 'Foamborn', 'the Drowned Seer', 'Tidewise', 'Squallhand', 'Pearl-Eyed']],
    veil:   [['Aurelle', 'Cyrene', 'Dusk', 'Eidolon', 'Ilse', 'Lumen', 'Morwen', 'Nocturne', 'Reverie', 'Sombre', 'Umbra', 'Vael'], ['Dreamweaver', 'the Glimmering', 'of the Mirror', 'Moonveil', 'Starspinner', 'the Whisper', 'Gloamsight', 'Silkshadow']],
    grave:  [['Cerement', 'Dolor', 'Elegy', 'Grimald', 'Lament', 'Morrow', 'Necra', 'Ossian', 'Requia', 'Sepulka', 'Tenebris', 'Vigil'], ['Bonereader', 'the Quiet', 'of the Ossuary', 'Graveborn', 'Shroudweaver', 'the Mourner', 'Lichlight', 'Dustcaller']],
    wind:   [['Aella', 'Boreas', 'Ciel', 'Eurus', 'Halcyon', 'Ilios', 'Kaia', 'Notos', 'Pyra', 'Skye', 'Tempest', 'Zephyra'], ['Stormeye', 'of the High Roost', 'Thunderhand', 'Cloudreader', 'the Gale', 'Skyweaver', 'Sparkfeather', 'Windwhisper']],
  };

  // ---- state ----
  const store = s => {
    if (!s.magi || typeof s.magi !== 'object') s.magi = { v: 1, seq: 0, rev: 0, realms: {} };
    const M = s.magi;
    M.seq = M.seq || 0; M.rev = M.rev || 0; M.realms = M.realms || {};
    return M;
  };
  const realm = (s, owner) => {
    const M = store(s);
    let R = M.realms[owner];
    if (!R) R = M.realms[owner] = { list: [], pool: null, fallen: [], aiAt: 0 };
    if (!Array.isArray(R.list)) R.list = [];
    if (!Array.isArray(R.fallen)) R.fallen = [];
    return R;
  };
  const bump = s => { store(s).rev++; };
  G.magiOf = (s, owner) => (s.empires[owner] ? realm(s, owner).list : []);
  G.magusById = (s, owner, id) => (id && s.magi && s.magi.realms && s.magi.realms[owner] ? s.magi.realms[owner].list.find(g => g.id === id) || null : null);
  G.magusRankName = g => MG.ranks[clamp((g && g.rank) || 1, 1, 5) - 1];
  G.magusXpNeed = rank => MG.xpNeed[rank - 1] || 0;
  G.magusAge = (s, g) => Math.max(0, Math.floor((nowS(s) - g.bornS) / 4));
  const towerLevels = (s, owner) => G.citiesOf(s, owner).reduce((a, c) => a + G.lvl(c, 'magetower'), 0);
  G.magiCap = (s, owner) => { const t = towerLevels(s, owner); return t > 0 ? Math.min(MG.capMax, Math.ceil(t / MG.capPerTower)) : 0; };
  G.magiRecruitCost = (s, owner, rank = 1) => {
    const n = G.magiOf(s, owner).length, C = MG.cost;
    return { gold: C.gold + C.goldStep * n + C.goldRank * (rank - 1), mana: C.mana + C.manaStep * n + C.manaRank * (rank - 1) };
  };
  G.magiUpkeep = (s, g) => (MG.upkeep[clamp(g.rank, 1, 5) - 1] || 1) * G.pace(s).prod;
  const schoolsFor = (s, owner) => {
    let list = [];
    try { list = G.schoolsOf ? G.schoolsOf(s, owner) : []; } catch (e) { list = []; }
    list = (list || []).filter(k => DATA.schools && DATA.schools[k]);
    if (!list.length) { const race = s.empires[owner].race; list = Object.keys(DATA.schools || {}).filter(k => DATA.schools[k].race === race); }
    return list.length ? list : Object.keys(DATA.schools || { hearthweather: 1 });
  };
  const nameFor = (s, owner, r) => {
    const race = s.empires[owner].race;
    const L = DATA.magusNames[race] || DATA.magusNames.hearth;
    const used = new Set();
    for (const R of Object.values(store(s).realms)) { for (const g of R.list || []) used.add(g.name); for (const f of R.fallen || []) used.add(f.name); for (const c of (R.pool && R.pool.list) || []) used.add(c.name); }
    for (let i = 0; i < 30; i++) { const n = rpick(r, L[0]) + ' ' + rpick(r, L[1]); if (!used.has(n)) return n; }
    return rpick(r, L[0]) + ' ' + rpick(r, L[1]) + ' ' + (used.size + 1);
  };
  const rollTraits = r => {
    const keys = Object.keys(DATA.magusTraits);
    const t1 = rpick(r, keys), out = [t1];
    if (r() < 0.45) { const t2 = rpick(r, keys.filter(k => k !== t1 && !(t1 === 'devoted' && k === 'ambitious') && !(t1 === 'ambitious' && k === 'devoted'))); out.push(t2); }
    return out;
  };
  // a new magus (or candidate): deterministic from the realm, the sequence number and the hour
  const newMagus = (s, owner, opts = {}) => {
    const M = store(s);
    M.seq++;
    const r = prng(hashStr(`${owner}:${M.seq}:${Math.floor(s.time / 60)}:${opts.salt || ''}`));
    const emp = s.empires[owner];
    const schools = schoolsFor(s, owner);
    const age = opts.age != null ? opts.age : 18 + Math.floor(r() * 42);
    return {
      name: opts.name || nameFor(s, owner, r), race: emp.race, seed: (hashStr(owner + ':' + M.seq) % 1e9).toString(36),
      school: opts.school && DATA.schools[opts.school] ? opts.school : rpick(r, schools), rank: opts.rank || 1, xp: 0,
      bornS: nowS(s) - age * 4 - r() * 4, traits: opts.traits || rollTraits(r), loyalty: 70, hp: 100,
    };
  };
  // candidates: one for each city with a Mage Tower (at least two, at most four), refreshed every couple of game hours
  G.magiPool = (s, owner) => {
    const R = realm(s, owner);
    const towers = G.citiesOf(s, owner).filter(c => G.lvl(c, 'magetower') > 0).sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower')).slice(0, 4);
    const stale = !R.pool || s.time >= R.pool.next || !Array.isArray(R.pool.list) || R.pool.list.some(c => !s.cities[c.city] || s.cities[c.city].owner !== owner);
    if (stale || towers.length > (R.pool.towers || 0)) {
      R.pool = { next: s.time + MG.poolEvery * paceT(s), list: [], towers: towers.length };
      // one candidate per tower city, at least two to choose from, at most four
      const want = towers.length ? Math.max(2, towers.length) : 0;
      for (let i = 0; i < want; i++) {
        const c = towers[i % towers.length];
        const L = G.lvl(c, 'magetower');
        const r = prng(hashStr(`${owner}:${c.id}:${i}:${Math.floor(s.time / 600)}`));
        const x = r();
        const rank = L >= 10 && x < 0.1 ? 3 : L >= 5 && x < 0.3 ? 2 : 1;
        R.pool.list.push({ ...newMagus(s, owner, { rank, salt: c.id + ':' + i }), city: c.id });
      }
    }
    return R.pool;
  };
  const totalMana = (s, owner) => G.citiesOf(s, owner).reduce((a, c) => a + (c.res.mana || 0), 0);
  const payMana = (s, owner, first, amount) => {
    if (totalMana(s, owner) < amount) return false;
    let left = amount;
    const cs = G.citiesOf(s, owner);
    const order = first && first.owner === owner ? [first, ...cs.filter(c => c !== first)] : cs;
    for (const c of order) { const take = Math.min(left, Math.max(0, c.res.mana || 0)); c.res.mana -= take; left -= take; if (left <= 1e-9) break; }
    return true;
  };
  G.canRecruitMagus = (s, owner, idx = 0) => {
    if (!s.empires[owner]) return 'No such realm';
    const cap = G.magiCap(s, owner);
    if (G.magiOf(s, owner).length >= cap) return cap ? `The circle is full (${cap}): raise Mage Towers for room (1 magus per ${MG.capPerTower} tower levels)` : 'Build a Mage Tower first';
    const pool = G.magiPool(s, owner);
    const cand = pool.list[idx];
    if (!cand) return 'No such candidate';
    const city = s.cities[cand.city];
    if (!city || city.owner !== owner || !G.lvl(city, 'magetower')) return 'Candidates come to a city with a Mage Tower';
    const cost = G.magiRecruitCost(s, owner, cand.rank);
    if (s.empires[owner].gold < cost.gold) return `Needs ${cost.gold} gold`;
    if (totalMana(s, owner) < cost.mana) return `Needs ${cost.mana} mana`;
    return null;
  };
  G.recruitMagus = (s, owner, idx = 0) => {
    const err = G.canRecruitMagus(s, owner, idx);
    if (err) return err;
    const R = realm(s, owner), pool = R.pool, cand = pool.list[idx], city = s.cities[cand.city];
    const cost = G.magiRecruitCost(s, owner, cand.rank);
    s.empires[owner].gold -= cost.gold;
    payMana(s, owner, city, cost.mana);
    pool.list.splice(idx, 1);
    const M = store(s);
    const g = { ...cand, id: owner + 'm' + (++M.seq), station: 'idle', city: city.id, status: 'home', until: null, move: null, guard: false,
      battles: 0, duels: 0, wins: 0, joined: s.time, luredBy: null, honorAt: 0 };
    R.list.push(g);
    bump(s);
    G.log(s, owner, `🧙 ${g.name}, ${G.magusRankName(g).toLowerCase()} of ${DATA.schools[g.school].name}, joins the Circle in ${city.name}.`, 'good');
    return null;
  };
  // ---- stations ----
  G.courtMagusOf = (s, city) => {
    if (!city || !s.magi || !s.magi.realms) return null;
    const R = s.magi.realms[city.owner];
    return R ? R.list.find(g => g.station === 'court' && g.city === city.id) || null : null;
  };
  G.magiAt = (s, owner, cityId) => G.magiOf(s, owner).filter(g => g.city === cityId && g.status === 'home');
  G.stationMagus = (s, owner, id, station, cityId) => {
    const g = G.magusById(s, owner, id);
    if (!g) return 'No such magus';
    if (!['idle', 'court', 'war', 'study'].includes(station)) return 'Unknown station';
    if (g.status === 'marching') return `${g.name} is in the field`;
    const c = s.cities[cityId || g.city];
    if (!c || c.owner !== owner) return 'Only in your own cities';
    if ((station === 'court' || station === 'study') && !G.lvl(c, 'magetower')) return `${c.name} has no Mage Tower`;
    if (station === 'court') { const other = G.courtMagusOf(s, c); if (other && other !== g) return `${other.name} already serves as court magus of ${c.name}`; }
    if (g.station === station && g.city === c.id) return 'Already there';
    const from = s.cities[g.city];
    g.station = station;
    if (c.id !== g.city) {
      const dur = from && from.owner === owner ? G.travelTime(s, owner, from, c, MG.speed) : 60;
      g.city = c.id; g.status = 'riding'; g.until = s.time + dur;
    }
    bump(s);
    return null;
  };
  G.setMagusGuard = (s, owner, id, on) => { const g = G.magusById(s, owner, id); if (!g) return 'No such magus'; g.guard = !!on; return null; };
  G.dismissMagus = (s, owner, id) => {
    const g = G.magusById(s, owner, id);
    if (!g) return 'No such magus';
    if (g.status === 'marching') return `${g.name} is in the field`;
    const R = realm(s, owner);
    R.list = R.list.filter(x => x !== g);
    bump(s);
    G.log(s, owner, `🧙 ${g.name} leaves the Circle.`);
    return null;
  };
  G.honorCost = g => ({ gold: MG.honor.gold + MG.honor.goldRank * (g.rank - 1) });
  G.honorMagus = (s, owner, id) => {
    const g = G.magusById(s, owner, id);
    if (!g) return 'No such magus';
    if ((g.honorAt || 0) > s.time) return `Honoured recently (again in ${Math.ceil((g.honorAt - s.time) / 60)} min)`;
    const cost = G.honorCost(g).gold;
    if (s.empires[owner].gold < cost) return `Needs ${cost} gold`;
    s.empires[owner].gold -= cost;
    g.loyalty = Math.min(100, g.loyalty + MG.honor.gain);
    g.honorAt = s.time + MG.honor.coolMin * 60 * paceT(s);
    g.luredBy = null;
    return null;
  };

  // ---- effects: a per-revision index of courts, study and upkeep ----
  let IDX = null;
  const index = s => {
    const M = s.magi;
    if (!M) return null;
    const bucket = Math.floor(s.time / 60);
    if (IDX && IDX.s === s && IDX.rev === M.rev && IDX.bucket === bucket) return IDX;
    const court = new Map(), up = new Map(), count = new Map(), study = {};
    for (const [owner, R] of Object.entries(M.realms || {})) {
      let sb = 0, tower = null;
      for (const g of R.list || []) {
        // upkeep is drawn where a Mage Tower makes mana: the base city, else the realm's greatest tower
        let pay = s.cities[g.city];
        if (!pay || !G.lvl(pay, 'magetower')) {
          if (tower === null) tower = G.citiesOf(s, owner).sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'))[0] || false;
          if (tower && G.lvl(tower, 'magetower')) pay = tower;
        }
        if (pay) { up.set(pay.id, (up.get(pay.id) || 0) + (MG.upkeep[clamp(g.rank, 1, 5) - 1] || 1)); count.set(pay.id, (count.get(pay.id) || 0) + 1); }
        if (g.status !== 'home') continue;
        if (g.station === 'court') court.set(g.city, g);
        if (g.station === 'study') sb += (MG.studyBonus[0] + MG.studyBonus[1] * (g.rank - 1)) * (has(g, 'scholarly') ? 1.5 : 1);
      }
      study[owner] = Math.min(MG.studyCap, 1 + sb);
    }
    IDX = { s, rev: M.rev, bucket, court, up, count, study };
    return IDX;
  };
  // mana a city pays for the Circle each minute (nominal, before pace)
  G.magiUpkeepAt = (s, city) => { const I = index(s); return I ? (I.up.get(city.id) || 0) * G.pace(s).prod : 0; };
  // the court magus's effect on its city: { mana, cost, power, strain }
  G.magiCourtFx = (s, g, city) => {
    if (!g) return { mana: 1, cost: 1, power: 1, strain: 0 };
    let mana = MG.courtMana[0] + MG.courtMana[1] * (g.rank - 1);
    if (has(g, 'leysensitive')) mana *= city && G.leyPower && G.leyPower(s, city) > 0 ? 2 : 1.5;
    return { mana: 1 + mana, cost: 1 - MG.courtCost * g.rank, power: (1 + MG.courtPower * g.rank) * (has(g, 'reckless') ? 1.1 : 1), strain: MG.courtStrain * g.rank };
  };
  G.magiStudyBonus = (s, owner) => { const I = index(s); return (I && I.study[owner]) || 1; };
  // spells cast from a city: the casting city is known only while G.castSpell / G.spellStatus run
  let CAST = null;
  G.modSources.push((s, owner, city, key) => {
    if (key === 'mana') {
      if (!city || !s.magi) return 1;
      const I = index(s), g = I && I.court.get(city.id);
      return g && city.owner === owner ? G.magiCourtFx(s, g, city).mana : 1;
    }
    if ((key === 'spellCost' || key === 'spellPower') && !city && CAST && CAST.owner === owner && s.magi) {
      const c = s.cities[CAST.city], I = index(s), g = c && c.owner === owner && I && I.court.get(c.id);
      if (!g) return 1;
      const fx = G.magiCourtFx(s, g, c);
      return key === 'spellCost' ? fx.cost : fx.power;
    }
    return 1;
  });
  const withCast = (owner, cityId, fn) => {
    const prev = CAST, mc = G._modCache;
    CAST = { owner, city: cityId };
    G._modCache = null;           // the cache does not know the casting city
    try { return fn(); } finally { CAST = prev; G._modCache = mc; }
  };
  if (G.spellStatus) { const base = G.spellStatus; G.spellStatus = (s, owner, cityId, ...rest) => withCast(owner, cityId, () => base(s, owner, cityId, ...rest)); }
  if (G.castSpell) {
    const base = G.castSpell;
    G.castSpell = (s, owner, cityId, ...rest) => {
      const st = s.magic && s.magic.strain, before = st ? st[cityId] || 0 : 0;
      const err = withCast(owner, cityId, () => base(s, owner, cityId, ...rest));
      if (!err && st && s.magi) {
        const g = G.courtMagusOf(s, s.cities[cityId]);
        if (g && g.status === 'home') {
          const added = (st[cityId] || 0) - before;
          if (has(g, 'reckless') && added > 0) st[cityId] += added * 0.5;
          gainXp(s, owner, g, 4);
        }
      }
      return err;
    };
  }
  // upkeep: mana from the magus's base city, as a line in its economy (only where a Mage Tower draws mana; else from the realm's greatest tower)
  {
    const baseEcon = G.econ;
    G.econ = (s, city, away) => {
      const e = baseEcon(s, city, away);
      if (!s.magi) return e;
      const I = index(s);
      let v = I && I.up.get(city.id);
      if (!v) return e;
      v *= G.pace(s).prod;
      let full = false;                       // labelled lines only for the full breakdown (G.econLean leaves rawParts empty)
      for (const k in e.rawParts) { full = true; break; }
      if (full && e.sinks) { const n = I.count.get(city.id) || 0; (e.sinks.mana = e.sinks.mana || []).push({ label: `Circle of Magi (${n} ${n === 1 ? 'magus' : 'magi'})`, amount: -v }); }
      e.net.mana = (e.net.mana || 0) - v;
      e.use.mana = (e.use.mana || 0) + v;
      return e;
    };
  }

  // ---- experience, ranks ----
  const gainXp = (s, owner, g, amount) => {
    if (!g || !(amount > 0) || g.rank >= 5) return;
    g.xp += amount * (has(g, 'ambitious') ? 1.25 : 1);
    while (g.rank < 5 && g.xp >= G.magusXpNeed(g.rank)) {
      g.xp -= G.magusXpNeed(g.rank); g.rank++;
      g.loyalty = Math.min(100, g.loyalty + 8);
      bump(s);
      const learned = G.magusBattleSpells(g).filter(b => b.rank === g.rank);
      G.log(s, owner, `🧙 ${g.name} rises to ${G.magusRankName(g)}${learned.length ? ` and learns ${learned.map(b => b.icon + ' ' + b.name).join(', ')}` : ''}.`, 'good');
    }
    if (g.rank >= 5) g.xp = 0;
  };
  G.magusGainXp = gainXp;

  // ---- battle magic ----
  // the context of the march being resolved: { owner, units, move, magi: [ids] }
  let MCTX = null;
  const mageCount = units => { let n = 0; for (const u in units || {}) { const d = DATA.units[u]; if (d && d.mage) n += units[u] * d.mage; } return n; };
  const potency = (s, owner, g, units) => {
    const sp = owner ? G.mod(s, owner, null, 'spellPower') : 1;
    return sp * (1 + Math.min(0.4, 0.02 * mageCount(units))) * (has(g, 'reckless') ? 1.15 : 1) * (has(g, 'battlehardened') ? 1.1 : 1) * (g.hp < 50 ? 0.8 : 1);
  };
  const spellCostOf = g => 10 + 8 * g.rank;
  const able = g => g && g.hp >= 15;
  // the defending city whose garrison this is (live units only: previews pass copies)
  const defCityOf = (s, defOwner, def, pos) => {
    if (!defOwner || !s.empires[defOwner]) return null;
    if (pos) { const t = G.tileAt(s, pos.x, pos.y), c = t && t.city && s.cities[t.city]; return c && c.owner === defOwner && c.units === def ? c : null; }
    const R = s.magi.realms[defOwner];
    if (!R) return null;
    for (const g of R.list) { if (g.status !== 'home') continue; const c = s.cities[g.city]; if (c && c.units === def && c.owner === defOwner) return c; }
    return null;
  };
  const pickSpell = (g, side, used) => {
    const list = G.magusBattleSpells(g).filter(b => !used.has(b.id));
    if (!list.length) return null;
    const pref = side === 'att' ? { volley: 3, rout: 3, hex: 2, summon: 2, shield: 1 } : { shield: 3, summon: 3, hex: 2, volley: 1, rout: 1 };
    return list.sort((a, b) => (pref[b.kind] || 0) - (pref[a.kind] || 0) || b.rank - a.rank)[0];
  };
  const duelScore = (g, luck) => g.rank + (has(g, 'battlehardened') ? 1 : 0) - (has(g, 'frail') ? 1 : 0) + (has(g, 'reckless') ? 0.5 : 0) - (g.hp < 50 ? 0.5 : 0) + luck * 2;
  const info = (s, owner, g) => ({ owner, id: g.id, name: g.name, rank: g.rank, school: g.school, seed: g.seed, race: g.race, age: G.magusAge(s, g), station: g.station, did: [] });
  // ---- previews: what the war magi who would ride are expected to do ----
  // PV = { owner, units, riders: [magus], foe: number of the foe's magi who may answer, foeWar, hint }
  let PV = null;
  // the war magi of a city who would ride out with these units (the same rules as G.sendArmy / G.sendIntercept)
  const ridersFor = (s, city, units) => {
    if (!s.magi || !city) return [];
    const R = s.magi.realms[city.owner];
    if (!R || soldiers(units) < MG.rideMin) return [];
    return R.list.filter(g => g.station === 'war' && g.status === 'home' && g.city === city.id && !g.guard && g.hp >= MG.minHp).slice(0, MG.maxRiders);
  };
  G.magiRidersFor = ridersFor;
  const previewText = (pv, casts, mult, rec, foeMult = 1) => {
    const parts = [];
    const pct = Math.round((mult - 1) * 100);
    const landed = casts.filter(c => !c.countered);
    const hexPct = Math.round((1 - foeMult) * 100);
    const fx = [pct ? `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%` : '', hexPct > 0 ? `their strength −${hexPct}%` : ''].filter(Boolean).join(', ');
    if (landed.length) parts.push(`your ${landed.map(c => `${c.b.icon} ${c.b.name}`).join(', ')}${fx ? ' ' + fx : ''}`);
    const dry = rec ? rec.att.filter(x => x.did.some(d => /no mana/.test(d))).map(x => x.name) : [];
    if (dry.length) parts.push(`${dry.join(', ')} ${dry.length > 1 ? 'have' : 'has'} no mana to cast`);
    if (!landed.length && !dry.length && pv.riders.length) parts.push(`your ${pv.riders.length > 1 ? 'magi ride' : 'magus rides'} along`);
    if (pv.hint && !pv.riders.length) parts.push(pv.hint);
    if (pv.foe) parts.push(pv.foeWar ? `their ${pv.foe > 1 ? 'magi' : 'magus'} may duel and counter` : `their ${pv.foe > 1 ? 'magi' : 'magus'} may counter`);
    return parts.length ? 'Battle magic: ' + parts.join('; ') : null;
  };
  // run a battle preview (fn) for units sent from city; foeMagi: the foe's magi who may answer (shown, not simulated)
  G.magiPreviewWith = (s, city, units, foeMagi, fn) => {
    if (!s.magi || !city || (PV && PV.units === units)) return fn();
    const riders = ridersFor(s, city, units);
    const foe = (foeMagi || []).filter(able);
    const R = s.magi.realms[city.owner];
    const waiting = R && R.list.some(g => g.station === 'war' && g.status === 'home' && g.city === city.id && !g.guard);
    const hint = waiting && soldiers(units) < MG.rideMin ? `war magi ride only with ${MG.rideMin}+ soldiers` : null;
    if (!riders.length && !foe.length && !hint) return fn();
    const prev = PV;
    PV = { owner: city.owner, units, riders, foe: foe.length, foeWar: foe.some(g => g.station === 'war'), hint };
    try { return fn(); } finally { PV = prev; }
  };
  {
    const baseBattle = G.battle;
    G.battle = (s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode) => {
      if (!s.magi) return baseBattle(s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode);
      let opts = mode && typeof mode === 'object' ? mode : null;
      // a preview (G.magiPreviewWith): the magi who would ride cast on paper; nothing is paid, learned or rolled
      const pv = PV && PV.units === att && PV.owner === attOwner ? PV : null;
      const ctx = !pv && MCTX && MCTX.units === att && MCTX.owner === attOwner && !(G._gctx && G._gctx.preview) ? MCTX : null;
      const aMagi = pv ? pv.riders.filter(able) : ctx ? ctx.magi.map(id => G.magusById(s, attOwner, id)).filter(g => g && g.status === 'marching' && able(g)) : [];
      const amb = !opts && G._field && G._field.units === att && G._field.owner === attOwner;
      const pos = opts && opts.x !== undefined ? opts : amb ? G._field : null;
      // a garrison's magi only take part while a march is being resolved (the AI's estimates pass the live garrison too)
      const dc = !pv && G._field && !(G._gctx && G._gctx.preview) ? defCityOf(s, defOwner, def, pos) : null;
      // a column met in the field (js/intercept.js passes it as opts.defMove in real battles only): the war magi riding with it
      const dm = !pv && !dc && opts && opts.defMove && defOwner && opts.defMove.owner === defOwner ? opts.defMove : null;
      const dAll = dc ? G.magiAt(s, defOwner, dc.id).filter(able)
        : dm && dm.magi ? dm.magi.map(id => G.magusById(s, defOwner, id)).filter(g => g && g.status === 'marching' && g.move === dm.id && able(g)) : [];
      const dWar = dAll.filter(g => g.station === 'war'), dCourt = dAll.filter(g => g.station === 'court');
      if (!aMagi.length && !dAll.length) {
        const res = baseBattle(s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode);
        if (pv) { const t = previewText(pv, [], 1); if (t && res) res.magic = t; }
        return res;
      }
      if (!opts) opts = amb ? { ...G._field, mode, ambient: true } : { mode: mode || 'attack' };
      const rec = { att: aMagi.map(g => info(s, attOwner, g)), def: dAll.map(g => info(s, defOwner, g)), duel: null, notes: [] };
      const recOf = (side, g) => rec[side].find(x => x.id === g.id);
      // 1. a duel between the two champions (war magi only), decided by rank, traits and the luck of the hour
      const out = new Set();
      const champ = list => list.slice().sort((a, b) => b.rank - a.rank || b.hp - a.hp)[0];
      const ca = aMagi.length ? champ(aMagi) : null, cd = dWar.length ? champ(dWar) : null;
      if (ca && cd) {
        const r = prng(hashStr(`${Math.floor(s.time)}:${ca.id}:${cd.id}`));
        const sa = duelScore(ca, r()), sd = duelScore(cd, r());
        const winA = sa >= sd;
        const w = winA ? ca : cd, l = winA ? cd : ca;
        out.add(l.id);
        rec.duel = { att: ca.name, def: cd.name, winner: winA ? 'att' : 'def', winnerName: w.name, loserName: l.name };
      }
      // 2. casting: each able magus casts one spell (an Archmage two); mana is paid by the realm
      const casts = { att: [], def: [] };
      const manaLeft = { att: attOwner ? totalMana(s, attOwner) : 0, def: defOwner ? totalMana(s, defOwner) : 0 };
      const cast = (side, owner, list, units) => {
        for (const g of list) {
          if (out.has(g.id)) { recOf(side, g).did.push('lost the duel and cast nothing'); continue; }
          const used = new Set();
          for (let i = 0; i < (g.rank >= 5 ? 2 : 1); i++) {
            const b = pickSpell(g, side, used); if (!b) break;
            const cost = spellCostOf(g);
            if (manaLeft[side] < cost) { recOf(side, g).did.push('had no mana to cast'); break; }
            manaLeft[side] -= cost; used.add(b.id);
            casts[side].push({ g, b, cost, x: (1 + 0.25 * (g.rank - 1)) * potency(s, owner, g, units), countered: null });
          }
        }
      };
      cast('att', attOwner, aMagi, att);
      cast('def', defOwner, dWar, def);
      // 3. counterspells: every magus not beaten in the duel (court magi too, on their walls) may stop one spell
      //    of a lower rank; mage units lend +0.05 rank each (at most +1.5). Deterministic: rank decides.
      const counter = (side, list, units, foeCasts) => {
        const help = Math.min(1.5, 0.05 * mageCount(units));
        const free = list.filter(g => !out.has(g.id)).map(g => ({ g, n: g.rank >= 5 ? 2 : 1 }));
        for (const c of foeCasts.slice().sort((a, b) => b.g.rank - a.g.rank)) {
          const by = free.filter(f => f.n > 0 && f.g.rank + help >= c.g.rank + 1).sort((a, b) => b.g.rank - a.g.rank)[0];
          if (!by) continue;
          by.n--; c.countered = by.g;
        }
      };
      counter('def', [...dWar, ...dCourt], def, casts.att);
      counter('att', aMagi, att, casts.def);
      // 4. the effects, as labelled multipliers and casualty shaping
      const labels = [...(opts.labels || [])];
      const K = { att: { ...((opts.k && opts.k.att) || {}) }, def: { ...((opts.k && opts.k.def) || {}) } };
      const own = { att: 1, def: 1 }, hex = { att: 1, def: 1 };
      const kmul = (k, key, v) => { k[key] = (k[key] ?? 1) * v; };
      const pct = v => Math.round(v * 100);
      for (const side of ['att', 'def']) {
        const foe = side === 'att' ? 'def' : 'att';
        for (const c of casts[side]) {
          const r = recOf(side, c.g), x = c.x;
          if (c.countered) {
            r.did.push(`${c.b.icon} ${c.b.name} — countered by ${c.countered.name}`);
            const cr = recOf(foe, c.countered); if (cr) cr.did.push(`countered ${c.b.name}`);
            continue;
          }
          let txt = '';
          switch (c.b.kind) {
            case 'volley': own[side] *= 1 + 0.05 * x; kmul(K[side], 'volley', 1 + 0.25 * x); txt = `+${pct(0.05 * x)}% strength, sharper volley`; break;
            case 'shield': own[side] *= 1 + 0.02 * x; kmul(K[side], 'loss', 1 - 0.1 * x); txt = `${pct(0.1 * x)}% fewer losses`; break;
            case 'rout': kmul(K[side], 'foeLoss', 1 + 0.1 * x); kmul(K[side], 'pursuit', 1 + 0.3 * x); txt = `foe loses ${pct(0.1 * x)}% more`; break;
            case 'summon': own[side] *= 1 + 0.06 * x; txt = `+${pct(0.06 * x)}% strength`; break;
            case 'hex': hex[foe] *= 1 - 0.04 * x; txt = `foe −${pct(0.04 * x)}%`; break;
          }
          r.did.push(`${c.b.icon} ${c.b.name} (${txt})`);
        }
      }
      const B = { loss: [0.5, 1.4], foeLoss: [0.6, 1.5], volley: [0, 2.5], pursuit: [0, 2.2] };
      for (const side of ['att', 'def']) for (const key of Object.keys(B)) if (K[side][key] !== undefined) K[side][key] = clamp(K[side][key], B[key][0], B[key][1]);
      const mult = { att: clamp(own.att, 1, MG.side.max) * clamp(hex.att, MG.side.min, 1), def: clamp(own.def, 1, MG.side.max) * clamp(hex.def, MG.side.min, 1) };
      const names = side => [...new Set(casts[side].filter(c => !c.countered).map(c => c.g.name))].join(', ');
      const spells = side => casts[side].filter(c => !c.countered).map(c => `${c.b.icon} ${c.b.name}`).join(', ');
      if (Math.abs(mult.att - 1) >= 0.005) { labels.push({ side: 'att', label: pv ? `Battle magic: ${spells('att')} (expected)` : `Battle magic (${[names('att'), hex.att < 1 ? 'hexed' : ''].filter(Boolean).join('; ')})`, mult: mult.att, kind: 'magic' }); attMult *= mult.att; }
      if (Math.abs(mult.def - 1) >= 0.005) { labels.push({ side: 'def', label: `Battle magic (${[names('def'), hex.def < 1 ? 'hexed' : ''].filter(Boolean).join('; ')})`, mult: mult.def, kind: 'magic' }); defMult *= mult.def; }
      const k = (Object.keys(K.att).length || Object.keys(K.def).length) ? K : opts.k;
      const res = baseBattle(s, attOwner, att, attMult, defOwner, def, defMult, flatDef, { ...opts, labels, k });
      if (pv) {   // a preview stops here: no mana, experience, wounds or deaths, and the fate dice stay untouched
        if (res) { res.magic = previewText(pv, casts.att, mult.att, rec, mult.def); if (res.tactics) res.tactics.magi = { ...rec, preview: true }; }
        return res;
      }
      // 5. afterwards (real battles only: previews never reach here): mana, experience, the duel's toll, fates
      const pay = (owner, side, home) => { const tot = casts[side].reduce((a, c) => a + c.cost, 0); if (tot && owner) payMana(s, owner, home, tot); };
      pay(attOwner, 'att', ctx && s.cities[ctx.move.from]); pay(defOwner, 'def', dc);
      const fate = (side, owner, g, txt) => { const r = recOf(side, g); if (r) r.fate = txt; };
      if (rec.duel) {
        const w = rec.duel.winner === 'att' ? ca : cd, l = rec.duel.winner === 'att' ? cd : ca;
        const wo = rec.duel.winner === 'att' ? attOwner : defOwner, lo = rec.duel.winner === 'att' ? defOwner : attOwner;
        w.duels = (w.duels || 0) + 1; l.duels = (l.duels || 0) + 1; w.wins = (w.wins || 0) + 1;
        gainXp(s, wo, w, 30 + 10 * l.rank);
        const death = (0.06 + (has(l, 'frail') ? 0.08 : 0)) * (has(l, 'reckless') ? 2 : 1) * (has(l, 'battlehardened') ? 0.5 : 1);
        l.hp = Math.max(1, l.hp - (25 + Math.round(30 * rnd())));
        if (rnd() < death) { rec.duel.killed = true; kill(s, lo, l, `slain in a duel with ${w.name}`, wo); fate(rec.duel.winner === 'att' ? 'def' : 'att', lo, l, 'slain in the duel'); }
        else fate(rec.duel.winner === 'att' ? 'def' : 'att', lo, l, 'wounded in the duel');
      }
      for (const [side, owner, list] of [['att', attOwner, aMagi], ['def', defOwner, dAll]]) {
        const won = side === 'att' ? res.win : !res.win;
        const lostAll = side === 'att' ? !G.unitsCount(res.attLeft) : G.unitsCount(def) > 0 && !G.unitsCount(res.defLeft);
        for (const g of list) {
          if (g.dead) continue;
          const r = recOf(side, g);
          if (g.station !== 'war' && !r.did.length) continue;     // a court magus who had nothing to counter
          g.battles = (g.battles || 0) + 1;
          const nCast = casts[side].filter(c => c.g === g).length;
          gainXp(s, owner, g, 8 + 5 * nCast + 4 * r.did.filter(d => d.startsWith('countered')).length + (won ? 6 : 0));
          if (lostAll && (side === 'att' || g.station === 'war')) {
            const death = (side === 'att' ? 0.3 : 0.2) * (has(g, 'battlehardened') ? 0.5 : 1);
            if (rnd() < death) { kill(s, owner, g, 'in battle', side === 'att' ? defOwner : attOwner); fate(side, owner, g, 'fell in battle'); continue; }
            g.hp = Math.max(5, g.hp - 30);
            if (!recOf(side, g).fate) fate(side, owner, g, side === 'att' ? 'escaped wounded' : 'wounded');
          }
        }
      }
      const acted = rec.duel || [...rec.att, ...rec.def].some(x => x.did.length);
      if (!acted) return res;
      rec.att = rec.att.filter(x => x.did.length || x.fate); rec.def = rec.def.filter(x => x.did.length || x.fate);
      if (res && res.tactics) res.tactics.magi = rec;
      LAST = { units: att, rec };
      return res;
    };
  }
  let LAST = null;
  // reports: the magi who fought, what each did, and the duel
  const magiText = rec => {
    const parts = [];
    if (rec.duel) parts.push(`Duel: ${rec.duel.winnerName} beat ${rec.duel.loserName}${rec.duel.killed ? ' (slain)' : ''}.`);
    for (const x of [...rec.att, ...rec.def]) if (x.did.length) parts.push(`${x.name}: ${x.did.join('; ')}${x.fate ? ` — ${x.fate}` : ''}.`);
    return parts.join(' ');
  };
  {
    const baseReport = G.report;
    G.report = (s, owners, title, kind, body) => {
      if (body && body.attSent && !body.magi) {
        const rec = (body.tactics && body.tactics.magi) || (LAST && LAST.units === body.attSent ? LAST.rec : null);
        if (rec) { body = { ...body, magi: rec }; const t = magiText(rec); if (t) body.extra = (body.extra ? body.extra + ' ' : '') + '🧙 ' + t; }
      }
      return baseReport(s, owners, title, kind, body);
    };
  }

  // ---- war magi ride with hostile marches from their city ----
  const soldiers = units => { let n = 0; for (const u in units || {}) if (u !== 'hero' && DATA.units[u] && DATA.units[u].type !== 'civ') n += units[u]; return n; };
  {
    const baseSend = G.sendArmy;
    G.sendArmy = (s, fromId, x, y, type, units, cargo) => {
      const before = s.moves.length;
      const err = baseSend(s, fromId, x, y, type, units, cargo);
      if (err || !HOSTILE[type] || !s.magi || s.moves.length <= before) return err;
      G.magiRide(s, s.moves[s.moves.length - 1]);
      return err;
    };
  }
  // the war magi of the march's home city ride with it (hostile marches of 10+ soldiers; js/intercept.js calls this too).
  // The AI keeps its war magi home when it sends a quick interception (balance: tests/parity.js); the player's ride.
  G.magiRide = (s, m) => {
    if (!s.magi || !m || !HOSTILE[m.type] || m.magi || (m.type === 'intercept' && m.owner !== 'p')) return [];
    const city = s.cities[m.from];
    if (!city || m.owner !== city.owner) return [];
    const riders = ridersFor(s, city, m.units);
    for (const g of riders) { g.status = 'marching'; g.move = m.id; }
    if (riders.length) { m.magi = riders.map(g => g.id); bump(s); }
    return riders;
  };
  // a march that became another (a column following a changed course): its magi follow it
  G.magiRepoint = (s, owner, fromId, toId) => {
    if (!s.magi) return;
    const R = s.magi.realms[owner];
    if (R) for (const g of R.list) if (g.status === 'marching' && g.move === fromId) g.move = toId;
  };
  // resolve fn as the march m (hunts resolved outside G.resolveMove's chain: js/monsters.js): its magi cast
  G.magiMarch = (s, m, fn) => {
    if (!m || !m.magi || !s.magi) return fn();
    const prev = MCTX;
    MCTX = { owner: m.owner, units: m.units, move: m, magi: m.magi.slice() };
    try { return fn(); } finally { MCTX = prev; }
  };
  {
    const baseHome = G.sendHome;
    G.sendHome = (s, m, units, loot) => {
      const before = s.moves.length;
      const r = baseHome(s, m, units, loot);
      if (m.magi && s.moves.length > before) {
        const nm = s.moves[s.moves.length - 1];
        const riders = m.magi.map(id => G.magusById(s, m.owner, id)).filter(g => g && g.status === 'marching' && g.move === m.id);
        if (nm && nm.owner === m.owner && riders.length) { nm.magi = riders.map(g => g.id); for (const g of riders) g.move = nm.id; }
      }
      return r;
    };
  }
  const goHome = (s, owner, g, prefer) => {
    const c = [prefer, g.city].map(id => s.cities[id]).find(c => c && c.owner === owner) || G.capital(s, owner);
    if (!c) { kill(s, owner, g, 'with nowhere to go', null); return; }
    if (c.id !== g.city && g.station !== 'war') g.station = 'idle';      // a new city: the old post is gone
    g.status = 'home'; g.city = c.id; g.move = null; g.until = null;
    if ((g.station === 'court' || g.station === 'study') && !G.lvl(c, 'magetower')) g.station = 'idle';
    bump(s);
  };
  {
    const baseResolve = G.resolveMove;
    G.resolveMove = (s, m) => {
      if (!m.magi || !s.magi) return baseResolve(s, m);
      const ids = m.magi.slice();
      if (!HOSTILE[m.type]) {
        baseResolve(s, m);
        for (const id of ids) { const g = G.magusById(s, m.owner, id); if (g && g.status === 'marching' && g.move === m.id) goHome(s, m.owner, g, m.type === 'return' ? m.from : null); }
        return;
      }
      const prev = MCTX;
      MCTX = { owner: m.owner, units: m.units, move: m, magi: ids };
      try { baseResolve(s, m); } finally { MCTX = prev; }
      const tile = G.tileAt(s, m.x, m.y), tc = tile && tile.city && s.cities[tile.city];
      for (const id of ids) {
        const g = G.magusById(s, m.owner, id);
        if (!g || g.status !== 'marching' || g.move !== m.id) continue;
        if (tc && tc.owner === m.owner) { g.status = 'home'; g.city = tc.id; g.move = null; bump(s); }
        else goHome(s, m.owner, g, null);
      }
    };
  }

  // ---- death, defection ----
  const kill = (s, owner, g, cause, by) => {
    const R = realm(s, owner);
    R.list = R.list.filter(x => x !== g);
    g.dead = true;
    R.fallen.unshift({ name: g.name, rank: g.rank, school: g.school, seed: g.seed, race: g.race, cause, t: s.time });
    if (R.fallen.length > 8) R.fallen.length = 8;
    bump(s);
    if (by && s.empires[by]) s.empires[by].renownBonus = (s.empires[by].renownBonus || 0) + (g.rank >= 4 ? 8 : 3);
    G.log(s, owner, `⚰️ ${g.name}, ${G.magusRankName(g).toLowerCase()} of the Circle, ${cause === 'of old age' ? 'died of old age' : cause.startsWith('slain') ? 'was ' + cause : 'fell ' + cause}.`, 'bad');
    if (by === 'p' && owner !== 'p') G.log(s, 'p', `⚔️ ${g.name}, a magus of the ${s.empires[owner].name}, fell against us.`, 'good');
  };
  // a senior magus who dies of age leaves an apprentice to take over the station
  const succeed = (s, owner, g) => {
    if (g.rank < 3 || !s.empires[owner] || s.empires[owner].dead) return null;
    const a = { ...newMagus(s, owner, { rank: Math.max(1, g.rank - 2), school: g.school, age: 20 + Math.floor(rnd() * 10), salt: 'heir' + g.id }) };
    const M = store(s);
    Object.assign(a, { id: owner + 'm' + (++M.seq), station: g.station === 'war' ? 'war' : g.station, city: g.city, status: g.status === 'marching' ? 'home' : g.status, until: g.until || null, move: null, guard: g.guard,
      battles: 0, duels: 0, wins: 0, joined: s.time, luredBy: null, honorAt: 0, apprenticeOf: g.name });
    const c = s.cities[a.city];
    if (!c || c.owner !== owner) { const cap = G.capital(s, owner); if (!cap) return null; a.city = cap.id; a.station = 'idle'; a.status = 'home'; }
    realm(s, owner).list.push(a);
    bump(s);
    return a;
  };
  const defect = (s, owner, g) => {
    const R = realm(s, owner);
    const to = g.luredBy && s.empires[g.luredBy] && !s.empires[g.luredBy].dead && g.luredBy !== owner ? g.luredBy : null;
    R.list = R.list.filter(x => x !== g);
    bump(s);
    const T = to && G.capital(s, to);
    if (T && G.magiOf(s, to).length < G.magiCap(s, to) + 1) {
      Object.assign(g, { id: to + 'm' + (++store(s).seq), station: 'idle', city: T.id, status: 'home', move: null, until: null, loyalty: 65, luredBy: null, guard: false });
      realm(s, to).list.push(g);
      G.log(s, owner, `🪄 ${g.name} has defected to the ${s.empires[to].name}!`, 'bad');
      if (to === 'p') G.log(s, 'p', `🪄 ${g.name}, a ${G.magusRankName(g).toLowerCase()} of the ${s.empires[owner].name}, defects to us and waits in ${T.name}.`, 'good');
      return to;
    }
    R.fallen.unshift({ name: g.name, rank: g.rank, school: g.school, seed: g.seed, race: g.race, cause: 'went rogue', t: s.time });
    if (R.fallen.length > 8) R.fallen.length = 8;
    G.log(s, owner, `🪄 ${g.name} has abandoned the Circle and gone rogue.`, 'bad');
    return 'rogue';
  };
  G.magiDefect = defect;
  // the yearly risk of dying of age
  G.magusMortality = (age, g) => (age < 50 ? 0.01 : 0.03 + 0.015 * (age - 50)) * (has(g, 'frail') ? 2 : 1);
  const loyaltyTarget = (s, owner, g, R) => {
    const L = MG.loyalty;
    let t = L.base + (g.station === 'court' ? 8 : 0) + (has(g, 'devoted') ? 15 : 0);
    if (has(g, 'ambitious')) { t -= 15; if (R.list.some(x => x !== g && x.rank > g.rank)) t -= 10; }
    const c = s.cities[g.city];
    if (c && c.short && c.short.mana) t -= 25;
    if (g.hp < 40) t -= 5;
    return clamp(t, 0, 100);
  };

  // ---- the passing of time: travel, healing, experience, loyalty, age, lures, defection ----
  const tick = (s, dtMin) => {
    const M = store(s);
    const yearMin = 4 * seasonLen(s) / 60;
    const hourMin = 60 * paceT(s);
    for (const [owner, R] of Object.entries(M.realms)) {
      const emp = s.empires[owner];
      if (!emp || emp.dead) { if (R.list.length) { R.list = []; bump(s); } R.pool = null; continue; }
      for (const g of [...R.list]) {
        if (g.dead) continue;
        if (g.status === 'riding' && s.time >= (g.until || 0)) { g.status = 'home'; g.until = null; bump(s); }
        if (g.status === 'marching' && !s.moves.some(m => m.id === g.move && m.owner === owner)) goHome(s, owner, g, null);
        if (g.dead) continue;
        // a base city lost: the court is taken by the conquerors, the rest flee to the capital
        const base = s.cities[g.city];
        if ((g.status === 'home' || g.status === 'riding') && (!base || base.owner !== owner)) {
          const conq = base && base.owner;
          if (conq && s.empires[conq] && !s.empires[conq].dead && conq !== owner && rnd() < 0.5 && !has(g, 'devoted') && G.magiOf(s, conq).length < G.magiCap(s, conq) + 1) { g.luredBy = conq; defect(s, owner, g); continue; }
          goHome(s, owner, g, null);
          if (g.dead) continue;
          if (owner === 'p') G.log(s, 'p', `🧙 ${g.name} fled to ${s.cities[g.city].name}.`, 'warn');
        }
        if (g.status === 'home' && g.hp < 100) g.hp = Math.min(100, g.hp + MG.regen * dtMin / hourMin);
        // experience from service
        if (g.status === 'home') {
          const rate = (MG.xpRate[g.station] || 0) * ((g.station === 'court' || g.station === 'study') && has(g, 'scholarly') ? 1.5 : 1);
          gainXp(s, owner, g, rate * dtMin / paceT(s));
        }
        // court: the weave settles faster around a court magus
        if (g.status === 'home' && g.station === 'court' && s.magic && s.magic.strain && s.magic.strain[g.city] > 0) {
          s.magic.strain[g.city] = Math.max(0, s.magic.strain[g.city] - G.magiCourtFx(s, g, base).strain * dtMin);
        }
        // loyalty drifts toward what the magus thinks they deserve
        const T = loyaltyTarget(s, owner, g, R);
        g.loyalty = g.loyalty < T ? Math.min(T, g.loyalty + MG.loyalty.drift * dtMin) : Math.max(T, g.loyalty - MG.loyalty.drift * 0.5 * dtMin);
        // rivals send gifts and promises
        if (!has(g, 'devoted') && g.status !== 'marching') {
          const p = MG.loyalty.lurePerHour * (has(g, 'ambitious') ? 2 : 1) * (g.rank >= 3 ? 1.5 : 1) * dtMin / hourMin;
          if (rnd() < p) {
            const rivals = Object.values(s.empires).filter(e => e.id !== owner && !e.dead && e.gold > 400 && G.magiCap(s, e.id) > 0);
            if (rivals.length) {
              const by = rivals[Math.floor(rnd() * rivals.length)];
              const drop = 10 + Math.round(10 * rnd());
              g.loyalty = Math.max(0, g.loyalty - drop); g.luredBy = by.id;
              if (owner === 'p') G.log(s, 'p', `🪄 The ${by.name} sent gifts and promises to ${g.name} (loyalty −${drop}, now ${Math.round(g.loyalty)}).`, 'warn');
            }
          }
        }
        // a disloyal magus leaves
        if (g.loyalty < MG.loyalty.defect && !has(g, 'devoted') && g.status !== 'marching' && rnd() < MG.loyalty.defectPerHour * dtMin / hourMin) { defect(s, owner, g); continue; }
        // age
        const age = (nowS(s) - g.bornS) / 4;
        if (rnd() < G.magusMortality(age, g) * dtMin / yearMin && g.status !== 'marching') {
          kill(s, owner, g, 'of old age', null);
          const a = succeed(s, owner, g);
          if (a && owner === 'p') G.log(s, 'p', `🧙 ${a.name}, apprentice of ${g.name}, takes up the ${g.station === 'court' ? 'court' : g.station} post${s.cities[a.city] ? ' in ' + s.cities[a.city].name : ''}.`, 'info');
        }
      }
    }
  };
  G.magiTick = (s, dtMin) => tick(s, dtMin);
  G.slowHooks.push((s, dtMin) => {
    if (!s.magi) { if (!Object.values(s.cities).some(c => G.lvl(c, 'magetower') > 0)) return; store(s); }
    tick(s, dtMin);
    aiMagi(s);
  });

  // ---- the AI's circle ----
  const aiMagi = s => {
    const every = 3 * 60 * paceT(s);
    for (const emp of Object.values(s.empires)) {
      if (emp.id === 'p' || emp.dead) continue;
      const owner = emp.id;
      const cap = G.magiCap(s, owner);
      if (!cap) continue;
      const R = realm(s, owner);
      if (s.time < (R.aiAt || 0)) continue;
      R.aiAt = s.time + every * (0.8 + 0.4 * rnd());
      // keep them loyal
      for (const g of R.list) if (g.loyalty < 35 && emp.gold > G.honorCost(g).gold * 3) G.honorMagus(s, owner, g.id);
      // recruit when gold and mana allow
      if (R.list.length < cap) {
        const pool = G.magiPool(s, owner);
        const best = pool.list.map((c, i) => ({ c, i })).sort((a, b) => b.c.rank - a.c.rank)[0];
        if (best) {
          const cost = G.magiRecruitCost(s, owner, best.c.rank);
          if (emp.gold > cost.gold * 2.5 && totalMana(s, owner) > cost.mana * 2 + 100) G.recruitMagus(s, owner, best.i);
        }
      }
      // give idle magi a post: a court in the best tower city, war magi where the army gathers, the rest to study
      const cities = G.citiesOf(s, owner);
      const towers = cities.filter(c => G.lvl(c, 'magetower') > 0).sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'));
      const hub = cities.slice().sort((a, b) => soldiers(b.units) - soldiers(a.units))[0];
      for (const g of R.list) {
        if (g.status !== 'home' || g.station !== 'idle') continue;
        const courtless = towers.find(c => !G.courtMagusOf(s, c));
        const war = R.list.filter(x => x.station === 'war').length;
        if (courtless && (R.list.filter(x => x.station === 'court').length <= war)) G.stationMagus(s, owner, g.id, 'court', courtless.id);
        else if (hub && war < Math.ceil(R.list.length / 2)) G.stationMagus(s, owner, g.id, 'war', hub.id);
        else if (towers[0]) G.stationMagus(s, owner, g.id, 'study', towers[0].id);
        else if (hub) G.stationMagus(s, owner, g.id, 'war', hub.id);
      }
      // war magi follow the army
      if (hub) for (const g of R.list) if (g.station === 'war' && g.status === 'home' && g.city !== hub.id && soldiers((s.cities[g.city] || {}).units) < soldiers(hub.units) * 0.4) G.stationMagus(s, owner, g.id, 'war', hub.id);
    }
  };
  G.aiMagi = aiMagi;

  // ---- portraits ----
  G.magusSpec = (s, owner, g) => {
    const age = g.bornS != null ? G.magusAge(s, g) : (g.age || 40);
    return { race: g.race || (s.empires[owner] || {}).race || 'hearth', kind: 'magus', school: g.school, rank: g.rank, era: G.techEra ? G.techEra(s, owner) : 0,
      seed: 'magus:' + g.seed, age: age < 30 ? 'young' : age < 55 ? 'adult' : 'old', color: (DATA.schools[g.school] || {}).color, dead: !!g.dead,
      wounded: g.hp != null && g.hp < 100 && !g.dead ? Math.round((100 - g.hp) / 25) / 4 : 0 };
  };

  // new games start with an empty circle (old saves get one lazily)
  G.newGameHooks.push(s => { store(s); });
})();
