// The four later peoples (races2.js): Tidekin, Veilborn, Gravebound, Windkin.  node tests/races.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
initRaces2(); initRaces2();   // idempotent
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const NEW=['tide','veil','grave','wind'];
const fresh=(race,rivals=3)=>{ const s=G.newGame({name:'T',race,rivals}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; return s; };
const rich=(s,c)=>{ for(const g of DATA.goodOrder) c.res[g]=1e5; s.empires.p.gold=1e6; c.pop=400; c.buildings.warehouse=20; };
const dry=fn=>{ try{ return fn(); }catch(e){ return 'THREW '+e.stack.split('\\n').slice(0,3).join(' / '); } };

// ---- data ----
for(const r of NEW){
  const R=DATA.races[r];
  ok(r+': race data complete', R && R.name && R.adj && R.color && R.blurb && R.perks.length>=5 && R.mult && R.bonus && R.unique && R.gods.length===2 && R.heroNames.length===6 && R.aggr>=0.3 && R.aggr<=0.8 && DATA.raceOrder.includes(r));
  ok(r+': 8 units (+ battle mage) defined', R.units.filter(u=>u!==R.mageUnit).length===8 && R.units.every(u=>DATA.units[u]&&DATA.units[u].at) && DATA.units[R.mageUnit] && DATA.units[R.mageUnit].mage===1 && DATA.units[R.mageUnit].at==='magetower' && DATA.units[R.mageUnit].cost.mana===20);
  const b=DATA.buildings[R.unique]; const good=Object.keys(DATA.goods).find(g=>DATA.goods[g].race===r);
  ok(r+': unique building and good', b && b.race===r && DATA.buildingOrder.includes(R.unique) && DATA.buildingGroups.some(g=>g.list.includes(R.unique)) && good && DATA.goodOrder.includes(good));
  ok(r+': names, realm, homeland', DATA.aiNames[r].length===6 && DATA.aiRulers[r] && DATA.homeland[r].terrain && DATA.homeland[r].seeks && !DATA.terrain[Object.keys(DATA.homeland[r].terrain)[0]].impassable);
  ok(r+': gods exist', R.gods.every(g=>DATA.gods[g]) && JSON.stringify(G.raceGods(r))===JSON.stringify(R.gods));
  ok(r+': trade specialty registered', Array.isArray(G.TRADE_SPECIALTY[r]) && G.TRADE_SPECIALTY[r].every(g=>DATA.goods[g]));
}
ok('distinct colours', new Set(DATA.raceOrder.map(r=>DATA.races[r].color)).size===DATA.raceOrder.length);
ok('unit names unique', (()=>{ const n=Object.values(DATA.units).filter(u=>u.at).map(u=>u.name); return new Set(n).size===n.length; })());

// ---- every new people can start and play 2 hours ----
for(const r of NEW){
  const res=dry(()=>{ const s=fresh(r); G.advance(s,7200,1500); const c=G.capital(s,'p'); return c && !s.gameOver ? null : 'no capital'; });
  ok(r+': new game runs 2 game-hours', res===null, res||'');
}
// ---- every people can be a rival ----
{ const res=dry(()=>{ const s=G.newGame({name:'T',race:'hearth',rivals:7}); const ais=Object.values(s.empires).filter(e=>e.id!=='p');
    const races=new Set(ais.map(e=>e.race));
    G.advance(s,7200,1500);
    return { n:ais.length, races:races.size, alive:ais.every(e=>G.citiesOf(s,e.id).length>0), heroes:ais.every(e=>!G.ensureRivalHero||e.hero&&e.hero.name) }; });
  ok('7 rivals: all eight peoples in play for 2 hours', res.n===7 && res.races===7 && res.alive && res.heroes, JSON.stringify(res));
}
for(const r of NEW){
  const res=dry(()=>{ const s=G.newGame({name:'T',race:'hearth',rivals:1,rivalRaces:[r]}); G.advance(s,3600,600); return s.empires.a1.race===r && G.citiesOf(s,'a1').length>0 ? null : 'bad'; });
  ok(r+': plays as a lone rival', res===null, res||'');
}

// ---- units train, unique buildings produce ----
for(const r of NEW){
  const s=fresh(r); const c=G.capital(s,'p'); rich(s,c);
  Object.assign(c.buildings,{townhall:12,barracks:10,stable:5,workshop:5});
  const units=DATA.races[r].units.filter(u=>DATA.units[u].at!=='magetower' || DATA.buildings.magetower);
  if(DATA.buildings.magetower) c.buildings.magetower=3;
  const errs=units.map(u=>[u,G.queueTrain(s,c.id,u,2)]).filter(([,e])=>e);
  G.advance(s,3600,400);
  ok(r+': every unit trains', !errs.length && units.every(u=>(c.units[u]||0)>=2), JSON.stringify(errs)+' '+JSON.stringify(c.units));
  // unique building: buildable from scratch with its prerequisites, and makes its good
  const b=DATA.races[r].unique, good=Object.keys(DATA.goods).find(g=>DATA.goods[g].race===r);
  const s2=fresh(r); const c2=G.capital(s2,'p'); rich(s2,c2); delete c2.buildings[b];
  for(const [rb,rl] of Object.entries(DATA.buildings[b].req||{})) c2.buildings[rb]=Math.max(G.lvl(c2,rb),rl);
  c2.buildings.townhall=Math.max(c2.buildings.townhall,4);
  const st=G.buildStatus(s2,c2,b);
  ok(r+': '+b+' buildable', st.ok, st.reason);
  c2.buildings[b]=3; c2.res[good]=0;
  const e=G.econ(s2,c2);
  ok(r+': '+b+' listed in the economy', (e.net[good]||0)>0 && (DATA.buildings[b].prod || e.refiners.some(x=>x.type===b)), 'net '+(e.net[good]||0).toFixed(2));
  G.advance(s2,600,60);
  ok(r+': '+b+' produces '+good, c2.res[good]>3, (c2.res[good]||0).toFixed(1));
  // other peoples cannot build it
  const s3=fresh('hearth'); ok(r+': '+b+' hidden from others', G.buildStatus(s3,G.capital(s3,'p'),b).hidden===true);
}

// ---- Tidekin ----
{ let coastal=0; for(let i=0;i<8;i++){ const s=fresh('tide'); if(G.coastal(s,G.capital(s,'p').x,G.capital(s,'p').y)) coastal++; }
  ok('tide: capital always on the shore', coastal===8, coastal+'/8');
  let aiCoastal=0, aiN=0; for(let i=0;i<4;i++){ const s=G.newGame({name:'T',race:'hearth',rivals:7}); for(const e of Object.values(s.empires)) if(e.race==='tide'){ aiN++; const c=G.capital(s,e.id); if(G.coastal(s,c.x,c.y)) aiCoastal++; } }
  ok('tide: rival capitals on the shore too', aiN>0 && aiCoastal===aiN, aiCoastal+'/'+aiN);
  const s=fresh('tide'); const c=G.capital(s,'p'); rich(s,c); c.buildings.harbor=5; c.site=null;
  const fish=G.econ(s,c).fishing||0; ok('tide: harbor fishing bonus', fish>0, fish.toFixed(1));
  const h=fresh('hearth'); const hc=G.capital(h,'p'); hc.buildings.harbor=5;
  ok('tide: cheaper harbor', G.buildStatus(s,c,'harbor').cost.timber < G.buildStatus(h,hc,'harbor').cost.timber, G.buildStatus(s,c,'harbor').cost.timber+' vs '+G.buildStatus(h,hc,'harbor').cost.timber);
  ok('tide: faster ships', G.unitStats(s,'p','warship').spd > G.unitStats(h,'p','warship').spd && G.unitStats(s,'p','militia').spd===DATA.units.militia.spd);
  ok('tide: ships build faster', G.trainTime(s,c,'transport') < G.trainTime(h,Object.assign(hc,{buildings:{...hc.buildings,harbor:5}}),'transport'));
  const t0=c.res.timber; G.queueTrain(s,c.id,'transport',2); ok('tide: shipwrights refund a quarter', Math.abs((t0-c.res.timber)-2*400*0.75)<1, (t0-c.res.timber).toFixed(0));
  // pearls lift happiness
  c.pop=20; c.units={}; c.res.pearls=0; const h0=G.happiness(s,c).value; c.res.pearls=50; const h1=G.happiness(s,c).value;
  ok('tide: pearls add happiness', h1===h0+6 && G.happiness(s,c).why.some(w=>w.label==='Pearls'), h0+' -> '+h1);
  delete c.buildings.pearlbeds; c.res.pearls=10; c.pop=100; G.advance(s,300,30); ok('tide: pearls are worn away', c.res.pearls<10, c.res.pearls.toFixed(2));
}

// ---- marches over water ----
{ const mk=race=>{ const s=fresh(race); const c=G.capital(s,'p'); rich(s,c);
    // carve a little island 4-6 tiles away
    const T=G.freeTile(s,t=>G.dist(t,c)>=4&&G.dist(t,c)<=6&&Object.values(s.cities).every(o=>G.dist(o,t)>=3)&&s.tiles.every(x=>G.dist(x,t)>1.5||(!x.city&&!x.camp&&!x.oasis&&!x.ruin)));
    for(const x of s.tiles){ const d=G.dist(x,T); if(d>0.5&&d<1.5) x.terrain='lake'; }
    G.clearPaths(s); const isle=G.foundCity(s,'p',T.x,T.y,'Isle'); return {s,c,T,isle}; };
  { const {s,c,T,isle}=mk('wind'); c.units={hawkrider:10,rocrider:5,cliffspear:10,scout:3};
    ok('wind: walkers cannot reach the island', !!G.sendArmy(s,c.id,T.x,T.y,'reinforce',{cliffspear:5}));
    const p=G.planMarch(s,'p',c,T,{hawkrider:5}); ok('wind: fliers fly straight', p.ok && p.flying && p.path.length===2);
    ok('wind: scouts fly', G.planMarch(s,'p',c,T,{scout:3}).flying===true);
    ok('wind: mixed fliers and walkers cannot', !G.planMarch(s,'p',c,T,{hawkrider:5,cliffspear:5}).ok);
    ok('wind: send fliers to the island', G.sendArmy(s,c.id,T.x,T.y,'reinforce',{hawkrider:10,rocrider:5})===null);
    G.advance(s,1800,200); ok('wind: fliers arrived', isle.units.hawkrider===10 && isle.units.rocrider===5, JSON.stringify(isle.units));
    const h=fresh('hearth'); const hcap=G.capital(h,'p'); hcap.pop=c.pop; hcap.buildings.townhall=c.buildings.townhall; ok('wind: farther sight', G.visionRadius(s,c)>G.visionRadius(h,hcap)*1.3);
    c.buildings.aerie=5; const q=G.econ(s,c).quarters; delete c.buildings.aerie; ok('wind: aerie quarters soldiers', q===G.econ(s,c).quarters+20);
  }
  { const {s,c,T,isle}=mk('hearth'); c.units={scout:3}; ok('hearth: scouts do not fly', !G.planMarch(s,'p',c,T,{scout:3}).ok); }
  { const {s,c,T,isle}=mk('tide'); c.units={shorespear:20,kelpierider:5,tidecharger:5};
    const p=G.planMarch(s,'p',c,T,{shorespear:5,kelpierider:5}); ok('tide: amphibious troops wade across', p.ok && !p.flying && !p.naval);
    ok('tide: non-amphibious riders cannot', !G.planMarch(s,'p',c,T,{shorespear:5,tidecharger:1}).ok);
    ok('tide: send amphibious troops', G.sendArmy(s,c.id,T.x,T.y,'reinforce',{shorespear:20,kelpierider:5})===null);
    G.advance(s,2400,250); ok('tide: they arrived', isle.units.shorespear===20 && isle.units.kelpierider===5, JSON.stringify(isle.units));
  }
}

// ---- Gravebound ----
{ const s=fresh('grave'); const c=G.capital(s,'p'); rich(s,c);
  c.units={skeleton:100,dreadknight:20};
  const e=G.econ(s,c); ok('grave: troops eat no grain', e.upkeep===0 && DATA.races.grave.units.every(u=>DATA.units[u].upkeep===0), 'upkeep '+e.upkeep);
  ok('grave: units cost bonedust, not grain', DATA.races.grave.units.every(u=>DATA.units[u].cost.bonedust>0 && !DATA.units[u].cost.grain));
  // attack a camp and win: the fallen rise and march home
  const camp=Object.values(s.camps).sort((a,b)=>G.dist(a,c)-G.dist(b,c))[0]; camp.units={brigand:30};
  ok('grave: march on a camp', G.sendArmy(s,c.id,camp.x,camp.y,'attack',{skeleton:100,dreadknight:20})===null);
  for(let i=0;i<60 && !(c.units.risen>0);i++) G.advance(s,120,20);
  const rep=s.reports.find(r=>/Victory at the brigand camp/.test(r.title));
  ok('grave: risen join the army after a win', rep && (c.units.risen||0)>0, 'risen '+(c.units.risen||0)+' '+(rep&&JSON.stringify(rep.body.defLost)));
  // defend and win: the fallen rise in the city
  const s2=fresh('grave'); s2.settings.hostility=0; const c2=G.capital(s2,'p'); rich(s2,c2); c2.units={barrowwarden:200}; c2.buildings.wall=5;
  const ai=G.capital(s2,'a1'); ai.units={[DATA.races[s2.empires.a1.race].units[0]]:40}; ai.res.grain=1e5;
  const err=G.sendArmy(s2,ai.id,c2.x,c2.y,'raid',{...ai.units});
  for(let i=0;i<80 && !(c2.units.risen>0);i++) G.advance(s2,120,20);
  ok('grave: risen rise in a city that held', !err && (c2.units.risen||0)>0, (err||'')+' risen '+(c2.units.risen||0));
  const hs=fresh('hearth'); const hc=G.capital(hs,'p'); hc.units={militia:200}; const ha=G.capital(hs,'a1'); ha.units={[DATA.races[hs.empires.a1.race].units[0]]:40};
  G.sendArmy(hs,ha.id,hc.x,hc.y,'raid',{...ha.units}); G.advance(hs,7200,600); ok('others raise nobody', !hc.units.risen);
  // risen take no citizens and crumble above the cap
  ok('grave: risen take no citizens', G.unitPop('risen')===0 && G.dismiss(s,c.id,'risen',1)==='Nothing to dismiss');
  c.units.risen=500; G.advance(s,600,60); ok('grave: excess risen crumble', c.units.risen<500 && c.units.risen>=G.RACES2.risenCap(c), ''+c.units.risen);
  // ossuary raises more, and traditions too
  const base=G.raiseShare(s,'p',{buildings:{}}); ok('grave: ossuary raises more', G.raiseShare(s,'p',{buildings:{ossuary:10}})>base);
  // gloom and fear
  c.pop=20; c.units={}; ok('grave: gloomy cities', G.happiness(s,c).why.some(w=>/Gloom/.test(w.label)&&w.value===-5));
  { const sf=fresh('grave'); const ids=Object.keys(sf.empires).filter(id=>id!=='p');
    ok('grave: feared by rivals', ids.every(id=>G.rel(sf,id).opinion<=-G.RACES2.fearOpinion), ids.map(id=>G.rel(sf,id).opinion).join(',')); }
  const s3=G.newGame({name:'T',race:'hearth',rivals:2,rivalRaces:['grave','sylvan']});
  ok('grave: a Gravebound rival starts feared', G.rel(s3,'a1').opinion<0 && G.rel(s3,'a2').opinion===0, G.rel(s3,'a1').opinion+' '+G.rel(s3,'a2').opinion);
}

// ---- Veilborn ----
{ const s=fresh('veil'); const c=G.capital(s,'p'); const h=fresh('hearth'); const hc=G.capital(h,'p');
  ok('veil: +50% mana', Math.abs(G.mod(s,'p',null,'mana')/G.mod(h,'p',null,'mana')-1.5)<0.01);
  ok('veil: stronger spells', G.mod(s,'p',null,'spellPower')>G.mod(h,'p',null,'spellPower'));
  ok('veil: glamour defence', G.mod(s,'p',null,'def')>G.mod(h,'p',null,'def'));
  const d0=G.cityDefense(s,c).mult; c.buildings.dreamspire=10; ok('veil: dreamspire glamours the garrison', Math.abs(G.cityDefense(s,c).mult/d0-1.15)<0.001);
  ok('veil: fragile and few', G.mod(s,'p',c,'housing')<G.mod(h,'p',hc,'housing') && G.mod(s,'p',c,'popGrowth')<G.mod(h,'p',hc,'popGrowth')*1.01);
  if(s.ley) ok('veil: capital near a ley enclave', s.ley.nodes.some(n=>Math.hypot(n.x-c.x,n.y-c.y)<=2.5));
}

// ---- traditions, wonders, seasons resolve ----
for(const r of NEW){
  const s=fresh(r); const c=G.capital(s,'p');
  const mine=G.traditionsFor(s,'p').filter(id=>DATA.traditions[id].race===r);
  ok(r+': own traditions (six, tiers 1-3+), ', mine.length>=4 && [1,2,3].every(t=>mine.some(id=>DATA.traditions[id].tier===t)));
  ok(r+': no foreign traditions offered', G.traditionsFor(s,'p').every(id=>!DATA.traditions[id].race||DATA.traditions[id].race===r));
  const t1=mine.find(id=>DATA.traditions[id].tier===1); s.empires.p.culture=1e6;
  const fx=DATA.traditions[t1].fx||{}; const k=Object.keys(fx)[0]; const before=k?G.mod(s,'p',c,k):0;
  ok(r+': adopt '+t1, G.adoptTradition(s,'p',t1)===null && (!k || Math.abs(G.mod(s,'p',c,k)/before-fx[k])<0.01));
  const w=DATA.wonders[r]; const wb=DATA.buildings[w.key];
  ok(r+': wonder '+w.name, w.key==='wonder_'+r && wb && wb.race===r && wb.wonder && Object.keys(w.fx).length>0 && G.wonderOf(s,'p').key===w.key);
  s.empires.p._wonderLevel=5; const fk=Object.keys(w.fx)[0]; const m5=G.mod(s,'p',c,fk); s.empires.p._wonderLevel=0; const m0=G.mod(s,'p',c,fk);
  ok(r+': wonder stages apply ('+fk+')', Math.abs(m5/m0-(1+5*w.fx[fk]))<0.01, (m5/m0).toFixed(3));
  ok(r+': seasons', DATA.seasonRace[r].length===4 && DATA.seasonRace[r].every(x=>x>=0&&x<=1.5));
  const g=[0,1,2,3].map(i=>{ s.time=i*7200*G.pace(s).time+10; return G.mod(s,'p',c,'grain'); });
  ok(r+': winter harvest is the leanest', g[3]<g[0] && g[3]<g[2], g.map(x=>x.toFixed(2)).join(' '));
}

// ---- save / load ----
for(const r of NEW){
  const s=fresh(r); G.advance(s,600,60); G.save(s); const s2=G.load(); G.advance(s2,600,60);
  ok(r+': save and load', s2 && s2.empires.p.race===r && G.capital(s2,'p'));
}
console.log(fails? fails+' FAILED':'ALL PASS');
`);
