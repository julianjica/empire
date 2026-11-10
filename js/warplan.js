// =====================================================================
//  War plans: diplomacy-gated aggression, war declarations as decisions,
//  and real campaigns for the AI realms.
//
//  1. Gate. An AI fights a realm (its cities, armies, caravans) only while
//     at war with it (or avenging an attack on its ally, the player).
//     G.aiMayAttack / G.aiMayStrike enforce it where attacks are chosen
//     (engine aiWar, the campaigns here; intercept.js already refuses AI
//     interceptions outside war). Camps, monsters, unowned oases and free
//     cities are untouched. G.hostility keeps its graded value; it is the
//     appetite (G.appetite) the declaration logic below reads.
//  2. Declarations. Every few game-minutes each AI weighs its neighbours:
//     border cities, revenge (raids, broken pledges), the leader, weak or
//     busy targets, opposed ethos and faith, its aggression and the chosen
//     difficulty. At most one war at a time (a second only when far the
//     stronger). Pacts are honoured: breaking a non-aggression pact or
//     truce is rare and goes through G.breakTreaties (reputation). Before
//     war on the player: a "tensions rising" report, then an army massing
//     in a border city, then the declaration with its aim: raid, conquer
//     a named city, force tribute, or punish. Peace is sought when the aim
//     is met, the war drags on, or it is being lost.
//  3. Campaigns. One per AI: objective city (value, weakness, reach), a
//     scout when intel is old, a staging city near it, troops gathered
//     from several cities (each keeps a garrison sized to visible threats),
//     siege engines against walls, a general and war magi moved to the
//     staging city, one combined strike when assembled (sooner when the
//     target's army is out), then follow up, regroup or re-plan.
//     Defence: threatened cities are reinforced from neighbours, and the
//     interception AI (js/intercept.js) is woken at once.
//  4. Intel. Espionage dossiers show the realm's war plan; the council's
//     Marshal warns of armies massing at visible cities; diplomacy cards
//     show war aims.
//
//  State (lazy; old saves load as they are):
//    s.warplans = { aiId: { intent, wars:{target:{goal,city,since,mine,raids,wins,losses,peaceAt}}, camp, grudge:{target:t}, evalAt, tickAt } }
//    s.warstats = { planned, unplanned, declared, peace }
//    moves: m.campaign = aiId, m.wp = 'gather'|'strike'|'scout'|'defend'
// =====================================================================
'use strict';
(() => {
  const WP = G.WARPLAN = {
    tick: 1,            // game-minutes (× pace) between campaign steps
    evalEvery: 3,       // game-minutes (× pace) between war evaluations
    declP: 70,          // mean game-minutes (× pace) to a war on the player at score 1
    declAI: 45,         // the same between AI realms
    tension: 7,         // game-minutes (× pace) from "tensions rising" to the massing army
    massing: 7,         // and from the massing army to the declaration
    massingAI: 4,
    reach: 16,          // tiles: realms whose cities lie this close are neighbours
    reachAI: 20,        // the same between AI realms (empires rise and fall at a longer reach; the player keeps the shorter one)
    pactRare: 0.08,     // a non-aggression pact or truce cuts the odds of war this much
    peaceRare: 0.4,     // a standing peace (without treaty) this much
    intelOld: 20,       // game-minutes (× pace): intel older than this asks for a scout
    gatherMax: 16,      // game-minutes (× pace): strike with what is there after this long
    giveUp: 30,         // and give the objective up when still far too weak
    waitOpp: 3,         // game-minutes (× pace) to wait for the target's army to leave
    need: 1.3,          // the strike wants this much over the objective's (tactical) defence
    keepBase: 0.3,      // every city keeps at least this share of its troops
    keepCap: 0.45,      // the capital this share
    sendMin: 60,        // a gathering march carries at least this much attack
    wearyH: 1.1,        // game-hours (× pace) of war before weariness sets in
    peaceAsk: 10,       // game-minutes (× pace) between peace proposals to the player
    campCool: 8,        // game-minutes (× pace) after a failed campaign
    rest: 6,            // game-minutes (× pace) between a won strike and the follow-up
    restP: 14,          // the same against the player (at Fair hostility)
    burnEvery: 5,       // game-minutes (× pace) between burn raids on the foe's outer quarters (per realm)
    burnNeed: 1.6,      // a burn raid's detachment wants this much over the quarter guard's defence
    seaReach: 6,        // tiles beyond the land reach a campaign may sail to its objective
    heraldEvery: 3,     // game-minutes (× pace) between attempts to bring heralds to a war of conquest
    heraldsAI: 2,       // heralds marching with a conquest of an AI realm's city (one against the player)
  };
  const PT = s => G.pace(s).time;
  const MIN = (s, m) => m * 60 * PT(s);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const alive = (s, id) => !!(id && s.empires[id] && !s.empires[id].dead);
  const isRealm = (s, id) => !!(id && s.empires[id]);
  const nameOf = (s, id) => id === 'p' ? 'you' : `the ${(s.empires[id] || {}).name || '?'}`;
  const NameOf = (s, id) => id === 'p' ? 'You' : `The ${(s.empires[id] || {}).name || '?'}`;
  const pk = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  const safe = (fn, d = null) => { try { return fn(); } catch (e) { if (typeof console !== 'undefined') console.error('warplan', e); return d; } };
  const status = (s, a, b) => G.statusOf ? G.statusOf(s, a, b) : 'war';
  const atWar = (s, a, b) => a !== b && status(s, a, b) === 'war';
  const HOSTILE = { raid: 1, attack: 1, conquer: 1, burn: 1 };
  const GOALS = {
    raid:    { name: 'Raid',    verb: 'plunder' },
    conquer: { name: 'Conquer', verb: 'take' },
    tribute: { name: 'Tribute', verb: 'force tribute from' },
    punish:  { name: 'Punish',  verb: 'punish' },
  };
  G.WAR_GOALS = GOALS;

  const plans = s => s.warplans || (s.warplans = {});
  const planOf = (s, id) => {
    const P = plans(s);
    const p = P[id] || (P[id] = {});
    p.wars = p.wars || {}; p.grudge = p.grudge || {};
    if (p.intent === undefined) p.intent = null;
    if (p.camp === undefined) p.camp = null;
    return p;
  };
  const stats = s => s.warstats || (s.warstats = { planned: 0, unplanned: 0, declared: 0, peace: 0, strikes: 0 });
  G.warPlanOf = (s, id) => (s.warplans && s.warplans[id]) || null;
  G.warStats = stats;

  // ---------------------------------------------------------------------
  // 1. The gate
  // ---------------------------------------------------------------------
  // may ai strike target's cities, armies and caravans?
  const mayFight = (s, ai, target) => {
    if (!isRealm(s, target) || ai === target) return true;
    if (atWar(s, ai, target)) return true;
    // the player's allies (and defensive partners) avenge attacks on the player: diplomacy marks r.enemies
    if (ai !== 'p' && target !== 'p' && G.rel) {
      const r = G.rel(s, ai);
      if (r.enemies && (r.enemies[target] || 0) > s.time) return true;
    }
    return false;
  };
  G.mayFight = mayFight;
  // G.hostility keeps its graded value (an appetite and opinion measure many modules and tests read);
  // the war gate is enforced where AI attacks are chosen (G.aiMayStrike in aiWar, the campaigns here).
  G.appetite = (s, aiId, target) => G.hostility(s, aiId, target);
  G.aiMayAttack = (s, aiId, targetOwner) => mayFight(s, aiId, targetOwner);

  // ---------------------------------------------------------------------
  // War records and peace through the diplomacy API
  // ---------------------------------------------------------------------
  const PACT_FIRM = { alliance: 1, defense: 1, vassal: 1, marriage: 1, crisis: 1 };
  const declare = (s, ai, target) => {
    if (typeof G.declareWar === 'function') { G.declareWar(s, ai, target, 'war'); return; }
    if (G.hasTreaty && G.hasTreaty(s, ai, target)) G.breakTreaties(s, ai, target, 'war');
    const r = target === 'p' ? G.rel(s, ai) : G.aiRel(s, ai, target);
    r.status = 'war'; r.since = s.time;
    if (target === 'p') r.opinion = clamp((r.opinion || 0) - 15, -100, 100);
    const d = s.dip || (s.dip = {});
    d.wars = d.wars || {};
    const k = pk(ai, target);
    if (!d.wars[k]) d.wars[k] = { a: ai < target ? ai : target, b: ai < target ? target : ai, start: s.time, by: ai, pa: 0, pb: 0, battles: 0, cities: 0 };
  };
  const warScore = (s, a, b) => G.warScore ? G.warScore(s, a, b) : 0;
  const warStart = (s, a, b) => { const w = G.warInfo ? G.warInfo(s, a, b) : null; return w ? w.start : (a === 'p' || b === 'p' ? G.rel(s, a === 'p' ? b : a).since : G.aiRel(s, a, b).since) || s.time; };

  // ---------------------------------------------------------------------
  // Garrisons and strength
  // ---------------------------------------------------------------------
  const isOff = u => { const d = DATA.units[u]; return d && d.at && d.type !== 'civ' && d.type !== 'hero' && d.type !== 'siege' && d.type !== 'ship' && d.atk >= (d.defI + d.defC) / 2 * 0.8; };
  const isField = u => { const d = DATA.units[u]; return d && d.at && d.type !== 'civ' && d.type !== 'hero' && d.type !== 'siege' && d.type !== 'ship'; };
  const isSiege = u => { const d = DATA.units[u]; return d && d.type === 'siege'; };
  const atkOf = (s, owner, units) => G.atkPower(s, owner, units) * G.mod(s, owner, null, 'atk');
  const enemiesOf = (s, id) => Object.keys(s.empires).filter(x => x !== id && alive(s, x) && atWar(s, id, x));
  // what threatens a city: armies of realms at war with its owner within 12 tiles, and marches on it
  const threatOf = (s, city) => {
    const foes = enemiesOf(s, city.owner);
    let t = 0;
    if (foes.length) for (const o of Object.values(s.cities)) if (foes.includes(o.owner) && dist(o, city) <= 12) t += G.atkPower(s, o.owner, o.units) * 0.6;
    for (const m of s.moves) {
      if (!HOSTILE[m.type] || m.owner === city.owner || m.x !== city.x || m.y !== city.y) continue;
      t += G.atkPower(s, m.owner, m.units);
    }
    return t;
  };
  const defOf = (s, city, units) => { const cd = G.cityDefense(s, city); return G.defPower(s, city.owner, units || city.units) * cd.mult * G.mod(s, city.owner, null, 'def') + cd.flat; };
  // the share of its troops a city keeps at home
  const keepFrac = (s, city) => {
    const base = G.capital(s, city.owner) === city ? WP.keepCap : WP.keepBase;
    const th = threatOf(s, city);
    if (!th) return base;
    return clamp(th * 1.1 / Math.max(1, defOf(s, city)), base, 1);
  };
  G.warKeep = keepFrac;
  // the troops a city can spare for a campaign
  const spare = (s, city, opts = {}) => {
    const f = opts.keep != null ? opts.keep : keepFrac(s, city);
    const out = {};
    for (const [u, n] of Object.entries(city.units)) {
      if (!(n > 0)) continue;
      if (isSiege(u)) { if (opts.siege !== false) out[u] = n; continue; }
      if (!(opts.all ? isField(u) : isOff(u))) continue;
      const k = n - Math.max(Math.ceil(n * f), (opts.floor && opts.floor[u]) || 0);
      if (k > 0) out[u] = k;
    }
    return out;
  };

  // ---------------------------------------------------------------------
  // Estimates (cached for a few game-seconds)
  // ---------------------------------------------------------------------
  const EST = new WeakMap();
  const estDef = (s, owner, city, siege) => {
    let c = EST.get(s);
    const tick = Math.floor(s.time / 20);
    if (!c || c.tick !== tick) { c = { tick, m: new Map() }; EST.set(s, c); }
    const k = owner + ':' + city.id + ':' + (siege ? 1 : 0);
    if (c.m.has(k)) return c.m.get(k);
    const v = safe(() => {
      const cd = G.cityDefense(s, city, siege ? G.wallBreak(siege) : 0);
      return G.defPower(s, city.owner, city.units) * cd.mult * G.mod(s, city.owner, null, 'def') + cd.flat;
    }, 1e9);
    c.m.set(k, v);
    return v;
  };
  const cityValue = c => { let b = 0; for (const t in c.buildings) b += c.buildings[t]; return b + Math.sqrt(Math.max(0, c.pop)) * 2; };

  // a harbour of ours on a body of water that also touches o's shore
  const seaLink = (s, c, o) => {
    if (!G.seasOf || !G.lvl(c, 'harbor')) return false;
    const a = G.seasOf(s, c.x, c.y);
    if (!a.length) return false;
    return G.seasOf(s, o.x, o.y).some(w => a.includes(w));
  };
  // where a campaign against o gathers: the nearest city that reaches it overland, else a harbour that can sail to it
  const reachTo = target => target === 'p' ? WP.reach : WP.reachAI;
  const stagingFor = (s, ai, o, mine) => {
    let near = null, nd = 1e9, port = null, pd = 1e9;
    for (const c of mine || G.citiesOf(s, ai)) {
      const d = dist(c, o);
      if (G.landReachable(s, c, o)) { if (d < nd) { nd = d; near = c; } }
      else if (d < pd && seaLink(s, c, o)) { pd = d; port = c; }
    }
    const R = reachTo(o.owner);
    if (near && nd <= R + 2) return { staging: near, d: nd, naval: false };
    if (port && pd <= R + WP.seaReach) return { staging: port, d: pd, naval: true };
    return null;
  };
  G.warStagingFor = stagingFor;

  // the objective: a city of the target the realm can reach (overland, or by sea from a harbour), worth taking and not too strong
  const pickObjective = (s, ai, target, goal, avoid) => {
    const mine = G.citiesOf(s, ai);
    if (!mine.length) return null;
    const myA = mine.reduce((a, c) => a + atkOf(s, ai, spare(s, c)), 0);
    let best = null;
    for (const o of G.citiesOf(s, target)) {
      if (avoid && avoid[o.id] > s.time) continue;
      const st = stagingFor(s, ai, o, mine);
      if (!st) continue;
      const nd = st.d;
      const d = estDef(s, ai, o, null);
      const weak = myA / Math.max(50, d);
      const val = cityValue(o) * (goal === 'conquer' && G.capital(s, target) === o ? 0.6 : 1) * (goal === 'raid' ? 1 + Object.values(o.res || {}).reduce((a, v) => a + (v > 0 ? v : 0), 0) / 20000 : 1);
      const score = val * Math.pow(Math.min(3, weak), 2) / (6 + nd) * (st.naval ? 0.6 : 1);   // beatable cities first; a sea-borne war is the harder road
      if (!best || score > best.score) best = { city: o, staging: st.staging, score, d: nd, def: d, naval: st.naval };
    }
    return best;
  };

  // ---------------------------------------------------------------------
  // 2. Declarations
  // ---------------------------------------------------------------------
  const brokeFaith = (s, by, victim) => {
    const h = (s.dip && s.dip.hist) || [];
    for (const e of h) { if (s.time - e.t > MIN(s, 120)) break; if (e.ev === 'broken' && e.by === by && (e.a === victim || e.b === victim)) return true; }
    return false;
  };
  const nearestGap = (s, a, b) => {
    let best = 1e9;
    for (const c of G.citiesOf(s, a)) for (const o of G.citiesOf(s, b)) { const d = dist(c, o); if (d < best) best = d; }
    return best;
  };
  // how much ai wants a war on target now (0 = not at all); also returns the reasons for the goal
  const warScoreFor = (s, ai, target) => {
    const e = s.empires[ai];
    if (!alive(s, target) || target === ai || atWar(s, ai, target)) return null;
    if (target === 'p') {
      const h = s.settings.hostility ?? 0.85;
      if (!(h > 0)) return null;
      // the player is not dog-piled: at most 1 (easy), 2 (normal) or 3 (hard) realms make war on it at once
      const cap = h < 0.7 ? 1 : h < 1.1 ? 2 : 3;
      let n = 0;
      for (const [id, P] of Object.entries(s.warplans || {})) if (id !== ai && alive(s, id) && (atWar(s, id, 'p') || (P && P.intent && P.intent.target === 'p'))) n++;
      if (n >= cap) return null;
    }
    if (G.crisisWarBlocked && G.crisisWarBlocked(s, ai, target)) return null;
    if (G.liegeOf && (G.liegeOf(s, ai) || G.liegeOf(s, target) === ai)) return null;
    const ts = G.treatiesOf ? G.treatiesOf(s, ai, target) : [];
    if (ts.some(t => PACT_FIRM[t.kind])) return null;
    const pressure = G.aiPressure(s);
    if (pressure < 0.2) return null;
    const gap = nearestGap(s, ai, target);
    if (gap > reachTo(target)) return null;
    const pacted = ts.some(t => t.kind === 'nap' || t.kind === 'truce');
    let app = G.appetite(s, ai, target);
    if (!(app > 0) && pacted) app = target === 'p' ? clamp(1 - (G.rel(s, ai).opinion || 0) / 80, 0.15, 1.6) : 0.6;   // diplomacy reads 0 under a pact
    if (!(app > 0)) return null;
    const pa = Math.max(1, G.power(s, ai)), pb = Math.max(1, G.power(s, target));
    const ratio = pa / pb;
    if (ratio < 0.75) return null;
    let sc = app * (e.aggr != null ? e.aggr : 0.45) * pressure;
    if (target === 'p') sc *= (s.settings.hostility ?? 0.85) / 0.85;
    sc *= 1 + Math.max(0, 12 - gap) / 12;                                      // border cities, land within reach
    sc *= clamp(ratio, 0.75, target === 'p' ? 1.6 : 2.5) / 1.2;               // opportunism: weak targets (a small player is not bullied without end)
    if (target !== 'p') sc *= 1 + 0.5 * pressure;                              // late in the game the realms turn on each other
    const P = planOf(s, ai);
    const revenge = (P.grudge[target] || -1e9) > s.time - MIN(s, 90) || brokeFaith(s, target, ai);
    if (revenge) sc *= 1.6;
    if (enemiesOf(s, target).length) sc *= 1.3;                                // already fighting elsewhere
    if (G.faithOf) { const fa = G.faithOf(s, ai), fb = G.faithOf(s, target); if (fa && fb && fa !== fb) sc *= 1.15; }
    if (G.ethosAffinity) sc *= clamp(1 - 0.12 * (G.ethosAffinity(s, ai, target) || 0), 0.6, 1.5);
    if (pacted) sc *= WP.pactRare;
    else if (status(s, ai, target) === 'peace' || status(s, ai, target) === 'alliance') sc *= target === 'p' || ai === 'p' ? WP.peaceRare : 0.85;   // between AIs a lapsed truce leaves only a nominal peace
    return { score: sc, ratio, revenge, gap };
  };
  G.warAppetiteScore = warScoreFor;
  const chooseGoal = (s, ai, target, w) => {
    const e = s.empires[ai], pressure = G.aiPressure(s);
    const myN = G.citiesOf(s, ai).length, theirN = G.citiesOf(s, target).length;
    const opts = [['raid', 1.2]];
    if (w.revenge) opts.push(['punish', 2]);
    const heralds = G.citiesOf(s, ai).some(c => (c.units.herald || 0) > 0);
    // between AI realms empires rise and fall: conquest is the likelier aim (the player is spared the same appetite)
    const ai2 = target !== 'p';
    if (w.ratio >= (ai2 ? 1.15 : 1.25) && pressure > 0.45 && myN < G.aiCityCap(s) + 1 && theirN > 1) opts.push(['conquer', 1 + (e.aggr || 0.45) * 2 + (w.ratio - 1.25) + (heralds ? 2 : 0) + (ai2 ? 1 : 0)]);
    if (w.ratio >= 1.1) opts.push(['tribute', 1]);
    let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
    for (const [g, k] of opts) { r -= k; if (r <= 0) return g; }
    return opts[0][0];
  };
  const goalText = (s, W) => {
    const c = W.city && s.cities[W.city];
    if (W.goal === 'conquer') return c ? `to conquer ${c.name}` : 'conquest';
    if (W.goal === 'raid') return c ? `to plunder ${c.name} and the lands around it` : 'plunder';
    if (W.goal === 'tribute') return 'to force tribute';
    return 'to punish past wrongs';
  };
  G.warGoalText = (s, ai, target) => { const P = G.warPlanOf(s, ai), W = P && P.wars && P.wars[target]; return W ? goalText(s, W) : null; };

  const report = (s, title, kind, extra) => { if (G.report) G.report(s, ['p'], title, kind, { extra }); };
  const near = (s, owner, c) => { let b = null, bd = 1e9; for (const o of G.citiesOf(s, owner)) { const d = dist(o, c); if (d < bd) { bd = d; b = o; } } return b ? { city: b, d: bd } : null; };
  const seenBy = (s, c) => !!(s.explored && s.explored[c.y * s.map + c.x]);

  const startWar = (s, ai, target, goal, cityId) => {
    declare(s, ai, target);
    const P = planOf(s, ai);
    P.wars[target] = { goal, city: cityId || null, since: s.time, mine: true, raids: 0, wins: 0, losses: 0 };
    stats(s).declared++;
    const W = P.wars[target];
    if (target === 'p') {
      G.log(s, 'p', `⚔️ The ${s.empires[ai].name} declare war on you! Their aim: ${goalText(s, W)}.`, 'bad');
      report(s, `⚔️ The ${s.empires[ai].name} declare war`, 'loss', `War aim: ${GOALS[goal].name} — ${goalText(s, W)}.`);
    } else if (G.citiesOf(s, ai).concat(G.citiesOf(s, target)).some(c => seenBy(s, c))) {
      G.log(s, 'p', `⚔️ The ${s.empires[ai].name} declare war on the ${s.empires[target].name} (${goalText(s, W)}).`, 'warn');
    }
  };

  // adopt wars started elsewhere (diplomacy, alliances, demands) with an aim of their own
  const syncWars = (s, ai) => {
    const P = planOf(s, ai);
    for (const t of Object.keys(P.wars)) if (!alive(s, t) || !atWar(s, ai, t)) delete P.wars[t];
    for (const t of enemiesOf(s, ai)) {
      if (P.wars[t]) continue;
      const w = G.warInfo ? G.warInfo(s, ai, t) : null;
      const mine = !!(w && w.by === ai);
      const ratio = Math.max(1, G.power(s, ai)) / Math.max(1, G.power(s, t));
      const goal = mine ? chooseGoal(s, ai, t, { ratio, revenge: false }) : (ratio >= 1.4 ? 'punish' : 'raid');
      P.wars[t] = { goal, city: null, since: warStart(s, ai, t), mine, raids: 0, wins: 0, losses: 0 };
    }
  };

  const evaluateWars = (s, ai) => {
    const P = planOf(s, ai), e = s.empires[ai];
    // an intent in progress: tensions, then the massing army, then war
    if (P.intent) {
      const I = P.intent;
      const w = warScoreFor(s, ai, I.target);
      if (!w || w.score < 0.02) {
        if (I.target === 'p' && I.stage !== 'quiet') G.log(s, 'p', `🕊️ The ${e.name} stand down; the tension along the border eases.`, 'info');
        if (P.camp && P.camp.pre) P.camp = null;
        P.intent = null;
        return;
      }
      if (s.time < I.at) return;
      if (I.stage === 'tension') {
        I.stage = 'massing'; I.at = s.time + MIN(s, WP.massing);
        openCampaign(s, ai, I.target, I.goal, I.city, true);
        const C = P.camp, st = C && s.cities[C.staging];
        if (st && I.target === 'p') {
          const n = near(s, 'p', st);
          const where = seenBy(s, st) ? `at ${st.name}${n ? `, ${Math.round(n.d)} tiles from ${n.city.name}` : ''}` : 'somewhere beyond the border';
          G.log(s, 'p', `🚩 The ${e.name} mass troops ${where}.`, 'warn');
          report(s, `🚩 The ${e.name} mass troops ${seenBy(s, st) ? 'at ' + st.name : 'near the border'}`, 'info', `Columns march to ${seenBy(s, st) ? st.name : 'a border city'} from across their realm. War may follow within minutes unless you mend relations, sign a pact or make the attempt too costly.`);
        }
        return;
      }
      // massing: declare
      P.intent = null;
      const objective = (P.camp && P.camp.target === I.target && P.camp.city) || I.city;
      startWar(s, ai, I.target, I.goal, objective);
      if (P.camp && P.camp.target === I.target) P.camp.pre = false;
      return;
    }
    // wars in hand: no new one unless far the stronger
    const wars = enemiesOf(s, ai);
    if (wars.length >= 2) return;
    if (wars.length === 1) {
      const foeP = wars.reduce((a, x) => a + Math.max(1, G.power(s, x)), 0);
      if (G.power(s, ai) < 2.2 * foeP) return;
    }
    let best = null;
    for (const t of Object.keys(s.empires)) {
      if (t === ai || !alive(s, t)) continue;
      const w = warScoreFor(s, ai, t);
      if (!w || !(w.score > 0)) continue;
      if (!best || w.score > best.w.score) best = { t, w };
    }
    if (!best) return;
    const mean = (best.t === 'p' ? WP.declP : WP.declAI) * PT(s);
    const p = Math.min(0.6, best.w.score * WP.evalEvery * PT(s) / mean);
    if (Math.random() >= p) return;
    const goal = chooseGoal(s, ai, best.t, best.w);
    const obj = pickObjective(s, ai, best.t, goal);
    if (best.t === 'p') {
      P.intent = { target: 'p', stage: 'tension', at: s.time + MIN(s, WP.tension), goal, city: obj ? obj.city.id : null, since: s.time };
      G.log(s, 'p', `🌩️ Tensions rise with the ${e.name}: their envoys grow cold and their marshals busy.`, 'warn');
      report(s, `🌩️ Tensions rise with the ${e.name}`, 'info', `Their court speaks of ${best.w.revenge ? 'old wrongs' : 'your borders'}. A gift, a pact or a show of strength may cool them; otherwise expect their armies to gather.`);
    } else {
      P.intent = { target: best.t, stage: 'tension', at: s.time, goal, city: obj ? obj.city.id : null, since: s.time };
      // AI realms skip the public warnings and mass for a shorter while
      P.intent.stage = 'massing'; P.intent.at = s.time + MIN(s, WP.massingAI);
      openCampaign(s, ai, best.t, goal, P.intent.city, true);
    }
  };

  // peace: the aim is met, the war drags on, or it is being lost
  const goalMet = (s, ai, t, W) => {
    const ws = warScore(s, ai, t);
    if (W.goal === 'conquer') { const c = W.city && s.cities[W.city]; return !!(c && c.owner === ai) || (!c && W.wins >= 2); }
    if (W.goal === 'raid') return W.raids >= 3 || ws >= 40;
    if (W.goal === 'tribute') return ws >= 25;
    return ws >= 20 || W.wins >= 2;
  };
  G.warGoalMet = (s, ai, t) => { const P = G.warPlanOf(s, ai), W = P && P.wars[t]; return !!(W && goalMet(s, ai, t, W)); };
  const seekPeace = (s, ai) => {
    const P = planOf(s, ai);
    for (const [t, W] of Object.entries(P.wars)) {
      if (!atWar(s, ai, t)) continue;
      if (W.peaceAt && s.time < W.peaceAt) continue;
      const ws = warScore(s, ai, t);
      const ageH = (s.time - (W.since || s.time)) / (3600 * PT(s));
      const ratio = Math.max(1, G.power(s, ai)) / Math.max(1, G.power(s, t));
      const met = goalMet(s, ai, t, W);
      const losing = ws <= -30 || (ratio < 0.55 && s.time - (W.since || s.time) > MIN(s, 10));
      const weary = ageH > WP.wearyH * (1 + (s.empires[ai].aggr || 0.45)) * (W.goal === 'conquer' ? 1.8 : 1) && ws < 15;
      if (!met && !losing && !weary) continue;
      W.peaceAt = s.time + MIN(s, WP.peaceAsk);
      if (t === 'p') {
        // offers left unanswered: a realm whose aim is won (or that is weary or beaten) withdraws and swears a truce
        if ((W.offers || 0) >= 2 && G.signTreaty) {
          G.signTreaty(s, 'truce', ai, 'p', { by: ai, quiet: true });
          if (!atWar(s, ai, 'p')) {
            stats(s).peace++; delete P.wars.p; if (P.camp && P.camp.target === 'p') P.camp = null;
            G.log(s, 'p', `🕊️ The ${s.empires[ai].name} ${met ? 'deem their war aim won' : losing ? 'give up the fight' : 'tire of the war'}: they withdraw and swear a truce.`, 'info');
          }
          continue;
        }
        if ((s.pending || []).some(p => p.data && p.data.ai === ai)) continue;
        if (!G.aiProposeTo) continue;
        let prop;
        if (met && W.goal === 'tribute') {
          const n = Math.max(10, Math.round((20 + Math.max(0, s.empires.p.gold) * 0.02) * G.pace(s).prod / 5) * 5);
          prop = { deal: { ai, give: [{ t: 'gph', n, mins: 60 }], take: [], both: [{ t: 'peace' }] }, why: 'Their war aim won, they offer peace for tribute', demand: true };
        } else if (met) prop = { deal: { ai, give: [], take: [], both: [{ t: 'peace' }] }, why: `Their war aim (${GOALS[W.goal].name.toLowerCase()}) won, they offer peace` };
        else prop = { deal: { ai, give: [], take: [], both: [{ t: 'peace' }] }, why: losing ? 'They sue for peace' : 'Weary of war, they propose a white peace' };
        if (safe(() => G.aiProposeTo(s, ai, prop))) W.offers = (W.offers || 0) + 1;
        continue;
      }
      // between AI realms: the other side agrees unless it is winning and hungry
      const PO = planOf(s, t), WO = PO.wars[ai];
      const oAgeH = WO ? (s.time - (WO.since || s.time)) / (3600 * PT(s)) : 0;
      const otherWants = WO && !goalMet(s, t, ai, WO) && warScore(s, t, ai) > -10 && oAgeH < WP.wearyH * (1 + (s.empires[t].aggr || 0.45)) * (WO.goal === 'conquer' ? 1.8 : 1);
      // a conqueror whose objective already wavers (loyalty lowered) does not let go
      const oc = WO && WO.goal === 'conquer' && WO.city && s.cities[WO.city];
      const closing = !!(oc && oc.owner === ai && (oc.loyalty ?? 100) < 90 && warScore(s, t, ai) >= 0);
      if (otherWants && (closing || Math.random() > 0.1)) continue;
      const winner = ws >= 0 ? ai : t, loser = winner === ai ? t : ai;
      // a war of conquest won on the field: the loser yields the city it was fought for
      const WW = winner === ai ? W : WO, prize = WW && WW.goal === 'conquer' && WW.city && s.cities[WW.city];
      if (prize && prize.owner === loser && Math.abs(ws) >= 40 && G.citiesOf(s, loser).length >= 2 && G.capital(s, loser) !== prize && G.cedeCity && Math.random() < 0.6) {
        if (!G.cedeCity(s, prize, winner, { loyalty: 40 })) stats(s).ceded = (stats(s).ceded || 0) + 1;
      }
      if (met && W.goal === 'tribute' && winner === ai && G.signTreaty) {
        const n = Math.max(10, Math.round(G.citiesOf(s, loser).length * 12 * G.pace(s).prod));
        G.signTreaty(s, 'tribute', loser, ai, { by: ai, quiet: true, n });
      }
      if (G.signTreaty) G.signTreaty(s, 'truce', ai, t, { by: loser, quiet: false });
      if (!atWar(s, ai, t)) { stats(s).peace++; delete P.wars[t]; delete PO.wars[ai]; if (P.camp && P.camp.target === t) P.camp = null; if (PO.camp && PO.camp.target === ai) PO.camp = null; }
    }
  };

  // ---------------------------------------------------------------------
  // 3. Campaigns
  // ---------------------------------------------------------------------
  const tagLast = (s, owner, fromId, wp) => {
    const m = s.moves[s.moves.length - 1];
    if (m && m.owner === owner && m.from === fromId && m.depart === s.time) { m.campaign = owner; m.wp = wp; return m; }
    return null;
  };
  const siegeUnitOf = (s, ai) => {
    const race = DATA.races[s.empires[ai].race];
    return (race && race.units || []).filter(u => isSiege(u)).sort((a, b) => (DATA.units[b].wallBreak || 0) - (DATA.units[a].wallBreak || 0))[0] || null;
  };
  // the garrison a city keeps through a campaign: fixed the first time the campaign counts on it, so repeated
  // gathering never strips it (more may stay when threats grow; new recruits may go)
  const floorOf = (s, C, c) => {
    C.keep = C.keep || {};
    if (!C.keep[c.id]) { const f = keepFrac(s, c); C.keep[c.id] = Object.fromEntries(Object.entries(c.units).filter(([u, n]) => n > 0 && isField(u)).map(([u, n]) => [u, Math.ceil(n * f)])); }
    return C.keep[c.id];
  };
  const openCampaign = (s, ai, target, goal, cityId, pre) => {
    const P = planOf(s, ai);
    if (P.camp && P.camp.target === target && !P.camp.pre) return P.camp;
    const obj = (cityId && s.cities[cityId] && s.cities[cityId].owner === target) ? (() => {
      const o = s.cities[cityId];
      const st = stagingFor(s, ai, o);
      return st ? { city: o, staging: st.staging, naval: st.naval } : null;
    })() || pickObjective(s, ai, target, goal, P.campAvoid) : pickObjective(s, ai, target, goal, P.campAvoid);
    if (!obj) { P.camp = null; return null; }
    P.camp = { target, city: obj.city.id, staging: obj.staging.id, phase: 'scout', since: s.time, from: [], sent: {}, move: null, wins: 0, losses: 0, pre: !!pre, naval: !!obj.naval };
    if (obj.naval) stats(s).navalCamps = (stats(s).navalCamps || 0) + 1;
    return P.camp;
  };
  G.openCampaign = openCampaign;

  const dropCamp = (s, P, C) => {
    P.campAvoid = P.campAvoid || {};
    for (const [k, v] of Object.entries(P.campAvoid)) if (v <= s.time) delete P.campAvoid[k];
    P.campAvoid[C.city] = s.time + MIN(s, 30);
    P.camp = null;
    P.campCool = s.time + MIN(s, 1);     // the next tick re-plans against another city; planCampaign cools down if none is left
  };
  const intelAge = (s, ai, city) => {
    const D = G.espState ? (G.espState(s).dossiers[ai] || {}) : {};
    const t = Math.max(D[city.id] ? D[city.id].t : -1e9, (planOf(s, ai).camp || {}).scouted || -1e9);
    return s.time - t;
  };

  // ---- burn raids: a detachment puts a rich outer quarter of the foe to the torch (mission 'burn', js/quarters.js):
  // plunder, a quarter that yields nothing for a while and −5 loyalty (which softens a city before a conquest)
  const playerRaidOk = (s, ai, o) => {
    const pressure = G.aiPressure(s), emp = s.empires[ai];
    if (!(pressure > 0) || !((s.settings.hostility ?? 0.85) > 0)) return false;
    return s.time - (o.lastRaided || -1e9) >= 1200 * PT(s) / Math.max(0.3, pressure) && s.time - (emp.lastHitP || -1e9) >= 900 * PT(s) / Math.max(0.4, pressure);
  };
  const qtrWorth = (s, city, q) => { const y = safe(() => G.qtrYield(s, city, q), {}) || {}; let v = 0; for (const g in y) v += y[g] * ((DATA.goods[g] && DATA.goods[g].value) || 1); return v; };
  const qtrGuard = (s, city, q) => safe(() => {
    const d = G.qtrDefenders(s, city, q);
    return G.defPower(s, city.owner, d.units) * (d.walled || q.type === 'fort' ? d.mult : 1) * G.mod(s, city.owner, null, 'def') + d.flat;
  }, 1e9);
  const burnRaid = (s, ai, from, cities, opts = {}) => {
    if (!G.qtrDefenders || !G.moveHandlers || !G.moveHandlers.burn || !from) return false;
    const units = spare(s, from, { floor: opts.floor, siege: false });
    const A = atkOf(s, ai, units);
    if (A < WP.sendMin) return false;
    let best = null;
    for (const o of cities) {
      if (!o || o.owner === ai || !mayFight(s, ai, o.owner) || !(o.quarters && o.quarters.length)) continue;
      if (o.owner === 'p' && !playerRaidOk(s, ai, o)) continue;
      for (const q of o.quarters) {
        if (!q.built || q.burnt > s.time) continue;
        const tl = G.tileAt(s, q.x, q.y);
        if (!tl || tl.city || tl.quarter !== o.id) continue;
        const qd = dist(from, q);
        if (qd > WP.reach + 2 || !G.landReachable(s, from, q)) continue;
        const d = qtrGuard(s, o, q);
        if (A < d * WP.burnNeed) continue;
        const v = (qtrWorth(s, o, q) + 2) * (opts.focus === o.id ? 1.6 : 1) / (4 + qd) / Math.sqrt(1 + d / 150);
        if (!best || v > best.v) best = { o, q, d, v };
      }
    }
    if (!best) return false;
    // what the raid needs (with a margin), not the whole army
    const f = clamp(best.d * WP.burnNeed * 1.5 / Math.max(1, A), 0.2, 1);
    const det = {};
    for (const [u, n] of Object.entries(units)) { const k = Math.min(n, Math.ceil(n * f)); if (k > 0) det[u] = k; }
    if (atkOf(s, ai, det) < best.d * WP.burnNeed) return false;
    if (G.sendArmy(s, from.id, best.q.x, best.q.y, 'burn', det)) return false;
    tagLast(s, ai, from.id, 'burn');
    stats(s).burns = (stats(s).burns || 0) + 1;
    best.o.lastRaided = s.time;
    if (best.o.owner === 'p') s.empires[ai].lastHitP = s.time;
    return true;
  };
  G.warBurnRaid = burnRaid;
  // the foe's cities near a city of ours (whose quarters a raid from it may reach)
  const foeCitiesNear = (s, from, target, r) => G.citiesOf(s, target).filter(o => dist(o, from) <= (r || WP.reach + 4));

  // ---- heralds for a war of conquest: brought from the realm's other cities, else trained (goods sold for the gold)
  const heraldsWanted = (s, target) => target === 'p' ? 1 : WP.heraldsAI;
  const raiseGold = (s, city, need) => {
    const emp = s.empires[city.owner];
    if (!G.lvl(city, 'market') || !G.trade || !(need > 0)) return;
    const cap = G.storageCap(s, city);
    for (const g of Object.keys(DATA.goods)) {
      if (emp.gold >= need || g === 'mana' || !DATA.goods[g].raw) continue;
      const extra = Math.floor((city.res[g] || 0) - cap * 0.45);
      if (extra < 20) continue;
      const rate = safe(() => G.marketRates(s, city, g).sell, 0);
      if (!(rate > 0)) continue;
      safe(() => G.trade(s, city.id, g, Math.min(extra, Math.ceil((need - emp.gold) / rate) + 1), 'sell'));
    }
  };
  const bringHeralds = (s, ai, C, stage) => {
    const want = heraldsWanted(s, C.target);
    const coming = s.moves.filter(m => m.owner === ai && m.x === stage.x && m.y === stage.y && m.type === 'reinforce').reduce((a, m) => a + (m.units.herald || 0), 0);
    let queued = 0;
    for (const c of G.citiesOf(s, ai)) for (const q of c.train.townhall || []) if (q.unit === 'herald') queued += q.left || 1;
    let lack = want - (stage.units.herald || 0) - coming - queued;
    if (lack <= 0) return;
    for (const c of G.citiesOf(s, ai)) {
      if (lack <= 0) break;
      if (c === stage || !(c.units.herald > 0) || !G.landReachable(s, c, stage)) continue;
      const n = Math.min(lack, c.units.herald);
      if (!G.sendArmy(s, c.id, stage.x, stage.y, 'reinforce', { herald: n })) { tagLast(s, ai, c.id, 'gather'); lack -= n; }
    }
    if (lack <= 0) return;
    // train one: at the staging city, or at the realm's best town hall from which it can walk there
    const emp = s.empires[ai];
    const at = [stage, ...G.citiesOf(s, ai).filter(c => c !== stage && G.landReachable(s, c, stage)).sort((a, b) => G.lvl(b, 'townhall') - G.lvl(a, 'townhall'))]
      .find(c => G.lvl(c, 'townhall') >= DATA.units.herald.req && !(c.train.townhall || []).length);
    if (!at) return;
    const cost = G.unitCost(s, ai, 'herald');
    if (emp.gold < (cost.gold || 0)) raiseGold(s, at, cost.gold || 0);
    safe(() => { if (G.trainStatus(s, at, 'herald').ok) G.queueTrain(s, at.id, 'herald', 1); });
  };

  // ---- a sea-borne strike: the staging harbour's ships carry what they can (engine aiStrike's naval path)
  const navalStrike = (s, ai, stage, obj, army, D, goal) => {
    if (!G.aiStrike) return null;
    const off = {};
    for (const [u, n] of Object.entries(army)) if (isField(u) && n > 0) off[u] = n;
    const st = safe(() => G.aiStrike(s, stage, off, { x: obj.x, y: obj.y, type: goal === 'conquer' ? 'conquer' : goal === 'raid' ? 'raid' : 'attack', d: D }, goal === 'conquer' && (stage.units.herald || 0) > 0));
    return st && (st.naval || st.air) ? st : null;
  };
  // ships for a sea-borne campaign: transports enough for the army (up to 3), queued at the staging harbour
  const shipsFor = (s, ai, stage, army) => {
    if (!G.lvl(stage, 'harbor') || (stage.train.harbor || []).length) return;
    let pop = 0;
    for (const [u, n] of Object.entries(army)) if (isField(u)) pop += n * Math.max(1, G.unitPop(u));
    const want = Math.min(3, Math.ceil(pop * 0.8 / ((DATA.units.transport && DATA.units.transport.capacity) || 30)));
    const have = (stage.units.transport || 0) + s.moves.filter(m => m.owner === ai && m.from === stage.id).reduce((a, m) => a + (m.units.transport || 0), 0);
    if (have >= want) return;
    safe(() => { if (G.trainStatus(s, stage, 'transport').ok && G.canAfford(s, stage, G.unitCost(s, ai, 'transport'))) G.queueTrain(s, stage.id, 'transport', 1); });
  };

  const stepCampaign = (s, ai) => {
    const P = planOf(s, ai), C = P.camp;
    if (!C) return;
    const target = C.target;
    const obj = s.cities[C.city], stage = s.cities[C.staging];
    // the objective fell, changed hands or the war ended
    if (!obj || obj.owner !== target || !alive(s, target) || (!C.pre && !atWar(s, ai, target)) || !stage || stage.owner !== ai) {
      if (obj && obj.owner === ai && P.wars[target]) P.wars[target].wins++;
      P.camp = null;
      return;
    }
    const W = P.wars[target];
    const goal = W ? W.goal : (P.intent && P.intent.goal) || 'raid';
    // the aim is won: no more strikes; peace is sought instead
    if (W && goalMet(s, ai, target, W)) { P.camp = null; return; }
    // ---- scout
    if (C.phase === 'scout') {
      if (intelAge(s, ai, obj) > MIN(s, WP.intelOld) && !C.scoutSent && (stage.units.scout || 0) > 0 && G.landReachable(s, stage, obj)) {
        if (!G.sendArmy(s, stage.id, obj.x, obj.y, 'scout', { scout: 1 })) tagLast(s, ai, stage.id, 'scout');
        C.scoutSent = s.time;
      }
      C.scouted = s.time;     // what the realm knows (the scout's report or the last dossier) frames the plan
      C.phase = 'gather'; C.since = s.time;
    }
    // ---- move a general and war magi to the staging city
    if (!C.lead) {
      C.lead = true;
      safe(() => {
        if (G.generalsOf && G.stationGeneral && !G.generalsAt(s, ai, stage.id).length) {
          const g = G.generalsOf(s, ai).filter(g => g.status === 'home' && g.hp >= 40 && g.city !== stage.id).sort((a, b) => b.level - a.level)[0];
          if (g) G.stationGeneral(s, ai, g.id, stage.id);
        }
        if (G.magiOf && G.stationMagus) for (const g of G.magiOf(s, ai)) if (g.station === 'war' && g.status === 'home' && g.city !== stage.id) G.stationMagus(s, ai, g.id, 'war', stage.id);
      });
    }
    const walls = G.lvl(obj, 'wall');
    // ---- siege engines when there are walls
    if (walls >= 1 && C.phase === 'gather' && !C.siegeQ && !C.naval) {
      const have = Object.entries(stage.units).some(([u, n]) => isSiege(u) && n > 0);
      if (!have) {
        const su = siegeUnitOf(s, ai);
        if (su && !G.queueTrain(s, stage.id, su, Math.max(1, Math.min(4, Math.ceil(walls / 3))))) C.siegeQ = s.time;
        else C.siegeQ = -1;   // none to be had here: donors may still bring some
      } else C.siegeQ = s.time;
    }
    if (C.phase === 'gather') {
      // gather from the other cities of the realm
      for (const c of G.citiesOf(s, ai)) {
        if (c === stage || !G.landReachable(s, c, stage) || dist(c, stage) > 20) continue;
        if ((C.sent[c.id] || -1e9) > s.time - MIN(s, 4)) continue;
        const units = spare(s, c, { floor: floorOf(s, C, c) });
        if (atkOf(s, ai, units) < WP.sendMin && !Object.keys(units).some(isSiege)) continue;
        if (!G.sendArmy(s, c.id, stage.x, stage.y, 'reinforce', units)) {
          tagLast(s, ai, c.id, 'gather');
          C.sent[c.id] = s.time;
          if (!C.from.includes(c.id)) C.from.push(c.id);
        }
      }
      if (goal === 'conquer' && (stage.units.herald || 0) < heraldsWanted(s, target) && (C.heraldQ || -1e9) <= s.time - MIN(s, WP.heraldEvery)) {
        C.heraldQ = s.time;
        safe(() => bringHeralds(s, ai, C, stage));
      }
      if (C.pre || (C.restUntil || 0) > s.time) return;     // massing before a declaration, or resting: no strike yet
      const enRoute = s.moves.some(m => m.owner === ai && m.wp === 'gather' && m.x === stage.x && m.y === stage.y);
      const army = spare(s, stage, { floor: floorOf(s, C, stage) });
      const naval = !!C.naval || !G.landReachable(s, stage, obj);
      if (naval) shipsFor(s, ai, stage, army);
      const siege = naval ? {} : Object.fromEntries(Object.entries(army).filter(([u]) => isSiege(u)));
      const A = atkOf(s, ai, army);
      let D = estDef(s, ai, obj, siege);
      // within reach on the rough count: the tactical estimate (ground, counters, walls breached by the engines)
      if (A >= D * 0.4) D = safe(() => {
        const cd = G.cityDefense(s, obj, G.wallBreak(siege));
        const r = G.battle(s, ai, army, 1, obj.owner, obj.units, cd.mult, cd.flat, { mode: goal === 'raid' ? 'raid' : 'attack', x: obj.x, y: obj.y });
        return A * r.D / Math.max(1, r.A);
      }, D);
      const ready = A >= D * WP.need && (!enRoute || s.time - C.since > MIN(s, WP.gatherMax / 2)) && (C.from.length > 0 || C.assembled || G.citiesOf(s, ai).length < 2 || s.time - C.since > MIN(s, WP.gatherMax));
      const late = s.time - C.since > MIN(s, WP.gatherMax) && A >= D * 1.1 && !enRoute;
      if (!ready && !late) {
        // not strong enough for the assault yet: a quick raid on the foe's rich outer quarters plunders and softens it
        // (−5 loyalty each, which a conquest's heralds then finish)
        if ((P.burnAt || 0) <= s.time) {
          P.burnAt = s.time + MIN(s, WP.burnEvery);
          if (!naval) safe(() => burnRaid(s, ai, stage, [obj, ...foeCitiesNear(s, stage, target)], { floor: floorOf(s, C, stage), focus: obj.id }));
        }
        if (s.time - C.since > MIN(s, WP.giveUp)) dropCamp(s, P, C);
        return;
      }
      // a war of conquest waits (briefly) for its heralds: a strike without one cannot take the city
      if (goal === 'conquer' && !(stage.units.herald > 0) && !late && s.time - C.since < MIN(s, WP.gatherMax)
        && s.moves.some(m => m.owner === ai && m.x === stage.x && m.y === stage.y && (m.units.herald || 0) > 0)) return;
      // wait a little for the target's army to march out (a war of conquest presses on after its first win)
      const out = s.moves.some(m => m.owner === target && m.from === obj.id && HOSTILE[m.type]);
      if (!(goal === 'conquer' && C.wins > 0)) {
        if (!out && !C.waitFrom) { C.waitFrom = s.time; return; }
        if (!out && s.time - C.waitFrom < MIN(s, WP.waitOpp) && !late) return;
      }
      launch(s, ai, C, stage, obj, army, A, D, goal, naval);
      return;
    }
    if (C.phase === 'march') {
      const m = s.moves.find(x => x.id === C.move);
      if (m && m.wp === 'strike') return;
      C.phase = 'after';
    }
    if (C.phase === 'after') {
      const won = C.result === 'win';
      C.result = null; C.move = null; C.waitFrom = 0;
      if (won) {
        C.wins++; C.phase = 'gather'; C.since = s.time; C.from = []; C.sent = {}; C.heraldQ = 0; C.assembled = true;
        // a breather before the follow-up (longer against the player, scaled by the hostility setting; none in a war of conquest)
        C.restUntil = target === 'p' ? s.time + MIN(s, WP.restP * 0.85 / Math.max(0.3, s.settings.hostility ?? 0.85)) : goal === 'conquer' ? 0 : s.time + MIN(s, WP.rest);
        return;
      }
      C.losses++;
      if (C.losses >= 2) { dropCamp(s, P, C); return; }
      C.phase = 'gather'; C.since = s.time; C.from = []; C.sent = {};
    }
  };

  const launch = (s, ai, C, stage, obj, army, A, D, goal, naval) => {
    let units = { ...army };
    let type = goal === 'conquer' ? 'attack' : goal === 'punish' ? 'attack' : 'raid';
    // a conquest of an AI realm's city marches with two heralds when it has them (each lowers loyalty); one against the player
    if (goal === 'conquer' && (stage.units.herald || 0) > 0 && A >= D * WP.need) { units.herald = Math.min(stage.units.herald, heraldsWanted(s, obj.owner)); type = 'conquer'; }
    else if (goal === 'conquer' && !(stage.units.herald > 0)) safe(() => bringHeralds(s, ai, C, stage));
    if (naval) {
      // across the water: what the staging harbour's ships carry (engine aiStrike), or wait for ships
      const st = navalStrike(s, ai, stage, obj, army, D, goal);
      if (!st) { C.waitFrom = 0; if (s.time - C.since > MIN(s, WP.giveUp)) dropCamp(s, planOf(s, ai), C); return; }
      units = st.units; type = st.type;
    }
    const ratio = A / Math.max(1, D);
    const orders = { stance: type === 'conquer' ? 'siege' : ratio > 2.5 ? 'aggressive' : type === 'raid' ? 'skirmish' : 'balanced', general: null };
    if (G.generalsAt) { const g = G.generalsAt(s, ai, stage.id).filter(g => g.hp >= 40).sort((a, b) => b.level - a.level)[0]; if (g && !G.generalAvailable(s, ai, g.id, stage.id)) orders.general = g.id; }
    let err = G.sendArmyWith ? G.sendArmyWith(s, stage.id, obj.x, obj.y, type, units, undefined, orders) : G.sendArmy(s, stage.id, obj.x, obj.y, type, units);
    if (err && orders.general) { orders.general = null; err = G.sendArmyWith(s, stage.id, obj.x, obj.y, type, units, undefined, orders); }
    if (err) { C.waitFrom = 0; C.since = s.time; return; }
    const m = tagLast(s, ai, stage.id, 'strike');
    C.move = m ? m.id : null; C.phase = 'march'; C.launched = s.time;
    stats(s).strikes++;
    if (m && m.naval) { stats(s).naval = (stats(s).naval || 0) + 1; const emp = s.empires[ai]; if (emp) emp.seaAt = s.time + MIN(s, 10); }
    obj.lastRaided = s.time;
    if (obj.owner === 'p' && s.empires[ai]) s.empires[ai].lastHitP = s.time;
  };

  // which city's troops belong to a campaign (the old opportunistic war code leaves them be)
  G.aiCampaignCity = (s, c) => {
    const P = s.warplans && s.warplans[c.owner];
    return !!(P && P.camp && P.camp.staging === c.id);
  };

  // may this city's troops strike a city of that realm on their own (the old opportunistic raids)?
  // Only in war, and not when a campaign against that realm is gathering the troops of this part of the realm.
  G.aiMayStrike = (s, c, targetOwner) => {
    if (!mayFight(s, c.owner, targetOwner)) return false;
    const P = s.warplans && s.warplans[c.owner], C = P && P.camp;
    const W = P && P.wars && P.wars[targetOwner];
    if (W && ((W.offers || 0) >= 3 || goalMet(s, c.owner, targetOwner, W))) return false;   // the aim is won: peace is sought, not more raids
    if (C && C.target === targetOwner) {
      // the campaign against that realm owns the troops of its part of the realm; distant (overseas) cities may still raid
      const st = s.cities[C.staging];
      return !(st && G.landReachable(s, c, st));
    }
    // a war without a campaign (none planned yet, or a failed one cooling down): opportunistic raids stay possible
    return true;
  };

  // campaigns for the wars in hand
  const planCampaign = (s, ai) => {
    const P = planOf(s, ai);
    if (P.camp || (P.campCool || 0) > s.time) return;
    // a war whose peace offers went unanswered three times goes quiet: no new campaigns (raids may still come)
    const wars = Object.entries(P.wars).filter(([t, W]) => atWar(s, ai, t) && !((W.offers || 0) >= 3) && !goalMet(s, ai, t, W));
    if (!wars.length) return;
    // the war with the best objective
    let best = null;
    for (const [t, W] of wars) {
      const o = W.city && s.cities[W.city] && s.cities[W.city].owner === t && !(P.campAvoid && P.campAvoid[W.city] > s.time) ? { city: s.cities[W.city], score: 1e6 } : pickObjective(s, ai, t, W.goal, P.campAvoid);
      if (o && (!best || o.score > best.o.score)) best = { t, W, o };
    }
    if (!best) {
      P.campCool = s.time + MIN(s, WP.campCool);
      // no city of theirs is within reach of an assault: a quick raid on an outer quarter instead
      if ((P.burnAt || 0) <= s.time) {
        P.burnAt = s.time + MIN(s, WP.burnEvery);
        safe(() => {
          for (const [t] of wars) {
            const foes = G.citiesOf(s, t);
            const mine = G.citiesOf(s, ai).map(c => ({ c, d: Math.min(1e9, ...foes.map(o => dist(o, c))) })).filter(x => x.d <= WP.reach + 4).sort((a, b) => a.d - b.d).slice(0, 2);
            for (const { c } of mine) if (burnRaid(s, ai, c, foeCitiesNear(s, c, t))) return;
          }
        });
      }
      return;
    }
    if (!best.W.city || (P.campAvoid && P.campAvoid[best.W.city] > s.time)) best.W.city = best.o.city.id;
    // a realm that has raised heralds since turns a winning war on another realm into a war of conquest
    if (best.W.goal !== 'conquer' && best.t !== 'p' && G.aiPressure(s) > 0.7 && G.citiesOf(s, ai).some(c => (c.units.herald || 0) > 0)
      && G.citiesOf(s, best.t).length > 1 && G.citiesOf(s, ai).length < G.aiCityCap(s) + 1 && G.power(s, ai) > 1.25 * Math.max(1, G.power(s, best.t))) { best.W.goal = 'conquer'; best.W.city = best.o.city.id; }
    openCampaign(s, ai, best.t, best.W.goal, best.o.city.id, false);
  };

  // ---------------------------------------------------------------------
  // Defence: reinforce threatened cities from neighbours; wake the interceptors
  // ---------------------------------------------------------------------
  const defend = (s, emp) => {
    const ai = emp.id, P = planOf(s, ai);
    P.seen = P.seen || {};
    let woke = false;
    for (const m of s.moves) {
      if (m.owner === ai || !HOSTILE[m.type] || P.seen[m.id]) continue;
      const t = G.tileAt(s, m.x, m.y), c = t && t.city && s.cities[t.city];
      if (!c || c.owner !== ai) continue;
      P.seen[m.id] = s.time;
      const left = m.arrive - s.time;
      if (left < 20) continue;
      const threat = G.atkPower(s, m.owner, m.units) * (m.owner && s.empires[m.owner] ? G.mod(s, m.owner, null, 'atk') : 1);
      let have = defOf(s, c);
      for (const x of s.moves) if (x.owner === ai && x.type === 'reinforce' && x.x === c.x && x.y === c.y && x.arrive < m.arrive) have += defOf(s, c, x.units);
      woke = true;
      if (have >= threat * 1.15) continue;
      const helpers = G.citiesOf(s, ai).filter(o => o !== c && G.landReachable(s, o, c) && dist(o, c) <= 14).sort((a, b) => dist(a, c) - dist(b, c)).slice(0, 3);
      for (const h of helpers) {
        if (have >= threat * 1.15) break;
        const send = spare(s, h, { all: true, siege: false, keep: Math.max(keepFrac(s, h), 0.35) });
        if (!G.unitsCount(send)) continue;
        if (G.travelTime(s, ai, h, c, G.slowest(s, ai, send)) >= left - 5) continue;
        if (!G.sendArmy(s, h.id, c.x, c.y, 'reinforce', send)) { tagLast(s, ai, h.id, 'defend'); have += defOf(s, c, send); }
      }
    }
    for (const id of Object.keys(P.seen)) if (s.time - P.seen[id] > MIN(s, 60)) delete P.seen[id];
    if (woke && G.aiIntercept) safe(() => G.aiIntercept(s, emp));
  };

  // ---------------------------------------------------------------------
  // The AI hook
  // ---------------------------------------------------------------------
  G.aiHooks.push((s, emp, dtMin) => {
    if (!emp || emp.id === 'p' || emp.dead) return;
    const ai = emp.id, P = planOf(s, ai);
    if ((P.tickAt || 0) > s.time + MIN(s, 30)) P.tickAt = 0;     // an older clock (a save from a longer game)
    if ((P.tickAt || 0) > s.time) return;
    P.tickAt = s.time + MIN(s, WP.tick);
    safe(() => {
      syncWars(s, ai);
      defend(s, emp);
      if ((P.evalAt || 0) <= s.time) { P.evalAt = s.time + MIN(s, WP.evalEvery); evaluateWars(s, ai); seekPeace(s, ai); }
      planCampaign(s, ai);
      stepCampaign(s, ai);
    });
  });

  // single steps, for tests and tools
  G.warEvaluate = (s, ai) => evaluateWars(s, ai);
  G.warSeekPeace = (s, ai) => seekPeace(s, ai);
  G.warCampaignStep = (s, ai) => { syncWars(s, ai); planCampaign(s, ai); stepCampaign(s, ai); };
  G.warDefend = (s, ai) => defend(s, s.empires[ai]);
  G.warStartWar = (s, ai, target, goal, cityId) => startWar(s, ai, target, goal, cityId);

  // grudges and campaign outcomes
  if (G.hostileHooks) G.hostileHooks.push((s, att, def, type) => {
    if (!isRealm(s, att) || !isRealm(s, def) || att === def || def === 'p' || type === 'scout') return;
    planOf(s, def).grudge[att] = s.time;
  });
  G.battleHooks.push((s, ctx) => {
    const m = ctx.m;
    if (!m || !m.owner || m.owner === 'p' || !s.empires[m.owner] || !ctx.defOwner || !s.empires[ctx.defOwner] || ctx.defOwner === m.owner) return;
    const st = stats(s);
    if (m.type === 'intercept') st.intercepts = (st.intercepts || 0) + 1;   // field battles (js/intercept.js) are counted apart
    else if (m.campaign) st.planned++; else st.unplanned++;
    const P = planOf(s, m.owner), W = P.wars[ctx.defOwner];
    if (W) { if (ctx.r.win) { W.wins++; if (m.type === 'raid') W.raids++; else if (m.type === 'burn') W.raids += 0.5; } else W.losses++; }
    if (m.campaign && P.camp && P.camp.move === m.id) { P.camp.result = ctx.r.win ? 'win' : 'loss'; m.wp = 'done'; }
  });

  // ---------------------------------------------------------------------
  // 4. Intel: dossiers, the council, diplomacy cards
  // ---------------------------------------------------------------------
  // what the realm's war plan looks like to an outsider
  G.warPlanSummary = (s, ai) => {
    const P = G.warPlanOf(s, ai);
    if (!P) return null;
    const out = { wars: [], intent: null, camp: null };
    for (const [t, W] of Object.entries(P.wars || {})) if (alive(s, t)) out.wars.push({ target: t, goal: W.goal, city: W.city, text: goalText(s, W) });
    if (P.intent) out.intent = { target: P.intent.target, stage: P.intent.stage, goal: P.intent.goal };
    if (P.camp) out.camp = { target: P.camp.target, city: P.camp.city, staging: P.camp.staging, phase: P.camp.phase, pre: !!P.camp.pre };
    return out;
  };
  const planText = (s, ai, w) => {
    if (!w) return '';
    const parts = [];
    for (const x of w.wars) parts.push(`at war with ${nameOf(s, x.target)}, aiming ${x.text}`);
    if (w.intent) parts.push(`${w.intent.stage === 'tension' ? 'weighing' : 'preparing'} war on ${nameOf(s, w.intent.target)} (${GOALS[w.intent.goal] ? GOALS[w.intent.goal].name.toLowerCase() : w.intent.goal})`);
    if (w.camp) {
      const st = s.cities[w.camp.staging], ob = s.cities[w.camp.city];
      if (st && ob) parts.push(`troops ${w.camp.phase === 'march' ? 'march from' : 'gather at'} ${st.name} against ${ob.name}`);
    }
    return parts.length ? `War plans: ${parts.join('; ')}.` : 'War plans: none for now.';
  };
  if (G.dossierOf) {
    const base = G.dossierOf;
    G.dossierOf = (s, city) => { const d = base(s, city); if (d && city.owner !== 'p') safe(() => { d.warplan = G.warPlanSummary(s, city.owner); }); return d; };
  }
  if (G.dossierText) {
    const base = G.dossierText;
    G.dossierText = (s, d) => { const t = base(s, d); if (!d || !d.warplan) return t; const x = safe(() => planText(s, d.owner, d.warplan), ''); return x ? t + ' ' + x : t; };
  }
  // what the player knows of a realm's plans: a fresh dossier, or troops seen massing
  G.knownWarPlan = (s, ai) => {
    const D = G.espState ? (G.espState(s).dossiers.p || {}) : {};
    let fresh = null;
    for (const d of Object.values(D)) if (d.owner === ai && d.warplan && s.time - d.t < MIN(s, 30) && (!fresh || d.t > fresh.t)) fresh = d;
    return fresh ? fresh.warplan : null;
  };
  // the council: armies massing against the player at cities we can see
  if (G.councilRaw) {
    const base = G.councilRaw;
    const tileAct = (x, y, label) => ({ kind: 'tile', x, y, label: label || 'Show on map' });
    G.councilRaw = s => {
      const list = base(s);
      const extra = safe(() => {
        const out = [];
        for (const [ai, P] of Object.entries(s.warplans || {})) {
          if (!alive(s, ai) || !P) continue;
          const e = s.empires[ai];
          const C = P.camp;
          if (C && C.target === 'p') {
            const st = s.cities[C.staging];
            if (st && st.owner === ai && seenBy(s, st)) {
              const n = near(s, 'p', st);
              out.push({ id: `marshal:wp:${ai}:${st.id}`, advisor: 'marshal', priority: C.pre ? 76 : 82, text: `The ${e.name} mass troops at ${st.name}${n ? `, ${Math.round(n.d)} tiles from ${n.city.name}` : ''}. ${C.pre ? 'War may follow soon.' : `Their aim: ${P.wars.p ? goalText(s, P.wars.p) : 'war'}.`} Strengthen ${n ? n.city.name : 'the border'} or strike first.`, action: tileAct(st.x, st.y, `Show ${st.name}`) });
            }
          }
          if (P.intent && P.intent.target === 'p' && P.intent.stage === 'tension') out.push({ id: `spymaster:wp:${ai}`, advisor: 'spymaster', priority: 55, text: `Tensions rise with the ${e.name}: their marshals grow busy. A gift or a pact now may spare us a war.`, action: { kind: 'tab', t: 'diplomacy', label: 'Diplomacy' } });
        }
        return out;
      }, []);
      if (!extra || !extra.length) return list;
      const ids = new Set(list.map(i => i.id));
      const add = extra.filter(i => !ids.has(i.id));
      if (!add.length) return list;
      const merged = list.concat(add).sort((a, b) => b.priority - a.priority);
      // keep the council's cache coherent: the same array object stays in place for its tick
      list.length = 0; for (const i of merged) list.push(i);
      return list;
    };
  }
  // diplomacy cards (UI): war aims, and what the spies know
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const install = () => {
      if (typeof REALM_EXTRAS === 'undefined') return;
      REALM_EXTRAS.push(emp => {
        if (typeof S === 'undefined' || !S || !emp || emp.id === 'p') return '';
        const P = G.warPlanOf(S, emp.id);
        const lines = [];
        const W = P && P.wars && P.wars.p;
        if (W && atWar(S, emp.id, 'p')) lines.push(`🎯 War aim: <b>${GOALS[W.goal] ? GOALS[W.goal].name : W.goal}</b> — ${goalText(S, W)}`);
        const k = G.knownWarPlan(S, emp.id);
        if (k) lines.push(`🕵️ ${planText(S, emp.id, k)}`);
        return lines.length ? `<div class="muted" style="font-size:12px">${lines.join('<br>')}</div>` : '';
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else setTimeout(install, 0);
  }
})();
