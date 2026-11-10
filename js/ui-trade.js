// =====================================================================
//  Trade routes UI: the "🐪 Trade routes" card on the Market tab and a
//  line on each Diplomacy realm card. Form values live in UI.form under
//  data-k keys prefixed tr_ (ui-core keeps them across re-renders).
// =====================================================================
'use strict';

(() => {
  const T = G.TRADE;
  const NO_ESCORT = { hero: 1, settlers: 1, herald: 1 };
  const fv = (k, def) => (UI.form[k] !== undefined && UI.form[k] !== '' ? UI.form[k] : def);
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const riskHtml = rk => {
    const p = Math.round(rk.chance * 100);
    const cls = p < 5 ? 'low' : p < 25 ? 'mid' : 'high';
    const tip = rk.camps.length || rk.armies
      ? [...rk.camps.map(k => `Brigand camp tier ${k.tier} at (${k.x}, ${k.y})`), ...(rk.armies ? [`${rk.armies} hostile arm${rk.armies > 1 ? 'ies' : 'y'} near the road`] : [])].join('\n')
        + (rk.escortHolds === true ? '\nThe escort should hold.' : rk.escortHolds === false ? '\nThe escort may break.' : '\nNo escort: about half the cargo is lost in an ambush.')
      : 'The road is clear.';
    return `<span class="tr-risk tr-risk-${cls}" title="${esc(tip)}">${p}%${rk.camps.length ? ` · ${rk.camps.length}☠️` : ''}</span>`;
  };
  const escortUnits = city => G.unitsFor(S, city).filter(u => !NO_ESCORT[u] && DATA.units[u] && DATA.units[u].type !== 'siege');
  const realmPill = owner => { const e = S.empires[owner]; return `<span class="pill tr-realm-pill" style="border-color:${e.color}">${esc(e.name)}</span>`; };

  const minorPill = mi => { const k = DATA.minorKinds && DATA.minorKinds[mi.kind]; return `<span class="pill tr-realm-pill" style="border-color:${k ? k.color : 'var(--line)'}">${k ? k.icon + ' ' + esc(k.name) : 'Free city'}</span>`; };
  const routeRow = (city, r) => {
    const minor = G.routeIsMinor(r);
    const to = G.routeDest(S, r);
    const moving = G.routeInFlight(S, r.id);
    const rk = G.routeRisk(S, r);
    let when;
    if (moving.length) {
      const m = moving[0];
      when = `🐪 ${m.leg === 'back' ? 'returning' : 'on the road'}, ${fmtTime(realSecs(m.arrive - S.time))}`;
    } else if (!r.active) when = '<span class="muted">Paused</span>';
    else when = `in ${fmtTime(realSecs(Math.max(0, r.nextAt - S.time)))}`;
    const units = escortUnits(city);
    const ku = 'tr_eu_' + r.id, kn = 'tr_en_' + r.id;
    const curU = fv(ku, Object.keys(r.escort || {})[0] || units[0]);
    return `<tr>
      <td>→ <b>${minor ? '🏰 ' : ''}${esc(to ? to.name : r.to.name || '?')}</b>${r.foreign ? ' ' + realmPill(r.to.owner) : minor && to ? ' ' + minorPill(to) : ''}<div class="muted tr-sub">${r.trips} trip${r.trips === 1 ? '' : 's'}${r.foreign || minor ? ` · 🪙 ${fmt(r.income)} earned` : ''}${minor ? ` · +${(r.influence || 0).toFixed(0)} influence (now ${to ? Math.round(G.minorInf(S, to, 'p')) : 0})` : ''}${r.lost ? ` · <span class="bad">${fmt(r.lost)} lost</span>` : ''}</div></td>
      <td data-l="Goods">${goodsHtml(r.goods.give)}${r.foreign ? ` ⇄ <span class="good">${goodsHtml(r.goods.take)}</span>` : minor ? ' → <span class="good">influence</span>' : ''}</td>
      <td data-l="Every">${fmtTime(realSecs(r.every))}</td>
      <td data-l="Next">${when}${r.note ? `<div class="muted tr-sub">${esc(r.note)}</div>` : ''}</td>
      <td data-l="Risk">${riskHtml(rk)}</td>
      <td data-l="Income per trip">${r.foreign && to ? '🪙 ' + (G.routeTripIncome ? G.routeTripIncome(S, r, city, to) : G.routeIncome(S, city, to)) : minor && to ? '🪙 ' + G.minorRouteQuote(S, city, to, r.goods.give).gold : '<span class="muted">—</span>'}</td>
      <td class="tr-ctl">
        <div class="row">
          <button class="small" data-act="trPause" data-r="${r.id}">${r.active ? '⏸ Pause' : '▶ Resume'}</button>
          <button class="small" data-act="trCancel" data-r="${r.id}">✖ Cancel</button>
        </div>
        <div class="row tr-escort">🛡️ ${G.unitsCount(r.escort) ? unitsHtml(r.escort) : '<span class="muted">no escort</span>'}</div>
        <div class="row tr-escort">
          <select data-k="${ku}">${units.map(u => opt(u, `${DATA.units[u].icon} ${DATA.units[u].name} (${city.units[u] || 0})`, curU)).join('')}</select>
          <input type="number" min="0" step="5" data-k="${kn}" value="${esc(fv(kn, (r.escort || {})[curU] || 10))}">
          <button class="small" data-act="trEscort" data-r="${r.id}">Set</button>
        </div>
      </td></tr>`;
  };

  const internalForm = city => {
    const others = G.citiesOf(S, 'p').filter(c => c.id !== city.id);
    if (!others.length) return `<p class="muted tr-sub">Found a second city to run goods between your own cities.</p>`;
    const k = s => `tr_${s}_${city.id}`;
    const to = others.some(c => c.id === fv(k('to'))) ? fv(k('to')) : others[0].id;
    const good = fv(k('good'), 'ore');
    const cap = G.caravanCap(S, city);
    const amt = fv(k('amt'), Math.min(cap, 200));
    const every = fv(k('every'), T.defaultEvery);
    const rk = G.routeRisk(S, { owner: 'p', from: city.id, to: { id: to }, foreign: false });
    return `<div class="tr-form"><h4>Between your cities</h4>
      <div class="row">
        <label>To <select data-k="${k('to')}">${others.map(c => opt(c.id, `${c.name} · ${G.dist(c, city).toFixed(1)} tiles`, to)).join('')}</select></label>
        <label>Ship <input type="number" min="1" step="50" max="${cap}" data-k="${k('amt')}" value="${esc(amt)}"></label>
        <label><select data-k="${k('good')}">${visibleGoods().map(g => opt(g, `${DATA.goods[g].icon} ${DATA.goods[g].name} (${fmt(city.res[g] || 0)})`, good)).join('')}</select></label>
        <label>every <select data-k="${k('every')}">${T.intervals.map(m => opt(m, fmtTime(realSecs(G.routeEvery(S, m))), every)).join('')}</select></label>
        <button class="small primary" data-act="trNewInternal" data-c="${city.id}">Open route</button>
      </div>
      <div class="muted tr-sub">Up to ${fmt(cap)} per caravan · trip ${fmtTime(realSecs(G.travelTime(S, 'p', city, S.cities[to], T.spd)))} · ambush risk ${riskHtml(rk)}</div>
    </div>`;
  };

  const foreignForm = city => {
    const targets = G.routeTargets(S, 'p').sort((a, b) => G.dist(a, city) - G.dist(b, city));
    const k = s => `tr_${s}_${city.id}`;
    if (!targets.length) {
      const why = Object.values(S.empires).filter(e => e.id !== 'p' && !e.dead).map(e => {
        const err = G.tradePartnerError(S, 'p', e.id);
        const known = G.citiesOf(S, e.id).some(c => G.lvl(c, 'market') >= 1 && S.explored[G.tileIdx(S, c)]);
        return `${esc(e.name)}: ${esc(err || (known ? 'no free route' : 'no known city with a Market'))}`;
      });
      return `<div class="tr-form"><h4>With foreign realms</h4><p class="muted tr-sub">No partner available. ${why.join(' · ')}.</p></div>`;
    }
    const toId = targets.some(c => c.id === fv(k('fto'))) ? fv(k('fto')) : targets[0].id;
    const to = S.cities[toId];
    const takes = G.routeTakeGoods(S, 'p', to.owner);
    const give = fv(k('fgive'), 'grain');
    let take = fv(k('ftake'), takes.find(g => g !== give) || takes[0]);
    if (!takes.includes(take) || take === give) take = takes.find(g => g !== give);
    const cap = G.caravanCap(S, city);
    const amt = Math.max(1, Math.min(cap, parseInt(fv(k('famt'), Math.min(cap, 300)), 10) || 0));
    const every = fv(k('fevery'), T.defaultEvery);
    const q = G.routeQuote(S, city, to, give, amt, take);
    const rk = G.routeRisk(S, { owner: 'p', from: city.id, to: { id: toId }, foreign: true });
    const spec = (G.TRADE_SPECIALTY[S.empires[to.owner].race] || []).includes(take);
    return `<div class="tr-form"><h4>With foreign realms</h4>
      <div class="row">
        <label>To <select data-k="${k('fto')}">${targets.map(c => opt(c.id, `${c.name} (${S.empires[c.owner].name}) · ${G.dist(c, city).toFixed(1)} tiles`, toId)).join('')}</select></label>
        <label>Send <input type="number" min="1" step="50" max="${cap}" data-k="${k('famt')}" value="${esc(amt)}"></label>
        <label><select data-k="${k('fgive')}">${visibleGoods().map(g => opt(g, `${DATA.goods[g].icon} ${DATA.goods[g].name} (${fmt(city.res[g] || 0)})`, give)).join('')}</select></label>
        <label>for <select data-k="${k('ftake')}">${takes.filter(g => g !== give).map(g => opt(g, `${DATA.goods[g].icon} ${DATA.goods[g].name}${(G.TRADE_SPECIALTY[S.empires[to.owner].race] || []).includes(g) ? ' ★' : ''}`, take)).join('')}</select></label>
        <label>every <select data-k="${k('fevery')}">${T.intervals.map(m => opt(m, fmtTime(realSecs(G.routeEvery(S, m))), every)).join('')}</select></label>
      </div>
      <div class="tr-quote">They send back <b class="good">${gIcon(take)} ${fmt(q.take)} ${esc(gName(take))}</b> per trip
        <span class="muted">(rate ×${q.factor.toFixed(2)}${spec ? ', their specialty' : ''})</span> · trade income <b>🪙 ${q.income}</b> to each realm per trip ·
        trip ${fmtTime(realSecs(2 * G.travelTime(S, 'p', city, to, T.spd)))} there and back · risk ${riskHtml(rk)}
        <button class="small primary" data-act="trNewForeign" data-c="${city.id}" ${q.take < 1 ? 'disabled' : ''}>Open route</button></div>
      <div class="muted tr-sub">Better terms with friendlier realms, bigger markets and their specialties (★). Longer roads pay more income. Every ${T.opinionEvery} trips they like you a little more; breaking a route offends them.</div>
    </div>`;
  };

  const minorForm = city => {
    const targets = G.minorRouteTargets ? G.minorRouteTargets(S, 'p').sort((a, b) => G.dist(a, city) - G.dist(b, city)) : [];
    if (!targets.length) return (G.minorsList && G.minorsList(S).length) ? `<div class="tr-form"><h4>With free cities</h4><p class="muted tr-sub">No free city to trade with yet: find one on the World map (free cities that pay tribute to a realm do not take routes).</p></div>` : '';
    const k = s => `tr_${s}_${city.id}`;
    const toId = targets.some(m => m.id === fv(k('mto'))) ? fv(k('mto')) : targets[0].id;
    const mi = S.minors[toId], kind = DATA.minorKinds[mi.kind] || {};
    const wants = (kind.wants || []).filter(g => visibleGoods().includes(g));
    const good = visibleGoods().includes(fv(k('mgood'))) ? fv(k('mgood')) : (wants[0] || 'grain');
    const cap = G.caravanCap(S, city);
    const amt = Math.max(1, Math.min(cap, parseInt(fv(k('mamt'), Math.min(cap, 200)), 10) || 0));
    const every = fv(k('mevery'), T.defaultEvery);
    const q = G.minorRouteQuote(S, city, mi, { [good]: amt });
    const rk = G.routeRisk(S, { owner: 'p', from: city.id, to: { kind: 'minor', id: toId }, foreign: false });
    return `<div class="tr-form"><h4>With free cities</h4>
      <div class="row">
        <label>To <select data-k="${k('mto')}">${targets.map(m => opt(m.id, `🏰 ${m.name} (${(DATA.minorKinds[m.kind] || {}).name || 'free city'}) · ${G.dist(m, city).toFixed(1)} tiles`, toId)).join('')}</select></label>
        <label>Send <input type="number" min="1" step="50" max="${cap}" data-k="${k('mamt')}" value="${esc(amt)}"></label>
        <label><select data-k="${k('mgood')}">${visibleGoods().map(g => opt(g, `${DATA.goods[g].icon} ${DATA.goods[g].name} (${fmt(city.res[g] || 0)})${wants.includes(g) ? ' ★' : ''}`, good)).join('')}</select></label>
        <label>every <select data-k="${k('mevery')}">${T.intervals.map(m => opt(m, fmtTime(realSecs(G.routeEvery(S, m))), every)).join('')}</select></label>
      </div>
      <div class="tr-quote">Each caravan raises your influence in ${esc(mi.name)} by about <b class="good">+${q.inf.toFixed(1)}</b> <span class="muted">(now ${Math.round(G.minorInf(S, mi, 'p'))}; less as it grows)</span> and earns <b>🪙 ${q.gold}</b>${q.goodsPay ? ` <span class="muted">(the guilds pay ${q.goodsPay} for the goods)</span>` : ''} ·
        trip ${fmtTime(realSecs(2 * G.travelTime(S, 'p', city, mi, T.spd)))} there and back · risk ${riskHtml(rk)}
        <button class="small primary" data-act="trNewMinor" data-c="${city.id}">Open route</button></div>
      <div class="muted tr-sub">The goods are gifts: steady caravans win a free city's favour, and its patron enjoys its boon. ${esc(kind.name || 'Free cities')} want ${wants.map(g => DATA.goods[g].icon + ' ' + DATA.goods[g].name.toLowerCase()).join(', ') || 'many things'} (★); merchant republics pay best.</div>
    </div>`;
  };

  const tradeCard = city => {
    const L = G.lvl(city, 'market');
    const incoming = G.routes(S).filter(r => r.owner === 'p' && r.to.id === city.id);
    if (!L && !incoming.length) return '';
    const mine = G.routesFrom(S, city.id);
    const slots = G.routeSlots(S, city);
    const parts = [`<div class="card tr-card"><div class="row"><h3 style="margin:0">🐪 Trade routes</h3><span class="spacer"></span>
      ${L ? `<span class="pill">${mine.length} / ${slots} routes</span><span class="muted tr-sub">more every ${T.perMarket} market levels</span>` : ''}</div>
      <p class="muted tr-sub">Standing agreements: a caravan leaves on schedule, again and again. Caravans travel the map and brigand camps or enemy armies near the road may ambush them. Send an escort, or clear the camps.</p>`];
    if (mine.length) parts.push(`<div class="tr-scroll"><table class="tr-table"><tr class="tr-head"><th>Route</th><th>Goods</th><th>Every</th><th>Next</th><th>Risk</th><th>Income</th><th></th></tr>${mine.map(r => routeRow(city, r)).join('')}</table></div>`);
    else if (L) parts.push('<p class="muted">No routes from this city yet.</p>');
    if (incoming.length) parts.push(`<p class="tr-sub">Arriving here: ${incoming.map(r => `${esc((S.cities[r.from] || {}).name || '?')} (${goodsHtml(r.goods.give)})`).join(' · ')}</p>`);
    if (L) {
      if (mine.length >= slots) parts.push(`<p class="muted tr-sub">All route slots in ${esc(city.name)} are in use. Raise the Market to level ${(Math.floor(L / T.perMarket) + 1) * T.perMarket} for another.</p>`);
      else parts.push(internalForm(city) + foreignForm(city) + minorForm(city));
    }
    parts.push('</div>');
    return parts.join('');
  };
  MARKET_EXTRAS.push(tradeCard);

  REALM_EXTRAS.push(emp => {
    const rs = G.routesWith(S, 'p', emp.id);
    const earned = rs.reduce((a, r) => a + r.income, 0);
    const partners = G.aiRoutes(S).filter(ar => ar.a === emp.id || ar.b === emp.id).map(ar => S.empires[ar.a === emp.id ? ar.b : ar.a].name);
    const err = G.tradePartnerError(S, 'p', emp.id);
    return `<div class="tr-realm-line">🐪 ${rs.length ? `<b>${rs.length}</b> trade route${rs.length > 1 ? 's' : ''} with you · 🪙 ${fmt(earned)} earned` : `<span class="muted">No trade routes with you${err ? ` (${esc(err.toLowerCase())})` : ''}</span>`}${partners.length ? ` <span class="muted">· trades with the ${partners.map(esc).join(' and the ')}</span>` : ''}</div>`;
  });

  const intOf = (k, d) => parseInt(fv(k, d), 10);
  Object.assign(act, {
    trPause: d => { toast(G.pauseRoute(S, d.r)); render(true); },
    trCancel: d => {
      const r = G.routeById(S, d.r);
      if (!r) return;
      if (r.foreign && !confirm(`Break the trade route with the ${S.empires[r.to.owner].name}? They will resent it (−${T.breakPenalty} opinion).`)) return;
      toast(G.cancelRoute(S, d.r, 'cancelled', true) || 'Route cancelled'); render(true);
    },
    trEscort: d => {
      const r = G.routeById(S, d.r); if (!r) return;
      const city = S.cities[r.from];
      const u = fv('tr_eu_' + r.id, Object.keys(r.escort || {})[0] || escortUnits(city)[0]);
      const n = Math.max(0, intOf('tr_en_' + r.id, 10) || 0);
      toast(G.setEscort(S, r.id, n ? { [u]: n } : {}) || (n ? `Escort: ${n} ${DATA.units[u].name}` : 'Escort removed')); render(true);
    },
    trNewInternal: d => {
      const city = S.cities[d.c]; const k = s => `tr_${s}_${city.id}`;
      const others = G.citiesOf(S, 'p').filter(c => c.id !== city.id);
      const to = others.some(c => c.id === fv(k('to'))) ? fv(k('to')) : (others[0] || {}).id;
      const r = G.createRoute(S, 'p', city.id, to, { give: { [fv(k('good'), 'ore')]: intOf(k('amt'), Math.min(G.caravanCap(S, city), 200)) }, every: +fv(k('every'), T.defaultEvery) });
      toast(typeof r === 'string' ? r : `Route opened to ${S.cities[to].name}`); render(true);
    },
    trNewMinor: d => {
      const city = S.cities[d.c]; const k = s => `tr_${s}_${city.id}`;
      const targets = G.minorRouteTargets(S, 'p').sort((a, b) => G.dist(a, city) - G.dist(b, city));
      const toId = targets.some(m => m.id === fv(k('mto'))) ? fv(k('mto')) : (targets[0] || {}).id;
      if (!toId) return toast('No free city to trade with');
      const mi = S.minors[toId], wants = ((DATA.minorKinds[mi.kind] || {}).wants || []).filter(g => visibleGoods().includes(g));
      const good = visibleGoods().includes(fv(k('mgood'))) ? fv(k('mgood')) : (wants[0] || 'grain');
      const cap = G.caravanCap(S, city);
      const amt = Math.max(1, Math.min(cap, intOf(k('mamt'), Math.min(cap, 200)) || 0));
      const r = G.createRoute(S, 'p', city.id, toId, { give: { [good]: amt }, every: +fv(k('mevery'), T.defaultEvery) });
      toast(typeof r === 'string' ? r : `Trade route opened to ${mi.name}`); render(true);
    },
    trNewForeign: d => {
      const city = S.cities[d.c]; const k = s => `tr_${s}_${city.id}`;
      const targets = G.routeTargets(S, 'p').sort((a, b) => G.dist(a, city) - G.dist(b, city));
      const toId = targets.some(c => c.id === fv(k('fto'))) ? fv(k('fto')) : (targets[0] || {}).id;
      if (!toId) return toast('No partner available');
      const to = S.cities[toId], takes = G.routeTakeGoods(S, 'p', to.owner);
      const give = fv(k('fgive'), 'grain');
      let take = fv(k('ftake'), takes.find(g => g !== give));
      if (!takes.includes(take) || take === give) take = takes.find(g => g !== give);
      const cap = G.caravanCap(S, city);
      const amt = Math.max(1, Math.min(cap, intOf(k('famt'), Math.min(cap, 300)) || 0));
      const r = G.createRoute(S, 'p', city.id, toId, { give: { [give]: amt }, takeGood: take, every: +fv(k('fevery'), T.defaultEvery) });
      toast(typeof r === 'string' ? r : `Trade route opened with the ${S.empires[to.owner].name}`); render(true);
    },
  });
  // selects re-render at once so the quote and risk follow the choice
  document.addEventListener('change', ev => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (!k || !k.startsWith('tr_') || UI.tab === 'world') return;
    UI.form[k] = ev.target.value;
    ev.target.blur(); render(true);
  });
})();
