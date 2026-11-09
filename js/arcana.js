// =====================================================================
//  The Grimoire — magic as a learned, branching craft. Loaded right after magic.js.
//
//  · Tree: a shared Foundations trunk plus one tree per school, across
//    four Circles (Apprentice, Adept, Master, Archmage) × 3 tiers = 12
//    columns. Node kinds: spell (unlocks spells), lore (G.mod fx), meta
//    (metamagic), ench (enchantments); forks are pairs (excl) — learning
//    one forsakes the other. A circle needs a Mage Tower of its level in
//    the studying city AND the realm's research era (G.techEra).
//    Cross-links: some nodes need a research tech (tech), some are cheaper
//    with a tech (techOff) or a tradition of the arcana pillar (trad).
//  · Study: one topic at a time per realm, paid in mana + gold (+ tools,
//    iron in the upper circles), unlimited queue, plan-path, 50% refund.
//  · Schools: native + patron are attuned; others are opened (foreign,
//    +60% study cost) through a ley enclave of that school, a research
//    pact / alliance partner who knows it, or a captured city whose Mage
//    Tower was raised by that school. Opened schools are capped.
//  · Mastery: casting earns ranks 1-3 (stronger, cheaper, faster).
//  · Enchantments: lasting city wards with mana upkeep, slots by tower.
//  · Celestial calendar: conjunctions empower one school for a while.
//
//  State: empire.arcana = { known:[ids], active:{id,city,start,end,cost}|null, queue:[ids],
//         queueWait, opened:[schools], mastery:{spell:casts} };  city.ench = [{id, by, t}];
//         city.towerSchool;  s.arcanaV (1 once every realm has a grimoire);  s.magic.starNoted.
// =====================================================================
'use strict';
(() => {
const paceT = s => G.pace(s).time;
const pmin = (s, m) => m * 60 * paceT(s);

// ---------------------------------------------------------------------
// Circles, metamagic, star names
// ---------------------------------------------------------------------
DATA.circles = [
  { name: 'Apprentice', roman: 'I',   icon: '🕯️', tower: 1,  era: 0, desc: 'Charms and first spells.' },
  { name: 'Adept',      roman: 'II',  icon: '📘', tower: 5,  era: 1, desc: 'Wards, enchantments and the first metamagic.' },
  { name: 'Master',     roman: 'III', icon: '🔮', tower: 10, era: 2, desc: 'Strong spells and the great forks of the art.' },
  { name: 'Archmage',   roman: 'IV',  icon: '🌠', tower: 15, era: 3, desc: 'Spells that move the land and the sky.' },
];
DATA.metamagic = {
  empower: { name: 'Empower', icon: '💪', cost: 1.4,  power: 1.3, strain: 1.3, desc: 'Spell power ×1.3; mana ×1.4, strain ×1.3.' },
  extend:  { name: 'Extend',  icon: '⏳', cost: 1.25, dur: 1.5, desc: 'Timed effects last 50% longer; mana ×1.25.' },
  quicken: { name: 'Quicken', icon: '⚡', cost: 1.2,  cool: 0.5, strain: 1.5, desc: 'Cooldown halved; mana ×1.2, strain ×1.5.' },
  twin:    { name: 'Twin',    icon: '♊', cost: 1.8,  strain: 1.5, desc: 'A city spell also strikes a second city (nearest); mana ×1.8, strain ×1.5.' },
};
DATA.metaOrder = ['empower', 'extend', 'quicken', 'twin'];
const STARS = { hearthweather: 'the Harvest Moon', runecraft: 'the Anvil Star', songroot: 'the Green Moon', bloodember: 'the Red Comet',
  tidestorm: 'the Tidal Moon', glamour: 'the Dreaming Moon', necromancy: 'the Pale Moon', skywind: 'the Storm Star' };
for (const [k, v] of Object.entries(STARS)) if (DATA.schools[k]) DATA.schools[k].star = v;
G.ARC = {
  cost: { mana: [60, 200, 550, 1300], gold: [70, 220, 600, 1400], tier: 0.2, foreign: 1.6, trad: 0.8, techOff: 0.85 },
  time: [150, 360, 800, 1600], timeTier: 0.15, towerSpeed: 0.02,
  mastery: [3, 8, 16], masteryPower: 0.08, masteryCost: 0.07, masteryCool: 0.1,
  openBase: 2, openFee: k => ({ mana: 200 + 200 * k, gold: 300 + 250 * k }),
  star: { period: 100, lead: 15, len: 30, power: 1.25, cost: 0.8, upkeep: 0.5 },
  enchPlace: 40,
};

// ---------------------------------------------------------------------
// Summoned guards
// ---------------------------------------------------------------------
DATA.units.ironwarden = DATA.units.ironwarden || { name: 'Iron Warden', icon: '🗿', type: 'inf', atk: 30, defI: 55, defC: 50, spd: 4, carry: 0, upkeep: 0, time: 0, at: null, req: 0, cost: {}, desc: 'A rune-bound golem of iron and stone.' };

// ---------------------------------------------------------------------
// Spell helpers (moves, units, cities)
// ---------------------------------------------------------------------
const HOSTILE_MOVES = { raid: 1, attack: 1, conquer: 1 };
const movesTo = (s, owner, city) => s.moves.filter(m => m.owner !== owner && HOSTILE_MOVES[m.type] && m.x === city.x && m.y === city.y && m.arrive > s.time);
const movesNear = (s, owner, x, y, r) => s.moves.filter(m => m.owner && m.owner !== owner && m.arrive > s.time && G.unitsCount(m.units) && (() => { const p = G.movePos(s, m); return Math.hypot(p.x - x, p.y - y) <= r; })());
// stretch (frac > 0) or shorten (frac < 0) a march's remaining time, keeping its current position
const retime = (s, m, frac) => {
  const left = m.arrive - s.time; if (left <= 0) return;
  const f = (s.time - m.depart) / Math.max(1, m.arrive - m.depart);
  const a2 = s.time + Math.max(5, left * (1 + frac));
  m.depart = f >= 0.999 ? s.time : (s.time - f * a2) / (1 - f);
  m.arrive = a2;
};
const cull = (units, frac, pred) => {
  const lost = {};
  for (const [u, n] of Object.entries(units || {})) {
    if (u === 'hero' || !(n > 0) || (pred && !pred(DATA.units[u] || {}))) continue;
    const k = Math.min(n, Math.round(n * frac));
    if (k > 0) { units[u] = n - k; lost[u] = k; if (!units[u]) delete units[u]; }
  }
  return lost;
};
const lostText = lost => Object.entries(lost).map(([u, n]) => n + ' ' + (DATA.units[u] ? DATA.units[u].name : u)).join(', ') || 'none';
const struck = (s, ctx, title, lost, extra) => {
  const { owner, tcity, emp } = ctx;
  if (owner === 'p' || tcity.owner === 'p') G.report(s, [owner, tcity.owner], title, owner === 'p' ? 'win' : 'loss', { extra: `Cast by the ${emp.name}.${lost ? ' Losses: ' + lostText(lost) + '.' : ''}${extra ? ' ' + extra : ''}` });
};
const summon = (s, city, unit, n, mins) => {
  city.units[unit] = (city.units[unit] || 0) + n;
  city.summoned = (city.summoned || []).concat([{ unit, n, until: s.time + pmin(s, mins) }]);
};
const shiftQueue = (city, delta) => { for (const q of city.buildQueue) { q.start += delta; q.end += delta; } };
const happyMod = (s, city, v, mins, label) => G.spellMod(city, s, 'arcHappy', 1, mins, `${label} (${v > 0 ? '+' : '−'}${Math.abs(v)} happiness)`, { happy: v });
const coastalCheck = (s, ctx) => (ctx.tcity && !G.coastal(s, ctx.tcity.x, ctx.tcity.y)) ? 'Only a coastal city' : null;
const basicFoot = race => { const r = DATA.races[race]; return (r.units || []).find(u => DATA.units[u] && DATA.units[u].type === 'inf' && DATA.units[u].at === 'barracks') || (r.units || [])[0]; };

// ---------------------------------------------------------------------
// New spells. ai: tag used by the AI (econ, defend, strike); run(s, ctx) returns the log line.
// ctx: { owner, emp, city (casting), tcity (target city), tile, P (power of this cast), metas }
// ---------------------------------------------------------------------
const SP = {
  // ---- Foundations ----
  leydraw: { name: 'Draw the Ley', icon: '🌀', tier: 1, cost: 20, cool: 20, strain: 12, target: 'city', ai: 'mana',
    desc: 'Pull raw mana from the enclaves a city taps: 40 + 30 per point of ley power. Heavy strain.',
    check: (s, ctx) => G.leyPower(s, ctx.tcity) > 0 ? null : 'Only a city that taps a ley enclave',
    run: (s, ctx) => { const n = Math.round((40 + 30 * G.leyPower(s, ctx.tcity)) * ctx.P); G.gain(s, ctx.tcity, { mana: n }); return `🌀 ${ctx.tcity.name} draws ${n} mana from the ley.`; } },
  unravel: { name: 'Unravel', icon: '🧶', tier: 10, cost: 220, cool: 30, strain: 12, target: 'enemy', ai: 'strike',
    desc: 'Tear an enemy city\'s magic apart: removes 1 enchantment (2 at power ≥1.4), its timed boons and its Ward of Weaving.',
    run: (s, ctx) => {
      const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner);
      const n = ctx.P >= 1.4 ? 2 : 1, gone = [];
      for (let i = 0; i < n && t.ench && t.ench.length; i++) { const e = t.ench.sort((a, b) => enchUp(b.id) - enchUp(a.id))[0]; G.dispelEnchantment(s, t.id, e.id, ctx.owner); gone.push(DATA.enchantments[e.id].name); }
      const boons = (t.mods || []).filter(m => m.mult > 1 && m.until > s.time).length;
      t.mods = (t.mods || []).filter(m => !(m.mult > 1 && m.until > s.time)); t.ward = 0;
      struck(s, ctx, `🧶 Unravel struck ${t.name}`, null, `${gone.length ? 'Dispelled: ' + gone.join(', ') + '. ' : ''}${boons} boon${boons === 1 ? '' : 's'} undone.`);
      return `🧶 The weave of ${t.name} comes apart${gone.length ? ': ' + gone.join(', ') + ' dispelled' : ''}.`;
    } },
  // ---- Hearth & Weather ----
  kindle: { school: 'hearthweather', name: 'Kindle the Hearths', icon: '🕯️', tier: 1, cost: 60, cool: 15, strain: 6, target: 'city', ai: 'econ',
    desc: '+8 happiness in a city for 20 minutes.',
    run: (s, ctx) => { const v = Math.round(8 * ctx.P); happyMod(s, ctx.tcity, v, 20, '🕯️ Kindled hearths'); return `🕯️ Every hearth in ${ctx.tcity.name} burns bright (+${v} happiness).`; } },
  harvestmoon: { school: 'hearthweather', name: 'Harvest Moon', icon: '🌕', tier: 5, cost: 140, cool: 30, strain: 10, target: 'city', ai: 'econ',
    desc: 'An instant harvest: the city gains 15 minutes of its grain production.',
    run: (s, ctx) => { const n = Math.round(Math.max(0, G.econ(s, ctx.tcity).raw.grain || 0) * 15 * ctx.P); G.gain(s, ctx.tcity, { grain: n }); return `🌕 The Harvest Moon fills the granaries of ${ctx.tcity.name} (+${n} grain).`; } },
  hailstorm: { school: 'hearthweather', name: 'Hailstorm', icon: '🧊', tier: 10, cost: 260, cool: 35, strain: 14, target: 'enemy', ai: 'strike',
    desc: 'Hail on an enemy city: 20% of its grain and timber stores ruined, 8% of its cavalry falls.',
    run: (s, ctx) => {
      const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner);
      for (const g of ['grain', 'timber']) t.res[g] = (t.res[g] || 0) * Math.max(0.4, 1 - 0.2 * ctx.P);
      const lost = cull(t.units, 0.08 * ctx.P, d => d.type === 'cav');
      struck(s, ctx, `🧊 Hailstorm over ${t.name}`, lost, 'Grain and timber ruined.');
      return `🧊 Hail batters ${t.name}.`;
    } },
  eternalsummer: { school: 'hearthweather', name: 'Eternal Summer', icon: '🌞', tier: 15, cost: 600, cool: 60, strain: 30, target: 'realm', ai: 'econ', fx: [{ key: 'grain', mult: 1.15, mins: 40, scope: 'realm' }],
    desc: 'For 40 minutes winter does not touch the realm (no winter penalties) and grain +15%.',
    run: (s, ctx) => { ctx.emp.summer = s.time + pmin(s, 40) * (ctx.metas.includes('extend') ? 1.5 : 1); return '🌞 The sun stands still over the realm: an eternal summer.'; } },
  // ---- Runecraft ----
  mending: { school: 'runecraft', name: 'Rune of Mending', icon: '🪡', tier: 1, cost: 70, cool: 15, strain: 6, target: 'city', ai: 'econ',
    desc: 'The works under way in a city leap ahead: 30% of the current building\'s remaining time is cut (all queued works move up).',
    check: (s, ctx) => ctx.tcity.buildQueue.length ? null : 'Nothing is being built there',
    run: (s, ctx) => { const q = ctx.tcity.buildQueue[0]; const cut = Math.max(0, q.end - s.time) * Math.min(0.6, 0.3 * ctx.P); shiftQueue(ctx.tcity, -cut); return `🪡 Runes knit the works of ${ctx.tcity.name} (−${Math.round(cut / 60)} min).`; } },
  shatter: { school: 'runecraft', name: 'Shatter Rune', icon: '💥', tier: 5, cost: 170, cool: 30, strain: 12, target: 'enemy', ai: 'strike',
    desc: 'An enemy city\'s wall loses a level (if it has none, another building does).',
    run: (s, ctx) => {
      const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner);
      let b = G.lvl(t, 'wall') > 0 ? 'wall' : G.pick(Object.keys(t.buildings).filter(k => t.buildings[k] > 1 && !DATA.buildings[k].wonder));
      if (b) t.buildings[b]--;
      struck(s, ctx, `💥 A Shatter Rune broke ${t.name}`, null, b ? `${DATA.buildings[b].name} −1.` : 'Nothing gave way.');
      return `💥 ${b ? DATA.buildings[b].name + ' of ' + t.name + ' cracks' : t.name + ' holds'}.`;
    } },
  ironwarden: { school: 'runecraft', name: 'Iron Wardens', icon: '🗿', tier: 10, cost: 280, cool: 35, strain: 16, target: 'city', ai: 'defend',
    desc: 'Rune-golems guard a city for 30 minutes: 8 + Mage Tower level of them.',
    run: (s, ctx) => { const n = Math.round((8 + G.lvl(ctx.city, 'magetower')) * ctx.P * G.mod(s, ctx.owner, null, 'summon')); summon(s, ctx.tcity, 'ironwarden', n, 30 * (ctx.metas.includes('extend') ? 1.5 : 1)); return `🗿 ${n} Iron Wardens stand at the gates of ${ctx.tcity.name}.`; } },
  anvil: { school: 'runecraft', name: 'Anvil of Ages', icon: '🔨', tier: 15, cost: 500, cool: 45, strain: 25, target: 'city', ai: 'econ',
    desc: '40% of a city\'s ore is forged at once into tools and weapons, at full value.',
    run: (s, ctx) => {
      const t = ctx.tcity, ore = Math.floor((t.res.ore || 0) * 0.4); t.res.ore -= ore;
      const v = ore * DATA.goods.ore.value * ctx.P / 2;
      G.gain(s, t, { tools: Math.floor(v / DATA.goods.tools.value), weapons: Math.floor(v / DATA.goods.weapons.value) });
      return `🔨 The Anvil of Ages rings in ${t.name}: ${ore} ore forged.`;
    } },
  // ---- Song & Root ----
  thornwall: { school: 'songroot', name: 'Thornwall', icon: '🌵', tier: 1, cost: 70, cool: 18, strain: 7, target: 'city', ai: 'defend',
    desc: 'For 20 minutes, armies that assault the city lose a further 15% of their survivors to the thorns.',
    run: (s, ctx) => { ctx.tcity.thorns = { until: s.time + pmin(s, 20) * (ctx.metas.includes('extend') ? 1.5 : 1), pct: Math.min(0.4, 0.15 * ctx.P) }; return `🌵 Briars rise around ${ctx.tcity.name}.`; } },
  entangle: { school: 'songroot', name: 'Entangling Roots', icon: '🪢', tier: 5, cost: 150, cool: 25, strain: 10, target: 'city', ai: 'defend',
    desc: 'Armies marching on the city are slowed: their remaining march takes 50% longer.',
    run: (s, ctx) => { const ms = movesTo(s, ctx.owner, ctx.tcity); for (const m of ms) retime(s, m, Math.min(1, 0.5 * ctx.P)); return `🪢 Roots seize the roads to ${ctx.tcity.name}${ms.length ? ` (${ms.length} host${ms.length > 1 ? 's' : ''} slowed)` : ''}.`; } },
  swarm: { school: 'songroot', name: 'Swarm of Thorns', icon: '🐝', tier: 10, cost: 280, cool: 35, strain: 16, target: 'city', ai: 'defend',
    desc: 'Foreign armies on the march within 6 tiles of the city lose 10% of their troops.',
    run: (s, ctx) => {
      const ms = movesNear(s, ctx.owner, ctx.tcity.x, ctx.tcity.y, 6).filter(m => m.type !== 'trade');
      for (const m of ms) { cull(m.units, 0.1 * ctx.P); G.spellHostile(s, ctx.owner, m.owner); }
      return `🐝 A stinging swarm rises around ${ctx.tcity.name}${ms.length ? ` and falls on ${ms.length} host${ms.length > 1 ? 's' : ''}` : ''}.`;
    } },
  awaken: { school: 'songroot', name: 'Awaken the Forest', icon: '🌳', tier: 15, cost: 650, cool: 60, strain: 30, target: 'realm', ai: 'defend',
    desc: 'Every city of the realm is guarded by summoned beasts (6 + half its Mage Tower level) for 25 minutes.',
    run: (s, ctx) => { let tot = 0; for (const c of G.citiesOf(s, ctx.owner)) { const n = Math.round((6 + G.lvl(c, 'magetower') / 2) * ctx.P * G.mod(s, ctx.owner, null, 'summon')); summon(s, c, 'elemental', n, 25); tot += n; } return `🌳 The forest wakes: ${tot} beasts stand guard across the realm.`; } },
  // ---- Blood & Ember ----
  firebrand: { school: 'bloodember', name: 'Firebrand', icon: '🔥', tier: 1, cost: 70, cool: 15, strain: 8, target: 'enemy', ai: 'strike',
    desc: 'Fire in an enemy city\'s yards: 25% of its timber burns and its building works fall behind by a quarter.',
    run: (s, ctx) => {
      const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner);
      t.res.timber = (t.res.timber || 0) * Math.max(0.4, 1 - 0.25 * ctx.P);
      // a quarter of the work left, but never more than a quarter of the job's own length, and at most half of it in all (no compounding)
      const q0 = t.buildQueue[0];
      if (q0) { const dur = q0.dur || Math.max(1, q0.end - q0.start), room = Math.max(0, dur * 0.5 - (q0.burnt || 0));
        const d = Math.min(room, Math.max(0, q0.end - s.time) * 0.25 * ctx.P, dur * 0.25 * ctx.P);
        if (d > 0) { q0.burnt = (q0.burnt || 0) + d; shiftQueue(t, d); } }
      struck(s, ctx, `🔥 Firebrand set ${t.name} alight`, null, 'Timber burnt, works delayed.');
      return `🔥 ${t.name} burns.`;
    } },
  bloodoath: { school: 'bloodember', name: 'Blood Oath', icon: '🩸', tier: 5, cost: 120, cool: 30, strain: 12, target: 'city', ai: 'defend',
    desc: '4% of a city\'s people swear a blood oath and take up arms at once as foot soldiers.',
    run: (s, ctx) => {
      const t = ctx.tcity, k = t.pop * 0.04, u = basicFoot(ctx.emp.race);
      if (!u) return null;
      const n = Math.max(1, Math.floor(k * 0.7 * ctx.P)); t.pop -= k; t.units[u] = (t.units[u] || 0) + n;
      return `🩸 ${n} ${DATA.units[u].name} swear the blood oath in ${t.name}.`;
    } },
  ashenpall: { school: 'bloodember', name: 'Ashen Pall', icon: '🌋', tier: 10, cost: 280, cool: 40, strain: 16, target: 'enemy', ai: 'strike',
    desc: 'Ash falls on an enemy city: loyalty −12 and happiness −10 for 20 minutes.',
    run: (s, ctx) => { const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner); t.loyalty = Math.max(5, t.loyalty - 12 * ctx.P); happyMod(s, t, -Math.round(10 * ctx.P), 20, '🌋 Ashen Pall'); struck(s, ctx, `🌋 An Ashen Pall fell on ${t.name}`, null, 'Loyalty and happiness fall.'); return `🌋 Ash smothers ${t.name}.`; } },
  meteor: { school: 'bloodember', name: 'Meteor', icon: '☄️', tier: 15, cost: 800, cool: 60, strain: 40, target: 'tile', range: 12,
    desc: 'A star falls (within 12 tiles): a foreign city there loses 15% of its garrison and 2 building levels; a camp loses 30%; armies within 1.5 tiles lose 25%.',
    check: (s, ctx) => { const c = ctx.tile.city && s.cities[ctx.tile.city]; return c && c.owner === ctx.owner ? 'Not on your own city' : null; },
    run: (s, ctx) => {
      const t = ctx.tile, P = ctx.P, c = t.city && s.cities[t.city], camp = t.camp && s.camps[t.camp];
      let lost = {};
      if (c) {
        G.spellHostile(s, ctx.owner, c.owner); lost = cull(c.units, 0.15 * P);
        for (let i = 0; i < 2; i++) { const b = G.pick(Object.keys(c.buildings).filter(k => c.buildings[k] > 1 && !DATA.buildings[k].wonder)); if (b) c.buildings[b]--; }
        struck(s, { ...ctx, tcity: c }, `☄️ A meteor struck ${c.name}`, lost, 'Two buildings smashed.');
      } else if (camp) cull(camp.units, 0.3 * P);
      for (const m of movesNear(s, ctx.owner, t.x, t.y, 1.5)) cull(m.units, 0.25 * P);
      return `☄️ A star falls at (${t.x}, ${t.y})${c ? ' on ' + c.name : ''}.`;
    } },
  // ---- Tides & Storms ----
  tidegift: { school: 'tidestorm', name: 'Gift of the Tide', icon: '🐚', tier: 1, cost: 60, cool: 15, strain: 6, target: 'city', ai: 'econ', check: coastalCheck,
    fx: [{ key: 'fishing', mult: 1.5, mins: 20 }, { key: 'tax', mult: 1.12, mins: 20 }],
    desc: 'A coastal city: +50% fishing and +12% taxes for 20 minutes.' },
  maelstrom: { school: 'tidestorm', name: 'Maelstrom', icon: '🌀', tier: 5, cost: 170, cool: 30, strain: 14, target: 'tile', range: 14,
    desc: 'A whirlpool (within 14 tiles): foreign fleets within 2 tiles lose 35%, armies 12%; ships in a foreign city there lose 20%.',
    run: (s, ctx) => {
      const t = ctx.tile, P = ctx.P;
      for (const m of movesNear(s, ctx.owner, t.x, t.y, 2)) { cull(m.units, (m.naval ? 0.35 : 0.12) * P); G.spellHostile(s, ctx.owner, m.owner); }
      const c = t.city && s.cities[t.city];
      if (c && c.owner !== ctx.owner) { G.spellHostile(s, ctx.owner, c.owner); cull(c.units, 0.2 * P, d => d.type === 'ship'); }
      return `🌀 The sea churns at (${t.x}, ${t.y}).`;
    } },
  drowned: { school: 'tidestorm', name: 'Drowned Coast', icon: '🌊', tier: 10, cost: 260, cool: 35, strain: 14, target: 'enemy', ai: 'strike', check: coastalCheck, fx: [{ key: 'grain', mult: 0.6, mins: 20 }],
    desc: 'The sea floods a coastal enemy city: 35% of its grain is lost and its fields yield 40% less for 20 minutes.',
    run: (s, ctx) => { const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner); t.res.grain = (t.res.grain || 0) * Math.max(0.3, 1 - 0.35 * ctx.P); struck(s, ctx, `🌊 The sea rose over ${t.name}`, null, 'Grain lost, fields flooded.'); return `🌊 The tide drowns the fields of ${t.name}.`; } },
  leviathan: { school: 'tidestorm', name: 'Call the Leviathan', icon: '🐋', tier: 15, cost: 700, cool: 60, strain: 35, target: 'enemy', ai: 'strike', check: coastalCheck,
    desc: 'A sea-beast rises at a coastal enemy city: half its ships sink, 8% of its garrison falls, its Harbor loses a level.',
    run: (s, ctx) => {
      const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner);
      const lost = Object.assign(cull(t.units, 0.5 * ctx.P, d => d.type === 'ship'), cull(t.units, 0.08 * ctx.P, d => d.type !== 'ship'));
      if (G.lvl(t, 'harbor') > 0) t.buildings.harbor--;
      struck(s, ctx, `🐋 The Leviathan rose at ${t.name}`, lost, 'The Harbor is wrecked.');
      return `🐋 The Leviathan answers, and ${t.name} pays.`;
    } },
  // ---- Glamour & Dreams ----
  whispers: { school: 'glamour', name: 'Whispers of Doubt', icon: '🗣️', tier: 1, cost: 70, cool: 18, strain: 8, target: 'enemy', ai: 'strike',
    desc: 'An enemy city doubts its rulers: loyalty −10.',
    run: (s, ctx) => { const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner); t.loyalty = Math.max(5, t.loyalty - 10 * ctx.P); return `🗣️ Doubt spreads through ${t.name}.`; } },
  falsetrail: { school: 'glamour', name: 'False Trail', icon: '👣', tier: 5, cost: 160, cool: 30, strain: 12, target: 'city', ai: 'defend',
    desc: 'Each army marching on the city has a 50% chance to lose its way and turn home.',
    run: (s, ctx) => {
      let n = 0;
      for (const m of movesTo(s, ctx.owner, ctx.tcity)) {
        if (Math.random() >= Math.min(0.9, 0.5 * ctx.P)) continue;
        const i = s.moves.indexOf(m); if (i < 0) continue;
        s.moves.splice(i, 1); G.sendHome(s, m, m.units); n++;
      }
      return `👣 Phantom roads wind around ${ctx.tcity.name}${n ? `: ${n} host${n > 1 ? 's' : ''} turned home` : ''}.`;
    } },
  nightmares: { school: 'glamour', name: 'Nightmares', icon: '😱', tier: 10, cost: 260, cool: 35, strain: 14, target: 'enemy', ai: 'strike', fx: [{ key: 'trainTime', mult: 1.4, mins: 20 }],
    desc: 'An enemy city sleeps badly: happiness −12 and training 40% slower for 20 minutes.',
    run: (s, ctx) => { const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner); happyMod(s, t, -Math.round(12 * ctx.P), 20, '😱 Nightmares'); return `😱 Nightmares stalk ${t.name}.`; } },
  masquerade: { school: 'glamour', name: 'Grand Masquerade', icon: '🎭', tier: 15, cost: 550, cool: 50, strain: 25, target: 'realm', ai: 'econ',
    fx: [{ key: 'spy', mult: 1.3, mins: 30, scope: 'realm' }, { key: 'counterintel', mult: 1.3, mins: 30, scope: 'realm' }, { key: 'def', mult: 1.08, mins: 30, scope: 'realm' }],
    desc: 'Masks and mirrors everywhere for 30 minutes: spies +30%, counter-intelligence +30%, defence +8%.' },
  slumber: { school: 'glamour', name: 'Eternal Slumber', icon: '💤', tier: 15, cost: 750, cool: 60, strain: 35, target: 'enemy', ai: 'strike',
    fx: [{ key: 'raw', mult: 0.5, mins: 12 }, { key: 'refine', mult: 0.5, mins: 12 }, { key: 'trainTime', mult: 2, mins: 12 }],
    desc: 'An enemy city falls asleep for 12 minutes: raw goods and workshops −50%, training twice as slow.',
    run: (s, ctx) => { G.spellHostile(s, ctx.owner, ctx.tcity.owner); struck(s, ctx, `💤 ${ctx.tcity.name} fell into an enchanted sleep`); return `💤 ${ctx.tcity.name} sleeps.`; } },
  // ---- Necromancy ----
  speakdead: { school: 'necromancy', name: 'Speak with the Dead', icon: '🪦', tier: 1, cost: 60, cool: 15, strain: 8, target: 'enemy',
    desc: 'The dead of a rival realm talk: every one of its cities is revealed, with intelligence on each.',
    run: (s, ctx) => {
      const foe = ctx.tcity.owner, cs = G.citiesOf(s, foe);
      for (const c of cs) {
        G.reveal(s, c.x, c.y, 2);
        if (ctx.owner === 'p') s.intel[G.tileIdx(s, G.tileAt(s, c.x, c.y))] = { t: s.time, units: { ...c.units }, name: c.name, owner: c.owner, wall: G.lvl(c, 'wall'), th: G.lvl(c, 'townhall'), loyalty: Math.round(c.loyalty), res: Object.fromEntries(DATA.goodOrder.map(g => [g, Math.floor(c.res[g] || 0)]).filter(([, v]) => v > 0)) };
      }
      return `🪦 The dead of the ${s.empires[foe].name} whisper of ${cs.length} cit${cs.length === 1 ? 'y' : 'ies'}.`;
    } },
  lifedrain: { school: 'necromancy', name: 'Life Drain', icon: '🫀', tier: 5, cost: 170, cool: 30, strain: 14, target: 'enemy', ai: 'strike',
    desc: 'An enemy city loses 6% of its people; the casting city gains as many.',
    run: (s, ctx) => {
      const t = ctx.tcity; G.spellHostile(s, ctx.owner, t.owner);
      const k = t.pop * Math.min(0.15, 0.06 * ctx.P); t.pop -= k;
      ctx.city.pop = Math.min(Math.max(ctx.city.pop, G.econ(s, ctx.city).civCap), ctx.city.pop + k);
      struck(s, ctx, `🫀 Life was drained from ${t.name}`, null, `${Math.round(k)} people withered.`);
      return `🫀 ${Math.round(k)} lives flow from ${t.name} to ${ctx.city.name}.`;
    } },
  bonelegion: { school: 'necromancy', name: 'Bone Legion', icon: '💀', tier: 10, cost: 300, cool: 45, strain: 20, target: 'city', ai: 'defend',
    desc: 'Raise a lasting legion of Risen in a city: 6 + Mage Tower level of them. They never fade.',
    run: (s, ctx) => { const n = Math.round((6 + G.lvl(ctx.city, 'magetower')) * ctx.P * G.mod(s, ctx.owner, null, 'raise')); ctx.tcity.units.risen = (ctx.tcity.units.risen || 0) + n; return `💀 ${n} Risen join the garrison of ${ctx.tcity.name} for good.`; } },
  deathless: { school: 'necromancy', name: 'Deathless Host', icon: '⚰️', tier: 15, cost: 650, cool: 60, strain: 30, target: 'realm', ai: 'defend',
    desc: 'For 25 minutes, 30% of your soldiers who fall in any battle rise again as Risen in your nearest city.',
    run: (s, ctx) => { ctx.emp.deathless = s.time + pmin(s, 25) * (ctx.metas.includes('extend') ? 1.5 : 1); return '⚰️ Death loosens its grip on your soldiers.'; } },
  blight: { school: 'necromancy', name: 'Withering Blight', icon: '🥀', tier: 15, cost: 600, cool: 45, strain: 30, target: 'tile', shape: 'blight',
    desc: 'Wither the land near your city: forest or fertile vale becomes plains, plains become hills of dust (hills).' },
  // ---- Sky & Lightning ----
  tailwind: { school: 'skywind', name: 'Tailwind', icon: '💨', tier: 1, cost: 60, cool: 15, strain: 6, target: 'realm',
    desc: 'Every army, caravan and fleet of yours on the move arrives 30% sooner.',
    run: (s, ctx) => { let n = 0; for (const m of s.moves) if (m.owner === ctx.owner && m.arrive > s.time) { retime(s, m, -Math.min(0.6, 0.3 * ctx.P)); n++; } return `💨 A tailwind carries ${n} of your marches.`; } },
  chain: { school: 'skywind', name: 'Chain Lightning', icon: '🌩️', tier: 5, cost: 190, cool: 30, strain: 14, target: 'enemy', ai: 'strike',
    desc: 'Lightning leaps from an enemy city to up to 2 more foreign cities within 5 tiles: each loses 4% of its garrison and may lose a building level.',
    run: (s, ctx) => {
      const t0 = ctx.tcity, hit = [t0, ...Object.values(s.cities).filter(c => c !== t0 && c.owner !== ctx.owner && (c.owner === t0.owner || (G.rel && ctx.owner === 'p' && G.rel(s, c.owner).status === 'war')) && Math.hypot(c.x - t0.x, c.y - t0.y) <= 5).sort((a, b) => Math.hypot(a.x - t0.x, a.y - t0.y) - Math.hypot(b.x - t0.x, b.y - t0.y)).slice(0, 2)];
      for (const c of hit) {
        G.spellHostile(s, ctx.owner, c.owner); const lost = cull(c.units, 0.04 * ctx.P);
        if (Math.random() < 0.35) { const b = G.pick(Object.keys(c.buildings).filter(k => c.buildings[k] > 1 && !DATA.buildings[k].wonder)); if (b) c.buildings[b]--; }
        struck(s, { ...ctx, tcity: c }, `🌩️ Chain lightning struck ${c.name}`, lost);
      }
      return `🌩️ Lightning leaps through ${hit.map(c => c.name).join(', ')}.`;
    } },
  cyclone: { school: 'skywind', name: 'Cyclone', icon: '🌪️', tier: 10, cost: 270, cool: 35, strain: 16, target: 'tile', range: 14,
    desc: 'A cyclone (within 14 tiles): foreign armies within 2 tiles lose 8% and their march takes 60% longer.',
    run: (s, ctx) => { const ms = movesNear(s, ctx.owner, ctx.tile.x, ctx.tile.y, 2); for (const m of ms) { cull(m.units, 0.08 * ctx.P); retime(s, m, Math.min(1.2, 0.6 * ctx.P)); G.spellHostile(s, ctx.owner, m.owner); } return `🌪️ A cyclone tears across (${ctx.tile.x}, ${ctx.tile.y})${ms.length ? ` scattering ${ms.length} host${ms.length > 1 ? 's' : ''}` : ''}.`; } },
  stormlord: { school: 'skywind', name: 'Storm Lord', icon: '⛈️', tier: 15, cost: 700, cool: 60, strain: 35, target: 'realm',
    desc: 'For 30 minutes, every 5 minutes lightning strikes a city of a realm at war with you within 14 tiles of your towers (4% of its garrison, maybe a building level).',
    run: (s, ctx) => { ctx.emp.stormlord = { until: s.time + pmin(s, 30) * (ctx.metas.includes('extend') ? 1.5 : 1), next: s.time + pmin(s, 1), P: ctx.P }; return '⛈️ The storm answers to you now.'; } },
};
for (const [id, sp] of Object.entries(SP)) DATA.spells[id] = sp;
G.SHAPES.blight = t => t.terrain === 'forest' || t.terrain === 'fertile' ? 'plains' : t.terrain === 'plains' ? 'hills' : null;

