// =====================================================================
//  Hero, Research, Diplomacy tabs + Decisions and Quests (right column)
// =====================================================================
'use strict';

// ---------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------
const itemHtml = (it, actions) => `<div class="item" style="border-color:${DATA.rarity[it.rarity].color}">
  <div class="row"><span style="font-size:22px">${it.icon}</span><div><b style="color:${DATA.rarity[it.rarity].color}">${esc(it.name)}</b> <span class="muted" style="font-size:11px">${DATA.rarity[it.rarity].name} ${it.slot}</span><div class="muted" style="font-size:12px">${G.itemText(it)}</div></div><span class="spacer"></span>${actions}</div></div>`;

const renderHero = city => {
  const h = G.hero(S);
  if (!h) return '<div class="card"><p class="muted">No hero.</p></div>';
  const st = G.heroStats(S, 'p');
  const where = G.heroCity(S);
  const moving = G.heroMoving(S);
  let status;
  if (h.dead) {
    const cost = G.reviveCost(S);
    const cap = G.capital(S, 'p');
    status = h.reviveAt
      ? `<p>☠️ Fallen. Rising again in ${esc(cap.name)} in <b>${fmtTime(realSecs(h.reviveAt - S.time))}</b>.</p>`
      : `<p class="bad">☠️ ${esc(h.name)} has fallen.</p>${costHtml(cost, cap)}<button class="primary" data-act="revive">Revive in ${esc(cap.name)}</button> <span class="muted" style="font-size:12px">⏱ ${fmtTime(realSecs(90 * h.level * G.pace(S).time))}</span>`;
  } else if (moving) status = `<p>🐎 On the march (${MOVE_LABEL[moving.type].toLowerCase()} to ${placeName(moving.x, moving.y)}), arriving in ${fmtTime(realSecs(moving.arrive - S.time))}.</p>`;
  else if (where) status = `<p>🏠 Resting in <b>${esc(where.name)}</b>. Stewardship and Warding apply to this city. Move the hero with 🛡️ Reinforce on the World map.</p>`;
  else status = '<p class="muted">Whereabouts unknown.</p>';

  const ruins = S.special.filter(t => t.ruin && S.explored[G.tileIdx(S, t)])
    .map(t => ({ t, d: where ? G.dist(where, t) : 0 })).sort((a, b) => a.d - b.d).slice(0, 8);

  return `<div class="card"><div class="row pt-herohead">${ptHtml(heroSpec(h, 'p'), 112, 'pt-card pt-big', h.name) || '<span style="font-size:40px">🦸</span>'}<div><h2 style="margin:0">${esc(h.name)} <button class="small" data-act="renameHero">Rename</button></h2>
      <div class="muted">Level ${h.level} · ${h.adventures || 0} adventures</div></div></div>
    <div style="margin-top:8px">Experience ${fmt(h.xp)} / ${fmt(G.xpNeed(h.level))}<div class="bar"><i style="width:${pct(h.xp, G.xpNeed(h.level))}%"></i></div></div>
    <div style="margin-top:6px">Health ${Math.floor(h.hp)} / 100<div class="bar hp"><i style="width:${h.hp}%"></i></div></div>
    ${status}
    <div class="stats" style="font-size:13px"><span>⚔️ <b>${st.atk}</b> attack</span><span>🛡️ <b>${st.defI}</b> defense</span><span>💨 <b>${st.spd}</b> speed</span><span>🎺 army +${Math.round((G.heroLeadership(S, 'p') - 1) * 100)}%</span><span>🏰 city defense +${2 * h.points.guard}%</span><span>📜 city goods +${2 * h.points.econ}%</span>${h.points.arcana ? `<span>🔮 spells +${4 * h.points.arcana}% power, −${Math.min(50, 3 * h.points.arcana)}% cost</span>` : ''}</div>
  </div>
  <div class="card"><h3>Attributes ${h.free ? `<span class="pill good">${h.free} to spend</span>` : ''}</h3>
    <div class="grid">${Object.entries(DATA.heroAttrs).map(([k, a]) => `<div class="row"><span style="font-size:20px">${a.icon}</span><div><b>${a.name}</b> ${h.points[k]}<div class="muted" style="font-size:12px">${a.desc}</div></div><span class="spacer"></span><button class="small" data-act="heroPoint" data-a="${k}" ${h.free ? '' : 'disabled'}>+</button></div>`).join('')}</div>
  </div>
  <div class="card"><h3>Equipment</h3><div class="grid">${['weapon', 'armor', 'horse', 'trinket'].map(sl => h.eq[sl] ? itemHtml(h.eq[sl], `<button class="small" data-act="unequip" data-s="${sl}">Remove</button>`) : `<div class="item muted">Empty ${sl} slot</div>`).join('')}</div>
    <h4 style="margin-top:12px">Saddlebags</h4>
    ${h.items.length ? `<div class="grid">${h.items.map(it => itemHtml(it, `<button class="small primary" data-act="equip" data-i="${it.id}">Equip</button><button class="small" data-act="sellItem" data-i="${it.id}" title="Sell for ${DATA.rarity[it.rarity].value} gold">Sell</button>`)).join('')}</div>` : '<p class="muted">Empty. Adventures in ruins can turn up weapons, armor, mounts and trinkets.</p>'}
  </div>
  <div class="card"><h3>Known ruins</h3>
    ${ruins.length ? `<table><tr><th>Where</th><th>Tier</th><th>Distance</th><th>Status</th><th></th></tr>${ruins.map(({ t, d }) => `<tr><td>(${t.x}, ${t.y})</td><td>${t.ruin.tier}</td><td>${d.toFixed(1)}</td><td>${t.ruin.readyAt <= S.time ? '<span class="good">Ready</span>' : 'in ' + fmtTime(realSecs(t.ruin.readyAt - S.time))}</td><td><button class="small" data-act="goTile" data-x="${t.x}" data-y="${t.y}" data-m="adventure" ${where ? `data-c="${where.id}"` : ''}>Plan adventure</button></td></tr>`).join('')}</table>` : '<p class="muted">No ruins discovered yet. Explore the map with scouts or armies.</p>'}
  </div>`;
};

