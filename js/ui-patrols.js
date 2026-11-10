// =====================================================================
//  Road patrols UI: the "🛡️ Road patrols" card (Military, Market and Ledger tabs) with the
//  route list and its risk, the realm's patrols, the suggestion ("Route to X is Risky —
//  patrol it?"), the Protector of the Trade title; a tile-panel line; the map painter for
//  patrolled roads (worldmap.js paintRoads calls window.ecPaintPatrols); help and glossary.
//  Form values live in UI.form under data-k keys prefixed pa_. CSS prefix pa- (pt- is portraits).
//  The engine side lives in js/patrols.js.
// =====================================================================
'use strict';
(() => {
  if (typeof G === 'undefined' || !G.PATROL || typeof MILITARY_EXTRAS === 'undefined') return;
  const PT = G.PATROL, LV = G.PATROL_LEVELS;
  const fv = (k, def) => (UI.form[k] !== undefined && UI.form[k] !== '' ? UI.form[k] : def);
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const placeOf = id => (id && (S.cities[id] || (S.minors && S.minors[id]))) || null;
  const pname = id => { const p = placeOf(id); return p ? p.name : '?'; };
  const NONFIELD = { hero: 1, settlers: 1, herald: 1, scout: 1 };
  const fieldUnits = city => Object.keys(city.units || {}).filter(u => (city.units[u] || 0) > 0 && DATA.units[u] && !NONFIELD[u] && !['ship', 'siege', 'civ'].includes(DATA.units[u].type));
  const routeName = r => `${pname(r.from)} → ${G.routeIsMinor && G.routeIsMinor(r) ? '🏰 ' : ''}${pname(r.to.id)}`;
  const lvPill = rk => {
    const L = LV[rk.level] || LV.safe;
    const tip = [`${L.name}: ${Math.round(rk.chance * 100)}% chance of an ambush per trip`,
      ...(rk.camps || []).map(k => `Brigand camp tier ${k.tier} at (${k.x}, ${k.y})`),
      ...(rk.armies ? [`${rk.armies} hostile arm${rk.armies > 1 ? 'ies' : 'y'} near the road`] : []),
      ...(rk.monsters ? [`${rk.monsters} roaming creature${rk.monsters > 1 ? 's' : ''} nearby`] : []),
      ...(rk.war ? ['Enemy cities within reach: their riders may intercept caravans'] : []),
      ...(rk.patrol ? [`Patrol guard ${rk.guard} vs threat ${rk.threat}${rk.holds ? ' (holds)' : ' (outmatched)'}; scares off ${Math.round(rk.deter * 100)}% of ambushes`] : rk.threat ? [`Threat ${rk.threat}: no patrol`] : [])].join('\n');
    return `<span class="pa-lv pa-lv-${L.cls}" title="${esc(tip)}">${L.icon} ${L.name}${rk.level !== 'safe' ? ` · ${Math.round(rk.chance * 100)}%` : ''}</span>`;
  };
  const upTxt = up => `🌾 ${up.grain.toFixed(1)} + 🪙 ${up.gold.toFixed(1)}/min`;
  const genName = (p) => { const g = p.general && G.generalById(S, p.owner, p.general); return g ? g.name : ''; };
  const patrolFor = r => G.patrolsOf(S, r.owner).find(p => p.route === r.id || (p.from === r.from && p.to === r.to.id) || (p.to === r.from && p.from === r.to.id)) || null;
  const tripIncome = r => {
    const from = S.cities[r.from], to = G.routeDest(S, r);
    if (!from || !to) return '';
    if (r.foreign) return G.routeTripIncome(S, r, from, to);
    if (G.routeIsMinor(r)) return G.minorRouteQuote(S, from, to, r.goods.give).gold;
    return '';
  };

  // ---- the title ----
  const titleLine = () => {
    const pr = G.protector(S), my = pr.score.p || 0, h = pr.holder;
    const who = h ? (h === 'p' ? '<b class="good">you</b>' : `the <b>${esc(S.empires[h].name)}</b>`) : '<span class="muted">nobody</span>';
    const ranked = Object.entries(pr.score).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o, v]) => `${o === 'p' ? 'you' : esc(S.empires[o] ? S.empires[o].name : o)} ${Math.round(v)}`).join(' · ');
    const contest = pr.contested ? ` · <span class="${h === 'p' ? 'bad' : 'warn'}">contested by ${pr.contested === 'p' ? 'you' : esc(S.empires[pr.contested].name)}</span>` : '';
    return `<div class="pa-title" title="Earned by keeping roads safe: caravans protected, ambushes deterred or beaten, interceptions turned back, camps cleared near roads. Scores fade by half every ${PT.half} game-minutes. The holder gains +${PT.renown} renown, +${Math.round(PT.income * 100)}% route income and favour with merchant republics; a rival with ${Math.round(PT.take * 100)}% of the holder's score takes it.">
      🛡️ <b>Protector of the Trade:</b> ${who}${contest}<div class="muted pa-sub">Your score ${Math.round(my)} (claim at ${PT.claim})${ranked ? ` · leaders: ${ranked}` : ''}${h === 'p' ? ` · +${PT.renown} renown, +${Math.round(PT.income * 100)}% route income` : ''}</div></div>`;
  };

  // ---- the suggestion ----
  const suggestion = () => {
    const sg = G.patrolPlan(S, 'p')[0];
    if (!sg) return '';
    const dest = pname(sg.to);
    const L = LV[sg.level];
    const can = sg.enough && sg.slot;
    return `<div class="pa-suggest pa-lv-${L.cls}-b"><b>${L.icon} Route to ${esc(dest)} is ${L.name}</b> — ${esc(sg.reason)}. Patrol it?
      <div class="row pa-row">${G.unitsCount(sg.units) ? `<span class="pa-sub">${unitsHtml(sg.units)} from ${esc(pname(sg.base))} · guard ${sg.guard} vs threat ${sg.threat}</span>` : ''}
      ${can ? `<button class="small primary" data-act="paSuggest" data-r="${esc(sg.route)}">🛡️ Patrol it</button>` : `<span class="muted pa-sub">${!sg.slot ? `All ${G.patrolMax(S, 'p')} patrol slots in use (one more every ${PT.perCities} cities)` : `Not enough troops in ${esc(pname(sg.base))} to hold the road (need guard ${Math.round(sg.threat * PT.hold)})`}</span>`}
      <button class="small" data-act="paPick" data-r="${esc(sg.route)}">Choose troops…</button></div></div>`;
  };

  // ---- routes and their risk ----
  const routeRows = () => {
    const rs = G.patrolRoutes(S, 'p');
    if (!rs.length) return '<p class="muted pa-sub">No trade routes yet. Patrols can still watch any road: pick two places below.</p>';
    return `<div class="tr-scroll"><table class="tr-table pa-table"><tr class="tr-head"><th>Route</th><th>Risk</th><th>Guard</th><th>Income/trip</th><th></th></tr>${rs.map(({ r, risk }) => {
      const p = (risk.patrol && G.patrolById(S, risk.patrol)) || patrolFor(r);
      const inc = tripIncome(r);
      const marching = p && S.time < (p.readyAt || 0);
      return `<tr><td><b>${esc(routeName(r))}</b>${r.foreign ? ` <span class="pill tr-realm-pill" style="border-color:${S.empires[r.to.owner].color}">${esc(S.empires[r.to.owner].name)}</span>` : ''}<div class="muted pa-sub">${r.trips} trip${r.trips === 1 ? '' : 's'}${r.lost ? ` · <span class="bad">${fmt(r.lost)} lost</span>` : ''}</div></td>
        <td data-l="Risk">${lvPill(risk)}</td>
        <td data-l="Guard">${p ? `🛡️ ${esc(p.name)}${marching ? ' <span class="muted">(marching out)</span>' : risk.threat ? ` <span class="muted">(${risk.guard} vs ${risk.threat})</span>` : ''}` : risk.threat ? `<span class="muted">none · threat ${risk.threat}</span>` : '<span class="muted">—</span>'}</td>
        <td data-l="Income per trip">${inc !== '' ? `🪙 ${inc}` : '<span class="muted">—</span>'}</td>
        <td>${p ? '' : `<button class="small" data-act="paPick" data-r="${esc(r.id)}">🛡️ Patrol</button>`}</td></tr>`;
    }).join('')}</table></div>`;
  };

  // ---- the realm's patrols ----
  const patrolRows = () => {
    const ps = G.patrolsOf(S, 'p');
    if (!ps.length) return '';
    return `<h4>Your patrols (${ps.length}/${G.patrolMax(S, 'p')})</h4><div class="tr-scroll"><table class="tr-table pa-table"><tr class="tr-head"><th>Road</th><th>Troops</th><th>Record</th><th>Upkeep</th><th></th></tr>${ps.map((p, i) => {
      const onSt = S.time >= (p.readyAt || 0);
      const gn = genName(p);
      const st = p.stats;
      return `<tr><td><b>${i + 1}. ${esc(p.name)}</b><div class="muted pa-sub">${p.len} tiles · from ${esc(pname(p.base))} · ${onSt ? 'on station' : `marching out, ${fmtTime(realSecs(Math.max(0, p.readyAt - S.time)))}`}${p.hungry ? ' · <span class="bad">hungry, deserting</span>' : ''}</div></td>
        <td data-l="Troops">${unitsHtml(p.units)}${gn ? `<div class="pa-sub">🎖️ ${esc(gn)}, Warden of the Roads</div>` : ''}</td>
        <td data-l="Record"><span class="pa-sub" title="Ambushes scared off · fights won/fought · enemies slain · own losses · caravans seen through">🚫 ${st.deterred} · ⚔️ ${st.won}/${st.fights} · ☠️ ${st.kills} · <span class="${st.lost ? 'bad' : ''}">−${st.lost}</span> · 🐪 ${st.protected}</span></td>
        <td data-l="Upkeep"><span class="pa-sub">${upTxt(G.patrolUpkeep(S, p))}</span></td>
        <td class="tr-ctl"><div class="row"><button class="small" data-act="paEdit" data-p="${esc(p.id)}">Troops…</button><button class="small" data-act="paRecall" data-p="${esc(p.id)}">↩ Recall</button></div></td></tr>`;
    }).join('')}</table></div>`;
  };

  // ---- the form: a route or two places, troops from the base, a general ----
  const form = city => {
    const rs = G.patrolRoutes(S, 'p').filter(({ r, risk }) => !risk.patrol && !patrolFor(r));
    const edit = UI.form.pa_edit && G.patrolById(S, UI.form.pa_edit);
    const known = [...G.citiesOf(S, 'p'), ...Object.values(S.cities).filter(c => c.owner !== 'p' && S.explored[c.y * S.map + c.x]), ...Object.values(S.minors || {}).filter(m => S.explored[m.y * S.map + m.x])];
    let what = fv('pa_what', rs.length ? 'r:' + rs[0].r.id : 'road');
    if (what.startsWith('r:') && !rs.some(x => 'r:' + x.r.id === what)) what = rs.length ? 'r:' + rs[0].r.id : 'road';
    let from, to, route = null;
    if (edit) { from = edit.from; to = edit.to; }
    else if (what.startsWith('r:')) { route = G.routeById(S, what.slice(2)); from = route.from; to = route.to.id; }
    else {
      from = known.some(x => x.id === fv('pa_from')) ? fv('pa_from') : city.id;
      const others = known.filter(x => x.id !== from).sort((x, y) => G.dist(x, placeOf(from)) - G.dist(y, placeOf(from)));
      to = others.some(x => x.id === fv('pa_to')) ? fv('pa_to') : (others[0] || {}).id;
    }
    const a = placeOf(from), b = placeOf(to);
    const base = edit ? S.cities[edit.base] : (a && a.owner === 'p' && S.cities[a.id] ? a : b && b.owner === 'p' && S.cities[b.id] ? b : city);
    const units = base ? [...new Set([...fieldUnits(base), ...(edit ? Object.keys(edit.units) : [])])] : [];
    const sugg = route ? (G.patrolPlan(S, 'p').find(x => x.route === route.id) || {}).units || {} : {};
    const gens = (G.generalsOf ? G.generalsOf(S, 'p') : []).filter(g => g.status === 'home' && g.city === (base && base.id));
    const stretch = a && b ? G.patrolStretch(S, a.id, b.id) : null;
    const rk = a && b ? G.patrolRisk(S, { owner: 'p', from: a.id, to: b.id }) : null;
    const pick = {};
    for (const u of units) { const n = parseInt(fv('pa_u_' + u, edit ? (edit.units[u] || 0) : (sugg[u] || 0)), 10) || 0; if (n > 0) pick[u] = n; }
    const up = G.patrolUpkeep(S, { owner: 'p', base: base ? base.id : null, units: pick, general: null });
    const head = edit ? `<h4>Troops of the patrol on ${esc(edit.name)}</h4>`
      : `<h4>Station a patrol</h4><div class="row pa-row"><label>Watch <select data-k="pa_what">${rs.map(({ r, risk }) => opt('r:' + r.id, `${routeName(r)} · ${LV[risk.level].name}`, what)).join('')}${opt('road', 'a road between two places…', what)}</select></label>
        ${what === 'road' ? `<label>from <select data-k="pa_from">${known.map(x => opt(x.id, x.name, from)).join('')}</select></label><label>to <select data-k="pa_to">${known.filter(x => x.id !== from).map(x => opt(x.id, `${x.name} · ${G.dist(x, a).toFixed(0)} tiles`, to)).join('')}</select></label>` : ''}</div>`;
    return `<div class="tr-form pa-form">${head}
      ${base ? `<div class="pa-sub muted">Troops from ${esc(base.name)}${stretch ? ` · ${Math.round(stretch.len)} tiles of road${stretch.len > PT.maxLen ? ` <span class="bad">(at most ${PT.maxLen})</span>` : ''}` : ''}${rk ? ` · now ${lvPill(rk)}` : ''}</div>
      <div class="pa-units">${units.length ? units.map(u => `<label class="pa-u" title="${esc(DATA.units[u].name)}: ${base.units[u] || 0} at home${edit && edit.units[u] ? `, ${edit.units[u]} on patrol` : ''}">${DATA.units[u].icon} <span class="pa-un">${esc(DATA.units[u].name)}</span> <input type="number" min="0" step="5" data-k="pa_u_${u}" value="${esc(fv('pa_u_' + u, edit ? (edit.units[u] || 0) : (sugg[u] || 0)))}"><span class="muted">/${(base.units[u] || 0) + (edit ? edit.units[u] || 0 : 0)}</span></label>`).join('') : `<span class="muted pa-sub">No field troops in ${esc(base.name)}.</span>`}</div>
      <div class="row pa-row">${!edit && gens.length ? `<label>Warden <select data-k="pa_gen"><option value="">— none —</option>${gens.map(g => opt(g.id, `${g.name} (lvl ${g.level}${g.traits.length ? ', ' + g.traits.map(t => DATA.generalTraits[t] ? DATA.generalTraits[t].name : t).join(', ') : ''})`, fv('pa_gen', ''))).join('')}</select></label>` : ''}
        <span class="pa-sub">Upkeep ${upTxt(up)}</span>
        ${edit ? `<button class="small primary" data-act="paSave" data-p="${esc(edit.id)}">Save</button><button class="small" data-act="paCancel">Cancel</button>`
          : `<button class="small primary" data-act="paNew" data-from="${esc(from || '')}" data-to="${esc(to || '')}" data-route="${esc(route ? route.id : '')}" data-base="${esc(base.id)}">🛡️ Station patrol</button>`}</div>` : '<p class="muted pa-sub">Choose a road.</p>'}
    </div>`;
  };

  const card = (city, where) => {
    if (!S || !city) return '';
    const ps = G.patrolsOf(S, 'p');
    const rs = G.patrolRoutes(S, 'p');
    if (where === 'market' && !rs.length && !ps.length) return '';
    return `<div class="card tr-card pa-card" id="pa-${where}"><h3>🛡️ Road patrols</h3>
      <p class="muted pa-sub">Troops stationed on a road scare off brigands, beasts and raiders, meet interceptions before they reach the caravan, speed caravans a little and wear the road in. They cost a field upkeep (grain from their city, gold from the treasury) and leave the garrison thinner.</p>
      ${titleLine()}${suggestion()}${routeRows()}${patrolRows()}${form(city)}</div>`;
  };
  MILITARY_EXTRAS.push(city => card(city, 'military'));
  MARKET_EXTRAS.push(city => card(city, 'market'));

  // the Ledger tab (ui-ledger.js loads after this file): a compact summary under it
  const ledgerCard = () => {
    const ps = G.patrolsOf(S, 'p'), rs = G.patrolRoutes(S, 'p');
    if (!ps.length && !rs.length) return '';
    const bad = rs.filter(x => x.risk.level === 'risky' || x.risk.level === 'deadly');
    const up = ps.reduce((a, p) => { const u = G.patrolUpkeep(S, p); a.grain += u.grain; a.gold += u.gold; return a; }, { grain: 0, gold: 0 });
    return `<div class="card tr-card pa-card" id="pa-ledger"><h3>🛡️ Road patrols</h3>${titleLine()}${suggestion()}
      <p class="pa-sub">${ps.length} patrol${ps.length === 1 ? '' : 's'} · upkeep ${upTxt(up)} · ${rs.length} route${rs.length === 1 ? '' : 's'}${bad.length ? `, <span class="bad">${bad.length} risky or deadly</span>` : ', all safe or watched'} <button class="small" data-act="tab" data-t="military">Manage on 🛡️ Military →</button></p>${routeRows()}</div>`;
  };
  const installLedger = () => {
    if (typeof TABS === 'undefined' || !TABS.ledger || TABS.ledger._pa) return;
    const base = TABS.ledger.render;
    TABS.ledger.render = (...a) => base(...a) + (() => { try { return ledgerCard(); } catch (e) { console.error(e); return ''; } })();
    TABS.ledger._pa = true;
  };

  // ---- the tile panel ----
  TILE_EXTRAS.push((city, t) => {
    if (!S || !t || !S.patrols || !S.patrols.list.length) return '';
    const vis = S.explored[t.y * S.map + t.x];
    if (!vis) return '';
    const lines = [];
    for (const o of Object.keys(S.empires)) {
      const p = G.patrolCoverAt(S, o, t.x, t.y);
      if (!p) continue;
      const gn = genName(p);
      lines.push(o === 'p'
        ? `🛡️ <b>Patrolled</b> by your patrol on ${esc(p.name)} · ${G.unitsCount(p.units)} troops${gn ? ` under ${esc(gn)}` : ''} · scared off ${p.stats.deterred}, won ${p.stats.won}/${p.stats.fights}`
        : `🛡️ <b>Patrolled</b> by the <span style="color:${S.empires[o].color}">${esc(S.empires[o].name)}</span> (${esc(p.name)})`);
    }
    return lines.length ? `<div class="card pa-tile" style="padding:6px 9px;margin:6px 0;font-size:13px">${lines.join('<br>')}</div>` : '';
  });

  // ---- the map: patrolled roads drawn as a soft band with small pennants (baked with the roads) ----
  window.ecPaintPatrols = (g, X, P) => {
    if (!S || !S.patrols || !S.patrols.list.length) return;
    const N = S.map;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const p of S.patrols.list) {
      if (!p.path || p.path.length < 2) continue;
      const mine = p.owner === 'p';
      const col = mine ? '#c8962e' : ((S.empires[p.owner] || {}).color || '#888');
      const seen = q => S.explored[q[1] * N + q[0]];
      if (!mine && !p.path.some(seen)) continue;
      const on = S.time >= (p.readyAt || 0);
      g.globalAlpha = on ? 0.32 : 0.18;
      g.strokeStyle = col; g.lineWidth = P * 0.32; g.setLineDash([]);
      g.beginPath();
      let pen = false;
      for (const q of p.path) {
        if (!mine && !seen(q)) { pen = false; continue; }
        const x = X(q[0] + 0.5), y = X(q[1] + 0.5);
        if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
      }
      g.stroke();
      g.globalAlpha = on ? 0.9 : 0.5;
      g.strokeStyle = mine ? '#7a4d0c' : col; g.lineWidth = P * 0.045; g.setLineDash([P * 0.14, P * 0.1]); g.stroke();
      g.setLineDash([]);
      // pennants at both ends and the middle of the stretch
      for (const k of [0, Math.floor(p.path.length / 2), p.path.length - 1]) {
        const q = p.path[k];
        if (!mine && !seen(q)) continue;
        const x = X(q[0] + 0.5) + P * 0.18, y = X(q[1] + 0.5) - P * 0.05;
        g.globalAlpha = 0.95;
        g.strokeStyle = '#3b2a1a'; g.lineWidth = P * 0.025;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - P * 0.34); g.stroke();
        g.fillStyle = col; g.beginPath(); g.moveTo(x, y - P * 0.34); g.lineTo(x + P * 0.2, y - P * 0.27); g.lineTo(x, y - P * 0.2); g.closePath(); g.fill();
        g.stroke();
      }
    }
    g.restore();
  };

  // ---- actions ----
  const unitsFromForm = (base, edit) => {
    const out = {};
    for (const u of new Set([...fieldUnits(base), ...(edit ? Object.keys(edit.units) : [])])) { const n = parseInt(UI.form['pa_u_' + u], 10); const def = edit ? edit.units[u] || 0 : 0; const v = isNaN(n) ? def : n; if (v > 0) out[u] = v; }
    return out;
  };
  const clearForm = () => { for (const k of Object.keys(UI.form)) if (k.startsWith('pa_u_') || k === 'pa_gen' || k === 'pa_edit') delete UI.form[k]; };
  const scrollToForm = () => setTimeout(() => { const el = document.querySelector('.pa-form'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30);
  Object.assign(act, {
    paSuggest: d => {
      const sg = G.patrolPlan(S, 'p').find(x => x.route === d.r);
      if (!sg) return toast('That route needs no patrol now');
      const r = G.patrolCreate(S, 'p', { route: sg.route, units: sg.units });
      toast(typeof r === 'string' ? r : `🛡️ ${G.unitsCount(r.units)} troops ride out to patrol ${r.name}`); render(true);
    },
    paPick: d => { clearForm(); UI.form.pa_what = 'r:' + d.r; if (UI.tab !== 'military' && UI.tab !== 'market') UI.tab = 'military'; render(true); scrollToForm(); },
    paNew: d => {
      const base = S.cities[d.base];
      if (!base) return toast('Choose a road');
      const opts = d.route ? { route: d.route } : { from: d.from, to: d.to };
      opts.base = base.id; opts.units = unitsFromForm(base); if (UI.form.pa_gen) opts.general = UI.form.pa_gen;
      const r = G.patrolCreate(S, 'p', opts);
      if (typeof r !== 'string') clearForm();
      toast(typeof r === 'string' ? r : `🛡️ ${G.unitsCount(r.units)} troops ride out to patrol ${r.name}`); render(true);
    },
    paEdit: d => { clearForm(); UI.form.pa_edit = d.p; render(true); scrollToForm(); },
    paCancel: () => { clearForm(); render(true); },
    paSave: d => {
      const p = G.patrolById(S, d.p); if (!p) return toast('No such patrol');
      const e = G.patrolSetUnits(S, p.id, unitsFromForm(S.cities[p.base], p));
      if (!e) clearForm();
      toast(e || 'Patrol strength set'); render(true);
    },
    paRecall: d => { const e = G.patrolRecall(S, d.p, 'p'); toast(e || '↩ The patrol marches home'); render(true); },
  });
  document.addEventListener('change', ev => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (!k || !k.startsWith('pa_') || UI.tab === 'world') return;
    UI.form[k] = ev.target.value;
    if (k === 'pa_what' || k === 'pa_from' || k === 'pa_to') for (const x of Object.keys(UI.form)) if (x.startsWith('pa_u_')) delete UI.form[x];
    ev.target.blur(); render(true);
  });

  // ---- styles, help, glossary (once the page is up) ----
  const CSS = `
.pa-card .pa-sub{font-size:12px}
.pa-title{margin:6px 0;padding:6px 8px;border:1px solid var(--line);border-radius:8px;font-size:13px}
.pa-suggest{margin:8px 0;padding:7px 9px;border-radius:8px;border:1px solid var(--warn);background:color-mix(in srgb,var(--warn) 8%,transparent);font-size:13px}
.pa-suggest.pa-lv-deadly-b{border-color:var(--bad);background:color-mix(in srgb,var(--bad) 9%,transparent)}
.pa-row{gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px}
.pa-lv{display:inline-block;padding:0 7px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid var(--line);white-space:nowrap}
.pa-lv-safe{color:var(--good);border-color:var(--good)}
.pa-lv-watched{color:var(--accent,#3a6ea5);border-color:var(--accent,#3a6ea5)}
.pa-lv-risky{color:var(--warn);border-color:var(--warn)}
.pa-lv-deadly{color:var(--bad);border-color:var(--bad);background:color-mix(in srgb,var(--bad) 8%,transparent)}
.pa-units{display:flex;flex-wrap:wrap;gap:4px 10px;margin:6px 0}
.pa-u{display:inline-flex;align-items:center;gap:4px;font-size:13px}
.pa-u input{width:62px}
.pa-form select{max-width:260px}
@media (max-width:640px){.pa-form select{max-width:100%}.pa-u{flex:1 1 45%}.pa-un{display:none}.pa-u input{width:56px}.pa-title,.pa-suggest{font-size:12.5px}}`;
  let installed = false;
  const install = () => {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    const st = document.createElement('style'); st.id = 'paStyle'; st.textContent = CSS; document.head.appendChild(st);
    installLedger();
    if (G.patrolRegisterCli) G.patrolRegisterCli();   // the console knows patrol / patrols / recall patrol N before the first tick
    if (typeof HELP_SECTIONS !== 'undefined' && !HELP_SECTIONS.some(h => h.id === 'patrols')) {
      const i = HELP_SECTIONS.findIndex(h => h.id === 'roads' || h.id === 'trade');
      HELP_SECTIONS.splice(i >= 0 ? i + 1 : HELP_SECTIONS.length, 0, { id: 'patrols', icon: '🛡️', title: 'Road patrols & the Protector of the Trade', tabs: ['military'],
        words: 'patrol patrols guard road roads route routes caravan escort ambush brigands bandits camp intercept interception protector trade title warden general upkeep risk safe watched risky deadly supply',
        html: `<p>Station troops on a road as a standing <b>patrol</b>: on the 🛡️ Military tab (or the Market tab's patrol card) pick a trade route or any two places, choose troops from the base city and, if you like, a general as <b>Warden of the Roads</b>. Console: <b>patrol 1 40 pikemen</b>, <b>patrol from Oakford to Ashby all general Aldous</b>, <b>patrols</b>, <b>recall patrol 1</b>.</p><ul>
<li><b>Ambushes:</b> a patrol at full strength (its guard at least the strongest threat on the road) scares off up to ${Math.round(PT.deterMax * 100)}% of brigand, army and creature ambushes before they start; the rest meet the patrol first, and only a party that breaks it reaches the caravan. On a stretch longer than ${PT.reach} tiles only part of the patrol (at least ${Math.round(PT.joinMin * 100)}%) arrives in time.</li>
<li><b>Interceptions:</b> riders sent to take a caravan on a patrolled road fight the whole patrol first in a field battle; beaten, they turn home and the caravan travels on.</li>
<li><b>Safe roads:</b> caravans and supply carts on a watched road travel up to ${Math.round(PT.speed * 100)}% faster; supply lines take a patrolled road when it is at most ${Math.round((PT.supplyDetour - 1) * 100)}% longer. Patrols wear their road in and give sight along it.</li>
<li><b>Cost:</b> troops in the field eat ${Math.round((PT.fieldGrain - 1) * 100)}% more grain (from their base city) and draw ${PT.fieldGold} gold per head a minute; unpaid, they desert. They are not at home to defend their city. One patrol per realm, plus one every ${PT.perCities} cities (at most ${PT.maxPatrols}); a road of at most ${PT.maxLen} tiles.</li>
<li><b>Risk</b> per route: 🟢 <b>Safe</b> (nothing on the road), 🛡️ <b>Watched</b> (a patrol that holds), 🟠 <b>Risky</b>, 🔴 <b>Deadly</b> (hostile armies, or ambushes likely).</li>
<li><b>Wardens:</b> a general's traits matter: Warden scares off ${Math.round(PT.deterWarden * 100)}% more, Ambusher more in forest and hills, Swift reaches ${PT.reachSwift} tiles further and speeds caravans more, Forager feeds the patrol off the land; leadership and battle traits count in every fight.</li></ul>
<p><b>Protector of the Trade</b> is a realm title earned by keeping roads safe: caravans seen through, ambushes scared off or beaten, interceptions turned back, camps cleared near roads, dangerous roads watched. Scores fade by half every ${PT.half} game-minutes; the first realm to ${PT.claim} claims the title, and a rival with ${Math.round(PT.take * 100)}% of the holder's score takes it (at ${Math.round(PT.contest * 100)}% it is <i>contested</i>). The Protector gains +${PT.renown} renown, +${Math.round(PT.income * 100)}% income on its trade routes and steady favour with the merchant republics. Rival realms patrol their own trade and compete for it.</p>` });
    }
    if (typeof HELP_GLOSSARY !== 'undefined') {
      HELP_GLOSSARY.push(['Patrol', 'Troops stationed on a road: fewer and weaker ambushes, interceptions meet them first, faster caravans. Costs field upkeep.', 'patrols']);
      HELP_GLOSSARY.push(['Protector of the Trade', 'Realm title for keeping roads safe: renown, better route income, merchant favour. Rivals can take it.', 'patrols']);
      HELP_GLOSSARY.push(['Warden of the Roads', 'A general leading a patrol; his traits shape how it deters and fights.', 'patrols']);
    }
  };
  G.patrolUI = { install, card, ledgerCard };
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('DOMContentLoaded', install);
})();
