// =====================================================================
//  Quests, world events, timed modifiers and Endless-mode rebirths
// =====================================================================
'use strict';

// ---------------------------------------------------------------------
// Timed modifiers: city.mods / empire.mods = [{ key, mult, until, label }]
// ---------------------------------------------------------------------
G.modSources.push((s, owner, city, key) => {
  let m = 1;
  if (city && city.mods) for (const md of city.mods) if (md.key === key && md.until > s.time) m *= md.mult;
  const e = s.empires[owner];
  if (e.mods) for (const md of e.mods) if (md.key === key && md.until > s.time) m *= md.mult;
  return m;
});
const addMod = (s, target, key, mult, minutes, label) => {
  target.mods = (target.mods || []).filter(md => md.until > s.time);
  target.mods.push({ key, mult, until: s.time + minutes * 60 * G.pace(s).time, label });
};

// ---------------------------------------------------------------------
// Quests (a guided chain; the next few are shown at once)
// ---------------------------------------------------------------------
const anyCity = (s, f) => G.citiesOf(s, 'p').some(f);
const maxLvl = (s, b) => Math.max(0, ...G.citiesOf(s, 'p').map(c => G.lvl(c, b)));
const troops = s => G.citiesOf(s, 'p').reduce((a, c) => a + G.unitsCount(c.units) - (c.units.hero || 0), 0);
const rel = s => Object.keys(s.rel || {}).map(k => s.rel[k]);

DATA.quests = [
  { id: 'farm2',    title: 'Fields of plenty',      desc: 'Raise a Farm to level 2.',                      check: s => maxLvl(s, 'farm') >= 2,     reward: { grain: 150, timber: 100 } },
  { id: 'lumber2',  title: 'The sound of axes',     desc: 'Raise a Lumber Camp to level 2.',               check: s => maxLvl(s, 'lumber') >= 2,   reward: { timber: 150, stone: 100 } },
  { id: 'houses2',  title: 'Room to grow',          desc: 'Raise Houses to level 2.',                      check: s => maxLvl(s, 'houses') >= 2,   reward: { grain: 150, gold: 60 } },
  { id: 'hero',     title: 'A champion rises',      desc: 'Spend your hero\'s attribute points (Hero tab).', check: s => !G.hero(s) || G.hero(s).free === 0, reward: { gold: 100 } },
  { id: 'adv',      title: 'Into the ruins',        desc: 'Send your hero on an adventure to a ruin.',     check: s => (s.stats.adventures || 0) >= 1, reward: { gold: 150, tools: 5 } },
  { id: 'th2',      title: 'A proper hall',         desc: 'Raise the Town Hall to level 2.',               check: s => maxLvl(s, 'townhall') >= 2, reward: { timber: 200, stone: 200 } },
  { id: 'barracks', title: 'Call to arms',          desc: 'Build a Barracks.',                             check: s => maxLvl(s, 'barracks') >= 1, reward: { grain: 250 } },
  { id: 'smelter',  title: 'Fire and ore',          desc: 'Build a Smelter.',                              check: s => maxLvl(s, 'smelter') >= 1,  reward: { ore: 200, timber: 100 } },
  { id: 'troops',   title: 'A standing guard',      desc: 'Have 10 troops in your cities.',                check: s => troops(s) >= 10,           reward: { weapons: 10, grain: 200 } },
  { id: 'win',      title: 'First blood',           desc: 'Win a battle (brigand camps are a good start).', check: s => (s.empires.p.wins || 0) >= 1, reward: { gold: 200 } },
  { id: 'scout',    title: 'Eyes in the wild',      desc: 'Bring back a scouting report.',                  check: s => Object.keys(s.intel).length >= 1, reward: { gold: 100, grain: 100 } },
  { id: 'th3',      title: 'A village is born',     desc: 'Raise the Town Hall to level 3.',               check: s => maxLvl(s, 'townhall') >= 3, reward: { timber: 300, stone: 300 } },
  { id: 'academy',  title: 'Halls of learning',     desc: 'Build an Academy.',                             check: s => maxLvl(s, 'academy') >= 1,  reward: { gold: 150, grain: 150 } },
  { id: 'tech',     title: 'New ideas',             desc: 'Complete a research.',                          check: s => Object.keys(G.research(s, 'p').done).length >= 1, reward: { tools: 10, gold: 150 } },
  { id: 'trade',    title: 'Open for business',     desc: 'Build a Market and trade some goods.',          check: s => (s.stats.traded || 0) > 0,  reward: { gold: 200 } },
  { id: 'oasis',    title: 'Water in the wilds',    desc: 'Claim an oasis (attack it and win).',           check: s => anyCity(s, c => (c.oases || []).length > 0), reward: { grain: 400, timber: 400 } },
  { id: 'deal',     title: 'Foreign merchants',     desc: 'Accept a trade offer from another realm (Diplomacy tab).', check: s => (s.stats.deals || 0) >= 1, reward: { gold: 200 } },
  { id: 'peace',    title: 'Words before swords',   desc: 'Be at peace or allied with another realm.',     check: s => rel(s).some(r => r.status === 'peace' || r.status === 'alliance'), reward: { gold: 300 } },
  { id: 'th5',      title: 'A town of note',        desc: 'Raise the Town Hall to level 5.',               check: s => maxLvl(s, 'townhall') >= 5, reward: { tools: 20, gold: 300 } },
  { id: 'city2',    title: 'New horizons',          desc: 'Found a second city with Settlers.',            check: s => G.citiesOf(s, 'p').length >= 2, reward: { grain: 600, timber: 600, stone: 600 } },
  { id: 'hero5',    title: 'Seasoned champion',     desc: 'Bring your hero to level 5.',                   check: s => G.hero(s) && G.hero(s).level >= 5, reward: { gold: 500 } },
  { id: 'tech5',    title: 'Age of reason',         desc: 'Complete 5 researches.',                        check: s => Object.keys(G.research(s, 'p').done).length >= 5, reward: { gold: 500, tools: 30 } },
  { id: 'ren300',   title: 'Famed across the land', desc: 'Reach 300 renown.',                             check: s => G.renown(s, 'p') >= 300,   reward: { gold: 600, tools: 40 } },
  { id: 'th10',     title: 'A true city',           desc: 'Raise a Town Hall to level 10.',                check: s => maxLvl(s, 'townhall') >= 10, reward: { gold: 1000 } },
  { id: 'city4',    title: 'An empire',             desc: 'Rule four cities.',                             check: s => G.citiesOf(s, 'p').length >= 4, reward: { gold: 1500 } },
  { id: 'conquer',  title: 'Crown upon crown',      desc: 'Conquer a rival city with a Herald.',           check: s => (s.empires.p.conquests || 0) >= 1, reward: { gold: 2000 } },
];
G.questState = s => { s.quests = s.quests || { claimed: {} }; return s.quests; };
G.activeQuests = s => {
  const open = DATA.quests.filter(q => !G.questState(s).claimed[q.id]);
  // the next five, plus any later quest that is already finished
  return open.filter((q, i) => i < 5 || q.check(s)).slice(0, 8);
};
G.claimQuest = (s, id) => {
  const q = DATA.quests.find(x => x.id === id);
  if (!q || G.questState(s).claimed[id]) return 'Already claimed';
  if (!q.check(s)) return 'Not finished yet';
  const cap = G.capital(s, 'p');
  G.gain(s, cap, q.reward);
  G.questState(s).claimed[id] = true;
  return null;
};

