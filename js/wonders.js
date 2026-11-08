// =====================================================================
//  Wonders — the endgame. Each people can raise one great wonder in one
//  city: 10 enormous stages, each granting a realm-wide boon. The first
//  realm to finish its wonder wins a Conquest game (an AI finishing first
//  is a defeat, though you may play on in Endless mode).
// =====================================================================
'use strict';

DATA.wonders = {
  hearth: { key: 'wonder_hearth', name: 'The Everharvest Halls', icon: '🌾', fx: { grain: 0.03, popGrowth: 0.02, tax: 0.02 },
    desc: 'Vast granaries and feast halls where no Hearthfolk child will ever go hungry. Each stage: +3% grain, +2% growth, +2% taxes across the realm.' },
  delver: { key: 'wonder_delver', name: 'The Anvil of Ages', icon: '⚒️', fx: { refine: 0.03, def: 0.015, ore: 0.02 },
    desc: 'A forge at the roots of the mountain, struck by every Deepdelver king since the first. Each stage: +3% workshop output, +2% ore, +1.5% defence.' },
  sylvan: { key: 'wonder_sylvan', name: 'The World-Root Tree', icon: '🌳', fx: { timber: 0.03, researchTime: -0.02, popGrowth: 0.02 },
    desc: 'A sapling of the first tree, sung into a living tower that touches the clouds. Each stage: +3% timber, +2% growth, research 2% faster.' },
  ash: { key: 'wonder_ash', name: 'The Ember Throne', icon: '🔥', fx: { atk: 0.02, trainTime: -0.02, carry: 0.03 },
    desc: 'A throne of fused bone and obsidian over an undying fire, where every warlord swears to the Horde. Each stage: +2% attack, training 2% faster, +3% plunder.' },
};
G.WONDER_STAGES = 10;

for (const [race, w] of Object.entries(DATA.wonders)) {
  DATA.buildings[w.key] = {
    name: w.name, icon: w.icon, max: G.WONDER_STAGES, time: 600, growth: 1.3, race, wonder: true, realmUnique: true, minCities: 3,
    cost: { timber: 4000, stone: 4000, grain: 3000, iron: 1200, tools: 250, gold: 2500 },
    desc: w.desc + ' Only one city may raise it; finish all 10 stages first to win.',
    req: { townhall: 12, academy: 5, warehouse: 14 },
  };
  DATA.buildingOrder.push(w.key);
}
DATA.buildingGroups.push({ name: 'Wonder', list: Object.values(DATA.wonders).map(w => w.key) });

G.wonderOf = (s, owner) => {
  const w = DATA.wonders[s.empires[owner].race];
  let level = 0, city = null, building = false;
  for (const c of G.citiesOf(s, owner)) {
    if (G.lvl(c, w.key) > level) { level = G.lvl(c, w.key); city = c; }
    if (c.buildQueue.some(q => q.type === w.key)) { building = true; city = city || c; }
  }
  return { ...w, level, city, building };
};

// realm-wide boons per stage
G.modSources.push((s, owner, city, key) => {
  const emp = s.empires[owner];
  const w = DATA.wonders[emp.race];
  const f = w.fx[key];
  if (!f) return 1;
  const lv = emp._wonderLevel ?? 0;
  return lv ? 1 + f * lv : 1;
});

