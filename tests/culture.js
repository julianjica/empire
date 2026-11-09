// Happiness, tax policy, culture, traditions and revolts.  node tests/culture.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js',...['js/forge.js'].filter(f=>fs.existsSync(f)),'js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/dynasty.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; return s; };
const paceMin12=s=>12*60*G.pace(s).time+1;
const H=(s,c)=>G.happiness(s,c).value;
const factor=(s,c,re)=>(G.happiness(s,c).why.find(w=>re.test(w.label))||{}).value||0;

// ---- buildings registered ----
ok('culture buildings registered', ['tavern','temple','theatre'].every(b=>DATA.buildings[b]&&DATA.buildingOrder.includes(b)) && DATA.buildingGroups.some(g=>g.name==='Culture'));

// ---- each factor moves happiness ----
{ const s=fresh(); const c=G.capital(s,'p'); delete c.units.hero; c.res.bread=0; c.pop=5;
  const h0=H(s,c);
  ok('base ~55', h0===55, 'got '+h0+' '+JSON.stringify(G.happiness(s,c).why));
  c.buildings.tavern=3; const h1=H(s,c); ok('tavern raises happiness', h1===h0+9, h0+' -> '+h1);
  c.buildings.temple=2; c.buildings.theatre=2; ok('temple + theatre add more', H(s,c)===h1+4+3, ''+H(s,c));
  c.buildings.tavern=10; c.buildings.temple=10; c.buildings.theatre=10; ok('amenities capped', factor(s,c,/Taverns/)===G.CULTURE.amenityCap);
  c.buildings.tavern=0; c.buildings.temple=0; c.buildings.theatre=0;
  c.res.bread=50; ok('bread lifts Hearthfolk', H(s,c)===h0+8, ''+H(s,c)); c.res.bread=0;
  c.units.hero=1; ok('hero present', H(s,c)===h0+5); delete c.units.hero;
  c.mods=[{key:'popGrowth',mult:1.5,until:s.time+600,label:'Festival'},{key:'tax',mult:1.2,until:s.time+600,label:'Festival'}];
  ok('festival counts once', H(s,c)===h0+10, ''+H(s,c)); c.mods=[];
  const e=G.econ(s,c); c.pop=e.civCap; ok('crowding at full housing', factor(s,c,/Crowding/)<=-7, ''+factor(s,c,/Crowding/));
  c.pop=40; c.units.militia=40; ok('war weariness from soldiers', factor(s,c,/weariness/)<-10, ''+factor(s,c,/weariness/)); c.units={}; c.pop=5;
  s.settings.worldSize='small';   // the size rules below are the classic 9-city world's (bigger worlds free more cities: G.sizeFreeOf)
  for(let i=0;i<4;i++){ const t=G.freeTile(s,x=>G.dist(x,c)>4); G.foundCity(s,'p',t.x,t.y,'X'+i); }
  ok('empire size: 5 cities = -8', factor(s,c,/Empire size/)===-8, ''+factor(s,c,/Empire size/));
  s.empires.p.cultureTotal=G.CULTURE.sizeCulture*2; ok('culture softens empire size', factor(s,c,/Empire size/)===-4, ''+factor(s,c,/Empire size/));
  s.empires.p.cultureTotal=1e9; ok('softening is capped', factor(s,c,/Empire size/)===-2, ''+factor(s,c,/Empire size/));
  c.starving=true; ok('famine', factor(s,c,/Famine/)===-15); c.starving=false;
  G.startCalamity(s,'blight',G.tileAt(s,c.x,c.y)); ok('bad calamity', factor(s,c,/Calamity/)===-8); s.calamities=[];
  G.startCalamity(s,'feybloom',G.tileAt(s,c.x,c.y)); ok('good calamity does not upset', factor(s,c,/Calamity/)===0); s.calamities=[];
  c.lastHit={t:s.time,lost:true}; ok('recently sacked', factor(s,c,/sacked/)===-12);
  s.time+=601*G.pace(s).time; ok('raid memory fades', factor(s,c,/sacked|attacked/)===0);
}

// ---- tax policy ----
{ const s=fresh(); const c=G.capital(s,'p'); c.pop=60;
  const t0=G.econ(s,c).tax, h0=H(s,c);
  G.setTaxPolicy(s,c.id,'low'); const tl=G.econ(s,c).tax, hl=H(s,c);
  G.setTaxPolicy(s,c.id,'high'); const th=G.econ(s,c).tax, hh=H(s,c);
  ok('low tax: -30% tax, +10 happy', Math.abs(tl/t0-0.7)<0.01 && hl===h0+10, (tl/t0).toFixed(2)+' '+h0+'->'+hl);
  ok('high tax: +35% tax, -15 happy', Math.abs(th/t0-1.35)<0.01 && hh===h0-15, (th/t0).toFixed(2)+' '+h0+'->'+hh);
  ok('bad policy rejected', !!G.setTaxPolicy(s,c.id,'robbery'));
}

