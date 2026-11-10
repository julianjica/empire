// Religion: pantheon, founding, faith, spread, priests, miracles, effects, victory.  node tests/religion.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js'].filter(f=>fs.existsSync(f)).filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const fresh=(race='hearth',o={})=>{ const s=G.newGame({name:'T',race,...o}); s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; return s; };
const R=G.RELIGION;
const near=(s,c,lo,hi)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi);
const faithful=(s,owner='p',o={})=>{ const c=G.capital(s,owner); c.buildings.temple=Math.max(1,c.buildings.temple||0); s.empires[owner].faith=1000;
  const err=G.foundFaith(s,owner,{name:o.name||('Faith of '+owner),god:o.god||'ysolde',tenets:o.tenets||['tithes','charity']}); if(err) throw new Error(err); return s.empires[owner].faithId; };
const factor=(s,c,re)=>(G.happiness(s,c).why.find(w=>re.test(w.label))||{}).value||0;
const slow=(s)=>{ s.slowClock=9.99; G.step(s,0.02); };   // fire one slow tick without moving time noticeably

// ---- tables ----
ok('7 gods with icon, domain and bonus', DATA.godOrder.length===7 && DATA.godOrder.every(g=>DATA.gods[g].icon&&DATA.gods[g].domain&&DATA.gods[g].desc));
ok('at least 10 tenets (incl. Arcane Communion, Forbidden Arts)', DATA.tenetOrder.length>=10 && DATA.tenets.arcane && DATA.tenets.forbidden);
ok('each race leans to 2 gods', DATA.raceOrder.every(r=>DATA.raceGods[r].length===2&&DATA.raceGods[r].every(g=>DATA.gods[g])));
ok('shrine registered (hidden from the generic AI picker)', DATA.buildings.shrine && DATA.buildingOrder.includes('shrine') && DATA.buildingGroups.some(g=>g.list.includes('shrine')));
ok('priest trained at the Temple, 1 citizen', DATA.units.priest.at==='temple' && DATA.commonUnits.includes('priest') && G.unitPop('priest')===1);
ok('5 miracles', DATA.miracleOrder.length===5);

// ---- holy sites ----
{ const s=fresh(); const hs=G.holySites(s);
  const wantHS=Math.round(Math.max(4,Object.keys(s.empires).length)*Math.max(1,Math.sqrt(s.map*s.map/961)));
  ok('~4 holy sites (scaled with the world) marked at new game', hs.length===wantHS && hs.every(t=>G.holySiteInfo(s,t)), ''+hs.length);
  ok('no stray holy flags on other tiles', s.special.filter(t=>(t.ruin||t.oasis).holy).length===hs.length, ''+s.special.filter(t=>(t.ruin||t.oasis).holy).length);
  const oasis=s.special.find(t=>t.oasis); oasis.oasis.holy='oru'; if(!s.holySites.includes(G.tileIdx(s,oasis))) s.holySites.push(G.tileIdx(s,oasis));
  const c=G.capital(s,'p'); oasis.oasis.owner=c.id;
  ok('an owned holy oasis belongs to its city', G.holySiteHolder(s,oasis)===c);
  const ruin=s.special.find(t=>t.ruin); ruin.ruin.holy='lirael'; if(!s.holySites.includes(G.tileIdx(s,ruin))) s.holySites.push(G.tileIdx(s,ruin));
  const t=near(s,ruin,1,1.5)||near(s,ruin,1,2.5); const rc=G.foundCity(s,'a1',t.x,t.y,'Pilgrimton');
  ok('a holy ruin belongs to the nearest city within reach', G.holySiteHolder(s,ruin)===rc);
  const r0=G.faithRate(s,'p'); ok('holding holy sites makes faith', r0>=R.holyFaith-1e-9, r0.toFixed(2));
}

