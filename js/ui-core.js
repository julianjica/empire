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
const CITY_EXTRAS = [], REALM_EXTRAS = [], MARKET_EXTRAS = [];
const extras = (list, ...a) => list.map(f => { try { return f(...a) || ''; } catch (e) { console.error(e); return ''; } }).join('');
const runMountHooks = () => { for (const h of MOUNT_HOOKS) { try { h(UI.tab); } catch (e) { console.error(e); } } };

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
      return `<div class="card race ${st.race === r ? 'sel' : ''}" data-act="pickRace" data-r="${r}">
        <h3><span class="dot" style="background:${R.color}"></span>${R.name}</h3>
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
      <label>Rivals<select id="sDiff">
        ${['easy', 'normal', 'hard'].map(d => `<option value="${d}" ${st.difficulty === d ? 'selected' : ''}>${{ easy: 'Gentle — slow, peaceful rivals', normal: 'Fair — rivals grow as you do', hard: 'Harsh — fast, warlike rivals' }[d]}</option>`).join('')}
      </select></label>
      <button class="primary" data-act="begin" style="padding:10px">Found your realm</button>
    </div>
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
    <p class="muted" style="font-size:12.5px;margin-top:0">The game autosaves in this browser every 15 seconds. Keep extra copies in slots, or export a file to back up or move your realm to another browser.</p>
    ${slots}
    <div class="row" style="margin-top:8px">${inGame ? '<button class="small" data-act="exportSave">⬇️ Export to file</button>' : ''}<button class="small" data-act="importSave">⬆️ Import from file</button><input type="file" id="importFile" accept=".json,application/json" style="display:none"></div></div>`;
};
const clockOf = t => {
  return `${Math.floor(t / 3600)}h ${Math.floor(t % 3600 / 60)}m played`; };
const readStart = () => {
  const v = id => document.getElementById(id).value;
  Object.assign(UI.start, { name: v('sName'), city: v('sCity'), hero: v('sHero'), pace: v('sPace'), mode: v('sMode'), difficulty: v('sDiff') });
};

// ---------------------------------------------------------------------
// layout pieces
// ---------------------------------------------------------------------
const incoming = () => S.moves.filter(m => m.owner !== 'p' && ['raid', 'attack', 'conquer'].includes(m.type) &&
  (() => { const t = G.tileAt(S, m.x, m.y); return (t.city && S.cities[t.city].owner === 'p') || (t.oasis && t.oasis.owner && S.cities[t.oasis.owner] && S.cities[t.oasis.owner].owner === 'p'); })());

