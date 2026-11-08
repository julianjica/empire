// =====================================================================
//  Ember & Crown — guided first session (coach card + spotlight) and
//  opt-in browser notifications while the tab is hidden.
//  Plugs in through MOUNT_HOOKS, TOP_EXTRAS and act; owns no game rules.
// =====================================================================
'use strict';

(() => {
  // -------------------------------------------------------------------
  // small helpers
  // -------------------------------------------------------------------
  const $ = sel => document.querySelector('#app ' + sel);
  const tabSel = k => `[data-act="tab"][data-t="${k}"]`;
  const lv = (c, b) => G.lvl(c, b);
  const queued = (c, b) => c.buildQueue.some(q => q.type === b);
  const queueItem = (c, b) => c.buildQueue.find(q => q.type === b);
  const hasOrQueued = (c, b, L) => lv(c, b) >= L || c.buildQueue.some(q => q.type === b && q.level >= L);
  const cardByHeading = (scope, tag, prefix) => {
    for (const h of document.querySelectorAll(`#app ${scope} .card ${tag}`)) if (h.textContent.trim().indexOf(prefix) !== -1) return h.closest('.card');
    return null;
  };
  const queueCard = () => cardByHeading('main', 'h3', 'Construction');
  const questCard = () => cardByHeading('.right', 'h4', 'Quests');
  const waitLeft = (c, b) => { const q = queueItem(c, b); return q ? fmtTime(realSecs((q.end || q.start + q.dur) - S.time)) : ''; };
  const speedHint = '<span class="tut-hint">⏳ Building takes game time. To hurry things along, try the <b>Speed</b> selector at the top.</span>';
  const waitText = (c, b, what) => `<p>${what} is under construction${waitLeft(c, b) ? ` — about <b>${waitLeft(c, b)}</b> to go` : ''}. Carry on with anything you like meanwhile.</p>${speedHint}`;
  // On another tab? Point at the City tab first.
  const onCity = (sel, text) => UI.tab === 'city' ? { target: sel, text } : { target: tabSel('city'), text: text + '<p class="tut-hint">👉 Open the <b>City</b> tab first.</p>' };
  // Build-button target plus a friendly note when the button is disabled right now.
  const buildStep = (c, b, text) => {
    let note = '';
    const st = safe(() => G.buildStatus(S, c, b));
    if (st && !st.ok && !st.maxed) {
      if (/queue full/i.test(st.reason || '')) {
        const first = c.buildQueue.reduce((m, q) => Math.min(m, q.end || q.start + q.dur), Infinity);
        note = `<p class="tut-hint">⏳ All building slots are busy. The button wakes up when a job finishes${first < Infinity ? ` (about ${fmtTime(realSecs(first - S.time))})` : ''}.</p>`;
      } else if (st.poor) note = '<p class="tut-hint">⏳ Short of some goods — they trickle in every minute, so give it a moment.</p>';
      else if (st.reason) note = `<p class="tut-hint">Right now: ${esc(st.reason)}.</p>`;
    }
    return onCity(`#bld-${b} button[data-act="build"]`, text + note);
  };
  const playerUnits = () => {
    let n = 0, training = false;
    for (const c of G.citiesOf(S, 'p')) {
      for (const [u, k] of Object.entries(c.units)) if (u !== 'hero') n += k || 0;
      if (Object.values(c.train || {}).some(q => q && q.length)) training = true;
    }
    return { n, training };
  };
  const heroCity = () => (G.heroCity ? G.heroCity(S) : null);
  const nearest = (from, list) => list.map(t => ({ t, d: Math.hypot(t.x - from.x, t.y - from.y) })).sort((a, b) => a.d - b.d)[0];
  const nearestRuin = () => {
    const from = heroCity() || curCity();
    const ruins = S.special.filter(t => t && t.ruin && S.explored[G.tileIdx(S, t)]);
    const ready = ruins.filter(t => t.ruin.readyAt <= S.time);
    const best = nearest(from, ready.length ? ready : ruins);
    return best && best.t;
  };
  const nearestCamp = () => {
    const from = curCity();
    const camps = S.tiles.filter((t, i) => t.camp && S.explored[i] && S.camps[t.camp] && !S.camps[t.camp].kind);
    const best = nearest(from, camps);
    return best && best.t;
  };
  const nearestFog = () => {
    const from = curCity();
    const best = nearest(from, S.tiles.filter((t, i) => !S.explored[i] && !(DATA.terrain[t.terrain] || {}).impassable));
    return best && best.t;
  };
  const selTile = () => UI.sel ? G.tileAt(S, UI.sel.x, UI.sel.y) : null;

  // -------------------------------------------------------------------
  // the steps. view() → { text, target, show? }   done() → bool (game state)
  // Progress is stored by step id so saves survive edits to this list.
  // -------------------------------------------------------------------
  const STEPS = [
    {
      id: 'welcome', title: 'Welcome to Ember & Crown', manual: true,
      view: c => ({ text: `<p>You rule a small hamlet called <b>${esc(c.name)}</b>. Over the next while you'll grow it into a town, lead a hero into old ruins, raise soldiers, and deal with three rival peoples.</p><p>Nothing here costs real money, and the world keeps turning (gently) while you're away. I'll walk you through the first steps — you can skip me any time.</p>` }),
    },
    {
      id: 'resources', title: 'Your goods and your people', manual: true,
      view: () => ({ target: '.res-bar', text: `<p>This bar shows what ${esc(curCity().name)} has in store and how much it gains each minute. Grain feeds everyone, timber and stone build things, and ore becomes iron later.</p><p><b>👥 People</b> matter most: every farm, camp and workshop needs workers. If you're short of workers, everything slows down.</p>` }),
    },
    {
      id: 'fields', title: 'Grow your fields',
      done: c => hasOrQueued(c, 'farm', 2) && hasOrQueued(c, 'lumber', 2),
      view: c => {
        const needFarm = !hasOrQueued(c, 'farm', 2);
        const b = needFarm ? 'farm' : 'lumber';
        return buildStep(c, b,
          `<p>More grain and timber make everything else possible. Upgrade your <b>🌾 Farm</b> and your <b>🪓 Lumber Camp</b> to level 2.</p><p>${needFarm ? 'Start with the Farm' : 'Now the Lumber Camp'} — press its <b>Upgrade</b> button.</p>`);
      },
    },
    {
      id: 'houses', title: 'Homes for your workers',
      done: c => hasOrQueued(c, 'houses', 2),
      view: c => buildStep(c, 'houses', `<p>Each new building needs hands to run it, and people need somewhere to live. Upgrade your <b>🏘️ Houses</b> so your population can keep growing.</p><p class="tut-hint">Tip: if the People counter says "Short of workers", build Houses.</p>`),
    },
    {
      id: 'queue', title: 'The construction queue', manual: true,
      view: c => onCity(queueCard, `<p>Here is everything your builders are working on. The bar fills as work goes on, and the ✕ cancels a job (with a refund).</p><p>You have <b>${G.buildSlots ? G.buildSlots(c) : 1}</b> building slot${G.buildSlots && G.buildSlots(c) === 1 ? '' : 's'}; a bigger Town Hall builds faster.</p>${speedHint}`),
    },
    {
      id: 'heroPoints', title: 'Your hero',
      done: () => { const h = G.hero(S); return !h || h.dead || h.free === 0; },
      view: () => {
        const h = G.hero(S);
        const t = `<p>Every realm needs a champion. <b>${esc(h.name)}</b> has <b>${h.free}</b> attribute point${h.free === 1 ? '' : 's'} to spend.</p>`;
        return UI.tab === 'hero'
          ? { target: 'button[data-act="heroPoint"]:not([disabled])', text: t + '<p>Press <b>+</b> next to an attribute. Might makes adventures safer; Stewardship boosts the goods of the city your hero rests in.</p>' }
          : { target: tabSel('hero'), text: t + '<p>👉 Open the <b>Hero</b> tab.</p>' };
      },
    },
    {
      id: 'adventure', title: 'Into the ruins',
      done: () => (S.stats.adventures || 0) >= 1 || S.moves.some(m => m.owner === 'p' && m.type === 'adventure'),
      view: () => {
        const h = G.hero(S);
        if (!h || h.dead) return { text: '<p>Your hero has fallen for now. Once they are revived (Hero tab), send them into a ruin for treasure and experience. You can carry on with the next step.</p>' };
        const intro = '<p>Old ruins hide treasure, items and experience. Your hero can explore them in an <b>adventure</b>.</p>';
        const t = selTile();
        if (UI.tab === 'world') {
          if (t && t.ruin) {
            if (UI.mode !== 'adventure') return { target: 'button[data-act="mode"][data-m="adventure"]', text: intro + '<p>You have a ruin selected. Choose <b>🦸 Adventure</b>.</p>' };
            return { target: 'button[data-act="send"]', text: intro + `<p>Check that your hero 🦸 is set to 1 in the form, then press <b>Send</b>. ${t.ruin.readyAt > S.time ? '<br><span class="tut-hint">This ruin was plundered recently; a nearer, ready one may be better.</span>' : ''}</p><p class="tut-hint">The march takes a little while; the result arrives in Reports.</p>` };
          }
          return { target: '.mapwrap', show: 'ruin', text: intro + '<p>On the map, ruins look like 🏚️. Tap one, then pick <b>Adventure</b> and send your hero. Or let me find the nearest one for you.</p>' };
        }
        if (UI.tab === 'hero' && $('[data-act="goTile"][data-m="adventure"]')) return { target: '[data-act="goTile"][data-m="adventure"]', text: intro + '<p>Under <b>Known ruins</b>, press <b>Plan adventure</b> next to a nearby one that is ready.</p>' };
        return { target: tabSel('world'), show: 'ruin', text: intro + '<p>👉 Open the <b>World</b> map, select a ruin 🏚️ and press <b>Adventure</b>. (You can also plan it from the Hero tab.)</p>' };
      },
    },
    {
      id: 'townhall', title: 'A bigger Town Hall',
      done: c => hasOrQueued(c, 'townhall', 2),
      view: c => buildStep(c, 'townhall', '<p>The <b>🏛️ Town Hall</b> unlocks new buildings as it grows: Barracks at level 2, and the Academy, Market and Walls at level 3. It also speeds up all construction.</p><p>Upgrade it to level 2.</p>'),
    },
    {
      id: 'troops', title: 'Barracks and your first troops',
      done: c => lv(c, 'barracks') >= 1 && (() => { const p = playerUnits(); return p.n > 0 || p.training; })(),
      view: c => {
        const intro = '<p>A realm needs defenders. Troops are trained at the <b>🛡️ Barracks</b>, and every soldier comes <b>from your population</b> — so keep building Houses.</p>';
        if (lv(c, 'townhall') < 2) return queued(c, 'townhall') ? onCity(queueCard, intro + waitText(c, 'townhall', 'Your Town Hall (needed for Barracks)')) : buildStep(c, 'townhall', intro + '<p>The Barracks needs Town Hall level 2 first.</p>');
        if (!lv(c, 'barracks') && !queued(c, 'barracks')) return buildStep(c, 'barracks', intro + '<p>Build the Barracks now.</p>');
        if (!lv(c, 'barracks')) return onCity(queueCard, intro + waitText(c, 'barracks', 'The Barracks'));
        const t = intro + '<p>Train a few <b>🦅 Scouts</b> to start — they need only grain and gold. Soldiers also need ⚔️ weapons, which come from an Armory later.</p>';
        return UI.tab === 'military'
          ? { target: 'button[data-act="train"][data-u="scout"]', text: t + '<p>Set how many (3 is plenty) and press <b>Train</b>.</p>' }
          : { target: tabSel('military'), text: t + '<p>👉 Open the <b>Military</b> tab.</p>' };
      },
    },
    {
      id: 'camp', title: 'Scout a brigand camp',
      done: () => Object.keys(S.intel || {}).length > 0 || (S.empires.p.wins || 0) > 0 || S.moves.some(m => m.owner === 'p' && ['scout', 'raid', 'attack'].includes(m.type)),
      view: c => {
        const intro = '<p>Brigand camps ⛺ dot the wilds. <b>Scout</b> one first to see who guards it; once you have soldiers, <b>raid</b> it for plunder and renown.</p>';
        const p = playerUnits();
        const t = selTile();
        if (!p.n && p.training) return { target: tabSel('military'), text: intro + '<p>Your troops are still training — this step continues once they are ready.</p><span class="tut-hint">⏳ Training takes game time. The <b>Speed</b> selector at the top can hurry it along.</span>' };
        if (UI.tab === 'world') {
          if (t && t.camp) {
            if (!['scout', 'raid'].includes(UI.mode)) return { target: 'button[data-act="mode"][data-m="scout"]', text: intro + '<p>Choose <b>🦅 Scout</b>.</p>' };
            return { target: 'button[data-act="send"]', text: intro + '<p>Enter how many to send (2–3 scouts is fine), then press <b>Send</b>.</p>' };
          }
          return { target: '.mapwrap', show: 'camp', text: intro + '<p>Tap a camp ⛺ on the map, or let me find the nearest one. None in sight yet? Send scouts into the fog — that counts too.</p>' };
        }
        return { target: tabSel('world'), show: 'camp', text: intro + '<p>👉 Open the <b>World</b> map.</p>' };
      },
    },
    {
      id: 'research', title: 'Learning at the Academy',
      done: () => { const R = G.research(S, 'p'); return !!R.active || Object.keys(R.done).length > 0; },
      view: c => {
        const intro = '<p>Scholars at the <b>📚 Academy</b> research upgrades for your whole realm: more goods, faster building, stronger troops.</p>';
        if (lv(c, 'townhall') < 3) {
          if (c.buildQueue.some(q => q.type === 'townhall' && q.level >= 3)) return onCity(queueCard, intro + waitText(c, 'townhall', 'Town Hall level 3'));
          return buildStep(c, 'townhall', intro + `<p>The Academy needs Town Hall level 3. ${queued(c, 'townhall') ? 'Once the current upgrade finishes, queue' : 'Queue'} the next Town Hall upgrade.</p><p class="tut-hint">This one takes a while. Play on — I'll be here.</p>${speedHint}`);
        }
        if (!lv(c, 'academy') && !queued(c, 'academy')) return buildStep(c, 'academy', intro + '<p>Build the Academy.</p>');
        if (!lv(c, 'academy')) return onCity(queueCard, intro + waitText(c, 'academy', 'The Academy'));
        return UI.tab === 'research'
          ? { target: ['button[data-act="research"]:not([disabled])', 'button[data-act="research"]'], text: intro + '<p>Pick any topic you can afford and press <b>Research</b>. If nothing is affordable yet, give your stores a minute to fill.</p>' }
          : { target: tabSel('research'), text: intro + '<p>👉 Open the <b>Research</b> tab.</p>' };
      },
    },
    {
      id: 'culture', title: 'Happiness and culture', manual: true,
      view: () => ({ target: TABS.culture ? tabSel('culture') : null, text: '<p>Happy people work harder. Each city has a <b>happiness</b> score: taverns, temples, bread and low taxes raise it; crowding, famine, war and high taxes lower it. Very unhappy cities can revolt.</p><p>Cities also make <b>culture</b>, which you spend on lasting traditions. Peek at the <b>Culture</b> tab whenever you like.</p>' }),
    },
    {
      id: 'diplomacy', title: 'Neighbours and merchants', manual: true,
      view: () => ({ target: tabSel('diplomacy'), text: '<p>You share the land with three other peoples. On the <b>Diplomacy</b> tab you can send gifts, make peace, form alliances — and accept offers from <b>foreign merchants</b>, which is a handy way to get goods you lack.</p><p>A <b>Market</b> (Town Hall 3) lets you trade goods for gold and send caravans between your own cities.</p>' }),
    },
    {
      id: 'wrap', title: "You're ready", manual: true, last: true,
      view: () => ({ target: [questCard, tabSel('help')], text: '<p>That\'s the basics! The <b>🎯 Quests</b> list always suggests a good next goal and pays rewards — claim them as you go.</p><p>For the full rules, open <b>❔ How to play</b>. You can replay this tour from the <b>?</b> button at the top. Good luck, ruler!</p>' }),
    },
  ];
  const stepIdx = id => Math.max(0, STEPS.findIndex(s => s.id === id));

  // -------------------------------------------------------------------
  // state
  // -------------------------------------------------------------------
  const T = () => S && S.tutorial;
  const active = () => { const t = T(); return !!(t && !t.done && !t.skipped); };
  const fresh = () => ({ step: STEPS[0].id, done: false, skipped: false, min: false });
  let flash = 0;              // timestamp of the last auto-completed step
  let lastScrollKey = '';

  // flag brand-new games right away so the very first save already carries it
  if (G.newGameHooks) G.newGameHooks.push(s => { if (!s.tutorial) s.tutorial = fresh(); });
  const ensureStarted = () => {
    if (S && !S.tutorial && S.time < 60 && !S.gameOver) S.tutorial = fresh();
  };
  // chain-skip steps the player has already satisfied
  const autoAdvance = city => {
    const t = T();
    let i = stepIdx(t.step), moved = false;
    while (i < STEPS.length && STEPS[i].done && safe(() => STEPS[i].done(city))) { i++; moved = true; }
    if (i >= STEPS.length) { t.done = true; t.step = STEPS[STEPS.length - 1].id; return; }
    if (moved) { t.step = STEPS[i].id; flash = Date.now(); }
  };
  const safe = f => { try { return f(); } catch (e) { return false; } };
  const goNext = () => {
    const t = T(); if (!t) return;
    const i = stepIdx(t.step);
    if (i >= STEPS.length - 1) { t.done = true; toast('Tutorial complete. Restart it any time from the ? button.'); }
    else t.step = STEPS[i + 1].id;
    t.min = false;
    refresh();
  };

  // -------------------------------------------------------------------
  // DOM: coach card + spotlight (both outside #app so re-renders keep them)
  // -------------------------------------------------------------------
  let coach = null, spot = null, coachHtml = '';
  const ensureDom = () => {
    if (!coach) { coach = document.createElement('div'); coach.id = 'tut-coach'; coach.className = 'tut-coach'; coach.setAttribute('role', 'dialog'); coach.setAttribute('aria-live', 'polite'); document.body.appendChild(coach); }
    if (!spot) { spot = document.createElement('div'); spot.id = 'tut-spot'; spot.className = 'tut-spot'; document.body.appendChild(spot); }
  };
  const resolveTargets = target => {
    const list = Array.isArray(target) ? target : [target];
    for (const tg of list) {
      const el = typeof tg === 'function' ? safe(tg) : tg ? $(tg) : null;
      if (el && el.getClientRects().length) return { el, key: typeof tg === 'string' ? tg : String(list.indexOf(tg)) };
    }
    return null;
  };
  let curTarget = null;

  const placeSpot = () => {
    if (!spot) return;
    const el = curTarget && curTarget.el;
    if (!el || !el.isConnected || !active() || T().min) { spot.classList.remove('on'); return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { spot.classList.remove('on'); return; }
    const pad = 5;
    Object.assign(spot.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
    spot.classList.add('on');
  };

  const maybeScroll = (el, key) => {
    if (!el || key === lastScrollKey) return;
    lastScrollKey = key;
    const r = el.getBoundingClientRect();
    const coachTop = coach && coach.classList.contains('on') ? coach.getBoundingClientRect().top : innerHeight;
    const bottomLimit = innerWidth <= 700 ? Math.min(innerHeight, coachTop) : innerHeight;
    if (r.top < 0 || r.bottom > bottomLimit) {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { el.scrollIntoView(); }
      if (innerWidth <= 700 && el.getBoundingClientRect().bottom > bottomLimit) window.scrollBy(0, el.getBoundingClientRect().bottom - bottomLimit + 24);
    }
  };

  const refresh = () => {
    ensureDom();
    if (!S || S.gameOver || !G.citiesOf(S, 'p').length) { coach.classList.remove('on'); curTarget = null; placeSpot(); return; }
    ensureStarted();
    if (!active()) { coach.classList.remove('on'); curTarget = null; placeSpot(); return; }
    const city = curCity();
    autoAdvance(city);
    if (!active()) { coach.classList.remove('on'); curTarget = null; placeSpot(); toast('Tutorial complete — well played!'); return; }
    const t = T();
    const i = stepIdx(t.step), step = STEPS[i];
    const v = safe(() => step.view(city)) || { text: '' };
    let html;
    if (t.min) {
      html = `<button class="tut-pill" data-act="tutOpen" title="Open the tutorial">🧭 Tutorial · ${i + 1}/${STEPS.length}</button>`;
    } else {
      const showBtn = v.show === 'ruin' ? '<button class="small" data-act="tutShow" data-w="ruin">Show me a ruin</button>'
        : v.show === 'camp' ? '<button class="small" data-act="tutShow" data-w="camp">Show me a camp</button>' : '';
      const nextBtn = step.last ? '<button class="small primary" data-act="tutNext">Finish</button>'
        : step.manual ? '<button class="small primary" data-act="tutNext">Next</button>'
        : '<button class="small" data-act="tutNext" title="Skip just this step">I\'ve got this</button>';
      html = `<div class="tut-head"><span class="tut-step">Step ${i + 1} of ${STEPS.length}</span><span class="tut-sp"></span><button class="tut-x" data-act="tutMin" title="Minimise" aria-label="Minimise tutorial">–</button></div>
        ${Date.now() - flash < 3000 ? '<div class="tut-flash">✓ Nicely done!</div>' : ''}
        <h4 class="tut-title">${step.title}</h4>
        <div class="tut-body">${v.text}</div>
        <div class="tut-dots">${STEPS.map((s, k) => `<i class="${k < i ? 'past' : k === i ? 'cur' : ''}"></i>`).join('')}</div>
        <div class="tut-actions">${showBtn}<span class="tut-sp"></span>${nextBtn}</div>
        <div class="tut-foot"><button class="link" data-act="tutSkip">Skip tutorial</button><button class="link" data-act="tutorialRestart">Restart tutorial</button></div>`;
    }
    coach.classList.toggle('min', !!t.min);
    if (html !== coachHtml) { coach.innerHTML = html; coachHtml = html; }
    coach.classList.add('on');
    curTarget = t.min ? null : resolveTargets(v.target);
    if (curTarget) maybeScroll(curTarget.el, t.step + '|' + curTarget.key + '|' + UI.tab);
    placeSpot();
  };

  MOUNT_HOOKS.push(() => refresh());
  // render(false) can replace .top without running the mount hooks, and the
  // page scrolls/reflows — so keep re-checking on a timer too (cheap).
  setInterval(() => { try { refresh(); } catch (e) { console.error(e); } }, 1000);
  setInterval(() => { if (curTarget && curTarget.el && !curTarget.el.isConnected && active()) { const v = safe(() => STEPS[stepIdx(T().step)].view(curCity())); curTarget = v ? resolveTargets(v.target) : null; } placeSpot(); }, 250);
  window.addEventListener('resize', placeSpot);
  window.addEventListener('scroll', placeSpot, true);

  TOP_EXTRAS.push(() => S ? `<button class="small tut-q" data-act="tutOpen" title="Tutorial: open, or replay the guided tour" aria-label="Tutorial">?</button>` : '');

  Object.assign(act, {
    tutNext: () => goNext(),
    tutSkip: () => { if (!S) return; S.tutorial = Object.assign(T() || fresh(), { skipped: true }); refresh(); toast('Tutorial skipped. The ? button at the top brings it back.'); },
    tutorialRestart: () => { if (!S) return; S.tutorial = fresh(); lastScrollKey = ''; refresh(); },
    tutMin: () => { if (T()) { T().min = true; refresh(); } },
    tutOpen: () => {
      if (!S) return;
      if (active()) { T().min = false; refresh(); }
      else act.tutorialRestart();
    },
    tutShow: d => {
      let t = d.w === 'camp' ? nearestCamp() : nearestRuin();
      if (!t && d.w === 'camp' && (t = nearestFog())) toast('No camps in sight yet — scouting the fog nearby is how you find them.');
      if (!t) { toast(d.w === 'camp' ? 'No camps discovered yet — scouts and armies reveal more of the map.' : 'No ruins discovered yet — explore with scouts.'); return; }
      const hc = heroCity();
      act.goTile({ x: t.x, y: t.y, m: d.w === 'camp' ? 'scout' : 'adventure', c: d.w === 'camp' ? undefined : hc && hc.id });
    },
  });

  // =====================================================================
  //  Browser notifications (opt-in)
  // =====================================================================
  const NKEY = 'emberCrown_notif';
  const supported = () => typeof window.Notification === 'function';
  const pref = () => { try { return localStorage.getItem(NKEY) === 'on'; } catch (e) { return false; } };
  const setPref = on => { try { localStorage.setItem(NKEY, on ? 'on' : 'off'); } catch (e) { } };
  const enabled = () => supported() && pref() && Notification.permission === 'granted';
  const MAX_DELAY = 12 * 3600 * 1000;   // catchUp never simulates more than 12 hours
  const timers = [];
  const sent = new Set();

  // While the tab is hidden the main loop is paused and G.catchUp() replays the
  // gap on return. catchUp runs the world at 1× regardless of the Speed setting,
  // so one game second = one real second while hidden. If catchUp is ever
  // changed to honour the speed setting, follow it.
  const hiddenRate = () => (/settings\.speed/.test(String(G.catchUp)) ? (S.settings.speed || 1) : 1);

  const notify = (title, body, tab, cityId, tag) => {
    if (!document.hidden || !enabled()) return false;
    if (tag && sent.has(tag)) return false;
    if (tag) sent.add(tag);
    try {
      const n = new Notification(title, { body, tag: tag || undefined, icon: undefined, renotify: false });
      n.onclick = () => {
        try { window.focus(); } catch (e) { }
        if (S) { if (tab && TABS[tab]) UI.tab = tab; if (cityId && S.cities[cityId] && S.cities[cityId].owner === 'p') UI.city = cityId; render(true); }
        try { n.close(); } catch (e) { }
      };
      return true;
    } catch (e) { return false; }
  };

  const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()); };
  const at = (gameSecsFromNow, fn) => {
    const ms = Math.max(0, gameSecsFromNow / hiddenRate() * 1000) + 750;   // a little slack; background timers may also fire late
    if (ms > MAX_DELAY) return;
    timers.push(setTimeout(fn, ms));
  };
  const placeName = (x, y) => { const t = G.tileAt(S, x, y); return t && t.city ? S.cities[t.city].name : t && t.oasis ? 'an oasis' : `(${x}, ${y})`; };

  const schedule = () => {
    clearTimers();
    if (!S || !enabled()) return 0;
    for (const c of G.citiesOf(S, 'p')) {
      for (const q of c.buildQueue) {
        const end = q.end || (q.start + q.dur);
        if (!(end > S.time)) continue;
        const b = DATA.buildings[q.type];
        at(end - S.time, () => notify(`🔨 ${b.name} level ${q.level} is ready`, `${c.name}: your builders should have finished. Come back to queue the next job.`, 'city', c.id, `ec-b-${c.id}-${q.type}-${q.level}`));
      }
    }
    const R = G.research(S, 'p');
    if (R.active && R.active.end > S.time) {
      const tech = DATA.techs[R.active.id];
      at(R.active.end - S.time, () => notify(`📚 Research complete: ${tech ? tech.name : 'a new technique'}`, 'Your scholars are ready for a new topic.', 'research', R.active.city, `ec-r-${R.active.id}`));
    }
    for (const m of (typeof incoming === 'function' ? incoming() : [])) {
      at(Math.max(0, m.arrive - S.time - 60), () => notify(`⚔️ ${S.empires[m.owner].name} is about to strike`, `Their army reaches ${placeName(m.x, m.y)} within about a minute.`, 'moves', null, `ec-i-${m.id}`));
    }
    const hm = S.moves.find(m => m.owner === 'p' && m.type === 'adventure');
    if (hm) at(hm.arrive - S.time, () => notify('🦸 Adventure report', `${G.hero(S) ? G.hero(S).name : 'Your hero'} has reached the ruins at (${hm.x}, ${hm.y}). See how it went.`, 'reports', null, `ec-a-${hm.id}`));
    for (const p of (S.pending || [])) {
      const left = p.expires - S.time;
      if (left > 120) at(left - 120, () => notify(`📜 ${p.title}`, 'Your decision is still needed — it will be settled for you in about two minutes.', 'city', null, `ec-p-${p.id}`));
    }
    return timers.length;
  };

  // State diffs: catch events that happen while hidden if the world does tick
  // (e.g. a throttled loop). Snapshots update always; notify only when hidden.
  let snap = null;
  const touched = c => G.citiesOf(S, 'p').some(pc => Math.hypot(pc.x - c.x, pc.y - c.y) <= c.r + 1);
  const takeSnap = () => ({
    s: S,
    inc: new Set((typeof incoming === 'function' ? incoming() : []).map(m => m.id)),
    pend: new Set((S.pending || []).map(p => p.id)),
    cal: new Set((S.calamities || []).map(c => c.id)),
    rep: new Set(S.reports.map(r => r.id)),
    tech: Object.keys(G.research(S, 'p').done).length,
    bld: Object.fromEntries(G.citiesOf(S, 'p').map(c => [c.id, c.buildQueue.map(q => q.type + q.level).join(',')])),
  });
  const diff = () => {
    if (!S) { snap = null; return; }
    const prev = snap; snap = takeSnap();
    if (!prev || prev.s !== S || !document.hidden || !enabled()) return;
    for (const m of (typeof incoming === 'function' ? incoming() : [])) if (!prev.inc.has(m.id))
      notify(`⚠️ ${S.empires[m.owner].name} marches on you`, `An army is heading for ${placeName(m.x, m.y)}, arriving in ${fmtTime(realSecs(m.arrive - S.time))}.`, 'moves', null, `ec-in-${m.id}`);
    for (const p of (S.pending || [])) if (!prev.pend.has(p.id))
      notify(`📜 ${p.title}`, 'A decision needs your answer.', 'city', null, `ec-pn-${p.id}`);
    for (const c of (S.calamities || [])) if (!prev.cal.has(c.id) && c.end > S.time && touched(c)) {
      const def = (DATA.calamities || {})[c.kind] || { name: 'A calamity', icon: '⚠️', text: '' };
      notify(`${def.icon} ${def.name} near your lands`, def.text || 'Something stirs near your cities.', 'world', null, `ec-c-${c.id}`);
    }
    for (const r of S.reports) if (!prev.rep.has(r.id) && r.body && r.body.adventure)
      notify(`🦸 ${r.title}`, 'Open Reports to see what your hero found.', 'reports', null, `ec-ar-${r.id}`);
    const tech = Object.keys(G.research(S, 'p').done).length;
    if (tech > prev.tech) notify('📚 Research complete', 'Your scholars are ready for a new topic.', 'research', null, `ec-rd-${tech}`);
    for (const c of G.citiesOf(S, 'p')) {
      const before = (prev.bld[c.id] || '').split(',').filter(Boolean), now = c.buildQueue.map(q => q.type + q.level);
      for (const k of before) if (!now.includes(k)) notify(`🔨 Construction finished in ${c.name}`, 'Your builders are ready for the next job.', 'city', c.id, `ec-bd-${c.id}-${k}`);
    }
  };
  setInterval(() => { try { diff(); } catch (e) { } }, 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { try { diff(); schedule(); } catch (e) { console.error(e); } }
    else { clearTimers(); snap = null; }
  });

  TOP_EXTRAS.push(() => {
    if (!S) return '';
    if (!supported()) return '<button class="small tut-bell" disabled title="This browser does not support notifications">🔕</button>';
    const on = enabled();
    const title = on ? 'Notifications on (only while this tab is hidden). Click to turn off.'
      : Notification.permission === 'denied' ? 'Notifications are blocked for this site in your browser settings.'
      : 'Get a browser notification when builds finish, research completes or enemies approach while this tab is hidden.';
    return `<button class="small tut-bell ${on ? 'on' : ''}" data-act="notifToggle" title="${title}" aria-label="Notifications ${on ? 'on' : 'off'}">${on ? '🔔' : '🔕'}</button>`;
  });

  act.notifToggle = () => {
    if (!supported()) { toast('This browser does not support notifications.'); return; }
    if (enabled()) { setPref(false); clearTimers(); toast('Notifications off.'); render(true); return; }
    if (Notification.permission === 'denied') { toast('Notifications are blocked for this site. Allow them in your browser settings, then try again.'); return; }
    let answered = false;
    const done = p => {
      if (answered || !p) return;
      answered = true;
      if (p === 'granted') { setPref(true); toast('Notifications on. You\'ll hear from us only while this tab is in the background.'); }
      else { setPref(false); toast('Notifications were not allowed.'); }
      render(true);
    };
    try {
      const r = Notification.requestPermission(done);   // older Safari uses the callback form
      if (r && typeof r.then === 'function') r.then(done);
    } catch (e) { toast('Could not ask for notification permission.'); }
  };

  // for testing from the console
  window.ECTut = { STEPS, refresh, schedule, clearTimers, timers, notify, diff, enabled, hiddenRate, get target() { return curTarget; } };
})();