// ---- mood effects through G.mod ----
{ const s=fresh(); const c=G.capital(s,'p');
  const m=k=>G.mod(s,'p',c,k);
  c.happy=60; const g0=m('grain'), r0=m('refine'), p0=m('popGrowth'), t0=m('tax');
  c.happy=80; ok('jubilant: +10% goods/refine, +15% growth', Math.abs(m('grain')/g0-1.1)<1e-9 && Math.abs(m('refine')/r0-1.1)<1e-9 && Math.abs(m('popGrowth')/p0-1.15)<1e-9);
  c.happy=30; ok('discontent: -10% goods, -20% growth', Math.abs(m('ore')/G.mod(s,'p',Object.assign({},c,{happy:60}),'ore')-0.9)<1e-9 && Math.abs(m('popGrowth')/p0-0.8)<1e-9);
  c.happy=10; ok('unrest: -25% goods, -50% taxes', Math.abs(m('grain')/g0-0.75)<1e-9 && Math.abs(m('tax')/t0-0.5)<1e-9);
  c.happy=60; ok('neutral band has no effect', m('grain')===g0 && m('tax')===t0);
}

// ---- culture accrues ----
{ const s=fresh(); const c=G.capital(s,'p'); const r0=G.cultureRate(s,c);
  c.buildings.temple=2; c.buildings.theatre=1; const r1=G.cultureRate(s,c);
  ok('temples and theatres make culture', r1-r0>6.9, r0.toFixed(2)+' -> '+r1.toFixed(2));
  const before=s.empires.p.culture; G.advance(s,600,60);
  ok('culture accumulates', s.empires.p.culture>before+50 && s.empires.p.cultureTotal>=s.empires.p.culture, s.empires.p.culture.toFixed(0));
  ok('happiness stored with breakdown', typeof c.happy==='number' && Array.isArray(c.happyWhy) && c.happyWhy.length>0);
}

// ---- traditions: the classic perks still work ----
{ const s=fresh(); const c=G.capital(s,'p'); const emp=s.empires.p;
  ok('other race tradition refused', !!G.adoptTradition(s,'p','ancestors'));
  ok('cannot adopt without culture', !!G.adoptTradition(s,'p','criers'));
  emp.culture=1e6;
  ok('Hearthfire Oaths locked at start', !!G.adoptTradition(s,'p','hearthoath'));
  const cost0=G.traditionCost(s,'p','criers'); const h0=H(s,c); const c0=emp.culture;
  ok('adopt Town Criers', G.adoptTradition(s,'p','criers')===null && H(s,c)===h0+4 && emp.culture===c0-cost0, 'cost '+cost0);
  ok('costs escalate with each tradition', G.traditionCost(s,'p','tongue')>G.traditionCost(fresh(),'p','tongue'));
  ok('no double adoption', !!G.adoptTradition(s,'p','criers'));
  const g0=G.mod(s,'p',c,'grain'); G.adoptTradition(s,'p','harvest');
  ok('Harvest Festivals: +10% grain', Math.abs(G.mod(s,'p',c,'grain')/g0-1.1)<1e-9);
  c.res.bread=10; ok('Harvest Festivals: bread worth +13', factor(s,c,/bread/)===13); c.res.bread=0;
  ok('age II needs three traditions', /needs 3/.test(G.traditionStatus(s,'p','guilds').reason||''), G.traditionStatus(s,'p','guilds').reason);
  G.adoptTradition(s,'p','tongue');
  const t0=G.mod(s,'p',c,'tax'); ok('Guild Charters adopted in age II', G.adoptTradition(s,'p','guilds')===null);
  ok('Guild Charters: +10% tax', Math.abs(G.mod(s,'p',c,'tax')/t0-1.1)<1e-9);
  ok('Hearthfire Oaths needs the age of Heritage', !!G.adoptTradition(s,'p','hearthoath'));
  for(const id of ['hearthsongs','kinfeasts','greens','worksongs']) G.adoptTradition(s,'p',id);
  ok('Hearthfire Oaths after eight traditions', G.adoptTradition(s,'p','hearthoath')===null, JSON.stringify(emp.traditions));
  const s2=fresh('ash'); s2.empires.p.culture=1e6; const a1=G.mod(s2,'p',null,'atk'); G.adoptTradition(s2,'p','bloodfeast');
  ok('Blood Feasts: empire-wide +5% attack (city=null)', Math.abs(G.mod(s2,'p',null,'atk')/a1-1.05)<1e-9);
  const c2=G.capital(s2,'p'); c2.pop=40; c2.units.raider=40; const w=factor(s2,c2,/weariness/);
  s2.empires.p.traditions=[]; const w0=factor(s2,c2,/weariness/);
  ok('Blood Feasts halves war weariness', Math.abs(w-w0/2)<=1, w0+' -> '+w);
}

