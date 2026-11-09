// =====================================================================
//  Happiness, culture and traditions
//  city.happy (0-100) + city.happyWhy [{label,value}], city.taxPolicy
//  ('low'|'normal'|'high'), city.placated (until), city.lastHit {t,lost};
//  empire.culture (spendable), empire.cultureTotal (lifetime),
//  empire.traditions [ids].
// =====================================================================
'use strict';

(() => {
  const paceMin = (s, m) => m * 60 * G.pace(s).time;

  // -------------------------------------------------------------------
  // Buildings
  // -------------------------------------------------------------------
  Object.assign(DATA.buildings, {
    tavern: {
      name: 'Tavern', icon: '🍺', max: 10, time: 16, growth: 1.4,
      cost: { timber: 90, stone: 50, grain: 90 },
      desc: 'Ale, songs and gossip. +3 happiness per level.', req: { townhall: 2 },
    },
    temple: {
      name: 'Temple', icon: '⛩️', max: 10, time: 26, growth: 1.42,
      cost: { stone: 150, timber: 70, gold: 40 },
      desc: 'A house of the old gods. +2 happiness and +2 culture per minute per level.', req: { townhall: 4 },
    },
    theatre: {
      name: 'Theatre', icon: '🎭', max: 10, time: 34, growth: 1.42,
      cost: { timber: 200, stone: 200, tools: 8, gold: 80 },
      desc: 'Plays, poets and spectacle. +1.5 happiness and +3 culture per minute per level.', req: { townhall: 6, temple: 2 },
    },
  });
  for (const b of ['tavern', 'temple', 'theatre']) if (!DATA.buildingOrder.includes(b)) DATA.buildingOrder.push(b);
  if (!DATA.buildingGroups.some(g => g.name === 'Culture')) {
    const i = DATA.buildingGroups.findIndex(g => g.name === 'Settlement');
    DATA.buildingGroups.splice(i + 1, 0, { name: 'Culture', list: ['tavern', 'temple', 'theatre'] });
  }

  // -------------------------------------------------------------------
  // Tuning
  // -------------------------------------------------------------------
  const C = G.CULTURE = {
    base: 55,
    tavern: 3, temple: 2, theatre: 1.5, amenityCap: 35,
    bread: 8, hero: 5, festival: 10, placate: 25,
    crowdMax: 8,              // at 100% of civilian housing
    wearyFree: 0.12, wearyK: 50, wearyMax: 25,
    sizeFree: 3, sizePer: 4, sizeCulture: 2500, sizeSoftMax: 3,
    starving: 15, calamity: 8, calamityMax: 16,
    raidedLost: 12, raidedHeld: 4, raidedMins: 10,
    tax: { low: { tax: 0.7, happy: 10 }, normal: { tax: 1, happy: 0 }, high: { tax: 1.35, happy: -15 } },
    jubilant: 75, discontent: 40, unrest: 20,
    cultureBase: 1, cultureHall: 0.2,   // culture per minute from every city, and per Town Hall level
  };
  G.TAX_POLICIES = ['low', 'normal', 'high'];

  // -------------------------------------------------------------------
  // Traditions live in traditions.js (the cultural web). Until it loads —
  // or if it is left out — they are inert, so this file stands alone.
  //   tFx(emp, prop, 'mul'|'add'): the named effects the formulas below read
  // -------------------------------------------------------------------
  DATA.traditions = DATA.traditions || {};
  DATA.traditionOrder = DATA.traditionOrder || Object.keys(DATA.traditions);
  const tFx = (emp, prop, combine = 'mul') => G.traditionFx ? G.traditionFx(emp, prop, combine) : (combine === 'mul' ? 1 : 0);
  G.traditionsFor = G.traditionsFor || (() => []);
  G.traditionStatus = G.traditionStatus || (() => ({ ok: false, reason: 'Traditions are not available' }));
  G.traditionCost = G.traditionCost || (() => 0);
  G.adoptTradition = G.adoptTradition || (() => 'Traditions are not available');

  // -------------------------------------------------------------------
  // Happiness
  // -------------------------------------------------------------------
  // bigger worlds allow more cities, so more of them come without unrest (3 on a 9-city world, 5 on 12, 6 on 14)
  G.sizeFreeOf = s => C.sizeFree + Math.max(0, Math.floor(((G.cityLimit ? G.cityLimit(s) : 9) - 9) / 1.5));
  const sizeSoften = emp => Math.min(C.sizeSoftMax, Math.floor((emp.cultureTotal || 0) / C.sizeCulture));
  G.sizePenaltyPer = (s, owner) => {
    const emp = s.empires[owner];
    return Math.max(0.5, C.sizePer - sizeSoften(emp) - tFx(emp, 'size', 'add'));
  };
  G.happiness = (s, city) => {
    const emp = s.empires[city.owner];
    const why = [];
    const add = (label, v) => { if (Math.abs(v) >= 0.5) why.push({ label, value: Math.round(v) }); };
    add('Base contentment', C.base);
    // amenities
    const amen = (G.lvl(city, 'tavern') * C.tavern + G.lvl(city, 'temple') * C.temple + G.lvl(city, 'theatre') * C.theatre) * tFx(emp, 'amenity');
    add('Taverns, temples & theatres', Math.min(C.amenityCap, amen));
    if (emp.race === 'hearth' && (city.res.bread || 0) > 1) add('Fresh bread', C.bread + tFx(emp, 'bread', 'add'));
    if ((city.units.hero || 0) > 0) add('Hero in residence', C.hero + tFx(emp, 'heroHappy', 'add'));
    if ((city.mods || []).some(m => m.label === 'Festival' && m.until > s.time)) add('Festival', C.festival * tFx(emp, 'festival'));
    if ((city.placated || 0) > s.time) add('Bread and circuses', C.placate);
    const th = tFx(emp, 'happy', 'add') + (G.traditionSeasonHappy ? G.traditionSeasonHappy(s, emp) : 0);
    if (th) add('Traditions', th);
    if (G.ceremonyHappy) { const ch = G.ceremonyHappy(s, city); if (ch.value) add(ch.label || 'Ceremonies', ch.value); }
    // pressures
    const e = G.econ(s, city);
    const ratio = city.pop / Math.max(1, e.civCap);
    if (ratio > 0.95) add('Crowding', -Math.min(C.crowdMax * 1.5, C.crowdMax * (ratio - 0.95) / 0.05) * tFx(emp, 'crowd'));
    const share = e.soldiers / Math.max(1, city.pop + e.soldiers);
    if (share > C.wearyFree) add('War weariness', -Math.min(C.wearyMax, (share - C.wearyFree) * C.wearyK) * tFx(emp, 'weary'));
    const n = G.citiesOf(s, city.owner).length;
    const free = G.sizeFreeOf(s);
    if (n > free) add(`Empire size (${n} cities)`, -(n - free) * G.sizePenaltyPer(s, city.owner));
    if (city.starving) add('Famine', -C.starving * tFx(emp, 'famine'));
    if (G.calamitiesAt) {
      const bad = G.calamitiesAt(s, city.x, city.y).filter(c => DATA.calamities[c.kind] && DATA.calamities[c.kind].bad).length;
      if (bad) add('Calamity', -Math.min(C.calamityMax, bad * C.calamity) * tFx(emp, 'calamity'));
    }
    const hit = city.lastHit;
    if (hit && s.time - hit.t < paceMin(s, C.raidedMins)) add(hit.lost ? 'Recently sacked' : 'Recently attacked', -(hit.lost ? C.raidedLost : C.raidedHeld) * tFx(emp, 'raided'));
    const pol = C.tax[city.taxPolicy || 'normal'] || C.tax.normal;
    if (pol.happy) add(pol.happy > 0 ? 'Low taxes' : 'High taxes', pol.happy);
    const raw = why.reduce((a, w) => a + w.value, 0);
    return { value: G.clamp(Math.round(raw), 0, 100), why, raw };
  };
  G.updateHappiness = (s, city) => {
    const h = G.happiness(s, city);
    city.happy = h.value; city.happyWhy = h.why;
    return h;
  };
  G.happyOf = city => city.happy === undefined ? C.base : city.happy;
  G.mood = v => v >= C.jubilant ? { key: 'jubilant', name: 'Jubilant', face: '😄' }
    : v >= 55 ? { key: 'content', name: 'Content', face: '🙂' }
    : v >= C.discontent ? { key: 'restless', name: 'Restless', face: '😐' }
    : v >= C.unrest ? { key: 'discontent', name: 'Discontent', face: '😠' }
    : { key: 'unrest', name: 'Unrest', face: '🔥' };
  G.moodEffects = v => v >= C.jubilant ? '+10% goods and refining, +15% growth'
    : v >= C.discontent ? 'No effect'
    : v >= C.unrest ? '−10% goods and refining, −20% growth'
    : '−25% goods and refining, −20% growth, −50% taxes, loyalty falling';

  // happiness and tax policy as modifiers (traditions add their own source in traditions.js)
  G.modSources.push((s, owner, city, key) => {
    let m = 1;
    if (!city) return m;
    if (key === 'tax' && city.taxPolicy && city.taxPolicy !== 'normal') m *= (C.tax[city.taxPolicy] || C.tax.normal).tax;
    const h = city.happy;
    if (h === undefined) return m;
    const prodKey = key === 'refine' || (DATA.goods[key] && DATA.goods[key].raw);
    if (h >= C.jubilant) { if (prodKey) m *= 1.1; else if (key === 'popGrowth') m *= 1.15; }
    else if (h < C.unrest) { if (prodKey) m *= 0.75; else if (key === 'popGrowth') m *= 0.8; else if (key === 'tax') m *= 0.5; }
    else if (h < C.discontent) { if (prodKey) m *= 0.9; else if (key === 'popGrowth') m *= 0.8; }
    return m;
  });

  G.setTaxPolicy = (s, cityId, policy) => {
    const city = s.cities[cityId];
    if (!city) return 'No such city';
    if (!C.tax[policy]) return 'Unknown tax policy';
    city.taxPolicy = policy;
    G.updateHappiness(s, city);
    return null;
  };

  // -------------------------------------------------------------------
  // Culture
  // -------------------------------------------------------------------
  G.cultureRate = (s, city) => {
    const emp = s.empires[city.owner];
    let r = C.cultureBase + 0.1 * G.happyOf(city) / 10
      + 2 * G.lvl(city, 'temple') * tFx(emp, 'temple')
      + 3 * G.lvl(city, 'theatre')
      + C.cultureHall * G.lvl(city, 'townhall') + 0.25 * G.lvl(city, 'academy');
    if (G.happyOf(city) >= C.jubilant) r *= 1.25;
    return r * tFx(emp, 'culture') * G.pace(s).prod;
  };
  G.realmCultureRate = (s, owner) => G.citiesOf(s, owner).reduce((a, c) => a + G.cultureRate(s, c), 0);

  // -------------------------------------------------------------------
  // Placating and revolts
  // -------------------------------------------------------------------
  G.placateCost = (s, city) => Math.round((80 + city.pop * 1.5) * (s.time / (3600 * G.pace(s).time) * 0.15 + 1) * tFx(s.empires[city.owner], 'placate') / 10) * 10;
  // keepPending: called from the decision itself (resolvePending removes it by index afterwards)
  G.placate = (s, cityId, keepPending) => {
    const city = s.cities[cityId];
    if (!city) return 'That city is no longer ours';
    const emp = s.empires[city.owner];
    const cost = G.placateCost(s, city);
    if (emp.gold < cost) return 'Not enough gold';
    emp.gold -= cost;
    city.placated = s.time + paceMin(s, 20);
    if (!keepPending) s.pending = (s.pending || []).filter(p => !(p.kind === 'unrest' && p.data.city === city.id));
    city.loyalty = Math.min(100, (city.loyalty ?? 100) + 10);
    G.updateHappiness(s, city);
    G.log(s, city.owner, `🎪 Games, gifts and free ale calm the people of ${city.name}.`, 'good');
    return null;
  };

  G.revoltCity = (s, city) => {
    const owner = city.owner;
    if (G.citiesOf(s, owner).length <= 1) return null;
    const tile = G.tileAt(s, city.x, city.y);
    // the hero escapes to the capital
    if ((city.units.hero || 0) > 0) {
      const cap = G.citiesOf(s, owner).filter(c => c !== city).sort((a, b) => (a.founded || 0) - (b.founded || 0))[0];
      cap.units.hero = 1;
    }
    for (const i of city.oases || []) { const o = s.tiles[i].oasis; if (o && o.owner === city.id) o.owner = null; }
    s.pending = (s.pending || []).filter(p => !(p.data && p.data.city === city.id));
    const soldiers = G.unitsCount(city.units) - (city.units.hero || 0);
    const tier = G.clamp(Math.round(3 + G.lvl(city, 'townhall') / 3), 4, 8);
    const loot = {};
    for (const g of ['grain', 'timber', 'stone', 'ore', 'iron', 'weapons', 'tools']) loot[g] = Math.floor((city.res[g] || 0) * 0.7) + (DATA.goods[g].raw ? tier * 200 : 0);
    const id = G.newId(s, 'k');
    const camp = { id, x: city.x, y: city.y, tier, units: { brigand: tier * tier * 6 + 4 + Math.round(soldiers * 0.7) }, loot, rebels: city.name };
    tile.city = null;
    delete s.cities[city.id];
    s.camps[id] = camp;
    tile.camp = id;
    s.revolts = (s.revolts || 0) + 1;
    s.empires[owner].revolts = (s.empires[owner].revolts || 0) + 1;
    if (owner === 'p') G.log(s, 'p', `🔥 ${city.name} has risen in revolt! The rebels tore down our banners and hold the town as outlaws.`, 'bad');
    else G.log(s, 'p', `🔥 ${city.name} of the ${s.empires[owner].name} has risen in revolt and fallen to outlaws.`, 'warn');
    return camp;
  };

  const warnUnrest = (s, city) => {
    if ((s.pending || []).some(p => p.kind === 'unrest' && p.data.city === city.id)) return;
    if (s.time - (city.unrestWarned || -1e9) < paceMin(s, 12)) return;
    city.unrestWarned = s.time;
    const gold = G.placateCost(s, city);
    const top = (city.happyWhy || []).filter(w => w.value < 0).sort((a, b) => a.value - b.value)[0];
    G.log(s, 'p', `🔥 Unrest in ${city.name}! Loyalty is falling (${Math.round(city.loyalty)}%). If it reaches zero, the city will revolt.`, 'bad');
    G.addPending(s, {
      kind: 'unrest', title: `Unrest in ${city.name}`,
      text: `The people are angry${top ? ` (worst: ${top.label.toLowerCase()} ${top.value})` : ''}. Loyalty is ${Math.round(city.loyalty)}% and falling about 1 per minute; at zero the city revolts. Pay ${gold} gold for games and gifts (+${C.placate} happiness for 20 minutes), or try to fix the causes yourself.`,
      options: [{ key: 'placate', label: `Placate them (${gold} gold)` }, { key: 'ignore', label: 'Let them grumble' }],
      expires: s.time + paceMin(s, 6), def: 'ignore', data: { city: city.id, gold },
    });
  };
  G.pendingHandlers = G.pendingHandlers || {};
  G.pendingHandlers.unrest = (s, p, key) => {
    const city = s.cities[p.data.city];
    if (key !== 'placate' || !city || city.owner !== 'p') return null;
    return G.placate(s, city.id, true);
  };

  // -------------------------------------------------------------------
  // Battles: remember attacks on cities
  // -------------------------------------------------------------------
  G.battleHooks.push((s, ctx) => {
    if (ctx.site !== 'city' || !ctx.city) return;
    ctx.city.lastHit = { t: s.time, lost: !!(ctx.r && ctx.r.win) };
  });

  // -------------------------------------------------------------------
  // Slow tick: happiness, culture, unrest
  // -------------------------------------------------------------------
  G.slowHooks.push((s, dtMin) => {
    if (s.gameOver) return;
    const revolts = [];
    for (const emp of Object.values(s.empires)) {
      if (emp.dead) continue;
      const cities = G.citiesOf(s, emp.id);
      if (!cities.length) continue;
      let gain = 0;
      for (const city of cities) {
        G.updateHappiness(s, city);
        gain += G.cultureRate(s, city) * dtMin;
        if (city.happy < C.unrest) {
          // net loss about 1 loyalty per minute after the usual recovery
          const regen = 0.4 * (1 + 0.25 * Math.max(0, (s.maxCities || 1) - cities.length));
          city.loyalty = (city.loyalty ?? 100) - (1 * tFx(emp, 'loyalty') + regen) * dtMin;
          if (emp.id === 'p') warnUnrest(s, city);
          if (city.loyalty <= 0) {
            if (cities.length > 1) revolts.push(city); else city.loyalty = 1;
          }
        }
      }
      emp.culture = (emp.culture || 0) + gain;
      emp.cultureTotal = (emp.cultureTotal || 0) + gain;
    }
    for (const c of revolts) if (s.cities[c.id]) G.revoltCity(s, c);
  });

  // -------------------------------------------------------------------
  // AI
  // -------------------------------------------------------------------
  const AI_PREF = ['tavern', 'temple', 'theatre'];
  // The generic AI build picker weighs unknown buildings like any other, so it
  // would pour gold into amenities nobody needs. Hide them from it while the
  // city is content (a couple of temple levels stay open for culture); the
  // hook below builds them on purpose when happiness sags.
  G.aiBuildFilters.push((s, city, type) => !(AI_PREF.includes(type) && G.happyOf(city) >= 62 && !(type === 'temple' && G.lvl(city, 'temple') < 3)));
  const aiQueue = (s, city, type) => G.queueBuild(s, city.id, type);
  G.aiHooks.push((s, emp, dtMin) => {
    const cities = G.citiesOf(s, emp.id);
    for (const city of cities) {
      const h = G.happyOf(city);
      const pol = city.taxPolicy || 'normal';
      const base = h - ((C.tax[pol] || C.tax.normal).happy);   // happiness without the tax term
      // taxes: squeeze the happy, ease off the unhappy (with hysteresis)
      let want = pol;
      if (base >= 74) want = 'high';
      else if (base < 48) want = 'low';
      else if (pol === 'high' && base < 66) want = 'normal';
      else if (pol === 'low' && base >= 56) want = 'normal';
      if (want !== pol) G.setTaxPolicy(s, city.id, want);
      // amenities when unhappy
      if (G.happyOf(city) < 55 && city.buildQueue.length < G.buildSlots(city) && !city.buildQueue.some(q => AI_PREF.includes(q.type))) {
        const t = AI_PREF.find(b => G.buildStatus(s, city, b).ok);
        if (t) aiQueue(s, city, t);
      }
      // buy calm before it is too late
      if (city.happy < C.unrest && (city.loyalty ?? 100) < 50 && !((city.placated || 0) > s.time) && emp.gold >= G.placateCost(s, city)) G.placate(s, city.id);
    }
  });

  G.newGameHooks.push(s => {
    for (const e of Object.values(s.empires)) { e.culture = 0; e.cultureTotal = 0; e.traditions = []; }
    for (const c of Object.values(s.cities)) G.updateHappiness(s, c);
  });
})();
