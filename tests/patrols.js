// Road patrols and the Protector of the Trade: ambush losses, interceptions, upkeep, risk levels, the title,
// AI patrols, supply lines on patrolled roads, foreign route income at market prices, CLI, saves, performance.
// node tests/patrols.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/cli.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const PT=G.PATROL;
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; s.monsters={}; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); G.capital(s,'p').buildings.warehouse=10; G.patrolInstall(); return s; };
const withRandom=(v,fn)=>{ const r=Math.random; Math.random=()=>v; try{ return fn(); } finally{ Math.random=r; } };
const run=(s,sec)=>G.advance(s,sec,Math.ceil(sec/5));
const U=DATA.races.hearth.units;            // ids from DATA.races[race].units
const INF=U.find(u=>u==='pikeman')||U[0], MIL=U.find(u=>u==='militia')||U[0];
// a second player city 7-9 tiles from the capital, both with markets
const twoCities=(s,lo=7,hi=9)=>{ const c=G.capital(s,'p'); const t=G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&G.landReachable(s,c,x)); const b=G.foundCity(s,'p',t.x,t.y,'Second');
  c.buildings.market=8; b.buildings.market=4; b.buildings.warehouse=10; c.res.ore=100000; b.res.ore=0; return [c,b]; };
const midCamp=(s,c,b,id='kX',tier=3,n=3*3*6+4)=>{ const mid=G.tileAt(s,Math.round((c.x+b.x)/2),Math.round((c.y+b.y)/2)); const camp={id,x:mid.x,y:mid.y,tier,units:{brigand:n},loot:{}}; s.camps[id]=camp; mid.camp=id; return camp; };

// ---- a patrol reduces ambush losses measurably ----
{ const trial=(patrol,N)=>{ let lost=0, amb=0, sent=0, det=0, won=0;
    for(let i=0;i<N;i++){
      const s=fresh(); const [c,b]=twoCities(s);
      c.units[INF]=300; c.units[MIL]=200; c.res.grain=1e6; s.empires.p.gold=1e6;
      midCamp(s,c,b);
      const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:1000},every:5});
      let p=null;
      if(patrol){ p=G.patrolCreate(s,'p',{route:r.id,units:{[INF]:120,[MIL]:60}}); p.readyAt=s.time; }
      run(s,60*60);
      amb+=s.reports.filter(x=>/ambushed/.test(x.title)).length; lost+=r.lost; sent+=r.trips*1000;
      if(p){ det+=p.stats.deterred; won+=p.stats.won; }
    }
    return {amb, lost, share: lost/Math.max(1,sent), det, won};
  };
  const bare=trial(false,4), guarded=trial(true,4);
  ok('ambushes happen on the bare road', bare.amb>=3, 'ambushes '+bare.amb+' lost '+bare.lost);
  ok('a patrol cuts ambush losses by more than half', guarded.lost<bare.lost*0.5, 'bare '+bare.lost+' ('+(bare.share*100).toFixed(1)+'%) vs patrolled '+guarded.lost+' ('+(guarded.share*100).toFixed(1)+'%)');
  ok('the patrol deterred or beat off ambushes', guarded.det+guarded.won>=2, 'deterred '+guarded.det+' won '+guarded.won);
}

