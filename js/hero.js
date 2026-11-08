// =====================================================================
//  Hero — the player's champion: levels, attributes, items, adventures
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
};

G.hero = s => s.empires.p.hero;
G.heroCity = s => G.citiesOf(s, 'p').find(c => (c.units.hero || 0) > 0) || null;
G.heroMoving = s => s.moves.find(m => m.owner === 'p' && m.units.hero);
G.xpNeed = level => Math.round(80 * Math.pow(level, 1.4));

const eqFx = (h, key) => Object.values(h.eq).reduce((a, it) => a + ((it && it.fx[key]) || 0), 0);

G.heroStats = (s, owner) => {
  const h = s.empires[owner].hero;
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
G.heroLeadership = (s, owner) => { const h = s.empires[owner].hero; return h ? 1 + 0.02 * h.points.lead + eqFx(h, 'lead') : 1; };
G.heroDefense = (s, owner) => { const h = s.empires[owner].hero; return h ? 1 + 0.02 * h.points.guard : 1; };
G.heroCanMarch = (s, owner) => {
  const h = s.empires[owner].hero;
  if (!h || h.dead) return 'Your hero has fallen';
  if (h.hp < 20) return `Your hero is too wounded to march (${Math.floor(h.hp)} health)`;
  return null;
};

const gainXp = (s, amount) => {
  const h = G.hero(s);
  if (!h || h.dead) return;
  amount = Math.round(amount * G.mod(s, 'p', null, 'heroXp') * (1 + eqFx(h, 'xp')));
  if (amount <= 0) return;
  h.xp += amount;
  while (h.xp >= G.xpNeed(h.level)) {
    h.xp -= G.xpNeed(h.level);
    h.level++;
    h.free += 4;
    h.hp = Math.min(100, h.hp + 30);
    G.log(s, 'p', `🦸 ${h.name} reached level ${h.level}! 4 attribute points to spend.`, 'good');
  }
  return amount;
};

G.heroGainXp = (s, amount) => gainXp(s, amount);
G.heroLost = s => { if (!G.hero(s).dead) killHero(s, 'far from home'); };

const killHero = (s, where) => {
  const h = G.hero(s);
  h.dead = true; h.hp = 0; h.reviveAt = null;
  for (const c of G.citiesOf(s, 'p')) delete c.units.hero;
  G.log(s, 'p', `☠️ ${h.name} has fallen ${where}. Revive them at your capital.`, 'bad');
};

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

// ---- player actions ----
G.heroAssign = (s, attr) => {
  const h = G.hero(s);
  if (!h || h.free <= 0) return 'No points to spend';
  h.points[attr]++; h.free--;
  return null;
};
G.heroEquip = (s, itemId) => {
  const h = G.hero(s);
  const i = h.items.findIndex(x => x.id === itemId);
  if (i < 0) return 'No such item';
  const it = h.items.splice(i, 1)[0];
  if (h.eq[it.slot]) h.items.push(h.eq[it.slot]);
  h.eq[it.slot] = it;
  return null;
};
G.heroUnequip = (s, slot) => {
  const h = G.hero(s);
  if (!h.eq[slot]) return null;
  h.items.push(h.eq[slot]); h.eq[slot] = null;
  return null;
};
G.heroSell = (s, itemId) => {
  const h = G.hero(s);
  const i = h.items.findIndex(x => x.id === itemId);
  if (i < 0) return 'No such item';
  const it = h.items.splice(i, 1)[0];
  s.empires.p.gold += DATA.rarity[it.rarity].value;
  return null;
};
G.reviveCost = s => { const L = G.hero(s).level; return { gold: 120 * L, grain: 150 * L }; };
G.reviveHero = s => {
  const h = G.hero(s);
  if (!h.dead) return 'Your hero lives';
  if (h.reviveAt) return 'Already being revived';
  const cap = G.capital(s, 'p');
  const cost = G.reviveCost(s);
  if (!G.canAfford(s, cap, cost)) return 'Not enough goods in ' + cap.name;
  G.pay(s, cap, cost);
  h.reviveAt = s.time + Math.round(90 * h.level * G.pace(s).time);
  return null;
};
G.renameHero = (s, name) => { G.hero(s).name = name; };

// ---- hooks ----
G.newGameHooks.push((s, opts) => {
  s.empires.p.hero = {
    name: opts.heroName || 'Aldric', level: 1, xp: 0, hp: 100, free: 3,
    points: { str: 0, lead: 0, guard: 0, econ: 0 }, items: [], eq: { weapon: null, armor: null, horse: null, trinket: null },
    dead: false, reviveAt: null, adventures: 0,
  };
  G.capital(s, 'p').units.hero = 1;
});

G.modSources.push((s, owner, city, key) => {
  if (owner !== 'p' || !city || !DATA.goods[key] || !DATA.goods[key].raw) return 1;
  const h = s.empires.p.hero;
  if (!h || h.dead || !(city.units.hero > 0)) return 1;
  let add = 0.02 * h.points.econ;
  const t = h.eq.trinket;
  if (t && t.fx.good === key) add += t.fx.pct;
  return 1 + add;
});

G.stepHooks.push((s, dt) => {
  const h = s.empires.p && s.empires.p.hero;
  if (!h) return;
  if (h.dead) {
    if (h.reviveAt && h.reviveAt <= s.time) {
      const cap = G.capital(s, 'p');
      if (cap) {
        h.dead = false; h.hp = 100; h.reviveAt = null;
        cap.units.hero = 1;
        G.log(s, 'p', `🦸 ${h.name} rises again in ${cap.name}.`, 'good');
      }
    }
    return;
  }
  if (h.hp < 100 && G.heroCity(s)) h.hp = Math.min(100, h.hp + 8 * (dt / 60) * (h.eq.trinket && h.eq.trinket.fx.regen || 1) * G.pace(s).prod);
});

G.battleHooks.push((s, ctx) => {
  const { m, r, defHad } = ctx;
  const h = s.empires.p && s.empires.p.hero;
  if (!h || h.dead) return;
  const armor = eqFx(h, 'armor');
  const xpOf = units => Object.entries(units).reduce((a, [u, n]) => {
    const d = DATA.units[u]; return a + (d.atk + d.defI + d.defC) / 6 * n;
  }, 0);
  if (m.owner === 'p' && m.units.hero) {
    if (!r.attLeft.hero) { killHero(s, 'in battle'); return; }
    h.hp -= r.attLoss * 100 * (1 - armor);
    if (h.hp <= 0) { r.attLeft.hero = 0; killHero(s, 'of their wounds'); return; }
    gainXp(s, xpOf(r.defLost));
  } else if (ctx.defOwner === 'p' && defHad && defHad.hero) {
    if (!r.defLeft.hero) { killHero(s, 'defending ' + ctx.city.name); return; }
    h.hp -= r.defLoss * 100 * (1 - armor);
    if (h.hp <= 0) { ctx.city.units.hero = 0; delete ctx.city.units.hero; killHero(s, 'of their wounds'); return; }
    gainXp(s, xpOf(r.attLost));
  }
});

// adventure: a skill check, not a pitched battle
G.moveHandlers.adventure = (s, m) => {
  const tile = G.tileAt(s, m.x, m.y);
  const ruin = tile.ruin;
  const h = G.hero(s);
  if (!ruin || ruin.readyAt > s.time || !h || h.dead) {
    G.report(s, ['p'], `The ruins at (${m.x}, ${m.y}) lie empty`, 'info', { extra: 'Someone plundered them recently.' });
    G.sendHome(s, m, m.units);
    return;
  }
  const tier = ruin.tier;
  const escort = { ...m.units }; delete escort.hero;
  const P = G.heroStats(s, 'p').atk * G.heroLeadership(s, 'p') + G.atkPower(s, 'p', escort) * 0.5;
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
    killHero(s, 'in the ruins');
    delete m.units.hero;
    body.extra = `${h.name} did not return from the ruins.`;
  } else if (success) {
    body.xp = gainXp(s, 60 * Math.pow(tier, 1.5)) || 0;
    const goods = ['grain', 'timber', 'stone', 'ore', 'iron', 'tools'];
    for (let i = 0; i < 3; i++) { const g = G.pick(goods); body.loot[g] = (body.loot[g] || 0) + Math.round(tier * G.rnd(120, 300)); }
    body.loot.gold = Math.round(tier * G.rnd(50, 150));
    if (Math.random() < 0.35 + tier * 0.08) { body.item = G.newHeroItem(tier); h.items.push(body.item); }
    ruin.readyAt = s.time + Math.round(3600 * G.pace(s).time * G.rnd(0.7, 1.3));
    ruin.units = null;
    s.stats.adventures = (s.stats.adventures || 0) + 1;
  } else {
    body.xp = gainXp(s, 15 * tier) || 0;
    body.extra = 'The ruins proved too dangerous this time.';
  }
  G.report(s, ['p'], `Adventure ${success && h.hp > 0 ? 'succeeded' : 'failed'}: ruins of tier ${tier} (${m.x}, ${m.y})`, success && h.hp > 0 ? 'win' : 'loss', body);
  const gold = body.loot.gold; delete body.loot.gold;
  if (gold) s.empires.p.gold += gold;
  G.sendHome(s, m, m.units, { ...body.loot });
  if (gold) body.loot.gold = gold;
};
