// Magic: mana, ley enclaves, schools, spells, wild magic, the Great Working. Run from the repo root: node tests/magic.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
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
if (water) { G.learnArcanum(s, 'p', 'f_rites', { free: true, path: true }); const r = G.castSpell(s, 'p', c.id, 'raiseland', { x: water.x, y: water.y }); ok('Raise the Land turns water to land', r === null && !G.isWater(water), r); ok('reshaping bumps the terrain revision', s.terrainRev >= 1); }
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
  // (the windfall is topped up right before each stage: a store above the city's mana cap does not survive a step)
  while (!s3.victory && guard++ < 60) { c3.res.mana = 1e6; const st = G.workingStatus(s3, 'p'); if (st.ok) G.beginWorkingStage(s3, 'p'); G.advance(s3, 1800, 60); }
  ok('the Great Working wins a conquest game', s3.victory === 'arcane', 'stage ' + (G.magicState(s3).working.p || {}).stage); }
// ---- mana is a flow: a cap per city, diminishing ley, a hoard bleeds back ----
{ const s5 = G.newGame({ name: 'T', race: 'veil' }); s5.settings.hostility = 0; s5.calamityAt = 1e12; s5.eventAt = 1e12; const c5 = G.capital(s5, 'p');
  c5.buildings.magetower = 0; c5.buildings.warehouse = 0; const cap0 = G.manaCap(s5, c5);
  c5.buildings.magetower = 5; const cap5 = G.manaCap(s5, c5); c5.buildings.warehouse = 10; const cap5w = G.manaCap(s5, c5);
  c5.buildings.magetower = 15; const cap15 = G.manaCap(s5, c5);
  ok('mana cap: small without a tower, grows with the Mage Tower and the Warehouse', cap0 > 0 && cap0 < 400 && cap5 > cap0 * 3 && cap5w > cap5 && cap15 > cap5w * 3, [cap0, cap5, cap5w, cap15].join(' < '));
  ok('…never above the city\\'s storage', G.manaCap(s5, c5) <= G.storageCap(s5, c5));
  ok('…a realm of tower-15 cities can hold a Great Working stage', (() => { c5.buildings.warehouse = 14; return G.manaCap(s5, c5) * 2 >= G.workingStageCost(3).mana; })());
  ok('ley returns diminish', G.leyEffective(1) > 0.7 && G.leyEffective(3) < 2 && G.leyEffective(3) > G.leyEffective(2) && G.leyEffective(2) > G.leyEffective(1));
  c5.buildings.magetower = 5; c5.buildings.warehouse = 4; const cap = G.manaCap(s5, c5);
  c5.res.mana = cap - 5; G.advance(s5, 1200, 120);
  ok('production stops at the cap (what the land gives beyond it is lost)', c5.res.mana <= cap + 0.5 && c5.res.mana >= cap - 5, Math.round(c5.res.mana) + ' / ' + cap);
  // a windfall mid-game past the cap is lost; an old save's hoard (loaded above the cap) bleeds back down
  c5.res.mana = cap + 500; G.advance(s5, 6, 1);
  ok('a windfall past the cap is lost at the next step', c5.res.mana <= cap + 0.5, Math.round(c5.res.mana) + ' / ' + cap);
  c5.res.mana = cap + 8000; const s8 = G.deserialize(G.serialize(s5)); const c8 = G.capital(s8, 'p');
  G.advance(s8, 60, 6); const a1 = c8.res.mana; G.advance(s8, 3600, 360); const a2 = c8.res.mana;
  ok('an old hoard above the cap bleeds back toward it', a1 > cap + 7000 && a2 < cap + 8000 * 0.3 && a2 >= cap, Math.round(a1) + ' -> ' + Math.round(a2) + ' (cap ' + cap + ')');
  ok('the Archmage notices full stores (and names the cap)', (() => { c5.res.mana = cap; G.councilDirty(s5); const i = G.councilAdvice(s5).find(x => /^archmage:mana:/.test(x.id)); return i && new RegExp(String(cap)).test(i.text); })());
}
// ---- the AI spends when its stores brim ----
{ const s6 = G.newGame({ name: 'T', race: 'hearth' }); s6.settings.hostility = 0; s6.calamityAt = 1e12; s6.eventAt = 1e12;
  const ai = Object.values(s6.empires).find(e => e.id !== 'p'); const c6 = G.capital(s6, ai.id);
  c6.buildings.magetower = 5; c6.buildings.townhall = 8; c6.buildings.market = 3;
  const econ = DATA.arcanaOrder.find(id => DATA.arcana[id].kind === 'spell' && DATA.arcana[id].circle === 0 && G.schoolAttuned(s6, ai.id, DATA.arcana[id].school) && DATA.arcana[id].spells.some(sp => DATA.spells[sp].ai === 'econ'));
  if (econ) G.learnArcanum(s6, ai.id, econ, { free: true, path: true });
  const capR = G.manaCapOf(s6, ai.id); c6.res.mana = G.manaCap(s6, c6); ai.gold = 100;
  const m0 = G.manaOf(s6, ai.id), cast0 = (G.magicState(s6).casts[ai.id] || {});
  const hook = G.aiHooks.find(h => /manaFill/.test(h.toString()) && /tagged/.test(h.toString()));
  for (let i = 0; i < 6; i++) hook(s6, ai, 1 / 6);
  ok('a brimming AI realm spends: it casts or sells the surplus', G.manaOf(s6, ai.id) < m0 * 0.9, Math.round(m0) + ' -> ' + Math.round(G.manaOf(s6, ai.id)) + ' (realm cap ' + capR + ')');
}
// ---- the hoard fix in a world: Veilborn stay the people of magic, but within their stores ----
{ const mul = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const rnd = Math.random; Math.random = mul(4242);
  const s7 = G.newGame({ name: 'T', race: 'hearth', rivals: 7 }); s7.settings.hostility = 0.85;
  G.advance(s7, 4 * 3600, 2400); Math.random = rnd;
  const ve = Object.values(s7.empires).find(e => e.race === 'veil' && !e.dead);
  const others = Object.values(s7.empires).filter(e => e.id !== 'p' && e.race !== 'veil' && !e.dead).map(e => G.manaOf(s7, e.id)).sort((a, b) => a - b);
  const med = others[others.length >> 1] || 1, vm = ve ? G.manaOf(s7, ve.id) : 0;
  console.log('  4h world: Veilborn mana ' + Math.round(vm) + ' (cap ' + (ve ? G.manaCapOf(s7, ve.id) : 0) + '), others ' + others.map(Math.round).join('/'));
  ok('Veilborn mana stays within its cap and within a few times the others\\' median', !ve || (vm <= G.manaCapOf(s7, ve.id) * 1.02 && vm <= Math.max(1500, med * 6)), Math.round(vm) + ' vs median ' + Math.round(med));
}
// save/load keeps magic state
G.save(s); const s4 = G.load(); G.advance(s4, 600, 60); ok('save/load with magic', s4 && s4.ley && s4.ley.nodes.length === s.ley.nodes.length);
console.log(fails ? fails + ' FAILED' : 'all magic checks passed');
`);