// ---- deterministic: the patrol fights first; a broken patrol lets the raiders through ----
{ const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=300; c.res.grain=1e6;
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}});
  const p=G.patrolCreate(s,'p',{route:r.id,units:{[INF]:150}}); p.readyAt=s.time;
  const camp={id:'kY',x:b.x,y:b.y,tier:2,units:{brigand:30},loot:{}};
  const m={id:'mm',owner:'p',type:'trade',route:r.id,leg:'out',from:c.id,fx:c.x,fy:c.y,x:b.x,y:b.y,units:{},cargo:{ore:500},depart:s.time-50,arrive:s.time+50};
  s.moves.push(m);
  const res=withRandom(0.99,()=>G.routeAmbush(s,m,{camp}));
  ok('a strong patrol meets the brigands: no cargo lost', res.held && res.patrol===p.id && m.cargo.ore===500 && m.ambushed && camp.units.brigand<30, JSON.stringify(res)+' brigands '+camp.units.brigand);
  ok('the fight is counted on the patrol', p.stats.fights===1 && p.stats.won===1 && p.stats.kills>0);
  const m2={...m,id:'mm2',ambushed:false,cargo:{ore:500}}; s.moves.push(m2);
  const res2=withRandom(0.0,()=>G.routeAmbush(s,m2,{camp}));
  ok('or scares them off before they strike', res2.deterred && m2.cargo.ore===500 && !m2.ambushed && p.stats.deterred===1);
  p.units={[INF]:5};
  const m3={...m,id:'mm3',ambushed:false,cargo:{ore:500}}; s.moves.push(m3); camp.units.brigand=80;
  const res3=withRandom(0.99,()=>G.routeAmbush(s,m3,{camp}));
  ok('a weak patrol is broken and the caravan is robbed', !res3.patrol && m3.cargo.ore<500 && s.reports.some(x=>/patrol .* was broken/.test(x.title)), JSON.stringify(m3.cargo));
  // roaming creatures
  p.units={[INF]:200};
  const mon={id:'mon1',kind:Object.keys(DATA.monsterKinds).find(k=>DATA.monsterKinds[k].behave==='raider')||Object.keys(DATA.monsterKinds)[0],x:b.x,y:b.y,fx:b.x,fy:b.y,depart:0,arrive:0,units:{brigand:10}};
  s.monsters={mon1:mon};
  const m4={...m,id:'mm4',ambushed:false,cargo:{ore:500}}; s.moves.push(m4);
  const shielded=withRandom(0.99,()=>G.patrolShields(s,m4,mon));
  ok('a patrol shields caravans from roaming creatures', shielded && m4.cargo.ore===500 && (G.unitsCount(mon.units)<10 || !s.monsters.mon1));
}

// ---- an interception against a patrolled caravan meets the patrol first ----
{ const setup=(n)=>{
    const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=400; c.res.grain=1e6;
    const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}});
    const p=G.patrolCreate(s,'p',{route:r.id,units:{[INF]:n}}); p.readyAt=s.time;
    const T={id:'mT',owner:'p',type:'trade',route:r.id,leg:'out',from:c.id,fx:c.x,fy:c.y,x:b.x,y:b.y,units:{},cargo:{ore:900},depart:s.time-100,arrive:s.time+100};
    s.moves.push(T);
    G.rel(s,'a1').status='war';
    const pos=G.movePos(s,T), a1=G.capital(s,'a1'), au=DATA.races[s.empires.a1.race].units[0];
    const m={id:'mI',owner:'a1',type:'intercept',from:a1.id,fx:a1.x,fy:a1.y,x:Math.round(pos.x),y:Math.round(pos.y),units:{[au]:60},cargo:{},depart:s.time-50,arrive:s.time,target:T.id,march:50};
    s.moves.push(m);
    return {s,p,T,m};
  };
  { const {s,p,T,m}=setup(300);
    s.moves.splice(s.moves.indexOf(m),1); G.moveHandlers.intercept(s,m);
    ok('the interceptors meet the patrol and are turned back', p.stats.fights===1 && p.stats.won===1 && s.moves.includes(T) && T.cargo.ore===900, 'fights '+p.stats.fights+' won '+p.stats.won);
    ok('the patrol\\'s victory is reported', s.reports.some(x=>/patrol .* turned back/.test(x.title)) && s.moves.some(x=>x.owner==='a1'&&x.type==='return'));
  }
  { const {s,p,T,m}=setup(5);
    s.moves.splice(s.moves.indexOf(m),1); G.moveHandlers.intercept(s,m);
    ok('a token patrol is broken and the riders reach the caravan', p.stats.fights===1 && p.stats.won===0 && !s.moves.includes(T), 'fights '+p.stats.fights+' caravan on road '+s.moves.includes(T));
  }
  // the AI sees the patrol when it weighs an interception
  { const {s,p,T,m}=setup(300); s.moves.splice(s.moves.indexOf(m),1);
    let seen=0; const inner=G.aiIntercept;
    const seenUnits=G.patrolWithEscorts(s,()=>G.unitsCount(T.units));
    ok('AI interception estimates count the patrol riding with the caravan', seenUnits>=300 && G.unitsCount(T.units)===0, seenUnits);
  }
}

