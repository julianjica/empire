const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
const ok=(name,cond,extra)=>console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:''));
let s=G.newGame({name:'T',race:'hearth'}); s.settings.hostility=0;
const c=G.capital(s,'p');
// scout
const ai=Object.values(s.cities).find(x=>x.owner!=='p');
c.units.scout=3;
ok('scout send', G.sendArmy(s,c.id,ai.x,ai.y,'scout',{scout:3})===null);
G.advance(s,1500,300);
ok('scout intel', Object.keys(s.intel).length===1, JSON.stringify(Object.values(s.intel)[0].units));
ok('scout report', s.reports.some(r=>r.body.scout));
ok('scouts home', (c.units.scout||0)===3);
// oasis
const oasis=s.special.filter(t=>t.oasis&&!t.oasis.owner).sort((a,b)=>G.dist(a,c)-G.dist(b,c))[0];
const d=G.dist(oasis,c);
const before=G.mod(s,'p',c,oasis.oasis.bonus);
c.units.militia=400; c.res.grain=50000;
const e1=G.sendArmy(s,c.id,oasis.x,oasis.y,'attack',{militia:300});
G.advance(s,2000,300);
const after=G.mod(s,'p',c,oasis.oasis.bonus);
ok('oasis claim (dist '+d.toFixed(1)+')', d>G.cityReach(s,c)+1.5 ? (c.oases.length===0) : (c.oases.length===1 && after>before*1.1), 'send='+e1+' before='+before.toFixed(1)+' after='+after.toFixed(1));
// caravan + reinforce
const t=G.freeTile(s,x=>G.dist(x,c)>3&&G.dist(x,c)<6);
const b=G.foundCity(s,'p',t.x,t.y,'B');
c.buildings.market=1; c.res.grain=Math.max(c.res.grain,500);
const gb=b.res.grain;
ok('caravan send', G.sendArmy(s,c.id,b.x,b.y,'trade',{},{grain:100})===null);
ok('reinforce send', G.sendArmy(s,c.id,b.x,b.y,'reinforce',{militia:5})===null);
G.advance(s,600,100);
ok('caravan arrived', b.res.grain>gb+90, (b.res.grain-gb).toFixed(0));
ok('reinforced', (b.units.militia||0)===5, JSON.stringify(b.units)+' starving='+b.starving+' '+s.reports.slice(0,3).map(r=>r.title).join(';'));
// hero away when home falls -> reroutes to capital
const ruin=s.special.filter(t=>t.ruin).sort((a,x)=>G.dist(a,b)-G.dist(x,b))[0];
delete c.units.hero; b.units.hero=1;
G.sendArmy(s,b.id,ruin.x,ruin.y,'adventure',{hero:1});
b.owner='a1';
G.advance(s,3000,300);
ok('hero rerouted after home lost', !!G.heroCity(s) || G.hero(s).dead || !!G.heroMoving(s), 'heroCity='+(G.heroCity(s)||{}).name+' dead='+G.hero(s).dead);
// endless rebirth
s=G.newGame({name:'T',race:'hearth',mode:'endless'});
const e=s.empires.a2;
for(const cc of G.citiesOf(s,'a2')){ G.tileAt(s,cc.x,cc.y).city=null; delete s.cities[cc.id]; }
e.dead=true; e.diedAt=0;
G.advance(s,5400,600);
ok('endless rebirth', !e.dead && G.citiesOf(s,'a2').length>=1, e.name);
// offline catch-up runs at 1x
s.settings.speed=25; s.realLast=Date.now()-600e3; const t0=s.time; G.catchUp(s);
ok('catchUp ignores speed', Math.abs(s.time-t0-600)<5, (s.time-t0).toFixed(0));
{ const s=G.newGame({name:'T',race:'hearth'}); const c=G.capital(s,'p');
  const ai=Object.values(s.cities).find(x=>x.owner!=='p'); const at=G.tileAt(s,ai.x,ai.y);
  const p1=G.previewBattle(s,c,at,{militia:20},'raid');
  s.intel[G.tileIdx(s,at)]={t:s.time,units:{...ai.units},wall:0,th:1};
  const p2=G.previewBattle(s,c,at,{militia:20},'raid');
  const camp=Object.values(s.camps)[0]; const p3=G.previewBattle(s,c,G.tileAt(s,camp.x,camp.y),{militia:20},'raid');
  console.log((p1.known===false && p2.known && p3.known && p3.estimated)?'PASS preview (unscouted city unknown, scouted known, camp estimated)':'FAIL preview', JSON.stringify({p1:p1.known,p2win:p2.win,p3:p3.estimated}));
}
{ const s=G.newGame({name:'T',race:'hearth'}); const c=G.capital(s,'p'); c.buildings.barracks=1; c.res.weapons=100; c.res.grain=5000; s.empires.p.gold=5000;
  const p0=c.pop; const e=G.queueTrain(s,c.id,'militia',4);
  ok('training enrols citizens', !e && Math.abs(c.pop-(p0-4))<0.01, 'pop '+p0.toFixed(1)+' -> '+c.pop.toFixed(1));
  const tooMany=G.queueTrain(s,c.id,'militia',500); ok('cannot enrol more than the population', !!tooMany, tooMany);
  c.units.militia=60; const ec=G.econ(s,c); ok('soldiers beyond quarters reduce civilian housing', ec.civCap < ec.popCap, 'popCap '+ec.popCap+' civCap '+ec.civCap+' quarters '+ec.quarters);
  const pb=c.pop; G.dismiss(s,c.id,'militia',10); ok('dismiss returns people', c.pop===pb+10 && c.units.militia===50);
  c.pop=20; const r1=G.cityReach(s,c); c.pop=400; const r2=G.cityReach(s,c); ok('reach grows with population', r2>r1, r1.toFixed(2)+' -> '+r2.toFixed(2));
}