// ---------------------------------------------------------------------
// Enchantments: lasting city magic with mana upkeep (per minute)
// ---------------------------------------------------------------------
DATA.enchantments = {
  aegis:          { name: 'Aegis of Weaving', icon: '🛡️', school: null, upkeep: 1.5, desc: 'The city ignores calamity penalties and wild-magic backlash.' },
  arcaneeye:      { name: 'Arcane Eye',       icon: '👁️', school: null, upkeep: 1.0, fx: { vision: 1.4, counterintel: 1.25, researchTime: 0.95 }, desc: 'Vision +40%, counter-intelligence +25%, research 5% faster here.' },
  hearthblessing: { name: 'Hearth Blessing',  icon: '🏡', school: 'hearthweather', upkeep: 1.0, fx: { grain: 1.1, popGrowth: 1.08 }, desc: '+10% grain, +8% growth.' },
  wardstones:     { name: 'Wardstones',       icon: '🪨', school: 'runecraft', upkeep: 1.2, fx: { wall: 1.25, def: 1.05 }, desc: 'Walls +25%, defence +5%.' },
  evergrove:      { name: 'Evergrove',        icon: '🌲', school: 'songroot', upkeep: 1.0, fx: { timber: 1.15, popGrowth: 1.06 }, desc: '+15% timber, +6% growth.' },
  emberforge:     { name: 'Ember Forge',      icon: '⚒️', school: 'bloodember', upkeep: 1.2, fx: { trainTime: 0.85, weapons: 1.1 }, desc: 'Training 15% faster, +10% weapons.' },
  tidecaller:     { name: 'Tidecaller Bell',  icon: '🔔', school: 'tidestorm', upkeep: 1.0, fx: { fishing: 1.25, caravan: 1.15, tax: 1.04 }, desc: 'Fishing +25%, caravans +15%, taxes +4%.' },
  veiledcity:     { name: 'Veiled City',      icon: '🌫️', school: 'glamour', upkeep: 1.0, fx: { counterintel: 1.4, def: 1.08 }, desc: 'Counter-intelligence +40%, defence +8%.' },
  gravewatch:     { name: 'Ossuary Watch',    icon: '🦴', school: 'necromancy', upkeep: 1.2, desc: 'Every 5 minutes 2 Risen rise to guard the city (up to 8 + 2 per tower level).' },
  stormspire:     { name: 'Storm Spire',      icon: '🗼', school: 'skywind', upkeep: 1.2, fx: { def: 1.12, vision: 1.3 }, thorns: 0.05, desc: 'Defence +12%, vision +30%; attackers lose 5% more of their survivors.' },
};
DATA.enchantOrder = Object.keys(DATA.enchantments);
const enchUp = id => (DATA.enchantments[id] || {}).upkeep || 0;
const NEUTRAL = '#8a5cd6';
G.ARCANE_COLOR = NEUTRAL;