// keep a cached stage count, announce milestones, decide victory
G.slowHooks.push(s => {
  for (const emp of Object.values(s.empires)) {
    if (emp.dead) continue;
    const wo = G.wonderOf(s, emp.id);
    const prev = emp._wonderLevel || 0;
    emp._wonderLevel = wo.level;
    if (wo.level > prev) {
      const mine = emp.id === 'p';
      if (mine) G.log(s, 'p', `${wo.icon} ${wo.name} stage ${wo.level}/${G.WONDER_STAGES} complete!`, 'good');
      else if ([3, 5, 7, 8, 9].includes(wo.level)) G.log(s, 'p', `⚠️ The ${emp.name} has raised ${wo.name} to stage ${wo.level} of ${G.WONDER_STAGES}${wo.city ? ` in ${wo.city.name} (${wo.city.x}, ${wo.city.y})` : ''}. Stop them — catapults can wreck a wonder.`, 'warn');
    }
    if (wo.level >= G.WONDER_STAGES && !emp.wonderDone) {
      emp.wonderDone = true;
      emp.renownBonus = (emp.renownBonus || 0) + 200;
      if (s.settings.mode === 'conquest' && !s.victory && !s.gameOver) {
        if (emp.id === 'p') { s.victory = 'wonder'; G.log(s, 'p', `👑 ${wo.name} stands complete. Your people's legend will outlast the ages — victory!`, 'good'); }
        else { s.gameOver = 'wonder'; s.gameOverBy = emp.id; G.log(s, 'p', `The ${emp.name} has completed ${wo.name}. Their legend eclipses yours.`, 'bad'); }
      } else G.log(s, 'p', `${wo.icon} The ${emp.name} completed ${wo.name}!`, emp.id === 'p' ? 'good' : 'warn');
    }
  }
});

// rivals grow wary of anyone close to finishing a wonder
const baseHostility = G.hostility;
G.hostility = (s, aiId, target) => {
  const h = baseHostility(s, aiId, target);
  const lv = (s.empires[target] && s.empires[target]._wonderLevel) || 0;
  return h > 0 && lv >= 3 ? h * (1 + 0.08 * lv) : h;
};

// AI: the generic picker never builds wonders; this hook raises one deliberately late in the game
G.aiBuildFilters.push((s, city, type) => !DATA.buildings[type].wonder);
G.aiHooks.push((s, emp) => {
  if (G.aiPressure(s) < 0.8 || Math.random() > 0.3) return;
  const wo = G.wonderOf(s, emp.id);
  if (wo.building || wo.level >= G.WONDER_STAGES) return;
  const city = wo.city || G.citiesOf(s, emp.id).sort((a, b) => G.lvl(b, 'townhall') - G.lvl(a, 'townhall'))[0];
  if (!city) return;
  const st = G.buildStatus(s, city, wo.key);
  if (st.locked && city.buildQueue.length < G.buildSlots(city)) {
    // work toward the prerequisites (Academy, Warehouse, Town Hall)
    for (const [rb, rl] of Object.entries(DATA.buildings[wo.key].req)) if (G.lvl(city, rb) < rl && !city.buildQueue.some(q => q.type === rb)) { G.queueBuild(s, city.id, rb); break; }
    return;
  }
  if (st.ok) G.queueBuild(s, city.id, wo.key);
  else if (st.poor && emp.gold > 1500) {
    // buy the bulk goods it is missing
    for (const [g, v] of Object.entries(st.cost)) if (g !== 'gold' && DATA.goods[g].raw && (city.res[g] || 0) < v) G.trade(s, city.id, g, Math.min(v - city.res[g], emp.gold / 6 / G.marketRates(s, city, g).buy), 'buy');
  }
});

// catapults aim for a wonder first when one stands in the city
G.battleHooks.push((s, ctx) => {
  const { r, city, m } = ctx;
  if (!city || !r.win || ctx.site !== 'city') return;
  const w = DATA.wonders[s.empires[city.owner].race];
  const lv = G.lvl(city, w.key);
  if (!lv) return;
  const hits = Math.min(lv, 2, Math.floor(G.wreckPower(r.attLeft) / 20));   // at most 2 stages per assault
  if (hits > 0) {
    city.buildings[w.key] -= hits;
    if (!city.buildings[w.key]) delete city.buildings[w.key];
    G.log(s, city.owner, `${w.icon} Catapults of the ${s.empires[m.owner].name} wrecked ${hits} stage${hits > 1 ? 's' : ''} of ${w.name}!`, 'bad');
    if (m.owner === 'p') G.log(s, 'p', `Our engines wrecked ${hits} stage${hits > 1 ? 's' : ''} of ${w.name}!`, 'good');
  }
});
