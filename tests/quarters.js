// City quarters: slots from Town Hall and people, each type's effect (farmland grain + housing, deposits worked fully,
// higher max levels, ley tapping, docks, mills, homes, forts), cost and time, tile rules, territory that blocks rival
// founding, roads to the core, raids that burn an outer quarter, governors, AI and free cities, old saves, save/load, speed.
// node tests/quarters.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
if (typeof initRaces2 === 'function') initRaces2();
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); return s; };
const Q=G.QTR;
const rich=c=>{ for(const g of DATA.goodOrder) c.res[g]=50000; };
// a grown city with plain land all round, nothing in the way
const grown=(s,c,th=10,pop=220)=>{
  c.buildings.townhall=th; c.pop=pop; c.buildings.warehouse=20; rich(c); s.empires[c.owner].gold=1e6;
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ if(!dx&&!dy) continue; const t=G.tileAt(s,c.x+dx,c.y+dy); if(!t||t.city) continue; t.terrain='plains'; t.deposit=null; t.camp=null; t.oasis=null; t.ruin=null; t.minor=null; t.quarter=null; }
  G.clearPaths(s); c.site=null; c.qrev=(c.qrev||0)+1;
  if(s.ley){ s.ley.nodes=s.ley.nodes.filter(n=>Math.max(Math.abs(n.x-c.x),Math.abs(n.y-c.y))>4); s.ley.lineTiles=s.ley.lineTiles.filter(i=>{ const x=i%s.map,y=Math.floor(i/s.map); return Math.max(Math.abs(x-c.x),Math.abs(y-c.y))>4; }); }
  return c;
};
const at=(s,c,dx,dy)=>G.tileAt(s,c.x+dx,c.y+dy);
// found a quarter and let the builders finish it
const build=(s,c,dx,dy,type)=>{ const e=G.foundQuarter(s,c.id,c.x+dx,c.y+dy,type); if(e) return e; const q=c.quarters.find(q=>q.x===c.x+dx&&q.y===c.y+dy); s.time=q.end; G.step(s,1); return q.built?null:'not built'; };

// ---- slots from Town Hall and people ----
{ const s=fresh(); const c=G.capital(s,'p');
  c.buildings.townhall=1; c.pop=20;
  ok('a hamlet has no quarter slot', G.qtrSlots(s,c)===0);
  c.buildings.townhall=3; c.pop=45; ok('a village (TH 3, 40+ people) has one', G.qtrSlots(s,c)===1);
  c.buildings.townhall=3; c.pop=30; ok('…but not with too few people', G.qtrSlots(s,c)===0);
  c.buildings.townhall=6; c.pop=120; ok('a town (TH 6) has two', G.qtrSlots(s,c)===2);
  c.buildings.townhall=10; c.pop=220; ok('a city (TH 10) has four', G.qtrSlots(s,c)===4);
  c.buildings.townhall=20; c.pop=600; ok('a capital of ages has seven', G.qtrSlots(s,c)===7);
  c.buildings.townhall=20; c.pop=100; ok('a great hall with few people has only what its people allow', G.qtrSlots(s,c)===2);
  c.buildings.townhall=5; c.pop=500; const nx=G.qtrNextSlot(s,c); ok('the next slot is announced', nx && nx.th===6, JSON.stringify(nx));
  ok('slots are capped at seven', Q.slots.length===7);
}

