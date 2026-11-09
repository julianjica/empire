// =====================================================================
//  World tab: fogged map, tile panel, sending armies/scouts/caravans
// =====================================================================
'use strict';

const tileIcon = t => {
  if (t.city) { const c = S.cities[t.city]; const L = G.lvl(c, 'townhall'); return L >= 10 ? '🏰' : L >= 6 ? '🏯' : L >= 3 ? '🏘️' : '🛖'; }
  if (t.camp) return '⛺';
  if (t.oasis) return '🏝️';
  if (t.ruin) return '🏚️';
  const deco = { forest: '🌲', mountain: '⛰️' }[t.terrain];
  return deco ? `<span style="opacity:.35;font-size:.8em">${deco}</span>` : '';
};

const renderWorld = city => {
  if (typeof worldMapHtml === 'function') {
    const sel = UI.sel ? G.tileAt(S, UI.sel.x, UI.sel.y) : null;
    return `<div class="mapwrap">${worldMapHtml(city)}
      <div class="card">${sel ? ((UI.sel.move && typeof armyPanel === 'function' && armyPanel(city)) || renderTilePanel(city, sel, G.visibleSet(S))) : '<p class="muted">Select a place on the map to see what lies there and send troops, scouts, your hero, settlers or caravans. Drag to pan, scroll or pinch to zoom.</p>'}</div></div>`;
  }
  const vis = G.visibleSet(S);
  const sel = UI.sel ? G.tileAt(S, UI.sel.x, UI.sel.y) : null;
  const marching = new Set();
  for (const m of S.moves) if (m.owner === 'p') marching.add(m.y * S.map + m.x);
  const inc = new Set(incoming().map(m => m.y * S.map + m.x));
  const tiles = S.tiles.map((t, i) => {
    const explored = S.explored[i];
    const seen = vis[i];
    if (!explored) return `<div class="tile fog ${sel === t ? 'sel' : ''}" data-act="tile" data-x="${t.x}" data-y="${t.y}" title="Unexplored (${t.x}, ${t.y})"></div>`;
    const c = t.city && S.cities[t.city];
    const ownerColor = c ? S.empires[c.owner].color : t.oasis && t.oasis.owner && S.cities[t.oasis.owner] ? S.empires[S.cities[t.oasis.owner].owner].color : null;
    const flag = ownerColor ? `<span class="flag" style="background:${ownerColor}"></span>` : '';
    const title = c ? `${c.name} (${S.empires[c.owner].name})` : t.camp ? `Brigand camp, tier ${S.camps[t.camp].tier}` : t.oasis ? `Oasis (+25% ${DATA.goods[t.oasis.bonus].name})` : t.ruin ? `Ruins, tier ${t.ruin.tier}` : DATA.terrain[t.terrain].name;
    const mark = inc.has(i) ? '<span class="mk bad">⚔️</span>' : marching.has(i) ? '<span class="mk">🚩</span>' : '';
    return `<div class="tile ${seen ? '' : 'dim'} ${sel === t ? 'sel' : ''} ${t.city === city.id ? 'cur' : ''}" style="background:${DATA.terrain[t.terrain].color}" title="${esc(title)} (${t.x}, ${t.y})" data-act="tile" data-x="${t.x}" data-y="${t.y}">${tileIcon(t)}${mark}${flag}</div>`;
  }).join('');
  const legend = Object.values(S.empires).filter(e => !e.dead).map(e => `<span><i style="background:${e.color}"></i>${esc(e.name)}</span>`).join('');
  return `<div class="mapwrap">
    <div><div class="map" style="grid-template-columns:repeat(${S.map},1fr)">${tiles}</div>
      <div class="legend">${legend}<span>⛺ Brigands</span><span>🏝️ Oasis</span><span>🏚️ Ruins</span><span>🚩 Your march</span></div></div>
    <div class="card">${sel ? renderTilePanel(city, sel, vis) : '<p class="muted">Select a tile to see what lies there and send troops, scouts, your hero, settlers or caravans. Dark tiles are unexplored; faded tiles were seen before but are out of sight now.</p>'}</div>
  </div>`;
};