// ---------------------------------------------------------------------
// World events
// ---------------------------------------------------------------------
const scale = s => 1 + s.time / (3600 * G.pace(s).time);
const randCity = s => G.pick(G.citiesOf(s, 'p'));
const basic = s => DATA.races[s.empires.p.race].units[0];

DATA.events = [
  { id: 'harvest', w: 3, run: s => { const c = randCity(s); addMod(s, c, 'grain', 1.6, 10, 'Bountiful harvest'); G.log(s, 'p', `🌾 A bountiful harvest in ${c.name}: +60% grain for a while.`, 'good'); } },
  { id: 'drought', w: 2, run: s => {
      const c = randCity(s); const gold = Math.round(120 * scale(s));
      G.addPending(s, { kind: 'event', title: `Drought near ${c.name}`, text: `The wells run low. Dig new ones for ${gold} gold, or endure 10 minutes of −40% grain.`,
        options: [{ key: 'wells', label: `Dig wells (${gold} gold)` }, { key: 'endure', label: 'Endure it' }], expires: s.time + 240 * G.pace(s).time, def: 'endure', data: { ev: 'drought', city: c.id, gold } });
  } },
  { id: 'plague', w: 1, when: s => G.citiesOf(s, 'p').some(c => c.pop > 60), run: s => {
      const c = G.citiesOf(s, 'p').sort((a, b) => b.pop - a.pop)[0]; const gold = Math.round(50 + c.pop);
      G.addPending(s, { kind: 'event', title: `Sickness in ${c.name}`, text: `A fever spreads. Pay healers ${gold} gold, or lose 15% of the people and grow slowly for a while.`,
        options: [{ key: 'heal', label: `Pay healers (${gold} gold)` }, { key: 'endure', label: 'Pray it passes' }], expires: s.time + 240 * G.pace(s).time, def: 'endure', data: { ev: 'plague', city: c.id, gold } });
  } },
  { id: 'merchant', w: 3, run: s => {
      const race = s.empires.p.race;
      const opts = ['tools', 'weapons', 'iron', ...DATA.goodOrder.filter(g => DATA.goods[g].race === race)];
      const g = G.pick(opts); const n = Math.round(G.rnd(30, 80) * Math.sqrt(scale(s))); const gold = Math.round(n * DATA.goods[g].value * 0.6);
      G.addPending(s, { kind: 'event', title: 'A wandering merchant', text: `A trader offers ${n} ${DATA.goods[g].name.toLowerCase()} for just ${gold} gold, delivered to your capital.`,
        options: [{ key: 'buy', label: `Buy (${gold} gold)` }, { key: 'no', label: 'Send them away' }], expires: s.time + 300 * G.pace(s).time, def: 'no', data: { ev: 'merchant', good: g, n, gold } });
  } },
  { id: 'goldvein', w: 2, when: s => G.citiesOf(s, 'p').some(c => G.lvl(c, 'mine') >= 3), run: s => { const g = Math.round(G.rnd(150, 450) * scale(s)); s.empires.p.gold += g; G.log(s, 'p', `🪙 Miners struck a vein of gold: +${g} gold!`, 'good'); } },
  { id: 'refugees', w: 2, run: s => {
      const c = randCity(s); const n = G.rint(10, 25);
      G.addPending(s, { kind: 'event', title: `Refugees at ${c.name}`, text: `${n} people fleeing war beg for shelter. Taking them in costs 200 grain.`,
        options: [{ key: 'accept', label: 'Welcome them' }, { key: 'no', label: 'Turn them away' }], expires: s.time + 240 * G.pace(s).time, def: 'no', data: { ev: 'refugees', city: c.id, n } });
  } },
  { id: 'festival', w: 2, run: s => {
      const gold = Math.round(200 * scale(s));
      G.addPending(s, { kind: 'event', title: 'Midsummer festival', text: `Your people ask for a festival. For ${gold} gold, every city grows 50% faster and pays 20% more taxes for 15 minutes, and foreign envoys are impressed.`,
        options: [{ key: 'hold', label: `Hold it (${gold} gold)` }, { key: 'no', label: 'Not this year' }], expires: s.time + 300 * G.pace(s).time, def: 'no', data: { ev: 'festival', gold } });
  } },
  { id: 'fire', w: 1, run: s => { const c = randCity(s); const lost = Math.floor((c.res.timber || 0) * 0.2); c.res.timber -= lost; G.log(s, 'p', `🔥 Fire in the timber yards of ${c.name}! ${lost} timber burned.`, 'bad'); } },
  { id: 'inspiration', w: 2, run: s => { addMod(s, s.empires.p, 'researchTime', 0.7, 15, 'Age of inspiration'); addMod(s, s.empires.p, 'buildTime', 0.85, 15, 'Age of inspiration'); G.log(s, 'p', '💡 An age of inspiration: research and construction speed up for 15 minutes.', 'good'); } },
  { id: 'wanderer', w: 2, when: s => G.hero(s) && !G.hero(s).dead, run: s => { const h = G.hero(s); const xp = G.heroGainXp(s, 50 * h.level); G.log(s, 'p', `🧙 A wandering sage teaches ${h.name} (+${xp} experience).`, 'good'); } },
  { id: 'warlord', w: 1, when: s => s.time > 3600 * G.pace(s).time, run: s => {
      const c = randCity(s); const camp = G.spawnCamp(s, G.clamp(Math.round(4 + s.time / (4 * 3600 * G.pace(s).time)), 4, 8), c);
      if (camp) { camp.loot.gold = 0; for (const g in camp.loot) camp.loot[g] *= 2; G.log(s, 'p', `☠️ A brigand warlord has made camp near ${c.name} at (${camp.x}, ${camp.y}), with a rich hoard.`, 'warn'); G.reveal(s, camp.x, camp.y, 1); }
  } },
  { id: 'deserters', w: 1, run: s => { const c = randCity(s); const n = G.rint(4, 10); c.units[basic(s)] = (c.units[basic(s)] || 0) + n; G.log(s, 'p', `🛡️ ${n} deserters from a rival army offer their swords to ${c.name}.`, 'good'); } },
  { id: 'lostcart', w: 2, run: s => { const c = randCity(s); const g = G.pick(['grain', 'timber', 'stone', 'ore', 'iron']); const n = Math.round(G.rnd(100, 300) * scale(s)); G.gain(s, c, { [g]: n }); G.log(s, 'p', `🛒 A lost cart of ${n} ${DATA.goods[g].name.toLowerCase()} turned up near ${c.name}.`, 'good'); } },
];

