// =====================================================================
//  📖 Chronicle tab: history charts (canvas, re-attached through
//  MOUNT_HOOKS so the once-a-second rebuild never flickers), the
//  narrative timeline and feats; the end-of-game summary (ENDGAME_EXTRAS),
//  a feats card on the Empire tab and on the start screen.
// =====================================================================
'use strict';

(() => {
  const CH = () => G.chronicle(S);
  UI.chr = UI.chr || { metric: 'r', filter: 'all', more: false, hidden: {} };

  // ---- styles (scoped to .chr-) --------------------------------------
  const css = `
  .chr-metrics{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px}
  .chr-metrics button{padding:3px 8px;font-size:12.5px}
  .chr-metrics button.on{background:var(--accent);border-color:var(--accent);color:#fff}
  .chr-slot{position:relative;width:100%;height:230px;touch-action:pan-y}
  .chr-slot canvas{display:block;width:100%;height:100%}
  .chr-legend{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;font-size:12.5px}
  .chr-legend button{border:0;background:none;padding:2px 0;display:inline-flex;align-items:center;gap:5px;color:var(--ink)}
  .chr-legend button.off{opacity:.4;text-decoration:line-through}
  .chr-legend i{display:inline-block;width:14px;height:4px;border-radius:2px}
  .chr-read{font-size:12px;min-height:16px;margin-top:4px}
  .chr-tl{list-style:none;margin:0;padding:0}
  .chr-tl li{display:flex;gap:8px;padding:5px 0;border-bottom:1px dashed var(--line);font-family:var(--font);font-size:14px;line-height:1.35}
  .chr-tl li .ic{flex:0 0 22px;text-align:center}
  .chr-tl li time{flex:0 0 auto;color:var(--muted);font-family:var(--ui);font-size:11.5px;padding-top:2px;min-width:74px}
  .chr-tl li.mine{font-weight:600}
  .chr-year{font-family:var(--font);color:var(--accent);margin:10px 0 2px;font-size:13px;letter-spacing:.05em}
  .chr-feats{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}
  .chr-feat{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--panel2);font-size:12.5px}
  .chr-feat .fi{font-size:20px;line-height:1}
  .chr-feat.locked{opacity:.5;filter:grayscale(1)}
  .chr-feat.now{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
  .chr-feat b{display:block;font-size:13px}
  .chr-stand td,.chr-stand th{padding:3px 6px;font-size:12.5px;text-align:right}
  .chr-stand td:first-child,.chr-stand th:first-child{text-align:left}
  .chr-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin:8px 0}
  .chr-stats div{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12px}
  .chr-stats b{display:block;font-size:17px;font-family:var(--font)}
  .chr-icons{font-size:20px;letter-spacing:2px}
  .chr-filter{display:flex;gap:4px;flex-wrap:wrap}
  .chr-filter button{padding:2px 8px;font-size:12px}
  .chr-filter button.on{border-color:var(--accent);color:var(--accent)}
  @media (max-width:700px){.chr-slot{height:190px}.chr-tl li time{min-width:56px}.chr-feats{grid-template-columns:1fr 1fr}}
  `;
  if (typeof document !== 'undefined' && !document.getElementById('chr-style')) {
    const st = document.createElement('style'); st.id = 'chr-style'; st.textContent = css; document.head.appendChild(st);
  }

  const ICON = { dawn: '🌅', meet: '🤝', found: '🏘️', conq: '⚔️', freecity: '🏳️', revolt: '🔥', war: '⚔️', peace: '🕊️', ally: '🤝', fall: '💀', rise: '👑', wonder: '🏛️', cal: '🌋', calend: '🌤️', faith: '⛪', spell: '🔮', work: '🌌', slay: '🗡️', herofall: '☠️', wyrm: '🐉', feat: '🏅', victory: '👑', defeat: '🥀' };
  const when = t => `${G.chronSeason(S, t)}, ${clock(t).replace(/^Day /, 'D')}`;
  const fmtH = t => { const h = t / 3600; return h >= 10 ? Math.round(h) + 'h' : h >= 1 ? h.toFixed(1).replace(/\.0$/, '') + 'h' : Math.round(t / 60) + 'm'; };

  // ---- charts ---------------------------------------------------------
  const charts = {};   // slotId -> { cv, key, hover }
  const cssVar = (name, fb) => { try { return getComputedStyle(document.body).getPropertyValue(name).trim() || fb; } catch (e) { return fb; } };
  const seriesFor = metric => {
    const sr = G.chronSeries(S, metric);
    sr.lines = sr.lines.filter(l => !UI.chr.hidden[l.id]);
    return sr;
  };
  const draw = (slotId, metric) => {
    const c = charts[slotId]; if (!c) return;
    const cv = c.cv, host = cv.parentNode; if (!host) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(200, host.clientWidth), H = Math.max(120, host.clientHeight);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const sr = seriesFor(metric), T = sr.t;
    const ink = cssVar('--ink', '#2b2118'), muted = cssVar('--muted', '#7a6a55'), line = cssVar('--line', '#d8c9a8');
    const L = 44, R = 10, Tp = 10, B = 22;
    g.font = '11px ' + (cssVar('--ui', 'sans-serif') || 'sans-serif');
    if (T.length < 2) {
      g.fillStyle = muted; g.textAlign = 'center'; g.fillText('The chroniclers are still gathering their first records…', W / 2, H / 2);
      return;
    }
    let max = 0;
    for (const l of sr.lines) for (const v of l.vals) if (v > max) max = v;
    max = max <= 0 ? 1 : max;
    // a round ceiling: 4 grid steps of 1, 2, 2.5 or 5 × 10^k
    const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    let step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= raw);
    if (metric === 'c' || metric === 'w') step = Math.max(1, Math.ceil(step));
    const top = step * 4;
    const t0 = T[0], t1 = T[T.length - 1] || 1;
    const X = t => L + (W - L - R) * (t1 > t0 ? (t - t0) / (t1 - t0) : 0);
    const Y = v => Tp + (H - Tp - B) * (1 - v / top);
    // grid
    g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = top * i / 4, y = Math.round(Y(v)) + 0.5;
      g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
      g.fillText(fmt(v), L - 5, y);
    }
    g.textAlign = 'center'; g.textBaseline = 'top';
    const ticks = Math.max(2, Math.min(6, Math.floor((W - L) / 70)));
    for (let i = 0; i <= ticks; i++) { const t = t0 + (t1 - t0) * i / ticks; g.fillText(fmtH(t), X(t), H - B + 5); }
    // lines (the player's on top, thicker)
    const order = sr.lines.slice().sort((a, b) => (a.id === 'p') - (b.id === 'p'));
    for (const l of order) {
      g.strokeStyle = l.color; g.lineWidth = l.id === 'p' ? 2.6 : 1.6; g.lineJoin = 'round';
      g.beginPath(); let pen = false;
      for (let i = 0; i < T.length; i++) {
        const v = l.vals[i];
        if (v === null || v === undefined) { pen = false; continue; }
        const x = X(T[i]), y = Y(v);
        if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
      }
      g.stroke();
    }
    // hover marker
    if (c.hover !== null && c.hover !== undefined && T[c.hover] !== undefined) {
      const x = Math.round(X(T[c.hover])) + 0.5;
      g.strokeStyle = ink; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(x, Tp); g.lineTo(x, H - B); g.stroke(); g.globalAlpha = 1;
      for (const l of order) { const v = l.vals[c.hover]; if (v === null || v === undefined) continue; g.fillStyle = l.color; g.beginPath(); g.arc(x, Y(v), 3.2, 0, Math.PI * 2); g.fill(); }
    }
    c.geom = { X, t0, t1, L, R, W };
  };
  const readout = (slotId, metric) => {
    const c = charts[slotId], el = document.getElementById(slotId + '-read');
    if (!el || !c) return;
    const sr = seriesFor(metric);
    if (c.hover === null || c.hover === undefined || sr.t[c.hover] === undefined) { el.innerHTML = `<span class="muted">${matchMedia('(hover: none)').matches ? 'Tap' : 'Hover'} the chart to read the records of a moment.</span>`; return; }
    const i = c.hover;
    el.innerHTML = `<b>${fmtH(sr.t[i])}</b> · ` + sr.lines.filter(l => l.vals[i] !== null && l.vals[i] !== undefined).sort((a, b) => b.vals[i] - a.vals[i])
      .map(l => `<span style="color:${l.color}">●</span> ${esc(l.id === 'p' ? 'You' : l.name.replace(/^(Kingdom|Duchy|Circle|Hold|Horde|Court|Fleet|Barrow|Eyrie) of (the )?/, ''))} ${fmt(l.vals[i])}`).join(' · ');
  };
  const mountChart = (slotId, metric) => {
    const host = document.getElementById(slotId);
    if (!host) return;
    let c = charts[slotId];
    if (!c) {
      const cv = document.createElement('canvas');
      c = charts[slotId] = { cv, key: '', hover: null, metric };
      const pick = ev => {
        if (!c.geom) return;
        const r = cv.getBoundingClientRect(), x = ev.clientX - r.left;
        const T = G.chronSeries(S, c.metric).t;
        let best = 0, bd = 1e9;
        for (let i = 0; i < T.length; i++) { const d = Math.abs(c.geom.X(T[i]) - x); if (d < bd) { bd = d; best = i; } }
        if (c.hover !== best) { c.hover = best; draw(slotId, c.metric); readout(slotId, c.metric); }
      };
      cv.addEventListener('pointermove', pick);
      cv.addEventListener('pointerdown', pick);
      cv.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') { c.hover = null; draw(slotId, c.metric); readout(slotId, c.metric); } });
    }
    c.metric = metric;
    if (c.cv.parentNode !== host) host.appendChild(c.cv);
    const ch = CH();
    const key = [metric, ch.h.t.length, ch.h.t[ch.h.t.length - 1], host.clientWidth, host.clientHeight, Object.keys(UI.chr.hidden).filter(k => UI.chr.hidden[k]).join(), Object.keys(ch.met).length, document.documentElement.dataset.theme || ''].join('|');
    if (key !== c.key) { c.key = key; draw(slotId, metric); }
    readout(slotId, metric);
  };
  MOUNT_HOOKS.push(() => {
    if (!S) return;
    mountChart('chr-slot-tab', UI.chr.metric);
    mountChart('chr-slot-end', UI.chr.endMetric || 'r');
    if (G.featJustEarned.length) {
      const f = G.featById(G.featJustEarned[G.featJustEarned.length - 1]);
      G.featJustEarned.length = 0;
      if (f) toast(`🏅 Feat earned: ${f.icon} ${f.name}`);
    }
  });
  if (typeof matchMedia === 'function') {
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { for (const c of Object.values(charts)) c.key = ''; }); } catch (e) { }
  }

  const metricButtons = (cur, actName) => `<div class="chr-metrics">${G.CHRON.metricOrder.map(k => {
    const m = G.CHRON.metrics[k];
    if (k === 'm' && !G.manaOf) return '';
    if (k === 'f' && !S.faiths) return '';
    return `<button class="${cur === k ? 'on' : ''}" data-act="${actName}" data-m="${k}">${m.icon} ${m.name}</button>`;
  }).join('')}</div>`;
  const legend = () => {
    const sr = G.chronSeries(S, 'r');
    return `<div class="chr-legend">${sr.lines.map(l => `<button class="${UI.chr.hidden[l.id] ? 'off' : ''}" data-act="chrToggle" data-id="${l.id}" title="Show or hide"><i style="background:${l.color}"></i>${esc(l.id === 'p' ? S.empires.p.name + ' (you)' : l.name)}${S.empires[l.id] && S.empires[l.id].dead ? ' ✝' : ''}</button>`).join('')}</div>`;
  };
  const chartCard = () => {
    const known = G.chronKnown(S).length, total = Object.keys(S.empires).length;
    return `<div class="card"><h3>📈 The rise and fall of realms</h3>
      ${metricButtons(UI.chr.metric, 'chrMetric')}
      <div class="chr-slot" id="chr-slot-tab"></div>
      <div class="chr-read" id="chr-slot-tab-read"></div>
      ${legend()}
      ${known < total ? `<p class="muted" style="font-size:12px;margin:6px 0 0">${total - known} realm${total - known > 1 ? 's' : ''} not yet met: the chroniclers know nothing of ${total - known > 1 ? 'them' : 'it'}. Explore to find them.</p>` : ''}</div>`;
  };

  // ---- timeline -------------------------------------------------------
  const timelineCard = () => {
    const ch = CH(), f = UI.chr.filter;
    const kinds = f === 'all' ? null : G.CHRON_KINDS[f];
    let evs = ch.ev.filter(e => !kinds || kinds.includes(e.k)).slice().reverse();
    if (f === 'mine') evs = ch.ev.filter(e => e.a === 'p' || e.b === 'p' || ['cal', 'calend', 'feat', 'dawn'].includes(e.k)).slice().reverse();
    const shown = UI.chr.more ? evs : evs.slice(0, 30);
    let year = null, html = '';
    for (const e of shown) {
      const y = G.chronYear(S, e.t);
      if (y !== year) { if (year !== null) html += '</ul>'; html += `<div class="chr-year">— The ${['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][y] || G.chronOrd(y)} year —</div><ul class="chr-tl">`; year = y; }
      html += `<li class="${e.a === 'p' || e.b === 'p' ? 'mine' : ''}"><span class="ic">${ICON[e.k] || '·'}</span><time>${esc(when(e.t))}</time><span>${esc(G.chronText(S, e))}</span></li>`;
    }
    if (year !== null) html += '</ul>';
    const btn = (k, label) => `<button class="${f === k ? 'on' : ''}" data-act="chrFilter" data-f="${k}">${label}</button>`;
    return `<div class="card"><div class="row" style="flex-wrap:wrap;gap:6px"><h3 style="margin:0">📜 ${esc(G.chronBook(S))}</h3><span class="spacer"></span>
      <div class="chr-filter">${btn('all', 'All')}${btn('mine', 'Our deeds')}${btn('war', 'War & conquest')}${btn('realm', 'Wonders, faith & magic')}</div></div>
      ${html || '<p class="muted">Nothing worth the ink has happened yet.</p>'}
      ${evs.length > 30 ? `<p style="margin:8px 0 0"><button class="small" data-act="chrMore">${UI.chr.more ? 'Show fewer' : `Show all ${evs.length} entries`}</button></p>` : ''}</div>`;
  };

  // ---- feats ----------------------------------------------------------
  const featGrid = (thisGame, all) => G.FEATS.filter(G.featActive).map(f => {
    const now = thisGame.includes(f.id), ever = !!all[f.id];
    const sub = now ? 'Earned in this game' : ever ? `Earned before${all[f.id].realm ? ' — ' + esc(all[f.id].realm) : ''}` : '';
    return `<div class="chr-feat ${now ? 'now' : ever ? '' : 'locked'}" title="${esc(f.desc)}"><span class="fi">${f.icon}</span><span><b>${esc(f.name)}</b>${esc(f.desc)}${sub ? `<div class="muted" style="font-size:11px">${sub}</div>` : ''}</span></div>`;
  }).join('');
  const featsCard = () => {
    const all = G.featsAll(), mine = G.featsThisGame(S), act = G.FEATS.filter(G.featActive);
    const ever = act.filter(f => all[f.id]).length;
    return `<div class="card"><h3>🏅 Feats</h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">Deeds remembered across all your games in this browser. This game: <b>${mine.length}</b> · all time: <b>${ever}</b> of ${act.length}.</p>
      <div class="chr-feats">${featGrid(mine, all)}</div></div>`;
  };

  // ---- end-of-game summary ---------------------------------------------
  const summaryHtml = (withChart) => {
    const sm = G.chronSummary(S);
    const won = !!S.victory;
    const verdict = won ? ({ conquest: 'by conquest', wonder: 'by a wonder', faith: 'by faith', arcane: 'by the Great Working' })[sm.outcome] || ''
      : sm.outcome === 'defeat' ? 'Your realm has fallen' : `${esc((S.empires[sm.by] || {}).name || 'A rival')} prevailed`;
    const last = CH().ev.slice().reverse().find(e => e.k === 'victory' || e.k === 'defeat');
    const st = sm.stats;
    const stat = (v, l) => `<div><b>${fmt(v)}</b>${l}</div>`;
    const feats = sm.feats.map(id => G.featById(id)).filter(Boolean);
    return `<div class="card chr-summary"><h3>${won ? '👑 Victory' : '🥀 The end of an age'} ${won ? '— ' + verdict : ''}</h3>
      <p style="font-family:var(--font);font-size:15px;margin-top:0">${last ? esc(G.chronText(S, last)) : esc(verdict)}</p>
      <p class="muted" style="font-size:12.5px">So ends this chapter of ${esc(sm.book)}, after ${fmtTime(sm.time)} of game time (year ${G.chronYear(S, sm.time)}).</p>
      <div style="overflow-x:auto"><table class="chr-stand"><tr><th>Realm</th><th>⭐ Renown</th><th>🏰</th><th>👥</th><th>🛡️</th><th>⚔️ Taken</th><th>🏛️</th></tr>
      ${sm.standings.map((r, i) => `<tr style="${r.id === 'p' ? 'font-weight:600' : ''}"><td><span style="color:${r.color}">●</span> ${i + 1}. ${esc(r.id === 'p' ? r.name + ' (you)' : r.name)}${r.dead ? ' <span class="muted">fallen</span>' : ''}</td><td>${fmt(r.renown)}</td><td>${r.cities}</td><td>${fmt(r.pop)}</td><td>${fmt(r.army)}</td><td>${r.conquests}</td><td>${r.wonder}</td></tr>`).join('')}</table></div>
      <div class="chr-stats">${stat(st.peakRenown, 'peak renown')}${stat(st.peakCities, 'most cities')}${stat(st.founded, 'cities founded')}${stat(st.conquered, 'cities taken')}${stat(st.lost, 'cities lost')}${stat(st.battlesWon, 'battles won')}${stat(st.repelled, 'assaults repelled')}${stat(st.spells, 'spells cast')}${stat(st.endured, 'calamities endured')}</div>
      ${withChart ? `${metricButtons(UI.chr.endMetric || 'r', 'chrEndMetric')}<div class="chr-slot" id="chr-slot-end"></div><div class="chr-read" id="chr-slot-end-read"></div>` : ''}
      <p style="margin:8px 0 0"><b>Feats earned this game:</b> ${feats.length ? `<span class="chr-icons">${feats.map(f => `<span title="${esc(f.name + ': ' + f.desc)}">${f.icon}</span>`).join('')}</span> <span class="muted" style="font-size:12px">${feats.map(f => esc(f.name)).join(' · ')}</span>` : '<span class="muted">none</span>'}</p>
      <p style="margin:6px 0 0"><button class="small" data-act="tab" data-t="chronicle">📖 Read the whole chronicle</button></p></div>`;
  };
  const endShown = () => !!S && (!!S.gameOver || (!!S.victory && !S.victorySeen));
  ENDGAME_EXTRAS.push(() => endShown() ? summaryHtml(UI.tab !== 'chronicle') : '');

  // ---- the tab ----------------------------------------------------------
  const renderChronicle = () => {
    const ch = CH();
    const se = G.season(S);
    const head = `<div class="card"><h3>📖 ${esc(G.chronBook(S))} of ${esc(S.empires.p.name)}</h3>
      <p class="muted" style="margin:0;font-size:12.5px">${esc(se.name)} of the ${['', 'first', 'second', 'third'][se.year] || G.chronOrd(se.year)} year · ${ch.ev.length} entries · records every ${Math.round(ch.every * G.pace(S).time / 60)} game-minutes</p></div>`;
    const ended = (S.victory || S.gameOver) && !endShown() ? summaryHtml(false) : '';
    return head + ended + chartCard() + timelineCard() + featsCard();
  };
  {
    const entries = Object.entries(TABS).filter(([k]) => k !== 'chronicle');
    for (const [k] of entries) delete TABS[k];
    const tab = { label: '📖 Chronicle', render: () => renderChronicle() };
    let placed = false;
    for (const [k, v] of entries) {
      if (k === 'help') { TABS.chronicle = tab; placed = true; }
      TABS[k] = v;
    }
    if (!placed) TABS.chronicle = tab;
  }

  // ---- Empire tab: a feats card -----------------------------------------
  EMPIRE_EXTRAS.push(() => {
    if (!S) return '';
    const mine = G.featsThisGame(S).map(G.featById).filter(Boolean);
    const all = G.featsAll(), act = G.FEATS.filter(G.featActive);
    return `<div class="card"><div class="row"><h3 style="margin:0">🏅 Feats</h3><span class="spacer"></span><button class="small" data-act="tab" data-t="chronicle">📖 Chronicle</button></div>
      <p style="margin:6px 0 0">${mine.length ? `<span class="chr-icons">${mine.map(f => `<span title="${esc(f.name + ': ' + f.desc)}">${f.icon}</span>`).join('')}</span>` : '<span class="muted">No feats yet in this game.</span>'}</p>
      <p class="muted" style="font-size:12px;margin:4px 0 0">${mine.length} this game · ${act.filter(f => all[f.id]).length} of ${act.length} ever earned.</p></div>`;
  });

  // ---- start screen: feats earned in past games (ui-core has no hook there, so watch the DOM) ----
  const startFeats = () => {
    const all = G.featsAll(), act = G.FEATS.filter(G.featActive), got = act.filter(f => all[f.id]);
    return `<div class="card chr-startfeats"><h3>🏅 Feats of past reigns <span class="muted" style="font-size:13px">${got.length} / ${act.length}</span></h3>
      ${got.length ? `<p class="chr-icons" style="margin:4px 0">${got.map(f => `<span title="${esc(f.name + ' — ' + f.desc + (all[f.id].realm ? ' (' + all[f.id].realm + ')' : ''))}">${f.icon}</span>`).join('')}</p>` : '<p class="muted" style="margin:4px 0">No feats yet. Every reign is a chance to earn one.</p>'}
      <details><summary class="muted" style="font-size:12.5px">All feats</summary><div class="chr-feats" style="margin-top:6px">${featGrid([], all)}</div></details></div>`;
  };
  START_EXTRAS.push(startFeats);
  DEFEAT_EXTRAS.push(() => summaryHtml(false));

  // ---- actions --------------------------------------------------------------
  Object.assign(act, {
    chrMetric: d => { UI.chr.metric = d.m; if (charts['chr-slot-tab']) charts['chr-slot-tab'].hover = null; render(true); },
    chrEndMetric: d => { UI.chr.endMetric = d.m; if (charts['chr-slot-end']) charts['chr-slot-end'].hover = null; render(true); },
    chrToggle: d => { UI.chr.hidden[d.id] = !UI.chr.hidden[d.id]; render(true); },
    chrFilter: d => { UI.chr.filter = d.f; UI.chr.more = false; render(true); },
    chrMore: () => { UI.chr.more = !UI.chr.more; render(true); },
  });
})();
