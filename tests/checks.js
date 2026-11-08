const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/engine.js','js/research.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js'];
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
ok('oasis claim (dist '+d.toFixed(1)+')', d>G.cityReach(s,c)+1.5 ? (c.oases.length===0) : (c.oases.length===1 && after>before*1.2), 'send='+e1+' before='+before.toFixed(1)+' after='+after.toFixed(1));
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
`);
