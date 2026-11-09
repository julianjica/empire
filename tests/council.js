// Royal Council and city governors: advisors, priorities, snooze/dismiss, governors, persistence, all peoples, a sim.  node tests/council.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const fresh=(race='hearth',o={})=>{ const s=G.newGame({name:'T',race,...o}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; return s; };
const slow=(s)=>{ s.slowClock=9.99; G.step(s,0.02); };
const adv=(s,re)=>G.councilAdvice(s).find(i=>re.test(i.id));
const near=(s,c,lo,hi)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&!G.isWater(x)&&!DATA.terrain[x.terrain].impassable);
const rich=(s,c,n=5000)=>{ c.buildings.warehouse=Math.max(c.buildings.warehouse||0,14); for(const g of DATA.goodOrder) c.res[g]=n; s.empires.p.gold=20000; };
const refresh=s=>G.councilDirty(s);
const hostileNeighbour=(s,c,d=6)=>{ const t=near(s,c,d-1,d+1); const o=G.foundCity(s,'a1',t.x,t.y,'Foeburg'); G.rel(s,'a1').status='war'; s.explored[t.y*s.map+t.x]=1; return o; };

// ---- tables and councillors ----
ok('five roles', DATA.councilOrder.length===5 && DATA.councilOrder.every(k=>DATA.councilRoles[k]));
ok('names for all 8 peoples', DATA.raceOrder.length>=8 && DATA.raceOrder.every(r=>DATA.councilNames[r] && DATA.councilOrder.every(k=>DATA.councilNames[r][k] && DATA.councilNames[r][k][1])));
ok('six governor focuses', DATA.govFocusOrder.length===6 && DATA.govFocusOrder.every(f=>DATA.govFocus[f]));
{ const s=fresh('delver'); const c=G.councilor(s,'marshal'); ok('councillor flavoured by people', c.title==='War-Thane' && c.initials==='DI' && c.icon, JSON.stringify(c)); }

// ---- Steward ----
{ const s=fresh(); const c=G.capital(s,'p');
  const i=adv(s,/^steward:idle:/);
  ok('steward: idle builders at the start', !!i && i.action && i.action.kind==='build');
  ok('steward: first-hour advice follows the tutorial path (farm first, with a reason)', i && i.action.b==='farm' && /grain feeds everyone/.test(i.text), i&&i.text);
  ok('first steward item is the top item', G.councilAdvice(s)[0].advisor==='steward');
  ok('one-click build works', G.councilDo(s,i.action)===null && c.buildQueue.some(q=>q.type==='farm'));
  ok('council refuses to build a wonder', /leaves that choice/.test(G.councilDo(s,{kind:'build',c:c.id,b:'wonder_hearth'})));
}
{ const s=fresh(); const c=G.capital(s,'p'); c.starving=true; c.res.grain=0; refresh(s);
  const i=adv(s,/^steward:starving:/);
  ok('steward: starving city flagged urgently', i && i.priority>=90 && /starving/.test(i.text));
  ok('starving action: build a farm, else buy grain or open the city', i && ((i.action.kind==='build' && i.action.b==='farm') || i.action.kind==='tab' || (i.action.kind==='city' && i.action.b==='farm')), JSON.stringify(i&&i.action));
  c.res.grain=400; c.res.timber=2000; c.res.stone=2000; refresh(s); const j=adv(s,/^steward:starving:/);
  ok('starving with goods in hand → one-click farm', j && j.action.kind==='build' && j.action.b==='farm', JSON.stringify(j&&j.action));
  ok('urgent count includes it', G.councilUrgent(s)>=1);
}
{ const s=fresh(); const c=G.capital(s,'p'); const cap=G.storageCap(s,c); c.res.timber=cap; refresh(s);
  const i=adv(s,/^steward:full:/); ok('steward: full storage → warehouse', i && i.action && i.action.b==='warehouse', i&&i.text); }
{ const s=fresh(); const c=G.capital(s,'p'); s.time=2*7200*G.pace(s).time+60; c.res.grain=50;
  const u=DATA.races.hearth.units[0]; c.units[u]=0; let e=G.econ(s,c); while(e.net.grain>0.3 && c.units[u]<400){ c.units[u]++; e=G.econ(s,c); }
  refresh(s); const i=adv(s,/^steward:winter:/); ok('steward: stock grain before winter (autumn)', !!i && /Winter is coming/.test(i.text), 'net '+e.net.grain.toFixed(2)); }
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.smelter=1; c.buildings.mine=2; c.buildings.townhall=3; c.res.ore=0; c.refineEff={smelter:0.1}; refresh(s);
  ok('steward: idle workshop flagged', !!adv(s,/^steward:refine:/)); }