// ---------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------
const renderResearch = city => {
  const R = G.research(S, 'p');
  const ac = G.lvl(city, 'academy');
  const parts = [];
  for (const x of R.studies || []) {
    const t = DATA.techs[x.id];
    if (!t) continue;
    parts.push(`<div class="card"><h3>Studying: ${t.icon} ${t.name}</h3><div class="bar"><i style="width:${pct(S.time - x.start, x.end - x.start)}%"></i></div>
      <div class="row" style="margin-top:6px"><span class="muted">Done in ${fmtTime(realSecs(x.end - S.time))} (at ${esc((S.cities[x.city] || {}).name || '?')})</span><span class="spacer"></span><button class="small" data-act="cancelResearch" data-t="${x.id}" title="Refund 50%">Cancel</button></div></div>`);
  }
  parts.push(`<div class="card"><p style="margin:0">${ac ? `The Academy of <b>${esc(city.name)}</b> is level ${ac}. Research is shared by your whole realm; several studies can run at once, each in its own Academy. Higher Academy levels unlock advanced topics and study faster.` : `<span class="warn">${esc(city.name)} has no Academy.</span> Build one (Town Hall 3) to research, or switch to a city that has one.`} Completed: ${Object.keys(R.done).length} / ${Object.keys(DATA.techs).length}.</p></div>`);
  for (const cat of ['Economy', 'Military']) {
    const cards = Object.entries(DATA.techs).filter(([, t]) => t.cat === cat).map(([id, t]) => {
      const st = G.techStatus(S, city.id, id);
      return `<div class="card bld ${st.locked ? 'locked' : ''} ${st.done ? 'done' : ''}">
        <div class="head"><span class="ico">${t.icon}</span><div><b>${t.name}</b><div class="muted" style="font-size:12px">Academy ${t.ac}${t.req ? ' · after ' + DATA.techs[t.req].name : ''}</div></div><span class="lv">${st.done ? '✅' : ''}</span></div>
        <div class="desc">${t.desc}</div>
        ${st.done ? '<div class="good">Researched</div>' : st.active ? '<div class="good">Studying…</div>' : `${costHtml(st.cost, city)}
          <div class="row"><button class="${st.ok ? 'primary' : ''}" data-act="research" data-t="${id}" ${st.ok ? '' : 'disabled'}>Research</button><span class="muted" style="font-size:12px">⏱ ${fmtTime(realSecs(st.time))}</span>
          ${!st.ok ? `<span class="${st.poor ? 'muted' : 'warn'}" style="font-size:12px">${st.reason}</span>` : ''}</div>`}
      </div>`;
    }).join('');
    parts.push(`<div><div class="group-title">${cat}</div><div class="grid">${cards}</div></div>`);
  }
  return parts.join('');
};

