// Supply lines and the realm ledger's engine: planner, targets, capacity, priorities, routes, sea, market, AI, speed, saves.
// node tests/logistics.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; s.routes=[]; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); const c=G.capital(s,'p'); c.buildings.warehouse=10; c.buildings.market=4; return s; };
const near=(s,c,lo=4,hi=7)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&G.landReachable(s,c,x));
const found=(s,owner,c,name,lo,hi)=>{ const t=near(s,c,lo,hi); const b=G.foundCity(s,owner,t.x,t.y,name); b.buildings.warehouse=10; for(const g of DATA.goodOrder) b.res[g]=0; return b; };
const run=(s,sec)=>G.advance(s,sec,Math.ceil(sec/5));
const sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0);
const ships=(plan,a,b)=>plan.ships.filter(x=>(!a||x.from===a.id)&&(!b||x.to===b.id));

// ---- the planner moves goods from surplus to deficit ----
{ const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Thornby'); b.pop=60;
  c.res.grain=3000; b.res.grain=0;
  ok('nothing planned without a policy or relief', (G.setSupplyRealm(s,'p',{relief:false}), G.supplyPlan(s,'p').ships.length===0));
  G.setSupplyPolicy(s,'p','grain',{on:true,mode:'min',n:10});
  const e=G.econ(s,b), t=G.supplyTarget(s,b,'grain',e);
  ok('target = minutes × use', Math.abs(t.target-G.supplyUse(s,b,'grain',e)*10)<1e-6 && t.target>0, t.target.toFixed(1));
  const plan=G.supplyPlan(s,'p'); const sh=ships(plan,c,b)[0];
  ok('a cart is planned from the surplus city to the deficit city', sh && sh.goods.grain>0, JSON.stringify(plan.ships.map(x=>[x.from,x.to,x.goods])));
  ok('it carries about what is missing, not more', sh && sh.goods.grain<=Math.ceil(t.target+Math.max(0,-e.net.grain)*G.LOGI.lead)+1, sh&&sh.goods.grain);
  const before=c.res.grain; G.supplyRun(s,'p');
  const m=s.moves.find(x=>x.supply);
  ok('a real caravan sets out (type trade, drawn as a cart)', m && m.type==='trade' && m.from===c.id && m.to===b.id && m.cargo.grain>0 && c.res.grain<before && m.path && m.path.length>1);
  ok('in-flight goods count: no second cart for the same need', G.supplyPlan(s,'p').ships.filter(x=>x.to===b.id&&x.goods.grain).length===0);
  const n=m.cargo.grain; let k=0; while(s.moves.includes(m)&&k++<400) run(s,10);
  ok('the caravan arrives and unloads', !s.moves.includes(m) && b.res.grain>=n*0.5, 'b grain '+Math.round(b.res.grain)+' sent '+n);
  ok('tallies count trips and goods', G.logistics(s,'p').stats.trips>=1 && G.logistics(s,'p').stats.shipped>=n);
}

// ---- targets: never drain a source below its own target/export level ----
{ const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Thornby'); b.pop=60;
  G.setSupplyRealm(s,'p',{relief:false}); G.setSupplyPolicy(s,'p','timber',{on:true,mode:'stock',n:600});
  c.res.timber=2600; b.res.timber=0;
  const tc=G.supplyTarget(s,c,'timber');
  const sh=ships(G.supplyPlan(s,'p'),c,b)[0];
  ok('source keeps max(target, export): ships at most res − export', sh && sh.goods.timber<=2600-tc.export && c.res.timber-sh.goods.timber>=tc.target, JSON.stringify({ship:sh&&sh.goods,exp:tc.export,target:tc.target}));
  G.setSupplyCity(s,'p',c.id,'timber',{export:2600});
  ok('per-city export level honoured (nothing above it)', ships(G.supplyPlan(s,'p'),c,b).length===0);
  G.setSupplyCity(s,'p',c.id,'timber',{export:null}); G.setSupplyCity(s,'p',c.id,'timber',{target:880});
  c.res.timber=1000; ok('per-city target honoured for the source (never drained below it)', ships(G.supplyPlan(s,'p'),c,b).every(x=>1000-(x.goods.timber||0)>=880));
  G.setSupplyCity(s,'p',c.id,'timber',{target:null}); G.setSupplyCity(s,'p',b.id,null,{off:true});
  ok('a city left out of the plan gets nothing', ships(G.supplyPlan(s,'p'),null,b).length===0);
}

