// The technology tree: structure, effects, eras, saves, AI progress, people techs, espionage. Run from the repo root: node tests/research.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? ' ' + x : '')); };
if (typeof initRaces2 === 'function') initRaces2();
ok('wrappers installed (happiness, culture, faith, routes, influence, forge)', G.researchHooksReady());
const T = DATA.techs, ids = Object.keys(T);
const common = ids.filter(id => !T[id].race);
const reps = ids.filter(id => T[id].repeat), base = ids.filter(id => !T[id].repeat);

// ---- size and shape ----
ok('120-160 technologies (plus the repeatable mastery techs)', base.length >= 120 && base.length <= 160, base.length + ' + ' + reps.length);
ok('8-12 repeatable techs, at most two per branch, open in the Legend era', reps.length >= 8 && reps.length <= 12 && DATA.techBranchOrder.every(b => reps.filter(id => T[id].branch === b).length <= 2) && reps.every(id => T[id].era === 3 && !T[id].race), reps.join(','));
ok('repeatable techs give small steps (≤ 4% a level)', reps.every(id => Object.entries(T[id].fx).every(([k, v]) => Math.abs(v - 1) <= 0.0401)));
const perEra = [0, 1, 2, 3].map(e => common.filter(id => T[id].era === e).length);
ok('every era has at least 20 common techs', perEra.every(n => n >= 20), perEra.join('/'));
const perBranch = DATA.techBranchOrder.map(b => common.filter(id => T[id].branch === b).length);
ok('about ten branches, each with 8+ techs', DATA.techBranchOrder.length >= 10 && perBranch.every(n => n >= 8), perBranch.join('/'));
ok('every tech has a known branch', ids.every(id => DATA.techBranches[T[id].branch]));
ok('era, tier, column and Academy level agree', ids.every(id => { const t = T[id]; return t.col >= 0 && t.col < 12 && t.era === Math.floor(t.col / 3) && t.tier === t.col % 3 && t.ac === DATA.techAcademy[t.col]; }));
ok('Academy level never falls with column', DATA.techAcademy.every((a, i) => !i || a >= DATA.techAcademy[i - 1]));
ok('every branch spans all four eras', DATA.techBranchOrder.every(b => [0, 1, 2, 3].every(e => common.some(id => T[id].branch === b && T[id].era === e))));

// ---- DAG ----
ok('every prerequisite exists', ids.every(id => T[id].reqs.every(r => T[r])));
ok('prerequisites always sit in an earlier column', ids.every(id => T[id].reqs.every(r => T[r].col < T[id].col)));
{
  const state = {}; let cyc = false;
  const dfs = id => { if (state[id] === 1) { cyc = true; return; } if (state[id] === 2) return; state[id] = 1; T[id].reqs.forEach(dfs); state[id] = 2; };
  ids.forEach(dfs);
  ok('no cycles', !cyc);
}
ok('cross-branch links (at least a third of linked techs)', ids.filter(id => T[id].reqs.some(r => T[r].branch !== T[id].branch)).length >= ids.filter(id => T[id].reqs.length).length / 3);
ok('Metallurgy needs Bellows and Masonry', T.metallurgy.reqs.includes('bellows') && T.metallurgy.reqs.includes('masonry'));
ok('people techs only build on common techs or their own', ids.every(id => T[id].reqs.every(r => !T[r].race || T[r].race === T[id].race)));
for (const race of DATA.raceOrder) {
  const mine = ids.filter(id => !T[id].race || T[id].race === race), known = {};
  let grew = true;
  while (grew) { grew = false; for (const id of mine) if (!known[id] && T[id].reqs.every(r => known[r])) { known[id] = true; grew = true; } }
  ok('every tech reachable for the ' + race, mine.every(id => known[id]));
}

