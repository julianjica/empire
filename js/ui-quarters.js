// =====================================================================
//  City quarters UI: a "Quarters" card on the City tab (a 5×5 map of the
//  city's ground: pick a tile, pick a type, found it; the quarters list with
//  their yields, building progress, repairs and outer walls), and the world
//  tile panel (found a quarter on a free tile near the selected city; an own
//  quarter's details; a rival's quarter with a raid-and-burn send form).
//  The engine side lives in js/quarters.js; the map art in worldmap.js.
// =====================================================================
'use strict';
if (typeof TILE_EXTRAS !== 'undefined' && G.qtrSlots) {
  const QT = G.QTR, TY = QT.types;
  const gI = g => g === 'gold' ? '🪙' : (DATA.goods[g] ? DATA.goods[g].icon : g);
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  if (!document.getElementById('qt-style')) {
    const st = document.createElement('style'); st.id = 'qt-style';
    st.textContent = `
.qt-wrap{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.qt-grid{display:grid;grid-template-columns:repeat(5,44px);grid-template-rows:repeat(5,44px);gap:3px;flex:0 0 auto}
.qt-cell{position:relative;border:1px solid rgba(59,42,26,.35);border-radius:6px;font-size:20px;line-height:42px;text-align:center;cursor:default;padding:0;color:inherit;min-width:0}
.qt-cell.can{cursor:pointer;box-shadow:inset 0 0 0 2px rgba(201,164,60,.85);border-style:dashed}
.qt-cell.mine{cursor:pointer}
.qt-cell.sel{outline:3px solid #8b2a1a;outline-offset:1px}
.qt-cell.fog{background:#3a3026 !important;opacity:.6}
.qt-cell .qt-tag{position:absolute;right:2px;bottom:1px;font-size:10px;line-height:1}
.qt-cell .qt-dep{position:absolute;left:2px;top:1px;font-size:10px;line-height:1}
.qt-side{flex:1 1 220px;min-width:0;font-size:13px}
.qt-types{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.qt-type{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid rgba(59,42,26,.2);border-radius:6px;padding:5px 7px}
.qt-type b{min-width:110px}
.qt-type .qt-fx{flex:1 1 140px;font-size:12px}
.qt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:4px 0;border-top:1px solid rgba(59,42,26,.12);font-size:13px}
.qt-row .bar{flex:1 1 80px;min-width:60px}
@media (max-width:600px){.qt-grid{grid-template-columns:repeat(5,minmax(0,1fr));grid-template-rows:none;width:100%}.qt-cell{aspect-ratio:1;line-height:normal;display:flex;align-items:center;justify-content:center}.qt-side{flex-basis:100%}.qt-type b{min-width:0}}
`;
    document.head.appendChild(st);
  }

  // what a quarter of this type would do (or does) for the city: short lines
  const effects = (city, q, e) => {
    const d = TY[q.type], out = [];
    if (!d) return out;
    const y = G.qtrYield(S, city, { ...q, built: true, burnt: 0 }, e ? e.eff : 1);
    const prod = Object.entries(y).filter(([, v]) => v > 0.05).map(([g, v]) => `+${fmt(v)} ${gI(g)}/min`);
    if (prod.length) out.push(prod.join(' '));
    const th = G.lvl(city, 'townhall'), t = G.tileAt(S, q.x, q.y);
    if (d.housing) out.push(`+${Math.round((d.housing[0] + d.housing[1] * th) * G.mod(S, city.owner, city, 'housing'))} 🏠 housing`);
    if (d.dep && t && t.deposit && d.dep.includes(t.deposit)) out.push(`works the ${DATA.goods[t.deposit].name.toLowerCase()} deposit fully (+${Math.round((QT.depSite - 1) * 100)}% city ${DATA.goods[t.deposit].name.toLowerCase()})`);
    if (d.max) out.push(Object.keys(d.max).map(b => DATA.buildings[b].name).join(' & ') + ` +${QT.maxBonus} max level`);
    if (d.refine) out.push(`+${Math.round(d.refine * 100)}% workshops`);
    if (d.tax) out.push(`+${Math.round(d.tax * 100)}% taxes`);
    if (d.def) out.push(`+${Math.round(d.def * 100)}% city defence`);
    if (d.ley) { const at = G.qtrLeyAt(S, q.x, q.y); out.push(at && at.node ? `taps the ley enclave ×${at.node.power} at full strength` : at ? 'on a ley line: +0.5 ley' : 'no ley here'); }
    return out;
  };
  const tileLabel = t => {
    const dep = { ore: 'ore vein', stone: 'fine stone', timber: 'ancient grove', grain: 'black earth' }[t.deposit];
    const river = G.riverSet(S).has(t.y * S.map + t.x);
    return `${DATA.terrain[t.terrain] ? DATA.terrain[t.terrain].name : t.terrain}${dep ? ' · ' + dep : ''}${river ? ' · river' : ''}${G.coastal(S, t.x, t.y) && !G.isWater(t) ? ' · shore' : ''}${G.qtrLeyAt(S, t.x, t.y) ? ' · ley' : ''}`;
  };
  const qName = q => `${TY[q.type] ? TY[q.type].icon + ' ' + TY[q.type].name : q.type}`;
  const statusTxt = (city, q) => !q.built ? (q.start <= S.time ? `building · ${fmtTime(realSecs(q.end - S.time))} left` : `waiting · ${fmtTime(realSecs(q.end - q.start))}`) : q.burnt > S.time ? `🔥 burnt · ${fmtTime(realSecs(q.burnt - S.time))} until rebuilt` : '';

  // the found-a-quarter choices for one tile (shared by the card and the tile panel)
  const typeChoices = (city, x, y, e) => {
    const types = G.qtrTypesFor(S, x, y);
    if (!types.length) return '<p class="muted">Nothing can be built here.</p>';
    const st0 = G.qtrStatus(S, city, x, y, types[0]);
    const head = `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">${costHtml(st0.cost, city)}<span class="muted" style="font-size:12px">⏱ ${fmtTime(realSecs(st0.time))}</span></div>`;
    const rows = types.map(type => {
      const st = G.qtrStatus(S, city, x, y, type), d = TY[type];
      const fx = effects(city, { x, y, type }, e);
      return `<div class="qt-type" title="${esc(d.desc)}"><b>${d.icon} ${d.name}</b><span class="qt-fx">${esc(fx.join(' · ') || d.desc)}</span>
        <button class="small ${st.ok ? 'primary' : ''}" data-act="qtFound" data-c="${city.id}" data-x="${x}" data-y="${y}" data-t="${type}" ${st.ok ? '' : 'disabled'} title="${esc(st.ok ? 'Found a ' + d.name.toLowerCase() + ' here' : st.reason)}">Found</button></div>`;
    }).join('');
    return head + (st0.ok || st0.poor ? '' : `<div class="warn" style="font-size:12px">${esc(st0.reason)}</div>`) + `<div class="qt-types">${rows}</div>`;
  };

  // ---- the City tab card -------------------------------------------------------
  const card = city => {
    const qs = G.qtrList(city), slots = G.qtrSlots(S, city), nx = G.qtrNextSlot(S, city), e = G.econ(S, city);
    const R = QT.reach, sel = UI.qtSel && UI.qtSel.c === city.id ? UI.qtSel : null;
    const cells = [];
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = city.x + dx, y = city.y + dy, t = G.tileAt(S, x, y);
      if (!t) { cells.push('<div class="qt-cell fog"></div>'); continue; }
      const seen = S.explored[y * S.map + x];
      const terr = DATA.terrain[t.terrain] || {};
      const h = t.quarter ? G.qtrAt(S, x, y) : null;
      const mine = h && h.city === city;
      const can = !dx && !dy ? false : !h && G.qtrTypesFor(S, x, y).length && G.qtrStatus(S, city, x, y, G.qtrTypesFor(S, x, y)[0]).reason !== undefined && (() => { const st = G.qtrStatus(S, city, x, y, G.qtrTypesFor(S, x, y)[0]); return st.ok || st.poor || /queue/.test(st.reason); })();
      let ico = '', tag = '';
      if (!dx && !dy) ico = '🏛️';
      else if (h) { ico = TY[h.q.type] ? TY[h.q.type].icon : '?'; tag = !h.q.built ? '🏗️' : h.q.burnt > S.time ? '🔥' : ''; if (!mine) tag = '⚑'; }
      else if (t.city) ico = '🏰';
      else if (t.minor) ico = '🏯';
      else if (t.camp) ico = '⛺';
      else if (t.oasis) ico = '🏝️';
      else if (t.ruin) ico = '🏚️';
      const dep = t.deposit ? { ore: '⛏️', stone: '🪨', timber: '🌲', grain: '🌾' }[t.deposit] || '' : '';
      const cls = ['qt-cell', seen ? '' : 'fog', can && !h ? 'can' : '', mine ? 'mine' : '', sel && sel.x === x && sel.y === y ? 'sel' : ''].filter(Boolean).join(' ');
      const tip = !seen ? 'Unexplored' : (!dx && !dy ? city.name : h ? `${qName(h.q)}${mine ? '' : ' of ' + (h.city || h.minor).name}` : tileLabel(t)) + ` (${x}, ${y})`;
      const clickable = seen && (dx || dy) && (can || mine);
      cells.push(`<${clickable ? 'button' : 'div'} class="${cls}" style="background:${terr.color || '#888'}${h && !mine ? ';opacity:.75' : ''}" title="${esc(tip)}" ${clickable ? `data-act="qtSel" data-c="${city.id}" data-x="${x}" data-y="${y}" aria-label="${esc(tip)}"` : ''}>${seen ? ico : ''}${seen && dep && !h ? `<span class="qt-dep">${dep}</span>` : ''}${tag ? `<span class="qt-tag">${tag}</span>` : ''}</${clickable ? 'button' : 'div'}>`);
    }
    let side;
    const st = sel && G.tileAt(S, sel.x, sel.y);
    const selQ = st && st.quarter ? G.qtrAt(S, sel.x, sel.y) : null;
    if (selQ && selQ.city === city) {
      const q = selQ.q, fx = effects(city, q, e), stt = statusTxt(city, q);
      side = `<b>${qName(q)}</b> <span class="muted">(${q.x}, ${q.y}) · ${esc(tileLabel(st))}</span>
        <div style="margin:4px 0">${esc(fx.join(' · '))}</div>${stt ? `<div class="${q.burnt > S.time ? 'bad' : 'muted'}">${stt}</div>` : ''}
        <div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">
        ${!q.built ? `<button class="small" data-act="qtCancel" data-c="${city.id}" data-x="${q.x}" data-y="${q.y}" title="Refund ${q.start <= S.time ? '50%' : '100%'}">✕ Cancel</button>` : ''}
        ${q.burnt > S.time ? `<button class="small primary" data-act="qtRepair" data-c="${city.id}" data-x="${q.x}" data-y="${q.y}">🔨 Repair now</button>${costHtml(G.repairQuote(S, city, q), city)}` : ''}
        <button class="small" data-act="qtMap" data-x="${q.x}" data-y="${q.y}">🗺️ On the map</button></div>`;
    } else if (st && !st.quarter) {
      side = `<b>(${sel.x}, ${sel.y})</b> <span class="muted">${esc(tileLabel(st))}</span>${typeChoices(city, sel.x, sel.y, e)}`;
    } else {
      side = `<p class="muted" style="margin:0">${slots > qs.length ? 'Pick a gold-dashed tile to grow the city onto it.' : nx ? `A further quarter at Town Hall ${nx.th} and ${nx.pop} people.` : 'Every quarter is claimed.'} Each quarter works its own tile: farmland on fertile land, a lumber yard in the forest, a mining quarter on hills or a deposit, docks on the shore, a mill on a river, an arcane quarter on a ley node; homes or a fort anywhere.</p>`;
    }
    const list = qs.map(q => {
      const stt = statusTxt(city, q), fx = q.built && !(q.burnt > S.time) ? effects(city, q, e).slice(0, 2).join(' · ') : '';
      const prog = !q.built && q.start <= S.time ? `<div class="bar"><i style="width:${pct(S.time - q.start, q.end - q.start)}%"></i></div>` : '';
      return `<div class="qt-row"><button class="small" data-act="qtSel" data-c="${city.id}" data-x="${q.x}" data-y="${q.y}" title="Select">${qName(q)}</button><span class="muted">(${q.x}, ${q.y})</span>${prog}<span class="${q.burnt > S.time ? 'bad' : ''}" style="font-size:12px">${esc(stt || fx)}</span></div>`;
    }).join('');
    const ow = G.outerWallStatus(S, city);
    const outer = city.outerWall ? '<div class="qt-row">🧱 <b>Outer walls</b> <span class="muted">ring the quarters: raiders on them face your walls.</span></div>'
      : city.outerAt ? `<div class="qt-row">🧱 <b>Outer walls</b> <span class="muted">masons at work · ${fmtTime(realSecs(city.outerAt - S.time))} left</span></div>`
      : qs.length ? `<div class="qt-row">🧱 <b>Outer walls</b> <span class="muted" style="font-size:12px">The wall covers the core; outer walls shield the quarters from raiders.</span>${costHtml(ow.cost, city)}<button class="small ${ow.ok ? 'primary' : ''}" data-act="qtOuter" data-c="${city.id}" ${ow.ok ? '' : 'disabled'} title="${esc(ow.ok ? 'Raise outer walls' : ow.reason)}">Build</button>${!ow.ok && !ow.poor ? `<span class="warn" style="font-size:12px">${esc(ow.reason)}</span>` : ''}</div>` : '';
    const gov = S.council && S.council.gov && S.council.gov[city.id] && S.council.gov[city.id].on ? S.council.gov[city.id] : null;
    const govRow = gov ? `<label class="row" style="gap:6px;font-size:12.5px;margin-top:4px"><input type="checkbox" data-act="qtGov" data-c="${city.id}" ${gov.quarters === false ? '' : 'checked'}> The governor claims quarters on its own</label>` : '';
    return `<div class="card qt-card" id="qt-card"><h3>🏘️ Quarters <span class="muted" style="font-size:13px">${qs.length} of ${slots} claimed${nx ? ` · next at Town Hall ${nx.th} & ${nx.pop} people` : ''}</span></h3>
      <div class="qt-wrap"><div class="qt-grid" role="grid" aria-label="The ground round ${esc(city.name)}">${cells.join('')}</div><div class="qt-side">${side}</div></div>
      ${list}${outer}${govRow}</div>`;
  };
  const baseCity = TABS.city && TABS.city.render;
  if (baseCity) TABS.city.render = city => {
    const html = baseCity(city);
    let c = '';
    try { c = card(city); } catch (err) { console.error('quarters card', err); }
    const i = html.indexOf('<div class="card"><h3>Construction');
    return i >= 0 ? html.slice(0, i) + c + html.slice(i) : html + c;
  };

  // ---- the world tile panel ------------------------------------------------------
  TILE_PANELS.push((city, t) => {
    if (!S || !t || !t.quarter || t.city) return '';
    const h = G.qtrAt(S, t.x, t.y);
    if (!h) return '';
    const q = h.q, d = TY[q.type], host = h.city || h.minor;
    const head = `<h3>${d ? d.icon + ' ' + d.name : 'Quarter'} of ${esc(host.name)}</h3><div class="muted" style="font-size:12.5px">(${t.x}, ${t.y}) · ${esc(tileLabel(t))} · ${G.dist(city, t).toFixed(1)} tiles from ${esc(city.name)}</div>`;
    if (h.minor) return head + `<p>Outskirts of the free city of ${esc(host.name)}. Its quarters strengthen its defences; it is no place to found a city.</p>`;
    const qc = h.city, stt = statusTxt(qc, q);
    if (qc.owner === 'p') {
      const e = G.econ(S, qc);
      return head + `<p style="margin:6px 0">${esc(effects(qc, q, e).join(' · '))}</p>${stt ? `<div class="${q.burnt > S.time ? 'bad' : 'muted'}">${stt}</div>` : ''}
        <p class="muted" style="font-size:12.5px">Guarded by ${Math.round((q.type === 'fort' ? QT.fortGarrison : QT.garrison) * 100)}% of ${esc(qc.name)}'s garrison${qc.outerWall ? ', behind the outer walls' : ' (no outer walls yet)'}.</p>
        <div class="row" style="gap:6px;flex-wrap:wrap">${!q.built ? `<button class="small" data-act="qtCancel" data-c="${qc.id}" data-x="${q.x}" data-y="${q.y}">✕ Cancel</button>` : ''}
        ${q.burnt > S.time ? `<button class="small primary" data-act="qtRepair" data-c="${qc.id}" data-x="${q.x}" data-y="${q.y}">🔨 Repair now</button>${costHtml(G.repairQuote(S, qc, q), qc)}` : ''}
        <button class="small" data-act="qtCity" data-c="${qc.id}">🏛️ Open ${esc(qc.name)}</button></div>` + extras(TILE_EXTRAS.filter(f => f !== qtExtra), city, t);
    }
    const owner = S.empires[qc.owner], r = G.rel ? G.rel(S, qc.owner) : null;
    const relTxt = r && DATA.statusInfo && DATA.statusInfo[r.status] ? ` · <span class="${DATA.statusInfo[r.status].color}">${DATA.statusInfo[r.status].name}</span>` : '';
    const intel = typeof intelHtml === 'function' ? intelHtml(G.tileAt(S, qc.x, qc.y)) : '';
    const info = `<p><span class="pill" style="border-color:${owner.color}">${esc(owner.name)}</span>${relTxt}${stt ? ' · ' + stt : ''}</p>
      <p class="muted" style="font-size:12.5px">A raid here burns the quarter without storming the city: it yields nothing for ${QT.burnMins} minutes, plunder is taken and loyalty falls. ${Math.round((q.type === 'fort' ? QT.fortGarrison : QT.garrison) * 100)}% of the city's garrison guards it${qc.outerWall ? ', behind outer walls' : ''}.</p>${intel}
      ${r && (r.status === 'peace' || r.status === 'alliance') ? '<p class="warn" style="font-size:12.5px">⚠️ Raiding will break your treaty and anger every realm.</p>' : ''}`;
    const modes = q.built && !(q.burnt > S.time) ? ['burn', 'scout'] : ['scout'];
    return head + info + (typeof sendForm === 'function' ? sendForm(city, t, modes) : '');
  });
  // a free tile near the selected city: grow onto it
  const qtExtra = (city, t) => {
    if (!S || !t || !city || city.owner !== 'p' || t.city || t.quarter || G.isWater(t)) return '';
    if (cheb(city, t) < 1 || cheb(city, t) > QT.reach || !S.explored[t.y * S.map + t.x]) return '';
    const types = G.qtrTypesFor(S, t.x, t.y);
    if (!types.length) return '';
    const st = G.qtrStatus(S, city, t.x, t.y, types[0]);
    if (!st.ok && !st.poor && !/queue/.test(st.reason)) return '';
    return `<div class="card qt-tile" style="padding:6px 9px;margin:6px 0;font-size:13px"><b>🏘️ Grow ${esc(city.name)} onto this tile</b> <span class="muted">(${G.qtrList(city).length} of ${G.qtrSlots(S, city)} quarters)</span>${typeChoices(city, t.x, t.y, G.econ(S, city))}</div>`;
  };
  TILE_EXTRAS.push(qtExtra);

  // ---- labels, actions, help -----------------------------------------------------
  if (typeof MODE_LABEL !== 'undefined') MODE_LABEL.burn = '🔥 Burn';
  if (typeof MODE_HELP !== 'undefined') MODE_HELP.burn = 'Raid an outer quarter and put it to the torch: it stops working for a while, you carry off plunder and the city\'s loyalty falls. Only part of the garrison guards it.';
  if (typeof MOVE_LABEL !== 'undefined') MOVE_LABEL.burn = '🔥 Raid a quarter';
  const done = (err, ok) => { toast(err || ok); render(true); };
  Object.assign(act, {
    qtSel: d => { UI.qtSel = { c: d.c, x: +d.x, y: +d.y }; render(true); },
    qtFound: d => { const c = S.cities[d.c]; const err = G.foundQuarter(S, d.c, +d.x, +d.y, d.t); if (!err) UI.qtSel = { c: d.c, x: +d.x, y: +d.y }; done(err, `${TY[d.t].icon} Builders lay out a ${TY[d.t].name.toLowerCase()} for ${c ? c.name : 'the city'}`); },
    qtCancel: d => done(G.cancelQuarter(S, d.c, +d.x, +d.y), 'Quarter cancelled'),
    qtRepair: d => done(G.repairQuarter(S, d.c, +d.x, +d.y), '🔨 The quarter is rebuilt'),
    qtOuter: d => done(G.buildOuterWall(S, d.c), '🧱 Masons begin the outer walls'),
    qtMap: d => { UI.tab = 'world'; UI.sel = { x: +d.x, y: +d.y }; window.scrollTo(0, 0); render(true); },
    qtCity: d => { if (S.cities[d.c]) { UI.city = d.c; UI.tab = 'city'; window.scrollTo(0, 0); render(true); } },
    qtGov: d => { const g = S.council && S.council.gov && S.council.gov[d.c]; if (g) { g.quarters = g.quarters === false; toast(g.quarters ? 'The governor will claim quarters' : 'The governor leaves quarters to you'); render(true); } },
  });
  if (typeof HELP_SECTIONS !== 'undefined' && !HELP_SECTIONS.some(h => h.id === 'quarters')) {
    const i = HELP_SECTIONS.findIndex(h => h.id === 'expansion');
    const sl = QT.slots.map(([th, p], k) => `${k + 1}: Town Hall ${th}, ${p} people`).join(' · ');
    HELP_SECTIONS.splice(i >= 0 ? i + 1 : HELP_SECTIONS.length, 0, { id: 'quarters', icon: '🏘️', title: 'City quarters', tabs: ['city', 'world'], words: 'quarter quarters grow sprawl farmland lumber yard mining docks mill arcane residential homes fort outer walls burn raid territory tile deposit ley',
      html: `<p>A city grows over the map. As its Town Hall and people pass thresholds it may claim nearby tiles as <b>quarters</b> (${sl}). A quarter must lie within ${QT.reach} tiles of the core and touch the city or another of its quarters, on free land that no rival realm holds. Found one from the city's <b>Quarters</b> card or the world map's tile panel: it costs goods and builder time, one at a time.</p>
      <ul>${QT.order.map(k => `<li><b>${TY[k].icon} ${TY[k].name}</b>: ${TY[k].desc}</li>`).join('')}</ul>
      <p>Each quarter works <b>its own tile</b>, at that tile's yield and not the city's average, so a city on poor land can grow toward its one good tile: a vein of ore, a fertile vale, a ley node. Farmland, lumber yards and mining quarters also grow with the matching building.</p>
      <p>Quarters are your land: rival settlers and outlaws cannot take the tile, and a road links each one to the core. Raiders can <b>burn</b> an outer quarter without storming the city (only part of the garrison guards it); it then yields nothing for ${QT.burnMins} minutes unless repaired, and the city's loyalty falls. The Wall covers the core; <b>outer walls</b> (Wall ${QT.outer.wall}) extend it round the quarters. Rival realms and free cities grow quarters by the same rules, and a governor can claim them for you.</p>` });
  }
  if (typeof HELP_GLOSSARY !== 'undefined') HELP_GLOSSARY.push(['Quarter', 'A tile a grown city has claimed: farmland, lumber yard, mining quarter, docks, mill, arcane quarter, homes or a fort. It works that one tile.', 'quarters']);
}