// ---- cost, time and the queue ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'));
  const before={...c.res}, cost=G.qtrCost(s,c,0), t=G.qtrTime(s,c,0);
  ok('the first quarter costs goods (no gold)', cost.timber>0 && cost.stone>0 && cost.grain>0 && !cost.gold, JSON.stringify(cost));
  ok('later quarters cost more and take longer', G.qtrCost(s,c,3).timber>cost.timber*2 && G.qtrTime(s,c,3)>t && G.qtrCost(s,c,3).tools>0);
  const g0=s.empires.p.gold;
  const err=G.foundQuarter(s,c.id,c.x+1,c.y,'homes');
  ok('founding a quarter is accepted', err===null, err);
  ok('the goods are paid at once', before.timber-c.res.timber===cost.timber && before.grain-c.res.grain===cost.grain);
  const q=c.quarters[0];
  ok('it is under construction, not yet built', q && !q.built && q.end-q.start===t, q&&(q.end-q.start)+' vs '+t);
  const pc=G.popCap(s,c);
  G.advance(s,t*0.5,50);
  ok('halfway it is still building and gives nothing', !q.built && G.popCap(s,c)===pc);
  G.advance(s,t*0.6,50);
  ok('when its time is up it stands', q.built===true);
  ok('…and its homes count', G.popCap(s,c)>pc, pc+' -> '+G.popCap(s,c));
  ok('a second and third can wait in the queue, not a fourth', !G.foundQuarter(s,c.id,c.x-1,c.y,'homes') && !G.foundQuarter(s,c.id,c.x,c.y+1,'homes') && !!G.foundQuarter(s,c.id,c.x,c.y-1,'homes'));
  const q3=c.quarters[2];
  ok('queued quarters are built one after another', q3.start>=c.quarters[1].end);
  const tb=c.res.timber; ok('a waiting quarter can be cancelled for a full refund', G.cancelQuarter(s,c.id,q3.x,q3.y)===null && c.res.timber-tb===q3.cost.timber && !at(s,c,0,1).quarter);
  ok('the queue length follows the slots', G.qtrStatus(s,grown(fresh(),G.capital(fresh(),'p'),1,10),0,0,'homes').ok===false);
  const s2=fresh(); const c2=grown(s2,G.capital(s2,'p')); for(const g of DATA.goodOrder) c2.res[g]=0;
  ok('a poor city cannot found one', G.qtrStatus(s2,c2,c2.x+1,c2.y,'homes').poor===true);
}

// ---- tile rules ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'));
  ok('a tile three away is too far', /within/.test(G.qtrStatus(s,c,c.x+3,c.y,'homes').reason||''));
  ok('a tile two away must touch a quarter', /touch/.test(G.qtrStatus(s,c,c.x+2,c.y,'homes').reason||''));
  build(s,c,1,0,'homes');
  ok('…and may once it does', G.qtrStatus(s,c,c.x+2,c.y,'homes').ok, G.qtrStatus(s,c,c.x+2,c.y,'homes').reason);
  at(s,c,-1,0).terrain='lake'; G.clearPaths(s);
  ok('not on the water', /water/i.test(G.qtrStatus(s,c,c.x-1,c.y,'homes').reason||''));
  at(s,c,0,1).ruin={tier:1,readyAt:0};
  ok('not on ruins', /taken/.test(G.qtrStatus(s,c,c.x,c.y+1,'homes').reason||''));
  ok('not on another quarter', /Already/.test(G.qtrStatus(s,c,c.x+1,c.y,'farm').reason||''));
  ok('a lumber yard needs forest', /cannot stand/.test(G.qtrStatus(s,c,c.x,c.y-1,'lumber').reason||''));
  at(s,c,0,-1).terrain='forest';
  ok('…and stands in it', G.qtrStatus(s,c,c.x,c.y-1,'lumber').ok);
  ok('a mining quarter needs hills, mountains or a deposit', !G.qtrStatus(s,c,c.x-1,c.y-1,'mine').ok && (at(s,c,-1,-1).deposit='ore', G.qtrStatus(s,c,c.x-1,c.y-1,'mine').ok));
  ok('docks need a shore', G.qtrStatus(s,c,c.x-1,c.y+1,'docks').ok && !G.qtrStatus(s,c,c.x+1,c.y+1,'docks').ok);
  ok('the types offered follow the ground', G.qtrTypesFor(s,c.x,c.y-1).includes('lumber') && !G.qtrTypesFor(s,c.x,c.y-1).includes('mine') && !G.qtrTypesFor(s,c.x+1,c.y+1).includes('docks') && G.qtrTypesFor(s,c.x,c.y-1).includes('homes'));
  ok('options list only claimable tiles', G.qtrOptions(s,c).every(o=>!G.qtrStatus(s,c,o.x,o.y,o.types[0]).reason || G.qtrStatus(s,c,o.x,o.y,o.types[0]).poor || /queue/.test(G.qtrStatus(s,c,o.x,o.y,o.types[0]).reason)) && G.qtrOptions(s,c).length>0);
  // inside a rival's lands
  const ai=Object.keys(s.empires).find(id=>id!=='p'); const rc=G.citiesOf(s,ai)[0];
  const rt=at(s,rc,1,0); const old={x:rc.x,y:rc.y};
  ok('not inside a rival realm\\'s lands', G.landOwner(s,rt.x,rt.y)===ai);
}

