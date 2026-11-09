// =====================================================================
//  Culture tab (happiness, tax policy, culture and traditions) and the
//  compact mood chip in the city header (cityExtrasHtml).
// =====================================================================
'use strict';

// live happiness for display (stored value is refreshed every slow tick)
const cultHappy = city => city.happyWhy ? { value: city.happy, why: city.happyWhy } : G.happiness(S, city);
// the factor most worth knowing: the worst grievance when unhappy, otherwise the biggest boost
const cultTopFactor = (why, value) => {
  const f = (why || []).filter(w => !/^Base/.test(w.label));
  const worst = f.filter(w => w.value < 0).sort((a, b) => a.value - b.value)[0];
  const best = f.filter(w => w.value > 0).sort((a, b) => b.value - a.value)[0];
  return value < 55 ? worst || best : best || worst;
};
const cultSigned = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);

// eslint-disable-next-line no-unused-vars
function cityExtrasHtml(city) {
  const h = cultHappy(city);
  const md = G.mood(h.value);
  const top = cultTopFactor(h.why, h.value);
  const tip = h.why.map(w => `${w.label}: ${cultSigned(w.value)}`).join('\n') + `\n\n${md.name}: ${G.moodEffects(h.value)}`;
  return `<div class="row mood-row">
    <button class="mood-chip mood-${md.key}" data-act="tab" data-t="culture" title="${esc(tip)}">
      <span class="mood-face">${md.face}</span><b>${h.value}</b><span>${md.name}</span>
      ${top ? `<span class="mood-top ${top.value < 0 ? 'bad' : 'good'}">${esc(top.label)} ${cultSigned(top.value)}</span>` : ''}
    </button>
    ${city.taxPolicy && city.taxPolicy !== 'normal' ? `<span class="pill">${city.taxPolicy === 'low' ? '🪶 Low taxes' : '💰 High taxes'}</span>` : ''}
    ${h.value < G.CULTURE.unrest ? `<span class="bad" style="font-size:12.5px">Unrest — loyalty falling!</span>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------
// The tradition web: a mandala of ten sectors (nine pillars and the
// people's Birthright) radiating outward by age, with the ethos compass
// at its heart. A persistent <svg> re-attached after every render
// (MOUNT_HOOKS), so the once-a-second rebuild keeps pan and zoom.
// ---------------------------------------------------------------------
const TRADUI = { sel: null, list: typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches, view: { x: 0, y: 0, k: 1 } };
const TRAD_R = [0, 178, 280, 380, 482];        // ring radius per age
const TRAD_SPAN = 600;                          // half-size of the full view
const tradPolar = (r, deg) => [Math.round(r * Math.cos(deg * Math.PI / 180) * 10) / 10, Math.round(r * Math.sin(deg * Math.PI / 180) * 10) / 10];
const tradSectorAngle = i => -90 + 36 * i + 18;  // centre of sector i (people last, beside Kinship)

// where every tradition sits for this people
const tradLayout = race => {
  const pos = {};
  DATA.pillarOrder.forEach((pl, i) => {
    const c = tradSectorAngle(i);
    for (let age = 1; age <= 4; age++) {
      const ids = DATA.traditionOrder.filter(id => { const t = DATA.traditions[id]; return t.pillar === pl && t.age === age && (!t.race || t.race === race); });
      const step = Math.min(11.5, 30 / Math.max(1, ids.length)) * (age === 1 ? 1 : 0.92 + 0.05 * age);
      ids.forEach((id, j) => {
        const off = (j - (ids.length - 1) / 2) * step;
        const r = TRAD_R[age] + (ids.length === 3 && j === 1 ? 18 : 0);
        const [x, y] = tradPolar(r, c + off);
        pos[id] = { x, y, a: c + off, r, age, pillar: pl };
      });
    }
  });
  return pos;
};
let tradLayoutCache = { race: null, pos: null };
const tradPos = race => { if (tradLayoutCache.race !== race) tradLayoutCache = { race, pos: tradLayout(race) }; return tradLayoutCache.pos; };

const tradState = id => {
  const st = G.traditionStatus(S, 'p', id);
  return st.have ? 'have' : st.forsaken ? 'forsaken' : st.ok ? 'ok' : st.poor ? 'poor' : 'locked';
};

const tradSvgInner = () => {
  const race = S.empires.p.race;
  const pos = tradPos(race);
  const ids = Object.keys(pos);
  const state = {}; for (const id of ids) state[id] = tradState(id);
  const out = [];
  out.push(`<defs>
    <radialGradient id="tw-bg" cx="0" cy="0" r="${TRAD_SPAN}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="var(--panel)"/><stop offset="1" stop-color="var(--panel2)"/></radialGradient>
    <filter id="tw-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>`);
  out.push(`<circle r="${TRAD_SPAN - 8}" fill="url(#tw-bg)" class="tw-rim"/>`);
  // sectors
  DATA.pillarOrder.forEach((pl, i) => {
    const P = DATA.pillars[pl];
    const a0 = -90 + 36 * i, a1 = a0 + 36;
    const [x0, y0] = tradPolar(120, a0), [x1, y1] = tradPolar(TRAD_SPAN - 50, a0), [x2, y2] = tradPolar(TRAD_SPAN - 50, a1), [x3, y3] = tradPolar(120, a1);
    out.push(`<path d="M${x0},${y0} L${x1},${y1} A${TRAD_SPAN - 50},${TRAD_SPAN - 50} 0 0 1 ${x2},${y2} L${x3},${y3} A120,120 0 0 0 ${x0},${y0}Z" fill="${P.color}" class="tw-sector"/>`);
    const [lx, ly] = tradPolar(TRAD_SPAN - 28, tradSectorAngle(i));
    const name = pl === 'people' ? `Way of the ${DATA.races[race].name}` : P.name.split(' & ')[0];
    out.push(`<g class="tw-label" transform="translate(${lx},${ly})"><text text-anchor="middle" y="-4" class="tw-label-ico">${P.icon}</text><text text-anchor="middle" y="14" fill="${P.color}">${esc(name)}</text></g>`);
  });
  // age rings
  for (let a = 1; a <= 4; a++) {
    out.push(`<circle r="${TRAD_R[a]}" class="tw-ring"/>`);
    const [x, y] = tradPolar(TRAD_R[a], -90);
    out.push(`<g transform="translate(${x},${y})" class="tw-age"><rect x="-15" y="-9" width="30" height="18" rx="9"/><text text-anchor="middle" y="4">${DATA.traditionAges[a].roman}</text><title>Age ${DATA.traditionAges[a].roman}: ${DATA.traditionAges[a].name}${DATA.traditionAges[a].need ? ` (after ${DATA.traditionAges[a].need} traditions)` : ''}</title></g>`);
  }
  // threads (prerequisites)
  for (const id of ids) {
    const t = DATA.traditions[id], c = pos[id];
    for (const g of t.pre) for (const pid of g) {
      const p = pos[pid];
      if (!p) continue;
      const [qx, qy] = tradPolar((p.r + c.r) / 2, p.a);
      const woven = state[pid] === 'have' && state[id] === 'have';
      const live = state[pid] === 'have' && (state[id] === 'ok' || state[id] === 'poor');
      out.push(`<path d="M${p.x},${p.y} Q${qx},${qy} ${c.x},${c.y}" class="tw-thread ${woven ? 'woven' : live ? 'live' : ''} ${g.length > 1 ? 'any' : ''} ${state[id] === 'forsaken' || state[pid] === 'forsaken' ? 'dead' : ''}" stroke="${DATA.pillars[t.pillar].color}"/>`);
    }
  }
  // forks
  const done = new Set();
  for (const id of ids) {
    const t = DATA.traditions[id];
    if (!t.excl || !pos[t.excl] || done.has(t.excl)) continue;
    done.add(id);
    const a = pos[id], b = pos[t.excl];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const [ox, oy] = tradPolar(a.r + 26, (a.a + b.a) / 2);
    out.push(`<path d="M${a.x},${a.y} Q${ox},${oy} ${b.x},${b.y}" class="tw-fork"/><g transform="translate(${(mx + ox) / 2},${(my + oy) / 2})" class="tw-fork-mark"><circle r="8"/><text text-anchor="middle" y="4">⚔</text><title>A fork: ${esc(t.name)} or ${esc(DATA.traditions[t.excl].name)}, never both</title></g>`);
  }
  // nodes
  for (const id of ids) {
    const t = DATA.traditions[id], p = pos[id], st = state[id];
    const col = DATA.pillars[t.pillar].color;
    const cap = t.race && t.age === 4;
    const r = cap ? 21 : 16;
    out.push(`<g class="tw-node st-${st} ${TRADUI.sel === id ? 'sel' : ''} ${cap ? 'cap' : ''}" data-tid="${id}" transform="translate(${p.x},${p.y})" style="--pc:${col}">
      ${st === 'ok' ? `<circle r="${r + 6}" class="tw-halo" filter="url(#tw-glow)"/>` : ''}
      <circle r="${r}" class="tw-disc"/>
      ${cap ? `<circle r="${r + 4}" class="tw-crown"/>` : ''}
      <text text-anchor="middle" y="${cap ? 7 : 5.5}" class="tw-ico" style="font-size:${cap ? 19 : 15}px">${t.icon}</text>
      ${t.cer ? `<text x="${r - 3}" y="${-r + 5}" class="tw-badge">🔔</text>` : ''}
      ${t.req && t.req.ethos ? `<text x="${-r - 4}" y="${-r + 5}" class="tw-badge">🧭</text>` : ''}
      ${st === 'forsaken' ? `<path d="M${-r * 0.7},${-r * 0.7} L${r * 0.7},${r * 0.7} M${r * 0.7},${-r * 0.7} L${-r * 0.7},${r * 0.7}" class="tw-x"/>` : ''}
      <title>${esc(t.name)} — ${esc(G.traditionStatus(S, 'p', id).reason || 'Ready to adopt')}</title>
    </g>`);
  }
  // the ethos compass at the heart
  const e = G.ethosOf(S, 'p');
  out.push('<g class="tw-compass"><circle r="112" class="tw-heart"/>');
  DATA.ethosOrder.forEach((ax, i) => {
    const ang = -90 + 45 * i, A = DATA.ethosAxes[ax];
    const [x1, y1] = tradPolar(84, ang), [x2, y2] = tradPolar(84, ang + 180);
    out.push(`<line x1="${x2}" y1="${y2}" x2="${x1}" y2="${y1}" class="tw-axis"/>`);
    for (const k of [G.ETHOS.gate, G.ETHOS.devoted]) for (const sg of [1, -1]) { const [tx, ty] = tradPolar(sg * 84 * k / 16, ang); out.push(`<circle cx="${tx}" cy="${ty}" r="${k === G.ETHOS.devoted ? 2.6 : 1.8}" class="tw-tick"/>`); }
    const [px, py] = tradPolar(98, ang), [nx, ny] = tradPolar(98, ang + 180);
    out.push(`<text x="${px}" y="${py + 5}" text-anchor="middle" class="tw-pole ${e[ax] >= G.ETHOS.lean ? 'on' : ''}">${A.iconPlus}<title>${A.plus} ${e[ax] > 0 ? e[ax] : 0}</title></text>`);
    out.push(`<text x="${nx}" y="${ny + 5}" text-anchor="middle" class="tw-pole ${e[ax] <= -G.ETHOS.lean ? 'on' : ''}">${A.iconMinus}<title>${A.minus} ${e[ax] < 0 ? -e[ax] : 0}</title></text>`);
    const v = Math.max(-16, Math.min(16, e[ax]));
    if (v) { const [mx, my] = tradPolar(84 * v / 16, ang); out.push(`<line x1="0" y1="0" x2="${mx}" y2="${my}" class="tw-needle"/><circle cx="${mx}" cy="${my}" r="5" class="tw-mark"><title>${v > 0 ? A.plus : A.minus} ${Math.abs(e[ax])}</title></circle>`); }
  });
  out.push(`<circle r="6" class="tw-hub"/></g>`);
  return out.join('');
};

// persistent element, pan / zoom / pinch, click to select
const tradWeb = (() => {
  if (typeof document === 'undefined') return null;
  const wrap = document.createElement('div');
  wrap.className = 'tw-wrap';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'tw-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'The tradition web');
  wrap.appendChild(svg);
  let key = '';
  const applyView = () => {
    const v = TRADUI.view, half = TRAD_SPAN / v.k;
    svg.setAttribute('viewBox', `${v.x - half} ${v.y - half} ${2 * half} ${2 * half}`);
  };
  applyView();
  const toWorld = (cx, cy) => {
    const r = svg.getBoundingClientRect(), v = TRADUI.view, half = TRAD_SPAN / v.k, sz = Math.min(r.width, r.height) || 1;
    // preserveAspectRatio: xMidYMid meet → the square view fits the short side
    const sx = (cx - r.left - (r.width - sz) / 2) / sz, sy = (cy - r.top - (r.height - sz) / 2) / sz;
    return { x: v.x - half + sx * 2 * half, y: v.y - half + sy * 2 * half, scale: 2 * half / sz };
  };
  const clampView = () => { const v = TRADUI.view; v.k = Math.max(0.8, Math.min(4, v.k)); const lim = TRAD_SPAN * (1 - 1 / v.k) + 60; v.x = Math.max(-lim, Math.min(lim, v.x)); v.y = Math.max(-lim, Math.min(lim, v.y)); };
  const zoomAt = (f, cx, cy) => {
    const v = TRADUI.view;
    const before = cx === undefined ? { x: v.x, y: v.y } : toWorld(cx, cy);
    v.k *= f; clampView();
    if (cx !== undefined) { const after = toWorld(cx, cy); v.x += before.x - after.x; v.y += before.y - after.y; clampView(); }
    applyView();
  };
  svg.addEventListener('wheel', ev => { ev.preventDefault(); zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY); }, { passive: false });
  const pts = new Map();
  let moved = 0, pinch = null, downNode = null;
  svg.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse') pts.clear();
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* synthetic or stale pointer */ }
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    UI.holding = true;
    moved = 0;
    const n = ev.target.closest && ev.target.closest('[data-tid]');
    downNode = pts.size === 1 && n ? n.getAttribute('data-tid') : null;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: TRADUI.view.k }; }
  });
  svg.addEventListener('pointermove', ev => {
    const p = pts.get(ev.pointerId);
    if (!p) return;
    if (ev.pointerType === 'mouse' && !ev.buttons) { up(ev); return; }   // a release we never heard
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    p.x = ev.clientX; p.y = ev.clientY;
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const f = (pinch.k * d / Math.max(1, pinch.d)) / TRADUI.view.k;
      zoomAt(f, (a.x + b.x) / 2, (a.y + b.y) / 2);
      moved += 10;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 4) {
      const sc = toWorld(0, 0).scale;
      TRADUI.view.x -= dx * sc; TRADUI.view.y -= dy * sc; clampView(); applyView();
      wrap.classList.add('dragging');
    }
  });
  function up(ev) {
    if (!pts.has(ev.pointerId)) return;
    pts.delete(ev.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) {
      wrap.classList.remove('dragging');
      setTimeout(() => { UI.holding = false; }, 0);
      if (moved <= 4 && downNode && ev.type === 'pointerup') { TRADUI.sel = TRADUI.sel === downNode ? null : downNode; key = ''; render(true); const d = document.getElementById('tradDetail'); if (d && window.innerWidth < 1180) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      downNode = null;
    }
  }
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  // keyboard: +/- zoom, arrows pan, 0 resets
  wrap.tabIndex = 0;
  wrap.addEventListener('keydown', ev => {
    const v = TRADUI.view, step = 60 / v.k;
    if (ev.key === '+' || ev.key === '=') zoomAt(1.2); else if (ev.key === '-') zoomAt(1 / 1.2);
    else if (ev.key === '0') { Object.assign(v, { x: 0, y: 0, k: 1 }); applyView(); }
    else if (ev.key.startsWith('Arrow')) { v.x += ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0; v.y += ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0; clampView(); applyView(); }
    else return;
    ev.preventDefault();
  });
  return {
    wrap,
    zoom: f => { if (!f) { Object.assign(TRADUI.view, { x: 0, y: 0, k: 1 }); applyView(); } else zoomAt(f); },
    refresh: () => {
      const emp = S.empires.p;
      const k = [emp.race, (emp.traditions || []).join(), TRADUI.sel, G.traditionsFor(S, 'p').filter(id => G.traditionStatus(S, 'p', id).ok).join(), emp.faithId || '', G.citiesOf(S, 'p').map(c => G.lvl(c, 'magetower')).join()].join('|');
      if (k === key) return;
      key = k;
      svg.innerHTML = tradSvgInner();
    },
  };
})();
const tradZoomBy = f => { if (tradWeb) tradWeb.zoom(f); };
if (typeof MOUNT_HOOKS !== 'undefined') MOUNT_HOOKS.push(tab => {
  const host = document.getElementById('tradWebHost');
  if (!tradWeb || !S) return;
  if (tab === 'culture' && host) {
    if (tradWeb.wrap.parentNode !== host) host.appendChild(tradWeb.wrap);
    tradWeb.refresh();
  }
});