// ---- the web: shape and validity ----
{ const T=DATA.traditions, ids=Object.keys(T);
  const shared=ids.filter(id=>!T[id].race), byPillar={};
  for(const id of shared){ const t=T[id]; (byPillar[t.pillar]=byPillar[t.pillar]||[]).push(t); }
  ok('100-140 traditions in all', ids.length>=100 && ids.length<=140, ''+ids.length);
  ok('nine shared pillars of ten, 3/3/2/2 by age', Object.keys(byPillar).length===9 && Object.values(byPillar).every(l=>l.length===10 && [1,2,3,4].every(a=>l.filter(t=>t.age===a).length===[0,3,3,2,2][a])), Object.entries(byPillar).map(([k,l])=>k+':'+l.map(t=>t.age).join('')).join(' '));
  for(const r of DATA.raceOrder){ const mine=ids.filter(id=>T[id].race===r);
    ok(r+': six birthright traditions ending in a Way', mine.length===6 && mine.some(id=>T[id].age===4 && /^Way of the/.test(T[id].name)) && [1,2,3].every(t=>mine.some(id=>T[id].tier===t)), mine.join(',')); }
  ok('every tradition in the order', DATA.traditionOrder.length===ids.length && ids.every(id=>DATA.traditionOrder.includes(id)));
  ok('pillars and ages valid', ids.every(id=>DATA.pillars[T[id].pillar] && T[id].age>=1 && T[id].age<=4));
  ok('prerequisites exist, never from a later age or a foreign people', ids.every(id=>T[id].pre.every(g=>g.length && g.every(x=>T[x] && T[x].age<=T[id].age && (!T[x].race || T[x].race===T[id].race)))), ids.filter(id=>!T[id].pre.every(g=>g.every(x=>T[x]))).join(','));
  const seen={}, stack={}; let cyc=false;
  const dfs=id=>{ if(stack[id]){cyc=true;return;} if(seen[id])return; seen[id]=stack[id]=1; for(const g of T[id].pre) for(const x of g) dfs(x); stack[id]=0; };
  ids.forEach(dfs); ok('no cycles', !cyc);
  const forks=ids.filter(id=>T[id].excl);
  ok('forks symmetric, same pillar and age', forks.length>=18 && forks.every(id=>T[T[id].excl] && T[T[id].excl].excl===id && T[T[id].excl].pillar===T[id].pillar && T[T[id].excl].age===T[id].age), forks.length+' fork sides');
  ok('no fork between two original traditions', forks.every(id=>!(G.TRAD_LEGACY||[]).includes(id) || !(G.TRAD_LEGACY||[]).includes(T[id].excl)));
  const FIELDS=new Set(['id','name','icon','pillar','age','tier','pre','excl','eth','fx','cer','req','tale','lore','desc','race','seasonFx','seasonHappy',...Object.keys(G.TRAD_PROPS)]);
  const badField=ids.filter(id=>Object.keys(T[id]).some(k=>!FIELDS.has(k)));
  ok('only known fields', !badField.length, badField.join(','));
  const badFx=ids.filter(id=>Object.keys(T[id].fx||{}).some(k=>!G.TRAD_MOD_KEYS.has(k)) || Object.values(T[id].seasonFx||{}).some(f=>Object.keys(f).some(k=>!G.TRAD_MOD_KEYS.has(k))));
  ok('fx keys are G.mod keys', !badFx.length, badFx.join(','));
  ok('fx and props are sane multipliers', ids.every(id=>Object.values(T[id].fx||{}).every(v=>v>0.5&&v<1.5) && Object.entries(G.TRAD_PROPS).every(([p,c])=>T[id][p]===undefined || (c==='mul'? T[id][p]>0.3&&T[id][p]<2.1 : Math.abs(T[id][p])<=6))));
  ok('ethos axes valid', ids.every(id=>Object.keys(T[id].eth).every(a=>DATA.ethosAxes[a])) && ids.every(id=>Object.keys(T[id].eth).length>0));
  ok('ceremonies valid', ids.every(id=>!T[id].cer || DATA.ceremonies[T[id].cer]) && DATA.ceremonyOrder.every(c=>ids.some(id=>T[id].cer===c)), DATA.ceremonyOrder.length+' ceremonies');
  ok('ethos-gated traditions cover all eight poles', ['war','open','faith','kin'].every(a=>[1,-1].every(sg=>ids.some(id=>T[id].req&&T[id].req.ethos&&T[id].req.ethos[0]===a&&Math.sign(T[id].req.ethos[1])===sg))));
  ok('tales named exist', !G.story || ids.every(id=>!T[id].tale || G.story.byId(T[id].tale)), ids.filter(id=>T[id].tale && G.story && !G.story.byId(T[id].tale)).join(','));
  ok('every tradition has words', ids.every(id=>T[id].desc && G.traditionEffects(T[id]).length>0 && T[id].name && T[id].icon));
  // no runaway stacking: the strongest path (best side of each fork) per people
  for(const r of DATA.raceOrder){ const prod={};
    const mine=ids.filter(id=>!T[id].race||T[id].race===r);
    const best=new Set(mine.filter(id=>!T[id].excl || (Object.values(T[id].fx||{}).reduce((a,v)=>a+Math.abs(v-1),0) >= Object.values(T[T[id].excl].fx||{}).reduce((a,v)=>a+Math.abs(v-1),0) && (id<T[id].excl || Object.values(T[id].fx||{}).reduce((a,v)=>a+Math.abs(v-1),0) > Object.values(T[T[id].excl].fx||{}).reduce((a,v)=>a+Math.abs(v-1),0)))));
    for(const id of best){ for(const [k,v] of Object.entries(T[id].fx||{})) prod[k]=(prod[k]||1)*v; if(T[id].culture) prod.culture=(prod.culture||1)*T[id].culture; }
    const mil=['atk','def'].every(k=>(prod[k]||1)<=1.5), eco=Object.entries(prod).every(([k,v])=>['atk','def'].includes(k) || (v<=(k==='culture'?2.6:2) && v>=0.45));
    ok(r+': stacking stays bounded', mil && eco, Object.entries(prod).filter(([,v])=>v>1.3||v<0.75).map(([k,v])=>k+' '+v.toFixed(2)).join(' '));
  }
}