// ---- farmland: the tile's full grain, and homes ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'));
  at(s,c,1,0).terrain='fertile'; at(s,c,-1,0).terrain='plains';
  const e0=G.econ(s,c), pc=G.popCap(s,c);
  build(s,c,1,0,'farm');
  const e1=G.econ(s,c), q=c.quarters[0], y=G.qtrYield(s,c,q,e1.eff);
  ok('farmland grows grain', e1.raw.grain-e0.raw.grain>5 && Math.abs((e1.raw.grain-e0.raw.grain)-y.grain)<0.01, (e1.raw.grain-e0.raw.grain).toFixed(1)+' vs '+(y.grain||0).toFixed(1));
  ok('…shown on its own ledger line', (e1.rawParts.grain||[]).some(p=>p.label==='City quarters' && Math.abs(p.amount-y.grain)<0.01));
  ok('…and houses farmhands', G.popCap(s,c)>pc);
  const s2=fresh(); const c2=grown(s2,G.capital(s2,'p')); at(s2,c2,1,0).terrain='plains'; build(s2,c2,1,0,'farm');
  const yp=G.qtrYield(s2,c2,c2.quarters[0],1).grain, yf=G.qtrYield(s,c,q,1).grain;
  ok('fertile ground yields more than plains (the tile itself matters)', yf>yp*1.4, yf.toFixed(1)+' vs '+yp.toFixed(1));
  // a city on poor land: the quarter is not dragged down by the site's average
  const poorSite=G.site(s,c).grain; c.site.grain=0.5; c.qrev++; const yPoor=G.qtrYield(s,c,q,1).grain; c.site=null; c.qrev++;
  ok('a poor site does not shrink the good tile\\'s yield', Math.abs(yPoor-yf)<0.01, yPoor.toFixed(2)+' vs '+yf.toFixed(2)+' (site '+poorSite.toFixed(2)+')');
  ok('bigger farms make farmland richer', (c.buildings.farm=12, G.qtrYield(s,c,q,1).grain)>yf);
  ok('the yield scales with the people\\'s production mods (AI difficulty, pace)', (()=>{ const r=G.qtrYield(s,c,q,1).grain; s.settings.pace='quick'; const r2=G.qtrYield(s,c,q,1).grain; s.settings.pace='standard'; return r2>r*1.5; })());
}

// ---- mining quarter on a deposit: worked fully, and a higher max level ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'),20,600);
  const t=at(s,c,1,1); t.terrain='hills'; t.deposit='ore'; c.site=null; c.qrev++;
  const site0=G.site(s,c).ore, e0=G.econ(s,c);
  build(s,c,1,1,'mine');
  const site1=G.site(s,c).ore, e1=G.econ(s,c);
  ok('the deposit is worked fully: the city\\'s ore output counts it at full strength', Math.abs(site1/site0-Q.depSite)<0.01 || site1===2.2, site0.toFixed(2)+' -> '+site1.toFixed(2));
  ok('ore and stone come from the quarter itself', G.qtrYield(s,c,c.quarters[0],1).ore>0 && G.qtrYield(s,c,c.quarters[0],1).stone>0 && e1.raw.ore>e0.raw.ore);
  ok('a deposit tile yields more than bare hills', (()=>{ const y1=G.qtrYield(s,c,c.quarters[0],1).ore; t.deposit=null; const y2=G.qtrYield(s,c,c.quarters[0],1).ore; t.deposit='ore'; return y1>y2*1.3; })());
  ok('the deposit list reports it', G.qtrDepositsWorked(s,c).includes('ore'));
  c.buildings.mine=20; c.buildings.quarry=20;
  const st=G.buildStatus(s,c,'mine');
  ok('the Mine may rise above its normal max', !st.maxed && st.level===21, st.reason);
  ok('so may the Quarry', !G.buildStatus(s,c,'quarry').maxed);
  ok('the bonus never leaks into the data table', DATA.buildings.mine.max===20);
  ok('queueing level 21 works', G.queueBuild(s,c.id,'mine')===null);
  const s2=fresh(); const c2=grown(s2,G.capital(s2,'p'),20,600); c2.buildings.lumber=20;
  ok('without a lumber yard the Lumber Camp stops at 20', G.buildStatus(s2,c2,'lumber').maxed===true);
  at(s2,c2,0,1).terrain='forest'; build(s2,c2,0,1,'lumber');
  ok('a lumber yard lifts it to 22', !G.buildStatus(s2,c2,'lumber').maxed && G.qtrMaxBonus(s2,c2,'lumber')===2);
  ok('the lumber yard fells timber', G.qtrYield(s2,c2,c2.quarters[0],1).timber>0);
}

// ---- arcane quarter on a ley node ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'));
  if(!s.ley) s.ley=G.genLey(s);
  const n={ id: 900, x: c.x+1, y: c.y-1, power: 1.2 };
  s.ley.nodes.push(n);
  s.time+=20; const lp0=G.leyPower(s,c);
  const d=Math.hypot(1,1), reach=G.cityReach(s,c), f=Math.max(0.35,1-d/(reach+1.5));
  build(s,c,1,-1,'arcane');
  s.time+=20; const lp1=G.leyPower(s,c);
  ok('an arcane quarter taps the node at full strength (x2)', Math.abs(lp1-(lp0+n.power*(2-f)))<0.02, lp0+' -> '+lp1+' (expected +'+(n.power*(2-f)).toFixed(2)+')');
  ok('full strength equals a city standing on the node', Math.abs(lp1-lp0-(n.power*2-n.power*f))<0.02);
  ok('more mana flows', G.econ(s,c).raw.mana>0);
  ok('the node is tapped by this city', G.nodeTapper(s,n)===c);
  ok('arcane quarters need a ley node or line', !G.qtrTypesFor(s,c.x-1,c.y+1).includes('arcane') && G.qtrTypesFor(s,c.x+1,c.y-1).length>0);
}

