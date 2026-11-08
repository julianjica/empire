// =====================================================================
//  Calamities & wonders — regional events that strike every realm in an
//  area: wyrms, blights, the restless dead, quakes, floods, eruptions,
//  arcane tempests, swarms, and the occasional blessing.
//  s.calamities = [{ id, kind, x, y, r, start, end, data }]
// =====================================================================
'use strict';

// lair/horde guardians
Object.assign(DATA.units, {
  wyrm:     { name: 'Elder Wyrm',     icon: '🐉', type: 'inf', atk: 900, defI: 1500, defC: 1300, spd: 6, carry: 0, upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc: 'An ancient dragon, woken and furious.' },
  restless: { name: 'Restless Dead',  icon: '💀', type: 'inf', atk: 32,  defI: 30,   defC: 34,   spd: 5, carry: 0, upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc: 'Bones that will not lie still.' },
  starbeast:{ name: 'Star-touched beast', icon: '✨', type: 'inf', atk: 40, defI: 45, defC: 40, spd: 6, carry: 0, upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc: 'Creatures twisted by the light of a fallen star.' },
});

const minutes = (s, m) => m * 60 * G.pace(s).time;
const RAW = ['grain', 'timber', 'stone', 'ore'];

// fx: modifiers for every city inside the area while it lasts
DATA.calamities = {
  wyrm: {
    name: 'A Wyrm Awakens', icon: '🐉', color: '#b3261e', bad: true, r: 4, dur: 100, terrain: ['mountain', 'hills'],
    fx: { grain: 0.8, timber: 0.8, popGrowth: 0.7 },
    text: 'An elder wyrm has made its lair in the heights. Fields and forests nearby burn, and it will strike towns in its shadow. Slay it at its lair for a dragon\'s hoard.',
  },
  blight: {
    name: 'The Grey Blight', icon: '🥀', color: '#7a7a5a', bad: true, r: 3, grow: 2, dur: 45, terrain: ['fertile', 'plains'],
    fx: { grain: 0.5 }, text: 'A grey rot creeps through the crops, halving the grain harvest. It spreads before it fades.',
  },
  deadrise: {
    name: 'The Restless Dead', icon: '💀', color: '#4d7a5a', bad: true, r: 4, dur: 80, near: 'ruin',
    fx: { popGrowth: 0.6, tax: 0.85 }, text: 'The old dead claw their way out of the ruins. Their hordes will assault nearby towns until destroyed.',
  },
  quake: {
    name: 'The Earthshaker', icon: '🌋', color: '#8a5a3a', bad: true, r: 2.5, dur: 35, terrain: ['hills', 'mountain'],
    fx: { stone: 1.35, ore: 1.35 }, text: 'The ground heaves. Buildings crack and fall, but the torn earth lays bare rich veins of stone and ore.',
  },
  flood: {
    name: 'The Drowning Rains', icon: '🌊', color: '#3b6fa8', bad: true, r: 6, dur: 25, river: true,
    fx: { grain: 0.6, buildTime: 1.25 }, then: 'silt', text: 'Endless rain swells the rivers over their banks. Riverside cities suffer; the flood will leave rich silt behind.',
  },
  silt: {
    name: 'Rich Silt', icon: '🌾', color: '#6a8f3a', bad: false, r: 6, dur: 35, river: true,
    fx: { grain: 1.3 }, text: 'Floodwaters have left black, fertile silt along the rivers.',
  },
  eruption: {
    name: 'Fire Mountain', icon: '🌋', color: '#c4501e', bad: true, r: 4, dur: 30, terrain: ['mountain'],
    fx: { grain: 0.75, timber: 0.75, stone: 0.75, ore: 0.75, popGrowth: 0.8 }, then: 'obsidian',
    text: 'A mountain splits and spews fire. Ash darkens the sky over the whole region.',
  },
  obsidian: {
    name: 'Fields of Obsidian', icon: '💎', color: '#4a3a6a', bad: false, r: 4, dur: 40, terrain: ['mountain'],
    fx: { stone: 1.35, ore: 1.35 }, text: 'Cooled lava leaves glassy stone and fresh ore for the taking.',
  },
  tempest: {
    name: 'Arcane Tempest', icon: '🌀', color: '#7a4ab8', bad: false, r: 4, dur: 30,
    fx: { researchTime: 0.6, popGrowth: 0.8 }, text: 'Wild magic crackles in the sky. Scholars here make great strides, though the people are uneasy.',
  },
  swarm: {
    name: 'The Chittering Swarm', icon: '🦗', color: '#8a7a2a', bad: true, r: 3, dur: 18, terrain: ['fertile', 'plains'],
    fx: { grain: 0.7 }, text: 'Clouds of giant locusts devour stored grain and crops alike.',
  },
  feybloom: {
    name: 'Feywild Bloom', icon: '🌸', color: '#d36aa8', bad: false, r: 3, dur: 35, terrain: ['forest'],
    fx: { timber: 1.4, grain: 1.3, popGrowth: 1.3 }, text: 'The veil to the fey realm thins. Trees and crops grow with uncanny vigour.',
  },
  starfall: {
    name: 'Starfall', icon: '☄️', color: '#d9a520', bad: false, r: 2, dur: 60, terrain: ['plains', 'fertile', 'hills'],
    fx: {}, text: 'A star has fallen to earth. Star-iron lies in the crater for whoever claims it first.',
  },
};
DATA.calamityWeights = { wyrm: 2, blight: 3, deadrise: 2, quake: 2, flood: 2, eruption: 1, tempest: 2, swarm: 2, feybloom: 2, starfall: 2 };

