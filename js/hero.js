// =====================================================================
//  Heroes — every realm's champion: levels, attributes, items, adventures,
//  duels. The player's hero is s.empires.p.hero; AI heroes (rivalheroes.js)
//  share the same structure on s.empires[id].hero.
// =====================================================================
'use strict';

DATA.items = {
  weapon: [
    { name: 'Notched Sword',     icon: '🗡️', fx: { atk: 60 } },
    { name: "Knight's Blade",    icon: '⚔️', fx: { atk: 150 } },
    { name: 'Dragonbone Saber',  icon: '🐉', fx: { atk: 320 } },
  ],
  armor: [
    { name: 'Leather Jerkin',    icon: '🦺', fx: { def: 40, armor: 0.1 } },
    { name: 'Mail Hauberk',      icon: '🥋', fx: { def: 110, armor: 0.2 } },
    { name: 'Runed Plate',       icon: '🛡️', fx: { def: 240, armor: 0.35 } },
  ],
  horse: [
    { name: 'Steady Pony',       icon: '🐴', fx: { spd: 10 } },
    { name: 'Swift Courser',     icon: '🐎', fx: { spd: 13 } },
    { name: 'Shadowmare',        icon: '🦄', fx: { spd: 17 } },
  ],
  trinket: [
    { name: 'War Banner',        icon: '🚩', tiers: [{ lead: 0.03 }, { lead: 0.06 }, { lead: 0.1 }] },
    { name: 'Tome of Wisdom',    icon: '📕', tiers: [{ xp: 0.15 }, { xp: 0.3 }, { xp: 0.5 }] },
    { name: "Healer's Amulet",   icon: '📿', tiers: [{ regen: 1.5 }, { regen: 2 }, { regen: 3 }] },
    { name: 'Sickle of Plenty',  icon: '🌾', tiers: [{ good: 'grain', pct: 0.05 }, { good: 'grain', pct: 0.1 }, { good: 'grain', pct: 0.15 }] },
    { name: "Woodsman's Charm",  icon: '🪵', tiers: [{ good: 'timber', pct: 0.05 }, { good: 'timber', pct: 0.1 }, { good: 'timber', pct: 0.15 }] },
    { name: "Mason's Seal",      icon: '🪨', tiers: [{ good: 'stone', pct: 0.05 }, { good: 'stone', pct: 0.1 }, { good: 'stone', pct: 0.15 }] },
    { name: "Miner's Lamp",      icon: '🏮', tiers: [{ good: 'ore', pct: 0.05 }, { good: 'ore', pct: 0.1 }, { good: 'ore', pct: 0.15 }] },
  ],
};
DATA.rarity = [
  { name: 'Common', color: '#8a8a8a', value: 100 },
  { name: 'Rare',   color: '#3b82c4', value: 300 },
  { name: 'Epic',   color: '#9b4dca', value: 800 },
];
DATA.heroAttrs = {
  str:   { name: 'Might',      icon: '💪', desc: '+50 attack and +35 defense for the hero.' },
  lead:  { name: 'Leadership', icon: '🎺', desc: '+2% attack for the army the hero marches with.' },
  guard: { name: 'Warding',    icon: '🏰', desc: '+2% defense for the city the hero stands in.' },
  econ:  { name: 'Stewardship',icon: '📜', desc: '+2% raw goods in the city the hero stands in.' },
  arcana:{ name: 'Arcana',     icon: '🔮', desc: '+4% spell power and −3% mana cost for the realm per point; the hero can cast hero spells.' },
};

// Famous heroes (level >= FAME_LEVEL) of rival realms add to their army's attack when leading.
G.HERO_FAME_LEVEL = 8;
G.HERO_FAME_LEAD = 0.05;
G.HERO_SLAY_RENOWN = 15;

