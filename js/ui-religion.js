// =====================================================================
//  Faith tab (founding, faith points, world faith map, miracles, city
//  faiths, sending priests), the city-header faith chip, the realm-card
//  faith line, and the movement label for preaching priests.
// =====================================================================
'use strict';

(() => {
  const RG = () => G.RELIGION;
  const faithName = id => (S.faiths && S.faiths[id] ? S.faiths[id].name : 'Unbelievers');
  const faithIcon = id => (S.faiths && S.faiths[id] && DATA.gods[S.faiths[id].god] ? DATA.gods[S.faiths[id].god].icon : '·');
  const faithColor = id => (S.faiths && S.faiths[id] && S.faiths[id].color) || 'var(--muted)';
  const pctS = v => Math.round(v * 100) + '%';

  // a stacked bar of a city's faith shares
  const shareBar = city => {
    const fs = G.cityFaiths(city);
    const parts = Object.entries(fs).filter(([, v]) => v >= 0.01).sort((a, b) => (a[0] === 'none') - (b[0] === 'none') || b[1] - a[1]);
    return `<div class="rel-bar" title="${esc(parts.map(([k, v]) => `${k === 'none' ? 'No faith' : faithName(k)}: ${pctS(v)}`).join('\n'))}">${parts.map(([k, v]) =>
      `<i style="width:${v * 100}%;background:${k === 'none' ? 'transparent' : faithColor(k)}"></i>`).join('')}</div>`;
  };

  if (typeof MOVE_LABEL === 'object') MOVE_LABEL.preach = '📿 Preaching';

  // ---- city header chip ----
  CITY_EXTRAS.push(city => {
    if (!S || !S.faiths) return '';
    const maj = G.majorityFaith(city);
    const fs = G.cityFaiths(city);
    const mine = S.empires.p.faithId;
    const share = maj ? fs[maj] : fs.none;
    const split = Object.entries(fs).filter(([k, v]) => k !== 'none' && v > 0.25).length >= 2;
    const cls = maj && maj === mine ? 'good' : maj ? 'warn' : 'muted';
    return `<div class="row"><button class="rel-chip ${cls}" data-act="tab" data-t="religion" title="Faith in ${esc(city.name)} — click for the Faith tab">
      <span>${maj ? faithIcon(maj) : '⛪'}</span><b>${maj ? esc(faithName(maj)) : 'No majority faith'}</b><span class="muted">${pctS(share || 0)}</span>${split ? '<span class="bad">· divided</span>' : ''}</button></div>`;
  });

  // ---- realm cards on the Diplomacy tab ----
  REALM_EXTRAS.push(e => {
    if (!S || !S.faiths) return '';
    const f = G.stateFaith(S, e.id);
    const mine = S.empires.p.faithId;
    if (!f) return '<div class="muted" style="font-size:12.5px">⛪ No state faith yet.</div>';
    const g = DATA.gods[f.god];
    const rel = !mine ? '' : f.id === mine ? ' <span class="good">· shares your faith</span>' : ' <span class="warn">· another faith</span>';
    const hw = e.holyWar === 'p' ? ' <span class="bad">· holy war against you!</span>' : e.zealot ? ' <span class="muted">· zealous</span>' : '';
    return `<div style="font-size:12.5px">⛪ State faith: <b>${g.icon} ${esc(f.name)}</b> <span class="muted">(${esc(g.short)}${f.founder === e.id ? ', founders' : ''})</span>${rel}${hw}</div>`;
  });

  // ---- banner for the faith ending ----
  const banner = () => {
    if (S.gameOver === 'faith') {
      const e = S.empires[S.gameOverBy] || {};
      return `<div class="banner lose">⛪ ${esc(faithName(S.gameOverFaith))} of the ${esc(e.name || 'rival')} has swept the world. Their faith eclipses your crown — the game is lost.
        <div class="row" style="justify-content:center;margin-top:8px"><button class="primary" data-act="continueEndless">Play on in Endless mode</button><button data-act="newgame">Start a new game</button></div></div>`;
    }
    if (S.victory === 'faith') return `<div class="banner win">👑 Religious victory! ${esc(faithName(S.victoryFaith))} is the faith of the world.</div>`;
    return '';
  };

  // ---- the tab ----
  const renderReligion = city => {
    G.ensureReligion(S);
    const R = RG();
    const emp = S.empires.p;
    const f = G.stateFaith(S, 'p');
    const rate = G.faithRate(S, 'p');
    const parts = [banner()];

    parts.push(`<div class="card cult-head">
      <div class="row"><span style="font-size:34px">${f ? DATA.gods[f.god].icon : '⛪'}</span>
        <div><h2 style="margin:0">${f ? esc(f.name) : `Faith of ${esc(emp.name)}`}</h2>
          <div class="muted" style="font-size:13px">${f ? `Patron: ${esc(DATA.gods[f.god].name)} · ${f.founder === 'p' ? 'founded by your realm' : `adopted from the ${esc(S.empires[f.founder].name)}`}` : 'Your people have no state faith yet.'}</div></div>
        <span class="spacer"></span>
        <div class="cult-stat"><span class="muted">Faith</span><b>${fmt(emp.faith || 0)}</b><span class="muted">${fmtRate(rate)}/min</span></div>
        <div class="cult-stat"><span class="muted">Holy sites</span><b>${G.holySitesOf(S, 'p').length}/${G.holySites(S).length}</b><span class="muted">+${R.holyFaith}/min each</span></div>
      </div>
      ${f ? `<div class="row" style="margin-top:8px;gap:6px">${[DATA.gods[f.god], ...f.tenets.map(t => DATA.tenets[t])].map(x => `<span class="pill" title="${esc(x.desc)}">${x.icon} ${esc(x.short || x.name)}</span>`).join('')}</div>
        <p class="muted" style="font-size:12.5px;margin:6px 0 0">${esc(DATA.gods[f.god].desc)} ${f.tenets.map(t => esc(DATA.tenets[t].desc)).join(' ')}</p>` : ''}
    </div>`);

    // founding form / adopt
    const fst = G.foundStatus(S, 'p');
    if (!fst.have) {
      const lean = G.raceGods(emp.race);
      const fm = UI.form;
      const god = fm.rel_god || lean[0];
      const t1 = fm.rel_t1 || 'tithes', t2 = fm.rel_t2 || 'charity';
      const others = Object.values(S.faiths).filter(x => x.id !== emp.faithId);
      parts.push(`<div class="card"><h3>${f ? 'Found a faith of your own' : 'Found a faith'}</h3>
        <p class="muted" style="font-size:12.5px">Needs a ⛩️ Temple in one of your cities and ${R.foundCost} faith (from Shrines, Temples, happy cities and holy sites). Your people lean toward ${lean.map(g => `${DATA.gods[g].icon} ${esc(DATA.gods[g].short)}`).join(' and ')}.</p>
        <div class="rel-form">
          <label>Name <input type="text" maxlength="40" data-k="rel_name" value="${esc(fm.rel_name || '')}" placeholder="The Golden Way"></label>
          <label>Patron god <select data-k="rel_god">${DATA.godOrder.map(g => `<option value="${g}" ${g === god ? 'selected' : ''}>${DATA.gods[g].icon} ${esc(DATA.gods[g].name)}${lean.includes(g) ? ' ★' : ''}</option>`).join('')}</select></label>
          <label>First tenet <select data-k="rel_t1">${DATA.tenetOrder.map(t => `<option value="${t}" ${t === t1 ? 'selected' : ''}>${DATA.tenets[t].icon} ${esc(DATA.tenets[t].name)}</option>`).join('')}</select></label>
          <label>Second tenet <select data-k="rel_t2">${DATA.tenetOrder.map(t => `<option value="${t}" ${t === t2 ? 'selected' : ''}>${DATA.tenets[t].icon} ${esc(DATA.tenets[t].name)}</option>`).join('')}</select></label>
        </div>
        <p style="font-size:12.5px;margin:6px 0">${DATA.gods[god].icon} <b>${esc(DATA.gods[god].short)}:</b> ${esc(DATA.gods[god].desc)} · ${DATA.tenets[t1].icon} ${esc(DATA.tenets[t1].desc)} · ${DATA.tenets[t2].icon} ${esc(DATA.tenets[t2].desc)}</p>
        <div class="row"><button class="${fst.ok ? 'primary' : ''}" data-act="relFound" ${fst.ok ? '' : 'disabled'}>⛪ Found the faith · ${R.foundCost} faith</button>${fst.ok ? '' : `<span class="warn" style="font-size:12px">${esc(fst.reason)}</span>`}</div>
        ${others.length ? `<details style="margin-top:8px"><summary>…or adopt an existing faith (${R.adoptCost} faith)</summary>${others.map(x => { const st = G.adoptStatus(S, 'p', x.id); return `<div class="row" style="margin-top:4px">${DATA.gods[x.god].icon} <b>${esc(x.name)}</b><span class="muted" style="font-size:12px">${esc(DATA.gods[x.god].short)} · ${x.tenets.map(t => DATA.tenets[t].name).join(', ')} · of the ${esc(S.empires[x.founder].name)}</span><span class="spacer"></span><button class="small" data-act="relAdopt" data-f="${x.id}" ${st.ok ? '' : 'disabled'} title="${esc(st.reason || '')}">Adopt</button></div>`; }).join('')}</details>` : ''}
      </div>`);
    }

    // world faith map
    const w = G.faithWorld(S);
    const rows = Object.values(S.faiths).map(x => {
      const pr = G.faithProgress(S, x.id);
      const followers = Object.values(S.empires).filter(e => !e.dead && e.faithId === x.id).map(e => e.id === 'p' ? 'you' : esc(e.name));
      return { x, pr, followers };
    }).sort((a, b) => b.pr.n - a.pr.n);
    parts.push(`<div class="card"><h3>The world's faiths <span class="muted" style="font-size:13px">${w.total} cities · ${w.none} without a majority</span></h3>
      ${rows.length ? `<table><tr><th>Faith</th><th>Majority in</th><th>Toward a religious victory</th><th>Followed by</th></tr>${rows.map(({ x, pr, followers }) => `<tr>
        <td><span class="dot" style="background:${x.color}"></span> ${DATA.gods[x.god].icon} <b>${esc(x.name)}</b>${x.id === emp.faithId ? ' <span class="pill good">yours</span>' : ''}</td>
        <td>${pr.n} (${pctS(pr.share)})</td>
        <td><div class="bar" style="min-width:110px" title="${pctS(pr.share)} of ${pctS(pr.need)} of the world's cities"><i style="width:${Math.min(100, pr.share / pr.need * 100)}%"></i></div>
          <span class="muted" style="font-size:11.5px">rivals touched ${pr.covered}/${pr.rivals}${pr.alive ? '' : ' · founders lost it'}</span></td>
        <td style="font-size:12px">${followers.join(', ') || '<span class="muted">none</span>'}</td></tr>`).join('')}</table>` : '<p class="muted">No faith has been founded yet.</p>'}
      <p class="muted" style="font-size:12px;margin-bottom:0">${S.settings.mode === 'conquest' ? `Religious victory (Conquest): your faith is the majority in ${pctS(R.victoryShare)} of all cities and in at least one city of every living rival${S.time < R.victoryMinHours * 3600 * G.pace(S).time ? ` — possible after ${R.victoryMinHours} game-hours (in ${fmtTime(realSecs(R.victoryMinHours * 3600 * G.pace(S).time - S.time))})` : ''}. A rival faith doing the same defeats you.` : 'Endless mode: no religious victory.'}</p>
    </div>`);

    // miracles
    const cid = city.id;
    parts.push(`<div class="card"><h3>Miracles <span class="muted" style="font-size:13px">costs rise each time a miracle is used · city miracles target ${esc(city.name)}</span></h3><div class="grid">${DATA.miracleOrder.map(k => {
      const d = DATA.miracles[k];
      const st = G.miracleStatus(S, 'p', k, cid);
      return `<div class="card trad"><div class="head"><span class="ico">${d.icon}</span><b>${d.name}</b></div><div class="desc">${d.desc}</div>
        <div class="row"><button class="${st.ok ? 'primary' : ''}" data-act="relMiracle" data-m="${k}" data-c="${cid}" ${st.ok ? '' : 'disabled'}>Invoke · 🙏 ${fmt(st.cost || G.miracleCost(S, 'p', k))}</button>${st.ok ? '' : `<span class="muted" style="font-size:12px">${esc(st.reason)}</span>`}</div></div>`;
    }).join('')}</div></div>`);

    // send priests
    const pri = city.units.priest || 0;
    const kn = 'rel_n';
    const targets = Object.values(S.cities).filter(c => c !== city && S.explored[c.y * S.map + c.x] && G.dist(c, city) <= 16).sort((a, b) => G.dist(a, city) - G.dist(b, city)).slice(0, 14);
    parts.push(`<div class="card"><h3>📿 Priests of ${esc(city.name)} <span class="muted" style="font-size:13px">${pri} here</span></h3>
      <p class="muted" style="font-size:12.5px">Train priests at a Temple in the 🛡️ Military tab (each costs 1 citizen and 30 faith). Sent to a city — a rival's or your own divided one — each priest converts about ${pctS(R.priestConvert)} of its people (${pctS(R.priestCap)} at most per visit; rival temples resist). Priests stay where they preach.</p>
      ${!emp.faithId ? '<p class="warn">Found or adopt a faith first.</p>' : pri ? `<div class="row"><label>Priests to send <input type="number" min="1" max="${pri}" data-k="${kn}" value="${esc(UI.form[kn] || Math.min(pri, 3))}"></label>
        <button class="small" data-act="relPreachHere" ${(G.cityFaiths(city)[emp.faithId] || 0) > 0.9 ? 'disabled' : ''} title="Convert part of ${esc(city.name)} itself">Preach here in ${esc(city.name)} (yours ${pctS(G.cityFaiths(city)[emp.faithId] || 0)})</button></div>
      <table><tr><th>City</th><th>Realm</th><th>Faiths</th><th>Distance</th><th></th></tr>${targets.map(c => {
        const mine = (G.cityFaiths(c)[emp.faithId] || 0);
        return `<tr><td>${esc(c.name)}</td><td style="font-size:12px">${c.owner === 'p' ? 'yours' : esc(S.empires[c.owner].name)}</td><td>${shareBar(c)}<span class="muted" style="font-size:11px">yours ${pctS(mine)}</span></td><td>${G.dist(c, city).toFixed(1)}</td>
          <td><button class="small" data-act="relPreach" data-c="${c.id}" ${mine > 0.9 ? 'disabled' : ''}>Send priests</button></td></tr>`;
      }).join('')}</table>` : '<p class="muted">No priests in this city.</p>'}
    </div>`);

    // own cities
    const cities = G.citiesOf(S, 'p');
    parts.push(`<div class="card"><h3>Faith in your cities</h3><table><tr><th>City</th><th>Faiths</th><th>Majority</th><th>Faith/min</th><th>Hint</th></tr>${cities.map(c => {
      const maj = G.majorityFaith(c);
      const fs = G.cityFaiths(c);
      const split = Object.entries(fs).filter(([k, v]) => k !== 'none' && v > 0.25).length >= 2;
      const hint = !emp.faithId ? (G.lvl(c, 'temple') ? '' : 'Build a Temple') : split ? 'Divided — send priests' : (fs[emp.faithId] || 0) < 0.5 ? 'Send priests or build a Shrine' : G.lvl(c, 'temple') && !c.units.priest ? 'Can train priests' : '';
      return `<tr class="${c.id === city.id ? 'cur' : ''}"><td><button class="link" data-act="city" data-c="${c.id}">${esc(c.name)}</button></td><td>${shareBar(c)}</td><td style="font-size:12px">${maj ? `${faithIcon(maj)} ${esc(faithName(maj))} ${pctS(fs[maj])}` : '<span class="muted">none</span>'}</td><td>${G.cityFaithRate(S, c).toFixed(1)}</td><td class="muted" style="font-size:12px">${hint}</td></tr>`;
    }).join('')}</table></div>`);

    // holy sites
    parts.push(`<div class="card"><h3>Holy sites</h3><table><tr><th>Site</th><th>Where</th><th>Held by</th></tr>${G.holySites(S).map(t => {
      const i = G.holySiteInfo(S, t);
      const known = S.explored[t.y * S.map + t.x];
      const h = G.holySiteHolder(S, t);
      return `<tr><td>${DATA.gods[i.god].icon} ${esc(i.name)}</td><td>${known ? `${i.kind === 'ruin' ? 'Ruins' : 'Oasis'} (${t.x}, ${t.y})` : '<span class="muted">unexplored</span>'}</td><td style="font-size:12px">${h ? (h.owner === 'p' ? `<span class="good">${esc(h.name)}</span>` : esc(S.empires[h.owner].name)) : '<span class="muted">no one</span>'}</td></tr>`;
    }).join('')}</table>
      <p class="muted" style="font-size:12px;margin-bottom:0">Hold an oasis site by claiming the oasis; a ruin site belongs to the nearest city whose reach covers it (reach + 1.5 tiles). Winning a fight at a holy site brings pilgrims (+50 faith, once an hour).</p></div>`);

    parts.push(`<div class="card help"><details><summary><b>How faith works</b></summary><ul style="font-size:13px">
      <li><b>Faith</b> comes from 🕯️ Shrines (+${R.shrineFaith}/level), ⛩️ Temples (+${R.templeFaith}/level), happy cities (+${R.happyFaith}, jubilant +${R.jubilantFaith}), cities that follow your faith and holy sites (+${R.holyFaith}).</li>
      <li><b>Spread:</b> every city holds a mix of faiths. Each few seconds it drifts toward the pressure on it: its own believers, your state faith (stronger with temples and shrines) and nearby cities within ${R.reach} tiles, weighted by their temples.</li>
      <li><b>Happiness:</b> a majority of your state faith gives up to +${R.stateHappy}; a city split between two faiths (each over 25%) loses up to ${R.splitHappy}.</li>
      <li><b>Diplomacy:</b> realms sharing your faith warm to you; other faiths cause slight friction, and zealots may proclaim a holy war.</li>
      <li><b>Conquest:</b> heralds lower loyalty 1.5× as fast in a city whose majority follows your faith.</li>
    </ul></details></div>`);
    return parts.join('');
  };

  // put the Faith tab right after Culture
  const entries = Object.entries(TABS).filter(([k]) => k !== 'religion');
  for (const [k] of entries) delete TABS[k];
  const tab = { label: '⛪ Faith', render: c => renderReligion(c), badge: () => (S && S.empires.p.faithId === null && G.foundStatus(S, 'p').ok ? 1 : 0) };
  let placed = false;
  for (const [k, v] of entries) {
    TABS[k] = v;
    if (k === 'culture') { TABS.religion = tab; placed = true; }
  }
  if (!placed) TABS.religion = tab;

  Object.assign(act, {
    relFound: () => {
      const lean = G.raceGods(S.empires.p.race);
      const err = G.foundFaith(S, 'p', { name: UI.form.rel_name || '', god: UI.form.rel_god || lean[0], tenets: [UI.form.rel_t1 || 'tithes', UI.form.rel_t2 || 'charity'] });
      toast(err || `${faithName(S.empires.p.faithId)} is founded!`); render(true);
    },
    relAdopt: d => { toast(G.adoptFaith(S, 'p', d.f) || `You embrace ${faithName(d.f)}`); render(true); },
    relMiracle: d => { const err = G.castMiracle(S, 'p', d.m, d.c); toast(err || `${DATA.miracles[d.m].name} invoked`); render(true); },
    relPreachHere: () => {
      const c = curCity(); const n = Math.max(1, Math.min(c.units.priest || 0, parseInt(UI.form.rel_n || Math.min(c.units.priest || 0, 3), 10) || 1));
      toast(G.preachHere(S, c.id, n) || `${n} priest${n === 1 ? '' : 's'} preach in ${c.name}`); render(true);
    },
    relPreach: d => {
      const from = curCity(); const tc = S.cities[d.c];
      if (!tc) { toast('That city is gone'); return; }
      const n = Math.max(1, Math.min(from.units.priest || 0, parseInt(UI.form.rel_n || Math.min(from.units.priest || 0, 3), 10) || 1));
      const err = G.sendArmy(S, from.id, tc.x, tc.y, 'preach', { priest: n });
      toast(err || `${n} priest${n === 1 ? '' : 's'} set out for ${tc.name}`); render(true);
    },
  });
})();