// ---- founding ----
{ const s=fresh(); const c=G.capital(s,'p'); const emp=s.empires.p;
  ok('cannot found without a temple', !!G.foundFaith(s,'p',{name:'X',god:'ysolde',tenets:['tithes','charity']}));
  c.buildings.temple=1;
  ok('cannot found without faith', !!G.foundFaith(s,'p',{name:'X',god:'ysolde',tenets:['tithes','charity']}));
  emp.faith=500;
  ok('needs two different tenets', !!G.foundFaith(s,'p',{name:'X',god:'ysolde',tenets:['tithes','tithes']}));
  ok('needs a real god', !!G.foundFaith(s,'p',{name:'X',god:'zeus',tenets:['tithes','charity']}));
  ok('needs a name', !!G.foundFaith(s,'p',{name:'  ',god:'ysolde',tenets:['tithes','charity']}));
  ok('found a faith', G.foundFaith(s,'p',{name:'The Golden Way',god:'ysolde',tenets:['tithes','charity']})===null && emp.faith===500-R.foundCost);
  const f=G.faithOf(s,'p');
  ok('faith recorded with patron and tenets', f && f.name==='The Golden Way' && f.god==='ysolde' && f.tenets.join()==='tithes,charity' && f.founder==='p');
  ok('capital takes up the new faith', (c.faiths[f.id]||0)>0.3, JSON.stringify(c.faiths));
  ok('cannot found twice', !!G.foundFaith(s,'p',{name:'Again',god:'oru',tenets:['groves','fasting']}));
  // adopt
  const a2=G.capital(s,'a2'); s.empires.a2.faith=100;
  ok('AI adopts an existing faith', G.adoptFaith(s,'a2',f.id)===null && s.empires.a2.faithId===f.id && s.empires.a2.faith===100-R.adoptCost);
  ok('adoption cooldown', !!G.adoptFaith(s,'a2',f.id));
}

// ---- patron and tenet bonuses ----
{ const s=fresh(); const c=G.capital(s,'p');
  const g0=G.mod(s,'p',c,'grain'), t0=G.mod(s,'p',c,'tax'), p0=G.mod(s,'p',c,'popGrowth');
  faithful(s,'p',{god:'ysolde',tenets:['tithes','charity']});
  ok('Ysolde: +10% grain and growth', Math.abs(G.mod(s,'p',c,'grain')/g0-1.1)<1e-9 && Math.abs(G.mod(s,'p',c,'popGrowth')/p0-1.1)<1e-9);
  ok('Tithes: +8% taxes', Math.abs(G.mod(s,'p',c,'tax')/t0-1.08)<1e-9);
  const s2=fresh(); const a0=G.mod(s2,'p',null,'atk'); faithful(s2,'p',{god:'skarr',tenets:['fasting','monastic']});
  ok('Skarr: realm-wide +6% attack', Math.abs(G.mod(s2,'p',null,'atk')/a0-1.06)<1e-9);
  const s3=fresh(); const c3=G.capital(s3,'p'); const cu0=G.cultureRate(s3,c3); faithful(s3,'p',{god:'lirael',tenets:['iconography','monastic']});
  ok('Lirael + Iconography: more culture', Math.abs(G.cultureRate(s3,c3)/G.cultureRate(Object.assign(s3,{}),c3)-1)<1e-9 && G.cultureRate(s3,c3)>cu0*1.3, cu0.toFixed(2)+' -> '+G.cultureRate(s3,c3).toFixed(2));
}

// ---- faith points ----
{ const s=fresh(); const c=G.capital(s,'p'); s.holySites=[];
  const r0=G.faithRate(s,'p');
  c.buildings.shrine=2; c.buildings.temple=3;
  const r1=G.faithRate(s,'p');
  ok('shrines and temples make faith', Math.abs(r1-r0-(2*R.shrineFaith+3*R.templeFaith))<1e-9, r0.toFixed(2)+' -> '+r1.toFixed(2));
  c.happy=80; ok('jubilant cities make more faith', G.faithRate(s,'p')>r1);
  const f0=s.empires.p.faith; G.advance(s,600,60);
  ok('faith accrues over time', s.empires.p.faith>f0+20 && s.empires.p.faithTotal>=s.empires.p.faith, (s.empires.p.faith-f0).toFixed(1));
}