// ---- lookups (owner defaults to the player, so older callers keep working) ----
// older saves lack later attributes (arcana): default them lazily on every lookup
G.heroOf = (s, owner = 'p') => {
  const h = (s.empires[owner] && s.empires[owner].hero) || null;
  if (h && h.points) for (const k of Object.keys(DATA.heroAttrs)) if (h.points[k] === undefined) h.points[k] = 0;
  return h;
};
G.hero = s => G.heroOf(s, 'p');
G.heroCityOf = (s, owner = 'p') => G.citiesOf(s, owner).find(c => (c.units.hero || 0) > 0) || null;
G.heroCity = (s, owner = 'p') => G.heroCityOf(s, owner);
G.heroMovingOf = (s, owner = 'p') => s.moves.find(m => m.owner === owner && m.units.hero) || null;
G.heroMoving = (s, owner = 'p') => G.heroMovingOf(s, owner);
G.heroFamous = (s, owner) => { const h = G.heroOf(s, owner); return !!(h && !h.dead && owner !== 'p' && h.level >= G.HERO_FAME_LEVEL); };
G.xpNeed = level => Math.round(80 * Math.pow(level, 1.4));
G.newHeroState = name => ({
  name, level: 1, xp: 0, hp: 100, free: 3,
  points: { str: 0, lead: 0, guard: 0, econ: 0, arcana: 0 }, items: [], eq: { weapon: null, armor: null, horse: null, trinket: null },
  dead: false, reviveAt: null, adventures: 0,
});

const eqFx = (h, key) => Object.values(h.eq).reduce((a, it) => a + ((it && it.fx[key]) || 0), 0);

G.heroStats = (s, owner) => {
  const h = G.heroOf(s, owner);
  if (!h) return DATA.units.hero;
  const horse = h.eq.horse;
  return {
    ...DATA.units.hero,
    atk: 80 + 50 * h.points.str + eqFx(h, 'atk'),
    defI: 60 + 35 * h.points.str + eqFx(h, 'def'),
    defC: 60 + 35 * h.points.str + eqFx(h, 'def'),
    spd: horse ? horse.fx.spd : 7,
  };
};
G.heroLeadership = (s, owner) => {
  const h = G.heroOf(s, owner);
  if (!h) return 1;
  return 1 + 0.02 * h.points.lead + eqFx(h, 'lead') + (G.heroFamous(s, owner) ? G.HERO_FAME_LEAD : 0);
};
G.heroArcana = (s, owner = 'p') => { const h = G.heroOf(s, owner); return h && !h.dead ? (h.points.arcana || 0) : 0; };
G.heroDefense = (s, owner) => { const h = G.heroOf(s, owner); return h ? 1 + 0.02 * h.points.guard : 1; };
G.heroCanMarch = (s, owner) => {
  const h = G.heroOf(s, owner);
  if (!h || h.dead) return 'Your hero has fallen';
  if (h.hp < 20) return `Your hero is too wounded to march (${Math.floor(h.hp)} health)`;
  return null;
};

const gainXp = (s, amount, owner = 'p') => {
  const h = G.heroOf(s, owner);
  if (!h || h.dead) return;
  amount = Math.round(amount * G.mod(s, owner, null, 'heroXp') * (1 + eqFx(h, 'xp')));
  if (amount <= 0) return;
  h.xp += amount;
  while (h.xp >= G.xpNeed(h.level)) {
    h.xp -= G.xpNeed(h.level);
    h.level++;
    h.free += 4;
    h.hp = Math.min(100, h.hp + 30);
    G.log(s, owner, `🦸 ${h.name} reached level ${h.level}! 4 attribute points to spend.`, 'good');
  }
  return amount;
};

G.heroGainXp = (s, amount, owner = 'p') => gainXp(s, amount, owner);
// engine.js calls this as G.heroLost(s) when a returning army finds no home and no capital.
// Guard the player's hero: only kill it when it really is nowhere to be found.
G.heroLost = (s, owner = 'p') => {
  const h = G.heroOf(s, owner);
  if (!h || h.dead) return;
  if (G.heroCityOf(s, owner) || G.heroMovingOf(s, owner)) return;
  killHero(s, owner, 'far from home');
};

const killHero = (s, owner, where) => {
  const h = G.heroOf(s, owner);
  h.dead = true; h.hp = 0; h.reviveAt = null;
  h.diedAt = s.time;
  for (const c of G.citiesOf(s, owner)) delete c.units.hero;
  if (owner === 'p') G.log(s, 'p', `☠️ ${h.name} has fallen ${where}. Revive them at your capital.`, 'bad');
};
G.killHero = (s, owner, where) => { const h = G.heroOf(s, owner); if (h && !h.dead) killHero(s, owner, where || 'in battle'); };

