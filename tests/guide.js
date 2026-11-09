// The Guide (js/tutorial.js), headless: a fast-forwarded playthrough that opens and finishes every stage,
// cheap triggers, old saves, and the stage list.  node tests/guide.js
// A scripted player meets each stage's checklist through the game's own APIs (with goods and levels
// handed out to skip the waiting), forces the situations that open the situation stages (a shortage,
// a rival, a monster, an army marching on us, a road...) and checks that no stage gets stuck.
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const classes = () => { const set = new Set(); return { add: (...c) => c.forEach(x => set.add(x)), remove: (...c) => c.forEach(x => set.delete(x)), toggle: (c, on) => { if (on === undefined ? !set.has(c) : on) set.add(c); else set.delete(c); }, contains: c => set.has(c) }; };
const fakeEl = () => ({ value: '', innerHTML: '', style: {}, dataset: {}, classList: classes(), setAttribute() {}, removeAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, bottom: 0, right: 0 }), getClientRects: () => [], closest: () => null, isConnected: false, focus() {}, append() {}, prepend() {}, remove() {}, insertBefore() {}, getContext: () => null, children: [], childNodes: [] });
global.document = { getElementById: fakeEl, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, body: fakeEl(), documentElement: fakeEl(), createElement: fakeEl, createElementNS: fakeEl, createTextNode: fakeEl, head: fakeEl(), hidden: false };
global.window = { scrollY: 0, scrollTo() {}, scrollBy() {}, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), innerWidth: 1280, innerHeight: 800 };
global.innerWidth = 1280; global.innerHeight = 800;
global.navigator = { userAgent: 'node' };
global.requestAnimationFrame = () => 0;
// the guide re-checks itself on timers; here the test drives it instead (and node must be able to exit)
global.setInterval = () => 0; global.clearInterval = () => {};
global.setTimeout = () => 0; global.clearTimeout = () => {};
const skip = /worldmap|cityview|cityart|audio|ui-boot/;
const files = fs.readFileSync('index.html', 'utf8').match(/js\/[a-z0-9-]+\.js/g).filter(f => !skip.test(f) && fs.existsSync(f));
eval(files.map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
let fails = 0;
const ECTut = window.ECTut;
const ok = (name, cond, extra) => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' ' + extra : '')); };
const newGame = () => {
  const s = G.newGame({ name: 'T', race: 'hearth' });
  s.settings.hostility = 0; s.calamityAt = 1e12; s.eventAt = 1e12; G.aiPressure = () => 0;
  return s;
};
const ids = ECTut.STAGES.map(st => st.id);
const NEW = ['transfer', 'roads', 'intercept', 'grimoire', 'magi', 'slots'];
const OLD18 = ['welcome', 'economy', 'shortage', 'omen', 'queue', 'troops', 'scouting', 'research', 'expansion', 'network', 'rival', 'monster', 'culture', 'council', 'faith', 'generals', 'magic', 'wrap'];
ok('every stage id is unique', new Set(ids).size === ids.length);
ok('the old stage ids are all still there (saves keep working)', OLD18.every(id => ids.includes(id)), OLD18.filter(id => !ids.includes(id)).join(','));
ok('the new stages exist', NEW.every(id => ids.includes(id)), NEW.filter(id => !ids.includes(id)).join(','));
ok('the new stages are situation stages (they never lengthen the core path)', NEW.every(id => typeof ECTut.STAGES.find(s => s.id === id).when === 'function'));
ok('every stage after the first names a stage that exists', ECTut.STAGES.every(st => !st.after || ids.includes(st.after)));
ok('every stage with goals pays a small reward', ECTut.STAGES.every(st => !(st.goals || []).length || st.reward));

// ---- a fresh game: none of the new situations has happened ----
S = newGame(); UI.city = G.capital(S, 'p').id; UI.tab = 'city';
ECTut.refresh();
const tut = () => S.tutorial;
const byId = id => ECTut.STAGES.find(s => s.id === id);
const whenNow = id => { try { return !!byId(id).when(curCity()); } catch (e) { return 'threw: ' + e.message; } };
ok('in a fresh game none of the new triggers fire', NEW.every(id => whenNow(id) === false), NEW.map(id => id + ':' + whenNow(id)).join(' '));
ok('the first stage is the welcome', ECTut.current() && ECTut.current().id === 'welcome');

