// =====================================================================
//  Ember & Crown — UI core: helpers, layout, city/military/market/
//  movements/reports/empire/help tabs, and input wiring.
//  ui-world.js, ui-realm.js add more tabs; ui-boot.js starts the loop.
// =====================================================================
'use strict';

let S = null;                 // game state
const UI = {
  tab: 'city', city: null, sel: null, form: {}, mode: 'raid', openReport: null, holding: false,
  start: { race: 'hearth', difficulty: 'normal', pace: 'standard', mode: 'conquest' },
};
const $app = document.getElementById('app');
const act = {};
const TABS = {};              // key -> { label, render(city), badge?() }
// Persistent canvases (world map, city view) re-attach themselves after every
// render through these hooks: fn(tabKey) is called once the DOM is rebuilt.
const MOUNT_HOOKS = [];
// Small HTML snippets other modules add to the top bar (sound toggle, notifications…): fn() -> html
const TOP_EXTRAS = [];
// More extension points, each an array of fn(...) -> html:
//   CITY_EXTRAS (city) — chips in the city header · REALM_EXTRAS (empire) — lines on Diplomacy realm cards
//   MARKET_EXTRAS (city) — cards appended to the Market tab
//   TILE_EXTRAS (city, tile) — html added to the world-map tile panel (before the send form)
//   TILE_PANELS (city, tile, vis) — return a whole tile panel to take over a tile (e.g. a free city), or '' to pass
//   EMPIRE_EXTRAS () — cards appended to the Empire tab · ENDGAME_EXTRAS () — html shown under the endgame banner
//   MILITARY_EXTRAS (city) — cards on the Military tab, after the garrison card (e.g. generals)
//   REPORT_EXTRAS (body) — html at the top of a battle report (e.g. the generals who fought) · MOVE_EXTRAS (move) — html after a march's troops in Movements
const CITY_EXTRAS = [], REALM_EXTRAS = [], MARKET_EXTRAS = [], TILE_EXTRAS = [], TILE_PANELS = [], EMPIRE_EXTRAS = [], ENDGAME_EXTRAS = [],
  START_EXTRAS = [], DEFEAT_EXTRAS = [], MILITARY_EXTRAS = [], REPORT_EXTRAS = [], MOVE_EXTRAS = [];   // START_EXTRAS () — cards on the start screen · DEFEAT_EXTRAS () — html under 'your last city has fallen'
if (G.seasonChip) CITY_EXTRAS.push(G.seasonChip);
const extras = (list, ...a) => list.map(f => { try { return f(...a) || ''; } catch (e) { console.error(e); return ''; } }).join('');
const runMountHooks = () => { for (const h of MOUNT_HOOKS) { try { h(UI.tab); } catch (e) { console.error(e); } } };

