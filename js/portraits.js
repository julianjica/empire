// =====================================================================
//  Portraits: procedural, layered SVG portraits for troops, heroes,
//  advisors, governors, spies, rulers and tale characters.
//
//  CONTRACT (shared by portraits.js, portrait-gear.js and every UI caller)
//  ---------------------------------------------------------------------
//  G.portrait(spec, size = 64) -> '<svg …>…</svg>' string (pure, deterministic,
//      no DOM access, safe in node). Same spec => same picture.
//  G.portraitHtml(spec, size, extraClass) -> '<span class="pt pt-…">svg</span>'
//
//  spec = {
//    race:   'hearth' | 'delver' | 'sylvan' | 'ash' | 'tide' | 'veil' | 'grave' | 'wind'
//    kind:   'unit' | 'hero' | 'advisor' | 'governor' | 'spy' | 'ruler' | 'citizen' | 'monster'
//    unit:   unit key (kind 'unit'), e.g. 'pikeman' — role via G.roleOf(unit), name via DATA.units
//    role:   override role: infantry | cavalry | ranged | siege | flyer | ship | mage | support
//            (advisors: steward | marshal | spymaster | priest | archmage)
//    seed:   string or number — picks variation (face, hair, scars) deterministically
//    color:  realm colour (hex) for cloth trim / emblem / banner
//    rank:   0..10 (forge level / hero level band) — frame trim bronze → silver → gold
//    gear:   optional { helm, weapon, armor, trinket } item names/icons (heroes)
//    wounded: 0..1 (heroes: bandages/scars), dead: bool (greyed, crossed)
//    female: optional bool (else from seed)
//  }
//
//  Layer pipeline (back to front). Each layer is fn(ctx) -> svg fragment string:
//    background, frame-back, body, mount, head, face, hair, headgear, gear, front, frame
//  PORTRAIT.layers[name] = [fn, …]  — modules push layer functions; fns return '' to skip.
//  ctx = { spec, size, race, role, rnd (seeded PRNG 0..1), pal (palette), id (unique svg id prefix),
//          V: 100 (viewBox units: everything is drawn in a 0..100 box) }
//  PORTRAIT.palette[race] = { skin:[…], hair:[…], cloth:[…], metal, ink, bg:[a,b], accent, eye }
//
//  Art direction: inked parchment woodcut with a watercolour wash, matching the
//  world map — dark sepia ink outlines (#2b1d12), limited palette per people,
//  bust/three-quarter framing, strong silhouettes readable at 32px, a round-cornered
//  shield-like frame. Each people instantly recognisable by silhouette.
// =====================================================================
'use strict';
const PORTRAIT = { layers: {}, palette: {}, ORDER: ['background', 'frameBack', 'body', 'mount', 'head', 'face', 'hair', 'headgear', 'gear', 'front', 'frame'] };
for (const k of PORTRAIT.ORDER) PORTRAIT.layers[k] = [];

(() => {
  const hash = str => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const prng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  let uid = 0;
  const roleOf = spec => spec.role || (spec.unit && typeof G !== 'undefined' && G.roleOf ? G.roleOf(spec.unit) : 'infantry');
  const cache = new Map();

  G.portrait = (spec, size = 64) => {
    spec = spec || {};
    const key = JSON.stringify(spec) + '|' + size;
    if (cache.has(key)) return cache.get(key);
    const race = spec.race || 'hearth';
    const role = roleOf(spec);
    const seedStr = [race, spec.kind || 'unit', spec.unit || '', role, spec.seed ?? ''].join(':');
    const ctx = { spec, size, race, role, rnd: prng(hash(seedStr)), pal: PORTRAIT.palette[race] || PORTRAIT.palette.hearth || {}, id: 'pt' + (++uid).toString(36), V: 100 };
    let body = '';
    for (const layer of PORTRAIT.ORDER) for (const fn of PORTRAIT.layers[layer]) { try { body += fn(ctx) || ''; } catch (e) { if (typeof console !== 'undefined') console.error('portrait layer', layer, e); } }
    if (!body) body = `<rect x="4" y="4" width="92" height="92" rx="14" fill="#e8d9b5" stroke="#2b1d12" stroke-width="3"/><text x="50" y="62" font-size="40" text-anchor="middle">${(spec.unit && DATA.units[spec.unit] && DATA.units[spec.unit].icon) || '?'}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${(spec.unit && DATA.units[spec.unit] ? DATA.units[spec.unit].name : spec.kind || 'portrait').replace(/"/g, '')}">${body}</svg>`;
    if (cache.size > 600) cache.clear();
    cache.set(key, svg);
    return svg;
  };
  G.portraitHtml = (spec, size = 64, cls = '') => `<span class="pt pt-${(spec && spec.kind) || 'unit'} ${cls}" style="width:${size}px;height:${size}px">${G.portrait(spec, size)}</span>`;
  PORTRAIT.hash = hash; PORTRAIT.prng = prng;
})();