// ---- every tradition can be reached by its people ----
{ const T=DATA.traditions;
  const closure=id=>{ const out=new Set(); const go=x=>{ for(const g of T[x].pre) for(const y of g) if(!out.has(y)){ out.add(y); go(y);} }; go(id); return out; };
  const unreach=[];
  for(const r of DATA.raceOrder){
    for(const target of G.traditionsFor(fresh(r),'p')){
      const s=fresh(r); const emp=s.empires.p; emp.culture=1e12; emp.faithId='test'; G.capital(s,'p').buildings.magetower=5;
      const cl=closure(target), want=(T[target].req||{}).ethos;
      for(let i=0;i<60 && !G.traditionOpen(s,'p',target);i++){
        const opts=G.traditionsFor(s,'p').filter(id=>id!==target && G.traditionStatus(s,'p',id).ok);
        if(!opts.length) break;
        const score=id=>{ const t=T[id]; let v=Math.random(); if(cl.has(id)) v+=10; if(want) v+=5*Math.sign(want[1])*(t.eth[want[0]]||0); if(t.excl && (t.excl===target || (cl.has(t.excl) && !cl.has(id)))) v-=1000; return v; };
        opts.sort((a,b)=>score(b)-score(a)); G.adoptTradition(s,'p',opts[0]);
      }
      if(!G.traditionOpen(s,'p',target)) unreach.push(r+':'+target);
    }
  }
  ok('every tradition reachable for its people (ethos gates included)', !unreach.length, unreach.join(' '));
}

