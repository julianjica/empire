// =====================================================================
//  Magic tab: mana, schools, the spellbook, weave strain, the ley
//  network and the Great Working; plus a mana chip in the city header.
//  Tile spells hand off to the World map (worldmap.js) through
//  UI.spellTarget = { spell, city }.
// =====================================================================
'use strict';
(() => {
  const STRAIN_WARN = 60;
  const OWNER = 'p';
  const ARCANE = '#8a5cd6';

  // ---- helpers ----------------------------------------------------------
  const strainOf = cityId => ((S.magic && S.magic.strain) || {})[cityId] || 0;
  const manaIncome = () => G.citiesOf(S, OWNER).reduce((a, c) => a + (G.econ(S, c).net.mana || 0), 0);
  let lastSideCity = null;
  const castCity = () => {
    // follow the sidebar's city whenever it changes
    if (UI.city !== lastSideCity) { lastSideCity = UI.city; delete UI.form.mg_city; }
    const id = UI.form.mg_city;
    const c = id && S.cities[id];
    if (c && c.owner === OWNER) return c;
    return curCity();
  };
  const schoolPill = k => {
    const sc = DATA.schools[k];
    const god = DATA.gods && DATA.gods[sc.god];
    return `<span class="mg-school" style="--school:${sc.color}" title="${esc(sc.name)}${god ? ' · aligned with ' + esc(god.name) : ''}">${sc.icon} ${esc(sc.name)}${god ? ` <span class="mg-god">${god.icon}</span>` : ''}</span>`;
  };
  const manaCost = cost => `<span class="mg-cost ${G.manaOf(S, OWNER) < cost ? 'lack' : ''}" title="Mana, drawn from the casting city first, then from your other cities">✨ ${fmt(cost)}</span>`;
  const strainBar = v => {
    const lvl = v > STRAIN_WARN ? 'hi' : v > STRAIN_WARN * 0.6 ? 'mid' : 'lo';
    return `<div class="mg-strain mg-${lvl}" title="Weave strain ${Math.round(v)}. It fades by 2 per minute; above ${STRAIN_WARN} wild magic may lash back."><i style="width:${Math.min(100, v)}%"></i><span>${Math.round(v)}</span></div>`;
  };
  const ownerName = owner => owner === OWNER ? 'you' : (S.empires[owner] ? S.empires[owner].name : 'a realm');
  // the Great Working stage time mirrors G.beginWorkingStage
  const stageTime = stage => G.workingStageTime ? G.workingStageTime(S, stage) : Math.round(2400 * Math.pow(1.25, stage) * G.pace(S).time);

  // valid targets for a spell, cast from city `from`
  const targetsFor = (sp, from) => {
    if (sp.target === 'city') return G.citiesOf(S, OWNER).map(c => ({ id: c.id, label: c.name }));
    if (sp.target === 'enemy') return Object.values(S.cities)
      .filter(c => c.owner !== OWNER && S.explored[c.y * S.map + c.x] && Math.hypot(c.x - from.x, c.y - from.y) <= 14)
      .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))
      .map(c => ({ id: c.id, label: `${c.name} (${S.empires[c.owner].name}, ${Math.hypot(c.x - from.x, c.y - from.y).toFixed(1)} tiles)` }));
    return [];
  };
  const chosenTarget = (id, opts, fallback) => {
    const v = UI.form['mg_t_' + id];
    if (opts.some(o => o.id === v)) return v;
    if (fallback && opts.some(o => o.id === fallback)) return fallback;
    return opts.length ? opts[0].id : null;
  };

  // ---- header ------------------------------------------------------------
  const headerHtml = () => {
    const mine = G.schoolsOf(S, OWNER);
    const race = S.empires[OWNER].race;
    const patron = G.patronOf ? G.patronOf(S, OWNER) : null;
    const tower = G.towerLevel(S, OWNER);
    const inc = manaIncome();
    // schools a faith could open, grouped by god
    const byGod = {};
    for (const k of DATA.schoolOrder) if (!mine.includes(k)) (byGod[DATA.schools[k].god] = byGod[DATA.schools[k].god] || []).push(k);
    const hints = Object.entries(byGod).map(([god, ks]) => {
      const g = DATA.gods && DATA.gods[god];
      return `<li>Follow a faith whose patron is <b>${g ? g.icon + ' ' + esc(g.short) : esc(god)}</b> to learn ${ks.map(k => `<span style="color:${DATA.schools[k].color}">${DATA.schools[k].icon} ${esc(DATA.schools[k].name)}</span>`).join(' and ')}.</li>`;
    }).join('');
    return `<div class="card mg-head">
      <div class="row"><span class="mg-orb">🔮</span>
        <div><h2 style="margin:0">Magic of ${esc(S.empires[OWNER].name)}</h2>
          <div class="muted" style="font-size:13px">Mana flows from the land; Mage Towers turn it into spells.</div></div>
        <span class="spacer"></span>
        <div class="mg-stat"><span class="muted">Mana</span><b>✨ ${fmt(G.manaOf(S, OWNER))}</b><span class="${inc > 0 ? 'good' : 'muted'}">${fmtRate(inc)}/min</span></div>
        <div class="mg-stat"><span class="muted">Mage Tower</span><b>🔮 ${tower || '—'}</b><span class="muted">${tower ? 'highest level' : 'not built'}</span></div>
      </div>
      <div class="row mg-schools">
        <span class="muted" style="font-size:12.5px">Your schools:</span>
        ${mine.length ? mine.map(k => schoolPill(k) + `<span class="muted mg-why">${DATA.schools[k].race === race ? 'native' : 'faith'}${DATA.schools[k].god === patron && DATA.schools[k].race === race ? ' + faith' : ''}</span>`).join('') : '<span class="muted" style="font-size:12.5px">none yet. Only the open arts.</span>'}
      </div>
      ${hints ? `<details class="mg-hints"><summary class="muted">More schools through faith</summary><ul>${hints}</ul>
        <p class="muted" style="font-size:12px;margin:4px 0 0">Your faith's patron school also costs 15% less to cast.${patron ? '' : ' Found or adopt a faith in the ⛪ Faith tab.'}</p></details>` : ''}
      ${tower ? '' : `<p class="warn" style="font-size:12.5px;margin:6px 0 0">Build a 🔮 Mage Tower (Town Hall 4, Academy 1) to cast spells. Tiers unlock at tower levels 1, 5, 10 and 15.</p>`}
    </div>`;
  };

  // ---- spellbook ----------------------------------------------------------
  const spellCard = (id, from) => {
    const sp = DATA.spells[id];
    const st = G.spellStatus(S, OWNER, from.id, id);
    if (st.hidden) return '';
    const color = sp.school ? DATA.schools[sp.school].color : sp.shape ? '#7b6a3a' : ARCANE;
    let picker = '', canTarget = true;
    if (sp.target === 'city' || sp.target === 'enemy') {
      const opts = targetsFor(sp, from);
      const cur = chosenTarget(id, opts, sp.target === 'city' ? from.id : null);
      if (opts.length) picker = `<select data-k="mg_t_${id}" aria-label="Target of ${esc(sp.name)}">${opts.map(o => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      else { canTarget = false; picker = `<span class="muted" style="font-size:12px">No known foreign city within 14 tiles of ${esc(from.name)}.</span>`; }
    } else if (sp.target === 'realm') picker = '<span class="muted" style="font-size:12px">Whole realm</span>';
    else picker = `<span class="muted" style="font-size:12px">${sp.shape ? `Within ${(G.cityReach(S, from) + 3).toFixed(1)} tiles` : 'Any place'}</span>`;
    const ok = st.ok && canTarget;
    const btn = sp.target === 'tile'
      ? `<button class="${ok ? 'primary' : ''}" data-act="mgCast" data-id="${id}" ${ok ? '' : 'disabled'}>🗺️ Pick on the World map</button>`
      : `<button class="${ok ? 'primary' : ''}" data-act="mgCast" data-id="${id}" ${ok ? '' : 'disabled'}>Cast</button>`;
    return `<div class="card mg-spell ${st.locked ? 'locked' : ''}" style="--school:${color}">
      <div class="head"><span class="ico">${sp.icon}</span>
        <div><b>${esc(sp.name)}</b><div class="muted" style="font-size:11.5px">Tier ${sp.tier} · ${{ city: 'your city', enemy: 'foreign city', realm: 'realm', tile: 'a place' }[sp.target]} · strain +${sp.strain} · cooldown ${sp.cool} min</div></div>
        ${manaCost(st.cost)}</div>
      <div class="desc">${esc(sp.desc)}</div>
      <div class="row mg-cast">${picker}<span class="spacer"></span>${btn}</div>
      ${!st.ok ? `<div class="${st.poor ? 'muted' : 'warn'}" style="font-size:12px">${esc(st.reason)}</div>` : ''}
    </div>`;
  };

  const spellbookHtml = () => {
    const from = castCity();
    const spells = G.spellsOf(S, OWNER);
    const groups = [];
    for (const k of G.schoolsOf(S, OWNER)) groups.push({ title: `${DATA.schools[k].icon} ${DATA.schools[k].name}`, color: DATA.schools[k].color, ids: spells.filter(id => DATA.spells[id].school === k) });
    groups.push({ title: '📖 Open arts', color: ARCANE, ids: spells.filter(id => !DATA.spells[id].school && !DATA.spells[id].shape) });
    groups.push({ title: '🌍 World-shaping', color: '#7b6a3a', ids: spells.filter(id => DATA.spells[id].shape), note: 'Mage Tower 15. Reshape the land near the casting city.' });
    const cities = G.citiesOf(S, OWNER);
    return `<div class="card"><div class="row"><h3 style="margin:0">📜 Spellbook</h3><span class="spacer"></span>
        <label class="muted mg-from">Casting city <select data-k="mg_city">${cities.map(c => `<option value="${c.id}" ${c.id === from.id ? 'selected' : ''}>${esc(c.name)} · tower ${G.lvl(c, 'magetower') || '—'}</option>`).join('')}</select></label></div>
      <p class="muted" style="font-size:12.5px;margin:6px 0 4px">A spell's tier needs that Mage Tower level in the casting city. Casting the same spell again within an hour costs 20% more.</p>
      ${groups.filter(g => g.ids.length).map(g => `<div class="mg-group" style="--school:${g.color}"><div class="group-title">${g.title}${g.note ? ` <span class="mg-note">· ${g.note}</span>` : ''}</div>
        <div class="grid">${g.ids.map(id => spellCard(id, from)).join('')}</div></div>`).join('')}
    </div>`;
  };

  // ---- strain -------------------------------------------------------------
  const strainHtml = () => {
    const rows = G.citiesOf(S, OWNER).map(c => {
      const v = strainOf(c.id), ward = c.ward > S.time;
      return `<div class="mg-row"><b class="mg-cname">${esc(c.name)}</b>${strainBar(v)}
        <span class="muted" style="font-size:12px">${ward ? '🛡️ warded' : v > 0 ? `clear in ${fmtTime(realSecs(v / 2 * 60))}` : 'calm'}</span>
        ${v > STRAIN_WARN && !ward ? '<span class="bad" style="font-size:12px">Wild magic may lash back: rifts, tempests or surges.</span>' : ''}</div>`;
    }).join('');
    return `<div class="card"><h3>🌀 Weave strain</h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">Every spell strains the weave around its casting city. Strain fades by 2 per minute. Above ${STRAIN_WARN}, wild magic may open demon rifts, call tempests or burn away mana. A 🛡️ Ward of Weaving holds it back.</p>${rows}</div>`;
  };

  // ---- ley network ---------------------------------------------------------
  const leyHtml = () => {
    if (!S.ley) return '<div class="card"><h3>🌐 Ley network</h3><p class="muted">The ley lines are still settling. Look again in a moment.</p></div>';
    const nodes = S.ley.nodes;
    const seen = nodes.filter(n => S.explored[n.y * S.map + n.x]);
    const held = G.nodesOf(S, OWNER).length;
    const rows = seen.map(n => ({ n, tap: G.nodeTapper(S, n) }))
      .sort((a, b) => ((b.tap && b.tap.owner === OWNER) - (a.tap && a.tap.owner === OWNER)) || b.n.power - a.n.power)
      .map(({ n, tap }) => {
        const col = tap ? S.empires[tap.owner].color : ARCANE;
        return `<div class="mg-row mg-node"><span class="mg-rune" style="--rune:${col}">${'◆'.repeat(n.power)}</span>
          <b>Enclave ×${n.power}</b><span class="muted" style="font-size:12px">(${n.x}, ${n.y})</span>
          <span style="font-size:12.5px">${tap ? `tapped by <b style="color:${col}">${esc(tap.name)}</b>${tap.owner === OWNER ? '' : ` <span class="muted">(${esc(S.empires[tap.owner].name)})</span>`}` : '<span class="muted">untapped</span>'}</span>
          <span class="spacer"></span><button class="small" data-act="mgShow" data-x="${n.x}" data-y="${n.y}">Show on map</button></div>`;
      }).join('');
    const mineP = G.citiesOf(S, OWNER).map(c => [c, G.leyPower(S, c)]).filter(([, p]) => p > 0);
    return `<div class="card"><h3>🌐 Ley network <span class="muted" style="font-size:13px">you hold ${held} of ${nodes.length} enclaves</span></h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">Where ley lines cross, the land brims with power. A city taps every enclave within its reach that no nearer city claims: more mana, and a stronger tower. Settle on or near enclaves; a city right on one draws double.</p>
      ${mineP.length ? `<div class="row" style="gap:6px;margin-bottom:6px">${mineP.map(([c, p]) => `<span class="pill good">✨ ${esc(c.name)} · ley ×${p}</span>`).join('')}</div>` : ''}
      ${rows || '<p class="muted">You have not found any enclave yet. Explore to find the glowing lines.</p>'}
      ${nodes.length > seen.length ? `<p class="muted" style="font-size:12px;margin-bottom:0">${nodes.length - seen.length} enclave${nodes.length - seen.length === 1 ? '' : 's'} still undiscovered.</p>` : ''}
    </div>`;
  };

  // ---- the Great Working ---------------------------------------------------
  const pips = (stage, color, active) => `<span class="mg-pips">${Array.from({ length: G.WORKING_STAGES }, (_, i) => `<i class="${i < stage ? 'on' : i === stage && active ? 'run' : ''}" style="--c:${color}"></i>`).join('')}</span>`;
  const workingHtml = () => {
    const ws = G.workingStatus(S, OWNER);
    const W = (S.magic && S.magic.working && S.magic.working[OWNER]) || null;
    const tower = ws.city ? G.lvl(ws.city, 'magetower') : 0;
    const need = G.workingNeeds;
    const req = (ok, txt) => `<li class="${ok ? 'good' : 'muted'}">${ok ? '✓' : '○'} ${txt}</li>`;
    let progress = '';
    if (ws.active && W) {
      const city = S.cities[W.city];
      progress = `<div class="queue-item"><div>Stage ${W.stage + 1} in ${esc(city ? city.name : '?')}<div class="bar mg-bar"><i style="width:${pct(S.time - W.start, W.end - W.start)}%"></i></div></div><span class="muted">${fmtTime(realSecs(W.end - S.time))}</span><span></span></div>
        <p class="muted" style="font-size:12px">Keep the city and ${need.nodes} enclaves until the stage ends, or it fails.</p>`;
    }
    const rivals = Object.values(S.empires).filter(e => e.id !== OWNER && !e.dead).map(e => {
      const w = (S.magic && S.magic.working && S.magic.working[e.id]) || { stage: 0 };
      return `<div class="mg-row"><span class="dot" style="background:${e.color}"></span><span style="min-width:140px">${esc(e.name)}</span>${pips(w.stage, e.color, !!w.end)}<span class="muted" style="font-size:12px">${w.stage >= G.WORKING_STAGES ? 'complete' : w.end ? 'a stage under way' : w.stage ? `${w.stage}/${G.WORKING_STAGES}` : 'not begun'}</span></div>`;
    }).join('');
    const conquest = S.settings.mode === 'conquest';
    return `<div class="card mg-working"><h3>🌌 The Great Working</h3>
      <p style="font-size:13px;margin-top:0">A ritual in ${G.WORKING_STAGES} stages that binds the weave of the world. ${conquest ? '<b>Completing it wins the game in Conquest.</b>' : 'In Endless mode it brings glory (+250 renown).'} Each finished stage adds +10% mana and +5% spell power. Rivals grow hostile toward any realm at work on it.</p>
      <div class="row">${pips(ws.stage, ARCANE, ws.active)}<b>${ws.done ? 'Complete!' : `Stage ${ws.stage} of ${G.WORKING_STAGES} done`}</b></div>
      ${progress}
      ${ws.done ? '' : `<ul class="mg-req">
        ${req(ws.nodes >= need.nodes, `Hold ${need.nodes} ley enclaves (you hold ${ws.nodes})`)}
        ${req(tower >= need.tower, `A Mage Tower ${need.tower} (best: ${tower || 'none'}${ws.city && tower ? ' in ' + esc(ws.city.name) : ''})`)}
      </ul>
      <div class="row"><span class="muted" style="font-size:12.5px">Stage ${ws.stage + 1}:</span>
        <span class="cost"><span class="${G.manaOf(S, OWNER) < ws.cost.mana ? 'lack' : ''}">✨ ${fmt(ws.cost.mana)}</span><span class="${S.empires[OWNER].gold < ws.cost.gold ? 'lack' : ''}">🪙 ${fmt(ws.cost.gold)}</span></span>
        <span class="muted" style="font-size:12px">⏱ ${fmtTime(realSecs(stageTime(ws.stage)))} · strain +25</span>
        <span class="spacer"></span>
        <button class="${ws.ok ? 'primary' : ''}" data-act="mgWork" ${ws.ok ? '' : 'disabled'}>Begin stage ${ws.stage + 1}</button></div>
      ${!ws.ok && ws.reason ? `<div class="${ws.poor ? 'muted' : 'warn'}" style="font-size:12px;margin-top:4px">${esc(ws.reason)}</div>` : ''}`}
      ${rivals ? `<div class="group-title" style="margin-top:10px">Rivals</div>${rivals}` : ''}
    </div>`;
  };

  const renderMagic = () => [headerHtml(), spellbookHtml(), strainHtml(), leyHtml(), workingHtml()].join('');

  // ---- city header chip ----------------------------------------------------
  CITY_EXTRAS.push(city => {
    if (!S || !city) return '';
    const e = G.econ(S, city);
    const lp = G.leyPower(S, city);
    const v = strainOf(city.id);
    return `<div class="row mg-chiprow"><button class="mg-chip" data-act="tab" data-t="magic" title="Mana made in ${esc(city.name)} per minute${lp > 0 ? '; this city taps a ley enclave' : ''}">✨ <b>${fmtRate(e.net.mana || 0)}</b>/min${lp > 0 ? `<span class="mg-ley">ley enclave ×${lp}</span>` : ''}</button>
      ${v > STRAIN_WARN && !(city.ward > S.time) ? `<span class="bad" style="font-size:12.5px">🌀 Weave strain ${Math.round(v)}: wild magic may lash back</span>` : ''}</div>`;
  });

  // ---- tab placement: after Faith, else after Culture ------------------------
  {
    const entries = Object.entries(TABS).filter(([k]) => k !== 'magic');
    for (const [k] of entries) delete TABS[k];
    const tab = {
      label: '🔮 Magic', render: () => renderMagic(),
      badge: () => (S ? G.citiesOf(S, OWNER).filter(c => strainOf(c.id) > STRAIN_WARN && !(c.ward > S.time)).length : 0),
    };
    const anchor = entries.some(([k]) => k === 'religion') ? 'religion' : entries.some(([k]) => k === 'culture') ? 'culture' : null;
    let placed = false;
    for (const [k, v] of entries) {
      TABS[k] = v;
      if (k === anchor) { TABS.magic = tab; placed = true; }
    }
    if (!placed) TABS.magic = tab;
  }

  // ---- actions --------------------------------------------------------------
  Object.assign(act, {
    mgCast: d => {
      const sp = DATA.spells[d.id], from = castCity();
      if (!sp || !from) return;
      if (sp.target === 'tile') {
        const st = G.spellStatus(S, OWNER, from.id, d.id);
        if (!st.ok) { toast(st.reason); return; }
        UI.spellTarget = { spell: d.id, city: from.id };
        UI.tab = 'world'; window.scrollTo(0, 0); render(true);
        return;
      }
      let target = null;
      if (sp.target === 'city' || sp.target === 'enemy') {
        const opts = targetsFor(sp, from);
        target = chosenTarget(d.id, opts, sp.target === 'city' ? from.id : null);
        if (!target) { toast('No target in range'); return; }
      }
      const err = G.castSpell(S, OWNER, from.id, d.id, target);
      toast(err || `${sp.icon} ${sp.name} cast${target && S.cities[target] ? ' on ' + S.cities[target].name : ''}`);
      render(true);
    },
    mgWork: () => { const err = G.beginWorkingStage(S, OWNER); toast(err || '🌌 The Great Working begins a new stage'); render(true); },
    mgShow: d => { UI.tab = 'world'; UI.sel = { x: +d.x, y: +d.y }; window.scrollTo(0, 0); render(true); },
  });

  // selects re-render at once (ui-core only does this on the World tab)
  document.addEventListener('change', ev => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (!k || !k.startsWith('mg_') || UI.tab !== 'magic') return;
    UI.form[k] = ev.target.value;
    ev.target.blur(); render(true);
  });
})();
