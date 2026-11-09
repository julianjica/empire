// =====================================================================
//  Main loop and boot (loaded last)
// =====================================================================
'use strict';

let lastReal = performance.now();
let lastSave = Date.now();
const loop = () => {
  if (document.hidden || window.ecCatching) return;   // paused while hidden; catch-up covers the gap on return
  const now = performance.now();
  const dtReal = Math.min(5, (now - lastReal) / 1000);
  lastReal = now;
  if (S && !S.gameOver && !UI.paused) {
    // steps of up to 5 game-seconds (the granularity the tests and the offline catch-up run at):
    // at 1× this is one step per tick as before; at 25× it is 5 steps instead of 13
    const g = dtReal * S.settings.speed;
    G.advance(S, g, Math.max(1, Math.ceil(g / 5)));
  }
  if (S && Date.now() - lastSave > (OPTS.autosave || 15) * 1000) { G.save(S); lastSave = Date.now(); }
  render(false);
};

// ---------------------------------------------------------------------
// Catch-up after time away. Short gaps run at once (G.catchUp); long ones run in slices with
// the same step size as G.catchUp (≤ 6000 steps, at least 2 s each) behind a progress veil, so
// a 12-hour absence on a crowded world doesn't freeze the page for many seconds.
// ---------------------------------------------------------------------
const CATCH_SYNC = 900;   // game-seconds handled in one go
let veil = null;
const showVeil = (done, total) => {
  if (!veil) {
    veil = document.createElement('div'); veil.id = 'ecVeil'; veil.setAttribute('role', 'status');
    veil.innerHTML = '<div class="card"><h3>🕯️ The realm went on without you…</h3><div class="bar"><i></i></div><p class="muted"></p></div>';
    document.body.appendChild(veil);
  }
  veil.querySelector('.bar i').style.width = Math.round(done / total * 100) + '%';
  veil.querySelector('p').textContent = `Catching up on ${fmtTime(total)} of game time · ${fmtTime(done)} done`;
};
const hideVeil = () => { if (veil) { veil.remove(); veil = null; } };
const catchUp = onDone => {
  if (!S) return onDone(0);
  const before = awaySnap();
  const finish = game => {
    window.ecCatching = false; hideVeil();
    lastReal = performance.now();
    if (game > 60) { const a = awaySummary(before, game); if (a) UI.away = a; }
    onDone(game);
  };
  const realSec = Math.min(12 * 3600, Math.max(0, (Date.now() - (S.realLast || Date.now())) / 1000));
  if (UI.paused) { S.realLast = Date.now(); return onDone(0); }   // a paused game stays paused while the tab is hidden
  if (realSec <= CATCH_SYNC) return finish(G.catchUp(S));
  const step = Math.max(2, realSec / 6000), target = Date.now();
  let left = realSec;
  window.ecCatching = true;
  showVeil(0, realSec);
  const slice = () => {
    if (!S) { finish(0); return; }
    const t0 = performance.now();
    while (left > 0 && performance.now() - t0 < 80) {
      const g = Math.min(left, step * 25);
      G.advance(S, g, Math.max(1, Math.ceil(g / step - 1e-9)));
      left -= g;
    }
    if (left > 0) { showVeil(realSec - left, realSec); setTimeout(slice, 0); return; }
    S.realLast = target;
    const extra = G.catchUp(S);   // the few seconds spent catching up
    finish(realSec + extra);
  };
  setTimeout(slice, 0);
};

(function boot() {
  S = G.load();
  if (S) {
    UI.city = (G.citiesOf(S, 'p')[0] || {}).id;
    render(true);
    catchUp(caught => {
      UI.city = UI.city && S.cities[UI.city] && S.cities[UI.city].owner === 'p' ? UI.city : (G.citiesOf(S, 'p')[0] || {}).id;
      render(true);
      if (caught > 60 && !UI.away) toast(`While you were away, ${fmtTime(caught)} of game time passed.`);
    });
  } else render(true);
  setInterval(loop, 1000);
  // mid catch-up the stored save is left as it was: its realLast still covers the whole absence
  window.addEventListener('beforeunload', () => { if (S && !window.ecCatching) { if (document.hidden && !UI.paused) G.catchUp(S); G.save(S); } });
  document.addEventListener('visibilitychange', () => {
    if (!S || window.ecCatching) return;
    if (document.hidden) G.save(S);
    else catchUp(() => { lastReal = performance.now(); render(true); });
  });
})();

// expose for debugging from the console
window.EC = { get S() { return S; }, G, UI, render, OPTS, PERF };