// ---- caravan capacity and slots ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=1; const b=found(s,'p',c,'Thornby'); b.buildings.warehouse=14; b.pop=200;
  G.setSupplyPolicy(s,'p','stone',{on:true,mode:'stock',n:2500}); c.res.stone=G.storageCap(s,c); b.res.stone=0;
  G.setSupplyCity(s,'p',c.id,'stone',{target:0,export:0});
  const plan=G.supplyPlan(s,'p'); const tot=sum(ships(plan,c,b).reduce((a,x)=>(a.push(sum(x.goods)),a),[]));
  ok('a load never exceeds the caravan capacity', ships(plan,c,b).length===1 && tot<=G.caravanCap(s,c), tot+' cap '+G.caravanCap(s,c));
  G.supplyRun(s,'p');
  ok('market 1: one cart on the road at a time', G.supplyPlan(s,'p').ships.filter(x=>x.from===c.id).length===0);
  c.buildings.market=4;
  ok('market 4: a second cart may go', G.supplyPlan(s,'p').ships.filter(x=>x.from===c.id).length===1);
  const d=found(s,'p',c,'Nomarket',3,9); d.buildings.market=0; d.res.stone=G.storageCap(s,d); G.setSupplyCity(s,'p',d.id,'stone',{target:0,export:0});
  ok('a city without a Market sends nothing (and the plan says why)', G.supplyPlan(s,'p').ships.every(x=>x.from!==d.id) && G.supplyPlan(s,'p').notes.some(t=>/Nomarket has no Market/.test(t)));
}

// ---- hurting shortages come first ----
{ const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Hungry'); const d=found(s,'p',c,'Lowstock',3,9);
  b.pop=80; d.pop=80; b.starving=true; b.res.grain=0; d.res.grain=0;
  G.setSupplyPolicy(s,'p','grain',{on:true,mode:'min',n:10}); c.buildings.market=1;
  c.res.grain=G.supplyTarget(s,c,'grain').export+60;     // only enough for one
  const plan=G.supplyPlan(s,'p');
  const nb=plan.needs.find(x=>x.city===b.id&&x.g==='grain'), nd=plan.needs.find(x=>x.city===d.id&&x.g==='grain');
  ok('a starving city outranks one merely below target', nb && nd && nb.prio===100 && nb.prio>nd.prio, nb&&nd&&nb.prio+' vs '+nd.prio);
  ok('the scarce grain goes to the starving city', ships(plan,c,b).length===1 && ships(plan,c,d).length===0);
  // tools wear, stone for walls and firewood in winter all count as hurting
  b.starving=false; b.short={tools:true}; b.buildings.wall=3;
  ok('worn-out tools hurt', G.supplyHurt(s,b,'tools').prio>=70);
  b.short.stone=true; ok('stone for crumbling walls hurts more than plain stone', G.supplyHurt(s,b,'stone').prio>G.supplyHurt(s,d,'stone').prio);
  const se=G.season; G.season=()=>({index:3,name:'Winter',progress:0.5,year:1}); b.short.timber=true;
  ok('no firewood in winter is near the top', G.supplyHurt(s,b,'timber').prio>=90); G.season=se;
  // relief: a hurting shortage is served even without a policy for that good
  G.setSupplyRealm(s,'p',{relief:true}); b.short={tools:true}; b.wear={tools:6}; b.res.tools=0; c.res.tools=500;
  ok('relief serves a hurting shortage with no policy', G.supplyPlan(s,'p').ships.some(x=>x.to===b.id&&x.goods.tools>0));
  G.setSupplyRealm(s,'p',{relief:false});
  ok('…and not when relief is off', !G.supplyPlan(s,'p').ships.some(x=>x.to===b.id&&x.goods.tools>0));
}

