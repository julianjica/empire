// =====================================================================
//  Portrait gear: frames, rank trim, headgear, weapons, shields, armour,
//  mounts and wings, plus the whole-picture kinds (siege engines, ships,
//  monsters). See the CONTRACT in js/portraits.js.
//
//  Layers used: frameBack (plan + things behind the body: wings, quivers),
//  body (whole pictures only), mount, headgear, gear, front (wounds, death
//  wash), frame (the heraldic frame on top).
//  ctx.gear = the plan decided once per portrait { helm[], weapon, shield,
//  mount, wings, whole }. ctx.whole = true for siege/ship/monster pictures:
//  the people module skips body/head/face/hair for those.
//  Tables are exported on PORTRAIT.gear for tests and tools.
// =====================================================================
'use strict';
(() => {
  if (typeof PORTRAIT === 'undefined') return;
  const INK = '#2b1d12';
  const n = v => Math.round(v * 10) / 10;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex = h => { h = String(h || '#888').replace('#', ''); if (h.length === 3) h = h.replace(/./g, c => c + c); const v = parseInt(h.slice(0, 6), 16) || 0; return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
  const toHex = a => '#' + a.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const shade = (c, k) => toHex(hex(c).map(v => k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const grey = c => { const [r, g, b] = hex(c); const l = 0.3 * r + 0.59 * g + 0.11 * b; return toHex([l, l, l * 0.95]); };

  // ---- per-people gear palette (merged with PORTRAIT.palette[race] when published) ----
  const GP = {
    hearth: { metal: '#aab3ba', leather: '#7a4e2a', wood: '#8b5a2b', cloth: '#c0392b', accent: '#d9a441', glow: '#ffcf5a', bone: '#e8dcc0', hood: '#5d6b3a' },
    delver: { metal: '#8e8a82', leather: '#6b4426', wood: '#6e4a2a', cloth: '#7f5539', accent: '#c8903e', glow: '#5fd8ea', bone: '#e0d4b8', hood: '#5a4636' },
    sylvan: { metal: '#b8a564', leather: '#6b4f2e', wood: '#6a4a2a', cloth: '#3f7d3a', accent: '#e6d77a', glow: '#c6f27a', bone: '#e8dcc0', hood: '#3f6a34', leaf: '#5e9a3a' },
    ash: { metal: '#5f5853', leather: '#5a3a28', wood: '#6a4a32', cloth: '#6d4c8d', accent: '#e0662a', glow: '#ff8a3a', bone: '#e6dcc3', hood: '#4a3a3a' },
    tide: { metal: '#78b0a8', leather: '#6a5040', wood: '#7b5a3a', cloth: '#138d90', accent: '#f2e6c8', glow: '#7fe8ff', bone: '#efe4cc', hood: '#2f6f73', coral: '#e0705a', shell: '#efd6c4' },
    veil: { metal: '#cfd3e6', leather: '#4a3550', wood: '#5a4048', cloth: '#c35bb0', accent: '#e7a8ff', glow: '#f0b8ff', bone: '#ece6f0', hood: '#3b2c4f', dark: '#3b2c4f', thorn: '#3d2f2a' },
    grave: { metal: '#857a5c', leather: '#4e4238', wood: '#5a4a3a', cloth: '#56616b', accent: '#9a5530', glow: '#7dffa8', bone: '#d9d3b8', hood: '#3d4247', rust: '#8a4b2a' },
    wind: { metal: '#c6d2dc', leather: '#7a5a3a', wood: '#9a7448', cloth: '#4f8fdc', accent: '#ffd84a', glow: '#bfe8ff', bone: '#efe8d8', hood: '#5c6f86', feather: '#f3efe4' },
  };
  const eraOf = ctx => clamp((ctx.era != null ? ctx.era : +ctx.spec.era) | 0, 0, 3);
  const colorsOf = ctx => {
    if (ctx._gc) return ctx._gc;
    return (ctx._gc = colorsOf0(ctx));
  };
  const colorsOf0 = ctx => {
    const base = GP[ctx.race] || GP.hearth, pal = ctx.pal || {};
    const first = v => Array.isArray(v) ? v[0] : v;
    const realm = ctx.spec.color || (typeof DATA !== 'undefined' && DATA.races && DATA.races[ctx.race] && DATA.races[ctx.race].color) || base.cloth;
    const era = ctx.gear ? ctx.gear.era : eraOf(ctx);
    const m0 = base.metal;
    // era: 0 dull bronze/iron, 1 plain steel, 2 bright steel, 3 polished masterwork
    const metal = era === 0 ? mix(m0, '#8a6a4a', 0.4) : era === 2 ? shade(m0, 0.08) : era === 3 ? shade(m0, 0.16) : m0;
    const out = Object.assign({}, base, { metal, accent: base.accent, cloth: first(pal.cloth) || base.cloth, realm, era, gold: era === 3 ? '#e8bf48' : '#d6a83e', school: ctx.schoolCol || base.glow });
    if (ctx.kind === 'magus' && ctx.schoolCol) out.glow = mix(ctx.schoolCol, '#ffffff', 0.45);   // a magus' gems and runes burn in the school's colour
    return out;
  };

  // ---- anatomy: published by the people module; fall back to a generic bust ----
  const DEF = { head: { cx: 50, cy: 42, rx: 15, ry: 17 }, shoulders: { y: 78, left: 20, right: 80 }, neck: { x: 50, y: 63 } };
  const yOf = (v, d) => typeof v === 'number' ? v : v && typeof v.y === 'number' ? v.y : d;
  const anat = ctx => {
    if (ctx._ga && ctx._ga.src === (ctx.anat || null)) return ctx._ga;
    const a = ctx.anat || (PORTRAIT.anatomy && (PORTRAIT.anatomy[ctx.race] || PORTRAIT.anatomy.hearth)) || {};
    const h = Object.assign({}, DEF.head, a.head || {});
    if (!(h.rx > 0)) h.rx = DEF.head.rx; if (!(h.ry > 0)) h.ry = DEF.head.ry;
    const s = a.shoulders || {};
    const xs = v => typeof v === 'number' ? v : v && typeof v.x === 'number' ? v.x : null;
    const out = {
      src: ctx.anat || null, head: h,
      crown: yOf(a.crown, h.cy - h.ry), brow: yOf(a.brow, h.cy - h.ry * 0.25), chin: yOf(a.chin, h.cy + h.ry),
      sh: { y: yOf(s, typeof s.y === 'number' ? s.y : DEF.shoulders.y), left: xs(s.left) ?? DEF.shoulders.left, right: xs(s.right) ?? DEF.shoulders.right },
      neck: { x: (a.neck && a.neck.x) || h.cx, y: yOf(a.neck, h.cy + h.ry * 1.25) },
    };
    if (typeof s.y === 'number') out.sh.y = s.y;
    ctx._ga = out;
    return out;
  };
  const Q = A => (u, v) => n(A.cx + u * A.rx) + ' ' + n(A.cy + v * A.ry);

  // ---- svg helpers ----
  const grad = (ctx, c, k = 0.28, dir = 'v') => {
    ctx._gn = (ctx._gn || 0) + 1;
    const id = ctx.id + 'q' + ctx._gn;
    const xy = dir === 'h' ? 'x1="0" y1="0" x2="1" y2="0"' : dir === 'd' ? 'x1="0" y1="0" x2="1" y2="1"' : 'x1="0" y1="0" x2="0" y2="1"';
    ctx._gd = (ctx._gd || '') + `<linearGradient id="${id}" ${xy}><stop offset="0" stop-color="${shade(c, k)}"/><stop offset="1" stop-color="${shade(c, -k * 0.6)}"/></linearGradient>`;
    return `url(#${id})`;
  };
  const glowGrad = (ctx, c) => {
    ctx._gn = (ctx._gn || 0) + 1;
    const id = ctx.id + 'q' + ctx._gn;
    ctx._gd = (ctx._gd || '') + `<radialGradient id="${id}"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
    return `url(#${id})`;
  };
  const flush = (ctx, s, sw = 2.2) => {
    if (!s) return '';
    const d = ctx._gd ? `<defs>${ctx._gd}</defs>` : '';
    ctx._gd = '';
    return `${d}<g stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${s}</g>`;
  };
  const P = (d, f, x = '') => `<path d="${d}" fill="${f}"${x}/>`;
  const C = (x, y, r, f, e = '') => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${f}"${e}/>`;
  const E = (x, y, rx, ry, f, e = '') => `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${f}"${e}/>`;
  // outlined line: ink underlay + colour core (shafts, antlers, straps)
  const OL = (d, col, w = 2.4) => `<path d="${d}" fill="none" stroke-width="${n(w + 2.2)}"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${n(w)}"/>`;
  const NS = ' stroke="none"';
  const T = (x, y, a, s = 1) => ` transform="translate(${n(x)} ${n(y)}) rotate(${n(a)})${s !== 1 ? ` scale(${s})` : ''}"`;
  const leaf = (x, y, len, w, a, f) => `<path d="M0 0Q${n(w)} ${n(-len * 0.5)} 0 ${n(-len)}Q${n(-w)} ${n(-len * 0.5)} 0 0Z" fill="${f}"${T(x, y, a)}/>`;
  const wob = (ctx, k = 0.7) => (ctx.grnd() - 0.5) * k;

  // ---- race sigils for shields, banners and the frame tab ----
  const sigil = (race, x, y, s, col) => {
    const t = ` transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"`;
    const f = `fill="${col}"`;
    switch (race) {
      case 'delver': return `<path d="M-5 -2H5L3 0H1V2H3V4H-3V2H-1V0H-3Z" ${f} stroke-width="1"${t}/>`;
      case 'sylvan': return `<path d="M0 5Q-5 0 0 -5Q5 0 0 5ZM0 5V-4" ${f} stroke-width="1"${t}/>`;
      case 'ash': return `<path d="M-4 -4Q-5 1 -1 2L0 4L1 2Q5 1 4 -4Q3 -1 0 -1Q-3 -1 -4 -4Z" ${f} stroke-width="1"${t}/>`;
      case 'tide': return `<path d="M-5 2Q-3 -3 0 0Q3 3 5 -2V3H-5Z" ${f} stroke-width="1"${t}/>`;
      case 'veil': return `<path d="M2 -5A5 5 0 1 0 2 5A4 4 0 1 1 2 -5Z" ${f} stroke-width="1"${t}/>`;
      case 'grave': return `<path d="M-4 0A4 4 0 1 1 4 0V3H-4ZM-2 -1h1M1 -1h1" ${f} stroke-width="1"${t}/>`;
      case 'wind': return `<path d="M-5 3Q0 -6 5 -5Q2 -2 3 0Q0 0 1 2Q-2 2 -5 3Z" ${f} stroke-width="1"${t}/>`;
      default: return `<path d="M0 -5Q4 -1 3 2Q2 5 0 5Q-2 5 -3 2Q-4 -1 0 -5Z" ${f} stroke-width="1"${t}/>`;
    }
  };

  // =====================================================================
  //  TABLES
  // =====================================================================
  const HEADGEAR = {
    militia: ['kettle'], pikeman: ['coif', 'kettle'], crossbow: ['coif', 'kettle:low'], outrider: ['nasal'], knight: ['barbute:plume'], royalguard: ['barbute:plume:band'], hedgewizard: ['wizardhat'],
    axeguard: ['greathelm'], ironshield: ['greathelm'], boltcaster: ['goggles'], goatrider: ['greathelm'], boarrider: ['greathelm'], runeguard: ['greathelm:crest'], runepriest: ['hood:rune'],
    warden: ['leafcrown'], thornguard: ['antlerhelm'], longbow: ['leafcrown'], winddancer: ['hood:leaf'], stagrider: ['antlerhelm'], groveguard: ['branchcrown'], moonsinger: ['mooncirclet'],
    raider: ['wolfpelt'], slinger: ['bandana'], brute: ['skullhelm'], shaman: ['skullmask'], wolfrider: ['hornhelm'], warlordblade: ['skullhelm:crest'], emberseer: ['skullmask'],
    shorespear: ['fincap'], shellguard: ['shellhelm'], harpooner: ['fincap'], kelpierider: ['fincap'], tidecharger: ['shellhelm'], abyssguard: ['coralhelm'], tidesinger: ['pearlcirclet'],
    duskblade: ['thorncirclet'], mirrorguard: ['mirrormask'], moonbow: ['mooncirclet'], wisprider: ['thorncirclet'], nightmare: ['moonhelm'], eclipseguard: ['moonhelm'], glamourweaver: ['thorncirclet:tall'],
    skeleton: ['kettle:rust'], barrowwarden: ['tombhelm'], bonearcher: ['hood:tatter'], ghoulrunner: [], dreadknight: ['tombhelm:crown'], wightlord: ['hood:tatter', 'rustcrown'], necromancer: ['hood:skull'],
    cliffspear: ['featherband'], cragsentinel: ['stonehelm'], galeshot: ['featherband'], hawkrider: ['feathercrest'], rocrider: ['feathercrest'], thunderwing: ['feathercrest:storm'], stormcaller: ['feathermitre'],
    settlers: ['strawhat'], herald: ['cap:feather'], scout: ['hood:scout'], priest: ['mitre'], hero: ['nasal'], risen: [],
  };
  // hero helm by people and rank band (0-2, 3-6, 7-10): open-faced so the hero stays recognisable
  const HERO_HELM = {
    hearth: [[], ['nasal'], ['circlet']], delver: [[], ['greathelm'], ['greathelm:crest']], sylvan: [['leafcrown'], ['leafcrown'], ['antlerhelm']], ash: [[], ['hornhelm'], ['skullhelm']],
    tide: [[], ['shellhelm'], ['coralhelm']], veil: [['thorncirclet'], ['thorncirclet'], ['thorncirclet:tall']], grave: [['hood:tatter'], ['rustcrown'], ['rustcrown']], wind: [['featherband'], ['feathercrest'], ['feathercrest']],
  };
  const MAGE_HELM = { hearth: 'wizardhat', delver: 'hood:rune', sylvan: 'mooncirclet', ash: 'skullmask', tide: 'pearlcirclet', veil: 'thorncirclet:tall', grave: 'hood:skull', wind: 'feathermitre' };
  const WEAPONS = {
    militia: { w: 'spear' }, pikeman: { w: 'pike' }, crossbow: { w: 'crossbow' }, outrider: { w: 'saber' }, knight: { w: 'lance' }, royalguard: { w: 'halberd', s: 'kite' }, hedgewizard: { w: 'staff' },
    axeguard: { w: 'greataxe' }, ironshield: { w: 'hammer', s: 'tower' }, boltcaster: { w: 'clockbow' }, goatrider: { w: 'axe' }, boarrider: { w: 'spear' }, runeguard: { w: 'warhammer', s: 'round' }, runepriest: { w: 'staff' },
    warden: { w: 'glaive' }, thornguard: { w: 'spear', s: 'thorn' }, longbow: { w: 'longbow', q: 1 }, winddancer: { w: 'saber' }, stagrider: { w: 'spear' }, groveguard: { w: 'club' }, moonsinger: { w: 'staff' },
    raider: { w: 'cleaver' }, slinger: { w: 'sling' }, brute: { w: 'club' }, shaman: { w: 'staff' }, wolfrider: { w: 'axe' }, warlordblade: { w: 'greatblade' }, emberseer: { w: 'staff' },
    shorespear: { w: 'trident' }, shellguard: { w: 'trident', s: 'shell' }, harpooner: { w: 'harpoon' }, kelpierider: { w: 'trident' }, tidecharger: { w: 'lance' }, abyssguard: { w: 'glaive' }, tidesinger: { w: 'staff' },
    duskblade: { w: 'feysaber' }, mirrorguard: { w: 'feysaber', s: 'mirror' }, moonbow: { w: 'longbow', q: 1 }, wisprider: { w: 'glaive' }, nightmare: { w: 'lance' }, eclipseguard: { w: 'glaive' }, glamourweaver: { w: 'staff' },
    skeleton: { w: 'spear' }, barrowwarden: { w: 'sword', s: 'coffin' }, bonearcher: { w: 'longbow', q: 1 }, ghoulrunner: { w: 'claws' }, dreadknight: { w: 'greatsword' }, wightlord: { w: 'scythe' }, necromancer: { w: 'staff' },
    cliffspear: { w: 'pike' }, cragsentinel: { w: 'spear', s: 'tall' }, galeshot: { w: 'longbow', q: 1 }, hawkrider: { w: 'spear' }, rocrider: { w: 'lance' }, thunderwing: { w: 'stormspear' }, stormcaller: { w: 'staff' },
    settlers: { w: 'hoe', satchel: 1 }, herald: { w: 'banner' }, scout: { w: 'spyglass' }, priest: { w: 'crozier' }, hero: { w: 'sword', s: 'heater' }, risen: { w: 'sword' },
  };
  const HERO_WEAPON = { hearth: { w: 'sword', s: 'heater' }, delver: { w: 'axe', s: 'round' }, sylvan: { w: 'glaive' }, ash: { w: 'greatblade' }, tide: { w: 'trident', s: 'shell' }, veil: { w: 'feysaber' }, grave: { w: 'greatsword' }, wind: { w: 'spear' } };
  // mount beasts for every cavalry / flyer unit of every people
  const MOUNTS = {
    outrider: 'horse', knight: 'warhorse', goatrider: 'goat', boarrider: 'boar', winddancer: 'hart', stagrider: 'stag', wolfrider: 'wolf',
    kelpierider: 'kelpie', tidecharger: 'seabeast', wisprider: 'moth', nightmare: 'nightmare', ghoulrunner: 'ghoulhound', dreadknight: 'bonehorse',
    hawkrider: 'hawk', rocrider: 'roc', thunderwing: 'wings', stormcaller: 'wings',
  };
  const WINGED = { moth: 'moth', hawk: 'feather', roc: 'feather', wings: 'feather' };
  const MONSTER_UNITS = { wyrm: 'wyrm', demon: 'demon', beast: 'beast', brigand: 'brigand', elemental: 'elemental', restless: 'undead', starbeast: 'beast' };
  const MONSTERS = ['wyrm', 'demon', 'undead', 'beast', 'brigand', 'elemental'];
  const ORB = { hearth: '#ffb347', delver: '#5fd8ea', sylvan: '#c6f27a', ash: '#ff6a2a', tide: '#7fe8ff', veil: '#f0b8ff', grave: '#7dffa8', wind: '#bfe8ff' };

  // derive a mount from name/desc for units another module adds
  const guessMount = u => {
    const d = (typeof DATA !== 'undefined' && DATA.units[u]) || {};
    const t = ((d.name || '') + ' ' + (d.desc || '')).toLowerCase();
    for (const [re, m] of [[/hawk|eagle|griffin/, 'hawk'], [/roc\b|vast bird/, 'roc'], [/moth|wisp/, 'moth'], [/wolf|warg/, 'wolf'], [/boar|pig/, 'boar'], [/goat|ram\b/, 'goat'], [/stag|elk|deer/, 'stag'], [/kelpie|water-horse/, 'kelpie'], [/sea-beast|whale|serpent/, 'seabeast'], [/nightmare|dream-steed/, 'nightmare'], [/ghoul|hound/, 'ghoulhound'], [/skeletal|bone/, 'bonehorse'], [/heavy|knight|lancer/, 'warhorse']]) if (re.test(t)) return m;
    return d.flying ? 'wings' : 'horse';
  };

  // =====================================================================
  //  PLAN — decided once (frameBack), read by every later layer
  // =====================================================================
  const plan = ctx => {
    if (ctx.gear) return ctx.gear;
    const sp = ctx.spec, race = ctx.race, role = ctx.role, kind = sp.kind || 'unit', u = sp.unit;
    ctx.grnd = PORTRAIT.prng(PORTRAIT.hash([race, kind, u || '', role, sp.seed ?? '', 'gear'].join(':')));
    const g = { helm: [], weapon: null, shield: null, mount: null, wings: null, whole: null, quiver: false, satchel: false, armour: true };
    const mrank = kind === 'magus' ? clamp(Math.round(+sp.rank || 1), 1, 5) : 0;   // a magus' rank is 1..5: the frame trim reads it doubled
    const rank = kind === 'magus' ? mrank * 2 : clamp(+sp.rank || 0, 0, 10);
    const band = rank >= 7 ? 2 : rank >= 3 ? 1 : 0;
    if (kind === 'monster') g.whole = 'monster:' + (MONSTERS.includes(sp.role) ? sp.role : MONSTER_UNITS[u] || 'beast');
    else if (u && MONSTER_UNITS[u]) g.whole = 'monster:' + MONSTER_UNITS[u];
    else if (role === 'siege') g.whole = 'siege';
    else if (role === 'ship') g.whole = 'ship';
    if (!g.whole) {
      if (kind === 'unit' && u) {
        g.helm = (HEADGEAR[u] || (role === 'mage' ? [MAGE_HELM[race]] : HERO_HELM[race][Math.min(band, 1)])).slice();
        const w = WEAPONS[u] || (role === 'mage' ? { w: 'staff' } : role === 'ranged' ? { w: 'longbow', q: 1 } : role === 'support' ? { w: '' } : { w: 'spear' });
        g.weapon = w.w; g.shield = w.s || null; g.quiver = !!w.q; g.satchel = !!w.satchel;
        if (role === 'cavalry' || role === 'flyer' || MOUNTS[u]) g.mount = MOUNTS[u] || guessMount(u);
        if (role === 'support' || role === 'mage') g.armour = false;
      } else if (kind === 'hero') {
        g.helm = (sp.gear && sp.gear.helm ? HERO_HELM[race][Math.max(1, band)] : HERO_HELM[race][band]).slice();
        const w = HERO_WEAPON[race] || HERO_WEAPON.hearth;
        g.weapon = w.w; g.shield = w.s || null;
        const wn = String((sp.gear && sp.gear.weapon) || '');
        if (/saber/i.test(wn)) g.weapon = 'saber'; else if (/sword|blade/i.test(wn) && race === 'hearth') g.weapon = 'sword';
        if (sp.gear && /banner/i.test(String(sp.gear.trinket || ''))) g.banner = true;
      } else if (kind === 'advisor') {
        const r = sp.role;
        g.armour = r === 'marshal';
        g.helm = r === 'marshal' ? HERO_HELM[race][1].slice() : r === 'spymaster' ? ['hood:spy'] : r === 'priest' ? ['mitre'] : r === 'archmage' ? [MAGE_HELM[race]] : ['cap'];
        g.weapon = r === 'marshal' ? 'baton' : r === 'spymaster' ? 'dagger' : r === 'priest' ? 'crozier' : r === 'archmage' ? 'staff' : 'ledger';
      } else if (kind === 'magus') {
        g.magus = { rank: mrank };
        g.helm = (MAGUS_HELM[race] || MAGUS_HELM.hearth)[magusTier(mrank)].slice();
        if (mrank >= 5) g.helm.push('archhalo');
        g.weapon = 'focus'; g.armour = false;
      } else if (kind === 'ruler') { g.helm = ['crown']; g.weapon = 'scepter'; g.armour = false; g.mantle = true; }
      else if (kind === 'spy') { g.helm = []; g.weapon = 'dagger'; g.armour = false; }
      else if (kind === 'governor') { g.helm = ctx.grnd() < 0.5 ? ['cap'] : []; g.weapon = 'chain'; g.armour = false; }
      else if (kind === 'citizen') { const r = ctx.grnd(); g.helm = r < 0.3 ? ['strawhat'] : r < 0.55 ? ['cap'] : []; g.weapon = ''; g.armour = false; }
      if (g.mount && WINGED[g.mount]) g.wings = WINGED[g.mount];
      if (role === 'flyer' && !g.wings) g.wings = 'feather';
      if (u && typeof DATA !== 'undefined' && DATA.units[u] && DATA.units[u].flying && !g.wings) g.wings = 'feather';
    }
    // full helms cover hair / ears
    const types = g.helm.map(h => h.split(':')[0]);
    const HIDE_HAIR = ['barbute', 'greathelm', 'hood', 'skullhelm', 'moonhelm', 'tombhelm', 'wolfpelt', 'stonehelm', 'coif', 'shellhelm', 'coralhelm', 'feathercrest', 'hornhelm', 'nasal', 'antlerhelm', 'fincap', 'goggles'];
    const HIDE_EARS = ['barbute', 'greathelm', 'hood', 'moonhelm', 'tombhelm', 'wolfpelt', 'stonehelm', 'coif', 'shellhelm', 'coralhelm'];
    if (types.some(t => HIDE_HAIR.includes(t))) ctx.hideHair = true;
    if (types.some(t => HIDE_EARS.includes(t))) ctx.hideEars = true;
    g.rank = rank; g.kind = kind; g.era = eraOf(ctx);
    ctx.gear = g;
    ctx.whole = !!g.whole;
    if (g.whole) ctx.skipPeople = true;
    return g;
  };

  // =====================================================================
  //  HEADGEAR
  // =====================================================================
  const HELM = {};
  HELM.kettle = (ctx, A, c, f) => {
    const q = Q(A), m = f.rust ? c.rust || '#8a6a4a' : c.metal, lo = f.low ? 0.08 : 0;
    let s = P(`M${q(-0.98, -0.32 + lo)}C${q(-1.02, -1.42 + lo)} ${q(1.02, -1.42 + lo)} ${q(0.98, -0.32 + lo)}Z`, grad(ctx, m));
    s += P(`M${q(-1.55, -0.28 + lo)}Q${q(0, -0.62 + lo)} ${q(1.55, -0.28 + lo)}Q${q(1.6, -0.06 + lo)} ${q(1.3, -0.08 + lo)}Q${q(0, -0.36 + lo)} ${q(-1.3, -0.08 + lo)}Q${q(-1.6, -0.06 + lo)} ${q(-1.55, -0.28 + lo)}Z`, shade(m, -0.12));
    s += `<path d="M${q(0, -1.1 + lo)}V${q(0, -0.48 + lo).split(' ')[1]}" fill="none" stroke-width="1.2"/>`;
    if (f.rust) s += C(A.cx - A.rx * 0.4, A.cy - A.ry * 0.8, 1.4, c.rust || '#8a4b2a', NS) + C(A.cx + A.rx * 0.5, A.cy - A.ry * 0.6, 1, '#6b3a20', NS);
    return s;
  };
  HELM.coif = (ctx, A, c) => {
    const q = Q(A), m = shade(c.metal, -0.1);
    return P(`M${q(0, -1.25)}C${q(1.3, -1.25)} ${q(1.3, 0)} ${q(1.25, 0.75)}Q${q(1.3, 1.25)} ${q(1.5, 1.45)}Q${q(0, 1.75)} ${q(-1.5, 1.45)}Q${q(-1.3, 1.25)} ${q(-1.25, 0.75)}C${q(-1.3, 0)} ${q(-1.3, -1.25)} ${q(0, -1.25)}ZM${q(0, -0.85)}C${q(-0.95, -0.85)} ${q(-0.95, 1.05)} ${q(0, 1.05)}C${q(0.95, 1.05)} ${q(0.95, -0.85)} ${q(0, -0.85)}Z`, grad(ctx, m), ' fill-rule="evenodd"')
      + `<path d="M${q(-1.1, 0.2)}h1M${q(-1.15, 0.6)}h1M${q(1.0, 0.2)}h1M${q(1.05, 0.6)}h1M${q(-1.2, 1.25)}h1M${q(1.1, 1.25)}h1" fill="none" stroke-width="1" stroke-dasharray="1 1.5"/>`;
  };
  const plume = (ctx, A, col) => {
    const q = Q(A);
    return P(`M${q(0, -1.05)}C${q(0.2, -1.9)} ${q(1.4, -2.0)} ${q(1.9, -1.2)}C${q(1.5, -1.5)} ${q(1.1, -1.35)} ${q(1.25, -0.9)}C${q(0.8, -1.3)} ${q(0.4, -1.2)} ${q(0.25, -0.95)}Z`, grad(ctx, col));
  };
  HELM.barbute = (ctx, A, c, f) => {
    const q = Q(A), m = f.rust ? '#8a7a64' : c.metal;
    let s = f.plume ? plume(ctx, A, c.realm) : '';
    s += P(`M${q(-1.14, 0.2)}C${q(-1.24, -1.48)} ${q(1.24, -1.48)} ${q(1.14, 0.2)}L${q(1.02, 0.98)}Q${q(0, 1.18)} ${q(-1.02, 0.98)}Z`
      + `M${q(-0.74, -0.34)}L${q(0.74, -0.34)}L${q(0.74, -0.1)}L${q(0.22, -0.1)}L${q(0.22, 1.02)}L${q(-0.22, 1.02)}L${q(-0.22, -0.1)}L${q(-0.74, -0.1)}Z`, grad(ctx, m, 0.35, 'd'), ' fill-rule="evenodd"');
    s += `<path d="M${q(0, -1.18)}Q${q(0.05, -0.75)} ${q(0, -0.38)}" fill="none" stroke-width="1.2"/>`;
    if (f.band) s += P(`M${q(-1.12, -0.55)}Q${q(0, -0.78)} ${q(1.12, -0.55)}L${q(1.1, -0.42)}Q${q(0, -0.65)} ${q(-1.1, -0.42)}Z`, c.accent, ' stroke-width="1.2"');
    return s;
  };
  HELM.nasal = (ctx, A, c) => {
    const q = Q(A);
    return P(`M${q(-1.06, -0.3)}Q${q(-0.98, -1.2)} ${q(0, -1.5)}Q${q(0.98, -1.2)} ${q(1.06, -0.3)}Q${q(0, -0.5)} ${q(-1.06, -0.3)}Z`, grad(ctx, c.metal, 0.35, 'd'))
      + P(`M${q(-0.1, -0.42)}L${q(0.1, -0.42)}L${q(0.08, 0.12)}L${q(-0.08, 0.12)}Z`, c.metal, ' stroke-width="1.4"')
      + P(`M${q(-1.06, -0.3)}Q${q(0, -0.52)} ${q(1.06, -0.3)}L${q(1.04, -0.46)}Q${q(0, -0.68)} ${q(-1.04, -0.46)}Z`, shade(c.metal, -0.25), ' stroke-width="1.2"');
  };
  HELM.greathelm = (ctx, A, c, f) => {
    const q = Q(A), m = c.metal, br = c.accent;
    let s = '';
    if (f.horns) s += P(`M${q(-0.9, -0.85)}Q${q(-1.9, -1.0)} ${q(-1.75, -1.85)}Q${q(-1.45, -1.25)} ${q(-0.75, -1.15)}Z`, c.bone) + P(`M${q(0.9, -0.85)}Q${q(1.9, -1.0)} ${q(1.75, -1.85)}Q${q(1.45, -1.25)} ${q(0.75, -1.15)}Z`, c.bone);
    if (f.crest) s += P(`M${q(-0.18, -1.2)}Q${q(0, -1.9)} ${q(0.9, -1.75)}Q${q(0.5, -1.45)} ${q(0.25, -1.1)}Z`, br);
    s += P(`M${q(-1.18, -0.18)}C${q(-1.25, -1.52)} ${q(1.25, -1.52)} ${q(1.18, -0.18)}Z`, grad(ctx, m, 0.32, 'd'));
    s += P(`M${q(-1.2, -0.42)}Q${q(0, -0.66)} ${q(1.2, -0.42)}L${q(1.2, -0.14)}Q${q(0, -0.36)} ${q(-1.2, -0.14)}Z`, br, ' stroke-width="1.6"');
    s += P(`M${q(-1.2, -0.16)}L${q(-0.62, -0.2)}L${q(-0.56, 0.42)}L${q(-0.86, 0.78)}L${q(-1.16, 0.58)}Z`, shade(m, -0.08)) + P(`M${q(1.2, -0.16)}L${q(0.62, -0.2)}L${q(0.56, 0.42)}L${q(0.86, 0.78)}L${q(1.16, 0.58)}Z`, shade(m, -0.08));
    s += P(`M${q(-0.11, -0.3)}L${q(0.11, -0.3)}L${q(0.08, 0.3)}L${q(-0.08, 0.3)}Z`, br, ' stroke-width="1.3"');
    s += `<path d="M${q(-0.75, -0.3)}l1.2 -1.6l1.2 1.6M${q(0.45, -0.3)}l1.2 -1.6l1.2 1.6M${q(-0.97, 0.1)}v2.5M${q(0.97, 0.1)}v2.5" fill="none" stroke="${c.glow}" stroke-width="1"/>`;
    return s;
  };
  HELM.goggles = (ctx, A, c) => {
    const q = Q(A);
    return P(`M${q(-1.08, -0.3)}C${q(-1.1, -1.45)} ${q(1.1, -1.45)} ${q(1.08, -0.3)}Q${q(0, -0.55)} ${q(-1.08, -0.3)}Z`, grad(ctx, c.leather))
      + C(A.cx - A.rx * 0.42, A.cy - A.ry * 0.62, A.rx * 0.3, c.accent) + C(A.cx + A.rx * 0.42, A.cy - A.ry * 0.62, A.rx * 0.3, c.accent)
      + C(A.cx - A.rx * 0.42, A.cy - A.ry * 0.62, A.rx * 0.17, c.glow, ' stroke-width="1"') + C(A.cx + A.rx * 0.42, A.cy - A.ry * 0.62, A.rx * 0.17, c.glow, ' stroke-width="1"');
  };
  HELM.leafcrown = (ctx, A, c) => {
    const q = Q(A), L = c.leaf || '#5e9a3a';
    let s = `<path d="M${q(-1.02, -0.5)}Q${q(0, -0.78)} ${q(1.02, -0.5)}" fill="none" stroke-width="3.6"/><path d="M${q(-1.02, -0.5)}Q${q(0, -0.78)} ${q(1.02, -0.5)}" fill="none" stroke="${c.accent}" stroke-width="1.6"/>`;
    for (let i = -3; i <= 3; i++) {
      const u = i * 0.32, v = -0.58 - (1 - Math.abs(i) / 3.4) * 0.12;
      s += leaf(A.cx + u * A.rx, A.cy + v * A.ry, A.ry * (0.55 - Math.abs(i) * 0.05), A.rx * 0.13, i * 18 + wob(ctx, 8), i % 2 ? shade(L, 0.15) : L);
    }
    return s.replace(/<path d="M0 0Q/g, '<path stroke-width="1.4" d="M0 0Q');
  };
  HELM.branchcrown = (ctx, A, c) => {
    const q = Q(A), W = c.wood, L = c.leaf || '#5e9a3a';
    let s = OL(`M${q(-0.6, -0.8)}Q${q(-1.2, -1.4)} ${q(-1.5, -2.0)}M${q(-1.0, -1.3)}L${q(-1.6, -1.3)}M${q(0.6, -0.8)}Q${q(1.2, -1.4)} ${q(1.5, -2.0)}M${q(1.0, -1.3)}L${q(1.6, -1.3)}M${q(0, -0.95)}V${A.cy - A.ry * 1.8}`, W, 2.6);
    for (const [u, v, a] of [[-1.5, -2.0, -30], [-1.6, -1.3, -70], [1.5, -2.0, 30], [1.6, -1.3, 70], [0, -1.8, 0]]) s += leaf(A.cx + u * A.rx, A.cy + v * A.ry, 7, 2.6, a, L);
    return s;
  };
  HELM.antlerhelm = (ctx, A, c) => {
    const q = Q(A), an = '#e4d3ad';
    let s = OL(`M${q(-0.7, -1.0)}C${q(-1.2, -1.5)} ${q(-1.5, -1.6)} ${q(-1.75, -2.25)}M${q(-1.15, -1.42)}L${q(-1.65, -1.38)}M${q(-1.45, -1.8)}L${q(-1.15, -2.2)}M${q(0.7, -1.0)}C${q(1.2, -1.5)} ${q(1.5, -1.6)} ${q(1.75, -2.25)}M${q(1.15, -1.42)}L${q(1.65, -1.38)}M${q(1.45, -1.8)}L${q(1.15, -2.2)}`, an, 2);
    s += P(`M${q(-1.06, -0.25)}C${q(-1.1, -1.42)} ${q(1.1, -1.42)} ${q(1.06, -0.25)}Q${q(0, -0.5)} ${q(-1.06, -0.25)}Z`, grad(ctx, c.metal, 0.3, 'd'));
    s += leaf(A.cx, A.cy - A.ry * 0.45, A.ry * 0.5, A.rx * 0.14, 180, c.leaf || '#5e9a3a');
    return s;
  };
  HELM.hornhelm = (ctx, A, c) => {
    const q = Q(A);
    return P(`M${q(-0.92, -0.85)}Q${q(-1.75, -0.8)} ${q(-1.6, -1.75)}Q${q(-1.38, -1.15)} ${q(-0.75, -1.18)}Z`, c.bone) + P(`M${q(0.92, -0.85)}Q${q(1.75, -0.8)} ${q(1.6, -1.75)}Q${q(1.38, -1.15)} ${q(0.75, -1.18)}Z`, c.bone)
      + P(`M${q(-1.06, -0.28)}C${q(-1.1, -1.42)} ${q(1.1, -1.42)} ${q(1.06, -0.28)}Q${q(0, -0.48)} ${q(-1.06, -0.28)}Z`, grad(ctx, c.metal, 0.3, 'd'))
      + `<path d="M${q(-0.6, -0.55)}l0.1 -2M${q(0, -0.6)}l0 -2.2M${q(0.6, -0.55)}l-0.1 -2" fill="none" stroke-width="1"/>`;
  };
  HELM.skullhelm = (ctx, A, c, f) => {
    const q = Q(A), b = c.bone;
    let s = P(`M${q(-0.85, -0.95)}Q${q(-2.15, -0.85)} ${q(-1.8, -2.05)}Q${q(-1.6, -1.25)} ${q(-0.7, -1.25)}Z`, '#3a2c26') + P(`M${q(0.85, -0.95)}Q${q(2.15, -0.85)} ${q(1.8, -2.05)}Q${q(1.6, -1.25)} ${q(0.7, -1.25)}Z`, '#3a2c26');
    s += P(`M${q(-1.8, -2.05)}l1.5 2.3l1.2 -1.6ZM${q(1.8, -2.05)}l-1.5 2.3l-1.2 -1.6Z`, c.accent, ' stroke-width="1"');
    if (f.crest) s += P(`M${q(-0.25, -1.25)}L${q(0, -2.0)}L${q(0.25, -1.25)}Z`, c.accent);
    s += P(`M${q(-1.12, -0.12)}C${q(-1.22, -1.5)} ${q(1.22, -1.5)} ${q(1.12, -0.12)}Q${q(0.62, 0.02)} ${q(0.4, -0.24)}Q${q(0, -0.04)} ${q(-0.4, -0.24)}Q${q(-0.62, 0.02)} ${q(-1.12, -0.12)}Z`, grad(ctx, b, 0.2, 'd'));
    s += E(A.cx - A.rx * 0.4, A.cy - A.ry * 0.68, A.rx * 0.2, A.ry * 0.14, '#2b1d12', NS) + E(A.cx + A.rx * 0.4, A.cy - A.ry * 0.68, A.rx * 0.2, A.ry * 0.14, '#2b1d12', NS);
    s += P(`M${q(-0.08, -0.5)}L${q(0, -0.36)}L${q(0.08, -0.5)}Z`, INK, ' stroke-width="0.8"');
    return s;
  };
  HELM.skullmask = (ctx, A, c) => {
    const q = Q(A);
    let s = OL(`M${q(-0.5, -1.0)}Q${q(-1.6, -1.3)} ${q(-1.4, -2.1)}M${q(0.5, -1.0)}Q${q(1.6, -1.3)} ${q(1.4, -2.1)}`, '#e9dcbc', 1.8);
    s += P(`M${q(-0.75, -0.55)}Q${q(-0.85, -1.35)} ${q(0, -1.38)}Q${q(0.85, -1.35)} ${q(0.75, -0.55)}L${q(0.3, -0.3)}L${q(0, -0.45)}L${q(-0.3, -0.3)}Z`, grad(ctx, c.bone, 0.2));
    s += C(A.cx - A.rx * 0.32, A.cy - A.ry * 0.82, A.rx * 0.14, c.glow || '#ff8a3a', ' stroke-width="1"') + C(A.cx + A.rx * 0.32, A.cy - A.ry * 0.82, A.rx * 0.14, c.glow || '#ff8a3a', ' stroke-width="1"');
    s += leaf(A.cx - A.rx * 1.0, A.cy - A.ry * 0.5, A.ry * 0.8, 2.2, -30, c.accent) + leaf(A.cx + A.rx * 1.0, A.cy - A.ry * 0.5, A.ry * 0.8, 2.2, 30, '#2b1d12');
    return s;
  };
  HELM.wolfpelt = (ctx, A, c) => {
    const q = Q(A), fur = '#7d746a';
    let s = P(`M${q(0, -1.3)}C${q(1.35, -1.3)} ${q(1.35, -0.1)} ${q(1.3, 0.7)}Q${q(1.5, 1.4)} ${q(2.0, 1.95)}L${q(ctx.gear.mount ? -1.3 : -2.0, 1.95)}Q${q(ctx.gear.mount ? -1.25 : -1.5, 1.4)} ${q(-1.3, 0.7)}C${q(-1.35, -0.1)} ${q(-1.35, -1.3)} ${q(0, -1.3)}ZM${q(0, -0.75)}C${q(-0.92, -0.75)} ${q(-0.92, 1.05)} ${q(0, 1.05)}C${q(0.92, 1.05)} ${q(0.92, -0.75)} ${q(0, -0.75)}Z`, grad(ctx, fur), ' fill-rule="evenodd"');
    s += P(`M${q(-0.95, -0.95)}L${q(-0.85, -1.85)}L${q(-0.3, -1.25)}ZM${q(0.95, -0.95)}L${q(0.85, -1.85)}L${q(0.3, -1.25)}Z`, shade(fur, -0.2));
    s += P(`M${q(-0.65, -1.05)}Q${q(0, -1.45)} ${q(0.65, -1.05)}Q${q(0.45, -0.55)} ${q(0, -0.45)}Q${q(-0.45, -0.55)} ${q(-0.65, -1.05)}Z`, shade(fur, 0.12));
    s += E(A.cx, A.cy - A.ry * 0.5, A.rx * 0.12, A.ry * 0.07, INK, NS) + `<path d="M${q(-0.42, -0.5)}l1 1.6l1 -1.6l1 1.6l1 -1.6M${q(0.42, -0.5)}" fill="#fff" stroke-width="0.8"/>`;
    s += C(A.cx - A.rx * 0.32, A.cy - A.ry * 0.95, 0.9, c.glow, NS) + C(A.cx + A.rx * 0.32, A.cy - A.ry * 0.95, 0.9, c.glow, NS);
    return s;
  };
  HELM.bandana = (ctx, A, c) => {
    const q = Q(A), col = c.realm;
    return P(`M${q(-1.04, -0.38)}C${q(-1.05, -1.38)} ${q(1.05, -1.38)} ${q(1.04, -0.38)}Q${q(0, -0.58)} ${q(-1.04, -0.38)}Z`, grad(ctx, col))
      + P(`M${q(1.0, -0.5)}Q${q(1.6, -0.4)} ${q(1.75, 0.1)}L${q(1.4, -0.05)}L${q(1.45, 0.35)}Q${q(1.15, -0.1)} ${q(0.98, -0.3)}Z`, shade(col, -0.15));
  };
  HELM.fincap = (ctx, A, c) => {
    const q = Q(A), m = c.metal;
    let s = P(`M${q(-0.3, -1.2)}Q${q(0.2, -2.0)} ${q(1.0, -1.95)}Q${q(0.75, -1.6)} ${q(0.95, -1.15)}Q${q(0.6, -1.2)} ${q(0.4, -1.05)}Z`, c.realm);
    s += `<path d="M${q(0.1, -1.35)}L${q(0.6, -1.85)}M${q(0.35, -1.2)}L${q(0.8, -1.55)}" fill="none" stroke-width="0.9"/>`;
    s += P(`M${q(-1.06, -0.28)}C${q(-1.1, -1.42)} ${q(1.1, -1.42)} ${q(1.06, -0.28)}Q${q(0, -0.48)} ${q(-1.06, -0.28)}Z`, grad(ctx, m, 0.3, 'd'));
    s += `<path d="M${q(-0.7, -0.6)}q2 -1.2 4 0q2 -1.2 4 0q2 -1.2 4 0M${q(-0.55, -0.95)}q2 -1.1 3.6 0q2 -1.1 3.6 0" fill="none" stroke-width="0.9"/>`;
    return s;
  };
  HELM.shellhelm = (ctx, A, c) => {
    const q = Q(A), sh = c.shell || '#efd6c4';
    let s = P(`M${q(-1.2, -0.2)}C${q(-1.6, -1.75)} ${q(1.6, -1.75)} ${q(1.2, -0.2)}L${q(1.15, 0.5)}L${q(0.8, 0.35)}L${q(0.8, -0.3)}Q${q(0, -0.48)} ${q(-0.8, -0.3)}L${q(-0.8, 0.35)}L${q(-1.15, 0.5)}Z`, grad(ctx, sh, 0.15, 'd'));
    for (let i = -3; i <= 3; i++) s += `<path d="M${q(0, -0.3)}L${q(i * 0.36, -1.45 + Math.abs(i) * 0.12)}" fill="none" stroke="${c.coral || '#e0705a'}" stroke-width="1.1"/>`;
    s += P(`M${q(-0.5, -0.4)}Q${q(0, -0.65)} ${q(0.5, -0.4)}L${q(0.3, -0.18)}Q${q(0, -0.3)} ${q(-0.3, -0.18)}Z`, c.coral || '#e0705a', ' stroke-width="1.2"');
    return s;
  };
  HELM.coralhelm = (ctx, A, c) => {
    const q = Q(A), co = c.coral || '#e0705a';
    let s = OL(`M${q(-0.6, -1.0)}L${q(-0.9, -1.7)}L${q(-1.25, -1.9)}M${q(-0.9, -1.7)}L${q(-0.75, -2.05)}M${q(0.2, -1.1)}L${q(0.35, -2.0)}M${q(0.35, -1.6)}L${q(0.75, -1.85)}M${q(0.75, -0.95)}L${q(1.25, -1.5)}`, co, 2.2);
    s += P(`M${q(-1.18, -0.16)}C${q(-1.25, -1.5)} ${q(1.25, -1.5)} ${q(1.18, -0.16)}L${q(1.1, 0.6)}L${q(0.7, 0.45)}L${q(0.66, -0.25)}Q${q(0, -0.42)} ${q(-0.66, -0.25)}L${q(-0.7, 0.45)}L${q(-1.1, 0.6)}Z`, grad(ctx, c.metal, 0.3, 'd'));
    s += C(A.cx, A.cy - A.ry * 0.62, 1.6, c.accent, ' stroke-width="1"') + C(A.cx - A.rx * 0.95, A.cy + A.ry * 0.1, 1, co, NS) + C(A.cx + A.rx * 0.95, A.cy + A.ry * 0.1, 1, co, NS);
    return s;
  };
  HELM.thorncirclet = (ctx, A, c, f) => {
    const q = Q(A), th = c.thorn || '#3d2f2a';
    let s = '';
    if (f.tall) s += P(`M${q(-0.5, -0.75)}L${q(-0.7, -1.9)}L${q(-0.25, -0.85)}ZM${q(0.5, -0.75)}L${q(0.7, -1.9)}L${q(0.25, -0.85)}ZM${q(-0.12, -0.82)}L${q(0, -2.2)}L${q(0.12, -0.82)}Z`, shade(th, 0.2), ' stroke-width="1.2"');
    s += OL(`M${q(-1.03, -0.5)}Q${q(0, -0.8)} ${q(1.03, -0.5)}`, th, 1.6);
    for (let i = -4; i <= 4; i++) { const u = i * 0.24, v = -0.62 - (1 - Math.abs(i) / 5) * 0.12; s += P(`M${q(u - 0.07, v + 0.05)}L${q(u + 0.08 * Math.sign(i || 1), v - 0.3)}L${q(u + 0.07, v + 0.05)}Z`, th, ' stroke-width="0.8"'); }
    s += P(`M${q(0, -0.92)}L${q(0.14, -0.72)}L${q(0, -0.52)}L${q(-0.14, -0.72)}Z`, c.accent, ' stroke-width="1"');
    return s;
  };
  HELM.mirrormask = (ctx, A, c) => {
    const q = Q(A);
    let s = HELM.thorncirclet(ctx, A, c, {});
    s += P(`M${q(-0.98, -0.56)}Q${q(0, -0.8)} ${q(0.98, -0.56)}L${q(0.88, 0.12)}Q${q(0.45, 0.32)} ${q(0, 0.1)}Q${q(-0.45, 0.32)} ${q(-0.88, 0.12)}Z`, grad(ctx, c.metal, 0.35, 'd'));
    s += P(`M${q(-0.7, -0.22)}Q${q(-0.4, -0.42)} ${q(-0.15, -0.22)}Q${q(-0.4, -0.3)} ${q(-0.7, -0.22)}ZM${q(0.7, -0.22)}Q${q(0.4, -0.42)} ${q(0.15, -0.22)}Q${q(0.4, -0.3)} ${q(0.7, -0.22)}Z`, '#1a1020', ' stroke-width="1"');
    s += `<path d="M${q(-0.6, -0.5)}L${q(-0.3, 0.05)}M${q(0.45, -0.55)}L${q(0.7, -0.1)}" fill="none" stroke="#fff" stroke-width="1.2" opacity=".8"/>`;
    return s;
  };
  HELM.moonhelm = (ctx, A, c) => {
    const q = Q(A), dk = c.dark || '#3b2c4f';
    let s = P(`M${q(-0.55, -1.2)}Q${q(-0.9, -2.1)} ${q(0, -2.15)}Q${q(-0.45, -1.85)} ${q(-0.15, -1.25)}Z`, c.metal, ' stroke-width="1.6"');
    s += P(`M${q(-1.15, 0.2)}C${q(-1.25, -1.5)} ${q(1.25, -1.5)} ${q(1.15, 0.2)}L${q(0.9, 1.0)}L${q(0, 1.15)}L${q(-0.9, 1.0)}Z`, grad(ctx, dk, 0.3, 'd'));
    s += P(`M${q(-0.78, -0.32)}Q${q(0, -0.12)} ${q(0.78, -0.32)}L${q(0.7, -0.15)}Q${q(0, 0.05)} ${q(-0.7, -0.15)}Z`, c.glow, ' stroke-width="1"');
    s += `<path d="M${q(0, -1.15)}V${n(A.cy - A.ry * 0.38)}M${q(0, 0.15)}V${n(A.cy + A.ry * 1.05)}" fill="none" stroke="${c.metal}" stroke-width="1.2"/>`;
    s += P(`M${q(-1.12, -0.3)}L${q(-1.5, -0.6)}L${q(-1.15, -0.05)}ZM${q(1.12, -0.3)}L${q(1.5, -0.6)}L${q(1.15, -0.05)}Z`, dk);
    return s;
  };
  HELM.tombhelm = (ctx, A, c, f) => {
    const q = Q(A), m = '#7d7868';
    let s = f.crown ? HELM.rustcrown(ctx, { cx: A.cx, cy: A.cy - A.ry * 0.55, rx: A.rx * 1.08, ry: A.ry }, c) : '';
    s += P(`M${q(-1.14, 0.25)}L${q(-1.14, -0.5)}C${q(-1.14, -1.45)} ${q(1.14, -1.45)} ${q(1.14, -0.5)}L${q(1.14, 0.25)}L${q(0.9, 1.05)}H${q(-0.9, 1.05).split(' ')[0]}Z`, grad(ctx, m, 0.3, 'd'));
    s += P(`M${q(-0.8, -0.38)}H${q(0.8, -0.38).split(' ')[0]}V${q(0, 0.75).split(' ')[1]}H${q(-0.8, 0.75).split(' ')[0]}Z`, '#140f0c', ' stroke-width="1.2"');
    s += C(A.cx - A.rx * 0.38, A.cy - A.ry * 0.12, 1.3, c.glow, NS) + C(A.cx + A.rx * 0.38, A.cy - A.ry * 0.12, 1.3, c.glow, NS);
    s += `<path d="M${q(-0.8, 0.12)}H${n(A.cx + A.rx * 0.8)}M${q(-0.8, 0.45)}H${n(A.cx + A.rx * 0.8)}M${q(-0.27, -0.38)}V${n(A.cy + A.ry * 0.75)}M${q(0.27, -0.38)}V${n(A.cy + A.ry * 0.75)}" fill="none" stroke="${m}" stroke-width="1.3"/>`;
    s += C(A.cx - A.rx * 0.7, A.cy - A.ry * 0.85, 1.3, c.rust || '#8a4b2a', NS) + C(A.cx + A.rx * 0.6, A.cy + A.ry * 0.85, 1.1, c.rust || '#8a4b2a', NS);
    return s;
  };
  HELM.rustcrown = (ctx, A, c) => {
    const q = Q(A), r = '#9a7a3a';
    return `<g transform="rotate(-7 ${n(A.cx)} ${n(A.cy)})">` + P(`M${q(-0.95, -0.5)}L${q(-1.05, -1.25)}L${q(-0.62, -0.85)}L${q(-0.35, -1.45)}L${q(0, -0.92)}L${q(0.35, -1.5)}L${q(0.62, -0.85)}L${q(1.05, -1.3)}L${q(0.95, -0.5)}Q${q(0, -0.72)} ${q(-0.95, -0.5)}Z`, grad(ctx, r, 0.25))
      + C(A.cx - A.rx * 0.5, A.cy - A.ry * 0.68, 1.2, c.rust || '#8a4b2a', NS) + C(A.cx + A.rx * 0.2, A.cy - A.ry * 0.72, 1.3, c.glow, ' stroke-width="0.8"') + '</g>';
  };
  HELM.hood = (ctx, A, c, f) => {
    const q = Q(A);
    const col = f.spy ? '#3b3340' : f.scout ? c.hood : f.leaf ? (c.hood || '#3f6a34') : f.skull ? '#2a2526' : f.rune ? c.leather : f.tatter ? (c.hood || '#3d4247') : c.hood;
    const peak = f.spy || f.scout || f.leaf ? q(0.25, -1.8) : q(0, -1.45);
    const bottom = f.tatter ? `L${q(1.6, 1.95)}L${q(1.2, 1.7)}L${q(0.8, 1.95)}L${q(0.3, 1.7)}L${q(-0.2, 1.95)}L${q(-0.7, 1.7)}L${q(-1.2, 1.95)}L${q(-1.6, 1.7)}L${q(-2.0, 1.95)}` : `L${q(ctx.gear.mount ? -1.3 : -2.05, 1.95)}`;
    let s = P(`M${peak}C${q(1.3, -1.45)} ${q(1.38, -0.2)} ${q(1.32, 0.7)}Q${q(1.42, 1.4)} ${q(2.05, 1.95)}${bottom}Q${q(ctx.gear.mount ? -1.25 : -1.42, 1.4)} ${q(-1.32, 0.7)}C${q(-1.38, -0.2)} ${q(-1.3, -1.45)} ${peak}ZM${q(0, -0.92)}C${q(-0.98, -0.92)} ${q(-0.98, 1.05)} ${q(0, 1.05)}C${q(0.98, 1.05)} ${q(0.98, -0.92)} ${q(0, -0.92)}Z`, grad(ctx, col, 0.25, 'd'), ' fill-rule="evenodd"');
    s += `<path d="M${q(0, -0.92)}C${q(-0.98, -0.92)} ${q(-0.98, 1.05)} ${q(0, 1.05)}" fill="none" stroke="${shade(col, -0.5)}" stroke-width="2.2" opacity=".7"/>`;
    if (f.rune) s += `<path d="M${q(-0.3, -1.12)}l1 -1.4l1 1.4l1 -1.4l1 1.4" fill="none" stroke="${c.glow}" stroke-width="1.1"/>`;
    if (f.skull) s += P(`M${q(-0.22, -1.25)}A2.4 2.4 0 1 1 ${q(0.22, -1.25)}L${q(0.15, -1.05)}H${n(A.cx - A.rx * 0.15)}Z`, c.bone || '#ddd', ' stroke-width="1"');
    if (f.spy || f.leaf || f.scout) s += `<path d="M${q(-1.5, 1.55)}Q${q(0, 2.2)} ${q(1.5, 1.55)}" fill="none" stroke="${f.spy ? c.realm : c.accent}" stroke-width="1.6"/>`;
    return s;
  };
  HELM.stonehelm = (ctx, A, c) => {
    const q = Q(A), m = '#9aa0a0';
    return P(`M${q(-1.15, 0.6)}L${q(-1.12, -0.4)}Q${q(-0.9, -1.6)} ${q(0, -2.0)}Q${q(0.9, -1.6)} ${q(1.12, -0.4)}L${q(1.15, 0.6)}L${q(0.75, 0.45)}L${q(0.72, -0.3)}Q${q(0, -0.48)} ${q(-0.72, -0.3)}L${q(-0.75, 0.45)}Z`, grad(ctx, m, 0.3, 'd'))
      + P(`M${q(-0.1, -0.42)}L${q(0.1, -0.42)}L${q(0.08, 0.15)}L${q(-0.08, 0.15)}Z`, m, ' stroke-width="1.3"')
      + `<path d="M${q(-0.6, -1.1)}L${q(-0.2, -0.8)}L${q(0.3, -1.25)}M${q(0.9, -0.3)}L${q(0.95, 0.3)}" fill="none" stroke-width="0.9"/>`
      + leaf(A.cx + A.rx * 0.2, A.cy - A.ry * 1.85, 9, 2.2, 35, c.feather || '#f3efe4');
  };
  HELM.feathercrest = (ctx, A, c, f) => {
    const q = Q(A), fe = c.feather || '#f3efe4';
    let s = '';
    const n0 = 6;
    for (let i = 0; i < n0; i++) {
      const a = -55 + i * 20, len = A.ry * (1.05 + (i === 2 || i === 3 ? 0.25 : 0.05));
      const x = A.cx + A.rx * (-0.3 + i * 0.14), y = A.cy - A.ry * 0.95;
      s += leaf(x, y, len, A.rx * 0.17, a, i % 2 ? fe : shade(fe, -0.08)) + leaf(x, y, len, A.rx * 0.17, a, 'none').replace('d="M0 0', 'd="M0 ' + n(-len * 0.62)).replace(/Q[\d.-]+ [\d.-]+ 0 [\d.-]+Q[\d.-]+ [\d.-]+ 0 0Z/, `L0 ${n(-len)}`);
      s += `<path d="M0 ${n(-len * 0.68)}Q${n(A.rx * 0.1)} ${n(-len * 0.82)} 0 ${n(-len)}Q${n(-A.rx * 0.1)} ${n(-len * 0.82)} 0 ${n(-len * 0.68)}Z" fill="${f.storm ? c.accent : c.realm}" stroke-width="0.8"${T(x, y, a)}/>`;
    }
    s += P(`M${q(-1.07, -0.25)}C${q(-1.12, -1.42)} ${q(1.12, -1.42)} ${q(1.07, -0.25)}Q${q(0, -0.48)} ${q(-1.07, -0.25)}Z`, grad(ctx, c.metal, 0.35, 'd'));
    s += P(`M${q(-1.07, -0.25)}Q${q(0, -0.48)} ${q(1.07, -0.25)}L${q(0.7, -0.05)}L${q(0, 0.05)}L${q(-0.7, -0.05)}Z`, shade(c.metal, -0.2), ' stroke-width="1.3"');
    if (f.storm) s += `<path d="M${q(-0.4, -0.95)}l2 1.2l-1.6 0.6l2 1.4" fill="none" stroke="${c.accent}" stroke-width="1.1"/>`;
    return s;
  };
  HELM.featherband = (ctx, A, c) => {
    const q = Q(A), fe = c.feather || '#f3efe4';
    let s = leaf(A.cx + A.rx * 0.85, A.cy - A.ry * 0.55, A.ry * 1.1, A.rx * 0.2, 28, fe) + leaf(A.cx + A.rx * 0.75, A.cy - A.ry * 0.6, A.ry * 0.85, A.rx * 0.16, 8, c.realm);
    s += OL(`M${q(-1.03, -0.45)}Q${q(0, -0.72)} ${q(1.03, -0.45)}`, c.leather, 1.8);
    return s;
  };
  HELM.feathermitre = (ctx, A, c) => {
    const q = Q(A), fe = c.feather || '#f3efe4';
    let s = '';
    for (let i = -3; i <= 3; i++) s += leaf(A.cx + i * A.rx * 0.18, A.cy - A.ry * 0.7, A.ry * (1.15 - Math.abs(i) * 0.12), A.rx * 0.16, i * 14, i % 2 ? fe : c.realm);
    s += OL(`M${q(-1.03, -0.5)}Q${q(0, -0.76)} ${q(1.03, -0.5)}`, c.accent, 1.8);
    s += P(`M${q(0, -0.92)}l-1.4 2.4h2l-1.2 2.4`, 'none', ` stroke="${c.accent}" stroke-width="1"`);
    return s;
  };
  HELM.wizardhat = (ctx, A, c, f) => {
    const q = Q(A), mg = ctx.kind === 'magus', col = mg ? mix(ctx.schoolCol || '#4f4a78', '#2a2440', 0.45) : '#4f4a78', tall = f && f.grand ? 0.55 : 0;
    let s = P(`M${q(-0.92, -0.55)}Q${q(-0.35, -1.5 - tall * 0.6)} ${q(0.35, -2.25 - tall)}Q${q(0.85, -2.05 - tall)} ${q(1.25 + tall * 0.4, -2.15 - tall * 0.7)}Q${q(0.7, -1.8 - tall * 0.5)} ${q(0.55, -1.4)}Q${q(0.6, -0.9)} ${q(0.95, -0.55)}Z`, grad(ctx, col, 0.3, 'd'))
      + P(`M${q(-1.7, -0.45)}Q${q(0, -0.95)} ${q(1.7, -0.45)}Q${q(0, -0.2)} ${q(-1.7, -0.45)}Z`, shade(col, -0.15))
      + P(`M${q(-0.92, -0.62)}Q${q(0, -0.92)} ${q(0.95, -0.62)}L${q(0.85, -0.8)}Q${q(0, -1.05)} ${q(-0.82, -0.8)}Z`, mg ? c.gold : c.realm, ' stroke-width="1.2"')
      + P(`M${q(0.05, -1.45)}l0.8 1.6l1.7 0.2l-1.3 1.1l0.4 1.7l-1.6 -0.9l-1.6 0.9l0.4 -1.7l-1.3 -1.1l1.7 -0.2Z`, mg ? c.glow : c.accent, ' stroke-width="0.7"');
    if (tall) s += C(A.cx - A.rx * 0.35, A.cy - A.ry * 1.25, 0.8, '#f2d36a', NS) + C(A.cx + A.rx * 0.5, A.cy - A.ry * 1.75, 0.7, '#f2d36a', NS) + C(A.cx - A.rx * 0.05, A.cy - A.ry * 2.0, 0.6, '#f2d36a', NS) + C(A.cx + A.rx * (1.25 + tall * 0.4 + 0.22), A.cy - A.ry * (2.15 + tall * 0.7), 1.4, c.gold, ' stroke-width="0.8"');
    return s;
  };
  HELM.mitre = (ctx, A, c) => {
    const q = Q(A), col = '#f1e8d2';
    return P(`M${q(-0.78, -0.55)}L${q(-0.82, -1.45)}Q${q(-0.4, -1.85)} ${q(0, -2.15)}Q${q(0.4, -1.85)} ${q(0.82, -1.45)}L${q(0.78, -0.55)}Q${q(0, -0.72)} ${q(-0.78, -0.55)}Z`, grad(ctx, col, 0.1, 'd'))
      + `<path d="M${q(0, -2.1)}V${n(A.cy - A.ry * 0.62)}M${q(-0.8, -0.7)}Q${q(0, -0.88)} ${q(0.8, -0.7)}" fill="none" stroke="${c.accent}" stroke-width="2.2"/>`
      + C(A.cx, A.cy - A.ry * 1.35, 2.2, c.realm, ' stroke-width="1.1"');
  };
  const circlet = (ctx, A, c, gem, extra = '') => {
    const q = Q(A);
    return OL(`M${q(-1.03, -0.5)}Q${q(0, -0.78)} ${q(1.03, -0.5)}`, c.accent === '#f2e6c8' ? '#d9b65a' : '#d9b65a', 1.7) + extra + C(A.cx, A.cy - A.ry * 0.66, 1.9, gem, ' stroke-width="1.1"');
  };
  HELM.circlet = (ctx, A, c) => circlet(ctx, A, c, c.realm);
  HELM.mooncirclet = (ctx, A, c) => { const q = Q(A); return circlet(ctx, A, c, c.glow, P(`M${q(0.3, -1.25)}A3.6 3.6 0 1 0 ${q(0.3, -0.75)}A2.8 2.8 0 1 1 ${q(0.3, -1.25)}Z`, '#e8eefa', ' stroke-width="1"')); };
  HELM.pearlcirclet = (ctx, A, c) => { let s = circlet(ctx, A, c, c.glow); for (let i = -3; i <= 3; i++) if (i) s += C(A.cx + i * A.rx * 0.28, A.cy - A.ry * (0.58 + (1 - Math.abs(i) / 3.5) * 0.1), 1.1, '#fbf6ea', ' stroke-width="0.7"'); return s; };
  const CROWN = { hearth: 'fleur', delver: 'battle', sylvan: 'antler', ash: 'horn', tide: 'coral', veil: 'thorn', grave: 'rust', wind: 'wing' };
  HELM.crown = (ctx, A, c) => {
    const q = Q(A), gold = '#e0b23c', st = CROWN[ctx.race] || 'fleur';
    let pts;
    if (st === 'battle') pts = `L${q(-1.0, -1.25)}L${q(-0.6, -1.25)}L${q(-0.6, -1.0)}L${q(-0.2, -1.0)}L${q(-0.2, -1.3)}L${q(0.2, -1.3)}L${q(0.2, -1.0)}L${q(0.6, -1.0)}L${q(0.6, -1.25)}L${q(1.0, -1.25)}`;
    else if (st === 'thorn' || st === 'horn') pts = `L${q(-1.15, -1.55)}L${q(-0.6, -0.95)}L${q(-0.3, -1.75)}L${q(0, -1.0)}L${q(0.3, -1.75)}L${q(0.6, -0.95)}L${q(1.15, -1.55)}`;
    else if (st === 'wing') pts = `Q${q(-1.6, -1.2)} ${q(-1.35, -1.75)}Q${q(-0.8, -1.2)} ${q(-0.35, -1.05)}L${q(0, -1.55)}L${q(0.35, -1.05)}Q${q(0.8, -1.2)} ${q(1.35, -1.75)}Q${q(1.6, -1.2)} ${q(1.0, -0.6)}`;
    else pts = `L${q(-1.05, -1.3)}L${q(-0.55, -0.98)}L${q(-0.3, -1.45)}L${q(0, -1.05)}L${q(0.3, -1.45)}L${q(0.55, -0.98)}L${q(1.05, -1.3)}`;
    const col = st === 'rust' ? '#a8873e' : st === 'horn' ? '#4a403a' : st === 'thorn' ? '#d8dcef' : st === 'coral' ? '#f0c06a' : gold;
    let s = '';
    if (st === 'antler') s += OL(`M${q(-0.6, -0.8)}Q${q(-1.2, -1.3)} ${q(-1.3, -1.9)}M${q(-1.0, -1.2)}l-2 -1M${q(0.6, -0.8)}Q${q(1.2, -1.3)} ${q(1.3, -1.9)}M${q(1.0, -1.2)}l2 -1`, '#e8d8b0', 1.8);
    if (st === 'coral') s += OL(`M${q(-0.6, -0.8)}L${q(-0.8, -1.6)}M${q(0, -0.85)}L${q(0, -1.75)}M${q(0.6, -0.8)}L${q(0.8, -1.6)}M${q(0, -1.35)}l2 -1.5`, c.coral || '#e0705a', 1.8);
    s += P(`M${q(-0.98, -0.5)}${pts}L${q(0.98, -0.5)}Q${q(0, -0.72)} ${q(-0.98, -0.5)}Z`, grad(ctx, col, 0.3));
    s += C(A.cx, A.cy - A.ry * 0.7, 1.8, c.realm, ' stroke-width="1"') + C(A.cx - A.rx * 0.6, A.cy - A.ry * 0.62, 1.1, '#5fb0e8', ' stroke-width="0.8"') + C(A.cx + A.rx * 0.6, A.cy - A.ry * 0.62, 1.1, '#5fb0e8', ' stroke-width="0.8"');
    return s;
  };
  HELM.cap = (ctx, A, c, f) => {
    const q = Q(A), col = f.feather ? c.realm : shade(c.realm, -0.25);
    let s = '';
    if (f.feather) s += leaf(A.cx + A.rx * 0.6, A.cy - A.ry * 0.95, A.ry * 1.3, A.rx * 0.2, 55, c.feather || '#f3efe4');
    s += P(`M${q(-1.12, -0.45)}Q${q(-1.3, -1.45)} ${q(0, -1.42)}Q${q(1.4, -1.35)} ${q(1.25, -0.6)}Q${q(0, -0.8)} ${q(-1.12, -0.45)}Z`, grad(ctx, col));
    s += P(`M${q(-1.12, -0.45)}Q${q(0, -0.8)} ${q(1.25, -0.6)}L${q(1.2, -0.42)}Q${q(0, -0.62)} ${q(-1.08, -0.28)}Z`, shade(col, -0.3), ' stroke-width="1.3"');
    return s;
  };
  HELM.strawhat = (ctx, A, c) => {
    const q = Q(A), st = '#d9b86a';
    return P(`M${q(-1.75, -0.35)}Q${q(0, -0.85)} ${q(1.75, -0.35)}Q${q(0, -0.1)} ${q(-1.75, -0.35)}Z`, grad(ctx, st, 0.2))
      + P(`M${q(-0.85, -0.55)}Q${q(-0.8, -1.3)} ${q(0, -1.32)}Q${q(0.8, -1.3)} ${q(0.85, -0.55)}Z`, st)
      + `<path d="M${q(-0.85, -0.66)}Q${q(0, -0.85)} ${q(0.85, -0.66)}" fill="none" stroke="${c.realm}" stroke-width="1.8"/>`;
  };

  // helmets grow more elaborate with the era: 0 bare (no plumes, crests or bands), 2 plumes/crests and
  // trim, 3 gilded brow band with a glowing gem
  const PLUMED = ['kettle', 'nasal', 'hornhelm', 'tombhelm'];
  const METAL_HELM = ['kettle', 'barbute', 'nasal', 'greathelm', 'hornhelm', 'fincap', 'coralhelm', 'moonhelm', 'tombhelm', 'stonehelm', 'feathercrest', 'antlerhelm', 'skullhelm', 'shellhelm'];
  const drawHelm = (ctx, h, i) => {
    const [t, ...fl] = h.split(':');
    const f = {}; for (const x of fl) f[x] = 1;
    const A = anat(ctx).head, c = colorsOf(ctx), e = c.era;
    if (!HELM[t]) return '';
    if (e === 0) { delete f.plume; delete f.band; delete f.crest; }
    let pre = '', post = '';
    if (e >= 2 && i === 0) {
      if (t === 'barbute') f.plume = 1; else if (t === 'greathelm' || t === 'skullhelm') f.crest = 1; else if (PLUMED.includes(t)) pre = plume(ctx, A, c.realm);
      if (e === 3 && t === 'barbute') f.band = 1;
    }
    if (e === 3 && i === 0) {
      const q = Q(A);
      if (METAL_HELM.includes(t)) post += `<path d="M${q(-0.9, -0.5)}Q${q(0, -0.74)} ${q(0.9, -0.5)}" fill="none" stroke="${c.gold}" stroke-width="1.4" stroke-dasharray="2.4 1"/>`;
      post += C(A.cx, A.cy - A.ry * (t === 'barbute' || t === 'moonhelm' ? 0.75 : 0.62), 2.8, glowGrad(ctx, c.glow), NS) + `<path d="M${q(0, -0.78)}l1.2 1.8l-1.2 1.8l-1.2 -1.8Z" fill="${c.glow}" stroke-width="0.8"${t === 'barbute' || t === 'moonhelm' ? ` transform="translate(0 ${n(-A.ry * 0.12)})"` : ''}/>`;
    } else if (e === 2 && t === 'hood' && i === 0) post += `<path d="M${Q(A)(-0.95, 0.6)}Q${Q(A)(-1.0, -0.95)} ${Q(A)(0, -0.98)}Q${Q(A)(1.0, -0.95)} ${Q(A)(0.95, 0.6)}" fill="none" stroke="${c.accent}" stroke-width="1.1" stroke-dasharray="1.6 1.2"/>`;
    return pre + HELM[t](ctx, A, c, f) + post;
  };

  // =====================================================================
  //  WEAPONS, SHIELDS, ARMOUR
  // =====================================================================
  // place a local drawing (pointing up, origin at its base) along a line
  const along = (x0, y0, x1, y1, k = 1.25) => { const a = Math.atan2(x1 - x0, -(y1 - y0)) * 180 / Math.PI; return T(x1, y1, a, k); };
  const shaft = (x0, y0, x1, y1, col, w = 2.4) => OL(`M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`, col, w);
  const HEADS = {
    leaf: m => `<path d="M0 1L-3 -4Q-3.4 -9 0 -15Q3.4 -9 3 -4L0 1Z" fill="${m}"/><path d="M0 -1V-12" fill="none" stroke-width="0.8"/>`,
    pike: m => `<path d="M0 1L-2.4 -3L0 -18L2.4 -3Z" fill="${m}"/><path d="M-3 0H3" stroke-width="2.4"/>`,
    jag: m => `<path d="M0 1L-3 -3L-1.5 -5L-3.5 -8L0 -15L3.5 -8L1.5 -5L3 -3Z" fill="${m}"/>`,
    trident: m => `<path d="M-6 -3Q-6 1 0 1Q6 1 6 -3L6 -11L4.5 -8L4.5 -3L1.4 -3L1.4 -15L0 -18L-1.4 -15L-1.4 -3L-4.5 -3L-4.5 -8L-6 -11Z" fill="${m}" stroke-width="1.6"/>`,
    harpoon: m => `<path d="M0 1L-1.6 -2L-1.6 -6L-5 -8L-1.4 -11L0 -18L1.4 -11L5 -8L1.6 -6L1.6 -2Z" fill="${m}" stroke-width="1.6"/>`,
    feather: (m, c) => `<path d="M0 1L-2.6 -4L0 -15L2.6 -4Z" fill="${m}"/><path d="M-2 1Q-7 4 -6 9Q-3 6 -1 3Z" fill="${c.feather || '#f3efe4'}" stroke-width="1"/>`,
    lance: (m, c) => `<path d="M-3 4L0 -30L3 4Z" fill="${m}" stroke-width="2"/><path d="M-6 6Q0 -2 6 6Z" fill="${c.realm}" stroke-width="1.6"/>`,
    halberd: m => `<path d="M0 0L0 -16M0 -4Q10 -6 9 -12Q5 -9 0 -10Z" fill="${m}"/><path d="M0 -2L-1.6 -6L0 -18L1.6 -6Z" fill="${m}"/><path d="M0 -6L-5 -9L-1 -9Z" fill="${m}" stroke-width="1.4"/>`,
    glaive: m => `<path d="M-1.6 1Q-3 -10 2 -22Q5 -10 1.8 1Z" fill="${m}"/><path d="M-4 1H4" stroke-width="2.4"/>`,
    scythe: m => `<path d="M0 0Q-4 -2 -12 2Q-20 7 -22 16Q-14 6 -4 4Q0 4 1.2 2Z" fill="${m}"/>`,
    axe: m => `<path d="M0 -2Q7 -4 8 -11Q10 -4 9 4Q7 0 0 2Z" fill="${m}"/>`,
    greataxe: m => `<path d="M0 -1Q9 -2 11 -10Q14 -1 11 9Q9 2 0 3ZM0 -1Q-6 -2 -7 -7Q-9 -1 -7 5Q-6 2 0 3Z" fill="${m}"/>`,
    hammer: m => `<path d="M-6 -6H6V3H-6Z" fill="${m}"/><path d="M-6 -1.5H6" fill="none" stroke-width="1"/>`,
    warhammer: (m, c) => `<path d="M-7 -6H5V4H-7Z" fill="${m}"/><path d="M5 -3L10 -1L5 1Z" fill="${m}"/><path d="M-4 -3l2 3l2 -3" fill="none" stroke="${c.glow}" stroke-width="1"/>`,
    club: m => `<path d="M-2 2Q-6 -8 -4 -14Q0 -19 4 -14Q6 -8 2 2Z" fill="${m}"/><path d="M-4 -10l-3 -1M4 -8l3 -1M-1 -15l-1 -3M3 -13l2 -2" fill="none" stroke-width="1.6"/>`,
    orb: (m, c, o) => o.era === 0 ? `<circle cy="-3" r="5" fill="${o.glow}" stroke="none" opacity=".5"/><path d="M-2.4 1Q-3.6 -3 0 -6Q3.6 -3 2.4 1Z" fill="${c.wood}" stroke-width="1.4"/><circle cy="-3" r="1.4" fill="${o.col}" stroke="none"/>`
      : o.era === 1 ? `<circle cy="-4" r="8" fill="${o.glow}" stroke="none" opacity=".75"/><circle cy="-4" r="3.3" fill="${o.col}" stroke-width="1.4"/><path d="M-3.5 1Q-4 -5 -2 -7M3.5 1Q4 -5 2 -7" fill="none" stroke-width="1.6"/>`
        : o.era === 2 ? `<circle cy="-6" r="10" fill="${o.glow}" stroke="none" opacity=".8"/><path d="M-5 1Q-7 -6 -3 -11M5 1Q7 -6 3 -11M0 1V-2" fill="none" stroke-width="3.4"/><path d="M-5 1Q-7 -6 -3 -11M5 1Q7 -6 3 -11" fill="none" stroke="${c.gold}" stroke-width="1.6"/><circle cy="-6" r="4.2" fill="${o.col}" stroke-width="1.4"/><circle cx="-1.3" cy="-7.3" r="1.2" fill="#fff" stroke="none"/>`
          : `<circle cy="-8" r="13" fill="${o.glow}" stroke="none"/><ellipse cy="-8" rx="9" ry="3" fill="none" stroke="${c.gold}" stroke-width="1.3" transform="rotate(-20 0 -8)"/><path d="M0 1L-4.5 -8L0 -18L4.5 -8Z" fill="${o.col}" stroke-width="1.5"/><path d="M0 -18L0 1M-4.5 -8H4.5" fill="none" stroke="#fff" stroke-width="0.8" opacity=".8"/><path d="M-6 1Q0 -3 6 1" fill="none" stroke="${c.gold}" stroke-width="2.2"/><path d="M8 -16l.8 1.8l1.8 .8l-1.8 .8l-.8 1.8l-.8 -1.8l-1.8 -.8l1.8 -.8Z" fill="#fff" stroke-width="0.5"/>`,
    crozier: m => `<path d="M0 0V-6Q0 -13 5 -13Q9 -13 9 -9Q9 -6 6 -6" fill="none" stroke-width="4.4"/><path d="M0 0V-6Q0 -13 5 -13Q9 -13 9 -9Q9 -6 6 -6" fill="none" stroke="${m}" stroke-width="2.2"/>`,
    banner: (m, c, o) => `<path d="M0 0L16 1Q13 6 16 11L0 12Z" fill="${o.cloth}"/>`,
    hoe: m => `<path d="M0 0L-7 1L-7 4L0 3Z" fill="${m}" stroke-width="1.6"/>`,
  };
  const SPEARHEAD = { hearth: 'leaf', delver: 'leaf', sylvan: 'leaf', ash: 'jag', tide: 'trident', veil: 'pike', grave: 'jag', wind: 'feather' };

  // weapon over the right shoulder: base bottom-right, tip up near the top-right of the frame
  const poleArm = (ctx, c, head, opt = {}) => {
    const x0 = opt.x0 ?? 70, y0 = opt.y0 ?? 99, x1 = opt.x1 ?? 84, y1 = opt.y1 ?? 26;
    const wood = opt.shaft || (ctx.race === 'grave' ? c.bone : ctx.race === 'veil' ? '#cfc6dd' : c.wood);
    let s = shaft(x0, y0, x1, y1, wood, (opt.w || 2.4) + 0.5);
    const e = c.era, rot = along(x0, y0, x1, y1);
    if (e === 3 && head !== 'orb' && head !== 'banner') s += `<circle cy="-9" r="9" fill="${glowGrad(ctx, c.glow)}" stroke="none"${rot}/>`;
    s += `<g${rot}>${HEADS[head](eraMetal(opt.metal || c.metal, e), c, opt)}</g>`;
    if (e >= 2 && head !== 'orb') s += `<g${rot}><path d="M-2.2 3H2.2V6H-2.2Z" fill="${e === 3 ? c.gold : shade(c.metal, 0.2)}" stroke-width="1"/>${e === 3 ? `<path d="M2 5Q6 8 4 14Q2 10 1 6Z" fill="${c.realm}" stroke-width="0.9"/>` : ''}</g>`;
    if (e === 0) s += `<g${rot}><path d="M-2 4l4 2M-2 7l4 2" fill="none" stroke="${c.leather}" stroke-width="1.2"/></g>`;
    return s;
  };
  // steel quality by era for a weapon's metal
  const eraMetal = (m, e) => e === 0 ? mix(m, '#8a6a4a', 0.35) : e === 3 ? shade(m, 0.2) : e === 2 ? shade(m, 0.1) : m;
  const metalFor = (ctx, c) => ctx.race === 'grave' ? '#9a8a6a' : ctx.race === 'sylvan' ? '#c9b46a' : ctx.race === 'veil' ? '#e6e9f5' : ctx.race === 'ash' ? '#7a706a' : shade(c.metal, 0.1);

  const WDRAW = {
    spear: (ctx, c) => poleArm(ctx, c, SPEARHEAD[ctx.race] || 'leaf', { metal: metalFor(ctx, c) }),
    pike: (ctx, c) => poleArm(ctx, c, ctx.race === 'wind' ? 'feather' : 'pike', { x0: 74, y1: 13, x1: 82, metal: metalFor(ctx, c) }),
    trident: (ctx, c) => poleArm(ctx, c, 'trident', { metal: ctx.race === 'tide' ? c.metal : metalFor(ctx, c), y1: 27 }),
    harpoon: (ctx, c) => poleArm(ctx, c, 'harpoon', { metal: c.metal }) + `<path d="M71 96Q90 88 82 70Q78 60 83 46" fill="none" stroke="#e8dcc0" stroke-width="1.1" stroke-dasharray="2 1"/>`,
    halberd: (ctx, c) => poleArm(ctx, c, 'halberd', { x0: 72, y1: 18, metal: metalFor(ctx, c) }),
    glaive: (ctx, c) => poleArm(ctx, c, 'glaive', { y1: 32, metal: ctx.race === 'tide' ? c.coral : metalFor(ctx, c), shaft: ctx.race === 'tide' ? c.wood : undefined }),
    lance: (ctx, c) => poleArm(ctx, c, 'lance', { x0: 64, y0: 99, x1: 90, y1: 40, metal: ctx.race === 'veil' ? '#3b2c4f' : shade(c.metal, 0.1), shaft: ctx.race === 'grave' ? '#4c4636' : c.realm, w: 3 }),
    scythe: (ctx, c) => poleArm(ctx, c, 'scythe', { x0: 72, y1: 16, x1: 82, metal: '#a6a08a', shaft: '#3d3530' }),
    stormspear: (ctx, c) => poleArm(ctx, c, 'pike', { x0: 72, y1: 16, x1: 84, metal: c.glow }) + `<path d="M88 12l-4 5h3l-3 6" fill="none" stroke="${c.accent}" stroke-width="1.6"/><path d="M76 20l-3 3h2l-2 4" fill="none" stroke="${c.accent}" stroke-width="1.2"/>`,
    axe: (ctx, c) => poleArm(ctx, c, 'axe', { x0: 66, y0: 99, x1: 80, y1: 40, metal: metalFor(ctx, c), w: 2.6 }),
    greataxe: (ctx, c) => poleArm(ctx, c, 'greataxe', { x0: 68, y0: 99, x1: 82, y1: 32, metal: metalFor(ctx, c), w: 2.8 }) + `<path d="M${84} 26l2 3M80 27l-1.5 2.5" fill="none" stroke="${c.glow}" stroke-width="1"/>`,
    hammer: (ctx, c) => poleArm(ctx, c, 'hammer', { x0: 68, y0: 99, x1: 80, y1: 46, metal: shade(c.metal, -0.05), w: 2.6 }),
    warhammer: (ctx, c) => poleArm(ctx, c, 'warhammer', { x0: 68, y0: 99, x1: 82, y1: 38, metal: c.metal, w: 2.6 }),
    club: (ctx, c) => poleArm(ctx, c, 'club', { x0: 68, y0: 99, x1: 80, y1: 46, metal: ctx.race === 'sylvan' ? '#6b5233' : '#7a5a3a', shaft: ctx.race === 'sylvan' ? '#6b5233' : '#7a5a3a', w: 3.4 }),
    staff: (ctx, c) => {
      const col = ORB[ctx.race] || '#ffcf5a';
      let s = poleArm(ctx, c, 'orb', { x0: 72, y0: 99, x1: 82, y1: 30, col, era: c.era, glow: glowGrad(ctx, col), shaft: ctx.race === 'grave' ? c.bone : ctx.race === 'tide' ? '#c9a77a' : c.wood, w: 2.6 });
      if (ctx.race === 'grave') s += C(82.6, 25.5, 1, '#1a1a1a', NS);
      if (ctx.race === 'wind') s += `<path d="M86 14l-3 5h3l-3 5" fill="none" stroke="${c.accent}" stroke-width="1.3"/>`;
      if (ctx.race === 'sylvan' || ctx.race === 'veil') s += leaf(78, 36, 7, 2.2, -50, ctx.race === 'sylvan' ? c.leaf : c.accent);
      return s;
    },
    crozier: (ctx, c) => poleArm(ctx, c, 'crozier', { x0: 72, y0: 99, x1: 80, y1: 30, metal: '#e0b23c' }),
    banner: (ctx, c) => {
      let s = shaft(70, 99, 74, 12, c.wood, 2.4);
      s += P(`M74 14Q82 12 92 15L91 19Q89 26 92 33Q83 30 74 34Z`, grad(ctx, c.realm, 0.25, 'h'));
      s += sigil(ctx.race, 83, 23, 0.85, '#f3e7c4') + C(74, 11, 1.8, '#e0b23c', ' stroke-width="1.2"');
      return s;
    },
    hoe: (ctx, c) => poleArm(ctx, c, 'hoe', { x0: 70, y0: 99, x1: 82, y1: 34, metal: '#8e8a82' }),
    sword: (ctx, c) => {
      const m = ctx.race === 'grave' ? '#9a917a' : '#d8dee4';
      return `<g${T(78, 92, 8)}><path d="M-2.2 -8L-2.2 -50L0 -55L2.2 -50L2.2 -8Z" fill="${m}"/><path d="M0 -12V-48" fill="none" stroke-width="0.8"/><path d="M-7 -8H7V-5H-7Z" fill="${c.accent}"/><path d="M-1.5 -5V3" stroke-width="4"/><path d="M-1.5 -5V3" stroke="${c.leather}" stroke-width="2"/>${C(-1.5, 4.5, 2.2, c.accent, ' stroke-width="1.2"')}</g>`;
    },
    greatsword: (ctx, c) => `<g${T(76, 96, 4)}><path d="M-3 -8L-3 -60L0 -66L3 -60L3 -8Z" fill="${ctx.race === 'grave' ? '#3a3a40' : '#d8dee4'}"/><path d="M0 -14V-58" fill="none" stroke="${c.glow}" stroke-width="1"/><path d="M-9 -8Q0 -4 9 -8L8 -5Q0 -2 -8 -5Z" fill="${c.metal}"/><path d="M0 -5V2" stroke-width="4.4"/></g>`,
    saber: (ctx, c) => `<g${T(74, 92, 18)}><path d="M-2 -7Q-3 -30 6 -50Q2 -28 2.2 -7Z" fill="${metalFor(ctx, c)}"/><path d="M-6 -7H6V-4H-6Z" fill="${c.accent}"/><path d="M0 -4V3" stroke-width="3.6"/></g>`,
    feysaber: (ctx, c) => `<g${T(76, 92, 14)}><path d="M-1.4 -7Q-3 -32 4 -52Q1.4 -30 1.6 -7Z" fill="#eef0fa"/><path d="M-6 -7Q0 -10 6 -7Q0 -4 -6 -7Z" fill="${c.accent}"/><path d="M0 -5V3" stroke-width="3"/></g><path d="M86 34l1 3l3 1l-3 1l-1 3l-1 -3l-3 -1l3 -1Z" fill="#fff" stroke-width="0.6"/>`,
    greatblade: (ctx, c) => `<g${T(74, 96, 12)}><path d="M-3 -8L-4 -40Q-4 -58 8 -66Q4 -50 6 -36L4 -8Z" fill="#8a807a"/><path d="M5 -30l2 1M5 -40l2 1M4 -50l2 0" fill="none" stroke-width="1.4"/><path d="M-8 -8H9V-4H-8Z" fill="${c.accent}"/><path d="M0 -4V3" stroke-width="4"/></g>`,
    cleaver: (ctx, c) => `<g${T(78, 92, 10)}><path d="M-2 -6L-2 -26Q6 -32 10 -26L8 -6Z" fill="#8a807a"/><path d="M0 -6V4" stroke-width="4"/><path d="M0 -6V4" stroke="${c.leather}" stroke-width="2"/></g><g${T(30, 94, -20)}><path d="M-1.5 -4L-1.5 -18L0 -22L1.5 -18L1.5 -4Z" fill="#8a807a"/><path d="M-4 -4H4" stroke-width="2.4"/></g>`,
    claws: (ctx, c) => `<path d="M24 84l-4 -10M29 82l-2 -12M34 83l1 -11M70 82l3 -11M75 82l3 -10M80 84l4 -9" fill="none" stroke-width="3.6"/><path d="M24 84l-4 -10M29 82l-2 -12M34 83l1 -11M70 82l3 -11M75 82l3 -10M80 84l4 -9" fill="none" stroke="${c.bone}" stroke-width="1.6"/>`,
    dagger: (ctx, c) => `<g${T(76, 92, 22)}><path d="M-1.8 -6L-1.8 -24L0 -28L1.8 -24L1.8 -6Z" fill="#d8dee4"/><path d="M-5 -6H5V-3.5H-5Z" fill="${c.accent}"/><path d="M0 -3.5V2" stroke-width="3"/></g>`,
    baton: (ctx, c) => `<g${T(76, 94, 25)}>${OL('M0 0V-20', c.realm, 3)}${C(0, -21, 2.2, '#e0b23c', ' stroke-width="1.2"')}</g>`,
    scepter: (ctx, c) => `<g${T(76, 96, 12)}>${OL('M0 0V-34', '#e0b23c', 2.4)}${C(0, -37, 3.6, c.realm, ' stroke-width="1.4"')}<path d="M-4 -33Q0 -36 4 -33" fill="none" stroke-width="1.4"/>${C(-1, -38, 1, '#fff', NS)}</g>`,
    ledger: (ctx, c) => `<g${T(74, 86, -12)}><path d="M-8 -9H8V9H-8Z" fill="${shade(c.realm, -0.3)}"/><path d="M-6 -9V9" fill="none" stroke="#e0b23c" stroke-width="1.2"/></g><path d="M44 66Q50 74 56 66" fill="none" stroke="#e0b23c" stroke-width="1.6"/>${C(50, 72, 2, '#e0b23c', ' stroke-width="1"')}`,
    chain: (ctx, c) => `<path d="M36 70Q50 86 64 70" fill="none" stroke-width="3.8" stroke-dasharray="0.1 3.2"/><path d="M36 70Q50 86 64 70" fill="none" stroke="#e0b23c" stroke-width="2" stroke-dasharray="2 1.3"/>${C(50, 79, 3.2, '#e0b23c', ' stroke-width="1.3"')}${C(50, 79, 1.3, c.realm, NS)}`,
    spyglass: (ctx, c) => `<g${T(74, 90, 34)}><path d="M-2.2 0V-14H2.2V0Z" fill="${c.leather}"/><path d="M-3 -14V-26H3V-14Z" fill="#c8903e"/><path d="M-3.6 -26V-31H3.6V-26Z" fill="#a8742e"/><path d="M-3 -18H3M-3 -22H3" fill="none" stroke-width="0.8"/></g>`,
    crossbow: (ctx, c) => {
      const m = ctx.race === 'delver' ? '#c8903e' : c.wood;
      return `<path d="M62 99L66 72" stroke-width="5.2"/><path d="M62 99L66 72" stroke="${m}" stroke-width="3"/><path d="M50 78Q66 70 84 80" fill="none" stroke-width="4.6"/><path d="M50 78Q66 70 84 80" fill="none" stroke="${shade(c.metal, -0.1)}" stroke-width="2.4"/><path d="M50 78L66 84L84 80" fill="none" stroke-width="0.9"/><path d="M65.5 75L67 63" stroke-width="1.6"/><path d="M67 63l-1.6 2.8h3.2Z" fill="${c.metal}" stroke-width="1"/>`;
    },
    clockbow: (ctx, c) => WDRAW.crossbow(ctx, c) + C(64, 88, 4.2, '#c8903e', ' stroke-width="1.6"') + `<path d="M64 83.4v1.6M64 91v1.6M59.4 88h1.6M67 88h1.6" fill="none" stroke-width="1.2"/>` + C(64, 88, 1.3, c.glow, NS),
    longbow: (ctx, c) => {
      const wood = ctx.race === 'grave' ? c.bone : ctx.race === 'veil' ? '#e6e9f5' : ctx.race === 'wind' ? '#a07a4a' : c.wood;
      const curve = ctx.race === 'wind' ? 'M80 18Q72 24 82 34Q92 56 82 78Q72 88 80 94' : 'M79 14Q97 52 79 94';
      return OL(curve, wood, 2.4) + `<path d="M79 14L79 94" fill="none" stroke-width="0.8" stroke="${ctx.race === 'veil' ? '#c9d0ff' : INK}"/>` + (ctx.race === 'veil' ? `<path d="M76 46l1.2 2.4l2.4 1.2l-2.4 1.2l-1.2 2.4l-1.2 -2.4l-2.4 -1.2l2.4 -1.2Z" fill="#fff" stroke-width="0.6"/>` : '');
    },
    sling: (ctx, c) => `<path d="M76 96L78 66Q74 56 82 50Q90 56 86 66L78 66" fill="none" stroke-width="3"/><path d="M76 96L78 66Q74 56 82 50Q90 56 86 66L78 66" fill="none" stroke="${c.leather}" stroke-width="1.4"/>${C(82, 50, 3, '#8a8580', ' stroke-width="1.4"')}<path d="M70 44Q82 34 94 44M73 38Q82 30 91 37" fill="none" stroke-width="1" stroke-dasharray="2 2"/>`,
  };
  // blade tips (for era glints)
  const BLADE_TIP = { sword: [85.7, 37.5], greatsword: [80.6, 30.2], saber: [90, 47], feysaber: [90, 44], greatblade: [88, 34], cleaver: [82, 64], dagger: [86, 66] };
  const SHIELDS = {
    round: (ctx, c) => C(26, 82, 15, grad(ctx, c.wood, 0.25, 'd')) + C(26, 82, 11, c.realm, ' stroke-width="1.2"') + sigil(ctx.race, 26, 82, 1.2, '#f3e7c4') + `<circle cx="26" cy="82" r="15" fill="none" stroke="${c.metal}" stroke-width="1.6"/>`,
    kite: (ctx, c) => P('M12 66Q26 61 40 66Q41 86 26 100Q11 86 12 66Z', grad(ctx, c.realm, 0.3, 'd')) + P('M16 69Q26 66 36 69', 'none', ` stroke="${c.metal}" stroke-width="1.6"`) + sigil(ctx.race, 26, 79, 1.25, '#f3e7c4'),
    heater: (ctx, c) => P('M12 66H40Q41 88 26 98Q11 88 12 66Z', grad(ctx, c.realm, 0.3, 'd')) + P('M26 66V96M12.5 76H39.5', 'none', ` stroke="${c.accent}" stroke-width="2"`) + sigil(ctx.race, 19, 71, 0.6, '#f3e7c4'),
    tower: (ctx, c) => P('M8 62Q24 58 40 62V96Q24 100 8 96Z', grad(ctx, c.metal, 0.3, 'd')) + P('M12 66Q24 63 36 66V92Q24 95 12 92Z', c.realm, ' stroke-width="1.2"') + sigil(ctx.race, 24, 79, 1.3, '#f3e7c4') + `<path d="M15 69l2 3l2 -3M29 69l2 3l2 -3" fill="none" stroke="${c.glow}" stroke-width="1"/>`,
    thorn: (ctx, c) => C(26, 82, 15, grad(ctx, '#6b5233', 0.25, 'd')) + `<path d="M13 76Q26 70 39 76M12 84Q26 78 40 84M14 91Q26 86 38 91" fill="none" stroke="#3d2f1f" stroke-width="1.4"/>` + C(26, 82, 5, c.realm, ' stroke-width="1.2"') + `<path d="M11 70l-3 -2M41 70l3 -2M10 92l-3 2M42 92l3 2M26 66v-3" fill="none" stroke-width="1.6"/>`,
    shell: (ctx, c) => { let s = P('M8 92Q6 70 26 64Q46 70 44 92Q26 100 8 92Z', grad(ctx, c.shell || '#efd6c4', 0.15, 'd')); for (let i = 0; i < 6; i++) s += `<path d="M26 96L${n(10 + i * 6.4)} ${n(74 - Math.sin((i + 0.5) / 6 * Math.PI) * 6)}" fill="none" stroke="${c.coral || '#e0705a'}" stroke-width="1"/>`; return s + C(26, 84, 3, '#fbf6ea', ' stroke-width="1"'); },
    mirror: (ctx, c) => E(26, 82, 14, 17, grad(ctx, '#dfe3f2', 0.3, 'd')) + E(26, 82, 10, 13, '#b9c0dc', ' stroke-width="1"') + `<path d="M19 74L28 92M24 72L33 88" fill="none" stroke="#fff" stroke-width="1.6" opacity=".85"/>` + P('M26 64l1.5 -3l1.5 3', c.accent, ' stroke-width="1"'),
    coffin: (ctx, c) => P('M18 60H34L40 70L35 99H17L12 70Z', grad(ctx, '#5a4a3a', 0.25, 'd')) + `<path d="M26 66V92M19 74H33" fill="none" stroke="${c.bone}" stroke-width="2.4"/>` + C(15, 67, 1, '#8a4b2a', NS) + C(37, 96, 1, '#8a4b2a', NS),
    tall: (ctx, c) => P('M10 58Q22 54 34 58L36 99H8Z', grad(ctx, '#a9b0b5', 0.3, 'd')) + P('M14 62Q22 59 30 62L31 96H13Z', c.realm, ' stroke-width="1.2"') + sigil(ctx.race, 22, 76, 1.2, '#f3e7c4'),
  };
  // armour on the shoulders: STYLE from the technology era, polish from the forge rank
  //  era 0 padded cloth / hide · 1 leather + mail · 2 plate (or the people's equivalent) · 3 ornate masterwork
  const PLATE = { hearth: 'steel', delver: 'iron', sylvan: 'bark', ash: 'bone', tide: 'shell', veil: 'moon', grave: 'boneplate', wind: 'feather' };
  const armour = (ctx, c, g) => {
    const a = anat(ctx), r = g.rank, e = g.era, y = a.sh.y, L = a.sh.left, R = a.sh.right, nx = a.neck.x;
    const yoke = `M${n(L + 2)} ${n(y + 8)}Q${n(L + 4)} ${n(y - 6)} ${n(nx - 11)} ${n(y - 9)}Q${n(nx)} ${n(y - 2)} ${n(nx + 11)} ${n(y - 9)}Q${n(R - 4)} ${n(y - 6)} ${n(R - 2)} ${n(y + 8)}Q${n(R - 10)} ${n(y + 4)} ${n(nx + 12)} ${n(y + 7)}Q${n(nx)} ${n(y + 12)} ${n(nx - 12)} ${n(y + 7)}Q${n(L + 10)} ${n(y + 4)} ${n(L + 2)} ${n(y + 8)}Z`;
    const strap = col => `<path d="M${n(L + 10)} ${n(y - 2)}L${n(R - 14)} ${n(y + 24)}" fill="none" stroke-width="4.6"/><path d="M${n(L + 10)} ${n(y - 2)}L${n(R - 14)} ${n(y + 24)}" fill="none" stroke="${col}" stroke-width="2.6"/>`;
    if (e === 0) {
      const hide = ctx.race === 'ash' || ctx.race === 'sylvan' || ctx.race === 'wind';
      const col = hide ? '#9a7a58' : mix(c.cloth, '#c8b48a', 0.45);
      let s = P(yoke, grad(ctx, col, 0.2), ' stroke-width="1.8"');
      if (hide) for (let i = 0; i < 7; i++) { const x = L + 6 + i * (R - L - 12) / 6; s += `<path d="M${n(x - 2)} ${n(y + 6)}l2 3l2 -3" fill="none" stroke-width="1"/>`; }
      else s += `<path d="M${n(L + 8)} ${n(y + 1)}Q${n(nx)} ${n(y - 4)} ${n(R - 8)} ${n(y + 1)}M${n(nx - 18)} ${n(y - 5)}V${n(y + 6)}M${n(nx + 18)} ${n(y - 5)}V${n(y + 6)}M${n(nx - 26)} ${n(y - 3)}V${n(y + 5)}M${n(nx + 26)} ${n(y - 3)}V${n(y + 5)}" fill="none" stroke-width="0.9" stroke-dasharray="1.6 1.4"/>`;
      return s;
    }
    if (e === 1) {
      const mail = shade(c.metal, -0.05);
      let s = P(yoke, grad(ctx, mail, 0.25), ' stroke-width="1.8"');
      s += `<path d="M${n(L + 7)} ${n(y + 2)}Q${n(nx)} ${n(y - 4)} ${n(R - 7)} ${n(y + 2)}M${n(L + 9)} ${n(y + 6)}Q${n(nx)} ${n(y + 1)} ${n(R - 9)} ${n(y + 6)}" fill="none" stroke-width="1.1" stroke-dasharray="0.1 1.8"/>`;
      return s + strap(c.leather) + C(L + 22, y + 9, 1.5, r >= 6 ? c.gold : shade(c.metal, -0.2), ' stroke-width="0.9"');
    }
    // era 2-3: plate pieces in the people's own material
    const st = PLATE[ctx.race] || 'steel';
    const base = st === 'bark' ? '#7a5a36' : st === 'bone' || st === 'boneplate' ? c.bone : st === 'shell' ? (c.shell || '#efd6c4') : st === 'feather' ? shade(c.metal, 0.05) : c.metal;
    const m = r >= 9 ? shade(base, 0.08) : base;
    const trim = e === 3 ? c.gold : r >= 6 ? shade(base, 0.45) : shade(base, -0.3);
    let s = P(yoke, grad(ctx, e === 3 ? shade(c.metal, -0.15) : shade(c.metal, -0.25), 0.25), ' stroke-width="1.6"');
    const pad = (cx, dir) => {
      let p = P(`M${n(cx - 14 * dir)} ${n(y + 7)}Q${n(cx - 13 * dir)} ${n(y - 8)} ${n(cx + 2 * dir)} ${n(y - 8)}Q${n(cx + 13 * dir)} ${n(y - 6)} ${n(cx + 14 * dir)} ${n(y + 7)}Q${n(cx)} ${n(y + 1)} ${n(cx - 14 * dir)} ${n(y + 7)}Z`, grad(ctx, m, 0.3, 'd'));
      // second lame
      p += `<path d="M${n(cx - 12 * dir)} ${n(y + 2)}Q${n(cx)} ${n(y - 3.5)} ${n(cx + 12 * dir)} ${n(y + 2)}" fill="none" stroke="${trim}" stroke-width="${e === 3 ? 1.8 : 1.1}"/>`;
      if (st === 'bark') p += `<path d="M${n(cx - 6 * dir)} ${n(y - 6)}l1 6M${n(cx + 4 * dir)} ${n(y - 6)}l-1 7" fill="none" stroke-width="0.9"/>` + leaf(cx + 10 * dir, y + 4, 9, 2.6, 120 * dir, c.leaf || '#5e9a3a');
      if (st === 'bone') p += P(`M${n(cx - 2 * dir)} ${n(y - 7)}L${n(cx - 5 * dir)} ${n(y - 15)}L${n(cx + 3 * dir)} ${n(y - 7.5)}Z`, c.bone, ' stroke-width="1.2"');
      if (st === 'boneplate') p += `<path d="M${n(cx - 8 * dir)} ${n(y - 4)}l3 4M${n(cx)} ${n(y - 6)}l0 5" fill="none" stroke-width="1"/>`;
      if (st === 'shell') for (let k = -2; k <= 2; k++) p += `<path d="M${n(cx + k * 2 * dir)} ${n(y + 5)}L${n(cx + k * 5 * dir)} ${n(y - 6)}" fill="none" stroke="${c.coral || '#e0705a'}" stroke-width="0.9"/>`;
      if (st === 'feather') for (let k = 0; k < 3; k++) p += leaf(cx + (k * 6 - 4) * dir, y + 6, 8, 2.2, (150 + k * 12) * dir, k === 1 ? c.realm : (c.feather || '#f3efe4'));
      if (st === 'moon') p += P(`M${n(cx + 1)} ${n(y - 5)}a3 3 0 1 0 0 6a2.3 2.3 0 1 1 0 -6Z`, '#f4f0ff', ' stroke-width="0.8"');
      if (st === 'iron' || st === 'steel') p += C(cx - 7 * dir, y + 1, 0.9, trim, NS) + C(cx + 7 * dir, y + 1, 0.9, trim, NS);
      if (e === 3) p += C(cx + dir, y - 3, 2.6, glowGrad(ctx, c.glow), NS) + `<path d="M${n(cx - 1 + dir)} ${n(y - 5)}l1.4 2l-1.4 2l-1.4 -2Z" fill="${c.glow}" stroke-width="0.7"/>`;
      return p;
    };
    s += pad(L + 6, -1) + pad(R - 6, 1);
    s += P(`M${n(nx - 10)} ${n(y - 8)}Q${n(nx)} ${n(y)} ${n(nx + 10)} ${n(y - 8)}L${n(nx + 8)} ${n(y - 2)}Q${n(nx)} ${n(y + 5)} ${n(nx - 8)} ${n(y - 2)}Z`, m, ' stroke-width="1.6"');
    if (e === 3) s += `<path d="M${n(nx - 8)} ${n(y - 4.5)}Q${n(nx)} ${n(y + 2)} ${n(nx + 8)} ${n(y - 4.5)}" fill="none" stroke="${c.gold}" stroke-width="1" stroke-dasharray="1.2 1.2"/>` + C(nx, y + 1.5, 1.8, c.realm, ' stroke-width="0.9"');
    return s;
  };
  // mage robes by era: stole (1), embroidered trim (2), gold trim with glowing runes (3)
  const robe = (ctx, c, g) => {
    const e = g.era; if (!e) return '';
    const a = anat(ctx), y = a.sh.y, nx = a.neck.x;
    const band = dx => `M${n(nx + dx * 6)} ${n(y - 8)}Q${n(nx + dx * 10)} ${n(y + 6)} ${n(nx + dx * 9)} 100H${n(nx + dx * 15)}Q${n(nx + dx * 16)} ${n(y + 4)} ${n(nx + dx * 12)} ${n(y - 9)}Z`;
    let s = P(band(-1), grad(ctx, c.realm, 0.25)) + P(band(1), grad(ctx, c.realm, 0.25));
    if (e >= 2) s += `<path d="M${n(nx - 11)} ${n(y + 2)}V97M${n(nx + 11)} ${n(y + 2)}V97" fill="none" stroke="${e === 3 ? c.gold : c.accent}" stroke-width="1.3" stroke-dasharray="${e === 3 ? '3 1.5' : '1.5 1.5'}"/>`;
    if (e === 3) {
      s += `<path d="M${n(nx - 13)} ${n(y + 10)}l1.5 -2.5l1.5 2.5M${n(nx + 10)} ${n(y + 10)}l1.5 -2.5l1.5 2.5M${n(nx - 13)} ${n(y + 18)}h3M${n(nx + 10)} ${n(y + 18)}h3" fill="none" stroke="${c.glow}" stroke-width="1"/>`;
      s += P(`M${n(nx - 12)} ${n(y - 9)}Q${n(nx)} ${n(y - 1)} ${n(nx + 12)} ${n(y - 9)}L${n(nx + 14)} ${n(y - 13)}Q${n(nx)} ${n(y - 4)} ${n(nx - 14)} ${n(y - 13)}Z`, c.gold, ' stroke-width="1.2"');
    }
    return s;
  };
  const quiverBack = (ctx, c) => {
    const fl = ctx.race === 'grave' ? '#2a2a2a' : ctx.race === 'veil' ? '#e6e9f5' : c.realm;
    let s = `<path d="M60 74L70 40" stroke-width="6.4"/><path d="M60 74L70 40" stroke="${c.leather}" stroke-width="4.4"/>`;
    for (const [dx, a] of [[-2, 10], [1, 16], [4, 22]]) s += `<g${T(69 + dx, 42, a)}><path d="M0 0V-8" stroke-width="1.2"/><path d="M0 -4L-2.4 -10L0 -8.5L2.4 -10Z" fill="${fl}" stroke-width="0.9"/></g>`;
    return s;
  };
  const satchel = (ctx, c) => `<path d="M34 66L64 98" fill="none" stroke-width="4.4"/><path d="M34 66L64 98" fill="none" stroke="${c.leather}" stroke-width="2.4"/>` + P('M20 82Q19 98 22 99H40Q42 90 40 82Z', grad(ctx, '#9a7448', 0.25)) + P('M19 82Q30 78 41 82L40 89Q30 86 20 89Z', '#7a5a3a', ' stroke-width="1.4"') + C(30, 88, 1.3, c.accent, ' stroke-width="0.8"') + E(44, 64, 6, 4, '#d9c08a', ' stroke-width="1.6"');
  const mantle = (ctx, c) => {
    const a = anat(ctx), y = a.sh.y;
    return P(`M${n(a.sh.left - 4)} 100Q${n(a.sh.left - 2)} ${n(y - 6)} ${n(a.neck.x - 9)} ${n(y - 10)}Q${n(a.neck.x)} ${n(y - 4)} ${n(a.neck.x + 9)} ${n(y - 10)}Q${n(a.sh.right + 2)} ${n(y - 6)} ${n(a.sh.right + 4)} 100H${n(a.sh.right - 8)}Q${n(a.neck.x + 6)} ${n(y + 4)} ${n(a.neck.x)} ${n(y + 2)}Q${n(a.neck.x - 6)} ${n(y + 4)} ${n(a.sh.left + 8)} 100Z`, grad(ctx, c.realm, 0.25))
      + `<path d="M${n(a.neck.x - 9)} ${n(y - 10)}Q${n(a.neck.x)} ${n(y - 4)} ${n(a.neck.x + 9)} ${n(y - 10)}" fill="none" stroke="#f4efe6" stroke-width="3.4" stroke-dasharray="2.4 1.6"/>`;
  };

  // =====================================================================
  //  MOUNTS (head & neck beside the rider, facing left) and WINGS
  // =====================================================================
  const eye = (x, y, col = INK, r = 1.3) => C(x, y, r, col, NS);
  const BEAST = {
    horse: (ctx, c, o = {}) => {
      const coat = o.coat || ['#8a5a34', '#5a3a24', '#b08458', '#3a2a22'][Math.floor(ctx.grnd() * 4)], mane = o.mane || shade(coat, -0.45);
      let s = '';
      s += P('M30 33Q36 38 40 50Q44 64 44 100H34Q38 74 30 52Z', mane, ' stroke-width="1.8"');
      s += P('M14 100C16 84 22 74 25 66Q20 64 13 66Q6 66 6 60Q8 52 16 43Q22 36 28 34L29 27L33 34Q40 44 41 60Q43 80 42 100Z', o.fill || grad(ctx, coat, 0.25, 'd'));
      s += eye(21, 45, o.eye || INK, o.eyeR || 1.4) + `<path d="M8 58.5q1.5 -1 2.5 0.5M7 62.5Q10 64 14 62.5" fill="none" stroke-width="1.1"/>`;
      if (!o.noBridle) s += `<path d="M13 58L27 47M27 47L30 36M13 58Q18 62 24 60" fill="none" stroke="${o.strap || c.realm}" stroke-width="1.6"/>` + C(14, 58, 1.2, '#e0b23c', ' stroke-width="0.8"');
      if (o.extra) s += o.extra;
      return s;
    },
    warhorse: (ctx, c) => BEAST.horse(ctx, c, {
      coat: '#e8e0d0', mane: '#8a7a6a', strap: c.accent, extra:
        P(`M15 100C17 88 21 80 25 73Q34 72 41 76Q43 88 42 100Z`, grad(ctx, c.realm, 0.25)) + `<path d="M17 92Q28 86 42 90" fill="none" stroke="${c.accent}" stroke-width="1.6"/>` + sigil(ctx.race, 31, 84, 0.8, '#f3e7c4'),
    }),
    hart: (ctx, c) => BEAST.stag(ctx, c, { coat: '#e4dccb', glowAnt: true }),
    stag: (ctx, c, o = {}) => {
      const coat = o.coat || '#a0683a';
      const ant = OL('M27 34Q22 22 14 18M22 26L15 27M19 21L20 13M30 33Q33 22 40 16M33 25L39 25M36 19L36 11', o.glowAnt ? '#f4f0dc' : '#e4d3ad', 1.8);
      return ant + BEAST.horse(ctx, c, { coat, mane: shade(coat, -0.3), strap: c.realm, extra: `<path d="M18 50q3 2 6 0M20 55q3 2 6 0" fill="none" stroke="${shade(coat, 0.35)}" stroke-width="1.2"/>` + (o.glowAnt ? leaf(14, 18, 6, 2, -60, c.leaf || '#5e9a3a') + leaf(40, 16, 6, 2, 60, c.leaf || '#5e9a3a') : '') }).replace('L29 27L33 34', 'L27 30L33 34');
    },
    kelpie: (ctx, c) => {
      const coat = '#3f8f8a';
      return BEAST.horse(ctx, c, {
        coat, mane: '#2f6f4a', strap: c.accent, eye: c.glow, eyeR: 1.6, extra:
          P('M30 34Q40 30 46 40Q40 40 42 48Q36 44 38 54Q34 48 31 50Z', '#4fa58a', ' stroke-width="1.6"') + `<path d="M20 70q3 -2 6 0q3 -2 6 0M22 78q3 -2 6 0q3 -2 6 0M20 86q3 -2 6 0q3 -2 6 0" fill="none" stroke="${shade(coat, 0.35)}" stroke-width="1.1"/>`
          + C(10, 70, 1.1, '#bfe8ff', ' stroke-width="0.8"') + C(7, 75, 0.8, '#bfe8ff', ' stroke-width="0.6"'),
      });
    },
    nightmare: (ctx, c) => {
      let fl = '';
      for (let i = 0; i < 5; i++) fl += P(`M${n(31 + i * 2.2)} ${n(36 + i * 10)}Q${n(42 + i * 2)} ${n(28 + i * 10)} ${n(48 + i * 1.4)} ${n(26 + i * 10)}Q${n(42 + i * 2)} ${n(36 + i * 10)} ${n(36 + i * 2)} ${n(44 + i * 10)}Z`, i % 2 ? '#c35bb0' : '#7b3fb0', ' stroke-width="1.2"');
      return fl + BEAST.horse(ctx, c, { coat: '#26222e', mane: '#1a1622', eye: '#f0b8ff', eyeR: 1.9, strap: '#9aa0b0', extra: `<path d="M7 61l-4 2M8 64l-4 4" fill="none" stroke="#c35bb0" stroke-width="1.2"/>` });
    },
    bonehorse: (ctx, c) => BEAST.horse(ctx, c, {
      coat: '#d9d3b8', fill: grad(ctx, '#d9d3b8', 0.15, 'd'), mane: '#3d4247', eye: c.glow, eyeR: 1.9, noBridle: true, extra:
        E(21, 45, 3.4, 2.6, '#1a1612', NS) + eye(21, 45, c.glow, 1.4) + P('M9 57l2 2M11 60l1 -3M13 61l1 -3', 'none', ' stroke-width="1"') + `<path d="M26 72Q34 70 40 72M24 80Q33 78 41 80M22 88Q32 86 42 88" fill="none" stroke-width="1.4"/>`
        + `<path d="M13 58L27 47" fill="none" stroke="#4c4636" stroke-width="1.6"/>`,
    }),
    goat: (ctx, c) => {
      const coat = '#a08a6a';
      return P('M14 100C16 86 20 76 24 68Q18 68 13 64Q8 62 9 56Q11 50 17 46Q22 40 28 40Q36 42 40 56Q43 76 42 100Z', grad(ctx, coat, 0.2, 'd'))
        + P('M14 64Q12 76 17 80Q18 70 21 67Z', '#e8dcc0', ' stroke-width="1.4"')
        + P('M24 42Q28 30 38 32Q46 36 42 46Q38 52 33 47Q37 44 36 40Q32 37 28 44Z', grad(ctx, '#e8dcc0', 0.2, 'd')) + `<path d="M30 36q3 0 4 3M33 34q3 1 4 4" fill="none" stroke-width="0.9"/>`
        + eye(20, 50) + `<path d="M10 57q1.2 -0.8 2 0.4M10 61Q13 63 16 61" fill="none" stroke-width="1"/><path d="M14 54L26 48L28 56" fill="none" stroke="${c.realm}" stroke-width="1.6"/>` + P('M17 44L12 40L20 43Z', coat, ' stroke-width="1.3"');
    },
    boar: (ctx, c) => {
      const coat = '#5a4232';
      return P('M10 100C10 88 12 80 10 74Q4 72 4 66Q6 60 12 58Q18 50 28 48Q40 48 44 62Q46 80 44 100Z', grad(ctx, coat, 0.25, 'd'))
        + `<path d="M26 48l-1 -5l3 3l1 -5l2 5l2 -4l1 5l3 -3l0 5" fill="${shade(coat, -0.35)}" stroke-width="1.4"/>`
        + E(6.5, 67.5, 3.2, 4.2, '#c08a7a', ' stroke-width="1.4"') + eye(5.6, 66, INK, 0.7) + eye(7.6, 69, INK, 0.7)
        + P('M11 72Q8 64 4 61Q9 63 13 70Z', '#f0e6cc', ' stroke-width="1.3"') + eye(19, 59, '#c0392b', 1.4)
        + P('M20 52L18 45L25 50Z', shade(coat, -0.2), ' stroke-width="1.3"')
        + `<path d="M16 76Q28 70 44 74" fill="none" stroke="${c.metal}" stroke-width="4.6"/><path d="M16 76Q28 70 44 74" fill="none" stroke="${c.realm}" stroke-width="2.4"/>`;
    },
    wolf: (ctx, c, o = {}) => {
      const coat = o.coat || '#7d7a74';
      return P('M16 100C16 86 18 80 20 74Q12 72 6 66L4 62Q10 60 16 56Q20 46 28 44L28 34L34 42Q42 48 43 62Q44 82 42 100Z', grad(ctx, coat, 0.25, 'd'))
        + P('M6 66Q12 72 20 74Q16 70 13 67Z', '#5a1a1a', ' stroke-width="1.2"') + `<path d="M8 65l1 2M11 67l1 2M14 69l0.6 2" fill="none" stroke="#fff" stroke-width="1"/>`
        + eye(20, 52, o.eye || '#ffcf5a', 1.6) + eye(4.5, 62, INK, 1) + P('M22 47L20 38L26 44Z', shade(coat, -0.2), ' stroke-width="1.2"')
        + `<path d="M34 50l4 2M36 58l5 1M36 66l5 0" fill="none" stroke-width="1.2"/>` + (o.extra || '');
    },
    ghoulhound: (ctx, c) => BEAST.wolf(ctx, c, { coat: '#7a8a72', eye: c.glow, extra: `<path d="M26 74Q33 72 40 75M25 81Q33 79 41 82M24 88Q33 86 42 89" fill="none" stroke="#3a4436" stroke-width="1.3"/>` }),
    seabeast: (ctx, c) => {
      const coat = '#3f6f8a';
      return P('M8 100C6 84 4 70 8 60Q14 46 28 44Q42 46 44 62Q46 82 44 100Z', grad(ctx, coat, 0.25, 'd'))
        + P('M8 64Q20 60 30 66Q20 70 10 70Z', '#e8dcc0', ' stroke-width="1.3"') + P('M28 44Q30 34 40 32Q36 40 40 46Z', shade(coat, -0.2), ' stroke-width="1.4"')
        + eye(22, 54, '#ffcf5a', 1.5) + `<path d="M12 78q4 -2 8 0M14 86q4 -2 8 0M30 80l4 3l-4 3" fill="none" stroke="#bfe8ff" stroke-width="1.1"/>`
        + P('M18 46Q26 40 36 44L34 50Q26 48 20 52Z', grad(ctx, c.metal, 0.3), ' stroke-width="1.4"') + C(16, 60, 1, '#e8dcc0', ' stroke-width="0.7"') + C(36, 72, 1.2, '#e8dcc0', ' stroke-width="0.7"');
    },
    moth: (ctx, c) => P('M18 100Q16 84 20 74Q16 70 18 64Q22 58 28 60Q34 64 34 74Q38 86 36 100Z', grad(ctx, '#e8e2d4', 0.2, 'd'))
      + `<path d="M24 60Q18 48 10 46M28 60Q30 48 38 44" fill="none" stroke-width="1.4"/>` + leaf(10, 46, 7, 2.6, -110, '#d8cfe8') + leaf(38, 44, 7, 2.6, 110, '#d8cfe8')
      + eye(23, 66, '#2b1d12', 2.2) + eye(22.4, 65.4, '#fff', 0.6) + `<path d="M22 80q6 -2 12 0M22 88q6 -2 13 0" fill="none" stroke="#b8aec8" stroke-width="1.2"/>`,
    hawk: (ctx, c, o = {}) => {
      const f1 = o.coat || '#8a6a4a', beak = o.beak || '#e0b23c';
      return P('M16 100C16 86 18 76 20 68Q16 62 18 54Q22 44 32 44Q42 46 43 60Q44 80 42 100Z', grad(ctx, f1, 0.25, 'd'))
        + P('M18 54Q20 46 28 45Q34 46 34 52Q28 54 24 60Z', o.cap || '#3a2a22', ' stroke-width="1.2"')
        + P('M19 56Q10 56 6 64Q10 62 13 64Q16 62 20 62Z', beak, ' stroke-width="1.6"')
        + eye(25, 54, '#ffcf5a', 1.9) + eye(25.4, 54, INK, 0.9)
        + `<path d="M24 70l3 3l3 -3M26 78l3 3l3 -3M28 86l3 3l3 -3M32 70l3 3l3 -3M34 80l3 3l3 -3" fill="none" stroke="${shade(f1, -0.35)}" stroke-width="1.1"/>`;
    },
    roc: (ctx, c) => BEAST.hawk(ctx, c, { coat: '#b0783a', beak: '#f0d070', cap: '#e8dcc0' }),
    wings: () => '',
  };
  // barding at eras 2-3: face plate + neck lames; masterwork adds gilding, a caparison and a glowing gem
  const HORSELIKE = ['horse', 'warhorse', 'hart', 'stag', 'kelpie', 'nightmare', 'bonehorse'];
  const FACEPLATE = {
    horse: 'M17 41Q23 35 29 35L32 42Q24 46 16 56L10 58Q9 52 17 41Z',
    goat: 'M14 50Q20 44 27 44L29 50Q22 52 13 56Z', boar: 'M12 60Q20 52 30 51L33 57Q22 60 13 66Z', wolf: 'M14 58Q20 50 28 48L31 54Q22 56 15 62Z',
    seabeast: 'M14 52Q24 44 36 46L38 52Q26 52 14 58Z', hawk: 'M18 54Q22 46 30 46L33 52Q26 52 20 58Z', moth: 'M18 66Q22 60 28 61L31 66Q24 66 19 70Z',
  };
  const barding = (ctx, c, beast, e) => {
    if (e < 2) return '';
    const key = HORSELIKE.includes(beast) ? 'horse' : beast === 'ghoulhound' ? 'wolf' : beast === 'roc' ? 'hawk' : beast;
    if (!FACEPLATE[key]) return '';
    const m = beast === 'bonehorse' ? '#4c4636' : c.metal, tr = e === 3 ? c.gold : shade(m, 0.35);
    let s = '';
    if (e === 3) s += P('M14 100C16 90 20 84 24 80Q34 78 43 82L43 100Z', grad(ctx, c.realm, 0.25)) + `<path d="M16 94Q28 88 43 92" fill="none" stroke="${c.gold}" stroke-width="1.6"/>` + sigil(ctx.race, 31, 89, 0.7, '#f3e7c4');
    if (key === 'horse') s += P('M31 50Q41 54 43 66L43 80Q37 76 35 68Q34 58 31 50Z', grad(ctx, m, 0.3, 'd'), ' stroke-width="1.6"') + `<path d="M32 57Q38 58 42 63M34 65Q39 66 43 71" fill="none" stroke="${tr}" stroke-width="1.1"/>`;
    else s += P('M17 84Q30 78 43 82L43 89Q30 85 17 91Z', grad(ctx, m, 0.3), ' stroke-width="1.5"') + `<path d="M20 86Q30 82 41 85" fill="none" stroke="${tr}" stroke-width="1"/>`;
    s += P(FACEPLATE[key], grad(ctx, m, 0.35, 'd'), ' stroke-width="1.6"');
    if (key === 'horse') s += P('M27 34L29 23L33 33Z', c.realm, ' stroke-width="1.2"') + C(21, 45, 2, '#1a1410', NS) + C(21, 45, 1.1, beast === 'nightmare' ? '#f0b8ff' : beast === 'bonehorse' || beast === 'kelpie' ? c.glow : '#5a3a24', NS);
    if (e === 3) s += C(key === 'horse' ? 24 : key === 'seabeast' ? 28 : 22, key === 'horse' ? 42 : key === 'boar' ? 55 : key === 'moth' ? 64 : 50, 2, c.glow, ' stroke-width="0.9"');
    return s;
  };
  const wingsBack = (ctx, c, type) => {
    const W = type === 'moth';
    const col = W ? '#e8e2d4' : ctx.gear.mount === 'roc' ? '#9a6a3a' : ctx.gear.mount === 'hawk' ? '#7a5a3a' : ctx.race === 'wind' ? '#e8eef4' : '#d8d0c0';
    const one = (dir) => {
      const X = v => n(50 + (v - 50) * dir);
      if (W) return P(`M${X(44)} 64Q${X(16)} 20 ${X(6)} 28Q${X(4)} 50 ${X(20)} 60Q${X(6)} 72 ${X(14)} 88Q${X(30)} 88 ${X(44)} 72Z`, grad(ctx, col, 0.2, 'd'))
        + E(X(20), 42, 5, 6, '#c35bb0', ' stroke-width="1.2"') + E(X(20), 42, 2, 2.4, '#2b1d12', NS) + E(X(22), 76, 3, 3, '#b8aec8', ' stroke-width="1"');
      let s = P(`M${X(42)} 66Q${X(26)} 30 ${X(5)} 14Q${X(8)} 30 ${X(6)} 38Q${X(10)} 44 ${X(8)} 50Q${X(14)} 56 ${X(12)} 62Q${X(20)} 66 ${X(20)} 72Q${X(30)} 74 ${X(32)} 78Z`, grad(ctx, col, 0.25, 'd'));
      s += `<path d="M${X(36)} 64Q${X(22)} 46 ${X(9)} 38M${X(36)} 68Q${X(24)} 56 ${X(10)} 50M${X(36)} 72Q${X(26)} 64 ${X(14)} 62" fill="none" stroke-width="1.1"/>`;
      if (ctx.gear.mount === 'wings' && ctx.race === 'wind') s += `<path d="M${X(24)} 34l-3 5h3l-3 5" fill="none" stroke="${c.accent}" stroke-width="1.3"/>`;
      return s;
    };
    return one(-1) + one(1);
  };

  // =====================================================================
  //  WHOLE PICTURES: siege engines, ships, monsters
  // =====================================================================
  const SIEGE_THEME = {
    hearth: { wood: '#8b5a2b', roof: '#6b4a2a', head: '#8e959b', load: '#9a948a' },
    delver: { wood: '#5a4636', roof: '#7a6a5a', head: '#c8903e', load: '#3a3632' },
    sylvan: { wood: '#6b5233', roof: '#4f7a34', head: '#5e9a3a', load: '#7a6a5a' },
    ash: { wood: '#5a3a28', roof: '#4a3a3a', head: '#e6dcc3', load: '#7a706a' },
    tide: { wood: '#7b5a3a', roof: '#3f6f6a', head: '#e0705a', load: '#4f8fa0' },
    veil: { wood: '#4a3550', roof: '#6a5080', head: '#cfd3e6', load: '#f0b8ff' },
    grave: { wood: '#d9d3b8', roof: '#4c4636', head: '#e8e2cc', load: '#7a8a72' },
    wind: { wood: '#9a7448', roof: '#e8eef4', head: '#8e959b', load: '#bfe8ff' },
  };
  const crew = (x, y, s = 1, col = '#3a2a22') => `<g transform="translate(${n(x)} ${n(y)}) scale(${s})" fill="${col}" stroke="none"><circle cy="-13" r="3"/><path d="M-3 -10Q0 -11 3 -10L4 0H2L1 -4H-1L-2 0H-4Z"/></g>`;
  const wheel = (x, y, r, col) => C(x, y, r, col) + C(x, y, r * 0.3, INK, NS) + `<path d="M${n(x - r)} ${n(y)}H${n(x + r)}M${n(x)} ${n(y - r)}V${n(y + r)}" fill="none" stroke-width="1"/>`;
  const ground = (ctx, col = '#b8a070') => P('M2 84Q30 80 50 83Q72 86 98 82V100H2Z', grad(ctx, col, 0.15), NS) + `<path d="M4 84Q30 80 50 83Q72 86 96 82" fill="none" stroke-width="1.6"/>`;
  const SIEGE = {
    ram: (ctx, c, t, u) => {
      const R = ctx.race;
      let s = ground(ctx);
      s += crew(30, 84, 0.95) + crew(40, 85, 0.95);
      if (R === 'delver') {
        s += P('M18 50H66V78H18Z', grad(ctx, t.wood, 0.25)) + P('M66 54L90 64L66 74Z', grad(ctx, t.head, 0.3, 'h'));
        s += `<path d="M70 58L72 70M76 60L78 68M82 62L83 66" fill="none" stroke-width="1.2"/>` + C(32, 58, 6, '#c8903e', ' stroke-width="1.6"') + C(32, 58, 2, INK, NS) + C(48, 62, 4.4, '#c8903e', ' stroke-width="1.6"');
        s += P('M24 50V34H32V50Z', '#55514b') + `<path d="M28 32Q22 22 30 16Q36 12 32 6" fill="none" stroke="#e8e8e8" stroke-width="4" opacity=".75"/>`;
        s += wheel(26, 80, 6, t.wood) + wheel(58, 80, 6, t.wood);
        return s;
      }
      if (R === 'sylvan') {
        s += OL('M14 84Q20 66 40 64Q60 62 70 58', '#6b5233', 7) + OL('M22 84Q28 74 44 72M50 84Q52 72 64 66M60 62Q70 48 66 36M64 50Q74 44 78 46', '#7a5e3a', 3.4);
        s += leaf(66, 36, 9, 3, -10, t.roof) + leaf(78, 46, 8, 3, 60, t.roof) + leaf(44, 64, 8, 3, -40, t.roof);
        s += P('M70 54L92 60L72 66Z', grad(ctx, '#8a6a3a', 0.25), ' stroke-width="1.8"') + `<path d="M86 52l2 -4M90 66l3 3" fill="none" stroke-width="1.2"/>`;
        return s;
      }
      const roofCol = R === 'tide' ? '#3f6f6a' : R === 'wind' ? t.roof : t.roof;
      if (R === 'wind') s += P('M38 20L40 54L62 52Q58 34 38 20Z', grad(ctx, '#f4f0e4', 0.15, 'h')) + `<path d="M40 16V56" stroke-width="2.2"/>` + sigil('wind', 48, 42, 0.9, c.realm);
      if (R === 'veil') s += E(44, 66, 34, 14, '#cfc0e8', ' stroke="none" opacity=".55"');
      s += P('M14 78L20 52H66L72 78Z', grad(ctx, roofCol, 0.25));
      s += `<path d="M22 58H64M20 64H66M18 70H68" fill="none" stroke-width="1" opacity=".7"/>`;
      if (R === 'grave') s += `<path d="M24 56q3 -3 6 0q3 -3 6 0M44 62q3 -3 6 0" fill="none" stroke="#2b1d12" stroke-width="1"/>`;
      // ram beam and head
      const bc = R === 'grave' ? '#e8e2cc' : t.wood;
      s += OL('M10 72L80 70', bc, 5);
      if (R === 'ash' || R === 'grave') {
        s += P('M78 62Q92 60 94 70Q92 80 78 78Z', grad(ctx, t.head, 0.2, 'd')) + E(85, 68, 2, 1.8, INK, NS) + E(90, 68, 1.6, 1.6, INK, NS) + `<path d="M84 76l1 2M88 76l0.6 2" fill="none" stroke-width="1"/>`;
        if (R === 'ash') s += P('M80 63Q78 52 70 50Q78 50 84 62Z', '#3a2c26', ' stroke-width="1.4"');
      } else if (R === 'tide') {
        s += P('M78 62L92 66L92 74L78 78Z', grad(ctx, '#8e959b', 0.3)) + OL('M86 64L90 56M90 60L94 58M88 76L92 82', t.head, 2);
      } else if (R === 'veil') {
        s += P('M78 64L94 70L78 76Z', grad(ctx, t.head, 0.3)) + `<path d="M84 62l1 -3l1 3l3 1l-3 1l-1 3l-1 -3l-3 -1Z" fill="#fff" stroke-width="0.6"/>`;
      } else s += P('M78 63L88 64Q94 70 88 76L78 77Z', grad(ctx, t.head, 0.3)) + `<path d="M82 64V76" fill="none" stroke-width="1"/>`;
      s += wheel(24, 80, 6, t.wood === '#d9d3b8' ? '#b8b29a' : shade(t.wood, -0.1)) + wheel(60, 80, 6, t.wood === '#d9d3b8' ? '#b8b29a' : shade(t.wood, -0.1));
      return s;
    },
    treb: (ctx, c, t, u) => {
      const R = ctx.race;
      let s = ground(ctx);
      if (R === 'delver') {
        s += P('M30 80L36 62H60L66 80Z', grad(ctx, '#5a4636', 0.2)) + `<g transform="rotate(-35 48 64)">` + P('M38 56H74V72H38Z', grad(ctx, '#55514b', 0.3)) + E(74, 64, 3, 8, '#2b2420') + `<path d="M46 56V72M60 56V72" fill="none" stroke="${c.glow}" stroke-width="1.4"/></g>`;
        s += P('M66 34Q72 20 82 22Q76 26 80 30Q86 26 90 30Q82 36 72 36Z', '#ffcf5a', ' stroke-width="1.4"') + `<path d="M70 24l-4 -6M78 18l2 -6M86 24l6 -4" fill="none" stroke-width="1.4"/>`;
        s += crew(22, 84, 0.9) + wheel(38, 80, 6, '#6e4a2a') + wheel(58, 80, 6, '#6e4a2a');
        return s;
      }
      if (R === 'veil') {
        s += P('M40 82L46 60H54L60 82Z', grad(ctx, '#6a5080', 0.25));
        s += `<ellipse cx="50" cy="44" rx="26" ry="10" fill="none" stroke-width="4.4" transform="rotate(-20 50 44)"/><ellipse cx="50" cy="44" rx="26" ry="10" fill="none" stroke="#d9b65a" stroke-width="2.2" transform="rotate(-20 50 44)"/>`;
        s += `<ellipse cx="50" cy="44" rx="10" ry="24" fill="none" stroke-width="4.4" transform="rotate(25 50 44)"/><ellipse cx="50" cy="44" rx="10" ry="24" fill="none" stroke="#d9b65a" stroke-width="2.2" transform="rotate(25 50 44)"/>`;
        s += C(50, 44, 9, glowGrad(ctx, '#f0b8ff'), NS) + C(50, 44, 4, '#fff', ' stroke-width="1.4"') + P('M76 14l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2l5 -2Z', '#fff', ' stroke-width="1"') + `<path d="M74 22L62 36" fill="none" stroke="#f0b8ff" stroke-width="1.6" stroke-dasharray="3 2"/>`;
        s += crew(26, 84, 0.9, '#3b2c4f');
        return s;
      }
      // frame A
      const wood = t.wood;
      s += P('M26 82L44 40L48 40L36 82Z', grad(ctx, wood, 0.2)) + P('M70 82L52 40L48 40L60 82Z', grad(ctx, wood, 0.2)) + OL('M22 82H76', wood, 4);
      if (R === 'sylvan') {
        s = ground(ctx) + OL('M30 84Q26 60 36 44Q46 30 70 20', '#6b5233', 6) + OL('M36 84Q40 70 34 60', '#6b5233', 4);
        s += leaf(46, 32, 9, 3, -20, '#4f7a34') + leaf(38, 42, 8, 3, -60, '#4f7a34') + leaf(58, 24, 8, 3, 10, '#5e9a3a');
        s += C(74, 18, 6, '#7a6a5a') + `<path d="M70 12l-2 -3M78 12l2 -3M80 18l3 0M74 24v3M68 20l-3 1" fill="none" stroke-width="1.6"/>` + `<path d="M70 20L62 82" fill="none" stroke-width="1" stroke-dasharray="2 2"/>`;
        return s;
      }
      // arm with load
      const armCol = R === 'grave' ? '#e8e2cc' : wood;
      s += OL('M28 62L78 18', armCol, 3.6) + C(48, 44, 2.4, '#55514b', ' stroke-width="1.2"');
      if (R === 'ash') s += crew(28, 70, 1.6, '#4a3a3a') + `<path d="M78 18Q84 22 82 30" fill="none" stroke-width="1.4"/>`;
      else s += P('M22 58H34V70H22Z', grad(ctx, R === 'grave' ? '#5a4a3a' : '#7a706a', 0.25));
      const load = R === 'tide' ? P('M76 22h10v12h-10Z', grad(ctx, '#7b5a3a', 0.2)) + `<path d="M76 26h10M76 30h10" fill="none" stroke-width="1"/>`
        : R === 'grave' ? C(82, 28, 5, '#d9d3b8') + E(80, 27, 1.4, 1.6, INK, NS) + E(84, 27, 1.4, 1.6, INK, NS) + `<path d="M82 33l0 -2" stroke-width="1"/>`
          : R === 'wind' ? C(82, 28, 6, glowGrad(ctx, '#bfe8ff'), NS) + C(82, 28, 3.6, '#bfe8ff', ' stroke-width="1.4"') + `<path d="M88 16l-3 6h3l-3 6M92 30l-4 2" fill="none" stroke="${c.accent}" stroke-width="1.4"/>`
            : C(82, 28, 5, t.load);
      s += `<path d="M78 18L82 24" fill="none" stroke-width="1.2"/>` + load;
      if (R !== 'ash') s += crew(16, 84, 0.9) + crew(84, 85, 0.9);
      if (R === 'tide') s += `<path d="M84 40q-2 4 0 6M88 42q-2 4 0 6" fill="none" stroke="#7fe8ff" stroke-width="1.2"/>`;
      return s;
    },
  };
  // era on engines: 0 bare, 1 a pennant, 2 a war banner with the sigil, 3 gilded finial and glowing sigil
  const siegeEra = (ctx, c, e) => {
    if (!e) return `<path d="M70 92l4 -3M76 93l4 -3M20 93l4 -3" fill="none" stroke="#6b4a2a" stroke-width="1.2"/>`;
    let s = OL('M11 88V40', c.wood, 1.8);
    s += e === 1 ? P('M12 41L24 44L12 47Z', c.realm, ' stroke-width="1.3"')
      : P('M12 41Q20 39 27 42L26 46Q25 50 27 54Q20 51 12 55Z', grad(ctx, c.realm, 0.25, 'h'), ' stroke-width="1.4"') + sigil(ctx.race, 19, 48, 0.6, e === 3 ? c.glow : '#f3e7c4');
    if (e === 3) s += C(11, 39, 2, c.gold, ' stroke-width="1"') + C(19, 48, 5, glowGrad(ctx, c.glow), ' stroke="none" opacity=".7"');
    return s;
  };
  const ship = (ctx, c) => {
    const R = ctx.race, war = ctx.spec.unit === 'warship';
    const hull = { hearth: '#7a4e2a', delver: '#4a3a30', sylvan: '#6b5233', ash: '#3a2c26', tide: '#2f6f73', veil: '#4a3550', grave: '#5a5448', wind: '#9a7448' }[R] || '#7a4e2a';
    const sail = R === 'grave' ? '#9a9480' : R === 'veil' ? '#e4d8f0' : R === 'ash' ? '#a08c7a' : '#f1e8d2';
    let s = P('M0 0', 'none');
    // sea
    s += P('M2 80Q14 76 26 80Q38 84 50 80Q62 76 74 80Q86 84 98 80V100H2Z', grad(ctx, '#4f8fa0', 0.2), NS);
    // mast & sail
    s += OL('M50 84V10', '#5a3a24', 2.6);
    if (war) {
      s += P('M30 16Q50 12 70 16L72 52Q50 48 28 52Z', grad(ctx, sail, 0.12, 'h')) + `<path d="M30 28Q50 24 70 28M29 40Q50 36 71 40" fill="none" stroke="${c.realm}" stroke-width="3"/>`;
      s += sigil(R, 50, 34, 1.4, c.realm);
    } else {
      s += P('M26 18Q50 10 74 18Q80 36 72 54Q50 48 28 54Q20 36 26 18Z', grad(ctx, sail, 0.12, 'h')) + C(50, 34, 8, c.realm, ' stroke-width="1.6"') + sigil(R, 50, 34, 1.1, '#f3e7c4');
    }
    s += P('M50 10L50 4L62 7Z', c.realm, ' stroke-width="1.4"');
    // hull
    const prow = R === 'ash' ? P('M86 58Q96 46 92 38Q90 46 82 50Z', '#e6dcc3', ' stroke-width="1.6"')
      : R === 'tide' ? P('M86 58Q98 52 94 40Q90 50 82 50Z', '#e0705a', ' stroke-width="1.6"')
        : R === 'grave' ? C(90, 50, 4, '#d9d3b8', ' stroke-width="1.6"') + E(89, 49, 1, 1.2, INK, NS)
          : R === 'veil' ? P('M86 58Q96 44 90 36A6 6 0 0 0 84 52Z', '#cfd3e6', ' stroke-width="1.6"')
            : R === 'wind' ? leaf(88, 56, 16, 4, 40, '#f3efe4')
              : P('M84 58Q94 48 92 40Q86 44 84 50Z', '#c8903e', ' stroke-width="1.6"');
    s += prow;
    s += P(war ? 'M6 58H84Q92 58 96 54L86 78Q50 84 16 78Z' : 'M8 56Q20 60 50 60Q80 60 92 54Q90 72 80 78Q50 84 20 78Q10 72 8 56Z', grad(ctx, hull, 0.25));
    s += `<path d="M12 64Q50 70 88 64" fill="none" stroke="${c.realm}" stroke-width="2.4"/>`;
    if (war) {
      for (let i = 0; i < 6; i++) s += `<path d="M${22 + i * 10} 70l-6 14" fill="none" stroke-width="1.6"/>`;
      s += P('M86 74L98 76L88 80Z', '#8e959b', ' stroke-width="1.4"');
      for (let i = 0; i < 4; i++) s += C(24 + i * 14, 56, 3.4, i % 2 ? c.realm : '#d8dee4', ' stroke-width="1.3"');
    }
    s += `<path d="M6 86q6 -3 12 0q6 3 12 0M50 90q6 -3 12 0q6 3 12 0" fill="none" stroke="#e8f4f6" stroke-width="1.4"/>`;
    // era: 0 patched sail, 2 second pennant + painted rail, 3 gilded rail and glowing emblem
    const e = c.era;
    if (e === 0) s += P('M58 40h8v7h-8Z', '#c8b48a', ' stroke-width="1" stroke-dasharray="1.2 1"');
    if (e >= 2) s += P('M50 4L38 6L50 8Z', c.realm, ' stroke-width="1.2"') + `<path d="M14 61Q50 66 86 61" fill="none" stroke="${e === 3 ? c.gold : c.accent}" stroke-width="1.6" stroke-dasharray="3 2"/>`;
    if (e === 3) s += C(50, 34, 10, glowGrad(ctx, c.glow), ' stroke="none" opacity=".6"') + C(50, 4, 1.8, c.gold, ' stroke-width="0.9"');
    return s;
  };
  const MON = {
    wyrm: (ctx) => {
      const sc = '#8a2a1e';
      let s = P('M62 30Q86 10 96 30Q86 26 84 36Q92 38 94 48Q82 42 72 50Z', grad(ctx, '#5a1a14', 0.25, 'd'));
      s += P('M58 100Q52 76 58 60Q62 46 56 36Q44 26 30 30Q16 32 10 44L22 48Q12 54 8 64Q20 62 28 58Q36 58 42 64Q40 82 34 100Z', grad(ctx, sc, 0.25, 'd'));
      s += P('M10 44L22 48Q14 54 8 64Q4 56 10 44Z', '#5a1a14', ' stroke-width="1.4"') + P('M8 64Q18 70 28 58', 'none', ' stroke-width="1.4"');
      s += `<path d="M12 48l2 3l2 -3l2 3l2 -3M12 60l2 -3l2 3l2 -3" fill="#fff" stroke-width="0.9"/>`;
      s += P('M36 30Q40 14 54 8Q46 18 46 30Z', '#e8dcc0') + P('M46 34Q56 22 70 20Q58 28 54 38Z', '#e8dcc0');
      s += E(34, 38, 3.4, 2.2, '#ffcf5a', ' stroke-width="1.2"') + E(34, 38, 0.8, 2, INK, NS);
      s += `<path d="M44 66Q50 76 46 90M48 46l5 2M50 54l5 0" fill="none" stroke="#5a1a14" stroke-width="1.3"/>`;
      s += P('M8 56Q2 60 2 66Q6 62 4 72Q10 64 8 56Z', '#ffb347', ' stroke-width="1"') + C(5, 58, 3, glowGrad(ctx, '#ff8a3a'), NS);
      for (let i = 0; i < 4; i++) s += P(`M${n(52 + i * 3)} ${n(40 + i * 12)}l6 -3l-2 6Z`, '#e8dcc0', ' stroke-width="1"');
      return s;
    },
    demon: (ctx) => {
      let s = P('M50 10L46 30L56 44L44 60L54 80L48 98', 'none', ' stroke="#c35bb0" stroke-width="6" opacity=".6"') + P('M50 10L46 30L56 44L44 60L54 80L48 98', 'none', ' stroke="#fff" stroke-width="1.6"');
      s += P('M12 100Q14 78 30 72Q40 70 50 72Q60 70 70 72Q86 78 88 100Z', grad(ctx, '#7a1e2a', 0.25));
      s += P('M30 30Q16 18 18 4Q24 18 36 22Z', '#2b2024') + P('M70 30Q84 18 82 4Q76 18 64 22Z', '#2b2024');
      s += P('M30 30Q32 18 50 18Q68 18 70 30Q72 46 66 58Q58 70 50 70Q42 70 34 58Q28 46 30 30Z', grad(ctx, '#b02a2a', 0.25, 'd'));
      s += P('M36 40L46 44L36 46ZM64 40L54 44L64 46Z', '#ffd84a', ' stroke-width="1.2"');
      s += P('M38 56Q50 64 62 56Q58 62 50 64Q42 62 38 56Z', '#2b1010', ' stroke-width="1.2"') + `<path d="M42 57l1 3M47 59l0.6 3M53 59l-0.6 3M58 57l-1 3" fill="none" stroke="#fff" stroke-width="1.1"/>`;
      s += `<path d="M44 34l6 3l6 -3M50 46v4" fill="none" stroke-width="1.3"/>`;
      return s;
    },
    undead: (ctx) => {
      let s = P('M18 100Q16 70 26 50Q24 26 50 16Q76 26 74 50Q84 70 82 100Z', grad(ctx, '#3d4247', 0.25, 'd'));
      s += P('M50 26Q66 26 66 44Q66 54 60 60V68H40V60Q34 54 34 44Q34 26 50 26Z', grad(ctx, '#d9d3b8', 0.15, 'd'));
      s += E(43, 45, 4.4, 5, '#120e0c', NS) + E(57, 45, 4.4, 5, '#120e0c', NS) + C(43, 46, 1.8, '#7dffa8', NS) + C(57, 46, 1.8, '#7dffa8', NS);
      s += P('M48 52L50 56L52 52Z', INK, ' stroke-width="1"') + `<path d="M42 62H58M44 60v6M48 60v6M52 60v6M56 60v6" fill="none" stroke-width="1.1"/>`;
      s += `<path d="M38 78H62M40 84H60M42 90H58M50 72V98" fill="none" stroke="#d9d3b8" stroke-width="2"/>`;
      s += P('M34 32L36 22L42 28L50 18L58 28L64 22L66 32Q50 28 34 32Z', '#9a7a3a', ' stroke-width="1.6"');
      return s;
    },
    beast: (ctx) => {
      const star = ctx.spec.unit === 'starbeast', coat = star ? '#5a4a7a' : '#6a4a32';
      let s = P('M10 100Q8 76 20 62Q16 50 22 40L18 26L30 32Q40 26 50 26Q60 26 70 32L82 26L78 40Q84 50 80 62Q92 76 90 100Z', grad(ctx, coat, 0.25, 'd'));
      s += C(24, 32, 4, shade(coat, -0.2), ' stroke-width="1.6"') + C(76, 32, 4, shade(coat, -0.2), ' stroke-width="1.6"');
      s += P('M36 56Q50 46 64 56Q66 70 50 74Q34 70 36 56Z', shade(coat, 0.3));
      s += P('M40 64Q50 60 60 64Q58 74 50 76Q42 74 40 64Z', '#5a1a1a', ' stroke-width="1.4"') + `<path d="M42 64l1.6 3M58 64l-1.6 3M44 74l1 -3M56 74l-1 -3" fill="none" stroke="#fff" stroke-width="1.4"/>`;
      s += E(50, 56, 4, 2.6, INK, NS) + E(38, 46, 2.4, 2, star ? '#bfe8ff' : '#ffcf5a', ' stroke-width="1"') + E(62, 46, 2.4, 2, star ? '#bfe8ff' : '#ffcf5a', ' stroke-width="1"');
      s += `<path d="M30 42l6 2M70 42l-6 2" fill="none" stroke-width="1.6"/>`;
      if (star) for (const [x, y] of [[20, 70], [80, 74], [30, 88], [72, 90], [50, 36]]) s += P(`M${x} ${y - 3}l1 2l2 1l-2 1l-1 2l-1 -2l-2 -1l2 -1Z`, '#fff', ' stroke-width="0.5"');
      return s;
    },
    brigand: (ctx) => {
      let s = OL('M66 100L86 46', '#7a5a3a', 2.6) + `<g${along(66, 100, 86, 46)}>${HEADS.jag('#8a807a')}</g>`;
      s += P('M14 100Q14 76 30 70L50 74L70 70Q86 76 86 100Z', grad(ctx, '#5a4a3a', 0.25));
      s += P('M50 22Q68 22 68 44Q68 64 50 68Q32 64 32 44Q32 22 50 22Z', grad(ctx, '#c8946a', 0.2, 'd'));
      s += P('M32 42Q50 36 68 42L68 50Q50 46 32 50Z', '#2b2420', ' stroke-width="1.4"') + C(43, 46, 1.8, '#f4efe6', NS) + C(57, 46, 1.8, '#f4efe6', NS) + C(43, 46, 0.9, INK, NS) + C(57, 46, 0.9, INK, NS);
      s += P('M30 40Q28 14 50 12Q74 14 72 40Q60 30 50 30Q40 30 30 40ZM30 40Q22 60 28 80L36 72Q32 56 34 46Z', grad(ctx, '#4a3a32', 0.25, 'd'));
      s += `<path d="M42 58Q50 62 58 58M38 64l4 4M60 60l4 -2" fill="none" stroke-width="1.4"/><path d="M58 52l6 8" fill="none" stroke="#8a3a2a" stroke-width="1.2"/>`;
      return s;
    },
    elemental: (ctx) => {
      let s = C(50, 50, 40, glowGrad(ctx, '#ff8a3a'), NS);
      s += P('M18 100L22 74L14 60L26 50L22 34L38 30L44 14L58 20L70 12L74 30L88 36L80 52L88 66L78 76L82 100Z', grad(ctx, '#6a6058', 0.25, 'd'));
      s += `<path d="M30 56L40 50L36 64M60 30L66 44L58 48M70 64L62 74L72 80M28 82L40 78" fill="none" stroke="#ff8a3a" stroke-width="2.4"/>`;
      s += P('M38 40L46 42L38 46ZM62 40L54 42L62 46Z', '#ffd84a', ' stroke-width="1.2"') + P('M42 56Q50 62 58 56Q54 66 50 66Q46 66 42 56Z', '#ffb347', ' stroke-width="1.3"');
      for (const [x, y, r] of [[12, 30, 3], [88, 22, 2.4], [90, 82, 3], [8, 76, 2.2]]) s += P(`M${x - r} ${y}L${x} ${y - r}L${x + r} ${y}L${x} ${y + r}Z`, '#8a8078', ' stroke-width="1.2"');
      return s;
    },
  };

  // =====================================================================
  //  FRAME
  // =====================================================================
  const INNER = 'M14 7H86A7 7 0 0 0 93 14V86A7 7 0 0 0 86 93H14A7 7 0 0 0 7 86V14A7 7 0 0 0 14 7Z';
  const OUTER = 'M14 1.5H86Q98.5 1.5 98.5 14V86Q98.5 98.5 86 98.5H14Q1.5 98.5 1.5 86V14Q1.5 1.5 14 1.5Z';
  PORTRAIT.frameShape = { inner: INNER, outer: OUTER };
  const TRIM = [
    { name: 'leather', a: '#9a6a3e', b: '#5e3b1f', line: '#d8b98a', stud: '#c8a070' },
    { name: 'bronze', a: '#c88c48', b: '#7a4f22', line: '#f0c890', stud: '#f2cf8a' },
    { name: 'silver', a: '#e8ecf0', b: '#8d969e', line: '#ffffff', stud: '#f8fbff' },
    { name: 'gold', a: '#f6d873', b: '#a87a1e', line: '#fff3c0', stud: '#fff0b0' },
  ];
  const tierOf = r => r >= 9 ? 3 : r >= 6 ? 2 : r >= 3 ? 1 : 0;
  const frameLayer = ctx => {
    const g = plan(ctx), sp = ctx.spec, c = colorsOf(ctx);
    const dead = !!sp.dead, grand = g.kind === 'hero' || g.kind === 'ruler';
    const tier = tierOf(g.rank + (g.kind === 'ruler' ? 10 : 0));
    const tr0 = TRIM[tier], gx = dead ? grey : x => x;
    const tr = { a: gx(tr0.a), b: gx(tr0.b), line: gx(tr0.line), stud: gx(tr0.stud) };
    const realm = gx(c.realm);
    let s = P(OUTER + INNER, grad(ctx, tr.a, 0.2, 'd'), ' fill-rule="evenodd"');
    s += tier === 0 ? `<path d="M14 4.5H86Q95.5 4.5 95.5 14V86Q95.5 95.5 86 95.5H14Q4.5 95.5 4.5 86V14Q4.5 4.5 14 4.5Z" fill="none" stroke="${tr.line}" stroke-width="0.9" stroke-dasharray="2.2 1.8"/>`
      : `<path d="M14 4.4H86Q95.6 4.4 95.6 14V86Q95.6 95.6 86 95.6H14Q4.4 95.6 4.4 86V14Q4.4 4.4 14 4.4Z" fill="none" stroke="${tr.line}" stroke-width="0.9" opacity=".8"/>`;
    if (grand) s += `<path d="${INNER}" fill="none" stroke="${tr.b}" stroke-width="3.6"/><path d="${INNER}" fill="none" stroke="${tr.line}" stroke-width="1"/>`;
    // corner studs / gems
    for (const [x, y] of [[7, 7], [93, 7], [7, 93], [93, 93]]) {
      s += tier === 3 ? P(`M${x} ${y - 4}L${x + 3.4} ${y}L${x} ${y + 4}L${x - 3.4} ${y}Z`, gx(x < 50 === y < 50 ? '#c0392b' : '#2f7fd0'), ' stroke-width="1.2"') + C(x - 0.8, y - 1, 0.8, '#fff', NS)
        : C(x, y, grand ? 3 : 2.4, tr.stud, ' stroke-width="1.2"');
    }
    if (tier >= 2) for (const [x, y] of [[50, 4.4], [4.4, 50], [95.6, 50]]) s += C(x, y, 1.3, tr.stud, ' stroke-width="0.8"');
    // grand crest at the top
    if (g.kind === 'ruler') s += P('M38 8L36 1.5L43 4.5L50 0.8L57 4.5L64 1.5L62 8Z', grad(ctx, gx('#f0c850'), 0.25), ' stroke-width="1.6"') + C(50, 5, 1.5, realm, ' stroke-width="0.8"');
    else if (g.magus) s += C(50, 6, 4.6, grad(ctx, gx(ctx.schoolCol || '#9b6ad3'), 0.3, 'd'), ' stroke-width="1.4"') + sGlyph(ctx, ctx.school, 50, 6, 0.55, gx(schoolGlow(ctx)), 0.5);
    else if (g.kind === 'hero') s += P('M50 1L52.2 5.4L57.2 6L53.4 9.2L54.5 13.8L50 11.3L45.5 13.8L46.6 9.2L42.8 6L47.8 5.4Z', grad(ctx, tr.a, 0.3), ' stroke-width="1.4"');
    // realm banner tab at the bottom
    const tabC = grad(ctx, realm, 0.25);
    s += P('M41 88H59V95L50 99.5L41 95Z', tabC, ' stroke-width="1.6"') + sigil(ctx.race, 50, 93, 0.62, gx('#f3e7c4'));
    // dead: black ribbon across the top-right corner
    if (dead) s += P('M60 1.5L72 1.5L98.5 28V40Z', '#1a1412', ' stroke-width="1.4"') + P('M80 18l-6 9l3 1zM80 18l9 -5l1 3z', '#1a1412', ' stroke-width="1.2"');
    return flush(ctx, s, 2.2);
  };

  // =====================================================================
  //  MAGI — kind 'magus' (the Circle's named mages) and the mage units: school regalia.
  //  ctx.school / ctx.schoolCol come from portraits.js. A magus reads spec.rank as 1..5:
  //   1-2 apprentice (simple headgear) · 3-4 adept (the people's mage headgear, floating school motes)
  //   5 archmagus (a halo of glyph-stones over the head); aura from rank 2, glowing eyes from rank 4.
  //  The focus (staff head) is the school's; the shaft and the mantle are the people's.
  // =====================================================================
  const schoolGlow = ctx => mix(ctx.schoolCol || '#9b6ad3', '#ffffff', 0.45);
  // one radial glow per colour per portrait (motes, eyes and the focus share it: keeps the svg small)
  const gg = (ctx, col) => { const m = ctx._gg || (ctx._gg = {}); return m[col] || (m[col] = glowGrad(ctx, col)); };
  // a school's glyph, ~10 units across, centred on (x, y)
  const SGLYPH = {
    hearthweather: 'M0 -5L1.2 -2.4L3.5 -3.5L2.4 -1.2L5 0L2.4 1.2L3.5 3.5L1.2 2.4L0 5L-1.2 2.4L-3.5 3.5L-2.4 1.2L-5 0L-2.4 -1.2L-3.5 -3.5L-1.2 -2.4Z',
    runecraft: 'M0 -5L3.4 0L0 5L-3.4 0ZM0 -3.4V3.4M0 -0.6L1.8 -2.2',
    songroot: 'M0 5Q-5 0 0 -5Q5 0 0 5ZM0 4.4V-3.6M0 0.4L-1.8 -1.4M0 2L1.8 0.2',
    bloodember: 'M0 -5Q4.2 -0.4 2.8 2.4A3.1 3.1 0 0 1 -2.8 2.4Q-4.2 -0.4 0 -5ZM0 -0.6Q1.4 1.2 0 2.6Q-1.4 1.2 0 -0.6Z',
    tidestorm: 'M-5 1.6Q-3.4 -3.4 0 -0.2Q3.4 3 5 -1.8M-5 4.2Q-3.4 -0.6 0 2.4Q3.4 5.4 5 0.8',
    glamour: 'M0 -5L1.2 -1.2L5 0L1.2 1.2L0 5L-1.2 1.2L-5 0L-1.2 -1.2Z',
    necromancy: 'M-3.6 0.4A3.6 3.6 0 1 1 3.6 0.4V3H2V5H-2V3H-3.6ZM-1.6 -0.4h0.2M1.4 -0.4h0.2',
    skywind: 'M1.4 -5L-3 0.6H0L-1.4 5L3 -0.8H0Z',
  };
  // drawn once per portrait as a <defs> path, then placed with <use> (a magus wears a dozen of them)
  const sGlyph = (ctx, school, x, y, s, col, w = 0.9) => {
    const k = ctx._sg || (ctx._sg = {}), id = ctx.id + 'g' + school.slice(0, 3);
    if (!k[school]) { k[school] = 1; ctx._gd = (ctx._gd || '') + `<path id="${id}" d="${SGLYPH[school] || SGLYPH.glamour}"/>`; }
    const tr = ` transform="translate(${n(x)} ${n(y)}) scale(${n(s)})"`;
    return school === 'tidestorm' ? `<use href="#${id}" fill="none" stroke="${col}" stroke-width="${n(1.5 / s)}"${tr}/>` : `<use href="#${id}" fill="${col}" stroke-width="${n(w / s)}"${tr}/>`;
  };
  // headgear by people and rank tier (apprentice, adept, archmagus)
  const MAGUS_HELM = {
    hearth: [['cap'], ['wizardhat'], ['wizardhat:grand']], delver: [['hood:rune'], ['hood:rune'], ['hood:rune:grand']],
    sylvan: [['leafcrown'], ['mooncirclet'], ['branchcrown']], ash: [['bandana'], ['skullmask'], ['skullmask', 'embercrown']],
    tide: [['pearlcirclet'], ['pearlcirclet'], ['coralhelm']], veil: [['thorncirclet'], ['thorncirclet:tall'], ['thorncirclet:tall']],
    grave: [['hood:tatter'], ['hood:skull'], ['hood:skull', 'rustcrown']], wind: [['featherband'], ['feathermitre'], ['feathermitre']],
  };
  const magusTier = r => r >= 5 ? 2 : r >= 3 ? 1 : 0;
  // a ring of flames over the head (Ashborn archmagi)
  HELM.embercrown = (ctx, A, c) => {
    let s = '';
    for (let i = -3; i <= 3; i++) {
      const x = A.cx + i * A.rx * 0.3, y = A.cy - A.ry * (0.95 + (1 - Math.abs(i) / 3) * 0.18), h = 5 + (3 - Math.abs(i)) * 1.2;
      s += P(`M${n(x - 2)} ${n(y)}Q${n(x - 2.2)} ${n(y - h * 0.6)} ${n(x)} ${n(y - h)}Q${n(x + 2.2)} ${n(y - h * 0.6)} ${n(x + 2)} ${n(y)}Z`, i % 2 ? '#f2c040' : '#e0632a', ' stroke-width="0.9"');
    }
    return s;
  };
  // the archmagus' halo: glyph-stones floating in a ring over the head
  HELM.archhalo = (ctx, A) => {
    const sc = ctx.schoolCol || '#9b6ad3', gl = schoolGlow(ctx), cy = A.cy - A.ry * 1.55, rx = A.rx * 1.15, ry = A.ry * 0.28;
    let s = `<ellipse cx="${n(A.cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="none" stroke="${gl}" stroke-width="1.1" opacity=".8"/>`;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.1 + i * 0.2), x = A.cx - Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      s += P(`M${n(x)} ${n(y - 2.6)}L${n(x + 2)} ${n(y)}L${n(x)} ${n(y + 2.6)}L${n(x - 2)} ${n(y)}Z`, i === 2 ? gl : sc, ' stroke-width="0.8"');
    }
    return s;
  };
  // the focus: shaft of the people's material, head of the school's making
  const SHAFT = { hearth: '#8b5a2b', delver: '#6e6a64', sylvan: '#7a6a44', ash: '#e6dcc3', tide: '#c9a77a', veil: '#e6e9f5', grave: '#3d3530', wind: '#a07a4a' };
  const FOCUS = {
    hearthweather: (ctx, c, sc, gl) => `<path d="M80.5 17V21" fill="none" stroke-width="1.2"/>` + P('M76.5 21H84.5L83.5 23H77.5Z', c.gold) + P('M77.5 23H83.5V31H77.5Z', gl, ' stroke-width="1.4"') + `<path d="M80.5 23V31M77.5 27H83.5" fill="none" stroke="${c.gold}" stroke-width="0.9"/>` + P('M77 31H84L83 33H78Z', c.gold) + C(80.5, 27, 1.6, '#fff8d8', NS)
      + `<path d="M70 18q2 -3 5 -1.6q1.6 -2.6 4.4 -0.6" fill="#f2f0e8" stroke-width="1"/><path d="M71 20l-0.8 2M74 20l-0.8 2" fill="none" stroke="#5fa3c8" stroke-width="0.9"/>`,
    runecraft: (ctx, c, sc, gl) => `<g transform="rotate(12 80.5 25)">` + P('M74.5 18H86.5V32H74.5Z', grad(ctx, '#8e8a82', 0.3, 'd'), ' stroke-width="1.6"') + P('M74.5 20H86.5M74.5 30H86.5', 'none', ` stroke="${c.gold}" stroke-width="1.1"`) + `<path d="M80.5 21.5V28.5M80.5 23L83 21.5M80.5 26L78 24.5" fill="none" stroke="${gl}" stroke-width="1.5"/></g>`,
    songroot: (ctx, c, sc, gl) => OL('M80.5 34Q79 26 75 20M80.5 33Q82 26 87 21M80.5 31Q81 25 81 16', SHAFT.sylvan, 1.5) + leaf(75, 20, 7, 2.4, -40, '#5e9a3a') + leaf(87, 21, 7, 2.4, 45, '#7fb24a') + leaf(81, 16, 6, 2.2, 5, '#5e9a3a') + C(80.5, 25, 2.6, gl, ' stroke-width="1"') + C(79.8, 24.3, 0.8, '#fff', NS),
    bloodember: (ctx, c, sc, gl) => P('M75 26Q80.5 34 86 26Z', grad(ctx, c.bone || '#e6dcc3', 0.2), ' stroke-width="1.5"') + `<path d="M76.5 27.5l-1.5 -2M84.5 27.5l1.5 -2" fill="none" stroke-width="1.2"/>`
      + P('M76.5 26Q75.5 20 79 15Q78.6 19 80.5 20Q81 15.5 84 13Q83 18 85 21Q85.4 24 84.5 26Z', '#e0632a', ' stroke-width="1.1"') + P('M78.5 26Q78 22.5 80.5 19.5Q81 22.5 82.6 23.5Q83 25 82.5 26Z', '#f2c040', NS) + C(73, 15, 0.8, '#f2a22a', NS) + C(87, 12, 0.7, sc, NS),
    tidestorm: (ctx, c, sc, gl) => P('M74 30Q74 34 80.5 34Q87 34 87 30L87 19L85.4 22L85.4 30L75.6 30L75.6 22L74 19Z', grad(ctx, '#78b0a8', 0.3), ' stroke-width="1.4"') + P('M79.6 30V17L80.5 14L81.4 17V30', '#78b0a8', ' stroke-width="1.2"') + C(80.5, 24, 3.8, gl, ' stroke-width="1.2" fill-opacity=".85"') + `<path d="M78 24.5q1.2 -1.2 2.5 0t2.5 0" fill="none" stroke="#fff" stroke-width="0.9"/>`,
    glamour: (ctx, c, sc, gl) => P('M86 17A8 8 0 1 0 86 31A6 6 0 1 1 86 17Z', grad(ctx, '#eef0fa', 0.15), ' stroke-width="1.4"') + `<path d="M82 21L83 23.3L85.4 24L83 24.7L82 27L81 24.7L78.6 24L81 23.3Z" fill="${gl}" stroke-width="0.7"/>` + C(82, 24, 4, gg(ctx, sc), ' stroke="none" opacity=".7"'),
    necromancy: (ctx, c, sc, gl) => P('M80.5 12Q78 16 79 19Q76.5 17 77.5 13Q74.5 17 77 21H84Q86.5 17 83.5 13Q84.5 17 82 19Q83 16 80.5 12Z', gl, ' stroke-width="1"') + P('M76.2 25A4.3 4.3 0 1 1 84.8 25V28.4H83V30.4H78V28.4H76.2Z', grad(ctx, c.bone || '#d9d3b8', 0.2), ' stroke-width="1.4"') + C(78.6, 25, 1.1, gl, NS) + C(82.4, 25, 1.1, gl, NS) + `<path d="M79.4 30.4V29M81.6 30.4V29" fill="none" stroke-width="0.7"/>`,
    skywind: (ctx, c, sc, gl) => OL('M80.5 34L77 18M80.5 34L84.5 17', '#c87a3a', 1.4) + `<ellipse cx="80.6" cy="29" rx="3" ry="1.1" fill="none" stroke="#d89a5a" stroke-width="1.1"/><ellipse cx="80.6" cy="25.5" rx="3.6" ry="1.2" fill="none" stroke="#d89a5a" stroke-width="1.1"/>` + `<path d="M77 18L79.6 21.5L78.6 22.6L81.6 26.5" fill="none" stroke="${gl}" stroke-width="1.6"/><path d="M84.5 17L82.2 20.6L83.4 21.4L81.6 24" fill="none" stroke="#fff" stroke-width="1"/>`,
  };
  WDRAW.focus = (ctx, c) => {
    const sc = ctx.schoolCol || '#9b6ad3', gl = schoolGlow(ctx), r = ctx.gear && ctx.gear.magus ? ctx.gear.magus.rank : 2;
    const wood = ctx.race === 'tide' || ctx.race === 'sylvan' ? SHAFT[ctx.race] : c.era === 3 && ctx.race !== 'grave' ? mix(SHAFT[ctx.race] || c.wood, '#e8bf48', 0.25) : (SHAFT[ctx.race] || c.wood);
    let s = C(80.5, 25, 8 + r * 1.6, gg(ctx, sc), ` stroke="none" opacity="${n(0.35 + r * 0.1)}"`);
    s += shaft(73, 100, 80.5, 33, wood, 2.6);
    if (ctx.race === 'sylvan' || ctx.race === 'veil') s += leaf(77.5, 50, 7, 2.2, -50, ctx.race === 'sylvan' ? (c.leaf || '#5e9a3a') : c.accent);
    if (ctx.race === 'grave') s += `<path d="M75 74h3M75.6 68h3M76.4 62h3" fill="none" stroke="${c.bone}" stroke-width="1.1"/>`;
    if (ctx.race === 'delver') s += `<path d="M76.2 66l3 0.6M77 60l3 0.6" fill="none" stroke="${c.gold}" stroke-width="1.6"/>`;
    if (c.era >= 2) s += `<path d="M78.6 40.4l3.6 0.8M78.9 38.4l3.6 0.8" fill="none" stroke="${c.gold}" stroke-width="1.4"/>`;
    s += (FOCUS[ctx.school] || FOCUS.glamour)(ctx, c, sc, gl);
    return s;
  };
  // behind the body: the aura (rank 2+), a turning rune ring (4+), rays (5) — clipped to the frame
  const magusAura = (ctx, g) => {
    const r = g.magus.rank, sc = ctx.schoolCol || '#9b6ad3', gl = schoolGlow(ctx), A = anat(ctx).head;
    if (r < 2) return '';
    const id = ctx.id + 'ma';
    ctx._gd = (ctx._gd || '') + `<radialGradient id="${id}" cx="${n(A.cx)}" cy="${n(A.cy)}" r="${n(26 + r * 6)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${gl}" stop-opacity="${n(0.2 + r * 0.06)}"/><stop offset=".42" stop-color="${gl}" stop-opacity="${n(0.3 + r * 0.08)}"/><stop offset=".72" stop-color="${sc}" stop-opacity="${n(0.16 + r * 0.06)}"/><stop offset="1" stop-color="${sc}" stop-opacity="0"/></radialGradient>`
      + `<clipPath id="${ctx.id}mc"><rect x="5" y="5" width="90" height="90" rx="12"/></clipPath>`;
    let s = `<rect x="5" y="5" width="90" height="90" fill="url(#${id})" stroke="none"/>`;
    if (r >= 5) { let d = ''; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.13, a1 = a - 0.07, a2 = a + 0.07; d += `M${n(A.cx)} ${n(A.cy)}L${n(A.cx + Math.cos(a1) * 70)} ${n(A.cy + Math.sin(a1) * 70)}L${n(A.cx + Math.cos(a2) * 70)} ${n(A.cy + Math.sin(a2) * 70)}Z`; } s += `<path d="${d}" fill="${gl}" stroke="none" opacity=".16"/>`; }
    if (r >= 4) {
      const R = A.ry * 1.62;
      s += `<circle cx="${n(A.cx)}" cy="${n(A.cy)}" r="${n(R)}" fill="none" stroke="${gl}" stroke-width="1.2" opacity=".75"/><circle cx="${n(A.cx)}" cy="${n(A.cy)}" r="${n(R - 3.4)}" fill="none" stroke="${sc}" stroke-width="0.8" stroke-dasharray="2.6 1.6" opacity=".7"/>`;
      let d = ''; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2 + 0.2, x = A.cx + Math.cos(a) * (R - 1.7), y = A.cy + Math.sin(a) * (R - 1.7); d += i % 2 ? `M${n(x - 1)} ${n(y)}h2` : `M${n(x)} ${n(y - 1.6)}l1.1 1.6l-1.1 1.6l-1.1 -1.6Z`; }
      s += `<path d="${d}" fill="${gl}" stroke="${gl}" stroke-width="0.8"/>`;
    }
    return `<g clip-path="url(#${ctx.id}mc)">${s}</g>`;
  };
  // the people's mantle and the school's stole, with era finery
  const magusRobe = (ctx, c, g) => {
    const a = anat(ctx), y = a.sh.y, nx = a.neck.x, L0 = a.sh.left, R0 = a.sh.right, e = g.era, sc = ctx.schoolCol || '#9b6ad3', gl = schoolGlow(ctx), race = ctx.race;
    let s = '';
    // the people's mantle
    if (race === 'hearth') s += P(`M${n(L0 + 2)} ${n(y + 10)}Q${n(L0 + 3)} ${n(y - 6)} ${n(nx - 10)} ${n(y - 9)}Q${n(nx)} ${n(y - 3)} ${n(nx + 10)} ${n(y - 9)}Q${n(R0 - 3)} ${n(y - 6)} ${n(R0 - 2)} ${n(y + 10)}Q${n(nx)} ${n(y + 4)} ${n(L0 + 2)} ${n(y + 10)}Z`, grad(ctx, mix(c.realm, '#6a5a44', 0.45), 0.2), ' stroke-width="1.6"');
    else if (race === 'delver') for (const d of [-1, 1]) s += `<path d="M${n(nx + d * 9)} ${n(y - 8)}L${n(nx + d * 22)} ${n(y + 24)}" fill="none" stroke-width="5"/><path d="M${n(nx + d * 9)} ${n(y - 8)}L${n(nx + d * 22)} ${n(y + 24)}" fill="none" stroke="${c.leather}" stroke-width="3"/>` + P(`M${n(nx + d * 13)} ${n(y + 1)}l${n(d * 5)} -1.2l1.4 5.4l${n(-d * 5)} 1.2Z`, '#8e8a82', ' stroke-width="1"') + `<path d="M${n(nx + d * 15.6)} ${n(y + 1.6)}v4" fill="none" stroke="${gl}" stroke-width="1"/>`;
    else if (race === 'sylvan') for (let i = 0; i < 9; i++) { const d = i < 4.5 ? -1 : 1, k = i < 4.5 ? i : i - 4.5; s += leaf(nx + d * (8 + k * 4.4), y - 6 + k * 2.2, 9, 2.8, d * (100 + k * 10), k % 2 ? '#5e9a3a' : '#7fb24a'); }
    else if (race === 'ash') { s += P(`M${n(L0 + 1)} ${n(y + 4)}Q${n(L0 + 4)} ${n(y - 7)} ${n(nx - 10)} ${n(y - 8)}L${n(nx - 8)} ${n(y - 2)}Q${n(L0 + 10)} ${n(y)} ${n(L0 + 1)} ${n(y + 4)}ZM${n(R0 - 1)} ${n(y + 4)}Q${n(R0 - 4)} ${n(y - 7)} ${n(nx + 10)} ${n(y - 8)}L${n(nx + 8)} ${n(y - 2)}Q${n(R0 - 10)} ${n(y)} ${n(R0 - 1)} ${n(y + 4)}Z`, '#7d6a58', ' stroke-width="1.4"'); for (let i = -4; i <= 4; i++) s += E(nx + i * 2.6, y - 2 + Math.abs(i) * -0.9 + 4, 1.1, 1.5, i % 2 ? (c.bone || '#e6dcc3') : '#b3261e', ' stroke-width="0.6"'); }
    else if (race === 'tide') { for (const d of [-1, 1]) { const cx = d < 0 ? L0 + 9 : R0 - 9; s += P(`M${n(cx - 9)} ${n(y + 6)}Q${n(cx)} ${n(y - 10)} ${n(cx + 9)} ${n(y + 6)}Z`, grad(ctx, c.shell || '#efd6c4', 0.15), ' stroke-width="1.4"'); for (let k = -2; k <= 2; k++) s += `<path d="M${n(cx)} ${n(y + 5)}L${n(cx + k * 3.6)} ${n(y - 3 + Math.abs(k))}" fill="none" stroke="${c.coral || '#e0705a'}" stroke-width="0.8"/>`; } s += `<path d="M${n(nx - 12)} ${n(y - 6)}Q${n(nx)} ${n(y + 8)} ${n(nx + 12)} ${n(y - 6)}" fill="none" stroke="#fbf6ea" stroke-width="2.2" stroke-dasharray="0.1 2.6"/>`; }
    else if (race === 'veil') s += P(`M${n(nx - 7)} ${n(y - 9)}Q${n(nx - 20)} ${n(y - 22)} ${n(nx - 17)} ${n(y - 34)}Q${n(nx - 12)} ${n(y - 22)} ${n(nx)} ${n(y - 12)}Q${n(nx + 12)} ${n(y - 22)} ${n(nx + 17)} ${n(y - 34)}Q${n(nx + 20)} ${n(y - 22)} ${n(nx + 7)} ${n(y - 9)}Z`, grad(ctx, mix(sc, '#f4f0ff', 0.55), 0.2), ' stroke-width="1.3" opacity=".92"');
    else if (race === 'grave') { s += P(`M${n(L0 + 1)} ${n(y + 12)}Q${n(L0 + 2)} ${n(y - 7)} ${n(nx - 9)} ${n(y - 9)}Q${n(nx)} ${n(y - 3)} ${n(nx + 9)} ${n(y - 9)}Q${n(R0 - 2)} ${n(y - 7)} ${n(R0 - 1)} ${n(y + 12)}L${n(R0 - 5)} ${n(y + 8)}L${n(R0 - 9)} ${n(y + 13)}L${n(R0 - 13)} ${n(y + 7)}L${n(nx + 8)} ${n(y + 4)}Q${n(nx)} ${n(y + 7)} ${n(nx - 8)} ${n(y + 4)}L${n(L0 + 13)} ${n(y + 7)}L${n(L0 + 9)} ${n(y + 13)}L${n(L0 + 5)} ${n(y + 8)}Z`, grad(ctx, '#3a3c40', 0.2), ' stroke-width="1.4"'); s += `<path d="M${n(nx - 6)} ${n(y + 2)}h12M${n(nx - 5)} ${n(y + 5)}h10" fill="none" stroke="${c.bone}" stroke-width="1.6"/>`; }
    else if (race === 'wind') for (let i = 0; i < 10; i++) { const d = i < 5 ? -1 : 1, k = i % 5; s += leaf(nx + d * (8 + k * 4.4), y - 7 + k * 2.4, 11, 2.6, d * (115 + k * 9), k % 2 ? (c.feather || '#f3efe4') : mix(sc, '#f3efe4', 0.4)); }
    // the stole in the school's colour: undyed and rope-belted (era 0), dyed (1), embroidered glyphs (2), gold and glowing (3)
    const stole = e === 0 ? mix(sc, '#8a7a62', 0.55) : sc;
    const band = dx => `M${n(nx + dx * 6)} ${n(y - 8)}Q${n(nx + dx * 10)} ${n(y + 6)} ${n(nx + dx * 9)} 100H${n(nx + dx * 15)}Q${n(nx + dx * 16)} ${n(y + 4)} ${n(nx + dx * 12)} ${n(y - 9)}Z`;
    s += P(band(-1), grad(ctx, stole, 0.25)) + P(band(1), grad(ctx, stole, 0.25));
    if (e === 0) s += `<path d="M${n(nx - 16)} ${n(y + 16)}Q${n(nx)} ${n(y + 20)} ${n(nx + 16)} ${n(y + 16)}M${n(nx - 3)} ${n(y + 19)}l-2 7M${n(nx - 1)} ${n(y + 19)}l1 6" fill="none" stroke="#c8b48a" stroke-width="1.8"/>`;
    if (e >= 1) for (const dx of [-1, 1]) for (const k of e >= 2 ? [0, 1] : [0]) s += sGlyph(ctx, ctx.school, nx + dx * 11.3, y + 10 + k * 9, 0.42, e === 3 ? gl : mix(sc, '#fffaf0', 0.65), 0.5);
    if (e >= 2) s += `<path d="M${n(nx - 13.6)} ${n(y + 2)}V97M${n(nx + 13.6)} ${n(y + 2)}V97" fill="none" stroke="${e === 3 ? c.gold : mix(sc, '#fffaf0', 0.5)}" stroke-width="1" stroke-dasharray="${e === 3 ? '3 1.5' : '1.5 1.5'}"/>`;
    if (e === 3) s += P(`M${n(nx - 12)} ${n(y - 9)}Q${n(nx)} ${n(y - 1)} ${n(nx + 12)} ${n(y - 9)}L${n(nx + 14)} ${n(y - 13)}Q${n(nx)} ${n(y - 4)} ${n(nx - 14)} ${n(y - 13)}Z`, c.gold, ' stroke-width="1.2"');
    // a clasp: wood toggle (0), bronze (1), silver (2), a jewel in the school's colour (3); archmagi wear a medallion
    const cy = y + 3;
    if (g.magus.rank >= 5) s += `<path d="M${n(nx - 9)} ${n(y - 6)}Q${n(nx)} ${n(y + 12)} ${n(nx + 9)} ${n(y - 6)}" fill="none" stroke="${c.gold}" stroke-width="1.4" stroke-dasharray="2 1"/>` + C(nx, y + 9, 4.2, c.gold, ' stroke-width="1.2"') + sGlyph(ctx, ctx.school, nx, y + 9, 0.55, sc, 0.6);
    else s += e === 3 ? C(nx, cy, 3.4, gg(ctx, sc), NS) + P(`M${n(nx)} ${n(cy - 2.6)}l2 2.6l-2 2.6l-2 -2.6Z`, gl, ' stroke-width="0.9"') : C(nx, cy, 2.2, e === 0 ? '#8a6a44' : e === 1 ? '#c08a4a' : '#d8dce4', ' stroke-width="1"');
    return s;
  };
  // in front: glowing eyes (rank 4+) and the school's motes drifting round the magus (rank 3+)
  const MOTES = [[16, 22], [24, 14], [14, 40], [27, 30], [12, 58], [64, 12], [30, 50]];
  const magusFront = (ctx, g) => {
    const r = g.magus.rank, sc = ctx.schoolCol || '#9b6ad3', gl = schoolGlow(ctx), sch = ctx.school;
    let s = '';
    if (r >= 4) { // eyes alight with the school's colour (positions as the face layer draws them)
      const A = ctx.anat, H = A.head, lk = ctx.look || {}, ex = H.cx + 1, ey = A.brow + (ctx.race === 'delver' ? 4.5 : 4), es = H.rx * (ctx.race === 'veil' ? 0.44 : 0.4) + (lk.gap || 0) * 0.6;
      const eg = gg(ctx, gl);
      for (const d of [-1, 1]) { if (lk.patch && d === 1) continue; const x = ex + d * es; s += C(x, ey, r >= 5 ? 4.4 : 3.4, eg, ' stroke="none" opacity=".9"') + C(x, ey, 0.9, '#fff', NS); }
    }
    if (r >= 3) {
      const rr = PORTRAIT.prng(PORTRAIT.hash(String(ctx.spec.seed ?? '') + ':' + sch + ':motes'));
      const k = r >= 5 ? 6 : r >= 4 ? 5 : 4;
      for (let i = 0; i < k; i++) {
        const [x0, y0] = MOTES[i], x = x0 + (rr() - 0.5) * 5, y = y0 + (rr() - 0.5) * 5, sz = 0.85 + rr() * 0.5;
        if (sch === 'songroot') s += leaf(x, y + 3, 6 * sz, 2 * sz, rr() * 360, i % 2 ? '#7fb24a' : '#5e9a3a');
        else if (sch === 'bloodember' || sch === 'necromancy' || sch === 'tidestorm') {
          const col = sch === 'bloodember' ? (i % 2 ? '#f2c040' : '#e0632a') : sch === 'necromancy' ? gl : mix(sc, '#ffffff', 0.55);
          s += C(x, y, 3 * sz, gg(ctx, col), ' stroke="none" opacity=".75"') + (sch === 'tidestorm' ? P(`M${n(x)} ${n(y - 2.4 * sz)}Q${n(x + 1.8 * sz)} ${n(y + 0.4)} ${n(x)} ${n(y + 1.6 * sz)}Q${n(x - 1.8 * sz)} ${n(y + 0.4)} ${n(x)} ${n(y - 2.4 * sz)}Z`, col, ' stroke-width="0.6"') : C(x, y, 1 * sz, col, sch === 'necromancy' ? ' stroke-width="0.5"' : NS));
        } else s += C(x, y, 3.2 * sz, gg(ctx, sc), ' stroke="none" opacity=".55"') + sGlyph(ctx, sch, x, y, 0.32 * sz, gl, 0.4);
      }
    }
    return s;
  };
  // mage units: the people's school on their robes too (its glyphs on the stole from era 1)
  const mageUnitExtras = (ctx, g) => {
    const sc = ctx.schoolCol || '#9b6ad3', gl = schoolGlow(ctx), a = anat(ctx), y = a.sh.y, nx = a.neck.x;
    let s = '';
    if (g.era >= 1) for (const dx of [-1, 1]) s += sGlyph(ctx, ctx.school, nx + dx * 11.3, y + 12, 0.4, g.era === 3 ? gl : mix(sc, '#fffaf0', 0.6), 0.5);
    return s;
  };

  // =====================================================================
  //  LAYERS
  // =====================================================================
  PORTRAIT.layers.frameBack.push(ctx => {
    const g = plan(ctx);
    if (g.whole) return '';
    const c = colorsOf(ctx);
    let s = '';
    if (g.magus) s += magusAura(ctx, g);
    if (g.wings) s += wingsBack(ctx, c, g.wings);
    if (g.quiver) s += quiverBack(ctx, c);
    return flush(ctx, s);
  });
  PORTRAIT.layers.body.push(ctx => {
    const g = plan(ctx);
    if (!g.whole) return '';
    const c = colorsOf(ctx);
    let s;
    if (g.whole === 'ship') s = ship(ctx, c);
    else if (g.whole === 'siege') { const t = SIEGE_THEME[ctx.race] || SIEGE_THEME.hearth; s = `<g transform="translate(-5 -9) scale(1.1)">${SIEGE[/^treb/.test(ctx.spec.unit || '') ? 'treb' : 'ram'](ctx, c, t, ctx.spec.unit)}</g>` + siegeEra(ctx, c, g.era); }
    else s = MON[g.whole.split(':')[1]](ctx);
    ctx._gd = (ctx._gd || '') + `<clipPath id="${ctx.id}wc"><rect x="5" y="5" width="90" height="90" rx="12"/></clipPath>`;
    return `<g clip-path="url(#${ctx.id}wc)">${flush(ctx, s)}</g>`;
  });
  PORTRAIT.layers.mount.push(ctx => {
    const g = plan(ctx);
    if (g.whole) return '';
    const c = colorsOf(ctx);
    // worn things sit under the head layer (beards and chins fall over the armour), the beast over them
    let s = '';
    if (g.mantle) s += mantle(ctx, c);
    if (g.magus) s += magusRobe(ctx, c, g);
    else if (g.armour && g.kind !== 'citizen') s += armour(ctx, c, g);
    else if (ctx.role === 'mage' || g.weapon === 'staff' || (g.kind === 'advisor' && ctx.spec.role === 'priest')) s += robe(ctx, c, g) + (g.kind === 'unit' && ctx.role === 'mage' ? mageUnitExtras(ctx, g) : '');
    return flush(ctx, s);
  });
  PORTRAIT.layers.headgear.push(ctx => {
    const g = plan(ctx);
    if (g.whole || !g.helm.length) return '';
    return flush(ctx, g.helm.map((h, i) => drawHelm(ctx, h, i)).join(''));
  });
  PORTRAIT.layers.gear.push(ctx => {
    const g = plan(ctx);
    if (g.whole) return '';
    const c = colorsOf(ctx);
    let s = '';
    // the beast stands in front of the rider's off-hand side, nudged clear of wide heads
    if (g.mount && BEAST[g.mount] && g.mount !== 'wings') {
      const A = anat(ctx).head, dx = n(Math.min(0, A.cx - A.rx - 35));
      s += `<g transform="translate(${dx} 2)">${BEAST[g.mount](ctx, c)}${barding(ctx, c, g.mount, g.era)}</g>`;
    }
    if (g.satchel) s += satchel(ctx, c);
    if (g.banner) s += WDRAW.banner(ctx, c);
    else if (g.weapon && WDRAW[g.weapon]) {
      s += WDRAW[g.weapon](ctx, c);
      const tip = BLADE_TIP[g.weapon];
      if (tip && c.era >= 2) s += (c.era === 3 ? C(tip[0], tip[1], 6, glowGrad(ctx, c.glow), NS) : '') + `<path d="M${tip[0]} ${tip[1] - 3.4}l1 2.4l2.4 1l-2.4 1l-1 2.4l-1 -2.4l-2.4 -1l2.4 -1Z" fill="#fff" stroke-width="0.6"/>`;
    }
    if (g.shield && SHIELDS[g.shield] && !g.mount) {
      const e = c.era;
      const c2 = e === 0 ? Object.assign({}, c, { realm: mix(c.realm, c.wood, 0.55), metal: c.leather, accent: shade(c.wood, -0.2) }) : e === 3 ? Object.assign({}, c, { metal: c.gold, accent: c.gold }) : c;
      s += SHIELDS[g.shield](ctx, c2);
      if (e >= 2) s += `<path d="M14 72Q20 66 28 68" fill="none" stroke="#fff" stroke-width="1.2" opacity=".55"/>`;
      if (e === 3) s += C(26, 82, 7, glowGrad(ctx, c.glow), ' stroke="none" opacity=".7"');
      if (e === 0) s += `<path d="M18 76l6 5M30 88l4 -3" fill="none" stroke-width="0.9"/>`;
    }
    return flush(ctx, s);
  });
  PORTRAIT.layers.front.push(ctx => {
    const g = plan(ctx), sp = ctx.spec;
    let s = '';
    const w = +sp.wounded || 0;
    if (g.magus) s += magusFront(ctx, g);
    if (w > 0 && !g.whole) {
      const A = anat(ctx).head, q = Q(A);
      if (ctx.hideHair) s += `<g${T(A.cx + A.rx * 0.55, A.cy + A.ry * 0.35, 20)}><path d="M-4 -1.3H4V1.3H-4ZM-1.3 -4H1.3V4H-1.3Z" fill="#efe6d2" stroke-width="1"/></g>`;
      else s += P(`M${q(-1.08, -0.62)}Q${q(0, -0.95)} ${q(1.08, -0.36)}L${q(1.06, -0.12)}Q${q(0, -0.66)} ${q(-1.06, -0.36)}Z`, '#efe6d2', ' stroke-width="1.4"') + C(A.cx + A.rx * 0.35, A.cy - A.ry * 0.5, 1.6, '#a3302a', NS);
      if (w >= 0.5) { const a = anat(ctx); s += `<path d="M${n(a.sh.left + 8)} ${n(a.sh.y - 2)}L${n(a.sh.right - 10)} ${n(a.sh.y + 18)}" fill="none" stroke-width="7"/><path d="M${n(a.sh.left + 8)} ${n(a.sh.y - 2)}L${n(a.sh.right - 10)} ${n(a.sh.y + 18)}" fill="none" stroke="#efe6d2" stroke-width="4.8"/>` + C(a.sh.left + 22, a.sh.y + 8, 1.8, '#a3302a', NS); }
    }
    return flush(ctx, s, 1.6);
  });
  PORTRAIT.layers.frame.push(frameLayer);

  PORTRAIT.gear = { HEADGEAR, HERO_HELM, MAGE_HELM, MAGUS_HELM, FOCUS, SGLYPH, WEAPONS, HERO_WEAPON, MOUNTS, MONSTERS, MONSTER_UNITS, HELM, WDRAW, SHIELDS, BEAST, plan, guessMount };
})();