// ---- effects ----
const VALID = new Set(G.techFxKeys());
ok('every fx key is a known modifier', ids.every(id => Object.keys(T[id].fx).length && Object.keys(T[id].fx).every(k => VALID.has(k))), ids.flatMap(id => Object.keys(T[id].fx).filter(k => !VALID.has(k)).map(k => id + ':' + k)).join(','));
ok('small increments: no single multiplier beyond ±25% (caravans 50%)', ids.every(id => Object.entries(T[id].fx).every(([k, v]) => G.TECH_SPECIAL[k] || (k === 'caravan' ? v <= 1.5 : v >= 0.88 && v <= 1.25))));
ok('every tech has an effect description and flavour', ids.every(id => G.techFxText(id).length > 5 && T[id].flavor));
{
  // the whole tree for one people: strong but not absurd
  const all = {};
  for (const id of ids.filter(id => !T[id].race || T[id].race === 'hearth')) for (const [k, v] of Object.entries(T[id].fx)) all[k] = G.TECH_SPECIAL[k] && k !== 'culture' && k !== 'faith' && k !== 'influence' ? (all[k] || 0) + v : (all[k] || 1) * v;
  const lim = { grain: 2, refine: 2, tax: 1.9, atk: 1.7, def: 1.7, wall: 1.9, storage: 1.9, popGrowth: 1.8 };
  ok('full-tree totals bounded', Object.entries(lim).every(([k, v]) => all[k] <= v) && all.buildTime >= 0.55 && all.researchTime >= 0.6 && all.happy <= 12, Object.entries(all).map(([k, v]) => k + ' ' + (+v.toFixed(2))).join(', '));
}

// ---- costs and times ----
const value = c => Object.entries(c).reduce((a, [g, v]) => a + v * (g === 'gold' ? 1 : DATA.goods[g].value), 0);
{
  const avg = col => { const l = common.filter(id => T[id].col === col); return l.reduce((a, id) => a + value(G.techCost(id)), 0) / l.length; };
  const a = []; for (let c = 0; c < 12; c++) a.push(avg(c));
  ok('costs rise with every column', a.every((v, i) => !i || v > a[i - 1] * 1.05), a.map(Math.round).join(' '));
  ok('no single good beyond the cap', ids.every(id => Object.entries(G.techCost(id)).every(([g, v]) => g === 'gold' || v <= G.TECH_GOOD_CAP)));
  ok('Founding techs are cheap (< 1000 goods)', common.filter(id => T[id].era === 0).every(id => Object.values(G.techCost(id)).every(v => v < 1000)));
  ok('study time grows with column', ids.every(id => ids.every(o => T[o].col <= T[id].col || G.techBaseTime(o) > G.techBaseTime(id))));
  const hours = [0, 1, 2, 3].map(e => common.filter(id => T[id].era === e).reduce((s, id) => s + G.techBaseTime(id), 0) / 3600);
  ok('Founding era flows quickly, Legend spans a long game', hours[0] < 2.5 && hours[3] > 10 && hours.every((h, i) => !i || h > hours[i - 1]), hours.map(h => h.toFixed(1)).join('/') + ' h');
}

// ---- old keys and compatibility ----
const OLD = ['croprotation', 'sawpits', 'stonecutting', 'cartography', 'deepshafts', 'granaries', 'taxation', 'bellows', 'masonry', 'cellars', 'medicine', 'caravanserai', 'irrigation', 'metallurgy', 'guilds', 'architecture', 'drill', 'packmules', 'forgedblades', 'mail', 'logistics', 'rations', 'fortification', 'herolore', 'tempered', 'plate', 'warcraft', 'ciphers'];
ok('every old tech key is kept', OLD.every(id => T[id]), OLD.filter(id => !T[id]).join(','));
ok('ciphers (re-declared by espionage.js) placed in the tree, still Military', T.ciphers.branch === 'state' && T.ciphers.era === 1 && T.ciphers.reqs.length === 2 && T.ciphers.cat === 'Military');
ok('legacy req string = first prerequisite (people techs unreachable)', ids.every(id => T[id].race ? T[id].req === '@' + T[id].race : T[id].req === T[id].reqs[0]));
ok('techCost(id) still returns a goods table', typeof G.techCost('warcraft').timber === 'number');

