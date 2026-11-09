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
//    era:    0..3 technology level from research (0 early … 3 masterwork; missing = 0). Gear draws most era
//            differences (armour, weapons, helmets); people layers enrich clothing: rough homespun with patches
//            at era 0 → dyed cloth, embroidered trim (era 2) and jewelled brooches (era 3). ctx.era is clamped.
//  }
//
//  Layer pipeline (back to front). Each layer is fn(ctx) -> svg fragment string:
//    background, frame-back, body, mount, head, face, hair, headgear, gear, front, frame
//  PORTRAIT.layers[name] = [fn, …]  — modules push layer functions; fns return '' to skip.
//  ctx = { spec, size, race, kind, role, rnd (seeded PRNG 0..1), pal (palette), id (svg id prefix, derived
//          from the spec+size hash: unique per distinct portrait, identical for identical ones),
//          V: 100 (viewBox units: everything is drawn in a 0..100 box),
//          anat (= PORTRAIT.anatomy[race], see below), look (all per-person variation, pre-rolled before any
//          layer runs so ctx.rnd use by gear never changes the face), female, skin, hairCol,
//          skipPeople (true for kind 'monster' and roles 'ship'/'siege': people layers draw nothing then,
//          the background still does), grain ('filter="url(#id-g)"' paper-grain attribute, '' when size < 48),
//          hideHair / hideEars (false; gear may set them true from a 'frameBack' fn — see ANATOMY) }
//  G.portrait itself emits <defs> with the grain filter, lays a grain overlay just before the 'frame' layer,
//  and wraps everything in a desaturating group when spec.dead. The root <svg> sets stroke-linejoin/linecap round.
//  Drawing helpers for any layer: PORTRAIT.draw (see js/portrait-people.js): n, path, mix, grad …
//  PORTRAIT.palette[race] = { skin:[…], hair:[…], cloth:[…], metal, ink, bg:[a,b], accent, eye }
//
//  Art direction: inked parchment woodcut with a watercolour wash, matching the
//  world map — dark sepia ink outlines (#2b1d12), limited palette per people,
//  bust/three-quarter framing, strong silhouettes readable at 32px, a round-cornered
//  shield-like frame. Each people instantly recognisable by silhouette.
// =====================================================================
'use strict';
const PORTRAIT = { layers: {}, palette: {}, anatomy: {}, ORDER: ['background', 'frameBack', 'body', 'mount', 'head', 'face', 'hair', 'headgear', 'gear', 'front', 'frame'] };
for (const k of PORTRAIT.ORDER) PORTRAIT.layers[k] = [];
// ---- ANATOMY ANCHORS (0..100 units) — gear layers place helmets/hoods/weapons on these.
//  head {cx,cy,rx,ry} skull ellipse · crown = top of skull · brow = eyebrow line · chin = bottom of jaw
//  ears = ear tips (null = no external ears) · shoulders {y,left,right} · neck {x,y,w} (y = neck base / collar)
//  ctx.anat = PORTRAIT.anatomy[ctx.race]. Gear layers may set ctx.hideHair = true (helmet covers the hair:
//  only a fringe at the neck/beard is drawn) and ctx.hideEars = true (ears/fins hidden) from a 'frameBack'
//  layer fn — those run before body/head/hair. ctx.female (bool) and ctx.skin/ctx.hairCol are set before layers.
//  Protrusions (optional, for helmets to dodge): horns (ash: horn tips — still drawn under a helmet, so leave
//  holes or draw the helmet between them; tips vary per person by about ±2 x and up to +5 y; horn bases at
//  x = cx ± (rx - 3), y = crown + 4..10), fins (tide: fin-ear tips, hidden by hideEars), antennae (veil:
//  antenna tips, hidden by hideHair), crest (wind: crest-feather tips, hidden by hideHair).
//  Spies: the people layer draws the spy's own hooded cloak (hood behind the head + rim over the hair);
//  gear should not add another hood for kind 'spy'. Gravebound may also get a tattered hood (look.hood) for
//  non-troop kinds — when ctx.hideHair is set that hood is skipped too.
PORTRAIT.anatomy = {
  hearth: { head: { cx: 50, cy: 44, rx: 17, ry: 17 }, crown: 27, brow: 41, chin: 61, ears: [{ x: 32, y: 46 }, { x: 68, y: 46 }], shoulders: { y: 74, left: 16, right: 84 }, neck: { x: 50, y: 64, w: 14 } },
  delver: { head: { cx: 50, cy: 45, rx: 19, ry: 16 }, crown: 29, brow: 42, chin: 61, ears: [{ x: 30, y: 46 }, { x: 70, y: 46 }], shoulders: { y: 71, left: 10, right: 90 }, neck: { x: 50, y: 62, w: 22 } },
  sylvan: { head: { cx: 50, cy: 41, rx: 14, ry: 18 }, crown: 23, brow: 38, chin: 59, ears: [{ x: 25, y: 30 }, { x: 75, y: 30 }], shoulders: { y: 75, left: 20, right: 80 }, neck: { x: 50, y: 62, w: 11 } },
  ash:    { head: { cx: 50, cy: 43, rx: 17, ry: 18 }, crown: 25, brow: 39, chin: 61, ears: [{ x: 31, y: 43 }, { x: 69, y: 43 }], horns: [{ x: 24, y: 14 }, { x: 76, y: 14 }], shoulders: { y: 73, left: 12, right: 88 }, neck: { x: 50, y: 64, w: 17 } },
  tide:   { head: { cx: 50, cy: 42, rx: 16, ry: 18 }, crown: 24, brow: 39, chin: 60, ears: [{ x: 28, y: 38 }, { x: 72, y: 38 }], fins: [{ x: 26, y: 34 }, { x: 74, y: 34 }], shoulders: { y: 74, left: 16, right: 84 }, neck: { x: 50, y: 63, w: 14 } },
  veil:   { head: { cx: 50, cy: 41, rx: 14, ry: 18 }, crown: 23, brow: 38, chin: 58, ears: [{ x: 31, y: 37 }, { x: 69, y: 37 }], antennae: [{ x: 34, y: 10 }, { x: 66, y: 10 }], shoulders: { y: 75, left: 21, right: 79 }, neck: { x: 50, y: 61, w: 10 } },
  grave:  { head: { cx: 50, cy: 42, rx: 15, ry: 17 }, crown: 25, brow: 39, chin: 59, ears: null, shoulders: { y: 74, left: 17, right: 83 }, neck: { x: 50, y: 62, w: 10 } },
  wind:   { head: { cx: 50, cy: 42, rx: 15, ry: 17 }, crown: 25, brow: 38, chin: 59, ears: null, crest: [{ x: 66, y: 14 }, { x: 72, y: 20 }], shoulders: { y: 74, left: 19, right: 81 }, neck: { x: 50, y: 62, w: 12 } },
};