// ---- nearest source first ----
{ const s=fresh(); const c=G.capital(s,'p'); const far=found(s,'p',c,'Far',8,11); const b=found(s,'p',c,'Mid',3,5);
  far.buildings.market=4; c.res.ore=3000; far.res.ore=3000; b.res.ore=0; b.buildings.smelter=3; b.pop=60;
  G.setSupplyPolicy(s,'p','ore',{on:true,mode:'stock',n:400});
  const plan=G.supplyPlan(s,'p'); const first=plan.ships.find(x=>x.to===b.id);
  const dc=G.dist(c,b), df=G.dist(far,b);
  ok('the nearest source ships', first && first.from===(dc<=df?c.id:far.id), first&&first.from+' dc '+dc.toFixed(1)+' df '+df.toFixed(1));
}

// ---- standing routes are preferred, and hurried when it hurts ----
{ const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Routed'); b.pop=70; b.buildings.market=1;
  c.res.grain=3000; b.res.grain=0; b.starving=true;
  const r=G.createRoute(s,'p',c.id,b.id,{give:{grain:300},every:30}); r.nextAt=s.time+3000;
  G.setSupplyPolicy(s,'p','grain',{on:true,mode:'min',n:10});
  const plan=G.supplyPlan(s,'p');
  ok('a route carrying the good covers the need', plan.routed.some(x=>x.route===r.id&&x.g==='grain'&&x.n>0), JSON.stringify(plan.routed));
  const extra=plan.needs.find(x=>x.city===b.id&&x.g==='grain');
  ok('carts only for what the route does not bring', ships(plan,c,b).reduce((a,x)=>a+(x.goods.grain||0),0)<=extra.need-Math.min(300,extra.need)+1);
  G.supplyRun(s,'p');
  ok('an idle route is called out early for a hurting need', r.nextAt<=s.time, (r.nextAt-s.time)+'s');
  run(s,15);
  ok('…and its cart leaves', s.moves.some(m=>m.route===r.id));
}

// ---- over the sea from a Harbor ----
{ let s, a, b, tries=0;
  while(!b && tries++<25){ s=G.newGame({name:'T',race:'hearth'}); quiet(s); a=null; b=null;
    const reg=G.landRegions(s); const coast=s.tiles.filter(t=>!G.isWater(t)&&!t.city&&!t.camp&&!t.oasis&&!t.ruin&&!t.minor&&!DATA.terrain[t.terrain].impassable&&G.coastal(s,t.x,t.y));
    outer: for(const x of coast) for(const y of coast){ if(reg[x.y*s.map+x.x]===reg[y.y*s.map+y.x]||G.dist(x,y)>12) continue; if(G.path(s,x,y,true)){ a=x; b=y; break outer; } } }
  ok('found two shores of different lands', !!b, 'tries '+tries);
  if(b){ const A=G.foundCity(s,'p',a.x,a.y,'Port'), B=G.foundCity(s,'p',b.x,b.y,'Isle'); A.buildings.market=2; A.buildings.warehouse=8; B.buildings.warehouse=8; B.pop=50;
    A.res.grain=2500; B.res.grain=0; G.setSupplyPolicy(s,'p','grain',{on:true,mode:'min',n:10});
    G.setSupplyRealm(s,'p',{relief:false}); for(const c of G.citiesOf(s,'p')) if(c!==A&&c!==B) G.setSupplyCity(s,'p',c.id,null,{off:true});
    ok('no Harbor: no way across the water', ships(G.supplyPlan(s,'p'),A,B).length===0);
    A.buildings.harbor=1; A.buildings.townhall=Math.max(A.buildings.townhall||0,4);
    const sh=ships(G.supplyPlan(s,'p'),A,B)[0];
    ok('with a Harbor the goods go by sea', sh && sh.naval && sh.goods.grain>0);
    G.supplyRun(s,'p'); const m=s.moves.find(x=>x.supply&&x.to===B.id);
    ok('the sea shipment is a naval move', m && m.naval);
    let k=0; while(m && s.moves.includes(m) && k++<600) run(s,10);
    ok('…and lands on the island', m && !s.moves.includes(m) && B.res.grain>0, Math.round(B.res.grain));
  }
}