// ---------------------------------------------------------------------
// Diplomacy: realm cards (treaties, opinion, war score), the negotiation
// table (deal builder with the live willingness meter), treaty history
// ---------------------------------------------------------------------
// UI.deal = { ai, give: [], take: [], both: [], pid?, msg?, counter? }  — lives in UI so the per-second render keeps it
const DIP_SIDES = { give: 'You offer', both: 'Both sides agree', take: 'You ask for' };
const dipLeft = t => t.until ? fmtTime(realSecs(Math.max(0, t.until - S.time))) : '∞';
const dipTreatyIcons = (a, b) => {
  const ts = G.treatiesOf(S, a, b);
  if (!ts.length) return '';
  return `<div class="dp-treaties">${ts.map(t => {
    const K = DATA.treatyKinds[t.kind];
    const dir = t.kind === 'tribute' ? ` (${t.a === 'p' ? 'you pay' : t.b === 'p' ? 'they pay' : esc(S.empires[t.a].name) + ' pays'} ${Math.round(t.n || 0)}/h)` : t.kind === 'vassal' ? ` (${t.a === 'p' ? 'you serve them' : t.b === 'p' ? 'your vassal' : esc(S.empires[t.a].name) + ' serves'})` : '';
    return `<span class="dp-treaty dp-k-${t.kind}" title="${esc(K.name + dir + ' — ' + K.desc + (t.until ? ` ${dipLeft(t)} left.` : ''))}" aria-label="${esc(K.name + dir)}">${K.icon}<small>${t.until ? dipLeft(t) : '∞'}</small></span>`;
  }).join('')}</div>`;
};
const dipBar = (v, lo, hi, cls) => `<div class="bar dp-bar ${cls || ''}"><i style="width:${pct(v - lo, hi - lo)}%;background:${v >= (lo + hi) / 2 ? 'var(--good)' : 'var(--bad)'}"></i></div>`;
const dipOpinionHtml = (e, r) => {
  const op = G.opinionParts(S, e.id);
  return `<div class="dp-op">Opinion of you: <b>${G.opinionWord(r.opinion)}</b> (${Math.round(r.opinion)})${dipBar(r.opinion, -100, 100, 'opinion')}
    <details class="dp-why" data-dpopen="why_${e.id}" ${UI.dpOpenSet && UI.dpOpenSet['why_' + e.id] ? 'open' : ''}><summary>Why?</summary><ul>${op.parts.map(p => `<li><span>${esc(p.label)}</span><b class="${p.v >= 0 ? 'good' : 'bad'}">${p.v > 0 ? '+' : ''}${p.v}</b></li>`).join('')}</ul>
    <div class="muted">Opinion drifts toward ${Math.round(op.target)}; gifts, deeds and grievances fade with time.</div></details></div>`;
};
const dipWarHtml = (e) => {
  const w = G.warInfo(S, 'p', e.id);
  if (!w) return '';
  const ws = Math.round(G.warScore(S, 'p', e.id));
  return `<div class="dp-war"><span>⚔️ War score <b class="${ws >= 0 ? 'good' : 'bad'}">${ws > 0 ? '+' : ''}${ws}</b></span><span class="muted">${w.battles} battle${w.battles === 1 ? '' : 's'} · ${w.cities} cit${w.cities === 1 ? 'y' : 'ies'} taken · ${fmtTime(realSecs(S.time - w.start))}</span>
    <div class="dp-ws"><i style="left:${(ws + 100) / 2}%"></i></div><div class="muted dp-hint">Winning battles and taking cities raises the score; a high score lets you demand cities or reparations for peace.</div></div>`;
};
const dipVassalHtml = e => {
  const t = G.treatiesOf(S, 'p', e.id).find(x => x.kind === 'vassal');
  if (!t) return '';
  if (t.a === 'p') return `<div class="dp-vassal warn">👑 You are the vassal of the ${esc(e.name)}: you pay ${Math.round(t.n || 0)} gold an hour. Declaring war on them is a rebellion.</div>`;
  const an = G.diplo.annexStatus(S, e.id);
  return `<div class="dp-vassal">👑 Your vassal · tribute ${Math.round(t.n || 0)} gold/h · loyalty ${Math.round(t.loyalty || 0)}${dipBar(t.loyalty || 0, 0, 100)}
    <div class="row"><button class="small" data-act="dpVassal" data-a="release" data-e="${e.id}">Release</button><button class="small ${an.ok ? 'primary' : ''}" data-act="dpVassal" data-a="annex" data-e="${e.id}" ${an.ok ? '' : 'disabled'} title="${esc(an.ok ? 'Fold their cities into your realm' : an.reason)}">Annex peacefully</button>${an.ok ? '' : `<span class="muted dp-hint">${esc(an.reason)}</span>`}</div></div>`;
};
const dipRealmCard = (e, pPow) => {
  const r = G.rel(S, e.id);
  const si = DATA.statusInfo[r.status];
  if (e.dead) return `<div class="card dp-realm dead"><div class="row">${ptHtml({ ...rulerSpec(e), dead: true }, 44, 'pt-card', `Ruler of ${e.name}`)}<h3 style="margin:0">${esc(e.name)}</h3><span class="pill">Fallen</span></div><p class="muted">This realm has fallen.${S.settings.mode === 'endless' ? ' A new dynasty may rise in time.' : ''}</p></div>`;
  const ratio = G.power(S, e.id) / Math.max(1, pPow);
  const comp = ratio > 2 ? 'far stronger than you' : ratio > 1.2 ? 'stronger than you' : ratio > 0.8 ? 'about as strong as you' : ratio > 0.5 ? 'weaker than you' : 'far weaker than you';
  const trust = G.trustOf(S, e.id), liege = G.liegeOf(S, e.id);
  const k = 'gift_' + e.id;
  return `<div class="card dp-realm" style="--realm:${e.color}"><div class="dp-head">${ptHtml({ ...rulerSpec(e), dead: false }, 56, 'pt-card', `Ruler of ${e.name}`)}
      <div class="dp-title"><h3>${esc(e.name)}</h3><div class="dp-tags"><span class="pill">${DATA.races[e.race].name}</span><span class="pill ${si.color}">${si.name}</span><span class="pill" title="How well they keep their word">${G.trustWord(trust)}</span>${liege ? `<span class="pill warn">${liege === 'p' ? 'Your vassal' : 'Vassal of ' + esc(S.empires[liege].name)}</span>` : ''}</div>
      <div class="muted dp-hint">${G.citiesOf(S, e.id).length} cit${G.citiesOf(S, e.id).length === 1 ? 'y' : 'ies'} · ${comp}</div></div></div>
    ${dipTreatyIcons('p', e.id)}
    ${extras(REALM_EXTRAS, e)}
    ${dipOpinionHtml(e, r)}
    ${dipWarHtml(e)}
    ${dipVassalHtml(e)}
    <div class="row dp-actions">
      <button class="small primary" data-act="dpOpen" data-e="${e.id}">🤝 Negotiate</button>
      <span class="dp-gift"><input type="number" min="0" step="50" data-k="${k}" value="${esc(UI.form[k] || 100)}" aria-label="Gold to send"><button class="small" data-act="diplo" data-a="gift" data-e="${e.id}">🎁 Send gold</button></span>
      ${r.status !== 'alliance' && liege !== 'p' ? `<button class="small" data-act="diplo" data-a="tribute" data-e="${e.id}" title="Demand gold by threat (no treaty)">💰 Demand</button>` : ''}
      ${r.status !== 'war' ? `<button class="small dp-war-btn" data-act="dpWar" data-e="${e.id}">⚔️ ${G.liegeOf(S, 'p') === e.id ? 'Rise against them' : 'Declare war'}</button>` : ''}
    </div></div>`;
};