// ---- cards ----
const tradNextHint = () => {
  const open = G.traditionsFor(S, 'p').filter(id => G.traditionStatus(S, 'p', id).ok);
  return `<div class="cult-stat"><span class="muted">Ready</span><b class="${open.length ? 'good' : ''}">${open.length}</b><span class="muted">to adopt</span></div>`;
};
const tradEthosCard = () => {
  const e = G.ethosOf(S, 'p');
  const A = G.traditionAgg(S.empires.p);
  const gauge = ax => {
    const X = DATA.ethosAxes[ax], v = e[ax], w = Math.min(16, Math.abs(v)) / 16 * 50;
    return `<div class="eth-axis" title="${X.minus} ← → ${X.plus}: ${v > 0 ? '+' : ''}${v}. Leaning at ${G.ETHOS.lean}, special traditions at ${G.ETHOS.gate}, devoted at ${G.ETHOS.devoted}.">
      <span class="eth-pole ${v <= -G.ETHOS.lean ? 'on' : ''}">${X.iconMinus} ${X.minus}</span>
      <span class="eth-bar"><i class="t6 l"></i><i class="t10 l"></i><i class="t6 r"></i><i class="t10 r"></i><b class="${v < 0 ? 'neg' : 'pos'}" style="${v < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></b><em>${v > 0 ? '+' : ''}${v}</em></span>
      <span class="eth-pole r ${v >= G.ETHOS.lean ? 'on' : ''}">${X.plus} ${X.iconPlus}</span></div>`;
  };
  const rivals = Object.values(S.empires).filter(o => o.id !== 'p' && !o.dead).map(o => {
    const aff = G.ethosAffinity(S, o.id, 'p');
    const word = aff > 0.45 ? ['Kindred ways', 'good'] : aff > 0.15 ? ['Similar ways', 'good'] : aff < -0.45 ? ['Opposed ways', 'bad'] : aff < -0.15 ? ['Strange ways', 'warn'] : ['Indifferent', 'muted'];
    return `<span class="pill ${word[1]}" title="${esc(G.ethosTitle(G.ethosOf(S, o.id)))} (${(o.traditions || []).length} traditions). Kindred realms are slower to attack you.">${esc(o.name)}: ${word[0]}</span>`;
  }).join('');
  return `<div class="card eth-card"><div class="row"><h3 style="margin:0">🧭 Ethos</h3><span class="muted" style="font-size:13px">${esc(G.ethosTitle(e))}</span></div>
    <div class="eth-grid">${DATA.ethosOrder.map(gauge).join('')}</div>
    ${A.virtues.length ? `<div class="row" style="gap:6px;margin-top:6px">${A.virtues.map(v => `<span class="pill good">✦ ${esc(DATA.ethosAxes[v.slice(0, -1)][v.endsWith('+') ? 'plus' : 'minus'])} virtue: ${esc(DATA.ethosVirtues[v].text)}</span>`).join('')}</div>` : ''}
    ${rivals ? `<div class="row eth-rivals">${rivals}</div>` : ''}</div>`;
};
const tradDetail = id => {
  const t = DATA.traditions[id];
  if (!t) return `<div class="tw-detail empty"><p class="muted">Tap a tradition in the web to read it. Glowing ones are ready; the ⚔ marks forks where you must choose; 🔔 grants a ceremony, 🧭 needs a strong ethos.</p>
    <div class="tw-legend"><span><i class="lg have"></i>Adopted</span><span><i class="lg ok"></i>Ready</span><span><i class="lg poor"></i>Open, needs culture</span><span><i class="lg locked"></i>Locked</span><span><i class="lg forsaken"></i>Forsaken</span></div></div>`;
  const st = G.traditionStatus(S, 'p', id);
  const P = DATA.pillars[t.pillar];
  const list = S.empires.p.traditions || [];
  const pre = t.pre.map(g => g.filter(x => DATA.traditions[x]).map(x => `<button class="linkish ${list.includes(x) ? 'good' : ''}" data-act="tradSel" data-id="${x}">${list.includes(x) ? '✓ ' : ''}${DATA.traditions[x].icon} ${esc(DATA.traditions[x].name)}</button>`).join(' or ')).join(' and ');
  const leads = DATA.traditionOrder.filter(x => DATA.traditions[x].pre.some(g => g.includes(id)) && (!DATA.traditions[x].race || DATA.traditions[x].race === S.empires.p.race));
  const ex = t.excl && DATA.traditions[t.excl];
  const age = DATA.traditionAges[t.age];
  return `<div class="tw-detail" style="--pc:${P.color}">
    <div class="row"><span class="tw-big">${t.icon}</span><div><b style="font-size:16px">${esc(t.name)}</b><div class="muted" style="font-size:12px">${P.icon} ${esc(t.race ? `Birthright of the ${DATA.races[t.race].name}` : P.name)} · Age ${age.roman} ${age.name}</div></div>
      <span class="spacer"></span><button class="small" data-act="tradSel" data-id="" title="Close">✕</button></div>
    ${t.lore ? `<p class="tw-lore">“${esc(t.lore)}”</p>` : ''}
    <ul class="tw-fx">${G.traditionEffects(t).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${t.cer ? `<p class="tw-line">🔔 <b>${DATA.ceremonies[t.cer].name}</b>: ${esc(DATA.ceremonies[t.cer].desc)} Rests ${DATA.ceremonies[t.cer].cool} minutes between.</p>` : ''}
    <p class="tw-line">🧭 Ethos: ${esc(G.traditionEthosText(id) || 'none')}</p>
    ${pre ? `<p class="tw-line">🧵 Needs ${pre}</p>` : ''}
    ${t.req ? `<p class="tw-line">🔒 Also needs ${esc(G.traditionReqText(id))}</p>` : ''}
    ${ex ? `<p class="tw-line warn">⚔ Fork: adopting it forsakes <button class="linkish" data-act="tradSel" data-id="${t.excl}">${ex.icon} ${esc(ex.name)}</button> forever.</p>` : ''}
    ${t.tale ? `<p class="tw-line">📖 ${G.taleSeen(S, 'p', t.tale) ? '<span class="good">A tale your realm has lived makes it 25% cheaper.</span>' : 'Cheaper once your realm has lived a certain tale.'}</p>` : ''}
    ${leads.length ? `<p class="tw-line muted">Leads to ${leads.map(x => `<button class="linkish" data-act="tradSel" data-id="${x}">${DATA.traditions[x].icon} ${esc(DATA.traditions[x].name)}</button>`).join(', ')}</p>` : ''}
    <div class="row" style="margin-top:8px">${st.have ? '<span class="good">✓ Adopted</span>' : st.forsaken ? `<span class="bad">✗ ${esc(st.reason)}</span>` :
      `<button class="${st.ok ? 'primary' : ''}" data-act="adoptTradition" data-id="${id}" ${st.ok ? '' : 'disabled'}>Adopt · 🎭 ${fmt(st.cost || 0)}</button>${st.ok ? '' : `<span class="${st.poor ? 'muted' : 'warn'}" style="font-size:12px">${esc(st.reason)}</span>`}`}</div>
  </div>`;
};
const tradListHtml = () => {
  const race = S.empires.p.race;
  return DATA.pillarOrder.map(pl => {
    const P = DATA.pillars[pl];
    const ids = G.traditionsFor(S, 'p').filter(id => DATA.traditions[id].pillar === pl);
    const have = ids.filter(id => (S.empires.p.traditions || []).includes(id)).length;
    return `<details class="tw-pillar" ${ids.some(id => G.traditionStatus(S, 'p', id).ok) ? 'open' : ''} style="--pc:${P.color}"><summary><span>${P.icon}</span> <b>${esc(pl === 'people' ? `Way of the ${DATA.races[race].name}` : P.name)}</b> <span class="muted">${have}/${ids.length}</span></summary>
      ${ids.map(id => {
        const t = DATA.traditions[id], st = tradState(id);
        return `<button class="tw-row st-${st} ${TRADUI.sel === id ? 'sel' : ''}" data-act="tradSel" data-id="${id}"><span class="tw-row-ico">${t.icon}</span><span class="tw-row-name">${esc(t.name)}${t.excl ? ' <span title="fork">⚔</span>' : ''}${t.cer ? ' 🔔' : ''}${t.req && t.req.ethos ? ' 🧭' : ''}</span><span class="tw-row-age">${DATA.traditionAges[t.age].roman}</span><span class="tw-row-st">${st === 'have' ? '✓' : st === 'ok' ? '●' : st === 'forsaken' ? '✗' : st === 'poor' ? '○' : '🔒'}</span></button>`;
      }).join('')}</details>`;
  }).join('');
};
const tradWebCard = () => {
  const emp = S.empires.p;
  const n = (emp.traditions || []).length;
  const nextAge = [2, 3, 4].find(a => n < DATA.traditionAges[a].need);
  return `<div class="card tw-card"><div class="row"><h3 style="margin:0">🕸️ Traditions</h3>
      <span class="muted" style="font-size:13px">${n} woven${nextAge ? ` · Age ${DATA.traditionAges[nextAge].roman} ${DATA.traditionAges[nextAge].name} opens at ${DATA.traditionAges[nextAge].need}` : ' · every age is open'}</span>
      <span class="spacer"></span>
      <span class="seg"><button class="small ${TRADUI.list ? '' : 'on'}" data-act="tradMode" data-m="web">🕸️ Web</button><button class="small ${TRADUI.list ? 'on' : ''}" data-act="tradMode" data-m="list">☰ List</button></span>
      ${TRADUI.list ? '' : '<span class="seg"><button class="small" data-act="tradZoom" data-z="out" title="Zoom out">−</button><button class="small" data-act="tradZoom" data-z="reset" title="Whole web">⊙</button><button class="small" data-act="tradZoom" data-z="in" title="Zoom in">+</button></span>'}</div>
    <div class="tw-layout">
      ${TRADUI.list ? `<div class="tw-list">${tradListHtml()}</div>` : '<div id="tradWebHost" class="tw-host"></div>'}
      <div id="tradDetail">${tradDetail(TRADUI.sel)}</div>
    </div></div>`;
};
const tradCeremonyCard = () => {
  const mine = G.ceremoniesOf(S, 'p');
  const grantedBy = id => G.traditionsFor(S, 'p').find(x => DATA.traditions[x].cer === id);
  const rows = DATA.ceremonyOrder.filter(id => grantedBy(id)).map(id => {
    const c = DATA.ceremonies[id];
    const have = mine.includes(id);
    const st = have ? G.ceremonyStatus(S, 'p', id) : null;
    const cost = st && st.cost ? Object.entries(st.cost).map(([g, v]) => `${g === 'gold' ? '🪙' : DATA.goods[g].icon} ${fmt(v)}`).join(' ') : '';
    const cool = st && st.cooling ? Math.max(0, 1 - (st.ready - S.time) / (c.cool * 60 * G.pace(S).time)) : 1;
    return `<div class="cer ${have ? '' : 'locked'}">
      <span class="cer-ico" style="--cool:${Math.round(cool * 360)}deg">${c.icon}</span>
      <div class="cer-txt"><b>${c.name}</b>${c.season !== undefined ? ` <span class="pill muted">${G.SEASONS[c.season]}</span>` : ''}<div class="muted" style="font-size:12px">${esc(c.desc)}</div></div>
      <div class="cer-act">${have ? `<button class="small ${st.ok ? 'primary' : ''}" data-act="holdCeremony" data-id="${id}" ${st.ok ? '' : 'disabled'}>Hold · ${cost}</button>${st.ok ? '' : `<div class="muted" style="font-size:11.5px">${esc(st.reason)}</div>`}` : `<span class="muted" style="font-size:12px">From ${DATA.traditions[grantedBy(id)].icon} ${esc(DATA.traditions[grantedBy(id)].name)}</span>`}</div>
    </div>`;
  }).join('');
  return `<div class="card"><h3>🔔 Ceremonies <span class="muted" style="font-size:13px">customs held on demand, then rested</span></h3>${rows}</div>`;
};