// ---------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------
const NODES = {};
const N = (id, school, circle, tier, kind, name, icon, o = {}) => { NODES[id] = Object.assign({ id, school, circle, tier, col: circle * 3 + tier, kind, name, icon, pre: [] }, o); };
// ---- Foundations (school null) ----
N('f_theory',   null, 0, 0, 'spell', 'Arcane Theory', '📖', { spell: 'scry', innate: true, lore: 'The first page every apprentice copies.' });
N('f_transmute',null, 0, 1, 'spell', 'Transmutation', '⚗️', { spell: 'transmute', pre: ['f_theory'] });
N('f_leydraw',  null, 0, 1, 'spell', 'Ley Attunement', '🌀', { spell: 'leydraw', fx: { mana: 1.05 }, pre: ['f_theory'], lore: 'Feel the rivers under the land.' });
N('f_empower',  null, 0, 2, 'meta',  'Empower', '💪', { meta: 'empower', pre: ['f_theory'], trad: 'starsigns' });
N('f_ward',     null, 1, 0, 'spell', 'Ward of Weaving', '🛡️', { spell: 'manaward', pre: ['f_theory'], tech: 'wards' });
N('f_slots',    null, 1, 1, 'ench',  'Binding Circles', '⭕', { ench: ['aegis'], add: { enchSlots: 1 }, pre: ['f_leydraw'], trad: 'magicircle', lore: 'Chalk, silver and a promise kept.' });
N('f_extend',   null, 1, 1, 'meta',  'Extend', '⏳', { meta: 'extend', pre: ['f_empower'] });
N('f_wild',     null, 1, 2, 'lore',  'Wild Channeling', '🌪️', { fx: { spellPower: 1.08, strain: 1.25 }, excl: 'f_measured', pre: ['f_leydraw|f_transmute'], trad: 'wildmagic', lore: 'Let it through. Mostly.' });
N('f_measured', null, 1, 2, 'lore',  'Measured Casting', '📏', { fx: { strain: 0.75, spellCost: 0.95 }, pre: ['f_leydraw|f_transmute'], trad: 'wardedweave', lore: 'Count every syllable.' });
N('f_golems',   null, 2, 0, 'spell', 'Golem Labour', '🗿', { spell: 'golems', pre: ['f_transmute'] });
N('f_unravel',  null, 2, 1, 'spell', 'Unravel', '🧶', { spell: 'unravel', pre: ['f_ward'], tech: 'thaumaturgy' });
N('f_quicken',  null, 2, 1, 'meta',  'Quicken', '⚡', { meta: 'quicken', pre: ['f_extend'], trad: 'rationalmagic' });
N('f_battle',   null, 2, 2, 'lore',  'Battle Magic', '⚔️', { fx: { hexPower: 1.15 }, excl: 'f_bulwark', pre: ['f_unravel|f_wild|f_measured'], lore: 'Spells are weapons. Sharpen them.' });
N('f_bulwark',  null, 2, 2, 'lore',  'Counter-Warding', '🔰', { fx: { hexResist: 0.7 }, pre: ['f_unravel|f_ward'], lore: 'Every hostile spell finds a door already shut.' });
N('f_rites',    null, 3, 0, 'spell', 'Rites of the Land', '⛰️', { spells: ['raiseland', 'sinkland', 'growforest', 'raisepeaks', 'quicken'], innate: true, lore: 'Old rites every tower keeps; only the mightiest can work them.' });
N('f_twin',     null, 3, 1, 'meta',  'Twin', '♊', { meta: 'twin', pre: ['f_quicken'], tech: 'archmagery' });
N('f_nexus',    null, 3, 2, 'ench',  'Arcane Nexus', '💠', { ench: ['arcaneeye'], add: { enchSlots: 1 }, fx: { mana: 1.1, spellPower: 1.05 }, pre: ['f_slots'], tech: 'leymastery', trad: 'weavekeepers' });