// ---- PALETTES. skin/hair/cloth are arrays (seed picks one); single colours otherwise.
//  hearth wheat, delver gears, sylvan leaves, ash embers, tide waves, veil moon, grave candles, wind clouds (motif)
PORTRAIT.palette = {
  hearth: { skin: ['#f2c9a0', '#e9b68c', '#dca077', '#c4875c'], hair: ['#e2bd62', '#c9973f', '#8a5a2b', '#5e3b1e', '#b4582b'], cloth: ['#6f8a45', '#a8743a', '#8c5a3c', '#b89c62'],
    metal: '#a3a7ab', ink: '#2b1d12', bg: ['#f1e2bb', '#d6b97e'], accent: '#c0392b', eye: '#3d5f80', cheek: '#e2735f', motif: 'wheat' },
  delver: { skin: ['#e3ad8c', '#d09474', '#b97c5c'], hair: ['#a4462a', '#6b3a1f', '#3b2b21', '#8f8b86', '#dcd6ca'], cloth: ['#5b4636', '#7f5539', '#4a5560'],
    metal: '#8d9196', ink: '#2b1d12', bg: ['#e6d3ab', '#b39468'], accent: '#d8902e', eye: '#2e2016', cheek: '#c96a52', motif: 'gears' },
  sylvan: { skin: ['#f4dec3', '#e8caa6', '#cba47f'], hair: ['#ecdca6', '#b5652c', '#2f2a22', '#dad5c6'], cloth: ['#3e6b3a', '#5a8443', '#776a3a'],
    metal: '#c2b27a', ink: '#2b1d12', bg: ['#e7e7c2', '#a6bf84'], accent: '#2e7d32', eye: '#2f6e34', cheek: '#e0a08a', motif: 'leaves' },
  ash:    { skin: ['#8e8b87', '#7b706a', '#a06e5c', '#6d7377'], hair: ['#1e1a18', '#3a2622', '#d7cec2'], cloth: ['#5a3a2a', '#6b4b37', '#3b2f2a'],
    metal: '#6f6b67', ink: '#2b1d12', bg: ['#ecd1a0', '#c9854c'], accent: '#e0632a', eye: '#f2a22a', cheek: '#c23a1f', horn: '#ebdfc4', motif: 'embers' },
  tide:   { skin: ['#8fc5b8', '#77b1aa', '#a5d0c1', '#6ba3a9'], hair: ['#1f4a52', '#2e6b5e', '#10303a', '#d2e5de'], cloth: ['#1f5f6a', '#2f7f7a', '#bfa982'],
    metal: '#a9bab5', ink: '#2b1d12', bg: ['#e1e7d0', '#98c2b9'], accent: '#138d90', eye: '#0f2f3a', cheek: '#5f9e9a', fin: '#3f8f94', pearl: '#f6f1e6', motif: 'waves' },
  veil:   { skin: ['#e8d8f1', '#dccaea', '#f1e5f4'], hair: ['#f5f1fb', '#cbbbe7', '#2b2142', '#9c88ca'], cloth: ['#4a2f6a', '#6a3f7a', '#2a2448'],
    metal: '#cbc4dc', ink: '#2b1d12', bg: ['#e8dfdc', '#b4a2c6'], accent: '#c35bb0', eye: '#160d24', cheek: '#e6a6d6', glow: '#fbf3ff', motif: 'moon' },
  grave:  { skin: ['#b6bba6', '#a5ab9a', '#c6c2ae'], hair: ['#d7d3c5', '#5b5b53', '#2a2a26'], cloth: ['#3b3b42', '#2f333a', '#4b4339'],
    metal: '#7a8086', ink: '#2b1d12', bg: ['#ded6c0', '#979d96'], accent: '#56616b', eye: '#8dffd4', cheek: '#8a9284', bone: '#e8e0c8', glow: '#5fe0b0', motif: 'candles' },
  wind:   { skin: ['#e3ba8f', '#ca9b6f', '#b18660'], hair: ['#8a5a32', '#a87a4a', '#5e4a3a', '#ece4d4', '#3b3b44'], cloth: ['#4f6f9c', '#6a86a8', '#a8a090'],
    metal: '#a2aab2', ink: '#2b1d12', bg: ['#eae8d8', '#a7c3dc'], accent: '#4f8fdc', eye: '#e8a020', cheek: '#d08a6a', beak: '#e2b236', motif: 'clouds' },
};