// ---- Marshal ----
{ const s=fresh(); const c=G.capital(s,'p'); const foe=hostileNeighbour(s,c,7);
  const u=DATA.races[s.empires.a1.race].units[0]; foe.units[u]=30;
  let err=G.sendArmy(s,foe.id,c.x,c.y,'attack',{[u]:20});
  if(err){ s.moves.push({id:'m9999',owner:'a1',type:'attack',from:foe.id,fx:foe.x,fy:foe.y,x:c.x,y:c.y,units:{[u]:20},depart:s.time,arrive:s.time+600}); }
  refresh(s); const i=adv(s,/^marshal:incoming:/);
  ok('marshal: incoming army with ETA', i && i.priority>=90 && /\\{eta\\}/.test(i.text) && i.at>s.time, (err||'')+' '+(i&&i.text));
  ok('incoming army is the top item', G.councilAdvice(s)[0].advisor==='marshal');
  ok('marshal action opens Military', i && i.action.kind==='tab' && i.action.t==='military');
}
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.townhall=6; c.buildings.wall=0; rich(s,c); hostileNeighbour(s,c,6); refresh(s);
  const i=adv(s,/^marshal:wall:/); ok('marshal: weak wall in a border city', i && i.action.kind==='build' && i.action.b==='wall' && i.priority>=60, i&&i.text); }
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.barracks=5; c.buildings.townhall=6; c.buildings.stable=3; rich(s,c); const foe=hostileNeighbour(s,c,7);
  const cav=DATA.races[s.empires.a1.race].units.find(u=>DATA.units[u].type==='cav');
  s.intel[G.tileIdx(s,foe)]={t:s.time,units:{[cav]:40}}; refresh(s);
  const i=adv(s,/^marshal:counter:/); const best=i&&DATA.races.hearth.units.find(u=>i.text.includes(DATA.units[u].name));
  ok('marshal: counter to known enemy cavalry', i && /cavalry/.test(i.text), i&&i.text);
  ok('counter favours defence vs cavalry', best && DATA.units[best].defC>=DATA.units[best].defI, best); }

// ---- Spymaster ----
{ const s=fresh(); const c=G.capital(s,'p'); hostileNeighbour(s,c,7); refresh(s);
  const i=adv(s,/^spymaster:intel:/); ok('spymaster: no intel on a hostile neighbour', !!i && i.priority>=55, i&&i.text);
  const foe=Object.values(s.cities).find(x=>x.name==='Foeburg'); s.intel[G.tileIdx(s,foe)]={t:s.time,units:{}}; refresh(s);
  ok('fresh intel silences it', !adv(s,/^spymaster:intel:a1/)); }
if(G.minorsList){ const s=fresh(); const mi=G.minorsList(s)[0];
  ok('there are free cities', !!mi);
  const t=near(s,mi,3,5); const c=G.foundCity(s,'p',t.x,t.y,'Nearby'); s.explored[mi.y*s.map+mi.x]=1;
  mi.req={type:'deliver',good:'timber',amount:120,id:'rqT',since:s.time,expires:s.time+99999,reward:15,gold:40}; mi.inf={p:10}; refresh(s);
  const i=adv(s,/^spymaster:req:/); ok('spymaster: free-city request nearby', i && i.text.includes(mi.name), i&&i.text);
  mi.req=null; mi.patron='p'; mi.inf={p:40,a1:34}; refresh(s);
  ok('spymaster: patronage slipping', !!adv(s,/^spymaster:patron:/));
  mi.inf={p:80,a1:10}; refresh(s); ok('secure patronage is quiet', !adv(s,/^spymaster:patron:/)); }

// ---- High Priest ----
{ const s=fresh(); const c=G.capital(s,'p'); s.empires.p.gold=5000; c.happy=10; refresh(s);
  const i=adv(s,/^priest:unrest:/); ok('priest: unrest flagged with a placate deed', i && i.priority>=80 && i.action.kind==='placate', i&&JSON.stringify(i.action));
  const g0=s.empires.p.gold; ok('placate deed works', G.councilDo(s,i.action)===null && s.empires.p.gold<g0 && c.placated>s.time);
  c.happy=30; c.placated=0; refresh(s); ok('priest: discontent flagged', !!adv(s,/^priest:discontent:/)); }
if(G.foundStatus){ const s=fresh(); const c=G.capital(s,'p'); c.buildings.temple=1; c.buildings.townhall=4; s.empires.p.faith=1000; refresh(s);
  ok('priest: a faith can be founded', !!adv(s,/^priest:found-faith/)); }

