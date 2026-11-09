// World generation: sizes, regional biomes and scarcity, deposits, capitals, scaled counts, city limits,
// AI expansion into other lands, old saves.  Run from the repo root: node tests/world.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/intercept.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && x !== '' ? ' ' + x : '')); };
const GO = ['grain', 'timber', 'stone', 'ore'];
const mk = o => G.newGame({ name: 'W', race: 'hearth', ...o });

// ---- sizes ----
{
  const sz = (w, r) => mk({ worldSize: w, rivals: r }).map;
  ok('small keeps the classic map (31 with 3 rivals, 47 with 7)', sz('small', 3) === 31 && sz('small', 7) === 47);
  ok('normal is the default: 52 with 3 rivals, +7 per rival (80 with 7)', mk({ rivals: 3 }).map === 52 && sz('normal', 5) === 66 && sz('normal', 7) === 80);
  ok('large: 64 with 3 rivals', sz('large', 3) === 64);
  ok('fewer rivals never shrink below the floor', sz('normal', 1) >= 44 && sz('small', 1) === 31);
  ok('an explicit size still wins', mk({ size: 37 }).map === 37);
  const s = mk({ worldSize: 'large', rivals: 4 });
  ok('world size is remembered in the settings', s.settings.worldSize === 'large' && s.tiles.length === s.map * s.map && s.explored.length === s.map * s.map);
}

// ---- capitals ----
{
  let bad = [], perfect = 0, n = 0, far = [], unreach = 0;
  for (let w = 0; w < 10; w++) {
    const s = mk({ race: DATA.raceOrder[w % DATA.raceOrder.length], rivals: w < 5 ? 3 : 5 });
    const cap = G.capital(s, 'p');
    for (const c of Object.values(s.cities)) {
      const t = G.tileAt(s, c.x, c.y), y = G.siteYield(s, c.x, c.y); n++;
      if (G.isWater(t) || GO.some(g => y[g] < 0.68)) bad.push(s.empires[c.owner].race + ' ' + GO.map(g => y[g].toFixed(2)).join('/'));
      if (GO.every(g => y[g] >= 1)) perfect++;
      if (c.owner !== 'p') { far.push(G.dist(c, cap)); if (!G.path(s, cap, c, false)) unreach++; }
    }
  }
  ok('every capital stands on land and is viable (no good below 0.68)', !bad.length, bad.join(' | '));
  ok('capitals are imperfect: at most one in ten is good at everything', perfect <= n / 10, perfect + '/' + n);
  ok('every rival capital can be reached by land', unreach === 0, unreach);
  ok('rival capitals within marching distance (10-22 tiles from the player)', far.every(d => d >= 9.5 && d <= 22), far.map(d => d.toFixed(0)).join(','));
}

// ---- regional scarcity ----
{
  let n = 0, spec = 0, strong2 = 0, mean = { grain: 0, timber: 0, stone: 0, ore: 0 }, homog = 0, hn = 0, depSites = 0;
  for (let w = 0; w < 6; w++) {
    const s = mk({ race: DATA.raceOrder[w] });
    for (const t of s.tiles) {
      if (G.isWater(t)) continue;
      const y = G.siteYield(s, t.x, t.y); n++;
      const st = GO.filter(g => y[g] >= 1.15).length, wk = GO.filter(g => y[g] <= 0.85).length;
      if (st >= 1 && wk >= 2) spec++;
      if (st <= 2) strong2++;
      if (y.deposits.length) depSites++;
      for (const g of GO) mean[g] += y[g];
    }
    // coherent biomes: a tile's 8 neighbours mostly share its terrain
    for (const t of s.tiles) { if (G.isWater(t)) continue; let same = 0, k = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const u = G.tileAt(s, t.x + dx, t.y + dy); if (u && (dx || dy)) { k++; if (u.terrain === t.terrain) same++; } } homog += same / k; hn++; }
  }
  const m = GO.map(g => mean[g] / n);
  ok('most sites are specialised (>=1 good strong, >=2 weak): >= 55%', spec / n >= 0.55, (100 * spec / n).toFixed(0) + '%');
  ok('almost every site is strong in at most two goods (>= 95%)', strong2 / n >= 0.95, (100 * strong2 / n).toFixed(1) + '%');
  ok('average yields stay near 1x (0.9-1.2 per good)', m.every(v => v >= 0.9 && v <= 1.2), m.map(v => v.toFixed(2)).join('/'));
  ok('biomes are coherent (neighbours share terrain >= 55%)', homog / hn >= 0.55, (100 * homog / hn).toFixed(0) + '%');
  ok('some sites have a deposit in reach (8-40%)', depSites / n >= 0.08 && depSites / n <= 0.4, (100 * depSites / n).toFixed(0) + '%');
}