// ---- forks, ethos and its consequences ----
{ const s=fresh(); const emp=s.empires.p; emp.culture=1e9;
  for(const id of ['hearthsongs','kinfeasts','criers']) G.adoptTradition(s,'p',id);
  ok('fork open on both sides', G.traditionStatus(s,'p','greatfamilies').ok && G.traditionStatus(s,'p','openhearths').ok);
  G.adoptTradition(s,'p','openhearths');
  const st=G.traditionStatus(s,'p','greatfamilies');
  ok('choosing one side forsakes the other', st.forsaken && !st.ok && !!G.adoptTradition(s,'p','greatfamilies'), st.reason);
  ok('forsaking is announced', s.log.some(l=>/Great Families is forsaken/.test(l.text)));
  for(const id of ['tongue','harvest','scribes','apprentices']) G.adoptTradition(s,'p',id);
  const e=G.ethosOf(s,'p');
  ok('ethos sums the shifts', e.kin===1+2+1+1-1 && e.open===1+2+2 && e.war===-1 && e.faith===1-1, JSON.stringify(e));
  ok('ethos gate: The Commons locked below Communal 6', emp.traditions.length===8 && G.traditionStatus(s,'p','commons').ethos, G.traditionStatus(s,'p','commons').reason);
  G.adoptTradition(s,'p','midwives'); G.adoptTradition(s,'p','greens');
  ok('ethos gate: The Commons opens at Communal 6', G.ethosOf(s,'p').kin>=6 && G.traditionStatus(s,'p','commons').ok, 'kin '+G.ethosOf(s,'p').kin+' '+G.traditionStatus(s,'p','commons').reason);
  ok('ethos words and title', G.ethosWords(G.ethosOf(s,'p')).some(w=>w.word==='Communal') && /communal/.test(G.ethosTitle(G.ethosOf(s,'p'))), G.ethosTitle(G.ethosOf(s,'p')));
  G.adoptTradition(s,'p','commons'); G.adoptTradition(s,'p','hearthoath'); G.adoptTradition(s,'p','worksongs');
  const A=G.traditionAgg(emp); let pg=1; for(const id of emp.traditions) pg*=((DATA.traditions[id].fx||{}).popGrowth||1);
  ok('devoted ethos grants its virtue', A.ethos.kin>=G.ETHOS.devoted && A.virtues.includes('kin+') && Math.abs(A.fx.popGrowth/(pg*1.04)-1)<1e-9, 'kin '+A.ethos.kin+' '+A.virtues);
  ok('virtue announced', s.log.some(l=>/devoutly communal/.test(l.text)));
  const t=s.empires.a1; t.traditions=['hearthsongs','kinfeasts','greatfamilies','commons'];
  ok('AI ethos derived from its list', G.ethosOf(s,'a1').kin===7);
}
{ const s=fresh(); const ai=Object.keys(s.empires).find(id=>id!=='p');
  const h0=G.hostility(s,ai,'p');
  s.empires.p.traditions=['warriorcode','warfeast','glory','warband','bloodfeast']; s.empires[ai].traditions=['warriorcode','warfeast','glory','pageantry'];
  const hk=G.hostility(s,ai,'p');
  s.empires[ai].traditions=['mercy','guestright','hearthsongs','mercylaw','pax','concord'];
  const ho=G.hostility(s,ai,'p');
  ok('kindred ethos calms rivals, opposed ethos stirs them', hk<h0 && ho>hk && G.ethosAffinity(s,ai,'p')<0, [h0,hk,ho].map(x=>x.toFixed(3)).join(' '));
  s.empires.p.traditions=['concord']; const hc=G.hostility(s,ai,'p'); s.empires.p.traditions=[];
  ok('The Grand Concord calms rivals', hc<G.hostility(s,ai,'p'), hc.toFixed(3));
  s.rel={}; s.empires.p.culture=1e9; s.empires[ai].traditions=['warriorcode','warfeast','glory','pageantry'];
  const o0=G.rel(s,ai).opinion; G.adoptTradition(s,'p','warriorcode');
  ok('a like-minded realm warms when we adopt its ways', G.rel(s,ai).opinion>o0, o0+' -> '+G.rel(s,ai).opinion);
}

// ---- named effects: faith, routes, envoys, calamities, seasons, tales ----
{ const s=fresh(); const emp=s.empires.p; G.ensureTraditionWraps();
  if(G.faithRate){ const c=G.capital(s,'p'); c.buildings.temple=3; const f0=G.faithRate(s,'p'); emp.traditions=['offerings']; ok('Hearth Offerings: +10% faith', f0>0 && Math.abs(G.faithRate(s,'p')/f0-1.1)<1e-6, f0.toFixed(2)); emp.traditions=[]; }
  if(G.routeIncome){ const cs=G.citiesOf(s,'a1'); const a=G.capital(s,'p'), b=cs[0]; a.buildings.market=3; b.buildings.market=3; const r0=G.routeIncome(s,a,b); emp.traditions=['guestright','opengates']; ok('Open Gates: trade routes pay more', G.routeIncome(s,a,b)>=Math.round(r0*1.14), r0+' -> '+G.routeIncome(s,a,b)); emp.traditions=[]; }
  if(G.minorsList){ const mi=G.minorsList(s)[0]; if(mi){ mi.inf.p=5; emp.traditions=['guestright','envoys']; const i0=mi.inf.p; G.advance(s,600,60); ok('envoys raise influence with free cities', (mi.inf.p||0)>i0-0.1, i0+' -> '+(mi.inf.p||0).toFixed(2)); emp.traditions=[]; } }
  const c=G.capital(s,'p'); G.startCalamity(s,'blight',G.tileAt(s,c.x,c.y));
  emp.traditions=['livewithland']; ok('Live with the Land softens calamity unrest', factor(s,c,/Calamity/)===Math.round(-8*0.7), ''+factor(s,c,/Calamity/)); s.calamities=[];
  c.starving=true; emp.traditions=['kinfeasts']; ok('Kin Feasts soften famine', factor(s,c,/Famine/)===-9, ''+factor(s,c,/Famine/)); c.starving=false;
  emp.traditions=['winterhearths']; s.time=3*7200*G.pace(s).time+5; const gW=G.mod(s,'p',c,'grain'); emp.traditions=[]; const gW0=G.mod(s,'p',c,'grain');
  ok('Winter Hearths: +15% grain in winter only', Math.abs(gW/gW0-1.15)<1e-9);
  emp.traditions=['winterhearths']; ok('Winter Hearths: +3 happiness in winter', factor(s,c,/Traditions/)===3); s.time=10; ok('…and not in spring', factor(s,c,/Traditions/)===0 && G.mod(s,'p',c,'grain')===(emp.traditions=[],G.mod(s,'p',c,'grain')));
  const s3=fresh(); const k0=G.traditionCost(s3,'p','kinfeasts');
  if(G.story){ G.story.flags(s3,'p').famine='share'; ok('a lived tale makes its tradition cheaper', G.traditionCost(s3,'p','kinfeasts')<k0, k0+' -> '+G.traditionCost(s3,'p','kinfeasts')); }
  const s4=fresh(); s4.empires.p.culture=1e9; for(const id of ['offerings','sacredcal','hearthsongs','kinfeasts','harvest','livingsaints','choirs','criers','starsigns']) G.adoptTradition(s4,'p',id);
  ok('Theocracy needs a state faith', /faith|Pious/.test(G.traditionStatus(s4,'p','theocracy').reason||''), G.traditionStatus(s4,'p','theocracy').reason);
  ok('Circle of Magi needs a Mage Tower', /Mage Tower/.test(G.traditionStatus(s4,'p','magicircle').reason||''), G.traditionStatus(s4,'p','magicircle').reason);
}