// ---- school trees: one skeleton, eight spellbooks ----
// spells: [A seed, B, C, D, E, F, G, H?]  lore/forkX/forkY/cap: [name, icon, fx, extra]
const school = (k, t) => {
  const p = id => k.slice(0, 2) + '_' + id;
  const sn = id => DATA.spells[id];
  const S = (key, circle, tier, spell, pre, o) => N(p(key), k, circle, tier, 'spell', sn(spell).name, sn(spell).icon, Object.assign({ spell, pre }, o || {}));
  const [A, B, C, D, E, F, Gs, H] = t.spells;
  S('a', 0, 0, A, [], { seed: true });
  N(p('lore'), k, 0, 1, 'lore', t.lore[0], t.lore[1], { fx: t.lore[2], school: k, schoolCost: 0.95, pre: [p('a')], techOff: t.lore[3] || 'hedgemagic', lore: t.lore[4] });
  S('b', 0, 2, B, [p('a')]);
  S('c', 1, 0, C, [p('lore')]);
  N(p('ench'), k, 1, 1, 'ench', DATA.enchantments[t.ench].name, DATA.enchantments[t.ench].icon, { ench: [t.ench], pre: [p('lore')], techOff: 'leylore' });
  S('d', 1, 2, D, [p('b')]);
  S('e', 2, 0, E, [p('c') + '|' + p('ench')]);
  N(p('x'), k, 2, 1, 'lore', t.forkX[0], t.forkX[1], { fx: t.forkX[2], excl: p('y'), pre: [p('d') + '|' + p('c')], lore: t.forkX[3] });
  N(p('y'), k, 2, 1, 'lore', t.forkY[0], t.forkY[1], { fx: t.forkY[2], pre: [p('ench') + '|' + p('c')], lore: t.forkY[3] });
  S('f', 2, 2, F, [p('d')]);
  S('g', 3, 0, Gs, [p('e')]);
  N(p('cap'), k, 3, 1, 'lore', t.cap[0], t.cap[1], { fx: t.cap[2], schoolPower: 1.15, schoolCost: 0.9, pre: [p('x') + '|' + p('y')], trad: 'archmagi', lore: t.cap[3] });
  if (H) S('h', 3, 2, H, [p('f')]);
};
school('hearthweather', { spells: ['bountifulrain', 'kindle', 'hearthward', 'harvestmoon', 'summersun', 'hailstorm', 'eternalsummer'], ench: 'hearthblessing',
  lore: ['Weather Lore', '🌦️', { grain: 1.04, popGrowth: 1.03 }, 'croprotation', 'Red sky at night.'],
  forkX: ['Keeper of Seasons', '🍂', { grain: 1.08, popGrowth: 1.04 }, 'Every season its due.'], forkY: ['Hearthfire Pact', '🔥', { def: 1.06, wall: 1.06 }, 'No raider crosses a blessed threshold.'],
  cap: ['Crown of the Year', '👑', { grain: 1.05, tax: 1.04 }, 'The weather keeps the realm\'s calendar.'] });
school('runecraft', { spells: ['runehaste', 'mending', 'runeward', 'shatter', 'forgerunes', 'ironwarden', 'anvil'], ench: 'wardstones',
  lore: ['Rune Carving', '🔣', { buildTime: 0.97, wall: 1.04 }, 'runes', 'Cut deep; the stone remembers.'],
  forkX: ['Deep Runes', '⛏️', { ore: 1.08, stone: 1.06 }, 'Runes that call the vein.'], forkY: ['Binding Runes', '⛓️', { enchUpkeep: 0.75 }, 'A rune holds a spell like a nail holds a door.'],
  cap: ['Runes of Making', '🔨', { refine: 1.05, buildTime: 0.96 }, 'The first runes, that shaped the mountains.'] });
school('songroot', { spells: ['verdant', 'thornwall', 'healingsong', 'entangle', 'wildcall', 'swarm', 'awaken'], ench: 'evergrove',
  lore: ['Root Songs', '🎶', { timber: 1.05, popGrowth: 1.03 }, 'herblore', 'Sing to the seed and it listens.'],
  forkX: ['Wild Heart', '🐺', { summon: 1.5, atk: 1.03 }, 'The beasts come in greater numbers, and stay angrier.'], forkY: ['Lifebloom', '🌸', { popGrowth: 1.06, heal: 1.5 }, 'Healing songs reach further.'],
  cap: ['Heart of the Wood', '💚', { timber: 1.05, housing: 1.04 }, 'The oldest tree knows your name.'] });