G.calamitiesAt = (s, x, y) => (s.calamities || []).filter(c => c.end > s.time && Math.hypot(c.x - x, c.y - y) <= c.r);

// modifiers: every active calamity covering a city applies its fx
G.modSources.push((s, owner, city, key) => {
  if (!city || !s.calamities || !s.calamities.length) return 1;
  let m = 1;
  for (const c of s.calamities) {
    if (c.end <= s.time) continue;
    const f = DATA.calamities[c.kind].fx[key];
    if (f && Math.hypot(c.x - city.x, c.y - city.y) <= c.r) {
      if (DATA.calamities[c.kind].river && !G.site(s, city).river) continue;
      m *= f;
    }
  }
  return m;
});

const pickSpot = (s, def) => {
  if (def.near === 'ruin') { const ruins = s.special.filter(t => t.ruin); if (ruins.length) return G.pick(ruins); }
  if (def.river && s.rivers && s.rivers.length) { const rv = G.pick(s.rivers); return s.tiles[rv[Math.floor(rv.length / 2)]]; }
  const pool = s.tiles.filter(t => t.terrain !== 'lake' && (!def.terrain || def.terrain.includes(t.terrain)));
  // prefer somewhere near at least one city, so it matters
  const near = pool.filter(t => Object.values(s.cities).some(c => G.dist(c, t) <= def.r + 1));
  return G.pick(near.length ? near : pool);
};

const playerTouched = (s, c) => G.citiesOf(s, 'p').some(pc => Math.hypot(pc.x - c.x, pc.y - c.y) <= c.r + 1);

G.startCalamity = (s, kind, at) => {
  const def = DATA.calamities[kind];
  const t = at || pickSpot(s, def);
  if (!t) return null;
  s.calamities = s.calamities || [];
  const c = { id: G.newId(s, 'q'), kind, x: t.x, y: t.y, r: def.r, start: s.time, end: s.time + minutes(s, def.dur), data: {} };
  s.calamities.push(c);
  G.reveal(s, t.x, t.y, Math.ceil(Math.min(def.r, 3)));
  const near = playerTouched(s, c);
  G.log(s, 'p', `${def.icon} ${def.name} near (${t.x}, ${t.y})! ${def.text}`, def.bad ? (near ? 'bad' : 'warn') : 'good');
  ON_START[kind] && ON_START[kind](s, c, t);
  return c;
};

const lairCamp = (s, t, units, loot, kind, tier) => {
  let tile = t;
  if (tile.city || tile.camp || tile.oasis || tile.ruin) tile = G.freeTile(s, x => G.dist(x, t) <= 2.5) || null;
  if (!tile) return null;
  const id = G.newId(s, 'k');
  s.camps[id] = { id, x: tile.x, y: tile.y, tier, units, loot, kind };
  tile.camp = id;
  G.reveal(s, tile.x, tile.y, 1);
  return s.camps[id];
};