// ---- Archmage ----
if(G.magicState){
  { const s=fresh(); const c=G.capital(s,'p'); G.magicState(s).strain[c.id]=80; refresh(s);
    const i=adv(s,/^archmage:strain:/); ok('archmage: weave strain', i && i.priority>=70, i&&i.text); }
  { const s=fresh(); const c=G.capital(s,'p'); const t=near(s,c,2,4); const id=G.newId(s,'k'); s.camps[id]={id,x:t.x,y:t.y,tier:5,units:{demon:10},loot:{},kind:'rift',near:c.id,next:s.time+9999}; t.camp=id; s.explored[t.y*s.map+t.x]=1; refresh(s);
    const i=adv(s,/^archmage:rift:/); ok('archmage: rift nearby → map jump', i && i.action.kind==='tile' && i.action.x===t.x); }
  { const s=fresh(); const c=G.capital(s,'p'); c.buildings.magetower=1; c.buildings.academy=1; c.buildings.townhall=4; c.res.mana=1000; c.starving=true; c.res.grain=0; refresh(s);
    const i=adv(s,/^archmage:spell:/); ok('archmage: useful spell ready, one-click cast', i && i.action.kind==='cast', i&&i.text);
    if(i){ const m0=G.manaOf(s,'p'); ok('cast deed works', G.councilDo(s,i.action)===null && G.manaOf(s,'p')<m0); refresh(s); ok('spell on cooldown is no longer offered', !adv(s,new RegExp('^archmage:spell:'+i.action.spell))); } }
}

// ---- sorting, caps, snooze and dismiss ----
{ const s=fresh(); const c=G.capital(s,'p'); c.starving=true; c.res.grain=0; c.happy=10; if(G.magicState) G.magicState(s).strain[c.id]=80; refresh(s);
  const L=G.councilAdvice(s);
  ok('advice sorted by priority', L.every((x,i)=>i===0||L[i-1].priority>=x.priority), L.map(x=>x.priority).join(','));
  ok('at most 5 per advisor', DATA.councilOrder.every(k=>L.filter(x=>x.advisor===k).length<=G.COUNCIL.perAdvisor));
  ok('every item has id, advisor, priority, text', L.every(x=>x.id&&x.advisor&&typeof x.priority==='number'&&x.text));
  const id=adv(s,/^steward:starving:/).id;
  G.councilDismiss(s,id); ok('dismissed item hidden', !G.councilAdvice(s).some(x=>x.id===id));
  refresh(s); ok('stays dismissed while the situation lasts', !G.councilAdvice(s).some(x=>x.id===id) && G.councilHiddenCount(s)>=1);
  c.starving=false; c.res.grain=2000; refresh(s); G.councilAdvice(s);
  ok('dismissal forgotten once it clears', s.council.snooze[id]===undefined);
  c.starving=true; c.res.grain=0; refresh(s); ok('…and returns if it recurs', G.councilAdvice(s).some(x=>x.id===id));
  const sid=adv(s,/^priest:unrest:/).id; G.councilSnooze(s,sid);
  ok('snoozed item hidden', !G.councilAdvice(s).some(x=>x.id===sid));
  s.time+=G.COUNCIL.snoozeMins*60*G.pace(s).time+1; c.happy=10; refresh(s);
  ok('snooze expires', G.councilAdvice(s).some(x=>x.id===sid));
  G.councilDismiss(s,sid); G.councilRestore(s); ok('restore all', G.councilAdvice(s).some(x=>x.id===sid));
  const t0=Date.now(); for(let i=0;i<200;i++){ refresh(s); G.councilAdvice(s); } const ms=(Date.now()-t0)/200;
  ok('advice is cheap to build', ms<15, ms.toFixed(2)+'ms');
  const a=G.councilRaw(s); ok('advice cached between refreshes', G.councilRaw(s)===a);
}

// ---- governors ----
const govCity=(race='hearth')=>{ const s=fresh(race); const c=G.capital(s,'p');
  Object.assign(c.buildings,{townhall:7,houses:6,farm:5,lumber:5,quarry:5,mine:4,academy:1,barracks:1,warehouse:14});
  c.pop=G.econ(s,c).civCap*0.6; rich(s,c,8000); return {s,c}; };
const firstPicks=(focus,n=4)=>{ const {s,c}=govCity(); G.setGovernor(s,c.id,{focus}); const out=[];
  for(let i=0;i<n;i++){ slow(s); for(const q of c.buildQueue){ out.push(q.type); c.buildings[q.type]=q.level; } c.buildQueue.length=0; }
  return out; };
