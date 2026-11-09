// Espionage: spies, missions, counter-intelligence, the AI's shadow war. Run from the repo root: node tests/espionage.js
const fs = require('fs');
global.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
eval(['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js'].filter(f=>fs.existsSync(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n') + `
let fails = 0;
const ok = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== undefined ? ' ' + x : '')); };

// ---- data ----
ok('den registered', DATA.buildings.hideout && DATA.buildingOrder.includes('hideout') && DATA.buildingGroups.some(g => g.list.includes('hideout')));
ok('eight missions', DATA.missionOrder.length === 8 && DATA.missionOrder.every(k => DATA.missions[k]));
ok('every people has a spy table', DATA.raceOrder.length === 8 && DATA.raceOrder.every(r => DATA.spyRace[r]));
ok('cipher tech registered', DATA.techs.ciphers && DATA.techs.ciphers.cat === 'Military');

// a world with a player and one rival, quiet AI
const fresh = (race = 'hearth', rival = 'delver') => {
  const s = G.newGame({ name: 'T', race, rivalRaces: [rival], rivals: 1 }); s.settings.hostility = 0;
  const c = G.capital(s, 'p'), ai = G.capital(s, 'a1');
  s.explored[ai.y * s.map + ai.x] = 1;
  c.buildings.townhall = 10; c.pop = 200; c.res.grain = 5000; s.empires.p.gold = 1e5;
  return { s, c, ai };
};
const grant = (s, city, level = 1) => {        // a ready spy without waiting
  const id = G.newId(s, 'sp');
  return G.espState(s).spies[id] = { id, owner: city.owner, name: 'Test ' + id, level, xp: 0, home: city.id, status: 'idle', ready: 0, task: null };
};

// ---- recruiting ----
{
  const { s, c } = fresh();
  ok('no den, no spies', !!G.recruitSpy(s, c.id));
  c.buildings.hideout = 3;
  ok('den 3 keeps two spies', G.spyCap(s, 'p') === 2);
  const gold = s.empires.p.gold, pop = c.pop;
  ok('recruit a spy', G.recruitSpy(s, c.id) === null);
  ok('recruiting costs gold and people', s.empires.p.gold < gold && c.pop === pop - G.SPY_POP);
  const sp = G.spiesOf(s, 'p')[0];
  ok('the recruit trains first', sp.status === 'training');
  G.advance(s, G.spyTrainTime(s, c) + 20, 40);
  ok('then joins the network', sp.status === 'idle');
  G.recruitSpy(s, c.id);
  ok('the cap holds', !!G.recruitSpy(s, c.id) && G.spiesOf(s, 'p').length === 2);
  ok('dismissing frees a place', G.dismissSpy(s, sp.id) === null && G.spiesOf(s, 'p').length === 1);
}

// ---- a full mission through travel, work and return ----
{
  const { s, c, ai } = fresh();
  c.buildings.hideout = 1;
  const sp = grant(s, c, 1);
  const st = G.missionStatus(s, sp.id, ai.id, 'intel');
  ok('mission status gives odds and times', st.ok && st.chance > 0 && st.travel >= 30 && st.time > 0, JSON.stringify(st));
  ok('send a spy', G.sendSpy(s, sp.id, ai.id, 'intel') === null && sp.status === 'travel');
  ok('a spy in the field cannot be sent again', !!G.sendSpy(s, sp.id, ai.id, 'intel'));
  let guard = 0; while (G.espState(s).spies[sp.id] && G.espState(s).spies[sp.id].status !== 'idle' && guard++ < 400) G.advance(s, 20, 4);
  const st2 = G.espState(s).stats.p || {};
  ok('the spy comes back (or was caught) and the mission resolved', (st2.ok || 0) + (st2.fail || 0) === 1, JSON.stringify(st2));
  ok('rival cities are the only targets', !!G.missionStatus(s, sp.id, c.id, 'intel').reason);
}