// ---- upkeep is paid; home garrison is thinner ----
{ const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=200; c.res.grain=50000; s.empires.p.gold=5000;
  const sold0=G.soldiers(s,c);
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}});
  const p=G.patrolCreate(s,'p',{route:r.id,units:{[INF]:100}});
  ok('troops leave the garrison', c.units[INF]===100 && G.soldiers(s,c)===sold0, c.units[INF]+' soldiers '+G.soldiers(s,c)+'/'+sold0);
  const up=G.patrolUpkeep(s,p);
  ok('field upkeep is above home upkeep', up.grain>DATA.units[INF].upkeep*100 && up.gold>0, JSON.stringify(up));
  run(s,600);
  const mins=600/60;
  ok('upkeep is paid in grain and gold', Math.abs(p.stats.paidGrain-up.grain*mins)<up.grain*mins*0.35 && p.stats.paidGold>up.gold*mins*0.6, 'grain '+p.stats.paidGrain.toFixed(0)+' ~ '+(up.grain*mins).toFixed(0)+' gold '+p.stats.paidGold.toFixed(1));
  c.res.grain=0; c.buildings.farm=0; const n0=G.unitsCount(p.units);
  for(let i=0;i<20;i++){ c.res.grain=0; run(s,30); }
  ok('an unfed patrol deserts', G.unitsCount(p.units)<n0 && p.stats.lost>0, n0+' -> '+G.unitsCount(p.units));
}

// ---- risk levels per route ----
{ const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=400; c.res.grain=1e6;
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}});
  ok('an empty road is Safe', G.patrolRisk(s,r).level==='safe');
  const camp=midCamp(s,c,b,'kR',2,30);
  const rk=G.patrolRisk(s,r);
  ok('a camp on the road makes it Risky or Deadly', rk.level==='risky'||rk.level==='deadly', rk.level+' '+(rk.chance*100).toFixed(0)+'%');
  camp.tier=6; camp.units.brigand=400;
  ok('a big camp on the road is Deadly', G.patrolRisk(s,r).level==='deadly', G.patrolRisk(s,r).level+' '+(G.patrolRisk(s,r).chance*100).toFixed(0)+'%');
  camp.tier=2; camp.units.brigand=30;
  const p=G.patrolCreate(s,'p',{route:r.id,units:{[INF]:150}}); p.readyAt=s.time;
  const rw=G.patrolRisk(s,r);
  ok('a strong patrol makes it Watched', rw.level==='watched' && rw.holds && rw.share>=0.5, rw.level+' share '+rw.share.toFixed(2)+' guard '+rw.guard+' threat '+rw.threat);
  ok('the trade card risk (routeRisk) drops with the patrol', G.routeRisk(s,r).chance<rk.chance && G.routeRisk(s,r).level==='watched', (G.routeRisk(s,r).chance*100).toFixed(0)+'% vs '+(rk.chance*100).toFixed(0)+'%');
  G.rel(s,'a1').status='war';
  s.moves.push({id:'mH',owner:'a1',type:'raid',from:G.capital(s,'a1').id,fx:camp.x,fy:camp.y,x:camp.x,y:camp.y,units:{[DATA.races[s.empires.a1.race].units[0]]:900},cargo:{},depart:s.time-10,arrive:s.time+1000});
  ok('a hostile army too big for the patrol makes it Deadly', G.patrolRisk(s,r).level==='deadly', G.patrolRisk(s,r).level);
  const plan=G.patrolPlan(s,'p');
  ok('patrolled routes are not suggested again', !plan.some(x=>x.route===r.id));
}

// ---- suggestions: G.patrolPlan ----
{ const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=300; c.res.grain=1e6;
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}}); midCamp(s,c,b,'kS',2,30);
  const plan=G.patrolPlan(s,'p');
  ok('a risky route is suggested with troops from its city', plan.length===1 && plan[0].route===r.id && plan[0].enough && G.unitsCount(plan[0].units)>=PT.minUnits, JSON.stringify(plan[0]));
  const p=G.patrolCreate(s,'p',{route:r.id,units:plan[0].units}); p.readyAt=s.time;
  ok('the suggested patrol makes the road Watched', G.patrolRisk(s,r).level==='watched', G.patrolRisk(s,r).level);
}