school('bloodember', { spells: ['bloodrage', 'firebrand', 'emberstorm', 'bloodoath', 'curseofash', 'ashenpall', 'meteor'], ench: 'emberforge',
  lore: ['Ember Rites', '🩸', { atk: 1.03 }, 'forgedblades', 'Blood on the coals.'],
  forkX: ['Fury Unbound', '😤', { atk: 1.05, bloodPrice: 0 }, 'Bloodrage no longer costs the capital its people.'], forkY: ['Cinder Hexes', '🌋', { hexPower: 1.25 }, 'Fire that remembers who lit it.'],
  cap: ['The Burning Crown', '👑', { atk: 1.04, trainTime: 0.95 }, 'Kings who rule by fire.'] });
school('tidestorm', { spells: ['fairwinds', 'tidegift', 'tempest', 'maelstrom', 'calmseas', 'drowned', 'leviathan'], ench: 'tidecaller',
  lore: ['Tide Tables', '🌊', { fishing: 1.08, travel: 1.03 }, 'weirs', 'The sea keeps time better than any clock.'],
  forkX: ['Sailor\'s Charms', '⚓', { travel: 1.06, shipCost: 0.92 }, 'Knots that bind the wind.'], forkY: ['Stormborn', '⛈️', { hexPower: 1.15, def: 1.03 }, 'Calm is for other people.'],
  cap: ['Lord of Tides', '🔱', { fishing: 1.1, caravan: 1.15 }, 'The sea opens a road for you.'] });
school('glamour', { spells: ['veilmist', 'whispers', 'illusion', 'falsetrail', 'dreamsend', 'nightmares', 'masquerade', 'slumber'], ench: 'veiledcity',
  lore: ['Glamour Craft', '🪞', { counterintel: 1.1, spy: 1.05 }, 'envoys', 'Seem, and be believed.'],
  forkX: ['Dreamwalkers', '💭', { spy: 1.1, counterintel: 1.1 }, 'Spies who arrive in dreams.'], forkY: ['Nightweavers', '🌑', { hexPower: 1.2 }, 'The dark side of every dream.'],
  cap: ['The Twilight Mantle', '🦋', { def: 1.05, spellCost: 0.95 }, 'Half here, half elsewhere.'] });
school('necromancy', { spells: ['raisedead', 'speakdead', 'plaguewind', 'lifedrain', 'soulharvest', 'bonelegion', 'deathless', 'blight'], ench: 'gravewatch',
  lore: ['Grave Lore', '🪦', { raise: 1.15, upkeep: 0.97 }, 'rites', 'The dead remember everything.'],
  forkX: ['Lichcraft', '🧙', { spellCost: 0.9, popGrowth: 0.95 }, 'Power at a price paid in years.'], forkY: ['Ossuary Keepers', '🦴', { raise: 1.3, upkeep: 0.95 }, 'Every bone filed and ready.'],
  cap: ['Throne of Bones', '💀', { raise: 1.15, def: 1.04 }, 'Death serves the crown.'] });
school('skywind', { spells: ['windwalk', 'tailwind', 'lightning', 'chain', 'stormshield', 'cyclone', 'stormlord'], ench: 'stormspire',
  lore: ['Wind Reading', '🪶', { vision: 1.1, travel: 1.03 }, 'trailblazing', 'Every gust carries news.'],
  forkX: ['Stormcrown', '🌩️', { hexPower: 1.2 }, 'Lightning learns your enemies\' names.'], forkY: ['Windriders', '🦅', { travel: 1.08, caravan: 1.1 }, 'Roads in the sky.'],
  cap: ['Eye of Heaven', '👁️', { vision: 1.1, def: 1.04 }, 'Nothing under the sky is hidden.'] });

DATA.arcana = NODES;
for (const n of Object.values(NODES)) {
  n.pre = n.pre.map(g => String(g).split('|'));
  if (n.spell) n.spells = [n.spell];
  n.spells = n.spells || [];
  n.ench = n.ench || [];
}
for (const [id, n] of Object.entries(NODES)) if (n.excl && NODES[n.excl]) NODES[n.excl].excl = id;
DATA.arcanaOrder = Object.keys(NODES);
DATA.arcanaLanes = [null, ...DATA.schoolOrder];
const SPELL_NODE = {}, META_NODE = {}, ENCH_NODE = {};
for (const n of Object.values(NODES)) { for (const sp of n.spells) SPELL_NODE[sp] = n.id; if (n.meta) META_NODE[n.meta] = n.id; for (const e of n.ench) ENCH_NODE[e] = n.id; }
G.spellNode = id => SPELL_NODE[id] || null;
G.arcanaChildren = id => DATA.arcanaOrder.filter(k => NODES[k].pre.some(g => g.includes(id)));

// plain words for a node
const FXW = {
  mana: 'mana', spellPower: 'spell power', grain: 'grain', timber: 'timber', stone: 'stone', ore: 'ore', popGrowth: 'growth', def: 'defence', wall: 'walls', atk: 'attack',
  tax: 'taxes', refine: 'workshop output', fishing: 'fishing', travel: 'march speed', vision: 'vision', caravan: 'caravans', spy: 'spy skill', counterintel: 'counter-intelligence',
  raise: 'dead raised', housing: 'housing', summon: 'summoned beasts', heal: 'healing', hexPower: 'power of hostile spells', weapons: 'weapons',
};
const LESS = { strain: 'weave strain', spellCost: 'spell costs', enchUpkeep: 'enchantment upkeep', upkeep: 'troop upkeep', buildTime: 'build time', trainTime: 'training time', shipCost: 'ship costs', researchTime: 'research time', studyTime: 'study time', hexResist: 'enemy spells against you' };
const fxPart = (k, v) => {
  if (k === 'bloodPrice') return 'Bloodrage costs no people';
  if (LESS[k]) return `${LESS[k][0].toUpperCase() + LESS[k].slice(1)} ${v < 1 ? '−' : '+'}${Math.round(Math.abs(1 - v) * 100)}%`;
  return `${v >= 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}% ${FXW[k] || k}`;
};
G.arcanaFxText = id => {
  const n = NODES[id]; if (!n) return '';
  const out = [];
  if (n.spells.length) out.push('Spell' + (n.spells.length > 1 ? 's' : '') + ': ' + n.spells.map(k => DATA.spells[k].name).join(', '));
  if (n.meta) out.push(`Metamagic ${DATA.metamagic[n.meta].name}: ${DATA.metamagic[n.meta].desc}`);
  if (n.ench.length) out.push('Enchantment: ' + n.ench.map(k => `${DATA.enchantments[k].name} (${DATA.enchantments[k].desc} Upkeep ${DATA.enchantments[k].upkeep} mana/min)`).join(', '));
  for (const [k, v] of Object.entries(n.fx || {})) out.push(fxPart(k, v));
  if (n.add && n.add.enchSlots) out.push(`+${n.add.enchSlots} enchantment slot per city with a tower`);
  if (n.schoolPower) out.push(`${DATA.schools[n.school].name} spells ${Math.round((n.schoolPower - 1) * 100)}% stronger`);
  if (n.schoolCost) out.push(`${DATA.schools[n.school].name} spells ${Math.round((1 - n.schoolCost) * 100)}% cheaper`);
  return out.join('; ') + '.';
};

// ---------------------------------------------------------------------
// Realm state, seeds and old-save migration
// ---------------------------------------------------------------------
const native = race => DATA.schoolOrder.filter(k => DATA.schools[k].race === race);
G.attunedSchools = (s, owner) => { const e = s.empires[owner]; return e ? [...new Set([...native(e.race), ...G.patronSchool(s, owner)])] : []; };
const bestTower = (s, owner) => Math.max(0, ...G.citiesOf(s, owner).map(c => G.lvl(c, 'magetower')));
const closure = (ids, known) => {
  const out = new Set(known);
  const visit = id => { const n = NODES[id]; if (!n || out.has(id)) return; for (const g of n.pre) if (!g.some(x => out.has(x))) visit(g.find(x => !NODES[x].excl) || g[0]); out.add(id); };
  for (const id of ids) visit(id);
  return [...out];
};
const grim = (s, owner) => {
  const e = s.empires[owner];
  if (!e) return null;
  if (!e.arcana) {
    e.arcana = { known: [], active: null, queue: [], queueWait: null, opened: [], mastery: {} };
    const seeds = DATA.arcanaOrder.filter(id => NODES[id].innate || (NODES[id].seed && native(e.race).includes(NODES[id].school)));
    let known = seeds;
    // an older save: what its towers could cast under the old rules is already in the book
    if (!s.arcanaV) {
      const t = bestTower(s, owner), att = G.attunedSchools(s, owner);
      const want = DATA.arcanaOrder.filter(id => { const n = NODES[id]; return n.kind === 'spell' && (!n.school || att.includes(n.school)) && DATA.circles[n.circle].tower <= t; });
      known = closure(want, seeds);
    }
    e.arcana.known = known;
  }
  const A = e.arcana;
  if (!A.known) A.known = []; if (!A.queue) A.queue = []; if (!A.opened) A.opened = []; if (!A.mastery) A.mastery = {};
  return A;
};
G.grimoire = grim;
G.knowsArcanum = (s, owner, id) => { const A = grim(s, owner); return !!A && A.known.includes(id); };
// learn a node at once (tests, events, debug); free: no cost and no checks beyond the node existing
G.learnArcanum = (s, owner, id, opts = {}) => {
  const A = grim(s, owner), n = NODES[id];
  if (!A || !n) return 'Unknown';
  if (A.known.includes(id)) return null;
  if (!opts.free) { const st = G.arcanaStatus(s, owner, id); if (!st.ok) return st.reason; }
  A.known = [...(opts.path ? closure([id], A.known) : A.known), id].filter((x, i, l) => l.indexOf(x) === i);
  if (A.queue.includes(id)) A.queue = A.queue.filter(x => x !== id);
  if (G.bumpEpoch) G.bumpEpoch();
  return null;
};

// ---------------------------------------------------------------------
// Aggregated lore effects (cached per realm on the known list) and the modifier source
// ---------------------------------------------------------------------
// the aggregate hangs on the known array itself (array properties are not saved by JSON)
const agg = A => {
  const list = A.known, hit = list._agg;
  if (hit && hit.n === list.length) return hit;
  const R = { n: list.length, fx: {}, add: {}, schoolPower: {}, schoolCost: {} };
  for (const id of list) {
    const n = NODES[id]; if (!n) continue;
    for (const [k, v] of Object.entries(n.fx || {})) R.fx[k] = (R.fx[k] ?? 1) * v;
    for (const [k, v] of Object.entries(n.add || {})) R.add[k] = (R.add[k] || 0) + v;
    if (n.schoolPower) R.schoolPower[n.school] = (R.schoolPower[n.school] || 1) * n.schoolPower;
    if (n.schoolCost) R.schoolCost[n.school] = (R.schoolCost[n.school] || 1) * n.schoolCost;
  }
  Object.defineProperty(list, '_agg', { value: R, writable: true, configurable: true, enumerable: false });
  return R;
};
const aggOf = (s, owner) => { const e = s.empires[owner]; return e && e.arcana ? agg(e.arcana) : null; };
G.arcanaAdd = (s, owner, key) => { const R = aggOf(s, owner); return (R && R.add[key]) || 0; };
G.modSources.push((s, owner, city, key) => {
  const e = s.empires[owner];
  let m = 1;
  if (e && e.arcana) { const R = agg(e.arcana); const v = R.fx[key]; if (v !== undefined) m *= v; }
  if (city && city.ench && city.ench.length) for (const x of city.ench) { const d = DATA.enchantments[x.id]; const v = d && d.fx && d.fx[key]; if (v) m *= v; }
  // Eternal Summer: winter's penalties lift
  if (e && e.summer > s.time && DATA.seasonFx && G.season(s).index === 3) {
    const f = DATA.seasonFx[3].fx[key];
    if (f) { const k = (DATA.seasonRace[e.race] || [1, 1, 1, 1])[3]; const eff = 1 + (f - 1) * k; if (eff > 0) m /= eff; }
  }
  return m;
});