G.newHeroItem = tier => {
  const roll = Math.random();
  const epic = 0.04 + tier * 0.03, rare = epic + 0.22 + tier * 0.05;
  const r = roll < epic ? 2 : roll < rare ? 1 : 0;
  const slot = G.pick(['weapon', 'armor', 'horse', 'trinket', 'trinket']);
  const tpl = slot === 'trinket' ? G.pick(DATA.items.trinket) : DATA.items[slot][r];
  const fx = slot === 'trinket' ? { ...tpl.tiers[r] } : { ...tpl.fx };
  return { id: 'i' + Math.floor(Math.random() * 1e9), slot, rarity: r, name: tpl.name, icon: tpl.icon, fx };
};

G.itemText = it => {
  const f = it.fx, p = [];
  if (f.atk) p.push(`+${f.atk} hero attack`);
  if (f.def) p.push(`+${f.def} hero defense`);
  if (f.armor) p.push(`−${Math.round(f.armor * 100)}% wounds`);
  if (f.spd) p.push(`hero speed ${f.spd}`);
  if (f.lead) p.push(`+${Math.round(f.lead * 100)}% army attack`);
  if (f.xp) p.push(`+${Math.round(f.xp * 100)}% experience`);
  if (f.regen) p.push(`×${f.regen} healing`);
  if (f.good) p.push(`+${Math.round(f.pct * 100)}% ${DATA.goods[f.good].name} in the hero's city`);
  return p.join(', ');
};

// ---- actions (the UI calls these for the player; AI heroes pass their owner) ----
G.heroAssign = (s, attr, owner = 'p') => {
  const h = G.heroOf(s, owner);
  if (!h || h.free <= 0) return 'No points to spend';
  h.points[attr]++; h.free--;
  return null;
};
G.heroEquip = (s, itemId, owner = 'p') => {
  const h = G.heroOf(s, owner);
  const i = h.items.findIndex(x => x.id === itemId);
  if (i < 0) return 'No such item';
  const it = h.items.splice(i, 1)[0];
  if (h.eq[it.slot]) h.items.push(h.eq[it.slot]);
  h.eq[it.slot] = it;
  return null;
};
G.heroUnequip = (s, slot, owner = 'p') => {
  const h = G.heroOf(s, owner);
  if (!h.eq[slot]) return null;
  h.items.push(h.eq[slot]); h.eq[slot] = null;
  return null;
};
G.heroSell = (s, itemId, owner = 'p') => {
  const h = G.heroOf(s, owner);
  const i = h.items.findIndex(x => x.id === itemId);
  if (i < 0) return 'No such item';
  const it = h.items.splice(i, 1)[0];
  s.empires[owner].gold += DATA.rarity[it.rarity].value;
  return null;
};
G.reviveCost = (s, owner = 'p') => { const L = G.heroOf(s, owner).level; return { gold: 120 * L, grain: 150 * L }; };
G.reviveTime = (s, owner = 'p') => Math.round(90 * G.heroOf(s, owner).level * G.pace(s).time);
G.reviveHero = (s, owner = 'p') => {
  const h = G.heroOf(s, owner);
  if (!h.dead) return 'Your hero lives';
  if (h.reviveAt) return 'Already being revived';
  const cap = G.capital(s, owner);
  if (!cap) return 'No capital';
  const cost = G.reviveCost(s, owner);
  if (!G.canAfford(s, cap, cost)) return 'Not enough goods in ' + cap.name;
  G.pay(s, cap, cost);
  h.reviveAt = s.time + G.reviveTime(s, owner);
  return null;
};
G.renameHero = (s, name, owner = 'p') => { G.heroOf(s, owner).name = name; };

// ---- hooks ----
G.newGameHooks.push((s, opts) => {
  s.empires.p.hero = G.newHeroState(opts.heroName || 'Aldric');
  G.capital(s, 'p').units.hero = 1;
});

// Stewardship and a goods trinket raise raw goods in the city the hero stands in (any realm)
G.modSources.push((s, owner, city, key) => {
  if (!city || !DATA.goods[key] || !DATA.goods[key].raw) return 1;
  const h = G.heroOf(s, owner);
  if (!h || h.dead || !(city.units.hero > 0)) return 1;
  let add = 0.02 * h.points.econ;
  const t = h.eq.trinket;
  if (t && t.fx.good === key) add += t.fx.pct;
  return 1 + add;
});

