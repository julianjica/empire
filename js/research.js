// =====================================================================
//  Research — an empire-wide tech tree studied at the Academy
// =====================================================================
'use strict';

// ac: Academy level needed · req: prerequisite tech · fx: modifier multipliers
DATA.techs = {
  // ---- economy ----
  croprotation: { name: 'Crop Rotation',   icon: '🌾', cat: 'Economy',  ac: 1,  fx: { grain: 1.15 }, desc: '+15% grain.' },
  sawpits:      { name: 'Saw Pits',        icon: '🪚', cat: 'Economy',  ac: 1,  fx: { timber: 1.15 }, desc: '+15% timber.' },
  stonecutting: { name: 'Stonecutting',    icon: '🪨', cat: 'Economy',  ac: 1,  fx: { stone: 1.15 }, desc: '+15% stone.' },
  cartography:  { name: 'Cartography',     icon: '🧭', cat: 'Economy',  ac: 2,  fx: { vision: 1.35 }, desc: 'Your cities see 35% farther.' },
  deepshafts:   { name: 'Deep Shafts',     icon: '⛏️', cat: 'Economy',  ac: 2,  fx: { ore: 1.15 }, desc: '+15% ore.' },
  granaries:    { name: 'Granaries',       icon: '📦', cat: 'Economy',  ac: 2,  fx: { storage: 1.25 }, desc: '+25% storage in every city.' },
  taxation:     { name: 'Taxation',        icon: '🪙', cat: 'Economy',  ac: 2,  fx: { tax: 1.15 }, desc: '+15% gold from taxes.' },
  bellows:      { name: 'Bellows',         icon: '🔥', cat: 'Economy',  ac: 3,  req: 'deepshafts', fx: { refine: 1.2 }, desc: '+20% workshop output.' },
  masonry:      { name: 'Masonry',         icon: '🧱', cat: 'Economy',  ac: 3,  req: 'stonecutting', fx: { buildTime: 0.88 }, desc: 'Construction 12% faster.' },
  cellars:      { name: 'Hidden Cellars',  icon: '🕳️', cat: 'Economy',  ac: 3,  fx: { protect: 1.1 }, desc: '10% more of your stock is hidden from raiders.' },
  medicine:     { name: 'Medicine',        icon: '⚕️', cat: 'Economy',  ac: 4,  fx: { popGrowth: 1.3, housing: 1.05 }, desc: 'Population grows 30% faster; +5% housing.' },
  caravanserai: { name: 'Caravanserai',    icon: '🐪', cat: 'Economy',  ac: 4,  req: 'taxation', fx: { caravan: 2 }, desc: 'Caravans carry twice as much.' },
  irrigation:   { name: 'Irrigation',      icon: '💧', cat: 'Economy',  ac: 6,  req: 'croprotation', fx: { grain: 1.2 }, desc: 'A further +20% grain.' },
  metallurgy:   { name: 'Metallurgy',      icon: '⚗️', cat: 'Economy',  ac: 7,  req: 'bellows', fx: { refine: 1.25 }, desc: 'A further +25% workshop output.' },
  guilds:       { name: 'Merchant Guilds', icon: '⚖️', cat: 'Economy',  ac: 8,  req: 'caravanserai', fx: { tax: 1.2, market: 1.08 }, desc: '+20% taxes and better market rates.' },
  architecture: { name: 'Architecture',    icon: '🏛️', cat: 'Economy',  ac: 10, req: 'masonry', fx: { buildTime: 0.85, storage: 1.25 }, desc: 'Construction 15% faster, +25% storage.' },
  // ---- military ----
  drill:        { name: 'Drill',           icon: '🥁', cat: 'Military', ac: 2,  fx: { trainTime: 0.9 }, desc: 'Troops train 10% faster.' },
  packmules:    { name: 'Pack Mules',      icon: '🫏', cat: 'Military', ac: 3,  fx: { carry: 1.25 }, desc: 'Troops carry 25% more plunder.' },
  forgedblades: { name: 'Forged Blades',   icon: '🗡️', cat: 'Military', ac: 3,  fx: { atk: 1.08 }, desc: '+8% attack.' },
  mail:         { name: 'Chain Mail',      icon: '🥋', cat: 'Military', ac: 3,  fx: { def: 1.08 }, desc: '+8% defense.' },
  logistics:    { name: 'Logistics',       icon: '🗺️', cat: 'Military', ac: 4,  fx: { travel: 1.15 }, desc: 'Armies and caravans march 15% faster.' },
  rations:      { name: 'Field Rations',   icon: '🥖', cat: 'Military', ac: 5,  fx: { upkeep: 0.85 }, desc: 'Troops eat 15% less.' },
  fortification:{ name: 'Fortification',   icon: '🏰', cat: 'Military', ac: 5,  req: 'mail', fx: { wall: 1.4 }, desc: 'Walls give 40% more defense.' },
  herolore:     { name: 'Heroic Lore',     icon: '📖', cat: 'Military', ac: 5,  fx: { heroXp: 1.3 }, desc: 'Your hero gains 30% more experience.' },
  tempered:     { name: 'Tempered Steel',  icon: '⚔️', cat: 'Military', ac: 7,  req: 'forgedblades', fx: { atk: 1.1 }, desc: 'A further +10% attack.' },
  plate:        { name: 'Plate Armor',     icon: '🛡️', cat: 'Military', ac: 7,  req: 'mail', fx: { def: 1.1 }, desc: 'A further +10% defense.' },
  warcraft:     { name: 'Art of War',      icon: '🎖️', cat: 'Military', ac: 10, req: 'tempered', fx: { atk: 1.1, def: 1.1, trainTime: 0.9 }, desc: '+10% attack and defense, 10% faster training.' },
};