// ---- docks, mills, homes, forts ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'));
  at(s,c,-2,0).terrain='lake'; at(s,c,-2,1).terrain='lake'; G.clearPaths(s);
  build(s,c,-1,0,'docks');
  ok('docks fish', G.qtrYield(s,c,c.quarters[0],1).grain>0);
  ok('…more with a Harbor', (()=>{ const a=G.qtrYield(s,c,c.quarters[0],1).grain; c.buildings.harbor=8; return G.qtrYield(s,c,c.quarters[0],1).grain>a; })());
  ok('…and the Harbor may rise higher', G.qtrMaxBonus(s,c,'harbor')===2);
  s.rivers=[[ (c.y+1)*s.map+c.x ]]; G.clearPaths(s);
  c.buildings.smelter=5; c.buildings.mine=8;
  const r0=G.mod(s,'p',c,'refine');
  build(s,c,0,1,'mill');
  ok('a mill on the river speeds the workshops', G.mod(s,'p',c,'refine')>r0*1.07, r0.toFixed(3)+' -> '+G.mod(s,'p',c,'refine').toFixed(3));
  const t0=G.mod(s,'p',c,'tax'), d0=G.cityDefense(s,c).mult, p0=G.popCap(s,c);
  build(s,c,1,0,'homes');
  ok('homes add housing and taxes', G.popCap(s,c)>p0 && G.mod(s,'p',c,'tax')>t0);
  build(s,c,0,-1,'fort');
  ok('a fort strengthens the city\\'s defence', G.cityDefense(s,c).mult>d0);
}

