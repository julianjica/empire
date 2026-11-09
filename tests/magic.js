// Magic: mana, ley enclaves, schools, spells, wild magic, the Great Working. Run from the repo root: node tests/magic.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/intercept.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : '')); };
const s = G.newGame({ name: 'T', race: 'hearth' }); s.settings.hostility = 0;
const c = G.capital(s, 'p');
ok('a ley network exists', s.ley && s.ley.nodes.length >= 4 && s.ley.lines.length >= s.ley.nodes.length - 1, s.ley && s.ley.nodes.length + ' nodes');
ok('every city makes some mana', G.econ(s, c).raw.mana > 0, G.econ(s, c).raw.mana.toFixed(2));
// an enclave city makes much more
const node = s.ley.nodes.find(n => !G.tileAt(s, n.x, n.y).city && !G.isWater(G.tileAt(s, n.x, n.y)) && G.landReachable(s, c, n));
const encl = G.foundCity(s, 'p', node.x, node.y, 'Enclave');
ok('an enclave city draws far more mana', G.econ(s, encl).raw.mana > G.econ(s, c).raw.mana * 1.5 || G.leyPower(s, encl) > G.leyPower(s, c), G.econ(s, encl).raw.mana.toFixed(2) + ' vs ' + G.econ(s, c).raw.mana.toFixed(2));
ok('the enclave city taps its node', G.nodeTapper(s, node) === encl);
ok('Mage Tower raises mana', (() => { const a = G.econ(s, c).raw.mana; c.buildings.magetower = 5; return G.econ(s, c).raw.mana > a * 2; })());
ok('native school known', G.schoolsOf(s, 'p').includes('hearthweather'));
ok('other schools unknown', !G.spellsOf(s, 'p').includes('emberstorm'));
ok('battle mage in the unit list', DATA.races.hearth.units.includes('hedgewizard'));
c.res.mana = 5000; c.buildings.magetower = 15; c.buildings.townhall = 15;
const g0 = G.mod(s, 'p', c, 'grain');
ok('cast a city spell', G.castSpell(s, 'p', c.id, 'bountifulrain', c.id) === null);
ok('city spell boosts grain', G.mod(s, 'p', c, 'grain') > g0 * 1.4);
ok('cooldown applies', !!G.castSpell(s, 'p', c.id, 'bountifulrain', c.id));
ok('realm spell (learned in the Grimoire)', G.learnArcanum(s, 'p', G.spellNode('summersun'), { free: true, path: true }) === null && G.castSpell(s, 'p', c.id, 'summersun') === null && G.mod(s, 'p', null, 'travel') > 1.1);
// a tile spell: raise land next to a shore within reach
const water = s.tiles.find(t => G.isWater(t) && Math.hypot(t.x - c.x, t.y - c.y) <= G.cityReach(s, c) + 3 && [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => { const n = G.tileAt(s, t.x+dx, t.y+dy); return n && !G.isWater(n); }));
if (water) { const r = G.castSpell(s, 'p', c.id, 'raiseland', { x: water.x, y: water.y }); ok('Raise the Land turns water to land', r === null && !G.isWater(water), r); ok('reshaping bumps the terrain revision', s.terrainRev >= 1); }
else console.log('SKIP no water near the capital for Raise the Land');
// scrying reveals and gives intel
const ai = G.capital(s, 'a1');
ok('scrying gives intel', G.castSpell(s, 'p', c.id, 'scry', { x: ai.x, y: ai.y }) === null && !!s.intel[G.tileIdx(s, ai)]);
// costs rise with repeated casts
ok('costs rise with use', G.spellCost(s, 'p', 'scry') > DATA.spells.scry.cost);
// wild magic: high strain eventually lashes back
G.magicState(s).strain[c.id] = 400; c.ward = 0;
let back = false; for (let i = 0; i < 60 && !back; i++) { G.advance(s, 60, 6); back = (G.magicState(s).strain[c.id] || 0) < 300; }
ok('heavy strain lashes back', back);
// a rift can be sealed for renown
{ const s2 = G.newGame({ name: 'T', race: 'hearth' }); s2.settings.hostility = 0; const c2 = G.capital(s2, 'p');
  const t = G.freeTile(s2, x => Math.hypot(x.x - c2.x, x.y - c2.y) >= 2 && Math.hypot(x.x - c2.x, x.y - c2.y) <= 4 && G.landReachable(s2, c2, x));
  const id = G.newId(s2, 'k'); s2.camps[id] = { id, x: t.x, y: t.y, tier: 5, units: { demon: 5 }, loot: { mana: 100 }, kind: 'rift', next: 1e9 }; t.camp = id;
  c2.units = { knight: 100 }; c2.res.grain = 1e5; G.sendArmy(s2, c2.id, t.x, t.y, 'attack', { knight: 100 }); G.advance(s2, 1200, 120);
  ok('sealing a rift grants renown', (s2.empires.p.renownBonus || 0) >= 15); }
// the Great Working
{ const s3 = G.newGame({ name: 'T', race: 'veil' in DATA.races ? 'veil' : 'hearth' }); s3.settings.hostility = 0; const c3 = G.capital(s3, 'p');
  ok('Working needs ley nodes', !!G.workingStatus(s3, 'p').reason);
  // grant: tower 15, nodes moved under the capital's reach, lots of mana and gold
  c3.buildings.magetower = 15; c3.buildings.townhall = 15; c3.pop = 800; for (const n of s3.ley.nodes.slice(0, 4)) { n.x = c3.x; n.y = c3.y; }
  for (const k of [0,1,2,3,4,5,6,7,8,9,10]) G.advance(s3, 10, 1);
  c3.res.mana = 1e6; s3.empires.p.gold = 1e7;
  let guard = 0;
  while (!s3.victory && guard++ < 60) { const st = G.workingStatus(s3, 'p'); if (st.ok) G.beginWorkingStage(s3, 'p'); c3.res.mana = 1e6; G.advance(s3, 1800, 60); }
  ok('the Great Working wins a conquest game', s3.victory === 'arcane', 'stage ' + (G.magicState(s3).working.p || {}).stage); }
// save/load keeps magic state
G.save(s); const s4 = G.load(); G.advance(s4, 600, 60); ok('save/load with magic', s4 && s4.ley && s4.ley.nodes.length === s.ley.nodes.length);
console.log(fails ? fails + ' FAILED' : 'all magic checks passed');
`);