// ---- spread ----
{ const s=fresh(); const c=G.capital(s,'p'); const fid=faithful(s,'p');
  c.buildings.temple=5; for(const id of ['a1','a2','a3']) s.empires[id].faith=-1e6;   // keep the AIs out of it
  const t=near(s,c,3,5); const n=G.foundCity(s,'a1',t.x,t.y,'Heathenford');
  ok('a new city starts unconverted', n.faiths.none===1);
  G.advance(s,2*3600,720);
  ok('faith spreads to nearby foreign cities', (n.faiths[fid]||0)>0.15, JSON.stringify(n.faiths));
  ok('shares stay normalized', Math.abs(Object.values(n.faiths).reduce((a,b)=>a+b,0)-1)<1e-9);
  ok('the state faith holds the capital', G.majorityFaith(c)===fid, JSON.stringify(c.faiths));
  const t2=G.freeTile(s,x=>Object.values(s.cities).every(o=>G.dist(o,x)>R.reach+1)); const far=G.foundCity(s,'a2',t2.x,t2.y,'Farholm');
  G.advance(s,1800,180);
  ok('cities out of reach are untouched', far.faiths.none>0.999, JSON.stringify(far.faiths));
}

// ---- priests ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.temple=1; c.pop=60; c.res.grain=5000; s.empires.p.gold=5000;
  ok('priests need a faith', !!G.queueTrain(s,c.id,'priest',2));
  const fid=faithful(s,'p'); const emp=s.empires.p; emp.faith=50;
  ok('priests cost faith', !!G.queueTrain(s,c.id,'priest',2) && G.trainStatus(s,c,'priest').max===1);
  emp.faith=500; const p0=c.pop;
  ok('train priests at the temple', G.queueTrain(s,c.id,'priest',3)===null && emp.faith===500-90 && c.pop===p0-3);
  G.advance(s,600,60);
  ok('priests trained', (c.units.priest||0)===3, ''+c.units.priest);
  const ai=G.capital(s,'a1');
  c.units.militia=5;
  ok('preach refuses soldiers', !!G.sendArmy(s,c.id,ai.x,ai.y,'preach',{priest:1,militia:1}));
  const empty=G.freeTile(s,x=>G.dist(x,c)>3);
  ok('preach needs a city', !!G.sendArmy(s,c.id,empty.x,empty.y,'preach',{priest:1}));
  const before=ai.faiths[fid]||0;
  ok('send priests to a foreign city', G.sendArmy(s,c.id,ai.x,ai.y,'preach',{priest:3})===null && s.moves.some(m=>m.type==='preach'&&m.faith===fid));
  const m=s.moves.find(m=>m.type==='preach'); G.advance(s,m.arrive-s.time+1,40);
  const got=(ai.faiths[fid]||0)-before;
  ok('priests convert part of the city', got>0.15 && got<=R.priestCap, (got*100).toFixed(0)+'%');
  ok('priests stay where they preach', !s.moves.some(x=>x.owner==='p'&&x.type==='return') && !(c.units.priest>0));
  ok('a report tells of it', s.reports.some(r=>/preached/.test(r.title)));
  const s2=fresh(); const c2=G.capital(s2,'p'); faithful(s2,'p'); c2.units.priest=1;
  const nf=G.capital(s2,'a1'); const t=near(s2,c2,2,3); const own=G.foundCity(s2,'p',t.x,t.y,'Splitburg');
  own.faiths={none:0.5,zzz:0.5}; s2.faiths.zzz={id:'zzz',name:'Other',god:'oru',tenets:['groves','fasting'],founder:'a1',founded:0};
  own.units.priest=2; const b0=own.faiths[G.faithOf(s2,'p').id]||0;
  ok('priests can preach where they stand', G.preachHere(s2,own.id,2)===null && (own.faiths[G.faithOf(s2,'p').id]||0)>b0+0.1 && !own.units.priest);
  ok('priests may preach in our own split cities', G.sendArmy(s2,c2.id,own.x,own.y,'preach',{priest:1})===null);
  void nf;
}