// ---- validation, generals, recall ----
{ const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=50; c.res.grain=1e6;
  ok('too few troops refused', typeof G.patrolCreate(s,'p',{from:c.id,to:b.id,units:{[INF]:2}})==='string');
  ok('more troops than the city has refused', typeof G.patrolCreate(s,'p',{from:c.id,to:b.id,units:{[INF]:500}})==='string');
  ok('settlers do not patrol', typeof G.patrolCreate(s,'p',{from:c.id,to:b.id,units:{settlers:10}})==='string');
  c.buildings.barracks=Math.max(c.buildings.barracks||0,3); s.empires.p.gold=5000;
  const ge=G.recruitGeneral(s,'p',c.id,0); const g=G.generalsOf(s,'p')[0];
  const p=G.patrolCreate(s,'p',{from:c.id,to:b.id,units:{[INF]:30},general:g&&g.id});
  ok('a road between two places can be patrolled, led by a general', typeof p==='object' && p.general===g.id && g.status==='patrolling', typeof p==='string'?p:g&&g.status);
  ok('the same road twice is refused', typeof G.patrolCreate(s,'p',{from:b.id,to:c.id,units:{[INF]:10}})==='string');
  run(s,30);
  ok('his status survives the generals tick', g.status==='patrolling' && p.general===g.id, g.status);
  const add=G.patrolSetUnits(s,p.id,{[INF]:40});
  ok('troops can be added from the base', !add && p.units[INF]===40 && c.units[INF]===10, add);
  const e=G.patrolRecall(s,p.id,'p');
  const back=s.moves.find(m=>m.type==='return'&&m.owner==='p'&&m.units[INF]===40);
  ok('recall marches the troops and the warden home', !e && !G.patrolById(s,p.id) && back && back.general===g.id && g.status==='marching');
  let n=0; while(s.moves.includes(back) && n++<200) run(s,10);
  ok('they rejoin the garrison', c.units[INF]===50 && g.status==='home', c.units[INF]+' '+g.status);
  // base lost: the patrol goes home to the capital
  const p2=G.patrolCreate(s,'p',{from:b.id,to:c.id,base:c.id,units:{[INF]:20}});
  c.owner='a2'; run(s,20); c.owner='p';
  ok('a patrol whose base is lost is recalled', !G.patrolById(s,p2.id));
}

// ---- caravans travel a little faster on a watched road; the patrol wears it in ----
{ const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=200; c.res.grain=1e6;
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100},every:30});
  run(s,15); const m0=s.moves.find(m=>m.route===r.id); const d0=m0.arrive-m0.depart;
  s.moves=s.moves.filter(m=>m!==m0); r.nextAt=s.time+1e9;
  const p=G.patrolCreate(s,'p',{route:r.id,units:{[INF]:100}}); p.readyAt=s.time;
  r.nextAt=s.time; run(s,15); const m1=s.moves.find(m=>m.route===r.id);
  ok('caravans on a watched road are faster', m1 && m1.ptSped && m1.ptCov>0.5 && (m1.arrive-m1.depart)<d0, (m1.arrive-m1.depart)+' vs '+d0);
  const w0=Object.values((s.roads&&s.roads.wear)||{}).reduce((a,v)=>a+v,0);
  run(s,60*12);
  const w1=Object.values((s.roads&&s.roads.wear)||{}).reduce((a,v)=>a+v,0);
  ok('the patrol wears its road', w1>w0, w0.toFixed(1)+' -> '+w1.toFixed(1));
  ok('protected trips are counted', p.stats.protected>=1, p.stats.protected);
}

