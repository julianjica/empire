// Trade routes: internal and foreign routes, income, opinion, war, ambushes, escorts, AI, save/load.  node tests/traderoutes.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js',...['js/forge.js'].filter(f=>fs.existsSync(f)),'js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/espionage.js','js/minors.js','js/chronicle.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra?' '+extra:'')); };
const T=G.TRADE;
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; };
const fresh=()=>{ const s=G.newGame({name:'T',race:'hearth'}); quiet(s); G.capital(s,'p').buildings.warehouse=10; return s; };
// a second player city a few tiles from the capital, both with markets
const twoCities=(s,L=4)=>{ const c=G.capital(s,'p'); const t=G.freeTile(s,x=>G.dist(x,c)>=5&&G.dist(x,c)<=7); const b=G.foundCity(s,'p',t.x,t.y,'Second');
  c.buildings.market=L; b.buildings.market=1; c.res.ore=3000; b.res.ore=0; b.buildings.warehouse=10; return [c,b]; };
const aiCity=(s,id='a1')=>{ const a=G.capital(s,id); a.buildings.market=3; a.buildings.warehouse=10; for(const g of DATA.goodOrder) a.res[g]=3000; return a; };
const run=(s,sec)=>G.advance(s,sec,Math.ceil(sec/5));
const noTrade=(s,f)=>{ const r=s.routes, a=s.aiRoutes; s.routes=[]; s.aiRoutes=[]; try{ return f(); } finally { s.routes=r; s.aiRoutes=a; } };
const orig=(s,a,b)=>noTrade(s,()=>G.hostility(s,a,b));

// ---- route slots by market level ----
{ const s=fresh(); const [c,b]=twoCities(s,1);
  ok('slots: market 1 -> 1, 4 -> 2, 8 -> 3, none -> 0', G.routeSlots(s,c)===1 && (c.buildings.market=4,G.routeSlots(s,c))===2 && (c.buildings.market=8,G.routeSlots(s,c))===3 && (c.buildings.market=0,G.routeSlots(s,c))===0);
  ok('no market, no route', typeof G.createRoute(s,'p',c.id,b.id,{give:{ore:100}})==='string');
  c.buildings.market=1;
  ok('first route opens', typeof G.createRoute(s,'p',c.id,b.id,{give:{ore:100}})==='object');
  ok('second route refused at market 1', typeof G.createRoute(s,'p',c.id,b.id,{give:{grain:100}})==='string');
  c.buildings.market=4;
  ok('second route allowed at market 4', typeof G.createRoute(s,'p',c.id,b.id,{give:{grain:100}})==='object');
  ok('caravan capacity enforced', typeof G.createRoute(s,'p',b.id,c.id,{give:{ore:G.caravanCap(s,b)+1}})==='string');
}

// ---- internal routes deliver again and again ----
{ const s=fresh(); const [c,b]=twoCities(s,4);
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:200},every:5});
  run(s,15);
  const mv=s.moves.find(m=>m.route===r.id);
  ok('departure is a real trade move (drawn as a cart)', mv && mv.type==='trade' && mv.cargo.ore===200 && c.res.ore<=2800+50, mv&&JSON.stringify(mv.cargo));
  ok('travels at speed 8', mv && mv.arrive-mv.depart===G.travelTime(s,'p',c,b,8));
  c.res.ore=3000;
  run(s,31*60);
  ok('internal route delivered repeatedly', r.trips>=5 && b.res.ore>=1000, 'trips '+r.trips+' ore '+Math.round(b.res.ore));
  const p=r.trips; G.pauseRoute(s,r.id); run(s,600); ok('paused route stops', r.trips<=p+1, r.trips+' vs '+p);
  G.pauseRoute(s,r.id); run(s,600); ok('resumed route runs again', r.trips>p+1);
  c.res.ore=0; r.nextAt=s.time; const nm=s.moves.length; ok('no goods: waits instead of sending empty carts', G.routeDepart(s,r) && /Waiting/.test(r.note) && s.moves.length===nm && r.nextAt>s.time, r.note);
  ok('ordinary caravans still work', !G.sendArmy(s,c.id,b.x,b.y,'trade',{},{grain:50}) && (run(s,400), true));
}