// ---- miracles ----
{ const s=fresh(); const c=G.capital(s,'p'); const emp=s.empires.p;
  ok('no miracles without a faith', !!G.castMiracle(s,'p','crusade'));
  faithful(s,'p'); emp.faith=10000;
  const g0=G.mod(s,'p',c,'grain');
  const cost0=G.miracleCost(s,'p','harvest');
  ok('Blessed Harvest: +40% grain in the city', G.castMiracle(s,'p','harvest',c.id)===null && Math.abs(G.mod(s,'p',c,'grain')/g0-1.4)<1e-9);
  ok('miracle costs rise with use', G.miracleCost(s,'p','harvest')>cost0, cost0+' -> '+G.miracleCost(s,'p','harvest'));
  s.time+=11*60; ok('Blessed Harvest fades after 10 min', Math.abs(G.mod(s,'p',c,'grain')/g0-1)<1e-9);
  const a0=G.mod(s,'p',null,'atk');
  ok('Crusade: +15% attack realm-wide', G.castMiracle(s,'p','crusade')===null && Math.abs(G.mod(s,'p',null,'atk')/a0-1.15)<1e-9);
  ok('no double crusade', !!G.castMiracle(s,'p','crusade'));
  const rt0=G.mod(s,'p',c,'researchTime');
  ok('Inspiration: research x0.7', G.castMiracle(s,'p','inspiration')===null && Math.abs(G.mod(s,'p',c,'researchTime')/rt0-0.7)<1e-9);
  ok('Banish needs a calamity', !!G.castMiracle(s,'p','banish',c.id));
  const q=G.startCalamity(s,'blight',G.tileAt(s,c.x,c.y));
  ok('Banish ends a bad calamity', G.castMiracle(s,'p','banish',c.id)===null && q.end<=s.time && !G.calamitiesAt(s,c.x,c.y).length);
  slow(s); ok('calamities.js closes the banished calamity', q.ended===true);
  // sanctuary against the wyrm
  s.calamities=[]; c.units={militia:20}; const w=G.startCalamity(s,'wyrm',G.tileAt(s,c.x+1,c.y)||G.tileAt(s,c.x,c.y)); w.x=c.x; w.y=c.y;
  ok('Sanctuary on a city', G.castMiracle(s,'p','sanctuary',c.id)===null && c.sanctuary>s.time);
  const r=G.battle(s,null,{wyrm:1},1,'p',c.units,1,10,'raid');
  ok('the wyrm cannot break a sanctuary', r.win===false && r.sanctuary===true);
  c.sanctuary=0; const r2=G.battle(s,null,{wyrm:1},1,'p',{militia:20},1,10,'raid');
  ok('without sanctuary the wyrm wins', r2.win===true);
}

// ---- happiness ----
{ const s=fresh(); const c=G.capital(s,'p');
  ok('no faith factors without a faith', factor(s,c,/State faith|Divided|Charity/)===0);
  const fid=faithful(s,'p',{tenets:['charity','tithes']});
  c.faiths={none:0,[fid]:1};
  ok('state faith majority: +6', factor(s,c,/State faith/)===6);
  ok('Charity: +3', factor(s,c,/Charity/)===3);
  s.faiths.other={id:'other',name:'Other',god:'oru',tenets:['groves','fasting'],founder:'a1',founded:0};
  c.faiths={none:0.1,[fid]:0.45,other:0.45};
  ok('divided city: up to -6', factor(s,c,/Divided/)<=-4 && factor(s,c,/Divided/)>=-6, ''+factor(s,c,/Divided/));
  c.buildings.shrine=10; ok('shrines: capped +4', factor(s,c,/Shrines/)===4);
  const s2=fresh(); const c2=G.capital(s2,'p'); faithful(s2,'p',{god:'oru',tenets:['groves','fasting']});
  G.startCalamity(s2,'blight',G.tileAt(s2,c2.x,c2.y));
  ok("Oru's healers halve calamity unhappiness", factor(s2,c2,/healers/)===4 && factor(s2,c2,/^Calamity/)===-8);
}