const ON_START = {
  wyrm: (s, c, t) => {
    const camp = lairCamp(s, t, { wyrm: 1 }, { iron: 900, tools: 250, weapons: 300, grain: 1500, timber: 1500, stone: 1500, ore: 1500 }, 'wyrm', 7);
    if (camp) { c.data.camp = camp.id; c.x = camp.x; c.y = camp.y; }
  },
  deadrise: (s, c, t) => {
    const n = Math.round(14 + s.time / minutes(s, 30) * 4);
    const camps = [];
    for (let i = 0; i < 2; i++) {
      const spot = G.freeTile(s, x => G.dist(x, t) <= 2.5 && !x.city) || t;
      const k = lairCamp(s, spot, { restless: Math.round(n * G.rnd(0.8, 1.2)) }, { iron: 120, weapons: 80, tools: 30 }, 'undead', 4);
      if (k) camps.push(k.id);
    }
    c.data.camps = camps;
  },
  starfall: (s, c, t) => {
    const camp = lairCamp(s, t, { starbeast: G.rint(6, 14) }, { iron: 700, ore: 1200, tools: 80, stone: 500 }, 'star', 3);
    if (camp) { c.data.camp = camp.id; c.x = camp.x; c.y = camp.y; }
  },
  quake: (s, c) => {
    for (const city of Object.values(s.cities)) {
      if (Math.hypot(city.x - c.x, city.y - c.y) > c.r) continue;
      const blds = Object.keys(city.buildings).filter(b => b !== 'townhall' && city.buildings[b] > 1 && !city.buildQueue.some(q => q.type === b));
      const hit = [];
      for (let i = 0; i < 2 && blds.length; i++) { const b = blds.splice(G.rint(0, blds.length - 1), 1)[0]; city.buildings[b]--; hit.push(DATA.buildings[b].name); }
      if (hit.length) G.log(s, city.owner, `🌋 The quake damaged ${hit.join(' and ')} in ${city.name}.`, 'bad');
    }
  },
  swarm: (s, c) => {
    for (const city of Object.values(s.cities)) {
      if (Math.hypot(city.x - c.x, city.y - c.y) > c.r) continue;
      const lost = Math.floor((city.res.grain || 0) * 0.35);
      city.res.grain -= lost;
      if (lost) G.log(s, city.owner, `🦗 The swarm devoured ${lost} grain in ${city.name}.`, 'bad');
    }
  },
};

// periodic effects while active
const TICK = {
  blight: (s, c, dtMin) => { const def = DATA.calamities.blight; c.r = Math.min(def.r + def.grow, c.r + dtMin * def.grow / def.dur * 1.5); },
  wyrm: (s, c) => {
    const camp = s.camps[c.data.camp];
    if (!camp || !(camp.units.wyrm > 0)) { endCalamity(s, c, 'slain'); return; }
    c.data.next = c.data.next ?? s.time + minutes(s, 8);
    if (s.time < c.data.next) return;
    c.data.next = s.time + minutes(s, G.rnd(10, 16));
    const targets = Object.values(s.cities).filter(city => Math.hypot(city.x - c.x, city.y - c.y) <= c.r);
    if (!targets.length) return;
    const city = G.pick(targets);
    const r = G.battle(s, null, { wyrm: 1 }, 1, city.owner, city.units, G.cityDefense(s, city).mult, G.cityDefense(s, city).flat, 'raid');
    city.units = r.defLeft;
    const burnt = {};
    for (const g of ['grain', 'timber']) { const v = Math.floor((city.res[g] || 0) * (r.win ? 0.3 : 0.1)); city.res[g] -= v; if (v) burnt[g] = v; }
    G.report(s, [city.owner], `The wyrm fell upon ${city.name}`, city.owner === 'p' ? (r.win ? 'loss' : 'win') : 'info',
      { att: 'Elder Wyrm', def: s.empires[city.owner].name, A: r.A, D: r.D, attSent: { wyrm: 1 }, attLost: {}, defHad: G.addUnits({ ...r.defLeft }, r.defLost), defLost: r.defLost, loot: {}, extra: `Fire took ${Object.entries(burnt).map(([g, v]) => v + ' ' + DATA.goods[g].name.toLowerCase()).join(' and ') || 'little'}.` });
    G.log(s, city.owner, `🐉 The wyrm burned ${city.name}!`, 'bad');
  },
  deadrise: (s, c) => {
    const alive = (c.data.camps || []).map(id => s.camps[id]).filter(k => k && k.units.restless > 0);
    if (!alive.length) { endCalamity(s, c, 'destroyed'); return; }
    c.data.next = c.data.next ?? s.time + minutes(s, 10);
    if (s.time < c.data.next) return;
    c.data.next = s.time + minutes(s, G.rnd(12, 20));
    const horde = G.pick(alive);
    const targets = Object.values(s.cities).filter(city => G.dist(city, horde) <= c.r + 2).sort((a, b) => G.dist(a, horde) - G.dist(b, horde));
    if (!targets.length) return;
    const city = targets[0];
    const n = Math.max(1, Math.floor(horde.units.restless * 0.5));
    const cd = G.cityDefense(s, city);
    const r = G.battle(s, null, { restless: n }, 1, city.owner, city.units, cd.mult, cd.flat, 'attack');
    city.units = r.defLeft;
    horde.units.restless -= r.attLost.restless;
    if (r.win) city.pop = Math.max(3, city.pop * 0.9);
    G.report(s, [city.owner], `The restless dead assaulted ${city.name}`, city.owner === 'p' ? (r.win ? 'loss' : 'win') : 'info',
      { att: 'The Restless Dead', def: s.empires[city.owner].name, A: r.A, D: r.D, attSent: { restless: n }, attLost: r.attLost, defHad: G.addUnits({ ...r.defLeft }, r.defLost), defLost: r.defLost, loot: {}, extra: r.win ? 'The dead broke through and carried off some of the townsfolk.' : 'The walls held against the dead.' });
  },
  starfall: (s, c) => { if (!s.camps[c.data.camp]) endCalamity(s, c, 'claimed'); },
};