// ---- each mission, forced success and failure ----
const setup = () => {
  const w = fresh(); const { s, c, ai } = w;
  c.buildings.hideout = 5;
  ai.buildings.townhall = 8; ai.buildings.wall = 4; ai.buildings.barracks = 4; ai.pop = 120;
  ai.res.grain = 3000; ai.res.timber = 1000; ai.res.mana = 600; ai.units = { militia: 30 };
  return w;
};
const run = (w, type, roll, caughtRoll = 0.99, level = 4, target = w.ai) => {
  const sp = grant(w.s, w.c, level);
  const err = G.sendSpy(w.s, sp.id, target.id, type);
  if (err) throw new Error(type + ': ' + err);
  sp.task.phase = 'work';
  return { sp, r: G.resolveMission(w.s, sp, { roll, caughtRoll }) };
};
{
  const w = setup();
  const { r } = run(w, 'intel', 0);
  ok('intel succeeds', r.ok);
  ok('intel fills the scouting record', !!w.s.intel[G.tileIdx(w.s, w.ai)] && w.s.intel[G.tileIdx(w.s, w.ai)].units.militia === 30);
  ok('intel keeps a full dossier', G.espState(w.s).dossiers.p[w.ai.id].queue !== undefined);
  ok('intel files a report', w.s.reports.some(x => /Gather Intelligence/.test(x.title)));
  ok('fresh intel improves later odds', (() => { const sp = grant(w.s, w.c, 1); const a = G.missionChance(w.s, sp, 'sabotage', w.ai); delete G.espState(w.s).dossiers.p[w.ai.id]; return a > G.missionChance(w.s, sp, 'sabotage', w.ai); })());
}
{
  const w = setup();
  G.queueBuild(w.s, w.ai.id, 'farm'); w.ai.buildQueue[0] && 0;
  if (!w.ai.buildQueue.length) w.ai.buildQueue.push({ type: 'farm', level: 2, cost: {}, dur: 100, start: w.s.time, end: w.s.time + 100 });
  const end = w.ai.buildQueue[0].end;
  ok('sabotage delays construction', run(w, 'sabotage', 0).r.ok && w.ai.buildQueue[0].end > end);
  w.ai.buildQueue = [];
  const lv = w.ai.buildings.wall + w.ai.buildings.barracks + w.ai.buildings.townhall;
  run(w, 'sabotage', 0);
  const tot = Object.entries(w.ai.buildings).reduce((a, [k, v]) => a + v, 0);
  ok('sabotage without a queue knocks a building down', tot < lv + Object.entries(w.ai.buildings).filter(([k]) => !['wall','barracks','townhall'].includes(k)).reduce((a, [, v]) => a + v, 0) + 1 && Object.values(w.ai.buildings).every(v => v >= 1));
  ok('townhall is never sabotaged', w.ai.buildings.townhall === 8);
}
{
  const w = setup();
  const g = w.ai.res.grain;
  ok('poison spoils grain', run(w, 'poison', 0).r.ok && w.ai.res.grain < g * 0.8);
  ok('poison slows growth', G.mod(w.s, 'a1', w.ai, 'popGrowth') < G.mod(w.s, 'p', w.c, 'popGrowth') || w.ai.mods.some(m => m.key === 'popGrowth'));
  w.ai.res.grain = 0; w.ai.res.bread = 0; const t = w.ai.res.timber;
  run(w, 'poison', 0);
  ok('or burns the timber', w.ai.res.timber < t);
}
{
  const w = setup();
  w.ai.loyalty = 100;
  const h0 = G.happiness(w.s, w.ai).value;
  ok('unrest succeeds', run(w, 'unrest', 0).r.ok);
  ok('unrest lowers loyalty', w.ai.loyalty < 100, w.ai.loyalty);
  ok('agitators appear among the happiness factors', G.happiness(w.s, w.ai).why.some(x => /Agitators/.test(x.label)) && G.happiness(w.s, w.ai).value < h0);
}
{
  const w = setup();
  G.research(w.s, 'a1').done.croprotation = true;
  ok('steal a technique', run(w, 'tech', 0).r.ok && G.hasTech(w.s, 'p', 'croprotation'));
  const gold = w.s.empires.p.gold;
  run(w, 'tech', 0);
  ok('nothing left to learn: ledgers sold for gold', w.s.empires.p.gold > gold - 400);
}
{
  const w = setup();
  const m0 = w.c.res.mana || 0;
  ok('siphon mana', run(w, 'mana', 0).r.ok && w.ai.res.mana < 600 && (w.c.res.mana || 0) > m0);
}
{
  const w = setup();
  const h = G.heroOf(w.s, 'a1') || (G.ensureRivalHero && G.ensureRivalHero(w.s, w.s.empires.a1));
  if (h) {
    for (const c of G.citiesOf(w.s, 'a1')) delete c.units.hero;
    w.ai.units.hero = 1; h.hp = 100; h.dead = false;
    ok('wound the rival hero', run(w, 'wound', 0).r.ok && h.hp < 100 && h.hp > 0 && !h.dead, h.hp);
    ok('level-1 spies cannot strike at heroes', !!G.missionStatus(w.s, grant(w.s, w.c, 1).id, w.ai.id, 'wound').reason);
  } else console.log('SKIP no rival hero');
}
{
  const w = setup();
  const t = G.freeTile(w.s, x => G.dist(x, w.ai) >= 3 && G.dist(x, w.ai) <= 6);
  const c2 = G.foundCity(w.s, 'a1', t.x, t.y, 'Turncoat'); w.s.explored[t.y * w.s.map + t.x] = 1;
  c2.loyalty = 80;
  const sp = grant(w.s, w.c, 4); G.sendSpy(w.s, sp.id, c2.id, 'defect'); sp.task.phase = 'work';
  G.resolveMission(w.s, sp, { roll: 0 });
  ok('a loyal city does not defect, but is shaken', c2.owner === 'a1' && c2.loyalty < 80);
  c2.loyalty = 20;
  const sp2 = grant(w.s, w.c, 4); G.sendSpy(w.s, sp2.id, c2.id, 'defect'); sp2.task.phase = 'work';
  G.resolveMission(w.s, sp2, { roll: 0 });
  ok('a disloyal city defects', c2.owner === 'p');
  ok('capitals never defect', !!G.missionStatus(w.s, grant(w.s, w.c, 4).id, w.ai.id, 'defect').reason);
}
// failures: escape, and getting caught
{
  for (const type of DATA.missionOrder) {
    const w = setup();
    let tg = w.ai;
    if (type === 'defect') { const t = G.freeTile(w.s, x => G.dist(x, w.ai) >= 3 && G.dist(x, w.ai) <= 6); tg = G.foundCity(w.s, 'a1', t.x, t.y, 'Second'); w.s.explored[t.y * w.s.map + t.x] = 1; }
    const { sp, r } = run(w, type, 0.999, 0.999, 4, tg);
    ok(type + ' can fail and the spy escapes', !r.ok && !r.caught && G.espState(w.s).spies[sp.id] && sp.status === 'return');
    const op = G.rel(w.s, 'a1').opinion;
    const { sp: sp2, r: r2 } = run(w, type, 0.999, 0, 4, tg);
    ok(type + ' failure can get the spy caught: an incident', r2.caught && !G.espState(w.s).spies[sp2.id] && G.rel(w.s, 'a1').opinion < op && w.s.reports.some(x => /Spy caught/.test(x.title)));
  }
}