// ---- the negotiation table ----
const dipDurs = cur => [...new Set([...G.TREATY.durations, +cur || 60])].sort((a, b) => a - b);
const dipItemHtml = (it, side, idx) => {
  const ic = G.dealItemIcon(it);
  const ctl = [];
  const f = (field, val, attrs) => `<input type="number" ${attrs || ''} value="${esc(val)}" data-dealf="${side}|${idx}|${field}" aria-label="${field}">`;
  if (it.t === 'gold') ctl.push(f('n', it.n, `min="0" step="10" ${it.max != null ? `max="${it.max}"` : ''}`) + ' gold');
  else if (it.t === 'goods') ctl.push(f('n', it.n, 'min="0" step="10"') + ' ' + esc(DATA.goods[it.g].name.toLowerCase()));
  else if (it.t === 'gph') ctl.push(f('n', it.n, 'min="0" step="5"') + ' gold/h for ' + `<select data-dealf="${side}|${idx}|mins">${dipDurs(it.mins).map(m => `<option value="${m}" ${+it.mins === m ? 'selected' : ''}>${m} min</option>`).join('')}</select>`);
  else if (it.t === 'treaty' && DATA.treatyKinds[it.kind].dur) ctl.push(esc(G.dealItemLabel(S, it)) + ` <select data-dealf="${side}|${idx}|mins">${dipDurs(it.mins).map(m => `<option value="${m}" ${+it.mins === m ? 'selected' : ''}>${m} min</option>`).join('')}</select>`);
  else ctl.push(esc(G.dealItemLabel(S, it)));
  return `<div class="dp-item on" draggable="true" data-drag="${side}|${idx}|on"><span class="dp-ic">${ic}</span><span class="dp-lab">${ctl.join('')}</span><button class="small dp-x" data-act="dpDel" data-s="${side}" data-i="${idx}" aria-label="Remove ${esc(G.dealItemLabel(S, it))}">✕</button></div>`;
};
const dipAvailHtml = (it, side) => {
  const K = it.t === 'treaty' ? DATA.treatyKinds[it.kind] : null;
  const tip = K ? K.desc + (it.active ? ' (active: proposing renews it)' : '') : '';
  return `<button class="dp-item avail" draggable="true" data-drag="${side}|${G.dealKey(it)}|avail" data-act="dpAdd" data-s="${side}" data-key="${esc(G.dealKey(it))}" title="${esc(tip)}"><span class="dp-ic">${G.dealItemIcon(it)}</span>${esc(it.t === 'treaty' ? K.name : it.t === 'gold' ? 'Gold' : it.t === 'gph' ? 'Gold every hour' : G.dealItemLabel(S, it))}${it.active ? ' <small class="good">(active)</small>' : ''}</button>`;
};
const dipDealOpts = () => G.dealOptions(S, UI.deal.ai);
const dipInDeal = (side, it) => (UI.deal[side] || []).some(x => G.dealKey(x) === G.dealKey(it));
const renderDeal = () => {
  const D = UI.deal, e = S.empires[D.ai];
  if (!e || e.dead) { UI.deal = null; return ''; }
  const opts = dipDealOpts();
  const deal = { ai: D.ai, give: D.give, take: D.take, both: D.both };
  const ev = G.evalDeal(S, deal);
  const cols = ['give', 'both', 'take'].map(side => {
    const on = (D[side] || []).map((it, i) => dipItemHtml(it, side, i)).join('');
    const av = (opts[side] || []).filter(it => !dipInDeal(side, it)).map(it => dipAvailHtml(it, side)).join('');
    const who = side === 'give' ? esc(S.empires.p.name) : side === 'take' ? esc(e.name) : '';
    return `<div class="dp-col" data-drop="${side}"><h4>${DIP_SIDES[side]}${who ? ` <small class="muted">${who}</small>` : ''}</h4>
      <div class="dp-table">${on || '<div class="muted dp-empty">Nothing yet. Tap or drag items here.</div>'}</div>
      ${av ? `<div class="dp-avail">${av}</div>` : ''}</div>`;
  }).join('');
  const meter = ev.meter;
  const parts = ev.parts.filter(p => p.key !== 'base').sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  return `<div class="card dp-deal" id="dpDeal"><div class="dp-head">${ptHtml({ ...rulerSpec(e), dead: false }, 56, 'pt-card', `Ruler of ${e.name}`)}
      <div class="dp-title"><h3>Negotiating with the ${esc(e.name)}</h3><div class="muted dp-hint">${DATA.statusInfo[G.rel(S, D.ai).status].name} · opinion ${Math.round(G.rel(S, D.ai).opinion)} · your reputation: ${G.trustWord(G.trustOf(S, 'p'))} (${Math.round(G.trustOf(S, 'p'))})${D.pid ? ' · answering their proposal' : ''}</div></div>
      <span class="spacer"></span><button class="small" data-act="dpClose" aria-label="Close the negotiation">✕</button></div>
    <div class="dp-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(meter)}" aria-label="Their willingness">
      <div class="dp-meter-bar"><i class="${ev.accept ? 'yes' : meter >= 35 ? 'maybe' : 'no'}" style="width:${meter}%"></i><b class="dp-mark" title="They accept above this line"></b></div>
      <div class="dp-say"><b>${ev.accept ? '✔' : ev.err ? '⚠' : '✘'}</b> <q>${esc(ev.text)}</q></div>
      ${parts.length ? `<div class="dp-parts">${parts.map(p => `<span class="dp-part ${p.v >= 0 ? 'good' : 'bad'}" title="${esc(p.why || '')}">${esc(p.label)} ${p.v > 0 ? '+' : ''}${p.v}</span>`).join('')}</div>` : ''}
    </div>
    <div class="dp-cols">${cols}</div>
    ${D.msg ? `<div class="dp-msg ${D.msgKind || ''}">${esc(D.msg)}</div>` : ''}
    ${D.counter ? `<div class="dp-counter"><b>Their counter-offer:</b> ${esc(G.describeDeal(S, D.counter.deal))}. <span class="muted">${esc(D.counter.text)}</span> <button class="small primary" data-act="dpTakeCounter">Accept their terms</button> <button class="small" data-act="dpLoadCounter">Edit it</button></div>` : ''}
    <div class="row dp-btns"><button class="primary" data-act="dpPropose" ${ev.err ? 'disabled' : ''}>📜 Propose</button><button data-act="dpAsk" title="Ask what they would want">❓ What would you want?</button><button data-act="dpClear">Clear</button>${D.pid ? '<button data-act="dpDecline">Decline their proposal</button>' : ''}</div>
  </div>`;
};

