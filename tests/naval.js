// Seas, islands, ships and paths. Run from the repo root: node tests/naval.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : '')); };
// find a game with an island and a coastal player-reachable shore
let s, island, shore;
for (let i = 0; i < 30 && !island; i++) {
  s = G.newGame({ name: 'T', race: 'hearth' }); s.settings.hostility = 0;
  const cap = G.capital(s, 'p');
  island = s.tiles.find(t => !G.isWater(t) && !t.city && !t.camp && !t.oasis && !t.ruin && G.isIsland(s, t) && G.coastal(s, t.x, t.y));
  shore = island && s.tiles.find(t => !G.isWater(t) && !t.city && !t.camp && !t.oasis && !t.ruin && !G.isIsland(s, t) && G.coastal(s, t.x, t.y) && G.path(s, t, island, true));
  if (!shore) island = null;
}
ok('world has seas with islands', !!island, island && JSON.stringify({ island: [island.x, island.y], shore: [shore.x, shore.y] }));
const cap = G.capital(s, 'p');
ok('every AI capital is reachable by land', ['a1', 'a2', 'a3'].every(id => G.landReachable(s, cap, G.capital(s, id))));
// a coastal port city for the player
const port = G.foundCity(s, 'p', shore.x, shore.y, 'Port');
Object.assign(port.buildings, { townhall: 6, harbor: 5 }); for (const g of DATA.goodOrder) port.res[g] = 1e5; s.empires.p.gold = 1e6; port.pop = 200;
ok('harbor needs a coastal city', !!G.buildStatus(s, cap, 'harbor').reason === !G.coastal(s, cap.x, cap.y) || G.coastal(s, cap.x, cap.y), G.buildStatus(s, cap, 'harbor').reason);
ok('harbor fishing adds grain', (() => { const a = G.econ(s, port).raw.grain; port.buildings.harbor = 0; const b = G.econ(s, port).raw.grain; port.buildings.harbor = 5; return a > b; })());
port.units = { militia: 40, settlers: 1 };
ok('no land route to an island', /only ships/.test(G.sendArmy(s, port.id, island.x, island.y, 'raid', { militia: 10 }) || ''));
G.queueTrain(s, port.id, 'transport', 2); G.advance(s, 600, 60);
ok('transports trained at the harbor', port.units.transport === 2, JSON.stringify(port.units));
ok('transport space is limited', /transport space/.test(G.sendArmy(s, port.id, island.x, island.y, 'raid', { militia: 40, settlers: 1, transport: 1 }) || ''));
s.empires.p.renownBonus = 500;
const e = G.sendArmy(s, port.id, island.x, island.y, 'settle', { settlers: 1, militia: 10, transport: 1 });
ok('settlers sail to an island', e === null, e);
const mv = s.moves.find(m => m.type === 'settle');
ok('sea route stays on water', mv && mv.naval && mv.path.slice(1, -1).every(([x, y]) => G.isWater(G.tileAt(s, x, y))));
G.advance(s, 3600, 300);
const isle = Object.values(s.cities).find(c => c.x === island.x && c.y === island.y);
ok('island city founded', !!isle && isle.owner === 'p');
ok('ships come home', (port.units.transport || 0) + s.moves.filter(m => m.units.transport).length >= 1);
// land marches walk around water
const lake = s.tiles.find(t => G.isWater(t));
const a = s.tiles.find(t => !G.isWater(t) && t.x < lake.x - 1 && !G.isIsland(s, t)), b = s.tiles.find(t => !G.isWater(t) && t.x > lake.x + 1 && Math.abs(t.y - lake.y) < 2 && !G.isIsland(s, t));
if (a && b) { const p = G.path(s, a, b, false); ok('land paths never cross water', p && p.path.every(([x, y]) => !G.isWater(G.tileAt(s, x, y)))); }
// a moving army's position follows its path
{ const m = { fx: 0, fy: 0, x: 2, y: 2, depart: 0, arrive: 100, path: [[0, 0], [2, 0], [2, 2]] }; const s2 = { time: 50 }; const p = G.movePos(s2, m); ok('movePos follows the path', Math.abs(p.x - 2) < 0.01 && Math.abs(p.y) < 0.01, JSON.stringify(p)); }
// warships raid a coastal city
{ const ai = Object.values(s.cities).find(c => c.owner !== 'p' && G.coastal(s, c.x, c.y) && G.path(s, port, c, true));
  if (ai) { port.units.warship = 30; ai.units = {}; const r = G.sendArmy(s, port.id, ai.x, ai.y, 'raid', { warship: 30 }); ok('war galleys can raid a coastal city', r === null, r); }
  else console.log('SKIP no coastal AI city reachable by sea in this map'); }