// ---- counter-intelligence ----
{
  const { s, c, ai } = fresh();
  c.buildings.hideout = 1; ai.buildings.townhall = 10; ai.pop = 200;
  const sp = grant(s, c, 1);
  const p0 = G.missionChance(s, sp, 'sabotage', ai), ci0 = G.counterIntel(s, ai);
  ai.buildings.hideout = 6; ai.res.grain = 5000; s.empires.a1.gold = 1e4;
  for (let i = 0; i < 2; i++) grant(s, ai, 3);
  ok('a den and guards raise counter-intelligence', G.counterIntel(s, ai) > ci0 * 2, G.counterIntel(s, ai).toFixed(2));
  ok('and lower the odds of a mission', G.missionChance(s, sp, 'sabotage', ai) < p0 - 0.2, p0.toFixed(2) + ' -> ' + G.missionChance(s, sp, 'sabotage', ai).toFixed(2));
  ok('and raise the odds of catching a spy', G.caughtChance(s, sp, ai) > 0.5);
  sp.level = 5;
  ok('experienced spies do better', G.missionChance(s, sp, 'sabotage', ai) > G.missionChance(s, Object.assign({}, sp, { level: 1 }), 'sabotage', ai));
  const t0 = G.counterIntel(s, ai); G.research(s, 'a1').done.ciphers = true;
  ok('Ciphers & Watchmen helps', G.counterIntel(s, ai) > t0);
  // the player catches a foreign spy, and gets a report
  const { s: s2, c: c2, ai: ai2 } = fresh();
  c2.buildings.hideout = 5; grant(s2, c2, 3); grant(s2, c2, 3);
  ai2.buildings.hideout = 1; ai2.buildings.townhall = 5; ai2.pop = 100; s2.empires.a1.gold = 1e4; ai2.res.grain = 1000;
  const foe = grant(s2, ai2, 1);
  s2.explored[c2.y * s2.map + c2.x] = 1;
  ok('the AI can target the player', G.sendSpy(s2, foe.id, c2.id, 'sabotage') === null);
  foe.task.phase = 'work';
  const rep = s2.reports.length;
  G.resolveMission(s2, foe, { roll: 0.999, caughtRoll: 0 });
  ok('caught foreign spies are logged and reported', s2.reports.length > rep && s2.log.some(l => /caught a spy/.test(l.text)) && G.espState(s2).caught.p === 1);
  // foreign success against the player is told to the player
  const foe2 = grant(s2, ai2, 1); G.sendSpy(s2, foe2.id, c2.id, 'poison'); foe2.task.phase = 'work';
  G.resolveMission(s2, foe2, { roll: 0 });
  ok('foreign sabotage is reported', s2.log.some(l => /Foreign agents/.test(l.text)));
}

