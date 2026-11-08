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

const renderCulture = city => {
  const emp = S.empires.p;
  const C = G.CULTURE;
  const cities = G.citiesOf(S, 'p');
  const rate = G.realmCultureRate(S, 'p');
  const per = G.sizePenaltyPer(S, 'p');
  const soft = Math.min(C.sizeSoftMax, Math.floor((emp.cultureTotal || 0) / C.sizeCulture));
  const nextSoft = soft < C.sizeSoftMax ? (soft + 1) * C.sizeCulture : null;
  const cost = G.traditionCost(S, 'p');
  const parts = [];

  parts.push(`<div class="card cult-head">
    <div class="row"><span style="font-size:34px">🎭</span>
      <div><h2 style="margin:0">Culture of ${esc(emp.name)}</h2>
        <div class="muted" style="font-size:13px">Culture buys traditions and calms a sprawling realm.</div></div>
      <span class="spacer"></span>
      <div class="cult-stat"><span class="muted">Culture</span><b>${fmt(emp.culture || 0)}</b><span class="muted">${fmtRate(rate)}/min</span></div>
      <div class="cult-stat"><span class="muted">Lifetime</span><b>${fmt(emp.cultureTotal || 0)}</b><span class="muted">${(emp.traditions || []).length} traditions</span></div>
    </div>
    <p style="margin:8px 0 0;font-size:13px">👑 Empire size: the first ${C.sizeFree} cities are free; each one beyond costs <b>−${per}</b> happiness in every city
      ${cities.length > C.sizeFree ? `(now <b class="bad">−${Math.round((cities.length - C.sizeFree) * per)}</b> with ${cities.length} cities)` : `(you rule ${cities.length})`}.
      ${nextSoft ? `<span class="muted">At ${fmt(nextSoft)} lifetime culture this eases by 1.</span>` : '<span class="good">Culture has eased it as far as it can.</span>'}</p>
  </div>`);

  // ---- traditions ----
  const tiers = [1, 2, 3].map(tier => {
    const ids = G.traditionsFor(S, 'p').filter(id => DATA.traditions[id].tier === tier);
    return `<div class="trad-tier"><div class="group-title">${['', 'First traditions', 'Second traditions (after 1)', 'Great traditions (after 3)'][tier]}</div>
      <div class="grid">${ids.map(id => {
        const t = DATA.traditions[id];
        const st = G.traditionStatus(S, 'p', id);
        return `<div class="card trad ${st.have ? 'have' : st.locked ? 'locked' : ''}">
          <div class="head"><span class="ico">${t.icon}</span><div><b>${t.name}</b> ${t.race ? `<span class="pill">${DATA.races[t.race].name}</span>` : '<span class="pill muted">shared</span>'}</div></div>
          <div class="desc">${t.desc}</div>
          ${st.have ? '<div class="good">✓ Adopted</div>' : `<div class="row"><button class="${st.ok ? 'primary' : ''}" data-act="adoptTradition" data-id="${id}" ${st.ok ? '' : 'disabled'}>Adopt · 🎭 ${fmt(cost)}</button>
            ${!st.ok ? `<span class="${st.poor ? 'muted' : 'warn'}" style="font-size:12px">${st.reason}</span>` : ''}</div>`}
        </div>`;
      }).join('')}</div></div>`;
  }).join('');
  parts.push(`<div class="card"><h3>Traditions <span class="muted" style="font-size:13px">next costs 🎭 ${fmt(cost)} — each one raises the price of the next</span></h3>${tiers}</div>`);

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
      <li>Each city makes culture: 0.5 + 0.1 per 10 happiness, +2 per Temple level, +3 per Theatre level, a little from the Town Hall and Academy. Every ${fmt(C.sizeCulture)} lifetime culture eases the empire-size penalty by 1 per city (up to ${C.sizeSoftMax}).</li>
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
  placate: d => { toast(G.placate(S, d.c) || 'The people are calmed'); render(true); },
});