G.pendingHandlers.event = (s, p, key) => {
  const d = p.data;
  const c = d.city && s.cities[d.city];
  const pay = gold => { if (s.empires.p.gold < gold) return false; s.empires.p.gold -= gold; return true; };
  switch (d.ev) {
    case 'drought':
      if (key === 'wells') { if (!pay(d.gold)) return 'Not enough gold'; G.log(s, 'p', 'New wells keep the fields green.', 'good'); }
      else if (c && c.owner === 'p') { addMod(s, c, 'grain', 0.6, 10, 'Drought'); G.log(s, 'p', `☀️ Drought withers the fields of ${c.name}.`, 'bad'); }
      break;
    case 'plague':
      if (key === 'heal') { if (!pay(d.gold)) return 'Not enough gold'; G.log(s, 'p', 'The healers stop the fever.', 'good'); }
      else if (c && c.owner === 'p') { c.pop *= 0.85; addMod(s, c, 'popGrowth', 0.5, 15, 'Plague'); G.log(s, 'p', `☠️ Fever took many in ${c.name}.`, 'bad'); }
      break;
    case 'merchant':
      if (key === 'buy') { if (!pay(d.gold)) return 'Not enough gold'; G.gain(s, G.capital(s, 'p'), { [d.good]: d.n }); G.log(s, 'p', `You bought ${d.n} ${DATA.goods[d.good].name.toLowerCase()}.`, 'good'); }
      break;
    case 'refugees':
      if (key === 'accept' && c && c.owner === 'p') {
        if ((c.res.grain || 0) < 200) return 'Not enough grain in ' + c.name;
        c.res.grain -= 200; c.pop += d.n; G.log(s, 'p', `${d.n} refugees settle in ${c.name}.`, 'good');
      }
      break;
    case 'festival':
      if (key === 'hold') {
        if (!pay(d.gold)) return 'Not enough gold';
        for (const cc of G.citiesOf(s, 'p')) { addMod(s, cc, 'popGrowth', 1.5, 15, 'Festival'); addMod(s, cc, 'tax', 1.2, 15, 'Festival'); }
        for (const e of Object.values(s.empires)) if (e.id !== 'p' && !e.dead) { const r = G.rel(s, e.id); r.opinion = Math.min(100, r.opinion + 5); }
        G.log(s, 'p', '🎉 The festival is a triumph!', 'good');
      }
      break;
  }
  return null;
};