const FOCUS_SETS={ growth:['farm','houses','harbor','bakery','townhall','tavern'], production:['lumber','quarry','mine','smelter','smithy','bakery'], military:['barracks','armory','wall','stable'], faith:['temple','shrine','theatre','tavern'], magic:['magetower','academy'] };
for(const [f,set] of Object.entries(FOCUS_SETS)){ const p=firstPicks(f); ok('governor focus '+f+' builds to its focus', p.slice(0,3).some(t=>set.includes(t)), p.join(',')); }
{ const p=firstPicks('balanced'); ok('balanced governor builds', p.length>=4, p.join(',')); }
{ const {s,c}=govCity(); c.buildQueue.length=0; G.setGovernor(s,c.id,{focus:'balanced',reserve:19000}); s.empires.p.gold=19100;
  for(let i=0;i<6;i++){ slow(s); }
  ok('governor never spends below the gold reserve', s.empires.p.gold>=19000-1e-6, s.empires.p.gold.toFixed(0)+' '+c.buildQueue.map(q=>q.type).join(','));
  ok('…though it may build what costs no gold', c.buildQueue.every(q=>!(q.cost.gold>0)));
  const g=s.council.gov[c.id]; ok('governor logs what it did', g.log.length>0 && /Queued/.test(g.log[0].text), JSON.stringify(g.log[0])); }
{ const {s,c}=govCity(); c.units.militia=600; c.res.grain=600; G.setGovernor(s,c.id,{focus:'magic'}); slow(s);
  ok('famine looming: governor builds only food', c.buildQueue.length>0 && c.buildQueue.every(q=>['farm','harbor','bakery'].includes(q.type)), c.buildQueue.map(q=>q.type).join(',')); }
{ const {s,c}=govCity(); c.res.grain=120; G.setGovernor(s,c.id,{focus:'faith'}); slow(s);
  const e=G.econ(s,c); ok('governor keeps a grain floor', c.res.grain>=Math.min(e.cap*0.25,Math.max(80,(e.popFood+e.upkeep)*10))-1 || c.buildQueue.every(q=>['farm','harbor','bakery'].includes(q.type)), c.res.grain.toFixed(0)); }
{ const s=fresh(); const c=G.capital(s,'p'); Object.assign(c.buildings,{townhall:10,warehouse:0}); for(const g of DATA.goodOrder) c.res[g]=780; s.empires.p.gold=50000;
  const p=G.councilPick(s,c,'balanced'); ok('storage: costs that outgrow the warehouse → warehouse first', p.t==='warehouse', JSON.stringify(p)); }
{ const {s,c}=govCity(); Object.assign(c.buildings,{townhall:12,academy:5,warehouse:14});
  for(let i=0;i<2;i++){ const t=near(s,c,4,7); G.foundCity(s,'p',t.x,t.y,'X'+i); }
  for(const t of DATA.buildingOrder){ const b=DATA.buildings[t]; if(b.wonder) continue; if(!b.race||b.race==='hearth') c.buildings[t]=b.max; }
  rich(s,c,1e6); c.buildings.warehouse=20; for(const g of DATA.goodOrder) c.res[g]=1e6; s.empires.p.gold=1e7;
  ok('wonder would be buildable by hand', G.buildStatus(s,c,'wonder_hearth').ok, G.buildStatus(s,c,'wonder_hearth').reason);
  G.setGovernor(s,c.id,{focus:'balanced'}); for(let i=0;i<5;i++) slow(s);
  ok('governor never queues a wonder', !c.buildQueue.some(q=>DATA.buildings[q.type].wonder), c.buildQueue.map(q=>q.type).join(','));
  ok('advice never suggests a wonder', !G.councilAdvice(s).some(i=>i.action&&i.action.kind==='build'&&DATA.buildings[i.action.b].wonder)); }
{ const {s,c}=govCity(); c.buildings.barracks=5; G.setGovernor(s,c.id,{focus:'military',troops:12}); const n0=Object.values(c.train).flat().length;
  slow(s); const q=Object.values(c.train).flat();
  ok('military governor trains defenders toward its target', q.length>n0 && q.every(x=>DATA.races.hearth.units.includes(x.unit)), JSON.stringify(q));
  const tot=q.reduce((a,x)=>a+x.left,0); ok('…without overshooting', tot<=12, ''+tot);
  G.setGovernor(s,c.id,{troops:0}); c.train={}; slow(s); ok('target 0 trains nothing', !Object.values(c.train).flat().length); }
{ const {s,c}=govCity(); G.setGovernor(s,c.id,{focus:'off'}); slow(s); ok('governor off leaves the queue alone', c.buildQueue.length===0);
  ok('idle-builder advice when no governor', !!adv(s,/^steward:idle:/));
  G.setGovernor(s,c.id,{focus:'growth'}); refresh(s); ok('no idle-builder advice for a governed city', !adv(s,new RegExp('^steward:idle:'+c.id)));
  ok('setGovernor rejects foreign cities', !!G.setGovernor(s,G.capital(s,'a1').id,{focus:'growth'}));
  ok('setGovernor rejects a bad focus', !!G.setGovernor(s,c.id,{focus:'piracy'})); }