const endCalamity = (s, c, how) => {
  if (c.ended) return;
  c.ended = true;
  c.end = Math.min(c.end, s.time);
  const def = DATA.calamities[c.kind];
  const camps = [c.data.camp, ...(c.data.camps || [])].filter(Boolean);
  // monsters that outlive the calamity melt away (the wyrm flies off, the dead crumble)
  for (const id of camps) { const k = s.camps[id]; if (k) { G.tileAt(s, k.x, k.y).camp = null; delete s.camps[id]; } }
  const msg = { slain: `The wyrm near (${c.x}, ${c.y}) has been slain!`, destroyed: `The restless dead near (${c.x}, ${c.y}) are laid to rest.`, claimed: 'The fallen star has been claimed.' }[how]
    || (c.kind === 'wyrm' ? 'The wyrm has flown away to distant peaks.' : `${def.name} has passed.`);
  G.log(s, 'p', `${def.icon} ${msg}`, 'info');
  if (def.then) G.startCalamity(s, def.then, G.tileAt(s, c.x, c.y));
};

// rewards for slaying monsters
G.battleHooks.push((s, ctx) => {
  const { m, r, tile } = ctx;
  if (!tile || !tile.camp && !(ctx.defHad && (ctx.defHad.wyrm || ctx.defHad.restless))) return;
  const had = ctx.defHad || {};
  const me = s.empires[m.owner];
  if (had.wyrm && r.win) {
    me.renownBonus = (me.renownBonus || 0) + 60;
    G.log(s, m.owner, `🐉 ${me.name} slew the Elder Wyrm! (+60 renown)`, 'good');
    if (m.owner === 'p' && m.units.hero && G.hero(s) && !G.hero(s).dead) {
      const it = G.newHeroItem(6); it.rarity = 2; G.hero(s).items.push(it);
      G.log(s, 'p', `The hero claims ${it.name} from the dragon's hoard.`, 'good');
    }
  }
  if (had.restless && r.win) me.renownBonus = (me.renownBonus || 0) + 10;
});

G.slowHooks.push((s, dtMin) => {
  if (s.gameOver) return;
  s.calamities = (s.calamities || []).filter(c => c.end > s.time - 600);  // keep recently ended briefly for the map
  for (const c of s.calamities) {
    if (c.end <= s.time) { if (!c.ended) endCalamity(s, c, 'time'); continue; }
    TICK[c.kind] && TICK[c.kind](s, c, dtMin);
  }
  s.calamityAt = s.calamityAt ?? s.time + minutes(s, 60);
  if (s.time >= s.calamityAt) {
    s.calamityAt = s.time + minutes(s, G.rnd(50, 90));
    if (s.calamities.filter(c => c.end > s.time).length >= 2) return;
    const pool = Object.entries(DATA.calamityWeights);
    let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
    for (const [kind, w] of pool) { r -= w; if (r <= 0) { G.startCalamity(s, kind); break; } }
  }
});