// ---- ambushes on the road ----
{ const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Far',6,9); b.pop=60; c.res.grain=3000;
  G.setSupplyPolicy(s,'p','grain',{on:true,mode:'min',n:20}); G.supplyRun(s,'p');
  const m=s.moves.find(x=>x.supply); const mid={x:Math.round((c.x+b.x)/2),y:Math.round((c.y+b.y)/2)};
  s.camps.kx={id:'kx',x:mid.x,y:mid.y,tier:5,units:{brigand:40},loot:{}};
  const rate=G.TRADE.campRate; G.TRADE.campRate=50;
  let k=0; while(s.moves.includes(m)&&k++<400) run(s,10); G.TRADE.campRate=rate;
  ok('supply carts can be ambushed', m.ambushed && G.logistics(s,'p').stats.lost>0, 'lost '+G.logistics(s,'p').stats.lost);
}

// ---- the market: auto-buy above the reserve, auto-sell what would spill ----
{ const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Buyer'); b.buildings.market=2; b.pop=80; b.starving=true; c.res.grain=0;
  G.setSupplyPolicy(s,'p','grain',{on:true,mode:'min',n:10});
  G.setSupplyRealm(s,'p',{buy:true,reserve:1000}); const emp=s.empires.p;
  emp.gold=900; G.supplyRun(s,'p');
  ok('never buys below the gold reserve', emp.gold===900 && b.res.grain===0);
  emp.gold=1100; G.supplyRun(s,'p');
  ok('buys a hurting shortage with gold above the reserve', b.res.grain>0 && emp.gold>=1000-1e-6, 'grain '+b.res.grain+' gold '+emp.gold.toFixed(1));
  // selling
  G.setSupplyRealm(s,'p',{buy:false,sell:true}); b.starving=false; b.res.grain=G.storageCap(s,b);
  c.buildings.farm=8; const cap=G.storageCap(s,c); c.res.grain=cap*0.99; c.res.ore=cap*0.99; c.buildings.mine=5;
  const g0=emp.gold; G.supplyRun(s,'p');
  ok('sells surplus that would spill over', c.res.ore<=cap*G.LOGI.sellTo+1 && emp.gold>g0, Math.round(c.res.ore)+'/'+cap);
  G.setSupplyRealm(s,'p',{sell:false}); c.res.ore=cap*0.99; G.supplyRun(s,'p');
  ok('does not sell when the switch is off', c.res.ore>cap*0.98);
}

// ---- the player's switch and the slow tick ----
{ const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Ticked'); b.pop=60; c.res.grain=3000; b.res.grain=0;
  G.logistics(s,'p').goods.grain={on:true,mode:'min',n:10,export:null};
  run(s,120); ok('switch off: nothing moves', !s.moves.some(m=>m.supply));
  b.res.grain=0; b.pop=Math.max(b.pop,60); G.setSupplyRealm(s,'p',{on:true}); const pl=G.supplyPlan(s,'p'); run(s,120); ok('switch on: the slow tick plans and ships', s.moves.some(m=>m.supply) || G.logistics(s,'p').stats.trips>0, JSON.stringify({needs:pl.needs,ships:pl.ships.length,b:Math.round(b.res.grain),c:Math.round(c.res.grain),st:b.starving,next:G.logistics(s,'p').next-s.time}));
  G.supplyRecommend(s,'p'); ok('recommended policy covers food, firewood, stone and tools', ['grain','timber','stone','tools'].every(g=>G.logistics(s,'p').goods[g].on));
}

// ---- AI realms balance their cities with the same planner ----
{ const s=fresh(); const a=G.capital(s,'a1'); a.buildings.market=3; a.buildings.warehouse=10; a.res.grain=3000;
  const b=found(s,'a1',a,'AiTown'); b.pop=70; b.res.grain=0; b.starving=true;
  const before=G.logistics(s,'a1').stats.trips;
  let k=0; while(G.logistics(s,'a1').stats.trips===before && k++<60) run(s,30);
  ok('an AI realm sends grain to its starving city', G.logistics(s,'a1').stats.trips>before && (s.moves.some(m=>m.supply&&m.owner==='a1')||b.res.grain>0), 'trips '+G.logistics(s,'a1').stats.trips);
  ok('AI realms keep no log in the save', G.logistics(s,'a1').log.length===0);
  ok('AI policy does not need the player switch', !G.logistics(s,'a1').on);
}