// ---- realm-minded governors ----
// two cities with supply lines on: a big granary capital with a Market, and a hungry sister
const realmPair=()=>{ const s=fresh(); const A=G.capital(s,'p'); G.logistics(s,'p');
  Object.assign(A.buildings,{townhall:7,houses:6,farm:10,lumber:5,quarry:5,mine:4,academy:1,barracks:1,warehouse:14,market:3});
  const t=near(s,A,4,6); const B=G.foundCity(s,'p',t.x,t.y,'Brookby');
  Object.assign(B.buildings,{townhall:5,houses:6,farm:1,lumber:3,quarry:3,warehouse:10});
  B.pop=G.econ(s,B).civCap*0.9; A.pop=G.econ(s,A).civCap*0.5;
  for(const g of DATA.goodOrder){ A.res[g]=G.storageCap(s,A)*0.9; B.res[g]=G.storageCap(s,B)*0.6; } s.empires.p.gold=20000;
  const u=DATA.races.hearth.units[0]; B.units[u]=0; while(G.econ(s,B).net.grain>-8 && B.units[u]<2000) B.units[u]+=5;
  return {s,A,B}; };
{ const {s,A,B}=realmPair(); const e=G.econ(s,B);
  ok('realm setup: sister has a grain deficit, capital overflows', e.net.grain<0 && G.econ(s,A).net.grain>0 && !!G.supplyReach(s,'p',A,B), e.net.grain.toFixed(1));
  const R=G.realmEcon(s,'p',{fresh:true});
  ok('realm snapshot: per-good stock, net, cap, surplus and deficit cities', R.n===2 && R.lines && R.goods.grain.surplus.some(x=>x.c===A) && R.goods.grain.deficit.some(x=>x.c===B) && R.goods.grain.cap>0 && R.econ[B.id]);
  const cv=G.realmCover(s,R,B,'grain'); ok('realm cover: the deficit is made good from the capital', cv && cv.frac>=0.8 && cv.from===A, JSON.stringify(cv&&{frac:cv.frac,from:cv.from&&cv.from.name}));
  const local=G.councilPick(s,B,'balanced'), realm=G.councilPick(s,B,'balanced',{realm:true});
  ok('local reckoning: a grain deficit means a farm first', local.t==='farm' && /grain is short/.test(local.why), JSON.stringify(local));
  ok('realm reckoning: a deficit covered by a supply line from a surplus sister does not put the farm first', realm.t && realm.t!=='farm', JSON.stringify(realm));
  const fc=G.councilCandidates(s,B,'balanced',true).find(c=>c.t==='farm');
  ok('…and the farm says where the grain comes from', fc && /grain comes by caravan from /.test(fc.why) && fc.why.includes(A.name), fc&&fc.why);
  ok('Council notes name the caravan source', G.govRealmNotes(s,B).some(n=>/grain comes by caravan from/.test(n)), JSON.stringify(G.govRealmNotes(s,B)));
  // the governor itself, on and off
  G.setGovernor(s,B.id,{focus:'balanced'}); ok('new governors think for the realm by default', s.council.gov[B.id].realm===true);
  G.councilDirty(s); slow(s); const q1=B.buildQueue.map(q=>q.type);
  ok('realm governor does not queue a farm first for a covered deficit', q1.length>0 && q1[0]!=='farm', q1.join(','));
  B.buildQueue.length=0; G.setGovernor(s,B.id,{realm:false}); G.councilDirty(s); slow(s); const q0=B.buildQueue.map(q=>q.type);
  ok('"Think for the realm" OFF restores the local reckoning (farm first)', s.council.gov[B.id].realm===false && q0[0]==='farm', q0.join(','));
  // supply lines off: the realm cannot ship, so the governor stands alone again
  G.setSupplyRealm(s,'p',{on:false}); G.councilDirty(s); const off=G.councilPick(s,B,'balanced',{realm:true});
  ok('with supply lines off the realm view falls back to local (farm first)', off.t==='farm', JSON.stringify(off));
  // old save: a governor without the field thinks for the realm
  G.setSupplyRealm(s,'p',{on:true}); B.buildQueue.length=0; G.setGovernor(s,B.id,{realm:true}); delete s.council.gov[B.id].realm;
  const s2=G.deserialize(G.serialize(s)); const B2=s2.cities[B.id]; let thrown=null;
  try{ G.councilDirty(s2); slow(s2); }catch(err){ thrown=err; }
  ok('old save without the realm field loads; the governor thinks for the realm', !thrown && s2.council.gov[B.id].realm===undefined && B2.buildQueue.length>0 && B2.buildQueue[0].type!=='farm', thrown?thrown.stack:B2.buildQueue.map(q=>q.type).join(','));
}
// ore: the realm lacks iron, one city sits on an ore vein, the other on poor ground
{ const s=fresh(); const A=G.capital(s,'p'); G.logistics(s,'p');
  const t=near(s,A,4,6); const B=G.foundCity(s,'p',t.x,t.y,'Orehold');
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){ const u=G.tileAt(s,B.x+dx,B.y+dy); if(u&&!u.city) u.deposit='ore'; const v=G.tileAt(s,A.x+dx,A.y+dy); if(v&&v.deposit==='ore') v.deposit=null; }
  B.site=null; A.site={...G.siteYield(s,A.x,A.y),x:A.x,y:A.y,ore:0.7};   // the capital sits on poor ore ground
  for(const c of [A,B]){ Object.assign(c.buildings,{townhall:6,houses:6,farm:6,lumber:5,quarry:5,mine:2,academy:1,barracks:1,warehouse:14}); c.pop=G.econ(s,c).civCap*0.6; for(const g of DATA.goodOrder) c.res[g]=4000; c.res.iron=0; }
  s.empires.p.gold=20000;
  const R=G.realmEcon(s,'p',{fresh:true});
  ok('realm snapshot: iron short, ore city has the advantage', R.goods.iron.short>0 && R.adv[B.id].ore>1.1 && R.adv[A.id].ore<1, R.goods.iron.short+' '+R.adv[B.id].ore.toFixed(2));
  const wOf=(c,t,r)=>(G.councilCandidates(s,c,'balanced',r).find(x=>x.t===t)||{w:-1e9}).w;
  const top=G.councilCandidates(s,B,'balanced',true).slice(0,2);
  ok('ore-deposit city gets mine/smelter priority when the realm lacks iron', top.some(x=>x.t==='mine'||x.t==='smelter') && wOf(B,'mine',true)>wOf(B,'mine',null)+5, JSON.stringify(top));
  ok('…and says why', top.some(x=>/realm is short of iron and Orehold sits on ore/.test(x.why)), JSON.stringify(top));
  ok('the poor-ore city leans away from mining', wOf(A,'mine',true)<wOf(A,'mine',null), wOf(A,'mine',true)+' vs '+wOf(A,'mine',null));
}
// market: no buying what a sister has to spare with a supply line running
{ const {s,A,B}=realmPair(); B.buildings.market=1; B.buildings.townhall=5; B.short={iron:true}; B.wear={iron:99}; B.res.iron=0; A.res.iron=G.storageCap(s,A)*0.9;
  B.buildQueue.push({type:'houses',level:99,end:s.time+1e6,start:s.time,cost:{}},{type:'houses',level:99,end:s.time+1e6,start:s.time,cost:{}});
  G.setGovernor(s,B.id,{focus:'balanced'}); G.councilDirty(s); slow(s);
  const g=s.council.gov[B.id];
  ok('realm governor does not buy iron a sister has in surplus with a supply line', !g.log.some(l=>/Bought .*iron/.test(l.text)) && g.log.some(l=>/Waiting for iron by caravan from /.test(l.text)), JSON.stringify(g.log.map(l=>l.text)));
  G.setGovernor(s,B.id,{realm:false}); B.short={iron:true}; B.wear={iron:99}; B.res.iron=0; G.councilDirty(s); slow(s);
  ok('…the local governor buys it', g.log.some(l=>/Bought .*iron/.test(l.text)), JSON.stringify(g.log.map(l=>l.text)));
}
// perf: one snapshot per slow tick, cheap
{ const {s,B}=realmPair(); G.setGovernor(s,B.id,{focus:'balanced'}); const t0=Date.now(); for(let i=0;i<100;i++) G.realmEcon(s,'p',{fresh:true}); const ms=(Date.now()-t0)/100;
  ok('realm snapshot is cheap', ms<5, ms.toFixed(2)+'ms'); }