const intelHtml = t => {
  const i = S.intel[G.tileIdx(S, t)];
  if (!i) return '<p class="muted" style="font-size:12.5px">No scouting report. Send 🦅 scouts to learn what defends it.</p>';
  return `<p style="font-size:12.5px"><b>Scouted ${ago(i.t)}:</b> ${unitTokens(i.units, t.city && S.cities[t.city] ? S.cities[t.city].owner : null, null, 28)}${i.wall !== undefined ? ` · wall ${i.wall}` : ''}${i.res ? `<br><span class="muted">Stores: ${goodsHtml(i.res)}</span>` : ''}</p>`;
};

const renderTilePanel = (city, t, vis) => {
  const idx = G.tileIdx(S, t);
  const terr = DATA.terrain[t.terrain];
  const d = G.dist(city, t);
  if (!S.explored[idx]) {
    UI.mode = 'scout';
    return `<h3>Unexplored lands</h3><div class="muted" style="font-size:12.5px">(${t.x}, ${t.y}) · ${d.toFixed(1)} tiles from ${esc(city.name)}</div>
      <p class="muted">Nobody knows what lies here. Scouts can find out.</p>${sendForm(city, t, ['scout'])}`;
  }
  const c = t.city && S.cities[t.city];
  const camp = t.camp && S.camps[t.camp];
  const wildOasis = t.oasis && !(t.oasis.owner && S.cities[t.oasis.owner]);
  // roaming creatures and crisis sources (js/monsters.js) have their own panels (drawn in worldmap.js)
  const roam = !c && !camp && !t.oasis && !t.ruin && !t.minor && G.monsterAt ? G.monsterAt(S, t.x, t.y) : null;
  if (roam && vis && G.monsterVisible(S, roam, vis) && G.monsterPanel) return G.monsterPanel(city, t, roam);
  if (camp && camp.kind === 'crisis' && G.crisisCampPanel) return G.crisisCampPanel(city, t, camp);
  const pic = c && c.owner !== 'p' && S.empires[c.owner] ? ptHtml(rulerSpec(S.empires[c.owner]), 64, 'pt-card', `Ruler of ${S.empires[c.owner].name}`)
    : camp ? ptHtml({ kind: 'monster', role: { wyrm: 'wyrm', undead: 'undead', star: 'elemental', rift: 'demon' }[camp.kind] || 'brigand', seed: t.camp }, 64, 'pt-card', { wyrm: 'The Elder Wyrm', undead: 'The restless dead', star: 'Star-touched beast', rift: 'Rift demon' }[camp.kind] || 'Brigand chief')
    : wildOasis ? ptHtml({ kind: 'monster', role: 'beast', seed: idx }, 56, 'pt-card', 'Oasis beasts') : '';
  const head0 = `<h3>${c ? esc(c.name) : camp ? (camp.kind ? { wyrm: "🐉 The Wyrm's lair", undead: '💀 Horde of the restless dead', star: '☄️ Crater of a fallen star', rift: '👹 Demon rift' }[camp.kind] : '⛺ Brigand camp') : t.oasis ? '🏝️ Oasis' : t.ruin ? '🏚️ Ruins' : terr.name}</h3><div class="muted" style="font-size:12.5px">(${t.x}, ${t.y}) · ${terr.name} · ${d.toFixed(1)} tiles from ${esc(city.name)}</div>`;
  const head = pic ? `<div class="pt-panelhead">${pic}<div>${head0}</div></div>` : head0;
  const islandNote = !terr.impassable && !G.landReachable(S, city, t) ? `<div class="calam good">🏝️ <b>Across the water</b> — no land route from ${esc(city.name)}. Send ships with your army: Transport Cogs from a coastal city's Harbor carry troops and settlers (30 citizens each).</div>` : '';
  const cals = G.calamitiesAt ? G.calamitiesAt(S, t.x, t.y) : [];
  const calHtml = cals.map(q => { const def = DATA.calamities[q.kind]; return `<div class="calam ${def.bad ? 'bad' : 'good'}">${def.icon} <b>${def.name}</b> · ${fmtTime(realSecs(q.end - S.time))} left<br><span style="font-size:12px">${def.text}</span></div>`; }).join('');
  if (terr.impassable) return head + calHtml + '<p class="muted">Open water. Nothing can be built here, but ships sail across it.</p>';
  if (t.x === city.x && t.y === city.y) return head + '<p>This is your selected city.</p>' + extras(TILE_EXTRAS, city, t);
  const takeover = extras(TILE_PANELS, city, t, vis);
  if (takeover) return takeover;

  let info = '', modes = [];
  if (c) {
    const owner = S.empires[c.owner];
    if (c.owner === 'p') { info = `<p>One of your cities.</p>${siteHtml(G.site(S, c), true)}`; modes = ['reinforce', 'trade']; }
    else {
      const r = G.rel(S, c.owner);
      info = `<p><span class="pill" style="border-color:${owner.color}">${esc(owner.name)}</span> ${DATA.races[owner.race].name} · ${G.tier(c).name} · <span class="${DATA.statusInfo[r.status].color}">${DATA.statusInfo[r.status].name}</span></p>${intelHtml(t)}
        ${r.status === 'peace' || r.status === 'alliance' ? `<p class="warn" style="font-size:12.5px">⚠️ Attacking will break your treaty and anger every realm.</p>` : ''}`;
      modes = ['raid', 'attack', 'conquer', 'scout'];
    }
  } else if (camp) {
    info = `<p>Tier ${camp.tier} outlaws.</p>${intelHtml(t)}`;
    modes = ['raid', 'attack', 'scout'];
  } else if (t.oasis) {
    const o = t.oasis;
    const oc = o.owner && S.cities[o.owner];
    if (oc && oc.owner === 'p') { info = `<p>Belongs to ${esc(oc.name)}: +25% ${DATA.goods[o.bonus].name}.</p>`; modes = []; }
    else if (oc) { info = `<p>Held by ${esc(oc.name)} (${esc(S.empires[oc.owner].name)}). Oases have no garrison — march in with an attack to take it.</p>`; modes = ['attack', 'scout']; }
    else { const reach = G.cityReach(S, city) + 1.5; info = `<p>Wild oasis, tier ${o.tier}: +25% ${DATA.goods[o.bonus].name} for a city that claims it. Beasts guard it.</p>${intelHtml(t)}<p class="muted" style="font-size:12.5px">${esc(city.name)} holds ${(city.oases || []).length}/${G.oasisSlots(city)} oases and can hold one up to ${reach.toFixed(1)} tiles away (reach grows with population) — this one is ${d.toFixed(1)} away${d > reach ? ' <span class="warn">(too far)</span>' : ''}.</p>`; modes = ['attack', 'scout']; }
  } else if (t.ruin) {
    const ready = t.ruin.readyAt <= S.time;
    info = `<p>Tier ${t.ruin.tier} ruins. ${ready ? 'Something still stirs inside — treasure, and danger.' : `Plundered; they will hold new secrets in ${fmtTime(realSecs(t.ruin.readyAt - S.time))}.`}</p>
      <p class="muted" style="font-size:12.5px">Adventures are led by your hero: success brings treasure, experience and sometimes items; failure costs health. Escorts add half their attack.</p>`;
    modes = ['adventure', 'raid', 'scout'];
  } else {
    const ren = G.renown(S, 'p'), need = G.nextCityRenown(S, 'p');
    info = `<p>Open land. Settlers can found a new city here.<br><span class="${ren >= need ? 'good' : 'muted'}">Renown ${ren} / ${need === Infinity ? '—' : need} needed for your next city.</span></p>
      <div class="muted" style="font-size:12px;margin-bottom:2px">Site survey — what a city here would yield, from the land within 2 tiles:</div>${siteHtml(G.siteYield(S, t.x, t.y))}`;
    modes = ['settle', 'scout'];
  }
  if (camp && camp.kind) info = `<p>${{ wyrm: 'An Elder Wyrm broods here on its hoard. It is immensely strong — bring a great army and your hero.', undead: 'A horde of the restless dead. Destroy every horde to end the rising.', star: 'A fallen star, its crater guarded by star-touched beasts. Its star-iron goes to whoever claims it.', rift: 'A tear in the weave. Rift demons raid the nearest city now and then; sealing it gives +15 renown and its mana.' }[camp.kind]}</p>${intelHtml(t)}`;
  return head + islandNote + calHtml + info + extras(TILE_EXTRAS, city, t) + (modes.length ? sendForm(city, t, modes) : '');
};