// ---------------------------------------------------------------------
// player options (stored apart from saves, so they survive new games and never touch S)
// ---------------------------------------------------------------------
const OPT_KEY = 'emberCrown_options';
const OPT_DEF = { reduceMotion: false, largeText: false, cbColors: false, autosave: 15 };
const AUTOSAVE_CHOICES = [10, 15, 30, 60, 120];
const OPTS = (() => { try { return { ...OPT_DEF, ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }; } catch (e) { return { ...OPT_DEF }; } })();
const saveOpts = () => { try { localStorage.setItem(OPT_KEY, JSON.stringify(OPTS)); } catch (e) { } };
// colour-blind-friendly empire colours (Okabe–Ito): applied to the rendered HTML and the map only, S keeps its colours
const CB_PAL = ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9', '#f0e442', '#8c8c8c'];
let cbSig = '', cbMap = null, cbRe = null;
const cbMapping = () => {
  const emps = Object.values(S.empires).sort((a, b) => (a.id === 'p' ? -1 : b.id === 'p' ? 1 : 0));
  const sig = emps.map(e => e.id + e.color).join();
  if (sig !== cbSig) {
    cbSig = sig; cbMap = new Map(); let i = 0;
    for (const e of emps) { const k = String(e.color || '').toLowerCase(); if (/^#[0-9a-f]{3,8}$/.test(k) && !cbMap.has(k)) cbMap.set(k, e.id === 'p' ? CB_PAL[0] : CB_PAL[1 + (i++ % (CB_PAL.length - 1))]); }
    cbRe = cbMap.size ? new RegExp([...cbMap.keys()].sort((a, b) => b.length - a.length).join('|') + '(?![0-9a-f])', 'gi') : null;
  }
  return cbMap;
};
// the map asks for colours many times a frame: use the mapping built by the last render (rebuilt when empires change)
window.ecDisplayColor = c => (OPTS.cbColors && S && (cbMap || cbMapping()).get(String(c).toLowerCase())) || c;
const paint = html => (OPTS.cbColors && S && cbMapping() && cbRe ? html.replace(cbRe, m => cbMap.get(m.toLowerCase()) || m) : html);
const applyOpts = () => {
  const h = document.documentElement;
  h.classList.toggle('ec-reduce-motion', !!OPTS.reduceMotion);
  h.classList.toggle('ec-large-text', !!OPTS.largeText);
  window.ecPaletteKey = OPTS.cbColors ? 'cb' : '';
};
applyOpts();

// ---------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => {
  n = Math.floor(n);
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
  return String(n);
};
const fmtRate = r => (r >= 0 ? '+' : '') + (Math.abs(r) < 10 ? r.toFixed(1) : Math.round(r));
const fmtTime = sec => {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
};
const realSecs = gameSecs => gameSecs / S.settings.speed;
const clock = t => {
  const day = Math.floor(t / G.DAY) + 1;
  const mins = Math.floor((t % G.DAY) / G.DAY * 1440);
  return `Day ${day}, ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};
const calendar = () => { const se = G.season(S); return `${se.name}, Year ${se.year}`; };
const ago = t => fmtTime(realSecs(S.time - t)) + ' ago';
const gIcon = g => g === 'gold' ? '🪙' : DATA.goods[g].icon;
const gName = g => g === 'gold' ? 'Gold' : DATA.goods[g].name;
const pct = (a, b) => Math.max(0, Math.min(100, b > 0 ? a / b * 100 : 0));

const costHtml = (cost, city, mult = 1) => `<div class="cost">${Object.entries(cost).map(([g, v]) => {
  const have = g === 'gold' ? S.empires[city.owner].gold : (city.res[g] || 0);
  return `<span class="${have < v * mult ? 'lack' : ''}" title="${gName(g)}">${gIcon(g)} ${fmt(v * mult)}</span>`;
}).join('')}</div>`;
const unitsHtml = units => {
  const e = Object.entries(units || {}).filter(([, n]) => n > 0);
  return e.length ? e.map(([u, n]) => `${DATA.units[u].icon} ${n} ${DATA.units[u].name}`).join(', ') : '<span class="muted">none</span>';
};
// ---- portraits (js/portraits.js) -------------------------------------
// Every helper returns '' (or the plain text fallback) when portraits are not loaded, e.g. in node tests.
// Specs are only built here so their key order stays stable for G.portrait's cache; nothing that changes
// every tick goes into a spec (hero wounds are quantized).
const PT_MONSTER = { beast: 'beast', brigand: 'brigand', risen: 'undead', restless: 'undead', wyrm: 'wyrm', starbeast: 'beast', elemental: 'elemental', demon: 'demon' };
let ptRaceMap = null;
const unitRace = u => {
  if (!ptRaceMap) { ptRaceMap = {}; for (const r of DATA.raceOrder) for (const x of DATA.races[r].units || []) ptRaceMap[x] = r; }
  return ptRaceMap[u];
};
// technology era 0..3 from research progress (share of all techniques researched × 4); part of every portrait spec
G.techEra = G.techEra || ((s, owner) => {
  const e = s && s.empires && s.empires[owner];
  if (!e || !G.research) return 0;
  const done = Object.keys(G.research(s, owner).done || {}).filter(k => DATA.techs[k]).length;
  const total = Object.keys(DATA.techs).length || 1;
  return Math.max(0, Math.min(3, Math.floor(done / total * 4)));
});
const ptEra = owner => (typeof S !== 'undefined' && S ? G.techEra(S, owner) : 0);
const ptOn = () => typeof G.portraitHtml === 'function';
// a portrait wrapped in a token span; tip = hover label (also the accessible name)
const ptHtml = (spec, size, cls = '', tip = '') => {
  if (!ptOn() || !spec) return '';
  try { return `<span class="pt-tok ${cls}"${tip ? ` data-tip="${esc(tip)}" aria-label="${esc(tip)}"` : ' aria-hidden="true"'}>${G.portraitHtml(spec, size)}</span>`; } catch (e) { console.error(e); return ''; }
};
const ptEmp = id => (typeof S !== 'undefined' && S && S.empires && S.empires[id]) || null;
const ptEmpByName = name => (typeof S !== 'undefined' && S && S.empires && name) ? Object.values(S.empires).find(e => e.name === name) || null : null;
const heroSpec = (h, owner) => {
  const e = ptEmp(owner) || {};
  const gear = {};
  for (const sl of ['weapon', 'armor', 'horse', 'trinket']) { const it = h && h.eq && h.eq[sl]; if (it) gear[sl] = [it.icon, it.name].filter(Boolean).join(' '); }
  return { race: e.race || 'hearth', kind: 'hero', seed: (h && h.name) || 'hero', color: e.color, rank: Math.min(10, Math.round(((h && h.level) || 1) / 2)), era: ptEra(owner),
    gear: Object.keys(gear).length ? gear : undefined, wounded: h && !h.dead ? Math.round(Math.max(0, 100 - h.hp) / 25) / 4 : 0, dead: !!(h && h.dead) };
};
const rulerSpec = e => ({ race: e.race, kind: 'ruler', seed: e.name, color: e.color, era: ptEra(e.id) });
const unitSpec = (u, owner) => {
  if (PT_MONSTER[u]) return { kind: 'monster', role: PT_MONSTER[u], seed: u };
  const e = ptEmp(owner);
  if (u === 'hero') { const h = e && (owner === 'p' ? e.hero : (G.heroOf ? G.heroOf(S, owner) : e.hero)); return heroSpec(h || { name: 'hero', level: 1, hp: 100 }, owner); }
  const rank = e && G.upgradeLevel ? Math.max(G.upgradeLevel(S, owner, u, 'a'), G.upgradeLevel(S, owner, u, 'd')) : 0;
  return { race: unitRace(u) || (e && e.race) || 'hearth', kind: 'unit', unit: u, color: e ? e.color : undefined, rank, era: e ? ptEra(owner) : 1 };
};
const unitName = u => (DATA.units[u] ? DATA.units[u].name : u);
// one unit token: portrait + count badge (+ red loss badge)
const unitTok = (u, owner, size, n, lost) => ptHtml(unitSpec(u, owner), size, 'pt-unit',
  `${unitName(u)}${n != null ? ` × ${n}` : ''}${lost ? ` (lost ${lost})` : ''}`).replace(/<\/span>$/, `${n != null ? `<b class="pt-n">${fmt(n)}</b>` : ''}${lost ? `<i class="pt-lost">−${fmt(lost)}</i>` : ''}</span>`);
// a row of unit tokens with counts (and losses); falls back to the plain text list
const unitTokens = (units, owner, lost, size = 30) => {
  const e = Object.entries(units || {}).filter(([, n]) => n > 0);
  if (!ptOn()) return unitsHtml(units);
  if (!e.length) return '<span class="muted">none</span>';
  return `<span class="pt-row">${e.map(([u, n]) => unitTok(u, owner, size, n, lost && lost[u])).join('')}</span>`;
};
const goodsHtml = goods => {
  const e = Object.entries(goods || {}).filter(([, n]) => n > 0);
  return e.length ? e.map(([g, n]) => `${gIcon(g)} ${fmt(n)}`).join(' ') : '<span class="muted">nothing</span>';
};

let toastT = null;
const toast = msg => {
  if (!msg) return;
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3000);
};

const visibleGoods = () => DATA.goodOrder.filter(g => !DATA.goods[g].race || DATA.goods[g].race === S.empires.p.race);
const curCity = () => {
  let c = S.cities[UI.city];
  if (!c || c.owner !== 'p') { c = G.citiesOf(S, 'p')[0]; UI.city = c && c.id; }
  return c;
};

// ---------------------------------------------------------------------
// start screen
// ---------------------------------------------------------------------
const choice = (id, map, cur, label) => `<label>${label}<select id="${id}">${Object.entries(map).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v.name} — ${v.desc}</option>`).join('')}</select></label>`;
const renderStart = () => {
  const st = UI.start;
  $app.innerHTML = `<div class="start">
    <h1>🔥 Ember &amp; Crown 👑</h1>
    <p class="tag">From a muddy hamlet to an empire of cities. Farm, quarry and smelt; forge tools and weapons; lead a hero into forgotten ruins; bargain or war with three rival peoples. No shop, no premium currency — only what you build.</p>
    <h3>Choose your people</h3>
    <div class="races">${DATA.raceOrder.map(r => {
      const R = DATA.races[r];
      const champ = (R.heroNames || (DATA.heroNames || {})[r] || [R.name])[0];
      const pic = ptHtml({ race: r, kind: 'hero', seed: champ, color: R.color, rank: 3, era: 1 }, 72, 'pt-card', `A champion of the ${R.name}`);
      return `<div class="card race ${st.race === r ? 'sel' : ''}" data-act="pickRace" data-r="${r}">
        ${pic ? `<div class="pt-racehead">${pic}<h3><span class="dot" style="background:${R.color}"></span>${R.name}</h3></div>` : `<h3><span class="dot" style="background:${R.color}"></span>${R.name}</h3>`}
        <p>${R.blurb}</p>
        <ul>${R.perks.map(p => `<li>${p}</li>`).join('')}</ul>
        <p style="margin-top:8px">Troops: ${R.units.map(u => DATA.units[u].icon + ' ' + DATA.units[u].name).join(', ')}</p>
      </div>`;
    }).join('')}</div>
    <div class="card start-form">
      <label>Name of your realm<input id="sName" value="${esc(st.name || 'Kingdom of ' + ['Ashvale', 'Brightmoor', 'Duskhaven', 'Emberfall'][Math.floor(Math.random() * 4)])}"></label>
      <label>Name of your first settlement<input id="sCity" value="${esc(st.city || 'Hearthstead')}"></label>
      <label>Name of your hero<input id="sHero" value="${esc(st.hero || ['Aldric', 'Maren', 'Tavish', 'Isolde', 'Brannoc'][Math.floor(Math.random() * 5)])}"></label>
      ${choice('sPace', DATA.pace, st.pace, 'Pace')}
      ${choice('sMode', DATA.modes, st.mode, 'Mode')}
      <label>Rival realms<select id="sRivals">${[1, 2, 3, 4, 5, 6, 7].filter(n => n < DATA.raceOrder.length).map(n => `<option value="${n}" ${String(st.rivals || 3) === String(n) ? 'selected' : ''}>${n} rival${n > 1 ? 's' : ''}${n === 3 ? ' — classic' : n >= 6 ? ' — a crowded, larger world' : ''}</option>`).join('')}</select></label>
      <label title="Grows with the number of rivals. Small: 31×31 with 3 rivals · Normal: 52×52 · Large: 64×64">World size<select id="sWorld">${Object.entries(G.WORLD_SIZES || {}).map(([k, w]) => `<option value="${k}" ${(st.world || 'normal') === k ? 'selected' : ''}>${w.name}${{ small: ' — the classic map, close quarters', normal: ' — room for many cities in different lands', large: ' — vast frontiers, long marches' }[k] || ''}</option>`).join('')}</select></label>
      <label>Rivals<select id="sDiff">
        ${['easy', 'normal', 'hard'].map(d => `<option value="${d}" ${st.difficulty === d ? 'selected' : ''}>${{ easy: 'Gentle — slow, peaceful rivals', normal: 'Fair — rivals grow as you do', hard: 'Harsh — fast, warlike rivals' }[d]}</option>`).join('')}
      </select></label>
      <button class="primary" data-act="begin" style="padding:10px">Found your realm</button>
    </div>
    ${extras(START_EXTRAS)}
    ${savesHtml(false)}
  </div>`;
};
// save slots + export/import (start screen and Empire tab)
const savesHtml = inGame => {
  const slots = [1, 2, 3].map(n => {
    const i = G.slotInfo(n);
    return `<div class="slot"><b>Slot ${n}</b> ${i ? `<span>${esc(i.realm)} · ${DATA.races[i.race].name} · ${i.cities} cit${i.cities === 1 ? 'y' : 'ies'} · ${clockOf(i.time)}<br><span class="muted" style="font-size:11px">saved ${new Date(i.savedAt).toLocaleString()}</span></span>` : '<span class="muted">empty</span>'}
      <span class="spacer"></span>${inGame ? `<button class="small" data-act="saveSlot" data-n="${n}">Save here</button>` : ''}${i ? `<button class="small ${inGame ? '' : 'primary'}" data-act="loadSlot" data-n="${n}">Load</button><button class="small" data-act="clearSlot" data-n="${n}" title="Delete this save">✕</button>` : ''}</div>`;
  }).join('');
  return `<div class="card saves"><h3>💾 Saved realms</h3>
    <p class="muted" style="font-size:12.5px;margin-top:0">The game autosaves in this browser every ${OPTS.autosave} seconds. Keep extra copies in slots, or export a file to back up or move your realm to another browser.</p>
    ${slots}
    <div class="row" style="margin-top:8px">${inGame ? '<button class="small" data-act="exportSave">⬇️ Export to file</button>' : ''}<button class="small" data-act="importSave">⬆️ Import from file</button><input type="file" id="importFile" accept=".json,application/json" style="display:none"></div></div>`;
};
const clockOf = t => {
  return `${Math.floor(t / 3600)}h ${Math.floor(t % 3600 / 60)}m played`; };
const readStart = () => {
  const v = id => document.getElementById(id).value;
  Object.assign(UI.start, { name: v('sName'), city: v('sCity'), hero: v('sHero'), pace: v('sPace'), mode: v('sMode'), difficulty: v('sDiff'), rivals: +v('sRivals'), world: document.getElementById('sWorld') ? v('sWorld') : 'normal' });
};

// ---------------------------------------------------------------------
// layout pieces
// ---------------------------------------------------------------------
const incoming = () => S.moves.filter(m => m.owner !== 'p' && ['raid', 'attack', 'conquer'].includes(m.type) &&
  (() => { const t = G.tileAt(S, m.x, m.y); return (t.city && S.cities[t.city].owner === 'p') || (t.oasis && t.oasis.owner && S.cities[t.oasis.owner] && S.cities[t.oasis.owner].owner === 'p'); })());

const SPEEDS = [1, 2, 5, 10, 25];
const renderTop = city => {
  if (UI.resTip) queueMicrotask(renderResTip);   // the top bar is about to be replaced: redraw the open tooltip on the new anchor
  const emp = S.empires.p;
  const e = G.econ(S, city);
  const ren = G.renown(S, 'p'), next = G.nextCityRenown(S, 'p');
  return `<div class="top">
    <div class="top-1">
      <span class="brand">🔥 Ember &amp; Crown</span>
      <span class="pill" style="border-color:${DATA.races[emp.race].color}">${esc(emp.name)} · ${DATA.races[emp.race].name}</span>
      <span class="res-gold" data-good="gold" tabindex="0" aria-label="Gold: hover or tap for income and upkeep">🪙 <b>${fmt(emp.gold)}</b> <span class="muted">${fmtRate(G.citiesOf(S, 'p').reduce((a, c) => { const ce = G.econ(S, c); return a + ce.tax - (ce.wages || 0); }, 0))}/min</span></span>
      <span title="Renown: total building levels + victories. Unlocks new cities.">⭐ <b>${ren}</b> <span class="muted">${next === Infinity ? '' : '/ ' + next + ' for next city'}</span></span>
      <span class="spacer"></span>
      <span class="muted" title="${DATA.pace[S.settings.pace].name} pace · ${DATA.modes[S.settings.mode].name}">${calendar()} · ${clock(S.time)}</span>
      <button class="small ec-pause ${UI.paused ? 'on' : ''}" data-act="togglePause" title="${UI.paused ? 'Resume (Space)' : 'Pause (Space)'}" aria-label="${UI.paused ? 'Resume' : 'Pause'}" aria-pressed="${UI.paused ? 'true' : 'false'}">${UI.paused ? '▶️ Paused' : '⏸'}</button>
      <label class="muted">Speed <select id="speedSel">${SPEEDS.map(v => `<option value="${v}" ${S.settings.speed === v ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>
      ${TOP_EXTRAS.map(f => { try { return f() || ''; } catch (e) { return ''; } }).join('')}
      <button class="small" data-act="save">Save</button>
      <button class="small" data-act="newgame">New game</button>
      <button class="small" data-act="popKeys" title="Keyboard shortcuts" aria-label="Keyboard shortcuts" aria-expanded="${UI.pop === 'keys'}">⌨️</button>
      <button class="small" data-act="popOptions" title="Options: motion, text size, colours, autosave" aria-label="Options" aria-expanded="${UI.pop === 'options'}">🎛️</button>
    </div>
    <div class="res-bar">
      <div class="res" title="Citizens / housing left for civilians. Workers needed: ${e.workersReq}. Soldiers enrolled: ${e.soldiers} (barracks quarters ${e.quarters}).">
        <span class="muted">👥 People</span><span class="v">${fmt(city.pop)} / ${e.civCap}</span><span class="r ${e.eff < 1 ? 'bad' : 'muted'}">${e.eff < 1 ? 'Short of workers ' + Math.round(e.eff * 100) + '%' : 'idle ' + fmt(e.idle)}${e.soldiers ? ' · 🛡️' + fmt(e.soldiers) : ''}</span></div>
      ${visibleGoods().map(g => {
        const v = city.res[g] || 0, r = e.net[g] || 0;
        const full = v >= e.cap * 0.98, short = city.short && city.short[g];
        return `<div class="res ${full ? 'full' : ''} ${short ? 'short' : ''} ${UI.resTip && UI.resTip.g === g ? 'tip-on' : ''}" data-good="${g}" tabindex="0" aria-label="${DATA.goods[g].name}: ${Math.floor(v)} of ${e.cap}${short ? ', shortage' : ''}. Hover or tap for production and use.">
          <span class="muted">${DATA.goods[g].icon} ${DATA.goods[g].name}</span>
          <span class="v">${fmt(v)}</span>
          <span class="r ${r < -0.05 ? 'bad' : r > 0.05 ? 'good' : 'muted'}">${fmtRate(r)}/min</span>
          <span class="cap"><i style="width:${pct(v, e.cap)}%"></i></span>
        </div>`;
      }).join('')}
      <div class="res"><span class="muted">📦 Storage</span><span class="v">${fmt(e.cap)}</span><span class="r muted">hidden ${fmt(e.protect)}</span></div>
    </div>
  </div>`;
};

// ---------------------------------------------------------------------
// Resource tooltips: hover (or tap) a good in the top bar for where it comes from and where it goes.
// The popover lives outside the re-rendered top bar (#ecResPop on <body>) and is redrawn after every
// render from UI.resTip = { g, pinned }, so it stays open while the numbers tick.
// ---------------------------------------------------------------------
let resPopEl = null;
const resKey = l => l.replace(/\s*\(.*\)$/, '').replace(/\s+\d+$/, '');
const resTipHtml = (g) => {
  const city = curCity();
  if (!city) return '';
  const realm = !!UI.resRealm;
  const cities = realm ? G.citiesOf(S, 'p') : [city];
  const isGold = g === 'gold';
  const lines = new Map();
  let net = 0, stock = 0, cap = 0, shortN = 0;
  for (const c of cities) {
    const e = G.econ(S, c), parts = G.econParts(S, c, e);
    for (const p of parts[g] || []) {
      const k = (realm ? resKey(p.label) : p.label) + '|' + (p.amount >= 0 ? '+' : '-');
      const l = lines.get(k) || { label: realm ? resKey(p.label) : p.label, amount: 0, ext: p.ext };
      l.amount += p.amount; lines.set(k, l);
    }
    net += isGold ? e.tax - (e.wages || 0) : (e.net[g] || 0);
    if (!isGold) { stock += c.res[g] || 0; cap += e.cap; }
    if (c.short && c.short[g]) shortN++;
  }
  if (isGold) stock = S.empires.p.gold;
  const all = [...lines.values()].filter(l => Math.abs(l.amount) >= 0.005);
  const prod = all.filter(l => l.amount > 0).sort((a, b) => b.amount - a.amount);
  const used = all.filter(l => l.amount < 0).sort((a, b) => a.amount - b.amount);
  const row = (l, cls) => `<tr><td>${esc(l.label)}${l.ext ? ' <span class="muted">(at the slow tick)</span>' : ''}</td><td class="${cls}">${fmtRate(l.amount)}</td></tr>`;
  const name = isGold ? 'Gold' : DATA.goods[g].name, icon = isGold ? '🪙' : DATA.goods[g].icon;
  let mult = '';
  if (!realm && !isGold && (DATA.goods[g].raw || g === 'mana' || (DATA.goods[g].race && prod.length))) {
    const m = G.prodMults(S, city, g);
    if (m.list.length) mult = `<div class="rt-mult"><span class="muted">Output multipliers ×${m.total.toFixed(2)}:</span> ${m.list.map(x => `<span class="${x.mult < 1 ? 'bad' : ''}">${esc(x.label)} ×${x.mult.toFixed(2)}</span>`).join(' · ')}</div>`;
  }
  let eta = '';
  if (isGold) eta = net < -0.05 ? `empty in ${fmtTime(realSecs(stock / -net * 60))}` : '';
  else if (net > 0.05) eta = stock >= cap * 0.999 ? '<span class="bad">full — new goods are lost</span>' : `full in ${fmtTime(realSecs((cap - stock) / net * 60))}`;
  else if (net < -0.05) eta = stock <= 0.5 ? '<span class="bad">empty</span>' : `empty in ${fmtTime(realSecs(stock / -net * 60))}`;
  else eta = 'steady';
  const hint = shortN ? `<div class="rt-short">⚠️ ${realm ? shortN + ' cit' + (shortN > 1 ? 'ies are' : 'y is') + ' short. ' : ''}${esc(G.SHORT_TEXT[g] || 'Shortage.')}</div>` : '';
  const wear = !shortN && !realm && city.wear && city.wear[g] > 0 ? `<div class="rt-warn">Upkeep went unpaid for ${city.wear[g].toFixed(1)} min — a shortage starts after ${G.SINK.grace[g]} min.</div>` : '';
  const multiCity = G.citiesOf(S, 'p').length > 1;
  return `<div class="hd"><span>${icon} ${esc(name)} <span class="muted rt-where">${realm ? 'whole realm' : esc(city.name)}${isGold && !realm ? ' (gold is shared)' : ''}</span></span>
      ${multiCity ? `<button class="small" data-restip-realm aria-pressed="${realm}">${realm ? 'This city' : 'Realm'}</button>` : ''}</div>
    ${prod.length ? `<div class="rt-h">Produced</div><table>${prod.map(l => row(l, 'good')).join('')}</table>` : '<div class="rt-h muted">Nothing makes this here.</div>'}
    ${mult}
    ${used.length ? `<div class="rt-h">Used</div><table>${used.map(l => row(l, 'bad')).join('')}</table>` : ''}
    <table class="rt-sum"><tr><td>Net per minute</td><td class="${net < -0.05 ? 'bad' : net > 0.05 ? 'good' : ''}"><b>${fmtRate(net)}</b></td></tr>
      <tr><td>${isGold ? 'Treasury' : 'Stock'}</td><td>${fmt(stock)}${isGold ? '' : ' / ' + fmt(cap)}</td></tr>
      <tr><td></td><td class="muted">${eta}</td></tr></table>
    ${hint}${wear}`;
};
const renderResTip = () => {
  if (!resPopEl) { resPopEl = document.createElement('div'); resPopEl.id = 'ecResPop'; resPopEl.setAttribute('role', 'tooltip'); document.body.appendChild(resPopEl); }
  const t = UI.resTip;
  const anchor = t && S && $app.querySelector(`.top [data-good="${t.g}"]`);
  let html = '';
  if (anchor) { try { html = resTipHtml(t.g); } catch (e) { console.error(e); } }
  if (!html) { resPopEl.classList.remove('on'); resPopEl.innerHTML = ''; return; }
  if (html !== resPopEl._html) { resPopEl.innerHTML = html; resPopEl._html = html; }
  resPopEl.classList.add('on');
  resPopEl.classList.toggle('pinned', !!t.pinned);
  $app.querySelectorAll('.top [data-good]').forEach(el => el.classList.toggle('tip-on', el === anchor));
  if (window.innerWidth <= 700) { resPopEl.classList.add('sheet'); resPopEl.style.top = ''; resPopEl.style.left = ''; return; }
  resPopEl.classList.remove('sheet');
  const r = anchor.getBoundingClientRect(), w = resPopEl.offsetWidth || 320, h = resPopEl.offsetHeight || 200;
  const below = r.bottom - 1, top = below + h > window.innerHeight - 8 && r.top - h > 8 ? r.top - h + 1 : below;
  resPopEl.style.top = Math.round(Math.max(8, top)) + 'px';
  resPopEl.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.left))) + 'px';
};
const closeResTip = () => { if (!UI.resTip) return; UI.resTip = null; renderResTip(); $app.querySelectorAll('.top .tip-on').forEach(el => el.classList.remove('tip-on')); };
const resAnchorOf = t => t && t.closest && t.closest('.top [data-good]');
document.addEventListener('pointerover', ev => {
  if (ev.pointerType === 'touch') return;
  const a = resAnchorOf(ev.target);
  if (a) { if (!UI.resTip || !UI.resTip.pinned || UI.resTip.g !== a.dataset.good) { if (!(UI.resTip && UI.resTip.pinned)) { UI.resTip = { g: a.dataset.good, pinned: false }; renderResTip(); } } return; }
  if (UI.resTip && !UI.resTip.pinned && !(resPopEl && resPopEl.contains(ev.target))) closeResTip();
});
document.addEventListener('pointerout', ev => { if (!ev.relatedTarget && UI.resTip && !UI.resTip.pinned && ev.pointerType !== 'touch') closeResTip(); });
document.addEventListener('click', ev => {
  if (resPopEl && resPopEl.contains(ev.target)) {
    if (ev.target.closest('[data-restip-realm]')) { UI.resRealm = !UI.resRealm; if (UI.resTip) UI.resTip.pinned = true; resPopEl._html = ''; renderResTip(); }
    return;
  }
  const a = resAnchorOf(ev.target);
  if (a) { const g = a.dataset.good; if (UI.resTip && UI.resTip.g === g && UI.resTip.pinned) closeResTip(); else { UI.resTip = { g, pinned: true }; renderResTip(); } return; }
  if (UI.resTip) closeResTip();
});
document.addEventListener('focusout', ev => { if (resAnchorOf(ev.target) && UI.resTip && !UI.resTip.pinned && !resAnchorOf(ev.relatedTarget)) closeResTip(); });
document.addEventListener('focusin', ev => { const a = resAnchorOf(ev.target); if (a && !(UI.resTip && UI.resTip.pinned)) { UI.resTip = { g: a.dataset.good, pinned: false }; renderResTip(); } });
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && UI.resTip) { closeResTip(); ev.preventDefault(); return; }
  if ((ev.key === 'Enter' || ev.key === ' ') && resAnchorOf(document.activeElement)) { ev.preventDefault(); ev.stopPropagation(); const g = document.activeElement.dataset.good; if (UI.resTip && UI.resTip.g === g && UI.resTip.pinned) closeResTip(); else { UI.resTip = { g, pinned: true }; renderResTip(); } }
}, true);
window.addEventListener('resize', () => { if (UI.resTip) renderResTip(); });
window.addEventListener('scroll', () => { if (UI.resTip && window.innerWidth > 700) renderResTip(); }, { passive: true });

const renderSide = city => `<aside class="side">
    <div class="nav">${Object.entries(TABS).map(([k, t]) => { const b = t.badge ? t.badge() : 0; return `<button class="${UI.tab === k ? 'on' : ''} ${b ? 'has-badge' : ''}" data-act="tab" data-t="${k}">${t.label}${b ? `<span class="badge">${b}</span>` : ''}</button>`; }).join('')}</div>
    <div class="card citylist"><h4>Your cities</h4>${G.citiesOf(S, 'p').map(c => `<button class="${c.id === city.id ? 'on' : ''}" data-act="city" data-c="${c.id}">${esc(c.name)}<small>${G.tier(c).name} · (${c.x}, ${c.y})${c.buildQueue.length ? ' · 🔨' : ''}${c.units.hero ? ' · 🦸' : ''}${c.starving ? ' · <span class="bad">hungry</span>' : ''}</small></button>`).join('')}</div>
  </aside>`;

const renderRight = () => {
  const inc = incoming();
  return `<aside class="side right">
    ${inc.length ? `<div class="alert"><b>⚠️ Incoming attacks</b>${inc.map(m => {
      const t = G.tileAt(S, m.x, m.y);
      return `<div>${esc(S.empires[m.owner].name)} → ${t.city ? esc(S.cities[t.city].name) : 'an oasis'} in <b>${fmtTime(realSecs(m.arrive - S.time))}</b></div>`;
    }).join('')}</div>` : ''}
    ${renderPending()}
    ${renderQuests()}
    <div class="card"><h4>Chronicle</h4><div class="log">${S.log.slice(0, 50).map(l => `<div class="${l.kind}"><time>${clock(l.t).replace(/^Day /, 'D')}</time>${esc(l.text)}</div>`).join('')}</div></div>
  </aside>`;
};

// ---------------------------------------------------------------------
// City tab
// ---------------------------------------------------------------------
const prodLine = (city, type, e) => {
  const b = DATA.buildings[type];
  const L = G.lvl(city, type);
  if (b.prod && L) return Object.keys(b.prod).map(g => `${DATA.goods[g].icon} ${fmtRate(e.raw[g] || 0)}/min`).join(' ');
  const ref = e.refiners.find(r => r.type === type);
  if (ref) {
    const eff = city.refineEff && city.refineEff[type] !== undefined ? city.refineEff[type] : 1;
    const ins = Object.entries(ref.in).map(([g, v]) => `${DATA.goods[g].icon}${v.toFixed(1)}`).join(' + ');
    const outs = Object.entries(ref.out).map(([g, v]) => `${DATA.goods[g].icon}${v.toFixed(1)}`).join(' ');
    const warn = !ref.off && eff < 0.95 ? ` <span class="warn">(running at ${Math.round(eff * 100)}% — short of input or storage)</span>` : '';
    return ref.off ? '<span class="muted">Paused</span>' : `${ins} → ${outs} /min${warn}`;
  }
  switch (type) {
    case 'houses': return `Population cap ${e.popCap}`;
    case 'warehouse': return `Stores ${fmt(e.cap)} of each good, ${fmt(e.protect)} hidden`;
    case 'townhall': return `${G.tier(city).name} · builds ${Math.round(5 * Math.max(0, L - 1))}% faster · ${G.oasisSlots(city)} oasis slot(s)`;
    case 'wall': return L ? `+${Math.round((G.cityDefense(S, city).mult - 1) * 100)}% garrison defense` : '';
    case 'market': return L ? `Caravans carry ${G.caravanCap(S, city)}` : '';
    case 'barracks': case 'stable': return L ? `Trains ${Math.round(3 * (L - 1))}% faster` : '';
    case 'warpit': return L ? `−${3 * L}% training time, +${L}% attack` : '';
    case 'academy': return L ? 'Research in the 📚 Research tab' : '';
    case 'tavern': return L ? `+${3 * L} happiness` : '';
    case 'temple': return L ? `+${2 * L} happiness · +${2 * L} culture/min` : '';
    case 'theatre': return L ? `+${(1.5 * L).toFixed(1)} happiness · +${3 * L} culture/min` : '';
  }
  return '';
};

// site survey: stars per raw good, prosperity, and which people would thrive here
const siteHtml = (site, compact) => {
  const star = m => '★'.repeat(G.stars(m)) + '<span class="dimstar">' + '★'.repeat(5 - G.stars(m)) + '</span>';
  const goods = ['grain', 'timber', 'stone', 'ore'].map(g => `<span class="site-g" title="${DATA.goods[g].name}: ×${site[g].toFixed(2)} production">${DATA.goods[g].icon} ${star(site[g])}</span>`).join('');
  const DEP = { ore: '⛏️ rich ore vein', stone: '🪨 fine quarry stone', timber: '🌲 ancient grove', grain: '🌾 black earth' };
  const extra = [site.river ? '🏞️ river' : '', site.lake ? '💧 lakeside' : '', ...(site.deposits || []).map(g => DEP[g] || g)].filter(Boolean).join(' · ');
  const best = DATA.raceOrder.map(r => [r, G.siteFit(site, r)]).sort((a, b) => b[1] - a[1])[0];
  return `<div class="site ${compact ? 'compact' : ''}">${goods}${extra ? `<span class="site-g good" title="+10% taxes and growth by a river, +5% by a lake; more grain. Deposits strongly lift one good (up to +50%).">${extra}</span>` : ''}${compact ? '' : `<span class="site-g muted">Best suited to the ${DATA.races[best[0]].name}</span>`}</div>`;
};
const GOOD_IF_LOW = { buildTime: 1, researchTime: 1, trainTime: 1, upkeep: 1 };
const renderCity = city => {
  const e = G.econ(S, city);
  const terr = DATA.terrain[city.terrain];
  const mods = (city.mods || []).filter(m => m.until > S.time).concat((S.empires.p.mods || []).filter(m => m.until > S.time));
  const oases = (city.oases || []).map(i => S.tiles[i]);
  const parts = [];
  if (typeof cityViewHtml === 'function') parts.push(cityViewHtml(city));   // graphical town (cityview.js)
  parts.push(`<div class="card"><div class="row">
      <h2 style="margin:0">${esc(city.name)}</h2><button class="small" data-act="rename">Rename</button>
      <span class="pill">${G.tier(city).name}</span>
      <span class="pill">${terr.name}</span>
      ${oases.map(t => `<span class="pill" title="Oasis at (${t.x}, ${t.y})">🏝️ +25% ${DATA.goods[t.oasis.bonus].name}</span>`).join('')}
      <span class="spacer"></span>
      <span title="Loyalty falls when heralds attack; it recovers over time">🏳️ Loyalty ${Math.round(city.loyalty)}%</span>
    </div>
    ${siteHtml(G.site(S, city), true)}
    ${typeof cityExtrasHtml === 'function' ? cityExtrasHtml(city) : ''}
    ${extras(CITY_EXTRAS, city)}
    <div class="row muted" style="margin-top:6px;font-size:13px">
      <span title="Housing ${e.popCap}: ${e.civCap} left for civilians after ${Math.max(0, e.soldiers - e.quarters)} soldiers beyond the barracks quarters">👥 ${Math.floor(city.pop)} citizens (${e.workersReq} needed as workers) · 🛡️ ${e.soldiers} enrolled · 🏠 ${e.popCap} housing</span>·
      <span title="A city's reach grows with its population: how far it sees and which oases it can hold">🧭 reach ${G.cityReach(S, city).toFixed(1)} tiles</span>·
      <span>🍽️ eating ${(e.popFood).toFixed(1)}/min, troops ${(e.upkeep).toFixed(1)}/min</span>·
      <span>🪙 taxes ${fmtRate(e.tax)}/min</span>
      ${city.starving ? '<span class="bad"><b>· Famine! Build farms or buy grain.</b></span>' : ''}
    </div>
    ${mods.length ? `<div class="row" style="margin-top:6px">${mods.map(m => `<span class="pill ${(m.mult >= 1) !== !!GOOD_IF_LOW[m.key] ? 'good' : 'bad'}">${esc(m.label)} · ${fmtTime(realSecs(m.until - S.time))}</span>`).join('')}</div>` : ''}
  </div>`);

  parts.push(`<div class="card"><h3>Construction <span class="muted" style="font-size:13px">(${city.buildQueue.length} queued${city.buildQueue.length ? ' · done in ' + fmtTime(realSecs(city.buildQueue[city.buildQueue.length - 1].end - S.time)) : ''})</span></h3>
    ${city.buildQueue.length ? city.buildQueue.map((q, i) => {
      const b = DATA.buildings[q.type];
      const active = q.start <= S.time;
      return `<div class="queue-item"><div>${b.icon} ${b.name} → level ${q.level}<div class="bar"><i style="width:${active ? pct(S.time - q.start, q.dur) : 0}%"></i></div></div>
        <span class="muted">${active ? fmtTime(realSecs(q.end - S.time)) : 'waiting · ' + fmtTime(realSecs(q.dur))}</span>
        <button class="small" data-act="cancelBuild" data-i="${i}" title="Refund ${active ? '50%' : '100%'}">✕</button></div>`;
    }).join('') : '<p class="muted">Your builders are idle.</p>'}
  </div>`);

  for (const grp of DATA.buildingGroups) {
    const cards = grp.list.map(t => {
      const b = DATA.buildings[t];
      const st = G.buildStatus(S, city, t);
      if (st.hidden) return '';
      const L = G.lvl(city, t);
      const toggle = b.recipe && L ? `<button class="small" data-act="toggleRefine" data-b="${t}">${city.refineOff[t] ? '▶ Resume' : '⏸ Pause'}</button>` : '';
      return `<div class="card bld ${st.locked && !L ? 'locked' : ''} ${UI.focusBld === t ? 'focus' : ''}" id="bld-${t}">
        <div class="head"><span class="ico">${b.icon}</span><div><b>${b.name}</b>${b.race ? ' <span class="pill">unique</span>' : ''}<div class="muted" style="font-size:12px">${prodLine(city, t, e) || ''}</div></div><span class="lv">${L ? 'Lv ' + L : '—'}</span></div>
        <div class="desc">${b.desc}</div>
        ${st.maxed ? '<div class="good">Fully upgraded</div>' : `
          ${costHtml(st.cost, city)}
          <div class="row"><button class="${st.ok ? 'primary' : ''}" data-act="build" data-b="${t}" ${st.ok ? '' : 'disabled'}>${L || city.buildQueue.some(q => q.type === t) ? 'Upgrade to ' + st.level : 'Build'}</button>
          <span class="muted" style="font-size:12px">⏱ ${fmtTime(realSecs(st.time))}</span>
          ${!st.ok ? `<span class="${st.poor ? 'muted' : 'warn'}" style="font-size:12px">${st.reason}</span>` : ''}
          <span class="spacer"></span>${toggle}</div>`}
      </div>`;
    }).join('');
    parts.push(`<div><div class="group-title">${grp.name}</div><div class="grid">${cards}</div></div>`);
  }
  return parts.join('');
};

// ---------------------------------------------------------------------
// Military tab
// ---------------------------------------------------------------------
const upBadge = u => { const a = G.upgradeLevel(S, 'p', u, 'a'), d = G.upgradeLevel(S, 'p', u, 'd'); return a || d ? `<span class="pill good" title="Forge upgrades: weapons ${a}, armour ${d}">⚒️ ${a}/${d}</span>` : ''; };
const statLine = u => `<div class="stats"><span title="Attack">⚔️ <b>${Math.round(u.atk)}</b></span><span title="Defense vs infantry">🛡️ <b>${Math.round(u.defI)}</b></span><span title="Defense vs cavalry">🐎🛡️ <b>${Math.round(u.defC)}</b></span><span title="Speed">💨 <b>${u.spd}</b></span><span title="Plunder carried">🎒 <b>${u.carry}</b></span><span title="Grain per minute">🌾 <b>${u.upkeep}</b></span></div>`;

const renderMilitary = city => {
  const parts = [];
  const garrison = Object.entries(city.units).filter(([, n]) => n > 0);
  const cd = G.cityDefense(S, city);
  parts.push(`<div class="card"><h3>Garrison of ${esc(city.name)}</h3>
    ${garrison.length ? `<table><tr><th>Unit</th><th>Count</th><th>Attack</th><th>Defense</th><th></th></tr>${garrison.map(([u, n]) => { const d = G.unitStats(S, 'p', u); const pp = G.unitPop(u); return `<tr><td class="pt-cell">${ptHtml(unitSpec(u, 'p'), 30, '', d.name) || d.icon} ${d.name}</td><td>${n}</td><td>${fmt(d.atk * n)}</td><td>${fmt((d.defI + d.defC) / 2 * n)}</td><td>${pp ? `<button class="small" data-act="dismiss" data-u="${u}" data-n="${Math.min(n, 10)}" title="Send ${Math.min(n, 10)} back to work (+${Math.min(n, 10) * pp} citizens)">Dismiss ${Math.min(n, 10)}</button>` : ''}</td></tr>`; }).join('')}</table>` : '<p class="muted">No troops stationed here. Build a Barracks and an Armory to start training.</p>'}
    ${(() => { const e = G.econ(S, city); return `<p style="font-size:12.5px;margin:6px 0 0">🛡️ <b>${e.soldiers}</b> citizens are enrolled (stationed, marching or in training). Barracks, Stable and War Pit quarters house <b>${e.quarters}</b>; the rest take homes from civilians — housing for civilians is <b>${e.civCap}</b> of ${e.popCap}. Recruits come out of the ${Math.floor(city.pop)} citizens, who are also your workers and taxpayers.</p>`; })()}
    <details class="counters"><summary>How battles work</summary>
      <ul>
        <li><b>Attack</b> ⚔️ of infantry and ranged units is blocked by the defenders' <b>🛡️ defense vs infantry</b>; cavalry attack is blocked by <b>🐎🛡️ defense vs cavalry</b>. Defenders use a blend matching your army's mix.</li>
        <li>So: answer enemy cavalry with pike- and spear-type units (high 🐎🛡️); answer infantry hordes with shield units (high 🛡️). Attack walls and pikes with a mix that targets their weaker defense.</li>
        <li><b>Siege engines</b> (Siege Workshop): rams negate enemy wall levels during an assault and damage the wall if you win; catapults wreck buildings after a won assault. They're slow and weak in a fight — escort them.</li>
        <li><b>Forge upgrades</b> at the Armory raise a unit type's attack or defence by 4% per level.</li>
        <li><b>Raids</b> trade lighter losses on both sides for less certainty; <b>attacks</b> wipe out the losing side. Walls, research and a hero multiply defense.</li>
        <li>The World map send form shows the <b>expected outcome</b> once you have scouted the target.</li>
      </ul></details>
    <p class="muted" style="font-size:12.5px;margin-bottom:0">Walls and Town Hall: ×${cd.mult.toFixed(2)} and +${cd.flat} defense. Research: ×${G.mod(S, 'p', null, 'atk').toFixed(2)} attack, ×${G.mod(S, 'p', null, 'def').toFixed(2)} defense.</p>
  </div>`);

  parts.push(extras(MILITARY_EXTRAS, city));
  parts.push(renderForge(city));
  const byBuilding = {};
  for (const u of G.unitsFor(S, city)) (byBuilding[DATA.units[u].at] = byBuilding[DATA.units[u].at] || []).push(u);
  for (const [bt, units] of Object.entries(byBuilding)) {
    const b = DATA.buildings[bt];
    const L = G.lvl(city, bt);
    if (!L && ['temple', 'harbor', 'magetower', 'workshop'].includes(bt)) continue;   // optional buildings: show their units once built
    const q = city.train[bt] || [];
    units.sort((a, c) => DATA.units[a].req - DATA.units[c].req);
    parts.push(`<div><div class="group-title">${b.icon} ${b.name} ${L ? 'level ' + L : '(not built)'}</div>
      ${q.length ? `<div class="card" style="margin-bottom:10px">${q.map(it => `<div class="queue-item"><div>${ptHtml(unitSpec(it.unit, 'p'), 26, 'pt-inline') || DATA.units[it.unit].icon} ${it.left} × ${DATA.units[it.unit].name}<div class="bar"><i style="width:${it.next ? pct(it.each - (it.next - S.time), it.each) : 0}%"></i></div></div><span class="muted">${it.next ? 'next in ' + fmtTime(realSecs(it.next - S.time)) + ' · all in ' + fmtTime(realSecs(it.next - S.time + (it.left - 1) * it.each)) : 'waiting'}</span><span></span></div>`).join('')}</div>` : ''}
      <div class="grid">${units.map(u => {
        const d = DATA.units[u];
        const st = G.trainStatus(S, city, u);
        const key = 'train_' + city.id + '_' + u;
        return `<div class="card unit ${st.locked ? 'locked' : ''}">
          <div class="pt-unithead">${ptHtml(unitSpec(u, 'p'), 64, 'pt-card') || `<span style="font-size:24px">${d.icon}</span>`}<div class="pt-unittitle"><div class="row"><b>${d.name}</b><span class="pill">${{ cav: 'cavalry', ranged: 'ranged', civ: 'civilian', inf: 'infantry', siege: 'siege', ship: 'ship' }[d.type]}</span>${upBadge(u)}<span class="spacer"></span><span class="muted">have ${city.units[u] || 0}</span></div>
          <div class="desc muted" style="font-size:12.5px">${d.desc}</div></div></div>
          ${statLine(G.unitStats(S, 'p', u))}${d.wallBreak ? `<div class="stats"><span>🧱 negates ${d.wallBreak} wall levels each</span></div>` : ''}${d.wreck ? `<div class="stats"><span>🏚️ wrecks buildings after a won assault</span></div>` : ''}
          ${costHtml(G.unitCost(S, city.owner, u), city)}<div class="muted" style="font-size:12px">👥 takes ${G.unitPop(u)} citizen${G.unitPop(u) === 1 ? '' : 's'}${!st.locked && st.byPop < Infinity && st.byPop <= G.maxAffordable(S, city, G.unitCost(S, city.owner, u)) ? ' · <span class="warn">limited by population</span>' : ''}</div>
          ${st.locked ? `<div class="warn" style="font-size:12px">${st.reason}</div>` : `<div class="row">
            <input type="number" min="1" data-k="${key}" value="${esc(UI.form[key] || 1)}">
            <button class="small" data-act="maxTrain" data-u="${u}" data-k="${key}">max ${st.max}</button>
            <button class="primary" data-act="train" data-u="${u}" data-k="${key}" ${st.max < 1 ? 'disabled' : ''}>Train</button>
            <span class="muted" style="font-size:12px">⏱ ${fmtTime(realSecs(st.time))} each</span></div>`}
        </div>`;
      }).join('')}</div></div>`);
  }
  return parts.join('');
};

const renderForge = city => {
  const L = G.lvl(city, 'armory');
  const f = city.forge;
  const units = DATA.races[S.empires.p.race].units;
  if (!L) return `<div class="card"><h3>⚒️ Forge upgrades</h3><p class="muted">Build an Armory in ${esc(city.name)} to improve your troops' weapons and armour (+4% per level, up to 10, for the whole realm). The Armory level caps the upgrade level.</p></div>`;
  return `<div class="card"><h3>⚒️ Forge upgrades <span class="muted" style="font-size:13px">Armory ${L} · +4% per level for the whole realm</span></h3>
    ${f ? `<div class="queue-item"><div>${ptHtml(unitSpec(f.unit, 'p'), 26, 'pt-inline') || DATA.units[f.unit].icon} ${DATA.units[f.unit].name} ${f.kind === 'a' ? 'weapons' : 'armour'} → ${f.level}<div class="bar"><i style="width:${pct(S.time - f.start, f.end - f.start)}%"></i></div></div><span class="muted">${fmtTime(realSecs(f.end - S.time))}</span><button class="small" data-act="cancelForge" title="Refund 50%">✕</button></div>` : ''}
    <table class="forge"><tr><th>Unit</th><th>⚔️ Weapons</th><th>🛡️ Armour</th></tr>
    ${units.map(u => { const d = DATA.units[u]; const cell = kind => { const st = G.forgeStatus(S, city.id, u, kind); const lv = G.upgradeLevel(S, 'p', u, kind);
        return `<td><b>${lv}</b>/10 ${st.maxed ? '' : `<button class="small ${st.ok ? 'primary' : ''}" data-act="forge" data-u="${u}" data-k="${kind}" ${st.ok ? '' : 'disabled'} title="${esc(st.reason || '')} · ${Object.entries(st.cost).map(([g, v]) => gName(g) + ' ' + v).join(', ')} · ${fmtTime(realSecs(st.time))}">+1</button>`}</td>`; };
      return `<tr><td class="pt-cell">${ptHtml(unitSpec(u, 'p'), 28, '', d.name) || d.icon} ${d.name}</td>${cell('a')}${cell('d')}</tr>`; }).join('')}</table>
    <p class="muted" style="font-size:12px;margin-bottom:0">Hover a +1 button for its cost and time. One upgrade at a time per Armory; any city with an Armory can forge.</p></div>`;
};

// ---------------------------------------------------------------------
// Movements, market, reports, empire, help
// ---------------------------------------------------------------------
const MOVE_LABEL = { preach: '📿 Preaching', raid: 'Raid', attack: 'Attack', conquer: 'Conquest', settle: 'Settlers', reinforce: 'Reinforcement', trade: 'Caravan', return: 'Returning', scout: 'Scouting', adventure: 'Adventure' };
const placeName = (x, y) => {
  const t = G.tileAt(S, x, y);
  if (t.city) return esc(S.cities[t.city].name);
  if (t.minor && S.minors && S.minors[t.minor]) return '🏰 ' + esc(S.minors[t.minor].name);
  if (t.camp) return 'brigand camp';
  if (t.oasis) return 'oasis';
  if (t.ruin) return 'ruins';
  return 'open land';
};
const renderMoves = () => {
  const mine = S.moves.filter(m => m.owner === 'p').sort((a, b) => a.arrive - b.arrive);
  const inc = incoming();
  return `<div class="card"><h3>⚠️ Incoming</h3>${inc.length ? `<table><tr><th>From</th><th>Target</th><th>Arrives</th></tr>${inc.map(m => `<tr><td class="pt-cell">${ptHtml(rulerSpec(S.empires[m.owner]), 28, '', 'Ruler of ' + S.empires[m.owner].name)} ${esc(S.empires[m.owner].name)}</td><td>${placeName(m.x, m.y)}</td><td class="bad">${fmtTime(realSecs(m.arrive - S.time))}</td></tr>`).join('')}</table>` : '<p class="muted">No hostile armies are marching on your lands.</p>'}</div>
  <div class="card"><h3>Your movements</h3>${mine.length ? `<table><tr><th>Type</th><th>To</th><th>Troops / cargo</th><th>Arrives</th></tr>${mine.map(m => `<tr><td>${MOVE_LABEL[m.type]}</td><td>${m.type === 'return' ? esc((S.cities[m.from] || {}).name || 'home') : placeName(m.x, m.y)} (${m.x}, ${m.y})</td><td>${G.unitsCount(m.units) ? unitTokens(m.units, 'p', null, 26) : Object.keys(m.cargo).length ? '' : '<span class="muted">none</span>'}${Object.keys(m.cargo).length ? (G.unitsCount(m.units) ? ' · ' : '') + goodsHtml(m.cargo) : ''}${extras(MOVE_EXTRAS, m)}</td><td>${fmtTime(realSecs(m.arrive - S.time))}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing on the roads.</p>'}</div>`;
};

const renderMarket = city => {
  const L = G.lvl(city, 'market');
  if (!L) return `<div class="card"><h3>⚖️ Market</h3><p class="muted">Build a Market in ${esc(city.name)} (Town Hall 3) to trade goods for gold and send caravans to your other cities. Foreign merchants also visit — see the 🕊️ Diplomacy tab.</p></div>` + extras(MARKET_EXTRAS, city);
  return `<div class="card"><h3>⚖️ Market of ${esc(city.name)} <span class="muted" style="font-size:13px">level ${L}</span></h3>
    <p class="muted" style="font-size:12.5px">Gold in treasury: 🪙 ${fmt(S.empires.p.gold)}. Higher market levels narrow the gap between buying and selling.</p>
    <table><tr><th>Good</th><th>Stock</th><th>Sell for</th><th>Buy for</th><th>Amount</th><th></th></tr>
    ${visibleGoods().map(g => {
      const r = G.marketRates(S, city, g); const k = 'mkt_' + g;
      return `<tr><td>${DATA.goods[g].icon} ${DATA.goods[g].name}</td><td>${fmt(city.res[g] || 0)}</td><td>🪙 ${r.sell.toFixed(2)}</td><td>🪙 ${r.buy.toFixed(2)}</td>
        <td><input type="number" min="0" step="50" data-k="${k}" value="${esc(UI.form[k] || 100)}"></td>
        <td class="row"><button class="small" data-act="sell" data-g="${g}">Sell</button><button class="small" data-act="buy" data-g="${g}">Buy</button></td></tr>`;
    }).join('')}</table></div>` + extras(MARKET_EXTRAS, city);
};

const reportBody = r => {
  const b = r.body;
  if (b.adventure) return `<div style="margin-top:8px">
      <p>${b.success ? 'The hero returned victorious.' : 'The hero was driven back.'} Wounds: −${b.dmg} health. Experience: +${b.xp}.</p>
      ${Object.values(b.attLost || {}).some(n => n) ? `<p>Escort losses: ${unitTokens(b.attLost, 'p', null, 28)}</p>` : ''}
      ${Object.keys(b.loot).length ? `<p>Treasure: ${goodsHtml(b.loot)}</p>` : ''}
      ${b.item ? `<p>Found: <b style="color:${DATA.rarity[b.item.rarity].color}">${b.item.icon} ${esc(b.item.name)}</b> (${DATA.rarity[b.item.rarity].name}) — ${G.itemText(b.item)}</p>` : ''}
      ${b.extra ? `<p>${esc(b.extra)}</p>` : ''}</div>`;
  if (b.scout) {
    if (b.failed) return `<p>${esc(b.extra)}</p>`;
    const i = b.intel;
    return `<table style="margin-top:8px">
      <tr><td>Troops</td><td>${unitTokens(i.units, (ptEmpByName(b.def) || {}).id, null, 28)}</td></tr>
      ${i.res ? `<tr><td>Stores</td><td>${goodsHtml(i.res)}</td></tr>` : ''}
      ${i.wall !== undefined ? `<tr><td>Defenses</td><td>Wall ${i.wall} · Town Hall ${i.th} · Loyalty ${i.loyalty}%</td></tr>` : ''}
    </table>`;
  }
  if (!b.attSent) return b.extra ? `<p>${esc(b.extra)}</p>` : '';
  const aId = (ptEmpByName(b.att) || {}).id, dId = (ptEmpByName(b.def) || {}).id;
  return `${duelHtml(b, aId, dId)}${extras(REPORT_EXTRAS, b)}<table style="margin-top:8px">
      <tr><th></th><th>Attacker: ${esc(b.att)}</th><th>Defender: ${esc(b.def)}</th></tr>
      <tr><td>Strength</td><td>⚔️ ${fmt(b.A)}</td><td>🛡️ ${fmt(b.D)}</td></tr>
      <tr><td>Troops</td><td>${unitTokens(b.attSent, aId, b.attLost)}</td><td>${unitTokens(b.defHad, dId, b.defLost)}</td></tr>
      <tr><td>Losses</td><td class="bad">${unitsHtml(b.attLost)}</td><td class="bad">${unitsHtml(b.defLost)}</td></tr>
      <tr><td>Plunder</td><td colspan="2">${goodsHtml(b.loot)}</td></tr>
    </table>${tacticsHtml(b)}${b.extra ? `<p>${esc(b.extra)}</p>` : ''}`;
};
// the two champions of a hero duel (from the report's note), each side's current hero
const duelHtml = (b, aId, dId) => {
  if (!ptOn() || !b.extra || !/Duel:/.test(b.extra) || !(b.attSent || {}).hero || !(b.defHad || {}).hero) return '';
  const ea = ptEmp(aId), ed = ptEmp(dId);
  const ha = ea && (G.heroOf ? G.heroOf(S, aId) : ea.hero), hd = ed && (G.heroOf ? G.heroOf(S, dId) : ed.hero);
  if (!ha || !hd) return '';
  const m = b.extra.match(/Duel: (.+?) \(/), winner = m ? m[1] : '';
  const side = (h, id, lost, cls) => `<div class="pt-duelist ${cls} ${h.name === winner ? 'won' : 'lost'}">${ptHtml({ ...heroSpec(h, id), wounded: 0, dead: !!lost }, 56, 'pt-card', h.name)}<b>${esc(h.name)}</b><span class="muted">${h.name === winner ? 'won the duel' : lost ? 'fell' : 'wounded'}</span></div>`;
  return `<div class="pt-duel">${side(ha, aId, (b.attLost || {}).hero, 'att')}<span class="pt-vs">⚔️</span>${side(hd, dId, (b.defLost || {}).hero, 'def')}</div>`;
};
// the battle breakdown (reports from before tactical battles have none)
const tacticsHtml = b => {
  const t = b.tactics;
  if (!t || !Array.isArray(t.phases)) return '';
  const T = t.terrain && DATA.terrain[t.terrain];
  const ground = [T ? `<b>${esc(T.name)}</b>` : '', t.crossing ? '🌊 across a river' : t.river ? '🏞️ by a river' : '', t.coast ? '💧 on the shore' : '',
    t.season != null && G.SEASONS ? esc(G.SEASONS[t.season]) : '', ...(t.weather || []).map(esc)].filter(Boolean).join(' · ');
  const bt = t.terrain && DATA.battleTerrain && DATA.battleTerrain[t.terrain];
  const sign = p => (p > 0 ? '+' : p < 0 ? '−' : '±') + Math.abs(p) + '%';
  const mods = side => {
    const l = (t.mods || []).filter(m => m.side === side);
    return l.length ? l.map(m => `<div class="${m.flat ? '' : m.pct > 0 ? 'good' : m.pct < 0 ? 'bad' : 'muted'}">${esc(m.label)} <b>${m.flat ? '+' + fmt(m.flat) : m.kind === 'cap' ? '' : sign(m.pct)}</b></div>`).join('') : '<div class="muted">none</div>';
  };
  const roles = side => Object.entries((t.roles || {})[side] || {}).sort((a, c) => c[1] - a[1])
    .map(([r, v]) => `<span title="${esc((DATA.roleInfo[r] || { name: r }).name)}">${(DATA.roleInfo[r] || {}).icon || ''} ${v}%</span>`).join(' ') || '<span class="muted">—</span>';
  const aId = (ptEmpByName(b.att) || {}).id, dId = (ptEmpByName(b.def) || {}).id;
  const lost = (u, id) => Object.values(u || {}).some(n => n > 0) ? unitTokens(u, id, null, 24) : '<span class="muted">—</span>';
  return `<div style="margin-top:10px;font-size:12.5px">
    <div>⛰️ Battlefield: ${ground || '<span class="muted">open field</span>'}${bt && bt.text ? ` <span class="muted">— ${esc(bt.text)}</span>` : ''}</div>
    <table style="margin-top:6px"><tr><th></th><th>${esc(b.att)}</th><th>${esc(b.def)}</th></tr>
      <tr><td>Army mix</td><td>${roles('att')}</td><td>${roles('def')}</td></tr>
      ${t.stances ? `<tr><td>Stance</td><td>${t.stances.att ? `${t.stances.att.icon || ''} ${esc(t.stances.att.name)}` : '—'}</td><td>${t.stances.def ? `${t.stances.def.icon || ''} ${esc(t.stances.def.name)}` : '<span class="muted">—</span>'}</td></tr>` : ''}
      <tr><td>Modifiers</td><td style="vertical-align:top">${mods('att')}</td><td style="vertical-align:top">${mods('def')}</td></tr>
      ${t.phases.map(ph => `<tr><td>${ph.icon || ''} ${esc(ph.name)}</td><td class="bad">${lost(ph.attLost, aId)}</td><td class="bad">${lost(ph.defLost, dId)}</td></tr>`).join('')}
    </table></div>`;
};
const renderReports = () => {
  if (!S.reports.length) return '<div class="card"><h3>📜 Reports</h3><p class="muted">No battles yet. Send your hero to a ruin, or raid a brigand camp once you have troops.</p></div>';
  return `<div class="row"><h3 style="margin:0">📜 Reports</h3><span class="spacer"></span><button class="small" data-act="readAll">Mark all read</button></div>` + S.reports.map(r => `<div class="card rep ${r.read ? '' : 'unread'} ${r.kind}" data-act="report" data-r="${r.id}">
      <div class="row"><h4 style="margin:0">${esc(r.title)}</h4><span class="spacer"></span><span class="muted" style="font-size:12px">${clock(r.t)}</span></div>
      ${UI.openReport === r.id ? reportBody(r) : ''}
    </div>`).join('');
};

const renderEmpire = () => {
  const emp = S.empires.p, R = DATA.races[emp.race];
  const ren = G.renown(S, 'p'), need = G.nextCityRenown(S, 'p');
  const cities = G.citiesOf(S, 'p');
  const goods = visibleGoods().slice(0, 7);
  return `<div class="card"><h3>👑 ${esc(emp.name)}</h3>
    <p>${R.name}: ${R.perks.join(' · ')}</p>
    <p>⭐ Renown <b>${ren}</b> — from building levels, victories (${emp.wins || 0} → ${G.winRenown(emp.wins || 0)}; 3 each for the first 25, then 1.5) and conquests (${emp.conquests || 0} × 25).
    ${need === Infinity ? 'You have reached the greatest size a realm can hold.' : `Your next city needs <b>${need}</b> renown. Train Settlers at a Town Hall of level 5+ and send them to open land.`}</p>
    <p class="muted">${DATA.pace[S.settings.pace].name} pace · ${DATA.modes[S.settings.mode].name}: ${DATA.modes[S.settings.mode].desc} · Rival pressure ${Math.round(G.aiPressure(S) * 100)}%</p>
  </div>
  <div class="card"><h3>Cities</h3><table><tr><th>City</th><th>Tier</th><th>People</th>${goods.map(g => `<th>${DATA.goods[g].icon}</th>`).join('')}<th>Troops</th></tr>
    ${cities.map(c => `<tr><td><button class="link" data-act="city" data-c="${c.id}">${esc(c.name)}</button></td><td>${G.tier(c).name}</td><td>${fmt(c.pop)}</td>${goods.map(g => `<td>${fmt(c.res[g] || 0)}</td>`).join('')}<td>${G.unitsCount(c.units)}</td></tr>`).join('')}</table></div>
  ${wondersHtml()}
  ${extras(EMPIRE_EXTRAS)}
  ${savesHtml(true)}`;
};
const wondersHtml = () => {
  if (!G.wonderOf) return '';
  const rows = Object.values(S.empires).filter(e => !e.dead).map(e => {
    const w = G.wonderOf(S, e.id);
    return `<tr><td>${w.icon} <b>${esc(w.name)}</b><div class="muted" style="font-size:11.5px">${esc(e.id === 'p' ? 'Your realm' : e.name)}${w.city && (e.id === 'p' || S.explored[w.city.y * S.map + w.city.x]) ? ' · ' + esc(w.city.name) : ''}</div></td>
      <td style="min-width:120px"><div class="bar"><i style="width:${w.level * 10}%;background:${e.color}"></i></div><span class="muted" style="font-size:12px">stage ${w.level}/${G.WONDER_STAGES}${w.building ? ' · building' : ''}</span></td></tr>`;
  }).join('');
  const mine = G.wonderOf(S, 'p');
  return `<div class="card"><h3>🏛️ The race for a wonder</h3>
    <p style="font-size:13px;margin-top:0">${esc(DATA.wonders[S.empires.p.race].desc)}</p>
    <p class="muted" style="font-size:12.5px">${S.settings.mode === 'conquest' ? 'The first realm to finish all 10 stages wins the game.' : 'In Endless mode a finished wonder brings glory (+200 renown) and its boons.'} It needs a realm of 3 cities and a city with Town Hall 12, Academy 5 and Warehouse 14. Rivals grow hostile toward anyone close to finishing, and catapults can wreck stages.${mine.city ? '' : ' Find it under Wonder in the City tab.'}</p>
    <table>${rows}</table></div>`;
};

const renderHelp = () => `<div class="card help"><h2>How to play</h2>
  <ol>
    <li><b>Grow the basics.</b> Farms, Lumber Camps, Quarries and the Mine produce raw goods every minute. Every field and workshop needs workers, so build <b>Houses</b>. Idle citizens pay taxes in gold.</li>
    <li><b>People are everything.</b> Citizens work the fields and workshops (too few and everything slows) and idle ones pay taxes. Soldiers are enrolled citizens: training takes recruits from the population, and soldiers beyond your barracks quarters take homes from civilians. Fallen soldiers are people lost. Dismiss troops to send them back to work. A city's reach (how far it sees and which oases it can hold) grows with its population.</li>
    <li><b>Feed your people.</b> Citizens and soldiers eat grain. If grain runs out, people leave and troops desert.</li>
    <li><b>Everything gets used.</b> People burn firewood (three times as much in winter, more on hills and mountains); buildings need timber and stone for repairs; workers wear out tools, soldiers wear out weapons and armour and draw wages; towers and battle mages draw mana; each people wears its own luxury, which cheers them while stocked. Upkeep left unpaid for a few minutes becomes a shortage: cold and unrest, crumbling walls, rusting armour, −15% raw goods, −10% attack, deserters. <b>Hover or tap any good in the top bar</b> to see what makes and uses it, the net rate and when it fills or runs dry.</li>
    <li><b>Smith.</b> The <b>Smelter</b> turns ore into iron; the <b>Toolsmith</b> makes tools (needed for building levels 6+, settlers and research); the <b>Armory</b> forges weapons for soldiers. Each people has its own twist — check your race perks. Workshops can be paused.</li>
    <li><b>Your hero</b> 🦸 starts in your capital. Spend attribute points, send them to <b>ruins</b> 🏚️ on adventures for treasure, experience and items, or march with your armies for leadership bonuses. A fallen hero can be revived.</li>
    <li><b>Research</b> 📚 at the Academy: empire-wide upgrades to production, building speed, storage, attack, defense and more.</li>
    <li><b>Location matters.</b> A city's yields come from the land within 2 tiles: forests give timber, hills stone, mountains ore, fertile land grain. Rivers and lakes make a city more prosperous. Each people's homeland suits its specialty, and the site survey on the World map rates open land before you settle. Trade covers what your land lacks.</li>
    <li><b>Seas and ships.</b> Armies march around lakes and seas, so routes follow the land. A coastal city can build a <b>Harbor</b>: fishing boats add grain, and shipwrights build Transport Cogs (each carries 30 citizens' worth of troops or settlers) and War Galleys. Send ships with your army to cross water — that's the only way to reach islands, which often hide unclaimed land and treasures.</li>
    <li><b>Explore.</b> The map is hidden until your cities, armies or scouts 🦅 see it. Scouts bring back troop counts, stores and walls. <b>Oases</b> 🏝️ guarded by beasts give a nearby city +25% of a good once claimed (attack and win; one slot per 5 Town Hall levels).</li>
    <li><b>Fight.</b> Raid brigand camps for plunder and renown. Defenders with high 🐎🛡️ stop cavalry, high 🛡️ stops infantry. Rivals leave you alone at first; their pressure grows over time.
      Battles are fought on the defender's tile: forests (+8% defence) break cavalry (−20%) and hinder archers and engines; hills (+8%) favour archers (+15%); mountains (+12%) favour foot soldiers and cripple riders and siege; open plains and farmland favour cavalry (+10%/+5%). Attacking across a river costs −15% (−20% in spring), amphibious troops gain +10% at rivers and shores, flyers ignore the ground, winter snow slows cavalry and floods, ash or tempests over the field matter too — no role's ground effect exceeds ±25%. Mixes counter each other (infantry beats cavalry, cavalry beats ranged, ranged beats infantry; up to ±10%). Each battle has an opening volley, the clash and a pursuit; the send form's preview and every battle report show the full breakdown.</li>
    <li><b>Diplomacy</b> 🕊️: send gifts, make peace, form alliances, demand tribute, and trade with foreign merchants. Breaking a treaty angers everyone.</li>
    <li><b>Expand & conquer.</b> Renown unlocks city slots; Settlers found cities. A <b>Herald</b> marching with a winning army lowers a city's loyalty; at zero it is yours.</li>
    <li><b>Calamities & wonders.</b> Now and then a wyrm wakes, a blight spreads, the dead rise, the earth shakes, rivers flood or a star falls. Each strikes a whole region — every realm's cities inside it. Some can be fought (storm the wyrm's lair, destroy the hordes, claim the star-iron); others must be endured, and some leave boons behind.</li>
    <li><b>Modes.</b> Conquest ends when every rival falls. In Endless, fallen realms rise again as new dynasties and warlords keep coming.</li>
  </ol>
  <p class="muted">Quests (right column) guide you early and pay rewards. Events may ask for your decision; if you don't answer in time, the default happens. Time keeps running at normal (1×) speed while the game is closed, up to 12 hours. The game autosaves in this browser (how often is set in 🎛️ Options). Keys: 1–9 open tabs, [ and ] switch cities, space pauses — see ⌨️.</p></div>`;

Object.assign(TABS, {
  city: { label: '🏛️ City', render: renderCity },
  military: { label: '🛡️ Military', render: renderMilitary },
  world: { label: '🗺️ World', render: c => renderWorld(c) },
  moves: { label: '🐎 Movements', render: renderMoves, badge: () => incoming().length },
  hero: { label: '🦸 Hero', render: c => renderHero(c), badge: () => { const h = S.empires.p.hero; return h && h.free > 0 ? h.free : 0; } },
  research: { label: '📚 Research', render: c => renderResearch(c) },
  diplomacy: { label: '🕊️ Diplomacy', render: c => renderDiplomacy(c), badge: () => (S.offers || []).length },
  market: { label: '⚖️ Market', render: renderMarket },
  reports: { label: '📜 Reports', render: renderReports, badge: () => S.reports.filter(r => !r.read).length },
  empire: { label: '👑 Empire', render: renderEmpire },
  help: { label: '❔ How to play', render: renderHelp },
});

const endgameBanner = () => {
  if (S.gameOver === 'wonder' || S.gameOver === 'arcane' || S.gameOver === 'faith') {
    const e = S.empires[S.gameOverBy] || {}; const w = DATA.wonders[e.race] || {};
    const fname = S.gameOverFaith && S.faiths && S.faiths[S.gameOverFaith] ? S.faiths[S.gameOverFaith].name : 'their faith';
    const why = S.gameOver === 'arcane' ? 'completed the Great Working. The weave of the world bends to their will' : S.gameOver === 'faith' ? `swept the world with ${esc(fname)}. Their faith eclipses your crown` : `completed ${esc(w.name || 'their wonder')}. Their legend eclipses yours`;
    return `<div class="banner lose">The ${esc(e.name || 'rival')} ${why} — the game is lost.<div class="row" style="justify-content:center;margin-top:8px"><button class="primary" data-act="continueEndless">Play on in Endless mode</button><button data-act="newgame">Start a new game</button></div></div>`;
  }
  if (S.victory && !S.victorySeen) {
    const msg = S.victory === 'wonder' ? `${esc(DATA.wonders[S.empires.p.race].name)} stands complete. Your people's legend will outlast the ages!`
      : S.victory === 'arcane' ? 'The Great Working is done. The weave of the world answers to you!'
      : S.victory === 'faith' ? `${esc((S.victoryFaith && S.faiths && S.faiths[S.victoryFaith] || {}).name || 'Your faith')} is the faith of the world. Every realm hears your hymns!`
      : 'Every rival crown has fallen. The realm is yours!';
    return `<div class="banner win">👑 Victory! ${msg}<div class="row" style="justify-content:center;margin-top:8px"><button class="primary" data-act="dismissVictory">Keep playing</button><button data-act="newgame">Start a new game</button></div></div>`;
  }
  return '';
};

// ---------------------------------------------------------------------
// render
// ---------------------------------------------------------------------
let lastFull = 0;
// The page is rebuilt every second, but only the regions whose HTML actually changed are replaced:
// the top bar (clock, stocks) changes every tick, while the side nav, the right column and quiet tabs
// (help, reports, empire…) often don't, so their DOM, scroll positions and canvases stay put.
const REGION = { top: '', side: '', main: '', right: '', mainEl: null };
const PERF = { renders: 0, full: 0, regions: { top: 0, side: 0, main: 0, right: 0 }, ms: [] };
// phones: the header's controls slide away on scroll and the gold / renown / clock row stays pinned
// (mobile.css). The controls may wrap to two rows, so offset the sticky bar by their real height.
const pinPhoneHeader = () => {
  const bar = $app.querySelector('.top-1');
  if (!bar) return;
  if (window.innerWidth > 700) { if (bar.style.top) bar.style.top = ''; return; }
  const sp = bar.querySelector(':scope > .spacer');
  if (sp) bar.style.top = -Math.max(0, sp.offsetTop) + 'px';
};
const render = (force) => {
  if (!S) { REGION.mainEl = null; if (force) renderStart(); return; }
  const city = curCity();
  if (!city) {
    REGION.mainEl = null;
    $app.innerHTML = paint(`<div class="start"><div class="banner lose">Your last city has fallen. The ${DATA.races[S.empires.p.race].name} chronicle ends here.</div><p style="text-align:center"><button class="primary" data-act="newgame">Begin anew</button></p>${extras(DEFEAT_EXTRAS)}</div>`);
    runMountHooks();
    return;
  }
  const active = document.activeElement;
  const editing = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA') && $app.contains(active);
  const slowTab = UI.tab === 'world' && typeof worldMapHtml !== 'function' && Date.now() - lastFull < 2500;
  if ((editing || UI.holding || UI.touching || slowTab) && !force) {
    const top = $app.querySelector('.top');
    if (top && !(active && active.id === 'speedSel')) {
      const h = paint(renderTop(city));
      if (h !== REGION.top) { top.outerHTML = h; REGION.top = h; pinPhoneHeader(); }
    }
    return;
  }
  const t0 = performance.now();
  lastFull = Date.now();
  const tab = TABS[UI.tab] || TABS.city;
  const html = {
    top: paint(renderTop(city)),
    side: paint(renderSide(city)),
    main: paint(`${awayHtml()}${endgameBanner()}${S.gameOver || S.victory ? extras(ENDGAME_EXTRAS) : ''}${tab.render(city)}`),
    right: paint(renderRight()),
  };
  const scroll = window.scrollY;
  const intact = REGION.mainEl && REGION.mainEl.isConnected && $app.contains(REGION.mainEl);
  PERF.renders++;
  if (!intact) {
    $app.innerHTML = html.top + `<div class="layout">${html.side}<main>${html.main}</main>${html.right}</div>`;
    Object.assign(REGION, html, { mainEl: $app.querySelector('.layout > main') });
    PERF.full++;
    window.scrollTo(0, scroll);
  } else {
    const swap = (k, sel, inner) => {
      if (html[k] === REGION[k]) return false;
      const el = $app.querySelector(sel);
      if (!el) return false;
      if (inner) el.innerHTML = html[k]; else el.outerHTML = html[k];
      REGION[k] = html[k]; PERF.regions[k]++;
      return true;
    };
    swap('top', ':scope > .top');
    // sideways scroll positions (phone tab bar, wide tables) and the chronicle's scroll survive a rebuild
    const navEl = $app.querySelector('.nav'), navScroll = navEl ? navEl.scrollLeft : 0;
    if (swap('side', '.layout > aside.side:not(.right)')) { const n = $app.querySelector('.nav'); if (n && navScroll) n.scrollLeft = navScroll; }
    const cardScroll = html.main !== REGION.main ? [...REGION.mainEl.querySelectorAll('.card')].map(c => c.scrollLeft) : null;
    if (swap('main', '.layout > main', true)) {
      REGION.mainEl.querySelectorAll('.card').forEach((c, i) => { if (cardScroll[i]) c.scrollLeft = cardScroll[i]; });
      window.scrollTo(0, scroll);
    }
    const logEl = $app.querySelector('aside.right .log'), logScroll = logEl ? logEl.scrollTop : 0;
    if (swap('right', '.layout > aside.right')) { const l = $app.querySelector('aside.right .log'); if (l) l.scrollTop = logScroll; }
  }
  pinPhoneHeader();
  runMountHooks();
  PERF.ms.push(performance.now() - t0); if (PERF.ms.length > 120) PERF.ms.shift();
};

// ---------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------
Object.assign(act, {
  pickRace: d => {
    readStart();
    // keep a custom city name; otherwise suggest one that fits the people
    const defaults = ['Hearthstead', ...Object.values(DATA.aiNames).map(l => l[0])];
    if (!UI.start.city || defaults.includes(UI.start.city)) UI.start.city = d.r === 'hearth' ? 'Hearthstead' : (DATA.aiNames[d.r] || ['Hearthstead'])[0];
    UI.start.race = d.r; renderStart();
  },
  begin: () => {
    readStart();
    const st = UI.start;
    S = G.newGame({ name: st.name.trim(), cityName: st.city.trim(), heroName: st.hero.trim(), race: st.race, difficulty: st.difficulty, pace: st.pace, mode: st.mode, rivals: st.rivals || 3, worldSize: st.world || 'normal' });
    UI.city = G.citiesOf(S, 'p')[0].id; UI.tab = 'city'; UI.form = {}; UI.sel = null;
    G.save(S); render(true);
  },
  tab: d => { UI.tab = d.t; window.scrollTo(0, 0); render(true); },
  city: d => { UI.city = d.c; render(true); },
  build: d => { toast(G.queueBuild(S, UI.city, d.b)); render(true); },
  cancelBuild: d => { G.cancelBuild(S, UI.city, +d.i); render(true); },
  toggleRefine: d => { const c = curCity(); c.refineOff[d.b] = !c.refineOff[d.b]; render(true); },
  rename: () => { const c = curCity(); const n = prompt('New name for ' + c.name, c.name); if (n && n.trim()) { c.name = n.trim().slice(0, 30); render(true); } },
  maxTrain: d => { UI.form[d.k] = G.maxAffordable(S, curCity(), G.unitCost(S, curCity().owner, d.u)); render(true); },
  train: d => {
    const n = parseInt(UI.form[d.k] || 1, 10);
    const err = G.queueTrain(S, UI.city, d.u, n);
    toast(err || `Training ${n} ${DATA.units[d.u].name}`); render(true);
  },
  sell: d => { toast(G.trade(S, UI.city, d.g, parseInt(UI.form['mkt_' + d.g] || 100, 10), 'sell')); render(true); },
  buy: d => { toast(G.trade(S, UI.city, d.g, parseInt(UI.form['mkt_' + d.g] || 100, 10), 'buy')); render(true); },
  report: d => { UI.openReport = UI.openReport === d.r ? null : d.r; const r = S.reports.find(x => x.id === d.r); if (r) r.read = true; render(true); },
  readAll: () => { S.reports.forEach(r => r.read = true); render(true); },
  forge: d => { toast(G.startUpgrade(S, UI.city, d.u, d.k) || `The smiths set to work on ${DATA.units[d.u].name} ${d.k === 'a' ? 'weapons' : 'armour'}`); render(true); },
  cancelForge: () => { G.cancelUpgrade(S, UI.city); render(true); },
  saveSlot: d => { toast(G.saveSlot(S, +d.n) || `Saved to slot ${d.n}`); render(true); },
  loadSlot: d => {
    if (S && !confirm(`Load slot ${d.n}? Your current game stays in the autosave only until the next save overwrites it — save it to a slot first if you want to keep it.`)) return;
    const st = G.loadSlot(+d.n);
    if (!st) { toast('That save could not be read'); return; }
    S = st; S.realLast = Date.now(); UI.city = (G.citiesOf(S, 'p')[0] || {}).id; UI.tab = 'city'; UI.sel = null; G.save(S); render(true); toast(`Loaded slot ${d.n}`);
  },
  clearSlot: d => { if (confirm(`Delete the save in slot ${d.n}? This cannot be undone.`)) { G.clearSlot(+d.n); render(true); if (!S) renderStart(); } },
  exportSave: () => {
    const blob = new Blob([G.serialize(S)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ember-crown-${S.empires.p.name.replace(/[^\w]+/g, '-').toLowerCase()}-${Math.floor(S.time / 60)}min.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
  importSave: () => {
    const input = document.getElementById('importFile');
    input.onchange = () => {
      const f = input.files[0]; if (!f) return;
      f.text().then(txt => {
        let st = null; try { st = G.deserialize(txt); } catch (e) { st = null; }
        if (!st) { toast('That file is not an Ember & Crown save'); return; }
        if (S && !confirm('Replace your current game with the imported realm?')) return;
        S = st; S.realLast = Date.now(); UI.city = (G.citiesOf(S, 'p')[0] || {}).id; UI.tab = 'city'; UI.sel = null; G.save(S); render(true); toast(`Imported ${S.empires.p.name}`);
      });
    };
    input.click();
  },
  continueEndless: () => { S.settings.mode = 'endless'; S.gameOver = null; S.gameOverBy = null; G.log(S, 'p', 'The game continues in Endless mode.', 'info'); render(true); },
  dismissVictory: () => { S.victorySeen = true; render(true); },
  dismiss: d => { toast(G.dismiss(S, UI.city, d.u, +d.n) || `${d.n} ${DATA.units[d.u].name} returned to work`); render(true); },
  save: () => { toast(G.save(S) ? 'Saved' : 'Could not save'); },
  newgame: () => { if (confirm('Abandon this realm and start a new game? Your current save will be erased.')) { G.wipe(); S = null; render(true); } },
});

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const fn = act[el.dataset.act];
  if (fn) { ev.preventDefault(); ev.stopPropagation(); fn(el.dataset); }
});
document.addEventListener('pointerdown', ev => { if (ev.target.closest('button, [data-act]')) UI.holding = true; });
document.addEventListener('pointerup', () => { setTimeout(() => { UI.holding = false; }, 0); });
document.addEventListener('pointercancel', () => { UI.holding = false; });
// while a finger is scrolling the page, hold off the once-a-second rebuild so the scroll isn't interrupted
let touchT = null;
document.addEventListener('touchstart', () => { UI.touching = true; clearTimeout(touchT); }, { passive: true });
document.addEventListener('touchend', () => { clearTimeout(touchT); touchT = setTimeout(() => { UI.touching = false; }, 400); }, { passive: true });
document.addEventListener('touchcancel', () => { UI.touching = false; }, { passive: true });
document.addEventListener('input', ev => {
  const k = ev.target.dataset && ev.target.dataset.k;
  if (k) UI.form[k] = ev.target.value;
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'speedSel') { S.settings.speed = +ev.target.value; ev.target.blur(); render(true); }
  else if (ev.target.dataset && ev.target.dataset.k && UI.tab === 'world') { ev.target.blur(); render(true); }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.k) { ev.target.blur(); render(true); }
});

// ---------------------------------------------------------------------
// quality of life: pause, keyboard shortcuts, options, "while you were away"
// ---------------------------------------------------------------------
UI.paused = false;     // a session-only pause: never saved, so saves are untouched
UI.pop = null;         // 'keys' | 'options' — popovers live outside #app, so the per-second render leaves them alone
UI.away = null;        // summary shown after an offline catch-up

// --- while you were away ---------------------------------------------
const awaySnap = () => {
  if (!S) return null;
  const cities = {};
  for (const c of G.citiesOf(S, 'p')) cities[c.id] = { name: c.name, pop: c.pop, tier: G.tier(c).name, lv: Object.values(c.buildings).reduce((a, b) => a + (b || 0), 0) };
  return { t: S.time, cities, gold: S.empires.p.gold, units: G.citiesOf(S, 'p').reduce((a, c) => a + G.unitsCount(c.units), 0) };
};
// compares a snapshot taken before G.catchUp with the state after it; reuses the log and reports
const awaySummary = (before, gameSecs) => {
  if (!S || !before) return null;
  const now = awaySnap();
  const grown = [], lost = [], gained = [];
  for (const [id, b] of Object.entries(before.cities)) {
    const c = now.cities[id];
    if (!c) { lost.push(b.name); continue; }
    const bits = [];
    if (c.tier !== b.tier) bits.push(`now a ${c.tier}`);
    if (Math.floor(c.pop) - Math.floor(b.pop) >= 1) bits.push(`+${fmt(c.pop - b.pop)} people`);
    if (c.lv > b.lv) bits.push(`+${c.lv - b.lv} building level${c.lv - b.lv > 1 ? 's' : ''}`);
    if (bits.length) grown.push(`${esc(c.name)} (${bits.join(', ')})`);
  }
  for (const [id, c] of Object.entries(now.cities)) if (!before.cities[id]) gained.push(c.name);
  const reps = S.reports.filter(r => r.t > before.t);
  const battles = reps.filter(r => r.body && (r.body.attSent || r.body.defHad));
  const wins = battles.filter(r => r.kind === 'win').length, defeats = battles.filter(r => r.kind === 'loss').length;
  const me = S.empires.p.name;
  let fallen = 0;
  for (const r of battles) {
    const b = r.body;
    if (b.att === me) fallen += G.unitsCount(b.attLost);
    else if (b.def === me) fallen += G.unitsCount(b.defLost);
  }
  const logs = S.log.filter(l => l.t > before.t);
  const notable = logs.filter(l => l.kind === 'bad' || l.kind === 'warn').slice(0, 4).concat(logs.filter(l => l.kind === 'good').slice(0, 3)).slice(0, 6);
  return { gameSecs, grown, lost, gained, wins, defeats, fallen, reports: reps.length, events: logs.length, capped: logs.length >= 100, gold: now.gold - before.gold, notable, unread: reps.filter(r => !r.read).length };
};
const awayHtml = () => {
  const a = UI.away;
  if (!a) return '';
  const line = (icon, txt) => `<li><span aria-hidden="true">${icon}</span> ${txt}</li>`;
  const items = [];
  if (a.grown.length) items.push(line('🌱', `Grew: ${a.grown.slice(0, 4).join(' · ')}${a.grown.length > 4 ? ` · and ${a.grown.length - 4} more` : ''}`));
  if (a.gained.length) items.push(line('🏰', `New cities: ${a.gained.map(esc).join(', ')}`));
  if (a.lost.length) items.push(line('🔥', `<b class="bad">Lost: ${a.lost.map(esc).join(', ')}</b>`));
  if (a.wins || a.defeats) items.push(line('⚔️', `${a.wins} battle${a.wins === 1 ? '' : 's'} won, <span class="${a.defeats ? 'bad' : ''}">${a.defeats} lost</span>${a.fallen ? ` · ${fmt(a.fallen)} of your troops fell` : ''}`));
  items.push(line('🪙', `Treasury ${a.gold >= 0 ? '+' : '−'}${fmt(Math.abs(a.gold))} gold`));
  return `<div class="card ec-away" role="status"><div class="row"><h3 style="margin:0">🕯️ While you were away <span class="muted" style="font-size:13px">${fmtTime(a.gameSecs)} of game time</span></h3><span class="spacer"></span><button class="small" data-act="awayDismiss" aria-label="Dismiss summary (Esc)">✕</button></div>
    <ul>${items.join('')}</ul>
    ${a.notable.length ? `<div class="log ec-away-log">${a.notable.map(l => `<div class="${l.kind}"><time>${clock(l.t).replace(/^Day /, 'D')}</time>${esc(l.text)}</div>`).join('')}</div>` : ''}
    <div class="row muted" style="font-size:12.5px">${a.events}${a.capped ? '+' : ''} chronicle entr${a.events === 1 ? 'y' : 'ies'} · ${a.reports} report${a.reports === 1 ? '' : 's'}${a.unread ? ` <button class="small" data-act="tab" data-t="reports">Read reports</button>` : ''}</div></div>`;
};

// --- pause & speed -----------------------------------------------------
const setSpeed = dir => {
  const i = SPEEDS.indexOf(S.settings.speed), j = Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 0 : i) + dir));
  S.settings.speed = SPEEDS[j];
  toast(`Speed ${SPEEDS[j]}×`);
};
const togglePause = () => { UI.paused = !UI.paused; toast(UI.paused ? '⏸ Paused — press Space to resume' : '▶️ Resumed'); };

// --- popovers (keyboard help, options) --------------------------------
const tabKeys = () => Object.keys(TABS).slice(0, 9);
const popHtml = () => {
  if (UI.pop === 'keys') {
    const k = s => `<kbd>${s}</kbd>`;
    return `<div class="hd"><span>⌨️ Keyboard shortcuts</span><button class="small" data-act="popClose" aria-label="Close">✕</button></div>
      <table>
        ${tabKeys().map((t, i) => `<tr><td>${k(i + 1)}</td><td>${TABS[t].label}</td></tr>`).join('')}
        <tr><td>${k('[')} ${k(']')}</td><td>Previous / next city</td></tr>
        <tr><td>${k('Space')}</td><td>Pause / resume</td></tr>
        <tr><td>${k('+')} ${k('−')}</td><td>Faster / slower</td></tr>
        <tr><td>${k('Esc')}</td><td>Close panels, clear the selection</td></tr>
      </table><p class="muted">Shortcuts are off while you type in a field.</p>`;
  }
  if (UI.pop === 'options') {
    const cb = (k, label, sub) => `<label class="ec-opt"><input type="checkbox" data-opt="${k}" ${OPTS[k] ? 'checked' : ''}><span>${label}${sub ? `<small class="muted">${sub}</small>` : ''}</span></label>`;
    return `<div class="hd"><span>🎛️ Options</span><button class="small" data-act="popClose" aria-label="Close">✕</button></div>
      ${cb('reduceMotion', 'Reduce motion', 'No animations; the map stays still and redraws less')}
      ${cb('largeText', 'Larger text')}
      ${cb('cbColors', 'Colour-blind-friendly realm colours', 'Only changes how realms are shown, not your save')}
      <label class="ec-opt"><span>Autosave every</span><select data-opt="autosave">${AUTOSAVE_CHOICES.map(v => `<option value="${v}" ${+OPTS.autosave === v ? 'selected' : ''}>${v < 60 ? v + ' seconds' : v / 60 + ' minute' + (v > 60 ? 's' : '')}</option>`).join('')}</select></label>
      <p class="muted">Kept in this browser, apart from your saves.</p>`;
  }
  return '';
};
let popEl = null;
const renderPop = () => {
  if (!popEl) { popEl = document.createElement('div'); popEl.id = 'ecPop'; popEl.setAttribute('role', 'dialog'); document.body.appendChild(popEl); }
  const html = UI.pop && S ? popHtml() : '';
  popEl.innerHTML = html;
  popEl.classList.toggle('on', !!html);
  if (!html) return;
  popEl.setAttribute('aria-label', UI.pop === 'keys' ? 'Keyboard shortcuts' : 'Options');
  const btn = document.querySelector(`[data-act="${UI.pop === 'keys' ? 'popKeys' : 'popOptions'}"]`);
  if (btn && window.innerWidth > 700) {
    const r = btn.getBoundingClientRect(), w = popEl.offsetWidth || 280;
    popEl.style.top = Math.round(r.bottom + 6) + 'px';
    popEl.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))) + 'px';
  } else { popEl.style.top = ''; popEl.style.left = ''; }
};
const openPop = which => { UI.pop = UI.pop === which ? null : which; render(true); renderPop(); };
window.addEventListener('resize', () => { if (UI.pop) renderPop(); });
document.addEventListener('click', ev => {   // a click outside closes a popover
  if (!UI.pop || !popEl) return;
  if (popEl.contains(ev.target) || ev.target.closest('[data-act="popKeys"], [data-act="popOptions"]')) return;
  UI.pop = null; renderPop();
}, true);
document.addEventListener('change', ev => {
  const k = ev.target.dataset && ev.target.dataset.opt;
  if (!k || !popEl || !popEl.contains(ev.target)) return;
  OPTS[k] = ev.target.type === 'checkbox' ? ev.target.checked : +ev.target.value;
  saveOpts(); applyOpts();
  if (k === 'cbColors' && window.ECMAP) { cbSig = ''; try { ECMAP.rebake(); } catch (e) { } }
  render(true);
});

