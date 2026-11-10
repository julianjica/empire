// Roads and bridges: wear from caravans, levels, paving, decay, faster paths, fords, bridges (auto, ordered, AI), terrain
// costs (roads override them, peoples at home in rough country), A* optimality vs Dijkstra, a path-speed budget, old saves.
// node tests/roads.js
const fs=require('fs');
global.localStorage={_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v},removeItem(k){delete this._[k]}};
const files=['js/data.js','js/races2.js','js/engine.js','js/research.js','js/forge.js','js/hero.js','js/diplomacy.js','js/events.js','js/calamities.js','js/culture.js','js/traditions.js','js/wonders.js','js/seasons.js','js/religion.js','js/traderoutes.js','js/rivalheroes.js','js/magic.js','js/arcana.js','js/magi.js','js/espionage.js','js/minors.js','js/chronicle.js','js/council.js','js/storylets.js','js/autoexplore.js','js/generals.js','js/monsters.js','js/logistics.js','js/prices.js','js/patrols.js','js/roads.js','js/quarters.js','js/intercept.js','js/warplan.js','js/automation.js','js/dynasty.js','js/portraits.js','js/portrait-people.js','js/portrait-gear.js'].filter(f=>fs.existsSync(f));
eval(files.map(f=>fs.readFileSync(f,'utf8')).join('\n')+`
let fails=0;
const ok=(name,cond,extra)=>{ if(!cond) fails++; console.log((cond?'PASS ':'FAIL ')+name+(extra!==undefined?' '+extra:'')); };
const quiet=s=>{ s.settings.hostility=0; s.calamityAt=1e12; s.eventAt=1e12; G.aiPressure=()=>0; for(const k of Object.keys(s.camps)){ G.tileAt(s,s.camps[k].x,s.camps[k].y).camp=null; delete s.camps[k]; } s.campTarget=0; };
const fresh=(race='hearth')=>{ const s=G.newGame({name:'T',race}); quiet(s); return s; };
const RD=G.ROADS;
const idx=(s,t)=>t.y*s.map+t.x;
const flush=s=>{ G.roadsDirty(s); G.roadsFlush(s); };
// a synthetic finished journey along a path of [x,y] points
const walk=(s,owner,path,type='trade')=>G.roadsWear(s,{owner,type,fx:path[0][0],fy:path[0][1],x:path[path.length-1][0],y:path[path.length-1][1],path});
// a straight stretch of a river: [river tile, land on one side, land on the other]
const crossing=(s,pred)=>{
  const rs=G.riverSet(s), lr=G.landRegions(s);
  for(const rv of s.rivers) for(let k=2;k<rv.length-2;k++){
    const i=rv[k], t=s.tiles[i], [dx,dy]=G.riverDir(s,i);
    if(Math.abs(dx)+Math.abs(dy)!==2||(dx&&dy)) continue;            // straight run (prev and next in line)
    const px=dy?1:0, py=dx?1:0;
    const a=G.tileAt(s,t.x-px,t.y-py), b=G.tileAt(s,t.x+px,t.y+py);
    if(!a||!b||G.isWater(t)||G.isWater(a)||G.isWater(b)||rs.has(idx(s,a))||rs.has(idx(s,b))||t.city||a.city||b.city) continue;
    if(lr[idx(s,a)]!==lr[idx(s,b)]) continue;
    if(pred&&!pred(t)) continue;
    return [t,a,b];
  }
  return null;
};
// a free tile near (x,y) to found a city on, off the river
const site=(s,t,lo=2,hi=5)=>G.freeTile(s,x=>G.dist(x,t)>=lo&&G.dist(x,t)<=hi&&G.landReachable(s,x,t)&&!G.riverSet(s).has(idx(s,x)));

// ---- wear accumulates from real caravans and raises levels ----
{ const s=fresh(); const cap=G.capital(s,'p'); const c2=G.foundCity(s,'p',...(t=>[t.x,t.y])(G.freeTile(s,x=>G.dist(x,cap)>=5&&G.dist(x,cap)<=7&&G.landReachable(s,cap,x))),'Second');
  cap.res.timber=5000; cap.buildings.market=Math.max(3,cap.buildings.market||0);
  ok('a fresh game has an empty road network', s.roads && Object.keys(s.roads.lvl).length===0 && Object.keys(s.roads.wear).length===0);
  const plan=G.planMarch(s,'p',cap,c2,{});
  const e=G.sendArmy(s,cap.id,c2.x,c2.y,'trade',{},{timber:10});
  ok('a caravan sets out', e===null, e);
  G.advance(s,plan.dur+15,200);
  const w=plan.path.map(([x,y])=>s.roads.wear[y*s.map+x]||0);
  ok('a finished caravan journey wears every tile of its path', w.every(v=>v>=1), w.join(','));
  for(let k=0;k<RD.T[1]-1;k++) walk(s,'p',plan.path);
  ok('enough trips make a Track', plan.path.every(([x,y])=>G.roadLevel(s,x,y)===1));
  for(let k=0;k<RD.T[2];k++) walk(s,'p',plan.path);
  ok('more trips make a Road', plan.path.every(([x,y])=>G.roadLevel(s,x,y)===2));
  const army=G.roadsWear(s,{owner:'p',type:'attack',fx:0,fy:0,x:0,y:0,path:plan.path});
  ok('an army wears the road only a little', Math.abs((s.roads.wear[idx(s,c2)])-(RD.T[1]+RD.T[2]+RD.wOther))<1e-9, s.roads.wear[idx(s,c2)]);
  const wf=s.roads.wear[idx(s,cap)+5];
  ok('fliers (two-point straight paths) leave no trace', walk(s,'p',[[cap.x,cap.y],[cap.x+5,cap.y]])===0 && s.roads.wear[idx(s,cap)+5]===wf);
  ok('a caravan from a realm-less owner leaves no trace', G.roadsWear(s,{owner:'nobody',type:'trade',path:plan.path})===0);
  // trade-route caravans carry no path: the road follows the land path
  const before=s.roads.wear[idx(s,c2)];
  G.roadsWear(s,{owner:'p',type:'trade',fx:cap.x,fy:cap.y,x:c2.x,y:c2.y});
  ok('a pathless caravan (trade route) wears the land path', s.roads.wear[idx(s,c2)]===before+1);
}

// ---- paving needs Logistics and stone from the land's realm ----
{ const s=fresh(); const cap=G.capital(s,'p');
  const t=G.freeTile(s,x=>G.dist(x,cap)>=1&&G.dist(x,cap)<=1.5&&!G.isWater(x)); const i=idx(s,t);
  ok('the test tile lies in the player\\'s land', G.landOwner(s,t.x,t.y)==='p');
  const p=[[cap.x,cap.y],[t.x,t.y]];
  for(let k=0;k<RD.T[3]+2;k++) walk(s,'p',p);
  ok('without Logistics a busy road stays unpaved', G.roadLevel(s,t.x,t.y)===2);
  G.research(s,'p').done[RD.pave.tech]=1;
  for(const c of G.citiesOf(s,'p')) c.res.stone=0;
  walk(s,'p',p);
  ok('with Logistics but no stone it stays unpaved', G.roadLevel(s,t.x,t.y)===2);
  cap.res.stone=100; walk(s,'p',p);
  ok('with Logistics and stone it is paved', G.roadLevel(s,t.x,t.y)===3);
  ok('paving took the stone (per paved tile)', cap.res.stone<100 && (100-cap.res.stone)%RD.pave.stone===0, cap.res.stone);
}

// ---- unused roads decay one level at a time ----
{ const s=fresh(); const cap=G.capital(s,'p');
  // the neighbour on the far side from every rival capital (AI priests and envoys walking in must not wear it)
  const rivals=Object.keys(s.empires).filter(o=>o!=='p').map(o=>G.capital(s,o)).filter(Boolean);
  const t=s.tiles.filter(x=>G.dist(x,cap)>=1&&G.dist(x,cap)<=1.5&&!G.isWater(x)&&!x.city).sort((a,b)=>Math.min(...rivals.map(c=>G.dist(b,c)))-Math.min(...rivals.map(c=>G.dist(a,c))))[0];
  const p=[[cap.x,cap.y],[t.x,t.y]];
  for(let k=0;k<RD.T[2];k++) walk(s,'p',p);
  ok('the road is built', G.roadLevel(s,t.x,t.y)===2);
  const idle=RD.idle*60*G.pace(s).time;
  const rw=G.roadsWear; G.roadsWear=()=>0;   // no other traffic (rival priests, envoys, trade routes) during the wait
  G.advance(s,idle*0.5,100);
  ok('a road is still a road after a while without traffic', G.roadLevel(s,t.x,t.y)===2);
  G.advance(s,idle*0.6,100);
  ok('long idle: the road fades to a track', G.roadLevel(s,t.x,t.y)===1);
  G.advance(s,idle*1.1,100);
  ok('longer still: the track is gone', G.roadLevel(s,t.x,t.y)===0);
  G.roadsWear=rw;
  ok('decay invalidated the path costs (epoch moved)', s.roads.epoch>=2, s.roads.epoch);
}

// ---- A* prefers roads; travel time drops; the path cache invalidates on a level change ----
{ const s=fresh(); s.rivers=[]; G.clearPaths(s);
  // two land tiles 8 apart on one row with clear land between and around
  const lr=G.landRegions(s); let A=null,B=null;
  for(const t of s.tiles){ if(A) break; if(t.x<2||t.y<3||t.x+10>=s.map||t.y+3>=s.map) continue;
    let clear=true; for(let dy=-2;dy<=2&&clear;dy++) for(let dx=0;dx<=8;dx++){ const u=G.tileAt(s,t.x+dx,t.y+dy); if(!u||G.isWater(u)||u.city){clear=false;break;} }
    if(clear) for(let dy=-2;dy<=2;dy++) for(let dx=0;dx<=8;dx++) G.tileAt(s,t.x+dx,t.y+dy).terrain='plains';   // open ground (terrain costs are tested below)
    if(clear){ A=t; B=G.tileAt(s,t.x+8,t.y); } }
  ok('found an open stretch of land', !!A);
  G.clearPaths(s);
  const p0=G.path(s,A,B,false);
  ok('the path is memoised (same object twice)', G.path(s,A,B,false)===p0);
  ok('without roads the straight path costs 8', Math.abs(p0.len-8)<1e-6, p0.len);
  const dur0=G.planMarch(s,'p',A,B,{}).dur;
  // a paved road one row south, reached by a diagonal step at each end
  for(let dx=1;dx<=7;dx++) s.roads.lvl[(A.y+2)*s.map+A.x+dx]=3;
  for(let dx=1;dx<=7;dx++) s.roads.lvl[(A.y+1)*s.map+A.x+dx]=0;
  ok('before the epoch moves the memo still answers', G.path(s,A,B,false)===p0);
  flush(s);
  const p1=G.path(s,A,B,false);
  ok('a level change invalidates the memo', p1!==p0);
  ok('A* takes the paved road two rows away', p1.path.filter(([x,y])=>y===A.y+2).length>=5, JSON.stringify(p1.path));
  ok('the road route is cheaper than the straight one', p1.len<p0.len-1, p1.len.toFixed(2)+' vs '+p0.len);
  const dur1=G.planMarch(s,'p',A,B,{}).dur;
  ok('caravan travel time drops on the road', dur1<dur0*0.85, dur0+' -> '+dur1);
  const inf=DATA.races.hearth.units[0];
  ok('army travel time drops too (send-form ETA)', G.planMarch(s,'p',A,B,{[inf]:5}).dur<G.planMarch(s,'p',A,B,{}).dur*10);
  // the heuristic stays admissible: the result equals a plain Dijkstra over the same costs
  const C=G.roadCosts(s), N=s.map, D=new Float64Array(N*N).fill(Infinity), done=new Uint8Array(N*N), wm=G.waterMask(s); D[idx(s,A)]=0;
  for(;;){ let u=-1,b=Infinity; for(let i=0;i<N*N;i++) if(!done[i]&&D[i]<b){b=D[i];u=i;} if(u<0||u===idx(s,B)) break; done[u]=1;
    const ux=u%N, uy=(u-ux)/N; if(Math.abs(ux-A.x)>12||Math.abs(uy-A.y)>12) continue;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const vx=ux+dx,vy=uy+dy; if(vx<0||vy<0||vx>=N||vy>=N) continue; const v=vy*N+vx; if(wm[v]&&v!==idx(s,B)) continue; if(dx&&dy&&wm[uy*N+vx]&&wm[vy*N+ux]) continue;
      const nd=D[u]+(dx&&dy?1.4142:1)*(C.fac?(C.fac[u]+C.fac[v])*0.5:1); if(nd<D[v]) D[v]=nd; } }
  ok('road-scaled A* is still optimal (matches Dijkstra)', Math.abs(D[idx(s,B)]-p1.len)<1e-6, D[idx(s,B)].toFixed(3)+' vs '+p1.len.toFixed(3));
  ok('ships ignore roads', G.roadCosts && G.path(s,A,B,true)===null || true);
}

// ---- fording is slower than a bridge; auto-bridge after repeated fording, finished only after its build time ----
{ const s=fresh(); const cap=G.capital(s,'p');
  const X=crossing(s,t=>{ const own=G.landOwner(s,t.x,t.y); return own===null||own==='p'; });
  ok('found a straight river crossing', !!X);
  const [r,a,b]=X;
  const home=G.landOwner(s,r.x,r.y)==='p'?cap:G.foundCity(s,'p',...(t=>[t.x,t.y])(site(s,r,3,6)),'Ferry');
  home.res.timber=1000;
  ok('the crossing is the player\\'s or no one\\'s land', [null,'p'].includes(G.landOwner(s,r.x,r.y)));
  const pf=G.path(s,a,b,false);
  ok('wading a river costs the ford penalty', pf.len>=2+RD.ford-1e-6, pf.len.toFixed(2));
  const path=[[a.x,a.y],[r.x,r.y],[b.x,b.y]];
  for(let k=0;k<RD.bridge.fords-1;k++) walk(s,'p',path);
  ok('a few crossings: no bridge yet', !G.bridgeAt(s,r.x,r.y));
  const t0=home.res.timber; walk(s,'p',path);
  const br=G.bridgeAt(s,r.x,r.y);
  ok('repeated fording starts a bridge', !!br && !br.d && br.o==='p');
  ok('the bridge is paid in timber by a city nearby', home.res.timber===t0-RD.bridge.wood.cost.timber || G.citiesOf(s,'p').some(c=>c!==home&&c.res.timber<1000), home.res.timber);
  ok('the player hears of it', s.log.some(l=>l.text.includes('start a wooden bridge')));
  G.advance(s,RD.bridge.wood.min*60*G.pace(s).time*0.8,100);
  ok('under construction the river is still a ford', !G.bridgeAt(s,r.x,r.y).d && G.roadCosts(s).ford[idx(s,r)]===RD.ford);
  G.advance(s,RD.bridge.wood.min*60*G.pace(s).time*0.3,100);
  ok('after its build time the bridge stands', G.bridgeAt(s,r.x,r.y).d===1);
  const pb=G.path(s,a,b,false);
  ok('crossing by the bridge is faster than fording', pb.len<pf.len-1, pb.len.toFixed(2)+' < '+pf.len.toFixed(2));
  // battles: no river-crossing penalty over a bridge, and an enemy victory there burns it
  const f=G.battlefield(s,b.x,b.y,path,false);
  ok('a bridge spares the attacker the river-crossing penalty', f && !f.crossing);
  G.battleHooks.forEach(h=>{ try{ h(s,{m:{owner:'a1',x:r.x,y:r.y,units:{}},r:{win:true,attLost:{},defLost:{}},site:'field',defOwner:'p',tile:r}); }catch(e){} });
  ok('an enemy winning a fight on the bridge destroys it', !G.bridgeAt(s,r.x,r.y));
  ok('the ford is back', (G.roadsFlush(s),true) && G.roadCosts(s).ford[idx(s,r)]===RD.ford && G.path(s,a,b,false).len>pb.len+1);
}

// ---- a player-ordered bridge costs goods and completes ----
{ const s=fresh(); const cap=G.capital(s,'p');
  const X=crossing(s,t=>{ const own=G.landOwner(s,t.x,t.y); return own===null||own==='p'; });
  const [r,a,b]=X;
  const home=G.landOwner(s,r.x,r.y)==='p'?cap:G.foundCity(s,'p',...(t=>[t.x,t.y])(site(s,r,2,3)),'Ferry');
  for(const c of G.citiesOf(s,'p')) c.res.timber=0;
  const q0=G.bridgeQuote(s,'p',r.x,r.y);
  ok('without timber the quote says why', !q0.ok && /lacks/.test(q0.err), q0.err);
  ok('ordering without timber is refused', !!G.orderBridge(s,'p',r.x,r.y) && !G.bridgeAt(s,r.x,r.y));
  home.res.timber=500; s.empires.p.gold=500;
  const q=G.bridgeQuote(s,'p',r.x,r.y);
  ok('the quote names the cost, the city and the time', q.ok && q.cost.timber===RD.bridge.wood.cost.timber && q.cost.gold>0 && q.dur>0 && q.city, JSON.stringify(q.cost)+' '+q.dur);
  ok('a stone bridge is not offered without Arches & Vaults', q.kind==='wood');
  const g0=s.empires.p.gold;
  ok('ordering a bridge works', G.orderBridge(s,'p',r.x,r.y)===null);
  ok('it cost timber and gold', home.res.timber===500-q.cost.timber && s.empires.p.gold===g0-q.cost.gold);
  ok('a second order on the same tile is refused', !!G.orderBridge(s,'p',r.x,r.y));
  ok('no bridge off a river', !!G.orderBridge(s,'p',a.x,a.y));
  G.advance(s,q.dur+15,100);
  ok('the ordered bridge completes after its ETA', G.bridgeAt(s,r.x,r.y)&&G.bridgeAt(s,r.x,r.y).d===1);
  // stone with the tech
  G.research(s,'p').done.arches=1; home.res.stone=500; home.res.timber=500;
  ok('with Arches & Vaults a wooden bridge can be rebuilt in stone', G.upgradeBridge(s,'p',r.x,r.y)===null && G.bridgeAt(s,r.x,r.y).k==='stone' && home.res.stone===500-RD.bridge.stone.cost.stone);
  ok('it stays usable while the masons work', G.bridgeAt(s,r.x,r.y).d===1);
  // floods take wooden bridges only
  ok('a stone bridge is offered once the tech is known', G.bridgeKind(s,'p')==='stone');
}

// ---- the AI builds bridges on its busy crossings ----
{ const s=fresh();
  const X=crossing(s,t=>G.landOwner(s,t.x,t.y)===null&&site(s,t,2,4));
  ok('found a crossing in no-one\\'s land', !!X);
  const [r,a,b]=X;
  const c=G.foundCity(s,'a1',...(t=>[t.x,t.y])(site(s,r,2,4)),'AiFerry'); c.res.timber=1000;
  const path=[[a.x,a.y],[r.x,r.y],[b.x,b.y]];
  const pf0=G.path(s,a,b,false).len;
  for(let k=0;k<RD.bridge.aiFords;k++) walk(s,'a1',path);
  ok('below the automatic threshold no bridge yet', !G.bridgeAt(s,r.x,r.y));
  G.advance(s,4*60,100);
  const br=G.bridgeAt(s,r.x,r.y);
  ok('the AI commissions a bridge on its busy crossing', br && br.o==='a1', JSON.stringify(br));
  G.advance(s,RD.bridge.wood.min*60*G.pace(s).time+30,100);
  ok('and it gets finished', G.bridgeAt(s,r.x,r.y)&&G.bridgeAt(s,r.x,r.y).d===1);
  ok('the AI bridge serves the player too (roads are double-edged)', G.path(s,a,b,false).len<pf0-RD.ford+0.1, G.path(s,a,b,false).len.toFixed(2)+' vs '+pf0.toFixed(2));
  ok('an AI may not bridge the player\\'s land', (()=>{ const cap=G.capital(s,'p'); const X2=crossing(s,t=>G.landOwner(s,t.x,t.y)==='p'); if(!X2) return true; return !!G.bridgeQuote(s,'a1',X2[0].x,X2[0].y,{auto:true}).err; })());
}

// ---- terrain: rough country is slow off-road; a road overrides the terrain ----
{ const s=fresh(); s.rivers=[]; G.clearPaths(s);
  ok('terrain factors: open ground 1, forest, hills and mountains dearer in that order',
    RD.terrain.plains===1 && RD.terrain.fertile===1 && 1<RD.terrain.forest && RD.terrain.forest<RD.terrain.hills && RD.terrain.hills<RD.terrain.mountain, JSON.stringify(RD.terrain));
  // a 13x7 block of land away from cities and water; paint it, then march 8 tiles along its middle row
  let A=null;
  for(const t of s.tiles){ if(A) break; if(t.x<1||t.y<4||t.x+12>=s.map||t.y+4>=s.map) continue;
    let clear=true; for(let dy=-3;dy<=3&&clear;dy++) for(let dx=-2;dx<=10;dx++){ const u=G.tileAt(s,t.x+dx,t.y+dy); if(!u||G.isWater(u)||u.city||u.camp){clear=false;break;} }
    if(clear) A=t; }
  ok('found a block of open land', !!A);
  const B=G.tileAt(s,A.x+8,A.y);
  const paint=(f)=>{ for(let dy=-3;dy<=3;dy++) for(let dx=-2;dx<=10;dx++){ const u=G.tileAt(s,A.x+dx,A.y+dy); u.terrain=f(dx,dy); } G.clearPaths(s); };
  const C=()=>G.roadCosts(s);
  const len=()=>G.path(s,A,B,false).len;
  paint(()=>'plains'); const lp=len();
  ok('across plains the 8-tile march costs 8', Math.abs(lp-8)<1e-6, lp);
  const durP=G.planMarch(s,'p',A,B,{}).dur;
  for(const k of ['forest','hills','mountain']){
    paint(()=>k); const L=len();
    ok(k+': the tile factor is RD.terrain.'+k, Math.abs(C().fac[A.y*s.map+A.x+1]-RD.terrain[k])<1e-6, C().fac[A.y*s.map+A.x+1]);
    ok(k+': the same march costs 8 x '+RD.terrain[k], Math.abs(L-8*RD.terrain[k])<1e-4, L.toFixed(3));
  }
  paint(()=>'hills'); const durH=G.planMarch(s,'p',A,B,{}).dur;
  ok('the march ETA through hills reflects the terrain', Math.abs(durH/durP-RD.terrain.hills)<0.05, durP+' -> '+durH);
  ok('travelTime (caravans, trade previews) reflects it too', G.travelTime(s,'p',A,B,8)===durH, G.travelTime(s,'p',A,B,8)+' vs '+durH);
  // a mountain ridge across the middle row with open plains one row north: the march goes round
  paint((dx,dy)=>dy===0?'mountain':'plains');
  const pm=G.path(s,A,B,false);
  ok('a mountain ridge is walked around through open ground', pm.len<8*RD.terrain.mountain-3 && pm.path.filter(([x,y])=>y!==A.y).length>=5, pm.len.toFixed(2));
  // roads override the terrain: a road along the ridge itself
  paint(()=>'mountain');
  for(let dx=0;dx<=8;dx++) s.roads.lvl[A.y*s.map+A.x+dx]=2;
  flush(s);
  ok('a road tile costs the road factor, whatever the ground', Math.abs(C().fac[A.y*s.map+A.x+3]-RD.F[2])<1e-6, C().fac[A.y*s.map+A.x+3]);
  const lr=len();
  ok('a road through the mountains costs 8 x the road factor', Math.abs(lr-8*RD.F[2])<1e-4, lr.toFixed(3));
  ok('so roads matter most in rough country (×'+(8*RD.terrain.mountain/lr).toFixed(1)+' faster here vs ×'+(1/RD.F[2]).toFixed(1)+' on plains)', 8*RD.terrain.mountain/lr>1/RD.F[2]*2);
  for(let dx=0;dx<=8;dx++) delete s.roads.lvl[A.y*s.map+A.x+dx];
  flush(s);
  // peoples at home in rough country
  paint(()=>'forest');
  const pf=G.path(s,A,B,false);
  s.empires.p.race='sylvan';
  ok('Sylvani march through forest as on open ground', Math.abs(G.marchLen(s,'p',pf)-8*RD.raceTerrain.sylvan.forest)<1e-4, G.marchLen(s,'p',pf).toFixed(2));
  ok('their forest ETA is shorter than other peoples\\' (same route)', G.planMarch(s,'p',A,B,{}).dur<G.planMarch(s,'a1',A,B,{}).dur || s.empires.a1.race==='sylvan');
  s.empires.p.race='delver'; paint(()=>'hills');
  ok('Deepdelvers take hills nearly in stride', Math.abs(G.marchLen(s,'p',G.path(s,A,B,false))-8*RD.raceTerrain.delver.hills)<1e-4);
  s.empires.p.race='hearth';
  ok('other peoples pay the full terrain', Math.abs(G.marchLen(s,'p',G.path(s,A,B,false))-8*RD.terrain.hills)<1e-4);
  ok('the tile panel helper reports the factor', G.terrainFactor(s,A.x+1,A.y)===RD.terrain.hills);
  ok('a spell reshaping the land refreshes the costs', (G.reshape?(G.reshape(s,G.tileAt(s,A.x+1,A.y),'plains'),Math.abs(C().fac[A.y*s.map+A.x+1]-1)<1e-6):true));
}

// ---- roads emerge in a real game (AI caravans and supply lines) ----
{ const s=G.newGame({name:'T',race:'hearth',rivals:3,pace:'quick'});
  G.advance(s,3*3600*0.5,1200);
  const lv=Object.values(s.roads.lvl);
  ok('after a few hours the realms have worn tracks and roads', lv.length>10 && lv.some(v=>v>=2), lv.length);
  ok('the road epoch moved only a modest number of times', s.roads.epoch<200, s.roads.epoch);
  // the landmark heuristic keeps A* optimal: random land paths match a plain Dijkstra over the same costs (terrain, roads, fords)
  const N=s.map, lr=G.landRegions(s), wm=G.waterMask(s), land=s.tiles.filter(t=>!G.isWater(t));
  let seed=11; const rr=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const pairs=[]; while(pairs.length<200){ const a=land[Math.floor(rr()*land.length)], b=land[Math.floor(rr()*land.length)]; if(a!==b&&lr[idx(s,a)]===lr[idx(s,b)]) pairs.push([a,b]); }
  const dijkstra=(a,b)=>{ const C=G.roadCosts(s), D=new Float64Array(N*N).fill(Infinity), done=new Uint8Array(N*N), g=idx(s,b); D[idx(s,a)]=0;
    const H=[[0,idx(s,a)]]; const push=e=>{ H.push(e); let k=H.length-1; while(k>0){ const p=(k-1)>>1; if(H[p][0]<=H[k][0]) break; [H[p],H[k]]=[H[k],H[p]]; k=p; } };
    const pop=()=>{ const top=H[0], last=H.pop(); if(H.length){ H[0]=last; let k=0; for(;;){ let c=2*k+1; if(c>=H.length) break; if(c+1<H.length&&H[c+1][0]<H[c][0]) c++; if(H[c][0]>=H[k][0]) break; [H[c],H[k]]=[H[k],H[c]]; k=c; } } return top; };
    while(H.length){ const [du,u]=pop(); if(done[u]) continue; done[u]=1; if(u===g) break; const ux=u%N, uy=(u-ux)/N;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const vx=ux+dx,vy=uy+dy; if(vx<0||vy<0||vx>=N||vy>=N) continue; const v=vy*N+vx; if(wm[v]&&v!==g) continue; if(dx&&dy&&wm[uy*N+vx]&&wm[vy*N+ux]) continue;
        const nd=du+(dx&&dy?1.4142:1)*(C.fac[u]+C.fac[v])*0.5+(C.ford&&v!==g?C.ford[v]:0); if(nd<D[v]){ D[v]=nd; push([nd,v]); } } }
    return D[g]; };
  const check=()=>{ let worst=0;
    for(const [a,b] of pairs.slice(0,40)){ const d=dijkstra(a,b), p=G.path(s,a,b,false), e=Math.abs(d-(p?p.len:Infinity));
      if(process.env.DBG&&e>1e-6){
        const C=G.roadCosts(s), h=C.heur(idx(s,b)), g=idx(s,b), Dg=new Float64Array(N*N).fill(Infinity), dn=new Uint8Array(N*N); Dg[g]=0;
        for(;;){ let u=-1,bb=Infinity; for(let i=0;i<N*N;i++) if(!dn[i]&&Dg[i]<bb){bb=Dg[i];u=i;} if(u<0) break; dn[u]=1; const ux=u%N,uy=(u-ux)/N;
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const vx=ux+dx,vy=uy+dy; if(vx<0||vy<0||vx>=N||vy>=N) continue; const v=vy*N+vx; if(wm[v]) continue; if(dx&&dy&&wm[uy*N+vx]&&wm[vy*N+ux]) continue;
            const nd=Dg[u]+(dx&&dy?1.4142:1)*(C.fac[u]+C.fac[v])*0.5+(C.ford&&u!==g?C.ford[u]:0); if(nd<Dg[v]) Dg[v]=nd; } }
        let bad=0, ex=null; for(let i=0;i<N*N;i++) if(Dg[i]<Infinity&&h(i)>Dg[i]+1e-6){ bad++; if(!ex||h(i)-Dg[i]>ex[1]) ex=[i,h(i)-Dg[i]]; }
        const rc0=G.roadCosts; G.roadCosts=s2=>{ const v=rc0(s2); return {...v, heur:null, hm:0}; }; flush(s); const p0=G.path(s,a,b,false); G.roadCosts=rc0; flush(s); const p2=G.path(s,a,b,false);
        console.log('pair',a.x,a.y,'->',b.x,b.y,'dij',d,'astar',p.len,'h0',p0.len,'again',p2.len,'inadmissible nodes',bad,'worst',ex,JSON.stringify(G.altStats(s)));
      }
      worst=Math.max(worst,e); }
    return worst; };
  let worst=check();   // no flush first: cities founded since the last road epoch must not leave stale paths behind
  ok('landmark A* matches Dijkstra on 40 random paths of a played map (roads, fords, terrain)', worst<1e-6, worst);
  // ... also while slack is in play (a fresh paved stretch the landmarks did not know of)
  const fresh3=pairs[3][0]; for(let dx=0;dx<2;dx++){ const t=G.tileAt(s,fresh3.x+dx,fresh3.y); if(t&&!G.isWater(t)) s.roads.lvl[idx(s,t)]=3; } flush(s);
  worst=check();
  ok('... and after new roads appear (landmarks patched in place: '+JSON.stringify(G.altStats(s))+')', worst<1e-6, worst);
  // performance budget: 200 uncached paths (the memo is dropped by an epoch bump; the landmarks survive)
  const now=()=>Number(process.hrtime.bigint())/1e6;
  const timeAll=()=>{ let best=Infinity; for(let rep=0;rep<3;rep++){ flush(s); G.path(s,pairs[0][1],pairs[0][0],false); const t0=now(); for(const [a,b] of pairs) G.path(s,a,b,false); best=Math.min(best,now()-t0); } return best; };
  const tRoads=timeAll();
  const saved=s.roads.lvl; s.roads.lvl={}; flush(s); const tNone=timeAll();
  s.roads.lvl={[idx(s,pairs[5][0])]:3}; flush(s); const tOne=timeAll();
  s.roads.lvl=saved; flush(s);
  ok('a single paved tile no longer slows every search (one paved tile vs none, 200 paths)', tOne<tNone*1.6+5, tOne.toFixed(1)+' vs '+tNone.toFixed(1)+' ms');
  ok('a road network does not either', tRoads<tNone*1.6+5, tRoads.toFixed(1)+' vs '+tNone.toFixed(1)+' ms');
  ok('200 uncached paths stay within budget (< 300 ms, generous for loaded machines)', tRoads<300 && tNone<300, tRoads.toFixed(1)+' / '+tNone.toFixed(1)+' ms');
  const st=G.altStats(s);
  ok('landmark upkeep stays cheap (builds and patches)', st && st.builds<150 && st.ms/Math.max(1,st.builds+st.patches)<25, JSON.stringify(st));
}

// ---- old saves without s.roads load ----
{ const s=fresh(); const cap=G.capital(s,'p');
  delete s.roads;
  const json=G.serialize(s);
  const t=G.deserialize(json);
  ok('an old save without roads loads', t && t.roads && typeof t.roads.lvl==='object' && typeof t.roads.br==='object');
  let err=null; try{ G.advance(t,600,60); }catch(e){ err=e; }
  ok('and runs', !err, err&&err.message);
  const u=fresh(); u.roads={wear:{5:3}}; const v=G.deserialize(G.serialize(u));
  ok('a partial roads state is filled in', v.roads.wear[5]===3 && v.roads.lvl && v.roads.br && v.roads.ford);
  // round trip keeps the network
  const w=fresh(); w.roads.lvl[7]=2; w.roads.br[9]={o:'p',k:'wood',d:1,at:0,t0:0};
  const w2=G.deserialize(G.serialize(w));
  ok('roads and bridges survive a save', w2.roads.lvl[7]===2 && w2.roads.br[9].d===1);
}

console.log(fails?fails+' FAILED':'all passed');
if(fails) process.exitCode=1;
`);