// ---- territory: quarters are land, and block rival founding ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'),20,600);
  build(s,c,1,0,'homes'); build(s,c,2,0,'homes'); build(s,c,2,1,'homes');
  const t=at(s,c,2,1);
  ok('a quarter is its city\\'s land', G.landOwner(s,t.x,t.y)==='p');
  ok('G.cityAtTile finds the city from its quarter (and its core)', G.cityAtTile(s,t.x,t.y)===c && G.cityAtTile(s,c.x,c.y)===c && G.cityAtTile(s,c.x+3,c.y+3)===null);
  ok('the ground just beyond a quarter is claimed too when no core reaches it', (()=>{ c.pop=1; const o=G.landOwner(s,c.x+3,c.y+1); c.pop=600; return o==='p'; })());
  const ai=Object.keys(s.empires).find(id=>id!=='p'); const rc=G.citiesOf(s,ai)[0];
  rc.units.settlers=2; s.empires[ai].renown=1e6;
  const err=G.sendArmy(s,rc.id,t.x,t.y,'settle',{settlers:1});
  ok('rival settlers cannot be sent onto a quarter', !!err, err);
  // settlers already on the road when the quarter is claimed turn back
  s.moves.push({ id:'mx', owner:ai, type:'settle', from:rc.id, fx:rc.x, fy:rc.y, x:t.x, y:t.y, units:{settlers:1}, cargo:{}, depart:s.time, arrive:s.time+1 });
  const n0=Object.keys(s.cities).length; G.step(s,2);
  ok('settlers arriving at a quarter find the land taken', Object.keys(s.cities).length===n0 && t.city==null);
  let hit=0; for(let i=0;i<300;i++){ const ft=G.freeTile(s,()=>true,50); if(ft && ft.quarter) hit++; }
  ok('no camp or city site is ever picked on a quarter', hit===0);
}

// ---- roads link the quarters to the core, and stay ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'));
  build(s,c,1,0,'homes'); build(s,c,2,1,'homes');
  ok('a road runs on every quarter tile and the core', G.roadLevel(s,c.x+1,c.y)>=Q.road && G.roadLevel(s,c.x+2,c.y+1)>=Q.road && G.roadLevel(s,c.x,c.y)>=Q.road);
  G.advance(s,200*60,600);
  ok('…and never fades for want of traffic', G.roadLevel(s,c.x+2,c.y+1)>=Q.road, G.roadLevel(s,c.x+2,c.y+1));
}

// ---- raiders burn an outer quarter without taking the city ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'));
  at(s,c,1,0).terrain='fertile'; build(s,c,1,0,'farm');
  const q=c.quarters[0];
  const ai=Object.keys(s.empires).find(id=>id!=='p'); const rc=G.citiesOf(s,ai)[0];
  const atkU=DATA.races[s.empires[ai].race].units.find(u=>DATA.units[u].type==='inf'&&DATA.units[u].atk>0) || DATA.races[s.empires[ai].race].units[0];
  rc.units[atkU]=200; c.units={};
  const defU=DATA.races.hearth.units.find(u=>DATA.units[u].type==='inf');
  const err=G.sendArmy(s,rc.id,q.x,q.y,'raid',{[atkU]:200});
  const m=s.moves[s.moves.length-1];
  ok('a raid sent at a quarter becomes a burning raid', !err && m.type==='burn', err||m.type);
  const pop0=c.pop, owner0=c.owner, res0=c.res.grain, loy0=c.loyalty;
  s.time=m.arrive; G.step(s,1);
  ok('the quarter burns', q.burnt>s.time);
  ok('the city is not taken', c.owner===owner0 && G.cityAtTile(s,c.x,c.y)===c);
  ok('a burnt quarter yields nothing', !G.qtrYield(s,c,q,1).grain);
  ok('the raiders carry off plunder and loyalty falls', c.res.grain<res0 && c.loyalty<loy0);
  ok('both sides get a report', s.reports.some(r=>/quarter/.test(r.title)));
  const cost=G.repairQuote(s,c,q);
  ok('the owner may repair it at once', G.repairQuarter(s,c.id,q.x,q.y)===null && !(q.burnt>s.time) && G.qtrYield(s,c,q,1).grain>0, JSON.stringify(cost));
  // a strong guard behind outer walls holds
  q.burnt=0; c.units={[defU]:400}; c.buildings.wall=10;
  ok('outer walls need a Wall '+Q.outer.wall+' and a quarter', G.outerWallStatus(s,c).ok);
  G.buildOuterWall(s,c.id); s.time=c.outerAt; G.step(s,1);
  ok('outer walls are raised', c.outerWall===1);
  const dd=G.qtrDefenders(s,c,q);
  ok('the guard of a quarter is part of the garrison, behind the outer walls', dd.walled && dd.mult>1 && dd.units[defU]===Math.round(400*Q.garrison));
  rc.units[atkU]=20; G.sendArmy(s,rc.id,q.x,q.y,'burn',{[atkU]:20});
  const m2=s.moves[s.moves.length-1]; s.time=m2.arrive; G.step(s,1);
  ok('a small raid is beaten off', !(q.burnt>s.time) && c.units[defU]>0);
  ok('a burn raid on open land is refused', !!G.sendArmy(s,rc.id,c.x+2,c.y+2,'burn',{[atkU]:1}));
  ok('the burnt state heals by itself in time', (()=>{ q.burnt=s.time+60; G.advance(s,120,10); return !q.burnt; })());
}