// ---- trigger cost: refresh (which evaluates every trigger) stays cheap in a busy mid-game world ----
{ const s = newGame(); s.settings.hostility = 0.85; G.advance(s, 2 * 3600, 2 * 600);
  const keep = S; S = s; UI.city = G.capital(s, 'p').id;
  ECTut.refresh();
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 200; i++) ECTut.refresh(); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
  ok('a guide refresh in a 2-hour world takes under 2 ms', ms < 2, ms.toFixed(3) + ' ms');
  S = keep; UI.city = G.capital(S, 'p').id; }

// ---- the playthrough ----
const cap = () => G.capital(S, 'p');
const rich = c => { const cp = G.storageCap(S, c); for (const g of Object.keys(c.res)) if (DATA.goods[g]) c.res[g] = Math.max(c.res[g], cp * 0.9); S.empires.p.gold = Math.max(S.empires.p.gold, 50000); c.res.mana = Math.max(c.res.mana || 0, 5000); };
const lift = (c, b, L) => { c.buildings[b] = Math.max(c.buildings[b] || 0, L); };
const visit = tab => { UI.tab = tab; ECTut.refresh(); UI.tab = 'city'; };
const second = () => G.citiesOf(S, 'p').find(c => c !== cap());
const openTile = (from, lo, hi) => G.freeTile(S, x => G.dist(x, from) >= lo && G.dist(x, from) <= hi && G.landReachable(S, from, x) && Object.values(S.cities).every(o => G.dist(o, x) >= 2.8));
const forced = {};
const force = {
  shortage: () => { const c = cap(); c.short = { ...(c.short || {}), timber: true }; },
  omen: () => { S.crisisOmen = S.crisisOmen || { t: S.time, test: 1 }; },
  rival: () => { for (const c of Object.values(S.cities)) if (c.owner !== 'p') { S.explored[c.y * S.map + c.x] = 1; break; } },
  monster: () => { const c = cap(); const t = G.freeTile(S, x => G.dist(x, c) >= 1 && G.dist(x, c) <= 2 && !G.isWater(x)); if (t) G.spawnMonster(S, 'aurochs', t); },
  culture: () => { S.empires.p.culture = Math.max(S.empires.p.culture || 0, 2000); },
  council: () => {},
  faith: () => { lift(cap(), 'temple', 1); },
  generals: () => { lift(cap(), 'barracks', 3); },
  magic: () => { lift(cap(), 'townhall', 4); lift(cap(), 'academy', 1); lift(cap(), 'magetower', 1); },
  grimoire: () => { lift(cap(), 'magetower', 1); },
  magi: () => { lift(cap(), 'magetower', 1); },
  expansion: () => { lift(cap(), 'townhall', 4); },
  network: () => { if (G.citiesOf(S, 'p').length < 2) { const t = openTile(cap(), 3, 6); G.foundCity(S, 'p', t.x, t.y, 'Second'); } },
  transfer: () => force.network(),
  slots: () => { force.network(); for (const c of G.citiesOf(S, 'p').slice(0, 2)) { lift(c, 'townhall', 3); lift(c, 'academy', 3); } },
  roads: () => { const c = cap(); const t = openTile(c, 1, 2) || G.tileAt(S, c.x + 1, c.y); const i = t.y * S.map + t.x; S.explored[i] = 1; S.roads.lvl[i] = 1; S.roads.wear[i] = Math.max(S.roads.wear[i] || 0, 30); S.roads.used[i] = S.time; S.roads.rev = (S.roads.rev || 0) + 1; },
  intercept: () => {
    const c = cap(); const ai = Object.values(S.cities).filter(x => x.owner !== 'p').sort((a, b) => G.dist(a, c) - G.dist(b, c))[0];
    const u = DATA.races[S.empires[ai.owner].race].units[0]; ai.units[u] = (ai.units[u] || 0) + 30; ai.res.grain = 1e5;
    const err = G.sendArmy(S, ai.id, c.x, c.y, 'raid', { [u]: 20 });
    if (err) { const m = { id: G.newId(S, 'm'), owner: ai.owner, type: 'raid', from: ai.id, fx: ai.x, fy: ai.y, x: c.x, y: c.y, units: { [u]: 20 }, cargo: {}, depart: S.time, arrive: S.time + 1800 }; S.moves.push(m); }
  },
};
const solve = {
  welcome: () => act.tutGotIt(),
  economy: () => { tut().seenTip = 1; const c = cap(); rich(c); for (const b of ['farm', 'lumber', 'houses']) if (G.lvl(c, b) < 2) lift(c, b, 2); },
  shortage: () => { visit('ledger'); },
  omen: () => { act.tutGotIt(); delete S.crisisOmen; },
  queue: () => { const c = cap(); rich(c); lift(c, 'townhall', 2); let n = 0; for (const b of DATA.buildingOrder) { if (c.buildQueue.length >= 3 || n++ > 40) break; if (G.buildStatus(S, c, b).ok) G.queueBuild(S, c.id, b); } },
  troops: () => { const c = cap(); lift(c, 'townhall', 2); lift(c, 'barracks', 1); c.units.militia = Math.max(c.units.militia || 0, 12); S.empires.p.wins = Math.max(S.empires.p.wins || 0, 1); },
  scouting: () => { const c = cap(); c.units.scout = Math.max(c.units.scout || 0, 3); G.setAutoExplore(S, c.id, true); S.stats.adventures = Math.max(S.stats.adventures || 0, 1); },
  research: () => { const c = cap(); rich(c); lift(c, 'townhall', 3); lift(c, 'academy', 1); const R = G.research(S, 'p'); if (!R.studies.length) { const id = G.techList(S, 'p').find(k => G.techStatus(S, c.id, k).ok); if (id) G.startResearch(S, c.id, id); } },
  expansion: () => { const c = cap(); const t = openTile(c, 4, 7); UI.tab = 'world'; UI.sel = { x: t.x, y: t.y }; ECTut.refresh(); UI.tab = 'city'; UI.sel = null; lift(c, 'townhall', 5); force.network(); },
  network: () => { visit('ledger'); lift(cap(), 'market', 1); UI.tab = 'ledger'; UI.lg = { ...(UI.lg || {}), view: 'supply' }; ECTut.refresh(); UI.tab = 'city'; },
  transfer: () => { const c = cap(), b = second(); c.units.militia = Math.max(c.units.militia || 0, 12); c.res.grain = Math.max(c.res.grain, 2000); if (!S.moves.some(m => m.owner === 'p' && m.type === 'reinforce')) { const e = G.sendArmy(S, c.id, b.x, b.y, 'reinforce', { militia: 3 }); if (e) console.log('  reinforce:', e); } },
  roads: () => { const t = S.roads && Object.keys(S.roads.lvl).map(Number).find(i => S.roads.lvl[i] > 0 && S.explored[i]); UI.tab = 'world'; UI.sel = { x: t % S.map, y: Math.floor(t / S.map) }; ECTut.refresh(); UI.tab = 'city'; UI.sel = null; },
  rival: () => visit('diplomacy'),
  intercept: () => {
    const m = incoming()[0];
    if (!m) return;
    UI.tab = 'world'; UI.sel = { x: m.x, y: m.y, move: m.id }; ECTut.refresh(); UI.tab = 'city'; UI.sel = null;
    const c = cap(); c.units.militia = Math.max(c.units.militia || 0, 200);
    if (!S.moves.some(x => x.owner === 'p' && x.type === 'intercept')) { const e = G.sendIntercept(S, c.id, m.id, { militia: 150 }, null); if (e) console.log('  intercept:', e, '(the goal also completes once the threat has passed)'); }
  },
  monster: () => act.tutGotIt(),
  culture: () => { visit('culture'); const e = S.empires.p; e.culture = Math.max(e.culture || 0, 5000); if (!(e.traditions || []).length) { const id = G.traditionsFor(S, 'p').find(k => G.traditionStatus(S, 'p', k).ok); if (id) G.adoptTradition(S, 'p', id); } },
  council: () => { visit('council'); G.setGovernor(S, cap().id, { focus: 'balanced', realm: true }); },
  faith: () => { visit('religion'); const e = S.empires.p; const c = cap(); lift(c, 'temple', 1); e.faith = Math.max(e.faith || 0, 1000); if (!e.faithId && G.foundStatus(S, 'p').ok) G.foundFaith(S, 'p', G.aiFounding(S, e)); },
  generals: () => { const c = cap(); lift(c, 'barracks', 3); rich(c); if (!G.generalsOf(S, 'p').length) { const e = G.recruitGeneral(S, 'p', c.id, 0); if (e) console.log('  general:', e); } },
  magic: () => { const c = cap(); force.magic(); rich(c); if (!(S.stats.spells > 0)) { const id = G.spellsOf(S, 'p').find(k => { const sp = DATA.spells[k]; return (sp.target === 'city' || sp.target === 'realm') && G.spellStatus(S, 'p', c.id, k).ok; }); if (id) G.castSpell(S, 'p', c.id, id, DATA.spells[id].target === 'city' ? c.id : undefined); else S.stats.spells = 1; } },
  grimoire: () => { UI.tab = 'magic'; UI.gm = { ...(UI.gm || {}), sect: 'grimoire' }; ECTut.refresh(); UI.tab = 'city'; const c = cap(); rich(c); const A = G.grimoire(S, 'p'); if (!A.active && !A.queue.length) { const id = DATA.arcanaOrder.find(k => G.arcanaStatus(S, 'p', k).ok); const e = id ? G.startStudy(S, 'p', id) : 'nothing to study'; if (e) console.log('  study:', e); } },
  magi: () => { const c = cap(); rich(c); if (!G.magiOf(S, 'p').length) { const e = G.recruitMagus(S, 'p', 0); if (e) console.log('  recruit:', e); } const g = G.magiOf(S, 'p')[0]; if (g && g.station === 'idle') { const e = G.stationMagus(S, 'p', g.id, 'court', g.city); if (e) console.log('  post:', e); } },
  slots: () => { const R = G.research(S, 'p'); for (const c of G.citiesOf(S, 'p')) rich(c); for (const c of G.citiesOf(S, 'p')) { if (G.researchHostFree(S, c) <= 0) continue; const id = G.techList(S, 'p').find(k => G.techStatus(S, c.id, k).ok); if (id) G.startResearch(S, c.id, id); } const more = G.techList(S, 'p').filter(k => !R.done[k] && !R.studies.some(x => x.id === k) && !DATA.techs[k].repeat); for (const k of more) { if (R.studies.length + (R.queue || []).length >= 3) break; G.planResearch(S, 'p', null, k); } },
  wrap: () => act.tutGotIt(),
};
const stuck = {}, seenAt = {};
let lastCur = null, sameFor = 0, guard = 0;
const order = ['shortage', 'rival', 'transfer', 'roads', 'monster', 'intercept', 'omen', 'culture', 'faith', 'generals', 'council', 'magic', 'grimoire', 'magi', 'slots'];
while (guard++ < 4000) {
  ECTut.refresh();
  const st = ECTut.current();
  if (st) seenAt[st.id] = seenAt[st.id] ?? guard;
  if (!st) {
    const next = order.find(id => !tut().done[id] && !forced[id]);
    const left = ids.filter(id => !tut().done[id]);
    if (!left.length) break;
    if (next) { forced[next] = 1; force[next](); ECTut.refresh(); }
    else { if (guard % 10 === 0) { for (const id of left) (force[id] || (() => {}))(); ECTut.refresh(); } if (guard % 200 === 0) console.log('  waiting on', left.join(',')); }
    G.advance(S, 20, 4);
    continue;
  }
  if (st.id === lastCur) sameFor++; else { lastCur = st.id; sameFor = 0; }
  if (sameFor > 60) { stuck[st.id] = (S.tutorial.ticks ? Object.keys(S.tutorial.ticks).filter(k => k.startsWith(st.id + '.')).join(',') : '') || 'no goal ticked'; act.tutSkipStage(); sameFor = 0; continue; }
  // situation stages that are not open yet get their trigger once the core stage asks for it
  try { solve[st.id] ? solve[st.id]() : act.tutGotIt(); } catch (e) { console.log('  solver for ' + st.id + ' threw:', e.message); }
  // a few situation stages are forced along the way so the whole guide is visited in one run
  const k = order.find(id => !forced[id] && !tut().done[id]);
  if (k && guard % 7 === 0) { forced[k] = 1; force[k](); ECTut.refresh(); }
  G.advance(S, 20, 4);
}
const t = tut();
const notDone = ids.filter(id => t.done[id] !== 'done');
ok('the playthrough finishes every stage (none skipped, none left)', notDone.length === 0, notDone.map(id => id + '=' + (t.done[id] || 'open')).join(' ') || ('in ' + guard + ' steps'));
ok('no stage got stuck', !Object.keys(stuck).length, JSON.stringify(stuck));
ok('every new stage was reached and paid its reward', NEW.every(id => t.paid[id]), NEW.filter(id => !t.paid[id]).join(','));
ok('the new goals were met by real deeds: a reinforce march, an interception, a road and a column looked at, a grimoire study, two studies at once', t.moved && t.met && t.sawRoad && t.sawColumn && t.sawGrim && t.maxStudies >= 2, JSON.stringify({ moved: t.moved, met: t.met, sawRoad: t.sawRoad, sawColumn: t.sawColumn, sawGrim: t.sawGrim, maxStudies: t.maxStudies }));
ok('every core stage was reached in order (welcome first, wrap after expansion)', seenAt.welcome === 1 && seenAt.wrap > seenAt.expansion);
ok('the stage counter counts every met stage once the game has met them all', ECTut.STAGES.every(st => !st.when || t.done[st.id]));