// ---- the Protector of the Trade: earned, contested, taken ----
{ const s=fresh(); const pr=G.protector(s); const r0=G.renown(s,'p'), a0=G.renown(s,'a1');
  G.protectorScore(s,'p',PT.claim+5); G.protectorTick(s,0.01);
  ok('the title is earned at the claim score', pr.holder==='p' && G.renown(s,'p')===r0+PT.renown, pr.holder+' renown '+r0+' -> '+G.renown(s,'p'));
  const c=G.capital(s,'p'), a=G.capital(s,'a1'); c.buildings.market=4; a.buildings.market=4;
  const plain={id:'x',goods:{give:{ore:300},take:{timber:300}}};
  s.patrols.prot.holder=null; const i0=G.routeTripIncome(s,plain,c,a); s.patrols.prot.holder='p';
  ok('the Protector earns more per trip', G.routeTripIncome(s,plain,c,a)>i0, i0+' -> '+G.routeTripIncome(s,plain,c,a));
  const mi=Object.values(s.minors||{}).find(m=>m.kind==='merchant');
  if(mi){ const f0=G.minorInf(s,mi,'p'); G.protectorTick(s,10); ok('merchant republics favour the Protector', G.minorInf(s,mi,'p')>f0, f0.toFixed(2)+' -> '+G.minorInf(s,mi,'p').toFixed(2)); }
  const hs=pr.score.p;
  G.protectorScore(s,'a1',hs*0.9); G.protectorTick(s,0.01);
  ok('a rival close behind contests it', pr.holder==='p' && pr.contested==='a1' && s.log.some(l=>/contest your title/.test(l.text)));
  G.protectorScore(s,'a1',hs*0.6); G.protectorTick(s,0.01);
  // (renown itself also moves with free-city patronage: compare the title's share, renownBonus)
  ok('a rival well ahead takes it; the renown moves with it', pr.holder==='a1' && (s.empires.p.renownBonus||0)===0 && s.empires.a1.renownBonus===PT.renown, pr.holder+' p '+s.empires.p.renownBonus+' a1 '+s.empires.a1.renownBonus);
  for(let i=0;i<40;i++) G.protectorTick(s,60);
  ok('the title lapses when nobody keeps the roads', pr.holder===null && (s.empires.a1.renownBonus||0)===0, pr.holder+' '+s.empires.a1.renownBonus);
}

// ---- AI realms patrol their own routes (and compete for the title) ----
{ const s=fresh(); const emp=s.empires.a1; const a=G.capital(s,'a1');
  const t=G.freeTile(s,x=>G.dist(x,a)>=6&&G.dist(x,a)<=8&&G.landReachable(s,a,x)); const a2=G.foundCity(s,'a1',t.x,t.y,'Aiville');
  a.buildings.market=4; a2.buildings.market=2; a.res.ore=5000; a2.res.ore=0; a.res.grain=1e5;
  const au=DATA.races[emp.race].units.filter(u=>DATA.units[u].type!=='siege'&&DATA.units[u].type!=='ship');
  a.units[au[0]]=300; if(au[1]) a.units[au[1]]=200;
  const r=G.createRoute(s,'a1',a.id,a2.id,{give:{ore:200}});
  midCamp(s,a,a2,'kA',2,30);
  const got=G.aiPatrol(s,emp);
  ok('an AI realm patrols its dangerous route', got && typeof got==='object' && got.owner==='a1' && got.route===r.id, typeof got==='string'?got:JSON.stringify(got&&got.units));
  const kept=G.atkPower(s,'a1',a.units)+G.defPower(s,'a1',a.units);
  ok('and keeps most of its garrison home', G.unitsCount(a.units)>G.unitsCount(got.units), G.unitsCount(a.units)+' home vs '+G.unitsCount(got.units));
  // its patrol earns title score while it watches the road
  got.readyAt=s.time; run(s,60*15);
  ok('AI patrols earn title score', (G.protector(s).score.a1||0)>0, (G.protector(s).score.a1||0).toFixed(2));
  // recall when the road is no longer used
  for(const x of G.routes(s).filter(x=>x.owner==='a1')) G.cancelRoute(s,x.id);
  for(let i=0;i<4;i++) G.aiPatrol(s,emp);
  ok('the AI recalls a patrol whose route is gone', !G.patrolById(s,got.id) && !G.patrolsOf(s,'a1').length);
}

