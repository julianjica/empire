// Generals and army stances: recruiting, traits, leadership, stances, previews, fates, garrison stances, AI, saves, UI.
// Run from the repo root: node tests/generals.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const fakeEl = () => ({ value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
global.document = { getElementById: fakeEl, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: fakeEl(), documentElement: fakeEl(), createElement: fakeEl };
global.window = { scrollY: 0, scrollTo() {}, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
const files = ['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js','js/ui-core.js','js/ui-world.js','js/ui-generals.js'].filter(f => fs.existsSync(f));
eval(files.map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
if (typeof initRaces2 === 'function') initRaces2();
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined && x !== '' ? ' ' + x : '')); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const realRandom = Math.random;
const withRandom = (v, fn) => { G.GEN.rng = () => v; try { return fn(); } finally { G.GEN.rng = null; } };

const s = G.newGame({ name: 'T', race: 'hearth' }); s.settings.hostility = 0;
S = s;
const cap = G.capital(s, 'p'), emp = s.empires.p;
const tileOf = (terrain, pred) => s.tiles.find(t => t.terrain === terrain && !t.city && !t.camp && !t.oasis && !t.ruin && !t.minor && (!pred || pred(t)));
const plains = tileOf('plains') || tileOf('fertile'), forest = tileOf('forest'), hills = tileOf('hills');

// ---- recruiting and the cap ----
ok('a new game has no generals but the state exists', Array.isArray(emp.generals) && emp.generals.length === 0);
cap.buildings.barracks = 1; emp.gold = 5000;
ok('a Barracks of level 3 is needed', /Barracks/.test(G.canRecruitGeneral(s, 'p', cap.id) || ''));
cap.buildings.barracks = 3;
const pool = G.generalPool(s, 'p');
ok('three candidates with 1–2 known traits and a name', pool.list.length === 3 && pool.list.every(g => g.traits.length >= 1 && g.traits.length <= 2 && g.traits.every(t => DATA.generalTraits[t]) && / /.test(g.name)));
ok('sixteen traits, each described', Object.keys(DATA.generalTraits).length === 16 && Object.values(DATA.generalTraits).every(t => t.name && t.icon && t.desc && typeof t.fx === 'function'));
const cap0 = G.generalCap(s, 'p');
ok('cap = 1 + cities/3 + renown/800', cap0 === Math.min(8, 1 + Math.floor(G.citiesOf(s, 'p').length / 3) + Math.floor(G.renown(s, 'p') / 800)), cap0);
const gold0 = emp.gold, cost0 = G.generalCost(s, 'p').gold;
const cand = pool.list[1].name;
ok('recruit succeeds', G.recruitGeneral(s, 'p', cap.id, 1) === null);
const g1 = emp.generals[0];
ok('recruited the chosen candidate, at home in the city, for gold', g1 && g1.name === cand && g1.status === 'home' && g1.city === cap.id && emp.gold === gold0 - cost0);
ok('the next general costs more', G.generalCost(s, 'p').gold > cost0);
if (cap0 === 1) ok('the cap stops a second general', /keep 1 general/.test(G.canRecruitGeneral(s, 'p', cap.id) || ''));
emp.renownBonus = 800;
ok('renown raises the cap', G.generalCap(s, 'p') === cap0 + 1 && G.canRecruitGeneral(s, 'p', cap.id) === null);
emp.gold = 10;
ok('gold is needed', /gold/.test(G.canRecruitGeneral(s, 'p', cap.id) || ''));
emp.gold = 5000; emp.renownBonus = 0;
ok('portrait spec is a hero portrait with its own seed', (() => { const sp = G.generalSpec(s, 'p', g1); return sp.kind === 'hero' && /general:/.test(sp.seed) && typeof G.portraitHtml !== 'function' || /<svg/.test(G.portraitHtml(sp, 48)); })());

// a general made to order
const mk = (traits, level = 1) => { const g = { id: 'pgT' + Math.random().toString(36).slice(2), name: 'Test ' + traits.join('+'), race: 'hearth', seed: 'x', level, xp: 0, hp: 100, traits, status: 'home', city: cap.id, battles: 0, wins: 0 }; emp.generals.push(g); return g; };
const drop = g => { emp.generals = emp.generals.filter(x => x !== g); };
// a battle as the march (or preview) with these orders would fight it
const fight = (att, def, mode, t, orders, defOwner = null, defMult = 1, flat = 10) => G.withOrders(s, 'p', att, orders, () => G.battle(s, 'p', att, 1, defOwner, def, defMult, flat, { mode, x: t.x, y: t.y }));

