// =====================================================================
//  The Dynasty tab (👑): the ruler, the consort, the children (portraits
//  by age, traits, tutors, the heir), the law of succession, prestige,
//  matches with other houses and the chronicle of kings. Also a ruler card
//  on the Empire tab and a line on every Diplomacy realm card.
//  Rules: js/dynasty.js. Form values use data-k keys prefixed dy_.
// =====================================================================
'use strict';
(() => {
  const style = document.createElement('style');
  style.textContent = `
  .dy-head{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
  .dy-head h2{margin:0}
  .dy-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:99px;padding:1px 8px;font-size:12px;background:var(--panel2)}
  .dy-chip.bad{border-color:var(--bad);color:var(--bad)} .dy-chip.warn{border-color:var(--warn)} .dy-chip.good{border-color:var(--good)}
  .dy-ruler{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start}
  .dy-ruler .pt-tok{flex:0 0 auto}
  .dy-name{font-family:var(--font);font-size:1.15rem;font-weight:600}
  .dy-sub{font-size:12.5px;color:var(--muted)}
  .dy-traits{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
  .dy-trait{display:inline-flex;align-items:center;gap:3px;border:1px solid var(--line);border-radius:6px;padding:0 5px;font-size:12px;background:var(--panel)}
  .dy-ticons{letter-spacing:1px}
  .dy-stats{display:flex;flex-wrap:wrap;gap:2px 10px;font-size:12.5px;font-variant-numeric:tabular-nums}
  .dy-stats b{font-weight:600}
  .dy-fx{font-size:12.5px;margin:6px 0 0}
  .dy-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}
  .dy-card{border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--panel);display:flex;flex-direction:column;gap:4px;min-width:0}
  .dy-card.heir{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
  .dy-card.dead{opacity:.6}
  .dy-card .dy-top{display:flex;gap:8px;align-items:center;min-width:0}
  .dy-card .dy-top>div{min-width:0}
  .dy-card select{max-width:100%}
  .dy-tree{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}
  .dy-couple{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
  .dy-kings{list-style:none;margin:0;padding:0}
  .dy-kings li{display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px dashed var(--line);font-size:13px}
  .dy-kings li:last-child{border-bottom:0}
  .dy-banner{border-left:4px solid var(--warn);padding:6px 10px;background:var(--panel2);border-radius:6px;font-size:13px;margin-top:8px}
  .dy-banner.bad{border-left-color:var(--bad)}
  .dy-realm{display:flex;gap:8px;align-items:center;margin:6px 0 2px;font-size:12.5px;flex-wrap:wrap}
  .dy-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .dy-laws{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px;margin-top:6px}
  .dy-law{border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:12.5px;background:var(--panel)}
  .dy-law.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
  @media (max-width: 520px){
    .dy-ruler{grid-template-columns:1fr}
    .dy-grid{grid-template-columns:1fr}
    .dy-head{gap:4px 8px}
    .dy-card .dy-row button{padding:4px 9px}
  }`;
  document.head.appendChild(style);

  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const TR = k => DATA.rulerTraits[k] || { name: k, icon: '•', desc: '' };
  const seasonLen = () => G.DYN.seasonSec * G.pace(S).time;
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const yearOf = sIdx => Math.floor(sIdx / 4) + 1;
  const ageWord = a => a < 16 ? 'young' : a < 50 ? 'adult' : 'old';
  const pct = v => `${v >= 1 ? '+' : '−'}${Math.abs(Math.round((v - 1) * 1000) / 10)}%`;
  const MOD_NAME = { tax: 'taxes', atk: 'attack', def: 'defense', researchTime: 'research time', buildTime: 'building time', trainTime: 'training time', counterintel: 'counter-intelligence', spy: 'spy skill' };

  const personSpec = (owner, p, D) => {
    const e = S.empires[owner] || {};
    const age = G.dynAge(S, p);
    if (D && p.id === D.heroId && !p.dead && G.heroOf) { const h = G.heroOf(S, owner); if (h) return heroSpec(h, owner); }
    const fe = p.from && S.empires[p.from];
    return { race: p.race || (fe && fe.race) || e.race || 'hearth', kind: 'ruler', seed: 'dyn:' + p.id, color: (fe && fe.color) || e.color, era: ptEra(owner), female: !!p.female, age: ageWord(age), dead: !!p.dead };
  };
  const pic = (owner, p, D, size, cls = '') => ptHtml(personSpec(owner, p, D), size, cls, `${G.dynFullName(S, owner, p)}, ${G.dynAge(S, p)}`);
  const traitChips = p => p.traits.length ? `<div class="dy-traits">${p.traits.map(t => `<span class="dy-trait" title="${esc(TR(t).desc)}">${TR(t).icon} ${esc(TR(t).name)}</span>`).join('')}</div>` : '<div class="dy-sub">No notable traits yet</div>';
  const traitIcons = p => `<span class="dy-ticons">${p.traits.map(t => `<span title="${esc(TR(t).name + ': ' + TR(t).desc)}">${TR(t).icon}</span>`).join('')}</span>`;
  const statsHtml = p => { const st = G.dynStats(p); return `<div class="dy-stats">${Object.entries(DATA.rulerStats).map(([k, d]) => `<span title="${esc(d.name + ' — ' + d.desc)}">${d.icon} <b>${st[k]}</b></span>`).join('')}</div>`; };
  const fxText = (owner) => {
    const f = G.rulerFx(S, owner);
    if (!f) return '';
    const bits = Object.entries(f.mod).filter(([, v]) => Math.abs(v - 1) >= 0.0005).map(([k, v]) => `${pct(v)} ${MOD_NAME[k] || k}`);
    if (f.happy) bits.push(`${f.happy > 0 ? '+' : '−'}${Math.abs(f.happy)} happiness`);
    if (Math.abs(f.faith - 1) > 0.001) bits.push(`${pct(f.faith)} faith`);
    if (Math.abs(f.culture - 1) > 0.001) bits.push(`${pct(f.culture)} culture`);
    if (f.loyalty) bits.push('loyalty recovers faster');
    if (f.lead) bits.push('rides with the armies');
    return bits.join(' · ') || 'no notable effect';
  };
  const strengthWord = st => st.sev < 0.08 ? '<span class="good">secure</span>' : st.sev < 0.35 ? '<span class="warn">shaky</span>' : '<span class="bad">a crisis in waiting</span>';
  const reignYears = (p) => p && p.crownS != null ? Math.max(0, Math.floor((S.time / seasonLen() - p.crownS) / 4)) : 0;

  // ---- the tab --------------------------------------------------------------------------
  const marryOptions = (owner, p) => {
    const list = [['noble', 'A great family of the realm']];
    for (const e of Object.values(S.empires)) {
      if (e.id === owner || e.dead || e.minor || !G.citiesOf(S, e.id).length) continue;
      const err = G.dynMatchStatus(S, owner, p.id, e.id);
      if (!err) list.push([e.id, `The ${e.name}${G.dynTie(S, owner, e.id) ? ' 💍' : ''}`]);
    }
    return list;
  };
  const kidCard = (D, p, heir) => {
    const age = G.dynAge(S, p);
    const isHeir = heir && heir.id === p.id;
    const sp = p.spouse && D.people[p.spouse];
    const minor = age < G.DYN.adult;
    const k = 'dy_m_' + p.id;
    const canMarry = !p.dead && p.blood && !minor && !(sp && !sp.dead);
    return `<div class="dy-card ${isHeir ? 'heir' : ''} ${p.dead ? 'dead' : ''}">
      <div class="dy-top">${pic('p', p, D, 56, 'pt-card')}<div><div class="dy-name" style="font-size:1rem">${esc(p.name)}${p.id === D.heroId ? ' 🦸' : ''}${isHeir ? ' <span class="dy-chip good">heir</span>' : ''}</div>
        <div class="dy-sub">${esc(G.dynTitle(S, 'p', p))} · ${age} year${age === 1 ? '' : 's'}${p.dead ? ' · †' : ''}${sp && !sp.dead ? ` · wed to ${esc(sp.name)}${sp.from && S.empires[sp.from] ? ` of the ${esc(S.empires[sp.from].name)}` : ''}` : ''}</div></div></div>
      ${traitChips(p)}${statsHtml(p)}
      ${!p.dead && minor && age >= G.DYN.eduFrom ? `<label class="dy-sub">Tutor <select data-k="dy_focus_${p.id}">${opt('', 'No tutor', p.focus || '')}${Object.entries(DATA.rulerFocus).map(([f, n]) => opt(f, n, p.focus || '')).join('')}</select></label>` : ''}
      ${!p.dead && minor && age < G.DYN.eduFrom ? `<div class="dy-sub">Too young for a tutor (from ${G.DYN.eduFrom})</div>` : ''}
      <div class="dy-row">
        ${D.law === 'chosen' && !p.dead && !isHeir ? `<button class="small" data-act="dyHeir" data-p="${p.id}">☝️ Name heir</button>` : ''}
        ${canMarry ? `<select data-k="${k}" aria-label="Match for ${esc(p.name)}">${marryOptions('p', p).map(([v, l]) => opt(v, l, UI.form[k] || 'noble')).join('')}</select><button class="small" data-act="dyMarry" data-p="${p.id}">💍 Arrange a match</button>` : ''}
      </div></div>`;
  };

  const renderDynasty = () => {
    const D = G.dynasty(S, 'p');
    if (!D) return '<div class="card">No court.</div>';
    const r = D.people[D.rulerId];
    const sp = G.dynSpouse(S, 'p');
    const heir = G.dynHeir(S, 'p');
    const st = heir ? G.dynStrength(S, 'p', heir) : { sev: 1, why: ['no heir'] };
    const kids = G.dynChildren(S, 'p');
    const others = Object.values(D.people).filter(p => !p.dead && p.blood && p !== r && !kids.includes(p));
    const law = DATA.successionLaws[D.law];
    const L = id => G.dynLawStatus(S, 'p', id);
    const age = G.dynAge(S, r);
    const crisis = D.crisis && D.crisis.until > S.time ? D.crisis : null;
    const rk = 'dy_m_' + r.id;
    const rCanMarry = !sp && age >= G.DYN.adult;

    const head = `<div class="card"><div class="dy-head"><h2>👑 House ${esc(D.house)}</h2>
        <span class="dy-chip" title="Prestige: earned each season from renown, a long reign and the ruler's character; spent on laws and royal matches. It steadies successions.">✨ ${Math.floor(D.prestige)} prestige</span>
        <span class="dy-chip" title="${esc(law.desc)}">${law.icon} ${esc(law.name)}</span>
        <span class="dy-chip">📅 Year ${G.season(S).year}, ${G.season(S).name}</span>
        ${crisis ? `<span class="dy-chip bad">⚠️ Succession crisis</span>` : ''}${D.regent ? '<span class="dy-chip warn">🧑‍⚖️ Regency</span>' : ''}</div>
      ${crisis ? `<div class="dy-banner bad">A succession crisis grips the realm for another ${fmtTime(realSecs(crisis.until - S.time))}: −${crisis.happy} happiness in every city. Loyalty fell by ${crisis.drop || 0}.</div>` : ''}
      ${D.regent ? `<div class="dy-banner">${esc(D.regent.name)} rules as regent until ${esc(r.name)} turns ${G.DYN.adult} (${Math.max(0, G.DYN.adult - age)} more year${G.DYN.adult - age === 1 ? '' : 's'}): the regent's abilities count, the young ruler's traits only by half, −2 happiness.</div>` : ''}
    </div>`;

    const ruler = `<div class="card"><h3>The ${esc(G.dynTitle(S, 'p', r).toLowerCase())}</h3>
      <div class="dy-ruler">${pic('p', r, D, 96, 'pt-card')}<div>
        <div class="dy-name">${esc(G.dynFullName(S, 'p', r))}${D.rulerId === D.heroId ? ' 🦸' : ''}</div>
        <div class="dy-sub">${age} years old · reigning ${reignYears(r)} year${reignYears(r) === 1 ? '' : 's'}${r.cousin ? ' · a cousin of the house' : ''} · ${ordinal(D.past.length + 1)} ruler of the line</div>
        ${traitChips(r)}${statsHtml(r)}
        <p class="dy-fx"><b>Effects:</b> ${esc(fxText('p'))}</p>
        <label class="dy-sub" title="Rides with the armies: +2% attack, but a lost battle may cost the ruler's life."><input type="checkbox" data-k="dy_lead" ${D.lead || D.rulerId === D.heroId ? 'checked' : ''} ${D.rulerId === D.heroId || D.regent ? 'disabled' : ''}> Ride with the armies (+2% attack; may fall in a lost battle)</label>
      </div></div>
      <div class="dy-couple" style="margin-top:10px">
        ${sp ? `<div class="dy-card" style="max-width:340px"><div class="dy-top">${pic('p', sp, D, 56, 'pt-card')}<div><div class="dy-name" style="font-size:1rem">${esc(sp.name)}</div><div class="dy-sub">${esc(G.dynTitle(S, 'p', sp))} · ${G.dynAge(S, sp)} · ${sp.from && S.empires[sp.from] ? `💍 of the ${esc(S.empires[sp.from].name)}` : 'of a great family'}</div></div></div>${traitChips(sp)}</div>`
          : `<div class="dy-card" style="max-width:340px"><div class="dy-sub">The ${esc(G.dynTitle(S, 'p', r).toLowerCase())} is unwed.</div>${rCanMarry ? `<div class="dy-row"><select data-k="${rk}" aria-label="A match for the ruler">${marryOptions('p', r).map(([v, l]) => opt(v, l, UI.form[rk] || 'noble')).join('')}</select><button class="small" data-act="dyMarry" data-p="${r.id}">💍 Arrange a match</button></div>` : ''}</div>`}
        <div class="dy-card" style="max-width:340px"><div class="dy-sub">Heir</div>${heir ? `<div class="dy-top">${pic('p', heir, D, 40)}<div><b>${esc(heir.name)}</b><div class="dy-sub">${G.dynAge(S, heir)} · ${heir.blood ? 'of the blood' : ''}</div></div></div>
          <div class="dy-sub">Succession would be ${strengthWord(st)}${st.why.length ? ` (${esc(st.why.join(', '))})` : ''}.</div>` : `<div class="bad">No heir of the blood: a distant cousin would be fetched, and the realm would fall into crisis.</div>`}
          ${D.law === 'elective' ? '<div class="dy-sub">The great nobles favour the ablest adult; a noble may win the crown.</div>' : ''}</div>
      </div></div>`;

    const children = `<div class="card"><h3>👶 Children ${kids.length ? `<span class="muted" style="font-size:13px">${kids.length}</span>` : ''}</h3>
      ${kids.length ? `<div class="dy-grid">${kids.map(p => kidCard(D, p, heir)).join('')}</div>` : '<p class="muted">No children yet. A married ruler may be blessed with heirs as the seasons turn.</p>'}
      ${others.length ? `<h4 style="margin-top:10px">The wider family</h4><div class="dy-grid">${others.map(p => kidCard(D, p, heir)).join('')}</div>` : ''}
      <p class="dy-sub" style="margin-top:8px">Children grow a year every four seasons. Tutors (from age ${G.DYN.eduFrom}) raise a stat and shape the traits gained at ${G.DYN.adult}. Royal matches with other realms cost 20 prestige and need their goodwill; they bind the houses (better regard, and a claim on their throne should it falter).</p></div>`;

    const laws = `<div class="card"><h3>📜 Law of succession</h3><div class="dy-laws">${Object.entries(DATA.successionLaws).map(([id, l]) => { const s2 = L(id); return `<div class="dy-law ${D.law === id ? 'on' : ''}"><b>${l.icon} ${esc(l.name)}</b><div class="dy-sub">${esc(l.desc)}</div>
        ${D.law === id ? '<div class="good" style="font-size:12px;margin-top:4px">The law of the realm</div>' : `<button class="small" style="margin-top:4px" data-act="dyLaw" data-l="${id}" ${s2.ok ? '' : 'disabled'} title="${esc(s2.reason || '')}">Adopt (${G.DYN.lawCost} prestige)</button>${s2.ok ? '' : `<div class="dy-sub">${esc(s2.reason)}</div>`}`}</div>`; }).join('')}</div></div>`;

    const kings = `<div class="card"><h3>📖 The chronicle of kings</h3>${D.past.length ? `<ol class="dy-kings">${D.past.slice().reverse().map(k => `<li>${ptHtml({ race: k.race || S.empires.p.race, kind: 'ruler', seed: 'dyn:' + k.id, color: S.empires.p.color, era: ptEra('p'), female: !!k.female, age: ageWord(k.age), dead: true }, 36, '', k.name)}
        <div><b>${esc(k.title)} ${esc(k.name)}</b> <span class="muted">of House ${esc(k.house)}</span><div class="dy-sub">${k.from < 0 ? 'Before the chronicle' : 'Year ' + yearOf(k.from)}–Year ${yearOf(k.to)} · died ${esc(['of a fever', 'in old age', 'in battle', "by an assassin's blade", 'of a wasting sickness', 'abdicated'][G.DYN_CAUSES[k.cause] ?? 0])} at ${k.age} ${traitIcons(k)}</div></div></li>`).join('')}</ol>` : `<p class="muted">${esc(G.dynFullName(S, 'p', r))} is the first of the line to be remembered. The deeds of each reign are kept in the 📖 Chronicle.</p>`}</div>`;

    const claims = G.dynClaims(S).filter(c => c.by === 'p' || c.on === 'p');
    const claimCard = claims.length ? `<div class="card"><h3>⚔️ Claims</h3>${claims.map(c => `<p style="margin:4px 0">${c.by === 'p' ? `We claim the throne of the ${esc(S.empires[c.on].name)}: take <b>${esc(c.cityName)}</b>` : `The ${esc(S.empires[c.by].name)} claim our throne and march for <b>${esc(c.cityName)}</b>`} — ${fmtTime(realSecs(c.until - S.time))} left.</p>`).join('')}</div>` : '';

    return head + ruler + claimCard + children + laws + kings;
  };

  // place the tab after the Ledger (or the Empire tab)
  {
    const entries = Object.entries(TABS).filter(([k]) => k !== 'dynasty');
    for (const [k] of entries) delete TABS[k];
    const tab = { label: '👑 Dynasty', render: () => renderDynasty(),
      badge: () => { if (!S) return 0; try { return G.dynChildren(S, 'p').filter(c => { const a = G.dynAge(S, c); return a >= G.DYN.eduFrom && a < G.DYN.adult && !c.focus; }).length; } catch (e) { return 0; } } };
    const anchor = entries.some(([k]) => k === 'ledger') ? 'ledger' : 'empire';
    let placed = false;
    for (const [k, v] of entries) { TABS[k] = v; if (k === anchor) { TABS.dynasty = tab; placed = true; } }
    if (!placed) TABS.dynasty = tab;
  }

  // ---- the Empire tab: a ruler card --------------------------------------------------
  EMPIRE_EXTRAS.push(() => {
    if (!S) return '';
    const D = G.dynasty(S, 'p'); if (!D) return '';
    const r = D.people[D.rulerId], heir = G.dynHeir(S, 'p');
    return `<div class="card"><div class="row"><h3 style="margin:0">👑 ${esc(G.dynFullName(S, 'p', r))}</h3><span class="spacer"></span><button class="small" data-act="tab" data-t="dynasty">👑 Dynasty</button></div>
      <div class="dy-realm">${pic('p', r, D, 48, 'pt-card')}<div>House ${esc(D.house)} · ${G.dynAge(S, r)} years · ${traitIcons(r)} · ✨ ${Math.floor(D.prestige)}<div class="dy-sub">${esc(fxText('p'))}</div>
      <div class="dy-sub">Heir: ${heir ? esc(heir.name) + ` (${G.dynAge(S, heir)})` : '<span class="bad">none</span>'}${D.regent ? ` · regent ${esc(D.regent.name)}` : ''}${D.crisis && D.crisis.until > S.time ? ' · <span class="bad">succession crisis</span>' : ''}</div></div></div></div>`;
  });

  // ---- Diplomacy realm cards: their ruler ------------------------------------------
  REALM_EXTRAS.push(emp => {
    if (!S || !emp || emp.dead || emp.minor) return '';
    const D = G.dynasty(S, emp.id); if (!D) return '';
    const r = D.people[D.rulerId]; if (!r) return '';
    const rg = G.rulerRegard(S, emp.id, 'p'), why = G.rulerRegardWhy(S, emp.id, 'p');
    const tie = G.dynTie(S, 'p', emp.id);
    const cr = D.crisis && D.crisis.until > S.time;
    const cl = G.dynClaims(S).find(c => (c.by === emp.id && c.on === 'p') || (c.by === 'p' && c.on === emp.id));
    return `<div class="dy-realm">${pic(emp.id, r, D, 36)}<div><b>${esc(G.dynFullName(S, emp.id, r))}</b> <span class="muted">of House ${esc(D.house)}, ${G.dynAge(S, r)}</span> ${traitIcons(r)}
      <div class="dy-sub">Their ruler's regard: <span class="${rg > 0 ? 'good' : rg < 0 ? 'bad' : ''}">${rg > 0 ? '+' : ''}${rg}</span>${why.length ? ` (${esc(why.join(', '))})` : ''}${tie ? ' · 💍 bound by marriage' : ''}${D.regent ? ' · a regency' : ''}${cr ? ' · <span class="warn">⚠️ succession crisis — their cities waver</span>' : ''}${cl ? ` · <span class="bad">⚔️ claim war for ${esc(cl.cityName)}</span>` : ''}</div></div></div>`;
  });

  // ---- actions ---------------------------------------------------------------------
  Object.assign(act, {
    dyHeir: d => { const err = G.dynSetHeir(S, 'p', d.p); toast(err || `${G.dynPerson(S, 'p', d.p).name} is now the heir`); render(true); },
    dyLaw: d => { const err = G.dynSetLaw(S, 'p', d.l); toast(err || `The law of succession is now ${DATA.successionLaws[d.l].name}`); render(true); },
    dyMarry: d => {
      const partner = UI.form['dy_m_' + d.p] || 'noble';
      const err = G.dynMarry(S, 'p', d.p, partner);
      toast(err || '💍 The match is made');
      if (!err) delete UI.form['dy_m_' + d.p];
      render(true);
    },
  });
  document.addEventListener('change', ev => {
    const el = ev.target, k = el.dataset && el.dataset.k;
    if (!S || !k || !k.startsWith('dy_')) return;
    let m, err = null;
    if (k === 'dy_lead') err = G.dynLead(S, 'p', el.checked);
    else if ((m = k.match(/^dy_focus_(.+)$/))) { err = G.dynSetFocus(S, 'p', m[1], el.value || null); if (!err && el.value) toast(`A ${DATA.rulerFocus[el.value].toLowerCase()} tutor is engaged`); }
    else if (k.startsWith('dy_m_')) { UI.form[k] = el.value; return; }
    else return;
    if (err) toast(err);
    el.blur(); render(true);
  });
})();