// Arcana: realm-wide spell power and mana cost (keys used by magic.js)
G.modSources.push((s, owner, city, key) => {
  if (key !== 'spellPower' && key !== 'spellCost') return 1;
  const a = owner ? G.heroArcana(s, owner) : 0;
  if (!a) return 1;
  return key === 'spellPower' ? 1 + 0.04 * a : Math.max(0.5, 1 - 0.03 * a);
});

G.stepHooks.push((s, dt) => {
  for (const emp of Object.values(s.empires)) {
    const h = emp.hero;
    if (!h || emp.dead) continue;
    const owner = emp.id;
    if (h.dead) {
      if (h.reviveAt && h.reviveAt <= s.time) {
        const cap = G.capital(s, owner);
        if (cap) {
          h.dead = false; h.hp = 100; h.reviveAt = null;
          cap.units.hero = 1;
          G.log(s, owner, `🦸 ${h.name} rises again in ${cap.name}.`, 'good');
        }
      }
      continue;
    }
    if (h.hp < 100 && G.heroCityOf(s, owner)) h.hp = Math.min(100, h.hp + 8 * (dt / 60) * (h.eq.trinket && h.eq.trinket.fx.regen || 1) * G.pace(s).prod);
  }
});

// ---------------------------------------------------------------------
// Battles: duels, wounds, experience, death, slaying rewards
// ---------------------------------------------------------------------
// A duel is fought when an attacking hero meets a defending hero in a city battle.
// The battle hooks run after G.battle has been resolved, so the duel's morale effect
// (+10% for the winning side) is applied as extra casualties on the loser's army:
// 10% of its surviving troops (never the hero) are moved from *Left to *Lost. Because
// city.units is r.defLeft and the report and the returning army read r.attLeft/r.attLost
// after the hooks, the losses show up in the battle report and the march home with no
// engine change. Loot was already taken before the hooks; that is accepted.
G.DUEL_MORALE = 0.1;
let duelNote = null;     // { units, text } waiting for the battle report written after the hooks

const heroPower = (s, owner) => {
  const h = G.heroOf(s, owner), st = G.heroStats(s, owner);
  return ((st.atk + st.defI) / 2) * (0.5 + h.hp / 200);
};
G.resolveDuel = (s, attOwner, defOwner) => {
  const ha = G.heroOf(s, attOwner), hd = G.heroOf(s, defOwner);
  const pa = heroPower(s, attOwner) * G.rnd(0.7, 1.3), pd = heroPower(s, defOwner) * G.rnd(0.7, 1.3);
  const attWins = pa >= pd;
  const [W, L, wo, lo] = attWins ? [ha, hd, attOwner, defOwner] : [hd, ha, defOwner, attOwner];
  const margin = G.clamp((Math.max(pa, pd) - Math.min(pa, pd)) / Math.max(1, Math.min(pa, pd)), 0, 1);
  return {
    attWins, winner: wo, loser: lo, winnerName: W.name, loserName: L.name,
    loserWound: Math.round((35 + 40 * margin) * (1 - eqFx(L, 'armor'))),
    winnerWound: Math.round(G.rnd(0, 8) * (1 - eqFx(W, 'armor'))),
    xp: Math.round(40 + 15 * L.level),
  };
};

const moraleLoss = (left, lost, frac) => {
  for (const [u, n] of Object.entries(left)) {
    if (u === 'hero' || !(n > 0)) continue;
    const k = Math.round(n * frac);
    if (k > 0) { left[u] = n - k; lost[u] = (lost[u] || 0) + k; }
  }
};

