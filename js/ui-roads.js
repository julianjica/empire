// =====================================================================
//  Roads & bridges UI: the tile panel shows the ground's march cost, the road,
//  its wear toward the next level and any river crossing; the player may order a bridge.
//  The engine side lives in js/roads.js; the map draws the network (worldmap.js paintRoads).
// =====================================================================
'use strict';
if (typeof TILE_EXTRAS !== 'undefined' && G.roadInfo) {
  const RD = G.ROADS;
  const costTxt = cost => Object.entries(cost).map(([g, v]) => `${Math.round(v)} ${g === 'gold' ? '🪙 gold' : (DATA.goods[g] ? DATA.goods[g].icon + ' ' + DATA.goods[g].name.toLowerCase() : g)}`).join(', ');
  const pctW = (a, b) => Math.max(0, Math.min(100, Math.round(a / b * 100)));

  const xf = f => '×' + (Math.round(f * 100) / 100);
  // how hard the ground is to march over: the terrain's factor off-road, and what a road here makes of it
  const terrainLine = (t, info) => {
    const tf = G.terrainFactor ? G.terrainFactor(S, t.x, t.y) : 1;
    if (tf === null) return '';
    const name = t.city ? 'City streets' : (DATA.terrain[t.terrain] ? DATA.terrain[t.terrain].name : t.terrain);
    const adj = G.raceTerrain && G.raceTerrain(S, 'p'), mine = !t.city && adj && adj[t.terrain] !== undefined && adj[t.terrain] < tf ? adj[t.terrain] : null;
    const people = mine !== null ? ` · your ${esc(DATA.races[S.empires.p.race].name)} ${xf(mine)}` : '';
    const rough = tf >= 2 ? ', hard going' : tf >= 1.4 ? ', slow going' : '';
    const body = info.lvl
      ? `marching ${xf(info.factor)} on this ${RD.names[info.lvl].toLowerCase()} <span class="muted">(off-road ${xf(tf)}${rough}${people})</span>`
      : `marching ${xf(tf)}${rough}${people} <span class="muted">(road: ${xf(RD.F[2])})</span>`;
    return `<div title="March cost per tile, relative to open ground (×1). A road overrides the terrain, so roads pay off most in rough country.">⛰️ <b>${esc(name)}</b> — ${body}</div>`;
  };
  TILE_EXTRAS.push((city, t) => {
    if (!S || !t || G.isWater(t)) return '';
    const info = G.roadInfo(S, t.x, t.y);
    const parts = [];
    const tl = terrainLine(t, info);
    if (tl) parts.push(tl);
    // the road
    if (info.lvl || info.wear >= 0.5) {
      const speed = Math.round((1 / info.factor - 1) * 100);
      let line = info.lvl ? `${RD.icons[info.lvl]} <b>${info.name}</b> · marches ${speed}% faster along it` : '👣 <b>Footpath</b> · not yet a track';
      let bar = '';
      if (info.next) {
        const lo = RD.T[info.lvl];
        const paveNote = info.lvl === 2 ? (() => {
          const own = G.landOwner(S, t.x, t.y);
          if (!own) return ' (neutral land is never paved)';
          if (!G.hasTech(S, own, RD.pave.tech)) return ` (paving needs ${DATA.techs && DATA.techs[RD.pave.tech] ? DATA.techs[RD.pave.tech].name : 'Logistics'}${own === 'p' ? '' : ' in ' + esc(S.empires[own].name)})`;
          return ` (paving takes ${RD.pave.stone} 🪨 stone)`;
        })() : '';
        bar = `<div class="bar" title="Traffic toward ${RD.names[info.lvl + 1]}"><i style="width:${pctW(info.wear - lo, info.next - lo)}%"></i></div><span class="muted" style="font-size:12px">traffic ${Math.floor(info.wear)}/${info.next} toward ${RD.names[info.lvl + 1]}${paveNote}</span>`;
      }
      const fade = info.lvl ? `<div class="muted" style="font-size:12px">fades a level after ${fmtTime(realSecs(info.idleLeft))} without traffic</div>` : '';
      parts.push(`<div>${line}${bar}${fade}</div>`);
    }
    // the river
    if (info.river && !t.city) {
      const b = info.bridge;
      if (b && b.d) {
        const who = S.empires[b.o] ? S.empires[b.o].name : 'someone';
        let up = '';
        if (b.up) up = ` · masons rebuilding it in stone, ${fmtTime(realSecs(b.up - S.time))} left`;
        else if (b.o === 'p' && b.k === 'wood' && G.bridgeKind(S, 'p') === 'stone') up = ` <button class="small" data-act="roadsUpgrade" data-x="${t.x}" data-y="${t.y}" title="${esc(costTxt({ ...RD.bridge.stone.cost, gold: RD.bridge.orderGold.stone }))}">🧱 Rebuild in stone</button>`;
        parts.push(`<div>🌉 <b>${b.k === 'stone' ? 'Stone' : 'Wooden'} bridge</b> (built by ${esc(who)}) · no ford to wade${b.k === 'wood' ? ' · floods can sweep it away' : ''}${up}</div>`);
      } else if (b) {
        parts.push(`<div>🏗️ <b>${b.k === 'stone' ? 'Stone' : 'Wooden'} bridge under construction</b> · ${fmtTime(realSecs(b.at - S.time))} left<div class="bar"><i style="width:${pctW(S.time - b.t0, b.at - b.t0)}%"></i></div></div>`);
      } else {
        const q = G.bridgeQuote(S, 'p', t.x, t.y);
        const mine = info.ford && info.ford.p ? ` · your traffic has forded here ${Math.floor(info.ford.p)}/${RD.bridge.fords} times before your builders bridge it` : '';
        const order = q.ok
          ? `<button class="small" data-act="roadsBridge" data-x="${t.x}" data-y="${t.y}">🌉 Build a ${q.kind === 'stone' ? 'stone' : 'wooden'} bridge</button> <span class="muted" style="font-size:12px">${esc(costTxt(q.cost))} from ${esc(q.city.name)} · ready in ${fmtTime(realSecs(q.dur))}</span>`
          : `<span class="muted" style="font-size:12px">No bridge possible: ${esc(q.err)}${q.cost ? ' (' + esc(costTxt(q.cost)) + ')' : ''}</span>`;
        parts.push(`<div>🌊 <b>River ford</b> · wading costs about ${RD.ford} extra tiles of march${mine}<br>${order}</div>`);
      }
    }
    return parts.length ? `<div class="card rd-tile" style="padding:6px 9px;margin:6px 0;font-size:13px">${parts.join('<div style="height:4px"></div>')}</div>` : '';
  });

  Object.assign(act, {
    roadsBridge: d => { const e = G.orderBridge(S, 'p', +d.x, +d.y); toast(e || '🌉 Builders set out to bridge the river'); render(true); },
    roadsUpgrade: d => { const e = G.upgradeBridge(S, 'p', +d.x, +d.y); toast(e || '🧱 Masons begin rebuilding the bridge in stone'); render(true); },
  });

  if (typeof HELP_SECTIONS !== 'undefined' && !HELP_SECTIONS.some(h => h.id === 'roads')) {
    const i = HELP_SECTIONS.findIndex(h => h.id === 'trade');
    HELP_SECTIONS.splice(i >= 0 ? i + 1 : HELP_SECTIONS.length, 0, { id: 'roads', icon: '🛤️', title: 'Roads & bridges', tabs: [], words: 'road roads track paved paving bridge bridges river ford wade caravan traffic travel movement speed logistics arches terrain hills mountain forest march cost',
      html: `<p>Roads are not built by hand: <b>traffic wears them into the land</b>. Every finished journey along a path (caravans, supply carts and trade routes most; armies a little) adds wear to each tile it crossed.</p><ul><li><b>🥾 Track</b> (${RD.T[1]} trips): marches ${Math.round((1 / RD.F[1] - 1) * 100)}% faster. <b>🛤️ Road</b> (${RD.T[2]}): ${Math.round((1 / RD.F[2] - 1) * 100)}% faster. <b>🧱 Paved road</b> (${RD.T[3]}): ${Math.round((1 / RD.F[3] - 1) * 100)}% faster — paving needs <b>Logistics</b> and ${RD.pave.stone} stone per tile from the realm whose land it is (neutral land stays unpaved).</li><li>A road unused for ${RD.idle} game-minutes fades one level.</li><li>Every realm's armies, caravans and settlers use every road — <b>including your enemies</b>.</li></ul><p><b>Terrain</b> slows marches off-road: open plains and vales ×1, forest ×${RD.terrain.forest}, hills ×${RD.terrain.hills}, mountains ×${RD.terrain.mountain} (per tile, relative to open ground). A road <b>replaces</b> the terrain's cost with its own, so a road through the hills or over a pass saves far more than one across the plains. The Sylvani march through forest as on open ground, Deepdelvers take hills and mountains in their stride and the tireless Gravebound feel them less (the tile panel shows your own people's cost). Trade routes, supply carts and armies all feel it: a city walled in by hills trades slowly until its roads are worn in.</p><p><b>Rivers</b>: wading an unbridged river costs about ${RD.ford} extra tiles of march. Where your traffic keeps fording on your own or neutral land, the nearest city bridges it on its own (${RD.bridge.wood.cost.timber} timber, ${RD.bridge.wood.min} game-minutes; with <b>Arches &amp; Vaults</b> a stone bridge). You can also order one on a river tile in or next to your land from the map. A bridge also spares attackers the river-crossing penalty in battle. Floods sweep wooden bridges away, and an enemy that wins a battle on a bridge burns it.</p>` });
  }
  if (typeof HELP_GLOSSARY !== 'undefined') {
    HELP_GLOSSARY.push(['Road', 'A path worn by traffic: Track, Road, then Paved road (with Logistics). Faster marches for everyone.', 'roads']);
    HELP_GLOSSARY.push(['Ford', 'An unbridged river tile: wading it slows a march. Bridges remove it.', 'roads']);
    HELP_GLOSSARY.push(['March cost', 'How slow a tile is to cross: open ground ×1, forest, hills and mountains more. A road replaces it with its own.', 'roads']);
  }
}