{ // siege: rams negate walls, survivors damage walls, catapults wreck buildings
  const s=G.newGame({name:'T',race:'hearth'}); s.settings.hostility=0; const c=G.capital(s,'p');
  const ai=Object.values(s.cities).find(x=>x.owner!=='p'); ai.buildings.wall=10; ai.buildings.townhall=6; ai.buildings.farm=8; ai.units={axeguard:60};
  const noRam=G.previewBattle(s,c,G.tileAt(s,ai.x,ai.y),{knight:50},'attack');
  const cdA=G.cityDefense(s,ai), cdB=G.cityDefense(s,ai,G.wallBreak({ram_h:40}));
  ok('rams reduce wall defence', cdB.mult<cdA.mult, cdA.mult.toFixed(2)+' -> '+cdB.mult.toFixed(2));
  c.units={knight:300,ram_h:40,treb_h:40}; c.res.grain=1e6;
  G.sendArmy(s,c.id,ai.x,ai.y,'attack',{knight:300,ram_h:40,treb_h:40}); G.advance(s,3600,400);
  const rep=s.reports.find(r=>/Assault/.test(r.title));
  ok('siege damages wall and buildings', rep && /Rams broke the wall/.test(rep.body.extra) && /Catapults wrecked/.test(rep.body.extra), rep&&rep.body.extra);
}
{ // forge upgrades raise unit stats for the realm
  const s=G.newGame({name:'T',race:'hearth'}); const c=G.capital(s,'p'); c.buildings.armory=3; Object.assign(c.res,{weapons:500,tools:500,iron:500,stone:2000}); s.empires.p.gold=1e4;
  const a0=G.unitStats(s,'p','militia').atk;
  ok('start upgrade', G.startUpgrade(s,c.id,'militia','a')===null);
  ok('one job per armory', !!G.startUpgrade(s,c.id,'militia','d'));
  G.advance(s,1200,100);
  const a1=G.unitStats(s,'p','militia').atk;
  ok('upgrade applied', a1>a0 && G.upgradeLevel(s,'p','militia','a')===1, a0+' -> '+a1.toFixed(1));
  ok('upgrade capped by armory level', (()=>{ s.empires.p.upgrades.militia.a=3; return !!G.forgeStatus(s,c.id,'militia','a').reason; })());
}
{ // AI defends: nearby cities reinforce a city under attack
  const s=G.newGame({name:'T',race:'hearth'}); const id='a1'; const cap=G.capital(s,id);
  const t=G.freeTile(s,x=>G.dist(x,cap)>=2.5&&G.dist(x,cap)<=3.2); const c2=G.foundCity(s,id,t.x,t.y,'Helper'); c2.units={ironshield:40};
  const pc=G.capital(s,'p'); pc.units={militia:20}; pc.res.grain=1e5;   // slow infantry: help can arrive first
  G.sendArmy(s,pc.id,cap.x,cap.y,'raid',{militia:20});
  G.advance(s,30,3);
  ok('AI reinforces threatened city', s.moves.some(m=>m.owner===id&&m.type==='reinforce'), JSON.stringify(s.moves.filter(m=>m.owner===id).map(m=>m.type)));
}
{ // AI realms make war and peace among themselves
  // deterministic: neighbouring AI realms of similar strength, late game, with dice that always roll low
  const s=G.newGame({name:'T',race:'hearth'}); s.time=12*3600;
  const a=G.capital(s,'a1'); const t=G.freeTile(s,x=>G.dist(x,a)>=4&&G.dist(x,a)<=6); G.foundCity(s,'a2',t.x,t.y,'Border');
  for(const id of ['a1','a2','a3']) s.empires[id].aggr=0.8;
  const rnd=Math.random; Math.random=()=>0.001; try { for(let i=0;i<5;i++) G.slowHooks.forEach(h=>h(s,1)); } finally { Math.random=rnd; }
  const r=G.aiRel(s,'a1','a2');
  ok('neighbouring AI realms go to war', r.status==='war', JSON.stringify(r));
  s.time += 3*3600; const pr=G.power; G.power=(st,id)=>id==='a1'?1000:300;   // a2 is losing badly
  try { G.slowHooks.forEach(h=>h(s,1)); } finally { G.power=pr; }
  ok('a losing AI realm makes peace', G.aiRel(s,'a1','a2').status==='peace', JSON.stringify(G.aiRel(s,'a1','a2')));
}

{ // seasons change harvests and marching, and each people feels them differently
  const s=G.newGame({name:'T',race:'hearth'}); const c=G.capital(s,'p');
  const at=(idx)=>{ s.time=idx*7200*G.pace(s).time+60; return G.mod(s,'p',c,'grain'); };
  const spring=at(0), autumn=at(2), winter=at(3);
  ok('autumn harvest beats winter', autumn>spring && winter<spring, 'spring '+spring.toFixed(2)+' autumn '+autumn.toFixed(2)+' winter '+winter.toFixed(2));
  ok('winter slows marches', (s.time=3*7200+60, G.mod(s,'p',null,'travel'))<1);
  const d=G.newGame({name:'T',race:'delver'}); const dc=G.capital(d,'p'); d.time=3*7200+60; s.time=3*7200+60;
  ok('Deepdelvers barely feel winter', G.mod(d,'p',null,'travel')>G.mod(s,'p',null,'travel'));
  s.time=0; s.lastSeason=0; s.time=3*7200+60; s.pending=[]; G.slowHooks.forEach(h=>h(s,0.2));
  ok('winter brings a decision or a warning', s.log.some(l=>/Winter/.test(l.text)));
}
`);