const renderCulture = city => {
  const emp = S.empires.p;
  const C = G.CULTURE;
  const cities = G.citiesOf(S, 'p');
  const rate = G.realmCultureRate(S, 'p');
  const per = G.sizePenaltyPer(S, 'p');
  const soft = Math.min(C.sizeSoftMax, Math.floor((emp.cultureTotal || 0) / C.sizeCulture));
  const nextSoft = soft < C.sizeSoftMax ? (soft + 1) * C.sizeCulture : null;
  const parts = [];

  parts.push(`<div class="card cult-head">
    <div class="row"><span style="font-size:34px">🎭</span>
      <div><h2 style="margin:0">Culture of ${esc(emp.name)}</h2>
        <div class="muted" style="font-size:13px">Culture buys traditions and calms a sprawling realm.</div></div>
      <span class="spacer"></span>
      <div class="cult-stat"><span class="muted">Culture</span><b>${fmt(emp.culture || 0)}</b><span class="muted">${fmtRate(rate)}/min</span></div>
      <div class="cult-stat"><span class="muted">Lifetime</span><b>${fmt(emp.cultureTotal || 0)}</b><span class="muted">${(emp.traditions || []).length} traditions</span></div>
      ${tradNextHint()}
    </div>
    <p style="margin:8px 0 0;font-size:13px">👑 Empire size: the first ${G.sizeFreeOf(S)} cities are free; each one beyond costs <b>−${per}</b> happiness in every city
      ${cities.length > G.sizeFreeOf(S) ? `(now <b class="bad">−${Math.round((cities.length - G.sizeFreeOf(S)) * per)}</b> with ${cities.length} cities)` : `(you rule ${cities.length})`}.
      ${nextSoft ? `<span class="muted">At ${fmt(nextSoft)} lifetime culture this eases by 1.</span>` : '<span class="good">Culture has eased it as far as it can.</span>'}</p>
  </div>`);

  // ---- traditions: ethos, the web, ceremonies ----
  parts.push(tradEthosCard());
  parts.push(tradWebCard());
  parts.push(tradCeremonyCard());

  // ---- cities ----
  const rows = cities.map(c => {
    const h = cultHappy(c);
    const md = G.mood(h.value);
    const pol = c.taxPolicy || 'normal';
    const placate = h.value < C.discontent ? `<button class="small" data-act="placate" data-c="${c.id}" title="Games and gifts: +${C.placate} happiness for 20 minutes, +10 loyalty">🎪 Placate · 🪙 ${fmt(G.placateCost(S, c))}</button>` : '';
    return `<div class="cult-city ${c.id === city.id ? 'cur' : ''}">
      <div class="row">
        <span class="mood-face big">${md.face}</span>
        <div style="min-width:150px"><b>${esc(c.name)}</b><div class="muted" style="font-size:12px">${md.name} · ${G.moodEffects(h.value)}</div></div>
        <div class="mood-bar mood-${md.key}" title="${h.value} / 100"><i style="width:${h.value}%"></i><span>${h.value}</span></div>
        <span class="spacer"></span>
        <span class="muted" style="font-size:12px" title="Culture per minute">🎭 ${G.cultureRate(S, c).toFixed(1)}/min</span>
        <span class="${(c.loyalty ?? 100) < 50 ? 'bad' : 'muted'}" style="font-size:12px">🏳️ ${Math.round(c.loyalty ?? 100)}%</span>
      </div>
      <div class="row cult-factors">${h.why.filter(w => !/^Base/.test(w.label)).map(w => `<span class="pill ${w.value > 0 ? 'good' : 'bad'}">${esc(w.label)} ${cultSigned(w.value)}</span>`).join('') || '<span class="muted" style="font-size:12px">Nothing stirs the people either way.</span>'}</div>
      <div class="row">
        <span class="muted" style="font-size:12px">Taxes</span>
        <span class="seg">${G.TAX_POLICIES.map(p => `<button class="small ${pol === p ? 'on' : ''}" data-act="taxPolicy" data-c="${c.id}" data-p="${p}" title="${{ low: '−30% taxes, +10 happiness', normal: 'No change', high: '+35% taxes, −15 happiness' }[p]}">${{ low: '🪶 Low', normal: 'Normal', high: '💰 High' }[p]}</button>`).join('')}</span>
        <span class="muted" style="font-size:12px">🪙 ${fmtRate(G.econ(S, c).tax)}/min</span>
        <span class="spacer"></span>${placate}
      </div>
    </div>`;
  }).join('');
  parts.push(`<div class="card"><h3>Happiness of your cities</h3>${rows}</div>`);

  parts.push(`<div class="card help"><details><summary><b>How happiness and culture work</b></summary>
    <ul style="font-size:13px">
      <li>Every city has a happiness from 0 to 100, starting from ${C.base}. Hover the mood chip in the City tab for the full breakdown.</li>
      <li><b>Raises it:</b> 🍺 Taverns (+${C.tavern}/level), ⛩️ Temples (+${C.temple}), 🎭 Theatres (+${C.theatre}) up to +${C.amenityCap} in all, fresh bread for the Hearthfolk (+${C.bread}), your hero in town (+${C.hero}), festivals (+${C.festival}), low taxes (+10) and traditions.</li>
      <li><b>Lowers it:</b> crowding (citizens near the housing limit, up to −${C.crowdMax}), war weariness (many enrolled soldiers), empire size, famine (−${C.starving}), calamities nearby (−${C.calamity}), recent attacks (−${C.raidedHeld} if held, −${C.raidedLost} if sacked) and high taxes (−15).</li>
      <li><b>${C.jubilant}+ Jubilant:</b> +10% goods and refining, +15% growth, +25% culture. <b>Below ${C.discontent}, Discontent:</b> −10% goods, −20% growth. <b>Below ${C.unrest}, Unrest:</b> −25% goods, half taxes, and loyalty falls about 1 per minute. At zero loyalty the city revolts and becomes an outlaw stronghold (your last city never revolts).</li>
      <li><b>Traditions</b> are bought with culture and woven into a web of nine pillars and your people's Birthright, across four ages (Roots, Customs, Heritage, Myth — each age opens after 3, 8 and 15 traditions). Each one costs more than the last; a tale your realm has lived through makes its tradition a quarter cheaper.</li>
      <li><b>Forks</b> (⚔): some traditions exclude each other. Choose one and the other is forsaken for good.</li>
      <li><b>Ethos</b>: every tradition nudges your people along four axes. At ${G.ETHOS ? G.ETHOS.gate : 6} a leaning opens special traditions; at ${G.ETHOS ? G.ETHOS.devoted : 10} your people are devoted and gain a small virtue. Realms of kindred ethos are slower to attack you; opposed ones quicker.</li>
      <li><b>Ceremonies</b> (🔔): some traditions grant a custom you hold on demand for goods or gold, which then rests a while. Seasonal ones are offered as decisions when their season turns.</li>
      <li>Each city makes culture: ${C.cultureBase || 0.5} + 0.1 per 10 happiness, +2 per Temple level, +3 per Theatre level, a little from the Town Hall and Academy, more from traditions and faith. Every ${fmt(C.sizeCulture)} lifetime culture eases the empire-size penalty by 1 per city (up to ${C.sizeSoftMax}).</li>
    </ul></details></div>`);
  return parts.join('');
};

