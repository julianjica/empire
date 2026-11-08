// =====================================================================
//  Diplomacy & decisions — relations with AI realms, treaties, tribute,
//  AI trade offers, and the pending-decision queue (also used by events)
// =====================================================================
'use strict';

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
  s.pending.splice(i, 1);
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
const shift = (s, id, d) => { const r = G.rel(s, id); r.opinion = G.clamp(r.opinion + d, -100, 100); };
const setStatus = (s, id, st) => { const r = G.rel(s, id); r.status = st; r.since = s.time; };
G.opinionWord = o => o >= 60 ? 'Friendly' : o >= 20 ? 'Warm' : o > -20 ? 'Wary' : o > -60 ? 'Hostile' : 'Hateful';

// coalition: when one realm towers over the rest, everyone else turns on it
G.slowHooks.push(s => {
  const alive = Object.values(s.empires).filter(e => !e.dead).map(e => ({ id: e.id, p: G.power(s, e.id) })).sort((a, b) => b.p - a.p);
  s.leader = alive.length > 1 && alive[0].p > 1.8 * alive[1].p ? alive[0].id : null;
});
G.hostility = (s, aiId, target) => {
  const lead = s.leader;
  if (target === 'p') {
    const r = G.rel(s, aiId);
    if (r.status === 'peace' || r.status === 'alliance') return 0;
    const base = r.status === 'war' ? 1.3 : G.clamp(1 - r.opinion / 80, 0.15, 1.6);
    return lead === 'p' ? base * 1.5 : base;
  }
  if (lead && aiId !== lead) {
    if (target === lead) return 2;          // gang up on the leader
    return 0.3;                             // and leave each other alone
  }
  const ar = G.aiRel(s, aiId, target).status;
  const base = ar === 'war' ? 1.6 : ar === 'peace' ? 0.15 : 1;
  const r = G.rel(s, aiId);
  if ((r.enemies[target] || 0) > s.time) return 1.8;
  if (r.status === 'alliance' && G.rel(s, target).status === 'war') return Math.max(base, 1.5);
  if (r.status === 'alliance' && G.rel(s, target).status === 'alliance') return 0.3;
  return base;
};
// relations among AI realms: { status: neutral|war|peace, since }
G.aiRel = (s, a, b) => {
  s.airel = s.airel || {};
  const k = a < b ? a + '|' + b : b + '|' + a;
  return s.airel[k] = s.airel[k] || { status: 'neutral', since: 0 };
};
const neighbours = (s, a, b) => G.citiesOf(s, a).some(c => G.citiesOf(s, b).some(o => G.dist(c, o) <= 9));
G.slowHooks.push((s, dtMin) => {
  const ais = Object.values(s.empires).filter(e => e.id !== 'p' && !e.dead);
  const pace = G.pace(s).time;
  for (let i = 0; i < ais.length; i++) for (let j = i + 1; j < ais.length; j++) {
    const A = ais[i], B = ais[j], r = G.aiRel(s, A.id, B.id);
    const pa = G.power(s, A.id), pb = G.power(s, B.id), ratio = Math.min(pa, pb) / Math.max(1, Math.max(pa, pb));
    const age = s.time - r.since;
    const say = (txt, kind) => { if (G.citiesOf(s, A.id).concat(G.citiesOf(s, B.id)).some(c => s.explored[c.y * s.map + c.x])) G.log(s, 'p', txt, kind || 'warn'); };
    if (r.status === 'neutral' && G.aiPressure(s) > 0.2 && neighbours(s, A.id, B.id) && ratio > 0.55 && Math.random() < dtMin / (70 * pace) * ((A.aggr + B.aggr) / 1.2)) {
      r.status = 'war'; r.since = s.time; say(`⚔️ The ${A.name} and the ${B.name} are at war.`);
    } else if (r.status === 'war' && age > 2400 * pace && (ratio < 0.6 || Math.random() < dtMin / (90 * pace))) {
      r.status = 'peace'; r.since = s.time; say(`🕊️ The ${A.name} and the ${B.name} have made peace.`, 'info');
    } else if (r.status === 'peace' && age > 5400 * pace && Math.random() < dtMin / (120 * pace)) {
      r.status = 'neutral'; r.since = s.time;
    }
  }
});
G.hostileHooks.push((s, att, def, type) => {
  if (att === 'p' && def !== 'p') {
    const r = G.rel(s, def);
    shift(s, def, type === 'scout' ? -5 : type === 'raid' ? -18 : -28);
    if (r.status === 'peace' || r.status === 'alliance') {
      setStatus(s, def, 'war'); shift(s, def, -40);
      for (const e of Object.values(s.empires)) if (e.id !== 'p' && e.id !== def && !e.dead) shift(s, e.id, -10);
      G.log(s, 'p', `You broke your treaty with the ${s.empires[def].name}. Other realms will remember.`, 'bad');
    } else if (r.status === 'neutral' && r.opinion < -40 && type !== 'scout') {
      setStatus(s, def, 'war');
      G.log(s, 'p', `The ${s.empires[def].name} declares war on you!`, 'bad');
    }
  } else if (def === 'p' && att !== 'p') {
    shift(s, att, -4);
    // allies avenge the player
    for (const e of Object.values(s.empires)) {
      if (e.id === 'p' || e.id === att || e.dead) continue;
      const r = G.rel(s, e.id);
      if (r.status === 'alliance') r.enemies[att] = s.time + 1800 * G.pace(s).time;
    }
  }
});

