// =====================================================================
//  Clickable columns and field battles (engine: js/intercept.js).
//  - the map: wmPickColumn (hit-testing, called by worldmap.js on a tap)
//    and wmDrawColumns (side rings, the selected column's road, courses)
//  - the panel of a selected column (armyPanel, called by ui-world.js)
//  - the 🛡️ Intercept button in the incoming-attack warnings
//    (INCOMING_EXTRAS, read by ui-core.js) and Recall in Movements
//  - help
// =====================================================================
'use strict';
const INCOMING_EXTRAS = [];   // (move) — html after an incoming-attack row (ui-core renderRight / renderMoves)
let wmPickColumn = null, wmDrawColumns = null, armyPanel = null;
(() => {
  if (typeof MOVE_LABEL !== 'undefined') MOVE_LABEL.intercept = '🛡️ Interception';
  const TAU = Math.PI * 2;
  const SIDE_COL = { own: '#d4a531', ally: '#3f7fbf', hostile: '#c0281c', neutral: '#8c7b58' };
  const SIDE_NAME = { own: 'Yours', ally: 'Allied', hostile: 'Hostile', neutral: 'Neutral' };
  const TYPE_ICON = { raid: '💰', attack: '⚔️', conquer: '📯', settle: '🧺', reinforce: '🛡️', trade: '🐪', return: '↩️', scout: '🦅', adventure: '🦸', intercept: '🛡️', preach: '📿' };
  const idxOf = p => { const N = S.map; return Math.max(0, Math.min(N - 1, Math.round(p.y))) * N + Math.max(0, Math.min(N - 1, Math.round(p.x))); };
  const incSet = () => { try { return new Set(incoming()); } catch (e) { return new Set(); } };
  const shown = (m, p, vis, inc) => m.owner === 'p' || inc.has(m) || !!(vis && vis[idxOf(p)]);
  const findMove = id => S && S.moves.find(m => m.id === id);
  const compass = (dx, dy) => { if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return ''; const a = Math.atan2(-dy, dx); return ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; };
  const heading = m => { const tl = G.columnTimeline(m), nx = tl.find(v => v.t > S.time + 1) || tl[tl.length - 1], p = G.movePos(S, m); return compass(nx.x - p.x, nx.y - p.y); };
  const nameOf = o => S.empires[o] ? S.empires[o].name : 'Brigands';
  const colOf = o => S.empires[o] ? S.empires[o].color : '#5a4a3a';
  let lastPlan = null;   // the course the open panel proposes: { id, fx, fy, x, y } (drawn on the map)

  // ---- map: hit-testing ----
  // world point (tile units), radius in tiles, the player's visible set → a move id or null
  wmPickColumn = (wx, wy, r, vis) => {
    if (!S || !S.moves.length) return null;
    const inc = incSet();
    let best = null, bd = r;
    for (const m of S.moves) {
      const p = G.movePos(S, m);
      if (!shown(m, p, vis, inc)) continue;
      const d = Math.hypot(wx - (p.x + 0.5), wy - (p.y + 0.38));   // banners stand a little above the ground point
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return null;
    // a city, camp, free city, oasis or ruin under the pointer wins when the pointer is nearer its centre
    const tx = Math.floor(wx), ty = Math.floor(wy), t = G.tileAt(S, tx, ty);
    if (t && (t.city || t.camp || t.minor || t.oasis || t.ruin) && Math.hypot(wx - (tx + 0.5), wy - (ty + 0.5)) < bd) return null;
    return best.id;
  };

  // ---- map: drawing (called every frame by worldmap.js, before the banners) ----
  const swords = (c, x, y, s) => {
    c.save(); c.translate(x, y); c.lineCap = 'round';
    for (const [w, col] of [[s * 0.34, 'rgba(244,234,210,.9)'], [s * 0.16, '#3b1d12']]) {
      c.strokeStyle = col; c.lineWidth = w;
      for (const a of [-1, 1]) {
        c.save(); c.rotate(a * Math.PI / 4);
        c.beginPath(); c.moveTo(0, -s); c.lineTo(0, s * 0.62); c.moveTo(-s * 0.32, s * 0.38); c.lineTo(s * 0.32, s * 0.38); c.stroke();
        c.restore();
      }
    }
    c.restore();
  };
  const dashed = (c, pts, col, w, off) => {
    if (pts.length < 2) return;
    c.save(); c.strokeStyle = 'rgba(244,234,210,.75)'; c.lineWidth = w + 2.5; c.setLineDash([w * 3, w * 2.4]); c.lineDashOffset = off;
    c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    c.strokeStyle = col; c.lineWidth = w; c.stroke(); c.restore();
  };
  wmDrawColumns = (c, t, tp, SX, SY, vis, inc, ak) => {
    if (!S || !S.moves.length && !lastPlan) return;
    const W = c.canvas.width, H = c.canvas.height;   // device pixels: generous culling bound
    const selId = UI.sel && UI.sel.move;
    for (const m of S.moves) {
      const p = G.movePos(S, m);
      if (!shown(m, p, vis, inc)) continue;
      const ax = SX(p.x + 0.5), ay = SY(p.y + 0.5);
      const side = G.columnSide(S, 'p', m), col = SIDE_COL[side];
      // the selected column: its remaining road (all of it for our own and known goals, a few steps otherwise)
      if (m.id === selId) {
        const known = m.owner === 'p' || inc.has(m) || G.columnIntel(S, 'p', m).dest;
        const rest = G.columnTimeline(m).filter(v => v.t > S.time);
        const pts = [[ax, ay], ...(known ? rest : rest.slice(0, 3)).map(v => [SX(v.x + 0.5), SY(v.y + 0.5)])];
        c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
        c.strokeStyle = 'rgba(244,234,210,.8)'; c.lineWidth = Math.max(4, tp * 0.11);
        c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
        c.strokeStyle = col; c.lineWidth = Math.max(2, tp * 0.06); c.globalAlpha = 0.9; c.stroke();
        if (known && pts.length > 1) { const [ex, ey] = pts[pts.length - 1]; c.globalAlpha = 1; c.fillStyle = col; c.beginPath(); c.arc(ex, ey, Math.max(3, tp * 0.08), 0, TAU); c.fill(); }
        c.restore();
        const pu = 0.5 + 0.5 * Math.sin(t * 4);
        c.save(); c.strokeStyle = col; c.lineWidth = 2 + pu * 1.5; c.globalAlpha = 0.6 + 0.4 * pu;
        c.beginPath(); c.ellipse(ax, ay - 10 * ak, 34 * ak + pu * 4, 30 * ak + pu * 4, 0, 0, TAU); c.stroke(); c.restore();
      }
      // our interceptions: a dashed course to the meeting point, crossed swords there
      if (m.type === 'intercept' && m.owner === 'p') {
        const mx = SX(m.x + 0.5), my = SY(m.y + 0.5);
        dashed(c, [[ax, ay], [mx, my]], '#7a1f12', Math.max(1.6, tp * 0.035), -t * 14);
        swords(c, mx, my, Math.max(7, tp * 0.2));
      }
      if (ax < -60 || ay < -60 || ax > W + 60 || ay > H + 60) continue;
      // the side ring at the column's feet: own, allied, hostile or neutral
      c.save(); c.strokeStyle = col; c.globalAlpha = 0.9; c.lineWidth = Math.max(1.6, 3 * ak);
      c.beginPath(); c.ellipse(ax, ay + 4 * ak, 22 * ak, 8 * ak, 0, 0, TAU); c.stroke();
      c.globalAlpha = 0.18; c.fillStyle = col; c.fill(); c.restore();
    }
    // the course the open panel proposes
    const lp = lastPlan && selId === lastPlan.id && UI.tab === 'world' ? lastPlan : null;
    if (lp) {
      const mx = SX(lp.x + 0.5), my = SY(lp.y + 0.5);
      dashed(c, [[SX(lp.fx + 0.5), SY(lp.fy + 0.5)], [mx, my]], lp.ok ? '#7a1f12' : 'rgba(120,100,80,.8)', Math.max(1.6, tp * 0.035), -t * 14);
      if (lp.ok) swords(c, mx, my, Math.max(8, tp * 0.24));
    }
  };

  // ---- the panel of a selected column ----
  const NONFIELD = ['settlers', 'herald'];
  const fieldList = (city, m) => Object.entries(city.units || {}).filter(([u, n]) => n > 0 && DATA.units[u] && !NONFIELD.includes(u) && (m.naval ? DATA.units[u].type === 'ship' || DATA.units[u].flying : DATA.units[u].type !== 'ship'));
  const defaultUnits = (city, m) => Object.fromEntries(fieldList(city, m).filter(([u]) => u !== 'hero' && u !== 'scout'));
  const gather = (city, m) => {
    const out = {};
    for (const [u, n] of fieldList(city, m)) { const v = parseInt(UI.form['ic_' + u], 10); if (v > 0) out[u] = Math.min(v, n); }
    return out;
  };
  const ordersOf = city => {
    if (!DATA.stances) return null;
    const stance = DATA.stances[UI.form.stance] ? UI.form.stance : 'balanced';
    const general = UI.form.sendGeneral && G.generalsAt && G.generalsAt(S, 'p', city.id).some(g => g.id === UI.form.sendGeneral) ? UI.form.sendGeneral : null;
    return { stance, general };
  };
  const fromCity = city => { const c = S.cities[UI.form.icFrom]; return c && c.owner === 'p' ? c : city; };
  const sizeHtml = (m, intel) => {
    if (intel.exact) return `${G.unitsCount(m.units) ? unitTokens(m.units, m.owner, null, 26) : '<span class="muted">no escort</span>'}`;
    if (!intel.count) return '<span class="muted">no escort that we can see</span>';
    return `<b>${esc(intel.word[0].toUpperCase() + intel.word.slice(1))}, ~${intel.approx}</b> <span class="muted">(${intel.lo}–${intel.hi})</span>`;
  };
  const levelNote = intel => ({ close: 'Watched closely (near our cities or columns, or spied out at home): the estimate is good.', seen: 'Seen from afar: a rough count. Scouts, spies on their home city or our own columns nearby narrow it.', reported: 'Reported by our watchmen as it marches on us.' }[intel.level] || '');
  const factRow = (k, v) => `<tr><td class="muted" style="white-space:nowrap;padding-right:8px">${k}</td><td>${v}</td></tr>`;

  const previewHtml = pv => {
    if (!pv) return '';
    const lostN = G.unitsCount(pv.attLost), sentN = G.unitsCount(pv.attLost) + G.unitsCount(pv.attLeft);
    const verdict = pv.win ? (pv.attLoss < 0.15 ? 'Easy victory' : pv.attLoss < 0.45 ? 'Victory' : 'Costly victory') : 'Beaten off';
    const tc = pv.tactics, sg = p => (p > 0 ? '+' : '−') + Math.abs(p) + '%';
    const mods = tc ? tc.mods.filter(x => x.kind === 'field' || x.kind === 'counter' || x.kind === 'stance' || x.kind === 'general').map(x => `<span class="${(x.side === 'att') === (x.pct > 0) ? 'good' : 'bad'}">${x.side === 'def' ? 'their ' : ''}${esc(x.label)} ${sg(x.pct)}</span>`) : [];
    return `<div class="preview ${pv.win ? 'win' : 'loss'}"><b>${verdict}</b> expected · ⚔️ ${fmt(pv.A)} vs 🛡️ ${fmt(pv.D)}<br>
      You lose about ${lostN} of ${sentN} (${Math.round(pv.attLoss * 100)}%)${lostN ? ': ' + unitsHtml(pv.attLost) : ''}. They lose ${Math.round(pv.defLoss * 100)}%${pv.win ? ' and the rest rout' : ''}.
      ${tc ? `<br>⛰️ ${tc.terrain ? esc(DATA.terrain[tc.terrain].name) : 'Open field'}${tc.crossing ? ' · 🌊 river crossing' : ''} · no walls${mods.length ? ' · ' + mods.join(' · ') : ''}` : ''}
      ${pv.estimated ? '<br><span class="muted">Their strength is an estimate.</span>' : ''}</div>`;
  };

  const interceptForm = (city, m) => {
    const err = G.canIntercept(S, 'p', m);
    if (err) return `<p class="muted" style="font-size:12.5px">🛡️ No interception: ${esc(err)}.</p>`;
    const own = G.citiesOf(S, 'p');
    const p = G.movePos(S, m);
    const from = fromCity(city);
    const st = S.empires[m.owner] && G.rel ? G.rel(S, m.owner).status : 'war';
    const warn = S.empires[m.owner] && st !== 'war' ? `<p class="warn" style="font-size:12.5px">⚠️ You are not at war with the ${esc(nameOf(m.owner))}: falling on their column is an act of war${st === 'peace' ? ' and breaks your treaties' : ''}.</p>` : '';
    // where from: the nearest cities, each with whether its field army could make it
    const cands = own.slice().sort((a, b) => G.dist(a, p) - G.dist(b, p)).slice(0, 5);
    if (!cands.includes(from)) cands.push(from);
    const cityBtns = cands.map(c => {
      const du = defaultUnits(c, m);
      const pl = G.unitsCount(du) ? G.interceptPlan(S, 'p', c, m, du, null) : { ok: false, reason: 'No field troops' };
      return `<button class="small ${c === from ? 'primary' : ''}" data-act="icFrom" data-c="${esc(c.id)}" title="${esc(pl.ok ? `With all its field troops: meets them at ${pl.name} in ${fmtTime(realSecs(pl.at - S.time))}` : pl.reason)}">${esc(c.name)} <span class="${pl.ok ? 'good' : 'muted'}">${pl.ok ? '✓' : '✗'}</span></button>`;
    }).join('');
    const list = fieldList(from, m);
    const table = list.length ? `<table>${list.map(([u, n]) => { const d = G.unitStats(S, 'p', u); const k = 'ic_' + u; return `<tr><td class="pt-cell">${ptHtml(unitSpec(u, 'p'), 28, '', d.name) || d.icon} ${d.name}</td><td class="muted">${n}</td><td><input type="number" min="0" max="${n}" data-k="${k}" value="${esc(UI.form[k] || '')}" style="width:70px"></td><td><button class="small" data-act="icAll" data-u="${u}" data-n="${n}">all</button></td></tr>`; }).join('')}</table>
      <div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap"><button class="small" data-act="icFill" data-f="1">All field troops</button><button class="small" data-act="icFill" data-f="0.5">Half</button><button class="small" data-act="icFill" data-f="0">Clear</button></div>`
      : `<p class="muted">No troops in ${esc(from.name)} that can ${m.naval ? 'put to sea against a fleet (war galleys or fliers)' : 'fight in the field'}.</p>`;
    const sending = gather(from, m);
    const orders = ordersOf(from);
    const probe = G.unitsCount(sending) ? sending : defaultUnits(from, m);
    const plan = G.unitsCount(probe) ? G.interceptPlan(S, 'p', from, m, probe, orders) : null;
    lastPlan = plan ? { id: m.id, fx: from.x, fy: from.y, x: plan.ok ? plan.x : Math.round(p.x), y: plan.ok ? plan.y : Math.round(p.y), ok: plan.ok } : null;
    const terr = plan && plan.ok ? DATA.terrain[plan.terrain] : null;
    const planHtml = !plan ? '' : plan.ok
      ? `<div class="calam good">⚔️ Meet them at <b>${esc(plan.name)}</b> (${plan.x}, ${plan.y}) · ${terr ? esc(terr.name) : ''}${plan.river ? ' · 🌊 at the ford' : ''}${plan.naval ? ' · ⛵ at sea' : ''}<br>
          <span style="font-size:12.5px">Battle in ${fmtTime(realSecs(plan.at - S.time))}: your march takes ${fmtTime(realSecs(plan.dur))}${plan.wait > 5 ? `, then ${fmtTime(realSecs(plan.wait))} waiting for them` : ''}. They would reach ${esc(m.type === 'return' ? 'home' : placeName(m.x, m.y))} in ${fmtTime(realSecs(m.arrive - S.time))}.</span></div>`
      : `<div class="calam bad">⏳ ${esc(plan.reason)}${plan.late ? ` (about ${fmtTime(realSecs(plan.late))} too late)` : ''}. <span style="font-size:12.5px">Faster troops (cavalry, fliers), a nearer city or the Swift general help.</span></div>`;
    const pv = plan && plan.ok && G.unitsCount(sending) ? G.previewIntercept(S, from, m, sending, orders, G.interceptPlan(S, 'p', from, m, sending, orders)) : null;
    const ordersHtml = orders && typeof ordersForm === 'function' ? (() => { const pm = UI.mode; if (!['raid', 'attack'].includes(UI.mode)) UI.mode = 'attack'; try { return ordersForm(from, orders); } finally { UI.mode = pm; } })() : '';
    return `<h4 style="margin:10px 0 4px">🛡️ Intercept</h4>${warn}
      <p class="muted" style="font-size:12.5px;margin-top:0">Meet them on the road, before they arrive: a field battle with no walls, on the ground where you meet. Choose where to send troops from:</p>
      <div class="row" style="gap:4px;flex-wrap:wrap;margin-bottom:6px">${cityBtns}</div>
      ${table}${ordersHtml}${planHtml}${pv ? previewHtml(pv) : ''}
      <div class="row" style="margin-top:8px"><button class="primary" data-act="icSend" data-id="${esc(m.id)}" ${plan && plan.ok && G.unitsCount(sending) ? '' : 'disabled'}>🛡️ Intercept from ${esc(from.name)}</button></div>`;
  };

  armyPanel = city => {
    if (!S || !UI.sel || !UI.sel.move) return '';
    const m = findMove(UI.sel.move);
    lastPlan = null;
    if (!m) return '';
    const vis = G.visibleSet(S), inc = incSet();
    const intel = G.columnIntel(S, 'p', m, vis);
    if (!intel.known && !inc.has(m)) return '';
    const mine = m.owner === 'p', emp = S.empires[m.owner];
    const side = intel.side, p = G.movePos(S, m);
    const chip = `<span class="pill" style="border-color:${colOf(m.owner)}"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colOf(m.owner)};margin-right:4px"></i>${esc(mine ? 'Your realm' : nameOf(m.owner))}</span> <span class="pill" style="border-color:${SIDE_COL[side]};color:${SIDE_COL[side]}">${SIDE_NAME[side]}</span>`;
    const pic = !mine && emp && typeof rulerSpec === 'function' ? ptHtml(rulerSpec(emp), 56, 'pt-card', `Ruler of ${emp.name}`) : '';
    const title = `${TYPE_ICON[m.type] || '🚩'} ${mine ? 'Your' : /^[aeiou]/i.test(intel.mission) ? 'An' : 'A'} ${esc(intel.mission)}${m.naval ? ' (by sea)' : ''}`;
    const head0 = `<h3>${title}</h3><div style="font-size:12.5px">${chip}</div><div class="muted" style="font-size:12.5px">Now near (${Math.round(p.x)}, ${Math.round(p.y)}) · ${G.dist(city, p).toFixed(1)} tiles from ${esc(city.name)}</div>`;
    const dest = m.type === 'return' ? esc((S.cities[m.from] || {}).name || 'home') : placeName(m.x, m.y) + ` (${m.x}, ${m.y})`;
    const hd = heading(m);
    const rows = [
      factRow('Bound for', intel.dest ? dest : `unknown${hd ? ', heading ' + hd : ''}`),
      factRow('Strength', sizeHtml(m, intel) + (intel.exact ? '' : `<div class="muted" style="font-size:12px">${levelNote(intel)}</div>`)),
    ];
    if (mine || intel.level === 'close') {
      const g = m.general && G.generalById ? G.generalById(S, m.owner, m.general) : null;
      rows.push(factRow('General', g ? `🎖️ ${esc(g.name)} · level ${g.level}` : '<span class="muted">none</span>'));
      if (m.stance && DATA.stances && DATA.stances[m.stance]) rows.push(factRow('Stance', `${DATA.stances[m.stance].icon} ${esc(DATA.stances[m.stance].name)}`));
      if (Object.keys(m.cargo || {}).length) rows.push(factRow('Cargo', goodsHtml(m.cargo)));
    } else rows.push(factRow('General', '<span class="muted">unknown</span>'));
    rows.push(factRow(m.type === 'intercept' ? 'Battle in' : 'Arrives in', `${fmtTime(realSecs(m.arrive - S.time))}${m.delayed ? ` <span class="muted">(held up ${fmtTime(realSecs(m.delayed))} by a field battle)</span>` : ''}`));
    if (m.type === 'intercept') {
      const T = findMove(m.target);
      rows.push(factRow('Against', T ? `${esc(nameOf(T.owner))} ${esc(G.missionName(T.type))}${m.retargeted ? ' <span class="muted">(followed a change of course)</span>' : ''}` : '<span class="muted">the column is gone</span>'));
      rows.push(factRow('Where', `${esc(G.fieldName(S, m.x, m.y))} (${m.x}, ${m.y})`));
    }
    let actions = '';
    if (mine) {
      const can = m.type !== 'return' && !m.route && !m.supply;
      actions = can ? `<div class="row" style="margin-top:8px"><button data-act="icRecall" data-id="${esc(m.id)}">↩️ Recall</button><span class="muted" style="font-size:12px">They turn back along the road they came; the way home takes as long as they have marched.</span></div>` : '';
    }
    const body = `<table style="font-size:13px;margin-top:6px">${rows.join('')}</table>${actions}${mine ? '' : interceptForm(city, m)}`;
    return `${pic ? `<div class="pt-panelhead">${pic}<div>${head0}</div></div>` : head0}${body}`;
  };

  // ---- actions ----
  const clearForm = () => { for (const k of Object.keys(UI.form)) if (k.startsWith('ic_')) delete UI.form[k]; };
  const fill = (city, m, f) => { clearForm(); if (f > 0) for (const [u, n] of Object.entries(defaultUnits(city, m))) { const k = Math.floor(n * f); if (k > 0) UI.form['ic_' + u] = k; } };
  Object.assign(act, {
    icFrom: d => { UI.form.icFrom = d.c; clearForm(); delete UI.form.sendGeneral; render(true); },
    icAll: d => { UI.form['ic_' + d.u] = d.n; render(true); },
    icFill: d => { const m = UI.sel && findMove(UI.sel.move); if (m) fill(fromCity(curCity()), m, +d.f); render(true); },
    icSend: d => {
      const m = findMove(d.id), from = fromCity(curCity());
      if (!m) { toast('That column is no longer on the road'); render(true); return; }
      const err = G.sendIntercept(S, from.id, m.id, gather(from, m), ordersOf(from));
      if (!err) {
        clearForm(); delete UI.form.sendGeneral;
        const I = S.moves[S.moves.length - 1];
        if (I && I.type === 'intercept') UI.sel = { x: UI.sel.x, y: UI.sel.y, move: I.id };
      }
      toast(err || '🛡️ Riders go out to meet them'); render(true);
    },
    icRecall: d => { const err = G.recallMove(S, d.id); toast(err || '↩️ The column turns back'); if (!err && UI.sel && UI.sel.move === d.id) { const r = S.moves.find(x => x.via === d.id); UI.sel = r ? { ...UI.sel, move: r.id } : { x: UI.sel.x, y: UI.sel.y }; } render(true); },
    icShow: d => { const m = findMove(d.id); if (!m) return; const p = G.movePos(S, m); UI.tab = 'world'; UI.sel = { x: Math.round(p.x), y: Math.round(p.y), move: m.id }; render(true); },
    // from the incoming-attack warning: select the column, pick the best city and fill in its field army
    icGo: d => {
      const m = findMove(d.id);
      if (!m) return;
      const p = G.movePos(S, m);
      const t = G.tileAt(S, m.x, m.y), target = t && t.city && S.cities[t.city];
      const own = G.citiesOf(S, 'p').sort((a, b) => (b === target) - (a === target) || G.dist(a, p) - G.dist(b, p));
      const best = own.find(c => { const du = defaultUnits(c, m); return G.unitsCount(du) && G.interceptPlan(S, 'p', c, m, du, null).ok; }) || target || own[0];
      UI.tab = 'world'; UI.sel = { x: Math.round(p.x), y: Math.round(p.y), move: m.id };
      if (best) { UI.form.icFrom = best.id; fill(best, m, 1); }
      render(true);
    },
  });

  // ---- hooks into the rest of the interface ----
  INCOMING_EXTRAS.push(m => G.canIntercept(S, 'p', m) ? '' : ` <button class="small" data-act="icGo" data-id="${esc(m.id)}" title="Meet them in the field before they reach the walls">🛡️ Intercept</button>`);
  if (typeof MOVE_EXTRAS !== 'undefined') MOVE_EXTRAS.push(m => {
    const T = m.type === 'intercept' ? findMove(m.target) : null;
    const vs = m.type === 'intercept' ? ` <span class="muted">vs ${T ? esc(nameOf(T.owner)) : 'a vanished column'} at ${esc(G.fieldName(S, m.x, m.y))}</span>` : '';
    const can = m.type !== 'return' && !m.route && !m.supply;
    return `${vs} <button class="small" data-act="icShow" data-id="${esc(m.id)}" title="Show on the map">🗺️</button>${can ? ` <button class="small" data-act="icRecall" data-id="${esc(m.id)}" title="Turn back home">↩️</button>` : ''}`;
  });
  if (typeof REPORT_EXTRAS !== 'undefined') REPORT_EXTRAS.push(b => b && b.field ? `<p style="font-size:12.5px;margin:6px 0 0">⚔️ <b>Field battle</b> at ${esc(b.field.name)} (${b.field.x}, ${b.field.y}): no walls, the ground decided. The ${esc(b.def)} column was on ${esc(/^[aeiou]/.test(G.missionName(b.field.mission)) ? 'an ' : 'a ')}${esc(G.missionName(b.field.mission))} toward ${esc(b.field.dest)}.</p>` : '');

  // ---- help ----
  if (typeof HELP_SECTIONS !== 'undefined' && !HELP_SECTIONS.some(h => h.id === 'intercept')) {
    const i = HELP_SECTIONS.findIndex(h => h.id === 'stances');
    HELP_SECTIONS.splice(i >= 0 ? i + 1 : HELP_SECTIONS.length, 0, { id: 'intercept', icon: '🛡️', title: 'Field battles & interception', tabs: [],
      words: 'intercept interception field battle column march army click tap recall ambush caravan meeting point ford open field rout delay',
      html: '<p>Every column on the march is on the map: click or tap it (where you can see it) to see whose it is, what it is doing, how strong it looks and when it arrives. A ring at its feet shows the side: <b style="color:#d4a531">gold</b> yours, <b style="color:#c0281c">red</b> hostile, <b style="color:#3f7fbf">blue</b> allied, <b style="color:#8c7b58">brown</b> neutral.</p><ul><li><b>What you know.</b> Your own columns exactly. Foreign ones as a rough band (“a large host, ~120”); the band narrows when they pass near your cities or columns, or when scouts or spies have recently looked at their home city. Their goal and general are known only up close, or when they march on you.</li><li><b>Recall</b> turns your own column back along its road; the way home takes as long as it has marched.</li><li><b>Intercept</b>: pick a city and troops. They march to the <b>earliest point on the enemy\'s road they can reach before the enemy does</b> and wait there. Too slow, and you are told (“too slow — they reach Oakford first”). Cavalry, fliers and a Swift general reach farther.</li><li><b>The battle</b> is fought in the open: no walls, the terrain and river of the meeting place, stances, generals, heroes and battle mages count as in any battle. The loser routs home with its survivors; a beaten caravan is lost and its cargo taken. A column that wins marches on, delayed a little, and its mission goes ahead.</li><li>If the column changes course or turns home before you meet, your troops follow once; then they give up.</li><li>Ships can intercept fleets at sea; land troops meet columns on land only.</li><li>Only realms you may attack: never your own columns, allies or pact partners. Falling on a column of a realm at peace is an act of war.</li><li>The <b>⚠️ Incoming attacks</b> warning has a <b>🛡️ Intercept</b> button that fills in a defence. Rivals do the same: a strong idle army will ride out to meet your attacks, and enemies at war prey on rich caravans.</li></ul>' });
  }
  if (typeof HELP_GLOSSARY !== 'undefined') {
    HELP_GLOSSARY.push(['Interception', 'Sending troops to meet a marching column on the road: a field battle with no walls, before it reaches its goal.', 'intercept']);
    HELP_GLOSSARY.push(['Field battle', 'A battle in the open between two columns: terrain counts, walls do not; the loser routs home.', 'intercept']);
  }
})();
