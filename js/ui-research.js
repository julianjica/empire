// =====================================================================
//  The visual technology tree — replaces the Research tab.
//
//  One big SVG: eras flow left → right as column bands, each drawn in the
//  materials of its age (Founding: rough wood and charcoal on raw parchment;
//  Kingdom: bronze and ink; Empire: steel and fine engraving; Legend: gold
//  and glowing arcana), branches run as horizontal lanes. The static picture
//  is built once per people and kept alive across the once-a-second rebuild
//  through MOUNT_HOOKS (like the world map); only state classes, progress
//  rings and badges change. Pan/zoom lives in UI.tt and survives re-renders.
//  Phones: touch pan / pinch, plus a list view.
// =====================================================================
'use strict';

(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const COL_W = 184, X0 = 196, HEAD_H = 78, ROW_H = 100, LANE_PAD = 14, NODE_R = 27;
  const ERA_CLS = ['e0', 'e1', 'e2', 'e3'];
  const ERA_MAT = ['Rough wood & charcoal', 'Bronze & ink', 'Steel & engraving', 'Gold & arcana'];
  const ZMIN = 0.28, ZMAX = 1.8;
  UI.tt = UI.tt || { x: 0, y: 0, z: 0.8, init: false, sel: null, branch: '', search: '', list: null };
  const tt = UI.tt;

  const colX = c => X0 + c * COL_W + COL_W / 2;
  const T = id => DATA.techs[id];
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const wrapName = name => {
    const words = name.split(' ');
    const lines = [''];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if (cur && (cur + ' ' + w).length > 15 && lines.length < 2) lines.push(w);
      else lines[lines.length - 1] = cur ? cur + ' ' + w : w;
    }
    return lines;
  };
  const isPhone = () => window.matchMedia && matchMedia('(max-width: 700px)').matches;
  const listMode = () => tt.list === null ? false : tt.list;

  // -------------------------------------------------------------------
  // layout (per people: their own heritage techs join the lanes)
  // -------------------------------------------------------------------
  let L = null;
  const layoutFor = race => {
    const ids = Object.keys(DATA.techs).filter(id => !T(id).race || T(id).race === race);
    const lanes = [];
    let y = HEAD_H;
    for (const b of DATA.techBranchOrder) {
      const mine = ids.filter(id => T(id).branch === b);
      const byCol = {};
      for (const id of mine) (byCol[T(id).col] = byCol[T(id).col] || []).push(id);
      for (const c in byCol) byCol[c].sort((a, z) => (T(a).race ? 1 : 0) - (T(z).race ? 1 : 0) || mine.indexOf(a) - mine.indexOf(z));
      const rows = Math.max(1, ...Object.values(byCol).map(l => l.length));
      const h = rows * ROW_H + LANE_PAD * 2;
      lanes.push({ b, y, h, byCol, rows });
      y += h;
    }
    const pos = {};
    for (const ln of lanes) for (const [c, list] of Object.entries(ln.byCol)) list.forEach((id, i) => {
      pos[id] = { x: colX(+c), y: ln.y + ln.h / 2 + (i - (list.length - 1) / 2) * ROW_H - 8 };
    });
    return { race, ids, lanes, pos, W: X0 + 12 * COL_W + 40, H: y + 30 };
  };

  // -------------------------------------------------------------------
  // static picture
  // -------------------------------------------------------------------
  let view = null;      // { root, svg, cam, laneG, eraG, nodes: {id: {g, ring, ...}}, links: [], key, tip, mini }
  const defs = svg => {
    const d = el('defs', {}, svg);
    d.innerHTML = `
      <filter id="ttRough" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter>
      <filter id="ttGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="ttSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>
      <pattern id="ttWood" width="160" height="46" patternUnits="userSpaceOnUse">
        <rect width="160" height="46" fill="#e8dbbd"/>
        <path d="M0 9 C40 5 70 14 110 8 S150 10 160 9" stroke="#bfa274" stroke-width="1" fill="none" opacity=".55"/>
        <path d="M0 23 C30 27 60 19 95 24 S140 21 160 23" stroke="#b0915f" stroke-width=".8" fill="none" opacity=".45"/>
        <path d="M0 37 C45 33 80 41 120 36 S150 38 160 37" stroke="#c2a77a" stroke-width="1.2" fill="none" opacity=".4"/>
        <ellipse cx="118" cy="24" rx="7" ry="3" stroke="#a8875a" fill="none" opacity=".35"/>
      </pattern>
      <pattern id="ttInk" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#e4cf9f"/>
        <path d="M0 12 L12 0" stroke="#5b4426" stroke-width=".5" opacity=".14"/>
        <path d="M-3 3 L3 -3 M9 15 L15 9" stroke="#5b4426" stroke-width=".5" opacity=".14"/>
      </pattern>
      <pattern id="ttSteel" width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="#cfd7de"/>
        <path d="M0 6 L6 0" stroke="#6f7f8f" stroke-width=".45" opacity=".35"/>
        <path d="M0 0 L6 6" stroke="#ffffff" stroke-width=".35" opacity=".25"/>
      </pattern>
      <radialGradient id="ttNight" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#3a2a6e"/><stop offset=".6" stop-color="#22184a"/><stop offset="1" stop-color="#140f2e"/></radialGradient>
      <pattern id="ttStars" width="90" height="90" patternUnits="userSpaceOnUse">
        <circle cx="12" cy="18" r="1" fill="#fff3c4" opacity=".8"/><circle cx="57" cy="9" r=".7" fill="#fff" opacity=".6"/>
        <circle cx="74" cy="51" r="1.2" fill="#ffe7a0" opacity=".7"/><circle cx="31" cy="66" r=".6" fill="#fff" opacity=".7"/>
        <circle cx="83" cy="83" r=".8" fill="#d9c8ff" opacity=".7"/><circle cx="46" cy="38" r=".5" fill="#fff" opacity=".5"/>
      </pattern>
      <linearGradient id="ttBronze" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1c27a"/><stop offset=".45" stop-color="#b8792f"/><stop offset="1" stop-color="#6e4317"/></linearGradient>
      <linearGradient id="ttSteelG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7fafc"/><stop offset=".4" stop-color="#9eabb8"/><stop offset=".7" stop-color="#d9e1e8"/><stop offset="1" stop-color="#5d6b78"/></linearGradient>
      <linearGradient id="ttGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".35" stop-color="#f0c040"/><stop offset=".7" stop-color="#b8861b"/><stop offset="1" stop-color="#ffe17a"/></linearGradient>
      <radialGradient id="ttFace0" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f6ecd2"/><stop offset="1" stop-color="#d8c6a0"/></radialGradient>
      <radialGradient id="ttFace1" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fbf0d6"/><stop offset="1" stop-color="#e2c590"/></radialGradient>
      <radialGradient id="ttFace2" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c5d0da"/></radialGradient>
      <radialGradient id="ttFace3" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#4b3a8a"/><stop offset="1" stop-color="#1e1640"/></radialGradient>
      <linearGradient id="ttFade01" x1="0" x2="1"><stop offset="0" stop-color="#e8dbbd" stop-opacity="0"/><stop offset="1" stop-color="#e4cf9f" stop-opacity="1"/></linearGradient>
      <linearGradient id="ttFade12" x1="0" x2="1"><stop offset="0" stop-color="#e4cf9f" stop-opacity="0"/><stop offset="1" stop-color="#cfd7de" stop-opacity="1"/></linearGradient>
      <linearGradient id="ttFade23" x1="0" x2="1"><stop offset="0" stop-color="#cfd7de" stop-opacity="0"/><stop offset="1" stop-color="#22184a" stop-opacity="1"/></linearGradient>`;
  };
  const ERA_FILL = ['url(#ttWood)', 'url(#ttInk)', 'url(#ttSteel)', 'url(#ttNight)'];
  const FRAME_FILL = ['#6b4a2b', 'url(#ttBronze)', 'url(#ttSteelG)', 'url(#ttGold)'];

  const linkPath = (a, b) => {
    const x1 = a.x + NODE_R + 2, y1 = a.y, x2 = b.x - NODE_R - 4, y2 = b.y;
    const dx = Math.max(40, (x2 - x1) * 0.5);
    return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
  };

  const build = race => {
    L = layoutFor(race);
    const root = document.createElement('div');
    root.className = 'tt-view';
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'Technology tree. Drag to pan, scroll or pinch to zoom, click a technology for details.');
    const svg = el('svg', { class: 'tt-svg', width: '100%', height: '100%' }, root);
    defs(svg);
    const cam = el('g', { class: 'tt-cam' }, svg);
    // era bands
    for (let e = 0; e < 4; e++) {
      const x = X0 + e * 3 * COL_W, w = 3 * COL_W;
      el('rect', { x, y: 0, width: w + (e === 3 ? 40 : 0), height: L.H, fill: ERA_FILL[e], class: 'tt-band ' + ERA_CLS[e] }, cam);
      if (e === 3) el('rect', { x, y: 0, width: w + 40, height: L.H, fill: 'url(#ttStars)', class: 'tt-stars' }, cam);
      if (e === 1) for (let i = 0; i < 6; i++) el('path', { d: `M${x + 30 + i * 90} 0 V${L.H}`, stroke: '#5b4426', 'stroke-width': .4, opacity: .12, 'stroke-dasharray': '1 5' }, cam);
      if (e === 2) for (let i = 1; i < 3; i++) el('path', { d: `M${x + i * COL_W} 0 V${L.H}`, stroke: '#5d6b78', 'stroke-width': .6, opacity: .35 }, cam);
      if (e > 0) el('rect', { x: x - 46, y: 0, width: 46, height: L.H, fill: `url(#ttFade${e - 1}${e})` }, cam);
    }
    // charcoal smudges on the parchment, glows in the night
    for (let i = 0; i < 9; i++) el('ellipse', { cx: X0 + 40 + (i * 61) % (3 * COL_W - 60), cy: 120 + (i * 173) % (L.H - 160), rx: 40 + (i * 13) % 50, ry: 14 + (i * 7) % 16, fill: '#3a2a18', opacity: .045, filter: 'url(#ttSoft)' }, cam);
    for (let i = 0; i < 7; i++) el('circle', { cx: X0 + 9 * COL_W + 50 + (i * 97) % (3 * COL_W - 40), cy: 140 + (i * 211) % (L.H - 180), r: 50 + (i * 17) % 40, fill: i % 2 ? '#9a6cff' : '#ffcf5a', opacity: .07, filter: 'url(#ttGlow)' }, cam);
    // lane separators
    L.lanes.forEach((ln, i) => {
      el('rect', { x: X0, y: ln.y, width: 12 * COL_W + 40, height: ln.h, fill: i % 2 ? '#000' : '#fff', opacity: i % 2 ? .035 : .05, class: 'tt-lane' }, cam);
      el('path', { d: `M${X0} ${ln.y} H${X0 + 12 * COL_W + 40}`, class: 'tt-lanerule' }, cam);
    });
    // links
    const linkG = el('g', { class: 'tt-links' }, cam);
    const links = [];
    for (const id of L.ids) for (const r of T(id).reqs) {
      if (!L.pos[r]) continue;
      const p = el('path', { d: linkPath(L.pos[r], L.pos[id]), class: 'tt-link ' + ERA_CLS[T(id).era] }, linkG);
      links.push({ from: r, to: id, p, cls: '' });
    }
    // nodes
    const nodeG = el('g', { class: 'tt-nodes' }, cam);
    const nodes = {};
    for (const id of L.ids) {
      const t = T(id), p = L.pos[id], e = t.era;
      const g = el('g', { class: 'tt-node ' + ERA_CLS[e], transform: `translate(${p.x} ${p.y})`, 'data-id': id, tabindex: 0, role: 'button', 'aria-label': t.name }, nodeG);
      el('circle', { r: NODE_R + 9, class: 'tt-halo' }, g);
      el('circle', { r: NODE_R + 4.5, class: 'tt-track' }, g);
      const ring = el('circle', { r: NODE_R + 4.5, class: 'tt-ring', transform: 'rotate(-90)', 'stroke-dasharray': `0 ${2 * Math.PI * (NODE_R + 4.5)}` }, g);
      const frame = el('circle', { r: NODE_R, class: 'tt-frame', fill: FRAME_FILL[e] }, g);
      if (e === 0) frame.setAttribute('filter', 'url(#ttRough)');
      if (e === 2) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; el('circle', { cx: Math.cos(a) * (NODE_R - 2.6), cy: Math.sin(a) * (NODE_R - 2.6), r: 1.3, class: 'tt-rivet' }, g); }
      if (e === 3) for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; el('path', { d: `M${Math.cos(a) * (NODE_R + 1)} ${Math.sin(a) * (NODE_R + 1)} L${Math.cos(a) * (NODE_R + 5)} ${Math.sin(a) * (NODE_R + 5)}`, class: 'tt-ray' }, g); }
      el('circle', { r: NODE_R - 5, class: 'tt-face', fill: `url(#ttFace${e})` }, g);
      if (e === 1) el('circle', { r: NODE_R - 7.5, class: 'tt-inkring' }, g);
      const ico = el('text', { class: 'tt-ico', y: 7, 'text-anchor': 'middle' }, g); ico.textContent = t.icon;
      const lines = wrapName(t.name);
      lines.forEach((ln, i) => { const tx = el('text', { class: 'tt-name', y: NODE_R + 16 + i * 13, 'text-anchor': 'middle' }, g); tx.textContent = ln; });
      if (t.race) {
        const rb = el('g', { class: 'tt-race', transform: `translate(${-NODE_R + 2} ${-NODE_R + 2})` }, g);
        el('circle', { r: 8, fill: DATA.races[t.race].color }, rb);
        const tx = el('text', { y: 3.5, 'text-anchor': 'middle' }, rb); tx.textContent = '★';
      }
      const qb = el('g', { class: 'tt-q', transform: `translate(${NODE_R - 2} ${-NODE_R + 2})` }, g);
      el('circle', { r: 8.5 }, qb);
      const qt = el('text', { y: 4, 'text-anchor': 'middle' }, qb);
      const lock = el('text', { class: 'tt-lock', x: NODE_R - 3, y: NODE_R - 1, 'text-anchor': 'middle' }, g); lock.textContent = '🔒';
      const star = el('text', { class: 'tt-recstar', x: -NODE_R + 3, y: NODE_R - 1, 'text-anchor': 'middle' }, g); star.textContent = '✦';
      let lvt = null;
      if (t.repeat) {
        // mastery techs: a dashed outer ring with a ↻ mark, and a level plate on top
        el('circle', { r: NODE_R + 12.5, class: 'tt-repring' }, g);
        const rp = el('text', { class: 'tt-repico', x: -NODE_R + 1, y: -NODE_R + 7, 'text-anchor': 'middle' }, g); rp.textContent = '↻';
        const lb = el('g', { class: 'tt-lvbadge', transform: `translate(0 ${-NODE_R - 9})` }, g);
        el('rect', { x: -23, y: -9, width: 46, height: 15, rx: 7 }, lb);
        lvt = el('text', { y: 2.5, 'text-anchor': 'middle' }, lb); lvt.textContent = 'Lv 0';
      }
      nodes[id] = { g, ring, qt, lvt, lv: '', cls: '', q: '', pct: -1 };
    }
    // sticky lane labels (move with vertical pan only) and era headers (horizontal only)
    const laneG = el('g', { class: 'tt-lanelabels' }, svg);
    const laneBack = el('rect', { x: 0, y: 0, width: X0 - 8, height: L.H, class: 'tt-laneback' }, laneG);
    L.lanes.forEach(ln => {
      const br = DATA.techBranches[ln.b];
      const g = el('g', { transform: `translate(12 ${ln.y + ln.h / 2})`, class: 'tt-lanelabel', 'data-branch': ln.b }, laneG);
      el('path', { d: `M-12 ${-ln.h / 2} H${X0 - 8}`, class: 'tt-lanerule' }, g);
      const i = el('text', { class: 'tt-laneico', x: 14, y: 8, 'text-anchor': 'middle' }, g); i.textContent = br.icon;
      const words = br.name.split(' & ');
      words.forEach((w, k) => { const tx = el('text', { class: 'tt-lanename', x: 34, y: (k - (words.length - 1) / 2) * 15 + 5 }, g); tx.textContent = (k ? '& ' : '') + w; });
    });
    const eraG = el('g', { class: 'tt-erahead' }, svg);
    for (let e = 0; e < 4; e++) {
      const x = X0 + e * 3 * COL_W, w = 3 * COL_W;
      const g = el('g', { class: 'tt-era ' + ERA_CLS[e] }, eraG);
      el('rect', { x, y: 0, width: w + (e === 3 ? 40 : 0), height: HEAD_H - 8, class: 'tt-erabar', fill: ERA_FILL[e] }, g);
      const n = el('text', { x: x + w / 2, y: 30, 'text-anchor': 'middle', class: 'tt-eraname' }, g); n.textContent = `${DATA.techEras[e].icon} ${DATA.techEras[e].name} Era`;
      const m = el('text', { x: x + w / 2, y: 50, 'text-anchor': 'middle', class: 'tt-eramat' }, g); m.textContent = ERA_MAT[e];
      for (let t = 0; t < 3; t++) { const tx = el('text', { x: x + t * COL_W + COL_W / 2, y: 66, 'text-anchor': 'middle', class: 'tt-tier' }, g); tx.textContent = `tier ${t + 1} · Academy ${DATA.techAcademy[e * 3 + t]}`; }
      el('path', { d: `M${x} ${HEAD_H - 8} H${x + w + (e === 3 ? 40 : 0)}`, class: 'tt-eraedge' }, g);
    }
    const corner = el('rect', { x: 0, y: 0, width: X0 - 8, height: HEAD_H - 8, class: 'tt-corner' }, svg);
    const ct = el('text', { x: (X0 - 8) / 2, y: 42, 'text-anchor': 'middle', class: 'tt-cornertext' }, svg); ct.textContent = '📚 Tree of Knowledge';
    // tooltip and minimap
    const tip = document.createElement('div'); tip.className = 'tt-tip'; tip.hidden = true; root.appendChild(tip);
    const mini = document.createElement('canvas'); mini.className = 'tt-mini'; mini.width = 200; mini.height = 70; mini.title = 'Overview: click to jump'; root.appendChild(mini);
    view = { root, svg, cam, laneG, laneBack, eraG, corner, ct, nodes, links, key: race + '|' + L.ids.length, tip, mini, linkG, narrow: false };
    attachInput();
  };

  // -------------------------------------------------------------------
  // camera
  // -------------------------------------------------------------------
  const size = () => { const r = view.root.getBoundingClientRect(); return { w: r.width || 800, h: r.height || 500 }; };
  const clampCam = () => {
    const { w, h } = size();
    tt.z = Math.max(ZMIN, Math.min(ZMAX, tt.z));
    // a picture smaller than the window sits in its middle; a larger one can't be dragged off-screen
    // phones: lane labels shrink to icons, and the empty margin under them may slide out of view
    const narrow = w < 520;
    if (narrow !== view.narrow) {
      view.narrow = narrow;
      view.root.classList.toggle('tt-narrow', narrow);
      view.laneBack.setAttribute('width', narrow ? 44 : X0 - 8);
      view.corner.setAttribute('width', narrow ? 44 : X0 - 8);
    }
    const fw = L.W * tt.z, fh = L.H * tt.z, maxX = narrow ? -(X0 - 52) * tt.z : 0;
    tt.x = fw + maxX <= w ? (w - fw) / 2 : Math.max(w - fw, Math.min(maxX, tt.x));
    tt.y = fh <= h ? 0 : Math.max(h - fh, Math.min(0, tt.y));
  };
  const applyCam = () => {
    if (!view) return;
    clampCam();
    view.cam.setAttribute('transform', `translate(${tt.x} ${tt.y}) scale(${tt.z})`);
    const lx = Math.max(0, tt.x + (view.narrow ? (X0 - 52) * tt.z : 0));
    view.laneG.setAttribute('transform', `translate(${lx} ${tt.y}) scale(${tt.z})`);
    view.eraG.setAttribute('transform', `translate(${tt.x} 0) scale(${tt.z})`);
    view.corner.setAttribute('transform', `translate(${lx} 0) scale(${tt.z})`);
    view.ct.setAttribute('transform', `translate(${lx} 0) scale(${tt.z})`);
    view.root.classList.toggle('tt-far', tt.z < 0.5);
    drawMini();
  };
  const zoomAt = (f, cx, cy) => {
    const z0 = tt.z, z1 = Math.max(ZMIN, Math.min(ZMAX, z0 * f));
    tt.x = cx - (cx - tt.x) * z1 / z0; tt.y = cy - (cy - tt.y) * z1 / z0; tt.z = z1;
    applyCam();
  };
  let anim = null, flyTok = 0, landed = true;
  const flyTo = (wx, wy, z) => {
    const { w, h } = size();
    const z1 = z || tt.z;
    const tx = w / 2 - wx * z1, ty = h / 2 - wy * z1;
    const reduce = document.documentElement.classList.contains('ec-reduce-motion') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    cancelAnimationFrame(anim);
    if (reduce) { tt.x = tx; tt.y = ty; tt.z = z1; applyCam(); return; }
    const x0 = tt.x, y0 = tt.y, zz0 = tt.z, t0 = performance.now();
    landed = false;
    const stepA = now => {
      const k = Math.min(1, (now - t0) / 420), e = 1 - Math.pow(1 - k, 3);
      tt.x = x0 + (tx - x0) * e; tt.y = y0 + (ty - y0) * e; tt.z = zz0 + (z1 - zz0) * e;
      applyCam();
      if (k < 1) anim = requestAnimationFrame(stepA); else landed = true;
    };
    anim = requestAnimationFrame(stepA);
    // background tabs may not run animation frames: land anyway
    const tok = ++flyTok;
    setTimeout(() => { if (tok === flyTok && !landed && !ptrs.size) { cancelAnimationFrame(anim); tt.x = tx; tt.y = ty; tt.z = z1; applyCam(); } }, 600);
  };
  const fit = () => { const { w, h } = size(); tt.z = Math.max(ZMIN, Math.min(w / L.W, h / L.H)); tt.x = 0; tt.y = 0; applyCam(); };
  const frontierCol = () => {
    const R = G.research(S, 'p');
    const open = L.ids.filter(id => !R.done[id] && T(id).reqs.every(r => R.done[r]));
    return open.length ? Math.min(...open.map(id => T(id).col)) : 0;
  };
  const focusFrontier = () => {
    const { w, h } = size();
    tt.z = isPhone() ? 0.62 : 0.78;
    tt.x = ((w < 520 ? 52 : X0 - 8) + 0.6 * COL_W - colX(frontierCol())) * tt.z;
    tt.y = 0;
    if (w > L.W * tt.z) tt.x = 0;
    applyCam();
  };

  // minimap: era bands, researched nodes as dots, viewport rectangle
  const drawMini = () => {
    const cv = view && view.mini;
    if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, sx = W / L.W, sy = H / L.H;
    g.clearRect(0, 0, W, H);
    const cols = ['#e8dbbd', '#e4cf9f', '#cfd7de', '#22184a'];
    for (let e = 0; e < 4; e++) { g.fillStyle = cols[e]; g.fillRect((X0 + e * 3 * COL_W) * sx, 0, 3 * COL_W * sx + (e === 3 ? 40 * sx : 0), H); }
    g.fillStyle = '#d8c9a8'; g.fillRect(0, 0, (X0 - 8) * sx, H);
    const R = S ? G.research(S, 'p') : { done: {} };
    for (const id of L.ids) {
      const p = L.pos[id];
      g.fillStyle = R.done[id] ? (T(id).era === 3 ? '#ffd860' : '#3f7d3a') : (T(id).era === 3 ? 'rgba(255,255,255,.35)' : 'rgba(60,40,20,.35)');
      g.fillRect(p.x * sx - 1, p.y * sy - 1, 2.4, 2.4);
    }
    const { w, h } = size();
    g.strokeStyle = '#a0522d'; g.lineWidth = 1.5;
    g.strokeRect(-tt.x / tt.z * sx, -tt.y / tt.z * sy, w / tt.z * sx, h / tt.z * sy);
  };

  // -------------------------------------------------------------------
  // input: drag / wheel / pinch / click / keyboard
  // -------------------------------------------------------------------
  const ptrs = new Map();
  let drag = null, pinch = null, moved = false, downNode = null;
  const local = ev => { const r = view.root.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  // shift-click: queue the node and every missing prerequisite
  const planTo = id => { toast(G.planResearch(S, 'p', UI.city, id) || `${T(id).name} and its path added to the research queue`); tt.sel = id; render(true); };
  const select = id => {
    tt.sel = id;
    render(true);
  };
  const attachInput = () => {
    const root = view.root, svg = view.svg;
    svg.addEventListener('pointerdown', ev => {
      if (ev.button > 0) return;
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { }
      if (!ptrs.size) downNode = ev.target.closest ? ev.target.closest('.tt-node') : null;
      ptrs.set(ev.pointerId, local(ev));
      UI.holding = true;
      moved = false;
      if (ptrs.size === 1) { const p = local(ev); drag = { x: p.x, y: p.y, cx: tt.x, cy: tt.y }; }
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: tt.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx: tt.x, cy: tt.y };
        drag = null;
      }
      cancelAnimationFrame(anim); flyTok++;
    });
    svg.addEventListener('pointermove', ev => {
      if (!ptrs.has(ev.pointerId)) { hover(ev); return; }
      const p = local(ev); ptrs.set(ev.pointerId, p);
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const z1 = Math.max(ZMIN, Math.min(ZMAX, pinch.z * d / Math.max(10, pinch.d)));
        tt.x = mx - (pinch.mx - pinch.cx) * z1 / pinch.z; tt.y = my - (pinch.my - pinch.cy) * z1 / pinch.z; tt.z = z1;
        moved = true; applyCam();
      } else if (drag) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) moved = true;
        if (moved) { tt.x = drag.cx + dx; tt.y = drag.cy + dy; applyCam(); view.tip.hidden = true; }
      }
    });
    const up = ev => {
      if (!ptrs.has(ev.pointerId)) return;
      ptrs.delete(ev.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 1) { const p = [...ptrs.values()][0]; drag = { x: p.x, y: p.y, cx: tt.x, cy: tt.y }; }
      if (!ptrs.size) {
        drag = null;
        setTimeout(() => { UI.holding = false; }, 0);
        if (!moved && ev.type === 'pointerup' && downNode) {
          const id = downNode.getAttribute('data-id');
          if (ev.shiftKey) planTo(id); else select(id);
        }
        downNode = null;
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('pointerleave', () => { if (!ptrs.size) view.tip.hidden = true; });
    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      const p = local(ev);
      if (ev.ctrlKey || Math.abs(ev.deltaY) > Math.abs(ev.deltaX) && !ev.shiftKey) zoomAt(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
      else { tt.x -= ev.deltaX || ev.deltaY; applyCam(); }
    }, { passive: false });
    svg.addEventListener('keydown', ev => {
      const n = ev.target.closest && ev.target.closest('.tt-node');
      if (n && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); select(n.getAttribute('data-id')); }
    });
    view.mini.addEventListener('click', ev => {
      const r = view.mini.getBoundingClientRect();
      flyTo((ev.clientX - r.left) / r.width * L.W, (ev.clientY - r.top) / r.height * L.H);
    });
  };

  // hover tooltip (mouse only)
  let tipId = null;
  const hover = ev => {
    if (ev.pointerType === 'touch') return;
    const n = ev.target.closest && ev.target.closest('.tt-node');
    const tip = view.tip;
    if (!n) { tip.hidden = true; tipId = null; return; }
    const id = n.getAttribute('data-id');
    if (id !== tipId) { tip.innerHTML = tipHtml(id); tipId = id; }
    tip.hidden = false;
    const p = local(ev), { w } = size();
    tip.style.left = Math.min(p.x + 16, w - 250) + 'px';
    tip.style.top = (p.y + 18) + 'px';
  };
  const tipHtml = id => {
    const t = T(id), st = status(id);
    const cost = Object.entries(st.cost || {}).map(([g, v]) => `${g === 'gold' ? '🪙' : DATA.goods[g].icon}${fmt(v)}`).join(' ');
    return `<b>${t.icon} ${esc(t.name)}</b><div class="tt-tipsub">${DATA.techEras[t.era].name} · ${DATA.techBranches[t.branch].name}${t.race ? ' · ' + DATA.races[t.race].name + ' only' : ''}${t.repeat ? ` · ↻ mastery, level ${st.level || 0}` : ''}</div>
      <div>${esc(G.techFxText(id))}${t.repeat ? ' (per level)' : ''}</div>
      ${st.done && !t.repeat || st.maxed ? '<div class="good">Researched</div>' : `<div class="tt-tipcost">${cost} · ⏱ ${fmtTime(realSecs(st.time || 0))}</div>${st.reason ? `<div class="${st.poor ? 'muted' : 'warn'}">${esc(st.reason)}</div>` : ''}`}`;
  };

  // -------------------------------------------------------------------
  // state overlay
  // -------------------------------------------------------------------
  // the city that would study a topic: the open one if its Academy is big enough and free, else the best free one
  const resCity = id => {
    const t = T(id);
    const cur = curCity();
    if (cur && cur.owner === 'p' && G.lvl(cur, 'academy') >= t.ac && G.researchHostFree(S, cur) > 0) return cur;
    return G.researchCityFor(S, 'p', id, cur) || (cur && G.lvl(cur, 'academy') >= t.ac ? cur : null) || G.bestAcademy(S, 'p') || cur;
  };
  const status = id => {
    const c = resCity(id);
    return c ? G.techStatus(S, c.id, id) : { ok: false, reason: 'No city', cost: {}, time: 0 };
  };
  const matches = id => {
    const t = T(id);
    if (tt.branch && t.branch !== tt.branch) return false;
    const q = (tt.search || '').trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || G.techFxText(id).toLowerCase().includes(q) || DATA.techBranches[t.branch].name.toLowerCase().includes(q);
  };
  const updateOverlay = () => {
    const R = G.research(S, 'p');
    const best = G.bestAcademy(S, 'p');
    const ac = best ? G.lvl(best, 'academy') : 0;
    const rec = new Set(G.techRecommend(S, 'p', 3));
    const q = R.queue || [];
    const filtering = !!(tt.branch || (tt.search || '').trim());
    const studying = {};
    for (const x of R.studies) studying[x.id] = x;
    for (const id of L.ids) {
      const n = view.nodes[id], t = T(id);
      const lv = t.repeat ? G.techLevel(S, 'p', id) : 0;
      let s;
      if (studying[id]) s = 'active';
      else if (R.done[id] && (!t.repeat || lv >= G.TECH_REPEAT_MAX)) s = 'done';
      else if (t.reqs.every(r => R.done[r])) s = ac >= t.ac ? 'avail' : 'gated';
      else s = 'locked';
      const qi = q.indexOf(id);
      const cls = `tt-node ${ERA_CLS[t.era]} ${s}${t.repeat ? ' repeat' : ''}${lv ? ' haslv' : ''}${rec.has(id) && s === 'avail' ? ' rec' : ''}${qi >= 0 ? ' queued' : ''}${tt.sel === id ? ' sel' : ''}${filtering && !matches(id) ? ' dim' : ''}${filtering && matches(id) ? ' hit' : ''}`;
      if (cls !== n.cls) { n.g.setAttribute('class', cls); n.cls = cls; }
      const qn = qi >= 0 ? q.filter(k => k === id).length : 0;
      const qs = qi >= 0 ? String(qi + 1) + (qn > 1 ? '+' : '') : '';
      if (qs !== n.q) { n.qt.textContent = qs; n.q = qs; }
      if (n.lvt) {
        const lvs = studying[id] ? `Lv ${lv}→${lv + 1}` : `Lv ${lv}`;
        if (lvs !== n.lv) { n.lvt.textContent = lvs; n.lv = lvs; }
      }
      const st = studying[id];
      const pctv = st ? Math.round(pct(S.time - st.start, st.end - st.start) * 2) / 2 : -1;
      if (pctv !== n.pct) {
        const C = 2 * Math.PI * (NODE_R + 4.5);
        n.ring.setAttribute('stroke-dasharray', pctv >= 0 ? `${C * pctv / 100} ${C}` : `0 ${C}`);
        n.pct = pctv;
      }
    }
    for (const l of view.links) {
      const a = R.done[l.from], b = R.done[l.to] || studying[l.to];
      const cls = `tt-link ${ERA_CLS[T(l.to).era]} ${a && b ? 'done' : a ? 'ready' : ''}${tt.sel && (l.to === tt.sel || l.from === tt.sel) ? ' selpath' : ''}${filtering && !(matches(l.from) && matches(l.to)) ? ' dim' : ''}`;
      if (cls !== l.cls) { l.p.setAttribute('class', cls); l.cls = cls; }
    }
    drawMini();
  };

  // -------------------------------------------------------------------
  // HTML around the picture
  // -------------------------------------------------------------------
  const eraPills = () => {
    const prog = G.techEraProgress(S, 'p'), cur = G.techEra(S, 'p');
    return prog.map((p, e) => `<button class="small tt-erabtn ${ERA_CLS[e]} ${e === cur ? 'on' : ''} ${e < cur ? 'past' : ''}" data-act="ttEra" data-e="${e}" title="${esc(DATA.techEras[e].desc)} ${p.got}/${p.total} known${e ? `; enter it by knowing ${p.need} techniques of the ${DATA.techEras[e - 1].name} era (${p.prevGot} so far)` : ''}">${DATA.techEras[e].icon} ${DATA.techEras[e].name} <span class="tt-eracount">${p.got}/${p.total}</span><i style="width:${pct(e ? p.prevGot : p.got, e ? p.need : p.total)}%"></i></button>`).join('');
  };
  const recList = () => {
    const ids = G.techRecommend(S, 'p', 3);
    if (!ids.length) return '';
    return `<div class="tt-rec"><span class="muted">✦ Recommended next:</span>${ids.map(id => { const st = status(id); return `<span class="tt-recitem"><button class="link" data-act="ttSel" data-t="${id}">${T(id).icon} ${esc(T(id).name)}</button><button class="small ${st.ok ? 'primary' : ''}" data-act="research" data-t="${id}" ${st.ok ? '' : 'disabled'} title="${esc(st.reason || G.techFxText(id))}">Research</button></span>`; }).join('')}</div>`;
  };
  // all running studies (one row per slot), free slots, and how to get more
  const studiesHtml = R => {
    const sl = G.researchSlots(S, 'p');
    if (!sl.total && !R.studies.length) return '';
    const rows = R.studies.map(x => {
      const t = T(x.id);
      if (!t) return '';
      const p = pct(S.time - x.start, x.end - x.start);
      return `<div class="tt-active"><span class="tt-activeico">${t.icon}</span><div class="tt-activebody"><div><b>${esc(t.name)}${t.repeat ? ` <span class="tt-lvtag">→ Lv ${x.level || G.techLevel(S, 'p', x.id) + 1}</span>` : ''}</b> <span class="muted">at ${esc((S.cities[x.city] || {}).name || '?')} · ${Math.round(p)}% · done in ${fmtTime(realSecs(x.end - S.time))}</span></div><div class="bar"><i style="width:${p}%"></i></div></div><span class="tt-actbtns"><button class="small" data-act="ttSel" data-t="${x.id}">Show</button><button class="small" data-act="cancelResearch" data-t="${x.id}" title="Stop this study: 50% of its goods come back" aria-label="Cancel ${esc(t.name)} (refunds 50%)">Cancel</button></span></div>`;
    }).join('');
    const free = Math.max(0, sl.total - R.studies.length);
    const empty = free ? `<div class="tt-active tt-freeslot muted"><span class="tt-activeico">📖</span><div class="tt-activebody">${free} free study slot${free > 1 ? 's' : ''}: start a topic, or queue some and they begin by themselves.</div></div>` : '';
    return `<div class="tt-studies"><div class="row tt-slothead"><b>Studies</b><span class="pill tt-slotpill" title="Parallel study slots: 1, plus one for every city with an Academy ${G.RESEARCH_SLOT_ACADEMY}+ (two for an Academy ${G.RESEARCH_DOUBLE_ACADEMY}+), up to ${G.RESEARCH_SLOT_MAX}">${R.studies.length} / ${sl.total} slot${sl.total === 1 ? '' : 's'}</span>${sl.hint ? `<span class="muted tt-slothint">➕ ${esc(sl.hint)}</span>` : ''}</div>${rows}${empty}</div>`;
  };
  const queueHtml = R => {
    const q = R.queue || [];
    if (!q.length) return '';
    const note = G.researchQueueNote(S, 'p');
    const plan = G.researchQueuePlan(S, 'p');
    const nNext = plan.filter(p => p.next).length;
    const chipOf = (id, i) => {
      const p = plan[i] || {}, t = T(id);
      const tag = p.next ? `<span class="tt-qnext" title="Starts as soon as a study slot and goods allow, alongside the other ▶ topics">▶ next</span>`
        : p.after ? `<span class="tt-qafter muted" title="Waits for ${esc(T(p.after) ? T(p.after).name : p.after)}">after ${esc(T(p.after) ? T(p.after).name : p.after)}</span>` : '';
      return `<span class="tt-qchip ${p.next ? 'next' : ''}"><b>${i + 1}</b> <button class="link" data-act="ttSel" data-t="${id}">${t ? t.icon + ' ' + esc(t.name) : esc(id)}${t && t.repeat ? ` <span class="tt-lvtag">Lv ${p.level}</span>` : ''}</button>${tag}${i ? `<button class="small" data-act="ttMove" data-t="${id}" data-i="${i}" data-d="-1" aria-label="Move up" title="Move up">▲</button>` : ''}${i < q.length - 1 ? `<button class="small" data-act="ttMove" data-t="${id}" data-i="${i}" data-d="1" aria-label="Move down" title="Move down">▼</button>` : ''}<button class="small" data-act="ttUnqueue" data-t="${id}" data-i="${i}" aria-label="Remove ${esc(t ? t.name : id)} from the queue" title="Remove (and anything queued that needs it)">✕</button></span>`;
    };
    const sl = G.researchSlots(S, 'p');
    return `<div class="tt-queue"><span class="muted">Queue (${q.length})${nNext ? ` · ▶ ${nNext} ${sl.free > 0 ? 'start' : 'take over'} next${nNext > 1 ? ', in parallel' : ''}` : ''}:</span>${q.map(chipOf).join('')}${note ? `<span class="warn tt-qnote">⏳ ${esc(note)}</span>` : ''}<span class="muted tt-qhint">Every free slot takes the first queued topic whose prerequisites are known. Goods are paid when a topic starts. Shift-click a node to plan its whole path.</span></div>`;
  };
  const chip = id => { const t = T(id); const R = G.research(S, 'p'); return `<button class="small tt-chip ${R.done[id] ? 'done' : ''}" data-act="ttSel" data-t="${id}">${t.icon} ${esc(t.name)}${R.done[id] ? ' ✓' : ''}</button>`; };
  // the actions for one tech: start, queue (another level), plan path, unqueue, progress — the same in
  // the detail card and in every row of the list view
  const actionsHtml = (id, compact) => {
    const t = T(id), st = status(id), R = G.research(S, 'p'), q = R.queue || [];
    const c = resCity(id);
    const pos = []; q.forEach((k, i) => { if (k === id) pos.push(i); });
    const out = [];
    if (st.done && !t.repeat) return '<span class="good">✅ Researched</span>';
    if (st.maxed) return `<span class="good">✅ Mastered (Lv ${st.level})</span>`;
    if (t.repeat) out.push(`<span class="tt-lvtag" title="Mastery level: each level adds the effect again">Lv ${st.level || 0} → ${(st.level || 0) + 1}</span>`);
    if (st.active) {
      const x = st.study, p = pct(S.time - x.start, x.end - x.start);
      out.push(`<span class="tt-lprog"><span class="good">📖 ${Math.round(p)}%</span><span class="bar"><i style="width:${p}%"></i></span><span class="muted">${fmtTime(realSecs(x.end - S.time))} left${compact ? '' : ' at ' + esc((S.cities[x.city] || {}).name || '?')}</span></span>`);
      out.push(`<button class="small" data-act="cancelResearch" data-t="${id}" title="Stop this study: 50% of its goods come back">Cancel</button>`);
    } else if (!(compact && st.locked)) {
      out.push(`<button class="small ${st.ok ? 'primary' : ''}" data-act="research" data-t="${id}" ${st.ok ? '' : 'disabled'} title="${esc(st.ok ? `Start now${c ? ' at ' + c.name : ''}` : st.reason || '')}">${compact ? 'Start' : 'Research now'}</button>`);
      if (st.poor && c && typeof buyRestBtn === 'function') out.push(buyRestBtn('research', c, st.cost, 1, { t: id }, compact));
    }
    const planN = G.techPath(S, 'p', id).filter(k => k !== id && !q.includes(k)).length;
    if (t.repeat) {
      const planned = (st.level || 0) + (st.active ? 1 : 0) + pos.length;
      if (planned < G.TECH_REPEAT_MAX) out.push(planN > 0
        ? `<button class="small" data-act="ttPlan" data-t="${id}" title="Queue the ${planN} missing prerequisite${planN > 1 ? 's' : ''} and level ${planned + 1}">🗺️ Plan path (+${planN})</button>`
        : `<button class="small" data-act="ttQueue" data-t="${id}" title="Add level ${planned + 1} to the queue (queue as many levels as you like)">＋ Queue Lv ${planned + 1}</button>`);
      if (pos.length) out.push(`<span class="tt-qpos" title="Queued levels">#${pos.map(i => i + 1).join(', #')}</span><button class="small" data-act="ttUnqueue" data-t="${id}" data-i="${pos[pos.length - 1]}" title="Remove the last queued level">− Lv</button>`);
    } else if (pos.length) {
      out.push(`<span class="tt-qpos">Queued #${pos[0] + 1}</span><button class="small" data-act="ttUnqueue" data-t="${id}" data-i="${pos[0]}" title="Remove from the queue (and anything queued that needs it)">Unqueue</button>`);
    } else if (!st.active) {
      out.push(planN > 0
        ? `<button class="small" data-act="ttPlan" data-t="${id}" title="Queue the ${planN} missing prerequisite${planN > 1 ? 's' : ''} and this, in order (shift-click on the tree)">🗺️ Plan path (+${planN})</button>`
        : `<button class="small" data-act="ttQueue" data-t="${id}" title="Starts when a study slot is free and goods allow">＋ Queue</button>`);
    }
    if (!compact) {
      out.push(`<span class="muted" style="font-size:12px">⏱ ${fmtTime(realSecs(st.time || 0))}${c ? ' at ' + esc(c.name) : ''}</span>`);
      if (st.reason && !st.active) out.push(`<span class="${st.poor || st.busy ? 'muted' : 'warn'}" style="font-size:12px">${esc(st.reason)}</span>`);
    } else if (st.locked && !st.active) out.push(`<span class="muted tt-lwhy" title="${esc(st.reason || '')}">🔒</span>`);
    return out.join('');
  };
  const detailHtml = city => {
    const id = tt.sel;
    if (!id || !T(id) || !G.techForOwner(S, 'p', id)) return `<div class="tt-detail tt-detail-empty muted">Select a technology to see what it does, what it needs and what it opens. ${DATA.techEras.map((e, i) => `<span class="tt-legend ${ERA_CLS[i]}">${e.icon} ${e.name}: ${ERA_MAT[i].toLowerCase()}</span>`).join(' ')} <span class="tt-legend tt-legrep">↻ Mastery: study again and again</span></div>`;
    const t = T(id), st = status(id);
    const c = resCity(id);
    const unlocks = G.techUnlocks(id).filter(k => G.techForOwner(S, 'p', k));
    const lv = t.repeat ? G.techLevel(S, 'p', id) : 0;
    return `<div class="tt-detail ${ERA_CLS[t.era]}${t.repeat ? ' repeat' : ''}">
      <div class="row"><span class="tt-dico ${ERA_CLS[t.era]}">${t.icon}</span><div><h3 style="margin:0">${esc(t.name)}${t.repeat ? ` <span class="tt-lvtag">↻ Lv ${lv}</span>` : ''}</h3>
        <div class="muted" style="font-size:12px">${DATA.techEras[t.era].icon} ${DATA.techEras[t.era].name} era, tier ${t.tier + 1} · ${DATA.techBranches[t.branch].icon} ${DATA.techBranches[t.branch].name} · Academy ${t.ac}${t.race ? ` · <b style="color:${DATA.races[t.race].color}">★ ${DATA.races[t.race].name} heritage</b>` : ''}</div></div>
        <span class="spacer"></span><button class="small" data-act="ttFocus" title="Centre the tree on this technology">🎯</button><button class="small" data-act="ttSel" data-t="" aria-label="Close details">✕</button></div>
      <p class="tt-flavor">${esc(t.flavor || '')}</p>
      <p class="tt-fx"><b>Effect${t.repeat ? ' per level' : ''}:</b> ${esc(G.techFxText(id))}${t.repeat ? ` <span class="muted">Mastery tech: study it again and again (up to level ${G.TECH_REPEAT_MAX}); each level costs ×${G.TECH_REPEAT_COST} more and takes a little longer.${lv > 1 ? ` Now: level ${lv}.` : ''}</span>` : ''}</p>
      <div class="tt-rel"><span class="muted">Needs:</span> ${t.reqs.length ? t.reqs.map(chip).join(' ') : '<span class="muted">nothing: a first step</span>'}</div>
      <div class="tt-rel"><span class="muted">Opens:</span> ${unlocks.length ? unlocks.map(chip).join(' ') : `<span class="muted">${t.repeat ? 'more of the same, level after level' : 'nothing further: a pinnacle'}</span>`}</div>
      ${st.done && !t.repeat ? '' : `<div class="tt-costrow">${t.repeat ? `<span class="muted">Level ${(st.level || 0) + 1}:</span> ` : ''}${costHtml(st.cost || {}, c || city)}</div>`}
      <div class="row tt-actions">${actionsHtml(id, false)}</div></div>`;
  };
  const toolbar = () => `<div class="tt-toolbar">
      <div class="tt-eras">${eraPills()}</div>
      <div class="row tt-tools">
        <input id="ttSearch" type="search" placeholder="Search techs or effects…" value="${esc(tt.search || '')}" aria-label="Search technologies">
        <select id="ttBranchSel" aria-label="Filter by branch"><option value="">All branches</option>${DATA.techBranchOrder.map(b => `<option value="${b}" ${tt.branch === b ? 'selected' : ''}>${DATA.techBranches[b].icon} ${DATA.techBranches[b].name}</option>`).join('')}</select>
        ${listMode() ? '' : `<button class="small" data-act="ttZoom" data-z="out" aria-label="Zoom out">−</button><button class="small" data-act="ttZoom" data-z="in" aria-label="Zoom in">+</button><button class="small" data-act="ttZoom" data-z="fit" title="Show the whole tree">⤢ Whole tree</button><button class="small" data-act="ttZoom" data-z="now" title="Jump to what you can study next">📍 Frontier</button>`}
        <button class="small" data-act="ttList">${listMode() ? '🌳 Tree view' : '☰ List view'}</button>
      </div></div>`;

  const listHtml = city => {
    const R = G.research(S, 'p');
    const ids = G.techList(S, 'p').filter(matches);
    return [0, 1, 2, 3].map(e => {
      const inEra = ids.filter(id => T(id).era === e);
      if (!inEra.length) return '';
      return `<div class="tt-listera ${ERA_CLS[e]}"><h3>${DATA.techEras[e].icon} ${DATA.techEras[e].name} Era <span class="muted" style="font-size:12px">${ERA_MAT[e]}</span></h3>
        ${DATA.techBranchOrder.map(b => {
          const l = inEra.filter(id => T(id).branch === b).sort((a, z) => T(a).col - T(z).col);
          if (!l.length) return '';
          return `<div class="group-title">${DATA.techBranches[b].icon} ${DATA.techBranches[b].name}</div>${l.map(id => {
            const t = T(id), st = status(id);
            const s = st.active ? 'active' : (st.done && !t.repeat) || st.maxed ? 'done' : st.locked ? 'locked' : 'avail';
            const queued = (R.queue || []).includes(id);
            return `<div class="tt-lrow ${s}${t.repeat ? ' repeat' : ''}${queued ? ' queued' : ''} ${tt.sel === id ? 'sel' : ''}"><button class="tt-lname link" data-act="ttSel" data-t="${id}"><span class="tt-lico">${t.icon}</span> ${esc(t.name)}${t.race ? ' <span style="color:' + DATA.races[t.race].color + '">★</span>' : ''}${t.repeat ? ' <span class="tt-repmark" title="Mastery tech: can be studied again and again">↻</span>' : ''}</button>
              <span class="tt-lfx muted">${esc(G.techFxText(id))}${t.repeat ? ' (per level)' : ''}</span>
              <span class="tt-lst">${actionsHtml(id, true)}</span></div>`;
          }).join('')}`;
        }).join('')}</div>`;
    }).join('');
  };

  const renderTechTree = city => {
    const R = G.research(S, 'p');
    const best = G.bestAcademy(S, 'p');
    const n = G.techList(S, 'p'), done = n.filter(id => R.done[id]).length;
    const sl = G.researchSlots(S, 'p'), nb = n.filter(id => !T(id).repeat).length, kb = n.filter(id => !T(id).repeat && R.done[id]).length;
    const intro = best
      ? `<p class="tt-intro">Research is shared by your whole realm. You can run <b>${sl.total} stud${sl.total === 1 ? 'y' : 'ies'} at once</b>, each in a different Academy and paid by the city that studies it; every city with an Academy ${G.RESEARCH_SLOT_ACADEMY}+ adds a slot (an Academy ${G.RESEARCH_DOUBLE_ACADEMY}+ runs two), up to ${G.RESEARCH_SLOT_MAX}. The best Academy is in <b>${esc(best.name)}</b> (level ${G.lvl(best, 'academy')}); deeper tiers need a bigger Academy. Known: <b>${kb}</b> of ${nb} techniques, plus ↻ mastery techs you can study again and again.</p>`
      : `<p class="tt-intro"><span class="warn">You have no Academy yet.</span> Build one (Town Hall 3) to begin research. Known: ${done} of ${n.length}.</p>`;
    if (tt.list === null) tt.list = false;
    return `<div class="card tt-card">
        <div class="row tt-title"><h2 style="margin:0">📚 Research</h2><span class="pill tt-erapill ${ERA_CLS[G.techEra(S, 'p')]}">${DATA.techEras[G.techEra(S, 'p')].icon} ${DATA.techEras[G.techEra(S, 'p')].name} era</span></div>
        ${intro}${studiesHtml(R)}${queueHtml(R)}${recList()}
        ${toolbar()}
      </div>
      ${listMode() ? `<div class="card tt-list">${listHtml(city)}</div>` : '<div id="ttHost" class="tt-host"><div class="tt-loading muted">Unrolling the scrolls…</div></div>'}
      <div class="card tt-detailcard">${detailHtml(city)}</div>`;
  };

  if (typeof TABS !== 'undefined' && TABS.research) TABS.research.render = c => renderTechTree(c);
  else if (typeof TABS !== 'undefined') TABS.research = { label: '📚 Research', render: c => renderTechTree(c) };

  // -------------------------------------------------------------------
  // mounting
  // -------------------------------------------------------------------
  let lastS = null;
  MOUNT_HOOKS.push(tab => {
    if (tab !== 'research' || !S || listMode()) { if (view) view.tip.hidden = true; return; }
    const host = document.getElementById('ttHost');
    if (!host) return;
    const race = S.empires.p.race;
    const key = race + '|' + G.techList(S, 'p').length;
    if (!view || view.key !== key) { build(race); tt.init = false; }
    if (lastS !== S) { tt.init = false; lastS = S; }
    if (view.root.parentNode !== host) { host.textContent = ''; host.appendChild(view.root); }
    if (!tt.init) { tt.init = true; focusFrontier(); }
    applyCam();
    updateOverlay();
  });
  window.addEventListener('resize', () => { if (view && view.root.isConnected) applyCam(); });
  // search and branch filter update the picture at once (the rebuild waits while typing)
  document.addEventListener('input', ev => {
    if (ev.target.id === 'ttSearch') { tt.search = ev.target.value; if (view && view.root.isConnected) updateOverlay(); }
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'ttBranchSel') { tt.branch = ev.target.value; ev.target.blur(); render(true); }
    if (ev.target.id === 'ttSearch') { ev.target.blur(); render(true); }
  });

  Object.assign(act, {
    // study at the open city if its Academy is big enough, otherwise at the best Academy that can afford it
    research: d => {
      const t = T(d.t);
      if (!t) return;
      const cur = curCity();
      const c = G.researchCityFor(S, 'p', d.t, cur) || resCity(d.t) || cur;
      if (!c) return;
      const err = G.startResearch(S, c.id, d.t);
      toast(err || `Scholars in ${c.name} begin studying ${t.name}`);
      render(true);
    },
    ttSel: d => { tt.sel = d.t || null; render(true); },
    ttFocus: () => { if (view && tt.sel && L.pos[tt.sel]) flyTo(L.pos[tt.sel].x, L.pos[tt.sel].y, Math.max(tt.z, 0.9)); },
    ttQueue: d => {
      const err = G.queueResearch(S, 'p', UI.city, d.t), R = G.research(S, 'p');
      const lv = T(d.t).repeat ? G.techLevel(S, 'p', d.t) + (R.studies.some(x => x.id === d.t) ? 1 : 0) + (R.queue || []).filter(k => k === d.t).length : 0;
      toast(err || `${T(d.t).name}${lv ? ' level ' + lv : ''} added to the research queue`); render(true);
    },
    ttPlan: d => planTo(d.t),
    ttUnqueue: d => { G.unqueueResearch(S, 'p', d.t, d.i !== undefined && d.i !== '' ? +d.i : undefined); render(true); },
    ttMove: d => { const e = G.moveQueuedResearch(S, 'p', d.t, +d.d, d.i !== undefined && d.i !== '' ? +d.i : undefined); if (e) toast(e); render(true); },
    cancelResearch: d => { G.cancelResearch(S, 'p', d && d.t ? d.t : undefined); render(true); },
    ttEra: d => {
      if (listMode()) { const e = document.querySelector(`.tt-listera.${ERA_CLS[+d.e]}`); if (e) e.scrollIntoView({ behavior: 'smooth' }); return; }
      if (!view) return;
      const { h } = size();
      flyTo(X0 + (+d.e * 3 + 1.5) * COL_W, Math.min(L.H / 2, h / 2 / tt.z), tt.z);
    },
    ttZoom: d => {
      if (!view) return;
      const { w, h } = size();
      if (d.z === 'in') zoomAt(1.25, w / 2, h / 2);
      else if (d.z === 'out') zoomAt(0.8, w / 2, h / 2);
      else if (d.z === 'fit') fit();
      else focusFrontier();
    },
    ttList: () => { tt.list = !listMode(); render(true); },
  });

  // debug helpers for tests / the console
  window.ECTREE = { get view() { return view; }, get layout() { return L; }, cam: tt, fit: () => view && fit(), frontier: () => view && focusFrontier() };
})();