const dipHistoryHtml = () => {
  const h = (S.dip && S.dip.hist) || [];
  if (!h.length) return '';
  const who = id => id === 'p' ? 'you' : S.empires[id] ? esc(S.empires[id].name) : '?';
  const ev = { signed: 'signed', renewed: 'renewed', expired: 'expired', broken: 'broken', ended: 'ended', annexed: 'annexed', peace: 'war ended' };
  return `<div class="card"><details class="dp-hist" data-dpopen="hist" ${UI.dpOpenSet && UI.dpOpenSet.hist ? 'open' : ''}><summary><h3 style="display:inline">📜 Treaty history</h3> <span class="muted">(${h.length})</span></summary><ul>${h.slice(0, 40).map(x => {
    const K = DATA.treatyKinds[x.kind];
    const name = x.kind === 'war' ? '⚔️ War' : K ? `${K.icon} ${K.name}` : x.kind;
    const mine = x.a === 'p' || x.b === 'p';
    const cls = x.ev === 'broken' ? 'bad' : x.ev === 'signed' || x.ev === 'peace' ? 'good' : 'muted';
    return `<li class="${mine ? '' : 'dp-other'}"><time>${clock(x.t).replace(/^Day /, 'D')}</time> ${name}, ${who(x.a)} & ${who(x.b)}: <span class="${cls}">${ev[x.ev] || x.ev}</span>${x.by && x.ev === 'broken' ? ` by ${who(x.by)}` : ''}${x.note ? ` <span class="muted">(${esc(x.note)})</span>` : ''}</li>`;
  }).join('')}</ul></details></div>`;
};