// ---- foreign routes: exchange, income both ways, opinion ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=4; c.res.ore=3000; c.res.timber=0; const a=aiCity(s,'a1'); a.res.timber=0; // empty stores: their merchants still deliver the agreed amount
  const rel=G.rel(s,'a1');
  rel.opinion=-10; ok('refused when opinion < 0', typeof G.createRoute(s,'p',c.id,a.id,{give:{ore:300},takeGood:'timber'})==='string');
  rel.opinion=0; rel.status='war'; ok('refused at war', typeof G.createRoute(s,'p',c.id,a.id,{give:{ore:300},takeGood:'timber'})==='string');
  rel.status='peace'; rel.opinion=15;
  const a2=G.capital(s,'a2'); ok('refused without a foreign market', typeof G.createRoute(s,'p',c.id,a2.id,{give:{ore:300},takeGood:'timber'})==='string');
  const q=G.routeQuote(s,c,a,'ore',300,'timber');
  const r=G.createRoute(s,'p',c.id,a.id,{give:{ore:300},takeGood:'timber',every:5});
  ok('foreign route opens with quoted return', typeof r==='object' && r.goods.take.timber===q.take && q.take>0, JSON.stringify(r.goods)+' factor '+q.factor.toFixed(2));
  ok('longer routes pay more', G.routeIncome(s,{x:0,y:0,buildings:{market:3}},{x:20,y:0,buildings:{market:3}}) > 2*G.routeIncome(s,{x:0,y:0,buildings:{market:3}},{x:10,y:0,buildings:{market:3}}));
  const pg=s.empires.p.gold, ag=s.empires.a1.gold, aOre=a.res.ore;
  // run until the first trip has come home
  let n=0, tim0=0;
  const backLeg=()=>s.moves.find(m=>m.route===r.id&&m.leg==='back');
  while(!backLeg() && n++<400) run(s,5);
  const bl=backLeg(); tim0=c.res.timber; const blId=bl&&bl.id;
  while(s.moves.some(m=>m.id===blId) && n++<800) { tim0=c.res.timber; run(s,5); }
  const gotTimber=c.res.timber-tim0;
  const inc=G.routeIncome(s,c,a);
  ok('AI received the goods', a.res.ore>=aOre+290 || a.res.ore>=G.storageCap(s,a)-1, Math.round(aOre)+' -> '+Math.round(a.res.ore));
  ok('player received the full return leg even from empty stores', bl && bl.cargo.timber===q.take && gotTimber>=q.take*0.99, 'timber +'+Math.round(gotTimber)+' / '+q.take);
  ok('both realms earned trade income', inc>0 && r.trips===1 && r.income===inc && s.empires.p.tradeIncome===inc && s.empires.a1.tradeIncome>=inc && s.empires.p.gold>pg, 'income '+inc+' route '+r.income+' p '+s.empires.p.tradeIncome+' a1 '+Math.round(s.empires.a1.tradeIncome)+' trips '+r.trips+' p gold '+Math.round(pg)+' -> '+Math.round(s.empires.p.gold));
  const op0=rel.opinion; const t0=r.trips;
  n=0; while(r.trips<t0+2 && n++<400) run(s,10);
  ok('trips raise opinion', rel.opinion>op0, op0.toFixed(1)+' -> '+rel.opinion.toFixed(1));
  // goodwill holds opinion above the treaty baseline
  rel.opinion=15+T.goodwillPer-1; G.pauseRoute(s,r.id); run(s,600); G.pauseRoute(s,r.id);
  ok('active route: paused does not hold goodwill', rel.opinion<15+T.goodwillPer-2, rel.opinion.toFixed(1));
  rel.opinion=15+T.goodwillPer-1; s.routes.forEach(x=>x.active=false); r.active=true; r.nextAt=s.time+1e9; run(s,600);
  ok('goodwill holds opinion above baseline', rel.opinion>=15+T.goodwillPer-1.5, rel.opinion.toFixed(1));
  r.nextAt=s.time;
  rel.status='neutral'; ok('AI hostility toward the player lowered by routes', G.hostility(s,'a1','p')<orig(s,'a1','p'), G.hostility(s,'a1','p').toFixed(2)+' vs '+orig(s,'a1','p').toFixed(2)); rel.status='peace';
  // breaking a route offends
  const op1=rel.opinion; G.cancelRoute(s,r.id,'',true); ok('breaking a foreign route lowers opinion', rel.opinion<=op1-T.breakPenalty+0.01 && !G.routeById(s,r.id));
}