// opinion drift and AI-initiated diplomacy
G.slowHooks.push((s, dtMin) => {
  const pPow = Math.max(1, G.power(s, 'p'));
  for (const e of Object.values(s.empires)) {
    if (e.id === 'p' || e.dead) continue;
    const r = G.rel(s, e.id);
    const target = { war: -25, neutral: 0, peace: 15, alliance: 35 }[r.status];
    const drift = 0.4 * dtMin;
    if (r.opinion < target) r.opinion = Math.min(target, r.opinion + drift);
    else if (r.opinion > target) r.opinion = Math.max(target, r.opinion - drift);
    const ratio = G.power(s, e.id) / pPow;
    const open = id => (s.pending || []).some(p => p.data && p.data.ai === e.id && p.kind === id);
    const chance = dtMin / 40;   // per-minute roll for each kind of offer
    const pressure = G.aiPressure(s);
    if (ratio >= 2 && pressure > 0.3 && r.status !== 'peace' && r.status !== 'alliance' && r.opinion < 20 && !open('tribute') && Math.random() < chance) {
      const gold = Math.round(100 + s.empires.p.gold * 0.15);
      G.addPending(s, { kind: 'tribute', title: `The ${e.name} demands tribute`, text: `Their envoy demands ${gold} gold, or there will be war.`,
        options: [{ key: 'pay', label: `Pay ${gold} gold` }, { key: 'refuse', label: 'Refuse' }], expires: s.time + 300 * G.pace(s).time, def: 'refuse', data: { ai: e.id, gold } });
    }
    if (r.status === 'war' && s.time - r.since > 2400 * G.pace(s).time && ratio < 1 && !open('peaceOffer') && Math.random() < chance) {
      G.addPending(s, { kind: 'peaceOffer', title: `The ${e.name} sues for peace`, text: `Battered by the war, they offer peace${ratio < 0.6 ? ' and 300 gold' : ''}.`,
        options: [{ key: 'accept', label: 'Accept peace' }, { key: 'decline', label: 'Fight on' }], expires: s.time + 300 * G.pace(s).time, def: 'decline', data: { ai: e.id, gold: ratio < 0.6 ? 300 : 0 } });
    }
    if (r.status === 'peace' && r.opinion >= 65 && s.time - r.since > 1800 * G.pace(s).time && !open('allianceOffer') && Math.random() < chance) {
      G.addPending(s, { kind: 'allianceOffer', title: `The ${e.name} proposes an alliance`, text: 'They offer to stand with you against your enemies.',
        options: [{ key: 'accept', label: 'Form an alliance' }, { key: 'decline', label: 'Decline politely' }], expires: s.time + 300 * G.pace(s).time, def: 'decline', data: { ai: e.id } });
    }
    if (r.opinion >= 50 && Math.random() < dtMin / 60) {
      const cap = G.capital(s, 'p');
      if (cap) {
        const g = G.pick(['grain', 'timber', 'stone', 'ore']);
        const n = Math.round(150 + G.renown(s, e.id) * 0.5);
        G.gain(s, cap, { [g]: n });
        G.log(s, 'p', `🎁 The ${e.name} sends a gift of ${n} ${DATA.goods[g].name.toLowerCase()} to ${cap.name}.`, 'good');
      }
    }
  }
  genOffers(s, dtMin);
});

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
    if (p.data.gold) s.empires.p.gold += p.data.gold;
    G.log(s, 'p', `Peace with the ${s.empires[ai].name}.`, 'good');
  }
};
G.pendingHandlers.allianceOffer = (s, p, key) => {
  const ai = p.data.ai;
  if (key === 'accept') { setStatus(s, ai, 'alliance'); shift(s, ai, 10); G.log(s, 'p', `You are now allied with the ${s.empires[ai].name}.`, 'good'); }
  else shift(s, ai, -5);
};