Object.assign(act, {
  togglePause: () => { togglePause(); render(true); },
  popKeys: () => openPop('keys'),
  popOptions: () => openPop('options'),
  popClose: () => { UI.pop = null; renderPop(); },
  awayDismiss: () => { UI.away = null; render(true); },
});

// --- keyboard ------------------------------------------------------------
const typingIn = el => !!el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
document.addEventListener('keydown', ev => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented || window.ecCatching) return;
  if (typingIn(ev.target) || typingIn(document.activeElement)) return;
  const k = ev.key;
  if (k === 'Escape') {
    const audio = document.getElementById('ecAudioPop');
    if (UI.pop) { UI.pop = null; renderPop(); }
    else if (audio && audio.classList.contains('on')) audio.classList.remove('on');
    else if (UI.spellTarget) return;   // the world map cancels spell targeting itself
    else if (UI.away) { UI.away = null; render(true); }
    else if (UI.openReport) { UI.openReport = null; render(true); }
    else if (UI.sel) { UI.sel = null; render(true); }
    else return;
    ev.preventDefault();
    return;
  }
  if (!S || !curCity()) return;
  if (/^[1-9]$/.test(k)) {
    const t = tabKeys()[+k - 1];
    if (!t) return;
    ev.preventDefault(); act.tab({ t });
  } else if (k === '[' || k === ']') {
    const list = G.citiesOf(S, 'p');
    if (list.length < 2) return;
    const i = Math.max(0, list.findIndex(c => c.id === UI.city));
    UI.city = list[(i + (k === ']' ? 1 : -1) + list.length) % list.length].id;
    ev.preventDefault(); toast(`🏛️ ${S.cities[UI.city].name}`); render(true);
  } else if (k === ' ' || k === 'Spacebar') {
    if (document.activeElement && /^(BUTTON|A|SUMMARY)$/.test(document.activeElement.tagName)) return;   // Space presses the focused button
    ev.preventDefault(); togglePause(); render(true);
  } else if (k === '+' || k === '=') { ev.preventDefault(); setSpeed(1); render(true); }
  else if (k === '-' || k === '_') { ev.preventDefault(); setSpeed(-1); render(true); }
});
// a mouse click shouldn't leave the button focused (Space would press it again instead of pausing)
document.addEventListener('click', ev => { if (ev.detail > 0) { const b = ev.target.closest && ev.target.closest('button[data-act]'); if (b && b.isConnected) b.blur(); } });
