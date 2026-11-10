// Living market prices: supply and demand, shocks, trade impact, regional prices, reactions, limits, saves, clamps, speed.
// node tests/prices.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/cli.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; };
const P=G.PRICES; P.noise=0;
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); G.advance(s,30,10); return s; };
const near=(s,c,lo=4,hi=7)=>G.freeTile(s,x=>G.dist(x,c)>=lo&&G.dist(x,c)<=hi&&G.landReachable(s,c,x));
const found=(s,owner,c,name)=>{ const t=near(s,c,4,8); return G.foundCity(s,owner,t.x,t.y,name); };
const PT=s=>G.pace(s).time;
const tick=(s,mins)=>{ for(let i=0;i<mins;i++){ s.time+=60; G.priceTick(s,1); } };    // price clock only (no economy)
const flat=(s,g)=>{ const p=G.prices(s); p.x[g]=0; delete p.imp[g]; p.vel[g]=0; delete p.sh[g]; p.li={}; };
const withSeason=(s,i,fn)=>{ const len=7200*PT(s); s.time=Math.floor(s.time/(len*4))*len*4+len*(i+0.1); return fn(); };

// ---- state is created lazily and is compact ----
{ const s=fresh(); const p=G.prices(s);
  ok('a new game has a price state', !!s.prices && p.v===1 && typeof p.lim==='object');
  tick(s,5);
  ok('every good has a world price near 1 at the start', DATA.goodOrder.filter(g=>DATA.goods[g]).every(g=>{ const w=G.worldPrice(s,g); return w>0.8&&w<1.25; }), DATA.goodOrder.map(g=>g+':'+G.worldPrice(s,g).toFixed(2)).join(' '));
  ok('the saved price state stays small', JSON.stringify(s.prices).length<6000, JSON.stringify(s.prices).length+' bytes');
}

// ---- equilibrium follows supply and demand ----
{ const s=fresh(); G.advance(s,600,60); tick(s,3);
  const g='stone', cities=G.allCities(s);
  const base=G.prices(s).eq[g];
  for(const c of cities) c.res[g]=G.storageCap(s,c);          // a glut: every storehouse full of stone
  G.priceSample(s); flat(s,g); tick(s,1); const glutEq=G.prices(s).eq[g];
  tick(s,90); const glutP=G.worldPrice(s,g);
  ok('a glut lowers the equilibrium', glutEq<base-0.1, base.toFixed(2)+' -> '+glutEq.toFixed(2));
  ok('…and the price follows it down', glutP<0.88, glutP.toFixed(2));
  ok('why: the price names the full storehouses', G.priceWhy(s,g).some(y=>/full storehouses/.test(y.text)), JSON.stringify(G.priceWhy(s,g)));
  for(const c of cities) c.res[g]=0;                           // scarcity: every storehouse empty
  G.priceSample(s); flat(s,g); tick(s,1); const scEq=G.prices(s).eq[g];
  tick(s,90); const scP=G.worldPrice(s,g);
  ok('scarcity raises the equilibrium', scEq>base+0.1, base.toFixed(2)+' -> '+scEq.toFixed(2));
  ok('…and the price follows it up', scP>1.2, scP.toFixed(2));
  ok('the world price has momentum (it does not jump to the target at once)', (()=>{ for(const c of cities) c.res[g]=G.storageCap(s,c); G.priceSample(s); const a=G.worldPrice(s,g); tick(s,2); const b=G.worldPrice(s,g); return b<a && b>a*0.8; })());
}