// ---- ceremonies ----
{ const s=fresh(); const emp=s.empires.p; const c=G.capital(s,'p'); delete c.units.hero;
  ok('no ceremony without its tradition', !!G.holdCeremony(s,'p','lanterns'));
  emp.traditions=['hearthsongs','lanterns']; emp.gold=1e5;
  ok('ceremony listed', G.ceremoniesOf(s,'p').includes('lanterns') && G.ceremonyStatus(s,'p','lanterns').ok);
  const h0=H(s,c), g0=emp.gold, cu0=emp.culture||0;
  ok('Night of Lanterns held', G.holdCeremony(s,'p','lanterns')===null && emp.gold<g0 && (emp.culture||0)>=cu0);
  ok('…every city celebrates (+10)', factor(s,c,/Festival/)===10 && H(s,c)>=h0+10, H(s,c)+' vs '+h0);
  const st=G.ceremonyStatus(s,'p','lanterns');
  ok('…then rests (cooldown)', st.cooling && !!G.holdCeremony(s,'p','lanterns'), st.reason);
  s.time+=DATA.ceremonies.lanterns.cool*60*G.pace(s).time+1;
  ok('…and can be held again after its cooldown', G.ceremonyStatus(s,'p','lanterns').ok);
  emp.traditions=['warriorcode','warfeast']; c.res.grain=5000; const a0=G.mod(s,'p',null,'atk');
  ok('War Feast: +10% attack', G.holdCeremony(s,'p','warfeast')===null && Math.abs(G.mod(s,'p',null,'atk')/a0-1.1)<1e-9);
  s.time+=13*60*G.pace(s).time; ok('…which fades', Math.abs(G.mod(s,'p',null,'atk')/a0-1)<1e-9);
  emp.traditions=['firstfurrow','midsummer']; emp.ceremonies={}; s.time=10;
  ok('Midsummer Fires only in summer', G.ceremonyStatus(s,'p','midsummer').season);
  emp.traditions=['criers','assize']; c.loyalty=50; emp.ceremonies={};
  ok('The Great Assize restores loyalty', G.holdCeremony(s,'p','assize')===null && c.loyalty===62 && factor(s,c,/Assize/)===4, c.loyalty+' '+factor(s,c,/Assize/));
  emp.traditions=['offerings','pilgrims']; emp.faithId=null;
  ok('Pilgrimage needs a state faith', /faith/.test(G.ceremonyStatus(s,'p','pilgrimage').reason||''));
  // seasonal offer at the turn of spring
  const s2=fresh(); s2.empires.p.traditions=['firstfurrow']; s2.empires.p.gold=1e4; s2.time=4*7200*G.pace(s2).time+5; s2.pending=[];
  G.advance(s2,20,10);
  const p=(s2.pending||[]).find(p=>p.kind==='ceremony');
  ok('a seasonal ceremony is offered as the season turns', !!p && p.data.id==='firstfurrow', JSON.stringify((s2.pending||[]).map(p=>p.kind)));
  if(p){ const g=G.mod(s2,'p',G.capital(s2,'p'),'grain'); ok('…and holding it applies', G.resolvePending(s2,p.id,'hold')===null && G.mod(s2,'p',G.capital(s2,'p'),'grain')>g*1.3); }
}

