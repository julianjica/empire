// =====================================================================
//  Diplomacy & decisions — relations with AI realms, treaties with terms
//  and durations, negotiation (deals, the AI's "willingness"), war score
//  and peace terms, vassals, AI-initiated diplomacy (to the player and
//  among themselves), merchant offers, and the pending-decision queue
//  (also used by events and many other modules).
//
//  State (lazy, so older saves load):
//    s.rel[ai]      { opinion, status: war|neutral|peace|alliance, since, cool, enemies:{id: until} }  (player <-> AI)
//    s.airel['a|b'] { status: neutral|war|peace, since }                                              (AI <-> AI)
//    s.dip = {
//      treaties: [{ id, kind, a, b, start, until (0 = until broken), n (gold/h), mins, by, loyalty }],
//      hist:     [{ t, ev, kind, a, b, by, note }]          treaty history (newest first)
//      trust:    { owner: 0..100 }                           reputation for keeping one's word
//      wars:     { 'a|b': { a, b, start, by, pa, pb } }     war score per war (points for each side)
//      owners:   { cityId: owner }                           snapshot, to notice cities changing hands
//      calls:    { key: t }                                  allies' calls to arms already made
//    }
//  status stays the source of truth that other modules read; treaties are a layer on top: signing one sets
//  the status (alliance → 'alliance', non-aggression / truce / defence / vassal / marriage → 'peace'), and a
//  sweep ends treaties when someone else changes the status (a spy incident, a declared war).
//
//  Public API (also for js/dynasty.js):
//    G.treatiesOf(s, a, b?)          active treaties between a and b (any order), or all of a's
//    G.hasTreaty(s, a, b, kind)      bool       G.treatyHooks.push(fn(s, ev, treaty, by))  ev: signed|expired|broken|ended
//    G.marriageChecks.push(fn(s, a, b) -> error string | null)   veto or allow a royal marriage
//    G.signTreaty / G.endTreaty / G.breakTreaties / G.trustOf / G.warScore / G.liegeOf / G.vassalsOf
//    G.evalDeal / G.counterDeal / G.applyDeal / G.dealError / G.negotiate / G.dealOptions / G.cedeCity
// =====================================================================
'use strict';
{   // one block: this file's helpers stay out of the shared global scope

// ---------------------------------------------------------------------
// Pending decisions: { id, kind, title, text, options:[{key,label}], expires, def, data }
// ---------------------------------------------------------------------
G.pendingHandlers = {};
G.addPending = (s, p) => {
  s.pending = s.pending || [];
  p.id = G.newId(s, 'd');
  s.pending.push(p);
  G.log(s, 'p', `📜 ${p.title}: your decision is needed.`, 'warn');
  return p;
};
G.resolvePending = (s, id, key) => {
  const i = (s.pending || []).findIndex(p => p.id === id);
  if (i < 0) return 'That matter has passed';
  const p = s.pending[i];
  const err = G.pendingHandlers[p.kind](s, p, key);
  if (err) return err;
  s.pending = s.pending.filter(x => x !== p);
  return null;
};
G.slowHooks.push(s => {
  for (const p of [...(s.pending || [])]) {
    if (p.expires <= s.time) {
      G.pendingHandlers[p.kind](s, p, p.def, true);
      s.pending = s.pending.filter(x => x !== p);
    }
  }
});

// ---------------------------------------------------------------------
// Tunables and treaty kinds
// ---------------------------------------------------------------------
const TR = G.TREATY = {
  durations: [30, 60, 120],      // game minutes (× pace) a player can choose for a treaty
  repStart: 60, repMax: 95,      // reputation (trust in one's word) starts here; kept treaties slowly raise it
  repRecover: 2,                 // points per game hour (× pace) back toward repStart while below it
  repKeep: 0.5,                  // points per game hour per kept treaty above repStart
  breakRep: 14, breakRepEach: 4, // reputation lost for breaking treaties: base + per extra treaty broken
  breakVictim: 40, breakOthers: 10, breakOthersBound: 15,   // opinion lost: victim, other realms, realms bound to you by treaty
  peaceBreak: 5,                 // attacking a realm at peace without any treaty: lighter
  cool: 120,                     // seconds (× pace) a court needs after rejecting a proposal
  propose: 30,                   // mean game minutes (× pace) between each AI's proposals to the player
  aiTreaty: 150,                 // mean game minutes (× pace) between treaty talks for each pair of AI realms
  aiPactWar: 0.35,               // a non-aggression pact or truce between AI realms cuts their odds of war to this share (and war breaks it)
  aiBreak: 240,                  // mean game minutes (× pace) for an aggressive, much stronger AI to tear up a pact
  aiCede: 0.35, aiVassal: 0.25,  // when an AI war ends with a crushing war score: chance the loser cedes a city / kneels
  joinWar: 25,                   // mean game minutes (× pace) before an ally answers a call to arms
  pendingMins: 6,                // game minutes (× pace) a proposal waits for the player's answer
  vassalBase: 25, vassalPer: 15, // vassal tribute, gold per game hour: base + per vassal city (× pace prod)
  annexAfter: 180,               // game minutes (× pace) of loyal vassalage before a peaceful annexation
  annexLoyalty: 75,
  rebelBelow: 20,                // vassal loyalty below which rebellion may break out
  researchPact: 0.92,            // research time multiplier per research pact (both sides)
  tradeIncome: 1.2, bordersIncome: 1.1, tradeRate: 0.08,    // trade agreement: route income, market rates
  bordersRisk: 0.5,              // open borders: ambush risk on routes to the partner
  marriageFloor: 10,             // royal marriage: their opinion never sinks below this
  scaleBase: 300, scaleCity: 120,  // a realm's sense of value: max(base, perCity × cities × (1 + hours / 2)) gold = 100 points
};
DATA.treatyKinds = {
  truce:    { name: 'Peace treaty',        icon: '🕊️', dur: 30,  sym: true,  pact: true,  desc: 'The war is over: neither side may attack the other until it runs out.' },
  nap:      { name: 'Non-aggression pact', icon: '🤚', dur: 60,  sym: true,  pact: true,  desc: 'Neither side may attack the other.' },
  borders:  { name: 'Open borders',        icon: '🚪', dur: 60,  sym: true,  desc: 'Scouting each other is no offence; caravans travel safer (half the ambush risk) and earn 10% more.' },
  trade:    { name: 'Trade agreement',     icon: '⚖️', dur: 90,  sym: true,  desc: 'Trade routes between you earn 20% more gold at better rates, and their merchants come more often with kinder prices.' },
  research: { name: 'Research pact',       icon: '📚', dur: 60,  sym: true,  desc: 'Scholars share their notes: both realms research 8% faster.' },
  defense:  { name: 'Defensive alliance',  icon: '🛡️', dur: 90,  sym: true,  pact: true,  desc: 'Neither attacks the other, and each joins the war against whoever attacks the other.' },
  alliance: { name: 'Alliance',            icon: '🤝', dur: 120, sym: true,  pact: true,  desc: 'Shared vision; each side joins the other\'s wars.' },
  marriage: { name: 'Royal marriage',      icon: '💍', dur: 0,   sym: true,  pact: true,  desc: 'The houses are joined: their opinion of you never falls below +10, and it opens dynastic claims. Lasts until broken.' },
  tribute:  { name: 'Tribute',             icon: '💰', dur: 60,  sym: false, desc: 'One realm pays the other gold every hour.' },
  vassal:   { name: 'Vassalage',           icon: '👑', dur: 0,   sym: false, pact: true,  desc: 'The vassal pays tribute, follows its liege\'s wars and may not attack it; it may rebel if the liege weakens. The liege can release it, or annex it peacefully after long loyalty.' },
};
DATA.treatyOrder = ['truce', 'nap', 'borders', 'trade', 'research', 'defense', 'alliance', 'marriage', 'tribute', 'vassal'];
const SYM_DEAL = ['nap', 'borders', 'trade', 'research', 'defense', 'alliance', 'marriage'];   // treaties a deal can hold for both sides
const PACIFY = { truce: 1, nap: 1, defense: 1, alliance: 1, vassal: 1, marriage: 1 };          // treaties that forbid war between the parties
G.marriageChecks = [];   // fn(s, a, b) -> error string | null   (dynasty.js: rulers must have someone to marry…)
G.treatyHooks = [];      // fn(s, ev, treaty, by)  ev: 'signed' | 'expired' | 'broken' | 'ended'

const paceT = s => G.pace(s).time;
const MINS = (s, m) => m * 60 * paceT(s);
const hoursOf = s => s.time / (3600 * paceT(s));
const pk = (a, b) => a < b ? a + '|' + b : b + '|' + a;
const alive = (s, id) => !!(s.empires[id] && !s.empires[id].dead);
const nameOf = (s, id) => id === 'p' ? 'you' : 'the ' + ((s.empires[id] || {}).name || '?');
const NameOf = (s, id) => id === 'p' ? 'You' : 'The ' + ((s.empires[id] || {}).name || '?');
const safe = fn => { try { return fn(); } catch (e) { if (typeof console !== 'undefined') console.error('diplomacy', e); return null; } };

const dip = s => {
  const d = s.dip || (s.dip = {});
  d.treaties = d.treaties || []; d.hist = d.hist || []; d.trust = d.trust || {}; d.wars = d.wars || {}; d.calls = d.calls || {};
  return d;
};

// ---------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------
DATA.statusInfo = {
  war:      { name: 'At war',   color: 'bad' },
  neutral:  { name: 'Neutral',  color: 'muted' },
  peace:    { name: 'At peace', color: 'good' },
  alliance: { name: 'Allied',   color: 'good' },
};
G.rel = (s, id) => {
  s.rel = s.rel || {};
  return s.rel[id] = s.rel[id] || { opinion: 0, status: 'neutral', since: 0, cool: 0, enemies: {} };
};
// relations among AI realms: { status: neutral|war|peace, since }
G.aiRel = (s, a, b) => {
  s.airel = s.airel || {};
  const k = pk(a, b);
  return s.airel[k] = s.airel[k] || { status: 'neutral', since: 0 };
};
const shift = (s, id, d) => { const r = G.rel(s, id); r.opinion = G.clamp(r.opinion + d, -100, 100); };
// status between any two realms ('p' or AI ids)
G.statusOf = (s, a, b) => a === 'p' ? G.rel(s, b).status : b === 'p' ? G.rel(s, a).status : G.aiRel(s, a, b).status;
const setPair = (s, a, b, st) => {
  const r = a === 'p' ? G.rel(s, b) : b === 'p' ? G.rel(s, a) : G.aiRel(s, a, b);
  if (st === 'alliance' && a !== 'p' && b !== 'p') st = 'peace';   // AI pairs have no 'alliance' status: the treaty says it
  if (r.status === st) return;
  const was = r.status;
  r.status = st; r.since = s.time;
  if (st === 'war') warRec(s, a, b, true);
  else if (was === 'war') closeWar(s, a, b);
};
const setStatus = (s, id, st) => setPair(s, 'p', id, st);
G.opinionWord = o => o >= 60 ? 'Friendly' : o >= 20 ? 'Warm' : o > -20 ? 'Wary' : o > -60 ? 'Hostile' : 'Hateful';

// ---------------------------------------------------------------------
// Treaties
// ---------------------------------------------------------------------
let MUT = 1;                                  // bumped on every change, for the pair index below
const IDX = new WeakMap();
const index = s => {
  const list = dip(s).treaties;
  let c = IDX.get(list);
  if (!c || c.mut !== MUT) {
    const map = new Map();
    for (const t of list) {
      for (const k of [pk(t.a, t.b), t.a, t.b]) { const l = map.get(k); if (l) l.push(t); else map.set(k, [t]); }
    }
    c = { mut: MUT, map };
    IDX.set(list, c);
  }
  return c.map;
};
const EMPTY = [];
G.treatiesOf = (s, a, b) => {
  if (!s) return EMPTY;
  const l = index(s).get(b === undefined || b === null ? a : pk(a, b));
  return l || EMPTY;
};
const KIND_ALIAS = { royalMarriage: 'marriage', royal_marriage: 'marriage' };
G.hasTreaty = (s, a, b, kind) => { kind = KIND_ALIAS[kind] || kind; return G.treatiesOf(s, a, b).some(t => !kind || t.kind === kind); };
G.treatyOf = (s, a, b, kind) => { kind = KIND_ALIAS[kind] || kind; return G.treatiesOf(s, a, b).find(t => t.kind === kind) || null; };
G.pactBetween = (s, a, b) => G.treatiesOf(s, a, b).some(t => PACIFY[t.kind]);
G.liegeOf = (s, x) => { const t = G.treatiesOf(s, x).find(t => t.kind === 'vassal' && t.a === x); return t ? t.b : null; };
G.vassalsOf = (s, x) => G.treatiesOf(s, x).filter(t => t.kind === 'vassal' && t.b === x).map(t => t.a);
G.treatyLeft = (s, t) => t.until ? Math.max(0, t.until - s.time) : Infinity;
G.treatyName = t => (DATA.treatyKinds[t.kind] || { name: t.kind }).name;

const hist = (s, ev, t, by, note) => {
  const h = dip(s).hist;
  h.unshift({ t: s.time, ev, kind: t.kind, a: t.a, b: t.b, by: by || null, note: note || null });
  if (h.length > 80) h.length = 80;
};
const fire = (s, ev, t, by) => { for (const f of G.treatyHooks) { try { f(s, ev, t, by); } catch (e) { if (typeof console !== 'undefined') console.error('treaty hook', e); } } };
const seenPair = (s, a, b) => a === 'p' || b === 'p' || [a, b].some(id => G.citiesOf(s, id).some(c => s.explored[c.y * s.map + c.x]));

G.vassalTribute = (s, vassal) => Math.round((TR.vassalBase + TR.vassalPer * G.citiesOf(s, vassal).length) * G.pace(s).prod);

// sign (or renew) a treaty. a/b: for tribute a pays b; for vassalage a is the vassal of b.
G.signTreaty = (s, kind, a, b, o = {}) => {
  const K = DATA.treatyKinds[kind];
  if (!K || a === b || !alive(s, a) || !alive(s, b)) return null;
  const list = dip(s).treaties;
  const mins = o.mins != null ? o.mins : K.dur;
  const until = mins > 0 ? s.time + MINS(s, mins) : 0;
  let t = list.find(x => x.kind === kind && ((x.a === a && x.b === b) || (K.sym && x.a === b && x.b === a)));
  if (t) {
    t.until = t.until === 0 || until === 0 ? 0 : Math.max(t.until, until);
    if (o.n != null) t.n = o.n;
    t.mins = mins; t.renewed = s.time;
    hist(s, 'renewed', t, o.by);
  } else {
    t = { id: G.newId(s, 't'), kind, a, b, start: s.time, until, mins, by: o.by || a };
    if (o.n != null) t.n = o.n;
    if (kind === 'vassal') { t.loyalty = o.loyalty != null ? o.loyalty : 60; t.n = o.n != null ? o.n : G.vassalTribute(s, a); }
    list.push(t); MUT++;
    hist(s, 'signed', t, o.by);
  }
  // the status follows the treaty
  const st = G.statusOf(s, a, b);
  if (kind === 'alliance') setPair(s, a, b, 'alliance');
  else if (PACIFY[kind] && (st === 'war' || st === 'neutral')) setPair(s, a, b, 'peace');
  if (kind === 'vassal') {   // a realm that kneels frees its own vassals
    for (const x of G.treatiesOf(s, a).filter(x => x.kind === 'vassal' && x.b === a)) endTreaty(s, x, 'ended', null, 'its liege became a vassal');
  }
  // a royal marriage puts a consort at court (js/dynasty.js), from whichever house has someone of age
  if (kind === 'marriage' && !t.wed && G.dynEligible && G.dynMarry) {
    safe(() => {
      for (const [x, y] of [[a, b], [b, a]]) {
        const ruler = G.ruler ? G.ruler(s, x) : null;
        const list = G.dynEligible(s, x) || [];
        const pick = list.find(q => !ruler || q.id !== ruler.id) || list[0];
        if (pick && !G.dynMarry(s, x, pick.id, y, { free: true })) { t.wed = true; break; }
      }
    });
  }
  if (!o.quiet && seenPair(s, a, b)) {
    const who = a === 'p' || b === 'p' ? `with the ${s.empires[a === 'p' ? b : a].name}` : `between the ${s.empires[a].name} and the ${s.empires[b].name}`;
    const what = kind === 'vassal' ? (b === 'p' ? `👑 ${NameOf(s, a)} kneels as your vassal` : `👑 ${NameOf(s, a)} ${a === 'p' ? 'kneel' : 'kneels'} as vassal of ${nameOf(s, b)}`) : kind === 'tribute' ? `${NameOf(s, a)} will pay ${nameOf(s, b)} ${t.n} gold an hour` : `${K.icon} ${K.name} ${who}`;
    G.log(s, 'p', `📜 ${what}${t.until ? ` (${Math.round(mins)} min)` : ''}.`, a === 'p' || b === 'p' ? 'good' : 'info');
  }
  fire(s, 'signed', t, o.by);
  return t;
};
const endTreaty = (s, t, ev, by, note) => {
  const d = dip(s);
  const i = d.treaties.indexOf(t);
  if (i < 0) return false;
  d.treaties.splice(i, 1); MUT++;
  hist(s, ev, t, by, note);
  // an alliance that ends leaves a plain peace behind
  if (t.kind === 'alliance' && ev !== 'broken' && G.statusOf(s, t.a, t.b) === 'alliance') setPair(s, t.a, t.b, 'peace');
  fire(s, ev, t, by);
  return true;
};
G.endTreaty = (s, t, why, by) => endTreaty(s, t, why || 'ended', by);

// reputation: how far a realm's word can be trusted (0..100)
G.trustOf = (s, id) => { const tr = dip(s).trust; return tr[id] != null ? tr[id] : TR.repStart; };
const addTrust = (s, id, d) => { dip(s).trust[id] = G.clamp(G.trustOf(s, id) + d, 0, 100); };
G.trustWord = v => v >= 80 ? 'Honourable' : v >= 55 ? 'Reliable' : v >= 35 ? 'Doubtful' : v >= 15 ? 'Faithless' : 'Treacherous';

// breaker attacks or declares war on victim: every treaty between them ends, and the world remembers
G.breakTreaties = (s, breaker, victim, how) => {
  const ts = G.treatiesOf(s, breaker, victim).slice();
  const rebellion = ts.some(t => t.kind === 'vassal' && t.a === breaker);
  const pacts = ts.filter(t => t.kind !== 'tribute' || t.a === breaker);
  for (const t of ts) endTreaty(s, t, 'broken', breaker, how);
  if (!pacts.length) return 0;
  const n = pacts.length;
  // a rising vassal is not an oathbreaker in most eyes
  const rep = rebellion ? 5 : TR.breakRep + TR.breakRepEach * (n - 1);
  addTrust(s, breaker, -rep);
  const d = dip(s);
  d.betray = d.betray || {};
  d.betray[breaker] = (d.betray[breaker] || 0) + 1;
  if (breaker === 'p') {
    if (s.empires[victim] && victim !== 'p') shift(s, victim, -TR.breakVictim);
    for (const e of Object.values(s.empires)) {
      if (e.id === 'p' || e.id === victim || e.dead) continue;
      shift(s, e.id, -(G.pactBetween(s, 'p', e.id) || G.hasTreaty(s, 'p', e.id) ? TR.breakOthersBound : TR.breakOthers) * (rebellion ? 0.3 : 1));
    }
    G.log(s, 'p', rebellion ? `⚔️ You rose against your liege, the ${s.empires[victim].name}.` : `💔 You broke your word to the ${s.empires[victim].name} (${pacts.map(G.treatyName).join(', ')}). Every court will remember: your reputation falls to ${Math.round(G.trustOf(s, 'p'))}.`, 'bad');
  } else if (victim === 'p') {
    G.log(s, 'p', `💔 The ${s.empires[breaker].name} ${rebellion ? 'rise against you, their liege' : `tore up their pledges (${pacts.map(G.treatyName).join(', ')})`}!`, 'bad');
  } else if (seenPair(s, breaker, victim)) {
    G.log(s, 'p', `💔 The ${s.empires[breaker].name} broke faith with the ${s.empires[victim].name}.`, 'warn');
  }
  return n;
};

// ---------------------------------------------------------------------
// War score: battles won and cities taken while at war
// ---------------------------------------------------------------------
const warRec = (s, a, b, make, by) => {
  const W = dip(s).wars, k = pk(a, b);
  if (!W[k] && make) W[k] = { a: a < b ? a : b, b: a < b ? b : a, start: s.time, by: by || null, pa: 0, pb: 0, battles: 0, cities: 0 };
  if (W[k] && by && !W[k].by) W[k].by = by;
  return W[k] || null;
};
const closeWar = (s, a, b) => {
  const W = dip(s).wars, k = pk(a, b), w = W[k];
  if (!w) return;
  delete W[k];
  const ws = Math.round(wsOf(w, a));
  const h = dip(s).hist;
  h.unshift({ t: s.time, ev: 'peace', kind: 'war', a, b, by: null, note: `war of ${Math.max(1, Math.round((s.time - w.start) / MINS(s, 1)))} min, war score ${ws > 0 ? '+' : ''}${ws} for ${a === 'p' ? 'you' : s.empires[a] ? s.empires[a].name : a}` });
  if (h.length > 80) h.length = 80;
};
const wsOf = (w, x) => { const mine = x === w.a ? w.pa : w.pb, theirs = x === w.a ? w.pb : w.pa; return 100 * (mine - theirs) / (mine + theirs + 12); };
G.warScore = (s, a, b) => { const w = warRec(s, a, b); return w ? wsOf(w, a) : 0; };
G.warInfo = (s, a, b) => warRec(s, a, b);
const addWarPts = (s, who, other, pts, battle, city) => {
  if (G.statusOf(s, who, other) !== 'war') return;
  const w = warRec(s, who, other, true);
  if (who === w.a) w.pa += pts; else w.pb += pts;
  if (battle) w.battles++;
  if (city) w.cities++;
};
const lossPts = (units) => { let n = 0; for (const [u, k] of Object.entries(units || {})) n += k * ((DATA.units[u] && DATA.units[u].pop) || 1); return Math.min(10, n / 25); };
G.battleHooks.push((s, ctx) => {
  const m = ctx.m, r = ctx.r, att = m && m.owner, def = ctx.defOwner;
  if (!att || !def || att === def || !s.empires[att] || !s.empires[def]) return;
  if (G.statusOf(s, att, def) !== 'war') return;
  addWarPts(s, att, def, (r.win ? 3 : 0) + lossPts(r.defLost), true);
  addWarPts(s, def, att, (r.win ? 0 : 3) + lossPts(r.attLost), false);
});

// ---------------------------------------------------------------------
// City transfer (the engine keeps its own conquest transfer private)
// ---------------------------------------------------------------------
const checkVictory = s => {
  if (s.victory || s.gameOver || s.settings.mode === 'endless') return;
  if (!Object.values(s.empires).some(e => e.id !== 'p' && !e.dead)) { s.victory = true; G.log(s, 'p', 'Every rival crown has fallen. The realm is yours!', 'good'); }
};
const moveCity = (s, city, to, loyalty) => {
  const from = city.owner;
  // the garrison marches home rather than change sides
  const home = G.citiesOf(s, from).filter(c => c !== city).sort((a, b) => (a.founded || 0) - (b.founded || 0))[0];
  const units = { ...city.units };
  if (home) { for (const [u, n] of Object.entries(units)) if (n > 0 && u !== 'hero') home.units[u] = (home.units[u] || 0) + n; }
  if (G.defectCity && home) G.defectCity(s, city, to);
  else {
    if (home && city.units.hero) home.units.hero = 1;
    city.owner = to; city.buildQueue = []; city.train = {}; city.units = {}; city.mods = [];
    city.taxPolicy = 'normal'; city.placated = 0;
    for (const t of Object.keys(city.buildings)) { const b = DATA.buildings[t]; if (b && b.race && b.race !== s.empires[to].race) delete city.buildings[t]; }
    s.pending = (s.pending || []).filter(p => !(p.data && p.data.city === city.id));
    if (to === 'p') G.reveal(s, city.x, city.y, 4);
  }
  city.loyalty = loyalty;
  if (dip(s).owners) dip(s).owners[city.id] = to;
  if (!G.citiesOf(s, from).length) {
    const e = s.empires[from];
    e.dead = true; e.diedAt = s.time;
    s.moves = s.moves.filter(m => m.owner !== from);
    if (from === 'p') s.gameOver = 'defeat';
    else G.log(s, 'p', `The ${e.name} is no more.`, 'good');
    checkVictory(s);
  }
};
G.cedeCity = (s, city, to, o = {}) => {
  if (!city || !s.empires[to] || city.owner === to) return 'No such city';
  const from = city.owner;
  if (!o.annex) {
    if (G.citiesOf(s, from).length < 2) return 'A realm cannot give away its last city';
    if (G.capital(s, from) === city) return 'A realm will not give away its capital';
  }
  moveCity(s, city, to, o.loyalty != null ? o.loyalty : 50);
  G.log(s, 'p', `🏳️ ${city.name} passes from ${nameOf(s, from)} to ${nameOf(s, to)}.`, to === 'p' ? 'good' : from === 'p' ? 'bad' : 'info');
  return null;
};

// ---------------------------------------------------------------------
// Hostility: every AI war decision goes through here
// ---------------------------------------------------------------------
// coalition: when one realm towers over the rest, everyone else turns on it
G.slowHooks.push(s => {
  const alive = Object.values(s.empires).filter(e => !e.dead).map(e => ({ id: e.id, p: G.power(s, e.id) })).sort((a, b) => b.p - a.p);
  s.leader = alive.length > 1 && alive[0].p > 1.8 * alive[1].p ? alive[0].id : null;
});
G.hostility = (s, aiId, target) => {
  if (aiId === target) return 0;
  if (G.pactBetween(s, aiId, target)) return 0;
  const lead = s.leader;
  if (target === 'p') {
    const r = G.rel(s, aiId);
    if (r.status === 'peace' || r.status === 'alliance') return 0;
    const base = r.status === 'war' ? 1.3 : G.clamp(1 - r.opinion / 80, 0.15, 1.6);
    return lead === 'p' ? base * 1.5 : base;
  }
  const liege = G.liegeOf(s, aiId);
  if (liege) {                      // a vassal fights its liege's enemies, and otherwise keeps quiet
    if (G.statusOf(s, liege, target) === 'war') return 1.8;
    return G.aiRel(s, aiId, target).status === 'war' ? 1.2 : 0.2;
  }
  if (lead && aiId !== lead) {
    if (target === lead) return 2;          // gang up on the leader
    return 0.3;                             // and leave each other alone
  }
  const ar = G.aiRel(s, aiId, target).status;
  const base = ar === 'war' ? 1.6 : ar === 'peace' ? 0.15 : 1;
  const r = G.rel(s, aiId);
  if ((r.enemies[target] || 0) > s.time) return 1.8;
  if ((r.status === 'alliance' || G.hasTreaty(s, 'p', aiId, 'defense')) && G.rel(s, target).status === 'war') return Math.max(base, 1.5);
  if (r.status === 'alliance' && G.rel(s, target).status === 'alliance') return 0.3;
  return base;
};
// a vassal never marches on its liege, nor the liege on its vassal; the liege's other foes are fair game
const neighbours = (s, a, b) => G.citiesOf(s, a).some(c => G.citiesOf(s, b).some(o => G.dist(c, o) <= 9));

// ---------------------------------------------------------------------
// AI <-> AI: wars, peace terms, treaties
// ---------------------------------------------------------------------
const aiSettle = (s, A, B, say) => {
  // the war ends; a crushed loser may cede a city or kneel
  const wsA = G.warScore(s, A.id, B.id);
  const [W, L] = wsA >= 0 ? [A, B] : [B, A];
  const ws = Math.abs(wsA);
  const pW = G.power(s, W.id), pL = Math.max(1, G.power(s, L.id));
  const lc = G.citiesOf(s, L.id);
  setPair(s, A.id, B.id, 'peace');
  let terms = '';
  if (ws >= 55 && pW / pL >= 3 && !G.liegeOf(s, L.id) && !G.vassalsOf(s, L.id).length && !G.liegeOf(s, W.id) && Math.random() < TR.aiVassal) {
    G.signTreaty(s, 'vassal', L.id, W.id, { by: W.id, quiet: true });
    terms = ` The ${L.name} kneel as vassals of the ${W.name}.`;
  } else if (ws >= 55 && lc.length >= 3 && Math.random() < TR.aiCede) {
    const cap = G.capital(s, L.id);
    const c = lc.filter(x => x !== cap).sort((x, y) => Math.min(...G.citiesOf(s, W.id).map(o => G.dist(o, x))) - Math.min(...G.citiesOf(s, W.id).map(o => G.dist(o, y))))[0];
    if (c && !G.cedeCity(s, c, W.id, { loyalty: 40 })) terms = ` The ${L.name} cede ${c.name}.`;
  }
  G.signTreaty(s, 'truce', A.id, B.id, { by: L.id, quiet: true });
  say(`🕊️ The ${A.name} and the ${B.name} have made peace.${terms}`, 'info');
};
const aiTreatyTalk = (s, A, B, say) => {
  const st = G.aiRel(s, A.id, B.id).status;
  if (st === 'war') return;
  const has = k => G.hasTreaty(s, A.id, B.id, k);
  const lead = s.leader;
  const foes = id => Object.values(s.empires).filter(e => !e.dead && e.id !== id && G.statusOf(s, id, e.id) === 'war').map(e => e.id);
  const fa = foes(A.id), fb = foes(B.id);
  const common = fa.some(x => fb.includes(x)) || (lead && lead !== A.id && lead !== B.id);
  const trustOk = Math.min(G.trustOf(s, A.id), G.trustOf(s, B.id)) >= 30;
  if (!trustOk) return;
  const cands = [];
  if (common && !has('defense') && !has('alliance')) cands.push(lead && lead !== A.id && lead !== B.id ? 'defense' : 'alliance');
  if (!has('nap') && !G.pactBetween(s, A.id, B.id) && (A.aggr + B.aggr) / 2 < 0.5 && Math.random() < 0.5) cands.push('nap');
  if (!has('trade') && (!G.aiTradesWith || G.aiTradesWith(s, A.id, B.id) || Math.random() < 0.5)) cands.push('trade');
  if (!has('research') && Math.random() < 0.4) cands.push('research');
  if (!cands.length) return;
  const kind = G.pick(cands);
  G.signTreaty(s, kind, A.id, B.id, { by: A.id, quiet: true });
  const K = DATA.treatyKinds[kind];
  say(`📜 The ${A.name} and the ${B.name} sign a ${K.name.toLowerCase()} ${K.icon}.`, 'info');
};
G.slowHooks.push((s, dtMin) => {
  const ais = Object.values(s.empires).filter(e => e.id !== 'p' && !e.dead);
  const pace = paceT(s);
  for (let i = 0; i < ais.length; i++) for (let j = i + 1; j < ais.length; j++) {
    const A = ais[i], B = ais[j], r = G.aiRel(s, A.id, B.id);
    const pa = G.power(s, A.id), pb = G.power(s, B.id), ratio = Math.min(pa, pb) / Math.max(1, Math.max(pa, pb));
    const age = s.time - r.since;
    const say = (txt, kind) => { if (seenPair(s, A.id, B.id)) G.log(s, 'p', txt, kind || 'warn'); };
    const lA = G.liegeOf(s, A.id), lB = G.liegeOf(s, B.id);
    // treaties are mostly honoured: a non-aggression pact or truce cuts the odds of war, firmer bonds rule it out
    const firm = G.treatiesOf(s, A.id, B.id).some(t => t.kind === 'alliance' || t.kind === 'defense' || t.kind === 'vassal' || t.kind === 'marriage');
    const pactF = firm ? 0 : G.pactBetween(s, A.id, B.id) ? TR.aiPactWar : 1;
    const open = r.status === 'neutral' || (r.status === 'peace' && G.hasTreaty(s, A.id, B.id, 'nap'));
    if (open && pactF > 0 && !lA && !lB && G.aiPressure(s) > 0.2 && neighbours(s, A.id, B.id) && ratio > 0.55 && Math.random() < dtMin / (70 * pace) * ((A.aggr + B.aggr) / 1.2) * pactF) {
      G.breakTreaties(s, A.aggr >= B.aggr ? A.id : B.id, A.aggr >= B.aggr ? B.id : A.id, 'war');
      setPair(s, A.id, B.id, 'war'); warRec(s, A.id, B.id, true, A.aggr >= B.aggr ? A.id : B.id);
      say(`⚔️ The ${A.name} and the ${B.name} are at war.`);
    } else if (r.status === 'war' && age > 2400 * pace && (ratio < 0.6 || Math.random() < dtMin / (90 * pace))) {
      aiSettle(s, A, B, say);
    } else if (r.status === 'peace' && age > 5400 * pace && !G.pactBetween(s, A.id, B.id) && Math.random() < dtMin / (120 * pace)) {
      r.status = 'neutral'; r.since = s.time;
    } else if (r.status !== 'war' && Math.random() < dtMin / (TR.aiTreaty * pace)) {
      aiTreatyTalk(s, A, B, say);
    }
  }
});

// ---------------------------------------------------------------------
// Hostile acts by and against the player
// ---------------------------------------------------------------------
G.hostileHooks.push((s, att, def, type) => {
  if (att === 'p' && def !== 'p' && s.empires[def]) {
    const r = G.rel(s, def);
    // open borders: scouting is no offence
    if (type === 'scout' && G.hasTreaty(s, 'p', def, 'borders')) return;
    shift(s, def, type === 'scout' ? -5 : type === 'raid' ? -18 : -28);
    if (G.pactBetween(s, 'p', def) || r.status === 'alliance') {
      G.breakTreaties(s, 'p', def, type);
      setStatus(s, def, 'war'); warRec(s, 'p', def, true, 'p');
    } else if (r.status === 'peace') {
      for (const t of G.treatiesOf(s, 'p', def).slice()) endTreaty(s, t, 'broken', 'p', type);
      setStatus(s, def, 'war'); warRec(s, 'p', def, true, 'p'); shift(s, def, -TR.breakVictim);
      addTrust(s, 'p', -TR.peaceBreak);
      for (const e of Object.values(s.empires)) if (e.id !== 'p' && e.id !== def && !e.dead) shift(s, e.id, -TR.peaceBreak);
      G.log(s, 'p', `You broke the peace with the ${s.empires[def].name}. Other realms will remember.`, 'bad');
    } else if (r.status === 'neutral' && r.opinion < -40 && type !== 'scout') {
      setStatus(s, def, 'war'); warRec(s, 'p', def, true, 'p');
      G.log(s, 'p', `The ${s.empires[def].name} declares war on you!`, 'bad');
    }
  } else if (def === 'p' && att !== 'p' && s.empires[att]) {
    shift(s, att, -4);
    if (G.rel(s, att).status === 'war') warRec(s, att, 'p', true, att);
    // allies (and defensive partners) avenge the player
    for (const e of Object.values(s.empires)) {
      if (e.id === 'p' || e.id === att || e.dead) continue;
      const r = G.rel(s, e.id);
      if (r.status === 'alliance' || G.hasTreaty(s, 'p', e.id, 'defense') || G.liegeOf(s, e.id) === 'p') r.enemies[att] = s.time + 1800 * paceT(s);
    }
  } else if (att !== 'p' && def !== 'p' && s.empires[att] && s.empires[def] && G.aiRel(s, att, def).status === 'war') {
    warRec(s, att, def, true, att);
  }
});

// ---------------------------------------------------------------------
// The opinion model: drift toward a target made of visible parts
// ---------------------------------------------------------------------
const STATUS_BASE = { war: -25, neutral: 0, peace: 15, alliance: 35 };
const TREATY_OPINION = { trade: 5, borders: 3, research: 4, defense: 5, marriage: 15, vassal: 5, nap: 2, truce: 0, alliance: 0, tribute: 0 };
const ethosAffinity = (s, a, b) => {
  if (!G.ethosOf || !G.ETHOS) return 0;
  return safe(() => {
    const ea = G.ethosOf(s, a), eb = G.ethosOf(s, b), lean = G.ETHOS.lean;
    let d = 0;
    for (const ax of DATA.ethosOrder || []) {
      if (Math.abs(ea[ax] || 0) >= lean && Math.abs(eb[ax] || 0) >= lean) d += Math.sign(ea[ax]) === Math.sign(eb[ax]) ? 1 : -1;
    }
    return d;
  }) || 0;
};
G.ethosAffinity = ethosAffinity;
G.opinionParts = (s, ai) => {
  const r = G.rel(s, ai);
  const parts = [{ key: 'status', label: DATA.statusInfo[r.status].name, v: STATUS_BASE[r.status] || 0 }];
  for (const t of G.treatiesOf(s, 'p', ai)) {
    const v = TREATY_OPINION[t.kind] || 0;
    if (v) parts.push({ key: 't_' + t.kind, label: G.treatyName(t), v: t.kind === 'tribute' ? (t.a === 'p' ? 6 : -6) : v });
  }
  const aff = ethosAffinity(s, 'p', ai);
  if (aff) parts.push({ key: 'ethos', label: aff > 0 ? 'Kindred ways' : 'Strange ways', v: aff * 2 });
  const rep = Math.round((G.trustOf(s, 'p') - TR.repStart) / 4);
  if (rep) parts.push({ key: 'rep', label: rep > 0 ? 'Your good name' : 'Your broken promises', v: rep });
  const target = parts.reduce((a, p) => a + p.v, 0);
  const deeds = Math.round(r.opinion - target);
  if (deeds) parts.push({ key: 'deeds', label: deeds > 0 ? 'Gifts, deeds and goodwill (fading)' : 'Grievances and recent deeds (fading)', v: deeds, fading: true });
  return { parts, target, opinion: r.opinion };
};

// ---------------------------------------------------------------------
// Treaty upkeep: expiry, tribute, vassal loyalty, reconciliation with statuses
// ---------------------------------------------------------------------
const sweep = (s, dtMin) => {
  const d = dip(s);
  // realms that have fallen (or been reborn) leave no treaties or wars behind
  for (const t of [...d.treaties]) if (!alive(s, t.a) || !alive(s, t.b)) endTreaty(s, t, 'ended', null, 'a realm fell');
  for (const [k, w] of Object.entries(d.wars)) if (!alive(s, w.a) || !alive(s, w.b) || G.statusOf(s, w.a, w.b) !== 'war') { if (alive(s, w.a) && alive(s, w.b)) closeWar(s, w.a, w.b); else delete d.wars[k]; }
  for (const t of [...d.treaties]) {
    const st = G.statusOf(s, t.a, t.b);
    // someone else changed the status (a spy incident, a declared war): the treaties do not survive it
    if (st === 'war') { endTreaty(s, t, 'ended', null, 'war'); continue; }
    if (t.kind === 'alliance' && (t.a === 'p' || t.b === 'p') && st !== 'alliance') { endTreaty(s, t, 'ended', null, 'torn up'); continue; }
    if (PACIFY[t.kind] && st === 'neutral') { endTreaty(s, t, 'ended', null, 'torn up'); continue; }
    if (t.until && t.until <= s.time) {
      endTreaty(s, t, 'expired', null);
      if ((t.a === 'p' || t.b === 'p')) G.log(s, 'p', `⌛ The ${G.treatyName(t).toLowerCase()} with the ${s.empires[t.a === 'p' ? t.b : t.a].name} has run its course.`, 'info');
    }
  }
  // the player's statuses set elsewhere: an 'alliance' without a treaty (older saves, events) becomes one
  for (const e of Object.values(s.empires)) {
    if (e.id === 'p' || e.dead) continue;
    const r = G.rel(s, e.id);
    if (r.status === 'alliance' && !G.hasTreaty(s, 'p', e.id, 'alliance')) G.signTreaty(s, 'alliance', 'p', e.id, { mins: 0, by: e.id, quiet: true });
    if (r.status === 'war') warRec(s, 'p', e.id, true);
  }
  for (const [k, r] of Object.entries(s.airel || {})) if (r.status === 'war') { const [a, b] = k.split('|'); if (alive(s, a) && alive(s, b)) warRec(s, a, b, true); }
  // payments
  for (const t of [...d.treaties]) {
    if (t.kind !== 'tribute' && t.kind !== 'vassal') continue;
    const payer = s.empires[t.a], to = s.empires[t.b];
    const amt = (t.n || 0) * dtMin / 60;
    const paid = Math.min(Math.max(0, payer.gold), amt);
    payer.gold -= paid; to.gold += paid;
    t.paid = (t.paid || 0) + paid;
    t.debt = Math.max(0, (t.debt || 0) + amt - paid - (paid >= amt ? amt * 0.5 : 0));
    if (t.kind === 'tribute' && t.debt > Math.max(30, t.n)) {
      endTreaty(s, t, 'broken', t.a, 'unpaid');
      addTrust(s, t.a, -5);
      if (t.b === 'p') G.log(s, 'p', `💰 The ${payer.name} stopped paying their tribute.`, 'warn');
      else if (t.a === 'p') { shift(s, t.b, -20); G.log(s, 'p', `💰 Your treasury could not pay the tribute to the ${to.name}. They are furious.`, 'bad'); }
    }
  }
  // vassal loyalty: grows under a strong, friendly liege, wanes when the liege weakens
  for (const t of d.treaties.filter(x => x.kind === 'vassal')) {
    t.n = G.vassalTribute(s, t.a);
    const ratio = G.power(s, t.b) / Math.max(1, G.power(s, t.a));
    const op = t.b === 'p' ? G.rel(s, t.a).opinion : 20;
    const drift = (ratio >= 2.5 ? 1 : ratio >= 1.5 ? 0.4 : ratio >= 1 ? -0.6 : -2) + op / 60 - (t.debt > t.n ? 0.5 : 0);
    t.loyalty = G.clamp((t.loyalty != null ? t.loyalty : 60) + drift * dtMin / paceT(s), 0, 100);
    if (t.loyalty < TR.rebelBelow && t.a !== 'p' && Math.random() < dtMin / (30 * paceT(s)) * (1 - t.loyalty / TR.rebelBelow + 0.2)) {
      const liege = t.b, v = t.a;
      G.breakTreaties(s, v, liege, 'rebellion');
      setPair(s, v, liege, 'war'); warRec(s, v, liege, true, v);
      if (liege === 'p') { shift(s, v, -20); G.log(s, 'p', `🔥 Your vassal, the ${s.empires[v].name}, has risen in rebellion!`, 'bad'); }
      else if (seenPair(s, v, liege)) G.log(s, 'p', `🔥 The ${s.empires[v].name} rise against their liege, the ${s.empires[liege].name}.`, 'warn');
    }
  }
  // reputation recovers slowly, and kept treaties polish it
  for (const id of Object.keys(s.empires)) {
    if (!alive(s, id)) continue;
    const v = G.trustOf(s, id), kept = G.treatiesOf(s, id).filter(t => DATA.treatyKinds[t.kind].pact || t.kind === 'trade').length;
    const h = dtMin / 60 / paceT(s);
    if (v < TR.repStart) addTrust(s, id, Math.min(TR.repStart - v, TR.repRecover * h));
    else if (kept && v < TR.repMax) addTrust(s, id, Math.min(TR.repMax - v, TR.repKeep * kept * h));
  }
  // cities that changed hands while at war count toward the war score
  const owners = d.owners || (d.owners = {});
  for (const c of Object.values(s.cities)) {
    const was = owners[c.id];
    if (was && was !== c.owner && s.empires[was] && s.empires[c.owner]) addWarPts(s, c.owner, was, 20, false, true);
    owners[c.id] = c.owner;
  }
  for (const id of Object.keys(owners)) if (!s.cities[id]) delete owners[id];
};
G.slowHooks.push((s, dtMin) => sweep(s, dtMin));

// allies at war: AI allies join their partners' wars; the player's allies ask the player to join theirs
G.slowHooks.push((s, dtMin) => {
  const d = dip(s);
  for (const t of d.treaties) {
    if (t.kind !== 'alliance' && t.kind !== 'defense' && t.kind !== 'vassal') continue;
    for (const [x, y] of [[t.a, t.b], [t.b, t.a]]) {
      if (t.kind === 'vassal' && x !== t.b) continue;   // x = liege calling, y = vassal following (only that way round)
      for (const foe of Object.keys(s.empires)) {
        if (foe === x || foe === y || !alive(s, foe) || G.statusOf(s, x, foe) !== 'war') continue;
        const w = warRec(s, x, foe, true);
        if (t.kind === 'defense' && w.by !== foe) continue;     // defensive pacts answer only aggression
        if (G.statusOf(s, y, foe) === 'war' || G.pactBetween(s, y, foe)) continue;
        if (y === 'p') {
          const key = pk(x, foe) + '>p';
          if (d.calls[key] && s.time - d.calls[key] < MINS(s, 60)) continue;
          d.calls[key] = s.time;
          G.addPending(s, { kind: 'callToArms', title: `The ${s.empires[x].name} call you to arms`, text: `Your ${G.treatyName(t).toLowerCase()} binds you: the ${s.empires[x].name} ask you to declare war on ${foe === 'p' ? 'you' : 'the ' + s.empires[foe].name}. Refusing will cost their goodwill${t.kind === 'alliance' ? ' and some of your good name' : ''}.`,
            options: [{ key: 'join', label: 'Declare war' }, { key: 'refuse', label: 'Stay out of it' }], expires: s.time + MINS(s, TR.pendingMins), def: 'refuse', data: { ai: x, foe, kind: t.kind } });
          continue;
        }
        if (foe === 'p') {
          // the player's enemy's allies: they come for the player
          if (Math.random() < dtMin / (TR.joinWar * paceT(s))) {
            setPair(s, y, 'p', 'war'); warRec(s, y, 'p', true, y);
            G.log(s, 'p', `⚔️ Honouring their ${G.treatyName(t).toLowerCase()} with the ${s.empires[x].name}, the ${s.empires[y].name} declare war on you!`, 'bad');
          }
          continue;
        }
        if (x === 'p') { G.rel(s, y).enemies[foe] = s.time + MINS(s, 10); continue; }   // the player's allies march on the player's foes
        if (Math.random() < dtMin / (TR.joinWar * paceT(s))) {
          setPair(s, y, foe, 'war'); warRec(s, y, foe, true, y);
          if (seenPair(s, y, foe)) G.log(s, 'p', `⚔️ The ${s.empires[y].name} join the war of the ${s.empires[x].name} against the ${s.empires[foe].name}.`, 'warn');
        }
      }
    }
  }
});
G.pendingHandlers.callToArms = (s, p, key, auto) => {
  const { ai, foe, kind } = p.data;
  if (!alive(s, ai) || !alive(s, foe)) return null;
  if (key === 'join') {
    if (G.pactBetween(s, 'p', foe)) G.breakTreaties(s, 'p', foe, 'call to arms');
    setStatus(s, foe, 'war'); warRec(s, 'p', foe, true, 'p'); shift(s, foe, -30); shift(s, ai, 10);
    G.log(s, 'p', `⚔️ You stand with the ${s.empires[ai].name} against the ${s.empires[foe].name}.`, 'warn');
  } else {
    shift(s, ai, kind === 'alliance' ? -15 : -8);
    if (kind === 'alliance') addTrust(s, 'p', -3);
    G.log(s, 'p', `The ${s.empires[ai].name} ${auto ? 'waited in vain for your answer' : 'note your refusal'}.`, 'warn');
  }
  return null;
};

// ---------------------------------------------------------------------
// Treaty effects on other systems
// ---------------------------------------------------------------------
// research pacts
G.modSources.push((s, owner, city, key) => {
  if (key !== 'researchTime' || !owner || !s.dip) return 1;
  const n = G.treatiesOf(s, owner).filter(t => t.kind === 'research').length;
  return n ? Math.pow(TR.researchPact, Math.min(2, n)) : 1;
});
// shared vision: allies (and vassals) show the player what their cities see
{
  const baseVisible = G.visibleSet;
  G.visibleSet = s => {
    const vis = baseVisible(s);
    if (!s.dip || !s.dip.treaties.length) return vis;
    const share = G.treatiesOf(s, 'p').filter(t => t.kind === 'alliance' || (t.kind === 'vassal' && t.b === 'p')).map(t => t.a === 'p' ? t.b : t.a);
    for (const id of share) for (const c of G.citiesOf(s, id)) {
      const r = G.visionRadius(s, c), r2 = r * r;
      for (let y = Math.max(0, Math.floor(c.y - r)); y <= Math.min(s.map - 1, Math.ceil(c.y + r)); y++)
        for (let x = Math.max(0, Math.floor(c.x - r)); x <= Math.min(s.map - 1, Math.ceil(c.x + r)); x++)
          if ((x - c.x) ** 2 + (y - c.y) ** 2 <= r2) vis[y * s.map + x] = 1;
    }
    return vis;
  };
}
// trade agreements and open borders: wrapped once traderoutes.js has loaded (it loads after this file)
let wrapsDone = false;
const installWraps = () => {
  if (wrapsDone || !G.routeIncome || !G.tradeFactor) return;
  wrapsDone = true;
  const baseIncome = G.routeIncome, baseFactor = G.tradeFactor, baseRisk = G.routeRisk;
  const owners = (a, b) => [a && a.owner, b && b.owner];
  G.routeIncome = (s, a, b) => {
    const v = baseIncome(s, a, b);
    const [x, y] = owners(a, b);
    if (!x || !y || x === y || !s.dip) return v;
    return Math.round(v * (G.hasTreaty(s, x, y, 'trade') ? TR.tradeIncome : 1) * (G.hasTreaty(s, x, y, 'borders') ? TR.bordersIncome : 1));
  };
  G.tradeFactor = (s, from, to, take) => {
    const f = baseFactor(s, from, to, take);
    return from && to && s.dip && G.hasTreaty(s, from.owner, to.owner, 'trade') ? f + TR.tradeRate : f;
  };
  // open borders: the partner's patrols see off half the ambushes on the road between you
  const openRoad = (s, route) => {
    if (!route || !s.dip || !s.cities[route.from]) return false;
    const dest = G.routeDest ? safe(() => G.routeDest(s, route)) : null;
    const owner = route.owner || s.cities[route.from].owner;
    return !!(dest && dest.owner && dest.owner !== owner && s.empires[dest.owner] && G.hasTreaty(s, owner, dest.owner, 'borders'));
  };
  if (baseRisk) G.routeRisk = (s, route) => {
    const v = baseRisk(s, route);
    if (!v || typeof v.chance !== 'number' || !openRoad(s, route)) return v;
    return { ...v, chance: v.chance * TR.bordersRisk, expectedLoss: v.expectedLoss * TR.bordersRisk, openBorders: true };
  };
  const baseAmbush = G.routeAmbush;
  if (baseAmbush) G.routeAmbush = (s, m, src) => {
    const route = m && m.route && G.routeById ? G.routeById(s, m.route) : null;
    if (route && openRoad(s, route) && Math.random() < 1 - TR.bordersRisk) return null;
    return baseAmbush(s, m, src);
  };
};
G.newGameHooks.push(s => { installWraps(); dip(s); });
{
  const baseMigrate = G.migrate;
  G.migrate = s => {
    const r = baseMigrate(s) || s;
    installWraps();
    safe(() => { dip(r); for (const t of r.dip.treaties) { if (t.until == null) t.until = 0; } MUT++; });
    return r;
  };
}
G.installDiplomacyWraps = installWraps;

// ---------------------------------------------------------------------
// Deals: items, value, the AI's willingness, counter-offers
// ---------------------------------------------------------------------
//  deal = { ai, give: [items the player gives], take: [items the AI gives], both: [treaties both sign] }
//  items: {t:'gold', n} {t:'gph', n, mins} {t:'goods', g, n} {t:'city', id} {t:'minor', id} {t:'tech', id}
//         {t:'map'} {t:'captive', id} (a general of the receiving side held by the giver) {t:'vassal'}
//  both:  {t:'peace'} (ends a war) and {t:'treaty', kind, mins} for nap, borders, trade, research, defense, alliance, marriage
G.dealKey = it => it.t === 'treaty' ? it.kind : it.t === 'goods' ? 'goods:' + it.g : ['city', 'minor', 'tech', 'captive'].includes(it.t) ? it.t + ':' + it.id : it.t;
const scaleOf = (s, ai) => Math.max(TR.scaleBase, TR.scaleCity * G.citiesOf(s, ai).length * (1 + hoursOf(s) / 2));
G.dealScale = scaleOf;
const capOf = (s, id) => G.capital(s, id);
const cityValue = (s, c) => 300 + 30 * Object.values(c.buildings).reduce((a, b) => a + (b || 0), 0) + 8 * (c.pop || 0);
const techValue = id => safe(() => Object.entries(G.techCost(id)).reduce((a, [g, v]) => a + v * (g === 'gold' ? 1 : (DATA.goods[g] ? DATA.goods[g].value : 1)), 0)) || 200;
const isShort = (s, id, g) => G.citiesOf(s, id).some(c => (c.short && c.short[g]) || (c.res[g] || 0) < G.storageCap(s, c) * 0.12);
const isRich = (s, id, g) => { const c = capOf(s, id); return !!c && (c.res[g] || 0) > G.storageCap(s, c) * 0.7; };
const captiveOf = (s, id) => { for (const e of Object.values(s.empires)) for (const g of (Array.isArray(e.generals) ? e.generals : [])) if (g.id === id) return { g, owner: e.id }; return null; };
const minorOf = (s, id) => s.minors && s.minors[id];
const techCount = (s, id) => Object.keys(((s.empires[id] || {}).research || {}).done || {}).length;

// context of an AI looking at the player
const ctxOf = (s, ai) => {
  const r = G.rel(s, ai), e = s.empires[ai];
  const pPow = Math.max(1, G.power(s, 'p')), aPow = Math.max(1, G.power(s, ai));
  const foes = Object.keys(s.empires).filter(x => x !== ai && x !== 'p' && alive(s, x) && G.statusOf(s, ai, x) === 'war');
  const pFoes = Object.keys(s.empires).filter(x => x !== ai && x !== 'p' && alive(s, x) && G.rel(s, x).status === 'war');
  const w = r.status === 'war' ? warRec(s, 'p', ai) : null;
  return {
    r, e, op: r.opinion, ratio: pPow / aPow, trust: G.trustOf(s, 'p'), aggr: e.aggr != null ? e.aggr : 0.45,
    atWar: r.status === 'war', ws: w ? wsOf(w, ai) : 0, warH: w ? (s.time - w.start) / (3600 * paceT(s)) : 0,
    threat: foes.length > 0 || (!!s.leader && s.leader !== ai && s.leader !== 'p'),
    shared: foes.some(x => pFoes.includes(x)), techGap: techCount(s, 'p') - techCount(s, ai), scale: scaleOf(s, ai),
    // what a lost war puts at risk: a share of everything they have built
    stake: Math.min(160, 40 + 100 * 0.4 * G.citiesOf(s, ai).reduce((a, c) => a + cityValue(s, c), 0) / scaleOf(s, ai)),
  };
};
// how much a treaty appeals to the AI, in points, with a short reason
const desire = (s, ai, kind, c) => {
  const cl = G.clamp;
  switch (kind) {
    case 'nap': return { v: 10 * cl(c.ratio - 0.8, -1, 2) + (c.threat ? 6 : 0), why: c.ratio > 1 ? 'they fear your armies' : 'they do not fear you' };
    case 'borders': return { v: -8 + c.op * 0.15, why: c.op > 30 ? 'they trust your caravans' : 'they want no strangers on their roads' };
    case 'trade': return { v: 4 + c.op * 0.1, why: 'trade profits both' };
    case 'research': return { v: 2 + cl(c.techGap * 1.5, -20, 20), why: c.techGap > 0 ? 'your scholars know more' : c.techGap < 0 ? 'they would teach more than they learn' : 'shared learning' };
    case 'defense': return { v: -12 + c.op * 0.2 + (c.threat ? 12 : 0) + 6 * cl(c.ratio - 0.8, -1, 2), why: c.threat ? 'they have enemies to fear' : 'they see no threat to guard against' };
    case 'alliance': return { v: -25 + c.op * 0.3 + (c.threat ? 12 : 0) + (c.shared ? 12 : 0) + 6 * cl(c.ratio - 0.8, -1, 2), why: c.shared ? 'you share an enemy' : c.op >= 60 ? 'they hold you dear' : 'an alliance is a great commitment' };
    case 'marriage': return { v: -18 + c.op * 0.3, why: c.op >= 60 ? 'their court is fond of yours' : 'their court is not ready to join houses' };
    case 'peace': return { v: -10 + Math.min(25, c.warH * 10) - c.ws / 100 * (c.ws < 0 ? c.stake : 60) + 12 * cl(c.ratio - 1, -1, 2), why: c.ws < -20 ? 'they are losing the war' : c.ws > 20 ? 'they are winning the war' : c.warH > 1.5 ? 'the war has worn them down' : 'the war is young' };
  }
  return { v: 0, why: '' };
};
// material value of an item to the AI (as gold): what it gains (from the player) or loses (to the player)
const itemValue = (s, ai, it, aiGets) => {
  const giver = aiGets ? 'p' : ai, getter = aiGets ? ai : 'p';
  switch (it.t) {
    case 'gold': return { base: it.n || 0, need: 0 };
    case 'gph': return { base: (it.n || 0) * (it.mins || 60) / 60 * 0.8, need: 0 };
    case 'goods': {
      const v = (it.n || 0) * (DATA.goods[it.g] ? DATA.goods[it.g].value : 1);
      if (aiGets) return { base: v, need: isShort(s, ai, it.g) ? v * 0.6 : 0 };
      return { base: v, need: isShort(s, ai, it.g) ? v * 0.6 : isRich(s, ai, it.g) ? -v * 0.3 : 0 };
    }
    case 'city': { const c = s.cities[it.id]; return { base: c ? cityValue(s, c) * (aiGets ? 1 : 1.2) : 0, need: 0 }; }
    case 'minor': { const m = minorOf(s, it.id); return { base: m ? 400 + 150 * (m.size || 1) : 0, need: 0 }; }
    case 'tech': return { base: techValue(it.id) * (aiGets ? 0.8 : 0.5), need: 0 };
    case 'map': return { base: aiGets ? 120 : 150 + (G.rel(s, ai).opinion < 0 ? 150 : 0), need: 0 };
    case 'captive': { const c = captiveOf(s, it.id); return { base: c ? (aiGets ? 150 + 100 * c.g.level : 100 + 80 * c.g.level) : 0, need: 0 }; }
    case 'vassal': return { base: 0, need: 0 };
  }
  return { base: 0, need: 0 };
};
const label = (s, it) => {
  switch (it.t) {
    case 'gold': return `${Math.round(it.n || 0)} gold`;
    case 'gph': return `${Math.round(it.n || 0)} gold/h for ${it.mins || 60} min`;
    case 'goods': return `${Math.round(it.n || 0)} ${DATA.goods[it.g] ? DATA.goods[it.g].name.toLowerCase() : it.g}`;
    case 'city': return s.cities[it.id] ? s.cities[it.id].name : 'a city';
    case 'minor': { const m = minorOf(s, it.id); return m ? `patronage of ${m.name}` : 'a free city'; }
    case 'tech': return DATA.techs[it.id] ? DATA.techs[it.id].name : it.id;
    case 'map': return 'maps of the land';
    case 'captive': { const c = captiveOf(s, it.id); return c ? `General ${c.g.name}` : 'a captive'; }
    case 'vassal': return 'fealty (vassalage)';
    case 'peace': return 'peace';
    case 'treaty': return (DATA.treatyKinds[it.kind] || { name: it.kind }).name.toLowerCase();
  }
  return it.t;
};
G.dealItemLabel = label;
G.dealItemIcon = it => ({ gold: '🪙', gph: '💰', goods: '📦', city: '🏰', minor: '🏛️', tech: '📜', map: '🗺️', captive: '⛓️', vassal: '👑', peace: '🕊️' }[it.t] || (it.t === 'treaty' ? (DATA.treatyKinds[it.kind] || {}).icon : '•') || '•');

// can this deal be carried out right now? (null = yes)
G.dealError = (s, deal) => {
  const ai = deal && deal.ai;
  if (!ai || !alive(s, ai)) return 'That realm is gone';
  const give = deal.give || [], take = deal.take || [], both = deal.both || [];
  if (!give.length && !take.length && !both.length) return 'Put something on the table';
  const st = G.rel(s, ai).status;
  const peace = both.some(i => i.t === 'peace');
  if (peace && st !== 'war') return 'You are not at war';
  const treaties = both.filter(i => i.t === 'treaty').concat(give.concat(take).filter(i => i.t === 'gph' || i.t === 'vassal'));
  if (st === 'war' && !peace && treaties.length) return 'End the war first (add peace)';
  const keys = new Set();
  for (const [side, list] of [['p', give], [ai, take]]) {
    const other = side === 'p' ? ai : 'p';
    let gold = 0; const goods = {}; let cities = 0;
    for (const it of list) {
      const k = G.dealKey(it);
      if (keys.has(side + k)) return 'The same item twice';
      keys.add(side + k);
      switch (it.t) {
        case 'gold': if (!(it.n > 0)) return 'Choose an amount of gold'; gold += it.n; break;
        case 'gph': if (!(it.n > 0)) return 'Choose a tribute'; break;
        case 'goods': if (!(it.n > 0) || !DATA.goods[it.g]) return 'Choose an amount of goods'; goods[it.g] = (goods[it.g] || 0) + it.n; break;
        case 'city': { const c = s.cities[it.id]; if (!c || c.owner !== side) return `${c ? c.name : 'That city'} is not theirs to give`; if (G.capital(s, side) === c) return 'A capital is never given away'; cities++; break; }
        case 'minor': { const m = minorOf(s, it.id); if (!m || m.patron !== side) return 'Only a patron can hand over a free city'; break; }
        case 'tech': if (!G.hasTech || !G.hasTech(s, side, it.id)) return 'They do not know that'; if (G.hasTech(s, other, it.id)) return 'Already known'; if (!G.techForOwner(s, other, it.id)) return 'That knowledge is of no use to them'; break;
        case 'map': break;
        case 'captive': { const c = captiveOf(s, it.id); if (!c || c.owner !== other || c.g.status !== 'captured' || c.g.captor !== side) return 'No such captive'; break; }
        case 'vassal': if (G.liegeOf(s, side)) return `${NameOf(s, side)} already ${side === 'p' ? 'serve' : 'serves'} a liege`; if (G.vassalsOf(s, side).length && side !== 'p') return 'A realm with vassals of its own will not kneel'; if (G.liegeOf(s, other) === side) return 'Your own liege cannot be your vassal'; break;
        default: return 'Unknown item';
      }
    }
    if (gold > Math.floor(s.empires[side].gold)) return side === 'p' ? 'You do not have that much gold' : 'Their treasury is not that deep';
    const cap = capOf(s, side);
    for (const [g, n] of Object.entries(goods)) if (!cap || (cap.res[g] || 0) < n) return side === 'p' ? `Not enough ${DATA.goods[g].name.toLowerCase()} in your capital` : `They lack that much ${DATA.goods[g].name.toLowerCase()}`;
    if (cities && cities >= G.citiesOf(s, side).length) return 'No realm gives away all its cities';
  }
  if (give.some(i => i.t === 'vassal') && take.some(i => i.t === 'vassal')) return 'Only one can kneel';
  for (const it of both) {
    if (it.t === 'peace') continue;
    if (it.t !== 'treaty' || !SYM_DEAL.includes(it.kind)) return 'Unknown treaty';
    if (it.kind === 'marriage') {
      if (G.hasTreaty(s, 'p', ai, 'marriage')) return 'Your houses are already joined';
      if (G.dynEligible && !safe(() => G.dynEligible(s, 'p').length || G.dynEligible(s, ai).length)) return 'Neither house has anyone of age to marry';
      for (const f of G.marriageChecks) { const e = safe(() => f(s, 'p', ai)); if (e) return e; }
    }
  }
  return null;
};

// the AI's view of a deal: a pure function of the state (no dice), so the meter is steady
G.evalDeal = (s, deal) => {
  const ai = deal.ai;
  const err = G.dealError(s, deal);
  if (!alive(s, ai)) return { score: -100, accept: false, parts: [], text: 'That realm is gone.', err };
  const c = ctxOf(s, ai);
  const parts = [];
  const add = (key, label, v, why) => { if (Math.abs(v) >= 0.5) parts.push({ key, label, v: Math.round(v), why }); };
  const give = deal.give || [], take = deal.take || [], both = deal.both || [];
  let gain = 0, loss = 0, need = 0;
  for (const it of give) { const v = itemValue(s, ai, it, true); gain += v.base; need += v.need; }
  for (const it of take) { const v = itemValue(s, ai, it, false); loss += v.base; need -= v.need; }
  const pts = g => 100 * g / c.scale;
  add('terms', 'What changes hands', pts(gain - loss), gain >= loss ? 'the terms favour them' : 'you ask more than you give');
  add('needs', 'Their needs', pts(need), need > 0 ? 'it eases their shortages' : 'they need what you ask for');
  // treaties
  const peace = both.some(i => i.t === 'peace');
  if (peace) { const d = desire(s, ai, 'peace', c); add('peace', 'Ending the war', d.v, d.why); }
  for (const it of both.filter(i => i.t === 'treaty')) {
    const K = DATA.treatyKinds[it.kind];
    const d = desire(s, ai, it.kind, c);
    const f = K.dur ? Math.sqrt((it.mins || K.dur) / K.dur) : 1;
    add('t_' + it.kind, K.name, d.v * f, d.why);
  }
  for (const it of give.filter(i => i.t === 'vassal')) add('vassal_p', 'Your vassalage', 80, 'you would kneel to them');
  for (const it of take.filter(i => i.t === 'vassal')) add('vassal_ai', 'Their vassalage', -140 + 15 * G.clamp(c.ratio - 1.5, 0, 4), c.ratio >= 4 ? 'kneeling is a bitter cup' : 'they will not bend the knee');
  // attitude
  add('opinion', 'Their opinion of you', c.op * 0.2, c.op >= 0 ? 'they like you' : 'they dislike you');
  // their ruler's personal regard for yours (js/dynasty.js)
  if (G.rulerRegard) { const rg = safe(() => G.rulerRegard(s, ai, 'p')) || 0; const why = (G.rulerRegardWhy && safe(() => G.rulerRegardWhy(s, ai, 'p'))) || []; add('regard', 'Their ruler\'s regard', rg * 0.25, rg >= 0 ? `their ruler esteems yours${why.length ? ' (' + why.join(', ') + ')' : ''}` : `their ruler mistrusts yours${why.length ? ' (' + why.join(', ') + ')' : ''}`); }
  const promise = both.length || give.some(i => i.t === 'gph' || i.t === 'vassal');
  add('trust', 'Your reputation', (c.trust - TR.repStart) * (promise ? 0.3 : 0.1), c.trust >= TR.repStart ? 'your word is good' : 'you have broken your word before');
  const aff = ethosAffinity(s, 'p', ai);
  add('ethos', 'Kindred ways', aff * 2, aff > 0 ? 'your peoples think alike' : 'your ways are strange to them');
  if (both.some(i => PACIFY[i.kind]) || peace) add('temper', 'Their temperament', -(c.aggr - 0.45) * 40, c.aggr > 0.45 ? 'they are a warlike people' : 'they are a peaceable people');
  // fear: a strong player wrings concessions (bounded by what they give up, so a fuller deal never pleases them more)
  if (loss > 0) add('power', 'Your might', 6 * G.clamp(c.ratio - 1, 0, 3) * Math.min(1, loss / c.scale), 'they fear your might');
  else if (both.some(i => i.kind === 'alliance' || i.kind === 'defense') && c.ratio < 0.7) add('power', 'Your might', -8, 'you are too weak to be worth the bond');
  add('base', 'Reluctance to change', -5, 'every court is wary of change');
  const score = parts.reduce((a, p) => a + p.v, 0);
  const accept = !err && score >= 0;
  const pos = parts.filter(p => p.v > 0 && p.key !== 'base').sort((a, b) => b.v - a.v)[0];
  const neg = parts.filter(p => p.v < 0 && p.key !== 'base').sort((a, b) => a.v - b.v)[0];
  const verdict = err ? 'This cannot be done' : score >= 25 ? 'They would gladly accept' : score >= 0 ? 'They would accept' : score >= -15 ? 'They hesitate' : 'They refuse';
  const because = [pos && pos.why, neg && neg.why].filter(Boolean);
  const text = err ? `${err}.` : `${verdict}${because.length ? ': ' + (because.length === 2 ? `${because[0]}, but ${because[1]}` : because[0]) : ''}.`;
  return { score, accept, parts, text, err, meter: G.clamp(50 + score, 0, 100) };
};

// a deterministic repair of a rejected deal: ask for gold, or give back the dearest thing asked
G.counterDeal = (s, deal) => {
  const ev = G.evalDeal(s, deal);
  if (ev.accept || ev.err) return null;
  const ai = deal.ai, sc = scaleOf(s, ai);
  const clone = d => ({ ai: d.ai, give: (d.give || []).map(i => ({ ...i })), take: (d.take || []).map(i => ({ ...i })), both: (d.both || []).map(i => ({ ...i })) });
  const withGold = (d, short) => {
    const g = Math.ceil((short + 1) * sc / 100 / 10) * 10;
    const cur = d.give.find(i => i.t === 'gold');
    const total = (cur ? cur.n : 0) + g;
    if (total > Math.floor(s.empires.p.gold)) return null;
    const n = clone(d);
    const it = n.give.find(i => i.t === 'gold');
    if (it) it.n = total; else n.give.push({ t: 'gold', n: g });
    const e = G.evalDeal(s, n);
    return e.accept ? n : null;
  };
  let d = clone(deal), e = ev;
  const first = withGold(d, -e.score);
  if (first) return { deal: first, text: `They would agree for ${first.give.find(i => i.t === 'gold').n} gold.` };
  const dropped = [];
  while (d.take.length) {
    const costs = d.take.map(it => itemValue(s, ai, it, false).base);
    const i = costs.indexOf(Math.max(...costs));
    dropped.push(label(s, d.take[i]));
    d.take.splice(i, 1);
    if (!d.give.length && !d.take.length && !d.both.length) break;
    e = G.evalDeal(s, d);
    if (e.err) break;
    if (e.accept) return { deal: d, text: `They would agree without ${dropped.join(' and ')}.` };
    const g = withGold(d, -e.score);
    if (g) return { deal: g, text: `They would agree without ${dropped.join(' and ')}, for ${g.give.find(i => i.t === 'gold').n} gold.` };
  }
  return null;
};

// carry out an agreed deal
G.applyDeal = (s, deal) => {
  const ai = deal.ai, e = s.empires[ai];
  const move = (it, from, to) => {
    const fc = capOf(s, from), tc = capOf(s, to);
    switch (it.t) {
      case 'gold': s.empires[from].gold -= it.n; s.empires[to].gold += it.n; break;
      case 'gph': G.signTreaty(s, 'tribute', from, to, { n: it.n, mins: it.mins || 60, by: ai }); break;
      case 'goods': if (fc && tc) { fc.res[it.g] = Math.max(0, (fc.res[it.g] || 0) - it.n); G.gain(s, tc, { [it.g]: it.n }); } break;
      case 'city': { const c = s.cities[it.id]; if (c) G.cedeCity(s, c, to, { loyalty: 55 }); break; }
      case 'minor': {
        const m = minorOf(s, it.id);
        if (m) {
          const inf = m.inf[from] || 0;
          m.inf[to] = Math.max(m.inf[to] || 0, inf + 5); m.inf[from] = Math.max(0, inf * 0.3);
          if (G.minorUpdatePatron) safe(() => G.minorUpdatePatron(s, m));
        }
        break;
      }
      case 'tech': {
        const R = G.research(s, to);
        if ((R.studies || []).some(x => x.id === it.id)) G.cancelResearch(s, to, it.id);
        if (!R.done[it.id]) R.done[it.id] = true;
        if (R.queue) R.queue = R.queue.filter(q => q !== it.id);
        if (G.bumpEpoch) G.bumpEpoch();
        break;
      }
      case 'map':
        if (to === 'p') for (const c of G.citiesOf(s, from)) G.reveal(s, c.x, c.y, 5);
        break;
      case 'captive': {
        const cp = captiveOf(s, it.id);
        if (cp) { const g = cp.g, home = capOf(s, cp.owner); g.status = 'home'; g.city = home ? home.id : null; g.captor = null; g.releaseAt = null; g.hp = Math.max(g.hp || 0, 40); G.log(s, cp.owner, `🎖️ ${g.name} was released and is back home.`, 'good'); }
        break;
      }
      case 'vassal': G.signTreaty(s, 'vassal', from, to, { by: ai }); break;
    }
  };
  if ((deal.both || []).some(i => i.t === 'peace')) {
    setStatus(s, ai, 'peace');
    G.signTreaty(s, 'truce', 'p', ai, { by: ai });
    shift(s, ai, 10);
  }
  for (const it of deal.give || []) move(it, 'p', ai);
  for (const it of deal.take || []) move(it, ai, 'p');
  for (const it of (deal.both || []).filter(i => i.t === 'treaty')) G.signTreaty(s, it.kind, 'p', ai, { mins: it.mins, by: deal.by || 'p' });
  shift(s, ai, 3);
  s.stats.deals = (s.stats.deals || 0) + 1;
  s.stats.treatyDeals = (s.stats.treatyDeals || 0) + 1;
  return null;
};

// the player puts a deal to an AI court
const dealSig = d => JSON.stringify([d.ai, d.give || [], d.take || [], d.both || []]);
G.dealSig = dealSig;
G.negotiate = (s, deal, o = {}) => {
  const ai = deal.ai, r = G.rel(s, ai);
  const err = G.dealError(s, deal);
  if (err) return { ok: false, text: err };
  // their own counter-offer, or an answer to a proposal of theirs, is always heard
  const heard = (r.counter && r.counter === dealSig(deal)) || (o.pid && (s.pending || []).some(p => p.id === o.pid && p.data && p.data.ai === ai));
  if (r.cool > s.time && !heard) return { ok: false, text: `Their court will not receive another envoy for ${Math.ceil((r.cool - s.time) / 60)} min` };
  const ev = G.evalDeal(s, deal);
  if (ev.accept) {
    G.applyDeal(s, deal);
    r.counter = null;
    if (o.pid) G.dropPending(s, o.pid);
    G.log(s, 'p', `🤝 The ${s.empires[ai].name} accept your proposal: ${describeDeal(s, deal)}.`, 'good');
    return { ok: true, text: `The ${s.empires[ai].name} accept. ${ev.text}` };
  }
  r.cool = s.time + TR.cool * paceT(s);
  shift(s, ai, ev.score < -40 ? -3 : -1);
  const counter = G.counterDeal(s, deal);
  r.counter = counter ? dealSig(counter.deal) : null;
  return { ok: false, text: `The ${s.empires[ai].name} decline. ${ev.text}`, counter };
};
const describeDeal = (s, d) => {
  const bits = [];
  if ((d.both || []).length) bits.push((d.both || []).map(i => label(s, i)).join(', '));
  if ((d.give || []).length) bits.push('you give ' + d.give.map(i => label(s, i)).join(', '));
  if ((d.take || []).length) bits.push('they give ' + d.take.map(i => label(s, i)).join(', '));
  return bits.join('; ') || 'nothing';
};
G.describeDeal = describeDeal;

// what each side could put on the table (for the deal builder)
G.dealOptions = (s, ai) => {
  const side = (who, other) => {
    const out = [];
    const emp = s.empires[who], cap = capOf(s, who);
    out.push({ t: 'gold', n: Math.max(0, Math.min(Math.floor(emp.gold), Math.round(Math.max(50, scaleOf(s, ai) * 0.25) / 10) * 10)), max: Math.floor(emp.gold) });
    out.push({ t: 'gph', n: Math.round(Math.max(10, 20 * G.pace(s).prod * (1 + hoursOf(s) / 3)) / 5) * 5, mins: 60 });
    if (cap) {
      const goods = DATA.goodOrder.filter(g => (cap.res[g] || 0) >= 50 && (!DATA.goods[g].race || DATA.goods[g].race === s.empires[other].race) && g !== 'mana')
        .sort((a, b) => (cap.res[b] || 0) * DATA.goods[b].value - (cap.res[a] || 0) * DATA.goods[a].value).slice(0, 6);
      for (const g of goods) out.push({ t: 'goods', g, n: Math.round(Math.min(cap.res[g] * 0.5, 2000 / DATA.goods[g].value) / 10) * 10 || 10, max: Math.floor(cap.res[g]) });
    }
    const capC = G.capital(s, who);
    for (const c of G.citiesOf(s, who)) if (c !== capC) out.push({ t: 'city', id: c.id });
    if (s.minors) for (const m of Object.values(s.minors)) if (m.patron === who) out.push({ t: 'minor', id: m.id });
    if (G.techList && G.hasTech) {
      const ts = G.techList(s, other).filter(id => !DATA.techs[id].repeat && G.hasTech(s, who, id) && !G.hasTech(s, other, id)).sort((a, b) => techValue(a) - techValue(b)).slice(0, 8);
      for (const id of ts) out.push({ t: 'tech', id });
    }
    out.push({ t: 'map' });
    for (const e of Object.values(s.empires)) if (e.id === other) for (const g of (Array.isArray(e.generals) ? e.generals : [])) if (g.status === 'captured' && g.captor === who) out.push({ t: 'captive', id: g.id });
    if (!G.liegeOf(s, who)) out.push({ t: 'vassal' });
    return out;
  };
  const both = [];
  if (G.rel(s, ai).status === 'war') both.push({ t: 'peace' });
  for (const k of SYM_DEAL) both.push({ t: 'treaty', kind: k, mins: DATA.treatyKinds[k].dur || 0, active: G.hasTreaty(s, 'p', ai, k) });
  return { give: side('p', ai), take: side(ai, 'p'), both };
};

// ---------------------------------------------------------------------
// AI-initiated diplomacy with the player
// ---------------------------------------------------------------------
// build a deal the AI would like to put to the player (or null)
G.aiDealFor = (s, ai) => {
  const r = G.rel(s, ai), e = s.empires[ai];
  const c = ctxOf(s, ai);
  const pressure = G.aiPressure(s);
  const cands = [];
  const T = k => ({ t: 'treaty', kind: k, mins: DATA.treatyKinds[k].dur });
  const pCap = capOf(s, 'p'), aCap = capOf(s, ai);
  if (r.status === 'war') {
    if (c.warH >= 0.6 || c.ws <= -30) {
      // losing: offer peace, sweetened with what they can spare; winning: peace on their terms
      if (c.ws <= -25) {
        const take = [];
        const plain = G.evalDeal(s, { ai, give: [], take: [], both: [{ t: 'peace' }] }).score;
        const gold = Math.min(Math.floor(e.gold * 0.5), Math.floor((plain - 8) * scaleOf(s, ai) / 100 / 10) * 10);
        if (gold >= 50) take.push({ t: 'gold', n: gold });
        cands.push({ deal: { ai, give: [], take, both: [{ t: 'peace' }] }, why: take.length ? 'They sue for peace and offer reparations' : 'They sue for peace', w: 3 });
        if (c.ws <= -60 && c.ratio >= 3 && !G.liegeOf(s, ai) && !G.vassalsOf(s, ai).length) cands.push({ deal: { ai, give: [], take: [{ t: 'vassal' }], both: [{ t: 'peace' }] }, why: 'Crushed, they offer to kneel', w: 2 });
      } else if (c.ws >= 30) {
        const give = [];
        const cities = G.citiesOf(s, 'p').filter(x => x !== G.capital(s, 'p'));
        if (c.ws >= 60 && cities.length) {
          const near = cities.sort((a, b) => G.dist(a, aCap || a) - G.dist(b, aCap || b))[0];
          give.push({ t: 'city', id: near.id });
        } else {
          const gold = Math.min(Math.floor(s.empires.p.gold * 0.6), Math.round(scaleOf(s, ai) * c.ws / 100 / 10) * 10);
          if (gold >= 50) give.push({ t: 'gold', n: gold });
        }
        cands.push({ deal: { ai, give, take: [], both: [{ t: 'peace' }] }, why: 'They offer peace on their terms', w: 2, demand: true });
      } else cands.push({ deal: { ai, give: [], take: [], both: [{ t: 'peace' }] }, why: 'They propose a white peace', w: 1 });
    }
  } else {
    // a strong, unfriendly realm demands tribute
    if (c.ratio <= 0.5 && pressure > 0.3 && r.status !== 'alliance' && r.opinion < 20 && !G.pactBetween(s, 'p', ai) && !G.liegeOf(s, 'p')) {
      const n = Math.round((20 + s.empires.p.gold * 0.02) * G.pace(s).prod / 5) * 5;
      if (Math.random() < 0.5) cands.push({ deal: { ai, give: [{ t: 'gold', n: Math.round(100 + s.empires.p.gold * 0.15) }], take: [], both: [] }, why: 'They demand tribute, or there will be war', w: 3, demand: true });
      else cands.push({ deal: { ai, give: [{ t: 'gph', n, mins: 60 }], take: [], both: [T('nap')] }, why: 'They demand tribute every hour in exchange for peace', w: 3, demand: true });
    }
    const op = r.opinion;
    if (op >= 10 && !G.hasTreaty(s, 'p', ai, 'trade')) cands.push({ deal: { ai, give: [], take: [], both: [T('trade')] }, why: 'They propose a trade agreement', w: 2 });
    if (op >= 25 && !G.hasTreaty(s, 'p', ai, 'borders')) cands.push({ deal: { ai, give: [], take: [], both: [T('borders')] }, why: 'They propose to open your borders to each other', w: 1 });
    if (op >= 20 && !G.hasTreaty(s, 'p', ai, 'research') && c.techGap > 0) cands.push({ deal: { ai, give: [], take: [], both: [T('research')] }, why: 'Their scholars propose a research pact', w: 1 });
    if (r.status === 'neutral' && c.ratio >= 1 && !G.pactBetween(s, 'p', ai)) cands.push({ deal: { ai, give: [], take: [], both: [T('nap')] }, why: 'They propose a non-aggression pact', w: 2 });
    if (op >= 45 && c.threat && !G.hasTreaty(s, 'p', ai, 'defense') && r.status !== 'alliance') cands.push({ deal: { ai, give: [], take: [], both: [T('defense')] }, why: 'They propose a defensive alliance', w: 2 });
    if (op >= 60 && r.status === 'peace' && s.time - r.since > 1200 * paceT(s) && r.status !== 'alliance') cands.push({ deal: { ai, give: [], take: [], both: [T('alliance')] }, why: 'They offer to stand with you against your enemies', w: 2 });
    if (op >= 65 && !G.hasTreaty(s, 'p', ai, 'marriage') && G.marriageChecks.every(f => !safe(() => f(s, 'p', ai)))) cands.push({ deal: { ai, give: [], take: [], both: [T('marriage')] }, why: 'They propose a royal marriage', w: 1 });
    // renew a treaty about to run out
    for (const t of G.treatiesOf(s, 'p', ai)) if (SYM_DEAL.includes(t.kind) && t.until && t.until - s.time < MINS(s, 8)) cands.push({ deal: { ai, give: [], take: [], both: [T(t.kind)] }, why: `They propose to renew the ${G.treatyName(t).toLowerCase()}`, w: 3 });
    // goods for gold: they lack something the player has plenty of
    if (pCap && aCap) {
      const g = ['grain', 'timber', 'stone', 'ore', 'iron', 'tools', 'weapons'].filter(x => DATA.goods[x] && isShort(s, ai, x) && (pCap.res[x] || 0) > G.storageCap(s, pCap) * 0.5)[0];
      if (g) {
        const n = Math.round(Math.min(pCap.res[g] * 0.3, 800) / 10) * 10;
        const gold = Math.min(Math.floor(e.gold * 0.5), Math.round(n * DATA.goods[g].value * 1.3));
        if (n >= 50 && gold >= 30) cands.push({ deal: { ai, give: [{ t: 'goods', g, n }], take: [{ t: 'gold', n: gold }], both: [] }, why: `They want to buy ${DATA.goods[g].name.toLowerCase()}`, w: 2 });
      }
    }
  }
  // a captive general of theirs: they offer gold for him
  for (const g of (Array.isArray(e.generals) ? e.generals : [])) if (g.status === 'captured' && g.captor === 'p' && r.status !== 'war') {
    const gold = Math.min(Math.floor(e.gold * 0.6), 100 + 80 * g.level);
    if (gold >= 60) cands.push({ deal: { ai, give: [{ t: 'captive', id: g.id }], take: [{ t: 'gold', n: gold }], both: [] }, why: `They offer ransom for General ${g.name}`, w: 2 });
  }
  const ok = cands.filter(x => !G.dealError(s, x.deal) && (x.demand || G.evalDeal(s, x.deal).score >= 5));
  if (!ok.length) return null;
  const tot = ok.reduce((a, x) => a + x.w, 0);
  let roll = Math.random() * tot;
  for (const x of ok) { roll -= x.w; if (roll <= 0) return x; }
  return ok[ok.length - 1];
};
G.aiProposeTo = (s, ai, prop) => {
  prop = prop || G.aiDealFor(s, ai);
  if (!prop) return null;
  const e = s.empires[ai];
  prop.deal.by = ai;
  return G.addPending(s, {
    kind: 'deal', title: (prop.demand ? '⚠️ ' : '') + prop.why.replace(/\b[Tt]hey\b/, `the ${e.name}`).replace(/\b[Tt]heir\b/, `the ${e.name}'s`).replace(/^./, ch => ch.toUpperCase()),
    text: `${describeDeal(s, prop.deal).replace(/^./, ch => ch.toUpperCase())}.${prop.demand ? ' If you refuse, expect war.' : ''}`,
    options: [{ key: 'accept', label: 'Accept' }, { key: 'decline', label: 'Decline' }, { key: 'counter', label: 'Counter…' }],
    expires: s.time + MINS(s, TR.pendingMins), def: 'decline', data: { ai, deal: prop.deal, demand: !!prop.demand },
  });
};
G.pendingHandlers.deal = (s, p, key, auto) => {
  const { ai, deal, demand } = p.data;
  if (!alive(s, ai)) return null;
  const e = s.empires[ai];
  if (key === 'counter') return 'Open the negotiation table to make a counter-offer';
  if (key === 'accept') {
    const err = G.dealError(s, deal);
    if (err) return err;
    G.applyDeal(s, deal);
    if (demand) shift(s, ai, 15);
    G.log(s, 'p', `🤝 Agreed with the ${e.name}: ${describeDeal(s, deal)}.`, 'good');
    return null;
  }
  if (demand) {
    const st = G.rel(s, ai).status;
    if (st === 'war') { shift(s, ai, -5); G.log(s, 'p', `The ${e.name} fight on.`, 'warn'); return null; }
    if (auto) { shift(s, ai, -15); G.log(s, 'p', `You ignored the ${e.name}'s demand. They will not forget.`, 'bad'); return null; }
    shift(s, ai, -25); G.breakTreaties(s, ai, 'p', 'demand'); setStatus(s, ai, 'war'); warRec(s, ai, 'p', true, ai);
    G.log(s, 'p', `You refused the ${e.name}'s demand. They declare war!`, 'bad');
    return null;
  }
  if (!auto) shift(s, ai, -2);
  return null;
};
// a pending deal answered with a counter-offer the AI accepted
G.dropPending = (s, id) => { s.pending = (s.pending || []).filter(p => p.id !== id); };

// opinion drift, gifts, AI proposals, AI treaty-breaking
G.slowHooks.push((s, dtMin) => {
  for (const e of Object.values(s.empires)) {
    if (e.id === 'p' || e.dead) continue;
    const r = G.rel(s, e.id);
    const target = G.opinionParts(s, e.id).target;
    const drift = 0.4 * dtMin;
    if (r.opinion < target) r.opinion = Math.min(target, r.opinion + drift);
    else if (r.opinion > target) r.opinion = Math.max(target, r.opinion - drift);
    if (G.hasTreaty(s, 'p', e.id, 'marriage')) r.opinion = Math.max(r.opinion, TR.marriageFloor);
    const open = (s.pending || []).some(p => p.data && p.data.ai === e.id && (p.kind === 'deal' || p.kind === 'tribute' || p.kind === 'peaceOffer' || p.kind === 'allianceOffer'));
    if (!open && Math.random() < dtMin / (TR.propose * paceT(s))) safe(() => G.aiProposeTo(s, e.id));
    if (r.opinion >= 50 && Math.random() < dtMin / 60) {
      const cap = G.capital(s, 'p');
      if (cap) {
        const g = G.pick(['grain', 'timber', 'stone', 'ore']);
        const n = Math.round(150 + G.renown(s, e.id) * 0.5);
        G.gain(s, cap, { [g]: n });
        G.log(s, 'p', `🎁 The ${e.name} sends a gift of ${n} ${DATA.goods[g].name.toLowerCase()} to ${cap.name}.`, 'good');
      }
    }
    // treaties are mostly honoured; a warlike, much stronger realm that dislikes you may tear one up
    const pacts = G.treatiesOf(s, 'p', e.id).filter(t => PACIFY[t.kind] && t.kind !== 'vassal' && t.kind !== 'marriage');
    if (pacts.length && r.opinion < -10 && G.aiPressure(s) > 0.4 && G.power(s, e.id) > 2.5 * Math.max(1, G.power(s, 'p'))
      && Math.random() < dtMin / (TR.aiBreak * paceT(s)) * e.aggr * 2) {
      G.breakTreaties(s, e.id, 'p', 'war');
      setStatus(s, e.id, 'war'); warRec(s, e.id, 'p', true, e.id);
      G.log(s, 'p', `⚔️ The ${e.name} declare war on you!`, 'bad');
    }
  }
  genOffers(s, dtMin);
});

// older saves may still hold these
G.pendingHandlers.tribute = (s, p, key, auto) => {
  const ai = p.data.ai, e = s.empires[ai];
  if (key === 'pay') {
    if (s.empires.p.gold < p.data.gold) return 'Not enough gold';
    s.empires.p.gold -= p.data.gold;
    shift(s, ai, 20);
    if (G.rel(s, ai).status === 'war') setStatus(s, ai, 'neutral');
    G.log(s, 'p', `You paid ${p.data.gold} gold to the ${e.name}.`);
  } else if (auto) {
    shift(s, ai, -15);
    G.log(s, 'p', `You ignored the ${e.name}'s demand. They will not forget.`, 'bad');
  } else {
    shift(s, ai, -25); setStatus(s, ai, 'war');
    G.log(s, 'p', `You refused the ${e.name}'s demand. They declare war!`, 'bad');
  }
};
G.pendingHandlers.peaceOffer = (s, p, key) => {
  const ai = p.data.ai;
  if (key === 'accept') {
    setStatus(s, ai, 'peace'); shift(s, ai, 15);
    G.signTreaty(s, 'truce', 'p', ai, { by: ai, quiet: true });
    if (p.data.gold) s.empires.p.gold += p.data.gold;
    G.log(s, 'p', `Peace with the ${s.empires[ai].name}.`, 'good');
  }
};
G.pendingHandlers.allianceOffer = (s, p, key) => {
  const ai = p.data.ai;
  if (key === 'accept') { G.signTreaty(s, 'alliance', 'p', ai, { by: ai, quiet: true }); shift(s, ai, 10); G.log(s, 'p', `You are now allied with the ${s.empires[ai].name}.`, 'good'); }
  else shift(s, ai, -5);
};

// ---------------------------------------------------------------------
// Player diplomatic actions
// ---------------------------------------------------------------------
const cooldown = (s, ai) => {
  const r = G.rel(s, ai);
  if (r.cool > s.time) return `Their court will not receive another envoy for ${Math.ceil((r.cool - s.time) / 60)} min`;
  r.cool = s.time + 300 * paceT(s);
  return null;
};
G.diplo = {
  gift: (s, ai, gold) => {
    gold = Math.floor(gold);
    if (!(gold > 0)) return 'Choose an amount';
    if (s.empires.p.gold < gold) return 'Not enough gold';
    s.empires.p.gold -= gold;
    const gain = gold / (40 + 15 * G.citiesOf(s, ai).length);
    shift(s, ai, gain);
    return `The ${s.empires[ai].name} welcomes your gift (+${Math.round(gain)} opinion).`;
  },
  // quick proposals: thin wrappers over a negotiated deal
  peace: (s, ai) => {
    const r = G.rel(s, ai);
    if (r.status === 'peace' || r.status === 'alliance') return 'You are already at peace';
    const res = G.negotiate(s, { ai, give: [], take: [], both: r.status === 'war' ? [{ t: 'peace' }] : [{ t: 'treaty', kind: 'nap', mins: DATA.treatyKinds.nap.dur }] });
    return res.ok ? `The ${s.empires[ai].name} agrees to peace.` : res.text;
  },
  alliance: (s, ai) => {
    const r = G.rel(s, ai);
    if (r.status !== 'peace') return 'You must be at peace first';
    const res = G.negotiate(s, { ai, give: [], take: [], both: [{ t: 'treaty', kind: 'alliance', mins: DATA.treatyKinds.alliance.dur }] });
    return res.ok ? `The ${s.empires[ai].name} joins you in alliance!` : res.text;
  },
  war: (s, ai) => {
    const r = G.rel(s, ai);
    if (r.status === 'war') return 'Already at war';
    const liege = G.liegeOf(s, 'p') === ai;
    if (G.hasTreaty(s, 'p', ai)) G.breakTreaties(s, 'p', ai, 'war');
    else if (r.status === 'peace' || r.status === 'alliance') {
      addTrust(s, 'p', -TR.peaceBreak);
      for (const e of Object.values(s.empires)) if (e.id !== 'p' && e.id !== ai && !e.dead) shift(s, e.id, -TR.breakOthers);
    }
    setStatus(s, ai, 'war'); warRec(s, 'p', ai, true, 'p'); shift(s, ai, -30);
    return liege ? `You rise against the ${s.empires[ai].name}!` : `You declared war on the ${s.empires[ai].name}.`;
  },
  tribute: (s, ai) => {
    const r = G.rel(s, ai);
    if (r.status === 'alliance') return 'You cannot extort an ally';
    const c = cooldown(s, ai); if (c) return c;
    const ratio = G.power(s, 'p') / Math.max(1, G.power(s, ai));
    const e = s.empires[ai];
    if (ratio >= 2) {
      const gold = Math.round(Math.min(Math.max(0, e.gold) * 0.3 + 100, 200 + 120 * ratio));
      s.empires.p.gold += gold; e.gold -= Math.min(Math.max(0, e.gold), gold); shift(s, ai, -15);
      return `Fearing your might, the ${e.name} pays ${gold} gold.`;
    }
    shift(s, ai, -12);
    if (ratio < 1 && r.status === 'neutral' && Math.random() < 0.5) { setStatus(s, ai, 'war'); warRec(s, ai, 'p', true, ai); return `Insulted, the ${e.name} declares war!`; }
    return `The ${e.name} laughs at your demand.`;
  },
  // vassals: set them free, or fold them into the realm after long loyalty
  release: (s, ai) => {
    const t = G.treatiesOf(s, 'p', ai).find(x => x.kind === 'vassal' && x.b === 'p');
    if (!t) return 'They are not your vassal';
    endTreaty(s, t, 'ended', 'p', 'released');
    shift(s, ai, 30); addTrust(s, 'p', 3);
    G.signTreaty(s, 'nap', 'p', ai, { by: 'p', quiet: true });
    return `You released the ${s.empires[ai].name} from vassalage. They will remember your grace.`;
  },
  annexStatus: (s, ai) => {
    const t = G.treatiesOf(s, 'p', ai).find(x => x.kind === 'vassal' && x.b === 'p');
    if (!t) return { ok: false, reason: 'They are not your vassal' };
    const age = s.time - t.start, need = MINS(s, TR.annexAfter);
    if (age < need) return { ok: false, reason: `Vassal for ${Math.round(age / MINS(s, 1))} of ${TR.annexAfter} min`, t };
    if ((t.loyalty || 0) < TR.annexLoyalty) return { ok: false, reason: `Loyalty ${Math.round(t.loyalty || 0)} / ${TR.annexLoyalty}`, t };
    const n = G.citiesOf(s, ai).length;
    if (G.citiesOf(s, 'p').length + n > G.cityLimit(s)) return { ok: false, reason: `Your realm cannot hold ${n} more cities`, t };
    return { ok: true, t };
  },
  annex: (s, ai) => {
    const st = G.diplo.annexStatus(s, ai);
    if (!st.ok) return st.reason;
    const e = s.empires[ai];
    endTreaty(s, st.t, 'ended', 'p', 'annexed');
    const cities = G.citiesOf(s, ai).sort((a, b) => (b.founded || 0) - (a.founded || 0));
    for (const c of cities) G.cedeCity(s, c, 'p', { annex: true, loyalty: 70 });
    hist(s, 'annexed', { kind: 'vassal', a: ai, b: 'p' }, 'p');
    return `The ${e.name} is peacefully folded into your realm: ${cities.length} cit${cities.length === 1 ? 'y' : 'ies'} join you.`;
  },
};

// ---------------------------------------------------------------------
// AI trade offers (merchants come to you; paid from your selected city)
// ---------------------------------------------------------------------
const SPECIALTY = { hearth: ['grain', 'timber', 'bread'], delver: ['ore', 'iron', 'stone', 'tools', 'runesteel'], sylvan: ['timber', 'grain', 'heartwood'], ash: ['weapons', 'ore', 'stone'] };
const genOffers = (s, dtMin) => {
  s.offers = (s.offers || []).filter(o => o.expires > s.time && !s.empires[o.ai].dead);
  if (s.offers.length >= 4) return;
  const pRace = s.empires.p.race;
  const visible = DATA.goodOrder.filter(g => !DATA.goods[g].race || DATA.goods[g].race === pRace);
  for (const e of Object.values(s.empires)) {
    if (e.id === 'p' || e.dead || s.offers.length >= 4) continue;
    const r = G.rel(s, e.id);
    const pact = G.hasTreaty(s, 'p', e.id, 'trade');
    if (r.status === 'war' || r.opinion < -30 || Math.random() > dtMin / 7 * (pact ? 1.5 : 1)) continue;
    const cap = G.capital(s, 'p');
    if (!cap) return;
    const capN = G.storageCap(s, cap);
    const gives = (SPECIALTY[e.race] || ['grain', 'timber', 'stone', 'ore']).filter(g => visible.includes(g) && (cap.res[g] || 0) < capN * 0.6);
    if (!gives.length) continue;
    const give = G.pick(gives);
    const scale = 1 + s.time / (3600 * paceT(s));
    const n = Math.round(G.rnd(150, 400) * scale / Math.max(1, DATA.goods[give].value * 2));
    const value = n * DATA.goods[give].value * (1.15 - r.opinion / 400) * (pact ? 0.9 : 1);
    let want;
    if (Math.random() < 0.4) want = { gold: Math.round(value) };
    else {
      const pool = ['grain', 'timber', 'stone', 'ore', 'iron'].filter(x => x !== give);
      const rich = pool.filter(x => (cap.res[x] || 0) > capN * 0.5);
      const g = G.pick(rich.length ? rich : pool);
      want = { [g]: Math.round(value / DATA.goods[g].value) };
    }
    s.offers.push({ id: G.newId(s, 'o'), ai: e.id, give: { [give]: n }, want, expires: s.time + 600 * paceT(s) });
  }
};
G.acceptOffer = (s, offerId, cityId) => {
  const o = (s.offers || []).find(x => x.id === offerId);
  if (!o) return 'The merchants have moved on';
  const city = s.cities[cityId];
  if (!G.canAfford(s, city, o.want)) return 'Not enough goods in ' + city.name;
  G.pay(s, city, o.want);
  G.gain(s, city, o.give);
  shift(s, o.ai, 3);
  s.offers = s.offers.filter(x => x !== o);
  s.stats.deals = (s.stats.deals || 0) + 1;
  return null;
};
}