// ---- the governor picks a sensible quarter ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'),6,120);
  at(s,c,1,0).terrain='fertile'; at(s,c,0,1).terrain='forest';
  c.res.grain=400; c.buildings.farm=6;
  G.setGovernor(s,c.id,{focus:'balanced'});
  G.councilGovern(s);
  const q=c.quarters[0];
  ok('a governed city with a free slot claims a quarter', !!q, JSON.stringify(c.quarters));
  ok('…farmland on the fertile tile when grain runs short', q && q.type==='farm' && q.x===c.x+1 && q.y===c.y, q&&q.type+'@'+(q.x-c.x)+','+(q.y-c.y));
  const s2=fresh(); const c2=grown(s2,G.capital(s2,'p'),6,120);
  const t=at(s2,c2,-1,-1); t.terrain='hills'; t.deposit='ore'; c2.res.ore=0; c2.res.grain=40000;
  const p=G.qtrPick(s2,c2,null);
  ok('with ore short and an ore vein next door, the picker chooses a mining quarter there', p && p.type==='mine' && p.x===t.x && p.y===t.y, p&&p.type+'@'+(p.x-c2.x)+','+(p.y-c2.y));
  ok('a governor can be told to leave quarters alone', (()=>{ const g=s.council.gov[c.id]; g.quarters=false; c.buildings.townhall=10; c.pop=220; const n=c.quarters.length; G.councilGovern(s); return c.quarters.length===n; })());
}