const MODE_LABEL = { raid: '💰 Raid', attack: '⚔️ Attack', conquer: '📯 Conquer', settle: '🧺 Settle', reinforce: '🛡️ Reinforce', trade: '🐪 Caravan', scout: '🦅 Scout', adventure: '🦸 Adventure' };
const MODE_HELP = {
  raid: 'Hit and run: lighter losses on both sides, grab what you can carry.',
  attack: 'All-out battle: the loser is wiped out. Winning at an oasis claims it.',
  conquer: 'All-out battle with a Herald. Each win lowers loyalty; at 0 the city is yours.',
  settle: 'Send Settlers to found a new city here.',
  reinforce: 'Station troops (or your hero) in this city.',
  trade: 'Send goods by caravan (needs a Market in the sending city).',
  scout: 'Send scouts to report troops, stores and walls. Enemy scouts may catch them.',
  adventure: 'Send your hero (and an optional escort) into the ruins.',
};

const sendForm = (city, t, modes) => {
  if (!modes.includes(UI.mode)) UI.mode = modes[0];
  let form = '';
  if (UI.mode === 'trade') {
    const cap = G.caravanCap(S, city);
    form = `<p class="muted" style="font-size:12.5px">Capacity ${cap}. ${cap ? '' : '<span class="warn">Build a Market in ' + esc(city.name) + ' first.</span>'}</p>
      <table>${visibleGoods().map(g => { const k = 'cargo_' + g; return `<tr><td>${DATA.goods[g].icon} ${DATA.goods[g].name}</td><td class="muted">${fmt(city.res[g] || 0)}</td><td><input type="number" min="0" data-k="${k}" value="${esc(UI.form[k] || '')}"></td></tr>`; }).join('')}</table>`;
  } else {
    const allow = u => {
      if (UI.mode === 'scout') return u === 'scout';
      if (u === 'settlers') return UI.mode === 'settle' || UI.mode === 'reinforce';
      if (u === 'herald') return UI.mode === 'conquer' || UI.mode === 'reinforce';
      return true;
    };
    const units = Object.entries(city.units).filter(([u, n]) => n > 0 && allow(u));
    form = units.length ? `<table>${units.map(([u, n]) => { const k = 'send_' + u; const d = G.unitStats(S, 'p', u); return `<tr><td class="pt-cell">${ptHtml(unitSpec(u, 'p'), 28, '', d.name) || d.icon} ${d.name}</td><td class="muted">${n}</td><td><input type="number" min="0" max="${n}" data-k="${k}" value="${esc(UI.form[k] || '')}"></td><td><button class="small" data-act="allUnits" data-u="${u}" data-n="${n}">all</button></td></tr>`; }).join('')}</table>`
      : `<p class="muted">No suitable troops in ${esc(city.name)}.${UI.mode === 'adventure' ? ' Your hero must be in this city — select the city where your hero is.' : UI.mode === 'scout' ? ' Train scouts at the Barracks.' : ''}</p>`;
  }
  const sending = gatherSend(city);
  // generals and stances (generals.js): who leads the march and with what orders
  const orders = sendOrders(city);
  const ordersHtml = ordersForm(city, orders);
  const withOrders = fn => (G.withOrders && orders ? G.withOrders(S, 'p', sending, orders, fn) : fn());
  let eta = '';
  if (UI.mode === 'trade') { const pl = G.planMarch(S, 'p', city, t, {}); eta = pl.ok ? `Travel time ${fmtTime(realSecs(pl.dur))}` : `<span class="warn">${esc(pl.reason)}</span>`; }
  else if (G.unitsCount(sending)) { const pl = G.planMarch(S, 'p', city, t, sending); const mf = G.marchFactor && orders ? G.marchFactor(S, 'p', orders) : 1; eta = pl.ok ? `${pl.naval ? '⛵ By sea · ' : ''}Travel ${fmtTime(realSecs(Math.max(15, Math.round(pl.dur / mf))))} · attack ${fmt(G.atkPower(S, 'p', sending) * G.mod(S, 'p', null, 'atk'))} · carry ${fmt(G.carryOf(S, 'p', sending))}` : `<span class="warn">${esc(pl.reason)}</span>`; }
  let preview = '';
  if (['raid', 'attack', 'conquer'].includes(UI.mode) && G.unitsCount(sending)) {
    const pv = withOrders(() => (G.previewField || G.previewBattle)(S, city, t, sending, UI.mode));
    if (pv && !pv.known) preview = `<div class="preview unknown">🔍 Unknown defenders — scout this target first to see the expected outcome.</div>`;
    else if (pv) {
      const lostN = G.unitsCount(pv.attLost), sentN = G.unitsCount(sending);
      const verdict = pv.win ? (pv.attLoss < 0.15 ? 'Easy victory' : pv.attLoss < 0.45 ? 'Victory' : 'Costly victory') : (UI.mode === 'raid' ? 'Repelled' : 'Defeat');
      preview = `<div class="preview ${pv.win ? 'win' : 'loss'}"><b>${verdict}</b> expected · ⚔️ ${fmt(pv.A)} vs 🛡️ ${fmt(pv.D)}<br>
        You lose about ${lostN} of ${sentN} (${Math.round(pv.attLoss * 100)}%)${lostN ? ': ' + unitsHtml(pv.attLost) : ''}. They lose ${Math.round(pv.defLoss * 100)}%.
        ${pv.tactics ? (() => { const tc = pv.tactics, sg = p => (p > 0 ? '+' : '−') + Math.abs(p) + '%'; const own = tc.mods.filter(m => m.side === 'att' && (m.kind === 'field' || m.kind === 'counter' || m.kind === 'cap' || m.kind === 'stance' || m.kind === 'general')).map(m => `<span class="${m.pct > 0 ? 'good' : m.pct < 0 ? 'bad' : 'muted'}">${esc(m.label.replace(/^([^:]+): (?!army)/, '$1: your '))}${m.kind === 'cap' ? '' : ' ' + sg(m.pct)}</span>`); const foe = tc.mods.filter(m => m.side === 'def' && (m.kind === 'field' || m.kind === 'counter' || m.kind === 'stance' || m.kind === 'general')).map(m => `<span class="${m.pct > 0 ? 'bad' : 'good'}">${esc(m.label.replace(/^([^:]+): (?!army|holding)/, '$1: their '))} ${sg(m.pct)}</span>`); const stl = tc.stances ? `<br>${tc.stances.att.icon} ${esc(tc.stances.att.name)} stance${tc.stances.def && tc.stances.def.key !== 'standing' ? ` vs ${tc.stances.def.icon} ${esc(tc.stances.def.name)}` : ''}` : ''; return `<br>⛰️ ${tc.terrain ? esc(DATA.terrain[tc.terrain].name) : 'Open field'}${tc.crossing ? ' · 🌊 river crossing' : ''}${own.length ? ' · ' + own.join(' · ') : ''}${foe.length ? '<br><span class="muted">Defenders:</span> ' + foe.join(' · ') : ''}${stl}`; })() : ''}
        <span class="muted">${pv.estimated ? 'Estimate from the site\'s usual strength.' : 'Based on scouting ' + ago(S.time - pv.age) + '.'}</span></div>`;
    }
  }
  return `<div class="row" style="margin:8px 0">${modes.map(m => `<button class="${UI.mode === m ? 'primary' : ''} small" data-act="mode" data-m="${m}">${MODE_LABEL[m]}</button>`).join('')}</div>
    <p class="muted" style="font-size:12.5px">${MODE_HELP[UI.mode]}</p>
    ${form}${ordersHtml}${preview}
    <div class="row" style="margin-top:8px"><button class="primary" data-act="send">Send from ${esc(city.name)}</button><span class="muted" style="font-size:12px">${eta}</span></div>`;
};