// ---------------------------------------------------------------------
// Player diplomatic actions
// ---------------------------------------------------------------------
const cooldown = (s, ai) => {
  const r = G.rel(s, ai);
  if (r.cool > s.time) return `Their court will not receive another envoy for ${Math.ceil((r.cool - s.time) / 60)} min`;
  r.cool = s.time + 300 * G.pace(s).time;
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
  peace: (s, ai) => {
    const r = G.rel(s, ai);
    if (r.status === 'peace' || r.status === 'alliance') return 'You are already at peace';
    const c = cooldown(s, ai); if (c) return c;
    const ratio = G.power(s, 'p') / Math.max(1, G.power(s, ai));
    const score = r.opinion + 30 * G.clamp(ratio - 1, -1, 2) - (r.status === 'war' ? 10 : 0);
    if (score >= 0) { setStatus(s, ai, 'peace'); shift(s, ai, 10); return `The ${s.empires[ai].name} agrees to peace.`; }
    shift(s, ai, -3);
    return `The ${s.empires[ai].name} refuses. (They need to like or fear you more.)`;
  },
  alliance: (s, ai) => {
    const r = G.rel(s, ai);
    if (r.status !== 'peace') return 'You must be at peace first';
    if (s.time - r.since < 1200 * G.pace(s).time) return 'Your peace is too young for an alliance';
    const c = cooldown(s, ai); if (c) return c;
    if (r.opinion >= 50) { setStatus(s, ai, 'alliance'); return `The ${s.empires[ai].name} joins you in alliance!`; }
    return `The ${s.empires[ai].name} is not yet ready to ally with you (opinion ${Math.round(r.opinion)} / 50).`;
  },
  war: (s, ai) => {
    const r = G.rel(s, ai);
    if (r.status === 'war') return 'Already at war';
    if (r.status === 'peace' || r.status === 'alliance') {
      for (const e of Object.values(s.empires)) if (e.id !== 'p' && e.id !== ai && !e.dead) shift(s, e.id, -10);
    }
    setStatus(s, ai, 'war'); shift(s, ai, -30);
    return `You declared war on the ${s.empires[ai].name}.`;
  },
  tribute: (s, ai) => {
    const r = G.rel(s, ai);
    if (r.status === 'alliance') return 'You cannot extort an ally';
    const c = cooldown(s, ai); if (c) return c;
    const ratio = G.power(s, 'p') / Math.max(1, G.power(s, ai));
    const e = s.empires[ai];
    if (ratio >= 2) {
      const gold = Math.round(Math.min(Math.max(0, e.gold) * 0.3 + 100, 200 + 120 * ratio));
      s.empires.p.gold += gold; shift(s, ai, -15);
      return `Fearing your might, the ${e.name} pays ${gold} gold.`;
    }
    shift(s, ai, -12);
    if (ratio < 1 && r.status === 'neutral' && Math.random() < 0.5) { setStatus(s, ai, 'war'); return `Insulted, the ${e.name} declares war!`; }
    return `The ${e.name} laughs at your demand.`;
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
    if (r.status === 'war' || r.opinion < -30 || Math.random() > dtMin / 7) continue;
    const cap = G.capital(s, 'p');
    if (!cap) return;
    const capN = G.storageCap(s, cap);
    const gives = SPECIALTY[e.race].filter(g => visible.includes(g) && (cap.res[g] || 0) < capN * 0.6);
    if (!gives.length) continue;
    const give = G.pick(gives);
    const scale = 1 + s.time / (3600 * G.pace(s).time);
    const n = Math.round(G.rnd(150, 400) * scale / Math.max(1, DATA.goods[give].value * 2));
    const value = n * DATA.goods[give].value * (1.15 - r.opinion / 400);
    let want;
    if (Math.random() < 0.4) want = { gold: Math.round(value) };
    else {
      const pool = ['grain', 'timber', 'stone', 'ore', 'iron'].filter(x => x !== give);
      const rich = pool.filter(x => (cap.res[x] || 0) > capN * 0.5);
      const g = G.pick(rich.length ? rich : pool);
      want = { [g]: Math.round(value / DATA.goods[g].value) };
    }
    s.offers.push({ id: G.newId(s, 'o'), ai: e.id, give: { [give]: n }, want, expires: s.time + 600 * G.pace(s).time });
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
