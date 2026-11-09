// Auto-explore switch: a chip in the city header and on the Military tab's scout card area.
'use strict';
(() => {
  const chip = city => {
    if (!city || city.owner !== 'p') return '';
    const on = G.autoExploreOn(S, city.id);
    const scouts = city.units.scout || 0;
    const out = S.moves.filter(m => m.auto && m.from === city.id).length;
    if (!on && !scouts) return '';
    return `<button class="pill ${on ? 'good' : ''}" data-act="autoExplore" data-c="${city.id}" title="${on ? 'Scouts from this city keep mapping the nearest unknown land. Click to stop.' : 'Send this city\'s scouts out automatically, one or two at a time, to map the nearest unknown land.'}">🦅 Auto-explore ${on ? `on · ${out} out, ${scouts} home` : 'off'}</button>`;
  };
  CITY_EXTRAS.push(chip);
  Object.assign(act, {
    autoExplore: d => {
      const on = !G.autoExploreOn(S, d.c);
      G.setAutoExplore(S, d.c, on);
      const c = S.cities[d.c];
      toast(on ? ((c.units.scout || 0) ? `🦅 Scouts of ${c.name} set out to map the unknown` : `🦅 Auto-explore on — train Scouts at the Barracks of ${c.name}`) : 'Auto-explore off');
      render(true);
    },
  });
})();
