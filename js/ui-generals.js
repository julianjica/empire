// =====================================================================
//  Generals UI: the Generals card on the Military tab (appoint, station,
//  ransom, garrison stance), generals in battle reports, in Movements and
//  rivals' famous generals on Diplomacy realm cards. Engine: generals.js.
//  The send form's general/stance pickers live in ui-world.js (sendForm).
// =====================================================================
'use strict';
{
  if (G.generalsOf && typeof MILITARY_EXTRAS !== 'undefined') {
    const T = k => DATA.generalTraits[k] || { name: k, icon: '', desc: '' };
    const traitsHtml = traits => (traits || []).map(k => `<span class="pill" title="${esc(T(k).desc)}">${T(k).icon} ${esc(T(k).name)}</span>`).join(' ');
    const pic = (owner, g, size) => ptHtml(G.generalSpec(S, owner, g), size, 'pt-card', g.name) || '🎖️';
    const where = (owner, g) => {
      if (g.status === 'home') return `in ${esc((S.cities[g.city] || {}).name || '?')}`;
      if (g.status === 'riding') return `riding to ${esc((S.cities[g.city] || {}).name || '?')} (${fmtTime(realSecs(Math.max(0, (g.until || 0) - S.time)))})`;
      if (g.status === 'marching') { const m = S.moves.find(x => x.id === g.move); return m ? `${m.type === 'return' ? 'coming home' : 'in the field'} (${fmtTime(realSecs(Math.max(0, m.arrive - S.time)))})` : 'in the field'; }
      if (g.status === 'captured') return `<span class="bad">captive of the ${esc((S.empires[g.captor] || {}).name || 'enemy')}</span> · freed in ${fmtTime(realSecs(Math.max(0, (g.releaseAt || 0) - S.time)))}`;
      return esc(g.status);
    };
    const genRow = (city, g) => {
      const need = G.generalXpNeed(g.level);
      const btns = [];
      if (g.status === 'home' && g.city !== city.id) btns.push(`<button class="small" data-act="genStation" data-g="${esc(g.id)}" data-c="${esc(city.id)}">Station in ${esc(city.name)}</button>`);
      if (g.status === 'captured') btns.push(`<button class="small" data-act="genRansom" data-g="${esc(g.id)}">Ransom (🪙 ${G.ransomCost(g).gold})</button>`);
      if (g.status === 'home' || g.status === 'riding') btns.push(`<button class="small" data-act="genDismiss" data-g="${esc(g.id)}">Retire</button>`);
      return `<div class="pt-champ" style="margin:8px 0;align-items:flex-start">${pic('p', g, 48)}<div style="flex:1;min-width:0">
        <div><b>${esc(g.name)}</b> · level ${g.level}${g.level < G.GEN.maxLevel ? ` <span class="muted" style="font-size:12px">(${Math.floor(g.xp)}/${need} xp)</span>` : ''} · <span class="${g.hp < G.GEN.minHp ? 'bad' : 'muted'}">❤️ ${Math.floor(g.hp)}</span></div>
        <div style="font-size:12.5px">${traitsHtml(g.traits)} <span class="muted">· leadership +${Math.round((G.generalLeadership(g) - 1) * 100)}% · ${g.battles || 0} battle${(g.battles || 0) === 1 ? '' : 's'}, ${g.wins || 0} won</span></div>
        <div class="muted" style="font-size:12.5px">${where('p', g)}${G.commanderOf(S, S.cities[g.city]) === g ? ' · <b>commands the garrison</b>' : ''}</div>
        ${btns.length ? `<div class="row" style="margin-top:4px;flex-wrap:wrap;gap:4px">${btns.join('')}</div>` : ''}</div></div>`;
    };
    MILITARY_EXTRAS.push(city => {
      const gens = G.generalsOf(S, 'p');
      const cap = G.generalCap(S, 'p'), cost = G.generalCost(S, 'p').gold;
      const why = G.canRecruitGeneral(S, 'p', city.id);
      const pool = G.lvl(city, 'barracks') >= G.GEN.barracks && gens.length < cap ? G.generalPool(S, 'p') : null;
      const cmd = G.commanderOf(S, city);
      const gs = G.garrisonStanceOf(city);
      const stanceBtns = DATA.garrisonStanceOrder.map(k => { const d = DATA.garrisonStances[k]; return `<button class="small ${gs === k ? 'primary' : ''}" data-act="garStance" data-c="${esc(city.id)}" data-s="${k}" title="${esc(d.desc)}">${d.icon} ${d.name}</button>`; }).join('');
      const captives = Object.values(S.empires).filter(e => e.id !== 'p').flatMap(e => (e.generals || []).filter(g => g.status === 'captured' && g.captor === 'p').map(g => [e, g]));
      const fallen = (S.empires.p.fallenGenerals || []).slice(0, 4);
      return `<div class="card"><h3>🎖️ Generals <span class="muted" style="font-size:13px">${gens.length}/${cap}</span></h3>
        <p class="muted" style="font-size:12.5px">Generals lead armies (pick one in the World map send form): +1.5% attack per level plus their traits. A general at home commands that city's garrison. They can be wounded, captured or, rarely, killed. Each draws ${G.GEN.wage * 60} gold an hour. The realm can keep 1 general, +1 per 3 cities and per ${G.GEN.renownPer} renown (at most ${G.GEN.capMax}).</p>
        <div style="margin:6px 0"><b>Garrison of ${esc(city.name)}</b>: ${cmd ? `commanded by ${esc(cmd.name)}` : '<span class="muted">no general in command</span>'}
          <div class="row" style="margin-top:4px;flex-wrap:wrap;gap:4px">${stanceBtns}</div>
          <div class="muted" style="font-size:12px;margin-top:2px">${esc(DATA.garrisonStances[gs].desc)}</div></div>
        ${gens.length ? gens.map(g => genRow(city, g)).join('') : '<p class="muted">No generals appointed yet.</p>'}
        ${pool ? `<div class="group-title" style="margin-top:8px">Candidates <span class="muted" style="font-size:12px">· 🪙 ${cost} · new faces in ${fmtTime(realSecs(Math.max(0, pool.next - S.time)))}</span></div>
          ${pool.list.map((g, i) => `<div class="pt-champ" style="margin:6px 0;align-items:flex-start">${pic('p', g, 40)}<div style="flex:1;min-width:0"><b>${esc(g.name)}</b> · level ${g.level}<div style="font-size:12.5px">${traitsHtml(g.traits)}</div>
            <button class="small primary" data-act="genRecruit" data-c="${esc(city.id)}" data-i="${i}" ${why ? 'disabled' : ''} title="${esc(why || 'Appoint for ' + cost + ' gold')}">Appoint (🪙 ${cost})</button></div></div>`).join('')}
          ${why ? `<div class="warn" style="font-size:12px">${esc(why)}</div>` : ''}`
        : `<p class="muted" style="font-size:12.5px">${esc(why || '')}</p>`}
        ${captives.length ? `<div class="group-title">Captives in our hands</div><div style="font-size:12.5px">${captives.map(([e, g]) => `${pic(e.id, g, 28)} ${esc(g.name)} of the ${esc(e.name)} (level ${g.level})`).join(' · ')}</div>` : ''}
        ${fallen.length ? `<div class="muted" style="font-size:12px;margin-top:6px">Fallen: ${fallen.map(f => `${esc(f.name)} (level ${f.level}, ${esc(f.where || 'in battle')})`).join(' · ')}</div>` : ''}
      </div>`;
    });

    // battle reports: the generals who fought, their traits and what became of them
    REPORT_EXTRAS.push(b => {
      const gi = b && b.generals;
      if (!gi || (!gi.att && !gi.def)) return '';
      const one = (x, side) => {
        if (!x) return '';
        const spec = { race: x.race || 'hearth', kind: 'hero', seed: 'general:' + x.seed, color: (S.empires[x.owner] || {}).color, rank: Math.min(10, x.level || 1), dead: x.fate === 'killed' };
        const fate = x.fate ? ` · <span class="${x.fate === 'unhurt' ? 'good' : 'bad'}">${esc(x.fate)}</span>` : '';
        return `<div class="pt-champ" style="font-size:12.5px">${ptHtml(spec, 40, 'pt-card', x.name) || '🎖️'}<div>${side}: <b>${esc(x.name)}</b> · level ${x.level || 1}${fate}<div>${traitsHtml(x.traits)}</div></div></div>`;
      };
      return `<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:10px">${one(gi.att, 'Attacking general')}${one(gi.def, 'Garrison commander')}</div>`;
    });

    // Movements: who leads the march and with what orders
    MOVE_EXTRAS.push(m => {
      const g = m.general && G.generalById(S, m.owner, m.general);
      const st = m.stance && DATA.stances[m.stance];
      if (!g && !st) return '';
      return `<div style="font-size:12px">${g ? `${ptHtml(G.generalSpec(S, m.owner, g), 22, 'pt-inline', g.name)} ${esc(g.name)}` : ''}${g && st ? ' · ' : ''}${st ? `${st.icon} ${esc(st.name)}` : ''}</div>`;
    });

    // Diplomacy: a rival's famous generals
    REALM_EXTRAS.push(emp => {
      if (emp.id === 'p') return '';
      const fam = (emp.generals || []).filter(g => g.level >= 4 || (g.wins || 0) >= 3).sort((a, b) => b.level - a.level).slice(0, 3);
      if (!fam.length) return '';
      return `<div style="margin-top:6px;font-size:13px">Famous generals: ${fam.map(g => `<span class="pt-cell" style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">${ptHtml(G.generalSpec(S, emp.id, g), 28, '', g.name)} <b>${esc(g.name)}</b> <span class="muted">lvl ${g.level} · ${g.traits.map(k => T(k).icon + ' ' + esc(T(k).name)).join(', ')}${g.status === 'captured' ? ' · captive' : ''}</span></span>`).join('')}</div>`;
    });

    Object.assign(act, {
      genRecruit: d => { const e = G.recruitGeneral(S, 'p', d.c, +d.i); toast(e || 'A new general is appointed'); render(true); },
      genStation: d => { const e = G.stationGeneral(S, 'p', d.g, d.c); toast(e || 'The general rides out'); render(true); },
      genDismiss: d => { if (typeof confirm === 'function' && !confirm('Retire this general for good?')) return; const e = G.dismissGeneral(S, 'p', d.g); toast(e || 'The general retires'); render(true); },
      genRansom: d => { const e = G.ransomGeneral(S, 'p', d.g); toast(e || 'Ransom paid'); render(true); },
      garStance: d => { const e = G.setGarrisonStance(S, d.c, d.s); if (e) toast(e); render(true); },
    });
  }
}
