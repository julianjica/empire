// =====================================================================
//  Ember & Crown — the Guide: a staged, contextual coach for the first
//  hours (coach card + spotlight), and opt-in browser notifications while
//  the tab is hidden. Plugs in through MOUNT_HOOKS, TOP_EXTRAS and act;
//  owns no game rules (rewards go through G.gain into the capital).
//
//  Stages unlock in order (`after`) and/or when the situation calls for
//  them (`when`: a first shortage, a second city, a rival met, a monster
//  in sight, the omens of the crisis…). Each has a short checklist; ticked
//  goals stay ticked, and a finished stage pays a small reward once.
//  State: S.tutorial = { v: 2, stage, done{}, started{}, ticks{}, paid{},
//  vis{}, seenTip, off, min, list, pin } (old saves are migrated).
// =====================================================================
'use strict';

(() => {
  // -------------------------------------------------------------------
  // small helpers
  // -------------------------------------------------------------------
  const $ = sel => document.querySelector('#app ' + sel);
  const tabSel = k => `[data-act="tab"][data-t="${k}"]`;
  // a tab may sit in a collapsed menu group or in the phone's "More" sheet: point at whatever is visible
  const tabTarget = k => {
    const g = typeof groupOfTab === 'function' ? groupOfTab(k) : null;
    return [tabSel(k), g ? `[data-act="navGroup"][data-g="${g.id}"]` : null, '[data-act="navMore"]'].filter(Boolean);
  };
  const safe = f => { try { return f(); } catch (e) { return false; } };
  const lv = (c, b) => G.lvl(c, b);
  const mine = () => G.citiesOf(S, 'p');
  const lvAny = b => mine().reduce((m, c) => Math.max(m, lv(c, b)), 0);
  const queued = (c, b) => c.buildQueue.some(q => q.type === b);
  const queueItem = (c, b) => c.buildQueue.find(q => q.type === b);
  const hasOrQueued = (c, b, L) => !DATA.buildings[b] || lv(c, b) >= L || c.buildQueue.some(q => q.type === b && q.level >= L);
  const builtAny = b => lvAny(b) >= 1;
  const cardByHeading = (scope, tag, prefix) => {
    for (const h of document.querySelectorAll(`#app ${scope} .card ${tag}`)) if (h.textContent.trim().indexOf(prefix) !== -1) return h.closest('.card');
    return null;
  };
  const queueCard = () => cardByHeading('main', 'h3', 'Construction');
  const questCard = () => cardByHeading('.right', 'h4', 'Quests');
  const capital = () => (G.capital ? G.capital(S, 'p') : mine()[0]) || curCity();
  const people = () => DATA.races[S.empires.p.race];
  const waitLeft = (c, b) => { const q = queueItem(c, b); return q ? fmtTime(realSecs((q.end || q.start + q.dur) - S.time)) : ''; };
  const speedHint = '<span class="tut-hint">⏳ This takes game time. Carry on with anything else, or raise the <b>Speed</b> at the top (Space pauses).</span>';
  const onTab = (k, sel, text) => UI.tab === k ? { target: sel, text } : { target: tabTarget(k), text: text + `<p class="tut-hint">👉 Open the <b>${TABS[k] ? TABS[k].label : k}</b> tab.</p>` };
  // a build button, or the queue card while the work is under way
  const buildGo = (c, b, L, what) => {
    if (lv(c, b) < L && queued(c, b)) return onTab('city', queueCard, `<p>${what} is under construction${waitLeft(c, b) ? ` — about <b>${waitLeft(c, b)}</b> to go` : ''}.</p>${speedHint}`);
    let note = '';
    const st = safe(() => G.buildStatus(S, c, b));
    if (st && !st.ok && !st.maxed) {
      if (st.poor) note = '<p class="tut-hint">⏳ Short of some goods — they come in every minute (the top bar shows how fast).</p>';
      else if (st.reason) note = `<p class="tut-hint">Right now: ${esc(st.reason)}.</p>`;
    }
    return onTab('city', `#bld-${b} button[data-act="build"]`, `<p>Press <b>${lv(c, b) ? 'Upgrade' : 'Build'}</b> on the ${what} card.</p>${note}`);
  };
  const playerUnits = (filter) => {
    let n = 0, training = false;
    for (const c of mine()) {
      for (const [u, k] of Object.entries(c.units)) if (u !== 'hero' && (!filter || filter(u))) n += k || 0;
      for (const q of Object.values(c.train || {})) if (q && q.some(it => !filter || filter(it.unit))) training = true;
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
    const camps = S.tiles.filter((t, i) => t.camp && S.explored[i] && S.camps[t.camp] && !S.camps[t.camp].kind);
    const best = nearest(curCity(), camps);
    return best && best.t;
  };
  const nearestFog = () => {
    const best = nearest(curCity(), S.tiles.filter((t, i) => !S.explored[i] && !(DATA.terrain[t.terrain] || {}).impassable));
    return best && best.t;
  };
  const nearestOpen = () => {
    const best = nearest(capital(), S.tiles.filter((t, i) => S.explored[i] && !t.city && !t.camp && !t.minor && !t.oasis && !t.ruin && !(DATA.terrain[t.terrain] || {}).impassable && !(G.isWater && G.isWater(t)) && G.dist(capital(), t) >= 4));
    return best && best.t;
  };
  const selTile = () => UI.sel ? G.tileAt(S, UI.sel.x, UI.sel.y) : null;
  const shortNow = () => {
    for (const c of mine()) {
      if (c.starving) return { c, g: 'grain' };
      for (const [g, on] of Object.entries(c.short || {})) if (on) return { c, g };
    }
    return null;
  };
  const goodName = g => g === 'gold' ? '🪙 gold' : DATA.goods[g] ? `${DATA.goods[g].icon} ${DATA.goods[g].name.toLowerCase()}` : g;
  const rivalMet = () => Object.values(S.cities).some(c => c.owner !== 'p' && S.empires[c.owner] && S.explored[c.y * S.map + c.x]);
  const monsterSeen = () => { if (!S.monsters || !G.monsterVisible) return null; const vis = G.visibleSet(S); return Object.values(S.monsters).find(m => safe(() => G.monsterVisible(S, m, vis))) || null; };
  const crisisNow = () => !!(S.crisisOmen || safe(() => { const ci = G.crisisInfo(S); return ci && ci.status === 'active'; }));
  const weakest = () => {
    const site = safe(() => G.site(S, capital()));
    if (!site) return null;
    return ['grain', 'timber', 'stone', 'ore'].sort((a, b) => site[a] - site[b])[0];
  };
  const visited = (k, since) => { const t = T(); return t.vis && t.vis[k] !== undefined && t.vis[k] >= (since || 0); };
  const MIN = m => m * 60 * (G.pace ? G.pace(S).time : 1);
  const rewardHtml = r => Object.entries(r || {}).map(([g, v]) => `${gIcon(g)} ${fmt(v)}`).join(' ');

  // -------------------------------------------------------------------
  // the stages. goals: [{ text, done(city) → bool, go(city) → { target, text } }]
  // A stage with no goals is read-and-continue ("Got it").
  // -------------------------------------------------------------------
  const STAGES = [
    {
      id: 'welcome', icon: '👑', title: 'Welcome, ruler',
      text: c => `<p>You rule <b>${esc(capital().name)}</b>, the first hamlet of the <b>${esc(S.empires.p.name)}</b> — the ${esc(people().name)}. Grow it into a realm of cities, research, armies, faith and magic, among ${Object.keys(S.empires).length - 1} rival peoples.</p>
        <p>This guide teaches the game in <b>stages</b>, each when you need it: first the economy, then troops, research and new cities; later trade, culture, faith, magic and the Council. Every stage has a short checklist and a small reward.</p>
        <p class="tut-hint">Skip anything you like — the <b>🧭 Guide</b> button at the top brings it back, and <b>❔ How to play</b> has the full rules.</p>`,
    },
    {
      id: 'economy', icon: '🌾', title: 'Goods, workers and upkeep', after: 'welcome', reward: { timber: 120, stone: 80 },
      text: c => `<p>The top bar shows what <b>${esc(c.name)}</b> holds and gains <b>per minute</b>. Grain feeds everyone, timber and stone build, ore becomes iron. Every farm, camp and workshop needs <b>workers</b>; idle citizens pay extra taxes.</p>
        <p>Cities also <b>use</b> goods: firewood (triple in winter), repairs, tools, wages. Unpaid upkeep turns into a <b>shortage</b>.</p>`,
      goals: [
        { key: 'tip', text: 'Hover or tap a good in the top bar to see what makes and uses it', done: () => !!T().seenTip, go: () => ({ target: ['.res-bar .res[data-good="timber"]', '.res-bar .res[data-good]'], text: '<p>Hover (or tap) <b>🪵 Timber</b> in the top bar: what makes it, what eats it, and when it fills up or runs dry.</p>' }) },
        { key: 'farm', text: 'Upgrade the Farm to level 2', done: c => hasOrQueued(c, 'farm', 2), go: c => buildGo(c, 'farm', 2, '🌾 Farm') },
        { key: 'lumber', text: 'Upgrade the Lumber Camp to level 2', done: c => hasOrQueued(c, 'lumber', 2), go: c => buildGo(c, 'lumber', 2, '🪓 Lumber Camp') },
        { key: 'houses', text: 'Upgrade the Houses to level 2 (more people, more workers)', done: c => hasOrQueued(c, 'houses', 2), go: c => buildGo(c, 'houses', 2, '🏘️ Houses') },
      ],
    },
    {
      id: 'shortage', prio: true, icon: '⚠️', title: 'A shortage!', after: 'welcome', when: () => !!shortNow(), reward: { gold: 80 },
      text: () => {
        const s = shortNow() || T().lastShort || {};
        if (s.c) T().lastShort = { c: { name: s.c.name }, g: s.g };
        return `<p>${s.c ? `<b>${esc(s.c.name)}</b> has run out of <b>${goodName(s.g)}</b>. ` : ''}${s.g && G.SHORT_TEXT[s.g] ? esc(G.SHORT_TEXT[s.g]) : 'Upkeep went unpaid for a few minutes.'}</p>
          <p>Fix it by making more (build or upgrade the producer), buying some at a Market, moving it from another city, or using less. The <b>📒 Ledger</b> shows every city's stock and shortages at a glance; its badge counts cities in trouble.</p>`;
      },
      goals: [
        { key: 'ledger', text: 'Open the 📒 Ledger', done: () => !TABS.ledger || visited('ledger', T().started.shortage), go: () => onTab('ledger', null, '<p>The Ledger lists every city with its stocks and what is short.</p>') },
        { key: 'clear', text: 'End the shortage', done: () => !shortNow(), go: () => { const s = shortNow(); return { target: s ? `.res-bar .res[data-good="${s.g}"]` : null, text: '<p>Tap the good in the top bar for its breakdown, then raise what makes it.</p>' }; } },
      ],
    },
    {
      id: 'omen', prio: true, icon: '🌑', title: 'Dark omens', after: 'welcome', when: () => crisisNow(),
      text: () => `<p>Something terrible is coming for <b>every</b> realm. The <b>⚠️ Omens</b> pill in the top bar warns of it; when the crisis breaks it shows its stage and the progress of the <b>rite</b> that ends it.</p>
        <p>Destroy its <b>sources</b> on the map (each +20 to the rite; the pill jumps to the nearest) or give goods to the rite with 🔥 (+5). If time runs out, every city loses people, troops and a building level. Rivals stop their wars while it lasts.</p>`,
    },
    {
      id: 'queue', icon: '🔨', title: 'The building queue', after: 'economy', reward: { grain: 100, gold: 60 },
      text: () => `<p>The queue has <b>no limit</b>. Each work is paid when you queue it and your builders finish them one after another — so line up several before you log off. ✕ cancels a job: full refund if it hasn't started, half if it has.</p>
        <p>The <b>🏛️ Town Hall</b> unlocks buildings (Barracks at 2; Academy, Market and Walls at 3) and builds 5% faster per level. Other buildings can rise to twice the Town Hall's level + 2.</p>`,
      goals: [
        { key: 'q3', text: 'Have 3 works queued at once', done: () => (T().maxQ || 0) >= 3, go: c => onTab('city', queueCard, `<p>Queue more works — ${c.buildQueue.length} in the queue now.</p>`) },
        { key: 'th2', text: 'Queue the Town Hall to level 2', done: c => hasOrQueued(c, 'townhall', 2), go: c => buildGo(c, 'townhall', 2, '🏛️ Town Hall') },
      ],
    },
    {
      id: 'troops', icon: '🛡️', title: 'Troops and a first raid', after: 'queue', reward: { grain: 150, gold: 60 },
      text: () => `<p>Soldiers are trained at the <b>Barracks</b> and come <b>from your people</b> — so keep building Houses. Brigand camps ⛺ around you hold plunder and renown.</p>
        <p>In the World map's send form pick a <b>stance</b>: <b>Balanced</b>; <b>Aggressive</b> (+10% attack, bloodier); <b>Defensive</b> (fewer losses); <b>Skirmish</b> (light losses, good for raids). A <b>raid</b> grabs plunder with lighter losses; an <b>attack</b> fights to the end. The preview shows the odds once you have scouted the camp.</p>`,
      goals: [
        { key: 'barracks', text: 'Build a Barracks (Town Hall 2)', done: () => builtAny('barracks'), go: c => lv(c, 'townhall') < 2 ? buildGo(c, 'townhall', 2, '🏛️ Town Hall (needed first)') : buildGo(c, 'barracks', 1, '🛡️ Barracks') },
        { key: 'train', text: 'Train at least 3 soldiers', done: () => { const p = playerUnits(u => !['scout', 'settlers'].includes(u) && DATA.units[u] && DATA.units[u].type !== 'civ'); return p.n >= 3; }, go: () => onTab('military', 'button[data-act="train"]:not([disabled])', '<p>Pick a unit, set how many and press <b>Train</b>. ⚔️ Weapons come from an Armory later; start with what you can afford.</p>') },
        { key: 'raid', text: 'Raid or attack a brigand camp', done: () => (S.empires.p.wins || 0) > 0 || S.moves.some(m => m.owner === 'p' && ['raid', 'attack'].includes(m.type) && safe(() => G.tileAt(S, m.x, m.y).camp)),
          go: () => {
            const t = selTile();
            if (UI.tab === 'world' && t && t.camp) return UI.mode === 'raid' || UI.mode === 'attack' ? { target: 'button[data-act="send"]', text: '<p>Choose a stance and how many to send, then press <b>Send</b>.</p>' } : { target: 'button[data-act="mode"][data-m="raid"]', text: '<p>Choose <b>Raid</b>.</p>' };
            return { target: UI.tab === 'world' ? '.mapwrap' : tabTarget('world'), show: 'camp', text: '<p>Find a camp ⛺ on the World map and select it.</p>' };
          } },
      ],
    },
    {
      id: 'scouting', icon: '🦅', title: 'Scouts, ruins and auto-explore', after: 'troops', reward: { gold: 80, grain: 80 },
      text: () => `<p>The map is hidden until your cities, armies or scouts see it. Switch on <b>🦅 Auto-explore</b> in a city and its scouts map the unknown on their own (it keeps up to two out). They report only what matters: camps, ruins, oases, rivals.</p>
        <p>Your hero finds treasure, items and experience in <b>ruins</b> 🏚️ — only a hero's <b>adventure</b> can.</p>`,
      goals: [
        { key: 'auto', text: 'Switch on 🦅 Auto-explore in a city', done: () => mine().some(c => safe(() => G.autoExploreOn(S, c.id))) || !G.autoExploreOn,
          go: () => onTab('city', '[data-act="autoExplore"]', `<p>Press the <b>🦅 Auto-explore</b> chip in the city header. It needs a few 🦅 Scouts from the Barracks.</p>`) },
        { key: 'adventure', text: 'Send your hero on an adventure', done: () => { const h = G.hero(S); return !h || h.dead || (S.stats.adventures || 0) >= 1 || S.moves.some(m => m.owner === 'p' && m.type === 'adventure'); },
          go: () => {
            const t = selTile();
            if (UI.tab === 'world' && t && t.ruin) return UI.mode !== 'adventure' ? { target: 'button[data-act="mode"][data-m="adventure"]', text: '<p>Choose <b>🦸 Adventure</b>.</p>' } : { target: 'button[data-act="send"]', text: '<p>Check the hero is in the form, then <b>Send</b>.</p>' };
            return { target: UI.tab === 'world' ? '.mapwrap' : tabTarget('world'), show: 'ruin', text: '<p>Select a ruin 🏚️ on the World map.</p>' };
          } },
      ],
    },
    {
      id: 'research', icon: '📚', title: 'Research', after: 'troops', reward: { gold: 100, stone: 100 },
      text: () => `<p>The <b>Academy</b> (Town Hall 3) opens a tree of techniques over four eras: better yields, faster building, stronger troops, new buildings.</p>
        <p>One topic is studied at a time; the queue is unlimited and each topic is paid when it starts. ★ <b>Recommended</b> topics are a good default; <b>Plan path</b> queues every missing step to a far-off tech. Drag or pinch to move around the tree.</p>`,
      goals: [
        { key: 'th3', text: 'Raise the Town Hall to level 3', done: () => lvAny('townhall') >= 3, go: c => buildGo(c, 'townhall', 3, '🏛️ Town Hall') },
        { key: 'academy', text: 'Build an Academy', done: () => builtAny('academy'), go: c => buildGo(c, 'academy', 1, '📚 Academy') },
        { key: 'study', text: 'Start (or queue) a research topic', done: () => { const R = G.research(S, 'p'); return !!(R.studies && R.studies.length) || !!R.active || Object.keys(R.done).length > 0 || (R.queue || []).length > 0; },
          go: () => onTab('research', ['button[data-act="research"]:not([disabled])', '[data-act="ttQueue"]', '[data-act="ttSel"]'], '<p>Pick a topic (★ marks the recommended ones) and press <b>Research</b>.</p>') },
      ],
    },
    {
      id: 'expansion', icon: '🏕️', title: 'Why a second city', after: 'research', when: () => lvAny('townhall') >= 4 || G.renown(S, 'p') >= 0.6 * G.nextCityRenown(S, 'p'), reward: { gold: 200, tools: 20 },
      text: () => {
        const w = weakest();
        return `<p>Every land is good at something and poor at something. ${w ? `<b>${esc(capital().name)}</b> is poor in <b>${goodName(w)}</b>. ` : ''}A second city in a different region covers what the capital lacks, and adds workers, taxes and renown.</p>
          <p>Select open land on the World map for its <b>site survey</b>: ★ stars per raw good, rivers and lakes (+prosperity), and <b>deposits</b> (rich ore, fine stone, ancient groves, black earth: up to +50%). Then train <b>Settlers</b> (Town Hall 5) and send them there. Your next city needs <b>${G.nextCityRenown(S, 'p')}</b> ⭐ renown.</p>`;
      },
      goals: [
        { key: 'survey', text: 'Look at a site survey of open land', done: () => !!T().surveyed, go: () => { const t = selTile(); return UI.tab === 'world' && !(t && !t.city && !t.camp) ? { target: '.mapwrap', show: 'site', text: '<p>Select an empty land tile; the panel shows its survey.</p>' } : onTab('world', '.mapwrap .card', '<p>Pick an empty tile on the map to read its survey.</p>'); } },
        { key: 'th5', text: 'Raise a Town Hall to level 5', done: () => lvAny('townhall') >= 5, go: c => buildGo(c, 'townhall', 5, '🏛️ Town Hall') },
        { key: 'settlers', text: 'Train Settlers', done: () => { const p = playerUnits(u => u === 'settlers'); return p.n > 0 || p.training || S.moves.some(m => m.owner === 'p' && m.type === 'settle') || mine().length > 1; }, go: () => onTab('military', 'button[data-act="train"][data-u="settlers"]', '<p>Settlers are trained at the Town Hall (600 grain, 600 timber, 500 stone, 400 gold, 20 tools).</p>') },
        { key: 'found', text: 'Found your second city', done: () => mine().length > 1, go: () => onTab('world', '.mapwrap', '<p>Select the land you chose, pick <b>Settle</b> and send the Settlers.</p>') },
      ],
    },
    {
      id: 'network', icon: '🐪', title: 'Two cities that help each other', after: 'welcome', when: () => mine().length > 1, reward: { gold: 150 },
      text: () => `<p>Your cities now <b>cover each other's shortages by caravan, automatically</b>. <b>🔄 Auto-supply</b> is on from the start: each city aims to keep about ten minutes of grain, timber, stone, iron, tools, weapons${{ hearth: ' and bread', grave: ' and bonedust' }[S.empires.p.race] || ''} in store, and a city with a surplus sends carts to one that runs low. The pill in each city header shows what is coming and leaving; tap it to switch the system off or on.</p>
        <p>Only a city with a <b>Market</b> can <b>send</b> goods (more carts at higher levels); any city can receive. Tune targets per good in the <b>📒 Ledger › Supply lines</b> (minutes of use or a fixed stock, auto-sell, auto-buy). Trade routes to rivals and free cities are on the ⚖️ Market tab; carts near camps or enemy armies risk ambush.</p>`,
      goals: [
        { key: 'ledger', text: 'Open the 📒 Ledger', done: () => !TABS.ledger || visited('ledger'), go: () => onTab('ledger', null, '<p>Every city, every good, one table — and the Supply lines view.</p>') },
        { key: 'market', text: 'Build a Market so a city can send carts', done: () => builtAny('market'), go: c => buildGo(c, 'market', 1, '⚖️ Market') },
        { key: 'supply', text: 'Look at Ledger › Supply lines (targets per good)', done: () => !!T().sawSupply || !G.logistics, go: () => onTab('ledger', ['[data-act="lgView"][data-v="supply"]', '[data-act="lgView"]'], '<p>Open the <b>Supply lines</b> view to see and tune the targets.</p>') },
      ],
    },
    {
      id: 'rival', prio: true, icon: '🕊️', title: 'Neighbours', after: 'welcome', when: () => rivalMet(), reward: { gold: 60 },
      text: () => `<p>You have found a rival realm. Rivals leave newcomers alone for a while, then their pressure grows. On <b>🕊️ Diplomacy</b> you can send gifts, make peace or an alliance, demand tribute from the weak, and accept <b>foreign merchants</b>' offers.</p>
        <p>Later: <b>🕵️ Espionage</b> (spies, sabotage, counter-intelligence) and <b>🏰 Free Cities</b> (neutral city-states you can court, trade with or conquer).</p>`,
      goals: [{ key: 'diplo', text: 'Open 🕊️ Diplomacy', done: () => visited('diplomacy'), go: () => onTab('diplomacy', null, '<p>Each realm shows its opinion of you and your options.</p>') }],
    },
    {
      id: 'monster', prio: true, icon: '🐺', title: 'Something roams the wilds', after: 'welcome', when: () => !!monsterSeen(),
      text: () => { const m = monsterSeen(); return `<p>${m ? `Your lookouts have spotted <b>${esc(G.monsterUnitName ? G.monsterUnitName(m, G.monsterCount(m)) : 'monsters')}</b>. ` : ''}Monsters wander the map: herds migrate with the seasons, trolls and giants lurk in the hills, griffons fly, serpents swim and werewolves hunt at night.</p>
        <p>Select one on the World map to see its strength; send an <b>attack</b> or <b>raid</b> to hunt it for loot and renown — or keep out of its way. Garrisons protect cities it passes.</p>`; },
    },
    {
      id: 'culture', icon: '🎭', title: 'Happiness, culture and traditions', after: 'troops', when: () => (S.empires.p.culture || 0) >= 80 || S.time > MIN(45), reward: { gold: 80 },
      text: () => `<p>Each city has a <b>mood</b>: taverns, temples, bread, low taxes and your hero raise it; crowding, war, famine and high taxes lower it. Jubilant cities produce more; unhappy ones less, and can revolt.</p>
        <p>Cities also make <b>culture</b>, spent on <b>traditions</b> — lasting bonuses in a web of 9 pillars plus your people's birthrights. Some come in pairs: picking one forsakes the other.</p>`,
      goals: [
        { key: 'culture', text: 'Open 🎭 Culture', done: () => !TABS.culture || visited('culture'), go: () => onTab('culture', null, '<p>Moods, tax policy and the tradition web.</p>') },
        { key: 'trad', text: 'Adopt your first tradition', done: () => (S.empires.p.traditions || []).length > 0, go: () => onTab('culture', ['[data-act="adoptTradition"]:not([disabled])', '.tw-host'], '<p>Pick a glowing tradition in the web and adopt it.</p>') },
      ],
    },
    {
      id: 'council', icon: '🏛️', title: 'The Council and governors', after: 'troops', when: () => mine().length > 1 || S.time > MIN(60), reward: { gold: 80 },
      text: () => `<p>Five advisors watch your realm and say what needs doing — the <b>🏛️ Council</b> chip in the top bar counts the urgent items, and many have a one-click fix.</p>
        <p>A <b>governor</b> can run a city for you with a focus (growth, production, military, faith, magic): it queues works, keeps a gold reserve and can hold a garrison. Handy for quiet cities.</p>`,
      goals: [
        { key: 'council', text: 'Open the 🏛️ Council', done: () => !TABS.council || visited('council'), go: () => onTab('council', null, '<p>Advice by advisor, most urgent first.</p>') },
        { key: 'gov', text: 'Give a city a governor', done: () => !G.councilState || Object.values(safe(() => G.councilState(S).gov) || {}).some(g => g && g.on), go: () => onTab('council', null, '<p>Pick a focus for a city in the governors list (✋ Manual means off).</p>') },
      ],
    },
    {
      id: 'faith', icon: '⛪', title: 'Faith', after: 'troops', when: () => builtAny('temple') || builtAny('shrine') && S.time > MIN(70) || (S.empires.p.faith || 0) >= 100, reward: { gold: 100 },
      text: () => `<p>Shrines and Temples gather <b>faith</b>. With a Temple and 150 faith you can <b>found</b> a religion — a god and two tenets — or <b>adopt</b> a neighbour's for 40.</p>
        <p>Faith spreads between nearby cities; <b>priests</b> carry it further. Spend faith on <b>miracles</b> (a blessed harvest, banishing a calamity, a crusade…). In Conquest, a faith held by most of the world wins the game.</p>`,
      goals: [
        { key: 'faith', text: 'Open ⛪ Faith', done: () => !TABS.religion || visited('religion'), go: () => onTab('religion', null, '<p>Your faith, the world\'s faiths, priests and miracles.</p>') },
        { key: 'found', text: 'Found or adopt a faith', done: () => !!S.empires.p.faithId, go: () => onTab('religion', ['[data-act="relFound"]:not([disabled])', '[data-act="relAdopt"]:not([disabled])'], '<p>Found your own when you can, or adopt one.</p>') },
      ],
    },
    {
      id: 'generals', icon: '🎖️', title: 'Generals and stances', after: 'troops', when: () => lvAny('barracks') >= 3, reward: { gold: 100 },
      text: () => `<p>Besides your hero, a realm appoints <b>generals</b> (Barracks 3). Each leads a march for +1.5% per level and has traits; they cost a little gold every minute, and more of them as the realm grows.</p>
        <p>Every city also has a <b>garrison stance</b>: <b>Hold the walls</b> (+8% defence, fewer losses), <b>Sally out</b> (punishing pursuit) or <b>Evacuate stores</b> (hide more goods).</p>`,
      goals: [{ key: 'general', text: 'Recruit a general', done: () => !G.generalsOf || G.generalsOf(S, 'p').length > 0, go: () => onTab('military', ['[data-act="genRecruit"]:not([disabled])', '[data-act="genRecruit"]'], '<p>Recruit one on the Military tab.</p>') }],
    },
    {
      id: 'magic', icon: '🔮', title: 'Magic', after: 'research', when: () => builtAny('magetower') || (lvAny('townhall') >= 4 && builtAny('academy') && S.time > MIN(80)), reward: { gold: 100 },
      text: () => `<p>A <b>Mage Tower</b> (Town Hall 4, Academy 1) makes <b>mana</b>, more on <b>ley nodes</b>. You know your people's school of magic, and your faith's god adds another.</p>
        <p>Spells need a tower of level 1, 5, 10 or 15. Each cast adds <b>strain</b>; above 60, wild magic can open demon rifts. The <b>Great Working</b> is an arcane victory.</p>`,
      goals: [
        { key: 'tower', text: 'Build a Mage Tower', done: () => builtAny('magetower'), go: c => buildGo(c, 'magetower', 1, '🔮 Mage Tower') },
        { key: 'cast', text: 'Cast a spell', done: () => (S.stats.spells || 0) > 0, go: () => onTab('magic', '[data-act="mgCast"]:not([disabled])', '<p>Pick a spell in the spellbook and cast it.</p>') },
      ],
    },
    {
      id: 'wrap', icon: '🧭', title: 'You know the essentials', after: 'expansion',
      text: () => `<p>That's the heart of the game. More stages appear as you meet them (faith, magic, generals, monsters, the crisis). The <b>🎯 Quests</b> in the side column always suggest a next goal, and <b>❔ How to play</b> explains every system — tap the <b>?</b> in any tab's header.</p><p>Good luck, ${esc(people().name)} ruler!</p>`,
    },
  ];
  const byId = id => STAGES.find(s => s.id === id);
  const CORE = STAGES.filter(s => !s.when).length;

  // -------------------------------------------------------------------
  // state
  // -------------------------------------------------------------------
  const T = () => S && S.tutorial;
  const fresh = () => ({ v: 2, stage: STAGES[0].id, done: {}, started: { welcome: S ? S.time : 0 }, ticks: {}, paid: {}, vis: {}, off: false, min: false, list: false, pin: null });
  const migrate = t => {
    if (t.v === 2) return t;
    const n = fresh();
    if (t.done || t.skipped) { n.off = !!t.skipped; for (const s of STAGES) if (!s.when) n.done[s.id] = 'old'; }
    else if (t.step && t.step !== 'welcome') { n.done.welcome = 'old'; }
    n.min = !!t.min;
    return n;
  };
  let flash = null;            // { text, at } shown on the card after a stage completes
  let lastScrollKey = '';
  if (G.newGameHooks) G.newGameHooks.push(s => { if (!s.tutorial) s.tutorial = { v: 2, stage: 'welcome', done: {}, started: { welcome: 0 }, ticks: {}, paid: {}, vis: {}, off: false, min: false, list: false, pin: null }; });
  const ensure = () => {
    if (!S) return null;
    if (!S.tutorial) { if (S.time < 60 && !S.gameOver) S.tutorial = fresh(); else return null; }
    S.tutorial = migrate(S.tutorial);
    const t = S.tutorial;
    for (const k of ['done', 'started', 'ticks', 'paid', 'vis']) t[k] = t[k] || {};
    return t;
  };
  const finished = id => !!T().done[id];
  const unlocked = (st, city) => !finished(st.id) && (!st.after || finished(st.after) || !byId(st.after)) && (T().started[st.id] !== undefined || !st.when || !!safe(() => st.when(city)));
  const goalDone = (st, i, city) => {
    const key = st.id + '.' + (st.goals[i].key || i);
    if (T().ticks[key]) return true;
    if (safe(() => st.goals[i].done(city))) { const t = T(); t.ticks[key] = 1; (t.prog = t.prog || {})[st.id] = S.time; return true; }
    return false;
  };
  const allDone = (st, city) => (st.goals || []).length > 0 && st.goals.every((g, i) => goalDone(st, i, city));
  // Urgent situations first (prio). Otherwise the first open stage in order — but one that has made no
  // progress for a while (waiting on a long build, say) is parked so the next open stage can teach meanwhile;
  // parked stages come back as soon as any stage finishes.
  const current = city => {
    const t = T();
    if (t.pin && byId(t.pin)) return byId(t.pin);
    const open = STAGES.filter(st => unlocked(st, city));
    if (!open.length) return null;
    const park = t.park = t.park || {};
    const cand = open.find(st => st.prio && !park[st.id]) || open.find(st => !park[st.id]) || open[0];
    const since = Math.max(t.started[cand.id] !== undefined ? t.started[cand.id] : S.time, (t.prog || {})[cand.id] || 0);
    const next = open.find(o => o !== cand && !park[o.id]);
    if (next && S.time - since > MIN(12)) { park[cand.id] = S.time; return next; }
    return cand;
  };
  const pay = st => {
    const t = T();
    if (!st.reward || t.paid[st.id]) return '';
    const cap = capital(); if (!cap) return '';
    G.gain(S, cap, st.reward); t.paid[st.id] = 1;
    G.log(S, 'p', `Guide: “${st.title}” complete — ${Object.entries(st.reward).map(([g, v]) => `${v} ${g === 'gold' ? 'gold' : DATA.goods[g] ? DATA.goods[g].name.toLowerCase() : g}`).join(', ')} delivered to ${cap.name}.`, 'good');
    return rewardHtml(st.reward);
  };
  const finish = (st, how) => {
    const t = T();
    t.done[st.id] = how;
    t.park = {};
    const r = how === 'done' ? pay(st) : '';
    if (t.pin === st.id) t.pin = null;
    if (how === 'done') flash = { text: `✓ ${st.title} — done!${r ? ` Reward: ${r}` : ''}`, at: Date.now() };
  };
  // watch the game: visited tabs, the resource tooltip, the longest queue, a site survey; finish stages whose goals are met
  const observe = city => {
    const t = T();
    t.vis[UI.tab] = S.time;
    if (UI.resTip) t.seenTip = 1;
    if (UI.tab === 'ledger' && UI.lg && UI.lg.view === 'supply') t.sawSupply = 1;
    t.maxQ = Math.max(t.maxQ || 0, ...mine().map(c => c.buildQueue.length));
    const sel = selTile();
    if (UI.tab === 'world' && sel && !sel.city && !sel.camp && !sel.minor && S.explored[sel.y * S.map + sel.x] && !(G.isWater && G.isWater(sel))) t.surveyed = 1;
    for (const st of STAGES) if (!finished(st.id) && t.started[st.id] !== undefined && allDone(st, city)) finish(st, 'done');
  };

  // -------------------------------------------------------------------
  // DOM: coach card + spotlight (both outside #app so re-renders keep them)
  // -------------------------------------------------------------------
  let coach = null, spot = null, coachHtml = '';
  const ensureDom = () => {
    if (!coach) { coach = document.createElement('div'); coach.id = 'tut-coach'; coach.className = 'tut-coach'; coach.setAttribute('role', 'dialog'); coach.setAttribute('aria-label', 'Guide'); coach.setAttribute('aria-live', 'polite'); document.body.appendChild(coach); }
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
  let curTarget = null, curView = null;
  const showing = () => { const t = T(); return !!(t && !t.off && !t.min && !t.list && coach && coach.classList.contains('on')); };

  const placeSpot = () => {
    if (!spot) return;
    const el = curTarget && curTarget.el;
    if (!el || !el.isConnected || !showing()) { spot.classList.remove('on'); return; }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { spot.classList.remove('on'); return; }
    const pad = 5;
    Object.assign(spot.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
    spot.classList.add('on');
  };

  const maybeScroll = (el, key) => {
    if (!el || key === lastScrollKey) return;
    lastScrollKey = key;
    if (el.closest && el.closest('.nav-bar, .top-1, .nav-sheet')) return;   // fixed bars are always on screen
    const r = el.getBoundingClientRect();
    const coachTop = coach && coach.classList.contains('on') ? coach.getBoundingClientRect().top : innerHeight;
    const bottomLimit = innerWidth <= 700 ? Math.min(innerHeight, coachTop) : innerHeight;
    if (r.top < 0 || r.bottom > bottomLimit) {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { el.scrollIntoView(); }
      if (innerWidth <= 700 && el.getBoundingClientRect().bottom > bottomLimit) window.scrollBy(0, el.getBoundingClientRect().bottom - bottomLimit + 24);
    }
  };

  const hide = () => { if (coach) coach.classList.remove('on'); curTarget = null; placeSpot(); };
  const listHtml = city => {
    const t = T();
    const row = st => {
      const d = t.done[st.id], cur = !d && unlocked(st, city);
      const status = d ? (d === 'done' ? '✓' : '–') : cur ? '●' : '○';
      const hint = d ? (d === 'done' ? (st.reward && t.paid[st.id] ? 'done · reward paid' : 'done') : d === 'old' ? 'done' : 'skipped')
        : cur ? 'ready' : st.when ? 'appears when the time comes' : `after “${(byId(st.after) || {}).title || ''}”`;
      return `<li class="${d ? 'past' : cur ? 'cur' : ''}"><span class="tut-li-s" aria-hidden="true">${status}</span><span class="tut-li-t">${st.icon} ${st.title}<small class="muted">${hint}</small></span>${d || cur ? `<button class="small" data-act="tutPin" data-s="${st.id}">${d ? 'Replay' : 'Open'}</button>` : ''}</li>`;
    };
    const n = STAGES.filter(s => t.done[s.id]).length;
    return `<div class="tut-head"><span class="tut-step">🧭 Guide · ${n}/${STAGES.length} stages</span><span class="tut-sp"></span><button class="tut-x" data-act="tutMin" title="Minimise" aria-label="Minimise the guide">–</button></div>
      <h4 class="tut-title">All stages</h4><ol class="tut-list">${STAGES.map(row).join('')}</ol>
      <div class="tut-actions"><button class="small" data-act="helpGo" data-s="">❔ How to play</button><span class="tut-sp"></span><button class="small primary" data-act="tutList">Back</button></div>
      <div class="tut-foot"><button class="link" data-act="tutOff">${t.off ? 'Guide is off' : 'Turn the guide off'}</button><button class="link" data-act="tutorialRestart">Start over</button></div>`;
  };

  const refresh = () => {
    ensureDom();
    if (!S || S.gameOver || !mine().length) { hide(); return; }
    const t = ensure();
    if (!t) { hide(); return; }
    const city = curCity();
    observe(city);
    const st = current(city);
    if (st && t.started[st.id] === undefined) {
      t.started[st.id] = S.time;
      if (t.min || t.off) t.fresh = st.id;    // the 🧭 button shows a dot for a new stage
      if (!t.off && st.when) { t.min = false; lastScrollKey = ''; }   // a situation stage opens itself
    }
    if (t.stage !== (st && st.id)) { t.stage = st ? st.id : null; lastScrollKey = ''; }
    if (t.off && !t.list) { hide(); return; }
    let html, target = null;
    if (t.list) html = listHtml(city);
    else if (!st) { hide(); return; }
    else if (t.min) html = `<button class="tut-pill ${t.fresh ? 'new' : ''}" data-act="tutOpen" title="Open the guide">${st.icon} Guide · ${esc(st.title)}</button>`;
    else {
      t.fresh = null;
      const goals = st.goals || [];
      const firstOpen = goals.findIndex((g, i) => !goalDone(st, i, city));
      const v = firstOpen >= 0 ? (safe(() => goals[firstOpen].go(city)) || {}) : {};
      target = v.target || null; curView = v;
      const body = safe(() => st.text(city)) || '';
      const showBtn = v.show === 'ruin' ? '<button class="small" data-act="tutShow" data-w="ruin">Show me a ruin</button>'
        : v.show === 'camp' ? '<button class="small" data-act="tutShow" data-w="camp">Show me a camp</button>'
        : v.show === 'site' ? '<button class="small" data-act="tutShow" data-w="site">Show me open land</button>' : '';
      const mainBtn = goals.length ? `<button class="small" data-act="tutSkipStage" title="Mark this stage done without its reward">Skip stage</button>` : `<button class="small primary" data-act="tutGotIt">Got it</button>`;
      const fl = flash && Date.now() - flash.at < 6000 ? `<div class="tut-flash">${flash.text}</div>` : '';
      html = `<div class="tut-head"><span class="tut-step">🧭 Guide · ${STAGES.filter(x => T().done[x.id]).length}/${STAGES.length} stages done</span><span class="tut-sp"></span><button class="tut-x" data-act="tutList" title="All stages" aria-label="All stages">☰</button><button class="tut-x" data-act="tutMin" title="Minimise" aria-label="Minimise the guide">–</button></div>
        ${fl}
        <h4 class="tut-title">${st.icon} ${st.title}</h4>
        <div class="tut-body">${body}</div>
        ${goals.length ? `<ul class="tut-goals">${goals.map((g, i) => { const ok = goalDone(st, i, city); return `<li class="${ok ? 'ok' : i === firstOpen ? 'next' : ''}"><span aria-hidden="true">${ok ? '✓' : '○'}</span>${g.text}</li>`; }).join('')}</ul>` : ''}
        ${firstOpen >= 0 && v.text ? `<div class="tut-now">${v.text}</div>` : ''}
        ${st.reward ? `<div class="tut-reward">🎁 Reward: ${rewardHtml(st.reward)}</div>` : ''}
        <div class="tut-actions">${showBtn}<span class="tut-sp"></span>${mainBtn}</div>
        <div class="tut-foot"><button class="link" data-act="tutOff">Turn the guide off</button><button class="link" data-act="tutList">All stages</button></div>`;
    }
    coach.classList.toggle('min', !!t.min && !t.list);
    coach.classList.toggle('list', !!t.list);
    if (html !== coachHtml) { coach.innerHTML = html; coachHtml = html; }
    coach.classList.add('on');
    curTarget = !t.min && !t.list && target ? resolveTargets(target) : null;
    if (curTarget) maybeScroll(curTarget.el, t.stage + '|' + curTarget.key + '|' + UI.tab);
    placeSpot();
  };

  MOUNT_HOOKS.push(() => refresh());
  // a glance at a good's breakdown counts, however short
  for (const ev of ['pointerover', 'click', 'focusin']) document.addEventListener(ev, e => { if (S && S.tutorial && e.target && e.target.closest && e.target.closest('.top [data-good]')) S.tutorial.seenTip = 1; }, true);
  // render(false) can replace .top without running the mount hooks, and the page scrolls/reflows,
  // so keep re-checking on a timer too (cheap).
  setInterval(() => { try { refresh(); } catch (e) { console.error(e); } }, 1000);
  setInterval(() => { if (curTarget && curTarget.el && !curTarget.el.isConnected && showing()) curTarget = curView ? resolveTargets(curView.target) : null; placeSpot(); }, 250);
  window.addEventListener('resize', placeSpot);
  window.addEventListener('scroll', placeSpot, true);

  TOP_EXTRAS.push(() => {
    if (!S) return '';
    const t = S.tutorial;
    const dot = t && t.v === 2 && t.fresh && (t.min || t.off);
    return `<button class="small tut-q ${dot ? 'new' : ''}" data-act="tutOpen" title="${dot ? 'The guide has a new stage for you' : 'Guide: step-by-step help for what you are doing now'}" aria-label="Guide${dot ? ' (new stage)' : ''}">🧭<span class="tut-q-l"> Guide</span></button>`;
  });

  const goTile = (t, m, c) => act.goTile({ x: t.x, y: t.y, m, c });
  Object.assign(act, {
    tutGotIt: () => { const st = current(curCity()); if (st) finish(st, 'done'); lastScrollKey = ''; refresh(); },
    tutSkipStage: () => { const st = current(curCity()); if (st) finish(st, 'skipped'); lastScrollKey = ''; refresh(); },
    tutOff: () => { const t = ensure(); if (!t) return; t.off = true; t.list = false; t.pin = null; refresh(); render(true); toast('Guide off. The 🧭 Guide button at the top brings it back.'); },
    tutorialRestart: () => { if (!S) return; S.tutorial = fresh(); lastScrollKey = ''; flash = null; refresh(); render(true); },
    tutMin: () => { const t = ensure(); if (t) { t.min = true; t.list = false; refresh(); } },
    tutList: () => { if (!S) return; const t = ensure() || (S.tutorial = fresh()); if (t) { t.list = !t.list; t.min = false; refresh(); } },
    tutPin: d => { const t = ensure(); if (!t) return; if (t.done[d.s]) { delete t.done[d.s]; for (const k of Object.keys(t.ticks)) if (k.startsWith(d.s + '.')) delete t.ticks[k]; } t.pin = d.s; t.started[d.s] = t.started[d.s] !== undefined ? t.started[d.s] : S.time; t.list = false; t.min = false; t.off = false; lastScrollKey = ''; refresh(); render(true); },
    tutOpen: () => {
      if (!S) return;
      const t = ensure() || (S.tutorial = fresh());
      const wasOff = t.off;
      t.off = false; t.min = false; t.fresh = null;
      if (!current(curCity())) t.list = true;   // nothing waiting: show the list of stages
      lastScrollKey = ''; refresh(); if (wasOff) render(true);
    },
    tutShow: d => {
      if (d.w === 'site') { const t = nearestOpen(); if (!t) { toast('No open land in sight yet — explore further.'); return; } goTile(t, 'settle'); return; }
      let t = d.w === 'camp' ? nearestCamp() : nearestRuin();
      if (!t && d.w === 'camp' && (t = nearestFog())) toast('No camps in sight yet — scouting the fog nearby is how you find them.');
      if (!t) { toast(d.w === 'camp' ? 'No camps discovered yet — scouts and armies reveal more of the map.' : 'No ruins discovered yet — explore with scouts.'); return; }
      const hc = heroCity();
      goTile(t, d.w === 'camp' ? 'raid' : 'adventure', d.w === 'camp' ? undefined : hc && hc.id);
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
    for (const x of R.studies || []) {
      if (!(x.end > S.time)) continue;
      const tech = DATA.techs[x.id];
      at(x.end - S.time, () => notify(`📚 Research complete: ${tech ? tech.name : 'a new technique'}`, 'Your scholars are ready for a new topic.', 'research', x.city, `ec-r-${x.id}`));
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
  window.ECTut = { STAGES, current: () => S && ensure() ? current(curCity()) : null, refresh, schedule, clearTimers, timers, notify, diff, enabled, hiddenRate, get target() { return curTarget; } };
})();