// ---------------------------------------------------------------------
// Schools: attuned, opened (foreign), routes and the cap
// ---------------------------------------------------------------------
G.openedSchools = (s, owner) => { const A = grim(s, owner); return A ? A.opened.slice() : []; };
G.schoolsOf = (s, owner) => {
  if (!s.empires[owner]) return [];
  const att = G.attunedSchools(s, owner), A = grim(s, owner);
  return [...new Set([...att, ...A.opened])];
};
G.schoolAttuned = (s, owner, k) => G.attunedSchools(s, owner).includes(k);
G.schoolCap = (s, owner) => G.ARC.openBase + (G.hasTech && G.hasTech(s, owner, 'arcaneacad') ? 1 : 0) + ((s.empires[owner].traditions || []).includes('archmagi') ? 1 : 0);
G.foreignOpen = (s, owner) => { const att = G.attunedSchools(s, owner); return grim(s, owner).opened.filter(k => !att.includes(k)); };
// the ways a realm can reach a school it was not born to: [{ kind, text }]
G.schoolRoutes = (s, owner, k) => {
  const out = [];
  if (s.ley) {
    const n = G.nodesOf(s, owner).find(n => G.leySchool(n) === k);
    if (n) out.push({ kind: 'ley', text: `You hold a ley enclave of ${DATA.schools[k].name} at (${n.x}, ${n.y})` });
  }
  if (G.treatiesOf) for (const t of G.treatiesOf(s, owner)) {
    if (t.kind !== 'research' && t.kind !== 'alliance') continue;
    const other = t.a === owner ? t.b : t.a;
    if (!s.empires[other] || s.empires[other].dead) continue;
    if (G.schoolsOf(s, other).includes(k)) { out.push({ kind: 'treaty', text: `Your ${DATA.treatyKinds[t.kind].name.toLowerCase()} with the ${s.empires[other].name}, who know it` }); break; }
  }
  const c = G.citiesOf(s, owner).find(c => G.lvl(c, 'magetower') > 0 && c.towerSchool === k);
  if (c) out.push({ kind: 'tower', text: `${c.name} holds a Mage Tower of ${DATA.schools[k].name}` });
  return out;
};
G.openSchoolStatus = (s, owner, k) => {
  const sc = DATA.schools[k]; if (!sc) return { ok: false, reason: 'No such school' };
  const A = grim(s, owner);
  if (G.schoolAttuned(s, owner, k)) return { ok: false, attuned: true, reason: 'Attuned already' };
  if (A.opened.includes(k)) return { ok: false, open: true, reason: 'Open' };
  const fee = G.ARC.openFee(G.foreignOpen(s, owner).length);
  const routes = G.schoolRoutes(s, owner, k);
  if (!routes.length) return { ok: false, fee, routes, locked: true, reason: 'No route: hold one of its ley enclaves, sign a research pact or alliance with a realm that knows it, or hold a city with its Mage Tower' };
  if (G.foreignOpen(s, owner).length >= G.schoolCap(s, owner)) return { ok: false, fee, routes, capped: true, reason: `You keep ${G.schoolCap(s, owner)} foreign schools at most: close one first` };
  if (!G.citiesOf(s, owner).some(c => G.lvl(c, 'magetower') > 0)) return { ok: false, fee, routes, reason: 'Needs a Mage Tower' };
  if (G.manaOf(s, owner) < fee.mana) return { ok: false, fee, routes, poor: true, reason: 'Not enough mana' };
  if (s.empires[owner].gold < fee.gold) return { ok: false, fee, routes, poor: true, reason: 'Not enough gold' };
  return { ok: true, fee, routes };
};
G.openSchool = (s, owner, k) => {
  const st = G.openSchoolStatus(s, owner, k);
  if (!st.ok) return st.reason;
  const tower = G.citiesOf(s, owner).filter(c => G.lvl(c, 'magetower') > 0).sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'))[0];
  G.payMana(s, owner, tower, st.fee.mana); s.empires[owner].gold -= st.fee.gold;
  const A = grim(s, owner); A.opened = [...A.opened, k];
  G.log(s, owner, `${DATA.schools[k].icon} The realm opens the school of ${DATA.schools[k].name} (${st.routes[0].text.toLowerCase()}).`, 'good');
  return null;
};
// closing keeps what was learned, but its spells and enchantments cannot be cast or kept until it is reopened
G.closeSchool = (s, owner, k) => {
  const A = grim(s, owner);
  if (!A.opened.includes(k)) return 'Not an opened school';
  A.opened = A.opened.filter(x => x !== k);
  A.queue = A.queue.filter(id => NODES[id].school !== k);
  if (A.active && NODES[A.active.id].school === k) G.cancelStudy(s, owner);
  for (const c of G.citiesOf(s, owner)) for (const e of (c.ench || []).slice()) if (DATA.enchantments[e.id].school === k) G.dispelEnchantment(s, c.id, e.id, null);
  G.log(s, owner, `${DATA.schools[k].icon} The school of ${DATA.schools[k].name} is closed.`, 'info');
  return null;
};
const usable = (s, owner, k) => !k || G.schoolsOf(s, owner).includes(k);

// learned spells of usable schools (cached on the known list, opened list and patron)
const SPELLS = new WeakMap();
G.spellsOf = (s, owner) => {
  const A = grim(s, owner); if (!A) return [];
  const schools = G.schoolsOf(s, owner), sig = A.known.length + '|' + schools.join(',');
  const hit = SPELLS.get(A);
  if (hit && hit.sig === sig && hit.known === A.known) return hit.list;
  const list = [];
  for (const id of A.known) { const n = NODES[id]; if (n && (!n.school || schools.includes(n.school))) for (const sp of n.spells) if (DATA.spells[sp] && !list.includes(sp)) list.push(sp); }
  SPELLS.set(A, { sig, known: A.known, list });
  return list;
};
G.spellUnknownReason = (s, owner, id) => {
  const sp = DATA.spells[id];
  if (!sp) return 'Unknown spell';
  if (sp.school && !G.schoolsOf(s, owner).includes(sp.school)) return 'Not of your schools';
  return `Not learned: study ${NODES[SPELL_NODE[id]] ? NODES[SPELL_NODE[id]].name : 'it'} in the Grimoire`;
};

// ---------------------------------------------------------------------
// Study: cost, time, status, queue
// ---------------------------------------------------------------------
const hasTrad = (s, owner, t) => (s.empires[owner].traditions || []).includes(t);
G.arcanaCost = (s, owner, id) => {
  const n = NODES[id], C = G.ARC.cost;
  let m = 1 + C.tier * n.tier;
  if (n.school && !G.schoolAttuned(s, owner, n.school)) m *= C.foreign;
  if (n.trad && hasTrad(s, owner, n.trad)) m *= C.trad;
  if (n.techOff && G.hasTech && G.hasTech(s, owner, n.techOff)) m *= C.techOff;
  const out = { mana: Math.round(C.mana[n.circle] * m / 5) * 5, gold: Math.round(C.gold[n.circle] * m / 5) * 5 };
  if (n.circle >= 2) out.tools = Math.round((n.circle === 2 ? 20 : 40) * (1 + 0.5 * n.tier));
  if (n.circle >= 3) out.iron = Math.round(150 * (1 + 0.3 * n.tier));
  return out;
};
G.arcanaTime = (s, owner, id) => {
  const n = NODES[id];
  const towers = G.citiesOf(s, owner).reduce((a, c) => a + G.lvl(c, 'magetower'), 0);
  return Math.round(G.ARC.time[n.circle] * (1 + G.ARC.timeTier * n.tier) * paceT(s) * G.mod(s, owner, null, 'studyTime') / (1 + G.ARC.towerSpeed * towers) / (G.magiStudyBonus ? G.magiStudyBonus(s, owner) || 1 : 1));
};
const towerFor = (s, owner, circle) => G.citiesOf(s, owner).filter(c => G.lvl(c, 'magetower') >= DATA.circles[circle].tower).sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'));
const goodsPart = cost => { const o = {}; for (const [g, v] of Object.entries(cost)) if (g !== 'mana') o[g] = v; return o; };
const canPay = (s, owner, city, cost) => G.manaOf(s, owner) >= cost.mana && G.canAfford(s, city, goodsPart(cost));
G.arcanaStatus = (s, owner, id) => {
  const n = NODES[id], A = grim(s, owner);
  if (!n || !A) return { ok: false, hidden: true, reason: 'Unknown' };
  const cost = G.arcanaCost(s, owner, id), time = G.arcanaTime(s, owner, id);
  if (A.known.includes(id)) return { known: true, cost, time };
  if (A.active && A.active.id === id) return { active: true, cost, time };
  if (n.excl && A.known.includes(n.excl)) return { ok: false, forsaken: true, cost, time, reason: `Forsaken for ${NODES[n.excl].name}` };
  if (n.school && !usable(s, owner, n.school)) return { ok: false, closed: true, locked: true, cost, time, reason: `Open the school of ${DATA.schools[n.school].name} first` };
  const miss = n.pre.filter(g => !g.some(x => A.known.includes(x)));
  if (miss.length) return { ok: false, locked: true, missing: miss, cost, time, reason: 'Needs ' + miss.map(g => g.map(x => NODES[x].name).join(' or ')).join(' and ') };
  if (n.tech && G.hasTech && !G.hasTech(s, owner, n.tech)) return { ok: false, locked: true, tech: true, cost, time, reason: `Needs the research ${DATA.techs[n.tech].name}` };
  const C = DATA.circles[n.circle];
  const towers = towerFor(s, owner, n.circle);
  if (!towers.length) return { ok: false, locked: true, tower: true, cost, time, reason: `The ${C.name} circle needs a Mage Tower ${C.tower}` };
  if ((G.techEra ? G.techEra(s, owner) : 0) < C.era) return { ok: false, locked: true, era: true, cost, time, reason: `The ${C.name} circle needs the ${DATA.techEras[C.era].name} era` };
  if (A.active) return { ok: false, busy: true, cost, time, reason: 'Your magi are studying' };
  const city = towers.find(c => canPay(s, owner, c, cost));
  if (!city) return { ok: false, poor: true, cost, time, reason: G.manaOf(s, owner) < cost.mana ? 'Not enough mana' : 'Not enough goods' };
  return { ok: true, cost, time, city };
};
G.startStudy = (s, owner, id) => {
  const st = G.arcanaStatus(s, owner, id);
  if (!st.ok) return st.reason || 'Cannot study';
  G.payMana(s, owner, st.city, st.cost.mana);
  G.pay(s, st.city, goodsPart(st.cost));
  const A = grim(s, owner);
  A.active = { id, city: st.city.id, start: s.time, end: s.time + st.time, cost: st.cost };
  A.queue = A.queue.filter(q => q !== id);
  return null;
};
G.cancelStudy = (s, owner) => {
  const A = grim(s, owner);
  if (!A.active) return;
  const c = s.cities[A.active.city] && s.cities[A.active.city].owner === owner ? s.cities[A.active.city] : G.capital(s, owner);
  if (c) G.gain(s, c, A.active.cost, 0.5);
  A.active = null;
};
G.arcanaPath = (s, owner, id) => {
  const A = grim(s, owner), out = [], seen = {};
  const visit = k => {
    const n = NODES[k];
    if (!n || seen[k] || A.known.includes(k) || (A.active && A.active.id === k)) return;
    seen[k] = true;
    for (const g of n.pre) if (!g.some(x => A.known.includes(x) || (A.active && A.active.id === x) || out.includes(x))) {
      // pick the cheapest branch of an either-or group that is not forsaken
      const cand = g.filter(x => !(NODES[x].excl && (A.known.includes(NODES[x].excl) || out.includes(NODES[x].excl))));
      visit((cand.length ? cand : g).sort((a, b) => NODES[a].col - NODES[b].col)[0]);
    }
    out.push(k);
  };
  visit(id);
  return out;
};
const queueCheck = (s, owner, id) => {
  const n = NODES[id], A = grim(s, owner);
  if (!n) return 'Unknown';
  if (A.known.includes(id)) return 'Already learned';
  if (A.active && A.active.id === id) return 'Already being studied';
  if (A.queue.includes(id)) return 'Already queued';
  if (n.excl && (A.known.includes(n.excl) || A.queue.includes(n.excl) || (A.active && A.active.id === n.excl))) return `Forsaken for ${NODES[n.excl].name}`;
  if (n.school && !usable(s, owner, n.school)) return `Open the school of ${DATA.schools[n.school].name} first`;
  return null;
};
// one topic whose prerequisites are known, studied or queued
G.queueStudy = (s, owner, id) => {
  const err = queueCheck(s, owner, id); if (err) return err;
  const A = grim(s, owner);
  const miss = NODES[id].pre.filter(g => !g.some(x => A.known.includes(x) || A.queue.includes(x) || (A.active && A.active.id === x)));
  if (miss.length) return `Needs ${miss.map(g => g.map(x => NODES[x].name).join(' or ')).join(' and ')} first (plan the path to queue them too)`;
  A.queue.push(id);
  G.processStudyQueue(s, owner);
  return null;
};
// the topic and every missing prerequisite, in order
G.planStudy = (s, owner, id) => {
  const err = queueCheck(s, owner, id); if (err) return err;
  const A = grim(s, owner);
  const path = G.arcanaPath(s, owner, id).filter(k => !A.queue.includes(k));
  const bad = path.map(k => queueCheck(s, owner, k)).find(Boolean);
  if (bad) return bad;
  A.queue.push(...path);
  G.processStudyQueue(s, owner);
  return null;
};
G.unqueueStudy = (s, owner, id) => {
  const A = grim(s, owner);
  const drop = new Set([id]);
  for (const k of A.queue) if (NODES[k].pre.some(g => g.every(x => drop.has(x) || !(A.known.includes(x) || A.queue.includes(x))) && g.some(x => drop.has(x)))) drop.add(k);
  A.queue = A.queue.filter(k => !drop.has(k));
  if (A.queueWait && drop.has(A.queueWait.id)) A.queueWait = null;
};
G.moveStudy = (s, owner, id, delta) => {
  const q = grim(s, owner).queue, i = q.indexOf(id), j = i + (delta < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= q.length) return 'Cannot move';
  const first = q[Math.min(i, j)], second = q[Math.max(i, j)];
  if (NODES[second].pre.some(g => g.includes(first))) return `${NODES[second].name} needs ${NODES[first].name}`;
  q[i] = q[j]; q[j] = id;
  return null;
};
G.processStudyQueue = (s, owner) => {
  const A = grim(s, owner);
  if (A.active || !A.queue.length) { if (!A.queue.length) A.queueWait = null; return; }
  A.queue = A.queue.filter(k => NODES[k] && !A.known.includes(k) && !(NODES[k].excl && A.known.includes(NODES[k].excl)));
  let wait = null;
  for (const k of A.queue) {
    const st = G.arcanaStatus(s, owner, k);
    if (st.ok) { G.startStudy(s, owner, k); A.queueWait = null; if (owner === 'p') G.log(s, owner, `📖 From the queue, your magi begin ${NODES[k].icon} ${NODES[k].name}.`); return; }
    if (st.missing && st.missing.every(g => g.some(x => A.queue.includes(x)))) continue;
    wait = wait || { id: k, reason: st.reason || 'Waiting' };
  }
  A.queueWait = wait;
};
G.studyQueueNote = (s, owner) => { const w = grim(s, owner).queueWait; return w && NODES[w.id] ? `${NODES[w.id].name}: ${w.reason.toLowerCase()}` : ''; };
const finish = (s, e) => {
  const A = e.arcana, n = NODES[A.active.id];
  A.known = [...A.known, A.active.id];
  A.active = null;
  if (G.bumpEpoch) G.bumpEpoch();
  if (n) {
    G.log(s, e.id, `📖 The Grimoire grows: ${n.icon} ${n.name}. ${G.arcanaFxText(n.id)}`, 'good');
    if (n.excl && NODES[n.excl]) G.log(s, e.id, `${NODES[n.excl].icon} ${NODES[n.excl].name} is forsaken.`, 'info');
  }
  if (A.queue.length) G.processStudyQueue(s, e.id);
};
G.stepHooks.push(s => {
  for (const e of Object.values(s.empires)) { const A = e.arcana; if (A && A.active && A.active.end <= s.time) finish(s, e); }
});

