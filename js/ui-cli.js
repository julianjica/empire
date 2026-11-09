// =====================================================================
//  Ember & Crown — keyboard console and keyboard navigation (UI side).
//  The grammar lives in js/cli.js (G.cli); this file draws the console, keeps
//  history, completes names, applies the view changes a command asks for, and adds
//  keys to the regular UI: ` or : opens the console, Ctrl/Cmd+K the palette, ? lists
//  every shortcut, / focuses a search box, g+letter jumps to a tab, arrows and Enter
//  move around the world map. ui-core.js keeps 1–9, [ ], Space, + − and Esc.
//  Everything lives on <body>, outside #app, so the per-second render leaves it alone.
// =====================================================================
'use strict';

(function () {
  if (!G.cli) return;
  const HIST_KEY = 'emberCrown_cliHistory';
  const DOCK_KEY = 'emberCrown_cliDock';
  const HIST_MAX = 200, OUT_MAX = 600;
  const CLI = { open: false, mode: 'console', hist: [], hi: -1, draft: '', tab: null, sug: [], sel: 0, ctx: {}, dock: 'bottom' };
  try { const h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); if (Array.isArray(h)) CLI.hist = h.filter(x => typeof x === 'string').slice(-HIST_MAX); } catch (e) { }
  try { const d = localStorage.getItem(DOCK_KEY); if (d === 'right' || d === 'bottom') CLI.dock = d; } catch (e) { }
  const saveHist = () => { try { localStorage.setItem(HIST_KEY, JSON.stringify(CLI.hist.slice(-HIST_MAX))); } catch (e) { } };
  const isTyping = el => !!el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  const e$ = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------
  let root = null, outEl = null, inEl = null, sugEl = null, hintEl = null;
  const build = () => {
    if (root) return;
    root = document.createElement('div');
    root.id = 'ecCli';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Command console');
    root.innerHTML = `<div class="cli-hd"><b>⌨️ Console</b><span class="cli-tips">Tab completes · ↑↓ history · Enter runs · Esc closes · <code>help</code></span>
        <span class="cli-sp"></span><button type="button" class="small cli-dock" title="Dock to the ${CLI.dock === 'bottom' ? 'right' : 'bottom'}" aria-label="Move the console">⇄</button><button type="button" class="small cli-x" title="Close (Esc)" aria-label="Close the console">✕</button></div>
      <div class="cli-out" role="log" aria-live="polite" tabindex="-1"></div>
      <ul class="cli-sug" role="listbox" id="ecCliSug" hidden></ul>
      <div class="cli-hint" aria-live="polite"></div>
      <label class="cli-in"><span class="cli-prompt" aria-hidden="true">›</span><input type="text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command" aria-autocomplete="list" aria-controls="ecCliSug" placeholder="type a command — help, build farm, train 5 militia, send all to Oakford…"></label>`;
    document.body.appendChild(root);
    outEl = root.querySelector('.cli-out'); inEl = root.querySelector('input'); sugEl = root.querySelector('.cli-sug'); hintEl = root.querySelector('.cli-hint');
    root.querySelector('.cli-x').addEventListener('click', () => close());
    root.querySelector('.cli-dock').addEventListener('click', () => {
      CLI.dock = CLI.dock === 'bottom' ? 'right' : 'bottom';
      try { localStorage.setItem(DOCK_KEY, CLI.dock); } catch (e) { }
      root.querySelector('.cli-dock').title = `Dock to the ${CLI.dock === 'bottom' ? 'right' : 'bottom'}`;
      layout(); inEl.focus();
    });
    inEl.addEventListener('keydown', onKey);
    inEl.addEventListener('input', () => { CLI.tab = null; CLI.hi = -1; suggest(); });
    sugEl.addEventListener('mousedown', ev => ev.preventDefault());
    sugEl.addEventListener('click', ev => { const li = ev.target.closest('li[data-i]'); if (li) { applySug(+li.dataset.i); inEl.focus(); } });
    root.addEventListener('pointerdown', () => { UI.holding = true; });
    root.addEventListener('pointerup', () => { setTimeout(() => { UI.holding = false; }, 0); });
    print([`Ember & Crown console. Type help for every command; Tab completes names. Esc closes, \` or Ctrl+K opens.`], 'cli-sys');
  };
  const layout = () => {
    if (!root) return;
    root.classList.toggle('on', CLI.open);
    root.classList.toggle('cli-palette', CLI.mode === 'palette');
    root.classList.toggle('cli-right', CLI.dock === 'right' && CLI.mode !== 'palette');
    const h = document.documentElement;
    h.classList.toggle('ec-cli-open', CLI.open && CLI.mode !== 'palette');
    h.classList.toggle('ec-cli-right', CLI.open && CLI.mode !== 'palette' && CLI.dock === 'right');
  };
  const print = (lines, cls) => {
    if (!outEl) return;
    const frag = document.createDocumentFragment();
    for (const l of lines) { const d = document.createElement('div'); d.className = 'cli-l ' + (cls || ''); d.textContent = l === '' ? ' ' : l; frag.appendChild(d); }
    outEl.appendChild(frag);
    while (outEl.childNodes.length > OUT_MAX) outEl.removeChild(outEl.firstChild);
    outEl.scrollTop = outEl.scrollHeight;
  };

  const open = (mode = 'console', text) => {
    build();
    CLI.open = true; CLI.mode = mode;
    if (UI.pop) { UI.pop = null; try { renderPop(); } catch (e) { } }
    closeKeys();
    layout();
    if (text !== undefined) inEl.value = text;
    if (mode === 'palette') inEl.value = text || '';
    inEl.focus();
    suggest();
  };
  const close = () => {
    if (!root) return;
    CLI.open = false; hideSug(); layout();
    if (document.activeElement === inEl) inEl.blur();
  };
  window.ecCli = { open, close, run: line => run(line) };

  // ---------------------------------------------------------------
  // context and running
  // ---------------------------------------------------------------
  const ctx = () => {
    const c = CLI.ctx;
    if (S && S.cities[UI.city]) c.city = UI.city;
    c.tabs = Object.keys(TABS).map(k => ({ id: k, name: String(TABS[k].label || k).replace(/<[^>]+>/g, '') }));
    return c;
  };
  const applyNav = nav => {
    if (!nav) return;
    if (nav.clear && outEl) outEl.innerHTML = '';
    if (nav.close) close();
    if (nav.city && S.cities[nav.city]) UI.city = nav.city;
    if (nav.sel) UI.sel = { x: nav.sel.x, y: nav.sel.y };
    if (nav.tab && TABS[nav.tab]) { UI.tab = nav.tab; UI.navMore = false; }
    if (nav.pause !== undefined) {
      const want = nav.pause === 'toggle' ? !UI.paused : !!nav.pause;
      if (want !== UI.paused) togglePause();
    }
    if (nav.report) { UI.openReport = nav.report; }
  };
  // the start screen (no game yet): a tiny grammar of its own
  const runStart = line => {
    const w = line.trim().split(/\s+/), k = (w[0] || '').toLowerCase(), rest = w.slice(1).join(' ');
    if (k === 'help' || k === '?') return { ok: true, out: ['Before the game starts:', '  race <people>        pick your people (' + DATA.raceOrder.join(', ') + ')', '  set <option> <value> pace quick|standard|long · mode conquest|endless · difficulty … · rivals 1-5 · world …', '  name <realm name>    name your realm', '  begin                found your realm', '  load <slot>          load a saved game'] };
    if (k === 'race' || k === 'people') {
      const r = G.cli.match(rest, DATA.raceOrder.map(id => ({ id, name: DATA.races[id].name, alt: [DATA.races[id].adj] })));
      if (!r.hit) return { ok: false, err: `No people called '${rest}'. ${DATA.raceOrder.join(', ')}` };
      act.pickRace({ r: r.hit.id }); return { ok: true, out: [`You lead the ${DATA.races[r.hit.id].name}.`] };
    }
    if (k === 'set') { const [opt, v] = [(w[1] || '').toLowerCase(), (w[2] || '').toLowerCase()]; if (!(opt in UI.start)) return { ok: false, err: `Options: ${Object.keys(UI.start).join(', ')}` }; act.startOpt({ k: opt, v }); return { ok: true, out: [`${opt} = ${v}`] }; }
    if (k === 'name') { UI.start.name = rest; renderStart(); return { ok: true, out: [`Your realm: ${rest}`] }; }
    if (k === 'begin' || k === 'found' || k === 'start' || k === 'play') { act.begin(); return { ok: true, out: [`${S ? S.empires.p.name + ' is founded. Type status, build farm, help…' : 'Could not start.'}`] }; }
    if (k === 'load') { act.loadSlot({ n: rest || '1' }); return { ok: true, out: [S ? 'Loaded.' : 'Nothing loaded.'] }; }
    return { ok: false, err: `No game yet. Type: race <people>, then begin (help lists more).` };
  };
  const run = line => {
    line = String(line || '').trim();
    build();
    print(['› ' + line], 'cli-cmd');
    if (line) { if (CLI.hist[CLI.hist.length - 1] !== line) CLI.hist.push(line); if (CLI.hist.length > HIST_MAX) CLI.hist.shift(); saveHist(); }
    CLI.hi = -1; CLI.draft = '';
    let r;
    try { r = S ? G.cli.exec(S, 'p', line, ctx()) : runStart(line); }
    catch (e) { console.error(e); r = { ok: false, out: [], err: 'Something went wrong: ' + (e && e.message) }; }
    if (r.nav && r.nav.clear && outEl) { outEl.innerHTML = ''; r.nav.clear = false; }
    if (r.out && r.out.length) print(r.out, r.confirm ? 'cli-ask' : '');
    if (r.err) print([r.err], 'cli-err');
    if (S) {
      if (CLI.ctx.city && S.cities[CLI.ctx.city] && S.cities[CLI.ctx.city].owner === 'p') UI.city = CLI.ctx.city;
      applyNav(r.nav);
      try { render(true); } catch (e) { console.error(e); }
    }
    return r;
  };

  // ---------------------------------------------------------------
  // suggestions and Tab completion
  // ---------------------------------------------------------------
  const hideSug = () => { if (sugEl) { sugEl.hidden = true; sugEl.innerHTML = ''; } CLI.sug = []; if (inEl) inEl.removeAttribute('aria-activedescendant'); };
  const suggest = () => {
    if (!inEl) return;
    const line = inEl.value;
    let c = { items: [], from: line.length };
    if (S) { try { c = G.cli.complete(S, 'p', line, ctx()); } catch (e) { console.error(e); } }
    else c = { items: ['race', 'set', 'name', 'begin', 'load', 'help'].filter(x => x.startsWith(line.trim().toLowerCase())).map(text => ({ text, label: text })), from: 0 };
    CLI.comp = c;
    const items = c.items.slice(0, CLI.mode === 'palette' ? 10 : 8);
    // hide the list when the word already matches the only suggestion exactly
    if (!items.length || (items.length === 1 && items[0].text.toLowerCase() === line.slice(c.from).trim().toLowerCase()) || (!line.trim() && CLI.mode !== 'palette')) { hideSug(); hint(); return; }
    CLI.sug = items; CLI.sel = Math.min(CLI.sel, items.length - 1); if (CLI.sel < 0) CLI.sel = 0;
    if (!CLI.tab) CLI.sel = 0;
    sugEl.innerHTML = items.map((it, i) => `<li role="option" id="ecCliSug${i}" data-i="${i}" class="${i === CLI.sel ? 'on' : ''}" aria-selected="${i === CLI.sel}"><span class="cli-k">${e$(it.kind || '')}</span>${e$(it.label || it.text)}</li>`).join('') +
      (c.items.length > items.length ? `<li class="cli-more" aria-hidden="true">… ${c.items.length - items.length} more — keep typing</li>` : '');
    sugEl.hidden = false;
    inEl.setAttribute('aria-activedescendant', 'ecCliSug' + CLI.sel);
    hint();
  };
  // usage line of the command being typed
  const hint = () => {
    if (!hintEl) return;
    const w = (inEl.value.split(';').pop() || '').trim().split(/\s+/)[0];
    const c = w && S && G.cli.commands.find(x => x.name === w.toLowerCase() || (x.aliases || []).includes(w.toLowerCase()));
    hintEl.textContent = c ? c.usage : '';
  };
  const applySug = i => {
    const c = CLI.comp, it = CLI.sug[i];
    if (!c || !it) return;
    const base = CLI.tab ? CLI.tab.base : inEl.value;
    const from = CLI.tab ? CLI.tab.from : c.from;
    const isCmd = it.kind === 'command' || it.kind === 'tab';
    inEl.value = base.slice(0, from) + it.text + (isCmd ? ' ' : '');
    inEl.setSelectionRange(inEl.value.length, inEl.value.length);
  };
  const tabComplete = dir => {
    if (!CLI.tab) {
      suggest();
      if (!CLI.sug.length) {
        // nothing to list (e.g. the word is complete): add a space so the next slot is offered
        if (inEl.value && !/\s$/.test(inEl.value)) { inEl.value += ' '; suggest(); }
        return;
      }
      CLI.tab = { base: inEl.value, from: CLI.comp.from, items: CLI.sug.slice() };
      // one candidate, or all start with a longer common prefix: insert it
      if (CLI.sug.length === 1) { applySug(0); CLI.tab = null; suggest(); return; }
      CLI.sel = dir > 0 ? 0 : CLI.sug.length - 1;
    } else {
      CLI.sel = (CLI.sel + dir + CLI.tab.items.length) % CLI.tab.items.length;
    }
    CLI.sug = CLI.tab.items;
    applySug(CLI.sel);
    sugEl.querySelectorAll('li[data-i]').forEach(li => { const on = +li.dataset.i === CLI.sel; li.classList.toggle('on', on); li.setAttribute('aria-selected', on); });
    inEl.setAttribute('aria-activedescendant', 'ecCliSug' + CLI.sel);
  };

  const onKey = ev => {
    const k = ev.key;
    if (k === 'Tab') { ev.preventDefault(); tabComplete(ev.shiftKey ? -1 : 1); return; }
    if (k === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      if (CLI.tab) { inEl.value = CLI.tab.base; CLI.tab = null; hideSug(); return; }
      if (!sugEl.hidden && CLI.mode !== 'palette') { hideSug(); return; }
      close(); return;
    }
    if (k === 'Enter') {
      ev.preventDefault();
      if (CLI.mode === 'palette' && CLI.sug.length && !CLI.tab) {
        // the palette accepts the highlighted suggestion when the word is unfinished
        const c = CLI.comp, word = inEl.value.slice(c.from).trim().toLowerCase(), it = CLI.sug[CLI.sel];
        if (it && it.text.toLowerCase() !== word) { applySug(CLI.sel); CLI.tab = null; if (it.kind === 'command') { suggest(); return; } }
      }
      const line = inEl.value; inEl.value = ''; CLI.tab = null; hideSug(); hint();
      const r = run(line);
      if (CLI.mode === 'palette') {
        if (r.ok && !r.confirm) { close(); const msg = (r.out || []).filter(Boolean).slice(-1)[0]; if (msg && typeof toast === 'function') toast(msg); }
        else { CLI.mode = 'console'; layout(); inEl.focus(); }
      }
      return;
    }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      if (CLI.tab || (CLI.mode === 'palette' && CLI.sug.length)) {
        ev.preventDefault();
        if (!CLI.tab) { CLI.sel = (CLI.sel + (k === 'ArrowDown' ? 1 : -1) + CLI.sug.length) % CLI.sug.length; suggestMark(); return; }
        tabComplete(k === 'ArrowDown' ? 1 : -1); return;
      }
      ev.preventDefault();
      if (!CLI.hist.length) return;
      if (CLI.hi === -1) { CLI.draft = inEl.value; CLI.hi = CLI.hist.length; }
      CLI.hi = Math.max(0, Math.min(CLI.hist.length, CLI.hi + (k === 'ArrowUp' ? -1 : 1)));
      inEl.value = CLI.hi === CLI.hist.length ? CLI.draft : CLI.hist[CLI.hi];
      if (CLI.hi === CLI.hist.length) CLI.hi = -1;
      inEl.setSelectionRange(inEl.value.length, inEl.value.length);
      hideSug(); hint();
      return;
    }
    if (k === 'l' && ev.ctrlKey) { ev.preventDefault(); outEl.innerHTML = ''; return; }
    if ((k === 'k' || k === 'K') && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); close(); return; }
    if (k === 'PageUp' || k === 'PageDown') { ev.preventDefault(); outEl.scrollTop += (k === 'PageUp' ? -1 : 1) * outEl.clientHeight * 0.8; }
  };
  const suggestMark = () => {
    sugEl.querySelectorAll('li[data-i]').forEach(li => { const on = +li.dataset.i === CLI.sel; li.classList.toggle('on', on); li.setAttribute('aria-selected', on); });
    inEl.setAttribute('aria-activedescendant', 'ecCliSug' + CLI.sel);
  };

  // ---------------------------------------------------------------
  // the shortcut overlay (?), also behind the ⌨️ button in the top bar
  // ---------------------------------------------------------------
  // g + letter: a mnemonic for every tab (first free letter of its key)
  const chordMap = () => {
    const m = {}, pref = { city: 'c', military: 'm', world: 'w', research: 'r', council: 'o', ledger: 'l', diplomacy: 'd', reports: 'p', help: 'h', magic: 'g', market: 'k', hero: 'e', empire: 'i', espionage: 's', culture: 'u', religion: 'f', moves: 'v', minors: 'n', chronicle: 'y', tales: 't', dynasty: 'a' };
    const used = new Set();
    for (const k of Object.keys(TABS)) if (pref[k] && !used.has(pref[k])) { m[pref[k]] = k; used.add(pref[k]); }
    for (const k of Object.keys(TABS)) if (!Object.values(m).includes(k)) { const ch = [...k].find(x => /[a-z]/.test(x) && !used.has(x)); if (ch) { m[ch] = k; used.add(ch); } }
    return m;
  };
  let keysEl = null;
  const keysHtml = () => {
    const k = s => `<kbd>${e$(s)}</kbd>`;
    const tl = t => e$(String((TABS[t] || {}).label || t).replace(/<[^>]+>/g, ''));
    const tk = typeof tabKeys === 'function' ? tabKeys() : [];
    const ch = chordMap();
    const row = (keys, what) => `<tr><td>${keys}</td><td>${what}</td></tr>`;
    return `<div class="hd"><span>⌨️ Keyboard</span><button class="small" data-keys-close aria-label="Close">✕</button></div>
      <div class="ec-keys-cols">
      <table><caption>Anywhere</caption>
        ${row(`${k('`')} ${k(':')}`, 'Open the command console')}
        ${row(`${k('Ctrl')}+${k('K')}`, 'Command palette (run one command)')}
        ${row(k('?'), 'This list')}
        ${row(k('/'), 'Search (Help, Research)')}
        ${row(`${k('[')} ${k(']')}`, 'Previous / next city')}
        ${row(k('Space'), 'Pause / resume')}
        ${row(`${k('+')} ${k('−')}`, 'Faster / slower')}
        ${row(`${k('Tab')} ${k('Enter')}`, 'Move between and press buttons')}
        ${row(k('Esc'), 'Close panels, clear the selection')}
      </table>
      <table><caption>Tabs</caption>
        ${Object.keys(TABS).map(t => { const n = tk.indexOf(t), c = Object.keys(ch).find(x => ch[x] === t); return row(`${n >= 0 ? k(String(n + 1)) + ' ' : ''}${c ? `${k('g')}${k(c)}` : ''}`, tl(t)); }).join('')}
      </table>
      <table><caption>World map</caption>
        ${row(`${k('←')} ${k('↑')} ${k('→')} ${k('↓')}`, 'Move the selection (Shift: 5 tiles)')}
        ${row(k('Enter'), 'Open the selected place')}
        ${row(k('Home'), 'Back to the current city')}
      </table>
      <table><caption>Console</caption>
        ${row(k('Tab'), 'Complete (again: next suggestion)')}
        ${row(`${k('↑')} ${k('↓')}`, 'History')}
        ${row(k('Enter'), 'Run · <code>;</code> chains commands')}
        ${row(`${k('Ctrl')}+${k('L')}`, 'Clear')}
        ${row(k('Esc'), 'Close')}
      </table></div>
      <p class="muted">Keys are off while you type in a field. Type <code>help</code> in the console for every command.</p>`;
  };
  const openKeys = () => {
    if (!keysEl) {
      keysEl = document.createElement('div'); keysEl.id = 'ecKeys'; keysEl.setAttribute('role', 'dialog'); keysEl.setAttribute('aria-label', 'Keyboard shortcuts'); keysEl.tabIndex = -1;
      keysEl.addEventListener('click', ev => { if (ev.target.closest('[data-keys-close]')) closeKeys(); });
      document.body.appendChild(keysEl);
    }
    keysEl.innerHTML = keysHtml(); keysEl.classList.add('on');
    try { keysEl.focus({ preventScroll: true }); } catch (e) { }
  };
  const closeKeys = () => { if (keysEl && keysEl.classList.contains('on')) { keysEl.classList.remove('on'); return true; } return false; };
  const keysOpen = () => !!(keysEl && keysEl.classList.contains('on'));
  document.addEventListener('click', ev => { if (keysOpen() && !keysEl.contains(ev.target) && !ev.target.closest('[data-act="popKeys"]')) closeKeys(); }, true);

  // ---------------------------------------------------------------
  // the global keys (capture phase, so they win over page handlers; never while typing)
  // ---------------------------------------------------------------
  let chordAt = 0;
  const mapFocus = () => {
    const a = document.activeElement;
    return !a || a === document.body || a === document.documentElement || a.tagName === 'CANVAS' || (a.closest && a.closest('.mapwrap') && !/^(BUTTON|A|SUMMARY|SELECT|INPUT|TEXTAREA)$/.test(a.tagName));
  };
  document.addEventListener('keydown', ev => {
    if (ev.defaultPrevented || window.ecCatching) return;
    if (root && root.contains(ev.target)) return;          // the console input handles its own keys
    const k = ev.key;
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && (k === 'k' || k === 'K')) {
      ev.preventDefault(); ev.stopPropagation();
      if (CLI.open && CLI.mode === 'palette') close(); else open('palette');
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (isTyping(ev.target) || isTyping(document.activeElement)) return;
    if (k === 'Escape' && keysOpen()) { ev.preventDefault(); ev.stopPropagation(); closeKeys(); return; }
    if (k === '`' || k === ':' || (ev.code === 'Backquote' && !ev.shiftKey && k !== '~')) {
      ev.preventDefault(); ev.stopPropagation();
      if (CLI.open && CLI.mode !== 'palette') { close(); return; }
      open('console'); return;
    }
    if (k === '?' || (k === '/' && ev.shiftKey)) { ev.preventDefault(); ev.stopPropagation(); if (keysOpen()) closeKeys(); else openKeys(); return; }
    if (k === '/') {
      const box = document.querySelector('#app input[type="search"], #app input[type="text"][placeholder*="earch" i]');
      if (box) { ev.preventDefault(); ev.stopPropagation(); box.focus(); try { box.select(); } catch (e) { } }
      return;
    }
    if (!S) return;
    // g then a letter: go to a tab
    if (k === 'g' && !ev.shiftKey) { chordAt = Date.now(); ev.preventDefault(); return; }
    if (chordAt && Date.now() - chordAt < 1500 && /^[a-z]$/.test(k)) {
      chordAt = 0;
      const t = chordMap()[k];
      if (t && TABS[t]) { ev.preventDefault(); ev.stopPropagation(); act.tab({ t }); }
      return;
    }
    chordAt = 0;
    // the world map: arrows move the selection, Enter opens it
    if (UI.tab === 'world' && !UI.spellTarget && mapFocus()) {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (d) {
        ev.preventDefault(); ev.stopPropagation();
        const c = curCity(), base = UI.sel || { x: c.x, y: c.y }, n = ev.shiftKey ? 5 : 1;
        const x = Math.max(0, Math.min(S.map - 1, base.x + d[0] * n)), y = Math.max(0, Math.min(S.map - 1, base.y + d[1] * n));
        UI.sel = { x, y }; render(true);
        announce(x, y);
        return;
      }
      if (k === 'Home') { ev.preventDefault(); const c = curCity(); UI.sel = { x: c.x, y: c.y }; render(true); announce(c.x, c.y); return; }
      if (k === 'Enter' && UI.sel) {
        ev.preventDefault(); ev.stopPropagation();
        if (UI.sel.move) { const { x, y } = UI.sel; UI.sel = { x, y }; render(true); }
        const panel = document.querySelector('#app .mapwrap > .card');
        if (panel) {
          try { panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { }
          const b = panel.querySelector('button:not([disabled]), input, select, [tabindex="0"]');
          if (b) b.focus();
        }
        return;
      }
    }
  }, true);
  // a short spoken/visible note of where the selection is (screen readers and the hint toast)
  let liveEl = null;
  const announce = (x, y) => {
    if (!liveEl) { liveEl = document.createElement('div'); liveEl.className = 'ec-sr'; liveEl.setAttribute('aria-live', 'polite'); document.body.appendChild(liveEl); }
    const t = G.tileAt(S, x, y), seen = S.explored[y * S.map + x];
    const c = t && t.city && S.cities[t.city];
    const what = !seen ? 'unexplored' : c ? c.name : t.camp ? 'brigand camp' : t.ruin ? 'ruins' : t.oasis ? 'oasis' : (DATA.terrain[t.terrain] || {}).name || t.terrain;
    liveEl.textContent = `(${x}, ${y}) ${what}`;
    // a toast only when the selection lands on something (holding an arrow must not drown the game's own toasts)
    if (seen && t && (c || t.camp || t.ruin || t.oasis || t.minor) && typeof toast === 'function') toast(`📍 (${x}, ${y}) ${what} — Enter opens`);
  };

  // ---------------------------------------------------------------
  // hooks into the regular UI
  // ---------------------------------------------------------------
  Object.assign(act, {
    cliOpen: () => open('console'),
    popKeys: () => { if (keysOpen()) closeKeys(); else openKeys(); },
  });
  if (typeof TOP_EXTRAS !== 'undefined') TOP_EXTRAS.push(() => `<button class="small cli-top" data-act="cliOpen" title="Command console: type commands instead of clicking (\` or Ctrl+K)" aria-label="Open the command console"><span aria-hidden="true">⌨️</span><span class="cli-top-l"> Console <kbd>\`</kbd></span></button>`);
  if (typeof HELP_SECTIONS !== 'undefined' && !HELP_SECTIONS.some(h => h.id === 'console')) {
    const i = HELP_SECTIONS.findIndex(h => h.id === 'time');
    HELP_SECTIONS.splice(i >= 0 ? i + 1 : HELP_SECTIONS.length, 0, {
      id: 'console', icon: '⌨️', title: 'Keyboard & command console', tabs: ['help'],
      words: 'keyboard console command cli terminal shortcuts keys palette type commands mouse clicky arrows ' + G.cli.commands.map(c => c.name).join(' '),
      html: `<p>Everything can be done from the keyboard. Press <kbd>\`</kbd> or <kbd>:</kbd> for the <b>console</b> (or <kbd>Ctrl</kbd>+<kbd>K</kbd> for a one-shot palette), type a command and press Enter. <kbd>Tab</kbd> completes commands, cities, buildings, units, techs, spells and goods from a few letters (fuzzy, any case); <kbd>↑</kbd>/<kbd>↓</kbd> recall earlier commands; <code>;</code> chains several; risky orders (war, demolish, dismiss) ask <code>y/n</code>. Press <kbd>?</kbd> for every shortcut.</p>
        <p>Keys: <kbd>1</kbd>–<kbd>9</kbd> or <kbd>g</kbd> + a letter open tabs, <kbd>[</kbd> <kbd>]</kbd> switch cities, <kbd>/</kbd> searches, and on the World tab the arrow keys move the selection and <kbd>Enter</kbd> opens it.</p>
        ${G.cli.helpHtml(e$)}`,
    });
  }
  if (typeof HELP_GLOSSARY !== 'undefined') HELP_GLOSSARY.push(['Console', 'A command line for the whole game: press ` and type, e.g. build farm or send all to Oakford.', 'console']);
})();