// ---- the Steward reads the realm too ----
{ const s=fresh(); const A=G.capital(s,'p'); G.logistics(s,'p');
  const t=near(s,A,4,6); const B=G.foundCity(s,'p',t.x,t.y,'Orehold');
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){ const u=G.tileAt(s,B.x+dx,B.y+dy); if(u&&!u.city) u.deposit='ore'; const v=G.tileAt(s,A.x+dx,A.y+dy); if(v&&v.deposit==='ore') v.deposit=null; }
  B.site=null; A.site={...G.siteYield(s,A.x,A.y),x:A.x,y:A.y,ore:0.7};
  for(const c of [A,B]){ Object.assign(c.buildings,{townhall:6,houses:6,farm:6,lumber:5,quarry:5,mine:2,academy:1,barracks:1,warehouse:14}); c.pop=G.econ(s,c).civCap*0.6; for(const g of DATA.goodOrder) c.res[g]=4000; c.res.iron=0; }
  s.empires.p.gold=20000; s.time=6*3600*G.pace(s).time; refresh(s);
  const i=adv(s,new RegExp('^steward:idle:'+B.id+'$'));
  ok('steward: an ungoverned city gets realm-aware advice with the realm reason', i && /🌐 for the realm: the realm is short of iron and Orehold sits on ore/.test(i.text) && ['mine','smelter'].includes(i.action.b), i&&i.text);
  const p=G.councilPick(s,B,'balanced',{realm:true}); ok('councilPick marks a realm reason', p.realm===true && /realm is short of iron/.test(p.why), JSON.stringify(p));
  G.setSupplyRealm(s,'p',{on:false}); refresh(s); const j=adv(s,new RegExp('^steward:idle:'+B.id+'$'));
  ok('…with supply lines off the Steward reasons locally (no 🌐)', j && !/🌐/.test(j.text), j&&j.text);
}
// ---- the people's own producers join the specialisation map ----
{ const BG=G.COUNCIL_B_GOOD;
  const want={bakery:'bread',runeforge:'runesteel',heartgrove:'heartwood',dreamspire:'dreamsilk',ossuary:'bonedust',aerie:'stormglass',pearlbeds:'pearls'};
  ok('specialisation map covers every race-unique producer', Object.entries(want).every(([b,g])=>BG[b]===g) && Object.keys(DATA.buildings).filter(b=>DATA.buildings[b].race&&!DATA.buildings[b].wonder&&(DATA.buildings[b].prod||DATA.buildings[b].recipe)).every(b=>BG[b]), JSON.stringify(BG));
  // a Delver realm short of runesteel: the city on the ore vein raises the Runeforge for the realm
  const s=fresh('delver'); const A=G.capital(s,'p'); G.logistics(s,'p');
  const t=near(s,A,4,6); const B=G.foundCity(s,'p',t.x,t.y,'Deepvein');
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){ const u=G.tileAt(s,B.x+dx,B.y+dy); if(u&&!u.city) u.deposit='ore'; const v=G.tileAt(s,A.x+dx,A.y+dy); if(v&&v.deposit==='ore') v.deposit=null; }
  B.site=null; A.site={...G.siteYield(s,A.x,A.y),x:A.x,y:A.y,ore:0.7};
  for(const c of [A,B]){ Object.assign(c.buildings,{townhall:6,houses:6,farm:6,lumber:5,quarry:5,mine:4,smelter:3,academy:1,barracks:1,warehouse:14}); c.pop=G.econ(s,c).civCap*0.6; for(const g of DATA.goodOrder) c.res[g]=4000; c.res.runesteel=0; }
  s.empires.p.gold=20000;
  const R=G.realmEcon(s,'p',{fresh:true});
  ok('realm snapshot reckons with the people\\'s own good (runesteel)', R.list.includes('runesteel') && R.goods.runesteel && R.goods.runesteel.short>0 && !R.list.includes('bread'), R.list.join(','));
  const wOf=(c,t,r)=>(G.councilCandidates(s,c,'balanced',r).find(x=>x.t===t)||{w:-1e9,why:''});
  const rf=wOf(B,'runeforge',true), rl=wOf(B,'runeforge',null);
  ok('the ore-vein city leans into the Runeforge for the realm, and says why', rf.w>rl.w+5 && /runesteel/.test(rf.why) && rf.realm, JSON.stringify(rf)+' vs '+rl.w);
  ok('the poor-ore city leans away from it', wOf(A,'runeforge',true).w<wOf(A,'runeforge',null).w);
}
// ---- the city header carries the realm toggle too (ui-council.js with a stub page) ----
{ const s=fresh(); const A=G.capital(s,'p'); const t=near(s,A,4,6); const B=G.foundCity(s,'p',t.x,t.y,'Brookby');
  const el=()=>({style:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},setAttribute(){}});
  const doc={createElement:el,head:{appendChild(){}},addEventListener(){},getElementById(){return null}};
  const env={document:doc,TABS:{city:{}},TOP_EXTRAS:[],CITY_EXTRAS:[],MOUNT_HOOKS:[],act:{},UI:{form:{}},S:s,esc:x=>String(x),fmtTime:x=>String(x),realSecs:x=>x,ptHtml:()=> '',ago:()=> 'now',toast(){},render(){}};
  const src=fs.readFileSync('js/ui-council.js','utf8');
  new Function(...Object.keys(env),'G','DATA',src)(...Object.values(env),G,DATA);
  const head=c=>env.CITY_EXTRAS.map(f=>f(c)).join('');
  ok('header: no realm toggle without a governor', !/gov_realm_/.test(head(B)));
  G.setGovernor(s,B.id,{focus:'balanced'});
  ok('header: the governor row shows "think for the realm", checked by default', new RegExp('data-k="gov_realm_'+B.id+'" checked').test(head(B)) && /think for the realm/.test(head(B)));
  G.setGovernor(s,B.id,{realm:false});
  ok('header: the toggle follows the governor\\'s setting (off = unchecked)', new RegExp('data-k="gov_realm_'+B.id+'" >').test(head(B)));
  for(const c of G.citiesOf(s,'p')) if(c!==A&&c!==B) c.owner='a1'; B.owner='a1';
  G.setGovernor(s,A.id,{focus:'balanced'});
  ok('header: a lone city has no realm toggle', !/gov_realm_/.test(head(A)));
}

