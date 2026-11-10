// =====================================================================
//  Ember & Crown — command layer for the keyboard console (no DOM).
//  G.cli.exec(s, owner, line, ctx) → { ok, out: [lines], err, nav?, confirm? }
//  G.cli.complete(s, owner, line, ctx) → { items: [{ text, label, kind }], from, word }
//  G.cli.commands — the grammar table (help and the encyclopedia are generated from it)
//  ctx is owned by the caller and kept between calls: { city, pending, columns, reports, tabs }
//  Every command calls the same public G APIs the tabs use, so nothing here changes the rules.
// =====================================================================
'use strict';

(function () {
  const SPEEDS = [1, 2, 5, 10, 25];
  const DEFAULT_TABS = ['city', 'council', 'ledger', 'empire', 'dynasty', 'military', 'world', 'moves', 'hero', 'research', 'culture', 'religion', 'magic',
    'diplomacy', 'espionage', 'minors', 'market', 'reports', 'chronicle', 'tales', 'help'];
  const HOSTILE = ['raid', 'attack', 'conquer'];
  const MISSIONS = { attack: 'attack', assault: 'attack', raid: 'raid', conquer: 'conquer', conquest: 'conquer', reinforce: 'reinforce', move: 'reinforce',
    scout: 'scout', settle: 'settle', found: 'settle', adventure: 'adventure', preach: 'preach' };
  const SYM_TREATIES = ['nap', 'borders', 'trade', 'research', 'defense', 'alliance', 'marriage'];
  const TREATY_ALT = { nap: ['non-aggression', 'nonaggression', 'pact'], borders: ['open borders', 'border'], trade: ['trade agreement', 'commerce'],
    research: ['research pact', 'science'], defense: ['defence', 'defensive alliance', 'defensive'], alliance: ['ally'], marriage: ['royal marriage', 'wedding'] };

  class CliErr extends Error { }
  const fail = msg => { throw new CliErr(msg); };

  // ---------------------------------------------------------------
  // text helpers
  // ---------------------------------------------------------------
  const norm = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const fmt = n => {
    n = Math.floor(n || 0); const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
    return String(n);
  };
  const rate = r => (r >= 0 ? '+' : '') + (Math.abs(r) < 10 ? r.toFixed(1) : Math.round(r));
  const fmtTime = sec => {
    sec = Math.max(0, Math.ceil(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m) return `${m}m ${String(x).padStart(2, '0')}s`;
    return `${x}s`;
  };
  const real = (s, gameSec) => fmtTime(gameSec / ((s.settings && s.settings.speed) || 1));
  const plural = (n, w, p) => `${n} ${n === 1 ? w : (p || w + 's')}`;
  const goodName = g => g === 'gold' ? 'Gold' : (DATA.goods[g] ? DATA.goods[g].name : g);
  const costText = cost => Object.entries(cost || {}).filter(([, v]) => v > 0).map(([g, v]) => `${fmt(v)} ${goodName(g).toLowerCase()}`).join(', ') || 'free';
  const unitsText = units => {
    const e = Object.entries(units || {}).filter(([, n]) => n > 0);
    return e.length ? e.map(([u, n]) => `${n} ${DATA.units[u] ? DATA.units[u].name : u}`).join(', ') : 'none';
  };
  // a monospace table: rows of cells; numbers right-aligned
  const table = (head, rows) => {
    const all = head ? [head, ...rows] : rows;
    if (!all.length) return [];
    const w = [];
    for (const r of all) r.forEach((c, i) => { w[i] = Math.max(w[i] || 0, String(c).length); });
    const line = r => r.map((c, i) => { const t = String(c); return /^[+-]?[\d.,]+[kM%]?$/.test(t) ? t.padStart(w[i]) : t.padEnd(w[i]); }).join('  ').replace(/\s+$/, '');
    const out = all.map(line);
    if (head) out.splice(1, 0, w.map(n => '─'.repeat(n)).join('  '));
    return out;
  };
  const lev = (a, b) => {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  };
  const singulars = q => {
    const o = [q];
    if (q.endsWith('men')) o.push(q.slice(0, -3) + 'man');
    if (q.endsWith('ies')) o.push(q.slice(0, -3) + 'y');
    if (q.endsWith('es')) o.push(q.slice(0, -2));
    if (q.endsWith('s')) o.push(q.slice(0, -1));
    return o;
  };

  // ---------------------------------------------------------------
  // fuzzy matching: exact → prefix → word prefixes → substring; a miss suggests near names
  // items: [{ id, name, alt?: [] }] → { hit } | { amb: [items] } | { miss: true, sug: [items] }
  // ---------------------------------------------------------------
  const keysOf = it => it._k || (it._k = [norm(it.id), norm(it.name), ...(it.alt || []).map(norm)].filter(Boolean));
  const match = (raw, items) => {
    const q0 = norm(raw);
    if (!q0) return { miss: true, sug: [] };
    const qs = singulars(q0);
    for (const q of qs) { const ex = items.filter(it => keysOf(it).includes(q)); if (ex.length) return { hit: ex[0] }; }
    for (const q of qs) {
      const pre = items.filter(it => keysOf(it).some(k => k.startsWith(q)));
      if (pre.length === 1) return { hit: pre[0] };
      if (pre.length > 1) return { amb: pre };
    }
    const qw = String(raw).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (qw.length > 1) {
      const wp = items.filter(it => { const nw = String(it.name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); return qw.every(w => nw.some(x => x.startsWith(w))); });
      if (wp.length === 1) return { hit: wp[0] };
      if (wp.length > 1) return { amb: wp };
    }
    if (q0.length >= 3) {
      const sub = items.filter(it => keysOf(it).some(k => k.includes(q0)));
      if (sub.length === 1) return { hit: sub[0] };
      if (sub.length > 1) return { amb: sub };
    }
    const lim = Math.max(1, Math.floor(q0.length / 3));
    const sug = items.map(it => ({ it, d: Math.min(...keysOf(it).map(k => Math.min(lev(q0, k), lev(q0, k.slice(0, q0.length)) + 1))) }))
      .filter(x => x.d <= lim + 1).sort((a, b) => a.d - b.d).slice(0, 3).map(x => x.it);
    return { miss: true, sug };
  };
  // resolve or throw a friendly error
  const pick = (raw, items, what, hint) => {
    const r = match(raw, items);
    if (r.hit) return r.hit;
    if (r.amb) fail(`'${raw}' could be ${r.amb.slice(0, 6).map(x => x.name).join(', ')}${r.amb.length > 6 ? ` (and ${r.amb.length - 6} more)` : ''} — be more specific.`);
    fail(`No ${what} called '${raw}'${r.sug.length ? ` — did you mean ${r.sug.map(x => x.name).join(' or ')}?` : '.'}${hint ? ' ' + hint : ''}`);
  };
  // ranked suggestions for completion (fuzzy: prefix, word prefix, substring, subsequence)
  const rank = (raw, items) => {
    const q = norm(raw);
    if (!q) return items.slice();
    const sc = [];
    for (const it of items) {
      const ks = keysOf(it), nm = String(it.name).toLowerCase();
      let best = 99;
      const prim = [norm(it.id), norm(it.name)];
      for (const k of ks) {
        const alt = prim.includes(k) ? 0 : 0.5;   // a match on the real name beats one on an alias
        if (k === q) best = Math.min(best, 0 + alt);
        else if (k.startsWith(q)) best = Math.min(best, 1 + alt);
        else if (k.includes(q)) best = Math.min(best, 3 + alt);
        else { let i = 0; for (const ch of k) if (ch === q[i]) i++; if (i === q.length) best = Math.min(best, 4 + alt); }
      }
      if (best > 2 && nm.split(/[^a-z0-9]+/).some(w => w && w.startsWith(q))) best = 2;
      if (best < 99) sc.push({ it, best });
    }
    return sc.sort((a, b) => a.best - b.best || String(a.it.name).length - String(b.it.name).length).map(x => x.it);
  };

  // ---------------------------------------------------------------
  // the things a name can refer to
  // ---------------------------------------------------------------
  const raceOf = (s, owner) => (s.empires[owner] || {}).race;
  let raceUnitSet = null;
  const raceLocked = () => {
    if (!raceUnitSet) { raceUnitSet = {}; for (const r of DATA.raceOrder || Object.keys(DATA.races)) for (const u of [...(DATA.races[r].units || []), DATA.races[r].mageUnit].filter(Boolean)) (raceUnitSet[u] = raceUnitSet[u] || []).push(r); }
    return raceUnitSet;
  };
  const E = {
    buildings: (s, owner) => Object.entries(DATA.buildings).filter(([, b]) => !b.race || b.race === raceOf(s, owner)).map(([id, b]) => ({ id, name: b.name, icon: b.icon })),
    units: (s, owner) => Object.entries(DATA.units).filter(([u, d]) => d.at && (!raceLocked()[u] || raceLocked()[u].includes(raceOf(s, owner)))).map(([id, d]) => ({ id, name: d.name, icon: d.icon })),
    allUnits: () => Object.entries(DATA.units).map(([id, d]) => ({ id, name: d.name, icon: d.icon })),
    goods: (s, owner) => (DATA.goodOrder || Object.keys(DATA.goods)).filter(g => !DATA.goods[g].race || DATA.goods[g].race === raceOf(s, owner)).map(id => ({ id, name: DATA.goods[id].name, icon: DATA.goods[id].icon })),
    myCities: (s, owner) => G.citiesOf(s, owner).map(c => ({ id: c.id, name: c.name, c })),
    knownCities: (s, owner) => Object.values(s.cities).filter(c => c.owner === owner || (s.explored && s.explored[c.y * s.map + c.x])).map(c => ({ id: c.id, name: c.name, c })),
    places: (s, owner) => {
      const out = E.knownCities(s, owner);
      for (const mi of Object.values(s.minors || {})) if (s.explored && s.explored[mi.y * s.map + mi.x]) out.push({ id: mi.id, name: mi.name, c: mi });
      return out;
    },
    techs: (s, owner) => Object.keys(DATA.techs).filter(k => G.techForOwner(s, owner, k)).map(id => ({ id, name: DATA.techs[id].name })),
    spells: () => Object.entries(DATA.spells).map(([id, d]) => ({ id, name: d.name, icon: d.icon })),
    knownSpells: (s, owner) => (G.spellsOf ? G.spellsOf(s, owner) : []).map(id => ({ id, name: DATA.spells[id].name, icon: DATA.spells[id].icon })),
    arcana: () => Object.entries(DATA.arcana || {}).map(([id, n]) => ({ id, name: n.name })),
    enchants: () => Object.entries(DATA.enchantments || {}).map(([id, d]) => ({ id, name: d.name, icon: d.icon })),
    traditions: (s, owner) => (G.traditionsFor ? G.traditionsFor(s, owner) : []).map(id => ({ id, name: DATA.traditions[id].name })),
    ceremonies: () => Object.entries(DATA.ceremonies || {}).map(([id, d]) => ({ id, name: d.name, icon: d.icon })),
    realms: (s, owner) => Object.values(s.empires).filter(e => e.id !== owner && !e.dead).map(e => ({ id: e.id, name: e.name, alt: [DATA.races[e.race] && DATA.races[e.race].name, DATA.races[e.race] && DATA.races[e.race].adj].filter(Boolean) })),
    treaties: () => SYM_TREATIES.filter(k => DATA.treatyKinds && DATA.treatyKinds[k]).map(id => ({ id, name: DATA.treatyKinds[id].name, alt: TREATY_ALT[id] || [] })),
    missions: () => (DATA.missionOrder || []).map(id => ({ id, name: DATA.missions[id].name })),
    focus: () => [...(DATA.govFocusOrder || Object.keys(DATA.govFocus || {})).map(id => ({ id, name: DATA.govFocus[id].name })), { id: 'off', name: 'off' }],
    stances: () => (DATA.stanceOrder || Object.keys(DATA.stances || {})).map(id => ({ id, name: DATA.stances[id].name })),
    garStances: () => Object.entries(DATA.garrisonStances || {}).map(([id, d]) => ({ id, name: d.name })),
    generals: (s, owner) => (G.generalsOf ? G.generalsOf(s, owner) : []).map(g => ({ id: g.id, name: g.name, g })),
    magi: (s, owner) => (G.magiOf ? G.magiOf(s, owner) : []).map(g => ({ id: g.id, name: g.name, g })),
    spies: (s, owner) => (G.spiesOf ? G.spiesOf(s, owner) : []).map(g => ({ id: g.id, name: g.name, g })),
    schools: () => Object.entries(DATA.schools || {}).map(([id, d]) => ({ id, name: d.name })),
    heroAttrs: () => Object.entries(DATA.heroAttrs || {}).map(([id, d]) => ({ id, name: d.name || id })),
    taxes: () => ['low', 'normal', 'high'].map(id => ({ id, name: id })),
    tabs: (s, owner, ctx) => (ctx && ctx.tabs && ctx.tabs.length ? ctx.tabs : DEFAULT_TABS.map(id => ({ id, name: id }))).map(t => ({ id: t.id, name: String(t.name).replace(/^[^A-Za-z0-9]+\s*/, '') || t.id, alt: [t.id] })),
  };

  // ---------------------------------------------------------------
  // argument parsing
  // ---------------------------------------------------------------
  // split tokens at keywords: { head: 'text before', in: '…', to: '…', … , mult: n }
  const segs = (tokens, kws) => {
    const out = { head: [] }; let cur = 'head';
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i], tl = t.toLowerCase();
      const mm = /^[x×*](\d+)$/i.exec(t);
      if (kws.includes('x') && mm) { out.mult = +mm[1]; continue; }
      if (kws.includes('x') && (tl === 'x' || tl === '×') && /^\d+$/.test(tokens[i + 1] || '')) { out.mult = +tokens[++i]; continue; }
      if (kws.includes(tl) && tl !== 'x') { cur = tl; out[cur] = out[cur] || []; continue; }
      (out[cur] = out[cur] || []).push(t);
    }
    for (const k of Object.keys(out)) if (Array.isArray(out[k])) out[k] = out[k].join(' ').trim();
    return out;
  };
  const parseXY = t => {
    const m = /^\(?\s*(-?\d+)\s*[, ]\s*(-?\d+)\s*\)?$/.exec(String(t || '').trim());
    return m ? { x: +m[1], y: +m[2] } : null;
  };
  const toks = str => String(str || '').trim().split(/\s+/).filter(Boolean);

  const ensureCity = (s, owner, ctx) => {
    const c = s.cities[ctx.city];
    if (!c || c.owner !== owner) { const cap = G.capital(s, owner); ctx.city = cap ? cap.id : null; }
    return s.cities[ctx.city] || null;
  };
  // an own city by name, or the current one
  const myCity = (s, owner, ctx, raw) => {
    if (!raw) { const c = ensureCity(s, owner, ctx); if (!c) fail('You have no city.'); return c; }
    return pick(raw, E.myCities(s, owner), 'city of yours', "Type 'cities' for the list.").c;
  };
  // a place: x,y, a known city or free city → { x, y, name, city? }
  const place = (s, owner, raw) => {
    if (!raw) fail('Where to? Give a city name or coordinates like 12,5.');
    const xy = parseXY(raw);
    if (xy) {
      const t = G.tileAt(s, xy.x, xy.y);
      if (!t) fail(`(${xy.x}, ${xy.y}) is off the map (it is ${s.map}×${s.map}).`);
      const c = t.city && s.cities[t.city];
      return { x: xy.x, y: xy.y, name: c && (c.owner === owner || s.explored[t.y * s.map + t.x]) ? c.name : `(${xy.x}, ${xy.y})`, city: c || null, tile: t };
    }
    const p = pick(raw, E.places(s, owner), 'known city', 'Use coordinates (x,y) for anywhere else.');
    return { x: p.c.x, y: p.c.y, name: p.name, city: s.cities[p.id] || null, tile: G.tileAt(s, p.c.x, p.c.y) };
  };
  const NONFIELD = ['settlers', 'herald', 'hero', 'scout', 'priest'];
  const isCiv = u => DATA.units[u] && (DATA.units[u].type === 'civ' || DATA.units[u].type === 'hero');
  // units of a city for 'all' (by mission)
  const allFor = (city, mission) => {
    const out = {};
    for (const [u, n] of Object.entries(city.units || {})) {
      const d = DATA.units[u]; if (!d || !(n > 0)) continue;
      if (mission === 'scout') { if (u === 'scout') out[u] = n; continue; }
      if (mission === 'settle') { if (u === 'settlers') out[u] = n; continue; }
      if (mission === 'preach') { if (u === 'priest') out[u] = n; continue; }
      if (mission === 'adventure') { if (u === 'hero') out[u] = n; continue; }
      if (u === 'hero') continue;
      if (mission === 'reinforce') { out[u] = n; continue; }
      if (mission === 'conquer' && u === 'herald') { out[u] = n; continue; }
      if (NONFIELD.includes(u) || isCiv(u) || d.type === 'ship') continue;
      out[u] = n;
    }
    return out;
  };
  // "all" | "5 militia, 3 knights" | "militia" (all of them) | "all knights"
  const parseUnits = (s, owner, city, str, mission) => {
    str = String(str || '').trim();
    if (!str || /^all$/i.test(str)) {
      const u = allFor(city, mission);
      if (!G.unitsCount(u)) fail(`No troops in ${city.name} fit for that (${unitsText(city.units)}).`);
      return u;
    }
    const out = {};
    const here = Object.entries(city.units || {}).filter(([, n]) => n > 0).map(([id]) => ({ id, name: DATA.units[id].name }));
    for (const part of str.split(/\s*(?:,|\band\b|\+)\s*/i).filter(Boolean)) {
      const m = /^(\d+|all|half)\s+(.+)$/i.exec(part) || /^(.+?)\s+(\d+)$/.exec(part);
      let n, name;
      if (m && /^(\d+|all|half)$/i.test(m[1])) { n = m[1].toLowerCase(); name = m[2]; } else if (m) { name = m[1]; n = m[2]; } else { name = part; n = 'all'; }
      const r = match(name, here);
      let u;
      if (r.hit) u = r.hit.id;
      else {
        const any = match(name, E.allUnits());
        if (any.hit) fail(`No ${any.hit.name} in ${city.name}. There: ${unitsText(city.units)}.`);
        pick(name, here.length ? here : E.allUnits(), 'unit');
      }
      const have = city.units[u] || 0;
      const k = n === 'all' ? have : n === 'half' ? Math.floor(have / 2) : parseInt(n, 10);
      if (!(k > 0)) fail(`How many ${DATA.units[u].name}? Give a number, 'half' or 'all'.`);
      if (k > have) fail(`Only ${have} ${DATA.units[u].name} in ${city.name}.`);
      out[u] = (out[u] || 0) + k;
    }
    return out;
  };
  const orders = (s, owner, city, seg, mission) => {
    if (!seg.general && !seg.stance) return null;
    const o = { stance: 'balanced', general: null };
    if (seg.stance) o.stance = pick(seg.stance, E.stances(), 'stance').id;
    if (seg.general) {
      const g = pick(seg.general, E.generals(s, owner), 'general', "Type 'general' for your generals.");
      o.general = g.id;
    }
    return o;
  };
  const lastMove = (s, owner) => { for (let i = s.moves.length - 1; i >= 0; i--) if (s.moves[i].owner === owner) return s.moves[i]; return null; };

  // ---------------------------------------------------------------
  // columns on the road (numbered, remembered in ctx.columns)
  // ---------------------------------------------------------------
  const columnList = (s, owner) => {
    const vis = owner === 'p' && G.visibleSet ? G.visibleSet(s) : null;
    const rows = [];
    for (const m of s.moves) {
      const intel = G.columnIntel ? G.columnIntel(s, owner, m, vis) : { side: m.owner === owner ? 'own' : 'hostile', known: true, exact: m.owner === owner, count: G.unitsCount(m.units), word: '', mission: m.type, dest: true };
      if (m.owner !== owner && !intel.known) continue;
      rows.push({ m, intel });
    }
    const ord = { hostile: 0, neutral: 1, ally: 2, own: 3 };
    return rows.sort((a, b) => (ord[a.intel.side] - ord[b.intel.side]) || (a.m.arrive - b.m.arrive));
  };
  const colById = (s, ctx, raw) => {
    const n = parseInt(String(raw || '').replace(/^#/, ''), 10);
    if (!(n > 0)) fail("Which column? Give its number from 'columns' (e.g. intercept 2).");
    const ids = ctx.columns || [];
    let m = ids[n - 1] && s.moves.find(x => x.id === ids[n - 1]);
    if (!m && !ids.length) { const list = columnList(s, 'p'); ctx.columns = list.map(r => r.m.id); m = list[n - 1] && list[n - 1].m; }
    if (!m) fail(`No column #${n} (any more). Type 'columns' to list them again.`);
    return m;
  };
  const destName = (s, owner, m) => {
    const t = G.tileAt(s, m.x, m.y), c = t && t.city && s.cities[t.city];
    if (c && (c.owner === owner || s.explored[t.y * s.map + t.x])) return c.name;
    return `(${m.x}, ${m.y})`;
  };
  const colLine = (s, owner, r, i) => {
    const m = r.m, it = r.intel, p = G.movePos(s, m);
    const who = m.owner === owner ? 'yours' : (s.empires[m.owner] ? s.empires[m.owner].name : 'wild things');
    const tag = { hostile: '⚔', neutral: '·', ally: '+', own: '★' }[it.side] || '·';
    const size = it.exact ? (m.type === 'trade' && !G.unitsCount(m.units) ? costText(m.cargo) : unitsText(m.units)) : `${it.word}${it.approx ? ` (~${it.lo}-${it.hi})` : ''}`;
    const goal = m.owner === owner || it.dest ? ` → ${destName(s, owner, m)}` : '';
    return `#${i + 1} ${tag} ${who}: ${it.mission}${goal} · ${size} · at (${Math.round(p.x)}, ${Math.round(p.y)}) · arrives in ${real(s, m.arrive - s.time)}`;
  };

  // ---------------------------------------------------------------
  // confirmation
  // ---------------------------------------------------------------
  const confirm = (ctx, text, fn) => { ctx.pending = { text, fn }; return { ok: true, confirm: true, out: [text + ' (y/n)'] }; };

  // ---------------------------------------------------------------
  // descriptions
  // ---------------------------------------------------------------
  const tileText = (s, owner, x, y) => {
    const t = G.tileAt(s, x, y);
    if (!t) fail(`(${x}, ${y}) is off the map.`);
    const i = y * s.map + x, out = [];
    if (!s.explored[i]) return [`(${x}, ${y}): unexplored. Send scouts: scout ${x},${y}`];
    const terr = DATA.terrain[t.terrain] || { name: t.terrain };
    const vis = owner === 'p' && G.visibleSet ? G.visibleSet(s)[i] : 1;
    out.push(`(${x}, ${y}) ${terr.name}${vis ? '' : ' (not in sight now)'}${G.isRiver && G.isRiver(s, x, y) ? ' · river' : ''}${G.roadLevel && G.roadLevel(s, x, y) ? ` · road ${G.roadLevel(s, x, y)}` : ''}${G.bridgeAt && G.bridgeAt(s, x, y) ? ' · bridge' : ''}`);
    const c = t.city && s.cities[t.city];
    if (c) {
      const e = s.empires[c.owner];
      out.push(`${c.name}: ${c.owner === owner ? 'your city' : `city of the ${e ? e.name : 'unknown'}`} · ${G.tier(c).name} · Town Hall ${G.lvl(c, 'townhall')}${c.owner === owner ? ` · ${fmt(c.pop)} people · troops: ${unitsText(c.units)}` : ''}`);
      if (c.owner !== owner && e) out.push(`Relations: ${G.rel(s, c.owner).status}, opinion ${Math.round(G.rel(s, c.owner).opinion)}`);
      const intel = s.intel && s.intel[i];
      if (c.owner !== owner && intel) out.push(`Scouted ${real(s, s.time - intel.t)} ago: ${unitsText(intel.units)}${intel.wall !== undefined ? ` · wall ${intel.wall}` : ''}`);
    }
    if (t.minor && s.minors && s.minors[t.minor]) out.push(`${s.minors[t.minor].name}: a free city`);
    if (t.camp && s.camps[t.camp]) out.push(`Brigand camp, tier ${s.camps[t.camp].tier}. Raid it: send all to ${x},${y} raid`);
    if (t.oasis) out.push(`Oasis: +25% ${goodName(t.oasis.bonus)}${t.oasis.owner && s.cities[t.oasis.owner] ? `, held by ${s.cities[t.oasis.owner].name}` : ''}`);
    if (t.ruin) out.push(`Ruins${t.ruin.readyAt > s.time ? ' (recently plundered)' : ''}. Send the hero: hero adventure ${x},${y}`);
    const cur = G.citiesOf(s, owner).sort((a, b) => G.dist(a, t) - G.dist(b, t))[0];
    if (cur && !(c && c.id === cur.id)) out.push(`${G.dist(cur, t).toFixed(1)} tiles from ${cur.name}`);
    return out;
  };
  const reportLines = (s, r) => {
    const b = r.body || {}, out = [`${r.title}  [${r.kind}]`];
    if (b.adventure) {
      out.push(`${b.success ? 'The hero returned victorious.' : 'The hero was driven back.'} Wounds −${b.dmg} health, +${b.xp} experience.`);
      if (b.loot && Object.keys(b.loot).length) out.push('Treasure: ' + costText(b.loot));
      if (b.item) out.push(`Found: ${b.item.name}`);
    } else if (b.scout) {
      if (b.failed) out.push(b.extra || 'The scouts were caught.');
      else if (b.intel) { out.push('Troops: ' + unitsText(b.intel.units)); if (b.intel.res) out.push('Stores: ' + costText(b.intel.res)); if (b.intel.wall !== undefined) out.push(`Wall ${b.intel.wall} · Town Hall ${b.intel.th} · Loyalty ${b.intel.loyalty}%`); }
    } else if (b.attSent) {
      out.push(...table(['', `Attacker: ${b.att}`, `Defender: ${b.def}`], [
        ['Strength', fmt(b.A), fmt(b.D)], ['Troops', unitsText(b.attSent), unitsText(b.defHad)], ['Losses', unitsText(b.attLost), unitsText(b.defLost)]]));
      if (b.loot && Object.keys(b.loot).length) out.push('Plunder: ' + costText(b.loot));
    }
    if (b.extra && !(b.scout && b.failed)) out.push(b.extra);
    if (typeof b === 'string') out.push(b);
    return out;
  };

  // ---------------------------------------------------------------
  // the grammar
  // ---------------------------------------------------------------
  const C = [];
  const def = o => { C.push(o); return o; };
  const kwCity = ['in'];

  // ---- navigation ----
  def({ name: 'help', aliases: ['?', 'h', 'commands'], group: 'Navigation', usage: 'help [command]', help: 'List every command, or explain one.',
    args: [['command']],
    run(s, owner, a, ctx) {
      if (a.rest) {
        const c = findCmd(a.rest.split(/\s+/)[0], ctx, s, owner, true);
        if (!c) fail(`No command '${a.rest}'. Type 'help' for the list.`);
        return [`${c.usage}`, `  ${c.help}`, ...(c.aliases && c.aliases.length ? [`  Also: ${c.aliases.join(', ')}`] : []), ...(c.ex || []).map(e => '  e.g. ' + e)];
      }
      const out = ['Commands (type help <command> for more; Tab completes; ↑/↓ history; ; chains):'];
      for (const g of GROUPS) {
        out.push(`${g}:`);
        out.push(...C.filter(c => c.group === g).map(c => c.usage.length <= 40 ? `  ${c.usage.padEnd(40)} ${c.help}` : `  ${c.usage}\n  ${''.padEnd(40)} ${c.help}`));
      }
      out.push('Any tab name on its own opens it (world, research, magic, military…).');
      return out;
    } });
  def({ name: 'city', aliases: ['goto', 'cd'], group: 'Navigation', usage: 'city <name>', help: 'Switch to one of your cities (alone: open the City tab).', args: [['myCity']], tab: 'city',
    run(s, owner, a, ctx) {
      if (!a.rest) return { out: [`In ${myCity(s, owner, ctx).name}.`], nav: { tab: 'city' } };
      const c = myCity(s, owner, ctx, a.rest); ctx.city = c.id;
      return { out: [`Now in ${c.name} (${c.x}, ${c.y}).`], nav: { city: c.id } };
    } });
  def({ name: 'tab', aliases: ['open', 'view'], group: 'Navigation', usage: 'tab <name>', help: 'Open a tab (or type the tab name alone).', args: [['tab']],
    run(s, owner, a, ctx) {
      if (!a.rest) return ['Tabs: ' + E.tabs(s, owner, ctx).map(t => t.id).join(', ')];
      const t = pick(a.rest, E.tabs(s, owner, ctx), 'tab');
      return { out: [`→ ${t.name}`], nav: { tab: t.id } };
    } });
  const cycle = dir => (s, owner, a, ctx) => {
    const list = G.citiesOf(s, owner); const cur = ensureCity(s, owner, ctx);
    if (list.length < 2) return [`${cur.name} is your only city.`];
    const i = Math.max(0, list.findIndex(c => c.id === cur.id));
    const c = list[(i + dir + list.length) % list.length]; ctx.city = c.id;
    return { out: [`Now in ${c.name}.`], nav: { city: c.id } };
  };
  def({ name: 'next', aliases: [']'], group: 'Navigation', usage: 'next', help: 'Next city.', run: cycle(1) });
  def({ name: 'prev', aliases: ['previous', '['], group: 'Navigation', usage: 'prev', help: 'Previous city.', run: cycle(-1) });
  def({ name: 'show', aliases: ['go', 'look', 'center'], group: 'Navigation', usage: 'show <x,y|city>', help: 'Open the world map on a place and select it.', args: [['place']],
    run(s, owner, a) { const p = place(s, owner, a.rest); return { out: tileText(s, owner, p.x, p.y), nav: { tab: 'world', sel: { x: p.x, y: p.y } } }; } });
  def({ name: 'clear', aliases: ['cls'], group: 'Navigation', usage: 'clear', help: 'Clear the console.', run: () => ({ out: [], nav: { clear: true } }) });
  def({ name: 'close', aliases: ['exit', 'quit', 'q'], group: 'Navigation', usage: 'close', help: 'Close the console (Esc).', run: () => ({ out: [], nav: { close: true } }) });

  // ---- economy ----
  def({ name: 'status', aliases: ['st', 'info', 'me'], group: 'Economy', usage: 'status [city]', help: 'Realm and city at a glance.', args: [['myCity']],
    run(s, owner, a, ctx) {
      const emp = s.empires[owner], c = myCity(s, owner, ctx, a.rest), e = G.econ(s, c);
      const gold = G.citiesOf(s, owner).reduce((t, x) => { const ce = G.econ(s, x); return t + ce.tax - (ce.wages || 0); }, 0);
      const next = G.nextCityRenown ? G.nextCityRenown(s, owner) : Infinity;
      const se = G.season ? G.season(s) : null;
      const out = [`${emp.name} (${DATA.races[emp.race].name}) · ${se ? `${se.name}, Year ${se.year} · ` : ''}gold ${fmt(emp.gold)} (${rate(gold)}/min) · renown ${G.renown(s, owner)}${next !== Infinity ? '/' + next : ''} · ${plural(G.citiesOf(s, owner).length, 'city', 'cities')} · speed ${s.settings.speed}×`];
      out.push(`${c.name} (${c.x}, ${c.y}) · ${G.tier(c).name} · ${fmt(c.pop)}/${e.civCap} people · workers ${Math.round(e.eff * 100)}% · storage ${fmt(e.cap)}`);
      out.push(...resTable(s, owner, c, e));
      const q = c.buildQueue.map(x => `${DATA.buildings[x.type].name} ${x.level}`);
      out.push(`Building: ${q.length ? q.join(', ') + ` (next in ${real(s, c.buildQueue[0].end - s.time)})` : 'nothing — try: build <building>'}`);
      const tr = Object.values(c.train || {}).flat().filter(x => x && x.left > 0).map(x => `${x.left} ${DATA.units[x.unit].name}`);
      if (tr.length) out.push('Training: ' + tr.join(', '));
      out.push('Troops: ' + unitsText(c.units));
      return out;
    } });
  const resTable = (s, owner, c, e) => {
    const goods = E.goods(s, owner).map(g => g.id).filter(g => g !== 'mana' || (c.res.mana || 0) > 0 || (e.net.mana || 0));
    return table(['Good', 'Stock', 'Cap', 'Net/min'], goods.map(g => [DATA.goods[g].name + (c.short && c.short[g] ? ' !' : ''), fmt(c.res[g] || 0), fmt(e.cap), rate(e.net[g] || 0)]));
  };
  def({ name: 'cities', aliases: ['ls', 'list'], group: 'Economy', usage: 'cities', help: 'Your cities: size, works, troops, governor.',
    run(s, owner, a, ctx) {
      const cur = ensureCity(s, owner, ctx);
      return table(['', 'City', 'At', 'Tier', 'People', 'Queue', 'Troops', 'Governor'], G.citiesOf(s, owner).map(c => {
        const g = G.govOf && G.govOf(s, c.id);
        return [c.id === cur.id ? '>' : '', c.name, `${c.x},${c.y}`, G.tier(c).name, fmt(c.pop), c.buildQueue.length, G.unitsCount(c.units), g ? DATA.govFocus[g.focus].name : '-'];
      }));
    } });
  def({ name: 'res', aliases: ['resources', 'goods', 'r'], group: 'Economy', usage: 'res [good] [in city]', help: 'Stocks, or where a good comes from and goes.', args: [['good'], ['in', 'myCity']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, kwCity), c = myCity(s, owner, ctx, sg.in), e = G.econ(s, c);
      if (!sg.head) return [`${c.name}:`, ...resTable(s, owner, c, e)];
      const isGold = /^gold$/i.test(sg.head);
      const g = isGold ? 'gold' : pick(sg.head, E.goods(s, owner), 'good').id;
      const parts = (G.econParts(s, c, e)[g] || []).filter(p => Math.abs(p.amount) >= 0.005);
      const prod = parts.filter(p => p.amount > 0).sort((x, y) => y.amount - x.amount), used = parts.filter(p => p.amount < 0).sort((x, y) => x.amount - y.amount);
      const net = isGold ? e.tax - (e.wages || 0) : (e.net[g] || 0);
      const out = [`${goodName(g)} in ${c.name}: ${isGold ? fmt(s.empires[owner].gold) + ' in the treasury' : fmt(c.res[g] || 0) + '/' + fmt(e.cap)} · net ${rate(net)}/min`];
      if (prod.length) out.push('Produced:', ...table(null, prod.map(p => ['  ' + p.label, rate(p.amount)])));
      else out.push('Nothing makes this here.');
      if (used.length) out.push('Used:', ...table(null, used.map(p => ['  ' + p.label, rate(p.amount)])));
      if (c.short && c.short[g] && G.SHORT_TEXT) out.push('Shortage: ' + (G.SHORT_TEXT[g] || ''));
      return out;
    } });
  def({ name: 'build', aliases: ['b', 'upgrade'], group: 'Economy', usage: 'build <building> [in <city>] [xN]', help: 'Queue a building or its next level(s). Alone: what can be built.',
    args: [['building'], ['in', 'myCity']], ex: ['build farm', 'build lumber camp x3', 'build town hall in Oakford'],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, ['in', 'x']), c = myCity(s, owner, ctx, sg.in);
      if (!sg.head) {
        const rows = E.buildings(s, owner).map(b => ({ b, st: G.buildStatus(s, c, b.id) })).filter(x => !x.st.hidden && !x.st.maxed && !x.st.locked);
        return [`Buildable in ${c.name} (✓ = affordable now):`, ...table(['', 'Building', 'Lv', 'Cost', 'Time', 'Note'], rows.map(({ b, st }) => [st.ok ? '✓' : ' ', b.name, st.level, costText(st.cost), real(s, st.time), st.ok ? '' : st.reason]))];
      }
      const b = pick(sg.head, E.buildings(s, owner), 'building', "Type 'build' for what you can build.");
      const n = Math.max(1, Math.min(20, sg.mult || 1));
      let done = 0, err = null;
      for (let i = 0; i < n; i++) { err = G.queueBuild(s, c.id, b.id); if (err) break; done++; }
      if (!done) fail(`${b.name} in ${c.name}: ${err}`);
      const last = c.buildQueue[c.buildQueue.length - 1];
      return [`🔨 ${b.name}${done > 1 ? ` ×${done}` : ''} queued in ${c.name} → level ${last.level}, done in ${real(s, last.end - s.time)}.${err ? ` Stopped after ${done}: ${err}.` : ''}`];
    } });
  def({ name: 'queue', aliases: ['works'], group: 'Economy', usage: 'queue [in city] · queue cancel <n> · queue move <n> up|down|top', help: 'Show or reorder the works under way.', args: [['queueSub'], ['in', 'myCity']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, kwCity), c = myCity(s, owner, ctx, sg.in), t = toks(sg.head), sub = (t[0] || '').toLowerCase();
      const q = c.buildQueue;
      if (sub === 'cancel' || sub === 'rm' || sub === 'del') {
        const i = parseInt(t[1], 10) - 1;
        if (!q[i]) fail(`No work #${t[1] || '?'} in ${c.name}. Type 'queue' to see the numbers.`);
        const it = q[i], started = it.start <= s.time;
        G.cancelBuild(s, c.id, i);
        return [`Cancelled ${DATA.buildings[it.type].name} ${it.level} in ${c.name} (${started ? '50%' : 'all'} of the goods refunded).`];
      }
      if (sub === 'move' || sub === 'mv') {
        const i = parseInt(t[1], 10) - 1, how = (t[2] || '').toLowerCase();
        if (!q[i]) fail(`No work #${t[1] || '?'} in ${c.name}.`);
        let j = how === 'up' ? i - 1 : how === 'down' ? i + 1 : how === 'top' || how === 'first' ? 0 : how === 'bottom' || how === 'last' ? q.length - 1 : parseInt(how, 10) - 1;
        if (!(j >= 0)) fail('Move it where? up, down, top, bottom or a position.');
        j = Math.min(q.length - 1, j);
        if (i === j) return ['Nothing to move.'];
        const it = q[i];
        const e = G.moveBuild(s, c.id, i, j);
        if (e) fail(e + '.');
        return [`Moved ${DATA.buildings[it.type].name} ${it.level} to #${j + 1}.`, ...queueLines(s, c)];
      }
      if (sub) fail("queue: use 'queue', 'queue cancel <n>' or 'queue move <n> up|down|top'.");
      return queueLines(s, c);
    } });
  const queueLines = (s, c) => {
    const out = [`Works in ${c.name}:`];
    if (!c.buildQueue.length) out.push('  (none)');
    c.buildQueue.forEach((x, i) => out.push(`  #${i + 1} ${DATA.buildings[x.type].name} ${x.level} · ${x.start <= s.time ? 'building, ' : ''}done in ${real(s, x.end - s.time)}`));
    for (const [b, list] of Object.entries(c.train || {})) for (const x of list || []) if (x.left > 0) out.push(`  🛡 ${x.left} ${DATA.units[x.unit].name} at the ${DATA.buildings[b] ? DATA.buildings[b].name : b}`);
    if (c.forge) out.push(`  ⚒ ${DATA.units[c.forge.unit].name} ${c.forge.kind === 'a' ? 'weapons' : 'armour'} → ${c.forge.level}, ${real(s, c.forge.end - s.time)}`);
    return out;
  };
  def({ name: 'demolish', aliases: ['raze', 'tear'], group: 'Economy', usage: 'demolish <building> [in city]', help: 'Tear down one level of a building (a quarter of its goods salvaged; asks first).', args: [['building'], ['in', 'myCity']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, kwCity), c = myCity(s, owner, ctx, sg.in);
      if (!sg.head) fail('Demolish what? e.g. demolish farm');
      const b = pick(sg.head, E.buildings(s, owner), 'building');
      const L = G.lvl(c, b.id);
      if (!L) fail(`${c.name} has no ${b.name}.`);
      if (b.id === 'townhall') fail('The Town Hall cannot be torn down.');
      if (c.buildQueue.some(x => x.type === b.id)) fail(`${b.name} has works queued in ${c.name}; cancel them first (queue cancel <n>).`);
      return confirm(ctx, `Tear down ${b.name} ${L} → ${L - 1} in ${c.name}? A quarter of its goods is salvaged.`, () => {
        if (G.lvl(c, b.id) !== L || c.owner !== owner) return ['Things changed; nothing torn down.'];
        const e = G.demolish(s, c.id, b.id);
        if (e) fail(e + '.');
        return [`🏚️ ${b.name} in ${c.name} is now level ${L - 1}.`];
      });
    } });
  const tradeRun = dir => (s, owner, a, ctx) => {
    const sg = segs(a.tokens, kwCity), c = myCity(s, owner, ctx, sg.in), t = toks(sg.head);
    let n = null, gtoks = [];
    for (const x of t) { if (n === null && /^\d+k?$/i.test(x)) n = /k$/i.test(x) ? parseInt(x, 10) * 1000 : parseInt(x, 10); else gtoks.push(x); }
    if (!gtoks.length) fail(`${dir} what? e.g. trade ${dir} 100 grain`);
    const g = pick(gtoks.join(' '), E.goods(s, owner).filter(x => x.id !== 'mana'), 'good');
    if (n === null) n = 100;
    const before = s.empires[owner].gold;
    const msg = G.trade(s, c.id, g.id, n, dir);
    const after = s.empires[owner].gold;
    if (after === before) fail(msg || 'The market would not deal.');
    return [msg || `${dir === 'buy' ? 'Bought' : 'Sold'} ${n} ${g.name}: ${after > before ? '+' : '−'}${fmt(Math.abs(after - before))} gold.`];
  };
  def({ name: 'trade', aliases: ['market'], group: 'Economy', usage: 'trade buy|sell <n> <good> [in city]', help: 'Buy or sell at the market. Alone: the rates.', args: [['buySell'], ['n'], ['good'], ['in', 'myCity']],
    ex: ['trade sell 200 timber', 'trade buy 50 iron in Oakford'],
    run(s, owner, a, ctx) {
      const t = a.tokens, d = (t[0] || '').toLowerCase();
      if (d === 'buy' || d === 'sell') return tradeRun(d)(s, owner, { ...a, tokens: t.slice(1), rest: t.slice(1).join(' ') }, ctx);
      const sg = segs(t, kwCity), c = myCity(s, owner, ctx, sg.in);
      if (sg.head) fail("trade: say 'trade buy <n> <good>' or 'trade sell <n> <good>'.");
      if (G.lvl(c, 'market') < 1) return [`${c.name} has no Market. build market`];
      return [`Market of ${c.name} (gold per unit):`, ...table(['Good', 'Stock', 'Sell', 'Buy'], E.goods(s, owner).filter(g => g.id !== 'mana').map(g => { const r = G.marketRates(s, c, g.id); return [g.name, fmt(c.res[g.id] || 0), r.sell.toFixed(2), r.buy.toFixed(2)]; }))];
    } });
  def({ name: 'buy', group: 'Economy', usage: 'buy <n> <good> [in city]', help: 'Buy goods at the market.', args: [['n'], ['good'], ['in', 'myCity']], run: tradeRun('buy') });
  def({ name: 'sell', group: 'Economy', usage: 'sell <n> <good> [in city]', help: 'Sell goods at the market.', args: [['n'], ['good'], ['in', 'myCity']], run: tradeRun('sell') });
  def({ name: 'caravan', aliases: ['ship', 'deliver'], group: 'Economy', usage: 'caravan <n good, …> to <city> [from city]', help: 'Send goods by caravan.', args: [['cargo'], ['to', 'place'], ['from', 'myCity']],
    ex: ['caravan 200 grain, 100 timber to Oakford'],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, ['to', 'from']), from = myCity(s, owner, ctx, sg.from), dest = place(s, owner, sg.to);
      if (!sg.head) fail('Send what? e.g. caravan 200 grain to Oakford');
      const cargo = {};
      for (const part of sg.head.split(/\s*(?:,|\band\b|\+)\s*/i).filter(Boolean)) {
        const m = /^(\d+)\s+(.+)$/.exec(part) || /^(.+?)\s+(\d+)$/.exec(part);
        if (!m) fail(`'${part}': give an amount and a good, like 200 grain.`);
        const [n, name] = /^\d+$/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
        const g = pick(name, E.goods(s, owner), 'good');
        cargo[g.id] = (cargo[g.id] || 0) + n;
      }
      const err = G.sendArmy(s, from.id, dest.x, dest.y, 'trade', {}, cargo);
      if (err) fail(err);
      const m = lastMove(s, owner);
      return [`🐪 Caravan from ${from.name} to ${dest.name}: ${costText(cargo)}, arrives in ${real(s, m.arrive - s.time)}.`];
    } });
  def({ name: 'supply', aliases: ['autosupply'], group: 'Economy', usage: 'supply [on|off|recommend]', help: 'Realm supply lines that move surplus goods to cities that lack them.', args: [['onOff']],
    run(s, owner, a) {
      if (!G.logistics) fail('Supply lines are not available.');
      const o = G.logistics(s, owner), w = (a.tokens[0] || '').toLowerCase();
      if (!w) return [`Supply lines are ${o.on ? 'ON' : 'off'}. Goods: ${Object.entries(o.goods || {}).filter(([, p]) => p.on).map(([g]) => goodName(g)).join(', ') || 'none chosen'}.`];
      if (w === 'recommend' || w === 'auto') { G.supplyRecommend(s, owner); return ['Supply lines set: about ten minutes of upkeep goods everywhere.']; }
      if (w === 'on') { if (!Object.values(o.goods || {}).some(p => p.on)) G.supplyRecommend(s, owner); else G.setSupplyRealm(s, owner, { on: true }); return ['🔄 Supply lines on: surplus goods travel to the cities that lack them.']; }
      if (w === 'off') { G.setSupplyRealm(s, owner, { on: false }); return ['Supply lines off: your cities keep what they make.']; }
      fail("supply: on, off or recommend.");
    } });
  def({ name: 'governor', aliases: ['gov'], group: 'Economy', usage: 'governor [city|all] <focus|off> [realm on|off]', help: 'Hand a city to a governor (focus: balanced, growth, production, military, faith, magic).',
    args: [['govFirst'], ['focus'], ['realm', 'onOff']], ex: ['governor Oakford growth', 'governor all off', 'governor production realm off'],
    run(s, owner, a, ctx) {
      if (!G.setGovernor) fail('Governors are not available.');
      const sg = segs(a.tokens, ['realm']), t = toks(sg.head);
      if (!t.length && !sg.realm) {
        return ['Governors:', ...table(['City', 'Focus', 'Realm needs'], G.citiesOf(s, owner).map(c => { const g = G.govOf(s, c.id); return [c.name, g ? DATA.govFocus[g.focus].name : 'off (yours)', g ? (g.realm ? 'on' : 'off') : '']; }))];
      }
      let focus = null, cityRaw = t.join(' ');
      if (t.length) {
        const r = match(t[t.length - 1], E.focus());
        if (r.hit && (t.length > 1 || !match(t[0], E.myCities(s, owner)).hit || norm(t[0]) === r.hit.id)) { focus = r.hit.id; cityRaw = t.slice(0, -1).join(' '); }
      }
      const cities = /^all$/i.test(cityRaw) ? G.citiesOf(s, owner) : [myCity(s, owner, ctx, cityRaw)];
      const cfg = {};
      if (focus) cfg.focus = focus;
      if (sg.realm) { if (!/^(on|off|yes|no)$/i.test(sg.realm)) fail('realm on|off'); cfg.realm = /^(on|yes)$/i.test(sg.realm); }
      if (!Object.keys(cfg).length) fail(`Which focus? ${E.focus().map(f => f.id).join(', ')}`);
      for (const c of cities) { const e = G.setGovernor(s, c.id, cfg); if (e) fail(`${c.name}: ${e}`); }
      const names = cities.map(c => c.name).join(', ');
      return [focus === 'off' ? `${names}: back in your hands.` : `${focus ? DATA.govFocus[focus].name + ' governor' : 'Governor'} in ${names}${cfg.realm !== undefined ? ` · realm needs ${cfg.realm ? 'on' : 'off'}` : ''}.`];
    } });
  def({ name: 'tax', aliases: ['taxes'], group: 'Economy', usage: 'tax [low|normal|high] [in city|all]', help: 'Tax policy: more gold or happier people.', args: [['tax'], ['in', 'myCityOrAll']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, kwCity);
      if (!sg.head) return ['Tax policy:', ...table(['City', 'Policy', 'Happiness'], G.citiesOf(s, owner).map(c => [c.name, c.taxPolicy || 'normal', G.happyOf ? Math.round(G.happyOf(c)) : '']))];
      const p = pick(sg.head, E.taxes(), 'tax policy').id;
      const cities = /^all$/i.test(sg.in || '') ? G.citiesOf(s, owner) : [myCity(s, owner, ctx, sg.in)];
      for (const c of cities) { const e = G.setTaxPolicy(s, c.id, p); if (e) fail(e); }
      return [`Taxes ${p} in ${cities.map(c => c.name).join(', ')}.`];
    } });
  def({ name: 'placate', aliases: ['calm'], group: 'Economy', usage: 'placate [city]', help: 'Pay gold to calm an unhappy city.', args: [['myCity']],
    run(s, owner, a, ctx) { const c = myCity(s, owner, ctx, a.rest); const e = G.placate(s, c.id); if (e) fail(e); return [`The people of ${c.name} are calmed.`]; } });
  def({ name: 'rename', group: 'Economy', usage: 'rename <new name>', help: 'Rename the current city.',
    run(s, owner, a, ctx) { const c = myCity(s, owner, ctx); const n = a.rest.trim().slice(0, 30); if (!n) fail('rename <new name>'); const o = c.name; c.name = n; return [`${o} is now ${n}.`]; } });

  // ---- military ----
  def({ name: 'train', aliases: ['t', 'recruit'], group: 'Military', usage: 'train <n|max> <unit> [in city]', help: 'Train troops. Alone: what can be trained.', args: [['n'], ['unit'], ['in', 'myCity']],
    ex: ['train 5 militia', 'train max pikemen in Oakford'],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, kwCity), c = myCity(s, owner, ctx, sg.in), t = toks(sg.head);
      if (!t.length) {
        const rows = E.units(s, owner).map(u => ({ u, st: G.trainStatus(s, c, u.id) })).filter(x => !x.st.locked && x.st.ok !== undefined && DATA.units[x.u.id].at);
        if (!rows.some(x => x.st.ok)) return [`Nothing can be trained in ${c.name} yet: build a Barracks (militia, scouts) or a Stable.`];
        return [`Trainable in ${c.name}:`, ...table(['Unit', 'Max', 'Cost each', 'Time each'], rows.filter(x => x.st.ok).map(({ u, st }) => [u.name, st.max, costText(st.cost), real(s, st.time)]))];
      }
      let n = null; const rest = [];
      for (const x of t) { if (n === null && /^(\d+|max|all)$/i.test(x)) n = x.toLowerCase(); else rest.push(x); }
      if (!rest.length) fail('Train what? e.g. train 5 militia');
      const u = pick(rest.join(' '), E.units(s, owner), 'unit you can train', "Type 'train' for the list.");
      const st = G.trainStatus(s, c, u.id);
      if (!st.ok) fail(`${u.name} in ${c.name}: ${st.reason}`);
      const k = n === null ? 1 : (n === 'max' || n === 'all') ? st.max : parseInt(n, 10);
      if (!(k > 0)) fail(`${c.name} cannot afford any ${u.name} right now.`);
      const err = G.queueTrain(s, c.id, u.id, k);
      if (err) fail(`${u.name}: ${err}`);
      return [`🛡 Training ${k} ${u.name} in ${c.name} (${real(s, st.time * k)}).`];
    } });
  def({ name: 'troops', aliases: ['garrison', 'army'], group: 'Military', usage: 'troops [city]', help: 'Troops in a city (and garrison stance).', args: [['myCity']],
    run(s, owner, a, ctx) {
      const c = myCity(s, owner, ctx, a.rest);
      const rows = Object.entries(c.units).filter(([, n]) => n > 0).map(([u, n]) => { const d = G.unitStats(s, owner, u); return [d.name, n, fmt(d.atk * n), fmt((d.defI + d.defC) / 2 * n)]; });
      return [`${c.name}${G.garrisonStanceOf ? ` · stance ${DATA.garrisonStances[G.garrisonStanceOf(c)].name}` : ''}:`, ...(rows.length ? table(['Unit', 'Count', 'Attack', 'Defense'], rows) : ['  no troops'])];
    } });
  def({ name: 'dismiss', aliases: ['disband'], group: 'Military', usage: 'dismiss <n> <unit> [in city]', help: 'Send troops back to work as citizens (asks first).', args: [['n'], ['unitHere'], ['in', 'myCity']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, kwCity), c = myCity(s, owner, ctx, sg.in);
      const u = parseUnits(s, owner, c, sg.head, 'reinforce');
      const [k, n] = Object.entries(u)[0] || [];
      if (!k) fail('Dismiss what? e.g. dismiss 10 militia');
      return confirm(ctx, `Dismiss ${n} ${DATA.units[k].name} in ${c.name}? They go back to work for good.`, () => {
        const e = G.dismiss(s, c.id, k, n); if (e) fail(e);
        return [`${n} ${DATA.units[k].name} returned to work in ${c.name}.`];
      });
    } });
  const sendRun = forced => (s, owner, a, ctx) => {
    const tokens = [];
    let mission = forced || null;
    for (const t of a.tokens) { const m = MISSIONS[t.toLowerCase()]; if (m && !forced) mission = m; else tokens.push(t); }
    const sg = segs(tokens, ['from', 'to', 'general', 'stance']);
    if (!sg.to) fail(`Where to? e.g. ${forced === 'reinforce' ? 'move all to Oakford' : 'send 20 militia to 12,5 raid'}`);
    const from = myCity(s, owner, ctx, sg.from), dest = place(s, owner, sg.to);
    if (!mission) {
      if (dest.city && dest.city.owner === owner) mission = 'reinforce';
      else if (dest.tile && dest.tile.ruin && /hero/i.test(sg.head)) mission = 'adventure';
      else if (dest.tile && !s.explored[dest.y * s.map + dest.x]) mission = 'scout';
      else mission = 'raid';
    }
    const units = parseUnits(s, owner, from, sg.head, mission);
    const o = orders(s, owner, from, sg, mission);
    const err = o && G.sendArmyWith ? G.sendArmyWith(s, from.id, dest.x, dest.y, mission, units, undefined, o) : G.sendArmy(s, from.id, dest.x, dest.y, mission, units);
    if (err) fail(err);
    const m = lastMove(s, owner);
    return [`🚩 ${unitsText(units)} march from ${from.name} to ${dest.name} (${G.missionName ? G.missionName(mission) : mission})${o && o.general ? ` under ${G.generalById(s, owner, o.general).name}` : ''}${o && o.stance !== 'balanced' ? `, ${DATA.stances[o.stance].name.toLowerCase()}` : ''}; arrives in ${real(s, m.arrive - s.time)}.`];
  };
  def({ name: 'send', aliases: ['march', 'attack', 'raid'], group: 'Military', usage: 'send <n unit,…|all> [from city] to <city|x,y> [mission] [general <name>] [stance <s>]',
    help: 'March troops. Missions: attack raid conquer reinforce scout settle adventure preach.', args: [['units'], ['from', 'myCity'], ['to', 'place'], ['mission'], ['general', 'general'], ['stance', 'stance']],
    ex: ['send all from Hearthstead to Oakford reinforce', 'send 30 militia, 10 knights to 14,9 attack general Bera stance aggressive'],
    run(s, owner, a, ctx) {
      const w = a.cmdWord;
      if (w === 'attack' || w === 'raid') return sendRun(null)(s, owner, { ...a, tokens: [...a.tokens, w] }, ctx);
      return sendRun(null)(s, owner, a, ctx);
    } });
  def({ name: 'move', aliases: ['reinforce', 'transfer'], group: 'Military', usage: 'move <n unit,…|all> [from city] to <city>', help: 'Move troops between your own cities.', args: [['units'], ['from', 'myCity'], ['to', 'myCity']],
    run: sendRun('reinforce') });
  def({ name: 'scout', aliases: ['spyon'], group: 'Map', usage: 'scout <x,y|city> [n] [from city]', help: 'Send scouts to look at a place.', args: [['place'], ['from', 'myCity']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, ['from']), t = toks(sg.head);
      let n = null;
      if (t.length > 1 && /^\d+$/.test(t[t.length - 1]) && !parseXY(t.slice(-2).join(' '))) n = +t.pop();
      const from = myCity(s, owner, ctx, sg.from), dest = place(s, owner, t.join(' '));
      const have = from.units.scout || 0;
      if (!have) fail(`No scouts in ${from.name}. train 3 scouts`);
      const k = Math.min(have, n || Math.min(3, have));
      const err = G.sendArmy(s, from.id, dest.x, dest.y, 'scout', { scout: k });
      if (err) fail(err);
      return [`🦅 ${k} scout${k > 1 ? 's' : ''} ride from ${from.name} to ${dest.name}; back with news in about ${real(s, (lastMove(s, owner).arrive - s.time) * 2)}.`];
    } });
  def({ name: 'settle', aliases: ['found'], group: 'Military', usage: 'settle <x,y> [from city]', help: 'Send settlers to found a new city.', args: [['place'], ['from', 'myCity']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, ['from']), from = myCity(s, owner, ctx, sg.from), dest = place(s, owner, sg.head);
      const n = from.units.settlers || 0;
      if (!n) fail(`No settlers in ${from.name}. They are trained at a Town Hall 5: train 1 settlers`);
      const err = G.sendArmy(s, from.id, dest.x, dest.y, 'settle', { settlers: n });
      if (err) fail(err);
      return [`🏕 Settlers leave ${from.name} for ${dest.name}; they arrive in ${real(s, lastMove(s, owner).arrive - s.time)}.`];
    } });
  def({ name: 'columns', aliases: ['armies', 'moves', 'marches', 'cols'], group: 'Military', usage: 'columns', help: 'Columns on the road you can see, numbered (for intercept and recall).',
    run(s, owner, a, ctx) {
      const list = columnList(s, owner);
      ctx.columns = list.map(r => r.m.id);
      if (!list.length) return ['No columns on the road that you can see.'];
      return ['⚔ hostile · neutral + allied ★ yours', ...list.map((r, i) => colLine(s, owner, r, i))];
    } });
  def({ name: 'intercept', aliases: ['ic', 'meet'], group: 'Military', usage: 'intercept <#> [from city] [units|all] [general <name>] [stance <s>]', help: 'Ride out to meet a column on the road (number from columns).',
    args: [['column'], ['from', 'myCity']], ex: ['intercept 1', 'intercept 2 from Oakford 40 knights'],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, ['from', 'general', 'stance']), t = toks(sg.head);
      const m = colById(s, ctx, t.shift());
      if (m.owner === owner) fail('That is your own column. recall it instead.');
      const pickUnits = c => {
        if (t.length && !/^all$/i.test(t.join(' '))) return parseUnits(s, owner, c, t.join(' '), 'attack');
        const out = {};
        for (const [u, n] of Object.entries(c.units)) { const d = DATA.units[u]; if (!d || !(n > 0) || NONFIELD.includes(u) || isCiv(u)) continue; if (!!m.naval !== (d.type === 'ship' || (m.naval && d.flying))) continue; out[u] = n; }
        return out;
      };
      let from;
      if (sg.from) from = myCity(s, owner, ctx, sg.from);
      else {
        const p = G.movePos(s, m);
        const own = G.citiesOf(s, owner).sort((x, y) => G.dist(x, p) - G.dist(y, p));
        from = own.find(c => { const u = pickUnits(c); return G.unitsCount(u) && G.interceptPlan(s, owner, c, m, u, null).ok; }) || ensureCity(s, owner, ctx);
      }
      const units = pickUnits(from);
      if (!G.unitsCount(units)) fail(`No field troops in ${from.name} to send.`);
      const o = orders(s, owner, from, sg, 'attack');
      const err = G.sendIntercept(s, from.id, m.id, units, o);
      if (err) fail(err);
      const I = lastMove(s, owner);
      return [`🛡 ${unitsText(units)} ride out from ${from.name} to meet the ${s.empires[m.owner] ? s.empires[m.owner].name : 'enemy'} column${I && I.arrive ? `; in place in ${real(s, I.arrive - s.time)}` : ''}.`];
    } });
  def({ name: 'recall', aliases: ['return', 'callback'], group: 'Military', usage: 'recall <#>', help: 'Turn one of your columns back home.', args: [['column']],
    run(s, owner, a, ctx) {
      const m = colById(s, ctx, a.tokens[0]);
      const e = G.recallMove ? G.recallMove(s, m.id, owner) : 'Recall is not available';
      if (e) fail(e);
      return ['↩ The column turns back.'];
    } });
  def({ name: 'forge', aliases: ['upgrades', 'smith'], group: 'Military', usage: 'forge [<unit> weapons|armour] [in city]', help: 'Improve a unit type at the Armory. Alone: the state of the forge.', args: [['unit'], ['forgeKind'], ['in', 'myCity']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, kwCity), c = myCity(s, owner, ctx, sg.in), t = toks(sg.head);
      if (!t.length) {
        const us = E.units(s, owner).filter(u => !isCiv(u.id) && DATA.units[u.id].type !== 'ship');
        return [c.forge ? `Forging in ${c.name}: ${DATA.units[c.forge.unit].name} ${c.forge.kind === 'a' ? 'weapons' : 'armour'} → ${c.forge.level}, ${real(s, c.forge.end - s.time)}` : `The armory of ${c.name} is idle (Armory ${G.lvl(c, 'armory')}).`,
          ...table(['Unit', 'Weapons', 'Armour'], us.map(u => [u.name, G.upgradeLevel(s, owner, u.id, 'a'), G.upgradeLevel(s, owner, u.id, 'd')]))];
      }
      let kind = 'a';
      const last = (t[t.length - 1] || '').toLowerCase();
      if (/^(weapons?|attack|atk|a)$/.test(last)) t.pop(); else if (/^(armou?r|defen[cs]e|def|d)$/.test(last)) { kind = 'd'; t.pop(); }
      const u = pick(t.join(' '), E.units(s, owner), 'unit');
      const e = G.startUpgrade(s, c.id, u.id, kind);
      if (e) fail(`${u.name}: ${e}`);
      return [`⚒ The smiths of ${c.name} work on ${u.name} ${kind === 'a' ? 'weapons' : 'armour'} (→ ${c.forge.level}, ${real(s, c.forge.end - s.time)}).`];
    } });
  def({ name: 'hero', group: 'Military', usage: 'hero [assign <attr> [n] | adventure <x,y> | revive | equip <item>]', help: 'Your hero: status, points, adventures.', args: [['heroSub']], tab: 'hero',
    run(s, owner, a, ctx) {
      const h = G.heroOf(s, owner); if (!h) fail('You have no hero.');
      const t = a.tokens, sub = (t[0] || '').toLowerCase();
      if (!sub) {
        const hc = G.heroCityOf ? G.heroCityOf(s, owner) : null;
        return [`${h.name}, level ${h.level} · ${Math.round(h.hp)}% health${h.dead ? ' · fallen' : ''} · ${h.free} point${h.free === 1 ? '' : 's'} to spend · ${hc ? 'in ' + hc.name : 'away'}`,
          'Attributes: ' + Object.entries(h.points).map(([k, v]) => `${(DATA.heroAttrs[k] || {}).name || k} ${v}`).join(', '),
          'Equipped: ' + (Object.values(h.eq).filter(Boolean).map(i => i.name).join(', ') || 'nothing') + (h.items.length ? ` · bag: ${h.items.map(i => i.name).join(', ')}` : '')];
      }
      if (sub === 'assign' || sub === 'point' || sub === 'spend') {
        const n = /^\d+$/.test(t[t.length - 1] || '') ? +t.pop() : 1;
        const at = pick(t.slice(1).join(' '), E.heroAttrs(), 'attribute');
        let k = 0; for (; k < n; k++) { const e = G.heroAssign(s, at.id, owner); if (e) { if (!k) fail(e); break; } }
        return [`${h.name}: +${k} ${at.name} (now ${h.points[at.id]}).`];
      }
      if (sub === 'adventure' || sub === 'quest' || sub === 'ruin') {
        const from = G.heroCityOf(s, owner); if (!from) fail('The hero is not in a city.');
        let dest;
        if (!t[1] || /^nearest$/i.test(t[1])) {
          const r = s.tiles.filter(x => x.ruin && x.ruin.readyAt <= s.time && s.explored[x.y * s.map + x.x]).sort((p, q) => G.dist(p, from) - G.dist(q, from))[0];
          if (!r) fail('No known ruins ready. Explore more.');
          dest = { x: r.x, y: r.y, name: `ruins at (${r.x}, ${r.y})` };
        } else dest = place(s, owner, t.slice(1).join(' '));
        const e = G.sendArmy(s, from.id, dest.x, dest.y, 'adventure', { hero: 1 });
        if (e) fail(e);
        return [`🦸 ${h.name} sets out for ${dest.name}; arrives in ${real(s, lastMove(s, owner).arrive - s.time)}.`];
      }
      if (sub === 'revive' || sub === 'heal') { const e = G.reviveHero(s, owner); if (e) fail(e); return ['The healers begin their work.']; }
      if (sub === 'equip') { const it = pick(t.slice(1).join(' '), h.items.map(i => ({ id: i.id, name: i.name })), 'item in the bag'); const e = G.heroEquip(s, it.id, owner); if (e) fail(e); return [`${h.name} equips ${it.name}.`]; }
      if (sub === 'sell') { const it = pick(t.slice(1).join(' '), h.items.map(i => ({ id: i.id, name: i.name })), 'item in the bag'); const e = G.heroSell(s, it.id); if (e) fail(e); return [`Sold ${it.name}.`]; }
      fail('hero: assign <attr> [n] · adventure <x,y|nearest> · revive · equip <item> · sell <item>');
    } });
  def({ name: 'general', aliases: ['generals', 'gen'], group: 'Military', usage: 'general [recruit [n] [in city] | station <name> <city> | dismiss <name> | ransom <name>]', help: 'Your generals.', args: [['genSub']],
    run(s, owner, a, ctx) {
      if (!G.generalsOf) fail('Generals are not available.');
      const t = a.tokens, sub = (t[0] || '').toLowerCase();
      if (!sub) {
        const gs = G.generalsOf(s, owner);
        const pool = G.generalPool(s, owner).list;
        return [`Generals (${gs.length}/${G.generalCap(s, owner)}):`, ...(gs.length ? table(['Name', 'Lv', 'Where', 'Traits'], gs.map(g => [g.name, g.level, g.status === 'home' && s.cities[g.city] ? s.cities[g.city].name : g.status, (g.traits || []).join(', ')])) : ['  none']),
          `Candidates (general recruit <n>, ${G.generalCost(s, owner).gold} gold): ` + pool.map((g, i) => `${i + 1}. ${g.name} (lv ${g.level}${g.traits && g.traits.length ? ', ' + g.traits.join(', ') : ''})`).join(' · ')];
      }
      if (sub === 'recruit' || sub === 'hire') {
        const sg = segs(t.slice(1), kwCity), c = myCity(s, owner, ctx, sg.in), i = Math.max(1, parseInt(sg.head, 10) || 1) - 1;
        const e = G.recruitGeneral(s, owner, c.id, i); if (e) fail(e); return [`A new general is appointed in ${c.name}.`];
      }
      const rest = t.slice(1);
      const findGen = str => pick(str, E.generals(s, owner), 'general').g;
      if (sub === 'station' || sub === 'post' || sub === 'move') {
        const gs = E.generals(s, owner); let k = rest.length - 1, g = null, c = null;
        for (; k >= 1; k--) { const r = match(rest.slice(0, k).join(' '), gs); if (r.hit) { g = r.hit.g; c = myCity(s, owner, ctx, rest.slice(k).join(' ')); break; } }
        if (!g) fail('general station <name> <city>');
        const e = G.stationGeneral(s, owner, g.id, c.id); if (e) fail(e); return [`${g.name} rides to ${c.name}.`];
      }
      if (sub === 'dismiss' || sub === 'retire') { const g = findGen(rest.join(' ')); return confirm(ctx, `Retire ${g.name} for good?`, () => { const e = G.dismissGeneral(s, owner, g.id); if (e) fail(e); return [`${g.name} retires.`]; }); }
      if (sub === 'ransom') { const g = findGen(rest.join(' ')); const e = G.ransomGeneral(s, owner, g.id); if (e) fail(e); return [`${g.name} is ransomed.`]; }
      fail('general: recruit · station <name> <city> · dismiss <name> · ransom <name>');
    } });
  def({ name: 'stance', group: 'Military', usage: 'stance <standing|hold|sally|evacuate> [in city]', help: 'How a city\'s garrison meets attackers.', args: [['garStance'], ['in', 'myCity']],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, kwCity), c = myCity(s, owner, ctx, sg.in);
      if (!G.setGarrisonStance) fail('Garrison stances are not available.');
      if (!sg.head) return [`${c.name}: ${DATA.garrisonStances[G.garrisonStanceOf(c)].name}. Options: ${E.garStances().map(x => x.id).join(', ')}`];
      const st = pick(sg.head, E.garStances(), 'garrison stance');
      const e = G.setGarrisonStance(s, c.id, st.id); if (e) fail(e);
      return [`${c.name}: garrison stance ${st.name}.`];
    } });

  // ---- knowledge ----
  def({ name: 'research', aliases: ['tech', 'learn'], group: 'Knowledge', usage: 'research <tech> · research list|cancel [tech]', help: 'Queue a technology and every missing prerequisite.', args: [['tech']], tab: 'research',
    ex: ['research heavy plough', 'research cancel'],
    run(s, owner, a, ctx) {
      const R = G.research(s, owner), t = a.tokens, sub = (t[0] || '').toLowerCase();
      const c = ensureCity(s, owner, ctx);
      if (!sub || sub === 'list' || sub === 'ls') {
        const out = ['Studying: ' + (R.studies.length ? R.studies.map(x => `${DATA.techs[x.id].name} (${real(s, x.end - s.time)})`).join(', ') : 'nothing'),
          'Queue: ' + ((R.queue || []).map(k => DATA.techs[k].name).join(' → ') || 'empty') + (R.queueWait ? ` (waiting: ${R.queueWait.why || R.queueWait.reason || ''})` : '')];
        const av = Object.keys(DATA.techs).filter(k => G.techForOwner(s, owner, k) && !R.done[k] && !R.studies.some(x => x.id === k) && DATA.techs[k].reqs.every(r => R.done[r]));
        out.push(`Ready to study (${av.length}): ` + av.slice(0, 24).map(k => DATA.techs[k].name).join(', ') + (av.length > 24 ? ', …' : ''));
        out.push(`Known: ${Object.keys(R.done).filter(k => DATA.techs[k]).length} of ${Object.keys(DATA.techs).filter(k => G.techForOwner(s, owner, k)).length}`);
        return out;
      }
      if (sub === 'cancel' || sub === 'stop' || sub === 'unqueue') {
        const rest = t.slice(1).join(' ');
        if (!rest) { const x = R.studies[0]; if (!x) fail('Nothing is being studied.'); G.cancelResearch(s, owner, x.id); return [`Stopped ${DATA.techs[x.id].name} (half the goods back).`]; }
        const tk = pick(rest, E.techs(s, owner), 'technology');
        if (R.studies.some(x => x.id === tk.id)) { G.cancelResearch(s, owner, tk.id); return [`Stopped ${tk.name} (half the goods back).`]; }
        if ((R.queue || []).includes(tk.id)) { G.unqueueResearch(s, owner, tk.id); return [`${tk.name} (and what depends on it) left the queue.`]; }
        fail(`${tk.name} is neither studied nor queued.`);
      }
      const tk = pick(a.rest, E.techs(s, owner), 'technology', "Type 'research list'.");
      const path = G.techPath(s, owner, tk.id);
      const e = G.planResearch(s, owner, c ? c.id : null, tk.id);
      if (e) fail(`${tk.name}: ${e}`);
      const R2 = G.research(s, owner);
      const started = R2.studies.filter(x => path.includes(x.id)).map(x => DATA.techs[x.id].name);
      return [`📚 Planned: ${path.map(k => DATA.techs[k].name).join(' → ')}.${started.length ? ` Studying now: ${started.join(', ')}.` : ' Waiting for a free Academy and goods.'}`];
    } });
  def({ name: 'study', aliases: ['arcana', 'grimoire'], group: 'Knowledge', usage: 'study <arcanum> · study list|cancel', help: 'Study an arcanum (and its path) in the grimoire.', args: [['arcanum']],
    run(s, owner, a) {
      if (!G.grimoire) fail('The grimoire is not available.');
      const A = G.grimoire(s, owner), sub = (a.tokens[0] || '').toLowerCase();
      if (!sub || sub === 'list') {
        const av = (DATA.arcanaOrder || []).filter(k => { const st = G.arcanaStatus(s, owner, k); return st.ok || st.poor || st.busy; });
        return ['Studying: ' + (A.active ? `${DATA.arcana[A.active.id].name} (${real(s, A.active.end - s.time)})` : 'nothing'),
          'Queue: ' + (A.queue.map(k => DATA.arcana[k].name).join(' → ') || 'empty'),
          'Known: ' + (A.known.map(k => DATA.arcana[k].name).join(', ') || 'nothing'),
          'Open to study: ' + (av.map(k => DATA.arcana[k].name).join(', ') || 'nothing (a Mage Tower opens the first circle)')];
      }
      if (sub === 'cancel') { if (!A.active) fail('Nothing is being studied.'); const n = DATA.arcana[A.active.id].name; G.cancelStudy(s, owner); return [`Stopped ${n} (half the cost back).`]; }
      const n = pick(a.rest, E.arcana(), 'arcanum');
      const path = G.arcanaPath(s, owner, n.id);
      const e = G.planStudy(s, owner, n.id);
      if (e) fail(`${n.name}: ${e}`);
      const A2 = G.grimoire(s, owner);
      return [`📖 Planned: ${path.map(k => DATA.arcana[k].name).join(' → ')}.${A2.active ? ` Studying ${DATA.arcana[A2.active.id].name} now.` : ''}`];
    } });
  def({ name: 'cast', aliases: ['spell', 'c'], group: 'Knowledge', usage: 'cast <spell> [at <city|x,y>] [from city]', help: 'Cast a spell. Alone: your spells.', args: [['spell'], ['at', 'place'], ['from', 'myCity']],
    ex: ['cast transmutation', 'cast scrying at 20,14', 'cast ember storm at Redhold'],
    run(s, owner, a, ctx) {
      const sg = segs(a.tokens, ['at', 'on', 'from']);
      if (!sg.head) {
        const list = E.knownSpells(s, owner);
        if (!list.length) return ['You know no spells yet. A Mage Tower and the grimoire (study) bring them.'];
        const c = ensureCity(s, owner, ctx);
        return ['Your spells:', ...table(['Spell', 'Target', 'Mana', 'State'], list.map(sp => { const st = G.spellStatus(s, owner, c.id, sp.id); return [sp.name, DATA.spells[sp.id].target, st.cost, st.ok ? 'ready' : st.reason]; }))];
      }
      const sp = pick(sg.head, E.spells(), 'spell');
      const d = DATA.spells[sp.id];
      let from = sg.from ? myCity(s, owner, ctx, sg.from) : null;
      if (!from) { const cur = ensureCity(s, owner, ctx); from = G.spellStatus(s, owner, cur.id, sp.id).ok ? cur : (G.citiesOf(s, owner).find(c => G.spellStatus(s, owner, c.id, sp.id).ok) || cur); }
      const st = G.spellStatus(s, owner, from.id, sp.id);
      if (!st.ok) fail(`${sp.name}: ${st.reason}`);
      const tRaw = sg.at || sg.on;
      let target = null, tName = '';
      if (d.target === 'city') { const c = tRaw ? myCity(s, owner, ctx, tRaw) : from; target = c.id; tName = c.name; }
      else if (d.target === 'enemy') {
        if (!tRaw) fail(`${sp.name} needs a foreign city: cast ${sp.name.toLowerCase()} at <city>`);
        const p = place(s, owner, tRaw); if (!p.city || p.city.owner === owner) fail('Choose a foreign city.');
        target = p.city.id; tName = p.city.name;
      } else if (d.target === 'tile') {
        if (!tRaw) fail(`${sp.name} needs a place: cast ${sp.name.toLowerCase()} at x,y`);
        const p = place(s, owner, tRaw); target = { x: p.x, y: p.y }; tName = p.name;
      }
      const e = G.castSpell(s, owner, from.id, sp.id, target);
      if (e) fail(`${sp.name}: ${e}`);
      return [`✨ ${sp.name} cast from ${from.name}${tName ? ' on ' + tName : ''}.`];
    } });
  def({ name: 'enchant', group: 'Knowledge', usage: 'enchant <city> <enchantment>', help: 'Place a standing enchantment on a city.', args: [['myCity'], ['enchant']],
    run(s, owner, a, ctx) {
      if (!G.enchantCity) fail('Enchantments are not available.');
      const t = a.tokens;
      if (!t.length) return ['Known enchantments: ' + (G.enchantmentsKnown(s, owner).map(k => DATA.enchantments[k].name).join(', ') || 'none')];
      let c = null, en = null;
      for (let k = t.length - 1; k >= 0 && !en; k--) {
        const r = match(t.slice(k).join(' '), E.enchants());
        const cr = k ? match(t.slice(0, k).join(' '), E.myCities(s, owner)) : { hit: { c: ensureCity(s, owner, ctx) } };
        if (r.hit && cr.hit) { en = r.hit; c = cr.hit.c; }
      }
      if (!en) { pick(t.join(' '), E.enchants(), 'enchantment'); fail('enchant <city> <enchantment>'); }
      const e = G.enchantCity(s, owner, c.id, en.id); if (e) fail(`${en.name}: ${e}`);
      return [`${en.name} now stands over ${c.name}.`];
    } });
  def({ name: 'school', aliases: ['schools'], group: 'Knowledge', usage: 'school [open|close <school>]', help: 'Open or close a school of magic.', args: [['openClose'], ['school']],
    run(s, owner, a, ctx) {
      const t = a.tokens, sub = (t[0] || '').toLowerCase();
      if (!sub) return ['Open schools: ' + ((G.schoolsOf ? G.schoolsOf(s, owner) : []).map(k => DATA.schools[k].name).join(', ') || 'none')];
      const sc = pick(t.slice(1).join(' '), E.schools(), 'school');
      if (sub === 'open') { const e = G.openSchool(s, owner, sc.id); if (e) fail(e); return [`The school of ${sc.name} is open to your magi.`]; }
      if (sub === 'close') return confirm(ctx, `Close the school of ${sc.name}? Its spells and enchantments go quiet.`, () => { const e = G.closeSchool(s, owner, sc.id); if (e) fail(e); return ['School closed.']; });
      fail('school open|close <school>');
    } });
  def({ name: 'magi', aliases: ['magus', 'mage'], group: 'Knowledge', usage: 'magi [recruit [n] | post <name> <court|war|study|idle> [city] | dismiss <name>]', help: 'The circle of magi.', args: [['magiSub']],
    run(s, owner, a, ctx) {
      if (!G.magiOf) fail('Magi are not available.');
      const t = a.tokens, sub = (t[0] || '').toLowerCase();
      if (!sub) {
        const list = G.magiOf(s, owner), pool = G.magiPool(s, owner).list;
        return [`Magi (${list.length}/${G.magiCap(s, owner)}):`, ...(list.length ? table(['Name', 'Rank', 'School', 'Post', 'City'], list.map(g => [g.name, G.magusRankName(g), DATA.schools[g.school] ? DATA.schools[g.school].name : g.school, g.station, s.cities[g.city] ? s.cities[g.city].name : '-'])) : ['  none']),
          'Candidates (magi recruit <n>): ' + (pool.map((g, i) => `${i + 1}. ${g.name} (${DATA.schools[g.school] ? DATA.schools[g.school].name : g.school})`).join(' · ') || 'none')];
      }
      if (sub === 'recruit' || sub === 'hire') { const i = Math.max(1, parseInt(t[1], 10) || 1) - 1; const e = G.recruitMagus(s, owner, i); if (e) fail(e); return ['A new magus joins the Circle.']; }
      const ms = E.magi(s, owner);
      if (sub === 'post' || sub === 'station') {
        const posts = ['court', 'war', 'study', 'idle'];
        const pi = t.findIndex((x, i) => i > 0 && posts.includes(x.toLowerCase()));
        if (pi < 2) fail('magi post <name> <court|war|study|idle> [city]');
        const g = pick(t.slice(1, pi).join(' '), ms, 'magus').g;
        const c = t.length > pi + 1 ? myCity(s, owner, ctx, t.slice(pi + 1).join(' ').replace(/^in\s+/i, '')) : null;
        const e = G.stationMagus(s, owner, g.id, t[pi].toLowerCase(), c ? c.id : undefined); if (e) fail(e);
        return [`${g.name} takes up the ${t[pi].toLowerCase()} post.`];
      }
      if (sub === 'dismiss') { const g = pick(t.slice(1).join(' '), ms, 'magus').g; return confirm(ctx, `Dismiss ${g.name} for good?`, () => { const e = G.dismissMagus(s, owner, g.id); if (e) fail(e); return [`${g.name} leaves the Circle.`]; }); }
      if (sub === 'honor' || sub === 'honour') { const g = pick(t.slice(1).join(' '), ms, 'magus').g; const e = G.honorMagus(s, owner, g.id); if (e) fail(e); return ['Gifts and honours: loyalty rises.']; }
      fail('magi: recruit [n] · post <name> <post> [city] · dismiss <name> · honor <name>');
    } });
  def({ name: 'tradition', aliases: ['traditions', 'adopt'], group: 'Knowledge', usage: 'tradition [<name>]', help: 'Adopt a cultural tradition. Alone: those open to you.', args: [['tradition']],
    run(s, owner, a) {
      if (!a.rest) {
        const list = G.traditionsFor(s, owner).map(id => ({ id, st: G.traditionStatus(s, owner, id) }));
        return ['Adopted: ' + ((s.empires[owner].traditions || []).map(k => DATA.traditions[k].name).join(', ') || 'none'),
          'Open: ' + (list.filter(x => x.st.ok || x.st.poor).map(x => `${DATA.traditions[x.id].name} (${x.st.cost})`).join(', ') || 'none right now')];
      }
      const tr = pick(a.rest, E.traditions(s, owner), 'tradition');
      const e = G.adoptTradition(s, owner, tr.id); if (e) fail(`${tr.name}: ${e}`);
      return [`Adopted ${tr.name}.`];
    } });
  def({ name: 'ceremony', aliases: ['ceremonies', 'festival'], group: 'Knowledge', usage: 'ceremony [<name>]', help: 'Hold a ceremony of an adopted tradition.', args: [['ceremony']],
    run(s, owner, a) {
      if (!a.rest) { const l = G.ceremoniesOf ? G.ceremoniesOf(s, owner) : []; return ['Ceremonies: ' + (l.map(k => { const st = G.ceremonyStatus(s, owner, k); return `${DATA.ceremonies[k].name} (${st.ok ? 'ready' : st.reason})`; }).join(', ') || 'none — adopt traditions first')]; }
      const c = pick(a.rest, E.ceremonies(), 'ceremony');
      const e = G.holdCeremony(s, owner, c.id); if (e) fail(`${c.name}: ${e}`);
      return [`${c.name} is held.`];
    } });

  // ---- relations ----
  def({ name: 'diplo', aliases: ['realms', 'diplomacy', 'relations'], group: 'Relations', usage: 'diplo', help: 'Every realm: status, opinion, treaties.',
    run(s, owner) {
      const rows = Object.values(s.empires).filter(e => e.id !== owner && !e.dead).map(e => {
        const r = G.rel(s, e.id), ts = G.treatiesOf ? G.treatiesOf(s, owner, e.id) : [];
        return [e.name, DATA.races[e.race].name, r.status, Math.round(r.opinion), G.citiesOf(s, e.id).length, ts.map(G.treatyName).join(', ') || '-'];
      });
      return table(['Realm', 'People', 'Status', 'Opinion', 'Cities', 'Treaties'], rows);
    } });
  def({ name: 'propose', aliases: ['offer', 'treaty'], group: 'Relations', usage: 'propose <treaty> to <realm>', help: 'Offer a treaty: nap, borders, trade, research, defense, alliance, marriage.', args: [['treaty'], ['to', 'realm']],
    ex: ['propose trade to Circle of the Glade', 'propose nap to delver'],
    run(s, owner, a) {
      const sg = segs(a.tokens, ['to', 'with']);
      const kind = pick(sg.head, E.treaties(), 'treaty', 'Treaties: ' + SYM_TREATIES.join(', ') + '.').id;
      const ai = pick(sg.to || sg.with, E.realms(s, owner), 'realm').id;
      const res = G.negotiate(s, { ai, give: [], take: [], both: [{ t: 'treaty', kind, mins: DATA.treatyKinds[kind].dur }] });
      if (!res.ok) fail(res.text || 'They refuse.');
      G.log(s, owner, '🕊️ ' + res.text);
      return [res.text];
    } });
  def({ name: 'declare', aliases: ['war'], group: 'Relations', usage: 'declare war <realm>', help: 'Declare war (asks first).', args: [['war'], ['realm']],
    run(s, owner, a, ctx) {
      const t = a.tokens.slice(); if ((t[0] || '').toLowerCase() === 'war') t.shift(); if ((t[0] || '').toLowerCase() === 'on') t.shift();
      if (!t.length) fail('declare war <realm>');
      const e = pick(t.join(' '), E.realms(s, owner), 'realm');
      const ts = G.treatiesOf ? G.treatiesOf(s, owner, e.id) : [];
      return confirm(ctx, `Declare war on the ${e.name}?${ts.length ? ` This breaks your treaties (${ts.map(G.treatyName).join(', ')}) and costs reputation with every court.` : ''}`, () => {
        const msg = G.diplo.war(s, e.id); G.log(s, owner, '🕊️ ' + msg); return [msg];
      });
    } });
  def({ name: 'peace', group: 'Relations', usage: 'peace <realm>', help: 'Propose peace (or a non-aggression pact when not at war).', args: [['realm']],
    run(s, owner, a) { const e = pick(a.rest, E.realms(s, owner), 'realm'); const msg = G.diplo.peace(s, e.id); G.log(s, owner, '🕊️ ' + msg); return [msg]; } });
  def({ name: 'gift', group: 'Relations', usage: 'gift <gold> to <realm>', help: 'Send gold to improve opinion.', args: [['n'], ['to', 'realm']],
    run(s, owner, a) { const sg = segs(a.tokens, ['to']); const n = parseInt(sg.head, 10); if (!(n > 0)) fail('gift <gold> to <realm>'); const e = pick(sg.to, E.realms(s, owner), 'realm'); const before = s.empires[owner].gold; const msg = G.diplo.gift(s, e.id, n); if (s.empires[owner].gold === before) fail(msg); return [msg]; } });
  def({ name: 'spy', aliases: ['spies', 'espionage'], group: 'Relations', usage: 'spy [recruit [city] | <mission> <city> [with <spy>] | recall <spy>]', help: 'Spies and their missions (intel, sabotage, poison, unrest, tech, mana, wound, defect).',
    args: [['spySub'], ['enemyCity']], ex: ['spy recruit', 'spy intel Redhold', 'spy sabotage Redhold with Wren'],
    run(s, owner, a, ctx) {
      if (!G.sendSpy) fail('Espionage is not available.');
      const t = a.tokens, sub = (t[0] || '').toLowerCase();
      const spies = G.spiesOf(s, owner);
      if (!sub) return spies.length ? table(['Spy', 'Lv', 'Status', 'Home'], spies.map(x => [x.name, x.level, x.status + (x.task ? ` (${x.task.type})` : ''), s.cities[x.home] ? s.cities[x.home].name : '-'])) : ['No spies. Build a Spymaster\'s Den, then: spy recruit'];
      if (sub === 'recruit' || sub === 'train') { const c = myCity(s, owner, ctx, t.slice(1).join(' ').replace(/^in\s+/i, '')); const e = G.recruitSpy(s, c.id); if (e) fail(e); return [`🕵 A new spy begins training in ${c.name}.`]; }
      if (sub === 'recall') { const sp = pick(t.slice(1).join(' '), E.spies(s, owner), 'spy').g; const e = G.recallSpy(s, sp.id); if (e) fail(e); return [`${sp.name} is called home.`]; }
      if (sub === 'dismiss') { const sp = pick(t.slice(1).join(' '), E.spies(s, owner), 'spy').g; return confirm(ctx, `Dismiss ${sp.name}?`, () => { const e = G.dismissSpy(s, sp.id); if (e) fail(e); return [`${sp.name} returns to ordinary life.`]; }); }
      const mi = pick(t[0], E.missions(), 'mission', 'Missions: ' + (DATA.missionOrder || []).join(', ') + '.');
      const sg = segs(t.slice(1), ['with', 'by']);
      const p = place(s, owner, sg.head);
      if (!p.city || p.city.owner === owner) fail('Spies go to foreign cities.');
      const sp = (sg.with || sg.by) ? pick(sg.with || sg.by, E.spies(s, owner), 'spy').g : spies.filter(x => x.status === 'idle').sort((x, y) => y.level - x.level)[0];
      if (!sp) fail('No idle spy. spy recruit, or wait for one to come home.');
      const e = G.sendSpy(s, sp.id, p.city.id, mi.id); if (e) fail(e);
      return [`🕵 ${sp.name} sets out for ${p.city.name}: ${mi.name}.`];
    } });

  // ---- map ----
  def({ name: 'tile', aliases: ['describe', 'whatis', 'at'], group: 'Map', usage: 'tile <x,y|city>', help: 'Describe a place.', args: [['place']],
    run(s, owner, a, ctx) { const p = place(s, owner, a.rest || (() => { const c = ensureCity(s, owner, ctx); return `${c.x},${c.y}`; })()); return { out: tileText(s, owner, p.x, p.y), nav: { sel: { x: p.x, y: p.y } } }; } });
  def({ name: 'sites', aliases: ['near', 'nearby', 'find'], group: 'Map', usage: 'sites [camps|ruins|oases|cities|free]', help: 'Known places near the current city, nearest first (coordinates to use with send, scout, hero…).', args: [['siteKind']],
    run(s, owner, a, ctx) {
      const c = ensureCity(s, owner, ctx), w = norm(a.rest);
      const kindOf = t => {
        if (t.city && s.cities[t.city]) { const x = s.cities[t.city]; return ['city', x.owner === owner ? `${x.name} (yours)` : `${x.name} — ${s.empires[x.owner] ? s.empires[x.owner].name : 'unknown'}`]; }
        if (t.minor && s.minors && s.minors[t.minor]) return ['free', `${s.minors[t.minor].name} — free city`];
        if (t.camp && s.camps[t.camp]) return ['camp', `Brigand camp, tier ${s.camps[t.camp].tier}`];
        if (t.ruin) return ['ruin', `Ruins${t.ruin.readyAt > s.time ? ' (plundered)' : ''}`];
        if (t.oasis) return ['oasis', `Oasis +25% ${goodName(t.oasis.bonus)}${t.oasis.owner && s.cities[t.oasis.owner] ? ` (${s.cities[t.oasis.owner].name})` : ''}`];
        return null;
      };
      const KINDS = { camp: ['camp', 'camps', 'brigand', 'brigands'], ruin: ['ruin', 'ruins'], oasis: ['oasis', 'oases'], city: ['city', 'cities', 'town', 'towns'], free: ['free', 'freecity', 'freecities', 'minor', 'minors'] };
      const want = !w ? null : Object.keys(KINDS).find(k => KINDS[k].some(x => x.startsWith(w)));
      if (w && !want) fail('sites camps|ruins|oases|cities|free');
      const rows = [];
      for (const t of s.tiles) { if (!s.explored[t.y * s.map + t.x]) continue; const k = kindOf(t); if (!k || (want && k[0] !== want) || (t.city === c.id)) continue; rows.push({ t, k, d: G.dist(c, t) }); }
      rows.sort((x, y) => x.d - y.d);
      if (!rows.length) return [`No ${want || 'known place'} found yet. Explore: scout x,y or explore on.`];
      return [`Near ${c.name}:`, ...table(null, rows.slice(0, 15).map(r => [`${r.t.x},${r.t.y}`, r.d.toFixed(1), r.k[1]]))];
    } });
  def({ name: 'explore', aliases: ['autoexplore'], group: 'Map', usage: 'explore on|off [city|all]', help: 'Scouts map the unknown on their own.', args: [['onOff'], ['myCityOrAll']],
    run(s, owner, a, ctx) {
      if (!G.setAutoExplore) fail('Auto-explore is not available.');
      const t = a.tokens, w = (t[0] || '').toLowerCase();
      if (!w) return ['Auto-explore: ' + G.citiesOf(s, owner).map(c => `${c.name} ${G.autoExploreOn(s, c.id) ? 'on' : 'off'}`).join(', ')];
      if (w !== 'on' && w !== 'off') fail('explore on|off [city|all]');
      const rest = t.slice(1).join(' ').replace(/^in\s+/i, '');
      const cities = /^all$/i.test(rest) ? G.citiesOf(s, owner) : [myCity(s, owner, ctx, rest)];
      for (const c of cities) G.setAutoExplore(s, c.id, w === 'on');
      return [`🦅 Auto-explore ${w} in ${cities.map(c => c.name).join(', ')}${w === 'on' && cities.some(c => !(c.units.scout > 0)) ? ' (train scouts where there are none)' : ''}.`];
    } });
  def({ name: 'bridge', group: 'Map', usage: 'bridge <x,y> · bridge upgrade <x,y>', help: 'Bridge a river tile (or rebuild a bridge in stone).', args: [['place']],
    run(s, owner, a) {
      if (!G.orderBridge) fail('Bridges are not available.');
      const t = a.tokens, up = /^(upgrade|stone)$/i.test(t[0] || '');
      const xy = parseXY(t.slice(up ? 1 : 0).join(' '));
      if (!xy) fail('bridge <x,y>');
      const e = up ? G.upgradeBridge(s, owner, xy.x, xy.y) : G.orderBridge(s, owner, xy.x, xy.y); if (e) fail(e);
      return [up ? '🧱 Masons begin rebuilding the bridge in stone.' : `🌉 Builders set out to bridge the river at (${xy.x}, ${xy.y}).`];
    } });

  // ---- game ----
  def({ name: 'pause', aliases: ['resume', 'p'], group: 'Game', usage: 'pause · resume', help: 'Pause or resume time.', run: (s, owner, a) => ({ out: [a.cmdWord === 'resume' ? '▶ Resumed.' : '⏸ Pause toggled.'], nav: { pause: a.cmdWord === 'resume' ? false : a.cmdWord === 'pause' ? 'toggle' : 'toggle' } }) });
  def({ name: 'speed', aliases: ['fast', 'spd'], group: 'Game', usage: 'speed <1|2|5|10|25>', help: 'Game speed.', args: [['speed']],
    run(s, owner, a) {
      if (!a.rest) return [`Speed ${s.settings.speed}×. Options: ${SPEEDS.join(', ')}.`];
      const n = parseFloat(a.rest.replace(/x$/i, ''));
      if (!(n > 0)) fail('speed <1|2|5|10|25>');
      const v = SPEEDS.reduce((b, x) => Math.abs(x - n) < Math.abs(b - n) ? x : b, SPEEDS[0]);
      s.settings.speed = v;
      return { out: [`Speed ${v}×.`], nav: { speed: v } };
    } });
  def({ name: 'save', group: 'Game', usage: 'save', help: 'Save now.', run(s) { return [G.save(s) ? 'Saved.' : 'Could not save.']; } });
  def({ name: 'reports', aliases: ['rep'], group: 'Game', usage: 'reports [n]', help: 'Latest battle and scouting reports, numbered.', args: [['n']], tab: 'reports',
    run(s, owner, a, ctx) {
      const n = Math.max(1, Math.min(50, parseInt(a.rest, 10) || 10));
      const list = s.reports.slice(0, n);
      ctx.reports = list.map(r => r.id);
      if (!list.length) return ['No reports yet.'];
      return [...list.map((r, i) => `${r.read ? ' ' : '•'} ${String(i + 1).padStart(2)}  ${r.title}  (${real(s, s.time - r.t)} ago)`), "read <n> opens one; 'read all' marks all read."];
    } });
  def({ name: 'read', aliases: ['open-report'], group: 'Game', usage: 'read <n|all>', help: 'Read a report from the list.', args: [['n']],
    run(s, owner, a, ctx) {
      if (/^all$/i.test(a.rest)) { s.reports.forEach(r => { r.read = true; }); return ['All reports marked read.']; }
      const n = parseInt(a.rest, 10) || 1;
      const id = (ctx.reports || [])[n - 1];
      const r = (id && s.reports.find(x => x.id === id)) || (!ctx.reports && s.reports[n - 1]);
      if (!r) fail(`No report #${n}. Type 'reports'.`);
      r.read = true;
      return { out: reportLines(s, r), nav: { report: r.id } };
    } });
  def({ name: 'log', aliases: ['chronicle', 'news'], group: 'Game', usage: 'log [n]', help: 'The latest entries of the chronicle.', args: [['n']],
    run(s, owner, a) { const n = Math.max(1, Math.min(60, parseInt(a.rest, 10) || 12)); return s.log.slice(0, n).map(l => `${l.kind === 'bad' ? '!' : l.kind === 'good' ? '+' : ' '} ${real(s, s.time - l.t).padStart(7)} ago  ${l.text}`); } });

  const GROUPS = ['Navigation', 'Economy', 'Military', 'Knowledge', 'Relations', 'Map', 'Game'];

  // ---------------------------------------------------------------
  // command lookup
  // ---------------------------------------------------------------
  const cmdItems = () => C.map(c => ({ id: c.name, name: c.name, alt: c.aliases || [], c }));
  function findCmd(word, ctx, s, owner, strict) {
    const w = String(word || '').toLowerCase();
    const ex = C.find(c => c.name === w || (c.aliases || []).includes(w));
    if (ex) return ex;
    if (strict) { const r = match(w, cmdItems()); return r.hit ? r.hit.c : null; }
    return null;
  }

  // ---------------------------------------------------------------
  // exec
  // ---------------------------------------------------------------
  const DEF_CTX = {};
  const runOne = (s, owner, line, ctx) => {
    const words = line.split(/\s+/);
    const head = words[0].toLowerCase();
    let cmd = findCmd(head, ctx, s, owner);
    let rest = line.slice(words[0].length).trim();
    if (!cmd) {
      // a bare tab name opens the tab
      const tabs = E.tabs(s, owner, ctx);
      const tr = !rest ? match(head, tabs) : null;
      if (tr && tr.hit && (norm(tr.hit.id) === norm(head) || norm(tr.hit.name) === norm(head) || norm(tr.hit.id).startsWith(norm(head)) && head.length >= 3)) return { ok: true, out: [`→ ${tr.hit.name}`], nav: { tab: tr.hit.id } };
      const r = match(head, cmdItems());
      if (r.hit && head.length >= 2 && norm(r.hit.name).startsWith(norm(head))) cmd = r.hit.c;
      else {
        const sug = r.amb ? r.amb.map(x => x.name) : (r.sug || []).map(x => x.name);
        return { ok: false, out: [], err: `Unknown command '${words[0]}'${sug.length ? ` — did you mean ${sug.slice(0, 3).join(' or ')}?` : '.'} Type 'help'.` };
      }
    }
    const tokens = rest ? rest.split(/\s+/) : [];
    const res = cmd.run(s, owner, { rest, tokens, cmdWord: head, line }, ctx);
    const o = Array.isArray(res) ? { ok: true, out: res } : Object.assign({ ok: true, out: [] }, res);
    // a command typed under a tab's own name (research, hero, reports, market, diplomacy…) also opens that tab
    if (!rest && !o.nav) { const tab = E.tabs(s, owner, ctx).find(t => t.id === head || (cmd.tab === t.id && head === cmd.name)); if (tab) o.nav = { tab: tab.id }; }
    return o;
  };
  const wrap = fn => {
    try { const r = fn(); return Array.isArray(r) ? { ok: true, out: r } : Object.assign({ ok: true, out: [] }, r); }
    catch (e) { if (e instanceof CliErr) return { ok: false, out: [], err: e.message }; throw e; }
  };
  const exec = (s, owner, line, ctx) => {
    owner = owner || 'p'; ctx = ctx || DEF_CTX;
    const raw = String(line == null ? '' : line).trim();
    if (!s) return { ok: false, out: [], err: 'No game in progress.' };
    if (ctx.pending) {
      const p = ctx.pending; ctx.pending = null;
      if (/^(y|yes|ok|sure)$/i.test(raw)) return wrap(() => p.fn());
      if (!raw || /^(n|no|cancel)$/i.test(raw)) return { ok: true, out: ['Cancelled.'] };
      const r = exec(s, owner, raw, ctx);
      r.out = ['(Cancelled the question.)', ...(r.out || [])];
      return r;
    }
    if (!raw) return { ok: true, out: [] };
    if (/^(y|yes|n|no)$/i.test(raw)) return { ok: true, out: ['Nothing to answer.'] };
    ensureCity(s, owner, ctx);
    const parts = raw.split(/\s*;\s*/).filter(Boolean);
    const all = { ok: true, out: [] };
    for (const p of parts) {
      const r = wrap(() => runOne(s, owner, p, ctx));
      all.out.push(...(r.out || []));
      if (r.nav) all.nav = Object.assign(all.nav || {}, r.nav);
      if (r.confirm) { all.confirm = true; break; }
      if (!r.ok) { all.ok = false; all.err = r.err; break; }
    }
    return all;
  };

  // ---------------------------------------------------------------
  // completion: what fits the word under the cursor
  // ---------------------------------------------------------------
  const KW_SLOTS = { in: 'myCity', from: 'myCity', to: 'place', at: 'place', on: 'place', general: 'general', stance: 'stance', with: 'spy', by: 'spy', realm: 'onOff' };
  const SUBS = {
    queueSub: ['cancel', 'move'], heroSub: ['assign', 'adventure', 'revive', 'equip', 'sell'], genSub: ['recruit', 'station', 'dismiss', 'ransom'],
    magiSub: ['recruit', 'post', 'dismiss', 'honor'], spySub: ['recruit', 'recall', 'dismiss', ...(DATA.missionOrder || [])], buySell: ['buy', 'sell'], onOff: ['on', 'off'],
    openClose: ['open', 'close'], siteKind: ['camps', 'ruins', 'oases', 'cities', 'free'], forgeKind: ['weapons', 'armour'], war: ['war'], speed: SPEEDS.map(String), mission: Object.keys(MISSIONS),
  };
  const itemsFor = (slot, s, owner, ctx) => {
    const strs = a => a.map(x => ({ id: x, name: x }));
    switch (slot) {
      case 'myCity': return E.myCities(s, owner);
      case 'myCityOrAll': return [...E.myCities(s, owner), { id: 'all', name: 'all' }];
      case 'govFirst': return [...E.focus(), ...E.myCities(s, owner), { id: 'all', name: 'all' }];
      case 'place': case 'enemyCity': return E.places(s, owner);
      case 'building': return E.buildings(s, owner);
      case 'unit': return E.units(s, owner);
      case 'unitHere': case 'units': { const c = ensureCity(s, owner, ctx); return [{ id: 'all', name: 'all' }, ...Object.entries(c ? c.units : {}).filter(([, n]) => n > 0).map(([id]) => ({ id, name: DATA.units[id].name }))]; }
      case 'good': case 'cargo': return E.goods(s, owner);
      case 'tech': return [...strs(['list', 'cancel']), ...E.techs(s, owner).filter(t => !G.research(s, owner).done[t.id])];
      case 'arcanum': return [...strs(['list', 'cancel']), ...E.arcana()];
      case 'spell': return [...E.knownSpells(s, owner), ...E.spells().filter(x => !(G.spellsOf ? G.spellsOf(s, owner) : []).includes(x.id))];
      case 'enchant': return E.enchants();
      case 'tradition': return E.traditions(s, owner);
      case 'ceremony': return E.ceremonies();
      case 'realm': return E.realms(s, owner);
      case 'treaty': return E.treaties();
      case 'focus': return E.focus();
      case 'stance': return E.stances();
      case 'garStance': return E.garStances();
      case 'general': return E.generals(s, owner);
      case 'spy': return E.spies(s, owner);
      case 'school': return E.schools();
      case 'tax': return E.taxes();
      case 'tab': return E.tabs(s, owner, ctx);
      case 'command': return cmdItems();
      default: return SUBS[slot] ? strs(SUBS[slot]) : [];
    }
  };
  // returns { items:[{text,label,kind}], from (char index where the replaced part starts), word }
  const complete = (s, owner, line, ctx) => {
    owner = owner || 'p'; ctx = ctx || DEF_CTX;
    line = String(line || '');
    const seg = line.lastIndexOf(';');
    const base = seg >= 0 ? seg + 1 : 0;
    const part = line.slice(base);
    const lead = part.match(/^\s*/)[0].length;
    const body = part.slice(lead);
    const trailing = /\s$/.test(body);
    const words = body.replace(/\s+$/, '').split(/\s+/);
    if (!s) return { items: [], from: line.length, word: '' };
    if (words.length <= 1 && !trailing) {
      const w = words[0] || '';
      const items = rank(w, [...cmdItems().map(x => ({ ...x, kind: 'command' })), ...E.tabs(s, owner, ctx).filter(t => !C.some(c => c.name === t.id)).map(t => ({ id: t.id, name: t.id, kind: 'tab' }))]);
      return { items: items.slice(0, 40).map(x => ({ text: x.name, label: x.kind === 'tab' ? `${x.name}  (tab)` : `${x.name}  ${x.c ? x.c.usage.slice(x.name.length) : ''}`, kind: x.kind || 'command' })), from: base + lead, word: w };
    }
    const cmd = findCmd(words[0], ctx, s, owner, true);
    if (!cmd) return { items: [], from: line.length, word: '' };
    const argWords = words.slice(1);
    if (trailing) argWords.push('');
    // the current slot: the last keyword seen sets it; otherwise the positional slots in order
    const kws = Object.keys(KW_SLOTS);
    let slot = null, start = 0;
    for (let i = argWords.length - 2; i >= 0; i--) {
      const k = argWords[i].toLowerCase();
      if (kws.includes(k) && (cmd.args || []).some(x => x[0] === k || (k === 'on' && x[0] === 'at'))) { slot = (cmd.args.find(x => x[0] === k || (k === 'on' && x[0] === 'at')) || [])[1] || KW_SLOTS[k]; start = i + 1; break; }
    }
    if (!slot) {
      const pos = (cmd.args || []).filter(x => x.length === 1);
      // skip leading numbers ("train 5 mil…") and pick the first slot that is not a count
      let i = 0; while (i < argWords.length - 1 && /^(\d+|max|all|half)$/i.test(argWords[i])) i++;
      const named = pos.filter(x => x[0] !== 'n');
      if (cmd.name === 'help') slot = 'command';
      else if (named.length) {
        // sub-command slots take one word; once filled, move to the next slot
        const first = named[0][0];
        if (SUBS[first] && argWords.length > 1 && i < argWords.length - 1) { slot = (named[1] || [])[0] || null; start = i + 1; if (first === 'spySub') slot = 'enemyCity'; }
        else { slot = first; start = i; }
      }
      if (cmd.name === 'governor' && argWords.length > 1) slot = 'focus', start = argWords.length - 1;
      if (cmd.name === 'enchant' && argWords.length > 1) slot = 'enchant', start = argWords.length - 1;
      if (cmd.name === 'declare' && /^war$/i.test(argWords[0]) && argWords.length > 1) slot = 'realm', start = 1;
    }
    if (!slot) return { items: [], from: line.length, word: '' };
    // multi-word names: the phrase since the slot start is the query (a list after a comma restarts)
    let phrase = argWords.slice(start).join(' ');
    const comma = phrase.lastIndexOf(',');
    if (comma >= 0) phrase = phrase.slice(comma + 1).replace(/^\s*\d+\s*/, '').trimStart();
    else phrase = phrase.replace(/^(\d+|max|all|half)\s+/i, '');
    if (slot === 'units' || slot === 'unitHere' || slot === 'cargo') phrase = phrase.replace(/^\d+\s*/, '');
    const items = rank(phrase, itemsFor(slot, s, owner, ctx));
    const from = line.length - phrase.length;
    return { items: items.slice(0, 40).map(x => ({ text: x.name, label: x.name + (x.icon ? '' : ''), kind: slot })), from, word: phrase };
  };

  // help text for the encyclopedia, generated from the table
  const helpHtml = esc => {
    const e = esc || (t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    return GROUPS.map(g => `<h4>${e(g)}</h4><ul class="cli-help-list">${C.filter(c => c.group === g).map(c => `<li><code>${e(c.usage)}</code> — ${e(c.help)}${c.aliases && c.aliases.length ? ` <span class="muted">(also ${e(c.aliases.join(', '))})</span>` : ''}${(c.ex || []).length ? `<br><span class="muted">e.g. ${c.ex.map(x => `<code>${e(x)}</code>`).join(' · ')}</span>` : ''}</li>`).join('')}</ul>`).join('');
  };

  G.cli = { exec, complete, commands: C, groups: GROUPS, match, rank, helpHtml, parseXY, columns: columnList, SPEEDS };
})();