(() => {
  const hash = str => { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const prng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const roleOf = spec => spec.role || (spec.unit && typeof G !== 'undefined' && G.roleOf ? G.roleOf(spec.unit) : 'infantry');
  const cache = new Map();
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

  // every random choice about the PERSON is rolled here, up front, so gear layers drawing from ctx.rnd
  // (or skipping hair under a helmet) never change the face. Layers read ctx.look only.
  //  look = { female, age 0 young|1 adult|2 old, skin (blend of two palette skins), hair (palette + extras), cloth,
  //    wid/chin -1..1 face width + chin length, jaw 0..1, cheek (cheekbones), eye 0..4 shape, eyeCol, gap (eye spacing),
  //    brow -1..1 tilt, browSt 0..3, nose 0..4, mouth 0 neutral|1 smile|2 stern|3 scowl|4 smirk, beard 0..7,
  //    hairStyle 0..5, scar 0..4, mark 0..4 (people-style tattoo/paint/stars/stitches), jewel 0..3 (earring, nose ring,
  //    circlet), patch (eyepatch), freckle, trait 0..4 + t2 0..1 (people shape: horns, antennae, fins, crest, skull,
  //    beard braids, ear length), broken (ash horn 0|1|2), col2 (people colour: glow, crest, ornament, fin), tusks, hood, v }
  const HAIR_X = { hearth: ['#efd98c', '#7a3418', '#2a1f18'], delver: ['#c4682c', '#d6b36a'], sylvan: ['#c9a44a', '#8c3c1c', '#7d9a52', '#f3efe4'], ash: ['#7a2416', '#4c4744', '#a8482a'],
    tide: ['#3f8f8a', '#5a4a78', '#c9a46a'], veil: ['#e9b9df', '#86a6dc', '#171330'], grave: ['#8a7a5a', '#a9a99a'], wind: ['#b8562a', '#2e3e5c', '#d4b45e', '#6a3a2a', '#f4f0e6'] };
  const EYES = { hearth: ['#3d5f80', '#5a3a20', '#4a6a3a', '#7a6a3a', '#6a7480'], delver: ['#2e2016', '#5a6670', '#8a5a1a', '#3a4a2a'], sylvan: ['#2f6e34', '#a08420', '#5a5a8a', '#3a7aa0'],
    ash: ['#f2a22a', '#e8402a', '#f0dc50', '#f6f0d8'], tide: ['#0f2f3a', '#1f7a78', '#d0a030', '#3a2a5a'], veil: ['#160d24', '#2c1a5c', '#4a1040', '#0c2c3c'],
    grave: ['#8dffd4', '#9cc8ff', '#ffc870', '#e09cff', '#ff8a7a'], wind: ['#e8a020', '#e86a20', '#f0d860', '#2a1a10'] };
  const COL2 = { hearth: ['#d6a83e', '#b0402a'], delver: ['#d6a83e', '#c9ccd0', '#c87a3e', '#3a6ab0'], sylvan: ['#5f9a45', '#8a6a3c', '#a8c060'], ash: ['#e0632a', '#f2c040', '#c23a1f'],
    tide: ['#3f8f94', '#c8705a', '#6a5aa0', '#d8b04a'], veil: ['#fbf3ff', '#d6ecff', '#ffd6f0', '#e4ffe6'], grave: ['#d6a83e', '#7a8086'], wind: ['#c9461f', '#f2f0e6', '#2b2f3a', '#d9a630', '#4f8fdc'] };
  const FRECK = { hearth: 0.45, delver: 0.2, sylvan: 0.18, wind: 0.1 };
  const AGE = { unit: [0.4, 0.9], hero: [0.3, 0.85], advisor: [0.12, 0.5], governor: [0.12, 0.5], ruler: [0.15, 0.55], citizen: [0.3, 0.78], spy: [0.3, 0.9] };
  const hx = c => [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
  const mixC = (a, b, t) => '#' + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
  const rollLook = (race, spec, r) => {
    const pal = PORTRAIT.palette[race] || PORTRAIT.palette.hearth, kind = spec.kind || 'unit';
    const troop = kind === 'unit', star = kind === 'hero' || kind === 'ruler';
    const female = spec.female != null ? !!spec.female : r() < 0.4;
    const a = r(), th = AGE[kind] || AGE.unit, AGE_IN = { young: 0, adult: 1, old: 2 }, age = AGE_IN[spec.age] ?? (a < th[0] ? 0 : a < th[1] ? 1 : 2);   // optional spec.age 'young'|'adult'|'old' (dynasties)
    const L = {
      female, age, skin: mixC(pick(r, pal.skin), pick(r, pal.skin), r() * 0.7), hair: pick(r, pal.hair.concat(HAIR_X[race] || [])), cloth: pick(r, pal.cloth),
      wid: r() * 2 - 1, jaw: star ? 0.4 + r() * 0.6 : r(), chin: r() * 2 - 1, cheek: r() < (star ? 0.65 : 0.3),
      eye: Math.floor(r() * 5), eyeCol: pick(r, EYES[race] || EYES.hearth), gap: r() * 1.6 - 0.8,
      brow: r() * 2 - 1, browSt: Math.floor(r() * 4), nose: Math.floor(r() * 5),
      mouth: pick(r, star ? [0, 1, 2, 2, 3, 4, 4] : troop ? [0, 0, 2, 3, 1, 4] : [0, 1, 1, 2, 3, 4]),
      beard: female ? 0 : star ? 2 + Math.floor(r() * 6) : Math.floor(r() * 8), hairStyle: Math.floor(r() * 6),
      scar: r() < (kind === 'hero' ? 0.32 : troop || kind === 'spy' ? 0.22 : 0.12) ? 1 + Math.floor(r() * 4) : 0,
      mark: r() < (troop ? 0.45 : 0.62) ? 1 + Math.floor(r() * 4) : 0,
      jewel: r() < (troop ? 0.14 : kind === 'ruler' || kind === 'governor' ? 0.6 : 0.4) ? 1 + Math.floor(r() * 3) : 0,
      patch: r() < (troop || kind === 'hero' || kind === 'spy' ? 0.07 : 0.03), freckle: r() < (FRECK[race] || 0),
      trait: Math.floor(r() * 5), t2: r(), broken: r() < 0.16 ? 1 + (r() < 0.5) : 0, col2: pick(r, COL2[race] || COL2.hearth),
      tusks: r() < 0.5, hood: r() < 0.45, v: r(),
    };
    return L;
  };

  G.portrait = (spec, size = 64) => {
    spec = spec || {};
    const key = JSON.stringify(spec) + '|' + size;
    if (cache.has(key)) return cache.get(key);
    const race = PORTRAIT.anatomy[spec.race] ? spec.race : 'hearth';
    const role = roleOf(spec);
    const kind = spec.kind || 'unit';
    const seedStr = [race, kind, spec.unit || '', role, spec.seed ?? ''].join(':');
    const rnd = prng(hash(seedStr));
    const look = rollLook(race, spec, prng(hash(seedStr + '#look')));
    const id = 'pt' + hash(key).toString(36);
    const ctx = { spec, size, race, kind, role, rnd, pal: PORTRAIT.palette[race], id, V: 100,
      anat: PORTRAIT.anatomy[race], hideHair: false, hideEars: false,
      look, era: Math.max(0, Math.min(3, spec.era | 0)), female: look.female, skin: look.skin, hairCol: look.hair,
      skipPeople: kind === 'monster' || role === 'ship' || role === 'siege',
      grain: size >= 48 ? `filter="url(#${id}-g)"` : '' };
    let body = '';
    for (const layer of PORTRAIT.ORDER) {
      if (layer === 'frame' && ctx.grain) body += `<rect x="5" y="5" width="90" height="90" rx="12" fill="#5a3d20" opacity=".22" ${ctx.grain}/>`;
      for (const fn of PORTRAIT.layers[layer]) { try { body += fn(ctx) || ''; } catch (e) { if (typeof console !== 'undefined') console.error('portrait layer', layer, e); } }
    }
    if (!body) body = `<rect x="4" y="4" width="92" height="92" rx="14" fill="#e8d9b5" stroke="#2b1d12" stroke-width="3"/><text x="50" y="62" font-size="40" text-anchor="middle">${(spec.unit && DATA.units[spec.unit] && DATA.units[spec.unit].icon) || '?'}</text>`;
    // paper grain: sepia speckle, alpha from noise, clipped to the drawn rect by feComposite
    let defs = ctx.grain ? `<filter id="${id}-g" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="1" seed="${hash(seedStr) % 97}"/><feColorMatrix values="0 0 0 0 .35 0 0 0 0 .24 0 0 0 0 .12 0 0 0 -3 1.45"/><feComposite in2="SourceGraphic" operator="in"/></filter>` : '';
    if (spec.dead) { defs += `<filter id="${id}-dead"><feColorMatrix type="saturate" values=".12"/></filter>`; body = `<g filter="url(#${id}-dead)" opacity=".85">${body}</g>`; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" stroke-linejoin="round" stroke-linecap="round" role="img" aria-label="${(spec.unit && DATA.units[spec.unit] ? DATA.units[spec.unit].name : kind).replace(/"/g, '')}">${defs ? '<defs>' + defs + '</defs>' : ''}${body}</svg>`;
    if (cache.size > 600) cache.clear();
    cache.set(key, svg);
    return svg;
  };
  G.portraitHtml = (spec, size = 64, cls = '') => `<span class="pt pt-${(spec && spec.kind) || 'unit'} ${cls}" style="width:${size}px;height:${size}px">${G.portrait(spec, size)}</span>`;
  PORTRAIT.hash = hash; PORTRAIT.prng = prng; PORTRAIT.clearCache = () => cache.clear();
})();