// ---- diplomacy ----
{ const s=fresh(); const fid=faithful(s,'p'); const r=G.rel(s,'a1'); r.opinion=0;
  s.empires.a1.faith=200; G.adoptFaith(s,'a1',fid);
  ok('adopting your faith warms them', r.opinion>=10, ''+r.opinion);
  for(let i=0;i<400;i++) slow(s);
  ok('shared faith: opinion settles above the neutral target', r.opinion>=15, r.opinion.toFixed(1));
  const f2=faithful(s,'a2',{god:'skarr',tenets:['holywar','fasting']}); const r2=G.rel(s,'a2'); r2.opinion=0;
  for(let i=0;i<120;i++) slow(s);
  ok('different faiths: slight friction', r2.opinion<0 && r2.opinion>=-10, r2.opinion.toFixed(1));
  s.settings.hostility=1; r2.status='neutral';
  const h=G.hostility(s,'a2','p'); const h1=G.hostility(s,'a1','p');
  ok('zealots are more hostile to other faiths', s.empires.a2.zealot===true && h>1.2*Math.max(0.15,1-r2.opinion/80)-1e-9, h.toFixed(2));
  ok('shared faith softens hostility', h1<Math.max(0.15,1-r.opinion/80), h1.toFixed(2));
  r2.opinion=-50; s.time=Math.max(s.time,G.pace(s).grace+G.pace(s).ramp); slow(s);
  ok('zealous AI proclaims a holy war', s.empires.a2.holyWar==='p' && s.log.some(l=>/holy war/.test(l.text)));
  ok('holy war raises hostility further', G.hostility(s,'a2','p')>h);
  void f2;
}

// ---- holy warriors ----
{ const s=fresh(); faithful(s,'p',{tenets:['holywar','tithes']});
  const base=G.battle(s,'a1',{militia:100},1,'a2',{militia:10},1,0,'raid');
  const holy=G.battle(s,'p',{militia:100},1,'a1',{militia:10},1,0,'raid');
  const s2=fresh(); const plain=G.battle(s2,'p',{militia:100},1,'a1',{militia:10},1,0,'raid');
  ok('Holy Warriors: +10% attack vs other faiths', Math.abs(holy.A/plain.A-1.1)<0.02, plain.A+' -> '+holy.A); void base;
}

// ---- conquest of the faithful ----
{ const run=share=>{ const s=fresh(); const fid=faithful(s,'p'); const c=G.capital(s,'p'); const ai=G.capital(s,'a1');
    ai.units={}; ai.loyalty=50; ai.faiths=share?{none:0.2,[fid]:0.8}:{none:1};
    c.units={knight:300,herald:1}; c.res.grain=1e6; s.empires.a1.dead=false;
    G.sendArmy(s,c.id,ai.x,ai.y,'conquer',{knight:300,herald:1}); const m=s.moves[s.moves.length-1];
    G.advance(s,m.arrive-s.time-1,40); ai.loyalty=32;
    const orig=G.rint; G.rint=(a,b)=>Math.round((a+b)/2);   // average herald roll (26)
    G.advance(s,3,2); G.rint=orig;
    return ai.owner==='p'; };
  ok('a heathen city survives one herald at 32 loyalty', run(false)===false);
  ok('a city of our faith yields to one herald (1.5x)', run(true)===true);
}