// ---------------------------------------------------------------------
// Mastery, school lore, the stars: cost, power and cooldown of a spell
// ---------------------------------------------------------------------
G.spellMastery = (s, owner, id) => {
  const e = s.empires[owner]; const n = e && e.arcana && e.arcana.mastery[id] || 0;
  return G.ARC.mastery.filter(x => n >= x).length;
};
G.masteryProgress = (s, owner, id) => { const e = s.empires[owner]; const n = (e && e.arcana && e.arcana.mastery[id]) || 0; const r = G.spellMastery(s, owner, id); return { casts: n, rank: r, next: G.ARC.mastery[r] || null }; };
G.noteMastery = (s, owner, id) => {
  const A = grim(s, owner); if (!A) return 0;
  const before = G.spellMastery(s, owner, id);
  A.mastery[id] = (A.mastery[id] || 0) + 1;
  const after = G.spellMastery(s, owner, id);
  return after > before ? after : 0;
};
G.conjunction = s => {
  const C = G.ARC.star, P = C.period * 60 * paceT(s), k = Math.floor(s.time / P);
  const at = i => {
    const start = i * P + 0.4 * P, end = start + C.len * 60 * paceT(s);
    const school = DATA.schoolOrder[(Math.imul(i + 7, 2654435761) >>> 0) % DATA.schoolOrder.length];
    return { k: i, school, start, end };
  };
  const cur = at(k), nxt = s.time >= cur.end ? at(k + 1) : cur;
  const active = s.time >= cur.start && s.time < cur.end;
  return { active: active ? cur : null, next: active ? at(k + 1) : nxt };
};
const starOn = (s, school) => { if (!school) return false; const c = G.conjunction(s).active; return !!c && c.school === school; };
G.arcCostMult = (s, owner, id) => {
  const sp = DATA.spells[id], R = aggOf(s, owner);
  let m = 1 - G.ARC.masteryCost * G.spellMastery(s, owner, id);
  if (R && sp.school && R.schoolCost[sp.school]) m *= R.schoolCost[sp.school];
  if (starOn(s, sp.school)) m *= G.ARC.star.cost;
  return m;
};
G.arcPowerMult = (s, owner, id) => {
  const sp = DATA.spells[id], R = aggOf(s, owner);
  let m = 1 + G.ARC.masteryPower * G.spellMastery(s, owner, id);
  if (R && sp.school && R.schoolPower[sp.school]) m *= R.schoolPower[sp.school];
  if (starOn(s, sp.school)) m *= G.ARC.star.power;
  return m;
};
G.arcCoolMult = (s, owner, id) => 1 - G.ARC.masteryCool * G.spellMastery(s, owner, id);

// metamagic: the known, applicable ones among those asked for
G.metaKnown = (s, owner) => { const A = grim(s, owner); return DATA.metaOrder.filter(k => A && A.known.includes(META_NODE[k])); };
G.metaFits = (id, k) => { const sp = DATA.spells[id]; if (k === 'twin') return sp.target === 'city' || sp.target === 'enemy'; if (k === 'extend') return !!(sp.fx && sp.fx.length) || ['manaward', 'thornwall', 'eternalsummer', 'ironwarden', 'deathless', 'stormlord', 'veilmist', 'wildcall'].includes(id); return true; };
G.castMetas = (s, owner, id, meta) => {
  if (!meta) return [];
  const list = Array.isArray(meta) ? meta : typeof meta === 'string' ? meta.split(',') : Object.keys(meta).filter(k => meta[k]);
  const known = G.metaKnown(s, owner);
  return DATA.metaOrder.filter(k => list.includes(k) && known.includes(k) && G.metaFits(id, k));
};
G.metaMults = metas => {
  const r = { cost: 1, power: 1, dur: 1, cool: 1, strain: 1 };
  for (const k of metas) { const d = DATA.metamagic[k]; for (const f of Object.keys(r)) if (d[f]) r[f] *= d[f]; }
  return r;
};

// ---------------------------------------------------------------------
// Enchantments
// ---------------------------------------------------------------------
G.hasEnchantment = (city, id) => !!(city && city.ench && city.ench.some(e => e.id === id));
G.enchantSlots = (s, city) => { const L = G.lvl(city, 'magetower'); return L > 0 ? 1 + Math.floor(L / 5) + G.arcanaAdd(s, city.owner, 'enchSlots') : 0; };
G.enchantmentsKnown = (s, owner) => {
  const A = grim(s, owner); if (!A) return [];
  return DATA.enchantOrder.filter(k => A.known.includes(ENCH_NODE[k]) && usable(s, owner, DATA.enchantments[k].school));
};
const upkeepOf = (s, city, id) => {
  const d = DATA.enchantments[id];
  return d.upkeep * G.mod(s, city.owner, null, 'enchUpkeep') * (starOn(s, d.school) ? G.ARC.star.upkeep : 1) * G.pace(s).prod;
};
G.enchantUpkeepParts = (s, city) => (city.ench || []).map(e => ({ id: e.id, name: DATA.enchantments[e.id].name, amount: upkeepOf(s, city, e.id) }));
G.enchantUpkeep = (s, city) => (city.ench || []).reduce((a, e) => a + upkeepOf(s, city, e.id), 0);
G.enchantCost = (s, owner, id) => ({ mana: Math.round(G.ARC.enchPlace * enchUp(id) * (starOn(s, DATA.enchantments[id].school) ? 0.5 : 1)) });
G.enchantStatus = (s, owner, cityId, id) => {
  const city = s.cities[cityId], d = DATA.enchantments[id];
  if (!d || !city) return { ok: false, reason: 'Unknown' };
  const cost = G.enchantCost(s, owner, id);
  if (city.owner !== owner) return { ok: false, cost, reason: 'Not your city' };
  if (!G.enchantmentsKnown(s, owner).includes(id)) return { ok: false, cost, locked: true, reason: 'Not learned' };
  if (G.hasEnchantment(city, id)) return { ok: false, cost, have: true, reason: 'Already enchanted' };
  const slots = G.enchantSlots(s, city);
  if (!slots) return { ok: false, cost, reason: 'Needs a Mage Tower here' };
  if ((city.ench || []).length >= slots) return { ok: false, cost, full: true, reason: `All ${slots} slot${slots > 1 ? 's' : ''} in use` };
  if (G.manaOf(s, owner) < cost.mana) return { ok: false, cost, poor: true, reason: 'Not enough mana' };
  return { ok: true, cost };
};
G.enchantCity = (s, owner, cityId, id) => {
  const st = G.enchantStatus(s, owner, cityId, id);
  if (!st.ok) return st.reason;
  const city = s.cities[cityId];
  G.payMana(s, owner, city, st.cost.mana);
  city.ench = [...(city.ench || []), { id, by: owner, t: s.time }];
  if (G.bumpEpoch) G.bumpEpoch();
  if (owner === 'p') G.log(s, 'p', `${DATA.enchantments[id].icon} ${city.name} is enchanted: ${DATA.enchantments[id].name}.`, 'good');
  return null;
};
G.dispelEnchantment = (s, cityId, id, by) => {
  const city = s.cities[cityId];
  if (!city || !G.hasEnchantment(city, id)) return 'Not there';
  city.ench = city.ench.filter(e => e.id !== id);
  if (G.bumpEpoch) G.bumpEpoch();
  const d = DATA.enchantments[id];
  if (by && by !== city.owner) G.log(s, city.owner, `${d.icon} ${d.name} over ${city.name} was dispelled${s.empires[by] ? ' by the ' + s.empires[by].name : ''}!`, 'bad');
  return null;
};
G.enchantmentsOf = (s, city) => (city && city.ench || []).map(e => {
  const d = DATA.enchantments[e.id] || {};
  return { id: e.id, name: d.name, icon: d.icon, school: d.school || null, color: d.school && DATA.schools[d.school] ? DATA.schools[d.school].color : NEUTRAL };
});