// ---- deposits ----
{
  const s = mk({});
  const dep = s.tiles.filter(t => t.deposit);
  const seeds = Math.round(s.map * s.map / G.WORLD_GEN.depositArea);
  ok('deposits: clusters of 2-4 tiles, about one per ' + G.WORLD_GEN.depositArea + ' tiles', dep.length >= seeds * 1.2 && dep.length <= seeds * 4.5, dep.length + ' tiles for ' + seeds + ' clusters');
  const match = { ore: ['mountain', 'hills'], stone: ['hills', 'mountain'], timber: ['forest'], grain: ['fertile'] };
  ok('deposits lie on matching ground', dep.every(t => match[t.deposit].includes(t.terrain)) || dep.filter(t => !match[t.deposit].includes(t.terrain)).length <= dep.length * 0.05);
  ok('no deposit right beside a capital', dep.every(t => Object.values(s.cities).every(c => G.dist(c, t) >= 3)));
  const t = dep[0], g = t.deposit, with_ = G.siteYield(s, t.x, t.y)[g];
  const saved = s.tiles.filter(u => u.deposit === g && G.dist(u, t) <= 2.5).map(u => (delete u.deposit, u));
  const without = G.siteYield(s, t.x, t.y)[g];
  saved.forEach(u => { u.deposit = g; });
  ok('a deposit lifts its good strongly (+20% or more)', with_ >= without * 1.2 && with_ <= 2.1, without.toFixed(2) + ' -> ' + with_.toFixed(2));
  const city = G.capital(s, 'p'); city.site = null;
  ok('city sites list their deposits', Array.isArray(G.site(s, city).deposits));
}

// ---- counts scale with the area ----
{
  const avg = (w, f, k = 3) => { let a = 0; for (let i = 0; i < k; i++) a += f(mk({ worldSize: w, rivals: 3 })); return a / k; };
  const cnt = s => ({ camps: Object.keys(s.camps).length, oases: s.special.filter(t => t.oasis).length, ruins: s.special.filter(t => t.ruin).length,
    rivers: s.rivers.length, ley: s.ley ? s.ley.nodes.length : 0, seas: new Set(Array.from(G.waterRegions(s)).filter(v => v >= 0)).size, minors: Object.keys(s.minors || {}).length, holy: (s.holySites || []).length, area: s.map * s.map });
  const S = mk({ worldSize: 'small' }), N = mk({ worldSize: 'normal' });
  const a = cnt(S), b = cnt(N), r = b.area / a.area;
  console.log('  small', JSON.stringify(a)); console.log('  normal', JSON.stringify(b));
  ok('camps, oases and ruins scale with the area', ['camps', 'oases', 'ruins'].every(k => b[k] >= a[k] * r * 0.7), r.toFixed(2) + 'x area');
  ok('more ley enclaves and rivers in the larger world', avg('normal', s => s.ley.nodes.length) > avg('small', s => s.ley.nodes.length) * 1.6 && avg('normal', s => s.rivers.length) > avg('small', s => s.rivers.length) * 1.3);
  ok('more inland seas in the larger world', avg('normal', s => cnt(s).seas) > avg('small', s => cnt(s).seas));
}