// ---- old saves: the original traditions load and apply ----
{ const s=fresh(); const c=G.capital(s,'p'); const emp=s.empires.p;
  const g0=G.mod(s,'p',c,'grain'), t0=G.mod(s,'p',c,'tax'), p0=G.mod(s,'p',c,'popGrowth');
  emp.traditions=['criers','harvest','guilds','hearthoath']; emp.culture=500; delete emp.ceremonies;
  G.save(s); const s2=G.load(); const c2=s2.cities[c.id]; const e2=s2.empires.p;
  ok('old save loads with its traditions', e2.traditions.join()==='criers,harvest,guilds,hearthoath');
  ok('…and they apply', Math.abs(G.mod(s2,'p',c2,'grain')/g0-1.1)<1e-9 && Math.abs(G.mod(s2,'p',c2,'tax')/t0-1.1)<1e-9 && G.mod(s2,'p',c2,'popGrowth')/p0>1.149, [G.mod(s2,'p',c2,'grain')/g0, G.mod(s2,'p',c2,'tax')/t0].map(x=>x.toFixed(3)).join(' '));
  let threw=null; try{ for(const id of DATA.traditionOrder) G.traditionStatus(s2,'p',id); for(const id of DATA.ceremonyOrder) G.ceremonyStatus(s2,'p',id); }catch(e){ threw=e.message; }
  ok('…the whole web can be read', !threw, threw);
  ok('…kept traditions still count as adopted', G.traditionStatus(s2,'p','hearthoath').have);
  G.advance(s2,600,60); ok('…and the game runs on', e2.culture>500);
  e2.traditions=['criers','nonsense']; let t2=null; try{ G.mod(s2,'p',c2,'tax'); G.happiness(s2,c2); G.ethosOf(s2,'p'); }catch(e){ t2=e.message; } ok('unknown ids are ignored', !t2, t2);
}

// ---- pacing ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.townhall=3; c.buildings.temple=1; c.happy=60;
  const rate=G.cultureRate(s,c), first=G.traditionCost(s,'p','criers');
  ok('first tradition within ~20 minutes for a town with a temple', first/rate<=22, (first/rate).toFixed(1)+' min at '+rate.toFixed(1)+'/min');
  const emp=s.empires.p; emp.traditions=new Array(15).fill('criers');
  ok('later traditions are far grander', G.traditionCost(s,'p','everhearth')>=G.traditionCost(fresh(),'p','criers')*40, ''+G.traditionCost(s,'p','everhearth'));
}

// ---- AI adopts with personality: all eight peoples ----
{ const picks={};
  for(const r of DATA.raceOrder){
    const s=fresh(r); const emp=s.empires.p; emp.culture=0; let n=0;
    for(let i=0;i<40;i++){ const id=G.aiPickTradition(s,emp); if(!id) break; emp.culture+=G.traditionCost(s,'p',id)+1; if(G.adoptTradition(s,'p',id)===null) n++; }
    picks[r]=emp.traditions;
    ok(r+': AI picks forty valid traditions', n===40 && new Set(emp.traditions).size===40 && emp.traditions.every(id=>!DATA.traditions[id].race||DATA.traditions[id].race===r));
    ok(r+': AI keeps to its forks', emp.traditions.every(id=>!DATA.traditions[id].excl || !emp.traditions.includes(DATA.traditions[id].excl)));
    ok(r+': AI reaches the age of Myth', emp.traditions.some(id=>DATA.traditions[id].age===4), emp.traditions.filter(id=>DATA.traditions[id].age>=3).join(','));
  }
  const war=r=>picks[r].slice(0,25).reduce((a,id)=>a+(DATA.traditions[id].eth.war||0),0);
  ok('aggressive peoples lean more martial than gentle ones', war('ash')>war('sylvan'), 'ash '+war('ash')+' sylvan '+war('sylvan'));
  // in real time
  let total=0, worlds=0, ages={};
  for(const r of ['hearth','grave']){ const s=G.newGame({name:'T',race:r}); s.calamityAt=1e12; G.advance(s,3*3600*G.pace(s).time,60); worlds++;
    for(const e of Object.values(s.empires)) if(e.id!=='p'){ total+=(e.traditions||[]).length; ages[e.race]=Math.max(...(e.traditions||[]).map(id=>DATA.traditions[id].age),0); } }
  ok('AIs adopt traditions over three game-hours', total/(worlds*3)>=2, (total/(worlds*3)).toFixed(1)+' each '+JSON.stringify(ages));
}

