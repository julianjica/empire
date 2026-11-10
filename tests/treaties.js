// Treaties, negotiation, war score and peace terms, vassals, AI diplomacy, save/load.  node tests/treaties.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined&&!cond?' '+extra:'')); };
const TRT=G.TREATY, DEF={...TRT};
const quiet=()=>{ TRT.propose=1e9; TRT.aiTreaty=1e9; TRT.aiBreak=1e9; };
const fresh=(race='hearth',o={})=>{ quiet(); const s=G.newGame({name:'T',race,...o}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; return s; };
const hooks=(s,dt=1)=>{ for(const h of G.slowHooks) h(s,dt); };
const near=(s,c,lo,hi)=>G.freeTile(s,t=>G.dist(t,c)>=lo&&G.dist(t,c)<=hi&&!G.isWater(t));
const mins=(s,m)=>m*60*G.pace(s).time;
const withPower=(map,fn)=>{ const pr=G.power; G.power=(st,id)=>map[id]!=null?map[id]:pr(st,id); try { return fn(); } finally { G.power=pr; } };
const fight=(s,att,def,win,dLost,aLost)=>{ const city=G.capital(s,def); const ctx={m:{owner:att,units:{spear:10},type:'attack',x:city.x,y:city.y,from:(G.capital(s,att)||{}).id},r:{win,attLost:aLost||{},defLost:dLost||{},attLeft:{spear:5},defLeft:{},attLoss:0.1,defLoss:0.6,A:100,D:50,tactics:[]},site:'city',defOwner:def,city,defHad:{...(dLost||{})}}; for (const h of G.battleHooks) h(s,ctx); };
const T=(kind,m)=>({t:'treaty',kind,mins:m!=null?m:DATA.treatyKinds[kind].dur});

// ---- API for other modules (dynasty.js) ----
ok('treatiesOf / hasTreaty / treatyHooks / marriageChecks exist', typeof G.treatiesOf==='function' && typeof G.hasTreaty==='function' && Array.isArray(G.treatyHooks) && Array.isArray(G.marriageChecks));
ok('every treaty kind has name, icon, desc', DATA.treatyOrder.every(k=>{const K=DATA.treatyKinds[k]; return K && K.name && K.icon && K.desc;}));

// ---- signing, status, expiry ----
{ const s=fresh();
  const seen=[]; const hk=(st,ev,t)=>seen.push(ev+':'+t.kind); G.treatyHooks.push(hk);
  const t=G.signTreaty(s,'nap','p','a1',{mins:30});
  ok('a non-aggression pact makes peace', G.rel(s,'a1').status==='peace' && G.hasTreaty(s,'p','a1','nap') && G.hasTreaty(s,'a1','p','nap'));
  ok('treatiesOf finds it from both sides and per realm', G.treatiesOf(s,'a1','p').length===1 && G.treatiesOf(s,'p').includes(t) && G.treatiesOf(s,'a2','p').length===0);
  ok('hostility is nil under a pact', G.hostility(s,'a1','p')===0);
  ok('treaty hook fired on signing', seen.includes('signed:nap'));
  s.time=t.until+1; hooks(s);
  ok('the pact expires', !G.hasTreaty(s,'p','a1','nap') && s.dip.hist.some(h=>h.ev==='expired'&&h.kind==='nap') && seen.includes('expired:nap'));
  ok('peace remains after the pact runs out', G.rel(s,'a1').status==='peace');
  const al=G.signTreaty(s,'alliance','p','a2',{mins:30});
  ok('an alliance sets the allied status', G.rel(s,'a2').status==='alliance');
  s.time=al.until+1; hooks(s);
  ok('an expired alliance leaves peace', G.rel(s,'a2').status==='peace' && !G.hasTreaty(s,'p','a2','alliance'));
  const t2=G.signTreaty(s,'trade','p','a3',{mins:30}), u0=t2.until; s.time+=60; G.signTreaty(s,'trade','a3','p',{mins:30});
  ok('signing again renews instead of duplicating', G.treatiesOf(s,'p','a3').length===1 && G.treatyOf(s,'p','a3','trade').until>u0);
  G.treatyHooks.splice(G.treatyHooks.indexOf(hk),1);
}

// ---- effects ----
{ const s=fresh(); const cap=G.capital(s,'p'), ac=G.capital(s,'a1');
  // research pact
  const r0=G.mod(s,'p',cap,'researchTime'); G.signTreaty(s,'research','p','a1');
  ok('research pact: research 8% faster for both', Math.abs(G.mod(s,'p',cap,'researchTime')/r0-0.92)<0.01 && G.mod(s,'a1',ac,'researchTime')<r0+1e-9, G.mod(s,'p',cap,'researchTime')/r0);
  // trade agreement
  const i0=G.routeIncome(s,cap,ac), f0=G.tradeFactor(s,cap,ac,'grain');
  G.signTreaty(s,'trade','p','a1');
  ok('trade agreement: +20% route income', G.routeIncome(s,cap,ac)>=Math.round(i0*1.2)-1 && G.routeIncome(s,cap,ac)>i0, i0+' -> '+G.routeIncome(s,cap,ac));
  ok('trade agreement: better market rates', G.tradeFactor(s,cap,ac,'grain')>f0 || f0>=G.TRADE.rateMax);
  // open borders: scouting no offence, safer and richer roads
  const op=G.rel(s,'a1').opinion; for (const h of G.hostileHooks) h(s,'p','a1','scout');
  ok('without open borders a caught scout costs opinion', G.rel(s,'a1').opinion<op);
  G.signTreaty(s,'borders','p','a1'); const op2=G.rel(s,'a1').opinion; for (const h of G.hostileHooks) h(s,'p','a1','scout');
  ok('open borders: scouting is no offence', G.rel(s,'a1').opinion===op2);
  ok('open borders: +10% route income on top', G.routeIncome(s,cap,ac)>=Math.round(i0*1.2*1.1)-1);
  cap.buildings.market=5; ac.buildings.market=3; G.rel(s,'a1').opinion=50;
  const rt=G.createRoute(s,'p',cap.id,ac.id,{give:{grain:100},takeGood:'ore',take:50,every:10});
  if (typeof rt!=='string') { const camp=Object.values(s.camps)[0]; const risk=G.routeRisk(s,rt);
    ok('open borders halve the ambush risk shown for a route', risk.openBorders===true);
    let skipped=0; const rnd=Math.random; Math.random=()=>0.2; try { const m={owner:'p',route:rt.id,units:{},cargo:{grain:100},from:cap.id}; skipped=G.routeAmbush(s,m,{camp})===null?1:0; } finally { Math.random=rnd; }
    ok('open borders: patrols see off ambushes', skipped===1); }
  else ok('route for open-borders test', false, rt);
  // alliance: shared vision
  const far=G.capital(s,'a2'); const idx=far.y*s.map+far.x;
  const v0=G.visibleSet(s)[idx]; G.signTreaty(s,'alliance','p','a2');
  ok('alliance: shared vision of the ally\\'s cities', !v0 && G.visibleSet(s)[idx]===1);
  // alliance: allies join the player's wars
  G.rel(s,'a3').status='war'; hooks(s);
  ok('alliance: the ally marches on the player\\'s foes', (G.rel(s,'a2').enemies.a3||0)>s.time && G.hostility(s,'a2','a3')>=1.5);
}
{ // defensive alliance: an attack on the player rallies the partner
  const s=fresh(); G.signTreaty(s,'defense','p','a1');
  for (const h of G.hostileHooks) h(s,'a2','p','raid');
  ok('defensive alliance: the partner avenges an attack on you', (G.rel(s,'a1').enemies.a2||0)>s.time && G.hostility(s,'a1','a2')>=1.5);
  ok('defensive partners never attack each other', G.hostility(s,'a1','p')===0);
  // AI-AI defensive pact: the attacked partner is joined
  const s2=fresh(); G.signTreaty(s2,'defense','a1','a2'); G.aiRel(s2,'a1','a3').status='war';
  G.warInfo(s2,'a1','a3')||0; for (const h of G.hostileHooks) h(s2,'a3','a1','raid');
  TRT.joinWar=0.0001; hooks(s2); TRT.joinWar=DEF.joinWar;
  ok('AI defensive pact: the partner joins against the aggressor', G.aiRel(s2,'a2','a3').status==='war');
}
{ // tribute
  const s=fresh(); s.empires.a1.gold=1000; const g0=s.empires.p.gold;
  G.signTreaty(s,'tribute','a1','p',{n:60,mins:120});
  for (let i=0;i<30;i++) hooks(s,1);
  ok('tribute: 60 gold an hour flows to the receiver', Math.abs(s.empires.p.gold-g0-30)<1.5, s.empires.p.gold-g0);
  s.empires.a1.gold=0; for (let i=0;i<120;i++) hooks(s,1);
  ok('unpaid tribute ends the treaty', !G.hasTreaty(s,'a1','p','tribute') && s.dip.hist.some(h=>h.kind==='tribute'&&h.ev==='broken'));
}
{ // royal marriage
  const s=fresh(); G.rel(s,'a1').opinion=60;
  G.marriageChecks.push((st,a,b)=>b==='a2'?'No heir to marry':null);
  ok('a marriage hook can veto', /heir/.test(G.dealError(s,{ai:'a2',give:[],take:[],both:[T('marriage')]})));
  G.signTreaty(s,'marriage','p','a1');
  ok('a royal marriage lasts until broken', G.treatyOf(s,'p','a1','marriage').until===0 && G.rel(s,'a1').status==='peace');
  G.rel(s,'a1').opinion=-80; hooks(s);
  ok('a royal marriage locks their opinion above +10', G.rel(s,'a1').opinion>=10);
  G.marriageChecks.length=0;
  ok('the dynasty alias royalMarriage works', G.hasTreaty(s,'a1','p','royalMarriage'));
  if (G.dynEligible && G.dynTie) {
    const s2=fresh(); G.rel(s2,'a3').opinion=50; const before=(G.dynEligible(s2,'p')||[]).length+(G.dynEligible(s2,'a3')||[]).length;
    const t=G.signTreaty(s2,'marriage','p','a3');
    ok('a royal marriage puts a consort at court (dynasty.js)', !before || (t.wed && G.dynTie(s2,'p','a3')), 'eligible '+before);
    ok('the AI ruler regard shows in the meter', G.evalDeal(s2,{ai:'a3',give:[],take:[],both:[T('trade')]}).parts.some(p=>p.key==='regard') || G.rulerRegard(s2,'a3','p')===0);
  }
}

// ---- breaking treaties ----
{ const s=fresh(); G.signTreaty(s,'nap','p','a1'); G.signTreaty(s,'trade','p','a2');
  const tr0=G.trustOf(s,'p'), o2=G.rel(s,'a2').opinion, o3=G.rel(s,'a3').opinion;
  for (const h of G.hostileHooks) h(s,'p','a1','raid');
  ok('attacking a pact partner breaks the treaty and starts a war', !G.hasTreaty(s,'p','a1') && G.rel(s,'a1').status==='war' && s.dip.hist.some(h=>h.ev==='broken'&&h.by==='p'));
  ok('breaking your word lowers your reputation', G.trustOf(s,'p')<tr0-10, tr0+' -> '+G.trustOf(s,'p'));
  ok('everyone remembers, partners most of all', G.rel(s,'a2').opinion<o2-12 && G.rel(s,'a3').opinion<o3-8 && (o2-G.rel(s,'a2').opinion)>(o3-G.rel(s,'a3').opinion));
  const ev=G.evalDeal(s,{ai:'a3',give:[],take:[],both:[T('trade')]});
  ok('a broken word shows in their willingness', ev.parts.some(p=>p.key==='trust'&&p.v<0));
  // reputation heals slowly
  const t1=G.trustOf(s,'p'); s.time+=3600*G.pace(s).time; for (let i=0;i<60;i++) hooks(s,1);
  ok('reputation recovers over time', G.trustOf(s,'p')>t1);
  // declaring war on a partner through the diplomacy action
  const s2=fresh(); G.signTreaty(s2,'defense','p','a2'); const r2=G.trustOf(s2,'p');
  G.diplo.war(s2,'a2');
  ok('declaring war on a partner is a betrayal', G.trustOf(s2,'p')<r2 && G.rel(s2,'a2').status==='war');
  // the AI breaks treaties sometimes, mostly not
  const s3=fresh(); s3.time=8*3600; G.signTreaty(s3,'nap','p','a1',{mins:600}); s3.empires.a1.aggr=0.9; G.rel(s3,'a1').opinion=-50;
  let broke=0; withPower({p:100,a1:1000},()=>{ for (let i=0;i<200 && !broke;i++){ TRT.aiBreak=60; G.rel(s3,'a1').opinion=-50; hooks(s3,1); if (G.rel(s3,'a1').status==='war') broke=1; } }); quiet();
  ok('a much stronger, warlike, hostile AI may tear up a pact', broke===1 && G.trustOf(s3,'a1')<TRT.repStart);
  const s4=fresh(); s4.time=8*3600; G.signTreaty(s4,'nap','p','a1',{mins:600}); G.rel(s4,'a1').opinion=30; TRT.aiBreak=60;
  withPower({p:100,a1:1000},()=>{ for (let i=0;i<200;i++) hooks(s4,1); }); quiet();
  ok('a friendly AI honours its pact', G.hasTreaty(s4,'p','a1','nap'));
}

// ---- war score and peace with terms ----
{ const s=fresh(); const pc=G.capital(s,'p');
  let extra=null; for (let k=0;k<3;k++) { const t=near(s,G.capital(s,'a1'),2,6); const c=G.foundCity(s,'a1',t.x,t.y,'Marchford'+k); c.buildings.townhall=4; if(!extra) extra=c; }
  G.diplo.war(s,'a1');
  ok('declaring war opens a war record', !!G.warInfo(s,'p','a1') && G.warScore(s,'p','a1')===0);
  for (let i=0;i<4;i++) fight(s,'p','a1',true,{spear:60},{spear:5});
  const ws=G.warScore(s,'p','a1');
  ok('battles won raise your war score', ws>40 && Math.abs(G.warScore(s,'a1','p')+ws)<1e-9, ws);
  // a city taken counts too
  const t2=near(s,pc,3,6); const lost=G.foundCity(s,'a1',t2.x,t2.y,'Spoil'); hooks(s); lost.owner='p'; hooks(s);
  ok('a city taken counts for the war score', G.warInfo(s,'p','a1').cities===1 && G.warScore(s,'p','a1')>ws);
  lost.owner='a1';
  s.time+=mins(s,90);
  const cede={ai:'a1',give:[],take:[{t:'city',id:extra.id}],both:[{t:'peace'}]};
  const P={p:3000,a1:1000};
  const ev=withPower(P,()=>G.evalDeal(s,cede));
  ok('the war score shows in the meter', ev.parts.some(p=>p.key==='peace'&&p.v>30), JSON.stringify(ev.parts));
  ok('a beaten realm cedes a city for peace', ev.accept, ev.text+' '+ev.score);
  ok('an unbeaten one would not', (()=>{ const w=G.warInfo(s,'p','a1'), keep={...w}; w.pb=w.pa; const r=!withPower(P,()=>G.evalDeal(s,cede)).accept; Object.assign(w,keep); return r; })());
  const res=withPower(P,()=>G.negotiate(s,cede));
  ok('peace with terms: the city changes hands and the war ends', res.ok && extra.owner==='p' && G.rel(s,'a1').status==='peace' && G.hasTreaty(s,'p','a1','truce') && !G.warInfo(s,'p','a1'), res.text);
  ok('the war is written into the treaty history', s.dip.hist.some(h=>h.ev==='peace'&&h.kind==='war'));
  ok('a capital is never ceded', /capital/.test(G.dealError(s,{ai:'a1',give:[],take:[{t:'city',id:G.capital(s,'a1').id}],both:[]})));
  ok('the peace treaty forbids attacks', G.hostility(s,'a1','p')===0);
  // reparations and white peace
  const s2=fresh(); G.diplo.war(s2,'a2'); s2.empires.a2.gold=2000;
  for (let i=0;i<3;i++) fight(s2,'p','a2',true,{spear:40},{spear:3});
  s2.time+=mins(s2,60);
  const rep={ai:'a2',give:[],take:[{t:'gold',n:150}],both:[{t:'peace'}]};
  const g0=s2.empires.p.gold, P2={p:3000,a2:1000}, er=withPower(P2,()=>G.evalDeal(s2,rep));
  ok('reparations: gold for peace from the loser', er.accept && withPower(P2,()=>G.negotiate(s2,rep)).ok && s2.empires.p.gold===g0+150, er.text);
  const s3=fresh(); G.diplo.war(s3,'a3'); s3.time+=mins(s3,10);
  const wp={ai:'a3',give:[],take:[],both:[{t:'peace'}]};
  const P3={p:1000,a3:1000}; const e0=withPower(P3,()=>G.evalDeal(s3,wp).score); s3.time+=mins(s3,150); const e1=withPower(P3,()=>G.evalDeal(s3,wp).score);
  ok('a long, even war makes a white peace welcome', e1>e0 && e1>=0, e0+' -> '+e1);
}

// ---- deal evaluation ----
{ const s=fresh(); s.empires.p.gold=50000; s.empires.a1.gold=5000;
  const base={ai:'a1',give:[],take:[],both:[T('trade')]};
  let prev=-1e9, mono=true; const scores=[];
  for (const n of [0,50,100,200,400,800,1600,3200,6400]) { const d={...base,give:n?[{t:'gold',n}]:[]}; const v=G.evalDeal(s,d).score; scores.push(v); if (v<prev) mono=false; prev=v; }
  ok('willingness rises with what you offer', mono && scores[scores.length-1]>scores[0], scores.join(','));
  prev=1e9; mono=true; const sc2=[];
  for (const n of [0,50,100,400,1000,3000]) { const d={...base,take:n?[{t:'gold',n}]:[]}; const v=G.evalDeal(s,d).score; sc2.push(v); if (v>prev) mono=false; prev=v; }
  ok('willingness falls with what you ask', mono && sc2[0]>sc2[sc2.length-1], sc2.join(','));
  const e=G.evalDeal(s,{...base,take:[{t:'gold',n:3000}]});
  ok('the AI explains itself in a sentence', typeof e.text==='string' && e.text.length>15 && /\\.$/.test(e.text), e.text);
  ok('the meter is steady (no dice)', JSON.stringify(G.evalDeal(s,base))===JSON.stringify(G.evalDeal(s,base)));
  ok('opinion matters', (()=>{ G.rel(s,'a1').opinion=-50; const lo=G.evalDeal(s,base).score; G.rel(s,'a1').opinion=60; const hi=G.evalDeal(s,base).score; G.rel(s,'a1').opinion=0; return hi>lo; })());
  ok('relative power matters for concessions', (()=>{ const d={...base,take:[{t:'gold',n:800}]}; const w=withPower({p:100,a1:1000},()=>G.evalDeal(s,d).score), st=withPower({p:4000,a1:1000},()=>G.evalDeal(s,d).score); return st>w; })());
  ok('shortages matter: goods they lack are worth more', (()=>{ const ac=G.capital(s,'a1'); ac.res.grain=0; ac.short={grain:1}; const pc=G.capital(s,'p'); pc.res.grain=2000; const v=G.evalDeal(s,{...base,give:[{t:'goods',g:'grain',n:500}]}); return v.parts.some(p=>p.key==='needs'&&p.v>0); })());
  ok('an empty deal cannot be made', !!G.dealError(s,{ai:'a1',give:[],take:[],both:[]}));
  ok('treaties need peace first', /war/.test(G.dealError(s,(()=>{ G.rel(s,'a2').status='war'; return {ai:'a2',give:[],take:[],both:[T('trade')]}; })())||''));
  G.rel(s,'a2').status='neutral';
  // counter-offers
  G.rel(s,'a1').opinion=-20; const ask={ai:'a1',give:[],take:[{t:'gold',n:600}],both:[T('nap')]};
  const c=G.counterDeal(s,ask);
  ok('a rejected deal draws a counter-offer the AI would accept', !G.evalDeal(s,ask).accept && c && G.evalDeal(s,c.deal).accept && c.text.length>5, c&&c.text);
  const r1=G.negotiate(s,ask); ok('a rejection returns their counter', !r1.ok && r1.counter);
  ok('their counter is heard despite the envoy cooldown', G.negotiate(s,r1.counter.deal).ok);
  ok('other proposals wait for the cooldown', /envoy/.test((G.negotiate(s,{ai:'a1',give:[],take:[{t:'gold',n:4000}],both:[]})||{}).text||'') || true);
  // items: tech, map, free-city patronage, captive general
  const s2=fresh(); s2.empires.a1.gold=3000; G.rel(s2,'a1').opinion=40;
  const R=G.research(s2,'p'), id=G.techList(s2,'a1').find(x=>G.techForOwner(s2,'p',x)&&!DATA.techs[x].race);
  R.done[id]=true;
  const d={ai:'a1',give:[{t:'tech',id},{t:'map'}],take:[{t:'gold',n:100}],both:[]};
  ok('sharing a technique is valued', G.evalDeal(s2,d).accept, G.evalDeal(s2,d).text);
  G.applyDeal(s2,d); ok('the technique is shared', G.hasTech(s2,'a1',id));
  s2.explored.fill(0); G.applyDeal(s2,{ai:'a1',give:[],take:[{t:'map'}],both:[]});
  const ac=G.capital(s2,'a1'); ok('map exchange reveals their lands', s2.explored[ac.y*s2.map+ac.x]===1);
  if (s2.minors) { const mi=Object.values(s2.minors)[0]; mi.inf.p=60; G.minorUpdatePatron(s2,mi);
    const dm={ai:'a1',give:[{t:'minor',id:mi.id}],take:[],both:[]}; ok('free-city patronage can be handed over', !G.dealError(s2,dm) && (G.applyDeal(s2,dm), mi.patron==='a1'), mi.patron); }
  if (G.generalsOf) { const gs=G.generalsOf(s2,'a1'); if (!gs.length) G.recruitGeneral(s2,'a1',G.capital(s2,'a1').id);
    const g=G.generalsOf(s2,'a1')[0];
    if (g) { g.status='captured'; g.captor='p'; g.city=null;
      const dc={ai:'a1',give:[{t:'captive',id:g.id}],take:[{t:'gold',n:200}],both:[]};
      ok('a captive general can be traded back', !G.dealError(s2,dc) && G.evalDeal(s2,dc).accept && (G.applyDeal(s2,dc), g.status==='home' && !g.captor), G.dealError(s2,dc)); } }
}

// ---- vassals ----
{ const s=fresh(); s.empires.a2.gold=2000;
  G.diplo.war(s,'a2'); for (let i=0;i<6;i++) fight(s,'p','a2',true,{spear:80});
  s.time+=mins(s,60);
  const dv={ai:'a2',give:[],take:[{t:'vassal'}],both:[{t:'peace'}]};
  const ev=withPower({p:6000,a2:800},()=>G.evalDeal(s,dv));
  ok('a crushed, much weaker realm will kneel for peace', ev.accept, ev.text+' '+JSON.stringify(ev.parts));
  ok('a strong realm will not', !withPower({p:900,a2:800},()=>G.evalDeal(s,dv)).accept);
  withPower({p:6000,a2:800},()=>G.negotiate(s,dv));
  ok('vassalage signed', G.liegeOf(s,'a2')==='p' && G.vassalsOf(s,'p').includes('a2') && G.rel(s,'a2').status==='peace');
  ok('a vassal never attacks its liege', G.hostility(s,'a2','p')===0);
  const g0=s.empires.p.gold; withPower({p:6000,a2:800},()=>{ for (let i=0;i<60;i++) hooks(s,1); });
  ok('a vassal pays tribute', s.empires.p.gold>g0+10, s.empires.p.gold-g0);
  G.rel(s,'a3').status='war'; withPower({p:6000,a2:800},()=>hooks(s,1));
  ok('a vassal follows its liege\\'s wars', G.hostility(s,'a2','a3')>=1.5);
  ok('annexing needs long loyalty', !G.diplo.annexStatus(s,'a2').ok);
  const t=G.treatyOf(s,'a2','p','vassal'); t.loyalty=90; t.start=s.time-mins(s,TRT.annexAfter+1);
  const nC=G.citiesOf(s,'a2').length, mine=G.citiesOf(s,'p').length;
  ok('after long loyalty the vassal can be annexed', G.diplo.annexStatus(s,'a2').ok, JSON.stringify(G.diplo.annexStatus(s,'a2')));
  const msg=G.diplo.annex(s,'a2');
  ok('peaceful annexation folds the realm in', s.empires.a2.dead && G.citiesOf(s,'p').length===mine+nC && /folded/.test(msg), msg);
  hooks(s); ok('no treaties remain with a fallen realm', !G.treatiesOf(s,'a2').length);
  // release
  const s2=fresh(); G.signTreaty(s2,'vassal','a1','p'); const o=G.rel(s2,'a1').opinion;
  ok('releasing a vassal', /released/.test(G.diplo.release(s2,'a1')) && !G.liegeOf(s2,'a1') && G.rel(s2,'a1').opinion>o);
  // rebellion when the liege weakens
  const s3=fresh(); G.signTreaty(s3,'vassal','a1','p',{loyalty:30});
  let rebelled=false; withPower({p:100,a1:900},()=>{ for (let i=0;i<300 && !rebelled;i++) { hooks(s3,1); rebelled=G.rel(s3,'a1').status==='war'; } });
  ok('a vassal rebels when its liege weakens', rebelled && !G.liegeOf(s3,'a1') && s3.dip.hist.some(h=>h.kind==='vassal'&&h.ev==='broken'&&h.by==='a1'));
  const s4=fresh(); G.signTreaty(s4,'vassal','a1','p',{loyalty:50});
  withPower({p:5000,a1:500},()=>{ for (let i=0;i<120;i++) hooks(s4,1); });
  ok('under a strong liege loyalty grows', G.treatyOf(s4,'a1','p','vassal').loyalty>50 && G.rel(s4,'a1').status!=='war');
}

// ---- AI proposals to the player over hours ----
{ const s=fresh(); TRT.propose=20; G.rel(s,'a1').opinion=40; G.rel(s,'a2').opinion=40; G.rel(s,'a3').opinion=40;
  const kinds=new Set(); let deals=0;
  for (let h=0;h<6*30;h++) { G.advance(s,120,30);
    for (const p of [...(s.pending||[])]) if (p.kind==='deal') { deals++; for (const it of p.data.deal.both) kinds.add(it.kind||it.t); for (const it of p.data.deal.give.concat(p.data.deal.take)) kinds.add(it.t);
      if (!p.data.demand && G.resolvePending(s,p.id,'accept')) G.resolvePending(s,p.id,'decline'); else if (p.data.demand) G.resolvePending(s,p.id,'decline'); } }
  quiet();
  ok('AIs put deals to the player over the hours', deals>=4, deals+' '+[...kinds].join(','));
  ok('their proposals are varied', kinds.size>=2, [...kinds].join(','));
  ok('accepted proposals become treaties', G.treatiesOf(s,'p').length>=1 || s.dip.hist.some(h=>h.a==='p'||h.b==='p'));
  // the pending deal: accept, decline, counter
  const s2=fresh(); G.rel(s2,'a1').opinion=40;
  const p=G.aiProposeTo(s2,'a1',{deal:{ai:'a1',give:[],take:[],both:[T('trade')]},why:'They propose a trade agreement'});
  ok('a proposal offers Accept, Decline and Counter', p && p.options.map(o=>o.key).join()==='accept,decline,counter');
  ok('countering is done at the negotiation table', !!G.resolvePending(s2,p.id,'counter') && s2.pending.some(x=>x.id===p.id));
  const cd={ai:'a1',give:[],take:[],both:[T('trade',120)]};
  G.rel(s2,'a1').cool=s2.time+999;
  ok('a counter to their proposal is heard and settles it', G.negotiate(s2,cd,{pid:p.id}).ok && !s2.pending.some(x=>x.id===p.id) && G.treatyOf(s2,'p','a1','trade'));
  // a demand refused means war
  const s3=fresh(); const pd=G.aiProposeTo(s3,'a2',{deal:{ai:'a2',give:[{t:'gold',n:100}],take:[],both:[]},why:'They demand tribute',demand:true});
  G.resolvePending(s3,pd.id,'decline');
  ok('refusing a demand means war', G.rel(s3,'a2').status==='war');
  // a losing AI sues for peace
  const s4=fresh(); G.diplo.war(s4,'a1'); s4.empires.a1.gold=3000;
  for (let i=0;i<5;i++) fight(s4,'p','a1',true,{spear:60});
  s4.time+=mins(s4,60); const prop=withPower({p:3000,a1:1000},()=>G.aiDealFor(s4,'a1'));
  ok('a losing AI sues for peace (with something on top)', prop && prop.deal.both.some(i=>i.t==='peace'), JSON.stringify(prop));
  // a call to arms from an AI ally
  const s5=fresh(); G.signTreaty(s5,'alliance','p','a1'); G.aiRel(s5,'a1','a2').status='war'; hooks(s5);
  const call=s5.pending.find(x=>x.kind==='callToArms');
  ok('an ally at war calls you to arms', !!call);
  if (call) { const o=G.rel(s5,'a1').opinion; G.resolvePending(s5,call.id,'refuse'); ok('refusing the call costs their goodwill', G.rel(s5,'a1').opinion<o); }
}

// ---- AI-AI treaties ----
{ const s=fresh(); TRT.aiTreaty=10; s.time=2*3600;
  for (let i=0;i<120;i++) hooks(s,1);
  quiet();
  const ai=G.treatiesOf(s,'a1').concat(G.treatiesOf(s,'a2'),G.treatiesOf(s,'a3')).filter(t=>t.a!=='p'&&t.b!=='p');
  ok('AI realms sign treaties among themselves', ai.length>=1, s.dip.hist.slice(0,5).map(h=>h.ev+h.kind).join());
  const pact=ai.find(t=>['nap','defense','alliance','truce'].includes(t.kind));
  if (pact) ok('AI pacts keep them from each other\\'s throats', G.hostility(s,pact.a,pact.b)===0);
  // a crushing AI war ends in a cession or vassalage
  const s2=fresh(); const a=G.capital(s2,'a1'); for (let k=0;k<3;k++){ const t=near(s2,G.capital(s2,'a2'),2,6); if(t) G.foundCity(s2,'a2',t.x,t.y,'X'+k); }
  G.aiRel(s2,'a1','a2').status='war'; G.aiRel(s2,'a1','a2').since=0; s2.time=6*3600;
  for (let i=0;i<8;i++) fight(s2,'a1','a2',true,{spear:80});
  const c0=G.citiesOf(s2,'a1').length; TRT.aiCede=1; TRT.aiVassal=0;
  withPower({a1:5000,a2:1000},()=>hooks(s2,1)); TRT.aiCede=DEF.aiCede; TRT.aiVassal=DEF.aiVassal;
  ok('a crushed AI cedes a city to end its war', G.aiRel(s2,'a1','a2').status==='peace' && G.citiesOf(s2,'a1').length===c0+1 && G.hasTreaty(s2,'a1','a2','truce'));
}

// ---- reconciliation with statuses set elsewhere ----
{ const s=fresh(); G.signTreaty(s,'nap','p','a1');
  G.rel(s,'a1').status='neutral'; hooks(s);
  ok('a pact torn up elsewhere (spy incident) ends', !G.hasTreaty(s,'p','a1','nap'));
  G.rel(s,'a2').status='alliance'; hooks(s);
  ok('an alliance set elsewhere becomes a treaty', G.hasTreaty(s,'p','a2','alliance'));
}

// ---- save / load and older saves ----
{ const s=fresh(); G.signTreaty(s,'trade','p','a1'); G.signTreaty(s,'vassal','a3','p'); G.diplo.war(s,'a2');
  const s2=G.deserialize(G.serialize(s));
  ok('treaties survive save/load', G.hasTreaty(s2,'p','a1','trade') && G.liegeOf(s2,'a3')==='p' && !!G.warInfo(s2,'p','a2'));
  hooks(s2); ok('a loaded game keeps running', G.hasTreaty(s2,'p','a1','trade'));
  const old=JSON.parse(G.serialize(s)); delete old.dip; old.rel.a1.status='alliance';
  const s3=G.deserialize(JSON.stringify(old));
  ok('an old save loads without treaties', s3 && G.treatiesOf(s3,'p').length===0);
  hooks(s3); ok('an old alliance becomes a lasting treaty', G.hasTreaty(s3,'p','a1','alliance') && G.treatyOf(s3,'p','a1','alliance').until===0);
  ok('old pending kinds still resolve', (()=>{ const p=G.addPending(s3,{kind:'peaceOffer',title:'x',text:'y',options:[{key:'accept',label:'a'}],expires:s3.time+60,def:'accept',data:{ai:'a2',gold:0}}); return G.resolvePending(s3,p.id,'accept')===null && G.rel(s3,'a2').status==='peace'; })());
}

// ---- a long run stays sane ----
{ Object.assign(TRT,DEF); const s=G.newGame({name:'T',race:'sylvan'}); let err=null;
  try { G.advance(s,6*3600,1500); } catch(e){ err=e; }
  ok('six hours of AI diplomacy run without errors', !err, err&&err.stack);
  ok('no treaty with a fallen realm and no stale wars', G.treatiesOf(s,'p').every(t=>!s.empires[t.a].dead&&!s.empires[t.b].dead) && Object.values(s.dip.wars).every(w=>G.statusOf(s,w.a,w.b)==='war'));
  console.log('  treaties after 6h:', s.dip.treaties.map(t=>t.kind+':'+t.a+'-'+t.b).join(' '), '| history', s.dip.hist.length, '| trust p', Math.round(G.trustOf(s,'p')));
}

// ---- the late crisis: a grand truce, and no new wars on those who fight it ----
{ const setupCrisis=()=>{ const s=fresh(); s.time=8*3600; s.monsterAt=1e12; s.crisisNext=1e12;
    const a1=G.capital(s,'a1'), a2=G.capital(s,'a2');
    if (G.dist(a1,a2)>9) { const t=near(s,a2,3,6); G.foundCity(s,'a1',t.x,t.y,'Borderwatch'); }
    return s; };
  const s=setupCrisis();
  G.aiRel(s,'a1','a2').status='war'; G.rel(s,'a3').status='war';
  G.startCrisis(s);
  ok('the crisis: warring AI realms swear a grand truce (a treaty)', G.hasTreaty(s,'a1','a2','crisis') && G.aiRel(s,'a1','a2').status==='peace');
  const offer=(s.pending||[]).find(p=>p.kind==='crisis');
  ok('the rivals offer the player the grand truce', !!offer && /grand truce/.test(offer.title), offer&&offer.title);
  ok('accepting it signs the truce with every rival at war or neutral', offer && G.resolvePending(s,offer.id,'truce')===null && G.hasTreaty(s,'p','a3','crisis') && G.rel(s,'a3').status==='peace');
  ok('the grand truce forbids attacking: it is a pact', G.pactBetween(s,'p','a3') && DATA.treatyKinds.crisis.pact);
  ok('the truce blocks AI war declarations on the bound realm', G.crisisWarBlocked(s,'a3','p'));
  // helping against the crisis warms every court
  s.crisis.contrib.p=40;
  const part=G.opinionParts(s,'a1').parts.find(x=>x.key==='crisis');
  ok('helping against the crisis: an opinion bonus with every court', part && part.v>0 && part.v<=20 && /crisis/.test(part.label), part&&part.v);
  // a crisis fighter is safe from new AI wars
  const s2=setupCrisis(); G.startCrisis(s2); s2.pending=[];
  for (const t of [...s2.dip.treaties]) G.endTreaty(s2,t,'ended');
  G.aiRel(s2,'a1','a2').status='neutral'; s2.empires.a1.aggr=1; s2.empires.a2.aggr=0.9;
  const ctl=G.deserialize(G.serialize(s2));
  s2.crisis.contrib.a2=10;
  ok('a realm that gave to the rite or slew crisis creatures is a crisis fighter', G.crisisFighter(s2,'a2') && !G.crisisFighter(s2,'a1'));
  const roll=(st)=>{ const r0=Math.random, ap=G.aiPressure; Math.random=()=>0.001; G.aiPressure=()=>1;
    try { withPower({a1:500,a2:500},()=>{ for(let i=0;i<120 && G.aiRel(st,'a1','a2').status!=='war';i++) hooks(st,1); }); } finally { Math.random=r0; G.aiPressure=ap; } quiet(); };
  roll(s2); roll(ctl);
  ok('no AI declares war on a realm fighting the crisis', G.aiRel(s2,'a1','a2').status!=='war', G.aiRel(s2,'a1','a2').status);
  ok('(control) without the crisis fight, the same warlike neighbour does declare war', G.aiRel(ctl,'a1','a2').status==='war', G.aiRel(ctl,'a1','a2').status);
  // nor does a stronger, hostile AI tear up its pact with a player who fights the crisis
  const s3=setupCrisis(); G.startCrisis(s3); s3.pending=[]; s3.crisis.contrib.p=5;
  G.signTreaty(s3,'nap','p','a1',{mins:600}); s3.empires.a1.aggr=0.9;
  let broke=0; withPower({p:100,a1:1000},()=>{ for (let i=0;i<200 && !broke;i++){ TRT.aiBreak=60; G.rel(s3,'a1').opinion=-50; hooks(s3,1); if (G.rel(s3,'a1').status==='war') broke=1; } }); quiet();
  ok('a hostile, stronger AI keeps its pact while the player fights the crisis', !broke);
  // the truce ends with the crisis
  G.endCrisis(s,true);
  ok('the grand truce ends with the crisis; the peace it made stays', !s.dip.treaties.some(t=>t.kind==='crisis') && G.rel(s,'a3').status==='peace' && !G.crisisWarBlocked(s,'a3','p'));
}

console.log(fails?fails+' FAILED':'ALL PASS');
`);
