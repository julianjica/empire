// =====================================================================
//  Storylets UI: the illustrated tale card (📜 Tales tab), a top-bar
//  notice and a city-header chip while a tale waits, and the history of
//  past tales with the choices you made. The same card also appears in
//  the right-hand decisions column through the pending system.
// =====================================================================
'use strict';

(() => {
  if (!G.story) return;

  // a little styling of our own (no stylesheet edits): mobile-first, theme colours
  try {
    const css = `
      .tale-card { border-color: var(--accent2); background: color-mix(in srgb, var(--accent2) 8%, var(--panel)); }
      .tale-art { font-size: 44px; line-height: 1.1; text-align: center; letter-spacing: 6px; padding: 12px 0 6px;
        border-radius: 8px; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--accent2) 22%, transparent), transparent 70%); }
      .tale-card h3 { margin: 6px 0 2px; font-family: var(--font); text-align: center; }
      .tale-text { font-family: var(--font); font-size: 15.5px; line-height: 1.5; margin: 8px 0 12px; }
      .tale-choices { display: grid; gap: 8px; }
      .tale-choice { display: block; width: 100%; text-align: left; padding: 9px 11px; border-radius: 8px; white-space: normal; }
      .tale-choice b { display: block; font-size: 14px; }
      .tale-choice .tale-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; margin-top: 4px; font-size: 12.5px; font-weight: normal; }
      .tale-choice .lack { color: var(--bad); font-weight: 600; }
      .tale-choice.primary .muted, .tale-choice.primary .tale-risk { color: inherit; opacity: .85; }
      .tale-risk { color: var(--warn); }
      .tale-foot { font-size: 12px; margin-top: 10px; }
      .tale-log { list-style: none; padding: 0; margin: 0; }
      .tale-log li { display: grid; grid-template-columns: 30px 1fr; gap: 4px 8px; padding: 8px 0; border-top: 1px solid var(--line); }
      .tale-log li:first-child { border-top: 0; }
      .tale-log .ic { font-size: 22px; text-align: center; }
      .tale-log .say { font-family: var(--font); font-size: 14px; }
      .tale-log .fx { font-size: 12px; }
      @media (min-width: 760px) { .tale-choices { grid-template-columns: 1fr 1fr; } .tale-art { font-size: 56px; } }
    `;
    const el = document.createElement('style'); el.id = 'tale-css'; el.textContent = css; document.head.appendChild(el);
  } catch (e) { }

  const active = () => (S && G.story.active(S)) || null;

  const choiceHtml = (card, c) => {
    const locked = c.need || c.lack;
    const meta = [];
    for (const x of c.costs) meta.push(`<span class="${x.short ? 'lack' : ''}" title="${esc(x.name)}">${x.icon} ${fmt(x.n)} ${esc(x.name)}</span>`);
    if (!c.costs.length) meta.push('<span class="muted">free</span>');
    if (c.chance !== null) meta.push(`<span class="tale-risk" title="This choice is risky: it can go wrong.">🎲 risky · ${Math.round(c.chance * 100)}% to succeed</span>`);
    if (c.need) meta.push(`<span class="lack">🔒 ${esc(c.need)}</span>`);
    else if (c.lack) meta.push(`<span class="lack">${esc(c.lack)}</span>`);
    if (c.key === card.def) meta.push('<span class="muted">· default</span>');
    return `<button class="tale-choice ${c.key === card.choices[0].key && !locked ? 'primary' : ''}" data-act="tale" data-p="${card.pid}" data-k="${esc(c.key)}" ${locked ? 'disabled' : ''}>
      <b>${esc(c.text)}</b><span class="tale-meta">${meta.join('')}</span></button>`;
  };

  // the character a tale is about (portrait beside the text); tales without one keep only the vignette
  const TALE_PT = {
    plague_doctor: { kind: 'citizen', seed: 'beaked physician' },
    deserters: { kind: 'unit', race: 'rival' },
    relic: { kind: 'citizen', seed: 'ploughman' },
    famine: { kind: 'citizen', seed: 'empty bowls' },
    strange_child: { kind: 'citizen', seed: 'child who knew names' },
    heretic: { kind: 'citizen', seed: 'barefoot preacher' },
    dragon_egg: { kind: 'citizen', seed: 'egg merchant' },
    hearth_millers: { kind: 'citizen', seed: 'miller' },
    delver_grudge: { kind: 'ruler', race: 'rival' },
    ash_challenge: { kind: 'hero', seed: 'blood challenger' },
    veil_mortal: { kind: 'citizen', race: 'hearth', seed: 'mortal at court' },
    grave_king: { kind: 'ruler', seed: 'king who would not lie down' },
    wild_apprentice: { kind: 'citizen', role: 'mage', seed: 'boy who burned' },
    succession: { kind: 'ruler', race: 'minor' },
    double_agent: { kind: 'spy', seed: 'man with two masters' },
  };
  const taleSpec = p => {
    const t = p && p.data && TALE_PT[p.data.id];
    if (!t) return null;
    const ctx = p.data.ctx || {}, me = S.empires.p;
    const ai = ctx.ai && S.empires[ctx.ai], mi = ctx.minor && S.minors && S.minors[ctx.minor];
    const race = t.race === 'rival' ? (ai ? ai.race : me.race) : t.race === 'minor' ? (mi ? mi.race : me.race) : t.race || me.race;
    const color = t.race === 'rival' && ai ? ai.color : t.race === 'minor' ? undefined : me.color;
    const era = G.techEra(S, t.race === 'rival' && ai ? ai.id : 'p');
    if (t.kind === 'unit') return { race, kind: 'unit', unit: DATA.races[race].units[0], color, era };
    const seed = t.seed || (t.race === 'rival' && ai ? ai.name : t.race === 'minor' && mi ? mi.name : p.data.id);
    return t.role ? { race, kind: t.kind, role: t.role, seed, color, era } : { race, kind: t.kind, seed, color, era };
  };

  const cardHtml = p => {
    const card = G.story.card(S, p);
    if (!card) return '';
    const pic = ptHtml(taleSpec(p), 96, 'pt-card pt-tale');
    const def = card.choices.find(c => c.key === card.def);
    return `<div class="card tale-card">
      <div class="tale-art" aria-hidden="true">${esc(card.art)}</div>
      <h3>${esc(card.title)}</h3>
      ${pic ? `<div class="pt-talebody">${pic}<p class="tale-text">${esc(card.text)}</p></div>` : `<p class="tale-text">${esc(card.text)}</p>`}
      <div class="tale-choices">${card.choices.map(c => choiceHtml(card, c)).join('')}</div>
      <div class="tale-foot muted">Decide within <b>${fmtTime(realSecs(card.expires - S.time))}</b>, or: ${esc(def ? def.text.toLowerCase() : 'nothing')}.</div>
    </div>`;
  };

  const ago = t => fmtTime(realSecs(Math.max(0, S.time - t))) + ' ago';
  const logHtml = (limit) => {
    const log = G.story.history(S);
    if (!log.length) return '<p class="muted">No tales yet. Strange things happen to every realm in time; when one comes to yours, it will appear here.</p>';
    return `<ul class="tale-log">${log.slice(0, limit).map(l => `<li>
      <span class="ic">${esc(l.icon)}</span>
      <div><b>${esc(l.title)}</b>${l.stage !== 'start' ? ' <span class="muted">(continued)</span>' : ''} <span class="muted" style="font-size:12px">· ${esc(ago(l.t))}</span>
        <div style="font-size:13px">You chose: <b>${esc(l.choice)}</b>${l.auto ? ' <span class="muted">(no answer in time)</span>' : ''}${l.risky ? (l.ok ? ' <span class="good">· it worked</span>' : ' <span class="bad">· it went wrong</span>') : ''}</div>
        <div class="say">${esc(l.say)}</div>
        ${l.fx && l.fx.length ? `<div class="fx muted">${esc(l.fx.join(' · '))}</div>` : ''}</div></li>`).join('')}</ul>`;
  };

  const renderTales = () => {
    const p = active();
    const chain = G.story.pendingChain(S);
    const told = G.story.history(S).filter(l => l.stage === 'start').length;
    return `${p ? cardHtml(p) : `<div class="card"><h3>📜 Tales</h3><p class="muted" style="margin:0">${chain ? 'A story of yours is not finished yet. It will continue soon.' : 'All is quiet. A new tale will find your realm before long.'}</p></div>`}
      <div class="card"><h3>📖 Tales of ${esc(S.empires.p.name)}</h3>
        <p class="muted" style="font-size:12.5px;margin-top:0">${told} tale${told === 1 ? '' : 's'} told. Your choices are remembered, and later tales may recall them. Risky choices show their odds honestly; if you do not answer in time, the default happens.</p>
        ${logHtml(60)}</div>`;
  };

  // the tab sits just before "How to play"
  const help = TABS.help;
  if (help) delete TABS.help;
  TABS.tales = { label: '📜 Tales', render: renderTales, badge: () => active() ? 1 : 0 };
  if (help) TABS.help = help;

  // a notice in the top bar while a tale waits
  TOP_EXTRAS.push(() => {
    const p = active(); if (!p || UI.tab === 'tales') return '';
    return `<button class="small primary" data-act="tab" data-t="tales" title="${esc(p.title)}: your decision is needed">📜 A tale awaits</button>`;
  });
  // and a chip in the city header
  CITY_EXTRAS.push(() => {
    const p = active(); if (!p) return '';
    return `<button class="pill" style="margin-top:6px;cursor:pointer;border-color:var(--accent2)" data-act="tab" data-t="tales">📜 ${esc(p.title)} · open the tale</button>`;
  });
  // the last few tales on the Empire tab
  EMPIRE_EXTRAS.push(() => {
    const log = G.story.history(S);
    if (!log.length) return '';
    return `<div class="card"><h3>📜 Recent tales</h3>${logHtml(3)}<p style="margin-bottom:0"><button class="small" data-act="tab" data-t="tales">All tales</button></p></div>`;
  });

  Object.assign(act, {
    tale: d => {
      const top = G.story.history(S)[0];
      const err = G.resolvePending(S, d.p, d.k);
      if (err) toast(err);
      else {
        const l = G.story.history(S)[0];
        if (l && l !== top) toast(`${l.icon} ${l.say}`);
      }
      render(true);
    },
  });
})();