// ---- religious victory and defeat ----
{ const s=fresh(); const fid=faithful(s,'p');
  const conv=f=>{ for(const c of Object.values(s.cities)) c.faiths={none:0.1,[f]:0.9}; };
  conv(fid); slow(s);
  ok('no faith victory before the late game', !s.victory, 'pr '+JSON.stringify(G.faithProgress(s,fid)));
  s.time=R.victoryMinHours*3600*G.pace(s).time+1; conv(fid); slow(s);
  ok('faith victory: majority everywhere, every rival touched', s.victory==='faith' && s.victoryFaith===fid, String(s.victory));
  const s2=fresh(); const f2=faithful(s2,'a1',{god:'durgan',tenets:['ancestors','fasting']}); s2.time=R.victoryMinHours*3600*G.pace(s2).time+1;
  for(const c of Object.values(s2.cities)) c.faiths={none:0.1,[f2]:0.9};
  G.citiesOf(s2,'a2')[0].faiths={none:1}; slow(s2);
  ok('needs a city of every living rival', !s2.gameOver);
  for(const c of Object.values(s2.cities)) c.faiths={none:0.1,[f2]:0.9}; slow(s2);
  ok('an AI faith sweeping the world is a defeat', s2.gameOver==='faith' && s2.gameOverBy==='a1');
  const s3=fresh('hearth',{mode:'endless'}); const f3=faithful(s3,'p'); s3.time=1e7;
  for(const c of Object.values(s3.cities)) c.faiths={none:0.1,[f3]:0.9}; slow(s3);
  ok('no religious victory in Endless mode', !s3.victory);
}

// ---- AI behaviour ----
{ const s=fresh(); const emp=s.empires.a1; const ai=G.capital(s,'a1');
  ai.buildings.townhall=6; for(const g of DATA.goodOrder) ai.res[g]=5000; emp.gold=5000; ai.buildQueue=[];
  s.time=G.pace(s).grace+60; emp.relClock=99;
  for(const h of G.aiHooks) h(s,emp,0.2);
  ok('faith-poor AI builds a temple or shrine', ai.buildQueue.some(q=>q.type==='temple'||q.type==='shrine'), ai.buildQueue.map(q=>q.type).join());
  ai.buildings.temple=2; emp.faith=500; emp.relClock=99; ai.buildQueue=[];
  for(const h of G.aiHooks) h(s,emp,0.2);
  const f=G.faithOf(s,'a1');
  ok('AI founds a faith of its own gods', f && DATA.raceGods[emp.race].includes(f.god) && f.tenets.length===2, f&&f.name);
  emp.faith=500; ai.pop=60; emp.relClock=99; let trained=false;
  for(let i=0;i<20&&!trained;i++){ emp.relClock=99; for(const h of G.aiHooks) h(s,emp,0.2); trained=(ai.train.temple||[]).length>0; }
  ok('AI trains priests', trained);
  ai.units.priest=4; ai.faiths={none:0.1,[f.id]:0.9}; const t=near(s,ai,3,6); const target=G.foundCity(s,'a2',t.x,t.y,'Mission');
  emp.relClock=99; for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI sends priests to nearby cities', s.moves.some(m=>m.owner==='a1'&&m.type==='preach'));
  emp.faith=1000; G.startCalamity(s,'blight',G.tileAt(s,ai.x,ai.y)); emp.relClock=99;
  for(const h of G.aiHooks) h(s,emp,0.2);
  ok('AI banishes a calamity on its lands', (emp.miracleUses.banish||0)===1);
  // the people's faith: most cities converted -> the crown follows
  const s2=fresh(); const pf=faithful(s2,'p'); const e2=s2.empires.a2; faithful(s2,'a2',{god:'oru',tenets:['groves','fasting']});
  e2.faithChanged=-1e9; e2.faith=500; for(const c of G.citiesOf(s2,'a2')) c.faiths={none:0.1,[pf]:0.9};
  e2.relClock=99; for(const h of G.aiHooks) h(s2,e2,0.2);
  ok('AI adopts the faith most of its cities follow', e2.faithId===pf);
  // a weak AI without a temple adopts an existing faith
  const s3=fresh(); const f3=faithful(s3,'a1',{god:'durgan',tenets:['ancestors','fasting']}); const e3=s3.empires.a2;
  e3.faith=100; s3.time=G.pace(s3).grace+200*60; e3.relClock=99; for(const h of G.aiHooks) h(s3,e3,0.2);
  ok('templeless AI adopts an existing faith', !!e3.faithId, String(e3.faithId)); void f3; void target;
}