// ---- city limits ----
{
  const S = mk({ worldSize: 'small' }), N = mk({ worldSize: 'normal' }), L = mk({ worldSize: 'large' });
  ok('city limit: 9 small, 12 normal, 14 large', G.cityLimit(S) === 9 && G.cityLimit(N) === 12 && G.cityLimit(L) === 14);
  ok('the first slots keep the classic renown table', [0, 1, 2, 3, 4, 5, 6, 7, 8].every(i => G.citySlotRenown(N, i) === DATA.citySlots[i]));
  const ext = [9, 10, 11].map(i => G.citySlotRenown(N, i));
  ok('slots past the table keep climbing', ext[0] > DATA.citySlots[8] && ext[1] - ext[0] > ext[0] - DATA.citySlots[8] && G.citySlotRenown(N, 12) === Infinity, ext.join(','));
  ok('small worlds stop at nine cities as before', G.citySlotRenown(S, 9) === Infinity);
  ok('AI realms aim for more cities in larger worlds', G.aiCityCap(S) === 7 && G.aiCityCap(N) === 10 && G.aiCityCap(L) === 12);
}

// ---- AI expansion fills the gaps ----
{
  const s = mk({ race: 'hearth' });
  // a realm with only farmland lacks stone and ore; a hill site should beat an equally near vale for it
  const emp = s.empires.a1, lack = { grain: 0, timber: 0.3, stone: 1, ore: 1 };
  const hill = { grain: 0.8, timber: 0.85, stone: 1.6, ore: 1.4, prosper: 1 }, vale = { grain: 1.7, timber: 1, stone: 0.7, ore: 0.75, prosper: 1 };
  ok('AI values the goods it lacks', G.aiSiteValue(s, { ...emp, race: 'hearth' }, hill, lack) > G.aiSiteValue(s, { ...emp, race: 'hearth' }, vale, lack));
  const t0 = Date.now();
  G.advance(s, 8 * 3600, 2400);
  const dom = c => { const y = G.site(s, c); return GO.slice().sort((a, b) => y[b] - y[a])[0]; };
  const rows = Object.keys(s.empires).filter(id => id !== 'p').map(id => { const cs = G.citiesOf(s, id); return { id, n: cs.length, lands: new Set(cs.map(dom)).size, far: cs.length ? Math.max(...cs.map(c => G.dist(c, G.capital(s, id) || c))) : 0 }; });
  console.log('  after 8 h: ' + rows.map(r => s.empires[r.id].race + ' ' + r.n + ' cities, ' + r.lands + ' lands, reach ' + r.far.toFixed(0)).join(' | ') + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  const grown = rows.filter(r => r.n >= 3);
  ok('AI realms expand (most have 3+ cities by hour 8)', grown.length >= Math.ceil(rows.length / 2), rows.map(r => r.n).join('/'));
  ok('expanding AIs settle in at least two different lands (two in three or more of them)', grown.length && grown.filter(r => r.lands >= 2).length >= Math.ceil(grown.length * 2 / 3), grown.map(r => r.lands).join('/'));
}

// ---- old saves keep their world ----
{
  const s = mk({ worldSize: 'small' });
  delete s.settings.worldSize;
  for (const t of s.tiles) delete t.deposit;
  for (const c of Object.values(s.cities)) delete c.site;
  const raw = G.serialize(s);
  const t = G.deserialize(raw);
  ok('an old save loads with its own map size', t && t.map === 31 && t.tiles.length === 31 * 31);
  ok('old saves keep the classic city limit', G.cityLimit(t) === 9 && G.aiCityCap(t) === 7);
  let err = null; try { G.advance(t, 3600, 600); } catch (e) { err = e; }
  ok('an old save runs an hour', !err, err && err.stack);
  const old47 = mk({ worldSize: 'small', rivals: 7 }); delete old47.settings.worldSize;
  ok('an old 7-rival (47-tile) save counts as small', G.cityLimit(old47) === 9);
}

// ---- paths ----
{
  const s = mk({ rivals: 5 });
  const land = s.tiles.filter(t => !G.isWater(t));
  let mism = 0;
  for (let i = 0; i < 60; i++) { const a = land[i * 7 % land.length], b = land[(i * 131 + 17) % land.length]; const p = G.path(s, a, b, false); if (!!p !== G.landReachable(s, a, b)) mism++; if (p && p.len < G.dist(a, b) * 0.999) mism++; }
  ok('land paths agree with land regions and never beat a straight line', mism === 0, mism);
}

console.log(fails ? fails + ' FAILED' : 'all world checks passed');
`);
