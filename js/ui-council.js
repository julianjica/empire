// =====================================================================
//  The Royal Council tab, the council chip in the top bar and the
//  governor control in the city header. Rules live in js/council.js.
// =====================================================================
'use strict';
(() => {
  // ---- styles (scoped by the cn- prefix) -----------------------------------
  const style = document.createElement('style');
  style.textContent = `
  .cn-chip{display:inline-flex;align-items:center;gap:4px}
  .cn-chip.urgent{border-color:var(--bad);color:var(--bad);font-weight:600}
  .cn-chip .cn-n{background:var(--bad);color:#fff;border-radius:99px;padding:0 6px;font-size:11px}
  .cn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:12px}
  .cn-grid .card{margin:0}
  .cn-head{display:flex;gap:10px;align-items:center;margin-bottom:8px}
  .cn-portrait{position:relative;flex:0 0 auto;width:48px;height:48px;border-radius:50%;border:2px solid var(--accent);background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:24px}
  .cn-portrait .cn-ini{position:absolute;right:-4px;bottom:-4px;background:var(--panel);border:1px solid var(--line);border-radius:99px;font:600 10px/1 var(--ui);padding:2px 4px;color:var(--ink)}
  .cn-who b{display:block;font-size:15px}
  .cn-who span{font-size:12px}
  .cn-item{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:flex-start;padding:7px 0;border-top:1px solid var(--line)}
  .cn-item:first-of-type{border-top:0}
  .cn-dot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;margin-top:6px;background:var(--muted)}
  .cn-hi .cn-dot{background:var(--bad)} .cn-mid .cn-dot{background:var(--warn)}
  .cn-text{flex:1 1 200px;font-size:13.5px;line-height:1.35}
  .cn-hi .cn-text{font-weight:600}
  .cn-btns{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
  .cn-adv{font-size:11px;color:var(--muted);display:block}
  .cn-quiet{font-style:italic;font-size:13px;margin:4px 0 0}
  .cn-gov{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
  .cn-gov:first-of-type{border-top:0}
  .cn-gov .cn-name{min-width:120px;font-weight:600}
  .cn-gov input[type=number]{width:80px}
  .cn-gov label{display:inline-flex;gap:4px;align-items:center;font-size:12.5px}
  .cn-gov .cn-status{flex:1 1 100%;font-size:12px}
  .cn-realm{color:var(--good)}
  .cn-log{flex:1 1 100%;font-size:12px;margin:0;padding-left:18px}
  .cn-cityrow{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin-top:6px;font-size:12.5px}
  .cn-cityrow select{max-width:170px}
  .cn-cityrow input[type=number]{width:72px}
  .cn-cityrow label,.cn-realmbox{display:inline-flex;gap:4px;align-items:center;white-space:nowrap}
  @media (max-width:640px){.cn-grid{grid-template-columns:1fr}.cn-btns{margin-left:17px}.cn-gov .cn-name{min-width:0;flex:1 1 100%}}
  `;
  document.head.appendChild(style);

  const URG = () => G.COUNCIL.urgent;
  const lvl = p => p >= URG() ? 'cn-hi' : p >= 45 ? 'cn-mid' : 'cn-lo';
  const DEEDS = ['build', 'cast', 'train', 'placate', 'tax'];
  const textOf = it => esc(it.at ? it.text.replace('{eta}', fmtTime(realSecs(it.at - S.time))) : it.text);
  const portrait = k => {
    const c = G.councilor(S, k);
    const emp = S.empires.p;
    const pic = ptHtml({ race: emp.race, kind: 'advisor', role: k, seed: c.name, color: emp.color, era: G.techEra(S, 'p') }, 60, 'pt-card', `${c.title} ${c.name}, ${c.role}`);
    if (pic) return `<div class="pt-badged">${pic}<span class="pt-badge" aria-hidden="true">${c.icon}</span></div>`;
    return `<div class="cn-portrait" style="border-color:${DATA.races[S.empires.p.race].color}" aria-hidden="true">${c.icon}<span class="cn-ini">${esc(c.initials)}</span></div>`;
  };
  const itemHtml = (it, showWho) => {
    const a = it.action;
    const who = showWho ? `<span class="cn-adv">${esc(G.councilor(S, it.advisor).role)}</span>` : '';
    return `<div class="cn-item ${lvl(it.priority)}"><span class="cn-dot" title="Priority ${it.priority}"></span>
      <div class="cn-text">${who}${textOf(it)}</div>
      <div class="cn-btns">${a ? `<button class="small ${DEEDS.includes(a.kind) ? 'primary' : ''}" data-act="cnGo" data-id="${esc(it.id)}">${esc(a.label || 'Go')}</button>` : ''}
        <button class="small" data-act="cnSnooze" data-id="${esc(it.id)}" title="Snooze for ${G.COUNCIL.snoozeMins} game-minutes">💤</button>
        <button class="small" data-act="cnDismiss" data-id="${esc(it.id)}" title="Dismiss until the situation changes">✕</button></div></div>`;
  };

  // ---- governor controls -----------------------------------------------------
  const focusSelect = (c, g) => `<select data-k="gov_focus_${c.id}" aria-label="Governor of ${esc(c.name)}">
      <option value="off" ${!g || !g.on ? 'selected' : ''}>✋ Manual (no governor)</option>
      ${DATA.govFocusOrder.map(f => `<option value="${f}" ${g && g.on && g.focus === f ? 'selected' : ''}>${DATA.govFocus[f].icon} ${DATA.govFocus[f].name}</option>`).join('')}
    </select>`;
  const govStatus = (c, g) => {
    if (!g || !g.on) return '<span class="muted">You choose every building.</span>';
    const last = g.log && g.log[0];
    const wait = g.wait && c.buildQueue.length < G.buildSlots(c) ? `Waiting: ${esc(g.wait.text)}.` : '';
    let realm = '';
    if (g.realm !== false && G.govRealmNotes && G.citiesOf(S, 'p').length > 1) {
      const notes = G.govRealmNotes(S, c);
      if (notes.length) realm = `<span class="cn-realm" title="What the governor weighs for the realm">🌐 ${notes.map(n => esc(n[0].toUpperCase() + n.slice(1))).join(' · ')}.</span>`;
    }
    return `<span class="muted">${DATA.govFocus[g.focus].desc}</span> ${wait ? `<span class="warn">${wait}</span>` : ''} ${last ? `<span class="muted">Last: ${esc(last.text)} (${ago(last.t)})</span>` : ''}${realm ? '<br>' + realm : ''}`;
  };
  // "Think for the realm": in the Governors list and the city header alike (only with a governor and a second city)
  const realmToggle = (c, g) => g && g.on && G.citiesOf(S, 'p').length > 1
    ? `<label class="cn-realmbox" title="Think for the realm: lean on supply lines and sister cities instead of building for every local shortfall, raise works for what the realm lacks where the land suits them, and wait for caravans before buying. Off: this city fends for itself."><input type="checkbox" data-k="gov_realm_${c.id}" ${g.realm === false ? '' : 'checked'}> 🌐 think for the realm</label>` : '';
  const govSpec = c => ({ race: S.empires.p.race, kind: 'governor', seed: c.id, color: S.empires.p.color, era: G.techEra(S, 'p') });
  const govRow = c => {
    const g = G.councilState(S).gov[c.id];
    const on = g && g.on;
    const open = UI.cnLog === c.id;
    return `<div class="cn-gov">
      ${on ? ptHtml(govSpec(c), 34, 'pt-card', `Governor of ${c.name}`) : ''}<button class="link cn-name" data-act="city" data-c="${c.id}">${esc(c.name)}</button>
      ${focusSelect(c, g)}
      ${on ? `<label title="The governor never spends gold below this">keep 🪙 <input type="number" min="0" step="100" data-k="gov_res_${c.id}" value="${g.reserve || 0}"></label>` : ''}
      ${on && g.focus === 'military' ? `<label title="Defenders to keep trained here (0 = build only)">garrison <input type="number" min="0" step="5" data-k="gov_troops_${c.id}" value="${g.troops || 0}"></label>` : ''}
      ${realmToggle(c, g)}
      ${on && G.lvl(c, 'market') ? `<label title="Sell goods that would spill over and buy upkeep goods that run short; when the builders would stand idle, buy the goods a work lacks, only from gold well above the reserve"><input type="checkbox" data-k="gov_mkt_${c.id}" ${g.market === false ? '' : 'checked'}> market</label>` : ''}
      ${on && g.log && g.log.length ? `<button class="small" data-act="cnLog" data-c="${c.id}">${open ? 'Hide log' : 'Log'}</button>` : ''}
      <div class="cn-status">${govStatus(c, g)}</div>
      ${open && g && g.log ? `<ul class="cn-log">${g.log.map(l => `<li>${esc(l.text)} <span class="muted">· ${ago(l.t)}</span></li>`).join('')}</ul>` : ''}
    </div>`;
  };

  // ---- the tab -------------------------------------------------------------
  const renderCouncil = () => {
    const all = G.councilAdvice(S);
    const urgent = all.filter(i => i.priority >= URG());
    const hiddenN = G.councilHiddenCount(S);
    const parts = [];
    parts.push(`<div class="card"><div class="row"><h2 style="margin:0">🏛️ The Royal Council</h2><span class="spacer"></span>
        ${hiddenN ? `<button class="small" data-act="cnRestore" title="Show snoozed and dismissed advice again">Restore ${hiddenN} set aside</button>` : ''}</div>
      <p class="muted" style="font-size:13px;margin:6px 0 0">Your advisors watch the realm and speak up when something needs you. Press a button to act or jump there; 💤 snoozes an item, ✕ sets it aside until the situation changes.</p>
      ${urgent.length ? `<div style="margin-top:8px"><b class="bad">${urgent.length} urgent matter${urgent.length === 1 ? '' : 's'}</b>${urgent.slice(0, 3).map(i => itemHtml(i, true)).join('')}</div>`
        : `<p class="good" style="margin:8px 0 0">Nothing urgent. ${all.length ? `${all.length} lesser matter${all.length === 1 ? '' : 's'} below.` : 'The realm is in good order.'}</p>`}</div>`);
    parts.push(`<div class="cn-grid">${DATA.councilOrder.map(k => {
      const c = G.councilor(S, k);
      const items = all.filter(i => i.advisor === k);
      return `<div class="card"><div class="cn-head">${portrait(k)}<div class="cn-who"><b>${esc(c.title)} ${esc(c.name)}</b><span class="muted">${esc(c.role)} · ${esc(c.domain)}</span></div></div>
        ${items.length ? items.map(i => itemHtml(i)).join('') : `<p class="cn-quiet muted">“${esc(c.quiet)}”</p>`}</div>`;
    }).join('')}</div>`);
    const cities = G.citiesOf(S, 'p');
    parts.push(`<div class="card"><h3>🏛️ City governors</h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">Hand a city's construction to a governor. It queues a building whenever a slot is free and it can pay — never below your gold reserve, never so as to starve the city — and leaves wonders and realm-unique works to you.</p>
      ${cities.map(govRow).join('')}</div>`);
    return parts.join('');
  };

  // ---- tab placement: right after City ----------------------------------------
  {
    const entries = Object.entries(TABS).filter(([k]) => k !== 'council');
    for (const [k] of entries) delete TABS[k];
    const tab = { label: '🏛️ Council', render: () => renderCouncil(), badge: () => (S ? G.councilUrgent(S) : 0) };
    let placed = false;
    for (const [k, v] of entries) { TABS[k] = v; if (k === 'city') { TABS.council = tab; placed = true; } }
    if (!placed) TABS.council = tab;
  }

  // ---- top-bar chip ----------------------------------------------------------
  TOP_EXTRAS.push(() => {
    if (!S || !G.citiesOf(S, 'p').length) return '';
    const all = G.councilAdvice(S);
    const n = all.filter(i => i.priority >= URG()).length;
    const top = all[0];
    const tip = top ? `${G.councilor(S, top.advisor).role}: ${top.at ? top.text.replace('{eta}', fmtTime(realSecs(top.at - S.time))) : top.text}` : 'The council has nothing to report';
    return `<button class="small cn-chip ${n ? 'urgent' : ''}" data-act="tab" data-t="council" title="${esc(tip)}">🏛️ Council${n ? `<span class="cn-n">${n}</span>` : all.length ? ` <span class="muted">${all.length}</span>` : ''}</button>`;
  });

  // ---- city header: governor control and this city's advice ---------------------
  CITY_EXTRAS.push(city => {
    if (!S || !city || city.owner !== 'p') return '';
    const g = G.councilState(S).gov[city.id];
    const on = g && g.on;
    const mine = G.councilAdvice(S, { city: city.id });
    const top = mine[0];
    const last = on && g.log && g.log[0];
    return `<div class="cn-cityrow">${on ? ptHtml(govSpec(city), 30, 'pt-card', `Governor of ${city.name}`) : ''}<span title="A governor manages this city's construction">🏛️ Governor</span>${focusSelect(city, g)}
      ${on ? `<label title="The governor never spends gold below this">keep 🪙 <input type="number" min="0" step="100" data-k="gov_res_${city.id}" value="${g.reserve || 0}"></label>` : ''}
      ${realmToggle(city, g)}
      ${on && last ? `<span class="muted">${esc(last.text)}</span>` : on && g.wait ? `<span class="muted">${esc(g.wait.text)}</span>` : ''}
      ${top ? `<button class="link ${top.priority >= URG() ? 'bad' : ''}" data-act="tab" data-t="council" title="${esc(top.text.replace('{eta}', '…'))}">${mine.length} council note${mine.length === 1 ? '' : 's'}</button>` : ''}</div>`;
  });

  // scroll to a building card after jumping to it
  MOUNT_HOOKS.push(tab => {
    if (!UI.cnScroll) return;
    const el = document.getElementById(UI.cnScroll);
    UI.cnScroll = null;
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
  });

  // ---- actions -----------------------------------------------------------------
  const find = id => G.councilRaw(S).find(i => i.id === id);
  Object.assign(act, {
    cnGo: d => {
      const it = find(d.id);
      if (!it || !it.action) { toast('That matter has passed'); render(true); return; }
      const a = it.action;
      if (a.kind === 'city') { UI.city = a.c; UI.tab = 'city'; if (a.b) { UI.focusBld = a.b; UI.cnScroll = 'bld-' + a.b; } window.scrollTo(0, 0); render(true); return; }
      if (a.kind === 'tab') {
        if (!TABS[a.t]) { toast('That tab is not available'); return; }
        if (a.c && S.cities[a.c]) UI.city = a.c;
        UI.tab = a.t; window.scrollTo(0, 0); render(true); return;
      }
      if (a.kind === 'tile') { UI.tab = 'world'; UI.sel = { x: +a.x, y: +a.y }; window.scrollTo(0, 0); render(true); return; }
      const err = G.councilDo(S, a);
      const city = a.c && S.cities[a.c];
      const ok = a.kind === 'build' ? `${DATA.buildings[a.b].icon} ${DATA.buildings[a.b].name} queued in ${city.name}`
        : a.kind === 'cast' ? `${DATA.spells[a.spell].icon} ${DATA.spells[a.spell].name} cast`
        : a.kind === 'placate' ? `The people of ${city.name} are calmed` : a.kind === 'tax' ? `Taxes lowered in ${city.name}` : 'Done';
      toast(err || ok); render(true);
    },
    cnSnooze: d => { G.councilSnooze(S, d.id); toast(`Snoozed for ${G.COUNCIL.snoozeMins} game-minutes`); render(true); },
    cnDismiss: d => { G.councilDismiss(S, d.id); render(true); },
    cnRestore: () => { G.councilRestore(S); render(true); },
    cnLog: d => { UI.cnLog = UI.cnLog === d.c ? null : d.c; render(true); },
  });

  // governor inputs apply at once (ui-core only re-renders on change for the World tab)
  document.addEventListener('change', ev => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (!S || !k || !k.startsWith('gov_')) return;
    const m = k.match(/^gov_(focus|res|troops|mkt|realm)_(.+)$/);
    if (!m) return;
    const cfg = m[1] === 'focus' ? { focus: ev.target.value } : m[1] === 'res' ? { reserve: ev.target.value } : m[1] === 'troops' ? { troops: ev.target.value } : m[1] === 'realm' ? { realm: ev.target.checked } : { market: ev.target.checked };
    const err = G.setGovernor(S, m[2], cfg);
    if (err) toast(err);
    else if (m[1] === 'realm') toast(ev.target.checked ? `${S.cities[m[2]].name}'s governor thinks for the realm` : `${S.cities[m[2]].name}'s governor looks after its own city only`);
    else if (m[1] === 'focus') toast(ev.target.value === 'off' ? `${S.cities[m[2]].name} is back in your hands` : `A ${DATA.govFocus[ev.target.value].name} governor takes over ${S.cities[m[2]].name}`);
    delete UI.form[k];
    ev.target.blur(); render(true);
  });
})();