// the general and stance picked in the send form (null when the module is absent or the mode takes no orders)
const sendOrders = city => {
  if (!G.generalsAt || !DATA.stances) return null;
  const hostile = ['raid', 'attack', 'conquer'].includes(UI.mode);
  if (!hostile && UI.mode !== 'reinforce') return null;
  let stance = hostile && DATA.stances[UI.form.stance] ? UI.form.stance : 'balanced';
  if (stance === 'skirmish' && UI.mode === 'conquer') stance = 'balanced';
  const gen = UI.form.sendGeneral && G.generalsAt(S, 'p', city.id).some(g => g.id === UI.form.sendGeneral) ? UI.form.sendGeneral : null;
  return { stance, general: gen };
};
const ordersForm = (city, orders) => {
  if (!orders) return '';
  const hostile = UI.mode !== 'reinforce';
  const gens = G.generalsAt(S, 'p', city.id);
  const g = orders.general && G.generalById(S, 'p', orders.general);
  const gpic = g && typeof ptHtml === 'function' ? ptHtml(G.generalSpec(S, 'p', g), 28, 'pt-inline', g.name) : '';
  const gsel = gens.length ? `<label class="row" style="gap:6px;font-size:13px;flex-wrap:wrap">${gpic || '🎖️'} General <select style="max-width:100%" data-k="sendGeneral"><option value="">— none —</option>${gens.map(g => `<option value="${esc(g.id)}" ${orders.general === g.id ? 'selected' : ''} ${g.hp < G.GEN.minHp ? 'disabled' : ''}>${esc(g.name)} · lvl ${g.level} · ${g.traits.map(t => DATA.generalTraits[t].name).join(', ')}${g.hp < G.GEN.minHp ? ' (wounded)' : ''}</option>`).join('')}</select></label>`
    : `<span class="muted" style="font-size:12.5px">🎖️ No general in ${esc(city.name)}${G.generalsOf(S, 'p').length ? ' (station one here from the Military tab)' : ''}.</span>`;
  const st = hostile ? `<div class="row" style="margin-top:6px;flex-wrap:wrap;gap:4px">${DATA.stanceOrder.filter(k => !(k === 'skirmish' && UI.mode === 'conquer')).map(k => { const d = DATA.stances[k]; return `<button class="small ${orders.stance === k ? 'primary' : ''}" data-act="stance" data-s="${k}" title="${esc(d.desc)}">${d.icon} ${d.name}</button>`; }).join('')}</div>
    <p class="muted" style="font-size:12px;margin:4px 0 0">${esc(DATA.stances[orders.stance].desc)}</p>` : '';
  return `<div class="orders" style="margin-top:8px">${gsel}${st}</div>`;
};