// ---- persistence ----
{ const s=fresh(); const c=G.capital(s,'p'); G.setGovernor(s,c.id,{focus:'production',reserve:300,troops:5}); slow(s);
  c.starving=true; refresh(s); const id=adv(s,/^steward:starving:/).id; G.councilSnooze(s,id);
  const s2=G.deserialize(G.serialize(s)); const g=s2.council.gov[c.id];
  ok('save/load keeps governors', g && g.on && g.focus==='production' && g.reserve===300 && g.troops===5 && g.log.length===s.council.gov[c.id].log.length);
  ok('save/load keeps snoozes', s2.council.snooze[id]>s2.time);
  ok('advice cache is not saved', !/"list"/.test(JSON.stringify(s2.council)));
  delete s.council; const s3=G.deserialize(G.serialize(s)); let thrown=null;
  try{ G.councilAdvice(s3); slow(s3); G.setGovernor(s3,G.capital(s3,'p').id,{focus:'growth'}); slow(s3); }catch(e){ thrown=e; }
  ok('old save without council state loads and works', !thrown && s3.council && s3.council.gov, thrown&&thrown.stack); }

// ---- all peoples ----
for(const r of DATA.raceOrder){ const s=fresh(r); const c=G.capital(s,'p'); let err=null;
  try{ G.councilAdvice(s); G.setGovernor(s,c.id,{focus:'balanced'}); G.advance(s,1200,240); c.starving=true; refresh(s); G.councilAdvice(s); }catch(e){ err=e; }
  const names=new Set(DATA.councilOrder.map(k=>G.councilor(s,k).name));
  ok('people '+r+': council and governor run', !err && names.size===5 && s.council.gov[c.id].log.length>0 && adv(s,/^steward:starving:/), err?err.stack:Object.keys(c.buildings).length+' buildings'); }

