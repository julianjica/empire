// =====================================================================
//  Moving troops between your own cities, from the Military tab.
//  The engine already supports it (a 'reinforce' march: troops join the
//  target city's garrison on arrival). This card makes it easy to find:
//  pick a destination, pick troops, send. Below it, a realm garrison
//  overview with troops on the road and a "send here" shortcut.
// =====================================================================
'use strict';
(() => {
  const own = () => G.citiesOf(S, 'p');
  const troopUnits = city => Object.entries(city.units || {}).filter(([, n]) => n > 0);
  const nameOf = u => (G.unitStats ? G.unitStats(S, 'p', u) : DATA.units[u] || {}).name || u;
  const iconOf = (u, size) => (typeof ptHtml === 'function' && typeof unitSpec === 'function' && ptHtml(unitSpec(u, 'p'), size, '', nameOf(u))) || (DATA.units[u] || {}).icon || '';

  const gather = city => {
    const units = {};
    for (const [u, n] of troopUnits(city)) { const v = parseInt(UI.form['mv_' + u], 10); if (v > 0) units[u] = Math.min(v, n); }
    return units;
  };
  const destOf = city => {
    const others = own().filter(c => c.id !== city.id);
    const d = S.cities[UI.form.mvDest];
    return d && d.owner === 'p' && d.id !== city.id ? d : others[0] || null;
  };
  // incoming and outgoing reinforcements for a city
  const roads = () => (S.moves || []).filter(m => m.owner === 'p' && m.type === 'reinforce');
  const toCity = (m, c) => m.x === c.x && m.y === c.y;

  const card = city => {
    const cities = own();
    if (cities.length < 2) return `<div class="card"><h3 style="margin-top:0">🚚 Move troops</h3><p class="muted" style="margin:0">Found or take a second city to move troops between your cities.</p></div>`;
    const dest = destOf(city);
    const units = troopUnits(city);
    const sending = gather(city);
    let eta = '';
    if (dest && G.unitsCount(sending)) {
      const pl = G.planMarch(S, 'p', city, dest, sending);
      eta = pl.ok ? `${pl.naval ? '⛵ By sea · ' : ''}Arrives in ${fmtTime(realSecs(pl.dur))}` : `<span class="warn">${esc(pl.reason)}</span>`;
    }
    const destBtns = cities.filter(c => c.id !== city.id).map(c => {
      const pl = G.planMarch(S, 'p', city, c, units.length ? Object.fromEntries(units) : { hero: 1 });
      const t = pl.ok ? fmtTime(realSecs(pl.dur)) : '—';
      return `<button class="small ${dest && dest.id === c.id ? 'primary' : ''}" data-act="mvDest" data-c="${esc(c.id)}" title="${pl.ok ? 'Travel time for these troops' : esc(pl.reason || '')}">${esc(c.name)} <span class="muted">${t}</span></button>`;
    }).join('');
    const table = units.length ? `<table class="mv-table">${units.map(([u, n]) => `<tr><td class="pt-cell">${iconOf(u, 26)} ${esc(nameOf(u))}</td><td class="muted">${n}</td><td><input type="number" min="0" max="${n}" data-k="mv_${u}" value="${esc(UI.form['mv_' + u] || '')}" style="width:70px"></td><td><button class="small" data-act="mvSet" data-u="${u}" data-n="${n}">all</button></td></tr>`).join('')}</table>
      <div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap"><button class="small" data-act="mvFill" data-f="1">All troops</button><button class="small" data-act="mvFill" data-f="0.5">Half</button><button class="small" data-act="mvFill" data-f="0">Clear</button></div>`
      : `<p class="muted">No troops in ${esc(city.name)} to move.</p>`;
    return `<div class="card mv-card"><h3 style="margin-top:0">🚚 Move troops</h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">Send troops from <b>${esc(city.name)}</b> to join another city's garrison. They march along the road (or sail) and stay there.</p>
      <div class="row" style="gap:4px;flex-wrap:wrap;margin-bottom:6px"><span class="muted" style="font-size:12.5px">To:</span>${destBtns}</div>
      ${table}
      ${units.length ? `<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:8px"><button class="primary" data-act="mvSend" ${dest && G.unitsCount(sending) ? '' : 'disabled'}>Send to ${dest ? esc(dest.name) : '…'}</button><span class="muted" style="font-size:12px">${eta}</span></div>` : ''}
    </div>`;
  };

  // realm-wide garrisons, with troops on the road
  const overview = city => {
    const cities = own();
    if (cities.length < 2) return '';
    const rs = roads();
    const rows = cities.map(c => {
      const n = G.unitsCount(c.units || {});
      const inc = rs.filter(m => toCity(m, c)).reduce((a, m) => a + G.unitsCount(m.units), 0);
      const def = G.defPower ? Math.round(G.defPower(S, 'p', c.units || {})) : null;
      const here = c.id === city.id;
      return `<tr class="${here ? 'sel' : ''}"><td>${esc(c.name)}${G.isCapital && G.isCapital(S, c) ? ' 👑' : ''}</td><td>${fmt(n)}</td>${def !== null ? `<td class="muted">🛡️ ${fmt(def)}</td>` : ''}<td class="muted">${inc ? '🚚 +' + fmt(inc) : ''}</td>
        <td>${here ? '<span class="muted">here</span>' : `<button class="small" data-act="mvDest" data-c="${esc(c.id)}">Send here</button> <button class="small" data-act="mvGo" data-c="${esc(c.id)}" title="Open ${esc(c.name)}">Open</button>`}</td></tr>`;
    }).join('');
    const onRoad = rs.length ? `<p class="muted" style="font-size:12px;margin:6px 0 0">${rs.length} reinforcement column${rs.length > 1 ? 's' : ''} on the road.</p>` : '';
    // troops the stewards lent to a threatened city march home once it has been quiet a while (automation.js)
    const lent = S.automation && S.automation.lent ? Object.values(S.automation.lent).filter(r => S.cities[r.to] && S.cities[r.from]) : [];
    const lentNote = lent.length ? `<p class="muted" style="font-size:12px;margin:6px 0 0">🤖 ${lent.map(r => `${fmt(G.unitsCount(r.units))} soldiers lent to ${esc(S.cities[r.to].name)} go home to ${esc(S.cities[r.from].name)}`).join(' · ')} once ${lent.length > 1 ? 'those cities have' : 'it has'} been safe ${G.AUTO ? G.AUTO.returnCalm : 10} min.</p>` : '';
    return `<div class="card mv-over"><h3 style="margin-top:0">🗺️ Garrisons of the realm</h3>
      <div style="overflow-x:auto"><table class="mv-table"><tr class="muted"><td>City</td><td>Troops</td>${G.defPower ? '<td>Defence</td>' : ''}<td>Coming</td><td></td></tr>${rows}</table></div>${onRoad}${lentNote}</div>`;
  };

  MILITARY_EXTRAS.push(city => card(city) + overview(city));

  Object.assign(act, {
    mvDest: d => { UI.form.mvDest = d.c; render(true); },
    mvSet: d => { UI.form['mv_' + d.u] = d.n; render(true); },
    mvFill: d => {
      const city = curCity(), f = +d.f;
      for (const [u, n] of troopUnits(city)) UI.form['mv_' + u] = f ? String(f >= 1 ? n : Math.floor(n * f)) : '';
      render(true);
    },
    mvSend: () => {
      const city = curCity(), dest = destOf(city), units = gather(city);
      if (!dest) return toast('No other city to send to');
      const err = G.sendArmy(S, city.id, dest.x, dest.y, 'reinforce', units);
      if (err) return toast(err);
      for (const u of Object.keys(units)) delete UI.form['mv_' + u];
      toast(`${G.unitsCount(units)} troops march to ${dest.name}`);
      render(true);
    },
    mvGo: d => { if (S.cities[d.c]) { UI.city = d.c; render(true); } },
  });
})();
