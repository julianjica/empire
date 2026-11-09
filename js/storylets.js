// =====================================================================
//  Storylets — short narrative event chains with meaningful choices.
//
//  A storylet (DATA.storylets) has trigger predicates (`when`), a weight,
//  a cooldown and named stages. Each stage shows text and 2-4 choices;
//  a choice may cost goods, gold, faith or mana, may need something
//  (a hero, a temple...), may be risky (a shown chance of success), and
//  its outcome is a list of effect descriptors applied through the small
//  effect table G.story.fx. Outcomes can unlock a later stage after a
//  delay, and every answer is remembered as a flag that later tales read.
//
//  The player's tales arrive as decision cards through the pending system
//  (kind 'storylet'); the default choice happens when one expires. AI
//  realms meet the same tales and answer them silently (aiHooks).
//
//  State (lazy, plain JSON): s.story = { next, flags{owner:{}}, log[],
//    last{owner:{id:t}}, seen{owner:{id:n}}, recent{owner:[ids]},
//    queue[{owner,id,stage,ctx,due}], ai{empId:{next}} }
//  If world events are switched off (s.eventAt pushed past 1e11, as the
//  test harnesses do) tales stay dormant too, unless s.story.on is set.
// =====================================================================
'use strict';

(() => {
  const CFG = G.STORY_CFG = {
    firstMin: 15,          // no tale in the first 15 game-minutes (× pace)
    firstExtra: [5, 12],   // ...and the first one a little after that
    gap: [20, 35],         // minutes between tales (× pace)
    aiGap: [22, 38],
    expire: 10,            // minutes to answer before the default happens
    cool: 150,             // default cooldown before the same tale can return
    recent: 6,             // never repeat one of the last N tales
    logMax: 60,
  };
  const paceT = s => G.pace(s).time;
  const MIN = s => 60 * paceT(s);
  const safe = (f, dflt) => (...a) => { try { return f(...a); } catch (e) { if (typeof console !== 'undefined') console.error('[storylets]', e); return dflt; } };

  DATA.storylets = DATA.storylets || [];
  const byId = id => DATA.storylets.find(d => d.id === id);

  // -------------------------------------------------------------------
  // state
  // -------------------------------------------------------------------
  const story = s => {
    if (!s) return null;
    const T = s.story = (s.story && typeof s.story === 'object') ? s.story : {};
    T.v = 1;
    if (typeof T.next !== 'number') T.next = Math.max(s.time, CFG.firstMin * MIN(s)) + G.rnd(CFG.firstExtra[0], CFG.firstExtra[1]) * MIN(s);
    for (const k of ['flags', 'last', 'seen', 'recent', 'ai']) if (!T[k] || typeof T[k] !== 'object') T[k] = {};
    if (!Array.isArray(T.log)) T.log = [];
    if (!Array.isArray(T.queue)) T.queue = [];
    return T;
  };
  const per = (T, k, owner, dflt) => (T[k][owner] = T[k][owner] || dflt);
  const flagsOf = (s, owner) => per(story(s), 'flags', owner, {});
  const dormant = s => !(s.story && s.story.on) && (s.eventAt || 0) > 1e11;
  const scaleOf = s => Math.round(Math.min(8, 1 + s.time / (3600 * paceT(s))) * 100) / 100;

  // -------------------------------------------------------------------
  // trigger predicates: (s, ctx) -> bool; some bind ctx fields (city, ai, minor, cal)
  // -------------------------------------------------------------------
  const citiesOf = (s, ctx) => G.citiesOf(s, ctx.owner);
  const rivals = (s, owner) => Object.values(s.empires).filter(e => e.id !== owner && !e.dead && G.citiesOf(s, e.id).length);
  // opinion between owner and another realm (player <-> AI uses G.rel; AI <-> AI uses status)
  const opinion = (s, a, b) => {
    if (a === 'p') return G.rel(s, b).opinion;
    if (b === 'p') return G.rel(s, a).opinion;
    const st = G.aiRel ? G.aiRel(s, a, b).status : 'neutral';
    return st === 'war' ? -50 : st === 'peace' ? 30 : 0;
  };
  const P = {
    after: min => (s) => s.time >= min * MIN(s),
    season: (...idx) => (s) => idx.includes(G.season(s).index),
    pressure: x => (s) => G.aiPressure(s) >= x,
    race: (...r) => (s, ctx) => r.includes(s.empires[ctx.owner].race),
    cities: n => (s, ctx) => citiesOf(s, ctx).length >= n,
    citySize: n => (s, ctx) => {
      const c = citiesOf(s, ctx).filter(x => x.pop >= n).sort((a, b) => b.pop - a.pop)[0];
      if (!c) return false; ctx.city = c.id; return true;
    },
    building: (b, L = 1) => (s, ctx) => {
      const c = citiesOf(s, ctx).filter(x => G.lvl(x, b) >= L).sort((a, b2) => G.lvl(b2, b) - G.lvl(a, b))[0];
      if (!c) return false; ctx.city = c.id; return true;
    },
    unhappy: below => (s, ctx) => {
      if (!G.happyOf) return false;
      const c = citiesOf(s, ctx).filter(x => G.happyOf(x) < below).sort((a, b) => G.happyOf(a) - G.happyOf(b))[0];
      if (!c) return false; ctx.city = c.id; return true;
    },
    happy: above => (s, ctx) => !G.happyOf || citiesOf(s, ctx).some(x => G.happyOf(x) >= above),
    gold: n => (s, ctx) => s.empires[ctx.owner].gold >= n * scaleOf(s),
    faith: n => (s, ctx) => (s.empires[ctx.owner].faith || 0) >= n,
    hasFaith: () => (s, ctx) => !!(G.faithOf && G.faithOf(s, ctx.owner)),
    mana: n => (s, ctx) => !!G.manaOf && G.manaOf(s, ctx.owner) >= n,
    hero: (lvl = 1) => (s, ctx) => { const h = G.heroOf && G.heroOf(s, ctx.owner); return !!(h && !h.dead && h.level >= lvl); },
    lowGrain: frac => (s, ctx) => {
      const c = citiesOf(s, ctx).find(x => x.starving || (x.res.grain || 0) < G.storageCap(s, x) * frac);
      if (!c) return false; ctx.city = c.id; return true;
    },
    // a rival whose opinion of (or with) us lies in [lo, hi]
    rival: (lo = -100, hi = 100) => (s, ctx) => {
      // AI realms' tales only ever involve other AI realms: nothing silent should reach into the player's realm
      const rs = rivals(s, ctx.owner).filter(e => (ctx.owner === 'p' || e.id !== 'p') && (() => { const o = opinion(s, ctx.owner, e.id); return o >= lo && o <= hi; })());
      if (!rs.length) return false; ctx.ai = G.pick(rs).id; return true;
    },
    // a free city within d tiles of one of our cities
    freeCity: (d = 10) => (s, ctx) => {
      if (!G.minorsList) return false;
      const mine = citiesOf(s, ctx);
      const ms = G.minorsList(s).filter(mi => !mi.subject && mine.some(c => G.dist(c, mi) <= d));
      if (!ms.length) return false; ctx.minor = G.pick(ms).id; return true;
    },
    // a calamity touched one of our cities within the last `min` minutes
    recentCalamity: (min = 40) => (s, ctx) => {
      const cs = (s.calamities || []).filter(c => s.time - c.start <= min * MIN(s));
      for (const c of cs) {
        const city = citiesOf(s, ctx).find(x => Math.hypot(x.x - c.x, x.y - c.y) <= c.r + 1);
        if (city) { ctx.city = city.id; ctx.cal = c.kind; return true; }
      }
      return false;
    },
    spies: n => (s, ctx) => !!G.spiesOf && G.spiesOf(s, ctx.owner).length >= n,
    flag: (k, v) => (s, ctx) => { const f = flagsOf(s, ctx.owner)[k]; return v === undefined ? f !== undefined : f === v; },
    noFlag: k => (s, ctx) => flagsOf(s, ctx.owner)[k] === undefined,
    chose: (id, key) => (s, ctx) => flagsOf(s, ctx.owner)[id] === key,
    coastal: () => (s, ctx) => {
      if (!G.coastal) return false;
      const c = citiesOf(s, ctx).find(x => G.coastal(s, x.x, x.y));
      if (!c) return false; ctx.city = c.id; return true;
    },
  };

  // -------------------------------------------------------------------
  // the text view: every token a tale can use, with fallbacks
  // -------------------------------------------------------------------
  const cityOf = (s, ctx) => {
    const c = ctx.city && s.cities[ctx.city];
    return c && c.owner === ctx.owner ? c : G.capital(s, ctx.owner);
  };
  const view = (s, ctx) => {
    const emp = s.empires[ctx.owner] || {};
    const R = DATA.races[emp.race] || DATA.races.hearth;
    const city = cityOf(s, ctx);
    const ai = ctx.ai && s.empires[ctx.ai];
    const mi = ctx.minor && s.minors && s.minors[ctx.minor];
    const h = G.heroOf ? G.heroOf(s, ctx.owner) : null;
    const f = G.faithOf ? G.faithOf(s, ctx.owner) : null;
    const god = f && DATA.gods && DATA.gods[f.god];
    const unit = i => (DATA.units[R.units[i]] || {}).name || 'soldiers';
    const cal = ctx.cal && DATA.calamities && DATA.calamities[ctx.cal];
    return {
      s, c: ctx, k: ctx.k || 1, n: ctx.n || {}, owner: ctx.owner, race: emp.race,
      city: city ? city.name : 'the capital', realm: emp.name || 'the realm',
      people: R.name, adj: R.adj || R.name,
      rival: ai ? 'the ' + ai.name : 'a distant realm', rivalPeople: ai ? DATA.races[ai.race].name : 'strangers',
      minor: mi ? mi.name : 'a free city',
      hero: h && !h.dead ? h.name : 'your champion', hasHero: !!(h && !h.dead), heroLevel: h && !h.dead ? h.level : 0,
      god: god ? god.name : 'the old gods', faith: f ? f.name : 'the old ways',
      season: G.season(s).name, unit0: unit(0), unit1: unit(1), unit2: unit(2),
      calamity: cal ? cal.name.replace(/^The /, 'the ') : 'the calamity',
      flag: k => flagsOf(s, ctx.owner)[k],
    };
  };
  const txt = (t, v) => typeof t === 'function' ? t(v) : String(t == null ? '' : t);
  const num = (x, v) => typeof x === 'function' ? x(v) : x;

  // -------------------------------------------------------------------
  // costs
  // -------------------------------------------------------------------
  const NAMES = { gold: 'gold', faith: 'faith', mana: 'mana' };
  const ICONS = { gold: '🪙', faith: '🙏', mana: '🔮' };
  const gname = g => NAMES[g] || (DATA.goods[g] ? DATA.goods[g].name.toLowerCase() : g);
  const gicon = g => ICONS[g] || (DATA.goods[g] ? DATA.goods[g].icon : '');
  const roundCost = c => { const o = {}; for (const [g, v] of Object.entries(c || {})) { const r = Math.max(1, Math.round(v / (v >= 100 ? 10 : 1)) * (v >= 100 ? 10 : 1)); if (v > 0) o[g] = r; } return o; };
  const have = (s, owner, city, g) => {
    const e = s.empires[owner];
    if (g === 'gold') return e.gold;
    if (g === 'faith') return e.faith || 0;
    if (g === 'mana') return G.manaOf ? G.manaOf(s, owner) : (city.res.mana || 0);
    return city ? (city.res[g] || 0) : 0;
  };
  const lacking = (s, owner, city, cost) => {
    for (const [g, v] of Object.entries(cost || {})) if (have(s, owner, city, g) < v) return `Not enough ${gname(g)}` + (DATA.goods[g] && g !== 'mana' && city ? ' in ' + city.name : '');
    return null;
  };
  const payCost = (s, owner, city, cost) => {
    const e = s.empires[owner];
    for (const [g, v] of Object.entries(cost || {})) {
      if (g === 'gold') e.gold -= v;
      else if (g === 'faith') e.faith = (e.faith || 0) - v;
      else if (g === 'mana') {
        let left = v;
        for (const c of [city, ...G.citiesOf(s, owner).filter(x => x !== city)]) { if (!c) continue; const t = Math.min(left, c.res.mana || 0); c.res.mana -= t; left -= t; if (left <= 0) break; }
      } else city.res[g] = (city.res[g] || 0) - v;
    }
  };
  const costText = cost => Object.entries(cost || {}).map(([g, v]) => `${gicon(g)} ${v} ${gname(g)}`).join(', ');

  // -------------------------------------------------------------------
  // effects: (s, ctx, ...args) -> short summary string ('' when nothing happened)
  // -------------------------------------------------------------------
  const pushMod = (s, c, key, mult, mins, label) => {
    c.mods = (c.mods || []).filter(m => m.until > s.time);
    c.mods.push({ key, mult, until: s.time + mins * MIN(s), label });
  };
  const scopeCities = (s, ctx, scope) => scope === 'realm' ? G.citiesOf(s, ctx.owner) : [cityOf(s, ctx)].filter(Boolean);
  const pct = m => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`;
  const MODNAME = { popGrowth: 'growth', buildTime: 'build time', researchTime: 'research time', trainTime: 'training time', atk: 'attack', def: 'defence', tax: 'taxes', travel: 'march speed', upkeep: 'troop food', mana: 'mana', vision: 'vision', spellPower: 'spell power', heroXp: 'hero experience' };
  const modName = k => MODNAME[k] || gname(k);
  const fx = {
    gain: (s, ctx, goods) => {
      const c = cityOf(s, ctx); if (!c) return '';
      const e = s.empires[ctx.owner]; const parts = [];
      for (const [g, v0] of Object.entries(goods || {})) {
        const v = Math.round(v0); if (!v) continue;
        if (g === 'faith') { e.faith = (e.faith || 0) + v; if (e.faithTotal !== undefined) e.faithTotal += Math.max(0, v); }
        else if (g === 'gold') e.gold += v;
        else G.gain(s, c, { [g]: v });
        parts.push(`+${v} ${gname(g)}`);
      }
      return parts.join(', ');
    },
    lose: (s, ctx, goods) => {
      const c = cityOf(s, ctx); if (!c) return '';
      const e = s.empires[ctx.owner]; const parts = [];
      for (const [g, v0] of Object.entries(goods || {})) {
        let v = Math.round(v0); if (!v) continue;
        if (g === 'gold') { v = Math.min(v, Math.max(0, e.gold)); e.gold -= v; }
        else if (g === 'faith') { v = Math.min(v, Math.max(0, e.faith || 0)); e.faith = (e.faith || 0) - v; }
        else { v = Math.min(v, Math.max(0, c.res[g] || 0)); c.res[g] = (c.res[g] || 0) - v; }
        if (v > 0) parts.push(`−${v} ${gname(g)}`);
      }
      return parts.join(', ');
    },
    // happiness for `mins` minutes; stored as a city mod (key 'storyHappy', mult = 1 + v/100) so it shows as a timed pill
    happy: (s, ctx, v, mins = 20, scope = 'city', label) => {
      const cs = scopeCities(s, ctx, scope); if (!cs.length || !v) return '';
      for (const c of cs) pushMod(s, c, 'storyHappy', 1 + v / 100, mins, `${label || 'A tale'} (${v > 0 ? '+' : '−'}${Math.abs(v)} happiness)`);
      return `${v > 0 ? '+' : '−'}${Math.abs(v)} happiness${scope === 'realm' ? ' in every city' : ''} for ${mins} min`;
    },
    mod: (s, ctx, key, mult, mins = 20, scope = 'city', label) => {
      const cs = scopeCities(s, ctx, scope); if (!cs.length) return '';
      for (const c of cs) pushMod(s, c, key, mult, mins, label || 'A tale');
      return `${pct(mult)} ${modName(key)}${scope === 'realm' ? ' realm-wide' : ''} for ${mins} min`;
    },
    faith: (s, ctx, n) => {
      if (!G.ensureReligion) return '';
      const e = s.empires[ctx.owner]; n = Math.round(n);
      if (n < 0) n = -Math.min(-n, Math.max(0, e.faith || 0));
      e.faith = (e.faith || 0) + n; if (n > 0) e.faithTotal = (e.faithTotal || 0) + n;
      return n ? `${n > 0 ? '+' : '−'}${Math.abs(n)} faith` : '';
    },
    mana: (s, ctx, n) => {
      const c = cityOf(s, ctx); if (!c) return ''; n = Math.round(n);
      if (n >= 0) { G.gain(s, c, { mana: n }); return `+${n} mana`; }
      const take = Math.min(-n, G.manaOf ? G.manaOf(s, ctx.owner) : (c.res.mana || 0));
      payCost(s, ctx.owner, c, { mana: take });
      return take ? `−${Math.round(take)} mana` : '';
    },
    // the player's standing with ctx.ai (only player <-> AI opinions exist; AI tales never touch them)
    rel: (s, ctx, d, who) => {
      const ai = who || ctx.ai;
      if (ctx.owner !== 'p' || !ai || ai === 'p' || !s.empires[ai] || s.empires[ai].dead) return '';
      const r = G.rel(s, ai); r.opinion = G.clamp(r.opinion + d, -100, 100);
      return `${d > 0 ? '+' : '−'}${Math.abs(d)} opinion with the ${s.empires[ai].name}`;
    },
    // every rival's opinion of us
    relAll: (s, ctx, d) => {
      let n = 0;
      for (const e of rivals(s, ctx.owner)) if (fx.rel(s, ctx, d, e.id)) n++;
      return n ? `${d > 0 ? '+' : '−'}${Math.abs(d)} opinion with every realm` : '';
    },
    heroXp: (s, ctx, n) => {
      const h = G.heroOf && G.heroOf(s, ctx.owner); if (!h || h.dead) return '';
      const got = G.heroGainXp(s, Math.round(n), ctx.owner);
      return got ? `${h.name} +${got} experience` : '';
    },
    heroItem: (s, ctx, tier = 2) => {
      const h = G.heroOf && G.heroOf(s, ctx.owner); if (!h || h.dead || !G.newHeroItem) return '';
      const it = G.newHeroItem(tier); h.items.push(it);
      return `${h.name} gains ${it.icon} ${it.name}`;
    },
    heroHurt: (s, ctx, hp) => {
      const h = G.heroOf && G.heroOf(s, ctx.owner); if (!h || h.dead) return '';
      h.hp = Math.max(5, (h.hp || 100) - hp);
      return `${h.name} is wounded`;
    },
    camp: (s, ctx, tier = 2, rich = 1) => {
      const c = cityOf(s, ctx); if (!c) return '';
      const camp = G.spawnCamp(s, tier, c); if (!camp) return '';
      if (rich !== 1) for (const g in camp.loot) camp.loot[g] = Math.round(camp.loot[g] * rich);
      if (ctx.owner === 'p') G.reveal(s, camp.x, camp.y, 1);
      return `a camp appears at (${camp.x}, ${camp.y})`;
    },
    rift: (s, ctx) => {
      const c = cityOf(s, ctx); if (!c) return '';
      let camp = null;
      if (DATA.units.demon) {
        // the same shape as magic.js wild-magic rifts, so its demon raids and the map art apply
        const t = G.freeTile(s, x => Math.hypot(x.x - c.x, x.y - c.y) >= 2 && Math.hypot(x.x - c.x, x.y - c.y) <= 4 && !(G.isWater && G.isWater(x)));
        if (t) {
          const id = G.newId(s, 'k');
          const n = Math.round(10 + s.time / (1800 * paceT(s)) * 3);
          camp = s.camps[id] = { id, x: t.x, y: t.y, tier: 5, units: { demon: n }, loot: { mana: 400 + n * 20, iron: 200, tools: 40 }, kind: 'rift', near: c.id, next: s.time + 600 * paceT(s) };
          t.camp = id;
          if (ctx.owner === 'p') G.reveal(s, t.x, t.y, 1);
        }
      } else camp = G.spawnCamp(s, 4, c);
      return camp ? `a rift tears open at (${camp.x}, ${camp.y})` : '';
    },
    units: (s, ctx, idx, n) => {
      const c = cityOf(s, ctx); if (!c) return '';
      const R = DATA.races[s.empires[ctx.owner].race];
      const u = typeof idx === 'string' ? idx : R.units[idx];
      if (!DATA.units[u]) return '';
      n = Math.round(n);
      if (n >= 0) c.units[u] = (c.units[u] || 0) + n;
      else { n = -Math.min(-n, c.units[u] || 0); c.units[u] = (c.units[u] || 0) + n; }
      return n ? `${n > 0 ? '+' : '−'}${Math.abs(n)} ${DATA.units[u].name}` : '';
    },
    pop: (s, ctx, frac, scope = 'city') => {
      const cs = scopeCities(s, ctx, scope); if (!cs.length) return '';
      let d = 0;
      for (const c of cs) { const before = c.pop; c.pop = Math.max(3, c.pop * (1 + frac)); d += c.pop - before; }
      d = Math.round(d);
      return d ? `${d > 0 ? '+' : '−'}${Math.abs(d)} people` : '';
    },
    people: (s, ctx, n) => {
      const c = cityOf(s, ctx); if (!c) return '';
      const before = c.pop; c.pop = Math.max(3, c.pop + n); const d = Math.round(c.pop - before);
      return d ? `${d > 0 ? '+' : '−'}${Math.abs(d)} people in ${c.name}` : '';
    },
    renown: (s, ctx, n) => { const e = s.empires[ctx.owner]; e.renownBonus = (e.renownBonus || 0) + n; return `${n > 0 ? '+' : '−'}${Math.abs(n)} renown`; },
    loyalty: (s, ctx, d) => { const c = cityOf(s, ctx); if (!c) return ''; c.loyalty = G.clamp((c.loyalty ?? 100) + d, 1, 100); return `${d > 0 ? '+' : '−'}${Math.abs(d)} loyalty in ${c.name}`; },
    influence: (s, ctx, d) => {
      const mi = ctx.minor && s.minors && s.minors[ctx.minor];
      if (!mi || !G.minorAddInfluence) return '';
      const got = G.minorAddInfluence(s, mi, ctx.owner, d);
      if (d < 0 && mi.grudge) mi.grudge[ctx.owner] = s.time + 20 * MIN(s);
      return Math.abs(got) >= 0.5 ? `${got > 0 ? '+' : '−'}${Math.abs(Math.round(got))} influence in ${mi.name}` : '';
    },
    // take gold from ctx.ai's treasury
    steal: (s, ctx, n) => {
      const e = ctx.ai && s.empires[ctx.ai]; if (!e || e.dead || ctx.ai === ctx.owner || (ctx.ai === 'p' && ctx.owner !== 'p')) return '';
      const take = Math.round(Math.min(n, Math.max(0, e.gold)));
      e.gold -= take; s.empires[ctx.owner].gold += take;
      return take ? `+${take} gold from the ${e.name}` : '';
    },
    calamity: (s, ctx, kind) => {
      if (!G.startCalamity || !DATA.calamities || !DATA.calamities[kind]) return '';
      const c = cityOf(s, ctx); if (!c) return '';
      const t = G.freeTile(s, x => G.dist(x, c) >= 2 && G.dist(x, c) <= 4) || G.tileAt(s, c.x, c.y);
      const cal = G.startCalamity(s, kind, t);
      return cal ? `${DATA.calamities[kind].name} at (${cal.x}, ${cal.y})` : '';
    },
    flag: (s, ctx, k, v = true) => { flagsOf(s, ctx.owner)[k] = v; return ''; },
    // unlock a later stage after `mins` minutes (× pace)
    next: (s, ctx, stage, mins = 10) => {
      story(s).queue.push({ owner: ctx.owner, id: ctx.id, stage, ctx: { ...ctx }, due: s.time + mins * MIN(s) });
      return '';
    },
  };
  const applyFx = (s, ctx, list) => {
    const out = [];
    for (const e of list || []) {
      if (!Array.isArray(e) || !fx[e[0]]) continue;
      const r = safe(fx[e[0]], '')(s, ctx, ...e.slice(1));
      if (r) out.push(r);
    }
    return out;
  };

  // -------------------------------------------------------------------
  // building a stage for display (costs fixed when shown, so what you see is what you pay)
  // -------------------------------------------------------------------
  const describe = (s, owner, id, stageKey, ctx) => {
    const def = byId(id); if (!def) return null;
    const st = def.stages[stageKey]; if (!st) return null;
    const v = view(s, ctx);
    const city = cityOf(s, ctx);
    const choices = st.choices.map(ch => {
      const cost = roundCost(num(ch.cost, v));
      const chance = ch.chance === undefined ? null : G.clamp(num(ch.chance, v), 0.05, 0.95);
      const need = ch.need ? safe(ch.need, 'Unavailable')(v) : null;
      const lack = city ? lacking(s, owner, city, cost) : 'No city';
      const bits = [];
      if (Object.keys(cost).length) bits.push(costText(cost));
      if (chance !== null) bits.push(`risky: ${Math.round(chance * 100)}%`);
      return { key: ch.key, text: txt(ch.label, v), cost, chance, need, lack, hint: ch.hint ? txt(ch.hint, v) : '', label: txt(ch.label, v) + (bits.length ? ` (${bits.join(' · ')})` : '') };
    });
    const dkey = st.def || st.choices[st.choices.length - 1].key;
    return { id, stage: stageKey, icon: def.icon || '📜', title: txt(def.title, v), art: txt(st.art || def.art || def.icon || '📜', v), text: txt(st.text, v), choices, def: dkey };
  };

  const present = (s, owner, id, stageKey, ctx) => {
    const d = describe(s, owner, id, stageKey, ctx); if (!d) return null;
    const T = story(s);
    if (stageKey === 'start') {
      const last = per(T, 'last', owner, {}), seen = per(T, 'seen', owner, {}), rec = per(T, 'recent', owner, []);
      last[id] = s.time; seen[id] = (seen[id] || 0) + 1;
      rec.push(id); if (rec.length > CFG.recent) rec.splice(0, rec.length - CFG.recent);
    }
    if (owner !== 'p') return d;
    const def = byId(id);
    const costs = {}, chances = {};
    for (const c of d.choices) { costs[c.key] = c.cost; if (c.chance !== null) chances[c.key] = c.chance; }
    return G.addPending(s, {
      kind: 'storylet', title: `${d.icon} ${d.title}`, text: d.text,
      options: d.choices.map(c => ({ key: c.key, label: c.label })),
      expires: s.time + (def.stages[stageKey].expire || CFG.expire) * MIN(s), def: d.def,
      data: { id, stage: stageKey, ctx, costs, chances },
    });
  };

  // -------------------------------------------------------------------
  // resolving a choice (player via pendingHandlers, AI directly)
  // -------------------------------------------------------------------
  const resolve = (s, owner, data, key, auto) => {
    const def = byId(data.id); if (!def) return null;
    const st = def.stages[data.stage]; if (!st) return null;
    const ctx = data.ctx; ctx.owner = owner; ctx.id = data.id;
    const city = cityOf(s, ctx); if (!city) return null;
    const v = view(s, ctx);
    const dkey = st.def || st.choices[st.choices.length - 1].key;
    let ch = st.choices.find(c => c.key === key) || st.choices.find(c => c.key === dkey);
    let cost = (data.costs && data.costs[ch.key]) || roundCost(num(ch.cost, v));
    const blocked = () => (ch.need && safe(ch.need, 'Unavailable')(v)) || lacking(s, owner, city, cost);
    let why = blocked();
    if (why) {
      if (!auto) return why;
      ch = st.choices.find(c => c.key === dkey); cost = (data.costs && data.costs[dkey]) || roundCost(num(ch.cost, v));
      if (blocked()) cost = {};
    }
    payCost(s, owner, city, cost);
    const chance = data.chances && data.chances[ch.key] !== undefined ? data.chances[ch.key] : ch.chance === undefined ? null : G.clamp(num(ch.chance, v), 0.05, 0.95);
    const ok = chance === null || G.story.roll() < chance;
    const list = safe(() => num(ok ? ch.fx : (ch.fail || []), v), [])() || [];
    const fl = flagsOf(s, owner);
    fl[data.id] = ch.key; fl[`${data.id}.${data.stage}`] = ch.key;
    const parts = applyFx(s, ctx, list);
    const say = txt(ok ? ch.say : (ch.failSay || ch.say), v);
    const T = story(s);
    const ends = !T.queue.some(q => q.owner === owner && q.id === data.id && q.due >= s.time);
    if (owner === 'p') {
      const entry = { t: Math.round(s.time), id: data.id, icon: def.icon || '📜', title: txt(def.title, v), stage: data.stage, choice: txt(ch.label, v), say, fx: parts, ok, risky: chance !== null, auto: !!auto, ends };
      T.log.unshift(entry); if (T.log.length > CFG.logMax) T.log.length = CFG.logMax;
      G.log(s, 'p', `${def.icon || '📜'} ${entry.title}: ${say}${parts.length ? ' (' + parts.join('; ') + ')' : ''}`, ok ? (chance === null ? 'info' : 'good') : 'bad');
      if (ends && typeof G.chronEvent === 'function') safe(G.chronEvent)(s, 'tale', { a: 'p', x: entry.title, c: entry.choice });
    }
    T.done = T.done || {}; T.done[owner] = (T.done[owner] || 0) + 1;
    return null;
  };
  G.pendingHandlers.storylet = (s, p, key, auto) => resolve(s, 'p', p.data, key, auto);

  // -------------------------------------------------------------------
  // choosing which tale comes next
  // -------------------------------------------------------------------
  const makeCtx = (s, owner, def) => {
    const cs = G.citiesOf(s, owner); if (!cs.length) return null;
    const ctx = { owner, id: def.id, k: scaleOf(s), city: G.pick(cs).id, n: {} };
    if (def.race && s.empires[owner].race !== def.race) return null;
    if (def.needs && !safe(def.needs, false)(s, owner)) return null;
    for (const p of def.when || []) if (!safe(p, false)(s, ctx)) return null;
    if (def.roll) safe(def.roll)(s, ctx);
    return ctx;
  };
  const eligible = (s, owner) => {
    const T = story(s);
    const last = per(T, 'last', owner, {}), seen = per(T, 'seen', owner, {}), rec = per(T, 'recent', owner, []);
    const out = [];
    for (const def of DATA.storylets) {
      if (def.once && seen[def.id]) continue;
      if (rec.includes(def.id)) continue;
      if (last[def.id] !== undefined && s.time - last[def.id] < (def.cool || CFG.cool) * MIN(s)) continue;
      const ctx = makeCtx(s, owner, def); if (!ctx) continue;
      const w = (def.w || 1) * (def.race ? 1.4 : 1) / (1 + 2 * (seen[def.id] || 0));
      out.push({ def, ctx, w });
    }
    return out;
  };
  const choose = (s, owner) => {
    const pool = eligible(s, owner);
    if (!pool.length) return null;
    let r = Math.random() * pool.reduce((a, x) => a + x.w, 0);
    for (const x of pool) { r -= x.w; if (r <= 0) return x; }
    return pool[pool.length - 1];
  };
  const activeFor = s => (s.pending || []).some(p => p.kind === 'storylet');

  // the player's tales
  G.slowHooks.push(safe((s) => {
    if (s.gameOver || dormant(s) || !G.citiesOf(s, 'p').length) return;
    const T = story(s);
    if (activeFor(s)) return;
    const qi = T.queue.findIndex(q => q.owner === 'p' && q.due <= s.time);
    if (qi >= 0) { const q = T.queue.splice(qi, 1)[0]; if (byId(q.id)) present(s, 'p', q.id, q.stage, q.ctx); T.next = Math.max(T.next, s.time + 10 * MIN(s)); return; }
    if (T.queue.some(q => q.owner === 'p')) return;           // a chain is mid-flight
    if (s.time < CFG.firstMin * MIN(s) || s.time < T.next) return;
    const pick = choose(s, 'p');
    if (!pick) { T.next = s.time + 3 * MIN(s); return; }
    present(s, 'p', pick.def.id, 'start', pick.ctx);
    T.next = s.time + G.rnd(CFG.gap[0], CFG.gap[1]) * MIN(s);
  }));

  // -------------------------------------------------------------------
  // AI parity: the same tales, answered at once by a simple chooser
  // -------------------------------------------------------------------
  const aiPick = (s, owner, d) => {
    const ok = d.choices.filter(c => !c.need && !c.lack);
    if (!ok.length) return d.def;
    const def = byId(d.id), st = def.stages[d.stage];
    const w = c => { const x = st.choices.find(y => y.key === c.key); return Math.max(0, x.ai === undefined ? 1 : x.ai) * (c.chance === null ? 1 : 0.4 + c.chance * 0.6); };
    const tot = ok.reduce((a, c) => a + w(c), 0);
    if (tot <= 0) return d.def;
    let r = Math.random() * tot;
    for (const c of ok) { r -= w(c); if (r <= 0) return c.key; }
    return ok[ok.length - 1].key;
  };
  const aiPlay = (s, owner, id, stageKey, ctx) => {
    const d = present(s, owner, id, stageKey, ctx); if (!d) return null;
    const key = aiPick(s, owner, d);
    const costs = {}, chances = {};
    for (const c of d.choices) { costs[c.key] = c.cost; if (c.chance !== null) chances[c.key] = c.chance; }
    resolve(s, owner, { id, stage: stageKey, ctx, costs, chances }, key, true);
    return key;
  };
  G.aiHooks.push(safe((s, emp) => {
    if (s.gameOver || dormant(s)) return;
    const T = story(s);
    const A = T.ai[emp.id] = T.ai[emp.id] || { next: Math.max(s.time, CFG.firstMin * MIN(s)) + G.rnd(CFG.firstExtra[0], CFG.aiGap[0]) * MIN(s) };
    const qi = T.queue.findIndex(q => q.owner === emp.id && q.due <= s.time);
    if (qi >= 0) { const q = T.queue.splice(qi, 1)[0]; if (byId(q.id)) aiPlay(s, emp.id, q.id, q.stage, q.ctx); return; }
    if (T.queue.some(q => q.owner === emp.id) || s.time < A.next || s.time < CFG.firstMin * MIN(s)) return;
    A.next = s.time + G.rnd(CFG.aiGap[0], CFG.aiGap[1]) * MIN(s);
    const pick = choose(s, emp.id);
    if (pick) aiPlay(s, emp.id, pick.def.id, 'start', pick.ctx);
  }));

  // -------------------------------------------------------------------
  // happiness from tales (city mods with key 'storyHappy')
  // -------------------------------------------------------------------
  if (typeof G.happiness === 'function') {
    const baseHappy = G.happiness;
    G.happiness = (s, city) => {
      const h = baseHappy(s, city);
      let add = 0;
      for (const m of city.mods || []) if (m.key === 'storyHappy' && m.until > s.time) add += Math.round((m.mult - 1) * 100);
      if (!add || !h || !h.why) return h;
      h.why.push({ label: 'Tales', value: add });
      const raw = (h.raw !== undefined ? h.raw : h.value) + add;
      return { ...h, raw, value: G.clamp(Math.round(raw), 0, 100) };
    };
  }

  // -------------------------------------------------------------------
  // chronicle: tales as timeline entries
  // -------------------------------------------------------------------
  if (typeof G.chronText === 'function') {
    const baseText = G.chronText;
    G.chronText = (s, ev) => {
      if (ev && ev.k === 'tale') {
        const V = G.CHRON_VOICE && s.empires.p && G.CHRON_VOICE[s.empires.p.race];
        const we = (V && V.we) || 'we';
        return `In the tale of ${ev.x || 'a strange day'}, ${we} chose: “${String(ev.c || 'to wait and see').replace(/\.$/, '')}”.`;
      }
      return baseText(s, ev);
    };
    if (G.CHRON_KINDS && Array.isArray(G.CHRON_KINDS.realm) && !G.CHRON_KINDS.realm.includes('tale')) G.CHRON_KINDS.realm.push('tale');
  }

  // -------------------------------------------------------------------
  // public API (tests, UI, console)
  // -------------------------------------------------------------------
  G.story = {
    CFG, P, fx, state: story, flags: flagsOf, view, describe, resolve, eligible, choose, applyFx, dormant, scale: scaleOf, byId,
    roll: () => Math.random(),
    active: s => (s.pending || []).find(p => p.kind === 'storylet') || null,
    // force a tale now (console: EC.G.story.force(EC.S, 'comet')); bypasses pacing but not its own conditions unless loose
    force: (s, id, loose) => {
      story(s);
      if (activeFor(s)) return 'A tale is already waiting for you';
      const def = id ? byId(id) : (choose(s, 'p') || {}).def;
      if (!def) return 'No such tale';
      let ctx = makeCtx(s, 'p', def);
      if (!ctx && loose) { const cs = G.citiesOf(s, 'p'); ctx = { owner: 'p', id: def.id, k: scaleOf(s), city: (G.capital(s, 'p') || cs[0]).id, n: {} }; for (const p of def.when || []) safe(p, false)(s, ctx); if (def.roll) safe(def.roll)(s, ctx); }
      if (!ctx) return 'Its time has not come (conditions not met)';
      present(s, 'p', def.id, 'start', ctx);
      return null;
    },
    aiPlay, present, makeCtx,
    // everything the UI needs to draw an open card: the costs fixed when it was shown, live affordability and needs
    card: (s, p) => {
      if (!p || p.kind !== 'storylet') return null;
      const d = describe(s, 'p', p.data.id, p.data.stage, p.data.ctx);
      if (!d) return null;
      const city = cityOf(s, p.data.ctx);
      for (const c of d.choices) {
        if (p.data.costs && p.data.costs[c.key]) c.cost = p.data.costs[c.key];
        if (p.data.chances && p.data.chances[c.key] !== undefined) c.chance = p.data.chances[c.key];
        c.lack = city ? lacking(s, 'p', city, c.cost) : 'No city';
        c.costs = Object.entries(c.cost).map(([g, n]) => ({ g, n, icon: gicon(g), name: gname(g), short: have(s, 'p', city, g) < n }));
      }
      return { ...d, pid: p.id, expires: p.expires, def: p.def, city: city ? city.name : '' };
    },
    pendingChain: s => story(s).queue.some(q => q.owner === 'p'),
    history: s => story(s).log,
  };
})();

// =====================================================================
//  The tales. Text and numbers are functions of a view `v` (see view()):
//  v.city, v.realm, v.people, v.rival, v.minor, v.hero, v.god, v.k (time
//  scale), v.n (numbers rolled when the tale began), v.flag(key).
//  Effects: ['gain', goods] ['lose', goods] ['happy', v, min, scope, label]
//  ['mod', key, mult, min, scope, label] ['faith', n] ['mana', n] ['rel', d]
//  ['relAll', d] ['heroXp', n] ['heroItem', tier] ['heroHurt', hp]
//  ['camp', tier, lootMult] ['rift'] ['units', raceIndex, n] ['pop', frac]
//  ['people', n] ['renown', n] ['loyalty', d] ['influence', d] ['steal', gold]
//  ['calamity', kind] ['flag', key, value] ['next', stage, delayMin]
// =====================================================================
(() => {
  const P = G.story.P;
  const R = (a, b) => Math.round(a * b);
  const needHero = v => v.hasHero ? null : 'Needs a living hero';
  const faithOr = (n, alt) => G.ensureReligion ? [['faith', n]] : alt;
  const tier = v => Math.min(5, 1 + Math.round(v.k / 2));
  const xpk = v => 0.8 * Math.max(1, v.heroLevel);   // hero experience scales with the hero, not the clock

  DATA.storylets.push(
  // ------------------------------------------------------------------ universal
  { id: 'plague_doctor', icon: '⚕️', title: 'The Beaked Physician', w: 1, when: [P.after(18), P.citySize(20)],
    stages: {
      start: { art: '🎭🌿⚗️', text: v => `A physician in a beaked mask and oilcloth coat stops at the gates of ${v.city}. A fever walks the roads a week behind her, she says, and she carries a tincture of bitter herbs and silver for every well.`,
        def: 'drive', choices: [
          { key: 'hire', label: 'Pay for the tincture', cost: v => ({ gold: 110 * v.k }), ai: 1.5,
            fx: () => [['happy', 4, 25, 'city', "The physician's tincture"], ['mod', 'popGrowth', 1.15, 25, 'city', 'Clean wells'], ['flag', 'doctor_trusted', true], ['next', 'hospice', 12]],
            say: v => `She works through the night, and the wells of ${v.city} taste faintly of silver.` },
          { key: 'seize', label: 'Seize her remedies and sell the silver', chance: 0.6,
            fx: v => [['gain', { gold: 60 * v.k }], ['happy', -3, 20, 'city', 'A healer robbed'], ['flag', 'doctor_trusted', false]],
            fail: v => [['gain', { gold: 60 * v.k }], ['happy', -3, 20, 'city', 'A healer robbed'], ['pop', -0.05], ['flag', 'doctor_trusted', false]],
            say: 'Her silver sells well, and the tincture is poured into the wells without her.', failSay: 'Without her skill the tincture sours, and the fever finds the city anyway.' },
          { key: 'drive', label: 'Drive her off as a charlatan', chance: 0.5,
            fx: [], fail: () => [['pop', -0.08], ['mod', 'popGrowth', 0.6, 15, 'city', 'Fever']],
            say: 'The fever never comes. Perhaps she lied.', failSay: 'The fever comes, exactly as she said it would.' },
        ] },
      hospice: { art: '🏥🌊🕊️', text: v => `The beaked physician returns to ${v.city}. The fever passed you by, but not your neighbours. She asks for a hospice by the river, where the sick of every realm may come.`,
        def: 'decline', choices: [
          { key: 'build', label: 'Build the hospice', cost: v => ({ timber: 200 * v.k, stone: 150 * v.k }),
            fx: () => [['renown', 6], ['relAll', 4], ['mod', 'popGrowth', 1.2, 40, 'city', 'The river hospice']],
            say: 'The hospice rises, and travellers carry your name to far courts.' },
          { key: 'decline', label: 'Thank her and decline', fx: [], say: 'She bows, and takes the eastern road.' },
        ] },
    } },

  { id: 'comet', icon: '☄️', title: 'The Bearded Star', w: 1, when: [P.after(20)],
    stages: {
      start: { art: '🌌☄️🔭', text: v => `A bearded star hangs over ${v.realm}, brighter every night. In the taverns of ${v.city} they argue whether it is a blessing, a warning, or simply a stone falling very slowly.`,
        def: 'ignore', choices: [
          { key: 'festival', label: "Hold a stargazers' festival", cost: v => ({ gold: 90 * v.k }),
            fx: () => [['happy', 6, 20, 'realm', "Stargazers' festival"]], say: 'Lanterns rise to meet the comet, and the people sing all night.' },
          { key: 'omen', label: 'Proclaim it an omen of victory',
            fx: () => [['mod', 'atk', 1.08, 25, 'realm', 'The comet omen'], ['happy', -3, 20, 'realm', 'Talk of war']], say: 'Your heralds name it a sword in the sky. The soldiers cheer; the farmers do not.' },
          { key: 'chase', label: 'Send riders to find where it falls', chance: 0.45, ai: 0.6,
            fx: v => G.startCalamity && DATA.calamities && DATA.calamities.starfall ? [['calamity', 'starfall'], ['flag', 'comet_chased', true]] : [['gain', { iron: 120 * v.k, tools: 15 * v.k }], ['flag', 'comet_chased', true]],
            fail: () => [['flag', 'comet_chased', false]],
            say: v => `It comes down in the hills beyond ${v.city}: star-iron for whoever digs first!`, failSay: 'The riders chase it for a week. It never lands.' },
          { key: 'ignore', label: 'Let the sky do as it will', fx: [], say: 'The comet fades by the turn of the season, and nobody remembers what it meant.' },
        ] },
    } },

  { id: 'deserters', icon: '🏳️', title: 'Banners Furled', w: 1, when: [P.after(35), P.pressure(0.02), P.rival(-100, 40)],
    roll: (s, ctx) => { ctx.n.men = G.rint(5, 9) + Math.round(2 * ctx.k); },
    stages: {
      start: { art: '🏳️🛡️🍞', text: v => `A column of ${v.n.men} soldiers under furled banners halts outside ${v.city}. Their captain kneels: they have deserted ${v.rival}, whose lord hangs men for losing. They beg for bread and a roof.`,
        def: 'away', choices: [
          { key: 'take', label: 'Take them in', cost: v => ({ grain: 22 * v.n.men }),
            fx: v => [['units', 1, v.n.men], ['rel', -10], ['flag', 'deserters_taken', true], ['next', 'envoy', 15]], say: 'They swear new oaths before nightfall.' },
          { key: 'return', label: 'Send them back in chains',
            fx: v => [['rel', 12], ['gain', { gold: 50 * v.k }], ['happy', -2, 15, 'city', 'Chained deserters']], say: v => `${v.rival.charAt(0).toUpperCase() + v.rival.slice(1)} thanks you warmly. The men do not.` },
          { key: 'away', label: 'Turn them away', fx: [], say: 'They march on, hungry, toward the hills.' },
        ] },
      envoy: { art: '📜😠⚖️', text: v => `An envoy of ${v.rival} arrives at ${v.city} with a scroll and a frown: the deserters you sheltered are to be handed back, or ${v.rival} will remember.`,
        def: 'refuse', choices: [
          { key: 'hand', label: 'Hand them over', fx: v => [['units', 1, -v.n.men], ['rel', 10], ['happy', -3, 20, 'city', 'Oaths broken']], say: 'The men go back in chains. Your own soldiers watch in silence.' },
          { key: 'pay', label: 'Pay the blood-price', cost: v => ({ gold: 120 * v.k }), fx: () => [['rel', 6]], say: 'Gold changes hands, and the matter is closed.' },
          { key: 'refuse', label: 'Refuse: they swore to you', fx: () => [['rel', -15], ['renown', 4], ['happy', 3, 20, 'city', 'Oaths honoured']], say: v => `Word spreads that ${v.realm} keeps its oaths, whatever the cost.` },
        ] },
    } },

  { id: 'relic', icon: '🏺', title: 'What the Plough Turned Up', w: 1, when: [P.after(20)],
    stages: {
      start: { art: '🏺👁️🌾', text: v => `Ploughmen near ${v.city} strike something that rings like a bell: a sealed urn of black bronze, older than any people now living. Its wax seal is stamped with an open eye.`,
        def: 'temple', choices: [
          { key: 'temple', label: 'Give it to the priests', fx: v => faithOr(30 * v.k, []).concat([['happy', 3, 20, 'city', 'A holy relic']]), say: 'The urn is set upon the altar, and pilgrims begin to come.' },
          { key: 'sell', label: 'Sell it to a collector', fx: v => [['gain', { gold: 130 * v.k }], ['happy', -2, 20, 'city', 'Heritage sold']], say: 'A collector from the south pays handsomely and asks no questions.' },
          { key: 'open', label: 'Break the seal', chance: 0.5, ai: 0.5,
            fx: v => (v.hasHero ? [['heroItem', 3]] : [['gain', { gold: 200 * v.k }]]).concat([['flag', 'relic_opened', 'boon']]),
            fail: () => [['camp', 2], ['happy', -4, 20, 'city', 'Restless dead'], ['flag', 'relic_opened', 'curse']],
            say: 'Inside, wrapped in rotted silk, lies a treasure of another age.', failSay: v => `A cold wind spills out. By morning the barrows near ${v.city} stand open, and their dead walk.` },
        ] },
    } },

  { id: 'famine', icon: '🥣', title: 'The Empty Bowls', w: 1.3, when: [P.after(25), P.lowGrain(0.15)],
    stages: {
      start: { art: '🥣🥣🥣', text: v => `A crowd of thin faces fills the square of ${v.city}. They carry empty bowls and a petition signed with a hundred thumbprints: feed us, or let us go.`,
        def: 'leave', choices: [
          { key: 'buy', label: 'Buy grain from abroad', cost: v => ({ gold: 130 * v.k }), fx: v => [['gain', { grain: 260 * v.k }], ['happy', 5, 20, 'city', 'Bread from abroad'], ['loyalty', 6]], say: 'Barges arrive within the week, low in the water with grain.' },
          { key: 'seize', label: "Seize the grain-merchants' stores", fx: v => [['gain', { grain: 180 * v.k }], ['mod', 'tax', 0.8, 25, 'city', 'Angry merchants']], say: 'The merchants curse your name. The poor bless it.' },
          { key: 'ration', label: 'Strict rations for all, nobles included', fx: () => [['mod', 'popGrowth', 0.8, 20, 'city', 'Rationing'], ['loyalty', 5]], say: 'Lords and beggars queue at the same table. It is grim, but it is fair.' },
          { key: 'leave', label: 'Let them leave if they wish', fx: () => [['pop', -0.06]], say: 'By dawn a long line of families walks out of the gates.' },
        ] },
    } },

  { id: 'strange_child', icon: '👁️', title: 'The Child Who Knew Names', w: 1, when: [P.after(25)],
    stages: {
      start: { art: '👧🕯️📖', text: v => `A child is found on the steps of the hall in ${v.city}, reciting the names of people who died before her grandparents were born. She does not know her own.`,
        def: 'leave', choices: [
          { key: 'foster', label: 'Raise her at court', cost: v => ({ gold: 50 * v.k, grain: 60 * v.k }), fx: () => [['flag', 'child_fostered', true], ['next', 'grown', 20]], say: 'She is given a room high in the hall, and a tutor who does not last the month.' },
          { key: 'temple', label: 'Send her to the temple', cost: v => ({ gold: 30 * v.k }), fx: v => faithOr(30 * v.k, [['happy', 2, 15, 'city', 'A blessed child']]), say: 'The priests whisper over her for days, then call her a blessing.' },
          { key: 'leave', label: 'Let her go where she will', fx: [], say: 'One morning she is gone, and the steps are cold.' },
        ] },
      grown: { art: '🔮👧📜', text: v => `The foundling of ${v.city} has grown sharp and strange. She finishes the scholars' sentences and corrects their sums. "I can show you what is coming," she says, "but not what it costs."`,
        def: 'free', choices: [
          { key: 'seer', label: 'Make her the court seer', fx: () => [['mod', 'researchTime', 0.85, 40, 'realm', "The seer's visions"], ['flag', 'seer', 'court']], say: 'Your scholars, chastened, work twice as hard.' },
          { key: 'war', label: 'Have her read the omens of war', fx: () => [['mod', 'def', 1.1, 40, 'realm', 'Forewarned'], ['flag', 'seer', 'war']], say: 'She names the roads your enemies will take, and your captains listen.' },
          { key: 'free', label: 'Give her a horse and her freedom', fx: () => [['happy', 4, 25, 'city', 'A kindness remembered'], ['flag', 'seer', 'free']], say: 'She rides out at dawn and does not look back.' },
        ] },
    } },

  { id: 'heretic', icon: '🔥', title: 'The Barefoot Preacher', w: 1, when: [P.after(30), P.cities(1)],
    stages: {
      start: { art: '🗣️🔥👣', text: v => `A barefoot preacher stands on a cart in the market of ${v.city}, telling all who listen that ${v.god} is a lie told by the powerful${v.flag('relic_opened') === 'curse' ? ', and pointing at the barrows your people broke open' : ''}. The crowd grows every day.`,
        def: 'tolerate', choices: [
          { key: 'tolerate', label: 'Let him speak', fx: () => [['happy', -3, 20, 'city', 'Heresy in the market'], ['mod', 'researchTime', 0.9, 20, 'realm', 'Open debate']], say: 'The arguments rage in every tavern, and some of them are clever.' },
          { key: 'exile', label: 'Exile him', chance: 0.6, fx: [], fail: () => [['happy', -7, 25, 'city', "A martyr's memory"]], say: 'He goes quietly, and is soon forgotten.', failSay: 'He is stoned on the road by men nobody admits sending. Now he is a martyr.' },
          { key: 'debate', label: v => `Send ${v.hero} to debate him`, need: needHero, chance: v => 0.4 + 0.04 * v.heroLevel,
            fx: v => [['happy', 5, 25, 'city', 'The debate won'], ['heroXp', 40 * xpk(v)]].concat(faithOr(15 * v.k, [])), fail: () => [['happy', -4, 20, 'city', 'The debate lost']],
            say: v => `${v.hero} turns the crowd with a single story.`, failSay: v => `The preacher makes ${v.hero} look a fool. The market laughs for a week.` },
        ] },
    } },

  { id: 'dragon_egg', icon: '🥚', title: 'The Egg Merchant', w: 0.9, when: [P.after(45), P.gold(150)],
    stages: {
      start: { art: '🥚🔥🧕', text: v => `A merchant with singed eyebrows unwraps a stone the size of a child: warm to the touch, scaled like a pinecone. "A dragon's egg," she says. "Probably."${v.flag('comet_chased') ? ' She swears it fell with the comet.' : ''}`,
        def: 'refuse', choices: [
          { key: 'buy', label: 'Buy the egg', cost: v => ({ gold: 260 * v.k }), ai: 0.6, fx: () => [['flag', 'egg_bought', true], ['next', 'hatch', 20]], say: 'The egg is laid in straw beside the forge, where it ticks like a cooling kettle.' },
          { key: 'haggle', label: 'Haggle hard, gold up front', cost: v => ({ gold: 110 * v.k }), chance: 0.4, ai: 0.4,
            fx: () => [['flag', 'egg_bought', true], ['next', 'hatch', 20]], fail: [],
            say: 'She throws up her hands and takes your price.', failSay: 'She pockets your gold and is gone before dawn. So is the egg.' },
          { key: 'refuse', label: 'Send her on her way', fx: [], say: 'She shrugs and tries the next town.' },
        ] },
      hatch: { art: '🐉🔥🌾', text: v => `The egg cracks in the night. Something wet and furious crawls out of the straw in ${v.city} and bites the smith. It is unmistakably a drake: small, hungry, and already too hot to hold.`,
        def: 'release', choices: [
          { key: 'raise', label: 'Raise it as a war-beast', cost: v => ({ grain: 200 * v.k, ore: 100 * v.k }), chance: 0.65,
            fx: () => [['renown', 15], ['mod', 'atk', 1.1, 45, 'realm', 'A drake in the sky']], fail: v => [['lose', { timber: 300 * v.k }], ['happy', -5, 20, 'city', "The drake's fire"]],
            say: 'It grows into a terror on the wing, and your enemies learn to look up.', failSay: 'It burns the timber yards and flies off into the mountains.' },
          { key: 'sell', label: 'Sell the hatchling to a menagerie', fx: v => [['gain', { gold: 380 * v.k }]], say: 'A prince from over the sea pays a fortune for it.' },
          { key: 'release', label: 'Release it into the wild', fx: () => [['happy', 3, 20, 'realm', 'A wild drake']], say: 'It circles the city three times and vanishes into the clouds. Children draw it for years.' },
        ] },
    } },

  { id: 'aftermath', icon: '🏚️', title: 'After the Storm', w: 1.4, cool: 90, when: [P.after(20), P.recentCalamity(45)],
    stages: {
      start: { art: '🏚️🧱🕯️', text: v => `In the wake of ${v.calamity}, the people of ${v.city} pick through what is left. Some want to rebuild at once; others say the land is cursed and they should move on.`,
        def: 'pray', choices: [
          { key: 'rebuild', label: 'Rebuild, and pay the workers well', cost: v => ({ gold: 80 * v.k, timber: 120 * v.k }), fx: () => [['happy', 6, 25, 'city', 'Rebuilding together'], ['loyalty', 8]], say: 'Scaffolding goes up before the dust has settled.' },
          { key: 'scavenge', label: 'Let them scavenge the ruins', fx: v => [['gain', { stone: 150 * v.k, ore: 60 * v.k }], ['happy', -2, 15, 'city', 'Looting']], say: 'Hands find what the storm left behind, and not all of it was abandoned.' },
          { key: 'pray', label: 'Hold a day of mourning', fx: v => faithOr(20 * v.k, []).concat([['mod', 'popGrowth', 0.9, 15, 'city', 'Mourning']]), say: 'The bells ring all day, and the city grieves.' },
        ] },
    } },

  // ------------------------------------------------------------------ Hearthfolk
  { id: 'hearth_millers', icon: '🌾', title: "The Millers' Charter", race: 'hearth', when: [P.after(20), P.building('farm', 2)],
    stages: {
      start: { art: '🌾⚙️📜', text: v => `The millers of ${v.city} march to your hall with flour on their sleeves and a charter in their hands. Grant them the sole right to grind grain, they say, and the bread will never run short.`,
        def: 'refuse', choices: [
          { key: 'grant', label: 'Grant the charter', fx: () => [['mod', 'grain', 1.25, 40, 'city', "Millers' charter"], ['mod', 'tax', 0.85, 40, 'city', 'Guild exemptions']], say: 'The mills turn day and night, and pay very little for the privilege.' },
          { key: 'sell', label: 'Grant it, for a fee', fx: v => [['gain', { gold: 120 * v.k }], ['mod', 'grain', 1.1, 30, 'city', "Millers' charter"], ['happy', -4, 25, 'city', 'Bread prices']], say: 'The guild pays, and passes the cost on in every loaf.' },
          { key: 'refuse', label: 'Refuse: the mills belong to all', fx: () => [['happy', 3, 20, 'city', 'Common mills'], ['mod', 'grain', 0.9, 20, 'city', 'Sulking millers']], say: 'The common folk cheer. The millers grind slowly for a while.' },
        ] },
    } },

  { id: 'hearth_scarecrow', icon: '🎃', title: 'The Walking Scarecrow', race: 'hearth', when: [P.after(20), P.season(1, 2)],
    stages: {
      start: { art: '🎃🌾🐦‍⬛', text: v => `Every night a scarecrow walks the furrows outside ${v.city}, and every morning the crows lie dead in neat rows. The farmers will not go near it, but the wheat has never stood so tall.`,
        def: 'leave', choices: [
          { key: 'offer', label: 'Leave it bread and ale', cost: v => ({ grain: 90 * v.k }), fx: () => [['mod', 'grain', 1.35, 30, 'city', "The scarecrow's watch"]], say: 'The offerings vanish each night. The wheat grows heavy and gold.' },
          { key: 'burn', label: 'Burn it', chance: 0.75, fx: () => [['happy', 2, 15, 'city', 'The fields are safe'], ['flag', 'scarecrow_burned', true]], fail: () => [['mod', 'grain', 0.75, 20, 'city', 'Withered fields']], say: 'It burns with a sound like laughter.', failSay: 'It burns with a sound like laughter, and the next morning the wheat is grey.' },
          { key: 'follow', label: v => `Send ${v.hero} to follow it`, need: needHero, chance: 0.6, fx: v => [['heroXp', 60 * xpk(v)], ['heroItem', 2]], fail: () => [['heroHurt', 35]],
            say: v => `It leads ${v.hero} to a hollow hill, and a gift left for whoever was brave enough.`, failSay: v => `It turns its sackcloth face, and ${v.hero} runs. Nobody speaks of it.` },
          { key: 'leave', label: 'Leave it be', fx: [], say: 'It walks until the harvest, then stands still forever.' },
        ] },
    } },

  // ------------------------------------------------------------------ Deepdelvers
  { id: 'delver_vein', icon: '🎶', title: 'The Singing Vein', race: 'delver', when: [P.after(20), P.building('mine', 2)],
    stages: {
      start: { art: '⛏️🎶💎', text: v => `Deep beneath ${v.city} the miners have broken into a seam of pale ore that hums when struck. The old delvers will not touch it. The young ones cannot stop.`,
        def: 'forbid', choices: [
          { key: 'dig', label: 'Dig deeper', chance: 0.6, fx: v => [['gain', { ore: 400 * v.k, gold: 100 * v.k }], ['flag', 'vein', 'dug']], fail: v => [['pop', -0.05], ['lose', { stone: 200 * v.k }], ['happy', -5, 20, 'city', 'The shaft collapsed']],
            say: 'The vein sings louder the deeper they go, and it is rich beyond reckoning.', failSay: 'The song rises to a shriek, and the shaft comes down.' },
          { key: 'seal', label: 'Seal the shaft with runes', cost: v => ({ stone: 150 * v.k }), fx: () => [['flag', 'vein', 'sealed'], ['happy', 4, 25, 'city', 'The elders approve']], say: 'The rune-wardens seal it. On quiet nights you can still hear it through the stone.' },
          { key: 'forge', label: 'Give the ore to the runesmiths', cost: v => ({ tools: 12 * v.k }), fx: v => [['gain', { runesteel: 25 * v.k }], ['mod', 'refine', 1.2, 25, 'city', 'Singing steel']], say: 'Blades forged from it ring for an hour after every blow.' },
          { key: 'forbid', label: 'Forbid anyone to go down', fx: [], say: 'The tunnel is chained shut. The young delvers grumble.' },
        ] },
    } },

  { id: 'delver_grudge', icon: '📕', title: 'The Grudge-Book', race: 'delver', when: [P.after(30), P.rival(-100, 30)],
    stages: {
      start: { art: '📕🪓⚖️', text: v => `The Keeper of Grudges opens the great book to a page gone brown with age: a debt owed by ${v.rival}, three generations unpaid. The clans demand it be settled, one way or another.`,
        def: 'leave', choices: [
          { key: 'forgive', label: 'Write it off with a gift', cost: v => ({ gold: 140 * v.k }), fx: () => [['rel', 15], ['happy', -2, 20, 'realm', 'A grudge forgiven']], say: 'The rival court is surprised and pleased. Your elders mutter into their beards.' },
          { key: 'avenge', label: 'Swear to avenge it', fx: () => [['rel', -20], ['mod', 'atk', 1.1, 40, 'realm', 'The Grudge sworn'], ['happy', 4, 30, 'realm', 'Old wrongs remembered'], ['flag', 'grudge_sworn', true]], say: 'Every hammer in the Hold rings with the oath.' },
          { key: 'demand', label: 'Demand payment in full', chance: 0.5, fx: v => [['steal', 150 * v.k], ['rel', -5]], fail: () => [['rel', -12]], say: 'They pay, sullenly, and the page is closed.', failSay: 'They laugh at your envoy. The page stays open.' },
          { key: 'leave', label: 'Leave the page open', fx: [], say: 'The book is closed. The grudge is not.' },
        ] },
    } },

  // ------------------------------------------------------------------ Sylvani
  { id: 'sylvan_oak', icon: '🌳', title: 'The Elder Oak Walks', race: 'sylvan', when: [P.after(20)],
    stages: {
      start: { art: '🌳🚶🌊', text: v => `The oldest tree of the grove beside ${v.city} has pulled its roots from the earth and stands swaying at the edge of town. Its voice is a slow landslide: it wishes to walk to the sea before it dies.`,
        def: 'let', choices: [
          { key: 'let', label: 'Sing it on its way', fx: () => [['mod', 'timber', 0.85, 20, 'city', 'The grove mourns'], ['flag', 'oak', 'walked'], ['next', 'seeds', 25]], say: 'The whole city lines the road as it passes, singing.' },
          { key: 'bind', label: 'Bind it with song to stay', cost: v => ({ mana: 30 * v.k }), fx: () => [['mod', 'timber', 1.3, 45, 'city', 'The bound oak'], ['happy', -2, 20, 'city', 'A sad song'], ['flag', 'oak', 'bound']], say: 'It settles back into the earth with a sigh that shakes the leaves for a mile.' },
          { key: 'fell', label: 'Fell it for timber', fx: v => [['gain', { timber: 500 * v.k, heartwood: 25 * v.k }], ['happy', -8, 30, 'realm', 'The Elder Oak felled'], ['flag', 'oak', 'felled']], say: 'It takes forty axes and three days. Nobody sings.' },
        ] },
      seeds: { art: '🌰🌊🌱', text: v => `Travellers bring word: the Elder Oak reached the sea and stood in the surf until it turned to driftwood. Its seeds came back to ${v.city} in a merchant's pocket, still warm.`,
        def: 'plant', choices: [
          { key: 'plant', label: v => `Plant them in ${v.city}`, fx: () => [['mod', 'popGrowth', 1.2, 40, 'city', 'Seeds of the Elder'], ['renown', 4]], say: 'Saplings spring up overnight, and children are born under them.' },
          { key: 'gift', label: 'Send them to the other realms as gifts', fx: () => [['relAll', 5]], say: 'Every court receives a single warm seed, and none forgets it.' },
        ] },
    } },

  { id: 'sylvan_stag', icon: '🦌', title: 'The White Stag', race: 'sylvan', when: [P.after(25)],
    stages: {
      start: { art: '🦌🌲🌙', text: v => `A white stag walks the deep wood beyond ${v.city}, where no path runs. ${v.flag('oak') === 'felled' ? 'The hunters say it came the night the Elder Oak fell, and that it is angry.' : 'The hunters say whoever follows it never walks the same wood twice.'}`,
        def: 'shelter', choices: [
          { key: 'hunt', label: v => `Send ${v.hero} to hunt it`, need: needHero, chance: 0.55, fx: v => [['heroXp', 80 * xpk(v)], ['heroItem', 3], ['happy', -3, 20, 'realm', 'The white stag slain']], fail: () => [['heroHurt', 40]],
            say: v => `${v.hero} returns with a white hide and a strange new calm.`, failSay: v => `The stag leads ${v.hero} into a thornbrake and leaves them there.` },
          { key: 'follow', label: 'Let the scouts follow where it leads', fx: () => [['mod', 'travel', 1.12, 30, 'realm', "The stag's paths"], ['mod', 'vision', 1.2, 30, 'realm', "The stag's paths"], ['mod', 'grain', 0.9, 30, 'city', 'Hunters away']], say: 'It shows your scouts paths no map has ever held.' },
          { key: 'shelter', label: 'Forbid all hunting in the wood', fx: () => [['happy', 4, 30, 'realm', 'The stag protected'], ['mod', 'timber', 0.9, 30, 'city', 'Closed woods']], say: 'The woodcutters stay home, and the stag is seen at dusk, unafraid.' },
        ] },
    } },

  // ------------------------------------------------------------------ Ashborn
  { id: 'ash_challenge', icon: '⚔️', title: 'The Blood Challenge', race: 'ash', when: [P.after(25)],
    stages: {
      start: { art: '⚔️🩸🔥', text: v => `A young chieftain with a fresh scar rides into ${v.city} and plants his spear before your tent. By the old law any blade may challenge the master of the Horde. He has many friends, and they are watching.`,
        def: 'ignore', choices: [
          { key: 'duel', label: v => `Send ${v.hero} to fight`, need: needHero, chance: v => Math.min(0.9, 0.35 + 0.05 * v.heroLevel),
            fx: v => [['renown', 8], ['heroXp', 60 * xpk(v)], ['happy', 5, 25, 'realm', 'The challenger fell']], fail: () => [['heroHurt', 60], ['happy', -6, 25, 'realm', 'A champion shamed'], ['loyalty', -10]],
            say: v => `${v.hero} ends it with one blow. The drums beat until dawn.`, failSay: v => `${v.hero} is carried from the ring. The challenger lets them live, which is worse.` },
          { key: 'bribe', label: 'Buy off his friends', cost: v => ({ gold: 150 * v.k }), fx: () => [['flag', 'challenger', 'bought']], say: 'His friends drift away to spend your gold. He rides off alone.' },
          { key: 'captain', label: 'Make him a war-captain', fx: v => [['units', 1, 4 + R(2, v.k)], ['mod', 'atk', 1.05, 30, 'realm', 'A hungry captain'], ['loyalty', -12]], say: 'He swears to you, for now, and brings his riders.' },
          { key: 'ignore', label: 'Ignore him', chance: 0.5, fx: [], fail: () => [['loyalty', -15], ['happy', -4, 20, 'city', 'A challenge unanswered']], say: 'He waits three days, then leaves, muttering.', failSay: 'The camps whisper that the master of the Horde is afraid.' },
        ] },
    } },

  { id: 'ash_smoke', icon: '🐺', title: 'Smoke on the Steppe', race: 'ash', when: [P.after(20)],
    stages: {
      start: { art: '🔥🐺🏕️', text: v => `A caravan burns on the steppe beyond ${v.city}. The tracks of its killers lead into the hills: a rival warband, laden with plunder that should have been yours to take.`,
        def: 'salvage', choices: [
          { key: 'ride', label: 'Track them to their camp', ai: 0.5, fx: v => [['camp', tier(v), 2], ['flag', 'smoke', 'rode']], say: 'Your trackers find their camp, heavy with loot. Now go and take it.' },
          { key: 'survivors', label: 'Bring in the survivors', cost: v => ({ grain: 80 * v.k }), fx: () => [['people', 8], ['happy', 2, 20, 'city', 'Survivors sheltered']], say: 'The survivors join the Horde. Their children will ride with yours.' },
          { key: 'salvage', label: 'Salvage what is left', fx: v => [['gain', { ore: 100 * v.k, weapons: 15 * v.k }]], say: 'Scorched blades and half-melted ore, but the Horde wastes nothing.' },
        ] },
    } },

  // ------------------------------------------------------------------ Tidekin
  { id: 'tide_leviathan', icon: '🐋', title: "The Leviathan's Song", race: 'tide', when: [P.after(20)],
    stages: {
      start: { art: '🐋🎶⛵', text: v => `The fishermen of ${v.city} come back pale: something vast sings beneath the harbour, so deep the hulls tremble. The fish have fled, or been eaten.`,
        def: 'wait', choices: [
          { key: 'offer', label: 'Pour offerings into the deep', cost: v => ({ grain: 140 * v.k }), fx: () => [['mod', 'grain', 1.25, 40, 'city', "The leviathan's blessing"], ['happy', 3, 20, 'city', 'The sea is calm']], say: 'The song softens, and the nets come up full.' },
          { key: 'hunt', label: 'Harpoon it', chance: 0.45, ai: 0.5, fx: v => [['gain', { gold: 280 * v.k, grain: 400 * v.k }], ['renown', 8]], fail: () => [['units', 2, -4], ['happy', -5, 25, 'city', "The leviathan's wrath"]],
            say: 'It takes nine boats and a whole night, but the harbour feasts for a month.', failSay: 'The sea rises in one black wave, and the boats do not come back.' },
          { key: 'wait', label: 'Wait for it to pass', fx: () => [['mod', 'grain', 0.8, 20, 'city', 'Empty nets']], say: 'The song moves out to sea after a fortnight of empty nets.' },
        ] },
    } },

  { id: 'tide_bell', icon: '🔔', title: 'The Drowned Bell', race: 'tide', when: [P.after(25)],
    stages: {
      start: { art: '🔔🌊🏛️', text: v => `At low tide the people of ${v.city} hear a bell tolling beneath the waves, from a town the sea swallowed long ago. The divers say it is still ringing on its own.`,
        def: 'listen', choices: [
          { key: 'raise', label: 'Raise it', cost: v => ({ timber: 200 * v.k, stone: 100 * v.k }), fx: () => [['renown', 6], ['happy', 5, 30, 'realm', 'The bell rings again']], say: 'It is hung in the harbour tower, and ships hear it a day out.' },
          { key: 'dive', label: "Dive for the drowned town's treasures", chance: 0.55, fx: v => [['gain', { gold: 180 * v.k, pearls: 25 * v.k }]], fail: () => [['people', -5], ['happy', -4, 20, 'city', 'Divers lost']],
            say: 'The divers come up with coins older than any kingdom.', failSay: 'The bell rings faster as the divers go down. Not all come up.' },
          { key: 'listen', label: 'Let it ring, and pray', fx: v => faithOr(25 * v.k, [['happy', 2, 20, 'city', 'The drowned bell']]), say: 'Pilgrims come to listen at low tide.' },
        ] },
    } },

  // ------------------------------------------------------------------ Veilborn
  { id: 'veil_mortal', icon: '🕯️', title: 'A Mortal at Court', race: 'veil', when: [P.after(20)],
    stages: {
      start: { art: '🧑‍🌾🌫️✨', text: v => `A mortal shepherd has wandered through the twilight into ${v.city} and wept at the beauty of it. He begs to stay. Time does not pass for him here as it should; he does not seem to mind.`,
        def: 'keep', choices: [
          { key: 'keep', label: 'Let him stay', fx: () => [['people', 3], ['happy', 3, 25, 'city', "A mortal's wonder"], ['mod', 'researchTime', 1.1, 20, 'realm', 'A mortal distraction']], say: 'He tends the moon-moths, and is happier than any of you.' },
          { key: 'home', label: 'Send him home with a gift', cost: v => ({ gold: 60 * v.k }), fx: () => [['relAll', 4]], say: 'He walks out of the mist into a village forty years older. They tell his story everywhere.' },
          { key: 'bargain', label: 'Buy his remaining years', fx: v => [['mana', 60 * v.k], ['happy', -5, 25, 'city', 'A cruel bargain'], ['flag', 'mortal_bargain', true]], say: 'He agrees, not understanding. By morning he is an old man, and the spires glow.' },
        ] },
    } },

  { id: 'veil_mirror', icon: '🪞', title: 'The Mirror That Remembers', race: 'veil', when: [P.after(30)],
    stages: {
      start: { art: '🪞👁️🌒', text: v => `In the oldest spire of ${v.city} a mirror has begun to show rooms that do not yet exist, and faces not yet born. The court is fascinated and frightened in equal measure.`,
        def: 'veil', choices: [
          { key: 'gaze', label: 'Study its visions', chance: 0.6, fx: () => [['mod', 'researchTime', 0.8, 40, 'realm', "The mirror's visions"]], fail: () => [['happy', -6, 25, 'city', 'Maddening visions']], say: 'Your scholars copy down tomorrow, and find it useful.', failSay: 'Those who look too long stop sleeping, and then stop speaking.' },
          { key: 'shatter', label: 'Shatter it', fx: v => [['mana', 70 * v.k], ['happy', -2, 15, 'city', "Seven years' grief"]], say: 'Its shards burn with stored light for a week.' },
          { key: 'veil', label: 'Draw a curtain over it', fx: [], say: 'The curtain stirs sometimes, as if someone breathed behind it.' },
        ] },
    } },

  // ------------------------------------------------------------------ Gravebound
  { id: 'grave_candles', icon: '🕯️', title: 'The Feast of Candles', race: 'grave', when: [P.after(20), P.unhappy(70)],
    stages: {
      start: { art: '🕯️💀🎻', text: v => `The living of ${v.city}, the bakers and the gravediggers' children, petition for one night of candles and music. The dead do not object. The dead do not do anything at all, unless told.`,
        def: 'refuse', choices: [
          { key: 'grant', label: 'Grant them the night', cost: v => ({ gold: 90 * v.k, grain: 90 * v.k }), fx: () => [['happy', 10, 25, 'city', 'The Feast of Candles'], ['mod', 'popGrowth', 1.2, 25, 'city', 'The Feast of Candles']], say: 'For one night, the city of the dead is warm.' },
          { key: 'dance', label: 'Let the dead dance too', fx: () => [['happy', 3, 25, 'city', 'A dance of bones'], ['mod', 'trainTime', 0.9, 25, 'city', 'Drilled to music'], ['mod', 'popGrowth', 0.9, 25, 'city', 'Nightmares']], say: 'The skeletons dance in perfect step. It is horrible, and the living love it.' },
          { key: 'refuse', label: 'Silence is the law', fx: () => [['loyalty', -6]], say: 'The candles stay unlit, and the living grow quieter still.' },
        ] },
    } },

  { id: 'grave_king', icon: '👑', title: 'The King Who Would Not Lie Down', race: 'grave', when: [P.after(30)],
    stages: {
      start: { art: '👑💀⚱️', text: v => `Beneath ${v.city} an ancient barrow-king has woken on his own, at no necromancer's word. He sits his stone throne in rusted mail and asks, politely, for his crown back.`,
        def: 'wall', choices: [
          { key: 'bind', label: 'Bind him to your service', cost: v => ({ mana: 40 * v.k }), fx: () => [['units', 5, 2], ['renown', 4]], say: 'He kneels, and his barrow-guard kneels with him.' },
          { key: 'lead', label: 'Let him lead your armies', fx: () => [['mod', 'atk', 1.1, 40, 'realm', 'The barrow-king rides'], ['happy', -5, 40, 'realm', 'A rival crown'], ['loyalty', -8]], say: 'He rides at the head of your legions, and your captains resent him.' },
          { key: 'rest', label: 'Lay him to rest with honours', cost: v => ({ gold: 110 * v.k }), fx: v => [['renown', 5]].concat(faithOr(30 * v.k, [])), say: 'He is sung back to sleep with the old words, and the barrow is sealed with gold.' },
          { key: 'wall', label: 'Wall up the barrow', chance: 0.7, ai: 0.6, fx: [], fail: v => [['camp', tier(v)]], say: 'The masons work fast. Behind the wall, something taps for a while, then stops.', failSay: 'The wall does not hold. He rides out at the head of his dead.' },
        ] },
    } },

  // ------------------------------------------------------------------ Windkin
  { id: 'wind_nest', icon: '🦅', title: 'The Storm Nest', race: 'wind', when: [P.after(20)],
    stages: {
      start: { art: '⚡🪺🦅', text: v => `On the highest crag above ${v.city}, lightning has struck the same place nine nights running. Where it strikes there is a nest, and in the nest three eggs that crackle with storm.`,
        def: 'leave', choices: [
          { key: 'climb', label: 'Climb for the eggs', chance: 0.55, fx: () => [['units', 4, 3], ['renown', 4]], fail: () => [['units', 3, -3], ['happy', -4, 20, 'city', 'Riders fallen']], say: 'Three storm-chicks hatch in your aerie, and grow fast.', failSay: 'The storm-mother returns as the riders reach the nest.' },
          { key: 'sell', label: 'Take the eggs and sell them', fx: v => [['gain', { gold: 200 * v.k }], ['happy', -3, 20, 'city', "The storm-mother's grief"]], say: 'Lowland lords pay well. The storm-mother screams over the city for a week.' },
          { key: 'leave', label: 'Leave the storm-mother in peace', fx: () => [['happy', 3, 20, 'city', 'The storm watches over us']], say: 'On clear days she circles the city, and the people take it as a blessing.' },
        ] },
    } },

  { id: 'wind_fledgling', icon: '🪶', title: 'The Fallen Fledgling', race: 'wind', when: [P.after(30), P.rival(-100, 100)],
    stages: {
      start: { art: '🪶⛓️🏙️', text: v => `A young flier of ${v.city} was blown off course in a gale and came down in the lands of ${v.rival}. They keep him caged in their market square, and crowds gather to stare at his wings.`,
        def: 'plead', choices: [
          { key: 'ransom', label: 'Pay his ransom', cost: v => ({ gold: 110 * v.k }), fx: () => [['rel', 6], ['happy', 3, 20, 'city', 'The fledgling home']], say: 'He flies home the same day, thin and furious.' },
          { key: 'rescue', label: 'Send fliers to snatch him back', chance: 0.6, fx: () => [['rel', -10], ['happy', 6, 25, 'realm', 'A daring rescue'], ['renown', 4]], fail: () => [['rel', -15], ['units', 3, -3]], say: 'They swoop at noon and are gone before the guards look up.', failSay: 'The rival archers were waiting.' },
          { key: 'plead', label: 'Plead for mercy', chance: 0.4, fx: () => [['rel', 3], ['happy', 2, 15, 'city', 'Mercy shown']], fail: () => [['happy', -5, 25, 'realm', 'A fledgling caged']], say: 'They release him, to show they can.', failSay: 'Your letters go unanswered. The cage stays in the square.' },
        ] },
    } },

  // ------------------------------------------------------------------ tied to systems
  { id: 'wild_apprentice', icon: '✨', title: 'The Boy Who Burned', needs: () => !!DATA.buildings.magetower, when: [P.after(30), P.building('magetower', 1)],
    stages: {
      start: { art: '🔥🧒✨', text: v => `A boy of fourteen is dragged before you in ${v.city}, hair still smoking. He set fire to a hayrick by looking at it, and then to the bucket brigade.${v.flag('child_fostered') ? ' Your foundling seer says only: "Keep him. He will matter."' : ''}`,
        def: 'cast', choices: [
          { key: 'teach', label: 'Apprentice him to your mages', cost: v => ({ gold: 80 * v.k }), fx: () => [['mod', 'mana', 1.25, 30, 'city', 'A wild talent'], ['next', 'trial', 15]], say: 'The magi take him in, and lock up the candles.' },
          { key: 'ward', label: 'Bind his gift with a ward', cost: v => ({ mana: 30 * v.k }), fx: () => [['happy', 2, 15, 'city', 'A danger contained'], ['flag', 'apprentice', 'warded']], say: 'The ward holds. He weeps, and is ordinary.' },
          { key: 'cast', label: 'Cast him out', fx: () => [['flag', 'apprentice', 'cast_out']], say: 'He walks into the hills. Sometimes, at night, there is a glow on the ridge.' },
        ] },
      trial: { art: '🌕🔮⚡', text: v => `Your magi report that the boy has grown strong very quickly, too quickly. He asks to attempt a great working alone in ${v.city}, under the full moon.`,
        def: 'forbid', choices: [
          { key: 'allow', label: 'Let him try', chance: 0.55, ai: 0.6, fx: v => [['mana', 150 * v.k], ['mod', 'spellPower', 1.15, 40, 'realm', "The apprentice's triumph"], ['renown', 5]], fail: () => [['rift']],
            say: 'The moon dims, the towers blaze, and he walks out laughing.', failSay: 'The weave tears. Something comes through.' },
          { key: 'forbid', label: 'Forbid it', fx: () => [['mod', 'mana', 1.1, 30, 'city', 'A careful student']], say: 'He sulks, and studies, and lives.' },
        ] },
    } },

  { id: 'miracle', icon: '😇', title: 'Tears of the Statue', needs: () => !!G.ensureReligion, when: [P.after(30), P.hasFaith()],
    stages: {
      start: { art: '🗿💧🌹', text: v => `A statue of ${v.god} in ${v.city} has begun to weep oil that smells of roses. The sick queue around the square to touch it. The priests are delighted; the sculptor, oddly, has left town.`,
        def: 'let', choices: [
          { key: 'proclaim', label: 'Proclaim a miracle', chance: 0.7, fx: v => [['faith', 50 * v.k], ['happy', 5, 25, 'city', 'A weeping statue']], fail: v => [['faith', -25 * v.k], ['happy', -6, 25, 'city', 'A fraud exposed']], say: v => `The faithful of ${v.faith} come from every corner of the realm.`, failSay: 'A child finds the oil-skin hidden in the statue\'s head. The whole city laughs.' },
          { key: 'investigate', label: 'Quietly investigate', cost: v => ({ gold: 60 * v.k }), fx: v => [['faith', 20 * v.k], ['loyalty', 5], ['flag', 'miracle', 'known']], say: 'Your agents find a hollow statue and a nervous sculptor. You let the priests keep their miracle, and the sculptor keeps his tongue.' },
          { key: 'let', label: 'Let the faithful decide', fx: v => [['faith', 8 * v.k]], say: 'The statue weeps until the oil runs out.' },
        ] },
    } },

  { id: 'succession', icon: '🏰', title: 'A Throne Without an Heir', needs: () => !!G.minorsList, when: [P.after(40), P.freeCity(9)],
    stages: {
      start: { art: '🏰👑⚔️', text: v => `The old ruler of ${v.minor} has died without an heir. Two claimants raise banners in its streets: his cautious sister, and a firebrand cousin beloved by the docks. Both send envoys to ${v.city}.`,
        def: 'stay', choices: [
          { key: 'sister', label: 'Back the sister', cost: v => ({ gold: 110 * v.k }), fx: () => [['influence', 16]], say: v => `The sister takes the throne of ${v.minor}, and remembers who helped.` },
          { key: 'cousin', label: 'Back the cousin', cost: v => ({ gold: 50 * v.k }), chance: 0.5, fx: () => [['influence', 32]], fail: () => [['influence', -12]], say: 'The docks rise, and the cousin is crowned in a storm of cheering.', failSay: 'The cousin hangs by morning. The sister will not forget your name.' },
          { key: 'stay', label: 'Stay out of it', fx: [], say: 'The free city settles its own affairs, bloodily.' },
        ] },
    } },

  { id: 'double_agent', icon: '🗝️', title: 'The Man With Two Masters', needs: () => !!G.spiesOf, when: [P.after(40), P.spies(1), P.rival(-100, 100)],
    stages: {
      start: { art: '🗝️🕵️🌑', text: v => `Your spies bring in a stranger at knifepoint in ${v.city}: an agent of ${v.rival}, who offers to turn and feed his masters whatever you like.${v.flag('seer') === 'court' ? ' Your seer watches him and says nothing, which is unlike her.' : ''}`,
        def: 'release', choices: [
          { key: 'turn', label: 'Turn him', cost: v => ({ gold: 90 * v.k }), fx: () => [['next', 'payoff', 15]], say: 'He takes your gold and slips back across the border.' },
          { key: 'hang', label: 'Hang him as a warning', fx: () => [['rel', -5], ['mod', 'def', 1.05, 30, 'realm', 'A vigilant watch']], say: 'His body hangs at the border crossing for a week.' },
          { key: 'release', label: 'Send him home', fx: () => [['rel', 4]], say: 'He goes, astonished. His masters are quietly grateful.' },
        ] },
      payoff: { art: '📒💰🕯️', text: v => `Your double agent returns from ${v.rival} with a ledger of their treasury and the names of their guards. He is sweating. "They suspect," he says. "One more task, and I want out."`,
        def: 'retire', choices: [
          { key: 'rob', label: 'Have him rob their treasury', chance: 0.6, fx: v => [['steal', 220 * v.k], ['flag', 'agent', 'robbed']], fail: () => [['rel', -15]], say: 'He comes back with saddlebags of gold and never stops running.', failSay: 'He is caught, and talks.' },
          { key: 'lie', label: 'Feed them false reports of your strength', fx: () => [['mod', 'def', 1.1, 40, 'realm', 'False reports']], say: 'Their captains now think your walls twice as high.' },
          { key: 'retire', label: 'Let him retire', fx: [], say: 'He buys a farm far away, under another name.' },
        ] },
    } },
  );
})();
