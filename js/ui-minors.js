// =====================================================================
//  Free Cities tab, the free-city tile panel (takes over the world-map
//  panel for a free city's tile), realm-card and empire-card lines.
// =====================================================================
'use strict';

(() => {
  // a few styles of our own (the shared stylesheet stays untouched)
  if (typeof document !== 'undefined' && !document.getElementById('fc-style')) {
    const st = document.createElement('style');
    st.id = 'fc-style';
    st.textContent = `
      .fc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 12px; }
      .fc-grid > .card { margin: 0; }
      .fc-head { display: flex; gap: 10px; align-items: center; }
      .fc-emblem { font-size: 26px; width: 42px; height: 42px; flex: 0 0 42px; display: grid; place-items: center; border-radius: 50%; border: 2px solid var(--line); background: var(--panel2); }
      .fc-head h3 { margin: 0; }
      .fc-sub { font-size: 12.5px; }
      .fc-inf { margin: 8px 0 4px; font-size: 12.5px; }
      .fc-inf .fc-row { display: grid; grid-template-columns: minmax(70px, 34%) 1fr 36px; gap: 6px; align-items: center; margin: 3px 0; }
      .fc-inf .fc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .fc-bar { position: relative; height: 9px; background: var(--panel2); border: 1px solid var(--line); border-radius: 5px; overflow: hidden; }
      .fc-bar > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; }
      .fc-bar > b { position: absolute; top: -1px; bottom: -1px; width: 1px; background: var(--muted); opacity: .7; }
      .fc-req { margin: 8px 0; padding: 7px 9px; border-radius: 8px; border: 1px dashed var(--line); font-size: 12.5px; }
      .fc-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .fc-actions button { min-height: 34px; }
      .fc-boon { font-size: 12.5px; margin: 6px 0 0; }
      .fc-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line); font-size: 12px; background: var(--panel2); }
      .fc-chip i { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
    `;
    document.head.appendChild(st);
  }

  const MM = () => G.MINORS;
  const kindOf = mi => DATA.minorKinds[mi.kind];
  const seen = mi => !!S.explored[mi.y * S.map + mi.x];
  const ownerName = o => (o === 'p' ? 'You' : (S.empires[o] ? S.empires[o].name : 'Unknown'));
  const ownerColor = o => (S.empires[o] && S.empires[o].color) || 'var(--muted)';
  const chip = (o, label) => `<span class="fc-chip"><i style="background:${ownerColor(o)}"></i>${esc(label || ownerName(o))}</span>`;
  const nearestDist = mi => Math.min(Infinity, ...G.citiesOf(S, 'p').map(c => G.dist(c, mi)));

  const statusHtml = mi => {
    const st = G.minorStatus(S, mi, 'p');
    if (mi.subject) return st === 'subject' ? '<span class="pill good">Pays you tribute</span>' : `<span class="pill bad">Subject of the ${esc(S.empires[mi.subject].name)}</span>`;
    const pat = mi.patron ? `Patron: ${chip(mi.patron)}${mi.ally ? ' <span class="muted">(allied)</span>' : ''}` : '<span class="muted">No patron</span>';
    const mine = st === 'ally' ? '<span class="pill good">🤝 Your ally</span>' : st === 'patron' ? '<span class="pill good">👑 You are patron</span>' : st === 'friend' ? '<span class="pill">Friendly</span>' : '';
    return `${mine} ${pat}`;
  };

  // your influence against the strongest rival (with the patron / ally thresholds marked)
  const influenceHtml = mi => {
    if (mi.subject) return '';
    const mine = G.minorInf(S, mi, 'p');
    const rival = G.minorRanking(S, mi).find(r => r.owner !== 'p');
    const row = (o, v, label) => `<div class="fc-row"><span class="fc-name">${o ? chip(o, label) : esc(label)}</span>
      <div class="fc-bar" title="${Math.round(v)} / 100"><i style="width:${v}%;background:${o ? ownerColor(o) : 'var(--muted)'}"></i><b style="left:${MM().patronMin}%"></b><b style="left:${MM().allyMin}%"></b></div><span>${Math.round(v)}</span></div>`;
    const grudge = (mi.grudge.p || 0) > S.time ? `<div class="bad">They remember your attack: gifts count for little for ${fmtTime(realSecs(mi.grudge.p - S.time))}.</div>` : '';
    return `<div class="fc-inf">${row('p', mine, 'You')}${rival ? row(rival.owner, rival.inf) : row(null, 0, 'No rival')}
      <div class="muted" style="font-size:11.5px">Patron at ${MM().patronMin}+ (most influence) · ally at ${MM().allyMin}+. Influence fades slowly.</div>${grudge}</div>`;
  };

  const goodsName = g => `${DATA.goods[g].icon} ${DATA.goods[g].name}`;
  const requestHtml = (mi, city) => {
    const r = mi.req;
    if (mi.subject) return '';
    if (!r) return `<div class="fc-req muted">No request at the moment.</div>`;
    const info = DATA.minorRequestInfo[r.type];
    const left = fmtTime(realSecs(Math.max(0, r.expires - S.time)));
    let body = '', btn = '';
    if (r.type === 'deliver') {
      body = `Deliver <b>${r.amount} ${goodsName(r.good)}</b> — by caravan from any city, or straight from a city within 15 tiles.`;
      const cands = [city, ...G.citiesOf(S, 'p').filter(c => c !== city)];
      const okc = cands.find(c => G.minorDeliverStatus(S, 'p', mi.id, c.id).ok);
      const st = G.minorDeliverStatus(S, 'p', mi.id, city.id);
      btn = okc ? `<button class="small primary" data-act="fcDeliver" data-m="${mi.id}" data-c="${okc.id}">📦 Deliver from ${esc(okc.name)}</button>`
        : `<span class="muted">${esc(st.reason || '')}</span>`;
    } else {
      body = r.type === 'clear' ? `Destroy the brigand camp at <b>(${r.x}, ${r.y})</b> (tier ${r.tier}).` : `Raiders gather at <b>(${r.x}, ${r.y})</b>. Destroy them before they strike!`;
      btn = `<button class="small" data-act="goTile" data-x="${r.x}" data-y="${r.y}" data-m="attack">⚔️ Go to the camp</button>`;
    }
    return `<div class="fc-req">${info.icon} <b>${info.name}</b> <span class="muted">· ${left} left · reward +${r.reward} influence, ${r.gold} gold</span><br>${body}<div class="fc-actions">${btn}</div></div>`;
  };

  const actionsHtml = (mi, city) => {
    if (mi.subject) return mi.subject === 'p' ? `<p class="muted fc-sub">Tribute: ${fmtRate(G.minorTribute(S, mi))} gold/min. Its boon is lost while it serves under the yoke.</p>` : '';
    const gold = S.empires.p.gold;
    const gifts = G.minorGiftOptions(S).map(v => `<button class="small" data-act="fcGift" data-m="${mi.id}" data-g="${v}" ${gold < v ? 'disabled' : ''} title="About +${G.minorGiftPreview(S, mi, 'p', v).toFixed(1)} influence">🪙 ${fmt(v)}</button>`).join('');
    let hire = '';
    if (mi.kind === 'mercenary') {
      const st = G.minorHireStatus(S, 'p', mi.id, city.id), q = G.minorHireQuote(S, 'p', mi.id);
      if (q) hire = `<button class="small ${st.ok ? 'primary' : ''}" data-act="fcHire" data-m="${mi.id}" ${st.ok ? '' : 'disabled'} title="${esc(st.ok ? `They march to ${city.name}` : st.reason)}">⚔️ Hire ${q.n} ${DATA.units[q.unit].icon} ${esc(DATA.units[q.unit].name)} · ${fmt(q.gold)} 🪙</button>`
        + (st.ok ? '' : `<span class="muted fc-sub">${esc(st.reason)}</span>`);
    }
    return `<div class="fc-actions"><span class="muted fc-sub" style="align-self:center">Send envoys with gifts:</span>${gifts}</div>${hire ? `<div class="fc-actions">${hire}</div>` : ''}`;
  };

  const boonHtml = mi => {
    const k = kindOf(mi);
    return `<p class="fc-boon"><b>Patron:</b> ${esc(k.boon)}.<br><b>Ally:</b> ${esc(k.allyBoon)}.</p>`;
  };

  const headHtml = (mi, city, tag) => {
    const k = kindOf(mi);
    const race = DATA.races[mi.race];
    const ring = mi.subject ? ownerColor(mi.subject) : mi.patron ? ownerColor(mi.patron) : 'var(--line)';
    const pic = ptHtml({ race: mi.race, kind: 'ruler', seed: mi.name, color: k.color, era: Math.max(1, Math.min(3, mi.size || 1)) }, 56, 'pt-card', `Ruler of ${mi.name}`);
    return `<div class="fc-head">${pic ? `<div class="pt-badged">${pic}<span class="pt-badge" style="border-color:${ring}" title="${esc(k.name)}">${k.icon}</span></div>` : `<span class="fc-emblem" style="border-color:${ring}">${k.icon}</span>`}
      <div style="min-width:0"><${tag}>${esc(mi.name)}</${tag}>
        <div class="muted fc-sub">${esc(k.name)} · ${esc(race ? race.adj || race.name : '')} folk · (${mi.x}, ${mi.y}) · ${G.dist(city, mi).toFixed(1)} tiles from ${esc(city.name)}</div></div></div>`;
  };

  const cardHtml = (mi, city) => `<div class="card">${headHtml(mi, city, 'h3')}
      <div style="margin-top:6px">${statusHtml(mi)}</div>
      ${influenceHtml(mi)}${boonHtml(mi)}${requestHtml(mi, city)}${actionsHtml(mi, city)}
      <div class="fc-actions"><button class="small" data-act="goTile" data-x="${mi.x}" data-y="${mi.y}">🗺️ Show on map</button></div></div>`;

  // ---- the tab ----
  const renderMinors = city => {
    const all = G.minorsList(S);
    const known = all.filter(seen).sort((a, b) => nearestDist(a) - nearestDist(b));
    const hidden = all.length - known.length;
    const mine = known.filter(mi => mi.patron === 'p');
    const boons = G.minorBoons(S, 'p');
    const boonList = Object.entries(boons).filter(([, v]) => Math.abs(v - 1) > 1e-6).map(([k, v]) => `${k} ×${v.toFixed(2)}`).join(' · ');
    return `<div class="card"><h2 style="margin-top:0">🏰 Free Cities</h2>
        <p class="muted" style="font-size:13px;margin:0">Free cities answer to no crown. Court them with gold, caravans and help with their requests: the realm with the most influence (at least ${MM().patronMin}) becomes their <b>patron</b> and gains a boon; at ${MM().allyMin} they become an <b>ally</b> and the boon doubles, with gifts now and then. Rivals court them too. You can also storm one — each victory wears down its resolve until it falls to you — but every other free city and realm will remember.</p>
        <p style="font-size:13px;margin:8px 0 0">You are patron of <b>${mine.length}</b> of ${known.length} known free cities${hidden ? ` · ${hidden} not yet discovered` : ''}.${boonList ? `<br><span class="muted">Your boons: ${esc(boonList)}</span>` : ''}</p></div>
      ${known.length ? `<div class="fc-grid">${known.map(mi => cardHtml(mi, city)).join('')}</div>` : '<div class="card"><p class="muted">No free city has been found yet. Explore with scouts — they stand in the wilds between the realms.</p></div>'}`;
  };
  {
    const tab = {
      label: '🏰 Free Cities',
      render: renderMinors,
      badge: () => (S && S.minors ? Object.values(S.minors).filter(mi => mi.req && !mi.subject && seen(mi) && nearestDist(mi) <= 15).length : 0),
    };
    // sit right after Diplomacy (and Espionage, if it follows Diplomacy)
    const entries = Object.entries(TABS).filter(([k]) => k !== 'minors');
    for (const [k] of entries) delete TABS[k];
    const anchor = entries.some(([k]) => k === 'espionage') ? 'espionage' : 'diplomacy';
    let placed = false;
    for (const [k, v] of entries) { TABS[k] = v; if (k === anchor) { TABS.minors = tab; placed = true; } }
    if (!placed) TABS.minors = tab;
  }

  // ---- world-map tile panel for a free city ----
  TILE_PANELS.push((city, t, vis) => {
    const mi = G.minorAt(S, t);
    if (!mi) return '';
    const k = kindOf(mi);
    const modes = mi.subject === 'p' ? ['trade', 'scout'] : ['trade', 'scout', 'raid', 'attack', 'conquer'];
    const est = G.minorGarrisonTarget(S, mi);
    const intel = typeof intelHtml === 'function' ? intelHtml(t) : '';
    return `${headHtml(mi, city, 'h3')}
      <p class="fc-sub" style="margin:6px 0">${esc(k.desc)}</p>
      <div>${statusHtml(mi)}</div>
      ${influenceHtml(mi)}${boonHtml(mi)}${requestHtml(mi, city)}${actionsHtml(mi, city)}
      <p class="fc-sub" style="margin:8px 0 2px">🛡️ Walls ${mi.wall} · resolve <b>${Math.round(mi.resolve)}</b>/100 · garrison of perhaps ${Math.round(est * 0.8)}–${Math.round(est * 1.1)}.</p>
      ${intel}
      <p class="muted fc-sub">Caravans count as gifts (and deliveries). Raids and assaults anger every free city; each won assault lowers resolve, and at 0 the city falls — it becomes yours if you have a city slot to spare, or pays tribute.</p>
      ${sendForm(city, t, modes)}`;
  });

  // ---- realm cards and the empire tab ----
  REALM_EXTRAS.push(e => {
    if (!S || !S.minors) return '';
    const pats = Object.values(S.minors).filter(mi => mi.patron === e.id && seen(mi));
    const subs = Object.values(S.minors).filter(mi => mi.subject === e.id && seen(mi));
    if (!pats.length && !subs.length) return '';
    return `<div style="font-size:12.5px">🏰 ${pats.length ? `Patron of ${pats.map(mi => `${kindOf(mi).icon} ${esc(mi.name)}`).join(', ')}` : ''}${subs.length ? `${pats.length ? ' · ' : ''}Tribute from ${subs.map(mi => esc(mi.name)).join(', ')}` : ''}</div>`;
  });
  EMPIRE_EXTRAS.push(() => {
    if (!S || !S.minors) return '';
    const pats = G.minorsOf(S, 'p'), subs = G.minorSubjects(S, 'p');
    if (!pats.length && !subs.length) return '';
    return `<div class="card"><h3>🏰 Free cities</h3>${pats.map(mi => `<div style="font-size:13px">${kindOf(mi).icon} <b>${esc(mi.name)}</b> ${mi.ally ? '<span class="good">ally</span>' : '<span class="muted">patron</span>'} — ${esc(mi.ally ? kindOf(mi).allyBoon : kindOf(mi).boon)}</div>`).join('')}
      ${subs.map(mi => `<div style="font-size:13px">⛓️ <b>${esc(mi.name)}</b> pays ${fmtRate(G.minorTribute(S, mi))} gold/min in tribute</div>`).join('')}
      <div class="row" style="margin-top:6px"><button class="small" data-act="tab" data-t="minors">Open Free Cities</button></div></div>`;
  });

  Object.assign(act, {
    fcGift: d => { toast(G.minorGift(S, 'p', d.m, +d.g) || `Your envoys bring ${d.g} gold to ${S.minors[d.m].name}`); render(true); },
    fcDeliver: d => { toast(G.minorDeliver(S, 'p', d.m, d.c) || 'Delivered — they are grateful'); render(true); },
    fcHire: d => { toast(G.minorHire(S, 'p', d.m, UI.city) || 'The company is on its way'); render(true); },
  });
})();