// ---- trades move prices, with impact, quoted = executed, then recover ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=5; c.buildings.warehouse=8; G.advance(s,120,20); tick(s,2);
  const g='timber', cap=G.storageCap(s,c); flat(s,g); c.res[g]=cap*0.6; G.priceSample(s);
  s.empires.p.gold=1e6;
  const r0=G.marketRates(s,c,g);
  const n=Math.floor(cap*0.25);
  const q=G.priceQuote(s,c,g,n,'sell');
  const gold0=s.empires.p.gold;
  ok('selling works', G.trade(s,c.id,g,n,'sell')===null);
  ok('the quoted average equals what the sale paid', Math.abs((s.empires.p.gold-gold0)-q.total)<1e-6, q.total.toFixed(2)+' vs '+(s.empires.p.gold-gold0).toFixed(2));
  ok('a sale is priced below the starting rate (impact along the trade)', q.each<r0.sell, q.each.toFixed(3)+' < '+r0.sell.toFixed(3));
  const r1=G.marketRates(s,c,g);
  ok('selling lowers the price in that city', r1.sell<r0.sell*0.97, r0.sell.toFixed(3)+' -> '+r1.sell.toFixed(3));
  ok('…and the world price', G.worldPrice(s,g)<1, G.worldPrice(s,g).toFixed(3));
  ok('why: the price remembers your sale', G.priceWhy(s,g).some(y=>/you sold/.test(y.text)), JSON.stringify(G.priceWhy(s,g).map(y=>y.text)));
  // one huge sale pays less per unit than a small one
  const small=G.priceQuote(s,c,g,50,'sell').each, big=G.priceQuote(s,c,g,Math.floor(c.res[g]),'sell').each;
  ok('one huge sale is priced worse than small ones', big<small*0.95, small.toFixed(3)+' vs '+big.toFixed(3));
  // recovery
  c.res[g]=cap*0.6; G.priceSample(s);
  tick(s,150);
  const r2=G.marketRates(s,c,g);
  const p=G.prices(s);
  ok('the impact fades: the market recovers', Math.abs(p.imp[g]||0)<0.03 && !((p.li||{})[c.id]||{})[g] && r2.sell>r1.sell*1.4, 'imp '+(p.imp[g]||0)+' sell '+r1.sell.toFixed(3)+' -> '+r2.sell.toFixed(3)+' (before the sale '+r0.sell.toFixed(3)+')');
  // buying raises
  c.res[g]=cap*0.3; const qb=G.priceQuote(s,c,g,n,'buy'), g1=s.empires.p.gold;
  const b0=G.marketRates(s,c,g).buy;
  ok('buying works', G.trade(s,c.id,g,n,'buy')===null);
  ok('the quoted average equals what the purchase cost', Math.abs((g1-s.empires.p.gold)-qb.total)<1e-6, qb.total.toFixed(2)+' vs '+(g1-s.empires.p.gold).toFixed(2));
  ok('buying raises the price', G.marketRates(s,c,g).buy>b0*1.03, b0.toFixed(3)+' -> '+G.marketRates(s,c,g).buy.toFixed(3));
  // no money machine: buying then selling the same lot at once loses gold
  const g2=s.empires.p.gold; c.res[g]=cap*0.4;
  G.trade(s,c.id,g,500,'buy'); G.trade(s,c.id,g,500,'sell');
  ok('buying and selling back at once loses gold (no money machine)', s.empires.p.gold<g2, (s.empires.p.gold-g2).toFixed(1));
}

// ---- seasons ----
{ const s=fresh(); G.advance(s,120,20); const g='grain';
  const run=i=>withSeason(s,i,()=>{ flat(s,g); G.prices(s).ref={}; tick(s,1); G.prices(s).ref={}; G.priceSample(s); tick(s,1); for(let k=0;k<60;k++){ s.time+=60; G.priceTick(s,1); } return G.worldPrice(s,g); });
  const winter=run(3), autumn=run(2);
  ok('grain is dearer in winter than after the harvest', winter>autumn*1.3, 'winter '+winter.toFixed(2)+' autumn '+autumn.toFixed(2));
  ok('why: winter demand is named', withSeason(s,3,()=>{ tick(s,2); return G.priceWhy(s,g).some(y=>/winter demand/.test(y.text)); }));
  const tw=withSeason(s,3,()=>{ tick(s,30); return (G.prices(s).sh.timber||{}).season; });
  ok('firewood (timber) is dearer in winter too', tw && tw[0]>0.1, JSON.stringify(tw));
}

// ---- war raises weapons ----
{ const s=fresh(); G.advance(s,120,20); tick(s,2); const g='weapons';
  flat(s,g); tick(s,120); const peace=G.worldPrice(s,g);
  const ids=Object.keys(s.empires).filter(id=>id!=='p');
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) G.aiRel(s,ids[i],ids[j]).status='war';
  tick(s,120); const war=G.worldPrice(s,g);
  ok('wars raise the price of weapons', war>peace*1.25, peace.toFixed(2)+' -> '+war.toFixed(2));
  ok('…and of iron', ((G.prices(s).sh.iron||{}).war||[0])[0]>0.1);
  ok('why: the wars are named after the realm that fights most', G.priceWhy(s,g).some(y=>/ wars$/.test(y.text)), JSON.stringify(G.priceWhy(s,g).map(y=>y.text)));
}

