// =====================================================================
//  Generals and army stances.
//
//  Besides its single hero a realm appoints generals (captains): recruited
//  in a city with a Barracks (level GEN.barracks) for gold, up to a cap that
//  grows with cities and renown. Each has a name, a portrait seed, a level
//  (xp from battles) and one or two traits. A general rides with an army
//  (G.sendArmyWith … orders.general), lends it a leadership multiplier and
//  his traits, may be wounded, captured or (rarely) killed, and comes home
//  with the survivors. A general at home in a city commands its garrison:
//  his defensive traits apply when the city is attacked.
//
//  Every march carries a stance (orders.stance): Aggressive, Balanced,
//  Defensive, Skirmish, Siege. Every city has a garrison stance
//  (city.garStance): standing orders, Hold the walls, Sally out, Evacuate
//  stores. Stances shift attack/defence (labelled battle modifiers) and,
//  through G.battle's opts.k, the casualty split and the volley/pursuit
//  phases. All effects are bounded (see GEN.bounds) and shown in
//  r.tactics.mods (kind 'stance' / 'general') and r.tactics.stances.
//
//  State: s.empires[id].generals = [{ id, name, race, seed, level, xp, hp,
//    traits:[key], status:'home'|'riding'|'marching'|'captured', city, move,
//    until, captor, releaseAt, battles, wins }]; fallen ones go to
//    emp.fallenGenerals. Moves carry m.general (id) and m.stance (key).
//
//  API: G.generalsOf, G.generalById, G.generalCap, G.generalCost,
//    G.canRecruitGeneral, G.generalPool, G.recruitGeneral, G.dismissGeneral,
//    G.stationGeneral, G.ransomGeneral, G.generalAvailable, G.generalsAt,
//    G.commanderOf, G.generalLeadership, G.generalEdge, G.stanceEdge,
//    G.marchFactor, G.withOrders, G.sendArmyWith, G.previewWith,
//    G.setGarrisonStance, G.generalFateOdds, G.aiOrders, G.generalSpec,
//    G.moveHasTrait (for other modules, e.g. supply lines: Forager).
// =====================================================================
'use strict';
{
  const GEN = {
    barracks: 3,                 // Barracks level needed in the recruiting city
    costBase: 220, costStep: 160, // gold for the next general
    capMax: 8, renownPer: 800,   // cap = 1 + cities/3 + renown/800, at most 8
    maxLevel: 10, lead: 0.015,   // leadership: +1.5% per level
    minHp: 50,                   // health needed to march
    regen: 15,                   // health per game hour at home
    wage: 0.4,                   // gold per game minute per general
    poolEvery: 2 * 3600,         // recruit candidates refresh (× pace time)
    captivity: 2 * 3600,         // captives are exchanged after (× pace time)
    secondTrait: [4, 8],         // levels at which a one-trait general may learn a second
    rng: null,                   // fate dice (null: Math.random)
    bounds: { mult: [0.9, 1.4], loss: [0.4, 1.4], foeLoss: [0.5, 1.4], volley: [0, 2], pursuit: [0, 2] },
  };
  G.GEN = GEN;
  const HOSTILE = ['raid', 'attack', 'conquer'];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---- traits: fx(ctx) -> { mult, loss, foeLoss, volley, pursuit, foePursuit, cap } for the side the general fights on ----
  // ctx = { side:'att'|'def', sh: role shares of the side's power, f: battlefield or null, mode, city: defending city or null }
  const ROUGH = { forest: 1, hills: 1, mountain: 1 };
  DATA.generalTraits = {
    siegemaster: { name: 'Siegemaster', icon: '🪵', desc: 'Siege engines +25% attack; rams break 40% more wall; +4% attacking cities, +5% defending walls.',
      fx: c => c.side === 'att' ? { mult: 1 + 0.25 * (c.sh.siege || 0) + (c.city ? 0.04 : 0) } : { mult: c.city ? 1.05 : 1 } },
    horselord:   { name: 'Horselord',   icon: '🐎', desc: 'Cavalry +15% attack (+10% defence); the pursuit runs 25% longer.',
      fx: c => ({ mult: 1 + (c.side === 'att' ? 0.15 : 0.10) * (c.sh.cavalry || 0), pursuit: 1.25 }) },
    shieldwall:  { name: 'Shieldwall',  icon: '🛡️', desc: 'Infantry +15% defence; attacking, infantry-heavy armies lose up to 20% fewer.',
      fx: c => c.side === 'def' ? { mult: 1 + 0.15 * (c.sh.infantry || 0) } : { loss: 1 - 0.2 * (c.sh.infantry || 0) } },
    hawkeye:     { name: 'Hawkeye',     icon: '🏹', desc: 'Ranged +15%; the opening volley strikes 25% harder.',
      fx: c => ({ mult: 1 + 0.15 * (c.sh.ranged || 0), volley: 1.25 }) },
    forager:     { name: 'Forager',     icon: '🌾', desc: 'His army lives off the land: no grain rations while it marches, +15% plunder carried.', fx: () => ({}) },
    swift:       { name: 'Swift',       icon: '💨', desc: 'His army marches 20% faster; +15% pursuit.', fx: () => ({ pursuit: 1.15 }) },
    ambusher:    { name: 'Ambusher',    icon: '🌲', desc: '+12% in forests, hills and mountains.',
      fx: c => ({ mult: c.f && ROUGH[c.f.terrain] ? 1.12 : 1 }) },
    cautious:    { name: 'Cautious',    icon: '🐢', desc: '−8% own losses; the foe\'s pursuit is halved; a beaten army withdraws (at most 85% lost). Rarely captured.',
      fx: () => ({ loss: 0.92, foePursuit: 0.5, cap: 0.85 }) },
    reckless:    { name: 'Reckless',    icon: '🔥', desc: '+12% attack, but 15% more own losses and twice the risk to himself.',
      fx: c => c.side === 'att' ? { mult: 1.12, loss: 1.15 } : { mult: 0.95, loss: 1.1 } },
    beloved:     { name: 'Beloved',     icon: '💛', desc: 'The realm feels 15% less war weariness while he serves.', fx: () => ({}) },
    drillmaster: { name: 'Veteran Trainer', icon: '🎖️', desc: 'Troops train 10% faster in the city where he is stationed; +3% in battle.', fx: () => ({ mult: 1.03 }) },
    warden:      { name: 'Warden',      icon: '🏰', desc: '+10% defence for the garrison he commands.', fx: c => ({ mult: c.side === 'def' ? 1.10 : 1 }) },
    raider:      { name: 'Raider',      icon: '💰', desc: 'Raids: +5% attack and +25% plunder carried.', fx: c => ({ mult: c.side === 'att' && c.mode === 'raid' ? 1.05 : 1 }) },
    tactician:   { name: 'Tactician',   icon: '♟️', desc: 'His leadership counts half again (+2.25% per level instead of +1.5%).', fx: () => ({}) },
    lucky:       { name: 'Lucky',       icon: '🍀', desc: 'Half the odds of being wounded, captured or killed.', fx: () => ({}) },
    riverwise:   { name: 'Riverwise',   icon: '🌊', desc: 'Finds the fords: no penalty attacking across a river (+15%, +20% in spring floods).',
      fx: c => ({ mult: c.side === 'att' && c.f && c.f.crossing && !c.f.naval ? 1 + (c.f.season === 0 ? -DATA.battleRules.riverSpring : -DATA.battleRules.river) : 1 }) },
  };

  // ---- army stances (attacker) ----
  // atk: attack bonus; mobile: extra attack per share of ranged+cavalry+flyer power; city/field: extra vs cities / elsewhere;
  // k: casualty shaping (see G.battle opts.k); speed: march speed factor; loot: plunder factor; wall: wall-breaking factor
  DATA.stances = {
    balanced:   { name: 'Balanced',   icon: '⚖️', desc: 'The default: no special orders.', k: {} },
    aggressive: { name: 'Aggressive', icon: '🗡️', desc: '+10% attack; both sides lose more (+20% / +15%); the pursuit runs half again as long.',
      atk: 0.10, k: { loss: 1.2, foeLoss: 1.15, pursuit: 1.5 } },
    defensive:  { name: 'Defensive',  icon: '🛡️', desc: '−5% attack; a quarter fewer own losses, 15% fewer enemy losses; no pursuit; a beaten army withdraws (at most 70% lost).',
      atk: -0.05, k: { loss: 0.75, foeLoss: 0.85, pursuit: 0, cap: 0.7 } },
    skirmish:   { name: 'Skirmish',   icon: '🏹', desc: 'Loose the volley and withdraw: up to +7% for ranged and cavalry armies; both sides lose about half as much (at most 50%); volley +50%. Not for conquests.',
      atk: -0.05, mobile: 0.12, k: { loss: 0.55, foeLoss: 0.6, cap: 0.5, volley: 1.5, pursuit: 0.5 }, noConquer: true },
    siege:      { name: 'Siege',      icon: '🏰', desc: 'For city assaults: +6% against cities (−5% elsewhere); rams break 50% more wall; marches 20% slower; half the plunder.',
      city: 0.06, field: -0.05, k: {}, speed: 0.8, loot: 0.5, wall: 1.5 },
  };
  DATA.stanceOrder = ['balanced', 'aggressive', 'defensive', 'skirmish', 'siege'];
  // ---- garrison stances (defender) ----
  DATA.garrisonStances = {
    standing: { name: 'Standing orders', icon: '🏳️', desc: 'No special orders.', k: {} },
    hold:     { name: 'Hold the walls',  icon: '🧱', desc: '+8% defence and 15% fewer losses, but the repulsed are not chased.', def: 0.08, k: { loss: 0.85, pursuit: 0 } },
    sally:    { name: 'Sally out',       icon: '🐎', desc: '−4% defence and 10% more own losses, but beaten attackers lose 25% more and are chased hard.', def: -0.04, k: { loss: 1.1, foeLoss: 1.25, pursuit: 1.6 } },
    evacuate: { name: 'Evacuate stores', icon: '📦', desc: 'Stores are carted away: raiders find a quarter of the storehouse hidden; −10% defence and −8% raw goods while it lasts.', def: -0.10, protect: 0.25, prod: 0.92, k: {} },
  };
  DATA.garrisonStanceOrder = ['standing', 'hold', 'sally', 'evacuate'];

  // ---- names: per people, first names and bynames ----
  DATA.generalNames = {
    hearth: [['Aldous', 'Brannock', 'Edwyn', 'Gwenna', 'Halbert', 'Isolde', 'Jory', 'Merrick', 'Tamsin', 'Walther', 'Rowena', 'Godric'], ['Stoutheart', 'of Ninefields', 'Longspear', 'Greyhelm', 'Barrowford', 'the Steady', 'Wheatwall', 'of the March']],
    delver: [['Brokk', 'Dagna', 'Fundin', 'Grimma', 'Hrolf', 'Ketta', 'Morgrim', 'Nalda', 'Thrain', 'Ulla', 'Bardin', 'Sigga'], ['Ironfist', 'Deepdelve', 'Shieldbiter', 'Coalbeard', 'the Unbroken', 'Anvilborn', 'Stonewall', 'Gatekeeper']],
    sylvan: [['Aerin', 'Caelith', 'Eluned', 'Faendril', 'Ilyra', 'Lorien', 'Maeve', 'Naerys', 'Thalion', 'Vaelis', 'Seren', 'Ondrel'], ['Swiftarrow', 'of the Glade', 'Leafshadow', 'Thornguard', 'the Quiet', 'Hawkwing', 'Moonbow', 'Greenmantle']],
    ash:    [['Grukk', 'Azka', 'Borzag', 'Drek', 'Ghora', 'Karnak', 'Mogra', 'Ruzh', 'Skarn', 'Uzga', 'Throg', 'Vrenna'], ['the Burner', 'Skullcleaver', 'Ironjaw', 'Cindermaw', 'Bloodhorn', 'the Red Hand', 'Ashbringer', 'Wolfrider']],
    tide:   [['Corran', 'Isla', 'Maris', 'Nerin', 'Oswy', 'Pelagia', 'Rhun', 'Saoirse', 'Tavin', 'Wenna', 'Bryn', 'Kelda'], ['Saltblade', 'Wavebreaker', 'of the Shoals', 'Stormkeel', 'the Drowned', 'Reefwarden', 'Gullshield', 'Tidecaller']],
    veil:   [['Ashen', 'Coriel', 'Duskra', 'Ephiel', 'Laith', 'Mirelle', 'Nyx', 'Oriane', 'Sable', 'Vesper', 'Quill', 'Tirra'], ['Nightglass', 'the Silent', 'Mothcloak', 'of the Gloaming', 'Shadeblade', 'Starless', 'Veilwarden', 'Dreamthorn']],
    grave:  [['Morcar', 'Bleak', 'Cadaver Ned', 'Dirge', 'Ebba', 'Hollis', 'Mordant', 'Ossia', 'Pallor', 'Sorrow', 'Wraithe', 'Yew'], ['the Unresting', 'Bonecaptain', 'Gravewatch', 'of the Barrows', 'Cryptborn', 'Ashenhand', 'the Pale', 'Shroudkeeper']],
    wind:   [['Aeris', 'Bryndel', 'Cirra', 'Galen', 'Hesper', 'Kestrel', 'Lark', 'Nimbus', 'Sorin', 'Tamsa', 'Zephan', 'Wren'], ['Skyrider', 'Cloudspear', 'of the Heights', 'Galeborn', 'the Swift', 'Stormwing', 'Highcrag', 'Featherblade']],
  };
  const nameFor = (s, emp) => {
    const L = DATA.generalNames[emp.race] || DATA.generalNames.hearth;
    const used = new Set([...(emp.generals || []), ...(emp.fallenGenerals || []), ...((emp.genPool && emp.genPool.list) || [])].map(g => g.name));
    for (let i = 0; i < 30; i++) { const n = G.pick(L[0]) + ' ' + G.pick(L[1]); if (!used.has(n)) return n; }
    return G.pick(L[0]) + ' ' + G.pick(L[1]) + ' ' + (used.size + 1);
  };

  // ---- state ----
  const ensure = s => {
    for (const e of Object.values(s.empires || {})) {
      if (!Array.isArray(e.generals)) e.generals = [];
      if (!Array.isArray(e.fallenGenerals)) e.fallenGenerals = [];
      e.genSeq = e.genSeq || 0;
    }
    return s;
  };
  G.ensureGenerals = ensure;
  G.generalsOf = (s, owner) => { const e = s.empires[owner]; if (!e) return []; if (!Array.isArray(e.generals)) ensure(s); return e.generals; };
  G.generalById = (s, owner, id) => id ? G.generalsOf(s, owner).find(g => g.id === id) || null : null;
  G.generalCap = (s, owner) => Math.min(GEN.capMax, 1 + Math.floor(G.citiesOf(s, owner).length / 3) + Math.floor(G.renown(s, owner) / GEN.renownPer));
  G.generalCost = (s, owner) => ({ gold: GEN.costBase + GEN.costStep * G.generalsOf(s, owner).length });
  G.generalXpNeed = L => Math.round(80 * Math.pow(L, 1.4));
  G.generalHas = (g, t) => !!(g && g.traits && g.traits.includes(t));
  G.generalLeadership = g => g ? 1 + GEN.lead * g.level * (G.generalHas(g, 'tactician') ? 1.5 : 1) : 1;
  G.generalSpec = (s, owner, g) => {
    const e = s.empires[owner] || {};
    return { race: g.race || e.race || 'hearth', kind: 'hero', seed: 'general:' + g.seed, color: e.color, rank: Math.min(10, g.level),
      era: G.techEra ? G.techEra(s, owner) : 0, wounded: g.hp < 100 ? Math.round((100 - g.hp) / 25) / 4 : 0, dead: !!g.dead };
  };
  const newGeneral = (s, emp, level) => {
    const keys = Object.keys(DATA.generalTraits);
    const t1 = G.pick(keys);
    const traits = [t1];
    if (Math.random() < 0.4) traits.push(G.pick(keys.filter(k => k !== t1)));
    return { name: nameFor(s, emp), race: emp.race, seed: Math.floor(Math.random() * 1e9).toString(36), level: level || 1, xp: 0, hp: 100, traits, battles: 0, wins: 0 };
  };
  // three candidates to pick from, refreshed every couple of game hours
  G.generalPool = (s, owner) => {
    const emp = s.empires[owner];
    ensure(s);
    if (!emp.genPool || s.time >= emp.genPool.next || !emp.genPool.list || emp.genPool.list.length < 1) {
      emp.genPool = { next: s.time + GEN.poolEvery * G.pace(s).time, list: [] };
      for (let i = 0; i < 3; i++) emp.genPool.list.push(newGeneral(s, emp, Math.random() < 0.25 ? 2 : 1));
    }
    return emp.genPool;
  };
  G.canRecruitGeneral = (s, owner, cityId) => {
    const c = s.cities[cityId];
    if (!c || c.owner !== owner) return 'No such city';
    if (G.lvl(c, 'barracks') < GEN.barracks) return `Needs a Barracks of level ${GEN.barracks} in ${c.name}`;
    const cap = G.generalCap(s, owner);
    if (G.generalsOf(s, owner).length >= cap) return `The realm can keep ${cap} general${cap > 1 ? 's' : ''} (more with cities and renown)`;
    const cost = G.generalCost(s, owner);
    if (s.empires[owner].gold < cost.gold) return `Needs ${cost.gold} gold`;
    return null;
  };
  G.recruitGeneral = (s, owner, cityId, idx = 0) => {
    const err = G.canRecruitGeneral(s, owner, cityId);
    if (err) return err;
    const pool = G.generalPool(s, owner);
    const cand = pool.list[idx];
    if (!cand) return 'No such candidate';
    const emp = s.empires[owner];
    emp.gold -= G.generalCost(s, owner).gold;
    pool.list.splice(idx, 1);
    emp.genSeq = (emp.genSeq || 0) + 1;
    const g = { ...cand, id: owner + 'g' + emp.genSeq, status: 'home', city: cityId, move: null, appointed: s.time };
    emp.generals.push(g);
    G.log(s, owner, `🎖️ ${g.name} was appointed general in ${s.cities[cityId].name} (${g.traits.map(t => DATA.generalTraits[t].name).join(', ')}).`, 'good');
    return null;
  };
  G.dismissGeneral = (s, owner, id) => {
    const g = G.generalById(s, owner, id);
    if (!g) return 'No such general';
    if (g.status === 'marching') return 'He is in the field';
    s.empires[owner].generals = G.generalsOf(s, owner).filter(x => x !== g);
    G.log(s, owner, `${g.name} retired from command.`);
    return null;
  };
  // send a general riding to another of the realm's cities
  G.stationGeneral = (s, owner, id, cityId) => {
    const g = G.generalById(s, owner, id), c = s.cities[cityId];
    if (!g) return 'No such general';
    if (!c || c.owner !== owner) return 'Only to your own cities';
    if (g.status !== 'home') return g.status === 'riding' ? 'Already on the road' : 'He is not at home';
    if (g.city === cityId) return 'Already there';
    const from = s.cities[g.city] || G.capital(s, owner);
    const dur = from ? G.travelTime(s, owner, from, c, G.GEN_SPEED) : 60;
    g.status = 'riding'; g.city = cityId; g.until = s.time + dur;
    return null;
  };
  G.GEN_SPEED = 12;
  G.ransomCost = g => ({ gold: 80 + 60 * g.level });
  G.ransomGeneral = (s, owner, id) => {
    const g = G.generalById(s, owner, id);
    if (!g || g.status !== 'captured') return 'Not a captive';
    const cost = G.ransomCost(g).gold, emp = s.empires[owner];
    if (emp.gold < cost) return `Needs ${cost} gold`;
    emp.gold -= cost;
    if (s.empires[g.captor]) s.empires[g.captor].gold += cost;
    release(s, owner, g, 'ransomed');
    return null;
  };
  const release = (s, owner, g, how) => {
    const cap = G.capital(s, owner);
    g.status = 'home'; g.city = cap ? cap.id : null; g.captor = null; g.releaseAt = null; g.hp = Math.max(g.hp, 40);
    if (cap) G.log(s, owner, `🎖️ ${g.name} was ${how} and is back in ${cap.name}.`, 'good');
  };
  G.generalsAt = (s, owner, cityId) => G.generalsOf(s, owner).filter(g => g.status === 'home' && g.city === cityId);
  G.generalAvailable = (s, owner, id, cityId) => {
    const g = G.generalById(s, owner, id);
    if (!g) return 'No such general';
    if (g.status !== 'home') return `${g.name} is ${g.status === 'riding' ? 'on the road' : g.status === 'captured' ? 'a captive' : 'in the field'}`;
    if (g.city !== cityId) return `${g.name} is not in this city`;
    if (g.hp < GEN.minHp) return `${g.name} is too wounded to march (${Math.floor(g.hp)} health)`;
    return null;
  };
  // the general commanding a city's garrison: the best one at home there
  G.commanderOf = (s, city) => {
    if (!city || !city.owner || !s.empires[city.owner]) return null;
    let best = null;
    for (const g of G.generalsOf(s, city.owner)) if (g.status === 'home' && g.city === city.id && g.hp >= 20 && (!best || g.level > best.level || (g.level === best.level && g.hp > best.hp))) best = g;
    return best;
  };
  G.setGarrisonStance = (s, cityId, key) => {
    const c = s.cities[cityId];
    if (!c || !DATA.garrisonStances[key]) return 'Unknown stance';
    if (key === 'standing') delete c.garStance; else c.garStance = key;
    return null;
  };
  G.garrisonStanceOf = city => (city && DATA.garrisonStances[city.garStance]) ? city.garStance : 'standing';
  G.moveHasTrait = (s, m, t) => !!(m && m.general && G.generalHas(G.generalById(s, m.owner, m.general), t));
  // march speed factor for these orders (stance and Swift)
  G.marchFactor = (s, owner, orders) => {
    if (!orders) return 1;
    const st = DATA.stances[orders.stance] || DATA.stances.balanced;
    const g = G.generalById(s, owner, orders.general);
    return (st.speed || 1) * (G.generalHas(g, 'swift') ? 1.2 : 1);
  };

  // ---- battle effects ----
  const roleShares = (s, owner, units, side) => {
    const out = {}; let tot = 0;
    for (const [u, n] of Object.entries(units || {})) {
      if (!(n > 0) || !DATA.units[u]) continue;
      const d = G.unitStats(s, owner, u), v = (side === 'att' ? d.atk : (d.defI + d.defC) / 2) * n, r = G.roleOf(u);
      out[r] = (out[r] || 0) + v; tot += v;
    }
    if (tot > 0) for (const r of Object.keys(out)) out[r] /= tot;
    return out;
  };
  const mulK = (into, k) => {
    for (const key of ['loss', 'foeLoss', 'volley', 'pursuit']) if (k[key] !== undefined) into[key] = (into[key] ?? 1) * k[key];
    if (k.cap !== undefined) into.cap = Math.min(into.cap ?? 1, k.cap);
    return into;
  };
  const boundK = k => {
    const B = GEN.bounds, o = {};
    for (const key of ['loss', 'foeLoss', 'volley', 'pursuit']) if (k[key] !== undefined) o[key] = clamp(k[key], B[key][0], B[key][1]);
    if (k.cap !== undefined) o.cap = clamp(k.cap, 0.4, 1);
    return o;
  };
  // a general's labelled multiplier and casualty shaping for one side
  G.generalEdge = (s, owner, g, units, side, f, mode, city) => {
    const sh = roleShares(s, owner, units, side);
    const c = { side, sh, f, mode, city };
    const labels = [], k = {}, foe = {};
    let mult = G.generalLeadership(g);
    const parts = [];
    for (const t of g.traits || []) {
      const T = DATA.generalTraits[t]; if (!T) continue;
      const fx = T.fx(c) || {};
      if (fx.mult && Math.abs(fx.mult - 1) >= 0.005) { mult *= fx.mult; parts.push(T.name); }
      mulK(k, fx);
      if (fx.foePursuit !== undefined) foe.pursuit = (foe.pursuit ?? 1) * fx.foePursuit;
    }
    mult = clamp(mult, GEN.bounds.mult[0], GEN.bounds.mult[1]);
    labels.push({ side, label: `General ${g.name} (level ${g.level}${parts.length ? ', ' + parts.join(', ') : ''})`, mult, kind: 'general' });
    return { mult, labels, k: boundK(k), foe };
  };
  // a stance's labelled multiplier and casualty shaping (attacker: DATA.stances, defender: DATA.garrisonStances)
  G.stanceEdge = (s, owner, key, units, side, city) => {
    const st = side === 'att' ? DATA.stances[key] || DATA.stances.balanced : DATA.garrisonStances[key] || DATA.garrisonStances.standing;
    let add = side === 'att' ? (st.atk || 0) : (st.def || 0);
    if (side === 'att' && st.mobile) { const sh = roleShares(s, owner, units, 'att'); add += st.mobile * ((sh.ranged || 0) + (sh.cavalry || 0) + (sh.flyer || 0)); }
    if (side === 'att' && (st.city || st.field)) add += city ? (st.city || 0) : (st.field || 0);
    const mult = 1 + clamp(add, -0.1, 0.1);
    const labels = Math.abs(mult - 1) >= 0.005 ? [{ side, label: `${st.name} ${side === 'att' ? 'stance' : 'garrison'}`, mult, kind: 'stance' }] : [];
    return { mult, labels, k: boundK(st.k || {}) };
  };

  // the context of the march being resolved or previewed: { owner, units, move?, general, stance, preview?, info }
  G._gctx = null;
  const ctxFor = (attOwner, att) => G._gctx && G._gctx.units === att && G._gctx.owner === attOwner ? G._gctx : null;
  const infoOf = (s, owner, g) => ({ owner, id: g.id, name: g.name, level: g.level, traits: [...g.traits], seed: g.seed, race: g.race });
  {
    const baseBattle = G.battle;
    G.battle = (s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode) => {
      let opts = mode && typeof mode === 'object' ? mode : null;
      const amb = !opts && G._field && G._field.units === att && G._field.owner === attOwner;
      const ctx = ctxFor(attOwner, att);
      const pos = opts && opts.x !== undefined ? opts : amb ? G._field : null;
      // the defending city: on the battlefield's tile, or the city whose garrison this is
      let dc = null;
      if (defOwner && s.empires[defOwner]) {
        const t = pos && G.tileAt(s, pos.x, pos.y), tc = t && t.city && s.cities[t.city];
        if (tc && tc.owner === defOwner && (tc.units === def || (ctx && ctx.preview))) dc = tc;
        else if (!pos) dc = Object.values(s.cities).find(c => c.units === def && c.owner === defOwner) || null;
      }
      const gA = ctx && ctx.general ? G.generalById(s, attOwner, ctx.general) : null;
      const stA = ctx && DATA.stances[ctx.stance] ? ctx.stance : 'balanced';
      const gD = dc ? G.commanderOf(s, dc) : null;
      const stD = dc ? G.garrisonStanceOf(dc) : 'standing';
      if (!gA && !gD && stA === 'balanced' && stD === 'standing') return baseBattle(s, attOwner, att, attMult, defOwner, def, defMult, flatDef, mode);
      if (!opts) opts = amb ? { ...G._field, mode, ambient: true } : { mode: mode || 'attack' };
      const bmode = opts.mode === 'raid' ? 'raid' : 'attack';
      const f = pos ? (opts.field || G.battlefield(s, pos.x, pos.y, pos.path, pos.naval)) : null;
      const tile = pos && G.tileAt(s, pos.x, pos.y), atCity = !!(tile && tile.city);
      const labels = [...(opts.labels || [])], kA = {}, kD = {};
      const addEdge = (e, k) => { for (const l of e.labels) { labels.push(l); if (l.side === 'att') attMult *= l.mult; else defMult *= l.mult; } mulK(k, e.k); };
      addEdge(G.stanceEdge(s, attOwner, stA, att, 'att', atCity), kA);
      if (dc) addEdge(G.stanceEdge(s, defOwner, stD, def, 'def', dc), kD);
      if (gA) { const e = G.generalEdge(s, attOwner, gA, att, 'att', f, bmode, atCity ? tile : null); addEdge(e, kA); if (e.foe.pursuit !== undefined) kD.pursuit = (kD.pursuit ?? 1) * e.foe.pursuit; }
      if (gD) { const e = G.generalEdge(s, defOwner, gD, def, 'def', f, bmode, dc); addEdge(e, kD); if (e.foe.pursuit !== undefined) kA.pursuit = (kA.pursuit ?? 1) * e.foe.pursuit; }
      const S_A = DATA.stances[stA], S_D = DATA.garrisonStances[stD];
      const stances = { att: { key: stA, name: S_A.name, icon: S_A.icon }, def: dc ? { key: stD, name: S_D.name, icon: S_D.icon } : null };
      const k = { att: boundK(kA), def: boundK(kD) };
      if (opts.k) { mulK(k.att, opts.k.att || {}); mulK(k.def, opts.k.def || {}); }
      const r = baseBattle(s, attOwner, att, attMult, defOwner, def, defMult, flatDef, { ...opts, labels, k, stances });
      const gi = { att: gA ? infoOf(s, attOwner, gA) : null, def: gD ? infoOf(s, defOwner, gD) : null };
      if (r && r.tactics) {
        r.tactics.stances = r.tactics.stances || stances;
        if (gA || gD) r.tactics.generals = gi;
        r.tactics.k = k;
      }
      if (ctx && !ctx.preview) { ctx.info = { ...gi, stances }; ctx.defGeneral = gD ? gD.id : null; ctx.defCity = dc ? dc.id : null; }
      return r;
    };
  }

  // ---- orders: sending, previews ----
  G._orders = null;
  // run fn with these orders in force for owner's army `units` (previews, ETA)
  G.withOrders = (s, owner, units, orders, fn) => {
    const pg = G._gctx, po = G._orders;
    G._orders = orders ? { owner, ...orders } : null;
    G._gctx = orders ? { owner, units, general: orders.general || null, stance: orders.stance || 'balanced', preview: true } : null;
    try { return fn(); } finally { G._gctx = pg; G._orders = po; }
  };
  G.previewWith = (s, city, tile, units, mode, orders) => G.withOrders(s, city.owner, units, orders, () => (G.previewField || G.previewBattle)(s, city, tile, units, mode));
  const validOrders = (s, owner, fromId, type, orders) => {
    if (!orders) return null;
    if (orders.stance && !DATA.stances[orders.stance]) return 'Unknown stance';
    if (orders.stance && orders.stance !== 'balanced' && !HOSTILE.includes(type)) return 'Stances are for raids, attacks and conquests';
    if (orders.stance === 'skirmish' && type === 'conquer') return 'A city is not conquered by skirmishing';
    if (orders.general) {
      if (!HOSTILE.includes(type) && type !== 'reinforce') return 'Generals lead raids, attacks, conquests and reinforcements';
      return G.generalAvailable(s, owner, orders.general, fromId);
    }
    return null;
  };
  G.sendArmyWith = (s, fromId, x, y, type, units, cargo, orders) => {
    ensure(s);
    const city = s.cities[fromId];
    if (!city) return 'No such city';
    const err = validOrders(s, city.owner, fromId, type, orders);
    if (err) return err;
    const po = G._orders;
    G._orders = orders ? { owner: city.owner, ...orders, explicit: true } : null;
    try { return G.sendArmy(s, fromId, x, y, type, units, cargo); } finally { G._orders = po; }
  };
  {
    const baseSend = G.sendArmy;
    G.sendArmy = (s, fromId, x, y, type, units, cargo) => {
      const city = s.cities[fromId];
      if (!city) return baseSend(s, fromId, x, y, type, units, cargo);
      let orders = G._orders && G._orders.owner === city.owner ? G._orders : null;
      if (orders && !orders.explicit) { const e = validOrders(s, city.owner, fromId, type, orders); if (e) return e; }
      // the AI gives its own orders
      if (!orders && city.owner !== 'p' && HOSTILE.includes(type) && G.aiOrders) { try { orders = G.aiOrders(s, city, x, y, type, units); } catch (e) { orders = null; } }
      const before = s.moves.length;
      const po = G._orders; G._orders = null;   // nested sends (other modules) never inherit these orders
      let err;
      try { err = baseSend(s, fromId, x, y, type, units, cargo); } finally { G._orders = po; }
      if (err || !orders || s.moves.length <= before) return err;
      const m = s.moves[s.moves.length - 1];
      if (!m || m.owner !== city.owner || m.from !== fromId || m.depart !== s.time) return err;
      if (orders.stance && orders.stance !== 'balanced' && HOSTILE.includes(m.type)) m.stance = orders.stance;
      const g = orders.general && !G.generalAvailable(s, city.owner, orders.general, fromId) ? G.generalById(s, city.owner, orders.general) : null;
      if (g && (HOSTILE.includes(m.type) || m.type === 'reinforce')) { m.general = g.id; g.status = 'marching'; g.move = m.id; g.city = null; }
      const fct = G.marchFactor(s, city.owner, { stance: m.stance, general: m.general });
      if (fct !== 1) m.arrive = m.depart + Math.max(15, Math.round((m.arrive - m.depart) / fct));
      return err;
    };
  }

  // ---- resolving marches ----
  {
    const baseResolve = G.resolveMove;
    G.resolveMove = (s, m) => {
      const hostile = HOSTILE.includes(m.type);
      if (!hostile && !m.general) return baseResolve(s, m);
      ensure(s);
      const tile = G.tileAt(s, m.x, m.y), tc = tile && tile.city && s.cities[tile.city], prevOwner = tc && tc.owner;
      const prev = G._gctx;
      G._gctx = hostile ? { owner: m.owner, units: m.units, move: m, general: m.general || null, stance: m.stance || 'balanced', info: null,
        siegemaster: G.generalHas(G.generalById(s, m.owner, m.general), 'siegemaster') } : null;
      try { baseResolve(s, m); } finally { G._gctx = prev; }
      if (tc && prevOwner && tc.owner !== prevOwner) cityFell(s, tc, prevOwner, tc.owner);
      if (m.general) settleGeneral(s, m, tc);
    };
  }
  // after a march with a general: he rides on with the survivors, stays in a city he reached, or goes home
  const settleGeneral = (s, m, tc) => {
    const g = G.generalById(s, m.owner, m.general);
    if (!g || g.status !== 'marching' || g.move !== m.id) return;
    const next = s.moves.find(x => x.general === g.id && x.owner === m.owner && x !== m);
    if (next) { g.move = next.id; return; }
    const home = s.cities[m.from];
    const dest = tc && tc.owner === m.owner ? tc : home && home.owner === m.owner ? home : G.capital(s, m.owner);
    if (dest) { g.status = 'home'; g.city = dest.id; g.move = null; }
    else killGeneral(s, m.owner, g, 'far from home', null);
  };
  {
    const baseHome = G.sendHome;
    G.sendHome = (s, m, units, loot) => {
      const before = s.moves.length;
      const r = baseHome(s, m, units, loot);
      if (m.general && s.moves.length > before) {
        const g = G.generalById(s, m.owner, m.general), nm = s.moves[s.moves.length - 1];
        if (g && g.status === 'marching' && g.move === m.id && nm.owner === m.owner) { nm.general = g.id; g.move = nm.id; }
      }
      return r;
    };
  }
  // siege stance and Siegemaster: rams break more wall (during the march's own assault only)
  {
    const baseWall = G.wallBreak;
    G.wallBreak = units => {
      const v = baseWall(units), c = G._gctx;
      if (!v || !c || !c.move || c.preview) return v;
      const st = DATA.stances[c.stance] || {};
      return v * (st.wall || 1) * (c.siegemaster ? 1.4 : 1);
    };
  }
  // plunder: Siege halves it, Raider (raids) and Forager carry more
  {
    const baseCarry = G.carryOf;
    G.carryOf = (s, owner, units) => {
      const v = baseCarry(s, owner, units), c = G._gctx;
      if (!c || !c.move || c.owner !== owner) return v;
      const st = DATA.stances[c.stance] || {};
      const g = G.generalById(s, owner, c.general);
      return v * (st.loot || 1) * (G.generalHas(g, 'raider') && c.move.type === 'raid' ? 1.25 : 1) * (G.generalHas(g, 'forager') ? 1.15 : 1);
    };
  }
  // ---- fates: experience, wounds, capture, death ----
  G.generalFateOdds = (g, loss, wiped) => {
    let death, capture, wound;
    if (wiped) { capture = 0.5; death = 0.15; wound = 1; }
    else { capture = 0; death = 0.025 * loss; wound = Math.min(0.85, 0.08 + 0.8 * loss); }
    if (G.generalHas(g, 'reckless')) death *= 2;
    if (G.generalHas(g, 'cautious')) { death *= 0.5; capture *= 0.6; }
    if (G.generalHas(g, 'lucky')) { death *= 0.5; capture *= 0.5; wound *= 0.5; }
    return { death, capture, wound };
  };
  const xpOf = units => Object.entries(units || {}).reduce((a, [u, n]) => { const d = DATA.units[u]; return u === 'hero' || !d ? a : a + (d.atk + d.defI + d.defC) / 6 * n; }, 0);
  G.generalGainXp = (s, owner, g, amount) => {
    if (!g || !(amount > 0) || g.level >= GEN.maxLevel) return 0;
    amount = Math.round(amount * (owner === 'p' ? 1 : 0.8));
    g.xp += amount;
    while (g.level < GEN.maxLevel && g.xp >= G.generalXpNeed(g.level)) {
      g.xp -= G.generalXpNeed(g.level); g.level++;
      g.hp = Math.min(100, g.hp + 20);
      let learned = '';
      if (g.traits.length < 2 && GEN.secondTrait.includes(g.level) && Math.random() < 0.6) {
        const t = G.pick(Object.keys(DATA.generalTraits).filter(k => !g.traits.includes(k)));
        g.traits.push(t); learned = ` and learned to be ${DATA.generalTraits[t].name}`;
      }
      G.log(s, owner, `🎖️ General ${g.name} reached level ${g.level}${learned}.`, 'good');
    }
    if (g.level >= GEN.maxLevel) g.xp = 0;
    return amount;
  };
  const killGeneral = (s, owner, g, where, by) => {
    const emp = s.empires[owner];
    emp.generals = G.generalsOf(s, owner).filter(x => x !== g);
    g.dead = true; g.diedAt = s.time; g.where = where; g.status = 'dead';
    emp.fallenGenerals.unshift({ name: g.name, level: g.level, traits: g.traits, seed: g.seed, race: g.race, diedAt: s.time, where, by: by || null });
    if (emp.fallenGenerals.length > 8) emp.fallenGenerals.length = 8;
    if (by && s.empires[by]) s.empires[by].renownBonus = (s.empires[by].renownBonus || 0) + (g.level >= 5 ? 8 : 4);
    G.log(s, owner, `⚰️ General ${g.name} fell ${where}.`, 'bad');
    if (by === 'p' && owner !== 'p') G.log(s, 'p', `⚔️ The ${emp.name}'s general ${g.name} fell against us.`, 'good');
  };
  const capture = (s, owner, g, by) => {
    g.status = 'captured'; g.captor = by || null; g.city = null; g.move = null;
    g.releaseAt = s.time + GEN.captivity * G.pace(s).time;
    if (by && s.empires[by]) s.empires[by].renownBonus = (s.empires[by].renownBonus || 0) + 3;
    G.log(s, owner, `⛓️ General ${g.name} was taken captive${by && s.empires[by] ? ' by the ' + s.empires[by].name : ''}.`, 'bad');
    if (by === 'p') G.log(s, 'p', `⛓️ We captured ${g.name}, a general of the ${s.empires[owner].name}.`, 'good');
  };
  const escapeTo = (s, owner, g, prefer) => {
    const c = prefer && s.cities[prefer] && s.cities[prefer].owner === owner ? s.cities[prefer] : G.capital(s, owner);
    if (!c) return killGeneral(s, owner, g, 'with nowhere to flee', null);
    g.status = 'home'; g.city = c.id; g.move = null;
  };
  // roll a general's fate after a battle: returns a short text for the report
  const rollFate = (s, owner, g, loss, wiped, foe, home) => {
    const o = G.generalFateOdds(g, loss, wiped);
    const rnd = GEN.rng || Math.random;      // tests may fix the dice
    const x = rnd();
    if (x < o.death) { killGeneral(s, owner, g, 'in battle', foe); return 'killed'; }
    if (x < o.death + o.capture) { capture(s, owner, g, foe); return 'captured'; }
    if (wiped || rnd() < o.wound) {
      const w = Math.round((wiped ? 45 : 12) + 45 * loss * rnd());
      g.hp = Math.max(5, g.hp - w);
      if (wiped) { escapeTo(s, owner, g, home); return 'escaped wounded'; }
      return 'wounded';
    }
    return 'unhurt';
  };
  G.battleHooks.push((s, ctx) => {
    const c = G._gctx;
    if (!c || c.move !== ctx.m || c.preview) return;
    const { m, r } = ctx;
    const info = c.info || {};
    const foeOwner = ctx.defOwner || null;
    if (m.general) {
      const g = G.generalById(s, m.owner, m.general);
      if (g && g.status === 'marching') {
        g.battles = (g.battles || 0) + 1;
        if (r.win) g.wins = (g.wins || 0) + 1;
        const wiped = !G.unitsCount(r.attLeft);
        const fate = rollFate(s, m.owner, g, r.attLoss, wiped, foeOwner, m.from);
        if (fate !== 'killed' && fate !== 'captured') G.generalGainXp(s, m.owner, g, xpOf(r.defLost) * 0.6 + (r.win ? 15 : 5));
        if (info.att) { info.att.fate = fate; info.att.level = g.level; }
      }
    }
    if (c.defGeneral && ctx.city && ctx.defOwner) {
      const g = G.generalById(s, ctx.defOwner, c.defGeneral);
      if (g && g.status === 'home') {
        g.battles = (g.battles || 0) + 1;
        if (!r.win) g.wins = (g.wins || 0) + 1;
        const had = G.unitsCount(ctx.defHad || {});
        const wiped = had > 0 && !G.unitsCount(r.defLeft);
        const fate = rollFate(s, ctx.defOwner, g, r.defLoss, wiped, m.owner, null);
        if (fate !== 'killed' && fate !== 'captured') G.generalGainXp(s, ctx.defOwner, g, xpOf(r.attLost) * 0.6 + (!r.win ? 15 : 5));
        if (info.def) { info.def.fate = fate; info.def.level = g.level; }
      }
    }
  });
  // a city changed hands: its commanders are taken (or slip away to the capital)
  const cityFell = (s, city, oldOwner, newOwner) => {
    delete city.garStance; delete city.garAI;     // the new masters give their own orders
    const rep = s.reports[0], gi = rep && rep.body && rep.body.generals;
    for (const g of [...G.generalsOf(s, oldOwner)]) {
      if (g.status !== 'home' && g.status !== 'riding') continue;
      if (g.city !== city.id) continue;
      const taken = g.status === 'home' && (GEN.rng || Math.random)() < (G.generalHas(g, 'lucky') ? 0.35 : 0.7);
      if (taken) capture(s, oldOwner, g, newOwner); else escapeTo(s, oldOwner, g, null);
      if (gi && gi.def && gi.def.id === g.id) gi.def.fate = taken ? 'captured' : 'escaped';
    }
  };
  // battle reports carry the generals and stances (the report is written before or after the hooks; the info object is shared)
  {
    const baseReport = G.report;
    G.report = (s, owners, title, kind, body) => {
      const c = G._gctx;
      if (c && c.info && body && body.attSent && body.attSent === c.units && !body.generals) {
        const i = c.info;
        if (i.att || i.def || (i.stances && (i.stances.att.key !== 'balanced' || (i.stances.def && i.stances.def.key !== 'standing')))) body.generals = i;
      }
      return baseReport(s, owners, title, kind, body);
    };
  }

  // ---- realm effects: weariness, training, rations, hidden stores ----
  if (G.traditionFx) {
    const baseFx = G.traditionFx;
    G.traditionFx = (emp, prop, combine = 'mul') => {
      const v = baseFx(emp, prop, combine);
      if (prop === 'weary' && combine === 'mul' && emp && Array.isArray(emp.generals) && emp.generals.some(g => g.status !== 'captured' && G.generalHas(g, 'beloved'))) return v * 0.85;
      return v;
    };
  }
  G.modSources.push((s, owner, city, key) => {
    if (!city) return 1;
    if (key === 'trainTime') {
      const e = s.empires[owner];
      return e && Array.isArray(e.generals) && e.generals.some(g => g.status === 'home' && g.city === city.id && G.generalHas(g, 'drillmaster')) ? 0.9 : 1;
    }
    if (key === 'protect') { const st = DATA.garrisonStances[city.garStance]; return st && st.protect ? 1 + st.protect : 1; }
    if (key === 'upkeep') {
      // a Forager's army eats off the land: its rations come off the home city's bill
      let free = 0;
      for (const m of s.moves) if (m.from === city.id && m.owner === owner && m.general && G.moveHasTrait(s, m, 'forager'))
        for (const [u, n] of Object.entries(m.units)) free += ((DATA.units[u] || {}).upkeep || 0) * n;
      if (!free) return 1;
      let tot = 0;
      const add = units => { for (const [u, n] of Object.entries(units || {})) tot += ((DATA.units[u] || {}).upkeep || 0) * n; };
      add(city.units);
      for (const m of s.moves) if (m.from === city.id && m.owner === owner) add(m.units);
      return tot > 0 ? Math.max(0, 1 - free / tot) : 1;
    }
    if (city.garStance === 'evacuate' && DATA.goods[key] && DATA.goods[key].raw) return DATA.garrisonStances.evacuate.prod;
    return 1;
  });

  // ---- upkeep of the generals: wages, healing, travel, captivity ----
  G.slowHooks.push((s, dtMin) => {
    ensure(s);
    for (const emp of Object.values(s.empires)) {
      if (!emp.generals.length) continue;
      if (emp.dead) { emp.generals = []; continue; }
      const owner = emp.id;
      const paid = emp.generals.filter(g => g.status !== 'captured').length;
      if (paid) emp.gold = Math.max(0, emp.gold - GEN.wage * paid * dtMin);
      for (const g of [...emp.generals]) {
        if (g.status === 'riding' && s.time >= (g.until || 0)) { g.status = 'home'; g.until = null; }
        if ((g.status === 'home' || g.status === 'riding') && (!s.cities[g.city] || s.cities[g.city].owner !== owner)) escapeTo(s, owner, g, null);
        if (g.status === 'home' && g.hp < 100) g.hp = Math.min(100, g.hp + GEN.regen * dtMin / 60 / G.pace(s).time);
        if (g.status === 'marching' && !s.moves.some(m => m.id === g.move && m.owner === owner)) {
          const m = s.moves.find(x => x.general === g.id && x.owner === owner);
          if (m) g.move = m.id; else escapeTo(s, owner, g, null);
        }
        if (g.status === 'captured' && (s.time >= (g.releaseAt || 0) || (g.captor && (!s.empires[g.captor] || s.empires[g.captor].dead)))) release(s, owner, g, 'exchanged');
      }
    }
  });

  // ---- AI ----
  // orders for an AI march: a general for big armies, Siege for conquest, Skirmish for raids, Aggressive when far stronger
  G.aiOrders = (s, city, x, y, type, units) => {
    const owner = city.owner, tile = G.tileAt(s, x, y);
    if (!tile) return null;
    const out = { stance: 'balanced', general: null };
    const avail = G.generalsAt(s, owner, city.id).filter(g => g.hp >= GEN.minHp).sort((a, b) => b.level - a.level);
    if (avail.length && G.atkPower(s, owner, units) >= 300) out.general = avail[0].id;
    let ratio = 1.5;
    try {
      let def = null, dOwner = null, mult = 1, flat = 0;
      const tc = tile.city && s.cities[tile.city];
      if (tc) { def = tc.units; dOwner = tc.owner; const cd = G.cityDefense(s, tc, G.wallBreak(units)); mult = cd.mult; flat = cd.flat; }
      else { const site = tile.camp ? s.camps[tile.camp] : tile.oasis || tile.ruin; if (site) { def = site.units || {}; flat = 5 * (site.tier || 1); } }
      if (def) { const r = G.battle(s, owner, units, 1, dOwner, def, mult, flat, { mode: type === 'raid' ? 'raid' : 'attack', x, y }); ratio = r.A / Math.max(1, r.D); }
    } catch (e) { ratio = 1.5; }
    if (type === 'conquer') out.stance = 'siege';
    else if (ratio > 2.5) out.stance = 'aggressive';
    else if (type === 'raid' && tile.city) out.stance = 'skirmish';
    return out;
  };
  const aiGenerals = (s, emp, dtMin) => {
    emp.genClock = (emp.genClock || 0) + dtMin;
    if (emp.genClock < 4 * G.pace(s).time) return;
    emp.genClock = 0;
    const owner = emp.id;
    ensure(s);
    // appoint: when rich enough, in the city with the biggest barracks
    const cities = G.citiesOf(s, owner);
    if (emp.generals.length < G.generalCap(s, owner) && Math.random() < 0.35 + 0.4 * (emp.aggr || 0.5)) {
      const c = cities.filter(x => G.lvl(x, 'barracks') >= GEN.barracks).sort((a, b) => G.atkPower(s, owner, b.units) - G.atkPower(s, owner, a.units))[0];
      const cost = G.generalCost(s, owner).gold;
      // the first general is worth saving for; later ones only from a comfortable treasury
      if (c && emp.gold > (emp.generals.length ? cost * 1.3 + 150 : cost + 30)) {
        const pool = G.generalPool(s, owner);
        const best = pool.list.map((g, i) => [i, g.level * 2 + g.traits.length]).sort((a, b) => b[1] - a[1])[0];
        if (best) G.recruitGeneral(s, owner, c.id, best[0]);
      }
    }
    // ransom captives when the treasury allows
    for (const g of emp.generals) if (g.status === 'captured' && emp.gold > G.ransomCost(g).gold * 3) G.ransomGeneral(s, owner, g.id);
    // idle generals ride to the strongest army that has none
    const strength = c => G.atkPower(s, owner, c.units);
    for (const g of emp.generals) {
      if (g.status !== 'home') continue;
      const here = s.cities[g.city];
      if (here && G.generalsAt(s, owner, here.id).length === 1 && strength(here) >= 400) continue;
      const want = cities.filter(c => c.id !== g.city && !G.generalsAt(s, owner, c.id).length && !emp.generals.some(o => o.status === 'riding' && o.city === c.id) && strength(c) >= 400)
        .sort((a, b) => strength(b) - strength(a))[0];
      if (want && (!here || strength(want) > strength(here) * 1.3 || G.generalsAt(s, owner, here.id).length > 1)) G.stationGeneral(s, owner, g.id, want.id);
    }
    // garrison stances when threatened: sally when far stronger, hold when close, evacuate when hopeless
    const threatened = new Set();
    for (const m of s.moves) {
      if (m.owner === owner || !HOSTILE.includes(m.type)) continue;
      const t = G.tileAt(s, m.x, m.y), c = t && t.city && s.cities[t.city];
      if (!c || c.owner !== owner || threatened.has(c.id)) continue;
      threatened.add(c.id);
      let ratio = 1;
      try {
        const cd = G.cityDefense(s, c, G.wallBreak(m.units));
        const r = G.battle(s, m.owner, m.units, 1, owner, { ...c.units }, cd.mult, cd.flat, { mode: m.type === 'raid' ? 'raid' : 'attack', x: c.x, y: c.y });
        ratio = r.D / Math.max(1, r.A);
      } catch (e) { ratio = 1; }
      c.garStance = ratio > 1.8 ? 'sally' : ratio > 0.7 ? 'hold' : 'evacuate';
      c.garAI = true;
    }
    for (const c of cities) if (c.garAI && !threatened.has(c.id)) { delete c.garStance; delete c.garAI; }
  };
  G.aiHooks.push((s, emp, dtMin) => aiGenerals(s, emp, dtMin));

  // ---- new games and old saves ----
  G.newGameHooks.push(s => { ensure(s); });
  {
    const baseMigrate = G.migrate;
    G.migrate = s => {
      const r = baseMigrate(s) || s;
      try { ensure(r); } catch (e) { if (typeof console !== 'undefined') console.error('generals migrate', e); }
      return r;
    };
  }
}
