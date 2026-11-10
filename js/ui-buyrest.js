// =====================================================================
//  "Buy the rest" — when a building, troops or a study lacks only goods,
//  a second button buys the missing goods at the market (today's prices,
//  with impact) and starts it at once. G.shortfall / G.buyShortfall live
//  in js/prices.js; the cards call buyRestBtn(...) next to their main button.
// =====================================================================
'use strict';

// kind: 'build' | 'train' | 'research'; city: the city that pays; cost × mult; data: extra data-* attributes
const buyRestBtn = (kind, city, cost, mult, data, compact) => {
  if (!city || !G.shortfall) return '';
  const f = G.shortfall(S, city, cost, mult || 1);
  if (!f.short.length) return '';
  const what = f.short.map(([g, n]) => `${fmt(n)} ${gName(g)}`).join(', ');
  const attrs = Object.entries(data || {}).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ');
  const tip = f.ok ? `Buy ${what} at the market for ${fmt(f.price)} gold, then start` : f.reason;
  return `<button class="small buyrest" data-act="buyRest" data-kind="${kind}" data-c="${esc(city.id)}" ${attrs} ${f.ok ? '' : 'disabled'} title="${esc(tip)}">💰 ${compact ? '' : 'Buy rest · '}${fmt(f.price)}</button>`;
};

Object.assign(act, {
  buyRest: d => {
    const city = S.cities[d.c];
    if (!city || city.owner !== 'p') return;
    let cost, mult = 1, go;
    if (d.kind === 'build') {
      const st = G.buildStatus(S, city, d.b);
      cost = st.cost; go = () => G.queueBuild(S, city.id, d.b);
    } else if (d.kind === 'train') {
      const n = Math.max(1, parseInt(UI.form[d.k] || 1, 10) || 1), st = G.trainStatus(S, city, d.u);
      if (st.byPop < n) return toast(`Not enough people to enrol ${n} (room for ${st.byPop})`);
      cost = st.cost; mult = n; go = () => G.queueTrain(S, city.id, d.u, n);
    } else if (d.kind === 'research') {
      cost = G.techStatus(S, city.id, d.t).cost; go = () => G.startResearch(S, city.id, d.t);
    } else return;
    const gold0 = S.empires.p.gold;
    const err = G.buyShortfall(S, city, cost, mult);
    if (err) { toast(err); return render(true); }
    const paid = Math.round(gold0 - S.empires.p.gold);
    const e2 = go();
    toast(e2 ? `Bought the goods for ${fmt(paid)} gold, but: ${e2}` : `Bought the missing goods for ${fmt(paid)} gold and started`);
    render(true);
  },
});