// ---- calamities and famine raise grain ----
{ const s=fresh(); G.advance(s,120,20); const g='grain'; const c=G.capital(s,'p');
  s.calamities=[{ id:'k1', kind:'blight', x:c.x, y:c.y, r:3, start:s.time-10, end:s.time+1e6 },{ id:'k2', kind:'flood', x:c.x, y:c.y, r:3, start:s.time-10, end:s.time+1e6 }];
  tick(s,1);
  ok('blights and floods raise grain', ((G.prices(s).sh.grain||{}).calamity||[0])[0]>0.1, JSON.stringify(G.prices(s).sh.grain));
  for(const x of G.allCities(s)) x.starving=true; tick(s,1);
  ok('famine raises grain', ((G.prices(s).sh.grain||{}).famine||[0])[0]>0.2);
  s.crisis={ kind:'winter', status:'active', stage:1 }; tick(s,1);
  ok('the crisis raises what it threatens (the Long Winter: timber, weapons)', ((G.prices(s).sh.timber||{}).crisis||[0])[0]>0.2 && ((G.prices(s).sh.weapons||{}).crisis||[0])[0]>0.1 && /Long Winter/.test(((G.prices(s).sh.timber||{}).crisis||[])[1]), JSON.stringify(G.prices(s).sh.timber));
  delete s.crisis;
}