// slaying an enemy hero: renown for the slayer's realm, and a chance at one of its items
const slainBy = (s, victimOwner, slayerOwner, notes) => {
  const victim = G.heroOf(s, victimOwner);
  const slayer = s.empires[slayerOwner];
  if (!victim || !slayer || slayerOwner === victimOwner) return;
  slayer.renownBonus = (slayer.renownBonus || 0) + G.HERO_SLAY_RENOWN;
  slayer.heroesSlain = (slayer.heroesSlain || 0) + 1;
  let prize = null;
  const sh = G.heroOf(s, slayerOwner);
  const pool = [...Object.values(victim.eq).filter(Boolean), ...victim.items];
  if (sh && pool.length && Math.random() < 0.5) {
    prize = G.pick(pool);
    if (victim.eq[prize.slot] === prize) victim.eq[prize.slot] = null;
    else victim.items = victim.items.filter(x => x !== prize);
    sh.items.push(prize);
  }
  const vName = `${victim.name} of the ${s.empires[victimOwner].name}`;
  notes.push(`${vName} was slain (+${G.HERO_SLAY_RENOWN} renown for the ${slayer.name}${prize ? `; ${sh.name} claims ${prize.name}` : ''}).`);
  if (slayerOwner === 'p') G.log(s, 'p', `⚔️ We slew ${vName}! +${G.HERO_SLAY_RENOWN} renown${prize ? `, and ${sh.name} claims ${prize.icon} ${prize.name}` : ''}.`, 'good');
  else if (victimOwner !== 'p' && victim.level >= G.HERO_FAME_LEVEL) G.log(s, 'p', `📜 The famed ${vName} fell in battle against the ${slayer.name}.`, 'info');
};

G.battleHooks.push((s, ctx) => {
  duelNote = null;
  const { m, r, defHad } = ctx;
  const ao = m.owner, dO = ctx.defOwner;
  const ha = m.units.hero ? G.heroOf(s, ao) : null;
  const hd = dO && defHad && defHad.hero ? G.heroOf(s, dO) : null;
  const A = ha && !ha.dead ? ha : null, D = hd && !hd.dead ? hd : null;
  if (!A && !D) return;
  const notes = [];
  // remember who has fought the player (the UI only shows a rival hero's gear once you've met it)
  if (A && dO === 'p') A.metP = true;
  if (D && ao === 'p') D.metP = true;

  // ---- duel first ----
  let duel = null;
  if (A && D && ctx.site === 'city' && ao !== dO) {
    duel = G.resolveDuel(s, ao, dO);
    if (duel.attWins) moraleLoss(r.defLeft, r.defLost, G.DUEL_MORALE); else moraleLoss(r.attLeft, r.attLost, G.DUEL_MORALE);
    notes.push(`⚔️ Duel: ${duel.winnerName} (${s.empires[duel.winner].name}) bested ${duel.loserName} (${s.empires[duel.loser].name}), wounding them by ${duel.loserWound}. The victors fought on with heart (+${Math.round(G.DUEL_MORALE * 100)}%: the losing side lost a tenth more of its troops).`);
    (ao === duel.winner ? A : D).duels = ((ao === duel.winner ? A : D).duels || 0) + 1;
  }
  const xpOf = units => Object.entries(units).reduce((a, [u, n]) => {
    if (u === 'hero') return a;
    const d = DATA.units[u]; return a + (d.atk + d.defI + d.defC) / 6 * n;
  }, 0);
  const wound = owner => duel ? (duel.winner === owner ? duel.winnerWound : duel.loserWound) : 0;

  // ---- attacker's hero ----
  if (A) {
    if (!r.attLeft.hero) { killHero(s, ao, 'in battle'); if (dO) slainBy(s, ao, dO, notes); }
    else {
      A.hp -= r.attLoss * 100 * (1 - eqFx(A, 'armor')) + wound(ao);
      if (A.hp <= 0) { delete r.attLeft.hero; r.attLost.hero = 1; killHero(s, ao, 'of their wounds'); if (dO) slainBy(s, ao, dO, notes); }
      else {
        gainXp(s, xpOf(r.defLost), ao);
        if (duel && duel.winner === ao) gainXp(s, duel.xp, ao);
      }
    }
  }
  // ---- defender's hero ----
  if (D) {
    if (!r.defLeft.hero) { killHero(s, dO, ctx.city ? 'defending ' + ctx.city.name : 'in battle'); slainBy(s, dO, ao, notes); }
    else {
      D.hp -= r.defLoss * 100 * (1 - eqFx(D, 'armor')) + wound(dO);
      if (D.hp <= 0) {
        if (ctx.city) delete ctx.city.units.hero;
        delete r.defLeft.hero; r.defLost.hero = 1;
        killHero(s, dO, 'of their wounds'); slainBy(s, dO, ao, notes);
      } else {
        gainXp(s, xpOf(r.attLost), dO);
        if (duel && duel.winner === dO) gainXp(s, duel.xp, dO);
      }
    }
  }
  if (notes.length) duelNote = { units: m.units, text: notes.join(' ') };
});

