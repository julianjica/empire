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

  return `<div class="card"><div class="row"><span style="font-size:40px">🦸</span><div><h2 style="margin:0">${esc(h.name)} <button class="small" data-act="renameHero">Rename</button></h2>
      <div class="muted">Level ${h.level} · ${h.adventures || 0} adventures</div></div></div>
    <div style="margin-top:8px">Experience ${fmt(h.xp)} / ${fmt(G.xpNeed(h.level))}<div class="bar"><i style="width:${pct(h.xp, G.xpNeed(h.level))}%"></i></div></div>
    <div style="margin-top:6px">Health ${Math.floor(h.hp)} / 100<div class="bar hp"><i style="width:${h.hp}%"></i></div></div>
    ${status}
    <div class="stats" style="font-size:13px"><span>⚔️ <b>${st.atk}</b> attack</span><span>🛡️ <b>${st.defI}</b> defense</span><span>💨 <b>${st.spd}</b> speed</span><span>🎺 army +${Math.round((G.heroLeadership(S, 'p') - 1) * 100)}%</span><span>🏰 city defense +${2 * h.points.guard}%</span><span>📜 city goods +${2 * h.points.econ}%</span></div>
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
  if (R.active) {
    const t = DATA.techs[R.active.id];
    parts.push(`<div class="card"><h3>Studying: ${t.icon} ${t.name}</h3><div class="bar"><i style="width:${pct(S.time - R.active.start, R.active.end - R.active.start)}%"></i></div>
      <div class="row" style="margin-top:6px"><span class="muted">Done in ${fmtTime(realSecs(R.active.end - S.time))} (at ${esc((S.cities[R.active.city] || {}).name || '?')})</span><span class="spacer"></span><button class="small" data-act="cancelResearch" title="Refund 50%">Cancel</button></div></div>`);
  }
  parts.push(`<div class="card"><p style="margin:0">${ac ? `The Academy of <b>${esc(city.name)}</b> is level ${ac}. Research is shared by your whole realm; one study at a time. Higher Academy levels unlock advanced topics and study faster.` : `<span class="warn">${esc(city.name)} has no Academy.</span> Build one (Town Hall 3) to research, or switch to a city that has one.`} Completed: ${Object.keys(R.done).length} / ${Object.keys(DATA.techs).length}.</p></div>`);
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
// Diplomacy
// ---------------------------------------------------------------------
const renderDiplomacy = city => {
  const pPow = G.power(S, 'p');
  const realms = Object.values(S.empires).filter(e => e.id !== 'p');
  const offers = (S.offers || []).filter(o => o.expires > S.time);
  return `<div class="card"><h3>🐪 Foreign merchants</h3>
    ${offers.length ? `<p class="muted" style="font-size:12.5px">Deals are paid from and delivered to <b>${esc(city.name)}</b>. Friendlier realms offer better terms.</p><table><tr><th>From</th><th>They give</th><th>They want</th><th>Leaves in</th><th></th></tr>${offers.map(o => `<tr><td>${esc(S.empires[o.ai].name)}</td><td class="good">${goodsHtml(o.give)}</td><td>${goodsHtml(o.want)}</td><td class="muted">${fmtTime(realSecs(o.expires - S.time))}</td><td><button class="small primary" data-act="offer" data-o="${o.id}" ${G.canAfford(S, city, o.want) ? '' : 'disabled'}>Accept</button></td></tr>`).join('')}</table>` : '<p class="muted">No merchants in town right now. Realms that are not at war with you send caravans now and then.</p>'}
  </div>
  ${realms.map(e => {
    const r = G.rel(S, e.id);
    const si = DATA.statusInfo[r.status];
    const ratio = G.power(S, e.id) / Math.max(1, pPow);
    const comp = e.dead ? '' : ratio > 2 ? 'far stronger than you' : ratio > 1.2 ? 'stronger than you' : ratio > 0.8 ? 'about as strong as you' : ratio > 0.5 ? 'weaker than you' : 'far weaker than you';
    const k = 'gift_' + e.id;
    return `<div class="card"><div class="row"><span class="dot" style="background:${e.color};width:14px;height:14px;border-radius:50%;display:inline-block"></span><h3 style="margin:0">${esc(e.name)}</h3><span class="pill">${DATA.races[e.race].name}</span><span class="pill ${si.color}">${e.dead ? 'Fallen' : si.name}</span><span class="spacer"></span>${e.dead ? '' : `<span class="muted">${G.citiesOf(S, e.id).length} cities · ${comp}</span>`}</div>
      ${e.dead ? '<p class="muted">This realm has fallen.' + (S.settings.mode === 'endless' ? ' A new dynasty may rise in time.' : '') + '</p>' : `
      <div style="margin:8px 0">Opinion of you: <b>${G.opinionWord(r.opinion)}</b> (${Math.round(r.opinion)})<div class="bar opinion"><i style="width:${(r.opinion + 100) / 2}%;background:${r.opinion >= 0 ? 'var(--good)' : 'var(--bad)'}"></i></div></div>
      <div class="row">
        <input type="number" min="0" step="50" data-k="${k}" value="${esc(UI.form[k] || 100)}"><button class="small" data-act="diplo" data-a="gift" data-e="${e.id}">🎁 Send gold</button>
        ${r.status === 'war' || r.status === 'neutral' ? `<button class="small" data-act="diplo" data-a="peace" data-e="${e.id}">🕊️ Propose peace</button>` : ''}
        ${r.status === 'peace' ? `<button class="small" data-act="diplo" data-a="alliance" data-e="${e.id}">🤝 Propose alliance</button>` : ''}
        ${r.status !== 'alliance' ? `<button class="small" data-act="diplo" data-a="tribute" data-e="${e.id}">💰 Demand tribute</button>` : ''}
        ${r.status !== 'war' ? `<button class="small" data-act="diplo" data-a="war" data-e="${e.id}">⚔️ Declare war</button>` : ''}
      </div>`}
    </div>`;
  }).join('')}
  ${(() => { const al = realms.filter(e => !e.dead); const rows = [];
      for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) { const r = G.aiRel(S, al[i].id, al[j].id); rows.push(`<tr><td>${esc(al[i].name)}</td><td>${esc(al[j].name)}</td><td class="${DATA.statusInfo[r.status].color}">${DATA.statusInfo[r.status].name}</td></tr>`); }
      return rows.length ? `<div class="card"><h3>Relations among your rivals</h3><table>${rows.join('')}</table>${S.leader && S.leader !== 'p' ? `<p class="warn" style="font-size:12.5px">The ${esc(S.empires[S.leader].name)} towers over the others; the rest are banding together against it.</p>` : S.leader === 'p' ? '<p class="warn" style="font-size:12.5px">Your power towers over the others — they are banding together against you.</p>' : ''}</div>` : ''; })()}
  <div class="card muted" style="font-size:12.5px">At peace or allied, a realm will not attack you; allies turn on whoever attacks you. Attacking, raiding or getting caught scouting lowers opinion; breaking a treaty angers every realm. Strong realms may demand tribute from you — and you from the weak.</div>`;
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
  cancelResearch: () => { G.cancelResearch(S, 'p'); render(true); },
  diplo: d => {
    const msg = d.a === 'gift' ? G.diplo.gift(S, d.e, parseInt(UI.form['gift_' + d.e] || 100, 10)) : G.diplo[d.a](S, d.e);
    toast(msg); if (msg) G.log(S, 'p', '🕊️ ' + msg); render(true);
  },
  offer: d => { toast(G.acceptOffer(S, d.o, UI.city) || 'Deal struck'); render(true); },
  decide: d => { toast(G.resolvePending(S, d.p, d.k)); render(true); },
  claim: d => { toast(G.claimQuest(S, d.q) || 'Reward delivered to your capital'); render(true); },
});