// ---- war cancels routes; city capture cancels routes ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=8; c.res.ore=3000; const a=aiCity(s,'a1');
  const rel=G.rel(s,'a1'); rel.status='neutral'; rel.opinion=30;
  const r=G.createRoute(s,'p',c.id,a.id,{give:{ore:300},takeGood:'timber'});
  run(s,15); ok('caravan on the road', s.moves.some(m=>m.route===r.id));
  rel.status='war'; run(s,20);
  ok('war cancels the route without a breach penalty', !G.routeById(s,r.id) && rel.opinion>=29, 'opinion '+rel.opinion.toFixed(1));
  const mv=s.moves.find(m=>m.route===r.id); let n=0; while(s.moves.some(m=>m.route===r.id) && n++<400) run(s,10);
  ok('caravan in flight turns back home with its cargo', mv && c.res.ore>=2990 , 'ore '+Math.round(c.res.ore));
  const [, b]=twoCities(s,4); c.res.ore=3000;
  const r2=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}});
  b.owner='a2'; run(s,20); ok('city changing owner cancels the route', !G.routeById(s,r2.id));
}

// ---- ambushes near camps; escorts reduce losses ----
{ const trial=(escort,N)=>{ let lost=0, amb=0, sent=0;
    for(let i=0;i<N;i++){
      const s=fresh(); const [c,b]=twoCities(s,8); const u=DATA.races.hearth.units[0];
      c.units[u]=200; c.res.ore=100000;
      // a tier-3 camp right on the road
      const mid=G.tileAt(s,Math.round((c.x+b.x)/2),Math.round((c.y+b.y)/2)); const camp={id:'kX',x:mid.x,y:mid.y,tier:3,units:{brigand:3*3*6+4},loot:{}};
      s.camps.kX=camp; mid.camp='kX';
      const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:1000},every:5,escort:escort?{[u]:escort}:null});
      if(i===0) G.__lastRisk=G.routeRisk(s,r);
      run(s,60*60);
      amb+=s.reports.filter(x=>/ambushed/.test(x.title)).length; lost+=r.lost; sent+=r.trips*1000;
    }
    return {amb, lost, share: lost/Math.max(1,sent)};
  };
  const bare=trial(0,4), guarded=trial(60,4);
  ok('ambushes happen near camps', bare.amb>=3, 'ambushes '+bare.amb+' lost '+bare.lost+' share '+(bare.share*100).toFixed(1)+'%');
  ok('escort reduces losses', guarded.lost<bare.lost*0.5, 'bare '+bare.lost+' vs escorted '+guarded.lost);
  ok('routeRisk sees the camp', G.__lastRisk.chance>0.2 && G.__lastRisk.camps.length===1, (G.__lastRisk.chance*100).toFixed(0)+'%');
  const s=fresh(); const [c,b]=twoCities(s,4); const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:100}});
  ok('no camps, no risk', G.routeRisk(s,r).chance===0);
  // deterministic ambush: escort fights with G.battle and the camp loses brigands; stolen goods go to the camp
  const camp={id:'kY',x:c.x,y:c.y,tier:2,units:{brigand:28},loot:{}};
  const m={id:'mm',owner:'p',type:'trade',route:r.id,leg:'out',from:c.id,fx:c.x,fy:c.y,x:b.x,y:b.y,units:{militia:80},cargo:{ore:500},depart:s.time,arrive:s.time+100};
  const res=G.routeAmbush(s,m,{camp});
  ok('escort holds: small loss, brigands killed, loot to camp', res.held && m.cargo.ore===450 && camp.units.brigand<28 && camp.loot.ore===50, JSON.stringify(m.cargo)+' brigands '+camp.units.brigand);
  ok('ambush writes a report', s.reports.some(x=>/ambushed/.test(x.title)));
  // hostile armies can strike too
  const rel=G.rel(s,'a1'); rel.status='war';
  const army={id:'mA',owner:'a1',type:'raid',from:G.capital(s,'a1').id,fx:c.x,fy:c.y,x:c.x,y:c.y,units:{axeguard:30},cargo:{},depart:s.time-10,arrive:s.time+1000};
  s.moves.push(army);
  const r2=G.routeRisk(s,{owner:'p',from:c.id,to:{id:b.id},foreign:false});
  ok('hostile army near the road counts as risk', r2.armies===1 && r2.chance>0, JSON.stringify(r2));
}