// save/load keeps paths working
G.save(s); const s3 = G.load(); G.advance(s3, 600, 60); ok('save/load with ships and paths', !!s3);

// ---------------------------------------------------------------------
// The AI at sea
// ---------------------------------------------------------------------
// a world with an island and a mainland shore that shares its sea; rivals of the given peoples
const seaWorld = rivalRaces => {
  for (let i = 0; i < 40; i++) {
    const w = G.newGame({ name: 'T', race: 'hearth', rivalRaces, rivals: rivalRaces.length });
    w.calamityAt = 1e12; w.eventAt = 1e12;
    const free = t => !G.isWater(t) && !t.city && !t.camp && !t.oasis && !t.ruin && G.coastal(w, t.x, t.y);
    const isl = w.tiles.find(t => free(t) && G.isIsland(w, t));
    if (!isl) continue;
    const sh = w.tiles.find(t => free(t) && !G.isIsland(w, t) && G.dist(t, isl) >= 3 && G.dist(t, isl) <= 9 && Object.values(w.cities).every(c => G.dist(c, t) >= 3) && G.path(w, t, isl, true));
    if (sh) return { w, isl, sh };
  }
  return null;
};
const richCity = (w, c) => { for (const g of DATA.goodOrder) c.res[g] = 5e4; Object.assign(c.buildings, { townhall: 8, warehouse: 20, farm: 12, houses: 12, barracks: 5, stable: 3 }); c.pop = 300; w.empires[c.owner].gold = 1e5; };
const noCamps = w => { for (const k of Object.values(w.camps)) w.tiles[k.y * w.map + k.x].camp = null; w.camps = {}; w.campTarget = 0; };
{
  const W = seaWorld(['tide', 'ash', 'delver']);
  ok('AI naval: found a world with an island in reach of a mainland shore', !!W);
  if (W) {
    const { w, isl, sh } = W;
    // an AI port on the island's sea, with renown to spare for another city
    const port = G.foundCity(w, 'a2', sh.x, sh.y, 'Ashport'); richCity(w, port);
    w.empires.a2.renownBonus = 3000;
    const ov = G.aiOverseas(w, 'a2', true);
    ok('AI naval: the island shows up as worth settling', ov.settle.length > 0, JSON.stringify(ov));
    G.advance(w, 2 * 3600, 1200);
    const ships = (port.units.transport || 0) + w.moves.filter(m => m.owner === 'a2').reduce((a, m) => a + (m.units.transport || 0), 0)
      + Object.values(w.cities).filter(c => c.owner === 'a2').reduce((a, c) => a + (c.units.transport || 0), 0) - (port.units.transport || 0);
    ok('AI naval: an AI with an island in reach builds a harbor', G.lvl(port, 'harbor') >= 1, 'harbor ' + G.lvl(port, 'harbor'));
    ok('AI naval: ... and a transport within 2 game-hours', ships >= 1 || (port.train.harbor || []).length > 0, JSON.stringify(port.units));
    // with no land left nearby, settlers in a port with a transport sail for the island
    port.units.transport = Math.max(1, port.units.transport || 0); port.units.settlers = 1;
    // keep the realm small enough to found another city: only its capital and the port remain
    for (const c of G.citiesOf(w, 'a2')) if (c !== port && c !== G.capital(w, 'a2')) { w.tiles[c.y * w.map + c.x].city = null; delete w.cities[c.id]; }
    w.empires.a2.renownBonus = 3000;
    for (const c of G.citiesOf(w, 'a2')) if (c !== port) delete c.units.settlers;
    w.moves = w.moves.filter(m => !(m.owner === 'a2' && m.type === 'settle'));
    const blocked = [];
    for (const t of w.tiles) if (!t.ruin && !G.isIsland(w, t) && G.dist(t, port) <= (G.AI_SETTLE_RANGE || 7) + 0.5 && !t.city) { t.ruin = { tier: 1, readyAt: 0, units: null }; blocked.push(t); }
    G.aiOverseas(w, 'a2', true);
    G.aiExpand(w, 'a2');
    for (const t of blocked) delete t.ruin;
    const mv = w.moves.find(m => m.owner === 'a2' && m.type === 'settle');
    ok('AI naval: settlers ship out to an island', !!mv && mv.naval && mv.units.transport >= 1, mv && JSON.stringify(mv.units));
    if (mv) { G.advance(w, mv.arrive - w.time + 5, 50); ok('AI naval: the AI founds a city across the water', Object.values(w.cities).some(c => c.owner === 'a2' && G.isIsland(w, c))); }
    G.save(w); const w2 = G.load(); ok('AI naval: overseas plans survive save/load', !!w2 && !!w2.empires.a2.overseas && Array.isArray(w2.empires.a2.overseas.settle));
  }
}
// an AI ship-borne attack on a player island city
const islandAttack = (race, army) => {
  const W = seaWorld([race, 'hearth' === race ? 'ash' : 'delver']);
  if (!W) return { skip: true };
  const { w, isl, sh } = W;
  noCamps(w);
  const pc = G.foundCity(w, 'p', isl.x, isl.y, 'Isle'); pc.units = { militia: 2 };
  const port = G.foundCity(w, 'a1', sh.x, sh.y, 'Raidport'); richCity(w, port);
  port.buildings.harbor = 5;
  for (const c of G.citiesOf(w, 'a1')) if (c !== port) c.units = {};
  port.units = { ...army };
  w.time = G.pace(w).grace + G.pace(w).ramp + 60;      // full pressure
  w.settings.hostility = 1.25; w.empires.a1.aggr = 1;
  if (G.rel) G.rel(w, 'a1').status = 'war';
  G.aiOverseas(w, 'a1', true);
  let mv = null;
  for (let i = 0; i < 60 && !mv; i++) { G.aiWar(w, 'a1'); mv = w.moves.find(m => m.owner === 'a1' && m.x === pc.x && m.y === pc.y); }
  if (!mv) return { w, pc, port };
  const before = w.reports.length;
  G.advance(w, mv.arrive - w.time + 5, 50);
  return { w, pc, port, mv, hit: w.reports.slice(0, w.reports.length - before).some(r => /Isle/.test(r.title)) };
};
{
  const r = islandAttack('ash', { transport: 2, warship: 1, raider: 40 });
  if (r.skip) console.log('SKIP no sea world'); else {
    ok('AI naval: a raid on a player island goes by sea', !!r.mv && r.mv.naval && r.mv.units.transport >= 1, r.mv ? JSON.stringify(r.mv.units) : 'no march');
    ok('AI naval: ship-borne passengers fit the transports', !!r.mv && Object.entries(r.mv.units).filter(([u]) => DATA.units[u].type !== 'ship').reduce((a, [u, n]) => a + Math.max(1, G.unitPop(u)) * n, 0) <= 30 * (r.mv.units.transport || 0));
    ok('AI naval: the ship-borne army arrives and fights', !!r.hit);
    ok('AI naval: one sea venture at a time (cooldown set)', (r.w.empires.a1.seaAt || 0) > r.w.time - 60);
  }
}
{
  const fl = Object.keys(DATA.units).filter(u => DATA.units[u].flying && DATA.units[u].at && DATA.units[u].atk >= 50);
  const r = islandAttack('wind', Object.fromEntries(fl.map(u => [u, 30])));
  if (!r.skip) ok('AI air: Windkin fliers strike an island without ships', !!r.mv && !r.mv.naval && Object.keys(r.mv.units).every(u => DATA.units[u].flying), r.mv ? JSON.stringify(r.mv.units) : 'no march');
  const am = Object.keys(DATA.units).filter(u => DATA.units[u].amphibious && DATA.units[u].at && DATA.units[u].atk >= 50 && !DATA.units[u].mage);
  const r2 = islandAttack('tide', Object.fromEntries(am.map(u => [u, 30])));
  if (!r2.skip) ok('AI amphibious: Tidekin wade to an island without ships', !!r2.mv && !r2.mv.naval && Object.keys(r2.mv.units).every(u => DATA.units[u].amphibious), r2.mv ? JSON.stringify(r2.mv.units) : 'no march');
}
// G.unitCost: race discounts show in the price and are what training pays
{
  const w = G.newGame({ name: 'T', race: 'tide', rivals: 1 });
  const c = G.capital(w, 'p'); richCity(w, c); c.buildings.harbor = 5;
  const k = G.unitCost(w, 'p', 'transport');
  ok('unitCost: Tidekin ships are cheaper', k.timber === 300 && k.gold === 75, JSON.stringify(k));
  ok('unitCost: land units at full price', JSON.stringify(G.unitCost(w, 'p', 'scout')) === JSON.stringify(DATA.units.scout.cost));
  const t0 = c.res.timber; G.queueTrain(w, c.id, 'transport', 2);
  ok('unitCost: training pays the discounted price', Math.abs(t0 - c.res.timber - 600) < 1, (t0 - c.res.timber).toFixed(0));
  const hc = G.citiesOf(w, 'a1')[0]; ok('unitCost: other peoples pay full price for ships', G.unitCost(w, hc.owner, 'transport').timber === 400);
  ok('fishing key scales the harbor catch', (() => { const a = G.econ(w, c).fishing; w.empires.p.race = 'hearth'; const b = G.econ(w, c).fishing; w.empires.p.race = 'tide'; return a > b * 1.3 && b > 0; })());
}
console.log(fails ? fails + ' FAILED' : 'all naval checks passed');
`);