// put the Culture tab right after Research
(() => {
  const entries = Object.entries(TABS).filter(([k]) => k !== 'culture');
  for (const [k] of entries) delete TABS[k];
  const tab = { label: '🎭 Culture', render: c => renderCulture(c), badge: () => S ? G.citiesOf(S, 'p').filter(c => G.happyOf(c) < G.CULTURE.discontent).length : 0 };
  let placed = false;
  for (const [k, v] of entries) {
    TABS[k] = v;
    if (k === 'research') { TABS.culture = tab; placed = true; }
  }
  if (!placed) TABS.culture = tab;
})();

Object.assign(act, {
  taxPolicy: d => { toast(G.setTaxPolicy(S, d.c, d.p)); render(true); },
  adoptTradition: d => { const err = G.adoptTradition(S, 'p', d.id); toast(err || `Adopted ${DATA.traditions[d.id].name}`); render(true); },
  tradSel: d => { TRADUI.sel = d.id || null; render(true); },
  tradMode: d => { TRADUI.list = d.m === 'list'; render(true); },
  tradZoom: d => { tradZoomBy(d.z === 'in' ? 1.3 : d.z === 'out' ? 1 / 1.3 : 0); },
  holdCeremony: d => { const err = G.holdCeremony(S, 'p', d.id); toast(err || `${DATA.ceremonies[d.id].icon} ${DATA.ceremonies[d.id].name} is held`); render(true); },
  placate: d => { toast(G.placate(S, d.c) || 'The people are calmed'); render(true); },
});
