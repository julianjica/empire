// =====================================================================
//  Magic tab: the Grimoire (a progressive study tree: circles as bands,
//  schools as lanes), the study queue, schools and their routes, the
//  spellbook with mastery and metamagic, enchantments per city, the
//  celestial calendar, weave strain, the ley network and the Great
//  Working; plus a mana chip in the city header.
//  Tile spells hand off to the World map (worldmap.js) through
//  UI.spellTarget = { spell, city }.
//  The tree picture is built once (per people) and kept alive across the
//  once-a-second rebuild through MOUNT_HOOKS; it scrolls natively (touch
//  friendly) and only its state classes change.
// =====================================================================
'use strict';
(() => {
  const STRAIN_WARN = 60;
  const OWNER = 'p';
  const ARCANE = G.ARCANE_COLOR || '#8a5cd6';
  const NS = 'http://www.w3.org/2000/svg';
  const COL_W = 132, X0 = 128, HEAD_H = 62, ROW_H = 84, LANE_PAD = 10, R = 21;
  UI.gm = UI.gm || { sel: null, z: 1, list: false, sect: null };
  const gm = UI.gm;
  const N = id => DATA.arcana[id];
  const schoolColor = k => k && DATA.schools[k] ? DATA.schools[k].color : ARCANE;

  // ---- helpers ----------------------------------------------------------
  const strainOf = cityId => ((S.magic && S.magic.strain) || {})[cityId] || 0;
  const manaIncome = () => G.citiesOf(S, OWNER).reduce((a, c) => a + (G.econ(S, c).net.mana || 0), 0);
  let lastSideCity = null;
  const castCity = () => {
    if (UI.city !== lastSideCity) { lastSideCity = UI.city; delete UI.form.mg_city; }
    const id = UI.form.mg_city;
    const c = id && S.cities[id];
    if (c && c.owner === OWNER) return c;
    return curCity();
  };
  const schoolPill = (k, note) => {
    const sc = DATA.schools[k];
    const god = DATA.gods && DATA.gods[sc.god];
    return `<span class="mg-school" style="--school:${sc.color}" title="${esc(sc.name)}${god ? ' · aligned with ' + esc(god.name) : ''}">${sc.icon} ${esc(sc.name)}${note ? ` <span class="mg-why">${note}</span>` : ''}</span>`;
  };
  const manaCost = cost => `<span class="mg-cost ${G.manaOf(S, OWNER) < cost ? 'lack' : ''}" title="Mana, drawn from the casting city first, then from your other cities">✨ ${fmt(cost)}</span>`;
  const costLine = (cost, city) => `<span class="cost mg-costline">${Object.entries(cost).map(([g, v]) => {
    const have = g === 'mana' ? G.manaOf(S, OWNER) : g === 'gold' ? S.empires[OWNER].gold : (city ? city.res[g] || 0 : 0);
    const ic = g === 'mana' ? '✨' : g === 'gold' ? '🪙' : (DATA.goods[g] ? DATA.goods[g].icon : g);
    return `<span class="${have < v ? 'lack' : ''}" title="${esc(g === 'mana' ? 'Mana (whole realm)' : g === 'gold' ? 'Gold' : DATA.goods[g].name)}">${ic} ${fmt(v)}</span>`;
  }).join('')}</span>`;
  const strainBar = v => {
    const lvl = v > STRAIN_WARN ? 'hi' : v > STRAIN_WARN * 0.6 ? 'mid' : 'lo';
    return `<div class="mg-strain mg-${lvl}" title="Weave strain ${Math.round(v)}. It fades by 2 per minute; above ${STRAIN_WARN} wild magic may lash back."><i style="width:${Math.min(100, v)}%"></i><span>${Math.round(v)}</span></div>`;
  };
  const stageTime = stage => G.workingStageTime ? G.workingStageTime(S, stage) : Math.round(2400 * Math.pow(1.25, stage) * G.pace(S).time);
  const masteryPips = id => {
    const p = G.masteryProgress(S, OWNER, id);
    return `<span class="mg-mastery" title="Mastery rank ${p.rank} of 3 (${p.casts} casts${p.next ? `; next rank at ${p.next}` : ''}). Each rank: +8% power, −7% mana, −10% cooldown.">${[1, 2, 3].map(i => `<i class="${i <= p.rank ? 'on' : ''}"></i>`).join('')}</span>`;
  };
  const metaPrepared = () => (UI.form.mg_meta || '').split(',').filter(k => DATA.metamagic[k] && G.metaKnown(S, OWNER).includes(k));

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
  const starHtml = () => {
    const cj = G.conjunction(S);
    const sc = k => DATA.schools[k];
    if (cj.active) return `<div class="mg-star on" style="--school:${sc(cj.active.school).color}">🌌 <b>${esc(sc(cj.active.school).star)}</b> is in the sky: ${sc(cj.active.school).icon} ${esc(sc(cj.active.school).name)} spells +${Math.round((G.ARC.star.power - 1) * 100)}% power, −${Math.round((1 - G.ARC.star.cost) * 100)}% mana; its enchantments half upkeep. <span class="muted">${fmtTime(realSecs(cj.active.end - S.time))} left</span></div>`;
    return `<div class="mg-star" style="--school:${sc(cj.next.school).color}">🌌 Next conjunction: <b>${esc(sc(cj.next.school).star)}</b> (${sc(cj.next.school).icon} ${esc(sc(cj.next.school).name)}) in ${fmtTime(realSecs(cj.next.start - S.time))}</div>`;
  };
  const headerHtml = () => {
    const att = G.attunedSchools(S, OWNER), opened = G.openedSchools(S, OWNER).filter(k => !att.includes(k));
    const race = S.empires[OWNER].race;
    const tower = G.towerLevel(S, OWNER);
    const inc = manaIncome();
    const era = G.techEra(S, OWNER);
    const circle = DATA.circles.reduce((a, c, i) => tower >= c.tower && era >= c.era ? i : a, -1);
    return `<div class="card mg-head">
      <div class="row"><span class="mg-orb">🔮</span>
        <div><h2 style="margin:0">Magic of ${esc(S.empires[OWNER].name)}</h2>
          <div class="muted" style="font-size:13px">Study the Grimoire, open schools, master spells, bind enchantments.</div></div>
        <span class="spacer"></span>
        <div class="mg-stat"><span class="muted">Mana</span><b>✨ ${fmt(G.manaOf(S, OWNER))}</b><span class="${inc > 0 ? 'good' : inc < 0 ? 'bad' : 'muted'}">${fmtRate(inc)}/min</span></div>
        <div class="mg-stat"><span class="muted">Mage Tower</span><b>🔮 ${tower || '—'}</b><span class="muted">${circle >= 0 ? DATA.circles[circle].name + ' circle' : 'no circle yet'}</span></div>
      </div>
      <div class="row mg-schools">
        <span class="muted" style="font-size:12.5px">Schools:</span>
        ${att.map(k => schoolPill(k, DATA.schools[k].race === race ? 'native' : 'faith')).join('')}
        ${opened.map(k => schoolPill(k, 'opened')).join('')}
        <span class="muted" style="font-size:12px">${G.foreignOpen(S, OWNER).length}/${G.schoolCap(S, OWNER)} foreign</span>
      </div>
      ${starHtml()}
      ${tower ? '' : `<p class="warn" style="font-size:12.5px;margin:6px 0 0">Build a 🔮 Mage Tower (Town Hall 4, Academy 1) to study and cast. Circles open at tower 1, 5, 10 and 15, and with the realm's research era.</p>`}
    </div>`;
  };

  // ---- the Grimoire tree (SVG, kept alive across renders) -----------------
  let L = null, view = null;
  const wrapName = name => {
    const words = name.split(' '), lines = [''];
    for (const w of words) { const cur = lines[lines.length - 1]; if (cur && (cur + ' ' + w).length > 14 && lines.length < 2) lines.push(w); else lines[lines.length - 1] = cur ? cur + ' ' + w : w; }
    return lines;
  };
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const layout = () => {
    const lanes = [];
    let y = HEAD_H;
    for (const k of DATA.arcanaLanes) {
      const ids = DATA.arcanaOrder.filter(id => (N(id).school || null) === k);
      const byCol = {};
      for (const id of ids) (byCol[N(id).col] = byCol[N(id).col] || []).push(id);
      const rows = Math.max(1, ...Object.values(byCol).map(l => l.length));
      const h = rows * ROW_H + LANE_PAD * 2;
      lanes.push({ k, y, h, byCol });
      y += h;
    }
    const pos = {};
    for (const ln of lanes) for (const [c, list] of Object.entries(ln.byCol)) list.forEach((id, i) => { pos[id] = { x: X0 + (+c + 0.5) * COL_W, y: ln.y + ln.h / 2 + (i - (list.length - 1) / 2) * ROW_H - 7 }; });
    return { lanes, pos, W: X0 + 12 * COL_W + 20, H: y + 12 };
  };
  const shape = (n, g, color) => {
    if (n.kind === 'lore') return el('rect', { x: -R + 2, y: -R + 2, width: 2 * R - 4, height: 2 * R - 4, rx: 7, class: 'gm-frame', stroke: color }, g);
    if (n.kind === 'meta') return el('rect', { x: -R + 4, y: -R + 4, width: 2 * R - 8, height: 2 * R - 8, rx: 4, transform: 'rotate(45)', class: 'gm-frame', stroke: color }, g);
    if (n.kind === 'ench') { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; p.push((Math.cos(a) * R).toFixed(1) + ',' + (Math.sin(a) * R).toFixed(1)); } return el('polygon', { points: p.join(' '), class: 'gm-frame', stroke: color }, g); }
    return el('circle', { r: R, class: 'gm-frame', stroke: color }, g);
  };
  const build = () => {
    L = layout();
    const root = document.createElement('div');
    root.className = 'gm-view';
    // two pictures side by side in one scroller: the lane labels stay put (sticky) while the tree scrolls under them
    const inner = document.createElement('div'); inner.className = 'gm-inner'; root.appendChild(inner);
    const svgL = el('svg', { class: 'gm-svgl', viewBox: `0 0 ${X0} ${L.H}`, 'aria-hidden': 'true' }, inner);
    el('rect', { x: 0, y: 0, width: X0, height: L.H, fill: '#1b1530' }, svgL);
    const svg = el('svg', { class: 'gm-svg', viewBox: `${X0} 0 ${L.W - X0} ${L.H}`, role: 'img', 'aria-label': 'The Grimoire: circles from left to right, schools as rows. Select a node for details.' }, inner);
    const defs = el('defs', {}, svg);
    defs.innerHTML = `<pattern id="gmStars" width="70" height="70" patternUnits="userSpaceOnUse"><circle cx="9" cy="14" r="1" fill="#fff6cf" opacity=".8"/><circle cx="44" cy="7" r=".7" fill="#fff" opacity=".6"/><circle cx="58" cy="41" r="1.1" fill="#e6d4ff" opacity=".7"/><circle cx="24" cy="52" r=".6" fill="#fff" opacity=".7"/></pattern>
      <filter id="gmGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    // circle bands
    for (let c = 0; c < 4; c++) {
      const x = X0 + c * 3 * COL_W;
      el('rect', { x, y: 0, width: 3 * COL_W + (c === 3 ? 20 : 0), height: L.H, class: 'gm-band b' + c }, svg);
      if (c === 3) el('rect', { x, y: 0, width: 3 * COL_W + 20, height: L.H, fill: 'url(#gmStars)', opacity: .9 }, svg);
      const C = DATA.circles[c];
      const t = el('text', { x: x + 1.5 * COL_W, y: 26, 'text-anchor': 'middle', class: 'gm-bandname b' + c }, svg); t.textContent = `${C.icon} ${C.roman}. ${C.name}`;
      const t2 = el('text', { x: x + 1.5 * COL_W, y: 44, 'text-anchor': 'middle', class: 'gm-bandsub b' + c }, svg); t2.textContent = `Mage Tower ${C.tower} · ${DATA.techEras[C.era].name} era`;
    }
    // lanes
    const laneEls = {};
    L.lanes.forEach((ln, i) => {
      const color = schoolColor(ln.k);
      const g = el('g', { class: 'gm-lane' }, svg);
      el('rect', { x: 0, y: ln.y, width: L.W, height: ln.h, fill: color, opacity: i % 2 ? .07 : .11, class: 'gm-lanebg' }, g);
      el('path', { d: `M0 ${ln.y} H${L.W}`, class: 'gm-lanerule' }, g);
      const gl = el('g', { class: 'gm-lane' }, svgL);
      el('rect', { x: 0, y: ln.y, width: X0, height: ln.h, class: 'gm-lanehead', fill: color }, gl);
      el('path', { d: `M0 ${ln.y} H${X0}`, class: 'gm-lanerule' }, gl);
      const sc = ln.k ? DATA.schools[ln.k] : { icon: '📖', name: 'Foundations' };
      const ic = el('text', { x: 20, y: ln.y + ln.h / 2 + 7, 'text-anchor': 'middle', class: 'gm-laneico' }, gl); ic.textContent = sc.icon;
      const words = sc.name.split(' & ');
      words.forEach((w, k) => { const tx = el('text', { x: 38, y: ln.y + ln.h / 2 + (k - (words.length - 1) / 2) * 14 + 4, class: 'gm-lanename' }, gl); tx.textContent = (k ? '& ' : '') + w; });
      const st = el('text', { x: 38, y: ln.y + ln.h - 8, class: 'gm-lanestate' }, gl);
      laneEls[ln.k || 'f'] = { g: gl, st, bg: g };
    });
    // links (prerequisites) and fork ties
    const linkG = el('g', { class: 'gm-links' }, svg);
    const links = [];
    for (const id of DATA.arcanaOrder) for (const grp of N(id).pre) for (const r of grp) {
      const a = L.pos[r], b = L.pos[id];
      const x1 = a.x + R, x2 = b.x - R - 3, dx = Math.max(24, (x2 - x1) * 0.5);
      const p = el('path', { d: `M${x1} ${a.y} C${x1 + dx} ${a.y} ${x2 - dx} ${b.y} ${x2} ${b.y}`, class: 'gm-link' + (grp.length > 1 ? ' alt' : ''), stroke: schoolColor(N(id).school) }, linkG);
      links.push({ from: r, to: id, p, cls: '' });
    }
    for (const id of DATA.arcanaOrder) { const n = N(id); if (n.excl && id < n.excl) { const a = L.pos[id], b = L.pos[n.excl]; el('path', { d: `M${a.x} ${a.y + R} L${b.x} ${b.y - R}`, class: 'gm-fork' }, linkG); const t = el('text', { x: (a.x + b.x) / 2 + 9, y: (a.y + b.y) / 2 + 4, class: 'gm-forkmark' }, linkG); t.textContent = 'or'; } }
    // nodes
    const nodes = {};
    const nodeG = el('g', { class: 'gm-nodes' }, svg);
    for (const id of DATA.arcanaOrder) {
      const n = N(id), p = L.pos[id], color = schoolColor(n.school);
      const g = el('g', { class: 'gm-node', style: '--c:' + color, transform: `translate(${p.x} ${p.y})`, 'data-id': id, tabindex: 0, role: 'button', 'aria-label': `${n.name} (${n.kind})` }, nodeG);
      el('circle', { r: R + 7, class: 'gm-halo', fill: color }, g);
      const ring = el('circle', { r: R + 4, class: 'gm-ring', stroke: color, transform: 'rotate(-90)', 'stroke-dasharray': `0 ${2 * Math.PI * (R + 4)}` }, g);
      shape(n, g, color);
      const ic = el('text', { y: 6, 'text-anchor': 'middle', class: 'gm-ico' }, g); ic.textContent = n.icon;
      wrapName(n.name).forEach((ln, i) => { const t = el('text', { y: R + 14 + i * 12, 'text-anchor': 'middle', class: 'gm-name' }, g); t.textContent = ln; });
      if (n.excl) { const f = el('text', { x: -R + 1, y: -R + 6, 'text-anchor': 'middle', class: 'gm-badge' }, g); f.textContent = '⑂'; }
      if (n.innate) { const f = el('text', { x: -R + 1, y: -R + 6, 'text-anchor': 'middle', class: 'gm-badge' }, g); f.textContent = '★'; }
      const qb = el('g', { class: 'gm-q', transform: `translate(${R - 1} ${-R + 2})` }, g);
      el('circle', { r: 8 }, qb);
      const qt = el('text', { y: 4, 'text-anchor': 'middle' }, qb);
      const lock = el('text', { class: 'gm-lock', x: R - 2, y: R, 'text-anchor': 'middle' }, g); lock.textContent = '🔒';
      nodes[id] = { g, ring, qt, cls: '', q: '', pctv: -1 };
    }
    el('rect', { x: 0, y: 0, width: X0, height: HEAD_H, class: 'gm-corner' }, svgL);
    const ct = el('text', { x: X0 / 2, y: 36, 'text-anchor': 'middle', class: 'gm-cornertext' }, svgL); ct.textContent = '📜 Grimoire';
    view = { root, svg, svgL, nodes, links, laneEls, key: S.empires[OWNER].race + '|' + DATA.arcanaOrder.length };
    root.addEventListener('click', ev => {
      const n = ev.target.closest && ev.target.closest('.gm-node');
      if (!n) return;
      const id = n.getAttribute('data-id');
      if (ev.shiftKey) { toast(G.planStudy(S, OWNER, id) || `${N(id).name} and its path added to the study queue`); }
      gm.sel = id; render(true);
    });
    root.addEventListener('keydown', ev => {
      const n = ev.target.closest && ev.target.closest('.gm-node');
      if (n && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); gm.sel = n.getAttribute('data-id'); render(true); }
    });
    root.addEventListener('pointerdown', () => { UI.holding = true; });
    root.addEventListener('scroll', () => { gm.sx = root.scrollLeft; gm.sy = root.scrollTop; UI.holding = true; clearTimeout(view.st); view.st = setTimeout(() => { UI.holding = false; }, 250); }, { passive: true });
  };
  // the state of a node for the player
  const nodeState = id => {
    const A = G.grimoire(S, OWNER), n = N(id);
    if (A.known.includes(id)) return 'known';
    if (A.active && A.active.id === id) return 'active';
    const st = G.arcanaStatus(S, OWNER, id);
    if (st.forsaken) return 'forsaken';
    if (st.closed) return 'closed';
    if (st.ok || st.poor || st.busy) return 'avail';
    if (st.tower || st.era || st.tech) return 'gated';
    return 'locked';
  };
  const applyZoom = () => {
    if (!view) return;
    const zl = Math.min(gm.z, window.innerWidth < 520 ? 0.62 : 1);   // phones: narrower labels
    view.svgL.setAttribute('width', Math.round(X0 * zl)); view.svgL.setAttribute('height', Math.round(L.H * gm.z));
    view.svgL.setAttribute('preserveAspectRatio', 'xMinYMin slice');
    view.svg.setAttribute('width', Math.round((L.W - X0) * gm.z)); view.svg.setAttribute('height', Math.round(L.H * gm.z));
  };
  const updateOverlay = () => {
    const A = G.grimoire(S, OWNER);
    const q = A.queue;
    for (const id of DATA.arcanaOrder) {
      const n = view.nodes[id], s = nodeState(id), qi = q.indexOf(id);
      const cls = `gm-node k-${N(id).kind} ${s}${qi >= 0 ? ' queued' : ''}${gm.sel === id ? ' sel' : ''}`;
      if (cls !== n.cls) { n.g.setAttribute('class', cls); n.cls = cls; }
      const qs = qi >= 0 ? String(qi + 1) : '';
      if (qs !== n.q) { n.qt.textContent = qs; n.q = qs; }
      const pv = s === 'active' ? Math.round(pct(S.time - A.active.start, A.active.end - A.active.start)) : -1;
      if (pv !== n.pctv) { const C = 2 * Math.PI * (R + 4); n.ring.setAttribute('stroke-dasharray', pv >= 0 ? `${C * pv / 100} ${C}` : `0 ${C}`); n.pctv = pv; }
    }
    for (const l of view.links) {
      const a = A.known.includes(l.from), b = A.known.includes(l.to) || (A.active && A.active.id === l.to);
      const cls = `gm-link${N(l.to).pre.some(g => g.length > 1 && g.includes(l.from)) ? ' alt' : ''}${a && b ? ' done' : a ? ' ready' : ''}${gm.sel && (l.to === gm.sel || l.from === gm.sel) ? ' selpath' : ''}`;
      if (cls !== l.cls) { l.p.setAttribute('class', cls); l.cls = cls; }
    }
    const schools = G.schoolsOf(S, OWNER), att = G.attunedSchools(S, OWNER);
    for (const k of DATA.arcanaLanes) {
      const le = view.laneEls[k || 'f'];
      const st = !k ? 'open to all' : att.includes(k) ? 'attuned' : schools.includes(k) ? 'opened' : 'closed';
      if (le.st.textContent !== st) { le.st.textContent = st; le.g.setAttribute('class', 'gm-lane ' + st.replace(/ /g, '-')); le.bg.setAttribute('class', 'gm-lane ' + st.replace(/ /g, '-')); }
    }
  };
  MOUNT_HOOKS.push(tab => {
    if (tab !== 'magic' || !S || gm.list) return;
    const host = document.getElementById('gmHost');
    if (!host) return;
    const key = S.empires[OWNER].race + '|' + DATA.arcanaOrder.length;
    const first = !view || view.key !== key;
    if (first) build();
    if (!gm.zSet) { gm.zSet = true; gm.z = window.innerWidth < 520 ? 0.75 : 1; }
    applyZoom();
    if (view.root.parentNode !== host) { host.textContent = ''; host.appendChild(view.root); view.root.scrollLeft = gm.sx || 0; view.root.scrollTop = gm.sy || 0; }
    updateOverlay();
    if (first || view.lastS !== S) { view.lastS = S; frontier(); }
  });
  // scroll to the first circle with something to study
  const frontier = () => {
    const A = G.grimoire(S, OWNER);
    const open = DATA.arcanaOrder.filter(id => !A.known.includes(id) && ['avail', 'gated'].includes(nodeState(id)));
    const col = open.length ? Math.min(...open.map(id => N(id).col)) : 0;
    view.root.scrollLeft = gm.sx = Math.max(0, (col * COL_W - 30) * gm.z);
  };

  // ---- study bar and detail ----------------------------------------------
  const studyHtml = () => {
    const A = G.grimoire(S, OWNER);
    let act = '';
    if (A.active) {
      const n = N(A.active.id);
      act = `<div class="mg-active" style="--school:${schoolColor(n.school)}"><span class="mg-activeico">${n.icon}</span><div class="mg-activebody"><div><b>Studying ${esc(n.name)}</b> <span class="muted">in ${esc((S.cities[A.active.city] || {}).name || '?')} · done in ${fmtTime(realSecs(A.active.end - S.time))}</span></div><div class="bar mg-bar"><i style="width:${pct(S.time - A.active.start, A.active.end - A.active.start)}%"></i></div></div><button class="small" data-act="mgSel" data-id="${A.active.id}">Show</button><button class="small" data-act="mgCancel" title="Refund 50%">Cancel</button></div>`;
    }
    const note = G.studyQueueNote(S, OWNER);
    const q = A.queue.length ? `<div class="mg-queue"><span class="muted">Queue (${A.queue.length}):</span>${A.queue.map((id, i) => `<span class="mg-qchip" style="--school:${schoolColor(N(id).school)}"><b>${i + 1}</b> <button class="link" data-act="mgSel" data-id="${id}">${N(id).icon} ${esc(N(id).name)}</button>${i ? `<button class="small" data-act="mgMove" data-id="${id}" data-d="-1" aria-label="Move up">▲</button>` : ''}${i < A.queue.length - 1 ? `<button class="small" data-act="mgMove" data-id="${id}" data-d="1" aria-label="Move down">▼</button>` : ''}<button class="small" data-act="mgUnqueue" data-id="${id}" aria-label="Remove ${esc(N(id).name)} from the queue">✕</button></span>`).join('')}${note ? `<span class="warn mg-qnote">⏳ ${esc(note)}</span>` : ''}</div>` : '';
    return act + q;
  };
  const chip = id => { const A = G.grimoire(S, OWNER); return `<button class="small mg-nchip ${A.known.includes(id) ? 'done' : ''}" style="--school:${schoolColor(N(id).school)}" data-act="mgSel" data-id="${id}">${N(id).icon} ${esc(N(id).name)}${A.known.includes(id) ? ' ✓' : ''}</button>`; };
  const KIND = { spell: 'Spell', lore: 'Lore', meta: 'Metamagic', ench: 'Enchantment' };
  const detailHtml = () => {
    const id = gm.sel, n = id && N(id);
    if (!n) return `<div class="mg-detail muted">Select a node to see what it teaches and what it needs. <span class="mg-legend"><i class="k-spell"></i> spell <i class="k-lore"></i> lore <i class="k-meta"></i> metamagic <i class="k-ench"></i> enchantment · ⑂ fork (choose one) · ★ known to all · shift-click plans a path</span></div>`;
    const A = G.grimoire(S, OWNER), st = G.arcanaStatus(S, OWNER, id), C = DATA.circles[n.circle];
    const sc = n.school ? DATA.schools[n.school] : null;
    const path = G.arcanaPath(S, OWNER, id), planN = path.filter(k => k !== id && !A.queue.includes(k)).length;
    const inQ = A.queue.includes(id);
    let action;
    if (st.known) action = '<span class="good">✅ Learned</span>';
    else if (st.active) action = `<span class="good">📖 Being studied: ${fmtTime(realSecs(A.active.end - S.time))} left</span>`;
    else if (st.forsaken) action = `<span class="bad">⑂ ${esc(st.reason)}</span>`;
    else action = `<button class="${st.ok ? 'primary' : ''}" data-act="mgStudy" data-id="${id}" ${st.ok ? '' : 'disabled'}>Study</button>
      ${inQ ? `<button class="small" data-act="mgUnqueue" data-id="${id}">Remove from queue</button>` : `<button class="small" data-act="mgQueue" data-id="${id}" ${st.closed ? 'disabled' : ''}>Queue</button>${planN > 0 ? `<button class="small" data-act="mgPlan" data-id="${id}" ${st.closed ? 'disabled' : ''} title="Queue the ${planN} missing prerequisite${planN > 1 ? 's' : ''} and this, in order">🗺️ Plan path (+${planN})</button>` : ''}`}
      <span class="muted" style="font-size:12px">⏱ ${fmtTime(realSecs(st.time || 0))}</span>
      ${st.reason ? `<span class="${st.poor || st.busy ? 'muted' : 'warn'}" style="font-size:12px">${esc(st.reason)}</span>` : ''}`;
    const links = [];
    if (n.tech) links.push(`needs research <b>${esc(DATA.techs[n.tech].name)}</b>`);
    if (n.techOff) links.push(`15% cheaper with research <b>${esc(DATA.techs[n.techOff].name)}</b>`);
    if (n.trad) links.push(`20% cheaper with the tradition <b>${esc(DATA.traditions[n.trad].name)}</b>`);
    if (n.school && !G.schoolAttuned(S, OWNER, n.school)) links.push('foreign school: +60% cost');
    const kids = G.arcanaChildren(id);
    return `<div class="mg-detail" style="--school:${schoolColor(n.school)}">
      <div class="row"><span class="mg-dico k-${n.kind}">${n.icon}</span><div><h3 style="margin:0">${esc(n.name)}</h3>
        <div class="muted" style="font-size:12px">${KIND[n.kind]} · ${C.icon} ${C.name} circle (Mage Tower ${C.tower}, ${DATA.techEras[C.era].name} era) · ${sc ? sc.icon + ' ' + esc(sc.name) : '📖 Foundations'}${n.innate ? ' · ★ known to all magi' : ''}</div></div>
        <span class="spacer"></span><button class="small" data-act="mgSel" data-id="" aria-label="Close details">✕</button></div>
      ${n.lore ? `<p class="mg-flavor">${esc(n.lore)}</p>` : ''}
      <p class="mg-fx"><b>Teaches:</b> ${esc(G.arcanaFxText(id))}</p>
      ${n.spells.map(k => `<p class="mg-fx muted">${DATA.spells[k].icon} <b>${esc(DATA.spells[k].name)}</b>: ${esc(DATA.spells[k].desc)} <span class="mg-meta">✨ ${DATA.spells[k].cost} · cooldown ${DATA.spells[k].cool} min · strain +${DATA.spells[k].strain}</span></p>`).join('')}
      ${n.excl ? `<p class="warn" style="font-size:12.5px">⑂ A fork: learning this forsakes <b>${esc(N(n.excl).name)}</b> forever.</p>` : ''}
      <div class="mg-rel"><span class="muted">Needs:</span> ${n.pre.length ? n.pre.map(g => g.map(chip).join(' <span class="muted">or</span> ')).join(' <span class="muted">and</span> ') : '<span class="muted">nothing</span>'}</div>
      <div class="mg-rel"><span class="muted">Opens:</span> ${kids.length ? kids.map(chip).join(' ') : '<span class="muted">nothing further</span>'}</div>
      ${links.length ? `<div class="mg-rel muted" style="font-size:12px">${links.join(' · ')}</div>` : ''}
      ${st.known || st.active ? '' : `<div class="mg-rel">${costLine(st.cost || {}, st.city || G.citiesOf(S, OWNER).sort((a, b) => G.lvl(b, 'magetower') - G.lvl(a, 'magetower'))[0])}</div>`}
      <div class="row mg-actions">${action}</div></div>`;
  };
  const listHtml = () => {
    const A = G.grimoire(S, OWNER);
    return DATA.circles.map((C, c) => `<div class="mg-listcircle"><h4>${C.icon} ${C.roman}. ${C.name} <span class="muted">Mage Tower ${C.tower} · ${DATA.techEras[C.era].name} era</span></h4>
      ${DATA.arcanaLanes.map(k => {
        const ids = DATA.arcanaOrder.filter(id => N(id).circle === c && (N(id).school || null) === k);
        if (!ids.length) return '';
        return `<div class="mg-lrow" style="--school:${schoolColor(k)}"><span class="mg-llane">${k ? DATA.schools[k].icon : '📖'}</span>${ids.map(id => `<button class="mg-lnode ${nodeState(id)} ${gm.sel === id ? 'sel' : ''}${A.queue.includes(id) ? ' queued' : ''}" data-act="mgSel" data-id="${id}" title="${esc(N(id).name)}">${N(id).icon} <span>${esc(N(id).name)}</span></button>`).join('')}</div>`;
      }).join('')}</div>`).join('');
  };
  const grimoireHtml = () => {
    const A = G.grimoire(S, OWNER);
    const total = DATA.arcanaOrder.length, known = A.known.length;
    return `<div class="card mg-grim">
      <div class="row"><h3 style="margin:0">📜 The Grimoire</h3><span class="muted" style="font-size:12.5px">${known} of ${total} learned</span><span class="spacer"></span>
        ${gm.list ? '' : `<button class="small" data-act="mgZoom" data-z="out" aria-label="Zoom out">−</button><button class="small" data-act="mgZoom" data-z="in" aria-label="Zoom in">+</button>`}
        <button class="small" data-act="mgList">${gm.list ? '🌳 Tree' : '☰ List'}</button></div>
      <p class="muted" style="font-size:12.5px;margin:4px 0 6px">One study at a time for the whole realm, paid in mana and gold from your best tower. Circles open with tower level and research era. Foreign schools cost 60% more. Cancelling refunds half. Shift-click a node to queue its whole path.</p>
      ${studyHtml()}
      ${gm.list ? `<div class="mg-list">${listHtml()}</div>` : '<div id="gmHost" class="gm-host"><div class="muted" style="padding:20px">Opening the Grimoire…</div></div>'}
      ${detailHtml()}
    </div>`;
  };

  // ---- schools: attuned, opened, routes ------------------------------------
  const schoolsHtml = () => {
    const att = G.attunedSchools(S, OWNER), cap = G.schoolCap(S, OWNER), nf = G.foreignOpen(S, OWNER).length;
    const rows = DATA.schoolOrder.map(k => {
      const sc = DATA.schools[k], god = DATA.gods && DATA.gods[sc.god];
      const A = G.grimoire(S, OWNER);
      const learned = DATA.arcanaOrder.filter(id => N(id).school === k && A.known.includes(id)).length;
      const totalK = DATA.arcanaOrder.filter(id => N(id).school === k).length;
      let right;
      if (att.includes(k)) right = `<span class="pill good">attuned · ${sc.race === S.empires[OWNER].race ? 'native' : 'faith'}</span>`;
      else if (A.opened.includes(k)) right = `<span class="pill">opened</span> <button class="small" data-act="mgClose" data-k="${k}" title="Its spells and enchantments go quiet; what you learned stays">Close</button>`;
      else {
        const st = G.openSchoolStatus(S, OWNER, k);
        right = `${st.fee ? costLine(st.fee) : ''} <button class="small ${st.ok ? 'primary' : ''}" data-act="mgOpen" data-k="${k}" ${st.ok ? '' : 'disabled'} title="${esc(st.reason || '')}">Open</button>`;
      }
      const routes = att.includes(k) ? [] : G.schoolRoutes(S, OWNER, k);
      return `<div class="mg-srow" style="--school:${sc.color}">
        <div class="mg-sname">${sc.icon} <b>${esc(sc.name)}</b> <span class="muted" style="font-size:12px">${god ? god.icon + ' ' + esc(god.short || god.name) : ''} · ${learned}/${totalK}</span></div>
        <div class="mg-sroutes">${att.includes(k) ? '' : routes.length ? routes.map(r => `<span class="mg-route r-${r.kind}">${r.kind === 'ley' ? '🌐' : r.kind === 'treaty' ? '📜' : '🏰'} ${esc(r.text)}</span>`).join('') : '<span class="muted" style="font-size:12px">No route yet</span>'}</div>
        <div class="mg-sright">${right}</div></div>`;
    }).join('');
    return `<div class="card mg-schoolcard"><h3>🏛️ Schools <span class="muted" style="font-size:13px">${nf} of ${cap} foreign schools open</span></h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">Your people's school and your faith's patron school are attuned. To open another you need a route: 🌐 hold a ley enclave of that school, 📜 a research pact or alliance with a realm that knows it, or 🏰 a city with a Mage Tower raised by that school. Arcane Colleges (research) and The Archmagi (tradition) each allow one more.</p>${rows}</div>`;
  };

  // ---- spellbook ----------------------------------------------------------
  const spellCard = (id, from, metas) => {
    const sp = DATA.spells[id];
    const st = G.spellStatus(S, OWNER, from.id, id);
    if (st.hidden) return '';
    const color = sp.school ? DATA.schools[sp.school].color : sp.shape ? '#7b6a3a' : ARCANE;
    const fit = G.castMetas(S, OWNER, id, metas);
    const cost = Math.round(st.cost * G.metaMults(fit).cost);
    let picker = '', canTarget = true;
    if (sp.target === 'city' || sp.target === 'enemy') {
      const opts = targetsFor(sp, from);
      const cur = chosenTarget(id, opts, sp.target === 'city' ? from.id : null);
      if (opts.length) picker = `<select data-k="mg_t_${id}" aria-label="Target of ${esc(sp.name)}">${opts.map(o => `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      else { canTarget = false; picker = `<span class="muted" style="font-size:12px">No known foreign city within 14 tiles of ${esc(from.name)}.</span>`; }
    } else if (sp.target === 'realm') picker = '<span class="muted" style="font-size:12px">Whole realm</span>';
    else picker = `<span class="muted" style="font-size:12px">${sp.shape ? `Within ${(G.cityReach(S, from) + 3).toFixed(1)} tiles` : sp.range ? `Within ${sp.range} tiles` : 'Any place'}</span>`;
    const ok = st.ok && canTarget && G.manaOf(S, OWNER) >= cost;
    const btn = sp.target === 'tile'
      ? `<button class="${ok ? 'primary' : ''}" data-act="mgCast" data-id="${id}" ${ok ? '' : 'disabled'}>🗺️ Pick on the map</button>`
      : `<button class="${ok ? 'primary' : ''}" data-act="mgCast" data-id="${id}" ${ok ? '' : 'disabled'}>Cast</button>`;
    const star = sp.school && G.conjunction(S).active && G.conjunction(S).active.school === sp.school;
    return `<div class="card mg-spell ${st.locked ? 'locked' : ''} ${star ? 'starlit' : ''}" style="--school:${color}">
      <div class="head"><span class="ico">${sp.icon}</span>
        <div><b>${esc(sp.name)}</b> ${masteryPips(id)}<div class="muted" style="font-size:11.5px">Tower ${sp.tier} · ${{ city: 'your city', enemy: 'foreign city', realm: 'realm', tile: 'a place' }[sp.target]} · strain +${sp.strain} · ${sp.cool} min${fit.length ? ' · ' + fit.map(k => DATA.metamagic[k].icon).join('') : ''}</div></div>
        ${manaCost(cost)}</div>
      <div class="desc">${esc(sp.desc)}</div>
      <div class="row mg-cast">${picker}<span class="spacer"></span>${btn}</div>
      ${!st.ok ? `<div class="${st.poor ? 'muted' : 'warn'}" style="font-size:12px">${esc(st.reason)}</div>` : ''}
    </div>`;
  };
  const spellbookHtml = () => {
    const from = castCity();
    const spells = G.spellsOf(S, OWNER);
    const metas = metaPrepared();
    const known = G.metaKnown(S, OWNER);
    const groups = [];
    for (const k of G.schoolsOf(S, OWNER)) groups.push({ title: `${DATA.schools[k].icon} ${DATA.schools[k].name}`, color: DATA.schools[k].color, ids: spells.filter(id => DATA.spells[id].school === k) });
    groups.push({ title: '📖 Foundations', color: ARCANE, ids: spells.filter(id => !DATA.spells[id].school && !DATA.spells[id].shape) });
    groups.push({ title: '🌍 Rites of the Land', color: '#7b6a3a', ids: spells.filter(id => !DATA.spells[id].school && DATA.spells[id].shape), note: 'Mage Tower 15. Reshape the land near the casting city.' });
    const cities = G.citiesOf(S, OWNER);
    return `<div class="card"><div class="row"><h3 style="margin:0">✨ Spellbook</h3><span class="muted" style="font-size:12.5px">${spells.length} spells learned</span><span class="spacer"></span>
        <label class="muted mg-from">Casting city <select data-k="mg_city">${cities.map(c => `<option value="${c.id}" ${c.id === from.id ? 'selected' : ''}>${esc(c.name)} · tower ${G.lvl(c, 'magetower') || '—'}</option>`).join('')}</select></label></div>
      ${known.length ? `<div class="row mg-metas"><span class="muted" style="font-size:12.5px">Metamagic:</span>${known.map(k => `<button class="small mg-metabtn ${metas.includes(k) ? 'on' : ''}" data-act="mgMeta" data-k="${k}" aria-pressed="${metas.includes(k)}" title="${esc(DATA.metamagic[k].desc)}">${DATA.metamagic[k].icon} ${DATA.metamagic[k].name}</button>`).join('')}</div>` : ''}
      <p class="muted" style="font-size:12.5px;margin:6px 0 4px">A spell needs its tower level in the casting city. Recasting within an hour costs 20% more. Casting earns mastery (●●●).</p>
      ${groups.filter(g => g.ids.length).map(g => `<div class="mg-group" style="--school:${g.color}"><div class="group-title">${g.title}${g.note ? ` <span class="mg-note">· ${g.note}</span>` : ''}</div>
        <div class="grid">${g.ids.map(id => spellCard(id, from, metas)).join('')}</div></div>`).join('')}
    </div>`;
  };

  // ---- enchantments per city ------------------------------------------------
  const enchantHtml = () => {
    const known = G.enchantmentsKnown(S, OWNER);
    const cities = G.citiesOf(S, OWNER).filter(c => G.lvl(c, 'magetower') > 0 || (c.ench || []).length);
    const rows = cities.map(c => {
      const slots = G.enchantSlots(S, c), list = G.enchantmentsOf(S, c);
      const parts = G.enchantUpkeepParts(S, c);
      const free = known.filter(k => !G.hasEnchantment(c, k));
      const pick = UI.form['mg_e_' + c.id] && free.includes(UI.form['mg_e_' + c.id]) ? UI.form['mg_e_' + c.id] : free[0];
      const st = pick ? G.enchantStatus(S, OWNER, c.id, pick) : null;
      return `<div class="mg-erow"><div class="mg-ecity"><b>${esc(c.name)}</b> <span class="muted" style="font-size:12px">${list.length}/${slots} slots · ${fmtRate(G.econ(S, c).net.mana || 0)} mana/min</span></div>
        <div class="mg-elist">${list.map((e, i) => `<span class="mg-ench" style="--school:${e.color}" title="${esc(DATA.enchantments[e.id].desc)}">${e.icon} ${esc(e.name)} <span class="muted">−${(parts[i] ? parts[i].amount : 0).toFixed(1)}/min</span><button class="small" data-act="mgDispel" data-c="${c.id}" data-id="${e.id}" aria-label="Dispel ${esc(e.name)}">✕</button></span>`).join('') || '<span class="muted" style="font-size:12px">none</span>'}</div>
        ${free.length && list.length < slots ? `<div class="row mg-eadd"><select data-k="mg_e_${c.id}" aria-label="Enchantment for ${esc(c.name)}">${free.map(k => `<option value="${k}" ${k === pick ? 'selected' : ''}>${DATA.enchantments[k].icon} ${esc(DATA.enchantments[k].name)} (−${DATA.enchantments[k].upkeep}/min)</option>`).join('')}</select>
          <button class="small ${st && st.ok ? 'primary' : ''}" data-act="mgEnchant" data-c="${c.id}" ${st && st.ok ? '' : 'disabled'} title="${esc(st ? st.reason || DATA.enchantments[pick].desc : '')}">Enchant · ✨ ${st ? st.cost.mana : 0}</button></div>` : ''}</div>`;
    }).join('');
    return `<div class="card mg-enchcard"><h3>💠 Enchantments</h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">Lasting magic bound to a city until dispelled. Each costs mana every minute (shown in the city's mana breakdown). Slots: 1 per Mage Tower, +1 every 5 levels. Rival spells (Unravel) and spies (Siphon Mana) can break them; with no mana left they fade.</p>
      ${known.length ? '' : '<p class="muted" style="font-size:12.5px">Learn an enchantment in the Grimoire (hexagon nodes) to bind one.</p>'}
      ${rows || '<p class="muted">No city has a Mage Tower yet.</p>'}</div>`;
  };

  // ---- strain -------------------------------------------------------------
  const strainHtml = () => {
    const rows = G.citiesOf(S, OWNER).map(c => {
      const v = strainOf(c.id), ward = G.isWarded(S, c);
      return `<div class="mg-row"><b class="mg-cname">${esc(c.name)}</b>${strainBar(v)}
        <span class="muted" style="font-size:12px">${ward ? '🛡️ warded' : v > 0 ? `clear in ${fmtTime(realSecs(v / 2 * 60))}` : 'calm'}</span>
        ${v > STRAIN_WARN && !ward ? '<span class="bad" style="font-size:12px">Wild magic may lash back: rifts, tempests or surges.</span>' : ''}</div>`;
    }).join('');
    return `<div class="card"><h3>🌀 Weave strain</h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">Every spell strains the weave around its casting city. Strain fades by 2 per minute. Above ${STRAIN_WARN}, wild magic may open demon rifts, call tempests or burn away mana. A 🛡️ Ward of Weaving or an Aegis enchantment holds it back.</p>${rows}</div>`;
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
        const col = tap ? S.empires[tap.owner].color : ARCANE, sc = DATA.schools[G.leySchool(n)];
        return `<div class="mg-row mg-node"><span class="mg-rune" style="--rune:${col}">${'◆'.repeat(n.power)}</span>
          <b>Enclave ×${n.power}</b><span class="mg-school" style="--school:${sc.color}">${sc.icon} ${esc(sc.name)}</span><span class="muted" style="font-size:12px">(${n.x}, ${n.y})</span>
          <span style="font-size:12.5px">${tap ? `tapped by <b style="color:${col}">${esc(tap.name)}</b>${tap.owner === OWNER ? '' : ` <span class="muted">(${esc(S.empires[tap.owner].name)})</span>`}` : '<span class="muted">untapped</span>'}</span>
          <span class="spacer"></span><button class="small" data-act="mgShow" data-x="${n.x}" data-y="${n.y}">Show on map</button></div>`;
      }).join('');
    const mineP = G.citiesOf(S, OWNER).map(c => [c, G.leyPower(S, c)]).filter(([, p]) => p > 0);
    return `<div class="card"><h3>🌐 Ley network <span class="muted" style="font-size:13px">you hold ${held} of ${nodes.length} enclaves</span></h3>
      <p class="muted" style="font-size:12.5px;margin-top:0">A city taps every enclave within its reach that no nearer city claims: more mana, a stronger tower. Each enclave is attuned to a school: holding one opens a route to that school.</p>
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

  // ---- sections ------------------------------------------------------------
  const SECTS = [['grimoire', '📜 Grimoire'], ['spells', '✨ Spellbook'], ['schools', '🏛️ Schools'], ['ench', '💠 Enchantments'], ['weave', '🌐 Weave & Working']];
  const renderMagic = () => {
    // until the first spell is cast (the guide's step), open on the spellbook; then on the Grimoire
    const sect = SECTS.some(s => s[0] === gm.sect) ? gm.sect : (S.stats.spells || 0) === 0 && G.towerLevel(S, OWNER) > 0 ? 'spells' : 'grimoire';
    const tabs = `<div class="mg-sects" role="tablist">${SECTS.map(([k, l]) => `<button class="small ${k === sect ? 'on' : ''}" role="tab" aria-selected="${k === sect}" data-act="mgSect" data-k="${k}">${l}</button>`).join('')}</div>`;
    const body = sect === 'grimoire' ? grimoireHtml() : sect === 'spells' ? spellbookHtml() : sect === 'schools' ? schoolsHtml() : sect === 'ench' ? enchantHtml() : strainHtml() + leyHtml() + workingHtml();
    return headerHtml() + tabs + body;
  };

  // ---- city header chip ----------------------------------------------------
  CITY_EXTRAS.push(city => {
    if (!S || !city) return '';
    const e = G.econ(S, city);
    const lp = G.leyPower(S, city);
    const v = strainOf(city.id);
    const en = G.enchantmentsOf(S, city);
    return `<div class="row mg-chiprow"><button class="mg-chip" data-act="tab" data-t="magic" title="Mana made in ${esc(city.name)} per minute${lp > 0 ? '; this city taps a ley enclave' : ''}">✨ <b>${fmtRate(e.net.mana || 0)}</b>/min${lp > 0 ? `<span class="mg-ley">ley enclave ×${lp}</span>` : ''}${en.length ? `<span class="mg-ley" title="${esc(en.map(x => x.name).join(', '))}">${en.map(x => x.icon).join('')}</span>` : ''}</button>
      ${v > STRAIN_WARN && !G.isWarded(S, city) ? `<span class="bad" style="font-size:12.5px">🌀 Weave strain ${Math.round(v)}: wild magic may lash back</span>` : ''}</div>`;
  });

  // ---- tab placement: after Faith, else after Culture ------------------------
  {
    const entries = Object.entries(TABS).filter(([k]) => k !== 'magic');
    for (const [k] of entries) delete TABS[k];
    const tab = {
      label: '🔮 Magic', render: () => renderMagic(),
      badge: () => (S ? G.citiesOf(S, OWNER).filter(c => strainOf(c.id) > STRAIN_WARN && !G.isWarded(S, c)).length : 0),
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
      const metas = metaPrepared();
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
      const err = G.castSpell(S, OWNER, from.id, d.id, target, metas);
      toast(err || `${sp.icon} ${sp.name} cast${target && S.cities[target] ? ' on ' + S.cities[target].name : ''}`);
      render(true);
    },
    mgWork: () => { const err = G.beginWorkingStage(S, OWNER); toast(err || '🌌 The Great Working begins a new stage'); render(true); },
    mgShow: d => { UI.tab = 'world'; UI.sel = { x: +d.x, y: +d.y }; window.scrollTo(0, 0); render(true); },
    mgSect: d => { gm.sect = d.k; render(true); },
    mgSel: d => { gm.sel = d.id || null; render(true); },
    mgStudy: d => { const err = G.startStudy(S, OWNER, d.id); toast(err || `📖 Your magi begin ${N(d.id).name}`); render(true); },
    mgQueue: d => { toast(G.queueStudy(S, OWNER, d.id) || `${N(d.id).name} added to the study queue`); render(true); },
    mgPlan: d => { toast(G.planStudy(S, OWNER, d.id) || `${N(d.id).name} and its path added to the study queue`); render(true); },
    mgUnqueue: d => { G.unqueueStudy(S, OWNER, d.id); render(true); },
    mgMove: d => { const e = G.moveStudy(S, OWNER, d.id, +d.d); if (e) toast(e); render(true); },
    mgCancel: () => { G.cancelStudy(S, OWNER); toast('Study cancelled: half the cost refunded'); render(true); },
    mgOpen: d => { toast(G.openSchool(S, OWNER, d.k) || `${DATA.schools[d.k].icon} ${DATA.schools[d.k].name} is open to your magi`); render(true); },
    mgClose: d => { if (!confirm(`Close the school of ${DATA.schools[d.k].name}? Its spells and enchantments go quiet until you open it again (and pay again).`)) return; toast(G.closeSchool(S, OWNER, d.k) || 'School closed'); render(true); },
    mgEnchant: d => { const c = S.cities[d.c]; const k = UI.form['mg_e_' + d.c] || G.enchantmentsKnown(S, OWNER).find(x => !G.hasEnchantment(c, x)); toast(G.enchantCity(S, OWNER, d.c, k) || `${DATA.enchantments[k].icon} ${c.name} is enchanted`); render(true); },
    mgDispel: d => { G.dispelEnchantment(S, d.c, d.id, null); toast('Enchantment released'); render(true); },
    mgMeta: d => { const cur = metaPrepared(); UI.form.mg_meta = (cur.includes(d.k) ? cur.filter(k => k !== d.k) : [...cur, d.k]).join(','); render(true); },
    mgList: () => { gm.list = !gm.list; render(true); },
    mgZoom: d => { const f = d.z === 'in' ? 1.2 : 1 / 1.2, z0 = gm.z; gm.z = Math.max(0.5, Math.min(1.5, gm.z * f)); applyZoom(); if (view) { view.root.scrollLeft = gm.sx = (gm.sx || 0) * gm.z / z0; view.root.scrollTop = gm.sy = (gm.sy || 0) * gm.z / z0; } },
  });

  // selects re-render at once (ui-core only does this on the World tab)
  document.addEventListener('change', ev => {
    const k = ev.target.dataset && ev.target.dataset.k;
    if (!k || !k.startsWith('mg_') || UI.tab !== 'magic') return;
    UI.form[k] = ev.target.value;
    ev.target.blur(); render(true);
  });
  window.ECGRIM = { get view() { return view; }, get layout() { return L; } };
})();