// ---- sim: a Balanced governor vs the AI for 3 game-hours ----
{ const s=G.newGame({name:'Sim',race:'hearth'}); const c=G.capital(s,'p'); G.setGovernor(s,c.id,{focus:'balanced'});
  const hours=3; const t0=Date.now();
  for(let m=0;m<hours*60*G.pace(s).time;m++) G.advance(s,60,30);
  const lv=x=>Object.values(x.buildings).reduce((a,b)=>a+b,0);
  const ais=Object.keys(s.empires).filter(k=>k!=='p'&&!s.empires[k].dead);
  const aiCaps=ais.map(k=>G.capital(s,k)).filter(Boolean);
  const aiLv=aiCaps.reduce((a,x)=>a+lv(x),0)/Math.max(1,aiCaps.length), aiPop=aiCaps.reduce((a,x)=>a+x.pop,0)/Math.max(1,aiCaps.length);
  const aiRen=ais.reduce((a,k)=>a+G.renown(s,k),0)/Math.max(1,ais.length);
  console.log('  sim '+hours+'h: player renown '+G.renown(s,'p')+' (1 city, no raids) vs AI mean '+aiRen.toFixed(0)+' ('+ais.map(k=>s.empires[k].race+' '+G.renown(s,k)+'/'+G.citiesOf(s,k).length+'c').join(', ')+')');
  console.log('  capital: player '+lv(c)+' building levels, pop '+Math.round(c.pop)+' · AI capitals '+aiLv.toFixed(0)+' levels, pop '+Math.round(aiPop)+' · '+((Date.now()-t0)/1000).toFixed(1)+'s');
  ok('Balanced governor grows the capital comparably to the AI', lv(c)>=aiLv*0.85 && c.pop>=aiPop*0.75, lv(c)+' vs '+aiLv.toFixed(0));
  ok('…and its renown keeps pace with an AI capital (the AI also settles and raids)', G.renown(s,'p')>=aiLv*0.85, G.renown(s,'p')+' vs '+aiLv.toFixed(0));
}

console.log(fails?fails+' FAILED':'ALL PASS');
`);