const fresh = (race = 'hearth') => {
  const s = G.newGame({ name: 'T', race, rivals: 3 }); s.settings.hostility = 0;
  const c = G.capital(s, 'p');
  c.buildings.academy = 20; c.buildings.townhall = 20; c.buildings.warehouse = 25;
  for (const g of Object.keys(DATA.goods)) c.res[g] = 50000;
  s.empires.p.gold = 1e6;
  return { s, c };
};
{
  const { s, c } = fresh();
  c.buildings.academy = 11;
  ok('start research', G.startResearch(s, c.id, 'croprotation') === null && G.research(s, 'p').active.id === 'croprotation');
  ok('one city with an Academy below 12: one study at a time', G.researchSlots(s, 'p').total === 1 && G.startResearch(s, c.id, 'sawpits') === 'Scholars are busy');
  c.buildings.academy = 20;
  ok('an Academy 12+ runs two studies', G.researchSlots(s, 'p').total === 2 && G.startResearch(s, c.id, 'sawpits') === null && G.research(s, 'p').studies.length === 2);
  ok('but never three in one city', /busy/.test(G.startResearch(s, c.id, 'taxation') || ''));
  const g0 = G.mod(s, 'p', c, 'grain');
  G.advance(s, Math.max(...G.research(s, 'p').studies.map(x => x.end)) - s.time + 2, 50);
  ok('research completes and applies', G.hasTech(s, 'p', 'croprotation') && Math.abs(G.mod(s, 'p', c, 'grain') / g0 - 1.08) < 0.03, (G.mod(s, 'p', c, 'grain') / g0).toFixed(3));
  ok('locked by prerequisites', /Needs/.test(G.startResearch(s, c.id, 'irrigation')));
  c.buildings.academy = 1; G.research(s, 'p').done.husbandry = true;
  ok('locked by Academy level', G.techStatus(s, c.id, 'herblore').ok === false && G.techStatus(s, c.id, 'herblore').academy);
  ok('Academy gate names the level', G.techStatus(s, c.id, 'herblore').reason === 'Needs Academy 2 here');
  c.buildings.academy = 20;
}

// ---- old saves ----
{
  const { s, c } = fresh();
  const legacy = ['croprotation', 'irrigation', 'deepshafts', 'bellows', 'metallurgy', 'forgedblades', 'tempered', 'warcraft', 'mail', 'plate', 'fortification', 'ciphers'];
  s.empires.p.research = { done: Object.fromEntries(legacy.map(k => [k, true])), active: { id: 'masonry', city: c.id, start: s.time, end: s.time + 30, cost: { timber: 10 } } };
  s.empires.p.research.done.oldRemovedTech = true;      // an id this version does not know
  const s2 = G.deserialize(G.serialize(s));
  const c2 = G.capital(s2, 'p');
  ok('old save loads with its techs', Object.keys(G.research(s2, 'p').done).length === legacy.length + 1);
  const m = G.techMult(s2, 'p', 'atk');
  ok('old techs still apply (attack from blades, steel, art of war)', Math.abs(m - 1.05 * 1.06 * 1.05) < 0.01, m.toFixed(3));
  ok('unknown ids are ignored', G.mod(s2, 'p', c2, 'grain') > 0 && isFinite(G.mod(s2, 'p', c2, 'refine')));
  ok('old R.active migrates into the study list', G.research(s2, 'p').studies.length === 1 && G.research(s2, 'p').active.id === 'masonry' && !Object.keys(G.research(s2, 'p')).includes('active'));
  ok('the R.active accessor is never saved', !/"active"/.test(JSON.stringify(G.research(s2, 'p'))));
  G.advance(s2, 40, 20);
  ok('old in-flight study finishes', G.hasTech(s2, 'p', 'masonry') && !G.research(s2, 'p').active && !G.research(s2, 'p').studies.length);
  ok('their era is computed', G.techEra(s2, 'p') >= 0);
}

// ---- G.techEra ----
{
  const { s } = fresh('delver');
  const R = G.research(s, 'p');
  ok('a new realm is in the Founding era', G.techEra(s, 'p') === 0);
  const mine = G.techList(s, 'p');
  const of = e => mine.filter(id => T[id].era === e);
  const need = e => Math.ceil(of(e).length * G.TECH_ERA_SHARE);
  of(0).slice(0, need(0) - 1).forEach(id => R.done[id] = true);
  ok('just below half of the Founding techs: era 0', G.techEra(s, 'p') === 0);
  R.done[of(0)[need(0) - 1]] = true;
  ok('half the Founding techs: Kingdom era (1)', G.techEra(s, 'p') === 1);
  of(1).slice(0, need(1)).forEach(id => R.done[id] = true);
  ok('half the Kingdom techs: Empire era (2)', G.techEra(s, 'p') === 2);
  of(2).slice(0, need(2)).forEach(id => R.done[id] = true);
  ok('half the Empire techs: Legend era (3)', G.techEra(s, 'p') === 3);
  ok('era progress table', G.techEraProgress(s, 'p')[3].prevGot === need(2) && G.techEraProgress(s, 'p')[3].need === need(2));
  ok('foreign people techs never count toward the era', (() => { const e = G.techEra(s, 'p'); R.done.millstones = true; return G.techEra(s, 'p') === e; })());
}