const renderTop = city => {
  const emp = S.empires.p;
  const e = G.econ(S, city);
  const ren = G.renown(S, 'p'), next = G.nextCityRenown(S, 'p');
  return `<div class="top">
    <div class="top-1">
      <span class="brand">🔥 Ember &amp; Crown</span>
      <span class="pill" style="border-color:${DATA.races[emp.race].color}">${esc(emp.name)} · ${DATA.races[emp.race].name}</span>
      <span title="Gold (shared by your whole realm)">🪙 <b>${fmt(emp.gold)}</b> <span class="muted">${fmtRate(G.citiesOf(S, 'p').reduce((a, c) => a + G.econ(S, c).tax, 0))}/min</span></span>
      <span title="Renown: total building levels + victories. Unlocks new cities.">⭐ <b>${ren}</b> <span class="muted">${next === Infinity ? '' : '/ ' + next + ' for next city'}</span></span>
      <span class="spacer"></span>
      <span class="muted" title="${DATA.pace[S.settings.pace].name} pace · ${DATA.modes[S.settings.mode].name}">${calendar()} · ${clock(S.time)}</span>
      <label class="muted">Speed <select id="speedSel">${[1, 2, 5, 10, 25].map(v => `<option value="${v}" ${S.settings.speed === v ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>
      ${TOP_EXTRAS.map(f => { try { return f() || ''; } catch (e) { return ''; } }).join('')}
      <button class="small" data-act="save">Save</button>
      <button class="small" data-act="newgame">New game</button>
    </div>
    <div class="res-bar">
      <div class="res" title="Citizens / housing left for civilians. Workers needed: ${e.workersReq}. Soldiers enrolled: ${e.soldiers} (barracks quarters ${e.quarters}).">
        <span class="muted">👥 People</span><span class="v">${fmt(city.pop)} / ${e.civCap}</span><span class="r ${e.eff < 1 ? 'bad' : 'muted'}">${e.eff < 1 ? 'Short of workers ' + Math.round(e.eff * 100) + '%' : 'idle ' + fmt(e.idle)}${e.soldiers ? ' · 🛡️' + fmt(e.soldiers) : ''}</span></div>
      ${visibleGoods().map(g => {
        const v = city.res[g] || 0, r = e.net[g] || 0;
        const full = v >= e.cap * 0.98;
        return `<div class="res ${full ? 'full' : ''}" title="${DATA.goods[g].name}: ${Math.floor(v)} / ${e.cap}${full ? ' — storage full!' : ''}">
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
  const extra = [site.river ? '🏞️ river' : '', site.lake ? '💧 lakeside' : ''].filter(Boolean).join(' · ');
  const best = DATA.raceOrder.map(r => [r, G.siteFit(site, r)]).sort((a, b) => b[1] - a[1])[0];
  return `<div class="site ${compact ? 'compact' : ''}">${goods}${extra ? `<span class="site-g good" title="+10% taxes and growth by a river, +5% by a lake; more grain">${extra}</span>` : ''}${compact ? '' : `<span class="site-g muted">Best suited to the ${DATA.races[best[0]].name}</span>`}</div>`;
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

  parts.push(`<div class="card"><h3>Construction <span class="muted" style="font-size:13px">(${city.buildQueue.length}/${G.buildSlots(city)} slots)</span></h3>
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
    ${garrison.length ? `<table><tr><th>Unit</th><th>Count</th><th>Attack</th><th>Defense</th><th></th></tr>${garrison.map(([u, n]) => { const d = G.unitStats(S, 'p', u); const pp = G.unitPop(u); return `<tr><td>${d.icon} ${d.name}</td><td>${n}</td><td>${fmt(d.atk * n)}</td><td>${fmt((d.defI + d.defC) / 2 * n)}</td><td>${pp ? `<button class="small" data-act="dismiss" data-u="${u}" data-n="${Math.min(n, 10)}" title="Send ${Math.min(n, 10)} back to work (+${Math.min(n, 10) * pp} citizens)">Dismiss ${Math.min(n, 10)}</button>` : ''}</td></tr>`; }).join('')}</table>` : '<p class="muted">No troops stationed here. Build a Barracks and an Armory to start training.</p>'}
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

  parts.push(renderForge(city));
  const byBuilding = {};
  for (const u of G.unitsFor(S, city)) (byBuilding[DATA.units[u].at] = byBuilding[DATA.units[u].at] || []).push(u);
  for (const [bt, units] of Object.entries(byBuilding)) {
    const b = DATA.buildings[bt];
    const L = G.lvl(city, bt);
    const q = city.train[bt] || [];
    units.sort((a, c) => DATA.units[a].req - DATA.units[c].req);
    parts.push(`<div><div class="group-title">${b.icon} ${b.name} ${L ? 'level ' + L : '(not built)'}</div>
      ${q.length ? `<div class="card" style="margin-bottom:10px">${q.map(it => `<div class="queue-item"><div>${DATA.units[it.unit].icon} ${it.left} × ${DATA.units[it.unit].name}<div class="bar"><i style="width:${it.next ? pct(it.each - (it.next - S.time), it.each) : 0}%"></i></div></div><span class="muted">${it.next ? 'next in ' + fmtTime(realSecs(it.next - S.time)) + ' · all in ' + fmtTime(realSecs(it.next - S.time + (it.left - 1) * it.each)) : 'waiting'}</span><span></span></div>`).join('')}</div>` : ''}
      <div class="grid">${units.map(u => {
        const d = DATA.units[u];
        const st = G.trainStatus(S, city, u);
        const key = 'train_' + city.id + '_' + u;
        return `<div class="card unit ${st.locked ? 'locked' : ''}">
          <div class="row"><span style="font-size:24px">${d.icon}</span><b>${d.name}</b><span class="pill">${{ cav: 'cavalry', ranged: 'ranged', civ: 'civilian', inf: 'infantry', siege: 'siege' }[d.type]}</span>${upBadge(u)}<span class="spacer"></span><span class="muted">have ${city.units[u] || 0}</span></div>
          <div class="desc muted" style="font-size:12.5px">${d.desc}</div>
          ${statLine(G.unitStats(S, 'p', u))}${d.wallBreak ? `<div class="stats"><span>🧱 negates ${d.wallBreak} wall levels each</span></div>` : ''}${d.wreck ? `<div class="stats"><span>🏚️ wrecks buildings after a won assault</span></div>` : ''}
          ${costHtml(d.cost, city)}<div class="muted" style="font-size:12px">👥 takes ${G.unitPop(u)} citizen${G.unitPop(u) === 1 ? '' : 's'}${!st.locked && st.byPop < Infinity && st.byPop <= G.maxAffordable(S, city, d.cost) ? ' · <span class="warn">limited by population</span>' : ''}</div>
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
    ${f ? `<div class="queue-item"><div>${DATA.units[f.unit].icon} ${DATA.units[f.unit].name} ${f.kind === 'a' ? 'weapons' : 'armour'} → ${f.level}<div class="bar"><i style="width:${pct(S.time - f.start, f.end - f.start)}%"></i></div></div><span class="muted">${fmtTime(realSecs(f.end - S.time))}</span><button class="small" data-act="cancelForge" title="Refund 50%">✕</button></div>` : ''}
    <table class="forge"><tr><th>Unit</th><th>⚔️ Weapons</th><th>🛡️ Armour</th></tr>
    ${units.map(u => { const d = DATA.units[u]; const cell = kind => { const st = G.forgeStatus(S, city.id, u, kind); const lv = G.upgradeLevel(S, 'p', u, kind);
        return `<td><b>${lv}</b>/10 ${st.maxed ? '' : `<button class="small ${st.ok ? 'primary' : ''}" data-act="forge" data-u="${u}" data-k="${kind}" ${st.ok ? '' : 'disabled'} title="${esc(st.reason || '')} · ${Object.entries(st.cost).map(([g, v]) => gName(g) + ' ' + v).join(', ')} · ${fmtTime(realSecs(st.time))}">+1</button>`}</td>`; };
      return `<tr><td>${d.icon} ${d.name}</td>${cell('a')}${cell('d')}</tr>`; }).join('')}</table>
    <p class="muted" style="font-size:12px;margin-bottom:0">Hover a +1 button for its cost and time. One upgrade at a time per Armory; any city with an Armory can forge.</p></div>`;
};

// ---------------------------------------------------------------------
// Movements, market, reports, empire, help
// ---------------------------------------------------------------------
const MOVE_LABEL = { raid: 'Raid', attack: 'Attack', conquer: 'Conquest', settle: 'Settlers', reinforce: 'Reinforcement', trade: 'Caravan', return: 'Returning', scout: 'Scouting', adventure: 'Adventure' };
const placeName = (x, y) => {
  const t = G.tileAt(S, x, y);
  if (t.city) return esc(S.cities[t.city].name);
  if (t.camp) return 'brigand camp';
  if (t.oasis) return 'oasis';
  if (t.ruin) return 'ruins';
  return 'open land';
};
const renderMoves = () => {
  const mine = S.moves.filter(m => m.owner === 'p').sort((a, b) => a.arrive - b.arrive);
  const inc = incoming();
  return `<div class="card"><h3>⚠️ Incoming</h3>${inc.length ? `<table><tr><th>From</th><th>Target</th><th>Arrives</th></tr>${inc.map(m => `<tr><td>${esc(S.empires[m.owner].name)}</td><td>${placeName(m.x, m.y)}</td><td class="bad">${fmtTime(realSecs(m.arrive - S.time))}</td></tr>`).join('')}</table>` : '<p class="muted">No hostile armies are marching on your lands.</p>'}</div>
  <div class="card"><h3>Your movements</h3>${mine.length ? `<table><tr><th>Type</th><th>To</th><th>Troops / cargo</th><th>Arrives</th></tr>${mine.map(m => `<tr><td>${MOVE_LABEL[m.type]}</td><td>${m.type === 'return' ? esc((S.cities[m.from] || {}).name || 'home') : placeName(m.x, m.y)} (${m.x}, ${m.y})</td><td>${unitsHtml(m.units)}${Object.keys(m.cargo).length ? ' · ' + goodsHtml(m.cargo) : ''}</td><td>${fmtTime(realSecs(m.arrive - S.time))}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing on the roads.</p>'}</div>`;
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
      ${Object.values(b.attLost || {}).some(n => n) ? `<p>Escort losses: ${unitsHtml(b.attLost)}</p>` : ''}
      ${Object.keys(b.loot).length ? `<p>Treasure: ${goodsHtml(b.loot)}</p>` : ''}
      ${b.item ? `<p>Found: <b style="color:${DATA.rarity[b.item.rarity].color}">${b.item.icon} ${esc(b.item.name)}</b> (${DATA.rarity[b.item.rarity].name}) — ${G.itemText(b.item)}</p>` : ''}
      ${b.extra ? `<p>${esc(b.extra)}</p>` : ''}</div>`;
  if (b.scout) {
    if (b.failed) return `<p>${esc(b.extra)}</p>`;
    const i = b.intel;
    return `<table style="margin-top:8px">
      <tr><td>Troops</td><td>${unitsHtml(i.units)}</td></tr>
      ${i.res ? `<tr><td>Stores</td><td>${goodsHtml(i.res)}</td></tr>` : ''}
      ${i.wall !== undefined ? `<tr><td>Defenses</td><td>Wall ${i.wall} · Town Hall ${i.th} · Loyalty ${i.loyalty}%</td></tr>` : ''}
    </table>`;
  }
  if (!b.attSent) return b.extra ? `<p>${esc(b.extra)}</p>` : '';
  return `<table style="margin-top:8px">
      <tr><th></th><th>Attacker: ${esc(b.att)}</th><th>Defender: ${esc(b.def)}</th></tr>
      <tr><td>Strength</td><td>⚔️ ${fmt(b.A)}</td><td>🛡️ ${fmt(b.D)}</td></tr>
      <tr><td>Troops</td><td>${unitsHtml(b.attSent)}</td><td>${unitsHtml(b.defHad)}</td></tr>
      <tr><td>Losses</td><td class="bad">${unitsHtml(b.attLost)}</td><td class="bad">${unitsHtml(b.defLost)}</td></tr>
      <tr><td>Plunder</td><td colspan="2">${goodsHtml(b.loot)}</td></tr>
    </table>${b.extra ? `<p>${esc(b.extra)}</p>` : ''}`;
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
    <p>⭐ Renown <b>${ren}</b> — from building levels, victories (${emp.wins || 0} × 3) and conquests (${emp.conquests || 0} × 25).
    ${need === Infinity ? 'You have reached the greatest size a realm can hold.' : `Your next city needs <b>${need}</b> renown. Train Settlers at a Town Hall of level 5+ and send them to open land.`}</p>
    <p class="muted">${DATA.pace[S.settings.pace].name} pace · ${DATA.modes[S.settings.mode].name}: ${DATA.modes[S.settings.mode].desc} · Rival pressure ${Math.round(G.aiPressure(S) * 100)}%</p>
  </div>
  <div class="card"><h3>Cities</h3><table><tr><th>City</th><th>Tier</th><th>People</th>${goods.map(g => `<th>${DATA.goods[g].icon}</th>`).join('')}<th>Troops</th></tr>
    ${cities.map(c => `<tr><td><button class="link" data-act="city" data-c="${c.id}">${esc(c.name)}</button></td><td>${G.tier(c).name}</td><td>${fmt(c.pop)}</td>${goods.map(g => `<td>${fmt(c.res[g] || 0)}</td>`).join('')}<td>${G.unitsCount(c.units)}</td></tr>`).join('')}</table></div>
  ${wondersHtml()}
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
    <li><b>Smith.</b> The <b>Smelter</b> turns ore into iron; the <b>Toolsmith</b> makes tools (needed for building levels 6+, settlers and research); the <b>Armory</b> forges weapons for soldiers. Each people has its own twist — check your race perks. Workshops can be paused.</li>
    <li><b>Your hero</b> 🦸 starts in your capital. Spend attribute points, send them to <b>ruins</b> 🏚️ on adventures for treasure, experience and items, or march with your armies for leadership bonuses. A fallen hero can be revived.</li>
    <li><b>Research</b> 📚 at the Academy: empire-wide upgrades to production, building speed, storage, attack, defense and more.</li>
    <li><b>Location matters.</b> A city's yields come from the land within 2 tiles: forests give timber, hills stone, mountains ore, fertile land grain. Rivers and lakes make a city more prosperous. Each people's homeland suits its specialty, and the site survey on the World map rates open land before you settle. Trade covers what your land lacks.</li>
    <li><b>Explore.</b> The map is hidden until your cities, armies or scouts 🦅 see it. Scouts bring back troop counts, stores and walls. <b>Oases</b> 🏝️ guarded by beasts give a nearby city +25% of a good once claimed (attack and win; one slot per 5 Town Hall levels).</li>
    <li><b>Fight.</b> Raid brigand camps for plunder and renown. Defenders with high 🐎🛡️ stop cavalry, high 🛡️ stops infantry. Rivals leave you alone at first; their pressure grows over time.</li>
    <li><b>Diplomacy</b> 🕊️: send gifts, make peace, form alliances, demand tribute, and trade with foreign merchants. Breaking a treaty angers everyone.</li>
    <li><b>Expand & conquer.</b> Renown unlocks city slots; Settlers found cities. A <b>Herald</b> marching with a winning army lowers a city's loyalty; at zero it is yours.</li>
    <li><b>Calamities & wonders.</b> Now and then a wyrm wakes, a blight spreads, the dead rise, the earth shakes, rivers flood or a star falls. Each strikes a whole region — every realm's cities inside it. Some can be fought (storm the wyrm's lair, destroy the hordes, claim the star-iron); others must be endured, and some leave boons behind.</li>
    <li><b>Modes.</b> Conquest ends when every rival falls. In Endless, fallen realms rise again as new dynasties and warlords keep coming.</li>
  </ol>
  <p class="muted">Quests (right column) guide you early and pay rewards. Events may ask for your decision; if you don't answer in time, the default happens. Time keeps running at normal (1×) speed while the game is closed, up to 12 hours. The game autosaves every 15 seconds in this browser.</p></div>`;

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
  if (S.gameOver === 'wonder') {
    const e = S.empires[S.gameOverBy] || {}; const w = DATA.wonders[e.race] || {};
    return `<div class="banner lose">The ${esc(e.name || 'rival')} completed ${esc(w.name || 'their wonder')}. Their legend eclipses yours — the game is lost.<div class="row" style="justify-content:center;margin-top:8px"><button class="primary" data-act="continueEndless">Play on in Endless mode</button><button data-act="newgame">Start a new game</button></div></div>`;
  }
  if (S.victory && !S.victorySeen) {
    const msg = S.victory === 'wonder' ? `${esc(DATA.wonders[S.empires.p.race].name)} stands complete. Your people's legend will outlast the ages!` : 'Every rival crown has fallen. The realm is yours!';
    return `<div class="banner win">👑 Victory! ${msg}<div class="row" style="justify-content:center;margin-top:8px"><button class="primary" data-act="dismissVictory">Keep playing</button><button data-act="newgame">Start a new game</button></div></div>`;
  }
  return '';
};

// ---------------------------------------------------------------------
// render
// ---------------------------------------------------------------------
let lastFull = 0;
const render = (force) => {
  if (!S) { if (force) renderStart(); return; }
  const city = curCity();
  if (!city) {
    $app.innerHTML = `<div class="start"><div class="banner lose">Your last city has fallen. The ${DATA.races[S.empires.p.race].name} chronicle ends here.</div><p style="text-align:center"><button class="primary" data-act="newgame">Begin anew</button></p></div>`;
    return;
  }
  const active = document.activeElement;
  const editing = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT') && $app.contains(active);
  const slowTab = UI.tab === 'world' && typeof worldMapHtml !== 'function' && Date.now() - lastFull < 2500;
  if ((editing || UI.holding || UI.touching || slowTab) && !force) {
    const top = $app.querySelector('.top');
    if (top && !(active && active.id === 'speedSel')) top.outerHTML = renderTop(city);
    return;
  }
  lastFull = Date.now();
  const scroll = window.scrollY;
  const logEl = $app.querySelector('.log');
  const logScroll = logEl ? logEl.scrollTop : 0;
  // sideways scroll positions (phone tab bar, wide tables) survive the rebuild
  const navEl = $app.querySelector('.nav');
  const navScroll = navEl ? navEl.scrollLeft : 0;
  const cardScroll = [...$app.querySelectorAll('main .card')].map(c => c.scrollLeft);
  const tab = TABS[UI.tab] || TABS.city;
  $app.innerHTML = renderTop(city) + `<div class="layout">${renderSide(city)}<main>${endgameBanner()}${tab.render(city)}</main>${renderRight()}</div>`;
  window.scrollTo(0, scroll);
  const logEl2 = $app.querySelector('.log');
  if (logEl2) logEl2.scrollTop = logScroll;
  const navEl2 = $app.querySelector('.nav');
  if (navEl2 && navScroll) navEl2.scrollLeft = navScroll;
  $app.querySelectorAll('main .card').forEach((c, i) => { if (cardScroll[i]) c.scrollLeft = cardScroll[i]; });
  runMountHooks();
};

// ---------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------
Object.assign(act, {
  pickRace: d => { readStart(); UI.start.race = d.r; renderStart(); },
  begin: () => {
    readStart();
    const st = UI.start;
    S = G.newGame({ name: st.name.trim(), cityName: st.city.trim(), heroName: st.hero.trim(), race: st.race, difficulty: st.difficulty, pace: st.pace, mode: st.mode });
    UI.city = G.citiesOf(S, 'p')[0].id; UI.tab = 'city'; UI.form = {}; UI.sel = null;
    G.save(S); render(true);
  },
  tab: d => { UI.tab = d.t; window.scrollTo(0, 0); render(true); },
  city: d => { UI.city = d.c; render(true); },
  build: d => { toast(G.queueBuild(S, UI.city, d.b)); render(true); },
  cancelBuild: d => { G.cancelBuild(S, UI.city, +d.i); render(true); },
  toggleRefine: d => { const c = curCity(); c.refineOff[d.b] = !c.refineOff[d.b]; render(true); },
  rename: () => { const c = curCity(); const n = prompt('New name for ' + c.name, c.name); if (n && n.trim()) { c.name = n.trim().slice(0, 30); render(true); } },
  maxTrain: d => { UI.form[d.k] = G.maxAffordable(S, curCity(), DATA.units[d.u].cost); render(true); },
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