// ---- an old save that finished the 18 stages of the previous guide ----
{ const s = newGame(); const done = Object.fromEntries(OLD18.map(id => [id, 'done'])); s.tutorial = { v: 2, stage: null, done, started: Object.fromEntries(OLD18.map(id => [id, 0])), ticks: {}, paid: { ...done }, vis: {}, off: false, min: false, list: false, pin: null };
  const r = G.deserialize(G.serialize(s)); S = r; UI.city = G.capital(S, 'p').id; UI.tab = 'city';
  ECTut.refresh();
  ok('an old save that finished the guide sees nothing new until a new situation arises', ECTut.current() === null, ECTut.current() && ECTut.current().id);
  const t2 = G.freeTile(S, x => G.dist(x, G.capital(S, 'p')) >= 3 && G.dist(x, G.capital(S, 'p')) <= 6 && G.landReachable(S, G.capital(S, 'p'), x));
  G.foundCity(S, 'p', t2.x, t2.y, 'New'); ECTut.refresh();
  ok('...and a second city opens the Move troops stage', ECTut.current() && ECTut.current().id === 'transfer', ECTut.current() && ECTut.current().id);
  ok('...the done stages stay done', OLD18.every(id => S.tutorial.done[id] === 'done'));
}
// ---- the list hides situation stages not met yet ----
{ S = newGame(); UI.city = G.capital(S, 'p').id; ECTut.refresh(); S.tutorial.list = true; ECTut.refresh();
  ok('the list only counts stages the player has met', (() => { const met = ECTut.metStages(); return met.length < ECTut.STAGES.length && met.every(st => !NEW.includes(st.id)); })());
}
// ---- the help text: counts come from the tables ----
{ const h = id => (HELP_SECTIONS.find(x => x.id === id) || {}).html || '';
  const T = Object.values(DATA.techs), shared = T.filter(t => !t.race && !t.repeat).length, rep = T.filter(t => t.repeat).length;
  ok('help: research counts match the tech table', h('research').includes(shared + ' shared') && h('research').includes(rep + ' ↻ mastery techs') && !/\$\{/.test(h('research')), h('research').slice(0, 160));
  ok('help: the Grimoire count matches its node table', h('magic').includes(DATA.arcanaOrder.length + ' nodes'));
  ok('help: military names Move troops and interception', /Move troops/.test(h('military')) && /Intercept/.test(h('military')));
  ok('help: economy says roads speed caravans', /roads speed caravans/.test(h('economy')));
  ok('help: council explains thinking for the realm', /Think for the realm/.test(h('council')));
  ok('help: magic names the mana cap and where the world-shaping spells are learned', /Mana cap/.test(h('magic')) && /Rites of the Land/.test(h('magic')) && (!G.MANA || h('magic').includes(G.MANA.capTower + ' per Mage Tower')));
  ok('help: time and keys mention the console', /console/.test(h('time')) && h('time').includes('Ctrl/Cmd+K'));
  ok('help: renderHelp works without a game', (() => { const keep = S; S = null; try { return renderHelp().length > 1000; } catch (e) { return false; } finally { S = keep; } })());
}
{ S = newGame(); UI.city = G.capital(S, 'p').id; ECTut.refresh(); const ids2 = ECTut.metStages().map(st => st.id); ok('the list shows the stage the last core stage waits on (no dangling “after …”)', ids2.includes('wrap') && ids2.includes('expansion'), ids2.join(',')); }
console.log(fails ? fails + ' FAILED' : 'all guide checks passed');
`);