// ---------------------------------------------------------------------
// Slow upkeep: lapses, towers' schools, Ossuary Watch, Storm Lord, the stars, old saves
// ---------------------------------------------------------------------
G.slowHooks.push((s, dtMin) => {
  if (!s.arcanaV) { for (const id of Object.keys(s.empires)) grim(s, id); s.arcanaV = 1; }
  ensureSpyHook();
  for (const c of Object.values(s.cities)) {
    if (!c.towerSchool && G.lvl(c, 'magetower') > 0 && s.empires[c.owner]) c.towerSchool = native(s.empires[c.owner].race)[0] || null;
    if (!c.ench || !c.ench.length) continue;
    // conquest, a lowered tower, a closed school or an empty mana store break enchantments
    let changed = false;
    const keep = c.ench.filter(e => { const d = DATA.enchantments[e.id]; return d && e.by === c.owner && usable(s, c.owner, d.school); });
    if (keep.length !== c.ench.length) { if (s.empires[c.owner] && c.owner === 'p') G.log(s, 'p', `✨ The old enchantments of ${c.name} unravel.`, 'info'); c.ench = keep; changed = true; }
    const slots = G.enchantSlots(s, c);
    if (c.ench.length > slots) { c.ench = c.ench.slice(0, slots); changed = true; if (c.owner === 'p') G.log(s, 'p', `✨ ${c.name} cannot hold so many enchantments: the newest fade.`, 'bad'); }
    if (c.ench.length && (c.res.mana || 0) < 1 && (G.econ(s, c).net.mana || 0) < 0) {
      const e = c.ench.slice().sort((a, b) => enchUp(b.id) - enchUp(a.id))[0];
      c.ench = c.ench.filter(x => x !== e); changed = true;
      G.log(s, c.owner, `${DATA.enchantments[e.id].icon} ${DATA.enchantments[e.id].name} over ${c.name} fades: no mana to feed it.`, 'bad');
    }
    if (changed && G.bumpEpoch) G.bumpEpoch();
    if (G.hasEnchantment(c, 'gravewatch')) {
      c.gwClock = (c.gwClock || 0) + dtMin;
      if (c.gwClock >= 5 * paceT(s)) { c.gwClock = 0; const cap = 8 + 2 * G.lvl(c, 'magetower'); if ((c.units.risen || 0) < cap) c.units.risen = Math.min(cap, (c.units.risen || 0) + 2); }
    }
  }
  // Storm Lord
  for (const e of Object.values(s.empires)) {
    const L = e.stormlord;
    if (!L || L.until <= s.time || L.next > s.time) continue;
    L.next = s.time + pmin(s, 5);
    const towers = G.citiesOf(s, e.id).filter(c => G.lvl(c, 'magetower') > 0);
    const foes = Object.values(s.cities).filter(c => c.owner !== e.id && towers.some(t => Math.hypot(t.x - c.x, t.y - c.y) <= 14) && (e.id === 'p' ? G.rel && G.rel(s, c.owner).status === 'war' : c.owner === 'p' ? G.rel && G.rel(s, e.id).status === 'war' : G.hostility(s, e.id, c.owner) >= 1.2));
    const t = foes.length ? G.pick(foes) : null;
    if (!t) continue;
    const lost = cull(t.units, 0.04 * (L.P || 1));
    if (Math.random() < 0.3) { const b = G.pick(Object.keys(t.buildings).filter(k => t.buildings[k] > 1 && !DATA.buildings[k].wonder)); if (b) t.buildings[b]--; }
    for (const h of G.hostileHooks) h(s, e.id, t.owner, 'raid');
    if (e.id === 'p' || t.owner === 'p') G.report(s, [e.id, t.owner], `⛈️ The Storm Lord struck ${t.name}`, e.id === 'p' ? 'win' : 'loss', { extra: `Losses: ${lostText(lost)}.` });
  }
  // the celestial calendar: announce a conjunction ahead, and when it rises
  const M = G.magicState(s), cj = G.conjunction(s);
  const nx = cj.next, lead = G.ARC.star.lead * 60 * paceT(s);
  if (!cj.active && nx.start - s.time <= lead && M.starNoted !== nx.k) {
    M.starNoted = nx.k;
    const sc = DATA.schools[nx.school], se = G.season ? G.season({ ...s, time: nx.start }) : null;
    G.report(s, ['p'], `🌌 ${sc.star[0].toUpperCase() + sc.star.slice(1)} rises in ${Math.max(1, Math.round((nx.start - s.time) / 60 / paceT(s)))} min`, 'info',
      { extra: `A ${se ? se.name.toLowerCase() + ' ' : ''}conjunction: for ${G.ARC.star.len} minutes ${sc.icon} ${sc.name} spells are ${Math.round((G.ARC.star.power - 1) * 100)}% stronger and ${Math.round((1 - G.ARC.star.cost) * 100)}% cheaper, and its enchantments cost half the upkeep.` });
    G.log(s, 'p', `🌌 Astrologers foretell ${sc.star}: ${sc.icon} ${sc.name} magic will surge soon.`, 'info');
  }
  if (cj.active && M.starRisen !== cj.active.k) { M.starRisen = cj.active.k; const sc = DATA.schools[cj.active.school]; G.log(s, 'p', `🌌 ${sc.star[0].toUpperCase() + sc.star.slice(1)} is in the sky: ${sc.icon} ${sc.name} spells surge.`, 'good'); }
});

// thorns (Thornwall, Storm Spire) and the Deathless Host
G.battleHooks.push((s, ctx) => {
  const r = ctx.r;
  if (ctx.site === 'city' && ctx.city && ctx.defOwner === ctx.city.owner && r.attLeft) {
    const c = ctx.city;
    let pct = (c.thorns && c.thorns.until > s.time ? c.thorns.pct : 0);
    if (G.hasEnchantment(c, 'stormspire')) pct += DATA.enchantments.stormspire.thorns;
    if (pct > 0) cull(r.attLeft, pct);
  }
  const rise = (owner, lost, at) => {
    const e = owner && s.empires[owner];
    if (!e || !(e.deathless > s.time) || !lost) return;
    const n = Object.entries(lost).reduce((a, [u, k]) => a + (DATA.units[u] && DATA.units[u].at ? k : 0), 0);
    const k = Math.round(n * 0.3);
    const city = at && at.owner === owner ? at : G.capital(s, owner);
    if (k > 0 && city) { city.units.risen = (city.units.risen || 0) + k; if (owner === 'p') G.log(s, 'p', `⚰️ ${k} of the fallen rise again in ${city.name}.`, 'good'); }
  };
  rise(ctx.m && ctx.m.owner, r.attLost, ctx.m && s.cities[ctx.m.from]);
  rise(ctx.defOwner, r.defLost, ctx.city);
});

// agents: a successful mana siphon also unravels one enchantment of the city (espionage.js loads later)
let spyWrapped = false;
const ensureSpyHook = () => {
  if (spyWrapped || typeof G.resolveMission !== 'function') return;
  spyWrapped = true;
  const orig = G.resolveMission;
  G.resolveMission = (s, spy, opts) => {
    const task = spy && spy.task, target = task && s.cities[task.target];
    const r = orig(s, spy, opts);
    if (task && task.type === 'mana' && task.result === 'success' && target && target.ench && target.ench.length && target.owner !== spy.owner) {
      const e = target.ench[target.ench.length - 1];
      G.dispelEnchantment(s, target.id, e.id, spy.owner);
      if (spy.owner === 'p') G.log(s, 'p', `🕵️ Your spy also unravelled ${DATA.enchantments[e.id].name} over ${target.name}.`, 'good');
    }
    return r;
  };
};

// ---------------------------------------------------------------------
// AI: study, open schools, keep enchantments
// ---------------------------------------------------------------------
const KIND_W = { spell: 1.6, lore: 1.1, ench: 1.8, meta: 0.6 };
G.aiStudyPick = (s, emp) => {
  const A = grim(s, emp.id);
  const opts = [];
  // cheap filters first: circle reachable, school usable, prerequisites known, fork free
  const tower = bestTower(s, emp.id), era = G.techEra ? G.techEra(s, emp.id) : 0, schools = G.schoolsOf(s, emp.id);
  const known = new Set(A.known);
  for (const id of DATA.arcanaOrder) {
    const n = NODES[id], C = DATA.circles[n.circle];
    if (known.has(id) || C.tower > tower || C.era > era || (n.school && !schools.includes(n.school)) || (n.excl && known.has(n.excl))) continue;
    if (!n.pre.every(g => g.some(x => known.has(x)))) continue;
    const st = G.arcanaStatus(s, emp.id, id);
    if (!st.ok) continue;
    if (G.manaOf(s, emp.id) < st.cost.mana * 1.4 || emp.gold < st.cost.gold * 1.3) continue;
    let w = (KIND_W[n.kind] || 1) / (1 + 0.25 * n.col);
    if (n.school && G.schoolAttuned(s, emp.id, n.school)) w *= 1.5;
    if (n.kind === 'spell' && n.spells.some(k => DATA.spells[k].ai === 'strike')) w *= 0.6 + (emp.aggr ?? 0.5);
    opts.push({ id, w });
  }
  if (!opts.length) return null;
  let r = Math.random() * opts.reduce((a, o) => a + o.w, 0);
  for (const o of opts) { r -= o.w; if (r <= 0) return o.id; }
  return opts[opts.length - 1].id;
};
const ENCH_PREF = { hearthblessing: 1.2, evergrove: 1.1, tidecaller: 1, wardstones: 1, emberforge: 0.9, veiledcity: 0.8, gravewatch: 1, stormspire: 1, aegis: 0.7, arcaneeye: 0.8 };
G.aiHooks.push((s, emp) => {
  if (Math.random() > 0.2) return;
  const towers = G.citiesOf(s, emp.id).filter(c => G.lvl(c, 'magetower') > 0);
  if (!towers.length) return;
  const A = grim(s, emp.id);
  // study
  if (!A.active && !emp.saving) { const id = G.aiStudyPick(s, emp); if (id) G.startStudy(s, emp.id, id); }
  // open a foreign school now and then, when rich in mana
  if (Math.random() < 0.08 && G.foreignOpen(s, emp.id).length < G.schoolCap(s, emp.id)) {
    const cand = DATA.schoolOrder.filter(k => !G.schoolsOf(s, emp.id).includes(k));
    const k = cand.find(k => { const st = G.openSchoolStatus(s, emp.id, k); return st.ok && G.manaOf(s, emp.id) > st.fee.mana * 2.5 && emp.gold > st.fee.gold * 2.5; });
    if (k) G.openSchool(s, emp.id, k);
  }
  // keep an enchantment where the tower can feed it
  const known = G.enchantmentsKnown(s, emp.id);
  if (known.length && Math.random() < 0.5) {
    for (const c of towers) {
      if ((c.ench || []).length >= G.enchantSlots(s, c)) continue;
      const net = G.econ(s, c).net.mana || 0;
      const pick = known.filter(k => !G.hasEnchantment(c, k) && net > enchUp(k) * 2.5 && G.enchantStatus(s, emp.id, c.id, k).ok && G.manaOf(s, emp.id) > G.enchantCost(s, emp.id, k).mana * 2)
        .sort((a, b) => (ENCH_PREF[b] || 1) - (ENCH_PREF[a] || 1))[0];
      if (pick) { G.enchantCity(s, emp.id, c.id, pick); break; }
    }
  }
});

G.newGameHooks.push(s => { s.arcanaV = 1; for (const id of Object.keys(s.empires)) grim(s, id); ensureSpyHook(); });
})();
