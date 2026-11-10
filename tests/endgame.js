// Wonders and save management. Run from the repo root: node tests/endgame.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' ' + x : '')); };
const rich = c => { for (const g of DATA.goodOrder) c.res[g] = 1e6; };
const setup = race => {
  const s = G.newGame({ name: 'T', race }); s.settings.hostility = 0;
  const c = G.capital(s, 'p');
  Object.assign(c.buildings, { townhall: 14, academy: 6, warehouse: 20 });
  for (let i = 0; i < 2; i++) { const t = G.freeTile(s, x => G.dist(x, c) > 3 && G.dist(x, c) < 7); G.foundCity(s, 'p', t.x, t.y, 'Extra' + i); }
  rich(c); s.empires.p.gold = 1e7;
  return { s, c };
};
{ // wonder is gated, unique, gives boons, and finishing it wins
  const s0 = G.newGame({ name: 'T', race: 'hearth' }); const c0 = G.capital(s0, 'p');
  ok('wonder locked for a small realm', !!G.buildStatus(s0, c0, 'wonder_hearth').locked, G.buildStatus(s0, c0, 'wonder_hearth').reason);
  ok('other races\\' wonders hidden', !!G.buildStatus(s0, c0, 'wonder_ash').hidden);
  const { s, c } = setup('hearth');
  ok('wonder buildable once the realm is ready', G.buildStatus(s, c, 'wonder_hearth').ok, G.buildStatus(s, c, 'wonder_hearth').reason);
  const other = G.citiesOf(s, 'p').find(x => x !== c); Object.assign(other.buildings, { townhall: 14, academy: 6, warehouse: 20 }); rich(other);
  G.queueBuild(s, c.id, 'wonder_hearth');
  ok('only one wonder city per realm', !G.buildStatus(s, other, 'wonder_hearth').ok, G.buildStatus(s, other, 'wonder_hearth').reason);
  const g0 = G.mod(s, 'p', c, 'grain');
  let guard = 0;
  while (G.lvl(c, 'wonder_hearth') < 10 && guard++ < 400) { rich(c); if (!c.buildQueue.length) G.queueBuild(s, c.id, 'wonder_hearth'); G.advance(s, 1200, 40); }
  ok('wonder reaches stage 10', G.lvl(c, 'wonder_hearth') === 10, 'game time ' + (s.time / 3600).toFixed(1) + 'h');
  // compare at the same moment (seasons change over 8 hours): with and without the wonder's stages
  const withW = G.mod(s, 'p', c, 'grain'); const lv = s.empires.p._wonderLevel; s.empires.p._wonderLevel = 0; const without = G.mod(s, 'p', c, 'grain'); s.empires.p._wonderLevel = lv;
  ok('stages grant boons', withW > without * 1.25, without.toFixed(2) + ' -> ' + withW.toFixed(2));
  ok('finishing the wonder wins a conquest game', s.victory === 'wonder');
}
{ // an AI finishing first is a defeat
  const s = G.newGame({ name: 'T', race: 'hearth' });
  const ai = G.capital(s, 'a1'); const key = DATA.wonders[s.empires.a1.race].key;
  ai.buildings[key] = 9; G.advance(s, 20, 4);
  ok('AI at stage 9 triggers a warning', s.log.some(l => /Stop them/.test(l.text)));
  ai.buildings[key] = 10; G.advance(s, 20, 4);
  ok('AI completing its wonder ends the game', s.gameOver === 'wonder' && s.gameOverBy === 'a1');
}
{ // catapults wreck wonder stages
  const s = G.newGame({ name: 'T', race: 'hearth' }); s.settings.hostility = 0;
  const ai = G.capital(s, 'a1'); const key = DATA.wonders[s.empires.a1.race].key;
  ai.buildings[key] = 6; ai.units = {};
  const c = G.capital(s, 'p'); c.units = { knight: 200, treb_h: 60 }; c.res.grain = 1e6;
  G.sendArmy(s, c.id, ai.x, ai.y, 'attack', { knight: 200, treb_h: 60 }); G.advance(s, 3600, 400);
  ok('catapults wreck at most 2 wonder stages per assault', ai.buildings[key] === 4, 'stage ' + (ai.buildings[key] || 0));
}
{ // saves: slots, export/import round trip, migration of an older save
  const s = G.newGame({ name: 'Slotland', race: 'sylvan' }); G.advance(s, 600, 60);
  ok('save to slot', G.saveSlot(s, 2) === null);
  const info = G.slotInfo(2);
  ok('slot info', info && info.realm === 'Slotland' && info.race === 'sylvan', JSON.stringify(info));
  const s2 = G.loadSlot(2);
  ok('load from slot', s2 && s2.special.length === s.special.length && s2.special[0] === s2.tiles[G.tileIdx(s2, s2.special[0])]);
  G.advance(s2, 600, 60);
  const json = G.serialize(s2);
  const s3 = G.deserialize(json);
  ok('export/import round trip', s3 && Math.abs(s3.time - s2.time) < 1e-6 && Object.keys(s3.cities).length === Object.keys(s2.cities).length);
  const old = JSON.parse(json); delete old.calamities; delete old.airel; delete old.rivers; for (const c of Object.values(old.cities)) { delete c.taxPolicy; delete c.oases; }
  const s4 = G.deserialize(JSON.stringify(old));
  ok('older save migrates', s4 && Array.isArray(s4.calamities) && s4.rivers && Object.values(s4.cities).every(c => c.taxPolicy && c.oases));
  G.advance(s4, 600, 60);
  ok('migrated save runs', true);
  ok('garbage is rejected', G.deserialize(JSON.stringify({ hello: 1 })) === null);
}
console.log(fails ? fails + ' FAILED' : 'all endgame checks passed');
`);
