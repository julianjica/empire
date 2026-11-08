// =====================================================================
//  Forge upgrades — per unit type, attack ("a") and armour ("d") levels
//  0..10, studied at an Armory. Each level gives +4% to that stat for the
//  whole realm. One upgrade at a time per Armory city.
//  emp.upgrades = { unit: { a, d } } · city.forge = { unit, kind, level, start, end, cost }
// =====================================================================
'use strict';

G.UPGRADE_MAX = 10;
G.upgradeLevel = (s, owner, unit, kind) => ((s.empires[owner].upgrades || {})[unit] || {})[kind] || 0;

G.upgradeCost = (unit, kind, level) => {
  const d = DATA.units[unit];
  const weight = Math.max(1, (d.atk + d.defI + d.defC) / 90);   // stronger units cost more to improve
  const m = Math.pow(level, 1.25) * weight;
  return { weapons: Math.round(6 * m), tools: Math.round(3 * m), gold: Math.round(55 * m), [kind === 'a' ? 'iron' : 'stone']: Math.round(30 * m) };
};
G.upgradeTime = (s, city, level) => Math.round(150 * Math.pow(1.3, level - 1) * G.pace(s).time / (1 + 0.05 * G.lvl(city, 'armory')));

G.forgeStatus = (s, cityId, unit, kind) => {
  const city = s.cities[cityId];
  const level = G.upgradeLevel(s, city.owner, unit, kind) + 1;
  const busy = Object.values(s.cities).some(c => c.owner === city.owner && c.forge && c.forge.unit === unit && c.forge.kind === kind);
  const res = { level, cost: G.upgradeCost(unit, kind, level), time: G.upgradeTime(s, city, level), ok: true };
  if (level > G.UPGRADE_MAX) return { ...res, ok: false, maxed: true, reason: 'Fully upgraded' };
  if (G.lvl(city, 'armory') < level) return { ...res, ok: false, reason: `Needs Armory ${level} here` };
  if (city.forge) return { ...res, ok: false, reason: 'This armory is busy' };
  if (busy) return { ...res, ok: false, reason: 'Already being forged elsewhere' };
  if (!G.canAfford(s, city, res.cost)) return { ...res, ok: false, poor: true, reason: 'Not enough goods' };
  return res;
};

G.startUpgrade = (s, cityId, unit, kind) => {
  const city = s.cities[cityId];
  const st = G.forgeStatus(s, cityId, unit, kind);
  if (!st.ok) return st.reason;
  G.pay(s, city, st.cost);
  city.forge = { unit, kind, level: st.level, start: s.time, end: s.time + st.time, cost: st.cost };
  return null;
};

G.cancelUpgrade = (s, cityId) => {
  const city = s.cities[cityId];
  if (!city.forge) return;
  G.gain(s, city, city.forge.cost, 0.5);
  city.forge = null;
};

G.stepHooks.push(s => {
  for (const city of Object.values(s.cities)) {
    const f = city.forge;
    if (!f || f.end > s.time) continue;
    const emp = s.empires[city.owner];
    emp.upgrades = emp.upgrades || {};
    const u = emp.upgrades[f.unit] = emp.upgrades[f.unit] || { a: 0, d: 0 };
    u[f.kind] = Math.max(u[f.kind] || 0, f.level);
    city.forge = null;
    G.log(s, city.owner, `⚒️ ${DATA.units[f.unit].name} ${f.kind === 'a' ? 'weapons' : 'armour'} improved to level ${f.level}.`, 'good');
  }
});

// AI: keep the armouries busy improving the troops it fields most
G.aiHooks.push((s, emp) => {
  if (Math.random() > 0.3) return;
  const cities = G.citiesOf(s, emp.id).filter(c => G.lvl(c, 'armory') > 0 && !c.forge);
  if (!cities.length || emp.gold < 400) return;
  const counts = {};
  for (const c of G.citiesOf(s, emp.id)) for (const [u, n] of Object.entries(c.units)) if (DATA.units[u].at && DATA.units[u].type !== 'civ') counts[u] = (counts[u] || 0) + n;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([u]) => u);
  for (const c of cities) {
    for (const u of top) {
      const kind = Math.random() < emp.aggr ? 'a' : 'd';
      if (!G.startUpgrade(s, c.id, u, kind)) return;
    }
  }
});