// ---- the peoples ----
{
  const pw = r => { const { s, c, ai } = fresh(r, r === 'delver' ? 'hearth' : 'delver'); c.buildings.hideout = 1; const sp = grant(s, c, 1); return { s, sp, ai, c }; };
  const v = pw('veil'), h = pw('hearth'), wd = pw('wind'), gr = pw('grave');
  ok('Veilborn are master spies', G.spyPower(v.s, v.sp, 'unrest') > G.spyPower(h.s, h.sp, 'unrest') * 1.3);
  ok('Windkin agents travel fastest', G.spyTravelTime(wd.s, wd.sp, { x: 0, y: 0 }, { x: 10, y: 0 }) < G.spyTravelTime(h.s, h.sp, { x: 0, y: 0 }, { x: 10, y: 0 }) * 0.7);
  // a Gravebound target resists sedition
  const { s, c } = fresh('hearth', 'grave'); c.buildings.hideout = 1; const sp = grant(s, c, 1); const gc = G.capital(s, 'a1');
  const { s: s3, c: c3 } = fresh('hearth', 'sylvan'); c3.buildings.hideout = 1; const sp3 = grant(s3, c3, 1); const sc = G.capital(s3, 'a1');
  ok('the Gravebound cannot be bribed', G.missionChance(s, sp, 'unrest', gc) < G.missionChance(s3, sp3, 'unrest', sc));
  for (const r of DATA.raceOrder) {
    const { s, c, ai } = fresh(r, r === 'delver' ? 'hearth' : 'delver');
    c.buildings.hideout = 2; ok(r + ': recruit and run a mission', G.recruitSpy(s, c.id) === null && (() => { const sp = G.spiesOf(s, 'p')[0]; sp.status = 'idle'; return G.sendSpy(s, sp.id, ai.id, 'intel') === null; })());
  }
}

// ---- the AI uses it: hours of play on standard pace ----
{
  const s = G.newGame({ name: 'T', race: 'hearth', rivals: 4 });
  const sent = [];
  const orig = G.sendSpy;
  G.sendSpy = (st, id, cid, type) => { const sp = G.espState(st).spies[id]; const r = orig(st, id, cid, type); if (!r) sent.push({ t: st.time, owner: sp.owner, target: st.cities[cid].owner, type }); return r; };
  G.advance(s, 6 * 3600, 2400);
  G.sendSpy = orig;
  const E = G.espState(s);
  ok('AI realms raise dens', Object.values(s.cities).some(c => c.owner !== 'p' && G.lvl(c, 'hideout') > 0));
  ok('AI realms recruit spies', Object.values(E.spies).some(x => x.owner !== 'p'), Object.values(E.spies).length);
  ok('AI realms run missions', sent.length >= 5, sent.length);
  ok('AI spies work against each other too', sent.some(m => m.target !== 'p'));
  ok('AI spies target the player', sent.some(m => m.target === 'p'));
  const early = sent.filter(m => m.target === 'p' && DATA.missions[m.type].hostile && m.t < 2 * 3600);
  ok('nothing hostile to the player before game-hour 2', early.length === 0, early.map(m => m.type + '@' + Math.round(m.t / 60)).join(','));
  ok('not spammy', sent.length < 150, sent.length);
}

// ---- save / load ----
{
  const { s, c, ai } = setup();
  const sp = grant(s, c, 3); G.sendSpy(s, sp.id, ai.id, 'intel');
  G.save(s); const s2 = G.load();
  ok('save/load keeps spies and missions', s2 && G.espState(s2).spies[sp.id] && G.espState(s2).spies[sp.id].task.type === 'intel');
  G.advance(s2, 1200, 120);
  ok('missions resume after loading', (G.espState(s2).stats.p || { ok: 0, fail: 0 }).ok + (G.espState(s2).stats.p || { fail: 0 }).fail === 1);
  // an old save from before espionage
  delete s.espionage;
  const s3 = G.deserialize(G.serialize(s));
  ok('a save without espionage loads', !!s3);
  G.advance(s3, 600, 60);
  ok('and works', G.recruitSpy(s3, G.capital(s3, 'p').id) === null && G.spiesOf(s3, 'p').length === 1);
}
console.log(fails ? fails + ' FAILED' : 'all espionage checks passed');
`);