// ---- AI patrols happen on their own in a running world ----
{ const s=G.newGame({name:'T',race:'hearth',rivals:4}); s.settings.hostility=0;
  const t0=Date.now(); let any=0;
  // give each AI a risky internal route so the AI hook has something to guard
  for(const e of Object.values(s.empires)){ if(e.id==='p') continue; const a=G.capital(s,e.id); if(!a) continue;
    const t=G.freeTile(s,x=>G.dist(x,a)>=6&&G.dist(x,a)<=8&&G.landReachable(s,a,x)); if(!t) continue;
    const b=G.foundCity(s,e.id,t.x,t.y,e.name+' Port'); a.buildings.market=4; b.buildings.market=1; a.res.ore=5000; a.res.grain=1e5;
    const au=DATA.races[e.race].units.filter(u=>DATA.units[u].type!=='siege'&&DATA.units[u].type!=='ship'); a.units[au[0]]=(a.units[au[0]]||0)+300;
    G.createRoute(s,e.id,a.id,b.id,{give:{ore:200},every:30}); midCamp(s,a,b,'k'+e.id,2,30); }
  run(s,60*10);
  any=G.patrols(s).filter(p=>p.owner!=='p').length;
  ok('AI realms station patrols through their AI hook', any>=1, any+' AI patrols');
}

// ---- supply lines prefer patrolled roads ----
// A patrol walks a road that bends 2-3 tiles away from the straight track between two cities: a supply cart takes it
// when the bend is at most 20% longer, and keeps to the direct track when it is not.
{ let done=false;
  let S0=null; const len=w=>G.patrolCostLen(S0,w.path);
  for(let k=0;k<40&&!done;k++){
    const s=fresh(); S0=s; const A=G.capital(s,'p');
    const tb=G.freeTile(s,x=>G.dist(x,A)>=10&&G.dist(x,A)<=12&&G.landReachable(s,A,x)); if(!tb) continue;
    const B=G.foundCity(s,'p',tb.x,tb.y,'Bee');
    const dx=B.x-A.x, dy=B.y-A.y, L=Math.hypot(dx,dy), off=2.6;
    const M=G.tileAt(s,Math.round((A.x+B.x)/2-dy/L*off),Math.round((A.y+B.y)/2+dx/L*off));
    if(!M||G.isWater(M)||M.city) continue;
    const p1=G.path(s,A,M,false), p2=G.path(s,M,B,false); if(!p1||!p2) continue;
    for(const x of [A,B]){ x.buildings.market=4; x.res.grain=1e5; }
    A.units[INF]=200;
    const direct=G.supplyReach(s,'p',A,B);
    if(!direct||direct.naval) continue;
    const bend=[...p1.path,...p2.path.slice(1)];
    if(len({path:bend})>len(direct)*PT.supplyDetour-0.2 || len({path:bend})<len(direct)*1.05) continue;   // a bend 5-20% longer than the direct track
    const p=G.patrolCreate(s,'p',{from:A.id,to:B.id,units:{[INF]:60}}); if(typeof p==='string') continue;
    // the patrol's road is the bend; its two ends are the same city here, so the straight track is not watched by default
    p.path=bend.map(q=>[q[0],q[1]]); p.to=A.id; p.readyAt=s.time; s.patrols.rev++;
    const covD=G.patrolCovers(s,{owner:'p',path:direct.path}).share;
    if(covD>0.6) continue;
    const way=G.supplyReach(s,'p',A,B);
    const covW=G.patrolCovers(s,{owner:'p',path:way.path}).share;
    done=true;
    ok('supply carts take the patrolled road when it is not much longer', way.patrolled && covW>covD+0.2 && len(way)<=len(direct)*PT.supplyDetour+0.01 && way.dur>=direct.dur, 'covered '+covD.toFixed(2)+' -> '+covW.toFixed(2)+' length '+len(direct).toFixed(1)+' -> '+len(way).toFixed(1));
    // a cart dispatched by the planner follows it
    B.res.grain=0; A.res.grain=1e5; G.setSupplyPolicy(s,'p','grain',{on:true,mode:'stock',n:2000});
    G.supplyRun(s,'p'); const cart=s.moves.find(m=>m.supply&&m.from===A.id&&m.to===B.id);
    ok('the dispatched cart follows the patrolled road', cart && G.patrolCovers(s,cart).share>covD+0.2, cart?G.patrolCovers(s,cart).share.toFixed(2):'no cart');
    // a long detour is not taken
    PT.supplyDetour=1.02; s.patrols.rev++;
    const w2=G.supplyReach(s,'p',A,B); PT.supplyDetour=1.2;
    ok('but not when it is much longer', !w2.patrolled && len(w2)<=len(direct)+0.01);
  }
  ok('found a world for the supply test', done);
}