const renderDiplomacy = city => {
  const pPow = G.power(S, 'p');
  const realms = Object.values(S.empires).filter(e => e.id !== 'p');
  const offers = (S.offers || []).filter(o => o.expires > S.time);
  const deals = (S.pending || []).filter(p => p.kind === 'deal' || p.kind === 'callToArms');
  return `${UI.deal ? renderDeal() : ''}
  ${deals.length && !UI.deal ? `<div class="card dp-props"><h3>📨 Envoys waiting</h3>${deals.map(p => `<div class="dp-prop"><b>${esc(p.title)}</b><div class="muted">${esc(p.text)}</div><div class="row">${p.options.map((o, i) => `<button class="small ${i === 0 ? 'primary' : ''}" data-act="decide" data-p="${p.id}" data-k="${o.key}">${esc(o.label)}</button>`).join('')}<span class="muted dp-hint">${fmtTime(realSecs(p.expires - S.time))}</span></div></div>`).join('')}</div>` : ''}
  <div class="dp-realms">${realms.map(e => dipRealmCard(e, pPow)).join('')}</div>
  <div class="card"><h3>🐪 Foreign merchants</h3>
    ${offers.length ? `<p class="muted" style="font-size:12.5px">Deals are paid from and delivered to <b>${esc(city.name)}</b>. Friendlier realms (and trade partners) offer better terms.</p><div class="dp-scroll"><table><tr><th>From</th><th>They give</th><th>They want</th><th>Leaves in</th><th></th></tr>${offers.map(o => `<tr><td>${esc(S.empires[o.ai].name)}</td><td class="good">${goodsHtml(o.give)}</td><td>${goodsHtml(o.want)}</td><td class="muted">${fmtTime(realSecs(o.expires - S.time))}</td><td><button class="small primary" data-act="offer" data-o="${o.id}" ${G.canAfford(S, city, o.want) ? '' : 'disabled'}>Accept</button></td></tr>`).join('')}</table></div>` : '<p class="muted">No merchants in town right now. Realms that are not at war with you send caravans now and then.</p>'}
  </div>
  ${(() => { const al = realms.filter(e => !e.dead); const rows = [];
      for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) { const r = G.aiRel(S, al[i].id, al[j].id); const ws = r.status === 'war' ? Math.round(G.warScore(S, al[i].id, al[j].id)) : null; rows.push(`<tr><td>${esc(al[i].name)}</td><td>${esc(al[j].name)}</td><td class="${DATA.statusInfo[r.status].color}">${DATA.statusInfo[r.status].name}${ws != null ? ` <small class="muted">(${ws > 0 ? '+' : ''}${ws})</small>` : ''}</td><td>${dipTreatyIcons(al[i].id, al[j].id) || '<span class="muted">—</span>'}</td></tr>`); }
      return rows.length ? `<div class="card"><h3>Relations among your rivals</h3><div class="dp-scroll"><table><tr><th colspan="2">Realms</th><th>Status</th><th>Treaties</th></tr>${rows.join('')}</table></div>${S.leader && S.leader !== 'p' ? `<p class="warn" style="font-size:12.5px">The ${esc(S.empires[S.leader].name)} towers over the others; the rest are banding together against it.</p>` : S.leader === 'p' ? '<p class="warn" style="font-size:12.5px">Your power towers over the others — they are banding together against you.</p>' : ''}</div>` : ''; })()}
  ${dipHistoryHtml()}
  <div class="card muted" style="font-size:12.5px">Treaties are agreements with terms and a duration: 🤚 non-aggression, 🚪 open borders, ⚖️ trade, 📚 research, 🛡️ defensive and 🤝 full alliances, 💍 royal marriages, 💰 tribute and 👑 vassalage. Open the <b>Negotiate</b> table to build a deal from both sides; their willingness shows live, and they explain themselves. Breaking a treaty (attacking a partner, declaring war on them) costs your reputation with every court. Winning battles and taking cities raises your war score, which decides the price of peace.</div>`;
};