// ---- AI: proposals, internal routes, AI-to-AI trade ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=4; for(const g of ['grain','timber','stone','ore']) c.res[g]=G.storageCap(s,c)*0.5; aiCity(s,'a1');
  const rel=G.rel(s,'a1'); rel.status='peace'; rel.opinion=40;
  const T0=T.propose; T.propose=0.01; run(s,30); T.propose=T0;
  const p=(s.pending||[]).find(x=>x.kind==='tradeRoute');
  ok('friendly AI proposes a route', !!p, p&&p.text);
  if(p){ ok('accepting opens a player route', G.resolvePending(s,p.id,'accept')===null && G.routesWith(s,'p','a1').length===1); }
  rel.opinion=-30; s.pending=[]; T.propose=0.01; run(s,30); T.propose=T0;
  ok('hostile AI does not propose', !(s.pending||[]).some(x=>x.kind==='tradeRoute' && x.data.ai!=='a1' && G.rel(s,x.data.ai).opinion<T.proposeOpinion));
}
{ const s=fresh(); const emp=s.empires.a1; const a=G.capital(s,'a1'); a.buildings.market=2; a.res.ore=G.storageCap(s,a)*0.9;
  const t=G.freeTile(s,x=>G.dist(x,a)>=4&&G.dist(x,a)<=6); const b=G.foundCity(s,'a1',t.x,t.y); b.res.ore=0;
  for(let i=0;i<3;i++) for(const h of G.aiHooks) h(s,emp,1);
  const r=G.routes(s).find(x=>x.owner==='a1' && !x.foreign);
  ok('AI opens an internal route from surplus to deficit', r && r.from===a.id && r.to.id===b.id, r&&JSON.stringify(r.goods));
  run(s,600); ok('AI internal route delivers', r && r.trips>=1 && b.res.ore>0, 'ore '+Math.round(b.res.ore));
}
{ const s=fresh(); for(const id of ['a1','a2']) aiCity(s,id);
  const A=s.empires.a1, B=s.empires.a2; const g0=A.gold+B.gold;
  const o=T.aiOpen; T.aiOpen=0.01; run(s,30); T.aiOpen=o;
  ok('AI realms open abstract routes', G.aiTradesWith(s,'a1','a2'));
  G.aiRel(s,'a1','a2').status='neutral'; const inc0=(A.tradeIncome||0); run(s,600);
  ok('AI-AI routes pay gold to both', (A.tradeIncome||0)>inc0 && (B.tradeIncome||0)>0, (A.tradeIncome||0).toFixed(0)+' / '+(B.tradeIncome||0).toFixed(0));
  ok('trading partners are less hostile', G.hostility(s,'a1','a2')<orig(s,'a1','a2') || orig(s,'a1','a2')===0, G.hostility(s,'a1','a2').toFixed(2)+' vs '+orig(s,'a1','a2').toFixed(2));
  G.aiRel(s,'a1','a2').status='war'; G.aiRel(s,'a1','a2').since=s.time-100; run(s,20);
  ok('AI-AI war ends their route', !G.aiTradesWith(s,'a1','a2'));
}

// ---- save / load ----
{ const s=fresh(); const [c,b]=twoCities(s,4); const a=aiCity(s,'a1'); G.rel(s,'a1').opinion=20;
  const r=G.createRoute(s,'p',c.id,b.id,{give:{ore:200},every:5,escort:{militia:5}}); c.units.militia=10;
  const f=G.createRoute(s,'p',c.id,a.id,{give:{ore:200},takeGood:'timber'});
  run(s,20); r.trips=7;
  G.save(s); const s2=G.load();
  const r2=G.routeById(s2,r.id);
  ok('save/load keeps routes, escorts and caravans', r2 && r2.trips===7 && r2.escort.militia===5 && G.routeById(s2,f.id) && s2.moves.some(m=>m.route===r.id));
  run(s2,1200); ok('loaded game keeps trading', G.routeById(s2,r.id).trips>7);
  const old=JSON.parse(G.serialize(s)); delete old.routes; delete old.aiRoutes; old.moves=old.moves.filter(m=>!m.route);
  const s3=G.deserialize(JSON.stringify(old)); run(s3,300); ok('old saves without routes load and run', Array.isArray(s3.routes) && G.routes(s3).length===0);
}
console.log(fails?fails+' FAILED':'all trade route checks passed');
if(fails) process.exitCode=1;
`);
