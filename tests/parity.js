// AI-vs-AI fairness across the eight peoples.
// usage: node tests/parity.js [hours=6] [worlds=8] [pace=standard] [seed=1000]
// Each world has 7 AI rivals; the player's people rotates from world to world so every people
// appears as an AI. The player does nothing and no AI ever targets them (they do not skew results).
// Worlds are seeded, so runs are reproducible.
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const hours = +(process.argv[2] || 6), worlds = +(process.argv[3] || 8), pace = process.argv[4] || 'standard', seed = +(process.argv[5] || 1000);
const files = ['js/data.js', 'js/races2.js', 'js/engine.js', 'js/research.js', 'js/forge.js', 'js/hero.js', 'js/diplomacy.js', 'js/events.js', 'js/calamities.js', 'js/culture.js','js/traditions.js', 'js/wonders.js', 'js/seasons.js', 'js/religion.js', 'js/traderoutes.js', 'js/rivalheroes.js', 'js/magic.js', 'js/espionage.js', 'js/minors.js', 'js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js'].filter(f => fs.existsSync(f));
eval(files.map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
if (typeof initRaces2 === 'function') initRaces2();
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// the player is a bystander: no rival ever turns on them
const baseHost = G.hostility;
G.hostility = (s, aiId, target) => target === 'p' ? 0 : baseHost(s, aiId, target);
const t0 = Date.now();
const rows = {};   // race -> list of samples
const naval = { harbors: 0, ships: 0, islandCities: 0, seaMarches: 0, flyMarches: 0 };
const baseSend = G.sendArmy;
G.sendArmy = (s, ...a) => { const n = s.moves.length; const r = baseSend(s, ...a); if (!r && s.moves.length > n) { const m = s.moves[s.moves.length - 1]; if (m.owner !== 'p') { if (m.naval) naval.seaMarches++; else if (m.path && m.path.length === 2 && G.unitsCount(m.units) && Object.keys(m.units).every(u => DATA.units[u].flying)) naval.flyMarches++; } } return r; };
for (let w = 0; w < worlds; w++) {
  Math.random = mulberry(seed + w * 7919);
  const race = DATA.raceOrder[w % DATA.raceOrder.length];
  const s = G.newGame({ name: 'Bystander', race, rivals: DATA.raceOrder.length - 1, pace, difficulty: 'normal' });
  s.settings.hostility = 0.85;
  G.advance(s, hours * 3600, hours * 600);
  for (const e of Object.values(s.empires)) {
    if (e.id === 'p') continue;
    const cs = G.citiesOf(s, e.id);
    let army = 0;
    for (const c of cs) army += G.popOf(c.units);
    for (const m of s.moves) if (m.owner === e.id) army += G.popOf(m.units);
    const wonder = G.wonderOf ? G.wonderOf(s, e.id).level : 0;
    const mana = cs.reduce((a, c) => a + (c.res.mana || 0), 0);
    for (const c of cs) { if (G.lvl(c, 'harbor')) naval.harbors++; if (G.isIsland(s, c) && !G.landReachable(s, c, G.capital(s, e.id))) naval.islandCities++; }
    naval.ships += cs.reduce((a, c) => a + (c.units.transport || 0) + (c.units.warship || 0), 0);
    (rows[e.race] = rows[e.race] || []).push({ renown: G.renown(s, e.id), cities: cs.length, pop: cs.reduce((a, c) => a + c.pop, 0), army, power: G.power(s, e.id),
      wonder, faith: e.faithTotal || e.faith || 0, mana, wins: e.wins || 0, conq: e.conquests || 0, dead: e.dead ? 1 : 0 });
  }
  console.log('world ' + (w + 1) + '/' + worlds + ' (player ' + race + ') done in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
const mean = (l, k) => l.reduce((a, r) => a + r[k], 0) / l.length;
const keys = ['renown', 'cities', 'pop', 'army', 'power', 'wins', 'wonder', 'faith', 'mana', 'conq', 'dead'];
const table = DATA.raceOrder.filter(r => rows[r]).map(r => ({ race: r, n: rows[r].length, ...Object.fromEntries(keys.map(k => [k, mean(rows[r], k)])) }));
const median = k => { const v = table.map(t => t[k]).sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const med = Object.fromEntries(keys.map(k => [k, median(k)]));
const pad = (x, n) => String(x).padStart(n);
console.log('\\nAI parity after ' + hours + ' game-hours, ' + worlds + ' worlds (' + pace + '), means per people; Δ = renown vs median');
console.log('people  n  renown     Δ  cities    pop  army  power  wins wonder  faith  mana conq dead');
for (const t of table) {
  const d = med.renown ? (t.renown / med.renown - 1) * 100 : 0;
  console.log(t.race.padEnd(7) + pad(t.n, 2) + pad(t.renown.toFixed(0), 8) + pad((d >= 0 ? '+' : '') + d.toFixed(0) + '%', 6) + pad(t.cities.toFixed(1), 8) + pad(t.pop.toFixed(0), 7)
    + pad(t.army.toFixed(0), 6) + pad(t.power.toFixed(0), 7) + pad(t.wins.toFixed(0), 6) + pad(t.wonder.toFixed(1), 7) + pad(t.faith.toFixed(0), 7) + pad(t.mana.toFixed(0), 6) + pad(t.conq.toFixed(1), 5) + pad(t.dead.toFixed(1), 5)
    + (Math.abs(d) > 25 ? '  <-- ' + (d > 0 ? 'strong' : 'weak') : ''));
}
console.log('median  ' + pad(med.renown.toFixed(0), 9) + '      ' + pad(med.cities.toFixed(1), 8) + pad(med.pop.toFixed(0), 7) + pad(med.army.toFixed(0), 6) + pad(med.power.toFixed(0), 7));
console.log('AI sea & air (all worlds): harbors ' + naval.harbors + ', ships ' + naval.ships + ', cities across water ' + naval.islandCities + ', sea marches ' + naval.seaMarches + ', flying marches ' + naval.flyMarches);
console.log('parity ms', Date.now() - t0);
`);