// ---------------------------------------------------------------------
// Right column: decisions and quests
// ---------------------------------------------------------------------
const renderPending = () => {
  const ps = (S.pending || []);
  if (!ps.length) return '';
  return ps.map(p => `<div class="card decision"><b>📜 ${esc(p.title)}</b><p style="margin:6px 0;font-size:13px">${esc(p.text)}</p>
    <div class="row">${p.options.map((o, i) => `<button class="small ${i === 0 ? 'primary' : ''}" data-act="decide" data-p="${p.id}" data-k="${o.key}">${esc(o.label)}</button>`).join('')}</div>
    <div class="muted" style="font-size:11px;margin-top:4px">Decide within ${fmtTime(realSecs(p.expires - S.time))}, or: ${esc(p.options.find(o => o.key === p.def).label.toLowerCase())}</div></div>`).join('');
};

const renderQuests = () => {
  const qs = G.activeQuests(S);
  if (!qs.length) return '';
  return `<div class="card"><h4>🎯 Quests</h4>${qs.map(q => {
    const done = q.check(S);
    return `<div class="quest ${done ? 'done' : ''}"><div><b>${esc(q.title)}</b><div class="muted" style="font-size:12px">${esc(q.desc)}</div><div style="font-size:12px">Reward: ${goodsHtml(q.reward)}</div></div>${done ? `<button class="small primary" data-act="claim" data-q="${q.id}">Claim</button>` : ''}</div>`;
  }).join('')}</div>`;
};

// ---------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------
Object.assign(act, {
  heroPoint: d => { toast(G.heroAssign(S, d.a)); render(true); },
  equip: d => { toast(G.heroEquip(S, d.i)); render(true); },
  unequip: d => { G.heroUnequip(S, d.s); render(true); },
  sellItem: d => { toast(G.heroSell(S, d.i) || 'Sold'); render(true); },
  revive: () => { toast(G.reviveHero(S) || 'The healers begin their work'); render(true); },
  renameHero: () => { const h = G.hero(S); const n = prompt('Name your hero', h.name); if (n && n.trim()) { G.renameHero(S, n.trim().slice(0, 24)); render(true); } },
  research: d => { toast(G.startResearch(S, UI.city, d.t) || `Scholars begin studying ${DATA.techs[d.t].name}`); render(true); },
  cancelResearch: d => { G.cancelResearch(S, 'p', d && d.t ? d.t : undefined); render(true); },
  diplo: d => {
    const msg = d.a === 'gift' ? G.diplo.gift(S, d.e, parseInt(UI.form['gift_' + d.e] || 100, 10)) : G.diplo[d.a](S, d.e);
    toast(msg); if (msg) G.log(S, 'p', '🕊️ ' + msg); render(true);
  },
  offer: d => { toast(G.acceptOffer(S, d.o, UI.city) || 'Deal struck'); render(true); },
  decide: d => { toast(G.resolvePending(S, d.p, d.k)); render(true); },
  claim: d => { toast(G.claimQuest(S, d.q) || 'Reward delivered to your capital'); render(true); },
});