// ---- leadership ----
const lv1 = mk([], 1), lv5 = mk([], 5), lv10 = mk([], 10);
ok('leadership +1.5% per level', near(G.generalLeadership(lv1), 1.015) && near(G.generalLeadership(lv5), 1.075) && near(G.generalLeadership(lv10), 1.15));
const army = { militia: 80, crossbow: 30 }, foes = { brigand: 120 };
const bNone = fight(army, foes, 'raid', plains, null), b1 = fight(army, foes, 'raid', plains, { general: lv1.id }), b5 = fight(army, foes, 'raid', plains, { general: lv5.id });
ok('a general raises the army\\'s strength, more with level', b1.A > bNone.A && b5.A > b1.A && near(b5.A / bNone.A, 1.075, 0.01), bNone.A + ' / ' + b1.A + ' / ' + b5.A);
ok('the general shows as a labelled modifier', b5.tactics.mods.some(m => m.kind === 'general' && m.side === 'att' && /level 5/.test(m.label) && m.pct >= 7 && m.pct <= 8) && b5.tactics.generals && b5.tactics.generals.att.name === lv5.name);
ok('no orders, no change (deterministic)', JSON.stringify(fight(army, foes, 'raid', plains, null)) === JSON.stringify(bNone));
[lv1, lv5, lv10].forEach(drop);

// ---- every trait ----
const T = DATA.generalTraits, R = DATA.battleRules;
const edge = (traits, units, side, f, mode, city) => G.generalEdge(s, 'p', { name: 'x', level: 1, traits }, units, side, f, mode, city);
const base = (units, side, f, mode, city) => edge([], units, side, f, mode, city);
const fP = G.battlefield(s, plains.x, plains.y), fF = forest && G.battlefield(s, forest.x, forest.y);
const ratio = (traits, units, side, f, mode, city) => edge(traits, units, side, f, mode, city).mult / base(units, side, f, mode, city).mult;
ok('Siegemaster: siege engines +25%, +4% at cities, walls', near(ratio(['siegemaster'], { ram_h: 10 }, 'att', fP, 'attack', null), 1.25) && near(ratio(['siegemaster'], { militia: 10 }, 'att', fP, 'attack', {}), 1.04) && near(ratio(['siegemaster'], { militia: 10 }, 'def', fP, 'attack', cap), 1.05));
ok('Horselord: cavalry +15% (defence +10%), pursuit +25%', near(ratio(['horselord'], { knight: 10 }, 'att', fP, 'raid'), 1.15) && near(ratio(['horselord'], { militia: 10 }, 'att', fP, 'raid'), 1) && near(ratio(['horselord'], { knight: 10 }, 'def', fP, 'raid'), 1.10) && edge(['horselord'], { knight: 1 }, 'att', fP).k.pursuit === 1.25);
ok('Shieldwall: infantry defence +15%, fewer losses attacking', near(ratio(['shieldwall'], { militia: 10 }, 'def', fP), 1.15) && near(edge(['shieldwall'], { militia: 10 }, 'att', fP).k.loss, 0.8));
ok('Hawkeye: ranged +15%, volley +25%', near(ratio(['hawkeye'], { crossbow: 10 }, 'att', fP), 1.15) && edge(['hawkeye'], { crossbow: 1 }, 'att', fP).k.volley === 1.25);
ok('Swift: marches 20% faster', near(G.marchFactor(s, 'p', { general: mk(['swift']).id }), 1.2));
ok('Ambusher: +12% in forests and hills only', (!fF || near(ratio(['ambusher'], { militia: 10 }, 'att', fF), 1.12)) && (!hills || near(ratio(['ambusher'], { militia: 10 }, 'def', G.battlefield(s, hills.x, hills.y)), 1.12)) && near(ratio(['ambusher'], { militia: 10 }, 'att', fP), 1));
ok('Cautious: fewer losses, halves the foe\\'s pursuit, withdraws', (() => { const e = edge(['cautious'], { militia: 10 }, 'att', fP); return e.k.loss === 0.92 && e.k.cap === 0.85 && e.foe.pursuit === 0.5; })());
ok('Reckless: +12% attack, +15% own losses, double death risk', near(ratio(['reckless'], { militia: 10 }, 'att', fP), 1.12) && edge(['reckless'], { militia: 10 }, 'att', fP).k.loss === 1.15
  && near(G.generalFateOdds({ traits: ['reckless'] }, 0.5, false).death, 2 * G.generalFateOdds({ traits: [] }, 0.5, false).death));
ok('Veteran trainer: troops train 10% faster where he is stationed, +3%', (() => { const keep = emp.generals; emp.generals = [];   // alone at home, so he is the one in command
  const before = G.mod(s, 'p', cap, 'trainTime'); const g = mk(['drillmaster']); const after = G.mod(s, 'p', cap, 'trainTime'); drop(g); emp.generals = keep; return near(after / before, 0.9) && near(ratio(['drillmaster'], { militia: 1 }, 'att', fP), 1.03); })());
ok('Warden: +10% garrison defence', near(ratio(['warden'], { militia: 10 }, 'def', fP), 1.10) && near(ratio(['warden'], { militia: 10 }, 'att', fP), 1));
ok('Raider: +5% on raids', near(ratio(['raider'], { militia: 10 }, 'att', fP, 'raid'), 1.05) && near(ratio(['raider'], { militia: 10 }, 'att', fP, 'attack'), 1));
ok('Tactician: leadership counts half again', near(G.generalLeadership({ level: 4, traits: ['tactician'] }), 1 + 0.015 * 4 * 1.5));
ok('Lucky: half the odds', (() => { const a = G.generalFateOdds({ traits: ['lucky'] }, 0.6, true), b = G.generalFateOdds({ traits: [] }, 0.6, true); return near(a.death, b.death / 2) && near(a.capture, b.capture / 2); })());
ok('Riverwise: no penalty crossing rivers', (() => { const f = { ...fP, crossing: true, naval: false, season: 1 }; return near(ratio(['riverwise'], { militia: 10 }, 'att', f), 1 - R.river) && near(ratio(['riverwise'], { militia: 10 }, 'att', fP), 1); })());
ok('Beloved: 15% less war weariness', (() => { const keep = emp.generals; emp.generals = []; const b0 = G.traditionFx(emp, 'weary'); const g = mk(['beloved']); const b1 = G.traditionFx(emp, 'weary'); drop(g); emp.generals = keep; return near(b1 / b0, 0.85); })());
emp.generals = emp.generals.filter(g => g === g1);

// ---- stances: bounded and visible ----
const B = G.GEN.bounds;
let bounded = true, note = '';
for (const [side, table] of [['att', DATA.stances], ['def', DATA.garrisonStances]]) for (const key of Object.keys(table)) for (const units of [{ militia: 50 }, { knight: 50 }, { crossbow: 50 }, { ram_h: 5, militia: 20 }]) for (const city of [null, cap]) {
  const e = G.stanceEdge(s, 'p', key, units, side, city);
  if (e.mult < 0.9 - 1e-9 || e.mult > 1.1 + 1e-9) { bounded = false; note = key + ' mult ' + e.mult; }
  for (const k of ['loss', 'foeLoss', 'volley', 'pursuit']) if (e.k[k] !== undefined && (e.k[k] < B[k][0] || e.k[k] > B[k][1])) { bounded = false; note = key + ' ' + k; }
}
ok('every stance within ±10% attack/defence and casualty bounds', bounded, note);
ok('five army stances, four garrison orders', DATA.stanceOrder.length === 5 && DATA.garrisonStanceOrder.length === 4);
const mix = { militia: 60, knight: 20, crossbow: 30 }, mid = { brigand: 140 };
const st = {};
for (const k of DATA.stanceOrder) st[k] = fight(mix, mid, 'raid', plains, { stance: k });
ok('stances named in the tactics', DATA.stanceOrder.every(k => k === 'balanced' ? !st[k].tactics.stances : st[k].tactics.stances && st[k].tactics.stances.att.key === k));
ok('non-default stances show as labelled modifiers', ['aggressive', 'defensive', 'skirmish', 'siege'].every(k => st[k].tactics.mods.some(m => m.kind === 'stance' && m.side === 'att')));
ok('Aggressive: stronger, bloodier on both sides', st.aggressive.A > st.balanced.A && G.unitsCount(st.aggressive.defLost) >= G.unitsCount(st.balanced.defLost) && st.aggressive.attLoss > st.balanced.attLoss * 1.1, st.aggressive.attLoss.toFixed(3) + ' vs ' + st.balanced.attLoss.toFixed(3));
ok('Defensive: fewer own losses, no pursuit', st.defensive.attLoss < st.balanced.attLoss && G.unitsCount(st.defensive.tactics.phases[2].defLost) === 0);
ok('Skirmish: both sides lose about half as much', st.skirmish.attLoss < st.balanced.attLoss * 0.7 && st.skirmish.defLoss < st.balanced.defLoss * 0.7);
const sk = fight({ militia: 20 }, { brigand: 300 }, 'attack', plains, { stance: 'skirmish' }), bl = fight({ militia: 20 }, { brigand: 300 }, 'attack', plains, { stance: 'balanced' });
ok('Skirmish: a beaten army withdraws instead of being wiped out', !sk.win && sk.attLoss <= 0.5 && bl.attLoss === 1 && G.unitsCount(sk.attLeft) > 0);
const dfw = fight({ militia: 20 }, { brigand: 300 }, 'attack', plains, { stance: 'defensive' });
ok('Defensive: a beaten army keeps 30%', dfw.attLoss <= 0.7 + 1e-9);
ok('Siege: −5% in the field, +6% against cities', st.siege.A < st.balanced.A && G.stanceEdge(s, 'p', 'siege', mix, 'att', cap).mult === 1.06);
ok('Siege: marches 20% slower; Skirmish refuses conquests', near(G.marchFactor(s, 'p', { stance: 'siege' }), 0.8) && /skirmish/i.test(G.sendArmyWith(s, cap.id, plains.x, plains.y, 'conquer', { militia: 1 }, undefined, { stance: 'skirmish' }) || ''));
let phasesOk = true;
for (const k of DATA.stanceOrder) for (const [side, lost] of [['att', st[k].attLost], ['def', st[k].defLost]]) for (const u of Object.keys(lost)) {
  const sum = st[k].tactics.phases.reduce((a, p) => a + ((side === 'att' ? p.attLost : p.defLost)[u] || 0), 0);
  if (sum !== lost[u]) phasesOk = false;
}
ok('phases still add up under every stance', phasesOk);
ok('battles without generals.js orders are unchanged (no k, no stances)', !G.battle(s, 'p', mix, 1, null, mid, 1, 10, { mode: 'raid', x: plains.x, y: plains.y }).tactics.stances);

// ---- preview equals resolution (general + stance, against a camp) ----
const camp = Object.values(s.camps).filter(c => G.landReachable(s, cap, c)).sort((a, b) => G.dist(a, cap) - G.dist(b, cap))[0];
const ct = G.tileAt(s, camp.x, camp.y);
cap.units = { knight: 30, crossbow: 30, militia: 60 };
camp.units = { brigand: 90 };
s.intel[G.tileIdx(s, ct)] = { t: s.time, units: { ...camp.units } };
const sendArmy = { knight: 30, crossbow: 30, militia: 60 };
const orders = { general: g1.id, stance: 'aggressive' };
const pv = G.previewWith(s, cap, ct, sendArmy, 'raid', orders);
const plan = G.planMarch(s, 'p', cap, ct, sendArmy);
const err = G.sendArmyWith(s, cap.id, ct.x, ct.y, 'raid', sendArmy, undefined, orders);
const mv = s.moves.find(m => m.type === 'raid' && m.owner === 'p');
ok('raid sent with general and stance', !err && mv && mv.general === g1.id && mv.stance === 'aggressive' && g1.status === 'marching', err);
ok('the general cannot be sent twice', /in the field/.test(G.sendArmyWith(s, cap.id, ct.x, ct.y, 'raid', { militia: 1 }, undefined, { general: g1.id }) || ''));
ok('the preview shows the general and stance', pv.tactics.generals && pv.tactics.generals.att.id === g1.id && pv.tactics.stances.att.key === 'aggressive');
camp.units = { ...s.intel[G.tileIdx(s, ct)].units };
withRandom(0.99, () => { mv.arrive = s.time + 1; G.advance(s, 2, 4); });
const rep = s.reports.find(r => r.body && r.body.attSent && r.body.tactics);
ok('preview equals resolution', !!rep && pv.A === rep.body.A && pv.D === rep.body.D && JSON.stringify(pv.attLost) === JSON.stringify(rep.body.attLost) && JSON.stringify(pv.defLost) === JSON.stringify(rep.body.defLost), pv.A + '/' + pv.D + ' vs ' + (rep && rep.body.A) + '/' + (rep && rep.body.D));
ok('the report names the general, his traits and fate, and the stance', rep && rep.body.generals && rep.body.generals.att.name === g1.name && rep.body.generals.att.fate && rep.body.tactics.stances.att.key === 'aggressive');
const back = s.moves.find(m => m.type === 'return' && m.owner === 'p');
ok('the general rides home with the survivors', back && back.general === g1.id && g1.move === back.id && g1.status === 'marching');
ok('he gained experience', g1.xp > 0 || g1.level > 1);
if (back) { back.arrive = s.time + 1; G.advance(s, 2, 4); }
ok('home again, in the city', g1.status === 'home' && g1.city === cap.id && !s.moves.some(m => m.general === g1.id));
let html = '', threw = '';
try { html = reportBody(rep); } catch (e) { threw = e.message; }
ok('report renders the general and the stance', !threw && html.includes(g1.name) && /Stance/.test(html) && /Aggressive/.test(html), threw);

// ---- in a real assault: Siege and Siegemaster break more wall, Siege halves the plunder; Raider and Forager carry more ----
{
  const tgt = G.capital(s, 'a2'), tt = G.tileAt(s, tgt.x, tgt.y);
  const sm = mk(['siegemaster']);
  const assault = (orders, mode = 'attack', units = { ram_h: 8, militia: 150 }, gen = sm) => {
    tgt.buildings.wall = 4; tgt.units = { militia: 5 }; tgt.loyalty = 100;
    for (const g of ['grain', 'timber', 'stone', 'ore']) tgt.res[g] = 20000;
    cap.units = { ...units }; gen.status = 'home'; gen.city = cap.id; gen.hp = 100; s.reports = [];
    const e = orders ? G.sendArmyWith(s, cap.id, tt.x, tt.y, mode, units, undefined, orders) : G.sendArmy(s, cap.id, tt.x, tt.y, mode, units);
    const m = s.moves.find(x => x.owner === 'p' && x.type === mode);
    if (e || !m) return { err: e || 'no march' };
    m.arrive = s.time + 1;
    withRandom(0.99, () => G.advance(s, 2, 4));
    const r = s.reports.find(x => x.body && x.body.attSent);
    s.moves = s.moves.filter(x => x.owner !== 'p');
    const neg = r && (r.body.extra || '').match(/negated ([\\d.]+) wall/);
    const loot = r ? Object.values(r.body.loot || {}).reduce((a, b) => a + b, 0) : 0, left = r ? G.unitsCount(r.body.attSent) - G.unitsCount(r.body.attLost) : 0;
    return { r, neg: neg ? +neg[1] : 0, loot, perHead: left ? loot / left : 0 };
  };
  const plainA = assault(null), siegeA = assault({ stance: 'siege', general: sm.id });
  ok('Siege stance and a Siegemaster break more wall in a real assault', plainA.neg > 0 && near(siegeA.neg, Math.min(4, plainA.neg * 1.5 * 1.4), 0.051), plainA.err || siegeA.err || plainA.neg + ' → ' + siegeA.neg);
  ok('Siege halves the plunder', plainA.loot > 0 && Math.abs(siegeA.loot / plainA.loot - 0.5) < 0.03, plainA.loot + ' → ' + siegeA.loot);
  drop(sm);
  const rd = mk(['raider']);
  const pg = mk([]); const plainR = assault({ general: pg.id }, 'raid', { militia: 40 }, pg), raidR = assault({ general: rd.id }, 'raid', { militia: 40 }, rd); drop(pg);
  ok('Raider carries a quarter more plunder on raids (vs a plain general)', plainR.perHead > 0 && Math.abs(raidR.perHead / plainR.perHead - 1.25) < 0.03, plainR.perHead.toFixed(1) + ' → ' + raidR.perHead.toFixed(1));
  drop(rd);
  const fo = mk(['forager']); fo.city = cap.id;
  cap.units = { militia: 60 };
  G._modCache = null; const u0 = G.mod(s, 'p', cap, 'upkeep');
  G.sendArmyWith(s, cap.id, tt.x, tt.y, 'raid', { militia: 30 }, undefined, { general: fo.id });
  const fm = s.moves.find(x => x.general === fo.id);
  G._modCache = null; const u1 = G.mod(s, 'p', cap, 'upkeep');
  ok('Forager: the rations of his army come off the home city bill while it marches', fm && near(u1 / u0, 0.5, 0.01), u0 + ' → ' + u1);
  const raidF = (() => { fm.arrive = s.time + 1; for (const g of ['grain', 'timber', 'stone', 'ore']) tgt.res[g] = 20000; tgt.units = { militia: 5 }; s.reports = []; withRandom(0.99, () => G.advance(s, 2, 4)); const r = s.reports.find(x => x.body && x.body.attSent); return r ? Object.values(r.body.loot).reduce((a, b) => a + b, 0) : 0; })();
  const pf = mk([]); const plainF = assault({ general: pf.id }, 'raid', { militia: 30 }, pf).loot; drop(pf);
  ok('Forager carries 15% more plunder', plainF > 0 && Math.abs(raidF / plainF - 1.15) < 0.03, plainF + ' → ' + raidF);
  s.moves = s.moves.filter(x => x.owner !== 'p'); drop(fo);
  G._modCache = null;
  ok('… and the bill is back to normal once he is home', near(G.mod(s, 'p', cap, 'upkeep'), u0));
  // a city taken with orders in force: the stance does not pass to the conqueror
  tgt.garStance = 'evacuate'; tgt.garAI = true;
  const before = tgt.owner; tgt.loyalty = 1;
  cap.units = { militia: 150, herald: 1 }; tgt.units = { militia: 2 };
  G.sendArmy(s, cap.id, tt.x, tt.y, 'conquer', { militia: 150, herald: 1 });
  const cm = s.moves.find(x => x.owner === 'p' && x.type === 'conquer'); if (cm) { cm.arrive = s.time + 1; G.advance(s, 2, 4); }
  ok('a conquered city drops its garrison orders', tgt.owner === 'p' && !tgt.garStance && !tgt.garAI, before + '→' + tgt.owner);
  cap.units = { militia: 40 };
}

// ---- march speed ----
cap.units = { militia: 40 };
const sw = mk(['swift']); sw.city = cap.id;
const pl = G.planMarch(s, 'p', cap, ct, { militia: 10 });
G.sendArmyWith(s, cap.id, ct.x, ct.y, 'raid', { militia: 10 }, undefined, { general: sw.id, stance: 'siege' });
const mvs = s.moves[s.moves.length - 1];
ok('Swift and Siege change the march time', mvs.general === sw.id && Math.abs((mvs.arrive - mvs.depart) - Math.round(pl.dur / (1.2 * 0.8))) <= 1, (mvs.arrive - mvs.depart) + ' vs ' + pl.dur);
s.moves = s.moves.filter(m => m !== mvs); sw.status = 'home'; sw.city = cap.id; cap.units.militia += 10; drop(sw);

// ---- fates: wounds, capture, death ----
const o0 = G.generalFateOdds({ traits: [] }, 0.3, false), oW = G.generalFateOdds({ traits: [] }, 1, true);
ok('death is rare in a won battle; capture only when the army falls', o0.death < 0.01 && o0.capture === 0 && o0.wound > 0.2 && oW.capture === 0.5 && oW.death === 0.15);
const wipeOut = (rnd) => {
  const g = mk([]); g.city = cap.id; cap.units = { militia: 5 };
  camp.units = { brigand: 500 }; s.camps[camp.id] = camp; ct.camp = camp.id;
  const e = G.sendArmyWith(s, cap.id, ct.x, ct.y, 'attack', { militia: 5 }, undefined, { general: g.id });
  if (e) console.log('  send failed:', e);
  const m = s.moves.find(x => x.general === g.id); if (m) m.arrive = s.time + 1;
  withRandom(rnd, () => G.advance(s, 2, 4));
  return g;
};
const gk = wipeOut(0.05);
ok('a wiped-out army\\'s general may fall', gk.status === 'dead' && !emp.generals.includes(gk) && emp.fallenGenerals[0].name === gk.name);
const gc = wipeOut(0.4);
ok('… or be captured', gc.status === 'captured' && gc.releaseAt > s.time && emp.generals.includes(gc));
const ge = wipeOut(0.9);
ok('… or escape home wounded', ge.status === 'home' && ge.city === cap.id && ge.hp < 100);
emp.gold = 5000;
ok('a captive can be ransomed', G.ransomGeneral(s, 'p', gc.id) === null && gc.status === 'home');
const gx = wipeOut(0.4);
s.time = gx.releaseAt + 1; G.advance(s, 12, 2);
ok('captives are exchanged in time', gx.status === 'home');
ok('wounds heal at home', (() => { ge.hp = 30; G.advance(s, 3600, 400); return ge.hp > 30; })());
ok('a wounded general cannot march', (() => { ge.hp = 10; return /wounded/.test(G.generalAvailable(s, 'p', ge.id, cap.id) || ''); })());
emp.generals = emp.generals.filter(g => g === g1);
// statistics over many rolls
let dead = 0, capd = 0, N = 2000;
const od = G.generalFateOdds({ traits: [] }, 1, true);
for (let i = 0; i < N; i++) { const x = realRandom(); if (x < od.death) dead++; else if (x < od.death + od.capture) capd++; }
ok('wiped-army odds (15% death, 50% capture) hold statistically', Math.abs(dead / N - 0.15) < 0.04 && Math.abs(capd / N - 0.5) < 0.05);

// ---- garrison stances and commanders ----
const ai = G.capital(s, 'a1'), at = G.tileAt(s, ai.x, ai.y);
ai.buildings.wall = 0; ai.units = { militia: 60, crossbow: 20 };
const gb = (units) => G.battle(s, 'p', units, 1, 'a1', ai.units, 1, 20, { mode: 'raid', x: ai.x, y: ai.y });
const strong = { knight: 40, militia: 60 }, weak = { militia: 15 };
const gs = {};
for (const k of DATA.garrisonStanceOrder) { G.setGarrisonStance(s, ai.id, k); gs[k] = { s: gb(strong), w: gb(weak) }; }
G.setGarrisonStance(s, ai.id, 'standing');
ok('garrison stances named in tactics', ['hold', 'sally', 'evacuate'].every(k => gs[k].s.tactics.stances.def.key === k));
ok('Hold the walls: stronger, fewer losses, no chase', gs.hold.s.D > gs.standing.s.D && gs.hold.s.defLoss < gs.standing.s.defLoss && G.unitsCount(gs.hold.w.tactics.phases[2].attLost) === 0);
ok('Sally out: weaker walls, but the repulsed lose more', gs.sally.s.D < gs.standing.s.D && gs.sally.w.attLoss > gs.standing.w.attLoss);
ok('Evacuate stores: weaker, but more of the stores hidden and less produced', gs.evacuate.s.D < gs.standing.s.D && (() => {
  const p0 = G.econ(s, ai).protect, r0 = G.mod(s, 'a1', ai, 'grain'); G.setGarrisonStance(s, ai.id, 'evacuate'); G._modCache = null;
  const p1 = G.econ(s, ai).protect, r1 = G.mod(s, 'a1', ai, 'grain'); G.setGarrisonStance(s, ai.id, 'standing'); return p1 > p0 && r1 < r0; })());
const aiG = { id: 'a1gT', name: 'Warden Test', race: s.empires.a1.race, seed: 'w', level: 3, xp: 0, hp: 100, traits: ['warden'], status: 'home', city: ai.id, battles: 0, wins: 0 };
G.ensureGenerals(s); s.empires.a1.generals = s.empires.a1.generals.filter(g => g.city !== ai.id || g.status !== 'home');   // the AI may have stationed its own general there
const base0 = gb(strong);   // the same garrison with no commander at all
s.empires.a1.generals.push(aiG);
const wd = gb(strong);
ok('a commander lends his level and defensive traits to the garrison', G.commanderOf(s, ai) === aiG && wd.D > base0.D * 1.1 && wd.tactics.generals.def.name === aiG.name, [G.commanderOf(s, ai) && G.commanderOf(s, ai).id, Math.round(wd.D), Math.round(base0.D)].join(' '));
ok('the preview of a scouted city shows its commander', (() => { s.intel[G.tileIdx(s, at)] = { t: s.time, units: { ...ai.units }, wall: 0, th: G.lvl(ai, 'townhall') };
  const p = G.previewWith(s, cap, at, { militia: 10 }, 'raid', { stance: 'skirmish' }); return p.known && p.tactics.generals && p.tactics.generals.def.id === aiG.id && p.tactics.stances.att.key === 'skirmish'; })());
s.empires.a1.generals = [];

// ---- old saves, save/load ----
G.setGarrisonStance(s, cap.id, 'hold');
G.save(s); const s2 = G.load();
ok('save/load keeps generals and garrison stances', s2 && s2.empires.p.generals.length === emp.generals.length && s2.empires.p.generals[0].name === g1.name && s2.cities[cap.id].garStance === 'hold');
const raw = JSON.parse(G.serialize(s));
for (const e of Object.values(raw.empires)) { delete e.generals; delete e.fallenGenerals; delete e.genSeq; delete e.genPool; }
for (const c of Object.values(raw.cities)) delete c.garStance;
const s3 = G.deserialize(JSON.stringify(raw));
ok('an old save loads with empty generals', s3 && Object.values(s3.empires).every(e => Array.isArray(e.generals) && e.generals.length === 0));
let oldOk = true; try { G.advance(s3, 600, 60); } catch (e) { oldOk = e.message; }
ok('an old save runs', oldOk === true, oldOk);
G.setGarrisonStance(s, cap.id, 'standing');

// ---- UI pieces render ----
let mil = '', mv2 = '', realm = ''; threw = '';
try { mil = MILITARY_EXTRAS.map(f => f(cap)).join(''); realm = REALM_EXTRAS.map(f => f(s.empires.a1)).join(''); mv2 = MOVE_EXTRAS.map(f => f({ owner: 'p', general: g1.id, stance: 'siege' })).join(''); } catch (e) { threw = e.message; }
ok('Military tab card renders generals, candidates and garrison orders', !threw && /Generals/.test(mil) && mil.includes(g1.name) && /Hold the walls/.test(mil), threw);
ok('Movements show the general and stance', mv2.includes(g1.name) && /Siege/.test(mv2));
let sf = ''; threw = '';
try { UI.mode = 'raid'; UI.form.stance = 'skirmish'; UI.form.sendGeneral = g1.id; UI.form.send_militia = 10; cap.units = { militia: 40 }; sf = sendForm(cap, ct, ['raid', 'attack']); } catch (e) { threw = e.stack; }
ok('send form offers the general and stance pickers with the preview', !threw && sf.includes(g1.name) && /data-act="stance"/.test(sf) && /Skirmish stance/.test(sf), threw);
for (const k of Object.keys(UI.form)) delete UI.form[k];

// ---- the AI over a few hours ----
const w = G.newGame({ name: 'T', race: 'hearth' });
const seen = { stances: {}, generals: 0, garrison: {} };
const baseResolve = G.resolveMove;
G.resolveMove = (st, m) => { if (m.owner !== 'p' && ['raid', 'attack', 'conquer'].includes(m.type)) { seen.stances[m.stance || 'balanced'] = (seen.stances[m.stance || 'balanced'] || 0) + 1; if (m.general) seen.generals++; } return baseResolve(st, m); };
for (let h = 0; h < 8; h++) { G.advance(w, 3600, 600); for (const c of Object.values(w.cities)) if (c.owner !== 'p' && c.garStance) seen.garrison[c.garStance] = 1; }
G.resolveMove = baseResolve;
const aiGens = Object.values(w.empires).filter(e => e.id !== 'p').reduce((a, e) => a + e.generals.length + e.fallenGenerals.length, 0);
console.log('  AI over 8h: generals', aiGens, 'marches led', seen.generals, 'stances', JSON.stringify(seen.stances), 'garrison', Object.keys(seen.garrison).join(','));
ok('AI realms appoint generals', aiGens > 0);
ok('AI generals lead marches', seen.generals > 0);
ok('AI picks stances other than Balanced', Object.keys(seen.stances).some(k => k !== 'balanced'));
ok('AI generals stay within the cap', Object.values(w.empires).every(e => e.generals.length <= G.generalCap(w, e.id)));

console.log(fails ? fails + ' FAILED' : 'all generals tests passed');
`);
