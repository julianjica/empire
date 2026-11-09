// =====================================================================
//  Dynasties — every realm has a RULER (distinct from its hero, who is
//  usually the ruler's eldest child), a family that marries, has children,
//  educates them and quarrels over the crown. Rulers age with the calendar
//  (one game year = 4 seasons = G.season's year), fall ill, die in battle
//  or under an assassin's knife, and the crown passes by the realm's
//  succession law. A weak, young or unpopular heir means a crisis: loyalty
//  falls, a pretender may raise a city, and realms tied by marriage may
//  press a claim (a war goal: take the claimed city).
//
//  State (lazy, plain JSON — old saves grow a dynasty on first look):
//    s.dynasty = { v, realms: { owner: D }, claims: [{ by, on, city, until, t }] }
//    D = { v, owner, realm (empire name, to notice Endless rebirths), house, race, rulerId, heir (chosen law),
//          law: 'eldest'|'chosen'|'elective', prestige, season (last processed season index), lead (rides to war),
//          regent: { id, name, female, st } | null, crisis: { until, sev, happy } | null, lawUntil, lawCool,
//          heroId (the person who is the realm's hero), past: [ruler records], people: { id: person }, rev }
//    person = { id, name, female, bornS (season index of birth, fractional), blood (born of the house),
//               parents: [ids], spouse: id|null, from: null|'noble'|realmId, traits: [], st: {dip,mar,stw,lrn,int},
//               focus: null|stat key, dead, diedS, cause, crownS, cousin }
//  Effects: G.mod (tax, atk, researchTime, buildTime, trainTime, counterintel, spy, def …) from stats and traits,
//  and wrappers for happiness, faith, culture, hostility (ruler regard and claims) and spy missions (assassination).
//  Public: G.ruler(s, owner) (null for free cities), G.dynasty, G.dynAge, G.dynHeir, G.rulerFx, G.rulerRegard,
//  G.dynSetFocus / dynSetHeir / dynSetLaw / dynMarry / dynLead, G.dynKill, G.dynTick, G.dynTitle, G.dynTie.
//  Pure engine code (no DOM); the UI lives in ui-dynasty.js.
// =====================================================================
'use strict';
(() => {
  const DY = G.DYN = {
    seasonSec: 7200,      // one season (× pace) — mirrors G.season; a year is four of them
    adult: 16,            // coming of age
    eduFrom: 5,           // tutors take children from this age
    fertile: [17, 42],    // years in which a married woman may bear children
    birth: 0.11,          // chance per season for a fertile married couple
    maxKids: 6, maxCourt: 18,
    mortality: 3,         // × the base yearly hazard: a perilous age
    battleDeath: 0.03,    // chance a ruler who leads dies in a lost battle
    assassin: 0.05,       // chance a successful grave mission at a capital also slays the ruler
    prestigeSeason: 6,
    lawCost: 60, lawCoolMin: 240, lawUnrestMin: 30,
    crisisMin: [25, 100], loyaltyDrop: [4, 26], crisisHappy: [2, 9],
    claimMin: 300, claimPrestige: 80,
    stab: 12,             // a successor this strong rules without a crisis
    maxCatchUp: 48,
  };
  const paceT = s => G.pace(s).time;
  const seasonLen = s => DY.seasonSec * paceT(s);
  const nowS = s => s.time / seasonLen(s);                    // fractional season index
  const MIN = s => 60 * paceT(s);
  const STATS = ['dip', 'mar', 'stw', 'lrn', 'int'];
  DATA.rulerStats = {
    dip: { name: 'Diplomacy', icon: '🕊️', desc: 'Other rulers think better of a skilled diplomat.' },
    mar: { name: 'Martial', icon: '⚔️', desc: '+0.3% attack per point above 8.' },
    stw: { name: 'Stewardship', icon: '📜', desc: '+0.4% taxes per point above 8.' },
    lrn: { name: 'Learning', icon: '📚', desc: '−0.3% research time per point above 8.' },
    int: { name: 'Intrigue', icon: '🗝️', desc: '+1% counter-intelligence and +0.5% spy skill per point above 8.' },
  };
  DATA.rulerFocus = { mar: 'Martial', stw: 'Stewardship', lrn: 'Learning', dip: 'Diplomacy', int: 'Intrigue' };

  // ---- traits. fx: G.mod multipliers · happy: happiness in every city · faith/culture: realm rate multipliers
  //  regard: how other rulers see this one · loyalty: loyalty regained per minute · health: mortality multiplier
  //  fert: fertility · battle: risk of dying in a lost battle · prestige: prestige gain · legit: succession strength
  //  st: stat bonus · edu: the tutor focus that tends to produce it · lead: rides to war
  DATA.rulerTraits = {
    builder:   { name: 'Builder',         icon: '🔨', fx: { buildTime: 0.95 }, edu: 'stw', desc: '−5% building time.' },
    just:      { name: 'Just',            icon: '⚖️', happy: 2, loyalty: 0.12, legit: 1, opp: 'cruel', edu: 'dip', desc: '+2 happiness, loyalty recovers faster.' },
    cruel:     { name: 'Cruel',           icon: '🩸', happy: -3, regard: -6, fear: 0.5, legit: 0.5, opp: 'just', edu: 'int', desc: '−3 happiness; feared: pretenders rise half as often.' },
    pious:     { name: 'Pious',           icon: '🙏', faith: 1.1, happy: 1, edu: 'lrn', desc: '+10% faith, +1 happiness.' },
    scholar:   { name: 'Scholar',         icon: '📚', fx: { researchTime: 0.95 }, st: { lrn: 2 }, edu: 'lrn', heritable: 1, desc: '−5% research time, +2 learning.' },
    warlike:   { name: 'Warlike',         icon: '⚔️', fx: { atk: 1.04 }, regard: -10, lead: 1, edu: 'mar', desc: '+4% attack; other rulers are wary (−10 regard); rides to war.' },
    greedy:    { name: 'Greedy',          icon: '💰', fx: { tax: 1.06 }, happy: -2, regard: -3, opp: 'generous', edu: 'stw', desc: '+6% taxes, −2 happiness.' },
    charming:  { name: 'Charming',        icon: '😊', regard: 10, st: { dip: 2 }, legit: 1, opp: 'deceitful', edu: 'dip', heritable: 1, desc: '+10 regard with other rulers, +2 diplomacy.' },
    paranoid:  { name: 'Paranoid',        icon: '👁️', fx: { counterintel: 1.15 }, happy: -1, regard: -3, assassin: 0.4, edu: 'int', desc: '+15% counter-intelligence, assassins rarely succeed; −1 happiness.' },
    sickly:    { name: 'Sickly',          icon: '🤒', health: 2.2, legit: -1, opp: 'robust', heritable: 1, desc: 'Far more likely to die of illness.' },
    robust:    { name: 'Robust',          icon: '💪', health: 0.6, st: { mar: 1 }, opp: 'sickly', edu: 'mar', heritable: 1, desc: 'Rarely ill; +1 martial.' },
    brave:     { name: 'Brave',           icon: '🦁', fx: { atk: 1.02, def: 1.02 }, battle: 1.5, lead: 1, legit: 1, opp: 'craven', edu: 'mar', heritable: 1, desc: '+2% attack and defense; rides to war (and risks more there).' },
    craven:    { name: 'Craven',          icon: '🐇', fx: { atk: 0.97 }, battle: 0.3, prestige: 0.8, legit: -1, opp: 'brave', heritable: 1, desc: '−3% attack, less prestige; stays far from danger.' },
    generous:  { name: 'Generous',        icon: '🎁', happy: 2, fx: { tax: 0.97 }, regard: 5, opp: 'greedy', edu: 'dip', desc: '+2 happiness and +5 regard, −3% taxes.' },
    ambitious: { name: 'Ambitious',       icon: '🔥', prestige: 1.4, fx: { trainTime: 0.96 }, regard: -5, claim: 1.4, opp: 'humble', edu: 'int', desc: '+40% prestige, −4% training time; presses claims eagerly.' },
    humble:    { name: 'Humble',          icon: '🕊️', happy: 1, prestige: 0.85, regard: 3, legit: 0.5, opp: 'ambitious', edu: 'dip', desc: '+1 happiness, +3 regard, less prestige.' },
    patron:    { name: 'Patron of Arts',  icon: '🎭', culture: 1.1, prestige: 1.1, edu: 'lrn', desc: '+10% culture.' },
    shrewd:    { name: 'Shrewd',          icon: '🧮', fx: { tax: 1.03 }, st: { stw: 2 }, edu: 'stw', heritable: 1, desc: '+3% taxes, +2 stewardship.' },
    deceitful: { name: 'Deceitful',       icon: '🐍', fx: { spy: 1.1 }, st: { int: 2 }, regard: -5, opp: 'charming', edu: 'int', desc: '+10% spy skill, +2 intrigue, −5 regard.' },
    fertile:   { name: 'Fertile',         icon: '🌱', fert: 1.7, heritable: 1, desc: 'Many children.' },
  };
  DATA.rulerTraitOrder = Object.keys(DATA.rulerTraits);
  const TR = k => DATA.rulerTraits[k] || {};
  // each people's bent when traits are rolled
  const RACE_TRAITS = {
    hearth: { just: 2, generous: 2, pious: 1.5, builder: 1.5 }, delver: { builder: 2.5, shrewd: 2, greedy: 1.5, robust: 1.5 },
    sylvan: { patron: 2, scholar: 2, pious: 1.5, humble: 1.5 }, ash: { warlike: 3, brave: 2, cruel: 1.5, ambitious: 1.5 },
    tide: { charming: 2, shrewd: 2, generous: 1.5 }, veil: { deceitful: 2.5, paranoid: 2, scholar: 1.5, charming: 1.5 },
    grave: { cruel: 2, paranoid: 1.5, scholar: 2, robust: 1 }, wind: { brave: 2, ambitious: 2, charming: 1.5 },
  };
  const RACE_FOCUS = { hearth: 'stw', delver: 'stw', sylvan: 'lrn', ash: 'mar', tide: 'dip', veil: 'int', grave: 'lrn', wind: 'mar' };

  DATA.successionLaws = {
    eldest:   { name: 'Eldest-born',     icon: '👶', legit: 1.5, desc: 'The eldest living child inherits, even a child (a regent rules until they come of age). Predictable and stable.' },
    chosen:   { name: 'Designated heir', icon: '☝️', legit: 0.5, desc: 'The ruler names any member of the blood. Passing over an elder child unsettles the court.' },
    elective: { name: 'Elective',        icon: '🗳️', legit: 1,   desc: 'The great nobles elect the ablest adult of the blood, or one of their own. Never a child on the throne, but the house may lose the crown.' },
  };
  const RACE_LAW = { sylvan: 'elective', ash: 'chosen', wind: 'chosen' };

  DATA.rulerTitles = {
    hearth: ['King', 'Queen', 'Prince', 'Princess'], delver: ['High Thane', 'High Thane', 'Thane-son', 'Thane-daughter'],
    sylvan: ['Elder-King', 'Elder-Queen', 'Prince', 'Princess'], ash: ['Warchief', 'Warchief', 'Chief-son', 'Chief-daughter'],
    tide: ['Tide-King', 'Tide-Queen', 'Prince', 'Princess'], veil: ['Moon-Prince', 'Moon-Princess', 'Princeling', 'Princess'],
    grave: ['Lich-King', 'Lich-Queen', 'Heir', 'Heir'], wind: ['Sky-Lord', 'Sky-Lady', 'Fledgling', 'Fledgling'],
  };
  DATA.dynNames = {
    hearth: { m: ['Aldric', 'Edmund', 'Godric', 'Harold', 'Oswin', 'Wilfred', 'Roland', 'Tobias', 'Cedric', 'Alaric', 'Osbert', 'Hugh'], f: ['Edith', 'Matilda', 'Rowena', 'Elspeth', 'Maud', 'Isolde', 'Agnes', 'Wynne', 'Gwen', 'Beatrix', 'Alys', 'Hilde'], h: ['Oakshield', 'Brackenridge', 'Ashcombe', 'Thornfield', 'Fairbairn', 'Wheatley'] },
    delver: { m: ['Brokk', 'Gundar', 'Hrodik', 'Thorvald', 'Ruddik', 'Kragni', 'Orrin', 'Bardur', 'Ulfgar', 'Dorn'], f: ['Hilda', 'Thessa', 'Odda', 'Brynja', 'Sigrun', 'Dagna', 'Ingrid', 'Helka', 'Runa', 'Vigdis'], h: ['Deepanvil', 'Stonebrow', 'Ironmantle', 'Flintvein', 'Hammerfall', 'Copperjaw'] },
    sylvan: { m: ['Ithrael', 'Aelor', 'Faelan', 'Caerwyn', 'Elaros', 'Sylvar', 'Orivan', 'Lethran', 'Maelis'], f: ['Saelith', 'Lysandre', 'Nimrae', 'Oriel', 'Elowen', 'Ilyra', 'Faeryn', 'Aerin', 'Thessaly'], h: ['Dawnwhisper', 'Moonbough', 'Silverbark', 'Fernsong', 'Starbloom', 'Mistwood'] },
    ash:    { m: ['Gorrak', 'Murz', 'Drazhul', 'Throk', 'Ugrash', 'Karg', 'Morgash', 'Brakk', 'Grosh'], f: ['Vashka', 'Kharza', 'Zugra', 'Yeska', 'Shagra', 'Urza', 'Grisha', 'Mogra', 'Ruzga'], h: ['Bloodtusk', 'Skullbreaker', 'Cinderfang', 'Ashmaw', 'Ironhide', 'Embergut'] },
    tide:   { m: ['Corwen', 'Brannoc', 'Halvard', 'Merrow', 'Doran', 'Kael', 'Pellam', 'Tristan', 'Ewan'], f: ['Marenna', 'Ysolt', 'Nerys', 'Coralie', 'Seren', 'Maris', 'Ondine', 'Lirien', 'Morva'], h: ['Saltbraid', 'Tidewright', 'Pearlhand', 'Gullcry', 'Deepcurrent', 'Foamcrest'] },
    veil:   { m: ['Quillon', 'Peregrin', 'Morrow', 'Ilvane', 'Sorel', 'Caspian', 'Evander', 'Noctis', 'Aubrin'], f: ['Sorrelai', 'Liraeth', 'Ilvaine', 'Selune', 'Mirelle', 'Vespera', 'Nyxa', 'Elara', 'Opaline'], h: ['Duskwhisper', 'Mothwing', 'Hollowmoon', 'Glassbloom', 'Thistlecrown', 'Gloaming'] },
    grave:  { m: ['Vael', 'Morcant', 'Ostrik', 'Malgrin', 'Corvin', 'Hadrian', 'Lucan', 'Severin', 'Aldous'], f: ['Cerys', 'Edda', 'Morwen', 'Ysolde', 'Lenore', 'Ophelia', 'Sabine', 'Vesna', 'Mortain'], h: ['Ashveil', 'Gravemantle', 'Bonewright', 'Pale', 'Barrowmere', 'Nightlock'] },
    wind:   { m: ['Aerik', 'Kestrel', 'Falkor', 'Corvus', 'Arran', 'Zephyr', 'Talon', 'Rook', 'Haldor'], f: ['Aeryn', 'Skye', 'Wren', 'Lark', 'Sora', 'Kestra', 'Brisa', 'Ilsa', 'Merla'], h: ['Highcrest', 'Stormfeather', 'Galewing', 'Cloudreach', 'Swiftwind', 'Eyrie'] },
  };
  const namesOf = race => DATA.dynNames[race] || DATA.dynNames.hearth;

  // -------------------------------------------------------------------
  // small helpers
  // -------------------------------------------------------------------
  const realmOk = (s, owner) => { const e = s && s.empires && s.empires[owner]; return !!(e && !e.minor); };
  const weighted = obj => {
    const ent = Object.entries(obj).filter(([, w]) => w > 0);
    const tot = ent.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * tot;
    for (const [k, w] of ent) { r -= w; if (r <= 0) return k; }
    return ent.length ? ent[ent.length - 1][0] : null;
  };
  const touch = D => { D.rev = (D.rev || 0) + 1; };
  const alive = D => Object.values(D.people).filter(p => !p.dead);
  const ageAt = (p, sIdx) => (sIdx - p.bornS) / 4;
  G.dynAge = (s, p) => p ? Math.max(0, Math.floor(ageAt(p, p.dead && p.diedS != null ? p.diedS : nowS(s)))) : 0;
  const ageF = (s, p) => ageAt(p, nowS(s));
  const known = (s, owner) => owner === 'p' || !!(G.chronKnown && (() => { try { return G.chronKnown(s).includes(owner); } catch (e) { return false; } })());
  const sayP = (s, owner, text, kind) => { if (owner === 'p') G.log(s, 'p', text, kind); else if (known(s, owner)) G.log(s, 'p', text, kind || 'info'); };
  const chron = (s, k, d) => { try { if (G.chronEvent) G.chronEvent(s, k, d); } catch (e) { } };

  const pickName = (s, D, race, female) => {
    const pool = namesOf(race)[female ? 'f' : 'm'];
    const used = new Set(alive(D).map(p => p.name));
    const h = G.heroOf && D.owner && G.heroOf(s, D.owner);
    if (h && h.name) { used.add(h.name); used.add(String(h.name).split(' ')[0]); }
    const free = pool.filter(n => !used.has(n));
    if (free.length) return G.pick(free);
    // regnal numbers for repeated names
    const n = G.pick(pool);
    const k = Object.values(D.people).filter(p => p.name.split(' ')[0] === n).length + 1;
    return `${n} ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(10, k)] || k}`;
  };
  const rollStats = (primary) => {
    const st = {};
    for (const k of STATS) st[k] = G.rint(3, 11);
    if (primary) st[primary] = Math.min(18, st[primary] + G.rint(4, 7));
    return st;
  };
  const canTake = (p, t) => !p.traits.includes(t) && !p.traits.some(x => TR(x).opp === t || TR(t).opp === x);
  const addTrait = (p, t) => { if (t && DATA.rulerTraits[t] && canTake(p, t) && p.traits.length < 3) { p.traits.push(t); return true; } return false; };
  const rollTrait = (s, owner, p, bias) => {
    const e = s.empires[owner] || {};
    const w = {};
    for (const k of DATA.rulerTraitOrder) if (canTake(p, k)) w[k] = 1;
    for (const [k, v] of Object.entries(RACE_TRAITS[e.race] || {})) if (w[k]) w[k] = v;
    try {
      if (G.ethosOf) { const et = G.ethosOf(s, owner) || {}; if ((et.war || 0) >= 4 && w.warlike) w.warlike += 1.5; if ((et.war || 0) <= -4 && w.humble) w.humble += 1; if ((et.faith || 0) >= 4 && w.pious) w.pious += 1.5; if ((et.open || 0) >= 4 && w.scholar) w.scholar += 1; }
    } catch (e2) { }
    if (bias) for (const k of DATA.rulerTraitOrder) if (w[k] && TR(k).edu === bias) w[k] *= 12;
    if (w.sickly) w.sickly *= 0.5;
    return weighted(w);
  };
  const newPerson = (s, D, o) => {
    const p = { id: G.newId(s, 'r'), name: o.name, female: !!o.female, bornS: o.bornS, blood: !!o.blood, parents: o.parents || [], spouse: null,
      from: o.from === undefined ? null : o.from, traits: [], st: o.st || rollStats(), focus: null };
    if (o.cousin) p.cousin = true;
    D.people[p.id] = p;
    return p;
  };
  const marry = (D, a, b) => { a.spouse = b.id; b.spouse = a.id; };
  const spouseOf = (D, p) => p && p.spouse && D.people[p.spouse] && !D.people[p.spouse].dead ? D.people[p.spouse] : null;
  const childrenOf = (D, p) => alive(D).filter(c => c.parents.includes(p.id)).sort((a, b) => a.bornS - b.bornS);
  const siblingsOf = (D, p) => alive(D).filter(c => c !== p && c.blood && c.parents.some(x => p.parents.includes(x))).sort((a, b) => a.bornS - b.bornS);

  // -------------------------------------------------------------------
  // creation
  // -------------------------------------------------------------------
  const houseNameFor = (s, owner, race) => {
    const h = G.heroOf && G.heroOf(s, owner);
    const parts = h && h.name ? h.name.split(' ') : [];
    if (parts.length === 2 && /^[A-Z][a-z]+$/.test(parts[1]) && !/^(of|the)$/i.test(parts[1])) return parts[1];
    const used = new Set(Object.values((s.dynasty && s.dynasty.realms) || {}).map(d => d.house));
    const pool = namesOf(race).h.filter(x => !used.has(x));
    return G.pick(pool.length ? pool : namesOf(race).h);
  };
  const makeDynasty = (s, owner) => {
    const e = s.empires[owner];
    const race = DATA.dynNames[e.race] ? e.race : 'hearth';
    const S0 = Math.floor(nowS(s));
    const D = { v: 1, owner, realm: e.name, house: houseNameFor(s, owner, e.race), race: e.race, rulerId: null, heir: null,
      law: owner === 'p' ? 'eldest' : (RACE_LAW[e.race] || 'eldest'), prestige: G.rint(40, 80), season: S0, lead: false,
      regent: null, crisis: null, lawUntil: 0, lawCool: 0, heroId: null, past: [], people: {}, rev: 1, crowned: s.time };
    const h = G.heroOf && G.heroOf(s, owner);
    const hasHero = !!(h && h.name);
    const age = hasHero ? G.rint(42, 56) : G.rint(30, 55);
    const female = Math.random() < 0.35;
    const ruler = newPerson(s, D, { name: pickName(s, D, race, female), female, bornS: S0 - age * 4 - Math.random() * 4, blood: true, st: rollStats(G.pick(STATS)) });
    const nTraits = 2 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < 12 && ruler.traits.length < nTraits; i++) addTrait(ruler, rollTrait(s, owner, ruler));
    ruler.crownS = S0 - G.rint(1, Math.max(2, (age - 20) * 4));
    D.rulerId = ruler.id;
    let spouse = null;
    if (Math.random() < 0.85 || hasHero) {
      const sa = G.clamp(age + G.rint(-7, 4), hasHero ? 38 : 20, 70);
      spouse = newPerson(s, D, { name: pickName(s, D, race, !female), female: !female, bornS: S0 - sa * 4 - Math.random() * 4, from: 'noble' });
      for (let i = 0; i < 6 && spouse.traits.length < 2; i++) addTrait(spouse, rollTrait(s, owner, spouse));
      marry(D, ruler, spouse);
    }
    if (spouse) {
      const mother = female ? ruler : spouse;
      const maxAge = Math.max(0, Math.min(ageAt(ruler, S0), ageAt(mother, S0)) - 18);
      const kids = [];
      if (hasHero) kids.push({ age: G.rint(Math.min(18, Math.floor(maxAge)), Math.max(18, Math.min(26, Math.floor(maxAge)))), hero: true });
      const n = G.rint(0, 3);
      const top = hasHero ? kids[0].age - 1 : Math.min(maxAge, 25);   // the hero is the eldest
      for (let i = 0; i < n; i++) { const a = Math.random() * top; if (a >= 0) kids.push({ age: a }); }
      for (const k of kids) {
        const kf = Math.random() < 0.45;
        const c = newPerson(s, D, { name: k.hero ? h.name : pickName(s, D, race, kf), female: kf, bornS: S0 - k.age * 4 - Math.random() * 2, blood: true, parents: [ruler.id, spouse.id], st: childStats(ruler, spouse) });
        if (k.hero) { D.heroId = c.id; c.hero = true; const first = String(h.name).split(' ')[0]; for (const R of Object.values(DATA.dynNames)) { if (R.m.includes(first)) c.female = false; else if (R.f.includes(first)) c.female = true; } }
        inherit(c, ruler, spouse);
        const yrs = Math.max(0, Math.min(DY.adult, k.age) - DY.eduFrom);
        c.focus = k.age < DY.adult ? (owner === 'p' ? null : aiFocus(s, owner, c)) : null;
        for (let y = 0; y < yrs; y++) if (Math.random() < 0.6) { const st = c.focus || G.pick(STATS); c.st[st] = Math.min(20, c.st[st] + 1); }
        if (k.age >= DY.adult) for (let i = 0; i < 6 && c.traits.length < 2; i++) addTrait(c, rollTrait(s, owner, c));
      }
    }
    return D;
  };
  const childStats = (a, b) => { const st = {}; for (const k of STATS) st[k] = G.clamp(Math.round(((a ? a.st[k] : 7) + (b ? b.st[k] : 7)) * 0.2 + G.rint(1, 6)), 1, 20); return st; };
  const inherit = (c, a, b) => {
    for (const par of [a, b]) for (const t of (par ? par.traits : [])) if (TR(t).heritable && c.traits.length < 1 && Math.random() < 0.3) addTrait(c, t);
  };
  const aiFocus = (s, owner, c) => {
    const e = s.empires[owner] || {};
    const best = STATS.slice().sort((x, y) => c.st[y] - c.st[x])[0];
    return Math.random() < 0.5 ? (RACE_FOCUS[e.race] || best) : best;
  };

  // -------------------------------------------------------------------
  // state access
  // -------------------------------------------------------------------
  const root = s => {
    const R = s.dynasty = (s.dynasty && typeof s.dynasty === 'object') ? s.dynasty : {};
    R.v = 1;
    if (!R.realms || typeof R.realms !== 'object') R.realms = {};
    if (!Array.isArray(R.claims)) R.claims = [];
    return R;
  };
  // the realm's dynasty (lazily created; a reborn realm in Endless mode founds a new house)
  const dyn = (s, owner) => {
    if (!realmOk(s, owner)) return null;
    const R = root(s);
    let D = R.realms[owner];
    const e = s.empires[owner];
    if (D && owner !== 'p' && D.realm !== e.name && !e.dead) D = null;   // reborn in Endless mode
    if (!D || !D.people || !D.people[D.rulerId]) { D = R.realms[owner] = makeDynasty(s, owner); }
    return D;
  };
  const peek = (s, owner) => (s.dynasty && s.dynasty.realms && s.dynasty.realms[owner]) || null;
  G.dynasty = dyn;
  G.ruler = (s, owner = 'p') => { const D = dyn(s, owner); return D ? D.people[D.rulerId] : null; };
  G.dynPerson = (s, owner, id) => { const D = dyn(s, owner); return D && D.people[id] || null; };
  G.dynTitle = (s, owner, p) => {
    const D = peek(s, owner) || dyn(s, owner);
    const race = (s.empires[owner] || {}).race;
    const T = DATA.rulerTitles[race] || DATA.rulerTitles.hearth;
    if (!p || !D) return '';
    if (p.id === D.rulerId) return T[p.female ? 1 : 0];
    if (!p.blood) return p.spouse === D.rulerId ? (p.female ? 'Queen consort' : 'Prince consort') : (p.female ? 'Lady' : 'Lord');
    return T[p.female ? 3 : 2];
  };
  G.dynFullName = (s, owner, p) => p ? `${G.dynTitle(s, owner, p)} ${p.name}`.trim() : '';
  G.dynChildren = (s, owner) => { const D = dyn(s, owner); return D ? childrenOf(D, D.people[D.rulerId]) : []; };
  G.dynSpouse = (s, owner) => { const D = dyn(s, owner); return D ? spouseOf(D, D.people[D.rulerId]) : null; };

  // effective stats: base + trait bonuses (regents blend toward average)
  const effStats = p => {
    const st = {};
    for (const k of STATS) st[k] = p.st[k] || 0;
    for (const t of p.traits) for (const [k, v] of Object.entries(TR(t).st || {})) st[k] = G.clamp(st[k] + v, 0, 20);
    return st;
  };
  G.dynStats = effStats;

  // -------------------------------------------------------------------
  // effects (cached per dynasty revision)
  // -------------------------------------------------------------------
  const fxCache = new WeakMap();
  const MOD_CAP = [0.85, 1.15];
  const computeFx = (s, D) => {
    const p = D.people[D.rulerId];
    const f = { mod: {}, happy: 0, faith: 1, culture: 1, regard: 0, loyalty: 0, health: 1, battle: 1, prestige: 1, fear: 1, assassin: 1, claim: 1, fert: 1, legit: 0, lead: false, regency: false };
    if (!p) return f;
    const reg = D.regent;
    const st = reg ? (() => { const r = {}; for (const k of STATS) r[k] = 8 + (((reg.st && reg.st[k]) || 8) - 8) * 0.8; return r; })() : effStats(p);
    const mul = (k, v) => { f.mod[k] = (f.mod[k] || 1) * v; };
    mul('tax', 1 + 0.004 * (st.stw - 8));
    mul('atk', 1 + 0.003 * (st.mar - 8));
    mul('researchTime', 1 - 0.003 * (st.lrn - 8));
    mul('counterintel', 1 + 0.01 * (st.int - 8));
    mul('spy', 1 + 0.005 * (st.int - 8));
    f.regard += (st.dip - 8) * 0.8;
    const w = reg ? 0.5 : 1;                     // a child's traits count for half under a regency
    const soft = v => 1 + (v - 1) * w;
    for (const t of p.traits) {
      const T = TR(t);
      for (const [k, v] of Object.entries(T.fx || {})) mul(k, soft(v));
      f.happy += (T.happy || 0) * w; f.regard += (T.regard || 0) * w; f.loyalty += (T.loyalty || 0) * w;
      if (T.faith) f.faith *= soft(T.faith);
      if (T.culture) f.culture *= soft(T.culture);
      if (T.health) f.health *= T.health;
      if (T.battle) f.battle *= T.battle;
      if (T.prestige) f.prestige *= T.prestige;
      if (T.fear) f.fear *= T.fear;
      if (T.assassin) f.assassin *= T.assassin;
      if (T.claim) f.claim *= T.claim;
      if (T.fert) f.fert *= T.fert;
      f.legit += T.legit || 0;
      if (T.lead && !reg) f.lead = true;
    }
    if (reg) { f.regency = true; f.happy -= 2; f.lead = false; }
    if (D.lead && !reg) f.lead = true;
    if (D.owner === 'p') f.lead = !!(D.lead && !reg) || (D.heroId === D.rulerId && !reg);
    if (f.lead) mul('atk', 1.02);
    for (const k of Object.keys(f.mod)) f.mod[k] = G.clamp(f.mod[k], MOD_CAP[0], MOD_CAP[1]);
    f.happy = Math.round(f.happy * 10) / 10;
    return f;
  };
  const fxOf = (s, D) => {
    const c = fxCache.get(D);
    if (c && c.rev === D.rev) return c.fx;
    const fx = computeFx(s, D);
    fxCache.set(D, { rev: D.rev, fx });
    return fx;
  };
  G.rulerFx = (s, owner) => { const D = dyn(s, owner); return D ? fxOf(s, D) : null; };

  G.modSources.push((s, owner, city, key) => {
    const D = s.dynasty && s.dynasty.realms && s.dynasty.realms[owner];
    if (!D || !D.people) return 1;
    return fxOf(s, D).mod[key] || 1;
  });

  // happiness: the ruler's character, a succession crisis, a regency, a new law
  if (G.happiness) {
    const prev = G.happiness;
    G.happiness = (s, city) => {
      const h = prev(s, city);
      const D = peek(s, city.owner);
      if (!D || !D.people || !D.people[D.rulerId]) return h;
      const f = fxOf(s, D), add = [];
      const ruler = D.people[D.rulerId];
      const tv = Math.round(f.happy + (f.regency ? 2 : 0));
      if (tv) add.push({ label: `The ${G.dynTitle(s, city.owner, ruler).toLowerCase()}'s character`, value: tv });
      if (f.regency) add.push({ label: 'A regency', value: -2 });
      if (D.crisis && D.crisis.until > s.time && D.crisis.happy) add.push({ label: 'Succession crisis', value: -D.crisis.happy });
      if (D.lawUntil > s.time) add.push({ label: 'A new law of succession', value: -3 });
      if (!add.length) return h;
      const raw = h.raw + add.reduce((a, x) => a + x.value, 0);
      return { ...h, why: [...h.why, ...add], raw, value: G.clamp(Math.round(raw), 0, 100) };
    };
  }
  if (G.faithRate) { const prev = G.faithRate; G.faithRate = (s, owner) => { const r = prev(s, owner); const D = peek(s, owner); return D && D.people ? r * fxOf(s, D).faith : r; }; }
  if (G.cultureRate) { const prev = G.cultureRate; G.cultureRate = (s, city) => { const r = prev(s, city); const D = peek(s, city.owner); return D && D.people ? r * fxOf(s, D).culture : r; }; }

  // -------------------------------------------------------------------
  // regard between rulers, marriage ties, claims
  // -------------------------------------------------------------------
  const treatyTie = (s, a, b) => {
    try {
      if (typeof G.hasTreaty === 'function') {
        for (const k of ['marriage', 'royalMarriage', 'royal_marriage']) if (G.hasTreaty(s, a, b, k)) return true;
      }
      if (typeof G.treatiesOf === 'function') {
        const list = G.treatiesOf(s, a) || [];
        return (Array.isArray(list) ? list : Object.values(list)).some(t => t && /marri/i.test(String(t.kind || t.type || t.id || '')) &&
          [t.with, t.b, t.other, t.partner, t.a, t.to, t.from, ...(Array.isArray(t.parties) ? t.parties : [])].includes(b));
      }
    } catch (e) { }
    return false;
  };
  const courtTie = (D, b) => !!D && Object.values(D.people).some(p => !p.dead && p.from === b);
  G.dynTie = (s, a, b) => a !== b && (courtTie(peek(s, a), b) || courtTie(peek(s, b), a) || treatyTie(s, a, b));
  G.rulerRegard = (s, a, b) => {
    const A = peek(s, a), B = peek(s, b);
    if (!A || !B || !A.people || !B.people) return 0;
    const pa = A.people[A.rulerId], pb = B.people[B.rulerId];
    if (!pa || !pb) return 0;
    let r = fxOf(s, B).regard;                  // how b's ruler comes across
    let shared = 0;
    for (const t of pa.traits) { if (pb.traits.includes(t)) shared++; if (pb.traits.includes(TR(t).opp)) r -= 5; }
    r += 5 * Math.min(2, shared);
    if (G.dynTie(s, a, b)) r += 15;
    return Math.round(G.clamp(r, -40, 50));
  };
  G.rulerRegardWhy = (s, a, b) => {
    const A = peek(s, a), B = peek(s, b), out = [];
    if (!A || !B) return out;
    const pa = A.people[A.rulerId], pb = B.people[B.rulerId];
    if (!pa || !pb) return out;
    const shared = pa.traits.filter(t => pb.traits.includes(t));
    if (shared.length) out.push(`shared ${shared.map(t => TR(t).name.toLowerCase()).join(', ')}`);
    const opp = pa.traits.filter(t => pb.traits.includes(TR(t).opp));
    if (opp.length) out.push('clashing natures');
    if (G.dynTie(s, a, b)) out.push('marriage ties');
    return out;
  };
  const claimsOf = s => root(s).claims;
  const claimActive = (s, by, on) => !!(s.dynasty && s.dynasty.claims && s.dynasty.claims.some(c => c.by === by && c.on === on && c.until > s.time));
  G.dynClaims = s => claimsOf(s).filter(c => c.until > s.time);
  {
    const prev = G.hostility;
    G.hostility = (s, aiId, target) => {
      const h = prev(s, aiId, target);
      if (!h || !s.dynasty || !s.empires[target] || !s.empires[aiId]) return h;
      // a disliked ruler draws aggression (up to +20%); goodwill works through envoys and matches instead,
      // and a marriage tie stays the hand (−15%)
      const rg = G.rulerRegard(s, aiId, target);
      let m = 1 + G.clamp(-rg, 0, 40) * 0.005;
      if (G.dynTie(s, aiId, target)) m *= 0.85;
      if (claimActive(s, aiId, target)) m *= 1.5;
      return h * m;
    };
  }
  // envoys: a ruler's regard sways peace and alliance talks (half of it counts as opinion)
  if (G.diplo) for (const k of ['peace', 'alliance']) {
    const prev = G.diplo[k];
    if (typeof prev !== 'function') continue;
    G.diplo[k] = (s, ai, ...rest) => {
      const r = G.rel(s, ai), b = Math.round(G.rulerRegard(s, ai, 'p') / 2);
      r.opinion += b;
      try { return prev(s, ai, ...rest); } finally { r.opinion = G.clamp(r.opinion - b, -100, 100); }
    };
  }

  // -------------------------------------------------------------------
  // heirs, strength, succession
  // -------------------------------------------------------------------
  const heirOrder = (D) => {
    const r = D.people[D.rulerId];
    if (!r) return [];
    const kids = childrenOf(D, r).filter(c => c.blood);
    const sibs = siblingsOf(D, r);
    const rest = alive(D).filter(p => p.blood && p !== r && !kids.includes(p) && !sibs.includes(p)).sort((a, b) => a.bornS - b.bornS);
    return [...kids, ...sibs, ...rest];
  };
  const candScore = (s, D, p) => {
    const st = effStats(p);
    let sc = STATS.reduce((a, k) => a + st[k], 0) / 5;
    for (const t of p.traits) sc += TR(t).legit || 0;
    return sc;
  };
  const electCands = (s, D) => heirOrder(D).filter(p => ageF(s, p) >= DY.adult).map(p => ({ p, score: candScore(s, D, p) + Math.min(3, D.prestige / 100) })).sort((a, b) => b.score - a.score);
  // who would inherit now
  G.dynHeir = (s, owner) => {
    const D = dyn(s, owner); if (!D) return null;
    const order = heirOrder(D);
    if (D.law === 'chosen' && D.heir && D.people[D.heir] && !D.people[D.heir].dead && order.includes(D.people[D.heir])) return D.people[D.heir];
    if (D.law === 'elective') { const c = electCands(s, D)[0]; return c ? c.p : null; }
    return order[0] || null;
  };
  const avgHappy = (s, owner) => { const cs = G.citiesOf(s, owner); return cs.length ? cs.reduce((a, c) => a + (G.happyOf ? G.happyOf(c) : 60), 0) / cs.length : 60; };
  // how firmly would p hold the crown (≥ DY.stab: no crisis)
  const strength = (s, owner, D, p, opts = {}) => {
    let sc = candScore(s, D, p);
    const why = [];
    if (ageF(s, p) < DY.adult) { sc -= 5; why.push('a child'); }
    sc += Math.min(4, D.prestige / 100);
    const L = DATA.successionLaws[D.law] || DATA.successionLaws.eldest;
    sc += L.legit;
    if (D.law === 'chosen') { const elder = heirOrder(D).find(x => x.bornS < p.bornS && childrenOf(D, D.people[D.rulerId] || p).includes(x)); if (elder && opts.bypass !== false) { sc -= 2; why.push('an elder sibling passed over'); } }
    const hp = avgHappy(s, owner);
    sc += (hp - 50) / 10;
    if (hp < 45) why.push('an unhappy realm');
    if (p.cousin) { sc -= 3; why.push('a distant cousin'); }
    if (sc < DY.stab - 2 && !why.length) why.push('little ability');
    return { score: sc, sev: G.clamp((DY.stab - sc) / 8, 0, 1), why };
  };
  G.dynStrength = (s, owner, p) => { const D = dyn(s, owner); p = p || G.dynHeir(s, owner); return D && p ? strength(s, owner, D, p) : { score: 0, sev: 1, why: ['no heir'] }; };

  const pruneCourt = (s, D) => {
    const r = D.people[D.rulerId];
    const keep = new Set([D.rulerId, D.heroId, D.regent && D.regent.id].filter(Boolean));
    const near = [r, ...childrenOf(D, r), ...siblingsOf(D, r)];
    for (const p of near) { keep.add(p.id); if (p.spouse) keep.add(p.spouse); for (const c of childrenOf(D, p)) keep.add(c.id); }
    for (const p of r.parents) keep.add(p);    // the dowager
    const S = nowS(s);
    for (const [id, p] of Object.entries(D.people)) {
      if (keep.has(id)) continue;
      if (p.dead ? S - (p.diedS || 0) > 8 : !p.blood || alive(D).length > DY.maxCourt) delete D.people[id];
    }
    // dead parents of the ruler stay only as names in the tree for a while
    for (const [id, p] of Object.entries(D.people)) if (p.dead && id !== D.rulerId && S - (p.diedS || 0) > 16) delete D.people[id];
  };

  const crown = (s, owner, D, heir) => {
    D.rulerId = heir.id;
    heir.crownS = nowS(s);
    D.heir = null;
    D.crowned = s.time;
    D.heroSeen = s.time;
    if (ageF(s, heir) < DY.adult) {
      const mum = heir.parents.map(id => D.people[id]).find(x => x && !x.dead && x.id !== heir.id);
      D.regent = mum ? { id: mum.id, name: mum.name, female: mum.female, st: { ...effStats(mum) } }
        : { id: null, name: G.pick(namesOf(D.race)[Math.random() < 0.5 ? 'f' : 'm']) + ' the Regent', female: false, st: rollStats() };
    } else D.regent = null;
  };

  const CAUSES = { illness: 0, age: 1, battle: 2, assassin: 3, tale: 4, abdication: 5 };
  const CAUSE_TEXT = ['of a fever', 'in old age', 'in battle', "by an assassin's blade", 'of a wasting sickness', 'abdicated'];
  G.DYN_CAUSES = CAUSES;

  // the ruler is gone: crown the heir, then reckon with the consequences
  const succeed = (s, owner, D, cause = 'illness', by = null) => {
    const e = s.empires[owner];
    const old = D.people[D.rulerId];
    if (!old) return null;
    const S = nowS(s);
    old.dead = true; old.diedS = S; old.cause = cause;
    if (D.heroId === old.id) {           // the hero-ruler fell: their arms pass to a new champion
      D.heroId = null;
      const h = G.heroOf && G.heroOf(s, owner);
      if (h) { const pool = (DATA.races[e.race] && DATA.races[e.race].heroNames) || (DATA.heroNames && DATA.heroNames[e.race]) || []; const nm = pool.find(n => n !== h.name); if (nm) h.name = nm; }
    }
    const oldName = G.dynFullName(s, owner, old);
    D.past.push({ id: old.id, name: old.name, title: G.dynTitle(s, owner, old), female: old.female, house: D.house, from: old.crownS ?? S, to: S, t: s.time,
      age: Math.floor(ageAt(old, S)), traits: old.traits.slice(), cause, race: e.race, regnal: D.past.length + 1 });
    if (D.past.length > 30) D.past.splice(0, D.past.length - 30);
    if (D.regent && D.regent.id === old.id) D.regent = null;

    // pick the successor
    let heir = null, elected = null, sevAdd = 0, noble = false;
    if (D.law === 'elective') {
      const cands = electCands(s, D);
      const nobleSt = rollStats(G.pick(STATS));
      const nob = { score: STATS.reduce((a, k) => a + nobleSt[k], 0) / 5 + G.rnd(-1, 1.5), st: nobleSt };
      if (cands.length && cands[0].score >= nob.score - 0.5) { heir = cands[0].p; elected = cands.slice(0, 3).map(c => c.p.id); }
      else {
        // a great noble takes the crown: a new house
        const fem = Math.random() < 0.35;
        heir = newPerson(s, D, { name: pickName(s, D, D.race, fem), female: fem, bornS: S - G.rint(28, 50) * 4, blood: true, st: nobleSt });
        for (let i = 0; i < 6 && heir.traits.length < 2; i++) addTrait(heir, rollTrait(s, owner, heir));
        const oldHouse = D.house;
        const pool = namesOf(D.race).h.filter(x => x !== oldHouse);
        D.house = G.pick(pool.length ? pool : namesOf(D.race).h);
        for (const p of Object.values(D.people)) if (p !== heir && p.blood) p.blood = false;   // the old house steps down
        D.prestige = Math.round(D.prestige * 0.5);
        noble = true;
      }
    } else heir = G.dynHeir(s, owner);
    if (!heir) {
      // no heir of the blood: a distant cousin is fetched from the provinces
      const fem = Math.random() < 0.4;
      heir = newPerson(s, D, { name: pickName(s, D, D.race, fem), female: fem, bornS: S - G.rint(19, 44) * 4, blood: true, cousin: true, st: rollStats() });
      for (let i = 0; i < 6 && heir.traits.length < 2; i++) addTrait(heir, rollTrait(s, owner, heir));
      D.prestige = Math.max(0, D.prestige - 40);
      sevAdd = 0.35;
    }
    const bypass = D.law === 'chosen';
    const str = strength(s, owner, D, heir, { bypass });
    crown(s, owner, D, heir);
    let sev = G.clamp(str.sev + sevAdd - 0.05 * fxOf(s, D).legit, 0, 1);
    touch(D);
    const nm = G.dynFullName(s, owner, heir);
    const ev = { owner, old: oldName, heir: heir.id, name: nm, cause, sev, why: str.why.concat(sevAdd ? ['no heir of the blood'] : []), noble, elected, by };
    chron(s, 'crown', { a: owner, b: by && s.empires[by] ? by : undefined, c: oldName, x: nm, n: CAUSES[cause] ?? 0 });
    const causeT = CAUSE_TEXT[CAUSES[cause] ?? 0];
    if (owner === 'p') G.log(s, 'p', `👑 ${oldName} died ${causeT}. ${nm} now ${noble ? 'wears the crown — House ' + D.house + ' rises' : 'rules'}${D.regent ? `, with ${D.regent.name} as regent` : ''}.`, sev >= 0.3 ? 'bad' : 'warn');
    else sayP(s, owner, `👑 ${oldName} of the ${e.name} died ${causeT}; ${nm} succeeds${sev >= 0.3 ? ' — the realm is in turmoil' : ''}.`, sev >= 0.3 ? 'warn' : 'info');
    applyCrisis(s, owner, D, sev, ev);
    pruneCourt(s, D);
    if (owner === 'p') successionCard(s, D, ev);
    // the court's regard for the player shifts with the new face
    if (owner === 'p') for (const o of Object.values(s.empires)) if (o.id !== 'p' && !o.dead && !o.minor && s.rel && s.rel[o.id]) { const r = G.rel(s, o.id); r.opinion = G.clamp(r.opinion + G.clamp(G.rulerRegard(s, o.id, 'p') / 3, -8, 8), -100, 100); }
    return ev;
  };

  const applyCrisis = (s, owner, D, sev, ev) => {
    const cities = G.citiesOf(s, owner);
    if (sev < 0.08) { D.crisis = null; D.prestige += 5; return; }
    const drop = Math.round(DY.loyaltyDrop[0] + (DY.loyaltyDrop[1] - DY.loyaltyDrop[0]) * sev);
    for (const c of cities) c.loyalty = Math.max(1, (c.loyalty ?? 100) - drop);
    D.crisis = { until: s.time + (DY.crisisMin[0] + (DY.crisisMin[1] - DY.crisisMin[0]) * sev) * MIN(s), sev: Math.round(sev * 100) / 100,
      happy: Math.round(DY.crisisHappy[0] + (DY.crisisHappy[1] - DY.crisisHappy[0]) * sev), drop };
    ev.drop = drop;
    // a pretender raises a city
    const f = fxOf(s, D);
    if (sev >= 0.35 && cities.length >= 3 && Math.random() < (sev - 0.2) * 0.9 * f.fear) {
      const cap = G.capital(s, owner);
      const target = cities.filter(c => c !== cap).sort((a, b) => (a.loyalty ?? 100) - (b.loyalty ?? 100))[0];
      if (target) pretender(s, owner, D, target, ev);
    }
    // realms bound by marriage may press a claim
    if (sev >= 0.3) for (const o of Object.values(s.empires)) {
      if (o.id === owner || o.dead || o.minor || !G.citiesOf(s, o.id).length || !G.dynTie(s, o.id, owner)) continue;
      const Do = dyn(s, o.id);
      if (o.id === 'p') { claimCard(s, owner, D, ev); continue; }
      const allied = owner === 'p' ? ['peace', 'alliance'].includes(G.rel(s, o.id).status) : (G.aiRel && G.aiRel(s, o.id, owner).status === 'peace');
      if (allied) continue;
      if (Math.random() < (0.3 + 0.5 * sev) * (Do ? fxOf(s, Do).claim : 1)) pressClaim(s, o.id, owner);
    }
  };

  const nearestCity = (s, by, on) => {
    const capB = G.capital(s, by), cs = G.citiesOf(s, on);
    if (!cs.length) return null;
    return capB ? cs.slice().sort((a, b) => G.dist(a, capB) - G.dist(b, capB))[0] : cs[0];
  };
  const pressClaim = (s, by, on) => {
    const city = nearestCity(s, by, on);
    if (!city || claimActive(s, by, on)) return null;
    const c = { by, on, city: city.id, cityName: city.name, until: s.time + DY.claimMin * MIN(s), t: s.time };
    claimsOf(s).push(c);
    const B = s.empires[by], O = s.empires[on];
    if (on === 'p') {
      const r = G.rel(s, by);
      if (r.status !== 'war') { r.status = 'war'; r.since = s.time; r.opinion = Math.min(r.opinion, -30); }
      G.log(s, 'p', `⚔️ The ${B.name} press a claim to our throne through marriage ties, and march on ${city.name}!`, 'bad');
    } else if (by === 'p') {
      // handled by the card
    } else {
      const ar = G.aiRel && G.aiRel(s, by, on);
      if (ar && ar.status !== 'war') { ar.status = 'war'; ar.since = s.time; }
      sayP(s, by, `⚔️ The ${B.name} press a claim to the throne of the ${O.name}, and go to war for ${city.name}.`, 'warn');
    }
    chron(s, 'claim', { a: by, b: on, c: city.name });
    return c;
  };
  G.dynPressClaim = pressClaim;

  const pretender = (s, owner, D, city, ev) => {
    const fem = Math.random() < 0.4;
    const name = pickName(s, D, D.race, fem);
    ev.pretender = { city: city.id, name };
    chron(s, 'pretender', { a: owner, c: city.name, x: name });
    if (owner === 'p') {
      const gold = Math.round((150 + city.pop * 2) * (1 + s.time / (3600 * paceT(s)) * 0.1) / 10) * 10;
      G.addPending(s, { kind: 'dynPretender', title: `A pretender in ${city.name}`,
        text: `${name}, who claims the blood of House ${D.house}, has raised a banner in ${city.name} (loyalty ${Math.round(city.loyalty)}%). Buy off the city's notables, send the garrison against the pretender's followers, or let it run its course: a city below 45% loyalty will rise.`,
        options: [{ key: 'buy', label: `Buy off the notables (${gold} gold)` }, { key: 'crush', label: 'Send the garrison' }, { key: 'ignore', label: 'Let it run its course' }],
        expires: s.time + 8 * MIN(s), def: 'ignore', data: { city: city.id, name, gold } });
    } else {
      if ((city.loyalty ?? 100) < 60 && G.revoltCity && G.citiesOf(s, owner).length > 1) {
        const camp = G.revoltCity(s, city);
        if (camp) camp.pretender = name;
        sayP(s, owner, `🔥 ${name}, a pretender, raised ${city.name} against the ${s.empires[owner].name}.`, 'warn');
      } else city.loyalty = Math.max(1, (city.loyalty ?? 100) - 15);
    }
  };

  // -------------------------------------------------------------------
  // decision cards (the player's)
  // -------------------------------------------------------------------
  const cardGold = (s, base) => Math.round(base * (1 + Math.min(10, s.time / (3600 * paceT(s))) * 0.15) / 10) * 10;
  const successionCard = (s, D, ev) => {
    const opts = [];
    const gold = cardGold(s, 150);
    const heir = D.people[D.rulerId];
    if (ev.sev >= 0.08) opts.push({ key: 'coronation', label: `A grand coronation (${gold} gold)` });
    if (ev.sev >= 0.08 && D.prestige >= 10) opts.push({ key: 'largesse', label: `Largesse for the nobles (${Math.min(Math.round(D.prestige), 40)} prestige)` });
    if (ev.elected && ev.elected.length > 1) for (const id of ev.elected.slice(1, 3)) { const p = D.people[id]; if (p && !p.dead) opts.push({ key: 'back:' + id, label: `Sway the electors to ${p.name} (${cardGold(s, 250)} gold)` }); }
    opts.push({ key: 'proceed', label: 'Long live the crown' });
    const why = ev.why.length ? ` The court whispers of ${ev.why.join(', ')}.` : '';
    const text = `${ev.old} is dead. ${ev.name} ${ev.noble ? 'was elected by the great nobles: House ' + D.house + ' takes the crown.' : 'takes the throne' + (D.regent ? `; until ${heir.female ? 'she' : 'he'} comes of age, ${D.regent.name} rules as regent.` : '.')}` +
      (ev.sev >= 0.08 ? ` A succession crisis grips the realm (severity ${Math.round(ev.sev * 100)}%): loyalty fell by ${ev.drop} in every city.${why}` : ' The realm accepts the new ruler calmly.');
    s.pending = (s.pending || []).filter(x => x.kind !== 'dynSuccession');   // an older card speaks of a ruler who is gone
    G.addPending(s, { kind: 'dynSuccession', title: `The crown passes to ${ev.name}`, text, options: opts, expires: s.time + 10 * MIN(s), def: 'proceed', data: { gold, sev: ev.sev, heir: heir.id } });
  };
  const claimCard = (s, on, Don, ev) => {
    const O = s.empires[on];
    const city = nearestCity(s, 'p', on);
    if (!city) return;
    G.addPending(s, { kind: 'dynClaim', title: `A claim to the throne of the ${O.name}`,
      text: `${ev.old} of the ${O.name} is dead and ${ev.name} holds a shaky throne. Through marriage, our house has a claim. Press it and go to war: take ${city.name} within ${Math.round(DY.claimMin / 60)} hours for prestige and their crown's humiliation. Their realm is in turmoil (loyalty −${ev.drop || 0} in every city).`,
      options: [{ key: 'press', label: `Press the claim (war for ${city.name})` }, { key: 'renounce', label: 'Renounce it graciously' }],
      expires: s.time + 10 * MIN(s), def: 'renounce', data: { on, city: city.id } });
  };
  G.pendingHandlers.dynSuccession = (s, p, key) => {
    const D = dyn(s, 'p');
    if (!D) return null;
    if (key === 'coronation') {
      if (s.empires.p.gold < p.data.gold) return 'Not enough gold';
      s.empires.p.gold -= p.data.gold;
      for (const c of G.citiesOf(s, 'p')) c.loyalty = Math.min(100, (c.loyalty ?? 100) + 10);
      if (D.crisis) { D.crisis.until = s.time + (D.crisis.until - s.time) * 0.4; D.crisis.happy = Math.max(0, D.crisis.happy - 3); }
      D.prestige += 10;
      G.log(s, 'p', '👑 Trumpets, banners and free wine: the coronation calms the realm.', 'good');
    } else if (key === 'largesse') {
      const n = Math.min(Math.round(D.prestige), 40);
      D.prestige -= n;
      for (const c of G.citiesOf(s, 'p')) c.loyalty = Math.min(100, (c.loyalty ?? 100) + Math.round(n / 5));
      if (D.crisis) D.crisis.until = s.time + (D.crisis.until - s.time) * 0.7;
      G.log(s, 'p', `👑 Titles and lands for the great nobles (−${n} prestige): loyalty +${Math.round(n / 5)}.`, 'good');
    } else if (key && key.startsWith('back:')) {
      const id = key.slice(5), cand = D.people[id], gold = cardGold(s, 250);
      if (!cand || cand.dead) return 'That candidate is gone';
      if (s.empires.p.gold < gold) return 'Not enough gold';
      s.empires.p.gold -= gold;
      const prevRuler = D.people[D.rulerId];
      if (prevRuler) prevRuler.crownS = undefined;
      crown(s, 'p', D, cand);
      touch(D);
      G.log(s, 'p', `🗳️ Purses open, and the electors find they prefer ${G.dynFullName(s, 'p', cand)}.`, 'warn');
    }
    return null;
  };
  G.pendingHandlers.dynPretender = (s, p, key) => {
    const city = s.cities[p.data.city];
    if (!city || city.owner !== 'p') return null;
    if (key === 'buy') {
      if (s.empires.p.gold < p.data.gold) return 'Not enough gold';
      s.empires.p.gold -= p.data.gold;
      city.loyalty = Math.min(100, (city.loyalty ?? 100) + 25);
      G.log(s, 'p', `🪙 The notables of ${city.name} hand over ${p.data.name}'s banner for a fat purse.`, 'good');
    } else if (key === 'crush') {
      const n = G.unitsCount(city.units) - (city.units.hero || 0);
      if (n < 10) return 'Too few troops in ' + city.name + ' (need 10)';
      for (const u of Object.keys(city.units)) if (u !== 'hero') city.units[u] = Math.floor(city.units[u] * 0.85);
      city.loyalty = Math.min(100, (city.loyalty ?? 100) + 12);
      city.mods = (city.mods || []).filter(m => m.until > s.time);
      city.mods.push({ key: 'storyHappy', mult: 0.95, until: s.time + 20 * MIN(s), label: 'Pretender crushed (−5 happiness)' });
      G.log(s, 'p', `⚔️ The garrison of ${city.name} scatters ${p.data.name}'s followers, at some cost.`, 'warn');
    } else if ((city.loyalty ?? 100) < 45 && G.revoltCity && G.citiesOf(s, 'p').length > 1) {
      const camp = G.revoltCity(s, city);
      if (camp) camp.pretender = p.data.name;
    } else {
      city.loyalty = Math.max(1, (city.loyalty ?? 100) - 10);
      G.log(s, 'p', `${p.data.name}'s rising in ${city.name} fizzles out, but the town is restless (−10 loyalty).`, 'warn');
    }
    return null;
  };
  G.pendingHandlers.dynClaim = (s, p, key) => {
    const on = p.data.on, O = s.empires[on];
    if (key !== 'press') { const D = dyn(s, 'p'); if (D) D.prestige += 5; return null; }
    if (!O || O.dead) return 'That realm is no more';
    if (G.rel(s, on).status !== 'war' && G.diplo && G.diplo.war) G.log(s, 'p', '⚔️ ' + G.diplo.war(s, on), 'warn');
    const c = pressClaim(s, 'p', on);
    if (c) G.log(s, 'p', `👑 We press our claim on the throne of the ${O.name}: take ${c.cityName} within ${Math.round(DY.claimMin / 60)} hours.`, 'warn');
    return null;
  };
  G.pendingHandlers.dynMatch = (s, p, key) => {
    const ai = p.data.ai;
    if (key !== 'accept') { if (s.rel && s.rel[ai]) G.rel(s, ai).opinion -= 4; return null; }
    const D = dyn(s, 'p');
    const free = eligible(s, D);
    const who = free.find(x => x.id === p.data.pid) || free[0];
    if (!who) return 'Nobody of your house is free to marry';
    const Da = dyn(s, ai), their = Da && Da.people[p.data.their];
    if (their && !G.dynMatchStatus(s, ai, their.id, 'p') && their.female !== who.female) { crossWed(s, 'p', who, ai, their); return null; }
    return G.dynMarry(s, 'p', who.id, ai, { free: true }) || null;
  };

  // -------------------------------------------------------------------
  // player (and AI) actions
  // -------------------------------------------------------------------
  const eligible = (s, D) => alive(D).filter(p => p.blood && ageF(s, p) >= DY.adult && ageF(s, p) < 60 && (!p.spouse || !D.people[p.spouse] || D.people[p.spouse].dead)).sort((a, b) => (b.id === D.rulerId) - (a.id === D.rulerId) || a.bornS - b.bornS);
  G.dynEligible = (s, owner) => { const D = dyn(s, owner); return D ? eligible(s, D) : []; };
  G.dynSetFocus = (s, owner, pid, focus) => {
    const D = dyn(s, owner); const p = D && D.people[pid];
    if (!p || p.dead) return 'No such child';
    if (ageF(s, p) >= DY.adult) return `${p.name} has come of age`;
    if (focus && !STATS.includes(focus)) return 'Unknown focus';
    p.focus = focus || null; touch(D);
    return null;
  };
  G.dynSetHeir = (s, owner, pid) => {
    const D = dyn(s, owner); if (!D) return 'No dynasty';
    if (D.law !== 'chosen') return 'Only the Designated heir law lets the ruler name an heir';
    const p = D.people[pid];
    if (!p || p.dead || !heirOrder(D).includes(p)) return 'Only a living member of the blood can be heir';
    D.heir = pid; touch(D);
    return null;
  };
  G.dynLawStatus = (s, owner, law) => {
    const D = dyn(s, owner); if (!D) return { ok: false, reason: 'No dynasty' };
    if (!DATA.successionLaws[law]) return { ok: false, reason: 'Unknown law' };
    if (D.law === law) return { ok: false, reason: 'Already the law' };
    if (D.lawCool > s.time) return { ok: false, reason: `The nobles will not hear of another change for ${Math.ceil((D.lawCool - s.time) / MIN(s))} min` };
    if (D.prestige < DY.lawCost) return { ok: false, reason: `Needs ${DY.lawCost} prestige` };
    return { ok: true, cost: DY.lawCost };
  };
  G.dynSetLaw = (s, owner, law) => {
    const st = G.dynLawStatus(s, owner, law);
    if (!st.ok) return st.reason;
    const D = dyn(s, owner);
    D.prestige -= DY.lawCost; D.law = law; D.lawCool = s.time + DY.lawCoolMin * MIN(s); D.lawUntil = s.time + DY.lawUnrestMin * MIN(s);
    if (law !== 'chosen') D.heir = null;
    touch(D);
    if (owner === 'p') G.log(s, 'p', `📜 The law of succession is now ${DATA.successionLaws[law].name}. The nobles grumble (−3 happiness for ${DY.lawUnrestMin} min).`, 'warn');
    return null;
  };
  G.dynLead = (s, owner, on) => { const D = dyn(s, owner); if (!D) return 'No dynasty'; D.lead = !!on; touch(D); return null; };
  // marry a member of the blood to a local noble ('noble') or into another realm (its id)
  G.dynMatchStatus = (s, owner, pid, partner) => {
    const D = dyn(s, owner); const p = D && D.people[pid];
    if (!p || p.dead || !p.blood) return 'Only a living member of the house can marry';
    if (ageF(s, p) < DY.adult) return `${p.name} is too young to marry`;
    if (p.spouse && D.people[p.spouse] && !D.people[p.spouse].dead) return `${p.name} is already married`;
    if (partner === 'noble') return null;
    const o = s.empires[partner];
    if (!o || o.dead || o.minor || partner === owner) return 'No such realm';
    const war = owner === 'p' || partner === 'p' ? G.rel(s, owner === 'p' ? partner : owner).status === 'war' : (G.aiRel && G.aiRel(s, owner, partner).status === 'war');
    if (war) return `You are at war with the ${o.name}`;
    return null;
  };
  G.dynMarry = (s, owner, pid, partner, opts = {}) => {
    const err = G.dynMatchStatus(s, owner, pid, partner);
    if (err) return err;
    const D = dyn(s, owner), p = D.people[pid];
    const foreign = partner !== 'noble';
    if (foreign && owner === 'p' && !opts.free) {
      const r = G.rel(s, partner), want = r.opinion + G.rulerRegard(s, partner, 'p');
      if (want < 10) { r.opinion -= 2; return `The ${s.empires[partner].name} decline the match (they need to think better of you: ${Math.round(want)} / 10)`; }
      if (D.prestige < 20) return 'A royal match needs 20 prestige';
      D.prestige -= 20;
    }
    if (foreign) {
      const Do = dyn(s, partner);
      const match = Do && eligible(s, Do).find(x => x.female !== p.female && x.id !== Do.rulerId && !G.dynMatchStatus(s, partner, x.id, owner));
      if (match) { crossWed(s, owner, p, partner, match); return null; }
    }
    const race = foreign ? s.empires[partner].race : D.race;
    const sp = newPerson(s, D, { name: pickName(s, D, DATA.dynNames[race] ? race : D.race, !p.female), female: !p.female, bornS: p.bornS + G.rint(-16, 12), from: foreign ? partner : 'noble' });
    for (let i = 0; i < 6 && sp.traits.length < 2; i++) addTrait(sp, rollTrait(s, foreign ? partner : owner, sp));
    if (foreign) sp.race = race;
    marry(D, p, sp);
    touch(D);
    D.prestige += foreign ? 15 : 4;
    if (foreign) {
      if (owner === 'p' || partner === 'p') { const ai = owner === 'p' ? partner : owner; const r = G.rel(s, ai); r.opinion = G.clamp(r.opinion + 12, -100, 100); }
      chron(s, 'wed', { a: owner, b: partner, x: `${p.name} and ${sp.name}` });
      sayP(s, owner, `💍 ${G.dynFullName(s, owner, p)} of the ${s.empires[owner].name} weds ${sp.name} of the ${s.empires[partner].name}.`, 'good');
      if (partner === 'p' && owner !== 'p') G.log(s, 'p', `💍 Our house is now bound by marriage to the ${s.empires[owner].name}.`, 'good');
    } else {
      const cap = G.capital(s, owner);
      if (cap) cap.loyalty = Math.min(100, (cap.loyalty ?? 100) + 5);
      if (owner === 'p') G.log(s, 'p', `💍 ${G.dynFullName(s, owner, p)} weds ${sp.name}, of a great family of the realm.`, 'good');
    }
    return null;
  };
  // two members of two houses wed: each court keeps a record of the other (children are born to the mother's house)
  const crossWed = (s, A, pa, B, pb) => {
    const Da = dyn(s, A), Db = dyn(s, B);
    const mirror = (Dx, src, from, race) => { const m = newPerson(s, Dx, { name: src.name, female: src.female, bornS: src.bornS, from, st: { ...src.st } }); m.traits = src.traits.slice(); m.race = race; m.mirror = src.id; return m; };
    marry(Da, pa, mirror(Da, pb, B, s.empires[B].race));
    marry(Db, pb, mirror(Db, pa, A, s.empires[A].race));
    touch(Da); touch(Db);
    Da.prestige += 15; Db.prestige += 15;
    if (A === 'p' || B === 'p') { const ai = A === 'p' ? B : A; const r = G.rel(s, ai); r.opinion = G.clamp(r.opinion + 12, -100, 100); }
    chron(s, 'wed', { a: A, b: B, x: `${pa.name} and ${pb.name}` });
    if (A === 'p' || B === 'p') G.log(s, 'p', `💍 ${G.dynFullName(s, A, pa)} of the ${s.empires[A].name} weds ${G.dynFullName(s, B, pb)} of the ${s.empires[B].name}. The houses are bound.`, 'good');
    else sayP(s, A, `💍 ${G.dynFullName(s, A, pa)} of the ${s.empires[A].name} weds ${G.dynFullName(s, B, pb)} of the ${s.empires[B].name}.`, 'info');
  };
  G.dynCrossWed = crossWed;
  // console/tests: the ruler dies now
  G.dynKill = (s, owner, cause = 'illness', by = null) => { const D = dyn(s, owner); return D ? succeed(s, owner, D, cause, by) : null; };

  // -------------------------------------------------------------------
  // the seasons turn
  // -------------------------------------------------------------------
  const hazard = (age, f) => {
    const yr = (0.012 + 0.0006 * Math.exp(0.085 * (Math.max(age, 20) - 20))) * DY.mortality;
    const child = age < 5 ? 0.02 : 0;
    return (yr + child) / 4 * f;
  };
  G.dynHazard = (s, owner, p) => { const D = dyn(s, owner); if (!D || !p) return 0; return hazard(ageF(s, p), p.id === D.rulerId ? fxOf(s, D).health : p.traits.reduce((a, t) => a * (TR(t).health || 1), 1)); };

  const comeOfAge = (s, owner, D, p) => {
    const bias = p.focus || null;
    const want = p.traits.length < 1 ? 2 : p.traits.length + 1;
    for (let i = 0; i < 8 && p.traits.length < Math.min(3, want); i++) addTrait(p, rollTrait(s, owner, p, i === 0 ? bias : null));
    if (p.focus) p.st[p.focus] = Math.min(20, p.st[p.focus] + 1);
    const was = p.focus; p.focus = null;
    touch(D);
    if (owner === 'p') G.log(s, 'p', `🎓 ${G.dynFullName(s, owner, p)} came of age${was ? ` after a ${DATA.rulerFocus[was].toLowerCase()} education` : ''}: ${p.traits.map(t => TR(t).icon + ' ' + TR(t).name).join(', ') || 'no notable traits'}.`, 'info');
  };

  const seasonTick = (s, owner, D, S) => {
    const e = s.empires[owner];
    const ruler = D.people[D.rulerId];
    // births
    const living = alive(D);
    if (living.length < DY.maxCourt) {
      for (const p of living.filter(x => x.blood && x.spouse && x.female !== undefined)) {
        const sp = D.people[p.spouse];
        if (!sp || sp.dead) continue;
        const mother = p.female ? p : sp.female ? sp : null;
        if (!mother || (p.female === sp.female)) continue;
        if (sp.mirror && !p.female) continue;          // a foreign consort's children belong to the mother's house
        if (p.id !== D.rulerId && ruler && !childrenOf(D, ruler).includes(p) && D.heir !== p.id) continue;   // only the ruler's and the next generation's households
        const ma = ageAt(mother, S);
        if (ma < DY.fertile[0] || ma > DY.fertile[1]) continue;
        const kids = childrenOf(D, p).length;
        if (kids >= DY.maxKids) continue;
        const fert = p.traits.concat(sp.traits).reduce((a, t) => a * (TR(t).fert || 1), 1);
        if (Math.random() < DY.birth * fert * (1 - kids * 0.1)) {
          const fem = Math.random() < 0.5;
          const c = newPerson(s, D, { name: pickName(s, D, D.race, fem), female: fem, bornS: S, blood: true, parents: [p.id, sp.id], st: childStats(p, sp) });
          inherit(c, p, sp);
          touch(D);
          if (owner === 'p') G.log(s, 'p', `👶 A ${fem ? 'daughter' : 'son'}, ${c.name}, is born to ${G.dynFullName(s, owner, p)}${c.traits.length ? ` (${c.traits.map(t => TR(t).name).join(', ')})` : ''}.`, 'good');
          D.prestige += 3;
        }
      }
    }
    // growing up: education, coming of age
    for (const p of alive(D)) {
      const a0 = ageAt(p, S - 1), a1 = ageAt(p, S);
      if (a1 < DY.adult && a1 >= DY.eduFrom) {
        if (owner !== 'p' && !p.focus && p.blood) p.focus = aiFocus(s, owner, p);
        if (p.focus) { if (Math.random() < 0.3) p.st[p.focus] = Math.min(20, p.st[p.focus] + 1); if (Math.random() < 0.06) { const k = G.pick(STATS); p.st[k] = Math.min(20, p.st[k] + 1); } }
        else if (Math.random() < 0.12) { const k = G.pick(STATS); p.st[k] = Math.min(20, p.st[k] + 1); }
      }
      if (a0 < DY.adult && a1 >= DY.adult && p.blood) comeOfAge(s, owner, D, p);
    }
    // the regency ends
    if (D.regent && ruler && ageAt(ruler, S) >= DY.adult) {
      if (owner === 'p') G.log(s, 'p', `👑 ${G.dynFullName(s, owner, ruler)} has come of age and rules in their own name. ${D.regent.name}'s regency is over.`, 'good');
      D.regent = null; D.prestige += 10; touch(D);
    } else if (D.regent && D.regent.id && (!D.people[D.regent.id] || D.people[D.regent.id].dead)) {
      D.regent = { id: null, name: G.pick(namesOf(D.race).m) + ' the Regent', female: false, st: rollStats() }; touch(D);
    }
    // illness and old age
    for (const p of alive(D)) {
      if (p.id === D.heroId) {
        const h = G.heroOf && G.heroOf(s, owner);
        if (h && h.name) p.name = h.name;
        continue;                                   // the hero's fate is decided on the battlefield
      }
      const age = ageAt(p, S);
      const isR = p.id === D.rulerId;
      const health = isR ? fxOf(s, D).health : p.traits.reduce((a, t) => a * (TR(t).health || 1), 1);
      if (Math.random() < hazard(age, health)) {
        const cause = age >= 60 ? 'age' : 'illness';
        if (isR) { succeed(s, owner, D, cause); }
        else {
          p.dead = true; p.diedS = S; p.cause = cause; touch(D);
          if (D.heir === p.id) D.heir = null;
          if (owner === 'p' && (p.spouse === D.rulerId || p.parents.includes(D.rulerId))) G.log(s, 'p', `🕯️ ${G.dynFullName(s, owner, p)} died ${CAUSE_TEXT[CAUSES[cause]]}, aged ${Math.floor(age)}.`, 'warn');
        }
      }
    }
    // prestige
    const f = fxOf(s, D);
    const reignY = ruler ? Math.max(0, (S - (ruler.crownS ?? S)) / 4) : 0;
    const ren = G.renown ? G.renown(s, owner) : 0;
    D.prestige = Math.round((D.prestige + (DY.prestigeSeason + Math.min(10, ren / 150) + Math.min(5, reignY)) * f.prestige) * 10) / 10;
    if (owner !== 'p') aiSeason(s, owner, D, S);
    if (S % 4 === 0) pruneCourt(s, D);
  };

  // AI courts: tutors, heirs, matches
  const aiSeason = (s, owner, D, S) => {
    const r = D.people[D.rulerId];
    if (!r) return;
    if (D.law === 'chosen') {
      const best = heirOrder(D).filter(p => ageF(s, p) >= DY.adult).sort((a, b) => candScore(s, D, b) - candScore(s, D, a))[0];
      if (best && D.heir !== best.id) { D.heir = best.id; touch(D); }
    }
    const free = eligible(s, D).filter(p => p.id !== D.rulerId || ageAt(p, S) < 58);
    if (free.length && Math.random() < 0.3) {
      const p = free[0];
      const others = Object.values(s.empires).filter(o => o.id !== owner && !o.dead && !o.minor && G.citiesOf(s, o.id).length && !G.dynTie(s, owner, o.id) && !G.dynMatchStatus(s, owner, p.id, o.id));
      const pPlayer = others.find(o => o.id === 'p');
      if (pPlayer && G.rel(s, owner).opinion + G.rulerRegard(s, owner, 'p') >= 15 && Math.random() < 0.35) {
        const mine = eligible(s, dyn(s, 'p'));
        if (mine.length && !(s.pending || []).some(x => x.kind === 'dynMatch')) {
          G.addPending(s, { kind: 'dynMatch', title: `A royal match from the ${s.empires[owner].name}`,
            text: `The ${s.empires[owner].name} propose that ${G.dynFullName(s, owner, p)} wed ${G.dynFullName(s, 'p', mine.find(x => x.female !== p.female) || mine[0])}. A marriage binds the houses: better relations, and a claim to their throne should it ever falter.`,
            options: [{ key: 'accept', label: 'Accept the match' }, { key: 'decline', label: 'Decline' }], expires: s.time + 10 * MIN(s), def: 'decline', data: { ai: owner, pid: (mine.find(x => x.female !== p.female) || mine[0]).id, their: p.id } });
          return;
        }
      }
      const ais = others.filter(o => o.id !== 'p');
      if (ais.length && Math.random() < 0.5) G.dynMarry(s, owner, p.id, G.pick(ais).id);
      else G.dynMarry(s, owner, p.id, 'noble');
    }
  };

  // process every season that has turned since the last look (catch-up safe)
  const tick = (s, dtMin = 0) => {
    if (s.gameOver) return;
    const n = Math.floor(nowS(s));
    for (const e of Object.values(s.empires)) {
      if (e.dead || e.minor || !G.citiesOf(s, e.id).length) continue;
      const D = dyn(s, e.id);
      if (!D) continue;
      // the hero's name follows a rename
      if (D.heroId && D.people[D.heroId]) { const h = G.heroOf && G.heroOf(s, e.id); if (h && h.name && D.people[D.heroId].name !== h.name) { D.people[D.heroId].name = h.name; touch(D); } }
      let k = 0;
      while (D.season < n && k++ < DY.maxCatchUp) { D.season++; seasonTick(s, e.id, D, D.season); }
      if (D.season < n) D.season = n;
      // the hero who rules
      if (D.heroId && D.heroId === D.rulerId) {
        const h = G.heroOf && G.heroOf(s, e.id);
        if (h && h.dead && (h.diedAt || 0) > (D.heroSeen || 0)) { D.heroSeen = h.diedAt || s.time; if (Math.random() < 0.5) succeed(s, e.id, D, 'battle'); else if (e.id === 'p') G.log(s, 'p', `🩹 ${G.dynFullName(s, e.id, D.people[D.rulerId])} was carried from the field, gravely wounded but alive.`, 'warn'); }
      }
      // loyalty under a just ruler
      if (dtMin > 0) {
        const f = fxOf(s, D);
        if (f.loyalty) for (const c of G.citiesOf(s, e.id)) if ((c.loyalty ?? 100) < 100) c.loyalty = Math.min(100, (c.loyalty ?? 100) + f.loyalty * dtMin);
      }
      if (D.crisis && D.crisis.until <= s.time) { D.crisis = null; if (e.id === 'p') G.log(s, 'p', '👑 The succession crisis is over: the realm accepts its ruler.', 'good'); }
    }
    // claims: won or lapsed
    const R = root(s);
    for (const c of [...R.claims]) {
      const city = s.cities[c.city];
      if (city && city.owner === c.by) {
        const Db = dyn(s, c.by); if (Db) Db.prestige += DY.claimPrestige;
        const Do = peek(s, c.on); if (Do) Do.prestige = Math.max(0, Do.prestige - 30);
        if (c.by === 'p') G.log(s, 'p', `👑 ${c.cityName} is ours: our claim is vindicated (+${DY.claimPrestige} prestige).`, 'good');
        else sayP(s, c.by, `👑 The ${s.empires[c.by].name} took ${c.cityName}, vindicating their claim on the ${s.empires[c.on].name}.`, c.on === 'p' ? 'bad' : 'info');
        R.claims = R.claims.filter(x => x !== c);
      } else if (c.until <= s.time || !city || !s.empires[c.on] || s.empires[c.on].dead || (s.empires[c.by] || {}).dead) {
        if (c.by === 'p' && c.until <= s.time) G.log(s, 'p', `Our claim on the throne of the ${s.empires[c.on].name} lapses.`, 'info');
        R.claims = R.claims.filter(x => x !== c);
      }
    }
  };
  G.dynTick = tick;
  G.slowHooks.push((s, dtMin) => tick(s, dtMin));
  // courts are founded lazily (first slow tick, or the first G.ruler call), so a fresh game's numbers are untouched until then

  // battles: a ruler who leads may fall when the army breaks
  G.battleHooks.push((s, ctx) => {
    if (!s.dynasty || !ctx || !ctx.m || !ctx.r) return;
    const m = ctx.m;
    const big = G.unitsCount(m.units || {}) >= 20;
    const fall = (owner) => {
      const D = peek(s, owner); if (!D || !D.people) return;
      const f = fxOf(s, D);
      if (!f.lead || D.heroId === D.rulerId) return;
      if (Math.random() < DY.battleDeath * f.battle) succeed(s, owner, D, 'battle');
    };
    if (!ctx.r.win && big && realmOk(s, m.owner) && ['attack', 'raid', 'conquer'].includes(m.type)) fall(m.owner);
    if (ctx.r.win && ctx.site === 'city' && ctx.defOwner && ctx.city && realmOk(s, ctx.defOwner) && G.capital(s, ctx.defOwner) === ctx.city) fall(ctx.defOwner);
  });

  // assassins: a successful grave mission at a capital may also take the ruler
  if (G.resolveMission) {
    const prev = G.resolveMission;
    G.resolveMission = (s, spy, opts) => {
      const task = spy && spy.task ? { ...spy.task } : null;
      const out = prev(s, spy, opts);
      try {
        if (out && out.ok && task && DATA.missions[task.type] && DATA.missions[task.type].hostile >= 2) {
          const city = s.cities[task.target];
          if (city && realmOk(s, city.owner) && G.capital(s, city.owner) === city) {
            const D = dyn(s, city.owner);
            const chance = DY.assassin * fxOf(s, D).assassin * (opts && opts.assassinRoll !== undefined ? 1 : 1);
            const roll = opts && opts.assassinRoll !== undefined ? opts.assassinRoll : Math.random();
            if (roll < chance) {
              const victim = G.dynFullName(s, city.owner, D.people[D.rulerId]);
              succeed(s, city.owner, D, 'assassin', spy.owner);
              out.assassinated = victim;
              if (spy.owner === 'p') G.log(s, 'p', `🗡️ In the chaos, our agents slew ${victim} of the ${s.empires[city.owner].name}!`, 'good');
              else if (city.owner === 'p') G.log(s, 'p', `🗡️ Assassins struck in ${city.name}: ${victim} is dead!`, 'bad');
            }
          }
        }
      } catch (e) { if (typeof console !== 'undefined') console.error('dynasty assassin', e); }
      return out;
    };
  }

  // -------------------------------------------------------------------
  // the Chronicle: coronations, weddings, pretenders, claims
  // -------------------------------------------------------------------
  if (G.chronText) {
    const base = G.chronText;
    G.chronText = (s, ev) => {
      if (!ev || !['crown', 'wed', 'pretender', 'claim'].includes(ev.k)) return base(s, ev);
      const V = G.CHRON_VOICE && s.empires.p && G.CHRON_VOICE[s.empires.p.race];
      const we = (V && V.we) || 'we';
      const who = (id, nm) => id === 'p' ? we : 'the ' + (nm || (s.empires[id] && s.empires[id].name) || 'a realm');
      let t;
      if (ev.k === 'crown') t = `${ev.c || 'the old ruler'} died ${CAUSE_TEXT[ev.n || 0] || ''}${ev.a === 'p' ? '' : ` in the realm of ${who(ev.a, ev.an)}`}, and ${ev.x || 'an heir'} took the crown`;
      else if (ev.k === 'wed') t = `${ev.x || 'two houses'} were wed, binding ${who(ev.a, ev.an)} and ${who(ev.b, ev.bn)}`;
      else if (ev.k === 'pretender') t = `${ev.x || 'a pretender'} raised ${ev.c || 'a city'} against ${who(ev.a, ev.an)}`;
      else t = `${who(ev.a, ev.an)} pressed a claim on the throne of ${who(ev.b, ev.bn)}, and marched for ${ev.c || 'their lands'}`;
      return t.charAt(0).toUpperCase() + t.slice(1) + '.';
    };
    if (G.CHRON_KINDS) {
      if (Array.isArray(G.CHRON_KINDS.realm)) for (const k of ['crown', 'wed']) if (!G.CHRON_KINDS.realm.includes(k)) G.CHRON_KINDS.realm.push(k);
      if (Array.isArray(G.CHRON_KINDS.war)) for (const k of ['pretender', 'claim']) if (!G.CHRON_KINDS.war.includes(k)) G.CHRON_KINDS.war.push(k);
    }
  }

  // -------------------------------------------------------------------
  // tales that know the ruler (storylets.js)
  // -------------------------------------------------------------------
  if (G.story && G.story.fx && G.story.P && Array.isArray(DATA.storylets)) {
    const P = G.story.P;
    // a child of the ruler between 5 and 15 (binds ctx.kid)
    P.royalChild = () => (s, ctx) => {
      const D = dyn(s, ctx.owner); if (!D) return false;
      const kids = childrenOf(D, D.people[D.rulerId]).filter(c => { const a = ageF(s, c); return a >= DY.eduFrom && a < DY.adult; });
      if (!kids.length) return false; ctx.kid = G.pick(kids).id; return true;
    };
    P.rulerFrail = (age = 45) => (s, ctx) => { const r = G.ruler(s, ctx.owner); return !!r && (ageF(s, r) >= age || r.traits.includes('sickly')); };
    const fx = G.story.fx;
    fx.dynTutor = (s, ctx, n = 2) => {
      const D = dyn(s, ctx.owner); const p = D && D.people[ctx.kid];
      if (!p || p.dead) return '';
      const k = p.focus || STATS.slice().sort((a, b) => p.st[b] - p.st[a])[0];
      p.st[k] = Math.min(20, p.st[k] + n); touch(D);
      return `+${n} ${DATA.rulerStats[k].name.toLowerCase()} for ${p.name}`;
    };
    fx.dynPrestige = (s, ctx, n) => { const D = dyn(s, ctx.owner); if (!D) return ''; D.prestige = Math.max(0, D.prestige + n); return `${n > 0 ? '+' : '−'}${Math.abs(n)} prestige`; };
    fx.dynRisk = (s, ctx, p) => {
      const D = dyn(s, ctx.owner); if (!D) return '';
      if (Math.random() < p) { const nm = G.dynFullName(s, ctx.owner, D.people[D.rulerId]); succeed(s, ctx.owner, D, 'tale'); return `${nm} did not survive`; }
      return 'the ruler pulls through';
    };
    fx.dynTrait = (s, ctx, t) => { const D = dyn(s, ctx.owner); const p = D && D.people[ctx.kid || D.rulerId]; if (!p || !addTrait(p, t)) return ''; touch(D); return `${p.name} is now ${TR(t).name.toLowerCase()}`; };
    const kidName = v => { const D = dyn(v.s, v.owner); const p = D && D.people[v.c.kid]; return p ? G.dynFullName(v.s, v.owner, p) : 'the royal child'; };
    const rulerName = v => G.dynFullName(v.s, v.owner, G.ruler(v.s, v.owner)) || 'the ruler';
    DATA.storylets.push(
      { id: 'dyn_tutor', icon: '🎓', title: 'The Wandering Tutor', w: 1, when: [P.after(25), P.royalChild()],
        stages: { start: { art: '📚🧓🏰', text: v => `A scholar with ink-stained fingers and a mule laden with books arrives at court. Kings across the world have paid for lessons, he says, and he would gladly take ${kidName(v)} in hand — for a fee.`,
          def: 'decline', choices: [
            { key: 'hire', label: 'Engage him for a season', cost: v => ({ gold: 90 * v.k }), ai: 1.4, fx: () => [['dynTutor', 2], ['flag', 'tutor_hired', true]], say: v => `${kidName(v)} grumbles at first, then begins to shine.` },
            { key: 'court', label: 'Offer him a seat at court instead', fx: () => [['dynPrestige', 6], ['dynTutor', 1]], say: 'He accepts a chair, a cloak, and very little gold.' },
            { key: 'decline', label: 'The royal tutors will do', fx: [], say: 'He bows, and takes the road to a richer court.' },
          ] } } },
      { id: 'dyn_fever', icon: '🤒', title: 'A Fever at Court', w: 0.8, when: [P.after(40), P.rulerFrail(48)],
        stages: { start: { art: '🛏️🕯️⚗️', text: v => `${rulerName(v)} has taken to bed with a burning fever. The court physicians argue in the corridors; the priests light candles; the heirs watch one another.`,
          def: 'rest', choices: [
            { key: 'physicians', label: 'Summon the finest physicians', cost: v => ({ gold: 120 * v.k }), ai: 1.3, fx: () => [['dynPrestige', 2]], say: 'Leeches, bitter draughts and three sleepless nights: the fever breaks.' },
            { key: 'pray', label: 'Order prayers in every temple', chance: 0.7, cost: () => (G.ensureReligion ? { faith: 15 } : {}), fx: [], fail: () => [['dynRisk', 0.35]], say: 'The bells ring, and the fever breaks at dawn.', failSay: 'The bells ring on, and the fever does not break.' },
            { key: 'rest', label: 'Rest, and trust a strong constitution', chance: 0.8, fx: [], fail: () => [['dynRisk', 0.5]], say: 'The fever passes as fevers do.', failSay: 'The fever worsens in the night.' },
          ] } } },
    );
  }

  // marriages made by treaty in diplomacy.js (royal marriage) appear at court as a consort or a match
  G.slowHooks.push(s => {
    if (s.gameOver || (typeof G.hasTreaty !== 'function' && typeof G.treatiesOf !== 'function')) return;
    const D = peek(s, 'p'); if (!D) return;
    D.treaty = D.treaty || {};
    for (const o of Object.values(s.empires)) {
      if (o.id === 'p' || o.dead || o.minor || D.treaty[o.id] || !treatyTie(s, 'p', o.id)) continue;
      D.treaty[o.id] = true;
      if (courtTie(D, o.id) || courtTie(peek(s, o.id), 'p')) continue;
      const p = eligible(s, D)[0];
      if (p) G.dynMarry(s, 'p', p.id, o.id, { free: true });
    }
  });
})();
