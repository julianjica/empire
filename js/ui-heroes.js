// =====================================================================
//  Rival heroes UI: a line on each Diplomacy realm card, and a
//  "Rival heroes" section under the Hero tab (wraps renderHero).
//  You always know a rival champion's name and level (tales travel);
//  its gear only once your troops have fought it.
// =====================================================================
'use strict';
{
  const PERS = h => DATA.heroPersonalities && DATA.heroPersonalities[h.personality];
  const statusOf = (id) => {
    const st = G.rivalHeroStatus ? G.rivalHeroStatus(S, id) : { key: 'unknown', text: '' };
    if (st.key === 'fallen') return `<span class="bad">☠️ ${esc(st.text)}</span>`;
    if (st.key === 'marching') return `🐎 ${esc(st.text)}`;
    if (st.key === 'home') return '🏠 at home';
    return `<span class="muted">${esc(st.text)}</span>`;
  };
  const gearOf = h => {
    if (!h.metP) return '<span class="muted">unknown (never faced in battle)</span>';
    const eq = Object.values(h.eq).filter(Boolean);
    return eq.length ? eq.map(it => `<span title="${esc(G.itemText(it))}" style="color:${DATA.rarity[it.rarity].color}">${it.icon} ${esc(it.name)}</span>`).join(', ') : '<span class="muted">no gear</span>';
  };
  const famed = id => G.heroFamous && G.heroFamous(S, id) ? ` <span class="pill warn" title="Its armies fight +${Math.round(G.HERO_FAME_LEAD * 100)}% harder when it leads">famed</span>` : '';

  REALM_EXTRAS.push(emp => {
    const h = G.heroOf(S, emp.id);
    if (!h) return '';
    const p = PERS(h);
    return `<div style="margin-top:6px;font-size:13px">🦸 Champion: <b>${esc(h.name)}</b> · level ${h.level}${p ? ` · ${p.icon} ${p.name}` : ''} · ${statusOf(emp.id)}${famed(emp.id)}${h.metP ? `<div class="muted" style="font-size:12px">Gear seen in battle: ${gearOf(h)}</div>` : ''}</div>`;
  });

  const renderRivalHeroes = () => {
    const rivals = Object.values(S.empires).filter(e => e.id !== 'p' && e.hero && !e.dead);
    if (!rivals.length) return '';
    const me = S.empires.p;
    return `<div class="card"><h3>⚔️ Rival heroes</h3>
      <p class="muted" style="font-size:12.5px">Every realm has its champion. When two heroes meet in a city battle they duel first: the loser is badly wounded and its side loses heart (a tenth more of its troops fall). Slaying a rival hero earns +${G.HERO_SLAY_RENOWN} renown and maybe one of its items. Heroes of level ${G.HERO_FAME_LEVEL}+ are famed: their armies fight +${Math.round(G.HERO_FAME_LEAD * 100)}% harder.${me.heroesSlain ? ` You have slain ${me.heroesSlain} rival hero${me.heroesSlain > 1 ? 'es' : ''}.` : ''}</p>
      <table><tr><th>Realm</th><th>Hero</th><th>Level</th><th>Bent</th><th>Status</th><th>Gear</th></tr>
      ${rivals.map(e => { const h = e.hero, p = PERS(h); return `<tr><td><span class="dot" style="background:${e.color};width:10px;height:10px;border-radius:50%;display:inline-block"></span> ${esc(e.name)}</td><td><b>${esc(h.name)}</b>${famed(e.id)}</td><td>${h.level}</td><td>${p ? `<span title="${esc(p.desc)}">${p.icon} ${p.name}</span>` : ''}</td><td>${statusOf(e.id)}</td><td style="font-size:12px">${gearOf(h)}</td></tr>`; }).join('')}
      </table></div>`;
  };
  G.renderRivalHeroes = renderRivalHeroes;

  if (TABS.hero) {
    const base = TABS.hero.render;
    TABS.hero.render = c => base(c) + renderRivalHeroes();
  }
}