// append the duel / slaying note to the battle report written right after the hooks
{
  const baseReport = G.report;
  G.report = (s, owners, title, kind, body) => {
    if (duelNote && body && body.attSent) {
      if (body.attSent === duelNote.units) body.extra = (body.extra ? body.extra + ' ' : '') + duelNote.text;
      duelNote = null;
    }
    return baseReport(s, owners, title, kind, body);
  };
}

// adventure: a skill check, not a pitched battle (any realm's hero)
G.moveHandlers.adventure = (s, m) => {
  const owner = m.owner;
  const tile = G.tileAt(s, m.x, m.y);
  const ruin = tile.ruin;
  const h = G.heroOf(s, owner);
  if (!ruin || ruin.readyAt > s.time || !h || h.dead) {
    G.report(s, [owner], `The ruins at (${m.x}, ${m.y}) lie empty`, 'info', { extra: 'Someone plundered them recently.' });
    G.sendHome(s, m, m.units);
    return;
  }
  const tier = ruin.tier;
  const escort = { ...m.units }; delete escort.hero;
  const P = G.heroStats(s, owner).atk * G.heroLeadership(s, owner) + G.atkPower(s, owner, escort) * 0.5;
  const D = 100 * Math.pow(tier, 1.8);
  const success = Math.random() < P / (P + D * 0.6);
  const armor = eqFx(h, 'armor');
  const dmg = G.rnd(8, 18) * Math.pow(tier, 0.8) * G.clamp(D / P, 0.3, 3) * (1 - armor) * (success ? 1 : 1.6);
  const escortLoss = G.clamp((success ? 0.05 : 0.25) * D / Math.max(1, P), 0, 0.9);
  const lost = {};
  for (const [u, n] of Object.entries(escort)) { lost[u] = Math.round(n * escortLoss); m.units[u] -= lost[u]; }
  h.hp -= dmg;
  h.adventures = (h.adventures || 0) + 1;
  const body = { adventure: true, success, tier, dmg: Math.round(dmg), attLost: lost, loot: {}, item: null, xp: 0 };
  if (h.hp <= 0) {
    killHero(s, owner, 'in the ruins');
    delete m.units.hero;
    body.extra = `${h.name} did not return from the ruins.`;
  } else if (success) {
    body.xp = gainXp(s, 60 * Math.pow(tier, 1.5), owner) || 0;
    const goods = ['grain', 'timber', 'stone', 'ore', 'iron', 'tools'];
    for (let i = 0; i < 3; i++) { const g = G.pick(goods); body.loot[g] = (body.loot[g] || 0) + Math.round(tier * G.rnd(120, 300)); }
    body.loot.gold = Math.round(tier * G.rnd(50, 150));
    if (Math.random() < 0.35 + tier * 0.08) { body.item = G.newHeroItem(tier); h.items.push(body.item); }
    ruin.readyAt = s.time + Math.round(3600 * G.pace(s).time * G.rnd(0.7, 1.3));
    ruin.units = null;
    if (owner === 'p') s.stats.adventures = (s.stats.adventures || 0) + 1;
    else h.ruinsWon = (h.ruinsWon || 0) + 1;
  } else {
    body.xp = gainXp(s, 15 * tier, owner) || 0;
    body.extra = 'The ruins proved too dangerous this time.';
  }
  G.report(s, [owner], `Adventure ${success && h.hp > 0 ? 'succeeded' : 'failed'}: ruins of tier ${tier} (${m.x}, ${m.y})`, success && h.hp > 0 ? 'win' : 'loss', body);
  const gold = body.loot.gold; delete body.loot.gold;
  if (gold) s.empires[owner].gold += gold;
  G.sendHome(s, m, m.units, { ...body.loot });
  if (gold) body.loot.gold = gold;
};