// ---- unrest, warning, placate, revolt ----
{ const s=fresh(); const cap=G.capital(s,'p');
  const t=G.freeTile(s,x=>G.dist(x,cap)>4&&G.dist(x,cap)<8); const c=G.foundCity(s,'p',t.x,t.y,'Rebelton');
  c.units.militia=30; c.pop=10; c.taxPolicy='high'; c.starving=true; c.lastHit={t:s.time,lost:true};
  G.advance(s,10,1);
  ok('city in unrest', c.happy<20, 'happy '+c.happy);
  ok('player warned with a decision', (s.pending||[]).some(p=>p.kind==='unrest'&&p.data.city===c.id) && s.log.some(l=>/Unrest in Rebelton/.test(l.text)));
  const l0=c.loyalty; G.advance(s,120,12); c.starving=true; c.lastHit={t:s.time,lost:true};
  ok('loyalty falls ~1/min', l0-c.loyalty>1.5 && l0-c.loyalty<3, (l0-c.loyalty).toFixed(2)+' over 2 min');
  s.empires.p.gold=1e5; const p=s.pending.find(p=>p.kind==='unrest');
  ok('placate via decision', G.resolvePending(s,p.id,'placate')===null && c.placated>s.time && factor(s,c,/circuses/)===25);
  c.placated=0; s.time+=paceMin12(s); G.advance(s,10,1);
  ok('unrest warning repeats while unrest lasts', s.pending.some(p=>p.kind==='unrest'&&p.data.city===c.id));
  ok('placating from the Culture tab clears the decision', G.placate(s,c.id)===null && !s.pending.some(p=>p.kind==='unrest'&&p.data.city===c.id));
  c.placated=0; c.loyalty=0.1; c.starving=true; c.lastHit={t:s.time,lost:true};
  const before=Object.keys(s.camps).length;
  G.advance(s,10,1);
  const tile=G.tileAt(s,t.x,t.y);
  ok('revolt removes the city', !s.cities[c.id] && !tile.city, 'cities '+G.citiesOf(s,'p').length);
  ok('revolt leaves a strong brigand camp', tile.camp && s.camps[tile.camp] && s.camps[tile.camp].tier>=4 && Object.keys(s.camps).length===before+1, tile.camp&&JSON.stringify(s.camps[tile.camp].units));
  // last city never revolts
  cap.happy=0; cap.taxPolicy='high'; cap.starving=true; cap.loyalty=0.1; cap.units.militia=60; cap.pop=10; cap.lastHit={t:s.time,lost:true};
  G.advance(s,10,1);
  ok('last city never revolts', !!s.cities[cap.id] && !s.gameOver, 'loyalty '+cap.loyalty);
}

// ---- AI reacts ----
{ const s=fresh(); const ai=G.citiesOf(s,'a1')[0]; const emp=s.empires.a1;
  ai.buildings.townhall=5; ai.res.timber=5000; ai.res.stone=5000; ai.res.grain=5000; emp.gold=5000;
  ai.taxPolicy='normal'; ai.starving=true; ai.lastHit={t:s.time,lost:true}; ai.units[DATA.races[emp.race].units[0]]=40; ai.pop=20;
  G.updateHappiness(s,ai);
  for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI lowers taxes and builds amenities when unhappy', ai.taxPolicy==='low' && ai.buildQueue.some(q=>['tavern','temple','theatre'].includes(q.type)), ai.taxPolicy+' '+ai.buildQueue.map(q=>q.type));
  ai.starving=false; ai.lastHit=null; ai.units={}; ai.buildings.tavern=10; ai.buildings.temple=5; ai.pop=10; G.updateHappiness(s,ai);
  for(const h of G.aiHooks) h(s,emp,0.2); for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI raises taxes when content', ai.taxPolicy==='high', ai.taxPolicy+' happy '+ai.happy);
  emp.culture=5000; for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI adopts traditions', (emp.traditions||[]).length>=1, JSON.stringify(emp.traditions));
  emp.culture=0; emp.tradTarget=null; for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI saves up for its chosen tradition', !!emp.tradTarget && DATA.traditions[emp.tradTarget], emp.tradTarget);
}

// ---- save / load ----
{ const s=fresh(); const c=G.capital(s,'p'); s.empires.p.culture=1234; s.empires.p.cultureTotal=5678; s.empires.p.traditions=['criers'];
  c.taxPolicy='low'; G.updateHappiness(s,c); const h=c.happy;
  G.save(s); const s2=G.load(); const c2=s2.cities[c.id];
  ok('save/load keeps culture state', s2.empires.p.culture===1234 && s2.empires.p.cultureTotal===5678 && s2.empires.p.traditions[0]==='criers' && c2.taxPolicy==='low' && c2.happy===h);
  G.advance(s2,300,30); ok('loaded game runs', s2.empires.p.culture>1234);
}
console.log(fails?fails+' FAILED':'all culture checks passed');
if(fails) process.exitCode=1;
`);
