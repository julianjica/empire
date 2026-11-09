// =====================================================================
//  Portrait PEOPLE layers: background, body, head, face, hair for the eight
//  peoples. Contract and anatomy anchors live in js/portraits.js.
//  Light falls from the upper left; faces are turned a touch to the right (3/4).
// =====================================================================
'use strict';
(() => {
  const INK = '#2b1d12';
  const n = v => Math.round(v * 2) / 2;                       // half-unit precision keeps svgs small
  const hx = c => { c = c.slice(1); if (c.length === 3) c = c.replace(/./g, '$&$&'); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16)); };
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const dk = (c, t = 0.3) => mix(c, '#1c1209', t), lt = (c, t = 0.3) => mix(c, '#fffaf0', t);
  const jit = (x, y, k) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return (s - Math.floor(s) - 0.5) * k; };
  // rounded path through [x, y, sharp?] control points (quadratic B-spline through edge midpoints:
  // passes just inside smooth points, exactly through sharp ones) with a hand-drawn wobble
  const path = (pts, closed = true, wob = 0.7) => {
    const p = pts.map(q => [n(q[0] + jit(q[0], q[1], wob)), n(q[1] + jit(q[1], q[0], wob)), q[2]]), N = p.length;
    const mid = (a, b) => n((a[0] + b[0]) / 2) + ' ' + n((a[1] + b[1]) / 2), xy = a => a[0] + ' ' + a[1];
    let d;
    if (closed) {
      d = 'M' + (p[0][2] ? xy(p[0]) : mid(p[N - 1], p[0]));
      for (let i = 0; i < N; i++) { const q = p[i]; if (q[2]) { if (i) d += 'L' + xy(q); } else d += 'Q' + xy(q) + ' ' + mid(q, p[(i + 1) % N]); }
      d += 'Z';
    } else {
      d = 'M' + xy(p[0]);
      for (let i = 1; i < N - 1; i++) { const q = p[i]; d += q[2] ? 'L' + xy(q) : 'Q' + xy(q) + ' ' + (i === N - 2 ? xy(p[N - 1]) : mid(q, p[i + 1])); }
      if (N === 2 || p[N - 2][2]) d += 'L' + xy(p[N - 1]);
    }
    return d.replace(/ -/g, '-').replace(/([ MLQ-])0\./g, '$1.');
  };
  const twin = (ctx, key, one) => `<g id="${ctx.id}-${key}">${one}</g><use href="#${ctx.id}-${key}" transform="matrix(-1 0 0 1 100 0)"/>`;
  // mirror a left half (top-centre … bottom-centre) into a full outline
  const sym = (half, cx = 50) => half.concat(half.slice(1, -1).reverse().map(p => [2 * cx - p[0], p[1], p[2]]));
  const mir = (pts, cx = 50) => pts.map(p => [2 * cx - p[0], p[1], p[2]]);
  const ellP = (cx, cy, rx, ry, k = 10) => Array.from({ length: k }, (_, i) => { const a = i / k * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  const P = (d, fill, x = '') => `<path d="${d}" fill="${fill}"${x}/>`;
  const L = (d, x = '') => `<path d="${d}" fill="none"${x}/>`;
  const Ln = (d, x = '') => `<path d="${d}"${x}/>`;                // inside OPENF (fill none inherited)
  const sw = w => ` stroke-width="${w}"`;
  const NS = ' stroke="none"';
  const lin = (id, a, b, vert) => `<linearGradient id="${id}"${vert ? ' x2="0"' : ''} y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const OPEN = `<g stroke="${INK}" stroke-width="2.2">`;
  const OPENF = `<g stroke="${INK}" stroke-width="2.2" fill="none">`; // head+face+hair share one group
  const GOLD = '#d6a83e';
  PORTRAIT.draw = { n, mix, dk, lt, jit, path, sym, mir, ellP, P, L, lin, INK, GOLD };

  // ---------------------------------------------------------------- derived traits
  const traits = ctx => {
    if (ctx._t) return ctx._t;
    const { race, kind, look, spec, pal } = ctx;
    const elder = look.age === 2 && race !== 'grave', young = look.age === 0, st = look.hairStyle;
    const skull = race === 'grave' && (kind === 'unit' ? look.v < 0.75 : look.v < 0.4);
    const hood = kind === 'spy' || (race === 'grave' && kind !== 'unit' && kind !== 'ruler' && look.hood);
    // beard 0 none · 1 stubble · 2 moustache · 3 short full · 4 long full · 5 goatee · 6 mutton chops · 7 handlebar + tuft · 8 delver braids
    let beard = look.beard;
    if (race === 'delver') beard = look.female ? 0 : 8;
    else if (race === 'sylvan' || race === 'veil' || race === 'wind' || race === 'tide' || skull) beard = 0;
    else if (race === 'ash') beard = [0, 0, 1, 2, 5, 0, 1, 7][beard];
    else if (race === 'grave') beard = beard > 5 ? 1 : 0;
    if (young && beard > 2 && beard !== 5 && beard !== 8) beard = beard & 1 ? 5 : 1;
    // female hair: 0 loose · 1 bun · 2 side braid · 3 bob ; style 4 adds straight bangs
    const fs = [0, 1, 2, 3, 0, 2][st];
    const hair = elder ? mix(look.hair, '#dedcd6', 0.62 + look.v * 0.3) : look.age === 1 && look.v > 0.82 ? mix(look.hair, '#d8d4ca', 0.3) : look.hair;
    const long = (look.female && race !== 'delver' && (fs === 0 || fs === 2)) || race === 'sylvan' || race === 'veil' || (race === 'tide' && st < 2) || (race === 'ash' && st === 3);
    const era = ctx.era || 0;
    let col = spec.color || pal.accent;
    if (era === 0) col = mix(col, '#8a7a5e', 0.3);
    return (ctx._t = { elder, young, skull, hood, beard, hair, long, fs, col, bob: look.female && fs === 3 && !long && race !== 'delver' && race !== 'wind' && !skull, skin: skull ? pal.bone : look.skin });
  };

  // ---------------------------------------------------------------- background
  const MOTIF = {
    wheat: () => L('M13 44Q15 27 21 12') + L('M21 13l-1 3M17 16l1.5 3M20.5 18l-1.5 3M16.5 22l1.5 3M19.5 24l-1.5 3M16 28l1.5 3', sw(2.6)),
    gears: () => `<circle cx="17" cy="23" r="7" stroke-width="3.5" stroke-dasharray="2.6 2.4"/><circle cx="17" cy="23" r="3.6"/><circle cx="27.5" cy="13" r="3.6" stroke-width="2.6" stroke-dasharray="1.8 1.8"/>`,
    leaves: () => L('M10 40Q14 24 27 12') + [[13, 31, -60], [17, 22, -20], [21, 17, -75], [24, 13, -10]].map(([x, y, a]) => `<path d="M0 0q4-4 8 0q-4 4-8 0z" transform="translate(${x} ${y}) rotate(${a})"/>`).join(''),
    embers: () => L('M12 40q-3-6 2-11q0 5 4 6q1-4-1-8q6 4 4 13') + [[20, 22, 1.2], [14, 18, 0.9], [24, 14, 0.8], [11, 25, 0.7], [18, 11, 0.6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#d9682a" stroke="none"/>`).join(''),
    waves: () => L('M8 24q4-4 8 0t8 0q3-3 1-6') + L('M9 32q4-4 8 0t8 0') + L('M8 40q4-4 8 0t8 0'),
    moon: () => P('M20 11a8 8 0 1 0 7 12a6.4 6.4 0 1 1 -7 -12z', 'none') + P('M12 35l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z', 'none', sw(1)) + '<circle cx="29" cy="31" r=".8"/>',
    candles: () => P('M12 42v-12h5v12', 'none') + P('M14.5 30q-2.5-3 0-7q2.5 4 0 7z', '#e8b04a') + P('M21 44v-8h4v8', 'none') + P('M23 36q-2-2.5 0-5q2 2.5 0 5z', '#e8b04a'),
    clouds: () => P('M9 27a4.5 4.5 0 0 1 6-5a6 6 0 0 1 11 1a4 4 0 0 1 1 7h-16a3 3 0 0 1-2-3z', 'none') + L('M14 37h12M17 41h8'),
  };
  PORTRAIT.layers.background.push(ctx => {
    const { pal, id } = ctx;
    let s = `<defs><radialGradient id="${id}-bg" cx=".42" cy=".34" r=".75"><stop offset=".1" stop-color="${lt(pal.bg[0], 0.3)}"/><stop offset="1" stop-color="${pal.bg[1]}"/></radialGradient><clipPath id="${id}-c"><rect x="5" y="5" width="90" height="90" rx="12"/></clipPath></defs><rect x="5" y="5" width="90" height="90" rx="12" fill="url(#${id}-bg)"/>`;
    if (ctx.size >= 40) s += `<g id="${id}-m" fill="none" stroke="${dk(pal.bg[1], 0.5)}" stroke-width="1.3" opacity=".5">${MOTIF[pal.motif]()}</g><use href="#${id}-m" transform="matrix(-1 0 0 1 100 0)"/>`;
    return s;
  });

  // ---------------------------------------------------------------- clothing helpers
  const torso = (A, wide = 0) => { const s = A.shoulders, k = A.neck; return sym([[k.x, k.y - 2], [k.x - k.w / 2 - 1, k.y - 3], [s.left + 11 - wide, s.y - 4], [s.left + 3 - wide, s.y + 1], [s.left - wide, s.y + 9], [s.left - 2 - wide, 101, 1], [k.x, 101]]); };
  const EMBLEM = {
    hearth: (x, y) => `<circle cx="${x}" cy="${y}" r="3"/>` + L(`M${x} ${y - 6}v2M${x} ${y + 4}v2M${x - 6} ${y}h2M${x + 4} ${y}h2`),
    delver: (x, y) => P(`M${x - 4} ${y - 4}h8v4h-8zM${x - 1} ${y}h2v6h-2z`, 'currentColor'),
    sylvan: (x, y) => P(`M${x} ${y - 6}q5 5 0 11q-5-6 0-11z`, 'currentColor') + L(`M${x} ${y - 3}v8`),
    ash: (x, y) => P(`M${x} ${y - 6}q5 5 2 10q-2 2-4 0q-3-4 0-6q0 3 2 3q1-3 0-7z`, 'currentColor'),
    tide: (x, y) => L(`M${x - 5} ${y}q2.5-3 5 0t5 0M${x - 5} ${y + 4}q2.5-3 5 0t5 0`),
    veil: (x, y) => P(`M${x + 1} ${y - 5}a5 5 0 1 0 3 8a4 4 0 1 1-3-8z`, 'currentColor'),
    grave: (x, y) => P(`M${x - 4} ${y}a4 4 0 1 1 8 0v3h-8z`, 'currentColor') + `<circle cx="${x - 1.6}" cy="${y}" r=".9" fill="${INK}"/><circle cx="${x + 1.6}" cy="${y}" r=".9" fill="${INK}"/>`,
    wind: (x, y) => P(`M${x - 4} ${y + 5}q1-9 8-11q-1 8-8 11z`, 'currentColor') + L(`M${x - 4} ${y + 5}l5-7`),
  };
  // pauldron over the left shoulder (mirrored for the right)
  const pauldron = (ctx, fill, gold) => {
    const A = ctx.anat, s = A.shoulders, r = ctx.race, x0 = s.left, y0 = s.y;
    let pts, extra = '';
    if (r === 'sylvan') pts = [[x0 - 2, y0 + 9], [x0 - 1, y0 - 2], [x0 + 8, y0 - 7], [x0 + 19, y0 - 6, 1], [x0 + 11, y0 + 4]];
    else if (r === 'veil') pts = [[x0 - 1, y0 + 9], [x0, y0 - 1], [x0 + 4, y0 - 12, 1], [x0 + 9, y0 - 5], [x0 + 16, y0 - 2], [x0 + 12, y0 + 6]];
    else if (r === 'ash' || r === 'grave') pts = [[x0 - 3, y0 + 10], [x0 - 1, y0 - 1], [x0 + 1, y0 - 11, 1], [x0 + 6, y0 - 4], [x0 + 16, y0 - 3], [x0 + 13, y0 + 7]];
    else if (r === 'tide') pts = [[x0 - 2, y0 + 10], [x0 - 2, y0 - 2], [x0 + 6, y0 - 8], [x0 + 15, y0 - 4], [x0 + 15, y0 + 4], [x0 + 6, y0 + 8, 1]];
    else if (r === 'wind') pts = [[x0 - 1, y0 + 12, 1], [x0 - 1, y0 - 1], [x0 + 8, y0 - 6], [x0 + 17, y0 - 3], [x0 + 10, y0 + 4, 1], [x0 + 6, y0 + 10, 1]];
    else { const b = r === 'delver' ? 2 : 0; pts = [[x0 - 2 - b, y0 + 10], [x0 - 1 - b, y0 - 2], [x0 + 7, y0 - 7 - b], [x0 + 16 + b, y0 - 3], [x0 + 13 + b, y0 + 7]]; }
    if (r === 'tide') extra = L(`M${x0 + 6} ${y0 + 7}l-4-8M${x0 + 6} ${y0 + 7}l3-12M${x0 + 6} ${y0 + 7}l8-8`, sw(1.2));
    else if (r === 'wind') extra = L(`M${x0 + 2} ${y0 + 6}q4-6 12-6M${x0 + 3} ${y0 + 1}q5-5 11-4`, sw(1.2));
    else if (r === 'sylvan') extra = L(`M${x0} ${y0 + 6}q6-7 17-11`, sw(1.2));
    else if (r !== 'veil') extra = L(`M${x0 - 1} ${y0 + 5}q6-8 15-7`, sw(1.4) + (gold ? ` stroke="${GOLD}"` : '')) + (r === 'delver' ? `<circle cx="${x0 + 4}" cy="${y0 + 2}" r="1" fill="${INK}"/>` : '');
    if (gold && (r === 'veil' || r === 'sylvan' || r === 'wind' || r === 'tide')) extra += L(path(pts.slice(1, 4), false, 0), sw(1.2) + ` stroke="${GOLD}"`);
    return twin(ctx, 'pa', P(path(pts), fill) + extra);
  };
  const metalFill = (ctx, dark) => {
    const r = ctx.race;
    if (r === 'sylvan') return '#8a6a3c';
    if (r === 'tide') return '#e3c7a4';
    if (r === 'wind') return dark ? '#6b4a30' : ctx.look.hair;
    if (r === 'grave') return '#6b6560';
    if (r === 'ash') return '#5e5853';
    return ctx.pal.metal;
  };
  const chain = (cx, y0, y1, w) => L(`M${cx - w} ${y0}Q${cx} ${y1 + 10} ${cx + w} ${y0}`, sw(3.6)) + L(`M${cx - w} ${y0}Q${cx} ${y1 + 10} ${cx + w} ${y0}`, sw(2.2) + ` stroke="${GOLD}" stroke-dasharray="2.2 1.3"`) + `<circle cx="${cx}" cy="${y1 + 5}" r="4" fill="${GOLD}"/><circle cx="${cx}" cy="${y1 + 5}" r="1.5" fill="#b0402a" stroke="none"/>`;

  const clothing = (ctx, T) => {
    const { id, anat: A, kind, role, race, spec, look } = ctx, s = A.shoulders, k = A.neck, col = T.col;
    const cx = 50, cy0 = s.y + 10;
    let back = '', base, over = '';
    const armour = (gold, cloak) => {
      if (cloak) back += P(path(torso(A, 5)), dk(col, 0.25));
      base = [metalFill(ctx), dk(metalFill(ctx), 0.4)];
      const tab = race === 'grave' ? sym([[cx, k.y + 2], [cx - 9, k.y + 1], [cx - 12, 92], [cx - 9, 97, 1], [cx - 6, 92], [cx - 3, 98, 1], [cx, 94]]) : sym([[cx, k.y + 2], [cx - 9, k.y + 1], [cx - 12, 101, 1], [cx, 101]]);
      over += P(path(tab, true, 0.4), `url(#${id}-t)`) + `<g color="${lt(col, gold ? 0.2 : 0.55)}" fill="currentColor"${gold ? ` stroke="${dk(GOLD, 0.4)}"` : ''}${sw(1.2)}>${EMBLEM[race](cx, cy0 + 4)}</g>`;
      if (gold) over += L(path(tab.slice(1, 3), false, 0) + path(tab.slice(-2), false, 0), sw(1.2) + ` stroke="${GOLD}"`);
      over += P(path(sym([[cx, k.y + 4], [cx - k.w / 2 - 3, k.y - 1], [cx - k.w / 2 - 1, k.y - 5], [cx, k.y - 1]]), true, 0.3), metalFill(ctx, 1));
      over += pauldron(ctx, `url(#${id}-p)`, gold);
      if (race === 'ash') over += P(path(sym([[cx, k.y + 6], [cx - 7, k.y + 7, 1], [cx - 9, k.y + 4], [cx - 13, k.y + 5, 1], [cx - 14, k.y + 1], [cx - 19, k.y, 1], [cx - 16, k.y - 3], [cx - k.w / 2 - 1, k.y - 5], [cx, k.y - 2]]), true, 0.6), '#7a6450');
    };
    const robe = (c, collar, trim) => {
      base = [c, dk(c, 0.45)];
      if (collar) over += P(path([[cx - k.w / 2 + 1, k.y + 1], [cx - k.w / 2 - 7, A.chin - 6, 1], [cx - k.w / 2 - 9, k.y + 5], [cx - 5, k.y + 9]]), dk(c, 0.15)) + P(path(mir([[cx - k.w / 2 + 1, k.y + 1], [cx - k.w / 2 - 7, A.chin - 6, 1], [cx - k.w / 2 - 9, k.y + 5], [cx - 5, k.y + 9]])), dk(c, 0.15));
      over += L(`M${cx} ${k.y + 3}V101`, trim ? sw(2.4) + ` stroke="${trim}"` : sw(1.4));
    };
    if (kind === 'unit') {
      if (role === 'mage') { robe(dk(col, 0.3), true, GOLD); over += `<circle cx="${cx}" cy="${k.y + 6}" r="2.6" fill="#6fd3e8"/>`; }
      else if (role === 'ranged' || role === 'flyer' || role === 'support') {
        base = race === 'wind' ? ['#7a5638', '#4a3020'] : ['#8c5d38', '#55361e'];
        over += L(`M${s.left + 9} ${s.y - 3}L66 101`, sw(5.5)) + L(`M${s.left + 9} ${s.y - 3}L66 101`, sw(3) + ` stroke="#b8894f"`);
        if (role === 'flyer' || race === 'wind') over += pauldron({ ...ctx, race: 'wind' }, `url(#${id}-p)`, 0);
        else over += P(path(sym([[cx, k.y - 3], [cx - k.w / 2 - 4, k.y - 5], [s.left + 6, s.y], [s.left + 5, s.y + 8], [cx - 7, s.y + 13], [cx, s.y + 11]]), true, 0.5), `url(#${id}-t)`);
      } else armour(0, role === 'cavalry');
    } else if (kind === 'hero') armour(1, 1);
    else if (kind === 'advisor') {
      if (role === 'marshal') { armour(0, 1); over += L(`M${s.left + 10} ${s.y - 3}L70 101`, sw(7) + ` stroke="${INK}"`) + L(`M${s.left + 10} ${s.y - 3}L70 101`, sw(4.6) + ` stroke="${col}"`) + `<circle cx="38" cy="${cy0 + 7}" r="2.2" fill="${GOLD}"/><circle cx="44" cy="${cy0 + 9}" r="2.2" fill="#b0402a"/>`; }
      else if (role === 'steward') { robe('#8a6436', 0, GOLD); over += P(path(sym([[cx, k.y + 12], [cx - k.w / 2 - 1, k.y - 3], [cx - k.w / 2 - 6, k.y + 1], [cx - 3, k.y + 15], [cx, k.y + 16]]), true, 0.4), col) + `<circle cx="${cx - 11}" cy="${cy0 + 9}" r="2.6" fill="none" stroke="${GOLD}" stroke-width="1.6"/>` + L(`M${cx - 10} ${cy0 + 11}l2 6m-4-6l-1 5`, sw(1.4) + ` stroke="${GOLD}"`); }
      else if (role === 'spymaster') { robe('#2f2a2c', 1, 0); over += P(path([[cx - 4, cy0 + 4], [cx, cy0 + 1], [cx + 4, cy0 + 4], [cx, cy0 + 7]], true, 0), GOLD, sw(1.2)) + `<circle cx="${cx}" cy="${cy0 + 4}" r="1.2" fill="${INK}"/>` + L(`M${cx - k.w / 2 - 6} ${k.y + 4}q-6 10-4 30`, sw(1.3) + ` stroke="${col}"`); }
      else if (role === 'priest') { robe('#e8dec6', 0, 0); over += P(path(sym([[cx, k.y + 6], [cx - k.w / 2, k.y - 3], [cx - 9, 101, 1], [cx - 4, 101, 1], [cx - 3, k.y + 9], [cx, k.y + 8]]), true, 0.3), col) + `<circle cx="${cx - 6}" cy="${cy0 + 12}" r="2" fill="${GOLD}"/><circle cx="${cx + 6}" cy="${cy0 + 12}" r="2" fill="${GOLD}"/>`; }
      else { const c = mix('#2e2a5e', col, 0.3); robe(c, 1, GOLD); over += [[36, cy0 + 4], [62, cy0 + 9], [40, cy0 + 16], [60, cy0 + 19]].map(([x, y]) => `<path d="M${x} ${y - 2}l.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7 1.3-.7z" fill="${GOLD}" stroke="none"/>`).join('') + `<circle cx="${cx}" cy="${k.y + 6}" r="2.6" fill="#9b6fe0"/>`; }
    } else if (kind === 'governor') { robe(dk(col, 0.1), 0, 0); over += P(path(sym([[cx, k.y + 2], [cx - k.w / 2 - 1, k.y - 4], [s.left + 8, s.y - 2], [s.left + 4, s.y + 4], [cx - 9, s.y + 6], [cx, k.y + 6]]), true, 0.9), '#8a6a4a') + chain(cx, s.y - 1, s.y + 4, 15); }
    else if (kind === 'ruler') {
      back += P(path(torso(A, 5)), dk(col, 0.3)); robe(col, 0, GOLD);
      over += P(path(sym([[cx, k.y + 3], [cx - k.w / 2 - 2, k.y - 5], [s.left + 6, s.y - 3], [s.left + 1, s.y + 6], [cx - 12, s.y + 9], [cx - 4, s.y + 7], [cx, k.y + 8]]), true, 0.8), '#f3eee2');
      over += [[s.left + 7, s.y + 2], [cx - 13, s.y + 4], [cx - 6, k.y + 4], [100 - s.left - 7, s.y + 2], [cx + 13, s.y + 4], [cx + 6, k.y + 4]].map(([x, y]) => P(`M${x} ${y - 1.5}l1 3h-2z`, INK, NS)).join('') + chain(cx, s.y + 6, s.y + 8, 11);
    } else if (kind === 'spy') { const c = mix('#24201f', col, 0.18); base = [c, dk(c, 0.5)]; over += L(`M${cx - 2} ${s.y}q-1 14 1 26`, sw(1.3)); }
    else { // citizen
      base = [look.cloth, dk(look.cloth, 0.4)];
      over += P(path(sym([[cx, k.y + 9], [cx - k.w / 2 - 1, k.y - 3], [cx - k.w / 2 + 2, k.y - 3], [cx, k.y + 4]]), true, 0.3), ctx.skin) + L(`M${cx - 3} ${k.y + 3}l6 2m-6 1l6 2`, sw(1.1));
      if (race === 'hearth' && look.v > 0.5) over += P(path(sym([[cx, s.y + 4], [cx - 11, s.y + 3], [cx - 13, 101, 1], [cx, 101]]), true, 0.4), '#e8dfc8');
    }
    return { back, base, over };
  };

  // ---------------------------------------------------------------- hair shapes
  // dots (freckles, stars, beads) as zero-length round-capped strokes: ~8 bytes each
  const dots = (pts, c, w = 1.1, x = '') => pts.length ? `<path d="${pts.map(q => `M${n(q[0])} ${n(q[1])}h0`).join('')}" stroke="${c}"${sw(w)}${x}/>` : '';
  const hairBack = (ctx, T) => {
    const A = ctx.anat, H = A.head, s = A.shoulders, k = A.neck, cx = H.cx, rx = H.rx, r = ctx.race;
    const len = r === 'sylvan' || r === 'veil' ? 14 : r === 'tide' ? 11 : 8, w = (r === 'tide' || r === 'ash' || r === 'sylvan' || r === 'veil' ? 6 : 4) + (ctx.look.hairStyle === 5 ? 2 : 0);
    const half = T.bob ? [[cx, A.crown - 3], [cx - rx - 3, A.crown + 4], [cx - rx - w - 1, H.cy + 4], [cx - rx - w, A.chin + 3, 1], [cx - rx + 4, A.chin + 4, 1], [cx, A.chin - 4]]
      : [[cx, A.crown - 3], [cx - rx - 2, A.crown + 4], [cx - rx - w, H.cy + 4], [cx - rx - w - 1, s.y + len - 4], [cx - rx - 1, s.y + len, 1], [cx - k.w / 2 - 1, A.chin + 4], [cx, A.chin - 4]];
    if (r === 'tide' && !T.bob) half.splice(4, 0, [cx - rx - w + 2, s.y + len - 10, 1], [cx - rx - w - 2, s.y + len - 3, 1]);
    return P(path(sym(half, cx), true, 1), `url(#${ctx.id}-h)`);
  };
  const bun = ctx => { const A = ctx.anat, x = A.head.cx + 2, y = A.crown - 2; return P(path(ellP(x, y, 6, 5, 8), true, 0.4), `url(#${ctx.id}-h)`) + L(`M${x - 3} ${y - 1}q3-3 6 0`, sw(1.1)); };
  const hairFront = (ctx, T) => {
    const A = ctx.anat, H = A.head, cx = H.cx, cy = H.cy, rx = H.rx, cr = A.crown, br = A.brow, r = ctx.race, st = ctx.look.hairStyle, f = ctx.look.female;
    const fill = `url(#${ctx.id}-h)`, dh = dk(T.hair, 0.4);
    if ((r === 'grave' && T.skull) || r === 'wind') return '';
    const shade = d => `<path d="${path(d)}" fill="${dh}" opacity=".33" stroke="none"/>`;
    if (r === 'ash' && !f && st !== 3) {
      const shaved = shade([[cx - rx + 2, cy - 4], [cx - rx + 5, cr + 3], [cx + rx - 5, cr + 3], [cx + rx - 2, cy - 4], [cx, cr + 6]]);
      if (st === 0) return P(path([[cx - 4, br - 6], [cx - 5, cr + 1], [cx - 6, cr - 6, 1], [cx - 2, cr - 3], [cx - 1, cr - 10, 1], [cx + 2, cr - 4], [cx + 5, cr - 8, 1], [cx + 5, cr - 1], [cx + 4, br - 6]], true, 0.5), fill);
      if (st === 1 || st === 5) return (st === 5 ? shaved : '') + P(path(ellP(cx + 1, cr - 2, 5, 4, 7)), fill) + P(path([[cx + 4, cr - 4], [cx + 13, cr - 9, 1], [cx + 7, cr]], true, 0.5), fill);
      if (st === 2) return shaved;
      return shaved + P(path([[cx - 2.5, br - 5], [cx - 3.5, cr + 2], [cx - 1, cr - 7, 1], [cx + 1, cr - 3], [cx + 3, cr - 8, 1], [cx + 3.5, cr + 2], [cx + 2.5, br - 5]], true, 0.4), fill); // ridge
    }
    const bald = !f && r !== 'veil' && r !== 'sylvan' && (r === 'delver' ? st < 2 || (T.elder && st === 5) : st === 4 || (T.elder && st & 1));
    if (bald) { // receding / bald crown (old) or a close buzz (st 4): hair at the sides, swept back
      const side = [[cx - rx - 1.5, cy + 3], [cx - rx - 2, cy - 7], [cx - rx + 4, cr + 5], [cx - rx + 3, cy - 3, 1]];
      return P(path(side), fill) + P(path(mir(side)), fill) + (st === 4 && !T.elder ? shade([[cx - rx + 3, cy - 6], [cx - 6, cr + 1.5], [cx + 6, cr + 1.5], [cx + rx - 3, cy - 6], [cx, cr + 5]]) : '');
    }
    const puff = st === 3 ? 3 : st === 2 ? -1 : 1, sd = f ? (T.fs === 1 ? 3 : 10) : r === 'delver' ? 2 : -1, ext = (r === 'hearth' ? 2.5 : 1.5) + (st === 5 ? 1.5 : 0);
    let pts = [[cx - rx - ext + 1, cy + sd], [cx - rx - ext, cy - 7], [cx - rx * 0.6, cr - 1 - puff], [cx + 2, cr - 2.5 - puff], [cx + rx * 0.7, cr - 0.5 - puff], [cx + rx + ext, cy - 7], [cx + rx + ext - 1, cy + sd]];
    if (st === 3) { pts.splice(2, 0, [cx - rx - 1, cr + 3]); pts.splice(5, 0, [cx + rx + 1, cr + 3]); }
    if (st === 5) { // curls: a scalloped outline
      const arc = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * (1.04 + i * 0.077), q = i & 1 ? 1.12 : 0.98; arc.push([cx + Math.cos(a) * (rx + ext) * q, cy - 4 + Math.sin(a) * (cy - cr + 3) * q]); }
      pts = [pts[0], ...arc, pts[6]];
    }
    let hl; const pt = cx + ((st % 3) - 1) * 4; // parting
    if (f && st === 4) hl = [[cx + rx - 1, cy - 2], [cx + rx - 2.5, br - 2.5, 1], [cx - rx + 2.5, br - 2.5, 1], [cx - rx + 1, cy - 2]]; // straight bangs
    else if (f || r === 'sylvan' || r === 'veil' || r === 'tide') hl = [[cx + rx - 1, cy], [cx + rx - 4, br - 5], [pt + 2, br - 8], [pt, br - 7, 1], [pt - 2, br - 8], [cx - rx + 4, br - 5], [cx - rx + 1, cy]];
    else if (st === 0 || st === 3 || st === 5) { hl = [[cx + rx - 1, cy - 3]]; for (let i = 0; i <= 6; i++) { const x = cx + rx - 3 - i * (2 * rx - 6) / 6; hl.push([x, br - (i % 2 ? 6 : 2.5), st !== 5]); } hl.push([cx - rx + 1, cy - 3]); }
    else if (st === 1) hl = [[cx + rx - 1, cy - 3], [cx + rx - 3, br - 3, 1], [cx + 2, br - 6], [cx - 6, br - 8], [cx - rx + 1, br - 4, 1], [cx - rx + 1, cy - 3]];
    else hl = [[cx + rx - 1, cy - 4], [cx + rx - 4, br - 6], [cx, br - 8], [cx - rx + 4, br - 6], [cx - rx + 1, cy - 4]];
    return P(path(pts.concat(hl), true, 0.8), fill) + Ln(`M${cx - 3} ${cr + 1}q-6 2-8 9M${cx + 5} ${cr + 1}q5 3 6 8`, sw(1.1) + ` stroke="${dh}"`);
  };
  const earShape = ctx => {
    const A = ctx.anat, H = A.head, r = ctx.race, lk = ctx.look, cx = H.cx, cy = H.cy, rx = H.rx, e = A.ears && A.ears[0];
    if (!e) return '';
    let pts, inner = '', fill = `url(#${ctx.id}-s)`;
    if (r === 'sylvan' || r === 'veil' || r === 'ash') { // ear length: Sylvani vary most
      const b = [cx - rx + 1.5, cy - 4], k = r === 'sylvan' ? 0.7 + lk.t2 * 0.65 : 0.85 + lk.t2 * 0.3, tx = b[0] + (e.x - b[0]) * k, ty = b[1] + (e.y - b[1]) * k;
      pts = [b, [tx, ty, 1], [cx - rx - 3, cy + 2], [cx - rx + 1, cy + 5]];
      inner = Ln(path([[cx - rx, cy + 2], [(tx + cx - rx) / 2 + 1, (ty + cy) / 2]], false, 0), sw(1.1));
    } else if (r === 'tide') { // fin shapes: webbed spines · round fan · long swept
      fill = lt(mix(ctx.pal.fin, lk.col2, 0.5), 0.25);
      const sh = lk.trait % 3;
      pts = sh === 1 ? [[cx - rx + 1.5, cy - 6], [24, 31], [21, 39], [24, 47], [cx - rx + 1, cy + 5]]
        : sh === 2 ? [[cx - rx + 1.5, cy - 6], [21, 25, 1], [27, 36], [24, 45, 1], [cx - rx + 1, cy + 5]]
        : [[cx - rx + 1.5, cy - 6], [26, 32, 1], [29.5, 37.5], [24, 41, 1], [29, 44], [27, 49, 1], [cx - rx + 1, cy + 5]];
      inner = Ln(sh === 2 ? `M${cx - rx} ${cy}L22.5 27M${cx - rx} ${cy + 1}L25 43` : `M${cx - rx} ${cy}L26.5 33M${cx - rx} ${cy}L25 40.5M${cx - rx} ${cy + 1}L27.5 48`, sw(1));
    } else {
      const b = r === 'delver' ? 1 : 0;
      pts = [[cx - rx + 1, cy - 4], [cx - rx - 3.5 - b, cy - 4], [cx - rx - 4 - b, cy + 2], [cx - rx - 1, cy + 6]];
      inner = Ln(`M${cx - rx - 1} ${cy - 1}q-1.5 1.5 0 3`, sw(1.1));
    }
    let one = P(path(pts, true, 0.4), fill) + inner;
    if (lk.jewel === 1 && r !== 'tide') one += `<circle cx="${n(cx - rx - 1)}" cy="${n(cy + 7.5)}" r="1.8" fill="none" stroke="${GOLD}"${sw(1.3)}/>`;
    return twin(ctx, 'e', one);
  };
  // Ashborn horns: shape (swept up · ram curl · spike · swept back · nubs), size, colour, one broken. Under a helmet
  // (or on troops) only the classic shape, tips within the contract envelope (±2 x, +0..5 y).
  const horns = ctx => {
    const A = ctx.anat, H = A.head, cx = H.cx, t = A.horns[0], lk = ctx.look, c = [ctx.pal.horn, '#cbb48a', '#5a4a42', '#8f6c4c'][Math.floor(lk.v * 4)];
    const bx = cx - H.rx + 3, by = A.crown + 7, free = !ctx.hideHair && ctx.kind !== 'unit', hat = ctx.gear && ctx.gear.helm && ctx.gear.helm.length,
      sh = !free ? 0 : hat && (lk.trait === 2 || lk.trait === 3) ? lk.trait - 2 : lk.trait, z = free && !hat ? 0.85 + lk.t2 * 0.3 : 1; // tall spikes / swept-back only bare-headed
    const HS = [
      [[bx + 6, by - 3], [bx - 2, by - 9], [t.x + (lk.t2 - 0.5) * 4, t.y + (lk.trait % 3) * 2.5, 1], [bx - 8, by - 4], [bx - 5, by + 3], [bx + 3, by + 3]],
      [[bx + 5, by - 3], [bx - 4, by - 8], [bx - 12, by - 4], [bx - 13, by + 4], [bx - 9, by + 9, 1], [bx - 8.5, by + 3], [bx - 5, by - 1], [bx + 2, by + 3]],
      [[bx + 5, by - 2], [bx + 1, by - 10], [bx - 1, by - 19, 1], [bx - 3, by - 8], [bx - 3, by + 3], [bx + 3, by + 3]],
      [[bx + 6, by - 3], [bx - 4, by - 8], [bx - 19, by - 11, 1], [bx - 9, by - 2], [bx - 4, by + 3], [bx + 3, by + 3]],
      [[bx + 4, by - 2], [bx - 1, by - 5], [bx - 3, by - 9, 1], [bx - 4, by - 2], [bx - 2, by + 3], [bx + 3, by + 3]],
    ];
    const RG = [`M${bx - 4} ${by - 6}l4 5M${bx - 7} ${by - 10}l5 4`, `M${bx - 5} ${by - 6}l2 5M${bx - 11} ${by - 3}l3 2`, `M${bx - 2} ${by - 6}l4 2M${bx - 1} ${by - 12}l2.5 1`, `M${bx - 5} ${by - 6}l3 5M${bx - 11} ${by - 8}l3 5`, `M${bx - 3} ${by - 4}l3 3`];
    const pts = HS[sh].map(q => [bx + (q[0] - bx) * z, by + (q[1] - by) * z, q[2]]);
    const one = q => P(path(q, true, 0.3), `url(#${ctx.id}-k)`) + Ln(RG[sh], sw(1.1));
    let s = `<defs>${lin(ctx.id + '-k', lt(c, 0.3), dk(c, 0.45), 1)}</defs>`;
    if (!lk.broken) return s + twin(ctx, 'hn', one(pts));
    let i = 0, far = 0; pts.forEach((q, j) => { const d = (q[0] - bx) ** 2 + (q[1] - by) ** 2; if (d > far) { far = d; i = j; } });
    const q = pts[i], dx = (q[0] - bx) / Math.sqrt(far), dy = (q[1] - by) / Math.sqrt(far), m = [bx + (q[0] - bx) * 0.5, by + (q[1] - by) * 0.5];
    const brk = pts.slice(0, i).concat([[m[0] - dy * 2.4, m[1] + dx * 2.4, 1], [m[0] - dx * 1.2, m[1] - dy * 1.2, 1], [m[0] + dx * 0.6 + dy * 2.4, m[1] + dy * 0.6 - dx * 2.4, 1]], pts.slice(i + 1));
    const a = one(lk.broken === 1 ? brk : pts), b = one(lk.broken === 1 ? pts : brk);
    return s + a + `<g transform="matrix(-1 0 0 1 100 0)">${b}</g>`;
  };
  // Veilborn antennae: feathered moth · clubbed glow · curled · thorn crown · short beaded feelers
  const antennae = ctx => {
    const A = ctx.anat, cx = A.head.cx, y0 = A.crown + 3, lk = ctx.look, ty = lk.trait, g = lk.col2, c = '#4d3a5e';
    if (ty === 3) {
      let d = `M${cx - 13} ${y0 + 3}`; for (let i = 0; i < 7; i++) { const x = cx - 13 + i * 26 / 6; d += `L${n(x)} ${n(y0 + (i % 2 ? -4 : -9 - lk.t2 * 3))}L${n(x + 2)} ${y0 + 2}`; }
      return P(d + 'Z', '#3a2a3e', sw(1.3)) + P(path([[cx - 14, y0 + 4], [cx, y0 - 1], [cx + 14, y0 + 4], [cx, y0 + 1]], true, 0), '#3a2a3e', sw(1.2)) + `<circle cx="${cx}" cy="${y0 - 1}" r="1.8" fill="${g}"${sw(1)}/>`;
    }
    const t = A.antennae[0], tx = ty === 4 ? cx - 11 : n(t.x + (lk.t2 - 0.5) * 6), tyy = ty === 4 ? A.crown - 6 : n(t.y + lk.t2 * 3);
    const P0 = [cx - 3, y0], C = ty === 4 ? [cx - 5, y0 - 7] : [cx - 7, tyy + 4], B = u => [(1 - u) * (1 - u) * P0[0] + 2 * u * (1 - u) * C[0] + u * u * tx, (1 - u) * (1 - u) * P0[1] + 2 * u * (1 - u) * C[1] + u * u * tyy];
    let one = Ln(`M${P0[0]} ${P0[1]}Q${C[0]} ${C[1]} ${tx} ${tyy}` + (ty === 2 ? `q-4.5-1.5-4 2.5q.5 3 3.5 1.6` : ''), sw(1.3));
    if (ty === 0) { const b = B(0.35), m = B(0.7); one += P(path([[tx, tyy, 1], [m[0] - 3.2, m[1] - 1.2], [b[0], b[1], 1], [m[0] + 2.4, m[1] + 2.4]], true, 0), c, sw(1.1)) + Ln(`M${n(m[0] - 2.6)} ${n(m[1] - 0.6)}l2.6 .6l1.8 2`, sw(0.8) + ` stroke="${lt(ctx.look.hair, 0.3)}"`); }
    else if (ty !== 2) one += `<circle cx="${tx}" cy="${tyy}" r="${ty === 1 ? 2.4 : 1.5}" fill="${g}"${sw(1.1)}/>`;
    return twin(ctx, 'an', one);
  };
  // Windkin crest: swept back · upright fan · short tuft; feathers in the body colour or a contrasting crest colour
  const crest = ctx => {
    const A = ctx.anat, cx = A.head.cx, cr = A.crown, c = A.crest, lk = ctx.look, h = lk.trait & 1 ? lk.col2 : traits(ctx).hair, sh = lk.trait % 3;
    const fth = (x0, y0, x1, y1, w) => P(path([[x0, y0, 1], [(x0 + x1) / 2 - w, (y0 + y1) / 2 - w], [x1, y1, 1], [(x0 + x1) / 2 + w, (y0 + y1) / 2 + w]], true, 0.2), h) + Ln(`M${x0} ${y0}L${n((x0 * 0.3 + x1 * 0.7))} ${n(y0 * 0.3 + y1 * 0.7)}`, sw(1) + ` stroke="${dk(h, 0.5)}"`);
    if (sh === 1) return fth(cx - 6, cr + 4, cx - 13, cr - 11, 2.2) + fth(cx + 6, cr + 4, cx + 13, cr - 11, 2.2) + fth(cx - 2, cr + 3, cx - 4, cr - 15, 2.5) + fth(cx + 2, cr + 3, cx + 5, cr - 15, 2.5);
    if (sh === 2) return fth(cx + 1, cr + 3, cx + 7, cr - 8, 2.6) + fth(cx - 3, cr + 4, cx - 1, cr - 9, 2.4);
    return fth(cx + 4, cr + 3, c[1].x + 4, c[1].y + 4, 2.4) + fth(cx + 1, cr + 3, c[1].x, c[1].y, 2.6) + fth(cx - 2, cr + 4, c[0].x, c[0].y, 2.8) + fth(cx - 5, cr + 5, c[0].x - 9, c[0].y - 2, 2.6);
  };
  const beard = (ctx, T) => {
    const A = ctx.anat, H = A.head, cx = H.cx, cy = H.cy, rx = H.rx, ch = A.chin, b = T.beard, lk = ctx.look, fill = `url(#${ctx.id}-h)`, dh = dk(T.hair, 0.4), my = ch - 7;
    if (!b) return '';
    if (b === 1) return `<path d="${path(sym([[cx, my - 1], [cx - rx + 2, cy + 4], [cx - rx + 4, ch - 6], [cx - 5, ch], [cx, ch + 0.5]]))}" fill="${dh}" opacity=".3" stroke="none"/>`;
    const mous = P(path([[cx + 0.5, my - 2.5], [cx - 5, my - 2.5], [cx - 9, my + 3, 1], [cx - 4, my], [cx + 0.5, my + 0.5], [cx + 5, my], [cx + 10, my + 3, 1], [cx + 6, my - 2.5]], true, 0.3), fill, sw(1.6));
    if (b === 2) return mous;
    if (b === 5) return P(path([[cx, my + 2], [cx - 3.5, my + 2.5], [cx - 3, ch + 1], [cx, ch + 4.5, 1], [cx + 3, ch + 1], [cx + 3.5, my + 2.5]], true, 0.4), fill) + mous;
    if (b === 6) { const one = [[cx - rx + 0.5, cy - 2], [cx - rx - 1, cy + 7], [cx - rx + 4, ch - 2, 1], [cx - 6, my + 1], [cx - rx + 4, cy + 2]]; return P(path(one), fill) + P(path(mir(one)), fill) + mous; }
    if (b === 7) return P(path([[cx + 0.5, my - 2.5], [cx - 5, my - 2.5], [cx - 9, my], [cx - 10.5, my - 4, 1], [cx - 8.5, my + 1.5], [cx - 4, my], [cx + 0.5, my + 0.5], [cx + 5, my], [cx + 9.5, my + 1.5], [cx + 11.5, my - 4, 1], [cx + 10, my], [cx + 6, my - 2.5]], true, 0.3), fill, sw(1.5)) + P(path([[cx - 1.5, my + 3], [cx, ch + 2.5, 1], [cx + 1.5, my + 3]], true, 0.2), fill, sw(1.2));
    if (b === 8) { // Deepdelver: vast beard, braids and rings — twin braids · one great braid · forked · fan of three · short with beads
      const sty = lk.trait, oc = lk.col2, bot = 87 + lk.t2 * 7;
      const braid = (x, y1) => { let d = ''; for (let y = 79; y < y1 - 1; y += 4) d += `M${x - 3} ${y}q3 3 6 0`; return Ln(d, sw(1.3)) + `<rect x="${x - 3}" y="${n(y1)}" width="6" height="3" rx="1" fill="${oc}"${sw(1.3)}/>`; };
      const top = [[cx, my], [cx - rx + 1, cy - 3], [cx - rx - 3.5, cy + 6], [cx - rx - 2, ch + 6]];
      const shape = sty === 2 ? top.concat([[cx - 13, bot - 6], [cx - 7, bot + 3, 1], [cx - 2, bot - 7], [cx, bot - 8, 1]])
        : sty === 3 ? top.concat([[cx - 19, ch + 18], [cx - 10, bot - 2], [cx, bot]])
        : sty === 4 ? top.concat([[cx - 15, ch + 11], [cx - 9, ch + 14, 1], [cx, ch + 14]])
        : top.concat([[cx - 14, bot - 7], [cx - 6, bot + 2], [cx, bot]]);
      let s = P(path(sym(shape), true, 1), fill) + Ln(`M${cx - 9} ${ch}q-2 8 1 16M${cx + 9} ${ch}q2 8-1 16M${cx} ${ch + 2}v10`, sw(1.1) + ` stroke="${dh}"`);
      if (sty === 0) s += braid(cx - 6, bot - 3) + braid(cx + 6, bot - 3);
      else if (sty === 1) s += braid(cx, bot);
      else if (sty === 2) s += `<circle cx="${cx - 7}" cy="${n(bot - 2)}" r="2.2" fill="none" stroke="${oc}"${sw(1.6)}/><circle cx="${cx + 7}" cy="${n(bot - 2)}" r="2.2" fill="none" stroke="${oc}"${sw(1.6)}/>`;
      else if (sty === 3) s += braid(cx - 10, bot - 8) + braid(cx, bot - 3) + braid(cx + 10, bot - 8);
      else s += dots([[cx - 7, ch + 10], [cx, ch + 12], [cx + 7, ch + 10]], oc, 3.4);
      return s + mous;
    }
    const low = b === 4 ? 9 + lk.t2 * 4 : 4;
    return P(path(sym([[cx, my], [cx - 6, my - 0.5], [cx - rx + 1.5, cy + 3, 1], [cx - rx, cy + 8], [cx - rx * 0.7, ch + low * 0.5], [cx - 4, ch + low], [cx, ch + low + 1]]), true, 0.8), fill) + `<path d="M${cx - 4} ${my + 2.5}q4 2 8 0" fill="${dk(ctx.skin, 0.5)}" stroke-width="1.4"/>` + mous;
  };
  const hood = (ctx, T) => {
    const A = ctx.anat, H = A.head, s = A.shoulders, cx = H.cx, cy = H.cy, rx = H.rx, grave = ctx.race === 'grave';
    const c = ctx.kind === 'spy' ? mix('#24201f', T.col, 0.18) : '#3a3832';
    const half = [[cx, A.crown - 8], [cx - rx - 5, A.crown - 1], [cx - rx - 8, cy + 3], [cx - rx - 8, A.chin + 2], [s.left + 4, s.y + 4]];
    if (grave) half.push([s.left + 10, s.y + 12, 1], [s.left + 13, s.y + 7], [cx - 9, s.y + 15, 1], [cx - 6, s.y + 9], [cx, s.y + 13, 1]);
    else half.push([cx - 10, s.y + 9], [cx, s.y + 12, 1]);
    const inner = ellP(cx + 0.5, cy + 2, rx + 0.5, H.ry + 0.5, 10);
    return `<defs>${lin(ctx.id + '-o', lt(c, 0.25), dk(c, 0.4))}</defs>` + `<path d="${path(inner, true, 0)}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="5"/>` + `<path d="${path(sym(half, cx), true, 0.9)}${path(inner, true, 0.4)}" fill="url(#${ctx.id}-o)" fill-rule="evenodd"/>`;
  };

  // technology era on cloth: 0 rough homespun (patch + coarse stitching), 2 embroidered trim, 3 jewels too
  const eraTrim = (ctx, T) => {
    const e = ctx.era, A = ctx.anat, k = A.neck, s = A.shoulders, noble = ctx.kind !== 'unit' && ctx.kind !== 'citizen' && ctx.kind !== 'spy';
    if (e === 0) {
      if (noble) return '';
      const x = s.left + 12, y = s.y + 12;
      return `<rect x="${x}" y="${y}" width="7" height="6" rx="1" fill="${dk(ctx.look.cloth, 0.15)}" stroke-width="1.1"/>` + L(`M${x + 1} ${y - 1}v8M${x + 6} ${y - 1}v8`, sw(0.8) + ' stroke-dasharray="1 1"');
    }
    if (e === 1) return '';
    const c = noble || e === 3 ? GOLD : lt(T.col, 0.55);
    let o = L(`M${50 - k.w / 2 - 3} ${k.y}Q50 ${k.y + 9} ${50 + k.w / 2 + 3} ${k.y}`, sw(1.5) + ` stroke="${c}" stroke-dasharray="1.6 1.1"`) + L(`M${s.left + 2} ${s.y + 20}Q50 ${s.y + 24} ${s.right - 2} ${s.y + 20}`, sw(1.3) + ` stroke="${c}" stroke-dasharray="2.4 1.4" opacity=".85"`);
    if (e === 3) { const g = { hearth: '#c0392b', delver: '#e0702a', sylvan: '#3fae4a', ash: '#e0632a', tide: '#2fb8c0', veil: '#c35bb0', grave: '#5fe0b0', wind: '#4f8fdc' }[ctx.race]; o += `<circle cx="${s.left + 12}" cy="${s.y + 4}" r="2.6" fill="${GOLD}"/><circle cx="${s.left + 12}" cy="${s.y + 4}" r="1.3" fill="${g}" stroke="none"/><circle cx="${s.right - 12}" cy="${s.y + 4}" r="2.6" fill="${GOLD}"/><circle cx="${s.right - 12}" cy="${s.y + 4}" r="1.3" fill="${g}" stroke="none"/>`; }
    return o;
  };

  // ---------------------------------------------------------------- body layer (also hair behind the head and the neck)
  PORTRAIT.layers.body.push(ctx => {
    if (ctx.skipPeople) return '';
    const T = traits(ctx), { id, anat: A } = ctx, k = A.neck, col = T.col;
    const C = clothing(ctx, T);
    const skin = T.skin;
    let defs = `<radialGradient id="${id}-s" cx=".38" cy=".34" r=".72"><stop offset="0" stop-color="${lt(skin, 0.28)}"/><stop offset=".6" stop-color="${skin}"/><stop offset="1" stop-color="${dk(skin, 0.28)}"/></radialGradient>` +
      lin(id + '-h', lt(T.hair, 0.22), dk(T.hair, 0.3), 1) + lin(id + '-b', C.base[0], C.base[1]);
    const used = C.back + C.over;
    if (used.includes(id + '-t)')) defs += lin(id + '-t', lt(col, 0.12), dk(col, 0.35));
    if (used.includes(id + '-p)')) defs += lin(id + '-p', lt(metalFill(ctx), 0.35), dk(metalFill(ctx), 0.35));
    let s = `<defs>${defs}</defs><g clip-path="url(#${id}-c)">` + OPEN + C.back;
    if ((T.long || T.bob) && !T.hood && !ctx.hideHair && !T.skull && ctx.race !== 'wind') s += hairBack(ctx, T);
    if (ctx.look.female && T.fs === 1 && !T.hood && !ctx.hideHair && !T.skull && ctx.race !== 'wind' && ctx.race !== 'delver') s += bun(ctx);
    const neck = ctx.race === 'grave' && T.skull
      ? P(path([[k.x - 3, A.chin - (ctx.look.trait === 2 ? 10 : 4)], [k.x - 3, k.y + 1], [k.x + 3, k.y + 1], [k.x + 3, A.chin - (ctx.look.trait === 2 ? 10 : 4)]], true, 0.2), ctx.pal.bone) + L(`M${k.x - 3} ${A.chin + 0.5}h6M${k.x - 3} ${A.chin + 3.5}h6`, sw(1.2))
      : P(path([[k.x - k.w / 2, A.chin - 8], [k.x - k.w / 2 - 0.5, k.y + 1], [k.x + k.w / 2 + 0.5, k.y + 1], [k.x + k.w / 2, A.chin - 8]], true, 0.3), `url(#${id}-s)`) + `<path d="M${k.x - k.w / 2} ${A.chin - 1}Q${k.x} ${A.chin + 5} ${k.x + k.w / 2} ${A.chin - 1}V${A.chin - 6}H${k.x - k.w / 2}z" fill="#000" opacity=".22" stroke="none"/>`;
    s += neck;
    if (ctx.race === 'tide' && !T.skull) s += L(`M${k.x - 4} ${A.chin + 2}q2 2 1 4M${k.x + 4} ${A.chin + 2}q-2 2-1 4`, sw(1.1) + ` stroke="${dk(skin, 0.45)}"`);
    s += P(path(torso(A)), `url(#${id}-b)`) + C.over + eraTrim(ctx, T);
    return s + '</g></g>';
  });

  // ---------------------------------------------------------------- head layer
  const headOutline = (ctx, T) => {
    const A = ctx.anat, H = A.head, cx = H.cx, cy = H.cy, rx = H.rx, cr = A.crown, ch = A.chin, r = ctx.race, lk = ctx.look;
    const jw = 1 + (lk.jaw - 0.5) * 0.24 - (lk.female ? 0.08 : 0) - (T.young ? 0.03 : 0);
    let o;
    if (r === 'hearth') o = sym([[cx, cr], [cx - rx * 0.72, cr + 2.5], [cx - rx, cy - 4], [cx - rx - 0.5, cy + 5], [cx - rx * 0.8 * jw, ch - 5], [cx - rx * 0.4 * jw, ch - 0.8], [cx, ch]]);
    else if (r === 'delver') o = sym([[cx, cr], [cx - rx * 0.8, cr + 2], [cx - rx, cy - 3], [cx - rx, cy + 6], [cx - rx * 0.85 * jw, ch - 3], [cx - rx * 0.45 * jw, ch], [cx, ch]]);
    else if (r === 'sylvan') o = sym([[cx, cr], [cx - rx * 0.85, cr + 4], [cx - rx, cy - 2], [cx - rx * 0.9, cy + 7], [cx - rx * 0.45 * jw, ch - 3.5], [cx, ch, 1]]);
    else if (r === 'ash') o = sym([[cx, cr], [cx - rx * 0.78, cr + 2.5], [cx - rx, cy - 4], [cx - rx - 1, cy + 6], [cx - rx * 0.86 * jw, ch - 3], [cx - rx * 0.45 * jw, ch], [cx, ch]]);
    else if (r === 'veil') o = sym([[cx, cr], [cx - rx * 0.92, cr + 4], [cx - rx, cy - 4], [cx - rx * 0.78, cy + 7], [cx - rx * 0.32 * jw, ch - 3], [cx, ch, 1]]);
    else if (r === 'grave') o = T.skull ? sym([[cx, cr], [cx - rx * 0.86, cr + 3], [cx - rx, cy - 3], [cx - rx * 0.95, cy + 4], [cx - rx * 0.62, cy + 8, 1], [cx - rx * 0.55, ch - 3 - (lk.trait === 2 ? 5 : 0)], [cx - rx * 0.3, ch - (lk.trait === 2 ? 6 : 0)], [cx, ch - (lk.trait === 2 ? 6 : 0)]])
      : sym([[cx, cr], [cx - rx * 0.86, cr + 3], [cx - rx, cy - 3], [cx - rx * 0.92, cy + 4], [cx - rx * 0.7 * jw, cy + 9], [cx - rx * 0.45 * jw, ch - 1.5], [cx, ch]]);
    else o = sym([[cx, cr], [cx - rx * 0.8, cr + 3], [cx - rx, cy - 3], [cx - rx * 0.95, cy + 6], [cx - rx * 0.6 * jw, ch - 3], [cx, ch]]); // tide, wind
    // face width (cheeks and jaw only, the skull stays on the anatomy anchors) and chin length
    const cw = 1 + lk.wid * 0.07, dc = T.skull ? 0 : lk.chin * 1.3;
    return o.map(q => [q[1] > cy - 4 ? cx + (q[0] - cx) * cw : q[0], q[1] > ch - 1.5 ? q[1] + dc : q[1], q[2]]);
  };
  PORTRAIT.layers.head.push(ctx => {
    if (ctx.skipPeople) return '';
    const T = traits(ctx), A = ctx.anat, H = A.head, cx = H.cx, cy = H.cy, rx = H.rx, r = ctx.race, id = ctx.id, lk = ctx.look;
    let s = OPENF;
    if (r === 'veil') s = `<defs><radialGradient id="${id}-gl"><stop offset="0" stop-color="${lk.col2}" stop-opacity=".9"/><stop offset="1" stop-color="${lk.col2}" stop-opacity="0"/></radialGradient></defs><circle cx="${cx}" cy="${cy}" r="${rx + 14}" fill="url(#${id}-gl)"/>` + s;
    if (r === 'wind') { // feather ruff behind the head (sometimes barred)
      const h = T.hair, ruff = [[cx, cy], [cx - rx + 1, cy - 8], [cx - rx - 4, cy - 1, 1], [cx - rx - 1, cy + 3], [cx - rx - 5, cy + 9, 1], [cx - rx, cy + 11], [cx - rx - 2, A.chin + 3, 1], [cx - rx + 5, A.chin + 1], [cx - 5, A.chin + 5, 1], [cx, A.chin + 2]];
      s += P(path(sym(ruff, cx), true, 0.5), dk(h, 0.15));
      if (lk.t2 < 0.45) { const d = `M${cx - rx - 3} ${cy}l3 1.5M${cx - rx - 4} ${cy + 6}l3.5 1.5M${cx - rx - 1} ${A.chin}l3 1`; s += Ln(d + d.replace(/M(\d+)/g, (m, x) => 'M' + (100 - x)).replace(/l(\d)/g, 'l-$1'), sw(1.3) + ` stroke="${dk(h, 0.5)}"`); }
    }
    const fill = r === 'wind' ? T.hair : `url(#${id}-s)`;
    s += P(path(headOutline(ctx, T).map(q => [cx + (q[0] - cx) * 1.03, cy + (q[1] - cy) * 1.03, q[2]])), fill); // 1.03: the spline runs just inside its points
    if (r === 'wind') { // pale face disc framed by feathers
      const w = 1 + lk.wid * 0.06, fp = sym([[cx + 1, A.brow - 6], [cx - rx * 0.62 * w, A.brow - 4], [cx - rx * 0.78 * w, cy + 4], [cx - rx * 0.4 * w, A.chin - 2], [cx + 1, A.chin - 1]], cx + 1);
      s += P(path(fp, true, 0.4), `url(#${id}-s)`, sw(1.4));
    }
    return s; // the group stays open: face and hair draw inside it, hair closes it
  });

  // ---------------------------------------------------------------- face layer
  // people-style face markings: mark 1..4 (0 = none); g = face geometry
  const MARKS = {
    hearth: (g, m) => m === 1 ? dots([[g.cx - g.es - 3, g.my - 1]], '#4a2a1a', 1.6) : m === 3 ? Ln(`M${g.cx - 1} ${g.ch - 2}q1 1 2 0`, sw(1) + ` stroke="${g.shade}"`) : m === 4 ? `<path d="M${n(g.cx + g.es)} ${g.ey + 4}q4-1 5 3q-3 2-5 0z" fill="#3a2a20" opacity=".25" stroke="none"/>` : '',
    delver: (g, m) => m === 1 ? Ln(`M${g.cx} ${g.br - 8}l2.5 3-2.5 3-2.5-3zM${g.cx} ${g.br - 2}v-2`, sw(1.2) + ' stroke="#2f5a9a"') : m === 2 ? Ln(`M${n(g.cx - g.es - 3)} ${g.ey + 4}v5M${n(g.cx - g.es - 1)} ${g.ey + 4}v5M${n(g.cx - g.es - 4)} ${g.ey + 6}h4`, sw(1.1) + ' stroke="#2f5a9a"')
      : m === 3 ? `<path d="M${n(g.cx + g.es - 3)} ${g.ey + 3}q6-1 7 5q-4 2-7-1z" fill="#1c1209" opacity=".28" stroke="none"/>` : dots([[g.cx + g.es + 3, g.br - 2], [g.cx + g.es + 4, g.br + 0.5]], '#c9ccd0', 1.8),
    sylvan: (g, m) => m === 1 ? `<path d="M${n(g.cx - g.es - 6)} ${g.ey - 2}q-3-5 1-9q2 5-1 9z" fill="${g.c2}" opacity=".75" stroke="none"/>` : m === 2 ? Ln(`M${n(g.cx - g.es - 4)} ${g.ey + 3}q-2 4 1 6q3 1 2-2q-1-1-2 0`, sw(1.1) + ` stroke="#3e7a3a"`)
      : m === 3 ? dots([[g.cx + g.es + 3, g.ey + 3], [g.cx + g.es + 3.5, g.ey + 5.5], [g.cx + g.es + 4, g.ey + 8], [g.cx - g.es - 3, g.ey + 3], [g.cx - g.es - 3.5, g.ey + 5.5], [g.cx - g.es - 4, g.ey + 8]], '#3e7a3a', 1.3) : Ln(`M${g.cx - 4} ${g.br - 6}q4-3 8 0M${g.cx} ${g.br - 7.5}v-3`, sw(1.1) + ` stroke="#6a5a2a"`),
    ash: (g, m) => {
      const pc = g.c2;
      if (m === 1) return P(`M${n(g.cx - g.es - 5)} ${g.ey - 2}h${n(2 * g.es + 10)}l-1 4h${n(-2 * g.es - 8)}z`, pc, ' opacity=".7" stroke="none"');
      if (m === 2) return Ln(`M${n(g.cx - g.es)} ${g.ey + 2}v8M${n(g.cx - g.es - 2.5)} ${g.ey + 2}v6M${n(g.cx + g.es)} ${g.ey + 2}v8`, sw(1.8) + ` stroke="${pc}" opacity=".8"`);
      if (m === 3) return Ln(`M${g.cx} ${g.br - 7}v${g.my - g.br + 4}`, sw(2.4) + ` stroke="${pc}" opacity=".75"`);
      if (m === 4) return Ln(`M${n(g.cx - g.es - 4)} ${g.ey + 3}l2 3 3 1 1 4M${n(g.cx - g.es - 1)} ${g.ey + 6}l-2 3M${g.cx + 2} ${g.br - 7}l-1 3 2 2`, sw(1.2) + ` stroke="#ffb040"`);
      return '';
    },
    tide: (g, m) => m === 1 ? Ln(`M${n(g.cx - g.es - 6)} ${g.ey + 5}q1.5-1.5 3 0q1.5-1.5 3 0M${n(g.cx - g.es - 4.5)} ${g.ey + 7.5}q1.5-1.5 3 0M${n(g.cx + g.es)} ${g.ey + 5}q1.5-1.5 3 0q1.5-1.5 3 0M${n(g.cx + g.es + 1.5)} ${g.ey + 7.5}q1.5-1.5 3 0`, sw(1) + ` stroke="${dk(g.skin, 0.35)}"`)
      : m === 2 ? dots([[g.cx - g.rx + 3, g.ey - 4], [g.cx - g.rx + 3, g.ey - 1], [g.cx - g.rx + 3.5, g.ey + 2], [g.cx + g.rx - 4, g.ey - 4], [g.cx + g.rx - 4, g.ey - 1], [g.cx + g.rx - 4.5, g.ey + 2]], dk(g.skin, 0.4), 1.6)
      : m === 4 ? Ln(`M${n(g.cx - g.es - 2)} ${g.ey + 4}l-3 5M${n(g.cx + g.es + 2)} ${g.ey + 4}l3 5`, sw(2) + ` stroke="${g.c2}" opacity=".6"`) : '',
    veil: (g, m) => {
      const st = (x, y, k = 1) => `M${n(x)} ${n(y - 2.5 * k)}l${n(0.8 * k)} ${n(1.7 * k)} ${n(1.7 * k)} ${n(0.8 * k)}-${n(1.7 * k)} ${n(0.8 * k)}-${n(0.8 * k)} ${n(1.7 * k)}-${n(0.8 * k)}-${n(1.7 * k)}-${n(1.7 * k)}-${n(0.8 * k)} ${n(1.7 * k)}-${n(0.8 * k)}z`;
      const c = g.sc;
      if (m === 1) return dots([[g.cx + g.es + 1, g.ey + 4], [g.cx + g.es + 4, g.ey + 6], [g.cx + g.es + 2, g.ey + 9]], c, 1.5) + Ln(`M${n(g.cx + g.es + 1)} ${g.ey + 4}l3 2-2 3`, sw(0.6) + ` stroke="${c}"`) + P(st(g.cx, g.br - 6, 0.8), c, NS);
      if (m === 2) return P(`M${g.cx + 1} ${g.br - 10}a3.6 3.6 0 1 0 2.6 6a2.8 2.8 0 1 1-2.6-6z`, c, NS);
      if (m === 3) return P(st(g.cx - g.es, g.ey + 6, 0.8) + st(g.cx + g.es, g.ey + 6, 0.8), c, NS);
      if (m === 4) return dots([[g.cx - 6, g.br - 5], [g.cx - 3, g.br - 6.5], [g.cx, g.br - 7], [g.cx + 3, g.br - 6.5], [g.cx + 6, g.br - 5]], c, 1.6);
      return P(st(g.cx, g.br - 6, 0.65), c, NS);
    },
    grave: (g, m, sk) => {
      if (sk) return m === 1 ? Ln(`M${n(g.cx + g.es + 3)} ${g.ey + 2}l2 3-1 3l1.5 2`, sw(1)) : m === 2 ? Ln(`M${g.cx - 2.5} ${g.br - 8}h5M${g.cx} ${g.br - 10.5}v5`, sw(1.5) + ` stroke="${g.ec}"`) : m === 3 ? Ln(`M${n(g.cx - g.es - 3.5)} ${g.ey - 3.5}l2 2M${n(g.cx - g.es + 2)} ${g.ey + 3}l1.5 1.5`, sw(1)) : '';
      if (m === 1) return Ln(`M${n(g.cx - g.es - 4)} ${g.ey + 3}l5 6M${n(g.cx - g.es - 3)} ${g.ey + 5}l2-1.5M${n(g.cx - g.es - 1.5)} ${g.ey + 7}l2-1.5`, sw(1) + ` stroke="#3a2a22"`);
      if (m === 2) return Ln(`M${g.cx - 7} ${g.br - 5}q7-3 14 0M${g.cx - 5} ${g.br - 7}l1 3.5M${g.cx - 1} ${g.br - 8}v3.5M${g.cx + 3} ${g.br - 8}l-.5 3.5`, sw(1) + ` stroke="#3a2a22"`);
      if (m === 3) return `<path d="M${n(g.cx + g.es)} ${g.ey + 3}q5 0 5 4q-2 3-5 1q-2-3 0-5z" fill="#6f7a4a" opacity=".55" stroke="none"/>`;
      if (m === 4) return P(path([[g.cx + g.es - 1, g.ey + 3], [g.cx + g.es + 4, g.ey + 4], [g.cx + g.es + 3, g.ey + 9], [g.cx + g.es - 1, g.ey + 7]], true, 0.3), '#e8e0c8', sw(1)) + Ln(`M${n(g.cx + g.es)} ${g.ey + 5}h3M${n(g.cx + g.es)} ${g.ey + 7}h2.5`, sw(0.8));
      return '';
    },
    wind: (g, m) => {
      const c = dk(g.hair, 0.55);
      if (m === 1) return Ln(`M${n(g.cx - g.es)} ${g.ey + 2}q-.5 4 .5 7M${n(g.cx + g.es)} ${g.ey + 2}q.5 4-.5 7`, sw(2.2) + ` stroke="${c}"`);
      if (m === 2) return `<path d="M${n(g.cx - g.es - 4)} ${g.ey - 1}h${n(2 * g.es + 8)}l-1 3h${n(-2 * g.es - 6)}z" fill="${c}" opacity=".55" stroke="none"/>`;
      if (m === 3) return dots([[g.cx - 6, g.ey + 6], [g.cx - 4, g.ey + 9], [g.cx + 6, g.ey + 6], [g.cx + 4, g.ey + 9], [g.cx - 7, g.ey + 9.5], [g.cx + 7.5, g.ey + 9]], c, 1.2);
      if (m === 4) return Ln(`M${n(g.cx - g.es - 3.5)} ${g.br - 1}q${n(g.es)}-2.5 ${n(g.es + 2)}-.5M${n(g.cx + g.es + 3.5)} ${g.br - 1}q${n(-g.es)}-2.5 ${n(-g.es - 2)}-.5`, sw(1.6) + ` stroke="#f6f1e4"`);
      return '';
    },
  };
  PORTRAIT.layers.face.push(ctx => {
    if (ctx.skipPeople) return '';
    const T = traits(ctx), A = ctx.anat, H = A.head, cx = H.cx + 1, rx = H.rx, r = ctx.race, lk = ctx.look, pal = ctx.pal, skin = T.skin;
    const ey = A.brow + (r === 'delver' ? 4.5 : 4), es = n(rx * (r === 'veil' ? 0.44 : 0.4) + lk.gap * 0.6), my = A.chin - 7, ny = (ey + my) / 2 + 1;
    const f = lk.female, shade = dk(skin, 0.5), ex = lk.mouth, star = ctx.kind === 'hero' || ctx.kind === 'ruler', sk = r === 'grave' && T.skull, cy = H.cy;
    const patch = lk.patch && !sk, x1 = n(cx + es); // an eyepatch covers the viewer's right eye
    let s = '', ln = '';                          // ln: fine creases (wrinkles, smile lines), one path at the end
    // eyes
    if (r === 'grave') {
      const g = lk.eyeCol;
      for (const d of [-1, 1]) { if (patch && d === 1) continue; const x = n(cx + d * es); s += P(path(ellP(x, ey, sk ? 3.6 : 3, sk ? 3.4 : 2.6, 7), true, 0.4), '#1a1410', sw(1.4)) + (sk && lk.trait === 4 && d < 0 ? '' : `<circle cx="${x}" cy="${ey}" r="2.6" fill="${g}" opacity=".35" stroke="none"/><circle cx="${x}" cy="${ey}" r="1.2" fill="${lt(g, 0.5)}" stroke="none"/>`); }
    } else if (r === 'veil') {
      const k = [2, 1.2, 2.8, 2.3, 1.5][lk.eye];
      for (const d of [-1, 1]) { if (patch && d === 1) continue; const x = cx + d * es; s += P(path([[x - 4 * d, ey + 0.5], [x, ey - k - 0.6], [x + 4.5 * d, ey - k, 1], [x + 1 * d, ey + 2.6 - (lk.eye === 1 ? 0.8 : 0)]], true, 0), lk.eyeCol, sw(1.4)) + `<circle cx="${n(x - d)}" cy="${n(ey - 0.8)}" r=".9" fill="#fff" stroke="none"/>`; }
    } else {
      const E = [[3, 1.8, 0], [3.3, 1.3, 0], [2.7, 2.2, 0], [3.2, 1.7, -1], [3, 1.6, 0.8]][lk.eye];
      const w = E[0] + (r === 'delver' ? -0.4 : r === 'sylvan' ? 0.4 : 0), h = r === 'wind' ? 2.4 : n(E[1] * (T.young ? 1.15 : 1)), tilt = E[2] + (r === 'sylvan' || r === 'ash' ? -1 : 0);
      let lids = '', wh = '', ir = [];
      for (const d of [-1, 1]) {
        const x = cx + d * es;
        if (r === 'wind') s += P(`M${n(x + 2.5 * d)} ${ey + 1}l${3 * d} 5l${-3 * d}-1z`, dk(T.hair, 0.5), NS);
        if (patch && d === 1) continue;
        wh += path([[x - w * d, ey + 0.4], [x, ey - h], [x + w * d, ey - 0.4 + tilt], [x, ey + h * 0.8]], true, 0); ir.push([x + 0.4, ey]);
        lids += `M${n(x - w * d - 0.3 * d)} ${n(ey + 0.2)}Q${n(x)} ${n(ey - h - 1.2)} ${n(x + w * d + 0.6 * d)} ${n(ey - 0.4 + tilt)}` + (f ? `l${1.4 * d}-1.2` : '');
        if (r !== 'wind' && (lk.eye === 4 || T.elder)) ln += `M${n(x - w * d)} ${n(ey - h - 0.8)}Q${n(x)} ${n(ey - h - 2.6)} ${n(x + w * d)} ${n(ey - h - 0.6 + tilt)}`;
        if (T.elder && r !== 'wind') ln += `M${n(x - 2 * d)} ${n(ey + h + 1.3)}q${2 * d} 1.2 ${4 * d} 0`;
      }
      s += P(wh, r === 'ash' ? '#f6e3b8' : '#f8f1e2', sw(1.1)) + dots(ir, lk.eyeCol, 3.5) + (r === 'wind' || r === 'ash' ? dots(ir, INK, 1.4) : '') + Ln(lids, sw(1.8));
    }
    if (patch) s += P(path(ellP(x1, ey + 0.3, 3.8, 3.2, 6), true, 0.3), '#1d1612', sw(1.2)) + Ln(`M${n(x1 - 3.4)} ${n(ey - 1.5)}L${n(cx - rx - 0.5)} ${A.brow - 5}M${n(x1 + 3.2)} ${n(ey - 1)}L${n(cx + rx - 1)} ${ey - 3}`, sw(1.2));
    // brows: thin · plain · arched · heavy; expression lowers (scowl) or lifts (smile) the inner ends
    const bc = sk ? null : dk(T.hair === '#ece4d4' || T.hair === '#f4f0e6' ? '#8a7a6a' : T.hair, 0.35);
    if (bc && r !== 'wind') {
      const by = A.brow, tl = lk.brow * 1.1 + [0, -0.8, 0.9, 1.9, 0.2][ex], bs = lk.browSt;
      let bl = '';
      for (const d of [-1, 1]) {
        const x = cx + d * es, up = ex === 4 && d > 0 ? 1.2 : 0;
        if (r === 'delver' || r === 'ash') { const k = [0.75, 1, 1.25, 1.45][bs]; s += P(path([[x - 4 * d, by + 1.5 + tl - up], [x - 3 * d, by - 1.5 * k + tl - up], [x + 2 * d, by - 2.5 * k - up], [x + 5.5 * d, by - 0.5 - up, 1], [x + 1 * d, by + 0.5 * k - up]], true, 0.3), r === 'delver' ? `url(#${ctx.id}-h)` : dk(skin, 0.45), sw(1.4)); }
        else bl += `M${n(x - 3.5 * d)} ${n(by + 1 + tl - up)}Q${n(x)} ${n(by - (bs === 2 ? 3 : 1.6) - (r === 'sylvan' ? 0.8 : 0) - up)} ${n(x + 3.8 * d)} ${n(by - (r === 'sylvan' || r === 'veil' ? 1.8 : 0.2) + (bs === 3 ? 0.6 : 0) - up)}`;
      }
      if (bl) s += Ln(bl, sw(n([1.3, 2.1, 1.8, 2.8][bs] * (f || r === 'veil' ? 0.7 : 1) * (star ? 1.12 : 1))) + ` stroke="${bc}"`);
      if ((ex === 3 || (ex === 2 && !T.young)) && !sk) ln += `M${n(cx - 1)} ${A.brow - 0.5}l.3 2.6M${n(cx + 1)} ${A.brow - 0.5}l-.3 2.6`;
    }
    if (r === 'wind' && (ex === 2 || ex === 3)) s += Ln(`M${n(cx - es - 3.5)} ${A.brow - 0.5}L${n(cx - 1.5)} ${A.brow + (ex === 3 ? 2.5 : 1)}M${n(cx + es + 3.5)} ${A.brow - 0.5}L${n(cx + 1.5)} ${A.brow + (ex === 3 ? 2.5 : 1)}`, sw(2.2) + ` stroke="${dk(T.hair, 0.55)}"`);
    // nose: hooked · straight · button · broad · aquiline (people shapes for delver, wind, tide, skulls)
    const nv = lk.nose;
    if (sk) s += P(`M${cx} ${ny - 3}l-2 4.5h4z`, '#1a1410', sw(1.2));
    else if (r === 'wind') { const k = [1, 1.25, 0.8, 1.1, 1.4][nv], hk = [0, 1, 0, 1.5, 2.5][nv]; s += P(path([[cx - 2.5 * k, ey + 1], [cx + 2 * k, ey], [cx + 3.5 * k, ny + 1], [cx + 1.2 + hk * 0.6, ny + 4 + k * 1.5 + hk, 1], [cx + 0.2, ny + 2], [cx - 2.4 * k, ny + 1]], true, 0), `url(#${ctx.id}-k2)`, sw(1.6)) + Ln(`M${n(cx - 2 * k)} ${ny + 1}q2 .8 ${n(4.2 * k)} 0`, sw(1)) + `<defs>${lin(ctx.id + '-k2', lt(pal.beak, 0.3), dk(pal.beak, 0.3), 1)}</defs>`; }
    else if (r === 'delver') { const k = [1, 1.2, 0.85, 1.35, 1.1][nv]; s += P(path([[cx + 0.5, ey - 1], [cx - 2.5 * k, ny], [cx - 3.5 * k, ny + 3 * k], [cx, ny + 4.5 * k], [cx + 4 * k, ny + 2.5 * k], [cx + 3 * k, ny - 1]], true, 0.3), `url(#${ctx.id}-s)`, sw(1.6)) + (lk.mark === 2 || T.elder ? `<circle cx="${n(cx + 0.5)}" cy="${n(ny + 2.5)}" r="2.6" fill="${pal.cheek}" opacity=".4" stroke="none"/>` : ''); }
    else if (r === 'tide') s += Ln(`M${cx - 1.2} ${ny}l-.4 1.4M${cx + 1.4} ${ny}l.4 1.4` + (nv > 2 ? `M${cx + 0.2} ${ey + 1}v${n(ny - ey - 2)}` : ''), sw(1.3));
    else {
      const nw = sw(r === 'veil' ? 1.1 : r === 'sylvan' ? 1.4 : 1.6);
      if (nv === 0) s += Ln(`M${cx + 0.5} ${ny - 3}q1.5 3 1 4.2q-1 1.4-3.2.6`, nw);
      else if (nv === 1) s += Ln(`M${cx + 0.4} ${ey + 1}L${cx + 1.6} ${ny + 1.5}l-2 .8`, nw);
      else if (nv === 2) s += Ln(`M${cx - 1.6} ${n(ny + 0.6)}q1.6 1.6 3.4 0M${cx + 0.4} ${ny - 2}l.4 1.4`, nw);
      else if (nv === 3) s += Ln(`M${cx - 3} ${n(ny + 1.5)}q-.8-1.6.6-2M${cx + 3.4} ${n(ny + 1.5)}q.8-1.6-.6-2M${cx - 1.5} ${n(ny + 2.2)}q1.8 1 3.4 0M${cx + 0.6} ${ey + 1}l.6 ${n(ny - ey - 2.5)}`, nw);
      else s += Ln(`M${cx + 0.3} ${ey}q3 ${n((ny - ey) * 0.4)} 2.2 ${n(ny - ey + 1)}q-.6 1.2-3 .4`, nw);
    }
    // mouth: neutral · smile · stern · scowl · smirk
    const mw = n(4 + lk.wid * 0.7);
    if (sk) {
      if (lk.trait === 2) s += P(`M${cx - 5} ${my - 1}h10v2.2h-10z`, '#efe6cc', sw(1.3)) + Ln(`M${cx - 2.5} ${my - 1}v2.2M${cx} ${my - 1}v2.2M${cx + 2.5} ${my - 1}v2.2`, sw(0.9));
      else s += P(`M${cx - 5} ${my - 1}h10v3.5h-10z`, '#efe6cc', sw(1.3)) + Ln(`M${cx - 2.5} ${my - 1}v3.5M${cx} ${my - 1}v3.5M${cx + 2.5} ${my - 1}v3.5`, sw(0.9)) + (lk.trait === 4 ? `<rect x="${cx}" y="${my - 1}" width="2.5" height="1.8" fill="${GOLD}"${sw(0.6)}/>` : '');
    } else if (r !== 'wind') {
      if (f && r !== 'grave') {
        const c = [0.8, 1.8, 0.2, -0.8, 0.8][ex];
        s += ex === 4 ? P(`M${cx - 3.5} ${my + 0.4}q3.5 2 7.4-1.4q-3.8-1-7.4 1.4z`, mix(pal.cheek, '#a03838', 0.4), sw(1.1)) : P(`M${cx - 3.5} ${my}q3.5 ${n(1.6 + c)} 7 0q-3.5-1.6-7 0z`, mix(pal.cheek, '#a03838', 0.4), sw(1.1));
      } else {
        const M = [`M${cx - mw} ${my}Q${cx} ${my + 0.6} ${cx + mw} ${my}`, `M${cx - mw} ${my - 1}Q${cx} ${my + 2.4} ${cx + mw} ${my - 1}`, `M${cx - mw} ${my}h${n(2 * mw)}`, `M${cx - mw} ${my + 1.2}Q${cx} ${my - 1.4} ${cx + mw} ${my + 1.2}`, `M${cx - mw} ${my + 0.3}Q${cx + 1} ${my + 1} ${n(cx + mw + 0.6)} ${my - 1.6}`][ex];
        s += Ln(M, sw(1.6));
      }
      if (ex === 1 && !T.young) ln += `M${n(cx - mw - 1.2)} ${my - 2.5}q-.8 1.4.2 2.6M${n(cx + mw + 1.2)} ${my - 2.5}q.8 1.4-.2 2.6`;
      if (ex === 3) ln += `M${cx - 1.6} ${my + 3.4}q1.6 .7 3.2 0`;
      if (ex === 4) ln += `M${n(cx + mw + 1.4)} ${my - 2.6}l.4 1.6`;
      if (r === 'ash' && lk.tusks && !f) s += P(`M${cx - 4.5} ${my + 1}l1-5 1.8 4.5zM${cx + 4.5} ${my + 1}l-1-5-1.8 4.5z`, pal.horn, sw(1.1));
    }
    // age, character and bone structure
    if (!sk && r !== 'wind') {
      if (T.elder) ln += `M${cx - 5} ${A.brow - 4}q5-1.5 10 0M${cx - 4} ${A.brow - 6.5}q4-1.2 8 0M${n(cx + es + 3.5)} ${ey - 1}l2-1M${n(cx + es + 3.5)} ${ey + 1}l2 .6M${n(cx - es - 3.5)} ${ey - 1}l-2-1M${n(cx - mw - 0.5)} ${n(ny + 0.5)}q-1.6 2.6-.6 5.2M${n(cx + mw + 0.5)} ${n(ny + 0.5)}q1.6 2.6.6 5.2`;
      else if (!T.young && ex === 2) ln += `M${n(cx - mw)} ${n(ny + 1)}q-1.2 2-.6 4M${n(cx + mw)} ${n(ny + 1)}q1.2 2 .6 4`;
      if (lk.cheek && !T.young) ln += `M${n(cx - es - 4.5)} ${ey + 5.5}q2.4 1.4 4.6.8M${n(cx + es + 4.5)} ${ey + 5.5}q-2.4 1.4-4.6.8`;
      if (star && !f) ln += `M${cx - rx + 2.5} ${cy + 5}q1.5 5 6 7.5M${cx + rx - 2.5} ${cy + 5}q-1.5 5-6 7.5`;
    }
    if (ln) s += Ln(ln, sw(1) + ` stroke="${shade}" opacity=".8"`);
    // cheeks, freckles, people markings
    const ck = (op, rr = 3.2) => dots([[cx - es - 1, ey + 6], [cx + es + 1, ey + 6]], pal.cheek, rr * 2, ` opacity="${String(op).replace(/^0/, '')}"`);
    if (r === 'hearth') s += ck(lk.mark === 2 ? 0.75 : (0.25 + lk.v * 0.4).toFixed(2));
    if (r === 'veil') s += ck(0.5, 2.6);
    if (lk.freckle && !sk) s += dots([[-6, 5], [-4.4, 6.6], [-7.6, 6.8], [-3, 4.6], [-5.4, 8.4], [6, 5], [4.4, 6.6], [7.4, 6.4], [3.2, 4.8], [5.6, 8.2], [-0.8, 3.6], [1, 4]].map(q => [cx + q[0], ey + q[1]]), dk(skin, 0.35), 1);
    if (r === 'ash') s += Ln(`M${n(cx + es + 2)} ${ey + 4}l2 3-1 3`, sw(1) + ` stroke="${pal.accent}"`);
    if (r === 'tide') s += Ln(`M${n(cx - rx + 2)} ${ey + 5}q1.5 1 1.5 3M${n(cx - rx + 3)} ${ey + 3}q1.5 1 1.5 3M${n(cx + rx - 3)} ${ey + 3}q-1.5 1-1.5 3M${n(cx + rx - 4)} ${ey + 5}q-1.5 1-1.5 3`, sw(1) + ` stroke="${dk(skin, 0.45)}"`) + dots([[cx - 7, A.brow - 6], [cx - 4, A.brow - 8], [cx + 6, A.brow - 7]], lt(skin, 0.45), 1.8);
    if (r === 'grave' && !sk) s += Ln(`M${n(cx - rx + 4)} ${ey + 4}q2 4 4 5M${n(cx + rx - 4)} ${ey + 4}q-2 4-4 5`, sw(1.2) + ` stroke="${shade}"`);
    if (sk && lk.trait !== 3) s += Ln(lk.trait === 1 ? `M${cx - 4} ${A.crown + 2}l2 5-2 3 2 4M${cx - 2} ${A.crown + 7}l3 1` : `M${n(cx - 3)} ${A.crown + 4}l2 4-1 3`, sw(1));
    const g = { cx, es, ey, my, ny, rx, br: A.brow, ch: A.chin, shade, skin, hair: T.hair, c2: lk.col2, ec: lk.eyeCol, sc: [pal.accent, GOLD, '#7ea0e8', '#fff'][Math.floor(lk.v * 4)] };
    s += MARKS[r](g, lk.mark, sk);
    // scars: across the eye · cheek slash · split lip · brow notch
    const sc = lk.scar || (ctx.spec.wounded > 0.3 ? 1 : 0), red = sw(1.2) + ` stroke="#8a2a1e"`;
    if (sc && !sk) s += Ln([0, `M${n(cx + es - 2)} ${A.brow - 3}l4 9M${n(cx + es - 1)} ${A.brow}h2.5M${n(cx + es + 0.5)} ${A.brow + 3}h2.5`, `M${n(cx - es - 5)} ${ey + 3}l6 5M${n(cx - es - 3.5)} ${ey + 5}l1.5-1.5M${n(cx - es - 1.5)} ${ey + 6.6}l1.5-1.5`, `M${cx + 1.8} ${my - 3.5}l-1 6`, `M${n(cx - es - 2.5)} ${A.brow - 4}l3 6.5M${n(cx - es - 1.6)} ${A.brow - 1.6}h2`][sc], red);
    if (ctx.spec.wounded > 0.3) s += P(`M${n(cx - es - 4)} ${ey + 4}h5v2h-5zM${n(cx - es - 2.5)} ${ey + 2.5}h2v5h-2z`, '#f1ead8', sw(1));
    if (lk.jewel === 2 && r !== 'grave') s += `<circle cx="${n(cx + (r === 'wind' ? 2.4 : 2))}" cy="${n(ny + (r === 'wind' ? 3.5 : 2.2))}" r="1.4" fill="none" stroke="${GOLD}"${sw(1.1)}/>`;
    return s;
  });

  // ---------------------------------------------------------------- hair layer (hair, ears, beards, horns, crests, hoods, ornaments)
  PORTRAIT.layers.hair.push(ctx => {
    if (ctx.skipPeople) return '';
    const T = traits(ctx), A = ctx.anat, H = A.head, cx = H.cx, r = ctx.race, lk = ctx.look, pal = ctx.pal, f = lk.female;
    let s = '';
    const hide = ctx.hideHair || T.hood;
    if (!ctx.hideEars && !T.hood && A.ears && !(f && !hide && (r === 'hearth' || r === 'delver') && T.fs !== 1)) s += earShape(ctx);
    if (!hide) s += hairFront(ctx, T);
    if (r === 'sylvan' && !hide) { // leaf circlet: leaf colour and count vary
      const band = path([[cx - H.rx - 1, H.cy - 6], [cx, A.crown + 4], [cx + H.rx + 1, H.cy - 6]], false, 0), lv = lk.trait & 1 ? [[cx - 11, A.crown + 8, -55], [cx - 6, A.crown + 5, -25], [cx, A.crown + 3, 0], [cx + 6, A.crown + 5, 25], [cx + 11, A.crown + 8, 55]] : [[cx - 7, A.crown + 5, -30], [cx, A.crown + 3, 0], [cx + 7, A.crown + 5, 30]];
      s += Ln(band, sw(3.4)) + Ln(band, sw(1.6) + ` stroke="${pal.metal}"`) + lv.map(([x, y, a]) => `<path d="M0 0q3.5-3 0-8q-3.5 5 0 8z" transform="translate(${n(x)} ${n(y)}) rotate(${a})" fill="${lk.col2}" stroke-width="1.2"/>`).join('');
    }
    if ((r === 'sylvan' || r === 'veil' || (f && r !== 'wind' && r !== 'grave' && r !== 'delver' && T.fs !== 1)) && !hide && !T.skull) { // front locks (short for a bob, a braid on one side)
      const wl = r === 'sylvan' || r === 'veil' ? 3 : 2, lock = [[cx - H.rx - 1.5, H.cy - 6], [cx - H.rx - 3 - wl, H.cy + 8], [cx - H.rx - 1 - wl, T.bob ? A.chin + 2 : A.shoulders.y + 4, 1], [cx - H.rx + 1.5 + wl / 2, H.cy + 6]];
      if (f && T.fs === 2) { let b = ''; for (let y = H.cy - 2; y < 92; y += 4.5) b += `<ellipse cx="${n(cx - H.rx - 1)}" cy="${n(y)}" rx="3" ry="2.7" fill="url(#${ctx.id}-h)"/>`; s += b + `<rect x="${n(cx - H.rx - 3.5)}" y="90" width="5" height="3" rx="1" fill="${lk.col2}"/>`; }
      else s += P(path(lock, true, 0.4), `url(#${ctx.id}-h)`);
      s += P(path(mir(lock), true, 0.4), `url(#${ctx.id}-h)`);
    }
    if (r === 'delver' && f && !hide) for (const d of [-1, 1]) { let b = ''; for (let y = A.chin - 2; y < 92; y += 4.5) b += `<ellipse cx="${n(cx + d * (H.rx + 1))}" cy="${n(y)}" rx="3.2" ry="2.8" fill="url(#${ctx.id}-h)"/>`; s += b + `<rect x="${n(cx + d * (H.rx + 1) - 3)}" y="91" width="6" height="3" rx="1" fill="${lk.col2}"/>`; }
    s += beard(ctx, T);
    if (r === 'grave' && !T.skull && !hide) s += Ln(`M${cx - 8} ${A.crown + 2}q-6 6-6 22M${cx - 4} ${A.crown}q-4 8-3 14M${cx + 6} ${A.crown + 1}q6 8 5 22`, sw(1.3) + ` stroke="${T.hair}"`);
    if (T.hood && !ctx.hideHair) s += hood(ctx, T);
    if (ctx.kind === 'spy' && lk.v > 0.35) s += P(path(sym([[cx + 1, A.chin - 11], [cx - H.rx + 0.5, A.chin - 13], [cx - H.rx + 1, A.chin - 4], [cx - 6, A.chin + 3], [cx + 1, A.chin + 3]], cx + 1), true, 0.3), dk(mix('#24201f', T.col, 0.25), 0.1)) + Ln(`M${cx - 8} ${A.chin - 6}q9 3 18 0`, sw(1) + ' stroke-opacity=".5"');
    if (r === 'ash') s += horns(ctx);
    if (r === 'veil' && !hide) s += antennae(ctx);
    if (r === 'wind' && !hide) s += crest(ctx) + (lk.t2 > 0.68 ? twin(ctx, 'tf', P(path([[cx - H.rx + 3, A.crown + 8], [cx - H.rx - 3, A.crown - 4, 1], [cx - H.rx + 7, A.crown + 3]], true, 0.2), dk(T.hair, 0.2), sw(1.4))) : ''); // owl ear tufts
    if (r === 'tide' && !T.hood && !ctx.hideEars) { // pearl drops (gold-set for jewelled folk), a pearl string over the brow
      const ex = cx - H.rx + 0.5, ey = H.cy + 6, pc = lk.jewel === 1 ? GOLD : pal.pearl;
      s += Ln(`M${ex} ${ey - 1}v4M${100 - ex} ${ey - 1}v4`, sw(1)) + `<circle cx="${ex}" cy="${ey + 4.5}" r="2" fill="${pc}" stroke-width="1.1"/><circle cx="${100 - ex}" cy="${ey + 4.5}" r="2" fill="${pc}" stroke-width="1.1"/>`;
      if (!hide && lk.mark === 3) s += [-8, -4, 0, 4, 8].map(dx => `<circle cx="${cx + dx}" cy="${n(A.brow - 7 + Math.abs(dx) * 0.25)}" r="1.4" fill="${pal.pearl}" stroke-width=".9"/>`).join('');
    }
    if (lk.jewel === 3 && !hide && ctx.kind !== 'ruler' && r !== 'sylvan' && !(r === 'veil' && lk.trait === 3)) { // circlet with a gem
      const d = `M${cx - H.rx + 0.5} ${H.cy - 7}Q${cx} ${A.brow - 11} ${cx + H.rx - 0.5} ${H.cy - 7}`;
      s += Ln(d, sw(3)) + Ln(d, sw(1.5) + ` stroke="${GOLD}"`) + `<circle cx="${cx}" cy="${A.brow - 7.5}" r="1.7" fill="${r === 'hearth' ? pal.accent : lk.col2}"${sw(1)}/>`;
    }
    if (T.skull && lk.trait === 3 && !hide) { // a rusted iron crown on the bare skull
      s += P(`M${cx - 12} ${A.crown + 6}l2-6 3 4 3-6 3 6 3-6 3 6 3-4 2 6v3h-24z`, '#7a5a3a', sw(1.3));
    }
    if (r === 'veil' && ctx.size >= 40) s += [[cx - 21, A.crown + 6], [cx + 20, A.crown + 14], [cx + 15, A.chin + 2]].map(([x, y]) => `<path d="M${x} ${y - 2.5}l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" fill="${lk.col2}" stroke="none" opacity=".85"/>`).join('');
    return s + '</g>';
  });
  // the people layer fns (tests check they draw nothing for monsters / ships / siege)
  PORTRAIT.peopleLayers = ['body', 'head', 'face', 'hair'].map(l => PORTRAIT.layers[l][PORTRAIT.layers[l].length - 1]);
})();
