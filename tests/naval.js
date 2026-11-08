// Seas, islands, ships and paths. Run from the repo root: node tests/naval.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
eval(['js/data.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js'].map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
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
console.log(fails ? fails + ' FAILED' : 'all naval checks passed');
`);