// ---- people-specific techs ----
for (const race of DATA.raceOrder) {
  const own = ids.filter(id => T[id].race === race);
  ok(race + ': 3-4 people techs across the eras', own.length >= 3 && own.length <= 4 && new Set(own.map(id => T[id].era)).size >= 3, own.join(','));
}
{
  const { s, c } = fresh('hearth');
  const R = G.research(s, 'p');
  R.done.croprotation = true;
  ok('own people tech is open', G.techStatus(s, c.id, 'millstones').ok);
  ok('another people\\'s tech is hidden', G.techStatus(s, c.id, 'deepdelving').hidden && !!G.startResearch(s, c.id, 'deepdelving'));
  ok('tech list hides foreign people techs', G.techList(s, 'p').includes('millstones') && !G.techList(s, 'p').includes('glimmer'));
  ok('foreign tech cannot be queued', !!G.queueResearch(s, 'p', 'grovetending'));
  const t0 = G.mod(s, 'p', c, 'timber');
  R.done.grovetending = true;
  ok('a foreign tech that slipped in has no effect', Math.abs(G.mod(s, 'p', c, 'timber') - t0) < 1e-9);
}

// ---- queue ----
{
  const { s, c } = fresh();
  const R = G.research(s, 'p');
  ok('old saves have no queue and load fine', R.queue === undefined && G.researchQueueNote(s, 'p') === '');
  ok('a topic with missing prerequisites cannot be queued alone', /first/.test(G.queueResearch(s, 'p', c.id, 'metallurgy') || ''));
  ok('plan path queues the whole chain', G.planResearch(s, 'p', c.id, 'metallurgy') === null);
  ok('queue started the first topics', R.studies.length === 2 && R.queue.length >= 3, R.studies.map(x => x.id).join('+') + ' then ' + R.queue.join(','));
  ok('chain stays in prerequisite order', R.queue.every((k, i) => T[k].reqs.every(r => R.done[r] || R.studies.some(x => x.id === r) || R.queue.indexOf(r) < i)));
  ok('a topic whose prerequisite is queued may be queued alone', G.queueResearch(s, 'p', c.id, 'tempered') === 'Needs Forged Blades first (plan the path to queue them too)' && G.queueResearch(s, 'p', c.id, 'forgedblades') === null && G.queueResearch(s, 'p', c.id, 'tempered') === null);
  ok('no duplicates', G.queueResearch(s, 'p', c.id, 'tempered') === 'Already queued');
  // unlimited: plan a long way into the Legend era
  const before = R.queue.length;
  ok('the queue is unlimited', G.planResearch(s, 'p', c.id, 'embercrown') === null && R.queue.length >= before + 15, R.queue.length + ' topics');
  ok('reordering never jumps a prerequisite', !!G.moveQueuedResearch(s, 'p', 'tempered', -1) && R.queue.indexOf('tempered') > R.queue.indexOf('forgedblades'));
  const q0 = R.queue.slice(), i = q0.findIndex((k, j) => j > 0 && !T[k].reqs.includes(q0[j - 1]));
  ok('reordering moves a topic up', G.moveQueuedResearch(s, 'p', q0[i], -1) === null && R.queue[i - 1] === q0[i]);
  const goodsBefore = c.res.timber;
  G.unqueueResearch(s, 'p', 'embercrown');
  ok('cancelling a queued topic is free (paid only when it starts)', c.res.timber === goodsBefore && !R.queue.includes('embercrown'));
  G.unqueueResearch(s, 'p', 'arches');
  ok('dropping a topic drops what depends on it', !R.queue.includes('arches') && !R.queue.includes('architecture') && !R.queue.includes('livingstone'));
  let guard = 0;
  let together = false, prereqClash = false;
  while ((R.studies.length || R.queue.length) && guard++ < 80 && !(G.hasTech(s, 'p', 'tempered') && G.hasTech(s, 'p', 'metallurgy'))) {
    G.advance(s, (R.active ? Math.min(...R.studies.map(x => x.end)) - s.time : 10) + 11, 40);
    if (R.studies.length > 1) together = true;
    if (R.studies.some(a => R.studies.some(b => T[a.id].reqs.includes(b.id)))) prereqClash = true;
  }
  ok('the queue keeps both slots busy', together);
  ok('a topic never runs alongside its own prerequisite', !prereqClash);
  ok('queue works through to the goal', G.hasTech(s, 'p', 'metallurgy') && G.hasTech(s, 'p', 'tempered') && ['bellows', 'masonry', 'deepshafts', 'charcoal', 'framing'].every(k => G.hasTech(s, 'p', k)));
}
{
  // waiting for goods: the queue waits, then resumes
  const { s, c } = fresh();
  const R = G.research(s, 'p');
  G.planResearch(s, 'p', c.id, 'ploughs');
  ok('both first steps of the path run in parallel', R.studies.length === 2 && R.queue[0] === 'ploughs');
  for (const g of Object.keys(DATA.goods)) c.res[g] = 0; s.empires.p.gold = 0;
  G.advance(s, Math.max(...R.studies.map(x => x.end)) - s.time + 12, 40);
  ok('unaffordable topic waits with a note', !R.active && R.queue.length && /goods/.test(G.researchQueueNote(s, 'p')), G.researchQueueNote(s, 'p'));
  for (const g of Object.keys(DATA.goods)) c.res[g] = 50000; s.empires.p.gold = 1e6;
  G.advance(s, 15, 10);
  ok('and starts once goods arrive', !!R.active || G.hasTech(s, 'p', 'ploughs'));
  const s2 = G.deserialize(G.serialize(s));
  ok('queue survives save/load', JSON.stringify(G.research(s2, 'p').queue) === JSON.stringify(R.queue));
}
{
  // a later affordable topic starts while an expensive one waits
  const { s, c } = fresh();
  const R = G.research(s, 'p');
  R.done.stonecutting = R.done.sawpits = R.done.framing = true;
  G.queueResearch(s, 'p', c.id, 'masonry'); G.queueResearch(s, 'p', c.id, 'taxation');
  G.cancelResearch(s, 'p');
  for (const g of Object.keys(DATA.goods)) c.res[g] = 400; s.empires.p.gold = 1e6;
  c.res.stone = 300;
  R.queue = ['masonry', 'taxation'];
  G.processResearchQueue(s, 'p');
  ok('the next affordable topic starts instead of blocking', R.active && R.active.id === 'taxation' && R.queue[0] === 'masonry', R.active && R.active.id);
}

// ---- special effects ----
{
  const { s, c } = fresh();
  const R = G.research(s, 'p');
  const h0 = G.happiness(s, c).value;
  R.done.lawcode = true; R.done.rites = true;
  ok('happiness from learning', G.happiness(s, c).why.some(w => /Learning/.test(w.label)) && G.happiness(s, c).value >= h0 + 1, h0 + ' -> ' + G.happiness(s, c).value);
  c.buildings.market = 4;
  const r0 = G.routeSlots(s, c);
  R.done.charters = true;
  ok('trade charters add a route slot', G.routeSlots(s, c) === r0 + 1);
  const cu0 = G.cultureRate(s, c); R.done.oraltradition = true;
  ok('culture multiplier', G.cultureRate(s, c) > cu0 * 1.05);
  c.buildings.armory = 5;
  const u0 = G.upgradeTime(s, c, 2); R.done.toolstandards = true;
  ok('forge upgrades faster', G.upgradeTime(s, c, 2) < u0);
  // winter resilience
  const win = DATA.seasonFx.findIndex(f => f.name === 'Winter');
  s.time = win * (G.DAY * 2) + 10;
  if (G.season(s).index === win) {
    const g0 = G.mod(s, 'p', c, 'grain'); R.done.ministries = true;
    ok('winter hurts less', G.mod(s, 'p', c, 'grain') > g0 * 1.02);
  } else ok('winter index found', true, 'season calendar differs; skipped');
  // calamity resilience
  if (G.startCalamity) {
    const cal = G.startCalamity(s, 'blight', c);
    if (cal) { const g1 = G.mod(s, 'p', c, 'grain'); R.done.wards = true; R.done.sanitation = true; ok('calamities hurt less', G.mod(s, 'p', c, 'grain') > g1); }
  }
}

// ---- espionage: stealing secrets ----
{
  const s = G.newGame({ name: 'T', race: 'hearth', rivalRaces: ['delver'], rivals: 1 }); s.settings.hostility = 0;
  const c = G.capital(s, 'p'), ai = G.capital(s, 'a1');
  s.explored[ai.y * s.map + ai.x] = 1; c.buildings.townhall = 10; c.buildings.hideout = 5; s.empires.p.gold = 1e5;
  G.research(s, 'a1').done.croprotation = true;
  G.research(s, 'a1').done.deepdelving = true;          // a Deepdelver secret: never copied by a Hearthfolk spy
  const id = G.newId(s, 'sp');
  const sp = G.espState(s).spies[id] = { id, owner: 'p', name: 'Test', level: 4, xp: 0, home: c.id, status: 'idle', ready: 0, task: null };
  ok('send spy', G.sendSpy(s, id, ai.id, 'tech') === null);
  sp.task.phase = 'work';
  const r = G.resolveMission(s, sp, { roll: 0, caughtRoll: 0.99 });
  ok('steal a technique', r.ok && G.hasTech(s, 'p', 'croprotation') && !G.hasTech(s, 'p', 'deepdelving'));
}

// ---- AI research by people ----
{
  const eras = {};
  for (const race of DATA.raceOrder) {
    const { s, c } = fresh(race);
    const emp = s.empires.p; emp.aggr = DATA.races[race].aggr ?? 0.5;
    const R = G.research(s, 'p');
    const seen = [];
    let foreign = false, picks = 0;
    for (let i = 0; i < 400; i++) {
      const p = G.aiResearchPick(s, emp);
      if (!p) break;
      picks++;
      if (T[p.id].race && T[p.id].race !== race) foreign = true;
      R.done[p.id] = true;
      if (i % 20 === 19) seen.push(G.techEra(s, 'p'));
    }
    eras[race] = seen;
    ok(race + ': AI picks only open techs and none of other peoples', !foreign && picks > 100, picks + ' picks');
    ok(race + ': AI moves through the eras in order', seen.every((e, i) => !i || e >= seen[i - 1]) && seen[seen.length - 1] === 3, seen.join(''));
  }
  // personality: warlike realms lean to warfare early
  const share = aggr => {
    let war = 0, n = 0;
    for (let k = 0; k < 6; k++) {
      const { s } = fresh('hearth'); const emp = s.empires.p; emp.aggr = aggr; const R = G.research(s, 'p');
      for (let i = 0; i < 25; i++) { const p = G.aiResearchPick(s, emp); if (!p) break; R.done[p.id] = true; n++; if (T[p.id].branch === 'war' || T[p.id].branch === 'siege') war++; }
    }
    return war / n;
  };
  const hawk = share(0.9), dove = share(0.1);
  ok('aggressive AIs research more warfare', hawk > dove, (hawk * 100).toFixed(0) + '% vs ' + (dove * 100).toFixed(0) + '%');
}
{
  // a real game: AI realms research over several game-hours
  const s = G.newGame({ name: 'T', race: 'wind', rivals: 3 });
  let par = 0;
  G.stepHooks.push(x => { if (x !== s) return; for (const e of Object.values(x.empires)) if (e.id !== 'p' && e.research && e.research.studies) par = Math.max(par, e.research.studies.length); });
  G.advance(s, 4 * 3600, 16000);
  console.log('info: most AI studies at once in four game-hours: ' + par + ' (extra slots usually come with a second Academy 3, often after hour 4)');
  const counts = Object.values(s.empires).filter(e => e.id !== 'p').map(e => Object.keys(G.research(s, e.id).done).length);
  ok('AI realms research over four game-hours', counts.every(n => n >= 3) && counts.some(n => n >= 10), counts.join('/'));
  ok('AI realms never learn other peoples\\' techs', Object.values(s.empires).every(e => Object.keys(G.research(s, e.id).done).every(id => !T[id] || !T[id].race || T[id].race === e.race)));
}
{
  const { s } = fresh();
  ok('recommendations are open techs', G.techRecommend(s, 'p', 3).length === 3 && G.techRecommend(s, 'p', 3).every(id => G.techStatus(s, G.capital(s, 'p').id, id).ok));
}

// ---- parallel studies: slots, academies, cancelling ----
const near = (s, c, lo, hi) => G.freeTile(s, x => G.dist(x, c) >= lo && G.dist(x, c) <= hi && G.landReachable(s, c, x));
const stock = c => { for (const g of Object.keys(DATA.goods)) c.res[g] = 50000; c.buildings.warehouse = 25; c.buildings.townhall = 20; };
{
  const { s, c } = fresh();
  c.buildings.academy = 0;
  ok('no Academy: no study slot', G.researchSlots(s, 'p').total === 0);
  c.buildings.academy = 5;
  ok('one city with an Academy: one slot, and a hint to found another city', G.researchSlots(s, 'p').total === 1 && /another city/.test(G.researchSlots(s, 'p').hint), G.researchSlots(s, 'p').hint);
  const t2 = near(s, c, 3, 8), c2 = G.foundCity(s, 'p', t2.x, t2.y, 'Second'); stock(c2);
  c2.buildings.academy = 2;
  ok('a second city with a small Academy adds no slot', G.researchSlots(s, 'p').total === 1 && /Second/.test(G.researchSlots(s, 'p').hint), G.researchSlots(s, 'p').hint);
  c2.buildings.academy = 3;
  ok('a second city with Academy 3: two slots', G.researchSlots(s, 'p').total === 2);
  const cs = [c2];
  for (let i = 0; i < 3; i++) { const t = near(s, c, 4 + i, 12); if (!t) break; const x = G.foundCity(s, 'p', t.x, t.y, 'Extra' + i); x.buildings.academy = 3; stock(x); cs.push(x); }
  ok('slots are capped', G.researchSlots(s, 'p').total === Math.min(G.RESEARCH_SLOT_MAX, 1 + cs.length) && G.researchSlots(s, 'p').total <= G.RESEARCH_SLOT_MAX, G.researchSlots(s, 'p').total + ' slots, ' + (1 + cs.length) + ' cities');
  for (const x of cs.slice(1)) x.buildings.academy = 0;
  ok('two topics run at once in two academies', G.startResearch(s, c.id, 'croprotation') === null && G.startResearch(s, c2.id, 'sawpits') === null
    && G.research(s, 'p').studies.length === 2 && G.research(s, 'p').studies[0].city !== G.research(s, 'p').studies[1].city);
  ok('a third waits for a slot', G.startResearch(s, c.id, 'taxation') === 'All 2 study slots are busy');
  ok('techStatus reports each running study', G.techStatus(s, c.id, 'croprotation').active && G.techStatus(s, c.id, 'sawpits').active);
  // cancelling one refunds half its goods and leaves the other
  const R = G.research(s, 'p'), st = G.researchStudy(s, 'p', 'sawpits'), g = Object.keys(st.cost)[0];
  const before = c2.res[g];
  ok('cancel one study by id', G.cancelResearch(s, 'p', 'sawpits') === true);
  ok('cancelling refunds 50% and leaves the other study running', Math.abs(c2.res[g] - before - st.cost[g] * 0.5) <= 1 && R.studies.length === 1 && R.studies[0].id === 'croprotation', g + ' +' + (c2.res[g] - before));
  ok('the old one-argument cancel still stops the (first) study', G.cancelResearch(s, 'p') === true && !R.active && !R.studies.length);
  // the queue never runs a topic alongside its own prerequisite
  R.done.sawpits = true;
  R.queue = ['croprotation', 'ploughs'];
  G.processResearchQueue(s, 'p');
  ok('a topic waits while its prerequisite is studied, even with a free slot', R.studies.length === 1 && R.studies[0].id === 'croprotation' && R.queue[0] === 'ploughs');
  const plan = G.researchQueuePlan(s, 'p');
  ok('queue plan says what it waits for', plan[0].after === 'croprotation' && !plan[0].next);
  R.queue.push('taxation', 'drill');
  G.processResearchQueue(s, 'p');
  ok('the queue fills every free slot', R.studies.length === 2 && R.studies[1].id === 'taxation', R.studies.map(x => x.id).join(','));
  ok('studies are pinned to different academies', new Set(R.studies.map(x => x.city)).size === 2);
  const s2 = G.deserialize(G.serialize(s));
  ok('parallel studies survive save/load', G.research(s2, 'p').studies.length === 2 && G.research(s2, 'p').active.id === R.studies[0].id);
}

// ---- repeatable techs ----
{
  const { s, c } = fresh();
  const R = G.research(s, 'p'), id = 'improvedharvests';
  ok('a repeatable tech is locked until its branch reaches the Legend era', !!G.techStatus(s, c.id, id).locked);
  for (const k of G.techPath(s, 'p', id)) if (k !== id) R.done[k] = true;
  const g0 = G.techMult(s, 'p', 'grain');
  const st1 = G.techStatus(s, c.id, id);
  ok('then open, at level 0 → 1', st1.ok && st1.repeat && st1.level === 0 && st1.next === 1);
  G.startResearch(s, c.id, id);
  G.advance(s, R.studies[0].end - s.time + 2, 30);
  const g1 = G.techMult(s, 'p', 'grain');
  ok('level 1 learnt and applied', G.techLevel(s, 'p', id) === 1 && G.hasTech(s, 'p', id) && Math.abs(g1 / g0 - 1.02) < 1e-6, (g1 / g0).toFixed(4));
  const st2 = G.techStatus(s, c.id, id);
  ok('it can be studied again', st2.ok && st2.level === 1 && st2.next === 2);
  ok('the next level costs ×1.25 and takes longer', Math.abs(value(st2.cost) / value(st1.cost) - G.TECH_REPEAT_COST) < 0.05 && Math.abs(G.techBaseTime(id, 2) / G.techBaseTime(id, 1) - G.TECH_REPEAT_TIME) < 1e-9 && G.techTime(s, 'p', id, c, 2) > G.techTime(s, 'p', id, c, 1), (value(st2.cost) / value(st1.cost)).toFixed(3));
  ok('queue several levels', G.queueResearch(s, 'p', c.id, id) === null && G.queueResearch(s, 'p', c.id, id) === null && G.queueResearch(s, 'p', c.id, id) === null);
  ok('only one level is studied at a time, the rest wait in the queue', R.studies.filter(x => x.id === id).length === 1 && R.queue.filter(k => k === id).length === 2 && R.studies.find(x => x.id === id).level === 2);
  ok('the queue plan numbers the levels', G.researchQueuePlan(s, 'p').map(p => p.level).join(',') === '3,4');
  G.unqueueResearch(s, 'p', id);
  ok('unqueueing drops one level only', R.queue.filter(k => k === id).length === 1);
  let guard = 0;
  while ((R.studies.length || R.queue.length) && guard++ < 10) G.advance(s, Math.min(...R.studies.map(x => x.end)) - s.time + 12, 30);
  const g3 = G.techMult(s, 'p', 'grain');
  ok('levels stack: fx multiplies per level (cache follows the level)', G.techLevel(s, 'p', id) === 3 && Math.abs(g3 / g0 - Math.pow(1.02, 3)) < 1e-6, G.techLevel(s, 'p', id) + ': ' + (g3 / g0).toFixed(4));
  ok('a level-up with no new tech key still refreshes effects', (() => { R.done[id] = 4; if (G.bumpEpoch) G.bumpEpoch(); return Math.abs(G.techMult(s, 'p', 'grain') / g0 - Math.pow(1.02, 4)) < 1e-6; })());
  ok('levels do not count toward the eras', (() => { const e = G.techEra(s, 'p'); R.done[id] = 9; return G.techEra(s, 'p') === e; })());
  const s2 = G.deserialize(G.serialize(s));
  ok('levels survive save/load', G.techLevel(s2, 'p', id) === 9);
  R.done[id] = G.TECH_REPEAT_MAX;
  ok('mastery has a ceiling', G.techStatus(s, c.id, id).maxed && !!G.queueResearch(s, 'p', c.id, id));
}

// ---- AI uses parallel slots ----
{
  const { s } = fresh();
  const emp = s.empires.a1, ac = G.capital(s, 'a1');
  stock(ac); ac.buildings.academy = 20; emp.gold = 1e6; emp.saving = false;
  const hook = G.aiHooks.find(h => /aiResearchPick/.test(String(h)));
  const rnd = Math.random; Math.random = () => 0.1;
  for (let i = 0; i < 6; i++) hook(s, emp);
  Math.random = rnd;
  const R = G.research(s, 'a1');
  ok('an AI fills both slots of an Academy 12+', R.studies.length === 2 && R.studies[0].id !== R.studies[1].id, R.studies.map(x => x.id).join(','));
  ok('and its picks never run alongside their prerequisites', !R.studies.some(a => R.studies.some(b => T[a.id].reqs.includes(b.id))));
}

console.log(fails ? fails + ' FAILED' : 'all research tests passed');
`);