// ---- regional prices and an arbitrage by caravan ----
{ const s=fresh(); const a=G.capital(s,'p'); s.empires.p.renownBonus=5000;
  const b=found(s,'p',a,'Farmarket'); const g='stone';
  for(const c of [a,b]){ c.buildings.market=20; c.buildings.warehouse=6; c.buildings.townhall=Math.max(c.buildings.townhall||0,10); c.pop=Math.max(c.pop,60); }
  G.advance(s,60,20);
  const capA=G.storageCap(s,a), capB=G.storageCap(s,b);
  a.res[g]=capA; b.res[g]=0; G.priceSample(s); flat(s,g); tick(s,1); G.priceSample(s);
  const la=G.localPrice(s,a,g), lb=G.localPrice(s,b,g);
  ok('a full city pays less than an empty one (regional prices)', la<lb*0.85, la.toFixed(2)+' vs '+lb.toFixed(2));
  const best=G.bestMarkets(s,'p',g,'sell',2), cheap=G.bestMarkets(s,'p',g,'buy',1)[0];
  ok('best market: sell where it is dear, buy where it is cheap', best[0].id===b.id && cheap.id===a.id, best.map(x=>x.name).join(',')+' / '+cheap.name);
  s.empires.p.gold=1e5; const g0=s.empires.p.gold;
  const n=Math.min(G.caravanCap(s,a), 800);
  a.res[g]=capA-n;  // room to buy
  ok('buy cheap here', G.trade(s,a.id,g,n,'buy')===null);
  const err=G.sendArmy(s,a.id,b.x,b.y,'trade',{},{[g]:n});
  ok('the caravan leaves', !err, err);
  const m=s.moves.find(x=>x.type==='trade'&&x.owner==='p');
  // let it arrive (economy and prices keep running), then sell there
  if(m){ const before=b.res[g]||0; G.advance(s,m.arrive-s.time+5,200); ok('the caravan delivers', (b.res[g]||0)>=before+n*0.99, (b.res[g]||0)+' vs '+(before+n)); }
  const got=Math.floor(Math.min(n,b.res[g]||0));
  ok('sell dear there', G.trade(s,b.id,g,got,'sell')===null);
  ok('the round trip made a profit', s.empires.p.gold>g0, (s.empires.p.gold-g0).toFixed(1)+' gold');
  ok('free cities have prices too (merchant caravans are paid at them)', G.minorsList(s).every(mi=>{ const v=G.localPrice(s,mi,'grain'); return v>=P.min&&v<=P.max; }));
  const mi=G.minorsList(s).find(x=>x.kind==='merchant');
  if(mi){ const q=G.minorRouteQuote(s,a,mi,{stone:500}); mi.stores.stone=0; G.priceSample(s); const q2=G.minorRouteQuote(s,a,mi,{stone:500}); ok('a merchant republic pays by the goods\\' worth at its prices', q2.goodsPay===Math.round(G.priceValue(s,mi,{stone:500})*G.TRADE.minorGoodsPay) && q2.goodsPay>0, q.goodsPay+' / '+q2.goodsPay); }
}

// ---- the AI and governors avoid buying at spikes ----
{ const s=fresh(); const ai=Object.values(s.empires).find(e=>e.id!=='p'); const c=G.capital(s,ai.id); c.buildings.market=5; ai.gold=1e5;
  G.advance(s,60,20); const g='timber', cap=G.storageCap(s,c);
  c.res[g]=cap*0.06; flat(s,g); G.prices(s).x[g]=Math.log(2.4);
  ok('an AI realm will not buy at a spike', typeof G.trade(s,c.id,g,100,'buy')==='string');
  c.res[g]=cap*0.01; G.prices(s).x[g]=Math.log(1.9/G.localFactor(s,c,g));
  ok('…unless it has almost nothing left (then up to the urgent ceiling)', G.trade(s,c.id,g,50,'buy')===null);
  G.prices(s).x[g]=0; c.res[g]=cap*0.06;
  ok('at a normal price it buys', G.trade(s,c.id,g,100,'buy')===null);
  G.prices(s).x[g]=Math.log(1.8); c.res[g]=cap*0.8; G.priceSample(s);
  const lp=G.localPrice(s,c,g), r0=c.res[g]; ai.pxAt=0;
  for(const h of G.aiHooks) h(s,ai,1);
  ok('an AI realm sells spare goods into a spike', c.res[g]<r0 || lp<P.spikeSell, 'local '+lp.toFixed(2)+' '+Math.round(r0)+' -> '+Math.round(c.res[g]));
  G.prices(s).x[g]=Math.log(0.4); c.res[g]=cap*0.5;
  ok('an AI realm will not dump at a slump', typeof G.trade(s,c.id,g,100,'sell')==='string');
  // governors
  const pc=G.capital(s,'p'); pc.buildings.market=5; s.empires.p.gold=1e5;
  G.setGovernor(s,pc.id,{focus:'balanced',realm:false});
  G.advance(s,30,10);
  const gd='tools'; pc.short=pc.short||{}; pc.short[gd]=1; pc.res[gd]=2; pc.buildings.smithy=pc.buildings.smithy||1;
  flat(s,gd); G.prices(s).x[gd]=Math.log(2.5);
  const t0=pc.res[gd]; G.councilGovern(s);
  ok('a governor does not buy upkeep goods at a spike', (pc.res[gd]||0)<=t0+1e-9, t0+' -> '+pc.res[gd]);
  G.prices(s).x[gd]=0; pc.short[gd]=1; const t1=pc.res[gd]; G.councilGovern(s);
  ok('…but does at a normal price', (pc.res[gd]||0)>t1, t1+' -> '+pc.res[gd]);
  const gg='stone', capP=G.storageCap(s,pc); pc.res[gg]=capP*0.8; flat(s,gg); G.priceSample(s); G.prices(s).x[gg]=Math.log(1.9/G.localFactor(s,pc,gg));
  const gv=s.council.gov[pc.id]; gv.pxAt=0;
  const e=G.econLean(s,pc);
  const s0=pc.res[gg]; G.councilGovern(s);
  ok('a governor sells spare goods into a spike', !(e.net[gg]>0) || pc.res[gg]<s0, Math.round(s0)+' -> '+Math.round(pc.res[gg])+' net '+e.net[gg].toFixed(1));
  ok('…and says so in its log', !(e.net[gg]>0) || (gv.log||[]).some(l=>/into high prices/.test(l.text)));
}

// ---- automation and logistics respect the price ceiling / floor ----
{ const s=fresh(); const a=G.capital(s,'p'); s.empires.p.renownBonus=5000; const b=found(s,'p',a,'Second');
  for(const c of [a,b]){ c.buildings.market=5; }
  G.advance(s,60,20); s.empires.p.gold=1e5;
  ok('defaults: ceiling 1.5×, floor 0.6×', G.priceLimits(s).buy===1.5 && G.priceLimits(s).sell===0.6);
  ok('limits can be set and are checked', G.setPriceLimits(s,{buy:1.3,sell:0.8})===null && G.priceLimits(s).buy===1.3 && typeof G.setPriceLimits(s,{buy:0.5})==='string');
  ok('supply lines, automation and governors run under the guard', !!(G.supplyRun._priced && G.autoTick._priced && G.autoRun._priced && G.councilGovern._priced));
  const g='timber', cap=G.storageCap(s,a);
  flat(s,g); G.prices(s).x[g]=Math.log(1.6);
  const inside=G.priceGuard({owner:'p',buyMax:G.priceLimits(s).buy,sellMin:G.priceLimits(s).sell},()=>{ a.res[g]=cap*0.3; return G.trade(s,a.id,g,100,'buy'); });
  ok('under the guard a buy above the ceiling is refused', typeof inside==='string' && /ceiling/.test(inside), inside);
  ok('the player buying by hand is not limited', (a.res[g]=cap*0.3, G.trade(s,a.id,g,100,'buy'))===null);
  // logistics: auto-sell holds off below the floor
  const o=G.logistics(s,'p'); o.on=true; o.sell=true; o.buy=false; o.reserve=0;
  const sg='stone'; flat(s,sg); G.prices(s).x[sg]=Math.log(0.5);
  for(const c of [a,b]) c.res[sg]=G.storageCap(s,c)*0.94;
  G.priceSample(s);
  const e=G.econ(s,a); const before=a.res[sg];
  G.supplyRun(s,'p');
  ok('auto-sell waits while the price is below the floor', a.res[sg]>=before-1e-6, Math.round(before)+' -> '+Math.round(a.res[sg]));
  a.res[sg]=G.storageCap(s,a)*0.94; G.priceSample(s); G.prices(s).x[sg]=Math.log(1/G.localFactor(s,a,sg));
  const lp=G.localPrice(s,a,sg); G.supplyRun(s,'p');
  ok('…and sells at a fair price', !(e.net[sg]>0) || a.res[sg]<G.storageCap(s,a)*0.93, 'local '+lp.toFixed(2)+' net '+(e.net[sg]||0).toFixed(1)+' res '+Math.round(a.res[sg]));
  // a spilling city still sells (goods would be lost anyway)
  G.prices(s).x[sg]=Math.log(0.5); a.res[sg]=G.storageCap(s,a)*0.99;
  ok('a spilling city sells even below the floor', G.priceGuard({owner:'p',buyMax:1.5,sellMin:0.75},()=>G.trade(s,a.id,sg,100,'sell'))===null);
}

// ---- trade routes follow prices ----
{ const s=fresh(); const a=G.capital(s,'p'); a.buildings.market=5; G.advance(s,60,20);
  const foe=Object.values(s.cities).find(c=>c.owner!=='p'); foe.buildings.market=foe.buildings.market||3;
  flat(s,'iron'); flat(s,'grain');
  const q1=G.routeQuote(s,a,foe,'grain',500,'iron');
  G.prices(s).x.iron=Math.log(2);
  const q2=G.routeQuote(s,a,foe,'grain',500,'iron');
  ok('a foreign route sends less of a good that grew dear', q2.take<q1.take, q1.take+' -> '+q2.take);
}

// ---- an old save loads ----
{ const s=fresh(); G.advance(s,300,30);
  const old=JSON.parse(G.serialize(s)); delete old.prices;
  const s2=G.deserialize(JSON.stringify(old));
  let err=null; try { G.advance(s2,300,30); } catch(e){ err=e; }
  ok('a save from before prices loads and runs', !err && !!s2.prices, err&&err.stack);
  const c=G.capital(s2,'p'); c.buildings.market=3;
  const r=G.marketRates(s2,c,'grain');
  ok('…with finite rates', isFinite(r.sell) && isFinite(r.buy) && r.sell>0, JSON.stringify(r));
  const s3=G.deserialize(G.serialize(s2));
  ok('prices survive save/load', JSON.stringify(s3.prices.x)===JSON.stringify(s2.prices.x));
  const s4=JSON.parse(G.serialize(s)); s4.prices={x:{grain:'junk'},h:5};
  let e4=null; try { const t=G.deserialize(JSON.stringify(s4)); G.advance(t,60,10); ok('a damaged price state repairs itself', isFinite(G.worldPrice(t,'grain'))); } catch(e){ e4=e; ok('a damaged price state repairs itself', false, e.stack); }
}

// ---- clamps ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=5; G.advance(s,60,20);
  const p=G.prices(s); p.x.iron=5; p.imp.iron=0.8;
  ok('world price is clamped to 3×', G.worldPrice(s,'iron')<=P.max+1e-9);
  tick(s,1); ok('the stored price is clamped too', p.x.iron<=Math.log(P.max)+1e-3);
  p.x.grain=-5; ok('…and to 0.3× below', G.worldPrice(s,'grain')>=P.min-1e-9 && G.localPrice(s,c,'grain')>=P.min-1e-9);
  c.res.grain=G.storageCap(s,c); const q=G.priceQuote(s,c,'grain',Math.floor(c.res.grain),'sell');
  ok('a giant dump never prices below the floor', q.mEnd>=P.min-1e-9 && q.each>0);
  ok('local factors stay within their band', G.allCities(s).every(x=>DATA.goodOrder.every(g=>{ const f=G.localFactor(s,x,g); return f>=P.loc.min-1e-9&&f<=P.loc.max+1e-9; })));
}

// ---- console ----
{ const s=fresh(); G.advance(s,600,60); G.priceRegisterCli();
  const r=G.cli.exec(s,'p','prices',{});
  ok('console: prices lists every good', r.ok!==false && (r.out||[]).length>=9, (r.out||[r.err]).slice(0,3).join(' | '));
  const r2=G.cli.exec(s,'p','prices grain',{});
  ok('console: prices grain explains and names markets', r2.ok!==false && /Grain: world/.test((r2.out||[]).join('\\n')), (r2.out||[r2.err]).join(' | '));
  const r3=G.cli.exec(s,'p','pricelimit 1.6 0.7',{});
  ok('console: pricelimit sets the ceiling and floor', r3.ok!==false && G.priceLimits(s).buy===1.6 && G.priceLimits(s).sell===0.7);
  ok('console: an unknown good is refused', G.cli.exec(s,'p','prices dragons',{}).ok===false);
}

// ---- gold from markets does not explode ----
{ const s=fresh(); const c=G.capital(s,'p'); c.buildings.market=10; c.buildings.warehouse=10; G.advance(s,60,20);
  const g='grain', cap=G.storageCap(s,c); flat(s,g); G.prices(s).x[g]=Math.log(2.5); G.priceSample(s);
  c.res[g]=cap; const g0=s.empires.p.gold, m0=G.localPrice(s,c,g), r0=G.marketRates(s,c,g).sell;
  for(let i=0;i<10;i++) G.trade(s,c.id,g,Math.floor(cap/10),'sell');
  const per=(s.empires.p.gold-g0)/(Math.floor(cap/10)*10);
  ok('selling a full warehouse into a spike pays well below the spike rate', per<r0*0.8, 'avg '+per.toFixed(3)+' vs spike '+r0.toFixed(3)+' (×'+m0.toFixed(2)+')');
}

// ---- performance ----
{ const s=G.newGame({name:'T',race:'hearth'}); G.autoPreset && G.autoPreset(s,'delegate'); G.advance(s,3600*4,1500);
  const n=G.allCities(s).length; let t=process.hrtime.bigint();
  for(let i=0;i<200;i++){ s.time+=10; G.priceTick(s,10/60); }
  const per=Number(process.hrtime.bigint()-t)/1e6/200;
  t=process.hrtime.bigint(); for(let i=0;i<50;i++) G.priceSample(s); const smp=Number(process.hrtime.bigint()-t)/1e6/50;
  t=process.hrtime.bigint(); const c=G.capital(s,'p'); for(let i=0;i<2000;i++) G.marketRates(s,c,DATA.goodOrder[i%9]); const mr=Number(process.hrtime.bigint()-t)/1e6/2000;
  ok('the price slow hook costs under 1 ms', per<1, per.toFixed(3)+' ms per tick, sample '+smp.toFixed(3)+' ms, '+n+' cities; marketRates '+(mr*1000).toFixed(1)+' µs');
}

console.log(fails?fails+' FAILED':'ALL PASS');
if(fails) process.exitCode=1;
`);