// ---- foreign route income follows prices ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=4; const a=G.capital(s,'a1'); a.buildings.market=4;
  const r={id:'x',goods:{give:{ore:300},take:{timber:200}}};
  const P=G.prices(s);
  const set=(g,m)=>{ P.x[g]=Math.log(m); P.imp[g]=0; };
  set('ore',1); set('timber',1); const i1=G.routeTripIncome(s,r,c,a);
  set('ore',2.2); set('timber',2.2); const iHi=G.routeTripIncome(s,r,c,a);
  set('ore',0.4); set('timber',0.4); const iLo=G.routeTripIncome(s,r,c,a);
  ok('dear goods pay more per trip, cheap goods less', iHi>i1 && i1>iLo, iLo+' < '+i1+' < '+iHi);
  ok('within the bounds', iHi<=Math.ceil(G.routeIncome(s,c,a)*G.TRADE.priceMax) && iLo>=Math.floor(G.routeIncome(s,c,a)*G.TRADE.priceMin));
  const s2=fresh(); const c2=G.capital(s2,'p'), a2=G.capital(s2,'a1'); c2.buildings.market=4; a2.buildings.market=4; delete s2.prices;
  ok('without prices the distance income is unchanged', G.routeTripIncome(s2,r,c2,a2)===G.routeIncome(s2,c2,a2));
}

// ---- console: patrol, patrols, recall patrol N ----
{ const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=200; c.units[MIL]=50; c.res.grain=1e6;
  const withMax=f=>{ const m=PT.maxPatrols, k=PT.perCities; PT.perCities=1; try{ return f(); } finally{ PT.perCities=k; } };
  run(s,10);   // the first tick registers the commands
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}}); midCamp(s,c,b,'kC',2,30);
  const ctx={city:c.id};
  const l1=G.cli.exec(s,'p','patrols',ctx);
  ok('patrols lists routes with their risk', l1.ok && l1.out.some(x=>/Risky|Deadly/.test(x)), l1.out.join(' | '));
  const l2=G.cli.exec(s,'p','patrol 1 40 '+DATA.units[INF].name.toLowerCase(),ctx);
  ok('patrol <route #> <units> stations a patrol', l2.ok && G.patrolsOf(s,'p').length===1 && G.patrolsOf(s,'p')[0].units[INF]===40, l2.err||l2.out.join(' '));
  c.buildings.townhall=c.buildings.townhall||1; const l3=withMax(()=>G.cli.exec(s,'p','patrol from '+b.name+' to '+c.name+' 10 '+DATA.units[MIL].name.toLowerCase(),ctx));
  ok('patrol from A to B <units> parses (refused here: the same road)', !l3.ok && /already patrolled/.test(l3.err), l3.err);
  s.explored.fill(1); const l3b=withMax(()=>G.cli.exec(s,'p','patrol from '+c.name+' to '+G.capital(s,'a1').name+' 10 '+DATA.units[MIL].name.toLowerCase(),ctx));
  ok('patrol from A to B <units> stations a road patrol', (l3b.ok && G.patrolsOf(s,'p').length===2) || /too long|too far/i.test(l3b.err||''), l3b.err||l3b.out.join(' '));
  const n4=G.patrolsOf(s,'p').length; const l4=G.cli.exec(s,'p','recall patrol 1',ctx);
  ok('recall patrol N recalls it', l4.ok && G.patrolsOf(s,'p').length===n4-1, l4.err||l4.out.join(' '));
  const l5=G.cli.exec(s,'p','recall patrol 3',ctx);
  ok('recall of a missing patrol explains', !l5.ok && /patrol/.test(l5.err));
}