// ---------------------------------------------------------------------
// diplomacy actions: the negotiation table, war, vassals, counter-offers
// ---------------------------------------------------------------------
const dipClone = d => ({ ai: d.ai, give: (d.give || []).map(i => ({ ...i })), take: (d.take || []).map(i => ({ ...i })), both: (d.both || []).map(i => ({ ...i })) });
const dipDeal = () => ({ ai: UI.deal.ai, give: UI.deal.give, take: UI.deal.take, both: UI.deal.both });
const dipTop = () => { const el = document.getElementById('dpDeal'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); else window.scrollTo(0, 0); };
const dipBaseDecide = act.decide;
Object.assign(act, {
  dpOpen: d => { UI.deal = { ai: d.e, give: [], take: [], both: [] }; render(true); dipTop(); },
  dpClose: () => { UI.deal = null; render(true); },
  dpAdd: d => {
    if (!UI.deal) return;
    const it = (G.dealOptions(S, UI.deal.ai)[d.s] || []).find(x => G.dealKey(x) === d.key);
    if (it && !dipInDeal(d.s, it)) { const c = { ...it }; delete c.active; UI.deal[d.s].push(c); }
    UI.deal.msg = null; UI.deal.counter = null; render(true);
  },
  dpDel: d => { if (!UI.deal) return; UI.deal[d.s].splice(+d.i, 1); UI.deal.msg = null; UI.deal.counter = null; render(true); },
  dpClear: () => { if (!UI.deal) return; UI.deal.give = []; UI.deal.take = []; UI.deal.both = []; UI.deal.msg = null; UI.deal.counter = null; render(true); },
  dpPropose: () => {
    if (!UI.deal) return;
    const res = G.negotiate(S, dipDeal(), { pid: UI.deal.pid });
    if (res.ok) { toast(res.text); UI.deal = null; }
    else { UI.deal.msg = res.text; UI.deal.msgKind = 'bad'; UI.deal.counter = res.counter || null; }
    render(true);
  },
  dpAsk: () => {
    if (!UI.deal) return;
    const ev = G.evalDeal(S, dipDeal());
    const c = ev.err ? null : G.counterDeal(S, dipDeal());
    UI.deal.counter = c;
    UI.deal.msg = ev.err ? ev.err : ev.accept ? 'They would accept this as it stands.' : c ? '' : 'They see nothing you could add that would win them over.';
    UI.deal.msgKind = ev.accept ? 'good' : '';
    if (c) S.rel[UI.deal.ai].counter = G.dealSig(c.deal);
    render(true);
  },
  dpLoadCounter: () => { if (!UI.deal || !UI.deal.counter) return; Object.assign(UI.deal, dipClone(UI.deal.counter.deal), { counter: null, msg: null }); render(true); },
  dpTakeCounter: () => { if (!UI.deal || !UI.deal.counter) return; Object.assign(UI.deal, dipClone(UI.deal.counter.deal), { counter: null, msg: null }); act.dpPropose(); },
  dpDecline: () => { if (UI.deal && UI.deal.pid) { const m = G.resolvePending(S, UI.deal.pid, 'decline'); if (m) toast(m); } UI.deal = null; render(true); },
  dpWar: d => {
    const ts = G.treatiesOf(S, 'p', d.e);
    if (ts.length && !confirm(`Declare war on the ${S.empires[d.e].name}? This breaks your treaties with them (${ts.map(G.treatyName).join(', ')}) and costs your reputation with every court.`)) return;
    act.diplo({ a: 'war', e: d.e });
  },
  dpVassal: d => { const msg = G.diplo[d.a](S, d.e); toast(msg); if (msg) G.log(S, 'p', '👑 ' + msg); render(true); },
  decide: d => {
    const p = (S.pending || []).find(x => x.id === d.p);
    if (p && p.kind === 'deal' && d.k === 'counter') {
      UI.deal = { ...dipClone(p.data.deal), pid: p.id, msg: 'Their proposal is on the table: change it and propose your counter.', msgKind: '' };
      UI.tab = 'diplomacy'; render(true); dipTop(); return;
    }
    dipBaseDecide(d);
  },
});
if (typeof TABS !== 'undefined' && TABS.diplomacy) TABS.diplomacy.badge = () => (S.offers || []).length + (S.pending || []).filter(p => p.kind === 'deal' || p.kind === 'callToArms').length;
// amounts and durations on the table
document.addEventListener('change', ev => {
  const f = ev.target.dataset && ev.target.dataset.dealf;
  if (!f || !UI.deal) return;
  const [side, i, field] = f.split('|');
  const it = (UI.deal[side] || [])[+i];
  if (!it) return;
  let v = Math.max(0, Math.floor(+ev.target.value || 0));
  if (field === 'n' && it.max != null) v = Math.min(v, it.max);
  it[field] = v; UI.deal.msg = null; UI.deal.counter = null;
  ev.target.blur(); render(true);
});
// drag items onto (or off) the table
document.addEventListener('dragstart', ev => {
  const el = ev.target.closest && ev.target.closest('[data-drag]');
  if (!el || !ev.dataTransfer) return;
  ev.dataTransfer.setData('text/plain', el.dataset.drag); ev.dataTransfer.effectAllowed = 'move';
});
document.addEventListener('dragover', ev => {
  const z = ev.target.closest && ev.target.closest('[data-drop]');
  if (!z || !UI.deal) return;
  ev.preventDefault();
  document.querySelectorAll('.dp-over').forEach(x => { if (x !== z) x.classList.remove('dp-over'); });
  z.classList.add('dp-over');
});
document.addEventListener('dragend', () => { document.querySelectorAll('.dp-over').forEach(x => x.classList.remove('dp-over')); UI.holding = false; });
document.addEventListener('drop', ev => {
  const z = ev.target.closest && ev.target.closest('[data-drop]');
  if (!z || !UI.deal || !ev.dataTransfer) return;
  ev.preventDefault(); z.classList.remove('dp-over');
  const [side, key, where] = (ev.dataTransfer.getData('text/plain') || '').split('|');
  if (!side) return;
  if (side !== z.dataset.drop) { toast('That belongs in the other column'); return; }
  const onAvail = !!(ev.target.closest && ev.target.closest('.dp-avail'));
  if (where === 'avail' && !onAvail) act.dpAdd({ s: side, key });
  else if (where === 'on' && onAvail) act.dpDel({ s: side, i: key });
});
// keep "Why?" and the history open across the per-second render
document.addEventListener('toggle', ev => {
  const k = ev.target && ev.target.dataset && ev.target.dataset.dpopen;
  if (!k) return;
  UI.dpOpenSet = UI.dpOpenSet || {};
  UI.dpOpenSet[k] = ev.target.open;
}, true);