G.techCost = id => {
  const t = DATA.techs[id];
  const m = Math.pow(1.45, t.ac - 1);
  const c = { timber: Math.round(260 * m), stone: Math.round(200 * m), grain: Math.round(150 * m), gold: Math.round(120 * m) };
  if (t.cat === 'Military') c.iron = Math.round(30 * m);
  if (t.ac >= 4) c.tools = 4 * t.ac;
  return c;
};
G.techTime = (s, owner, id, city) => {
  const t = DATA.techs[id];
  const ac = G.lvl(city, 'academy');
  const base = 100 * Math.pow(1.4, t.ac - 1) / (1 + 0.06 * Math.max(0, ac - t.ac));
  return Math.round(base * G.pace(s).time * G.mod(s, owner, city, 'researchTime'));
};
G.research = (s, owner) => {
  const e = s.empires[owner];
  e.research = e.research || { done: {}, active: null };
  return e.research;
};
G.hasTech = (s, owner, id) => !!G.research(s, owner).done[id];

G.techStatus = (s, cityId, id) => {
  const city = s.cities[cityId];
  const t = DATA.techs[id];
  const R = G.research(s, city.owner);
  const cost = G.techCost(id);
  const time = G.techTime(s, city.owner, id, city);
  if (R.done[id]) return { done: true, cost, time };
  if (R.active && R.active.id === id) return { active: true, cost, time };
  if (t.req && !R.done[t.req]) return { ok: false, locked: true, reason: `Needs ${DATA.techs[t.req].name}`, cost, time };
  if (G.lvl(city, 'academy') < t.ac) return { ok: false, locked: true, reason: `Needs Academy ${t.ac} here`, cost, time };
  if (R.active) return { ok: false, reason: 'Scholars are busy', cost, time };
  if (!G.canAfford(s, city, cost)) return { ok: false, poor: true, reason: 'Not enough goods', cost, time };
  return { ok: true, cost, time };
};

G.startResearch = (s, cityId, id) => {
  const city = s.cities[cityId];
  const st = G.techStatus(s, cityId, id);
  if (!st.ok) return st.reason || 'Cannot research';
  G.pay(s, city, st.cost);
  G.research(s, city.owner).active = { id, city: cityId, start: s.time, end: s.time + st.time, cost: st.cost };
  return null;
};

G.cancelResearch = (s, owner) => {
  const R = G.research(s, owner);
  if (!R.active) return;
  const city = s.cities[R.active.city];
  if (city && city.owner === owner) G.gain(s, city, R.active.cost, 0.5);
  R.active = null;
};

// every completed tech multiplies its modifiers
G.modSources.push((s, owner, city, key) => {
  const R = s.empires[owner].research;
  if (!R) return 1;
  let m = 1;
  for (const id in R.done) { const f = DATA.techs[id].fx[key]; if (f) m *= f; }
  return m;
});

G.stepHooks.push(s => {
  for (const e of Object.values(s.empires)) {
    const R = e.research;
    if (R && R.active && R.active.end <= s.time) {
      const t = DATA.techs[R.active.id];
      R.done[R.active.id] = true;
      R.active = null;
      G.log(s, e.id, `📚 Research complete: ${t.name}. ${t.desc}`, 'good');
    }
  }
});

// AI studies something affordable now and then
G.aiHooks.push((s, emp) => {
  const R = G.research(s, emp.id);
  if (R.active || Math.random() > 0.25) return;
  const city = G.citiesOf(s, emp.id).filter(c => G.lvl(c, 'academy') > 0).sort((a, b) => G.lvl(b, 'academy') - G.lvl(a, 'academy'))[0];
  if (!city || emp.saving) return;
  const opts = Object.keys(DATA.techs).filter(id => G.techStatus(s, city.id, id).ok);
  if (opts.length) G.startResearch(s, city.id, G.pick(opts));
});