G.slowHooks.push((s, dtMin) => {
  if (s.gameOver) return;
  s.eventAt = s.eventAt ?? s.time + 600 * G.pace(s).time;
  if (s.time >= s.eventAt) {
    const endless = s.settings.mode === 'endless';
    const pool = DATA.events.filter(e => !e.when || e.when(s));
    const total = pool.reduce((a, e) => a + e.w * (endless && e.id === 'warlord' ? 2 : 1), 0);
    let r = Math.random() * total;
    for (const e of pool) { r -= e.w * (endless && e.id === 'warlord' ? 2 : 1); if (r <= 0) { e.run(s); break; } }
    s.eventAt = s.time + G.rnd(15, 30) * 60 * G.pace(s).time;
  }
  // Endless: fallen realms rise again
  if (s.settings.mode === 'endless') {
    for (const e of Object.values(s.empires)) {
      if (e.id === 'p' || !e.dead) continue;
      if (s.time - e.diedAt < 3600 * G.pace(s).time) continue;
      const pcs = G.citiesOf(s, 'p');
      const t = G.freeTile(s, x => pcs.every(c => G.dist(c, x) >= 8) && Object.values(s.cities).every(c => G.dist(c, x) >= 4));
      if (!t) continue;
      const L = G.clamp(Math.round(1 + s.time / (1800 * G.pace(s).time)), 2, 12);
      e.dead = false; e.gold = 300 * L; e.wins = 0; e.conquests = 0;
      e.name = 'Reborn ' + DATA.aiRulers[e.race];
      const c = G.foundCity(s, e.id, t.x, t.y, DATA.aiNames[e.race][G.rint(0, 5)]);
      for (const b of ['townhall', 'houses', 'warehouse', 'farm', 'lumber', 'quarry', 'mine', 'barracks', 'wall', 'smelter', 'armory']) c.buildings[b] = Math.max(1, L - (b === 'townhall' ? 0 : 1));
      c.pop = G.popCap(s, c) * 0.8;
      for (const g of DATA.goodOrder) c.res[g] = Math.min(G.storageCap(s, c) * 0.5, 300 * L);
      c.units[DATA.races[e.race].units[1]] = 6 * L; c.units[DATA.races[e.race].units[0]] = 6 * L;
      if (s.rel) s.rel[e.id] = { opinion: 0, status: 'neutral', since: s.time, cool: 0, enemies: {} };
      G.log(s, 'p', `👑 A new dynasty, the ${e.name}, rises at (${t.x}, ${t.y})!`, 'warn');
    }
  }
});
