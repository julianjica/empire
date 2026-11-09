// =====================================================================
//  The Realm Ledger (📒): one screen to run every city — a sortable,
//  filterable table (cards on a phone), bulk actions, a goods matrix that
//  shows what each city specialises in, and the supply-lines panel
//  (policies, planned shipments, carts on the road). Rules: js/logistics.js.
//  Form values use data-k keys prefixed lg_; they apply at once.
// =====================================================================
'use strict';
(() => {
  const style = document.createElement('style');
  style.textContent = `
  .lg-views{display:flex;gap:4px;flex-wrap:wrap}
  .lg-views button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
  .lg-bar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:8px 0 0;font-size:13px}
  .lg-bar select{max-width:200px}
  .lg-bar input[type=number]{width:84px}
  .lg-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .lg-table{font-size:12.5px;min-width:100%}
  .lg-table th{white-space:nowrap;position:sticky;top:0;background:var(--panel)}
  .lg-table th button{all:unset;cursor:pointer;color:inherit}
  .lg-table th button:focus-visible{outline:2px solid var(--accent)}
  .lg-table td{white-space:nowrap;vertical-align:middle}
  .lg-table tr.lg-sel td{background:color-mix(in srgb,var(--accent) 10%,transparent)}
  .lg-table tr.lg-tot td{font-weight:600;border-top:2px solid var(--line)}
  .lg-g{display:inline-flex;flex-direction:column;line-height:1.15;min-width:44px}
  .lg-g small{font-size:11px}
  .lg-short{color:var(--bad);font-weight:600} .lg-fall{color:var(--warn)} .lg-rise{color:var(--good)} .lg-flat{color:var(--muted)}
  .lg-city{display:inline-flex;align-items:center;gap:6px}
  .lg-city .pt-tok{flex:0 0 auto}
  .lg-name{font-weight:600}
  .lg-chip{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:0 6px;margin:1px 2px 1px 0;font-size:11px}
  .lg-chip.bad{border-color:var(--bad)} .lg-chip.warn{border-color:var(--warn)}
  .lg-heat td.lg-cell{text-align:right;font-variant-numeric:tabular-nums}
  .lg-spec{font-size:12px;white-space:normal;min-width:180px}
  .lg-cards{display:none}
  .lg-card{border:1px solid var(--line);border-radius:8px;padding:8px;margin:0 0 8px;background:var(--panel)}
  .lg-card.lg-sel{border-color:var(--accent)}
  .lg-card .lg-row{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:12.5px;margin-top:4px}
  .lg-pol td{vertical-align:middle}
  .lg-pol input[type=number]{width:72px}
  .lg-pol select{max-width:150px}
  .lg-sub{font-size:12px}
  .lg-log{font-size:12px;margin:4px 0 0;padding-left:18px;max-height:180px;overflow:auto}
  .lg-legend{font-size:12px}
  @media (max-width:700px){
    .lg-wide{display:none}
    .lg-cards{display:block}
    .lg-bar select{max-width:100%;flex:1 1 140px}
    .lg-pol .lg-hide-m{display:none}
    .lg-pol select{max-width:104px;font-size:12px}
    .lg-pol input[type=number]{width:56px}
    .lg-pol td,.lg-pol th{padding:3px 3px}
    .lg-pol .lg-city .pt-tok{display:none}
  }`;
  document.head.appendChild(style);

  const LG = () => (UI.lg = UI.lg || { view: 'cities', sort: 'name', dir: 1, filter: 'all', goods: 'core', sel: [], open: null });
  const CORE = ['grain', 'timber', 'stone', 'ore', 'iron', 'tools', 'weapons'];
  const goodsCols = () => {
    const vis = visibleGoods().filter(g => g !== 'mana');
    if (LG().goods === 'all') return visibleGoods();
    if (LG().goods !== 'core' && DATA.goods[LG().goods]) return [LG().goods];
    return vis.filter(g => CORE.includes(g) || DATA.goods[g].race);
  };
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const govSpec = c => ({ race: S.empires.p.race, kind: 'governor', seed: c.id, color: S.empires.p.color, era: G.techEra(S, 'p') });

  // ---- one row of data per city ------------------------------------------------
  const rowOf = c => {
    const e = G.econ(S, c);
    const act = G.buildingActivity(S, c, e);
    const blocked = Object.values(act).filter(a => a.state === 'blocked').length;
    const shorts = Object.keys(c.short || {}).filter(g => c.short[g]);
    if (c.starving && !shorts.includes('grain')) shorts.unshift('grain');
    const train = Object.values(c.train || {}).reduce((a, q) => a + q.reduce((b, it) => b + (it.left || 0), 0), 0);
    const last = c.buildQueue[c.buildQueue.length - 1];
    const gov = G.govOf ? G.govOf(S, c.id) : null;
    return { c, e, blocked, shorts, train, queue: c.buildQueue.length, eta: last ? last.end - S.time : 0, gov,
      happy: G.happyOf ? G.happyOf(c) : null, ae: G.autoExploreOn ? G.autoExploreOn(S, c.id) : false, idle: c.buildQueue.length === 0 };
  };
  const state = (r, g) => {
    const c = r.c, n = r.e.net[g] || 0, res = c.res[g] || 0;
    if (r.shorts.includes(g) || (res < 1 && n < -0.05)) return 'lg-short';
    if (n < -0.05) return 'lg-fall';
    if (n > 0.05) return 'lg-rise';
    return 'lg-flat';
  };
  const stateWord = { 'lg-short': 'short', 'lg-fall': 'falling', 'lg-rise': 'rising', 'lg-flat': 'steady' };
  const goodCell = (r, g) => {
    const st = state(r, g), n = r.e.net[g] || 0;
    return `<span class="lg-g ${st}" title="${esc(DATA.goods[g].name)} in ${esc(r.c.name)}: ${fmt(r.c.res[g] || 0)} in store, ${fmtRate(n)}/min (${stateWord[st]})"><b>${fmt(r.c.res[g] || 0)}</b><small>${fmtRate(n)}</small></span>`;
  };
  const problem = r => r.shorts.length || r.blocked || r.c.starving;
  const filtered = rows => {
    const f = LG().filter;
    return rows.filter(r => f === 'problems' ? problem(r) : f === 'gov' ? !!r.gov : f === 'nogov' ? !r.gov : f === 'idle' ? r.idle : true);
  };
  const sortKey = (r, k) => {
    if (k === 'name') return r.c.name.toLowerCase();
    if (k === 'tier') return G.lvl(r.c, 'townhall');
    if (k === 'pop') return r.c.pop;
    if (k === 'happy') return r.happy == null ? -1 : r.happy;
    if (k === 'queue') return r.queue * 1e7 + r.eta;
    if (k === 'train') return r.train;
    if (k === 'gov') return r.gov ? r.gov.focus : '~';
    if (k === 'alerts') return r.shorts.length * 100 + r.blocked;
    if (k.startsWith('g:')) return r.e.net[k.slice(2)] || 0;
    return 0;
  };
  const sorted = rows => {
    const { sort, dir } = LG();
    return rows.slice().sort((a, b) => { const x = sortKey(a, sort), y = sortKey(b, sort); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  };
  const th = (k, label, tip) => {
    const { sort, dir } = LG();
    return `<th${sort === k ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}><button data-act="lgSort" data-k="${k}" title="${esc(tip || 'Sort')}">${label}${sort === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  };
  const alertsHtml = r => `${r.shorts.map(g => `<span class="lg-chip bad" title="${esc(G.SHORT_TEXT[g] || 'Shortage')}">${gIcon(g)} short</span>`).join('')}${r.blocked ? `<span class="lg-chip warn" title="Buildings blocked (storage full or missing inputs)">⛔ ${r.blocked} blocked</span>` : ''}${r.idle ? '<span class="lg-chip" title="No construction queued">🔨 idle</span>' : ''}${!r.shorts.length && !r.blocked && !r.idle ? '<span class="muted">—</span>' : ''}`;
  const govCell = r => r.gov ? `${DATA.govFocus[r.gov.focus].icon} ${DATA.govFocus[r.gov.focus].name}` : '<span class="muted">manual</span>';
  const queueCell = r => r.queue ? `${r.queue} · ${fmtTime(realSecs(r.eta))}` : '<span class="muted">idle</span>';
  const cityCell = r => {
    const pic = r.gov ? ptHtml(govSpec(r.c), 28, 'pt-card', `Governor of ${r.c.name}`) : '';
    return `<span class="lg-city">${pic}<button class="link lg-name" data-act="lgOpen" data-c="${r.c.id}" title="Open ${esc(r.c.name)}">${esc(r.c.name)}</button>${r.ae ? ' <span title="Auto-explore on">🧭</span>' : ''}</span>`;
  };
  const happyCell = r => r.happy == null ? '—' : `${G.mood ? G.mood(r.happy).face : ''} ${r.happy}`;
  const isSel = id => LG().sel.includes(id);

  // ---- totals ------------------------------------------------------------------
  const totals = rows => {
    const t = { pop: 0, cap: 0, happy: 0, hn: 0, queue: 0, train: 0, blocked: 0, shorts: 0, res: {}, net: {} };
    for (const r of rows) {
      t.pop += r.c.pop; t.cap += r.e.popCap; t.queue += r.queue; t.train += r.train; t.blocked += r.blocked; t.shorts += r.shorts.length;
      if (r.happy != null) { t.happy += r.happy; t.hn++; }
      for (const g of DATA.goodOrder) { t.res[g] = (t.res[g] || 0) + (r.c.res[g] || 0); t.net[g] = (t.net[g] || 0) + (r.e.net[g] || 0); }
    }
    return t;
  };

  // ---- the city table and the phone cards ------------------------------------------
  const citiesView = (rows, all) => {
    const cols = goodsCols();
    const vis = sorted(filtered(rows));
    const allSel = vis.length && vis.every(r => isSel(r.c.id));
    const t = totals(all);
    const head = `<tr><th><input type="checkbox" data-k="lg_selall" aria-label="Select all shown" ${allSel ? 'checked' : ''}></th>${th('name', 'City')}${th('tier', 'Tier', 'Town Hall level')}${th('pop', '👥 Pop / 🏠')}${th('happy', '😊')}
      ${cols.map(g => th('g:' + g, gIcon(g), `${DATA.goods[g].name}: stock and net per minute`)).join('')}
      ${th('queue', '🔨 Queue')}${th('train', '🎖️ Training')}${th('gov', '🏛️ Governor')}${th('alerts', '⚠️ Alerts')}</tr>`;
    const body = vis.map(r => `<tr class="${isSel(r.c.id) ? 'lg-sel' : ''}">
      <td><input type="checkbox" data-k="lg_sel_${r.c.id}" aria-label="Select ${esc(r.c.name)}" ${isSel(r.c.id) ? 'checked' : ''}></td>
      <td>${cityCell(r)}</td><td>${esc(G.tier(r.c).name)} <span class="muted">${G.lvl(r.c, 'townhall')}</span></td>
      <td>${fmt(r.c.pop)} / ${fmt(r.e.popCap)}</td><td>${happyCell(r)}</td>
      ${cols.map(g => `<td>${goodCell(r, g)}</td>`).join('')}
      <td>${queueCell(r)}</td><td>${r.train || '<span class="muted">—</span>'}</td><td>${govCell(r)}</td><td>${alertsHtml(r)}</td></tr>`).join('');
    const tot = `<tr class="lg-tot"><td></td><td>Realm (${all.length})</td><td></td><td>${fmt(t.pop)} / ${fmt(t.cap)}</td><td>${t.hn ? Math.round(t.happy / t.hn) : '—'}</td>
      ${cols.map(g => { const n = t.net[g]; return `<td><span class="lg-g ${n < -0.05 ? 'lg-fall' : n > 0.05 ? 'lg-rise' : 'lg-flat'}"><b>${fmt(t.res[g])}</b><small>${fmtRate(n)}</small></span></td>`; }).join('')}
      <td>${t.queue}</td><td>${t.train || '—'}</td><td></td><td>${t.shorts ? `<span class="lg-chip bad">${t.shorts} short</span>` : ''}${t.blocked ? `<span class="lg-chip warn">⛔ ${t.blocked}</span>` : ''}</td></tr>`;
    const cards = vis.map(r => `<div class="lg-card ${isSel(r.c.id) ? 'lg-sel' : ''}">
      <div class="lg-row"><input type="checkbox" data-k="lg_sel_${r.c.id}" aria-label="Select ${esc(r.c.name)}" ${isSel(r.c.id) ? 'checked' : ''}>${cityCell(r)}<span class="pill">${esc(G.tier(r.c).name)}</span><span class="spacer"></span><span>${happyCell(r)}</span></div>
      <div class="lg-row"><span>👥 ${fmt(r.c.pop)}/${fmt(r.e.popCap)}</span><span>🔨 ${queueCell(r)}</span>${r.train ? `<span>🎖️ ${r.train}</span>` : ''}<span>🏛️ ${govCell(r)}</span></div>
      <div class="lg-row">${cols.map(g => `<span>${gIcon(g)} ${goodCell(r, g)}</span>`).join('')}</div>
      <div class="lg-row">${alertsHtml(r)}</div></div>`).join('');
    return `${vis.length ? '' : '<p class="muted">No city matches this filter.</p>'}
      <div class="lg-wide lg-scroll"><table class="lg-table">${head}${body}${tot}</table></div>
      <div class="lg-cards">${cards}<div class="lg-card"><b>Realm</b> · ${all.length} cities · 👥 ${fmt(t.pop)}/${fmt(t.cap)} · 🔨 ${t.queue} queued${t.shorts ? ` · <span class="bad">${t.shorts} shortages</span>` : ''}</div></div>`;
  };

  // ---- bulk actions ----------------------------------------------------------------
  const bulkBar = rows => {
    const sel = LG().sel.filter(id => S.cities[id] && S.cities[id].owner === 'p');
    const focus = UI.form.lg_focus || 'balanced';
    const blds = [];
    for (const grp of DATA.buildingGroups) for (const t of grp.list) { const b = DATA.buildings[t]; if (b && !b.wonder && !b.realmUnique && (!b.race || b.race === S.empires.p.race)) blds.push(t); }
    const bld = blds.includes(UI.form.lg_bld) ? UI.form.lg_bld : blds[0];
    const can = sel.filter(id => G.buildStatus(S, S.cities[id], bld).ok).length;
    return `<div class="lg-bar" role="group" aria-label="Bulk actions">
      <b>${sel.length} selected</b>
      <button class="small" data-act="lgSelect" data-w="all">All</button><button class="small" data-act="lgSelect" data-w="problems">With problems</button><button class="small" data-act="lgSelect" data-w="none">None</button>
      ${sel.length ? `<span class="spacer"></span>
      <label>Governor <select data-k="lg_focus">${opt('off', '✋ Manual', focus)}${DATA.govFocusOrder.map(f => opt(f, `${DATA.govFocus[f].icon} ${DATA.govFocus[f].name}`, focus)).join('')}</select></label>
      <button class="small" data-act="lgBulkGov">Apply</button>
      <label>Build <select data-k="lg_bld">${blds.map(t => opt(t, `${DATA.buildings[t].icon} ${DATA.buildings[t].name}`, bld)).join('')}</select></label>
      <button class="small" data-act="lgBulkBuild" ${can ? '' : 'disabled'} title="Queued only where it is affordable and allowed">Queue in ${can}/${sel.length}</button>
      <button class="small" data-act="lgBulkAE" data-on="1" title="Each selected city keeps a scout mapping the unknown">🧭 Auto-explore on</button>
      <button class="small" data-act="lgBulkAE" data-on="0">🧭 off</button>` : '<span class="muted lg-sub">Tick cities to set governors, queue a building or toggle auto-explore in all of them at once.</span>'}
    </div>`;
  };

  // ---- goods matrix (specialisation) ---------------------------------------------------
  const matrixView = rows => {
    const goods = visibleGoods();
    const max = {};
    for (const g of goods) max[g] = Math.max(1, ...rows.map(r => Math.abs(r.e.net[g] || 0)));
    const t = totals(rows);
    const cell = (v, g) => {
      const a = Math.min(1, Math.abs(v) / max[g]);
      const bg = Math.abs(v) < 0.05 ? 'transparent' : `color-mix(in srgb, var(${v > 0 ? '--good' : '--bad'}) ${Math.round(8 + a * 52)}%, transparent)`;
      return `<td class="lg-cell" style="background:${bg}" title="${esc(DATA.goods[g].name)}: ${fmtRate(v)}/min">${Math.abs(v) < 0.05 ? '·' : fmtRate(v)}</td>`;
    };
    const spec = r => {
      const list = goods.map(g => [g, r.e.net[g] || 0]).filter(([, v]) => Math.abs(v) >= 0.5);
      const plus = list.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
      const minus = list.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 1);
      const txt = [...plus, ...minus].map(([g, v]) => `<span class="${v > 0 ? 'good' : 'bad'}">${DATA.goods[g].name.toLowerCase()} ${fmtRate(v)}</span>`).join(', ');
      return txt || '<span class="muted">balanced</span>';
    };
    return `<p class="muted lg-sub">Net production per minute: green cells make more than they use, red cells use more than they make. The shade is relative to the busiest city for that good — specialisation at a glance.</p>
      <div class="lg-scroll"><table class="lg-table lg-heat"><tr><th>City</th>${goods.map(g => `<th title="${esc(DATA.goods[g].name)}">${gIcon(g)}</th>`).join('')}<th>Specialises in</th></tr>
      ${rows.map(r => `<tr><td>${cityCell(r)}</td>${goods.map(g => cell(r.e.net[g] || 0, g)).join('')}<td class="lg-spec"><b>${esc(r.c.name)}:</b> ${spec(r)}</td></tr>`).join('')}
      <tr class="lg-tot"><td>Realm</td>${goods.map(g => cell(t.net[g] || 0, g)).join('')}<td></td></tr></table></div>`;
  };

  // ---- supply lines --------------------------------------------------------------------
  const cname = id => (S.cities[id] ? esc(S.cities[id].name) : '?');
  const supplyView = rows => {
    const o = G.logistics(S, 'p');
    const goods = G.supplyGoods(S, 'p');
    const plan = G.supplyPlan(S, 'p');
    const moving = G.supplyInTransit(S, 'p');
    const st = o.stats;
    const parts = [];
    parts.push(`<div class="lg-bar">
      <button class="${o.on ? 'primary' : ''}" data-act="lgOn" aria-pressed="${o.on}">${o.on ? '🐪 Supply lines are running' : '⏸ Supply lines are off'}</button>
      <button class="small" data-act="lgRecommend" title="Keep about ten minutes of food, firewood, stone, iron, tools and weapons everywhere">Use the recommended policy</button>
      <label title="Also relieve famine, cold, crumbling walls, rust and worn tools for goods without a policy"><input type="checkbox" data-k="lg_relief" ${o.relief ? 'checked' : ''}> relieve hurting shortages</label>
    </div>
    <div class="lg-bar">
      <label title="Sell goods that would spill out of a full warehouse (none that another city still needs)"><input type="checkbox" data-k="lg_sell" ${o.sell ? 'checked' : ''}> auto-sell surplus</label>
      <label title="Buy at the city's market what a hurting shortage still lacks after shipments"><input type="checkbox" data-k="lg_buy" ${o.buy ? 'checked' : ''}> auto-buy shortages</label>
      <label title="Auto-buy never spends gold below this">keep 🪙 <input type="number" min="0" step="100" data-k="lg_reserve" value="${o.reserve}"></label>
      <span class="muted lg-sub">${st.trips} carts · ${fmt(st.shipped)} goods shipped${st.lost ? ` · <span class="bad">${fmt(st.lost)} lost to ambush</span>` : ''}${st.routed ? ` · ${st.routed} routes hurried` : ''}${st.sold ? ` · sold ${fmt(st.sold)} (+${fmt(st.earned)} 🪙)` : ''}${st.bought ? ` · bought ${fmt(st.bought)} (−${fmt(st.spent)} 🪙)` : ''}</span>
    </div>`);
    // policies
    const tot = totals(rows);
    const polRow = g => {
      const p = o.goods[g] || { on: false, mode: 'min', n: G.LOGI.defaultMin, export: null };
      const short = rows.filter(r => state(r, g) === 'lg-short').length;
      const open = LG().open === g;
      const row = `<tr>
        <td><label><input type="checkbox" data-k="lg_on_${g}" ${p.on ? 'checked' : ''}> ${gIcon(g)} ${esc(DATA.goods[g].name)}</label></td>
        <td><select data-k="lg_mode_${g}" aria-label="${esc(DATA.goods[g].name)}: how to set the target">${opt('min', 'minutes of use', p.mode)}${opt('stock', 'fixed stock', p.mode)}</select></td>
        <td><input type="number" min="0" step="${p.mode === 'min' ? 5 : 100}" data-k="lg_n_${g}" value="${p.n}" aria-label="${esc(DATA.goods[g].name)} target"></td>
        <td class="lg-hide-m"><input type="number" min="0" step="100" data-k="lg_ex_${g}" value="${p.export === null || p.export === undefined ? '' : p.export}" placeholder="auto" aria-label="${esc(DATA.goods[g].name)}: export above"></td>
        <td class="lg-hide-m">${fmt(tot.res[g] || 0)} <span class="${(tot.net[g] || 0) < -0.05 ? 'lg-fall' : (tot.net[g] || 0) > 0.05 ? 'lg-rise' : 'lg-flat'}">${fmtRate(tot.net[g] || 0)}/min</span>${short ? ` · <span class="lg-short">${short} short</span>` : ''}</td>
        <td><button class="small" data-act="lgOpenGood" data-g="${g}" aria-expanded="${open}">${open ? 'Hide' : 'Cities'}</button></td></tr>`;
      if (!open) return row;
      const det = rows.map(r => {
        const t = G.supplyTarget(S, r.c, g, r.e, o);
        const ov = (o.cities[r.c.id] || {})[g] || {};
        const out = !!o.excl[r.c.id];
        return `<tr class="lg-sub"><td>↳ ${cityCell(r)}</td><td>${goodCell(r, g)}</td>
          <td><input type="number" min="0" step="50" data-k="lg_ct_${r.c.id}_${g}" value="${ov.target !== undefined ? ov.target : ''}" placeholder="${Math.round(t.target)}" title="Target here (blank = from the policy)"></td>
          <td class="lg-hide-m"><input type="number" min="0" step="50" data-k="lg_ce_${r.c.id}_${g}" value="${ov.export !== undefined ? ov.export : ''}" placeholder="${Math.round(t.export)}" title="Export above (blank = automatic)"></td>
          <td class="lg-hide-m">${G.lvl(r.c, 'market') ? `🐪 ${G.caravanCap(S, r.c)}/cart · ${G.supplySlots(S, r.c)} at once` : '<span class="warn">no Market: receives only</span>'}</td>
          <td><label title="Leave this city out of every supply line"><input type="checkbox" data-k="lg_in_${r.c.id}" ${out ? '' : 'checked'} aria-label="${esc(r.c.name)} in the supply plan"><span class="lg-hide-m"> in plan</span></label></td></tr>`;
      }).join('');
      return row + det;
    };
    parts.push(`<div class="lg-scroll"><table class="lg-table lg-pol"><tr><th>Good</th><th>Keep</th><th>Target</th><th class="lg-hide-m">Export above</th><th class="lg-hide-m">Realm stock</th><th></th></tr>${goods.map(polRow).join('')}</table></div>
      <p class="muted lg-sub lg-legend">Each city keeps its target (minutes of its own use, or a fixed stock) and offers what it holds above its export level (automatic: 1.5× the target or the target plus a tenth of its storage). In an emergency elsewhere a city gives down to a little above its own target, never below. Caravans need a Market in the sending city (more carts with a bigger Market); island cities are supplied by sea from a city with a Harbor. Standing routes that already carry a good are used first.</p>`);
    // plan preview
    const routed = plan.routed.map(x => `<li>🛤️ ${cname(x.from)} → ${cname(x.to)}: ${gIcon(x.g)} ${fmt(x.n)} on the standing route${x.hurry ? ' <span class="warn">(called out early)</span>' : ''}</li>`);
    const ships = plan.ships.map(x => `<li>${x.naval ? '⛵' : '🐪'} ${cname(x.from)} → ${cname(x.to)}: ${goodsHtml(x.goods)} <span class="muted">· ${fmtTime(realSecs(x.dur || 0))} · ${esc(x.why)}</span></li>`);
    const unmet = plan.needs.filter(n => n.unmet > 0).map(n => `<li class="${n.prio >= G.LOGI.buyPrio ? 'bad' : 'muted'}">${cname(n.city)} lacks ${gIcon(n.g)} ${fmt(n.unmet)} (${esc(n.why)}) — no city can spare it${n.prio >= G.LOGI.buyPrio && o.buy ? '; auto-buy will try' : ''}</li>`);
    parts.push(`<h4>${o.on ? 'Next shipments' : 'What would be sent now'} <span class="muted lg-sub">(plans every ${fmtTime(realSecs(G.LOGI.every * 60 * G.pace(S).time))})</span></h4>
      ${ships.length || routed.length ? `<ul class="lg-log">${ships.join('')}${routed.join('')}</ul>` : '<p class="muted lg-sub">Nothing to send: every city is at its target, or no city can spare the goods.</p>'}
      ${unmet.length ? `<ul class="lg-log">${unmet.slice(0, 12).join('')}</ul>` : ''}
      ${plan.notes.length ? `<p class="muted lg-sub">${plan.notes.map(esc).join(' · ')}</p>` : ''}`);
    // on the road
    parts.push(`<h4>On the road (${moving.length})</h4>${moving.length ? `<div class="lg-scroll"><table class="lg-table"><tr><th>From → to</th><th>Cargo</th><th>Arrives</th><th></th></tr>${moving.map(m => `<tr><td>${m.naval ? '⛵' : '🐪'} ${cname(m.from)} → ${cname(m.to)}</td><td>${goodsHtml(m.cargo)}</td><td>${fmtTime(realSecs(m.arrive - S.time))}</td><td>${m.ambushed ? '<span class="bad">ambushed</span>' : ''}<button class="small" data-act="lgShow" data-m="${m.id}">Map</button></td></tr>`).join('')}</table></div>` : '<p class="muted lg-sub">No supply carts on the road.</p>'}`);
    if (o.log.length) parts.push(`<h4>Logbook</h4><ul class="lg-log">${o.log.slice(0, 20).map(l => `<li>${esc(l.text)} <span class="muted">· ${ago(l.t)}</span></li>`).join('')}</ul>`);
    return parts.join('');
  };

  // ---- the tab -------------------------------------------------------------------------
  const renderLedger = () => {
    const lg = LG();
    const all = G.citiesOf(S, 'p');
    lg.sel = lg.sel.filter(id => S.cities[id] && S.cities[id].owner === 'p');
    const rows = all.map(rowOf);
    const probs = rows.filter(problem).length;
    const views = [['cities', '🏙️ Cities'], ['matrix', '🧮 Goods matrix'], ['supply', '🐪 Supply lines']];
    const head = `<div class="card"><div class="row"><h2 style="margin:0">📒 The Realm Ledger</h2><span class="spacer"></span>
        <div class="lg-views" role="tablist">${views.map(([k, l]) => `<button class="small ${lg.view === k ? 'on' : ''}" role="tab" aria-selected="${lg.view === k}" data-act="lgView" data-v="${k}">${l}</button>`).join('')}</div></div>
      <p class="muted lg-sub" style="margin:6px 0 0">${all.length} cit${all.length === 1 ? 'y' : 'ies'} · ${fmt(rows.reduce((a, r) => a + r.c.pop, 0))} people · 🪙 ${fmt(S.empires.p.gold)}${probs ? ` · <span class="bad">${probs} with problems</span>` : ''}${G.logistics(S, 'p').on ? ` · 🐪 ${G.supplyInTransit(S, 'p').length} supply carts on the road` : ''}</p></div>`;
    let body;
    if (lg.view === 'matrix') body = `<div class="card">${matrixView(rows)}</div>`;
    else if (lg.view === 'supply') body = `<div class="card"><h3>🐪 Supply lines</h3>${all.length < 2 ? '<p class="muted">Found a second city to move goods between your cities.</p>' : supplyView(rows)}</div>`;
    else {
      const gopts = [['core', 'Key goods'], ['all', 'All goods'], ...visibleGoods().map(g => [g, `${DATA.goods[g].icon} ${DATA.goods[g].name} only`])];
      body = `<div class="card"><div class="lg-bar">
          <label>Show <select data-k="lg_filter">${[['all', 'All cities'], ['problems', 'With problems'], ['idle', 'Idle builders'], ['gov', 'With a governor'], ['nogov', 'Without a governor']].map(([k, l]) => opt(k, l, lg.filter)).join('')}</select></label>
          <label>Goods <select data-k="lg_goods">${gopts.map(([k, l]) => opt(k, l, lg.goods)).join('')}</select></label>
          <label>Sort <select data-k="lg_sortsel">${[['name', 'Name'], ['tier', 'Tier'], ['pop', 'Population'], ['happy', 'Happiness'], ['queue', 'Build queue'], ['alerts', 'Alerts'], ...goodsCols().map(g => ['g:' + g, `${DATA.goods[g].name} net`])].map(([k, l]) => opt(k, l, lg.sort)).join('')}</select></label>
          <span class="muted lg-sub lg-legend"><span class="lg-short">■ short</span> <span class="lg-fall">■ falling</span> <span class="lg-rise">■ rising</span> · stock over net/min</span>
        </div>
        ${bulkBar(rows)}
        ${citiesView(rows, rows)}</div>`;
    }
    return head + body;
  };

  // place the tab after 👑 Empire
  {
    const entries = Object.entries(TABS).filter(([k]) => k !== 'ledger');
    for (const [k] of entries) delete TABS[k];
    const tab = { label: '📒 Ledger', render: () => renderLedger(), badge: () => (S ? G.citiesOf(S, 'p').filter(c => c.starving || Object.keys(c.short || {}).some(g => c.short[g])).length : 0) };
    let placed = false;
    for (const [k, v] of entries) { TABS[k] = v; if (k === 'empire') { TABS.ledger = tab; placed = true; } }
    if (!placed) TABS.ledger = tab;
  }

  // ---- actions ---------------------------------------------------------------------------
  const selected = () => LG().sel.map(id => S.cities[id]).filter(c => c && c.owner === 'p');
  Object.assign(act, {
    lgView: d => { LG().view = d.v; render(true); },
    lgSort: d => { const lg = LG(); if (lg.sort === d.k) lg.dir = -lg.dir; else { lg.sort = d.k; lg.dir = d.k === 'name' ? 1 : -1; } render(true); },
    lgOpen: d => { if (!S.cities[d.c]) return; UI.city = d.c; UI.tab = 'city'; window.scrollTo(0, 0); render(true); },
    lgSelect: d => {
      const rows = G.citiesOf(S, 'p').map(rowOf);
      LG().sel = d.w === 'none' ? [] : d.w === 'problems' ? rows.filter(problem).map(r => r.c.id) : rows.map(r => r.c.id);
      render(true);
    },
    lgBulkGov: () => {
      const f = UI.form.lg_focus || 'balanced', list = selected();
      let n = 0;
      for (const c of list) if (!G.setGovernor(S, c.id, { focus: f })) n++;
      toast(f === 'off' ? `${n} cit${n === 1 ? 'y is' : 'ies are'} back in your hands` : `${DATA.govFocus[f].name} governors take over ${n} cit${n === 1 ? 'y' : 'ies'}`);
      render(true);
    },
    lgBulkBuild: () => {
      const t = UI.form.lg_bld, list = selected();
      if (!DATA.buildings[t]) { toast('Choose a building'); return; }
      const done = [], skip = [];
      for (const c of list) { if (G.buildStatus(S, c, t).ok && !G.queueBuild(S, c.id, t)) done.push(c.name); else skip.push(c.name); }
      toast(`${DATA.buildings[t].icon} ${DATA.buildings[t].name} queued in ${done.length} cit${done.length === 1 ? 'y' : 'ies'}${skip.length ? ` · ${skip.length} could not (cost or requirements)` : ''}`);
      render(true);
    },
    lgBulkAE: d => {
      if (!G.setAutoExplore) return;
      const on = d.on === '1', list = selected();
      for (const c of list) G.setAutoExplore(S, c.id, on);
      toast(`Auto-explore ${on ? 'on' : 'off'} in ${list.length} cit${list.length === 1 ? 'y' : 'ies'}`);
      render(true);
    },
    lgOn: () => { const o = G.logistics(S, 'p'); G.setSupplyRealm(S, 'p', { on: !o.on }); toast(o.on ? 'Supply lines are running' : 'Supply lines paused'); render(true); },
    lgRecommend: () => { G.supplyRecommend(S, 'p'); toast('Supply lines set: about ten minutes of upkeep goods everywhere'); render(true); },
    lgOpenGood: d => { LG().open = LG().open === d.g ? null : d.g; render(true); },
    lgShow: d => { const m = S.moves.find(x => x.id === d.m); if (!m) return; const p = G.movePos(S, m); UI.tab = 'world'; UI.sel = { x: Math.round(p.x), y: Math.round(p.y) }; window.scrollTo(0, 0); render(true); },
  });

  // form controls apply at once
  document.addEventListener('change', ev => {
    const el = ev.target, k = el.dataset && el.dataset.k;
    if (!S || !k || !k.startsWith('lg_')) return;
    const lg = LG(), v = el.type === 'checkbox' ? el.checked : el.value;
    let m, err = null, keep = false;
    if (k === 'lg_selall') {
      const ids = sorted(filtered(G.citiesOf(S, 'p').map(rowOf))).map(r => r.c.id);
      lg.sel = v ? [...new Set([...lg.sel, ...ids])] : lg.sel.filter(id => !ids.includes(id));
    } else if ((m = k.match(/^lg_sel_(.+)$/))) {
      lg.sel = lg.sel.filter(id => id !== m[1]); if (v) lg.sel.push(m[1]);
    } else if (k === 'lg_filter') lg.filter = v;
    else if (k === 'lg_goods') lg.goods = v;
    else if (k === 'lg_sortsel') { lg.sort = v; lg.dir = v === 'name' ? 1 : -1; }
    else if (k === 'lg_focus' || k === 'lg_bld') { UI.form[k] = v; keep = true; }
    else if (k === 'lg_relief' || k === 'lg_sell' || k === 'lg_buy') err = G.setSupplyRealm(S, 'p', { [k.slice(3)]: v });
    else if (k === 'lg_reserve') err = G.setSupplyRealm(S, 'p', { reserve: v });
    else if ((m = k.match(/^lg_(on|mode|n|ex)_(\w+)$/))) {
      const cfg = m[1] === 'on' ? { on: v } : m[1] === 'mode' ? { mode: v, n: v === 'min' ? G.LOGI.defaultMin : 500 } : m[1] === 'n' ? { n: v } : { export: v === '' ? null : v };
      err = G.setSupplyPolicy(S, 'p', m[2], cfg);
      if (!err && m[1] === 'on' && v) toast(`${DATA.goods[m[2]].name} now follows the supply lines`);
    } else if ((m = k.match(/^lg_(ct|ce)_(.+)_(\w+)$/))) err = G.setSupplyCity(S, 'p', m[2], m[3], { [m[1] === 'ct' ? 'target' : 'export']: v === '' ? null : v });
    else if ((m = k.match(/^lg_in_(.+)$/))) err = G.setSupplyCity(S, 'p', m[1], null, { off: !v });
    else return;
    if (err) toast(err);
    if (!keep) delete UI.form[k];
    el.blur(); render(true);
  });
})();