const gatherSend = city => {
  const units = {};
  for (const u of Object.keys(city.units)) { const v = parseInt(UI.form['send_' + u], 10); if (v > 0) units[u] = Math.min(v, city.units[u]); }
  return units;
};

Object.assign(act, {
  tile: d => { UI.sel = { x: +d.x, y: +d.y }; render(true); },
  mode: d => {
    UI.mode = d.m;
    const c = curCity();
    if (d.m === 'adventure' && c.units.hero) UI.form.send_hero = 1;
    if (d.m === 'scout' && c.units.scout) UI.form.send_scout = UI.form.send_scout || Math.min(3, c.units.scout);
    render(true);
  },
  allUnits: d => { UI.form['send_' + d.u] = d.n; render(true); },
  stance: d => { UI.form.stance = d.s; render(true); },
  send: () => {
    const city = curCity(); const t = UI.sel;
    let err;
    if (UI.mode === 'trade') {
      const cargo = {};
      for (const g of visibleGoods()) { const v = parseInt(UI.form['cargo_' + g], 10); if (v > 0) cargo[g] = v; }
      err = G.sendArmy(S, city.id, t.x, t.y, 'trade', {}, cargo);
      if (!err) for (const g of visibleGoods()) delete UI.form['cargo_' + g];
    } else {
      const orders = sendOrders(city);
      err = orders && G.sendArmyWith ? G.sendArmyWith(S, city.id, t.x, t.y, UI.mode, gatherSend(city), undefined, orders) : G.sendArmy(S, city.id, t.x, t.y, UI.mode, gatherSend(city));
      if (!err) delete UI.form.sendGeneral;
      if (!err) for (const k of Object.keys(UI.form)) if (k.startsWith('send_')) delete UI.form[k];
    }
    toast(err || 'On the march!'); render(true);
  },
  goTile: d => {
    UI.tab = 'world'; UI.sel = { x: +d.x, y: +d.y }; UI.mode = d.m || UI.mode;
    if (d.c) UI.city = d.c;
    if (d.m === 'adventure') UI.form.send_hero = 1;
    render(true);
  },
});
