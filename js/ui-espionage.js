// =====================================================================
//  Espionage tab: your spies, recruiting, missions in the field, city
//  guards and dossiers; mission buttons on rival cities in the world-map
//  tile panel; a line on Diplomacy realm cards.
// =====================================================================
'use strict';
(() => {
  const OWNER = 'p';
  const STATUS = { training: '🎓 In training', idle: '🏠 At home (guarding)', travel: '🚶 On the road', work: '🕯️ At work', return: '↩️ Coming home' };

  const spies = () => G.spiesOf(S, OWNER).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const idleSpies = () => spies().filter(x => x.status === 'idle');
  const chosenSpy = () => {
    const idle = idleSpies();
    const sp = idle.find(x => x.id === UI.form.es_spy);
    return sp || idle[0] || null;
  };
  const left = t => fmtTime(Math.max(0, realSecs(t - S.time)));
  const chance = p => `<span class="${p >= 0.6 ? 'good' : p >= 0.35 ? '' : 'bad'}">${Math.round(p * 100)}%</span>`;
  const empName = o => o === OWNER ? 'you' : (S.empires[o] ? S.empires[o].name : 'a realm');

  const spySpec = sp => ({ race: S.empires[OWNER].race, kind: 'spy', seed: sp.name, color: S.empires[OWNER].color, rank: Math.min(10, sp.level || 0), era: G.techEra(S, OWNER) });
  const spyRow = sp => {
    const t = sp.task, tgt = t && S.cities[t.target];
    const next = G.spyXpNext(sp);
    const where = sp.status === 'training' ? `ready in ${left(sp.ready)}`
      : t ? `${DATA.missions[t.type].icon} ${DATA.missions[t.type].name}${tgt ? ' · ' + esc(tgt.name) : ''} · ${left(t.t1)}`
      : esc((S.cities[sp.home] || {}).name || '');
    const btn = sp.status === 'idle' || sp.status === 'training' ? `<button class="small" data-act="esDismiss" data-id="${sp.id}" title="Send this spy back to ordinary life (returns ${G.SPY_POP} citizens)">Dismiss</button>`
      : sp.status !== 'return' ? `<button class="small" data-act="esRecall" data-id="${sp.id}">Recall</button>` : '';
    const pic = ptHtml(spySpec(sp), 40, 'pt-card', sp.name);
    return `<tr><td>${pic ? `<div class="pt-champ">${pic}<div>` : ''}<b>${esc(sp.name)}</b><div class="muted" style="font-size:11.5px">level ${sp.level}${next ? ` · ${sp.xp}/${next} xp` : ' · master'}</div>${pic ? '</div></div>' : ''}</td><td>${STATUS[sp.status] || sp.status}<div class="muted" style="font-size:11.5px">${where}</div></td><td>${btn}</td></tr>`;
  };

  const missionPicker = (target, compact) => {
    const sp = chosenSpy();
    if (!sp) {
      const n = spies().length;
      return `<p class="muted" style="font-size:12.5px">${n ? 'All your spies are busy.' : "You have no spies. Build a Spymaster's Den (Town Hall 3) and recruit some in the 🕵️ Espionage tab."}</p>`;
    }
    const idle = idleSpies();
    const sel = idle.length > 1 ? `<select data-k="es_spy">${idle.map(x => `<option value="${x.id}" ${x.id === sp.id ? 'selected' : ''}>${esc(x.name)} (level ${x.level})</option>`).join('')}</select>` : `<span>${ptHtml(spySpec(sp), 28, 'pt-inline', sp.name)} ${esc(sp.name)} (level ${sp.level})</span>`;
    const rows = DATA.missionOrder.map(k => {
      const md = DATA.missions[k];
      const st = G.missionStatus(S, sp.id, target.id, k);
      const info = st.chance !== undefined ? `${chance(st.chance)} · ${fmtTime(realSecs((st.travel || 0) + (st.time || 0)))} · 🪙 ${fmt(st.cost.gold)}` : '';
      return `<tr title="${esc(md.desc)}"><td>${md.icon} ${md.name}${compact ? '' : `<div class="muted" style="font-size:11.5px">${esc(md.desc)}</div>`}</td><td style="font-size:12.5px">${info}${!st.ok ? `<div class="muted" style="font-size:11.5px">${esc(st.reason)}</div>` : ''}</td>
        <td><button class="small ${st.ok ? 'primary' : ''}" ${st.ok ? '' : 'disabled'} data-act="esSend" data-spy="${sp.id}" data-c="${target.id}" data-m="${k}">Send</button></td></tr>`;
    }).join('');
    return `<div class="row" style="margin:4px 0">Agent: ${sel}</div><table class="es-missions">${rows}</table>
      <p class="muted" style="font-size:11.5px">Odds weigh your spy's skill against the city's counter-intelligence (its den and the spies guarding it). Failed spies may be caught, and the realm will know who sent them.</p>`;
  };

  const dossierCard = d => {
    const c = S.cities[d.city];
    return `<div class="es-dossier"><b>${esc(d.name)}</b> <span class="muted" style="font-size:11.5px">(${esc(empName(d.owner))}) · ${fmtTime(realSecs(S.time - d.t))} ago</span>
      ${c ? ` <button class="link" data-act="esShow" data-x="${c.x}" data-y="${c.y}">map</button>` : ''}<div style="font-size:12.5px">${esc(G.dossierText(S, d))}</div></div>`;
  };

  const renderEspionage = city => {
    const E = G.espState(S);
    const mine = spies();
    const cap = G.spyCap(S, OWNER);
    const st = G.recruitStatus(S, city.id);
    const recruit = st.locked
      ? `<p class="muted">Build a Spymaster's Den in ${esc(city.name)} (Town Hall 3, in the Intrigue group of the City tab) to recruit spies here.</p>`
      : `<div class="row">${costHtml(st.cost, city)}<span class="muted" style="font-size:12.5px">+ ${G.SPY_POP} citizens · ${fmtTime(realSecs(st.time))}</span>
          <button class="primary" ${st.ok ? '' : 'disabled'} data-act="esRecruit" data-c="${city.id}">Recruit a spy</button></div>${!st.ok ? `<p class="muted" style="font-size:12.5px">${esc(st.reason)}</p>` : ''}`;
    const fx = G.spyRaceFx(S, OWNER);
    const raceNote = fx && fx.note ? `<p class="muted" style="font-size:12.5px">${esc(fx.note)}</p>` : '';
    const stats = (E.stats[OWNER] || {});
    const guards = G.citiesOf(S, OWNER).map(c => `<tr><td><button class="link" data-act="city" data-c="${c.id}">${esc(c.name)}</button></td><td>${G.lvl(c, 'hideout') || '—'}</td><td>${G.cityGuards(S, c).length}</td><td>${G.counterIntel(S, c).toFixed(2)}</td></tr>`).join('');
    const dossiers = Object.values(E.dossiers[OWNER] || {}).sort((a, b) => b.t - a.t).slice(0, 6);
    const feed = E.feed.slice(0, 14).map(f => `<li class="${f.kind === 'ok' || f.kind === 'caught' ? 'good' : f.kind === 'hit' ? 'bad' : 'muted'}"><span class="muted" style="font-size:11px">${fmtTime(realSecs(S.time - f.t))} ago</span> ${esc(f.text)}</li>`).join('');
    // target picker for the tab itself: rival cities you have seen
    const targets = Object.values(S.cities).filter(c => c.owner !== OWNER && S.explored[c.y * S.map + c.x] && S.empires[c.owner] && !S.empires[c.owner].dead).sort((a, b) => G.dist(city, a) - G.dist(city, b));
    const tgt = targets.find(c => c.id === UI.form.es_target) || targets[0];
    return `<div class="card"><h3>🕵️ Spies <span class="muted" style="font-size:13px">${mine.length}/${cap}</span></h3>
        ${raceNote}${recruit}
        ${mine.length ? `<table>${mine.map(spyRow).join('')}</table>` : ''}
        <p class="muted" style="font-size:12px">Missions: ${stats.ok || 0} succeeded · ${stats.fail || 0} failed · ${(E.caught[OWNER] || 0)} enemy spies caught.</p></div>
      <div class="card"><h3>🎯 Send a spy</h3>
        ${targets.length ? `<div class="row">Target: <select data-k="es_target">${targets.map(c => `<option value="${c.id}" ${c === tgt ? 'selected' : ''}>${esc(c.name)} — ${esc(S.empires[c.owner].name)} (${G.dist(city, c).toFixed(0)} tiles)</option>`).join('')}</select></div>${missionPicker(tgt)}`
          : '<p class="muted">You have not seen any rival city yet. Scout the world first.</p>'}
        <p class="muted" style="font-size:11.5px">You can also open a rival city on the 🗺️ World map and send a spy from there.</p></div>
      <div class="card"><h3>🛡️ Counter-intelligence</h3><p class="muted" style="font-size:12.5px">Spies at home guard their city. A bigger den, more guards and the Ciphers & Watchmen technique make enemy agents fail and get caught.</p>
        <table><tr><th>City</th><th>Den</th><th>Guards</th><th>Defence</th></tr>${guards}</table></div>
      ${dossiers.length ? `<div class="card"><h3>📁 Dossiers</h3>${dossiers.map(dossierCard).join('')}</div>` : ''}
      <div class="card"><h3>📜 Whispers</h3>${feed ? `<ul class="es-feed">${feed}</ul>` : '<p class="muted">Nothing yet.</p>'}</div>`;
  };

  // ---- tab placement: after Diplomacy ----------------------------------
  {
    const entries = Object.entries(TABS).filter(([k]) => k !== 'espionage');
    for (const [k] of entries) delete TABS[k];
    const tab = { label: '🕵️ Espionage', render: renderEspionage, badge: () => 0 };
    const anchor = ['diplomacy', 'magic', 'religion'].find(a => entries.some(([k]) => k === a));
    let placed = false;
    for (const [k, v] of entries) { TABS[k] = v; if (k === anchor) { TABS.espionage = tab; placed = true; } }
    if (!placed) TABS.espionage = tab;
  }

  // ---- world-map tile panel: missions against a rival city --------------
  TILE_EXTRAS.push((city, t) => {
    const c = t.city && S.cities[t.city];
    if (!c || c.owner === OWNER || !S.empires[c.owner] || S.empires[c.owner].dead) return '';
    const open = UI.form.es_open === c.id;
    return `<details class="es-tile" ${open ? 'open' : ''} data-es="${c.id}"><summary>🕵️ Spies</summary>${missionPicker(c, true)}</details>`;
  });
  document.addEventListener('toggle', ev => {
    const el = ev.target;
    if (el && el.dataset && el.dataset.es) { if (el.open) UI.form.es_open = el.dataset.es; else if (UI.form.es_open === el.dataset.es) delete UI.form.es_open; }
  }, true);

  // ---- Diplomacy realm cards ------------------------------------------
  REALM_EXTRAS.push(emp => {
    if (!emp || emp.id === OWNER) return '';
    const E = G.espState(S);
    const caught = Object.values(E.feed).filter(f => f.kind === 'caught' && f.owner === emp.id).length;
    const known = Object.values(E.dossiers[OWNER] || {}).filter(d => d.owner === emp.id).length;
    if (!caught && !known) return '';
    return `<div class="muted" style="font-size:12px">🕵️ ${known ? `${known} dossier${known > 1 ? 's' : ''}` : ''}${known && caught ? ' · ' : ''}${caught ? `${caught} of their spies caught recently` : ''}</div>`;
  });

  // ---- actions --------------------------------------------------------
  Object.assign(act, {
    esRecruit: d => { const e = G.recruitSpy(S, d.c); toast(e || '🕵️ A new spy begins training'); render(true); },
    esDismiss: d => { const e = G.dismissSpy(S, d.id); toast(e || 'The spy returns to ordinary life'); render(true); },
    esRecall: d => { const e = G.recallSpy(S, d.id); toast(e || 'The spy is called home'); render(true); },
    esSend: d => {
      const sp = G.espState(S).spies[d.spy], c = S.cities[d.c];
      const e = G.sendSpy(S, d.spy, d.c, d.m);
      toast(e || `🕵️ ${sp ? sp.name : 'Your spy'} sets out for ${c ? c.name : 'the city'}: ${DATA.missions[d.m].name}`);
      render(true);
    },
    esShow: d => { UI.tab = 'world'; UI.sel = { x: +d.x, y: +d.y }; window.scrollTo(0, 0); render(true); },
  });
  document.addEventListener('change', ev => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (!k || !k.startsWith('es_')) return;
    UI.form[k] = ev.target.value;
    ev.target.blur(); render(true);
  });

  const css = document.createElement('style');
  css.textContent = `.es-missions td{vertical-align:top;padding:3px 4px}.es-missions button.small{white-space:nowrap}
    .es-dossier{border-top:1px dashed rgba(120,90,50,.3);padding:6px 0}.es-feed{margin:0;padding-left:18px;font-size:12.5px}.es-feed li{margin:2px 0}
    details.es-tile{margin:6px 0;border:1px solid rgba(120,90,50,.3);border-radius:6px;padding:4px 8px}details.es-tile summary{cursor:pointer;font-weight:600}
    @media (max-width:700px){.es-missions td{font-size:12px}}`;
  document.head.appendChild(css);
})();