// ---- a whole AI game ----
{ const s=G.newGame({name:'T',race:'hearth'}); G.advance(s,6*3600,1500);
  const n=Object.keys(s.faiths).length; const pr=s.moves.length;
  ok('AIs found faiths within 6 hours', n>=2, n+' faiths: '+Object.values(s.faiths).map(f=>f.name+' ('+f.founder+', '+f.god+')').join('; '));
  ok('AIs build shrines', Object.values(s.cities).some(c=>c.owner!=='p'&&G.lvl(c,'shrine')>0));
  ok('no faith victory by 6 hours', !s.gameOver && !s.victory); void pr;
}

// ---- save / load ----
{ const s=fresh(); const fid=faithful(s,'p'); const c=G.capital(s,'p'); s.empires.p.faith=321; c.faiths={none:0.3,[fid]:0.7};
  G.save(s); const s2=G.load(); const c2=s2.cities[c.id];
  ok('save/load keeps religion', s2.faiths[fid] && s2.empires.p.faithId===fid && s2.empires.p.faith===321 && Math.abs(c2.faiths[fid]-0.7)<1e-9 && G.holySites(s2).length===G.holySites(s).length);
  G.advance(s2,600,60); ok('loaded game runs', s2.empires.p.faith>321);
  const old=JSON.parse(G.serialize(s)); delete old.faiths; delete old.holySites;
  for(const e of Object.values(old.empires)){ delete e.faith; delete e.faithTotal; delete e.faithId; delete e.miracleUses; }
  for(const c of Object.values(old.cities)) delete c.faiths;
  for(const t of old.tiles){ if(t.ruin) delete t.ruin.holy; if(t.oasis) delete t.oasis.holy; }
  const s3=G.deserialize(JSON.stringify(old));
  let err=null; try{ G.advance(s3,1200,120); G.faithWorld(s3); G.happiness(s3,G.capital(s3,'p')); }catch(e){ err=e; }
  ok('an older save without religion loads and runs', s3 && !err && s3.faiths && G.holySites(s3).length>=4 && Object.values(s3.cities).every(c=>c.faiths&&c.faiths.none!==undefined), err&&err.stack);
}
// ---- integration APIs: patron, state faith, spells, unknown races ----
{ const s=fresh(); ok('no patron without a faith', G.patronOf(s,'p')===null && G.stateFaith(s,'p')===null);
  const fid=faithful(s,'p',{god:'mirren',tenets:['arcane','forbidden']});
  ok('patronOf / stateFaith', G.patronOf(s,'p')==='mirren' && G.stateFaith(s,'p').id===fid);
  ok('Arcane Communion: spells x0.85', Math.abs(G.mod(s,'p',null,'spellCost')-0.85)<1e-9);
  const c=G.capital(s,'p'); s.holySites=[]; c.buildings.temple=3; const r=G.faithRate(s,'p');
  s.empires.p.faithId=null; const r0=G.faithRate(s,'p'); s.empires.p.faithId=fid;
  ok('Forbidden Arts: +20% faith', r>r0*1.15, r0.toFixed(2)+' -> '+r.toFixed(2));
  ok('Forbidden Arts: no unrest without spells', factor(s,c,/Forbidden/)===0);
  G.noteSpellCast(s,'p'); ok('Forbidden Arts: casting unsettles cities', factor(s,c,/Forbidden/)===-3);
  DATA.races.zz_test={...DATA.races.hearth,name:'Test',gods:['thalos','mirren']};
  ok('race-declared leaning gods are used', G.raceGods('zz_test').join()==='thalos,mirren');
  delete DATA.races.zz_test.gods; ok('unknown races still get two gods', G.raceGods('zz_test').length===2 && G.raceGods('zz_test').every(g=>DATA.gods[g]));
  const e={race:'zz_test',aggr:0.5}; const fo=G.aiFounding(s,e);
  ok('AI founding works for an unknown race', DATA.gods[fo.god] && fo.tenets.length===2 && fo.tenets[0]!==fo.tenets[1] && fo.tenets.every(t=>DATA.tenets[t]));
  delete DATA.races.zz_test;
}
console.log(fails?fails+' FAILED':'all religion checks passed');
if(fails) process.exitCode=1;
`);