// ---- performance: twelve cities ----
{ const s=fresh(); const c=G.capital(s,'p'); const list=[c];
  for(let i=0;i<11;i++){ const t=G.freeTile(s,x=>G.dist(x,c)>=3&&G.dist(x,c)<=16&&G.landReachable(s,c,x)&&list.every(o=>G.dist(o,x)>=2.5)); if(!t) break; const b=G.foundCity(s,'p',t.x,t.y,'C'+i); b.buildings.market=1+(i%5); b.buildings.warehouse=6; b.pop=40+i*5; list.push(b); }
  list.forEach((x,i)=>{ for(const g of DATA.goodOrder) x.res[g]=i%2?Math.random()*20:G.storageCap(s,x)*(0.5+Math.random()*0.5); });
  G.supplyRecommend(s,'p'); G.setSupplyRealm(s,'p',{sell:true,buy:true});
  ok('twelve cities founded', list.length===12, list.length);
  let t0=Date.now(); for(let i=0;i<40;i++) G.supplyPlan(s,'p'); const per=(Date.now()-t0)/40;
  ok('a planning pass for 12 cities is cheap', per<15, per.toFixed(2)+' ms');
  t0=Date.now(); run(s,1800); const adv=Date.now()-t0;
  ok('half an hour with 12 cities and supply lines on runs fine', adv<20000 && G.logistics(s,'p').stats.trips>0, adv+' ms, trips '+G.logistics(s,'p').stats.trips);
  ok('no negative stocks', list.every(x=>Object.values(x.res).every(v=>v>=-1e-6)));
}

// ---- save / load and old saves ----
{ const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Saved'); b.pop=60; c.res.grain=3000;
  G.setSupplyPolicy(s,'p','grain',{on:true,mode:'min',n:15}); G.setSupplyCity(s,'p',b.id,'grain',{target:300}); G.setSupplyRealm(s,'p',{buy:true,reserve:777});
  G.supplyRun(s,'p'); const m=s.moves.find(x=>x.supply);
  const s2=G.deserialize(G.serialize(s)); const o2=G.logistics(s2,'p');
  ok('save/load keeps policies, overrides and switches', o2.goods.grain.n===15 && o2.cities[b.id].grain.target===300 && o2.buy && o2.reserve===777);
  const m2=s2.moves.find(x=>x.supply);
  ok('save/load keeps carts on the road', m2 && m2.cargo.grain===m.cargo.grain);
  const g0=s2.cities[b.id].res.grain; let k=0; while(s2.moves.includes(m2)&&k++<400) run(s2,10);
  ok('a loaded cart still delivers', s2.cities[b.id].res.grain>g0);
  const old=JSON.parse(G.serialize(s)); delete old.logistics; old.moves=old.moves.filter(x=>!x.supply);
  const s3=G.deserialize(JSON.stringify(old)); run(s3,300);
  ok('old saves without supply lines load and run', s3 && !G.logistics(s3,'p').on && G.supplyPlan(s3,'p').ships.length>=0);
}

// ---- the Steward suggests supply lines ----
if (G.councilAdvice) { const s=fresh(); const c=G.capital(s,'p'); const b=found(s,'p',c,'Starving'); b.pop=60; b.res.grain=0; b.starving=true;
  c.res.grain=G.storageCap(s,c); c.buildings.farm=6;
  G.councilDirty(s);
  const adv=G.councilAdvice(s).find(i=>/^steward:supply:/.test(i.id));
  ok('the Steward suggests a supply line when one city starves and another overflows', adv && adv.action && adv.action.t==='ledger', adv&&adv.text);
  G.setSupplyPolicy(s,'p','grain',{on:true}); G.councilDirty(s);
  ok('…and stops once a supply line carries that good', !G.councilAdvice(s).some(i=>/^steward:supply:/.test(i.id)));
}

console.log(fails?fails+' FAILED':'ALL PASS');
if(fails) process.exitCode=1;
`);