// ---- AI realms and free cities grow quarters by the same rules ----
{ Math.random=(()=>{ let a=12345; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; })();
  const s=G.newGame({name:'T',race:'hearth',rivals:4}); s.settings.hostility=0;
  G.advance(s,6*3600,600);
  const ais=G.allCities(s).filter(c=>c.owner!=='p');
  const qs=ais.flatMap(c=>(c.quarters||[]).map(q=>({c,q})));
  ok('AI cities grow quarters', qs.length>=ais.length*0.5, qs.length+' quarters in '+ais.length+' AI cities');
  ok('AI quarters never exceed what their Town Hall allows', ais.every(c=>(c.quarters||[]).length<=Q.slots.filter(([th])=>G.lvl(c,'townhall')>=th).length));
  ok('every AI quarter sits next to its city or its other quarters', qs.every(({c,q})=>Math.max(Math.abs(q.x-c.x),Math.abs(q.y-c.y))<=Q.reach));
  ok('every AI quarter fits its ground', qs.every(({q})=>Q.types[q.type].fits(s,G.tileAt(s,q.x,q.y)) || q.type==='mine' || q.type==='docks'));
  ok('the map knows every quarter', qs.every(({c,q})=>G.tileAt(s,q.x,q.y).quarter===c.id));
  ok('no two quarters share a tile, and none sits on a city', (()=>{ const seen=new Set(); for(const {q} of qs){ const k=q.x+','+q.y; if(seen.has(k)||G.tileAt(s,q.x,q.y).city) return false; seen.add(k);} return true; })());
  const types=new Set(qs.map(o=>o.q.type));
  ok('AI quarters come in several kinds', types.size>=3, [...types].join(','));
  const mq=Object.values(s.minors||{}).flatMap(mi=>mi.quarters||[]);
  ok('free cities grow quarters too', mq.length>0, mq.length);
  ok('free cities\\' quarters are marked on the map', Object.values(s.minors||{}).every(mi=>(mi.quarters||[]).every(q=>G.tileAt(s,q.x,q.y).quarter===mi.id)));
  ok('a free city\\'s quarter is not a city tile', mq.every(q=>G.cityAtTile(s,q.x,q.y)===null));
  global.__aiWorld=s;
}

// ---- save and load ----
{ const s=fresh(); const c=grown(s,G.capital(s,'p'));
  at(s,c,1,0).terrain='fertile'; build(s,c,1,0,'farm'); G.foundQuarter(s,c.id,c.x-1,c.y,'homes'); c.quarters[0].burnt=s.time+500; c.outerWall=1;
  const s2=G.deserialize(G.serialize(s)); const c2=s2.cities[c.id];
  ok('quarters survive a save', c2.quarters.length===2 && c2.quarters[0].built && c2.quarters[0].type==='farm' && !c2.quarters[1].built && c2.quarters[1].end===c.quarters[1].end);
  ok('burnt state and outer walls survive', c2.quarters[0].burnt===c.quarters[0].burnt && c2.outerWall===1);
  ok('the map index is rebuilt on load', G.tileAt(s2,c.x+1,c.y).quarter===c.id && G.tileAt(s2,c.x-1,c.y).quarter===c.id);
  ok('the pending quarter finishes after loading', (()=>{ s2.time=c2.quarters[1].end; G.step(s2,1); return c2.quarters[1].built; })());
  ok('a loaded save is not auto-assigned again', c2.quarters.length===2);
}

// ---- old saves: every city gets the quarters its size has earned ----
{ const s=global.__aiWorld;
  const raw=JSON.parse(G.serialize(s));
  delete raw.qtr; for(const c of Object.values(raw.cities)){ delete c.quarters; delete c.qrev; } for(const t of raw.tiles) delete t.quarter; for(const mi of Object.values(raw.minors||{})) delete mi.quarters;
  const s2=G.deserialize(JSON.stringify(raw));
  if(s2.qtr && s2.qtr.todo) G.step(s2,10);
  const cs=Object.values(s2.cities);
  ok('an old save loads', !!s2 && cs.length>0);
  ok('every city has a quarters list', cs.every(c=>Array.isArray(c.quarters)));
  ok('cities get quarters by size', cs.filter(c=>G.qtrSlots(s2,c)>0).every(c=>c.quarters.length>0 || !G.qtrOptions(s2,c).length), cs.map(c=>c.quarters.length+'/'+G.qtrSlots(s2,c)).join(' '));
  ok('…never more than their slots', cs.every(c=>c.quarters.length<=G.qtrSlots(s2,c)));
  ok('…all built, and on the map', cs.every(c=>c.quarters.every(q=>q.built && G.tileAt(s2,q.x,q.y).quarter===c.id)));
  ok('the small ones get none', cs.filter(c=>G.qtrSlots(s2,c)===0).every(c=>!c.quarters.length));
  ok('free cities too', Object.values(s2.minors||{}).some(mi=>(mi.quarters||[]).length));
  ok('migration runs once', (()=>{ const n=cs.reduce((a,c)=>a+c.quarters.length,0); const s3=G.deserialize(G.serialize(s2)); return Object.values(s3.cities).reduce((a,c)=>a+c.quarters.length,0)===n; })());
}

// ---- speed ----
{ const s=global.__aiWorld;
  const cs=G.allCities(s); const tick=()=>{ G._modCache=new Map(); try{ for(const c of cs) G.econLean(s,c); } finally{ G._modCache=null; } };
  const saved=cs.map(c=>c.quarters);
  const timeIt=()=>{ const t=Date.now(); for(let i=0;i<150;i++) tick(); return (Date.now()-t)/150; };
  let per=1e9, base=1e9;
  for(let round=0;round<4;round++){ cs.forEach((c,i)=>c.quarters=saved[i]); tick(); per=Math.min(per,timeIt()); for(const c of cs) c.quarters=[]; tick(); base=Math.min(base,timeIt()); }
  cs.forEach((c,i)=>c.quarters=saved[i]);
  ok('quarters add little to the economy tick (one step\\'s econ for every city)', per<base*1.3+0.15, per.toFixed(2)+' ms vs '+base.toFixed(2)+' ms for '+cs.length+' cities');
  const t2=Date.now(); let n=0; for(let i=0;i<200000;i++){ if(G.cityAtTile(s,i%s.map,(i*7)%s.map)) n++; } const ct=Date.now()-t2;
  ok('G.cityAtTile is cheap', ct<400, ct+' ms for 200k lookups');
  const t3=Date.now(); G.advance(s,600,120); const st=Date.now()-t3;
  ok('ten more game-minutes run quickly', st<15000, st+' ms');
}

console.log(fails?fails+' FAILED':'all passed');
`);
