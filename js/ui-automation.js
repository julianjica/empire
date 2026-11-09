// =====================================================================
//  The 🤖 Automation tab: presets, reserves, a card per domain, the
//  Decisions inbox and the automation log. Plus: an inbox badge in the
//  top bar, the preset choice on the start screen, quick toggles in the
//  city header (enchantments) and on the Military tab, a help section,
//  and the console commands (auto, inbox). Rules live in js/automation.js.
// =====================================================================
'use strict';
(() => {
  const style = document.createElement('style');
  style.textContent = `
  .au-top{display:inline-flex;align-items:center;gap:4px}
  .au-top.hot{border-color:var(--warn);font-weight:600}
  .au-top .au-n{background:var(--warn);color:#111;border-radius:99px;padding:0 6px;font-size:11px}
  .au-presets{display:flex;flex-wrap:wrap;gap:8px}
  .au-presets button{flex:1 1 150px;text-align:left;white-space:normal;padding:8px 10px;min-height:44px}
  .au-presets button small{display:block;font-weight:400;color:var(--muted);font-size:11.5px;margin-top:2px}
  .au-presets button.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
  .au-res{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;margin-top:10px;font-size:13px}
  .au-res label{display:inline-flex;gap:6px;align-items:center}
  .au-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px;margin-bottom:12px}
  .au-grid .card{margin:0}
  .au-card h3{display:flex;align-items:center;gap:8px;margin:0 0 4px}
  .au-card h3 .spacer{flex:1}
  .au-card.off{opacity:.82}
  .au-desc{font-size:12px;margin:0 0 6px}
  .au-sw{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
  .au-sw button{min-height:34px}
  .au-sw button.on{border-color:var(--good);color:var(--good)}
  .au-pol{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12.5px}
  .au-pol label{display:inline-flex;gap:4px;align-items:center}
  .au-pol select{max-width:170px}
  .au-last{font-size:11.5px;margin-top:6px}
  .au-item{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;padding:7px 0;border-top:1px solid var(--line)}
  .au-item:first-of-type{border-top:0}
  .au-item .au-t{flex:1 1 220px;font-size:13.5px;line-height:1.35}
  .au-item.p-hi .au-t{font-weight:600}
  .au-item .au-b{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}
  .au-log{list-style:none;margin:0;padding:0;font-size:12.5px;max-height:320px;overflow:auto}
  .au-log li{padding:3px 0;border-top:1px solid var(--line)}
  .au-log li:first-child{border-top:0}
  .au-log .muted{font-size:11px;margin-right:6px}
  .au-quick{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  @media (max-width:640px){.au-grid{grid-template-columns:1fr}.au-item .au-b{margin-left:0;flex:1 1 100%}.au-item .au-b button{flex:1 1 auto;min-height:40px}.au-pol select{max-width:100%}.au-pol label{flex:1 1 100%;justify-content:space-between}}
  `;
  document.head.appendChild(style);

  const A = () => G.automation(S);
  const D = () => G.AUTO.DOMAINS;
  const presetName = k => (G.AUTO.PRESETS[k] || { name: 'Custom', icon: '🛠️' });

  // ---- start screen: choose a preset (New games default to Assisted) ----
  if (typeof START_REC !== 'undefined') START_REC.automation = 'assisted';
  if (!UI.start.automation) UI.start.automation = 'assisted';
  START_EXTRAS.unshift(() => {
    const P = G.AUTO.PRESETS;
    return `<div class="card st-setup au-start"><h3>🤖 How much do you want to decide yourself?</h3>
      <div class="st-grid">${startSeg('automation', 'Automation', Object.entries(P).map(([k, p]) => [k, `${p.icon} ${p.name}`, esc(p.desc)]), UI.start.automation, 'Change it any time on the 🤖 Automation tab. War, treaties, succession and crises always wait for you.')}</div></div>`;
  });
  const baseBegin = act.begin;
  act.begin = (...a) => {
    baseBegin(...a);
    if (!S) return;
    G.autoPreset(S, G.AUTO.PRESETS[UI.start.automation] ? UI.start.automation : 'assisted');
    G.save(S); render(true);
  };

  // ---- top bar badge ----
  TOP_EXTRAS.push(() => {
    if (!S || !S.empires || !S.empires.p) return '';
    const items = G.autoInbox(S), n = items.length, hot = items.some(i => i.prio >= 80);
    const tip = n ? items.slice(0, 4).map(i => i.text).join(' · ') : 'Nothing needs you';
    return `<button class="small au-top ${hot ? 'hot' : ''}" data-act="autoOpen" title="Decisions inbox: ${esc(tip)}" aria-label="Decisions inbox, ${n} item${n === 1 ? '' : 's'}">📥${n ? `<span class="au-n">${n}</span>` : ''}</button>`;
  });

  // ---- the inbox ----
  const itemHtml = it => {
    const btns = [];
    if (it.pending) for (const o of it.pending.options) btns.push(`<button class="small ${o.key === it.pending.def ? '' : 'primary'}" data-act="decide" data-p="${esc(it.pending.id)}" data-k="${esc(o.key)}">${esc(o.label)}</button>`);
    if (it.fork) for (const k of it.fork) btns.push(`<button class="small" data-act="autoFork" data-t="${esc(k)}" title="Prefer this side: the stewards will adopt it when culture allows">${DATA.traditions[k].icon} ${esc(DATA.traditions[k].name)}</button>`);
    if (it.act) btns.push(`<button class="small primary" data-act="autoDo" data-id="${esc(it.id)}">${esc(it.act.label)}</button>`);
    if (it.jump && TABS[it.jump.tab]) btns.push(`<button class="small" data-act="autoJump" data-id="${esc(it.id)}" title="Open it">Open →</button>`);
    return `<div class="au-item ${it.prio >= 80 ? 'p-hi' : ''}"><span class="au-t">${it.icon} ${esc(it.text)}${it.pending ? `<br><span class="muted" style="font-size:11.5px">${esc(it.pending.text)}</span>` : ''}</span><span class="au-b">${btns.join('')}</span></div>`;
  };
  const inboxCard = () => {
    const items = G.autoInbox(S);
    return `<div class="card au-inbox" id="au-inbox"><h3>📥 Decisions inbox${items.length ? ` <span class="muted">${items.length}</span>` : ''}</h3>
      ${items.length ? items.map(itemHtml).join('') : '<p class="muted">Nothing needs you right now. Your stewards are at work.</p>'}</div>`;
  };

  // ---- domain cards ----
  const domainCard = d => {
    const def = D()[d], st = A().d[d], on = G.autoDomainOn(S, d);
    const last = A().log.find(e => e.d === d);
    const sw = Object.entries(def.sw).map(([k, label]) => `<button class="small ${st[k] ? 'on' : ''}" data-act="autoSw" data-d="${d}" data-k="${k}" aria-pressed="${!!st[k]}">${st[k] ? '✓' : '○'} ${esc(label)}</button>`).join('');
    const pol = def.pol.map(([k, label, opts]) => `<label>${esc(label)} <select data-k="auto_pol_${d}_${k}" aria-label="${esc(def.name)}: ${esc(label)}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(st[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('');
    return `<div class="card au-card ${on ? '' : 'off'}"><h3>${def.icon} ${esc(def.name)}<span class="spacer"></span><button class="small ${on ? 'primary' : ''}" data-act="autoDom" data-d="${d}" aria-pressed="${on}" title="${on ? 'Switch every part off' : 'Switch every part on'}">${on ? 'On' : 'Off'}</button></h3>
      <p class="au-desc muted">${esc(def.desc)}</p>
      <div class="au-sw">${sw}</div>${pol ? `<div class="au-pol">${pol}</div>` : ''}
      <div class="au-last muted">${last ? `🤖 ${esc(last.text)} · ${ago(last.t)}` : 'Nothing done yet.'}${A().stats[d] ? ` · ${A().stats[d]} action${A().stats[d] > 1 ? 's' : ''} in all` : ''}</div></div>`;
  };
  const resSel = (k, label, unit) => {
    const cur = A().res[k], opts = [...new Set([...G.AUTO.RES[k], cur])].sort((a, b) => a - b);
    return `<label>${label} <select data-k="auto_res_${k}" aria-label="${label}">${opts.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v} ${unit}</option>`).join('')}</select></label>`;
  };
  const presetsCard = () => {
    const cur = A().preset;
    return `<div class="card"><h3>🤖 Stewards <span class="muted" style="font-size:13px;font-weight:400">· now ${presetName(cur).icon} ${presetName(cur).name}</span></h3>
      <div class="au-presets" role="radiogroup" aria-label="Automation preset">${Object.entries(G.AUTO.PRESETS).map(([k, p]) => `<button class="${cur === k ? 'on' : ''}" role="radio" aria-checked="${cur === k}" data-act="autoPreset" data-p="${k}"><b>${p.icon} ${p.name}</b><small>${esc(p.desc)}</small></button>`).join('')}</div>
      <div class="au-res"><b>Reserves the stewards never spend:</b> ${resSel('gold', '🪙 Gold', 'gold')} ${resSel('mana', '🔮 Mana floor', 'mana')} ${resSel('garrison', '🛡️ Garrison', 'soldiers')}</div></div>`;
  };
  const logCard = () => {
    const log = A().log.slice(0, 40);
    return `<div class="card"><h3>🧾 Automation log</h3>${log.length ? `<ul class="au-log">${log.map(e => `<li><span class="muted">${clockOfT(e.t)}</span>${D()[e.d] ? D()[e.d].icon : '🤖'} ${esc(e.text)}</li>`).join('')}</ul>` : '<p class="muted">The stewards have not acted yet.</p>'}</div>`;
  };
  const clockOfT = t => `${Math.floor(t / 3600)}:${String(Math.floor(t % 3600 / 60)).padStart(2, '0')}`;
  const render_ = () => `${inboxCard()}${presetsCard()}<div class="au-grid">${G.AUTO.ORDER.map(domainCard).join('')}</div>${logCard()}`;

  TABS.automation = { label: '🤖 Automation', render: render_, badge: () => G.autoInboxCount(S) };
  const realm = TAB_GROUPS.find(g => g.id === 'realm');
  if (realm && !realm.keys.includes('automation')) realm.keys.push('automation');

  // ---- quick toggles where they belong ----
  CITY_EXTRAS.push(city => {
    if (!S || !city || city.owner !== 'p' || !G.lvl(city, 'magetower') || !A().d.grimoire.ench) return '';
    const off = !!(A().enchOff || {})[city.id];
    return `<button class="pill ${off ? '' : 'good'}" data-act="autoEnch" data-c="${city.id}" title="${off ? 'The stewards leave this city\'s enchantments to you. Click to let them keep wards here.' : 'The stewards keep enchantments on this city when its tower can feed them. Click to stop.'}">🤖 Auto-enchant ${off ? 'off' : 'on'}</button>`;
  });
  if (typeof MILITARY_EXTRAS !== 'undefined') MILITARY_EXTRAS.push(city => {
    if (!S || !city || city.owner !== 'p') return '';
    const st = A().d.military, def = D().military;
    return `<div class="card"><h3>🤖 Military stewards</h3><div class="au-quick">${Object.entries(def.sw).map(([k, label]) => `<button class="small ${st[k] ? 'on' : ''}" style="${st[k] ? 'border-color:var(--good);color:var(--good)' : ''}" data-act="autoSw" data-d="military" data-k="${k}" aria-pressed="${!!st[k]}">${st[k] ? '✓' : '○'} ${esc(label)}</button>`).join('')}
      <label style="font-size:12.5px">Defence <select data-k="auto_pol_military_defend">${def.pol[0][2].map(([v, l]) => `<option value="${v}" ${st.defend === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="muted" style="font-size:12px">Keeps at least ${A().res.garrison} soldiers per city · <button class="link" data-act="tab" data-t="automation">all automation</button></span></div></div>`;
  });

  // ---- help ----
  HELP_SECTIONS.push({ id: 'automation', icon: '🤖', title: 'Automation & the Decisions inbox', tabs: ['automation'],
    words: 'automation automate steward delegate assisted hands-on preset inbox decisions auto research study enchant tradition ceremony garrison intercept camp forge hero magi governor supply market preach temperament reserve',
    html: '<p>The 🤖 <b>Automation</b> tab hands routine work to stewards, one domain at a time, so you can focus on the big decisions.</p><ul><li><b>Presets:</b> <b>Hands-on</b> (nothing automated), <b>Assisted</b> (research and study keep going, governors take new cities, supplies flow, ceremonies are held, attacks are flagged) and <b>Delegate</b> (almost everything). Changing a switch makes it <b>Custom</b>.</li><li><b>Domains:</b> Research, Grimoire (study, enchantments, routine blessings), Traditions (pillar path; forks wait for you unless you allow it), Military (garrisons, reinforcements, intercepts, camps, forge), Hero &amp; generals, Magi, Economy (governors, supply, market), Faith and minor Decisions (cautious, balanced or bold, after a grace period).</li><li><b>Reserves:</b> the stewards never spend below your gold reserve or mana floor, and never strip a city below the minimum garrison.</li><li><b>Never automated:</b> war declarations and threats, treaty and trade offers, succession, peace terms, crises and the Great Working.</li><li>The <b>📥 Decisions inbox</b> (top bar) lists only what needs you: threats, offers, succession, idle cities, an empty research queue, unspent hero points, waiting decisions and battles you could intercept. Each has a one-click answer or a jump.</li><li>Every automated action is written to the <b>automation log</b>. Console: <code>auto</code>, <code>auto research on</code>, <code>auto preset delegate</code>, <code>inbox</code>, <code>inbox 1</code>.</li></ul>' });

  // ---- actions ----
  const jump = j => {
    if (!j || !TABS[j.tab]) return toast('That tab is not available');
    if (j.city && S.cities[j.city]) UI.city = j.city;
    UI.tab = j.tab; UI.navMore = false; window.scrollTo(0, 0); render(true);
  };
  Object.assign(act, {
    autoOpen: () => { UI.tab = 'automation'; UI.navMore = false; render(true); const el = document.getElementById('au-inbox'); if (el) { try { el.scrollIntoView({ block: 'start' }); } catch (e) { } const b = el.querySelector('button'); if (b) b.focus(); } },
    autoPreset: d => { G.autoPreset(S, d.p); toast(`${presetName(d.p).icon} ${presetName(d.p).name}: ${G.AUTO.PRESETS[d.p].desc}`); render(true); },
    autoSw: d => { const v = !A().d[d.d][d.k]; const e = G.autoSet(S, d.d, d.k, v); toast(e || `🤖 ${D()[d.d].sw[d.k]}: ${v ? 'on' : 'off'}`); render(true); },
    autoDom: d => { const on = !G.autoDomainOn(S, d.d); const e = G.autoDomain(S, d.d, on); toast(e || `🤖 ${D()[d.d].name}: ${on ? 'on' : 'off'}`); render(true); },
    autoDo: d => { const it = G.autoInbox(S).find(x => x.id === d.id); const e = G.autoInboxDo(S, d.id); toast(e || `🤖 Done: ${it ? it.text : ''}`); render(true); },
    autoJump: d => { const it = G.autoInbox(S).find(x => x.id === d.id); if (!it) { toast('That has passed'); render(true); return; } jump(it.jump); },
    autoFork: d => { const e = G.autoForkPref(S, d.t); toast(e || `🎭 The stewards will follow ${DATA.traditions[d.t].name}`); render(true); },
    autoEnch: d => { const a = A(); a.enchOff = a.enchOff || {}; if (a.enchOff[d.c]) delete a.enchOff[d.c]; else a.enchOff[d.c] = 1; render(true); },
  });
  document.addEventListener('change', ev => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (!S || !k || !k.startsWith('auto_')) return;
    let m = k.match(/^auto_pol_([a-z]+)_([a-zA-Z]+)$/), err = null;
    if (m) { err = G.autoSet(S, m[1], m[2], ev.target.value); if (!err) toast(`🤖 ${D()[m[1]].name}: ${(D()[m[1]].pol.find(p => p[0] === m[2]) || [])[1] || m[2]} → ${ev.target.selectedOptions[0].text}`); }
    else if ((m = k.match(/^auto_res_([a-z]+)$/))) { err = G.autoReserve(S, m[1], ev.target.value); if (!err) toast(`🤖 Reserve: ${ev.target.selectedOptions[0].text}`); }
    if (err) toast(err);
    delete UI.form[k];
    ev.target.blur(); render(true);
  });

  // the console (js/cli.js) is loaded by now
  if (G.autoRegisterCli) G.autoRegisterCli();
})();