// ---- saves: round trip and an old save ----
{ const s=fresh(); const [c,b]=twoCities(s); c.units[INF]=200; c.res.grain=1e6;
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}});
  const p=G.patrolCreate(s,'p',{route:r.id,units:{[INF]:60}}); G.protectorScore(s,'p',12);
  run(s,60);
  const s2=G.deserialize(G.serialize(s));
  const p2=s2&&G.patrolById(s2,p.id);
  ok('patrols survive save and load', p2 && p2.units[INF]===p.units[INF] && p2.path.length===p.path.length && Math.abs(G.protector(s2).score.p-G.protector(s).score.p)<1e-6);
  run(s2,600);
  ok('a loaded game keeps patrolling', G.patrolById(s2,p.id) && p2.stats.paidGrain>p.stats.paidGrain);
  const old=JSON.parse(G.serialize(s)); delete old.patrols;
  const s3=G.deserialize(JSON.stringify(old));
  ok('an old save without patrols loads', !!s3 && G.patrols(s3).length===0 && G.patrolRisk(s3,G.routes(s3)[0]).level);
  run(s3,600);
  ok('and runs', G.patrols(s3).length===0 && !G.protector(s3).holder);
  const junk=JSON.parse(G.serialize(s)); junk.patrols={list:[{id:'ptx',owner:'nobody',path:[[1,1]]},null,{id:'pty',owner:'p'}]};
  const s4=G.deserialize(JSON.stringify(junk));
  ok('a damaged patrol list is cleaned on load', s4 && G.patrols(s4).length===0);
}

// ---- performance ----
// the same world twice (one with three patrols), the same dice: patrols must not slow the game down noticeably
{ const mulberry=a=>()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  const R0=Math.random; Math.random=mulberry(77);
  const s0=G.newGame({name:'T',race:'hearth'}); s0.settings.hostility=0; G.patrolInstall();
  const c=G.capital(s0,'p'); c.units[INF]=600; c.res.grain=1e6; c.buildings.market=12; c.res.ore=1e6;
  const cs=[c]; for(let i=0;i<3;i++){ const t=G.freeTile(s0,x=>G.dist(x,c)>=5&&G.dist(x,c)<=9&&G.landReachable(s0,c,x)); cs.push(G.foundCity(s0,'p',t.x,t.y,'P'+i)); }
  for(const x of cs.slice(1)){ x.buildings.market=4; G.createRoute(s0,'p',c.id,x.id,{give:{ore:100},every:5}); }
  const json=G.serialize(s0);
  const mk=withP=>{ const s=G.deserialize(json); if(withP) for(const x of cs.slice(1)){ const p=G.patrolCreate(s,'p',{from:c.id,to:x.id,units:{[INF]:60}}); if(typeof p==='object') p.readyAt=s.time; } return s; };
  const time=(s,seed)=>{ Math.random=mulberry(seed); const t0=process.hrtime.bigint(); run(s,60*20); return Number(process.hrtime.bigint()-t0)/1e6; };
  time(mk(false),5); time(mk(true),5);   // warm up
  let ta=0, tb=0; for(let k=0;k<3;k++){ ta+=time(mk(false),11+k); tb+=time(mk(true),11+k); }
  Math.random=R0;
  ok('patrols cost little time', tb<ta*1.25+30, 'without '+ta.toFixed(0)+' ms, with 3 patrols '+tb.toFixed(0)+' ms (3 runs of 20 game-minutes)');
  const s=mk(true), n=2000, t0=process.hrtime.bigint();
  for(let i=0;i<n;i++) G.patrolCoverAt(s,'p',(i*7)%s.map,(i*13)%s.map);
  const per=Number(process.hrtime.bigint()-t0)/1e6/n;
  ok('a coverage lookup is cheap', per<0.05, per.toFixed(4)+' ms');
  const t1=process.hrtime.bigint(); for(let i=0;i<50;i++) G.patrolRisk(s,G.routes(s)[0]); const pr=Number(process.hrtime.bigint()-t1)/1e6/50;
  ok('a route risk read is cheap enough for the UI', pr<5, pr.toFixed(2)+' ms');
}

console.log(fails?fails+' FAILED':'all passed');
`);
