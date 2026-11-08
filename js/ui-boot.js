// =====================================================================
//  Main loop and boot (loaded last)
// =====================================================================
'use strict';

let lastReal = performance.now();
let lastSave = Date.now();
const loop = () => {
  if (document.hidden) return;   // paused while hidden; catchUp() covers the gap on return
  const now = performance.now();
  const dtReal = Math.min(5, (now - lastReal) / 1000);
  lastReal = now;
  if (S && !S.gameOver) {
    G.advance(S, dtReal * S.settings.speed, 50);
    if (Date.now() - lastSave > 15000) { G.save(S); lastSave = Date.now(); }
  }
  render(false);
};

(function boot() {
  S = G.load();
  if (S) {
    const caught = G.catchUp(S);
    UI.city = (G.citiesOf(S, 'p')[0] || {}).id;
    render(true);
    if (caught > 60) toast(`While you were away, ${fmtTime(caught)} of game time passed.`);
  } else render(true);
  setInterval(loop, 1000);
  window.addEventListener('beforeunload', () => { if (S) { if (document.hidden) G.catchUp(S); G.save(S); } });
  document.addEventListener('visibilitychange', () => {
    if (!S) return;
    if (document.hidden) G.save(S);
    else { G.catchUp(S); lastReal = performance.now(); render(true); }
  });
})();

// expose for debugging from the console
window.EC = { get S() { return S; }, G, UI, render };
