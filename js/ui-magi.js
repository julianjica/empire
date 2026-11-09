// =====================================================================
//  Circle of Magi UI: the 🧙 Circle tab (portrait cards, stations,
//  candidates, battle spells), the court magus chip in the city header,
//  war magi on the Military tab, magi in battle reports and movements,
//  rivals' archmagi on Diplomacy cards, and the help entry. Engine: magi.js.
// =====================================================================
'use strict';
{
  if (G.magiOf && typeof TABS !== 'undefined') {
    const OWNER = 'p';
    const T = k => DATA.magusTraits[k] || { name: k, icon: '', desc: '' };
    const SC = k => DATA.schools[k] || { name: k, icon: '✨', color: '#8a5cd6' };
    const STATION = {
      court: { icon: '👑', name: 'Court Magus', desc: 'More mana in this city; spells cast from it cost less and strike harder; the weave strain here fades faster.' },
      war:   { icon: '⚔️', name: 'War Magus',   desc: 'Rides with raids, attacks and conquests leaving this city (10+ soldiers), casts battle spells, duels enemy magi; defends the city while home.' },
      study: { icon: '📚', name: 'Study',       desc: 'Speeds the study of your grimoire.' },
      idle:  { icon: '💤', name: 'Idle',        desc: 'Waits for a post; still paid.' },
    };
    const traitsHtml = g => (g.traits || []).map(k => `<span class="pill" title="${esc(T(k).desc)}">${T(k).icon} ${esc(T(k).name)}</span>`).join(' ');
    const pic = (owner, g, size) => ptHtml(G.magusSpec(S, owner, g), size, 'pt-card', g.name) || `<span class="mgi-noart" style="width:${size}px;height:${size}px">🧙</span>`;
    const schoolPill = k => `<span class="mgi-school" style="--school:${SC(k).color}">${SC(k).icon} ${esc(SC(k).name)}</span>`;
    const cityName = id => esc((S.cities[id] || {}).name || '?');
    const pct = v => `${v >= 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`;
    const where = g => {
      if (g.status === 'riding') return `riding to ${cityName(g.city)} (${fmtTime(realSecs(Math.max(0, (g.until || 0) - S.time)))})`;
      if (g.status === 'marching') { const m = S.moves.find(x => x.id === g.move); return m ? `${m.type === 'return' ? 'coming home with the army' : 'in the field with the army'} (${fmtTime(realSecs(Math.max(0, m.arrive - S.time)))})` : 'in the field'; }
      return `in ${cityName(g.city)}`;
    };
    const effectLine = g => {
      if (g.station === 'court') { const fx = G.magiCourtFx(S, g, S.cities[g.city]); return `${pct(fx.mana)} mana · spells from here ${pct(fx.cost)} cost, ${pct(fx.power)} power · strain −${fx.strain.toFixed(1)}/min`; }
      if (g.station === 'war') return `Battle spells: ${G.magusBattleSpells(g).map(b => `${b.icon} ${esc(b.name)}`).join(', ')}${g.guard ? ' · <b>guards the city</b> (does not ride out)' : ''}`;
      if (g.station === 'study') return `Grimoire study ×${G.magiStudyBonus(S, OWNER).toFixed(2)} for the realm`;
      return 'No post yet';
    };
    const xpBar = g => {
      if (g.rank >= 5) return '<span class="muted">highest rank</span>';
      const need = G.magusXpNeed(g.rank), p = Math.min(100, Math.round(g.xp / need * 100));
      return `<span class="mgi-bar" title="${Math.floor(g.xp)}/${need} xp to ${G.MAGI.ranks[g.rank]}"><i style="width:${p}%"></i></span>`;
    };
    const card = (city, g) => {
      const sc = SC(g.school);
      const btn = (act, label, extra = '', title = '') => `<button class="small" data-act="${act}" data-g="${esc(g.id)}" ${extra} ${title ? `title="${esc(title)}"` : ''}>${label}</button>`;
      const btns = [];
      if (g.status === 'home' || g.status === 'riding') {
        const tower = G.lvl(city, 'magetower') > 0;
        const court = G.courtMagusOf(S, city);
        if (!(g.station === 'court' && g.city === city.id)) btns.push(btn('mgiStation', `👑 Court of ${esc(city.name)}`, `data-s="court" data-c="${esc(city.id)}" ${!tower || (court && court !== g) ? 'disabled' : ''}`, !tower ? `${city.name} has no Mage Tower` : court && court !== g ? `${court.name} already holds that post` : STATION.court.desc));
        if (!(g.station === 'war' && g.city === city.id)) btns.push(btn('mgiStation', `⚔️ War in ${esc(city.name)}`, `data-s="war" data-c="${esc(city.id)}"`, STATION.war.desc));
        if (g.station !== 'study') btns.push(btn('mgiStation', '📚 Study', `data-s="study" data-c="${esc(tower ? city.id : g.city)}" ${!tower && !G.lvl(S.cities[g.city], 'magetower') ? 'disabled' : ''}`, STATION.study.desc));
        if (g.station !== 'idle') btns.push(btn('mgiStation', '💤 Recall', `data-s="idle" data-c="${esc(g.city)}"`, 'Take the magus off their post'));
        if (g.station === 'war') btns.push(btn('mgiGuard', g.guard ? '🐎 Ride with armies' : '🏰 Guard the city', '', g.guard ? 'Ride out with armies again' : 'Stay home and defend the city'));
        btns.push(btn('mgiHonor', `🎁 Honour (🪙 ${G.honorCost(g).gold})`, (g.honorAt || 0) > S.time ? 'disabled' : '', `+${G.MAGI.honor.gain} loyalty; once an hour`));
        btns.push(btn('mgiDismiss', 'Dismiss'));
      }
      const loyCls = g.loyalty < G.MAGI.loyalty.defect ? 'bad' : g.loyalty < 45 ? 'warn' : 'muted';
      return `<div class="mgi-card" style="--school:${sc.color}">
        <div class="mgi-pic">${pic(OWNER, g, 64)}</div>
        <div class="mgi-body">
          <div class="mgi-name"><b>${esc(g.name)}</b> <span class="mgi-rank">${G.magusRankName(g)}</span>${g.apprenticeOf ? ` <span class="muted" style="font-size:11.5px">apprentice of ${esc(g.apprenticeOf)}</span>` : ''}</div>
          <div class="mgi-meta">${schoolPill(g.school)} <span class="muted">age ${G.magusAge(S, g)}</span> ${xpBar(g)}</div>
          <div class="mgi-meta">${traitsHtml(g)}</div>
          <div class="mgi-meta"><span class="${loyCls}" title="Below ${G.MAGI.loyalty.defect} a magus may defect or go rogue">🤝 ${Math.round(g.loyalty)}</span> <span class="${g.hp < G.MAGI.minHp ? 'bad' : 'muted'}">❤️ ${Math.floor(g.hp)}</span> <span class="muted">· ✨ ${G.magiUpkeep(S, g).toFixed(1)}/min · ${g.battles || 0} battles${g.duels ? `, ${g.wins || 0}/${g.duels} duels won` : ''}</span></div>
          <div class="mgi-post">${STATION[g.station].icon} <b>${STATION[g.station].name}</b> · ${where(g)}<div class="muted">${effectLine(g)}</div></div>
          ${btns.length ? `<div class="mgi-btns">${btns.join('')}</div>` : ''}
        </div></div>`;
    };
    const candidates = () => {
      const pool = G.magiPool(S, OWNER);
      if (!pool.list.length) return `<p class="muted" style="font-size:12.5px">No candidates${G.magiCap(S, OWNER) ? ` — new faces in ${fmtTime(realSecs(Math.max(0, pool.next - S.time)))}` : ' — build a Mage Tower (Town Hall 4, Academy 1) and seekers of the art will come'}.</p>`;
      return `<div class="mgi-grid">${pool.list.map((c, i) => {
        const why = G.canRecruitMagus(S, OWNER, i), cost = G.magiRecruitCost(S, OWNER, c.rank);
        return `<div class="mgi-card cand" style="--school:${SC(c.school).color}"><div class="mgi-pic">${pic(OWNER, c, 52)}</div><div class="mgi-body">
          <div class="mgi-name"><b>${esc(c.name)}</b> <span class="mgi-rank">${G.magusRankName(c)}</span></div>
          <div class="mgi-meta">${schoolPill(c.school)} <span class="muted">age ${G.magusAge(S, c)} · at ${cityName(c.city)}</span></div>
          <div class="mgi-meta">${traitsHtml(c)}</div>
          <div class="mgi-btns"><button class="small primary" data-act="mgiRecruit" data-i="${i}" ${why ? 'disabled' : ''} title="${esc(why || 'Recruit')}">Recruit (🪙 ${cost.gold} · ✨ ${cost.mana})</button></div>
          ${why ? `<div class="warn" style="font-size:12px">${esc(why)}</div>` : ''}</div></div>`;
      }).join('')}</div><p class="muted" style="font-size:12px">New faces in ${fmtTime(realSecs(Math.max(0, pool.next - S.time)))}. Each further magus costs more.</p>`;
    };
    const spellTable = () => {
      const mine = new Set(G.schoolsOf ? G.schoolsOf(S, OWNER) : []);
      const rows = DATA.schoolOrder.filter(k => DATA.schools[k]).map(k => {
        const list = Object.values(DATA.battleSpells).filter(b => b.school === k);
        return `<tr class="${mine.has(k) ? '' : 'muted'}"><td>${schoolPill(k)}</td><td>${list.map(b => `${b.icon} ${esc(b.name)} <span class="muted">(${esc(DATA.battleSpellKinds[b.kind].name.toLowerCase())}${b.rank > 1 ? ', ' + G.MAGI.ranks[b.rank - 1] : ''})</span>`).join('<br>')}</td></tr>`;
      }).join('');
      return `<details class="mgi-ref"><summary>Battle spells by school</summary>
        <ul>${Object.values(DATA.battleSpellKinds).map(k => `<li><b>${esc(k.name)}</b>: ${esc(k.desc)} at Apprentice rank.</li>`).join('')}</ul>
        <p class="muted" style="font-size:12px">Strength +25% per rank above Apprentice, × your spell power, +2% per battle mage in the same army (at most +40%). The magi's combined bonus on one side is at most +18% (a hex at most −12%). Each cast costs 10 + 8 × rank mana. An Archmage casts two spells.</p>
        <div class="tbl-wrap"><table>${rows}</table></div></details>`;
    };
    const renderCircle = city => {
      const list = G.magiOf(S, OWNER), cap = G.magiCap(S, OWNER);
      const up = list.reduce((a, g) => a + G.magiUpkeep(S, g), 0);
      const fallen = (S.magi && S.magi.realms.p && S.magi.realms.p.fallen) || [];
      return `<div class="card mgi-head"><div class="row" style="align-items:center;gap:10px;flex-wrap:wrap">
          <span class="mgi-orb">🧙</span><div style="flex:1;min-width:180px"><h3 style="margin:0">Circle of Magi</h3>
          <div class="muted" style="font-size:12.5px">Named magi who serve your realm: court magi in your cities, war magi with your armies, scholars at the grimoire.</div></div>
          <div class="mgi-stat"><b>${list.length}/${cap}</b><span class="muted">magi</span></div>
          <div class="mgi-stat"><b>✨ ${up.toFixed(1)}</b><span class="muted">mana/min</span></div>
          <div class="mgi-stat"><b>×${G.magiStudyBonus(S, OWNER).toFixed(2)}</b><span class="muted">study</span></div></div>
          <details class="mgi-ref"><summary>How the Circle works</summary><ul>
            <li>Room: 1 magus per ${G.MAGI.capPerTower} Mage Tower levels in the realm (rounded up), at most ${G.MAGI.capMax}.</li>
            <li>Candidates appear at your Mage Tower cities every 2 game hours. Upkeep: ${G.MAGI.upkeep[0]}–${G.MAGI.upkeep[4]} mana/min by rank, drawn in their city (or your greatest tower).</li>
            <li>Ranks: ${G.MAGI.ranks.join(' → ')}. Experience comes from service (study fastest), battles, duels and counterspells.</li>
            <li>Loyalty settles near 70 (court +8). Mana shortage in their city −25; rivals send gifts. Below ${G.MAGI.loyalty.defect} a magus may defect to a rival or go rogue. Honour them with gold.</li>
            <li>Magi age with the calendar; the old may die, and a Magus or higher leaves an apprentice who takes over the post.</li>
            <li>In battle, magi duel the enemy's champion; a magus can counter a spell of a lower rank (battle mages add +0.05 rank each, at most +1.5). Court magi help counter spells against their city.</li></ul></details>
        </div>
        <div class="card"><h3>Your magi <span class="muted" style="font-size:13px">· actions apply to ${esc(city.name)}</span></h3>
          ${list.length ? `<div class="mgi-grid">${list.map(g => card(city, g)).join('')}</div>` : '<p class="muted">The Circle is empty. Recruit a candidate below.</p>'}
          ${fallen.length ? `<div class="muted" style="font-size:12px;margin-top:6px">Gone: ${fallen.slice(0, 6).map(f => `${esc(f.name)} (${G.MAGI.ranks[f.rank - 1]}, ${esc(f.cause)})`).join(' · ')}</div>` : ''}</div>
        <div class="card"><h3>Candidates</h3>${candidates()}</div>
        <div class="card">${spellTable()}</div>`;
    };

    // ---- the tab, placed right after Magic ----
    TABS.magi = {
      label: '🧙 Circle', render: city => renderCircle(city),
      badge: () => (S ? G.magiOf(S, OWNER).filter(g => g.loyalty < 35).length : 0),
    };
    if (typeof TAB_GROUPS !== 'undefined') {
      const grp = TAB_GROUPS.find(g => g.id === 'know');
      if (grp && !grp.keys.includes('magi')) { const i = grp.keys.indexOf('magic'); grp.keys.splice(i >= 0 ? i + 1 : grp.keys.length, 0, 'magi'); }
    }
    if (typeof TAB_HELP !== 'undefined') TAB_HELP.magi = 'magi';

    // ---- city header: the court magus ----
    CITY_EXTRAS.push(city => {
      if (!S || !city || city.owner !== OWNER) return '';
      const g = G.courtMagusOf(S, city);
      if (!g) {
        if (!G.lvl(city, 'magetower') || !G.magiOf(S, OWNER).length) return '';
        return `<button class="mgi-chip muted" data-act="tab" data-t="magi" title="No court magus in ${esc(city.name)}">🧙 No court magus</button>`;
      }
      const fx = G.magiCourtFx(S, g, city);
      return `<button class="mgi-chip" data-act="tab" data-t="magi" style="--school:${SC(g.school).color}" title="${esc(`${g.name}, ${G.magusRankName(g)} of ${SC(g.school).name}: ${pct(fx.mana)} mana here, spells cast from here ${pct(fx.cost)} cost and ${pct(fx.power)} power${g.status === 'riding' ? ' (on arrival)' : ''}`)}">${ptHtml(G.magusSpec(S, OWNER, g), 20, 'pt-inline', g.name)} 👑 ${esc(g.name)} <span class="muted">${pct(fx.mana)} ✨</span></button>`;
    });

    // ---- Military tab: the war magi of this city ----
    if (typeof MILITARY_EXTRAS !== 'undefined') MILITARY_EXTRAS.push(city => {
      if (!S || city.owner !== OWNER) return '';
      const all = G.magiOf(S, OWNER);
      if (!all.length) return '';
      const war = all.filter(g => g.station === 'war' && g.city === city.id);
      const court = G.courtMagusOf(S, city);
      const row = g => `<div class="pt-champ" style="margin:6px 0;align-items:flex-start">${pic(OWNER, g, 40)}<div style="flex:1;min-width:0"><b>${esc(g.name)}</b> · ${G.magusRankName(g)} ${schoolPill(g.school)}
        <div class="muted" style="font-size:12.5px">${where(g)} · ❤️ ${Math.floor(g.hp)}${g.guard ? ' · guards the city' : g.hp < G.MAGI.minHp ? ' · too hurt to ride' : ' · rides with the next march (10+ soldiers)'}</div>
        <div style="font-size:12.5px">${G.magusBattleSpells(g).map(b => `${b.icon} ${esc(b.name)}`).join(' · ')}</div></div></div>`;
      return `<div class="card"><h3>🧙 War magi in ${esc(city.name)} <span class="muted" style="font-size:13px">${war.length}</span></h3>
        ${war.length ? war.map(row).join('') : `<p class="muted" style="font-size:12.5px">No war magi here. Post one from the 🧙 Circle tab: they ride with raids, attacks and conquests leaving ${esc(city.name)} (up to ${G.MAGI.maxRiders} per march) and defend it while home.</p>`}
        ${court ? `<div class="muted" style="font-size:12.5px">👑 ${esc(court.name)}, the court magus, helps counter spells cast against ${esc(city.name)}.</div>` : ''}
        <button class="small" data-act="tab" data-t="magi">🧙 Circle of Magi</button></div>`;
    });

    // ---- battle reports: what each magus did ----
    if (typeof REPORT_EXTRAS !== 'undefined') REPORT_EXTRAS.push(b => {
      const rec = b && b.magi;
      if (!rec || (!rec.att.length && !rec.def.length && !rec.duel)) return '';
      const one = (x, side) => `<div class="mgi-rep" style="--school:${SC(x.school).color}">${ptHtml(G.magusSpec(S, x.owner, { ...x, bornS: null, age: x.age, dead: x.fate && /fell|slain/.test(x.fate) }), 36, 'pt-card', x.name) || '🧙'}<div><span class="muted">${side}</span> <b>${esc(x.name)}</b> · ${G.MAGI.ranks[(x.rank || 1) - 1]}
        <div>${x.did.map(d => esc(d)).join('<br>')}${x.fate ? `<div class="${/fell|slain/.test(x.fate) ? 'bad' : 'warn'}">${esc(x.fate)}</div>` : ''}</div></div></div>`;
      return `<div class="mgi-reps">${rec.duel ? `<div class="mgi-duel">⚡ Duel of magi: <b>${esc(rec.duel.winnerName)}</b> overcame ${esc(rec.duel.loserName)}${rec.duel.killed ? ' — slain' : ''}.</div>` : ''}
        ${rec.att.map(x => one(x, 'Attacker')).join('')}${rec.def.map(x => one(x, 'Defender')).join('')}</div>`;
    });
    // ---- movements: magi riding with a march ----
    if (typeof MOVE_EXTRAS !== 'undefined') MOVE_EXTRAS.push(m => {
      if (!m.magi || !m.magi.length) return '';
      const gs = m.magi.map(id => G.magusById(S, m.owner, id)).filter(Boolean);
      return gs.length ? `<div style="font-size:12px">🧙 ${gs.map(g => `${ptHtml(G.magusSpec(S, m.owner, g), 20, 'pt-inline', g.name)} ${esc(g.name)}`).join(', ')}</div>` : '';
    });
    // ---- diplomacy: a rival's great magi ----
    if (typeof REALM_EXTRAS !== 'undefined') REALM_EXTRAS.push(emp => {
      if (!S || emp.id === OWNER || !S.magi || !S.magi.realms[emp.id]) return '';
      const top = S.magi.realms[emp.id].list.filter(g => g.rank >= 3).sort((a, b) => b.rank - a.rank).slice(0, 3);
      if (!top.length) return '';
      return `<div style="margin-top:6px;font-size:13px">Great magi: ${top.map(g => `<span class="pt-cell" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">${ptHtml(G.magusSpec(S, emp.id, g), 28, '', g.name)} <b>${esc(g.name)}</b> <span class="muted">${G.magusRankName(g)} · ${SC(g.school).icon} ${esc(SC(g.school).name)}</span></span>`).join('')}</div>`;
    });

    // ---- help ----
    if (typeof HELP_SECTIONS !== 'undefined' && !HELP_SECTIONS.some(h => h.id === 'magi')) {
      const i = HELP_SECTIONS.findIndex(h => h.id === 'magic');
      HELP_SECTIONS.splice(i >= 0 ? i + 1 : HELP_SECTIONS.length, 0, { id: 'magi', icon: '🧙', title: 'Circle of Magi', tabs: ['magi'], words: 'magi magus mage wizard court war study archmage apprentice duel counterspell battle spells loyalty defect rogue apprentice circle',
        html: '<p>Named magi serve your realm. Candidates appear at cities with a <b>Mage Tower</b>; you can keep <b>1 magus per 4 tower levels</b> (at most 10). Each costs gold and mana to recruit and <b>0.5–1.3 mana a minute</b> (by rank) in upkeep, shown in their city\'s economy.</p><ul><li><b>👑 Court Magus</b> (one per tower city): +12% mana there (+4% per rank), spells cast from that city −3% cost and +3% power per rank, weave strain there fades 0.5/min faster per rank.</li><li><b>⚔️ War Magus</b>: rides with raids, attacks and conquests of 10+ soldiers leaving their city (up to 3 per march) and defends it while home. Casts a school battle spell (volley, shield, rout, summoning or hex; a second at rank Magus); an Archmage casts two. Each cast costs 10 + 8 × rank mana.</li><li><b>📚 Study</b>: speeds the realm\'s grimoire study (+4% each, +2% per rank, up to +60%).</li></ul><p><b>In battle</b> the two champions duel (rank, traits and luck): the loser casts nothing and is wounded, sometimes slain. A magus may <b>counter</b> one enemy spell of a lower rank; battle mages in the army add +0.05 rank each (at most +1.5) and +2% spell strength each (at most +40%).</p><p>Ranks: Apprentice → Adept → Magus → Master → Archmage. Loyalty settles near 70; mana shortages, ambition and rivals\' gifts lower it, and below 25 a magus may defect or go rogue. Magi age with the calendar: the old may die, and a Magus or higher leaves an apprentice to take up the post.</p>' });
    }
    if (typeof HELP_GLOSSARY !== 'undefined') {
      HELP_GLOSSARY.push(['Court Magus', 'A magus posted to a city: more mana there, cheaper and stronger spells cast from it.', 'magi']);
      HELP_GLOSSARY.push(['War Magus', 'A magus who rides with armies from their city, casting battle spells and duelling enemy magi.', 'magi']);
      HELP_GLOSSARY.push(['Counterspell', 'A magus stops one enemy battle spell of a lower rank.', 'magi']);
    }

    Object.assign(act, {
      mgiRecruit: d => { const e = G.recruitMagus(S, OWNER, +d.i); toast(e || 'A new magus joins the Circle'); render(true); },
      mgiStation: d => { const e = G.stationMagus(S, OWNER, d.g, d.s, d.c); toast(e || 'The magus takes up the post'); render(true); },
      mgiGuard: d => { const g = G.magusById(S, OWNER, d.g); if (g) G.setMagusGuard(S, OWNER, d.g, !g.guard); render(true); },
      mgiHonor: d => { const e = G.honorMagus(S, OWNER, d.g); toast(e || 'Gifts and honours: loyalty rises'); render(true); },
      mgiDismiss: d => { if (typeof confirm === 'function' && !confirm('Dismiss this magus for good?')) return; const e = G.dismissMagus(S, OWNER, d.g); toast(e || 'The magus leaves the Circle'); render(true); },
    });
  }
}
